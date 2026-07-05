'use strict';

function fallbackNow() {
  return Date.now();
}

function createEntryGlueRuntime(runtime = {}) {
  const {
    bot,
    storage = typeof localStorage !== 'undefined' ? localStorage : null,
    pageGlobal = typeof window !== 'undefined' ? window : null,
    pausedKey = '',
    pauseReasonKey = '',
    readPageGlobal = (_key, fallbackValue) => fallbackValue,
    stopMotionSafely = () => {},
    removeTargetOverlay = () => {},
    updateBotPanel = () => {},
    getSelf = () => null,
    exitMotionStopLockRemainingMs = () => 0,
    postExitDecisionWithoutTargetCore = value => value,
    resetOpportunitySwitchLock = () => {},
    now = fallbackNow,
    consoleObject = typeof console !== 'undefined' ? console : null
  } = runtime;

  function clearPostExitTargetState(reason = 'exit-confirmed') {
    const exitMotionLockRemainingMs = exitMotionStopLockRemainingMs();
    bot.lastTarget = null;
    bot.lastTargetAt = 0;
    bot.opportunityChoice = null;
    resetOpportunitySwitchLock();
    bot.staleCoinEscape = null;
    bot.coinApproachLock = null;
    removeTargetOverlay();
    if (bot.lastDecision && typeof bot.lastDecision === 'object') {
      bot.lastDecision = postExitDecisionWithoutTargetCore(bot.lastDecision, reason, {
        lastExitMotionStopReason: bot.lastExitMotionStopReason,
        exitMotionLockRemainingMs
      });
      try {
        updateBotPanel(bot.lastDecision);
      } catch (_) {}
    }
  }

  function readPauseReason() {
    let reason = '';
    try {
      if (storage) reason = String(storage.getItem(pauseReasonKey) || '');
    } catch (_) {}
    return String(readPageGlobal('__graspRatBotPauseReason', '', pageGlobal) || reason || '');
  }

  function syncPausedFromPage(stopOnPause = true) {
    let localPaused = false;
    try {
      localPaused = Boolean(storage && storage.getItem(pausedKey) === 'true');
    } catch (_) {}
    const paused = Boolean(readPageGlobal('__graspRatBotPaused', false, pageGlobal) === true || localPaused);
    if (paused !== bot.paused) {
      bot.paused = paused;
      bot.pauseChangedAt = now();
      if (paused) {
        if (stopOnPause) stopMotionSafely('paused');
        removeTargetOverlay();
      }
    }
    bot.pauseReason = paused ? (readPauseReason() || bot.pauseReason || 'manual') : '';
    return paused;
  }

  function getOwnEntity() {
    try {
      return typeof getSelf === 'function' ? getSelf() : null;
    } catch (_) {
      return null;
    }
  }

  function logStatus(text, detail) {
    bot.lastAction = text;
    if (detail) bot.lastDecision = detail;
    if (bot.running) updateBotPanel(bot.lastDecision || detail || { kind: 'wait', reason: text, self: bot.lastSelf });
    if (typeof log === 'function') log('[bot] ' + text, 'info');
    if (consoleObject && typeof consoleObject.log === 'function') consoleObject.log('[grasp-rat-bot]', text, detail || '');
  }

  return {
    clearPostExitTargetState,
    readPauseReason,
    syncPausedFromPage,
    getOwnEntity,
    logStatus
  };
}

module.exports = {
  createEntryGlueRuntime
};
