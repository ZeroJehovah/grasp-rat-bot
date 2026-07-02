'use strict';

function coinTargetKeyCore(target) {
  const id = target?.id ?? target?.drop_id ?? target?.coin_id;
  if (id !== undefined && id !== null && id !== '') return 'id:' + String(id);
  const x = Number(target?.x);
  const y = Number(target?.y);
  if (Number.isFinite(x) && Number.isFinite(y)) {
    return 'xy:' + Math.round(x) + ':' + Math.round(y) + ':' + Math.round(Number(target?.amount || 0));
  }
  return '';
}

function coinTargetDistance(a, b, options = {}) {
  if (typeof options.dist === 'function') return options.dist(a, b);
  return Math.hypot(Number(a?.x) - Number(b?.x), Number(a?.y) - Number(b?.y));
}

function coinMatchesTrackedTargetCore(coin, target, options = {}) {
  const targetId = target?.id ?? target?.drop_id ?? target?.coin_id;
  const coinId = coin?.drop_id ?? coin?.id ?? coin?.coin_id;
  if (targetId !== undefined && targetId !== null && targetId !== '' && coinId !== undefined && coinId !== null && coinId !== '') {
    if (String(targetId) === String(coinId)) return true;
  }
  const targetPoint = { x: Number(target?.x), y: Number(target?.y) };
  const coinPoint = { x: Number(coin?.x), y: Number(coin?.y) };
  if (!Number.isFinite(targetPoint.x) || !Number.isFinite(targetPoint.y) || !Number.isFinite(coinPoint.x) || !Number.isFinite(coinPoint.y)) return false;
  return coinTargetDistance(targetPoint, coinPoint, options) <= Number(options.coinCollectedPruneRadius || 0);
}

function trackedCoinTargetForCollectionCore(state = {}, self = null, options = {}) {
  const decision = state.lastDecision || null;
  const decisionTarget = decision?.target || null;
  const decisionLooksLikeCoin = decisionTarget
    && (decision.kind === 'coin'
      || decision.kind === 'seek-coin'
      || (decision.kind === 'patrol' && String(decision.reason || '').includes('coin')));
  if (decisionLooksLikeCoin) {
    const target = { ...decisionTarget };
    if (decision?.postAttackTarget && !target.postAttackTarget) target.postAttackTarget = decision.postAttackTarget;
    target.id = target.id ?? state.lastTarget?.id ?? state.coinProgress?.id;
    if (!Number.isFinite(Number(target.distance)) && Number.isFinite(Number(target.x)) && Number.isFinite(Number(target.y)) && self) {
      target.distance = coinTargetDistance(self, target, options);
    }
    return target;
  }
  if (state.lastTarget?.kind === 'coin') {
    return {
      id: state.lastTarget.id,
      distance: state.coinProgress?.lastDistance,
      amount: state.coinProgress?.amount,
      x: state.coinProgress?.x,
      y: state.coinProgress?.y,
      postAttackTarget: state.coinProgress?.postAttackTarget || null
    };
  }
  if (state.coinProgress?.id) {
    return {
      id: state.coinProgress.id,
      distance: state.coinProgress.lastDistance,
      amount: state.coinProgress.amount,
      x: state.coinProgress.x,
      y: state.coinProgress.y,
      postAttackTarget: state.coinProgress.postAttackTarget || null
    };
  }
  return null;
}

function buildNativeCoinSnapshotCore(coins, options = {}) {
  const t = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : 0;
  return (coins || [])
    .map(coin => ({
      id: coin?.drop_id ?? coin?.id ?? coin?.coin_id ?? '',
      key: coinTargetKeyCore(coin),
      amount: Math.max(0, Math.round(Number(coin?.amount || 0) || 0)),
      x: Number(coin?.x),
      y: Number(coin?.y),
      at: t
    }))
    .filter(coin => coin.key && coin.amount > 0 && Number.isFinite(coin.x) && Number.isFinite(coin.y));
}

function pointToSegmentDistanceCore(point, a, b, options = {}) {
  const px = Number(point?.x);
  const py = Number(point?.y);
  const ax = Number(a?.x);
  const ay = Number(a?.y);
  const bx = Number(b?.x);
  const by = Number(b?.y);
  if (![px, py, ax, ay, bx, by].every(Number.isFinite)) return Infinity;
  const vx = bx - ax;
  const vy = by - ay;
  const lenSq = vx * vx + vy * vy;
  if (!(lenSq > 0)) return coinTargetDistance(point, a, options);
  const ratio = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / lenSq));
  return coinTargetDistance(point, { x: ax + vx * ratio, y: ay + vy * ratio }, options);
}

function pickIncidentalCoinPickupsCore(previousSnapshot, currentSnapshot, currentSummary, previousSelf, options = {}) {
  if (!Array.isArray(currentSnapshot)) return [];
  const t = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : 0;
  const memoryMs = Math.max(500, Number(options.incidentalCoinPickupMemoryMs || 3000) || 3000);
  const radius = Math.max(0, Number(options.coinCollectedConfirmDistance || 0) || 0);
  const currentKeys = new Set(currentSnapshot.map(coin => String(coin?.key || '')));
  const picked = [];
  for (const coin of Array.isArray(previousSnapshot) ? previousSnapshot : []) {
    if (!coin || !coin.key || currentKeys.has(String(coin.key))) continue;
    if (t - Number(coin.at || 0) > memoryMs) continue;
    const currentDistance = coinTargetDistance(currentSummary, coin, options);
    const previousDistance = previousSelf ? coinTargetDistance(previousSelf, coin, options) : Infinity;
    const pathDistance = previousSelf ? pointToSegmentDistanceCore(coin, previousSelf, currentSummary, options) : currentDistance;
    if (Math.min(currentDistance, previousDistance, pathDistance) > radius) continue;
    picked.push({
      coin,
      currentDistance,
      previousDistance,
      pathDistance
    });
  }
  return picked;
}

function snapshotCoinWorthLongTravelCore(coin, members = 1, totalAmount = null, options = {}) {
  const memberCount = Math.max(1, Number(members || 1));
  const minCoins = Math.max(1, Number(options.snapshotCoinClusterMinCoins || 1));
  if (memberCount >= minCoins) return true;
  const distance = Number(coin?.distance ?? Infinity);
  if (!Number.isFinite(distance)) return false;
  const amount = Math.max(0, Number(totalAmount ?? coin?.amount ?? 0));
  const baseMax = Math.max(0, Number(options.snapshotSingleCoinMaxDistance || options.globalCoinMaxDistance || options.coinMaxDistance || 0));
  const perAmount = Math.max(0, Number(options.snapshotSingleCoinDistancePerAmount || 0));
  const maxDistance = Math.max(baseMax, amount * perAmount);
  return distance <= maxDistance;
}

function snapshotCoinNavigationReasonCore(coin, options = {}) {
  if (coin?.snapshotIdleFallback) return 'snapshot-coin-idle-timeout';
  if (coin?.fieldMigration) return 'migrate-to-known-field';
  const isSnapshotOnly = typeof options.isSnapshotOnlyCoin === 'function'
    ? options.isSnapshotOnlyCoin(coin)
    : Boolean(coin?.snapshot && !coin?.native);
  if (isSnapshotOnly && Number(coin?.snapshotMembers || 0) > 0) {
    return Number(coin.snapshotMembers) >= Number(options.snapshotCoinClusterMinCoins || 0) ? 'snapshot-coin-field' : 'snapshot-coin-target';
  }
  return Number(coin?.distance) <= Number(options.coinMaxDistance || 0) ? 'best-opportunity-coin' : 'best-opportunity-visible-coin';
}

module.exports = {
  coinTargetKeyCore,
  coinTargetDistance,
  coinMatchesTrackedTargetCore,
  trackedCoinTargetForCollectionCore,
  buildNativeCoinSnapshotCore,
  pointToSegmentDistanceCore,
  pickIncidentalCoinPickupsCore,
  snapshotCoinWorthLongTravelCore,
  snapshotCoinNavigationReasonCore
};
