'use strict';

const {
  DEFAULT_NO_SELF_SNAPSHOT_RECOVERY_KEY,
  DEFAULT_NO_SELF_SNAPSHOT_RECOVERY_TTL_MS,
  readNoSelfSnapshotRecoveryState: readNoSelfSnapshotRecoveryStateCore,
  activeNoSelfSnapshotRecoveryState: activeNoSelfSnapshotRecoveryStateCore,
  writeNoSelfSnapshotRecoveryState,
  clearNoSelfSnapshotRecoveryState: clearNoSelfSnapshotRecoveryStateCore
} = require('./no-self-snapshot-recovery-state');

function wsReadyStateNumber(value) {
  if (value === null || value === undefined || value === '') return NaN;
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

function isWsConnectingOrOpen(value) {
  const n = wsReadyStateNumber(value);
  return n === 0 || n === 1;
}

function createNoSelfSnapshotRecoveryRuntime(runtime = {}) {
  const {
    bot,
    storage = typeof localStorage !== 'undefined' ? localStorage : null,
    transientStorage = typeof sessionStorage !== 'undefined' ? sessionStorage : null,
    noSelfSnapshotRecoveryKey = DEFAULT_NO_SELF_SNAPSHOT_RECOVERY_KEY,
    noSelfSnapshotRecoveryTtlMs = DEFAULT_NO_SELF_SNAPSHOT_RECOVERY_TTL_MS,
    getCurrentUserId = () => 0,
    getNativeControl = () => null,
    snapshotSelfPresenceState = () => ({ known: false, fresh: false, present: false }),
    clearPersistentPendingExitState = () => {},
    noteImportantSessionExit = () => null,
    requestReload = () => false,
    summarizeControl = () => null,
    updateBotPanel = () => {}
  } = runtime;
  const localStorage = storage;
  const browserSessionStorage = transientStorage;
  const NO_SELF_SNAPSHOT_RECOVERY_KEY = noSelfSnapshotRecoveryKey;

  function noSelfSnapshotExitConfirmationState(control, noSelfExit, t = Date.now()) {
    const userId = Number(control?.currentUserId || getCurrentUserId() || noSelfExit?.userId || 0) || 0;
    const snapshotSelf = noSelfExit?.snapshotSelf || snapshotSelfPresenceState(userId);
    const blockedBy = [];
    if (!noSelfExit?.shouldLeave) blockedBy.push('no-self-leave-not-due');
    if (!snapshotSelf?.known) blockedBy.push('snapshot-self-unknown');
    if (snapshotSelf?.fresh !== true) blockedBy.push('snapshot-self-stale');
    if (snapshotSelf?.present) blockedBy.push('snapshot-self-present');
    const confirmed = blockedBy.length === 0;
    return {
      confirmed,
      reason: confirmed ? 'snapshot-no-self-exit-confirmed' : (blockedBy[0] || 'snapshot-no-self-not-confirmed'),
      displayReason: confirmed ? '快照确认服务端已无自身，清理本地登录状态后重登' : '',
      source: 'fresh-snapshot-missing-self',
      at: t,
      userId: userId || null,
      snapshotSelf,
      noSelfAgeMs: Math.max(0, Math.round(Number(noSelfExit?.ageMs || 0) || 0)),
      noSelfGameSession: noSelfExit || null,
      control: control ? {
        wsOpen: Boolean(control.wsOpen),
        rawWsOpen: Boolean(control.rawWsOpen),
        connecting: Boolean(control.connecting),
        wsReadyState: control.wsReadyState ?? null,
        nativeWsReadyState: control.nativeWsReadyState ?? null,
        hasToken: Boolean(control.hasToken),
        transport: control.transport || ''
      } : null,
      blockedBy
    };
  }

  function preserveUserIdInput(userId) {
    if (!userId) return false;
    try {
      const input = document.getElementById('userId');
      if (!input || String(input.value || '').trim()) return false;
      input.value = String(userId);
      try {
        input.dispatchEvent(new Event('input', { bubbles: true }));
      } catch (_) {}
      try {
        input.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (_) {}
      return true;
    } catch (_) {
      return false;
    }
  }

  function removeStorageKey(store, key, label, removedKeys, storageErrors) {
    try {
      if (!store?.getItem || !store?.removeItem) return;
      const hadValue = store.getItem(key) !== null;
      store.removeItem(key);
      if (hadValue) removedKeys.push(label);
    } catch (err) {
      storageErrors.push({ key: label, error: err?.message || String(err) });
    }
  }

  function readNoSelfSnapshotRecoveryState(t = Date.now()) {
    const state = readNoSelfSnapshotRecoveryStateCore(localStorage, { key: NO_SELF_SNAPSHOT_RECOVERY_KEY, now: t });
    bot.noSelfSnapshotRecovery = state;
    return state;
  }

  function activeNoSelfSnapshotRecoveryState(userId = getCurrentUserId(), t = Date.now()) {
    const state = activeNoSelfSnapshotRecoveryStateCore(localStorage, userId, { key: NO_SELF_SNAPSHOT_RECOVERY_KEY, now: t });
    bot.noSelfSnapshotRecovery = state;
    return state;
  }

  function clearNoSelfSnapshotRecoveryState(reason = 'resolved') {
    const result = clearNoSelfSnapshotRecoveryStateCore(localStorage, { key: NO_SELF_SNAPSHOT_RECOVERY_KEY, reason });
    bot.noSelfSnapshotRecovery = null;
    return result;
  }

  function clearNoSelfSnapshotLocalSession(control, noSelfExit, reason = 'snapshot no-self exit confirmed') {
    const t = Date.now();
    const confirmation = noSelfSnapshotExitConfirmationState(control, noSelfExit, t);
    if (!confirmation.confirmed) return confirmation;
    const userId = confirmation.userId || Number(control?.currentUserId || getCurrentUserId() || 0) || null;
    const removedKeys = [];
    const storageErrors = [];
    for (const key of ['tmpGameSessionToken', 'tmpGameUserId']) {
      removeStorageKey(localStorage, key, key, removedKeys, storageErrors);
      removeStorageKey(browserSessionStorage, key, 'sessionStorage.' + key, removedKeys, storageErrors);
    }
    const markerResult = writeNoSelfSnapshotRecoveryState(localStorage, {
      reason: 'snapshot-no-self-exit-confirmed',
      userId,
      source: confirmation.source,
      noSelfAgeMs: confirmation.noSelfAgeMs,
      snapshotAgeMs: confirmation.snapshotSelf?.snapshotAgeMs,
      pageTimeOrigin: Number((typeof performance === 'object' && performance ? performance.timeOrigin : 0) || 0) || 0
    }, {
      key: NO_SELF_SNAPSHOT_RECOVERY_KEY,
      ttlMs: noSelfSnapshotRecoveryTtlMs,
      now: t
    });
    bot.noSelfSnapshotRecovery = markerResult.state;
    const preservedUserIdInput = preserveUserIdInput(userId);
    let closedNativeWs = false;
    let closeNativeWsError = '';
    try {
      const native = getNativeControl();
      if (native?.ws && isWsConnectingOrOpen(native.ws.readyState)) {
        native.ws.close();
        closedNativeWs = true;
      }
    } catch (err) {
      closeNativeWsError = err?.message || String(err);
    }
    if (bot.control && typeof bot.control === 'object') {
      bot.control.currentUserId = userId || bot.control.currentUserId || 0;
      bot.control.hasToken = false;
      bot.control.wsOpen = false;
      bot.control.nativeWsOpen = false;
      bot.control.connecting = false;
      bot.control.lastError = String(reason || 'snapshot no-self exit confirmed');
      bot.control.nativeReconnectEvents = [];
      bot.control.nativeReconnectChurn = false;
      bot.control.nativeReconnectEventCount = 0;
    }
    bot.pendingExit = null;
    clearPersistentPendingExitState();
    bot.offlineSince = 0;
    return {
      ...confirmation,
      clearedLocalSession: true,
      clearedAt: t,
      clearReason: String(reason || 'snapshot no-self exit confirmed'),
      removedKeys,
      storageErrors,
      recoveryMarker: markerResult.state,
      recoveryMarkerError: markerResult.error,
      preservedUserIdInput,
      closedNativeWs,
      closeNativeWsError,
      displayReason: confirmation.displayReason
    };
  }

  function handleNoSelfSnapshotExitRecovery(control, noSelfExit, options = {}) {
    const confirmation = noSelfSnapshotExitConfirmationState(control, noSelfExit);
    if (!confirmation.confirmed) return null;
    const recovery = clearNoSelfSnapshotLocalSession(control, noSelfExit);
    const leaveResult = {
      attempted: false,
      method: 'snapshot-confirmation',
      reason: 'snapshot no-self exit confirmed',
      at: recovery.clearedAt || Date.now(),
      userId: recovery.userId || getCurrentUserId() || null,
      self: bot.lastSelf || null,
      summary: '快照确认服务端已无自身，已清理本地登录状态',
      displayReason: recovery.displayReason,
      exitPending: false,
      exitConfirmed: true,
      localSessionReset: recovery
    };
    bot.lastOfflineLeaveResult = leaveResult;
    noteImportantSessionExit('snapshot-no-self-exit-confirmed', bot.lastSelf, Date.now(), { exit: leaveResult });
    const reloadRequested = requestReload('snapshot confirmed no-self local session reset');
    const blockedReload = reloadRequested === false
      ? (bot.exitAudit?.lastBlockedReload || bot.importantLogging?.lastBlockedReload || null)
      : null;
    return {
      kind: 'wait',
      reason: 'snapshot-no-self-exit-confirmed',
      dx: 0,
      dy: 0,
      currentUserId: recovery.userId || getCurrentUserId(),
      control: summarizeControl(),
      visibleEntities: Array.isArray(bot.globalState?.entities) ? bot.globalState.entities.length : 0,
      self: null,
      noSelfAgeMs: Math.max(0, Math.round(Number(options.noSelfAgeMs || noSelfExit?.ageMs || 0) || 0)),
      noSelfGameSession: noSelfExit,
      snapshotExitConfirmation: recovery,
      leave: leaveResult,
      reloadRequested: Boolean(reloadRequested),
      exitAuditFlush: reloadRequested === false ? bot.exitAudit?.lastBlockedReload || null : null,
      importantLogFlush: reloadRequested === false ? bot.importantLogging?.lastBlockedReload || null : null,
      displayReason: blockedReload
        ? (bot.exitAudit?.lastBlockedReload
          ? '等待退出日志发送完成，暂不刷新重登'
          : '等待会话结束日志发送完成，暂不刷新重登')
        : recovery.displayReason
    };
  }

  function runNoSelfSnapshotExitRecovery(control, noSelfExit, options = {}) {
    const decision = handleNoSelfSnapshotExitRecovery(control, noSelfExit, options);
    if (!decision) return false;
    bot.lastDecision = decision;
    updateBotPanel(decision);
    if (options.once && typeof bot.stop === 'function') bot.stop('once');
    return true;
  }

  return {
    noSelfSnapshotExitConfirmationState,
    readNoSelfSnapshotRecoveryState,
    activeNoSelfSnapshotRecoveryState,
    clearNoSelfSnapshotRecoveryState,
    clearNoSelfSnapshotLocalSession,
    handleNoSelfSnapshotExitRecovery,
    runNoSelfSnapshotExitRecovery
  };
}

module.exports = {
  createNoSelfSnapshotRecoveryRuntime
};
