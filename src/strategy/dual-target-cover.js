'use strict';

const DEFAULT_COVER_PICKUP_RADIUS_CM = 150;
const DEFAULT_COVER_MARGIN_CM = 140;
const DEFAULT_COVER_POSITION_FRESH_MS = 500;
const DEFAULT_COVER_MAX_PRIMARY_DISTANCE_CM = 3000;
const DEFAULT_COVER_HOLD_DISTANCE_CM = 100;
const DEFAULT_COVER_DIRECTION_HOLD_MS = 500;
const DEFAULT_COVER_PULSE_MS = 120;

function idOf(value) {
  const id = value?.user_id ?? value?.userId ?? value?.id ?? value?.entity_id ?? value?.entityId;
  return id === null || id === undefined || id === '' ? '' : String(id);
}

function pointOf(value) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function subtract(a, b) {
  return { x: a.x - b.x, y: a.y - b.y };
}

function lengthOf(vector) {
  return Math.hypot(vector.x, vector.y);
}

function unit(vector) {
  const length = lengthOf(vector);
  return length > 0 ? { x: vector.x / length, y: vector.y / length } : null;
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y;
}

function cross(a, b) {
  return a.x * b.y - a.y * b.x;
}

function directionOf(value) {
  const dx = Math.sign(Number(value?.dx ?? value?.x ?? 0));
  const dy = Math.sign(Number(value?.dy ?? value?.y ?? 0));
  return { dx, dy };
}

function finiteAge(input, nowMs, options) {
  if (input.positionFresh === false) return false;
  const ageMs = Number(input.positionAgeMs ?? input.realtimeAgeMs);
  if (!Number.isFinite(ageMs)) return true;
  return ageMs <= Math.max(
    1,
    Number(options.coverPositionFreshMs ?? DEFAULT_COVER_POSITION_FRESH_MS)
  );
}

function invulnerable(value, nowMs = Date.now()) {
  return Boolean(
    value?.invulnerable === true
      || value?.isInvulnerable === true
      || value?.protected === true
      || value?.invulnerableProtectionLeaseUntilMs > Number(nowMs)
  );
}

function isPassivePrimary(primary, input) {
  if (input.primaryEstablished === true) return true;
  if (input.primaryPassive === true || input.primaryAfk === true) return true;
  const mode = String(primary?.current_join_mode ?? primary?.currentJoinMode ?? primary?.mode ?? '').toLowerCase();
  return primary?.active === false || mode === 'passive' || mode === 'afk' || mode === 'idle';
}

function bulletDirection(bullet) {
  const explicit = unit({
    x: Number(bullet?.dirX ?? bullet?.directionX ?? bullet?.vx),
    y: Number(bullet?.dirY ?? bullet?.directionY ?? bullet?.vy)
  });
  if (explicit) return explicit;
  const start = pointOf({
    x: bullet?.startX ?? bullet?.start_x ?? bullet?.x,
    y: bullet?.startY ?? bullet?.start_y ?? bullet?.y
  });
  const target = pointOf({
    x: bullet?.targetX ?? bullet?.target_x ?? bullet?.endX,
    y: bullet?.targetY ?? bullet?.target_y ?? bullet?.endY
  });
  return start && target ? unit(subtract(target, start)) : null;
}

function findIncomingBullet(input, attackerId) {
  if (input.incomingBullet && typeof input.incomingBullet === 'object') return input.incomingBullet;
  return (input.bullets || []).find(bullet => (
    bullet?.incoming === true
      && (!attackerId || idOf({ userId: bullet.ownerId ?? bullet.owner_user_id }) === attackerId)
  )) || null;
}

function stableDirection(previous, candidate, nowMs, options) {
  const previousDirection = directionOf(previous?.direction);
  const candidateDirection = directionOf(candidate);
  const same = previousDirection.dx === candidateDirection.dx
    && previousDirection.dy === candidateDirection.dy;
  if (same || !previous?.active) return { direction: candidateDirection, held: false };
  const opposite = previousDirection.dx === -candidateDirection.dx
    && previousDirection.dy === -candidateDirection.dy
    && (previousDirection.dx !== 0 || previousDirection.dy !== 0);
  const ageMs = Math.max(0, nowMs - Number(previous.lastDirectionAtMs || 0));
  if (opposite && ageMs < Math.max(
    0,
    Number(options.coverDirectionHoldMs ?? DEFAULT_COVER_DIRECTION_HOLD_MS)
  )) {
    return { direction: previousDirection, held: true };
  }
  return { direction: candidateDirection, held: false };
}

function release(reason, detail = {}) {
  return {
    state: 'released',
    candidate: false,
    active: false,
    authority: 'realtime',
    coverHypothesis: 'cover-hypothesis-unverified',
    releaseReason: reason,
    ...detail
  };
}

/**
 * Conservative A -> P -> S cover hypothesis. Geometry never claims server
 * collision immunity; it only produces a bounded movement suggestion while
 * all three positions and an incoming bullet corridor are realtime/fresh.
 */
function evaluateCoverCandidateCore(input = {}, options = {}) {
  const nowMs = Number.isFinite(Number(input.nowMs)) ? Number(input.nowMs) : Date.now();
  const self = input.self || {};
  const attacker = input.attacker || input.secondary || {};
  const primary = input.primary || input.primaryTarget || {};
  const selfPoint = pointOf(self);
  const attackerPoint = pointOf(attacker);
  const primaryPoint = pointOf(primary);
  const attackerId = idOf(attacker);
  const primaryId = idOf(primary);
  const previous = input.previous && typeof input.previous === 'object' ? input.previous : null;
  const pickupRadiusCm = Math.max(
    1,
    Number(options.playerDropPickupRadiusCm ?? DEFAULT_COVER_PICKUP_RADIUS_CM)
  );
  const marginCm = Math.max(1, Number(options.coverMarginCm ?? DEFAULT_COVER_MARGIN_CM));
  const maxPrimaryDistanceCm = Math.max(
    pickupRadiusCm,
    Number(options.coverMaxPrimaryDistanceCm ?? DEFAULT_COVER_MAX_PRIMARY_DISTANCE_CM)
  );
  const holdDistanceCm = Math.min(
    pickupRadiusCm,
    Math.max(1, Number(options.coverHoldDistanceCm ?? DEFAULT_COVER_HOLD_DISTANCE_CM))
  );
  const targetInvulnerable = invulnerable(primary, nowMs);
  const base = {
    attackerId,
    primaryId,
    selfDistanceToPrimaryCm: selfPoint && primaryPoint ? lengthOf(subtract(selfPoint, primaryPoint)) : null,
    crossTrackCm: null,
    corridorMarginCm: marginCm,
    targetInvulnerable,
    positionFresh: finiteAge(input, nowMs, options),
    coverHypothesis: 'cover-hypothesis-unverified',
    authority: 'realtime'
  };
  if (!selfPoint || !attackerPoint || !primaryPoint) return release('missing-realtime-position', base);
  if (!finiteAge(input, nowMs, options)) return release('realtime-position-stale', base);
  if (!primaryId) return release('primary-missing-id', base);
  if (primary.alive === false || Number(primary.hp) <= 0) return release('primary-dead', base);
  if (targetInvulnerable) return release('primary-invulnerable', base);
  if (!isPassivePrimary(primary, input)) return release('primary-not-passive-or-established', base);

  const selfDistanceToPrimary = lengthOf(subtract(selfPoint, primaryPoint));
  if (selfDistanceToPrimary > maxPrimaryDistanceCm) {
    return release('primary-too-far-for-cover-continuity', {
      ...base,
      selfDistanceToPrimaryCm: selfDistanceToPrimary
    });
  }
  const attackerToSelf = subtract(selfPoint, attackerPoint);
  const attackerToSelfDistance = lengthOf(attackerToSelf);
  const attackerToPrimary = subtract(primaryPoint, attackerPoint);
  const primaryToSelf = subtract(selfPoint, primaryPoint);
  const primaryProjection = attackerToSelfDistance > 0
    ? dot(attackerToPrimary, attackerToSelf) / (attackerToSelfDistance * attackerToSelfDistance)
    : -1;
  const crossTrackCm = attackerToSelfDistance > 0
    ? Math.abs(cross(attackerToPrimary, attackerToSelf)) / attackerToSelfDistance
    : Infinity;
  const distanceOrder = lengthOf(attackerToPrimary) < attackerToSelfDistance
    && selfDistanceToPrimary < attackerToSelfDistance;
  const between = primaryProjection >= 0 && primaryProjection <= 1;
  const bullet = findIncomingBullet(input, attackerId);
  const bulletDir = bulletDirection(bullet);
  const attackerDirection = unit(attackerToSelf);
  const alignmentCos = bulletDir && attackerDirection ? dot(bulletDir, attackerDirection) : null;
  const minimumAlignmentCos = Number(options.coverMinimumAlignmentCos ?? 0.75);
  const bulletStart = pointOf({
    x: bullet?.startX ?? bullet?.start_x ?? bullet?.x,
    y: bullet?.startY ?? bullet?.start_y ?? bullet?.y
  });
  const bulletOriginDistanceCm = bulletStart ? lengthOf(subtract(bulletStart, attackerPoint)) : null;
  const originMaxDistanceCm = Math.max(1, Number(options.coverBulletOriginMaxDistanceCm ?? 2500));
  const bulletCorridor = Boolean(
    bullet
      && bulletDir
      && attackerDirection
      && alignmentCos >= minimumAlignmentCos
      && (bulletOriginDistanceCm === null || bulletOriginDistanceCm <= originMaxDistanceCm)
  );
  const geometry = distanceOrder && between && crossTrackCm <= marginCm && bulletCorridor;
  const candidateDirectionVector = unit(attackerToPrimary) || { x: 0, y: 0 };
  const desiredPoint = {
    x: primaryPoint.x + candidateDirectionVector.x * holdDistanceCm,
    y: primaryPoint.y + candidateDirectionVector.y * holdDistanceCm
  };
  const towardDesired = subtract(desiredPoint, selfPoint);
  const candidateDirection = {
    dx: Math.sign(towardDesired.x),
    dy: Math.sign(towardDesired.y)
  };
  const stabilized = stableDirection(previous, candidateDirection, nowMs, options);
  const direction = stabilized.direction;
  const holdingPosition = selfDistanceToPrimary <= pickupRadiusCm
    && crossTrackCm <= marginCm;
  const state = geometry && holdingPosition ? 'cover-hold' : (geometry ? 'cover-candidate' : 'released');
  if (!geometry) {
    return release(
      !bulletCorridor
        ? 'incoming-bullet-corridor-invalid'
        : (crossTrackCm > marginCm
          ? 'primary-outside-cover-corridor'
          : (!distanceOrder || !between ? 'attacker-primary-self-order-invalid' : 'primary-outside-cover-corridor')),
      {
        ...base,
        selfDistanceToPrimaryCm: selfDistanceToPrimary,
        crossTrackCm,
        primaryProjection,
        distanceOrder,
        between,
        bulletCorridor,
        alignmentCos,
        bulletOriginDistanceCm
      }
    );
  }
  return {
    ...base,
    state,
    candidate: true,
    active: true,
    attackerId,
    primaryId,
    selfDistanceToPrimaryCm: selfDistanceToPrimary,
    crossTrackCm,
    primaryProjection,
    distanceOrder,
    between,
    bulletCorridor,
    alignmentCos,
    bulletOriginDistanceCm,
    targetInvulnerable: false,
    direction,
    desiredPoint,
    holdingPosition,
    pulse: {
      dx: direction.dx,
      dy: direction.dy,
      maxPulseMs: Math.max(50, Number(options.coverPulseMs ?? DEFAULT_COVER_PULSE_MS)),
      repeatSuppressed: stabilized.held || (
        holdingPosition && direction.dx === 0 && direction.dy === 0
      )
    },
    directionHeld: stabilized.held,
    releaseReason: '',
    reason: state === 'cover-hold' ? 'cover-hold' : 'cover-candidate'
  };
}

module.exports = {
  DEFAULT_COVER_DIRECTION_HOLD_MS,
  DEFAULT_COVER_HOLD_DISTANCE_CM,
  DEFAULT_COVER_MARGIN_CM,
  DEFAULT_COVER_MAX_PRIMARY_DISTANCE_CM,
  DEFAULT_COVER_PICKUP_RADIUS_CM,
  DEFAULT_COVER_POSITION_FRESH_MS,
  DEFAULT_COVER_PULSE_MS,
  evaluateCoverCandidateCore
};
