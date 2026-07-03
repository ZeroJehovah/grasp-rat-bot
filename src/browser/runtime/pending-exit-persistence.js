'use strict';

function identityClone(value) {
  return value;
}

function fallbackDisplayReason(summary) {
  return String(summary || '');
}

function fallbackRetryMs() {
  return 0;
}

function pendingExitPersistenceCoreHelpers(helpers = {}) {
  const input = helpers && typeof helpers === 'object' ? helpers : {};
  return {
    pendingExitPersistMaxMs: input.pendingExitPersistMaxMs,
    cloneForPendingExit: typeof input.cloneForPendingExit === 'function'
      ? input.cloneForPendingExit
      : identityClone,
    pendingExitDisplayReason: typeof input.pendingExitDisplayReason === 'function'
      ? input.pendingExitDisplayReason
      : fallbackDisplayReason,
    pendingExitRetryMs: typeof input.pendingExitRetryMs === 'function'
      ? input.pendingExitRetryMs
      : fallbackRetryMs,
    stringify: typeof input.stringify === 'function' ? input.stringify : JSON.stringify,
    clearPersistentPendingExitState: typeof input.clearPersistentPendingExitState === 'function'
      ? input.clearPersistentPendingExitState
      : () => {}
  };
}

function normalizePendingExitReloadConfirmationCore(value, pending = null, t = Date.now(), options = {}) {
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

function normalizePendingExitStateForStorageCore(value, t = Date.now(), options = {}, helpers = {}) {
  const resolved = pendingExitPersistenceCoreHelpers(helpers);
  if (!value || typeof value !== 'object') return null;
  const at = Number(value.at || value.lastAttemptAt || value.updatedAt || 0) || 0;
  const maxAgeMs = Math.max(60000, Number(resolved.pendingExitPersistMaxMs || 3600000) || 3600000);
  if (at && t - at > maxAgeMs) return null;
  const summary = String(value.summary || value.lastResult?.summary || value.reason || '').trim();
  const normalized = {
    schemaVersion: 1,
    scope: String(value.scope || ''),
    source: String(value.source || ''),
    reason: String(value.reason || value.lastResult?.reason || ''),
    summary,
    displayReason: String(value.displayReason || (summary ? resolved.pendingExitDisplayReason(summary) : '')),
    at: at || t,
    updatedAt: Number(value.updatedAt || t) || t,
    lastAttemptAt: Number(value.lastAttemptAt || value.lastResult?.at || at || 0) || 0,
    retryCount: Math.max(0, Math.round(Number(value.retryCount || 0) || 0)),
    retryMs: Math.max(0, Math.round(Number(value.retryMs || 0) || 0)),
    userId: value.userId || value.lastResult?.userId || null,
    self: resolved.cloneForPendingExit(value.self || value.lastResult?.self || null),
    offlineSafety: resolved.cloneForPendingExit(value.offlineSafety || value.lastResult?.offlineSafety || null),
    target: resolved.cloneForPendingExit(value.target || value.lastResult?.target || null),
    pursuit: resolved.cloneForPendingExit(value.pursuit || value.lastResult?.pursuit || null),
    injury: resolved.cloneForPendingExit(value.injury || value.lastResult?.injury || null),
    combat: resolved.cloneForPendingExit(value.combat || value.lastResult?.combat || null),
    combatCover: resolved.cloneForPendingExit(value.combatCover || value.lastResult?.combatCover || value.lastResult?.combat?.leaveCover || null),
    lastResult: resolved.cloneForPendingExit(value.lastResult || null)
  };
  const reloadConfirmation = normalizePendingExitReloadConfirmationCore(value.reloadConfirmation || normalized.lastResult?.reloadConfirmation, normalized, t, options);
  if (reloadConfirmation) {
    normalized.reloadConfirmation = reloadConfirmation;
    if (normalized.lastResult && typeof normalized.lastResult === 'object') {
      normalized.lastResult.reloadConfirmation = reloadConfirmation;
      normalized.lastResult.exitPending = true;
      normalized.lastResult.exitConfirmed = false;
    }
  }
  if (!normalized.retryMs) normalized.retryMs = resolved.pendingExitRetryMs(normalized);
  return normalized;
}

function readPersistedPendingExitStateCore(storage, key, t = Date.now(), options = {}, helpers = {}) {
  const resolved = pendingExitPersistenceCoreHelpers(helpers);
  let raw = null;
  try {
    raw = JSON.parse(storage.getItem(key) || 'null');
  } catch (_) {
    raw = null;
  }
  const normalized = normalizePendingExitStateForStorageCore(raw, t, options, resolved);
  if (!normalized && raw) resolved.clearPersistentPendingExitState();
  return normalized;
}

function writePersistentPendingExitStateCore(storage, key, pending = null, t = Date.now(), helpers = {}) {
  const resolved = pendingExitPersistenceCoreHelpers(helpers);
  const normalized = normalizePendingExitStateForStorageCore(pending, t, {}, resolved);
  if (!normalized) {
    resolved.clearPersistentPendingExitState();
    return null;
  }
  try {
    storage.setItem(key, resolved.stringify(normalized));
  } catch (_) {}
  return normalized;
}

function chooseInitialPendingExitStateCore(memoryState, storedState, t = Date.now(), options = {}, helpers = {}) {
  const resolved = pendingExitPersistenceCoreHelpers(helpers);
  const memory = normalizePendingExitStateForStorageCore(memoryState, t, {}, resolved);
  const stored = normalizePendingExitStateForStorageCore(storedState, t, options, resolved);
  if (!memory) return stored;
  if (!stored) return memory;
  const memoryStamp = Math.max(Number(memory.updatedAt || 0), Number(memory.lastAttemptAt || 0), Number(memory.at || 0));
  const storedStamp = Math.max(Number(stored.updatedAt || 0), Number(stored.lastAttemptAt || 0), Number(stored.at || 0));
  return storedStamp > memoryStamp ? stored : memory;
}

module.exports = {
  normalizePendingExitReloadConfirmationCore,
  normalizePendingExitStateForStorageCore,
  readPersistedPendingExitStateCore,
  writePersistentPendingExitStateCore,
  chooseInitialPendingExitStateCore
};
