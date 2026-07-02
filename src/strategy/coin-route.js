'use strict';

function defaultDist(a, b) {
  const dx = Number(a?.x) - Number(b?.x);
  const dy = Number(a?.y) - Number(b?.y);
  return Number.isFinite(dx) && Number.isFinite(dy) ? Math.hypot(dx, dy) : Infinity;
}

function coinRouteKey(coin) {
  const id = coin?.drop_id ?? coin?.id;
  if (id !== undefined && id !== null && id !== '') return String(id);
  return [Math.round(Number(coin?.x || 0)), Math.round(Number(coin?.y || 0)), Math.round(Number(coin?.amount || 0))].join(':');
}

function coinRouteIdsFrom(value) {
  const ids = Array.isArray(value?.coinRoute?.ids) ? value.coinRoute.ids : (Array.isArray(value?.routeIds) ? value.routeIds : value?.coinRouteIds);
  return Array.isArray(ids) ? ids.map(id => String(id)).filter(Boolean) : [];
}

function coinRouteLegStaminaCostCore(from, to, options = {}) {
  const dist = typeof options.dist === 'function' ? options.dist : defaultDist;
  const moveStaminaCost = typeof options.moveStaminaCost === 'function' ? options.moveStaminaCost : distance => Math.max(0, Number(distance || 0));
  return moveStaminaCost(dist(from, to), 0)
    + Math.max(0, Number(options.pickupStaminaMs || 0));
}

function coinRouteLegClearCore(from, to, activeThreats, options = {}) {
  if (!from || !to) return false;
  const dist = typeof options.dist === 'function' ? options.dist : defaultDist;
  const threatDangerRadius = typeof options.threatDangerRadius === 'function' ? options.threatDangerRadius : () => 0;
  const coinBlockedByThreat = typeof options.coinBlockedByThreat === 'function' ? options.coinBlockedByThreat : () => false;
  const distance = dist(from, to);
  if (!Number.isFinite(distance)) return false;
  const sampleDistance = Math.max(1, Number(options.sampleDistance || 10000));
  const steps = Math.max(1, Math.ceil(distance / sampleDistance));
  for (let i = 1; i <= steps; i += 1) {
    const ratio = i / steps;
    const point = {
      x: Number(from.x) + (Number(to.x) - Number(from.x)) * ratio,
      y: Number(from.y) + (Number(to.y) - Number(from.y)) * ratio,
      drop_id: to.drop_id,
      amount: to.amount
    };
    for (const rawThreat of activeThreats || []) {
      if (dist(point, rawThreat) <= threatDangerRadius(rawThreat)) return false;
      const threat = { ...rawThreat, distance: dist(from, rawThreat) };
      if (coinBlockedByThreat(from, point, threat)) return false;
    }
  }
  return true;
}

function coinRoutePointLimitCore(anchor, candidates, options = {}) {
  const dist = typeof options.dist === 'function' ? options.dist : defaultDist;
  const radius = Math.max(0, Number(options.clusterRadius || 0));
  const clusterCount = (candidates || []).filter(coin => dist(anchor, coin) <= radius).length;
  if (clusterCount >= 5) return Math.max(2, Number(options.maxPointsDense || 6));
  if (clusterCount >= 3) return Math.max(2, Number(options.maxPointsMid || 4));
  return Math.max(3, Number(options.maxPointsSparse || 2));
}

function coinRouteSummaryCore(route, self, options = {}) {
  const dist = typeof options.dist === 'function' ? options.dist : defaultDist;
  const moveStaminaCost = typeof options.moveStaminaCost === 'function' ? options.moveStaminaCost : distance => Math.max(0, Number(distance || 0));
  let totalValue = 0;
  let totalStaminaCost = 0;
  let totalDistance = 0;
  let previous = self;
  for (const coin of route || []) {
    const legDistance = dist(previous, coin);
    totalDistance += legDistance;
    totalValue += Math.max(0, Number(coin.amount || 0));
    totalStaminaCost += moveStaminaCost(legDistance, 0)
      + Math.max(0, Number(options.pickupStaminaMs || 0));
    previous = coin;
  }
  return { totalValue, totalStaminaCost, totalDistance };
}

function coinRoutePoints(route) {
  return (route || [])
    .map((coin, index) => ({
      id: coinRouteKey(coin),
      x: Number(coin?.x),
      y: Number(coin?.y),
      amount: Number(coin?.amount || 0),
      order: index + 1
    }))
    .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
}

function buildCoinRouteFromAnchorCore(self, anchor, candidates, activeThreats, options = {}) {
  if (!self || !anchor) return null;
  const dist = typeof options.dist === 'function' ? options.dist : defaultDist;
  const valueScore = typeof options.valueScore === 'function' ? options.valueScore : (value, cost) => cost > 0 ? value / cost : Infinity;
  const staminaAffordable = typeof options.staminaAffordable === 'function' ? options.staminaAffordable : () => true;
  const recordDiagnostic = typeof options.recordDiagnostic === 'function' ? options.recordDiagnostic : () => {};
  const route = [anchor];
  const used = new Set([coinRouteKey(anchor)]);
  let current = anchor;
  let currentStaminaCost = coinRouteLegStaminaCostCore(self, anchor, options);
  let bestRoute = null;
  let bestScore = -Infinity;
  if (!staminaAffordable(currentStaminaCost)) {
    recordDiagnostic(anchor, 'route-stamina-unaffordable', { staminaCost: Math.round(currentStaminaCost) });
    return null;
  }
  const pointLimit = coinRoutePointLimitCore(anchor, candidates, options);
  const linkDistance = Math.max(0, Number(options.linkDistance || 0));
  const maxLinkDistance = Math.max(linkDistance, Number(options.maxLinkDistance || linkDistance || 0));
  while (route.length < pointLimit) {
    const next = (candidates || [])
      .filter(coin => !used.has(coinRouteKey(coin)))
      .map(coin => ({ ...coin, routeLegDistance: dist(current, coin) }))
      .filter(coin => Number.isFinite(coin.routeLegDistance) && coin.routeLegDistance <= maxLinkDistance)
      .filter(coin => coinRouteLegClearCore(current, coin, activeThreats, options))
      .map(coin => {
        const legCost = coinRouteLegStaminaCostCore(current, coin, options);
        const linkPenalty = linkDistance > 0 && coin.routeLegDistance > linkDistance ? 0.85 : 1;
        return {
          coin,
          legCost,
          score: valueScore(coin.amount, legCost, options.coinOpportunityValue) * linkPenalty
        };
      })
      .filter(item => Number.isFinite(item.score))
      .sort((a, b) => b.score - a.score || Number(b.coin.amount || 0) - Number(a.coin.amount || 0) || a.coin.routeLegDistance - b.coin.routeLegDistance)[0] || null;
    if (!next) break;
    if (!staminaAffordable(currentStaminaCost + next.legCost)) {
      recordDiagnostic(next.coin, 'route-stamina-unaffordable', { staminaCost: Math.round(currentStaminaCost + next.legCost) });
      break;
    }
    route.push(next.coin);
    used.add(coinRouteKey(next.coin));
    current = next.coin;
    currentStaminaCost += next.legCost;
    if (route.length >= 3) {
      const prefixSummary = coinRouteSummaryCore(route, self, options);
      const prefixScore = valueScore(prefixSummary.totalValue, prefixSummary.totalStaminaCost, options.coinOpportunityValue);
      if (Number.isFinite(prefixScore) && prefixScore > bestScore) {
        bestScore = prefixScore;
        bestRoute = route.slice();
      }
    }
  }
  if (!bestRoute) return null;
  const summary = coinRouteSummaryCore(bestRoute, self, options);
  if (!staminaAffordable(summary.totalStaminaCost)) {
    recordDiagnostic(bestRoute[0], 'route-stamina-unaffordable', { staminaCost: Math.round(summary.totalStaminaCost) });
    return null;
  }
  const score = valueScore(summary.totalValue, summary.totalStaminaCost, options.coinOpportunityValue);
  if (!Number.isFinite(score)) return null;
  const first = bestRoute[0];
  const firstDistance = dist(self, first);
  const routeKind = bestRoute.length >= Number(options.maxPointsDense || 6) ? 'dense' : (bestRoute.length >= 4 ? 'cluster' : 'short');
  return {
    ...first,
    distance: firstDistance,
    amount: first.amount,
    route: true,
    coinRoute: {
      ids: bestRoute.map(coinRouteKey),
      points: coinRoutePoints(bestRoute),
      value: summary.totalValue,
      staminaCost: summary.totalStaminaCost,
      legCount: bestRoute.length,
      totalDistance: summary.totalDistance,
      firstDistance,
      kind: routeKind,
      score
    },
    routeIds: bestRoute.map(coinRouteKey),
    routeValue: summary.totalValue,
    routeKind,
    routeLegs: bestRoute.length,
    opportunityScore: score,
    opportunityStaminaCost: summary.totalStaminaCost
  };
}

function coinRouteSkipsCloserFirstCoinCore(self, route, candidates, options = {}) {
  if (!self || !route) return false;
  const dist = typeof options.dist === 'function' ? options.dist : defaultDist;
  const firstDistance = Number(route.distance ?? route.coinRoute?.firstDistance ?? Infinity);
  if (!Number.isFinite(firstDistance)) return false;
  const nearbyLimit = Math.max(0, Number(options.nearbyFirstCoinDistance || 0));
  if (!(nearbyLimit > 0)) return false;
  const firstKey = coinRouteKey(route);
  const nearest = (candidates || [])
    .filter(coin => coinRouteKey(coin) !== firstKey)
    .map(coin => ({ ...coin, distance: Number.isFinite(Number(coin.distance)) ? Number(coin.distance) : dist(self, coin) }))
    .filter(coin => Number.isFinite(coin.distance) && coin.distance <= nearbyLimit)
    .sort((a, b) => a.distance - b.distance || Number(b.amount || 0) - Number(a.amount || 0))[0] || null;
  if (!nearest) return false;
  const ratio = Math.max(1, Number(options.firstCoinDistanceRatio || 1));
  const slack = Math.max(0, Number(options.firstCoinDistanceSlack || 0));
  const allowedFirstDistance = Math.max(Number(nearest.distance || 0) * ratio, Number(nearest.distance || 0) + slack);
  return firstDistance > allowedFirstDistance;
}

function coinRouteSkipsHeldSingleCoinCore(self, route, choice, options = {}) {
  const choiceType = typeof options.choiceType === 'function' ? options.choiceType : value => String(value?.type || '');
  const choiceIdFrom = typeof options.choiceId === 'function' ? options.choiceId : value => String(value?.id ?? '');
  if (!self || !route || !choice || choiceType(choice) !== 'coin') return false;
  if (String(choice.reason || '') === 'best-opportunity-coin-route' || coinRouteIdsFrom(choice).length) return false;
  const choiceId = choiceIdFrom(choice);
  if (!choiceId && choiceId !== '0') return false;
  if (coinRouteKey(route) === String(choiceId)) return false;
  const dist = typeof options.dist === 'function' ? options.dist : defaultDist;
  let heldDistance = Number(choice.distance);
  if (!Number.isFinite(heldDistance)) {
    const x = Number(choice.x);
    const y = Number(choice.y);
    if (Number.isFinite(x) && Number.isFinite(y)) heldDistance = dist(self, { x, y });
  }
  const routeDistance = Number(route.distance ?? route.coinRoute?.firstDistance ?? Infinity);
  if (!Number.isFinite(heldDistance) || !Number.isFinite(routeDistance)) return false;
  const nearbyLimit = Math.max(0, Number(options.nearbyFirstCoinDistance || 0));
  if (!(nearbyLimit > 0) || heldDistance > nearbyLimit) return false;
  const ratio = Math.max(1, Number(options.firstCoinDistanceRatio || 1));
  const slack = Math.max(0, Number(options.firstCoinDistanceSlack || 0));
  const allowedFirstDistance = Math.max(heldDistance * ratio, heldDistance + slack);
  return routeDistance > allowedFirstDistance;
}

function coinRouteMatchesHeldChoiceCore(route, choice, options = {}) {
  if (!route || !choice) return false;
  const firstKey = coinRouteKey(route);
  const choiceIdFrom = typeof options.choiceId === 'function' ? options.choiceId : value => String(value?.id ?? '');
  const choiceId = choiceIdFrom(choice);
  if (!choiceId || String(firstKey) !== String(choiceId)) return false;
  const previousIds = coinRouteIdsFrom(choice);
  if (!previousIds.length) return true;
  const routeIds = coinRouteIdsFrom(route);
  const previousSet = new Set(previousIds);
  const overlap = routeIds.reduce((count, id) => count + (previousSet.has(String(id)) ? 1 : 0), 0);
  const minOverlap = Math.max(1, Math.min(previousIds.length, Math.max(1, Number(options.heldMinOverlap || 2))));
  return overlap >= minOverlap;
}

function heldCoinRouteBeatsSwitchCore(heldRoute, bestRoute, options = {}) {
  if (!heldRoute) return false;
  if (!bestRoute) return true;
  if (coinRouteKey(heldRoute) === coinRouteKey(bestRoute)) return false;
  const heldScore = Number(heldRoute.opportunityScore || -Infinity);
  const bestScore = Number(bestRoute.opportunityScore || -Infinity);
  if (!Number.isFinite(heldScore) || !Number.isFinite(bestScore)) return false;
  const margin = Math.max(0, Number(options.switchMargin ?? options.opportunitySwitchMargin) || 0);
  const relativeMargin = Math.max(0, Number(options.switchRelativeMargin ?? options.opportunitySwitchRelativeMargin) || 0);
  const requiredScore = Math.max(heldScore + margin, heldScore * (1 + relativeMargin));
  return bestScore <= requiredScore;
}

function pickCoinRouteOpportunityCore(self, coins, activeThreats, options = {}) {
  if (!self) return null;
  const dist = typeof options.dist === 'function' ? options.dist : defaultDist;
  const safeCoinCandidates = typeof options.safeCoinCandidates === 'function' ? options.safeCoinCandidates : value => value || [];
  const isSnapshotOnlyCoin = typeof options.isSnapshotOnlyCoin === 'function' ? options.isSnapshotOnlyCoin : () => false;
  const choiceId = typeof options.choiceId === 'function' ? options.choiceId : choice => String(choice?.id ?? '');
  const maxDistance = Math.max(0, Number(options.maxDistance || 0));
  if (!(maxDistance > 0)) return null;
  const poolLimit = Math.max(2, Number(options.poolLimit || 72));
  const candidates = safeCoinCandidates((coins || []).filter(coin => !isSnapshotOnlyCoin(coin)), activeThreats, maxDistance, self)
    .filter(coin => Number(coin.amount || 0) > 0)
    .slice(0, poolLimit);
  if (candidates.length < 2) return null;
  const anchors = [];
  const addAnchor = coin => {
    if (!coin) return;
    const key = coinRouteKey(coin);
    if (!anchors.some(item => coinRouteKey(item) === key)) anchors.push(coin);
  };
  const heldChoice = options.heldChoice || null;
  const heldRouteChoice = options.heldRouteChoice || null;
  const heldAnchor = heldChoice ? candidates.find(coin => coinRouteKey(coin) === choiceId(heldChoice)) : null;
  if (heldAnchor) addAnchor(heldAnchor);
  candidates.slice(0, Math.max(1, Number(options.anchorLimit || 22))).forEach(addAnchor);
  candidates.slice().sort((a, b) => Number(a.distance || Infinity) - Number(b.distance || Infinity)).slice(0, 8).forEach(addAnchor);
  candidates.slice().sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0) || Number(a.distance || Infinity) - Number(b.distance || Infinity)).slice(0, 8).forEach(addAnchor);
  const clusterRadius = Math.max(0, Number(options.clusterRadius || 0));
  candidates.slice().sort((a, b) => {
    const aCount = candidates.filter(coin => dist(a, coin) <= clusterRadius).length;
    const bCount = candidates.filter(coin => dist(b, coin) <= clusterRadius).length;
    return bCount - aCount || Number(a.distance || Infinity) - Number(b.distance || Infinity);
  }).slice(0, 8).forEach(addAnchor);
  let best = null;
  let heldRoute = null;
  for (const anchor of anchors.slice(0, Math.max(1, Number(options.anchorLimit || 22)))) {
    if (!coinRouteLegClearCore(self, anchor, activeThreats, options)) continue;
    const route = buildCoinRouteFromAnchorCore(self, anchor, candidates, activeThreats, options);
    if (!route) continue;
    if (coinRouteSkipsCloserFirstCoinCore(self, route, candidates, options)) continue;
    if (coinRouteSkipsHeldSingleCoinCore(self, route, heldChoice, options)) continue;
    if (coinRouteMatchesHeldChoiceCore(route, heldRouteChoice || heldChoice, options)) heldRoute = route;
    const score = Number(route.opportunityScore || -Infinity);
    if (!best
      || score > Number(best.opportunityScore || -Infinity)
      || (score === Number(best.opportunityScore || -Infinity) && Number(route.routeValue || 0) > Number(best.routeValue || 0))
      || (score === Number(best.opportunityScore || -Infinity) && Number(route.distance || Infinity) < Number(best.distance || Infinity))) {
      best = route;
    }
  }
  if (heldCoinRouteBeatsSwitchCore(heldRoute, best, options)) {
    return {
      ...heldRoute,
      routeHeld: true,
      competingRouteScore: best ? Number(best.opportunityScore || 0) : null
    };
  }
  return best;
}

module.exports = {
  defaultDist,
  coinRouteKey,
  coinRouteIdsFrom,
  coinRouteLegStaminaCostCore,
  coinRouteLegClearCore,
  coinRoutePointLimitCore,
  coinRouteSummaryCore,
  coinRoutePoints,
  buildCoinRouteFromAnchorCore,
  coinRouteSkipsCloserFirstCoinCore,
  coinRouteSkipsHeldSingleCoinCore,
  coinRouteMatchesHeldChoiceCore,
  heldCoinRouteBeatsSwitchCore,
  pickCoinRouteOpportunityCore
};
