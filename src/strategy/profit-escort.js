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
const DEFAULT_CONTINUITY_MAX_MS = 180000;

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

function boundedIdentity(value) {
  if (value === null || value === undefined || value === '') return '';
  return String(value).slice(0, 160);
}

function profitEscortMissionKeyCore(mission = {}) {
  return boundedIdentity(mission.key || mission.missionKey);
}

function profitEscortMissionTargetIdCore(mission = {}) {
  return boundedIdentity(
    mission.targetId
      ?? mission.subjectId
      ?? mission.navigationTarget?.userId
      ?? mission.navigationTarget?.user_id
      ?? mission.navigationTarget?.id
  );
}

function profitEscortContinuityMatchesCore(continuity = null, context = {}) {
  if (!continuity || continuity.active !== true) return false;
  const nowMs = Number.isFinite(Number(context.nowMs)) ? Number(context.nowMs) : Date.now();
  if (Number(continuity.expiresAt || 0) <= nowMs) return false;
  const missionKey = profitEscortMissionKeyCore(context.mission || {});
  if (missionKey && boundedIdentity(continuity.missionKey) !== missionKey) return false;
  const combatTargetId = boundedIdentity(context.combatTargetId);
  if (combatTargetId && boundedIdentity(continuity.combatTargetId) !== combatTargetId) return false;
  const engagementGeneration = boundedIdentity(context.engagementGeneration);
  if (engagementGeneration
    && boundedIdentity(continuity.engagementGeneration) !== engagementGeneration) return false;
  const controlGeneration = boundedIdentity(context.controlGeneration);
  if (controlGeneration
    && boundedIdentity(continuity.controlGeneration)
    && boundedIdentity(continuity.controlGeneration) !== controlGeneration) return false;
  return true;
}

function releaseProfitEscortContinuityCore(previous, reason, nowMs) {
  if (!previous || previous.active !== true) return null;
  return {
    ...previous,
    active: false,
    releasedAt: nowMs,
    releaseReason: boundedIdentity(reason || 'released')
  };
}

function updateProfitEscortContinuityCore(previous = null, input = {}, options = {}) {
  const nowMs = Number.isFinite(Number(input.nowMs)) ? Number(input.nowMs) : Date.now();
  const mission = input.mission && typeof input.mission === 'object' ? input.mission : null;
  const missionKey = profitEscortMissionKeyCore(mission || {});
  const missionTargetId = profitEscortMissionTargetIdCore(mission || {});
  const combatTargetId = boundedIdentity(input.combatTargetId);
  const engagementGeneration = boundedIdentity(input.engagementGeneration);
  const controlGeneration = boundedIdentity(input.controlGeneration);
  const previousActive = previous?.active === true ? previous : null;
  let releaseReason = boundedIdentity(input.releaseReason);

  if (!releaseReason && previousActive) {
    if (!mission || mission.active === false || !missionKey) releaseReason = 'profit-mission-inactive';
    else if (Number(mission.expiresAt || 0) > 0 && Number(mission.expiresAt) <= nowMs) {
      releaseReason = 'profit-mission-expired';
    } else if (Number(previousActive.expiresAt || 0) <= nowMs) {
      releaseReason = 'escort-continuity-expired';
    } else if (boundedIdentity(previousActive.missionKey) !== missionKey) {
      releaseReason = 'profit-mission-replaced';
    } else if (combatTargetId && boundedIdentity(previousActive.combatTargetId) !== combatTargetId) {
      releaseReason = 'combat-target-changed';
    } else if (engagementGeneration
      && boundedIdentity(previousActive.engagementGeneration) !== engagementGeneration) {
      releaseReason = 'combat-engagement-generation-changed';
    } else if (controlGeneration
      && boundedIdentity(previousActive.controlGeneration)
      && boundedIdentity(previousActive.controlGeneration) !== controlGeneration) {
      releaseReason = 'combat-control-generation-changed';
    }
  }

  const release = releaseReason
    ? releaseProfitEscortContinuityCore(previousActive, releaseReason, nowMs)
    : null;
  const retained = release ? null : previousActive;
  const entryEligible = Boolean(input.entryEligible === true
    && mission
    && mission.active !== false
    && missionKey
    && missionTargetId
    && combatTargetId
    && missionTargetId !== combatTargetId
    && engagementGeneration);
  const maximumMs = Math.max(1000, Number(options.maximumMs ?? DEFAULT_CONTINUITY_MAX_MS));
  const missionExpiresAt = Number(mission?.expiresAt || 0);
  const boundedExpiresAt = missionExpiresAt > nowMs
    ? Math.min(missionExpiresAt, nowMs + maximumMs)
    : nowMs + maximumMs;
  const entered = !retained && entryEligible;
  const state = retained || (entered ? {
    active: true,
    missionKey,
    missionType: boundedIdentity(mission.type),
    missionTargetId,
    combatTargetId,
    engagementGeneration,
    controlGeneration,
    enteredAt: nowMs,
    lastUpdatedAt: nowMs,
    lastSeenAt: input.combatTargetVisible === false ? 0 : nowMs,
    expiresAt: boundedExpiresAt,
    entryReason: boundedIdentity(input.entryReason || 'realtime-defensive-evidence'),
    entryEvidence: input.entryEvidence && typeof input.entryEvidence === 'object'
      ? { ...input.entryEvidence }
      : null,
    missionProgress: input.missionProgress && typeof input.missionProgress === 'object'
      ? { ...input.missionProgress }
      : null,
    overrideReason: boundedIdentity(input.overrideReason),
    releaseReason: ''
  } : null);

  if (!state) return { state: null, release, entered: false, maintained: false };
  const updated = {
    ...state,
    missionType: boundedIdentity(mission?.type || state.missionType),
    missionTargetId: missionTargetId || boundedIdentity(state.missionTargetId),
    lastUpdatedAt: nowMs,
    lastSeenAt: input.combatTargetVisible === false
      ? Number(state.lastSeenAt || 0)
      : nowMs,
    expiresAt: Math.min(Number(state.expiresAt || boundedExpiresAt), boundedExpiresAt),
    missionProgress: input.missionProgress && typeof input.missionProgress === 'object'
      ? { ...input.missionProgress }
      : (state.missionProgress || null),
    overrideReason: boundedIdentity(input.overrideReason || state.overrideReason),
    releaseReason: ''
  };
  return {
    state: updated,
    release,
    entered,
    maintained: !entered
  };
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
  DEFAULT_CONTINUITY_MAX_MS,
  DEFAULT_LOCAL_DETOUR_RADIUS_CM,
  DEFAULT_DETOUR_CORRIDOR_CM,
  DEFAULT_MIN_FORWARD_PROGRESS,
  profitEscortContinuityMatchesCore,
  profitEscortMissionKeyCore,
  profitEscortMissionTargetIdCore,
  updateProfitEscortContinuityCore,
  selectProfitEscortDirectionCore
};
