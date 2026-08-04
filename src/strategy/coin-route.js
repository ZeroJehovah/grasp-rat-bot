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

function coinRouteFirstLegLaneCore(self, first, coin) {
  const sx = Number(self?.x);
  const sy = Number(self?.y);
  const fx = Number(first?.x);
  const fy = Number(first?.y);
  const cx = Number(coin?.x);
  const cy = Number(coin?.y);
  if (![sx, sy, fx, fy, cx, cy].every(Number.isFinite)) return null;
  const firstDx = fx - sx;
  const firstDy = fy - sy;
  const coinDx = cx - sx;
  const coinDy = cy - sy;
  const firstDistance = Math.hypot(firstDx, firstDy);
  const coinDistance = Math.hypot(coinDx, coinDy);
  if (!(firstDistance > 0) || !(coinDistance > 0)) return null;
  const dot = firstDx * coinDx + firstDy * coinDy;
  return {
    distance: coinDistance,
    projection: dot / firstDistance,
    laneDistance: Math.abs(firstDx * coinDy - firstDy * coinDx) / firstDistance,
    cos: dot / (firstDistance * coinDistance)
  };
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

function coinRouteActionMetaCore(route, fallbackFirstDistance = 0) {
  return route ? {
    ids: route.ids,
    points: Array.isArray(route.points) ? route.points : null,
    value: Number(route.value || 0),
    staminaCost: Math.round(Number(route.staminaCost || 0)),
    legCount: Number(route.legCount || 0),
    totalDistance: Math.round(Number(route.totalDistance || 0)),
    firstDistance: Math.round(Number(route.firstDistance || fallbackFirstDistance || 0)),
    kind: route.kind || ''
  } : null;
}

function buildCoinRouteFromAnchorCore(self, anchor, candidates, activeThreats, options = {}) {
  if (!self || !anchor) return null;
  const dist = typeof options.dist === 'function' ? options.dist : defaultDist;
  const routeKey = typeof options.routeKey === 'function' ? options.routeKey : coinRouteKey;
  const legClear = typeof options.legClear === 'function'
    ? options.legClear
    : (from, to) => coinRouteLegClearCore(from, to, activeThreats, options);
  const valueScore = typeof options.valueScore === 'function' ? options.valueScore : (value, cost) => cost > 0 ? value / cost : Infinity;
  const staminaAffordable = typeof options.staminaAffordable === 'function' ? options.staminaAffordable : () => true;
  const recordDiagnostic = typeof options.recordDiagnostic === 'function' ? options.recordDiagnostic : () => {};
  const firstStaminaCost = coinRouteLegStaminaCostCore(self, anchor, options);
  const firstDistance = dist(self, anchor);
  if (!staminaAffordable(firstStaminaCost)) {
    recordDiagnostic(anchor, 'route-stamina-unaffordable', { staminaCost: Math.round(firstStaminaCost) });
    return null;
  }
  const anchorKey = routeKey(anchor);
  const anchorAmount = Math.max(0, Number(anchor.amount || 0));
  const initialState = {
    route: [anchor],
    used: new Set([anchorKey]),
    current: anchor,
    totalValue: anchorAmount,
    totalStaminaCost: firstStaminaCost,
    totalDistance: firstDistance,
    rankScore: valueScore(anchorAmount, firstStaminaCost, options.coinOpportunityValue)
  };
  let states = [initialState];
  let bestState = null;
  let bestScore = -Infinity;
  const pointLimit = typeof options.pointLimitForAnchor === 'function'
    ? options.pointLimitForAnchor(anchor)
    : coinRoutePointLimitCore(anchor, candidates, options);
  const linkDistance = Math.max(0, Number(options.linkDistance || 0));
  const maxLinkDistance = Math.max(linkDistance, Number(options.maxLinkDistance || linkDistance || 0));
  const beamWidth = Math.max(1, Math.round(Number(options.beamWidth || 4)));
  const routeEligible = typeof options.routeEligible === 'function' ? options.routeEligible : () => true;
  let bestEligibleState = null;
  let bestEligibleScore = -Infinity;
  const stateSort = (a, b) => b.rankScore - a.rankScore
    || b.prefixScore - a.prefixScore
    || b.totalValue - a.totalValue
    || a.totalDistance - b.totalDistance;
  const bestStateBeats = (state, score) => score > bestScore
    || (score === bestScore && (!bestState
      || Number(state.totalValue || 0) > Number(bestState.totalValue || 0)
      || (Number(state.totalValue || 0) === Number(bestState.totalValue || 0)
        && Number(state.totalDistance || Infinity) < Number(bestState.totalDistance || Infinity))));

  while (states.length && states[0].route.length < pointLimit) {
    const expanded = [];
    for (const state of states) {
      for (const coin of candidates || []) {
        const coinKey = routeKey(coin);
        if (state.used.has(coinKey)) continue;
        const routeLegDistance = dist(state.current, coin);
        if (!Number.isFinite(routeLegDistance) || routeLegDistance > maxLinkDistance) continue;
        if (!legClear(state.current, coin)) continue;
        const legCost = coinRouteLegStaminaCostCore(state.current, coin, options);
        const linkPenalty = linkDistance > 0 && routeLegDistance > linkDistance ? 0.85 : 1;
        const nextStaminaCost = state.totalStaminaCost + legCost;
        if (!staminaAffordable(nextStaminaCost)) {
          recordDiagnostic(coin, 'route-stamina-unaffordable', { staminaCost: Math.round(nextStaminaCost) });
          continue;
        }
        const nextValue = state.totalValue + Math.max(0, Number(coin.amount || 0));
        const nextDistance = state.totalDistance + routeLegDistance;
        const prefixScore = valueScore(nextValue, nextStaminaCost, options.coinOpportunityValue);
        if (!Number.isFinite(prefixScore)) continue;
        const nextUsed = new Set(state.used);
        nextUsed.add(coinKey);
        const nextState = {
          route: state.route.concat([coin]),
          used: nextUsed,
          current: coin,
          totalValue: nextValue,
          totalStaminaCost: nextStaminaCost,
          totalDistance: nextDistance,
          prefixScore,
          rankScore: prefixScore * linkPenalty
        };
        expanded.push(nextState);
        if (nextState.route.length >= 3 && bestStateBeats(nextState, prefixScore)) {
          bestScore = prefixScore;
          bestState = nextState;
        }
        if (nextState.route.length >= 3 && routeEligible({
          route: nextState.route,
          value: nextValue,
          totalValue: nextValue,
          staminaCost: nextStaminaCost,
          totalStaminaCost: nextStaminaCost,
          totalDistance: nextDistance,
          legCount: nextState.route.length,
          score: prefixScore,
          first: anchor
        })) {
          const eligibleScore = Number(prefixScore);
          if (!bestEligibleState
            || eligibleScore > bestEligibleScore
            || (eligibleScore === bestEligibleScore
              && (Number(nextState.totalValue || 0) > Number(bestEligibleState.totalValue || 0)
                || (Number(nextState.totalValue || 0) === Number(bestEligibleState.totalValue || 0)
                  && Number(nextState.totalDistance || Infinity) < Number(bestEligibleState.totalDistance || Infinity))))) {
            bestEligibleState = nextState;
            bestEligibleScore = eligibleScore;
          }
        }
      }
    }
    if (!expanded.length) break;
    states = expanded.sort(stateSort).slice(0, beamWidth);
  }
  if (!bestState) return null;
  const selectedState = bestEligibleState || bestState;
  const bestRoute = selectedState.route;
  const summary = {
    totalValue: selectedState.totalValue,
    totalStaminaCost: selectedState.totalStaminaCost,
    totalDistance: selectedState.totalDistance
  };
  if (!staminaAffordable(summary.totalStaminaCost)) {
    recordDiagnostic(bestRoute[0], 'route-stamina-unaffordable', { staminaCost: Math.round(summary.totalStaminaCost) });
    return null;
  }
  const score = valueScore(summary.totalValue, summary.totalStaminaCost, options.coinOpportunityValue);
  if (!Number.isFinite(score)) return null;
  const first = bestRoute[0];
  const routeFirstDistance = dist(self, first);
  const routeKind = bestRoute.length >= Number(options.maxPointsDense || 6) ? 'dense' : (bestRoute.length >= 4 ? 'cluster' : 'short');
  return {
    ...first,
    distance: routeFirstDistance,
    amount: first.amount,
    route: true,
    coinRoute: {
      ids: bestRoute.map(coinRouteKey),
      points: coinRoutePoints(bestRoute),
      value: summary.totalValue,
      staminaCost: summary.totalStaminaCost,
      legCount: bestRoute.length,
      totalDistance: summary.totalDistance,
      firstDistance: routeFirstDistance,
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
    .filter(coin => typeof options.closerCoinEligible !== 'function' || options.closerCoinEligible(coin))
    .map(coin => ({ ...coin, distance: Number.isFinite(Number(coin.distance)) ? Number(coin.distance) : dist(self, coin) }))
    .filter(coin => Number.isFinite(coin.distance) && coin.distance <= nearbyLimit)
    .sort((a, b) => a.distance - b.distance || Number(b.amount || 0) - Number(a.amount || 0))[0] || null;
  if (!nearest) return false;
  const ratio = Math.max(1, Number(options.firstCoinDistanceRatio || 1));
  const slack = Math.max(0, Number(options.firstCoinDistanceSlack || 0));
  const allowedFirstDistance = Math.max(Number(nearest.distance || 0) * ratio, Number(nearest.distance || 0) + slack);
  return firstDistance > allowedFirstDistance;
}

function coinRouteSkipsCloserRoutePointCore(self, route, options = {}) {
  if (!self || !route?.coinRoute) return false;
  const dist = typeof options.dist === 'function' ? options.dist : defaultDist;
  const firstDistance = Number(route.distance ?? route.coinRoute?.firstDistance ?? Infinity);
  if (!Number.isFinite(firstDistance)) return false;
  const points = Array.isArray(route.coinRoute.points) ? route.coinRoute.points : [];
  if (points.length < 2) return false;
  const firstPoint = { x: route.x, y: route.y };
  const firstKey = coinRouteKey(route);
  const ratio = Math.max(1, Number(options.firstRoutePointDistanceRatio ?? 1.15));
  const slack = Math.max(0, Number(options.firstRoutePointDistanceSlack ?? 2500));
  const cosMin = Math.max(-1, Math.min(1, Number(options.firstRoutePointCosMin ?? 0.9)));
  const laneRadius = Math.max(0, Number(options.firstRoutePointLaneRadius ?? Math.max(3000, slack)));
  for (const point of points) {
    if (!point || coinRouteKey(point) === firstKey) continue;
    const lane = coinRouteFirstLegLaneCore(self, firstPoint, point);
    if (!lane || !(lane.distance < firstDistance)) continue;
    if (!(lane.projection > 0) || lane.cos < cosMin || lane.laneDistance > laneRadius) continue;
    const pointDistance = Number.isFinite(Number(point.distance)) ? Number(point.distance) : dist(self, point);
    if (!Number.isFinite(pointDistance)) continue;
    const allowedFirstDistance = Math.max(pointDistance * ratio, pointDistance + slack);
    if (firstDistance > allowedFirstDistance) return true;
  }
  return false;
}

function coinRouteSkipsHeldSingleCoinCore(self, route, choice, options = {}) {
  const choiceType = typeof options.choiceType === 'function' ? options.choiceType : value => String(value?.type || '');
  const choiceIdFrom = typeof options.choiceId === 'function' ? options.choiceId : value => String(value?.id ?? '');
  if (!self || !route || !choice || choiceType(choice) !== 'coin') return false;
  if (String(choice.reason || '') === 'best-opportunity-coin-route' || coinRouteIdsFrom(choice).length) return false;
  if (typeof options.heldCoinEligible === 'function' && !options.heldCoinEligible(choice)) return false;
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

function closerCoinRouteForFirstTargetCore(route, routes, options = {}) {
  if (!route || !Array.isArray(routes) || routes.length < 2) return null;
  const firstDistance = Number(route.distance ?? route.coinRoute?.firstDistance ?? Infinity);
  const score = Number(route.opportunityScore || -Infinity);
  if (!Number.isFinite(firstDistance) || !Number.isFinite(score)) return null;
  const nearbyLimit = Math.max(0, Number(options.nearbyFirstRouteDistance || options.nearbyFirstCoinDistance || 0));
  const ratio = Math.max(1, Number(options.firstRouteDistanceRatio ?? 1.25));
  const slack = Math.max(0, Number(options.firstRouteDistanceSlack ?? 3000));
  const margin = Math.max(0, Number(options.switchMargin ?? options.opportunitySwitchMargin) || 0);
  const relativeMargin = Math.max(0, Number(options.switchRelativeMargin ?? options.opportunitySwitchRelativeMargin) || 0);
  const firstKey = coinRouteKey(route);
  return routes
    .filter(candidate => candidate && coinRouteKey(candidate) !== firstKey)
    .map(candidate => ({
      route: candidate,
      distance: Number(candidate.distance ?? candidate.coinRoute?.firstDistance ?? Infinity),
      score: Number(candidate.opportunityScore || -Infinity)
    }))
    .filter(candidate => Number.isFinite(candidate.distance) && Number.isFinite(candidate.score))
    .filter(candidate => candidate.distance < firstDistance)
    .filter(candidate => !(nearbyLimit > 0) || candidate.distance <= nearbyLimit)
    .filter(candidate => firstDistance > Math.max(candidate.distance * ratio, candidate.distance + slack))
    .filter(candidate => {
      const requiredScore = Math.max(candidate.score + margin, candidate.score * (1 + relativeMargin));
      return score <= requiredScore;
    })
    .sort((a, b) => a.distance - b.distance || b.score - a.score)[0]?.route || null;
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
  const baseDist = typeof options.dist === 'function' ? options.dist : defaultDist;
  const routeKeyCache = new WeakMap();
  const routeKey = value => {
    if (!value || typeof value !== 'object') return coinRouteKey(value);
    if (routeKeyCache.has(value)) return routeKeyCache.get(value);
    const key = coinRouteKey(value);
    routeKeyCache.set(value, key);
    return key;
  };
  const distanceCache = new WeakMap();
  const dist = (from, to) => {
    if (!from || !to || typeof from !== 'object' || typeof to !== 'object') return baseDist(from, to);
    let fromCache = distanceCache.get(from);
    if (!fromCache) {
      fromCache = new WeakMap();
      distanceCache.set(from, fromCache);
    }
    if (fromCache.has(to)) return fromCache.get(to);
    const distance = baseDist(from, to);
    fromCache.set(to, distance);
    let toCache = distanceCache.get(to);
    if (!toCache) {
      toCache = new WeakMap();
      distanceCache.set(to, toCache);
    }
    toCache.set(from, distance);
    return distance;
  };
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
  const legClearOptions = { ...options, dist };
  const legClearCache = new WeakMap();
  const legClear = (from, to) => {
    let fromCache = legClearCache.get(from);
    if (!fromCache) {
      fromCache = new WeakMap();
      legClearCache.set(from, fromCache);
    }
    if (fromCache.has(to)) return fromCache.get(to);
    const clear = coinRouteLegClearCore(from, to, activeThreats, legClearOptions);
    fromCache.set(to, clear);
    return clear;
  };
  const clusterRadius = Math.max(0, Number(options.clusterRadius || 0));
  const clusterCounts = new WeakMap(candidates.map(coin => [coin, 0]));
  for (let left = 0; left < candidates.length; left += 1) {
    clusterCounts.set(candidates[left], Number(clusterCounts.get(candidates[left]) || 0) + 1);
    for (let right = left + 1; right < candidates.length; right += 1) {
      if (dist(candidates[left], candidates[right]) > clusterRadius) continue;
      clusterCounts.set(candidates[left], Number(clusterCounts.get(candidates[left]) || 0) + 1);
      clusterCounts.set(candidates[right], Number(clusterCounts.get(candidates[right]) || 0) + 1);
    }
  }
  const pointLimitForAnchor = anchor => {
    const count = Number(clusterCounts.get(anchor) || 0);
    if (count >= 5) return Math.max(2, Number(options.maxPointsDense || 6));
    if (count >= 3) return Math.max(2, Number(options.maxPointsMid || 4));
    return Math.max(3, Number(options.maxPointsSparse || 2));
  };
  const routeOptions = { ...options, dist, routeKey, legClear, pointLimitForAnchor };
  const anchors = [];
  const addAnchor = coin => {
    if (!coin) return;
    const key = routeKey(coin);
    if (!anchors.some(item => routeKey(item) === key)) anchors.push(coin);
  };
  const heldChoice = options.heldChoice || null;
  const heldRouteChoice = options.heldRouteChoice || null;
  const heldAnchor = heldChoice ? candidates.find(coin => coinRouteKey(coin) === choiceId(heldChoice)) : null;
  if (heldAnchor) addAnchor(heldAnchor);
  candidates.slice(0, Math.max(1, Number(options.anchorLimit || 22))).forEach(addAnchor);
  candidates.slice().sort((a, b) => Number(a.distance || Infinity) - Number(b.distance || Infinity)).slice(0, 8).forEach(addAnchor);
  candidates.slice().sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0) || Number(a.distance || Infinity) - Number(b.distance || Infinity)).slice(0, 8).forEach(addAnchor);
  candidates.slice().sort((a, b) => {
    const aCount = Number(clusterCounts.get(a) || 0);
    const bCount = Number(clusterCounts.get(b) || 0);
    return bCount - aCount || Number(a.distance || Infinity) - Number(b.distance || Infinity);
  }).slice(0, 8).forEach(addAnchor);
  let best = null;
  let bestEligible = null;
  let heldRoute = null;
  let heldRouteEligible = null;
  const viableRoutes = [];
  for (const anchor of anchors.slice(0, Math.max(1, Number(options.anchorLimit || 22)))) {
    if (!legClear(self, anchor)) continue;
    const route = buildCoinRouteFromAnchorCore(self, anchor, candidates, activeThreats, routeOptions);
    if (!route) continue;
    if (coinRouteSkipsCloserFirstCoinCore(self, route, candidates, routeOptions)) continue;
    if (coinRouteSkipsCloserRoutePointCore(self, route, routeOptions)) continue;
    if (coinRouteSkipsHeldSingleCoinCore(self, route, heldChoice, routeOptions)) continue;
    viableRoutes.push(route);
    const routeEligible = typeof options.routeEligible === 'function'
      ? Boolean(options.routeEligible(route))
      : true;
    if (coinRouteMatchesHeldChoiceCore(route, heldRouteChoice || heldChoice, options)) {
      heldRoute = route;
      if (routeEligible) heldRouteEligible = route;
    }
    const score = Number(route.opportunityScore || -Infinity);
    if (!best
      || score > Number(best.opportunityScore || -Infinity)
      || (score === Number(best.opportunityScore || -Infinity) && Number(route.routeValue || 0) > Number(best.routeValue || 0))
      || (score === Number(best.opportunityScore || -Infinity) && Number(route.distance || Infinity) < Number(best.distance || Infinity))) {
      best = route;
    }
    if (routeEligible && (!bestEligible
      || score > Number(bestEligible.opportunityScore || -Infinity)
      || (score === Number(bestEligible.opportunityScore || -Infinity) && Number(route.routeValue || 0) > Number(bestEligible.routeValue || 0))
      || (score === Number(bestEligible.opportunityScore || -Infinity)
        && Number(route.routeValue || 0) === Number(bestEligible.routeValue || 0)
        && Number(route.distance || Infinity) < Number(bestEligible.distance || Infinity)))) {
      bestEligible = route;
    }
  }
  const selectedBest = bestEligible || best;
  const selectedRoutes = bestEligible
    ? viableRoutes.filter(route => typeof options.routeEligible !== 'function' || options.routeEligible(route))
    : viableRoutes;
  const selectedHeldRoute = bestEligible ? heldRouteEligible : heldRoute;
  const closerRoute = closerCoinRouteForFirstTargetCore(selectedBest, selectedRoutes, routeOptions);
  if (closerRoute) {
    if (selectedHeldRoute && coinRouteKey(selectedHeldRoute) === coinRouteKey(closerRoute)) {
      return {
        ...closerRoute,
        routeHeld: true,
        competingRouteScore: selectedBest ? Number(selectedBest.opportunityScore || 0) : null
      };
    }
    return closerRoute;
  }
  if (heldCoinRouteBeatsSwitchCore(selectedHeldRoute, selectedBest, routeOptions)) {
    return {
      ...selectedHeldRoute,
      routeHeld: true,
      competingRouteScore: selectedBest ? Number(selectedBest.opportunityScore || 0) : null
    };
  }
  return selectedBest;
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
  coinRouteActionMetaCore,
  buildCoinRouteFromAnchorCore,
  coinRouteSkipsCloserFirstCoinCore,
  coinRouteSkipsCloserRoutePointCore,
  coinRouteSkipsHeldSingleCoinCore,
  closerCoinRouteForFirstTargetCore,
  coinRouteMatchesHeldChoiceCore,
  heldCoinRouteBeatsSwitchCore,
  pickCoinRouteOpportunityCore
};
