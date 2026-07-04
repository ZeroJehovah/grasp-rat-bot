'use strict';

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
} = require('./runtime/coin-target');
const { clearOpportunityChoiceForCall } = require('./opportunity-clear-call-source');
const { recordDropMatchedKillCall } = require('./combat-history-source');

function nativeCoinSnapshotCall(options = {}) {
  if (!options.bundledRuntime) return 'nativeCoinSnapshot()';
  return String.raw`(() => {
      const nativeCoinList = getNativeCoinList();
      if (!Array.isArray(nativeCoinList)) return null;
      const nativeSnapshotCoins = nativeCoinList
        .map(coin => normalizeCoinDrop(coin, 'native'))
        .filter(Boolean);
      return buildNativeCoinSnapshotCore(nativeSnapshotCoins, coinTargetCoreOptions({ nowMs: Date.now() }));
    })()`;
}

function rememberNativeCoinSnapshotCall(snapshotExpr = 'null', options = {}) {
  if (!options.bundledRuntime) {
    return snapshotExpr === 'null' || snapshotExpr === null || snapshotExpr === undefined
      ? 'rememberNativeCoinSnapshot()'
      : `rememberNativeCoinSnapshot(${snapshotExpr})`;
  }
  return String.raw`(() => {
      const rememberedSnapshot = ${snapshotExpr || 'null'};
      const nextSnapshot = Array.isArray(rememberedSnapshot)
        ? rememberedSnapshot
        : ${nativeCoinSnapshotCall(options)};
      if (Array.isArray(nextSnapshot)) bot.lastNativeCoinSnapshot = nextSnapshot.slice(-160);
      return nextSnapshot;
    })()`;
}

function trackedCoinStillVisibleCall(targetExpr, options = {}) {
  if (!options.bundledRuntime) return `trackedCoinStillVisible(${targetExpr})`;
  return String.raw`(() => {
      const visibleTarget = ${targetExpr};
      const nativeCoinList = getNativeCoinList();
      if (!Array.isArray(nativeCoinList)) return null;
      return nativeCoinList
        .map(coin => normalizeCoinDrop(coin, 'native'))
        .filter(Boolean)
        .some(coin => coinMatchesTrackedTargetCore(coin, visibleTarget, coinTargetCoreOptions()));
    })()`;
}

function pruneCollectedSnapshotCoinCall(targetExpr, options = {}) {
  if (!options.bundledRuntime) return `pruneCollectedSnapshotCoin(${targetExpr})`;
  return String.raw`(() => {
      const pruneTarget = ${targetExpr};
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
    })()`;
}

function recordSessionCoinPickupCall(targetExpr, amountExpr, currentSummaryExpr, previousCoinsExpr, reasonExpr, options = {}) {
  if (!options.bundledRuntime) {
    return `recordSessionCoinPickup(${targetExpr}, ${amountExpr}, ${currentSummaryExpr}, ${previousCoinsExpr}, ${reasonExpr})`;
  }
  return String.raw`(() => {
      const sessionTarget = ${targetExpr};
      const sessionAmount = ${amountExpr};
      const sessionSummary = ${currentSummaryExpr};
      const sessionPreviousCoins = ${previousCoinsExpr};
      const sessionReason = ${reasonExpr};
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
      ${recordDropMatchedKillCall('sessionTarget', 'sessionValue', 'sessionSummary', 'sessionReason', options)};
      session.coinPickupTotal = Math.max(0, Number(session.coinPickupTotal || 0) || 0) + sessionValue;
      const sessionCoinDiff = Math.max(0, Math.round(Number(sessionSummary?.coins || 0) - Number(sessionPreviousCoins || 0)));
      session.coinsGained = Math.max(
        Math.max(0, Number(session.coinsGained || 0) || 0),
        Math.max(0, Number(session.coinPickupTotal || 0) || 0),
        sessionCoinDiff
      );
      upsertImportantSessionRecord(session, sessionSummary, { at: sessionAt });
      return true;
    })()`;
}

function coinTargetRuntimeInlineSource(helpers = {}, options = {}) {
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
  } = helpers;
  const coinTargetHelperSource = [
    coinTargetKeyCore,
    coinTargetDistance,
    coinMatchesTrackedTargetCore,
    trackedCoinTargetForCollectionCore,
    buildNativeCoinSnapshotCore,
    pointToSegmentDistanceCore,
    pickIncidentalCoinPickupsCore,
    snapshotCoinWorthLongTravelCore,
    snapshotCoinNavigationReasonCore
  ].map(fn => typeof fn === 'function' ? `  ${fn.toString()}` : '').join('\n');
  const clearTrackedCoinOpportunity = clearOpportunityChoiceForCall("'coin'", 'null', options);
  const localCoinTargetSupportSource = options.bundledRuntime ? '' : String.raw`
  function trackedCoinStillVisible(target) {
    const nativeCoinList = getNativeCoinList();
    if (!Array.isArray(nativeCoinList)) return null;
    return nativeCoinList
      .map(coin => normalizeCoinDrop(coin, 'native'))
      .filter(Boolean)
      .some(coin => coinMatchesTrackedTargetCore(coin, target, coinTargetCoreOptions()));
  }

  function nativeCoinSnapshot() {
    const nativeCoinList = getNativeCoinList();
    if (!Array.isArray(nativeCoinList)) return null;
    const coins = nativeCoinList
      .map(coin => normalizeCoinDrop(coin, 'native'))
      .filter(Boolean);
    return buildNativeCoinSnapshotCore(coins, coinTargetCoreOptions({ nowMs: Date.now() }));
  }

  function rememberNativeCoinSnapshot(snapshot = null) {
    const next = Array.isArray(snapshot) ? snapshot : nativeCoinSnapshot();
    if (Array.isArray(next)) bot.lastNativeCoinSnapshot = next.slice(-160);
    return next;
  }

  function recordSessionCoinPickup(target, amount, currentSummary, previousCoins, reason) {
    const value = Math.max(0, Math.round(Number(amount || 0)));
    if (!value) return false;
    updateSessionStats(currentSummary);
    const session = bot.session || (bot.session = {});
    const t = Date.now();
    const key = coinTargetKeyCore(target);
    if (!Array.isArray(session.coinPickupKeys)) session.coinPickupKeys = [];
    session.coinPickupKeys = session.coinPickupKeys
      .filter(item => item && t - Number(item.at || 0) <= 60000)
      .slice(-80);
    if (key && session.coinPickupKeys.some(item => String(item.key || '') === key && t - Number(item.at || 0) <= 5000)) {
      return false;
    }
    if (key) pushBounded(session.coinPickupKeys, { key, at: t, amount: value, reason: reason || '' }, 80);
    ${recordDropMatchedKillCall('target', 'value', 'currentSummary', 'reason', options)};
    session.coinPickupTotal = Math.max(0, Number(session.coinPickupTotal || 0) || 0) + value;
    const coinDiff = Math.max(0, Math.round(Number(currentSummary?.coins || 0) - Number(previousCoins || 0)));
    session.coinsGained = Math.max(
      Math.max(0, Number(session.coinsGained || 0) || 0),
      Math.max(0, Number(session.coinPickupTotal || 0) || 0),
      coinDiff
    );
    upsertImportantSessionRecord(session, currentSummary, { at: t });
    return true;
  }

  function pruneCollectedSnapshotCoin(target) {
    const id = target?.id === undefined || target?.id === null ? '' : String(target.id);
    const x = Number(target?.x);
    const y = Number(target?.y);
    const hasPoint = Number.isFinite(x) && Number.isFinite(y);
    if (!id && !hasPoint) return 0;
	    const before = arrayCount(bot.globalState.coinDrops);
	    bot.globalState.coinDrops = (Array.isArray(bot.globalState.coinDrops) ? bot.globalState.coinDrops : []).filter(raw => {
      const coin = normalizeCoinDrop(raw, 'snapshot');
      if (!coin) return false;
      if (id && String(coin.drop_id) === id) return false;
      if (hasPoint && dist({ x, y }, coin) <= Number(cfg.coinCollectedPruneRadius || 0)) return false;
      return true;
    });
	    return before - arrayCount(bot.globalState.coinDrops);
  }

`;
  return String.raw`
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
	    ${clearTrackedCoinOpportunity}
	    bot.lastCoinClearReason = reason;
  }

${coinTargetHelperSource}

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

${localCoinTargetSupportSource}

  function recordIncidentalCoinPickups(self, currentSummary, previousSelf, previousCoins) {
    const previousSnapshot = Array.isArray(bot.lastNativeCoinSnapshot) ? bot.lastNativeCoinSnapshot : [];
    const currentSnapshot = ${nativeCoinSnapshotCall(options)};
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
      const sessionRecorded = ${recordSessionCoinPickupCall(`{
        id: coin.id || coin.key,
        amount: coin.amount,
        x: coin.x,
        y: coin.y,
        distance: currentDistance
      }`, 'coin.amount', 'currentSummary', 'previousCoins', "'incidental-coin-disappeared'", options)};
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
    ${rememberNativeCoinSnapshotCall('currentSnapshot', options)};
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
    const visible = ${trackedCoinStillVisibleCall('target', options)};
    const confirmed = coinDelta > 0 || visible === false;
    if (!confirmed) return false;
    const amount = Math.max(0, Math.round(Number(target.amount || 0))) || coinDelta;
    if (!amount) return false;
    const t = now();
    if (id) {
      bot.ignoredCoins.set(id, t + Number(cfg.coinCollectedIgnoreMs || 0));
      bot.coinAttempts.delete(id);
    }
    const pruned = ${pruneCollectedSnapshotCoinCall('target', options)};
    const confirmReason = coinDelta > 0 ? 'coins-increased' : 'coin-disappeared';
    const sessionRecorded = ${recordSessionCoinPickupCall('target', 'amount', 'currentSummary', 'previousCoins', 'confirmReason', options)};
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
    ${rememberNativeCoinSnapshotCall('null', options)};
    return true;
  }
`;
}

function bundledCoinTargetRuntimeSource() {
  return `const {
  coinTargetKeyCore,
  coinTargetDistance,
  coinMatchesTrackedTargetCore,
  trackedCoinTargetForCollectionCore,
  buildNativeCoinSnapshotCore,
  pointToSegmentDistanceCore,
  pickIncidentalCoinPickupsCore,
  snapshotCoinWorthLongTravelCore,
  snapshotCoinNavigationReasonCore
} = require('./src/browser/runtime/coin-target');

${coinTargetRuntimeInlineSource({}, { bundledRuntime: true })}`;
}

function coinTargetRuntimeSource(options = {}) {
  if (options.bundledRuntime) return bundledCoinTargetRuntimeSource();
  return coinTargetRuntimeInlineSource({
    coinTargetKeyCore,
    coinTargetDistance,
    coinMatchesTrackedTargetCore,
    trackedCoinTargetForCollectionCore,
    buildNativeCoinSnapshotCore,
    pointToSegmentDistanceCore,
    pickIncidentalCoinPickupsCore,
    snapshotCoinWorthLongTravelCore,
    snapshotCoinNavigationReasonCore
  });
}

module.exports = {
  bundledCoinTargetRuntimeSource,
  coinTargetRuntimeInlineSource,
  coinTargetRuntimeSource,
  rememberNativeCoinSnapshotCall
};
