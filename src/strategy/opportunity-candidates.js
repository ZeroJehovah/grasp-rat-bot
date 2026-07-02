'use strict';

const { coinRouteKey } = require('./coin-route');

function opportunityEffectiveStaminaCostCore(staminaCost, options = {}) {
  const floor = Math.max(1, Number(options.distanceFloor || 1));
  const d = Math.max(0, Number(staminaCost) || 0);
  return Math.max(floor, d);
}

function opportunityValueScoreCore(value, staminaCost, options = {}) {
  const amount = Number(value || 0);
  if (!(amount > 0)) return -Infinity;
  const scale = Math.max(1, Number(options.distanceScoreScale || 1));
  const weight = Number(options.weight ?? options.coinOpportunityValue ?? 1);
  return amount * weight * scale / opportunityEffectiveStaminaCostCore(staminaCost, options);
}

function opportunityPriorityTierCore(item, options = {}) {
  const distance = Number(item?.distance ?? Infinity);
  const visibleDistance = Math.max(0, Number(options.visibleDistance || options.nearbyPriorityDistance || 0));
  if (Number.isFinite(distance) && distance <= visibleDistance) return 1;
  if (item?.type === 'enemy' && item?.kind === 'attack') return 1;
  return 0;
}

function mergeCoinRouteDisplayCore(base, routeCoin) {
  if (!base || !routeCoin?.coinRoute) return base;
  return {
    ...base,
    coinRoute: routeCoin.coinRoute,
    route: true,
    routeValue: routeCoin.routeValue || null,
    routeKind: routeCoin.routeKind || '',
    routeLegs: routeCoin.routeLegs || 0,
    routeDisplayOnly: true
  };
}

function uniqueVisibleRouteCoinsCore(coinGroups, options = {}) {
  const isSnapshotOnlyCoin = typeof options.isSnapshotOnlyCoin === 'function' ? options.isSnapshotOnlyCoin : coin => Boolean(coin?.snapshotOnly);
  const keyFrom = typeof options.coinKey === 'function' ? options.coinKey : coinRouteKey;
  const byId = new Map();
  for (const { coins: groupCoins } of coinGroups || []) {
    for (const coin of groupCoins || []) {
      if (isSnapshotOnlyCoin(coin)) continue;
      const key = keyFrom(coin);
      if (!byId.has(key)) byId.set(key, coin);
    }
  }
  return Array.from(byId.values());
}

function buildCoinOpportunityCandidatesCore(self, coinGroups, activeThreats, routeCoin = null, options = {}) {
  const safeCoinCandidates = typeof options.safeCoinCandidates === 'function' ? options.safeCoinCandidates : (coins => coins || []);
  const coinStaminaCost = typeof options.coinStaminaCost === 'function' ? options.coinStaminaCost : coin => Number(coin?.staminaCost || 0);
  const coinStaminaAffordable = typeof options.coinStaminaAffordable === 'function' ? options.coinStaminaAffordable : () => true;
  const scoreCoinOpportunity = typeof options.scoreCoinOpportunity === 'function' ? options.scoreCoinOpportunity : coin => Number(coin?.opportunityScore ?? 0);
  const snapshotCoinNavigationReason = typeof options.snapshotCoinNavigationReason === 'function'
    ? options.snapshotCoinNavigationReason
    : coin => Number(coin?.distance || Infinity) <= Number(options.maxCoinDistance || 0) ? 'best-opportunity-coin' : 'best-opportunity-visible-coin';
  const priorityTier = typeof options.priorityTier === 'function' ? options.priorityTier : item => opportunityPriorityTierCore(item, options);
  const byId = new Map();

  for (const { coins: groupCoins, maxDistance } of coinGroups || []) {
    for (const coin of safeCoinCandidates(groupCoins, activeThreats, maxDistance, self)) {
      const id = String(coin?.drop_id);
      const previous = byId.get(id);
      const staminaCost = coinStaminaCost(coin);
      if (!coinStaminaAffordable(coin, staminaCost)) continue;
      const score = scoreCoinOpportunity(coin);
      if (!previous
        || score > Number(previous.opportunitySortScore || -Infinity)
        || (score === Number(previous.opportunitySortScore || -Infinity) && Number(coin.amount || 0) > Number(previous.amount || 0))
        || (score === Number(previous.opportunitySortScore || -Infinity) && Number(coin.distance || 0) < Number(previous.distance || Infinity))) {
        byId.set(id, { ...coin, opportunitySortScore: score, opportunityStaminaCost: staminaCost, opportunityMaxDistance: maxDistance });
      }
    }
  }

  if (routeCoin) {
    const id = String(routeCoin.drop_id);
    const score = scoreCoinOpportunity(routeCoin);
    const previous = byId.get(id);
    if (!previous
      || score > Number(previous.opportunitySortScore || -Infinity)
      || (score === Number(previous.opportunitySortScore || -Infinity) && Number(routeCoin.routeValue || 0) > Number(previous.amount || 0))) {
      byId.set(id, {
        ...routeCoin,
        opportunitySortScore: score,
        opportunityStaminaCost: coinStaminaCost(routeCoin),
        opportunityMaxDistance: options.routeMaxDistance
      });
    } else if (previous) {
      byId.set(id, mergeCoinRouteDisplayCore(previous, routeCoin));
    }
  }

  return Array.from(byId.values()).map(coin => {
    const reason = coin.route ? 'best-opportunity-coin-route' : snapshotCoinNavigationReason(coin);
    const actionKind = Number(coin.distance || Infinity) <= Number(options.maxCoinDistance || 0) ? 'coin' : 'seek-coin';
    const score = Number.isFinite(Number(coin.opportunitySortScore)) ? Number(coin.opportunitySortScore) : scoreCoinOpportunity(coin);
    return {
      type: 'coin',
      id: coin.drop_id,
      amount: coin.amount,
      x: coin.x,
      y: coin.y,
      distance: coin.distance,
      staminaCost: coinStaminaCost(coin),
      score,
      priorityTier: priorityTier({ type: 'coin', distance: coin.distance }),
      actionKind,
      reason,
      maxDistance: coin.opportunityMaxDistance,
      coinRoute: coin.coinRoute || null,
      routeValue: coin.routeValue || null,
      routeKind: coin.routeKind || '',
      routeLegs: coin.routeLegs || 0,
      routeHeld: Boolean(coin.routeHeld),
      competingRouteScore: coin.competingRouteScore,
      sourceCoin: coin
    };
  });
}

function buildEnemyOpportunityCandidatesCore(targets, options = {}) {
  const scoreEnemyOpportunity = typeof options.scoreEnemyOpportunity === 'function' ? options.scoreEnemyOpportunity : target => Number(target?.opportunityScore ?? 0);
  const enemyStaminaCost = typeof options.enemyStaminaCost === 'function' ? options.enemyStaminaCost : target => Number(target?.staminaCost || 0);
  const opportunityStaminaAffordable = typeof options.opportunityStaminaAffordable === 'function' ? options.opportunityStaminaAffordable : () => true;
  const isAfkProfitTarget = typeof options.isAfkProfitTarget === 'function' ? options.isAfkProfitTarget : () => false;
  const priorityTier = typeof options.priorityTier === 'function' ? options.priorityTier : item => opportunityPriorityTierCore(item, options);
  const attackRange = Math.max(0, Number(options.attackRange || 0));
  const attackEngageRange = Math.max(attackRange, Number(options.attackEngageRange || attackRange || 0));
  const opportunities = [];
  for (const target of targets || []) {
    const score = scoreEnemyOpportunity(target);
    if (score === null) continue;
    const staminaCost = enemyStaminaCost(target);
    if (!opportunityStaminaAffordable(staminaCost)) continue;
    const afk = isAfkProfitTarget(target);
    const inRange = Number(target?.distance || Infinity) <= (afk ? attackRange : attackEngageRange);
    const actionKind = inRange ? 'attack' : 'seek-enemy';
    opportunities.push({
      type: 'enemy',
      id: target.user_id,
      distance: target.distance,
      staminaCost,
      score,
      actionKind,
      reason: '',
      priorityTier: priorityTier({ type: 'enemy', kind: actionKind, distance: target.distance }),
      sourceTarget: target
    });
  }
  return opportunities;
}

function buildOpportunityCandidatesCore(self, activeThreats, coinGroups, enemyTargets, routeCoin = null, options = {}) {
  return [
    ...buildCoinOpportunityCandidatesCore(self, coinGroups, activeThreats, routeCoin, options),
    ...buildEnemyOpportunityCandidatesCore(enemyTargets, options)
  ];
}

function bestCoinOpportunityScoreCore(self, coinGroups, activeThreats, routeCoin = null, options = {}) {
  const safeCoinCandidates = typeof options.safeCoinCandidates === 'function' ? options.safeCoinCandidates : (coins => coins || []);
  const coinStaminaAffordable = typeof options.coinStaminaAffordable === 'function' ? options.coinStaminaAffordable : () => true;
  const scoreCoinOpportunity = typeof options.scoreCoinOpportunity === 'function' ? options.scoreCoinOpportunity : coin => Number(coin?.opportunityScore ?? 0);
  let best = -Infinity;
  for (const { coins: groupCoins, maxDistance } of coinGroups || []) {
    for (const coin of safeCoinCandidates(groupCoins, activeThreats, maxDistance, self)) {
      if (!coinStaminaAffordable(coin)) continue;
      const score = scoreCoinOpportunity(coin);
      if (score > best) best = score;
    }
  }
  if (routeCoin) {
    const score = scoreCoinOpportunity(routeCoin);
    if (score > best) best = score;
  }
  return best;
}

module.exports = {
  opportunityEffectiveStaminaCostCore,
  opportunityValueScoreCore,
  opportunityPriorityTierCore,
  mergeCoinRouteDisplayCore,
  uniqueVisibleRouteCoinsCore,
  buildCoinOpportunityCandidatesCore,
  buildEnemyOpportunityCandidatesCore,
  buildOpportunityCandidatesCore,
  bestCoinOpportunityScoreCore
};
