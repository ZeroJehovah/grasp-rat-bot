'use strict';

function pendingExitPersistenceInlineSource() {
  return String.raw`
		  function normalizePendingExitReloadConfirmation(value, pending = null, t = Date.now(), options = {}) {
		    const raw = value && typeof value === 'object'
		      ? value
		      : (pending?.lastResult?.reloadConfirmation && typeof pending.lastResult.reloadConfirmation === 'object' ? pending.lastResult.reloadConfirmation : null);
		    if (!raw?.required) return null;
		    const requestedAt = Number(raw.requestedAt || raw.reloadRequestedAt || 0) || 0;
		    let reloadedAt = Number(raw.reloadedAt || raw.restoredAt || 0) || 0;
		    const restoredAfterReload = Boolean(raw.restoredAfterReload || (options.markReloaded && requestedAt));
		    if (restoredAfterReload && requestedAt && !reloadedAt) reloadedAt = t;
		    return {
		      required: true,
		      reason: String(raw.reason || 'leave-success'),
		      leaveSucceededAt: Number(raw.leaveSucceededAt || raw.succeededAt || pending?.lastResult?.lastLeaveRequest?.completedAt || pending?.lastResult?.at || 0) || 0,
		      requestId: String(raw.requestId || pending?.lastResult?.lastLeaveRequest?.requestId || ''),
		      requestedAt,
		      reloadedAt,
		      restoredAfterReload,
		      count: Math.max(0, Math.round(Number(raw.count || raw.reloadCount || 0) || 0)),
		      lastResult: raw.lastResult || null,
		      lastBlocked: raw.lastBlocked || null
		    };
		  }

		  function normalizePendingExitStateForStorage(value, t = Date.now(), options = {}) {
		    if (!value || typeof value !== 'object') return null;
		    const at = Number(value.at || value.lastAttemptAt || value.updatedAt || 0) || 0;
		    const maxAgeMs = Math.max(60000, Number(cfg.pendingExitPersistMaxMs || 3600000) || 3600000);
		    if (at && t - at > maxAgeMs) return null;
		    const summary = String(value.summary || value.lastResult?.summary || value.reason || '').trim();
		    const normalized = {
		      schemaVersion: 1,
		      scope: String(value.scope || ''),
		      source: String(value.source || ''),
		      reason: String(value.reason || value.lastResult?.reason || ''),
		      summary,
		      displayReason: String(value.displayReason || (summary ? pendingExitDisplayReason(summary) : '')),
		      at: at || t,
		      updatedAt: Number(value.updatedAt || t) || t,
		      lastAttemptAt: Number(value.lastAttemptAt || value.lastResult?.at || at || 0) || 0,
		      retryCount: Math.max(0, Math.round(Number(value.retryCount || 0) || 0)),
		      retryMs: Math.max(0, Math.round(Number(value.retryMs || 0) || 0)),
		      userId: value.userId || value.lastResult?.userId || null,
		      self: cloneForPendingExit(value.self || value.lastResult?.self || null),
		      offlineSafety: cloneForPendingExit(value.offlineSafety || value.lastResult?.offlineSafety || null),
		      target: cloneForPendingExit(value.target || value.lastResult?.target || null),
		      pursuit: cloneForPendingExit(value.pursuit || value.lastResult?.pursuit || null),
		      injury: cloneForPendingExit(value.injury || value.lastResult?.injury || null),
		      combat: cloneForPendingExit(value.combat || value.lastResult?.combat || null),
		      combatCover: cloneForPendingExit(value.combatCover || value.lastResult?.combatCover || value.lastResult?.combat?.leaveCover || null),
		      lastResult: cloneForPendingExit(value.lastResult || null)
		    };
		    const reloadConfirmation = normalizePendingExitReloadConfirmation(value.reloadConfirmation || normalized.lastResult?.reloadConfirmation, normalized, t, options);
		    if (reloadConfirmation) {
		      normalized.reloadConfirmation = reloadConfirmation;
		      if (normalized.lastResult && typeof normalized.lastResult === 'object') {
		        normalized.lastResult.reloadConfirmation = reloadConfirmation;
		        normalized.lastResult.exitPending = true;
		        normalized.lastResult.exitConfirmed = false;
		      }
		    }
		    if (!normalized.retryMs) normalized.retryMs = pendingExitRetryMs(normalized);
		    return normalized;
		  }

		  function readPersistedPendingExitState(t = Date.now(), options = {}) {
		    let raw = null;
		    try {
		      raw = JSON.parse(localStorage.getItem(PENDING_EXIT_STATE_KEY) || 'null');
		    } catch (_) {
		      raw = null;
		    }
		    const normalized = normalizePendingExitStateForStorage(raw, t, options);
		    if (!normalized && raw) clearPersistentPendingExitState();
		    return normalized;
		  }

		  function writePersistentPendingExitState(pending = null) {
		    const normalized = normalizePendingExitStateForStorage(pending || bot.pendingExit, Date.now());
		    if (!normalized) {
		      clearPersistentPendingExitState();
		      return null;
		    }
		    try {
		      localStorage.setItem(PENDING_EXIT_STATE_KEY, safeStringify(normalized));
		    } catch (_) {}
		    return normalized;
		  }

		  function chooseInitialPendingExitState(memoryState, storedState, t = Date.now(), options = {}) {
		    const memory = normalizePendingExitStateForStorage(memoryState, t);
		    const stored = normalizePendingExitStateForStorage(storedState, t, options);
		    if (!memory) return stored;
		    if (!stored) return memory;
		    const memoryStamp = Math.max(Number(memory.updatedAt || 0), Number(memory.lastAttemptAt || 0), Number(memory.at || 0));
		    const storedStamp = Math.max(Number(stored.updatedAt || 0), Number(stored.lastAttemptAt || 0), Number(stored.at || 0));
		    return storedStamp > memoryStamp ? stored : memory;
		  }`;
}

function bundledPendingExitPersistenceSource() {
  return `const {
		    normalizePendingExitReloadConfirmationCore,
		    readPersistedPendingExitStateCore,
		    writePersistentPendingExitStateCore,
		    chooseInitialPendingExitStateCore
		  } = require('./src/browser/runtime/pending-exit-persistence');

		  function pendingExitPersistenceCoreHelpers() {
		    return {
		      pendingExitPersistMaxMs: cfg.pendingExitPersistMaxMs,
		      cloneForPendingExit,
		      pendingExitDisplayReason,
		      pendingExitRetryMs,
		      stringify: safeStringify,
		      clearPersistentPendingExitState
		    };
		  }

		  function readPersistedPendingExitState(t = Date.now(), options = {}) {
		    return readPersistedPendingExitStateCore(localStorage, PENDING_EXIT_STATE_KEY, t, options, pendingExitPersistenceCoreHelpers());
		  }

		  function writePersistentPendingExitState(pending = null) {
		    return writePersistentPendingExitStateCore(localStorage, PENDING_EXIT_STATE_KEY, pending || bot.pendingExit, Date.now(), pendingExitPersistenceCoreHelpers());
		  }

		  function chooseInitialPendingExitState(memoryState, storedState, t = Date.now(), options = {}) {
		    return chooseInitialPendingExitStateCore(memoryState, storedState, t, options, pendingExitPersistenceCoreHelpers());
		  }`;
}

function pendingExitPersistenceSource(options = {}) {
  if (options.bundledRuntime) return bundledPendingExitPersistenceSource();
  return pendingExitPersistenceInlineSource();
}

module.exports = {
  pendingExitPersistenceInlineSource,
  bundledPendingExitPersistenceSource,
  pendingExitPersistenceSource
};
