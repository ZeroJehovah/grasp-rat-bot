'use strict';

/**
 * Combat Target Classification and Selection
 *
 * Extracted from main file to improve modularity.
 * Handles combat target eligibility, priority, and selection logic.
 */

/**
 * Check if entity is a combat-eligible threat
 *
 * @param {Object} entity - Entity to check
 * @param {Object} options - Selection options
 * @returns {boolean}
 */
function isCombatEligibleThreat(entity, options = {}) {
  if (!entity) return false;

  // Invulnerable targets are not combat eligible
  if (isInvulnerableEntity(entity)) return false;

  // Whitelisted targets are protected
  if (options.whitelistCheck && options.whitelistCheck(entity)) return false;

  // Active mode is a threat indicator
  const isActiveMode = entity.current_join_mode === 'Active' || entity.mode === 'Active';

  // Check for activity evidence for Active mode
  if (isActiveMode) {
    const hasActivityEvidence =
      entity.firing ||
      entity.moving ||
      (entity.speed && entity.speed > 500) ||
      (entity.stamina_5s_remaining_milli && entity.stamina_5s_remaining_milli < 10000);

    return hasActivityEvidence;
  }

  // Non-active entities must have threat indicators
  return entity.firing || entity.moving || (entity.drop && entity.drop > 0);
}

/**
 * Check if entity is invulnerable
 */
function isInvulnerableEntity(entity) {
  if (!entity) return false;

  return Boolean(
    entity.invulnerable ||
    entity.invulnerable_tick ||
    entity.invulnerable_remaining_ms ||
    entity.invulnerableRemainingMs ||
    (entity.invulnerable_tick && entity.invulnerable_tick > 0) ||
    (entity.invulnerable_remaining_ms && entity.invulnerable_remaining_ms > 0) ||
    (entity.invulnerableRemainingMs && entity.invulnerableRemainingMs > 0)
  );
}

/**
 * Calculate combat target priority score
 *
 * Higher score = higher priority
 *
 * @param {Object} self - Self entity
 * @param {Object} target - Target entity
 * @param {Object} context - Combat context (bullets, threats, etc.)
 * @returns {number} Priority score
 */
function calculateCombatTargetPriority(self, target, context = {}) {
  if (!target) return 0;

  let score = 0;

  // Distance factor (closer is higher priority)
  const distance = target.distance || 0;
  if (distance > 0) {
    score += 10000 / distance;  // Inverse distance score
  }

  // Incoming bullet ownership (highest priority)
  if (context.incomingBulletOwnerId && String(target.user_id) === String(context.incomingBulletOwnerId)) {
    score += 10000;
  }

  // Firing entities are higher priority
  if (target.firing) {
    score += 5000;
  }

  // Recent injury evidence
  if (context.recentInjury && context.recentInjury.suspectId === target.user_id) {
    score += 3000;
  }

  // Moving targets are higher priority than stationary
  if (target.moving) {
    score += 1000;
  }

  // HP consideration (low HP targets can be finished)
  const targetHp = Number(target.hp || 100);
  if (targetHp < 50) {
    score += (50 - targetHp) * 20;  // Bonus for low HP targets
  }

  // Drop value for AFK targets
  if (target.drop && target.drop > 0) {
    score += target.drop * 10;
  }

  return score;
}

/**
 * Check if target satisfies proactive Active combat gates
 *
 * @param {Object} self - Self entity
 * @param {Object} target - Target entity
 * @param {Object} context - Combat context
 * @returns {Object} { allowed, reason }
 */
function checkProactiveActiveCombatGates(self, target, context = {}) {
  const { COMBAT_CONSTANTS } = require('./combat-constants');

  if (!target) return { allowed: false, reason: 'no-target' };

  // Check Drop threshold
  const drop = Number(target.drop || 0);
  if (drop <= COMBAT_CONSTANTS.LOW_VALUE_ACTIVE_DROP_MAX) {
    // Low Drop Active requires threat evidence
    const hasIncomingBullet = context.incomingBulletOwnerId &&
      String(target.user_id) === String(context.incomingBulletOwnerId);
    const hasRecentInjury = context.recentInjury &&
      context.recentInjury.suspectId === target.user_id;

    if (!hasIncomingBullet && !hasRecentInjury && !target.firing) {
      return { allowed: false, reason: 'low-drop-no-threat-evidence' };
    }
  }

  // Check stamina budget for proactive combat
  const opportunityBudget = context.opportunityStaminaBudget || 0;
  const requiredBudget = COMBAT_CONSTANTS.PROACTIVE_ACTIVE_KILL_STAMINA_BUDGET_MS;

  if (opportunityBudget < requiredBudget) {
    // Low budget still allows defensive combat with threat evidence
    const hasIncomingBullet = context.incomingBulletOwnerId &&
      String(target.user_id) === String(context.incomingBulletOwnerId);
    const hasRecentInjury = context.recentInjury &&
      context.recentInjury.suspectId === target.user_id;

    if (!hasIncomingBullet && !hasRecentInjury && !target.firing) {
      return { allowed: false, reason: 'insufficient-stamina-budget' };
    }
  }

  return { allowed: true, reason: 'proactive-gates-satisfied' };
}

/**
 * Select best combat target from candidates
 *
 * @param {Object} self - Self entity
 * @param {Array} candidates - Array of candidate targets
 * @param {Object} context - Combat context
 * @returns {Object|null} Selected target or null
 */
function selectBestCombatTarget(self, candidates, context = {}) {
  if (!candidates || !candidates.length) return null;

  // Filter and score candidates
  const scored = candidates
    .filter(target => isCombatEligibleThreat(target, context))
    .map(target => ({
      target,
      score: calculateCombatTargetPriority(self, target, context)
    }))
    .filter(item => item.score > 0);

  if (!scored.length) return null;

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Return highest priority target
  return scored[0].target;
}

/**
 * Check if entity is idle invulnerable (stationary, no activity)
 */
function isIdleInvulnerable(entity) {
  if (!entity || !isInvulnerableEntity(entity)) return false;

  // Idle means: no movement, no firing, full stamina, no recent activity
  const noMovement = !entity.moving && (!entity.speed || entity.speed < 100);
  const noFiring = !entity.firing;
  const fullStamina = entity.stamina_5s_remaining_milli >= 9900 ||
                      entity.stamina_5s_remaining_milli === 10000;
  const noRecentActivity = !entity.recentActivityCooldown || entity.recentActivityCooldown <= 0;

  return noMovement && noFiring && fullStamina && noRecentActivity;
}

module.exports = {
  isCombatEligibleThreat,
  isInvulnerableEntity,
  calculateCombatTargetPriority,
  checkProactiveActiveCombatGates,
  selectBestCombatTarget,
  isIdleInvulnerable
};
