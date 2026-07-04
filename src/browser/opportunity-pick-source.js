'use strict';

function opportunityPickInlineSource() {
  return String.raw`
  function pickBestOpportunity(self, activeThreats, coinGroups, enemyGroups, options = {}) {
    const enemyTargets = enemyOpportunityCandidates(self, enemyGroups.flat(), activeThreats);
    const routeCoin = pickCoinRouteOpportunity(self, uniqueVisibleRouteCoins(coinGroups), activeThreats);
	    const opportunities = buildOpportunityCandidatesCore(
	      self,
	      activeThreats,
	      coinGroups,
	      enemyTargets,
	      routeCoin,
	      opportunityCandidateCoreOptions(self)
	    ).map(item => {
	      if (item.type === 'coin') {
	        const coin = item.sourceCoin || item;
	        return {
	          ...item,
	          action: () => buildCoinAction(self, coin, item.reason, item.actionKind === 'seek-coin' ? 'seek-coin' : 'coin')
	        };
	      }
	      const target = item.sourceTarget || item;
	      return {
	        ...item,
	        action: () => buildEnemyAction(self, target, item.reason || '')
	      };
	    });

	    if (!options.disableMissingHold) {
	      const missingHeld = buildMissingHeldOpportunity(self, activeThreats, opportunities);
	      if (missingHeld) opportunities.push(missingHeld);
	    }
			    const best = chooseStableOpportunity(opportunities);
		    if (!best) return null;
		    const action = best.action();
		    return rememberOpportunityChoice(best, action);
		  }`;
}

function bundledOpportunityPickSource() {
  return `const { pickBestOpportunityCore } = require('./src/browser/runtime/opportunity-pick');`;
}

function opportunityPickSource(options = {}) {
  if (options.bundledRuntime) return bundledOpportunityPickSource();
  return opportunityPickInlineSource();
}

module.exports = {
  bundledOpportunityPickSource,
  opportunityPickInlineSource,
  opportunityPickSource
};
