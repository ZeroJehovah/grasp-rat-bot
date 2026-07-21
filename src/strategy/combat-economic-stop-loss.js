'use strict';

const DEFAULTS = Object.freeze({
  softNoDamageMs: 60000,
  softMovementStamina: 100000,
  hardNoDamageMs: 180000,
  hardMovementStamina: 300000,
  pressureCycleMs: 60000,
  cooldownMs: 60000,
  reentryDropRatio: 0.25,
  reentryDropMinimum: 10,
  reentryDistanceRatio: 0.2,
  reentryDistanceMinimumCm: 2000
});

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function nonNegative(value, fallback = 0) {
  return Math.max(0, finiteNumber(value, fallback));
}

function evaluateNonThreatCombatEconomicStopLossCore(input = {}, previousState = null, options = {}) {
  const nowMs = finiteNumber(input.nowMs, Date.now());
  const targetId = String(input.targetId ?? '');
  const damageProgressAt = nonNegative(input.damageProgressAt ?? input.startedAt, nowMs);
  const acceptedShotsSinceDamage = nonNegative(input.acceptedShotsSinceDamage);
  const movementStaminaSinceDamage = nonNegative(input.movementStaminaSinceDamage);
  const stableCloseMs = nonNegative(input.stableCloseMs);
  const noDamageMs = Math.max(0, nowMs - damageProgressAt);
  const threatEvidence = Boolean(input.threatEvidence);
  const softNoDamageMs = nonNegative(options.softNoDamageMs, DEFAULTS.softNoDamageMs);
  const softMovementStamina = nonNegative(options.softMovementStamina, DEFAULTS.softMovementStamina);
  const hardNoDamageMs = Math.max(softNoDamageMs, nonNegative(options.hardNoDamageMs, DEFAULTS.hardNoDamageMs));
  const hardMovementStamina = Math.max(
    softMovementStamina,
    nonNegative(options.hardMovementStamina, DEFAULTS.hardMovementStamina)
  );
  const pressureCycleMs = nonNegative(options.pressureCycleMs, DEFAULTS.pressureCycleMs);
  const sameGeneration = Boolean(
    previousState
      && String(previousState.targetId ?? '') === targetId
      && finiteNumber(previousState.damageProgressAt, -1) === damageProgressAt
  );
  let pressureCycleStartedAt = sameGeneration
    ? nonNegative(previousState.pressureCycleStartedAt)
    : 0;
  const softNoDamage = softNoDamageMs > 0 && noDamageMs >= softNoDamageMs;
  const softMovement = softMovementStamina > 0 && movementStaminaSinceDamage >= softMovementStamina;
  const hardNoDamage = hardNoDamageMs > 0 && noDamageMs >= hardNoDamageMs;
  const hardMovement = hardMovementStamina > 0 && movementStaminaSinceDamage >= hardMovementStamina;
  const softTriggered = softNoDamage || softMovement;
  const hardTriggered = hardNoDamage || hardMovement;
  const marginalNetROI = Number(input.marginalNetROI);
  const requiredRoi = Number(input.requiredRoi);
  const roiKnown = Number.isFinite(marginalNetROI) && Number.isFinite(requiredRoi);
  const roiQualified = roiKnown && marginalNetROI >= requiredRoi;
  let release = false;
  let continuePressureCycle = false;
  let reason = threatEvidence ? 'non-threat-economic-stop-loss-threat-excluded' : 'non-threat-economic-stop-loss-observe';

  if (!threatEvidence && hardTriggered) {
    release = true;
    reason = hardMovement
      ? 'non-threat-economic-hard-movement-limit'
      : 'non-threat-economic-hard-no-damage-limit';
  } else if (!threatEvidence && softTriggered) {
    if (!roiKnown) {
      release = true;
      reason = 'non-threat-economic-roi-unavailable';
    } else if (!roiQualified) {
      release = true;
      reason = 'non-threat-economic-low-roi';
    } else if (!(pressureCycleStartedAt > 0)) {
      pressureCycleStartedAt = nowMs;
      continuePressureCycle = true;
      reason = 'non-threat-economic-pressure-cycle-start';
    } else if (pressureCycleMs <= 0 || nowMs - pressureCycleStartedAt >= pressureCycleMs) {
      release = true;
      reason = 'non-threat-economic-pressure-cycle-complete';
    } else {
      continuePressureCycle = true;
      reason = 'non-threat-economic-pressure-cycle-continue';
    }
  }

  const state = {
    targetId,
    damageProgressAt,
    acceptedShotsSinceDamage,
    movementStaminaSinceDamage,
    stableCloseMs,
    pressureCycleStartedAt,
    updatedAt: nowMs
  };
  return {
    active: Boolean(targetId) && !threatEvidence,
    excluded: threatEvidence,
    release,
    continuePressureCycle,
    reason,
    targetId,
    nowMs,
    damageProgressAt,
    noDamageMs,
    acceptedShotsSinceDamage,
    movementStaminaSinceDamage,
    stableCloseMs,
    softTriggered,
    softNoDamage,
    softMovement,
    hardTriggered,
    hardNoDamage,
    hardMovement,
    marginalNetROI: roiKnown ? marginalNetROI : null,
    requiredRoi: roiKnown ? requiredRoi : null,
    roiKnown,
    roiQualified,
    pressureCycleStartedAt,
    pressureCycleAgeMs: pressureCycleStartedAt > 0 ? Math.max(0, nowMs - pressureCycleStartedAt) : 0,
    limits: {
      softNoDamageMs,
      softMovementStamina,
      hardNoDamageMs,
      hardMovementStamina,
      pressureCycleMs
    },
    state
  };
}

function evaluateEconomicCooldownReentryCore(record = {}, target = {}, evidence = {}, options = {}) {
  const baselineDrop = nonNegative(record.baselineDrop ?? record.targetDrop);
  const currentDrop = nonNegative(target.drop ?? target.Drop ?? target.reward);
  const baselineDistance = nonNegative(record.baselineDistanceCm ?? record.targetDistanceCm);
  const currentDistance = nonNegative(target.distance, Infinity);
  const dropIncreaseRequired = Math.max(
    nonNegative(options.reentryDropMinimum, DEFAULTS.reentryDropMinimum),
    baselineDrop * nonNegative(options.reentryDropRatio, DEFAULTS.reentryDropRatio)
  );
  const distanceDecreaseRequired = Math.max(
    nonNegative(options.reentryDistanceMinimumCm, DEFAULTS.reentryDistanceMinimumCm),
    baselineDistance * nonNegative(options.reentryDistanceRatio, DEFAULTS.reentryDistanceRatio)
  );
  const threatEvidence = Boolean(evidence.threatEvidence || target.firing);
  const dropImproved = currentDrop >= baselineDrop + dropIncreaseRequired;
  const distanceImproved = Number.isFinite(currentDistance)
    && baselineDistance > 0
    && currentDistance <= Math.max(0, baselineDistance - distanceDecreaseRequired);
  const allowed = threatEvidence || dropImproved || distanceImproved;
  return {
    allowed,
    reason: threatEvidence
      ? 'target-became-threat'
      : (dropImproved ? 'target-drop-increased' : (distanceImproved ? 'target-distance-decreased' : 'cooldown-hold')),
    threatEvidence,
    dropImproved,
    distanceImproved,
    baselineDrop,
    currentDrop,
    dropIncreaseRequired,
    baselineDistanceCm: baselineDistance || null,
    currentDistanceCm: Number.isFinite(currentDistance) ? currentDistance : null,
    distanceDecreaseRequiredCm: distanceDecreaseRequired
  };
}

module.exports = {
  COMBAT_ECONOMIC_STOP_LOSS_DEFAULTS: DEFAULTS,
  evaluateEconomicCooldownReentryCore,
  evaluateNonThreatCombatEconomicStopLossCore
};
