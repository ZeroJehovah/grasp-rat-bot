'use strict';

const DEFAULT_PROFIT_MISSION_ARRIVAL_RADIUS_CM = 150;
const DEFAULT_PROFIT_MISSION_ARRIVAL_HYSTERESIS_CM = 100;
const DEFAULT_PROFIT_MISSION_ARRIVAL_SETTLEMENT_WAIT_MS = 1000;
const DEFAULT_PROFIT_MISSION_ARRIVAL_RETRY_PULSE_MS = 45;
const DEFAULT_PROFIT_MISSION_ARRIVAL_RETRY_COOLDOWN_MS = 250;
const DEFAULT_PROFIT_MISSION_ARRIVAL_MAX_RETRIES = 3;

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nonNegativeOption(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : fallback;
}

function positiveIntegerOption(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : fallback;
}

function pointOf(value) {
  const x = finiteNumber(value?.x);
  const y = finiteNumber(value?.y);
  return x === null || y === null ? null : { x, y };
}

function distanceBetween(left, right) {
  const a = pointOf(left);
  const b = pointOf(right);
  return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : null;
}

function directionBetween(self, target) {
  const selfPoint = pointOf(self);
  const targetPoint = pointOf(target);
  if (!selfPoint || !targetPoint) return { dx: 0, dy: 0 };
  return {
    dx: Math.sign(targetPoint.x - selfPoint.x),
    dy: Math.sign(targetPoint.y - selfPoint.y)
  };
}

function missionNavigationTarget(mission = {}) {
  return mission.navigationTarget
    || mission.target
    || mission.choice?.sourceCoin
    || mission.choice?.coin
    || null;
}

function profitMissionArrivalTargetKey(mission = {}, target = null) {
  return String(
    mission.key
      || mission.missionKey
      || target?.key
      || target?.drop_id
      || target?.id
      || ''
  );
}

function isOrdinarySnapshotProfitMissionCore(mission = {}) {
  if (String(mission.type || '') !== 'coin') return false;
  const target = missionNavigationTarget(mission);
  const authority = String(target?.authority || mission.navigationAuthority || '').toLowerCase();
  return target?.snapshotOnly === true
    || target?.snapshot === true
    || authority === 'snapshot'
    || authority === 'snapshot-navigation';
}

function profitMissionArrivalStateCore(input = {}, options = {}) {
  const mission = input.mission || {};
  if (!isOrdinarySnapshotProfitMissionCore(mission)) {
    return {
      active: false,
      arrived: false,
      heldByHysteresis: false,
      released: false,
      reason: 'not-ordinary-snapshot-coin'
    };
  }

  const self = pointOf(input.self);
  const target = missionNavigationTarget(mission);
  const targetPoint = pointOf(target);
  const targetKey = profitMissionArrivalTargetKey(mission, target);
  const arrivalRadiusCm = nonNegativeOption(
    options.profitMissionArrivalRadiusCm
      ?? options.playerDropPickupRadiusCm
      ?? DEFAULT_PROFIT_MISSION_ARRIVAL_RADIUS_CM,
    DEFAULT_PROFIT_MISSION_ARRIVAL_RADIUS_CM
  );
  const hysteresisCm = nonNegativeOption(
    options.profitMissionArrivalHysteresisCm
      ?? options.invulnerableProfitArrivalHysteresisCm
      ?? DEFAULT_PROFIT_MISSION_ARRIVAL_HYSTERESIS_CM,
    DEFAULT_PROFIT_MISSION_ARRIVAL_HYSTERESIS_CM
  );
  const releaseRadiusCm = arrivalRadiusCm + hysteresisCm;
  const settlementWaitMs = nonNegativeOption(
    options.profitMissionArrivalSettlementWaitMs,
    DEFAULT_PROFIT_MISSION_ARRIVAL_SETTLEMENT_WAIT_MS
  );
  const retryPulseMs = Math.max(20, nonNegativeOption(
    options.profitMissionArrivalRetryPulseMs,
    DEFAULT_PROFIT_MISSION_ARRIVAL_RETRY_PULSE_MS
  ));
  const retryCooldownMs = nonNegativeOption(
    options.profitMissionArrivalRetryCooldownMs,
    DEFAULT_PROFIT_MISSION_ARRIVAL_RETRY_COOLDOWN_MS
  );
  const maxRetries = positiveIntegerOption(
    options.profitMissionArrivalMaxRetries,
    DEFAULT_PROFIT_MISSION_ARRIVAL_MAX_RETRIES
  );
  const nowMs = Number.isFinite(Number(input.nowMs)) ? Number(input.nowMs) : 0;
  const distanceCm = distanceBetween(self, targetPoint);
  const previous = input.previous && typeof input.previous === 'object' ? input.previous : null;
  const previousPoint = pointOf(previous?.targetPoint);
  const previousKey = String(previous?.targetKey || '');
  const targetUnchanged = Boolean(
    previous?.arrived === true
      && (!previousKey || previousKey === targetKey)
      && (!previousPoint || distanceBetween(previousPoint, targetPoint) <= releaseRadiusCm)
  );

  if (distanceCm === null || !targetPoint || !self) {
    return {
      active: true,
      arrived: false,
      heldByHysteresis: false,
      released: false,
      targetKey,
      targetPoint,
      distanceCm: null,
      arrivalRadiusCm: Math.round(arrivalRadiusCm),
      releaseRadiusCm: Math.round(releaseRadiusCm),
      phase: 'arrival-pending',
      settlementPending: false,
      retryCount: 0,
      retryReady: false,
      retryActive: false,
      retryExhausted: false,
      retryDirection: { dx: 0, dy: 0 },
      retryPulseMs: Math.round(retryPulseMs),
      retryCooldownMs: Math.round(retryCooldownMs),
      maxRetries,
      reason: 'profit-mission-arrival-missing-position'
    };
  }

  const arrived = distanceCm <= arrivalRadiusCm
    || (targetUnchanged && distanceCm <= releaseRadiusCm);
  const heldByHysteresis = targetUnchanged
    && distanceCm > arrivalRadiusCm
    && distanceCm <= releaseRadiusCm;
  const released = Boolean(previous?.arrived === true && !arrived);
  const retryCount = targetUnchanged
    ? Math.max(0, Math.floor(Number(previous?.retryCount || 0)))
    : 0;
  const previousRetryDirection = {
    dx: Math.sign(Number(previous?.retryDirection?.dx || 0)),
    dy: Math.sign(Number(previous?.retryDirection?.dy || 0))
  };
  const retryDirection = targetUnchanged
    && (previousRetryDirection.dx || previousRetryDirection.dy)
    ? previousRetryDirection
    : directionBetween(self, targetPoint);
  const arrivedAtMs = arrived
    ? (targetUnchanged
        ? Math.max(0, Number(previous?.arrivedAtMs || 0))
        : nowMs)
    : 0;
  const retryActive = Boolean(
    targetUnchanged
      && arrived
      && previous?.retryActive === true
      && Number(previous?.retryActiveUntilMs || 0) > nowMs
  );
  const retryExhausted = Boolean(
    targetUnchanged
      && arrived
      && previous?.retryExhausted === true
  );
  const nextRetryAtMs = targetUnchanged
    ? Math.max(0, Number(previous?.nextRetryAtMs || (arrivedAtMs + settlementWaitMs)))
    : (arrived ? arrivedAtMs + settlementWaitMs : 0);
  const retryReady = Boolean(
    arrived
      && !retryActive
      && !retryExhausted
      && retryCount < maxRetries
      && (retryDirection.dx || retryDirection.dy)
      && nowMs >= nextRetryAtMs
  );
  return {
    active: true,
    arrived,
    entered: arrived && !targetUnchanged,
    heldByHysteresis,
    released,
    targetKey,
    targetPoint,
    distanceCm: Math.round(distanceCm),
    arrivalRadiusCm: Math.round(arrivalRadiusCm),
    releaseRadiusCm: Math.round(releaseRadiusCm),
    phase: arrived ? 'arrived' : (released ? 'released' : 'approach'),
    settlementPending: arrived,
    arrivedAtMs,
    nextRetryAtMs,
    retryCount,
    retryReady,
    retryActive,
    retryExhausted,
    retryDirection,
    retryPulseMs: Math.round(retryPulseMs),
    retryCooldownMs: Math.round(retryCooldownMs),
    maxRetries,
    retryActiveUntilMs: retryActive ? Number(previous?.retryActiveUntilMs || 0) : 0,
    lastRetryAtMs: targetUnchanged ? Math.max(0, Number(previous?.lastRetryAtMs || 0)) : 0,
    reason: retryActive
      ? 'profit-mission-arrival-retry'
      : retryReady
        ? 'profit-mission-arrival-retry-ready'
        : arrived
          ? (heldByHysteresis ? 'profit-mission-arrival-hysteresis-hold' : 'profit-mission-arrival-settlement-pending')
      : (released ? 'profit-mission-arrival-release' : 'profit-mission-approach')
  };
}

module.exports = {
  DEFAULT_PROFIT_MISSION_ARRIVAL_RADIUS_CM,
  DEFAULT_PROFIT_MISSION_ARRIVAL_HYSTERESIS_CM,
  DEFAULT_PROFIT_MISSION_ARRIVAL_SETTLEMENT_WAIT_MS,
  DEFAULT_PROFIT_MISSION_ARRIVAL_RETRY_PULSE_MS,
  DEFAULT_PROFIT_MISSION_ARRIVAL_RETRY_COOLDOWN_MS,
  DEFAULT_PROFIT_MISSION_ARRIVAL_MAX_RETRIES,
  isOrdinarySnapshotProfitMissionCore,
  profitMissionArrivalStateCore
};
