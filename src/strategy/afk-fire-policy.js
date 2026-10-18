'use strict';

const { estimateEightWayRouteCore } = require('./eight-way-route-eta');
const { countGridSlotsUntil } = require('./tick-grid-shooting');

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function evaluateAfkFirePolicyCore(input = {}, options = {}) {
  const distance = numberOrNull(input.distanceCm ?? input.distance);
  const hp = numberOrNull(input.remainingHp ?? input.hp);
  const fullRange = Math.max(0, Number(options.fullRangeCm ?? 1000) || 1000);
  const maxRange = Math.max(fullRange, Number(options.maxRangeCm ?? 14500) || 14500);
  const externalDps = Math.max(0, Number(input.externalDamageRateHpPerSec
    ?? options.externalDamageRateHpPerSec
    ?? 0) || 0);
  const shotDamage = Math.max(0, Number(options.shotDamageHp ?? 3) || 3);
  const projectileSpeed = Math.max(1, Number(options.projectileSpeedCmPerSec ?? 10000) || 10000);
  const flightMs = Math.max(0, Number(input.shotFlightMs
    ?? options.shotFlightMs
    ?? (distance === null ? 0 : distance * 1000 / projectileSpeed)) || 0);
  const cadenceMs = Math.max(1, Number(options.shotCadenceMs ?? 500) || 500);
  const arrivalHpReserve = Math.max(0, Number(options.arrivalHpReserve ?? 10) || 10);
  const tickMs = Math.max(1, Number(options.tickMs ?? options.combatServerTickMs ?? 50) || 50);
  const gridStep = Number(options.gridStep) === 5 ? 5 : 10;
  const currentTick = Number(input.shootingTick ?? input.gameTick);
  const pendingDamage = Math.max(0, Number(input.pendingOwnDamageHp || 0) || 0);
  if (input.invulnerable === true) return { authorized: false, reason: 'afk-fire-invulnerable' };
  if (distance === null || hp === null) return { authorized: false, reason: 'afk-fire-missing-realtime-hp-or-distance' };
  if (distance > maxRange) return { authorized: false, reason: 'afk-fire-approach-range', distanceCm: Math.round(distance), maxRangeCm: Math.round(maxRange) };

  const route = estimateEightWayRouteCore(input.self || {}, input.target || {}, {
    arrivalRadiusCm: fullRange,
    distanceCm: distance,
    axisSpeedCmPerSec: options.axisSpeedCmPerSec,
    diagonalSpeedCmPerSec: options.diagonalSpeedCmPerSec,
    segmentOverheadMs: options.segmentOverheadMs
  });
  const timeToNearMs = Math.max(0, Number(route.etaMs || 0));
  const externalProjectedBeforeNear = externalDps * (timeToNearMs / 1000);
  const availableShots = Number.isSafeInteger(currentTick) && currentTick > 0
    ? countGridSlotsUntil({
        currentTick,
        etaMs: timeToNearMs,
        tickMs,
        gridStep,
        lastClaimedTick: input.lastClaimedTick
      })
    : null;
  const shotBudget = Number.isFinite(hp) && availableShots !== null
    ? Math.max(0, Math.floor((hp - pendingDamage - externalProjectedBeforeNear - arrivalHpReserve) / shotDamage))
    : null;
  const shotBudgetWithoutExternal = Number.isFinite(hp) && availableShots !== null
    ? Math.max(0, Math.floor((hp - pendingDamage - arrivalHpReserve) / shotDamage))
    : null;
  const ownKillTimeMs = null;
  const externalKillTimeMs = externalDps > 0 ? hp / externalDps * 1000 : Infinity;
  const near = distance <= fullRange;
  const budgetReady = availableShots !== null && shotBudget !== null && availableShots <= shotBudget;
  const authorized = near || budgetReady;
  const ownWouldFinishEarly = !near && availableShots !== null && shotBudgetWithoutExternal !== null
    && availableShots > shotBudgetWithoutExternal;
  return {
    authorized,
    reason: authorized
      ? 'afk-fire-authorized'
      : (!near && availableShots === null
          ? 'afk-fire-missing-game-tick'
          : (ownWouldFinishEarly
          ? 'afk-fire-delay-own-kill-before-near'
          : 'afk-fire-delay-external-kill-before-near')),
    distanceCm: Math.round(distance),
    remainingHp: hp,
    fullRangeCm: Math.round(fullRange),
    maxRangeCm: Math.round(maxRange),
    near,
    timeToNearMs: Math.round(timeToNearMs),
    route,
    prearrival: !near,
    arrivalHpReserve,
    shotDamageHp: shotDamage,
    availableShots,
    shotBudget,
    shotBudgetWithoutExternal,
    externalProjectedBeforeNear: Number(externalProjectedBeforeNear.toFixed(2)),
    ownKillTimeMs: Number.isFinite(ownKillTimeMs) ? Math.round(ownKillTimeMs) : null,
    externalKillTimeMs: Number.isFinite(externalKillTimeMs) ? Math.round(externalKillTimeMs) : null,
    externalDamageRateHpPerSec: Number(externalDps.toFixed(3)),
    shotFlightMs: Math.round(flightMs),
    pendingDamageHp: pendingDamage,
    shotCadenceMs: Math.round(cadenceMs)
  };
}

module.exports = { evaluateAfkFirePolicyCore };
