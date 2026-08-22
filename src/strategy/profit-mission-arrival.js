'use strict';

const DEFAULT_PROFIT_MISSION_ARRIVAL_RADIUS_CM = 150;
const DEFAULT_PROFIT_MISSION_ARRIVAL_HYSTERESIS_CM = 100;

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nonNegativeOption(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : fallback;
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
      reason: 'profit-mission-arrival-missing-position'
    };
  }

  const arrived = distanceCm <= arrivalRadiusCm
    || (targetUnchanged && distanceCm <= releaseRadiusCm);
  const heldByHysteresis = targetUnchanged
    && distanceCm > arrivalRadiusCm
    && distanceCm <= releaseRadiusCm;
  const released = Boolean(previous?.arrived === true && !arrived);
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
    reason: arrived
      ? (heldByHysteresis ? 'profit-mission-arrival-hysteresis-hold' : 'profit-mission-arrival-settlement-pending')
      : (released ? 'profit-mission-arrival-release' : 'profit-mission-approach')
  };
}

module.exports = {
  DEFAULT_PROFIT_MISSION_ARRIVAL_RADIUS_CM,
  DEFAULT_PROFIT_MISSION_ARRIVAL_HYSTERESIS_CM,
  isOrdinarySnapshotProfitMissionCore,
  profitMissionArrivalStateCore
};
