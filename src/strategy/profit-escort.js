'use strict';

/**
 * Select a short, forward-progressing navigation direction while a realtime
 * defensive combat target temporarily owns shooting and Dodge.  The mission
 * point is navigation-only input; callers must keep combat target/aim/fire
 * authority on realtime/native state.
 */

const LEGAL_DIRECTIONS = Object.freeze([
  { dx: 1, dy: 0 },
  { dx: 1, dy: 1 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 1 },
  { dx: -1, dy: 0 },
  { dx: -1, dy: -1 },
  { dx: 0, dy: -1 },
  { dx: 1, dy: -1 }
]);

const DEFAULT_LOCAL_DETOUR_RADIUS_CM = 10000;
const DEFAULT_DETOUR_CORRIDOR_CM = 4500;
const DEFAULT_MIN_FORWARD_PROGRESS = 0.2;

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function pointOf(value) {
  const x = finiteNumber(value?.x);
  const y = finiteNumber(value?.y);
  return x === null || y === null ? null : { x, y };
}

function normalizedDirection(direction = {}) {
  return {
    dx: Math.max(-1, Math.min(1, Math.sign(Number(direction.dx || 0)))),
    dy: Math.max(-1, Math.min(1, Math.sign(Number(direction.dy || 0))))
  };
}

function unitDirection(direction = {}) {
  const normalized = normalizedDirection(direction);
  const length = Math.hypot(normalized.dx, normalized.dy);
  return length > 0
    ? { x: normalized.dx / length, y: normalized.dy / length }
    : { x: 0, y: 0 };
}

function directionKey(direction = {}) {
  const normalized = normalizedDirection(direction);
  return `${normalized.dx},${normalized.dy}`;
}

function dot(left, right) {
  return Number(left.x || 0) * Number(right.x || 0)
    + Number(left.y || 0) * Number(right.y || 0);
}

function distance(left, right) {
  return Math.hypot(Number(left.x) - Number(right.x), Number(left.y) - Number(right.y));
}

function perpendicularDistanceToRay(origin, direction, point) {
  const ray = unitDirection(direction);
  const relative = { x: point.x - origin.x, y: point.y - origin.y };
  const along = dot(relative, ray);
  if (!(along > 0)) return distance(origin, point);
  return Math.abs(relative.x * ray.y - relative.y * ray.x);
}

function missionDirection(self, missionTarget) {
  const origin = pointOf(self);
  const target = pointOf(missionTarget);
  if (!origin || !target) return null;
  const raw = { dx: target.x - origin.x, dy: target.y - origin.y };
  const distanceCm = Math.hypot(raw.dx, raw.dy);
  if (!(distanceCm > 0)) {
    return {
      origin,
      target,
      distanceCm: 0,
      direction: { dx: 0, dy: 0 },
      vector: { x: 0, y: 0 }
    };
  }
  return {
    origin,
    target,
    distanceCm,
    direction: normalizedDirection(raw),
    vector: { x: raw.dx / distanceCm, y: raw.dy / distanceCm }
  };
}

function candidateRow(direction, mission, combatTarget, options = {}) {
  const candidate = normalizedDirection(direction);
  const candidateVector = unitDirection(candidate);
  const awayVector = combatTarget
    ? unitDirection({
        dx: mission.origin.x - combatTarget.x,
        dy: mission.origin.y - combatTarget.y
      })
    : { x: 0, y: 0 };
  const forwardProgress = dot(candidateVector, mission.vector);
  const separationProgress = dot(candidateVector, awayVector);
  const targetDistance = combatTarget ? distance(mission.origin, combatTarget) : null;
  const candidatePoint = {
    x: mission.origin.x + candidateVector.x * 100,
    y: mission.origin.y + candidateVector.y * 100
  };
  const targetDistanceAfterStep = combatTarget
    ? distance(candidatePoint, combatTarget)
    : null;
  const targetDistanceDelta = targetDistance === null
    ? null
    : targetDistanceAfterStep - targetDistance;
  const detourWeight = Math.max(0, Number(options.detourSeparationWeight ?? 40));
  return {
    direction: candidate,
    key: directionKey(candidate),
    forwardProgress,
    separationProgress,
    targetDistanceDelta,
    score: forwardProgress * 100 + separationProgress * detourWeight
  };
}

/**
 * @returns {Object} A legal direction and bounded diagnostics.
 */
function selectProfitEscortDirectionCore(input = {}, options = {}) {
  const active = input.active !== false;
  const mission = missionDirection(input.self, input.missionTarget);
  const combatTarget = pointOf(input.combatTarget);
  if (!active || !mission || !combatTarget || mission.distanceCm <= 0) {
    return {
      active: false,
      direction: mission?.direction || { dx: 0, dy: 0 },
      reason: !active ? 'profit-escort-inactive' : 'profit-escort-missing-navigation-point',
      missionDistanceCm: mission ? Math.round(mission.distanceCm) : null,
      missionProgress: 0,
      targetDistanceCm: combatTarget && mission
        ? Math.round(distance(mission.origin, combatTarget))
        : null,
      detour: false,
      candidates: []
    };
  }

  const localDetourRadiusCm = Math.max(
    0,
    Number(options.localDetourRadiusCm ?? DEFAULT_LOCAL_DETOUR_RADIUS_CM)
  );
  const detourCorridorCm = Math.max(
    0,
    Number(options.detourCorridorCm ?? DEFAULT_DETOUR_CORRIDOR_CM)
  );
  const minimumForwardProgress = Math.max(
    0,
    Math.min(1, Number(options.minimumForwardProgress ?? DEFAULT_MIN_FORWARD_PROGRESS))
  );
  const targetDistanceCm = distance(mission.origin, combatTarget);
  const corridorDistanceCm = perpendicularDistanceToRay(mission.origin, mission.direction, combatTarget);
  const routeBlocked = targetDistanceCm <= localDetourRadiusCm
    && corridorDistanceCm <= detourCorridorCm;
  const forceSeparation = input.forceSeparation === true;
  const candidates = LEGAL_DIRECTIONS
    .map(direction => candidateRow(direction, mission, combatTarget, options))
    .sort((left, right) => right.score - left.score || left.key.localeCompare(right.key));

  let selected = null;
  let reason = 'profit-escort-forward';
  let detour = false;
  if (routeBlocked || forceSeparation) {
    const forwardCandidates = candidates.filter(candidate => candidate.forwardProgress >= minimumForwardProgress);
    const separationCandidates = forwardCandidates.filter(candidate => candidate.separationProgress > 0);
    const pool = separationCandidates.length ? separationCandidates : (forwardCandidates.length ? forwardCandidates : candidates);
    selected = pool
      .slice()
      .sort((left, right) => (
        right.separationProgress - left.separationProgress
          || right.forwardProgress - left.forwardProgress
          || right.score - left.score
          || left.key.localeCompare(right.key)
      ))[0] || null;
    detour = Boolean(selected && selected.key !== directionKey(mission.direction));
    reason = forceSeparation && selected?.separationProgress > 0
      ? 'profit-escort-separate-and-forward'
      : (detour ? 'profit-escort-local-detour' : 'profit-escort-forward-under-pressure');
  } else {
    selected = {
      ...candidateRow(mission.direction, mission, combatTarget, options),
      direction: mission.direction
    };
  }

  const direction = selected?.direction || mission.direction;
  return {
    active: true,
    direction,
    reason,
    missionDistanceCm: Math.round(mission.distanceCm),
    missionProgress: Number(Math.max(-1, Math.min(1, selected?.forwardProgress ?? 0)).toFixed(3)),
    targetDistanceCm: Math.round(targetDistanceCm),
    targetDistanceDeltaCm: selected?.targetDistanceDelta === null || selected?.targetDistanceDelta === undefined
      ? null
      : Math.round(selected.targetDistanceDelta),
    corridorDistanceCm: Math.round(corridorDistanceCm),
    localDetourRadiusCm: Math.round(localDetourRadiusCm),
    detourCorridorCm: Math.round(detourCorridorCm),
    minimumForwardProgress,
    routeBlocked,
    forceSeparation,
    detour,
    selectedCandidate: selected ? {
      direction: selected.direction,
      forwardProgress: Number(selected.forwardProgress.toFixed(3)),
      separationProgress: Number(selected.separationProgress.toFixed(3)),
      targetDistanceDeltaCm: selected.targetDistanceDelta === null || selected.targetDistanceDelta === undefined
        ? null
        : Math.round(selected.targetDistanceDelta)
    } : null,
    candidates: candidates.slice(0, 8).map(candidate => ({
      direction: candidate.direction,
      forwardProgress: Number(candidate.forwardProgress.toFixed(3)),
      separationProgress: Number(candidate.separationProgress.toFixed(3)),
      targetDistanceDeltaCm: candidate.targetDistanceDelta === null || candidate.targetDistanceDelta === undefined
        ? null
        : Math.round(candidate.targetDistanceDelta)
    }))
  };
}

module.exports = {
  DEFAULT_LOCAL_DETOUR_RADIUS_CM,
  DEFAULT_DETOUR_CORRIDOR_CM,
  DEFAULT_MIN_FORWARD_PROGRESS,
  selectProfitEscortDirectionCore
};
