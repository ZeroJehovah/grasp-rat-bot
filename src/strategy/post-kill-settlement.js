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

function firstFiniteNumber(...values) {
  for (const value of values) {
    const number = finiteNumber(value);
    if (number !== null) return number;
  }
  return null;
}

function knownTargetDrop(target) {
  if (!target || target.dropKnown !== true) return { known: false, value: null };
  const value = finiteNumber(
    target.drop
      ?? target.Drop
      ?? target.reward
      ?? target.coin_reward
      ?? target.death_reward_preview
      ?? target.death_drop_coins
  );
  return {
    known: value !== null,
    value: value === null ? null : Math.max(0, value)
  };
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
    targetDrop: finiteNumber(state.targetDrop),
    targetDropKnown: state.targetDropKnown === true,
    startedAt: Number(state.startedAt || 0),
    ageMs: Math.max(0, Number(nowMs) - Number(state.startedAt || nowMs)),
    confirmedAt: Number(state.confirmedAt || 0),
    expiresAt: Number(state.expiresAt || 0),
    matchedCoinKey: state.matchedCoinKey || '',
    matchedCoinAmount: finiteNumber(state.matchedCoinAmount),
    matchedCoinCreatedTick: finiteNumber(state.matchedCoinCreatedTick),
    evidenceKey: state.evidenceKey || '',
    x: finiteNumber(state.x),
    y: finiteNumber(state.y),
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
      const rememberedTarget = matchingTargetMemory(context, candidateId);
      const visibleDrop = knownTargetDrop(visible);
      const priorDrop = knownTargetDrop(matchingPriorTarget);
      const rememberedDrop = knownTargetDrop(rememberedTarget);
      const selectedDrop = visibleDrop.known
        ? visibleDrop
        : (priorDrop.known ? priorDrop : rememberedDrop);
      const candidateState = {
        active: true,
        phase: 'unconfirmed-tail',
        targetId: candidateId,
        targetName: String(matchingPriorTarget?.name || rememberedTarget?.name || metrics?.targetName || ''),
        targetDrop: selectedDrop.known
          ? selectedDrop.value
          : firstFiniteNumber(matchingPriorTarget?.drop, rememberedTarget?.drop),
        targetDropKnown: selectedDrop.known,
        x: firstFiniteNumber(matchingPriorTarget?.x, visible?.x, rememberedTarget?.x),
        y: firstFiniteNumber(matchingPriorTarget?.y, visible?.y, rememberedTarget?.y),
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
      const explicitSettlementEvidence = matchingKillEvidence(context, candidateState)
        || matchingDropCoin(context, candidateState);
      if (context.disappearanceKillPlausible === false && !explicitSettlementEvidence) {
        return { state: null, cleared: false, reason: 'disappearance-not-kill-plausible' };
      }
      state = candidateState;
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
  const visibleDrop = knownTargetDrop(visible);
  if (visibleDrop.known) {
    state.targetDrop = visibleDrop.value;
    state.targetDropKnown = true;
  }
  if (visible && visible.alive !== false && Number(visible.hp ?? 1) > 0) {
    return { state: null, cleared: true, reason: 'target-reappeared-alive' };
  }
  if (state.targetDropKnown === true && Number(state.targetDrop) <= 0) {
    return { state: null, cleared: true, reason: 'non-positive-target-drop' };
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

function postKillEvidenceKey(evidence) {
  const id = evidenceTargetId(evidence);
  if (!id) return '';
  const tick = evidenceTick(evidence);
  if (tick !== null) return `evidence:${id}:tick:${tick}`;
  const atMs = evidenceAtMs(evidence);
  if (atMs > 0) return `evidence:${id}:at:${atMs}`;
  return `evidence:${id}:unknown`;
}

function targetMemoryAt(target) {
  return Math.max(
    timestampMs(target?.observedAtMs),
    timestampMs(target?.lastSeenAt),
    timestampMs(target?.updatedAt),
    timestampMs(target?.at),
    timestampMs(target?.firstSeenAt),
    timestampMs(target?.lastAttackAt),
    timestampMs(target?.startedAt)
  );
}

function matchingTargetMemory(context, id) {
  const memory = Array.isArray(context?.targetMemory) ? context.targetMemory : [];
  return memory
    .filter(item => targetId(item) === valueId(id))
    .sort((left, right) => Number(knownTargetDrop(right).known) - Number(knownTargetDrop(left).known)
      || targetMemoryAt(right) - targetMemoryAt(left))[0] || null;
}

function postKillEvidenceIsFresh(evidence, context, options = {}) {
  const nowMs = Number.isFinite(Number(context?.nowMs)) ? Number(context.nowMs) : Date.now();
  const confirmedMs = Math.max(250, Number(options.confirmedMs ?? 5000));
  const maxAgeMs = Math.max(
    confirmedMs + 5000,
    Number(options.evidenceBootstrapMaxAgeMs ?? 12000)
  );
  const eventAtMs = evidenceAtMs(evidence);
  if (eventAtMs > 0 && nowMs - eventAtMs > maxAgeMs) return false;
  const currentTick = snapshotTick(context);
  const eventTick = evidenceTick(evidence);
  if (currentTick > 0 && eventTick !== null) {
    const tickMs = Math.max(1, Number(options.tickMs || 50));
    const maxAgeTicks = Math.max(
      Math.ceil(maxAgeMs / tickMs),
      Number(options.evidenceBootstrapMaxAgeTicks || 0)
    );
    if (currentTick - eventTick > maxAgeTicks) return false;
  }
  return true;
}

function explicitPostKillSettlement(evidence, context, options = {}) {
  const id = valueId(evidenceTargetId(evidence));
  if (!id) return null;
  const target = matchingTargetMemory(context, id);
  const drop = knownTargetDrop(target);
  const nowMs = Number.isFinite(Number(context?.nowMs)) ? Number(context.nowMs) : Date.now();
  const confirmedMs = Math.max(250, Number(options.confirmedMs ?? 5000));
  const observedTick = snapshotTick(context);
  const evidenceKey = postKillEvidenceKey(evidence);
  const evidenceTickValue = evidenceTick(evidence);
  const evidenceAtValue = evidenceAtMs(evidence);
  return {
    active: true,
    phase: 'drop-pending',
    targetId: id,
    targetName: String(target?.name || evidence?.targetName || evidence?.target_name || ''),
    targetDrop: drop.known ? drop.value : null,
    targetDropKnown: drop.known,
    x: finiteNumber(target?.x),
    y: finiteNumber(target?.y),
    startedAt: nowMs,
    confirmedAt: nowMs,
    expiresAt: nowMs + confirmedMs,
    matchedCoinKey: '',
    matchedCoinAmount: null,
    matchedCoinCreatedTick: null,
    evidenceKey,
    lastSnapshotTick: observedTick,
    evidenceMinTick: evidenceTickValue,
    evidenceMinAtMs: evidenceAtValue,
    confirmedEvidenceTick: evidenceTickValue,
    reason: 'self-kill-evidence-observed',
    updatedAt: nowMs
  };
}

function terminalPostKillSettlement(state, nowMs, phase, reason) {
  return {
    ...state,
    active: false,
    phase,
    terminalReason: reason,
    updatedAt: nowMs
  };
}

function updateExplicitPostKillSettlement(state, context, options = {}) {
  if (!state || state.active === false) return state;
  const nowMs = Number.isFinite(Number(context?.nowMs)) ? Number(context.nowMs) : Date.now();
  const confirmedMs = Math.max(250, Number(options.confirmedMs ?? 5000));
  const pickupMs = Math.max(confirmedMs, Number(options.pickupMs ?? 45000));
  const id = valueId(state.targetId);
  const visible = matchingVisibleTarget(context, id);
  const visibleDrop = knownTargetDrop(visible);
  if (visibleDrop.known) {
    state.targetDrop = visibleDrop.value;
    state.targetDropKnown = true;
  }
  // A self-kill message is stronger than a one-frame stale realtime entity.
  // Keep the evidence-bound settlement alive until the drop window closes;
  // the legacy disappearance path below still handles unconfirmed exits.
  if (state.targetDropKnown === true && Number(state.targetDrop) <= 0) {
    return terminalPostKillSettlement(state, nowMs, 'settled', 'non-positive-target-drop');
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
    state.updatedAt = nowMs;
    return state;
  }
  if (state.phase === 'drop-visible'
    && observedTick > 0
    && observedTick > Number(state.lastSnapshotTick || 0)) {
    return terminalPostKillSettlement(state, nowMs, 'settled', 'matched-player-drop-disappeared');
  }
  if (nowMs > Number(state.expiresAt || 0)) {
    return terminalPostKillSettlement(state, nowMs, 'expired', `${state.phase || 'drop-pending'}-timeout`);
  }
  state.updatedAt = nowMs;
  return state;
}

function settlementStateIsActive(state) {
  return Boolean(state && state.active !== false && [
    'unconfirmed-tail',
    'drop-pending',
    'drop-visible'
  ].includes(String(state.phase || '')));
}

function updatePostKillSettlementsCore(previous = {}, context = {}, options = {}) {
  const nowMs = Number.isFinite(Number(context?.nowMs)) ? Number(context.nowMs) : Date.now();
  const confirmedMs = Math.max(250, Number(options.confirmedMs ?? 5000));
  const pickupMs = Math.max(confirmedMs, Number(options.pickupMs ?? 45000));
  const retentionMs = Math.max(
    pickupMs,
    Number(options.retentionMs ?? 120000)
  );
  const maxEntries = Math.max(1, Math.round(Number(options.maxEntries ?? 16)));
  const states = {};
  for (const [key, value] of Object.entries(previous || {})) {
    if (!value || typeof value !== 'object') continue;
    const updatedAt = Number(value.updatedAt || value.startedAt || 0);
    if (value.active === false && updatedAt > 0 && nowMs - updatedAt > retentionMs) continue;
    states[key] = { ...value };
  }
  const seenEvidenceKeys = { ...(context.seenEvidenceKeys || {}) };
  for (const state of Object.values(states)) {
    if (state?.evidenceKey && !seenEvidenceKeys[state.evidenceKey]) {
      seenEvidenceKeys[state.evidenceKey] = Number(state.startedAt || nowMs);
    }
  }

  for (const [key, state] of Object.entries(states)) {
    if (!key.startsWith('evidence:') || !settlementStateIsActive(state)) continue;
    states[key] = updateExplicitPostKillSettlement(state, context, {
      confirmedMs,
      pickupMs
    });
  }

  const evidence = Array.isArray(context.selfKillEvidence) ? context.selfKillEvidence : [];
  for (const item of evidence) {
    const key = postKillEvidenceKey(item);
    if (!key) continue;
    const alreadySeen = Object.prototype.hasOwnProperty.call(seenEvidenceKeys, key);
    if (!alreadySeen) {
      seenEvidenceKeys[key] = nowMs;
      if (!postKillEvidenceIsFresh(item, context, options)) continue;
      const created = explicitPostKillSettlement(item, context, { confirmedMs });
      if (created) {
        states[key] = updateExplicitPostKillSettlement(created, context, {
          confirmedMs,
          pickupMs
        });
      }
    } else if (!states[key] || !settlementStateIsActive(states[key])) {
      // A terminal/tombstone state is deliberately not re-armed by the
      // historical selfKillEvidence list, which is retained by the server.
      continue;
    }
  }

  const legacyKeys = Object.keys(states).filter(key => key.startsWith('legacy:'));
  const legacyKey = legacyKeys.sort((left, right) => (
    Number(states[right]?.startedAt || 0) - Number(states[left]?.startedAt || 0)
  ))[0] || 'legacy';
  const legacyPrevious = states[legacyKey] || null;
  const legacyContext = { ...context, selfKillEvidence: [] };
  const legacyResult = updatePostKillSettlementCore(legacyPrevious, legacyContext, {
    unconfirmedMs: options.unconfirmedMs,
    confirmedMs,
    pickupMs,
    recentShotMs: options.recentShotMs,
    tickMs: options.tickMs
  });
  for (const key of legacyKeys) delete states[key];
  if (legacyResult.state) {
    const nextLegacyKey = legacyResult.state.targetId
      ? `legacy:${valueId(legacyResult.state.targetId)}`
      : legacyKey;
    states[nextLegacyKey] = {
      ...legacyResult.state,
      active: true,
      updatedAt: nowMs
    };
  }

  const orderedEntries = Object.entries(states)
    .sort((left, right) => {
      const leftState = left[1];
      const rightState = right[1];
      const leftActive = Number(settlementStateIsActive(leftState));
      const rightActive = Number(settlementStateIsActive(rightState));
      return rightActive - leftActive
        || Number(rightState?.phase === 'drop-visible') - Number(leftState?.phase === 'drop-visible')
        || Number(rightState?.matchedCoinAmount || rightState?.targetDrop || 0)
          - Number(leftState?.matchedCoinAmount || leftState?.targetDrop || 0)
        || Number(rightState?.updatedAt || rightState?.startedAt || 0)
          - Number(leftState?.updatedAt || leftState?.startedAt || 0);
    });
  const boundedStates = Object.fromEntries(orderedEntries.slice(0, maxEntries));
  const active = Object.values(boundedStates)
    .filter(settlementStateIsActive)
    .sort((left, right) => (
      Number(right.phase === 'drop-visible') - Number(left.phase === 'drop-visible')
        || Number(right.matchedCoinAmount || right.targetDrop || 0)
          - Number(left.matchedCoinAmount || left.targetDrop || 0)
        || Number(right.updatedAt || right.startedAt || 0)
          - Number(left.updatedAt || left.startedAt || 0)
    ));
  const seenEntries = Object.entries(seenEvidenceKeys)
    .sort((left, right) => Number(right[1] || 0) - Number(left[1] || 0))
    .slice(0, Math.max(maxEntries * 8, 32));
  return {
    states: boundedStates,
    selected: active[0] || null,
    activeCount: active.length,
    terminalCount: Object.values(boundedStates).filter(state => state?.active === false).length,
    seenEvidenceKeys: Object.fromEntries(seenEntries)
  };
}

module.exports = {
  settlementSummary,
  updatePostKillSettlementCore,
  updatePostKillSettlementsCore,
  postKillEvidenceKey
};
