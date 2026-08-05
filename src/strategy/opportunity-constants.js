'use strict';

/**
 * Opportunity and Profit System Constants
 *
 * Configuration for coin collection, AFK target selection, and ROI calculations.
 */

const OPPORTUNITY_CONSTANTS = {
  // Coin priorities and distances
  NEAR_COIN_PRIORITY_DISTANCE: 13500,     // nearCoinPriorityDistance - near coin threshold
  FOOT_COIN_PRIORITY_DISTANCE: 1200,      // footCoinPriorityDistance - foot coin threshold
  GLOBAL_COIN_MAX_DISTANCE: 200000,       // globalCoinMaxDistance - far coin limit

  // Coin routing
  COIN_ROUTE_MIN_COINS: 2,                // Minimum coins to form a route
  COIN_ROUTE_FIRST_COIN_DISTANCE_RATIO: 1.45, // coinRouteFirstCoinDistanceRatio
  COIN_ROUTE_FIRST_COIN_DISTANCE_SLACK: 6000, // coinRouteFirstCoinDistanceSlack
  COIN_ROUTE_NEARBY_FIRST_COIN_DISTANCE: 22000, // coinRouteNearbyFirstCoinDistance
  COIN_ROUTE_SWITCH_MARGIN: 3000,         // coinRouteSwitchMargin
  COIN_ROUTE_SWITCH_RELATIVE_MARGIN: 0.1, // coinRouteSwitchRelativeMargin

  // High value coin priority
  HIGH_VALUE_COIN_PRIORITY_AMOUNT: 10,    // highValueCoinPriorityAmount
  HIGH_VALUE_COIN_PRIORITY_HEALTHY_HP: 50, // highValueCoinPriorityHealthyHp

  // Post-attack drop handling
  POST_ATTACK_DROP_COIN_MAX_DISTANCE: 15000, // postAttackDropCoinMaxDistance
  POST_ATTACK_RECOVERY_DROP_MAX_DISTANCE: 8000, // postAttackRecoveryDropMaxDistance
  POST_ATTACK_RECOVERY_DROP_MIN_SCORE: 5,  // postAttackRecoveryDropMinScore
  POST_ATTACK_DROP_WAIT_MS: 1000,         // postAttackDropWaitMs

  // AFK target handling
  AFK_RECENT_ACTIVITY_COOLDOWN_MS: 12000, // afkRecentActivityCooldownMs
  AFK_STAMINA_OBSERVE_COOLDOWN_MS: 60000, // Out-of-range AFK stamina cooldown

  // Opportunity selection
  OPPORTUNITY_HOLD_MS: 1000,               // opportunityHoldMs - hold selected opportunity
  OPPORTUNITY_SWITCH_HOLD_MS: 1500,        // opportunitySwitchHoldMs - extended hold on switch
  OPPORTUNITY_MISSING_HOLD_MS: 800,        // opportunityMissingHoldMs - hold missing opportunity
  OPPORTUNITY_SWITCH_MARGIN: 0.15,         // opportunitySwitchMargin - ROI margin to switch

  // Stamina and ROI
  STAMINA_COST_PER_CM: 1,                  // Movement stamina cost (1ms per 1cm)
  SHOT_STAMINA_COST_MS: 500,               // shootStaminaCostMs - stamina per shot
  ESTIMATED_DAMAGE_PER_SHOT: 3,            // Estimated HP damage per accepted shot

  // Coin danger and safety
  COIN_DANGER_RADIUS: 8000,                // Base coin danger radius near threats
  INVULNERABLE_COIN_DANGER_RADIUS: 12000, // Wider danger for invulnerable threats

  // Recovery coin handling
  RECOVERY_COIN_MAX_DISTANCE: 5000,        // recoveryCoinMaxDistance

  // Native coin authority
  NATIVE_COIN_AUTHORITATIVE_RADIUS: 50000  // nativeCoinAuthoritativeRadius - local coin authority
};

/**
 * Calculate opportunity ROI (return on investment)
 *
 * @param {number} reward - Expected reward (coins or Drop value)
 * @param {number} staminaCost - Estimated stamina cost in ms
 * @returns {number} ROI score (higher is better)
 */
function calculateOpportunityROI(reward, staminaCost) {
  if (staminaCost <= 0) return reward > 0 ? Infinity : 0;
  return reward / staminaCost;
}

/**
 * Calculate movement stamina cost
 */
function calculateMovementStaminaCost(distanceCm) {
  return distanceCm * OPPORTUNITY_CONSTANTS.STAMINA_COST_PER_CM;
}

/**
 * Calculate shot stamina cost
 */
function calculateShotStaminaCost(shotCount) {
  return shotCount * OPPORTUNITY_CONSTANTS.SHOT_STAMINA_COST_MS;
}

/**
 * Estimate total opportunity stamina cost
 */
function estimateOpportunityStaminaCost(distanceCm, estimatedShots = 0) {
  return calculateMovementStaminaCost(distanceCm) + calculateShotStaminaCost(estimatedShots);
}

/**
 * Check if opportunity switch margin is satisfied
 */
function satisfiesSwitchMargin(newROI, currentROI, margin = OPPORTUNITY_CONSTANTS.OPPORTUNITY_SWITCH_MARGIN) {
  if (currentROI <= 0) return true;
  const relativeImprovement = (newROI - currentROI) / currentROI;
  return relativeImprovement >= margin;
}

/**
 * Validate opportunity constants
 */
function validateOpportunityConstants() {
  const errors = [];

  if (OPPORTUNITY_CONSTANTS.NEAR_COIN_PRIORITY_DISTANCE <= 0) {
    errors.push('NEAR_COIN_PRIORITY_DISTANCE must be positive');
  }

  if (OPPORTUNITY_CONSTANTS.HIGH_VALUE_COIN_PRIORITY_AMOUNT <= 0) {
    errors.push('HIGH_VALUE_COIN_PRIORITY_AMOUNT must be positive');
  }

  if (OPPORTUNITY_CONSTANTS.STAMINA_COST_PER_CM <= 0) {
    errors.push('STAMINA_COST_PER_CM must be positive');
  }

  if (OPPORTUNITY_CONSTANTS.OPPORTUNITY_SWITCH_MARGIN < 0) {
    errors.push('OPPORTUNITY_SWITCH_MARGIN should be non-negative');
  }

  return errors;
}

module.exports = {
  OPPORTUNITY_CONSTANTS,
  calculateOpportunityROI,
  calculateMovementStaminaCost,
  calculateShotStaminaCost,
  estimateOpportunityStaminaCost,
  satisfiesSwitchMargin,
  validateOpportunityConstants
};
