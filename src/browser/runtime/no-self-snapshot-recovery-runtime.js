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

  function removeStorageKeysMatching(store, pattern, prefix, removedKeys, storageErrors) {
    try {
      if (!store?.key || !store?.removeItem) return;
      const keys = [];
      for (let i = 0; i < Number(store.length || 0); i += 1) {
        const key = store.key(i);
        if (key && pattern.test(String(key))) keys.push(key);
      }
      for (const key of keys) removeStorageKey(store, key, prefix + key, removedKeys, storageErrors);
    } catch (err) {
      storageErrors.push({ key: prefix + String(pattern), error: err?.message || String(err) });
    }
  }

  function clearNativePageSessionState(userId, reason = 'snapshot no-self exit confirmed') {
    const detail = { attempted: false, hadState: false, clearedFields: [], clearedReconnectFields: [], closedNativeWs: false, error: '' };
    try {
      const native = getNativeControl();
      const nativeState = native?.state || null;
      const ws = native?.ws || nativeState?.ws || null;
      detail.attempted = Boolean(native || nativeState || ws);
      if (nativeState && typeof nativeState === 'object') {
        detail.hadState = true;
        for (const [key, value] of [
          ['currentUserId', 0],
          ['sessionToken', ''],
          ['wsOpen', false],
          ['ws', null]
        ]) {
          if (key in nativeState) {
            nativeState[key] = value;
            detail.clearedFields.push(key);
          }
        }
        for (const key of ['entities', 'bullets', 'coinDrops', 'messages']) {
          if (Array.isArray(nativeState[key])) {
            nativeState[key] = [];
            detail.clearedFields.push(key);
          }
        }
        for (const key of Object.keys(nativeState)) {
          if (!/reconnect/i.test(key)) continue;
          const value = nativeState[key];
          if (typeof value === 'number') {
            try {
              clearTimeout(value);
              clearInterval(value);
            } catch (_) {}
            nativeState[key] = 0;
            detail.clearedReconnectFields.push(key);
          } else if (value && typeof value === 'object') {
            nativeState[key] = null;
            detail.clearedReconnectFields.push(key);
          }
        }
      }
      if (ws && isWsConnectingOrOpen(ws.readyState)) {
        try {
          ws.close();
          detail.closedNativeWs = true;
        } catch (err) {
          detail.error = err?.message || String(err);
        }
      }
      if (bot.control && typeof bot.control === 'object') {
        bot.control.currentUserId = userId || bot.control.currentUserId || 0;
        bot.control.hasToken = false;
        bot.control.wsOpen = false;
        bot.control.rawWsOpen = false;
        bot.control.nativeWsOpen = false;
        bot.control.connecting = false;
        bot.control.wsReadyState = null;
        bot.control.nativeWsReadyState = null;
        bot.control.observedNativeWs = null;
        bot.control.observedNativeWsReadyState = null;
        bot.control.lastError = String(reason || 'snapshot no-self exit confirmed');
        bot.control.nativeReconnectEvents = [];
        bot.control.nativeReconnectChurn = false;
        bot.control.nativeReconnectEventCount = 0;
      }
    } catch (err) {
      detail.error = err?.message || String(err);
    }
    return detail;
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
    removeStorageKeysMatching(localStorage, /^tmpGame/i, '', removedKeys, storageErrors);
    removeStorageKeysMatching(browserSessionStorage, /^tmpGame/i, 'sessionStorage.', removedKeys, storageErrors);
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
    const nativeSessionReset = clearNativePageSessionState(userId, reason);
    bot.pendingExit = null;
    clearPersistentPendingExitState();
    bot.offlineSince = 0;
    bot.waitSince = Date.now();
    return {
      ...confirmation,
      clearedLocalSession: true,
      clearedAt: t,
      clearReason: String(reason || 'snapshot no-self exit confirmed'),
      removedKeys,
      storageErrors,
      recoveryMarker: markerResult.state,
      recoveryMarkerError: markerResult.error,
      nativeSessionReset,
      preservedUserIdInput,
      closedNativeWs: Boolean(nativeSessionReset.closedNativeWs),
      closeNativeWsError: nativeSessionReset.error,
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
      reloadRequested: false,
      displayReason: recovery.displayReason
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
