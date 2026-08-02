'use strict';

const { calculateDodgeDirection } = require('../../strategy/combat-movement');
const {
  normalizeCombatBullet,
  normalizeCombatEntity,
  summarizeCombatTarget
} = require('./combat-adapter');

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function targetId(target) {
  const value = target?.userId ?? target?.user_id ?? target?.entityId ?? target?.entity_id ?? target?.id;
  return value === null || value === undefined || value === '' ? '' : String(value);
}

function pendingTargetId(pending = {}) {
  const decision = pending.triggerDecision || null;
  const eventDecision = pending.event?.detail?.decision || null;
  const candidates = [
    pending.target,
    decision?.action?.target,
    decision?.combat?.target,
    eventDecision?.target,
    eventDecision?.combat?.target
  ];
  for (const candidate of candidates) {
    const id = targetId(candidate);
    if (id) return id;
  }
  return '';
}

function findLockedTarget(state, pending, self, options = {}) {
  const lockedId = pendingTargetId(pending);
  if (!lockedId) return null;
  const entity = (state?.realtime?.entities || []).find(item => targetId(item) === lockedId) || null;
  return entity ? normalizeCombatEntity(entity, self, options) : null;
}

function appendIncomingBullet(incoming, normalized, selfId, maximumDistance) {
  if (!normalized) return;
  const ownerValue = normalized.ownerId;
  const owner = ownerValue === null || ownerValue === undefined || ownerValue === ''
    ? ''
    : String(ownerValue);
  if (!owner || (selfId && owner !== selfId)) normalized.incoming = true;
  if (!normalized.incoming) return;
  const distance = Number(normalized.distance);
  if (!Number.isFinite(distance) || distance >= maximumDistance) return;
  const timeToImpact = Number(normalized.timeToImpact);
  if (!Number.isFinite(timeToImpact) || timeToImpact <= 0) return;
  incoming.push(normalized);
}

function filterNormalizedIncomingBullets(bullets, self, options = {}) {
  const selfId = targetId(self);
  const maximumDistance = Math.max(1000, Number(options.leavePendingBulletMaxDistanceCm || 20000));
  const incoming = [];
  for (const normalized of bullets || []) {
    appendIncomingBullet(incoming, normalized, selfId, maximumDistance);
  }
  return incoming;
}

function normalizedIncomingBullets(state, self, options = {}) {
  const currentTick = state?.realtime?.tick;
  const selfId = targetId(self);
  const maximumDistance = Math.max(1000, Number(options.leavePendingBulletMaxDistanceCm || 20000));
  const bulletOptions = { currentTick };
  const incoming = [];
  for (const raw of state?.realtime?.bullets || []) {
    const normalized = normalizeCombatBullet(raw, self, bulletOptions);
    appendIncomingBullet(incoming, normalized, selfId, maximumDistance);
  }
  return incoming;
}

function triggerMovement(pending = {}) {
  const decision = pending.triggerDecision || null;
  const movement = decision?.combat?.movement || pending.triggerMovement || null;
  if (!movement) return null;
  const dx = Math.max(-1, Math.min(1, Math.round(Number(movement.dx || 0))));
  const dy = Math.max(-1, Math.min(1, Math.round(Number(movement.dy || 0))));
  return { dx, dy, reason: movement.reason || 'leave-trigger-cover' };
}

function targetTangentPreference(self, target) {
  if (!self || !target) return null;
  const x = Number(target.x) - Number(self.x);
  const y = Number(target.y) - Number(self.y);
  if (!x && !y) return null;
  return { dx: Math.sign(-y), dy: Math.sign(x) };
}

function sameThreatClass(candidate, safest) {
  return Number(candidate?.avoidableHits || 0) === Number(safest?.avoidableHits || 0)
    && Number(candidate?.directHits || 0) === Number(safest?.directHits || 0);
}

function preferMovingCover(dodge) {
  if (!dodge || Number(dodge.dx || 0) || Number(dodge.dy || 0)) return dodge;
  const safest = (dodge.threatField || []).find(item => (
    Number(item.dx || 0) === Number(dodge.dx || 0)
      && Number(item.dy || 0) === Number(dodge.dy || 0)
  )) || dodge.threatField?.[0] || null;
  if (!safest) return dodge;
  const moving = (dodge.threatField || []).find(item => (
    (Number(item.dx || 0) || Number(item.dy || 0))
      && sameThreatClass(item, safest)
      && Number(item.minCPA || 0) >= Number(safest.minCPA || 0) * 0.9
  ));
  return moving
    ? { ...dodge, dx: moving.dx, dy: moving.dy, reason: 'safe-moving-leave-cover' }
    : dodge;
}

function noBulletCover(self, target, pending = {}) {
  const trigger = triggerMovement(pending);
  if (trigger && (trigger.dx || trigger.dy)) return trigger;
  const current = {
    dx: Math.sign(Number(self?.vx || 0)),
    dy: Math.sign(Number(self?.vy || 0)),
    reason: 'leave-pending-hold-current-motion'
  };
  if (current.dx || current.dy) return current;
  if (self && target) {
    const dx = Math.sign(Number(self.x) - Number(target.x));
    const dy = Math.sign(Number(self.y) - Number(target.y));
    if (dx || dy) return { dx, dy, reason: 'leave-pending-back-away' };
    return { dx: 1, dy: 0, reason: 'leave-pending-overlap-escape' };
  }
  return { dx: 0, dy: 0, reason: 'leave-pending-no-visible-pressure' };
}

function selectedThreat(threatField, dx, dy) {
  return (threatField || []).find(item => Number(item.dx) === Number(dx) && Number(item.dy) === Number(dy)) || null;
}

function leavePendingDecision(cover) {
  return {
    cover,
    decision: {
      kind: 'leave-pending-cover',
      band: 'safety',
      reason: cover.reason,
      tick: cover.tick,
      at: new Date(cover.atMs).toISOString(),
      action: {
        kind: 'leave-pending-cover',
        band: 'safety',
        reason: cover.reason,
        shouldLeave: true,
        leavePending: true,
        dx: cover.dx,
        dy: cover.dy,
        target: cover.target,
        cover
      },
      leavePending: cover
    }
  };
}

function triggerCoverFromPending(state, pending = {}, options = {}) {
  const decision = pending.triggerDecision || null;
  const action = decision?.action || decision || {};
  const existing = action?.leaveRisk?.lastCover || decision?.leaveRisk?.lastCover || null;
  const movement = decision?.combat?.movement || null;
  if (!existing && !movement) return null;
  let chosen = existing || movement;
  const threatField = movement?.dodge?.threatField || existing?.threatField || null;
  if (!existing && movement?.dodge && Array.isArray(threatField)) {
    chosen = preferMovingCover({
      ...movement.dodge,
      dx: movement.dx,
      dy: movement.dy,
      reason: movement.reason,
      threatField
    });
  }
  const dx = Math.max(-1, Math.min(1, Math.round(Number(chosen?.dx || 0))));
  const dy = Math.max(-1, Math.min(1, Math.round(Number(chosen?.dy || 0))));
  const threat = selectedThreat(threatField, dx, dy);
  const previous = pending.lastCover || null;
  const target = existing?.target || action?.target || decision?.combat?.target || pending.target || null;
  const cover = {
    ...(existing || {}),
    atMs: Number(options.nowMs || Date.now()),
    tick: state?.realtime?.tick ?? decision?.tick ?? existing?.tick ?? null,
    dx,
    dy,
    reason: String(chosen?.reason || movement?.reason || existing?.reason || 'leave-trigger-cover'),
    changed: !previous || Number(previous.dx) !== dx || Number(previous.dy) !== dy,
    target,
    targetLocked: Boolean(pendingTargetId(pending)),
    incomingBulletCount: numberOrNull(existing?.incomingBulletCount)
      ?? Math.max(0, Number(decision?.input?.realtime?.bulletCount || 0)),
    incomingOwnerIds: Array.isArray(existing?.incomingOwnerIds) ? existing.incomingOwnerIds : [],
    incomingBulletIds: Array.isArray(existing?.incomingBulletIds) ? existing.incomingBulletIds : [],
    directHits: numberOrNull(existing?.directHits ?? threat?.directHits) ?? 0,
    avoidableHits: numberOrNull(existing?.avoidableHits ?? threat?.avoidableHits) ?? 0,
    unavoidableHits: numberOrNull(existing?.unavoidableHits ?? threat?.unavoidableHits) ?? 0,
    minCPA: numberOrNull(existing?.minCPA ?? threat?.minCPA),
    minTTI: numberOrNull(existing?.minTTI ?? threat?.minTTI),
    threatField
  };
  return leavePendingDecision(cover);
}

function buildLeavePendingCover(state = {}, pending = {}, options = {}) {
  const self = state?.realtime?.self || null;
  if (!self) return null;
  if (options.preferTriggerCover === true) {
    const triggerCover = triggerCoverFromPending(state, pending, options);
    if (triggerCover) return triggerCover;
  }
  const target = findLockedTarget(state, pending, self, options);
  const bullets = Array.isArray(pending.normalizedIncomingBullets)
    ? pending.normalizedIncomingBullets
    : normalizedIncomingBullets(state, self, options);
  const executionTiming = state?.command?.shooting?.timing || state?.command?.shooting?.executionDelay || {};
  const movementExecutionTiming = state?.command?.movement?.timing || {};
  let dodge = bullets.length
    ? calculateDodgeDirection(self, bullets, {
        tangentPreference: targetTangentPreference(self, target),
        target,
        moveSpeedPerTick: options.combatMoveSpeedPerTick || 50,
        hitRadius: options.combatBulletHitRadiusCm || 90,
        commandDelayP90Ticks: Number(movementExecutionTiming.p90Ticks || executionTiming.p90Ticks || 5),
        movementExecutionTiming,
        pendingVelocityCommands: state?.command?.movement?.pendingVelocityCommands || [],
        currentTick: state?.realtime?.tick,
        reactionSafetyMarginMs: options.combatReactionSafetyMarginMs ?? 100
      })
    : null;
  if (bullets.length) dodge = preferMovingCover(dodge);
  const movement = dodge || noBulletCover(self, target, pending);
  const dx = Math.max(-1, Math.min(1, Math.round(Number(movement.dx || 0))));
  const dy = Math.max(-1, Math.min(1, Math.round(Number(movement.dy || 0))));
  const threat = selectedThreat(dodge?.threatField, dx, dy);
  const previous = pending.lastCover || null;
  const changed = !previous || Number(previous.dx) !== dx || Number(previous.dy) !== dy;
  const reason = bullets.length ? (movement.reason || 'leave-pending-dodge') : movement.reason;
  const targetSummary = summarizeCombatTarget(target) || pending.target || null;
  const cover = {
    atMs: Number(options.nowMs || Date.now()),
    tick: state?.realtime?.tick ?? null,
    dx,
    dy,
    reason,
    changed,
    target: targetSummary,
    targetLocked: Boolean(pendingTargetId(pending)),
    incomingBulletCount: bullets.length,
    incomingOwnerIds: Array.from(new Set(bullets.map(bullet => targetId({ userId: bullet.ownerId })).filter(Boolean))),
    incomingBulletIds: bullets.map(bullet => String(
      bullet.bullet_id
        ?? bullet.bulletId
        ?? `${bullet.createdTick ?? ''}:${bullet.startX ?? bullet.x ?? ''}:${bullet.startY ?? bullet.y ?? ''}`
    )).filter(Boolean),
    directHits: numberOrNull(threat?.directHits) ?? 0,
    avoidableHits: numberOrNull(threat?.avoidableHits) ?? 0,
    unavoidableHits: numberOrNull(threat?.unavoidableHits) ?? 0,
    minCPA: numberOrNull(threat?.minCPA),
    minTTI: numberOrNull(threat?.minTTI),
    threatField: dodge?.threatField || null
  };
  return leavePendingDecision(cover);
}

module.exports = {
  buildLeavePendingCover,
  filterNormalizedIncomingBullets,
  normalizedIncomingBullets,
  pendingTargetId
};
