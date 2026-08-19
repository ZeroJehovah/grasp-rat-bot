'use strict';

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function pointDistance(a, b) {
  const ax = finiteNumber(a?.x);
  const ay = finiteNumber(a?.y);
  const bx = finiteNumber(b?.x);
  const by = finiteNumber(b?.y);
  if (ax === null || ay === null || bx === null || by === null) return Infinity;
  return Math.hypot(ax - bx, ay - by);
}

function entityKey(entity) {
  const value = entity?.user_id ?? entity?.userId ?? entity?.entity_id ?? entity?.entityId ?? entity?.id;
  return value === null || value === undefined || value === '' ? '' : String(value);
}

function entityName(entity) {
  return String(entity?.name || entity?.label || entity?.username || '').trim();
}

function activeCoinCompetitorHeadingCore(competitor, coin, options = {}) {
  const vx = finiteNumber(competitor?.vx) ?? 0;
  const vy = finiteNumber(competitor?.vy) ?? 0;
  const speed = Math.hypot(vx, vy);
  const minSpeed = Math.max(0, Number(options.movingSpeedMin ?? 5) || 0);
  if (!(speed >= minSpeed)) return { speed, headingCos: null, headingToCoin: false };
  const toCoinX = Number(coin?.x) - Number(competitor?.x);
  const toCoinY = Number(coin?.y) - Number(competitor?.y);
  const toCoinDistance = Math.hypot(toCoinX, toCoinY);
  if (!(toCoinDistance > 0)) return { speed, headingCos: 1, headingToCoin: true };
  const headingCos = (vx * toCoinX + vy * toCoinY) / (speed * toCoinDistance);
  const headingCosMin = Math.max(-1, Math.min(1, Number(options.headingCosMin ?? 0.35)));
  return {
    speed,
    headingCos,
    headingToCoin: headingCos >= headingCosMin
  };
}

function activeCoinCompetitionCore(self, coin, competitors = [], options = {}) {
  if (!self || !coin) return null;
  const selfId = entityKey(self);
  const selfDistance = finiteNumber(coin?.distance) ?? pointDistance(self, coin);
  const minSelfDistance = Math.max(0, Number(options.minSelfDistanceCm ?? 18000) || 0);
  if (!Number.isFinite(selfDistance) || selfDistance <= minSelfDistance) return null;

  const nearCoinDistance = Math.max(0, Number(options.nearCoinDistanceCm ?? 8000) || 0);
  const minLeadDistance = Math.max(0, Number(options.minLeadDistanceCm ?? 4000) || 0);
  const uncertainLeadDistance = Math.max(minLeadDistance, Number(options.uncertainLeadDistanceCm ?? 12000) || 0);
  let best = null;

  for (const competitor of competitors || []) {
    if (!competitor || competitor.active !== true || competitor.alive === false) continue;
    const competitorId = entityKey(competitor);
    if (selfId && competitorId && competitorId === selfId) continue;
    const competitorDistance = pointDistance(competitor, coin);
    if (!Number.isFinite(competitorDistance)) continue;
    const distanceLead = selfDistance - competitorDistance;
    if (!(distanceLead >= minLeadDistance)) continue;

    const heading = activeCoinCompetitorHeadingCore(competitor, coin, options);
    const nearCoin = competitorDistance <= nearCoinDistance;
    let reason = '';
    let requiredLeadDistance = minLeadDistance;
    if (nearCoin) {
      reason = 'active-player-near-coin';
    } else if (heading.headingToCoin) {
      reason = 'active-player-heading-to-coin';
    } else if (distanceLead >= uncertainLeadDistance) {
      reason = 'active-player-large-distance-lead';
      requiredLeadDistance = uncertainLeadDistance;
    }
    if (!reason) continue;

    const candidate = {
      reason,
      coinId: entityKey({ id: coin?.drop_id ?? coin?.id }),
      coinAmount: Math.max(0, Number(coin?.amount || 0)),
      selfDistanceCm: Math.round(selfDistance),
      competitorId,
      competitorName: entityName(competitor),
      competitorDistanceCm: Math.round(competitorDistance),
      distanceLeadCm: Math.round(distanceLead),
      requiredLeadDistanceCm: Math.round(requiredLeadDistance),
      competitorSpeed: Math.round(heading.speed),
      headingCos: heading.headingCos === null ? null : Math.round(heading.headingCos * 1000) / 1000,
      headingToCoin: heading.headingToCoin,
      nearCoin
    };
    const strength = distanceLead - requiredLeadDistance;
    const bestStrength = best ? Number(best.distanceLeadCm) - Number(best.requiredLeadDistanceCm) : -Infinity;
    if (!best || strength > bestStrength || (strength === bestStrength && competitorDistance < best.competitorDistanceCm)) {
      best = candidate;
    }
  }
  return best;
}

function activeCoinPickupCompetitionCore(self, coin, competitors = [], options = {}) {
  if (!self || !coin) return null;
  const selfId = entityKey(self);
  const selfDistance = finiteNumber(coin?.distance) ?? pointDistance(self, coin);
  const pickupRadius = Math.max(1, Number(options.pickupRadiusCm ?? 150) || 150);
  if (!Number.isFinite(selfDistance) || selfDistance <= pickupRadius) return null;

  let best = null;
  for (const competitor of competitors || []) {
    if (!competitor || competitor.alive === false) continue;
    const competitorId = entityKey(competitor);
    if (selfId && competitorId && competitorId === selfId) continue;
    const active = competitor.active === true
      || competitor.joinModeActive === true
      || competitor.moving === true
      || competitor.firing === true;
    if (!active) continue;
    const competitorDistance = pointDistance(competitor, coin);
    if (!Number.isFinite(competitorDistance) || competitorDistance > pickupRadius) continue;
    const candidate = {
      reason: 'active-player-in-coin-pickup-area',
      coinId: entityKey({ id: coin?.drop_id ?? coin?.id }),
      coinAmount: Math.max(0, Number(coin?.amount || 0)),
      pickupRadiusCm: Math.round(pickupRadius),
      selfDistanceCm: Math.round(selfDistance),
      competitorId,
      competitorName: entityName(competitor),
      competitorDistanceCm: Math.round(competitorDistance),
      distanceLeadCm: Math.round(selfDistance - competitorDistance)
    };
    if (!best || competitorDistance < Number(best.competitorDistanceCm)) best = candidate;
  }
  return best;
}

module.exports = {
  activeCoinCompetitionCore,
  activeCoinCompetitorHeadingCore,
  activeCoinPickupCompetitionCore
};
