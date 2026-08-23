'use strict';

const DEFAULT_DODGE_OWNERSHIP_HOLD_MS = 500;

function directionOf(value) {
  return {
    dx: Math.sign(Number(value?.dx || 0)),
    dy: Math.sign(Number(value?.dy || 0))
  };
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
  resolveDodgeOwnershipCore,
  selectCombatMovementOwnerCore
};
