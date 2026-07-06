'use strict';

const { formatDurationMs } = require('./display-format');
const {
  finalizeLeaveDisplayReasonCore: finalizeLeaveDisplayReasonForReloginGateCore,
  leaveWaitDisplayCore: leaveWaitDisplayForReloginGateCore
} = require('./exit-relogin');

function createReloginGateRuntime(runtime = {}) {
  const {
    bot,
    cfg,
    storage = typeof localStorage !== 'undefined' ? localStorage : null,
    loginSuppressKey,
    loginSuppressReasonKey,
    enemyLeaveStateKey,
    offlineLeaveStateKey,
    clearPersistentPendingExitState = () => {},
    clearPersistentExitState = () => {},
    activeEnemyLeaveDetail = () => null,
    activeOfflineLeaveDetail = () => null,
    loginSuppressStatus = () => ({}),
    snapshotLoginGateStatus = () => ({}),
    loginPointSafetyStatus = () => ({})
  } = runtime;
  const localStorage = storage;
  const LOGIN_SUPPRESS_KEY = loginSuppressKey;
  const LOGIN_SUPPRESS_REASON_KEY = loginSuppressReasonKey;
  const ENEMY_LEAVE_STATE_KEY = enemyLeaveStateKey;
  const OFFLINE_LEAVE_STATE_KEY = offlineLeaveStateKey;

  function reloginCooldownCandidates(t = Date.now()) {
    const suppress = loginSuppressStatus(t);
    const candidates = [];
    const pushCandidate = (source, remainingMs, totalMs = 0, reason = '', until = 0) => {
      const remaining = Math.max(0, Math.round(Number(remainingMs || 0) || 0));
      const total = Math.max(remaining, Math.round(Number(totalMs || 0) || 0));
      if (!remaining && !total) return;
      candidates.push({
        source,
        reason: String(reason || ''),
        remainingMs: remaining,
        totalMs: total,
        until: Number(until || 0) || 0
      });
    };
    const loginCooldownTotalMs = Math.max(0, Math.round(Number(cfg.loginCooldownMs || 0) || 0));
    const loginCooldownRemainingMs = bot.lastLoginAt
      ? Math.max(0, Math.round(Number(bot.lastLoginAt || 0) + loginCooldownTotalMs - t))
      : 0;
    pushCandidate('login-cooldown', loginCooldownRemainingMs, loginCooldownTotalMs, 'login cooldown', Number(bot.lastLoginAt || 0) + loginCooldownTotalMs);
    const suppressReason = String(suppress.reason || 'login suppress');
    const suppressTotalMs = suppressReason === 'bot login started'
      ? Math.max(Number(suppress.remainingMs || 0) || 0, Number(cfg.postLoginGraceMs || 0) || 0)
      : Number(suppress.remainingMs || 0) || 0;
    pushCandidate('login-suppress', suppress.remainingMs, suppressTotalMs, suppressReason, suppress.until);
    const enemyDetail = activeEnemyLeaveDetail(t);
    const enemyUntil = Math.max(Number(enemyDetail?.reloginUntil || 0) || 0, Number(bot.pursuitReloginUntil || 0) || 0);
    const enemyRemainingMs = Math.max(
      0,
      Math.round(Number(enemyDetail?.holdRemainingMs || 0) || 0),
      Math.round(enemyUntil - t)
    );
    pushCandidate(
      'enemy-hold',
      enemyRemainingMs,
      Number(enemyDetail?.reloginDelayMs || bot.lastEnemyLeaveWaitMs || enemyRemainingMs || 0),
      enemyDetail?.reason || enemyDetail?.summary || 'enemy leave hold',
      enemyUntil
    );
    const offlineDetail = activeOfflineLeaveDetail(t);
    const offlineUntil = Math.max(Number(offlineDetail?.reloginUntil || 0) || 0, Number(bot.offlineReloginUntil || 0) || 0);
    const offlineRemainingMs = Math.max(
      0,
      Math.round(Number(offlineDetail?.holdRemainingMs || 0) || 0),
      Math.round(offlineUntil - t)
    );
    pushCandidate(
      'offline-hold',
      offlineRemainingMs,
      Number(offlineDetail?.reloginDelayMs || bot.lastOfflineLeaveWaitMs || offlineRemainingMs || 0),
      offlineDetail?.reason || offlineDetail?.summary || 'offline leave hold',
      offlineUntil
    );
    const lastLoginResult = bot.lastLoginResult && typeof bot.lastLoginResult === 'object' ? bot.lastLoginResult : null;
    pushCandidate(
      'last-login-result',
      Number(lastLoginResult?.cooldownRemainingMs || 0) || 0,
      Number(lastLoginResult?.cooldownTotalMs || lastLoginResult?.cooldownRemainingMs || 0) || 0,
      lastLoginResult?.suppressReason || lastLoginResult?.reason || 'last login result',
      0
    );
    return candidates.sort((a, b) => {
      const remainingDelta = Number(b.remainingMs || 0) - Number(a.remainingMs || 0);
      if (remainingDelta) return remainingDelta;
      return Number(b.totalMs || 0) - Number(a.totalMs || 0);
    });
  }

  function summarizeReloginGateStatus(t = Date.now()) {
    const snapshotGate = snapshotLoginGateStatus(t);
    const pointSafety = snapshotGate.pointSafety || loginPointSafetyStatus(t);
    const cooldowns = reloginCooldownCandidates(t);
    const cooldown = cooldowns[0] || {
      source: 'none',
      reason: '',
      remainingMs: 0,
      totalMs: Math.max(0, Math.round(Number(cfg.loginCooldownMs || 0) || 0)),
      until: 0
    };
    const safetyRequired = Math.max(0, Math.round(Number(pointSafety.required || 0) || 0));
    const safetyStreak = Math.max(0, Math.min(safetyRequired, Math.round(Number(pointSafety.streak || 0) || 0)));
    return {
      satisfied: Boolean(
        Number(cooldown.remainingMs || 0) <= 0
          && Boolean(pointSafety.satisfied)
      ),
      cooldown: {
        source: cooldown.source,
        reason: cooldown.reason,
        remainingMs: Math.max(0, Math.round(Number(cooldown.remainingMs || 0) || 0)),
        totalMs: Math.max(0, Math.round(Number(cooldown.totalMs || 0) || 0)),
        until: Number(cooldown.until || 0) || 0,
        candidates: cooldowns.slice(0, 5)
      },
      snapshot: {
        ok: true,
        streak: Math.max(0, Math.round(Number(snapshotGate.streak || 0) || 0)),
        required: 0,
        remaining: 0,
        lastSampleAgeMs: snapshotGate.lastSampleAgeMs ?? null,
        lastOkAgeMs: snapshotGate.lastOkAgeMs ?? null,
        lastErrorAgeMs: snapshotGate.lastErrorAgeMs ?? null,
        lastError: String(snapshotGate.lastError || ''),
        resetReason: String(snapshotGate.resetReason || '')
      },
      loginPointSafety: {
        ok: Boolean(pointSafety.satisfied),
        hasPoint: Boolean(pointSafety.hasPoint),
        missingPoint: Boolean(pointSafety.missingPoint),
        streak: safetyStreak,
        required: safetyRequired,
        remaining: Math.max(0, safetyRequired - safetyStreak),
        radius: Number(pointSafety.radius || 0) || 0,
        lastSampleAgeMs: pointSafety.lastSampleAgeMs ?? null,
        lastOkAgeMs: pointSafety.lastOkAgeMs ?? null,
        lastUnsafeAgeMs: pointSafety.lastUnsafeAgeMs ?? null,
        lastErrorAgeMs: pointSafety.lastErrorAgeMs ?? null,
        lastDanger: pointSafety.lastDanger || null,
        lastError: String(pointSafety.lastError || ''),
        resetReason: String(pointSafety.resetReason || '')
      }
    };
  }

  function clearExitHoldDetail(detail, reason, t = Date.now()) {
    if (!detail || typeof detail !== 'object') return null;
    const reloginUntil = Number(detail.reloginUntil || 0) || 0;
    const previousHoldRemainingMs = Math.max(0, Math.round(reloginUntil - t));
    if (reloginUntil && !detail.manualLoginBypassPreviousReloginUntil) {
      detail.manualLoginBypassPreviousReloginUntil = reloginUntil;
    }
    if (previousHoldRemainingMs && !detail.manualLoginBypassPreviousHoldMs) {
      detail.manualLoginBypassPreviousHoldMs = previousHoldRemainingMs;
    }
    detail.manualLoginBypassAt = t;
    detail.manualLoginBypassReason = String(reason || 'manual force login');
    detail.reloginUntil = 0;
    detail.holdRemainingMs = 0;
    detail.reloginDelayMs = 0;
    detail.reloginHpDelayMs = 0;
    detail.reloginMinimumDelayMs = 0;
    finalizeLeaveDisplayReasonForReloginGateCore(detail, (base, value) => leaveWaitDisplayForReloginGateCore(base, value, formatDurationMs));
    return detail;
  }

  function clearCurrentReloginHold(reason = 'manual force login') {
    const t = Date.now();
    const enemyDetail = activeEnemyLeaveDetail(t);
    const offlineDetail = activeOfflineLeaveDetail(t);
    let suppressUntil = 0;
    let suppressReason = '';
    try {
      suppressUntil = Number(localStorage.getItem(LOGIN_SUPPRESS_KEY) || 0) || 0;
      suppressReason = String(localStorage.getItem(LOGIN_SUPPRESS_REASON_KEY) || '');
      localStorage.removeItem(LOGIN_SUPPRESS_KEY);
      localStorage.removeItem(LOGIN_SUPPRESS_REASON_KEY);
    } catch (_) {}
    const cleared = {
      at: t,
      reason: String(reason || 'manual force login'),
      suppressReason,
      suppressUntil,
      suppressRemainingMs: Math.max(0, Math.round(suppressUntil - t)),
      enemyHoldRemainingMs: Math.max(
        0,
        Math.round(Number(enemyDetail?.holdRemainingMs || 0)),
        Math.round(Number(bot.pursuitReloginUntil || 0) - t)
      ),
      offlineHoldRemainingMs: Math.max(
        0,
        Math.round(Number(offlineDetail?.holdRemainingMs || 0)),
        Math.round(Number(bot.offlineReloginUntil || 0) - t)
      )
    };
    bot.pursuitReloginUntil = 0;
    bot.offlineReloginUntil = 0;
    bot.lastEnemyLeaveWaitMs = 0;
    bot.lastOfflineLeaveWaitMs = 0;
    bot.lastEnemyLeaveResult = clearExitHoldDetail(bot.lastEnemyLeaveResult, reason, t);
    bot.lastPursuitLeaveResult = clearExitHoldDetail(bot.lastPursuitLeaveResult, reason, t);
    bot.lastCombatLeaveResult = clearExitHoldDetail(bot.lastCombatLeaveResult, reason, t);
    bot.lastInjuryLeaveResult = clearExitHoldDetail(bot.lastInjuryLeaveResult, reason, t);
    bot.lastOfflineLeaveResult = clearExitHoldDetail(bot.lastOfflineLeaveResult, reason, t);
    bot.pendingExit = null;
    clearPersistentPendingExitState();
    clearPersistentExitState(ENEMY_LEAVE_STATE_KEY);
    clearPersistentExitState(OFFLINE_LEAVE_STATE_KEY);
    return cleared;
  }

  return {
    reloginCooldownCandidates,
    summarizeReloginGateStatus,
    clearExitHoldDetail,
    clearCurrentReloginHold
  };
}

module.exports = {
  createReloginGateRuntime
};
