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

function opportunityCandidateSource() {
  return String.raw`
  function opportunityPriorityTier(item) {
    return opportunityPriorityTierCore(item, {
      visibleDistance: cfg.opportunityVisibleDistance,
      nearbyPriorityDistance: cfg.opportunityNearbyPriorityDistance
    });
  }

	  ${opportunityEffectiveStaminaCostCore.toString()}
	  ${opportunityValueScoreCore.toString()}
	  ${opportunityPriorityTierCore.toString()}
	  ${mergeCoinRouteDisplayCore.toString()}
	  ${uniqueVisibleRouteCoinsCore.toString()}
	  ${buildCoinOpportunityCandidatesCore.toString()}
	  ${buildEnemyOpportunityCandidatesCore.toString()}
	  ${buildOpportunityCandidatesCore.toString()}
	  ${bestCoinOpportunityScoreCore.toString()}

${opportunityRouteSource()}	  function opportunityCandidateCoreOptions(self = null) {
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

  function uniqueVisibleRouteCoins(coinGroups) {
    return uniqueVisibleRouteCoinsCore(coinGroups, { isSnapshotOnlyCoin, coinKey: coinRouteKey });
  }

  function bestCoinOpportunityScore(self, coinGroups, activeThreats) {
    const route = pickCoinRouteOpportunity(self, uniqueVisibleRouteCoins(coinGroups), activeThreats);
    return bestCoinOpportunityScoreCore(self, coinGroups, activeThreats, route, opportunityCandidateCoreOptions(self));
  }

  function pickProfitableCombatTarget(self, combatTargets, bullets, coinGroups, activeThreats) {
    if (!isFullHp(self)) return null;
    const target = pickCombatTarget(self, combatTargets, bullets, { mode: 'profit' });
    if (!target) return null;
    const targetScore = scoreEnemyOpportunity(target);
    if (targetScore === null) return null;
    if (!opportunityStaminaAffordable(self, opportunityEnemyStaminaCost(target))) return null;
    const coinScore = bestCoinOpportunityScore(self, coinGroups, activeThreats);
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

module.exports = { opportunityCandidateSource };
