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

// A kill message is observed slightly after the death, so a pickup recorded just
// before the settlement generation opened can still belong to it.
const PICKUP_EVIDENCE_LEAD_MS = 1000;

// UC-018 requires every attribution field to name its authority, so a pickup row
// must state where its coin observation came from rather than inherit a generic
// label.  The row carries it explicitly; the reason string is the fallback for a
// record written before the field existed.
function pickupEvidenceAuthority(pickup) {
  const explicit = String(pickup?.authority || '').toLowerCase();
  if (explicit === 'realtime' || explicit === 'native') return 'realtime';
  if (explicit === 'snapshot') return 'snapshot';
  return String(pickup?.reason || '').startsWith('realtime-coin-') ? 'realtime' : 'snapshot';
}

function coinAuthority(coin) {
  if (!coin || typeof coin !== 'object') return '';
  if (coin.snapshotOnly === true || String(coin.authority || '').toLowerCase() === 'snapshot') return 'snapshot';
  if (String(coin.authority || '').toLowerCase() === 'realtime'
    || String(coin.authority || '').toLowerCase() === 'native') return 'realtime';
  return '';
}

function coinObservedAtMs(coin, fallback = 0) {
  const value = finiteNumber(coin?.observedAtMs ?? coin?.observed_at_ms ?? coin?.atMs ?? coin?.at);
  return value === null ? Number(fallback || 0) : Math.max(0, value);
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
  const tick = finiteNumber(value?.tick ?? value?.created_tick ?? value?.createdTick);
  return tick !== null && tick > 0 ? tick : null;
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
    evidenceTargetId(item) === id
      && evidenceIsCurrent(item, state)
      && postKillEvidenceIsFresh(item, context)
  )) || null;
}

function matchingDropCoin(context, state) {
  const id = valueId(state?.targetId);
  return (context.playerDropCoins || context.coins || []).find(item => {
    if (coinSourceId(item) !== id) return false;
    const currentTick = snapshotTick(context);
    const createdTick = evidenceTick(item);
    if (currentTick > 0 && createdTick !== null && createdTick > currentTick) return false;
    if (evidenceIsCurrent(item, state)) return true;
    return Number(state?.confirmedAt || 0) > 0 && evidenceTick(item) === null && evidenceAtMs(item) === 0;
  }) || null;
}

// A drop collected inside our own pickup radius can settle before any coin
// frame ever carries it: the coin transport is the snapshot stream, so between
// the kill and the next snapshot the coin may already be gone.  `drop-pending`
// then has no visible coin to match and only the timeout can end it, which is
// the unnecessary wait this resolves.
//
// The admitting evidence is a coin that disappeared next to our own path -- the
// same incidental-pickup observation that already credits session coins -- whose
// amount equals the target's known Drop and whose observation is not older than
// the settlement generation.  Amount equality is required because that is what
// ties the vanished coin to this kill; a source-labelled coin is matched by
// `matchingDropCoin` instead and never needs this path.
function matchingPickupEvidence(context, state, options = {}) {
  const drop = finiteNumber(state?.targetDrop);
  if (state?.targetDropKnown !== true || drop === null || !(drop > 0)) return null;
  const startedAt = Math.max(0, Number(state?.startedAt || 0));
  const confirmedAt = Math.max(0, Number(state?.confirmedAt || 0));
  // The kill is observed a moment after it happens, so a pickup recorded just
  // before the settlement opened still belongs to it.
  const floorAtMs = Math.max(0, (confirmedAt || startedAt) - PICKUP_EVIDENCE_LEAD_MS);
  // One collected coin settles one kill.  Two kills of equal Drop can otherwise
  // overlap inside the lead window and both claim the same pickup row.
  const consumed = options.consumedPickupKeys instanceof Set ? options.consumedPickupKeys : null;
  return (context.coinPickups || []).find(item => {
    if (Math.round(Number(item?.amount)) !== Math.round(drop)) return false;
    const atMs = timestampMs(item?.at ?? item?.atMs ?? item?.observedAtMs);
    if (!(atMs > 0) || atMs < floorAtMs) return false;
    const key = coinKey(item);
    return !(consumed && key && consumed.has(key));
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
    matchedCoinAuthority: state.matchedCoinAuthority || '',
    matchedCoinObservedAtMs: finiteNumber(state.matchedCoinObservedAtMs),
    evidenceKey: state.evidenceKey || '',
    x: finiteNumber(state.x),
    y: finiteNumber(state.y),
    lastSnapshotTick: Number(state.lastSnapshotTick || 0),
    evidenceMinTick: finiteNumber(state.evidenceMinTick),
    evidenceMinAtMs: Number(state.evidenceMinAtMs || 0),
    confirmedEvidenceTick: finiteNumber(state.confirmedEvidenceTick),
    primaryTargetDropPriority: state.primaryTargetDropPriority === true,
    ownDamageAttribution: state.ownDamageAttribution === true,
    ownDamageFromStart: finiteNumber(state.ownDamageFromStart),
    ownDamageLastObservedHp: finiteNumber(state.ownDamageLastObservedHp),
    killAttribution: state.killAttribution || '',
    authority: state.authority || '',
    pickupEvidence: state.pickupEvidence === true,
    pickupEvidenceReason: state.pickupEvidenceReason || '',
    terminalReason: state.terminalReason || '',
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
        matchedCoinAuthority: '',
        matchedCoinObservedAtMs: 0,
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
    state.matchedCoinAuthority = coinAuthority(coin);
    state.matchedCoinObservedAtMs = coinObservedAtMs(coin, nowMs);
    state.lastSnapshotTick = observedTick || Number(state.lastSnapshotTick || 0);
    state.expiresAt = nowMs + pickupMs;
    state.reason = 'matched-player-drop-visible';
  } else if (state.phase === 'drop-visible'
    && observedTick > 0
    && observedTick > Number(state.lastSnapshotTick || 0)) {
    return { state: null, cleared: true, reason: 'matched-player-drop-disappeared' };
  }

  // Same reasoning as the evidence-backed path: a drop already collected leaves
  // nothing to wait for, so it must not hold the generation open to its timeout.
  if (matchingPickupEvidence(context, state, options)) {
    return { state: null, cleared: true, reason: 'matched-drop-picked-up' };
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
  const confirmedMs = Math.max(250, Number(options.confirmedMs ?? 5000));
  const maxAgeMs = Math.max(
    confirmedMs + 5000,
    Number(options.evidenceBootstrapMaxAgeMs ?? 12000)
  );
  const currentTick = snapshotTick(context);
  const eventTick = evidenceTick(evidence);
  // A kill message without a positive server tick cannot establish a
  // reliable post-kill settlement.  In particular, do not fall back to a
  // wall-clock TTL for historical messages retained in the snapshot.
  if (eventTick === null || currentTick <= 0) return false;
  if (eventTick > currentTick) return false;
  const tickMs = Math.max(1, Number(options.tickMs || 50));
  const maxAgeTicks = Math.max(
    Math.ceil(maxAgeMs / tickMs),
    Number(options.evidenceBootstrapMaxAgeTicks || 0)
  );
  return currentTick - eventTick <= maxAgeTicks;
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
    matchedCoinAuthority: '',
    matchedCoinObservedAtMs: 0,
    evidenceKey,
    lastSnapshotTick: observedTick,
    evidenceMinTick: evidenceTickValue,
    evidenceMinAtMs: evidenceAtValue,
    confirmedEvidenceTick: evidenceTickValue,
    reason: 'self-kill-evidence-observed',
    updatedAt: nowMs
  };
}

function primaryTargetPostKillSettlement(evidence, context, options = {}) {
  const id = valueId(evidence?.targetId ?? evidence?.target_id);
  if (!id || evidence?.authority !== 'realtime') return null;
  const nowMs = Number.isFinite(Number(context?.nowMs)) ? Number(context.nowMs) : Date.now();
  const confirmedMs = Math.max(250, Number(options.confirmedMs ?? 5000));
  const observedTick = snapshotTick(context);
  const eventTick = evidenceTick(evidence);
  const eventAtMs = evidenceAtMs(evidence) || nowMs;
  const knownDrop = evidence.dropKnown === true && finiteNumber(evidence.drop) !== null;
  return {
    active: true,
    phase: 'drop-pending',
    targetId: id,
    targetName: String(evidence.targetName || evidence.target_name || ''),
    targetDrop: knownDrop ? Math.max(0, Number(evidence.drop)) : null,
    targetDropKnown: knownDrop,
    x: finiteNumber(evidence.x),
    y: finiteNumber(evidence.y),
    startedAt: nowMs,
    confirmedAt: nowMs,
    expiresAt: nowMs + confirmedMs,
    matchedCoinKey: '',
    matchedCoinAmount: null,
    matchedCoinCreatedTick: null,
    matchedCoinAuthority: '',
    matchedCoinObservedAtMs: 0,
    evidenceKey: `primary:${id}:${eventTick !== null ? `tick:${eventTick}` : `at:${eventAtMs}`}`,
    lastSnapshotTick: observedTick,
    evidenceMinTick: eventTick,
    evidenceMinAtMs: eventAtMs,
    confirmedEvidenceTick: eventTick,
    primaryTargetDropPriority: true,
    killAttribution: String(evidence.killAttribution || 'external-or-unknown'),
    authority: 'realtime',
    reason: String(evidence.reason || 'dual-target-primary-settlement-observed'),
    updatedAt: nowMs
  };
}

// A target we damaged can leave the engagement without ever producing kill
// evidence: the engagement is released for an unrelated reason (target switch,
// stale frame, escape) and the opponent dies moments later to someone else.
// Nothing then created a settlement key, so the whole drop race left no trace
// and "we did the damage, another player looted it" could not be detected
// afterwards.  This builds the missing attribution evidence from own damage
// progress alone.
//
// Diagnostic only.  It never selects a target, never authorizes fire, never
// moves, and never gates an exit; it only opens a settlement so the existing
// drop-race observation can record who gained Drop.  Every input is observable
// self/opponent state -- damage we dealt, the last observed HP, and whether the
// opponent is still visibly alive -- with no identity, name or window involved.
function ownDamageSettlementEvidenceCore(input = {}, options = {}) {
  const id = valueId(input.targetId);
  const damage = finiteNumber(input.damageFromStart);
  const lastHp = finiteNumber(input.lastObservedHp);
  const minDamage = Math.max(1, Number(options.minDamage ?? 1));
  const maxHp = Math.max(1, Number(options.lowHpThreshold ?? 50));
  const base = {
    active: false,
    targetId: id,
    damageFromStart: damage,
    lastObservedHp: lastHp,
    minDamage,
    lowHpThreshold: maxHp
  };
  if (!id) return { ...base, reason: 'missing-target-id' };
  if (input.authority !== 'realtime') return { ...base, reason: 'non-realtime-evidence' };
  if (damage === null || damage < minDamage) return { ...base, reason: 'no-own-damage-progress' };
  if (input.visiblyAlive === true) return { ...base, reason: 'target-still-visibly-alive' };
  // Without a low last-known HP the disappearance is at least as likely to be a
  // healthy opponent walking out of view, and a settlement there would invent a
  // drop race that never happened.
  if (lastHp === null || lastHp > maxHp) return { ...base, reason: 'last-observed-hp-not-low' };
  return {
    ...base,
    active: true,
    reason: 'own-damage-progress-without-kill-evidence'
  };
}

function ownDamagePostKillSettlement(evidence, context, options = {}) {
  const id = valueId(evidence?.targetId ?? evidence?.target_id);
  if (!id || evidence?.authority !== 'realtime') return null;
  const nowMs = Number.isFinite(Number(context?.nowMs)) ? Number(context.nowMs) : Date.now();
  const confirmedMs = Math.max(250, Number(options.confirmedMs ?? 5000));
  const observedTick = snapshotTick(context);
  const eventTick = evidenceTick(evidence);
  const eventAtMs = evidenceAtMs(evidence) || nowMs;
  const remembered = matchingTargetMemory(context, id);
  const rememberedDrop = knownTargetDrop(remembered);
  const evidenceDrop = knownTargetDrop(evidence);
  const drop = evidenceDrop.known ? evidenceDrop : rememberedDrop;
  return {
    active: true,
    phase: 'drop-pending',
    targetId: id,
    targetName: String(evidence.targetName || evidence.target_name || remembered?.name || ''),
    targetDrop: drop.known ? drop.value : null,
    targetDropKnown: drop.known,
    x: firstFiniteNumber(evidence.x, remembered?.x),
    y: firstFiniteNumber(evidence.y, remembered?.y),
    startedAt: nowMs,
    confirmedAt: nowMs,
    expiresAt: nowMs + confirmedMs,
    matchedCoinKey: '',
    matchedCoinAmount: null,
    matchedCoinCreatedTick: null,
    matchedCoinAuthority: '',
    matchedCoinObservedAtMs: 0,
    evidenceKey: `own-damage:${id}:${eventTick !== null ? `tick:${eventTick}` : `at:${eventAtMs}`}`,
    lastSnapshotTick: observedTick,
    evidenceMinTick: eventTick,
    evidenceMinAtMs: eventAtMs,
    confirmedEvidenceTick: eventTick,
    // Reuses the primary-target reappearance guard: a target that shows up alive
    // again immediately settles instead of holding a phantom drop race open.
    primaryTargetDropPriority: false,
    ownDamageAttribution: true,
    ownDamageFromStart: finiteNumber(evidence.damageFromStart),
    ownDamageLastObservedHp: finiteNumber(evidence.lastObservedHp),
    killAttribution: 'external-or-unknown',
    authority: 'realtime',
    reason: String(evidence.reason || 'own-damage-progress-without-kill-evidence'),
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
  if ((state.primaryTargetDropPriority === true || state.ownDamageAttribution === true)
    && visible
    && visible.alive !== false
    && Number(visible.hp ?? 1) > 0) {
    return terminalPostKillSettlement(state, nowMs, 'settled', 'target-reappeared-alive');
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
    state.matchedCoinAuthority = coinAuthority(coin);
    state.matchedCoinObservedAtMs = coinObservedAtMs(coin, nowMs);
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
  // Nothing is left to wait for once the drop is already ours.  Without this the
  // only remaining exit from `drop-pending` is the timeout, so a kill inside our
  // pickup radius always burned the full window after the coin was collected.
  const pickup = matchingPickupEvidence(context, state, options);
  if (pickup) {
    const pickupKey = coinKey(pickup);
    if (pickupKey && options.consumedPickupKeys instanceof Set) {
      options.consumedPickupKeys.add(pickupKey);
    }
    const settled = terminalPostKillSettlement(state, nowMs, 'settled', 'matched-drop-picked-up');
    settled.matchedCoinKey = coinKey(pickup) || state.matchedCoinKey || '';
    settled.matchedCoinAmount = finiteNumber(pickup.amount);
    settled.matchedCoinAuthority = pickupEvidenceAuthority(pickup);
    settled.matchedCoinObservedAtMs = timestampMs(pickup.at ?? pickup.atMs ?? pickup.observedAtMs) || nowMs;
    settled.pickupEvidence = true;
    settled.pickupEvidenceReason = String(pickup.reason || '');
    settled.reason = 'matched-drop-picked-up';
    return settled;
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
  // Shared across every settlement updated in this pass so one collected coin can
  // settle only one kill.  Also seeded with the coins already claimed by retained
  // generations, so a replayed pickup row cannot settle a second kill later.
  const consumedPickupKeys = new Set(Object.values(states)
    .filter(state => state?.pickupEvidence === true)
    .map(state => valueId(state?.matchedCoinKey))
    .filter(Boolean));
  const explicitOptions = { confirmedMs, pickupMs, consumedPickupKeys };

  for (const [key, state] of Object.entries(states)) {
    if ((!key.startsWith('evidence:') && !key.startsWith('primary:') && !key.startsWith('own-damage:'))
      || !settlementStateIsActive(state)) continue;
    states[key] = updateExplicitPostKillSettlement(state, context, explicitOptions);
  }

  const primaryEvidence = context.primaryTargetSettlementEvidence;
  if (primaryEvidence?.active !== false && primaryEvidence?.authority === 'realtime') {
    const created = primaryTargetPostKillSettlement(primaryEvidence, context, { confirmedMs });
    const key = created?.evidenceKey || '';
    if (created && key && !Object.prototype.hasOwnProperty.call(seenEvidenceKeys, key)) {
      seenEvidenceKeys[key] = nowMs;
      states[key] = updateExplicitPostKillSettlement(created, context, explicitOptions);
    }
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
        states[key] = updateExplicitPostKillSettlement(created, context, explicitOptions);
      }
    } else if (!states[key] || !settlementStateIsActive(states[key])) {
      // A terminal/tombstone state is deliberately not re-armed by the
      // historical selfKillEvidence list, which is retained by the server.
      continue;
    }
  }

  // Own-damage attribution runs after both evidence-backed paths so a real kill
  // or a primary-disappearance settlement always owns the target first; this only
  // fills the gap where neither exists.
  const ownDamageEvidence = Array.isArray(context.ownDamageSettlementEvidence)
    ? context.ownDamageSettlementEvidence
    : (context.ownDamageSettlementEvidence ? [context.ownDamageSettlementEvidence] : []);
  for (const item of ownDamageEvidence) {
    if (item?.active === false) continue;
    const id = valueId(item?.targetId ?? item?.target_id);
    if (!id) continue;
    const alreadyTracked = Object.values(states).some(state => valueId(state?.targetId) === id
      && settlementStateIsActive(state));
    if (alreadyTracked) continue;
    const created = ownDamagePostKillSettlement(item, context, { confirmedMs });
    const key = created?.evidenceKey || '';
    if (!created || !key || Object.prototype.hasOwnProperty.call(seenEvidenceKeys, key)) continue;
    seenEvidenceKeys[key] = nowMs;
    states[key] = updateExplicitPostKillSettlement(created, context, explicitOptions);
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
    tickMs: options.tickMs,
    consumedPickupKeys
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

  // The legacy disappearance settlement is created after the own-damage block above, so a
  // target can pick up both records in the same tick: the own-damage creation check cannot see
  // a state that does not exist yet. Drop the weaker duplicate here, once every evidence-backed
  // path has had its turn. Evidence-backed settlements always win, and an own-damage record is
  // only ever removed while a real one is actively tracking the same target.
  for (const [key, state] of Object.entries(states)) {
    if (!key.startsWith('own-damage:') || !settlementStateIsActive(state)) continue;
    const id = valueId(state?.targetId);
    if (!id) continue;
    const supersededBy = Object.entries(states).find(([otherKey, other]) => otherKey !== key
      && other?.ownDamageAttribution !== true
      && valueId(other?.targetId) === id
      && settlementStateIsActive(other));
    if (supersededBy) delete states[key];
  }

  const orderedEntries = Object.entries(states)
    .sort((left, right) => {
      const leftState = left[1];
      const rightState = right[1];
      const leftActive = Number(settlementStateIsActive(leftState));
      const rightActive = Number(settlementStateIsActive(rightState));
      return rightActive - leftActive
        // Diagnostic own-damage records rank below evidence-backed ones so they
        // can never push a real settlement out of the bounded window.
        || Number(leftState?.ownDamageAttribution === true)
          - Number(rightState?.ownDamageAttribution === true)
        || Number(rightState?.primaryTargetDropPriority === true)
          - Number(leftState?.primaryTargetDropPriority === true)
        || Number(rightState?.phase === 'drop-visible') - Number(leftState?.phase === 'drop-visible')
        || Number(rightState?.matchedCoinAmount || rightState?.targetDrop || 0)
          - Number(leftState?.matchedCoinAmount || leftState?.targetDrop || 0)
        || Number(rightState?.updatedAt || rightState?.startedAt || 0)
          - Number(leftState?.updatedAt || leftState?.startedAt || 0);
    });
  const boundedStates = Object.fromEntries(orderedEntries.slice(0, maxEntries));
  // Own-damage attribution is observability, not a commitment: it must never be
  // selected, because `selected` is what drives settlement approach movement,
  // drop-priority coin labelling and the restart-readiness blocker.  It stays in
  // `states` so the drop-race observer can record who actually gained Drop.
  const active = Object.values(boundedStates)
    .filter(state => settlementStateIsActive(state) && state?.ownDamageAttribution !== true)
    .sort((left, right) => (
      Number(right.primaryTargetDropPriority === true) - Number(left.primaryTargetDropPriority === true)
        || Number(right.phase === 'drop-visible') - Number(left.phase === 'drop-visible')
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
  primaryTargetPostKillSettlement,
  ownDamageSettlementEvidenceCore,
  ownDamagePostKillSettlement,
  settlementSummary,
  updatePostKillSettlementCore,
  updatePostKillSettlementsCore,
  postKillEvidenceKey
};
