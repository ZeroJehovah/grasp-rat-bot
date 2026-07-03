'use strict';

const { buildOpportunityCandidatesCore } = require('./opportunity-candidates');

function requiredFunction(options, name) {
  const fn = options?.[name];
  if (typeof fn !== 'function') {
    throw new TypeError(`opportunity pick option ${name} must be a function`);
  }
  return fn;
}

function pickBestOpportunityCore(self, activeThreats, coinGroups, enemyGroups, options = {}) {
  const enemyOpportunityCandidates = requiredFunction(options, 'enemyOpportunityCandidates');
  const uniqueVisibleRouteCoins = requiredFunction(options, 'uniqueVisibleRouteCoins');
  const pickCoinRouteOpportunity = requiredFunction(options, 'pickCoinRouteOpportunity');
  const opportunityCandidateCoreOptions = requiredFunction(options, 'opportunityCandidateCoreOptions');
  const buildCoinAction = requiredFunction(options, 'buildCoinAction');
  const buildEnemyAction = requiredFunction(options, 'buildEnemyAction');
  const buildMissingHeldOpportunity = requiredFunction(options, 'buildMissingHeldOpportunity');
  const chooseStableOpportunity = requiredFunction(options, 'chooseStableOpportunity');
  const rememberOpportunityChoice = requiredFunction(options, 'rememberOpportunityChoice');

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
}

module.exports = { pickBestOpportunityCore };
