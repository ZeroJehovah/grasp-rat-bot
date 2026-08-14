'use strict';

const {
  calculateCombatTargetPriority,
  applyCombatTargetSwitchHysteresisCore,
  combatTargetIncomingThreatEvidenceCore,
  combatTargetThreatensSelf,
  combatEscapeDecisionCore,
  combatTargetId,
  defensiveTargetOverridesEngagedCore,
  incomingBulletHasCollisionRiskCore,
  isCombatEligibleThreat,
  isInvulnerableEntity,
  pickEngagedCombatTargetCore,
  recentAfkAttackCommitmentCore,
  selectBestCombatTarget
} = require('../../strategy/combat-target-selection');
const {
  applyCombatMovementModifiers,
  calculateCombatSpacing,
  calculateDodgeDirection,
  currentProspectiveReactionSlackCore,
  contactEntryRiskCore,
  contactEntrySyntheticBulletCore,
  deriveCombatReactionBudgetCore,
  resolveDistanceAwareDodgeCore,
  selectCombatMovementArbitrationCore,
  safeRetreatInterceptCandidateCore,
  stabilizeCombatMovementDirectionCore,
  shouldBackAwayFromTarget
} = require('../../strategy/combat-movement');
const {
  profitEscortContinuityMatchesCore,
  updateProfitEscortContinuityCore,
  selectProfitEscortDirectionCore
} = require('../../strategy/profit-escort');
const {
  checkLowConfidenceThrottle,
  classifyFireRiskCore,
  determineCombatFireState,
  evaluateCombatFireBudgetCore,
  evaluateHighEntropyFireGateCore,
  resolveEstablishedCombatFireAuthorizationCore,
  updateCloseBandReserveCore,
  updateCombatProbePhaseCore
} = require('../../strategy/combat-fire-discipline');
const { COMBAT_CONSTANTS } = require('../../strategy/combat-constants');
const { previousActionWasRecoveryCore } = require('../../strategy/recovery-contact-guard');
const {
  evaluateCombatExchangeStopLossCore,
  evaluateConfirmedCombatHpExitCore,
  evaluateCombatHpExitCore
} = require('../../strategy/combat-exit');
const {
  evaluateAimPointReachabilityCore,
  opponentMotionProfileCore,
  quadraticInterceptCore,
  solveInterceptAtCreationCore
} = require('../../strategy/combat-aim');
const {
  buildTrajectoryCoveragePlanCore,
  arrivalOccupancyModelCore,
  dynamicBehaviorTrajectoryEligibilityCore,
  evaluateTrajectoryAimCore,
  movingTargetStopRouteRejectedCore,
  normalizeTrajectoryCoverageMode,
  normalizedDynamicRouteSelectionMode,
  selectDynamicRouteCandidateCore,
  selectRobustTrajectoryAimCore,
  shouldApplyTrajectoryCoverageCore,
  trajectoryCoverageRouteReliabilityCore
} = require('../../strategy/combat-shot-coverage');
const {
  behaviorLearningBaseKey,
  behaviorLearningKey,
  movementDirectionState,
  movementDirectionVector,
  movementRouteContextKeyCore,
  opponentResponsePolicyCore,
  updateOpponentBehaviorStateCore
} = require('../../strategy/opponent-behavior');
const {
  updateCombatResponsePolicyShadowCore
} = require('../../strategy/combat-response-policy-shadow');
const {
  createCombatObservationBuffer,
  observeCombatFrameCore,
  completeCombatHpLossAttributionCore
} = require('../../strategy/combat-hp-loss-attribution');
const {
  targetIsWhitelisted,
  targetWhitelistNameSet,
  targetWhitelistUserIdSet
} = require('../../shared/target-whitelist');
const {
  combatBallisticCloseCore,
  combatPressurePhaseCore,
  combatPressureStrafeCore,
  combatPressureTargetRangeCore
} = require('../../strategy/combat-pressure');
const {
  dynamicWhitelistDistanceGuardBlocksCombatCore
} = require('../../strategy/dynamic-whitelist-safety');
const {
  applyEvasiveAimStrategyCore,
  createEvasiveAimModel,
  predictEvasiveAimAngles,
  updateEvasiveAimExperimentCore
} = require('../../strategy/evasive-aim-experiment');
const EVASIVE_AIM_MODEL = createEvasiveAimModel(require('../../strategy/evasive-aim-model.json'));

const DEFAULT_STAMINA_FULL_RATIO = 0.98;
const DEFAULT_COMBAT_TARGET_FRAME_GAP_HOLD_MS = 250;
const MISSING_OPTION_VALUE = Symbol('browserless-combat-missing-option-value');
const NORMALIZED_COMBAT_INPUT = Symbol('browserless-normalized-combat-input');
const NORMALIZED_COMBAT_BULLETS = Symbol('browserless-normalized-combat-bullets');
const OPTION_OVERRIDE_STACKS = new WeakMap();
const COMBAT_LEARNING_HIT_RATE_CACHES = new WeakMap();

function cloneJson(value) {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

function appendUniqueStringsBounded(previous = [], additions = [], limit = 256) {
  const base = Array.isArray(previous) ? previous : [];
  let output = null;
  for (const addition of additions || []) {
    const value = String(addition ?? '');
    if (!value) continue;
    const source = output || base;
    let present = false;
    for (const existing of source) {
      if (String(existing) === value) {
        present = true;
        break;
      }
    }
    if (present) continue;
    if (!output) output = base.map(String);
    output.push(value);
  }
  if (!output) return base;
  if (output.length > limit) output.splice(0, output.length - limit);
  return output;
}

function combatBulletIdentity(bullet = {}) {
  return String(
    bullet?.bullet_id
      ?? bullet?.bulletId
      ?? `${bullet?.createdTick ?? ''}:${bullet?.startX ?? bullet?.x ?? ''}:${bullet?.startY ?? bullet?.y ?? ''}`
  );
}

function withOptionOverrides(options, overrides, callback) {
  if (!options || !Object.isExtensible(options)) {
    return callback({ ...(options || {}), ...(overrides || {}) });
  }
  let stack = OPTION_OVERRIDE_STACKS.get(options);
  if (!stack) {
    stack = { depth: 0, frames: [] };
    OPTION_OVERRIDE_STACKS.set(options, stack);
  }
  const depth = stack.depth;
  stack.depth += 1;
  const frame = stack.frames[depth] || (stack.frames[depth] = { keys: [], previous: [] });
  const keys = frame.keys;
  const previous = frame.previous;
  keys.length = 0;
  previous.length = 0;
  for (const key in (overrides || {})) {
    if (!Object.prototype.hasOwnProperty.call(overrides, key)) continue;
    keys.push(key);
    previous.push(Object.prototype.hasOwnProperty.call(options, key)
      ? options[key]
      : MISSING_OPTION_VALUE);
    options[key] = overrides[key];
  }
  if (!keys.length) {
    stack.depth -= 1;
    return callback(options);
  }
  try {
    return callback(options);
  } finally {
    for (let index = keys.length - 1; index >= 0; index -= 1) {
      const key = keys[index];
      if (previous[index] === MISSING_OPTION_VALUE) delete options[key];
      else options[key] = previous[index];
    }
    keys.length = 0;
    previous.length = 0;
    stack.depth -= 1;
  }
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function optionalNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  return numberOrNull(value);
}

function summarizeDodgeThreatField(threatField = []) {
  return (Array.isArray(threatField) ? threatField : []).slice(0, 10).map(item => ({
    dx: Number(item.dx || 0),
    dy: Number(item.dy || 0),
    directHits: Number(item.directHits || 0),
    avoidableHits: Number(item.avoidableHits || 0),
    unavoidableHits: Number(item.unavoidableHits || 0),
    minCPA: numberOrNull(item.minCPA),
    rawMinCPA: numberOrNull(item.rawMinCPA),
    worstCaseCpaCm: numberOrNull(item.worstCaseCpaCm),
    minTTI: numberOrNull(item.minTTI),
    reactionBudgetMs: optionalNumberOrNull(item.reactionBudgetMs),
    scheduleRobust: item.scheduleRobust !== false,
    robustClassification: String(item.robustClassification || ''),
    unconfirmedTransitionRisk: Boolean(item.unconfirmedTransitionRisk),
    trajectoryResidualCm: numberOrNull(item.trajectoryResidualCm),
    timingUncertaintyTicks: numberOrNull(item.timingUncertaintyTicks),
    targetDistanceChange: numberOrNull(item.targetDistanceChange),
    velocityScheduleConfidence: String(item.velocityScheduleConfidence || ''),
    velocityScheduleVariants: (item.velocityScheduleVariants || []).slice(0, 4).map(variant => ({
      name: String(variant.name || ''),
      transitionTicks: (variant.events || []).slice(0, 8).map(event => Number(event.effectiveAfterTicks || 0))
    })),
    dangerousBullets: (item.dangerousBullets || []).slice(0, 3).map(bullet => ({
      bulletId: String(bullet.bulletId || ''),
      ownerId: bullet.ownerId ?? null,
      timeToImpact: numberOrNull(bullet.timeToImpact),
      cpa: numberOrNull(bullet.cpa),
      worstCaseCpaCm: numberOrNull(bullet.worstCaseCpaCm),
      currentHoldCpaCm: numberOrNull(bullet.currentHoldCpaCm),
      expectedCpaCm: numberOrNull(bullet.expectedCpaCm),
      lateCpaCm: numberOrNull(bullet.lateCpaCm),
      predictedHit: Boolean(bullet.predictedHit),
      currentHoldHit: Boolean(bullet.currentHoldHit),
      expectedHit: Boolean(bullet.expectedHit),
      lateHit: Boolean(bullet.lateHit),
      avoidable: Boolean(bullet.avoidable),
      trajectoryResidualCm: numberOrNull(bullet.trajectoryResidualCm),
      trajectoryUncertaintyCm: numberOrNull(bullet.trajectoryUncertaintyCm)
    }))
  }));
}

function ensureCombatLearningState(stateful = {}) {
  if (!stateful || typeof stateful !== 'object' || Array.isArray(stateful)) stateful = {};
  if (!stateful.combatLearning || typeof stateful.combatLearning !== 'object' || Array.isArray(stateful.combatLearning)) {
    stateful.combatLearning = { hitRateByModeDistance: {}, modeMetrics: {}, lastTotalsByTarget: {}, recentShots: [] };
  }
  if (!stateful.combatLearning.hitRateByModeDistance || typeof stateful.combatLearning.hitRateByModeDistance !== 'object') {
    stateful.combatLearning.hitRateByModeDistance = {};
  }
  if (!Array.isArray(stateful.combatLearning.recentShots)) stateful.combatLearning.recentShots = [];
  if (!stateful.combatLearning.modeMetrics || typeof stateful.combatLearning.modeMetrics !== 'object') stateful.combatLearning.modeMetrics = {};
  if (!stateful.combatLearning.lastTotalsByTarget || typeof stateful.combatLearning.lastTotalsByTarget !== 'object') stateful.combatLearning.lastTotalsByTarget = {};
  if (!stateful.combatLearning.routeTransitions || typeof stateful.combatLearning.routeTransitions !== 'object') stateful.combatLearning.routeTransitions = {};
  if (!stateful.combatLearning.routeAimFeedback || typeof stateful.combatLearning.routeAimFeedback !== 'object') stateful.combatLearning.routeAimFeedback = {};
  if (!stateful.combatLearning.lastRouteObservationByTarget || typeof stateful.combatLearning.lastRouteObservationByTarget !== 'object') {
    stateful.combatLearning.lastRouteObservationByTarget = {};
  }
  return stateful.combatLearning;
}

function combatLearningHitRateCache(learning) {
  const cells = learning?.hitRateByModeDistance || {};
  let cache = COMBAT_LEARNING_HIT_RATE_CACHES.get(learning);
  if (!cache || cache.cells !== cells) {
    cache = { cells, cellCount: null, byPrefix: new Map() };
    COMBAT_LEARNING_HIT_RATE_CACHES.set(learning, cache);
  }
  return cache;
}

function invalidateCombatLearningHitRateCache(learning, cellAdded = false) {
  if (!learning || typeof learning !== 'object') return;
  const cache = combatLearningHitRateCache(learning);
  cache.byPrefix.clear();
  if (cellAdded && cache.cellCount !== null) cache.cellCount += 1;
}

function combatLearningCellCount(stateful = {}) {
  const learning = stateful?.combatLearning || stateful;
  if (!learning || typeof learning !== 'object' || Array.isArray(learning)) return 0;
  const cache = combatLearningHitRateCache(learning);
  if (cache.cellCount !== null) return cache.cellCount;
  let count = 0;
  for (const key in cache.cells) {
    if (Object.prototype.hasOwnProperty.call(cache.cells, key)) count += 1;
  }
  cache.cellCount = count;
  return count;
}

function routeFeedbackKey(contextKey, candidate) {
  return `${String(contextKey || '')}|candidate=${String(candidate || 'unknown')}`;
}

function normalizedOutcomeDistribution(cell, minimumSamples = 1) {
  const samples = Math.max(0, Number(cell?.samples || 0));
  if (samples < minimumSamples) return [];
  const outcomes = Object.entries(cell?.outcomes || {})
    .map(([state, count]) => ({ state, count: Math.max(0, Number(count || 0)) }))
    .filter(item => item.count > 0);
  const total = outcomes.reduce((sum, item) => sum + item.count, 0);
  if (!(total > 0)) return [];
  return outcomes
    .map(item => ({ ...item, probability: item.count / total, vector: movementDirectionVector(item.state) }))
    .sort((a, b) => b.probability - a.probability || a.state.localeCompare(b.state));
}

function recordRouteTransitionObservation(stateful, targetId, behavior, nowMs) {
  const learning = ensureCombatLearningState(stateful);
  const transition = behavior?.metrics?.movementTransitions || null;
  const phase = behavior?.metrics?.movementPhase || transition?.phase || null;
  const contextKey = transition?.contextKey
    || movementRouteContextKeyCore(behavior, behavior?.metrics?.lastDistance, phase || {});
  const directionState = String(phase?.currentDirection || transition?.currentState || 'stop');
  if (!contextKey || !directionState) return null;
  const key = String(targetId || '');
  const previous = learning.lastRouteObservationByTarget[key] || null;
  const observationIntervalMs = 400;
  if (previous && Number(nowMs) > Number(previous.at || 0)
    && (directionState !== previous.directionState || Number(nowMs) - Number(previous.at || 0) >= observationIntervalMs)) {
    const prior = learning.routeTransitions[previous.contextKey] || { samples: 0, outcomes: {}, updatedAt: 0 };
    const decay = 0.995;
    const outcomes = Object.fromEntries(Object.entries(prior.outcomes || {})
      .map(([state, count]) => [state, Math.max(0, Number(count || 0)) * decay]));
    outcomes[directionState] = Math.min(200, Number(outcomes[directionState] || 0) + 1);
    learning.routeTransitions[previous.contextKey] = {
      samples: Math.min(200, Number(prior.samples || 0) * decay + 1),
      outcomes,
      updatedAt: nowMs
    };
  }
  learning.lastRouteObservationByTarget[key] = {
    contextKey,
    directionState,
    at: nowMs
  };
  return {
    contextKey,
    directionState,
    learned: normalizedOutcomeDistribution(learning.routeTransitions[contextKey], 1)
  };
}

function finalizeCombatRouteFeedback(stateful, targetId, targetState, currentTick, nowMs, options = {}) {
  const tick = numberOrNull(currentTick);
  if (tick === null || !targetState) return 0;
  const learning = ensureCombatLearningState(stateful);
  const graceTicks = Math.max(2, Number(options.routeFeedbackGraceTicks ?? 12));
  const samples = Array.isArray(targetState.motionSamples) ? targetState.motionSamples : [];
  let finalized = 0;
  for (const shot of learning.recentShots) {
    if (shot.routeFeedbackFinalized || String(shot.targetId) !== String(targetId) || !shot.routeContextKey) continue;
    const arrivalTick = numberOrNull(shot.expectedArrivalTick);
    if (arrivalTick === null || tick < arrivalTick + graceTicks) continue;
    let arrivalSample = null;
    let arrivalTickDistance = Infinity;
    for (const sample of samples) {
      const sampleTick = numberOrNull(sample?.tick);
      if (sampleTick === null) continue;
      const tickDistance = Math.abs(sampleTick - arrivalTick);
      if (tickDistance >= arrivalTickDistance) continue;
      arrivalSample = sample;
      arrivalTickDistance = tickDistance;
    }
    const targetX = numberOrNull(arrivalSample?.x ?? targetState.x);
    const targetY = numberOrNull(arrivalSample?.y ?? targetState.y);
    const arrivalMissCm = targetX === null || targetY === null || shot.aimX === null || shot.aimY === null
      ? null
      : Math.hypot(Number(shot.aimX) - targetX, Number(shot.aimY) - targetY);
    const actualDirectionState = movementDirectionState(
      arrivalSample?.vx ?? targetState.motionSamples?.at(-1)?.vx,
      arrivalSample?.vy ?? targetState.motionSamples?.at(-1)?.vy,
      options.stationarySpeed ?? 5
    );
    const key = routeFeedbackKey(shot.routeContextKey, shot.routeCandidate || shot.hypothesis);
    const prior = learning.routeAimFeedback[key] || { samples: 0, hits: 0, missTotalCm: 0, updatedAt: 0 };
    const decay = 0.995;
    learning.routeAimFeedback[key] = {
      samples: Math.min(200, Number(prior.samples || 0) * decay + 1),
      hits: Math.min(200, Number(prior.hits || 0) * decay + Number(shot.credited === true)),
      missTotalCm: Math.min(200000, Number(prior.missTotalCm || 0) * decay + Math.max(0, Number(arrivalMissCm || 0))),
      updatedAt: nowMs
    };
    shot.routeFeedbackFinalized = true;
    shot.actualDirectionState = actualDirectionState;
    shot.arrivalMissCm = arrivalMissCm;
    shot.routeFeedbackAt = nowMs;
    finalized += 1;
  }
  return finalized;
}

function combatModeMetricsCell(stateful, key) {
  const learning = ensureCombatLearningState(stateful);
  if (!learning.modeMetrics[key]) {
    learning.modeMetrics[key] = {
      engagements: 0,
      shots: 0,
      hits: 0,
      targetDamage: 0,
      selfDamage: 0,
      shootingStamina: 0,
      chaseStamina: 0,
      firstDamageDelayTotalMs: 0,
      firstDamageSamples: 0,
      kills: 0,
      disengagements: 0,
      modeTransitions: 0,
      updatedAt: 0
    };
  }
  return learning.modeMetrics[key];
}

function learnedBehaviorHitRate(stateful, behavior, distance) {
  const learning = ensureCombatLearningState(stateful);
  const base = behaviorLearningBaseKey(behavior, distance);
  const prefix = `${base}|aim=`;
  const cache = combatLearningHitRateCache(learning);
  if (cache.byPrefix.has(prefix)) return cache.byPrefix.get(prefix);
  let cellCount = 0;
  let totalCellCount = 0;
  let shots = 0;
  let hits = 0;
  for (const key in learning.hitRateByModeDistance) {
    if (!Object.prototype.hasOwnProperty.call(learning.hitRateByModeDistance, key)) continue;
    totalCellCount += 1;
    if (!key.startsWith(prefix)) continue;
    const cell = learning.hitRateByModeDistance[key];
    cellCount += 1;
    shots += Number(cell?.shots || 0);
    hits += Number(cell?.hits || 0);
  }
  cache.cellCount = totalCellCount;
  const value = cellCount
    ? Math.max(0.03, Math.min(0.95, (hits + 1) / (shots + 4)))
    : null;
  cache.byPrefix.set(prefix, value);
  return value;
}

function ensureOpponentBehaviorMap(stateful = {}) {
  if (!stateful.opponentBehaviorStates || typeof stateful.opponentBehaviorStates !== 'object' || Array.isArray(stateful.opponentBehaviorStates)) {
    stateful.opponentBehaviorStates = {};
  }
  return stateful.opponentBehaviorStates;
}

function recordCombatShotLearning(stateful, target, combat = {}, options = {}) {
  if (!stateful || !target) return null;
  const id = String(combatTargetId(target) || '');
  if (!id) return null;
  const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  const behavior = combat.behavior || stateful.opponentBehaviorStates?.[id] || stateful.combatTarget?.opponentBehaviorState || null;
  const mode = String(behavior?.mode || 'mixed/unknown');
  const distance = Number(target.distance ?? combat.target?.distance ?? stateful.combatTarget?.distance);
  const hypothesis = String(options.hypothesis || combat.aim?.motionProbe?.hypothesis || 'center');
  const selectedRoute = combat.aim?.routeCoverage?.candidates?.find(candidate => candidate.hypothesis === combat.aim?.routeCoverage?.selected) || null;
  const routeContextKey = String(options.routeContextKey || combat.aim?.routeCoverage?.contextKey || '');
  const routeCandidate = String(options.routeCandidate || selectedRoute?.hypothesis || hypothesis);
  const key = behaviorLearningKey(behavior || mode, distance, hypothesis);
  const learning = ensureCombatLearningState(stateful);
  const cellAdded = !Object.prototype.hasOwnProperty.call(learning.hitRateByModeDistance, key);
  const previous = learning.hitRateByModeDistance[key] || { shots: 0, hits: 0 };
  const cell = {
    shots: Math.min(80, Number(previous.shots || 0) * 0.97 + 1),
    hits: Math.min(80, Number(previous.hits || 0) * 0.97),
    updatedAt: nowMs
  };
  learning.hitRateByModeDistance[key] = cell;
  invalidateCombatLearningHitRateCache(learning, cellAdded);
  const modeMetrics = combatModeMetricsCell(stateful, key);
  modeMetrics.shots += 1;
  modeMetrics.shootingStamina += Math.max(0, Number(options.shotStaminaCost ?? 500));
  modeMetrics.updatedAt = nowMs;
  const createdTick = numberOrNull(options.createdTick);
  const flightTicks = numberOrNull(options.flightTicks);
  learning.recentShots.push({
    at: nowMs,
    targetId: id,
    key,
    hypothesis,
    routeContextKey,
    routeCandidate,
    routeProbability: numberOrNull(options.routeProbability ?? selectedRoute?.probability),
    predictedDirectionState: String(options.predictedDirectionState || selectedRoute?.directionState || ''),
    aimConfidence: numberOrNull(options.aimConfidence ?? combat.aim?.confidence),
    expectedHitProbability: numberOrNull(options.expectedHitProbability ?? selectedRoute?.expectedHitProbability),
    credited: false,
    bulletId: options.bulletId ?? null,
    createdTick,
    flightTicks,
    expectedArrivalTick: createdTick !== null && flightTicks !== null ? createdTick + flightTicks : null,
    aimX: numberOrNull(options.aimX),
    aimY: numberOrNull(options.aimY),
    acceptedShotOrdinal: numberOrNull(options.acceptedShotOrdinal),
    coverageApplied: options.coverageApplied === true,
    coverageBaselineExpectedMissCm: numberOrNull(options.coverageBaselineExpectedMissCm),
    coverageSelectedExpectedMissCm: numberOrNull(options.coverageSelectedExpectedMissCm),
    coverageExpectedMissImprovementCm: numberOrNull(options.coverageExpectedMissImprovementCm),
    coverageImprovementQualified: options.coverageImprovementQualified === true,
    coverageSelectedTrajectory: String(options.coverageSelectedTrajectory || ''),
    coverageVariant: String(options.coverageVariant || ''),
    coverageSelectionMode: String(options.coverageSelectionMode || ''),
    coverageRouteSelectionMode: String(options.coverageRouteSelectionMode || ''),
    evasiveAimModelVersion: String(options.evasiveAimModelVersion || combat.aim?.evasiveAim?.modelVersion || ''),
    evasiveAimStrategy: String(options.evasiveAimStrategy || combat.aim?.evasiveAim?.strategy || ''),
    evasiveAimTriggerReason: String(options.evasiveAimTriggerReason || combat.aim?.evasiveAim?.triggerReason || ''),
    evasiveAimApplied: (options.evasiveAimApplied ?? combat.aim?.evasiveAim?.applied) === true,
    evasiveAimOffsetDeg: numberOrNull(options.evasiveAimOffsetDeg ?? combat.aim?.evasiveAim?.offsetDeg),
    evasiveAimBaselineAngleDeg: numberOrNull(options.evasiveAimBaselineAngleDeg ?? combat.aim?.evasiveAim?.baselineAngleDeg),
    evasiveAimBaselineAimX: numberOrNull(options.evasiveAimBaselineAimX ?? combat.aim?.evasiveAim?.baselineAimX),
    evasiveAimBaselineAimY: numberOrNull(options.evasiveAimBaselineAimY ?? combat.aim?.evasiveAim?.baselineAimY),
    evasiveAimLinearAngleDeg: numberOrNull(options.evasiveAimLinearAngleDeg ?? combat.aim?.evasiveAim?.linearAngleDeg),
    evasiveAimKnnAngleDeg: numberOrNull(options.evasiveAimKnnAngleDeg ?? combat.aim?.evasiveAim?.knnAngleDeg),
    evasiveAimFusionAngleDeg: numberOrNull(options.evasiveAimFusionAngleDeg ?? combat.aim?.evasiveAim?.fusionAngleDeg),
    evasiveAimRouterAngleDeg: numberOrNull(options.evasiveAimRouterAngleDeg ?? combat.aim?.evasiveAim?.routerAngleDeg),
    evasiveAimDisagreementDeg: numberOrNull(options.evasiveAimDisagreementDeg ?? combat.aim?.evasiveAim?.disagreementDeg)
  });
  learning.recentShots = learning.recentShots.filter(item => nowMs - Number(item.at || 0) <= 30000).slice(-80);
  const behaviorMap = ensureOpponentBehaviorMap(stateful);
  const targetBehavior = behaviorMap[id];
  if (targetBehavior) {
    if (!targetBehavior.probeWeights || typeof targetBehavior.probeWeights !== 'object') {
      targetBehavior.probeWeights = { center: 0.6, short: 0.45, long: 0.45 };
    }
    targetBehavior.probeWeights[hypothesis] = Math.max(0.1, Number(targetBehavior.probeWeights[hypothesis] || 0.5) * 0.98);
  }
  return { key, mode, hypothesis, hitRate: learnedBehaviorHitRate(stateful, behavior || mode, distance) };
}

function creditCombatHitLearning(stateful, targetId, hitCount, nowMs, currentTick = null) {
  const learning = ensureCombatLearningState(stateful);
  const targetState = String(stateful?.combatTarget?.id ?? '') === String(targetId)
    ? stateful.combatTarget
    : null;
  const targetX = numberOrNull(targetState?.x);
  const targetY = numberOrNull(targetState?.y);
  const targetSpeed = Math.hypot(Number(targetState?.motionSamples?.at(-1)?.vx || 0), Number(targetState?.motionSamples?.at(-1)?.vy || 0));
  const shots = learning.recentShots
    .filter(item => !item.credited && String(item.targetId) === String(targetId) && nowMs - Number(item.at || 0) <= 2500)
    .map(item => {
      const expectedArrivalTick = numberOrNull(item.expectedArrivalTick);
      const observedTick = numberOrNull(currentTick);
      const arrivalOffsetTicks = expectedArrivalTick !== null && observedTick !== null
        ? Math.abs(expectedArrivalTick - observedTick)
        : Math.abs(Number(item.at || 0) + Math.max(0, Number(item.flightTicks || 0)) * 50 - nowMs) / 50;
      const reachableRadius = 90 + targetSpeed * arrivalOffsetTicks;
      const aimDistance = targetX === null || targetY === null || item.aimX === null || item.aimY === null
        ? null
        : Math.hypot(Number(item.aimX) - targetX, Number(item.aimY) - targetY);
      return {
        ...item,
        expectedArrivalTick,
        arrivalOffsetTicks,
        trajectoryReachable: aimDistance === null || aimDistance <= reachableRadius,
        aimDistance,
        reachableRadius
      };
    })
    .sort((a, b) => {
      return Number(b.trajectoryReachable) - Number(a.trajectoryReachable)
        || Number(a.arrivalOffsetTicks ?? Infinity) - Number(b.arrivalOffsetTicks ?? Infinity)
        || Number(a.aimDistance ?? Infinity) - Number(b.aimDistance ?? Infinity);
    });
  let remaining = Math.max(0, Math.round(Number(hitCount || 0)));
  let credited = 0;
  const behavior = ensureOpponentBehaviorMap(stateful)[String(targetId)] || null;
  for (const shot of shots) {
    if (!remaining) break;
    shot.credited = true;
    const original = learning.recentShots.find(item => item.bulletId === shot.bulletId && item.at === shot.at);
    if (original) {
      original.credited = true;
      original.trajectoryReachable = shot.trajectoryReachable;
      original.aimDistance = shot.aimDistance;
      original.reachableRadius = shot.reachableRadius;
    }
    const cell = learning.hitRateByModeDistance[shot.key];
    if (cell) cell.hits = Math.min(80, Number(cell.hits || 0) + 1);
    const modeMetrics = combatModeMetricsCell(stateful, shot.key);
    modeMetrics.hits += 1;
    modeMetrics.targetDamage += 3;
    modeMetrics.updatedAt = nowMs;
    if (behavior) {
      if (!behavior.probeWeights || typeof behavior.probeWeights !== 'object') behavior.probeWeights = { center: 0.6, short: 0.45, long: 0.45 };
      behavior.probeWeights[shot.hypothesis] = Math.min(1, Number(behavior.probeWeights[shot.hypothesis] || 0.5) * 0.75 + 0.25);
    }
    credited += 1;
    remaining -= 1;
  }
  if (credited > 0) invalidateCombatLearningHitRateCache(learning);
  return credited;
}

function recentAcceptedShotHitSummary(stateful, targetId, limit = 15) {
  const shots = ensureCombatLearningState(stateful).recentShots
    .filter(item => String(item.targetId) === String(targetId))
    .slice(-Math.max(1, Math.round(Number(limit || 15))));
  const hits = shots.reduce((total, shot) => total + Number(shot.credited === true), 0);
  return {
    shotCount: shots.length,
    hits,
    hitRate: shots.length ? hits / shots.length : 0
  };
}

function currentCombatShotOriginDiagnostics(state = {}, stateful = {}, target = null) {
  const metrics = stateful?.combatMetrics || {};
  const targetId = String(combatTargetId(target) || metrics.targetId || '');
  const controlGeneration = String(metrics.controlGeneration || '');
  const engagementGeneration = String(metrics.engagementGeneration || '');
  if (!targetId || !controlGeneration || !engagementGeneration) {
    return { latestConfirmedShot: null, shooterOriginErrorSummary: null };
  }
  const confirmationBaseline = Math.max(0, Number(metrics.confirmationSequenceBaseline || 0));
  const confirmedShots = state?.command?.shooting?.confirmedShots || [];
  const lastAckShot = state?.command?.lastAck?.matchedShot || null;
  const shots = [...confirmedShots, ...(lastAckShot ? [lastAckShot] : [])].filter(shot => (
    String(shot?.targetId ?? '') === targetId
      && String(shot?.controlGeneration || '') === controlGeneration
      && String(shot?.engagementGeneration || '') === engagementGeneration
      && (shot?.confirmationSequence === null
        || shot?.confirmationSequence === undefined
        || Number(shot?.confirmationSequence || 0) > confirmationBaseline)
  ));
  const uniqueShots = [];
  const seenShotKeys = new Set();
  for (const shot of shots) {
    const shotKey = String(
      shot?.bullet_id
        ?? shot?.bulletId
        ?? `${shot?.confirmationSequence ?? ''}:${shot?.requestId ?? shot?.commandId ?? ''}`
    );
    if (shotKey && seenShotKeys.has(shotKey)) continue;
    if (shotKey) seenShotKeys.add(shotKey);
    uniqueShots.push(shot);
  }
  const errors = uniqueShots
    .map(shot => numberOrNull(shot?.shooterOriginErrorCm))
    .filter(value => value !== null)
    .slice(-64)
    .sort((left, right) => left - right);
  const percentileValue = ratio => {
    if (!errors.length) return null;
    return errors[Math.max(0, Math.min(errors.length - 1, Math.ceil(errors.length * ratio) - 1))];
  };
  const median = percentileValue(0.5);
  const deviations = median === null
    ? []
    : errors.map(value => Math.abs(value - median)).sort((left, right) => left - right);
  const madIndex = deviations.length
    ? Math.max(0, Math.min(deviations.length - 1, Math.ceil(deviations.length * 0.5) - 1))
    : -1;
  return {
    latestConfirmedShot: uniqueShots.at(-1) || null,
    shooterOriginErrorSummary: errors.length
      ? {
          sampleCount: errors.length,
          medianCm: median,
          p90Cm: percentileValue(0.9),
          madCm: madIndex >= 0 ? deviations[madIndex] : null
        }
      : null
  };
}

function compactCoverageShotAttribution(stateful, targetId, limit = 64) {
  const shots = ensureCombatLearningState(stateful).recentShots
    .filter(item => String(item.targetId) === String(targetId))
    .filter(item => item.coverageApplied === true || item.coverageImprovementQualified === true)
    .slice(-Math.max(1, Math.round(Number(limit || 64))));
  return shots.map(shot => ({
    bulletId: String(shot.bulletId || ''),
    acceptedShotOrdinal: numberOrNull(shot.acceptedShotOrdinal),
    acceptedAtMs: numberOrNull(shot.at),
    coverageApplied: shot.coverageApplied === true,
    coverageImprovementQualified: shot.coverageImprovementQualified === true,
    baselineExpectedMissCm: numberOrNull(shot.coverageBaselineExpectedMissCm),
    selectedExpectedMissCm: numberOrNull(shot.coverageSelectedExpectedMissCm),
    expectedMissImprovementCm: numberOrNull(shot.coverageExpectedMissImprovementCm),
    hypothesis: String(shot.coverageSelectedTrajectory || shot.routeCandidate || shot.hypothesis || ''),
    variant: String(shot.coverageVariant || ''),
    selectionMode: String(shot.coverageSelectionMode || ''),
    routeSelectionMode: String(shot.coverageRouteSelectionMode || ''),
    confirmedHit: shot.credited === true,
    evasiveAimModelVersion: String(shot.evasiveAimModelVersion || ''),
    evasiveAimStrategy: String(shot.evasiveAimStrategy || ''),
    evasiveAimTriggerReason: String(shot.evasiveAimTriggerReason || ''),
    evasiveAimApplied: shot.evasiveAimApplied === true,
    evasiveAimOffsetDeg: numberOrNull(shot.evasiveAimOffsetDeg)
  }));
}

function compactEvasiveAimShotAttribution(stateful, targetId, limit = 64) {
  const shots = ensureCombatLearningState(stateful).recentShots
    .filter(item => String(item.targetId) === String(targetId))
    .filter(item => item.evasiveAimApplied === true && item.evasiveAimStrategy)
    .slice(-Math.max(1, Math.round(Number(limit || 64))));
  return shots.map(shot => ({
    bulletId: String(shot.bulletId || ''),
    acceptedShotOrdinal: numberOrNull(shot.acceptedShotOrdinal),
    acceptedAtMs: numberOrNull(shot.at),
    modelVersion: String(shot.evasiveAimModelVersion || ''),
    strategy: String(shot.evasiveAimStrategy || ''),
    triggerReason: String(shot.evasiveAimTriggerReason || ''),
    confirmedHit: shot.credited === true,
    offsetDeg: numberOrNull(shot.evasiveAimOffsetDeg),
    baselineAngleDeg: numberOrNull(shot.evasiveAimBaselineAngleDeg),
    baselineAimX: numberOrNull(shot.evasiveAimBaselineAimX),
    baselineAimY: numberOrNull(shot.evasiveAimBaselineAimY),
    linearAngleDeg: numberOrNull(shot.evasiveAimLinearAngleDeg),
    knnAngleDeg: numberOrNull(shot.evasiveAimKnnAngleDeg),
    fusionAngleDeg: numberOrNull(shot.evasiveAimFusionAngleDeg),
    routerAngleDeg: numberOrNull(shot.evasiveAimRouterAngleDeg),
    disagreementDeg: numberOrNull(shot.evasiveAimDisagreementDeg)
  }));
}

function syncConfirmedCombatShots(stateful, state = {}, target = null, combat = {}, options = {}) {
  if (!stateful || !target) return 0;
  const targetId = String(combatTargetId(target) || '');
  if (!targetId) return 0;
  const learning = ensureCombatLearningState(stateful);
  if (!Array.isArray(learning.acceptedBulletIds)) learning.acceptedBulletIds = [];
  const seen = new Set(learning.acceptedBulletIds.map(String));
  let added = 0;
  let lateAdded = 0;
  let lastAcceptedShotTick = numberOrNull(stateful.combatMetrics?.lastAcceptedShotTick);
  const controlGeneration = String(stateful.combatMetrics?.controlGeneration || '');
  const engagementGeneration = String(stateful.combatMetrics?.engagementGeneration || '');
  const confirmationBaseline = Math.max(0, Number(stateful.combatMetrics?.confirmationSequenceBaseline || 0));
  for (const shot of state?.command?.shooting?.confirmedShots || []) {
    if (shot?.targetId !== null && shot?.targetId !== undefined && String(shot.targetId) !== targetId) continue;
    if (controlGeneration && String(shot?.controlGeneration || '') !== controlGeneration) continue;
    if (engagementGeneration && String(shot?.engagementGeneration || '') !== engagementGeneration) continue;
    if (Number(shot?.confirmationSequence || 0) <= confirmationBaseline) continue;
    const bulletId = String(shot?.bullet_id ?? shot?.bulletId ?? `${shot?.createdTick ?? shot?.created_tick}:${shot?.sequence ?? ''}`);
    const ownershipKey = `${controlGeneration}|${engagementGeneration}|${bulletId}`;
    if (!bulletId || seen.has(ownershipKey)) continue;
    seen.add(ownershipKey);
    added += 1;
    if (shot?.lateAck === true) lateAdded += 1;
    const acceptedShotOrdinal = Math.max(0, Number(stateful.combatMetrics?.acceptedShots || 0)) + added;
    const createdTick = numberOrNull(shot.createdTick ?? shot.created_tick);
    if (createdTick !== null) lastAcceptedShotTick = Math.max(lastAcceptedShotTick ?? createdTick, createdTick);
    recordCombatShotLearning(stateful, target, combat, {
      nowMs: Number(shot.acceptedAtMs || options.nowMs || Date.now()),
      hypothesis: shot.hypothesis,
      bulletId,
      createdTick: shot.createdTick ?? shot.created_tick,
      flightTicks: shot.flightTicks,
      aimX: shot.targetX,
      aimY: shot.targetY,
      routeContextKey: shot.routeContextKey,
      routeCandidate: shot.routeCandidate,
      routeProbability: shot.routeProbability,
      predictedDirectionState: shot.predictedDirectionState,
      aimConfidence: shot.aimConfidence,
      expectedHitProbability: shot.expectedHitProbability,
      acceptedShotOrdinal,
      coverageApplied: shot.coverageApplied,
      coverageBaselineExpectedMissCm: shot.coverageBaselineExpectedMissCm,
      coverageSelectedExpectedMissCm: shot.coverageSelectedExpectedMissCm,
      coverageExpectedMissImprovementCm: shot.coverageExpectedMissImprovementCm,
      coverageImprovementQualified: shot.coverageImprovementQualified,
      coverageSelectedTrajectory: shot.coverageSelectedTrajectory,
      coverageVariant: shot.coverageVariant,
      coverageSelectionMode: shot.coverageSelectionMode,
      coverageRouteSelectionMode: shot.coverageRouteSelectionMode,
      evasiveAimModelVersion: shot.evasiveAimModelVersion,
      evasiveAimStrategy: shot.evasiveAimStrategy,
      evasiveAimTriggerReason: shot.evasiveAimTriggerReason,
      evasiveAimApplied: shot.evasiveAimApplied,
      evasiveAimOffsetDeg: shot.evasiveAimOffsetDeg,
      evasiveAimBaselineAngleDeg: shot.evasiveAimBaselineAngleDeg,
      evasiveAimBaselineAimX: shot.evasiveAimBaselineAimX,
      evasiveAimBaselineAimY: shot.evasiveAimBaselineAimY,
      evasiveAimLinearAngleDeg: shot.evasiveAimLinearAngleDeg,
      evasiveAimKnnAngleDeg: shot.evasiveAimKnnAngleDeg,
      evasiveAimFusionAngleDeg: shot.evasiveAimFusionAngleDeg,
      evasiveAimRouterAngleDeg: shot.evasiveAimRouterAngleDeg,
      evasiveAimDisagreementDeg: shot.evasiveAimDisagreementDeg
    });
  }
  learning.acceptedBulletIds = Array.from(seen).slice(-256);
  if (added) {
    const metrics = stateful.combatMetrics || {};
    stateful.combatMetrics = {
      ...metrics,
      acceptedShots: Number(metrics.acceptedShots || 0) + added,
      lateAckCount: Number(metrics.lateAckCount || 0) + lateAdded,
      lastAcceptedShotTick
    };
  }
  return added;
}

function syncCombatShotExecutionEvents(stateful, state = {}, target = null) {
  if (!stateful || !target || !stateful.combatMetrics) return 0;
  const metrics = stateful.combatMetrics;
  const targetId = String(combatTargetId(target) || '');
  const controlGeneration = String(metrics.controlGeneration || '');
  const engagementGeneration = String(metrics.engagementGeneration || '');
  if (!targetId || !controlGeneration || !engagementGeneration) return 0;
  const ledger = stateful.combatExecutionLedger
    && String(stateful.combatExecutionLedger.engagementGeneration || '') === engagementGeneration
    ? stateful.combatExecutionLedger
    : { engagementGeneration, eventIds: [] };
  const seen = new Set((ledger.eventIds || []).map(String));
  let added = 0;
  for (const event of state?.command?.shooting?.executionEvents || []) {
    if (String(event?.controlGeneration || '') !== controlGeneration) continue;
    if (String(event?.engagementGeneration || '') !== engagementGeneration) continue;
    if (event?.targetId !== null && event?.targetId !== undefined && String(event.targetId) !== targetId) continue;
    const eventId = `${controlGeneration}|${Number(event?.sequence || 0)}|${String(event?.type || '')}`;
    if (seen.has(eventId)) continue;
    seen.add(eventId);
    added += 1;
    metrics.lastExecutionSequence = Math.max(
      Number(metrics.lastExecutionSequence || 0),
      Number(event?.sequence || 0)
    );
    const atMs = numberOrNull(event.atMs);
    if (event.type === 'shoot-dispatch') {
      metrics.wireRequestCount = Number(metrics.wireRequestCount || 0) + 1;
      metrics.requestedShots = metrics.wireRequestCount;
      metrics.actualShots = metrics.wireRequestCount;
      if (metrics.firstDispatchAt === null || metrics.firstDispatchAt === undefined) metrics.firstDispatchAt = atMs;
      if (atMs !== null) metrics.lastDispatchAt = atMs;
    } else if (event.type === 'shoot-stop') {
      if (metrics.stopDispatchAt === null || metrics.stopDispatchAt === undefined) {
        metrics.stopDispatchAt = atMs;
      }
    } else if (event.type === 'shoot-skip' || event.type === 'shoot-transport-rejected') {
      metrics.executionSkipCount = Number(metrics.executionSkipCount || 0) + 1;
      const reason = String(event.skipReason || event.outcome || 'unknown').slice(0, 64);
      metrics.executionSkipReasons = metrics.executionSkipReasons && typeof metrics.executionSkipReasons === 'object'
        ? metrics.executionSkipReasons
        : {};
      metrics.executionSkipReasons[reason] = Number(metrics.executionSkipReasons[reason] || 0) + 1;
    }
  }
  ledger.eventIds = Array.from(seen).slice(-128);
  stateful.combatExecutionLedger = ledger;
  return added;
}

function distanceBetween(a, b) {
  const ax = Number(a?.x);
  const ay = Number(a?.y);
  const bx = Number(b?.x);
  const by = Number(b?.y);
  if (![ax, ay, bx, by].every(Number.isFinite)) return Infinity;
  return Math.hypot(ax - bx, ay - by);
}

function entityDropValue(entity) {
  return Number(entity?.drop ?? entity?.Drop ?? entity?.reward ?? entity?.coin_reward ?? entity?.death_reward_preview ?? entity?.death_drop_coins ?? 0) || 0;
}

function entityDropKnown(entity) {
  if (typeof entity?.dropKnown === 'boolean') return entity.dropKnown;
  return [
    entity?.drop,
    entity?.Drop,
    entity?.reward,
    entity?.coin_reward,
    entity?.death_reward_preview,
    entity?.death_drop_coins
  ].some(value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)));
}

function combatTargetFrameGapHoldLimit(options = {}) {
  const combatControlIntervalMs = Number(options.combatControlIntervalMs);
  const derivedHoldMs = Math.max(
    DEFAULT_COMBAT_TARGET_FRAME_GAP_HOLD_MS,
    (Number.isFinite(combatControlIntervalMs) && combatControlIntervalMs > 0
      ? combatControlIntervalMs
      : 50) * 5
  );
  const configuredHoldMs = Number(options.combatTargetFrameGapHoldMs);
  return Math.max(0,
    options.combatTargetFrameGapHoldMs !== null
      && options.combatTargetFrameGapHoldMs !== undefined
      && Number.isFinite(configuredHoldMs)
      ? configuredHoldMs
      : derivedHoldMs);
}

function resetCombatEngagementAfterFrameGap(stateful, targetId, nowMs, ageMs, maxAgeMs) {
  if (!stateful || typeof stateful !== 'object') return null;
  const id = String(targetId ?? '');
  if (!id) return null;
  const currentTargetId = String(stateful.combatTarget?.id ?? '');
  if (currentTargetId && currentTargetId !== id) return null;
  const metricsTargetId = String(stateful.combatMetrics?.targetId ?? '');
  if (stateful.combatEngagements && typeof stateful.combatEngagements === 'object') {
    delete stateful.combatEngagements[id];
  }
  if (stateful.combatMetricsByTarget && typeof stateful.combatMetricsByTarget === 'object') {
    delete stateful.combatMetricsByTarget[id];
  }
  if (!metricsTargetId || metricsTargetId === id) stateful.combatMetrics = null;
  if (String(stateful.combatAim?.targetId ?? '') === id) stateful.combatAim = null;
  if (String(stateful.combatHpObservationTargetId ?? '') === id) {
    stateful.combatHpObservationTargetId = '';
    stateful.combatHpObservationBuffer = null;
    stateful.combatHpLossAttributionPending = null;
  }
  if (currentTargetId === id) stateful.combatTarget = null;
  stateful.combatTargetFrameGap = null;
  stateful.combatExecutionLedger = null;
  stateful.combatMovementStability = null;
  // Target-switch hysteresis is tied to the old visible engagement. Keeping it
  // after a long realtime absence could make a fresh segment inherit stale
  // arbitration state.
  stateful.combatTargetSwitchGate = null;
  stateful.combatTargetSwitchHistory = null;
  return {
    active: true,
    reason: 'combat-target-frame-gap-reset',
    targetId: id,
    ageMs: Math.round(Math.max(0, Number(ageMs) || 0)),
    maxAgeMs: Math.round(Math.max(0, Number(maxAgeMs) || 0)),
    at: Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now()
  };
}

function targetWhitelistFromOptions(options = {}) {
  if (options.targetWhitelist && typeof options.targetWhitelist === 'object') return options.targetWhitelist;
  const nameSet = options.targetWhitelistNameSet instanceof Set
    ? options.targetWhitelistNameSet
    : (Array.isArray(options.targetWhitelistNames)
        ? targetWhitelistNameSet(options.targetWhitelistNames, options.targetWhitelistMaxNames)
        : null);
  const userIdSet = options.targetWhitelistUserIdSet instanceof Set
    ? options.targetWhitelistUserIdSet
    : (Array.isArray(options.targetWhitelistUserIds)
        ? targetWhitelistUserIdSet(options.targetWhitelistUserIds, options.targetWhitelistMaxNames)
        : null);
  return nameSet || userIdSet ? { nameSet, userIdSet } : null;
}

function isWhitelistedTargetForOptions(entity, options = {}) {
  if (!entity) return false;
  if (entity.profitProtected === true
    || entity.creatorProtected === true
    || entity.dynamicWhitelistMember === true
    || entity.whitelisted === true) return true;
  if (typeof options.whitelistCheck === 'function' && options.whitelistCheck(entity)) return true;
  return targetIsWhitelisted(entity, targetWhitelistFromOptions(options));
}

function isHardCombatProtectedTarget(entity, options = {}) {
  if (!entity) return false;
  if (entity.creatorProtected === true || entity.legacyWhitelistProtected === true) return true;
  if (entity.dynamicWhitelistMember === true || entity.whitelistContactPolicy?.dynamicWhitelistMember === true) return false;
  return isWhitelistedTargetForOptions(entity, options);
}

function hpValue(entity) {
  const hp = Number(entity?.hp ?? entity?.knownHp ?? entity?.displayHp);
  return Number.isFinite(hp) ? hp : null;
}

function isActiveCombatEntity(entity) {
  const mode = String(entity?.current_join_mode || entity?.mode || entity?.joined || '').toLowerCase();
  return mode === 'active';
}

function combatHasFull5sStamina(stamina5s, stamina5sLimit, options = {}) {
  const remaining = Number(stamina5s);
  if (!Number.isFinite(remaining)) return false;
  const limitValue = Number(stamina5sLimit ?? 10000);
  const limit = Number.isFinite(limitValue) && limitValue > 0 ? limitValue : 10000;
  const ratioValue = Number(options.staminaFullRatio ?? DEFAULT_STAMINA_FULL_RATIO);
  const ratio = Number.isFinite(ratioValue) && ratioValue >= 0 ? ratioValue : DEFAULT_STAMINA_FULL_RATIO;
  return remaining >= limit * ratio;
}

function combatEntityActive(entity, moving, firing, stamina5s, stamina5sLimit, options = {}) {
  if (entity && Object.prototype.hasOwnProperty.call(entity, 'active')) return Boolean(entity.active);
  return Boolean(moving || firing || (isActiveCombatEntity(entity) && !combatHasFull5sStamina(stamina5s, stamina5sLimit, options)));
}

function entityDisplayName(entity) {
  return String(entity?.name || entity?.label || entity?.username || entity?.user_name || entity?.displayName || entity?.display_name || '').trim();
}

function normalizeCombatEntity(entity, self = null, options = {}) {
  if (!entity || typeof entity !== 'object') return null;
  const vx = numberOrNull(entity.vx);
  const vy = numberOrNull(entity.vy);
  const speed = numberOrNull(entity.speed ?? entity.speed_per_tick ?? entity.speedPerTick);
  const stamina5s = numberOrNull(entity.stamina_5s_remaining_milli ?? entity.stamina5sRemainingMilli ?? entity.stamina5s ?? entity.stamina_5s);
  const stamina1h = numberOrNull(entity.stamina_1h_remaining_milli ?? entity.stamina1hRemainingMilli ?? entity.stamina1h ?? entity.stamina_1h);
  const stamina1d = numberOrNull(entity.stamina_1d_remaining_milli ?? entity.stamina1dRemainingMilli ?? entity.stamina1d ?? entity.stamina_1d);
  const stamina5sLimit = numberOrNull(entity.stamina_5s_limit_milli ?? entity.stamina5sLimitMilli ?? entity.stamina5sLimit);
  const stamina1hLimit = numberOrNull(entity.stamina_1h_limit_milli ?? entity.stamina1hLimitMilli ?? entity.stamina1hLimit);
  const stamina1dLimit = numberOrNull(entity.stamina_1d_limit_milli ?? entity.stamina1dLimitMilli ?? entity.stamina1dLimit);
  const moving = Boolean(entity.moving || Math.hypot(Number(vx || 0), Number(vy || 0)) > 0 || Number(speed || 0) > 0);
  const firing = Boolean(entity.firing || entity.is_firing || entity.shooting);
  const normalized = {
    // Realtime entity records are treated as immutable input. Normalization
    // only replaces top-level scalar fields, so a shallow copy preserves the
    // source object without serializing every visible entity at 20 Hz.
    ...entity,
    user_id: numberOrNull(entity.user_id),
    entity_id: numberOrNull(entity.entity_id),
    name: entityDisplayName(entity),
    x: numberOrNull(entity.x),
    y: numberOrNull(entity.y),
    vx,
    vy,
    speed,
    moving,
    hp: numberOrNull(entity.hp),
    max_hp: numberOrNull(entity.max_hp),
    drop: entityDropValue(entity),
    active: combatEntityActive(entity, moving, firing, stamina5s, stamina5sLimit, options),
    firing,
    authority: 'realtime'
  };
  if (stamina5s !== null) {
    normalized.stamina_5s_remaining_milli = stamina5s;
    normalized.stamina5sRemainingMilli = stamina5s;
  }
  if (stamina1h !== null) {
    normalized.stamina_1h_remaining_milli = stamina1h;
    normalized.stamina1hRemainingMilli = stamina1h;
  }
  if (stamina1d !== null) {
    normalized.stamina_1d_remaining_milli = stamina1d;
    normalized.stamina1dRemainingMilli = stamina1d;
  }
  if (stamina5sLimit !== null) {
    normalized.stamina_5s_limit_milli = stamina5sLimit;
    normalized.stamina5sLimitMilli = stamina5sLimit;
  }
  if (stamina1hLimit !== null) {
    normalized.stamina_1h_limit_milli = stamina1hLimit;
    normalized.stamina1hLimitMilli = stamina1hLimit;
  }
  if (stamina1dLimit !== null) {
    normalized.stamina_1d_limit_milli = stamina1dLimit;
    normalized.stamina1dLimitMilli = stamina1dLimit;
  }
  if (entity.staminaMetadataAuthority) normalized.staminaMetadataAuthority = entity.staminaMetadataAuthority;
  normalized.distance = self ? distanceBetween(self, normalized) : numberOrNull(entity.distance);
  return normalized;
}

function ensureContactEntryGuardState(stateful = {}) {
  if (!stateful || typeof stateful !== 'object' || Array.isArray(stateful)) return null;
  if (!stateful.contactEntryGuard || typeof stateful.contactEntryGuard !== 'object' || Array.isArray(stateful.contactEntryGuard)) {
    stateful.contactEntryGuard = { observations: {}, active: null };
  }
  if (!stateful.contactEntryGuard.observations || typeof stateful.contactEntryGuard.observations !== 'object') {
    stateful.contactEntryGuard.observations = {};
  }
  return stateful.contactEntryGuard;
}

function contactEntryTargetBullet(bullets, targetId) {
  const id = String(targetId ?? '');
  if (!id) return null;
  return (bullets || []).find(bullet => String(bullet?.ownerId ?? '') === id) || null;
}

function contactEntryDodgeSummary(dodge, syntheticBullet = null) {
  const selected = (dodge?.threatField || []).find(item =>
    Number(item?.dx) === Number(dodge?.dx) && Number(item?.dy) === Number(dodge?.dy)) || null;
  const stationary = (dodge?.threatField || []).find(item => Number(item?.dx) === 0 && Number(item?.dy) === 0) || null;
  return {
    dx: Math.sign(Number(dodge?.dx || 0)),
    dy: Math.sign(Number(dodge?.dy || 0)),
    reason: 'contact-entry-pre-dodge',
    sourceReason: String(dodge?.reason || ''),
    predictedCpaCm: numberOrNull(selected?.minCPA),
    stationaryCpaCm: numberOrNull(stationary?.minCPA),
    predictedDirectHits: Math.max(0, Number(selected?.directHits || 0)),
    stationaryDirectHits: Math.max(0, Number(stationary?.directHits || 0)),
    assumedFlightTicks: numberOrNull(syntheticBullet?.remainingTicks),
    assumedImpactMs: numberOrNull(syntheticBullet?.timeToImpact)
  };
}

function updateContactEntryGuard(stateful, self, targets = [], bullets = [], options = {}) {
  const state = ensureContactEntryGuardState(stateful);
  if (!state || !self) return { active: false, reason: 'missing-state-or-self', target: null };
  const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  const currentTick = numberOrNull(options.currentTick);
  const attackRange = Math.max(0, Number(options.combatAttackRange || options.attackRange || COMBAT_CONSTANTS.ATTACK_RANGE));
  const guardBuffer = Math.max(0, Number(options.combatContactEntryGuardBufferCm ?? COMBAT_CONSTANTS.DODGE_RANGE_BUFFER));
  const guardRange = attackRange + guardBuffer;
  const observationTtlMs = Math.max(1000, Number(options.combatContactEntryObservationTtlMs ?? 3000));
  const holdMinimumMs = Math.max(100, Number(options.combatContactEntryHoldMinMs ?? 500));
  const holdMaximumMs = Math.max(holdMinimumMs, Number(options.combatContactEntryHoldMaxMs ?? 800));
  const commandDelayTicks = Math.max(0, Number(options.executionTiming?.p90Ticks || 5));
  const holdMs = Math.min(holdMaximumMs, Math.max(holdMinimumMs, commandDelayTicks * 50 * 2));
  const visibleById = new Map();
  for (const target of targets) {
    const id = String(combatTargetId(target) || '');
    if (id) visibleById.set(id, target);
  }
  for (const [id, observation] of Object.entries(state.observations)) {
    if (nowMs - Number(observation?.at || 0) > observationTtlMs) delete state.observations[id];
  }
  if (state.active) {
    const activeTarget = visibleById.get(String(state.active.targetId || '')) || null;
    const activeTargetHp = hpValue(activeTarget);
    const activeTargetInvalid = !activeTarget
      || (activeTargetHp !== null && activeTargetHp <= 0)
      || isInvulnerableEntity(activeTarget)
      || isHardCombatProtectedTarget(activeTarget, options)
      || dynamicWhitelistDistanceGuardBlocksCombatCore(activeTarget, {
        incomingOverride: Boolean((bullets || []).some(bullet => (
          String(bullet?.ownerId ?? '') === String(state.active.targetId || '')
            && incomingBulletHasCollisionRiskCore(bullet, options)
        )))
      });
    if (activeTargetInvalid || nowMs >= Number(state.active.holdUntil || 0)) {
      state.active = null;
    } else {
      const realBullet = contactEntryTargetBullet(bullets, state.active.targetId);
      return {
        ...state.active,
        active: true,
        target: activeTarget,
        realBulletTakeover: Boolean(realBullet),
        remainingMs: Math.max(0, Math.round(Number(state.active.holdUntil) - nowMs))
      };
    }
  }
  const candidates = [];
  let bestBlocked = null;
  for (const target of targets) {
    const id = String(combatTargetId(target) || '');
    const targetHp = hpValue(target);
    let targetBullet = contactEntryTargetBullet(bullets, id);
    const dynamicWhitelistMember = Boolean(
      target.dynamicWhitelistMember || target.whitelistContactPolicy?.dynamicWhitelistMember
    );
    if (dynamicWhitelistMember && targetBullet && !incomingBulletHasCollisionRiskCore(targetBullet, options)) {
      targetBullet = null;
    }
    const dynamicContactEligible = target.whitelistContactPolicy?.proactiveCombatEligible === true;
    if (!id
      || (targetHp !== null && targetHp <= 0)
      || isInvulnerableEntity(target)
      || isHardCombatProtectedTarget(target, options)) continue;
    const previous = state.observations[id] || null;
    const previousArmed = previous?.armed !== false;
    const risk = withOptionOverrides(options, {
      attackRange,
      guardBufferCm: guardBuffer,
      realBullet: Boolean(targetBullet),
      armed: previousArmed
    }, mergedOptions => contactEntryRiskCore(self, target, previous, mergedOptions));
    const outsideGuard = Number(target.distance) > guardRange;
    state.observations[id] = {
      distance: numberOrNull(target.distance),
      at: nowMs,
      tick: currentTick,
      armed: outsideGuard ? true : previousArmed,
      lastBlockedReason: risk.blockedReason
    };
    const row = { target, targetId: id, targetBullet, risk };
    if (dynamicWhitelistMember && !dynamicContactEligible && !targetBullet
      && !(risk.eligible && risk.directApproach)) {
      if (!bestBlocked || Number(risk.distance ?? Infinity) < Number(bestBlocked.risk.distance ?? Infinity)) {
        bestBlocked = row;
      }
      continue;
    }
    if (risk.eligible) candidates.push(row);
    else if (!bestBlocked || Number(risk.distance ?? Infinity) < Number(bestBlocked.risk.distance ?? Infinity)) bestBlocked = row;
  }
  candidates.sort((a, b) => Number(b.risk.realBullet) - Number(a.risk.realBullet)
    || Number(b.risk.firing) - Number(a.risk.firing)
    || Number(a.risk.distance ?? Infinity) - Number(b.risk.distance ?? Infinity)
    || Number(b.risk.closingSpeed || 0) - Number(a.risk.closingSpeed || 0));
  const selected = candidates[0] || null;
  if (!selected) {
    return {
      active: false,
      reason: bestBlocked?.risk?.blockedReason || 'no-contact-entry-target',
      target: null,
      assessment: bestBlocked?.risk || null,
      guardRange: Math.round(guardRange)
    };
  }
  const syntheticBullet = selected.targetBullet
    ? null
    : contactEntrySyntheticBulletCore(self, selected.target, options);
  const dodgeBullets = selected.targetBullet ? [selected.targetBullet] : (syntheticBullet ? [syntheticBullet] : []);
  if (!dodgeBullets.length) {
    return { active: false, reason: 'missing-contact-entry-trajectory', target: null, assessment: selected.risk };
  }
  const dodge = calculateDodgeDirection(self, dodgeBullets, {
    tangentPreference: movementTangentPreference(self, selected.target),
    target: selected.target,
    moveSpeedPerTick: options.combatMoveSpeedPerTick || 50,
    hitRadius: options.combatBulletHitRadiusCm || 200,
    commandDelayP90Ticks: commandDelayTicks,
    movementExecutionTiming: options.movementExecutionTiming,
    pendingVelocityCommands: options.pendingVelocityCommands,
    robustScheduleEnabled: options.combatRobustDodgeEnabled !== false,
    currentTick,
    reactionSafetyMarginMs: options.combatReactionSafetyMarginMs ?? 100
  });
  const dodgeSummary = contactEntryDodgeSummary(dodge, syntheticBullet);
  if (!dodgeSummary.dx && !dodgeSummary.dy) {
    return { active: false, reason: 'no-contact-entry-displacement', target: null, assessment: selected.risk };
  }
  const observation = state.observations[selected.targetId];
  observation.armed = false;
  state.active = {
    active: true,
    targetId: selected.targetId,
    trigger: selected.risk.trigger,
    triggeredAt: nowMs,
    triggerTick: currentTick,
    holdUntil: nowMs + holdMs,
    holdMs,
    assessment: selected.risk,
    dodge: dodgeSummary
  };
  return {
    ...state.active,
    target: selected.target,
    realBulletTakeover: Boolean(selected.targetBullet),
    remainingMs: holdMs
  };
}

function directClosingDynamicWhitelistTargetId(self, targets = [], stateful = {}, options = {}) {
  if (!self || !Array.isArray(targets) || !targets.length) return '';
  const observations = stateful?.contactEntryGuard?.observations || {};
  const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  const observationTtlMs = Math.max(1000, Number(options.combatContactEntryObservationTtlMs ?? 3000));
  const attackRange = Math.max(0, Number(options.combatAttackRange || options.attackRange || COMBAT_CONSTANTS.ATTACK_RANGE));
  const guardBuffer = Math.max(0, Number(options.combatContactEntryGuardBufferCm ?? COMBAT_CONSTANTS.DODGE_RANGE_BUFFER));
  const selfHp = hpValue(self);
  const selfMaxHp = hpValue({ hp: self.max_hp ?? self.maxHp });
  const recoveringSelf = selfHp !== null && selfMaxHp !== null && selfHp < selfMaxHp;
  const candidates = [];
  for (const target of targets) {
    const dynamicWhitelistMember = Boolean(
      target?.dynamicWhitelistMember || target?.whitelistContactPolicy?.dynamicWhitelistMember
    );
    if (!dynamicWhitelistMember
      || target?.whitelistContactPolicy?.proactiveCombatEligible === true) continue;
    const id = String(combatTargetId(target) || '');
    const previous = id ? observations[id] : null;
    if (!id || !previous || nowMs - Number(previous.at || 0) > observationTtlMs) continue;
    const distance = Number(target.distance);
    if (!Number.isFinite(distance) || distance > attackRange) continue;
    const risk = contactEntryRiskCore(self, target, previous, {
      ...options,
      attackRange,
      guardBufferCm: guardBuffer,
      realBullet: false,
      armed: true,
      recoveringSelf
    });
    if (!risk.eligible || !risk.directApproach || risk.firing || risk.realBullet) continue;
    candidates.push({ id, distance, closingSpeed: Number(risk.closingSpeed || 0) });
  }
  candidates.sort((left, right) => right.closingSpeed - left.closingSpeed || left.distance - right.distance);
  return candidates[0]?.id || '';
}

function bulletOwnerId(bullet) {
  return bullet?.owner_user_id ?? bullet?.ownerUserId ?? bullet?.owner_id ?? bullet?.ownerId ?? bullet?.user_id ?? bullet?.userId ?? null;
}

function bulletDirection(bullet, startX, startY, targetX, targetY) {
  const microsX = numberOrNull(bullet?.dir_x_micros ?? bullet?.dirXMicros);
  const microsY = numberOrNull(bullet?.dir_y_micros ?? bullet?.dirYMicros);
  if (microsX !== null || microsY !== null) {
    const dx = Number(microsX || 0) / 1000000;
    const dy = Number(microsY || 0) / 1000000;
    const length = Math.hypot(dx, dy);
    if (length > 0) return { dx: dx / length, dy: dy / length };
  }
  if ([startX, startY, targetX, targetY].every(value => value !== null)) {
    const dx = targetX - startX;
    const dy = targetY - startY;
    const length = Math.hypot(dx, dy);
    if (length > 0) return { dx: dx / length, dy: dy / length };
  }
  return { dx: 0, dy: 0 };
}

function estimateBulletKinematics(bullet, self, options = {}) {
  const startX = numberOrNull(bullet.start_x ?? bullet.startX ?? bullet.x);
  const startY = numberOrNull(bullet.start_y ?? bullet.startY ?? bullet.y);
  const targetX = numberOrNull(bullet.target_x ?? bullet.targetX ?? bullet.aim_x ?? bullet.aimX);
  const targetY = numberOrNull(bullet.target_y ?? bullet.targetY ?? bullet.aim_y ?? bullet.aimY);
  const speedValue = numberOrNull(bullet.speed_per_tick ?? bullet.speedPerTick ?? bullet.speed);
  const speed = Math.max(0, Number(speedValue ?? COMBAT_CONSTANTS.BULLET_SPEED_CM_PER_TICK));
  const direction = bulletDirection(bullet, startX, startY, targetX, targetY);
  const currentTick = numberOrNull(options.currentTick);
  const createdTick = numberOrNull(bullet.created_tick ?? bullet.createdTick);
  const expireTick = numberOrNull(bullet.expire_tick ?? bullet.expireTick);
  const ageTicks = currentTick !== null && createdTick !== null ? Math.max(0, currentTick - createdTick) : 0;
  const projectedX = startX !== null ? startX + direction.dx * speed * ageTicks : null;
  const projectedY = startY !== null ? startY + direction.dy * speed * ageTicks : null;
  const x = numberOrNull(bullet.x ?? projectedX ?? startX);
  const y = numberOrNull(bullet.y ?? projectedY ?? startY);
  let distance = self && x !== null && y !== null ? distanceBetween(self, { x, y }) : numberOrNull(bullet.distance);
  let cpa = numberOrNull(bullet.cpa);
  let timeToImpact = numberOrNull(bullet.timeToImpact ?? bullet.time_to_impact_ms);
  if (self && x !== null && y !== null && speed > 0 && (direction.dx || direction.dy)) {
    const relX = Number(self.x) - x;
    const relY = Number(self.y) - y;
    const closestTicks = (relX * direction.dx + relY * direction.dy) / speed;
    if (closestTicks > 0) {
      const closestX = x + direction.dx * speed * closestTicks;
      const closestY = y + direction.dy * speed * closestTicks;
      cpa = distanceBetween(self, { x: closestX, y: closestY });
      timeToImpact = Math.round(closestTicks * 50);
    }
  }
  if (!Number.isFinite(distance)) distance = null;
  return {
    startX,
    startY,
    targetX,
    targetY,
    x,
    y,
    distance,
    speed,
    direction,
    cpa,
    timeToImpact,
    createdTick,
    expireTick,
    currentTick,
    remainingTicks: currentTick !== null && expireTick !== null ? Math.max(0, expireTick - currentTick) : null
  };
}

function normalizeCombatBullet(bullet, self = null, options = {}) {
  if (!bullet || typeof bullet !== 'object') return null;
  const kinematics = estimateBulletKinematics(bullet, self, options);
  const ownerId = bulletOwnerId(bullet);
  return {
    // Bullet input is likewise read-only and every derived kinematic field is
    // replaced below. Avoid a JSON round trip for the complete bullet set on
    // each realtime frame.
    ...bullet,
    ownerId: ownerId === null || ownerId === undefined ? null : Number(ownerId),
    startX: kinematics.startX,
    startY: kinematics.startY,
    targetX: kinematics.targetX,
    targetY: kinematics.targetY,
    x: kinematics.x,
    y: kinematics.y,
    distance: kinematics.distance,
    speed: kinematics.speed,
    direction: kinematics.direction,
    cpa: kinematics.cpa,
    timeToImpact: kinematics.timeToImpact,
    createdTick: kinematics.createdTick,
    expireTick: kinematics.expireTick,
    currentTick: kinematics.currentTick,
    remainingTicks: kinematics.remainingTicks,
    incoming: Boolean(self && ownerId !== null && Number(ownerId) !== Number(self.user_id)),
    authority: 'realtime'
  };
}

function summarizeCombatTarget(target) {
  if (!target) return null;
  return {
    userId: numberOrNull(target.user_id),
    entityId: numberOrNull(target.entity_id),
    name: entityDisplayName(target),
    authority: target.authority || 'realtime',
    x: numberOrNull(target.x),
    y: numberOrNull(target.y),
    vx: numberOrNull(target.vx),
    vy: numberOrNull(target.vy),
    hp: numberOrNull(target.hp),
    maxHp: numberOrNull(target.max_hp ?? target.maxHp),
    drop: entityDropValue(target),
    stamina5s: numberOrNull(target.stamina_5s_remaining_milli ?? target.stamina5sRemainingMilli),
    stamina5sLimit: numberOrNull(target.stamina_5s_limit_milli ?? target.stamina5sLimitMilli),
    stamina1h: numberOrNull(target.stamina_1h_remaining_milli ?? target.stamina1hRemainingMilli),
    stamina1d: numberOrNull(target.stamina_1d_remaining_milli ?? target.stamina1dRemainingMilli),
    staminaMetadataAuthority: target.staminaMetadataAuthority || '',
    active: target && Object.prototype.hasOwnProperty.call(target, 'active')
      ? Boolean(target.active)
      : combatEntityActive(
        target,
        Boolean(target?.moving || Math.hypot(Number(target?.vx || 0), Number(target?.vy || 0)) > 0 || Number(target?.speed || 0) > 0),
        Boolean(target?.firing || target?.is_firing || target?.shooting),
        target?.stamina_5s_remaining_milli ?? target?.stamina5sRemainingMilli,
        target?.stamina_5s_limit_milli ?? target?.stamina5sLimitMilli
      ),
    firing: Boolean(target.firing || target.is_firing || target.shooting),
    easyKillKnown: Boolean(target.easyKillKnown),
    easyKillDamagedToday: Boolean(target.easyKillDamagedToday),
    easyKillThreatExempt: Boolean(target.easyKillThreatExempt),
    easyKillProfitTarget: Boolean(target.easyKillProfitTarget),
    creatorProtected: Boolean(target.creatorProtected),
    dynamicWhitelistMember: Boolean(target.dynamicWhitelistMember),
    dynamicWhitelistEnabled: Boolean(target.dynamicWhitelistEnabled),
    damagedSelfToday: Boolean(target.damagedSelfToday),
    legacyWhitelistProtected: Boolean(target.legacyWhitelistProtected),
    profitProtected: Boolean(target.profitProtected),
    whitelistContactPolicy: target.whitelistContactPolicy ? {
      membershipSource: String(target.whitelistContactPolicy.membershipSource || 'none'),
      profitProtected: Boolean(target.whitelistContactPolicy.profitProtected),
      creatorProtected: Boolean(target.whitelistContactPolicy.creatorProtected),
      dynamicWhitelistMember: Boolean(target.whitelistContactPolicy.dynamicWhitelistMember),
      dynamicWhitelistEnabled: Boolean(target.whitelistContactPolicy.dynamicWhitelistEnabled),
      damagedSelfToday: Boolean(target.whitelistContactPolicy.damagedSelfToday),
      legacyWhitelistProtected: Boolean(target.whitelistContactPolicy.legacyWhitelistProtected),
      proactiveCombatEligible: Boolean(target.whitelistContactPolicy.proactiveCombatEligible),
      proactiveCombatRangeCm: numberOrNull(target.whitelistContactPolicy.proactiveCombatRangeCm),
      lowHpSafetyExit: Boolean(target.whitelistContactPolicy.lowHpSafetyExit),
      distanceCm: numberOrNull(target.whitelistContactPolicy.distanceCm),
      reason: String(target.whitelistContactPolicy.reason || '')
    } : null,
    distance: Number.isFinite(Number(target.distance)) ? Math.round(Number(target.distance)) : null,
    score: Number.isFinite(Number(target.combatScore)) ? Math.round(Number(target.combatScore)) : null,
    combatIntent: target.combatIntent || '',
    combatEngagement: target.combatEngagement ? cloneJson(target.combatEngagement) : null
  };
}

function evaluateRealtimeTrajectoryAim(aim, options = {}) {
  const routeCandidates = Array.isArray(aim?.routeCoverage?.candidates)
    ? aim.routeCoverage.candidates
    : [];
  const executionDelayTicks = numberOrNull(
    aim?.timing?.executionDelayTicks
      ?? options.executionTiming?.medianTicks
      ?? 5
  ) ?? 5;
  const createdTick = numberOrNull(
    aim?.timing?.createdTickEstimate
      ?? (numberOrNull(options.observedTick) ?? 0) + executionDelayTicks
  ) ?? 0;
  const flightTicks = numberOrNull(aim?.flightTicks);
  const bulletLifetimeTicks = Math.max(
    1,
    Number(options.combatBulletLifetimeTicks
      ?? Math.round(COMBAT_CONSTANTS.BULLET_RANGE_CM / COMBAT_CONSTANTS.BULLET_SPEED_CM_PER_TICK))
  );
  // A proof only needs to cover the bullet's arrival window.  Extending every
  // route to the full bullet lifetime multiplies the realtime control cost
  // without improving whether this aim can hit at its intercept tick.
  const trajectoryHorizonTicks = Math.max(
    1,
    Math.min(
      bulletLifetimeTicks,
      flightTicks === null ? bulletLifetimeTicks : Math.ceil(flightTicks) + 1
    )
  );
  return evaluateTrajectoryAimCore({
    aimPoint: aim && Number.isFinite(Number(aim.x)) && Number.isFinite(Number(aim.y))
      ? { x: Number(aim.x), y: Number(aim.y) }
      : null,
    createdTick,
    flightTicks,
    controlIntervalTicks: Math.max(1, Math.ceil(Number(options.combatControlIntervalMs ?? 50) / 50)),
    predictedShooterOrigin: aim?.predictedShooterOrigin || null,
    predictedTargetAtCreation: aim?.predictedTargetAtCreation || null,
    routeCandidates
  }, {
    bulletSpeedCmPerTick: Number(options.combatBulletSpeedPerTick ?? COMBAT_CONSTANTS.BULLET_SPEED_CM_PER_TICK),
    bulletLifetimeTicks,
    hitRadiusCm: Number(options.combatBulletHitRadiusCm ?? COMBAT_CONSTANTS.BULLET_HIT_RADIUS_CM),
    maxRouteClusters: 4,
    maxTrajectoryTicks: trajectoryHorizonTicks
  });
}

function estimateAim(self, target, options = {}) {
  if (!self || !target) return { ok: false, reason: 'missing-self-or-target' };
  const distance = distanceBetween(self, target);
  const tx = numberOrNull(target.x);
  const ty = numberOrNull(target.y);
  if (tx === null || ty === null || !Number.isFinite(distance)) {
    return { ok: false, reason: 'missing-target-position' };
  }
  const vx = Number(target.vx || 0);
  const vy = Number(target.vy || 0);
  const speed = Number(target.speed ?? Math.hypot(vx, vy));
  const bulletSpeed = Math.max(1, Number(options.bulletSpeedCmPerTick || COMBAT_CONSTANTS.BULLET_SPEED_CM_PER_TICK));
  const combatTargetState = options.combatTargetState || null;
  const samples = Array.isArray(combatTargetState?.motionSamples) ? combatTargetState.motionSamples : [];
  const profile = opponentMotionProfileCore(self, target, samples, {
    stationarySpeed: options.combatStationarySpeed
  });
  const behavior = combatTargetState?.opponentBehaviorState || null;
  const timing = options.executionTiming || {};
  const timingMedian = Number.isFinite(Number(timing.medianTicks)) ? Number(timing.medianTicks) : 5;
  const timingMad = Number.isFinite(Number(timing.madTicks)) ? Number(timing.madTicks) : 0;
  const timingSource = String(timing.source || 'startup-default');
  const timingSampleCount = Number(timing.sampleCount);
  const confirmedTimingSamples = timingSource === 'confirmed-shoot-rolling'
    && Number.isFinite(timingSampleCount)
    ? Math.max(0, timingSampleCount)
    : 0;
  const fireRiskClassification = combatTargetState?.fireRiskClassification || classifyFireRiskCore(null, {
    targetId: combatTargetId(target),
    nowMs: options.nowMs,
    controlStyle: behavior?.dimensions?.controlStyle?.state,
    controlStyleConfidence: behavior?.dimensions?.controlStyle?.confidence,
    maneuverScale: profile.maneuverScale,
    maneuverDurationMs: profile.durationMs,
    lateralFlips: profile.lateralFlips,
    automationLikelihood: behavior?.automationLikelihood,
    routeSamples: behavior?.metrics?.movementTransitions?.conditionalSampleCount,
    routeDistribution: behavior?.metrics?.movementTransitions?.conditionalNext,
    recentHitRate: behavior?.recentHitRate
  });
  const highEntropy = Boolean(fireRiskClassification.highEntropy);
  let observationToExecutionTicks = Math.max(0, Math.min(12, Math.round(
    timingMedian + (highEntropy ? timingMad * (profile.maneuverScale >= 0.65 ? 2 : 1) : 0)
  )));
  const finishProtection = hpValue(target) !== null && hpValue(self) !== null
    && hpValue(target) <= Number(options.combatFinishLowThreatHp ?? COMBAT_CONSTANTS.FINISH_LOW_THREAT_HP)
    && hpValue(self) >= hpValue(target) + 10;
  const successfulAimProtection = Math.max(
    Number(behavior?.recentHitRate || 0),
    Number(combatTargetState?.provenHitRate || 0)
  ) >= 0.12;
  const unmeasuredDelayProtection = confirmedTimingSamples === 0
    && (finishProtection || successfulAimProtection);
  if (unmeasuredDelayProtection) {
    observationToExecutionTicks = 3;
  }
  const responsePolicy = behavior?.responsePolicy || opponentResponsePolicyCore(behavior?.mode || 'mixed/unknown', {
    distance,
    nowMs: options.nowMs
  });
  const motionScale = Math.max(0, Math.min(1, Math.max(speed, profile.avgSpeed) / Math.max(1, Number(options.combatTargetDodgeSpeedPerTick || 50))));
  const shooterVx = numberOrNull(options.shooterVelocity?.vx) ?? numberOrNull(self.vx) ?? 0;
  const shooterVy = numberOrNull(options.shooterVelocity?.vy) ?? numberOrNull(self.vy) ?? 0;
  const bulletRange = Math.max(1, Number(options.combatBulletRangeCm || COMBAT_CONSTANTS.BULLET_RANGE_CM));
  const hitRadius = Math.max(0, Number(options.combatBulletHitRadiusCm || 90));
  const bulletLifetimeTicks = Math.max(1, Number(
    options.combatBulletLifetimeTicks
      ?? COMBAT_CONSTANTS.BULLET_LIFETIME_TICKS
      ?? bulletRange / bulletSpeed
  ));
  const creationDelayMinTicks = Math.max(0, numberOrNull(
    options.combatAimCreationDelayMinTicks
      ?? timing.minTicks
      ?? (unmeasuredDelayProtection ? observationToExecutionTicks : timing.medianTicks)
  ) ?? observationToExecutionTicks);
  const creationDelayMaxTicks = Math.max(creationDelayMinTicks, numberOrNull(
    options.combatAimCreationDelayMaxTicks
      ?? timing.maxTicks
      ?? (unmeasuredDelayProtection ? observationToExecutionTicks : timing.p90Ticks)
  ) ?? observationToExecutionTicks);
  observationToExecutionTicks = Math.max(
    creationDelayMinTicks,
    Math.min(creationDelayMaxTicks, observationToExecutionTicks)
  );
  const realtimeStateObservedAtMs = numberOrNull(
    options.realtimeStateObservedAtMs
      ?? options.observedAtMs
      ?? target.receivedAtMs
      ?? self.receivedAtMs
  );
  const creationOracle = solveInterceptAtCreationCore(self, target, {
    bulletSpeedCmPerTick: bulletSpeed,
    bulletRangeCm: bulletRange,
    bulletLifetimeTicks,
    hitRadiusCm: hitRadius,
    selectedCreationDelayTicks: observationToExecutionTicks,
    creationDelayMinTicks,
    creationDelayMaxTicks,
    maxCreationWindowTicks: options.combatAimMaxCreationWindowTicks,
    realtimeStateObservedAtMs,
    nowMs: options.nowMs,
    realtimeStateAgeMs: options.realtimeStateAgeMs,
    maxRealtimeStateAgeMs: options.combatAimMaxRealtimeStateAgeMs,
    shooterVelocity: {
      vx: shooterVx,
      vy: shooterVy
    }
  });
  const interceptOptions = {
    bulletSpeed,
    observationToExecutionTicks,
    predictShooterOrigin: true,
    shooterVelocity: {
      vx: shooterVx,
      vy: shooterVy
    },
    shooterOriginConfidence: Number(options.shooterOriginConfidence ?? 1),
    shooterOriginSource: options.shooterOriginSource || 'realtime-self-velocity',
    hitRadius,
    maxTargetSpeed: options.combatTargetDodgeSpeedPerTick || 50,
    motionScale
  };
  const constrainedIntercept = quadraticInterceptCore(self, target, {
    ...interceptOptions,
    bulletRange,
    maxTicks: options.combatInterceptMaxTicks,
  });
  const oracleIntercept = creationOracle.reachable === true && creationOracle.interceptPoint
    ? {
        x: creationOracle.interceptPoint.x,
        y: creationOracle.interceptPoint.y,
        flightTicks: creationOracle.interceptTicks,
        flightMs: Number(creationOracle.interceptTicks || 0) * 50,
        travelDistance: creationOracle.interceptRangeCm,
        leadDistance: Math.hypot(
          creationOracle.interceptPoint.x - tx,
          creationOracle.interceptPoint.y - ty
        ),
        predictedShooterOrigin: creationOracle.predictedShooterOrigin,
        predictedTargetAtCreation: creationOracle.predictedTargetAtCreation,
        relativeExecutionDisplacement: {
          x: (vx - shooterVx) * observationToExecutionTicks,
          y: (vy - shooterVy) * observationToExecutionTicks
        },
        targetSpeed: Math.hypot(vx, vy),
        confidence: 0.55
      }
    : null;
  const intercept = creationOracle.reachable === true
    ? (constrainedIntercept || oracleIntercept)
    : null;
  const unconstrainedIntercept = intercept || quadraticInterceptCore(self, target, {
    ...interceptOptions,
    bulletRange: Math.max(60000, bulletRange * 4),
    maxTicks: Math.max(120, Number(options.combatInterceptMaxTicks || 0))
  });
  const requiredTravelDistance = numberOrNull(
    creationOracle.interceptRangeCm ?? unconstrainedIntercept?.travelDistance
  );
  const reachabilityGapCm = creationOracle.reachable === true
    ? 0
    : (requiredTravelDistance === null
        ? null
        : Math.max(0, requiredTravelDistance - bulletRange - hitRadius));
  const fireReachability = {
    reachable: creationOracle.reachable === true,
    feasible: creationOracle.reachable === true,
    unreachable: creationOracle.reachable !== true,
    reason: creationOracle.reason,
    authority: 'realtime-creation-oracle',
    observationAgeMs: creationOracle.observationAgeMs,
    creationDelayWindowTicks: creationOracle.creationDelayWindowTicks,
    bulletRangeCm: bulletRange,
    bulletLifetimeTicks,
    hitRadiusCm: hitRadius,
    requiredTravelDistanceCm: requiredTravelDistance === null ? null : Math.round(requiredTravelDistance),
    rangeGapCm: reachabilityGapCm === null ? null : Math.round(reachabilityGapCm),
    requiredFlightTicks: numberOrNull(creationOracle.interceptTicks ?? unconstrainedIntercept?.flightTicks),
    interceptPoint: creationOracle.interceptPoint,
    predictedShooterOrigin: creationOracle.predictedShooterOrigin,
    predictedTargetAtCreation: creationOracle.predictedTargetAtCreation
  };
  const flightTicks = intercept?.flightTicks
    ?? creationOracle.interceptTicks
    ?? Math.max(0, distance / bulletSpeed);
  const trajectoryHorizonTicks = Math.max(
    1,
    Math.min(bulletLifetimeTicks, Math.ceil(Number(flightTicks) || 0) + 1)
  );
  const leadTicks = flightTicks + observationToExecutionTicks;
  const fallbackPredictedShooterOrigin = {
    x: Number(self.x) + shooterVx * observationToExecutionTicks,
    y: Number(self.y) + shooterVy * observationToExecutionTicks,
    vx: shooterVx,
    vy: shooterVy,
    confidence: Math.max(0, Math.min(1, Number(options.shooterOriginConfidence ?? 1))),
    source: String(options.shooterOriginSource || 'realtime-self-velocity')
  };
  const fallbackPredictedTargetAtCreation = {
    x: tx + vx * observationToExecutionTicks,
    y: ty + vy * observationToExecutionTicks,
    vx,
    vy
  };
  const fallbackAim = {
    x: tx + vx * leadTicks - shooterVx * observationToExecutionTicks,
    y: ty + vy * leadTicks - shooterVy * observationToExecutionTicks
  };
  const stationarySpeed = Math.max(0, Number(options.stationarySpeed ?? options.combatStationarySpeed ?? 5));
  const behaviorStationary = behavior?.mode === 'stationary';
  const moving = !behaviorStationary && Boolean(target.moving || speed >= stationarySpeed || Math.hypot(vx, vy) >= stationarySpeed);
  const arrivalOccupancy = arrivalOccupancyModelCore(samples, {
    stationarySpeed,
    serverTickMs: options.combatServerTickMs ?? 50,
    flightTicks,
    minimumCompletedStops: options.combatAimMinimumCompletedStops,
    minimumStopSamples: options.combatAimMinimumStopSamples,
    minimumHistoryMs: options.combatAimMinimumHistoryMs,
    minimumStopFraction: options.combatAimMinimumStopFraction,
    maxCurrentStopFlightRatio: options.combatAimMaxCurrentStopFlightRatio,
    minimumCompletedMoves: options.combatAimMinimumCompletedMoves,
    minimumCurrentMoveFlightRatio: options.combatAimMinimumCurrentMoveFlightRatio,
    maxCurrentMoveFlightRatio: options.combatAimMaxCurrentMoveFlightRatio
  });
  const arrivalOccupancyActive = arrivalOccupancy.active === true;
  const trajectoryAware = moving || arrivalOccupancyActive;
  let x = moving ? (intercept?.x ?? fallbackAim.x) : tx;
  let y = moving ? (intercept?.y ?? fallbackAim.y) : ty;
  const baseLeadX = x - tx;
  const baseLeadY = y - ty;
  const responseLeadScale = Math.max(0, Math.min(1.5, Number(responsePolicy?.aimLeadScale ?? 1)));
  x = tx + baseLeadX * responseLeadScale;
  y = ty + baseLeadY * responseLeadScale;
  const noDamageMs = Math.max(0, Number(combatTargetState?.noDamageMs || 0));
  const noDamageStartMs = Math.max(0, Number(options.combatAimNoDamageMs ?? 1000));
  const noDamageStepMs = Math.max(1, Number(options.combatAimNoDamageStepMs ?? 800));
  const noDamageLevel = noDamageStartMs > 0 && noDamageMs > noDamageStartMs
    ? Math.floor((noDamageMs - noDamageStartMs) / noDamageStepMs) + 1
    : 0;
  const noDamageWidened = noDamageLevel > 0;
  let motionProbe = null;
  if (moving && noDamageWidened) {
    const hypotheses = [
      { name: 'center', leadScale: 1 },
      { name: 'short', leadScale: 0.65 },
      { name: 'long', leadScale: 1.35 }
    ];
    const weights = behavior?.probeWeights || { center: 0.6, short: 0.45, long: 0.45 };
    const weighted = hypotheses.slice().sort((a, b) => Number(weights[b.name] || 0.5) - Number(weights[a.name] || 0.5));
    const shotIndex = Math.max(0, Math.round(Number(options.actualShots || 0)));
    const learnedAlternative = weighted[0].name !== 'center'
      && Number(weights[weighted[0].name] || 0.45) >= Number(weights.center || 0.6) + 0.1;
    const exploreAlternative = noDamageLevel >= 8 && shotIndex % 4 === 3;
    const picked = learnedAlternative
      ? weighted[0]
      : (exploreAlternative ? hypotheses[1 + (Math.floor(shotIndex / 4) % 2)] : hypotheses[0]);
    x = tx + baseLeadX * responseLeadScale * picked.leadScale;
    y = ty + baseLeadY * responseLeadScale * picked.leadScale;
    motionProbe = {
      hypothesis: picked.name,
      leadScale: picked.leadScale,
      weights: {
        center: Number(weights.center || 0.5),
        short: Number(weights.short || 0.5),
        long: Number(weights.long || 0.5)
      },
      candidates: hypotheses.map(item => ({
        hypothesis: item.name,
        leadScale: item.leadScale,
        x: Math.round(tx + baseLeadX * responseLeadScale * item.leadScale),
        y: Math.round(ty + baseLeadY * responseLeadScale * item.leadScale)
      }))
    };
  }
  let routeCoverage = null;
  const targetSpeed = Math.max(1, Math.hypot(vx, vy));
  const stamina5s = numberOrNull(self.stamina_5s_remaining_milli ?? self.stamina5sRemainingMilli);
  const dodgeReserve = Math.max(1200, Number(options.combatShootDodgeReserveMs || COMBAT_CONSTANTS.SHOOT_DODGE_RESERVE_MS));
  const coverageAffordable = stamina5s === null || stamina5s >= dodgeReserve + 1500;
  const controlStyle = behavior?.dimensions?.controlStyle?.state || 'unknown';
  const controlStyleConfidence = Number(behavior?.dimensions?.controlStyle?.confidence || 0);
  const highEntropyCoverage = (controlStyle === 'human-like'
    && controlStyleConfidence >= 0.35)
    || (profile.maneuverScale >= 0.45 && noDamageWidened);
  const dynamicBehaviorCoverage = dynamicBehaviorTrajectoryEligibilityCore(behavior);
  const transitionModel = behavior?.metrics?.movementTransitions || null;
  const routePhase = behavior?.metrics?.movementPhase || transitionModel?.phase || null;
  const routeContextKey = transitionModel?.contextKey
    || movementRouteContextKeyCore(behavior || { mode: 'mixed/unknown' }, distance, routePhase || {});
  const routeLearning = options.decisionState?.combatLearning || options.stateful?.combatLearning || null;
  const scriptTransitionCoverage = Boolean(
    ['periodic-script', 'reactive-script'].includes(controlStyle)
      && controlStyleConfidence >= 0.35
      && Number(transitionModel?.transitionCount || 0) >= 4
      && Number(transitionModel?.next?.[0]?.probability || 0) >= 0.5
  );
  let arrivalOccupancyApplied = false;
  if (trajectoryAware && creationOracle.reachable === true) {
    const restartVx = Number(arrivalOccupancy.restartDirection?.vx || 0);
    const restartVy = Number(arrivalOccupancy.restartDirection?.vy || 0);
    const restartSpeed = Math.hypot(restartVx, restartVy);
    const directionSpeed = moving ? targetSpeed : Math.max(1, restartSpeed);
    const ux = moving ? vx / directionSpeed : restartVx / directionSpeed;
    const uy = moving ? vy / directionSpeed : restartVy / directionSpeed;
    const targetAtCreationX = Number(intercept?.predictedTargetAtCreation?.x ?? tx + vx * observationToExecutionTicks);
    const targetAtCreationY = Number(intercept?.predictedTargetAtCreation?.y ?? ty + vy * observationToExecutionTicks);
    const reachable = directionSpeed * flightTicks;
    const restartTravelTicks = Math.max(0, flightTicks - Number(arrivalOccupancy.remainingStopTicks || 0));
    const restartReachable = restartSpeed * restartTravelTicks;
    const uncertainDynamicRoute = highEntropyCoverage || dynamicBehaviorCoverage || arrivalOccupancyActive;
    const arrivalProbability = Math.max(0.18, Math.min(0.65, Number(arrivalOccupancy.restartProbability || 0.18)));
    const movingStopCandidate = arrivalOccupancyActive
      ? { hypothesis: 'arrival-occupancy', x: targetAtCreationX, y: targetAtCreationY, probability: arrivalProbability }
      : { hypothesis: 'stop', x: targetAtCreationX, y: targetAtCreationY, probability: uncertainDynamicRoute ? 0.29 : 0.14 };
    const movingCandidates = [
      { hypothesis: 'continue', x: intercept?.x ?? targetAtCreationX + ux * reachable, y: intercept?.y ?? targetAtCreationY + uy * reachable, probability: arrivalOccupancyActive ? Math.max(0.22, 1 - arrivalProbability) : (uncertainDynamicRoute ? 0.27 : 0.58) },
      movingStopCandidate,
      { hypothesis: 'left-turn', x: targetAtCreationX - uy * reachable, y: targetAtCreationY + ux * reachable, probability: uncertainDynamicRoute ? 0.16 : 0.09 },
      { hypothesis: 'right-turn', x: targetAtCreationX + uy * reachable, y: targetAtCreationY - ux * reachable, probability: uncertainDynamicRoute ? 0.16 : 0.09 },
      { hypothesis: 'reverse', x: targetAtCreationX - ux * reachable, y: targetAtCreationY - uy * reachable, probability: 0.12 }
    ];
    const stationaryCandidates = [
      { hypothesis: 'stop-at-arrival', x: targetAtCreationX, y: targetAtCreationY, probability: Math.max(0.35, 1 - arrivalProbability) },
      {
        hypothesis: 'restart-after-stop',
        x: targetAtCreationX + (restartSpeed > 0 ? restartVx / restartSpeed * restartReachable : 0),
        y: targetAtCreationY + (restartSpeed > 0 ? restartVy / restartSpeed * restartReachable : 0),
        probability: arrivalProbability * 0.7
      },
      {
        hypothesis: 'restart-reverse',
        x: targetAtCreationX - (restartSpeed > 0 ? restartVx / restartSpeed * restartReachable : 0),
        y: targetAtCreationY - (restartSpeed > 0 ? restartVy / restartSpeed * restartReachable : 0),
        probability: arrivalProbability * 0.3
      }
    ];
    const staticCandidates = (moving ? movingCandidates : stationaryCandidates).map(candidate => ({
      ...candidate,
      directionState: movementDirectionState(
        ['stop', 'arrival-occupancy', 'stop-at-arrival'].includes(candidate.hypothesis) ? 0 : Number(candidate.x) - tx,
        ['stop', 'arrival-occupancy', 'stop-at-arrival'].includes(candidate.hypothesis) ? 0 : Number(candidate.y) - ty,
        0.001
      )
    }));
    const conditionalSamples = Math.max(0, Number(transitionModel?.conditionalSampleCount || 0));
    const conditionalEvidenceReady = conditionalSamples >= (highEntropyCoverage ? 12 : 3);
    const localSource = conditionalEvidenceReady
      ? transitionModel.conditionalNext
      : (highEntropyCoverage ? [] : transitionModel?.next);
    const localSamples = conditionalEvidenceReady
      ? conditionalSamples
      : (highEntropyCoverage ? 0 : Math.max(0, Number(transitionModel?.transitionCount || 0)));
    const localDistribution = new Map((localSource || []).map(item => [String(item.state), Number(item.probability || 0)]));
    const globalCell = routeLearning?.routeTransitions?.[routeContextKey] || null;
    const globalRows = normalizedOutcomeDistribution(globalCell, 8);
    const globalDistribution = new Map(globalRows.map(item => [String(item.state), Number(item.probability || 0)]));
    const candidateByDirection = new Map(staticCandidates.map(candidate => [candidate.directionState, candidate]));
    for (const learned of [...(localSource || []), ...globalRows]) {
      const state = String(learned.state || '');
      if (!state || candidateByDirection.has(state)) continue;
      const vector = movementDirectionVector(state);
      candidateByDirection.set(state, {
        hypothesis: `route-${state}`,
        directionState: state,
        x: state === 'stop' ? targetAtCreationX : targetAtCreationX + vector.x * reachable,
        y: state === 'stop' ? targetAtCreationY : targetAtCreationY + vector.y * reachable,
        probability: 0.04
      });
    }
    const localWeight = Math.min(3, localSamples / 4);
    const globalWeight = Math.min(4, Math.max(0, Number(globalCell?.samples || 0)) / 12);
    const creationOrigin = creationOracle.predictedShooterOrigin || fallbackPredictedShooterOrigin;
    let candidates = Array.from(candidateByDirection.values()).map(candidate => {
      const localProbability = Number(localDistribution.get(candidate.directionState) || 0);
      const globalProbability = Number(globalDistribution.get(candidate.directionState) || 0);
      const priorProbability = Number(candidate.probability || 0);
      const rawProbability = (priorProbability + localProbability * localWeight + globalProbability * globalWeight)
        / Math.max(1, 1 + localWeight + globalWeight);
      const feedback = routeLearning?.routeAimFeedback?.[routeFeedbackKey(routeContextKey, candidate.hypothesis)] || null;
      const feedbackSamples = Math.max(0, Number(feedback?.samples || 0));
      const targetMotionReachable = Math.hypot(
        Number(candidate.x) - targetAtCreationX,
        Number(candidate.y) - targetAtCreationY
      ) <= Math.max(reachable, restartReachable) + hitRadius + 1;
      const aimPointReachability = targetMotionReachable
        ? evaluateAimPointReachabilityCore(creationOrigin, candidate, {
            bulletSpeedCmPerTick: bulletSpeed,
            bulletRangeCm: bulletRange,
            bulletLifetimeTicks,
            hitRadiusCm: hitRadius
          })
        : { reachable: false, reason: 'target-motion-out-of-horizon' };
      return {
        ...candidate,
        priorProbability,
        localTransitionProbability: localProbability,
        globalTransitionProbability: globalProbability,
        localTransitionSamples: localSamples,
        globalTransitionSamples: Math.max(0, Number(globalCell?.samples || 0)),
        learnedHitRate: feedbackSamples >= 4
          ? Math.max(0.02, Math.min(0.98, (Number(feedback?.hits || 0) + 1) / (feedbackSamples + 3)))
          : null,
        learnedMeanMissCm: feedbackSamples >= 4
          ? Number(feedback?.missTotalCm || 0) / Math.max(1, feedbackSamples)
          : null,
        feedbackSamples,
        probability: Math.max(0.001, rawProbability),
        shotStaminaCost: Math.max(1, Number(options.combatShotStaminaCostMs ?? 500)),
        uncertaintyCm: Math.round(targetSpeed * leadTicks * Math.max(0.1, 1 - rawProbability)),
        physicallyReachable: aimPointReachability.reachable === true,
        reachabilityReason: aimPointReachability.reason,
        reachabilityDistanceCm: numberOrNull(aimPointReachability.distanceCm)
      };
    });
    const probabilityTotal = candidates.reduce((sum, candidate) => sum + Number(candidate.probability || 0), 0);
    candidates = candidates.map(candidate => ({
      ...candidate,
      probability: probabilityTotal > 0 ? Number(candidate.probability || 0) / probabilityTotal : 0
    }));
    const robustTrajectorySelection = profile.sampleCount >= 4
      ? selectRobustTrajectoryAimCore({
          targetId: combatTargetId(target),
          createdTick: Number(options.observedTick || 0) + observationToExecutionTicks,
          executionDelayTicks: observationToExecutionTicks,
          controlIntervalTicks: Math.max(1, Math.ceil(Number(options.combatControlIntervalMs || 50) / 50)),
          learnedDwellTicks: moving ? 0 : Number(arrivalOccupancy.remainingStopTicks || 0),
          flightTicks,
          predictedShooterOrigin: creationOrigin,
          predictedTargetAtCreation: creationOracle.predictedTargetAtCreation || fallbackPredictedTargetAtCreation,
          baselineAim: { x, y },
          target,
          routeCandidates: candidates
        }, {
          bulletSpeedCmPerTick: bulletSpeed,
          bulletLifetimeTicks,
          bulletRangeCm: bulletRange,
          hitRadiusCm: hitRadius,
          maxRouteClusters: 4,
          maxShotCandidates: 12,
          maxTrajectoryTicks: trajectoryHorizonTicks
        })
      : null;
    const robustSelected = robustTrajectorySelection?.selected || null;
    const robustCandidateAvailable = Boolean(robustSelected
      && robustSelected.physicallyReachable === true
      && profile.sampleCount >= 4);
    const robustApplied = Boolean(robustCandidateAvailable
      && robustSelected.improvementQualified === true);
    const routePriorHypothesis = {
      'charge-close': 'continue',
      'steady-linear': 'stop',
      'zigzag-strafe': 'stop',
      'retreat-kite': 'stop',
      'pressure-shooter': 'stop'
    }[String(behavior?.mode || '')] || '';
    const routePriorCandidate = routePriorHypothesis
      ? candidates.find(candidate => candidate.hypothesis === routePriorHypothesis
        && candidate.physicallyReachable === true)
      : null;
    const shotIndex = Math.max(0, Math.round(Number(options.actualShots || 0)));
    const selectableCandidates = candidates.filter(candidate => candidate.physicallyReachable === true);
    const rankedCandidates = selectableCandidates.slice().sort((a, b) => b.probability - a.probability
      || String(a.hypothesis || '').localeCompare(String(b.hypothesis || '')));
    const primaryCandidate = rankedCandidates[0] || null;
    const explorationCandidate = rankedCandidates[1] || null;
    const highEntropyExplore = Boolean(highEntropyCoverage && noDamageLevel >= 12 && shotIndex % 5 === 4 && explorationCandidate);
    const preferredTurn = rankedCandidates
      .filter(candidate => candidate.hypothesis === 'left-turn' || candidate.hypothesis === 'right-turn')
      .sort((a, b) => b.probability - a.probability || a.hypothesis.localeCompare(b.hypothesis))[0] || null;
    const routeSelectionMode = normalizedDynamicRouteSelectionMode(options.trajectoryRouteSelectionMode);
    const legacyDynamicCoverageSequence = dynamicBehaviorCoverage
      ? ['continue', 'stop', preferredTurn?.hypothesis, 'reverse']
          .map(hypothesis => candidates.find(candidate => candidate.hypothesis === hypothesis))
          .filter(Boolean)
      : [];
    const dynamicSelection = dynamicBehaviorCoverage && routeSelectionMode !== 'legacy-fixed'
      ? selectDynamicRouteCandidateCore(candidates, {
          acceptedShotIndex: shotIndex,
          predictionHorizonTicks: leadTicks,
          sequencePhase: options.combatDynamicRouteSequencePhase,
          explorationInterval: options.combatDynamicRouteExplorationInterval,
          explorationLimit: options.combatDynamicRouteExplorationLimit
        })
      : null;
    const coverageSequence = dynamicBehaviorCoverage
      ? (routeSelectionMode === 'legacy-fixed'
          ? legacyDynamicCoverageSequence
          : dynamicSelection?.ranked || [])
      : (highEntropyCoverage
          ? [primaryCandidate, ...(highEntropyExplore ? [explorationCandidate] : [])].filter(Boolean)
          : rankedCandidates.slice(0, 2));
    let selected = dynamicBehaviorCoverage
      ? (routeSelectionMode === 'legacy-fixed'
          ? coverageSequence[shotIndex % Math.max(1, coverageSequence.length)]
          : dynamicSelection?.selected || null)
      : (highEntropyCoverage
          ? (highEntropyExplore ? explorationCandidate : primaryCandidate)
          : coverageSequence[shotIndex % coverageSequence.length]);
    if (robustCandidateAvailable && !robustApplied) selected = null;
    let stopRouteRejected = false;
    if (robustApplied) {
      // A currently moving target is not a stationary-target observation just
      // because the bounded route solver found a geometrically valid stop
      // shot.  Keep stop as a diagnostic hypothesis, but never let it become
      // the final wire aim while realtime velocity still proves movement.
      stopRouteRejected = movingTargetStopRouteRejectedCore({
        hypothesis: robustSelected.hypothesis,
        moving,
        targetSpeed
      }, { stationarySpeed });
      const robustAim = stopRouteRejected
        ? null
        : robustSelected;
      if (!robustAim) {
        selected = null;
      }
      const routeCandidate = candidates.find(candidate => (
        robustAim && String(candidate.hypothesis || '') === String(robustAim.hypothesis || '')
      ));
      // The route prior is an explanatory prior only. It is not proof that a
      // moving target will occupy that point at bullet arrival; robust
      // trajectory selection owns the wire aim.
      const selectedRoute = routeCandidate;
      if (robustAim) {
        selected = {
          ...(selectedRoute || {}),
          hypothesis: selectedRoute?.hypothesis || robustAim.hypothesis,
          variant: robustAim.variant,
          x: robustAim.aimX,
          y: robustAim.aimY,
          interceptTick: robustAim.interceptTick,
          radialGapCm: robustAim.radialGapCm,
          routeProbability: robustAim.routeProbability,
          routePriorHypothesis,
          routePriorCandidateAvailable: Boolean(routePriorCandidate),
          stopRouteRejected,
          robustTrajectorySelection
        };
        x = selected.x;
        y = selected.y;
        arrivalOccupancyApplied = arrivalOccupancyActive && [
          'arrival-occupancy',
          'stop-at-arrival',
          'restart-after-stop',
          'restart-reverse'
        ].includes(String(selected.hypothesis || ''));
      }
    }
    if (selected
      && movingTargetStopRouteRejectedCore({
        hypothesis: selected.hypothesis,
        moving,
        targetSpeed
      }, { stationarySpeed })) {
      const nonStopFallback = [
        ...(dynamicSelection?.ranked || []),
        ...rankedCandidates,
        ...candidates
      ].find(candidate => (
        candidate
          && String(candidate.hypothesis || '') !== 'stop'
          && candidate.physicallyReachable === true
      ));
      stopRouteRejected = true;
      if (nonStopFallback) {
        selected = {
          ...nonStopFallback,
          variant: nonStopFallback.variant || 'route-candidate-fallback',
          routePriorHypothesis,
          routePriorCandidateAvailable: Boolean(routePriorCandidate),
          stopRouteRejected
        };
        x = Number(selected.x);
        y = Number(selected.y);
      } else {
        selected = null;
      }
    }
    if (selected && (robustApplied || dynamicBehaviorCoverage || highEntropyCoverage || noDamageWidened || scriptTransitionCoverage)) {
      const persistedCandidates = dynamicBehaviorCoverage ? coverageSequence.slice(0, 4) : rankedCandidates.slice(0, 4);
      routeCoverage = {
        enabled: true,
        style: robustApplied
          ? (arrivalOccupancyApplied
              ? `arrival-occupancy-${String(selected.hypothesis || 'candidate').replace(/^arrival-occupancy(?:-)?/, '') || 'candidate'}`
              : `robust-trajectory-medoid-${behavior?.mode || 'moving'}`)
          : dynamicBehaviorCoverage
          ? (routeSelectionMode === 'legacy-fixed'
              ? `dynamic-behavior-legacy-fixed-${behavior.mode}`
              : `dynamic-behavior-weighted-${behavior.mode}`)
          : (highEntropyCoverage
              ? (highEntropyExplore ? 'high-entropy-bounded-exploration' : 'high-entropy-robust-stop')
              : (scriptTransitionCoverage ? 'script-transition-matrix' : 'predictable-top-routes')),
        dynamicBehaviorEligible: dynamicBehaviorCoverage,
        selected: selected.hypothesis,
        sequence: coverageSequence.map(item => item.hypothesis),
        selection: dynamicBehaviorCoverage ? {
          mode: routeSelectionMode === 'legacy-fixed'
            ? 'legacy-fixed'
            : (dynamicSelection?.selectionMode || 'weighted-sample'),
          explorationInterval: routeSelectionMode === 'legacy-fixed'
            ? null
            : dynamicSelection?.explorationInterval ?? null,
          explorationLimit: routeSelectionMode === 'legacy-fixed'
            ? null
            : dynamicSelection?.explorationLimit ?? null,
          explorationOrdinal: routeSelectionMode === 'legacy-fixed'
            ? null
            : dynamicSelection?.explorationOrdinal ?? null,
          explorationAllowed: routeSelectionMode === 'legacy-fixed'
            ? false
            : Boolean(dynamicSelection?.explorationAllowed),
          explorationCountRemaining: routeSelectionMode === 'legacy-fixed'
            ? null
            : dynamicSelection?.explorationCountRemaining ?? null,
          acceptedShotIndex: shotIndex
        } : null,
        contextKey: routeContextKey,
        phase: routePhase,
        arrivalOccupancy,
        stopRouteRejected,
        candidates: persistedCandidates.map(item => ({
          hypothesis: item.hypothesis,
          probability: item.probability,
          directionState: item.directionState || null,
          priorProbability: item.priorProbability,
          localTransitionProbability: item.localTransitionProbability,
          globalTransitionProbability: item.globalTransitionProbability,
          localTransitionSamples: item.localTransitionSamples,
          globalTransitionSamples: item.globalTransitionSamples,
          learnedHitRate: item.learnedHitRate,
          learnedMeanMissCm: item.learnedMeanMissCm,
          feedbackSamples: item.feedbackSamples,
          selectionWeight: Number.isFinite(Number(item.selectionWeight))
            ? Number(Number(item.selectionWeight).toFixed(6))
            : null,
          shotStaminaCost: item.shotStaminaCost,
          uncertaintyCm: item.uncertaintyCm,
          x: Math.round(item.x),
          y: Math.round(item.y),
          physicallyReachable: item.physicallyReachable === true,
          reachabilityReason: item.reachabilityReason || '',
          reachabilityDistanceCm: item.reachabilityDistanceCm
        })),
        robustTrajectorySelection: robustApplied ? robustTrajectorySelection : null,
        movementTransition: {
          currentState: transitionModel?.currentState || null,
          contextKey: routeContextKey,
          phase: routePhase,
          transitionCount: Number(transitionModel?.transitionCount || 0),
          confidence: Number(transitionModel?.confidence || 0),
          conditionalSampleCount: Number(transitionModel?.conditionalSampleCount || 0),
          next: (localSource || []).slice(0, 4),
          globalSamples: Math.max(0, Number(globalCell?.samples || 0)),
          globalNext: globalRows.slice(0, 4)
        }
      };
      motionProbe = {
        ...(motionProbe || {}),
        hypothesis: selected.hypothesis,
        routeCoverage: true,
        candidates: routeCoverage.candidates
      };
    }
  }
  const creationAimPoint = creationOracle.interceptPoint || (intercept
    ? { x: intercept.x, y: intercept.y }
    : null);
  let evasiveAim = null;
  const evasiveExperiment = combatTargetState?.evasiveAimExperiment || null;
  if (creationOracle.reachable === true
    && creationAimPoint
    && evasiveExperiment?.active === true) {
    const evasivePredictions = predictEvasiveAimAngles(EVASIVE_AIM_MODEL, {
      motionSamples: samples,
      observedTick: options.observedTick,
      executionDelayTicks: observationToExecutionTicks,
      flightTicks,
      targetVelocity: { vx, vy },
      shooterVelocity: { vx: shooterVx, vy: shooterVy },
      predictedShooterOrigin: creationOracle.predictedShooterOrigin || fallbackPredictedShooterOrigin,
      predictedTargetAtCreation: creationOracle.predictedTargetAtCreation || fallbackPredictedTargetAtCreation
    });
    const candidate = applyEvasiveAimStrategyCore({ x, y }, evasiveExperiment, evasivePredictions, {
      baselineAim: creationAimPoint,
      predictedShooterOrigin: creationOracle.predictedShooterOrigin || fallbackPredictedShooterOrigin,
      predictedTargetAtCreation: creationOracle.predictedTargetAtCreation || fallbackPredictedTargetAtCreation,
      acceptedShots: options.actualShots
    }, {
      maximumCreationDistanceCm: EVASIVE_AIM_MODEL.training.maximumCreationDistanceCm
    });
    if (candidate.applied === true) {
      x = Number(candidate.x);
      y = Number(candidate.y);
      routeCoverage = null;
      motionProbe = {
        hypothesis: `evasive-aim:${candidate.strategy}`,
        evasiveAim: true
      };
    }
    evasiveAim = {
      active: true,
      applied: candidate.applied === true,
      reason: candidate.reason,
      modelVersion: evasiveExperiment.modelVersion,
      strategy: evasiveExperiment.strategy,
      triggerReason: evasiveExperiment.triggerReason,
      triggeredAt: evasiveExperiment.triggeredAt,
      offsetDeg: numberOrNull(candidate.offsetDeg),
      baselineAngleDeg: numberOrNull(candidate.baselineAngleDeg),
      baselineAimX: numberOrNull(candidate.baselineAimX),
      baselineAimY: numberOrNull(candidate.baselineAimY),
      creationDistanceCm: numberOrNull(candidate.creationDistanceCm),
      linearAngleDeg: numberOrNull(candidate.linearAngleDeg ?? evasivePredictions.linearAngleDeg),
      knnAngleDeg: numberOrNull(candidate.knnAngleDeg ?? evasivePredictions.knnAngleDeg),
      fusionAngleDeg: numberOrNull(candidate.fusionAngleDeg ?? evasivePredictions.fusionAngleDeg),
      routerAngleDeg: numberOrNull(candidate.routerAngleDeg ?? evasivePredictions.routerAngleDeg),
      disagreementDeg: numberOrNull(candidate.disagreementDeg ?? evasivePredictions.disagreementDeg),
      predictionsReady: evasivePredictions.ok === true
    };
  } else if (evasiveExperiment) {
    evasiveAim = {
      active: evasiveExperiment.active === true,
      applied: false,
      reason: evasiveExperiment.active === true ? 'creation-intercept-unavailable' : 'experiment-inactive',
      modelVersion: evasiveExperiment.modelVersion,
      strategy: evasiveExperiment.strategy,
      triggerReason: evasiveExperiment.triggerReason,
      triggeredAt: evasiveExperiment.triggeredAt,
      offsetDeg: null,
      baselineAngleDeg: null,
      baselineAimX: null,
      baselineAimY: null,
      creationDistanceCm: null,
      linearAngleDeg: null,
      knnAngleDeg: null,
      fusionAngleDeg: null,
      routerAngleDeg: null,
      disagreementDeg: null,
      predictionsReady: false
    };
  }
  const hasTrajectoryCandidates = Boolean(routeCoverage?.candidates?.length);
  let trajectoryAimProof = trajectoryAware
    ? evaluateRealtimeTrajectoryAim({
        ok: true,
        x,
        y,
        flightTicks,
        predictedShooterOrigin: creationOracle.predictedShooterOrigin || fallbackPredictedShooterOrigin,
        predictedTargetAtCreation: creationOracle.predictedTargetAtCreation || fallbackPredictedTargetAtCreation,
        routeCoverage,
        timing: {
          createdTickEstimate: numberOrNull(options.observedTick) === null
            ? null
            : Number(options.observedTick) + observationToExecutionTicks,
          executionDelayTicks: observationToExecutionTicks
        }
      }, options)
    : {
        valid: true,
        reason: 'static-target',
        pathCount: 0,
        matchedPathCount: 0,
        hardCoverageMass: 1,
        minMissCm: 0,
        expectedMissCm: 0,
        hitRadiusCm: hitRadius
      };
  let trajectoryAimFallback = false;
  let trajectoryAimFallbackReason = '';
  if (!evasiveAim?.applied
    && trajectoryAware
    && creationAimPoint
    && (!hasTrajectoryCandidates || trajectoryAimProof.valid !== true)) {
    const changedAim = Math.hypot(
      Number(x) - Number(creationAimPoint.x),
      Number(y) - Number(creationAimPoint.y)
    ) > 1;
    x = Number(creationAimPoint.x);
    y = Number(creationAimPoint.y);
    trajectoryAimFallback = changedAim;
    trajectoryAimFallbackReason = !hasTrajectoryCandidates
      ? (arrivalOccupancyActive ? 'no-arrival-occupancy-paths' : 'no-dynamic-trajectory-evidence')
      : (trajectoryAimProof.reason || 'dynamic-cpa-unproven');
    trajectoryAimProof = evaluateRealtimeTrajectoryAim({
      ok: true,
      x,
      y,
      flightTicks,
      predictedShooterOrigin: creationOracle.predictedShooterOrigin || fallbackPredictedShooterOrigin,
      predictedTargetAtCreation: creationOracle.predictedTargetAtCreation || fallbackPredictedTargetAtCreation,
      routeCoverage,
      timing: {
        createdTickEstimate: numberOrNull(options.observedTick) === null
          ? null
          : Number(options.observedTick) + observationToExecutionTicks,
        executionDelayTicks: observationToExecutionTicks
      }
    }, options);
  }
  const finalAimPointReachability = evaluateAimPointReachabilityCore(
    creationOracle.predictedShooterOrigin || fallbackPredictedShooterOrigin,
    { x, y },
    {
      bulletSpeedCmPerTick: bulletSpeed,
      bulletRangeCm: bulletRange,
      bulletLifetimeTicks,
      hitRadiusCm: hitRadius
    }
  );
  if (creationOracle.reachable !== true || finalAimPointReachability.reachable !== true) {
    fireReachability.reachable = false;
    fireReachability.feasible = false;
    fireReachability.unreachable = true;
    fireReachability.reason = creationOracle.reachable !== true
      ? creationOracle.reason
      : finalAimPointReachability.reason;
  }
  fireReachability.actualAimPoint = {
    x: Math.round(x),
    y: Math.round(y),
    ...finalAimPointReachability
  };
  fireReachability.trajectoryAimProof = trajectoryAimProof;
  fireReachability.trajectoryAimFallback = trajectoryAimFallback;
  fireReachability.trajectoryAimFallbackReason = trajectoryAimFallbackReason;
  const leadDistance = distanceBetween({ x: tx, y: ty }, { x, y });
  const confidence = Math.max(0.2, Math.min(1, (moving ? Number(intercept?.confidence || 0.55) * profile.aimConfidenceScale : 1) - Math.min(0.25, noDamageLevel * 0.04)));
  if (routeCoverage?.candidates?.length) {
    routeCoverage.candidates = routeCoverage.candidates.map(candidate => {
      const calibratedAimConfidence = candidate.learnedHitRate === null
        ? confidence
        : Math.max(0.02, Math.min(1, confidence * 0.5 + Number(candidate.learnedHitRate) * 0.5));
      return {
        ...candidate,
        aimConfidence: calibratedAimConfidence,
        expectedHitProbability: Math.max(0, Math.min(1, Number(candidate.probability || 0) * calibratedAimConfidence))
      };
    });
  }
  return {
    ok: true,
    x: Math.round(x),
    y: Math.round(y),
    mode: moving
      ? (arrivalOccupancyApplied
          ? `arrival-occupancy-${String(routeCoverage?.selected || 'candidate').replace(/^arrival-occupancy(?:-)?/, '') || 'candidate'}`
          : (intercept ? (noDamageWidened ? 'quadratic-intercept-motion-probe' : 'quadratic-intercept') : 'relative-linear-intercept-fallback'))
      : (arrivalOccupancyApplied
          ? `arrival-occupancy-${String(routeCoverage?.selected || 'candidate').replace(/^arrival-occupancy(?:-)?/, '') || 'candidate'}`
          : 'exact'),
    distance: Math.round(distance),
    intercept: moving,
    flightTicks: Math.round(flightTicks * 10) / 10,
    observationToExecutionTicks,
    leadDistance: Math.round(leadDistance),
    confidence,
    motionScale: Math.round(motionScale * 1000) / 1000,
    noDamageMs: Math.round(noDamageMs),
    noDamageLevel,
    noDamageWidened,
    successfulAimProtection,
    spreadScale: noDamageWidened ? Math.round((1 + Math.min(1, noDamageLevel * 0.2)) * 100) / 100 : 1,
    opponentProfile: profile,
    opponentBehavior: behavior ? {
      mode: behavior.mode,
      confidence: behavior.confidence,
      responsePolicy: behavior.responsePolicy
    } : null,
    responsePolicy,
    routeCoverage,
    fireRiskClassification: {
      ...fireRiskClassification,
      coverageAffordable,
      affordabilityDegraded: !coverageAffordable,
      routeCoverageAvailable: Boolean(routeCoverage)
    },
    predictedShooterOrigin: intercept?.predictedShooterOrigin || fallbackPredictedShooterOrigin,
    predictedTargetAtCreation: intercept?.predictedTargetAtCreation || fallbackPredictedTargetAtCreation,
    relativeExecutionDisplacement: intercept?.relativeExecutionDisplacement || {
      x: (vx - shooterVx) * observationToExecutionTicks,
      y: (vy - shooterVy) * observationToExecutionTicks
    },
    fireReachability,
    trajectoryAimProof,
    trajectoryAimFallback,
    trajectoryAimFallbackReason,
    arrivalOccupancy,
    evasiveAim,
    ackShooterOrigin: options.latestConfirmedShot?.ackShooterOrigin || null,
    shooterOriginErrorCm: numberOrNull(options.latestConfirmedShot?.shooterOriginErrorCm),
    shooterOriginErrorSummary: options.shooterOriginErrorSummary || null,
    targetPredictionErrorCm: null,
    totalCorridorMissCm: null,
    timing: {
      observedTick: numberOrNull(options.observedTick),
      createdTickEstimate: numberOrNull(options.observedTick) === null
        ? null
        : Number(options.observedTick) + observationToExecutionTicks,
      executionDelayTicks: observationToExecutionTicks,
      delaySource: confirmedTimingSamples > 0
        ? timingSource
        : (unmeasuredDelayProtection
            ? (finishProtection ? 'low-hp-finish-protection' : 'proven-hit-rate-protection')
            : timingSource),
      confirmedTimingSamples,
      rollingMedianTicks: timingMedian,
      rollingP90Ticks: Number.isFinite(Number(timing.p90Ticks)) ? Number(timing.p90Ticks) : 5,
      rollingMadTicks: timingMad
    },
    motionProbe
  };
}

function targetRecedingFromSelf(self, target) {
  const vx = Number(target?.vx || 0);
  const vy = Number(target?.vy || 0);
  if (!self || !target || (!vx && !vy)) return false;
  const rx = Number(target.x) - Number(self.x);
  const ry = Number(target.y) - Number(self.y);
  return (rx * vx + ry * vy) > 0;
}

function movementTangentPreference(self, target) {
  if (!self || !target) return null;
  const baseX = Number(target.x) - Number(self.x);
  const baseY = Number(target.y) - Number(self.y);
  if (!baseX && !baseY) return null;
  const sign = Number(target.vx || 0) || Number(target.vy || 0) ? 1 : -1;
  return {
    dx: Math.sign(-baseY * sign),
    dy: Math.sign(baseX * sign)
  };
}

function passiveRunnerState(self, target, combatTargetState = {}, options = {}) {
  if (!self || !target) return { active: false };
  const selfHp = hpValue(self) ?? 100;
  const engagedMs = Math.max(0, Number(options.nowMs || Date.now()) - Number(combatTargetState?.firstSeenAt || combatTargetState?.at || options.nowMs || Date.now()));
  const confirmMs = Math.max(0, Number(options.combatPassiveRunnerConfirmMs ?? COMBAT_CONSTANTS.PASSIVE_RUNNER_CONFIRM_MS));
  const seenTargetRealBulletAt = Number(combatTargetState?.lastIncomingBulletAt || combatTargetState?.seenTargetRealBulletAt || 0);
  const seenTargetRealBulletMs = seenTargetRealBulletAt > 0
    ? Math.max(0, Number(options.nowMs || Date.now()) - seenTargetRealBulletAt)
    : null;
  const threatTtlMs = Math.max(1000, Number(options.combatThreatEvidenceTtlMs ?? 30000));
  const persistentThreat = Boolean(
    combatTargetState?.hasDamagedSelf
      || (Number(combatTargetState?.lastThreatAt || 0) > 0
        && Number(options.nowMs || Date.now()) - Number(combatTargetState.lastThreatAt) <= threatTtlMs)
  );
  const active = Boolean(
    entityDropValue(target) > 0
      && target.moving
      && !target.firing
      && selfHp >= Math.max(1, Number(options.combatPassiveRunnerMinSelfHp || 80))
      && seenTargetRealBulletAt <= 0
      && !persistentThreat
      && engagedMs >= confirmMs
  );
  return {
    active,
    engagedMs: Math.round(engagedMs),
    confirmMs,
    seenTargetRealBulletMs,
    persistentThreat,
    reason: 'passive-runner'
  };
}

function buildCombatExitEvaluation(self, target, combatTargetState = {}, options = {}, combatMetrics = null) {
  if (!self || !target) {
    return { exit: null, baselineExit: null, disadvantageObservation: null };
  }
  const immediateHpExit = evaluateCombatHpExitCore({ self, target }, options);
  if (target.easyKillThreatExempt && immediateHpExit?.rule !== 'critical-hp') {
    return { exit: null, baselineExit: null, disadvantageObservation: null };
  }
  const noDamageMs = Math.max(0, Number(combatTargetState?.noDamageMs || 0));
  const evaluation = evaluateConfirmedCombatHpExitCore({
    self,
    target,
    nowMs: options.nowMs,
    disadvantageSinceAt: combatTargetState?.disadvantageSinceAt,
    combatStartedAt: combatTargetState?.firstSeenAt ?? combatTargetState?.at,
    sampleCount: combatTargetState?.disadvantageSamples,
    confirmedSelfDamage: Math.max(
      Number((combatMetrics || combatTargetState?.combatMetrics)?.selfDamage || 0),
      target.easyKillDamagedToday ? 1 : 0
    )
  }, options);
  const nowMs = Number(options.nowMs || Date.now());
  const samples = Array.isArray(combatTargetState?.motionSamples) ? combatTargetState.motionSamples : [];
  let shortFirst = null;
  let shortLast = null;
  let shortPrevious = null;
  let shortDamageObservations = 0;
  let longFirst = null;
  let longLast = null;
  let longPrevious = null;
  let longDamageObservations = 0;
  let recentThreatBulletCount = 0;
  for (const sample of samples) {
    const sampleAgeMs = nowMs - Number(sample.at || 0);
    if (sampleAgeMs <= 45000) {
      if (!longFirst) longFirst = sample;
      if (longPrevious
        && (Number(sample.selfHp) < Number(longPrevious.selfHp)
          || Number(sample.targetHp) < Number(longPrevious.targetHp))) longDamageObservations += 1;
      longPrevious = sample;
      longLast = sample;
    }
    if (sampleAgeMs <= 10000) {
      if (!shortFirst) shortFirst = sample;
      if (shortPrevious
        && (Number(sample.selfHp) < Number(shortPrevious.selfHp)
          || Number(sample.targetHp) < Number(shortPrevious.targetHp))) shortDamageObservations += 1;
      shortPrevious = sample;
      shortLast = sample;
    }
    if (sampleAgeMs <= 3000 && sample.realBulletPressure) recentThreatBulletCount += 1;
  }
  const shortSelfDamage = shortFirst && shortLast
    ? Math.max(0, Number(shortFirst.selfHp || 0) - Number(shortLast.selfHp || 0))
    : 0;
  const shortTargetDamage = shortFirst && shortLast
    ? Math.max(0, Number(shortFirst.targetHp || 0) - Number(shortLast.targetHp || 0))
    : 0;
  const longSelfDamage = longFirst && longLast
    ? Math.max(0, Number(longFirst.selfHp || 0) - Number(longLast.selfHp || 0))
    : 0;
  const longTargetDamage = longFirst && longLast
    ? Math.max(0, Number(longFirst.targetHp || 0) - Number(longLast.targetHp || 0))
    : 0;
  const longDistanceProgressCm = longFirst && longLast
    ? Number(longFirst.distance || 0) - Number(longLast.distance || 0)
    : 0;
  const defensive = String(combatTargetState?.originIntent || combatTargetState?.intent || '') === 'defensive'
    || recentThreatBulletCount > 0
    || nowMs - Number(combatTargetState?.lastSelfDamageAt || 0) <= 10000;
  const closePressure = combatTargetState?.combatPhase === 'close-pressure';
  const exchangeStopLoss = evaluateCombatExchangeStopLossCore({
    nowMs,
    engagedMs: nowMs - Number(combatTargetState?.firstSeenAt || combatTargetState?.at || nowMs),
    acceptedShots: Number((combatMetrics || combatTargetState?.combatMetrics)?.acceptedShots || 0),
    damageObservations: Math.max(shortDamageObservations, longDamageObservations),
    selfHp: hpValue(self),
    targetHp: hpValue(target),
    windowMs: 10000,
    windowSelfDamage: shortSelfDamage,
    windowTargetDamage: shortTargetDamage,
    longWindowSelfDamage: longSelfDamage,
    longWindowTargetDamage: longTargetDamage,
    distanceProgressCm: longDistanceProgressCm,
    recentTargetDamage: shortTargetDamage,
    cumulativeSelfDamage: Number((combatMetrics || combatTargetState?.combatMetrics)?.selfDamage || 0),
    cumulativeTargetDamage: Number((combatMetrics || combatTargetState?.combatMetrics)?.targetDamage || 0),
    distance: Number(target?.distance),
    recentThreatBulletCount,
    defensive,
    closePressure,
    degradationSinceAt: combatTargetState?.exchangeDegradationSinceAt,
    retreatSinceAt: combatTargetState?.exchangeRetreatSinceAt,
    retreatSelfDamageBaseline: combatTargetState?.exchangeRetreatSelfDamageBaseline,
    retreatTargetDamageBaseline: combatTargetState?.exchangeRetreatTargetDamageBaseline
  }, options);
  combatTargetState.exchangeDegradationSinceAt = exchangeStopLoss.degradationSinceAt;
  combatTargetState.exchangeRetreatSinceAt = exchangeStopLoss.retreatSinceAt;
  combatTargetState.exchangeRetreatSelfDamageBaseline = exchangeStopLoss.retreatSelfDamageBaseline;
  combatTargetState.exchangeRetreatTargetDamageBaseline = exchangeStopLoss.retreatTargetDamageBaseline;
  return {
    ...evaluation,
    exchangeStopLoss: {
      ...exchangeStopLoss,
      reason: exchangeStopLoss.phasedReason || exchangeStopLoss.reason,
      advisory: Boolean(exchangeStopLoss.triggered && !exchangeStopLoss.shouldExit && !exchangeStopLoss.disengage),
      defensive,
      response: exchangeStopLoss.shouldExit
        ? (exchangeStopLoss.severePoorExchange ? 'leave-poor-exchange' : 'leave-defensive-exchange')
        : (exchangeStopLoss.disengage
            ? 'cease-fire-and-retreat'
            : (exchangeStopLoss.triggered ? 'continue-combat-adjust-tactics' : '')),
      closePressure
    },
    exit: evaluation.exit ? { ...evaluation.exit, noDamageMs } : null
  };
}

function profitEscortEntryEvidence(target, combatTargetState, bullets = [], nowMs = Date.now()) {
  const currentTargetId = String(combatTargetId(target) || '');
  const recentMotionSamples = (Array.isArray(combatTargetState?.motionSamples)
    ? combatTargetState.motionSamples
    : [])
    .filter(sample => nowMs - Number(sample?.at || 0) <= 2500);
  const firstMotionSample = recentMotionSamples[0] || null;
  const lastMotionSample = recentMotionSamples.at(-1) || null;
  const closingPressure = Boolean(
    firstMotionSample
      && lastMotionSample
      && Number(firstMotionSample.distance) - Number(lastMotionSample.distance) >= 200
  );
  const realTargetBulletPressure = (bullets || []).some(bullet => (
    bullet?.synthetic !== true
      && String(bullet?.ownerId ?? bullet?.owner_id ?? '') === currentTargetId
  ));
  const recentTargetThreat = Number(combatTargetState?.lastThreatAt || 0) > 0
    && nowMs - Number(combatTargetState.lastThreatAt) <= 2500;
  const eligible = Boolean(
    target?.combatIntent === 'defensive'
      || target?.combatIntent === 'whitelist-proximity'
      || target?.firing
      || realTargetBulletPressure
      || (target?.dynamicWhitelistMember && (closingPressure || recentTargetThreat))
  );
  return {
    eligible,
    targetCombatIntent: String(target?.combatIntent || ''),
    originIntent: String(combatTargetState?.originIntent || ''),
    dynamicWhitelistMember: Boolean(target?.dynamicWhitelistMember),
    targetFiring: Boolean(target?.firing),
    realTargetBulletPressure,
    closingPressure,
    recentTargetThreat,
    targetDistanceCm: Number.isFinite(Number(target?.distance)) ? Math.round(Number(target.distance)) : null
  };
}

function profitEscortMissionProgress(mission = {}) {
  return {
    currentDistanceCm: numberOrNull(mission.currentDistanceCm),
    previousDistanceCm: numberOrNull(mission.previousDistanceCm),
    netProgressCm: numberOrNull(mission.netProgressCm),
    lastForwardProgressAt: numberOrNull(mission.lastForwardProgressAt)
  };
}

function reconcileBrowserlessProfitEscortContinuity(
  stateful,
  self,
  target,
  realtime,
  bullets = [],
  options = {},
  explicitReleaseReason = ''
) {
  if (!stateful || typeof stateful !== 'object') {
    return { state: null, release: null, evidence: null, entered: false, maintained: false };
  }
  const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  const mission = options.profitMission || stateful.profitMission || null;
  const combatTargetState = target ? stateful.combatTarget || null : null;
  const combatTargetIdValue = target ? String(combatTargetId(target) || '') : '';
  const engagementGeneration = target
    ? String(stateful.combatMetrics?.engagementGeneration || '')
    : '';
  const controlGeneration = target
    ? String(stateful.combatMetrics?.controlGeneration || '')
    : '';
  const evidence = target
    ? profitEscortEntryEvidence(target, combatTargetState, bullets, nowMs)
    : null;
  const missionTarget = mission?.navigationTarget || mission?.target || mission;
  const missionTargetId = String(
    mission?.targetId
      ?? mission?.subjectId
      ?? missionTarget?.userId
      ?? missionTarget?.user_id
      ?? missionTarget?.id
      ?? ''
  );
  const missionPointValid = [self?.x, self?.y, missionTarget?.x, missionTarget?.y]
    .every(value => Number.isFinite(Number(value)));
  const previous = stateful.profitEscortContinuity || null;
  const priorEngagementMatches = profitEscortContinuityMatchesCore(previous, {
    nowMs,
    mission: previous?.missionKey === String(mission?.key || mission?.missionKey || '') ? mission : null,
    combatTargetId: combatTargetIdValue,
    engagementGeneration,
    controlGeneration
  });
  const frameAgeMs = Number(realtime?.frameAgeMs);
  const staleMs = Math.max(1000, Number(
    options.profitEscortRealtimeStaleMs
      ?? options.staleSelfMs
      ?? 3000
  ));
  let releaseReason = String(explicitReleaseReason || '');
  if (!releaseReason && target) {
    if (Number.isFinite(frameAgeMs) && frameAgeMs > staleMs) releaseReason = 'realtime-state-stale';
    else if (target.alive === false || Number(target.hp) <= 0) releaseReason = 'combat-target-completed';
    else if (combatTargetState?.escapeDecision?.confirmed === true) releaseReason = 'combat-target-escape-confirmed';
  }
  const entryEligible = !releaseReason
    && mission?.active !== false
    && missionTargetId
    && combatTargetIdValue
    && missionTargetId !== combatTargetIdValue
    && missionPointValid
    && Boolean(evidence?.eligible || priorEngagementMatches);
  const updated = updateProfitEscortContinuityCore(previous, {
    nowMs,
    mission,
    combatTargetId: combatTargetIdValue,
    engagementGeneration,
    controlGeneration,
    combatTargetVisible: Boolean(target),
    entryEligible,
    entryReason: evidence?.eligible ? 'realtime-defensive-evidence' : 'same-engagement-mission-rebind',
    entryEvidence: evidence,
    missionProgress: profitEscortMissionProgress(mission || {}),
    releaseReason
  }, {
    maximumMs: options.profitEscortContinuityMaxMs ?? options.profitMissionTtlMs ?? 180000
  });
  stateful.profitEscortContinuity = updated.state || null;
  if (updated.release) stateful.profitEscortContinuityLastRelease = updated.release;
  return { ...updated, evidence };
}

function buildCombatMovementPlan(self, target, bullets = [], options = {}) {
  if (!self || !target) return { dx: 0, dy: 0, reason: 'missing-target', spacing: null, dodge: null, modifiers: [] };
  const combatTargetState = options.combatTargetState || null;
  const opponentBehavior = combatTargetState?.opponentBehaviorState || null;
  const noDamageMs = Math.max(0, Number(combatTargetState?.noDamageMs || 0));
  const closePressureState = combatTargetState?.combatPhase === 'close-pressure'
    ? (combatTargetState.closePressure || {
        active: true,
        phase: 'close-pressure',
        phaseStartedAt: combatTargetState.phaseStartedAt || options.nowMs
      })
    : null;
  const reactionRange = closePressureState?.range || combatPressureTargetRangeCore(options);
  const closePressureRange = closePressureState ? reactionRange : null;
  const closePressureActive = Boolean(closePressureState?.active !== false && closePressureRange);
  const combatHardReserveMs = Math.max(
    0,
    Number(options.combatShootHardReserveMs ?? COMBAT_CONSTANTS.SHOOT_HARD_RESERVE_MS)
  );
  const normalDodgeReserveMs = Math.max(
    combatHardReserveMs,
    Number(options.combatShootDodgeReserveMs ?? COMBAT_CONSTANTS.SHOOT_DODGE_RESERVE_MS)
  );
  const pressureDodgeReserveMs = Math.max(
    combatHardReserveMs,
    Number(options.combatClosePressureReserveMs
      ?? options.combatShootPressureDodgeReserveMs
      ?? normalDodgeReserveMs)
  );
  const activeDodgeReserveMs = closePressureActive && closePressureState?.pressureAttackCommitted
    ? pressureDodgeReserveMs
    : normalDodgeReserveMs;
  const preDodgeStaminaCostMs = Math.max(
    0,
    Number(options.combatPreDodgeStaminaCostMs ?? 1000)
  );
  const targetPressure = (bullets || []).some(bullet => Number(bullet.ownerId) === Number(target.user_id));
  const attackRange = Math.max(0, Number(options.combatAttackRange || options.attackRange || COMBAT_CONSTANTS.ATTACK_RANGE));
  const outOfRange = Number(target.distance || Infinity) > attackRange;
  const edgePressure = target?.combatEngagement?.edgePressure || null;
  const escapeDecision = combatTargetState?.escapeDecision || target?.combatEngagement?.escapeDecision || null;
  const closeAllowed = Boolean(closePressureActive || (
    escapeDecision?.confirmed !== true
      && (!outOfRange || edgePressure?.active === true || targetPressure)
  ));
  const passiveRunner = passiveRunnerState(self, target, combatTargetState, options);
  const finishingTarget = Number(target.hp ?? 100) <= Number(options.combatFinishLowThreatHp ?? COMBAT_CONSTANTS.FINISH_LOW_THREAT_HP);
  const highEntropyOpponent = opponentBehavior?.dimensions?.controlStyle?.state === 'human-like'
    || Number(opponentBehavior?.automationLikelihood) < 0.45;
  const currentTargetId = String(combatTargetId(target) || '');
  const targetCollisionBulletPressure = (bullets || []).some(bullet => (
    bullet?.incoming === true
      && String(bullet?.ownerId ?? '') === currentTargetId
      && incomingBulletHasCollisionRiskCore(bullet, options)
  ));
  const nowMs = Number(options.nowMs || Date.now());
  const selfNoDamageMs = Math.max(
    0,
    nowMs - Number(combatTargetState?.lastSelfDamageAt || combatTargetState?.firstSeenAt || nowMs)
  );
  const recentSelfDamage = Number(combatTargetState?.lastSelfDamageAt || 0) > 0
    && nowMs - Number(combatTargetState.lastSelfDamageAt) < Math.max(
      0,
      Number(options.combatBallisticCloseNoDamageMs ?? 3000)
    );
  const recentPersistentThreat = Number(combatTargetState?.lastThreatAt || 0) > 0
    && nowMs - Number(combatTargetState.lastThreatAt) <= Math.max(
      1000,
      Number(options.combatBallisticCloseThreatClearMs ?? 2500)
    );
  const ballisticClose = combatBallisticCloseCore({
    targetId: currentTargetId,
    previousState: combatTargetState?.ballisticClose || null,
    nowMs: options.nowMs,
    distanceCm: target.distance,
    noDamageMs,
    selfNoDamageMs,
    acceptedShotsSinceDamage: combatTargetState?.acceptedShotsSinceDamage,
    selfHp: hpValue(self),
    targetFiring: target.firing,
    targetBulletPressure: targetCollisionBulletPressure,
    persistentThreat: recentPersistentThreat,
    recentSelfDamage,
    passiveRunnerConfirmed: passiveRunner.active,
    originIntent: combatTargetState?.originIntent,
    currentIntent: combatTargetState?.intent || target.combatIntent,
    ordinaryProfit: ['profit', 'engaged', 'reengage', 'afk-profit'].includes(String(
      combatTargetState?.originIntent || combatTargetState?.intent || target.combatIntent || ''
    )),
    directionDwells: opponentBehavior?.metrics?.directionDwells
  }, options);
  const ballisticCloseActive = ballisticClose.active === true;
  const spacing = ballisticCloseActive
    ? Number(ballisticClose.targetRangeCm)
    : (closePressureActive
        ? Number(closePressureRange.rangeCm)
        : calculateCombatSpacing(self, target, {
        targetPressure,
        finishingTarget,
        highEntropyOpponent,
        normalMinRangeCm: reactionRange.normalMinRangeCm,
        normalMaxRangeCm: reactionRange.normalMaxRangeCm
      }));
  const commandTiming = options.executionTiming || {};
  const dodge = calculateDodgeDirection(self, bullets, {
    tangentPreference: movementTangentPreference(self, target),
    target,
    moveSpeedPerTick: options.combatMoveSpeedPerTick || 50,
    hitRadius: options.combatBulletHitRadiusCm || 200,
    commandDelayP90Ticks: Number((options.movementExecutionTiming || commandTiming).p90Ticks || 5),
    movementExecutionTiming: options.movementExecutionTiming,
    pendingVelocityCommands: options.pendingVelocityCommands,
    currentTick: options.currentTick,
    reactionSafetyMarginMs: options.combatReactionSafetyMarginMs ?? 100
  });
  const safeRetreatInterceptEnabled = options.combatSafeRetreatInterceptEnabled === true;
  const safeRetreatModeConfirmed = String(opponentBehavior?.mode || '') === 'retreat-kite'
    && Number(opponentBehavior?.confidence || 0) >= 0.65;
  // The shadow candidate has no useful geometry work until retreat-kite is
  // confirmed. Keep the cheap core call for its existing diagnostic reasons,
  // but defer the per-frame attacker Set and candidate context construction.
  const safeRetreatIntercept = safeRetreatModeConfirmed
    ? (() => {
        const incomingOwners = new Set((bullets || [])
          .filter(bullet => bullet?.incoming === true && bullet?.ownerId !== null && bullet?.ownerId !== undefined)
          .map(bullet => String(bullet.ownerId)));
        return safeRetreatInterceptCandidateCore(self, target, {
          opponentBehavior,
          threatField: dodge?.threatField || [],
          recentIncomingDamage: combatTargetState?.lastSelfDamage || 0,
          selfHpLossObserved: combatTargetState?.selfHpLossObserved === true,
          otherAttackerCount: Math.max(0, incomingOwners.size - (incomingOwners.has(String(target.user_id)) ? 1 : 0)),
          boundary: options.combatBoundary || options.boundary,
          selfSpeedPerTick: options.combatMoveSpeedPerTick || 50,
          minimumCpaCm: Math.max(1, Number(options.combatMovementSafeCpaCm || 0),
            Number(options.combatBulletHitRadiusCm || COMBAT_CONSTANTS.BULLET_HIT_RADIUS_CM) + 110),
          enabled: safeRetreatInterceptEnabled
        });
      })()
    : safeRetreatInterceptCandidateCore(self, target, {
        opponentBehavior,
        enabled: safeRetreatInterceptEnabled
      });
  const behaviorSamples = Array.isArray(opponentBehavior?.samples) ? opponentBehavior.samples : [];
  const shootingPhase = opponentBehavior?.dimensions?.shootingPhase || null;
  const lastObservedShot = behaviorSamples.slice().reverse().find(sample => Number(sample.newBulletCount || 0) > 0) || null;
  const legacyShotIntervalMeanMs = numberOrNull(opponentBehavior?.metrics?.shotIntervalMeanMs);
  const shotIntervalCv = numberOrNull(opponentBehavior?.metrics?.shotIntervalCv);
  const burstSampleCount = numberOrNull(opponentBehavior?.metrics?.burstSampleCount);
  const currentBurstIntervalCount = numberOrNull(opponentBehavior?.metrics?.currentBurstIntervalCount);
  const burstConfidence = numberOrNull(opponentBehavior?.metrics?.burstConfidence);
  const hasBurstCadence = burstSampleCount !== null;
  const lowVariationCadence = hasBurstCadence
    ? Boolean(
        burstSampleCount >= 3
          && Number(currentBurstIntervalCount || 0) >= 2
          && Number(burstConfidence || 0) >= 0.55
          && shotIntervalCv !== null
          && shotIntervalCv <= Math.max(0.05, Number(options.combatPreDodgeMaxShotIntervalCv ?? 0.35))
      )
    : Boolean(
        ((opponentBehavior?.metrics?.shotIntervalTicks || []).length >= 3
          || (opponentBehavior?.metrics?.shotIntervals || []).length >= 3)
          && shotIntervalCv !== null
          && shotIntervalCv <= Math.max(0.05, Number(options.combatPreDodgeMaxShotIntervalCv ?? 0.35))
      );
  const nextShotInMs = numberOrNull(shootingPhase?.nextShotInMs)
    ?? (lastObservedShot && legacyShotIntervalMeanMs !== null
      ? Number(lastObservedShot.at || 0) + legacyShotIntervalMeanMs - Number(options.nowMs || Date.now())
      : null);
  const shootingPhaseState = shootingPhase?.state || (nextShotInMs !== null && nextShotInMs >= 0 ? 'preparing' : 'idle');
  const selfStamina5s = numberOrNull(self.stamina_5s_remaining_milli ?? self.stamina5sRemainingMilli);
  const moving = Boolean(Number(self.vx || 0) || Number(self.vy || 0));
  const currentDirection = {
    dx: Math.sign(Number(self.vx || 0)),
    dy: Math.sign(Number(self.vy || 0))
  };
  const currentDirectionThreats = Array.isArray(dodge?.threatField)
    ? dodge.threatField.filter(item => Number(item?.dx) === currentDirection.dx && Number(item?.dy) === currentDirection.dy)
    : [];
  const urgentOldBulletThreat = Boolean(
    (bullets || []).length
      && (dodge?.unavoidableCurrentShot === true
        || currentDirectionThreats.some(item => Number(item?.directHits || 0) > 0))
  );
  const commandDelayP90Ticks = Math.max(0, Number(commandTiming.p90Ticks || 5));
  const flightTicks = numberOrNull(shootingPhase?.flightTicks);
  const predictedCreatedTick = numberOrNull(shootingPhase?.predictedCreatedTick);
  const currentTick = numberOrNull(options.currentTick ?? bullets?.[0]?.currentTick);
  const latestSafeCommandTick = predictedCreatedTick !== null && flightTicks !== null
    ? predictedCreatedTick + flightTicks - commandDelayP90Ticks - 1 - 2
    : null;
  let preDodgeBlockedReason = '';
  if (shootingPhaseState !== 'preparing') preDodgeBlockedReason = 'shooting-phase-not-preparing';
  else if (!lowVariationCadence) preDodgeBlockedReason = 'cycle-unstable';
  else if (selfStamina5s !== null && selfStamina5s < activeDodgeReserveMs + preDodgeStaminaCostMs) preDodgeBlockedReason = 'stamina-insufficient';
  else if (!moving) preDodgeBlockedReason = 'self-stationary';
  else if (urgentOldBulletThreat) preDodgeBlockedReason = 'old-bullet-threat';
  else if (latestSafeCommandTick !== null && currentTick !== null && currentTick > latestSafeCommandTick) preDodgeBlockedReason = 'flight-time-insufficient';
  else if (numberOrNull(shootingPhase?.intervalMedianTicks) !== null
    && commandDelayP90Ticks >= Number(shootingPhase.intervalMedianTicks)) preDodgeBlockedReason = 'command-delay-too-high';
  const preDodge = Boolean(
    !preDodgeBlockedReason
      && nextShotInMs !== null
  );
  const preDodgeStaminaCost = preDodgeStaminaCostMs;
  const preDodgeDirectionThreat = currentDirectionThreats.slice().sort((a, b) =>
    Number(a?.directHits || 0) - Number(b?.directHits || 0)
      || Number(b?.minCPA || 0) - Number(a?.minCPA || 0))[0] || null;
  const ordinaryDodgeThreat = (dodge?.threatField || []).find(item =>
    Number(item?.dx) === Number(dodge?.dx) && Number(item?.dy) === Number(dodge?.dy)) || null;
  const preDodgeCandidate = shootingPhaseState === 'preparing' ? {
    phase: 'preparing',
    predictedCreatedTick,
    nextShotInMs: nextShotInMs === null ? null : Math.round(nextShotInMs),
    commandDelayP90Ticks,
    flightTicks,
    latestSafeCommandTick,
    currentTick,
    currentStamina5s: selfStamina5s,
    projectedStamina5s: selfStamina5s === null ? null : Math.max(0, selfStamina5s - preDodgeStaminaCost),
    staminaCost: preDodgeStaminaCost,
    reserveMs: activeDodgeReserveMs,
    direction: currentDirection,
    predictedMinimumCpaCm: numberOrNull(preDodgeDirectionThreat?.minCPA),
    predictedDirectHits: numberOrNull(preDodgeDirectionThreat?.directHits),
    blockedReason: preDodgeBlockedReason,
    ordinaryDodge: dodge ? {
      dx: numberOrNull(dodge.dx),
      dy: numberOrNull(dodge.dy),
      reason: dodge.reason || '',
      minimumCpaCm: numberOrNull(ordinaryDodgeThreat?.minCPA),
      directHits: numberOrNull(ordinaryDodgeThreat?.directHits)
    } : null
  } : null;
  const closePressureHysteresisCm = closePressureState?.range?.progressiveMissClose
    ? Math.max(0, Number(closePressureState.arrivalToleranceCm ?? 100))
    : Math.max(100, Number(options.combatClosePressureHysteresisCm ?? 300));
  const closeRange = ballisticCloseActive
    ? Number(ballisticClose.targetRangeCm)
    : (closePressureActive
        ? Number(closePressureRange.rangeCm)
        : Math.max(0, Number(options.combatPressureCloseRange
          || options.combatPassiveRunnerCloseRange
          || COMBAT_CONSTANTS.NO_DAMAGE_PRESS_CLOSE_RANGE)));
  const closePressureMinRange = closePressureActive
    ? Math.max(0, Number(closePressureRange.minRangeCm
      ?? options.combatClosePressureMinRangeCm
      ?? 4500))
    : 0;
  const closePressureTooClose = Boolean(
    closePressureActive
      && !ballisticCloseActive
      && Number(target.distance || Infinity) < closePressureMinRange
  );
  const ballisticCloseTooClose = Boolean(
    ballisticCloseActive
      && Number(target.distance || Infinity)
        < Number(ballisticClose.targetRangeCm) - Number(ballisticClose.hysteresisCm || 0)
  );
  const ballisticCloseIn = Boolean(
    ballisticCloseActive
      && Number(target.distance || Infinity)
        > Number(ballisticClose.targetRangeCm) + Number(ballisticClose.hysteresisCm || 0)
  );
  const backAway = ballisticCloseActive
    ? ballisticCloseTooClose
    : (closePressureActive ? closePressureTooClose : shouldBackAwayFromTarget(self, target));
  const pressureClose = Boolean(
    closePressureActive
      ? closeAllowed && Number(target.distance || Infinity) > closeRange + closePressureHysteresisCm
      : closeAllowed
        && targetPressure
        && noDamageMs >= Math.max(0, Number(options.combatNoDamagePressCloseMs ?? COMBAT_CONSTANTS.NO_DAMAGE_PRESS_CLOSE_MS))
        && (hpValue(self) ?? 100) >= Math.max(0, Number(options.combatNoDamagePressCloseMinHp ?? COMBAT_CONSTANTS.NO_DAMAGE_PRESS_CLOSE_MIN_HP))
        && Number(target.distance || Infinity) > closeRange
  );
  const retreatingClose = Boolean(
    closeAllowed
      && !pressureClose
      && !ballisticCloseActive
      && (opponentBehavior?.mode === 'retreat-kite' || targetRecedingFromSelf(self, target))
      && noDamageMs >= Math.max(0, Number(options.combatRetreatingCloseNoDamageMs || 2000))
      && Number(target.distance || Infinity) > spacing
  );
  const passiveRunnerClose = Boolean(
    closeAllowed
      && !pressureClose
      && !retreatingClose
      && !ballisticCloseActive
      && passiveRunner.active
      && Number(target.distance || Infinity) > Math.max(0, Number(options.combatPassiveRunnerCloseRange || 5500))
  );
  const behaviorClose = Boolean(
    closeAllowed
      && !ballisticCloseActive
      && (closePressureActive || opponentBehavior?.responsePolicy?.closeIn)
      && Number(target.distance || Infinity) > spacing
  );
  const contactEntryDodge = options.contactEntryGuard?.active === true
    && !(Array.isArray(dodge?.threatField) && dodge.threatField.length)
    ? options.contactEntryGuard.dodge
    : null;
  const closeIn = closeAllowed
    && (pressureClose
      || ballisticCloseIn
      || retreatingClose
      || passiveRunnerClose
      || behaviorClose
      || (!closePressureActive
        && !ballisticCloseActive
        && Number(target.distance || Infinity) > spacing));
  const strafe = closePressureActive
    && !closePressureTooClose
    && !ballisticCloseTooClose
    && !pressureClose
    && Number(target.distance || Infinity) <= closeRange + closePressureHysteresisCm
    ? combatPressureStrafeCore(self, target, closePressureState, { nowMs: options.nowMs })
    : null;
  const towardTarget = {
    dx: Math.sign(Number(target.x || 0) - Number(self.x || 0)),
    dy: Math.sign(Number(target.y || 0) - Number(self.y || 0))
  };
  const awayFromTarget = { dx: -towardTarget.dx, dy: -towardTarget.dy };
  const profitMission = options.profitMission && typeof options.profitMission === 'object'
    ? options.profitMission
    : null;
  const missionTarget = profitMission?.navigationTarget
    || profitMission?.target
    || profitMission;
  const missionTargetId = String(
    profitMission?.targetId
      ?? profitMission?.subjectId
      ?? missionTarget?.userId
      ?? missionTarget?.user_id
      ?? missionTarget?.id
      ?? ''
  );
  const missionIsDifferentTarget = Boolean(
    missionTargetId
      && currentTargetId
      && missionTargetId !== currentTargetId
  );
  const escortEvidence = profitEscortEntryEvidence(
    target,
    combatTargetState,
    bullets,
    Number(options.nowMs || Date.now())
  );
  const escortContinuity = options.profitEscortContinuity || null;
  const continuityMatches = profitEscortContinuityMatchesCore(escortContinuity, {
    nowMs: options.nowMs,
    mission: profitMission,
    combatTargetId: currentTargetId,
    engagementGeneration: options.engagementGeneration,
    controlGeneration: options.controlGeneration
  });
  const defensiveEscortEvidence = Boolean(escortEvidence.eligible || continuityMatches);
  const profitEscort = missionIsDifferentTarget && defensiveEscortEvidence
    ? selectProfitEscortDirectionCore({
        active: profitMission.active !== false,
        self,
        missionTarget,
        combatTarget: target,
        forceSeparation: closePressureTooClose || ballisticCloseTooClose
      }, {
        localDetourRadiusCm: options.profitEscortLocalDetourRadiusCm,
        detourCorridorCm: options.profitEscortDetourCorridorCm,
        minimumForwardProgress: options.profitEscortMinimumForwardProgress,
        detourSeparationWeight: options.profitEscortDetourSeparationWeight
      })
    : null;
  if (profitEscort) {
    profitEscort.missionKey = String(profitMission.key || profitMission.missionKey || '');
    profitEscort.missionType = String(profitMission.type || '');
    profitEscort.missionTargetId = missionTargetId;
    profitEscort.navigationAuthority = String(
      missionTarget?.authority || profitMission.navigationAuthority || 'navigation'
    );
    profitEscort.latched = continuityMatches;
    profitEscort.maintained = continuityMatches && !escortEvidence.eligible;
    profitEscort.enteredAt = continuityMatches ? Number(escortContinuity.enteredAt || 0) : null;
    profitEscort.engagementGeneration = continuityMatches
      ? String(escortContinuity.engagementGeneration || '')
      : String(options.engagementGeneration || '');
    profitEscort.entryReason = continuityMatches ? String(escortContinuity.entryReason || '') : '';
    profitEscort.entryEvidence = continuityMatches
      ? cloneJson(escortContinuity.entryEvidence || null)
      : cloneJson(escortEvidence);
    profitEscort.evidence = escortEvidence;
    profitEscort.missionStateProgress = continuityMatches
      ? cloneJson(escortContinuity.missionProgress || null)
      : profitEscortMissionProgress(profitMission);
    profitEscort.overrideReason = ballisticCloseActive ? 'ballistic-close' : '';
    profitEscort.releaseReason = '';
  }
  const escortDirection = profitEscort?.active && !ballisticCloseActive
    ? profitEscort.direction
    : null;
  const strategicDirection = escortDirection
    ? escortDirection
    : (closePressureTooClose || ballisticCloseTooClose
        ? awayFromTarget
        : (strafe?.active
            ? { dx: strafe.dx, dy: strafe.dy }
            : (safeRetreatInterceptEnabled
                && safeRetreatIntercept.eligible
                && !preDodge
                && !ballisticCloseActive
                ? safeRetreatIntercept.direction
                : (closeIn ? towardTarget : null))));
  const pendingCommands = (options.pendingVelocityCommands || [])
    .filter(command => command && Number.isFinite(Number(command.effectiveAfterTicks)))
    .slice()
    .sort((left, right) => Number(left.effectiveAfterTicks) - Number(right.effectiveAfterTicks)
      || Number(left.sequence || 0) - Number(right.sequence || 0));
  const pendingDirection = pendingCommands.length
    ? {
        dx: Math.sign(Number(pendingCommands[pendingCommands.length - 1].dx || 0)),
        dy: Math.sign(Number(pendingCommands[pendingCommands.length - 1].dy || 0))
      }
    : null;
  const predictiveDirection = preDodge
    ? currentDirection
    : strategicDirection;
  const movementSafetyCpaCm = Math.max(
    Number(options.combatMovementSafeCpaCm || 0),
    Number(options.combatBulletHitRadiusCm || COMBAT_CONSTANTS.BULLET_HIT_RADIUS_CM) + 110
  );
  const movementArbitration = predictiveDirection && !contactEntryDodge
    ? selectCombatMovementArbitrationCore({
        threatField: dodge?.threatField || [],
        strategicDirection: predictiveDirection,
        currentDirection,
        pendingDirection,
        unavoidableHoldDirection: pendingDirection || currentDirection,
        pendingActive: Boolean(pendingDirection),
        emergencyDirection: contactEntryDodge || dodge || { dx: 0, dy: 0 }
      }, { minimumCpaCm: movementSafetyCpaCm })
    : null;
  let effectiveDodge = contactEntryDodge || dodge;
  let movement;
  if (movementArbitration) {
    const source = movementArbitration.source;
    const modifiers = [];
    if (source === 'emergency-dodge') modifiers.push('dodge');
    else if (source === 'pending-safe-hold' || source === 'current-safe-hold') modifiers.push('hold-current');
    else if (preDodge) modifiers.push('predictive-hold');
    else if (profitEscort?.active && !ballisticCloseActive) {
      modifiers.push('profit-escort');
      if (profitEscort.detour) modifiers.push('profit-escort-detour');
    } else if (closePressureTooClose || ballisticCloseTooClose) modifiers.push('back-away');
    else if (strafe?.active) modifiers.push('close-pressure-strafe');
    else modifiers.push('close-in');
    movement = { dx: movementArbitration.dx, dy: movementArbitration.dy, modifiers };
    effectiveDodge = source === 'emergency-dodge'
      ? { ...(contactEntryDodge || dodge), dx: movement.dx, dy: movement.dy }
      : null;
  } else {
    const base = { dx: 0, dy: 0 };
    movement = applyCombatMovementModifiers(base, self, target, {
      dodge: preDodge
        ? {
            dx: currentDirection.dx,
            dy: currentDirection.dy,
            reason: 'pre-dodge-induce-hold',
            threatField: dodge?.threatField || null
          }
        : effectiveDodge,
      backAway,
      closeIn
    });
  }
  const distanceAwareDodgeEnabled = options.combatDistanceAwareDodgeEnabled === true;
  const distanceAwareReactionBudget = distanceAwareDodgeEnabled
    ? deriveCombatReactionBudgetCore({
        nowMs: options.nowMs,
        realtimeStateObservedAtMs: options.realtimeStateObservedAtMs,
        realtimeStateAgeMs: options.realtimeStateAgeMs,
        movementExecutionTiming: options.movementExecutionTiming,
        pendingVelocityCommands: options.pendingVelocityCommands,
        decisionQueueDelayTicks: options.combatDecisionQueueDelayTicks,
        movementDispatchDelayTicks: options.combatMovementDispatchDelayTicks,
        reactionSafetyMarginTicks: options.combatReactionSafetyMarginTicks
      }, {
        tickMs: 50,
        reactionSafetyMarginTicks: 2
      })
    : null;
  const distanceAwareReactionSlack = distanceAwareDodgeEnabled
    ? currentProspectiveReactionSlackCore({
        nowMs: options.nowMs,
        commandBudget: distanceAwareReactionBudget,
        self,
        target,
        bullets,
        dodge,
        currentDirection,
        pendingDirection,
        bulletSpeedCmPerTick: COMBAT_CONSTANTS.BULLET_SPEED_CM_PER_TICK
      }, {
        bulletSpeedCmPerTick: COMBAT_CONSTANTS.BULLET_SPEED_CM_PER_TICK,
        minimumCpaCm: movementSafetyCpaCm
      })
    : null;
  const distanceAwareDodge = distanceAwareDodgeEnabled
    ? resolveDistanceAwareDodgeCore({
        nowMs: options.nowMs,
        targetId: combatTargetId(target),
        engagementId: options.engagementId || combatTargetId(target),
        self,
        target,
        bullets,
        dodge,
        baseMovement: movement,
        baseDistanceBand: profitEscort?.active && !ballisticCloseActive
          ? 'escort'
          : (closePressureTooClose || ballisticCloseTooClose
              ? 'separate'
              : (strafe?.active
                  ? 'strafe'
                  : (closeIn ? 'approach' : 'hold-spacing'))),
        currentDirection,
        pendingDirection,
        pendingVelocityCommands: options.pendingVelocityCommands,
        movementExecutionTiming: options.movementExecutionTiming,
        currentTick: options.currentTick,
        moveSpeedPerTick: options.combatMoveSpeedPerTick || 50,
        radialIntentVector: profitEscort?.active && !ballisticCloseActive
          ? profitEscort.direction
          : (closePressureTooClose || ballisticCloseTooClose
              ? awayFromTarget
              : (closeIn ? towardTarget : movement)),
        previousState: options.distanceAwareDodgeState || null,
        reactionSlack: distanceAwareReactionSlack,
        activeOpponent: target.active === true,
        recentDirectedThreat: Boolean(
          bullets.some(bullet => bullet?.incoming === true)
            || opponentBehavior?.metrics?.realBulletPressure
            || burstSampleCount >= 2
        ),
        lowStamina: selfStamina5s !== null
          && selfStamina5s < activeDodgeReserveMs + preDodgeStaminaCostMs,
        exitActive: options.leaveActive === true,
        collisionRisk: options.collisionRisk === true,
        boundary: options.combatBoundary || options.boundary,
        opponentBehaviorState: opponentBehavior,
        shootingPhase,
        nextShotInMs,
        shotIntervalMeanMs: legacyShotIntervalMeanMs,
        shotIntervalCv,
        shotSampleCount: burstSampleCount,
        targetId: combatTargetId(target)
      }, {
        rng: options.distanceAwareDodgeRng || options.rng,
        boundary: options.combatBoundary || options.boundary,
        moveSpeedPerTick: options.combatMoveSpeedPerTick || 50,
        minimumCpaCm: movementSafetyCpaCm,
        modeMinimumHoldMs: options.combatDistanceAwareDodgeMinimumHoldMs,
        latchMinimumHoldMs: options.combatDistanceAwareDodgeLatchHoldMs
      })
    : {
        applied: false,
        mode: null,
        closeSubmode: null,
        reactionSlackMs: null,
        prospectiveReactionSlackMs: null,
        currentShotAvoidability: null,
        pendingCommandSchedule: [],
        nextVolleyMinCpaCm: null,
        preDodgeTrigger: false,
        preDodgeReason: 'distance-aware-dodge-disabled',
        predictedFireWindowTicks: null,
        predictedLaneCount: 0,
        randomChoice: null,
        randomHoldUntil: null,
        baseRadialIntent: null,
        radialOverrideReason: '',
        latchAgeMs: 0,
        state: null,
        blockedReason: 'distance-aware-dodge-disabled'
      };
  if (distanceAwareDodge.applied) {
    movement = {
      ...movement,
      dx: Number(distanceAwareDodge.direction.dx || 0),
      dy: Number(distanceAwareDodge.direction.dy || 0),
      modifiers: Array.from(new Set([...(movement.modifiers || []), 'dodge', 'distance-aware-dodge']))
    };
    effectiveDodge = {
      ...(effectiveDodge || dodge || {}),
      dx: movement.dx,
      dy: movement.dy,
      reason: `distance-aware-${distanceAwareDodge.closeSubmode || 'dodge'}`,
      active: true
    };
  } else if (distanceAwareDodge.suppressCurrentShotDodge
    && movement.modifiers.includes('dodge')) {
    movement = {
      ...movement,
      dx: Number(distanceAwareDodge.direction.dx || 0),
      dy: Number(distanceAwareDodge.direction.dy || 0),
      modifiers: Array.from(new Set([
        ...movement.modifiers.filter(modifier => modifier !== 'dodge'),
        'hold-current',
        'distance-aware-unavoidable-hold'
      ]))
    };
    effectiveDodge = null;
  }
  const closeReason = ballisticCloseActive
    ? 'combat-ballistic-flight-close'
    : (pressureClose
    ? (closePressureActive ? 'combat-close-pressure-approach' : 'combat-pressure-close')
    : (retreatingClose
        ? 'combat-retreating-fighter-close'
        : (passiveRunnerClose ? 'passive-runner-close' : (behaviorClose ? `combat-${opponentBehavior.mode}-response` : 'close-in'))));
  const reason = movement.modifiers.includes('close-pressure-strafe')
    ? (preDodge ? 'close-pressure-predictive-hold' : (strafe?.reason || 'close-pressure-deterministic-strafe'))
    : movement.modifiers.includes('dodge')
    ? (effectiveDodge?.reason || 'direct-threat-dodge')
    : movement.modifiers.includes('hold-current')
    ? (preDodge ? 'close-pressure-predictive-hold' : 'combat-current-safe-hold')
    : movement.modifiers.includes('predictive-hold')
    ? (closePressureActive ? 'close-pressure-predictive-hold' : 'pre-dodge-induce-hold')
    : movement.modifiers.includes('profit-escort')
    ? (profitEscort?.reason || 'profit-escort-forward')
    : (movement.modifiers.includes('back-away') || movement.modifiers.includes('back-away-mixed')
        ? (closePressureTooClose
            ? 'combat-close-pressure-separate'
            : (ballisticCloseTooClose ? 'combat-ballistic-flight-separate' : 'back-away'))
        : (movement.modifiers.includes('close-in')
            ? (edgePressure?.active ? 'combat-advantage-reengage' : closeReason)
            : (escapeDecision?.confirmed
                ? 'combat-escape-confirmed-hold'
                : (outOfRange
                    ? 'combat-out-of-range-hold'
                    : (ballisticCloseActive ? 'combat-ballistic-flight-hold' : 'hold-spacing')))));
  const safeRetreatInterceptApplied = Boolean(
    safeRetreatInterceptEnabled
      && safeRetreatIntercept.eligible
      && !preDodge
      && movementArbitration?.source === 'strategic-safe'
      && Number(movement.dx) === Number(safeRetreatIntercept.direction.dx)
      && Number(movement.dy) === Number(safeRetreatIntercept.direction.dy)
  );
  if (safeRetreatInterceptApplied) {
    movement.modifiers = Array.from(new Set([...(movement.modifiers || []), 'safe-retreat-intercept']));
  }
  if (profitEscort?.active) {
    if (movement.modifiers.includes('profit-escort')) profitEscort.overrideReason = '';
    else if (movement.modifiers.includes('dodge')) {
      profitEscort.overrideReason = contactEntryDodge ? 'contact-entry-dodge' : 'emergency-dodge';
    } else if (movementArbitration?.source === 'pending-safe-hold') {
      profitEscort.overrideReason = 'pending-safe-hold';
    } else if (movementArbitration?.source === 'current-safe-hold') {
      profitEscort.overrideReason = 'current-safe-hold';
    } else if (ballisticCloseActive) profitEscort.overrideReason = 'ballistic-close';
    else if (closePressureTooClose) profitEscort.overrideReason = 'close-pressure-separation';
    else profitEscort.overrideReason = reason || 'combat-spacing-override';
  }
  return {
    dx: Number(movement.dx || 0),
    dy: Number(movement.dy || 0),
    reason,
    spacing: Math.round(spacing),
    dodge: dodge ? {
      dx: effectiveDodge?.dx ?? dodge.dx,
      dy: effectiveDodge?.dy ?? dodge.dy,
      reason: effectiveDodge?.reason || dodge.reason,
      applied: movement.modifiers.includes('dodge'),
      mode: distanceAwareDodge.mode,
      closeSubmode: distanceAwareDodge.closeSubmode,
      reactionSlackMs: distanceAwareDodge.reactionSlackMs,
      prospectiveReactionSlackMs: distanceAwareDodge.prospectiveReactionSlackMs,
      currentShotAvoidability: distanceAwareDodge.currentShotAvoidability,
      pendingCommandSchedule: distanceAwareDodge.pendingCommandSchedule,
      nextVolleyMinCpaCm: distanceAwareDodge.nextVolleyMinCpaCm,
      preDodgeTrigger: distanceAwareDodge.preDodgeTrigger,
      preDodgeReason: distanceAwareDodge.preDodgeReason,
      predictedFireWindowTicks: distanceAwareDodge.predictedFireWindowTicks,
      predictedLaneCount: distanceAwareDodge.predictedLaneCount,
      predictedThreatSource: distanceAwareDodge.predictedThreatSource,
      prospectiveBullet: distanceAwareDodge.prospectiveBullet,
      randomChoice: distanceAwareDodge.randomChoice,
      randomHoldUntil: distanceAwareDodge.randomHoldUntil,
      directionStabilityHeld: distanceAwareDodge.directionStabilityHeld,
      directionStabilityWindowMs: distanceAwareDodge.directionStabilityWindowMs,
      baseDistanceBand: distanceAwareDodge.baseDistanceBand,
      baseRadialIntent: distanceAwareDodge.baseRadialIntent,
      radialOverrideReason: distanceAwareDodge.radialOverrideReason,
      latchAgeMs: distanceAwareDodge.latchAgeMs,
      threatField: summarizeDodgeThreatField(dodge.threatField)
    } : (distanceAwareDodgeEnabled ? {
      dx: Number(movement.dx || 0),
      dy: Number(movement.dy || 0),
      reason: distanceAwareDodge.preDodgeReason,
      applied: distanceAwareDodge.applied,
      mode: distanceAwareDodge.mode,
      closeSubmode: distanceAwareDodge.closeSubmode,
      reactionSlackMs: distanceAwareDodge.reactionSlackMs,
      prospectiveReactionSlackMs: distanceAwareDodge.prospectiveReactionSlackMs,
      currentShotAvoidability: distanceAwareDodge.currentShotAvoidability,
      pendingCommandSchedule: distanceAwareDodge.pendingCommandSchedule,
      nextVolleyMinCpaCm: distanceAwareDodge.nextVolleyMinCpaCm,
      preDodgeTrigger: distanceAwareDodge.preDodgeTrigger,
      preDodgeReason: distanceAwareDodge.preDodgeReason,
      predictedFireWindowTicks: distanceAwareDodge.predictedFireWindowTicks,
      predictedLaneCount: distanceAwareDodge.predictedLaneCount,
      predictedThreatSource: distanceAwareDodge.predictedThreatSource,
      prospectiveBullet: distanceAwareDodge.prospectiveBullet,
      randomChoice: distanceAwareDodge.randomChoice,
      randomHoldUntil: distanceAwareDodge.randomHoldUntil,
      directionStabilityHeld: distanceAwareDodge.directionStabilityHeld,
      directionStabilityWindowMs: distanceAwareDodge.directionStabilityWindowMs,
      baseDistanceBand: distanceAwareDodge.baseDistanceBand,
      baseRadialIntent: distanceAwareDodge.baseRadialIntent,
      radialOverrideReason: distanceAwareDodge.radialOverrideReason,
      latchAgeMs: distanceAwareDodge.latchAgeMs,
      threatField: []
    } : null),
    distanceAwareDodge,
    modifiers: movement.modifiers || [],
    safeRetreatIntercept: {
      ...safeRetreatIntercept,
      applied: safeRetreatInterceptApplied
    },
    closePressure: closePressureActive ? {
      ...closePressureState,
      range: closePressureState?.range ? { ...closePressureState.range } : null,
      targetRangeCm: Math.round(closeRange),
      minimumRangeCm: Math.round(closePressureMinRange),
      tooClose: closePressureTooClose,
      strafe: strafe ? { ...strafe } : null
    } : null,
    ballisticClose: {
      ...ballisticClose,
      state: ballisticClose.state ? { ...ballisticClose.state } : null,
      tooClose: ballisticCloseTooClose,
      closing: ballisticCloseIn,
      ownsMovement: ballisticCloseActive && !movement.modifiers.includes('dodge')
    },
    profitEscort: profitEscort ? {
      ...profitEscort,
      direction: profitEscort.direction ? { ...profitEscort.direction } : null
    } : null,
    pressureClose: pressureClose ? { active: true, noDamageMs: Math.round(noDamageMs), closeRange } : null,
    passiveRunner: passiveRunner.active ? passiveRunner : null,
    retreatingClose: retreatingClose ? { active: true, noDamageMs: Math.round(noDamageMs), receding: true } : null,
    opponentBehavior: opponentBehavior ? {
      mode: opponentBehavior.mode,
      confidence: opponentBehavior.confidence,
      responsePolicy: opponentBehavior.responsePolicy
    } : null,
    edgePressure: edgePressure?.active ? edgePressure : null,
    escapeDecision: escapeDecision || null,
    movementArbitration: movementArbitration ? {
      source: movementArbitration.source,
      minimumCpaCm: movementArbitration.minimumCpaCm,
      strategicSafe: movementArbitration.strategicSafe,
      baselineSafe: movementArbitration.baselineSafe,
      strategicDirection: predictiveDirection,
      pendingDirection,
      selectedDirectHits: numberOrNull(movementArbitration.selectedThreat?.directHits),
      selectedMinCpaCm: numberOrNull(movementArbitration.selectedThreat?.minCPA),
      strategicDirectHits: numberOrNull(movementArbitration.strategicThreat?.directHits),
      strategicMinCpaCm: numberOrNull(movementArbitration.strategicThreat?.minCPA),
      baselineDirectHits: numberOrNull(movementArbitration.baselineThreat?.directHits),
      baselineMinCpaCm: numberOrNull(movementArbitration.baselineThreat?.minCPA)
    } : null,
    preDodge: preDodge ? {
      phase: 'induce-hold',
      nextShotInMs: Math.round(nextShotInMs),
      shotIntervalCv,
      reserveMs: activeDodgeReserveMs,
      predictedCreatedTick,
      latestSafeCommandTick,
      burstSampleCount,
      currentBurstShotCount: numberOrNull(opponentBehavior?.metrics?.currentBurstShotCount),
      burstConfidence
    } : null,
    preDodgeCandidate,
    preDodgeBlockedReason: preDodge ? '' : preDodgeBlockedReason,
    combatStaminaBudget: {
      hardReserveMs: combatHardReserveMs,
      normalDodgeReserveMs,
      pressureDodgeReserveMs,
      activeDodgeReserveMs,
      preDodgeStaminaCostMs,
      distanceAwareLowStaminaThresholdMs: activeDodgeReserveMs + preDodgeStaminaCostMs
    },
    contactEntryGuard: options.contactEntryGuard || null,
    shootingPhaseSource: shootingPhase?.shootingPhaseSource || '',
    oldBulletPressure: Boolean((bullets || []).length)
  };
}

function pickIncomingBullet(bullets = [], options = {}) {
  let selected = null;
  let selectedTimeToImpact = Infinity;
  let selectedDistance = Infinity;
  for (const bullet of bullets || []) {
    if (!bullet?.incoming || !incomingBulletHasCollisionRiskCore(bullet, options)) continue;
    const timeToImpact = Number(bullet.timeToImpact ?? Infinity);
    const distance = Number(bullet.distance ?? Infinity);
    if (selected
      && (timeToImpact > selectedTimeToImpact
        || (timeToImpact === selectedTimeToImpact && distance >= selectedDistance))) continue;
    selected = bullet;
    selectedTimeToImpact = timeToImpact;
    selectedDistance = distance;
  }
  return selected;
}

function rememberBrowserlessCombatEngagement(stateful, self, target, options = {}) {
  if (!stateful || typeof stateful !== 'object' || !target) return;
  const id = combatTargetId(target);
  if (!id) return;
  const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  const engagementTtlMs = Math.max(5000, Number(options.combatEngagementMemoryTtlMs ?? 30000));
  stateful.combatEngagements = stateful.combatEngagements && typeof stateful.combatEngagements === 'object'
    ? stateful.combatEngagements
    : {};
  stateful.combatMetricsByTarget = stateful.combatMetricsByTarget && typeof stateful.combatMetricsByTarget === 'object'
    ? stateful.combatMetricsByTarget
    : {};
  for (const [rememberedId, remembered] of Object.entries(stateful.combatEngagements)) {
    if (nowMs - Number(remembered?.at || 0) > engagementTtlMs) {
      delete stateful.combatEngagements[rememberedId];
      delete stateful.combatMetricsByTarget[rememberedId];
    }
  }
  const currentPrevious = stateful.combatTarget || null;
  const commandShooting = options.commandShooting && typeof options.commandShooting === 'object'
    ? options.commandShooting
    : {};
  const currentControlGeneration = String(commandShooting.controlGeneration || options.controlGeneration || '');
  const activeTargetMatches = Boolean(currentPrevious && String(currentPrevious.id ?? '') === String(id));
  const previousControlGeneration = String(stateful.combatMetrics?.controlGeneration || '');
  const controlGenerationMatches = !currentControlGeneration
    || !previousControlGeneration
    || currentControlGeneration === previousControlGeneration;
  const continuesActiveGeneration = activeTargetMatches && controlGenerationMatches;
  const rememberedPrevious = stateful.combatEngagements[String(id)] || null;
  const previous = currentPrevious && String(currentPrevious.id ?? '') === String(id)
    ? currentPrevious
    : (rememberedPrevious && nowMs - Number(rememberedPrevious.at || 0) <= engagementTtlMs ? rememberedPrevious : null);
  const same = Boolean(previous && String(previous.id ?? '') === String(id));
  if (continuesActiveGeneration && String(stateful.combatMetrics?.targetId ?? '') !== String(id)) {
    const rememberedMetrics = stateful.combatMetricsByTarget[String(id)] || null;
    if (rememberedMetrics) stateful.combatMetrics = cloneJson(rememberedMetrics);
  }
  let engagementGeneration = String(stateful.combatMetrics?.engagementGeneration || '');
  let confirmationSequenceBaseline = Math.max(0, Number(stateful.combatMetrics?.confirmationSequenceBaseline || 0));
  let requestSequenceBaseline = Math.max(0, Number(stateful.combatMetrics?.requestSequenceBaseline || 0));
  if (!continuesActiveGeneration || !engagementGeneration) {
    stateful.combatEngagementGenerationSequence = Math.max(
      0,
      Number(stateful.combatEngagementGenerationSequence || 0)
    ) + 1;
    engagementGeneration = [
      currentControlGeneration || 'control-unknown',
      String(id),
      stateful.combatEngagementGenerationSequence,
      numberOrNull(options.currentTick) ?? Math.round(nowMs)
    ].join(':');
    confirmationSequenceBaseline = Math.max(0, Number(commandShooting.lastConfirmationSequence || 0));
    requestSequenceBaseline = Math.max(0, Number(commandShooting.lastRequestSequence || 0));
    stateful.combatExecutionLedger = { engagementGeneration, eventIds: [] };
  }
  const distance = Number.isFinite(Number(target.distance)) ? Number(target.distance) : distanceBetween(self, target);
  const hp = numberOrNull(target.knownHp ?? target.hp);
  const currentTargetName = String(target.name || '').trim();
  const previousTargetName = same ? String(previous.name || '').trim() : '';
  const targetName = currentTargetName || previousTargetName;
  const currentDropKnown = entityDropKnown(target);
  const previousDropKnown = same && previous.dropKnown === true;
  const targetDropKnown = currentDropKnown || previousDropKnown;
  const targetDrop = currentDropKnown
    ? entityDropValue(target)
    : (previousDropKnown ? Math.max(0, Number(previous.drop) || 0) : entityDropValue(target));
  const previousHp = same && Number.isFinite(Number(previous.hp)) ? Number(previous.hp) : null;
  const damaged = hp !== null && previousHp !== null && hp < previousHp - 0.01;
  const healed = hp !== null && previousHp !== null && hp > previousHp + 0.01;
  const previousSelfHp = same ? hpValue(previous?.self) : null;
  const currentSelfHp = hpValue(self);
  const currentSelfX = numberOrNull(self?.x);
  const currentSelfY = numberOrNull(self?.y);
  const selfDamaged = previousSelfHp !== null && currentSelfHp !== null && currentSelfHp < previousSelfHp - 0.01;
  const selfHealed = previousSelfHp !== null && currentSelfHp !== null && currentSelfHp > previousSelfHp + 0.01;
  const observationTargetId = String(stateful.combatHpObservationTargetId || '');
  const observationBuffer = observationTargetId === String(id)
    && stateful.combatHpObservationBuffer
    ? stateful.combatHpObservationBuffer
    : createCombatObservationBuffer({
        bufferMs: options.combatHpAttributionBufferMs ?? 2000,
        maxObservations: options.combatHpAttributionMaxObservations ?? 40,
        maxBulletsPerObservation: options.combatHpAttributionMaxBullets ?? 12
      });
  const observedFrame = observeCombatFrameCore(observationBuffer, {
    atMs: nowMs,
    tick: options.currentTick,
    self,
    bullets: options.bullets,
    selectedDirection: stateful.combatMetrics?.lastSelectedDodgeDirection,
    visibleDirection: self,
    pendingMovement: Array.isArray(options.pendingVelocityCommands)
      ? options.pendingVelocityCommands.at(-1)
      : null
  }, options);
  stateful.combatHpObservationTargetId = String(id);
  stateful.combatHpObservationBuffer = observedFrame.state;
  stateful.combatHpLossAttributionPending = observedFrame.hpLoss
    ? { hpLoss: observedFrame.hpLoss, observations: observedFrame.state.observations.slice() }
    : null;
  const baselineExit = evaluateCombatHpExitCore({ self, target }, options);
  const disadvantaged = baselineExit?.rule === 'clear-hp-gap';
  const disadvantageSinceAt = disadvantaged
    ? (same && Number(previous?.disadvantageSinceAt || 0) > 0 ? Number(previous.disadvantageSinceAt) : nowMs)
    : 0;
  const disadvantageSamples = disadvantaged
    ? (same ? Math.max(0, Number(previous?.disadvantageSamples || 0)) + 1 : 1)
    : 0;
  const exchangeDegradationSinceAt = same
    ? Math.max(0, Number(previous?.exchangeDegradationSinceAt || 0))
    : 0;
  const exchangeRetreatSinceAt = same
    ? Math.max(0, Number(previous?.exchangeRetreatSinceAt || 0))
    : 0;
  const exchangeRetreatSelfDamageBaseline = same
    ? Math.max(0, Number(previous?.exchangeRetreatSelfDamageBaseline || 0))
    : 0;
  const exchangeRetreatTargetDamageBaseline = same
    ? Math.max(0, Number(previous?.exchangeRetreatTargetDamageBaseline || 0))
    : 0;
  const previousFirstHp = same && Number.isFinite(Number(previous.firstHp)) ? Number(previous.firstHp) : null;
  const firstHp = same ? (previousFirstHp ?? previousHp ?? hp) : hp;
  const previousMinHp = same && Number.isFinite(Number(previous.minHp)) ? Number(previous.minHp) : null;
  const minHp = hp !== null ? Math.min(previousMinHp ?? hp, hp) : previousMinHp;
  const damageFromStart = firstHp !== null && minHp !== null ? Math.max(0, firstHp - minHp) : null;
  const inRange = Number.isFinite(distance)
    && distance <= Math.max(0, Number(options.combatAttackRange || options.attackRange || COMBAT_CONSTANTS.ATTACK_RANGE));
  const incomingOwnerId = target.incomingBullet?.ownerId ?? target.incomingBullet?.owner_id ?? null;
  const targetOwnsRealBullet = Boolean(
    target.incomingBullet
      && !target.incomingBullet.synthetic
      && incomingOwnerId !== null
      && incomingOwnerId !== undefined
      && String(incomingOwnerId) === String(id)
  );
  const previousMetrics = continuesActiveGeneration
    && stateful.combatMetrics?.targetId === String(id)
    ? stateful.combatMetrics
    : {};
  const behaviorMap = ensureOpponentBehaviorMap(stateful);
  const previousBehavior = behaviorMap[String(id)] || null;
  const previousThreatBulletIds = previousMetrics.threatBulletIds || [];
  const previousSeenShotEventIds = previousBehavior?.seenShotEventIds || [];
  const targetBulletIds = [];
  const newShotEvents = [];
  let newBulletCount = 0;
  for (const bullet of options.bullets || []) {
    if (String(bullet?.ownerId ?? '') !== String(id)) continue;
    const bulletId = combatBulletIdentity(bullet);
    if (!bulletId) continue;
    targetBulletIds.push(bulletId);
    if (!previousThreatBulletIds.includes(bulletId)) newBulletCount += 1;
    const createdTick = numberOrNull(bullet?.createdTick ?? bullet?.created_tick);
    if (createdTick !== null && !previousSeenShotEventIds.includes(bulletId)) {
      newShotEvents.push({ bulletId, createdTick });
    }
  }
  const lastIncomingBulletAt = targetBulletIds.length
    ? nowMs
    : (same ? Number(previous.lastIncomingBulletAt || 0) : 0);
  const attributableSelfDamage = Boolean(
    selfDamaged
      && (targetOwnsRealBullet
        || targetBulletIds.length
        || (same && nowMs - Number(previous.lastIncomingBulletAt || 0) <= 1000))
  );
  const creditedHits = damaged
    ? creditCombatHitLearning(
        stateful,
        id,
        Math.max(1, Math.round((previousHp - hp) / 3)),
        nowMs,
        options.currentTick
      )
    : 0;
  const previousSamples = same && Array.isArray(previous.motionSamples) ? previous.motionSamples : [];
  const sampleWindowMs = Math.max(45000, Number(options.combatMotionHistoryWindowMs || 45000));
  const reuseMotionSamples = same && Array.isArray(previous.motionSamples) && Object.isExtensible(previous.motionSamples);
  const motionSamples = reuseMotionSamples ? previousSamples : [];
  if (reuseMotionSamples) {
    let expiredCount = 0;
    while (expiredCount < motionSamples.length
      && nowMs - Number(motionSamples[expiredCount]?.at || 0) > sampleWindowMs) expiredCount += 1;
    if (expiredCount > 0) motionSamples.splice(0, expiredCount);
  } else {
    for (const sample of previousSamples) {
      if (nowMs - Number(sample.at || 0) <= sampleWindowMs) motionSamples.push(sample);
    }
  }
  if (motionSamples.length >= 320) motionSamples.splice(0, motionSamples.length - 319);
  const observedHitRate = learnedBehaviorHitRate(stateful, previousBehavior || { mode: 'mixed/unknown' }, distance)
    ?? (Number(previousMetrics.acceptedShots || 0) >= 5
      ? Number(previousMetrics.confirmedHits || 0) / Math.max(1, Number(previousMetrics.acceptedShots || 0))
      : null);
  motionSamples.push({
    at: nowMs,
    tick: numberOrNull(options.currentTick),
    x: Math.round(Number(target.x) || 0),
    y: Math.round(Number(target.y) || 0),
    vx: numberOrNull(target.vx),
    vy: numberOrNull(target.vy),
    selfX: Math.round(Number(self?.x) || 0),
    selfY: Math.round(Number(self?.y) || 0),
    selfVx: numberOrNull(self?.vx),
    selfVy: numberOrNull(self?.vy),
    distance: Number.isFinite(distance) ? distance : null,
    firing: Boolean(target.firing),
    realBulletPressure: Boolean(targetOwnsRealBullet || targetBulletIds.length),
    hasThreateningBullet: Boolean(targetOwnsRealBullet || targetBulletIds.length),
    newBulletCount: Math.max(0, newBulletCount),
    newShotEvents,
    currentTick: numberOrNull(options.currentTick),
    commandDelayP90Ticks: numberOrNull(options.executionTiming?.p90Ticks),
    targetStamina5s: numberOrNull(target.stamina_5s_remaining_milli ?? target.stamina5sRemainingMilli),
    selfHp: hpValue(self),
    targetHp: hp,
    hitRate: observedHitRate
  });
  const opponentBehaviorState = updateOpponentBehaviorStateCore(previousBehavior, motionSamples[motionSamples.length - 1], {
    nowMs,
    windowMs: Math.min(12000, sampleWindowMs),
    hitRate: observedHitRate
  });
  opponentBehaviorState.probeWeights = previousBehavior?.probeWeights || {
    center: 0.6,
    short: 0.45,
    long: 0.45
  };
  opponentBehaviorState.seenShotEventIds = appendUniqueStringsBounded(
    previousSeenShotEventIds,
    targetBulletIds,
    256
  );
  opponentBehaviorState.recentHitRate = observedHitRate;
  behaviorMap[String(id)] = opponentBehaviorState;
  const fireRiskProfile = opponentMotionProfileCore(self, target, motionSamples, {
    stationarySpeed: options.combatStationarySpeed
  });
  const fireRiskTransition = opponentBehaviorState?.metrics?.movementTransitions || null;
  const fireRiskRecentShots = recentAcceptedShotHitSummary(stateful, id, 15);
  const fireRiskClassification = classifyFireRiskCore(same ? previous?.fireRiskClassification : null, {
    targetId: id,
    nowMs,
    controlStyle: opponentBehaviorState?.dimensions?.controlStyle?.state,
    controlStyleConfidence: opponentBehaviorState?.dimensions?.controlStyle?.confidence,
    maneuverScale: fireRiskProfile.maneuverScale,
    maneuverDurationMs: fireRiskProfile.durationMs,
    lateralFlips: fireRiskProfile.lateralFlips,
    automationLikelihood: opponentBehaviorState?.automationLikelihood,
    routeSamples: fireRiskTransition?.conditionalSampleCount || fireRiskTransition?.transitionCount,
    routeDistribution: fireRiskTransition?.conditionalSampleCount
      ? fireRiskTransition?.conditionalNext
      : fireRiskTransition?.next,
    recentHitRate: fireRiskRecentShots.hitRate,
    recentShotCount: fireRiskRecentShots.shotCount,
    noProgressAcceptedShots: Math.max(
      0,
      Number(previousMetrics.acceptedShots || 0) - Number(same ? previous?.acceptedShotsAtLastDamage || 0 : 0)
    )
  }, options.fireRiskClassification);
  const escapeDecisionState = {
    opponentBehaviorState,
    escapeDecision: same ? previous?.escapeDecision || null : null
  };
  const escapeDecision = withOptionOverrides(options, {
    nowMs
  }, mergedOptions => combatEscapeDecisionCore(self, target, escapeDecisionState, mergedOptions));
  stateful.combatTarget = {
    id,
    at: nowMs,
    firstSeenAt: same ? Number(previous.firstSeenAt || previous.at || nowMs) : nowMs,
    firstSeenTick: same
      ? (numberOrNull(previous.firstSeenTick) ?? numberOrNull(options.currentTick))
      : numberOrNull(options.currentTick),
    name: targetName,
    x: Math.round(Number(target.x) || 0),
    y: Math.round(Number(target.y) || 0),
    hp,
    firstHp,
    minHp,
    damageFromStart,
    displayHp: numberOrNull(target.hp),
    drop: targetDrop,
    dropKnown: targetDropKnown,
    distance,
    active: Boolean(target.active),
    moving: Boolean(target.moving),
    firing: Boolean(target.firing),
    lastFiringAt: target.firing ? nowMs : (same ? Number(previous.lastFiringAt || 0) : 0),
    easyKillKnown: Boolean(target.easyKillKnown),
    easyKillDamagedToday: Boolean(target.easyKillDamagedToday),
    easyKillThreatExempt: Boolean(target.easyKillThreatExempt),
    reason: options.reason || target.reason || 'combat-live-realtime',
    intent: target.combatIntent || (target.incomingBullet ? 'defensive' : 'profit'),
    originIntent: continuesActiveGeneration
      ? String(previous.originIntent || previous.intent || target.combatIntent || '')
      : String(target.combatIntent || ''),
    originReason: continuesActiveGeneration
      ? String(previous.originReason || previous.reason || '')
      : String(options.reason || target.reason || ''),
    lastDamageAt: damaged ? nowMs : (same ? Number(previous.lastDamageAt || previous.at || nowMs) : nowMs),
    acceptedShotsAtLastDamage: damaged
      ? Number(previousMetrics.acceptedShots || 0)
      : (continuesActiveGeneration ? Number(previous.acceptedShotsAtLastDamage || 0) : 0),
    lastSelfDamageAt: selfDamaged ? nowMs : (same ? Number(previous.lastSelfDamageAt || 0) : 0),
    lastSelfDamage: selfDamaged ? Math.max(0, previousSelfHp - currentSelfHp) : 0,
    selfHpLossObserved: selfDamaged,
    hasDamagedSelf: Boolean((same && previous.hasDamagedSelf) || attributableSelfDamage),
    lastThreatAt: attributableSelfDamage || targetBulletIds.length || targetOwnsRealBullet
      ? nowMs
      : (same ? Number(previous.lastThreatAt || 0) : 0),
    incomingHitCount: Math.max(0, Number(same ? previous.incomingHitCount || 0 : 0))
      + (attributableSelfDamage ? Math.max(1, Math.round((previousSelfHp - currentSelfHp) / 3)) : 0),
    lastIncomingBulletAt,
    lastInRangeAt: inRange ? nowMs : (same ? Number(previous.lastInRangeAt || previous.at || nowMs) : nowMs),
    seenTargetRealBulletAt: targetOwnsRealBullet ? nowMs : (same ? Number(previous.seenTargetRealBulletAt || 0) : 0),
    disadvantageSinceAt,
    disadvantageSamples,
    exchangeDegradationSinceAt,
    exchangeRetreatSinceAt,
    exchangeRetreatSelfDamageBaseline,
    exchangeRetreatTargetDamageBaseline,
    lastDamageAmount: damaged ? Math.max(0, previousHp - hp) : Number(previous?.lastDamageAmount || 0),
    noDamageMs: Math.max(0, nowMs - (damaged ? nowMs : (same ? Number(previous.lastDamageAt || previous.at || nowMs) : nowMs))),
    motionSamples,
    opponentBehaviorState,
    fireRiskClassification,
    evasiveAimExperiment: continuesActiveGeneration ? previous.evasiveAimExperiment || null : null,
    probeState: same ? previous.probeState || null : null,
    closeBandReserve: same ? previous.closeBandReserve || null : null,
    ballisticClose: continuesActiveGeneration ? previous.ballisticClose || null : null,
    responsePolicyShadow: same ? previous.responsePolicyShadow || null : null,
    escapeDecision,
    provenHitRate: Math.max(
      Number(same ? previous.provenHitRate || 0 : 0),
      Number(observedHitRate || 0)
    ),
    self: summarizeCombatTarget(self)
  };
  recordRouteTransitionObservation(stateful, id, opponentBehaviorState, nowMs);
  finalizeCombatRouteFeedback(stateful, id, stateful.combatTarget, options.currentTick, nowMs, options);
  const threatBulletIds = appendUniqueStringsBounded(previousThreatBulletIds, targetBulletIds, 200);
  const initialStamina1d = Number(previousMetrics.initialStamina1d);
  const currentStamina1d = Number(self?.stamina_1d_remaining_milli ?? self?.stamina1dRemainingMilli);
  const staminaSpentKnown = Number.isFinite(initialStamina1d) && Number.isFinite(currentStamina1d);
  const totalStaminaSpent = staminaSpentKnown
    ? Math.max(0, initialStamina1d - currentStamina1d)
    : 0;
  const shootingStaminaSpent = Number(previousMetrics.acceptedShots || 0)
    * Math.max(0, Number(options.opportunityShotStaminaCostMs ?? 500));
  const movementStaminaSpent = Math.max(0, totalStaminaSpent - shootingStaminaSpent);
  const learning = ensureCombatLearningState(stateful);
  const modeKey = behaviorLearningKey(opponentBehaviorState, distance, 'all');
  const modeMetrics = combatModeMetricsCell(stateful, modeKey);
  const lastTotals = learning.lastTotalsByTarget[String(id)] || null;
  if (!same) modeMetrics.engagements += 1;
  if (previous && !same) {
    const previousKey = behaviorLearningKey(previous.opponentBehaviorState || { mode: 'mixed/unknown' }, previous.distance, 'all');
    combatModeMetricsCell(stateful, previousKey).disengagements += 1;
  }
  if (selfDamaged) modeMetrics.selfDamage += Math.max(0, previousSelfHp - currentSelfHp);
  if (damaged && !Number(previousMetrics.firstDamageAt || 0)) {
    modeMetrics.firstDamageDelayTotalMs += Math.max(0, nowMs - Number(previousMetrics.startedAt || previous?.firstSeenAt || nowMs));
    modeMetrics.firstDamageSamples += 1;
  }
  if (hp !== null && hp <= 0 && Number(previousHp || 0) > 0) modeMetrics.kills += 1;
  if (lastTotals && String(lastTotals.modeKey || '') !== modeKey) {
    combatModeMetricsCell(stateful, String(lastTotals.modeKey || modeKey)).modeTransitions += 1;
  }
  const totalDelta = lastTotals && same ? Math.max(0, totalStaminaSpent - Number(lastTotals.totalStaminaSpent || 0)) : 0;
  const shotDelta = lastTotals && same ? Math.max(0, Number(previousMetrics.acceptedShots || 0) - Number(lastTotals.acceptedShots || 0)) : 0;
  modeMetrics.chaseStamina += Math.max(0, totalDelta - shotDelta * Math.max(0, Number(options.opportunityShotStaminaCostMs ?? 500)));
  modeMetrics.updatedAt = nowMs;
  learning.lastTotalsByTarget[String(id)] = {
    modeKey,
    totalStaminaSpent,
    actualShots: Number(previousMetrics.actualShots || 0),
    acceptedShots: Number(previousMetrics.acceptedShots || 0),
    at: nowMs
  };
  opponentBehaviorState.modeMetrics = {
    ...modeMetrics,
    averageFirstDamageDelayMs: modeMetrics.firstDamageSamples > 0
      ? Math.round(modeMetrics.firstDamageDelayTotalMs / modeMetrics.firstDamageSamples)
      : null
  };
  const actualShots = Math.max(0, Number(previousMetrics.actualShots || 0));
  const acceptedShots = Math.max(0, Number(previousMetrics.acceptedShots || 0));
  const previousConfirmedHits = Math.min(acceptedShots, Math.max(0, Number(previousMetrics.confirmedHits || 0)));
  const engagementStartedAt = same ? Number(previousMetrics.startedAt || previous?.firstSeenAt || nowMs) : nowMs;
  stateful.combatMetrics = {
    ...previousMetrics,
    targetId: String(id),
    targetName: targetName || previousMetrics.targetName || '',
    engagementId: `${String(id)}:${engagementStartedAt}`,
    controlGeneration: currentControlGeneration || previousControlGeneration,
    engagementGeneration,
    confirmationSequenceBaseline,
    requestSequenceBaseline,
    startedAt: engagementStartedAt,
    startedTick: same
      ? (numberOrNull(previousMetrics.startedTick) ?? numberOrNull(previous?.firstSeenTick) ?? numberOrNull(options.currentTick))
      : numberOrNull(options.currentTick),
    lastObservedAt: nowMs,
    initialSelfHp: same
      ? (numberOrNull(previousMetrics.initialSelfHp) ?? previousSelfHp ?? currentSelfHp)
      : currentSelfHp,
    initialSelfX: same
      ? (numberOrNull(previousMetrics.initialSelfX) ?? currentSelfX)
      : currentSelfX,
    initialSelfY: same
      ? (numberOrNull(previousMetrics.initialSelfY) ?? currentSelfY)
      : currentSelfY,
    lastSelfX: currentSelfX,
    lastSelfY: currentSelfY,
    lastSelfHp: currentSelfHp,
    minSelfHp: currentSelfHp === null
      ? numberOrNull(previousMetrics.minSelfHp)
      : Math.min(numberOrNull(previousMetrics.minSelfHp) ?? currentSelfHp, currentSelfHp),
    initialTargetHp: same
      ? (numberOrNull(previousMetrics.initialTargetHp) ?? previousHp ?? hp)
      : hp,
    lastTargetHp: hp,
    minTargetHp: hp === null
      ? numberOrNull(previousMetrics.minTargetHp)
      : Math.min(numberOrNull(previousMetrics.minTargetHp) ?? hp, hp),
    initialStamina1d: Number.isFinite(initialStamina1d) ? initialStamina1d : (Number.isFinite(currentStamina1d) ? currentStamina1d : null),
    requestedShots: Math.max(actualShots, Number(previousMetrics.requestedShots || 0)),
    acceptedShots,
    unackedShots: Math.max(0, actualShots - acceptedShots),
    confirmedHits: Math.min(acceptedShots, previousConfirmedHits + creditedHits),
    targetDamage: Number(previousMetrics.targetDamage || 0) + (damaged ? previousHp - hp : 0),
    targetHealing: Number(previousMetrics.targetHealing || 0) + (healed ? hp - previousHp : 0),
    incomingHits: Number(previousMetrics.incomingHits || 0) + (selfDamaged ? Math.max(1, Math.round((previousSelfHp - currentSelfHp) / 3)) : 0),
    selfDamage: Number(previousMetrics.selfDamage || 0) + (selfDamaged ? previousSelfHp - currentSelfHp : 0),
    selfHealing: Number(previousMetrics.selfHealing || 0) + (selfHealed ? currentSelfHp - previousSelfHp : 0),
    firstDamageAt: damaged ? (Number(previousMetrics.firstDamageAt || 0) || nowMs) : Number(previousMetrics.firstDamageAt || 0),
    threatBulletIds,
    threatBulletCount: threatBulletIds.length,
    staminaSpentKnown,
    totalStaminaSpent,
    shootingStaminaSpent,
    movementStaminaSpent,
    lastDodgeThreatField: previousMetrics.lastDodgeThreatField || null,
    combatHpLossAttribution: null
  };
  const damageProgressAt = damaged
    ? nowMs
    : (same ? Number(previous.damageProgressAt || previous.lastDamageAt || previous.firstSeenAt || nowMs) : nowMs);
  const movementStaminaAtLastDamage = damaged
    ? movementStaminaSpent
    : (same ? Math.max(0, Number(previous.movementStaminaAtLastDamage || 0)) : 0);
  const stableCloseMinRangeCm = Math.max(0, Number(options.combatEconomicStableCloseMinRangeCm ?? 4500));
  const stableCloseMaxRangeCm = Math.max(
    stableCloseMinRangeCm,
    Number(options.combatEconomicStableCloseMaxRangeCm ?? 5500)
  );
  const insideStableCloseBand = Number.isFinite(distance)
    && distance >= stableCloseMinRangeCm
    && distance <= stableCloseMaxRangeCm;
  const stableCloseStartedAt = insideStableCloseBand
    ? (same && Number(previous.stableCloseStartedAt || 0) > 0 ? Number(previous.stableCloseStartedAt) : nowMs)
    : 0;
  stateful.combatTarget.damageProgressAt = damageProgressAt;
  stateful.combatTarget.acceptedShotsSinceDamage = Math.max(
    0,
    acceptedShots - Number(stateful.combatTarget.acceptedShotsAtLastDamage || 0)
  );
  stateful.combatTarget.movementStaminaAtLastDamage = movementStaminaAtLastDamage;
  stateful.combatTarget.movementStaminaSinceDamage = Math.max(0, movementStaminaSpent - movementStaminaAtLastDamage);
  stateful.combatTarget.stableCloseStartedAt = stableCloseStartedAt;
  stateful.combatTarget.stableCloseMs = stableCloseStartedAt > 0 ? Math.max(0, nowMs - stableCloseStartedAt) : 0;
  stateful.combatMetrics.damageProgressAt = damageProgressAt;
  stateful.combatMetrics.acceptedShotsSinceDamage = stateful.combatTarget.acceptedShotsSinceDamage;
  stateful.combatMetrics.movementStaminaAtLastDamage = movementStaminaAtLastDamage;
  stateful.combatMetrics.movementStaminaSinceDamage = stateful.combatTarget.movementStaminaSinceDamage;
  stateful.combatMetrics.stableCloseMs = stateful.combatTarget.stableCloseMs;
  // The active target object is replaced once per realtime frame. Keep that
  // bounded object by reference here; deep cloning its motion history on the
  // 20 Hz path adds avoidable latency. Worker transport still serializes it at
  // the lower planner cadence.
  stateful.combatEngagements[String(id)] = stateful.combatTarget;
  stateful.combatMetricsByTarget[String(id)] = stateful.combatMetrics;
  const rememberedEngagementIds = Object.keys(stateful.combatEngagements);
  if (rememberedEngagementIds.length > 8) {
    rememberedEngagementIds.sort((left, right) => (
      Number(stateful.combatEngagements[right]?.at || 0)
        - Number(stateful.combatEngagements[left]?.at || 0)
    ));
    for (let index = 8; index < rememberedEngagementIds.length; index += 1) {
      const rememberedId = rememberedEngagementIds[index];
      delete stateful.combatEngagements[rememberedId];
      delete stateful.combatMetricsByTarget[rememberedId];
    }
  }
}

function buildCombatExchangeRetreatMovement(baseMovement, self, target, exchangeStopLoss) {
  const candidates = Array.isArray(baseMovement?.dodge?.threatField)
    ? baseMovement.dodge.threatField.slice()
    : [];
  const selected = candidates.sort((left, right) => (
    Number(left.directHits || 0) - Number(right.directHits || 0)
      || Number(left.unavoidableHits || 0) - Number(right.unavoidableHits || 0)
      || Number(left.avoidableHits || 0) - Number(right.avoidableHits || 0)
      || Number(right.targetDistanceChange || -Infinity) - Number(left.targetDistanceChange || -Infinity)
      || Number(right.minCPA || -Infinity) - Number(left.minCPA || -Infinity)
  ))[0] || null;
  const awayDx = Math.sign(Number(self?.x || 0) - Number(target?.x || 0));
  const awayDy = Math.sign(Number(self?.y || 0) - Number(target?.y || 0));
  const dx = selected ? Number(selected.dx || 0) : awayDx;
  const dy = selected ? Number(selected.dy || 0) : awayDy;
  return {
    ...(baseMovement || {}),
    dx,
    dy,
    reason: 'defensive-exchange-no-progress-retreat',
    modifiers: Array.from(new Set([...(baseMovement?.modifiers || []), 'exchange-stop-loss-retreat'])),
    exchangeRetreat: {
      phase: exchangeStopLoss?.phase || 'retreat',
      reason: exchangeStopLoss?.reason || '',
      retreatSinceAt: exchangeStopLoss?.retreatSinceAt || 0,
      safeDistanceCm: exchangeStopLoss?.safeDistanceCm ?? null,
      safeDistanceReached: Boolean(exchangeStopLoss?.safeDistanceReached),
      selectedThreatCandidate: selected ? {
        dx,
        dy,
        directHits: Number(selected.directHits || 0),
        unavoidableHits: Number(selected.unavoidableHits || 0),
        minCPA: Number.isFinite(Number(selected.minCPA)) ? Number(selected.minCPA) : null,
        targetDistanceChange: Number.isFinite(Number(selected.targetDistanceChange))
          ? Number(selected.targetDistanceChange)
          : null
      } : null
    }
  };
}

function buildBrowserlessCombatDryRun(state = {}, options = {}) {
  const realtime = state?.realtime || {};
  const dataGaps = [];
  const liveCombatEnabled = options.liveCombatEnabled === true || options.combatEnabled === true;
  const normalizedCombatInput = state?.[NORMALIZED_COMBAT_INPUT] === true;
  const self = normalizedCombatInput
    ? (realtime.self || null)
    : normalizeCombatEntity(realtime.self, null, options);
  if (!self) dataGaps.push('missing-realtime-self');
  const selfUserId = Number(self?.user_id ?? state?.userId ?? options.userId ?? 0);
  const entities = [];
  for (const entity of Array.isArray(realtime.entities) ? realtime.entities : []) {
    const normalized = normalizedCombatInput ? entity : normalizeCombatEntity(entity, self, options);
    if (normalized) entities.push(normalized);
  }
  const targets = entities.filter(entity => Number(entity.user_id) !== selfUserId);
  const bullets = (Array.isArray(realtime.bullets) ? realtime.bullets : [])
    .map(bullet => normalizeCombatBullet(bullet, self, { currentTick: realtime.tick }))
    .filter(Boolean);
  if (!bullets.length) dataGaps.push('no-realtime-bullet-evidence');
  const stateful = options.decisionState || options.stateful || null;
  const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  const targetFrameGapHoldMaxMs = combatTargetFrameGapHoldLimit(options);
  let targetFrameGapReset = null;
  const previousTargetIdForGap = String(stateful?.combatTarget?.id ?? '');
  const previousTargetAtForGap = Number(stateful?.combatTarget?.at || 0);
  const currentVisibleTargetForGap = previousTargetIdForGap
    ? targets.find(item => String(combatTargetId(item) || '') === previousTargetIdForGap) || null
    : null;
  const previousGapState = stateful?.combatTargetFrameGap;
  const previousGapMatchesTarget = Boolean(
    previousGapState
      && String(previousGapState.targetId ?? '') === previousTargetIdForGap
  );
  const gapAgeBeforeSelectionMs = previousTargetAtForGap > 0
    ? Math.max(0, nowMs - previousTargetAtForGap)
    : null;
  const previousClosePressureActive = Boolean(
    stateful?.combatTarget?.closePressure?.active === true
      || stateful?.combatTarget?.combatPhase === 'close-pressure'
  );
  if (stateful && previousTargetIdForGap) {
    if (!currentVisibleTargetForGap) {
      if ((previousGapMatchesTarget || previousClosePressureActive)
        && gapAgeBeforeSelectionMs !== null
        && gapAgeBeforeSelectionMs > targetFrameGapHoldMaxMs) {
        targetFrameGapReset = resetCombatEngagementAfterFrameGap(
          stateful,
          previousTargetIdForGap,
          nowMs,
          gapAgeBeforeSelectionMs,
          targetFrameGapHoldMaxMs
        );
      } else {
        stateful.combatTargetFrameGap = {
          targetId: previousTargetIdForGap,
          lastVisibleAt: previousTargetAtForGap,
          missingSince: previousGapMatchesTarget
            ? Number(previousGapState.missingSince || nowMs)
            : nowMs
        };
      }
    } else if (previousGapMatchesTarget) {
      const reappearanceAgeMs = Number.isFinite(Number(previousGapState.lastVisibleAt))
        ? Math.max(0, nowMs - Number(previousGapState.lastVisibleAt))
        : gapAgeBeforeSelectionMs;
      if (reappearanceAgeMs !== null && reappearanceAgeMs > targetFrameGapHoldMaxMs) {
        targetFrameGapReset = resetCombatEngagementAfterFrameGap(
          stateful,
          previousTargetIdForGap,
          nowMs,
          reappearanceAgeMs,
          targetFrameGapHoldMaxMs
        );
      } else {
        stateful.combatTargetFrameGap = null;
      }
    } else if (stateful.combatTargetFrameGap) {
      stateful.combatTargetFrameGap = null;
    }
  }
  const incomingBullet = pickIncomingBullet(bullets, options);
  const selfStamina5s = numberOrNull(
    self?.stamina_5s_remaining_milli
      ?? self?.stamina5sRemainingMilli
      ?? self?.stamina5s
  );
  const selfHp = hpValue(self);
  const configuredLowHpThreshold = numberOrNull(
    options.combatLowHpLeaveThreshold
      ?? options.combatLowHpThreshold
      ?? options.lowHpThreshold
  );
  const lowHpThreshold = Math.max(0, configuredLowHpThreshold ?? COMBAT_CONSTANTS.LOW_HP_THRESHOLD);
  const configuredWhitelistCheck = typeof options.whitelistCheck === 'function'
    ? options.whitelistCheck
    : null;
  const configuredTargetWhitelist = targetWhitelistFromOptions(options);
  const establishedDefensiveTargetId = [stateful?.combatTarget?.intent, stateful?.combatTarget?.originIntent]
    .some(intent => String(intent || '') === 'defensive')
    ? String(stateful?.combatTarget?.id ?? '')
    : '';
  const directClosingTargetId = directClosingDynamicWhitelistTargetId(
    self,
    targets,
    stateful,
    options
  );
  const context = {
    userId: selfUserId,
    bullets,
    incomingBullet,
    incomingBulletOwnerId: incomingBullet?.ownerId,
    unknownIncoming: Boolean(incomingBullet && (incomingBullet.ownerId === null || incomingBullet.ownerId === undefined)),
    easyKillPreferredTargetId: options.easyKillPreferredTargetId,
    defensiveEngagementTargetId: establishedDefensiveTargetId || directClosingTargetId,
    recoveringSelf: Boolean(
      self
        && selfHp !== null
        && selfHp < (numberOrNull(self.max_hp ?? self.maxHp) ?? 100)
    ),
    lowHpSelf: selfHp !== null && selfHp <= lowHpThreshold,
    healthyRecoveryCombat: Boolean(
      selfHp !== null
        && selfHp > lowHpThreshold
        && previousActionWasRecoveryCore(stateful?.lastDecisionAction)
    ),
    selfStamina5s,
    proactiveActiveCombatMinimumStamina5s: Number(
      options.combatProactiveActiveMinStamina5s
        ?? options.combatOpponentProbeReserveMs
        ?? 5600
    ),
    whitelistCheck: target => Boolean(
      target?.whitelisted === true
        || configuredWhitelistCheck?.(target)
        || targetIsWhitelisted(target, configuredTargetWhitelist)
    )
  };
  const combatAttackRange = Math.max(0, Number(options.combatAttackRange || options.attackRange || COMBAT_CONSTANTS.ATTACK_RANGE));
  const afkProfitCommitment = withOptionOverrides(options, {
      nowMs: options.nowMs,
      combatAttackRange
  }, mergedOptions => recentAfkAttackCommitmentCore(
    stateful?.lastDecisionAction,
    targets,
    mergedOptions
  ));
  const combatDodgeRange = combatAttackRange + Math.max(0, Number(options.combatDodgeRangeBuffer ?? COMBAT_CONSTANTS.DODGE_RANGE_BUFFER));
  const contactEntryGuard = withOptionOverrides(options, {
    currentTick: realtime.tick,
    executionTiming: state?.command?.shooting?.timing || options.executionTiming,
    movementExecutionTiming: state?.command?.movement?.timing || options.movementExecutionTiming,
    pendingVelocityCommands: state?.command?.movement?.pendingVelocityCommands || options.pendingVelocityCommands
  }, mergedOptions => updateContactEntryGuard(stateful, self, targets, bullets, mergedOptions));
  const candidates = targets
    .filter(target => isCombatEligibleThreat(target, context))
    .filter(target => {
      const distance = Number(target.distance);
      if (!Number.isFinite(distance)) return false;
      if (distance <= combatAttackRange) return true;
      if (target.dynamicWhitelistMember || target.creatorProtected || target.legacyWhitelistProtected) return false;
      return incomingBullet
        && incomingBullet.ownerId !== null
        && incomingBullet.ownerId !== undefined
        && String(incomingBullet.ownerId) === String(target.user_id)
        && distance <= combatDodgeRange;
    })
    .map(target => ({
      ...target,
      combatScore: calculateCombatTargetPriority(self, target, context)
    }))
    .sort((a, b) => Number(b.combatScore || 0) - Number(a.combatScore || 0));
  let retainedCombatTargetState = stateful?.combatTarget || null;
  if (!retainedCombatTargetState && stateful?.combatEngagements) {
    for (const remembered of Object.values(stateful.combatEngagements)) {
      if (remembered?.combatPhase !== 'close-pressure' && remembered?.closePressure?.active !== true) continue;
      if (!retainedCombatTargetState || Number(remembered.at || 0) > Number(retainedCombatTargetState.at || 0)) {
        retainedCombatTargetState = remembered;
      }
    }
  }
  const engagedTarget = withOptionOverrides(options, context, mergedOptions => (
    pickEngagedCombatTargetCore(self, candidates, targets, bullets, stateful, mergedOptions)
  ));
  const defensiveTarget = selectBestCombatTarget(self, candidates, context);
  const preferredEasyTargetId = options.easyKillPreferredTargetId;
  const preferredEasyTarget = preferredEasyTargetId === null || preferredEasyTargetId === undefined || preferredEasyTargetId === ''
    ? null
    : candidates.find(candidate => candidate.easyKillProfitTarget === true
      && String(combatTargetId(candidate)) === String(preferredEasyTargetId)) || null;
  const unprotectedProposedTarget = defensiveTargetOverridesEngagedCore(engagedTarget, defensiveTarget, options)
    ? defensiveTarget
    : (engagedTarget
        || (defensiveTarget?.combatIntent === 'defensive' ? defensiveTarget : null)
        || (preferredEasyTarget ? {
          ...preferredEasyTarget,
          combatIntent: context.healthyRecoveryCombat === true ? 'recovery-contact' : 'profit'
        } : null)
        || defensiveTarget);
  const afkCommitmentBlocksProactiveCombat = Boolean(
    afkProfitCommitment
      && unprotectedProposedTarget
      && !combatTargetThreatensSelf(unprotectedProposedTarget, context)
  );
  const proposedNormalTarget = afkCommitmentBlocksProactiveCombat ? null : unprotectedProposedTarget;
  const currentTargetId = String(stateful?.combatTarget?.id || '');
  const currentVisibleTarget = currentTargetId
    ? targets.find(item => String(combatTargetId(item) || '') === currentTargetId) || null
    : null;
  const currentVisibleHp = currentVisibleTarget?.hp ?? currentVisibleTarget?.knownHp ?? currentVisibleTarget?.displayHp;
  const currentInvalid = Boolean(
    currentTargetId
      && (!currentVisibleTarget
        || isInvulnerableEntity(currentVisibleTarget)
        || currentVisibleTarget.alive === false
        || (currentVisibleHp !== null && currentVisibleHp !== undefined && Number(currentVisibleHp) <= 0)
        || isHardCombatProtectedTarget(currentVisibleTarget, options)
        || dynamicWhitelistDistanceGuardBlocksCombatCore(currentVisibleTarget, {
          incomingOverride: Boolean((bullets || []).some(bullet => (
            String(bullet?.ownerId ?? '') === String(combatTargetId(currentVisibleTarget) || '')
              && incomingBulletHasCollisionRiskCore(bullet, options)
          ))),
          defensiveEngagement: [stateful?.combatTarget?.intent, stateful?.combatTarget?.originIntent]
            .some(intent => String(intent || '') === 'defensive')
        }))
  );
  const urgentSafety = defensiveTargetOverridesEngagedCore(engagedTarget || currentVisibleTarget, defensiveTarget, options)
    && String(combatTargetId(defensiveTarget) || '') === String(combatTargetId(proposedNormalTarget) || '');
  const proposedTargetId = combatTargetId(proposedNormalTarget);
  const currentThreat = combatTargetIncomingThreatEvidenceCore(bullets, currentTargetId, options);
  const proposedThreat = combatTargetIncomingThreatEvidenceCore(bullets, proposedTargetId, options);
  const defensiveThreatBullet = (bullets || [])
    .filter(bullet => bullet?.incoming === true && incomingBulletHasCollisionRiskCore(bullet, options))
    .sort((left, right) => Number(left.timeToImpact ?? Infinity) - Number(right.timeToImpact ?? Infinity))[0] || null;
  const switchDecision = applyCombatTargetSwitchHysteresisCore({
    currentTargetId,
    currentVisibleTarget,
    proposedTarget: proposedNormalTarget,
    currentInvalid,
    urgentSafety,
    currentThreat,
    proposedThreat,
    defensiveThreatOwnerId: defensiveThreatBullet?.ownerId ?? null,
    currentTargetFinishable: stateful?.combatTarget?.finishability,
    proposedThreatDamageProgress: Boolean(stateful?.combatTarget?.proposedThreatDamageProgress),
    currentStickAgeMs: Math.max(0, Number(options.nowMs || Date.now()) - Number(stateful?.combatTarget?.at || options.nowMs || Date.now())),
    lastSwitch: stateful?.combatTargetSwitchHistory || null,
    nowMs: options.nowMs
  }, stateful?.combatTargetSwitchGate || null, {
    confirmTicks: options.combatTargetSwitchConfirmTicks ?? 3,
    urgentConfirmTicks: options.combatTargetSwitchUrgentConfirmTicks ?? 3,
    oscillationWindowMs: options.combatTargetSwitchOscillationWindowMs ?? 10000,
    threatTtiAdvantageMs: options.combatTargetSwitchThreatTtiAdvantageMs ?? 250,
    threatDistanceAdvantageCm: options.combatTargetSwitchThreatDistanceAdvantageCm ?? 1500,
    urgentReversalTtiAdvantageMs: options.combatTargetSwitchUrgentReversalTtiAdvantageMs ?? 500,
    urgentReversalDistanceAdvantageCm: options.combatTargetSwitchUrgentReversalDistanceAdvantageCm ?? 2500,
    urgentReversalGuardEnabled: options.combatTargetSwitchUrgentReversalGuardEnabled === true
  });
  if (stateful && typeof stateful === 'object') {
    stateful.combatTargetSwitchGate = switchDecision.gate;
    if (switchDecision.diagnostic?.allowed === true
      && switchDecision.diagnostic.fromTargetId
      && switchDecision.diagnostic.toTargetId) {
      stateful.combatTargetSwitchHistory = {
        fromTargetId: switchDecision.diagnostic.fromTargetId,
        toTargetId: switchDecision.diagnostic.toTargetId,
        at: Number(options.nowMs || Date.now()),
        reason: switchDecision.diagnostic.reason
      };
    }
  }
  const normalTarget = switchDecision.target;
  const contactTarget = contactEntryGuard.active === true ? contactEntryGuard.target : null;
  const contactApplies = Boolean(
    contactTarget
      && (!normalTarget || String(combatTargetId(normalTarget) || '') === String(combatTargetId(contactTarget) || ''))
  );
  const contactEntryOnly = Boolean(contactApplies && !normalTarget);
  const target = normalTarget || (contactApplies
    ? { ...contactTarget, combatIntent: 'defensive', contactEntryOnly: true }
    : null);
  let profitEscortContinuityUpdate = null;
  const targetFrameGapState = !target
    && currentTargetId
    && !currentVisibleTarget
    && stateful?.combatTarget
    && String(stateful.combatTarget.id ?? '') === currentTargetId
    ? stateful.combatTarget
    : null;
  const targetFrameGapOriginIntent = String(
    targetFrameGapState?.originIntent || targetFrameGapState?.intent || ''
  );
  const targetFrameGapLastVisibleAt = Number(targetFrameGapState?.at || 0);
  const targetFrameGapAgeMs = targetFrameGapLastVisibleAt > 0
    ? Math.max(0, Number(options.nowMs || Date.now()) - targetFrameGapLastVisibleAt)
    : null;
  const targetFrameGapHold = self
    && targetFrameGapState
    && targetFrameGapOriginIntent
    && targetFrameGapOriginIntent !== 'afk-profit'
    && targetFrameGapAgeMs !== null
    && targetFrameGapAgeMs <= targetFrameGapHoldMaxMs
    ? {
        active: true,
        reason: 'combat-target-frame-gap-hold',
        targetId: currentTargetId,
        targetName: String(targetFrameGapState.name || ''),
        currentIntent: String(targetFrameGapState.intent || ''),
        originIntent: targetFrameGapOriginIntent,
        lastVisibleAt: targetFrameGapLastVisibleAt,
        ageMs: Math.round(targetFrameGapAgeMs),
        maxAgeMs: Math.round(targetFrameGapHoldMaxMs)
      }
    : null;
  if (stateful && (!self || !target)) stateful.combatMovementStability = null;
  const previousCombatTargetState = retainedCombatTargetState;
  if (!contactEntryOnly) withOptionOverrides(options, {
    bullets,
    currentTick: realtime.tick,
    commandShooting: state?.command?.shooting || null,
    pendingVelocityCommands: state?.command?.movement?.pendingVelocityCommands || options.pendingVelocityCommands,
    executionTiming: state?.command?.shooting?.timing || options.executionTiming,
    movementExecutionTiming: state?.command?.movement?.timing || options.movementExecutionTiming,
    reason: liveCombatEnabled ? 'combat-live-realtime' : (options.controlMode === 'combat-dry-run' ? 'combat-dry-run-realtime' : 'realtime-visible-threat')
  }, mergedOptions => rememberBrowserlessCombatEngagement(stateful, self, target, mergedOptions));
  if (!contactEntryOnly && target) {
    profitEscortContinuityUpdate = reconcileBrowserlessProfitEscortContinuity(
      stateful,
      self,
      target,
      realtime,
      bullets,
      options
    );
  } else {
    const continuityReleaseReason = targetFrameGapReset
      ? 'combat-engagement-frame-gap-expired'
      : (!target && !targetFrameGapHold && !contactEntryOnly ? 'combat-target-released' : '');
    profitEscortContinuityUpdate = reconcileBrowserlessProfitEscortContinuity(
      stateful,
      self,
      null,
      realtime,
      bullets,
      options,
      continuityReleaseReason
    );
  }
  if (!contactEntryOnly) syncCombatShotExecutionEvents(stateful, state, target);
  if (!contactEntryOnly) syncConfirmedCombatShots(stateful, state, target, {
    behavior: stateful?.opponentBehaviorStates?.[String(combatTargetId(target) || '')] || null
  }, options);
  const combatTargetState = contactEntryOnly ? null : stateful?.combatTarget || null;
  const phaseMetricsStartedAt = target
    && String(stateful?.combatMetrics?.targetId ?? '') === String(combatTargetId(target))
    && Number.isFinite(Number(stateful?.combatMetrics?.startedAt))
    ? Number(stateful.combatMetrics.startedAt)
    : null;
  const combatPhaseState = combatTargetState && target
    ? {
        targetId: combatTargetId(target),
        nowMs: options.nowMs,
        engagedAt: phaseMetricsStartedAt ?? combatTargetState.firstSeenAt ?? combatTargetState.at,
        firstSeenAt: combatTargetState.firstSeenAt,
        firstHp: combatTargetState.firstHp,
        minHp: combatTargetState.minHp,
        targetHp: hpValue(target),
        hp: combatTargetState.hp,
        damageFromStart: combatTargetState.damageFromStart,
        damageKnown: combatTargetState.damageKnown ?? (
          combatTargetState.damageFromStart !== null
            && combatTargetState.damageFromStart !== undefined
        ),
        targetDamageTotal: Math.max(0, Number(stateful?.combatMetrics?.targetDamage || 0)),
        totalStaminaSpentMilli: stateful?.combatMetrics?.staminaSpentKnown === false
          ? null
          : (Number.isFinite(Number(stateful?.combatMetrics?.totalStaminaSpent))
          ? Math.max(0, Number(stateful.combatMetrics.totalStaminaSpent))
          : null),
        targetDrop: combatTargetState.drop ?? target.drop,
        hardSafety: combatTargetState.hardSafety,
        distance: Number(target.distance),
        acceptedShotsSinceDamage: Math.max(
          0,
          Number(stateful?.combatMetrics?.acceptedShots || 0)
            - Number(combatTargetState.acceptedShotsAtLastDamage || 0)
        ),
        damageProgressAt: Number(combatTargetState.damageProgressAt
          || combatTargetState.lastDamageAt
          || combatTargetState.firstSeenAt
          || options.nowMs),
        lastDamageAt: combatTargetState.lastDamageAt,
        movementStaminaSinceDamage: Number(combatTargetState.movementStaminaSinceDamage || 0),
        shootingStaminaSinceDamage: Math.max(
          0,
          Number(stateful?.combatMetrics?.acceptedShots || 0)
            - Number(combatTargetState.acceptedShotsAtLastDamage || 0)
        ) * Math.max(1, Number(options.combatShotStaminaCostMs ?? 500)),
        originIntent: combatTargetState.originIntent,
        intent: combatTargetState.intent,
        ordinaryProfit: ['profit', 'engaged', 'reengage', 'afk-profit'].includes(String(
          combatTargetState.originIntent || combatTargetState.intent || target.combatIntent || ''
        ))
      }
    : (!target && retainedCombatTargetState?.closePressure?.active === true
        ? (() => {
            const retainedMetrics = stateful?.combatMetricsByTarget?.[String(retainedCombatTargetState.id)]
              || stateful?.combatMetrics
              || {};
            return {
            targetId: retainedCombatTargetState.id,
            nowMs: options.nowMs,
            engagedAt: retainedCombatTargetState.firstSeenAt ?? retainedCombatTargetState.at,
            firstSeenAt: retainedCombatTargetState.firstSeenAt,
            firstHp: retainedCombatTargetState.firstHp,
            minHp: retainedCombatTargetState.minHp,
            targetHp: retainedCombatTargetState.hp,
            hp: retainedCombatTargetState.hp,
            damageFromStart: retainedCombatTargetState.damageFromStart,
            damageKnown: true,
            targetDamageTotal: Math.max(0, Number(
              retainedMetrics.targetDamage ?? retainedCombatTargetState.damageFromStart ?? 0
            )),
            totalStaminaSpentMilli: retainedMetrics.staminaSpentKnown === false
              ? null
              : (Number.isFinite(Number(retainedMetrics.totalStaminaSpent))
              ? Math.max(0, Number(retainedMetrics.totalStaminaSpent))
              : null),
            targetDrop: retainedCombatTargetState.drop,
            hardSafety: retainedCombatTargetState.hardSafety,
            distance: null,
            acceptedShotsSinceDamage: Math.max(0, Number(
              retainedCombatTargetState.acceptedShotsSinceDamage || 0
            )),
            damageProgressAt: Number(retainedCombatTargetState.damageProgressAt
              || retainedCombatTargetState.lastDamageAt
              || retainedCombatTargetState.firstSeenAt
              || options.nowMs),
            lastDamageAt: retainedCombatTargetState.lastDamageAt,
            movementStaminaSinceDamage: Number(retainedCombatTargetState.movementStaminaSinceDamage || 0),
            shootingStaminaSinceDamage: Math.max(0, Number(
              retainedCombatTargetState.acceptedShotsSinceDamage || 0
            )) * Math.max(1, Number(options.combatShotStaminaCostMs ?? 500)),
            originIntent: retainedCombatTargetState.originIntent,
            intent: retainedCombatTargetState.intent,
            ordinaryProfit: ['profit', 'engaged', 'reengage', 'afk-profit'].includes(String(
              retainedCombatTargetState.originIntent || retainedCombatTargetState.intent || ''
            ))
            };
          })()
        : null);
  const combatPhase = combatPhaseState
    ? withOptionOverrides(options, {
        movementExecutionTiming: state?.command?.movement?.timing || options.movementExecutionTiming,
        executionTiming: state?.command?.shooting?.timing || options.executionTiming
      }, mergedOptions => combatPressurePhaseCore(
        previousCombatTargetState || {},
        combatPhaseState,
        mergedOptions
      ))
    : null;
  const combatPhaseOwner = combatTargetState || (!target ? retainedCombatTargetState : null);
  if (combatPhaseOwner && combatPhase) {
    combatPhaseOwner.combatPhase = combatPhase.phase;
    combatPhaseOwner.phaseStartedAt = combatPhase.phaseStartedAt;
    combatPhaseOwner.closePressure = combatPhase.active ? combatPhase : null;
    combatPhaseOwner.combatEfficiency = combatPhase.combatEfficiency || null;
    if (stateful?.combatEngagements && combatPhaseOwner.id !== null && combatPhaseOwner.id !== undefined) {
      stateful.combatEngagements[String(combatPhaseOwner.id)] = combatPhaseOwner;
    }
  }
  if (combatTargetState && target && combatPhase) {
    const experiment = updateEvasiveAimExperimentCore(
      combatTargetState.evasiveAimExperiment || null,
      {
        targetId: combatTargetId(target),
        engagementGeneration: stateful?.combatMetrics?.engagementGeneration,
        startedAt: stateful?.combatMetrics?.startedAt ?? combatTargetState.firstSeenAt,
        startedTick: stateful?.combatMetrics?.startedTick ?? combatTargetState.firstSeenTick,
        nowMs: options.nowMs,
        evaluationWindowMs: combatPhase.evaluationWindowMs,
        referenceDamageHp: combatPhase.attackEfficiency?.referenceDamageHp,
        expectedDamagePerHitHp: combatPhase.attackEfficiency?.expectedDamagePerShot,
        acceptedShots: stateful?.combatMetrics?.acceptedShots,
        confirmedHits: stateful?.combatMetrics?.confirmedHits,
        behavior: combatTargetState.opponentBehaviorState
      },
      {
        enabled: options.combatEvasiveAimEnabled !== false,
        triggerEnabled: options.combatEvasiveAimTriggerEnabled === true,
        earlyDetectionEnabled: options.combatEvasiveAimEarlyDetectionEnabled !== false,
        minimumEarlyAcceptedShots: 20,
        behaviorDetection: {
          minimumConfidence: 0.7,
          minimumSampleCount: 8,
          minimumDurationMs: 2500,
          minimumTransitions: 4,
          minimumConditionalSamples: 8
        }
      }
    );
    combatTargetState.evasiveAimExperiment = experiment;
    if (stateful?.combatEngagements && combatTargetState.id !== null && combatTargetState.id !== undefined) {
      stateful.combatEngagements[String(combatTargetState.id)] = combatTargetState;
    }
  }
  const metricsMatchTarget = Boolean(
    target
      && stateful?.combatMetrics?.targetId !== null
      && stateful?.combatMetrics?.targetId !== undefined
      && String(stateful.combatMetrics.targetId) === String(combatTargetId(target))
  );
  const metricStartedAtMs = metricsMatchTarget ? numberOrNull(stateful?.combatMetrics?.startedAt) : null;
  const targetStartedAtMs = target ? numberOrNull(combatTargetState?.firstSeenAt ?? combatTargetState?.at) : null;
  const combatStartedAtMs = metricStartedAtMs ?? targetStartedAtMs;
  const combatDurationMs = combatStartedAtMs === null
    ? null
    : Math.max(0, (Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now()) - combatStartedAtMs);
  const combatMovementDistance = (() => {
    const metrics = stateful?.combatMetrics || {};
    const startX = numberOrNull(metrics.initialSelfX);
    const startY = numberOrNull(metrics.initialSelfY);
    const currentX = numberOrNull(self?.x);
    const currentY = numberOrNull(self?.y);
    if ([startX, startY, currentX, currentY].some(value => value === null)) return null;
    return Math.round(Math.hypot(currentX - startX, currentY - startY));
  })();
  const shotOriginDiagnostics = currentCombatShotOriginDiagnostics(state, stateful, target);
  let aim = withOptionOverrides(options, {
    combatTargetState,
    observedTick: realtime.tick,
    realtimeStateObservedAtMs: realtime.receivedAtMs,
    executionTiming: state?.command?.shooting?.timing || options.executionTiming,
    latestConfirmedShot: shotOriginDiagnostics.latestConfirmedShot,
    shooterOriginErrorSummary: shotOriginDiagnostics.shooterOriginErrorSummary,
    actualShots: stateful?.combatMetrics?.acceptedShots || stateful?.combatMetrics?.actualShots || 0
  }, mergedOptions => estimateAim(self, target, mergedOptions));
  if (!aim.ok) dataGaps.push(aim.reason);
  if (aim.ok) {
    const baselineAim = { x: Number(aim.x), y: Number(aim.y) };
    const requestedCoverageMode = normalizeTrajectoryCoverageMode(options.combatTrajectoryCoverageMode, 'live-single');
    const transitionDiagnostics = aim.routeCoverage?.movementTransition || null;
    const highEntropyCoverage = Boolean(
      aim.fireRiskClassification?.highEntropy
      || /^high-entropy-/.test(String(aim.routeCoverage?.style || ''))
    );
    const dynamicBehaviorCoverage = Boolean(aim.routeCoverage?.dynamicBehaviorEligible);
    const learnedCoverageReady = Number(transitionDiagnostics?.conditionalSampleCount || 0) >= 12
      || Number(transitionDiagnostics?.globalSamples || 0) >= 8;
    const coverageHitSummary = recentAcceptedShotHitSummary(stateful, combatTargetId(target), 15);
    const coverageSuccessfulAimProtected = coverageHitSummary.shotCount >= 10
      && coverageHitSummary.hitRate >= 0.12;
    const coverageEligible = Boolean(
      requestedCoverageMode !== 'off'
      && target
      && !contactEntryOnly
      && aim.routeCoverage?.candidates?.length
      && aim.fireReachability?.unreachable !== true
      && (highEntropyCoverage || dynamicBehaviorCoverage || learnedCoverageReady)
    );
    const effectiveCoverageMode = requestedCoverageMode === 'live-volley' ? 'shadow' : requestedCoverageMode;
    const targetId = String(combatTargetId(target) || '');
    const coverageSessionId = targetId && combatStartedAtMs !== null
      ? `${targetId}:${Math.round(combatStartedAtMs)}`
      : '';
    const coverageBulletLifetimeTicks = Math.max(
      1,
      Math.round(COMBAT_CONSTANTS.BULLET_RANGE_CM / COMBAT_CONSTANTS.BULLET_SPEED_CM_PER_TICK)
    );
    const coverageHorizonTicks = Math.max(
      1,
      Math.min(
        coverageBulletLifetimeTicks,
        Number.isFinite(Number(aim.flightTicks))
          ? Math.ceil(Number(aim.flightTicks)) + 1
          : coverageBulletLifetimeTicks
      )
    );
    const plan = coverageEligible
      ? buildTrajectoryCoveragePlanCore({
          targetId,
          createdTick: numberOrNull(aim.timing?.createdTickEstimate) ?? numberOrNull(realtime.tick) ?? 0,
          executionDelayTicks: numberOrNull(aim.timing?.executionDelayTicks) ?? 5,
          controlIntervalTicks: Math.max(1, Math.ceil(Number(options.combatControlIntervalMs || 50) / 50)),
          learnedDwellTicks: 0,
          flightTicks: aim.flightTicks,
          predictedShooterOrigin: aim.predictedShooterOrigin,
          predictedTargetAtCreation: aim.predictedTargetAtCreation,
          baselineAim,
          target,
          routeCandidates: aim.routeCoverage.candidates,
          existingShots: [
            ...(state?.command?.shooting?.pendingShots || []),
            ...(state?.command?.shooting?.confirmedShots || [])
          ]
        }, {
          bulletSpeedCmPerTick: COMBAT_CONSTANTS.BULLET_SPEED_CM_PER_TICK,
          bulletLifetimeTicks: coverageBulletLifetimeTicks,
          maxTrajectoryTicks: coverageHorizonTicks,
          hitRadiusCm: COMBAT_CONSTANTS.BULLET_HIT_RADIUS_CM,
          minimumMarginalCoverage: 0.02
        })
      : {
          active: false,
          reason: requestedCoverageMode === 'off'
            ? 'coverage-disabled'
            : (!aim.routeCoverage?.candidates?.length
                ? 'no-route-coverage'
                : (aim.fireReachability?.unreachable === true
                    ? 'intercept-unreachable'
                    : 'coverage-evidence-not-ready')),
          selected: null,
          existingCoverageMass: 0,
          existingHardCoverageMass: 0,
          existingShotCount: 0,
          candidateCount: 0,
          trajectoryCount: 0,
          clusters: [],
          candidates: []
        };
    const trajectoryRouteReliability = trajectoryCoverageRouteReliabilityCore({
      mode: combatTargetState?.opponentBehaviorState?.mode || aim.opponentBehavior?.mode || 'mixed/unknown',
      internalHypothesis: aim.routeCoverage?.selected,
      coverageHypothesis: plan.selected?.hypothesis
    });
    const trajectoryRouteReliable = trajectoryRouteReliability.allowCoverageAim !== false;
    const coverageQualified = shouldApplyTrajectoryCoverageCore({
      mode: effectiveCoverageMode,
      highEntropy: highEntropyCoverage,
      dynamicBehaviorEligible: dynamicBehaviorCoverage,
      successfulAimProtected: coverageSuccessfulAimProtected,
      planActive: plan.active === true,
      hasSelection: Boolean(plan.selected),
      improvementQualified: plan.selected?.improvementQualified === true,
      trajectoryRouteReliable
    });
    const coverageStopRouteRejected = movingTargetStopRouteRejectedCore({
      hypothesis: plan.selected?.hypothesis,
      moving: Boolean(aim.intercept),
      targetSpeed: Math.hypot(Number(target?.vx || 0), Number(target?.vy || 0))
    });
    const coverageCanApply = coverageQualified && !coverageStopRouteRejected;
    let applied = coverageCanApply;
    let coverageAimProof = null;
    if (coverageCanApply) {
      const selectedCandidate = aim.routeCoverage?.candidates?.find(candidate => (
        String(candidate.hypothesis || '') === String(plan.selected.hypothesis || '')
      ));
      const coverageAim = {
        ...aim,
        x: plan.selected.aimX,
        y: plan.selected.aimY,
        mode: `trajectory-coverage-${plan.selected.hypothesis}-${plan.selected.variant}`,
        flightTicks: plan.selected.interceptTick,
        leadDistance: Math.round(Math.hypot(
          Number(plan.selected.aimX) - Number(target.x),
          Number(plan.selected.aimY) - Number(target.y)
        )),
        routeCoverage: {
          ...aim.routeCoverage,
          selected: plan.selected.hypothesis,
          selectedVariant: plan.selected.variant,
          candidates: aim.routeCoverage.candidates.map(candidate => ({
            ...candidate,
            selectedByTrajectoryCoverage: String(candidate.hypothesis || '') === String(plan.selected.hypothesis || '')
          }))
        },
        motionProbe: {
          ...(aim.motionProbe || {}),
          hypothesis: plan.selected.hypothesis,
          trajectoryVariant: plan.selected.variant,
          trajectoryCoverage: true
        },
        trajectoryCoverage: null
      };
      coverageAimProof = evaluateRealtimeTrajectoryAim(coverageAim, {
        ...options,
        observedTick: realtime.tick
      });
      applied = coverageAimProof.valid === true;
      if (applied) {
        const coverageReachability = evaluateAimPointReachabilityCore(
          coverageAim.predictedShooterOrigin,
          { x: coverageAim.x, y: coverageAim.y },
          {
            bulletSpeedCmPerTick: COMBAT_CONSTANTS.BULLET_SPEED_CM_PER_TICK,
            bulletRangeCm: COMBAT_CONSTANTS.BULLET_RANGE_CM,
            bulletLifetimeTicks: Math.round(
              COMBAT_CONSTANTS.BULLET_RANGE_CM / COMBAT_CONSTANTS.BULLET_SPEED_CM_PER_TICK
            ),
            hitRadiusCm: COMBAT_CONSTANTS.BULLET_HIT_RADIUS_CM
          }
        );
        aim = {
          ...coverageAim,
          fireReachability: {
            ...coverageAim.fireReachability,
            actualAimPoint: {
              x: Math.round(coverageAim.x),
              y: Math.round(coverageAim.y),
              ...coverageReachability
            },
            trajectoryAimProof: coverageAimProof,
            trajectoryAimFallback: false,
            trajectoryAimFallbackReason: ''
          },
          trajectoryAimProof: coverageAimProof,
          trajectoryAimFallback: false,
          trajectoryAimFallbackReason: ''
        };
      }
      if (applied && selectedCandidate?.expectedHitProbability !== undefined) {
        aim.expectedHitProbability = selectedCandidate.expectedHitProbability;
      }
    }
    aim.trajectoryCoverage = {
      requestedMode: requestedCoverageMode,
      mode: effectiveCoverageMode,
      applied,
      active: Boolean(plan.active),
      successfulAimProtected: coverageSuccessfulAimProtected,
      successfulAimShotCount: coverageHitSummary.shotCount,
      successfulAimHitRate: coverageHitSummary.hitRate,
      reason: applied
        ? 'live-single-applied'
        : (!trajectoryRouteReliable
        ? 'retreat-route-conflict-fallback'
        : (coverageStopRouteRejected
        ? 'moving-target-stop-route-rejected'
        : (coverageQualified && coverageAimProof
        ? 'dynamic-cpa-unproven-fallback'
        : (requestedCoverageMode === 'live-volley'
        ? 'live-volley-awaits-live-single-acceptance'
        : (effectiveCoverageMode === 'live-single' && plan.active && coverageSuccessfulAimProtected
            ? 'live-single-successful-aim-protected'
            : (effectiveCoverageMode === 'live-single' && plan.active && !highEntropyCoverage && !dynamicBehaviorCoverage
                ? 'live-single-requires-coverage-qualification'
                    : (effectiveCoverageMode === 'live-single' && plan.active && plan.selected?.improvementQualified !== true
                        ? 'live-single-insufficient-aim-improvement'
                    : plan.reason))))))),
      sessionId: coverageSessionId,
      slot: 1,
      selected: plan.selected,
      existingCoverageMass: plan.existingCoverageMass,
      existingHardCoverageMass: plan.existingHardCoverageMass,
      existingShotCount: plan.existingShotCount,
      candidateCount: plan.candidateCount,
      trajectoryCount: plan.trajectoryCount,
      clusters: plan.clusters,
      candidates: plan.candidates,
      trajectoryAimProof: coverageAimProof,
      trajectoryRouteReliability,
      actualAim: { x: aim.x, y: aim.y }
    };
  }
  if (stateful && typeof stateful === 'object' && aim.ok) {
    stateful.combatAim = {
      targetId: combatTargetId(target),
      x: aim.x,
      y: aim.y,
      mode: aim.mode,
      confidence: aim.confidence,
      motionScale: aim.motionScale,
      noDamageMs: aim.noDamageMs,
      noDamageWidened: aim.noDamageWidened,
      noDamageLevel: aim.noDamageLevel,
      motionProbe: aim.motionProbe,
      trajectoryCoverage: aim.trajectoryCoverage,
      evasiveAim: aim.evasiveAim,
      opponentBehavior: aim.opponentBehavior,
      at: Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now()
    };
  }
  let movement = withOptionOverrides(options, {
    combatTargetState,
    executionTiming: state?.command?.shooting?.timing || options.executionTiming,
    movementExecutionTiming: state?.command?.movement?.timing || options.movementExecutionTiming,
    pendingVelocityCommands: state?.command?.movement?.pendingVelocityCommands || options.pendingVelocityCommands,
    realtimeStateObservedAtMs: realtime.receivedAtMs,
    combatDistanceAwareDodgeEnabled: options.combatDistanceAwareDodgeEnabled === true,
    profitMission: options.profitMission || stateful?.profitMission || null,
    profitEscortContinuity: stateful?.profitEscortContinuity || null,
    profitEscortContinuityLastRelease: stateful?.profitEscortContinuityLastRelease || null,
    distanceAwareDodgeState: stateful?.distanceAwareDodgeState || null,
    engagementId: stateful?.combatMetrics?.engagementId || '',
    engagementGeneration: stateful?.combatMetrics?.engagementGeneration || '',
    controlGeneration: stateful?.combatMetrics?.controlGeneration || '',
    currentTick: realtime.tick,
    bullets,
    contactEntryGuard: contactApplies ? contactEntryGuard : null
  }, mergedOptions => buildCombatMovementPlan(self, target, bullets, mergedOptions));
  if (stateful?.profitEscortContinuity?.active === true && movement?.profitEscort?.latched === true) {
    stateful.profitEscortContinuity = {
      ...stateful.profitEscortContinuity,
      lastUpdatedAt: Number(options.nowMs || Date.now()),
      overrideReason: String(movement.profitEscort.overrideReason || ''),
      missionProgress: profitEscortMissionProgress(stateful.profitMission || {})
    };
    movement.profitEscort.continuityExpiresAt = Number(stateful.profitEscortContinuity.expiresAt || 0);
    movement.profitEscort.lastSeenAt = Number(stateful.profitEscortContinuity.lastSeenAt || 0);
  }
  if (stateful?.combatTarget) {
    stateful.combatTarget.ballisticClose = movement?.ballisticClose?.state || null;
    if (stateful.combatEngagements && stateful.combatTarget.id !== null && stateful.combatTarget.id !== undefined) {
      stateful.combatEngagements[String(stateful.combatTarget.id)] = stateful.combatTarget;
    }
  }
  if (stateful && options.combatDistanceAwareDodgeEnabled === true) {
    stateful.distanceAwareDodgeState = movement?.distanceAwareDodge?.state || null;
  } else if (stateful) {
    stateful.distanceAwareDodgeState = null;
  }
  const exitEvaluation = buildCombatExitEvaluation(
    self,
    target,
    combatTargetState || {},
    options,
    stateful?.combatMetrics || combatTargetState?.combatMetrics || null
  );
  if (stateful?.combatTarget && exitEvaluation.exchangeStopLoss) {
    stateful.combatTarget.exchangeDegradationSinceAt = exitEvaluation.exchangeStopLoss.degradationSinceAt;
    stateful.combatTarget.exchangeRetreatSinceAt = exitEvaluation.exchangeStopLoss.retreatSinceAt;
    stateful.combatTarget.exchangeRetreatSelfDamageBaseline = exitEvaluation.exchangeStopLoss.retreatSelfDamageBaseline;
    stateful.combatTarget.exchangeRetreatTargetDamageBaseline = exitEvaluation.exchangeStopLoss.retreatTargetDamageBaseline;
  }
  if (!contactEntryOnly && exitEvaluation.exchangeStopLoss?.disengage) {
    movement = buildCombatExchangeRetreatMovement(
      movement,
      self,
      target,
      exitEvaluation.exchangeStopLoss
    );
  }
  // Contact-entry is movement-only and suppresses ordinary engagement exits,
  // but it must never mask the production emergency HP floor. In particular,
  // an Easy-kill target can be threat-exempt while healthy without keeping a
  // role at or below the critical boundary in game.
  let exitDecision = contactEntryOnly && exitEvaluation.exit?.rule !== 'critical-hp'
    ? null
    : exitEvaluation.exit;
  if (!exitDecision && !contactEntryOnly && combatPhase?.exitRequired) {
    exitDecision = {
      shouldLeave: true,
      policy: 'combat-efficiency-distance-control',
      rule: combatPhase.exitRule || 'closer-range-control-failed',
      reason: 'combat-miss-close-timeout-leave',
      stopMotion: false,
      missClose: cloneJson(combatPhase)
    };
  }
  if (!exitDecision && !contactEntryOnly && exitEvaluation.exchangeStopLoss?.shouldExit) {
    const severePoorExchange = exitEvaluation.exchangeStopLoss.severePoorExchange === true;
    exitDecision = {
      shouldLeave: true,
      policy: severePoorExchange ? 'poor-exchange-stop-loss' : 'defensive-exchange-stop-loss',
      rule: severePoorExchange ? 'cumulative-poor-exchange' : 'defensive-exchange-no-progress',
      reason: severePoorExchange ? 'combat-exit-poor-exchange' : 'defensive-exchange-no-progress-leave',
      stopMotion: false,
      exchangeStopLoss: cloneJson(exitEvaluation.exchangeStopLoss)
    };
  }
  const movementTiming = state?.command?.movement?.timing || options.movementExecutionTiming || {};
  const pendingVelocityCommands = state?.command?.movement?.pendingVelocityCommands || options.pendingVelocityCommands || [];
  const latestPendingVelocity = pendingVelocityCommands.at(-1) || null;
  const currentTick = optionalNumberOrNull(realtime.tick);
  const pendingObservedTick = optionalNumberOrNull(latestPendingVelocity?.observedTick);
  const pendingAgeTicks = currentTick === null || pendingObservedTick === null
    ? null
    : Math.max(0, currentTick - pendingObservedTick);
  const timingUpperTicks = Math.max(
    5,
    Number(movementTiming.p90Ticks || 0),
    Number(movementTiming.medianTicks || 0) + Number(movementTiming.madTicks || 0) * 2
  );
  const previousStableDirection = stateful?.combatMovementStability?.direction || null;
  const visibleDirection = {
    dx: Math.sign(Number(self?.vx || 0)),
    dy: Math.sign(Number(self?.vy || 0))
  };
  const stableDirectionPending = Boolean(
    previousStableDirection
      && latestPendingVelocity
      && Number(latestPendingVelocity.dx || 0) === Number(previousStableDirection.dx || 0)
      && Number(latestPendingVelocity.dy || 0) === Number(previousStableDirection.dy || 0)
      && (Number(visibleDirection.dx) !== Number(previousStableDirection.dx)
        || Number(visibleDirection.dy) !== Number(previousStableDirection.dy))
  );
  const latestVelocityTransition = state?.command?.movement?.actualVelocityTransitions?.at(-1) || null;
  const latestTransitionTick = optionalNumberOrNull(latestVelocityTransition?.tick);
  const recentUnmatchedTransition = Boolean(
    latestVelocityTransition?.attributionConfidence === 'unmatched'
      && currentTick !== null
      && latestTransitionTick !== null
      && currentTick - latestTransitionTick <= 2
  );
  const selectedThreat = (movement?.dodge?.threatField || []).find(item => (
    Number(item?.dx || 0) === Number(movement.dx || 0)
      && Number(item?.dy || 0) === Number(movement.dy || 0)
  )) || null;
  const reactionBudgetMs = optionalNumberOrNull(selectedThreat?.reactionBudgetMs)
    ?? Math.max(0, timingUpperTicks * 50 + 150);
  const newThreatUrgent = (bullets || []).some(bullet => {
    const createdTick = optionalNumberOrNull(bullet?.createdTick ?? bullet?.created_tick);
    const timeToImpact = optionalNumberOrNull(bullet?.timeToImpact);
    return currentTick !== null
      && createdTick !== null
      && createdTick >= currentTick - 1
      && timeToImpact !== null
      && timeToImpact <= reactionBudgetMs;
  });
  const targetId = String(combatTargetId(target) || '');
  const engagementId = String(
    stateful?.combatMetrics?.engagementId
      || `${targetId}:${Number(combatTargetState?.firstSeenAt || combatTargetState?.at || options.nowMs || 0)}`
  );
  const hasCombatMovementSubject = Boolean(self && target && !exitDecision);
  const stabilityDecision = hasCombatMovementSubject
    ? stabilizeCombatMovementDirectionCore({
        nowMs: options.nowMs,
        tick: realtime.tick,
        targetId,
        engagementId,
        candidateDirection: movement,
        currentDirection: visibleDirection,
        pendingDirection: latestPendingVelocity,
        threatField: movement?.dodge?.threatField || [],
        movementTiming,
        previousState: stateful?.combatMovementStability || null,
        hardGateChanged: Boolean(exitDecision || contactEntryOnly),
        commandUpperBoundExpired: Boolean(stableDirectionPending
          && pendingAgeTicks !== null
          && pendingAgeTicks > timingUpperTicks),
        commandUnmatched: recentUnmatchedTransition,
        newThreatUrgent,
        minimumCpaCm: Math.max(
          Number(movement?.movementArbitration?.minimumCpaCm || 0),
          Number(options.combatMovementSafeCpaCm || 0),
          Number(options.combatBulletHitRadiusCm || COMBAT_CONSTANTS.BULLET_HIT_RADIUS_CM) + 110
        )
      }, {
        tickMs: 50,
        materialCpaGainCm: 75
      })
    : {
        state: null,
        direction: { dx: Number(movement.dx || 0), dy: Number(movement.dy || 0) },
        held: false,
        switched: false,
        reason: 'movement-stability-no-combat-subject',
        settlementWindowTicks: null,
        maximumGenerationHoldTicks: null,
        generationAgeTicks: null,
        elapsedTicks: null,
        candidateThreat: null,
        heldThreat: null,
        newDirectHits: 0,
        newUnavoidableHits: 0,
        release: null
      };
  if (stateful) stateful.combatMovementStability = hasCombatMovementSubject ? stabilityDecision.state : null;
  const stabilityEnabled = options.combatMovementStabilityEnabled === true;
  const originalMovementDirection = { dx: Number(movement.dx || 0), dy: Number(movement.dy || 0) };
  const stabilityApplied = Boolean(
    stabilityEnabled
      && stabilityDecision.held
      && (Number(stabilityDecision.direction.dx) !== originalMovementDirection.dx
        || Number(stabilityDecision.direction.dy) !== originalMovementDirection.dy)
  );
  if (stabilityApplied) {
    movement = {
      ...movement,
      dx: Number(stabilityDecision.direction.dx || 0),
      dy: Number(stabilityDecision.direction.dy || 0),
      reason: stabilityDecision.reason,
      modifiers: [...new Set([...(movement.modifiers || []), 'movement-stability-hold'])]
    };
  }
  movement.movementStability = {
    enabled: stabilityEnabled,
    applied: stabilityApplied,
    shadowHeld: Boolean(stabilityDecision.held),
    reason: stabilityDecision.reason,
    generation: optionalNumberOrNull(stabilityDecision.state?.generation),
    settlementWindowTicks: optionalNumberOrNull(stabilityDecision.settlementWindowTicks),
    maximumGenerationHoldTicks: optionalNumberOrNull(stabilityDecision.maximumGenerationHoldTicks),
    generationAgeTicks: optionalNumberOrNull(stabilityDecision.generationAgeTicks),
    elapsedTicks: optionalNumberOrNull(stabilityDecision.elapsedTicks),
    candidateDirection: originalMovementDirection,
    selectedDirection: {
      dx: Number(stabilityDecision.direction.dx || 0),
      dy: Number(stabilityDecision.direction.dy || 0)
    },
    candidateDirectHits: optionalNumberOrNull(stabilityDecision.candidateThreat?.directHits),
    heldDirectHits: optionalNumberOrNull(stabilityDecision.heldThreat?.directHits),
    candidateUnavoidableHits: optionalNumberOrNull(stabilityDecision.candidateThreat?.unavoidableHits),
    heldUnavoidableHits: optionalNumberOrNull(stabilityDecision.heldThreat?.unavoidableHits),
    candidateWorstCaseCpaCm: optionalNumberOrNull(
      stabilityDecision.candidateThreat?.worstCaseCpaCm ?? stabilityDecision.candidateThreat?.minCPA
    ),
    heldWorstCaseCpaCm: optionalNumberOrNull(
      stabilityDecision.heldThreat?.worstCaseCpaCm ?? stabilityDecision.heldThreat?.minCPA
    ),
    newDirectHits: Number(stabilityDecision.newDirectHits || 0),
    newUnavoidableHits: Number(stabilityDecision.newUnavoidableHits || 0),
    counters: stabilityDecision.state?.counters ? { ...stabilityDecision.state.counters } : null,
    release: stabilityDecision.release || null,
    pendingAgeTicks,
    timingUpperTicks
  };
  movement.commandLatency = {
    frameReceivedToDecisionMs: optionalNumberOrNull(latestPendingVelocity?.frameReceivedToDecisionMs),
    decisionToVelocitySendMs: optionalNumberOrNull(latestPendingVelocity?.decisionToVelocitySendMs),
    velocitySendObservedTickAgeMs: optionalNumberOrNull(
      latestPendingVelocity?.velocitySendObservedTickAgeMs ?? latestPendingVelocity?.observedTickAgeAtSendMs
    ),
    velocitySendToVisibleWallMs: optionalNumberOrNull(latestVelocityTransition?.velocitySendToVisibleWallMs),
    visibleTransitionTickDelay: optionalNumberOrNull(latestVelocityTransition?.visibleTransitionTickDelay),
    pendingDepthAtSend: optionalNumberOrNull(latestPendingVelocity?.pendingDepthAtSend),
    replacementsBeforeVisible: optionalNumberOrNull(latestVelocityTransition?.replacementsBeforeVisible),
    attributionConfidence: String(latestVelocityTransition?.attributionConfidence || ''),
    directionGeneration: optionalNumberOrNull(
      latestPendingVelocity?.directionGeneration ?? latestVelocityTransition?.directionGeneration
    )
  };
  if (stateful?.combatMetrics) {
    const hpLossPending = stateful.combatHpLossAttributionPending;
    if (hpLossPending) {
      stateful.combatMetrics.combatHpLossAttribution = completeCombatHpLossAttributionCore(
        hpLossPending,
        {
          selectedDirection: movement?.dodge
            ? { dx: movement.dodge.dx, dy: movement.dodge.dy }
            : { dx: self?.vx, dy: self?.vy },
          threatField: movement?.dodge?.threatField || [],
          commandVisibilityDelayMs: movement.commandLatency.velocitySendToVisibleWallMs,
          movementGeneration: movement.commandLatency.directionGeneration
        },
        options
      );
      stateful.combatHpLossAttributionPending = null;
    } else {
      stateful.combatMetrics.combatHpLossAttribution = null;
    }
    // buildCombatMovementPlan already stores the bounded public threat summary
    // on movement.dodge. Reuse that array for the next-frame attribution state
    // instead of mapping the same threat field a second time.
    stateful.combatMetrics.lastDodgeThreatField = movement?.dodge?.threatField || [];
    stateful.combatMetrics.lastSelectedDodgeDirection = movement?.dodge
      ? { dx: Number(movement.dodge.dx || 0), dy: Number(movement.dodge.dy || 0) }
      : { dx: Number(self?.vx || 0), dy: Number(self?.vy || 0) };
  }
  const closePressureActive = combatTargetState?.combatPhase === 'close-pressure';
  const pressureAttackActive = Boolean(
    closePressureActive
      && (combatPhase?.pressureAttackCommitted || combatTargetState?.closePressure?.pressureAttackCommitted)
  );
  const movementDodgeApplied = Boolean(
    (Array.isArray(movement?.modifiers) && movement.modifiers.includes('dodge'))
      && (Number(movement?.dx || 0) || Number(movement?.dy || 0))
  );
  const dodgeActionCostMs = movementDodgeApplied
    ? Math.max(0, Number(options.combatPreDodgeStaminaCostMs ?? 1000))
    : 0;
  const runtimeHardReserveMs = Math.max(
    0,
    Number(options.combatShootHardReserveMs ?? COMBAT_CONSTANTS.SHOOT_HARD_RESERVE_MS)
  );
  const runtimeDodgeReserveMs = Math.max(
    runtimeHardReserveMs,
    Number(options.combatShootDodgeReserveMs ?? COMBAT_CONSTANTS.SHOOT_DODGE_RESERVE_MS)
  );
  const runtimePressureReserveMs = Math.max(
    runtimeHardReserveMs,
    Number(options.combatShootPressureDodgeReserveMs ?? runtimeDodgeReserveMs)
  );
  const fireDodgeReserveMs = closePressureActive && pressureAttackActive
    ? Math.max(
        runtimeHardReserveMs,
        Number(options.combatClosePressureReserveMs ?? runtimePressureReserveMs)
      )
    : runtimeDodgeReserveMs;
  const fireState = target ? determineCombatFireState(self || {}, target, {
    targetPressureFire: bullets.some(bullet => Number(bullet.ownerId) === Number(target.user_id)),
    closePressure: closePressureActive,
    closePressureAttack: pressureAttackActive,
    closePressureCadenceMs: options.combatClosePressureShootEveryMs ?? 520,
    closePressureReserveMs: options.combatClosePressureReserveMs ?? 2600,
    hardReserveMs: runtimeHardReserveMs,
    dodgeReserveMs: fireDodgeReserveMs,
    pressureReserveMs: runtimePressureReserveMs,
    opponentProbeReserveMs: options.combatOpponentProbeReserveMs ?? COMBAT_CONSTANTS.OPPONENT_PROBE_RESERVE_MS,
    opponentProbeEveryMs: options.combatOpponentProbeEveryMs ?? COMBAT_CONSTANTS.OPPONENT_PROBE_EVERY_MS,
    finishReserveMs: options.combatShootFinishLowThreatDodgeReserveMs ?? COMBAT_CONSTANTS.FINISH_LOW_THREAT_RESERVE_MS,
    passiveReserveMs: options.combatShootPassiveRunnerDodgeReserveMs ?? COMBAT_CONSTANTS.PASSIVE_RUNNER_DODGE_RESERVE_MS,
    shotCostMs: options.combatShotStaminaCostMs ?? 500,
    dodgeActionCostMs,
    passiveRunner: Boolean(movement.passiveRunner?.active),
    finishLowThreat: Boolean(
      target
        && !exitDecision
        && (hpValue(self) ?? 0) >= Math.max(1, Number(options.combatFinishLowThreatMinSelfHp || 60))
        && (hpValue(target) ?? 100) <= Math.max(1, Number(options.combatFinishLowThreatHp ?? COMBAT_CONSTANTS.FINISH_LOW_THREAT_HP))
        && !bullets.some(bullet => Number(bullet.ownerId) === Number(target.user_id))
    )
  }) : { state: 'disabled', cadenceMs: Infinity, reserve: null, reason: 'no-target' };
  const lowConfidence = aim.ok && !closePressureActive
    ? checkLowConfidenceThrottle({ confidence: aim.confidence, distance: aim.distance })
    : { throttle: false, cadenceMs: null };
  const inRange = target ? Number(target.distance || Infinity) <= Number(options.attackRange || COMBAT_CONSTANTS.ATTACK_RANGE) : false;
  const behaviorState = combatTargetState?.opponentBehaviorState || null;
  const behaviorPolicy = behaviorState?.responsePolicy || opponentResponsePolicyCore(behaviorState?.mode || 'mixed/unknown', {
    distance: target?.distance,
    nowMs: options.nowMs
  });
  const selectedRoute = aim.ok && aim.routeCoverage?.selected
    ? aim.routeCoverage.candidates?.find(candidate => candidate.hypothesis === aim.routeCoverage.selected) || null
    : null;
  const selectedRouteProbability = numberOrNull(selectedRoute?.probability);
  const expectedHitProbability = selectedRouteProbability === null
    ? 0
    : Math.max(0, Math.min(1, Number(selectedRoute?.expectedHitProbability
      ?? (selectedRouteProbability * Math.max(0, Math.min(1, Number(aim.confidence || 0)))))));
  const recentHitSummary = recentAcceptedShotHitSummary(stateful, combatTargetId(target), 15);
  const noProgressAcceptedShots = Math.max(
    0,
    Number(stateful?.combatMetrics?.acceptedShots || 0) - Number(combatTargetState?.acceptedShotsAtLastDamage || 0)
  );
  const targetCollisionBullet = target
    ? bullets.find(bullet => Number(bullet.ownerId) === Number(target.user_id)
        && incomingBulletHasCollisionRiskCore(bullet, options)) || null
    : null;
  const defensivePressure = Boolean(
    targetCollisionBullet
      || String(combatTargetState?.originIntent || '') === 'defensive'
      || (Number(combatTargetState?.lastSelfDamageAt || 0) > 0
        && Number(options.nowMs || Date.now()) - Number(combatTargetState.lastSelfDamageAt) <= 3000)
  );
  const responsePolicyBypassReason = exitDecision
    ? 'hp-or-exit'
    : (targetCollisionBullet
        ? 'real-incoming-bullet'
        : (movement?.dodge?.active === true || /dodge/.test(String(movement?.reason || ''))
            ? 'dodge-unsafe'
            : ''));
  const responsePolicyShadow = updateCombatResponsePolicyShadowCore(
    combatTargetState?.responsePolicyShadow || null,
    {
      targetId: combatTargetId(target),
      nowMs: options.nowMs,
      candidatePolicy: behaviorPolicy,
      recognizedMode: behaviorState?.mode || 'mixed/unknown',
      bypassReason: responsePolicyBypassReason
    },
    {
      confirmTicks: options.combatResponsePolicyShadowConfirmTicks ?? 6,
      minimumHoldMs: options.combatResponsePolicyShadowMinimumHoldMs ?? 500
    }
  );
  if (stateful?.combatTarget) stateful.combatTarget.responsePolicyShadow = responsePolicyShadow;
  const fireRisk = aim.fireRiskClassification || combatTargetState?.fireRiskClassification || null;
  const movementPhase = behaviorState?.metrics?.movementPhase
    || behaviorState?.metrics?.movementTransitions?.phase
    || null;
  const probeState = updateCombatProbePhaseCore(combatTargetState?.probeState || null, {
    nowMs: options.nowMs,
    targetId: combatTargetId(target),
    acceptedShots: stateful?.combatMetrics?.acceptedShots,
    confirmedHits: stateful?.combatMetrics?.confirmedHits,
    shootingStamina: stateful?.combatMetrics?.shootingStaminaSpent,
    highEntropy: Boolean(fireRisk?.highEntropy),
    behaviorMode: behaviorState?.mode,
    responsePolicy: behaviorPolicy?.name,
    directionState: movementPhase?.currentDirection,
    directionDwellTicks: movementPhase?.dwellTicks,
    directionFlipAt: behaviorState?.metrics?.lastLateralFlipAt,
    routeContextKey: aim.routeCoverage?.contextKey,
    routeCandidate: aim.routeCoverage?.selected,
    routeProbability: selectedRouteProbability,
    predictedHitProbability: expectedHitProbability,
    recentHitRate: recentHitSummary.hitRate,
    recentShotCount: recentHitSummary.shotCount,
    distance: target?.distance,
    aimX: aim.x,
    aimY: aim.y,
    defensivePressure,
    closePressure: closePressureActive,
    finishingTarget: Boolean(
      (hpValue(target) ?? 100) <= Math.max(1, Number(options.combatFinishLowThreatHp ?? COMBAT_CONSTANTS.FINISH_LOW_THREAT_HP))
        && (hpValue(self) ?? 0) >= (hpValue(target) ?? 0) + 10
    )
  }, options.combatProbePhase);
  if (stateful?.combatTarget) stateful.combatTarget.probeState = probeState;
  const baseHighEntropyFireGate = evaluateHighEntropyFireGateCore({
    expectedHitProbability,
    recentHitRate: recentHitSummary.hitRate,
    recentShotCount: recentHitSummary.shotCount,
    noProgressAcceptedShots,
    noDamageMs: combatTargetState?.noDamageMs,
    targetHp: hpValue(target),
    selfHp: hpValue(self),
    fireRiskClassification: fireRisk,
    highEntropy: Boolean(fireRisk?.highEntropy),
    unreachableIntercept: Boolean(aim.fireReachability?.unreachable),
    reachabilityGapCm: aim.fireReachability?.rangeGapCm,
    defensivePressure,
    closePressure: closePressureActive,
    proactiveCombat: !contactEntryOnly,
    shootingStaminaSpent: noProgressAcceptedShots * Math.max(1, Number(options.combatShotStaminaCostMs ?? 500))
  }, options.highEntropyFireGate);
  const closeBandReserve = updateCloseBandReserveCore(combatTargetState?.closeBandReserve || null, {
    targetId: combatTargetId(target),
    acceptedShots: noProgressAcceptedShots,
    distance: target?.distance,
    coverageQualified: Boolean(
      aim.trajectoryCoverage?.applied
        && Number(aim.trajectoryCoverage?.selected?.marginalCoverage || 0) >= 0.02
    ),
    nowMs: options.nowMs
  }, {
    reservedShots: options.combatCloseBandReserveEnabled === false ? 0 : 2,
    enabled: options.combatCloseBandReserveEnabled !== false,
    requiredBandTicks: 3,
    minRangeCm: 4500,
    maxRangeCm: 5500
  });
  const sharedFireBudget = evaluateCombatFireBudgetCore({
    targetId: combatTargetId(target),
    acceptedShotsSinceDamage: noProgressAcceptedShots,
    fireGate: baseHighEntropyFireGate,
    probeState,
    trajectoryCoverage: aim.trajectoryCoverage,
    closeBandReserve,
    closePressure: closePressureActive,
    pressureAttack: pressureAttackActive,
    boundedPressureVolley: Boolean(
      closePressureActive
        && pressureAttackActive
        && combatPhase?.ordinaryProfit === true
        && (baseHighEntropyFireGate.active || probeState.highEntropy)
        && !baseHighEntropyFireGate.finishProtected
    ),
    finishProtected: baseHighEntropyFireGate.finishProtected,
    resolvedReserveMs: fireState.reserve,
    stamina5s: fireState.stamina5s
  }, {
    minimumMarginalCoverage: 0.02,
    geometryRearmShots: probeState.geometryReprobeMaxShots,
    maxGeometryRearms: probeState.maxGeometryRearms,
    defensiveExtraShots: options.highEntropyFireGate?.defensiveExtraShots ?? 5
  });
  closeBandReserve.lastAuthorization = sharedFireBudget.authorizationSource;
  if (stateful?.combatTarget) {
    stateful.combatTarget.closeBandReserve = closeBandReserve;
  }
  const highEntropyFireGate = {
    ...baseHighEntropyFireGate,
    active: Boolean(baseHighEntropyFireGate.active || probeState.highEntropy),
    suppressFire: sharedFireBudget.suppressFire,
    minimumCadenceMs: Math.max(
      0,
      Number(baseHighEntropyFireGate.minimumCadenceMs || 0),
      closePressureActive
        ? Number(pressureAttackActive
            ? (options.combatShootMinIntervalMs ?? COMBAT_CONSTANTS.SHOOT_EVERY_MS)
            : (options.combatClosePressureShootEveryMs ?? 520))
        : 0
    ),
    reason: sharedFireBudget.suppressFire
      ? sharedFireBudget.suppressionReason
      : baseHighEntropyFireGate.reason,
    probePhase: probeState.probePhase,
    probeBudgetRemaining: probeState.probeBudgetRemaining,
    probeResetReason: probeState.probeResetReason,
    geometryNovelty: probeState.geometryNovelty,
    routeProbability: probeState.routeProbability,
    predictedHitProbability: probeState.predictedHitProbability,
    actualHitAttribution: probeState.actualHitAttribution,
    sharedBudgetUsed: sharedFireBudget.sharedBudgetUsed,
    sharedBudgetMax: sharedFireBudget.sharedBudgetMax,
    sharedBudgetRemaining: sharedFireBudget.sharedBudgetRemaining,
    ordinaryBudgetRemaining: sharedFireBudget.ordinaryBudgetRemaining,
    reservedCloseBandShots: sharedFireBudget.reservedCloseBandShots,
    reservedCloseBandShotsRemaining: sharedFireBudget.reservedCloseBandShotsRemaining,
    closeBandReserveQualified: sharedFireBudget.closeBandReserveQualified,
    closeBandStableQualified: sharedFireBudget.closeBandStableQualified,
    closeRangeFireOverride: sharedFireBudget.closeRangeFireOverride,
    budgetStateInvalid: sharedFireBudget.budgetStateInvalid,
    authorizationSource: sharedFireBudget.authorizationSource,
    marginalCoverage: sharedFireBudget.marginalCoverage,
    coverageQualified: sharedFireBudget.coverageQualified,
    coverageVolleyRequiredStamina: sharedFireBudget.coverageVolleyRequiredStamina,
    coverageVolleyStaminaReady: sharedFireBudget.coverageVolleyStaminaReady,
    suppressionReason: sharedFireBudget.suppressionReason
  };
  const executionCadenceMs = Number.isFinite(Number(fireState.cadenceMs))
    ? Number(fireState.cadenceMs)
    : null;
  const advisoryBaseCadenceMs = Number.isFinite(Number(lowConfidence.cadenceMs)) && lowConfidence.throttle
    ? Number(lowConfidence.cadenceMs)
    : executionCadenceMs;
  const advisoryUnboundedCadenceMs = advisoryBaseCadenceMs === null
    ? null
    : Math.max(
        advisoryBaseCadenceMs,
        Math.max(0, Number(closePressureActive ? 0 : behaviorPolicy?.minimumCadenceMs || 0)),
        closePressureActive
          ? Math.max(0, Number(pressureAttackActive
              ? (options.combatShootMinIntervalMs ?? COMBAT_CONSTANTS.SHOOT_EVERY_MS)
              : (options.combatClosePressureShootEveryMs ?? 520)))
          : 0
      );
  const maximumCadenceMs = closePressureActive ? NaN : Number(behaviorPolicy?.maximumCadenceMs);
  const behaviorBoundedCadenceMs = advisoryUnboundedCadenceMs === null
    ? null
    : (Number.isFinite(maximumCadenceMs) && maximumCadenceMs > 0
        ? Math.max(executionCadenceMs ?? 0, Math.min(advisoryUnboundedCadenceMs, maximumCadenceMs))
        : advisoryUnboundedCadenceMs);
  const advisoryCadenceMs = behaviorBoundedCadenceMs === null
    ? null
    : Math.max(behaviorBoundedCadenceMs, Math.max(0, Number(highEntropyFireGate.minimumCadenceMs || 0)));
  // Once realtime combat is established, behavioral and statistical fire
  // policies stay diagnostic-only. Only physical target/aim/range checks and
  // the dodge-stamina reserve may block or slow an otherwise valid shot.
  const behaviorSuppressFire = Boolean(!closePressureActive && behaviorPolicy?.suppressFire);
  const advisoryFireSuppressionReasons = [
    behaviorSuppressFire ? `response-policy:${String(behaviorPolicy?.reason || behaviorPolicy?.name || 'suppressed')}` : '',
    highEntropyFireGate.suppressFire ? String(highEntropyFireGate.reason || 'ordinary-fire-budget-suppressed') : ''
  ].filter(Boolean);
  const advisoryCadenceReasons = [
    lowConfidence.throttle && Number(lowConfidence.cadenceMs || 0) > Number(executionCadenceMs || 0)
      ? 'low-confidence' : '',
    !closePressureActive && Number(behaviorPolicy?.minimumCadenceMs || 0) > Number(executionCadenceMs || 0)
      ? `response-policy:${String(behaviorPolicy?.name || behaviorPolicy?.reason || 'minimum-cadence')}` : '',
    Number(highEntropyFireGate.minimumCadenceMs || 0) > Number(executionCadenceMs || 0)
      ? `high-entropy:${String(highEntropyFireGate.reason || 'minimum-cadence')}` : ''
  ].filter(Boolean);
  const executionHighEntropyFireGate = {
    ...highEntropyFireGate,
    advisorySuppressFire: Boolean(highEntropyFireGate.suppressFire),
    executionSuppressed: false,
    suppressFire: false
  };
  const {
    wouldShoot,
    finalFireBlocker,
    fireAuthorizationClass
  } = resolveEstablishedCombatFireAuthorizationCore({
    targetPresent: Boolean(target),
    aim,
    aimOk: aim.ok,
    inRange,
    fireState,
    contactEntryOnly
  });
  if (stateful?.combatMetrics) {
    const metrics = stateful.combatMetrics;
    const observationKey = numberOrNull(realtime.tick) ?? Number(options.nowMs || Date.now());
    if (wouldShoot && Number(metrics.lastIntentObservationKey) !== observationKey) {
      metrics.intentShotCount = Number(metrics.intentShotCount || 0) + 1;
      metrics.lastIntentObservationKey = observationKey;
      if (metrics.firstEligibleAt === null || metrics.firstEligibleAt === undefined) {
        metrics.firstEligibleAt = Number(options.nowMs || Date.now());
      }
      metrics.lastEligibleAt = Number(options.nowMs || Date.now());
    }
    if (exitDecision && (metrics.stopEligibleAt === null || metrics.stopEligibleAt === undefined)) {
      metrics.stopEligibleAt = Number(options.nowMs || Date.now());
    }
  }
  const commandSuppressed = Boolean(!liveCombatEnabled || !wouldShoot);
  const result = {
    ok: Boolean(self),
    dryRun: !liveCombatEnabled,
    liveEnabled: liveCombatEnabled,
    authority: 'realtime',
    tick: realtime.tick ?? null,
    timing: aim.ok ? aim.timing : {
      observedTick: realtime.tick ?? null,
      createdTickEstimate: null,
      executionDelayTicks: null,
      delaySource: 'unavailable'
    },
    startedAt: combatStartedAtMs === null ? '' : new Date(combatStartedAtMs).toISOString(),
    durationMs: combatDurationMs === null ? null : Math.round(combatDurationMs),
    movementDistance: combatMovementDistance,
    self: summarizeCombatTarget(self),
    target: summarizeCombatTarget(target),
    candidates: (contactEntryOnly ? [target, ...candidates] : candidates).slice(0, 5).map(summarizeCombatTarget),
    contactEntryGuard: {
      ...contactEntryGuard,
      target: contactEntryGuard.target ? summarizeCombatTarget(contactEntryGuard.target) : null,
      movementOnly: contactEntryOnly
    },
    profitEscortContinuity: {
      active: cloneJson(stateful?.profitEscortContinuity || null),
      lastRelease: cloneJson(stateful?.profitEscortContinuityLastRelease || null),
      entered: Boolean(profitEscortContinuityUpdate?.entered),
      maintained: Boolean(profitEscortContinuityUpdate?.maintained),
      entryEvidence: cloneJson(profitEscortContinuityUpdate?.evidence || null)
    },
    targetFrameGapReset,
    targetFrameGapHold,
    combatPhase: combatPhase || {
      phase: combatTargetState?.combatPhase || 'normal-combat',
      active: closePressureActive
    },
    combatTargetSwitch: switchDecision.diagnostic,
    afkProfitCommitment: afkProfitCommitment ? {
      ...afkProfitCommitment,
      blockedProactiveCombat: afkCommitmentBlocksProactiveCombat,
      blockedTargetId: afkCommitmentBlocksProactiveCombat
        ? combatTargetId(unprotectedProposedTarget)
        : '',
      blockedTargetName: afkCommitmentBlocksProactiveCombat
        ? String(unprotectedProposedTarget?.name || '')
        : ''
    } : null,
    movement,
    aim: aim.ok ? aim : null,
    evasiveAimExperiment: combatTargetState?.evasiveAimExperiment || null,
    behavior: behaviorState ? {
      mode: behaviorState.mode,
      confidence: behaviorState.confidence,
      since: behaviorState.since,
      candidateMode: behaviorState.candidateMode,
      candidateSince: behaviorState.candidateSince,
      candidateConfidence: behaviorState.candidateConfidence,
      transitionReason: behaviorState.transitionReason,
      responsePolicy: behaviorPolicy,
      responsePolicyShadow,
      noProgressMs: behaviorState.noProgressMs,
      recentHitRate: behaviorState.recentHitRate,
      dimensions: behaviorState.dimensions,
      automationLikelihood: behaviorState.automationLikelihood,
      automationConfidence: behaviorState.automationConfidence,
      metrics: behaviorState.metrics
    } : null,
    escapeDecision: combatTargetState?.escapeDecision || null,
    disadvantageObservation: exitEvaluation.disadvantageObservation,
    exchangeStopLoss: exitEvaluation.exchangeStopLoss,
    exit: exitDecision
      ? {
          ...exitDecision,
          target: summarizeCombatTarget(target || (retainedCombatTargetState ? {
            ...retainedCombatTargetState,
            user_id: retainedCombatTargetState.id,
            authority: 'realtime-last-visible'
          } : null))
        }
      : null,
    shooting: {
      dryRunOnly: !liveCombatEnabled,
      wouldShoot,
      commandSuppressed,
      inRange,
      state: fireState.state,
      reason: fireState.reason,
      cadenceMs: Number.isFinite(Number(fireState.cadenceMs)) ? Number(fireState.cadenceMs) : null,
      reserve: numberOrNull(fireState.reserve),
      stamina5s: fireState.stamina5s === null ? null : numberOrNull(fireState.stamina5s),
      requiredStaminaMs: numberOrNull(fireState.requiredStaminaMs),
      hardReserveMs: numberOrNull(fireState.hardReserve),
      dodgeReserveMs: numberOrNull(fireState.dodgeReserve),
      shotCostMs: numberOrNull(fireState.shotCostMs),
      dodgeActionCostMs: numberOrNull(fireState.dodgeActionCostMs),
      movementDodgeApplied,
      lowConfidenceThrottle: Boolean(lowConfidence.throttle),
      behaviorSuppressed: behaviorSuppressFire,
      behaviorSuppressionApplied: false,
      closePressure: closePressureActive,
      pressureAttack: pressureAttackActive,
      combatPhase: combatTargetState?.combatPhase || 'normal-combat',
      combatSubphase: combatPhase?.subphase || combatTargetState?.closePressure?.subphase || 'normal-combat',
      behaviorPolicy: behaviorPolicy?.name || '',
      behaviorReason: behaviorPolicy?.reason || '',
      recognizedMode: behaviorState?.mode || 'mixed/unknown',
      responsePolicy: behaviorPolicy?.name || '',
      responsePolicyShadow,
      fireAuthorizationClass,
      finalFireBlocker,
      highEntropyFireGate: executionHighEntropyFireGate,
      probePhase: probeState,
      fireRiskClassification: aim.fireRiskClassification || combatTargetState?.fireRiskClassification || null,
      trajectoryCoverage: aim.trajectoryCoverage || null,
      expectedHitProbability,
      selectedRouteProbability,
      evasiveAim: aim.evasiveAim || null,
      recentAcceptedHitRate: recentHitSummary.hitRate,
      recentAcceptedShotCount: recentHitSummary.shotCount,
      noProgressAcceptedShots,
      noProgressShootingStaminaSpent: noProgressAcceptedShots * Math.max(1, Number(options.combatShotStaminaCostMs ?? 500)),
      fireSuppressionReason: 'none',
      advisoryFireSuppressionReasons,
      sharedBudgetUsed: sharedFireBudget.sharedBudgetUsed,
      sharedBudgetRemaining: sharedFireBudget.sharedBudgetRemaining,
      ordinaryBudgetRemaining: sharedFireBudget.ordinaryBudgetRemaining,
      reservedCloseBandShots: sharedFireBudget.reservedCloseBandShots,
      reservedCloseBandShotsRemaining: sharedFireBudget.reservedCloseBandShotsRemaining,
      closeBandReserve: { ...closeBandReserve },
      closeRangeFireOverride: sharedFireBudget.closeRangeFireOverride,
      budgetStateInvalid: sharedFireBudget.budgetStateInvalid,
      authorizationSource: sharedFireBudget.authorizationSource,
      marginalCoverage: sharedFireBudget.marginalCoverage,
      coverageVolleyRequiredStamina: sharedFireBudget.coverageVolleyRequiredStamina,
      coverageVolleyStaminaReady: sharedFireBudget.coverageVolleyStaminaReady,
      suppressionReason: sharedFireBudget.suppressionReason,
      defensivePressure,
      defensivePressureReason: targetCollisionBullet
        ? 'collision-risk-target-bullet'
        : (String(combatTargetState?.originIntent || '') === 'defensive'
            ? 'defensive-origin'
            : (defensivePressure ? 'recent-attributed-injury' : 'none')),
      effectiveCadenceMs: executionCadenceMs,
      executionCadenceMs,
      advisoryCadenceMs,
      advisoryCadenceReasons,
      advisoryCadenceRaised: false,
      advisoryCadenceWouldRaise: advisoryCadenceMs !== null
        && executionCadenceMs !== null
        && advisoryCadenceMs > executionCadenceMs,
      decisionIntervalMs: Number.isFinite(Number(options.decisionIntervalMs)) ? Number(options.decisionIntervalMs) : null,
      combatControlIntervalMs: Number.isFinite(Number(options.combatControlIntervalMs)) ? Number(options.combatControlIntervalMs) : null,
      actualLastShotAt: Number.isFinite(Number(stateful?.combatMetrics?.actualLastShotAt)) ? Number(stateful.combatMetrics.actualLastShotAt) : null,
      actualShotIntervalMs: Number.isFinite(Number(stateful?.combatMetrics?.actualShotIntervalMs)) ? Number(stateful.combatMetrics.actualShotIntervalMs) : null
    },
    metrics: stateful?.combatMetrics ? (() => {
      const metrics = {
        ...stateful.combatMetrics,
        threatBulletIds: Array.isArray(stateful.combatMetrics.threatBulletIds)
          ? stateful.combatMetrics.threatBulletIds.slice()
          : stateful.combatMetrics.threatBulletIds
      };
      const actualShots = Math.max(0, Number(metrics.actualShots || 0));
      const acceptedShots = Math.max(0, Number(metrics.acceptedShots || 0));
      const confirmedHits = Math.min(acceptedShots, Math.max(0, Number(metrics.confirmedHits || 0)));
      const coverageShotAttribution = compactCoverageShotAttribution(
        stateful,
        combatTargetId(target),
        64
      );
      const evasiveAimShotAttribution = compactEvasiveAimShotAttribution(
        stateful,
        combatTargetId(target),
        64
      );
      return {
        ...metrics,
        actualShots,
        requestedShots: Math.max(actualShots, Number(metrics.requestedShots || 0)),
        acceptedShots,
        unackedShots: Math.max(0, Number(metrics.unackedShots ?? actualShots - acceptedShots)),
        confirmedHits,
        estimatedHitRate: acceptedShots > 0
          ? Number((confirmedHits / acceptedShots * 100).toFixed(1))
          : null,
        coverageShotAttribution,
        evasiveAimShotAttribution,
        firstDamageDelayMs: Number(stateful.combatMetrics.firstDamageAt || 0) > 0
          ? Math.max(0, Number(stateful.combatMetrics.firstDamageAt) - Number(stateful.combatMetrics.startedAt || 0))
          : null
      };
    })() : null,
    dataGaps
  };
  Object.defineProperty(result, NORMALIZED_COMBAT_BULLETS, {
    value: bullets,
    configurable: true
  });
  return result;
}

module.exports = {
  DEFAULT_COMBAT_TARGET_FRAME_GAP_HOLD_MS,
  NORMALIZED_COMBAT_BULLETS,
  NORMALIZED_COMBAT_INPUT,
  buildBrowserlessCombatDryRun,
  buildCombatMovementPlan,
  combatLearningCellCount,
  currentCombatShotOriginDiagnostics,
  estimateAim,
  normalizeCombatBullet,
  normalizeCombatEntity,
  recordCombatShotLearning,
  rememberBrowserlessCombatEngagement,
  syncCombatShotExecutionEvents,
  syncConfirmedCombatShots,
  summarizeCombatTarget
};
