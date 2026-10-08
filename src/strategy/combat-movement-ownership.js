'use strict';

const DEFAULT_DODGE_OWNERSHIP_HOLD_MS = 500;

function directionOf(value) {
  return {
    dx: Math.sign(Number(value?.dx || 0)),
    dy: Math.sign(Number(value?.dy || 0))
  };
}

// A zero axis is an explicit stop on that axis, not a missing direction.
// Keep the selected vector intact when it supersedes another movement owner.
function ownedMovementDirectionCore(direction, fallback = {}) {
  return {
    dx: Number(direction?.dx ?? fallback?.dx ?? 0),
    dy: Number(direction?.dy ?? fallback?.dy ?? 0)
  };
}

function selectDodgeThreatDirectionCore({ contactEntryDodge, dodge, residualDirection, hasCollisionBullet } = {}) {
  const currentTrajectoryRisk = dodge?.unavoidableCurrentShot === true
    || (dodge?.threatField || []).some(item => Number(item?.directHits || 0) > 0);
  // A retained direction cannot displace a current full-trajectory assessment,
  // even when static CPA did not classify a bullet as an incoming collision.
  return contactEntryDodge
    || (residualDirection && !hasCollisionBullet && !currentTrajectoryRisk ? residualDirection : dodge)
    || { dx: 0, dy: 0 };
}

function resolveDodgeOwnershipCore(input = {}, options = {}) {
  const nowMs = Number.isFinite(Number(input.nowMs)) ? Number(input.nowMs) : Date.now();
  const previous = input.previous && typeof input.previous === 'object' ? input.previous : null;
  const currentThreat = input.currentThreat === true;
  const suppliedThreatGeneration = String(
    input.threatGeneration
      || (currentThreat ? 'threat:' + Number(input.currentTick || 0) + ':' + String(input.threatId || '') : '')
  );
  const previousGeneration = String(previous?.threatGeneration || '');
  const threatGeneration = suppliedThreatGeneration || previousGeneration;
  const holdMs = Math.max(
    0,
    Number(options.dodgeOwnershipHoldMs ?? DEFAULT_DODGE_OWNERSHIP_HOLD_MS)
  );
  const retained = Boolean(
    !currentThreat
      && previous?.active === true
      && previousGeneration
      && previousGeneration === threatGeneration
      && nowMs < Number(previous.untilAtMs || 0)
  );
  const active = currentThreat || retained;
  const generation = currentThreat
    ? (previousGeneration === threatGeneration ? threatGeneration : (threatGeneration || previousGeneration))
    : (retained ? previousGeneration : '');
  const untilAtMs = active
    ? (currentThreat ? nowMs + holdMs : Number(previous.untilAtMs || nowMs))
    : 0;
  return {
    active,
    owner: active ? 'emergency-dodge' : '',
    threatGeneration: generation,
    untilAtMs,
    currentThreat,
    retained,
    direction: directionOf(input.direction || input.emergencyDirection),
    reason: active
      ? (currentThreat ? 'emergency-dodge-threat-generation' : 'emergency-dodge-ownership-held')
      : (input.releaseReason || 'emergency-dodge-threat-cleared')
  };
}

// The ownership lease is created before the distance-aware planner runs. It
// owns emergency priority, but its early direction must not erase a later
// budget-authorized choice checked against the same current projectile field.
function resolveDodgeExecutionDirectionCore(input = {}) {
  const ownership = input.ownership || {};
  const baseline = directionOf((ownership.active ? ownership.direction : null) || input.fallback);
  const candidate = input.evaluated === true && input.evaluatedDirection
    ? directionOf(input.evaluatedDirection) : null;
  let accepted = false;
  let reason = 'ownership-direction';
  if (candidate && !ownership.currentThreat) {
    accepted = true;
    reason = 'evaluated-prospective-dodge';
  } else if (candidate) {
    const field = Array.isArray(input.threatField) ? input.threatField : [];
    const risk = direction => field.find(row => row.dx === direction.dx && row.dy === direction.dy);
    const candidateRisk = risk(candidate), baselineRisk = risk(baseline);
    const complete = [candidateRisk, baselineRisk].every(row => row
      && Number.isFinite(row.directHits) && row.directHits >= 0
      && Number.isFinite(row.unavoidableHits) && row.unavoidableHits >= 0);
    accepted = Boolean(complete
      && candidateRisk.directHits <= baselineRisk.directHits
      && candidateRisk.unavoidableHits <= baselineRisk.unavoidableHits);
    reason = accepted ? 'current-risk-verified-dodge'
      : (complete ? 'candidate-increases-current-risk' : 'current-risk-evidence-missing');
  }
  const direction = accepted ? candidate : baseline;
  return {
    direction,
    accepted,
    changed: direction.dx !== baseline.dx || direction.dy !== baseline.dy,
    reason
  };
}

function selectCombatMovementOwnerCore(input = {}) {
  const dodge = input.dodgeOwnership || {};
  if (dodge.active === true) {
    return {
      owner: 'emergency-dodge',
      priority: 50,
      overriddenOwner: String(input.requestedOwner || ''),
      reason: dodge.reason || 'emergency-dodge-ownership'
    };
  }
  if (input.hardExit === true) {
    return {
      owner: 'hard-exit',
      priority: 40,
      overriddenOwner: String(input.requestedOwner || ''),
      reason: 'hard-exit'
    };
  }
  if (input.coverActive === true) {
    return {
      owner: String(input.coverState || 'cover-hold'),
      priority: 30,
      overriddenOwner: String(input.requestedOwner || ''),
      reason: String(input.coverReason || 'cover-hypothesis-unverified')
    };
  }
  if (input.finishRaceActive === true) {
    return {
      owner: 'primary-finish-race',
      priority: 20,
      overriddenOwner: String(input.requestedOwner || ''),
      reason: 'primary-finish-race'
    };
  }
  return {
    owner: String(input.requestedOwner || 'ordinary-escort'),
    priority: 10,
    overriddenOwner: '',
    reason: String(input.requestedReason || 'ordinary-escort')
  };
}

module.exports = {
  DEFAULT_DODGE_OWNERSHIP_HOLD_MS,
  ownedMovementDirectionCore,
  selectDodgeThreatDirectionCore,
  resolveDodgeOwnershipCore,
  resolveDodgeExecutionDirectionCore,
  selectCombatMovementOwnerCore
};
