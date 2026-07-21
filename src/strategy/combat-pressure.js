'use strict';

// Close pressure is deliberately deterministic. The same target/session input
// must produce the same range and lateral direction so production records can
// be replayed without relying on Math.random().

const DEFAULT_SERVER_TICK_MS = 50;
const DEFAULT_BULLET_SPEED_CM_PER_TICK = 500;
const DEFAULT_CONTROL_INTERVAL_MS = 50;
const DEFAULT_MOVEMENT_P90_TICKS = 5;
const DEFAULT_FRAME_JITTER_MS = 50;
const DEFAULT_REACTION_MARGIN_MS = 100;
const DEFAULT_PLAYER_SPEED_CM_PER_TICK = 50;
const DEFAULT_BULLET_HIT_RADIUS_CM = 90;
const DEFAULT_REACTION_RANGE_MIN_CM = 4500;
const DEFAULT_REACTION_RANGE_MAX_CM = 7000;

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function targetIdOf(target) {
  const value = target?.id ?? target?.userId ?? target?.user_id ?? target?.targetId;
  return value === null || value === undefined ? '' : String(value);
}

function movementP90Ticks(options = {}) {
  const value = options.movementExecutionTiming?.p90Ticks
    ?? options.executionTiming?.p90Ticks
    ?? options.movementP90Ticks
    ?? options.combatMovementP90Ticks
    ?? DEFAULT_MOVEMENT_P90_TICKS;
  return Math.max(0, Number.isFinite(Number(value)) ? Number(value) : DEFAULT_MOVEMENT_P90_TICKS);
}

/**
 * Derive the distance at which a newly observed projectile reaches the target
 * before the controller can normally change velocity. The result is bounded
 * to a measured, practical close-pressure interval instead of a magic radius.
 */
function combatPressureTargetRangeCore(options = {}) {
  const tickMs = Math.max(1, Number(options.combatServerTickMs
    ?? options.serverTickMs
    ?? DEFAULT_SERVER_TICK_MS));
  const bulletSpeed = Math.max(1, Number(options.combatBulletSpeedPerTick
    ?? options.bulletSpeedPerTick
    ?? DEFAULT_BULLET_SPEED_CM_PER_TICK));
  const controlIntervalMs = Math.max(0, Number(options.combatControlIntervalMs
    ?? options.controlIntervalMs
    ?? DEFAULT_CONTROL_INTERVAL_MS));
  const p90Ticks = movementP90Ticks(options);
  const frameJitterMs = Math.max(0, Number(options.combatFrameJitterMs
    ?? options.frameJitterMs
    ?? DEFAULT_FRAME_JITTER_MS));
  const reactionSafetyMarginMs = Math.max(0, Number(options.combatReactionSafetyMarginMs
    ?? options.reactionSafetyMarginMs
    ?? DEFAULT_REACTION_MARGIN_MS));
  const playerSpeed = Math.max(1, Number(options.combatMoveSpeedPerTick
    ?? options.playerSpeedPerTick
    ?? DEFAULT_PLAYER_SPEED_CM_PER_TICK));
  const hitRadius = Math.max(1, Number(options.combatBulletHitRadiusCm
    ?? options.hitRadiusCm
    ?? DEFAULT_BULLET_HIT_RADIUS_CM));
  const clearanceTicks = Math.max(1, Math.ceil(hitRadius / playerSpeed));
  const clearanceMs = clearanceTicks * tickMs;
  const responseBudgetMs = controlIntervalMs
    + p90Ticks * tickMs
    + frameJitterMs
    + reactionSafetyMarginMs
    + clearanceMs;
  const unconstrainedRangeCm = bulletSpeed * responseBudgetMs / tickMs;
  const reactiveBoundaryCm = clamp(
    unconstrainedRangeCm,
    Math.max(1, Number(options.combatReactiveDodgeMinRangeCm ?? DEFAULT_REACTION_RANGE_MIN_CM)),
    Math.max(
      Math.max(1, Number(options.combatReactiveDodgeMinRangeCm ?? DEFAULT_REACTION_RANGE_MIN_CM)),
      Number(options.combatReactiveDodgeMaxRangeCm ?? DEFAULT_REACTION_RANGE_MAX_CM)
    )
  );
  const oneTickRangeCm = bulletSpeed;
  const derivedMinRangeCm = Math.max(oneTickRangeCm, reactiveBoundaryCm - oneTickRangeCm * 2);
  const derivedMaxRangeCm = Math.max(derivedMinRangeCm, reactiveBoundaryCm);
  const minRangeCm = Math.max(1, Number(options.combatClosePressureMinRangeCm
    ?? options.closePressureMinRangeCm
    ?? derivedMinRangeCm));
  const maxRangeCm = Math.max(minRangeCm, Number(options.combatClosePressureMaxRangeCm
    ?? options.closePressureMaxRangeCm
    ?? derivedMaxRangeCm));
  const rangeCm = clamp(
    reactiveBoundaryCm - oneTickRangeCm,
    minRangeCm,
    maxRangeCm
  );
  const normalMinRangeCm = Math.max(
    maxRangeCm + oneTickRangeCm,
    Number(options.combatNormalReactionMinRangeCm ?? reactiveBoundaryCm + oneTickRangeCm)
  );
  const normalMaxRangeCm = Math.max(
    normalMinRangeCm,
    Number(options.combatNormalReactionMaxRangeCm ?? reactiveBoundaryCm + oneTickRangeCm * 2)
  );
  const flightMs = rangeCm / bulletSpeed * tickMs;
  return {
    rangeCm: Math.round(rangeCm),
    minRangeCm: Math.round(minRangeCm),
    maxRangeCm: Math.round(maxRangeCm),
    reactiveBoundaryCm: Math.round(reactiveBoundaryCm),
    normalMinRangeCm: Math.round(normalMinRangeCm),
    normalMaxRangeCm: Math.round(normalMaxRangeCm),
    unconstrainedRangeCm: Math.round(unconstrainedRangeCm),
    flightMs: Math.round(flightMs),
    responseBudgetMs: Math.round(responseBudgetMs),
    tickMs,
    bulletSpeedCmPerTick: bulletSpeed,
    controlIntervalMs: Math.round(controlIntervalMs),
    movementP90Ticks: p90Ticks,
    playerSpeedCmPerTick: playerSpeed,
    hitRadiusCm: hitRadius,
    clearanceTicks,
    clearanceMs,
    frameJitterMs: Math.round(frameJitterMs),
    reactionSafetyMarginMs: Math.round(reactionSafetyMarginMs),
    ballisticConstraintSatisfied: flightMs <= responseBudgetMs
  };
}

function ordinaryProfitEngagement(input = {}) {
  if (input.ordinaryProfit === true) return true;
  if (input.ordinaryProfit === false) return false;
  const values = [input.originIntent, input.intent].map(value => String(value || ''));
  return values.some(value => ['profit', 'engaged', 'reengage', 'afk-profit'].includes(value));
}

/**
 * Resolve progressive close-in pressure for one target. Each no-damage shot
 * generation starts at a bounded sample threshold and is cleared as soon as
 * target HP progress creates a new damage generation.
 */
function combatPressurePhaseCore(previous = {}, input = {}, options = {}) {
  const nowMs = Math.max(0, Number(input.nowMs ?? Date.now()));
  const targetId = targetIdOf(input);
  const previousId = targetIdOf(previous);
  const sameTarget = Boolean(targetId && previousId && targetId === previousId);
  const startedAt = numberOrNull(input.engagedAt
    ?? input.firstSeenAt
    ?? (sameTarget ? previous.firstSeenAt ?? previous.at : null));
  const engagedMs = Math.max(0, nowMs - (startedAt === null ? nowMs : startedAt));
  const firstHp = numberOrNull(input.firstHp ?? previous.firstHp ?? previous.startHp);
  const minHp = numberOrNull(input.minHp ?? previous.minHp);
  const targetHp = numberOrNull(input.targetHp ?? input.hp ?? previous.hp);
  const inferredDamage = firstHp !== null && minHp !== null ? Math.max(0, firstHp - minHp) : null;
  const damageFromStart = numberOrNull(input.damageFromStart) ?? inferredDamage;
  const damageKnown = Boolean(input.damageKnown ?? (damageFromStart !== null));
  const ordinaryProfit = ordinaryProfitEngagement(input);
  const hardSafety = input.hardSafety === true;
  const previousPhase = sameTarget ? String(previous.combatPhase || previous.phase || '') : '';
  const previousClosePressure = previous?.closePressure && typeof previous.closePressure === 'object'
    ? previous.closePressure
    : previous;
  const targetDistance = numberOrNull(input.distance ?? input.targetDistance);
  const acceptedShotsSinceDamage = Math.max(0, Math.round(Number(input.acceptedShotsSinceDamage || 0)));
  const damageProgressAt = Math.max(0, Number(input.damageProgressAt || input.lastDamageAt || startedAt || nowMs));
  const triggerShots = Math.max(1, Math.round(Number(options.combatMissCloseTriggerShots ?? 10)));
  const stepShots = Math.max(1, Math.round(Number(options.combatMissCloseStepShots ?? triggerShots)));
  const stepCm = Math.max(100, Number(options.combatMissCloseStepCm ?? 1000));
  const minimumDistanceCm = Math.max(0, Number(options.combatMissCloseMinimumDistanceCm ?? 1000));
  const timeoutMs = Math.max(1000, Number(options.combatMissCloseTimeoutMs ?? 30000));
  const arrivalToleranceCm = Math.max(0, Number(options.combatMissCloseArrivalToleranceCm ?? 100));
  const sameDamageGeneration = Boolean(
    previousPhase === 'close-pressure'
      && Number(previousClosePressure?.damageProgressAt || 0) === damageProgressAt
  );
  const missedShotsTrigger = Boolean(
    damageKnown
      && targetDistance !== null
      && acceptedShotsSinceDamage >= triggerShots
  );
  const active = Boolean(!hardSafety && sameTarget && missedShotsTrigger);
  const phase = active ? 'close-pressure' : 'normal-combat';
  const phaseStartedAt = active
    ? (sameDamageGeneration && Number(previous.phaseStartedAt || 0) > 0
        ? Number(previous.phaseStartedAt)
        : nowMs)
    : nowMs;

  let stepIndex = 0;
  let stepStartedAt = 0;
  let stepStartDistanceCm = null;
  let goalDistanceCm = null;
  let bestDistanceCm = null;
  let goalReachedAt = 0;
  let goalReachedAcceptedShots = acceptedShotsSinceDamage;
  let stepAdvanced = false;
  if (active) {
    if (sameDamageGeneration && Number(previousClosePressure?.stepIndex || 0) > 0) {
      stepIndex = Math.max(1, Math.round(Number(previousClosePressure.stepIndex)));
      stepStartedAt = Math.max(0, Number(previousClosePressure.stepStartedAt || nowMs));
      stepStartDistanceCm = numberOrNull(previousClosePressure.stepStartDistanceCm) ?? targetDistance;
      goalDistanceCm = numberOrNull(previousClosePressure.goalDistanceCm)
        ?? Math.max(minimumDistanceCm, Number(stepStartDistanceCm) - stepCm);
      bestDistanceCm = Math.min(
        numberOrNull(previousClosePressure.bestDistanceCm) ?? targetDistance,
        targetDistance
      );
      goalReachedAt = Math.max(0, Number(previousClosePressure.goalReachedAt || 0));
      goalReachedAcceptedShots = Math.max(0, Math.round(Number(
        previousClosePressure.goalReachedAcceptedShots ?? acceptedShotsSinceDamage
      )));
    } else {
      stepIndex = 1;
      stepStartedAt = nowMs;
      stepStartDistanceCm = targetDistance;
      goalDistanceCm = Math.max(minimumDistanceCm, targetDistance - stepCm);
      bestDistanceCm = targetDistance;
    }

    const withinGoalBeforeAdvance = targetDistance <= goalDistanceCm + arrivalToleranceCm;
    if (withinGoalBeforeAdvance && !goalReachedAt) {
      goalReachedAt = nowMs;
      goalReachedAcceptedShots = acceptedShotsSinceDamage;
    } else if (!withinGoalBeforeAdvance && goalReachedAt) {
      // The opponent reopened the same distance gap. Give this renewed
      // close-in attempt its own bounded timeout instead of inheriting an old
      // successful step forever.
      stepStartedAt = nowMs;
      goalReachedAt = 0;
      goalReachedAcceptedShots = acceptedShotsSinceDamage;
    }

    const shotsAfterGoal = goalReachedAt
      ? Math.max(0, acceptedShotsSinceDamage - goalReachedAcceptedShots)
      : 0;
    if (goalReachedAt
      && shotsAfterGoal >= stepShots
      && targetDistance > minimumDistanceCm + arrivalToleranceCm) {
      stepIndex += 1;
      stepStartedAt = nowMs;
      stepStartDistanceCm = targetDistance;
      goalDistanceCm = Math.max(minimumDistanceCm, targetDistance - stepCm);
      bestDistanceCm = targetDistance;
      goalReachedAt = 0;
      goalReachedAcceptedShots = acceptedShotsSinceDamage;
      stepAdvanced = true;
    }
  }

  const withinGoal = Boolean(active && targetDistance <= goalDistanceCm + arrivalToleranceCm);
  const stepElapsedMs = active && stepStartedAt > 0 ? Math.max(0, nowMs - stepStartedAt) : 0;
  const stepTimedOut = Boolean(active && !withinGoal && stepElapsedMs >= timeoutMs);
  const ballisticRange = active ? combatPressureTargetRangeCore(options) : null;
  const range = active ? {
    ...ballisticRange,
    rangeCm: Math.round(goalDistanceCm),
    minRangeCm: 0,
    maxRangeCm: Math.round(goalDistanceCm + arrivalToleranceCm),
    normalMinRangeCm: Math.round(goalDistanceCm + arrivalToleranceCm + 1),
    normalMaxRangeCm: Math.round(goalDistanceCm + arrivalToleranceCm + stepCm),
    progressiveMissClose: true
  } : null;
  const pressureAttackCommitted = active;
  const subphase = active ? (withinGoal ? 'pressure-attack' : 'closing') : 'normal-combat';
  const triggerReason = active
    ? (sameDamageGeneration ? 'missed-shots-latched' : 'missed-shots-threshold')
    : '';
  return {
    phase,
    active,
    sameTarget,
    targetId,
    ordinaryProfit,
    engagedMs: Math.round(engagedMs),
    noDamageTrigger: missedShotsTrigger,
    maxDurationTrigger: false,
    triggerReason,
    phaseStartedAt,
    firstHp,
    minHp,
    targetHp,
    damageFromStart: damageFromStart === null ? null : Math.round(damageFromStart * 10) / 10,
    damageKnown,
    acceptedShotsSinceDamage,
    triggerShots,
    stepShots,
    stepCm: Math.round(stepCm),
    minimumDistanceCm: Math.round(minimumDistanceCm),
    timeoutMs: Math.round(timeoutMs),
    arrivalToleranceCm: Math.round(arrivalToleranceCm),
    damageProgressAt,
    range,
    subphase,
    pressureAttackCommitted,
    pressureBandSamples: withinGoal ? 1 : 0,
    pressureBandConfirmTicks: 1,
    pressureReleaseSamples: withinGoal ? 0 : 1,
    pressureBandReleaseTicks: 1,
    insidePressureBand: withinGoal,
    outsideReactiveBand: !withinGoal,
    stepIndex,
    stepStartedAt,
    stepStartDistanceCm: stepStartDistanceCm === null ? null : Math.round(stepStartDistanceCm),
    goalDistanceCm: goalDistanceCm === null ? null : Math.round(goalDistanceCm),
    bestDistanceCm: bestDistanceCm === null ? null : Math.round(bestDistanceCm),
    goalReachedAt,
    goalReachedAcceptedShots,
    shotsAfterGoal: goalReachedAt
      ? Math.max(0, acceptedShotsSinceDamage - goalReachedAcceptedShots)
      : 0,
    withinGoal,
    stepAdvanced,
    stepElapsedMs: Math.round(stepElapsedMs),
    stepTimedOut,
    targetDistance: targetDistance === null ? null : Math.round(targetDistance)
  };
}

function hashSeed(value) {
  let hash = 2166136261;
  for (const character of String(value || '')) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pseudoRandom(seed, index) {
  let value = (seed + Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x85ebca6b) >>> 0;
  value ^= value >>> 13;
  value = Math.imul(value, 0xc2b2ae35) >>> 0;
  return (value ^ (value >>> 16)) >>> 0;
}

function quantizedTangentDirection(radialX, radialY) {
  const angle = Math.atan2(radialY, radialX) + Math.PI / 2;
  const octantAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
  return {
    dx: Math.round(Math.cos(octantAngle)) || 0,
    dy: Math.round(Math.sin(octantAngle)) || 0
  };
}

/**
 * Produce a bounded, replayable lateral direction when no projectile is
 * currently available for the trajectory simulator.
 */
function combatPressureStrafeCore(self = {}, target = {}, phase = {}, options = {}) {
  const selfX = numberOrNull(self.x);
  const selfY = numberOrNull(self.y);
  const targetX = numberOrNull(target.x);
  const targetY = numberOrNull(target.y);
  if ([selfX, selfY, targetX, targetY].some(value => value === null)) {
    return { dx: 0, dy: 0, active: false, reason: 'missing-geometry' };
  }
  const radialX = targetX - selfX;
  const radialY = targetY - selfY;
  if (!(radialX || radialY)) return { dx: 0, dy: 0, active: false, reason: 'same-position' };
  const tangent = quantizedTangentDirection(radialX, radialY);
  const seed = hashSeed(targetIdOf(target) || targetIdOf(phase) || `${targetX}:${targetY}`);
  const phaseStartedAt = Math.max(0, Number(phase.phaseStartedAt || phase.startedAt || 0));
  const nowMs = Math.max(phaseStartedAt, Number(options.nowMs ?? Date.now()));
  const elapsedMs = Math.max(0, nowMs - phaseStartedAt);
  const baseDurations = [420, 730, 510, 980, 640, 1180, 560, 860];
  const cycleDurations = Array.from({ length: 32 }, (_, index) => {
    if (index === 0) return baseDurations[0];
    const random = pseudoRandom(seed, index);
    return Math.max(260, baseDurations[index % baseDurations.length] + (random % 241) - 120);
  });
  const cycleDurationMs = cycleDurations.reduce((sum, duration) => sum + duration, 0);
  const cycleIndex = Math.floor(elapsedMs / cycleDurationMs);
  let remaining = elapsedMs % cycleDurationMs;
  let cycleSegmentIndex = 0;
  let durationMs = cycleDurations[0];
  while (remaining >= durationMs && cycleSegmentIndex < cycleDurations.length - 1) {
    remaining -= durationMs;
    cycleSegmentIndex += 1;
    durationMs = cycleDurations[cycleSegmentIndex];
  }
  const segmentIndex = cycleIndex * cycleDurations.length + cycleSegmentIndex;
  // Alternate every deterministic segment. The seed chooses the initial
  // tangent side, while segment parity guarantees an actual direction change
  // instead of allowing several adjacent segments to repeat one heading.
  const initialSign = (seed & 1) === 0 ? 1 : -1;
  const sign = (segmentIndex & 1) === 0 ? initialSign : -initialSign;
  return {
    dx: tangent.dx === 0 ? 0 : tangent.dx * sign,
    dy: tangent.dy === 0 ? 0 : tangent.dy * sign,
    active: true,
    reason: 'close-pressure-deterministic-strafe',
    segmentIndex,
    segmentElapsedMs: Math.round(remaining),
    segmentDurationMs: Math.round(durationMs),
    elapsedMs: Math.round(elapsedMs),
    cycleIndex,
    cycleDurationMs,
    seed
  };
}

module.exports = {
  combatPressureTargetRangeCore,
  combatPressurePhaseCore,
  combatPressureStrafeCore
};
