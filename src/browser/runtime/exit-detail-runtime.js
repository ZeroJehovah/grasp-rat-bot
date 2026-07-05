'use strict';

function fallbackNow() {
  return Date.now();
}

function createExitDetailRuntime(runtime = {}) {
  const {
    bot,
    enemyLeaveStateKey = '',
    offlineLeaveStateKey = '',
    readPersistentExitState = () => null,
    clearPersistentExitState = () => {},
    refreshExitDetail = value => value,
    now = fallbackNow
  } = runtime;

  function latestEnemyLeaveResult() {
    const candidates = [
      { at: Number(bot.lastEnemyLeaveResult?.at || 0), result: bot.lastEnemyLeaveResult },
      { at: Number(bot.lastCombatLeaveResult?.at || bot.lastCombatLeaveAt || 0), result: bot.lastCombatLeaveResult },
      { at: Number(bot.lastPursuitLeaveResult?.at || bot.lastPursuitLeaveAt || 0), result: bot.lastPursuitLeaveResult },
      { at: Number(bot.lastInjuryLeaveResult?.at || bot.lastInjuryLeaveAt || 0), result: bot.lastInjuryLeaveResult }
    ].filter(item => item.result);
    return candidates.sort((a, b) => b.at - a.at)[0]?.result || null;
  }

  function activeEnemyLeaveDetail(t = now()) {
    const current = latestEnemyLeaveResult();
    const restored = readPersistentExitState(enemyLeaveStateKey, t);
    const picked = current || restored || bot.lastEnemyLeaveResult || null;
    if (!picked) return null;
    const refreshed = refreshExitDetail(picked, t);
    if (!refreshed?.holdRemainingMs && Number(refreshed?.reloginUntil || 0)) {
      clearPersistentExitState(enemyLeaveStateKey);
      if (bot.lastEnemyLeaveResult === picked) bot.lastEnemyLeaveResult = null;
      return null;
    }
    bot.lastEnemyLeaveResult = refreshed;
    if (Number(refreshed?.reloginUntil || 0) > 0) {
      bot.pursuitReloginUntil = Math.max(Number(bot.pursuitReloginUntil || 0), Number(refreshed.reloginUntil));
    }
    return refreshed;
  }

  function activeOfflineLeaveDetail(t = now()) {
    const picked = bot.lastOfflineLeaveResult || readPersistentExitState(offlineLeaveStateKey, t);
    if (!picked) return null;
    const refreshed = refreshExitDetail(picked, t);
    if (!refreshed?.holdRemainingMs && Number(refreshed?.reloginUntil || 0)) {
      clearPersistentExitState(offlineLeaveStateKey);
      if (bot.lastOfflineLeaveResult === picked) bot.lastOfflineLeaveResult = null;
      return null;
    }
    bot.lastOfflineLeaveResult = refreshed;
    if (Number(refreshed?.reloginUntil || 0) > 0) {
      bot.offlineReloginUntil = Math.max(Number(bot.offlineReloginUntil || 0), Number(refreshed.reloginUntil));
    }
    return refreshed;
  }

  function latestEnemyLeaveSummary() {
    const result = latestEnemyLeaveResult();
    return result?.summary || result?.exitSummary || result?.enemyLeaveSummary || result?.displayReason || '';
  }

  function latestEnemyLeaveDisplayReason() {
    const result = latestEnemyLeaveResult();
    return result?.displayReason || result?.summary || result?.exitSummary || result?.enemyLeaveSummary || '';
  }

  return {
    activeEnemyLeaveDetail,
    activeOfflineLeaveDetail,
    latestEnemyLeaveResult,
    latestEnemyLeaveSummary,
    latestEnemyLeaveDisplayReason
  };
}

module.exports = {
  createExitDetailRuntime
};
