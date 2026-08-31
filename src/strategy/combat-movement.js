'use strict';

/**
 * Combat Movement and Spacing
 *
 * Handles combat positioning, spacing, dodge, and tactical movement.
 */

const { COMBAT_CONSTANTS } = require('./combat-constants');

const NORMALIZED_PENDING_VELOCITY_COMMANDS = Symbol('normalized-pending-velocity-commands');
const NORMALIZED_PENDING_VELOCITY_EVENTS = Symbol('normalized-pending-velocity-events');

/**
 * Calculate desired spacing distance for combat target
 *
 * @param {Object} self - Self entity
 * @param {Object} target - Combat target
 * @param {Object} context - Combat context
 * @returns {number} Desired spacing distance in cm
 */
function calculateCombatSpacing(self, target, context = {}) {
  const minSpacing = Math.max(1, Number(
    context.normalMinRangeCm ?? context.minSpacing ?? COMBAT_CONSTANTS.TARGET_SPACING_MIN
  ));
  const maxSpacing = Math.max(minSpacing, Number(
    context.normalMaxRangeCm ?? context.maxSpacing ?? COMBAT_CONSTANTS.TARGET_SPACING_MAX
  ));

  // Default to mid-range
  let spacing = (minSpacing + maxSpacing) / 2;

  // Adjust based on context
  if (context.targetPressure) {
    // Under pressure, maintain farther spacing
    spacing = maxSpacing;
  }

  if (context.highEntropyOpponent && !context.finishingTarget) {
    spacing = Math.max(8500, Math.min(10500, Number(context.safeReactionSpacingCm || 9500)));
  }

  if (context.finishingTarget) {
    // Finishing low HP target, close in
    spacing = minSpacing;
  }

  return Math.max(minSpacing, Math.min(maxSpacing, spacing));
}

function normalizedDirection(direction = {}) {
  return {
    dx: Math.max(-1, Math.min(1, Math.sign(Number(direction.dx || 0)))),
    dy: Math.max(-1, Math.min(1, Math.sign(Number(direction.dy || 0))))
  };
}

function directionThreatCore(threatField = [], direction = {}) {
  const normalized = normalizedDirection(direction);
  let selected = null;
  for (const item of threatField || []) {
    if (Number(item?.dx) !== normalized.dx || Number(item?.dy) !== normalized.dy) continue;
    if (!selected
      || Number(item?.directHits || 0) < Number(selected?.directHits || 0)
      || (Number(item?.directHits || 0) === Number(selected?.directHits || 0)
        && Number(item?.minCPA || 0) > Number(selected?.minCPA || 0))) {
      selected = item;
    }
  }
  return selected;
}

function movementThreatSafeCore(threat, minimumCpaCm = 200) {
  if (!threat) return true;
  const worstCaseCpa = Number(threat.worstCaseCpaCm ?? threat.minCPA ?? Infinity);
  return Number(threat.directHits || 0) === 0
    && Number(threat.unavoidableHits || 0) === 0
    && threat.scheduleRobust !== false
    && worstCaseCpa >= Math.max(1, Number(minimumCpaCm || 200));
}

function strategicDirectionProgressCore(direction = {}, strategicDirection = {}) {
  const candidate = normalizedDirection(direction);
  const strategic = normalizedDirection(strategicDirection);
  const candidateMagnitude = Math.hypot(candidate.dx, candidate.dy);
  const strategicMagnitude = Math.hypot(strategic.dx, strategic.dy);
  if (!(candidateMagnitude > 0) || !(strategicMagnitude > 0)) return 0;
  return (
    candidate.dx * strategic.dx + candidate.dy * strategic.dy
  ) / (candidateMagnitude * strategicMagnitude);
}

function safestStrategicProgressDirectionCore(threatField = [], strategicDirection = {}, minimumCpaCm = 200) {
  const candidates = (threatField || [])
    .filter(item => item && (Number(item.dx || 0) || Number(item.dy || 0)))
    .filter(item => Number(item.unavoidableHits || 0) === 0)
    .filter(item => movementThreatSafeCore(item, minimumCpaCm))
    .map(item => ({
      ...item,
      ...normalizedDirection(item),
      strategicProgress: strategicDirectionProgressCore(item, strategicDirection)
    }))
    .filter(item => item.strategicProgress > 0)
    .sort((left, right) => Number(right.strategicProgress) - Number(left.strategicProgress)
      || Number(right.minCPA ?? right.worstCaseCpaCm ?? 0)
        - Number(left.minCPA ?? left.worstCaseCpaCm ?? 0));
  return {
    direction: candidates[0] || null,
    candidateCount: candidates.length
  };
}

function movementDirectionKeyCore(direction = {}) {
  const normalized = normalizedDirection(direction);
  return `${normalized.dx},${normalized.dy}`;
}

function movementSettlementWindowTicksCore(timing = {}) {
  const exactReady = timing?.exactReady === true
    || (String(timing?.source || '').includes('exact') && Number(timing?.sampleCount || 0) >= 4);
  const trustedMedian = exactReady ? Number(timing?.medianTicks) : 2;
  return Math.max(2, Math.min(7, Math.round(Number.isFinite(trustedMedian) ? trustedMedian : 2)));
}

/**
 * Threat-aware short settlement window for combat movement generations.
 * The function is pure: callers own lifecycle state and may apply the returned
 * direction or keep it as a shadow counterfactual while the rollout flag is off.
 */
function stabilizeCombatMovementDirectionCore(input = {}, options = {}) {
  const nowMs = Number.isFinite(Number(input.nowMs)) ? Number(input.nowMs) : Date.now();
  const tick = Number.isFinite(Number(input.tick)) ? Number(input.tick) : null;
  const targetId = String(input.targetId ?? '');
  const engagementId = String(input.engagementId ?? targetId);
  const candidateDirection = normalizedDirection(input.candidateDirection);
  const candidateKey = movementDirectionKeyCore(candidateDirection);
  const minimumCpaCm = Math.max(1, Number(options.minimumCpaCm ?? input.minimumCpaCm ?? 200));
  const materialCpaGainCm = Math.max(1, Number(options.materialCpaGainCm ?? input.materialCpaGainCm ?? 75));
  const settlementWindowTicks = movementSettlementWindowTicksCore(input.movementTiming || {});
  const tickMs = Math.max(1, Number(options.tickMs ?? input.tickMs ?? 50));
  const ttlMs = Math.max(
    settlementWindowTicks * tickMs * 2,
    Math.min(2500, Math.max(750, Number(options.ttlMs ?? input.ttlMs ?? 1500)))
  );
  const maximumGenerationHoldTicks = Math.max(
    settlementWindowTicks,
    Math.ceil(ttlMs / tickMs)
  );
  const previous = input.previousState && typeof input.previousState === 'object'
    ? input.previousState
    : null;
  const lifecycleMatch = Boolean(
    previous
      && String(previous.targetId ?? '') === targetId
      && String(previous.engagementId ?? '') === engagementId
      && Number(previous.expiresAtMs || 0) >= nowMs
  );
  const baseCounters = lifecycleMatch && previous?.counters
    ? { ...previous.counters }
    : {
        candidateSwitches: 0,
        appliedSwitches: 0,
        suppressedSwitches: 0,
        rapidReversalSuppressed: 0,
        hardReleases: 0
      };

  if (!lifecycleMatch) {
    const state = {
      targetId,
      engagementId,
      direction: candidateDirection,
      previousDirection: null,
      proposedDirection: null,
      proposedAtMs: null,
      proposedTick: null,
      generation: Math.max(1, Number(previous?.generation || 0) + 1),
      selectedAtMs: nowMs,
      selectedTick: tick,
      updatedAtMs: nowMs,
      expiresAtMs: nowMs + ttlMs,
      counters: baseCounters
    };
    return {
      direction: candidateDirection,
      state,
      held: false,
      switched: true,
      reason: previous ? 'movement-stability-lifecycle-reset' : 'movement-stability-initialized',
      settlementWindowTicks,
      maximumGenerationHoldTicks,
      generationAgeTicks: 0,
      candidateThreat: directionThreatCore(input.threatField, candidateDirection),
      heldThreat: null,
      newDirectHits: 0,
      newUnavoidableHits: 0,
      worstCaseCpaCm: null
    };
  }

  const heldDirection = normalizedDirection(previous.direction);
  const heldKey = movementDirectionKeyCore(heldDirection);
  const candidateThreat = directionThreatCore(input.threatField, candidateDirection);
  const heldThreat = directionThreatCore(input.threatField, heldDirection);
  const candidateDirectHits = Math.max(0, Number(candidateThreat?.directHits || 0));
  const heldDirectHits = Math.max(0, Number(heldThreat?.directHits || 0));
  const candidateUnavoidableHits = Math.max(0, Number(candidateThreat?.unavoidableHits || 0));
  const heldUnavoidableHits = Math.max(0, Number(heldThreat?.unavoidableHits || 0));
  const candidateCpa = Number(candidateThreat?.worstCaseCpaCm ?? candidateThreat?.minCPA ?? Infinity);
  const heldCpa = Number(heldThreat?.worstCaseCpaCm ?? heldThreat?.minCPA ?? Infinity);
  const candidateSafe = movementThreatSafeCore(candidateThreat, minimumCpaCm)
    && candidateUnavoidableHits === 0;
  const heldSafe = movementThreatSafeCore(heldThreat, minimumCpaCm)
    && heldUnavoidableHits === 0;
  const selectedTick = Number.isFinite(Number(previous.selectedTick)) ? Number(previous.selectedTick) : null;
  const selectedElapsedTicks = tick !== null && selectedTick !== null
    ? Math.max(0, tick - selectedTick)
    : Math.max(0, Math.floor((nowMs - Number(previous.selectedAtMs || nowMs)) / tickMs));
  const candidateChanged = candidateKey !== heldKey;
  const proposedDirection = previous.proposedDirection
    ? normalizedDirection(previous.proposedDirection)
    : null;
  const proposedKey = proposedDirection ? movementDirectionKeyCore(proposedDirection) : '';
  const proposedMatchesCandidate = Boolean(candidateChanged && proposedDirection && proposedKey === candidateKey);
  const proposedAtMs = proposedMatchesCandidate
    ? Number(previous.proposedAtMs || nowMs)
    : nowMs;
  const proposedTick = proposedMatchesCandidate && Number.isFinite(Number(previous.proposedTick))
    ? Number(previous.proposedTick)
    : tick;
  const elapsedTicks = candidateChanged
    ? (tick !== null && proposedTick !== null
        ? Math.max(0, tick - proposedTick)
        : Math.max(0, Math.floor((nowMs - proposedAtMs) / tickMs)))
    : selectedElapsedTicks;
  const reducedHits = candidateDirectHits < heldDirectHits
    || candidateUnavoidableHits < heldUnavoidableHits;
  const restoredSafety = heldCpa < minimumCpaCm && candidateCpa >= minimumCpaCm;
  const materialCpaGain = Number.isFinite(candidateCpa) && Number.isFinite(heldCpa)
    && candidateCpa - heldCpa >= materialCpaGainCm;
  const hardRelease = Boolean(
    input.hardGateChanged
      || input.transportReset
      || input.commandUpperBoundExpired
      || input.commandUnmatched
      || input.newThreatUrgent
      || !heldSafe
      || reducedHits
      || restoredSafety
      || materialCpaGain
  );
  const withinWindow = elapsedTicks < settlementWindowTicks
    && selectedElapsedTicks < maximumGenerationHoldTicks;
  const canHold = candidateChanged
    && !hardRelease
    && withinWindow
    && heldSafe
    && candidateSafe
    && candidateDirectHits >= heldDirectHits
    && candidateUnavoidableHits >= heldUnavoidableHits;

  if (canHold) {
    const newProposal = !proposedMatchesCandidate;
    if (newProposal) {
      baseCounters.candidateSwitches += 1;
      baseCounters.suppressedSwitches += 1;
    }
    const rapidReversal = previous.previousDirection
      && movementDirectionKeyCore(previous.previousDirection) === candidateKey;
    if (rapidReversal && newProposal) baseCounters.rapidReversalSuppressed += 1;
    const state = {
      ...previous,
      proposedDirection: candidateDirection,
      proposedAtMs,
      proposedTick,
      updatedAtMs: nowMs,
      expiresAtMs: nowMs + ttlMs,
      counters: baseCounters
    };
    return {
      direction: heldDirection,
      state,
      held: true,
      switched: false,
      rapidReversal,
      reason: rapidReversal ? 'movement-stability-a-b-a-suppressed' : 'movement-stability-safe-settlement-hold',
      settlementWindowTicks,
      maximumGenerationHoldTicks,
      generationAgeTicks: selectedElapsedTicks,
      elapsedTicks,
      candidateThreat,
      heldThreat,
      newDirectHits: Math.max(0, heldDirectHits - candidateDirectHits),
      newUnavoidableHits: Math.max(0, heldUnavoidableHits - candidateUnavoidableHits),
      worstCaseCpaCm: Number.isFinite(heldCpa) ? heldCpa : null
    };
  }

  if (!candidateChanged) {
    const proposalReturnedToHeld = Boolean(previous.proposedDirection);
    if (proposalReturnedToHeld) baseCounters.rapidReversalSuppressed += 1;
    return {
      direction: heldDirection,
      state: {
        ...previous,
        proposedDirection: null,
        proposedAtMs: null,
        proposedTick: null,
        updatedAtMs: nowMs,
        expiresAtMs: nowMs + ttlMs,
        counters: baseCounters
      },
      held: false,
      switched: false,
      rapidReversal: proposalReturnedToHeld,
      reason: proposalReturnedToHeld
        ? 'movement-stability-a-b-a-suppressed'
        : 'movement-stability-direction-unchanged',
      settlementWindowTicks,
      maximumGenerationHoldTicks,
      generationAgeTicks: selectedElapsedTicks,
      elapsedTicks,
      candidateThreat,
      heldThreat,
      newDirectHits: 0,
      newUnavoidableHits: 0,
      worstCaseCpaCm: Number.isFinite(candidateCpa) ? candidateCpa : null
    };
  }

  if (!proposedMatchesCandidate) baseCounters.candidateSwitches += 1;
  baseCounters.appliedSwitches += 1;
  if (hardRelease) baseCounters.hardReleases += 1;
  const state = {
    targetId,
    engagementId,
    direction: candidateDirection,
    previousDirection: heldDirection,
    proposedDirection: null,
    proposedAtMs: null,
    proposedTick: null,
    generation: Math.max(1, Number(previous.generation || 0) + 1),
    selectedAtMs: nowMs,
    selectedTick: tick,
    updatedAtMs: nowMs,
    expiresAtMs: nowMs + ttlMs,
    counters: baseCounters
  };
  return {
    direction: candidateDirection,
    state,
    held: false,
    switched: true,
    reason: hardRelease
      ? 'movement-stability-immediate-safety-release'
      : 'movement-stability-window-expired',
    release: {
      hardGateChanged: Boolean(input.hardGateChanged),
      transportReset: Boolean(input.transportReset),
      commandUpperBoundExpired: Boolean(input.commandUpperBoundExpired),
      commandUnmatched: Boolean(input.commandUnmatched),
      newThreatUrgent: Boolean(input.newThreatUrgent),
      heldSafe,
      candidateSafe,
      reducedHits,
      restoredSafety,
      materialCpaGain
    },
    settlementWindowTicks,
    maximumGenerationHoldTicks,
    generationAgeTicks: selectedElapsedTicks,
    elapsedTicks,
    candidateThreat,
    heldThreat,
    newDirectHits: 0,
    newUnavoidableHits: 0,
    worstCaseCpaCm: Number.isFinite(candidateCpa) ? candidateCpa : null
  };
}

/**
 * Pick movement by collision risk first and tactical progress second.
 * Merely having an in-flight projectile must not grant Dodge ownership.
 */
function selectCombatMovementArbitrationCore(input = {}, options = {}) {
  const threatField = Array.isArray(input.threatField) ? input.threatField : [];
  const minimumCpaCm = Math.max(1, Number(options.minimumCpaCm ?? input.minimumCpaCm ?? 200));
  const strategicDirection = normalizedDirection(input.strategicDirection);
  const currentDirection = normalizedDirection(input.currentDirection);
  const pendingDirection = input.pendingDirection ? normalizedDirection(input.pendingDirection) : null;
  const baselineDirection = pendingDirection || currentDirection;
  const strategicThreat = directionThreatCore(threatField, strategicDirection);
  const baselineThreat = directionThreatCore(threatField, baselineDirection);
  const strategicSafe = movementThreatSafeCore(strategicThreat, minimumCpaCm);
  const baselineSafe = movementThreatSafeCore(baselineThreat, minimumCpaCm);
  const pendingActive = Boolean(input.pendingActive && pendingDirection);
  const preferStrategicProgress = input.preferStrategicProgress === true;
  const safeProgress = preferStrategicProgress
    ? safestStrategicProgressDirectionCore(threatField, strategicDirection, minimumCpaCm)
    : { direction: null, candidateCount: 0 };

  // A pending command is only a safety fallback.  It may be the tail of a
  // lateral Dodge generation, so preferring it over an equally safe strategic
  // direction can keep a stale side/retreat vector alive until the target is
  // out of range.  Realtime threat safety still wins below when the strategic
  // direction is unsafe.
  if (strategicSafe) {
    return {
      ...strategicDirection,
      source: 'strategic-safe',
      strategicSafe,
      baselineSafe,
      minimumCpaCm,
      preferStrategicProgress,
      strategicProgress: 1,
      safeProgressCandidateCount: safeProgress.candidateCount,
      safeProgressDirection: strategicDirection,
      competitionApproachPreemptedBy: '',
      selectedThreat: strategicThreat,
      strategicThreat,
      baselineThreat
    };
  }
  if (safeProgress.direction) {
    return {
      ...normalizedDirection(safeProgress.direction),
      source: 'strategic-safe-progress',
      strategicSafe,
      baselineSafe,
      minimumCpaCm,
      preferStrategicProgress,
      strategicProgress: safeProgress.direction.strategicProgress,
      safeProgressCandidateCount: safeProgress.candidateCount,
      safeProgressDirection: normalizedDirection(safeProgress.direction),
      competitionApproachPreemptedBy: '',
      selectedThreat: safeProgress.direction,
      strategicThreat,
      baselineThreat
    };
  }
  if (pendingActive && baselineSafe) {
    return {
      ...baselineDirection,
      source: 'pending-safe-hold',
      strategicSafe,
      baselineSafe,
      minimumCpaCm,
      preferStrategicProgress,
      strategicProgress: strategicDirectionProgressCore(baselineDirection, strategicDirection),
      safeProgressCandidateCount: safeProgress.candidateCount,
      safeProgressDirection: null,
      competitionApproachPreemptedBy: preferStrategicProgress
        ? 'pending-safe-no-forward-option'
        : '',
      selectedThreat: baselineThreat,
      strategicThreat,
      baselineThreat
    };
  }
  if (baselineSafe) {
    return {
      ...baselineDirection,
      source: 'current-safe-hold',
      strategicSafe,
      baselineSafe,
      minimumCpaCm,
      preferStrategicProgress,
      strategicProgress: strategicDirectionProgressCore(baselineDirection, strategicDirection),
      safeProgressCandidateCount: safeProgress.candidateCount,
      safeProgressDirection: null,
      competitionApproachPreemptedBy: preferStrategicProgress
        ? 'current-safe-no-forward-option'
        : '',
      selectedThreat: baselineThreat,
      strategicThreat,
      baselineThreat
    };
  }
  const emergency = normalizedDirection(input.emergencyDirection);
  return {
    ...emergency,
    source: 'emergency-dodge',
    strategicSafe,
    baselineSafe,
    minimumCpaCm,
    preferStrategicProgress,
    strategicProgress: strategicDirectionProgressCore(emergency, strategicDirection),
    safeProgressCandidateCount: safeProgress.candidateCount,
    safeProgressDirection: null,
    competitionApproachPreemptedBy: preferStrategicProgress
      ? 'emergency-no-safe-forward-option'
      : '',
    selectedThreat: directionThreatCore(threatField, emergency),
    strategicThreat,
    baselineThreat
  };
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
 * Decide whether the generic close-spacing back-away must be suppressed because it would
 * push us away from a primary target we are actively finishing for its reward.
 *
 * The generic back-away exists to hold standoff against sustained point-blank fire. Against a
 * rewarding primary target already inside the finish band it inverts the objective: it trades
 * the reward for standoff we do not need while self HP is healthy, and every centimetre it adds
 * has to be re-closed before the drop can be picked up.
 *
 * This suppresses outward drift only. It commands no movement of its own, so a suppressed frame
 * holds spacing instead of retreating. Collision-path Dodge, close-pressure and ballistic
 * separation, invulnerable separation, and every hard safety/exit gate stay authoritative and
 * are evaluated by the caller before this policy is consulted.
 *
 * Every input is observable opponent/self state: no player identity, whitelist membership, or
 * battle window participates.
 *
 * @param {Object} input - { self, target, primaryTarget, distanceCm }
 * @param {Object} options - runtime options
 * @returns {Object} { suppress, reason, ... diagnostics }
 */
function rewardFinishBackAwaySuppressionPolicy(input = {}, options = {}) {
  const self = input.self;
  const target = input.target;
  const distanceCm = Number.isFinite(Number(input.distanceCm))
    ? Number(input.distanceCm)
    : Number(target?.distance);
  const selfHp = Number(self?.hp ?? self?.max_hp ?? 100);
  const targetHp = Number(target?.hp ?? target?.knownHp ?? target?.displayHp);
  const targetDrop = Number(target?.drop ?? 0);
  const finishHp = Math.max(1, Number(
    options.combatFinishLowThreatHp ?? COMBAT_CONSTANTS.FINISH_LOW_THREAT_HP
  ));
  const minSelfHp = Math.max(0, Number(
    options.combatRewardFinishHoldMinSelfHp ?? options.combatLowHpLeaveThreshold ?? 50
  ));
  const minDrop = Math.max(0, Number(
    options.combatLowValueActiveDropMax ?? COMBAT_CONSTANTS.LOW_VALUE_ACTIVE_DROP_MAX
  ));
  const pickupRadiusCm = Math.max(1, Number(
    options.profitKillRaceCloseDistanceCm ?? options.playerDropPickupRadiusCm ?? 150
  ));
  const base = {
    suppress: false,
    enabled: options.combatRewardFinishBackAwayHoldEnabled !== false,
    selfHp: Number.isFinite(selfHp) ? selfHp : null,
    targetHp: Number.isFinite(targetHp) ? targetHp : null,
    targetDrop: Number.isFinite(targetDrop) ? targetDrop : null,
    distanceCm: Number.isFinite(distanceCm) ? distanceCm : null,
    finishHp,
    minSelfHp,
    minDrop,
    pickupRadiusCm
  };
  if (base.enabled !== true) return { ...base, reason: 'reward-finish-hold-disabled' };
  if (input.primaryTarget !== true) return { ...base, reason: 'not-primary-target' };
  if (!Number.isFinite(targetHp) || targetHp <= 0) return { ...base, reason: 'target-hp-unknown' };
  if (targetHp > finishHp) return { ...base, reason: 'target-above-finish-hp' };
  if (!Number.isFinite(targetDrop) || targetDrop <= minDrop) {
    return { ...base, reason: 'target-drop-not-rewarding' };
  }
  if (!Number.isFinite(selfHp) || selfHp <= minSelfHp) return { ...base, reason: 'self-hp-not-healthy' };
  if (!Number.isFinite(distanceCm)) return { ...base, reason: 'distance-unknown' };
  if (distanceCm <= pickupRadiusCm) return { ...base, reason: 'inside-pickup-radius' };
  return { ...base, suppress: true, reason: 'reward-finish-no-outward-drift' };
}

function normalizedPendingVelocityCommands(options = {}) {
  return (options.pendingVelocityCommands || options.velocitySchedule || [])
    .map((command, index) => ({
      commandId: command?.commandId ?? command?.id ?? null,
      repeatOwnerCommandId: command?.repeatOwnerCommandId ?? null,
      dx: Math.max(-1, Math.min(1, Math.round(Number(command?.dx || 0)))),
      dy: Math.max(-1, Math.min(1, Math.round(Number(command?.dy || 0)))),
      effectiveAfterTicks: Math.max(0, Number(command?.effectiveAfterTicks ?? command?.delayTicks ?? 0)),
      sequence: Number(command?.sequence ?? index)
    }))
    .filter(command => Number.isFinite(command.effectiveAfterTicks))
    .sort((a, b) => a.effectiveAfterTicks - b.effectiveAfterTicks || a.sequence - b.sequence)
    .slice(-8);
}

function velocityScheduleVariants(currentVelocity, direction, options = {}) {
  const pending = options[NORMALIZED_PENDING_VELOCITY_COMMANDS]
    || normalizedPendingVelocityCommands(options);
  const timing = options.movementExecutionTiming || options.velocityExecutionTiming || {};
  const commandDelayTicks = Math.max(0, Number(
    options.commandDelayTicks
      ?? options.commandDelayP90Ticks
      ?? timing.p90Ticks
      ?? 5
  ));
  const diagonalScale = direction.dx && direction.dy ? Math.SQRT1_2 : 1;
  const moveSpeedPerTick = Math.max(0, Number(options.moveSpeedPerTick || 50));
  const candidateVelocity = direction.holdCurrent
    ? { vx: currentVelocity.vx, vy: currentVelocity.vy }
    : (direction.stop
      ? { vx: 0, vy: 0 }
      : {
          vx: direction.dx * diagonalScale * moveSpeedPerTick,
          vy: direction.dy * diagonalScale * moveSpeedPerTick
        });
  const pendingEvents = options[NORMALIZED_PENDING_VELOCITY_EVENTS]
    || pending.map(command => {
      const scale = command.dx && command.dy ? Math.SQRT1_2 : 1;
      return {
        ...command,
        vx: command.dx * scale * moveSpeedPerTick,
        vy: command.dy * scale * moveSpeedPerTick,
        source: 'pending-command'
      };
    });
  const lastPendingTick = pendingEvents.reduce((max, command) => Math.max(max, command.effectiveAfterTicks), -1);
  const candidateEffectiveAfterTicks = Math.max(commandDelayTicks, lastPendingTick >= 0 ? lastPendingTick + 1 : 0);
  const expected = [
    ...pendingEvents,
    {
      commandId: null,
      dx: direction.dx,
      dy: direction.dy,
      vx: candidateVelocity.vx,
      vy: candidateVelocity.vy,
      effectiveAfterTicks: candidateEffectiveAfterTicks,
      source: 'candidate-command'
    }
  ];
  const sampleCount = Math.max(0, Number(timing.sampleCount || 0));
  const medianTicks = Math.max(0, Number(timing.medianTicks || 0));
  const p90Ticks = Math.max(commandDelayTicks, Number(timing.p90Ticks || commandDelayTicks));
  const madTicks = Math.max(0, Number(timing.madTicks || 0));
  const timingUncertaintyTicks = Math.max(
    1,
    Math.ceil(madTicks * 2),
    Math.ceil(Math.max(0, p90Ticks - medianTicks))
  );
  if (options.robustScheduleEnabled === false) {
    return {
      variants: [{ name: 'expected', events: expected }],
      pending,
      commandDelayTicks,
      candidateEffectiveAfterTicks,
      timingUncertaintyTicks: 0,
      confidence: 'legacy-expected-only'
    };
  }
  const lowConfidence = sampleCount < 4 || madTicks > 1;
  const currentHold = !pendingEvents.length
    ? expected
    : (direction.holdCurrent ? [] : [{
        commandId: null,
        dx: direction.dx,
        dy: direction.dy,
        vx: candidateVelocity.vx,
        vy: candidateVelocity.vy,
        effectiveAfterTicks: candidateEffectiveAfterTicks + timingUncertaintyTicks,
        source: 'candidate-after-current-hold'
      }]);
  const variants = [
    { name: 'current-hold', events: currentHold },
    { name: 'expected', events: expected }
  ];
  const shifted = shift => {
    let previousTick = -1;
    return expected.map(event => {
      const desired = Math.max(0, Number(event.effectiveAfterTicks) + shift);
      const effectiveAfterTicks = Math.max(desired, previousTick + (previousTick >= 0 ? 1 : 0));
      previousTick = effectiveAfterTicks;
      return { ...event, effectiveAfterTicks };
    });
  };
  // A velocity request is not authoritative until a matching server velocity
  // transition is visible. Always evaluate a late transition, even when the
  // rolling timing distribution is otherwise stable.
  variants.push({ name: 'late-transition', events: shifted(timingUncertaintyTicks) });
  if (lowConfidence) {
    variants.push({ name: 'early-transition', events: shifted(-timingUncertaintyTicks) });
  }
  const uniqueVariants = [];
  const signatures = new Set();
  for (const variant of variants) {
    const signature = variant.events.map(event => `${event.dx},${event.dy},${event.effectiveAfterTicks}`).join('|');
    if (signatures.has(signature)) continue;
    signatures.add(signature);
    uniqueVariants.push(variant);
  }
  return {
    variants: uniqueVariants,
    pending,
    commandDelayTicks,
    candidateEffectiveAfterTicks,
    timingUncertaintyTicks,
    confidence: lowConfidence ? 'low-worst-branch' : (pending.length ? 'measured-robust-schedule' : 'candidate-robust-schedule')
  };
}

function scheduledVelocityAt(intervalTick, currentVelocity, events) {
  let velocity = currentVelocity;
  for (const event of events) {
    if (Number(event.effectiveAfterTicks) > intervalTick + 1) break;
    // Schedule events are immutable for one threat-field evaluation. Reuse
    // the event object instead of allocating a new velocity pair for every
    // simulated tick and trajectory branch.
    velocity = event;
  }
  return velocity;
}

function simulateScheduledSelfPosition(self, intervalTicks, currentVelocity, events) {
  let x = Number(self?.x || 0);
  let y = Number(self?.y || 0);
  const wholeTicks = Math.max(0, Math.floor(intervalTicks));
  for (let tick = 0; tick < wholeTicks; tick += 1) {
    const velocity = scheduledVelocityAt(tick, currentVelocity, events);
    x += velocity.vx;
    y += velocity.vy;
  }
  const fraction = Math.max(0, intervalTicks - wholeTicks);
  if (fraction > 0) {
    const velocity = scheduledVelocityAt(wholeTicks, currentVelocity, events);
    x += velocity.vx * fraction;
    y += velocity.vy * fraction;
  }
  return { x, y };
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

  // Evaluate new directions plus holding the current velocity and stopping.
  const directions = [
    { dx: 0, dy: -1 },   // North
    { dx: 1, dy: -1 },   // NE
    { dx: 1, dy: 0 },    // East
    { dx: 1, dy: 1 },    // SE
    { dx: 0, dy: 1 },    // South
    { dx: -1, dy: 1 },   // SW
    { dx: -1, dy: 0 },   // West
    { dx: -1, dy: -1 },  // NW
    { dx: Math.sign(Number(self?.vx || 0)), dy: Math.sign(Number(self?.vy || 0)), holdCurrent: true },
    { dx: 0, dy: 0, stop: true }
  ];

  const moveSpeedPerTick = Math.max(0, Number(options.moveSpeedPerTick ?? self?.speed_per_tick ?? self?.speedPerTick ?? 50));
  const tickMs = Math.max(1, Number(options.tickMs || 50));
  const hitRadius = Math.max(1, Number(options.hitRadius || 200));
  const movementExecutionTiming = options.movementExecutionTiming || options.velocityExecutionTiming || {};
  const commandDelayTicks = Math.max(0, Number(options.commandDelayTicks
    ?? options.commandDelayP90Ticks
    ?? movementExecutionTiming.p90Ticks
    ?? 5));
  const reactionBudgetMs = Math.max(0, Number(options.reactionBudgetMs
    ?? (commandDelayTicks * tickMs + tickMs + Math.max(0, Number(options.reactionSafetyMarginMs ?? 100)))));
  const currentVx = Number(self?.vx || 0);
  const currentVy = Number(self?.vy || 0);
  const observedVelocity = { vx: currentVx, vy: currentVy };
  const normalizedPending = normalizedPendingVelocityCommands(options);
  const normalizedPendingEvents = normalizedPending.map(command => {
    const scale = command.dx && command.dy ? Math.SQRT1_2 : 1;
    return {
      ...command,
      vx: command.dx * scale * moveSpeedPerTick,
      vy: command.dy * scale * moveSpeedPerTick,
      source: 'pending-command'
    };
  });
  const velocityScheduleOptions = {
    [NORMALIZED_PENDING_VELOCITY_COMMANDS]: normalizedPending,
    [NORMALIZED_PENDING_VELOCITY_EVENTS]: normalizedPendingEvents,
    movementExecutionTiming,
    commandDelayTicks,
    moveSpeedPerTick,
    robustScheduleEnabled: options.robustScheduleEnabled
  };
  const threatField = directions.map(dir => {
    let directHits = 0;
    let avoidableHits = 0;
    let unavoidableHits = 0;
    let minCPA = Infinity;
    let rawMinCPA = Infinity;
    let minTTI = Infinity;
    let scheduleRobust = true;
    let unconfirmedTransitionRisk = false;
    const bulletRisks = [];
    const schedule = velocityScheduleVariants(observedVelocity, dir, velocityScheduleOptions);

    for (const bullet of incoming) {
      const tti = Number(bullet.timeToImpact || 1000);
      const bulletX = Number(bullet.x);
      const bulletY = Number(bullet.y);
      const directionX = Number(bullet.direction?.dx);
      const directionY = Number(bullet.direction?.dy);
      const bulletSpeed = Number(bullet.speed || COMBAT_CONSTANTS.BULLET_SPEED_CM_PER_TICK);
      let cpa = Number(bullet.cpa ?? bullet.distance ?? Infinity);
      let currentHoldCpa = cpa;
      let expectedCpa = cpa;
      let lateCpa = cpa;
      if ([bulletX, bulletY, directionX, directionY, bulletSpeed].every(Number.isFinite)) {
        cpa = Infinity;
        const ttiTicks = Math.max(1, Math.ceil(tti / tickMs));
        const remainingTicks = Number(bullet.remainingTicks);
        const trajectoryTicks = Number.isFinite(remainingTicks) && remainingTicks > 0
          ? Math.ceil(remainingTicks)
          : ttiTicks;
        const endTick = Math.max(1, Math.min(Math.max(1, Number(options.maxTrajectoryTicks || 60)), trajectoryTicks));
        for (const variant of schedule.variants) {
          let variantCpa = Infinity;
          let selfX = Number(self?.x || 0);
          let selfY = Number(self?.y || 0);
          for (let tick = 0; tick <= endTick; tick += 1) {
            const bulletAtX = bulletX + directionX * bulletSpeed * tick;
            const bulletAtY = bulletY + directionY * bulletSpeed * tick;
            variantCpa = Math.min(variantCpa, Math.hypot(selfX - bulletAtX, selfY - bulletAtY));
            if (tick >= endTick) break;
            const velocity = scheduledVelocityAt(tick, observedVelocity, variant.events);
            selfX += velocity.vx;
            selfY += velocity.vy;
          }
          cpa = Math.min(cpa, variantCpa);
          if (variant.name === 'current-hold') currentHoldCpa = variantCpa;
          if (variant.name === 'expected') expectedCpa = variantCpa;
          if (variant.name === 'late-transition') lateCpa = variantCpa;
        }
      }

      const trajectoryResidualCm = Math.max(0, Number(
        bullet.trajectoryResidualCm
          ?? bullet.trajectory_residual_cm
          ?? 0
      ));
      const trajectoryUncertaintyCm = options.robustScheduleEnabled === false
        ? 0
        : Math.min(260, Math.max(
        trajectoryResidualCm,
        Number(bullet.trajectoryUncertaintyCm ?? bullet.trajectory_uncertainty_cm ?? 0)
      ));
      const robustCpa = Math.max(0, cpa - trajectoryUncertaintyCm);
      const currentHoldRobustCpa = Math.max(0, currentHoldCpa - trajectoryUncertaintyCm);
      const expectedRobustCpa = Math.max(0, expectedCpa - trajectoryUncertaintyCm);
      const lateRobustCpa = Math.max(0, lateCpa - trajectoryUncertaintyCm);
      const expectedHit = expectedRobustCpa < hitRadius;
      const lateHit = lateRobustCpa < hitRadius;
      const currentHoldHit = currentHoldRobustCpa < hitRadius;
      if (!expectedHit && (currentHoldHit || lateHit)) unconfirmedTransitionRisk = true;
      if (robustCpa < hitRadius) scheduleRobust = false;

      if (robustCpa < hitRadius) {
        directHits++;
        if (tti < reactionBudgetMs) unavoidableHits++;
        else avoidableHits++;
      }
      bulletRisks.push({
        bulletId: String(
          bullet?.bullet_id
            ?? bullet?.bulletId
            ?? `${bullet?.createdTick ?? bullet?.created_tick ?? ''}:${bullet?.startX ?? bullet?.x ?? ''}:${bullet?.startY ?? bullet?.y ?? ''}`
        ),
        ownerId: bullet?.ownerId ?? bullet?.owner_id ?? null,
        createdTick: Number.isFinite(Number(bullet?.createdTick ?? bullet?.created_tick))
          ? Number(bullet.createdTick ?? bullet.created_tick)
          : null,
        expireTick: Number.isFinite(Number(bullet?.expireTick ?? bullet?.expire_tick))
          ? Number(bullet.expireTick ?? bullet.expire_tick)
          : null,
        speed: Number.isFinite(bulletSpeed) ? bulletSpeed : null,
        timeToImpact: Number.isFinite(tti) ? tti : null,
        cpa: Number.isFinite(cpa) ? cpa : null,
        worstCaseCpaCm: Number.isFinite(robustCpa) ? robustCpa : null,
        currentHoldCpaCm: Number.isFinite(currentHoldRobustCpa) ? currentHoldRobustCpa : null,
        expectedCpaCm: Number.isFinite(expectedRobustCpa) ? expectedRobustCpa : null,
        lateCpaCm: Number.isFinite(lateRobustCpa) ? lateRobustCpa : null,
        trajectoryResidualCm,
        trajectoryUncertaintyCm,
        predictedHit: robustCpa < hitRadius,
        currentHoldHit,
        expectedHit,
        lateHit,
        avoidable: robustCpa < hitRadius && tti >= reactionBudgetMs
      });
      if (cpa < rawMinCPA) rawMinCPA = cpa;
      if (robustCpa < minCPA) minCPA = robustCpa;
      if (tti < minTTI) minTTI = tti;
    }

    const targetFutureTicks = Number.isFinite(minTTI) ? Math.max(0, minTTI / tickMs - commandDelayTicks) : 0;
    const candidateFutureSelf = simulateScheduledSelfPosition(
      self,
      targetFutureTicks,
      observedVelocity,
      (schedule.variants.find(variant => variant.name === 'expected') || schedule.variants[0]).events
    );
    return {
      dx: dir.dx,
      dy: dir.dy,
      directHits,
      avoidableHits,
      unavoidableHits,
      minCPA,
      rawMinCPA,
      worstCaseCpaCm: minCPA,
      minTTI,
      commandDelayTicks,
      candidateEffectiveAfterTicks: schedule.candidateEffectiveAfterTicks,
      observedVelocity,
      pendingVelocityCommand: schedule.pending[0] || null,
      predictedVelocitySchedule: (schedule.variants.find(variant => variant.name === 'expected') || schedule.variants[0]).events.map(event => ({
        commandId: event.commandId,
        dx: event.dx,
        dy: event.dy,
        effectiveAfterTicks: event.effectiveAfterTicks,
        source: event.source
      })),
      velocityScheduleVariants: schedule.variants.slice(0, 4).map(variant => ({
        name: variant.name,
        events: variant.events.map(event => ({
          commandId: event.commandId,
          dx: event.dx,
          dy: event.dy,
          effectiveAfterTicks: event.effectiveAfterTicks,
          source: event.source
        }))
      })),
      velocityScheduleConfidence: schedule.confidence,
      timingUncertaintyTicks: schedule.timingUncertaintyTicks,
      scheduleRobust,
      robustClassification: scheduleRobust ? 'robust-safe' : 'robust-unsafe',
      unconfirmedTransitionRisk,
      trajectoryResidualCm: Math.max(0, ...bulletRisks.map(item => Number(item.trajectoryResidualCm || 0))),
      reactionBudgetMs,
      dangerousBullets: bulletRisks
        .sort((left, right) => Number(right.predictedHit) - Number(left.predictedHit)
          || Number(left.cpa ?? Infinity) - Number(right.cpa ?? Infinity)
          || Number(left.timeToImpact ?? Infinity) - Number(right.timeToImpact ?? Infinity))
        .slice(0, 8),
      targetDistanceChange: Number.isFinite(Number(options.target?.x)) && Number.isFinite(Number(options.target?.y))
        ? Math.hypot(candidateFutureSelf.x - Number(options.target.x), candidateFutureSelf.y - Number(options.target.y))
          - Math.hypot(Number(self?.x || 0) - Number(options.target.x), Number(self?.y || 0) - Number(options.target.y))
        : 0,
      threat: directHits * 1000000 - Math.min(999999, minCPA)
    };
  });

  // Sort by threat ascending (lowest threat = safest)
  threatField.sort((a, b) => a.avoidableHits - b.avoidableHits
    || a.directHits - b.directHits
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
        observedVelocity: tangentDir.observedVelocity,
        pendingVelocityCommand: tangentDir.pendingVelocityCommand,
        predictedVelocitySchedule: tangentDir.predictedVelocitySchedule,
        velocityScheduleConfidence: tangentDir.velocityScheduleConfidence,
        threatField
      };
    }
  }

  // Use safest direction
  return {
    dx: safest.dx,
    dy: safest.dy,
    reason: safest.unavoidableHits > 0 && safest.avoidableHits === 0
      ? 'unavoidable-current-shot'
      : (safest.directHits > 0 ? 'direct-threat-dodge' : 'safe-dodge'),
    reactionBudgetMs,
    unavoidableCurrentShot: safest.unavoidableHits > 0,
    observedVelocity: safest.observedVelocity,
    pendingVelocityCommand: safest.pendingVelocityCommand,
    predictedVelocitySchedule: safest.predictedVelocitySchedule,
    velocityScheduleConfidence: safest.velocityScheduleConfidence,
    threatField
  };
}

const DISTANCE_AWARE_DODGE_MODES = new Set([
  'long-observe',
  'medium-reactive',
  'close-proactive'
]);
const DISTANCE_AWARE_DODGE_SUBMODES = new Set(['predictive', 'stochastic']);

function finiteMovementNumber(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function directionDotCore(left = {}, right = {}) {
  return Number(left.dx || 0) * Number(right.dx || 0)
    + Number(left.dy || 0) * Number(right.dy || 0);
}

function directionOppositeCore(left = {}, right = {}) {
  const leftDirection = normalizedDirection(left);
  const rightDirection = normalizedDirection(right);
  return Boolean((leftDirection.dx || leftDirection.dy)
    && (rightDirection.dx || rightDirection.dy)
    && directionDotCore(leftDirection, rightDirection) < 0);
}

function distanceAwareRadialIntentCore(input = {}) {
  const explicit = input.radialIntentVector || input.baseRadialIntent?.vector;
  if (explicit && Number.isFinite(Number(explicit.dx)) && Number.isFinite(Number(explicit.dy))) {
    return {
      dx: Number(explicit.dx),
      dy: Number(explicit.dy),
      source: input.baseRadialIntent?.source || 'explicit'
    };
  }
  const base = normalizedDirection(input.baseMovement || input.baseDirection);
  return { dx: base.dx, dy: base.dy, source: 'base-movement' };
}

function distanceAwareRelativeMotionCore(self = {}, target = {}) {
  const dx = finiteMovementNumber(target.x, 0) - finiteMovementNumber(self.x, 0);
  const dy = finiteMovementNumber(target.y, 0) - finiteMovementNumber(self.y, 0);
  const distance = Math.hypot(dx, dy);
  const relativeVx = finiteMovementNumber(target.vx, 0) - finiteMovementNumber(self.vx, 0);
  const relativeVy = finiteMovementNumber(target.vy, 0) - finiteMovementNumber(self.vy, 0);
  if (!(distance > 0)) {
    return { distanceCm: 0, radialSpeedCmPerTick: 0, lateralSpeedCmPerTick: 0, relativeSpeedCmPerTick: 0 };
  }
  const radialSpeed = (dx * relativeVx + dy * relativeVy) / distance;
  const relativeSpeed = Math.hypot(relativeVx, relativeVy);
  return {
    distanceCm: distance,
    radialSpeedCmPerTick: radialSpeed,
    lateralSpeedCmPerTick: Math.sqrt(Math.max(0, relativeSpeed * relativeSpeed - radialSpeed * radialSpeed)),
    relativeSpeedCmPerTick: relativeSpeed
  };
}

function sameRadialIntentCore(candidate = {}, radialIntent = {}, options = {}) {
  const candidateDirection = normalizedDirection(candidate);
  const radial = {
    dx: finiteMovementNumber(radialIntent.dx, 0),
    dy: finiteMovementNumber(radialIntent.dy, 0)
  };
  const radialLength = Math.hypot(radial.dx, radial.dy);
  if (!(candidateDirection.dx || candidateDirection.dy) || !(radialLength > 0)) return true;
  // A pre-dodge may add a lateral component, but it must not reverse or erase
  // an already selected approach/retreat axis. The final movement direction is
  // a single normalized command, so preserving each non-zero axis is the
  // conservative representation of the existing radial intent.
  if (options.preserveRadialAxes !== false) {
    if (radial.dx !== 0 && candidateDirection.dx !== Math.sign(radial.dx)) return false;
    if (radial.dy !== 0 && candidateDirection.dy !== Math.sign(radial.dy)) return false;
  }
  const dot = directionDotCore(candidateDirection, radial);
  const minimumDot = Number(options.minimumDot ?? 0);
  return dot >= minimumDot;
}

function candidateWithinBoundaryCore(self, direction, options = {}) {
  const boundary = options.boundary && typeof options.boundary === 'object'
    ? options.boundary
    : null;
  if (!boundary) return true;
  const x = finiteMovementNumber(self?.x);
  const y = finiteMovementNumber(self?.y);
  const minX = finiteMovementNumber(boundary.minX);
  const maxX = finiteMovementNumber(boundary.maxX);
  const minY = finiteMovementNumber(boundary.minY);
  const maxY = finiteMovementNumber(boundary.maxY);
  if ([x, y, minX, maxX, minY, maxY].some(value => value === null)) return false;
  const holdTicks = Math.max(1, Number(options.boundaryProjectionTicks ?? 4));
  const speed = Math.max(0, Number(options.moveSpeedPerTick ?? 50));
  const diagonalScale = direction.dx && direction.dy ? Math.SQRT1_2 : 1;
  const projected = {
    x: x + direction.dx * diagonalScale * speed * holdTicks,
    y: y + direction.dy * diagonalScale * speed * holdTicks
  };
  const margin = Math.max(0, Number(options.boundaryMarginCm ?? 1000));
  return projected.x >= minX + margin
    && projected.x <= maxX - margin
    && projected.y >= minY + margin
    && projected.y <= maxY - margin;
}

function deriveCombatReactionBudgetCore(input = {}, options = {}) {
  const tickMs = Math.max(1, Number(options.tickMs ?? input.tickMs ?? 50));
  const nowMs = finiteMovementNumber(input.nowMs ?? options.nowMs, Date.now());
  const observedAtMs = finiteMovementNumber(
    input.realtimeStateObservedAtMs
      ?? input.observedAtMs
      ?? input.realtime?.receivedAtMs
      ?? options.realtimeStateObservedAtMs
  );
  const explicitAgeMs = finiteMovementNumber(input.realtimeStateAgeMs ?? options.realtimeStateAgeMs);
  const observationAgeMs = explicitAgeMs === null
    ? (observedAtMs === null ? null : Math.max(0, nowMs - observedAtMs))
    : Math.max(0, explicitAgeMs);
  const timing = input.movementExecutionTiming || input.velocityExecutionTiming || {};
  const sampleCount = Math.max(0, Number(timing.sampleCount || timing.exactSampleCount || 0));
  const medianTicks = Math.max(0, finiteMovementNumber(timing.medianTicks, 5));
  const p90Ticks = Math.max(medianTicks, finiteMovementNumber(timing.p90Ticks, 5));
  const conservativeVisibleTicks = sampleCount >= 4
    ? Math.max(medianTicks, p90Ticks)
    : Math.max(5, p90Ticks);
  const pending = normalizedPendingVelocityCommands({
    pendingVelocityCommands: input.pendingVelocityCommands || input.velocitySchedule
  });
  const pendingTailTicks = pending.reduce(
    (maximum, command) => Math.max(maximum, Number(command.effectiveAfterTicks || 0)),
    0
  );
  const decisionQueueDelayTicks = Math.max(0, Number(
    input.decisionQueueDelayTicks
      ?? options.decisionQueueDelayTicks
      ?? 1
  ));
  const dispatchDelayTicks = Math.max(0, Number(
    input.movementDispatchDelayTicks
      ?? options.movementDispatchDelayTicks
      ?? 1
  ));
  const pendingQueueTicks = pending.length
    ? Math.max(1, pendingTailTicks + 1)
    : 0;
  const safetyMarginTicks = Math.max(0, Number(
    input.reactionSafetyMarginTicks
      ?? options.reactionSafetyMarginTicks
      ?? 2
  ));
  const commandBudgetTicks = Math.max(
    1,
    decisionQueueDelayTicks
      + dispatchDelayTicks
      + conservativeVisibleTicks
      + pendingQueueTicks
      + safetyMarginTicks
  );
  return {
    tickMs,
    nowMs,
    observationAgeMs,
    observationAgeTicks: observationAgeMs === null ? null : observationAgeMs / tickMs,
    sampleCount,
    medianTicks,
    p90Ticks,
    decisionQueueDelayTicks,
    dispatchDelayTicks,
    pendingQueueTicks,
    safetyMarginTicks,
    commandBudgetTicks,
    commandBudgetMs: commandBudgetTicks * tickMs,
    pendingCommandSchedule: pending.slice(-8).map(command => ({
      commandId: command.commandId,
      dx: command.dx,
      dy: command.dy,
      effectiveAfterTicks: command.effectiveAfterTicks,
      sequence: command.sequence
    }))
  };
}

function currentProspectiveReactionSlackCore(input = {}, options = {}) {
  const budget = input.commandBudget && typeof input.commandBudget === 'object'
    ? input.commandBudget
    : deriveCombatReactionBudgetCore(input, options);
  const tickMs = Math.max(1, Number(budget.tickMs || options.tickMs || 50));
  const observationAgeMs = finiteMovementNumber(budget.observationAgeMs, 0);
  const bullets = Array.isArray(input.bullets) ? input.bullets : [];
  const threateningBullets = bullets
    .filter(bullet => bullet?.incoming !== false)
    .map(bullet => finiteMovementNumber(bullet.timeToImpact ?? bullet.time_to_impact_ms))
    .filter(value => value !== null && value > 0)
    .sort((left, right) => left - right);
  const bulletTTI = threateningBullets.length ? threateningBullets[0] : null;
  const reactionSlackMs = bulletTTI === null
    ? null
    : bulletTTI - observationAgeMs - Number(budget.commandBudgetMs || 0);
  const self = input.self || {};
  const target = input.target || {};
  const distanceCm = finiteMovementNumber(
    target.distance
      ?? (finiteMovementNumber(target.x) === null || finiteMovementNumber(self.x) === null
        ? null
        : Math.hypot(Number(target.x) - Number(self.x), Number(target.y) - Number(self.y)))
  );
  const bulletSpeed = Math.max(1, Number(
    options.bulletSpeedCmPerTick
      ?? input.bulletSpeedCmPerTick
      ?? 500
  ));
  const prospectiveCreationTicks = Math.max(0, Number(
    options.prospectiveCreationDelayTicks
      ?? input.prospectiveCreationDelayTicks
      ?? 0
  ));
  const prospectiveBulletTTI = distanceCm === null
    ? null
    : (prospectiveCreationTicks + distanceCm / bulletSpeed) * tickMs;
  const prospectiveReactionSlackMs = prospectiveBulletTTI === null
    ? null
    : prospectiveBulletTTI - observationAgeMs - Number(budget.commandBudgetMs || 0);
  const dodge = input.dodge || null;
  const threatField = Array.isArray(dodge?.threatField) ? dodge.threatField : [];
  const directThreats = threatField.filter(item => Number(item?.directHits || 0) > 0);
  const currentShotAvoidability = dodge?.unavoidableCurrentShot === true
    ? 'unavoidable'
    : (directThreats.length ? 'avoidable' : 'safe');
  const nextVolleyMinCpaCm = finiteMovementNumber(
    input.nextVolleyMinCpaCm
      ?? (threatField.length
        ? Math.min(...threatField.map(item => Number(item?.minCPA ?? Infinity)))
        : null)
  );
  const currentDirection = normalizedDirection(input.currentDirection || input.self);
  const pendingDirection = input.pendingDirection
    ? normalizedDirection(input.pendingDirection)
    : null;
  const currentDirectionThreat = directionThreatCore(threatField, currentDirection);
  const pendingDirectionThreat = pendingDirection
    ? directionThreatCore(threatField, pendingDirection)
    : null;
  const currentDirectionSafe = Boolean(
    currentDirectionThreat
      && movementThreatSafeCore(currentDirectionThreat, Number(options.minimumCpaCm ?? 200))
  );
  const pendingDirectionSafe = Boolean(
    pendingDirectionThreat
      && movementThreatSafeCore(pendingDirectionThreat, Number(options.minimumCpaCm ?? 200))
  );
  return {
    ...budget,
    bulletTTI,
    prospectiveBulletTTI,
    reactionSlackMs,
    prospectiveReactionSlackMs,
    reactionSlackTicks: reactionSlackMs === null ? null : reactionSlackMs / tickMs,
    prospectiveReactionSlackTicks: prospectiveReactionSlackMs === null ? null : prospectiveReactionSlackMs / tickMs,
    currentShotAvoidability,
    nextVolleyMinCpaCm,
    currentDirectionSafe,
    pendingDirectionSafe,
    threateningBulletCount: threateningBullets.length,
    currentShotBulletCount: directThreats.length
  };
}

function classifyDistanceAwareDodgeModeCore(input = {}, options = {}) {
  const slack = input.reactionSlack && typeof input.reactionSlack === 'object'
    ? input.reactionSlack
    : currentProspectiveReactionSlackCore(input, options);
  const nowMs = finiteMovementNumber(input.nowMs ?? slack.nowMs, Date.now());
  const targetId = String(input.targetId ?? input.target?.user_id ?? input.target?.entity_id ?? '');
  const engagementId = String(input.engagementId ?? targetId);
  const previous = input.previousState && typeof input.previousState === 'object'
    ? input.previousState
    : null;
  const lifecycleMatch = Boolean(previous
    && String(previous.targetId ?? '') === targetId
    && String(previous.engagementId ?? '') === engagementId);
  const desiredMode = slack.currentShotAvoidability === 'unavoidable'
    || (slack.prospectiveReactionSlackMs !== null && slack.prospectiveReactionSlackMs <= 0)
    || (slack.reactionSlackMs !== null && slack.reactionSlackMs <= 0 && slack.threateningBulletCount > 0)
    ? 'close-proactive'
    : (slack.threateningBulletCount > 0 ? 'medium-reactive' : 'long-observe');
  const minimumHoldMs = Math.max(
    Number(options.modeMinimumHoldMs ?? 300),
    Number(slack.commandBudgetMs || 0)
  );
  const modeSinceMs = lifecycleMatch && Number.isFinite(Number(previous.modeSinceMs))
    ? Number(previous.modeSinceMs)
    : nowMs;
  const modeAgeMs = Math.max(0, nowMs - modeSinceMs);
  const hardSafety = Boolean(
    input.exitActive
      || input.boundaryRisk
      || input.newThreatUrgent
      || (desiredMode === 'close-proactive' && previous?.mode !== 'close-proactive')
  );
  const previousMode = lifecycleMatch && DISTANCE_AWARE_DODGE_MODES.has(String(previous.mode))
    ? String(previous.mode)
    : null;
  const held = Boolean(previousMode && previousMode !== desiredMode && modeAgeMs < minimumHoldMs && !hardSafety);
  const mode = held ? previousMode : desiredMode;
  const state = lifecycleMatch
    ? {
        ...previous,
        targetId,
        engagementId,
        mode,
        modeSinceMs: held ? modeSinceMs : nowMs,
        updatedAtMs: nowMs,
        modeAgeMs: held ? modeAgeMs : 0
      }
    : {
        targetId,
        engagementId,
        mode,
        modeSinceMs: nowMs,
        updatedAtMs: nowMs,
        modeAgeMs: 0
      };
  return {
    mode,
    desiredMode,
    held,
    hardSafety,
    transitionReason: held
      ? 'distance-aware-mode-minimum-hold'
      : (previousMode && previousMode !== mode ? 'distance-aware-mode-transition' : 'distance-aware-mode-stable'),
    modeAgeMs: held ? modeAgeMs : 0,
    minimumHoldMs,
    state,
    reactionSlack: slack
  };
}

function predictNextFireWindowCore(input = {}, options = {}) {
  const behavior = input.opponentBehaviorState || input.behavior || {};
  const metrics = behavior.metrics || {};
  const phase = behavior.dimensions?.shootingPhase || input.shootingPhase || {};
  const nowMs = finiteMovementNumber(input.nowMs, Date.now());
  const tickMs = Math.max(1, Number(options.tickMs ?? 50));
  const explicitNextShot = finiteMovementNumber(input.nextShotInMs ?? phase.nextShotInMs);
  const meanIntervalMs = finiteMovementNumber(
    input.shotIntervalMeanMs
      ?? metrics.shotIntervalMeanMs
      ?? (finiteMovementNumber(metrics.intervalMedianTicks) === null
        ? null
        : Number(metrics.intervalMedianTicks) * tickMs)
  );
  const lastShotAtMs = finiteMovementNumber(
    input.lastObservedShotAtMs
      ?? metrics.lastShotAtMs
      ?? behavior.lastShotAtMs
  );
  const nextShotInMs = explicitNextShot !== null
    ? Math.max(0, explicitNextShot)
    : (lastShotAtMs !== null && meanIntervalMs !== null
        ? Math.max(0, lastShotAtMs + meanIntervalMs - nowMs)
        : null);
  const sampleCount = Math.max(0, Number(
    input.shotSampleCount
      ?? metrics.burstSampleCount
      ?? metrics.shotSampleCount
      ?? metrics.sampleCount
      ?? 0
  ));
  const intervalCv = Math.max(0, Number(input.shotIntervalCv ?? metrics.shotIntervalCv ?? 1));
  const confidence = nextShotInMs === null
    ? 0
    : Math.max(0, Math.min(1, Math.min(1, sampleCount / 4) * (1 - Math.min(0.8, intervalCv * 0.5))));
  const laneCount = Math.max(0, Math.min(4, Math.round(Number(
    input.predictedLaneCount
      ?? (confidence >= 0.55 ? 2 : 0)
  ))));
  const predictedFireWindowTicks = nextShotInMs === null
    ? null
    : Math.max(0, Math.ceil(nextShotInMs / tickMs));
  return {
    nextShotInMs,
    predictedFireWindowTicks,
    predictedLaneCount: laneCount,
    confidence,
    intervalMeanMs: meanIntervalMs,
    intervalCv,
    sampleCount,
    predictiveEligible: Boolean(nextShotInMs !== null && confidence >= 0.55 && laneCount > 0),
    source: explicitNextShot !== null
      ? 'realtime-shooting-phase'
      : (lastShotAtMs !== null && meanIntervalMs !== null ? 'causal-cadence-prefix' : 'insufficient-cadence-evidence')
  };
}

function createSeededRandomCore(seed = 1) {
  let state = Number(seed) >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function selectStochasticDodgeCandidateCore(candidates = [], options = {}) {
  const normalized = (Array.isArray(candidates) ? candidates : [])
    .filter(candidate => candidate && candidate.safe !== false)
    .map(candidate => ({
      ...candidate,
      ...normalizedDirection(candidate)
    }))
    .filter(candidate => candidate.dx || candidate.dy)
    .slice(0, Math.max(1, Math.min(8, Number(options.maxCandidates ?? 8))));
  if (!normalized.length) return { selected: null, randomChoice: null, candidates: [] };
  const randomSource = typeof options.rng === 'function'
    ? options.rng
    : (typeof options.random === 'function' ? options.random : Math.random);
  const unit = Math.max(0, Math.min(0.999999999, finiteMovementNumber(randomSource(), 0)));
  const index = Math.min(normalized.length - 1, Math.floor(unit * normalized.length));
  return {
    selected: normalized[index],
    randomChoice: {
      unit,
      index,
      candidateCount: normalized.length,
      dx: normalized[index].dx,
      dy: normalized[index].dy
    },
    candidates: normalized.map(candidate => ({
      dx: candidate.dx,
      dy: candidate.dy,
      score: finiteMovementNumber(candidate.score),
      minCpaCm: finiteMovementNumber(candidate.minCpaCm)
    }))
  };
}

function distanceAwareCandidateRowsCore(input = {}, radialIntent = {}, options = {}) {
  const threatField = Array.isArray(input.threatField) ? input.threatField : [];
  const source = threatField.length
    ? threatField
        .filter(item => Number(item?.directHits || 0) === 0
          && Number(item?.unavoidableHits || 0) === 0
          && item?.scheduleRobust !== false)
        .map(item => ({
          ...item,
          dx: item.dx,
          dy: item.dy,
          safe: true,
          score: Number(item.minCPA ?? item.worstCaseCpaCm ?? 0),
          minCpaCm: Number(item.minCPA ?? item.worstCaseCpaCm ?? 0)
        }))
    : (Array.isArray(input.safeCandidates) ? input.safeCandidates : []);
  // A default direction is not evidence that it is safe. Predictive and
  // stochastic pre-dodge may only use a complete threat-field evaluation or
  // an explicitly validated offline candidate set.
  if (!source.length) return [];
  const seen = new Set();
  return source
    .map(candidate => ({
      ...candidate,
      ...normalizedDirection(candidate)
    }))
    .filter(candidate => candidate.dx || candidate.dy)
    .filter(candidate => candidate.safe !== false)
    .filter(candidate => movementThreatSafeCore(candidate, options.minimumCpaCm ?? 200))
    .filter(candidate => sameRadialIntentCore(candidate, radialIntent, { minimumDot: 0 }))
    .filter(candidate => candidateWithinBoundaryCore(input.self, candidate, options))
    .filter(candidate => {
      const key = movementDirectionKeyCore(candidate);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, Math.max(1, Math.min(8, Number(options.maxCandidates ?? 8))));
}

function buildProspectiveDodgeThreatFieldCore(input = {}, prediction = {}, options = {}) {
  const observedNextShotInMs = finiteMovementNumber(prediction.nextShotInMs);
  const sampleCount = Math.max(0, Number(prediction.sampleCount || 0));
  const uncertainObservedWindow = options.allowUncertainFireWindow === true
    && observedNextShotInMs !== null
    && sampleCount < 2;
  const unscheduledCloseEnvelope = options.allowUnscheduledCloseEnvelope === true
    && observedNextShotInMs === null
    && sampleCount < 2;
  if ((observedNextShotInMs === null || sampleCount < 2)
    && !uncertainObservedWindow
    && !unscheduledCloseEnvelope) return null;
  const nextShotInMs = unscheduledCloseEnvelope
    ? Math.max(0, Number(options.earliestReasonableCreationMs ?? 0))
    : observedNextShotInMs;
  const self = input.self || {};
  const target = input.target || {};
  const selfX = finiteMovementNumber(self.x);
  const selfY = finiteMovementNumber(self.y);
  const targetX = finiteMovementNumber(target.x);
  const targetY = finiteMovementNumber(target.y);
  if ([selfX, selfY, targetX, targetY].some(value => value === null)) return null;
  const tickMs = Math.max(1, Number(options.tickMs ?? input.tickMs ?? 50));
  const nextShotTicks = Math.max(1, Math.ceil(nextShotInMs / tickMs));
  const targetVx = finiteMovementNumber(target.vx, 0);
  const targetVy = finiteMovementNumber(target.vy, 0);
  const targetAtCreation = {
    x: targetX + targetVx * nextShotTicks,
    y: targetY + targetVy * nextShotTicks
  };
  const aimDx = selfX - targetAtCreation.x;
  const aimDy = selfY - targetAtCreation.y;
  const aimDistance = Math.hypot(aimDx, aimDy);
  if (!(aimDistance > 0)) return null;
  const directionX = aimDx / aimDistance;
  const directionY = aimDy / aimDistance;
  const bulletSpeed = Math.max(1, Number(
    options.bulletSpeedCmPerTick
      ?? input.bulletSpeedCmPerTick
      ?? COMBAT_CONSTANTS.BULLET_SPEED_CM_PER_TICK
  ));
  const bulletStart = {
    x: targetAtCreation.x - directionX * bulletSpeed * nextShotTicks,
    y: targetAtCreation.y - directionY * bulletSpeed * nextShotTicks
  };
  const timeToImpactTicks = nextShotTicks + aimDistance / bulletSpeed;
  const virtualBullet = {
    incoming: true,
    synthetic: true,
    bullet_id: 'prospective-next-fire-window',
    x: bulletStart.x,
    y: bulletStart.y,
    distance: Math.hypot(bulletStart.x - selfX, bulletStart.y - selfY),
    cpa: aimDistance,
    timeToImpact: timeToImpactTicks * tickMs,
    remainingTicks: timeToImpactTicks,
    speed: bulletSpeed,
    direction: { dx: directionX, dy: directionY }
  };
  const dodge = calculateDodgeDirection(self, [virtualBullet], {
    moveSpeedPerTick: options.moveSpeedPerTick ?? input.moveSpeedPerTick ?? 50,
    tickMs,
    hitRadius: options.hitRadiusCm ?? input.hitRadiusCm ?? COMBAT_CONSTANTS.BULLET_HIT_RADIUS_CM,
    commandDelayP90Ticks: options.commandDelayP90Ticks ?? input.commandDelayP90Ticks,
    movementExecutionTiming: input.movementExecutionTiming,
    pendingVelocityCommands: input.pendingVelocityCommands,
    currentTick: input.currentTick,
    robustScheduleEnabled: options.robustScheduleEnabled
  });
  return {
    source: unscheduledCloseEnvelope
      ? 'causal-close-envelope-counterfactual'
      : (uncertainObservedWindow ? 'causal-low-confidence-fire-window' : 'causal-next-fire-window'),
    virtualBullet: {
      nextShotInMs: Math.round(nextShotInMs),
      nextShotTicks,
      targetAtCreation: {
        x: Math.round(targetAtCreation.x),
        y: Math.round(targetAtCreation.y)
      },
      timeToImpactTicks: Math.round(timeToImpactTicks * 10) / 10
    },
    threatField: dodge?.threatField || []
  };
}

function resolveDistanceAwareDodgeCore(input = {}, options = {}) {
  const nowMs = finiteMovementNumber(input.nowMs, Date.now());
  const reactionSlack = input.reactionSlack && typeof input.reactionSlack === 'object'
    ? input.reactionSlack
    : currentProspectiveReactionSlackCore(input, options);
  const modeDecision = classifyDistanceAwareDodgeModeCore({
    ...input,
    reactionSlack
  }, options);
  const mode = modeDecision.mode;
  const target = input.target || {};
  const baseDirection = normalizedDirection(input.baseMovement || input.baseDirection);
  const currentDirection = normalizedDirection(input.currentDirection || input.self);
  const pendingDirection = input.pendingDirection ? normalizedDirection(input.pendingDirection) : null;
  const radialIntent = distanceAwareRadialIntentCore({
    ...input,
    baseMovement: baseDirection
  });
  const prediction = predictNextFireWindowCore(input, options);
  const activeOpponent = input.activeOpponent !== false;
  const relativeMotion = distanceAwareRelativeMotionCore(input.self, target);
  const recentDirectedThreat = input.recentDirectedThreat === true
    || prediction.sampleCount >= 2
    || reactionSlack.threateningBulletCount > 0;
  const recedingWithoutThreat = relativeMotion.radialSpeedCmPerTick >= Number(options.recedingBlockSpeedCmPerTick ?? 10)
    && !recentDirectedThreat;
  const tangentialWithoutThreat = relativeMotion.lateralSpeedCmPerTick >= Number(options.tangentialBlockSpeedCmPerTick ?? 10)
    && Math.abs(relativeMotion.radialSpeedCmPerTick) <= Number(options.tangentialRadialToleranceCmPerTick ?? 5)
    && !recentDirectedThreat;
  const staleRealtimeState = reactionSlack.observationAgeMs !== null
    && reactionSlack.observationAgeMs !== undefined
    && Number(reactionSlack.observationAgeMs) > Number(options.maximumRealtimeStateAgeMs ?? 500);
  const blockedReason = input.exitActive
    ? 'leave-active'
    : input.lowStamina
      ? 'stamina-insufficient'
      : staleRealtimeState
        ? 'stale-realtime-state'
        : (input.boundaryRisk || input.collisionRisk)
          ? (input.collisionRisk ? 'collision-risk' : 'boundary-risk')
          : (!activeOpponent
              ? 'inactive-opponent'
              : (recedingWithoutThreat
                  ? 'receding-without-threat-evidence'
                  : (tangentialWithoutThreat ? 'tangential-without-threat-evidence' : '')));
  let selectedDirection = null;
  let applied = false;
  let closeSubmode = null;
  let preDodgeTrigger = false;
  let preDodgeReason = blockedReason;
  let randomChoice = null;
  let randomHoldUntil = null;
  let suppressCurrentShotDodge = false;
  let latch = modeDecision.state?.latch || null;
  const currentThreat = reactionSlack.currentShotAvoidability !== 'safe'
    || reactionSlack.threateningBulletCount > 0;
  let currentOrPendingEquivalentSafe = Boolean(
    reactionSlack.pendingDirectionSafe || reactionSlack.currentDirectionSafe
  );
  const actualThreatField = input.dodge?.threatField || input.threatField;
  const closeEnvelopeWithoutCadence = Boolean(
    mode === 'close-proactive'
      && !blockedReason
      && activeOpponent
      && reactionSlack.prospectiveReactionSlackMs !== null
      && reactionSlack.prospectiveReactionSlackMs <= 0
      && prediction.sampleCount < 2
  );
  const prospectiveThreat = actualThreatField?.length
    ? null
    : (buildProspectiveDodgeThreatFieldCore(input, prediction, options)
        || (mode === 'close-proactive' && !blockedReason && activeOpponent
          ? buildProspectiveDodgeThreatFieldCore(input, prediction, {
              ...options,
              allowUncertainFireWindow: true,
              allowUnscheduledCloseEnvelope: true
            })
          : null));
  const candidateRows = distanceAwareCandidateRowsCore({
    ...input,
    self: input.self,
    threatField: actualThreatField?.length
      ? actualThreatField
      : prospectiveThreat?.threatField
  }, radialIntent, options);
  if (prospectiveThreat?.threatField?.length) {
    const currentProspectiveThreat = directionThreatCore(prospectiveThreat.threatField, currentDirection);
    const pendingProspectiveThreat = pendingDirection
      ? directionThreatCore(prospectiveThreat.threatField, pendingDirection)
      : null;
    currentOrPendingEquivalentSafe = Boolean(
      movementThreatSafeCore(currentProspectiveThreat, options.minimumCpaCm ?? 200)
        || (pendingProspectiveThreat
          && movementThreatSafeCore(pendingProspectiveThreat, options.minimumCpaCm ?? 200))
    );
  }
  const targetId = String(input.targetId ?? target.user_id ?? target.entity_id ?? '');
  const engagementId = String(input.engagementId ?? targetId);
  const previousLatch = modeDecision.state?.latch;
  const previousLatchMatches = Boolean(previousLatch
    && String(previousLatch.targetId || '') === targetId
    && String(previousLatch.engagementId || '') === engagementId);
  const previousLatchDirection = previousLatchMatches
    ? normalizedDirection(previousLatch.direction)
    : null;
  const previousLatchThreat = previousLatchDirection
    ? directionThreatCore(input.dodge?.threatField || input.threatField, previousLatchDirection)
    : null;
  const previousLatchSafe = Boolean(previousLatchMatches
    && sameRadialIntentCore(previousLatchDirection, radialIntent, { minimumDot: 0 })
    && (!previousLatchThreat || movementThreatSafeCore(previousLatchThreat, options.minimumCpaCm ?? 200)));
  const previousLatchActive = Boolean(previousLatchSafe
    && Number(previousLatch.holdUntilMs || 0) > nowMs
    && !input.newThreatUrgent
    && !input.boundaryRisk
    && !blockedReason
    && activeOpponent);
  const directionStabilityWindowMs = Math.max(
    Number(options.directionStabilityWindowMs ?? 500),
    Number(reactionSlack.commandBudgetMs || 0)
  );
  const lastAppliedDirection = modeDecision.state?.lastAppliedDirection
    ? normalizedDirection(modeDecision.state.lastAppliedDirection)
    : null;
  const lastAppliedAtMs = finiteMovementNumber(modeDecision.state?.lastAppliedAtMs);
  const recentStableDirection = lastAppliedDirection
    && lastAppliedAtMs !== null
    && nowMs - lastAppliedAtMs <= directionStabilityWindowMs
    ? lastAppliedDirection
    : null;
  let directionStabilityHeld = false;
  let invalidatePreviousLatch = false;
  if (mode === 'close-proactive' && !blockedReason && activeOpponent) {
    if (reactionSlack.currentShotAvoidability === 'unavoidable' && currentThreat) {
      // The current shot has no safe command sequence left. Do not reverse
      // into an unproven direction; preserve the existing movement and wait
      // for the next volley to become actionable.
      preDodgeReason = 'unavoidable-current-shot';
      selectedDirection = normalizedDirection(
        input.unavoidableHoldDirection
          || pendingDirection
          || currentDirection
      );
      suppressCurrentShotDodge = true;
      latch = null;
      invalidatePreviousLatch = true;
    } else if (previousLatchActive) {
      closeSubmode = DISTANCE_AWARE_DODGE_SUBMODES.has(String(previousLatch.submode))
        ? String(previousLatch.submode)
        : null;
      randomChoice = previousLatch.randomChoice || null;
      randomHoldUntil = Number(previousLatch.holdUntilMs);
      if (currentOrPendingEquivalentSafe) {
        // Existing motion already provides the same safety result. Keep the
        // latch in state for diagnostics, but do not create another command.
        preDodgeReason = 'existing-command-equivalent-safe';
        preDodgeTrigger = false;
        selectedDirection = null;
      } else {
        preDodgeTrigger = true;
        selectedDirection = previousLatchDirection;
        preDodgeReason = 'latched-pre-dodge';
      }
    } else if (!currentThreat && !currentOrPendingEquivalentSafe) {
      preDodgeTrigger = true;
      const predictiveCandidates = candidateRows.map(candidate => ({
        ...candidate,
        score: finiteMovementNumber(candidate.predictedCpaCm ?? candidate.minCpaCm ?? candidate.score, 0)
      }));
      const bestPredictive = prediction.predictiveEligible
        ? predictiveCandidates.slice().sort((left, right) => Number(right.score || 0) - Number(left.score || 0))[0]
        : null;
      if (bestPredictive && Number(bestPredictive.score || 0) > Number(reactionSlack.nextVolleyMinCpaCm || 0)) {
        closeSubmode = 'predictive';
        selectedDirection = bestPredictive;
        preDodgeReason = 'predicted-next-fire-window';
      } else if (candidateRows.length >= 2) {
        closeSubmode = 'stochastic';
        const selection = selectStochasticDodgeCandidateCore(candidateRows, options);
        selectedDirection = selection.selected;
        randomChoice = selection.randomChoice;
        const holdMs = Math.max(
          Number(options.latchMinimumHoldMs ?? 250),
          Number(reactionSlack.commandBudgetMs || 0)
        );
        randomHoldUntil = nowMs + holdMs;
        preDodgeReason = prediction.predictiveEligible
          ? 'prediction-candidate-not-better'
          : 'insufficient-cadence-evidence';
      } else {
        preDodgeReason = 'no-safe-lateral-candidate';
      }
    } else {
      preDodgeReason = 'existing-command-equivalent-safe';
    }
  }
  if (!suppressCurrentShotDodge && selectedDirection && (selectedDirection.dx || selectedDirection.dy)) {
    const selectedThreatField = prospectiveThreat?.threatField?.length
      ? prospectiveThreat.threatField
      : (actualThreatField || []);
    const stabilityDirection = previousLatchDirection || recentStableDirection;
    const stabilityThreat = stabilityDirection
      ? directionThreatCore(selectedThreatField, stabilityDirection)
      : null;
    const selectedThreat = directionThreatCore(selectedThreatField, selectedDirection);
    const stableDirectionSafe = Boolean(stabilityThreat
      && stabilityThreat.directHits === 0
      && stabilityThreat.unavoidableHits === 0
      && stabilityThreat.scheduleRobust !== false);
    const selectedDirectionImprovesCpa = Boolean(
      selectedThreat
        && Number.isFinite(Number(selectedThreat.minCPA))
        && Number.isFinite(Number(stabilityThreat?.minCPA))
        && Number(selectedThreat.minCPA) - Number(stabilityThreat.minCPA) >= Math.max(
          Number(options.directionStabilityMinimumCpaGainCm ?? 90),
          Number(options.minimumCpaCm ?? 200) * 0.5
        )
    );
    if (mode === 'close-proactive'
      && stabilityDirection
      && directionOppositeCore(selectedDirection, stabilityDirection)
      && stableDirectionSafe
      && !selectedDirectionImprovesCpa
      && !currentThreat
      && !input.newThreatUrgent
      && !input.boundaryRisk
      && !input.collisionRisk) {
      selectedDirection = stabilityDirection;
      closeSubmode = previousLatch?.submode || closeSubmode;
      randomChoice = previousLatch?.randomChoice || randomChoice;
      randomHoldUntil = Math.max(
        Number(randomHoldUntil || 0),
        nowMs + directionStabilityWindowMs
      );
      preDodgeTrigger = false;
      preDodgeReason = 'direction-stability-hold';
      directionStabilityHeld = true;
    }
    applied = true;
    const nextLatch = {
      targetId,
      engagementId,
      direction: normalizedDirection(selectedDirection),
      submode: closeSubmode,
      randomChoice,
      holdUntilMs: randomHoldUntil
        ?? (nowMs + Math.max(
          Number(options.latchMinimumHoldMs ?? 250),
          Number(reactionSlack.commandBudgetMs || 0)
        )),
      createdAtMs: previousLatch?.createdAtMs || nowMs
    };
    latch = nextLatch;
    if (!sameRadialIntentCore(selectedDirection, radialIntent, { minimumDot: 0 })) {
      applied = false;
      selectedDirection = null;
      preDodgeReason = 'radial-intent-preserved';
      latch = null;
    }
  }
  const nextState = {
    ...modeDecision.state,
    latch: applied
      ? latch
      : (previousLatchActive && !invalidatePreviousLatch ? previousLatch : null),
    updatedAtMs: nowMs,
    currentShotAvoidability: reactionSlack.currentShotAvoidability,
    lastPreDodgeReason: preDodgeReason,
    lastAppliedDirection: selectedDirection && (selectedDirection.dx || selectedDirection.dy)
      ? normalizedDirection(selectedDirection)
      : (modeDecision.state?.lastAppliedDirection || null),
    lastAppliedAtMs: selectedDirection && (selectedDirection.dx || selectedDirection.dy)
      ? (directionStabilityHeld
          ? finiteMovementNumber(modeDecision.state?.lastAppliedAtMs, nowMs)
          : nowMs)
      : finiteMovementNumber(modeDecision.state?.lastAppliedAtMs)
  };
  const selectedThreatField = prospectiveThreat?.threatField?.length
    ? prospectiveThreat.threatField
    : (actualThreatField || []);
  const selectedThreat = selectedDirection
    ? directionThreatCore(selectedThreatField, selectedDirection)
    : null;
  const baselineThreat = directionThreatCore(selectedThreatField, baseDirection);
  return {
    applied,
    direction: selectedDirection || baseDirection,
    suppressCurrentShotDodge,
    mode,
    closeSubmode: closeSubmode || null,
    reactionSlackMs: reactionSlack.reactionSlackMs,
    prospectiveReactionSlackMs: reactionSlack.prospectiveReactionSlackMs,
    currentShotAvoidability: reactionSlack.currentShotAvoidability,
    pendingCommandSchedule: reactionSlack.pendingCommandSchedule,
    nextVolleyMinCpaCm: prospectiveThreat
      ? finiteMovementNumber(selectedThreat?.worstCaseCpaCm ?? selectedThreat?.minCPA)
      : reactionSlack.nextVolleyMinCpaCm,
    nextVolleyDirectHits: prospectiveThreat ? Number(selectedThreat?.directHits || 0) : null,
    baselineNextVolleyMinCpaCm: prospectiveThreat
      ? finiteMovementNumber(baselineThreat?.worstCaseCpaCm ?? baselineThreat?.minCPA)
      : null,
    baselineNextVolleyDirectHits: prospectiveThreat ? Number(baselineThreat?.directHits || 0) : null,
    preDodgeTrigger,
    preDodgeReason,
    predictedFireWindowTicks: prediction.predictedFireWindowTicks,
    predictedLaneCount: prediction.predictedLaneCount,
    predictedThreatSource: prospectiveThreat?.source || '',
    prospectiveBullet: prospectiveThreat?.virtualBullet || null,
    predictionConfidence: prediction.confidence,
    relativeMotion,
    randomChoice,
    randomHoldUntil,
    directionStabilityHeld,
    directionStabilityWindowMs,
    baseDistanceBand: String(input.baseDistanceBand || 'hold-spacing'),
    baseRadialIntent: {
      ...radialIntent,
      source: radialIntent.source || 'base-movement'
    },
    radialOverrideReason: applied ? 'distance-aware-lateral-dodge' : '',
    latchAgeMs: latch
      ? Math.max(0, nowMs - Number(latch.createdAtMs || nowMs))
      : 0,
    state: nextState,
    blockedReason: preDodgeReason
  };
}

function contactEntryRiskCore(self, target, previous = null, options = {}) {
  const attackRange = Math.max(0, Number(options.attackRange ?? options.combatAttackRange ?? COMBAT_CONSTANTS.ATTACK_RANGE));
  const guardBuffer = Math.max(0, Number(options.guardBufferCm ?? options.combatContactEntryGuardBufferCm ?? COMBAT_CONSTANTS.DODGE_RANGE_BUFFER));
  const guardRange = attackRange + guardBuffer;
  const distance = Number(target?.distance ?? Math.hypot(
    Number(target?.x || 0) - Number(self?.x || 0),
    Number(target?.y || 0) - Number(self?.y || 0)
  ));
  const selfVx = Number(self?.vx || 0);
  const selfVy = Number(self?.vy || 0);
  const targetVx = Number(target?.vx || 0);
  const targetVy = Number(target?.vy || 0);
  const selfSpeed = Math.hypot(selfVx, selfVy);
  const relativeVx = targetVx - selfVx;
  const relativeVy = targetVy - selfVy;
  const relativeSpeed = Math.hypot(relativeVx, relativeVy);
  const dx = Number(target?.x || 0) - Number(self?.x || 0);
  const dy = Number(target?.y || 0) - Number(self?.y || 0);
  const geometryDistance = Math.max(1, Math.hypot(dx, dy));
  const radialSpeed = (dx * relativeVx + dy * relativeVy) / geometryDistance;
  const closingSpeed = Math.max(0, -radialSpeed);
  const closingAlignment = relativeSpeed > 0 ? Math.max(0, Math.min(1, closingSpeed / relativeSpeed)) : 0;
  const firing = Boolean(target?.firing || target?.is_firing || target?.shooting);
  const realBullet = Boolean(options.realBullet);
  const active = Boolean(target?.active || firing || realBullet);
  const selfStationarySpeed = Math.max(0, Number(options.selfStationarySpeed ?? 5));
  const selfStationary = selfSpeed < selfStationarySpeed;
  const minimumClosingSpeed = Math.max(0, Number(options.minimumClosingSpeed ?? 20));
  const minimumClosingAlignment = Math.max(0, Math.min(1, Number(options.minimumClosingAlignment ?? 0.75)));
  const directApproach = Boolean(
    active
      && selfStationary
      && closingSpeed >= minimumClosingSpeed
      && closingAlignment >= minimumClosingAlignment
  );
  const strongEvidence = realBullet || firing;
  const selfHp = Number(self?.hp ?? self?.knownHp ?? 100);
  const selfMaxHp = Number(self?.max_hp ?? self?.maxHp ?? 100);
  const recoveringSelf = options.recoveringSelf === true
    || (Number.isFinite(selfHp) && Number.isFinite(selfMaxHp) && selfHp < selfMaxHp);
  const trustedWithoutFire = Boolean(target?.easyKillThreatExempt && !strongEvidence && options.recentDanger !== true);
  const stamina5s = Number(self?.stamina_5s_remaining_milli ?? self?.stamina5sRemainingMilli);
  const minimumStamina5s = Math.max(0, Number(options.minimumStamina5s ?? COMBAT_CONSTANTS.SHOOT_DODGE_RESERVE_MS + 1000));
  const staminaBlocked = Number.isFinite(stamina5s) && stamina5s < minimumStamina5s && !realBullet;
  const armed = options.armed !== false;
  const withinGuard = Number.isFinite(distance) && distance <= guardRange;
  const previousDistance = Number(previous?.distance);
  const newlyEnteredGuard = !Number.isFinite(previousDistance) || previousDistance > guardRange;
  let blockedReason = '';
  if (!Number.isFinite(distance)) blockedReason = 'missing-distance';
  else if (!withinGuard) blockedReason = 'outside-contact-guard';
  else if (!active) blockedReason = 'target-not-active';
  else if (recoveringSelf && !strongEvidence) blockedReason = 'recovery-policy-owned';
  else if (trustedWithoutFire) blockedReason = 'trusted-target-no-fire';
  else if (!strongEvidence && !directApproach) blockedReason = selfStationary
    ? 'no-direct-closing-evidence'
    : 'self-already-moving';
  else if (staminaBlocked) blockedReason = 'stamina-insufficient';
  else if (!armed && !strongEvidence) blockedReason = 'contact-not-rearmed';
  return {
    eligible: !blockedReason,
    blockedReason,
    trigger: realBullet
      ? 'target-real-bullet'
      : (firing ? 'target-firing' : 'direct-closing-entry'),
    attackRange: Math.round(attackRange),
    guardBuffer: Math.round(guardBuffer),
    guardRange: Math.round(guardRange),
    distance: Number.isFinite(distance) ? Math.round(distance) : null,
    previousDistance: Number.isFinite(previousDistance) ? Math.round(previousDistance) : null,
    newlyEnteredGuard,
    inRange: Number.isFinite(distance) && distance <= attackRange,
    withinGuard,
    active,
    firing,
    realBullet,
    recoveringSelf,
    directApproach,
    trustedWithoutFire,
    selfStationary,
    selfSpeed: Math.round(selfSpeed * 100) / 100,
    relativeSpeed: Math.round(relativeSpeed * 100) / 100,
    closingSpeed: Math.round(closingSpeed * 100) / 100,
    closingAlignment: Math.round(closingAlignment * 1000) / 1000,
    stamina5s: Number.isFinite(stamina5s) ? stamina5s : null,
    minimumStamina5s,
    armed
  };
}

function contactEntrySyntheticBulletCore(self, target, options = {}) {
  const startX = Number(target?.x);
  const startY = Number(target?.y);
  const selfX = Number(self?.x);
  const selfY = Number(self?.y);
  if (![startX, startY, selfX, selfY].every(Number.isFinite)) return null;
  const dx = selfX - startX;
  const dy = selfY - startY;
  const distance = Math.hypot(dx, dy);
  if (!(distance > 0)) return null;
  const speed = Math.max(1, Number(options.bulletSpeedCmPerTick ?? COMBAT_CONSTANTS.BULLET_SPEED_CM_PER_TICK));
  const tickMs = Math.max(1, Number(options.tickMs ?? 50));
  const flightTicks = distance / speed;
  return {
    incoming: true,
    synthetic: true,
    contactEntry: true,
    ownerId: target?.user_id ?? target?.userId ?? target?.id ?? null,
    x: startX,
    y: startY,
    direction: { dx: dx / distance, dy: dy / distance },
    speed,
    distance,
    cpa: 0,
    timeToImpact: flightTicks * tickMs,
    remainingTicks: flightTicks
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

function safeRetreatInterceptCandidateCore(self, target, context = {}) {
  const behavior = context.opponentBehavior && typeof context.opponentBehavior === 'object'
    ? context.opponentBehavior
    : {};
  const mode = String(behavior.mode || '');
  const confidence = Number(behavior.confidence || 0);
  const base = {
    name: 'safe-retreat-intercept',
    shadow: true,
    enabled: context.enabled === true,
    applied: false,
    eligible: false,
    direction: { dx: 0, dy: 0 },
    interceptPoint: null,
    approachCm: null,
    boundaryMarginCm: null,
    reason: ''
  };
  if (!self || !target) return { ...base, reason: 'missing-realtime-subject' };
  if (String(target.authority || 'realtime') !== 'realtime') {
    return { ...base, reason: 'target-not-realtime-visible' };
  }
  if (target.active !== true) return { ...base, reason: 'target-not-active' };
  if (mode !== 'retreat-kite' || confidence < Number(context.minimumConfidence ?? 0.65)) {
    return { ...base, reason: 'retreat-kite-not-confirmed' };
  }
  if (['zigzag-strafe', 'charge-close'].includes(String(behavior.mode || ''))
    || behavior.movementIntent === 'zigzag'
    || behavior.movementIntent === 'charge') {
    return { ...base, reason: 'high-entropy-or-closing-behavior' };
  }
  if (Number(context.recentIncomingDamage || 0) > 0 || context.selfHpLossObserved === true) {
    return { ...base, reason: 'recent-self-damage' };
  }
  if (Number(context.otherAttackerCount || 0) > 0) {
    return { ...base, reason: 'multiple-attackers' };
  }

  const threatField = Array.isArray(context.threatField) ? context.threatField : [];
  const minimumCpaCm = Math.max(1, Number(context.minimumCpaCm ?? 200));
  const danger = threatField.some(item => Number(item?.directHits || 0) > 0
    || Number(item?.unavoidableHits || 0) > 0);
  if (danger) return { ...base, reason: 'collision-pressure-present' };
  const safeDirections = threatField.filter(item => (
    Number(item?.directHits || 0) === 0
      && Number(item?.unavoidableHits || 0) === 0
      && Number(item?.worstCaseCpaCm ?? item?.minCPA ?? 0) >= minimumCpaCm
  ));
  if (threatField.length > 0 && safeDirections.length === 0) {
    return { ...base, reason: 'no-zero-risk-dodge-direction' };
  }
  const boundary = context.boundary && typeof context.boundary === 'object'
    ? context.boundary
    : null;
  const boundaryMarginRequired = Math.max(0, Number(context.boundaryMarginCm ?? 1000));
  const inBoundary = point => {
    if (!boundary) return true;
    const minX = Number(boundary.minX);
    const maxX = Number(boundary.maxX);
    const minY = Number(boundary.minY);
    const maxY = Number(boundary.maxY);
    if (![minX, maxX, minY, maxY].every(Number.isFinite)) return false;
    return point.x >= minX + boundaryMarginRequired
      && point.x <= maxX - boundaryMarginRequired
      && point.y >= minY + boundaryMarginRequired
      && point.y <= maxY - boundaryMarginRequired;
  };
  const selfX = Number(self.x);
  const selfY = Number(self.y);
  const targetX = Number(target.x);
  const targetY = Number(target.y);
  if (![selfX, selfY, targetX, targetY].every(Number.isFinite)) {
    return { ...base, reason: 'missing-intercept-geometry' };
  }
  const selfSpeed = Math.max(1, Number(context.selfSpeedPerTick ?? 50));
  const targetVx = Number(target.vx || 0);
  const targetVy = Number(target.vy || 0);
  const relativeX = targetX - selfX;
  const relativeY = targetY - selfY;
  const a = targetVx * targetVx + targetVy * targetVy - selfSpeed * selfSpeed;
  const b = 2 * (relativeX * targetVx + relativeY * targetVy);
  const c = relativeX * relativeX + relativeY * relativeY;
  const roots = [];
  if (Math.abs(a) < 1e-6) {
    if (Math.abs(b) > 1e-6) roots.push(-c / b);
  } else {
    const discriminant = b * b - 4 * a * c;
    if (discriminant >= 0) {
      const root = Math.sqrt(discriminant);
      roots.push((-b - root) / (2 * a), (-b + root) / (2 * a));
    }
  }
  const maxInterceptTicks = Math.max(1, Number(context.maxInterceptTicks ?? 60));
  const interceptTicks = roots
    .filter(value => Number.isFinite(value) && value > 0 && value <= maxInterceptTicks)
    .sort((left, right) => left - right)[0]
    ?? Math.min(maxInterceptTicks, Math.max(1, Math.hypot(relativeX, relativeY) / selfSpeed));
  const interceptPoint = {
    x: targetX + targetVx * interceptTicks,
    y: targetY + targetVy * interceptTicks
  };
  if (!inBoundary(interceptPoint)) return { ...base, reason: 'intercept-boundary-margin-insufficient' };
  const direction = normalizedDirection({
    dx: interceptPoint.x - selfX,
    dy: interceptPoint.y - selfY
  });
  const candidateThreat = threatField.find(item => (
    Number(item?.dx) === direction.dx && Number(item?.dy) === direction.dy
  )) || null;
  if (candidateThreat && (
    Number(candidateThreat.directHits || 0) > 0
      || Number(candidateThreat.unavoidableHits || 0) > 0
      || Number(candidateThreat.worstCaseCpaCm ?? candidateThreat.minCPA ?? 0) < minimumCpaCm
  )) {
    return { ...base, direction, interceptPoint, reason: 'intercept-direction-not-collision-safe' };
  }
  const currentDistance = Math.hypot(relativeX, relativeY);
  const nextSelf = {
    x: selfX + direction.dx * selfSpeed,
    y: selfY + direction.dy * selfSpeed
  };
  const nextTarget = {
    x: targetX + targetVx,
    y: targetY + targetVy
  };
  const nextDistance = Math.hypot(nextTarget.x - nextSelf.x, nextTarget.y - nextSelf.y);
  const approachCm = currentDistance - nextDistance;
  if (!(approachCm > Number(context.minimumApproachCm ?? 10))) {
    return { ...base, direction, interceptPoint, approachCm, reason: 'intercept-no-positive-approach' };
  }
  const boundaryMarginCm = boundary
    ? Math.min(
        interceptPoint.x - Number(boundary.minX),
        Number(boundary.maxX) - interceptPoint.x,
        interceptPoint.y - Number(boundary.minY),
        Number(boundary.maxY) - interceptPoint.y
      )
    : null;
  return {
    ...base,
    eligible: true,
    direction,
    interceptPoint: {
      x: Math.round(interceptPoint.x),
      y: Math.round(interceptPoint.y)
    },
    interceptTicks: Number(interceptTicks.toFixed(2)),
    approachCm: Number(approachCm.toFixed(2)),
    boundaryMarginCm: boundaryMarginCm === null ? null : Number(boundaryMarginCm.toFixed(2)),
    candidateThreat: candidateThreat ? {
      directHits: Number(candidateThreat.directHits || 0),
      unavoidableHits: Number(candidateThreat.unavoidableHits || 0),
      minCPA: Number.isFinite(Number(candidateThreat.minCPA)) ? Number(candidateThreat.minCPA) : null,
      worstCaseCpaCm: Number.isFinite(Number(candidateThreat.worstCaseCpaCm))
        ? Number(candidateThreat.worstCaseCpaCm)
        : null
    } : null,
    reason: 'safe-retreat-intercept-shadow'
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
    if (modifiers.includes('dodge')) {
      // The threat-field direction already includes target geometry. Do not turn
      // a safe lateral/reversal dodge into a predictable radial retreat.
      modifiers.push('back-away-deferred');
    } else {
      const awayDx = self.x > target.x ? 1 : (self.x < target.x ? -1 : 0);
      const awayDy = self.y > target.y ? 1 : (self.y < target.y ? -1 : 0);
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
  directionThreatCore,
  classifyDistanceAwareDodgeModeCore,
  createSeededRandomCore,
  currentProspectiveReactionSlackCore,
  deriveCombatReactionBudgetCore,
  directionOppositeCore,
  distanceAwareRadialIntentCore,
  predictNextFireWindowCore,
  resolveDistanceAwareDodgeCore,
  sameRadialIntentCore,
  selectStochasticDodgeCandidateCore,
  movementDirectionKeyCore,
  movementSettlementWindowTicksCore,
  movementThreatSafeCore,
  safestStrategicProgressDirectionCore,
  strategicDirectionProgressCore,
  selectCombatMovementArbitrationCore,
  stabilizeCombatMovementDirectionCore,
  shouldBackAwayFromTarget,
  rewardFinishBackAwaySuppressionPolicy,
  calculateDodgeDirection,
  contactEntryRiskCore,
  contactEntrySyntheticBulletCore,
  pickSafeClosingDodgeCore,
  safeRetreatInterceptCandidateCore,
  applyCombatMovementModifiers,
  isRecoverableOutOfRangeTarget
};
