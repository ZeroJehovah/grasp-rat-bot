'use strict';

// Close pressure is deliberately deterministic. The same target/session input
// must produce the same range and lateral direction so production records can
// be replayed without relying on Math.random().

const DEFAULT_SERVER_TICK_MS = 50;
const DEFAULT_BULLET_SPEED_CM_PER_TICK = 500;
const DEFAULT_CONTROL_INTERVAL_MS = 160;
const DEFAULT_MOVEMENT_P90_TICKS = 5;
const DEFAULT_FRAME_JITTER_MS = 50;
const DEFAULT_REACTION_MARGIN_MS = 100;
const DEFAULT_MIN_RANGE_CM = 2000;
const DEFAULT_MAX_RANGE_CM = 3000;

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
  const responseBudgetMs = controlIntervalMs
    + p90Ticks * tickMs
    + frameJitterMs
    + reactionSafetyMarginMs;
  const unconstrainedRangeCm = bulletSpeed * responseBudgetMs / tickMs;
  const minRangeCm = Math.max(1, Number(options.combatClosePressureMinRangeCm
    ?? options.closePressureMinRangeCm
    ?? DEFAULT_MIN_RANGE_CM));
  const maxRangeCm = Math.max(minRangeCm, Number(options.combatClosePressureMaxRangeCm
    ?? options.closePressureMaxRangeCm
    ?? DEFAULT_MAX_RANGE_CM));
  const rangeCm = clamp(unconstrainedRangeCm, minRangeCm, maxRangeCm);
  const flightMs = rangeCm / bulletSpeed * tickMs;
  return {
    rangeCm: Math.round(rangeCm),
    minRangeCm: Math.round(minRangeCm),
    maxRangeCm: Math.round(maxRangeCm),
    unconstrainedRangeCm: Math.round(unconstrainedRangeCm),
    flightMs: Math.round(flightMs),
    responseBudgetMs: Math.round(responseBudgetMs),
    tickMs,
    bulletSpeedCmPerTick: bulletSpeed,
    controlIntervalMs: Math.round(controlIntervalMs),
    movementP90Ticks: p90Ticks,
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
 * Resolve the stable tactical phase for one target. Once close pressure starts
 * it remains latched for that target until the target is replaced or a hard
 * safety decision takes ownership.
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
  const minDamageMs = Math.max(0, Number(options.browserlessProfitPursuitMinDamageMs
    ?? options.profitPursuitMinDamageMs
    ?? 60000));
  const minDamageHp = Math.max(0, Number(options.browserlessProfitPursuitMinDamageHp
    ?? options.profitPursuitMinDamageHp
    ?? 10));
  const maxMs = Math.max(0, Number(options.browserlessProfitPursuitMaxMs
    ?? options.profitPursuitMaxMs
    ?? 60000));
  const ordinaryProfit = ordinaryProfitEngagement(input);
  const noDamageTrigger = ordinaryProfit
    && minDamageMs > 0
    && engagedMs >= minDamageMs
    && damageKnown
    && Number(damageFromStart || 0) < minDamageHp;
  const maxDurationTrigger = ordinaryProfit && maxMs > 0 && engagedMs >= maxMs;
  const trigger = noDamageTrigger || maxDurationTrigger;
  const hardSafety = input.hardSafety === true;
  const previousPhase = sameTarget ? String(previous.combatPhase || previous.phase || '') : '';
  const active = Boolean(!hardSafety && sameTarget && (trigger || previousPhase === 'close-pressure'));
  const phase = active ? 'close-pressure' : 'normal-combat';
  const phaseStartedAt = active
    ? (previousPhase === 'close-pressure' && Number(previous.phaseStartedAt || 0) > 0
        ? Number(previous.phaseStartedAt)
        : nowMs)
    : nowMs;
  const range = active ? combatPressureTargetRangeCore(options) : null;
  const triggerReason = noDamageTrigger
    ? 'no-damage-threshold'
    : (maxDurationTrigger ? 'maximum-pursuit-duration' : (active ? 'latched' : ''));
  return {
    phase,
    active,
    sameTarget,
    targetId,
    ordinaryProfit,
    engagedMs: Math.round(engagedMs),
    noDamageTrigger,
    maxDurationTrigger,
    triggerReason,
    phaseStartedAt,
    firstHp,
    minHp,
    targetHp,
    damageFromStart: damageFromStart === null ? null : Math.round(damageFromStart * 10) / 10,
    damageKnown,
    minDamageMs: Math.round(minDamageMs),
    minDamageHp: Math.round(minDamageHp * 10) / 10,
    maxMs: Math.round(maxMs),
    range
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
