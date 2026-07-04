'use strict';

const { clearOpportunityChoiceForCall } = require('./opportunity-clear-call-source');

function trackCoinProgressCall(actionExpr, selfExpr, options = {}) {
  const clearIgnoredCoinOpportunity = clearOpportunityChoiceForCall("'coin'", 'progressId', options);
  return String.raw`(() => {
        const progressAction = ${actionExpr};
        const progressSelf = ${selfExpr};
        const progressAt = now();
        const progressOptions = coinProgressCoreOptions();
        for (const [progressAttemptId, progressAttempt] of bot.coinAttempts.entries()) {
          if (coinAttemptExpiredCore(progressAttempt, progressAt, progressOptions)) {
            bot.coinAttempts.delete(progressAttemptId);
          }
        }

        if (!coinProgressIntentCore(progressAction)) {
          bot.coinProgress = null;
          if (!bot.staleCoinEscape || progressAt >= Number(bot.staleCoinEscape.until || 0)) bot.coinApproachLock = null;
          return progressAction;
        }

        const progressAttemptResult = updateCoinAttemptCore(bot.coinAttempts.get(String(progressAction.target.id)), progressAction, progressAt, progressOptions);
        const progressId = progressAttemptResult.id;
        const progressDistance = progressAttemptResult.distance;
        const progressAttemptRecord = progressAttemptResult.attempt;
        bot.coinAttempts.set(progressId, progressAttemptRecord);

        const progressCloseStuck = progressAttemptResult.closeStuck;
        const progressNearStuck = progressAttemptResult.nearStuck;
        if (progressCloseStuck || progressNearStuck) {
          const progressFailureResult = coinFailureIgnoreCore(bot.coinFailures.get(progressId) || {}, progressCloseStuck ? 'close' : 'near', progressAt, progressOptions);
          bot.coinFailures.set(progressId, {
            count: progressFailureResult.count,
            reason: progressFailureResult.reason,
            lastAt: progressFailureResult.lastAt,
            ignoreUntil: progressFailureResult.ignoreUntil
          });
          bot.ignoredCoins.set(progressId, progressFailureResult.ignoreUntil);
          const progressFailure = {
            count: progressFailureResult.count,
            ignoreMs: progressFailureResult.ignoreMs,
            ignoreUntil: progressFailureResult.ignoreUntil
          };
          bot.coinAttempts.delete(progressId);
          bot.coinProgress = buildIgnoredCoinProgressCore(progressId, progressAttemptRecord, progressDistance, progressAt, progressFailure.ignoreUntil, 'stuck');
          const progressCleanup = coinIgnoreCleanupIntentCore(bot.lastTarget, bot.coinApproachLock, progressId);
          if (progressCleanup.clearLastTarget) {
            bot.lastTarget = null;
            bot.lastTargetAt = 0;
          }
          ${clearIgnoredCoinOpportunity}
          if (progressCleanup.clearCoinApproachLock) bot.coinApproachLock = null;
          const progressEscapeResult = staleCoinEscapeDirectionCore(progressAction, progressSelf, progressAt, progressOptions);
          bot.staleCoinEscape = progressEscapeResult.state;
          const progressEscape = { dx: progressEscapeResult.dx, dy: progressEscapeResult.dy };
          return buildIgnoredCoinPatrolActionCore(
            progressAction,
            progressId,
            progressDistance,
            progressAttemptRecord,
            progressFailure,
            progressEscape,
            progressAt,
            progressCloseStuck ? 'ignore-close-stale-coin' : 'ignore-near-stale-coin',
            true
          );
        }

        const previousProgress = bot.coinProgress;
        const progressResult = updateCoinProgressRecordCore(previousProgress, progressAttemptRecord, progressDistance, progressAt, progressOptions);
        bot.coinProgress = progressResult.progress;
        if (!progressResult.stale) {
          return progressAction;
        }

        const staleFailureResult = coinFailureIgnoreCore(bot.coinFailures.get(progressId) || {}, 'progress', progressAt, progressOptions);
        bot.coinFailures.set(progressId, {
          count: staleFailureResult.count,
          reason: staleFailureResult.reason,
          lastAt: staleFailureResult.lastAt,
          ignoreUntil: staleFailureResult.ignoreUntil
        });
        bot.ignoredCoins.set(progressId, staleFailureResult.ignoreUntil);
        const staleFailure = {
          count: staleFailureResult.count,
          ignoreMs: staleFailureResult.ignoreMs,
          ignoreUntil: staleFailureResult.ignoreUntil
        };
        bot.coinAttempts.delete(progressId);
        bot.coinProgress = buildIgnoredCoinProgressCore(progressId, bot.coinProgress, progressDistance, progressAt, staleFailure.ignoreUntil, 'progress');
        const staleCleanup = coinIgnoreCleanupIntentCore(bot.lastTarget, bot.coinApproachLock, progressId);
        if (staleCleanup.clearLastTarget) {
          bot.lastTarget = null;
          bot.lastTargetAt = 0;
        }
        ${clearIgnoredCoinOpportunity}
        if (staleCleanup.clearCoinApproachLock) bot.coinApproachLock = null;
        const staleEscapeResult = staleCoinEscapeDirectionCore(progressAction, progressSelf, progressAt, progressOptions);
        bot.staleCoinEscape = staleEscapeResult.state;
        const staleEscape = { dx: staleEscapeResult.dx, dy: staleEscapeResult.dy };
        return buildIgnoredCoinPatrolActionCore(
          progressAction,
          progressId,
          progressDistance,
          previousProgress,
          staleFailure,
          staleEscape,
          progressAt,
          'ignore-stale-coin-no-progress'
        );
      })()`;
}

function coinProgressRuntimeSource() {
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
`;
}

module.exports = {
  coinProgressRuntimeSource,
  trackCoinProgressCall
};
