'use strict';

const {
  calculateCombatTargetPriority,
  combatEscapeDecisionCore,
  combatTargetId,
  defensiveTargetOverridesEngagedCore,
  incomingBulletHasCollisionRiskCore,
  isCombatEligibleThreat,
  isInvulnerableEntity,
  pickEngagedCombatTargetCore,
  selectBestCombatTarget
} = require('../../strategy/combat-target-selection');
const {
  applyCombatMovementModifiers,
  calculateCombatSpacing,
  calculateDodgeDirection,
  contactEntryRiskCore,
  contactEntrySyntheticBulletCore,
  pickSafeClosingDodgeCore,
  shouldBackAwayFromTarget
} = require('../../strategy/combat-movement');
const {
  checkLowConfidenceThrottle,
  determineCombatFireState,
  evaluateHighEntropyFireGateCore
} = require('../../strategy/combat-fire-discipline');
const { COMBAT_CONSTANTS } = require('../../strategy/combat-constants');
const {
  evaluateCombatExchangeStopLossCore,
  evaluateConfirmedCombatHpExitCore,
  evaluateCombatHpExitCore
} = require('../../strategy/combat-exit');
const { opponentMotionProfileCore, quadraticInterceptCore } = require('../../strategy/combat-aim');
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
  targetIsWhitelisted,
  targetWhitelistNameSet,
  targetWhitelistUserIdSet
} = require('../../shared/target-whitelist');

const DEFAULT_STAMINA_FULL_RATIO = 0.98;

function cloneJson(value) {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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
  const cells = Object.entries(learning.hitRateByModeDistance)
    .filter(([key]) => key.startsWith(`${base}|aim=`))
    .map(([, cell]) => cell);
  if (!cells.length) return null;
  const totals = cells.reduce((sum, cell) => ({
    shots: sum.shots + Number(cell?.shots || 0),
    hits: sum.hits + Number(cell?.hits || 0)
  }), { shots: 0, hits: 0 });
  return Math.max(0.03, Math.min(0.95, (totals.hits + 1) / (totals.shots + 4)));
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
  const previous = learning.hitRateByModeDistance[key] || { shots: 0, hits: 0 };
  const cell = {
    shots: Math.min(80, Number(previous.shots || 0) * 0.97 + 1),
    hits: Math.min(80, Number(previous.hits || 0) * 0.97),
    updatedAt: nowMs
  };
  learning.hitRateByModeDistance[key] = cell;
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
    aimY: numberOrNull(options.aimY)
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

function syncConfirmedCombatShots(stateful, state = {}, target = null, combat = {}, options = {}) {
  if (!stateful || !target) return 0;
  const targetId = String(combatTargetId(target) || '');
  if (!targetId) return 0;
  const learning = ensureCombatLearningState(stateful);
  if (!Array.isArray(learning.acceptedBulletIds)) learning.acceptedBulletIds = [];
  const seen = new Set(learning.acceptedBulletIds.map(String));
  let added = 0;
  for (const shot of state?.command?.shooting?.confirmedShots || []) {
    if (shot?.targetId !== null && shot?.targetId !== undefined && String(shot.targetId) !== targetId) continue;
    const bulletId = String(shot?.bullet_id ?? shot?.bulletId ?? `${shot?.createdTick ?? shot?.created_tick}:${shot?.sequence ?? ''}`);
    if (!bulletId || seen.has(bulletId)) continue;
    seen.add(bulletId);
    added += 1;
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
      expectedHitProbability: shot.expectedHitProbability
    });
  }
  learning.acceptedBulletIds = Array.from(seen).slice(-256);
  if (added) {
    const metrics = stateful.combatMetrics || {};
    stateful.combatMetrics = {
      ...metrics,
      acceptedShots: Number(metrics.acceptedShots || 0) + added
    };
  }
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
  if (entity.whitelisted === true) return true;
  if (typeof options.whitelistCheck === 'function' && options.whitelistCheck(entity)) return true;
  return targetIsWhitelisted(entity, targetWhitelistFromOptions(options));
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
    ...cloneJson(entity),
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
      || isWhitelistedTargetForOptions(activeTarget, options);
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
    if (!id
      || (targetHp !== null && targetHp <= 0)
      || isInvulnerableEntity(target)
      || isWhitelistedTargetForOptions(target, options)) continue;
    const previous = state.observations[id] || null;
    const targetBullet = contactEntryTargetBullet(bullets, id);
    const previousArmed = previous?.armed !== false;
    const risk = contactEntryRiskCore(self, target, previous, {
      ...options,
      attackRange,
      guardBufferCm: guardBuffer,
      realBullet: Boolean(targetBullet),
      armed: previousArmed
    });
    const outsideGuard = Number(target.distance) > guardRange;
    state.observations[id] = {
      distance: numberOrNull(target.distance),
      at: nowMs,
      tick: currentTick,
      armed: outsideGuard ? true : previousArmed,
      lastBlockedReason: risk.blockedReason
    };
    const row = { target, targetId: id, targetBullet, risk };
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
    ...cloneJson(bullet),
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
    distance: Number.isFinite(Number(target.distance)) ? Math.round(Number(target.distance)) : null,
    score: Number.isFinite(Number(target.combatScore)) ? Math.round(Number(target.combatScore)) : null,
    combatIntent: target.combatIntent || '',
    combatEngagement: target.combatEngagement ? cloneJson(target.combatEngagement) : null
  };
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
  const highEntropy = (profile.maneuverScale >= 0.35 && profile.durationMs >= 8000)
    || behavior?.dimensions?.controlStyle?.state === 'human-like'
    || Number(behavior?.automationLikelihood) < 0.45;
  let observationToExecutionTicks = Math.max(3, Math.min(12, Math.round(
    timingMedian + (highEntropy ? Math.max(1, timingMad * (profile.maneuverScale >= 0.65 ? 2 : 1)) : 0)
  )));
  const finishProtection = hpValue(target) !== null && hpValue(self) !== null
    && hpValue(target) <= Number(options.combatFinishLowThreatHp ?? COMBAT_CONSTANTS.FINISH_LOW_THREAT_HP)
    && hpValue(self) >= hpValue(target) + 10;
  const successfulAimProtection = Math.max(
    Number(behavior?.recentHitRate || 0),
    Number(combatTargetState?.provenHitRate || 0)
  ) >= 0.12;
  if (finishProtection || successfulAimProtection) observationToExecutionTicks = 3;
  const responsePolicy = behavior?.responsePolicy || opponentResponsePolicyCore(behavior?.mode || 'mixed/unknown', {
    distance,
    nowMs: options.nowMs
  });
  const motionScale = Math.max(0, Math.min(1, Math.max(speed, profile.avgSpeed) / Math.max(1, Number(options.combatTargetDodgeSpeedPerTick || 50))));
  const intercept = quadraticInterceptCore(self, target, {
    bulletSpeed,
    observationToExecutionTicks,
    bulletRange: options.combatBulletRangeCm || options.combatAttackRange || COMBAT_CONSTANTS.ATTACK_RANGE,
    hitRadius: options.combatBulletHitRadiusCm || 90,
    maxTicks: options.combatInterceptMaxTicks,
    maxTargetSpeed: options.combatTargetDodgeSpeedPerTick || 50,
    motionScale
  });
  const flightTicks = intercept?.flightTicks ?? Math.max(0, distance / bulletSpeed);
  const leadTicks = flightTicks + observationToExecutionTicks;
  const stationarySpeed = Math.max(0, Number(options.stationarySpeed ?? options.combatStationarySpeed ?? 5));
  const behaviorStationary = behavior?.mode === 'stationary';
  const moving = !behaviorStationary && Boolean(target.moving || speed >= stationarySpeed || Math.hypot(vx, vy) >= stationarySpeed);
  let x = moving ? (intercept?.x ?? tx + vx * leadTicks) : tx;
  let y = moving ? (intercept?.y ?? ty + vy * leadTicks) : ty;
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
  if (moving && coverageAffordable && behavior?.mode !== 'stationary') {
    const ux = vx / targetSpeed;
    const uy = vy / targetSpeed;
    const reachable = targetSpeed * leadTicks;
    const staticCandidates = [
      { hypothesis: 'continue', x: tx + ux * reachable, y: ty + uy * reachable, probability: highEntropyCoverage ? 0.27 : 0.58 },
      { hypothesis: 'stop', x: tx + vx * observationToExecutionTicks, y: ty + vy * observationToExecutionTicks, probability: highEntropyCoverage ? 0.29 : 0.14 },
      { hypothesis: 'left-turn', x: tx - uy * reachable, y: ty + ux * reachable, probability: highEntropyCoverage ? 0.16 : 0.09 },
      { hypothesis: 'right-turn', x: tx + uy * reachable, y: ty - ux * reachable, probability: highEntropyCoverage ? 0.16 : 0.09 },
      { hypothesis: 'reverse', x: tx - ux * reachable, y: ty - uy * reachable, probability: 0.12 }
    ].map(candidate => ({
      ...candidate,
      directionState: movementDirectionState(
        candidate.hypothesis === 'stop' ? 0 : Number(candidate.x) - tx,
        candidate.hypothesis === 'stop' ? 0 : Number(candidate.y) - ty,
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
        x: state === 'stop' ? tx + vx * observationToExecutionTicks : tx + vector.x * reachable,
        y: state === 'stop' ? ty + vy * observationToExecutionTicks : ty + vector.y * reachable,
        probability: 0.04
      });
    }
    const localWeight = Math.min(3, localSamples / 4);
    const globalWeight = Math.min(4, Math.max(0, Number(globalCell?.samples || 0)) / 12);
    let candidates = Array.from(candidateByDirection.values()).map(candidate => {
      const localProbability = Number(localDistribution.get(candidate.directionState) || 0);
      const globalProbability = Number(globalDistribution.get(candidate.directionState) || 0);
      const priorProbability = Number(candidate.probability || 0);
      const rawProbability = (priorProbability + localProbability * localWeight + globalProbability * globalWeight)
        / Math.max(1, 1 + localWeight + globalWeight);
      const feedback = routeLearning?.routeAimFeedback?.[routeFeedbackKey(routeContextKey, candidate.hypothesis)] || null;
      const feedbackSamples = Math.max(0, Number(feedback?.samples || 0));
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
        probability: Math.max(0.001, rawProbability),
        shotStaminaCost: Math.max(1, Number(options.combatShotStaminaCostMs ?? 500)),
        uncertaintyCm: Math.round(targetSpeed * leadTicks * Math.max(0.1, 1 - rawProbability))
      };
    });
    const probabilityTotal = candidates.reduce((sum, candidate) => sum + Number(candidate.probability || 0), 0);
    candidates = candidates.map(candidate => ({
      ...candidate,
      probability: probabilityTotal > 0 ? Number(candidate.probability || 0) / probabilityTotal : 0
    }));
    const shotIndex = Math.max(0, Math.round(Number(options.actualShots || 0)));
    const rankedCandidates = candidates.slice().sort((a, b) => b.probability - a.probability);
    const primaryCandidate = rankedCandidates[0] || null;
    const explorationCandidate = rankedCandidates[1] || null;
    const highEntropyExplore = Boolean(highEntropyCoverage && noDamageLevel >= 12 && shotIndex % 5 === 4 && explorationCandidate);
    const coverageSequence = highEntropyCoverage
      ? [primaryCandidate, ...(highEntropyExplore ? [explorationCandidate] : [])].filter(Boolean)
      : rankedCandidates.slice(0, 2);
    const selected = highEntropyCoverage
      ? (highEntropyExplore ? explorationCandidate : primaryCandidate)
      : coverageSequence[shotIndex % coverageSequence.length];
    if (selected && (highEntropyCoverage || noDamageWidened || scriptTransitionCoverage)) {
      x = selected.x;
      y = selected.y;
      routeCoverage = {
        enabled: true,
        style: highEntropyCoverage
          ? (highEntropyExplore ? 'high-entropy-bounded-exploration' : 'high-entropy-robust-stop')
          : (scriptTransitionCoverage ? 'script-transition-matrix' : 'predictable-top-routes'),
        selected: selected.hypothesis,
        sequence: coverageSequence.map(item => item.hypothesis),
        contextKey: routeContextKey,
        phase: routePhase,
        candidates: rankedCandidates.slice(0, 4).map(item => ({
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
          shotStaminaCost: item.shotStaminaCost,
          uncertaintyCm: item.uncertaintyCm,
          x: Math.round(item.x),
          y: Math.round(item.y),
          physicallyReachable: Math.hypot(item.x - tx, item.y - ty) <= reachable + 1
        })),
        movementTransition: {
          currentState: transitionModel.currentState,
          contextKey: routeContextKey,
          phase: routePhase,
          transitionCount: transitionModel.transitionCount,
          confidence: transitionModel.confidence,
          conditionalSampleCount: transitionModel.conditionalSampleCount,
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
      ? (intercept ? (noDamageWidened ? 'quadratic-intercept-motion-probe' : 'quadratic-intercept') : 'linear-intercept-fallback')
      : 'exact',
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
    spreadScale: noDamageWidened ? Math.round((1 + Math.min(1, noDamageLevel * 0.2)) * 100) / 100 : 1,
    opponentProfile: profile,
    opponentBehavior: behavior ? {
      mode: behavior.mode,
      confidence: behavior.confidence,
      responsePolicy: behavior.responsePolicy
    } : null,
    responsePolicy,
    routeCoverage,
    timing: {
      observedTick: numberOrNull(options.observedTick),
      createdTickEstimate: numberOrNull(options.observedTick) === null
        ? null
        : Number(options.observedTick) + observationToExecutionTicks,
      executionDelayTicks: observationToExecutionTicks,
      delaySource: finishProtection
        ? 'low-hp-finish-protection'
        : (successfulAimProtection ? 'proven-hit-rate-protection' : String(timing.source || 'startup-default')),
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
  const seenTargetRealBulletMs = combatTargetState?.seenTargetRealBulletAt
    ? Math.max(0, Number(options.nowMs || Date.now()) - Number(combatTargetState.seenTargetRealBulletAt))
    : 0;
  const active = Boolean(
    entityDropValue(target) > 0
      && target.moving
      && !target.firing
      && selfHp >= Math.max(1, Number(options.combatPassiveRunnerMinSelfHp || 80))
      && !seenTargetRealBulletMs
      && engagedMs >= confirmMs
  );
  return {
    active,
    engagedMs: Math.round(engagedMs),
    confirmMs,
    seenTargetRealBulletMs,
    reason: 'passive-runner'
  };
}

function buildCombatExitEvaluation(self, target, combatTargetState = {}, options = {}) {
  if (!self || !target || target.easyKillThreatExempt) {
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
      Number(combatTargetState?.combatMetrics?.selfDamage || 0),
      target.easyKillDamagedToday ? 1 : 0
    )
  }, options);
  const nowMs = Number(options.nowMs || Date.now());
  const samples = Array.isArray(combatTargetState?.motionSamples) ? combatTargetState.motionSamples : [];
  const damageWindow = windowMs => {
    const rows = samples.filter(sample => nowMs - Number(sample.at || 0) <= windowMs);
    const first = rows[0] || null;
    const last = rows[rows.length - 1] || null;
    let damageObservations = 0;
    for (let index = 1; index < rows.length; index += 1) {
      if (Number(rows[index].selfHp) < Number(rows[index - 1].selfHp)
        || Number(rows[index].targetHp) < Number(rows[index - 1].targetHp)) damageObservations += 1;
    }
    return {
      selfDamage: first && last ? Math.max(0, Number(first.selfHp || 0) - Number(last.selfHp || 0)) : 0,
      targetDamage: first && last ? Math.max(0, Number(first.targetHp || 0) - Number(last.targetHp || 0)) : 0,
      distanceProgressCm: first && last ? Number(first.distance || 0) - Number(last.distance || 0) : 0,
      damageObservations
    };
  };
  const short = damageWindow(10000);
  const long = damageWindow(20000);
  const recent = damageWindow(3000);
  const exchangeStopLoss = evaluateCombatExchangeStopLossCore({
    nowMs,
    engagedMs: nowMs - Number(combatTargetState?.firstSeenAt || combatTargetState?.at || nowMs),
    acceptedShots: Number(combatTargetState?.combatMetrics?.acceptedShots || 0),
    damageObservations: Math.max(short.damageObservations, long.damageObservations),
    selfHp: hpValue(self),
    targetHp: hpValue(target),
    windowMs: 10000,
    windowSelfDamage: short.selfDamage,
    windowTargetDamage: short.targetDamage,
    longWindowSelfDamage: long.selfDamage,
    longWindowTargetDamage: long.targetDamage,
    distanceProgressCm: long.distanceProgressCm,
    recentTargetDamage: recent.targetDamage,
    degradationSinceAt: combatTargetState?.exchangeDegradationSinceAt
  }, options);
  combatTargetState.exchangeDegradationSinceAt = exchangeStopLoss.degradationSinceAt;
  const defensive = String(combatTargetState?.originIntent || combatTargetState?.intent || '') === 'defensive';
  const exchangeExit = exchangeStopLoss.triggered && defensive
    ? {
        shouldLeave: true,
        policy: 'exchange-stop-loss',
        rule: exchangeStopLoss.rule,
        reason: exchangeStopLoss.reason,
        selfHp: hpValue(self),
        targetHp: hpValue(target),
        exchangeStopLoss
      }
    : null;
  return {
    ...evaluation,
    exchangeStopLoss: {
      ...exchangeStopLoss,
      disengage: Boolean(exchangeStopLoss.triggered && !defensive),
      shouldExit: Boolean(exchangeExit)
    },
    exit: exchangeExit || (evaluation.exit ? { ...evaluation.exit, noDamageMs } : null)
  };
}

function buildCombatMovementPlan(self, target, bullets = [], options = {}) {
  if (!self || !target) return { dx: 0, dy: 0, reason: 'missing-target', spacing: null, dodge: null, modifiers: [] };
  const combatTargetState = options.combatTargetState || null;
  const opponentBehavior = combatTargetState?.opponentBehaviorState || null;
  const noDamageMs = Math.max(0, Number(combatTargetState?.noDamageMs || 0));
  const targetPressure = (bullets || []).some(bullet => Number(bullet.ownerId) === Number(target.user_id));
  const attackRange = Math.max(0, Number(options.combatAttackRange || options.attackRange || COMBAT_CONSTANTS.ATTACK_RANGE));
  const outOfRange = Number(target.distance || Infinity) > attackRange;
  const edgePressure = target?.combatEngagement?.edgePressure || null;
  const escapeDecision = combatTargetState?.escapeDecision || target?.combatEngagement?.escapeDecision || null;
  const closeAllowed = Boolean(
    escapeDecision?.confirmed !== true
      && (!outOfRange || edgePressure?.active === true || targetPressure)
  );
  const passiveRunner = passiveRunnerState(self, target, combatTargetState, options);
  const finishingTarget = Number(target.hp ?? 100) <= Number(options.combatFinishLowThreatHp ?? COMBAT_CONSTANTS.FINISH_LOW_THREAT_HP);
  const highEntropyOpponent = opponentBehavior?.dimensions?.controlStyle?.state === 'human-like'
    || Number(opponentBehavior?.automationLikelihood) < 0.45;
  const spacing = calculateCombatSpacing(self, target, { targetPressure, finishingTarget, highEntropyOpponent });
  const commandTiming = options.executionTiming || {};
  const dodge = calculateDodgeDirection(self, bullets, {
    tangentPreference: movementTangentPreference(self, target),
    target,
    moveSpeedPerTick: options.combatMoveSpeedPerTick || 50,
    hitRadius: options.combatBulletHitRadiusCm || 200,
    commandDelayP90Ticks: Number(commandTiming.p90Ticks || 5),
    reactionSafetyMarginMs: options.combatReactionSafetyMarginMs ?? 100
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
  else if (selfStamina5s !== null && selfStamina5s < COMBAT_CONSTANTS.SHOOT_DODGE_RESERVE_MS + 1000) preDodgeBlockedReason = 'stamina-insufficient';
  else if (!moving) preDodgeBlockedReason = 'self-stationary';
  else if (urgentOldBulletThreat) preDodgeBlockedReason = 'old-bullet-threat';
  else if (latestSafeCommandTick !== null && currentTick !== null && currentTick > latestSafeCommandTick) preDodgeBlockedReason = 'flight-time-insufficient';
  else if (numberOrNull(shootingPhase?.intervalMedianTicks) !== null
    && commandDelayP90Ticks >= Number(shootingPhase.intervalMedianTicks)) preDodgeBlockedReason = 'command-delay-too-high';
  const preDodge = Boolean(
    !preDodgeBlockedReason
      && nextShotInMs !== null
  );
  const backAway = shouldBackAwayFromTarget(self, target);
  const closeRange = Math.max(0, Number(options.combatPressureCloseRange || options.combatPassiveRunnerCloseRange || COMBAT_CONSTANTS.NO_DAMAGE_PRESS_CLOSE_RANGE));
  const pressureClose = Boolean(
    closeAllowed
      && targetPressure
      && noDamageMs >= Math.max(0, Number(options.combatNoDamagePressCloseMs ?? COMBAT_CONSTANTS.NO_DAMAGE_PRESS_CLOSE_MS))
      && (hpValue(self) ?? 100) >= Math.max(0, Number(options.combatNoDamagePressCloseMinHp ?? COMBAT_CONSTANTS.NO_DAMAGE_PRESS_CLOSE_MIN_HP))
      && Number(target.distance || Infinity) > closeRange
  );
  const retreatingClose = Boolean(
    closeAllowed
      && !pressureClose
      && (opponentBehavior?.mode === 'retreat-kite' || targetRecedingFromSelf(self, target))
      && noDamageMs >= Math.max(0, Number(options.combatRetreatingCloseNoDamageMs || 2000))
      && Number(target.distance || Infinity) > spacing
  );
  const passiveRunnerClose = Boolean(
    closeAllowed
      && !pressureClose
      && !retreatingClose
      && passiveRunner.active
      && Number(target.distance || Infinity) > Math.max(0, Number(options.combatPassiveRunnerCloseRange || 5500))
  );
  const behaviorClose = Boolean(closeAllowed && opponentBehavior?.responsePolicy?.closeIn && Number(target.distance || Infinity) > spacing);
  const safeClosingDodge = behaviorClose && targetPressure
    ? pickSafeClosingDodgeCore(dodge?.threatField, {
        hitRadius: options.combatBulletHitRadiusCm || 200,
        minimumCpaRatio: options.combatSafeCloseMinimumCpaRatio ?? 0.75,
        minimumClosingCm: options.combatSafeCloseMinimumClosingCm ?? 25
      })
    : null;
  const contactEntryDodge = options.contactEntryGuard?.active === true
    && !(Array.isArray(dodge?.threatField) && dodge.threatField.length)
    ? options.contactEntryGuard.dodge
    : null;
  const effectiveDodge = preDodge
    ? {
        dx: Math.sign(Number(self.vx || 0)),
        dy: Math.sign(Number(self.vy || 0)),
        reason: 'pre-dodge-induce-hold',
        threatField: dodge?.threatField || null,
        nextShotInMs: Math.round(nextShotInMs),
        shotIntervalCv
      }
    : (contactEntryDodge
      ? contactEntryDodge
    : (safeClosingDodge
      ? { ...dodge, dx: safeClosingDodge.dx, dy: safeClosingDodge.dy, reason: 'retreat-kite-safe-close' }
      : dodge));
  const closeIn = closeAllowed
    && (pressureClose || retreatingClose || passiveRunnerClose || behaviorClose || Number(target.distance || Infinity) > spacing);
  const base = { dx: 0, dy: 0 };
  const movement = applyCombatMovementModifiers(base, self, target, { dodge: effectiveDodge, backAway, closeIn });
  const closeReason = pressureClose
    ? 'combat-pressure-close'
    : (retreatingClose
        ? 'combat-retreating-fighter-close'
        : (passiveRunnerClose ? 'passive-runner-close' : (behaviorClose ? `combat-${opponentBehavior.mode}-response` : 'close-in')));
  const reason = movement.modifiers.includes('dodge')
    ? effectiveDodge.reason
    : (movement.modifiers.includes('back-away') || movement.modifiers.includes('back-away-mixed')
        ? 'back-away'
        : (movement.modifiers.includes('close-in')
            ? (edgePressure?.active ? 'combat-advantage-reengage' : closeReason)
            : (escapeDecision?.confirmed
                ? 'combat-escape-confirmed-hold'
                : (outOfRange ? 'combat-out-of-range-hold' : 'hold-spacing'))));
  return {
    dx: Number(movement.dx || 0),
    dy: Number(movement.dy || 0),
    reason,
    spacing: Math.round(spacing),
    dodge: effectiveDodge ? { dx: effectiveDodge.dx, dy: effectiveDodge.dy, reason: effectiveDodge.reason, threatField: effectiveDodge.threatField } : null,
    modifiers: movement.modifiers || [],
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
    safeCloseOverride: safeClosingDodge ? {
      dx: safeClosingDodge.dx,
      dy: safeClosingDodge.dy,
      directHits: safeClosingDodge.directHits,
      minCPA: safeClosingDodge.minCPA,
      targetDistanceChange: safeClosingDodge.targetDistanceChange
    } : null,
    preDodge: preDodge ? {
      phase: 'induce-hold',
      nextShotInMs: Math.round(nextShotInMs),
      shotIntervalCv,
      reserveMs: COMBAT_CONSTANTS.SHOOT_DODGE_RESERVE_MS,
      predictedCreatedTick,
      latestSafeCommandTick,
      burstSampleCount,
      currentBurstShotCount: numberOrNull(opponentBehavior?.metrics?.currentBurstShotCount),
      burstConfidence
    } : null,
    preDodgeBlockedReason: preDodge ? '' : preDodgeBlockedReason,
    contactEntryGuard: options.contactEntryGuard || null,
    shootingPhaseSource: shootingPhase?.shootingPhaseSource || '',
    oldBulletPressure: Boolean((bullets || []).length)
  };
}

function pickIncomingBullet(bullets = [], options = {}) {
  return (bullets || [])
    .filter(bullet => bullet?.incoming)
    .filter(bullet => incomingBulletHasCollisionRiskCore(bullet, options))
    .slice()
    .sort((a, b) => {
      const timeA = Number(a.timeToImpact ?? Infinity);
      const timeB = Number(b.timeToImpact ?? Infinity);
      if (timeA !== timeB) return timeA - timeB;
      return Number(a.distance ?? Infinity) - Number(b.distance ?? Infinity);
    })[0] || null;
}

function rememberBrowserlessCombatEngagement(stateful, self, target, options = {}) {
  if (!stateful || typeof stateful !== 'object' || !target) return;
  const id = combatTargetId(target);
  if (!id) return;
  const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  const previous = stateful.combatTarget || null;
  const same = previous && String(previous.id ?? '') === String(id);
  const distance = Number.isFinite(Number(target.distance)) ? Number(target.distance) : distanceBetween(self, target);
  const hp = numberOrNull(target.knownHp ?? target.hp);
  const previousHp = same && Number.isFinite(Number(previous.hp)) ? Number(previous.hp) : null;
  const damaged = hp !== null && previousHp !== null && hp < previousHp - 0.01;
  const healed = hp !== null && previousHp !== null && hp > previousHp + 0.01;
  const previousSelfHp = same ? hpValue(previous?.self) : null;
  const currentSelfHp = hpValue(self);
  const selfDamaged = previousSelfHp !== null && currentSelfHp !== null && currentSelfHp < previousSelfHp - 0.01;
  const selfHealed = previousSelfHp !== null && currentSelfHp !== null && currentSelfHp > previousSelfHp + 0.01;
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
  const targetBullets = (options.bullets || [])
    .filter(bullet => String(bullet?.ownerId ?? '') === String(id));
  const targetBulletIds = targetBullets
    .map(bullet => String(bullet?.bullet_id ?? bullet?.bulletId ?? `${bullet?.createdTick ?? ''}:${bullet?.startX ?? bullet?.x ?? ''}:${bullet?.startY ?? bullet?.y ?? ''}`))
    .filter(Boolean);
  const previousMetrics = same && stateful.combatMetrics?.targetId === String(id) ? stateful.combatMetrics : {};
  const behaviorMap = ensureOpponentBehaviorMap(stateful);
  const previousBehavior = behaviorMap[String(id)] || null;
  const seenShotEventIds = new Set((previousBehavior?.seenShotEventIds || []).map(String));
  const newShotEvents = targetBullets.map(bullet => ({
    bulletId: String(bullet?.bullet_id ?? bullet?.bulletId ?? `${bullet?.createdTick ?? ''}:${bullet?.startX ?? bullet?.x ?? ''}:${bullet?.startY ?? bullet?.y ?? ''}`),
    createdTick: numberOrNull(bullet?.createdTick ?? bullet?.created_tick)
  })).filter(event => event.bulletId && event.createdTick !== null && !seenShotEventIds.has(event.bulletId));
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
  const sampleWindowMs = Math.max(20000, Number(options.combatMotionHistoryWindowMs || 20000));
  const motionSamples = previousSamples
    .concat([{
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
      newBulletCount: Math.max(0, targetBulletIds.filter(id => !(previousMetrics.threatBulletIds || []).includes(id)).length),
      newShotEvents,
      currentTick: numberOrNull(options.currentTick),
      commandDelayP90Ticks: numberOrNull(options.executionTiming?.p90Ticks),
      targetStamina5s: numberOrNull(target.stamina_5s_remaining_milli ?? target.stamina5sRemainingMilli),
      selfHp: hpValue(self),
      targetHp: hp
    }])
    .filter(sample => nowMs - Number(sample.at || 0) <= sampleWindowMs)
    .slice(-160);
  const observedHitRate = learnedBehaviorHitRate(stateful, previousBehavior || { mode: 'mixed/unknown' }, distance)
    ?? (Number(previousMetrics.acceptedShots || 0) >= 5
      ? Number(previousMetrics.confirmedHits || 0) / Math.max(1, Number(previousMetrics.acceptedShots || 0))
      : null);
  const opponentBehaviorState = updateOpponentBehaviorStateCore(previousBehavior, {
    ...motionSamples[motionSamples.length - 1],
    hitRate: observedHitRate
  }, {
    nowMs,
    windowMs: Math.min(12000, sampleWindowMs),
    hitRate: observedHitRate
  });
  opponentBehaviorState.probeWeights = {
    center: Number(previousBehavior?.probeWeights?.center || 0.6),
    short: Number(previousBehavior?.probeWeights?.short || 0.45),
    long: Number(previousBehavior?.probeWeights?.long || 0.45)
  };
  opponentBehaviorState.seenShotEventIds = Array.from(new Set([
    ...(previousBehavior?.seenShotEventIds || []),
    ...targetBulletIds
  ].map(String))).slice(-256);
  opponentBehaviorState.recentHitRate = observedHitRate;
  behaviorMap[String(id)] = opponentBehaviorState;
  const escapeDecision = combatEscapeDecisionCore(self, target, {
    ...(same ? previous : null),
    opponentBehaviorState
  }, {
    ...options,
    nowMs
  });
  stateful.combatTarget = {
    id,
    at: nowMs,
    firstSeenAt: same ? Number(previous.firstSeenAt || previous.at || nowMs) : nowMs,
    name: target.name || '',
    x: Math.round(Number(target.x) || 0),
    y: Math.round(Number(target.y) || 0),
    hp,
    firstHp,
    minHp,
    damageFromStart,
    displayHp: numberOrNull(target.hp),
    drop: entityDropValue(target),
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
    originIntent: same ? String(previous.originIntent || previous.intent || target.combatIntent || '') : String(target.combatIntent || ''),
    originReason: same ? String(previous.originReason || previous.reason || '') : String(options.reason || target.reason || ''),
    lastDamageAt: damaged ? nowMs : (same ? Number(previous.lastDamageAt || previous.at || nowMs) : nowMs),
    acceptedShotsAtLastDamage: damaged
      ? Number(previousMetrics.acceptedShots || 0)
      : (same ? Number(previous.acceptedShotsAtLastDamage || 0) : 0),
    lastSelfDamageAt: selfDamaged ? nowMs : (same ? Number(previous.lastSelfDamageAt || 0) : 0),
    lastInRangeAt: inRange ? nowMs : (same ? Number(previous.lastInRangeAt || previous.at || nowMs) : nowMs),
    seenTargetRealBulletAt: targetOwnsRealBullet ? nowMs : (same ? Number(previous.seenTargetRealBulletAt || 0) : 0),
    disadvantageSinceAt,
    disadvantageSamples,
    exchangeDegradationSinceAt,
    lastDamageAmount: damaged ? Math.max(0, previousHp - hp) : Number(previous?.lastDamageAmount || 0),
    noDamageMs: Math.max(0, nowMs - (damaged ? nowMs : (same ? Number(previous.lastDamageAt || previous.at || nowMs) : nowMs))),
    motionSamples,
    opponentBehaviorState,
    escapeDecision,
    provenHitRate: Math.max(
      Number(same ? previous.provenHitRate || 0 : 0),
      Number(observedHitRate || 0)
    ),
    self: summarizeCombatTarget(self)
  };
  recordRouteTransitionObservation(stateful, id, opponentBehaviorState, nowMs);
  finalizeCombatRouteFeedback(stateful, id, stateful.combatTarget, options.currentTick, nowMs, options);
  const threatBulletIds = Array.from(new Set([...(previousMetrics.threatBulletIds || []), ...targetBulletIds])).slice(-200);
  const initialStamina1d = Number(previousMetrics.initialStamina1d);
  const currentStamina1d = Number(self?.stamina_1d_remaining_milli ?? self?.stamina1dRemainingMilli);
  const totalStaminaSpent = Number.isFinite(initialStamina1d) && Number.isFinite(currentStamina1d)
    ? Math.max(0, initialStamina1d - currentStamina1d)
    : 0;
  const shootingStaminaSpent = Number(previousMetrics.acceptedShots || 0)
    * Math.max(0, Number(options.opportunityShotStaminaCostMs ?? 500));
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
    targetName: target.name || previousMetrics.targetName || '',
    engagementId: `${String(id)}:${engagementStartedAt}`,
    startedAt: engagementStartedAt,
    lastObservedAt: nowMs,
    initialSelfHp: same
      ? (numberOrNull(previousMetrics.initialSelfHp) ?? previousSelfHp ?? currentSelfHp)
      : currentSelfHp,
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
    totalStaminaSpent,
    shootingStaminaSpent,
    movementStaminaSpent: Math.max(0, totalStaminaSpent - shootingStaminaSpent),
    lastDodgeThreatField: null
  };
}

function buildBrowserlessCombatDryRun(state = {}, options = {}) {
  const realtime = state?.realtime || {};
  const dataGaps = [];
  const liveCombatEnabled = options.liveCombatEnabled === true || options.combatEnabled === true;
  const self = normalizeCombatEntity(realtime.self, null, options);
  if (!self) dataGaps.push('missing-realtime-self');
  const selfUserId = Number(self?.user_id ?? state?.userId ?? options.userId ?? 0);
  const entities = (Array.isArray(realtime.entities) ? realtime.entities : [])
    .map(entity => normalizeCombatEntity(entity, self, options))
    .filter(Boolean);
  const targets = entities.filter(entity => Number(entity.user_id) !== selfUserId);
  const bullets = (Array.isArray(realtime.bullets) ? realtime.bullets : [])
    .map(bullet => normalizeCombatBullet(bullet, self, { currentTick: realtime.tick }))
    .filter(Boolean);
  if (!bullets.length) dataGaps.push('no-realtime-bullet-evidence');
  const stateful = options.decisionState || options.stateful || null;
  const incomingBullet = pickIncomingBullet(bullets, options);
  const context = {
    userId: selfUserId,
    bullets,
    incomingBullet,
    incomingBulletOwnerId: incomingBullet?.ownerId,
    unknownIncoming: Boolean(incomingBullet && (incomingBullet.ownerId === null || incomingBullet.ownerId === undefined)),
    easyKillPreferredTargetId: options.easyKillPreferredTargetId,
    recoveringSelf: Boolean(
      self
        && hpValue(self) !== null
        && hpValue(self) < (numberOrNull(self.max_hp ?? self.maxHp) ?? 100)
    ),
    whitelistCheck: target => isWhitelistedTargetForOptions(target, options)
  };
  const combatAttackRange = Math.max(0, Number(options.combatAttackRange || options.attackRange || COMBAT_CONSTANTS.ATTACK_RANGE));
  const combatDodgeRange = combatAttackRange + Math.max(0, Number(options.combatDodgeRangeBuffer ?? COMBAT_CONSTANTS.DODGE_RANGE_BUFFER));
  const contactEntryGuard = updateContactEntryGuard(stateful, self, targets, bullets, {
    ...options,
    currentTick: realtime.tick,
    executionTiming: state?.command?.shooting?.timing || options.executionTiming
  });
  const candidates = targets
    .filter(target => isCombatEligibleThreat(target, context))
    .filter(target => {
      const distance = Number(target.distance);
      if (!Number.isFinite(distance)) return false;
      if (distance <= combatAttackRange) return true;
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
  const engagedTarget = pickEngagedCombatTargetCore(self, candidates, targets, bullets, stateful, {
    ...options,
    ...context
  });
  const defensiveTarget = selectBestCombatTarget(self, candidates, context);
  const preferredEasyTargetId = options.easyKillPreferredTargetId;
  const preferredEasyTarget = preferredEasyTargetId === null || preferredEasyTargetId === undefined || preferredEasyTargetId === ''
    ? null
    : candidates.find(candidate => candidate.easyKillProfitTarget === true
      && String(combatTargetId(candidate)) === String(preferredEasyTargetId)) || null;
  const normalTarget = defensiveTargetOverridesEngagedCore(engagedTarget, defensiveTarget, options)
    ? defensiveTarget
    : (engagedTarget
        || (defensiveTarget?.combatIntent === 'defensive' ? defensiveTarget : null)
        || (preferredEasyTarget ? { ...preferredEasyTarget, combatIntent: 'profit' } : null)
        || defensiveTarget);
  const contactTarget = contactEntryGuard.active === true ? contactEntryGuard.target : null;
  const contactApplies = Boolean(
    contactTarget
      && (!normalTarget || String(combatTargetId(normalTarget) || '') === String(combatTargetId(contactTarget) || ''))
  );
  const contactEntryOnly = Boolean(contactApplies && !normalTarget);
  const target = normalTarget || (contactApplies
    ? { ...contactTarget, combatIntent: 'defensive', contactEntryOnly: true }
    : null);
  if (!contactEntryOnly) rememberBrowserlessCombatEngagement(stateful, self, target, {
    ...options,
    bullets,
    currentTick: realtime.tick,
    executionTiming: state?.command?.shooting?.timing || options.executionTiming,
    reason: liveCombatEnabled ? 'combat-live-realtime' : (options.controlMode === 'combat-dry-run' ? 'combat-dry-run-realtime' : 'realtime-visible-threat')
  });
  if (!contactEntryOnly) syncConfirmedCombatShots(stateful, state, target, {
    behavior: stateful?.opponentBehaviorStates?.[String(combatTargetId(target) || '')] || null
  }, options);
  const combatTargetState = contactEntryOnly ? null : stateful?.combatTarget || null;
  const combatStartedAtMs = target && Number.isFinite(Number(combatTargetState?.firstSeenAt || combatTargetState?.at))
    ? Number(combatTargetState.firstSeenAt || combatTargetState.at)
    : null;
  const combatDurationMs = combatStartedAtMs === null
    ? null
    : Math.max(0, (Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now()) - combatStartedAtMs);
  const aim = estimateAim(self, target, {
    ...options,
    combatTargetState,
    observedTick: realtime.tick,
    executionTiming: state?.command?.shooting?.timing || options.executionTiming,
    actualShots: stateful?.combatMetrics?.acceptedShots || stateful?.combatMetrics?.actualShots || 0
  });
  if (!aim.ok) dataGaps.push(aim.reason);
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
      opponentBehavior: aim.opponentBehavior,
      at: Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now()
    };
  }
  const movement = buildCombatMovementPlan(self, target, bullets, {
    ...options,
    combatTargetState,
    executionTiming: state?.command?.shooting?.timing || options.executionTiming,
    currentTick: realtime.tick,
    bullets,
    contactEntryGuard: contactApplies ? contactEntryGuard : null
  });
  if (stateful?.combatMetrics && movement.dodge?.threatField) {
    stateful.combatMetrics.lastDodgeThreatField = cloneJson(movement.dodge.threatField);
  }
  const exitEvaluation = buildCombatExitEvaluation(self, target, {
    ...combatTargetState,
    combatMetrics: stateful?.combatMetrics || combatTargetState?.combatMetrics || null
  }, options);
  if (stateful?.combatTarget && exitEvaluation.exchangeStopLoss) {
    stateful.combatTarget.exchangeDegradationSinceAt = exitEvaluation.exchangeStopLoss.degradationSinceAt;
  }
  const exitDecision = contactEntryOnly ? null : exitEvaluation.exit;
  const fireState = target ? determineCombatFireState(self || {}, target, {
    targetPressureFire: bullets.some(bullet => Number(bullet.ownerId) === Number(target.user_id)),
    passiveRunner: Boolean(movement.passiveRunner?.active),
    finishLowThreat: Boolean(
      target
        && !exitDecision
        && (hpValue(self) ?? 0) >= Math.max(1, Number(options.combatFinishLowThreatMinSelfHp || 60))
        && (hpValue(target) ?? 100) <= Math.max(1, Number(options.combatFinishLowThreatHp ?? COMBAT_CONSTANTS.FINISH_LOW_THREAT_HP))
        && !bullets.some(bullet => Number(bullet.ownerId) === Number(target.user_id))
    )
  }) : { state: 'disabled', cadenceMs: Infinity, reserve: null, reason: 'no-target' };
  const lowConfidence = aim.ok ? checkLowConfidenceThrottle({ confidence: aim.confidence, distance: aim.distance }) : { throttle: false, cadenceMs: null };
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
  const highEntropyFireGate = evaluateHighEntropyFireGateCore({
    expectedHitProbability,
    recentHitRate: recentHitSummary.hitRate,
    recentShotCount: recentHitSummary.shotCount,
    noProgressAcceptedShots,
    noDamageMs: combatTargetState?.noDamageMs,
    targetHp: hpValue(target),
    selfHp: hpValue(self),
    highEntropy: Boolean(aim.ok && String(aim.routeCoverage?.style || '').startsWith('high-entropy-')),
    defensivePressure
  }, options.highEntropyFireGate);
  const baseCadenceMs = Number.isFinite(Number(lowConfidence.cadenceMs)) && lowConfidence.throttle
    ? Number(lowConfidence.cadenceMs)
    : (Number.isFinite(Number(fireState.cadenceMs)) ? Number(fireState.cadenceMs) : null);
  const effectiveCadenceMs = baseCadenceMs === null
    ? null
    : Math.max(baseCadenceMs, Math.max(0, Number(behaviorPolicy?.minimumCadenceMs || 0)));
  const maximumCadenceMs = Number(behaviorPolicy?.maximumCadenceMs);
  const behaviorBoundedCadenceMs = effectiveCadenceMs === null
    ? null
    : (Number.isFinite(maximumCadenceMs) && maximumCadenceMs > 0
        ? Math.min(effectiveCadenceMs, maximumCadenceMs)
        : effectiveCadenceMs);
  const boundedCadenceMs = behaviorBoundedCadenceMs === null
    ? null
    : Math.max(behaviorBoundedCadenceMs, Math.max(0, Number(highEntropyFireGate.minimumCadenceMs || 0)));
  const wouldShoot = Boolean(
    target
      && aim.ok
      && inRange
      && fireState.state !== 'disabled'
      && fireState.state !== 'paused'
      && !contactEntryOnly
      && !behaviorPolicy?.suppressFire
      && !highEntropyFireGate.suppressFire
  );
  const commandSuppressed = Boolean(!liveCombatEnabled || !wouldShoot);
  return {
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
    self: summarizeCombatTarget(self),
    target: summarizeCombatTarget(target),
    candidates: (contactEntryOnly ? [target, ...candidates] : candidates).slice(0, 5).map(summarizeCombatTarget),
    contactEntryGuard: {
      ...contactEntryGuard,
      target: contactEntryGuard.target ? summarizeCombatTarget(contactEntryGuard.target) : null,
      movementOnly: contactEntryOnly
    },
    movement,
    aim: aim.ok ? aim : null,
    behavior: behaviorState ? {
      mode: behaviorState.mode,
      confidence: behaviorState.confidence,
      since: behaviorState.since,
      candidateMode: behaviorState.candidateMode,
      candidateSince: behaviorState.candidateSince,
      candidateConfidence: behaviorState.candidateConfidence,
      transitionReason: behaviorState.transitionReason,
      responsePolicy: behaviorPolicy,
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
          target: summarizeCombatTarget(target)
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
      lowConfidenceThrottle: Boolean(lowConfidence.throttle),
      behaviorSuppressed: Boolean(behaviorPolicy?.suppressFire),
      behaviorPolicy: behaviorPolicy?.name || '',
      behaviorReason: behaviorPolicy?.reason || '',
      highEntropyFireGate,
      expectedHitProbability,
      selectedRouteProbability,
      recentAcceptedHitRate: recentHitSummary.hitRate,
      recentAcceptedShotCount: recentHitSummary.shotCount,
      noProgressAcceptedShots,
      defensivePressure,
      defensivePressureReason: targetCollisionBullet
        ? 'collision-risk-target-bullet'
        : (String(combatTargetState?.originIntent || '') === 'defensive'
            ? 'defensive-origin'
            : (defensivePressure ? 'recent-attributed-injury' : 'none')),
      effectiveCadenceMs: boundedCadenceMs,
      decisionIntervalMs: Number.isFinite(Number(options.decisionIntervalMs)) ? Number(options.decisionIntervalMs) : null,
      combatControlIntervalMs: Number.isFinite(Number(options.combatControlIntervalMs)) ? Number(options.combatControlIntervalMs) : null,
      actualLastShotAt: Number.isFinite(Number(stateful?.combatMetrics?.actualLastShotAt)) ? Number(stateful.combatMetrics.actualLastShotAt) : null,
      actualShotIntervalMs: Number.isFinite(Number(stateful?.combatMetrics?.actualShotIntervalMs)) ? Number(stateful.combatMetrics.actualShotIntervalMs) : null
    },
    metrics: stateful?.combatMetrics ? (() => {
      const metrics = cloneJson(stateful.combatMetrics);
      const actualShots = Math.max(0, Number(metrics.actualShots || 0));
      const acceptedShots = Math.max(0, Number(metrics.acceptedShots || 0));
      const confirmedHits = Math.min(acceptedShots, Math.max(0, Number(metrics.confirmedHits || 0)));
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
        firstDamageDelayMs: Number(stateful.combatMetrics.firstDamageAt || 0) > 0
          ? Math.max(0, Number(stateful.combatMetrics.firstDamageAt) - Number(stateful.combatMetrics.startedAt || 0))
          : null
      };
    })() : null,
    dataGaps
  };
}

module.exports = {
  buildBrowserlessCombatDryRun,
  buildCombatMovementPlan,
  estimateAim,
  normalizeCombatBullet,
  normalizeCombatEntity,
  recordCombatShotLearning,
  summarizeCombatTarget
};
