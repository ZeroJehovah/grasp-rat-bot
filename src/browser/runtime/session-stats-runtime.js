'use strict';

function createSessionStatsRuntime(runtime = {}) {
  const {
    bot,
    cfg,
    dailyStaminaWindowStartAt = t => t,
    readImportantLogsStore = () => ({ sessions: [] }),
    writePersistentLastSelfState = () => {},
    noteImportantSessionExit = () => null,
    startImportantSession = () => null
  } = runtime;

  function resetSessionStaminaStats(session, selfSummary, t = Date.now()) {
    const remaining = Number(selfSummary?.stamina1d ?? selfSummary?.stamina?.stamina1d ?? NaN);
    const limit = Number(selfSummary?.stamina1dLimit ?? selfSummary?.stamina?.stamina1dLimit ?? NaN);
    const cleanLimit = Number.isFinite(limit) && limit > 0 ? limit : null;
    const maxObserved = Number.isFinite(remaining) ? remaining : null;
    const minObserved = Number.isFinite(remaining) ? remaining : null;
    session.stamina1dSpentBeforeSegment = 0;
    session.stamina1dSpentMs = 0;
    session.stamina1dSegmentStartedAt = dailyStaminaWindowStartAt(t);
    session.stamina1dSegmentBase = maxObserved;
    session.stamina1dObservedMax = maxObserved;
    session.stamina1dObservedMin = minObserved;
    session.stamina1dLastRemaining = minObserved;
    session.stamina1dLastLimit = cleanLimit;
  }

  function updateSessionStaminaStats(session, selfSummary, t = Date.now()) {
    const remaining = Number(selfSummary?.stamina1d ?? selfSummary?.stamina?.stamina1d ?? NaN);
    if (!Number.isFinite(remaining)) return;
    const limitRaw = Number(selfSummary?.stamina1dLimit ?? selfSummary?.stamina?.stamina1dLimit ?? NaN);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : null;
    const dayStart = dailyStaminaWindowStartAt(t);
    let segmentStart = Number(session.stamina1dSegmentStartedAt || 0);
    let observedMax = Number(session.stamina1dObservedMax);
    let observedMin = Number(session.stamina1dObservedMin);
    if (!Number.isFinite(observedMax)) observedMax = Number(session.stamina1dSegmentBase);
    if (!Number.isFinite(observedMin)) observedMin = Number(session.stamina1dLastRemaining);
    if (!segmentStart || !Number.isFinite(observedMax)) {
      session.stamina1dSegmentStartedAt = dayStart;
      session.stamina1dSegmentBase = remaining;
      session.stamina1dObservedMax = remaining;
      session.stamina1dObservedMin = remaining;
      session.stamina1dLastRemaining = remaining;
      session.stamina1dLastLimit = limit;
      session.stamina1dSpentBeforeSegment = Math.max(0, Number(session.stamina1dSpentBeforeSegment || 0) || 0);
      session.stamina1dSpentMs = Math.max(0, Math.round(Number(session.stamina1dSpentBeforeSegment || 0) || 0));
      return;
    }
    if (segmentStart !== dayStart) {
      const previousMin = Number.isFinite(observedMin)
        ? observedMin
        : (Number.isFinite(Number(session.stamina1dLastRemaining)) ? Number(session.stamina1dLastRemaining) : observedMax);
      const previousSpent = Math.max(0, observedMax - previousMin);
      session.stamina1dSpentBeforeSegment = Math.max(0, Number(session.stamina1dSpentBeforeSegment || 0) || 0) + previousSpent;
      session.stamina1dSegmentStartedAt = dayStart;
      session.stamina1dSegmentBase = remaining;
      session.stamina1dObservedMax = remaining;
      session.stamina1dObservedMin = remaining;
      observedMax = Number(session.stamina1dObservedMax);
      observedMin = remaining;
    } else {
      observedMax = Math.max(
        Number.isFinite(observedMax) ? observedMax : remaining,
        remaining
      );
      observedMin = Number.isFinite(observedMin) ? Math.min(observedMin, remaining) : remaining;
      session.stamina1dSegmentBase = observedMax;
      session.stamina1dObservedMax = observedMax;
      session.stamina1dObservedMin = observedMin;
    }
    const segmentSpent = Math.max(0, observedMax - observedMin);
    const totalSpent = Math.max(0, Number(session.stamina1dSpentBeforeSegment || 0) || 0) + segmentSpent;
    session.stamina1dSpentMs = Math.max(0, Math.round(totalSpent));
    session.stamina1dLastRemaining = remaining;
    session.stamina1dLastLimit = limit;
  }

  function updateSessionStats(selfSummary) {
    const t = Date.now();
    const session = bot.session || (bot.session = {});
    if (!selfSummary) {
      if (session.startedAt && !session.missingSince) session.missingSince = t;
      return;
    }
    if (selfSummary.life === 'Dead' || selfSummary.life === 'WaitingRevive') {
      if (session.startedAt && !session.missingSince) {
        session.missingSince = t;
        noteImportantSessionExit('not-alive:' + (selfSummary.life || 'unknown'), selfSummary || bot.lastSelf, t);
      }
      return;
    }
    const userId = selfSummary.id ?? null;
    const coins = Number(selfSummary.coins || 0);
    const missingMs = session.missingSince ? t - Number(session.missingSince || 0) : 0;
    const reset = !session.startedAt
      || (userId !== null && session.userId !== null && String(session.userId) !== String(userId))
      || missingMs > Math.max(1000, Number(cfg.sessionResetMissingMs || 10000));
    if (reset) {
      if (session.startedAt && session.importantSessionId && !session.exitAt) {
        noteImportantSessionExit(userId !== null && session.userId !== null && String(session.userId) !== String(userId) ? 'user-changed' : 'session-reset', bot.lastSelf || selfSummary, session.missingSince || t);
      }
      session.startedAt = t;
      session.userId = userId;
      session.importantSessionId = '';
      session.importantStartEventId = '';
      session.importantEndEventId = '';
      session.exitAt = 0;
      session.exitReason = '';
      session.exitSummary = '';
      session.baseCoins = Number.isFinite(coins) ? coins : 0;
      session.coinsGained = 0;
      session.coinPickupTotal = 0;
      session.coinPickupKeys = [];
      session.kills = 0;
      resetSessionStaminaStats(session, selfSummary, t);
      session.combatLogSentBase = Number(bot.combatLogging?.sent || 0) || 0;
      session.combatLogFailedBase = Number(bot.combatLogging?.failed || 0) || 0;
      startImportantSession(session, selfSummary, t);
    } else if (session.userId === null && userId !== null) {
      session.userId = userId;
    }
    if (!session.importantSessionId) startImportantSession(session, selfSummary, Number(session.startedAt || t) || t);
    session.missingSince = 0;
    session.exitAt = 0;
    session.exitReason = '';
    session.exitSummary = '';
    if (!Number.isFinite(Number(session.baseCoins))) session.baseCoins = Number.isFinite(coins) ? coins : 0;
    if (!Number.isFinite(Number(session.combatLogSentBase))) session.combatLogSentBase = Number(bot.combatLogging?.sent || 0) || 0;
    if (!Number.isFinite(Number(session.combatLogFailedBase))) session.combatLogFailedBase = Number(bot.combatLogging?.failed || 0) || 0;
    if (!Number.isFinite(Number(session.coinPickupTotal))) session.coinPickupTotal = 0;
    if (!Array.isArray(session.coinPickupKeys)) session.coinPickupKeys = [];
    const coinDiff = Math.max(0, Math.round((Number.isFinite(coins) ? coins : 0) - Number(session.baseCoins || 0)));
    session.coinsGained = Math.max(
      Math.max(0, Number(session.coinsGained || 0) || 0),
      Math.max(0, Number(session.coinPickupTotal || 0) || 0),
      coinDiff
    );
    updateSessionStaminaStats(session, selfSummary, t);
    const killCount = bot.killHistory.filter(item => Number(item?.at || 0) >= Number(session.startedAt || 0)).length;
    session.kills = Math.max(Math.max(0, Number(session.kills || 0) || 0), killCount);
    if (typeof writePersistentLastSelfState === 'function') writePersistentLastSelfState(selfSummary, t);
  }

  function summarizeSessionStats(selfSummary) {
    const session = bot.session || {};
    const startedAt = Number(session.startedAt || 0);
    const stoppedAt = Number(session.missingSince || 0) || 0;
    return {
      startedAt,
      uptimeMs: startedAt ? Math.max(0, (stoppedAt || Date.now()) - startedAt) : 0,
      uptimeStoppedAt: stoppedAt,
      baseCoins: Number.isFinite(Number(session.baseCoins)) ? Number(session.baseCoins) : null,
      coins: Number(selfSummary?.coins || 0),
      coinsGained: Math.max(0, Number(session.coinsGained || 0) || 0),
      coinPickupTotal: Math.max(0, Number(session.coinPickupTotal || 0) || 0),
      kills: Math.max(0, Number(session.kills || 0) || 0),
      stamina1dSpentMs: Math.max(0, Math.round(Number(session.stamina1dSpentMs || 0) || 0)),
      stamina1dSegmentStartedAt: Number(session.stamina1dSegmentStartedAt || 0) || 0,
      stamina1dObservedMax: Number.isFinite(Number(session.stamina1dObservedMax)) ? Number(session.stamina1dObservedMax) : null,
      stamina1dObservedMin: Number.isFinite(Number(session.stamina1dObservedMin)) ? Number(session.stamina1dObservedMin) : null,
      stamina1dLastRemaining: Number.isFinite(Number(session.stamina1dLastRemaining)) ? Number(session.stamina1dLastRemaining) : null,
      stamina1dLastLimit: Number.isFinite(Number(session.stamina1dLastLimit)) ? Number(session.stamina1dLastLimit) : null,
      combatLogSent: Math.max(0, Math.round((Number(bot.combatLogging?.sent || 0) || 0) - (Number(session.combatLogSentBase || 0) || 0))),
      combatLogFailed: Math.max(0, Math.round((Number(bot.combatLogging?.failed || 0) || 0) - (Number(session.combatLogFailedBase || 0) || 0))),
      userId: session.userId ?? null
    };
  }

  function readTodaySessionRecords(dayStart) {
    try {
      if (typeof readImportantLogsStore !== 'function') return [];
      const store = readImportantLogsStore();
      const sessions = Array.isArray(store?.sessions) ? store.sessions : [];
      return sessions.filter(record => Number(record?.loginAt || 0) >= dayStart);
    } catch (_) {
      return [];
    }
  }

  function maybeSetLatestTodayStamina(out, record, latestAtRef) {
    const stamp = Math.max(
      Number(record?.updatedAt || 0) || 0,
      Number(record?.exitAt || 0) || 0,
      Number(record?.loginAt || 0) || 0
    );
    if (stamp < latestAtRef.value) return;
    const remaining = Number(record?.stamina1dLastRemaining);
    const limit = Number(record?.stamina1dLastLimit);
    if (!Number.isFinite(remaining)) return;
    out.stamina1dLastRemaining = remaining;
    out.stamina1dLastLimit = Number.isFinite(limit) && limit > 0 ? limit : null;
    latestAtRef.value = stamp;
  }

  function dailyStaminaSpentFromRemaining(out) {
    const remaining = Number(out?.stamina1dLastRemaining);
    const limit = Number(out?.stamina1dLastLimit);
    if (!Number.isFinite(remaining) || !(Number.isFinite(limit) && limit > 0)) return null;
    return Math.max(0, Math.round(limit - remaining));
  }

  function addTodaySessionRecord(out, record, latestAtRef) {
    out.uptimeMs += Math.max(0, Math.round(Number(record?.loginDurationMs || 0) || 0));
    out.stamina1dSpentMs += Math.max(0, Math.round(Number(record?.staminaSpentMs || 0) || 0));
    out.coinsGained += Math.max(0, Math.round(Number(record?.coinsGained || 0) || 0));
    out.coinPickupTotal += Math.max(0, Math.round(Number(record?.pickedCoins || record?.coinPickupTotal || 0) || 0));
    out.kills += Math.max(0, Math.round(Number(record?.killCount || 0) || 0));
    out.sessionCount += 1;
    maybeSetLatestTodayStamina(out, record, latestAtRef);
  }

  function summarizeTodaySessionStats(sessionSummary = null, selfSummary = null, t = Date.now()) {
    const dayStart = dailyStaminaWindowStartAt(t);
    const out = {
      dayStartedAt: dayStart,
      uptimeMs: 0,
      stamina1dSpentMs: 0,
      coinsGained: 0,
      coinPickupTotal: 0,
      kills: 0,
      sessionCount: 0,
      stamina1dLastRemaining: null,
      stamina1dLastLimit: null
    };
    const latestStaminaAt = { value: 0 };
    const currentSessionId = String(bot.session?.importantSessionId || '');
    for (const record of readTodaySessionRecords(dayStart)) {
      if (currentSessionId && String(record?.sessionId || '') === currentSessionId) continue;
      addTodaySessionRecord(out, record, latestStaminaAt);
    }
    const startedAt = Number(sessionSummary?.startedAt || 0) || 0;
    if (startedAt >= dayStart) {
      out.uptimeMs += Math.max(0, Math.round(Number(sessionSummary?.uptimeMs || 0) || 0));
      out.stamina1dSpentMs += Math.max(0, Math.round(Number(sessionSummary?.stamina1dSpentMs || 0) || 0));
      out.coinsGained += Math.max(0, Math.round(Number(sessionSummary?.coinsGained || 0) || 0));
      out.coinPickupTotal += Math.max(0, Math.round(Number(sessionSummary?.coinPickupTotal || 0) || 0));
      out.kills += Math.max(0, Math.round(Number(sessionSummary?.kills || 0) || 0));
      out.sessionCount += 1;
      maybeSetLatestTodayStamina(out, {
        updatedAt: t,
        loginAt: startedAt,
        stamina1dLastRemaining: sessionSummary?.stamina1dLastRemaining,
        stamina1dLastLimit: sessionSummary?.stamina1dLastLimit
      }, latestStaminaAt);
    }
    const selfRemaining = Number(selfSummary?.stamina1d ?? selfSummary?.stamina?.stamina1d);
    const selfLimit = Number(selfSummary?.stamina1dLimit ?? selfSummary?.stamina?.stamina1dLimit);
    if (Number.isFinite(selfRemaining)) {
      out.stamina1dLastRemaining = selfRemaining;
      out.stamina1dLastLimit = Number.isFinite(selfLimit) && selfLimit > 0 ? selfLimit : out.stamina1dLastLimit;
    }
    const actualSpent = dailyStaminaSpentFromRemaining(out);
    if (actualSpent !== null) out.stamina1dSpentMs = Math.max(out.stamina1dSpentMs, actualSpent);
    return out;
  }

  return {
    resetSessionStaminaStats,
    updateSessionStaminaStats,
    updateSessionStats,
    summarizeSessionStats,
    readTodaySessionRecords,
    maybeSetLatestTodayStamina,
    dailyStaminaSpentFromRemaining,
    addTodaySessionRecord,
    summarizeTodaySessionStats
  };
}

module.exports = {
  createSessionStatsRuntime
};
