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
  const hardReserve = COMBAT_CONSTANTS.SHOOT_HARD_RESERVE_MS;
  const dodgeReserve = COMBAT_CONSTANTS.SHOOT_DODGE_RESERVE_MS;
  const result = (state, cadenceMs, reserve, reason) => ({
    state,
    cadenceMs,
    reserve,
    reason,
    stamina5s
  });

  // Hard floor - never fire below this
  if (stamina5s !== null && stamina5s < hardReserve) {
    return result(FIRE_STATE.DISABLED, Infinity, hardReserve, 'below-hard-reserve');
  }

  // Check guarded fire windows

  // Opponent probe (early engagement without target bullet evidence)
  if (context.opponentProbe) {
    const probeReserve = COMBAT_CONSTANTS.OPPONENT_PROBE_RESERVE_MS;
    if (stamina5s !== null && stamina5s < probeReserve) {
      return result(FIRE_STATE.PAUSED, Infinity, probeReserve, 'probe-reserve');
    }
    return result(FIRE_STATE.PROBE, COMBAT_CONSTANTS.OPPONENT_PROBE_EVERY_MS, probeReserve, 'opponent-probe');
  }

  // Finish low threat (low HP target, high HP self, no pressure)
  if (context.finishLowThreat) {
    const finishReserve = COMBAT_CONSTANTS.FINISH_LOW_THREAT_RESERVE_MS;
    if (stamina5s !== null && stamina5s < finishReserve) {
      return result(FIRE_STATE.PAUSED, Infinity, finishReserve, 'finish-reserve');
    }
    return result(FIRE_STATE.FINISH, COMBAT_CONSTANTS.SHOOT_EVERY_MS, finishReserve, 'finish-low-threat');
  }

  // Passive runner (no threat, safe to fire)
  if (context.passiveRunner) {
    const passiveReserve = COMBAT_CONSTANTS.PASSIVE_RUNNER_DODGE_RESERVE_MS;
    if (stamina5s !== null && stamina5s < passiveReserve) {
      return result(FIRE_STATE.PAUSED, Infinity, passiveReserve, 'passive-reserve');
    }
    return result(FIRE_STATE.NORMAL, COMBAT_CONSTANTS.SHOOT_EVERY_MS, passiveReserve, 'passive-runner');
  }

  // Target pressure fire (real incoming bullets, but winning fight)
  if (context.targetPressureFire) {
    if (stamina5s !== null && stamina5s < dodgeReserve) {
      return result(FIRE_STATE.PAUSED, Infinity, dodgeReserve, 'pressure-dodge-reserve');
    }
    return result(FIRE_STATE.PRESSURE, COMBAT_CONSTANTS.SHOOT_EVERY_MS, dodgeReserve, 'target-pressure-fire');
  }

  // Normal combat fire discipline
  if (stamina5s !== null && stamina5s < dodgeReserve) {
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
  const lowRecentHit = recentShotCount >= minimumSamples && recentHitRate < minimumRecentHitRate;
  const proactiveCombat = input.proactiveCombat !== false;
  const progressGateReady = noProgressAcceptedShots >= (unreachableIntercept ? unreachableMaxShots : minimumSamples);
  const boundedNoProgress = noProgressAcceptedShots >= explorationMaxShots;
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
      defensivePressure: Boolean(input.defensivePressure)
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
    defensivePressure
  };
}

module.exports = {
  FIRE_STATE,
  determineCombatFireState,
  stamina5sRemaining,
  canFireNow,
  shouldSuppressRetreatingEdge,
  checkLowConfidenceThrottle,
  classifyFireRiskCore,
  evaluateHighEntropyFireGateCore
};
