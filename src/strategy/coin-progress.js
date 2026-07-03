'use strict';

function coinFailureIgnoreCore(previous = {}, reason = '', nowMs = 0, options = {}) {
  const t = Number(nowMs) || 0;
  const lastAt = Number(previous?.lastAt || 0);
  const decayMs = Number(options.coinFailureDecayMs || 0);
  const count = lastAt && t - lastAt > decayMs ? 1 : Number(previous?.count || 0) + 1;
  const base = reason === 'close' ? options.coinCloseFailureIgnoreMs
    : (reason === 'near' ? options.coinNearFailureIgnoreMs : options.coinNoProgressIgnoreMs);
  const ignoreMs = Math.min(
    Number(options.coinFailureMaxIgnoreMs || 0),
    Math.round(Number(base || 0) * Math.max(1, count))
  );
  const ignoreUntil = t + ignoreMs;
  return { count, reason, lastAt: t, ignoreMs, ignoreUntil };
}

function staleCoinEscapeDirectionCore(action, self, nowMs = 0, options = {}) {
  let awayDx = Math.sign(Number(self?.x) - Number(action?.target?.x)) || -(Number(action?.dx) || 0);
  let awayDy = Math.sign(Number(self?.y) - Number(action?.target?.y)) || -(Number(action?.dy) || 0);
  if (!(awayDx || awayDy)) {
    const phase = Math.floor((Number(nowMs) || 0) / 1000) % 4;
    const pattern = [
      { dx: 1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: -1 }
    ][phase];
    awayDx = pattern.dx;
    awayDy = pattern.dy;
  }
  return {
    dx: awayDx,
    dy: awayDy,
    state: {
      id: String(action?.target?.id),
      dx: awayDx,
      dy: awayDy,
      until: (Number(nowMs) || 0) + Number(options.staleCoinEscapeMs || 0)
    }
  };
}

function coinProgressIntentCore(action) {
  return Boolean(action
    && (action.kind === 'coin'
      || action.kind === 'seek-coin'
      || (action.kind === 'patrol' && action.target?.id && String(action.reason || '').includes('coin')))
    && action.target);
}

function coinAttemptExpiredCore(attempt, nowMs = 0, options = {}) {
  const t = Number(nowMs) || 0;
  return t - Number(attempt?.lastSeenAt || attempt?.startedAt || t) > options.coinIgnoreMs * 3;
}

function updateCoinAttemptCore(previousAttempt, action, nowMs = 0, options = {}) {
  const t = Number(nowMs) || 0;
  const target = action?.target || {};
  const id = String(target.id);
  const distance = Number(target.distance ?? Infinity);
  const amount = Math.max(0, Number(target.amount || 0) || 0);
  const targetX = Number(target.x);
  const targetY = Number(target.y);
  const attempt = previousAttempt ? { ...previousAttempt } : {
    id,
    startedAt: t,
    lastImprovedAt: t,
    bestDistance: distance,
    lastDistance: distance,
    amount,
    x: Number.isFinite(targetX) ? targetX : null,
    y: Number.isFinite(targetY) ? targetY : null,
    closeStartedAt: distance <= options.closeCoinStuckDistance ? t : 0,
    nearStartedAt: distance <= options.nearCoinStuckDistance ? t : 0
  };
  attempt.amount = amount || Number(attempt.amount || 0) || 0;
  if (action?.postAttackTarget || action?.target?.postAttackTarget) {
    attempt.postAttackTarget = action.postAttackTarget || action.target.postAttackTarget;
  }
  if (Number.isFinite(targetX)) attempt.x = targetX;
  if (Number.isFinite(targetY)) attempt.y = targetY;
  attempt.lastSeenAt = t;
  const previousDistance = Number(attempt.lastDistance ?? distance);
  const attemptImproved = distance + options.coinProgressMinGain < Number(attempt.bestDistance);
  if (attemptImproved) {
    attempt.bestDistance = distance;
    attempt.lastImprovedAt = t;
  }
  const stillApproaching = distance + options.coinNearStuckResetGain < previousDistance;
  attempt.lastDistance = distance;
  if (distance <= options.closeCoinStuckDistance && !stillApproaching) {
    if (!attempt.closeStartedAt) attempt.closeStartedAt = t;
  } else {
    attempt.closeStartedAt = 0;
  }
  if (distance <= options.nearCoinStuckDistance && !stillApproaching) {
    if (!attempt.nearStartedAt) attempt.nearStartedAt = t;
  } else {
    attempt.nearStartedAt = 0;
  }
  const closeStuck = attempt.closeStartedAt && t - attempt.closeStartedAt >= options.closeCoinStuckMs;
  const nearStuck = attempt.nearStartedAt && t - attempt.nearStartedAt >= options.nearCoinStuckMs;
  return {
    id,
    distance,
    amount,
    attempt,
    closeStuck: Boolean(closeStuck),
    nearStuck: Boolean(nearStuck)
  };
}

function updateCoinProgressRecordCore(previousProgress, attempt, distance, nowMs = 0, options = {}) {
  const t = Number(nowMs) || 0;
  const id = String(attempt?.id);
  if (!previousProgress || String(previousProgress.id) !== id) {
    return {
      progress: {
        id,
        startedAt: t,
        lastImprovedAt: t,
        bestDistance: distance,
        lastDistance: distance,
        amount: attempt?.amount,
        x: attempt?.x,
        y: attempt?.y,
        postAttackTarget: attempt?.postAttackTarget || null
      },
      improved: false,
      stale: false
    };
  }
  const improved = distance + options.coinProgressMinGain < Number(previousProgress.bestDistance);
  if (improved) {
    return {
      progress: {
        ...previousProgress,
        lastImprovedAt: t,
        bestDistance: distance,
        lastDistance: distance,
        amount: attempt?.amount,
        x: attempt?.x,
        y: attempt?.y,
        postAttackTarget: attempt?.postAttackTarget || previousProgress.postAttackTarget || null
      },
      improved: true,
      stale: false
    };
  }
  const progress = {
    ...previousProgress,
    lastDistance: distance,
    amount: attempt?.amount,
    x: attempt?.x,
    y: attempt?.y,
    postAttackTarget: attempt?.postAttackTarget || previousProgress.postAttackTarget || null
  };
  return {
    progress,
    improved: false,
    stale: t - Number(previousProgress.lastImprovedAt || previousProgress.startedAt || t) >= options.coinNoProgressMs
  };
}

function buildIgnoredCoinProgressCore(id, previous, distance, nowMs = 0, ignoreUntil = 0, mode = '') {
  const t = Number(nowMs) || 0;
  if (mode === 'stuck') {
    return {
      id,
      startedAt: previous?.startedAt,
      lastImprovedAt: previous?.lastImprovedAt,
      bestDistance: Number(previous?.bestDistance),
      lastDistance: distance,
      ignoredAt: t,
      ignoreUntil
    };
  }
  return {
    ...(previous || {}),
    ignoredAt: t,
    ignoreUntil
  };
}

function buildIgnoredCoinPatrolActionCore(action, id, distance, source, failure, escape, nowMs = 0, reason = '', includeAges = false) {
  const t = Number(nowMs) || 0;
  const ignoredCoin = {
    id,
    distance,
    bestDistance: Number(source?.bestDistance),
    ignoreMs: failure?.ignoreMs,
    failureCount: failure?.count
  };
  if (includeAges) {
    ignoredCoin.closeAgeMs = source.closeStartedAt ? Math.round(t - source.closeStartedAt) : 0;
    ignoredCoin.nearAgeMs = source.nearStartedAt ? Math.round(t - source.nearStartedAt) : 0;
    ignoredCoin.ageMs = Math.round(t - Number(source.startedAt || t));
  }
  return {
    kind: 'patrol',
    reason,
    target: action?.target,
    dx: escape?.dx,
    dy: escape?.dy,
    ignoredCoin
  };
}

function coinIgnoreCleanupIntentCore(lastTarget, coinApproachLock, id) {
  return {
    clearLastTarget: Boolean(lastTarget?.kind === 'coin' && String(lastTarget.id) === id),
    clearCoinApproachLock: Boolean(coinApproachLock?.id === id)
  };
}

module.exports = {
  coinFailureIgnoreCore,
  staleCoinEscapeDirectionCore,
  coinProgressIntentCore,
  coinAttemptExpiredCore,
  updateCoinAttemptCore,
  updateCoinProgressRecordCore,
  buildIgnoredCoinProgressCore,
  buildIgnoredCoinPatrolActionCore,
  coinIgnoreCleanupIntentCore
};
