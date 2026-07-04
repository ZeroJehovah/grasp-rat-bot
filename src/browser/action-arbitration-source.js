'use strict';

function recordActionSwitchDiagnosticsCall(actionExpr, sourceExpr = 'source') {
  return String.raw`(() => {
        const targetSwitchState = ensureTargetSwitchDiagnostics();
        return recordActionSwitchDiagnosticsCore(${actionExpr}, targetSwitchState, {
          source: ${sourceExpr},
          tickCount: bot.tickCount,
          previousDecision: bot.lastDecision,
          historyLimit: targetSwitchHistoryLimit(),
          oscillationWindowMs: targetSwitchOscillationWindowMs(),
          clone: safeJsonClone
        }).action;
      })()`;
}

function applyFinalActionArbitrationCall(actionExpr, sourceExpr = 'source') {
  return String.raw`(() => {
        const finalActionState = ensureFinalActionArbitration();
        return applyFinalActionArbitrationCore(${actionExpr}, finalActionState, {
          source: ${sourceExpr},
          holdMs: finalActionArbitrationHoldMs(),
          historyLimit: finalActionArbitrationHistoryLimit(),
          clone: safeJsonClone
        }).action;
      })()`;
}

function actionArbitrationSource() {
  return `const {
  actionPriorityBand,
  actionFocusTargetType,
  actionFocusId,
  actionFocusSummary
} = require('./src/browser/runtime/action-priority');
const {
  actionSwitchPairKey,
  buildPreviousDecisionSummary,
  recordActionSwitchDiagnosticsCore
} = require('./src/browser/runtime/action-switch-diagnostics');
const {
  finalActionBandRank,
  finalActionReusable,
  shouldHoldPreviousFinalAction,
  applyFinalActionArbitrationCore
} = require('./src/browser/runtime/action-arbitration');

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

  function ensureTargetSwitchDiagnostics() {
    if (!bot.targetSwitchDiagnostics || typeof bot.targetSwitchDiagnostics !== 'object') {
      bot.targetSwitchDiagnostics = { lastFocus: null, lastTargetFocus: null, lastSwitch: null, events: [] };
    }
    if (!Array.isArray(bot.targetSwitchDiagnostics.events)) bot.targetSwitchDiagnostics.events = [];
    return bot.targetSwitchDiagnostics;
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
`;
}

module.exports = {
  recordActionSwitchDiagnosticsCall,
  applyFinalActionArbitrationCall,
  actionArbitrationSource
};
