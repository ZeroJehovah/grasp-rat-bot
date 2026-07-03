'use strict';

function readPersistentExitStateCore(storage, key, refreshExitDetail, t = Date.now()) {
  let state = null;
  try {
    state = JSON.parse(storage.getItem(key) || 'null');
  } catch (_) {
    state = null;
  }
  if (!state || typeof state !== 'object') return null;
  const reloginUntil = Number(state.reloginUntil || 0);
  if (reloginUntil && reloginUntil <= t) {
    state.reloginUntil = 0;
    state.holdRemainingMs = 0;
    state.reloginDelayMs = 0;
  }
  return refreshExitDetail({ ...state, restored: true }, t);
}

function persistentExitStateFromDetail(detail, refreshExitDetail, t = Date.now()) {
  if (!detail || typeof detail !== 'object') return null;
  let reloginUntil = Number(detail.reloginUntil || 0);
  if (reloginUntil && reloginUntil <= t) {
    detail.reloginUntil = 0;
    detail.holdRemainingMs = 0;
    reloginUntil = 0;
  }
  return refreshExitDetail({
    at: Number(detail.at || t),
    updatedAt: t,
    attempted: Boolean(detail.attempted),
    method: detail.method || '',
    error: detail.error || '',
    reason: detail.reason || '',
    summary: detail.summary || detail.exitSummary || detail.enemyLeaveSummary || '',
    reloginUntil,
    reloginDelayMs: Number(detail.reloginDelayMs || 0),
    reloginHpDelayMs: Number(detail.reloginHpDelayMs || 0),
    reloginDelayRangeMs: detail.reloginDelayRangeMs || null,
    reloginRepeatDelayMs: Number(detail.reloginRepeatDelayMs || 0),
    reloginRepeatCount: Number(detail.reloginRepeatCount || 0),
    reloginMinimumDelayMs: Number(detail.reloginMinimumDelayMs || 0),
    reloginMinimumReason: detail.reloginMinimumReason || '',
    enemyActor: detail.enemyActor || null,
    enemyLeaveStreak: detail.enemyLeaveStreak || null,
    enemyLeaveReason: detail.enemyLeaveReason || '',
    loginSuppressReason: detail.loginSuppressReason || '',
    target: detail.target || null,
    pursuit: detail.pursuit || null,
    injury: detail.injury || null,
    self: detail.self || null,
    offlineSafety: detail.offlineSafety || null,
    staminaReset: detail.staminaReset || null
  }, t);
}

function writePersistentExitStateCore(storage, key, detail, refreshExitDetail, t = Date.now()) {
  const state = persistentExitStateFromDetail(detail, refreshExitDetail, t);
  if (!state) return false;
  try {
    storage.setItem(key, JSON.stringify(state));
    return true;
  } catch (_) {
    return false;
  }
}

module.exports = {
  readPersistentExitStateCore,
  persistentExitStateFromDetail,
  writePersistentExitStateCore
};
