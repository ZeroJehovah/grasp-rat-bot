'use strict';

/**
 * Final Action Arbitration
 *
 * Implements the final action arbitration layer that prevents rapid cross-band
 * target switching by holding higher-priority actions for a short window.
 */

const { getActionPriorityBand, buildActionFocus } = require('./action-priority');

/**
 * Apply final action arbitration to prevent target oscillation
 *
 * @param {Object} currentAction - The newly selected action
 * @param {Object} previousFinalAction - The previous final action that was executed
 * @param {Object} state - Arbitration state (preserved across calls)
 * @param {Object} config - Configuration
 * @returns {Object} - { action, held, arbitration }
 */
function applyFinalActionArbitration(currentAction, previousFinalAction, state, config) {
  const t = Date.now();
  const holdMs = Number(config.finalActionArbitrationHoldMs || 480) || 480;

  if (!state) {
    state = {
      lastAction: null,
      lastFocus: null,
      lastSelectedAt: 0,
      lastOverride: null,
      history: []
    };
  }

  const currentPriorityBand = getActionPriorityBand(currentAction);
  const currentFocus = buildActionFocus(currentAction, currentPriorityBand);

  // Exit is never held back
  if (currentPriorityBand === 0) { // exit band
    state.lastAction = currentAction;
    state.lastFocus = currentFocus;
    state.lastSelectedAt = t;
    state.lastOverride = null;
    return { action: currentAction, held: false, arbitration: null };
  }

  // No previous action - use current
  if (!previousFinalAction || !state.lastFocus) {
    state.lastAction = currentAction;
    state.lastFocus = currentFocus;
    state.lastSelectedAt = t;
    state.lastOverride = null;
    return { action: currentAction, held: false, arbitration: null };
  }

  const previousPriorityBand = state.lastFocus.band;
  const ageMs = t - state.lastSelectedAt;

  // Previous action is higher priority
  if (previousPriorityBand < currentPriorityBand) {
    // Hold expired or hold window not applicable
    if (ageMs >= holdMs) {
      state.lastAction = currentAction;
      state.lastFocus = currentFocus;
      state.lastSelectedAt = t;
      state.lastOverride = null;
      return { action: currentAction, held: false, arbitration: null };
    }

    // Safety (band 1) cannot block new combat (band 2) or new safety
    if (previousPriorityBand === 1 && currentPriorityBand <= 2) {
      state.lastAction = currentAction;
      state.lastFocus = currentFocus;
      state.lastSelectedAt = t;
      state.lastOverride = null;
      return { action: currentAction, held: false, arbitration: null };
    }

    // Profit (band 3) cannot block new combat (band 2) or safety (band 1)
    if (previousPriorityBand === 3 && currentPriorityBand <= 2) {
      state.lastAction = currentAction;
      state.lastFocus = currentFocus;
      state.lastSelectedAt = t;
      state.lastOverride = null;
      return { action: currentAction, held: false, arbitration: null };
    }

    // Hold the previous action
    const arbitration = {
      held: true,
      heldAction: {
        band: previousPriorityBand,
        kind: state.lastFocus.kind,
        reason: state.lastFocus.reason,
        targetKey: state.lastFocus.targetKey
      },
      blocked: {
        band: currentPriorityBand,
        kind: currentFocus.kind,
        reason: currentFocus.reason,
        targetKey: currentFocus.targetKey
      },
      ageMs,
      remainingMs: Math.max(0, holdMs - ageMs)
    };

    state.lastOverride = arbitration;

    // Record in history
    state.history = state.history || [];
    state.history.push({
      at: t,
      held: state.lastFocus.kind,
      blocked: currentFocus.kind,
      heldBand: previousPriorityBand,
      blockedBand: currentPriorityBand
    });

    // Keep history bounded
    if (state.history.length > 20) {
      state.history = state.history.slice(-20);
    }

    return { action: previousFinalAction, held: true, arbitration };
  }

  // Current action has higher or equal priority - use it
  state.lastAction = currentAction;
  state.lastFocus = currentFocus;
  state.lastSelectedAt = t;
  state.lastOverride = null;
  return { action: currentAction, held: false, arbitration: null };
}

/**
 * Build exposed arbitration status
 */
function buildArbitrationStatus(state) {
  if (!state) return null;

  return {
    lastAction: state.lastAction ? {
      kind: state.lastAction.kind,
      reason: state.lastAction.reason
    } : null,
    lastFocus: state.lastFocus ? { ...state.lastFocus } : null,
    lastSelectedAt: state.lastSelectedAt || 0,
    lastOverride: state.lastOverride ? { ...state.lastOverride } : null,
    history: (state.history || []).slice(-10)
  };
}

module.exports = {
  applyFinalActionArbitration,
  buildArbitrationStatus
};
