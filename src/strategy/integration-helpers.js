'use strict';

/**
 * Strategy Module Validation and Integration Helpers
 *
 * Provides cross-validation between new strategy modules and existing
 * inline implementation to ensure consistency during migration.
 */

const { COMBAT_CONSTANTS, validateCombatConstants } = require('./combat-constants');
const { OPPORTUNITY_CONSTANTS, validateOpportunityConstants } = require('./opportunity-constants');

/**
 * Validate that strategy module constants match runtime config expectations
 *
 * @param {Object} cfg - Runtime config object from buildRuntimeDefaults
 * @returns {Object} { valid, errors, warnings }
 */
function validateStrategyModuleConstants(cfg) {
  const errors = [];
  const warnings = [];

  // Validate combat constants against config
  const combatErrors = validateCombatConstants();
  errors.push(...combatErrors);

  // Cross-check key combat values
  if (cfg.combatAttackRange !== undefined && cfg.combatAttackRange !== COMBAT_CONSTANTS.ATTACK_RANGE) {
    warnings.push(`Combat attack range mismatch: cfg=${cfg.combatAttackRange}, module=${COMBAT_CONSTANTS.ATTACK_RANGE}`);
  }

  if (cfg.combatDisengageRange !== undefined && cfg.combatDisengageRange !== COMBAT_CONSTANTS.DISENGAGE_RANGE) {
    warnings.push(`Combat disengage range mismatch: cfg=${cfg.combatDisengageRange}, module=${COMBAT_CONSTANTS.DISENGAGE_RANGE}`);
  }

  // Note: cfg.shootEveryMs is the main tick interval (120ms)
  // COMBAT_CONSTANTS.SHOOT_EVERY_MS is combat fire cadence (160ms) - different values are expected
  if (cfg.combatShootEveryMs !== undefined && cfg.combatShootEveryMs !== COMBAT_CONSTANTS.SHOOT_EVERY_MS) {
    warnings.push(`Combat shoot cadence mismatch: cfg=${cfg.combatShootEveryMs}, module=${COMBAT_CONSTANTS.SHOOT_EVERY_MS}`);
  }

  // Validate opportunity constants
  const opportunityErrors = validateOpportunityConstants();
  errors.push(...opportunityErrors);

  // Cross-check key opportunity values
  if (cfg.highValueCoinPriorityAmount !== undefined && cfg.highValueCoinPriorityAmount !== OPPORTUNITY_CONSTANTS.HIGH_VALUE_COIN_PRIORITY_AMOUNT) {
    warnings.push(`High value coin amount mismatch: cfg=${cfg.highValueCoinPriorityAmount}, module=${OPPORTUNITY_CONSTANTS.HIGH_VALUE_COIN_PRIORITY_AMOUNT}`);
  }

  if (cfg.nearCoinPriorityDistance !== undefined && cfg.nearCoinPriorityDistance !== OPPORTUNITY_CONSTANTS.NEAR_COIN_PRIORITY_DISTANCE) {
    warnings.push(`Near coin distance mismatch: cfg=${cfg.nearCoinPriorityDistance}, module=${OPPORTUNITY_CONSTANTS.NEAR_COIN_PRIORITY_DISTANCE}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    summary: `${errors.length} errors, ${warnings.length} warnings`
  };
}

/**
 * Get combat constant with cfg fallback for gradual migration
 *
 * During migration phase, prefer cfg value if available, otherwise use module constant.
 * Once migration is complete, this can be simplified to just return module constant.
 *
 * @param {Object} cfg - Runtime config
 * @param {string} key - Constant key
 * @param {number} moduleValue - Value from COMBAT_CONSTANTS
 * @returns {number}
 */
function getCombatConstantWithFallback(cfg, key, moduleValue) {
  const cfgKey = key.charAt(0).toLowerCase() + key.slice(1); // ATTACK_RANGE -> attackRange
  const cfgValue = cfg[`combat${cfgKey.charAt(0).toUpperCase()}${cfgKey.slice(1)}`];
  return cfgValue !== undefined ? cfgValue : moduleValue;
}

/**
 * Get opportunity constant with cfg fallback
 */
function getOpportunityConstantWithFallback(cfg, key, moduleValue) {
  const cfgValue = cfg[key];
  return cfgValue !== undefined ? cfgValue : moduleValue;
}

module.exports = {
  validateStrategyModuleConstants,
  getCombatConstantWithFallback,
  getOpportunityConstantWithFallback
};
