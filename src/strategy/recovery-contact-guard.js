'use strict';

const DEFAULT_ATTACK_RANGE_CM = 14500;
const DEFAULT_GUARD_BUFFER_CM = 5000;
const DEFAULT_RELEASE_BUFFER_CM = 2000;
const DEFAULT_CONFIRMATIONS = 2;
const DEFAULT_CLEAR_CONFIRMATIONS = 2;
const DEFAULT_HOLD_MS = 1500;
const DEFAULT_MINIMUM_CLOSING_SPEED = 20;
const DEFAULT_MINIMUM_CLOSING_ALIGNMENT = 0.65;
const DEFAULT_MINIMUM_DODGE_BUDGET_MS = 3800;

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function pointDistance(a, b) {
  const ax = numberOrNull(a?.x);
  const ay = numberOrNull(a?.y);
  const bx = numberOrNull(b?.x);
  const by = numberOrNull(b?.y);
  if (ax === null || ay === null || bx === null || by === null) return null;
  return Math.hypot(ax - bx, ay - by);
}

function targetKey(target) {
  const id = target?.userId ?? target?.user_id ?? target?.entityId ?? target?.entity_id ?? target?.id;
  return id === null || id === undefined || id === '' ? '' : String(id);
}

function previousActionWasRecoveryCore(action) {
  if (!action || typeof action !== 'object') return false;
  return (String(action.kind || '') === 'recover' && String(action.band || '') === 'recover')
    || String(action.reason || '') === 'wait-for-full-stamina-and-hp';
}

function targetSnapshot(target, distance) {
  return {
    userId: target?.userId ?? target?.user_id ?? null,
    entityId: target?.entityId ?? target?.entity_id ?? null,
    name: String(target?.name || ''),
    x: numberOrNull(target?.x),
    y: numberOrNull(target?.y),
    distance: numberOrNull(distance),
    active: Boolean(target?.active),
    firing: Boolean(target?.firing || target?.is_firing || target?.shooting),
    authority: String(target?.authority || 'realtime')
  };
}

function directClosingEvidence(self, target, previous, nowMs, options = {}) {
  const selfVx = Number(self?.vx || 0);
  const selfVy = Number(self?.vy || 0);
  const targetVx = Number(target?.vx || 0);
  const targetVy = Number(target?.vy || 0);
  const relativeVx = targetVx - selfVx;
  const relativeVy = targetVy - selfVy;
  const relativeSpeed = Math.hypot(relativeVx, relativeVy);
  const dx = Number(target?.x) - Number(self?.x);
  const dy = Number(target?.y) - Number(self?.y);
  const distance = Math.max(1, Math.hypot(dx, dy));
  const radialSpeed = Number.isFinite(distance)
    ? (dx * relativeVx + dy * relativeVy) / distance
    : 0;
  const closingSpeed = Math.max(0, -radialSpeed);
  const closingAlignment = relativeSpeed > 0 ? closingSpeed / relativeSpeed : 0;
  const minimumClosingSpeed = Math.max(0, Number(
    options.recoveryContactMinimumClosingSpeed
      ?? options.minimumClosingSpeed
      ?? DEFAULT_MINIMUM_CLOSING_SPEED
  ));
  const minimumClosingAlignment = Math.max(0, Math.min(1, Number(
    options.recoveryContactMinimumClosingAlignment
      ?? options.minimumClosingAlignment
      ?? DEFAULT_MINIMUM_CLOSING_ALIGNMENT
  )));
  const velocityDirect = closingSpeed >= minimumClosingSpeed
    && closingAlignment >= minimumClosingAlignment;
  const previousDistance = numberOrNull(previous?.distance);
  const previousAt = numberOrNull(previous?.observedAt);
  const elapsedMs = previousAt === null ? 0 : Math.max(0, nowMs - previousAt);
  const historyClosingSpeed = previousDistance !== null && elapsedMs > 0
    ? Math.max(0, (previousDistance - distance) / elapsedMs * 1000)
    : 0;
  const historyDirect = historyClosingSpeed >= minimumClosingSpeed;
  return {
    direct: velocityDirect || historyDirect,
    velocityDirect,
    historyDirect,
    closingSpeed: Math.round(Math.max(closingSpeed, historyClosingSpeed) * 100) / 100,
    closingAlignment: Math.round(closingAlignment * 1000) / 1000
  };
}

function recoveryContactRanges(options = {}) {
  const attackRange = Math.max(0, Number(
    options.recoveryContactAttackRangeCm
      ?? options.combatAttackRange
      ?? options.attackRange
      ?? DEFAULT_ATTACK_RANGE_CM
  ));
  const guardBuffer = Math.max(0, Number(
    options.recoveryContactGuardBufferCm
      ?? DEFAULT_GUARD_BUFFER_CM
  ));
  const releaseBuffer = Math.max(0, Number(
    options.recoveryContactReleaseBufferCm
      ?? DEFAULT_RELEASE_BUFFER_CM
  ));
  return {
    attackRange,
    guardBuffer,
    guardRange: attackRange + guardBuffer,
    releaseBuffer,
    releaseRange: attackRange + guardBuffer + releaseBuffer
  };
}

function selfStamina5s(self) {
  return numberOrNull(
    self?.stamina_5s_remaining_milli
      ?? self?.stamina5sRemainingMilli
      ?? self?.stamina5s
      ?? self?.stamina_5s
  );
}

function updateRecoveryContactGuardCore(previousState, context = {}, options = {}) {
  const nowMs = Number(context.nowMs || Date.now());
  const self = context.self || null;
  if (!self || context.recovering !== true) {
    return { state: null, decision: null, reason: self ? 'recovery-finished' : 'missing-self' };
  }
  const previous = previousState && typeof previousState === 'object' ? previousState : null;
  const recoveryCommitted = previousActionWasRecoveryCore(context.previousAction);
  if (!previous?.armedByRecovery && !recoveryCommitted) {
    return { state: null, decision: null, reason: 'recovery-not-committed' };
  }

  const ranges = recoveryContactRanges(options);
  const realBulletOwners = new Set((context.realBulletOwnerIds || []).map(String).filter(Boolean));
  const targets = (context.targets || [])
    .filter(target => target && target.alive !== false)
    .filter(target => !target.authority || target.authority === 'realtime')
    .map(target => {
      const id = targetKey(target);
      const distance = numberOrNull(target.distance) ?? pointDistance(self, target);
      const firing = Boolean(target.firing || target.is_firing || target.shooting);
      const realBullet = Boolean(id && realBulletOwners.has(id));
      const active = Boolean(target.active || firing || realBullet);
      return { target, id, distance, firing, realBullet, active };
    })
    .filter(item => item.id && item.active && item.distance !== null)
    .sort((left, right) => Number(left.distance) - Number(right.distance));

  const lockedId = String(previous?.targetId || '');
  let selected = lockedId
    ? targets.find(item => item.id === lockedId && item.distance <= ranges.releaseRange) || null
    : null;
  if (!selected && lockedId) {
    selected = targets.find(item => (
      item.distance <= ranges.guardRange
        && (item.firing || item.realBullet || item.distance <= ranges.attackRange)
    )) || null;
  }
  if (!selected && !lockedId) {
    selected = targets.find(item => item.distance <= ranges.guardRange) || null;
  }

  const holdMs = Math.max(0, Number(options.recoveryContactHoldMs ?? DEFAULT_HOLD_MS));
  const clearRequired = Math.max(1, Number(
    options.recoveryContactClearConfirmations
      ?? DEFAULT_CLEAR_CONFIRMATIONS
  ));
  if (!selected && previous?.active) {
    const observationKey = context.observationKey ?? nowMs;
    const freshObservation = observationKey !== previous.lastObservationKey;
    const clearConfirmations = Number(previous.clearConfirmations || 0) + (freshObservation ? 1 : 0);
    const holdComplete = nowMs >= Number(previous.holdUntil || 0);
    if (clearConfirmations >= clearRequired && holdComplete) {
      return { state: null, decision: null, reason: 'threat-missing-confirmed' };
    }
    const retainedState = { ...previous, clearConfirmations, lastObservationKey: observationKey };
    return {
      state: retainedState,
      decision: {
        mode: 'retreat',
        reason: 'recovery-contact-guard-retreat',
        target: previous.lastTarget || null,
        retained: true,
        evidence: previous.evidence || null,
        ranges
      },
      reason: 'threat-missing-hysteresis'
    };
  }
  if (!selected) {
    return { state: null, decision: null, reason: 'no-recovery-contact' };
  }

  const sameTarget = selected.id === lockedId;
  const observationKey = context.observationKey ?? nowMs;
  const freshObservation = !sameTarget || observationKey !== previous?.lastObservationKey;
  const closing = directClosingEvidence(
    self,
    selected.target,
    sameTarget ? previous : null,
    nowMs,
    options
  );
  const inRange = selected.distance <= ranges.attackRange;
  const strongEvidence = selected.firing || selected.realBullet || inRange;
  const ordinaryEvidence = closing.direct;
  const confirmationsRequired = Math.max(1, Number(
    options.recoveryContactConfirmations
      ?? DEFAULT_CONFIRMATIONS
  ));
  const priorConfirmations = sameTarget ? Number(previous?.closingConfirmations || 0) : 0;
  const closingConfirmations = freshObservation && ordinaryEvidence
    ? priorConfirmations + 1
    : (ordinaryEvidence ? priorConfirmations : 0);
  const confirmed = strongEvidence || closingConfirmations >= confirmationsRequired || previous?.active === true;
  const evidence = {
    trigger: selected.realBullet
      ? 'real-collision-bullet'
      : (selected.firing
          ? 'target-firing'
          : (inRange ? 'entered-attack-range' : 'direct-closing-confirmed')),
    firing: selected.firing,
    realBullet: selected.realBullet,
    inRange,
    directClosing: closing.direct,
    velocityDirect: closing.velocityDirect,
    historyDirect: closing.historyDirect,
    closingSpeed: closing.closingSpeed,
    closingAlignment: closing.closingAlignment,
    closingConfirmations,
    confirmationsRequired
  };
  const nextState = {
    armedByRecovery: true,
    active: confirmed,
    targetId: selected.id,
    observedAt: nowMs,
    lastObservationKey: observationKey,
    distance: selected.distance,
    lastTarget: targetSnapshot(selected.target, selected.distance),
    closingConfirmations,
    clearConfirmations: 0,
    confirmedAt: confirmed ? Number(previous?.confirmedAt || nowMs) : 0,
    holdUntil: confirmed ? Math.max(Number(previous?.holdUntil || 0), nowMs + holdMs) : 0,
    evidence
  };
  if (!confirmed) {
    return { state: nextState, decision: null, reason: ordinaryEvidence ? 'closing-confirmation-pending' : 'no-hostile-approach' };
  }

  const stamina5s = selfStamina5s(self);
  const minimumDodgeBudgetMs = Math.max(0, Number(
    options.recoveryContactMinimumDodgeBudgetMs
      ?? options.combatShootDodgeReserveMs
      ?? DEFAULT_MINIMUM_DODGE_BUDGET_MS
  ));
  const insufficientDodgeBudget = stamina5s !== null && stamina5s < minimumDodgeBudgetMs;
  const shouldLeave = inRange || selected.firing || selected.realBullet || insufficientDodgeBudget;
  return {
    state: nextState,
    decision: {
      mode: shouldLeave ? 'leave' : 'retreat',
      reason: shouldLeave
        ? (insufficientDodgeBudget && !inRange && !selected.firing && !selected.realBullet
            ? 'recovery-contact-no-dodge-budget-leave'
            : 'recovery-contact-threat-leave')
        : 'recovery-contact-guard-retreat',
      target: selected.target,
      retained: previous?.active === true,
      evidence,
      stamina5s,
      minimumDodgeBudgetMs,
      insufficientDodgeBudget,
      ranges
    },
    reason: shouldLeave ? 'confirmed-contact-leave' : 'confirmed-contact-retreat'
  };
}

module.exports = {
  previousActionWasRecoveryCore,
  recoveryContactRanges,
  updateRecoveryContactGuardCore
};
