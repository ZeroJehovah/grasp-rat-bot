'use strict';

const {
  actionPriorityBand,
  actionFocusTargetType,
  actionFocusId,
  actionFocusSummary
} = require('./runtime/action-priority');
const {
  finalActionBandRank,
  finalActionReusable,
  shouldHoldPreviousFinalAction,
  applyFinalActionArbitrationCore
} = require('./runtime/action-arbitration');
const {
  actionSwitchPairKey,
  buildPreviousDecisionSummary,
  recordActionSwitchDiagnosticsCore
} = require('./runtime/action-switch-diagnostics');

function actionArbitrationSource() {
  return String.raw`
  function targetSwitchHistoryLimit() {
    return Math.max(4, Math.round(Number(cfg.targetSwitchDiagnosticsHistoryLimit || 24) || 24));
  }

  function targetSwitchOscillationWindowMs() {
    return Math.max(1000, Math.round(Number(cfg.targetSwitchOscillationWindowMs || 10000) || 10000));
  }

  function roundedNullable(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(number) : null;
  }

  ${actionPriorityBand.toString()}

  ${actionFocusTargetType.toString()}

  ${actionFocusId.toString()}

  ${actionFocusSummary.toString()}

  function ensureTargetSwitchDiagnostics() {
    if (!bot.targetSwitchDiagnostics || typeof bot.targetSwitchDiagnostics !== 'object') {
      bot.targetSwitchDiagnostics = { lastFocus: null, lastTargetFocus: null, lastSwitch: null, events: [] };
    }
    if (!Array.isArray(bot.targetSwitchDiagnostics.events)) bot.targetSwitchDiagnostics.events = [];
    return bot.targetSwitchDiagnostics;
  }

  ${actionSwitchPairKey.toString()}

  ${buildPreviousDecisionSummary.toString()}

  ${recordActionSwitchDiagnosticsCore.toString()}

  function recordActionSwitchDiagnostics(action, source = '') {
    const state = ensureTargetSwitchDiagnostics();
    return recordActionSwitchDiagnosticsCore(action, state, {
      source,
      tickCount: bot.tickCount,
      previousDecision: bot.lastDecision,
      historyLimit: targetSwitchHistoryLimit(),
      oscillationWindowMs: targetSwitchOscillationWindowMs(),
      clone: safeJsonClone
    }).action;
  }

  function finalActionArbitrationHoldMs() {
    return Math.max(0, Math.round(Number(cfg.finalActionArbitrationHoldMs || 0) || 0));
  }

  function finalActionArbitrationHistoryLimit() {
    return Math.max(4, Math.round(Number(cfg.finalActionArbitrationHistoryLimit || 24) || 24));
  }

  function ensureFinalActionArbitration() {
    if (!bot.finalActionArbitration || typeof bot.finalActionArbitration !== 'object') {
      bot.finalActionArbitration = { lastAction: null, lastFocus: null, lastSelectedAt: 0, lastOverride: null, history: [] };
    }
    if (!Array.isArray(bot.finalActionArbitration.history)) bot.finalActionArbitration.history = [];
    return bot.finalActionArbitration;
  }

  ${finalActionBandRank.toString()}

  ${finalActionReusable.toString()}

  ${shouldHoldPreviousFinalAction.toString()}

  ${applyFinalActionArbitrationCore.toString()}

  function applyFinalActionArbitration(action, source = '') {
    const state = ensureFinalActionArbitration();
    return applyFinalActionArbitrationCore(action, state, {
      source,
      holdMs: finalActionArbitrationHoldMs(),
      historyLimit: finalActionArbitrationHistoryLimit(),
      clone: safeJsonClone
    }).action;
  }
`;
}

module.exports = {
  actionArbitrationSource
};
