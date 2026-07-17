'use strict';

function valueId(value) {
  return value === null || value === undefined || value === '' ? '' : String(value);
}

function targetId(target) {
  return valueId(target?.userId ?? target?.user_id ?? target?.entityId ?? target?.entity_id ?? target?.id);
}

function evidenceTargetId(evidence) {
  return valueId(evidence?.targetUserId ?? evidence?.target_user_id ?? evidence?.targetId ?? evidence?.target_id);
}

function coinSourceId(coin) {
  return valueId(coin?.sourceUserId ?? coin?.source_user_id ?? coin?.ownerUserId ?? coin?.owner_user_id);
}

function coinKey(coin) {
  return valueId(coin?.key ?? coin?.drop_id ?? coin?.dropId ?? coin?.id);
}

function snapshotTick(context = {}) {
  const value = Number(context.snapshotTick ?? context.snapshot?.tick ?? context.observation?.tick);
  return Number.isFinite(value) ? value : 0;
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function timestampMs(value) {
  const number = finiteNumber(value);
  if (number !== null && number > 0) return number;
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function evidenceTick(value) {
  return finiteNumber(value?.tick ?? value?.created_tick ?? value?.createdTick);
}

function evidenceAtMs(value) {
  return timestampMs(value?.atMs ?? value?.observedAtMs ?? value?.at ?? value?.createdAt);
}

function evidenceIsCurrent(value, state) {
  const minimumTick = finiteNumber(state?.evidenceMinTick);
  const tick = evidenceTick(value);
  if (minimumTick !== null && minimumTick > 0 && tick !== null) return tick >= minimumTick;
  const minimumAtMs = timestampMs(state?.evidenceMinAtMs);
  const atMs = evidenceAtMs(value);
  if (minimumAtMs > 0 && atMs > 0) return atMs >= minimumAtMs;
  return !(minimumTick > 0 || minimumAtMs > 0);
}

function matchingVisibleTarget(context, id) {
  return (context.visibleTargets || []).find(item => targetId(item) === id) || null;
}

function matchingKillEvidence(context, state) {
  const id = valueId(state?.targetId);
  return (context.selfKillEvidence || []).find(item => (
    evidenceTargetId(item) === id && evidenceIsCurrent(item, state)
  )) || null;
}

function matchingDropCoin(context, state) {
  const id = valueId(state?.targetId);
  return (context.playerDropCoins || context.coins || []).find(item => {
    if (coinSourceId(item) !== id) return false;
    if (evidenceIsCurrent(item, state)) return true;
    return Number(state?.confirmedAt || 0) > 0 && evidenceTick(item) === null && evidenceAtMs(item) === 0;
  }) || null;
}

function settlementSummary(state, nowMs = Date.now()) {
  if (!state) return null;
  return {
    active: true,
    phase: state.phase || 'unconfirmed-tail',
    targetId: state.targetId || '',
    targetName: state.targetName || '',
    targetDrop: Number.isFinite(Number(state.targetDrop)) ? Number(state.targetDrop) : null,
    startedAt: Number(state.startedAt || 0),
    ageMs: Math.max(0, Number(nowMs) - Number(state.startedAt || nowMs)),
    confirmedAt: Number(state.confirmedAt || 0),
    expiresAt: Number(state.expiresAt || 0),
    matchedCoinKey: state.matchedCoinKey || '',
    matchedCoinAmount: Number.isFinite(Number(state.matchedCoinAmount)) ? Number(state.matchedCoinAmount) : null,
    matchedCoinCreatedTick: finiteNumber(state.matchedCoinCreatedTick),
    lastSnapshotTick: Number(state.lastSnapshotTick || 0),
    evidenceMinTick: finiteNumber(state.evidenceMinTick),
    evidenceMinAtMs: Number(state.evidenceMinAtMs || 0),
    confirmedEvidenceTick: finiteNumber(state.confirmedEvidenceTick),
    reason: state.reason || ''
  };
}

function updatePostKillSettlementCore(previous, context = {}, options = {}) {
  const nowMs = Number.isFinite(Number(context.nowMs)) ? Number(context.nowMs) : Date.now();
  const unconfirmedMs = Math.max(250, Number(options.unconfirmedMs ?? 1000));
  const confirmedMs = Math.max(unconfirmedMs, Number(options.confirmedMs ?? 5000));
  const pickupMs = Math.max(confirmedMs, Number(options.pickupMs ?? 45000));
  const recentShotMs = Math.max(250, Number(options.recentShotMs ?? 1500));
  const recentShotTicks = Math.ceil(recentShotMs / Math.max(1, Number(options.tickMs || 50))) + 2;
  const currentTargetId = targetId(context.currentCombatTarget);
  const priorTarget = context.previousCombatTarget || null;
  const metrics = context.combatMetrics || null;
  const candidateId = valueId(metrics?.targetId);

  let state = previous && previous.active !== false ? { ...previous } : null;
  if (!state && candidateId && currentTargetId !== candidateId) {
    const visible = matchingVisibleTarget(context, candidateId);
    const lastShotAt = Number(metrics?.actualLastShotAt || 0);
    const acceptedShots = Number(metrics?.acceptedShots ?? metrics?.actualShots ?? 0);
    const observedTick = snapshotTick(context);
    const evidenceMinTick = finiteNumber(
      metrics?.lastAcceptedShotTick
        ?? metrics?.actualLastShotTick
        ?? metrics?.startedTick
        ?? (targetId(priorTarget) === candidateId ? priorTarget?.firstSeenTick : null)
        ?? (observedTick > 0 ? Math.max(1, observedTick - recentShotTicks) : null)
    );
    const evidenceMinAtMs = timestampMs(metrics?.startedAt)
      || Math.max(0, lastShotAt - recentShotMs);
    if ((!visible || visible.alive === false || Number(visible.hp) <= 0)
      && acceptedShots > 0
      && lastShotAt > 0
      && nowMs - lastShotAt <= recentShotMs) {
      const matchingPriorTarget = targetId(priorTarget) === candidateId ? priorTarget : null;
      state = {
        active: true,
        phase: 'unconfirmed-tail',
        targetId: candidateId,
        targetName: String(matchingPriorTarget?.name || metrics?.targetName || ''),
        targetDrop: Number.isFinite(Number(matchingPriorTarget?.drop)) ? Number(matchingPriorTarget.drop) : null,
        startedAt: nowMs,
        confirmedAt: 0,
        expiresAt: nowMs + unconfirmedMs,
        matchedCoinKey: '',
        matchedCoinAmount: null,
        matchedCoinCreatedTick: null,
        lastSnapshotTick: observedTick,
        evidenceMinTick,
        evidenceMinAtMs,
        confirmedEvidenceTick: null,
        reason: 'recent-combat-target-disappeared'
      };
    }
  }
  if (!state) return { state: null, cleared: false, reason: 'inactive' };

  if (finiteNumber(state.evidenceMinTick) === null) {
    const observedTick = snapshotTick(context);
    state.evidenceMinTick = finiteNumber(
      valueId(metrics?.targetId) === valueId(state.targetId)
        ? (metrics?.lastAcceptedShotTick ?? metrics?.actualLastShotTick ?? metrics?.startedTick)
        : null
    ) ?? (observedTick > 0 ? Math.max(1, observedTick - recentShotTicks) : null);
  }
  if (!(Number(state.evidenceMinAtMs || 0) > 0)) {
    state.evidenceMinAtMs = timestampMs(metrics?.startedAt)
      || Math.max(0, Number(state.startedAt || nowMs) - recentShotMs);
  }

  const id = valueId(state.targetId);
  const visible = matchingVisibleTarget(context, id);
  if (visible && visible.alive !== false && Number(visible.hp ?? 1) > 0) {
    return { state: null, cleared: true, reason: 'target-reappeared-alive' };
  }

  const evidence = matchingKillEvidence(context, state);
  if (evidence && !state.confirmedAt) {
    state.phase = 'drop-pending';
    state.confirmedAt = nowMs;
    state.confirmedEvidenceTick = evidenceTick(evidence);
    state.expiresAt = nowMs + confirmedMs;
    state.reason = 'self-kill-confirmed';
  }

  const coin = matchingDropCoin(context, state);
  const observedTick = snapshotTick(context);
  if (coin) {
    state.phase = 'drop-visible';
    state.matchedCoinKey = coinKey(coin);
    state.matchedCoinAmount = Number.isFinite(Number(coin.amount)) ? Number(coin.amount) : null;
    state.matchedCoinCreatedTick = evidenceTick(coin);
    state.lastSnapshotTick = observedTick || Number(state.lastSnapshotTick || 0);
    state.expiresAt = nowMs + pickupMs;
    state.reason = 'matched-player-drop-visible';
  } else if (state.phase === 'drop-visible'
    && observedTick > 0
    && observedTick > Number(state.lastSnapshotTick || 0)) {
    return { state: null, cleared: true, reason: 'matched-player-drop-disappeared' };
  }

  if (nowMs > Number(state.expiresAt || 0)) {
    return { state: null, cleared: true, reason: `${state.phase || 'settlement'}-timeout` };
  }
  return { state, cleared: false, reason: state.reason || 'active' };
}

module.exports = {
  settlementSummary,
  updatePostKillSettlementCore
};
