'use strict';

/**
 * Combat System Constants
 *
 * Centralized configuration for combat behavior, extracted from runtime defaults
 * to improve maintainability and clarity.
 */

const COMBAT_CONSTANTS = {
  // Range and distance thresholds
  ATTACK_RANGE: 14500,                    // combatAttackRange - standard attack/fire range
  BULLET_RANGE_CM: 15000,                 // measured server bullet lifetime range
  DISENGAGE_RANGE: 17000,                 // combatDisengageRange - when to drop engaged target
  DODGE_RANGE_BUFFER: 1000,               // combatDodgeRangeBuffer - extended dodge-only detection

  // Spacing behavior
  CLOSE_SPACING_THRESHOLD: 4500,          // combatCloseSpacingThreshold - back away threshold
  TARGET_SPACING_MIN: 4500,               // combatTargetSpacingMin
  TARGET_SPACING_MAX: 6500,               // combatTargetSpacingMax
  RETREAT_EDGE_RANGE: 12000,              // combatRetreatEdgeRange - suppress fire on retreating edge

  // HP and disadvantage gates
  CRITICAL_HP: 20,                        // combatCriticalHp - immediate exit threshold
  LOW_HP_THRESHOLD: 50,                   // combatLowHpLeaveThreshold - low HP exit threshold
  DISADVANTAGE_HP_GAP: 20,                // combatDisadvantageHpGap - HP gap for disadvantage
  DISADVANTAGE_CONFIRM_MS: 2500,           // combatDisadvantageConfirmMs - sustained gap window
  DISADVANTAGE_MIN_ENGAGE_MS: 3500,        // combatDisadvantageMinEngageMs - minimum target age
  DISADVANTAGE_MIN_SAMPLES: 4,             // combatDisadvantageMinSamples - minimum observations

  // Fire discipline and stamina
  SHOOT_EVERY_MS: 160,                    // shootEveryMs - normal fire cadence
  SHOOT_RESERVE_BAND_MS: 360,             // combatShootReserveBandMs - reserve band fire cadence
  SHOOT_HARD_RESERVE_MS: 1200,            // combatShootHardReserveMs - hard floor for shooting
  SHOOT_DODGE_RESERVE_MS: 2400,           // combatShootDodgeReserveMs - normal dodge reserve

  // Passive runner handling
  PASSIVE_RUNNER_CONFIRM_MS: 2500,        // combatPassiveRunnerConfirmMs
  PASSIVE_RUNNER_DODGE_RESERVE_MS: 1800,  // combatShootPassiveRunnerDodgeReserveMs

  // Opponent probe (early engagement)
  OPPONENT_PROBE_MS: 6000,                // combatOpponentProbeMs
  OPPONENT_PROBE_RESERVE_MS: 5600,        // combatOpponentProbeReserveMs
  OPPONENT_PROBE_EVERY_MS: 520,           // combatOpponentProbeEveryMs

  // Finish pressure
  FINISH_LOW_THREAT_HP: 75,               // combatFinishLowThreatHp - target HP for finish
  FINISH_LOW_THREAT_RESERVE_MS: 1800,     // combatFinishLowThreatReserveMs
  FINISH_PRESSURE_RANGE: 11000,           // combatFinishPressureRange
  FINISH_REENGAGE_RANGE: 16000,           // combatFinishReengageRange

  // No damage pressure and close-in
  NO_DAMAGE_PRESS_CLOSE_MS: 6000,         // combatNoDamagePressCloseMs - far no-damage close
  NO_DAMAGE_PRESS_CLOSE_MIN_HP: 60,       // combatNoDamagePressCloseMinHp
  NO_DAMAGE_PRESS_CLOSE_RANGE: 10000,     // combatNoDamagePressCloseRange - max distance for press-close

  // Proactive Active combat gates
  LOW_VALUE_ACTIVE_DROP_MAX: 4,           // combatLowValueActiveDropMax - Drop threshold
  PROACTIVE_ACTIVE_KILL_STAMINA_BUDGET_MS: 100000, // combatProactiveActiveKillStaminaBudgetMs

  // Aim and intercept
  AIM_SPREAD_MAX: 0.14,                   // combatAimSpreadMax - aim jitter cap (radians)
  BULLET_SPEED_CM_PER_TICK: 500,          // Measured bullet speed
  BULLET_HIT_RADIUS_CM: 90,               // Measured server hit radius
  RENDER_DELAY_TICKS: 2,                  // combatInterceptRenderDelayTicks
  INTERCEPT_LOW_CONFIDENCE_THRESHOLD: 0.6, // combatInterceptLowConfidenceThreshold
  INTERCEPT_LOW_CONFIDENCE_FIRE_MS: 520,  // combatInterceptLowConfidenceFireMs

  // Combat tick and frame gaps
  COMBAT_TICK_GAP_OFFLINE_MS: 5000        // combatTickGapOfflineMs
};

/**
 * Get combat constant by key with fallback
 */
function getCombatConstant(key, fallback = 0) {
  return COMBAT_CONSTANTS[key] !== undefined ? COMBAT_CONSTANTS[key] : fallback;
}

/**
 * Validate combat constants for self-test
 */
function validateCombatConstants() {
  const errors = [];

  // Attack range must be positive
  if (COMBAT_CONSTANTS.ATTACK_RANGE <= 0) {
    errors.push('ATTACK_RANGE must be positive');
  }

  // Disengage range should be >= attack range
  if (COMBAT_CONSTANTS.DISENGAGE_RANGE < COMBAT_CONSTANTS.ATTACK_RANGE) {
    errors.push('DISENGAGE_RANGE should be >= ATTACK_RANGE');
  }

  // Spacing thresholds
  if (COMBAT_CONSTANTS.TARGET_SPACING_MAX < COMBAT_CONSTANTS.TARGET_SPACING_MIN) {
    errors.push('TARGET_SPACING_MAX should be >= TARGET_SPACING_MIN');
  }

  // HP thresholds
  if (COMBAT_CONSTANTS.CRITICAL_HP < 0 || COMBAT_CONSTANTS.CRITICAL_HP > 100) {
    errors.push('CRITICAL_HP should be 0-100');
  }

  if (COMBAT_CONSTANTS.LOW_HP_THRESHOLD < COMBAT_CONSTANTS.CRITICAL_HP) {
    errors.push('LOW_HP_THRESHOLD should be >= CRITICAL_HP');
  }

  // Fire cadence
  if (COMBAT_CONSTANTS.SHOOT_EVERY_MS <= 0) {
    errors.push('SHOOT_EVERY_MS must be positive');
  }

  return errors;
}

module.exports = {
  COMBAT_CONSTANTS,
  getCombatConstant,
  validateCombatConstants
};
