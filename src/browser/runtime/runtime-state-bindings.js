'use strict';

const {
  readPersistentLastSelfStateCore,
  writePersistentLastSelfStateCore
} = require('./persistent-last-self');
const {
  readPersistentExitStateCore,
  writePersistentExitStateCore
} = require('./persistent-exit');
const {
  clearPersistentStorageKey
} = require('./persistent-clear');
const {
  normalizePendingExitReloadConfirmationCore,
  readPersistedPendingExitStateCore,
  writePersistentPendingExitStateCore,
  chooseInitialPendingExitStateCore
} = require('./pending-exit-persistence');
const {
  pendingExitDisplayReasonCore,
  pendingExitRetryMsCore
} = require('./pending-exit');
const {
  refreshExitDetailCore
} = require('./refresh-exit-detail');
const {
  restoredCoinFailuresCore
} = require('./restored-coin-failures');
const {
  restoreRuntimeStateCore
} = require('./restored-runtime-state');
const {
  loginSnapshotSuccessRequiredCore,
  normalizeLoginSnapshotGateStateCore
} = require('./login-snapshot-gate');
const {
  recordRuntimeDiagnosticsCore
} = require('./runtime-diagnostics');
const {
  leaveWaitDisplayCore,
  finalizeLeaveDisplayReasonCore,
  offlineLeaveSummaryCore
} = require('./exit-relogin');
const {
  formatDistance,
  formatDurationMs
} = require('./display-format');
const {
  safeJsonClone,
  safeStringify
} = require('./runtime-utils');
const {
  staminaExhaustedWindowLabel
} = require('./exit-summary');

function fallbackNow() {
  return Date.now();
}

function fallbackPerformanceNow() {
  return fallbackNow();
}

function cloneForPendingExitBinding(value) {
  if (!value || typeof value !== 'object') return value || null;
  return safeJsonClone(value) || { ...value };
}

function staminaBudgetCoinLeaveSummaryForRuntimeState(staminaBudgetExit) {
  const detail = staminaBudgetExit || {};
  return '一小时体力预算不足，最近金币距离' + formatDistance(detail.distance)
    + '，预算' + formatDurationMs(detail.budgetMs)
    + '，需要' + formatDurationMs(detail.requiredMs)
    + '，差' + formatDurationMs(detail.shortageMs)
    + '，退出等待重连';
}

function createRuntimeStateBindings(runtime = {}) {
  const cfg = runtime.cfg && typeof runtime.cfg === 'object' ? runtime.cfg : {};
  const storage = runtime.storage || localStorage;
  const keys = runtime.keys && typeof runtime.keys === 'object' ? runtime.keys : {};
  const now = typeof runtime.now === 'function' ? runtime.now : fallbackNow;
  const performanceNow = typeof runtime.performanceNow === 'function' ? runtime.performanceNow : fallbackPerformanceNow;

  function refreshExitDetail(detail, t = now()) {
    return refreshExitDetailCore(
      detail,
      (summaryReason, summarySafety) => offlineLeaveSummaryCore(summaryReason, summarySafety, {
        staminaBudgetCoinLeaveSummary: staminaBudgetCoinLeaveSummaryForRuntimeState,
        staminaExhaustedWindowLabel
      }),
      value => finalizeLeaveDisplayReasonCore(value, (base, detailValue) => leaveWaitDisplayCore(base, detailValue, formatDurationMs)),
      t
    );
  }

  function readPersistentLastSelfState(t = now()) {
    return readPersistentLastSelfStateCore(storage, keys.lastSelfStateKey, cfg.lastSelfPersistMaxMs, t);
  }

  function writePersistentLastSelfState(selfSummary, t = now()) {
    writePersistentLastSelfStateCore(storage, keys.lastSelfStateKey, selfSummary, t);
  }

  function readPersistentExitState(key, t = now()) {
    return readPersistentExitStateCore(storage, key, refreshExitDetail, t);
  }

  function writePersistentExitState(key, detail) {
    writePersistentExitStateCore(storage, key, detail, refreshExitDetail);
  }

  function clearPersistentExitState(key) {
    clearPersistentStorageKey(key);
  }

  function clearPersistentPendingExitState() {
    clearPersistentStorageKey(keys.pendingExitStateKey);
  }

  function pendingExitRetryCoreOptionsForPersistence() {
    return {
      leaveRetryMinMs: cfg.leaveRetryMinMs,
      leaveCommandTimeoutMs: cfg.leaveCommandTimeoutMs,
      offlineLeaveRetryMs: cfg.offlineLeaveRetryMs,
      combatLeaveRetryMs: cfg.combatLeaveRetryMs,
      pursuitLeaveRetryMs: cfg.pursuitLeaveRetryMs
    };
  }

  function pendingExitPersistenceCoreHelpers() {
    return {
      pendingExitPersistMaxMs: cfg.pendingExitPersistMaxMs,
      cloneForPendingExit: cloneForPendingExitBinding,
      pendingExitDisplayReason: summary => pendingExitDisplayReasonCore(summary),
      pendingExitRetryMs: pending => pendingExitRetryMsCore(pending, pendingExitRetryCoreOptionsForPersistence()),
      stringify: safeStringify,
      clearPersistentPendingExitState
    };
  }

  const restoredRuntimeState = restoreRuntimeStateCore(runtime.preserved, runtime.previousBot, {
    restoredCoinFailures: () => restoredCoinFailuresCore(runtime.preserved?.coinFailures, cfg, performanceNow()),
    readPersistentExitState,
    readPersistedPendingExitState: (t, options) => readPersistedPendingExitStateCore(storage, keys.pendingExitStateKey, t, options, pendingExitPersistenceCoreHelpers()),
    chooseInitialPendingExitState: (memoryState, storedState, t, options) => chooseInitialPendingExitStateCore(memoryState, storedState, t, options, pendingExitPersistenceCoreHelpers()),
    enemyLeaveStateKey: keys.enemyLeaveStateKey,
    offlineLeaveStateKey: keys.offlineLeaveStateKey,
    nowMs: now
  });

  return {
    readPersistentLastSelfState,
    writePersistentLastSelfState,
    refreshExitDetail,
    readPersistentExitState,
    writePersistentExitState,
    clearPersistentExitState,
    clearPersistentPendingExitState,
    pendingExitRetryCoreOptionsForPersistence,
    pendingExitPersistenceCoreHelpers,
    normalizePendingExitReloadConfirmationCore,
    writePersistentPendingExitStateCore,
    restoredRuntimeState,
    restoredFailures: restoredRuntimeState.restoredFailures,
    restoredEnemyLeaveState: restoredRuntimeState.restoredEnemyLeaveState,
    restoredOfflineLeaveState: restoredRuntimeState.restoredOfflineLeaveState,
    restoredPendingExitState: restoredRuntimeState.restoredPendingExitState,
    initialPendingExitState: restoredRuntimeState.initialPendingExitState,
    loginSnapshotSuccessRequiredCore,
    normalizeLoginSnapshotGateStateCore,
    recordRuntimeDiagnosticsCore
  };
}

module.exports = {
  cloneForPendingExitBinding,
  createRuntimeStateBindings,
  staminaBudgetCoinLeaveSummaryForRuntimeState
};
