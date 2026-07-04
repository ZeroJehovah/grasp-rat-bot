'use strict';

const { opportunityRouteSource } = require('./opportunity-route-source');

function opportunityCandidateSource() {
  const uniqueVisibleRouteCoinsCall = 'uniqueVisibleRouteCoinsCore(coinGroups, { isSnapshotOnlyCoin, coinKey: coinRouteKey })';
  const pickCoinRouteOpportunityCall = String.raw`pickCoinRouteOpportunityCore(self, ${uniqueVisibleRouteCoinsCall}, activeThreats, {
      ...coinRouteCoreOptions(self),
      heldChoice: currentHeldCoinChoice(),
      heldRouteChoice: currentHeldCoinRouteChoice()
    })`;
  const bestCoinOpportunityScoreCall = String.raw`(() => {
      const route = ${pickCoinRouteOpportunityCall};
      return bestCoinOpportunityScoreCore(self, coinGroups, activeThreats, route, opportunityCandidateCoreOptions(self));
    })()`;
  return String.raw`const {
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

  function opportunityPriorityTier(item) {
    return opportunityPriorityTierCore(item, {
      visibleDistance: cfg.opportunityVisibleDistance,
      nearbyPriorityDistance: cfg.opportunityNearbyPriorityDistance
    });
  }

${opportunityRouteSource()}	  function opportunityCandidateCoreOptions(self = null) {
	    return {
	      safeCoinCandidates,
	      coinStaminaCost: opportunityCoinStaminaCost,
	      coinStaminaAffordable: (coin, staminaCost = opportunityCoinStaminaCost(coin)) => coinStaminaAffordableWithDiagnostic(self, coin, staminaCost),
	      scoreCoinOpportunity,
	      snapshotCoinNavigationReason: coin => snapshotCoinNavigationReasonCore(coin, coinTargetCoreOptions()),
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

module.exports = {
  opportunityCandidateSource
};
