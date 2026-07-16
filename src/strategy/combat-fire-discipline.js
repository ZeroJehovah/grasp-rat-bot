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

function evaluateHighEntropyFireGateCore(input = {}, options = {}) {
  const expectedHitProbability = Math.max(0, Math.min(1, Number(input.expectedHitProbability || 0)));
  const recentHitRate = Math.max(0, Math.min(1, Number(input.recentHitRate || 0)));
  const recentShotCount = Math.max(0, Math.round(Number(input.recentShotCount || 0)));
  const noProgressAcceptedShots = Math.max(0, Math.round(Number(input.noProgressAcceptedShots || 0)));
  const noDamageMs = Math.max(0, Number(input.noDamageMs || 0));
  const targetHp = numberOrNull(input.targetHp);
  const selfHp = numberOrNull(input.selfHp);
  const minimumSamples = Math.max(3, Math.round(Number(options.minimumSamples ?? 10)));
  const explorationMaxShots = Math.max(minimumSamples, Math.round(Number(options.explorationMaxShots ?? 15)));
  const minimumExpectedHitProbability = Math.max(0.01, Number(options.minimumExpectedHitProbability ?? 0.08));
  const minimumRecentHitRate = Math.max(0.01, Number(options.minimumRecentHitRate ?? 0.08));
  const finishProtected = targetHp !== null && selfHp !== null
    && targetHp <= Math.max(1, Number(options.finishHp ?? 20))
    && selfHp >= targetHp + Math.max(0, Number(options.finishSelfLeadHp ?? 10));
  const lowExpectedHit = expectedHitProbability < minimumExpectedHitProbability;
  const lowRecentHit = recentShotCount >= minimumSamples && recentHitRate < minimumRecentHitRate;
  const active = Boolean(input.highEntropy && !finishProtected && lowExpectedHit && lowRecentHit);
  const explorationBudgetRemaining = Math.max(0, explorationMaxShots - noProgressAcceptedShots);
  if (!active) {
    return {
      active: false,
      suppressFire: false,
      minimumCadenceMs: 0,
      reason: finishProtected ? 'high-entropy-finish-protected' : 'high-entropy-fire-gate-inactive',
      expectedHitProbability,
      recentHitRate,
      recentShotCount,
      noProgressAcceptedShots,
      noDamageMs,
      explorationMaxShots,
      explorationBudgetRemaining,
      finishProtected,
      defensivePressure: Boolean(input.defensivePressure)
    };
  }
  const explorationActive = explorationBudgetRemaining > 0
    && noDamageMs < Math.max(1000, Number(options.maximumExplorationNoDamageMs ?? 12000));
  const defensivePressure = Boolean(input.defensivePressure);
  return {
    active: true,
    suppressFire: Boolean(!explorationActive && !defensivePressure),
    minimumCadenceMs: explorationActive
      ? Math.max(320, Number(options.explorationCadenceMs ?? 800))
      : (defensivePressure ? Math.max(500, Number(options.defensiveCadenceMs ?? 1000)) : 0),
    reason: explorationActive
      ? 'high-entropy-bounded-exploration'
      : (defensivePressure ? 'high-entropy-defensive-throttle' : 'high-entropy-reacquire'),
    expectedHitProbability,
    recentHitRate,
    recentShotCount,
    noProgressAcceptedShots,
    noDamageMs,
    explorationMaxShots,
    explorationBudgetRemaining,
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
  evaluateHighEntropyFireGateCore
};
