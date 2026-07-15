'use strict';

const { actionPriorityBand, actionFocusSummary } = require('./action-priority');

function finalActionBandRank(band) {
  switch (String(band || '')) {
    case 'exit': return 600;
    case 'safety': return 500;
    case 'combat': return 400;
    case 'profit': return 300;
    case 'recover': return 200;
    case 'wait': return 100;
    default: return 0;
  }
}

function finalActionReusable(action) {
  if (!action || typeof action !== 'object') return false;
  if (action.kind === 'leave') return false;
  if (action.leave || action.pendingExitIntent) return false;
  const band = actionPriorityBand(action);
  return band === 'safety' || band === 'combat' || band === 'profit';
}

function finalActionCommitmentRank(action) {
  const value = Number(action?.finalCandidate?.commitmentRank ?? action?.commitmentRank ?? 0);
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
}

function shouldHoldPreviousFinalAction(previousAction, previousFocus, currentAction, currentFocus, ageMs, options = {}) {
  const holdMs = Math.max(0, Math.round(Number(options.holdMs || 0) || 0));
  if (!(holdMs > 0) || ageMs > holdMs) return false;
  if (!finalActionReusable(previousAction) || !currentAction || !currentFocus || !previousFocus) return false;
  if (previousFocus.key === currentFocus.key) return false;
  const previousBand = String(previousFocus.band || actionPriorityBand(previousAction));
  const currentBand = String(currentFocus.band || actionPriorityBand(currentAction));
  if (currentBand === 'exit') return false;
  if (previousBand === 'safety' && currentBand !== 'profit') return false;
  if (currentAction.urgent === true || currentAction.immediate === true || currentAction.realThreatEvidence === true) return false;
  if (previousBand === 'combat' && currentBand === 'safety') {
    const evidence = currentAction.threatEvidence || currentAction.safetyEvidence || {};
    return !(evidence.recentDamage || evidence.realBulletOwner || evidence.firing || evidence.invulnerableClose);
  }
  const previousRank = finalActionBandRank(previousBand);
  const currentRank = finalActionBandRank(currentBand);
  if (previousRank <= 0 || currentRank <= 0) return false;
  if (currentRank > previousRank) return false;
  if (previousBand === currentBand && previousBand !== 'profit') return false;
  if (previousBand === 'profit' && currentBand === 'profit') {
    const previousCommitment = finalActionCommitmentRank(previousAction);
    const currentCommitment = finalActionCommitmentRank(currentAction);
    if (currentCommitment > previousCommitment) return false;
    if (previousCommitment > currentCommitment) return true;
    const previousRoi = Number(previousAction.finalCandidate?.netROI ?? previousAction.netROI ?? previousAction.roiScore ?? previousAction.score);
    const currentRoi = Number(currentAction.finalCandidate?.netROI ?? currentAction.netROI ?? currentAction.roiScore ?? currentAction.score);
    const switchCost = Math.max(0, Number(currentAction.finalCandidate?.switchCost ?? currentAction.switchCost ?? 0));
    if (Number.isFinite(previousRoi) && Number.isFinite(currentRoi)) {
      const requiredRatio = Math.max(1.05, Number(options.profitSwitchRoiRatio || 1.15));
      const effectiveCurrent = currentRoi / Math.max(1, 1 + switchCost / 1000);
      return effectiveCurrent < previousRoi * requiredRatio;
    }
    return true;
  }
  if (previousBand === 'profit' && currentBand !== 'profit') return false;
  if (previousBand === 'safety' && currentBand === 'combat') return false;
  return true;
}

function defaultClone(value) {
  if (value === undefined || value === null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_) {
    return value;
  }
}

function applyFinalActionArbitrationCore(action, state, options = {}) {
  if (!state || typeof state !== 'object') {
    state = { lastAction: null, lastFocus: null, lastSelectedAt: 0, lastOverride: null, history: [] };
  }
  if (!Array.isArray(state.history)) state.history = [];

  const clone = typeof options.clone === 'function' ? options.clone : defaultClone;
  const tOption = Number(options.nowMs);
  const t = Number.isFinite(tOption) ? tOption : Date.now();
  const holdMs = Math.max(0, Math.round(Number(options.holdMs ?? options.finalActionArbitrationHoldMs ?? 0) || 0));
  const historyLimit = Math.max(4, Math.round(Number(options.historyLimit ?? options.finalActionArbitrationHistoryLimit ?? 24) || 24));
  const focusBuilder = typeof options.actionFocusSummary === 'function' ? options.actionFocusSummary : actionFocusSummary;

  const currentFocus = focusBuilder(action, { nowMs: t });
  const previousAction = state.lastAction || null;
  const previousFocus = state.lastFocus || null;
  const ageMs = Math.max(0, t - Number(state.lastSelectedAt || 0));
  let selected = action;
  let selectedFocus = currentFocus;
  let override = null;

  if (shouldHoldPreviousFinalAction(previousAction, previousFocus, action, currentFocus, ageMs, { holdMs })) {
    override = {
      type: 'final-action-arbitration',
      at: t,
      source: String(options.source || ''),
      mode: 'hold-previous',
      ageMs: Math.round(ageMs),
      holdMs,
      holdRemainingMs: Math.max(0, Math.round(holdMs - ageMs)),
      from: currentFocus,
      to: previousFocus,
      reason: 'higher-priority-band-stick'
    };
    selected = {
      ...previousAction,
      finalActionArbitration: override
    };
    selectedFocus = previousFocus;
  }

  if (override) {
    const snapshot = clone(override) || override;
    state.lastOverride = snapshot;
    state.history.push(snapshot);
    while (state.history.length > historyLimit) state.history.shift();
  }
  state.lastAction = clone(selected) || selected;
  state.lastFocus = clone(selectedFocus) || selectedFocus;
  if (!override) state.lastSelectedAt = t;

  return {
    action: selected,
    focus: selectedFocus,
    override,
    held: Boolean(override),
    state
  };
}

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

function applyFinalActionArbitration(currentAction, previousFinalAction, state, config = {}) {
  if (!state || typeof state !== 'object') {
    state = { lastAction: previousFinalAction || null, lastFocus: null, lastSelectedAt: 0, lastOverride: null, history: [] };
  }
  if (previousFinalAction && !state.lastAction) state.lastAction = previousFinalAction;
  const result = applyFinalActionArbitrationCore(currentAction, state, {
    holdMs: config.finalActionArbitrationHoldMs ?? config.holdMs,
    historyLimit: config.finalActionArbitrationHistoryLimit ?? config.historyLimit,
    source: config.source || ''
  });
  return {
    action: result.action,
    held: result.held,
    arbitration: result.override
  };
}

module.exports = {
  finalActionBandRank,
  finalActionReusable,
  finalActionCommitmentRank,
  shouldHoldPreviousFinalAction,
  applyFinalActionArbitrationCore,
  applyFinalActionArbitration,
  buildArbitrationStatus
};
