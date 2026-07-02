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

module.exports = {
  coinTargetKeyCore,
  coinTargetDistance,
  coinMatchesTrackedTargetCore,
  trackedCoinTargetForCollectionCore,
  buildNativeCoinSnapshotCore
};
