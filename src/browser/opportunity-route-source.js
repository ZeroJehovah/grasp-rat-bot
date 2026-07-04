'use strict';

const {
  defaultDist,
  coinRouteKey,
  coinRouteIdsFrom,
  coinRouteLegStaminaCostCore,
  coinRouteLegClearCore,
  coinRoutePointLimitCore,
  coinRouteSummaryCore,
  coinRoutePoints,
  coinRouteActionMetaCore,
  buildCoinRouteFromAnchorCore,
  coinRouteSkipsCloserFirstCoinCore,
  coinRouteSkipsHeldSingleCoinCore,
  coinRouteMatchesHeldChoiceCore,
  heldCoinRouteBeatsSwitchCore,
  pickCoinRouteOpportunityCore
} = require('./runtime/coin-route');

function opportunityRouteInlineSource(helpers = {}, options = {}) {
  const {
    defaultDist,
    coinRouteKey,
    coinRouteIdsFrom,
    coinRouteLegStaminaCostCore,
    coinRouteLegClearCore,
    coinRoutePointLimitCore,
    coinRouteSummaryCore,
    coinRoutePoints,
    coinRouteActionMetaCore,
    buildCoinRouteFromAnchorCore,
    coinRouteSkipsCloserFirstCoinCore,
    coinRouteSkipsHeldSingleCoinCore,
    coinRouteMatchesHeldChoiceCore,
    heldCoinRouteBeatsSwitchCore,
    pickCoinRouteOpportunityCore
  } = helpers;
  const coinRouteHelperSource = [
    defaultDist,
    coinRouteKey,
    coinRouteIdsFrom,
    coinRouteLegStaminaCostCore,
    coinRouteLegClearCore,
    coinRoutePointLimitCore,
    coinRouteSummaryCore,
    coinRoutePoints,
    coinRouteActionMetaCore,
    buildCoinRouteFromAnchorCore,
    coinRouteSkipsCloserFirstCoinCore,
    coinRouteSkipsHeldSingleCoinCore,
    coinRouteMatchesHeldChoiceCore,
    heldCoinRouteBeatsSwitchCore,
    pickCoinRouteOpportunityCore
  ].map((fn, index) => {
    if (typeof fn !== 'function') return '';
    const indent = index >= 5 && index <= 9 ? '\t\t\t  ' : '\t  ';
    return `${indent}${fn.toString()}`;
  }).join('\n');
  const localCoinRouteWrapperSource = options.bundledRuntime ? '' : String.raw`
	  function coinRouteLegStaminaCost(from, to) {
	    return coinRouteLegStaminaCostCore(from, to, coinRouteCoreOptions());
	  }

	  function coinRouteLegClear(from, to, activeThreats) {
	    return coinRouteLegClearCore(from, to, activeThreats, coinRouteCoreOptions());
	  }

	  function coinRoutePointLimit(anchor, candidates) {
	    return coinRoutePointLimitCore(anchor, candidates, coinRouteCoreOptions());
	  }

	  function coinRouteSummary(route, self) {
	    return coinRouteSummaryCore(route, self, coinRouteCoreOptions());
	  }

	  function buildCoinRouteFromAnchor(self, anchor, candidates, activeThreats) {
	    return buildCoinRouteFromAnchorCore(self, anchor, candidates, activeThreats, coinRouteCoreOptions(self));
	  }

	  function coinRouteSkipsCloserFirstCoin(self, route, candidates) {
	    return coinRouteSkipsCloserFirstCoinCore(self, route, candidates, coinRouteCoreOptions());
	  }

	  function coinRouteSkipsHeldSingleCoin(self, route, choice) {
	    return coinRouteSkipsHeldSingleCoinCore(self, route, choice, coinRouteCoreOptions());
	  }

	  function coinRouteMatchesHeldChoice(route, choice) {
	    return coinRouteMatchesHeldChoiceCore(route, choice, coinRouteCoreOptions());
	  }

	  function heldCoinRouteBeatsSwitch(heldRoute, bestRoute) {
	    return heldCoinRouteBeatsSwitchCore(heldRoute, bestRoute, coinRouteCoreOptions());
	  }

	  function pickCoinRouteOpportunity(self, coins, activeThreats) {
	    return pickCoinRouteOpportunityCore(self, coins, activeThreats, {
	      ...coinRouteCoreOptions(self),
	      heldChoice: currentHeldCoinChoice(),
	      heldRouteChoice: currentHeldCoinRouteChoice()
	    });
	  }

`;
  return String.raw`${coinRouteHelperSource}

	  function coinRouteCoreOptions(self = null) {
	    return {
	      dist,
	      moveStaminaCost: opportunityMoveStaminaCost,
	      pickupStaminaMs: cfg.opportunityCoinPickupStaminaMs,
	      sampleDistance: cfg.coinRouteLegSampleDistance,
	      threatDangerRadius: coinThreatDangerRadius,
	      coinBlockedByThreat,
	      clusterRadius: cfg.coinRouteClusterRadius,
	      maxPointsDense: cfg.coinRouteMaxPointsDense,
	      maxPointsMid: cfg.coinRouteMaxPointsMid,
	      maxPointsSparse: cfg.coinRouteMaxPointsSparse,
	      linkDistance: cfg.coinRouteLinkDistance,
	      maxLinkDistance: cfg.coinRouteMaxLinkDistance,
	      coinOpportunityValue: cfg.coinOpportunityValue,
	      valueScore: opportunityValueScore,
	      staminaAffordable: staminaCost => opportunityStaminaAffordable(self, staminaCost),
	      recordDiagnostic: (coin, reason, detail) => recordCoinFilterDiagnostic(coin, reason, detail),
	      nearbyFirstCoinDistance: cfg.coinRouteNearbyFirstCoinDistance,
	      firstCoinDistanceRatio: cfg.coinRouteFirstCoinDistanceRatio,
	      firstCoinDistanceSlack: cfg.coinRouteFirstCoinDistanceSlack,
	      choiceType: opportunityChoiceType,
	      choiceId: opportunityChoiceId,
	      heldMinOverlap: cfg.coinRouteHeldMinOverlap,
	      switchMargin: cfg.coinRouteSwitchMargin,
	      opportunitySwitchMargin: cfg.opportunitySwitchMargin,
	      switchRelativeMargin: cfg.coinRouteSwitchRelativeMargin,
	      opportunitySwitchRelativeMargin: cfg.opportunitySwitchRelativeMargin,
	      maxDistance: Math.max(0, Number(cfg.coinRouteMaxDistance || cfg.globalCoinMaxDistance || 0)),
	      poolLimit: cfg.coinRoutePoolLimit,
	      anchorLimit: cfg.coinRouteAnchorLimit,
	      safeCoinCandidates,
	      isSnapshotOnlyCoin
	    };
	  }

  function currentHeldCoinRouteChoice(t = now()) {
    const choice = bot.opportunityChoice;
    if (!choice || opportunityChoiceType(choice) !== 'coin') return null;
    if (t >= Number(choice.until || 0)) return null;
    const id = opportunityChoiceId(choice);
    if (!id && id !== '0') return null;
    if (String(choice.reason || '') !== 'best-opportunity-coin-route' && !coinRouteIdsFrom(choice).length) return null;
    return choice;
  }

  function currentHeldCoinChoice(t = now()) {
    const choice = bot.opportunityChoice;
    if (!choice || opportunityChoiceType(choice) !== 'coin') return null;
    if (t >= Number(choice.until || 0)) return null;
    const id = opportunityChoiceId(choice);
    if (!id && id !== '0') return null;
    return choice;
  }

${localCoinRouteWrapperSource}

`;
}

function bundledOpportunityRouteSource() {
  return `const {
  defaultDist,
  coinRouteKey,
  coinRouteIdsFrom,
  coinRouteLegStaminaCostCore,
  coinRouteLegClearCore,
  coinRoutePointLimitCore,
  coinRouteSummaryCore,
  coinRoutePoints,
  coinRouteActionMetaCore,
  buildCoinRouteFromAnchorCore,
  coinRouteSkipsCloserFirstCoinCore,
  coinRouteSkipsHeldSingleCoinCore,
  coinRouteMatchesHeldChoiceCore,
  heldCoinRouteBeatsSwitchCore,
  pickCoinRouteOpportunityCore
} = require('./src/browser/runtime/coin-route');

${opportunityRouteInlineSource({}, { bundledRuntime: true })}`;
}

function opportunityRouteSource(options = {}) {
  if (options.bundledRuntime) return bundledOpportunityRouteSource();
  return opportunityRouteInlineSource({
    defaultDist,
    coinRouteKey,
    coinRouteIdsFrom,
    coinRouteLegStaminaCostCore,
    coinRouteLegClearCore,
    coinRoutePointLimitCore,
    coinRouteSummaryCore,
    coinRoutePoints,
    coinRouteActionMetaCore,
    buildCoinRouteFromAnchorCore,
    coinRouteSkipsCloserFirstCoinCore,
    coinRouteSkipsHeldSingleCoinCore,
    coinRouteMatchesHeldChoiceCore,
    heldCoinRouteBeatsSwitchCore,
    pickCoinRouteOpportunityCore
  }, options);
}

module.exports = {
  bundledOpportunityRouteSource,
  opportunityRouteInlineSource,
  opportunityRouteSource
};
