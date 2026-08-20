'use strict';

const ATTACK_TIMER_STATES = Object.freeze({
  NOT_APPLICABLE: 'not-applicable',
  PROTECTED: 'protected',
  UNKNOWN: 'unknown',
  ATTACKABLE: 'attackable'
});

const REMAINING_MS_FIELDS = [
  'invulnerableRemainingMs',
  'invulnerable_remaining_ms',
  'invulnerabilityRemainingMs',
  'invulnerability_remaining_ms'
];
const REMAINING_TICK_FIELDS = [
  'invulnerableRemainingTicks',
  'invulnerable_remaining_ticks',
  'invulnerabilityRemainingTicks',
  'invulnerability_remaining_ticks'
];

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function ownValue(object, fields) {
  for (const field of fields) {
    if (object && Object.prototype.hasOwnProperty.call(object, field)
      && object[field] !== null && object[field] !== undefined && object[field] !== '') {
      return object[field];
    }
  }
  return undefined;
}

function rawBoolean(object, fields) {
  const value = ownValue(object, fields);
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = String(value).toLowerCase();
  if (normalized === 'true' || normalized === 'yes' || normalized === '1') return true;
  if (normalized === 'false' || normalized === 'no' || normalized === '0') return false;
  return null;
}

function hasExplicitInvulnerabilityMetadata(target) {
  if (Object.prototype.hasOwnProperty.call(target || {}, 'invulnerabilityMetadataPresent')) {
    return target.invulnerabilityMetadataPresent === true;
  }
  if (String(target?.invulnerableMetadataAuthority || '').trim() === 'derived') return false;
  return Boolean(
    REMAINING_MS_FIELDS.some(field => Object.prototype.hasOwnProperty.call(target || {}, field))
      || REMAINING_TICK_FIELDS.some(field => Object.prototype.hasOwnProperty.call(target || {}, field))
      || Object.prototype.hasOwnProperty.call(target || {}, 'is_invulnerable')
      || Object.prototype.hasOwnProperty.call(target || {}, 'isInvulnerable')
      || Object.prototype.hasOwnProperty.call(target || {}, 'invulnerable')
      || target?.invulnerableMetadataAuthority
  );
}

function resolveRemainingMs(target, options = {}) {
  const explicitMs = numberOrNull(ownValue(target, REMAINING_MS_FIELDS));
  if (explicitMs !== null) return explicitMs;
  const ticks = numberOrNull(ownValue(target, REMAINING_TICK_FIELDS));
  if (ticks !== null) {
    const tickMs = Math.max(1, Number(options.combatServerTickMs ?? options.serverTickMs ?? 50));
    return ticks * tickMs;
  }
  return null;
}

function targetAttackTimerState(target, previous, nowMs, options = {}) {
  const hasMetadata = hasExplicitInvulnerabilityMetadata(target);
  const remainingMs = resolveRemainingMs(target, options);
  const explicitBoolean = hasMetadata
    ? rawBoolean(target, ['is_invulnerable', 'isInvulnerable', 'invulnerable'])
    : null;
  let state;
  if (remainingMs !== null) state = remainingMs > 0 ? ATTACK_TIMER_STATES.PROTECTED : ATTACK_TIMER_STATES.ATTACKABLE;
  else if (explicitBoolean === true) state = ATTACK_TIMER_STATES.UNKNOWN;
  else if (explicitBoolean === false) state = ATTACK_TIMER_STATES.ATTACKABLE;
  else if (previous?.attackTimerState === ATTACK_TIMER_STATES.PROTECTED
    || previous?.attackTimerState === ATTACK_TIMER_STATES.UNKNOWN) state = ATTACK_TIMER_STATES.UNKNOWN;
  else state = hasMetadata ? ATTACK_TIMER_STATES.UNKNOWN : ATTACK_TIMER_STATES.NOT_APPLICABLE;

  const previousAt = numberOrNull(previous?.at);
  const gapMs = previousAt === null ? 0 : Math.max(0, nowMs - previousAt);
  const frameGapMs = Math.max(50, Number(
    options.combatAttackClockFrameGapMs
      ?? Math.max(250, Number(options.combatServerTickMs || 50) * 5)
  ));
  // An explicit zero countdown is authoritative evidence that the target is
  // currently attackable, even if the controller received a sparse frame. A
  // gap with no current countdown (or after a protected/unknown frame) remains
  // conservative and pauses the effective clock.
  if (previous
    && gapMs > frameGapMs
    && state !== ATTACK_TIMER_STATES.NOT_APPLICABLE
    && remainingMs === null) {
    state = ATTACK_TIMER_STATES.UNKNOWN;
  }
  return { state, remainingMs, gapMs, frameGapMs };
}

function observeCombatAttackClock(previous = null, target = {}, nowMs = Date.now(), options = {}) {
  const currentAt = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  const prior = previous && typeof previous === 'object' ? previous : null;
  const same = Boolean(prior);
  const observation = targetAttackTimerState(target, prior, currentAt, options);
  const state = observation.state;
  const priorState = prior?.attackTimerState || ATTACK_TIMER_STATES.NOT_APPLICABLE;
  const currentAccumulates = state === ATTACK_TIMER_STATES.ATTACKABLE
    || state === ATTACK_TIMER_STATES.NOT_APPLICABLE;
  const priorAccumulates = priorState === ATTACK_TIMER_STATES.ATTACKABLE
    || priorState === ATTACK_TIMER_STATES.NOT_APPLICABLE;
  const protocolClock = state === ATTACK_TIMER_STATES.NOT_APPLICABLE
    && priorState === ATTACK_TIMER_STATES.NOT_APPLICABLE;
  const fallbackStartedAt = numberOrNull(
    options.initialAttackStartedAt
      ?? options.fallbackAttackStartedAt
  );
  const fallbackElapsed = numberOrNull(
    options.initialEffectiveAttackElapsedMs
      ?? options.fallbackEffectiveAttackElapsedMs
  );
  const fallbackMiss = numberOrNull(
    options.initialEffectiveMissNoDamageMs
      ?? options.fallbackEffectiveMissNoDamageMs
  );
  const hasPriorElapsed = Boolean(prior
    && Object.prototype.hasOwnProperty.call(prior, 'effectiveAttackElapsedMs')
    && Number.isFinite(Number(prior.effectiveAttackElapsedMs)));
  const hasPriorMiss = Boolean(prior
    && Object.prototype.hasOwnProperty.call(prior, 'effectiveMissNoDamageMs')
    && Number.isFinite(Number(prior.effectiveMissNoDamageMs)));
  const usingFallbackElapsed = Boolean(!hasPriorElapsed && currentAccumulates && fallbackElapsed !== null);
  const deltaMs = same && currentAccumulates && priorAccumulates && !usingFallbackElapsed
    ? (protocolClock ? observation.gapMs : Math.min(observation.gapMs, observation.frameGapMs))
    : 0;
  const previousElapsed = hasPriorElapsed
    ? Math.max(0, Number(prior.effectiveAttackElapsedMs))
    : ((currentAccumulates && fallbackElapsed !== null) ? Math.max(0, fallbackElapsed) : 0);
  const effectiveAttackElapsedMs = previousElapsed + deltaMs;
  const damaged = options.damaged === true;
  const previousMiss = hasPriorMiss
    ? Math.max(0, Number(prior.effectiveMissNoDamageMs))
    : ((currentAccumulates && fallbackMiss !== null) ? Math.max(0, fallbackMiss) : 0);
  const effectiveMissNoDamageMs = damaged
    ? 0
    : (currentAccumulates && priorAccumulates ? previousMiss + deltaMs : previousMiss);
  let effectiveAttackStartedAt = numberOrNull(prior?.effectiveAttackStartedAt);
  if (effectiveAttackStartedAt === null && currentAccumulates) {
    effectiveAttackStartedAt = fallbackStartedAt ?? currentAt;
  }
  const protectedStartedAt = state === ATTACK_TIMER_STATES.PROTECTED
    ? (priorState === ATTACK_TIMER_STATES.PROTECTED
      ? numberOrNull(prior?.protectedStartedAt) || currentAt
      : currentAt)
    : 0;
  const protectedMs = Math.max(0, Number(prior?.protectedMs || 0))
    + (state === ATTACK_TIMER_STATES.PROTECTED && priorState === ATTACK_TIMER_STATES.PROTECTED
      ? Math.min(observation.gapMs, observation.frameGapMs)
      : 0);
  const effectiveNowMs = effectiveAttackStartedAt === null
    ? currentAt
    : effectiveAttackStartedAt + effectiveAttackElapsedMs;
  const attackableObservationCount = Math.max(0, Number(prior?.attackableObservationCount || 0))
    + (state === ATTACK_TIMER_STATES.ATTACKABLE ? 1 : 0);
  const invulnerabilityEndedAt = state === ATTACK_TIMER_STATES.ATTACKABLE
    && (priorState === ATTACK_TIMER_STATES.PROTECTED || priorState === ATTACK_TIMER_STATES.UNKNOWN)
    ? currentAt
    : numberOrNull(prior?.invulnerabilityEndedAt) || 0;
  return {
    attackTimerState: state,
    attackTimerPauseReason: state === ATTACK_TIMER_STATES.PROTECTED
      ? 'target-invulnerable'
      : (state === ATTACK_TIMER_STATES.UNKNOWN ? 'target-invulnerability-unknown' : ''),
    effectiveAttackStartedAt,
    invulnerabilityEndedAt,
    protectedStartedAt,
    protectedMs,
    effectiveAttackElapsedMs,
    effectiveClosePressureElapsedMs: effectiveAttackElapsedMs,
    effectiveMissNoDamageMs,
    effectiveNowMs,
    attackableObservationCount,
    invulnerableRemainingMs: observation.remainingMs,
    frameGapMs: observation.gapMs > observation.frameGapMs ? observation.gapMs : 0,
    paused: state === ATTACK_TIMER_STATES.PROTECTED || state === ATTACK_TIMER_STATES.UNKNOWN
  };
}

function runCombatAttackClockSelfTest() {
  const target = remainingMs => ({ user_id: 9, invulnerableRemainingMs: remainingMs });
  const longWindow = { combatAttackClockFrameGapMs: 60000 };
  const protectedAtStart = observeCombatAttackClock(null, target(54000), 1000, longWindow);
  const stillProtected = observeCombatAttackClock({ ...protectedAtStart, at: 1000 }, target(5000), 50000, longWindow);
  const release = observeCombatAttackClock({ ...stillProtected, at: 50000 }, target(0), 55000, longWindow);
  const attackable = observeCombatAttackClock({ ...release, at: 55000 }, target(0), 56000, longWindow);
  const canonicalRelease = observeCombatAttackClock(
    { ...stillProtected, at: 50000 },
    { user_id: 9, invulnerable: false, invulnerableRemainingMs: null },
    55000,
    longWindow
  );
  const reprotect = observeCombatAttackClock({ ...attackable, at: 56000 }, target(5000), 57000, longWindow);
  const resume = observeCombatAttackClock({ ...reprotect, at: 57000 }, target(0), 62000, longWindow);
  const normalStart = observeCombatAttackClock(null, { user_id: 10 }, 1000);
  const normalLater = observeCombatAttackClock({ ...normalStart, at: 1000 }, { user_id: 10 }, 6000);
  const normalizedDerivedFalse = observeCombatAttackClock(
    null,
    { user_id: 12, invulnerable: false, invulnerabilityMetadataPresent: false },
    1000
  );
  const migratedOldState = observeCombatAttackClock({
    user_id: 10,
    at: 60800,
    firstSeenAt: 1000,
    lastDamageAt: 30000
  }, { user_id: 10 }, 61000, {
    initialAttackStartedAt: 1000,
    initialEffectiveAttackElapsedMs: 60000,
    initialEffectiveMissNoDamageMs: 31000
  });
  const unknown = observeCombatAttackClock(null, { user_id: 11, invulnerable: true }, 1000);
  const gap = observeCombatAttackClock({ ...normalStart, at: 1000 }, { user_id: 10, invulnerable: true }, 2000);
  return {
    ok: protectedAtStart.paused
      && protectedAtStart.effectiveAttackElapsedMs === 0
      && stillProtected.effectiveAttackElapsedMs === 0
      && release.attackTimerState === ATTACK_TIMER_STATES.ATTACKABLE
      && release.effectiveAttackElapsedMs === 0
      && canonicalRelease.attackTimerState === ATTACK_TIMER_STATES.ATTACKABLE
      && canonicalRelease.effectiveAttackElapsedMs === 0
      && attackable.effectiveMissNoDamageMs === 1000
      && reprotect.effectiveMissNoDamageMs === 1000
      && resume.effectiveMissNoDamageMs === 1000
      && normalLater.effectiveAttackElapsedMs === 5000
      && normalizedDerivedFalse.attackTimerState === ATTACK_TIMER_STATES.NOT_APPLICABLE
      && migratedOldState.effectiveAttackElapsedMs === 60000
      && migratedOldState.effectiveMissNoDamageMs === 31000
      && unknown.attackTimerState === ATTACK_TIMER_STATES.UNKNOWN
      && gap.attackTimerState === ATTACK_TIMER_STATES.UNKNOWN,
    protectedAtStart,
    stillProtected,
    release,
    canonicalRelease,
    attackable,
    reprotect,
    resume,
    normalLater,
    normalizedDerivedFalse,
    migratedOldState,
    unknown,
    gap
  };
}

module.exports = {
  ATTACK_TIMER_STATES,
  observeCombatAttackClock,
  runCombatAttackClockSelfTest
};
