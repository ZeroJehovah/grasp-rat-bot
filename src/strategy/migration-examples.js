'use strict';

/**
 * Strategy Module Usage Examples
 *
 * Demonstrates how to gradually migrate from cfg-based constants to module constants.
 * These are example wrappers showing the migration pattern.
 */

const { COMBAT_CONSTANTS } = require('./combat-constants');
const { OPPORTUNITY_CONSTANTS } = require('./opportunity-constants');

/**
 * Example: Migration pattern for simple constant accessors
 *
 * BEFORE (inline in main file):
 *   function highValueCoinPriorityAmount() {
 *     const value = Number(cfg.highValueCoinPriorityAmount ?? 10);
 *     return Math.max(1, Number.isFinite(value) ? value : 10);
 *   }
 *
 * AFTER (using module constant):
 *   function highValueCoinPriorityAmount() {
 *     const value = Number(cfg.highValueCoinPriorityAmount ?? OPPORTUNITY_CONSTANTS.HIGH_VALUE_COIN_PRIORITY_AMOUNT);
 *     return Math.max(1, Number.isFinite(value) ? value : OPPORTUNITY_CONSTANTS.HIGH_VALUE_COIN_PRIORITY_AMOUNT);
 *   }
 *
 * This pattern:
 * 1. Preserves cfg override capability
 * 2. Uses module constant as fallback instead of magic number
 * 3. Makes default values explicit and traceable
 * 4. No behavior change
 */

/**
 * Example wrapper showing module constant usage
 */
function exampleHighValueCoinAmount(cfg) {
  const value = Number(cfg.highValueCoinPriorityAmount ?? OPPORTUNITY_CONSTANTS.HIGH_VALUE_COIN_PRIORITY_AMOUNT);
  return Math.max(1, Number.isFinite(value) ? value : OPPORTUNITY_CONSTANTS.HIGH_VALUE_COIN_PRIORITY_AMOUNT);
}

/**
 * Example: Combat range check using module constants
 *
 * BEFORE:
 *   const inRange = distance <= Number(cfg.combatAttackRange || 0);
 *
 * AFTER:
 *   const inRange = distance <= Number(cfg.combatAttackRange ?? COMBAT_CONSTANTS.ATTACK_RANGE);
 */
function exampleIsInCombatRange(distance, cfg) {
  const attackRange = Number(cfg.combatAttackRange ?? COMBAT_CONSTANTS.ATTACK_RANGE);
  return distance <= attackRange;
}

/**
 * Example: Multiple fallbacks with module constants
 *
 * BEFORE:
 *   const spacing = cfg.combatTargetSpacingMin || cfg.defaultSpacing || 4500;
 *
 * AFTER:
 *   const spacing = cfg.combatTargetSpacingMin ?? COMBAT_CONSTANTS.TARGET_SPACING_MIN;
 */
function exampleCombatSpacing(cfg) {
  const minSpacing = Number(cfg.combatTargetSpacingMin ?? COMBAT_CONSTANTS.TARGET_SPACING_MIN);
  const maxSpacing = Number(cfg.combatTargetSpacingMax ?? COMBAT_CONSTANTS.TARGET_SPACING_MAX);
  return { minSpacing, maxSpacing };
}

/**
 * Example: Direct module constant usage (no cfg override needed)
 *
 * Some constants are internal thresholds that don't need runtime configuration.
 * These can use module constants directly:
 */
function exampleInternalThreshold() {
  // Internal validation threshold - doesn't need cfg override
  const minHpForPressure = COMBAT_CONSTANTS.NO_DAMAGE_PRESS_CLOSE_MIN_HP;
  return minHpForPressure;
}

/**
 * Migration checklist for each constant:
 *
 * 1. ✓ Identify the constant usage pattern
 * 2. ✓ Check if it needs cfg override capability
 * 3. ✓ Replace magic number with module constant
 * 4. ✓ Preserve fallback logic
 * 5. ✓ Test that behavior is unchanged
 * 6. ✓ Update tests if needed
 */

module.exports = {
  exampleHighValueCoinAmount,
  exampleIsInCombatRange,
  exampleCombatSpacing,
  exampleInternalThreshold
};
