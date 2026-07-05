'use strict';

const { buildDropMatchedKillCore } = require('./drop-matched-kill');

function createProfitArbitrationRuntime(runtime = {}) {
  const {
    bot,
    cfg,
    safeJsonClone = value => value,
    arrayCount = value => Array.isArray(value) ? value.length : 0,
    now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
    dist = () => Infinity,
    isSnapshotOnlyCoin = () => false,
    normalizeCoinDrop = value => value,
    getNativeCoinList = () => null,
    updateSessionStats = () => {},
    pushBounded = (list, item, limit) => {
      if (Array.isArray(list)) {
        list.push(item);
        if (Number(limit) > 0 && list.length > limit) list.splice(0, list.length - limit);
      }
      return list;
    },
    importantSessionStaminaSpentMs = () => 0,
    recordKillHistoryItem = () => null,
    upsertImportantSessionRecord = () => null,
    shouldClearOpportunityChoiceCore = () => false,
    resetOpportunitySwitchLock = () => {}
  } = runtime;

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
} = require('./coin-progress');

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


const {
  actionPriorityBand,
  actionFocusTargetType,
  actionFocusId,
  actionFocusSummary
} = require('./action-priority');
const {
  actionSwitchPairKey,
  buildPreviousDecisionSummary,
  recordActionSwitchDiagnosticsCore
} = require('./action-switch-diagnostics');
const {
  finalActionBandRank,
  finalActionReusable,
  shouldHoldPreviousFinalAction,
  applyFinalActionArbitrationCore
} = require('./action-arbitration');

  function targetSwitchHistoryLimit() {
    return Math.max(4, Math.round(Number(cfg.targetSwitchDiagnosticsHistoryLimit || 24) || 24));
  }

  function targetSwitchOscillationWindowMs() {
    return Math.max(1000, Math.round(Number(cfg.targetSwitchOscillationWindowMs || 10000) || 10000));
  }

  function roundedNullable(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(number) : null;
  }

  function ensureTargetSwitchDiagnostics() {
    if (!bot.targetSwitchDiagnostics || typeof bot.targetSwitchDiagnostics !== 'object') {
      bot.targetSwitchDiagnostics = { lastFocus: null, lastTargetFocus: null, lastSwitch: null, events: [] };
    }
    if (!Array.isArray(bot.targetSwitchDiagnostics.events)) bot.targetSwitchDiagnostics.events = [];
    return bot.targetSwitchDiagnostics;
  }

  function finalActionArbitrationHoldMs() {
    return Math.max(0, Math.round(Number(cfg.finalActionArbitrationHoldMs || 0) || 0));
  }

  function finalActionArbitrationHistoryLimit() {
    return Math.max(4, Math.round(Number(cfg.finalActionArbitrationHistoryLimit || 24) || 24));
  }

  function ensureFinalActionArbitration() {
    if (!bot.finalActionArbitration || typeof bot.finalActionArbitration !== 'object') {
      bot.finalActionArbitration = { lastAction: null, lastFocus: null, lastSelectedAt: 0, lastOverride: null, history: [] };
    }
    if (!Array.isArray(bot.finalActionArbitration.history)) bot.finalActionArbitration.history = [];
    return bot.finalActionArbitration;
  }


const {
  coinTargetKeyCore,
  coinTargetDistance,
  coinMatchesTrackedTargetCore,
  trackedCoinTargetForCollectionCore,
  buildNativeCoinSnapshotCore,
  pointToSegmentDistanceCore,
  pickIncidentalCoinPickupsCore,
  snapshotCoinWorthLongTravelCore,
  snapshotCoinNavigationReasonCore
} = require('./coin-target');

  function setLastTarget(kind, id) {
    if (!id && id !== 0) return;
    if (!bot.lastTarget || bot.lastTarget.kind !== kind || String(bot.lastTarget.id) !== String(id)) {
      bot.lastTarget = { kind, id };
    }
    bot.lastTargetAt = now();
  }

  function clearCoinTracking(reason = '') {
    bot.coinProgress = null;
    bot.coinAttempts.clear();
    bot.coinApproachLock = null;
    bot.staleCoinEscape = null;
	    if (bot.lastTarget?.kind === 'coin') {
	      bot.lastTarget = null;
	      bot.lastTargetAt = 0;
	    }
	    if (shouldClearOpportunityChoiceCore(bot.opportunityChoice, 'coin', null)) {
        bot.opportunityChoice = null;
        resetOpportunitySwitchLock();
      }
	    bot.lastCoinClearReason = reason;
  }

  function coinTargetCoreOptions(extra = {}) {
    return {
      dist,
      coinCollectedPruneRadius: cfg.coinCollectedPruneRadius,
      coinCollectedConfirmDistance: cfg.coinCollectedConfirmDistance,
      incidentalCoinPickupMemoryMs: cfg.incidentalCoinPickupMemoryMs,
      snapshotCoinClusterMinCoins: cfg.snapshotCoinClusterMinCoins,
      snapshotSingleCoinMaxDistance: cfg.snapshotSingleCoinMaxDistance,
      snapshotSingleCoinDistancePerAmount: cfg.snapshotSingleCoinDistancePerAmount,
      globalCoinMaxDistance: cfg.globalCoinMaxDistance,
      coinMaxDistance: cfg.coinMaxDistance,
      isSnapshotOnlyCoin,
      ...extra
    };
  }

  function recordIncidentalCoinPickups(self, currentSummary, previousSelf, previousCoins) {
    const previousSnapshot = Array.isArray(bot.lastNativeCoinSnapshot) ? bot.lastNativeCoinSnapshot : [];
    const currentSnapshot = (() => {
      const nativeCoinList = getNativeCoinList();
      if (!Array.isArray(nativeCoinList)) return null;
      const nativeSnapshotCoins = nativeCoinList
        .map(coin => normalizeCoinDrop(coin, 'native'))
        .filter(Boolean);
      return buildNativeCoinSnapshotCore(nativeSnapshotCoins, coinTargetCoreOptions({ nowMs: Date.now() }));
    })();
    if (!Array.isArray(currentSnapshot)) return false;
    const t = Date.now();
    let recorded = false;
    const incidentalPickups = pickIncidentalCoinPickupsCore(
      previousSnapshot,
      currentSnapshot,
      currentSummary,
      previousSelf,
      coinTargetCoreOptions({ nowMs: t })
    );
    for (const pickup of incidentalPickups) {
      const coin = pickup.coin;
      const currentDistance = pickup.currentDistance;
      const sessionRecorded = (() => {
      const sessionTarget = {
        id: coin.id || coin.key,
        amount: coin.amount,
        x: coin.x,
        y: coin.y,
        distance: currentDistance
      };
      const sessionAmount = coin.amount;
      const sessionSummary = currentSummary;
      const sessionPreviousCoins = previousCoins;
      const sessionReason = 'incidental-coin-disappeared';
      const sessionValue = Math.max(0, Math.round(Number(sessionAmount || 0)));
      if (!sessionValue) return false;
      updateSessionStats(sessionSummary);
      const session = bot.session || (bot.session = {});
      const sessionAt = Date.now();
      const sessionKey = coinTargetKeyCore(sessionTarget);
      if (!Array.isArray(session.coinPickupKeys)) session.coinPickupKeys = [];
      session.coinPickupKeys = session.coinPickupKeys
        .filter(item => item && sessionAt - Number(item.at || 0) <= 60000)
        .slice(-80);
      if (sessionKey && session.coinPickupKeys.some(item => String(item.key || '') === sessionKey && sessionAt - Number(item.at || 0) <= 5000)) {
        return false;
      }
      if (sessionKey) pushBounded(session.coinPickupKeys, { key: sessionKey, at: sessionAt, amount: sessionValue, reason: sessionReason || '' }, 80);
      (() => {
        const dropMatchedKill = buildDropMatchedKillCore(sessionTarget, sessionValue, sessionSummary, sessionReason, {
          nowMs: Date.now(),
          seenKillKeys: bot.seenKillKeys,
          sessionId: bot.session?.importantSessionId || '',
          sessionStaminaSpentMs: importantSessionStaminaSpentMs(bot.session),
          coinTargetKey: coinTargetKeyCore
        });
        return dropMatchedKill ? recordKillHistoryItem(dropMatchedKill.kill, dropMatchedKill.seenKey) : null;
      })();
      session.coinPickupTotal = Math.max(0, Number(session.coinPickupTotal || 0) || 0) + sessionValue;
      const sessionCoinDiff = Math.max(0, Math.round(Number(sessionSummary?.coins || 0) - Number(sessionPreviousCoins || 0)));
      session.coinsGained = Math.max(
        Math.max(0, Number(session.coinsGained || 0) || 0),
        Math.max(0, Number(session.coinPickupTotal || 0) || 0),
        sessionCoinDiff
      );
      upsertImportantSessionRecord(session, sessionSummary, { at: sessionAt });
      return true;
    })();
      recorded = Boolean(recorded || sessionRecorded);
      if (sessionRecorded) {
        bot.lastCoinCollected = {
          id: coin.id || coin.key,
          amount: coin.amount,
          distance: Number.isFinite(currentDistance) ? Math.round(currentDistance) : null,
          previousCoins,
          currentCoins: Number(currentSummary?.coins || 0),
          pruned: 0,
          confirmReason: 'incidental-coin-disappeared',
          sessionRecorded,
          at: t
        };
      }
    }
    (() => {
      const rememberedSnapshot = currentSnapshot;
      const nextSnapshot = Array.isArray(rememberedSnapshot)
        ? rememberedSnapshot
        : (() => {
      const nativeCoinList = getNativeCoinList();
      if (!Array.isArray(nativeCoinList)) return null;
      const nativeSnapshotCoins = nativeCoinList
        .map(coin => normalizeCoinDrop(coin, 'native'))
        .filter(Boolean);
      return buildNativeCoinSnapshotCore(nativeSnapshotCoins, coinTargetCoreOptions({ nowMs: Date.now() }));
    })();
      if (Array.isArray(nextSnapshot)) bot.lastNativeCoinSnapshot = nextSnapshot.slice(-160);
      return nextSnapshot;
    })();
    return recorded;
  }

  function markCoinCollected(self, currentSummary, previousCoins) {
    const target = trackedCoinTargetForCollectionCore({
      lastDecision: bot.lastDecision,
      lastTarget: bot.lastTarget,
      coinProgress: bot.coinProgress
    }, self, coinTargetCoreOptions());
    if (!target) return false;
    const id = target.id === undefined || target.id === null ? '' : String(target.id);
    const distance = Number(target.distance);
    if (Number.isFinite(distance) && distance > Number(cfg.coinCollectedConfirmDistance || 0)) return false;
    const currentCoins = Number(currentSummary?.coins || 0);
    const coinDelta = Math.max(0, Math.round(currentCoins - Number(previousCoins || 0)));
    const visible = (() => {
      const visibleTarget = target;
      const nativeCoinList = getNativeCoinList();
      if (!Array.isArray(nativeCoinList)) return null;
      return nativeCoinList
        .map(coin => normalizeCoinDrop(coin, 'native'))
        .filter(Boolean)
        .some(coin => coinMatchesTrackedTargetCore(coin, visibleTarget, coinTargetCoreOptions()));
    })();
    const confirmed = coinDelta > 0 || visible === false;
    if (!confirmed) return false;
    const amount = Math.max(0, Math.round(Number(target.amount || 0))) || coinDelta;
    if (!amount) return false;
    const t = now();
    if (id) {
      bot.ignoredCoins.set(id, t + Number(cfg.coinCollectedIgnoreMs || 0));
      bot.coinAttempts.delete(id);
    }
    const pruned = (() => {
      const pruneTarget = target;
      const pruneId = pruneTarget?.id === undefined || pruneTarget?.id === null ? '' : String(pruneTarget.id);
      const pruneX = Number(pruneTarget?.x);
      const pruneY = Number(pruneTarget?.y);
      const pruneHasPoint = Number.isFinite(pruneX) && Number.isFinite(pruneY);
      if (!pruneId && !pruneHasPoint) return 0;
      const beforePrune = arrayCount(bot.globalState.coinDrops);
      bot.globalState.coinDrops = (Array.isArray(bot.globalState.coinDrops) ? bot.globalState.coinDrops : []).filter(raw => {
        const coin = normalizeCoinDrop(raw, 'snapshot');
        if (!coin) return false;
        if (pruneId && String(coin.drop_id) === pruneId) return false;
        if (pruneHasPoint && dist({ x: pruneX, y: pruneY }, coin) <= Number(cfg.coinCollectedPruneRadius || 0)) return false;
        return true;
      });
      return beforePrune - arrayCount(bot.globalState.coinDrops);
    })();
    const confirmReason = coinDelta > 0 ? 'coins-increased' : 'coin-disappeared';
    const sessionRecorded = (() => {
      const sessionTarget = target;
      const sessionAmount = amount;
      const sessionSummary = currentSummary;
      const sessionPreviousCoins = previousCoins;
      const sessionReason = confirmReason;
      const sessionValue = Math.max(0, Math.round(Number(sessionAmount || 0)));
      if (!sessionValue) return false;
      updateSessionStats(sessionSummary);
      const session = bot.session || (bot.session = {});
      const sessionAt = Date.now();
      const sessionKey = coinTargetKeyCore(sessionTarget);
      if (!Array.isArray(session.coinPickupKeys)) session.coinPickupKeys = [];
      session.coinPickupKeys = session.coinPickupKeys
        .filter(item => item && sessionAt - Number(item.at || 0) <= 60000)
        .slice(-80);
      if (sessionKey && session.coinPickupKeys.some(item => String(item.key || '') === sessionKey && sessionAt - Number(item.at || 0) <= 5000)) {
        return false;
      }
      if (sessionKey) pushBounded(session.coinPickupKeys, { key: sessionKey, at: sessionAt, amount: sessionValue, reason: sessionReason || '' }, 80);
      (() => {
        const dropMatchedKill = buildDropMatchedKillCore(sessionTarget, sessionValue, sessionSummary, sessionReason, {
          nowMs: Date.now(),
          seenKillKeys: bot.seenKillKeys,
          sessionId: bot.session?.importantSessionId || '',
          sessionStaminaSpentMs: importantSessionStaminaSpentMs(bot.session),
          coinTargetKey: coinTargetKeyCore
        });
        return dropMatchedKill ? recordKillHistoryItem(dropMatchedKill.kill, dropMatchedKill.seenKey) : null;
      })();
      session.coinPickupTotal = Math.max(0, Number(session.coinPickupTotal || 0) || 0) + sessionValue;
      const sessionCoinDiff = Math.max(0, Math.round(Number(sessionSummary?.coins || 0) - Number(sessionPreviousCoins || 0)));
      session.coinsGained = Math.max(
        Math.max(0, Number(session.coinsGained || 0) || 0),
        Math.max(0, Number(session.coinPickupTotal || 0) || 0),
        sessionCoinDiff
      );
      upsertImportantSessionRecord(session, sessionSummary, { at: sessionAt });
      return true;
    })();
    bot.lastCoinCollected = {
      id,
      amount,
      distance: Number.isFinite(distance) ? Math.round(distance) : null,
      previousCoins,
      currentCoins,
      pruned,
      confirmReason,
      sessionRecorded,
      at: Date.now()
    };
    clearCoinTracking(confirmReason);
    (() => {
      const rememberedSnapshot = null;
      const nextSnapshot = Array.isArray(rememberedSnapshot)
        ? rememberedSnapshot
        : (() => {
      const nativeCoinList = getNativeCoinList();
      if (!Array.isArray(nativeCoinList)) return null;
      const nativeSnapshotCoins = nativeCoinList
        .map(coin => normalizeCoinDrop(coin, 'native'))
        .filter(Boolean);
      return buildNativeCoinSnapshotCore(nativeSnapshotCoins, coinTargetCoreOptions({ nowMs: Date.now() }));
    })();
      if (Array.isArray(nextSnapshot)) bot.lastNativeCoinSnapshot = nextSnapshot.slice(-160);
      return nextSnapshot;
    })();
    return true;
  }

  function applyCoinProgressAction(action, self) {
    const progressAction = action;
    const progressSelf = self;
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
      if (shouldClearOpportunityChoiceCore(bot.opportunityChoice, 'coin', progressId)) {
        bot.opportunityChoice = null;
        resetOpportunitySwitchLock();
      }
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
    if (shouldClearOpportunityChoiceCore(bot.opportunityChoice, 'coin', progressId)) {
      bot.opportunityChoice = null;
      resetOpportunitySwitchLock();
    }
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
  }

  function applyFinalActionArbitration(action, source = '') {
    const finalActionState = ensureFinalActionArbitration();
    return applyFinalActionArbitrationCore(action, finalActionState, {
      source,
      holdMs: finalActionArbitrationHoldMs(),
      historyLimit: finalActionArbitrationHistoryLimit(),
      clone: safeJsonClone
    }).action;
  }

  function recordActionSwitchDiagnostics(action, source = '') {
    const targetSwitchState = ensureTargetSwitchDiagnostics();
    return recordActionSwitchDiagnosticsCore(action, targetSwitchState, {
      source,
      tickCount: bot.tickCount,
      previousDecision: bot.lastDecision,
      historyLimit: targetSwitchHistoryLimit(),
      oscillationWindowMs: targetSwitchOscillationWindowMs(),
      clone: safeJsonClone
    }).action;
  }

  return {
    coinFailureIgnoreCore,
    staleCoinEscapeDirectionCore,
    coinProgressIntentCore,
    coinAttemptExpiredCore,
    updateCoinAttemptCore,
    updateCoinProgressRecordCore,
    buildIgnoredCoinProgressCore,
    buildIgnoredCoinPatrolActionCore,
    coinIgnoreCleanupIntentCore,
    coinProgressCoreOptions,
    actionPriorityBand,
    actionFocusTargetType,
    actionFocusId,
    actionFocusSummary,
    actionSwitchPairKey,
    buildPreviousDecisionSummary,
    recordActionSwitchDiagnosticsCore,
    finalActionBandRank,
    finalActionReusable,
    shouldHoldPreviousFinalAction,
    applyFinalActionArbitrationCore,
    targetSwitchHistoryLimit,
    targetSwitchOscillationWindowMs,
    roundedNullable,
    ensureTargetSwitchDiagnostics,
    finalActionArbitrationHoldMs,
    finalActionArbitrationHistoryLimit,
    ensureFinalActionArbitration,
    coinTargetKeyCore,
    coinTargetDistance,
    coinMatchesTrackedTargetCore,
    trackedCoinTargetForCollectionCore,
    buildNativeCoinSnapshotCore,
    pointToSegmentDistanceCore,
    pickIncidentalCoinPickupsCore,
    snapshotCoinWorthLongTravelCore,
    snapshotCoinNavigationReasonCore,
    setLastTarget,
    clearCoinTracking,
    coinTargetCoreOptions,
    recordIncidentalCoinPickups,
    markCoinCollected,
    applyCoinProgressAction,
    applyFinalActionArbitration,
    recordActionSwitchDiagnostics,
    buildDropMatchedKillCore
  };
}

module.exports = {
  createProfitArbitrationRuntime
};
