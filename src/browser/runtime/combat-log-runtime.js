'use strict';

const { safeStringify, safeJsonClone, sanitizeCombatLogIdPart } = require('./runtime-utils');
const { arrayCount } = require('./array-count');
const { createCombatLogQueueRuntime } = require('./combat-log-queue-runtime');
const { createCombatLogFrameRuntime } = require('./combat-log-frame-runtime');
const { createCombatLogDiagnosticsRuntime } = require('./combat-log-diagnostics-runtime');
const { createExitAuditRuntime } = require('./exit-audit-runtime');
const { combatLogExitSummaryFromDecision } = require('./exit-summary');
const {
  clearOfflineReloginHoldBoundCore: clearOfflineReloginHoldForCombatLogBoundCore,
  enemyReloginHoldRemainingMsBoundCore: enemyReloginHoldRemainingMsForCombatLogBoundCore,
  offlineReloginHoldRemainingMsBoundCore: offlineReloginHoldRemainingMsForCombatLogBoundCore
} = require('./exit-relogin');

function createCombatLogRuntime(runtime = {}) {
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
    recordRuntimeDiagnostics = () => {}
  } = runtime;
  const localStorage = storage;
  const COMBAT_LOG_PENDING_ENTRIES_KEY = combatLogPendingEntriesKey;
  const EXIT_AUDIT_PENDING_LOGS_KEY = exitAuditPendingLogsKey;
  const LOGIN_SUPPRESS_KEY = loginSuppressKey;
  const LOGIN_SUPPRESS_REASON_KEY = loginSuppressReasonKey;
  const ENEMY_LEAVE_STATE_KEY = enemyLeaveStateKey;
  const OFFLINE_LEAVE_STATE_KEY = offlineLeaveStateKey;
  const PENDING_EXIT_STATE_KEY = pendingExitStateKey;
  const recordRuntimeDiagnosticsCore = (_bot, detail) => recordRuntimeDiagnostics(detail);

  let readPersistedExitAuditLogs;
  let writePersistedExitAuditLogs;
  let persistExitAuditLogEntry;
  let removePersistedExitAuditLogs;
  let pendingExitAuditLogIds;
  let unresolvedExitAuditLogCount;
  let exitAuditFlushPending;
  let exitAuditFlushBlockDetail;
  let pendingImportantSessionEndLogEvents;
  let importantSessionEndFlushPending;
  let importantSessionEndFlushBlockDetail;
  let closeCurrentImportantSessionBeforeLogin;
  let closeCurrentImportantSessionBeforeReload;
  let restorePersistedExitAuditLogs;
  let newExitAuditId;
  let newExitAuditRequestId;
  let ensureExitAuditDetail;
  let exitAuditSelfSummary;
  let recordExitAuditEvent;

  const {
    combatLogEntryFailureKey,
    normalizeCombatLogFailedState,
    markCombatLogEntriesFailed,
    markCombatLogEntriesSent,
    combatLogPersistentEntryKey,
    shouldPersistCombatLogPendingEntry,
    readPersistedCombatLogPendingEntries,
    combatLogMaxPersistedEntries,
    writePersistedCombatLogPendingEntries,
    persistCombatLogPendingEntries,
    removePersistedCombatLogPendingEntries,
    configureCombatLogging,
    summarizeCombatLoggingStatus,
    restorePersistedCombatLogPendingEntries,
    queueCombatLogEntry,
    flushCombatLogs
  } = createCombatLogQueueRuntime({
    bot,
    cfg,
    storage: localStorage,
    combatLogPendingEntriesKey: COMBAT_LOG_PENDING_ENTRIES_KEY,
    persistExitAuditLogEntry: (...args) => persistExitAuditLogEntry(...args),
    removePersistedExitAuditLogs: (...args) => removePersistedExitAuditLogs(...args),
    unresolvedExitAuditLogCount: (...args) => unresolvedExitAuditLogCount(...args),
    restorePersistedExitAuditLogs: (...args) => restorePersistedExitAuditLogs(...args),
    restoreImportantLogsForRemote,
    markImportantLogsRemoteSent,
    markImportantLogsRemoteError
  });

  const {
    combatLogSelfSummary,
    combatEntitySummary,
    mergeCombatEntitySource,
    combatEntitySourceList,
    summarizeCombatEntities,
    combatBulletSummary,
    summarizeCombatBullets,
    combatMetricNumber,
    combatMetricRound,
    combatMetricDelta,
    combatMetricEntityId,
    combatMetricHp,
    combatMetricPoint,
    combatMetricDistance,
    combatMetricTarget,
    combatMetricBulletStats,
    combatMetricActionSummary,
    combatLogFrameMetrics,
    combatLogGlobalStateSummary,
    combatLogDecisionSummary,
    combatLogEnemyExitSummary,
    combatLogLoginResultSummary,
    combatLogManualLoginSummary,
    combatLogLoginSummary,
    combatLogRuntimeSummary,
    buildTimedCombatLogEntry,
    combatLogExitSummary,
    buildCombatLogEntry,
    combatLogTriggerReason,
    combatLogIsAfkAttack,
    combatLogSuspendReason
  } = createCombatLogFrameRuntime({
    ...runtime,
    storage: localStorage,
    loginSuppressKey: LOGIN_SUPPRESS_KEY,
    loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY,
    enemyLeaveStateKey: ENEMY_LEAVE_STATE_KEY,
    offlineLeaveStateKey: OFFLINE_LEAVE_STATE_KEY,
    pendingExitStateKey: PENDING_EXIT_STATE_KEY
  });

  const {
    coinDiagnosticsHasLoggableEntry,
    coinDiagnosticsSignature,
    recordCoinDiagnosticsLog,
    targetSwitchDiagnosticSignature,
    recordTargetSwitchLog,
    networkQualityDiagnosticSignature,
    networkQualityShouldLog,
    recordNetworkQualityLog
  } = createCombatLogDiagnosticsRuntime({
    ...runtime,
    queueCombatLogEntry,
    combatLogDecisionSummary,
    combatLogGlobalStateSummary,
    combatLogRuntimeSummary
  });

  ({
    readPersistedExitAuditLogs,
    writePersistedExitAuditLogs,
    persistExitAuditLogEntry,
    removePersistedExitAuditLogs,
    pendingExitAuditLogIds,
    unresolvedExitAuditLogCount,
    exitAuditFlushPending,
    exitAuditFlushBlockDetail,
    pendingImportantSessionEndLogEvents,
    importantSessionEndFlushPending,
    importantSessionEndFlushBlockDetail,
    closeCurrentImportantSessionBeforeLogin,
    closeCurrentImportantSessionBeforeReload,
    restorePersistedExitAuditLogs,
    newExitAuditId,
    newExitAuditRequestId,
    ensureExitAuditDetail,
    exitAuditSelfSummary,
    recordExitAuditEvent
  } = createExitAuditRuntime({
    bot,
    cfg,
    storage: localStorage,
    exitAuditPendingLogsKey: EXIT_AUDIT_PENDING_LOGS_KEY,
    normalizePendingExitReloadConfirmationCore,
    readImportantLogsStore,
    restoreImportantLogsForRemote,
    noteImportantSessionExit,
    getCurrentUserId,
    snapshotLoginGateStatus,
    summarizeControl,
    queueCombatLogEntry,
    flushCombatLogs,
    combatLogSelfSummary: (...args) => combatLogSelfSummary(...args),
    combatLogRuntimeSummary: (...args) => combatLogRuntimeSummary(...args),
    combatLogGlobalStateSummary: (...args) => combatLogGlobalStateSummary(...args)
  }));

      function combatLogTargetLabel(entry, decision) {
        const candidates = [
          decision?.target,
          entry?.target,
          entry?.enemyExit?.target,
          entry?.enemyExit?.enemyActor,
          entry?.injury?.nearestActive,
          entry?.injury?.nearestAvoidance,
          entry?.injury?.nearestHuman,
          entry?.pursuit,
          (entry?.nearbyEntities || [])[0]
        ];
        const picked = candidates.find(Boolean) || null;
        if (!picked) return 'unknown';
        return picked.name || picked.label || picked.id || picked.user_id || picked.targetId || 'unknown';
      }

      function makeCombatLogId(entry, decision) {
        const t = new Date(entry.at || Date.now()).toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
        const selfId = entry.self?.id ?? entry.self?.user_id ?? getCurrentUserId() ?? 'self';
        const target = combatLogTargetLabel(entry, decision);
        return sanitizeCombatLogIdPart(t + '-self-' + selfId + '-vs-' + target, 'combat-' + Date.now());
      }

	      function rememberCombatPreBuffer(entry) {
	        const state = bot.combatLogging;
	        if (combatLogIsAfkAttack(entry)) return;
	        if (!Array.isArray(state.preBuffer)) state.preBuffer = [];
	        const snapshot = safeJsonClone({ ...entry, phase: 'prebuffer' }) || { at: entry?.at || Date.now(), phase: 'prebuffer', error: 'clone failed' };
	        state.preBuffer.push(snapshot);
        const cutoff = Date.now() - Math.max(0, Number(cfg.combatLogPreBufferMs) || 10000);
        const maxEntries = Math.max(20, Math.ceil(Math.max(250, Number(cfg.combatLogPreBufferMs) || 10000) / Math.max(50, Number(cfg.tickMs) || 120)) + 10);
        while (state.preBuffer.length && Number(state.preBuffer[0].at || 0) < cutoff) state.preBuffer.shift();
        while (state.preBuffer.length > maxEntries) state.preBuffer.shift();
      }


      function recordCombatLogTick(source, decision = bot.lastDecision) {
        const recordStartedAt = Date.now();
        const recordStartedPerf = now();
        const state = bot.combatLogging;
        if (!state?.enabled) return;
        try {
          state.endpoint = String(cfg.combatLogEndpoint || state.endpoint || 'http://127.0.0.1:18765/combat-log');
          if (!state.endpoint) return;
          recordCoinDiagnosticsLog(source, decision || {});
          recordTargetSwitchLog(source, decision || {});
          recordNetworkQualityLog(source, decision || {});
          const suspendedReason = combatLogSuspendReason(decision || {});
          if (suspendedReason) {
            if (state.active) {
              const entry = buildTimedCombatLogEntry(source, decision || {});
              endCombatLogSession(entry, 'suspended:' + suspendedReason);
            }
            state.lastSkipReason = suspendedReason;
            flushCombatLogs(false);
            return;
          }
          state.lastSkipReason = '';
          const entry = buildTimedCombatLogEntry(source, decision || {});
	        const triggerReason = combatLogTriggerReason(entry, decision || {});
	        const triggered = Boolean(triggerReason);
	        const afkFrame = combatLogIsAfkAttack(entry, decision || {});
	        if (afkFrame && !triggered) {
	          state.lastSkipReason = 'afk-attack';
	          if (state.active
	            && state.lastCombatAt
	            && entry.at - Number(state.lastCombatAt || 0) >= Math.max(0, Number(cfg.combatLogPostBufferMs) || 10000)) {
	            endCombatLogSession(entry, 'post-buffer-elapsed');
	          }
	          flushCombatLogs(false);
	          return;
	        }
        const priorActive = Boolean(state.active);
        if (triggered && !priorActive) {
          startCombatLogSession(entry, decision || {}, triggerReason);
        } else if (triggered) {
          state.lastCombatAt = entry.at;
        }
        rememberCombatPreBuffer(entry);
        if (state.active) {
          queueCombatLogEntry({
            ...entry,
            phase: triggered ? 'combat' : 'post',
            triggerReason: triggerReason || ''
          });
          if (!triggered && state.lastCombatAt && entry.at - Number(state.lastCombatAt || 0) >= Math.max(0, Number(cfg.combatLogPostBufferMs) || 10000)) {
            endCombatLogSession(entry);
          }
        }
        flushCombatLogs(false);
        } finally {
          recordRuntimeDiagnosticsCore(bot, {
            lastCombatLogRecordAt: Date.now(),
            lastCombatLogRecordStartedAt: recordStartedAt,
            lastCombatLogRecordMs: Math.max(0, Math.round(now() - recordStartedPerf))
          });
        }
      }


  return {
    combatLogEntryFailureKey,
    normalizeCombatLogFailedState,
    markCombatLogEntriesFailed,
    markCombatLogEntriesSent,
    combatLogPersistentEntryKey,
    shouldPersistCombatLogPendingEntry,
    readPersistedCombatLogPendingEntries,
    combatLogMaxPersistedEntries,
    writePersistedCombatLogPendingEntries,
    persistCombatLogPendingEntries,
    removePersistedCombatLogPendingEntries,
    configureCombatLogging,
    summarizeCombatLoggingStatus,
    readPersistedExitAuditLogs,
    writePersistedExitAuditLogs,
    persistExitAuditLogEntry,
    removePersistedExitAuditLogs,
    pendingExitAuditLogIds,
    unresolvedExitAuditLogCount,
    exitAuditFlushPending,
    exitAuditFlushBlockDetail,
    pendingImportantSessionEndLogEvents,
    importantSessionEndFlushPending,
    importantSessionEndFlushBlockDetail,
    closeCurrentImportantSessionBeforeLogin,
    closeCurrentImportantSessionBeforeReload,
    restorePersistedExitAuditLogs,
    restorePersistedCombatLogPendingEntries,
    newExitAuditId,
    newExitAuditRequestId,
    ensureExitAuditDetail,
    exitAuditSelfSummary,
    recordExitAuditEvent,
    combatLogSelfSummary,
    combatEntitySummary,
    mergeCombatEntitySource,
    combatEntitySourceList,
    summarizeCombatEntities,
    combatBulletSummary,
    summarizeCombatBullets,
    combatMetricNumber,
    combatMetricRound,
    combatMetricDelta,
    combatMetricEntityId,
    combatMetricHp,
    combatMetricPoint,
    combatMetricDistance,
    combatMetricTarget,
    combatMetricBulletStats,
    combatMetricActionSummary,
    combatLogFrameMetrics,
    combatLogGlobalStateSummary,
    combatLogDecisionSummary,
    combatLogEnemyExitSummary,
    combatLogLoginResultSummary,
    combatLogManualLoginSummary,
    combatLogLoginSummary,
    combatLogRuntimeSummary,
    buildTimedCombatLogEntry,
    combatLogExitSummary,
    buildCombatLogEntry,
    combatLogTriggerReason,
    combatLogIsAfkAttack,
    combatLogSuspendReason,
    coinDiagnosticsHasLoggableEntry,
    coinDiagnosticsSignature,
    recordCoinDiagnosticsLog,
    targetSwitchDiagnosticSignature,
    recordTargetSwitchLog,
    networkQualityDiagnosticSignature,
    networkQualityShouldLog,
    recordNetworkQualityLog,
    combatLogTargetLabel,
    makeCombatLogId,
    rememberCombatPreBuffer,
    queueCombatLogEntry,
    startCombatLogSession,
    endCombatLogSession,
    flushCombatLogs,
    recordCombatLogTick
  };
}

module.exports = {
  createCombatLogRuntime
};
