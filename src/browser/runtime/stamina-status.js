'use strict';

function defaultStaminaExhaustedLongWindows(staminaState) {
  return Array.isArray(staminaState?.longExhausted) ? staminaState.longExhausted : [];
}

function defaultHoldContradicted() {
  return false;
}

function defaultStaminaEvidenceRemaining(evidence, windowName) {
  const key = String(windowName || '').toLowerCase();
  if (key !== '1h' && key !== '1d') return null;
  const suffix = key === '1h' ? '1h' : '1d';
  const values = [
    evidence?.stamina?.['stamina' + suffix],
    evidence?.['stamina' + suffix],
    evidence?.['stamina_' + suffix + '_remaining_milli'],
    key === '1d' ? evidence?.stamina1dLastRemaining : undefined
  ];
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function createStaminaStatusRuntime(runtime = {}) {
  const bot = runtime.bot || null;
  const cfg = runtime.cfg && typeof runtime.cfg === 'object' ? runtime.cfg : {};
  const staminaRemaining = typeof runtime.staminaRemaining === 'function'
    ? runtime.staminaRemaining
    : () => null;
  const staminaLimitValue = typeof runtime.staminaLimitValue === 'function'
    ? runtime.staminaLimitValue
    : (_self, _windowName, fallback) => fallback;
  const staminaExhaustedThreshold = typeof runtime.staminaExhaustedThreshold === 'function'
    ? runtime.staminaExhaustedThreshold
    : () => Math.max(0, Number(cfg.staminaExhaustedThresholdMs ?? 1000));
  const staminaExhaustedLongWindows = typeof runtime.staminaExhaustedLongWindows === 'function'
    ? runtime.staminaExhaustedLongWindows
    : defaultStaminaExhaustedLongWindows;
  const staminaHoldContradictedByStaminaEvidence = typeof runtime.staminaHoldContradictedByStaminaEvidence === 'function'
    ? runtime.staminaHoldContradictedByStaminaEvidence
    : defaultHoldContradicted;
  const staminaEvidenceRemaining = typeof runtime.staminaEvidenceRemaining === 'function'
    ? runtime.staminaEvidenceRemaining
    : defaultStaminaEvidenceRemaining;

  function summarizeStamina(self) {
    const windows = [
      { key: '5s', fallback: 10000 },
      { key: '1h', fallback: 3000000 },
      { key: '1d', fallback: 20000000 }
    ];
    const thresholdMs = staminaExhaustedThreshold();
    const items = windows.map(item => {
      const remaining = staminaRemaining(self, item.key);
      const limit = staminaLimitValue(self, item.key, item.fallback);
      return {
        key: item.key,
        remaining,
        limit,
        exhausted: remaining !== null && remaining < thresholdMs
      };
    });
    const exhausted = items.filter(item => item.exhausted).map(item => item.key);
    const longExhausted = exhausted.filter(key => key === '1h' || key === '1d');
    const byKey = Object.fromEntries(items.map(item => [item.key, item]));
    return {
      thresholdMs,
      stamina5s: byKey['5s'].remaining,
      stamina5sLimit: byKey['5s'].limit,
      stamina1h: byKey['1h'].remaining,
      stamina1hLimit: byKey['1h'].limit,
      stamina1d: byKey['1d'].remaining,
      stamina1dLimit: byKey['1d'].limit,
      exhausted,
      longExhausted,
      movementBlocked: exhausted.length > 0,
      mustLeave: longExhausted.length > 0
    };
  }

  function dailyStaminaWindowStartAt(t = Date.now()) {
    const dayMs = 24 * 60 * 60 * 1000;
    const utc8OffsetMs = 8 * 60 * 60 * 1000;
    return Math.floor((t + utc8OffsetMs) / dayMs) * dayMs - utc8OffsetMs;
  }

  function nextDailyStaminaResetAt(t = Date.now()) {
    const dayMs = 24 * 60 * 60 * 1000;
    return dailyStaminaWindowStartAt(t) + dayMs;
  }

  function staminaBudgetReloginDelayMs() {
    return Math.max(1000, Number(cfg.staminaBudgetReloginDelayMs || 1800000));
  }

  function staminaResetHoldUntil(staminaState, t = Date.now()) {
    const exhausted = Array.isArray(staminaState?.longExhausted)
      ? staminaState.longExhausted
      : [];
    let until = 0;
    let resetAt = 0;
    let fixedDelayMs = 0;
    if (exhausted.includes('1h')) {
      fixedDelayMs = staminaBudgetReloginDelayMs();
      until = Math.max(until, t + fixedDelayMs);
    }
    if (exhausted.includes('1d')) {
      resetAt = nextDailyStaminaResetAt(t);
      until = Math.max(until, resetAt);
    }
    if (!until) return null;
    const graceMs = resetAt && until === resetAt ? Math.max(0, Number(cfg.staminaResetGraceMs || 0)) : 0;
    return {
      until: until + graceMs,
      resetAt,
      graceMs,
      fixedDelayMs: resetAt && resetAt >= t + fixedDelayMs ? 0 : fixedDelayMs,
      fixed: Boolean(fixedDelayMs && !(resetAt && resetAt >= t + fixedDelayMs)),
      exhausted
    };
  }

  function longStaminaHoldContradictedByKnownStamina(staminaState) {
    const thresholdMs = staminaExhaustedThreshold();
    const sources = [
      bot?.lastSelf,
      bot?.lastDecision?.self,
      bot?.session
    ];
    return sources.some(source => staminaHoldContradictedByStaminaEvidence(staminaState, source, thresholdMs));
  }

  function startupStaminaSampleLooksUnsettled(staminaState, t = Date.now()) {
    const windows = staminaExhaustedLongWindows(staminaState);
    if (!windows.length) return false;
    const allZero = ['5s', '1h', '1d'].every(key => Number(staminaState?.['stamina' + key] ?? NaN) === 0);
    if (!allZero) return false;
    const graceMs = Math.max(0, Number(cfg.staminaExhaustionPostLoginGraceMs ?? 15000));
    if (!graceMs) return false;
    const sessionAgeMs = bot?.session?.startedAt ? t - Number(bot.session.startedAt || t) : Infinity;
    const loginAgeMs = bot?.lastLoginAt ? t - Number(bot.lastLoginAt || t) : Infinity;
    return sessionAgeMs <= graceMs || loginAgeMs <= graceMs;
  }

  function deferredStaminaExhaustionLeave(staminaState, t = Date.now()) {
    if (!staminaState?.mustLeave) return null;
    if (startupStaminaSampleLooksUnsettled(staminaState, t)) {
      return {
        reason: 'startup-zero-stamina-sample',
        graceMs: Math.max(0, Number(cfg.staminaExhaustionPostLoginGraceMs ?? 15000)),
        sessionAgeMs: bot?.session?.startedAt ? Math.max(0, Math.round(t - Number(bot.session.startedAt || t))) : null,
        loginAgeMs: bot?.lastLoginAt ? Math.max(0, Math.round(t - Number(bot.lastLoginAt || t))) : null
      };
    }
    return null;
  }

  function staleOfflineStaminaHoldContradicted(detail) {
    const staminaState = detail?.offlineSafety?.staminaExhausted;
    return Boolean(staminaState && longStaminaHoldContradictedByKnownStamina(staminaState));
  }

  function evidenceStamp(evidence) {
    return Math.max(
      Number(evidence?.updatedAt || 0) || 0,
      Number(evidence?.at || 0) || 0,
      Number(evidence?.missingSince || 0) || 0,
      Number(evidence?.exitAt || 0) || 0,
      Number(evidence?.startedAt || 0) || 0,
      Number(evidence?.stamina1dSegmentStartedAt || 0) || 0
    );
  }

  function knownLongStaminaExhaustionLoginHold(t = Date.now()) {
    const thresholdMs = staminaExhaustedThreshold();
    const sources = [
      { source: 'last-self', evidence: bot?.lastSelf },
      { source: 'last-decision-self', evidence: bot?.lastDecision?.self },
      { source: 'session', evidence: bot?.session }
    ].filter(item => item.evidence && typeof item.evidence === 'object')
      .map(item => ({ ...item, stamp: evidenceStamp(item.evidence) }));
    let until = 0;
    let resetAt = 0;
    let fixedDelayMs = 0;
    const exhausted = [];
    const details = [];
    for (const windowName of ['1d', '1h']) {
      const known = sources
        .map(item => ({ ...item, remaining: staminaEvidenceRemaining(item.evidence, windowName) }))
        .filter(item => item.remaining !== null)
        .sort((a, b) => Number(b.stamp || 0) - Number(a.stamp || 0));
      const latest = known[0];
      if (!latest || latest.remaining >= thresholdMs || !latest.stamp) continue;
      let windowUntil = 0;
      if (windowName === '1d') {
        if (latest.stamp < dailyStaminaWindowStartAt(t)) continue;
        resetAt = nextDailyStaminaResetAt(t);
        windowUntil = resetAt + Math.max(0, Number(cfg.staminaResetGraceMs || 0));
      } else {
        fixedDelayMs = staminaBudgetReloginDelayMs();
        windowUntil = latest.stamp + fixedDelayMs;
      }
      if (windowUntil <= t) continue;
      until = Math.max(until, windowUntil);
      exhausted.push(windowName);
      details.push({ window: windowName, remaining: latest.remaining, source: latest.source, at: latest.stamp, until: windowUntil });
    }
    if (!until) return null;
    const holdRemainingMs = Math.max(0, Math.round(until - t));
    const label = exhausted.join('/');
    return {
      reason: 'known-long-stamina-exhausted',
      exhausted,
      details,
      thresholdMs,
      until,
      resetAt,
      fixedDelayMs,
      holdRemainingMs,
      totalMs: holdRemainingMs,
      displayReason: (label === '1d' ? '一天体力已耗尽' : (label === '1h' ? '一小时体力已耗尽' : '长周期体力已耗尽'))
        + '，等待' + Math.ceil(holdRemainingMs / 1000) + '秒后再登录'
    };
  }

  return {
    summarizeStamina,
    dailyStaminaWindowStartAt,
    nextDailyStaminaResetAt,
    staminaBudgetReloginDelayMs,
    staminaResetHoldUntil,
    longStaminaHoldContradictedByKnownStamina,
    startupStaminaSampleLooksUnsettled,
    deferredStaminaExhaustionLeave,
    staleOfflineStaminaHoldContradicted,
    knownLongStaminaExhaustionLoginHold
  };
}

module.exports = {
  createStaminaStatusRuntime
};
