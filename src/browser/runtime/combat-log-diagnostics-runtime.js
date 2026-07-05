'use strict';

const { safeStringify } = require('./runtime-utils');

function createCombatLogDiagnosticsRuntime(runtime = {}) {
  const {
    bot,
    cfg,
    storage = typeof localStorage !== 'undefined' ? localStorage : null,
    combatLogPendingEntriesKey,
    exitAuditPendingLogsKey,
    loginSuppressKey,
    loginSuppressReasonKey,
    enemyLeaveStateKey,
    offlineLeaveStateKey,
    pendingExitStateKey,
    now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
    readPersistentExitState = () => null,
    writePersistentPendingExitStateCore = () => null,
    pendingExitPersistenceCoreHelpers = () => ({}),
    clearPersistentPendingExitState = () => {},
    clearPersistentExitState = () => {},
    normalizePendingExitReloadConfirmationCore = value => value,
    staleOfflineStaminaHoldContradicted = () => false,
    readImportantLogsStore = () => ({ events: [] }),
    restoreImportantLogsForRemote = () => 0,
    markImportantLogsRemoteSent = () => {},
    markImportantLogsRemoteError = () => {},
    noteImportantSessionExit = () => null,
    getCurrentUserId = () => null,
    summarizeSelf = value => value,
    dropValue = () => 0,
    dist = () => NaN,
    speed = () => 0,
    hypot = Math.hypot,
    knownHpValue = () => null,
    isCurrentlyActive = () => false,
    isMovingThreat = () => false,
    isFiringEntity = () => false,
    isInvulnerable = () => false,
    getNativeEntityList = () => [],
    normalizeBullet = value => value,
    getBullets = () => [],
    summarizeServerPositionStall = () => null,
    combatTickActiveFromState = () => false,
    summarizeNetworkQuality = () => null,
    getSelf = () => null,
    incomingBulletThreat = () => null,
    summarizePendingCombatLeave = () => null,
    summarizePursuit = value => value,
    summarizeControl = () => null,
    snapshotLoginGateStatus = () => null,
    recordRuntimeDiagnostics = () => {},
    queueCombatLogEntry,
    combatLogDecisionSummary,
    combatLogGlobalStateSummary,
    combatLogRuntimeSummary
  } = runtime;

      function coinDiagnosticsHasLoggableEntry(diag) {
        return Boolean(diag && (
          (Array.isArray(diag.filteredNearCoins) && diag.filteredNearCoins.length)
          || (Array.isArray(diag.ignoredNearCoins) && diag.ignoredNearCoins.length)
          || (Array.isArray(diag.snapshotOnlyNearCoins) && diag.snapshotOnlyNearCoins.length)
        ));
      }

      function coinDiagnosticsSignature(diag) {
        if (!diag) return '';
        const compact = {
          filtered: (diag.filteredNearCoins || []).map(item => [item.id, item.reason, item.distance, item.threat?.id]).slice(0, 8),
          ignored: (diag.ignoredNearCoins || []).map(item => [item.id, item.distance]).slice(0, 8),
          snapshot: (diag.snapshotOnlyNearCoins || []).map(item => [item.id, item.distance]).slice(0, 8)
        };
        return safeStringify(compact);
      }

      function recordCoinDiagnosticsLog(source, decision = bot.lastDecision) {
        const state = bot.combatLogging;
        if (!state?.enabled || !state.endpoint) return false;
        const diag = decision?.coinDiagnostics || bot.coinDiagnostics || null;
        if (!coinDiagnosticsHasLoggableEntry(diag)) return false;
        const signature = coinDiagnosticsSignature(diag);
        const t = Date.now();
        const minIntervalMs = 5000;
        if (signature && signature === state.lastCoinDiagnosticsSignature && t - Number(state.lastCoinDiagnosticsAt || 0) < minIntervalMs) return false;
        state.lastCoinDiagnosticsSignature = signature;
        state.lastCoinDiagnosticsAt = t;
        queueCombatLogEntry({
          type: 'coin-diagnostics',
          at: t,
          perfNow: Math.round(now()),
          tickCount: bot.tickCount,
          source,
          version: cfg.version,
          sourceHash: cfg.sourceHash,
          injectedBy: cfg.injectedBy,
          url: location.href,
          visibilityState: document.visibilityState || '',
          decision: combatLogDecisionSummary(decision || {}),
          target: decision?.target || null,
          coinDiagnostics: diag,
          safety: bot.lastSafety || null,
          control: summarizeControl(),
          globalState: combatLogGlobalStateSummary()
        });
        return true;
      }

      function targetSwitchDiagnosticSignature(detail) {
        if (!detail || typeof detail !== 'object') return '';
        return [
          detail?.from?.key || '',
          detail?.to?.key || '',
          detail?.to?.kind || '',
          detail?.to?.reason || '',
          detail?.oscillating ? 'oscillating' : 'single'
        ].join('>');
      }

      function recordTargetSwitchLog(source, decision = bot.lastDecision) {
        const state = bot.combatLogging;
        if (!state?.enabled || !state.endpoint) return false;
        const detail = decision?.targetSwitch || null;
        if (!detail) return false;
        const signature = targetSwitchDiagnosticSignature(detail);
        const t = Date.now();
        const minIntervalMs = Math.max(0, Number(cfg.targetSwitchLogMinIntervalMs || 1000) || 1000);
        if (signature && signature === state.lastTargetSwitchDiagnosticsSignature && t - Number(state.lastTargetSwitchDiagnosticsAt || 0) < minIntervalMs) return false;
        state.lastTargetSwitchDiagnosticsSignature = signature;
        state.lastTargetSwitchDiagnosticsAt = t;
        queueCombatLogEntry({
          type: 'target-switch',
          at: t,
          perfNow: Math.round(now()),
          tickCount: bot.tickCount,
          source,
          version: cfg.version,
          sourceHash: cfg.sourceHash,
          injectedBy: cfg.injectedBy,
          url: location.href,
          visibilityState: document.visibilityState || '',
          decision: combatLogDecisionSummary(decision || {}),
          target: decision?.target || null,
          targetSwitch: detail,
          targetSwitchDiagnostics: {
            lastFocus: bot.targetSwitchDiagnostics?.lastFocus || null,
            lastTargetFocus: bot.targetSwitchDiagnostics?.lastTargetFocus || null,
            events: Array.isArray(bot.targetSwitchDiagnostics?.events) ? bot.targetSwitchDiagnostics.events.slice(-8) : []
          },
          opportunityChoice: bot.opportunityChoice || null,
          opportunitySwitchLock: bot.opportunitySwitchLock || null,
          lastTarget: bot.lastTarget || null,
          safety: bot.lastSafety || null,
          control: summarizeControl(),
          runtime: combatLogRuntimeSummary(t),
          globalState: combatLogGlobalStateSummary()
        });
        return true;
      }

      function networkQualityDiagnosticSignature(summary) {
        if (!summary || typeof summary !== 'object') return '';
        const latency = Number(summary.displayLatencyMs);
        const loss = Number(summary.lossPercent);
        const stall = summary.stalled ? 'stall' : 'ok';
        const latencyBucket = Number.isFinite(latency) ? Math.floor(latency / 100) * 100 : 'na';
        const lossBucket = Number.isFinite(loss) ? Math.floor(loss / 5) * 5 : 'na';
        return [stall, latencyBucket, lossBucket, summary.latencySource || '', summary.lossSource || ''].join('|');
      }

      function networkQualityShouldLog(summary) {
        if (!summary?.enabled) return false;
        const latency = Number(summary.displayLatencyMs);
        const loss = Number(summary.lossPercent);
        const latencyLimit = Math.max(50, Number(cfg.networkQualityLogLatencyMs || 350) || 350);
        const lossLimit = Math.max(0.1, Number(cfg.networkQualityLogLossPercent || 5) || 5);
        return Boolean(summary.stalled)
          || (Number.isFinite(latency) && latency >= latencyLimit)
          || (Number.isFinite(loss) && loss >= lossLimit);
      }

      function recordNetworkQualityLog(source, decision = bot.lastDecision) {
        const state = bot.combatLogging;
        if (!state?.enabled || !state.endpoint || typeof summarizeNetworkQuality !== 'function') return false;
        const t = Date.now();
        const summary = summarizeNetworkQuality(t);
        if (!networkQualityShouldLog(summary)) return false;
        const signature = networkQualityDiagnosticSignature(summary);
        const minIntervalMs = Math.max(1000, Number(cfg.networkQualityLogIntervalMs || 10000) || 10000);
        if (signature && signature === state.lastNetworkQualityDiagnosticsSignature && t - Number(state.lastNetworkQualityDiagnosticsAt || 0) < minIntervalMs) return false;
        state.lastNetworkQualityDiagnosticsSignature = signature;
        state.lastNetworkQualityDiagnosticsAt = t;
        queueCombatLogEntry({
          type: 'network-quality',
          at: t,
          perfNow: Math.round(now()),
          tickCount: bot.tickCount,
          source,
          version: cfg.version,
          sourceHash: cfg.sourceHash,
          injectedBy: cfg.injectedBy,
          url: location.href,
          visibilityState: document.visibilityState || '',
          decision: combatLogDecisionSummary(decision || {}),
          networkQuality: summary,
          runtime: {
            networkQuality: summary,
            lastTickDurationMs: Number.isFinite(Number(bot.runtimeDiagnostics?.lastTickDurationMs)) ? Math.max(0, Math.round(Number(bot.runtimeDiagnostics.lastTickDurationMs))) : null,
            lastTickSource: bot.runtimeDiagnostics?.lastTickSource || ''
          },
          control: summarizeControl(),
          globalState: combatLogGlobalStateSummary()
        });
        return true;
      }

  return {
    coinDiagnosticsHasLoggableEntry,
    coinDiagnosticsSignature,
    recordCoinDiagnosticsLog,
    targetSwitchDiagnosticSignature,
    recordTargetSwitchLog,
    networkQualityDiagnosticSignature,
    networkQualityShouldLog,
    recordNetworkQualityLog
  };
}

module.exports = {
  createCombatLogDiagnosticsRuntime
};
