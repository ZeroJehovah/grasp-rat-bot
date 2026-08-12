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
const DEFAULT_EFFICIENCY_TARGET_HP = 100;
const DEFAULT_EFFICIENCY_BASE_REWARD_COINS = 100;
const DEFAULT_EFFICIENCY_DROP_REFERENCE_COINS = 100;
const DEFAULT_EFFICIENCY_MIN_REWARD_MULTIPLIER = 0.5;
const DEFAULT_EFFICIENCY_MAX_REWARD_MULTIPLIER = 1;
const DEFAULT_PROFIT_THRESHOLD_COINS_PER_10_STAMINA = 1;
const DEFAULT_EFFICIENCY_REFERENCE_DAMAGE_HP = 9;
const DEFAULT_EFFICIENCY_EXPECTED_DAMAGE_PER_SHOT = 3;
const DEFAULT_EFFICIENCY_EXPECTED_SHOT_CADENCE_MS = 160;
const DEFAULT_EFFICIENCY_MIN_WINDOW_MS = 1000;
const DEFAULT_BALLISTIC_CLOSE_NO_DAMAGE_MS = 3000;
const DEFAULT_BALLISTIC_CLOSE_MIN_ACCEPTED_SHOTS = 8;
const DEFAULT_BALLISTIC_CLOSE_MIN_SELF_HP = 80;
const DEFAULT_BALLISTIC_CLOSE_MIN_DIRECTION_DWELLS = 4;
const DEFAULT_BALLISTIC_CLOSE_MIN_RANGE_CM = 3000;
const DEFAULT_BALLISTIC_CLOSE_MAX_RANGE_CM = 4500;
const DEFAULT_BALLISTIC_CLOSE_FLIGHT_DWELL_RATIO = 0.65;
const DEFAULT_BALLISTIC_CLOSE_ACTIVATION_RATIO = 1;
const DEFAULT_BALLISTIC_CLOSE_HYSTERESIS_CM = 250;
const STAMINA_MILLI_PER_UNIT = 1000;
const PRESSURE_RANGE_CACHE = new WeakMap();

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

function median(values = []) {
  const ordered = values
    .map(Number)
    .filter(value => Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right);
  if (!ordered.length) return null;
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2
    ? ordered[middle]
    : (ordered[middle - 1] + ordered[middle]) / 2;
}

/**
 * Shorten projectile flight only after realtime evidence shows that a passive
 * opponent changes direction at least as quickly as a shot currently travels.
 * The same-target latch survives brief stop phases and the later economic
 * pressure phase, while any threat, damage progress, or unsafe HP releases it.
 */
function combatBallisticCloseCore(input = {}, options = {}) {
  const targetId = String(input.targetId ?? '');
  const previous = input.previousState && typeof input.previousState === 'object'
    ? input.previousState
    : null;
  const sameTargetLatch = Boolean(
    previous?.active === true
      && targetId
      && String(previous.targetId ?? '') === targetId
  );
  const noDamageMinMs = Math.max(0, Number(
    options.combatBallisticCloseNoDamageMs ?? DEFAULT_BALLISTIC_CLOSE_NO_DAMAGE_MS
  ));
  const minAcceptedShots = Math.max(1, Number(
    options.combatBallisticCloseMinAcceptedShots ?? DEFAULT_BALLISTIC_CLOSE_MIN_ACCEPTED_SHOTS
  ));
  const minSelfHp = Math.max(1, Number(
    options.combatBallisticCloseMinSelfHp ?? DEFAULT_BALLISTIC_CLOSE_MIN_SELF_HP
  ));
  const minDirectionDwells = Math.max(2, Number(
    options.combatBallisticCloseMinDirectionDwells
      ?? DEFAULT_BALLISTIC_CLOSE_MIN_DIRECTION_DWELLS
  ));
  const minRangeCm = Math.max(1, Number(
    options.combatBallisticCloseMinRangeCm ?? DEFAULT_BALLISTIC_CLOSE_MIN_RANGE_CM
  ));
  const maxRangeCm = Math.max(minRangeCm, Number(
    options.combatBallisticCloseMaxRangeCm ?? DEFAULT_BALLISTIC_CLOSE_MAX_RANGE_CM
  ));
  const flightDwellRatio = clamp(Number(
    options.combatBallisticCloseFlightDwellRatio
      ?? DEFAULT_BALLISTIC_CLOSE_FLIGHT_DWELL_RATIO
  ), 0.1, 1);
  const activationRatio = Math.max(0.1, Number(
    options.combatBallisticCloseActivationRatio
      ?? DEFAULT_BALLISTIC_CLOSE_ACTIVATION_RATIO
  ));
  const hysteresisCm = Math.max(0, Number(
    options.combatBallisticCloseHysteresisCm ?? DEFAULT_BALLISTIC_CLOSE_HYSTERESIS_CM
  ));
  const tickMs = Math.max(1, Number(
    options.combatServerTickMs ?? options.serverTickMs ?? DEFAULT_SERVER_TICK_MS
  ));
  const bulletSpeedCmPerTick = Math.max(1, Number(
    options.combatBulletSpeedPerTick
      ?? options.bulletSpeedPerTick
      ?? DEFAULT_BULLET_SPEED_CM_PER_TICK
  ));
  const distanceCm = numberOrNull(input.distanceCm ?? input.distance);
  const noDamageMs = Math.max(0, Number(input.noDamageMs || 0));
  const selfNoDamageMs = Math.max(0, Number(input.selfNoDamageMs || 0));
  const acceptedShotsSinceDamage = Math.max(0, Number(input.acceptedShotsSinceDamage || 0));
  const selfHp = numberOrNull(input.selfHp);
  const originIntent = String(input.originIntent || '');
  const currentIntent = String(input.currentIntent || '');
  const defensiveThreatCleared = Boolean(
    originIntent === 'defensive'
      && ['engaged', 'reengage'].includes(currentIntent)
      && selfNoDamageMs >= noDamageMinMs
      && input.recentSelfDamage !== true
  );
  const eligibleEngagement = input.ordinaryProfit === true || defensiveThreatCleared;
  const directionDwells = (Array.isArray(input.directionDwells) ? input.directionDwells : [])
    .map(Number)
    .filter(value => Number.isFinite(value) && value > 0);
  const medianDirectionDwellMs = median(directionDwells);
  const currentFlightMs = distanceCm === null
    ? null
    : distanceCm / bulletSpeedCmPerTick * tickMs;
  let reason = '';
  if (!targetId) reason = 'missing-target';
  else if (selfHp === null || selfHp < minSelfHp) reason = 'unsafe-self-hp';
  else if (input.targetFiring === true) reason = 'target-firing';
  else if (input.targetBulletPressure === true) reason = 'target-bullet-pressure';
  else if (input.persistentThreat === true) reason = 'persistent-target-threat';
  else if (originIntent === 'defensive' && input.recentSelfDamage === true) reason = 'recent-self-damage';
  else if (!eligibleEngagement) reason = originIntent === 'defensive'
    ? 'defensive-threat-not-cleared'
    : 'non-profit-engagement';
  else if (noDamageMs < noDamageMinMs) reason = 'damage-progress-or-insufficient-observation';
  else if (acceptedShotsSinceDamage < minAcceptedShots) reason = 'insufficient-accepted-shots';
  else if (!sameTargetLatch
    && !defensiveThreatCleared
    && input.passiveRunnerConfirmed !== true) reason = 'passive-runner-unconfirmed';
  else if (!sameTargetLatch && directionDwells.length < minDirectionDwells) reason = 'insufficient-direction-dwells';
  else if (!sameTargetLatch && (distanceCm === null || currentFlightMs === null)) reason = 'missing-distance';
  else if (!sameTargetLatch
    && (medianDirectionDwellMs === null
      || medianDirectionDwellMs > currentFlightMs * activationRatio)) {
    reason = 'flight-shorter-than-direction-dwell';
  }
  if (reason) {
    return {
      active: false,
      reason,
      targetId,
      latched: false,
      state: null,
      noDamageMs: Math.round(noDamageMs),
      selfNoDamageMs: Math.round(selfNoDamageMs),
      defensiveThreatCleared,
      acceptedShotsSinceDamage,
      directionDwellSamples: directionDwells.length,
      medianDirectionDwellMs: medianDirectionDwellMs === null
        ? null
        : Math.round(medianDirectionDwellMs),
      currentFlightMs: currentFlightMs === null ? null : Math.round(currentFlightMs)
    };
  }
  const activatedAt = sameTargetLatch
    ? Number(previous.activatedAt || input.nowMs || Date.now())
    : Number(input.nowMs || Date.now());
  const targetRangeCm = sameTargetLatch
    ? clamp(Number(previous.targetRangeCm || minRangeCm), minRangeCm, maxRangeCm)
    : clamp(
        bulletSpeedCmPerTick * medianDirectionDwellMs / tickMs * flightDwellRatio,
        minRangeCm,
        maxRangeCm
      );
  const targetFlightMs = targetRangeCm / bulletSpeedCmPerTick * tickMs;
  const state = {
    active: true,
    targetId,
    activatedAt,
    targetRangeCm: Math.round(targetRangeCm),
    medianDirectionDwellMs: Math.round(
      sameTargetLatch
        ? Number(previous.medianDirectionDwellMs || medianDirectionDwellMs || 0)
        : medianDirectionDwellMs
    )
  };
  return {
    active: true,
    reason: sameTargetLatch
      ? 'same-target-latched'
      : (defensiveThreatCleared
          ? 'defensive-threat-cleared-projectile-flight-exceeds-direction-dwell'
          : 'projectile-flight-exceeds-direction-dwell'),
    targetId,
    latched: sameTargetLatch,
    state,
    targetRangeCm: state.targetRangeCm,
    minRangeCm,
    maxRangeCm,
    hysteresisCm,
    noDamageMs: Math.round(noDamageMs),
    selfNoDamageMs: Math.round(selfNoDamageMs),
    defensiveThreatCleared,
    acceptedShotsSinceDamage,
    directionDwellSamples: directionDwells.length,
    medianDirectionDwellMs: state.medianDirectionDwellMs,
    currentFlightMs: currentFlightMs === null ? null : Math.round(currentFlightMs),
    targetFlightMs: Math.round(targetFlightMs),
    flightDwellRatio
  };
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
  const zeroLatencyUnreliableRangeCm = bulletSpeed * clearanceTicks;
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
  const cached = options && typeof options === 'object' ? PRESSURE_RANGE_CACHE.get(options) : null;
  if (cached
    && cached.rangeCm === rangeCm
    && cached.minRangeCm === minRangeCm
    && cached.maxRangeCm === maxRangeCm
    && cached.reactiveBoundaryCm === reactiveBoundaryCm
    && cached.normalMinRangeCm === normalMinRangeCm
    && cached.normalMaxRangeCm === normalMaxRangeCm
    && cached.unconstrainedRangeCm === unconstrainedRangeCm
    && cached.flightMs === flightMs
    && cached.responseBudgetMs === responseBudgetMs
    && cached.tickMs === tickMs
    && cached.bulletSpeed === bulletSpeed
    && cached.controlIntervalMs === controlIntervalMs
    && cached.p90Ticks === p90Ticks
    && cached.playerSpeed === playerSpeed
    && cached.hitRadius === hitRadius
    && cached.clearanceTicks === clearanceTicks
    && cached.clearanceMs === clearanceMs
    && cached.zeroLatencyUnreliableRangeCm === zeroLatencyUnreliableRangeCm
    && cached.frameJitterMs === frameJitterMs
    && cached.reactionSafetyMarginMs === reactionSafetyMarginMs) {
    return cached.value;
  }
  const value = {
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
    zeroLatencyUnreliableRangeCm: Math.round(zeroLatencyUnreliableRangeCm),
    frameJitterMs: Math.round(frameJitterMs),
    reactionSafetyMarginMs: Math.round(reactionSafetyMarginMs),
    ballisticConstraintSatisfied: flightMs <= responseBudgetMs
  };
  if (options && typeof options === 'object') {
    PRESSURE_RANGE_CACHE.set(options, {
      rangeCm,
      minRangeCm,
      maxRangeCm,
      reactiveBoundaryCm,
      normalMinRangeCm,
      normalMaxRangeCm,
      unconstrainedRangeCm,
      flightMs,
      responseBudgetMs,
      tickMs,
      bulletSpeed,
      controlIntervalMs,
      p90Ticks,
      playerSpeed,
      hitRadius,
      clearanceTicks,
      clearanceMs,
      zeroLatencyUnreliableRangeCm,
      frameJitterMs,
      reactionSafetyMarginMs,
      value
    });
  }
  return value;
}

function ordinaryProfitEngagement(input = {}) {
  if (input.ordinaryProfit === true) return true;
  if (input.ordinaryProfit === false) return false;
  const values = [input.originIntent, input.intent].map(value => String(value || ''));
  return values.some(value => ['profit', 'engaged', 'reengage', 'afk-profit'].includes(value));
}

function combatDamageEfficiencyThresholdCore(targetDrop, options = {}) {
  const targetHpBasis = Math.max(0, Number(
    options.combatEfficiencyTargetHp ?? DEFAULT_EFFICIENCY_TARGET_HP
  ));
  const baseRewardCoins = Math.max(0, Number(
    options.combatEfficiencyBaseRewardCoins ?? DEFAULT_EFFICIENCY_BASE_REWARD_COINS
  ));
  const dropReferenceCoins = Math.max(1, Number(
    options.combatEfficiencyDropReferenceCoins ?? DEFAULT_EFFICIENCY_DROP_REFERENCE_COINS
  ));
  const minRewardMultiplier = clamp(Number(
    options.combatEfficiencyMinRewardMultiplier ?? DEFAULT_EFFICIENCY_MIN_REWARD_MULTIPLIER
  ), 0, 1);
  const maxRewardMultiplier = clamp(Number(
    options.combatEfficiencyMaxRewardMultiplier ?? DEFAULT_EFFICIENCY_MAX_REWARD_MULTIPLIER
  ), minRewardMultiplier, 1);
  const normalizedDrop = Math.max(0, numberOrNull(targetDrop) ?? 0);
  const rewardMultiplier = clamp(
    normalizedDrop / dropReferenceCoins,
    minRewardMultiplier,
    maxRewardMultiplier
  );
  const effectiveRewardCoins = baseRewardCoins * rewardMultiplier;
  const thresholdCoinsPer10Stamina = Math.max(0, Number(
    options.profitThresholdCoinsPer10Stamina
      ?? DEFAULT_PROFIT_THRESHOLD_COINS_PER_10_STAMINA
  ));
  const requiredHpPerStamina = effectiveRewardCoins > 0
    ? targetHpBasis * thresholdCoinsPer10Stamina / (effectiveRewardCoins * 10)
    : Infinity;
  return {
    targetDrop: normalizedDrop,
    targetHpBasis,
    baseRewardCoins,
    dropReferenceCoins,
    minRewardMultiplier,
    maxRewardMultiplier,
    rewardMultiplier: Number(rewardMultiplier.toFixed(4)),
    effectiveRewardCoins: Number(effectiveRewardCoins.toFixed(4)),
    thresholdCoinsPer10Stamina,
    requiredHpPerStamina: Number.isFinite(requiredHpPerStamina)
      ? Number(requiredHpPerStamina.toFixed(6))
      : null
  };
}

/**
 * Derive the observation window from the time needed to produce the target
 * reference damage at the current economic efficiency threshold. The legacy
 * fixed window remains available only as an explicit override for replay and
 * rollback; production defaults to this Drop-aware calculation.
 */
function combatEfficiencyWindowCore(efficiencyThreshold, options = {}) {
  const referenceDamageHp = Math.max(0.1, Number(
    options.combatEfficiencyReferenceDamageHp ?? DEFAULT_EFFICIENCY_REFERENCE_DAMAGE_HP
  ));
  const expectedDamagePerShot = Math.max(0.1, Number(
    options.combatEfficiencyExpectedDamagePerShot ?? DEFAULT_EFFICIENCY_EXPECTED_DAMAGE_PER_SHOT
  ));
  const expectedShotCadenceMs = Math.max(1, Number(
    options.combatEfficiencyExpectedShotCadenceMs
      ?? options.combatShootMinIntervalMs
      ?? DEFAULT_EFFICIENCY_EXPECTED_SHOT_CADENCE_MS
  ));
  const shotStaminaMilli = Math.max(1, Number(
    options.combatEfficiencyShotStaminaMilli
      ?? options.combatShotStaminaCostMs
      ?? options.opportunityShotStaminaCostMs
      ?? 500
  ));
  const shotStamina = shotStaminaMilli / STAMINA_MILLI_PER_UNIT;
  const requiredHpPerStamina = numberOrNull(efficiencyThreshold?.requiredHpPerStamina);
  const expectedHitRateRaw = requiredHpPerStamina !== null && requiredHpPerStamina > 0
    ? requiredHpPerStamina * shotStamina / expectedDamagePerShot
    : null;
  const expectedHitRate = expectedHitRateRaw === null
    ? null
    : clamp(expectedHitRateRaw, 0, 1);
  const expectedShotsForReferenceDamage = expectedHitRate !== null && expectedHitRate > 0
    ? referenceDamageHp / (expectedDamagePerShot * expectedHitRate)
    : null;
  const expectedStaminaForReferenceDamage = expectedShotsForReferenceDamage === null
    ? null
    : expectedShotsForReferenceDamage * shotStamina;
  const derivedWindowMs = expectedShotsForReferenceDamage === null
    ? null
    : expectedShotsForReferenceDamage * expectedShotCadenceMs;
  const explicitWindowMs = numberOrNull(options.combatEfficiencyWindowMs);
  const minimumWindowMs = Math.max(1, Number(
    options.combatEfficiencyMinimumWindowMs ?? DEFAULT_EFFICIENCY_MIN_WINDOW_MS
  ));
  const hasExplicitWindow = explicitWindowMs !== null && explicitWindowMs > 0;
  const evaluationWindowMs = Math.max(
    minimumWindowMs,
    hasExplicitWindow
      ? explicitWindowMs
      : (derivedWindowMs ?? minimumWindowMs)
  );
  return {
    windowMode: hasExplicitWindow ? 'explicit-override' : 'expected-9-hp',
    referenceDamageHp: Number(referenceDamageHp.toFixed(3)),
    expectedDamagePerShot: Number(expectedDamagePerShot.toFixed(3)),
    expectedShotCadenceMs: Math.round(expectedShotCadenceMs),
    shotStaminaMilli: Math.round(shotStaminaMilli),
    shotStamina: Number(shotStamina.toFixed(3)),
    expectedHitRate: expectedHitRate === null ? null : Number(expectedHitRate.toFixed(6)),
    expectedShotsForReferenceDamage: expectedShotsForReferenceDamage === null
      ? null
      : Number(expectedShotsForReferenceDamage.toFixed(3)),
    expectedStaminaForReferenceDamage: expectedStaminaForReferenceDamage === null
      ? null
      : Number(expectedStaminaForReferenceDamage.toFixed(3)),
    derivedWindowMs: derivedWindowMs === null ? null : Math.round(derivedWindowMs),
    evaluationWindowMs: Math.round(evaluationWindowMs)
  };
}

/**
 * Resolve time-bounded close pressure for one target. Every completed window
 * compares cumulative target HP loss with the actual total stamina spent.
 * Shot count remains diagnostic and never gates distance control or stop-loss.
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
  const previousEfficiency = sameTarget
    ? (previous?.combatEfficiency
      || previousClosePressure?.combatEfficiency
      || previousClosePressure?.efficiencyWindow
      || null)
    : null;
  const targetDistance = numberOrNull(input.distance ?? input.targetDistance);
  const acceptedShotsSinceDamage = Math.max(0, Math.round(Number(input.acceptedShotsSinceDamage || 0)));
  const damageProgressAt = Math.max(0, Number(input.damageProgressAt || input.lastDamageAt || startedAt || nowMs));
  const noDamageMs = Math.max(0, nowMs - damageProgressAt);
  const ballisticRange = combatPressureTargetRangeCore(options);
  const stepCm = Math.max(100, Number(options.combatEfficiencyCloseStepCm ?? 1000));
  const minimumDistanceCm = Math.max(0, Number(
    options.combatEfficiencyMinimumDistanceCm ?? ballisticRange.zeroLatencyUnreliableRangeCm
  ));
  const requiredCloserRatio = clamp(Number(options.combatEfficiencyRequiredCloserRatio ?? 0.5), 0, 1);
  const arrivalToleranceCm = Math.max(0, Number(options.combatEfficiencyArrivalToleranceCm ?? 100));
  const sampleGapCapMs = Math.max(
    50,
    Number(options.combatEfficiencySampleGapCapMs
      ?? Math.max(250, Number(options.combatControlIntervalMs || DEFAULT_CONTROL_INTERVAL_MS) * 5))
  );
  const targetDamageTotal = Math.max(0, Number(
    input.targetDamageTotal ?? input.totalTargetDamage ?? damageFromStart ?? 0
  ));
  const totalStaminaValue = numberOrNull(
    input.totalStaminaSpentMilli ?? input.combatStaminaSpentMilli ?? input.totalStaminaSpent
  );
  const staminaKnown = totalStaminaValue !== null;
  const totalStaminaSpentMilli = staminaKnown ? Math.max(0, totalStaminaValue) : null;
  const efficiencyThreshold = combatDamageEfficiencyThresholdCore(
    input.targetDrop ?? input.drop,
    options
  );
  const efficiencyWindow = combatEfficiencyWindowCore(efficiencyThreshold, options);
  const evaluationWindowMs = efficiencyWindow.evaluationWindowMs;
  const priorWindowStartedAt = Math.max(0, Number(previousEfficiency?.startedAt || 0));
  let windowStartedAt = priorWindowStartedAt
    || Math.max(0, startedAt ?? nowMs);
  let windowStartDamageTotal = Math.max(0, Number(previousEfficiency?.startDamageTotal || 0));
  let windowStartStaminaMilli = Math.max(0, Number(previousEfficiency?.startStaminaMilli || 0));
  const staminaCounterReset = Boolean(
    staminaKnown
      && previousEfficiency?.staminaKnown === true
      && totalStaminaSpentMilli < windowStartStaminaMilli
  );
  const damageCounterReset = targetDamageTotal < windowStartDamageTotal;
  if (staminaCounterReset || damageCounterReset) {
    windowStartedAt = nowMs;
    windowStartDamageTotal = targetDamageTotal;
    windowStartStaminaMilli = totalStaminaSpentMilli ?? 0;
  }
  const windowElapsedMs = Math.max(0, nowMs - windowStartedAt);
  const windowDamageHp = Math.max(0, targetDamageTotal - windowStartDamageTotal);
  const windowStaminaMilli = staminaKnown
    ? Math.max(0, totalStaminaSpentMilli - windowStartStaminaMilli)
    : null;
  const windowStaminaUnits = windowStaminaMilli === null
    ? null
    : windowStaminaMilli / STAMINA_MILLI_PER_UNIT;
  const damageEfficiencyHpPerStamina = windowStaminaUnits === null
    ? null
    : (windowStaminaUnits > 0
        ? windowDamageHp / windowStaminaUnits
        : (windowDamageHp > 0 ? Infinity : 0));
  const windowComplete = windowElapsedMs >= evaluationWindowMs;
  const efficiencyMeasurable = damageEfficiencyHpPerStamina !== null;
  const lowDamageEfficiency = Boolean(
    windowComplete
      && (efficiencyMeasurable
        ? damageEfficiencyHpPerStamina < Number(efficiencyThreshold.requiredHpPerStamina ?? Infinity)
        : windowDamageHp <= 0)
  );
  const efficiencyAcceptable = Boolean(windowComplete && !lowDamageEfficiency);
  const wasActive = Boolean(
    !hardSafety
      && sameTarget
      && previousPhase === 'close-pressure'
      && previousClosePressure?.active === true
  );
  let active = wasActive;
  let phaseStartedAt = wasActive
    ? Math.max(0, Number(previous.phaseStartedAt || previousClosePressure.phaseStartedAt || nowMs))
    : nowMs;

  let stepIndex = 0;
  let stepStartedAt = 0;
  let stepStartDistanceCm = null;
  let goalDistanceCm = null;
  let bestDistanceCm = null;
  let goalReachedAt = 0;
  let stepAdvanced = false;
  let completedSteps = wasActive
    ? Math.max(0, Math.round(Number(previousClosePressure?.completedSteps || 0)))
    : 0;
  let closerTimeMs = wasActive
    ? Math.max(0, Number(previousClosePressure?.closerTimeMs || 0))
    : 0;
  let lastObservedAt = wasActive
    ? Math.max(0, Number(previousClosePressure?.lastObservedAt || 0))
    : nowMs;
  let previousWithinGoal = wasActive
    ? previousClosePressure?.withinGoal === true
    : false;
  let lastCompletedWindow = previousEfficiency?.lastCompletedWindow
    || previousClosePressure?.lastCompletedWindow
    || null;
  let distanceControlFailed = false;
  let minimumRangeNoProgress = false;
  let exitRequired = false;
  let justCompletedWindow = null;

  if (wasActive) {
    stepIndex = Math.max(1, Math.round(Number(previousClosePressure.stepIndex || 1)));
    stepStartedAt = Math.max(0, Number(previousClosePressure.stepStartedAt || windowStartedAt || nowMs));
    stepStartDistanceCm = numberOrNull(previousClosePressure.stepStartDistanceCm)
      ?? targetDistance
      ?? numberOrNull(previous.distance);
    goalDistanceCm = numberOrNull(previousClosePressure.goalDistanceCm)
      ?? Math.max(minimumDistanceCm, Number(stepStartDistanceCm ?? ballisticRange.rangeCm) - stepCm);
    const priorBestDistance = numberOrNull(previousClosePressure.bestDistanceCm);
    bestDistanceCm = targetDistance === null
      ? priorBestDistance
      : Math.min(priorBestDistance ?? targetDistance, targetDistance);
    goalReachedAt = Math.max(0, Number(previousClosePressure.goalReachedAt || 0));
    const withinGoalBeforeEvaluation = Boolean(
      targetDistance !== null && targetDistance <= goalDistanceCm + arrivalToleranceCm
    );
    if (lastObservedAt > 0 && nowMs > lastObservedAt
      && previousWithinGoal && targetDistance !== null) {
      closerTimeMs += Math.min(sampleGapCapMs, nowMs - lastObservedAt);
    }
    if (withinGoalBeforeEvaluation && !goalReachedAt) goalReachedAt = nowMs;
    lastObservedAt = nowMs;
    previousWithinGoal = withinGoalBeforeEvaluation;
    const closeRatioAtEvaluation = windowElapsedMs > 0
      ? Math.min(1, closerTimeMs / windowElapsedMs)
      : 0;

    if (windowComplete) {
      justCompletedWindow = {
        phase: 'close-pressure',
        stepIndex,
        startedAt: windowStartedAt,
        endedAt: nowMs,
        elapsedMs: Math.round(windowElapsedMs),
        targetDamageHp: Number(windowDamageHp.toFixed(3)),
        staminaSpentMilli: windowStaminaMilli === null ? null : Math.round(windowStaminaMilli),
        staminaSpent: windowStaminaUnits === null ? null : Number(windowStaminaUnits.toFixed(3)),
        damageEfficiencyHpPerStamina: Number.isFinite(damageEfficiencyHpPerStamina)
          ? Number(damageEfficiencyHpPerStamina.toFixed(6))
          : null,
        requiredHpPerStamina: efficiencyThreshold.requiredHpPerStamina,
        lowDamageEfficiency,
        efficiencyMeasurable,
        closerTimeMs: Math.round(closerTimeMs),
        closerRatio: Number(closeRatioAtEvaluation.toFixed(3)),
        outsideCloserRatio: Number((1 - closeRatioAtEvaluation).toFixed(3)),
        goalDistanceCm: Math.round(goalDistanceCm),
        rewardMultiplier: efficiencyThreshold.rewardMultiplier,
        effectiveRewardCoins: efficiencyThreshold.effectiveRewardCoins,
        targetDrop: efficiencyThreshold.targetDrop,
        ...efficiencyWindow
      };
      lastCompletedWindow = justCompletedWindow;
      if (efficiencyAcceptable) {
        active = false;
        windowStartedAt = nowMs;
        windowStartDamageTotal = targetDamageTotal;
        windowStartStaminaMilli = totalStaminaSpentMilli ?? 0;
      } else if (lowDamageEfficiency) {
        distanceControlFailed = closeRatioAtEvaluation < requiredCloserRatio;
        minimumRangeNoProgress = !distanceControlFailed && goalDistanceCm <= minimumDistanceCm;
        exitRequired = distanceControlFailed || minimumRangeNoProgress;
        if (!exitRequired) {
          completedSteps = Math.max(completedSteps, stepIndex);
          stepIndex += 1;
          stepStartedAt = nowMs;
          stepStartDistanceCm = targetDistance ?? bestDistanceCm ?? goalDistanceCm;
          goalDistanceCm = Math.max(minimumDistanceCm, goalDistanceCm - stepCm);
          bestDistanceCm = targetDistance;
          goalReachedAt = 0;
          closerTimeMs = 0;
          lastObservedAt = nowMs;
          previousWithinGoal = Boolean(
            targetDistance !== null && targetDistance <= goalDistanceCm + arrivalToleranceCm
          );
          stepAdvanced = true;
          windowStartedAt = nowMs;
          windowStartDamageTotal = targetDamageTotal;
          windowStartStaminaMilli = totalStaminaSpentMilli ?? 0;
        }
      }
    }
  } else if (!hardSafety && sameTarget && lowDamageEfficiency) {
    active = true;
    phaseStartedAt = nowMs;
    stepIndex = 1;
    stepStartedAt = nowMs;
    stepStartDistanceCm = targetDistance ?? numberOrNull(previous.distance);
    const startDistance = stepStartDistanceCm ?? ballisticRange.rangeCm + stepCm;
    goalDistanceCm = Math.max(
      minimumDistanceCm,
      Math.min(ballisticRange.rangeCm, startDistance - stepCm)
    );
    bestDistanceCm = targetDistance;
    goalReachedAt = 0;
    closerTimeMs = 0;
    lastObservedAt = nowMs;
    previousWithinGoal = Boolean(
      targetDistance !== null && targetDistance <= goalDistanceCm + arrivalToleranceCm
    );
    justCompletedWindow = {
      phase: 'normal-combat',
      stepIndex: 0,
      startedAt: windowStartedAt,
      endedAt: nowMs,
      elapsedMs: Math.round(windowElapsedMs),
      targetDamageHp: Number(windowDamageHp.toFixed(3)),
      staminaSpentMilli: windowStaminaMilli === null ? null : Math.round(windowStaminaMilli),
      staminaSpent: windowStaminaUnits === null ? null : Number(windowStaminaUnits.toFixed(3)),
      damageEfficiencyHpPerStamina: Number.isFinite(damageEfficiencyHpPerStamina)
        ? Number(damageEfficiencyHpPerStamina.toFixed(6))
        : null,
      requiredHpPerStamina: efficiencyThreshold.requiredHpPerStamina,
      lowDamageEfficiency: true,
      efficiencyMeasurable,
      closerTimeMs: 0,
      closerRatio: 0,
      outsideCloserRatio: 1,
      goalDistanceCm: null,
      rewardMultiplier: efficiencyThreshold.rewardMultiplier,
      effectiveRewardCoins: efficiencyThreshold.effectiveRewardCoins,
      targetDrop: efficiencyThreshold.targetDrop,
      ...efficiencyWindow
    };
    lastCompletedWindow = justCompletedWindow;
    windowStartedAt = nowMs;
    windowStartDamageTotal = targetDamageTotal;
    windowStartStaminaMilli = totalStaminaSpentMilli ?? 0;
  } else if (!wasActive && windowComplete) {
    justCompletedWindow = {
      phase: 'normal-combat',
      stepIndex: 0,
      startedAt: windowStartedAt,
      endedAt: nowMs,
      elapsedMs: Math.round(windowElapsedMs),
      targetDamageHp: Number(windowDamageHp.toFixed(3)),
      staminaSpentMilli: windowStaminaMilli === null ? null : Math.round(windowStaminaMilli),
      staminaSpent: windowStaminaUnits === null ? null : Number(windowStaminaUnits.toFixed(3)),
      damageEfficiencyHpPerStamina: Number.isFinite(damageEfficiencyHpPerStamina)
        ? Number(damageEfficiencyHpPerStamina.toFixed(6))
        : null,
      requiredHpPerStamina: efficiencyThreshold.requiredHpPerStamina,
      lowDamageEfficiency: false,
      efficiencyMeasurable,
      closerTimeMs: 0,
      closerRatio: 0,
      outsideCloserRatio: 1,
      goalDistanceCm: null,
      rewardMultiplier: efficiencyThreshold.rewardMultiplier,
      effectiveRewardCoins: efficiencyThreshold.effectiveRewardCoins,
      targetDrop: efficiencyThreshold.targetDrop,
      ...efficiencyWindow
    };
    lastCompletedWindow = justCompletedWindow;
    windowStartedAt = nowMs;
    windowStartDamageTotal = targetDamageTotal;
    windowStartStaminaMilli = totalStaminaSpentMilli ?? 0;
  }

  if (active && !wasActive && stepIndex === 0) {
    // Defensive fallback for callers that restore only the phase marker.
    stepIndex = 1;
    stepStartedAt = nowMs;
    stepStartDistanceCm = targetDistance ?? numberOrNull(previous.distance);
    const startDistance = stepStartDistanceCm ?? ballisticRange.rangeCm + stepCm;
    goalDistanceCm = Math.max(
      minimumDistanceCm,
      Math.min(ballisticRange.rangeCm, startDistance - stepCm)
    );
    bestDistanceCm = targetDistance;
    lastObservedAt = nowMs;
  }

  if (!active && !exitRequired) {
    stepIndex = 0;
    stepStartedAt = 0;
    stepStartDistanceCm = null;
    goalDistanceCm = null;
    bestDistanceCm = null;
    goalReachedAt = 0;
    closerTimeMs = 0;
    lastObservedAt = nowMs;
    previousWithinGoal = false;
  }

  const phase = active ? 'close-pressure' : 'normal-combat';
  if (!active) phaseStartedAt = nowMs;
  const withinGoal = Boolean(
    active && targetDistance !== null && targetDistance <= goalDistanceCm + arrivalToleranceCm
  );
  const stepElapsedMs = active && stepStartedAt > 0 ? Math.max(0, nowMs - stepStartedAt) : 0;
  const closerRatio = stepElapsedMs > 0 ? Math.min(1, closerTimeMs / stepElapsedMs) : 0;
  const stepWindowComplete = Boolean(active && !stepAdvanced && windowComplete);
  const range = active ? {
    ...ballisticRange,
    rangeCm: Math.round(goalDistanceCm),
    minRangeCm: 0,
    maxRangeCm: Math.round(goalDistanceCm + arrivalToleranceCm),
    normalMinRangeCm: Math.round(goalDistanceCm + arrivalToleranceCm + 1),
    normalMaxRangeCm: Math.round(goalDistanceCm + arrivalToleranceCm + stepCm),
    progressiveMissClose: true,
    efficiencyDistanceControl: true
  } : null;
  const pressureAttackCommitted = active;
  const subphase = active ? (withinGoal ? 'pressure-attack' : 'closing') : 'normal-combat';
  const triggerReason = active
    ? (wasActive ? 'low-damage-efficiency-window-latched' : 'low-damage-efficiency-window-threshold')
    : '';
  const currentEfficiency = {
    startedAt: windowStartedAt,
    startDamageTotal: Number(windowStartDamageTotal.toFixed(3)),
    startStaminaMilli: Math.round(windowStartStaminaMilli),
    staminaKnown,
    targetDamageTotal: Number(targetDamageTotal.toFixed(3)),
    totalStaminaSpentMilli: totalStaminaSpentMilli === null ? null : Math.round(totalStaminaSpentMilli),
    elapsedMs: Math.round(Math.max(0, nowMs - windowStartedAt)),
    targetDamageHp: Number(Math.max(0, targetDamageTotal - windowStartDamageTotal).toFixed(3)),
    staminaSpentMilli: totalStaminaSpentMilli === null
      ? null
      : Math.round(Math.max(0, totalStaminaSpentMilli - windowStartStaminaMilli)),
    lastCompletedWindow
  };
  return {
    phase,
    active,
    sameTarget,
    targetId,
    ordinaryProfit,
    engagedMs: Math.round(engagedMs),
    noDamageTrigger: Boolean(lowDamageEfficiency && windowDamageHp <= 0),
    noDamageMs: Math.round(noDamageMs),
    maxDurationTrigger: false,
    triggerReason,
    phaseStartedAt,
    firstHp,
    minHp,
    targetHp,
    damageFromStart: damageFromStart === null ? null : Math.round(damageFromStart * 10) / 10,
    damageKnown,
    acceptedShotsSinceDamage,
    stepCm: Math.round(stepCm),
    minimumDistanceCm: Math.round(minimumDistanceCm),
    timeoutMs: Math.round(evaluationWindowMs),
    evaluationWindowMs: Math.round(evaluationWindowMs),
    requiredCloserRatio,
    sampleGapCapMs: Math.round(sampleGapCapMs),
    arrivalToleranceCm: Math.round(arrivalToleranceCm),
    damageProgressAt,
    generationStartedAt: phaseStartedAt,
    generationDeadlineAt: active ? windowStartedAt + evaluationWindowMs : 0,
    generationElapsedMs: active ? Math.round(Math.max(0, nowMs - phaseStartedAt)) : 0,
    generationTimedOut: false,
    generationStepLimitReached: minimumRangeNoProgress,
    generationLimitReached: minimumRangeNoProgress,
    completedSteps,
    generationAcceptedShots: acceptedShotsSinceDamage,
    generationShootingStamina: Math.max(0, Number(input.shootingStaminaSinceDamage
      ?? acceptedShotsSinceDamage * Math.max(1, Number(options.combatShotStaminaCostMs ?? 500)))),
    generationMovementStamina: Math.max(0, Number(input.movementStaminaSinceDamage || 0)),
    lastTargetDamageAt: damageProgressAt,
    attackEfficiency: {
      basis: 'realtime-target-hp-loss-per-actual-total-stamina',
      windowMs: Math.round(evaluationWindowMs),
      windowMode: efficiencyWindow.windowMode,
      referenceDamageHp: efficiencyWindow.referenceDamageHp,
      expectedDamagePerShot: efficiencyWindow.expectedDamagePerShot,
      expectedShotCadenceMs: efficiencyWindow.expectedShotCadenceMs,
      shotStaminaMilli: efficiencyWindow.shotStaminaMilli,
      expectedHitRate: efficiencyWindow.expectedHitRate,
      expectedShotsForReferenceDamage: efficiencyWindow.expectedShotsForReferenceDamage,
      expectedStaminaForReferenceDamage: efficiencyWindow.expectedStaminaForReferenceDamage,
      derivedWindowMs: efficiencyWindow.derivedWindowMs,
      windowComplete,
      measurable: efficiencyMeasurable,
      targetDamageObserved: windowDamageHp > 0,
      targetDamageHp: Number(windowDamageHp.toFixed(3)),
      staminaSpentMilli: windowStaminaMilli === null ? null : Math.round(windowStaminaMilli),
      staminaSpent: windowStaminaUnits === null ? null : Number(windowStaminaUnits.toFixed(3)),
      hpPerStamina: Number.isFinite(damageEfficiencyHpPerStamina)
        ? Number(damageEfficiencyHpPerStamina.toFixed(6))
        : null,
      requiredHpPerStamina: efficiencyThreshold.requiredHpPerStamina,
      low: lowDamageEfficiency,
      acceptable: efficiencyAcceptable,
      reward: efficiencyThreshold,
      completed: justCompletedWindow
    },
    combatEfficiency: currentEfficiency,
    efficiencyWindow: currentEfficiency,
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
    goalReachedAcceptedShots: acceptedShotsSinceDamage,
    shotsAfterGoal: 0,
    withinGoal,
    stepAdvanced,
    stepElapsedMs: Math.round(stepElapsedMs),
    stepTimedOut: distanceControlFailed,
    stepWindowComplete,
    closerTimeMs: Math.round(closerTimeMs),
    closerRatio: Number(closerRatio.toFixed(3)),
    outsideCloserRatio: Number((1 - closerRatio).toFixed(3)),
    distanceControlFailed,
    minimumRangeNoProgress,
    minimumRangeLowEfficiency: minimumRangeNoProgress,
    exitRequired,
    exitRule: distanceControlFailed
      ? 'closer-range-control-failed'
      : (minimumRangeNoProgress ? 'minimum-range-no-progress' : ''),
    lastObservedAt,
    lastCompletedWindow,
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
  combatBallisticCloseCore,
  combatDamageEfficiencyThresholdCore,
  combatEfficiencyWindowCore,
  combatPressureTargetRangeCore,
  combatPressurePhaseCore,
  combatPressureStrafeCore
};
