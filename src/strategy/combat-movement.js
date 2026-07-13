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

  // Evaluate threat field for 8 directions
  const directions = [
    { dx: 0, dy: -1 },   // North
    { dx: 1, dy: -1 },   // NE
    { dx: 1, dy: 0 },    // East
    { dx: 1, dy: 1 },    // SE
    { dx: 0, dy: 1 },    // South
    { dx: -1, dy: 1 },   // SW
    { dx: -1, dy: 0 },   // West
    { dx: -1, dy: -1 }   // NW
  ];

  const moveSpeedPerTick = Math.max(0, Number(options.moveSpeedPerTick ?? self?.speed_per_tick ?? self?.speedPerTick ?? 50));
  const tickMs = Math.max(1, Number(options.tickMs || 50));
  const hitRadius = Math.max(1, Number(options.hitRadius || 200));
  const threatField = directions.map(dir => {
    let directHits = 0;
    let minCPA = Infinity;
    let minTTI = Infinity;

    for (const bullet of incoming) {
      const tti = Number(bullet.timeToImpact || 1000);
      const futureTicks = Math.max(0, tti / tickMs);
      const diagonalScale = dir.dx && dir.dy ? Math.SQRT1_2 : 1;
      const futureSelf = {
        x: Number(self?.x || 0) + dir.dx * diagonalScale * moveSpeedPerTick * futureTicks,
        y: Number(self?.y || 0) + dir.dy * diagonalScale * moveSpeedPerTick * futureTicks
      };
      const bulletX = Number(bullet.x);
      const bulletY = Number(bullet.y);
      const directionX = Number(bullet.direction?.dx);
      const directionY = Number(bullet.direction?.dy);
      const bulletSpeed = Number(bullet.speed || COMBAT_CONSTANTS.BULLET_SPEED_CM_PER_TICK);
      let cpa = Number(bullet.cpa ?? bullet.distance ?? Infinity);
      if ([bulletX, bulletY, directionX, directionY, bulletSpeed].every(Number.isFinite)) {
        const futureBullet = {
          x: bulletX + directionX * bulletSpeed * futureTicks,
          y: bulletY + directionY * bulletSpeed * futureTicks
        };
        cpa = Math.hypot(futureSelf.x - futureBullet.x, futureSelf.y - futureBullet.y);
      }

      if (cpa < hitRadius) directHits++;
      if (cpa < minCPA) minCPA = cpa;
      if (tti < minTTI) minTTI = tti;
    }

    const targetFutureTicks = Number.isFinite(minTTI) ? Math.max(0, minTTI / tickMs) : 0;
    const targetDiagonalScale = dir.dx && dir.dy ? Math.SQRT1_2 : 1;
    const candidateFutureSelf = {
      x: Number(self?.x || 0) + dir.dx * targetDiagonalScale * moveSpeedPerTick * targetFutureTicks,
      y: Number(self?.y || 0) + dir.dy * targetDiagonalScale * moveSpeedPerTick * targetFutureTicks
    };
    return {
      dx: dir.dx,
      dy: dir.dy,
      directHits,
      minCPA,
      minTTI,
      targetDistanceChange: Number.isFinite(Number(options.target?.x)) && Number.isFinite(Number(options.target?.y))
        ? Math.hypot(candidateFutureSelf.x - Number(options.target.x), candidateFutureSelf.y - Number(options.target.y))
          - Math.hypot(Number(self?.x || 0) - Number(options.target.x), Number(self?.y || 0) - Number(options.target.y))
        : 0,
      threat: directHits * 1000000 - Math.min(999999, minCPA)
    };
  });

  // Sort by threat ascending (lowest threat = safest)
  threatField.sort((a, b) => a.directHits - b.directHits
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
    reason: safest.directHits > 0 ? 'direct-threat-dodge' : 'safe-dodge',
    threatField
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
    const awayDx = self.x > target.x ? 1 : (self.x < target.x ? -1 : 0);
    const awayDy = self.y > target.y ? 1 : (self.y < target.y ? -1 : 0);

    // Mix dodge with back-away if both needed
    if (modifiers.includes('dodge')) {
      // Ensure at least one axis moves away
      if (dx * awayDx < 0) dx = awayDx;
      if (dy * awayDy < 0) dy = awayDy;
      modifiers.push('back-away-mixed');
    } else {
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
  pickSafeClosingDodgeCore,
  applyCombatMovementModifiers,
  isRecoverableOutOfRangeTarget
};
