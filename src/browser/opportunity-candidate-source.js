'use strict';

const { opportunityRouteSource } = require('./opportunity-route-source');
const {
  opportunityEffectiveStaminaCostCore,
  opportunityValueScoreCore,
  opportunityPriorityTierCore,
  mergeCoinRouteDisplayCore,
  uniqueVisibleRouteCoinsCore,
  buildCoinOpportunityCandidatesCore,
  buildEnemyOpportunityCandidatesCore,
  buildOpportunityCandidatesCore,
  bestCoinOpportunityScoreCore
} = require('./runtime/opportunity-candidates');

function opportunityCandidateInlineSource(helpers = {}, options = {}) {
  const {
    opportunityEffectiveStaminaCostCore,
    opportunityValueScoreCore,
    opportunityPriorityTierCore,
    mergeCoinRouteDisplayCore,
    uniqueVisibleRouteCoinsCore,
    buildCoinOpportunityCandidatesCore,
    buildEnemyOpportunityCandidatesCore,
    buildOpportunityCandidatesCore,
    bestCoinOpportunityScoreCore
  } = helpers;
  const opportunityCandidateHelperSource = [
    opportunityEffectiveStaminaCostCore,
    opportunityValueScoreCore,
    opportunityPriorityTierCore,
    mergeCoinRouteDisplayCore,
    uniqueVisibleRouteCoinsCore,
    buildCoinOpportunityCandidatesCore,
    buildEnemyOpportunityCandidatesCore,
    buildOpportunityCandidatesCore,
    bestCoinOpportunityScoreCore
  ].map(fn => typeof fn === 'function' ? `\t  ${fn.toString()}` : '').join('\n');
  const uniqueVisibleRouteCoinsCall = 'uniqueVisibleRouteCoinsCore(coinGroups, { isSnapshotOnlyCoin, coinKey: coinRouteKey })';
  const pickCoinRouteOpportunityCall = options.bundledRuntime
    ? String.raw`pickCoinRouteOpportunityCore(self, ${uniqueVisibleRouteCoinsCall}, activeThreats, {
      ...coinRouteCoreOptions(self),
      heldChoice: currentHeldCoinChoice(),
      heldRouteChoice: currentHeldCoinRouteChoice()
    })`
    : String.raw`pickCoinRouteOpportunity(self, uniqueVisibleRouteCoins(coinGroups), activeThreats)`;
  const bestCoinOpportunityScoreCall = options.bundledRuntime
    ? String.raw`(() => {
      const route = ${pickCoinRouteOpportunityCall};
      return bestCoinOpportunityScoreCore(self, coinGroups, activeThreats, route, opportunityCandidateCoreOptions(self));
    })()`
    : 'bestCoinOpportunityScore(self, coinGroups, activeThreats)';
  const localOpportunityCandidateWrapperSource = options.bundledRuntime ? '' : String.raw`
  function uniqueVisibleRouteCoins(coinGroups) {
    return uniqueVisibleRouteCoinsCore(coinGroups, { isSnapshotOnlyCoin, coinKey: coinRouteKey });
  }

  function bestCoinOpportunityScore(self, coinGroups, activeThreats) {
    const route = pickCoinRouteOpportunity(self, uniqueVisibleRouteCoins(coinGroups), activeThreats);
    return bestCoinOpportunityScoreCore(self, coinGroups, activeThreats, route, opportunityCandidateCoreOptions(self));
  }

`;
  return String.raw`
  function opportunityPriorityTier(item) {
    return opportunityPriorityTierCore(item, {
      visibleDistance: cfg.opportunityVisibleDistance,
      nearbyPriorityDistance: cfg.opportunityNearbyPriorityDistance
    });
  }

${opportunityCandidateHelperSource}

${opportunityRouteSource(options)}	  function opportunityCandidateCoreOptions(self = null) {
	    return {
	      safeCoinCandidates,
	      coinStaminaCost: opportunityCoinStaminaCost,
	      coinStaminaAffordable: (coin, staminaCost = opportunityCoinStaminaCost(coin)) => coinStaminaAffordableWithDiagnostic(self, coin, staminaCost),
	      scoreCoinOpportunity,
	      snapshotCoinNavigationReason,
	      maxCoinDistance: cfg.coinMaxDistance,
	      routeMaxDistance: cfg.coinRouteMaxDistance,
	      scoreEnemyOpportunity,
	      enemyStaminaCost: opportunityEnemyStaminaCost,
	      opportunityStaminaAffordable: staminaCost => opportunityStaminaAffordable(self, staminaCost),
	      isAfkProfitTarget,
	      attackRange: cfg.attackRange,
	      attackEngageRange: cfg.attackEngageRange,
	      priorityTier: opportunityPriorityTier,
	      visibleDistance: cfg.opportunityVisibleDistance,
	      nearbyPriorityDistance: cfg.opportunityNearbyPriorityDistance
	    };
	  }

${localOpportunityCandidateWrapperSource}

  function pickProfitableCombatTarget(self, combatTargets, bullets, coinGroups, activeThreats) {
    if (!isFullHp(self)) return null;
    const target = pickCombatTarget(self, combatTargets, bullets, { mode: 'profit' });
    if (!target) return null;
    const targetScore = scoreEnemyOpportunity(target);
    if (targetScore === null) return null;
    if (!opportunityStaminaAffordable(self, opportunityEnemyStaminaCost(target))) return null;
    const coinScore = ${bestCoinOpportunityScoreCall};
    if (targetScore < coinScore) return null;
    return {
      ...target,
      combatIntent: 'profit',
      combatOpportunityScore: Math.round(targetScore),
      competingCoinScore: Number.isFinite(coinScore) ? Math.round(coinScore) : null
    };
  }

`;
}

function bundledOpportunityCandidateSource(options = {}) {
  return `const {
  opportunityEffectiveStaminaCostCore,
  opportunityValueScoreCore,
  opportunityPriorityTierCore,
  mergeCoinRouteDisplayCore,
  uniqueVisibleRouteCoinsCore,
  buildCoinOpportunityCandidatesCore,
  buildEnemyOpportunityCandidatesCore,
  buildOpportunityCandidatesCore,
  bestCoinOpportunityScoreCore
} = require('./src/browser/runtime/opportunity-candidates');

${opportunityCandidateInlineSource({}, options)}`;
}

function opportunityCandidateSource(options = {}) {
  if (options.bundledRuntime) return bundledOpportunityCandidateSource(options);
  return opportunityCandidateInlineSource({
    opportunityEffectiveStaminaCostCore,
    opportunityValueScoreCore,
    opportunityPriorityTierCore,
    mergeCoinRouteDisplayCore,
    uniqueVisibleRouteCoinsCore,
    buildCoinOpportunityCandidatesCore,
    buildEnemyOpportunityCandidatesCore,
    buildOpportunityCandidatesCore,
    bestCoinOpportunityScoreCore
  }, options);
}

module.exports = {
  bundledOpportunityCandidateSource,
  opportunityCandidateInlineSource,
  opportunityCandidateSource
};
