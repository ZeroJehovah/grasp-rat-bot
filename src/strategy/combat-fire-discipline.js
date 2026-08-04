'use strict';

/**
 * Combat Fire Discipline
 *
 * Determines when and how to shoot during combat based on stamina, reserves,
 * and tactical context.
 */

const { COMBAT_CONSTANTS } = require('./combat-constants');

/**
 * Combat fire state enumeration
 */
const FIRE_STATE = {
  DISABLED: 'disabled',           // Cannot fire
  PAUSED: 'paused',              // Pausing to recover dodge stamina
  RESERVE_BAND: 'reserve-band',  // Reserve band throttled fire
  NORMAL: 'normal',              // Normal fire cadence
  PROBE: 'probe',                // Opponent probe fire
  FINISH: 'finish',              // Finishing low threat
  PRESSURE: 'pressure'           // Under/applying pressure
};

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function stamina5sRemaining(self) {
  if (!self || typeof self !== 'object') return null;
  return numberOrNull(
    self.stamina_5s_remaining_milli
      ?? self.stamina5sRemainingMilli
      ?? self.stamina5s
      ?? self.stamina_5s
  );
}

/**
 * Determine combat fire state based on stamina and context
 *
 * @param {Object} self - Self entity
 * @param {Object} target - Combat target
 * @param {Object} context - Combat context
 * @returns {Object} { state, cadenceMs, reserve, reason }
 */
function determineCombatFireState(self, target, context = {}) {
  const stamina5s = stamina5sRemaining(self);
  const hardReserve = Math.max(
    0,
    Number(context.hardReserveMs ?? COMBAT_CONSTANTS.SHOOT_HARD_RESERVE_MS)
  );
  const dodgeReserve = Math.max(
    hardReserve,
    Number(context.dodgeReserveMs ?? COMBAT_CONSTANTS.SHOOT_DODGE_RESERVE_MS)
  );
  const shotCostMs = Math.max(0, Number(context.shotCostMs ?? 500));
  const dodgeActionCostMs = Math.max(0, Number(context.dodgeActionCostMs ?? 0));
  const requiredForShot = reserve => Math.max(0, Number(reserve || 0))
    + shotCostMs
    + dodgeActionCostMs;
  const requiredForReserve = reserve => Math.max(0, Number(reserve || 0)) + dodgeActionCostMs;
  const result = (state, cadenceMs, reserve, reason) => ({
    state,
    cadenceMs,
    reserve,
    reason,
    stamina5s,
    hardReserve,
    dodgeReserve,
    shotCostMs,
    dodgeActionCostMs,
    requiredStaminaMs: requiredForShot(reserve)
  });

  // Hard floor - never fire below this
  if (stamina5s !== null && stamina5s < hardReserve) {
    return result(FIRE_STATE.DISABLED, Infinity, hardReserve, 'below-hard-reserve');
  }

  // Check guarded fire windows

  // Opponent probe (early engagement without target bullet evidence)
  if (context.opponentProbe) {
    const probeReserve = Math.max(
      hardReserve,
      Number(context.opponentProbeReserveMs ?? COMBAT_CONSTANTS.OPPONENT_PROBE_RESERVE_MS)
    );
    if (stamina5s !== null && stamina5s < requiredForShot(probeReserve)) {
      return result(FIRE_STATE.PAUSED, Infinity, probeReserve, 'probe-reserve');
    }
    return result(
      FIRE_STATE.PROBE,
      Number(context.opponentProbeEveryMs ?? COMBAT_CONSTANTS.OPPONENT_PROBE_EVERY_MS),
      probeReserve,
      'opponent-probe'
    );
  }

  // Finish low threat (low HP target, high HP self, no pressure)
  if (context.finishLowThreat) {
    const finishReserve = Math.max(
      hardReserve,
      Number(context.finishReserveMs ?? COMBAT_CONSTANTS.FINISH_LOW_THREAT_RESERVE_MS)
    );
    if (stamina5s !== null && stamina5s < requiredForShot(finishReserve)) {
      return result(FIRE_STATE.PAUSED, Infinity, finishReserve, 'finish-reserve');
    }
    return result(FIRE_STATE.FINISH, COMBAT_CONSTANTS.SHOOT_EVERY_MS, finishReserve, 'finish-low-threat');
  }

  // Close pressure resolves cadence and stamina reserve. Stable close-range
  // ownership may bypass ordinary probe/coverage shot-count gates later.
  if (context.closePressure) {
    const closePressureReserve = Math.max(
      hardReserve,
      Number(context.closePressureReserveMs ?? COMBAT_CONSTANTS.SHOOT_DODGE_RESERVE_MS)
    );
    if (context.closePressureAttack) {
      if (stamina5s !== null && stamina5s < requiredForShot(closePressureReserve)) {
        return result(FIRE_STATE.PAUSED, Infinity, closePressureReserve, 'close-pressure-movement-reserve');
      }
      return result(FIRE_STATE.PRESSURE, COMBAT_CONSTANTS.SHOOT_EVERY_MS, closePressureReserve, 'close-pressure-full-attack');
    }
    const closePressureCadence = Math.max(
      COMBAT_CONSTANTS.SHOOT_EVERY_MS,
      Number(context.closePressureCadenceMs ?? COMBAT_CONSTANTS.SHOOT_RESERVE_BAND_MS)
    );
    if (stamina5s !== null && stamina5s < requiredForReserve(closePressureReserve)) {
      return result(
        FIRE_STATE.RESERVE_BAND,
        Math.max(closePressureCadence, COMBAT_CONSTANTS.SHOOT_RESERVE_BAND_MS),
        closePressureReserve,
        'close-pressure-reserve-band'
      );
    }
    return result(FIRE_STATE.PRESSURE, closePressureCadence, closePressureReserve, 'close-pressure-fire');
  }

  // Passive runner (no threat, safe to fire)
  if (context.passiveRunner) {
    const passiveReserve = Math.max(
      hardReserve,
      Number(context.passiveReserveMs ?? COMBAT_CONSTANTS.PASSIVE_RUNNER_DODGE_RESERVE_MS)
    );
    if (stamina5s !== null && stamina5s < requiredForShot(passiveReserve)) {
      return result(FIRE_STATE.PAUSED, Infinity, passiveReserve, 'passive-reserve');
    }
    return result(FIRE_STATE.NORMAL, COMBAT_CONSTANTS.SHOOT_EVERY_MS, passiveReserve, 'passive-runner');
  }

  // Target pressure fire (real incoming bullets, but winning fight)
  if (context.targetPressureFire) {
    const pressureReserve = Math.max(
      hardReserve,
      Number(context.pressureReserveMs ?? dodgeReserve)
    );
    if (stamina5s !== null && stamina5s < requiredForShot(pressureReserve)) {
      return result(FIRE_STATE.PAUSED, Infinity, pressureReserve, 'pressure-dodge-reserve');
    }
    return result(FIRE_STATE.PRESSURE, COMBAT_CONSTANTS.SHOOT_EVERY_MS, pressureReserve, 'target-pressure-fire');
  }

  // Normal combat fire discipline
  if (stamina5s !== null && stamina5s < requiredForShot(dodgeReserve)) {
    return result(FIRE_STATE.PAUSED, Infinity, dodgeReserve, 'dodge-reserve');
  }

  // Reserve band (low stamina, throttled fire)
  const reserveBandThreshold = dodgeReserve + 1000;
  if (stamina5s !== null && stamina5s < reserveBandThreshold) {
    return result(FIRE_STATE.RESERVE_BAND, COMBAT_CONSTANTS.SHOOT_RESERVE_BAND_MS, dodgeReserve, 'reserve-band');
  }

  // Normal fire
  return result(FIRE_STATE.NORMAL, COMBAT_CONSTANTS.SHOOT_EVERY_MS, dodgeReserve, 'normal-fire');
}

/**
 * Check if can fire based on last shot timing
 *
 * @param {number} lastShotAt - Timestamp of last shot
 * @param {number} cadenceMs - Required cadence in ms
 * @param {number} now - Current timestamp
 * @returns {boolean}
 */
function canFireNow(lastShotAt, cadenceMs, now = Date.now()) {
  if (!lastShotAt || lastShotAt <= 0) return true;
  const elapsed = now - lastShotAt;
  return elapsed >= cadenceMs;
}

function resolveEstablishedCombatFireAuthorizationCore(input = {}) {
  const targetPresent = input.targetPresent ?? Boolean(input.target);
  const aimOk = input.aimOk ?? Boolean(input.aim?.ok);
  const inRange = input.inRange === true;
  const fireState = input.fireState && typeof input.fireState === 'object'
    ? input.fireState
    : {};
  const staminaBlocked = fireState.state === FIRE_STATE.DISABLED || fireState.state === FIRE_STATE.PAUSED;
  const fireReachability = input.aim?.fireReachability || null;
  const reachabilityChecked = fireReachability && typeof fireReachability === 'object';
  let finalFireBlocker = 'none';
  if (!targetPresent) finalFireBlocker = 'no-target';
  else if (!aimOk) finalFireBlocker = `aim:${String(input.aim?.reason || input.aimReason || 'unavailable')}`;
  else if (reachabilityChecked && fireReachability.reachable !== true) {
    finalFireBlocker = `aim-unreachable:${String(fireReachability.reason || 'creation-oracle-rejected')}`;
  }
  else if (!inRange) finalFireBlocker = 'target-out-of-range';
  else if (staminaBlocked) finalFireBlocker = `fire-state:${String(fireState.reason || fireState.state)}`;
  else if (input.contactEntryOnly === true) finalFireBlocker = 'movement-only-contact-entry';
  return {
    wouldShoot: finalFireBlocker === 'none',
    finalFireBlocker,
    fireAuthorizationClass: finalFireBlocker === 'none'
      ? 'standard-combat-fire'
      : (staminaBlocked ? 'stamina-reserve-blocked' : 'hard-gate-blocked')
  };
}

/**
 * Should suppress fire for retreating edge target
 *
 * @param {Object} target - Combat target
 * @param {Object} context - Combat context
 * @returns {boolean}
 */
function shouldSuppressRetreatingEdge(target, context = {}) {
  if (!target) return false;

  const distance = target.distance || 0;
  const retreatEdgeRange = COMBAT_CONSTANTS.RETREAT_EDGE_RANGE;

  // Target is at far edge and receding
  if (distance >= retreatEdgeRange && context.targetReceding) {
    return true;
  }

  return false;
}

/**
 * Determine if low confidence distant shot should be throttled
 *
 * @param {Object} aimContext - Aim context with confidence and distance
 * @returns {Object} { throttle, cadenceMs }
 */
function checkLowConfidenceThrottle(aimContext) {
  if (!aimContext) return { throttle: false, cadenceMs: COMBAT_CONSTANTS.SHOOT_EVERY_MS };

  const confidence = aimContext.confidence || 1.0;
  const distance = aimContext.distance || 0;
  const threshold = COMBAT_CONSTANTS.INTERCEPT_LOW_CONFIDENCE_THRESHOLD;

  // Low confidence beyond 90m uses point fire
  if (confidence < threshold && distance > 9000) {
    return {
      throttle: true,
      cadenceMs: COMBAT_CONSTANTS.INTERCEPT_LOW_CONFIDENCE_FIRE_MS
    };
  }

  return { throttle: false, cadenceMs: COMBAT_CONSTANTS.SHOOT_EVERY_MS };
}

function normalizedEntropy(rows = []) {
  const probabilities = (rows || [])
    .map(item => Math.max(0, Number(item?.probability || 0)))
    .filter(value => value > 0);
  if (probabilities.length < 2) return 0;
  const total = probabilities.reduce((sum, value) => sum + value, 0);
  if (!(total > 0)) return 0;
  const entropy = probabilities.reduce((sum, value) => {
    const probability = value / total;
    return sum - probability * Math.log(probability);
  }, 0);
  return Math.max(0, Math.min(1, entropy / Math.log(probabilities.length)));
}

function classifyFireRiskCore(previous = null, input = {}, options = {}) {
  const targetId = String(input.targetId ?? '');
  const nowMs = Number.isFinite(Number(input.nowMs)) ? Number(input.nowMs) : Date.now();
  const controlStyle = String(input.controlStyle || 'unknown');
  const controlStyleConfidence = Math.max(0, Math.min(1, Number(input.controlStyleConfidence || 0)));
  const maneuverScale = Math.max(0, Math.min(1, Number(input.maneuverScale || 0)));
  const maneuverDurationMs = Math.max(0, Number(input.maneuverDurationMs || 0));
  const lateralFlips = Math.max(0, Number(input.lateralFlips || 0));
  const automationLikelihood = numberOrNull(input.automationLikelihood);
  const routeSamples = Math.max(0, Number(input.routeSamples || 0));
  const routeEntropy = routeSamples >= Math.max(4, Number(options.minimumRouteSamples ?? 8))
    ? normalizedEntropy(input.routeDistribution)
    : 0;
  const recentShotCount = Math.max(0, Number(input.recentShotCount || 0));
  const recentHitRate = Math.max(0, Math.min(1, Number(input.recentHitRate || 0)));
  const noProgressAcceptedShots = Math.max(0, Number(input.noProgressAcceptedShots || 0));
  const evidence = [];
  let score = 0;

  if (controlStyle === 'human-like' && controlStyleConfidence >= 0.35) {
    evidence.push('human-like-control');
    score += 0.45 * controlStyleConfidence;
  }
  if (maneuverScale >= 0.35 && maneuverDurationMs >= 1200) {
    evidence.push('maneuver-scale');
    score += 0.35 * maneuverScale;
  }
  if (lateralFlips >= 2 && maneuverDurationMs >= 600) {
    evidence.push('direction-flips');
    score += Math.min(0.2, lateralFlips * 0.04);
  }
  if (automationLikelihood !== null && automationLikelihood < 0.45) {
    evidence.push('low-automation-likelihood');
    score += Math.min(0.25, (0.45 - automationLikelihood) * 0.7);
  }
  if (routeEntropy >= 0.65) {
    evidence.push('route-distribution-entropy');
    score += routeEntropy * 0.25;
  }
  if (recentShotCount >= 10 && noProgressAcceptedShots >= 10 && recentHitRate < 0.08) {
    evidence.push('recent-low-hit-feedback');
    score += 0.15;
  }

  const rawHighEntropy = Boolean(
    (controlStyle === 'human-like' && controlStyleConfidence >= 0.55)
      || (maneuverScale >= 0.55 && maneuverDurationMs >= 1200)
      || score >= Math.max(0.45, Number(options.highEntropyScore ?? 0.55))
  );
  const explicitLowEntropy = Boolean(
    ['periodic-script', 'reactive-script'].includes(controlStyle)
      && controlStyleConfidence >= 0.65
      && maneuverScale < 0.25
      && routeEntropy < 0.55
  ) || Boolean(recentShotCount >= 10 && recentHitRate >= 0.12 && maneuverScale < 0.3);
  const sameTarget = Boolean(previous && targetId && String(previous.targetId || '') === targetId);
  const previousHigh = Boolean(sameTarget && previous.highEntropy);
  const lowEntropySamples = rawHighEntropy
    ? 0
    : (previousHigh && explicitLowEntropy ? Math.max(0, Number(previous.lowEntropySamples || 0)) + 1 : 0);
  const releaseSamples = Math.max(2, Math.round(Number(options.releaseSamples ?? 6)));
  const latched = Boolean(previousHigh && !rawHighEntropy && lowEntropySamples < releaseSamples);
  const highEntropy = Boolean(rawHighEntropy || latched);
  const classifiedAt = highEntropy
    ? (previousHigh ? Number(previous.classifiedAt || nowMs) : nowMs)
    : nowMs;
  return {
    targetId,
    highEntropy,
    rawHighEntropy,
    latched,
    confidence: highEntropy
      ? Math.max(rawHighEntropy ? 0.35 : 0.25, Math.min(1, score), Number(previousHigh ? previous.confidence || 0 : 0))
      : Math.max(0, Math.min(1, 1 - score)),
    evidence: rawHighEntropy ? evidence : (latched ? ['same-target-latch', ...evidence] : evidence),
    controlStyle,
    maneuverScale,
    routeEntropy,
    recentHitRate,
    recentShotCount,
    noProgressAcceptedShots,
    classifiedAt,
    updatedAt: nowMs,
    expiresAt: nowMs + Math.max(1000, Number(options.ttlMs ?? 5000)),
    lowEntropySamples,
    releaseSamples,
    releaseCondition: highEntropy ? 'target-switch-or-consecutive-low-entropy' : 'not-high-entropy'
  };
}

function evaluateHighEntropyFireGateCore(input = {}, options = {}) {
  const expectedHitProbability = Math.max(0, Math.min(1, Number(input.expectedHitProbability || 0)));
  const recentHitRate = Math.max(0, Math.min(1, Number(input.recentHitRate || 0)));
  const recentShotCount = Math.max(0, Math.round(Number(input.recentShotCount || 0)));
  const noProgressAcceptedShots = Math.max(0, Math.round(Number(input.noProgressAcceptedShots || 0)));
  const noDamageMs = Math.max(0, Number(input.noDamageMs || 0));
  const targetHp = numberOrNull(input.targetHp);
  const selfHp = numberOrNull(input.selfHp);
  const minimumSamples = Math.max(3, Math.round(Number(options.minimumSamples ?? 10)));
  const highEntropyMaxShots = Math.max(minimumSamples, Math.round(Number(options.explorationMaxShots ?? 15)));
  const generalMaxShots = Math.max(highEntropyMaxShots, Math.round(Number(options.generalMaxShots ?? 40)));
  const highEntropy = Boolean(input.highEntropy ?? input.fireRiskClassification?.highEntropy);
  const closePressure = Boolean(input.closePressure);
  const unreachableIntercept = Boolean(input.unreachableIntercept);
  const unreachableMaxShots = Math.max(1, Math.round(Number(options.unreachableMaxShots ?? 3)));
  const explorationMaxShots = unreachableIntercept
    ? unreachableMaxShots
    : (highEntropy ? highEntropyMaxShots : generalMaxShots);
  const minimumExpectedHitProbability = Math.max(0.01, Number(options.minimumExpectedHitProbability ?? 0.08));
  const minimumRecentHitRate = Math.max(0.01, Number(options.minimumRecentHitRate ?? 0.08));
  const finishProtected = targetHp !== null && selfHp !== null
    && targetHp <= Math.max(1, Number(options.finishHp ?? 20))
    && selfHp >= targetHp + Math.max(0, Number(options.finishSelfLeadHp ?? 10));
  const lowExpectedHit = expectedHitProbability < minimumExpectedHitProbability;
  const boundedNoProgress = noProgressAcceptedShots >= explorationMaxShots;
  const lowRecentHit = (recentShotCount >= minimumSamples && recentHitRate < minimumRecentHitRate)
    || boundedNoProgress;
  const proactiveCombat = input.proactiveCombat !== false;
  const progressGateReady = noProgressAcceptedShots >= (unreachableIntercept ? unreachableMaxShots : minimumSamples);
  const active = Boolean(
    proactiveCombat
      && !finishProtected
      && (unreachableIntercept
        ? progressGateReady
        : (progressGateReady && lowRecentHit && (lowExpectedHit || boundedNoProgress)))
  );
  const explorationBudgetRemaining = Math.max(0, explorationMaxShots - noProgressAcceptedShots);
  if (!active) {
    let reason = 'no-progress-fire-gate-inactive';
    if (finishProtected) reason = 'no-progress-finish-protected';
    else if (!proactiveCombat) reason = 'no-progress-nonproactive';
    else if (!progressGateReady) reason = unreachableIntercept ? 'intercept-unreachable-probe' : 'no-progress-insufficient-samples';
    else if (!lowRecentHit) reason = 'no-progress-recent-hit-evidence';
    else if (!lowExpectedHit) reason = 'no-progress-expected-hit-evidence';
    return {
      active: false,
      suppressFire: false,
      minimumCadenceMs: 0,
      reason,
      highEntropy,
      unreachableIntercept,
      reachabilityGapCm: numberOrNull(input.reachabilityGapCm),
      expectedHitProbability,
      recentHitRate,
      recentShotCount,
      noProgressAcceptedShots,
      noDamageMs,
      explorationMaxShots,
      explorationBudgetRemaining,
      boundedNoProgress,
      finishProtected,
      defensivePressure: Boolean(input.defensivePressure),
      closePressure
    };
  }
  const explorationActive = explorationBudgetRemaining > 0
    && noDamageMs < Math.max(1000, Number(options.maximumExplorationNoDamageMs ?? 12000));
  const defensivePressure = Boolean(input.defensivePressure);
  const defensiveExtraShots = Math.max(0, Math.round(Number(options.defensiveExtraShots ?? 5)));
  const defensiveBudgetRemaining = Math.max(0, explorationMaxShots + defensiveExtraShots - noProgressAcceptedShots);
  const defensiveThrottle = Boolean(!unreachableIntercept && !explorationActive && defensivePressure && defensiveBudgetRemaining > 0);
  return {
    active: true,
    suppressFire: Boolean(!explorationActive && !defensiveThrottle),
    minimumCadenceMs: explorationActive
      ? Math.max(320, Number(options.explorationCadenceMs ?? 800))
      : (defensiveThrottle ? Math.max(500, Number(options.defensiveCadenceMs ?? 1000)) : 0),
    reason: unreachableIntercept
      ? 'intercept-out-of-range-reacquire'
      : (explorationActive
      ? (highEntropy ? 'high-entropy-bounded-exploration' : 'no-progress-bounded-exploration')
      : (defensiveThrottle
          ? (highEntropy ? 'high-entropy-defensive-throttle' : 'no-progress-defensive-throttle')
          : (highEntropy ? 'high-entropy-reacquire' : 'no-progress-reacquire'))),
    highEntropy,
    unreachableIntercept,
    reachabilityGapCm: numberOrNull(input.reachabilityGapCm),
    expectedHitProbability,
    recentHitRate,
    recentShotCount,
    noProgressAcceptedShots,
    noDamageMs,
    explorationMaxShots,
    explorationBudgetRemaining,
    boundedNoProgress,
    defensiveBudgetRemaining,
    shootingStaminaSpent: Math.max(0, Number(input.shootingStaminaSpent || 0)),
    explorationActive,
    finishProtected,
    defensivePressure,
    closePressure
  };
}

function evaluateCombatFireBudgetCore(input = {}, options = {}) {
  const gate = input.fireGate && typeof input.fireGate === 'object' ? input.fireGate : {};
  const probe = input.probeState && typeof input.probeState === 'object' ? input.probeState : {};
  const coverage = input.trajectoryCoverage && typeof input.trajectoryCoverage === 'object'
    ? input.trajectoryCoverage
    : {};
  const targetId = String(input.targetId || '');
  const closeBandReserve = input.closeBandReserve && typeof input.closeBandReserve === 'object'
    ? input.closeBandReserve
    : {};
  const sharedBudgetUsed = Math.max(0, Math.round(Number(input.acceptedShotsSinceDamage ?? gate.noProgressAcceptedShots ?? 0)));
  const baseBudget = Math.max(1, Math.round(Number(gate.explorationMaxShots || options.baseBudgetShots || 15)));
  const geometryRearmShots = Math.max(0, Math.round(Number(
    options.geometryRearmShots
      ?? probe.geometryReprobeMaxShots
      ?? 2
  )));
  const maxGeometryRearms = Math.max(0, Math.round(Number(
    options.maxGeometryRearms
      ?? probe.maxGeometryRearms
      ?? 1
  )));
  const defensiveExtraShots = gate.defensivePressure
    ? Math.max(0, Math.round(Number(options.defensiveExtraShots ?? 5)))
    : 0;
  const geometryBudget = geometryRearmShots * maxGeometryRearms;
  const sharedBudgetMax = baseBudget + geometryBudget + defensiveExtraShots;
  const reservedCloseBandShots = Math.max(0, Math.min(
    sharedBudgetMax,
    Math.round(Number(options.reservedCloseBandShots ?? closeBandReserve.reservedShots ?? 2))
  ));
  const reservedCloseBandShotsUsed = Math.max(0, Math.round(Number(closeBandReserve.consumedShots || 0)));
  const reservedCloseBandShotsRemaining = Math.max(0, reservedCloseBandShots - reservedCloseBandShotsUsed);
  const ordinaryBudgetMax = Math.max(0, sharedBudgetMax - reservedCloseBandShots);
  const ordinaryBudgetUsed = Math.max(0, sharedBudgetUsed - reservedCloseBandShotsUsed);
  const ordinaryBudgetRemaining = Math.max(0, ordinaryBudgetMax - ordinaryBudgetUsed);
  const sharedBudgetRemaining = Math.max(0, sharedBudgetMax - sharedBudgetUsed);
  const baseBudgetRemaining = Math.max(0, Math.min(baseBudget, ordinaryBudgetMax) - ordinaryBudgetUsed);
  const geometryBudgetRemaining = Math.max(0, Math.min(baseBudget + geometryBudget, ordinaryBudgetMax) - ordinaryBudgetUsed);
  const marginalCoverage = numberOrNull(coverage?.selected?.marginalCoverage);
  const minimumMarginalCoverage = Math.max(0, Number(options.minimumMarginalCoverage ?? 0.02));
  const coverageQualified = Boolean(
    coverage.active === true
      && coverage.selected
      && marginalCoverage !== null
      && marginalCoverage >= minimumMarginalCoverage
  );
  const resolvedReserveMs = Math.max(0, Number(input.resolvedReserveMs || 0));
  const plannedCoverageShots = Math.max(1, Math.round(Number(options.plannedCoverageShots || 3)));
  const shotCostMs = Math.max(1, Number(options.shotCostMs || 500));
  const controlMarginMs = Math.max(0, Number(options.controlMarginMs || 500));
  const coverageVolleyRequiredStamina = resolvedReserveMs
    + plannedCoverageShots * shotCostMs
    + controlMarginMs;
  const stamina5s = numberOrNull(input.stamina5s);
  const finishProtected = Boolean(gate.finishProtected || input.finishProtected);
  const pressureAttack = Boolean(input.pressureAttack);
  const boundedPressureVolley = Boolean(input.boundedPressureVolley);
  const closeBandStableQualified = Boolean(
    closeBandReserve.stableBandEligible === true
      || (closeBandReserve.enabled !== false
        && closeBandReserve.inBand === true
        && Number(closeBandReserve.bandTicks || 0) >= Math.max(1, Number(closeBandReserve.requiredBandTicks || 3)))
  );
  const closeRangeFireOverride = Boolean(
    input.closeRangeFireOverride
      || (!boundedPressureVolley && (pressureAttack || closeBandStableQualified))
  );
  let suppressFire = Boolean(gate.suppressFire || probe.suppressFire);
  let authorizationSource = suppressFire ? '' : 'base-fire-discipline';
  let suppressionReason = suppressFire
    ? (probe.suppressionReason || gate.reason || 'shared-fire-budget-suppressed')
    : '';
  const budgetStateInvalid = reservedCloseBandShotsUsed > reservedCloseBandShots
    || (!closeRangeFireOverride && sharedBudgetUsed > sharedBudgetMax);
  const closeBandReserveQualified = Boolean(
    closeBandReserve.eligible === true
      && coverageQualified
      && reservedCloseBandShotsRemaining > 0
  );

  if (budgetStateInvalid) {
    suppressFire = true;
    authorizationSource = '';
    suppressionReason = 'budget-state-invalid';
  } else if (closeRangeFireOverride) {
    suppressFire = false;
    authorizationSource = pressureAttack ? 'close-pressure-full-attack' : 'close-range-fire-override';
    suppressionReason = '';
  } else if (finishProtected) {
    suppressFire = false;
    authorizationSource = 'low-hp-finish-protected';
    suppressionReason = '';
  } else if (probe.provenHitProtected) {
    suppressFire = false;
    authorizationSource = 'proven-hit-rate';
    suppressionReason = '';
  } else if (sharedBudgetRemaining <= 0) {
    suppressFire = true;
    authorizationSource = '';
    suppressionReason = 'shared-fire-budget-exhausted';
  } else if (closeBandReserveQualified) {
    suppressFire = false;
    authorizationSource = 'close-band-reserve';
    suppressionReason = '';
  } else if (gate.active) {
    if (baseBudgetRemaining > 0 && ordinaryBudgetRemaining > 0) {
      suppressFire = false;
      authorizationSource = gate.explorationActive ? 'bounded-exploration' : 'shared-probe-budget';
      suppressionReason = '';
    } else if (geometryBudgetRemaining > 0 && ordinaryBudgetRemaining > 0 && coverageQualified) {
      suppressFire = false;
      authorizationSource = 'coverage-marginal-geometry-rearm';
      suppressionReason = '';
    } else if (sharedBudgetRemaining > 0 && gate.defensivePressure) {
      suppressFire = false;
      authorizationSource = 'defensive-pressure-reserve';
      suppressionReason = '';
    } else {
      suppressFire = true;
      authorizationSource = '';
      suppressionReason = coverageQualified
        ? 'shared-fire-budget-exhausted'
        : 'coverage-no-marginal-gain';
    }
  } else if (probe.highEntropy && baseBudgetRemaining > 0 && ordinaryBudgetRemaining > 0) {
    suppressFire = false;
    authorizationSource = 'shared-probe-budget';
    suppressionReason = '';
  }

  return {
    targetId,
    active: Boolean(gate.active || probe.highEntropy),
    suppressFire,
    sharedBudgetUsed,
    sharedBudgetMax,
    sharedBudgetRemaining,
    ordinaryBudgetMax,
    ordinaryBudgetUsed,
    ordinaryBudgetRemaining,
    reservedCloseBandShots,
    reservedCloseBandShotsUsed,
    reservedCloseBandShotsRemaining,
    closeBandReserveQualified,
    closeBandStableQualified,
    closeRangeFireOverride,
    closeBandBandTicks: Math.max(0, Number(closeBandReserve.bandTicks || 0)),
    closeBandFirstEligibleAt: Number(closeBandReserve.firstEligibleAt || 0) || null,
    closeBandFirstStableAt: Number(closeBandReserve.firstStableAt || 0) || null,
    budgetStateInvalid,
    baseBudget,
    baseBudgetRemaining,
    geometryRearmShots,
    maxGeometryRearms,
    geometryBudgetRemaining,
    defensiveExtraShots,
    authorizationSource,
    marginalCoverage,
    minimumMarginalCoverage,
    coverageQualified,
    resolvedReserveMs,
    coverageVolleyRequiredStamina,
    coverageVolleyStaminaReady: stamina5s === null ? null : stamina5s >= coverageVolleyRequiredStamina,
    suppressionReason,
    closePressure: Boolean(input.closePressure),
    pressureAttack,
    boundedPressureVolley,
    boundedNoProgress: Boolean(gate.boundedNoProgress)
  };
}

function updateCloseBandReserveCore(previous = null, input = {}, options = {}) {
  const targetId = String(input.targetId || '');
  const sameTarget = Boolean(previous && targetId && String(previous.targetId || '') === targetId);
  const reservedShots = Math.max(0, Math.round(Number(options.reservedShots ?? 2)));
  const enabled = options.enabled !== false && reservedShots > 0;
  const acceptedShots = Math.max(0, Math.round(Number(input.acceptedShots || 0)));
  let consumedShots = sameTarget ? Math.max(0, Math.round(Number(previous.consumedShots || 0))) : 0;
  const previousAcceptedShots = sameTarget ? Math.max(0, Math.round(Number(previous.lastAcceptedShots || 0))) : acceptedShots;
  const acceptedDelta = Math.max(0, acceptedShots - previousAcceptedShots);
  if (sameTarget && previous.lastAuthorization === 'close-band-reserve' && acceptedDelta > 0) {
    consumedShots = Math.min(reservedShots, consumedShots + acceptedDelta);
  }
  const distance = Number(input.distance);
  const minRangeCm = Math.max(0, Number(options.minRangeCm ?? 4500));
  const maxRangeCm = Math.max(minRangeCm, Number(options.maxRangeCm ?? 5500));
  const inBand = Number.isFinite(distance) && distance >= minRangeCm && distance <= maxRangeCm;
  const coverageQualified = Boolean(input.coverageQualified);
  const bandTicks = inBand
    ? (sameTarget ? Math.max(0, Number(previous.bandTicks || 0)) + 1 : 1)
    : 0;
  const requiredBandTicks = Math.max(1, Math.round(Number(options.requiredBandTicks ?? 3)));
  const stableBandEligible = enabled && bandTicks >= requiredBandTicks;
  const eligible = stableBandEligible && coverageQualified && consumedShots < reservedShots;
  const nowMs = Number.isFinite(Number(input.nowMs)) ? Number(input.nowMs) : Date.now();
  return {
    targetId,
    enabled,
    reservedShots,
    consumedShots,
    remainingShots: Math.max(0, reservedShots - consumedShots),
    bandTicks,
    requiredBandTicks,
    inBand,
    coverageQualified,
    stableBandEligible,
    eligible,
    firstStableAt: stableBandEligible
      ? (sameTarget && Number(previous.firstStableAt || 0) > 0 ? Number(previous.firstStableAt) : nowMs)
      : 0,
    firstEligibleAt: eligible
      ? (sameTarget && Number(previous.firstEligibleAt || 0) > 0 ? Number(previous.firstEligibleAt) : nowMs)
      : 0,
    lastAcceptedShots: acceptedShots,
    lastAuthorization: sameTarget ? String(previous.lastAuthorization || '') : '',
    updatedAt: nowMs
  };
}

function updateCombatProbePhaseCore(previous = null, input = {}, options = {}) {
  const nowMs = Math.max(0, Number(input.nowMs || Date.now()));
  const targetId = String(input.targetId || '');
  const sameTarget = Boolean(previous && targetId && String(previous.targetId || '') === targetId);
  const highEntropy = Boolean(input.highEntropy);
  const closePressure = Boolean(input.closePressure);
  const acceptedShots = Math.max(0, Math.round(Number(input.acceptedShots || 0)));
  const confirmedHits = Math.max(0, Math.round(Number(input.confirmedHits || 0)));
  const shootingStamina = Math.max(0, Number(input.shootingStamina || 0));
  const maxAcceptedShots = Math.max(1, Math.round(Number(options.maxAcceptedShots ?? 5)));
  const defensiveExtraShots = Math.max(0, Math.round(Number(options.defensiveExtraShots ?? 2)));
  const geometryReprobeMaxShots = Math.max(1, Math.min(
    maxAcceptedShots,
    Math.round(Number(options.geometryReprobeMaxShots ?? 2))
  ));
  const maxGeometryRearms = Math.max(0, Math.round(Number(options.maxGeometryRearms ?? 1)));
  const geometryRearmCooldownMs = Math.max(1000, Number(options.geometryRearmCooldownMs ?? 5000));
  const mode = String(input.behaviorMode || 'mixed/unknown');
  const responsePolicy = String(input.responsePolicy || '');
  const directionState = String(input.directionState || '');
  const directionFlipAt = Math.max(0, Number(input.directionFlipAt || 0));
  const routeContextKey = String(input.routeContextKey || '');
  const routeCandidate = String(input.routeCandidate || '');
  const distance = Number.isFinite(Number(input.distance)) ? Number(input.distance) : null;
  const aimX = Number.isFinite(Number(input.aimX)) ? Number(input.aimX) : null;
  const aimY = Number.isFinite(Number(input.aimY)) ? Number(input.aimY) : null;
  const predictedHitProbability = Math.max(0, Math.min(1, Number(input.predictedHitProbability || 0)));
  const recentHitRate = Math.max(0, Math.min(1, Number(input.recentHitRate || 0)));
  const recentShotCount = Math.max(0, Math.round(Number(input.recentShotCount || 0)));
  const highEntropyMinimumProbability = Math.max(0.01, Number(options.highEntropyMinimumProbability ?? 0.10));
  const defensiveMinimumProbability = Math.max(0.01, Number(options.defensiveMinimumProbability ?? 0.06));
  const minimumProbability = input.defensivePressure ? defensiveMinimumProbability : highEntropyMinimumProbability;
  const base = sameTarget ? previous : {
    targetId,
    phaseStartedAt: nowMs,
    baseAcceptedShots: acceptedShots,
    baseConfirmedHits: confirmedHits,
    baseShootingStamina: shootingStamina,
    lastResetAt: nowMs,
    lastDamageAt: 0,
    lastDirectionFlipAt: 0,
    probeResetReason: 'target-start'
  };
  const newHit = sameTarget && confirmedHits > Number(previous.lastTotalConfirmedHits || previous.baseConfirmedHits || 0);
  const aimDelta = sameTarget
    && aimX !== null && aimY !== null
    && Number.isFinite(Number(previous.lastAimX)) && Number.isFinite(Number(previous.lastAimY))
    ? Math.hypot(aimX - Number(previous.lastAimX), aimY - Number(previous.lastAimY))
    : 0;
  const distanceDelta = sameTarget && distance !== null && Number.isFinite(Number(previous.lastDistance))
    ? Math.abs(distance - Number(previous.lastDistance))
    : 0;
  const enteredStableMode = sameTarget
    && mode !== String(previous.lastBehaviorMode || '')
    && ['stationary', 'steady-linear'].includes(mode);
  const exhaustedWindow = sameTarget
    && responsePolicy === 'opponent-exhausted-window'
    && responsePolicy !== String(previous.lastResponsePolicy || '');
  const stableDirectionFlip = sameTarget
    && directionFlipAt > Number(previous.lastDirectionFlipAt || 0)
    && directionState
    && directionState !== String(previous.lastDirectionState || '')
    && Math.max(0, Number(input.directionDwellTicks || 0)) >= 2;
  let resetReason = sameTarget ? '' : 'target-start';
  if (newHit) resetReason = 'recent-attributed-hit';
  else if (enteredStableMode) resetReason = `mode:${mode}`;
  else if (exhaustedWindow) resetReason = 'opponent-exhausted-window';
  const previousBudgetRemaining = Math.max(0, Number(previous?.probeBudgetRemaining ?? maxAcceptedShots));
  const previousGeometryRearmCount = sameTarget ? Math.max(0, Number(previous?.geometryRearmCount || 0)) : 0;
  const stableGeometryOpportunity = Boolean(enteredStableMode || exhaustedWindow);
  const geometryRearmAllowed = Boolean(
    sameTarget
      && stableGeometryOpportunity
      && previousBudgetRemaining <= 0
      && previous?.probePhase === 'cooldown'
      && previousGeometryRearmCount < maxGeometryRearms
      && nowMs - Number(previous?.lastResetAt || 0) >= geometryRearmCooldownMs
  );
  const resetAllowed = Boolean(!sameTarget || newHit || geometryRearmAllowed);
  if (!resetAllowed) resetReason = '';
  const phaseBaseAcceptedShots = resetAllowed ? acceptedShots : Number(base.baseAcceptedShots || 0);
  const phaseBaseConfirmedHits = resetAllowed ? confirmedHits : Number(base.baseConfirmedHits || 0);
  const phaseBaseShootingStamina = resetAllowed ? shootingStamina : Number(base.baseShootingStamina || 0);
  const probeAcceptedShots = Math.max(0, acceptedShots - phaseBaseAcceptedShots);
  const probeHits = Math.max(0, confirmedHits - phaseBaseConfirmedHits);
  const probeStamina = Math.max(0, shootingStamina - phaseBaseShootingStamina);
  const phaseBaseBudget = resetAllowed
    ? (geometryRearmAllowed ? geometryReprobeMaxShots : maxAcceptedShots)
    : (Number.isFinite(Number(previous?.probeBaseMaxAcceptedShots))
        ? Math.max(1, Number(previous.probeBaseMaxAcceptedShots))
        : maxAcceptedShots);
  const totalBudget = phaseBaseBudget + (input.defensivePressure ? defensiveExtraShots : 0);
  const probeBudgetRemaining = Math.max(0, totalBudget - probeAcceptedShots);
  const minimumCalibrationShots = Math.max(1, Math.round(Number(options.minimumCalibrationShots ?? 3)));
  const provenHitProtected = Boolean(
    (recentShotCount >= 5 && recentHitRate >= Math.max(0.03, Number(options.provenHitRate ?? 0.06)))
      || (acceptedShots >= 5 && confirmedHits / Math.max(1, acceptedShots) >= Math.max(0.03, Number(options.provenHitRate ?? 0.06)))
  );
  const geometryNovelty = Math.max(
    enteredStableMode || exhaustedWindow || stableDirectionFlip ? 1 : 0,
    Math.min(1, aimDelta / Math.max(1, Number(options.minimumAimNoveltyCm ?? 180))),
    Math.min(1, distanceDelta / Math.max(1, Number(options.minimumDistanceNoveltyCm ?? 2500)))
  );
  const routeProbability = numberOrNull(input.routeProbability);
  const geometryProbeEligible = Boolean(
    geometryNovelty >= Math.max(0.5, Number(options.minimumGeometryNovelty ?? 0.75))
      && routeProbability !== null
      && routeProbability >= Math.max(0.05, Number(options.minimumNovelRouteProbability ?? 0.15))
      && predictedHitProbability >= Math.max(0.03, Number(options.minimumNovelPredictedHitProbability ?? 0.06))
  );
  const probabilityBlocked = highEntropy
    && !provenHitProtected
    && probeAcceptedShots >= minimumCalibrationShots
    && predictedHitProbability < minimumProbability
    && !geometryProbeEligible;
  const cooldown = highEntropy && !provenHitProtected && probeBudgetRemaining <= 0 && probeHits <= 0;
  const finishingTarget = Boolean(input.finishingTarget);
  const suppressFire = Boolean(
    highEntropy
      && !finishingTarget
      && (cooldown || probabilityBlocked)
  );
  const probePhase = !highEntropy
    ? 'not-required'
    : (provenHitProtected ? 'productive' : (cooldown ? 'cooldown' : (probabilityBlocked ? 'wait-geometry' : 'probe')));
  return {
    targetId,
    highEntropy,
    probePhase,
    probeAcceptedShots,
    probeHits,
    probeStamina,
    probeBudgetRemaining,
    probeMaxAcceptedShots: totalBudget,
    probeBaseMaxAcceptedShots: phaseBaseBudget,
    probeResetReason: resetAllowed ? resetReason : '',
    geometryRearmCount: newHit
      ? 0
      : (geometryRearmAllowed ? previousGeometryRearmCount + 1 : previousGeometryRearmCount),
    geometryReprobeMaxShots,
    maxGeometryRearms,
    geometryRearmCooldownMs,
    geometryNovelty: Number(geometryNovelty.toFixed(3)),
    routeProbability,
    predictedHitProbability,
    minimumProbability,
    minimumCalibrationShots,
    provenHitProtected,
    recentHitRate,
    recentShotCount,
    geometryProbeEligible,
    actualHitAttribution: probeHits > 0 ? 'recent-shot-attribution' : 'none',
    closePressure,
    suppressFire,
    suppressionReason: cooldown
      ? 'probe-zero-damage-budget-cooldown'
      : (probabilityBlocked ? 'probe-hit-probability-below-threshold' : ''),
    phaseStartedAt: resetAllowed ? nowMs : Number(base.phaseStartedAt || nowMs),
    baseAcceptedShots: phaseBaseAcceptedShots,
    baseConfirmedHits: phaseBaseConfirmedHits,
    baseShootingStamina: phaseBaseShootingStamina,
    lastResetAt: resetAllowed ? nowMs : Number(base.lastResetAt || nowMs),
    lastDamageAt: newHit ? nowMs : Number(base.lastDamageAt || 0),
    lastTotalAcceptedShots: acceptedShots,
    lastTotalConfirmedHits: confirmedHits,
    lastTotalShootingStamina: shootingStamina,
    lastBehaviorMode: mode,
    lastResponsePolicy: responsePolicy,
    lastDirectionState: directionState,
    lastDirectionFlipAt: Math.max(directionFlipAt, Number(base.lastDirectionFlipAt || 0)),
    lastRouteContextKey: routeContextKey,
    lastRouteCandidate: routeCandidate,
    lastDistance: distance,
    lastAimX: aimX,
    lastAimY: aimY
  };
}

module.exports = {
  FIRE_STATE,
  determineCombatFireState,
  stamina5sRemaining,
  canFireNow,
  resolveEstablishedCombatFireAuthorizationCore,
  shouldSuppressRetreatingEdge,
  checkLowConfidenceThrottle,
  classifyFireRiskCore,
  evaluateHighEntropyFireGateCore,
  evaluateCombatFireBudgetCore,
  updateCloseBandReserveCore,
  updateCombatProbePhaseCore
};
