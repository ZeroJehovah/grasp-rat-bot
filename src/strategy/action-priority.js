'use strict';

/**
 * Action Priority Bands
 *
 * Defines the priority hierarchy for action arbitration.
 * Higher priority actions can override lower priority ones within the hold window.
 */

const ACTION_PRIORITY_BANDS = {
  exit: 0,      // Highest - immediate leave/exit actions
  safety: 1,    // Safety movements (flee from threats)
  combat: 2,    // Combat engagements
  profit: 3,    // Coin collection and profit opportunities
  recover: 4,   // Recovery/waiting for HP/stamina
  wait: 5       // Lowest - idle waiting
};

/**
 * Map action kinds to priority bands
 */
function getActionPriorityBand(action) {
  if (!action || typeof action !== 'object') return ACTION_PRIORITY_BANDS.wait;

  const kind = action.kind;
  const reason = action.reason || '';

  // Exit actions
  if (kind === 'leave' || reason.includes('leave') || reason.includes('exit')) {
    return ACTION_PRIORITY_BANDS.exit;
  }

  // Safety actions (flee, avoid)
  if (kind === 'flee' || reason.includes('avoid') || reason.includes('flee')) {
    return ACTION_PRIORITY_BANDS.safety;
  }

  // Combat actions
  if (kind === 'combat' || kind === 'attack' || reason.includes('combat') || reason.includes('shoot')) {
    return ACTION_PRIORITY_BANDS.combat;
  }

  // Profit actions (coins, opportunities)
  if (kind === 'coin' || kind === 'enemy' || reason.includes('coin') || reason.includes('opportunity')) {
    return ACTION_PRIORITY_BANDS.profit;
  }

  // Recovery actions
  if (kind === 'recover' || reason.includes('recover') || reason.includes('recovery')) {
    return ACTION_PRIORITY_BANDS.recover;
  }

  // Default to wait
  return ACTION_PRIORITY_BANDS.wait;
}

/**
 * Extract target key from action for tracking
 */
function getActionTargetKey(action) {
  if (!action) return null;

  // Target from action
  if (action.target) {
    const target = action.target;
    if (target.id) return String(target.id);
    if (target.x !== undefined && target.y !== undefined) {
      return `${Math.round(target.x)},${Math.round(target.y)}`;
    }
  }

  // Combat target
  if (action.combatTarget?.id) return String(action.combatTarget.id);

  // Enemy target
  if (action.enemy?.id) return String(action.enemy.id);

  return null;
}

/**
 * Build action focus summary for arbitration
 */
function buildActionFocus(action, priorityBand = null) {
  if (!action) return null;

  const band = priorityBand !== null ? priorityBand : getActionPriorityBand(action);
  const targetKey = getActionTargetKey(action);

  return {
    band,
    kind: action.kind || 'unknown',
    reason: action.reason || '',
    targetKey,
    score: action.opportunityScore || action.score || 0,
    staminaCost: action.staminaCost || action.opportunityStaminaCost || 0
  };
}

module.exports = {
  ACTION_PRIORITY_BANDS,
  getActionPriorityBand,
  getActionTargetKey,
  buildActionFocus
};
