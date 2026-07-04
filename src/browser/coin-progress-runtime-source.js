'use strict';

const {
  coinFailureIgnoreCore,
  staleCoinEscapeDirectionCore,
  coinProgressIntentCore,
  coinAttemptExpiredCore,
  updateCoinAttemptCore,
  updateCoinProgressRecordCore,
  buildIgnoredCoinProgressCore,
  buildIgnoredCoinPatrolActionCore,
  coinIgnoreCleanupIntentCore
} = require('./runtime/coin-progress');
const { clearOpportunityChoiceForCall } = require('./opportunity-clear-call-source');

function coinProgressRuntimeInlineSource(helpers = {}, options = {}) {
  const {
    coinFailureIgnoreCore,
    staleCoinEscapeDirectionCore,
    coinProgressIntentCore,
    coinAttemptExpiredCore,
    updateCoinAttemptCore,
    updateCoinProgressRecordCore,
    buildIgnoredCoinProgressCore,
    buildIgnoredCoinPatrolActionCore,
    coinIgnoreCleanupIntentCore
  } = helpers;
  const coinProgressHelperSource = [
    coinFailureIgnoreCore,
    staleCoinEscapeDirectionCore,
    coinProgressIntentCore,
    coinAttemptExpiredCore,
    updateCoinAttemptCore,
    updateCoinProgressRecordCore,
    buildIgnoredCoinProgressCore,
    buildIgnoredCoinPatrolActionCore,
    coinIgnoreCleanupIntentCore
  ].map(fn => typeof fn === 'function' ? `  ${fn.toString()}` : '').join('\n');
  const clearIgnoredCoinOpportunity = clearOpportunityChoiceForCall("'coin'", 'id', options);
  return String.raw`${coinProgressHelperSource}

  function coinProgressCoreOptions(extra = {}) {
    return {
      coinIgnoreMs: cfg.coinIgnoreMs,
      coinProgressMinGain: cfg.coinProgressMinGain,
      coinNearStuckResetGain: cfg.coinNearStuckResetGain,
      closeCoinStuckDistance: cfg.closeCoinStuckDistance,
      nearCoinStuckDistance: cfg.nearCoinStuckDistance,
      closeCoinStuckMs: cfg.closeCoinStuckMs,
      nearCoinStuckMs: cfg.nearCoinStuckMs,
      coinNoProgressMs: cfg.coinNoProgressMs,
      coinFailureDecayMs: cfg.coinFailureDecayMs,
      coinCloseFailureIgnoreMs: cfg.coinCloseFailureIgnoreMs,
      coinNearFailureIgnoreMs: cfg.coinNearFailureIgnoreMs,
      coinNoProgressIgnoreMs: cfg.coinNoProgressIgnoreMs,
      coinFailureMaxIgnoreMs: cfg.coinFailureMaxIgnoreMs,
      staleCoinEscapeMs: cfg.staleCoinEscapeMs,
      ...extra
    };
  }

	  function coinFailureIgnore(id, reason, t) {
    const result = coinFailureIgnoreCore(bot.coinFailures.get(id) || {}, reason, t, coinProgressCoreOptions());
    bot.coinFailures.set(id, {
      count: result.count,
      reason: result.reason,
      lastAt: result.lastAt,
      ignoreUntil: result.ignoreUntil
    });
    bot.ignoredCoins.set(id, result.ignoreUntil);
    return { count: result.count, ignoreMs: result.ignoreMs, ignoreUntil: result.ignoreUntil };
  }

  function staleCoinEscapeDirection(action, self, t) {
    const result = staleCoinEscapeDirectionCore(action, self, t, coinProgressCoreOptions());
    bot.staleCoinEscape = result.state;
    return { dx: result.dx, dy: result.dy };
  }

  function clearIgnoredCoinRuntimeState(id) {
    const cleanup = coinIgnoreCleanupIntentCore(bot.lastTarget, bot.coinApproachLock, id);
    if (cleanup.clearLastTarget) {
      bot.lastTarget = null;
      bot.lastTargetAt = 0;
    }
    ${clearIgnoredCoinOpportunity}
    if (cleanup.clearCoinApproachLock) bot.coinApproachLock = null;
  }

  function trackCoinProgress(action, self) {
    const t = now();
    const options = coinProgressCoreOptions();
    for (const [id, attempt] of bot.coinAttempts.entries()) {
      if (coinAttemptExpiredCore(attempt, t, options)) {
        bot.coinAttempts.delete(id);
      }
    }

    if (!coinProgressIntentCore(action)) {
      bot.coinProgress = null;
      if (!bot.staleCoinEscape || t >= Number(bot.staleCoinEscape.until || 0)) bot.coinApproachLock = null;
      return action;
    }

    const attemptResult = updateCoinAttemptCore(bot.coinAttempts.get(String(action.target.id)), action, t, options);
    const id = attemptResult.id;
    const distance = attemptResult.distance;
    const attempt = attemptResult.attempt;
    bot.coinAttempts.set(id, attempt);

    const closeStuck = attemptResult.closeStuck;
    const nearStuck = attemptResult.nearStuck;
    if (closeStuck || nearStuck) {
      const failure = coinFailureIgnore(id, closeStuck ? 'close' : 'near', t);
      const ignoreUntil = failure.ignoreUntil;
      bot.coinAttempts.delete(id);
      bot.coinProgress = buildIgnoredCoinProgressCore(id, attempt, distance, t, ignoreUntil, 'stuck');
      clearIgnoredCoinRuntimeState(id);
      const escape = staleCoinEscapeDirection(action, self, t);
      return buildIgnoredCoinPatrolActionCore(
        action,
        id,
        distance,
        attempt,
        failure,
        escape,
        t,
        closeStuck ? 'ignore-close-stale-coin' : 'ignore-near-stale-coin',
        true
      );
    }

    const previous = bot.coinProgress;
    const progressResult = updateCoinProgressRecordCore(previous, attempt, distance, t, options);
    bot.coinProgress = progressResult.progress;
    if (!progressResult.stale) {
      return action;
    }

    const failure = coinFailureIgnore(id, 'progress', t);
    const ignoreUntil = failure.ignoreUntil;
    bot.coinAttempts.delete(id);
    bot.coinProgress = buildIgnoredCoinProgressCore(id, bot.coinProgress, distance, t, ignoreUntil, 'progress');
    clearIgnoredCoinRuntimeState(id);
    const escape = staleCoinEscapeDirection(action, self, t);
    return buildIgnoredCoinPatrolActionCore(
      action,
      id,
      distance,
      previous,
      failure,
      escape,
      t,
      'ignore-stale-coin-no-progress'
    );
  }
`;
}

function bundledCoinProgressRuntimeSource() {
  return `const {
  coinFailureIgnoreCore,
  staleCoinEscapeDirectionCore,
  coinProgressIntentCore,
  coinAttemptExpiredCore,
  updateCoinAttemptCore,
  updateCoinProgressRecordCore,
  buildIgnoredCoinProgressCore,
  buildIgnoredCoinPatrolActionCore,
  coinIgnoreCleanupIntentCore
} = require('./src/browser/runtime/coin-progress');

${coinProgressRuntimeInlineSource({}, { bundledRuntime: true })}`;
}

function coinProgressRuntimeSource(options = {}) {
  if (options.bundledRuntime) return bundledCoinProgressRuntimeSource();
  return coinProgressRuntimeInlineSource({
    coinFailureIgnoreCore,
    staleCoinEscapeDirectionCore,
    coinProgressIntentCore,
    coinAttemptExpiredCore,
    updateCoinAttemptCore,
    updateCoinProgressRecordCore,
    buildIgnoredCoinProgressCore,
    buildIgnoredCoinPatrolActionCore,
    coinIgnoreCleanupIntentCore
  });
}

module.exports = {
  bundledCoinProgressRuntimeSource,
  coinProgressRuntimeInlineSource,
  coinProgressRuntimeSource
};
