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

  const threatField = directions.map(dir => {
    let directHits = 0;
    let minCPA = Infinity;
    let minTTI = Infinity;

    for (const bullet of incoming) {
      // Check if this direction would result in hit
      const cpa = bullet.cpa !== undefined ? bullet.cpa : bullet.distance;
      const tti = bullet.timeToImpact || 1000;

      if (cpa < 200) directHits++;  // Direct hit threshold
      if (cpa < minCPA) minCPA = cpa;
      if (tti < minTTI) minTTI = tti;
    }

    return {
      dx: dir.dx,
      dy: dir.dy,
      directHits,
      minCPA,
      minTTI,
      threat: directHits * 1000 + (10000 / Math.max(1, minCPA))
    };
  });

  // Sort by threat ascending (lowest threat = safest)
  threatField.sort((a, b) => a.threat - b.threat);

  // Prefer tangent movement if safe
  const safest = threatField[0];
  const tangentPreference = options.tangentPreference || null;

  if (tangentPreference && safest.directHits === 0) {
    // Check if tangent direction is reasonably safe
    const tangentDir = threatField.find(d =>
      d.dx === tangentPreference.dx && d.dy === tangentPreference.dy
    );

    if (tangentDir && tangentDir.directHits === 0 && tangentDir.threat < safest.threat * 2) {
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
  applyCombatMovementModifiers,
  isRecoverableOutOfRangeTarget
};
