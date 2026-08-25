'use strict';

// Active invulnerable profit targets are approached in two phases.
//
// While protection has plenty of time left there is nothing to gain from
// standing inside the opponent's effective danger band: no shot can land, and
// every incoming bullet either costs dodge stamina or lands a hit that can end
// the visit early. The measured danger band is the distance where bullet flight
// time drops below the reaction budget (bullet speed 500cm per 50ms tick, so
// 5500cm is roughly the 550ms budget). The wait station therefore sits well
// outside that band while staying inside our own attack range, so the first
// shot can be requested the moment protection clears.
//
// Closing to combat spacing is then scheduled from a measured ETA instead of a
// fixed slack: cover the remaining travel just as protection expires. A risk
// budget (5s stamina, self HP, unavoidable-shot pressure) keeps the approach in
// the wait band when the exchange we would enter is not affordable.
//
// A caller that retains `state` between frames also gets the anti-oscillation
// half of the policy, because the raw ETA is not stable enough to switch on
// directly: a jinking opponent's instantaneous radial velocity flips sign every
// frame, which would flip the close ETA, the phase, and therefore the commanded
// spacing. Three devices remove that: the radial-away estimate is smoothed over
// `radialSmoothingMs` from a stationary start, the ETA must hold for
// `closeConfirmFrames` consecutive frames, and a confirmed approach latches for
// the rest of the protection period so only the risk budget can send it back to
// the station. A stateless caller keeps the plain single-frame semantics.
const DEFAULT_INVULNERABLE_APPROACH_WINDOW = Object.freeze({
  waitDistanceCm: 11000,
  waitHysteresisCm: 1000,
  minWaitDistanceCm: 10000,
  maxWaitDistanceCm: 12000,
  engagementDistanceCm: 6500,
  selfSpeedCmPerSec: 990,
  closingSafetyFactor: 0.8,
  closingSpeedFloorCmPerSec: 200,
  closeMarginMs: 1500,
  serverTickMs: 50,
  riskMinStamina5sMilli: 3000,
  riskMinSelfHp: 60,
  riskMaxUnavoidableShotFrames: 2,
  radialSmoothingMs: 2000,
  closeConfirmFrames: 2,
  stateMaxAgeMs: 3000,
  protectionResetMs: 2000
});

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function configNumber(options, key, minimum = 0) {
  const value = finiteNumber(options?.[`invulnerableApproach${key[0].toUpperCase()}${key.slice(1)}`]);
  const fallback = DEFAULT_INVULNERABLE_APPROACH_WINDOW[key];
  return Math.max(minimum, value === null ? fallback : value);
}

function resolveWaitDistanceCm(input, options = {}) {
  const min = configNumber(options, 'minWaitDistanceCm');
  const max = Math.max(min, configNumber(options, 'maxWaitDistanceCm'));
  const requested = finiteNumber(input?.waitDistanceCm)
    ?? finiteNumber(options?.invulnerableApproachWaitDistanceCm)
    ?? finiteNumber(options?.invulnerableActiveProfitApproachDistanceCm)
    ?? DEFAULT_INVULNERABLE_APPROACH_WINDOW.waitDistanceCm;
  return Math.min(max, Math.max(min, Math.max(0, requested)));
}

// Signed radial component of the target's own motion: positive away from us,
// negative closing. `vx`/`vy` are per server tick, matching the realtime entity
// contract used by the movement planner.
function targetRadialSpeedCmPerSec(input, serverTickMs) {
  const self = input?.self;
  const target = input?.target;
  const vx = finiteNumber(target?.vx) ?? 0;
  const vy = finiteNumber(target?.vy) ?? 0;
  if (!self || !target || (!vx && !vy)) return 0;
  const rx = finiteNumber(target.x) === null || finiteNumber(self.x) === null
    ? null
    : Number(target.x) - Number(self.x);
  const ry = finiteNumber(target.y) === null || finiteNumber(self.y) === null
    ? null
    : Number(target.y) - Number(self.y);
  if (rx === null || ry === null) return 0;
  const separation = Math.hypot(rx, ry);
  if (!(separation > 0)) return 0;
  const radialPerTick = (rx * vx + ry * vy) / separation;
  return radialPerTick * (1000 / Math.max(1, serverTickMs));
}

// A stateless caller sees the instantaneous away component, exactly as before.
// A stateful caller sees an exponential average that starts from "not fleeing"
// and needs sustained flight to grow, so one jink frame cannot move the ETA.
function resolveRadialAwayCmPerSec(input, options, previous, stateTracked) {
  const serverTickMs = configNumber(options, 'serverTickMs', 1);
  const sample = targetRadialSpeedCmPerSec(input, serverTickMs);
  if (!stateTracked) return { value: Math.max(0, sample), sample, smoothed: false };
  const smoothingMs = configNumber(options, 'radialSmoothingMs');
  const previousValue = previous === null ? null : finiteNumber(previous.radialAwayCmPerSec);
  const base = previousValue === null ? 0 : previousValue;
  if (!(smoothingMs > 0)) return { value: sample, sample, smoothed: true };
  const atMs = finiteNumber(input?.atMs);
  const previousAtMs = previous === null ? null : finiteNumber(previous.atMs);
  const stepMs = atMs !== null && previousAtMs !== null && atMs > previousAtMs
    ? atMs - previousAtMs
    : serverTickMs;
  const alpha = Math.max(0, Math.min(1, stepMs / smoothingMs));
  return { value: base + alpha * (sample - base), sample, smoothed: true };
}

function resolveClosingSpeedCmPerSec(input, options = {}, radialAwayCmPerSec = 0) {
  const selfSpeed = configNumber(options, 'selfSpeedCmPerSec', 1);
  const floor = Math.min(selfSpeed, configNumber(options, 'closingSpeedFloorCmPerSec', 1));
  const observed = finiteNumber(input?.observedClosingSpeedCmPerSec);
  if (observed !== null && observed > 0) {
    return Math.min(selfSpeed, Math.max(floor, observed));
  }
  const away = finiteNumber(radialAwayCmPerSec) ?? 0;
  const safety = Math.max(0.1, Math.min(1, configNumber(options, 'closingSafetyFactor', 0.1)));
  return Math.min(selfSpeed, Math.max(floor, (selfSpeed - away) * safety));
}

// Retained state is only inherited inside one protection period of one target.
// A countdown that rises is a new protection, and a stale gap means frames were
// lost, so both start the smoothing, confirmation, and latch again.
function resolvePreviousState(input, options = {}) {
  const previous = input?.previous;
  if (!previous || typeof previous !== 'object') return null;
  const atMs = finiteNumber(input?.atMs);
  const previousAtMs = finiteNumber(previous.atMs);
  if (atMs !== null && previousAtMs !== null) {
    if (atMs < previousAtMs) return null;
    if (atMs - previousAtMs > configNumber(options, 'stateMaxAgeMs')) return null;
  }
  const remainingMs = finiteNumber(input?.remainingMs);
  const previousRemainingMs = finiteNumber(previous.remainingMs);
  if (remainingMs !== null && previousRemainingMs !== null
    && remainingMs > previousRemainingMs + configNumber(options, 'protectionResetMs')) return null;
  return previous;
}

function resolveRiskBudget(input, options = {}) {
  const reasons = [];
  const minStamina = configNumber(options, 'riskMinStamina5sMilli');
  const minSelfHp = configNumber(options, 'riskMinSelfHp');
  const maxUnavoidable = configNumber(options, 'riskMaxUnavoidableShotFrames');
  const stamina = finiteNumber(input?.stamina5sRemainingMilli);
  const selfHp = finiteNumber(input?.selfHp);
  const unavoidableFrames = Math.max(0, finiteNumber(input?.unavoidableShotFrames) ?? 0);
  if (stamina !== null && stamina < minStamina) reasons.push('stamina-5s-below-approach-reserve');
  if (selfHp !== null && selfHp < minSelfHp) reasons.push('self-hp-below-approach-floor');
  if (input?.unavoidableCurrentShot === true) reasons.push('unavoidable-current-shot');
  else if (unavoidableFrames > maxUnavoidable) reasons.push('recent-unavoidable-shots');
  return { ok: reasons.length === 0, reasons };
}

function inactive(reason, extra = {}) {
  return {
    active: false,
    phase: 'inactive',
    hold: false,
    separate: false,
    approach: false,
    waitDistanceCm: null,
    hysteresisCm: null,
    holdFloorCm: null,
    releaseDistanceCm: null,
    closingSpeedCmPerSec: null,
    closeEtaMs: null,
    triggerRemainingMs: null,
    remainingMs: null,
    radialAwayCmPerSec: null,
    radialSampleCmPerSec: null,
    closeConfirmFrames: 0,
    closeConfirmRequired: 0,
    closingLatched: false,
    state: null,
    riskBudget: { ok: true, reasons: [] },
    reason,
    ...extra
  };
}

function invulnerableApproachWindowCore(input = {}, options = {}) {
  if (input.invulnerable !== true) return inactive('not-invulnerable');
  if (input.targetActive !== true) return inactive('target-not-active');
  const distanceCm = finiteNumber(input.distanceCm);
  if (distanceCm === null || distanceCm < 0) return inactive('unknown-distance');

  const waitDistanceCm = resolveWaitDistanceCm(input, options);
  const hysteresisCm = configNumber(options, 'waitHysteresisCm');
  const holdFloorCm = Math.max(0, waitDistanceCm - hysteresisCm);
  const releaseDistanceCm = waitDistanceCm + hysteresisCm;
  const engagementDistanceCm = Math.min(waitDistanceCm, configNumber(options, 'engagementDistanceCm'));
  const stateTracked = input.stateTracked === true;
  const previous = stateTracked ? resolvePreviousState(input, options) : null;
  const radial = resolveRadialAwayCmPerSec(input, options, previous, stateTracked);
  const closingSpeedCmPerSec = resolveClosingSpeedCmPerSec(input, options, radial.value);
  const closeEtaMs = Math.round(
    Math.max(0, waitDistanceCm - engagementDistanceCm) / closingSpeedCmPerSec * 1000
  );
  const triggerRemainingMs = closeEtaMs + configNumber(options, 'closeMarginMs');
  const rawRemainingMs = finiteNumber(input.remainingMs);
  // A negative value is the protocol's "invulnerable, duration unknown" state.
  const remainingMs = rawRemainingMs === null || rawRemainingMs < 0 ? null : rawRemainingMs;
  const riskBudget = resolveRiskBudget(input, options);

  const etaTriggered = remainingMs !== null && remainingMs <= triggerRemainingMs;
  const closeConfirmRequired = stateTracked
    ? Math.max(1, Math.round(configNumber(options, 'closeConfirmFrames', 1)))
    : 1;
  const previousConfirmFrames = previous === null
    ? 0
    : Math.max(0, finiteNumber(previous.closeConfirmFrames) ?? 0);
  const closeConfirmFrames = etaTriggered
    ? Math.min(closeConfirmRequired, previousConfirmFrames + 1)
    : 0;
  const closingLatched = previous !== null && previous.closing === true;
  const closeConfirmed = closingLatched || closeConfirmFrames >= closeConfirmRequired;
  const closing = closeConfirmed && riskBudget.ok;
  const phase = closing ? 'closing' : 'wait';
  const reason = closing
    ? 'invulnerable-close-eta-reached'
    : (closeConfirmed
      ? 'invulnerable-close-risk-budget-hold'
      : (remainingMs === null
        ? 'invulnerable-unknown-remaining-hold'
        : 'invulnerable-wait-station-hold'));

  const separate = phase === 'wait' && distanceCm < holdFloorCm;
  const approach = phase === 'wait' && distanceCm > releaseDistanceCm;
  return {
    active: true,
    phase,
    hold: phase === 'wait' && !separate && !approach,
    separate,
    approach,
    waitDistanceCm,
    hysteresisCm,
    holdFloorCm,
    releaseDistanceCm,
    engagementDistanceCm,
    distanceCm: Math.round(distanceCm),
    closingSpeedCmPerSec: Math.round(closingSpeedCmPerSec),
    closeEtaMs,
    triggerRemainingMs,
    remainingMs: remainingMs === null ? null : Math.round(remainingMs),
    radialAwayCmPerSec: Math.round(radial.value),
    radialSampleCmPerSec: Math.round(radial.sample),
    closeConfirmFrames,
    closeConfirmRequired,
    closingLatched,
    // The latch is only stored once the approach is actually confirmed, so a
    // first tracked frame cannot lock the rest of the protection period in.
    state: stateTracked
      ? {
        atMs: finiteNumber(input.atMs),
        remainingMs: remainingMs === null ? null : Math.round(remainingMs),
        radialAwayCmPerSec: radial.value,
        closeConfirmFrames,
        closing: closeConfirmFrames >= closeConfirmRequired || closingLatched
      }
      : null,
    riskBudget,
    reason
  };
}

module.exports = {
  DEFAULT_INVULNERABLE_APPROACH_WINDOW,
  invulnerableApproachWindowCore
};
