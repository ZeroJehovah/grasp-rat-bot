'use strict';

const DIRECTIONS = Object.freeze([
  [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]
].map(([dx, dy]) => Object.freeze({ dx, dy, length: Math.hypot(dx, dy) })));

const COMBAT_OPPORTUNITY_DEFAULTS = Object.freeze({
  pursuitHeadingHysteresis: 0.035,
  pressureWindowMs: 5000,
  pressureFreshMs: 1500,
  confirmMs: 250,
  resumeMs: 1000,
  safetyMarginMs: 1000,
  defenseMinEngagedMs: 3000,
  defenseMinDamageHp: 18,
  defenseDamageRatio: 2,
  defenseMinDamageGapHp: 12
});

function finite(value) {
  return value === null || value === undefined || value === '' || !Number.isFinite(Number(value))
    ? null : Number(value);
}

function continuous(previous, id, nowMs) {
  return previous?.id === id && finite(previous.at) !== null
    && nowMs >= previous.at && nowMs - previous.at <= 1000;
}

// Direction ranking uses the actual displacement, not just its two signs.
// Safety/admission is supplied by the caller; this function grants neither.
function pursuitApproachDirectionCore(input = {}, options = {}) {
  const { self, target } = input;
  const nowMs = finite(input.nowMs);
  const id = String(input.targetId || '');
  const fallback = input.fallback || { dx: 0, dy: 0 };
  if (options.combatPursuitHeadingEnabled === false || input.allowed !== true || !id
    || nowMs === null || [self?.x, self?.y, target?.x, target?.y].some(value => finite(value) === null)) {
    return { active: false, direction: fallback, state: null, reason: 'pursuit-heading-not-applicable' };
  }
  const x = target.x - self.x;
  const y = target.y - self.y;
  const distance = Math.hypot(x, y);
  if (distance <= 150) return { active: false, direction: fallback, state: null, reason: 'inside-pickup-radius' };
  const score = direction => (x * direction.dx + y * direction.dy)
    / (distance * Math.hypot(direction.dx, direction.dy));
  let best = DIRECTIONS[0];
  let bestScore = score(best);
  for (let i = 1; i < DIRECTIONS.length; i += 1) {
    const candidateScore = score(DIRECTIONS[i]);
    if (candidateScore > bestScore) { best = DIRECTIONS[i]; bestScore = candidateScore; }
  }
  const previous = continuous(input.previous, id, nowMs) ? input.previous : null;
  const retained = previous && DIRECTIONS.find(d => d.dx === previous.dx && d.dy === previous.dy);
  const hysteresis = Math.max(0, finite(options.combatPursuitHeadingHysteresis)
    ?? COMBAT_OPPORTUNITY_DEFAULTS.pursuitHeadingHysteresis);
  if (retained && score(retained) > 0 && bestScore - score(retained) <= hysteresis) best = retained;
  const direction = { dx: best.dx, dy: best.dy };
  return {
    active: true, direction, reason: 'pursuit-radial-progress',
    radialProgress: score(best),
    state: { id, at: nowMs, ...direction }
  };
}

// Samples are target-scoped native observations. Count distinct new-shot rows,
// not repeated visibility of a retained projectile. Preserve healing separately.
function combatPressureWindowCore(samples = [], nowMs = 0) {
  const cutoff = nowMs - COMBAT_OPPORTUNITY_DEFAULTS.pressureWindowMs;
  let firstAt = null;
  let lastAt = null;
  let previous = null;
  let damage = 0;
  let targetDamage = 0;
  let lossEvents = 0;
  let shots = 0;
  let shotRows = 0;
  let firstShotAt = null;
  let lastShotAt = null;
  let lastLossAt = null;
  for (const sample of samples) {
    const at = finite(sample?.at);
    if (at === null || at < cutoff || at > nowMs || (lastAt !== null && at <= lastAt)) continue;
    if (firstAt === null) firstAt = at;
    lastAt = at;
    const selfHp = finite(sample.selfHp);
    const targetHp = finite(sample.targetHp);
    const loss = previous && selfHp !== null && finite(previous.selfHp) !== null
      ? Math.max(0, previous.selfHp - selfHp) : 0;
    if (loss > 0) { damage += loss; lossEvents += 1; lastLossAt = at; }
    if (previous && targetHp !== null && finite(previous.targetHp) !== null) {
      targetDamage += Math.max(0, previous.targetHp - targetHp);
    }
    if (Number(sample.newBulletCount) > 0) {
      shots += Number(sample.newBulletCount);
      shotRows += 1;
      if (firstShotAt === null) firstShotAt = at;
      lastShotAt = at;
    }
    previous = sample;
  }
  const spanMs = firstAt === null || lastAt === null ? 0 : lastAt - firstAt;
  const sustained = shotRows >= 2 && lastShotAt - firstShotAt >= 250
    && nowMs - lastShotAt <= COMBAT_OPPORTUNITY_DEFAULTS.pressureFreshMs;
  return {
    spanMs, damage, targetDamage, lossEvents, shots, shotRows, lastLossAt, lastShotAt, sustained,
    incomingHpPerSec: damage * 1000 / Math.max(1000, spanMs),
    targetHpPerSec: targetDamage * 1000 / Math.max(1000, spanMs)
  };
}

function invulnerableEscortWaitCore(input = {}, options = {}) {
  const nowMs = finite(input.nowMs);
  const primary = input.primary;
  const id = String(primary?.userId ?? primary?.user_id ?? '');
  const hp = finite(input.selfHp);
  const primaryHp = finite(primary?.hp);
  const distance = finite(input.primaryDistanceCm);
  const previous = nowMs !== null && continuous(input.previous, id, nowMs) ? input.previous : null;
  const empty = reason => ({ active: false, state: null, reason });
  if (options.combatInvulnerableEscortWaitEnabled === false || input.secondary !== true
    || input.realtimePrimary !== true || !id || nowMs === null || hp === null || hp <= 50
    || primaryHp === null || primaryHp <= 0 || distance === null
    || primary.invulnerable !== true) return empty('escort-wait-not-applicable');
  const pressure = input.pressure || combatPressureWindowCore(input.samples, nowMs);
  const lease = finite(primary.invulnerableProtectionLeaseUntilMs);
  const remaining = lease !== null && lease > 0
    ? Math.max(0, lease - nowMs)
    : finite(primary.invulnerableRemainingMs ?? primary.invulnerableProtectionRemainingMs);
  if (remaining === 0) return empty('primary-protection-ended');
  const knownRemaining = remaining !== null && remaining >= 0;
  const travelMs = Math.max(0, distance - 150) / 1000 * 1000;
  // Optimistic lower bound: every normal-cadence shot hits for 3 HP.
  // A pessimistic kill estimate would defer an otherwise collectible reward.
  const killMs = Math.ceil(primaryHp / 3) * 160;
  // Approach can overlap protection. Rates affect this safety wait only,
  // never reward, score, target admission, or fire authorization.
  const rewardEtaMs = knownRemaining ? Math.max(remaining, travelMs) + killMs + 500 : null;
  const hp50EtaMs = pressure.incomingHpPerSec > 0 ? (hp - 50) / pressure.incomingHpPerSec * 1000 : null;
  const unsafe = knownRemaining && pressure.sustained && pressure.damage >= 3 && hp50EtaMs !== null
    && rewardEtaMs + COMBAT_OPPORTUNITY_DEFAULTS.safetyMarginMs >= hp50EtaMs;
  const since = unsafe ? (previous?.unsafeSince ?? nowMs) : null;
  const safeSince = unsafe ? null : (previous?.safeSince ?? nowMs);
  const active = unsafe
    ? previous?.active === true || nowMs - since >= COMBAT_OPPORTUNITY_DEFAULTS.confirmMs
    : previous?.active === true && nowMs - safeSince < COMBAT_OPPORTUNITY_DEFAULTS.resumeMs;
  return {
    active, reason: active ? 'invulnerable-primary-pressure-wait' : (unsafe ? 'escort-wait-confirming' : 'escort-wait-safe'),
    pressure, remainingMs: knownRemaining ? remaining : null, rewardEtaMs, hp50EtaMs,
    state: { id, at: nowMs, active, unsafeSince: since, safeSince }
  };
}

function uncommittedDefenseExitCore(input = {}, options = {}) {
  const nowMs = finite(input.nowMs);
  const id = String(input.targetId || '');
  const hp = finite(input.selfHp);
  const targetHp = finite(input.targetHp);
  const pressure = input.pressure || combatPressureWindowCore(input.samples, nowMs ?? 0);
  const reset = reason => ({ shouldLeave: false, state: null, reason, pressure });
  if (options.combatUncommittedDefenseExitEnabled === false || nowMs === null || !id
    || input.realtime !== true || input.secondary !== true || input.commitment !== false
    || hp === null || hp <= 50 || targetHp === null || targetHp <= 20 || input.invulnerable === true
    || input.finishOpportunity === true) return reset('uncommitted-defense-not-applicable');
  const hp50EtaMs = pressure.incomingHpPerSec > 0 ? (hp - 50) / pressure.incomingHpPerSec * 1000 : Infinity;
  const killEtaMs = pressure.targetHpPerSec > 0 ? targetHp / pressure.targetHpPerSec * 1000 : Infinity;
  if (Number.isFinite(killEtaMs) && killEtaMs + 1000 < hp50EtaMs) return reset('defense-finish-opportunity');
  const defaults = COMBAT_OPPORTUNITY_DEFAULTS;
  const qualifies = Number(input.engagedMs) >= defaults.defenseMinEngagedMs
    && Number(input.acceptedShots) >= 3 && pressure.sustained && pressure.lossEvents >= 3
    && pressure.lastLossAt !== null && nowMs - pressure.lastLossAt <= 1500
    && pressure.damage >= defaults.defenseMinDamageHp
    && pressure.damage >= pressure.targetDamage * defaults.defenseDamageRatio
    && pressure.damage - pressure.targetDamage >= defaults.defenseMinDamageGapHp;
  if (!qualifies) return reset('defense-exchange-not-severe');
  const previous = continuous(input.previous, id, nowMs) ? input.previous : null;
  const since = previous?.since ?? nowMs;
  const shouldLeave = nowMs - since >= defaults.confirmMs;
  return {
    shouldLeave, reason: shouldLeave ? 'uncommitted-defense-poor-exchange-leave' : 'uncommitted-defense-confirming',
    pressure, hp50EtaMs: Number.isFinite(hp50EtaMs) ? hp50EtaMs : null,
    killEtaMs: Number.isFinite(killEtaMs) ? killEtaMs : null,
    state: { id, at: nowMs, since }
  };
}

module.exports = {
  COMBAT_OPPORTUNITY_DEFAULTS,
  pursuitApproachDirectionCore,
  combatPressureWindowCore,
  invulnerableEscortWaitCore,
  uncommittedDefenseExitCore
};
