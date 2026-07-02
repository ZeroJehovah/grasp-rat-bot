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

/**
 * Determine combat fire state based on stamina and context
 *
 * @param {Object} self - Self entity
 * @param {Object} target - Combat target
 * @param {Object} context - Combat context
 * @returns {Object} { state, cadenceMs, reserve, reason }
 */
function determineCombatFireState(self, target, context = {}) {
  const stamina5s = Number(self.stamina_5s_remaining_milli || 0);
  const hardReserve = COMBAT_CONSTANTS.SHOOT_HARD_RESERVE_MS;
  const dodgeReserve = COMBAT_CONSTANTS.SHOOT_DODGE_RESERVE_MS;

  // Hard floor - never fire below this
  if (stamina5s < hardReserve) {
    return {
      state: FIRE_STATE.DISABLED,
      cadenceMs: Infinity,
      reserve: hardReserve,
      reason: 'below-hard-reserve'
    };
  }

  // Check guarded fire windows

  // Opponent probe (early engagement without target bullet evidence)
  if (context.opponentProbe) {
    const probeReserve = COMBAT_CONSTANTS.OPPONENT_PROBE_RESERVE_MS;
    if (stamina5s < probeReserve) {
      return {
        state: FIRE_STATE.PAUSED,
        cadenceMs: Infinity,
        reserve: probeReserve,
        reason: 'probe-reserve'
      };
    }
    return {
      state: FIRE_STATE.PROBE,
      cadenceMs: COMBAT_CONSTANTS.OPPONENT_PROBE_EVERY_MS,
      reserve: probeReserve,
      reason: 'opponent-probe'
    };
  }

  // Finish low threat (low HP target, high HP self, no pressure)
  if (context.finishLowThreat) {
    const finishReserve = COMBAT_CONSTANTS.FINISH_LOW_THREAT_RESERVE_MS;
    if (stamina5s < finishReserve) {
      return {
        state: FIRE_STATE.PAUSED,
        cadenceMs: Infinity,
        reserve: finishReserve,
        reason: 'finish-reserve'
      };
    }
    return {
      state: FIRE_STATE.FINISH,
      cadenceMs: COMBAT_CONSTANTS.SHOOT_EVERY_MS,
      reserve: finishReserve,
      reason: 'finish-low-threat'
    };
  }

  // Passive runner (no threat, safe to fire)
  if (context.passiveRunner) {
    const passiveReserve = COMBAT_CONSTANTS.PASSIVE_RUNNER_DODGE_RESERVE_MS;
    if (stamina5s < passiveReserve) {
      return {
        state: FIRE_STATE.PAUSED,
        cadenceMs: Infinity,
        reserve: passiveReserve,
        reason: 'passive-reserve'
      };
    }
    return {
      state: FIRE_STATE.NORMAL,
      cadenceMs: COMBAT_CONSTANTS.SHOOT_EVERY_MS,
      reserve: passiveReserve,
      reason: 'passive-runner'
    };
  }

  // Target pressure fire (real incoming bullets, but winning fight)
  if (context.targetPressureFire) {
    if (stamina5s < dodgeReserve) {
      return {
        state: FIRE_STATE.PAUSED,
        cadenceMs: Infinity,
        reserve: dodgeReserve,
        reason: 'pressure-dodge-reserve'
      };
    }
    return {
      state: FIRE_STATE.PRESSURE,
      cadenceMs: COMBAT_CONSTANTS.SHOOT_EVERY_MS,
      reserve: dodgeReserve,
      reason: 'target-pressure-fire'
    };
  }

  // Normal combat fire discipline
  if (stamina5s < dodgeReserve) {
    return {
      state: FIRE_STATE.PAUSED,
      cadenceMs: Infinity,
      reserve: dodgeReserve,
      reason: 'dodge-reserve'
    };
  }

  // Reserve band (low stamina, throttled fire)
  const reserveBandThreshold = dodgeReserve + 1000;
  if (stamina5s < reserveBandThreshold) {
    return {
      state: FIRE_STATE.RESERVE_BAND,
      cadenceMs: COMBAT_CONSTANTS.SHOOT_RESERVE_BAND_MS,
      reserve: dodgeReserve,
      reason: 'reserve-band'
    };
  }

  // Normal fire
  return {
    state: FIRE_STATE.NORMAL,
    cadenceMs: COMBAT_CONSTANTS.SHOOT_EVERY_MS,
    reserve: dodgeReserve,
    reason: 'normal-fire'
  };
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

module.exports = {
  FIRE_STATE,
  determineCombatFireState,
  canFireNow,
  shouldSuppressRetreatingEdge,
  checkLowConfidenceThrottle
};
