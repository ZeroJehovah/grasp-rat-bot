'use strict';

const { COMBAT_CONSTANTS } = require('./combat-constants');

const DEFAULT_TICK_MS = 50;

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

function positiveNumber(value, fallback) {
  const number = finiteNumber(value);
  return number !== null && number > 0 ? number : fallback;
}

function incomingBulletReachabilityCore(incomingBullet, options = {}) {
  const base = {
    reachable: false,
    reason: 'missing-bullet',
    cpa: null,
    hitRadiusCm: null,
    timeToImpactMs: null,
    remainingTicks: null,
    tickMs: null,
    lifetimeTicks: null
  };
  if (!incomingBullet || typeof incomingBullet !== 'object') return base;
  if (incomingBullet.incoming === false) return { ...base, reason: 'bullet-not-incoming' };
  if (incomingBullet.authority && incomingBullet.authority !== 'realtime') {
    return { ...base, reason: 'bullet-authority-not-realtime' };
  }

  const cpa = finiteNumber(incomingBullet.cpa);
  const hitRadiusCm = Math.max(1, Number(
    options.combatTargetSwitchIncomingCpaCm
      ?? options.combatBulletHitRadiusCm
      ?? COMBAT_CONSTANTS.BULLET_HIT_RADIUS_CM
  ));
  if (cpa === null) return { ...base, reason: 'missing-cpa', hitRadiusCm };
  if (cpa < 0 || cpa > hitRadiusCm) {
    return { ...base, reason: 'cpa-outside-hit-radius', cpa, hitRadiusCm };
  }

  const tickMs = positiveNumber(
    options.combatServerTickMs ?? options.combatTickMs ?? options.tickMs,
    DEFAULT_TICK_MS
  );
  const explicitTimeToImpactMs = firstFiniteNumber(
    incomingBullet.timeToImpactMs,
    incomingBullet.timeToImpact,
    incomingBullet.time_to_impact_ms,
    incomingBullet.time_to_impact
  );
  const distanceCm = firstFiniteNumber(incomingBullet.distance, incomingBullet.distanceCm);
  const speedCmPerTick = positiveNumber(
    incomingBullet.speed
      ?? incomingBullet.speedPerTick
      ?? incomingBullet.speed_per_tick,
    positiveNumber(
      options.combatBulletSpeedPerTick,
      COMBAT_CONSTANTS.BULLET_SPEED_CM_PER_TICK
    )
  );
  const timeToImpactMs = explicitTimeToImpactMs !== null
    ? explicitTimeToImpactMs
    : (distanceCm !== null && speedCmPerTick > 0
        ? distanceCm / speedCmPerTick * tickMs
        : null);
  if (timeToImpactMs === null) {
    return {
      ...base,
      reason: 'missing-future-impact-time',
      cpa,
      hitRadiusCm,
      tickMs
    };
  }
  if (!(timeToImpactMs > 0)) {
    return {
      ...base,
      reason: 'impact-not-in-future',
      cpa,
      hitRadiusCm,
      timeToImpactMs,
      tickMs
    };
  }

  const currentTick = firstFiniteNumber(
    options.currentTick,
    incomingBullet.currentTick,
    incomingBullet.current_tick,
    incomingBullet.tick,
    incomingBullet.observedTick
  );
  const createdTick = firstFiniteNumber(incomingBullet.createdTick, incomingBullet.created_tick);
  const expireTick = firstFiniteNumber(incomingBullet.expireTick, incomingBullet.expire_tick);
  const directRemainingTicks = firstFiniteNumber(
    incomingBullet.remainingTicks,
    incomingBullet.remaining_ticks
  );
  const bulletRangeCm = Math.max(1, Number(
    options.combatBulletRangeCm
      ?? incomingBullet.rangeCm
      ?? incomingBullet.range_cm
      ?? COMBAT_CONSTANTS.BULLET_RANGE_CM
  ));
  const lifetimeTicks = Math.max(1, Number(
    options.combatBulletLifetimeTicks
      ?? options.combatInterceptMaxTicks
      ?? bulletRangeCm / speedCmPerTick
  ));
  let remainingTicks = directRemainingTicks;
  let remainingSource = 'remaining-ticks';
  if (remainingTicks === null && currentTick !== null && expireTick !== null) {
    remainingTicks = expireTick - currentTick;
    remainingSource = 'expire-tick';
  }
  if (remainingTicks === null && currentTick !== null && createdTick !== null) {
    remainingTicks = createdTick + lifetimeTicks - currentTick;
    remainingSource = 'created-tick-lifetime';
  }
  if (remainingTicks === null) {
    return {
      ...base,
      reason: 'missing-bullet-lifecycle',
      cpa,
      hitRadiusCm,
      timeToImpactMs,
      tickMs,
      lifetimeTicks
    };
  }
  if (!(remainingTicks > 0)) {
    return {
      ...base,
      reason: 'bullet-lifetime-expired',
      cpa,
      hitRadiusCm,
      timeToImpactMs,
      remainingTicks,
      tickMs,
      lifetimeTicks,
      remainingSource
    };
  }

  const reachabilityToleranceMs = Math.max(
    1,
    Number(options.combatBulletReachabilityToleranceMs ?? 5)
  );
  const availableFlightMs = remainingTicks * tickMs;
  if (timeToImpactMs > availableFlightMs + reachabilityToleranceMs) {
    return {
      ...base,
      reason: 'impact-beyond-bullet-lifetime',
      cpa,
      hitRadiusCm,
      timeToImpactMs,
      remainingTicks,
      tickMs,
      lifetimeTicks,
      remainingSource,
      availableFlightMs
    };
  }

  return {
    reachable: true,
    reason: 'reachable-collision-path',
    cpa,
    hitRadiusCm,
    timeToImpactMs,
    remainingTicks,
    tickMs,
    lifetimeTicks,
    remainingSource,
    availableFlightMs
  };
}

function incomingBulletHasCollisionRiskCore(incomingBullet, options = {}) {
  return incomingBulletReachabilityCore(incomingBullet, options).reachable;
}

module.exports = {
  DEFAULT_TICK_MS,
  incomingBulletHasCollisionRiskCore,
  incomingBulletReachabilityCore
};
