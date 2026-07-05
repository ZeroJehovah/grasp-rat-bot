'use strict';

const DEFAULT_NO_SELF_SNAPSHOT_RECOVERY_KEY = 'graspRatNoSelfSnapshotRecovery';
const DEFAULT_NO_SELF_SNAPSHOT_RECOVERY_TTL_MS = 30 * 60 * 1000;

function finiteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeNoSelfSnapshotRecoveryState(value, t = Date.now()) {
  let raw = value;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw || 'null');
    } catch (_) {
      raw = null;
    }
  }
  if (!raw || typeof raw !== 'object') return null;
  const requestedAt = finiteNumber(raw.requestedAt || raw.at, 0);
  const expiresAt = finiteNumber(raw.expiresAt, requestedAt ? requestedAt + DEFAULT_NO_SELF_SNAPSHOT_RECOVERY_TTL_MS : 0);
  if (!requestedAt || (expiresAt && t > expiresAt)) return null;
  return {
    schemaVersion: 1,
    reason: String(raw.reason || 'snapshot-no-self-exit-confirmed'),
    userId: finiteNumber(raw.userId || raw.currentUserId, 0) || null,
    requestedAt,
    expiresAt,
    source: String(raw.source || 'fresh-snapshot-missing-self'),
    noSelfAgeMs: Math.max(0, Math.round(finiteNumber(raw.noSelfAgeMs, 0))),
    snapshotAgeMs: Number.isFinite(Number(raw.snapshotAgeMs)) ? Math.max(0, Math.round(Number(raw.snapshotAgeMs))) : null,
    pageTimeOrigin: finiteNumber(raw.pageTimeOrigin, 0) || 0,
    ageMs: Math.max(0, Math.round(t - requestedAt)),
    remainingMs: Math.max(0, Math.round(expiresAt - t))
  };
}

function readNoSelfSnapshotRecoveryState(storage, options = {}) {
  const key = options.key || DEFAULT_NO_SELF_SNAPSHOT_RECOVERY_KEY;
  const t = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  let raw = null;
  try {
    raw = storage?.getItem ? storage.getItem(key) : null;
  } catch (_) {
    raw = null;
  }
  const state = normalizeNoSelfSnapshotRecoveryState(raw, t);
  if (!state && raw) {
    try {
      storage?.removeItem?.(key);
    } catch (_) {}
  }
  return state;
}

function activeNoSelfSnapshotRecoveryState(storage, userId = 0, options = {}) {
  const state = readNoSelfSnapshotRecoveryState(storage, options);
  if (!state) return null;
  const currentUserId = finiteNumber(userId, 0) || 0;
  if (state.userId && currentUserId && state.userId !== currentUserId) return null;
  return state;
}

function writeNoSelfSnapshotRecoveryState(storage, detail = {}, options = {}) {
  const t = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  const ttlMs = Math.max(10000, finiteNumber(options.ttlMs, DEFAULT_NO_SELF_SNAPSHOT_RECOVERY_TTL_MS));
  const state = normalizeNoSelfSnapshotRecoveryState({
    schemaVersion: 1,
    reason: detail.reason || 'snapshot-no-self-exit-confirmed',
    userId: detail.userId,
    requestedAt: t,
    expiresAt: t + ttlMs,
    source: detail.source || 'fresh-snapshot-missing-self',
    noSelfAgeMs: detail.noSelfAgeMs,
    snapshotAgeMs: detail.snapshotAgeMs,
    pageTimeOrigin: detail.pageTimeOrigin
  }, t);
  let error = '';
  try {
    storage?.setItem?.(options.key || DEFAULT_NO_SELF_SNAPSHOT_RECOVERY_KEY, JSON.stringify(state));
  } catch (err) {
    error = err?.message || String(err);
  }
  return { state, error };
}

function clearNoSelfSnapshotRecoveryState(storage, options = {}) {
  const key = options.key || DEFAULT_NO_SELF_SNAPSHOT_RECOVERY_KEY;
  let error = '';
  try {
    storage?.removeItem?.(key);
  } catch (err) {
    error = err?.message || String(err);
  }
  return { clearedAt: Date.now(), reason: String(options.reason || 'resolved'), error };
}

module.exports = {
  DEFAULT_NO_SELF_SNAPSHOT_RECOVERY_KEY,
  DEFAULT_NO_SELF_SNAPSHOT_RECOVERY_TTL_MS,
  normalizeNoSelfSnapshotRecoveryState,
  readNoSelfSnapshotRecoveryState,
  activeNoSelfSnapshotRecoveryState,
  writeNoSelfSnapshotRecoveryState,
  clearNoSelfSnapshotRecoveryState
};
