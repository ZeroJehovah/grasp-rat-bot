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

function recordActionSwitchDiagnosticsCall(actionExpr, sourceExpr = 'source', options = {}) {
  if (!options.bundledRuntime) {
    return `recordActionSwitchDiagnostics(${actionExpr}, ${sourceExpr})`;
  }
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

function applyFinalActionArbitrationCall(actionExpr, sourceExpr = 'source', options = {}) {
  if (!options.bundledRuntime) {
    return `applyFinalActionArbitration(${actionExpr}, ${sourceExpr})`;
  }
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

function actionArbitrationInlineSource(helpers = {}, options = {}) {
  const {
    actionPriorityBand,
    actionFocusTargetType,
    actionFocusId,
    actionFocusSummary,
    actionSwitchPairKey,
    buildPreviousDecisionSummary,
    recordActionSwitchDiagnosticsCore,
    finalActionBandRank,
    finalActionReusable,
    shouldHoldPreviousFinalAction,
    applyFinalActionArbitrationCore
  } = helpers;
  const actionPriorityHelperSource = [
    actionPriorityBand,
    actionFocusTargetType,
    actionFocusId,
    actionFocusSummary
  ].map(fn => typeof fn === 'function' ? `  ${fn.toString()}` : '').join('\n\n');
  const actionSwitchHelperSource = [
    actionSwitchPairKey,
    buildPreviousDecisionSummary,
    recordActionSwitchDiagnosticsCore
  ].map(fn => typeof fn === 'function' ? `  ${fn.toString()}` : '').join('\n\n');
  const finalActionHelperSource = [
    finalActionBandRank,
    finalActionReusable,
    shouldHoldPreviousFinalAction,
    applyFinalActionArbitrationCore
  ].map(fn => typeof fn === 'function' ? `  ${fn.toString()}` : '').join('\n\n');
  const localActionSwitchWrapperSource = options.bundledRuntime ? '' : String.raw`
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

`;
  const localFinalActionWrapperSource = options.bundledRuntime ? '' : String.raw`
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

${actionPriorityHelperSource}

  function ensureTargetSwitchDiagnostics() {
    if (!bot.targetSwitchDiagnostics || typeof bot.targetSwitchDiagnostics !== 'object') {
      bot.targetSwitchDiagnostics = { lastFocus: null, lastTargetFocus: null, lastSwitch: null, events: [] };
    }
    if (!Array.isArray(bot.targetSwitchDiagnostics.events)) bot.targetSwitchDiagnostics.events = [];
    return bot.targetSwitchDiagnostics;
  }

${actionSwitchHelperSource}

${localActionSwitchWrapperSource}

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

${finalActionHelperSource}

${localFinalActionWrapperSource}
`;
}

function bundledActionArbitrationSource() {
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

${actionArbitrationInlineSource({}, { bundledRuntime: true })}`;
}

function actionArbitrationSource(options = {}) {
  if (options.bundledRuntime) return bundledActionArbitrationSource(options);
  return actionArbitrationInlineSource({
    actionPriorityBand,
    actionFocusTargetType,
    actionFocusId,
    actionFocusSummary,
    actionSwitchPairKey,
    buildPreviousDecisionSummary,
    recordActionSwitchDiagnosticsCore,
    finalActionBandRank,
    finalActionReusable,
    shouldHoldPreviousFinalAction,
    applyFinalActionArbitrationCore
  });
}

module.exports = {
  recordActionSwitchDiagnosticsCall,
  applyFinalActionArbitrationCall,
  actionArbitrationInlineSource,
  bundledActionArbitrationSource,
  actionArbitrationSource
};
