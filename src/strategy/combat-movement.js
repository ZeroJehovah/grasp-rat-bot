'use strict';

/**
 * Combat Movement and Spacing
 *
 * Handles combat positioning, spacing, dodge, and tactical movement.
 */

const { COMBAT_CONSTANTS } = require('./combat-constants');

/**
 * Calculate desired spacing distance for combat target
 *
 * @param {Object} self - Self entity
 * @param {Object} target - Combat target
 * @param {Object} context - Combat context
 * @returns {number} Desired spacing distance in cm
 */
function calculateCombatSpacing(self, target, context = {}) {
  const minSpacing = COMBAT_CONSTANTS.TARGET_SPACING_MIN;
  const maxSpacing = COMBAT_CONSTANTS.TARGET_SPACING_MAX;

  // Default to mid-range
  let spacing = (minSpacing + maxSpacing) / 2;

  // Adjust based on context
  if (context.targetPressure) {
    // Under pressure, maintain farther spacing
    spacing = maxSpacing;
  }

  if (context.highEntropyOpponent && !context.finishingTarget) {
    spacing = Math.max(8500, Math.min(10500, Number(context.safeReactionSpacingCm || 9500)));
  }

  if (context.finishingTarget) {
    // Finishing low HP target, close in
    spacing = minSpacing;
  }

  return Math.max(minSpacing, Math.min(maxSpacing, spacing));
}

/**
 * Determine if should back away from close target
 *
 * @param {Object} self - Self entity
 * @param {Object} target - Combat target
 * @returns {boolean}
 */
function shouldBackAwayFromTarget(self, target) {
  if (!target) return false;

  const distance = target.distance || Infinity;
  const closeThreshold = COMBAT_CONSTANTS.CLOSE_SPACING_THRESHOLD;

  return distance < closeThreshold;
}

/**
 * Calculate dodge direction for incoming bullets
 *
 * @param {Object} self - Self entity
 * @param {Array} bullets - Incoming bullets
 * @param {Object} options - Dodge options
 * @returns {Object} { dx, dy, reason, threatField }
 */
function calculateDodgeDirection(self, bullets, options = {}) {
  if (!bullets || !bullets.length) {
    return { dx: 0, dy: 0, reason: 'no-bullets', threatField: null };
  }

  // Filter to real incoming bullets
  const incoming = bullets.filter(b =>
    b.incoming &&
    b.distance !== undefined &&
    b.distance < 20000 &&
    b.timeToImpact !== undefined &&
    b.timeToImpact > 0
  );

  if (!incoming.length) {
    return { dx: 0, dy: 0, reason: 'no-incoming-bullets', threatField: null };
  }

  // Evaluate new directions plus holding the current velocity and stopping.
  const directions = [
    { dx: 0, dy: -1 },   // North
    { dx: 1, dy: -1 },   // NE
    { dx: 1, dy: 0 },    // East
    { dx: 1, dy: 1 },    // SE
    { dx: 0, dy: 1 },    // South
    { dx: -1, dy: 1 },   // SW
    { dx: -1, dy: 0 },   // West
    { dx: -1, dy: -1 },  // NW
    { dx: Math.sign(Number(self?.vx || 0)), dy: Math.sign(Number(self?.vy || 0)), holdCurrent: true },
    { dx: 0, dy: 0, stop: true }
  ];

  const moveSpeedPerTick = Math.max(0, Number(options.moveSpeedPerTick ?? self?.speed_per_tick ?? self?.speedPerTick ?? 50));
  const tickMs = Math.max(1, Number(options.tickMs || 50));
  const hitRadius = Math.max(1, Number(options.hitRadius || 200));
  const commandDelayTicks = Math.max(0, Number(options.commandDelayTicks ?? options.commandDelayP90Ticks ?? 5));
  const reactionBudgetMs = Math.max(0, Number(options.reactionBudgetMs
    ?? (commandDelayTicks * tickMs + tickMs + Math.max(0, Number(options.reactionSafetyMarginMs ?? 100)))));
  const currentVx = Number(self?.vx || 0);
  const currentVy = Number(self?.vy || 0);
  const threatField = directions.map(dir => {
    let directHits = 0;
    let avoidableHits = 0;
    let unavoidableHits = 0;
    let minCPA = Infinity;
    let minTTI = Infinity;

    for (const bullet of incoming) {
      const tti = Number(bullet.timeToImpact || 1000);
      const diagonalScale = dir.dx && dir.dy ? Math.SQRT1_2 : 1;
      const bulletX = Number(bullet.x);
      const bulletY = Number(bullet.y);
      const directionX = Number(bullet.direction?.dx);
      const directionY = Number(bullet.direction?.dy);
      const bulletSpeed = Number(bullet.speed || COMBAT_CONSTANTS.BULLET_SPEED_CM_PER_TICK);
      let cpa = Number(bullet.cpa ?? bullet.distance ?? Infinity);
      if ([bulletX, bulletY, directionX, directionY, bulletSpeed].every(Number.isFinite)) {
        cpa = Infinity;
        const ttiTicks = Math.max(1, Math.ceil(tti / tickMs));
        const remainingTicks = Number(bullet.remainingTicks);
        const trajectoryTicks = Number.isFinite(remainingTicks) && remainingTicks > 0
          ? Math.ceil(remainingTicks)
          : ttiTicks;
        const endTick = Math.max(1, Math.min(Math.max(1, Number(options.maxTrajectoryTicks || 60)), trajectoryTicks));
        let selfX = Number(self?.x || 0);
        let selfY = Number(self?.y || 0);
        for (let tick = 0; tick <= endTick; tick += 1) {
          const bulletAtX = bulletX + directionX * bulletSpeed * tick;
          const bulletAtY = bulletY + directionY * bulletSpeed * tick;
          cpa = Math.min(cpa, Math.hypot(selfX - bulletAtX, selfY - bulletAtY));
          if (tick >= endTick) break;
          if (tick < commandDelayTicks || dir.holdCurrent) {
            selfX += currentVx;
            selfY += currentVy;
          } else if (!dir.stop) {
            selfX += dir.dx * diagonalScale * moveSpeedPerTick;
            selfY += dir.dy * diagonalScale * moveSpeedPerTick;
          }
        }
      }

      if (cpa < hitRadius) {
        directHits++;
        if (tti < reactionBudgetMs) unavoidableHits++;
        else avoidableHits++;
      }
      if (cpa < minCPA) minCPA = cpa;
      if (tti < minTTI) minTTI = tti;
    }

    const targetFutureTicks = Number.isFinite(minTTI) ? Math.max(0, minTTI / tickMs - commandDelayTicks) : 0;
    const targetDiagonalScale = dir.dx && dir.dy ? Math.SQRT1_2 : 1;
    const delayedTicks = Math.min(commandDelayTicks, targetFutureTicks);
    const controlledTicks = Math.max(0, targetFutureTicks - delayedTicks);
    const candidateFutureSelf = {
      x: Number(self?.x || 0)
        + currentVx * delayedTicks
        + (dir.holdCurrent ? currentVx * controlledTicks : (dir.stop ? 0 : dir.dx * targetDiagonalScale * moveSpeedPerTick * controlledTicks)),
      y: Number(self?.y || 0)
        + currentVy * delayedTicks
        + (dir.holdCurrent ? currentVy * controlledTicks : (dir.stop ? 0 : dir.dy * targetDiagonalScale * moveSpeedPerTick * controlledTicks))
    };
    return {
      dx: dir.dx,
      dy: dir.dy,
      directHits,
      avoidableHits,
      unavoidableHits,
      minCPA,
      minTTI,
      commandDelayTicks,
      reactionBudgetMs,
      targetDistanceChange: Number.isFinite(Number(options.target?.x)) && Number.isFinite(Number(options.target?.y))
        ? Math.hypot(candidateFutureSelf.x - Number(options.target.x), candidateFutureSelf.y - Number(options.target.y))
          - Math.hypot(Number(self?.x || 0) - Number(options.target.x), Number(self?.y || 0) - Number(options.target.y))
        : 0,
      threat: directHits * 1000000 - Math.min(999999, minCPA)
    };
  });

  // Sort by threat ascending (lowest threat = safest)
  threatField.sort((a, b) => a.avoidableHits - b.avoidableHits
    || a.directHits - b.directHits
    || b.minCPA - a.minCPA
    || b.minTTI - a.minTTI);

  // Prefer tangent movement if safe
  const safest = threatField[0];
  const tangentPreference = options.tangentPreference || null;

  if (tangentPreference && safest.directHits === 0) {
    // Check if tangent direction is reasonably safe
    const tangentDir = threatField.find(d =>
      d.dx === tangentPreference.dx && d.dy === tangentPreference.dy
    );

    if (tangentDir && tangentDir.directHits === safest.directHits && tangentDir.minCPA >= safest.minCPA * 0.92) {
      return {
        dx: tangentDir.dx,
        dy: tangentDir.dy,
        reason: 'tangent-dodge',
        threatField
      };
    }
  }

  // Use safest direction
  return {
    dx: safest.dx,
    dy: safest.dy,
    reason: safest.unavoidableHits > 0 && safest.avoidableHits === 0
      ? 'unavoidable-current-shot'
      : (safest.directHits > 0 ? 'direct-threat-dodge' : 'safe-dodge'),
    reactionBudgetMs,
    unavoidableCurrentShot: safest.unavoidableHits > 0,
    threatField
  };
}

function contactEntryRiskCore(self, target, previous = null, options = {}) {
  const attackRange = Math.max(0, Number(options.attackRange ?? options.combatAttackRange ?? COMBAT_CONSTANTS.ATTACK_RANGE));
  const guardBuffer = Math.max(0, Number(options.guardBufferCm ?? options.combatContactEntryGuardBufferCm ?? COMBAT_CONSTANTS.DODGE_RANGE_BUFFER));
  const guardRange = attackRange + guardBuffer;
  const distance = Number(target?.distance ?? Math.hypot(
    Number(target?.x || 0) - Number(self?.x || 0),
    Number(target?.y || 0) - Number(self?.y || 0)
  ));
  const selfVx = Number(self?.vx || 0);
  const selfVy = Number(self?.vy || 0);
  const targetVx = Number(target?.vx || 0);
  const targetVy = Number(target?.vy || 0);
  const selfSpeed = Math.hypot(selfVx, selfVy);
  const relativeVx = targetVx - selfVx;
  const relativeVy = targetVy - selfVy;
  const relativeSpeed = Math.hypot(relativeVx, relativeVy);
  const dx = Number(target?.x || 0) - Number(self?.x || 0);
  const dy = Number(target?.y || 0) - Number(self?.y || 0);
  const geometryDistance = Math.max(1, Math.hypot(dx, dy));
  const radialSpeed = (dx * relativeVx + dy * relativeVy) / geometryDistance;
  const closingSpeed = Math.max(0, -radialSpeed);
  const closingAlignment = relativeSpeed > 0 ? Math.max(0, Math.min(1, closingSpeed / relativeSpeed)) : 0;
  const firing = Boolean(target?.firing || target?.is_firing || target?.shooting);
  const realBullet = Boolean(options.realBullet);
  const active = Boolean(target?.active || firing || realBullet);
  const selfStationarySpeed = Math.max(0, Number(options.selfStationarySpeed ?? 5));
  const selfStationary = selfSpeed < selfStationarySpeed;
  const minimumClosingSpeed = Math.max(0, Number(options.minimumClosingSpeed ?? 20));
  const minimumClosingAlignment = Math.max(0, Math.min(1, Number(options.minimumClosingAlignment ?? 0.75)));
  const directApproach = Boolean(
    active
      && selfStationary
      && closingSpeed >= minimumClosingSpeed
      && closingAlignment >= minimumClosingAlignment
  );
  const strongEvidence = realBullet || firing;
  const selfHp = Number(self?.hp ?? self?.knownHp ?? 100);
  const selfMaxHp = Number(self?.max_hp ?? self?.maxHp ?? 100);
  const recoveringSelf = options.recoveringSelf === true
    || (Number.isFinite(selfHp) && Number.isFinite(selfMaxHp) && selfHp < selfMaxHp);
  const trustedWithoutFire = Boolean(target?.easyKillThreatExempt && !strongEvidence && options.recentDanger !== true);
  const stamina5s = Number(self?.stamina_5s_remaining_milli ?? self?.stamina5sRemainingMilli);
  const minimumStamina5s = Math.max(0, Number(options.minimumStamina5s ?? COMBAT_CONSTANTS.SHOOT_DODGE_RESERVE_MS + 1000));
  const staminaBlocked = Number.isFinite(stamina5s) && stamina5s < minimumStamina5s && !realBullet;
  const armed = options.armed !== false;
  const withinGuard = Number.isFinite(distance) && distance <= guardRange;
  const previousDistance = Number(previous?.distance);
  const newlyEnteredGuard = !Number.isFinite(previousDistance) || previousDistance > guardRange;
  let blockedReason = '';
  if (!Number.isFinite(distance)) blockedReason = 'missing-distance';
  else if (!withinGuard) blockedReason = 'outside-contact-guard';
  else if (!active) blockedReason = 'target-not-active';
  else if (recoveringSelf && !strongEvidence) blockedReason = 'recovery-policy-owned';
  else if (trustedWithoutFire) blockedReason = 'trusted-target-no-fire';
  else if (!strongEvidence && !directApproach) blockedReason = selfStationary
    ? 'no-direct-closing-evidence'
    : 'self-already-moving';
  else if (staminaBlocked) blockedReason = 'stamina-insufficient';
  else if (!armed && !strongEvidence) blockedReason = 'contact-not-rearmed';
  return {
    eligible: !blockedReason,
    blockedReason,
    trigger: realBullet
      ? 'target-real-bullet'
      : (firing ? 'target-firing' : 'direct-closing-entry'),
    attackRange: Math.round(attackRange),
    guardBuffer: Math.round(guardBuffer),
    guardRange: Math.round(guardRange),
    distance: Number.isFinite(distance) ? Math.round(distance) : null,
    previousDistance: Number.isFinite(previousDistance) ? Math.round(previousDistance) : null,
    newlyEnteredGuard,
    inRange: Number.isFinite(distance) && distance <= attackRange,
    withinGuard,
    active,
    firing,
    realBullet,
    recoveringSelf,
    directApproach,
    trustedWithoutFire,
    selfStationary,
    selfSpeed: Math.round(selfSpeed * 100) / 100,
    relativeSpeed: Math.round(relativeSpeed * 100) / 100,
    closingSpeed: Math.round(closingSpeed * 100) / 100,
    closingAlignment: Math.round(closingAlignment * 1000) / 1000,
    stamina5s: Number.isFinite(stamina5s) ? stamina5s : null,
    minimumStamina5s,
    armed
  };
}

function contactEntrySyntheticBulletCore(self, target, options = {}) {
  const startX = Number(target?.x);
  const startY = Number(target?.y);
  const selfX = Number(self?.x);
  const selfY = Number(self?.y);
  if (![startX, startY, selfX, selfY].every(Number.isFinite)) return null;
  const dx = selfX - startX;
  const dy = selfY - startY;
  const distance = Math.hypot(dx, dy);
  if (!(distance > 0)) return null;
  const speed = Math.max(1, Number(options.bulletSpeedCmPerTick ?? COMBAT_CONSTANTS.BULLET_SPEED_CM_PER_TICK));
  const tickMs = Math.max(1, Number(options.tickMs ?? 50));
  const flightTicks = distance / speed;
  return {
    incoming: true,
    synthetic: true,
    contactEntry: true,
    ownerId: target?.user_id ?? target?.userId ?? target?.id ?? null,
    x: startX,
    y: startY,
    direction: { dx: dx / distance, dy: dy / distance },
    speed,
    distance,
    cpa: 0,
    timeToImpact: flightTicks * tickMs,
    remainingTicks: flightTicks
  };
}

function pickSafeClosingDodgeCore(threatField = [], options = {}) {
  const candidates = (threatField || []).filter(Boolean);
  if (!candidates.length) return null;
  const minimumDirectHits = Math.min(...candidates.map(item => Number(item.directHits ?? Infinity)));
  if (minimumDirectHits > 0) return null;
  const safestCpa = Math.max(...candidates
    .filter(item => Number(item.directHits || 0) === minimumDirectHits)
    .map(item => Number(item.minCPA || 0)));
  const hitRadius = Math.max(1, Number(options.hitRadius || 200));
  const cpaRatio = Math.max(0, Math.min(1, Number(options.minimumCpaRatio ?? 0.75)));
  const minimumCpa = Math.max(hitRadius * 1.25, safestCpa * cpaRatio);
  const minimumClosing = Math.max(0, Number(options.minimumClosingCm ?? 25));
  return candidates
    .filter(item => Number(item.directHits || 0) === 0)
    .filter(item => Number(item.targetDistanceChange || 0) <= -minimumClosing)
    .filter(item => Number(item.minCPA || 0) >= minimumCpa)
    .sort((a, b) => Number(a.targetDistanceChange || 0) - Number(b.targetDistanceChange || 0)
      || Number(b.minCPA || 0) - Number(a.minCPA || 0))[0] || null;
}

/**
 * Apply combat movement modifiers
 *
 * @param {Object} baseMovement - Base movement { dx, dy }
 * @param {Object} self - Self entity
 * @param {Object} target - Combat target
 * @param {Object} context - Combat context
 * @returns {Object} Modified movement { dx, dy, modifiers }
 */
function applyCombatMovementModifiers(baseMovement, self, target, context = {}) {
  let { dx, dy } = baseMovement;
  const modifiers = [];

  // Dodge takes precedence
  if (context.dodge && (context.dodge.dx !== 0 || context.dodge.dy !== 0)) {
    dx = context.dodge.dx;
    dy = context.dodge.dy;
    modifiers.push('dodge');
  }

  // Back away from close targets
  if (context.backAway && target) {
    if (modifiers.includes('dodge')) {
      // The threat-field direction already includes target geometry. Do not turn
      // a safe lateral/reversal dodge into a predictable radial retreat.
      modifiers.push('back-away-deferred');
    } else {
      const awayDx = self.x > target.x ? 1 : (self.x < target.x ? -1 : 0);
      const awayDy = self.y > target.y ? 1 : (self.y < target.y ? -1 : 0);
      dx = awayDx;
      dy = awayDy;
      modifiers.push('back-away');
    }
  }

  // Close-in movement
  if (context.closeIn && target && !modifiers.includes('dodge')) {
    const closeDx = target.x > self.x ? 1 : (target.x < self.x ? -1 : 0);
    const closeDy = target.y > self.y ? 1 : (target.y < self.y ? -1 : 0);
    dx = closeDx;
    dy = closeDy;
    modifiers.push('close-in');
  }

  return { dx, dy, modifiers };
}

/**
 * Check if out-of-range target is recoverable for reengage
 *
 * @param {Object} self - Self entity
 * @param {Object} target - Combat target
 * @param {Object} engagement - Engagement context
 * @returns {boolean}
 */
function isRecoverableOutOfRangeTarget(self, target, engagement = {}) {
  if (!target) return false;

  const distance = target.distance || Infinity;
  const attackRange = COMBAT_CONSTANTS.ATTACK_RANGE;
  const finishReengageRange = COMBAT_CONSTANTS.FINISH_REENGAGE_RANGE;

  // Outside attack range but inside reengage range
  if (distance > attackRange && distance <= finishReengageRange) {
    // Check engagement context
    const selfHp = Number(self.hp || 100);
    const targetHp = Number(target.hp || 100);

    // Healthy HP and not already disadvantaged
    if (selfHp >= 60 && selfHp >= targetHp - 10) {
      return true;
    }

    // Target has real bullet pressure and just slipped out
    if (engagement.targetPressure && distance <= attackRange + 500) {
      return true;
    }
  }

  return false;
}

module.exports = {
  calculateCombatSpacing,
  shouldBackAwayFromTarget,
  calculateDodgeDirection,
  contactEntryRiskCore,
  contactEntrySyntheticBulletCore,
  pickSafeClosingDodgeCore,
  applyCombatMovementModifiers,
  isRecoverableOutOfRangeTarget
};
