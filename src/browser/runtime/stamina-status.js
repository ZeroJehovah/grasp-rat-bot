'use strict';

function defaultStaminaExhaustedLongWindows(staminaState) {
  return Array.isArray(staminaState?.longExhausted) ? staminaState.longExhausted : [];
}

function defaultHoldContradicted() {
  return false;
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

  return {
    summarizeStamina,
    dailyStaminaWindowStartAt,
    nextDailyStaminaResetAt,
    staminaBudgetReloginDelayMs,
    staminaResetHoldUntil,
    longStaminaHoldContradictedByKnownStamina,
    startupStaminaSampleLooksUnsettled,
    deferredStaminaExhaustionLeave,
    staleOfflineStaminaHoldContradicted
  };
}

module.exports = {
  createStaminaStatusRuntime
};
