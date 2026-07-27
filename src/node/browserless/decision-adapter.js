'use strict';

const { performance } = require('perf_hooks');
const { attackWorthTakingCore } = require('../../strategy/attack-worth');
const {
  incomingBulletHasCollisionRiskCore,
  isInvulnerableEntity
} = require('../../strategy/combat-target-selection');
const {
  COMBAT_ECONOMIC_STOP_LOSS_DEFAULTS,
  evaluateEconomicCooldownReentryCore,
  evaluateNonThreatCombatEconomicStopLossCore
} = require('../../strategy/combat-economic-stop-loss');
const {
  buildOpportunityCandidatesCore,
  opportunityPriorityTierCore,
  opportunityValueScoreCore,
  uniqueVisibleRouteCoinsCore
} = require('../../strategy/opportunity-candidates');
const {
  chooseStableOpportunityCore,
  rememberOpportunityChoiceCore
} = require('../../strategy/opportunity-choice');
const { OPPORTUNITY_CONSTANTS } = require('../../strategy/opportunity-constants');
const {
  buildNativeCoinSnapshotCore,
  coinTargetKeyCore,
  pickIncidentalCoinPickupsCore,
  snapshotCoinNavigationReasonCore
} = require('../../strategy/coin-target');
const {
  dailyStaminaBudgetIsLimitingCore,
  pickNearestDailyStaminaFinalCoinCore,
  summarizeBlockedStaminaOpportunityCore,
  summarizeNearestCoinStaminaBudgetExitCore
} = require('../../strategy/stamina-budget');
const { buildRuntimeDefaults } = require('../../shared/runtime-defaults');
const { buildBrowserlessCombatDryRun, recordCombatShotLearning } = require('./combat-adapter');
const {
  buildLeavePendingCover,
  normalizedIncomingBullets
} = require('./leave-pending-control');
const {
  buildFinalActionCandidate,
  selectFinalActionCandidateCore
} = require('../../strategy/final-candidate-selection');
const {
  buildReturnBlockActionCore,
  lockedFleeDirectionCore
} = require('../../strategy/active-threat-avoidance');
const {
  evaluateCombatHpExitCore,
  evaluatePredictedLeaveHpCore
} = require('../../strategy/combat-exit');
const {
  postAttackCoinMatchesAttackCore,
  updatePostAttackSettlementCore
} = require('../../strategy/post-attack-drop');
const {
  settlementSummary,
  updatePostKillSettlementCore
} = require('../../strategy/post-kill-settlement');
const {
  coinFailureIgnoreCore,
  staleCoinEscapeDirectionCore,
  coinProgressIntentCore,
  coinAttemptExpiredCore,
  updateCoinAttemptCore,
  updateCoinProgressRecordCore,
  buildIgnoredCoinProgressCore,
  buildIgnoredCoinPatrolActionCore,
  coinIgnoreCleanupIntentCore
} = require('../../strategy/coin-progress');
const {
  buildCoinRouteFromAnchorCore,
  coinRouteActionMetaCore,
  coinRouteLegClearCore,
  coinRouteKey,
  coinRouteSummaryCore,
  pickCoinRouteOpportunityCore
} = require('../../strategy/coin-route');
const {
  applyFinalActionArbitrationCore,
  profitDropoutMetadata
} = require('../../strategy/action-arbitration');
const { recordActionSwitchDiagnosticsCore } = require('../../strategy/action-switch-diagnostics');
const {
  buildDynamicProfitThresholdCore,
  filterProfitCandidatesCore,
  profitTargetEligibleCore
} = require('../../strategy/profit-threshold');
const {
  findSingleCoinBaitCoinCore,
  singleCoinBaitMatchesCore,
  singleCoinBaitPolicyCore
} = require('../../strategy/single-coin-bait');
const { activeCoinCompetitionCore } = require('../../strategy/coin-competition');
const { updateOutsideCenterIdleCore } = require('../../strategy/outside-center-idle');
const {
  deriveCenterActivityAfkContinuationCore,
  evaluateCenterActivityAfkAdmissionCore
} = require('../../strategy/center-activity-afk');
const {
  targetIsWhitelisted,
  targetWhitelistNameSet,
  targetWhitelistUserIdSet
} = require('../../shared/target-whitelist');
const {
  createBrowserlessDecisionState,
  summarizeBrowserlessDecisionState
} = require('./decision-state');
const {
  hasFull5sStamina,
  staminaLimitForWindow,
  staminaRemainingValue
} = require('./stamina-metadata');

const BROWSER_RUNTIME_DEFAULTS = buildRuntimeDefaults({}, false);
const DEFAULT_STALE_SELF_MS = 2500;
const DEFAULT_STALE_SELF_CONFIRM_MS = 2000;
const DEFAULT_ATTACK_RANGE = BROWSER_RUNTIME_DEFAULTS.attackRange;
const DEFAULT_ATTACK_ENGAGE_RANGE = BROWSER_RUNTIME_DEFAULTS.attackEngageRange;
const DEFAULT_ATTACK_MIN_DROP = BROWSER_RUNTIME_DEFAULTS.attackMinDrop;
const DEFAULT_ATTACK_MIN_AFK_DROP = BROWSER_RUNTIME_DEFAULTS.attackMinAfkDrop;
const DEFAULT_ATTACK_MIN_REWARD_RATIO = BROWSER_RUNTIME_DEFAULTS.attackMinRewardRatio;
const DEFAULT_PROFIT_LIVE_THREAT_EXIT_RANGE = DEFAULT_ATTACK_RANGE;
const DEFAULT_PROFIT_LIVE_INJURY_EXIT_RANGE = DEFAULT_ATTACK_ENGAGE_RANGE;
const DEFAULT_PROFIT_LIVE_INJURY_HP = 90;
const DEFAULT_PROFIT_LIVE_PLAYER_DROP_MAX_DISTANCE = BROWSER_RUNTIME_DEFAULTS.postAttackDropCoinMaxDistance;
const DEFAULT_PROFIT_LIVE_PLAYER_DROP_MAX_AGE_TICKS = 8000;
const DEFAULT_REALTIME_LOOT_MAX_AGE_MS = 2500;
const DEFAULT_COMBAT_LOOT_TARGET_DROP_RATIO = 1.25;
const DEFAULT_SNAPSHOT_VISIBLE_COIN_MAX_DISTANCE = BROWSER_RUNTIME_DEFAULTS.globalCoinMaxDistance;
const DEFAULT_OPPORTUNITY_VISIBLE_DISTANCE = BROWSER_RUNTIME_DEFAULTS.opportunityVisibleDistance;
const DEFAULT_OPPORTUNITY_NEARBY_PRIORITY_DISTANCE = BROWSER_RUNTIME_DEFAULTS.opportunityNearbyPriorityDistance;
const DEFAULT_GLOBAL_COIN_MAX_DISTANCE = BROWSER_RUNTIME_DEFAULTS.globalCoinMaxDistance;
const DEFAULT_RECOVERY_COIN_MAX_DISTANCE = BROWSER_RUNTIME_DEFAULTS.recoveryCoinMaxDistance;
const DEFAULT_RECOVERY_PLAYER_DROP_MIN_AMOUNT = 2;
const DEFAULT_POST_ATTACK_RECOVERY_DROP_MAX_DISTANCE = BROWSER_RUNTIME_DEFAULTS.postAttackRecoveryDropMaxDistance;
const DEFAULT_LOW_HP_RECOVERY_THREAT_RADIUS = BROWSER_RUNTIME_DEFAULTS.loginPointSafetyRadius;
const DEFAULT_LOW_HP_RECOVERY_THREAT_HP = BROWSER_RUNTIME_DEFAULTS.combatLowHpLeaveThreshold;
const DEFAULT_LOW_HP_RECOVERY_THREAT_LOW_HP_ANCHOR = 20;
const DEFAULT_LOW_HP_RECOVERY_THREAT_HIGH_HP_RADIUS = 15000;
const DEFAULT_STAMINA_BUDGET_RELOGIN_DELAY_MS = BROWSER_RUNTIME_DEFAULTS.staminaBudgetReloginDelayMs;
const DEFAULT_AFK_ATTACK_COMMIT_RANGE_CM = BROWSER_RUNTIME_DEFAULTS.afkAttackCommitRangeCm;
const DEFAULT_AFK_COMBAT_MOVEMENT_STAMINA_PER_SHOT_MS = 425;
const DEFAULT_AFK_DISPLAY_INACTIVE_MS = 60000;
const EASY_KILL_CANDIDATE_DIAGNOSTIC_LIMIT = 8;
const EASY_KILL_SEEK_RANGE_CM_BY_SCORE = Object.freeze({
  1: 30000,
  2: 50000,
  3: 50000
});
const DEFAULT_INVULNERABLE_PROFIT_APPROACH_DISTANCE_CM = 5000;
const DEFAULT_INVULNERABLE_PROFIT_MOVE_SPEED_CM_PER_SEC = 1000;
const DEFAULT_DANGEROUS_TARGET_COOLDOWN_MS = BROWSER_RUNTIME_DEFAULTS.browserlessDangerousTargetCooldownMs ?? 900000;
const DEFAULT_EASY_KILL_APPROACH_WINDOW_MS = BROWSER_RUNTIME_DEFAULTS.browserlessEasyKillApproachWindowMs ?? 8000;
const DEFAULT_EASY_KILL_APPROACH_MIN_CLOSING_CM = BROWSER_RUNTIME_DEFAULTS.browserlessEasyKillApproachMinClosingCm ?? 1000;
const DEFAULT_ACTIVE_COIN_COMPETITION_MIN_SELF_DISTANCE_CM = BROWSER_RUNTIME_DEFAULTS.activeCoinCompetitionMinSelfDistanceCm ?? 18000;
const DEFAULT_ACTIVE_COIN_COMPETITION_NEAR_COIN_DISTANCE_CM = BROWSER_RUNTIME_DEFAULTS.activeCoinCompetitionNearCoinDistanceCm ?? 8000;
const DEFAULT_ACTIVE_COIN_COMPETITION_MIN_LEAD_DISTANCE_CM = BROWSER_RUNTIME_DEFAULTS.activeCoinCompetitionMinLeadDistanceCm ?? 4000;
const DEFAULT_ACTIVE_COIN_COMPETITION_UNCERTAIN_LEAD_DISTANCE_CM = BROWSER_RUNTIME_DEFAULTS.activeCoinCompetitionUncertainLeadDistanceCm ?? 12000;
const DEFAULT_ACTIVE_COIN_COMPETITION_HEADING_COS_MIN = BROWSER_RUNTIME_DEFAULTS.activeCoinCompetitionHeadingCosMin ?? 0.35;
const DEFAULT_ACTIVE_COIN_COMPETITION_MOVING_SPEED_MIN = BROWSER_RUNTIME_DEFAULTS.activeCoinCompetitionMovingSpeedMin ?? 5;
const DAY_MS = 24 * 60 * 60 * 1000;
const UTC8_OFFSET_MS = 8 * 60 * 60 * 1000;
const DANGEROUS_COMBAT_EXIT_REASONS = new Set([
  'combat-critical-hp-leave',
  'combat-hp-disadvantage-leave',
  'combat-low-hp-disadvantage-leave',
  'combat-predicted-leave-hp',
  'combat-miss-close-timeout-leave',
  'combat-no-damage-generation-limit-leave',
  'combat-exit-poor-exchange',
  'incoming-bullet-early-leave',
  'continuous-incoming-bullets-leave',
  'rapid-damage-early-leave'
]);
const EASY_KILL_ENGAGEMENT_CONTINUATION_ACTIONS = new Set([
  'combat-live',
  'attack',
  'seek-enemy',
  'opportunistic-shot'
]);
const REALTIME_INPUT_CACHE = Symbol('browserless-realtime-input-cache');

function buildBrowserlessRuntimeDefaults(config = {}) {
  return buildRuntimeDefaults(config, false);
}

function cloneJson(value) {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function pointRadiusFromOrigin(point) {
  const x = Number(point?.x);
  const y = Number(point?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return Infinity;
  return Math.hypot(x, y);
}

function browserlessCenterActivityRadius(options = {}) {
  const value = Number(options.browserlessCenterActivityRadiusCm
    ?? BROWSER_RUNTIME_DEFAULTS.browserlessCenterActivityRadiusCm
    ?? 0);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function insideCenterActivityRadius(point, options = {}) {
  const radius = browserlessCenterActivityRadius(options);
  if (!(radius > 0)) return true;
  return pointRadiusFromOrigin(point) <= radius;
}

function filterCenterActivityProfitItems(items = [], options = {}) {
  const radius = browserlessCenterActivityRadius(options);
  if (!(radius > 0)) return items || [];
  return (items || []).filter(item => insideCenterActivityRadius(item, options));
}

function centerActivityCoinAdmissionReason(coin, selfKillTargetTicks, options = {}) {
  if (insideCenterActivityRadius(coin, options)) return 'inside-center';
  const visibleDistance = Math.max(0, Number(
    options.snapshotVisibleCoinMaxDistanceCm
      ?? options.snapshotCoinFallbackMaxDistanceCm
      ?? options.globalCoinMaxDistance
      ?? DEFAULT_SNAPSHOT_VISIBLE_COIN_MAX_DISTANCE
  ));
  if (!(Number.isFinite(Number(coin?.distance))) || (visibleDistance > 0 && Number(coin.distance) > visibleDistance)) return '';
  if (selfKillTargetTicks && isSelfKilledPlayerDropCoin(coin, selfKillTargetTicks, options)) {
    return 'self-kill-drop-outside-center';
  }
  if (Number(coin?.amount || 0) >= highValueCoinPriorityAmount(options)
    && Number.isFinite(Number(coin?.distance))
    && Number(coin.distance) <= highValueCoinPriorityRange(options)) {
    return 'visible-high-value-coin-outside-center';
  }
  return '';
}

function partitionCenterActivityCoins(items = [], selfKillTargetTicks = null, options = {}) {
  const admitted = [];
  const filtered = [];
  const edgeAdmitted = [];
  const centerRadiusCm = browserlessCenterActivityRadius(options);
  for (const coin of items || []) {
    const reason = centerActivityCoinAdmissionReason(coin, selfKillTargetTicks, options);
    if (!reason) {
      filtered.push(coin);
      continue;
    }
    if (reason === 'inside-center') {
      admitted.push(coin);
      continue;
    }
    const targetRadiusCm = pointRadiusFromOrigin(coin);
    const enriched = {
      ...coin,
      centerActivityEdge: {
        admitted: true,
        reason,
        centerRadiusCm: Math.round(centerRadiusCm),
        targetRadiusCm: Number.isFinite(targetRadiusCm) ? Math.round(targetRadiusCm) : null,
        outsideByCm: Number.isFinite(targetRadiusCm) ? Math.max(0, Math.round(targetRadiusCm - centerRadiusCm)) : null
      }
    };
    admitted.push(enriched);
    edgeAdmitted.push(enriched);
  }
  return { admitted, filtered, edgeAdmitted };
}

function centerActivityAfkEdgeExtension(options = {}) {
  const value = Number(options.combatAttackRange ?? options.attackRange ?? DEFAULT_ATTACK_RANGE);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function summarizeCenterActivityAfkTarget(target, centerRadius, edgeRadius, reason = '') {
  const targetRadius = pointRadiusFromOrigin(target);
  const edge = target?.centerActivityEdge || {};
  return {
    userId: numberOrNull(target?.user_id ?? target?.userId),
    name: entityDisplayName(target),
    drop: entityDropValue(target),
    distanceCm: Number.isFinite(Number(target?.distance)) ? Math.round(Number(target.distance)) : null,
    targetRadiusCm: Number.isFinite(targetRadius) ? Math.round(targetRadius) : null,
    outsideByCm: Number.isFinite(targetRadius) ? Math.max(0, Math.round(targetRadius - centerRadius)) : null,
    edgeRadiusCm: Math.round(edgeRadius),
    reason,
    continued: edge.continued === true,
    continuationAgeMs: Number.isFinite(Number(edge.continuationAgeMs))
      ? Math.max(0, Math.round(Number(edge.continuationAgeMs)))
      : null,
    sourceActionKind: edge.sourceActionKind ? String(edge.sourceActionKind) : ''
  };
}

function partitionCenterActivityAfkTargets(items = [], self = null, options = {}) {
  const centerRadius = browserlessCenterActivityRadius(options);
  if (!(centerRadius > 0)) {
    return { targets: items || [], edgeTargets: [], filteredTargets: [], filteredDetails: [] };
  }
  const edgeExtension = centerActivityAfkEdgeExtension(options);
  const edgeRadius = centerRadius + edgeExtension;
  const selfRadius = pointRadiusFromOrigin(self);
  const visibleDistance = opportunityVisibleDistance(options);
  const continuation = options.centerActivityAfkContinuation || null;
  const targets = [];
  const edgeTargets = [];
  const filteredTargets = [];
  const filteredDetails = [];
  for (const target of items || []) {
    const targetRadius = pointRadiusFromOrigin(target);
    if (Number.isFinite(targetRadius) && targetRadius <= centerRadius) {
      targets.push(target);
      continue;
    }
    const targetDistance = Number(target?.distance ?? Infinity);
    const admission = evaluateCenterActivityAfkAdmissionCore({
      centerRadiusCm: centerRadius,
      edgeRadiusCm: edgeRadius,
      selfRadiusCm: selfRadius,
      targetRadiusCm: targetRadius,
      targetDistanceCm: targetDistance,
      visibleDistanceCm: visibleDistance,
      authority: target?.authority,
      targetId: target?.user_id ?? target?.userId,
      continuation
    });
    if (!admission.admitted) {
      filteredTargets.push(target);
      filteredDetails.push(summarizeCenterActivityAfkTarget(target, centerRadius, edgeRadius, admission.reason));
      continue;
    }
    const outsideByCm = Math.max(0, targetRadius - centerRadius);
    target.centerActivityEdge = {
      admitted: true,
      ...(admission.continued ? {
        continued: true,
        continuationAgeMs: Math.max(0, Math.round(Number(continuation.ageMs || 0))),
        sourceActionKind: String(continuation.sourceActionKind || '')
      } : {}),
      centerRadiusCm: Math.round(centerRadius),
      edgeRadiusCm: Math.round(edgeRadius),
      targetRadiusCm: Math.round(targetRadius),
      outsideByCm: Math.round(outsideByCm),
      returnCostMs: outsideByCm,
      reason: admission.reason
    };
    targets.push(target);
    edgeTargets.push(target);
  }
  return { targets, edgeTargets, filteredTargets, filteredDetails };
}

function centerActivityInputSummary(self, filtered = {}, options = {}) {
  const radiusCm = browserlessCenterActivityRadius(options);
  if (!(radiusCm > 0)) return null;
  const selfRadius = pointRadiusFromOrigin(self);
  const afkEdgeRadiusCm = radiusCm + centerActivityAfkEdgeExtension(options);
  return {
    radiusCm: Math.round(radiusCm),
    afkEdgeRadiusCm: Math.round(afkEdgeRadiusCm),
    selfRadiusCm: Number.isFinite(selfRadius) ? Math.round(selfRadius) : null,
    selfOutsideCm: Number.isFinite(selfRadius) ? Math.max(0, Math.round(selfRadius - radiusCm)) : null,
    filteredAfkTargets: Math.max(0, Math.round(Number(filtered.afkTargets || 0))),
    edgeAdmittedAfkTargets: Math.max(0, Math.round(Number(filtered.edgeAdmittedAfkTargets || 0))),
    edgeContinuedAfkTargets: Math.max(0, Math.round(Number(filtered.edgeContinuedAfkTargets || 0))),
    filteredRealtimeCoins: Math.max(0, Math.round(Number(filtered.realtimeCoins || 0))),
    filteredSnapshotCoins: Math.max(0, Math.round(Number(filtered.snapshotCoins || 0))),
    edgeAdmittedRealtimeCoins: (filtered.edgeAdmittedRealtimeCoins || []).slice(0, 8).map(item => cloneJson(item)),
    edgeAdmittedSnapshotCoins: (filtered.edgeAdmittedSnapshotCoins || []).slice(0, 8).map(item => cloneJson(item)),
    edgeAfkTargets: (filtered.edgeAfkTargets || []).slice(0, 8).map(item => cloneJson(item)),
    continuedEdgeAfkTargets: (filtered.continuedEdgeAfkTargets || []).slice(0, 8).map(item => cloneJson(item)),
    filteredAfkTargetDetails: (filtered.filteredAfkTargetDetails || []).slice(0, 8).map(item => cloneJson(item))
  };
}

const STAMINA_SPENT_FIELDS = [
  'stamina_spent',
  'staminaSpent',
  'stamina_spent_ms',
  'staminaSpentMs'
];

const INVULNERABLE_MS_FIELDS = [
  'invulnerable_remaining_ms',
  'invincible_remaining_ms',
  'invulnerability_remaining_ms',
  'invulnerableRemainingMs',
  'invincibleRemainingMs',
  'invulnerabilityRemainingMs',
  'invulnerable_ms',
  'invincible_ms',
  'invulnerability_ms',
  'immune_remaining_ms',
  'immuneRemainingMs'
];

const INVULNERABLE_TICK_FIELDS = [
  'invulnerable_remaining_ticks',
  'invincible_remaining_ticks',
  'invulnerability_remaining_ticks',
  'invulnerableTicks',
  'invulnerableRemainingTicks',
  'invincibleRemainingTicks',
  'invulnerabilityRemainingTicks',
  'invulnerable_ticks',
  'invincible_ticks',
  'invulnerability_ticks',
  'invulnerable_tick',
  'invincible_tick',
  'invulnerability_tick'
];

const INVULNERABLE_GENERIC_REMAINING_FIELDS = [
  'invulnerable_remaining',
  'invincible_remaining',
  'invulnerability_remaining',
  'invulnerableRemaining',
  'invincibleRemaining',
  'invulnerabilityRemaining'
];

const INVULNERABLE_FLAG_FIELDS = [
  'invulnerable',
  'is_invulnerable',
  'isInvulnerable',
  'immune',
  'is_immune'
];

function firstNumberFromFields(source, fields) {
  if (!source || typeof source !== 'object') return null;
  for (const field of fields || []) {
    if (!Object.prototype.hasOwnProperty.call(source, field)) continue;
    if (source[field] === null || source[field] === undefined || source[field] === '') continue;
    const value = numberOrNull(source[field]);
    if (value !== null) return value;
  }
  return null;
}

function positiveFieldValue(source, fields) {
  if (!source || typeof source !== 'object') return null;
  let picked = null;
  for (const field of fields || []) {
    const value = numberOrNull(source[field]);
    if (value === null || value <= 0) continue;
    picked = picked === null ? value : Math.max(picked, value);
  }
  return picked;
}

function staminaSpentValue(entity) {
  return firstNumberFromFields(entity, STAMINA_SPENT_FIELDS);
}

function assignStaminaAliases(target, windowName, remaining, limit) {
  const cleanRemaining = (remaining === null || remaining === undefined || remaining === '') ? null : numberOrNull(remaining);
  const cleanLimit = (limit === null || limit === undefined || limit === '') ? null : numberOrNull(limit);
  if (windowName === '5s') {
    if (cleanRemaining !== null) {
      target.stamina_5s_remaining_milli = cleanRemaining;
      target.stamina5sRemainingMilli = cleanRemaining;
      target.stamina5s = cleanRemaining;
    }
    if (cleanLimit !== null) {
      target.stamina_5s_limit_milli = cleanLimit;
      target.stamina5sLimitMilli = cleanLimit;
      target.stamina5sLimit = cleanLimit;
    }
  } else if (windowName === '1h') {
    if (cleanRemaining !== null) {
      target.stamina_1h_remaining_milli = cleanRemaining;
      target.stamina1hRemainingMilli = cleanRemaining;
      target.stamina1h = cleanRemaining;
    }
    if (cleanLimit !== null) {
      target.stamina_1h_limit_milli = cleanLimit;
      target.stamina1hLimitMilli = cleanLimit;
      target.stamina1hLimit = cleanLimit;
    }
  } else if (windowName === '1d') {
    if (cleanRemaining !== null) {
      target.stamina_1d_remaining_milli = cleanRemaining;
      target.stamina1dRemainingMilli = cleanRemaining;
      target.stamina1d = cleanRemaining;
    }
    if (cleanLimit !== null) {
      target.stamina_1d_limit_milli = cleanLimit;
      target.stamina1dLimitMilli = cleanLimit;
      target.stamina1dLimit = cleanLimit;
    }
  }
}

function distanceBetween(a, b) {
  const ax = Number(a?.x);
  const ay = Number(a?.y);
  const bx = Number(b?.x);
  const by = Number(b?.y);
  if (!Number.isFinite(ax) || !Number.isFinite(ay) || !Number.isFinite(bx) || !Number.isFinite(by)) return Infinity;
  return Math.hypot(ax - bx, ay - by);
}

function isAliveEntity(entity) {
  const life = String(entity?.life || '').toLowerCase();
  return !life || life === 'alive';
}

function isActiveEntity(entity) {
  const mode = String(entity?.current_join_mode || entity?.mode || entity?.joined || '').toLowerCase();
  return mode === 'active';
}

function isFiringEntity(entity) {
  return Boolean(entity?.firing || entity?.is_firing || entity?.shooting);
}

function entitySpeed(entity) {
  const explicit = numberOrNull(entity?.speed ?? entity?.speed_per_tick ?? entity?.speedPerTick);
  if (explicit !== null) return explicit;
  const vx = Number(entity?.vx || 0);
  const vy = Number(entity?.vy || 0);
  return Math.hypot(vx, vy);
}

function isMovingEntity(entity, options = {}) {
  if (!entity) return false;
  if (entity.moving === true || entity.recentlyMoved === true) return true;
  const threshold = Math.max(0, Number(options.activeSpeedMin ?? BROWSER_RUNTIME_DEFAULTS.activeSpeedMin));
  return entitySpeed(entity) >= threshold;
}

function targetWhitelistFromOptions(options = {}) {
  if (options.targetWhitelist && typeof options.targetWhitelist === 'object') return options.targetWhitelist;
  const maxEntries = options.targetWhitelistMaxNames ?? BROWSER_RUNTIME_DEFAULTS.targetWhitelistMaxNames;
  const nameSet = options.targetWhitelistNameSet instanceof Set
    ? options.targetWhitelistNameSet
    : (Array.isArray(options.targetWhitelistNames)
        ? targetWhitelistNameSet(options.targetWhitelistNames, maxEntries)
        : null);
  const userIdSet = options.targetWhitelistUserIdSet instanceof Set
    ? options.targetWhitelistUserIdSet
    : (Array.isArray(options.targetWhitelistUserIds)
        ? targetWhitelistUserIdSet(options.targetWhitelistUserIds, maxEntries)
        : null);
  return nameSet || userIdSet ? { nameSet, userIdSet } : null;
}

function isWhitelistedTargetForOptions(entity, options = {}) {
  if (!entity) return false;
  if (entity.whitelisted === true) return true;
  if (typeof options.whitelistCheck === 'function' && options.whitelistCheck(entity)) return true;
  return targetIsWhitelisted(entity, targetWhitelistFromOptions(options));
}

function refreshDecisionEntityActivity(entity, options = {}) {
  if (!entity) return entity;
  const moving = isMovingEntity(entity, options);
  const firing = isFiringEntity(entity);
  const fullStamina5s = hasFull5sStamina(entity, options);
  return {
    ...entity,
    moving,
    firing,
    fullStamina5s,
    active: moving || firing || (isActiveEntity(entity) && (!fullStamina5s || isInvulnerableEntity(entity))),
    whitelisted: isWhitelistedTargetForOptions(entity, options)
  };
}

function isCurrentlyActiveEntity(entity, options = {}) {
  if (!entity) return false;
  return isMovingEntity(entity, options)
    || isFiringEntity(entity)
    || (isActiveEntity(entity) && (!hasFull5sStamina(entity, options) || isInvulnerableEntity(entity)));
}

function entityDisplayName(entity) {
  return String(entity?.name || entity?.label || entity?.username || entity?.user_name || entity?.displayName || entity?.display_name || '').trim();
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

function entityDropValue(entity) {
  return Number(entity?.drop ?? entity?.Drop ?? entity?.reward ?? entity?.coin_reward ?? entity?.death_reward_preview ?? entity?.death_drop_coins ?? 0) || 0;
}

function easyKillTargetUserId(target) {
  return numberOrNull(target?.userId ?? target?.user_id ?? target?.targetUserId ?? target?.target_user_id);
}

function easyKillScore(value) {
  const score = Math.round(Number(value));
  return Number.isFinite(score) ? Math.min(3, Math.max(1, score)) : 1;
}

function easyKillSeekRangeCm(value) {
  return EASY_KILL_SEEK_RANGE_CM_BY_SCORE[easyKillScore(value)];
}

function easyKillPlayerTracker(options = {}) {
  const tracker = options.easyKillPlayerTracker;
  return tracker && typeof tracker === 'object' ? tracker : null;
}

function dailyDamagePlayerTracker(options = {}) {
  const tracker = options.damagePlayerTracker;
  return tracker && typeof tracker === 'object' ? tracker : null;
}

function callEasyKillPlayerTracker(options, method, ...args) {
  const tracker = easyKillPlayerTracker(options);
  if (!tracker || typeof tracker[method] !== 'function') return null;
  try {
    return tracker[method](...args);
  } catch (_) {
    return null;
  }
}

function easyKillTrackerStatus(options = {}) {
  const tracked = callEasyKillPlayerTracker(options, 'status');
  if (tracked && typeof tracked === 'object') return tracked;
  const players = Array.isArray(options.easyKillPlayers) ? cloneJson(options.easyKillPlayers) : [];
  return {
    file: String(options.easyKillPlayersFile || ''),
    updatedAt: '',
    playerCount: players.length,
    players,
    blockedUserIds: Array.isArray(options.easyKillBlockedUserIds) ? cloneJson(options.easyKillBlockedUserIds) : [],
    engagements: []
  };
}

function dailyDamageTrackerStatus(options = {}, nowMs = Date.now()) {
  const explicit = options.damageActorUserIds instanceof Set
    ? Array.from(options.damageActorUserIds)
    : (Array.isArray(options.damageActorUserIds) ? options.damageActorUserIds : []);
  const explicitUserIds = explicit
    .map(value => Number(value?.userId ?? value?.user_id ?? value))
    .filter(Number.isFinite);
  const tracker = dailyDamagePlayerTracker(options);
  if (tracker && typeof tracker.status === 'function') {
    try {
      const tracked = tracker.status(nowMs);
      if (tracked && typeof tracked === 'object') {
        const players = Array.isArray(tracked.players) ? tracked.players : [];
        const userIds = Array.from(new Set([
          ...explicitUserIds,
          ...(tracked.userIds || []),
          ...players.map(value => value?.userId ?? value?.user_id)
        ].map(Number).filter(Number.isFinite)));
        return {
          ...tracked,
          playerCount: userIds.length,
          userIds,
          players: [
            ...players,
            ...userIds
              .filter(userId => !players.some(player => Number(player?.userId ?? player?.user_id) === userId))
              .map(userId => ({ userId }))
          ]
        };
      }
    } catch (_) {}
  }
  return {
    day: '',
    updatedAt: '',
    playerCount: explicitUserIds.length,
    userIds: explicitUserIds,
    players: explicitUserIds.map(userId => ({ userId }))
  };
}

function ensureEasyKillTargetSuppressionMap(stateful = {}, nowMs = 0) {
  if (!stateful || typeof stateful !== 'object') return {};
  if (!stateful.easyKillTargetSuppressions
    || typeof stateful.easyKillTargetSuppressions !== 'object'
    || Array.isArray(stateful.easyKillTargetSuppressions)) {
    stateful.easyKillTargetSuppressions = {};
  }
  for (const [id, item] of Object.entries(stateful.easyKillTargetSuppressions)) {
    if (Number(item?.until || 0) <= Number(nowMs || 0)) delete stateful.easyKillTargetSuppressions[id];
  }
  return stateful.easyKillTargetSuppressions;
}

function easyKillTargetSuppressed(stateful = {}, target = null, nowMs = 0) {
  const userId = easyKillTargetUserId(target);
  if (userId === null) return false;
  return Number(ensureEasyKillTargetSuppressionMap(stateful, nowMs)[String(userId)]?.until || 0) > Number(nowMs || 0)
    || Boolean(economicProfitPursuitSuppressionRecordById(stateful, String(userId), nowMs));
}

function refreshEasyKillTargetAnnotations(input, stateful = {}, options = {}, statusOverride = null) {
  if (!input || typeof input !== 'object') return null;
  const status = statusOverride || easyKillTrackerStatus(options);
  const damageStatus = dailyDamageTrackerStatus(options, input.nowMs);
  const knownPlayers = new Map((status.players || [])
    .map(player => [easyKillTargetUserId(player), player])
    .filter(([userId]) => userId !== null)
    .map(([userId, player]) => [String(userId), player]));
  const knownIds = new Set(knownPlayers.keys());
  const blockedIds = new Set((status.blockedUserIds || []).map(numberOrNull).filter(value => value !== null).map(String));
  const damagedIds = new Set([
    ...(damageStatus.userIds || []),
    ...(damageStatus.players || [])
  ].map(value => Number(value?.userId ?? value?.user_id ?? value)).filter(Number.isFinite).map(String));
  const liveProfitEnabled = options.controlMode === 'profit-live' && options.combatEnabled === true;
  const visibleDistance = opportunityVisibleDistance(options);
  const targets = input.visibleTargets || [];
  for (const target of targets) {
    const userId = easyKillTargetUserId(target);
    const known = userId !== null && knownIds.has(String(userId));
    const trackedPlayer = known ? knownPlayers.get(String(userId)) : null;
    const score = known ? easyKillScore(trackedPlayer?.score) : null;
    const seekRangeCm = known ? easyKillSeekRangeCm(score) : 0;
    const damagedToday = known && damagedIds.has(String(userId));
    const suppressed = known && (
      blockedIds.has(String(userId))
      || easyKillTargetSuppressed(stateful, target, input.nowMs)
    );
    target.easyKillKnown = known;
    target.easyKillScore = score;
    target.easyKillSeekRangeCm = seekRangeCm || null;
    target.easyKillDamagedToday = damagedToday;
    target.easyKillThreatExempt = Boolean(known && !damagedToday && target.economicThreatReentry !== true);
    target.easyKillProfitTarget = Boolean(
      known
        && !suppressed
        && liveProfitEnabled
        && target.active
        && target.alive !== false
        && !target.whitelisted
        && !target.invulnerable
        && Number.isFinite(Number(target.distance))
        && (visibleDistance <= 0 || Number(target.distance) <= visibleDistance)
        && Number(target.distance) <= seekRangeCm
    );
  }
  input.easyKillTargets = targets.filter(target => target.easyKillProfitTarget);
  input.easyKill = {
    file: status.file || '',
    updatedAt: status.updatedAt || '',
    playerCount: Number(status.playerCount ?? status.players?.length ?? 0),
    blockedCount: blockedIds.size,
    damagedKnownCount: Array.from(knownIds).filter(userId => damagedIds.has(userId)).length,
    trustedVisibleCount: targets.filter(target => target.easyKillThreatExempt).length,
    visibleEligibleCount: input.easyKillTargets.length
  };
  return status;
}

function entityStaminaSummary(entity) {
  return {
    stamina: numberOrNull(entity?.stamina),
    stamina5sRemainingMilli: staminaRemainingValue(entity, '5s'),
    stamina5sLimitMilli: staminaLimitForWindow(entity, '5s'),
    stamina1hRemainingMilli: staminaRemainingValue(entity, '1h'),
    stamina1hLimitMilli: staminaLimitForWindow(entity, '1h'),
    stamina1dRemainingMilli: staminaRemainingValue(entity, '1d'),
    stamina1dLimitMilli: staminaLimitForWindow(entity, '1d'),
    staminaSpent: staminaSpentValue(entity),
    staminaMetadataAuthority: entity?.staminaMetadataAuthority || ''
  };
}

function ensureSeenEntitiesState(stateful = {}) {
  if (!stateful || typeof stateful !== 'object') return null;
  if (!stateful.seenEntities || typeof stateful.seenEntities !== 'object' || Array.isArray(stateful.seenEntities)) {
    stateful.seenEntities = {};
  }
  return stateful.seenEntities;
}

function browserlessRecentActivityKey(entity) {
  const id = entity?.user_id ?? entity?.userId ?? entity?.entity_id ?? entity?.entityId;
  if (id === null || id === undefined || id === '') return '';
  return String(id);
}

function annotateBrowserlessRecentActivity(entities = [], stateful = {}, nowMs = 0, options = {}) {
  const seenEntities = ensureSeenEntitiesState(stateful);
  if (!seenEntities) return entities;
  const t = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  const sampleMs = Math.max(1, Number(options.combatAimMotionSampleMs ?? BROWSER_RUNTIME_DEFAULTS.combatAimMotionSampleMs ?? 50));
  const decayMs = Math.max(sampleMs, Number(options.combatAimRecentMotionDecayMs ?? BROWSER_RUNTIME_DEFAULTS.combatAimRecentMotionDecayMs ?? 900));
  const activeMoveMin = Math.max(0, Number(options.activeMoveMin ?? BROWSER_RUNTIME_DEFAULTS.activeMoveMin ?? 120));
  const activeSpeedMin = Math.max(0, Number(options.activeSpeedMin ?? BROWSER_RUNTIME_DEFAULTS.activeSpeedMin ?? 30));
  const activeSeenMs = Math.max(0, Number(options.activeSeenMs ?? BROWSER_RUNTIME_DEFAULTS.activeSeenMs ?? 1800));
  const afkCooldownMs = Math.max(0, Number(options.afkRecentActivityCooldownMs ?? BROWSER_RUNTIME_DEFAULTS.afkRecentActivityCooldownMs ?? 0) || 0);
  const staminaDropThreshold = Math.max(0, Number(options.opportunityAfkStaminaDropThresholdMs ?? BROWSER_RUNTIME_DEFAULTS.opportunityAfkStaminaDropThresholdMs ?? 100) || 100);
  for (const entity of entities || []) {
    const key = browserlessRecentActivityKey(entity);
    if (!key) continue;
    const x = numberOrNull(entity.x);
    const y = numberOrNull(entity.y);
    const previous = seenEntities[key] || null;
    let movedAt = Number(previous?.movedAt || 0);
    let activityAt = Number(previous?.activityAt || 0);
    let motionSampleSpeed = 0;
    let motionObservedSpeed = 0;
    const currentSpeed = entitySpeed(entity);
    const firing = isFiringEntity(entity);
    const stamina5s = staminaRemainingValue(entity, '5s');
    const previousStamina = numberOrNull(previous?.stamina5s);
    if (previous
      && x !== null
      && y !== null
      && numberOrNull(previous.x) !== null
      && numberOrNull(previous.y) !== null) {
      const elapsedMs = Math.max(sampleMs, t - Number(previous.seenAt || t));
      const delta = Math.hypot(x - Number(previous.x), y - Number(previous.y));
      motionSampleSpeed = delta * sampleMs / elapsedMs;
      const retained = Math.max(0, Number(previous.motionObservedSpeed || 0)) * Math.max(0, 1 - elapsedMs / decayMs);
      motionObservedSpeed = Math.max(motionSampleSpeed, retained);
      if (delta >= activeMoveMin) {
        movedAt = t;
        activityAt = t;
      }
    }
    if (!previous && (Math.abs(Number(entity.vx) || 0) || Math.abs(Number(entity.vy) || 0))) {
      movedAt = t;
      activityAt = t;
    }
    if (currentSpeed >= activeSpeedMin || firing) activityAt = t;
    if (stamina5s !== null && previousStamina !== null && stamina5s + staminaDropThreshold < previousStamina) {
      activityAt = t;
    }
    const motionAgeMs = movedAt ? Math.max(0, t - movedAt) : null;
    const recentActivityAgeMs = activityAt ? Math.max(0, t - activityAt) : null;
    entity.motionSampleSpeed = motionSampleSpeed;
    entity.motionObservedSpeed = motionObservedSpeed;
    entity.motionAgeMs = motionAgeMs;
    entity.recentActivityAgeMs = recentActivityAgeMs;
    entity.recentlyActive = Boolean(recentActivityAgeMs !== null && recentActivityAgeMs <= afkCooldownMs);
    entity.recentlyMoved = Boolean(movedAt && t - movedAt <= activeSeenMs);
    seenEntities[key] = {
      x,
      y,
      seenAt: t,
      movedAt,
      activityAt,
      motionSampleSpeed,
      motionObservedSpeed,
      stamina5s: stamina5s !== null ? stamina5s : (previousStamina !== null ? previousStamina : null)
    };
  }
  const seenTtlMs = Math.max(10000, afkCooldownMs + 2000);
  for (const [key, seen] of Object.entries(seenEntities)) {
    if (t - Number(seen?.seenAt || 0) > seenTtlMs) delete seenEntities[key];
  }
  return entities;
}

function ensureOpportunityAfkStaminaState(stateful = {}) {
  if (!stateful || typeof stateful !== 'object') return null;
  if (!stateful.opportunityAfkStamina || typeof stateful.opportunityAfkStamina !== 'object' || Array.isArray(stateful.opportunityAfkStamina)) {
    stateful.opportunityAfkStamina = {};
  }
  return stateful.opportunityAfkStamina;
}

function opportunityAfkTargetId(target) {
  const id = target?.user_id ?? target?.userId ?? target?.id;
  return id === undefined || id === null || id === '' ? '' : String(id);
}

function targetStamina5sRemaining(target) {
  const stamina5s = staminaRemainingValue(target, '5s');
  return stamina5s !== null ? stamina5s : null;
}

function opportunityAfkStaminaCooldownMs(options = {}) {
  const value = Number(options.opportunityAfkStaminaCooldownMs ?? BROWSER_RUNTIME_DEFAULTS.opportunityAfkStaminaCooldownMs ?? 60000);
  return Math.max(0, Number.isFinite(value) ? value : 60000);
}

function opportunityAfkStaminaDropThresholdMs(options = {}) {
  const value = Number(options.opportunityAfkStaminaDropThresholdMs ?? BROWSER_RUNTIME_DEFAULTS.opportunityAfkStaminaDropThresholdMs ?? 100);
  return Math.max(0, Number.isFinite(value) ? value : 100);
}

function updateBrowserlessOpportunityAfkStaminaObservations(targets = [], stateful = {}, nowMs = 0, options = {}) {
  const state = ensureOpportunityAfkStaminaState(stateful);
  if (!state) return targets;
  const t = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  const cooldownMs = opportunityAfkStaminaCooldownMs(options);
  const dropThreshold = opportunityAfkStaminaDropThresholdMs(options);
  const observationGapMs = Math.max(
    1000,
    Number(options.activeSeenMs ?? BROWSER_RUNTIME_DEFAULTS.activeSeenMs ?? 0) * 2,
    Number(options.tickMs ?? BROWSER_RUNTIME_DEFAULTS.tickMs ?? 0) * 8
  );
  for (const target of targets || []) {
    const id = opportunityAfkTargetId(target);
    if (!id) continue;
    const stamina5s = targetStamina5sRemaining(target);
    const previous = state[id] || {};
    const previousStamina = Number(previous.stamina5s);
    const previousSeenAt = Number(previous.lastSeenAt || 0);
    const continuous = previousSeenAt > 0 && t - previousSeenAt <= observationGapMs;
    let stableSince = continuous
      ? Math.max(0, Number(previous.stableSince || previous.observedSince || previousSeenAt || t))
      : t;
    let cooldownUntil = Math.max(0, Number(previous.cooldownUntil || 0));
    let consumedAt = continuous ? Math.max(0, Number(previous.consumedAt || 0)) : 0;
    const observedDrop = stamina5s !== null && continuous && Number.isFinite(previousStamina) && stamina5s + dropThreshold < previousStamina;
    const observedNonFull = stamina5s !== null && !hasFull5sStamina(target, options);
    if (cooldownMs > 0 && (observedDrop || observedNonFull)) {
      stableSince = t;
      cooldownUntil = Math.max(cooldownUntil, t + cooldownMs);
      consumedAt = t;
    } else if (cooldownUntil <= t) {
      cooldownUntil = 0;
    }
    state[id] = {
      stamina5s: stamina5s !== null ? stamina5s : (Number.isFinite(previousStamina) ? previousStamina : null),
      lastSeenAt: t,
      stableSince,
      cooldownUntil,
      consumedAt
    };
    target.afkStaminaCooldownRemainingMs = Math.max(0, Math.round(cooldownUntil - t));
    target.afkStaminaObservedMs = Math.max(0, Math.round(t - stableSince));
    if (target.afkStaminaCooldownRemainingMs > 0 && consumedAt > 0) target.afkStaminaConsumedAt = consumedAt;
  }
  const ttlMs = Math.max(300000, cooldownMs * 5);
  for (const [id, item] of Object.entries(state)) {
    const lastSeenAt = Number(item?.lastSeenAt || 0);
    const cooldownUntil = Number(item?.cooldownUntil || 0);
    if (cooldownUntil <= t && lastSeenAt > 0 && t - lastSeenAt > ttlMs) delete state[id];
  }
  return targets;
}

function afkOpportunityBlockedByStaminaCooldown(target, options = {}) {
  const distance = Number(target?.distance ?? Infinity);
  const attackRange = Math.max(0, Number(options.attackRange ?? options.combatAttackRange ?? DEFAULT_ATTACK_RANGE));
  if (Number.isFinite(distance) && distance <= attackRange) return false;
  return Number(target?.afkStaminaCooldownRemainingMs || 0) > 0;
}

function afkTargetBlockedByRecentActivity(target, options = {}) {
  const distance = Number(target?.distance ?? Infinity);
  const attackRange = Math.max(0, Number(options.attackRange ?? options.combatAttackRange ?? DEFAULT_ATTACK_RANGE));
  if (Number.isFinite(distance) && distance <= attackRange) return false;
  return Boolean(target?.recentlyActive);
}

function recentAfkAttackCommitment(stateful = {}, nowMs = 0, options = {}) {
  const attacks = Array.isArray(stateful.attackHistory) ? stateful.attackHistory : [];
  const latest = attacks.at(-1) || null;
  if (!latest || latest.combat || latest.afk !== true || latest.action !== 'attack') return null;
  const at = Number(latest.at || 0);
  const graceMs = Math.max(1000, Number(options.combatEngageGraceMs || 5000));
  const ageMs = Math.max(0, Number(nowMs || 0) - at);
  if (!(at > 0) || ageMs > graceMs) return null;
  return { targetId: String(latest.id ?? ''), at, ageMs, graceMs };
}

function markAfkAttackContinuation(target, commitment, options = {}) {
  if (!target || !commitment?.targetId) return false;
  const targetId = targetIdentity(target);
  const distance = Number(target.distance ?? Infinity);
  const attackRange = Math.max(0, Number(options.attackRange ?? options.combatAttackRange ?? DEFAULT_ATTACK_RANGE));
  if (!targetId || String(targetId) !== commitment.targetId) return false;
  if (!Number.isFinite(distance) || distance > attackRange) return false;
  target.afkAttackContinuation = {
    source: 'recent-actual-shot',
    at: commitment.at,
    ageMs: Math.round(commitment.ageMs),
    graceMs: Math.round(commitment.graceMs)
  };
  return true;
}

function isBrowserlessAvoidanceThreat(target) {
  if (!target || target.alive === false) return false;
  if (target.whitelisted) return false;
  if (target.easyKillThreatExempt) return false;
  return Boolean(target.active && target.invulnerable);
}

function mergeRecentInvulnerableThreats(visibleTargets, liveThreats, self, stateful = {}, options = {}) {
  if (!stateful || typeof stateful !== 'object') return liveThreats || [];
  if (!stateful.recentInvulnerableThreats || typeof stateful.recentInvulnerableThreats !== 'object' || Array.isArray(stateful.recentInvulnerableThreats)) {
    stateful.recentInvulnerableThreats = {};
  }
  const memory = stateful.recentInvulnerableThreats;
  const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  const currentTick = numberOrNull(options.currentTick ?? options.realtimeTick);
  const ttlMs = Math.max(1000, Number(options.invulnerableThreatMemoryMs ?? 2500));
  const clearConfirmationsRequired = Math.max(2, Math.round(Number(options.invulnerableThreatClearConfirmations ?? 2)));
  const visibleById = new Map((visibleTargets || [])
    .map(target => [targetIdentity(target), target])
    .filter(([id]) => id));
  const liveById = new Map((liveThreats || [])
    .map(target => [targetIdentity(target), target])
    .filter(([id]) => id));
  for (const [id, threat] of liveById) {
    memory[id] = {
      id,
      name: threat.name || '',
      x: numberOrNull(threat.x),
      y: numberOrNull(threat.y),
      vx: numberOrNull(threat.vx) ?? 0,
      vy: numberOrNull(threat.vy) ?? 0,
      distance: numberOrNull(threat.distance ?? distanceBetween(self, threat)),
      lastSeenAt: nowMs,
      holdUntil: nowMs + ttlMs,
      lastConfirmationTick: currentTick,
      clearConfirmations: 0
    };
  }
  const remembered = [];
  for (const [id, record] of Object.entries(memory)) {
    if (isWhitelistedTargetForOptions({ userId: numberOrNull(id), name: record.name || '' }, options)) {
      delete memory[id];
      continue;
    }
    if (liveById.has(id)) continue;
    const visible = visibleById.get(id) || null;
    if (visible) {
      const lastTick = numberOrNull(record.lastConfirmationTick);
      const fresh = currentTick !== null && (lastTick === null || currentTick > lastTick);
      if (fresh) {
        record.clearConfirmations = Math.max(0, Number(record.clearConfirmations || 0)) + 1;
        record.lastConfirmationTick = currentTick;
      }
      if (record.clearConfirmations >= clearConfirmationsRequired) {
        delete memory[id];
        continue;
      }
    }
    if (nowMs > Number(record.holdUntil || 0)) {
      delete memory[id];
      continue;
    }
    const ageMs = Math.max(0, nowMs - Number(record.lastSeenAt || nowMs));
    const tickMs = Math.max(1, Number(options.tickMs || 50));
    const projectedX = numberOrNull(record.x) === null ? null : Number(record.x) + Number(record.vx || 0) * ageMs / tickMs;
    const projectedY = numberOrNull(record.y) === null ? null : Number(record.y) + Number(record.vy || 0) * ageMs / tickMs;
    const speed = Math.hypot(Number(record.vx || 0), Number(record.vy || 0));
    const uncertaintyCm = Math.round(500 + speed * ageMs / tickMs);
    const measuredDistance = projectedX === null || projectedY === null
      ? numberOrNull(record.distance)
      : distanceBetween(self, { x: projectedX, y: projectedY });
    remembered.push({
      user_id: numberOrNull(id),
      userId: numberOrNull(id),
      name: record.name || '',
      x: projectedX,
      y: projectedY,
      vx: Number(record.vx || 0),
      vy: Number(record.vy || 0),
      distance: measuredDistance === null ? null : Math.max(0, measuredDistance - uncertaintyCm),
      active: true,
      invulnerable: true,
      alive: true,
      authority: 'last-realtime-safety-memory',
      safetyMemoryOnly: true,
      safetyMemory: {
        lastSeenAt: Number(record.lastSeenAt || 0),
        ageMs,
        holdUntil: Number(record.holdUntil || 0),
        remainingMs: Math.max(0, Number(record.holdUntil || 0) - nowMs),
        uncertaintyCm,
        clearConfirmations: Number(record.clearConfirmations || 0),
        clearConfirmationsRequired
      }
    });
  }
  return [...(liveThreats || []), ...remembered];
}

function hpValue(entity) {
  const hp = Number(entity?.hp);
  return Number.isFinite(hp) ? hp : null;
}

function maxHpValue(entity) {
  const maxHp = Number(entity?.max_hp ?? entity?.maxHp);
  return Number.isFinite(maxHp) && maxHp > 0 ? maxHp : null;
}

function isRecoveringSelf(self) {
  const hp = hpValue(self);
  if (hp === null) return false;
  const maxHp = maxHpValue(self);
  if (maxHp !== null) return hp < maxHp;
  return hp < 100;
}

function isInjuredSelf(self, options = {}) {
  const hp = hpValue(self);
  const injuryHp = Math.max(1, Number(options.profitLiveInjuryHp || DEFAULT_PROFIT_LIVE_INJURY_HP));
  return hp !== null && hp <= injuryHp;
}

function snapshotFallbackThreatBlocks(threat, self, options = {}) {
  if (!threat || threat.alive === false) return false;
  if (threat.whitelisted) return false;
  if (threat.easyKillThreatExempt) return false;
  if (threat.firing) return true;
  const distance = Number(threat.distance ?? distanceBetween(self, threat));
  if (!Number.isFinite(distance)) return false;
  const threatRange = Math.max(0, Number(options.snapshotCoinFallbackThreatRangeCm
    ?? options.profitLiveThreatExitRange
    ?? DEFAULT_PROFIT_LIVE_THREAT_EXIT_RANGE));
  const injuryRange = Math.max(threatRange, Number(options.snapshotCoinFallbackInjuryThreatRangeCm
    ?? options.profitLiveInjuryExitRange
    ?? DEFAULT_PROFIT_LIVE_INJURY_EXIT_RANGE));
  if (isInjuredSelf(self, options) && distance <= injuryRange) return true;
  return distance <= threatRange;
}

function normalizeEntityForDecision(entity, self = null, authority = 'realtime', options = {}) {
  if (!entity || typeof entity !== 'object') return null;
  const x = numberOrNull(entity.x);
  const y = numberOrNull(entity.y);
  const moving = isMovingEntity(entity, options);
  const firing = isFiringEntity(entity);
  const stamina5s = staminaRemainingValue(entity, '5s');
  const stamina1h = staminaRemainingValue(entity, '1h');
  const stamina1d = staminaRemainingValue(entity, '1d');
  const stamina5sLimit = staminaLimitForWindow(entity, '5s');
  const stamina1hLimit = staminaLimitForWindow(entity, '1h');
  const stamina1dLimit = staminaLimitForWindow(entity, '1d');
  const invulnerableMs = invulnerableRemainingMs(entity, options);
  const fullStamina5s = hasFull5sStamina(entity, options);
  const dropKnown = entityDropKnown(entity);
  const normalized = {
    ...entity,
    user_id: numberOrNull(entity.user_id),
    entity_id: numberOrNull(entity.entity_id),
    name: entityDisplayName(entity),
    x,
    y,
    hp: numberOrNull(entity.hp),
    max_hp: numberOrNull(entity.max_hp),
    drop: entityDropValue(entity),
    dropKnown,
    authority,
    joinModeActive: isActiveEntity(entity),
    active: moving || firing || (isActiveEntity(entity) && (!fullStamina5s || isInvulnerableEntity(entity))),
    moving,
    speed: numberOrNull(entity.speed ?? entity.speed_per_tick ?? entity.speedPerTick) ?? entitySpeed(entity),
    firing,
    alive: isAliveEntity(entity),
    invulnerable: isInvulnerableEntity(entity),
    fullStamina5s
  };
  assignStaminaAliases(normalized, '5s', stamina5s, stamina5sLimit);
  assignStaminaAliases(normalized, '1h', stamina1h, stamina1hLimit);
  assignStaminaAliases(normalized, '1d', stamina1d, stamina1dLimit);
  if (invulnerableMs !== null && invulnerableMs > 0) normalized.invulnerableRemainingMs = invulnerableMs;
  normalized.distance = self ? distanceBetween(self, normalized) : numberOrNull(entity.distance);
  return normalized;
}

function hasOwnUsableValue(object, field) {
  if (!object || !Object.prototype.hasOwnProperty.call(object, field)) return false;
  const value = object[field];
  return value !== undefined && value !== null && value !== '';
}

const SELF_SNAPSHOT_METADATA_FIELDS = [
  'entity_id',
  'name',
  'label',
  'max_hp',
  'drop',
  'Drop',
  'death_reward_preview',
  'death_drop_coins',
  'reward',
  'coin_reward',
  'coins',
  'current_join_mode',
  'joined',
  'visible',
  'stamina_5s_remaining_milli',
  'stamina_1h_remaining_milli',
  'stamina_1d_remaining_milli',
  'stamina_5s_limit_milli',
  'stamina_1h_limit_milli',
  'stamina_1d_limit_milli',
  'stamina_5s_remaining_ms',
  'stamina_1h_remaining_ms',
  'stamina_1d_remaining_ms',
  'stamina5sRemainingMilli',
  'stamina1hRemainingMilli',
  'stamina1dRemainingMilli',
  'stamina5sRemainingMs',
  'stamina1hRemainingMs',
  'stamina1dRemainingMs',
  'stamina5s',
  'stamina1h',
  'stamina1d',
  'stamina_5s',
  'stamina_1h',
  'stamina_1d',
  'stamina_5s_limit_ms',
  'stamina_1h_limit_ms',
  'stamina_1d_limit_ms',
  'stamina5sLimitMilli',
  'stamina1hLimitMilli',
  'stamina1dLimitMilli',
  'stamina5sLimitMs',
  'stamina1hLimitMs',
  'stamina1dLimitMs',
  'stamina5sLimit',
  'stamina1hLimit',
  'stamina1dLimit',
  'stamina_5s_limit',
  'stamina_1h_limit',
  'stamina_1d_limit'
];

const SELF_SNAPSHOT_STAMINA_FIELDS = [
  'stamina_5s_remaining_milli',
  'stamina_1h_remaining_milli',
  'stamina_1d_remaining_milli',
  'stamina_5s_limit_milli',
  'stamina_1h_limit_milli',
  'stamina_1d_limit_milli',
  'stamina_5s_remaining_ms',
  'stamina_1h_remaining_ms',
  'stamina_1d_remaining_ms',
  'stamina5sRemainingMilli',
  'stamina1hRemainingMilli',
  'stamina1dRemainingMilli',
  'stamina5sRemainingMs',
  'stamina1hRemainingMs',
  'stamina1dRemainingMs',
  'stamina5s',
  'stamina1h',
  'stamina1d',
  'stamina_5s',
  'stamina_1h',
  'stamina_1d',
  'stamina_5s_limit_ms',
  'stamina_1h_limit_ms',
  'stamina_1d_limit_ms',
  'stamina5sLimitMilli',
  'stamina1hLimitMilli',
  'stamina1dLimitMilli',
  'stamina5sLimitMs',
  'stamina1hLimitMs',
  'stamina1dLimitMs',
  'stamina5sLimit',
  'stamina1hLimit',
  'stamina1dLimit',
  'stamina_5s_limit',
  'stamina_1h_limit',
  'stamina_1d_limit'
];

const TARGET_SNAPSHOT_STAMINA_FIELDS = Array.from(new Set([
  ...SELF_SNAPSHOT_STAMINA_FIELDS,
  'stamina',
  'stamina_remaining_ms',
  'staminaRemainingMs',
  'stamina_limit_ms',
  'staminaLimitMs',
  'staminaLimit',
  ...STAMINA_SPENT_FIELDS
]));

const TARGET_SNAPSHOT_INVULNERABLE_FIELDS = [
  ...INVULNERABLE_MS_FIELDS,
  ...INVULNERABLE_TICK_FIELDS,
  ...INVULNERABLE_GENERIC_REMAINING_FIELDS,
  ...INVULNERABLE_FLAG_FIELDS
];

const TARGET_SNAPSHOT_DISPLAY_FIELDS = [
  'name',
  'label',
  'username',
  'user_name',
  'displayName',
  'display_name'
];

const TARGET_SNAPSHOT_METADATA_FIELDS = Array.from(new Set([
  ...TARGET_SNAPSHOT_DISPLAY_FIELDS,
  ...TARGET_SNAPSHOT_STAMINA_FIELDS,
  ...TARGET_SNAPSHOT_INVULNERABLE_FIELDS
]));

function enrichRealtimeSelfWithSnapshotMetadata(realtimeSelf, snapshotSelf, options = {}) {
  if (!realtimeSelf || !snapshotSelf || typeof realtimeSelf !== 'object' || typeof snapshotSelf !== 'object') {
    return { self: realtimeSelf || null, merged: false, staminaMerged: false };
  }
  const realtimeUserId = numberOrNull(realtimeSelf.user_id ?? realtimeSelf.userId);
  const snapshotUserId = numberOrNull(snapshotSelf.user_id ?? snapshotSelf.userId);
  if (realtimeUserId !== null && snapshotUserId !== null && realtimeUserId !== snapshotUserId) {
    return { self: realtimeSelf, merged: false, staminaMerged: false };
  }
  const maxDistance = Math.max(0, Number(options.snapshotSelfMetadataMaxDistanceCm
    ?? options.snapshotEntityMetadataMaxDistanceCm
    ?? 5000));
  const metadataDistance = distanceBetween(realtimeSelf, snapshotSelf);
  if (maxDistance > 0 && Number.isFinite(metadataDistance) && metadataDistance > maxDistance) {
    return { self: realtimeSelf, merged: false, staminaMerged: false, metadataDistance };
  }
  const output = { ...realtimeSelf };
  let merged = false;
  let staminaMerged = false;
  for (const field of SELF_SNAPSHOT_METADATA_FIELDS) {
    if (hasOwnUsableValue(output, field) || !hasOwnUsableValue(snapshotSelf, field)) continue;
    output[field] = cloneJson(snapshotSelf[field]);
    merged = true;
    if (SELF_SNAPSHOT_STAMINA_FIELDS.includes(field)) staminaMerged = true;
  }
  if (merged) {
    output.selfMetadataAuthority = 'snapshot';
    if (Number.isFinite(metadataDistance)) output.selfMetadataDistance = Math.round(metadataDistance);
  }
  if (staminaMerged) output.staminaMetadataAuthority = 'snapshot';
  return { self: output, merged, staminaMerged, metadataDistance };
}

function snapshotEntityByUserId(fallback) {
  const entities = Array.isArray(fallback?.entities) ? fallback.entities : [];
  const byUserId = new Map();
  for (const entity of entities) {
    const userId = numberOrNull(entity?.user_id ?? entity?.userId);
    if (userId !== null && !byUserId.has(userId)) byUserId.set(userId, entity);
  }
  return byUserId;
}

function enrichRealtimeEntityWithSnapshotProfitMetadata(entity, snapshotEntity, options = {}) {
  if (!entity || !snapshotEntity) return entity;
  const maxDistance = Math.max(0, Number(options.snapshotEntityMetadataMaxDistanceCm || 5000));
  const metadataDistance = distanceBetween(entity, snapshotEntity);
  if (Number.isFinite(metadataDistance) && maxDistance > 0 && metadataDistance > maxDistance) return entity;
  const snapshotJoinMode = String(snapshotEntity.current_join_mode || snapshotEntity.mode || snapshotEntity.joined || '');
  const modePatch = snapshotJoinMode
    ? {
        profitMetadataMode: snapshotJoinMode,
        profitMetadataDistance: Number.isFinite(metadataDistance) ? Math.round(metadataDistance) : null
      }
    : {
        profitMetadataDistance: Number.isFinite(metadataDistance) ? Math.round(metadataDistance) : null
      };
  const output = {
    ...entity,
    ...modePatch
  };
  let staminaMerged = false;
  let invulnerableMerged = false;
  let displayMerged = false;
  for (const field of TARGET_SNAPSHOT_METADATA_FIELDS) {
    if (hasOwnUsableValue(output, field) || !hasOwnUsableValue(snapshotEntity, field)) continue;
    output[field] = cloneJson(snapshotEntity[field]);
    if (TARGET_SNAPSHOT_DISPLAY_FIELDS.includes(field)) displayMerged = true;
    if (TARGET_SNAPSHOT_STAMINA_FIELDS.includes(field)) staminaMerged = true;
    if (TARGET_SNAPSHOT_INVULNERABLE_FIELDS.includes(field)) invulnerableMerged = true;
  }
  if (displayMerged) output.displayMetadataAuthority = 'snapshot';
  if (staminaMerged) output.staminaMetadataAuthority = 'snapshot';
  if (invulnerableMerged) output.invulnerableMetadataAuthority = 'snapshot';
  const snapshotDropKnown = entityDropKnown(snapshotEntity);
  if (!snapshotDropKnown) {
    return output;
  }
  const reward = entityDropValue(snapshotEntity);
  const currentDropKnown = entityDropKnown(entity);
  return {
    ...output,
    death_reward_preview: snapshotEntity.death_reward_preview,
    death_drop_coins: snapshotEntity.death_drop_coins,
    coins: snapshotEntity.coins,
    reward: currentDropKnown ? entity.reward : reward,
    coin_reward: currentDropKnown ? entity.coin_reward : reward,
    drop: currentDropKnown ? entity.drop : reward,
    dropKnown: true,
    profitMetadataAuthority: 'snapshot'
  };
}

function normalizeCoinForDecision(drop, self, authority = 'snapshot') {
  if (!drop || typeof drop !== 'object') return null;
  const x = numberOrNull(drop.x);
  const y = numberOrNull(drop.y);
  if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) return null;
  const id = drop.drop_id ?? drop.id ?? `${Math.round(x)}:${Math.round(y)}:${drop.amount ?? 0}`;
  return {
    ...drop,
    drop_id: id,
    id,
    x,
    y,
    amount: Math.max(0, Number(drop.amount || 0)),
    distance: self ? distanceBetween(self, { x, y }) : Infinity,
    authority,
    key: coinTargetKeyCore({ ...drop, drop_id: id, x, y }),
    native: authority === 'realtime' || authority === 'native',
    snapshot: authority === 'snapshot',
    snapshotOnly: authority === 'snapshot'
  };
}

function messageUserId(message) {
  return numberOrNull(message?.user_id ?? message?.userId ?? message?.source_user_id ?? message?.sourceUserId);
}

function messageTargetUserId(message) {
  return numberOrNull(message?.target_user_id ?? message?.targetUserId ?? message?.target_id ?? message?.targetId);
}

function messageTick(message) {
  return numberOrNull(message?.tick ?? message?.created_tick ?? message?.createdTick);
}

function selfKillTargetTicksFromMessages(messages, userId) {
  const selfUserId = Number(userId || 0);
  const byTarget = new Map();
  if (!selfUserId) return byTarget;
  for (const message of messages || []) {
    if (!message || typeof message !== 'object') continue;
    const kind = String(message.kind || message.type || '').toLowerCase();
    if (kind && kind !== 'kill') continue;
    if (messageUserId(message) !== selfUserId) continue;
    const targetUserId = messageTargetUserId(message);
    if (!targetUserId) continue;
    const tick = messageTick(message);
    const previous = byTarget.get(targetUserId);
    if (!previous || (tick !== null && tick > previous.tick)) {
      byTarget.set(targetUserId, { tick: tick ?? 0, message });
    }
  }
  return byTarget;
}

function summarizeSelfKillEvidence(selfKillTargetTicks) {
  return Array.from(selfKillTargetTicks.entries())
    .map(([targetUserId, item]) => ({
      targetUserId: numberOrNull(targetUserId),
      tick: numberOrNull(item?.tick),
      kind: String(item?.message?.kind || item?.message?.type || 'kill'),
      at: String(item?.message?.at || item?.message?.time || item?.message?.created_at || ''),
      targetName: String(item?.message?.target_name || item?.message?.targetName || item?.message?.victim || '')
    }))
    .filter(item => item.targetUserId !== null);
}

function snapshotSelfKillEvidence(snapshot, userId) {
  return summarizeSelfKillEvidence(selfKillTargetTicksFromMessages(
    Array.isArray(snapshot?.messages) ? snapshot.messages : [],
    userId
  ));
}

function coinSourceUserId(coin) {
  return numberOrNull(coin?.source_user_id ?? coin?.sourceUserId ?? coin?.owner_user_id ?? coin?.ownerUserId);
}

function coinCreatedTick(coin) {
  return numberOrNull(coin?.created_tick ?? coin?.createdTick ?? coin?.tick);
}

function isSelfKilledPlayerDropCoin(coin, selfKillTargetTicks, options = {}) {
  const sourceUserId = coinSourceUserId(coin);
  if (!sourceUserId || !selfKillTargetTicks.has(sourceUserId)) return false;
  if (coin.system_spawned === true || coin.systemSpawned === true) return false;
  if (!(Number(coin?.amount || 0) > 0)) return false;
  const maxDistance = Math.max(0, Number(options.profitLivePlayerDropMaxDistanceCm ?? DEFAULT_PROFIT_LIVE_PLAYER_DROP_MAX_DISTANCE));
  if (maxDistance > 0 && Number(coin?.distance) > maxDistance) return false;
  const maxAgeTicks = Math.max(0, Number(options.profitLivePlayerDropMaxAgeTicks ?? DEFAULT_PROFIT_LIVE_PLAYER_DROP_MAX_AGE_TICKS));
  const kill = selfKillTargetTicks.get(sourceUserId);
  const killTick = Number(kill?.tick || 0);
  const createdTick = Number(coinCreatedTick(coin) || 0);
  if (maxAgeTicks > 0 && killTick > 0 && createdTick > 0 && Math.abs(createdTick - killTick) > maxAgeTicks) return false;
  return true;
}

function realtimeObservationIdentity(fallback) {
  const tick = fallback?.tick;
  if (tick !== null && tick !== undefined && tick !== '') return `tick:${tick}`;
  return `at:${Number(fallback?.receivedAtMs || 0)}`;
}

function refreshRealtimeSnapshotObservation(state, self, stateful = {}, options = {}, nowMs = Date.now()) {
  const fallback = state?.fallback || state?.snapshot || {};
  const identity = realtimeObservationIdentity(fallback);
  const previous = stateful.realtimeSnapshotObservation || null;
  if (previous?.identity === identity) return previous;
  const selfUserId = Number(self?.user_id ?? state?.userId ?? options.userId ?? 0);
  const visibleRange = Math.max(0, Number(options.globalCoinMaxDistance ?? DEFAULT_GLOBAL_COIN_MAX_DISTANCE));
  const highValueAmount = Math.max(1, highValueCoinPriorityAmount(options));
  const highValueRange = highValueCoinPriorityRange(options);
  const selfKillTargetTicks = selfKillTargetTicksFromMessages(
    Array.isArray(fallback.messages) ? fallback.messages : [],
    selfUserId
  );
  const nearbyCoins = [];
  const coins = [];
  for (const drop of Array.isArray(fallback.coinDrops) ? fallback.coinDrops : []) {
    if (!drop || typeof drop !== 'object') continue;
    const x = numberOrNull(drop.x);
    const y = numberOrNull(drop.y);
    if (x === null || y === null) continue;
    const amount = Math.max(0, Number(drop.amount || 0));
    if (!(amount > 0)) continue;
    const id = drop.drop_id ?? drop.id ?? `${Math.round(x)}:${Math.round(y)}:${amount}`;
    const distance = self ? Math.hypot(Number(self.x) - x, Number(self.y) - y) : Infinity;
    const coin = {
      drop_id: id,
      id,
      key: coinTargetKeyCore({ id, x, y, amount }),
      x,
      y,
      amount,
      distance,
      source_user_id: coinSourceUserId(drop),
      created_tick: coinCreatedTick(drop),
      system_spawned: drop.system_spawned === true || drop.systemSpawned === true,
      authority: 'snapshot',
      snapshotOnly: true
    };
    coin.selfKilledPlayerDrop = isSelfKilledPlayerDropCoin(coin, selfKillTargetTicks, options);
    if (!visibleRange || distance <= visibleRange) nearbyCoins.push(coin);
    if (amount >= highValueAmount && distance <= highValueRange) coins.push(coin);
  }
  nearbyCoins.sort((a, b) => Number(a.distance) - Number(b.distance) || Number(b.amount) - Number(a.amount));
  const nearbyCoinLimit = Math.max(8, Math.round(Number(options.realtimeNearbyCoinLimit) || 48));
  const priorityNearbyCoins = nearbyCoins.filter(coin => coin.selfKilledPlayerDrop
    || (Number(coin.amount || 0) >= highValueAmount && Number(coin.distance) <= highValueRange));
  const priorityNearbyCoinKeys = new Set(priorityNearbyCoins.map(coin => coin.key));
  const boundedNearbyCoins = [
    ...priorityNearbyCoins.slice(0, nearbyCoinLimit),
    ...nearbyCoins.filter(coin => !priorityNearbyCoinKeys.has(coin.key)).slice(0, Math.max(0, nearbyCoinLimit - priorityNearbyCoins.length))
  ].sort((a, b) => Number(a.distance) - Number(b.distance) || Number(b.amount) - Number(a.amount));
  const coinKeys = boundedNearbyCoins.map(coin => coin.key);
  const coinRows = boundedNearbyCoins.map(coin => [
    valueKey(coin.id),
    numberOrNull(coin.amount),
    Math.round(Number(coin.distance)),
    0,
    0,
    'snapshot',
    0,
    Math.round(Number(coin.x)),
    Math.round(Number(coin.y))
  ]);
  const realtimeByUserId = new Map();
  for (const entity of Array.isArray(state?.realtime?.entities) ? state.realtime.entities : []) {
    const userId = numberOrNull(entity?.user_id ?? entity?.userId);
    if (userId !== null) realtimeByUserId.set(String(userId), entity);
  }
  const snapshotByUserId = new Map();
  for (const entity of Array.isArray(fallback.entities) ? fallback.entities : []) {
    const userId = numberOrNull(entity?.user_id ?? entity?.userId);
    if (userId !== null) snapshotByUserId.set(String(userId), entity);
  }
  const playerIds = new Set([...snapshotByUserId.keys(), ...realtimeByUserId.keys()]);
  const nearbyPlayers = [];
  for (const userId of playerIds) {
    if (Number(userId) === selfUserId) continue;
    const realtimeEntity = realtimeByUserId.get(userId) || null;
    const snapshotEntity = snapshotByUserId.get(userId) || null;
    const activitySource = realtimeEntity || snapshotEntity;
    const metadataSource = snapshotEntity || realtimeEntity;
    const x = numberOrNull(realtimeEntity?.x) ?? numberOrNull(snapshotEntity?.x);
    const y = numberOrNull(realtimeEntity?.y) ?? numberOrNull(snapshotEntity?.y);
    if (x === null || y === null || !self) continue;
    const distance = Math.hypot(Number(self.x) - x, Number(self.y) - y);
    if (!Number.isFinite(distance) || (visibleRange && distance > visibleRange)) continue;
    const moving = isMovingEntity(activitySource, options);
    const firing = isFiringEntity(activitySource);
    const stamina5s = staminaRemainingValue(realtimeEntity, '5s') ?? staminaRemainingValue(metadataSource, '5s');
    const stamina5sLimit = staminaLimitForWindow(realtimeEntity, '5s')
      ?? staminaLimitForWindow(metadataSource, '5s')
      ?? 10000;
    const fullRatio = Math.max(0, Number(options.staminaFullRatio ?? options.fullRatio ?? 0.98) || 0.98);
    const fullStamina5s = Boolean(stamina5s !== null && stamina5sLimit > 0 && stamina5s >= stamina5sLimit * fullRatio);
    const invulnerable = isInvulnerableEntity(realtimeEntity) || isInvulnerableEntity(metadataSource);
    const active = moving || firing || (isActiveEntity(activitySource) && (!fullStamina5s || invulnerable));
    const alive = isAliveEntity(activitySource);
    const dropSource = entityDropKnown(realtimeEntity) ? realtimeEntity : metadataSource;
    const dropKnown = entityDropKnown(dropSource);
    const drop = dropKnown ? numberOrNull(entityDropValue(dropSource)) : null;
    const realtimeInvulnerableMs = realtimeEntity ? invulnerableRemainingMs(realtimeEntity, options) : null;
    const invulnerableMs = realtimeInvulnerableMs !== null
      ? realtimeInvulnerableMs
      : invulnerableRemainingMs(metadataSource, options);
    const activityAgeRaw = realtimeEntity?.recentActivityAgeMs ?? metadataSource?.recentActivityAgeMs;
    const activityAgeMs = activityAgeRaw === null || activityAgeRaw === undefined || activityAgeRaw === ''
      ? null
      : numberOrNull(activityAgeRaw);
    const inactiveMs = Math.max(0, Number(options.afkDisplayInactiveMs ?? DEFAULT_AFK_DISPLAY_INACTIVE_MS));
    const afkStaminaCooldownRemainingMs = Number(
      realtimeEntity?.afkStaminaCooldownRemainingMs ?? metadataSource?.afkStaminaCooldownRemainingMs ?? 0
    );
    nearbyPlayers.push({
      key: String(userId),
      name: entityDisplayName(realtimeEntity) || entityDisplayName(metadataSource) || '未知玩家',
      hp: numberOrNull(realtimeEntity?.hp) ?? numberOrNull(metadataSource?.hp),
      stamina5s,
      drop,
      dropKnown,
      invulnerableMs,
      distance,
      x,
      y,
      vx: numberOrNull(realtimeEntity?.vx) ?? numberOrNull(snapshotEntity?.vx),
      vy: numberOrNull(realtimeEntity?.vy) ?? numberOrNull(snapshotEntity?.vy),
      mode: String(
        realtimeEntity?.current_join_mode || realtimeEntity?.mode || realtimeEntity?.joined
        || metadataSource?.current_join_mode || metadataSource?.mode || metadataSource?.joined || ''
      ) || null,
      fullStamina5s,
      afk: Boolean(fullStamina5s && !active && !moving && !firing && alive),
      afkGreen: !(afkStaminaCooldownRemainingMs > 0) && (activityAgeMs === null || activityAgeMs >= inactiveMs)
    });
  }
  nearbyPlayers.sort((a, b) => Number(a.distance) - Number(b.distance));
  const nearbyPlayerLimit = Math.max(8, Math.round(Number(options.realtimeNearbyPlayerLimit) || 48));
  const priorityNearbyPlayers = nearbyPlayers.filter(player => !player.afk || Number(player.invulnerableMs || 0) > 0);
  const priorityNearbyPlayerKeys = new Set(priorityNearbyPlayers.map(player => player.key));
  const boundedNearbyPlayers = [
    ...priorityNearbyPlayers.slice(0, nearbyPlayerLimit),
    ...nearbyPlayers.filter(player => !priorityNearbyPlayerKeys.has(player.key)).slice(0, Math.max(0, nearbyPlayerLimit - priorityNearbyPlayers.length))
  ].sort((a, b) => Number(a.distance) - Number(b.distance));
  const playerKeys = boundedNearbyPlayers.map(player => player.key);
  const playerRows = boundedNearbyPlayers.map(player => {
    const foldAsLowValueAfk = Boolean(player.afk && player.dropKnown && player.drop !== null
      && player.drop < Math.max(0, Number(options.attackMinAfkDrop ?? DEFAULT_ATTACK_MIN_AFK_DROP)));
    return [
      player.name,
      player.hp,
      player.stamina5s,
      player.drop,
      player.invulnerableMs,
      Math.round(Number(player.distance)),
      0,
      player.mode,
      player.fullStamina5s ? 1 : 0,
      String(player.key),
      player.afk ? 1 : 0,
      player.afk && player.afkGreen ? 1 : 0,
      foldAsLowValueAfk ? 1 : 0,
      Math.round(Number(player.x)),
      Math.round(Number(player.y)),
      player.vx,
      player.vy
    ];
  });
  const observedAtMs = Number(fallback.receivedAtMs || 0)
    || Math.max(0, nowMs - Math.max(0, Number(fallback.frameAgeMs || 0)));
  rememberRealtimeSnapshotCoinPickups({
    identity,
    observedAtMs,
    self,
    coins: priorityNearbyCoins
  }, stateful, options);
  const observation = {
    identity,
    tick: numberOrNull(fallback.tick),
    observedAtMs,
    coins,
    nearby: {
      ar: Math.round(Number(options.attackRange ?? DEFAULT_ATTACK_RANGE)),
      vr: Math.round(visibleRange),
      c: coinRows,
      p: playerRows,
      observedAt: observedAtMs ? new Date(observedAtMs).toISOString() : '',
      tick: numberOrNull(fallback.tick)
    },
    selfKillEvidence: summarizeSelfKillEvidence(selfKillTargetTicks)
  };
  Object.defineProperty(observation, '_nearbyKeys', {
    value: { coinKeys, playerKeys },
    writable: true,
    configurable: true
  });
  stateful.realtimeSnapshotObservation = observation;
  return observation;
}

function realtimeObservationAgeMs(observation, input) {
  const observedAtMs = Number(observation?.observedAtMs || 0);
  if (observedAtMs > 0) return Math.max(0, Number(input?.nowMs || Date.now()) - observedAtMs);
  return Math.max(0, Number(input?.frameAges?.snapshotMs || 0));
}

function realtimeObservationCoins(observation, self) {
  return (observation?.coins || []).map(coin => ({
    ...coin,
    distance: self ? distanceBetween(self, coin) : Infinity
  }));
}

function selectRealtimeLootCandidate(input, stateful = {}, options = {}) {
  const observation = input?.realtimeSnapshotObservation || null;
  const maxAgeMs = Math.max(250, Number(options.realtimeLootMaxAgeMs ?? DEFAULT_REALTIME_LOOT_MAX_AGE_MS));
  const ageMs = realtimeObservationAgeMs(observation, input);
  const minAmount = Math.max(1, highValueCoinPriorityAmount(options));
  const configuredMaxDistance = Math.max(0, Number(
    options.realtimeLootMaxDistanceCm
      ?? options.postAttackDropCoinMaxDistance
      ?? DEFAULT_PROFIT_LIVE_PLAYER_DROP_MAX_DISTANCE
  ));
  const highValueRange = highValueCoinPriorityRange(options);
  const maxDistance = configuredMaxDistance > 0
    ? Math.min(configuredMaxDistance, highValueRange)
    : highValueRange;
  const candidates = ageMs <= maxAgeMs
    ? realtimeObservationCoins(observation, input?.self)
      .filter(coin => Number(coin.amount || 0) >= minAmount)
      .filter(coin => Number.isFinite(Number(coin.distance)) && (!maxDistance || Number(coin.distance) <= maxDistance))
      .filter(coin => opportunityStaminaAffordable(input?.self, opportunityCoinStaminaCost(coin, options), options))
      .sort((a, b) => Number(Boolean(b.selfKilledPlayerDrop)) - Number(Boolean(a.selfKilledPlayerDrop))
        || Number(b.amount || 0) - Number(a.amount || 0)
        || Number(a.distance || Infinity) - Number(b.distance || Infinity))
    : [];
  const selected = candidates[0] || null;
  if (!selected) {
    stateful.realtimeLootIntent = null;
    return {
      selected: null,
      ageMs: Math.round(ageMs),
      maxAgeMs,
      minAmount,
      maxDistance,
      candidateCount: candidates.length,
      reason: ageMs > maxAgeMs ? 'snapshot-stale' : 'no-high-value-coin'
    };
  }
  const same = stateful.realtimeLootIntent?.key === selected.key;
  stateful.realtimeLootIntent = {
    key: selected.key,
    id: selected.id,
    amount: selected.amount,
    x: selected.x,
    y: selected.y,
    sourceUserId: selected.source_user_id,
    selfKilledPlayerDrop: Boolean(selected.selfKilledPlayerDrop),
    startedAt: same ? Number(stateful.realtimeLootIntent.startedAt || input.nowMs) : input.nowMs,
    lastSeenAt: input.nowMs,
    snapshotTick: observation?.tick ?? null
  };
  return {
    selected,
    ageMs: Math.round(ageMs),
    maxAgeMs,
    minAmount,
    maxDistance,
    candidateCount: candidates.length,
    reason: selected.selfKilledPlayerDrop ? 'confirmed-self-kill-drop' : 'high-value-visible-coin'
  };
}

function safeLootDodgeDirection(combat, self, coin) {
  const threatField = Array.isArray(combat?.dryRun?.movement?.dodge?.threatField)
    ? combat.dryRun.movement.dodge.threatField
    : [];
  if (!threatField.length || !self || !coin) return null;
  const coinDx = Number(coin.x) - Number(self.x);
  const coinDy = Number(coin.y) - Number(self.y);
  const coinDistance = Math.hypot(coinDx, coinDy);
  if (!(coinDistance > 0)) return null;
  return threatField
    .filter(item => Number(item?.directHits || 0) === 0
      && Number(item?.avoidableHits || 0) === 0
      && Number(item?.unavoidableHits || 0) === 0)
    .map(item => {
      const dx = Number(item?.dx || 0);
      const dy = Number(item?.dy || 0);
      const magnitude = Math.hypot(dx, dy);
      const progress = magnitude > 0 ? (dx * coinDx + dy * coinDy) / (magnitude * coinDistance) : -1;
      return { item, progress };
    })
    .filter(item => item.progress > 0)
    .sort((a, b) => b.progress - a.progress
      || Number(b.item?.minCPA ?? -Infinity) - Number(a.item?.minCPA ?? -Infinity))[0]?.item || null;
}

function realtimeNearbyObservationSummary(input, combat, lootAssessment, options = {}) {
  if (!input?.self) return null;
  const observation = input.realtimeSnapshotObservation || null;
  if (!observation?.nearby) return null;
  const selectedCoinKey = lootAssessment?.selected?.key || '';
  const combatTargetKey = targetKey(combat?.target || combat?.dryRun?.target);
  let selection = observation._nearbySelection || null;
  if (selection?.selectedCoinKey !== selectedCoinKey || selection?.combatTargetKey !== combatTargetKey) {
    const coinKeys = observation._nearbyKeys?.coinKeys || [];
    const playerKeys = observation._nearbyKeys?.playerKeys || [];
    selection = {
      selectedCoinKey,
      combatTargetKey,
      nearby: {
        ...observation.nearby,
        c: observation.nearby.c.map((row, index) => {
          const selected = Boolean(selectedCoinKey && coinKeys[index] === selectedCoinKey);
          return selected ? [...row.slice(0, 3), 1, ...row.slice(4)] : row;
        }),
        p: observation.nearby.p.map((row, index) => {
          const selected = Boolean(combatTargetKey && playerKeys[index] === combatTargetKey);
          if (!selected) return row;
          const selectedRow = [...row];
          selectedRow[6] = 1;
          selectedRow[12] = 0;
          return selectedRow;
        })
      }
    };
    Object.defineProperty(observation, '_nearbySelection', {
      value: selection,
      writable: true,
      configurable: true
    });
  }
  return {
    ...selection.nearby,
    ageMs: Math.round(realtimeObservationAgeMs(observation, input))
  };
}

function summarizeTarget(target) {
  if (!target) return null;
  return {
    type: 'enemy',
    userId: numberOrNull(target.user_id ?? target.userId),
    entityId: numberOrNull(target.entity_id ?? target.entityId),
    name: entityDisplayName(target),
    authority: target.authority || '',
    x: numberOrNull(target.x),
    y: numberOrNull(target.y),
    vx: numberOrNull(target.vx),
    vy: numberOrNull(target.vy),
    hp: numberOrNull(target.hp),
    maxHp: numberOrNull(target.max_hp ?? target.maxHp),
    drop: entityDropValue(target),
    dropKnown: entityDropKnown(target),
    stamina5s: staminaRemainingValue(target, '5s'),
    stamina5sLimit: staminaLimitForWindow(target, '5s'),
    stamina1h: staminaRemainingValue(target, '1h'),
    stamina1d: staminaRemainingValue(target, '1d'),
    staminaMetadataAuthority: target.staminaMetadataAuthority || '',
    distance: Number.isFinite(Number(target.distance)) ? Math.round(Number(target.distance)) : null,
    active: target.active === undefined ? isCurrentlyActiveEntity(target) : Boolean(target.active),
    moving: Boolean(target.moving),
    firing: Boolean(target.firing),
    invulnerable: Boolean(target.invulnerable || isInvulnerableEntity(target)),
    invulnerableRemainingMs: invulnerableRemainingMs(target),
    invulnerableMetadataAuthority: target.invulnerableMetadataAuthority || '',
    recentlyActive: Boolean(target.recentlyActive),
    recentlyMoved: Boolean(target.recentlyMoved),
    whitelisted: Boolean(target.whitelisted),
    alive: target.alive !== false,
    easyKillKnown: Boolean(target.easyKillKnown),
    easyKillScore: numberOrNull(target.easyKillScore),
    easyKillSeekRangeCm: numberOrNull(target.easyKillSeekRangeCm),
    easyKillDamagedToday: Boolean(target.easyKillDamagedToday),
    easyKillThreatExempt: Boolean(target.easyKillThreatExempt),
    easyKillProfitTarget: Boolean(target.easyKillProfitTarget),
    safetyMemoryOnly: Boolean(target.safetyMemoryOnly),
    safetyMemory: target.safetyMemory ? cloneJson(target.safetyMemory) : null,
    profitMetadataAuthority: target.profitMetadataAuthority || '',
    profitMetadataMode: target.profitMetadataMode || '',
    profitMetadataActive: Boolean(target.profitMetadataActive),
    afkAttackContinuation: target.afkAttackContinuation ? cloneJson(target.afkAttackContinuation) : null,
    ...(target.centerActivityEdge ? { centerActivityEdge: cloneJson(target.centerActivityEdge) } : {})
  };
}

function summarizeCoin(coin) {
  if (!coin) return null;
  const routeMeta = coinRouteActionMetaCore(coin.coinRoute || null, coin.distance);
  const sourceUserId = numberOrNull(coin.source_user_id ?? coin.sourceUserId);
  return {
    type: 'coin',
    id: coin.drop_id ?? coin.id ?? '',
    authority: coin.authority || '',
    x: numberOrNull(coin.x),
    y: numberOrNull(coin.y),
    amount: numberOrNull(coin.amount),
    distance: Number.isFinite(Number(coin.distance)) ? Math.round(Number(coin.distance)) : null,
    key: coin.key || coinTargetKeyCore(coin),
    fieldMembers: numberOrNull(coin.snapshotMembers ?? coin.fieldMembers),
    fieldAmount: numberOrNull(coin.snapshotAmount ?? coin.fieldAmount),
    coinRoute: routeMeta,
    native: Boolean(coin.native),
    snapshotOnly: Boolean(coin.snapshotOnly),
    sourceUserId,
    selfKilledPlayerDrop: Boolean(coin.selfKilledPlayerDrop),
    playerDropPriority: Boolean(coin.playerDropPriority),
    ...(coin.centerActivityEdge ? { centerActivityEdge: cloneJson(coin.centerActivityEdge) } : {})
  };
}

function summarizeOpportunity(item) {
  if (!item) return null;
  return {
    type: item.type || '',
    id: item.id ?? '',
    actionKind: item.actionKind || '',
    reason: item.reason || '',
    priorityTier: Number(item.priorityTier || 0),
    score: Number.isFinite(Number(item.score)) ? Math.round(Number(item.score)) : null,
    staminaCost: Number.isFinite(Number(item.staminaCost)) ? Math.round(Number(item.staminaCost)) : null,
    distance: Number.isFinite(Number(item.distance)) ? Math.round(Number(item.distance)) : null,
    amount: numberOrNull(item.amount),
    reward: numberOrNull(item.reward),
    expectedReward: numberOrNull(item.expectedReward),
    effectiveProfitReward: item.effectiveProfitReward ? cloneJson(item.effectiveProfitReward) : null,
    eligibleByExpectedROI: item.eligibleByExpectedROI === undefined ? null : Boolean(item.eligibleByExpectedROI),
    explorationAdmitted: Boolean(item.explorationAdmitted),
    profitThresholdEligible: item.profitThresholdEligible === undefined ? null : Boolean(item.profitThresholdEligible),
    profitThresholdReason: item.profitThresholdReason || '',
    target: item.sourceTarget ? summarizeTarget(item.sourceTarget) : null,
    coin: item.sourceCoin ? summarizeCoin(item.sourceCoin) : null,
    held: Boolean(item.held)
  };
}

function roundedDiagnosticNumber(value, digits = 3) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const scale = 10 ** Math.max(0, Math.round(Number(digits) || 0));
  return Math.round(number * scale) / scale;
}

function easyKillOpportunityScoringOptions(target, stateful = {}, options = {}) {
  const targetId = easyKillTargetUserId(target);
  const combatTargetId = easyKillTargetUserId(stateful.combatTarget);
  return {
    ...options,
    recentCombatMetrics: stateful.combatMetrics,
    combatTargetState: targetId !== null
      && combatTargetId !== null
      && String(targetId) === String(combatTargetId)
      ? stateful.combatTarget
      : null,
    opponentBehaviorState: targetId === null
      ? null
      : (stateful.opponentBehaviorStates?.[String(targetId)] || null),
    isAfkProfitTarget: () => false
  };
}

function easyKillCandidateBaseRejectionReason(target, stateful = {}, input = {}, options = {}) {
  if (target?.alive === false) return 'not-alive';
  if (target?.whitelisted) return 'whitelisted';
  if (target?.invulnerable) return 'invulnerable';
  if (!target?.active) return 'not-active';
  if (options.controlMode !== 'profit-live' || options.combatEnabled !== true) return 'profit-live-disabled';
  const visibleDistance = opportunityVisibleDistance(options);
  if (!Number.isFinite(Number(target?.distance))) return 'distance-unknown';
  if (visibleDistance > 0 && Number(target.distance) > visibleDistance) return 'out-of-range';
  if (target.easyKillKnown === true
    && Number.isFinite(Number(target.easyKillSeekRangeCm))
    && Number(target.distance) > Number(target.easyKillSeekRangeCm)) return 'out-of-score-range';
  if (easyKillTargetSuppressed(stateful, target, input.nowMs)) return 'easy-kill-suppressed';
  if (target.easyKillProfitTarget !== true) return 'not-profit-eligible';
  if (targetDangerousCooldownRecord(stateful, target, input.nowMs)) return 'dangerous-target-cooldown';
  const opportunityThreats = input.avoidanceThreats || input.activeThreats || [];
  if (!targetSafeFromOpportunityThreats(target, opportunityThreats, options)) return 'threat-blocked';
  return '';
}

function summarizeEasyKillCandidateDiagnostics(input, opportunity, stateful = {}, options = {}, finalAction = null) {
  const visibleTargets = (input?.visibleTargets || []).filter(target => target?.easyKillKnown === true);
  const rawById = new Map((opportunity?.rawOpportunities || [])
    .filter(item => String(item?.type || '') === 'enemy')
    .map(item => [opportunityChoiceTargetId(item), item])
    .filter(([id]) => id));
  const rankById = new Map();
  for (const [index, item] of (opportunity?.sorted || []).entries()) {
    const id = opportunityChoiceTargetId(item);
    if (id && !rankById.has(id)) rankById.set(id, index + 1);
  }
  const profitSelectedId = opportunityChoiceTargetId(opportunity?.choice);
  const finalSelectedId = easyKillTargetUserId(finalAction?.target);
  const rows = visibleTargets.map(target => {
    const idValue = easyKillTargetUserId(target);
    const id = idValue === null ? '' : String(idValue);
    const raw = id ? rawById.get(id) || null : null;
    const rank = id ? rankById.get(id) || null : null;
    return {
      target,
      id,
      raw,
      rank,
      profitSelected: Boolean(id && id === profitSelectedId),
      finalSelected: Boolean(id && finalSelectedId !== null && id === String(finalSelectedId))
    };
  }).sort((a, b) => Number(b.finalSelected) - Number(a.finalSelected)
    || Number(b.profitSelected) - Number(a.profitSelected)
    || (a.rank ?? Infinity) - (b.rank ?? Infinity)
    || Number(b.raw?.score ?? entityDropValue(b.target)) - Number(a.raw?.score ?? entityDropValue(a.target))
    || Number(a.target?.distance ?? Infinity) - Number(b.target?.distance ?? Infinity));
  const limited = rows.slice(0, EASY_KILL_CANDIDATE_DIAGNOSTIC_LIMIT).map(row => {
    const scoringOptions = easyKillOpportunityScoringOptions(row.target, stateful, options);
    const effective = row.raw?.effectiveProfitReward || effectiveProfitReward(row.target, scoringOptions);
    const completion = effective.completion || activeTargetCompletionEstimate(row.target, scoringOptions);
    const staminaCost = Number.isFinite(Number(row.raw?.staminaCost))
      ? Number(row.raw.staminaCost)
      : enemyStaminaCost(row.target, {
          ...options,
          recentCombatMetrics: stateful.combatMetrics
        });
    const score = Number.isFinite(Number(row.raw?.score))
      ? Number(row.raw.score)
      : scoreEnemyOpportunity(row.target, scoringOptions);
    const expectedReward = effective.expectedReward;
    const thresholdEligible = row.raw?.profitThresholdEligible === undefined
      ? profitRewardAndCostEligible(expectedReward, staminaCost, opportunity?.threshold)
      : Boolean(row.raw.profitThresholdEligible);
    let rejectedReason = easyKillCandidateBaseRejectionReason(row.target, stateful, input, options);
    const staminaAffordable = opportunityStaminaAffordable(input.self, staminaCost, options);
    if (!rejectedReason && !staminaAffordable) {
      rejectedReason = 'stamina-unaffordable';
    }
    if (!rejectedReason && !thresholdEligible) rejectedReason = 'below-profit-threshold';
    const eligible = Boolean(!rejectedReason && row.rank !== null);
    if (!rejectedReason && !row.profitSelected) {
      rejectedReason = row.rank === 1
        ? (opportunity?.switchDiagnostics?.bestRejectedReason || 'current-opportunity-held')
        : (row.rank ? 'lower-score' : 'candidate-unavailable');
    }
    if (!rejectedReason && row.profitSelected && !row.finalSelected) {
      rejectedReason = `preempted-by-${String(finalAction?.band || finalAction?.kind || 'higher-priority-action')}`;
    }
    return {
      userId: numberOrNull(row.id),
      name: entityDisplayName(row.target),
      rank: row.rank,
      selected: row.profitSelected,
      finalSelected: row.finalSelected,
      eligible,
      rejectedReason,
      active: Boolean(row.target?.active),
      firing: Boolean(row.target?.firing),
      hp: numberOrNull(row.target?.hp),
      drop: entityDropValue(row.target),
      distance: Number.isFinite(Number(row.target?.distance)) ? Math.round(Number(row.target.distance)) : null,
      expectedReward: roundedDiagnosticNumber(expectedReward),
      collectionProbability: roundedDiagnosticNumber(effective.collectionProbability, 6),
      netROI: roundedDiagnosticNumber(effective.netROI, 6),
      rewardModelSource: String(effective.modelSource || ''),
      completionProbability: roundedDiagnosticNumber(completion?.probability, 6),
      staminaCost: Number.isFinite(Number(staminaCost)) ? Math.round(Number(staminaCost)) : null,
      score: Number.isFinite(Number(score)) ? Math.round(Number(score)) : null,
      profitThresholdEligible: thresholdEligible,
      eligibleByExpectedROI: row.raw?.eligibleByExpectedROI === undefined
        ? thresholdEligible
        : Boolean(row.raw.eligibleByExpectedROI),
      explorationAdmitted: Boolean(row.raw?.explorationAdmitted),
      topCandidateLogged: row.rank !== null && row.rank <= 5
    };
  });
  return {
    candidateLimit: EASY_KILL_CANDIDATE_DIAGNOSTIC_LIMIT,
    candidateCount: visibleTargets.length,
    candidateOmittedCount: Math.max(0, visibleTargets.length - limited.length),
    candidates: limited
  };
}

function buildProfitThresholdContext(input, options = {}) {
  return buildDynamicProfitThresholdCore({
    nowMs: input?.nowMs,
    remaining1dMilli: staminaRemaining(input?.self, '1d')
  }, {
    enabled: options.dynamicProfitThresholdEnabled !== false,
    coinsPer10Stamina: options.profitThresholdCoinsPer10Stamina,
    hourlyStaminaLimit: options.profitThresholdHourlyStaminaLimit,
    reserveMs: options.profitThresholdResetReserveMs
  });
}

function profitRewardAndCostEligible(reward, staminaCost, thresholdContext) {
  return !thresholdContext?.active
    || profitTargetEligibleCore(reward, staminaCost, thresholdContext.threshold);
}

function profitCoinEligible(coin, thresholdContext, options = {}, rewardOverride = null) {
  const reward = rewardOverride === null ? Number(coin?.amount) : Number(rewardOverride);
  return profitRewardAndCostEligible(reward, opportunityCoinStaminaCost(coin, options), thresholdContext);
}

function profitOpportunityThresholdReward(item) {
  if (String(item?.type || '') === 'enemy') {
    return Number(item?.effectiveProfitReward?.expectedReward ?? item?.expectedReward ?? item?.reward);
  }
  const sourceCoin = item?.sourceCoin || item || {};
  if (sourceCoin.fieldMigration || String(item?.reason || '') === 'migrate-to-known-field') {
    return Number(item?.amount ?? sourceCoin.amount);
  }
  return Number(item?.routeValue ?? sourceCoin.routeValue ?? sourceCoin.coinRoute?.value
    ?? item?.fieldAmount ?? sourceCoin.fieldAmount ?? item?.amount ?? sourceCoin.amount);
}

function buildProfitSelectionInput(input, thresholdContext, options = {}, stateful = {}) {
  if (!thresholdContext?.active) return input;
  return {
    ...input,
    profitCoins: (input.profitCoins || []).filter(coin => profitCoinEligible(coin, thresholdContext, options)),
    realtimeCoins: (input.realtimeCoins || []).filter(coin => profitCoinEligible(coin, thresholdContext, options)),
    snapshotCoins: (input.snapshotCoins || []).filter(coin => profitCoinEligible(coin, thresholdContext, options)),
    snapshotVisibleCoins: (input.snapshotVisibleCoins || []).filter(coin => profitCoinEligible(coin, thresholdContext, options)),
    selfKilledPlayerDropCoins: (input.selfKilledPlayerDropCoins || []).filter(coin => profitCoinEligible(coin, thresholdContext, options)),
    afkTargets: (input.afkTargets || []).filter(target => profitRewardAndCostEligible(
      entityDropValue(target),
      opportunityEnemyStaminaCost(target, options),
      thresholdContext
    )),
    easyKillTargets: (input.easyKillTargets || []).filter(target => {
      const effective = effectiveProfitReward(target, easyKillOpportunityScoringOptions(target, stateful, options));
      return profitRewardAndCostEligible(effective.expectedReward, effective.staminaCost, thresholdContext);
    })
  };
}

function valueKey(value) {
  if (value === null || value === undefined || value === '') return '';
  return String(value);
}

function targetCoinSelected(action, coin) {
  const target = action?.target || null;
  if (!target || !coin) return false;
  const targetIds = new Set([
    valueKey(target.id),
    valueKey(target.coinId),
    valueKey(target.drop_id),
    valueKey(target.key)
  ].filter(Boolean));
  return [
    coin.id,
    coin.drop_id,
    coin.key
  ].some(item => targetIds.has(valueKey(item)));
}

function coinPanelKeys(coin) {
  return [
    coin?.key,
    coin?.drop_id,
    coin?.id,
    coinTargetKeyCore(coin)
  ].map(valueKey).filter(Boolean);
}

function coinPanelCanonicalKey(coin) {
  const direct = valueKey(coin?.drop_id ?? coin?.id);
  if (direct) return direct;
  const key = valueKey(coin?.key || coinTargetKeyCore(coin));
  return key.replace(/^id:/, '');
}

function coinRouteOrderForAction(action, coin) {
  if (!action?.coinRoute || !coin) return 0;
  const keys = new Set(coinPanelKeys(coin));
  if (!keys.size) return 0;
  const points = Array.isArray(action.coinRoute.points) ? action.coinRoute.points : [];
  const pointIndex = points.findIndex(point => keys.has(valueKey(point?.id)));
  if (pointIndex >= 0) return pointIndex + 1;
  const ids = Array.isArray(action.coinRoute.ids) ? action.coinRoute.ids : [];
  const idIndex = ids.findIndex(id => keys.has(valueKey(id)));
  return idIndex >= 0 ? idIndex + 1 : 0;
}

function targetPlayerSelected(action, combat, target) {
  const selected = [action?.target, combat?.target].filter(Boolean);
  if (!selected.length || !target) return false;
  const targetUserId = valueKey(target.user_id ?? target.userId);
  const targetEntityId = valueKey(target.entity_id ?? target.entityId);
  return selected.some(item => {
    const userId = valueKey(item.userId ?? item.user_id);
    const entityId = valueKey(item.entityId ?? item.entity_id);
    return Boolean((targetUserId && userId === targetUserId) || (targetEntityId && entityId === targetEntityId));
  });
}

function uniqueNearbyCoins(input) {
  const byKey = new Map();
  const add = coin => {
    const key = valueKey(coin?.key || coin?.drop_id || coin?.id);
    if (!key || byKey.has(key)) return;
    byKey.set(key, coin);
  };
  for (const coin of input?.realtimeCoins || []) add(coin);
  for (const coin of input?.snapshotVisibleCoins || []) add(coin);
  return Array.from(byKey.values());
}

function uniquePanelProfitCoins(input) {
  const byKey = new Map();
  for (const coin of input?.panelProfitCoins || input?.profitCoins || []) {
    const key = profitCoinKey(coin);
    if (!key) continue;
    const previous = byKey.get(key);
    if (!previous || profitCoinPriorityRank(coin) > profitCoinPriorityRank(previous)) byKey.set(key, coin);
  }
  return Array.from(byKey.values());
}

function routeDisplayCoinsForAction(input, action) {
  const points = Array.isArray(action?.coinRoute?.points) ? action.coinRoute.points : [];
  if (points.length <= 1) return [];
  const byKey = new Map();
  for (const coin of input?.profitCoins || []) {
    for (const key of coinPanelKeys(coin)) byKey.set(key, coin);
  }
  return points.map(point => {
    const key = valueKey(point?.id);
    const source = key ? byKey.get(key) : null;
    const coin = source || {
      drop_id: key,
      id: key,
      x: point?.x,
      y: point?.y,
      amount: point?.amount,
      authority: action?.target?.authority || 'route'
    };
    return {
      ...coin,
      key: key || profitCoinKey(coin),
      distance: Number.isFinite(Number(coin.distance))
        ? Number(coin.distance)
        : distanceBetween(input.self, coin),
      routeDisplayOrder: Number(point?.order || 0) || 0,
      routeDisplayOnly: !source
    };
  }).filter(coin => Number.isFinite(Number(coin.distance)));
}

function coinPanelCandidates(input, action, bait = null) {
  const byKey = new Map();
  const routeOrderByKey = new Map();
  for (const point of Array.isArray(action?.coinRoute?.points) ? action.coinRoute.points : []) {
    const key = valueKey(point?.id);
    const order = Number(point?.order || 0) || 0;
    if (key && order > 0) routeOrderByKey.set(key, order);
  }
  const add = coin => {
    const key = coinPanelCanonicalKey(coin) || profitCoinKey(coin);
    if (!key) return;
    const routeDisplayOrder = Number(coin.routeDisplayOrder || routeOrderByKey.get(key) || coinRouteOrderForAction(action, coin) || 0) || 0;
    const enriched = routeDisplayOrder ? { ...coin, routeDisplayOrder } : coin;
    const previous = byKey.get(key);
    if (!previous || (routeDisplayOrder > 0 && !Number(previous.routeDisplayOrder || 0))) byKey.set(key, enriched);
  };
  for (const coin of uniquePanelProfitCoins(input)) add(coin);
  for (const coin of routeDisplayCoinsForAction(input, action)) add(coin);
  if (bait) add(bait);
  return Array.from(byKey.values());
}

function profitCoinKey(coin) {
  if (!coin) return '';
  return String(coin.key || coinTargetKeyCore(coin) || coin.drop_id || coin.id || '');
}

function profitCoinPriorityRank(coin) {
  return coin?.selfKilledPlayerDrop || coin?.playerDropPriority ? 1 : 0;
}

function mergeProfitCoinCandidates(...groups) {
  const byKey = new Map();
  for (const coins of groups || []) {
    for (const coin of coins || []) {
      const key = profitCoinKey(coin);
      if (!key) continue;
      const previous = byKey.get(key);
      if (!previous || profitCoinPriorityRank(coin) > profitCoinPriorityRank(previous)) {
        byKey.set(key, coin);
      }
    }
  }
  return Array.from(byKey.values());
}

function observePostAttackCoinBaseline(input, stateful = {}, options = {}) {
  if (!input || !stateful || typeof stateful !== 'object') return null;
  const nowMs = Number(input.nowMs || 0);
  const identity = [
    input.fallback?.tick ?? '',
    input.fallback?.coinDropCount ?? '',
    input.rawRealtime?.coinDropsObserved === true ? (input.realtime?.tick ?? '') : '',
    input.realtimeObservedCoins?.length ?? 0,
    input.snapshotObservedCoins?.length ?? 0
  ].join(':');
  if (stateful.postAttackCoinBaseline?.identity === identity
    && options.forcePostAttackCoinDecoration !== true) {
    return stateful.postAttackCoinBaseline;
  }
  const observations = stateful.postAttackCoinObservations
    && typeof stateful.postAttackCoinObservations === 'object'
    ? stateful.postAttackCoinObservations
    : {};
  const coins = mergeProfitCoinCandidates(
    input.realtimeObservedCoins || [],
    input.snapshotObservedCoins || []
  );
  const keys = [];
  for (const coin of coins) {
    const key = profitCoinKey(coin);
    if (!key) continue;
    keys.push(key);
    const previous = observations[key];
    const firstSeenAt = Number(previous?.firstSeenAt || nowMs);
    observations[key] = {
      firstSeenAt,
      lastSeenAt: nowMs,
      amount: numberOrNull(coin.amount),
      sourceUserId: coinSourceUserId(coin),
      createdTick: coinCreatedTick(coin)
    };
    coin.postAttackFirstSeenAt = firstSeenAt;
  }
  const retentionMs = Math.max(
    60000,
    Number(options.postAttackDropCoinPriorityMs ?? BROWSER_RUNTIME_DEFAULTS.postAttackDropCoinPriorityMs) + 10000
  );
  const retained = Object.entries(observations)
    .filter(([, item]) => nowMs - Number(item?.lastSeenAt || 0) <= retentionMs)
    .sort((left, right) => Number(right[1]?.lastSeenAt || 0) - Number(left[1]?.lastSeenAt || 0))
    .slice(0, 1024);
  stateful.postAttackCoinObservations = Object.fromEntries(retained);
  stateful.postAttackCoinBaseline = {
    identity,
    observedAt: nowMs,
    keys: keys.slice(0, 1024)
  };
  return stateful.postAttackCoinBaseline;
}

function activeCoinCompetitionOptions(options = {}) {
  return {
    minSelfDistanceCm: options.activeCoinCompetitionMinSelfDistanceCm
      ?? options.coinMaxDistance
      ?? DEFAULT_ACTIVE_COIN_COMPETITION_MIN_SELF_DISTANCE_CM,
    nearCoinDistanceCm: options.activeCoinCompetitionNearCoinDistanceCm
      ?? DEFAULT_ACTIVE_COIN_COMPETITION_NEAR_COIN_DISTANCE_CM,
    minLeadDistanceCm: options.activeCoinCompetitionMinLeadDistanceCm
      ?? DEFAULT_ACTIVE_COIN_COMPETITION_MIN_LEAD_DISTANCE_CM,
    uncertainLeadDistanceCm: options.activeCoinCompetitionUncertainLeadDistanceCm
      ?? DEFAULT_ACTIVE_COIN_COMPETITION_UNCERTAIN_LEAD_DISTANCE_CM,
    headingCosMin: options.activeCoinCompetitionHeadingCosMin
      ?? DEFAULT_ACTIVE_COIN_COMPETITION_HEADING_COS_MIN,
    movingSpeedMin: options.activeCoinCompetitionMovingSpeedMin
      ?? DEFAULT_ACTIVE_COIN_COMPETITION_MOVING_SPEED_MIN
  };
}

function coinCompetitionStateMap(stateful = {}) {
  if (!stateful || typeof stateful !== 'object') return {};
  if (!stateful.coinCompetitionState || typeof stateful.coinCompetitionState !== 'object' || Array.isArray(stateful.coinCompetitionState)) {
    stateful.coinCompetitionState = {};
  }
  if (!Array.isArray(stateful.coinCompetitionReleases)) stateful.coinCompetitionReleases = [];
  return stateful.coinCompetitionState;
}

function coinCompetitionRelease(stateful, key, record, reason, nowMs, releases) {
  if (stateful?.coinCompetitionState) delete stateful.coinCompetitionState[key];
  const release = {
    coinKey: record?.coinKey || '',
    competitorId: record?.competitorId || '',
    releaseReason: reason,
    at: nowMs,
    heldMs: Math.max(0, nowMs - Number(record?.contestedSinceAt || nowMs))
  };
  releases.push(release);
  if (stateful && typeof stateful === 'object') {
    stateful.coinCompetitionReleases = [
      ...(Array.isArray(stateful.coinCompetitionReleases) ? stateful.coinCompetitionReleases : []),
      release
    ].slice(-20);
  }
}

function partitionActiveCoinCompetition(self, coins = [], visibleTargets = [], options = {}, stateful = {}) {
  const activeCompetitors = (visibleTargets || []).filter(target => target?.active === true && target.alive !== false);
  if (options.activeCoinCompetitionEnabled === false || !self) {
    return { available: coins || [], panel: coins || [], activeCompetitorCount: activeCompetitors.length, contested: [], released: [] };
  }
  const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  const currentTick = numberOrNull(options.currentTick ?? options.realtimeTick);
  const holdTtlMs = Math.max(1000, Number(options.activeCoinCompetitionHoldTtlMs ?? 4000));
  const clearConfirmations = Math.max(2, Math.round(Number(options.activeCoinCompetitionClearConfirmations ?? 3)));
  const clearConfirmMs = Math.max(1000, Number(options.activeCoinCompetitionClearConfirmMs ?? 2000));
  const state = coinCompetitionStateMap(stateful);
  const releases = [];
  const liveCoinKeys = new Set((coins || []).map(coin => coinDecisionKey(coin)).filter(Boolean));
  const visibleById = new Map((visibleTargets || []).map(target => [String(target?.user_id ?? target?.userId ?? target?.entity_id ?? target?.entityId ?? target?.id ?? ''), target]));
  for (const [key, record] of Object.entries(state)) {
    if (!liveCoinKeys.has(String(record?.coinKey || ''))) {
      coinCompetitionRelease(stateful, key, record, 'coin-disappeared', nowMs, releases);
    }
  }
  const available = [];
  const panel = [];
  const contested = [];
  const competitionOptions = activeCoinCompetitionOptions(options);
  for (const coin of coins || []) {
    const coinKey = coinDecisionKey(coin);
    const competition = activeCoinCompetitionCore(self, coin, activeCompetitors, competitionOptions);
    if (competition) {
      const pairKey = `${coinKey}|${competition.competitorId}`;
      for (const [existingKey, existingRecord] of Object.entries(state)) {
        if (existingKey === pairKey || String(existingRecord?.coinKey || '') !== coinKey) continue;
        coinCompetitionRelease(stateful, existingKey, existingRecord, 'competitor-replaced-by-stronger', nowMs, releases);
      }
      const previous = state[pairKey] || null;
      const record = {
        ...competition,
        coinKey,
        competitorId: String(competition.competitorId || ''),
        contestedSinceAt: Number(previous?.contestedSinceAt || nowMs),
        lastStrongEvidenceAt: nowMs,
        lastSeenAt: nowMs,
        clearSinceAt: 0,
        confirmationCount: 0,
        lastConfirmationTick: currentTick,
        expiresAt: nowMs + holdTtlMs,
        releaseReason: ''
      };
      state[pairKey] = record;
      const summary = {
        ...competition,
        coinKey,
        authority: String(coin?.authority || ''),
        snapshotOnly: Boolean(coin?.snapshotOnly),
        contestHeld: false,
        confirmationCount: 0,
        clearSinceAt: 0,
        lastConfirmationTick: currentTick,
        expiresAt: record.expiresAt,
        releaseReason: ''
      };
      contested.push(summary);
      panel.push({ ...coin, activeCoinCompetition: summary });
      continue;
    }
    let held = null;
    for (const [pairKey, record] of Object.entries(state)) {
      if (String(record?.coinKey || '') !== coinKey) continue;
      const competitor = visibleById.get(String(record.competitorId || '')) || null;
      if (competitor?.alive === false) {
        coinCompetitionRelease(stateful, pairKey, record, 'competitor-dead-or-left', nowMs, releases);
        continue;
      }
      const selfDistance = distanceBetween(self, coin);
      const competitorDistance = competitor ? distanceBetween(competitor, coin) : Infinity;
      if (competitor && Number.isFinite(selfDistance) && Number.isFinite(competitorDistance)
        && selfDistance + Number(competitionOptions.minLeadDistanceCm || 0) <= competitorDistance) {
        coinCompetitionRelease(stateful, pairKey, record, 'self-overtook-competitor', nowMs, releases);
        continue;
      }
      if (!competitor) {
        if (nowMs > Number(record.expiresAt || 0)) {
          coinCompetitionRelease(stateful, pairKey, record, 'competitor-missing-ttl-expired', nowMs, releases);
          continue;
        }
        held = {
          ...record,
          contestHeld: true,
          releaseReason: '',
          authority: String(coin?.authority || ''),
          snapshotOnly: Boolean(coin?.snapshotOnly)
        };
        break;
      }
      const lastConfirmationTick = numberOrNull(record.lastConfirmationTick);
      const freshConfirmation = currentTick !== null
        && (lastConfirmationTick === null || currentTick > lastConfirmationTick);
      const clearSinceAt = freshConfirmation
        ? Number(record.clearSinceAt || nowMs)
        : Number(record.clearSinceAt || 0);
      const confirmationCount = Math.max(0, Number(record.confirmationCount || 0)) + (freshConfirmation ? 1 : 0);
      const updated = {
        ...record,
        lastSeenAt: nowMs,
        clearSinceAt,
        confirmationCount,
        lastConfirmationTick: freshConfirmation ? currentTick : lastConfirmationTick,
        expiresAt: nowMs + holdTtlMs
      };
      state[pairKey] = updated;
      if (freshConfirmation
        && (confirmationCount >= clearConfirmations || (clearSinceAt > 0 && nowMs - clearSinceAt >= clearConfirmMs))) {
        coinCompetitionRelease(stateful, pairKey, updated, 'competitor-confirmed-clear', nowMs, releases);
        continue;
      }
      held = {
        ...updated,
        contestHeld: true,
        releaseReason: '',
        authority: String(coin?.authority || ''),
        snapshotOnly: Boolean(coin?.snapshotOnly)
      };
      break;
    }
    if (held) {
      contested.push(held);
      panel.push({ ...coin, activeCoinCompetition: held });
    } else {
      available.push(coin);
      panel.push(coin);
    }
  }
  return { available, panel, activeCompetitorCount: activeCompetitors.length, contested, released: releases };
}

function invulnerableRemainingMs(target, options = {}) {
  const remainingMs = positiveFieldValue(target, INVULNERABLE_MS_FIELDS);
  if (remainingMs !== null) return Math.round(remainingMs);
  const tickMs = Math.max(1, Number(options.tickMs ?? BROWSER_RUNTIME_DEFAULTS.tickMs ?? 120) || 120);
  const remainingTicks = positiveFieldValue(target, INVULNERABLE_TICK_FIELDS);
  const genericRemaining = positiveFieldValue(target, INVULNERABLE_GENERIC_REMAINING_FIELDS);
  const resolvedTicks = remainingTicks !== null ? remainingTicks : genericRemaining;
  if (resolvedTicks !== null) return Math.round(resolvedTicks * tickMs);
  return isInvulnerableEntity(target) ? -1 : null;
}

function invulnerableProfitTargetReadyOnApproach(target, options = {}) {
  if (!target?.invulnerable) return true;
  const remainingMs = invulnerableRemainingMs(target, options);
  if (!(remainingMs > 0)) return false;
  const distance = Number(target.distance ?? Infinity);
  if (!Number.isFinite(distance)) return false;
  const approachDistance = Math.max(0, Number(
    options.invulnerableProfitApproachDistanceCm
      ?? options.afkAttackCommitRangeCm
      ?? options.afkAttackCommitRange
      ?? options.browserlessAfkAttackCommitRangeCm
      ?? DEFAULT_INVULNERABLE_PROFIT_APPROACH_DISTANCE_CM
  ));
  const moveSpeed = Math.max(1, Number(
    options.invulnerableProfitMoveSpeedCmPerSec
      ?? DEFAULT_INVULNERABLE_PROFIT_MOVE_SPEED_CM_PER_SEC
  ));
  const travelMs = Math.max(0, distance - approachDistance) * 1000 / moveSpeed;
  return travelMs > 0 && remainingMs <= travelMs;
}

function afkDisplayGreen(target, options = {}) {
  const inactiveMs = Math.max(0, Number(options.afkDisplayInactiveMs ?? DEFAULT_AFK_DISPLAY_INACTIVE_MS));
  const rawActivityAgeMs = target?.recentActivityAgeMs;
  const activityAgeMs = rawActivityAgeMs === null || rawActivityAgeMs === undefined || rawActivityAgeMs === ''
    ? null
    : numberOrNull(rawActivityAgeMs);
  if (Number(target?.afkStaminaCooldownRemainingMs || 0) > 0) return false;
  return activityAgeMs === null || activityAgeMs >= inactiveMs;
}

function panelPlayerTargetKey(target) {
  const id = target?.user_id ?? target?.userId ?? target?.entity_id ?? target?.entityId ?? target?.id;
  return id === undefined || id === null || id === '' ? '' : String(id);
}

function panelPlayerCandidates(input) {
  return Array.isArray(input?.visibleTargets) ? input.visibleTargets : [];
}

function summarizeNearbyForPanel(input, action, combat, options = {}, singleCoinBait = null) {
  if (!input?.self) return null;
  const attackRange = Math.max(0, Number(options.attackRange ?? options.combatAttackRange ?? DEFAULT_ATTACK_RANGE));
  const visibleRange = Math.max(0, Number(
    input.fallback?.snapshotVisibleCoinMaxDistanceCm
      ?? options.globalCoinMaxDistance
      ?? options.opportunityVisibleDistance
      ?? DEFAULT_GLOBAL_COIN_MAX_DISTANCE
  ));
  const coins = coinPanelCandidates(input, action, singleCoinBait)
    .filter(coin => Number.isFinite(Number(coin?.distance)))
    .filter(coin => visibleRange <= 0 || Number(coin.distance) <= visibleRange)
    .sort((a, b) => Number(a.distance) - Number(b.distance)
      || Number(b.amount || 0) - Number(a.amount || 0))
    .map(coin => [
      valueKey(coin.drop_id ?? coin.id),
      numberOrNull(coin.amount),
      Math.round(Number(coin.distance)),
      targetCoinSelected(action, coin) ? 1 : 0,
      coinRouteOrderForAction(action, coin) || numberOrNull(coin.routeDisplayOrder) || 0,
      String(coin.authority || '') || null,
      singleCoinBaitMatchesCore(coin, singleCoinBait, {
        sameCoinRadiusCm: options.singleCoinBaitSameCoinRadiusCm ?? BROWSER_RUNTIME_DEFAULTS.singleCoinBaitSameCoinRadiusCm
      }) ? 1 : 0,
      Math.round(Number(coin.x)),
      Math.round(Number(coin.y))
    ]);
  const threatTargetIds = new Set((input.activeThreats || [])
    .concat(input.firingThreats || [], input.avoidanceThreats || [], input.snapshotActiveThreats || [])
    .map(panelPlayerTargetKey)
    .filter(Boolean));
  const decisionTargetIds = new Set([
    ...(input.activeThreats || []),
    ...(input.firingThreats || []),
    ...(input.avoidanceThreats || []),
    ...(input.snapshotActiveThreats || []),
    ...(input.afkTargets || []),
    ...(input.easyKillTargets || []),
    ...(Array.isArray(combat?.candidates) ? combat.candidates : []),
    combat?.target
  ].filter(Boolean).map(panelPlayerTargetKey).filter(Boolean));
  const lowDropThreshold = Math.max(0, Number(options.attackMinAfkDrop ?? DEFAULT_ATTACK_MIN_AFK_DROP));
  const players = panelPlayerCandidates(input)
    .filter(target => Number.isFinite(Number(target?.distance)))
    .filter(target => visibleRange <= 0 || Number(target.distance) <= visibleRange)
    .sort((a, b) => Number(a.distance) - Number(b.distance))
    .map(target => {
      const displayName = entityDisplayName(target);
      const dropKnown = entityDropKnown(target);
      const drop = dropKnown ? numberOrNull(entityDropValue(target)) : null;
      const fullStamina5s = hasFull5sStamina(target, options);
      const targetKey = panelPlayerTargetKey(target);
      const selected = targetPlayerSelected(action, combat, target);
      const afk = Boolean(
        fullStamina5s
          && target.alive !== false
          && !target.active
          && !target.moving
          && !target.firing
          && !threatTargetIds.has(targetKey)
      );
      const foldAsLowValueAfk = Boolean(
        !displayName
          || (
            afk
              && dropKnown
              && drop !== null
              && drop < lowDropThreshold
              && !selected
              && !decisionTargetIds.has(targetKey)
          )
      );
      return [
        displayName || '未知玩家',
        numberOrNull(target.hp),
        staminaRemainingValue(target, '5s'),
        drop,
        invulnerableRemainingMs(target, options),
        Math.round(Number(target.distance)),
        selected ? 1 : 0,
        String(target.current_join_mode || target.mode || target.joined || target.profitMetadataMode || '') || null,
        fullStamina5s ? 1 : 0,
        targetKey,
        afk ? 1 : 0,
        afk && afkDisplayGreen(target, options) ? 1 : 0,
        foldAsLowValueAfk ? 1 : 0,
        Math.round(Number(target.x)),
        Math.round(Number(target.y)),
        numberOrNull(target.vx),
        numberOrNull(target.vy)
      ];
    });
  return {
    ar: Math.round(attackRange),
    vr: Math.round(visibleRange),
    c: coins,
    p: players
  };
}

function topItems(items, mapper, limit = 5) {
  return (items || []).slice(0, limit).map(mapper).filter(Boolean);
}

const SNAPSHOT_COIN_PICKUP_MEMORY_MS = 30000;
const SNAPSHOT_COIN_PICKUP_PATH_LIMIT = 48;
const REALTIME_SNAPSHOT_COIN_PICKUP_MEMORY_MS = 60000;
const REALTIME_SNAPSHOT_COIN_PICKUP_LIMIT = 80;

function coinPickupSelfPoint(self, nowMs) {
  const x = numberOrNull(self?.x);
  const y = numberOrNull(self?.y);
  if (x === null || y === null) return null;
  return { x, y, at: nowMs };
}

function appendSnapshotCoinPickupPath(observation, self, nowMs) {
  const point = coinPickupSelfPoint(self, nowMs);
  if (!observation || !point) return observation;
  const path = Array.isArray(observation.path) ? observation.path.slice(-SNAPSHOT_COIN_PICKUP_PATH_LIMIT + 1) : [];
  const previous = path.at(-1) || observation.self || null;
  if (!previous || Math.hypot(Number(previous.x) - point.x, Number(previous.y) - point.y) >= 50) {
    path.push(point);
  } else if (path.length) {
    path[path.length - 1] = point;
  } else {
    path.push(point);
  }
  observation.path = path.slice(-SNAPSHOT_COIN_PICKUP_PATH_LIMIT);
  return observation;
}

function coinPickupEvidence(matches, nowMs, reason) {
  const seen = new Set();
  return (matches || []).map(pickup => {
    const coin = pickup?.coin || null;
    const key = String(coin?.key || '');
    const amount = Math.max(0, Math.round(Number(coin?.amount || 0) || 0));
    if (!key || !amount || seen.has(key)) return null;
    seen.add(key);
    return { key, amount, at: nowMs, reason };
  }).filter(Boolean);
}

function rememberRealtimeSnapshotCoinPickups(observation, stateful = {}, options = {}) {
  if (!observation?.self || !observation?.identity) return [];
  const nowMs = Number(observation.observedAtMs || Date.now());
  const currentSnapshot = buildNativeCoinSnapshotCore(observation.coins || [], { nowMs }).slice(-160);
  const previous = stateful.realtimeSnapshotCoinPickupObservation || null;
  if (previous?.identity === observation.identity) return [];
  const confirmDistance = options.coinCollectedConfirmDistance
    ?? BROWSER_RUNTIME_DEFAULTS.coinCollectedConfirmDistance;
  const pickups = previous
    ? pickIncidentalCoinPickupsCore(previous.coins, currentSnapshot, observation.self, previous.self, {
        nowMs,
        incidentalCoinPickupMemoryMs: SNAPSHOT_COIN_PICKUP_MEMORY_MS,
        coinCollectedConfirmDistance: confirmDistance
      })
    : [];
  stateful.realtimeSnapshotCoinPickupObservation = {
    identity: observation.identity,
    at: nowMs,
    self: coinPickupSelfPoint(observation.self, nowMs),
    coins: currentSnapshot
  };
  const evidence = coinPickupEvidence(
    pickups,
    nowMs,
    'realtime-snapshot-coin-disappeared-near-path'
  );
  const retained = (Array.isArray(stateful.realtimeSnapshotCoinPickups)
    ? stateful.realtimeSnapshotCoinPickups
    : [])
    .filter(item => nowMs - Number(item?.at || 0) <= REALTIME_SNAPSHOT_COIN_PICKUP_MEMORY_MS);
  for (const item of evidence) {
    if (retained.some(existing => existing.key === item.key && Number(existing.at) === Number(item.at))) continue;
    retained.push(item);
  }
  stateful.realtimeSnapshotCoinPickups = retained.slice(-REALTIME_SNAPSHOT_COIN_PICKUP_LIMIT);
  return evidence;
}

function recentRealtimeSnapshotCoinPickups(stateful = {}, nowMs = Date.now()) {
  const retained = (Array.isArray(stateful.realtimeSnapshotCoinPickups)
    ? stateful.realtimeSnapshotCoinPickups
    : [])
    .filter(item => Number(nowMs) - Number(item?.at || 0) <= REALTIME_SNAPSHOT_COIN_PICKUP_MEMORY_MS);
  stateful.realtimeSnapshotCoinPickups = retained.slice(-REALTIME_SNAPSHOT_COIN_PICKUP_LIMIT);
  return stateful.realtimeSnapshotCoinPickups;
}

function observeBrowserlessCoinPickups(input, stateful = {}, options = {}) {
  const nowMs = Number(input?.nowMs || Date.now());
  if (!input?.self) {
    stateful.coinPickupObservation = null;
    stateful.snapshotCoinPickupObservation = null;
    stateful.coinPickupRealtimeAuthorityAt = 0;
    return [];
  }
  const confirmDistance = options.coinCollectedConfirmDistance
    ?? BROWSER_RUNTIME_DEFAULTS.coinCollectedConfirmDistance;
  const realtimeObserved = input?.rawRealtime?.coinDropsObserved === true;
  if (realtimeObserved) {
    stateful.coinPickupRealtimeAuthorityAt = nowMs;
    const currentSnapshot = buildNativeCoinSnapshotCore(input?.realtimeObservedCoins || [], { nowMs });
    const previous = stateful.coinPickupObservation || null;
    const pickups = previous
      ? pickIncidentalCoinPickupsCore(previous.coins, currentSnapshot, input.self, previous.self, {
          nowMs,
          incidentalCoinPickupMemoryMs: options.incidentalCoinPickupMemoryMs,
          coinCollectedConfirmDistance: confirmDistance
        })
      : [];
    stateful.coinPickupObservation = {
      at: nowMs,
      self: coinPickupSelfPoint(input.self, nowMs),
      coins: currentSnapshot.slice(-160)
    };
    stateful.snapshotCoinPickupObservation = null;
    return coinPickupEvidence(pickups, nowMs, 'realtime-coin-disappeared-near-path');
  }

  const snapshotMemoryMs = Math.max(5000, Number(
    options.snapshotCoinPickupMemoryMs || SNAPSHOT_COIN_PICKUP_MEMORY_MS
  ) || SNAPSHOT_COIN_PICKUP_MEMORY_MS);
  const realtimeAuthorityAt = Number(stateful.coinPickupRealtimeAuthorityAt || 0);
  if (realtimeAuthorityAt > 0 && nowMs - realtimeAuthorityAt <= snapshotMemoryMs) return [];
  if (input?.fallback?.coinDropsObserved !== true || input?.fallback?.tick === null || input?.fallback?.tick === undefined) {
    return [];
  }
  const identity = `tick:${String(input.fallback.tick)}`;
  const currentSnapshot = buildNativeCoinSnapshotCore(input?.snapshotObservedCoins || [], { nowMs });
  const previous = stateful.snapshotCoinPickupObservation || null;
  if (previous?.identity === identity) {
    appendSnapshotCoinPickupPath(previous, input.self, nowMs);
    return [];
  }
  const pickups = previous
    ? pickIncidentalCoinPickupsCore(previous.coins, currentSnapshot, input.self, previous.self, {
        nowMs,
        incidentalCoinPickupMemoryMs: snapshotMemoryMs,
        coinCollectedConfirmDistance: confirmDistance,
        pathPoints: previous.path
      })
    : [];
  const selfPoint = coinPickupSelfPoint(input.self, nowMs);
  stateful.snapshotCoinPickupObservation = {
    identity,
    at: nowMs,
    self: selfPoint,
    path: selfPoint ? [selfPoint] : [],
    coins: currentSnapshot.slice(-160)
  };
  return coinPickupEvidence(pickups, nowMs, 'snapshot-coin-disappeared-near-path');
}

function buildBrowserlessStrategyInput(state, options = {}, stateful = {}) {
  const realtime = state?.realtime || {};
  const fallback = state?.fallback || state?.snapshot || {};
  const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  const centerActivityAfkContinuation = deriveCenterActivityAfkContinuationCore(
    stateful.finalActionArbitration,
    { nowMs, decisionIntervalMs: options.decisionIntervalMs }
  );
  const dataGaps = [];
  const snapshotFrameAgeMs = numberOrNull(fallback.frameAgeMs);
  const snapshotMaxAgeMs = Math.max(1000, Number(options.snapshotCoinFallbackMaxAgeMs || 5000));
  const snapshotFreshForMetadata = snapshotFrameAgeMs === null || snapshotFrameAgeMs <= snapshotMaxAgeMs;
  const snapshotEntitiesByUserId = snapshotFreshForMetadata ? snapshotEntityByUserId(fallback) : new Map();
  const rawSelfUserId = numberOrNull(realtime.self?.user_id ?? realtime.self?.userId ?? state?.userId ?? options.userId);
  const snapshotSelf = rawSelfUserId !== null ? snapshotEntitiesByUserId.get(rawSelfUserId) : null;
  const enrichedSelf = enrichRealtimeSelfWithSnapshotMetadata(realtime.self, snapshotSelf, options);
  const self = normalizeEntityForDecision(enrichedSelf.self, null, 'realtime', options);
  if (enrichedSelf.staminaMerged) dataGaps.push('self-stamina-from-snapshot');
  if (!self) dataGaps.push('missing-realtime-self');
  const selfUserId = Number(self?.user_id ?? state?.userId ?? options.userId ?? 0);
  const realtimeEntities = (Array.isArray(realtime.entities) ? realtime.entities : [])
    .map(entity => enrichRealtimeEntityWithSnapshotProfitMetadata(
      entity,
      snapshotEntitiesByUserId.get(numberOrNull(entity?.user_id ?? entity?.userId)),
      options
    ))
    .map(entity => normalizeEntityForDecision(entity, self, 'realtime', options))
    .filter(Boolean);
  annotateBrowserlessRecentActivity(realtimeEntities, stateful, nowMs, options);
  const decisionEntities = realtimeEntities.map(entity => refreshDecisionEntityActivity(entity, options));
  const visibleTargets = decisionEntities
    .filter(entity => Number(entity.user_id) !== selfUserId)
    .filter(entity => Number.isFinite(Number(entity.x)) && Number.isFinite(Number(entity.y)));
  reconcileEconomicStopLossCooldowns({
    nowMs,
    visibleTargets,
    bullets: Array.isArray(realtime.bullets) ? realtime.bullets : []
  }, stateful, options);
  const easyKillInput = { visibleTargets, nowMs, easyKillTargets: [], easyKill: null };
  refreshEasyKillTargetAnnotations(easyKillInput, stateful, options);
  updateBrowserlessOpportunityAfkStaminaObservations(visibleTargets, stateful, nowMs, options);
  const activeThreats = visibleTargets.filter(entity => entity.active && entity.alive !== false && !entity.whitelisted && !entity.easyKillThreatExempt);
  const firingThreats = visibleTargets.filter(entity => entity.firing && entity.alive !== false && !entity.whitelisted && !entity.easyKillThreatExempt);
  const avoidanceThreats = mergeRecentInvulnerableThreats(
    visibleTargets,
    visibleTargets.filter(isBrowserlessAvoidanceThreat),
    self,
    stateful,
    { ...options, nowMs, currentTick: realtime.tick }
  );
  const snapshotActiveThreats = [];
  const snapshotFallbackThreats = [
    ...avoidanceThreats,
    ...firingThreats.filter(threat => !avoidanceThreats.includes(threat))
  ].filter(threat => snapshotFallbackThreatBlocks(threat, self, options));
  const afkObservationTargetsRaw = visibleTargets.filter(entity => {
    if (entity.whitelisted || entity.active || entity.moving || entity.firing || entity.alive === false) return false;
    if (economicProfitPursuitSuppressionRecordById(stateful, targetIdentity(entity), nowMs)) return false;
    if (entity.invulnerable && (
      opportunityAfkTargetId(entity) === String(centerActivityAfkContinuation?.targetId || '')
      || !invulnerableProfitTargetReadyOnApproach(entity, options)
    )) return false;
    return attackWorthTakingCore(self, entity, {
      attackMinDrop: options.attackMinDrop ?? DEFAULT_ATTACK_MIN_DROP,
      attackMinAfkDrop: options.attackMinAfkDrop ?? DEFAULT_ATTACK_MIN_AFK_DROP,
      attackMinRewardRatio: options.attackMinRewardRatio ?? DEFAULT_ATTACK_MIN_REWARD_RATIO,
      isWhitelistedTarget: target => isWhitelistedTargetForOptions(target, options),
      isAfkProfitTarget: () => true,
      dropValue: entityDropValue
    });
  });
  const afkCenterPartition = partitionCenterActivityAfkTargets(afkObservationTargetsRaw, self, {
    ...options,
    centerActivityAfkContinuation
  });
  const afkObservationTargets = afkCenterPartition.targets;
  const afkAttackCommitment = recentAfkAttackCommitment(stateful, nowMs, options);
  const afkPanelTargets = afkObservationTargets.filter(entity => hasFull5sStamina(entity, options));
  const afkTargets = afkObservationTargets.filter(entity => (
    markAfkAttackContinuation(entity, afkAttackCommitment, options)
    || (hasFull5sStamina(entity, options) && !afkTargetBlockedByRecentActivity(entity, options))
  ));
  const edgeAfkTargets = afkTargets.filter(entity => entity.centerActivityEdge?.admitted === true);
  const continuedEdgeAfkTargets = edgeAfkTargets.filter(entity => entity.centerActivityEdge?.continued === true);
  const selfKillTargetTicks = selfKillTargetTicksFromMessages(Array.isArray(fallback.messages) ? fallback.messages : [], selfUserId);
  const selfKillTargetIds = Array.from(selfKillTargetTicks.keys());
  const selfKillEvidence = summarizeSelfKillEvidence(selfKillTargetTicks);
  const realtimeCoinsRaw = buildNativeCoinSnapshotCore(Array.isArray(realtime.coinDrops) ? realtime.coinDrops : [], { nowMs })
    .map(drop => normalizeCoinForDecision(drop, self, 'realtime'))
    .filter(Boolean)
    .filter(coin => Number(coin.amount || 0) > 0);
  const realtimeCoinPartition = partitionCenterActivityCoins(realtimeCoinsRaw, selfKillTargetTicks, options);
  const realtimeCoins = realtimeCoinPartition.admitted;
  const snapshotCoinsRaw = (Array.isArray(fallback.coinDrops) ? fallback.coinDrops : [])
    .map(drop => normalizeCoinForDecision(drop, self, 'snapshot'))
    .filter(Boolean)
    .filter(coin => Number(coin.amount || 0) > 0);
  const snapshotCoinPartition = partitionCenterActivityCoins(snapshotCoinsRaw, selfKillTargetTicks, options);
  const snapshotCoins = snapshotCoinPartition.admitted;
  const centerFiltered = {
    afkTargets: afkCenterPartition.filteredTargets.length,
    edgeAdmittedAfkTargets: edgeAfkTargets.length,
    edgeContinuedAfkTargets: continuedEdgeAfkTargets.length,
    edgeAfkTargets: edgeAfkTargets.map(target => summarizeCenterActivityAfkTarget(
      target,
      browserlessCenterActivityRadius(options),
      browserlessCenterActivityRadius(options) + centerActivityAfkEdgeExtension(options),
      target.centerActivityEdge?.reason || 'center-afk-edge-admitted'
    )),
    continuedEdgeAfkTargets: continuedEdgeAfkTargets.map(target => summarizeCenterActivityAfkTarget(
      target,
      browserlessCenterActivityRadius(options),
      browserlessCenterActivityRadius(options) + centerActivityAfkEdgeExtension(options),
      target.centerActivityEdge?.reason || 'center-afk-edge-continuation'
    )),
    filteredAfkTargetDetails: afkCenterPartition.filteredDetails,
    realtimeCoins: realtimeCoinPartition.filtered.length,
    snapshotCoins: snapshotCoinPartition.filtered.length,
    edgeAdmittedRealtimeCoins: realtimeCoinPartition.edgeAdmitted.map(summarizeCoin),
    edgeAdmittedSnapshotCoins: snapshotCoinPartition.edgeAdmitted.map(summarizeCoin)
  };
  const snapshotVisibleCoinMaxDistanceRaw = Number(options.snapshotVisibleCoinMaxDistanceCm
    ?? options.snapshotCoinFallbackMaxDistanceCm
    ?? options.globalCoinMaxDistance
    ?? DEFAULT_SNAPSHOT_VISIBLE_COIN_MAX_DISTANCE);
  const snapshotVisibleCoinMaxDistance = Number.isFinite(snapshotVisibleCoinMaxDistanceRaw)
    ? Math.max(0, snapshotVisibleCoinMaxDistanceRaw)
    : DEFAULT_SNAPSHOT_VISIBLE_COIN_MAX_DISTANCE;
  const snapshotVisibleCoins = snapshotCoins.filter(coin => (
    snapshotVisibleCoinMaxDistance > 0
      && Number.isFinite(Number(coin.distance))
      && Number(coin.distance) <= snapshotVisibleCoinMaxDistance
  ));
  const selfKilledPlayerDropFallbackEnabled = options.controlMode === 'profit-live';
  const selfKilledPlayerDropCoins = selfKilledPlayerDropFallbackEnabled
    ? snapshotCoins.filter(coin => isSelfKilledPlayerDropCoin(coin, selfKillTargetTicks, options))
    : [];
  const snapshotFallbackEnabledOption = options.snapshotCoinFallbackEnabled ?? options.allowSnapshotCoinFallback;
  const snapshotFallbackEnabled = snapshotFallbackEnabledOption === undefined
    ? true
    : snapshotFallbackEnabledOption !== false;
  const snapshotFallbackBlockedReasons = [];
  if (!snapshotFallbackEnabled) snapshotFallbackBlockedReasons.push('snapshot-fallback-disabled');
  if (realtimeCoins.length) snapshotFallbackBlockedReasons.push('realtime-profit-present');
  if (snapshotFallbackThreats.length) snapshotFallbackBlockedReasons.push('active-threat-visible');
  if (snapshotFrameAgeMs !== null && snapshotFrameAgeMs > snapshotMaxAgeMs) snapshotFallbackBlockedReasons.push('snapshot-stale');
  if (snapshotFallbackEnabled && snapshotCoins.length && !snapshotVisibleCoins.length) snapshotFallbackBlockedReasons.push('snapshot-coins-out-of-visible-range');
  const snapshotFallbackAllowed = Boolean(snapshotFallbackEnabled && snapshotVisibleCoins.length && !snapshotFallbackBlockedReasons.length);
  if (!realtimeCoinsRaw.length && !snapshotCoinsRaw.length) dataGaps.push('no-coin-frame-type-observed');
  if (!realtimeCoins.length && snapshotCoins.length) dataGaps.push('snapshot-coin-fallback-only');
  if (selfKilledPlayerDropCoins.length) dataGaps.push('self-killed-player-drop-visible');
  if (snapshotActiveThreats.length) dataGaps.push('snapshot-active-threat-visible');
  if (visibleTargets.some(target => target.whitelisted)) dataGaps.push('whitelisted-target-visible');
  if (visibleTargets.some(target => target.recentlyActive)) dataGaps.push('recently-active-target-visible');
  if (afkTargets.some(target => afkOpportunityBlockedByStaminaCooldown(target, options))) dataGaps.push('afk-stamina-cooldown-target-visible');
  if (centerFiltered.afkTargets) dataGaps.push('center-afk-targets-filtered');
  if (centerFiltered.edgeAdmittedAfkTargets) dataGaps.push('center-afk-edge-target-admitted');
  if (centerFiltered.edgeContinuedAfkTargets) dataGaps.push('center-afk-edge-target-continued');
  if (centerFiltered.edgeAdmittedRealtimeCoins.length || centerFiltered.edgeAdmittedSnapshotCoins.length) {
    dataGaps.push('center-visible-coin-edge-admitted');
  }
  if (centerFiltered.realtimeCoins) dataGaps.push('center-realtime-coins-filtered');
  if (centerFiltered.snapshotCoins) dataGaps.push('center-snapshot-coins-filtered');
  if (snapshotFallbackBlockedReasons.length) dataGaps.push(...snapshotFallbackBlockedReasons.map(reason => `snapshot-fallback-blocked:${reason}`));
  if (numberOrNull(realtime.frameAgeMs) === null && Number(realtime.receivedAtMs) > 0) {
    dataGaps.push('unknown-realtime-frame-age');
  }
  const selfKilledPlayerDropCoinKeys = new Set(selfKilledPlayerDropCoins.map(profitCoinKey).filter(Boolean));
  const selfKilledPlayerDropProfitCoins = selfKilledPlayerDropCoins.map(coin => ({
    ...coin,
    selfKilledPlayerDrop: true,
    playerDropPriority: true
  }));
  const snapshotFallbackProfitCoins = snapshotFallbackAllowed
    ? snapshotVisibleCoins.map(coin => (selfKilledPlayerDropCoinKeys.has(profitCoinKey(coin))
      ? { ...coin, selfKilledPlayerDrop: true, playerDropPriority: true }
      : coin))
    : [];
  const rawProfitCoins = realtimeCoins.length
    ? realtimeCoins
    : (selfKilledPlayerDropCoins.length
        ? mergeProfitCoinCandidates(selfKilledPlayerDropProfitCoins, snapshotFallbackProfitCoins)
        : snapshotFallbackProfitCoins);
  const profitCoinSource = realtimeCoins.length
    ? 'realtime'
    : (selfKilledPlayerDropCoins.length ? 'snapshot-player-drop' : (snapshotFallbackAllowed ? 'snapshot-fallback' : 'none'));
  const activeCoinCompetition = partitionActiveCoinCompetition(self, rawProfitCoins, visibleTargets, {
    ...options,
    nowMs,
    currentTick: realtime.tick
  }, stateful);
  const profitCoins = activeCoinCompetition.available;
  const panelProfitCoins = activeCoinCompetition.panel;
  if (activeCoinCompetition.contested.length) dataGaps.push('active-player-coin-competition');
  return {
    userId: Number(state?.userId || options.userId || 0),
    nowMs,
    rawRealtime: realtime,
    command: state?.command || null,
    self,
    centerActivity: centerActivityInputSummary(self, centerFiltered, options),
    stamina: entityStaminaSummary(self || {}),
    frameAges: state?.frameAges || {},
    realtime: {
      tick: realtime.tick ?? null,
      frameAgeMs: numberOrNull(realtime.frameAgeMs),
      entityCount: decisionEntities.length,
      bulletCount: Array.isArray(realtime.bullets) ? realtime.bullets.length : 0
    },
    fallback: {
      tick: fallback.tick ?? null,
      frameAgeMs: numberOrNull(fallback.frameAgeMs),
      coinDropsObserved: fallback.coinDropsObserved === true,
      coinDropCount: snapshotCoins.length,
      snapshotVisibleCoinCount: snapshotVisibleCoins.length,
      snapshotVisibleCoinMaxDistanceCm: snapshotVisibleCoinMaxDistance,
      snapshotFallbackThreatCount: snapshotFallbackThreats.length,
      selfKilledPlayerDropCount: selfKilledPlayerDropCoins.length,
      authority: 'snapshot',
      snapshotCoinFallbackAllowed: snapshotFallbackAllowed,
      snapshotFallbackBlockedReasons
    },
    visibleTargets,
    activeThreats,
    firingThreats,
    avoidanceThreats,
    snapshotActiveThreats,
    snapshotFallbackThreats,
    afkPanelTargets,
    afkTargets,
    easyKill: easyKillInput.easyKill,
    easyKillTargets: easyKillInput.easyKillTargets,
    realtimeObservedCoins: realtimeCoinsRaw,
    snapshotObservedCoins: snapshotCoinsRaw,
    realtimeCoins,
    snapshotCoins,
    snapshotVisibleCoins,
    selfKilledPlayerDropCoins,
    selfKillTargetIds,
    selfKillEvidence,
    profitCoins,
    panelProfitCoins,
    profitCoinSource,
    activeCoinCompetition: {
      enabled: options.activeCoinCompetitionEnabled !== false,
      activeCompetitorCount: activeCoinCompetition.activeCompetitorCount,
      contestedCoinCount: activeCoinCompetition.contested.length,
      contested: activeCoinCompetition.contested.slice(0, 8),
      released: activeCoinCompetition.released.slice(0, 8)
    },
    bullets: Array.isArray(realtime.bullets) ? realtime.bullets : [],
    dataGaps
  };
}

function buildBrowserlessCombatStrategyInput(state, options = {}, stateful = {}) {
  const inputStages = {};
  let inputStageStarted = performance.now();
  const markInputStage = name => {
    inputStages[name] = performance.now() - inputStageStarted;
    inputStageStarted = performance.now();
  };
  const realtime = state?.realtime || {};
  const fallback = state?.fallback || state?.snapshot || {};
  const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  const snapshotFrameAgeMs = numberOrNull(fallback.frameAgeMs);
  const snapshotMaxAgeMs = Math.max(1000, Number(options.snapshotCoinFallbackMaxAgeMs || 5000));
  const snapshotFreshForMetadata = snapshotFrameAgeMs === null || snapshotFrameAgeMs <= snapshotMaxAgeMs;
  const rawSelfUserId = numberOrNull(realtime.self?.user_id ?? realtime.self?.userId ?? state?.userId ?? options.userId);
  const priorityUserIds = new Set();
  if (rawSelfUserId !== null) priorityUserIds.add(String(rawSelfUserId));
  const currentTargetId = stateful?.combatTarget?.id ?? stateful?.combatTarget?.userId ?? stateful?.combatTarget?.user_id;
  if (currentTargetId !== null && currentTargetId !== undefined && currentTargetId !== '') {
    priorityUserIds.add(String(currentTargetId));
  }
  for (const bullet of Array.isArray(realtime.bullets) ? realtime.bullets : []) {
    const ownerId = bulletOwnerId(bullet);
    if (ownerId !== null && ownerId !== undefined && ownerId !== '') priorityUserIds.add(String(ownerId));
  }
  const rawRealtimeEntities = (Array.isArray(realtime.entities) ? realtime.entities : []).filter(entity => {
    const userId = entity?.user_id ?? entity?.userId;
    if (userId !== null && userId !== undefined && priorityUserIds.has(String(userId))) return true;
    if (entity?.firing || entity?.shooting || entity?.is_firing) return true;
    if (Math.abs(Number(entity?.vx || 0)) > 0 || Math.abs(Number(entity?.vy || 0)) > 0) return true;
    const mode = String(entity?.current_join_mode || entity?.mode || entity?.joined || '').toLowerCase();
    if (mode === 'active') return true;
    const remaining = numberOrNull(entity?.stamina_5s_remaining_milli ?? entity?.stamina5sRemainingMilli ?? entity?.stamina5s);
    const limit = numberOrNull(entity?.stamina_5s_limit_milli ?? entity?.stamina5sLimitMilli ?? entity?.stamina5sLimit);
    return remaining !== null && limit !== null && limit > 0 && remaining < limit * 0.98;
  });
  markInputStage('priority-filter');
  const metadataUserIds = new Set(rawRealtimeEntities
    .map(entity => numberOrNull(entity?.user_id ?? entity?.userId))
    .filter(value => value !== null)
    .map(String));
  if (rawSelfUserId !== null) metadataUserIds.add(String(rawSelfUserId));
  const snapshotEntitiesByUserId = new Map();
  if (snapshotFreshForMetadata) {
    const indexed = fallback.entitiesByUserId && typeof fallback.entitiesByUserId === 'object'
      ? fallback.entitiesByUserId
      : null;
    if (indexed) {
      for (const userId of metadataUserIds) {
        const entity = indexed[String(userId)];
        if (entity) snapshotEntitiesByUserId.set(Number(userId), entity);
      }
    } else {
      for (const entity of Array.isArray(fallback.entities) ? fallback.entities : []) {
        const userId = numberOrNull(entity?.user_id ?? entity?.userId);
        if (userId !== null && metadataUserIds.has(String(userId))) snapshotEntitiesByUserId.set(userId, entity);
      }
    }
  }
  markInputStage('metadata-index');
  const snapshotSelf = rawSelfUserId !== null ? snapshotEntitiesByUserId.get(rawSelfUserId) : null;
  const enrichedSelf = enrichRealtimeSelfWithSnapshotMetadata(realtime.self, snapshotSelf, options);
  const self = normalizeEntityForDecision(enrichedSelf.self, null, 'realtime', options);
  markInputStage('self-normalize');
  const selfUserId = Number(self?.user_id ?? state?.userId ?? options.userId ?? 0);
  const realtimeEntities = [];
  for (const entity of rawRealtimeEntities) {
    const userId = numberOrNull(entity?.user_id ?? entity?.userId);
    const enriched = enrichRealtimeEntityWithSnapshotProfitMetadata(
      entity,
      userId === null ? null : snapshotEntitiesByUserId.get(userId),
      options
    );
    const normalized = normalizeEntityForDecision(enriched, self, 'realtime', options);
    if (normalized) realtimeEntities.push(normalized);
  }
  markInputStage('entity-normalize');
  annotateBrowserlessRecentActivity(realtimeEntities, stateful, nowMs, options);
  markInputStage('player-memory');
  const visibleTargets = [];
  for (const entity of realtimeEntities) {
    const refreshed = refreshDecisionEntityActivity(entity, options);
    if (Number(refreshed.user_id) === selfUserId) continue;
    if (!Number.isFinite(Number(refreshed.x)) || !Number.isFinite(Number(refreshed.y))) continue;
    visibleTargets.push(refreshed);
  }
  markInputStage('visible-targets');
  reconcileEconomicStopLossCooldowns({
    nowMs,
    visibleTargets,
    bullets: Array.isArray(realtime.bullets) ? realtime.bullets : []
  }, stateful, options);
  const easyKillInput = {
    visibleTargets,
    nowMs,
    easyKillTargets: [],
    easyKill: null
  };
  refreshEasyKillTargetAnnotations(easyKillInput, stateful, options);
  markInputStage('easy-kill');
  const activeThreats = visibleTargets.filter(entity => entity.active && entity.alive !== false && !entity.whitelisted && !entity.easyKillThreatExempt);
  const firingThreats = visibleTargets.filter(entity => entity.firing && entity.alive !== false && !entity.whitelisted && !entity.easyKillThreatExempt);
  const avoidanceThreats = mergeRecentInvulnerableThreats(
    visibleTargets,
    visibleTargets.filter(isBrowserlessAvoidanceThreat),
    self,
    stateful,
    { ...options, nowMs, currentTick: realtime.tick }
  );
  markInputStage('threat-index');
  const realtimeSnapshotObservation = refreshRealtimeSnapshotObservation(state, self, stateful, options, nowMs);
  const realtimeObservedCoins = (realtimeSnapshotObservation?.nearby?.c || [])
    .filter(row => Array.isArray(row) && row[0] !== undefined && Number(row[1] || 0) > 0)
    .map(row => {
      const id = String(row[0]);
      return {
        drop_id: id,
        id,
        key: `id:${id}`,
        amount: Number(row[1]),
        distance: Number(row[2] || Infinity),
        authority: 'snapshot',
        snapshotOnly: true
      };
    });
  markInputStage('snapshot-observation');
  const result = {
    userId: Number(state?.userId || options.userId || 0),
    nowMs,
    rawRealtime: realtime,
    command: state?.command || null,
    self,
    frameAges: state?.frameAges || {},
    stamina: entityStaminaSummary(self || {}),
    realtime: {
      tick: realtime.tick ?? null,
      frameAgeMs: numberOrNull(realtime.frameAgeMs),
      entityCount: realtimeEntities.length,
      bulletCount: Array.isArray(realtime.bullets) ? realtime.bullets.length : 0
    },
    fallback: {
      tick: realtimeSnapshotObservation?.tick ?? null,
      receivedAtMs: realtimeSnapshotObservation?.observedAtMs ?? 0,
      coinDropsObserved: true,
      coinDropCount: realtimeObservedCoins.length
    },
    visibleTargets,
    activeThreats,
    firingThreats,
    avoidanceThreats,
    snapshotActiveThreats: [],
    snapshotFallbackThreats: [],
    easyKill: easyKillInput.easyKill,
    easyKillTargets: easyKillInput.easyKillTargets,
    realtimeObservedCoins,
    snapshotObservedCoins: realtimeObservedCoins,
    selfKillEvidence: [],
    realtimeSnapshotObservation,
    bullets: Array.isArray(realtime.bullets) ? realtime.bullets : [],
    dataGaps: enrichedSelf.staminaMerged ? ['self-stamina-from-snapshot'] : []
  };
  markInputStage('output');
  if (typeof options.onCombatInputStageTimings === 'function') {
    options.onCombatInputStageTimings(inputStages, {
      rawEntityCount: Array.isArray(realtime.entities) ? realtime.entities.length : 0,
      prioritizedEntityCount: rawRealtimeEntities.length,
      metadataEntityCount: snapshotEntitiesByUserId.size,
      normalizedEntityCount: realtimeEntities.length,
      visibleTargetCount: visibleTargets.length,
      bulletCount: Array.isArray(realtime.bullets) ? realtime.bullets.length : 0
    });
  }
  return result;
}

function scoreCoinOpportunity(coin, options = {}) {
  const weight = Number(options.coinOpportunityValue ?? BROWSER_RUNTIME_DEFAULTS.coinOpportunityValue ?? 1);
  const reward = Number(coin?.routeValue ?? coin?.coinRoute?.value ?? coin?.fieldAmount ?? coin?.totalAmount ?? coin?.amount);
  return opportunityValueScoreCore(reward, opportunityCoinStaminaCost(coin, options), {
    distanceFloor: options.opportunityDistanceFloor ?? BROWSER_RUNTIME_DEFAULTS.opportunityDistanceFloor,
    distanceScoreScale: options.distanceScoreScale || options.opportunityDistanceScoreScale || BROWSER_RUNTIME_DEFAULTS.opportunityDistanceScoreScale || 10000,
    weight
  });
}

function activeTargetCompletionEstimate(target, options = {}) {
  if (!target?.active) {
    return {
      probability: 1,
      baseProbability: 1,
      hpFactor: 1,
      hitFactor: 1,
      escapeFactor: 1,
      exchangeFactor: 1,
      source: 'non-active-target'
    };
  }
  const targetId = target?.user_id ?? target?.userId;
  let completion = { probability: 1 / 3 };
  const completionByUserId = options.combatCompletionByUserId && typeof options.combatCompletionByUserId === 'object'
    ? options.combatCompletionByUserId
    : null;
  if (completionByUserId && targetId !== null && targetId !== undefined && completionByUserId[String(targetId)]) {
    completion = completionByUserId[String(targetId)];
  } else if (options.combatCompletionTracker?.probability && targetId !== null && targetId !== undefined) {
    try {
      completion = options.combatCompletionTracker.probability(targetId, options.nowMs);
    } catch (_) {}
  }
  const baseProbability = Math.max(0.05, Math.min(0.95, Number(completion.probability || 1 / 3)));
  const historicalEscapeRate = numberOrNull(completion.escapeRate);
  const historicalDamageExchange = numberOrNull(completion.damageExchangeRatio);
  const historyEscapeFactor = historicalEscapeRate === null
    ? 1
    : Math.max(0.45, Math.min(1, 1 - historicalEscapeRate * 0.55));
  const historyExchangeFactor = historicalDamageExchange === null
    ? 1
    : Math.max(0.55, Math.min(1.1, 0.55 + Math.min(1.25, historicalDamageExchange) * 0.4));
  const hpFactor = Math.max(0.35, Math.min(1.35, 100 / Math.max(25, Number(target.hp || 100))));
  const metrics = options.recentCombatMetrics || {};
  const metricsMatch = targetId !== null && targetId !== undefined
    && String(metrics.targetId ?? '') === String(targetId);
  const acceptedShots = metricsMatch ? Math.max(0, Number(metrics.acceptedShots || 0)) : 0;
  const confirmedHits = metricsMatch ? Math.max(0, Number(metrics.confirmedHits || 0)) : 0;
  const acceptedHitRate = acceptedShots >= 4
    ? Math.max(0, Math.min(1, confirmedHits / Math.max(1, acceptedShots)))
    : numberOrNull(options.behaviorHitRate);
  const hitFactor = acceptedHitRate === null
    ? 0.85
    : Math.max(0.5, Math.min(1.2, 0.55 + acceptedHitRate * 2.6));
  const behavior = options.opponentBehaviorState || null;
  const movementIntent = String(behavior?.dimensions?.movementIntent?.state || behavior?.mode || '');
  const controlStyle = String(behavior?.dimensions?.controlStyle?.state || 'unknown');
  const controlConfidence = Number(behavior?.dimensions?.controlStyle?.confidence || 0);
  let escapeFactor = 1;
  if (movementIntent === 'retreat' || movementIntent === 'retreat-kite') escapeFactor *= 0.68;
  else if (movementIntent === 'zigzag' || movementIntent === 'erratic' || movementIntent === 'zigzag-strafe') escapeFactor *= 0.82;
  else if (movementIntent === 'stationary') escapeFactor *= 1.08;
  if (controlStyle === 'human-like' && controlConfidence >= 0.35) escapeFactor *= 0.86;
  const distance = Number(target.distance);
  if (Number.isFinite(distance) && distance > 10500) escapeFactor *= 0.65;
  else if (Number.isFinite(distance) && distance > 7500) escapeFactor *= 0.85;
  if (Number(behavior?.noProgressMs || 0) >= 10000) escapeFactor *= 0.72;
  escapeFactor = Math.max(0.3, Math.min(1.1, escapeFactor));

  let exchangeFactor = 1;
  const exchangeStopLoss = options.exchangeStopLoss || null;
  if (exchangeStopLoss?.triggered || exchangeStopLoss?.disengage) {
    exchangeFactor = 0.2;
  } else if (metricsMatch && acceptedShots >= 10) {
    const selfDamage = Math.max(0, Number(metrics.selfDamage || 0));
    const targetDamage = Math.max(0, Number(metrics.targetDamage || 0));
    const damageDeficit = selfDamage - targetDamage;
    if (Number(options.combatTargetState?.exchangeDegradationSinceAt || 0) > 0 || damageDeficit >= 12) {
      exchangeFactor = 0.45;
    } else if (damageDeficit > 0) {
      exchangeFactor = Math.max(0.58, 1 - damageDeficit / 30);
    } else if (targetDamage < 6) {
      exchangeFactor = 0.72;
    }
  }
  const probability = Math.max(0.03, Math.min(0.95,
    baseProbability
      * hpFactor
      * hitFactor
      * escapeFactor
      * exchangeFactor
      * historyEscapeFactor
      * historyExchangeFactor));
  return {
    probability,
    baseProbability,
    hpFactor,
    hitFactor,
    acceptedHitRate,
    escapeFactor,
    exchangeFactor,
    historicalEscapeRate,
    historicalDamageExchange,
    historyEscapeFactor,
    historyExchangeFactor,
    source: completion.source || 'conservative-prior'
  };
}

function activeTargetExpectedReward(target, options = {}) {
  return effectiveProfitReward(target, options).expectedReward;
}

function effectiveProfitReward(target, options = {}) {
  const rawDrop = Math.max(0, entityDropValue(target));
  const active = Boolean(target?.active);
  const completion = active
    ? activeTargetCompletionEstimate(target, options)
    : { probability: 1, source: 'deterministic-afk-target' };
  const completionProbability = Math.max(0, Math.min(1, Number(completion.probability ?? (active ? 1 / 3 : 1))));
  const collectionProbability = active
    ? Math.max(0, Math.min(1, Number(options.activeTargetCollectionProbability ?? 0.9)))
    : 1;
  const expectedReward = rawDrop * completionProbability * collectionProbability;
  const staminaCostValue = options.staminaCostOverride ?? opportunityEnemyStaminaCost(target, options);
  const staminaCost = Number.isFinite(Number(staminaCostValue)) ? Math.max(0, Number(staminaCostValue)) : Infinity;
  const acceptedShots = Math.max(0, Number(options.recentCombatMetrics?.acceptedShots || 0));
  const uncertainty = active ? Math.max(0.08, 0.22 / Math.sqrt(1 + acceptedShots / 4)) : 0;
  const lowerProbability = Math.max(0, completionProbability - uncertainty);
  const upperProbability = Math.min(1, completionProbability + uncertainty);
  return {
    rawDrop,
    completionProbability,
    collectionProbability,
    expectedReward,
    staminaCost: Number.isFinite(staminaCost) ? staminaCost : null,
    netROI: Number.isFinite(staminaCost) ? rewardPerTenStamina(expectedReward, staminaCost) : null,
    modelSource: active ? String(completion.source || 'conservative-prior') : 'deterministic-afk-target',
    confidence: {
      lowerProbability,
      upperProbability,
      lowerExpectedReward: rawDrop * lowerProbability * collectionProbability,
      upperExpectedReward: rawDrop * upperProbability * collectionProbability
    },
    completion
  };
}

function scoreEnemyOpportunity(target, options = {}) {
  const isAfkProfitTarget = typeof options.isAfkProfitTarget === 'function'
    ? options.isAfkProfitTarget
    : () => false;
  if (isAfkProfitTarget(target) && afkOpportunityBlockedByStaminaCooldown(target, options)) return null;
  const coinWeight = Number(options.coinOpportunityValue ?? BROWSER_RUNTIME_DEFAULTS.coinOpportunityValue ?? 1);
  const dropWeight = Number(options.dropOpportunityValue ?? BROWSER_RUNTIME_DEFAULTS.dropOpportunityValue ?? coinWeight);
  const weight = Number(options.enemyOpportunityValue ?? (
    isAfkProfitTarget(target)
      ? coinWeight
      : dropWeight
  ) ?? 1);
  const effective = effectiveProfitReward(target, options);
  return opportunityValueScoreCore(effective.expectedReward, effective.staminaCost, {
    distanceFloor: options.opportunityDistanceFloor ?? BROWSER_RUNTIME_DEFAULTS.opportunityDistanceFloor,
    distanceScoreScale: options.distanceScoreScale || options.opportunityDistanceScoreScale || BROWSER_RUNTIME_DEFAULTS.opportunityDistanceScoreScale || 10000,
    weight
  });
}

function coinSafeFromThreats(coin, threats = [], options = {}) {
  const dangerRadius = Math.max(0, Number(options.coinDangerRadius || OPPORTUNITY_CONSTANTS.COIN_DANGER_RADIUS));
  const invulnerableRadius = Math.max(dangerRadius, Number(options.invulnerableCoinDangerRadius || OPPORTUNITY_CONSTANTS.INVULNERABLE_COIN_DANGER_RADIUS));
  for (const threat of threats || []) {
    const radius = threat?.invulnerable ? invulnerableRadius : dangerRadius;
    if (distanceBetween(coin, threat) <= radius) return false;
  }
  return true;
}

function coinThreatDangerRadius(threat, options = {}) {
  const dangerRadius = Math.max(0, Number(options.coinDangerRadius || OPPORTUNITY_CONSTANTS.COIN_DANGER_RADIUS));
  const invulnerableRadius = Math.max(dangerRadius, Number(options.invulnerableCoinDangerRadius || OPPORTUNITY_CONSTANTS.INVULNERABLE_COIN_DANGER_RADIUS));
  return threat?.invulnerable ? invulnerableRadius : dangerRadius;
}

function coinBlockedByThreat(_origin, coin, threat, options = {}) {
  return !coinSafeFromThreats(coin, [threat], options);
}

function targetSafeFromOpportunityThreats(target, threats = [], options = {}) {
  const dangerRadius = Math.max(0, Number(options.attackDangerRadius ?? BROWSER_RUNTIME_DEFAULTS.attackDangerRadius ?? 0));
  if (!(dangerRadius > 0)) return true;
  return !(threats || []).some(threat => {
    if (!threat || threat.alive === false) return false;
    const targetId = target?.user_id ?? target?.userId ?? target?.entity_id ?? target?.entityId;
    const threatId = threat?.user_id ?? threat?.userId ?? threat?.entity_id ?? threat?.entityId;
    if (targetId !== null && targetId !== undefined && threatId !== null && threatId !== undefined && String(targetId) === String(threatId)) return false;
    return distanceBetween(target, threat) <= dangerRadius;
  });
}

function highValueCoinPriorityAmount(options = {}) {
  const value = Number(options.highValueCoinPriorityAmount ?? OPPORTUNITY_CONSTANTS.HIGH_VALUE_COIN_PRIORITY_AMOUNT);
  return Math.max(1, Number.isFinite(value) ? value : OPPORTUNITY_CONSTANTS.HIGH_VALUE_COIN_PRIORITY_AMOUNT);
}

function highValueCoinPriorityRange(options = {}) {
  const value = Number(options.combatAttackRange ?? options.attackRange ?? DEFAULT_ATTACK_RANGE);
  return Math.max(0, Number.isFinite(value) ? value : DEFAULT_ATTACK_RANGE);
}

function highValueCoinPriorityHealthyHp(options = {}) {
  const value = Number(options.highValueCoinPriorityHealthyHp
    ?? options.combatLowHpLeaveThreshold
    ?? OPPORTUNITY_CONSTANTS.HIGH_VALUE_COIN_PRIORITY_HEALTHY_HP);
  return Math.max(1, Number.isFinite(value) ? value : OPPORTUNITY_CONSTANTS.HIGH_VALUE_COIN_PRIORITY_HEALTHY_HP);
}

function bulletOwnerId(bullet) {
  return bullet?.owner_user_id ?? bullet?.ownerUserId ?? bullet?.owner_id ?? bullet?.ownerId ?? bullet?.user_id ?? bullet?.userId ?? null;
}

function hasLikelyIncomingBullet(input) {
  const selfId = input?.self?.user_id ?? input?.self?.userId ?? input?.userId ?? null;
  const exemptOwnerIds = new Set((input?.visibleTargets || [])
    .filter(target => target?.easyKillThreatExempt)
    .map(targetKey)
    .filter(Boolean));
  return (input?.bullets || []).some(bullet => {
    const ownerId = bulletOwnerId(bullet);
    if (ownerId === null || ownerId === undefined || ownerId === '') return true;
    if (selfId === null || selfId === undefined || selfId === '') return true;
    if (exemptOwnerIds.has(String(ownerId))) return false;
    return String(ownerId) !== String(selfId);
  });
}

function highValueThreatBlocksLowHpCoin(threat, options = {}) {
  if (!threat || threat.alive === false || threat.invulnerable) return false;
  if (threat.easyKillThreatExempt) return false;
  const distance = Number(threat.distance ?? Infinity);
  if (!Number.isFinite(distance)) return false;
  const cautionRadius = Math.max(0, Number(threat.cautionRadius || options.activeCautionRadius || 0));
  const radius = Math.max(
    Number(options.combatAttackRange || options.attackRange || DEFAULT_ATTACK_RANGE) || DEFAULT_ATTACK_RANGE,
    Number(options.profitLiveThreatExitRange || DEFAULT_PROFIT_LIVE_THREAT_EXIT_RANGE) || DEFAULT_PROFIT_LIVE_THREAT_EXIT_RANGE,
    cautionRadius + Math.max(0, Number(options.activeCautionExitMargin || 0))
  );
  if (distance > radius) return false;
  return Boolean(threat.active || threat.firing || isCurrentlyActiveEntity(threat, options));
}

function pickHighValueVisibleCoin(input, combatDecision, options = {}) {
  if (!input?.self) return null;
  const realtimeCandidates = (input.profitCoins || []).filter(coin => !coin.snapshotOnly);
  const snapshotProfitSource = input.profitCoinSource === 'snapshot-fallback'
    || input.profitCoinSource === 'snapshot-player-drop';
  const snapshotCandidates = !realtimeCandidates.length && snapshotProfitSource
    ? (input.profitCoins || []).filter(coin => coin.snapshotOnly)
    : [];
  const usingSnapshotFallback = !realtimeCandidates.length && snapshotCandidates.length > 0;
  if (usingSnapshotFallback && (combatDecision?.target || combatDecision?.dryRun?.target)) return null;
  const candidates = realtimeCandidates.length ? realtimeCandidates : snapshotCandidates;
  if (!candidates.length) return null;
  const minAmount = highValueCoinPriorityAmount(options);
  const healthyHp = highValueCoinPriorityHealthyHp(options);
  const hp = hpValue(input.self);
  const healthy = hp !== null && hp >= healthyHp;
  const maxDistance = highValueCoinPriorityRange(options);
  const threats = [
    ...(input.avoidanceThreats || input.activeThreats || []),
    ...(input.snapshotActiveThreats || [])
  ];
  if (!healthy) {
    if (hasLikelyIncomingBullet(input)) return null;
    if (combatDecision?.target || combatDecision?.dryRun?.target) return null;
    if (threats.some(threat => highValueThreatBlocksLowHpCoin(threat, options))) return null;
  }
  return candidates
    .filter(coin => Number(coin.amount || 0) >= minAmount)
    .filter(coin => Number(coin.distance || Infinity) <= maxDistance)
    .filter(coin => opportunityStaminaAffordable(input.self, opportunityCoinStaminaCost(coin, options), options))
    .filter(coin => healthy || coinSafeFromThreats(coin, threats, options))
    .sort((a, b) => {
      const scoreDiff = scoreCoinOpportunity(b, options) - scoreCoinOpportunity(a, options);
      if (scoreDiff) return scoreDiff;
      return Number(b.amount || 0) - Number(a.amount || 0)
        || Number(a.distance || Infinity) - Number(b.distance || Infinity);
    })[0] || null;
}

function highValueVisibleCoinPriorityNeeded(input, combatDecision, options = {}) {
  if (!input?.self) return false;
  if (isRecoveringSelf(input.self)) return true;
  if (combatDecision?.target || combatDecision?.dryRun?.target) return true;
  if ((input.avoidanceThreats || input.activeThreats || []).length || (input.snapshotActiveThreats || []).length) return true;
  if (hasLikelyIncomingBullet(input)) return true;
  return false;
}

function buildHighValueVisibleCoinPriorityDecision(input, combatDecision, options = {}) {
  if (!highValueVisibleCoinPriorityNeeded(input, combatDecision, options)) return null;
  const coin = pickHighValueVisibleCoin(input, combatDecision, options);
  if (!coin) return null;
  return {
    kind: Number(coin.distance || Infinity) <= Number(options.coinMaxDistance ?? BROWSER_RUNTIME_DEFAULTS.coinMaxDistance)
      ? 'coin'
      : 'seek-coin',
    band: 'profit',
    reason: 'high-value-visible-coin-priority',
    ignoreReturnBlock: true,
    reward: Number(coin.coinRoute?.value ?? coin.fieldAmount ?? coin.amount ?? 0),
    staminaCost: opportunityCoinStaminaCost(coin, options),
    target: summarizeCoin(coin),
    highValueCoinPriority: {
      amount: Math.max(0, Math.round(Number(coin.amount || 0))),
      minAmount: highValueCoinPriorityAmount(options),
      maxDistance: highValueCoinPriorityRange(options),
      hp: Math.round(hpValue(input.self) ?? 0),
      healthyHp: highValueCoinPriorityHealthyHp(options),
      source: coin.snapshotOnly
        ? (input.profitCoinSource === 'snapshot-player-drop' ? 'snapshot-player-drop' : 'snapshot-fallback')
        : 'realtime'
    }
  };
}

function enemyStaminaCost(target, options = {}) {
  return opportunityEnemyStaminaCost(target, options);
}

function opportunityMoveStaminaCost(distance, options = {}, stopDistance = 0) {
  const travel = Math.max(0, Number(distance || 0) - Math.max(0, Number(stopDistance || 0)));
  return travel * Math.max(0, Number(options.opportunityMoveStaminaPerCm ?? BROWSER_RUNTIME_DEFAULTS.opportunityMoveStaminaPerCm ?? 1));
}

function opportunityCoinStaminaCost(coin, options = {}) {
  const override = Number(coin?.opportunityStaminaCost ?? coin?.staminaCost ?? NaN);
  if (Number.isFinite(override) && override >= 0) return override;
  return opportunityMoveStaminaCost(coin?.distance, options, 0)
    + Math.max(0, Number(options.opportunityCoinPickupStaminaMs ?? BROWSER_RUNTIME_DEFAULTS.opportunityCoinPickupStaminaMs ?? 0));
}

function estimatedKillShots(target, options = {}) {
  const damage = Math.max(0.1, Number(options.opportunityEstimatedDamagePerShot ?? BROWSER_RUNTIME_DEFAULTS.opportunityEstimatedDamagePerShot ?? 3));
  const hp = Math.max(1, Number(target?.hp ?? target?.knownHp ?? 100) || 100);
  return Math.max(1, Math.ceil(hp / damage));
}

function opportunityEnemyStaminaCost(target, options = {}) {
  const moveCost = opportunityMoveStaminaCost(target?.distance, options, 0);
  const centerEdgeReturnCost = Math.max(0, Number(target?.centerActivityEdge?.returnCostMs || 0));
  const metrics = options.recentCombatMetrics?.targetId !== undefined
    && String(options.recentCombatMetrics.targetId) === String(target?.user_id ?? target?.userId ?? '')
    ? options.recentCombatMetrics
    : null;
  const observedShots = Number(metrics?.acceptedShots ?? metrics?.actualShots ?? 0);
  const observedHits = Number(metrics?.confirmedHits || 0);
  const defaultActiveHitRate = Math.max(0.05, Math.min(1, Number(options.opportunityActiveDefaultHitRate || 0.25)));
  const learnedBehaviorHitRate = options.behaviorHitRate === null || options.behaviorHitRate === undefined
    ? NaN
    : Number(options.behaviorHitRate);
  const hitRate = target?.active
    ? (Number.isFinite(learnedBehaviorHitRate)
        ? Math.max(0.05, Math.min(1, learnedBehaviorHitRate))
        : (observedShots >= 5 ? Math.max(0.05, Math.min(1, observedHits / observedShots)) : defaultActiveHitRate))
    : 1;
  const expectedShots = Math.ceil(estimatedKillShots(target, options) / hitRate);
  const riskScale = target?.active
    ? 1 + Math.max(0, Number(metrics?.selfDamage || 0)) / Math.max(1, Number(metrics?.targetDamage || 0) + 10)
    : 1;
  const shotCost = expectedShots
    * Math.max(0, Number(options.opportunityShotStaminaCostMs ?? BROWSER_RUNTIME_DEFAULTS.opportunityShotStaminaCostMs ?? OPPORTUNITY_CONSTANTS.SHOT_STAMINA_COST_MS));
  const expectedCombatMovementCost = target?.active
    ? 0
    : expectedShots * Math.max(0, Number(options.opportunityAfkCombatMovementStaminaPerShotMs
      ?? DEFAULT_AFK_COMBAT_MOVEMENT_STAMINA_PER_SHOT_MS));
  const expectedDodgeCost = target?.active
    ? Math.max(0, Number(options.opportunityExpectedDodgeCostMs ?? 1200)) * Math.max(0.5, riskScale)
    : 0;
  const expectedSwitchCost = Math.max(0, Number(options.opportunityExpectedSwitchCostMs ?? 250));
  return (moveCost
    + shotCost
    + expectedCombatMovementCost
    + expectedDodgeCost
    + expectedSwitchCost
    + centerEdgeReturnCost) * riskScale;
}

function staminaRemaining(self, windowName) {
  const key = String(windowName || '').toLowerCase();
  if (!self || (key !== '5s' && key !== '1h' && key !== '1d')) return null;
  const value = numberOrNull(self[`stamina_${key}_remaining_milli`]);
  return value;
}

function staminaExhaustedThreshold(options = {}) {
  return Math.max(0, Number(options.staminaExhaustedBelowMs ?? options.staminaExhaustedThresholdMs ?? BROWSER_RUNTIME_DEFAULTS.staminaExhaustedThresholdMs ?? 1000));
}

function opportunityWindowStaminaBudget(self, windowName, options = {}) {
  const remaining = staminaRemaining(self, windowName);
  if (!Number.isFinite(remaining)) return Infinity;
  const reserve = staminaExhaustedThreshold(options)
    + Math.max(0, Number(options.opportunityLongStaminaReserveMs ?? BROWSER_RUNTIME_DEFAULTS.opportunityLongStaminaReserveMs ?? 0));
  return Math.max(0, remaining - reserve);
}

function opportunityLongStaminaBudget(self, options = {}) {
  // The daily window is a terminal runtime boundary, not an in-game hold
  // budget. Keep taking ordinary actions while 1d stamina remains and let the
  // hard exhaustion decision leave as soon as it crosses the threshold.
  return opportunityWindowStaminaBudget(self, '1h', options);
}

function dailyStaminaWindowStartAt(t = Date.now()) {
  return Math.floor((Number(t) + UTC8_OFFSET_MS) / DAY_MS) * DAY_MS - UTC8_OFFSET_MS;
}

function nextDailyStaminaResetAt(t = Date.now()) {
  return dailyStaminaWindowStartAt(t) + DAY_MS;
}

function staminaBudgetReloginDelayMs(options = {}) {
  return Math.max(1000, Number(options.staminaBudgetReloginDelayMs ?? DEFAULT_STAMINA_BUDGET_RELOGIN_DELAY_MS));
}

function staminaResetGraceMs(options = {}) {
  return Math.max(0, Number(options.staminaResetGraceMs ?? BROWSER_RUNTIME_DEFAULTS.staminaResetGraceMs ?? 0));
}

function opportunityStaminaAffordable(self, staminaCost, options = {}) {
  const cost = Number(staminaCost);
  if (!Number.isFinite(cost) || cost <= 0) return true;
  const budget = opportunityLongStaminaBudget(self, options);
  return !Number.isFinite(budget) || cost <= budget;
}

function coinProgressCoreOptions(options = {}) {
  return {
    coinIgnoreMs: options.coinIgnoreMs ?? BROWSER_RUNTIME_DEFAULTS.coinIgnoreMs,
    coinProgressMinGain: options.coinProgressMinGain ?? BROWSER_RUNTIME_DEFAULTS.coinProgressMinGain,
    coinNearStuckResetGain: options.coinNearStuckResetGain ?? BROWSER_RUNTIME_DEFAULTS.coinNearStuckResetGain,
    closeCoinStuckDistance: options.closeCoinStuckDistance ?? BROWSER_RUNTIME_DEFAULTS.closeCoinStuckDistance,
    nearCoinStuckDistance: options.nearCoinStuckDistance ?? BROWSER_RUNTIME_DEFAULTS.nearCoinStuckDistance,
    closeCoinStuckMs: options.closeCoinStuckMs ?? BROWSER_RUNTIME_DEFAULTS.closeCoinStuckMs,
    nearCoinStuckMs: options.nearCoinStuckMs ?? BROWSER_RUNTIME_DEFAULTS.nearCoinStuckMs,
    coinNoProgressMs: options.coinNoProgressMs ?? BROWSER_RUNTIME_DEFAULTS.coinNoProgressMs,
    coinFailureDecayMs: options.coinFailureDecayMs ?? BROWSER_RUNTIME_DEFAULTS.coinFailureDecayMs,
    coinCloseFailureIgnoreMs: options.coinCloseFailureIgnoreMs ?? BROWSER_RUNTIME_DEFAULTS.coinCloseFailureIgnoreMs,
    coinNearFailureIgnoreMs: options.coinNearFailureIgnoreMs ?? BROWSER_RUNTIME_DEFAULTS.coinNearFailureIgnoreMs,
    coinNoProgressIgnoreMs: options.coinNoProgressIgnoreMs ?? BROWSER_RUNTIME_DEFAULTS.coinNoProgressIgnoreMs,
    coinFailureMaxIgnoreMs: options.coinFailureMaxIgnoreMs ?? BROWSER_RUNTIME_DEFAULTS.coinFailureMaxIgnoreMs,
    staleCoinEscapeMs: options.staleCoinEscapeMs ?? BROWSER_RUNTIME_DEFAULTS.staleCoinEscapeMs
  };
}

function coinDecisionKey(target) {
  if (!target) return '';
  return target.key || coinTargetKeyCore({
    ...target,
    drop_id: target.drop_id ?? target.id
  });
}

function singleCoinBaitEnabled(options = {}) {
  return options.singleCoinBaitEnabled !== false
    && String(options.controlMode || '') === 'profit-live'
    && options.combatEnabled === true;
}

function singleCoinBaitCoreOptions(options = {}) {
  return {
    enabled: singleCoinBaitEnabled(options),
    holdRadiusCm: Math.max(0, Number(options.singleCoinBaitHoldRadiusCm ?? BROWSER_RUNTIME_DEFAULTS.singleCoinBaitHoldRadiusCm ?? 1000)),
    sameCoinRadiusCm: Math.max(0, Number(options.singleCoinBaitSameCoinRadiusCm ?? BROWSER_RUNTIME_DEFAULTS.singleCoinBaitSameCoinRadiusCm ?? 1200))
  };
}

function actionMatchesSingleCoinBait(action, bait) {
  const actionKey = coinDecisionKey(action?.target);
  const baitKey = String(bait?.key || coinDecisionKey(bait));
  return Boolean(actionKey && baitKey && actionKey === baitKey);
}

function clearSingleCoinBaitTracking(stateful = {}, bait = null, options = {}) {
  const keys = new Set([
    String(bait?.key || ''),
    coinDecisionKey(bait)
  ].filter(Boolean));
  for (const key of keys) {
    if (stateful.coinAttempts) delete stateful.coinAttempts[key];
    if (stateful.coinProgress) delete stateful.coinProgress[key];
  }
  if (stateful.coinApproachLock && keys.has(String(stateful.coinApproachLock.id || ''))) {
    stateful.coinApproachLock = null;
  }
  if (options.clearFinalAction && actionMatchesSingleCoinBait(stateful.finalActionArbitration?.lastAction, bait)) {
    stateful.finalActionArbitration.lastAction = null;
    stateful.finalActionArbitration.lastFocus = null;
    stateful.finalActionArbitration.lastSelectedAt = 0;
  }
}

function singleCoinBaitActionSummary(state, input, options = {}) {
  if (!state) return null;
  return {
    ...cloneJson(state),
    holdRadiusCm: Math.max(0, Math.round(Number(options.singleCoinBaitHoldRadiusCm ?? BROWSER_RUNTIME_DEFAULTS.singleCoinBaitHoldRadiusCm ?? 1000))),
    ageMs: Math.max(0, Math.round(Number(input?.nowMs || 0) - Number(state.startedAt || input?.nowMs || 0))),
    holdAgeMs: state.holdStartedAt
      ? Math.max(0, Math.round(Number(input?.nowMs || 0) - Number(state.holdStartedAt)))
      : 0
  };
}

function singleCoinBaitVisibleCoins(input, previous = null) {
  const coins = [...(input?.realtimeCoins || [])];
  const snapshotBlockedReasons = input?.fallback?.snapshotFallbackBlockedReasons || [];
  const snapshotFresh = !snapshotBlockedReasons.includes('snapshot-stale');
  if (previous?.authority === 'snapshot' && snapshotFresh) {
    coins.push(...(input?.snapshotVisibleCoins || []));
  }
  return mergeProfitCoinCandidates(coins);
}

function singleCoinBaitAnchoredOpportunity(input, candidate, bait, threshold, options = {}) {
  if (!candidate || !bait) return null;
  const type = String(candidate.type || '');
  const source = candidate.sourceCoin || candidate.sourceTarget || candidate.coin || candidate;
  if (type === 'coin' && singleCoinBaitMatchesCore(source, bait, {
    sameCoinRadiusCm: options.singleCoinBaitSameCoinRadiusCm ?? BROWSER_RUNTIME_DEFAULTS.singleCoinBaitSameCoinRadiusCm
  })) {
    return candidate;
  }

  let reward = 0;
  let staminaCost = Infinity;
  let distance = distanceBetween(bait, source);
  let pathClear = true;
  if (type === 'coin') {
    const route = source?.routeDisplayOnly !== true
      ? (source?.coinRoute || candidate?.coinRoute || null)
      : null;
    const routePoints = Array.isArray(route?.points) ? route.points : [];
    const routeOptions = coinRouteCoreOptions(input, {}, options);
    if (routePoints.length) {
      let previous = bait;
      for (const point of routePoints) {
        if (!coinRouteLegClearCore(previous, point, input?.activeThreats || [], routeOptions)) {
          pathClear = false;
          break;
        }
        previous = point;
      }
      const summary = coinRouteSummaryCore(routePoints, bait, routeOptions);
      reward = Number(summary.totalValue || 0);
      staminaCost = Number(summary.totalStaminaCost || 0);
      distance = Number(summary.totalDistance || distance);
    } else {
      pathClear = coinRouteLegClearCore(bait, source, input?.activeThreats || [], routeOptions);
      reward = Math.max(0, Number(source?.amount ?? candidate?.amount ?? 0));
      staminaCost = opportunityMoveStaminaCost(distance, options, 0)
        + Math.max(0, Number(options.opportunityCoinPickupStaminaMs ?? BROWSER_RUNTIME_DEFAULTS.opportunityCoinPickupStaminaMs ?? 0));
    }
  } else if (type === 'enemy') {
    const anchoredTarget = { ...source, distance };
    reward = profitOpportunityThresholdReward(candidate);
    staminaCost = opportunityEnemyStaminaCost(anchoredTarget, options);
  } else {
    return { ...candidate, profitThresholdEligible: false };
  }

  const affordable = opportunityStaminaAffordable(input?.self, staminaCost, options);
  const profitThresholdEligible = pathClear
    && affordable
    && profitRewardAndCostEligible(reward, staminaCost, threshold);
  return {
    ...candidate,
    profitThresholdEligible,
    baitAnchorEvaluation: {
      originId: coinRouteKey(bait),
      type,
      id: type === 'coin'
        ? coinRouteKey(source)
        : String(source?.user_id ?? source?.userId ?? source?.id ?? candidate.id ?? ''),
      reward,
      staminaCost: Number.isFinite(staminaCost) ? Math.round(staminaCost) : null,
      distance: Number.isFinite(distance) ? Math.round(distance) : null,
      pathClear,
      affordable,
      profitThresholdEligible
    }
  };
}

function singleCoinBaitAnchoredOpportunities(input, opportunity, bait, options = {}) {
  const candidates = opportunity?.rawOpportunities || opportunity?.opportunities || [];
  return candidates
    .map(candidate => singleCoinBaitAnchoredOpportunity(input, candidate, bait, opportunity?.threshold, options))
    .filter(Boolean);
}

function summarizeSingleCoinBaitOpportunityEvaluations(opportunities, bait, options = {}) {
  return (opportunities || [])
    .filter(opportunity => opportunity?.baitAnchorEvaluation)
    .filter(opportunity => !singleCoinBaitMatchesCore(
      opportunity.sourceCoin || opportunity.coin || opportunity,
      bait,
      { sameCoinRadiusCm: options.singleCoinBaitSameCoinRadiusCm ?? BROWSER_RUNTIME_DEFAULTS.singleCoinBaitSameCoinRadiusCm }
    ))
    .map(opportunity => cloneJson(opportunity.baitAnchorEvaluation))
    .sort((left, right) => Number(right.profitThresholdEligible) - Number(left.profitThresholdEligible)
      || Number(left.staminaCost ?? Infinity) - Number(right.staminaCost ?? Infinity))
    .slice(0, 8);
}

function singleCoinBaitResidualRouteContinuation(input, opportunity, bait, options = {}) {
  const source = bait || null;
  const route = source?.coinRoutePreview
    || source?.coinRoute
    || null;
  if (!source || source.routeDisplayOnly !== true || !Array.isArray(route?.points) || route.points.length < 2) return null;
  const anchorKey = coinRouteKey(source);
  const anchorIndex = route.points.findIndex(point => coinRouteKey(point) === anchorKey);
  if (anchorIndex < 0) return null;
  const availableByKey = new Map((input?.profitCoins || []).map(coin => [coinRouteKey(coin), coin]));
  const remainingPoints = route.points.slice(anchorIndex + 1);
  const firstFollowUp = availableByKey.get(coinRouteKey(remainingPoints[0])) || null;
  if (!firstFollowUp) return null;
  const remaining = remainingPoints
    .map(point => availableByKey.get(coinRouteKey(point)) || null)
    .filter(Boolean);
  const routeOptions = coinRouteCoreOptions(input, {}, options);
  if (!coinRouteLegClearCore(source, firstFollowUp, input?.activeThreats || [], routeOptions)) return null;
  const summary = coinRouteSummaryCore(remaining, source, routeOptions);
  const firstFollowUpSummary = coinRouteSummaryCore([firstFollowUp], source, routeOptions);
  const reward = Number(summary.totalValue || 0);
  const staminaCost = Number(summary.totalStaminaCost || 0);
  const firstFollowUpReward = Number(firstFollowUpSummary.totalValue || 0);
  const firstFollowUpStaminaCost = Number(firstFollowUpSummary.totalStaminaCost || 0);
  // Once the bait anchor is collected, ordinary planning can act only on the
  // first remaining leg. Later route value must not subsidize an ineligible
  // first leg and leave the bot idle immediately after consuming the bait.
  const profitThresholdEligible = profitRewardAndCostEligible(
    firstFollowUpReward,
    firstFollowUpStaminaCost,
    opportunity?.threshold
  );
  return {
    routeIds: remaining.map(coinRouteKey),
    reward,
    staminaCost: Math.round(staminaCost),
    legCount: remaining.length,
    evaluationOrigin: {
      id: anchorKey,
      x: Number(source.x),
      y: Number(source.y)
    },
    firstFollowUp: {
      id: coinRouteKey(firstFollowUp),
      reward: firstFollowUpReward,
      staminaCost: Math.round(firstFollowUpStaminaCost)
    },
    profitThresholdEligible,
    suppressionReason: profitThresholdEligible
      ? 'eligible-first-follow-up-from-bait'
      : 'first-follow-up-below-profit-threshold'
  };
}

function singleCoinBaitOpportunityReward(opportunity) {
  const reward = profitOpportunityThresholdReward(opportunity);
  return Number.isFinite(reward) && reward > 0 ? reward : null;
}

function singleCoinBaitOpportunityNetRoi(opportunity) {
  const reward = singleCoinBaitOpportunityReward(opportunity);
  const staminaCost = Number(opportunity?.staminaCost);
  if (reward === null || !(staminaCost > 0)) return null;
  return reward / staminaCost;
}

function singleCoinBaitBestOrdinaryOpportunity(opportunity, bait, options = {}) {
  const matchOptions = {
    sameCoinRadiusCm: options.singleCoinBaitSameCoinRadiusCm ?? BROWSER_RUNTIME_DEFAULTS.singleCoinBaitSameCoinRadiusCm
  };
  const candidates = [
    opportunity?.choice,
    ...(opportunity?.sorted || []),
    ...(opportunity?.rawOpportunities || [])
  ].filter(candidate => {
    if (!candidate || candidate.profitThresholdEligible === false) return false;
    const source = candidate.sourceCoin || candidate.coin || candidate;
    return !singleCoinBaitMatchesCore(source, bait, matchOptions);
  });
  return candidates.sort((left, right) => Number(singleCoinBaitOpportunityNetRoi(right) ?? -Infinity)
    - Number(singleCoinBaitOpportunityNetRoi(left) ?? -Infinity))[0] || null;
}

function singleCoinBaitReturnPlan(input, opportunity, bait, anchoredOpportunities, continuation, options = {}) {
  if (!bait) return null;
  const baitId = coinRouteKey(bait);
  const baitX = Number(bait.x);
  const baitY = Number(bait.y);
  const origin = continuation?.evaluationOrigin || null;
  const originMatches = !continuation || Boolean(
    String(origin?.id || '') === String(baitId)
      && Number(origin?.x) === baitX
      && Number(origin?.y) === baitY
  );
  if (!originMatches) {
    return {
      allowed: false,
      suppressionReason: 'bait-continuation-origin-mismatch',
      evaluationOrigin: cloneJson(origin),
      baitId
    };
  }
  const baitCost = opportunityCoinStaminaCost(bait, options);
  const currentBest = singleCoinBaitBestOrdinaryOpportunity(opportunity, bait, options);
  const currentBestNetROI = singleCoinBaitOpportunityNetRoi(currentBest);
  const relativeMargin = Math.max(0, Number(
    options.opportunitySwitchRelativeMargin
      ?? BROWSER_RUNTIME_DEFAULTS.opportunitySwitchRelativeMargin
      ?? 0
  ));
  const fixedSwitchCost = Math.max(0, Number(options.opportunitySwitchMargin || 0));
  const thresholdContext = opportunity?.threshold || null;
  const thresholdFloor = thresholdContext?.active === true
    ? Number(thresholdContext.threshold?.rewardCoins || 0)
      / Math.max(1, Number(thresholdContext.threshold?.staminaMilli || 10000))
    : 0;
  const candidates = [];
  if (continuation?.profitThresholdEligible) {
    candidates.push({
      source: 'residual-route',
      reward: Number(continuation.reward || 0),
      staminaCost: Number(continuation.staminaCost || 0),
      firstFollowUp: cloneJson(continuation.firstFollowUp),
      evaluationOrigin: cloneJson(continuation.evaluationOrigin)
    });
  }
  for (const candidate of anchoredOpportunities || []) {
    const evaluation = candidate?.baitAnchorEvaluation || null;
    if (!evaluation?.profitThresholdEligible) continue;
    const source = candidate.sourceCoin || candidate.sourceTarget || candidate.coin || candidate;
    if (singleCoinBaitMatchesCore(source, bait, {
      sameCoinRadiusCm: options.singleCoinBaitSameCoinRadiusCm ?? BROWSER_RUNTIME_DEFAULTS.singleCoinBaitSameCoinRadiusCm
    })) continue;
    candidates.push({
      source: 'anchored-opportunity',
      reward: Number(evaluation.reward || 0),
      staminaCost: Number(evaluation.staminaCost || 0),
      firstFollowUp: {
        id: evaluation.id,
        type: evaluation.type,
        reward: Number(evaluation.reward || 0),
        staminaCost: Number(evaluation.staminaCost || 0)
      },
      evaluationOrigin: { id: baitId, x: baitX, y: baitY }
    });
  }
  const plans = candidates.map(candidate => {
    const reward = 1 + Math.max(0, Number(candidate.reward || 0));
    const staminaCost = Math.max(0, Number(baitCost || 0)) + Math.max(0, Number(candidate.staminaCost || 0));
    const comparableNetROI = reward / Math.max(1, staminaCost + fixedSwitchCost);
    const planThresholdEligible = profitRewardAndCostEligible(reward, staminaCost, thresholdContext);
    const requiredNetROI = Math.max(
      thresholdFloor,
      currentBestNetROI === null ? 0 : currentBestNetROI * (1 + relativeMargin)
    );
    return {
      ...candidate,
      reward,
      staminaCost,
      netROI: reward / Math.max(1, staminaCost),
      comparableNetROI,
      currentBestNetROI,
      thresholdFloor,
      planThresholdEligible,
      requiredNetROI,
      allowed: planThresholdEligible && comparableNetROI >= requiredNetROI
    };
  }).sort((left, right) => Number(right.comparableNetROI || 0) - Number(left.comparableNetROI || 0));
  const selected = plans.find(plan => plan.allowed) || plans[0] || null;
  return selected ? {
    ...selected,
    currentBest: currentBest ? {
      type: currentBest.type || '',
      id: currentBest.id ?? coinRouteKey(currentBest.sourceCoin || currentBest),
      reward: singleCoinBaitOpportunityReward(currentBest),
      staminaCost: Number.isFinite(Number(currentBest.staminaCost)) ? Number(currentBest.staminaCost) : null
    } : null,
    suppressionReason: selected.allowed
      ? ''
      : (!selected.planThresholdEligible
          ? 'bait-plan-below-profit-threshold'
          : 'bait-plan-below-current-profit-margin')
  } : null;
}

function buildSingleCoinBaitDecision(input, opportunity, stateful = {}, options = {}, allowEnter = true) {
  const previous = stateful.singleCoinBait || null;
  const selectedSource = opportunity?.choice?.sourceCoin
    || opportunity?.choice?.coin
    || opportunity?.choice
    || null;
  const selectedBaitCandidate = String(opportunity?.choice?.type || '') === 'coin'
    && Number(selectedSource?.amount) === 1
    ? selectedSource
    : null;
  const baitReference = previous || selectedBaitCandidate;
  const anchoredOpportunities = singleCoinBaitAnchoredOpportunities(
    input,
    opportunity,
    baitReference,
    options
  );
  const opportunityEvaluations = summarizeSingleCoinBaitOpportunityEvaluations(
    anchoredOpportunities,
    baitReference,
    options
  );
  const matchedVisibleBait = findSingleCoinBaitCoinCore(
    singleCoinBaitVisibleCoins(input, previous),
    baitReference,
    { sameCoinRadiusCm: options.singleCoinBaitSameCoinRadiusCm ?? BROWSER_RUNTIME_DEFAULTS.singleCoinBaitSameCoinRadiusCm }
  );
  // The realtime coin row is authoritative for current position/distance, but
  // the selected opportunity may carry route-preview metadata that is not
  // present on the raw row. Preserve both when they refer to the same bait.
  const visibleBait = matchedVisibleBait && baitReference
    ? { ...baitReference, ...matchedVisibleBait }
    : (matchedVisibleBait || baitReference);
  const continuation = singleCoinBaitResidualRouteContinuation(input, opportunity, visibleBait, options);
  const selectedOpportunity = continuation
    ? { ...(opportunity?.choice || {}), residualRouteContinuation: continuation }
    : (opportunity?.choice || null);
  const policy = singleCoinBaitPolicyCore({
    self: input?.self || null,
    nowMs: input?.nowMs,
    previous,
    selectedOpportunity,
    opportunities: anchoredOpportunities,
    visibleCoins: singleCoinBaitVisibleCoins(input, previous),
    entryCoins: input?.profitCoins || [],
    allowEnter
  }, singleCoinBaitCoreOptions(options));

  if (previous && !policy.state) {
    clearSingleCoinBaitTracking(stateful, previous, { clearFinalAction: true });
  }
  stateful.singleCoinBait = policy.state ? cloneJson(policy.state) : null;
  const evaluationState = policy.state || previous;
  const evaluationCoin = policy.coin || visibleBait;
  if (!evaluationState || !evaluationCoin) {
    return {
      ...policy,
      continuation,
      opportunityEvaluations,
      action: null,
      summary: null,
      lifecycle: previous ? {
        id: previous.id || '',
        previousPhase: previous.phase || '',
        phase: policy.phase || '',
        clearReason: policy.clearReason || '',
        transitioned: Boolean(policy.transitioned)
      } : null
    };
  }

  if (policy.phase === 'hold') {
    clearSingleCoinBaitTracking(stateful, policy.state);
  } else if (policy.phase === 'release' && policy.transitioned) {
    clearSingleCoinBaitTracking(stateful, policy.state);
  }

  const summary = singleCoinBaitActionSummary(evaluationState, input, options);
  const target = summarizeCoin(evaluationCoin);
  if (policy.phase === 'hold' && policy.state && policy.coin) {
    return {
      ...policy,
      continuation,
      opportunityEvaluations,
      summary,
      action: {
        kind: 'wait',
        band: 'profit',
        reason: 'single-coin-bait-hold',
        target,
        reward: 1,
        staminaCost: 1,
        singleCoinBait: summary
      }
    };
  }

  const coinMaxDistance = Math.max(0, Number(options.coinMaxDistance || BROWSER_RUNTIME_DEFAULTS.coinMaxDistance));
  const baitCost = opportunityCoinStaminaCost(evaluationCoin, options);
  const baitThresholdEligible = profitRewardAndCostEligible(1, baitCost, opportunity?.threshold);
  const plan = singleCoinBaitReturnPlan(
    input,
    opportunity,
    evaluationCoin,
    anchoredOpportunities,
    continuation,
    options
  );
  const closeCommitmentRadiusCm = Math.max(
    0,
    Number(options.singleCoinBaitHoldRadiusCm ?? BROWSER_RUNTIME_DEFAULTS.singleCoinBaitHoldRadiusCm ?? 1000)
      + Math.min(300, Math.max(0, Number(options.singleCoinBaitHoldHysteresisCm ?? 200)))
  );
  const closeCommitment = Number(evaluationState.distance || Infinity) <= closeCommitmentRadiusCm;
  const planAllowed = Boolean(plan?.allowed);
  const lifecycleActive = Boolean(policy.state && policy.coin);
  const allowed = lifecycleActive && (closeCommitment || baitThresholdEligible || planAllowed);
  const commitmentRank = closeCommitment || planAllowed ? 10 : 0;
  const commitmentReason = closeCommitment
    ? 'bait-nearby-commitment'
    : (planAllowed ? 'bait-combination-plan-wins' : (baitThresholdEligible ? 'bait-self-threshold-eligible' : ''));
  const releaseReason = policy.phase === 'release'
    ? (policy.otherOpportunity ? 'other-profit-trigger-visible' : 'release-trigger-cleared')
    : '';
  const enrichedSummary = {
    ...summary,
    baitPlanReward: plan ? Number(plan.reward || 0) : null,
    baitPlanStaminaCost: plan ? Math.round(Number(plan.staminaCost || 0)) : null,
    baitPlanNetROI: plan ? Number(Number(plan.netROI || 0).toFixed(8)) : null,
    planThresholdEligible: plan ? Boolean(plan.planThresholdEligible) : null,
    planThresholdFloor: plan ? Number(Number(plan.thresholdFloor || 0).toFixed(8)) : null,
    planRequiredNetROI: plan ? Number(Number(plan.requiredNetROI || 0).toFixed(8)) : null,
    evaluationOrigin: cloneJson(plan?.evaluationOrigin || continuation?.evaluationOrigin || {
      id: evaluationCoin.drop_id ?? evaluationCoin.id ?? profitCoinKey(evaluationCoin),
      x: numberOrNull(evaluationCoin.x),
      y: numberOrNull(evaluationCoin.y)
    }),
    commitmentReason,
    closeCommitmentRadiusCm,
    releaseReason,
    clearReason: policy.clearReason || '',
    profitThresholdEligible: baitThresholdEligible,
    returnEligible: allowed,
    returnSuppressionReason: allowed ? '' : (plan?.suppressionReason || 'bait-below-profit-threshold')
  };
  if (stateful.singleCoinBait) {
    stateful.singleCoinBait = {
      ...stateful.singleCoinBait,
      commitmentReason,
      releaseReason,
      lastEvaluation: {
        baitPlanReward: enrichedSummary.baitPlanReward,
        baitPlanStaminaCost: enrichedSummary.baitPlanStaminaCost,
        baitPlanNetROI: enrichedSummary.baitPlanNetROI,
        planThresholdEligible: enrichedSummary.planThresholdEligible,
        planThresholdFloor: enrichedSummary.planThresholdFloor,
        planRequiredNetROI: enrichedSummary.planRequiredNetROI,
        evaluationOrigin: enrichedSummary.evaluationOrigin,
        closeCommitmentRadiusCm,
        profitThresholdEligible: baitThresholdEligible,
        returnEligible: allowed,
        suppressionReason: enrichedSummary.returnSuppressionReason
      }
    };
  }
  if (!allowed) {
    return {
      ...policy,
      continuation,
      opportunityEvaluations,
      plan,
      commitmentRank: 0,
      summary: enrichedSummary,
      action: null
    };
  }
  const actionKind = Number(evaluationCoin.distance || Infinity) <= coinMaxDistance ? 'coin' : 'seek-coin';
  const planReward = planAllowed ? Number(plan.reward || 1) : 1;
  const planStaminaCost = planAllowed ? Number(plan.staminaCost || baitCost) : baitCost;
  return {
    ...policy,
    continuation,
    opportunityEvaluations,
    plan,
    commitmentRank,
    summary: enrichedSummary,
    action: {
      kind: actionKind,
      band: 'profit',
      reason: policy.phase === 'release' ? 'single-coin-bait-release' : 'single-coin-bait-return',
      target,
      reward: planReward,
      staminaCost: planStaminaCost,
      netROI: planReward / Math.max(1, planStaminaCost),
      baitPlanReward: enrichedSummary.baitPlanReward,
      baitPlanStaminaCost: enrichedSummary.baitPlanStaminaCost,
      baitPlanNetROI: enrichedSummary.baitPlanNetROI,
      evaluationOrigin: enrichedSummary.evaluationOrigin,
      commitmentReason,
      singleCoinBait: enrichedSummary
    }
  };
}

function clearIgnoredSingleCoinBait(action, stateful = {}, options = {}) {
  const bait = stateful.singleCoinBait || null;
  if (!bait || !action?.ignoredCoin) return { action, cleared: false };
  const ignoredKey = String(action.ignoredCoin.id || '');
  const baitKey = String(bait.key || coinDecisionKey(bait));
  const targetMatches = singleCoinBaitMatchesCore(action.target, bait, {
    sameCoinRadiusCm: options.singleCoinBaitSameCoinRadiusCm ?? BROWSER_RUNTIME_DEFAULTS.singleCoinBaitSameCoinRadiusCm
  });
  if (!(ignoredKey && baitKey && ignoredKey === baitKey) && !targetMatches) {
    return { action, cleared: false };
  }
  clearSingleCoinBaitTracking(stateful, bait, { clearFinalAction: true });
  stateful.singleCoinBait = null;
  const cleanedAction = { ...action };
  delete cleanedAction.singleCoinBait;
  return { action: cleanedAction, cleared: true };
}

function coinIgnoredUntil(stateful = {}, coin) {
  const key = coinDecisionKey(coin);
  if (!key) return 0;
  return Number(stateful.ignoredCoins?.[key] || 0);
}

function cleanupCoinProgressState(stateful = {}, nowMs = 0, options = {}) {
  const t = Number(nowMs) || 0;
  stateful.coinProgress = stateful.coinProgress && typeof stateful.coinProgress === 'object' ? stateful.coinProgress : {};
  stateful.coinAttempts = stateful.coinAttempts && typeof stateful.coinAttempts === 'object' ? stateful.coinAttempts : {};
  stateful.coinFailures = stateful.coinFailures && typeof stateful.coinFailures === 'object' ? stateful.coinFailures : {};
  stateful.ignoredCoins = stateful.ignoredCoins && typeof stateful.ignoredCoins === 'object' ? stateful.ignoredCoins : {};
  const progressOptions = coinProgressCoreOptions(options);
  for (const [id, until] of Object.entries(stateful.ignoredCoins)) {
    if (Number(until || 0) <= t) delete stateful.ignoredCoins[id];
  }
  for (const [id, attempt] of Object.entries(stateful.coinAttempts)) {
    if (coinAttemptExpiredCore(attempt, t, progressOptions)) delete stateful.coinAttempts[id];
  }
}

function filterIgnoredCoins(coins = [], stateful = {}, nowMs = 0) {
  const t = Number(nowMs) || 0;
  return (coins || []).filter(coin => {
    const until = coinIgnoredUntil(stateful, coin);
    return !(until && until > t);
  });
}

function applyIgnoredCoinFilter(input, stateful = {}) {
  if (!input) return input;
  input.realtimeCoins = filterIgnoredCoins(input.realtimeCoins, stateful, input.nowMs);
  input.snapshotCoins = filterIgnoredCoins(input.snapshotCoins, stateful, input.nowMs);
  input.selfKilledPlayerDropCoins = filterIgnoredCoins(input.selfKilledPlayerDropCoins, stateful, input.nowMs);
  input.panelProfitCoins = filterIgnoredCoins(input.panelProfitCoins, stateful, input.nowMs);
  input.profitCoins = filterIgnoredCoins(input.profitCoins, stateful, input.nowMs);
  return input;
}

function clearIgnoredCoinDecisionState(stateful = {}, progressId = '') {
  const cleanup = coinIgnoreCleanupIntentCore(stateful.lastTarget, stateful.coinApproachLock, progressId);
  if (cleanup.clearLastTarget) {
    stateful.lastTarget = null;
    stateful.lastTargetAt = 0;
  }
  if (cleanup.clearCoinApproachLock) stateful.coinApproachLock = null;
  const choiceCoin = stateful.opportunityChoice?.type === 'coin' ? stateful.opportunityChoice : null;
  const choiceKey = coinDecisionKey(choiceCoin?.sourceCoin || choiceCoin);
  if (choiceKey && choiceKey === progressId) {
    stateful.opportunityChoice = null;
    stateful.opportunitySwitchLock = null;
  }
}

function clearActiveCoinCompetitionDecisionState(input, stateful = {}) {
  const contestedKeys = new Set((input?.activeCoinCompetition?.contested || [])
    .map(item => String(item?.coinKey || ''))
    .filter(Boolean));
  if (!contestedKeys.size) return;
  for (const key of contestedKeys) clearIgnoredCoinDecisionState(stateful, key);
  const arbitration = stateful.finalActionArbitration;
  const previousCoinKey = coinDecisionKey(arbitration?.lastAction?.target);
  if (previousCoinKey && contestedKeys.has(previousCoinKey)) {
    arbitration.lastAction = null;
    arbitration.lastFocus = null;
    arbitration.lastSelectedAt = 0;
  }
}

function progressActionForCoin(action, progressId) {
  return {
    ...action,
    target: {
      ...(action.target || {}),
      id: progressId
    }
  };
}

function buildIgnoredCoinAction(action, progressId, distance, source, failure, escape, nowMs, reason, includeAges = false) {
  const ignored = buildIgnoredCoinPatrolActionCore(
    progressActionForCoin(action, progressId),
    progressId,
    distance,
    source,
    failure,
    escape,
    nowMs,
    reason,
    includeAges
  );
  return {
    ...ignored,
    band: 'profit',
    target: action.target
  };
}

function applyCoinProgressToAction(action, input, stateful = {}, options = {}) {
  cleanupCoinProgressState(stateful, input?.nowMs, options);
  const progressAt = Number(input?.nowMs) || Date.now();
  const progressOptions = coinProgressCoreOptions(options);
  if (!coinProgressIntentCore(action)) {
    if (!stateful.staleCoinEscape || progressAt >= Number(stateful.staleCoinEscape.until || 0)) {
      stateful.coinApproachLock = null;
    }
    return action;
  }
  const progressId = coinDecisionKey(action.target);
  if (!progressId) return action;
  const progressAction = progressActionForCoin(action, progressId);
  const attemptResult = updateCoinAttemptCore(stateful.coinAttempts[progressId], progressAction, progressAt, progressOptions);
  const progressDistance = attemptResult.distance;
  const attemptRecord = attemptResult.attempt;
  stateful.coinAttempts[progressId] = attemptRecord;

  if (attemptResult.closeStuck || attemptResult.nearStuck) {
    const reason = attemptResult.closeStuck ? 'close' : 'near';
    const failureResult = coinFailureIgnoreCore(stateful.coinFailures[progressId] || {}, reason, progressAt, progressOptions);
    stateful.coinFailures[progressId] = {
      count: failureResult.count,
      reason: failureResult.reason,
      lastAt: failureResult.lastAt,
      ignoreUntil: failureResult.ignoreUntil
    };
    stateful.ignoredCoins[progressId] = failureResult.ignoreUntil;
    delete stateful.coinAttempts[progressId];
    stateful.coinProgress[progressId] = buildIgnoredCoinProgressCore(
      progressId,
      attemptRecord,
      progressDistance,
      progressAt,
      failureResult.ignoreUntil,
      'stuck'
    );
    clearIgnoredCoinDecisionState(stateful, progressId);
    const escapeResult = staleCoinEscapeDirectionCore(progressAction, input?.self, progressAt, progressOptions);
    stateful.staleCoinEscape = escapeResult.state;
    return buildIgnoredCoinAction(
      action,
      progressId,
      progressDistance,
      attemptRecord,
      { count: failureResult.count, ignoreMs: failureResult.ignoreMs, ignoreUntil: failureResult.ignoreUntil },
      { dx: escapeResult.dx, dy: escapeResult.dy },
      progressAt,
      attemptResult.closeStuck ? 'ignore-close-stale-coin' : 'ignore-near-stale-coin',
      true
    );
  }

  const previousProgress = stateful.coinProgress[progressId] || null;
  const progressResult = updateCoinProgressRecordCore(previousProgress, attemptRecord, progressDistance, progressAt, progressOptions);
  stateful.coinProgress[progressId] = progressResult.progress;
  if (!progressResult.stale) return action;

  const failureResult = coinFailureIgnoreCore(stateful.coinFailures[progressId] || {}, 'progress', progressAt, progressOptions);
  stateful.coinFailures[progressId] = {
    count: failureResult.count,
    reason: failureResult.reason,
    lastAt: failureResult.lastAt,
    ignoreUntil: failureResult.ignoreUntil
  };
  stateful.ignoredCoins[progressId] = failureResult.ignoreUntil;
  delete stateful.coinAttempts[progressId];
  stateful.coinProgress[progressId] = buildIgnoredCoinProgressCore(
    progressId,
    stateful.coinProgress[progressId],
    progressDistance,
    progressAt,
    failureResult.ignoreUntil,
    'progress'
  );
  clearIgnoredCoinDecisionState(stateful, progressId);
  const escapeResult = staleCoinEscapeDirectionCore(progressAction, input?.self, progressAt, progressOptions);
  stateful.staleCoinEscape = escapeResult.state;
  return buildIgnoredCoinAction(
    action,
    progressId,
    progressDistance,
    previousProgress,
    { count: failureResult.count, ignoreMs: failureResult.ignoreMs, ignoreUntil: failureResult.ignoreUntil },
    { dx: escapeResult.dx, dy: escapeResult.dy },
    progressAt,
    'ignore-stale-coin-no-progress'
  );
}

function applyStaleCoinEscape(action, stateful = {}, nowMs = 0) {
  const escape = stateful.staleCoinEscape || null;
  const t = Number(nowMs) || 0;
  const escapeActive = escape && t < Number(escape.until || 0) && (escape.dx || escape.dy);
  if (!escapeActive) {
    stateful.staleCoinEscape = null;
    return action;
  }
  if (action?.kind === 'flee' || action?.reason === 'single-coin-bait-hold') return action;
  return {
    ...action,
    kind: 'patrol',
    band: action?.band || 'profit',
    reason: action?.reason && String(action.reason).startsWith('ignore-') ? action.reason : 'leave-stale-coin',
    dx: escape.dx,
    dy: escape.dy,
    target: null,
    immediate: true,
    staleCoinEscape: {
      id: escape.id,
      remainingMs: Math.max(0, Math.round(Number(escape.until || 0) - t))
    }
  };
}

function ensureFinalActionArbitrationState(stateful = {}) {
  if (!stateful.finalActionArbitration || typeof stateful.finalActionArbitration !== 'object') {
    stateful.finalActionArbitration = {
      lastAction: null,
      lastFocus: null,
      lastSelectedAt: 0,
      lastOverride: null,
      history: []
    };
  }
  if (!Array.isArray(stateful.finalActionArbitration.history)) stateful.finalActionArbitration.history = [];
  return stateful.finalActionArbitration;
}

function ensureTargetSwitchDiagnosticsState(stateful = {}) {
  if (!stateful.targetSwitchDiagnostics || typeof stateful.targetSwitchDiagnostics !== 'object' || Array.isArray(stateful.targetSwitchDiagnostics)) {
    stateful.targetSwitchDiagnostics = {
      lastFocus: null,
      lastTargetFocus: null,
      lastSwitch: null,
      events: []
    };
  }
  if (!Array.isArray(stateful.targetSwitchDiagnostics.events)) stateful.targetSwitchDiagnostics.events = [];
  return stateful.targetSwitchDiagnostics;
}

function finalActionArbitrationHoldMs(options = {}) {
  return Math.max(0, Math.round(Number(options.finalActionArbitrationHoldMs ?? BROWSER_RUNTIME_DEFAULTS.finalActionArbitrationHoldMs ?? 0) || 0));
}

function finalActionArbitrationHistoryLimit(options = {}) {
  return Math.max(4, Math.round(Number(options.finalActionArbitrationHistoryLimit ?? BROWSER_RUNTIME_DEFAULTS.finalActionArbitrationHistoryLimit ?? 24) || 24));
}

function actionTargetCurrentValidity(action, input = {}) {
  const target = action?.target || null;
  if (!target) return { valid: false, reason: 'previous-target-missing' };
  const playerId = target.userId ?? target.user_id;
  if (playerId !== undefined && playerId !== null && playerId !== '') {
    const current = (input.visibleTargets || []).find(item => String(
      item.userId ?? item.user_id ?? item.id ?? ''
    ) === String(playerId));
    if (!current) return { valid: false, reason: 'player-disappeared' };
    const hp = Number(current.hp ?? current.knownHp);
    if (current.alive === false || current.dead === true || (Number.isFinite(hp) && hp <= 0)) {
      return { valid: false, reason: 'player-dead' };
    }
    const invulnerableMs = Number(current.invulnerableRemainingMs ?? current.invulnerable_remaining_ms);
    if (current.invulnerable === true || (Number.isFinite(invulnerableMs) && invulnerableMs > 0)) {
      return { valid: false, reason: 'player-invulnerable' };
    }
    return { valid: true, reason: 'player-visible' };
  }

  const targetId = target.id ?? target.drop_id ?? target.dropId ?? target.coinId ?? target.coin_id;
  if (targetId === undefined || targetId === null || targetId === '') {
    return { valid: false, reason: 'previous-target-identity-missing' };
  }
  const current = mergeProfitCoinCandidates([
    ...(input.realtimeObservedCoins || []),
    ...(input.snapshotVisibleCoins || [])
  ]).find(item => String(item.id ?? item.drop_id ?? item.dropId ?? item.coinId ?? item.coin_id ?? '') === String(targetId));
  if (!current || !(Number(current.amount || 0) > 0)) return { valid: false, reason: 'coin-disappeared' };
  return { valid: true, reason: 'coin-visible' };
}

function normalizedProfitOpportunityKey(value, action = null) {
  if (!value && !action) return '';
  const type = String(value?.type || '').toLowerCase();
  const target = value?.sourceTarget || value?.target || action?.target || value || {};
  const enemyAction = type === 'enemy'
    || ['attack', 'seek-enemy', 'opportunistic-shot'].includes(String(action?.kind || ''))
    || target.userId !== undefined
    || target.user_id !== undefined;
  if (enemyAction) {
    const id = value?.id ?? target.userId ?? target.user_id ?? target.id;
    return id === null || id === undefined || id === '' ? '' : `enemy:${String(id)}`;
  }
  const coin = value?.sourceCoin || target;
  const id = value?.id ?? coin.drop_id ?? coin.dropId ?? coin.coinId ?? coin.coin_id ?? coin.id;
  return id === null || id === undefined || id === '' ? '' : `coin:${String(id)}`;
}

function currentProfitThresholdEligibility(action, opportunity = {}) {
  const key = normalizedProfitOpportunityKey(null, action);
  if (!key) return null;
  const current = (opportunity.rawOpportunities || []).find(item => normalizedProfitOpportunityKey(item) === key);
  if (!current || (current.profitThresholdEligible !== true && current.profitThresholdEligible !== false)) return null;
  return {
    key,
    eligible: current.profitThresholdEligible === true,
    reason: String(current.profitThresholdReason || (current.profitThresholdEligible === false
      ? 'below-profit-threshold'
      : 'eligible'))
  };
}

function annotateYieldableProfitDropout(action, arbitration, input = {}, opportunity = {}) {
  const dropout = profitDropoutMetadata(action);
  if (!dropout) return action;
  const previousAction = arbitration?.lastAction || null;
  const targetValidity = actionTargetCurrentValidity(previousAction, input);
  const currentEligibility = currentProfitThresholdEligibility(previousAction, opportunity);
  return {
    ...action,
    profitDropout: {
      ...(action.profitDropout || {}),
      kind: dropout.kind,
      yieldable: true,
      targetValid: targetValidity.valid,
      targetValidity: targetValidity.reason,
      targetKey: arbitration?.lastFocus?.targetKey || '',
      thresholdViolation: currentEligibility?.eligible === false
    }
  };
}

function annotateProfitActionThreshold(action, thresholdContext, options = {}) {
  if (!action || !thresholdContext?.active || String(action.band || '') !== 'profit') return action;
  if (action.kind === 'post-attack-drop-wait' || action.reason === 'post-attack-drop-wait') {
    return { ...action, profitThresholdEligible: true, profitThresholdReason: 'wait-exempt' };
  }
  const target = action.target || action.opportunisticShot || {};
  const enemyAction = action.kind === 'attack' || action.kind === 'seek-enemy' || action.kind === 'opportunistic-shot';
  const reward = Number.isFinite(Number(action.reward))
    && action.reason !== 'migrate-to-known-field'
    ? Number(action.reward)
    : Number(enemyAction
      ? entityDropValue(target)
      : (action.reason === 'migrate-to-known-field'
          ? target.amount
          : (target.coinRoute?.value ?? target.fieldAmount ?? target.amount)));
  const staminaCost = Number.isFinite(Number(action.staminaCost))
    ? Number(action.staminaCost)
    : (enemyAction ? opportunityEnemyStaminaCost(target, options) : opportunityCoinStaminaCost(target, options));
  const eligible = profitTargetEligibleCore(reward, staminaCost, thresholdContext.threshold);
  return {
    ...action,
    reward: Number.isFinite(reward) ? reward : null,
    staminaCost: Number.isFinite(staminaCost) ? staminaCost : null,
    profitThresholdEligible: eligible,
    profitThresholdReason: eligible ? 'eligible' : 'below-profit-threshold'
  };
}

function clearIneligibleFinalProfitHold(stateful = {}, thresholdContext, opportunity = {}) {
  if (!thresholdContext?.active) return;
  const arbitration = ensureFinalActionArbitrationState(stateful);
  const previous = arbitration.lastAction || null;
  if (previous?.band !== 'profit') return;
  const currentEligibility = currentProfitThresholdEligibility(previous, opportunity);
  if (currentEligibility?.eligible === false) {
    arbitration.lastAction = {
      ...previous,
      profitThresholdEligible: false,
      profitThresholdReason: currentEligibility.reason,
      currentProfitThresholdKey: currentEligibility.key
    };
  }
}

function targetSwitchDiagnosticsHistoryLimit(options = {}) {
  return Math.max(4, Math.round(Number(options.targetSwitchDiagnosticsHistoryLimit ?? BROWSER_RUNTIME_DEFAULTS.targetSwitchDiagnosticsHistoryLimit ?? 24) || 24));
}

function targetSwitchOscillationWindowMs(options = {}) {
  return Math.max(1000, Math.round(Number(options.targetSwitchOscillationWindowMs ?? BROWSER_RUNTIME_DEFAULTS.targetSwitchOscillationWindowMs ?? 10000) || 10000));
}

function applyBrowserlessFinalActionArbitration(action, stateful = {}, input = {}, options = {}, opportunity = {}) {
  const arbitration = ensureFinalActionArbitrationState(stateful);
  const rememberedThreatCount = Object.keys(stateful.recentInvulnerableThreats || {}).length;
  if (arbitration.lastAction?.target?.safetyMemoryOnly && rememberedThreatCount === 0) {
    arbitration.lastAction = null;
    arbitration.lastFocus = null;
    arbitration.lastSelectedAt = 0;
  }
  const annotatedAction = annotateYieldableProfitDropout(action, arbitration, input, opportunity);
  return applyFinalActionArbitrationCore(annotatedAction, arbitration, {
    nowMs: input?.nowMs,
    source: options.controlMode || 'browserless',
    holdMs: finalActionArbitrationHoldMs(options),
    profitSwitchRoiRatio: options.profitSwitchRoiRatio ?? 1,
    profitSwitchRoiTolerance: options.profitSwitchRoiTolerance ?? 1e-9,
    historyLimit: finalActionArbitrationHistoryLimit(options),
    clone: cloneJson
  }).action;
}

function recordBrowserlessActionSwitchDiagnostics(action, stateful = {}, input = {}, options = {}) {
  return recordActionSwitchDiagnosticsCore(action, ensureTargetSwitchDiagnosticsState(stateful), {
    nowMs: input?.nowMs,
    tickCount: input?.realtime?.tick ?? input?.tick,
    source: options.controlMode || 'browserless',
    previousDecision: stateful.lastDecisionAction || null,
    historyLimit: targetSwitchDiagnosticsHistoryLimit(options),
    oscillationWindowMs: targetSwitchOscillationWindowMs(options),
    clone: cloneJson
  }).action;
}

function safeBudgetCoinCandidates(input, options = {}) {
  if (!input?.self) return [];
  return (input.profitCoins || [])
    .filter(coin => Number(coin?.amount || 0) > 0)
    .filter(coin => coinSafeFromThreats(coin, [
      ...(input.avoidanceThreats || input.activeThreats || []),
      ...(input.snapshotActiveThreats || [])
    ], options));
}

function buildStaminaBudgetExitDecision(input, options = {}) {
  if (!input?.self) return null;
  const coins = safeBudgetCoinCandidates(input, options);
  const exit = summarizeNearestCoinStaminaBudgetExitCore(input.self, coins, {
    budget: opportunityWindowStaminaBudget(input.self, '1h', options),
    dist: distanceBetween,
    coinStaminaCost: coin => opportunityCoinStaminaCost(coin, options),
    reloginDelayMs: staminaBudgetReloginDelayMs(options)
  });
  if (!exit) return null;
  return {
    kind: 'leave',
    band: 'safety',
    reason: 'stamina-budget-coin-leave',
    shouldLeave: true,
    stopMotion: true,
    staminaBudgetExit: exit,
    reloginDelayMs: exit.reloginDelayMs ?? staminaBudgetReloginDelayMs(options),
    self: summarizeTarget(input.self)
  };
}

function buildEligibleProfitStaminaBudgetExitDecision(input, options = {}) {
  if (!input?.self) return null;
  const oneHourBudget = opportunityWindowStaminaBudget(input.self, '1h', options);
  const blocked = summarizeBlockedStaminaOpportunityCore(
    safeBudgetCoinCandidates(input, options),
    input.afkTargets || [],
    {
      budget: oneHourBudget,
      coinStaminaCost: coin => opportunityCoinStaminaCost(coin, options),
      enemyStaminaCost: target => opportunityEnemyStaminaCost(target, options),
      targetDrop: entityDropValue
    }
  );
  if (!blocked) return null;
  const exit = {
    ...blocked,
    window: '1h',
    reloginDelayMs: staminaBudgetReloginDelayMs(options)
  };
  return {
    kind: 'leave',
    band: 'safety',
    reason: 'stamina-budget-coin-leave',
    shouldLeave: true,
    stopMotion: true,
    staminaBudgetExit: exit,
    reloginDelayMs: exit.reloginDelayMs,
    self: summarizeTarget(input.self)
  };
}

function buildLongStaminaExhaustedLeaveDecision(input, options = {}) {
  if (!input?.self) return null;
  const thresholdMs = staminaExhaustedThreshold(options);
  const remaining = {
    '1h': staminaRemaining(input.self, '1h'),
    '1d': staminaRemaining(input.self, '1d')
  };
  const exhausted = Object.entries(remaining)
    .filter(([, value]) => value !== null && value < thresholdMs)
    .map(([key]) => key);
  if (!exhausted.length) return null;

  const nowMs = Number.isFinite(Number(input.nowMs)) ? Number(input.nowMs) : Date.now();
  const resetAt = exhausted.includes('1d') ? nextDailyStaminaResetAt(nowMs) : 0;
  const fixedDelayMs = exhausted.includes('1h') ? staminaBudgetReloginDelayMs(options) : 0;
  const resetDelayMs = resetAt ? Math.max(0, resetAt + staminaResetGraceMs(options) - nowMs) : 0;
  const reloginDelayMs = Math.max(fixedDelayMs, resetDelayMs, 1000);
  return {
    kind: 'leave',
    band: 'safety',
    reason: 'stamina-exhausted-leave',
    shouldLeave: true,
    stopMotion: true,
    reloginDelayMs,
    staminaExhausted: {
      exhausted,
      thresholdMs,
      remaining1h: remaining['1h'],
      remaining1d: remaining['1d'],
      resetAt,
      fixedDelayMs,
      reloginDelayMs
    },
    self: summarizeTarget(input.self)
  };
}

function buildDailyStaminaFinalCoinDecision(input, options = {}) {
  if (!input?.self) return null;
  const coin = pickNearestDailyStaminaFinalCoinCore(safeBudgetCoinCandidates(input, options), {
    // A guarded snapshot fallback is already admitted only when no realtime
    // profit is visible. Near daily exhaustion it is safer to keep moving to
    // that normal fallback than to wait in-game solely because the 1d budget
    // cannot cover the full route.
    isSnapshotOnlyCoin: item => Boolean(item?.snapshotOnly && !input?.fallback?.snapshotCoinFallbackAllowed),
    coinStaminaCost: item => opportunityCoinStaminaCost(item, options),
    dailyStaminaBudgetIsLimiting: staminaCost => dailyStaminaBudgetIsLimitingCore(
      staminaCost,
      opportunityWindowStaminaBudget(input.self, '1h', options),
      opportunityWindowStaminaBudget(input.self, '1d', options)
    )
  });
  if (!coin) return null;
  return {
    kind: Number(coin.distance || Infinity) <= Number(options.coinMaxDistance ?? BROWSER_RUNTIME_DEFAULTS.coinMaxDistance)
      ? 'coin'
      : 'seek-coin',
    band: 'profit',
    reason: 'daily-stamina-final-visible-coin',
    target: summarizeCoin(coin),
    dailyStaminaFinalRun: {
      staminaCost: Math.round(opportunityCoinStaminaCost(coin, options)),
      budgetMs: Math.max(0, Math.round(opportunityWindowStaminaBudget(input.self, '1d', options))),
      distance: Math.round(Number(coin.distance || 0)),
      amount: Math.max(0, Math.round(Number(coin.amount || 0)))
    }
  };
}

function buildStaminaBlockedWaitDecision(input, options = {}) {
  if (!input?.self) return null;
  const blocked = summarizeBlockedStaminaOpportunityCore(safeBudgetCoinCandidates(input, options), input.afkTargets || [], {
    budget: opportunityLongStaminaBudget(input.self, options),
    coinStaminaCost: coin => opportunityCoinStaminaCost(coin, options),
    enemyStaminaCost: target => opportunityEnemyStaminaCost(target, options),
    targetDrop: entityDropValue
  });
  if (!blocked) return null;
  return {
    kind: 'wait',
    band: 'wait',
    reason: 'wait-for-stamina-budget',
    staminaBlocked: blocked,
    stopMotion: true,
    self: summarizeTarget(input.self)
  };
}

function opportunityVisibleDistance(options = {}) {
  const value = Number(options.opportunityVisibleDistance
    ?? options.opportunityNearbyPriorityDistance
    ?? DEFAULT_OPPORTUNITY_VISIBLE_DISTANCE);
  return Number.isFinite(value) ? Math.max(0, value) : DEFAULT_OPPORTUNITY_VISIBLE_DISTANCE;
}

function opportunityNearbyPriorityDistance(options = {}) {
  const value = Number(options.opportunityNearbyPriorityDistance
    ?? options.opportunityVisibleDistance
    ?? DEFAULT_OPPORTUNITY_NEARBY_PRIORITY_DISTANCE);
  return Number.isFinite(value) ? Math.max(0, value) : DEFAULT_OPPORTUNITY_NEARBY_PRIORITY_DISTANCE;
}

function browserlessOpportunityPriorityTier(item, options = {}) {
  const base = opportunityPriorityTierCore(item, {
    visibleDistance: opportunityVisibleDistance(options),
    nearbyPriorityDistance: opportunityNearbyPriorityDistance(options)
  });
  if (String(item?.type || '') === 'coin' && profitCoinPriorityRank(item?.sourceCoin || item) > 0) return Math.max(base, 3);
  const distance = Number(item?.distance ?? Infinity);
  if (!Number.isFinite(distance) || distance > opportunityVisibleDistance(options)) return base;
  if (String(item?.type || '') === 'coin') {
    const amount = Number(item?.amount ?? item?.sourceCoin?.amount ?? 0);
    const highValueAmount = Math.max(1, Number(options.highValueCoinPriorityAmount || OPPORTUNITY_CONSTANTS.HIGH_VALUE_COIN_PRIORITY_AMOUNT));
    return amount >= highValueAmount && distance <= highValueCoinPriorityRange(options)
      ? Math.max(base, 2)
      : base;
  }
  if (String(item?.type || '') === 'enemy') {
    // Ordinary AFK profit competes with coins on ROI. A Drop threshold is an
    // eligibility gate, not permission to outrank a better coin unconditionally.
    return base;
  }
  return base;
}

function prioritizeBrowserlessOpportunities(opportunities, options = {}) {
  return (opportunities || []).map(item => ({
    ...item,
    priorityTier: browserlessOpportunityPriorityTier(item, options)
  }));
}

function nearestProfitCoinWithin(self, coins, activeThreats, maxDistance, options = {}) {
  if (!(Number(maxDistance) > 0)) return null;
  // `profitCoins` has already selected one usable authority. When realtime
  // coins are absent, fresh visible-range snapshot fallback is the active
  // profit source and must block a needless long-distance field migration.
  return (coins || [])
    .filter(coin => Number(coin?.amount || 0) > 0)
    .map(coin => ({ ...coin, distance: Number.isFinite(Number(coin.distance)) ? Number(coin.distance) : distanceBetween(self, coin) }))
    .filter(coin => Number.isFinite(Number(coin.distance)) && Number(coin.distance) <= Number(maxDistance))
    .filter(coin => coinSafeFromThreats(coin, activeThreats, options))
    .filter(coin => opportunityStaminaAffordable(self, opportunityCoinStaminaCost(coin, options), options))
    .sort((a, b) => Number(a.distance || Infinity) - Number(b.distance || Infinity)
      || Number(b.amount || 0) - Number(a.amount || 0))[0] || null;
}

function fieldMigrationBlockedByNearbyCoin(self, coins, activeThreats, fieldCoin = null, options = {}) {
  const blockDistance = Math.max(0, Number(options.fieldMigrationNearbyCoinBlockDistance ?? BROWSER_RUNTIME_DEFAULTS.fieldMigrationNearbyCoinBlockDistance));
  if (!(blockDistance > 0)) return false;
  const nearby = nearestProfitCoinWithin(self, coins, activeThreats, blockDistance, options);
  if (!nearby) return false;
  if (fieldCoin) {
    const nearbyId = nearby.drop_id ?? nearby.id;
    const fieldId = fieldCoin.drop_id ?? fieldCoin.id;
    if (nearbyId !== undefined && fieldId !== undefined && String(nearbyId) === String(fieldId)) return false;
    const nearbyDistance = Number(nearby.distance ?? distanceBetween(self, nearby));
    const fieldDistance = Number(fieldCoin.distance ?? distanceBetween(self, fieldCoin));
    if (Number.isFinite(nearbyDistance) && Number.isFinite(fieldDistance) && nearbyDistance >= fieldDistance) return false;
  }
  return true;
}

function pickFieldMigrationCoin(input, activeThreats, thresholdContext, options = {}) {
  const self = input?.self || null;
  if (!self) return null;
  const stamina5s = Number(input?.stamina?.stamina5sRemainingMilli ?? self.stamina_5s_remaining_milli ?? Infinity);
  const threshold = Math.max(0, Number(options.fieldMigrationStaminaThreshold ?? BROWSER_RUNTIME_DEFAULTS.fieldMigrationStaminaThreshold));
  if (Number.isFinite(stamina5s) && stamina5s < threshold) return null;
  const minDistance = Math.max(0, Number(options.fieldMigrationMinDistance ?? BROWSER_RUNTIME_DEFAULTS.fieldMigrationMinDistance));
  const maxDistance = Math.max(minDistance, Number(options.fieldMigrationMaxDistance ?? BROWSER_RUNTIME_DEFAULTS.fieldMigrationMaxDistance));
  const clusterRadius = Math.max(0, Number(options.fieldMigrationClusterRadius ?? BROWSER_RUNTIME_DEFAULTS.fieldMigrationClusterRadius));
  const minCoins = Math.max(1, Math.round(Number(options.fieldMigrationMinCoins ?? BROWSER_RUNTIME_DEFAULTS.fieldMigrationMinCoins)));
  const candidates = (input.profitCoins || [])
    .map(coin => ({ ...coin, distance: Number.isFinite(Number(coin.distance)) ? Number(coin.distance) : distanceBetween(self, coin), amount: Number(coin.amount || 0) }))
    .filter(coin => coin.amount > 0
      && Number.isFinite(Number(coin.distance))
      && coin.distance >= minDistance
      && coin.distance <= maxDistance)
    .filter(coin => coinSafeFromThreats(coin, activeThreats, options))
    .filter(coin => opportunityStaminaAffordable(self, opportunityCoinStaminaCost(coin, options), options))
    .filter(coin => profitCoinEligible(coin, thresholdContext, options));
  let best = null;
  for (const coin of candidates) {
    const members = candidates.filter(other => distanceBetween(coin, other) <= clusterRadius);
    if (members.length < minCoins) continue;
    const fieldRoute = buildCoinRouteFromAnchorCore(self, coin, members, activeThreats, {
      ...coinRouteCoreOptions(input, {}, options),
      clusterRadius
    });
    if (!fieldRoute) continue;
    // Compare the field using an actually collectable multi-coin route. The
    // old anchor-only cost credited the whole cluster while charging only the
    // trip to its first coin, which systematically overstated distant fields.
    const totalAmount = members.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const plannedAmount = Math.max(0, Number(fieldRoute.routeValue ?? fieldRoute.coinRoute?.value ?? 0));
    const plannedMembers = Math.max(0, Number(fieldRoute.routeLegs ?? fieldRoute.coinRoute?.legCount ?? 0));
    const staminaCost = Math.max(0, Number(fieldRoute.opportunityStaminaCost ?? fieldRoute.coinRoute?.staminaCost ?? 0));
    const score = Number(fieldRoute.opportunityScore);
    if (!(plannedAmount > 0) || plannedMembers < minCoins || !Number.isFinite(staminaCost) || !Number.isFinite(score)) continue;
    if (!best || score > Number(best.score || -Infinity)) {
      best = {
        ...coin,
        score,
        fieldScore: score,
        opportunityScore: score,
        opportunityStaminaCost: staminaCost,
        fieldMigration: true,
        fieldMembers: plannedMembers,
        fieldAmount: plannedAmount,
        fieldClusterMembers: members.length,
        fieldClusterAmount: totalAmount,
        fieldRoute: fieldRoute.coinRoute || null,
        members: plannedMembers,
        totalAmount: plannedAmount
      };
    }
  }
  if (best && fieldMigrationBlockedByNearbyCoin(self, input.profitCoins || [], activeThreats, best, options)) return null;
  return best;
}

function currentHeldCoinChoice(stateful = {}, nowMs = 0) {
  const choice = stateful.opportunityChoice || stateful.currentOpportunity || null;
  const t = Number(nowMs) || 0;
  if (!choice || String(choice.type || '') !== 'coin') return null;
  if (Number(choice.until || 0) && t >= Number(choice.until || 0)) return null;
  const id = choice.id ?? '';
  if (id === '') return null;
  return choice;
}

function currentHeldCoinRouteChoice(stateful = {}, nowMs = 0) {
  const choice = currentHeldCoinChoice(stateful, nowMs);
  if (!choice) return null;
  if (String(choice.reason || '') !== 'best-opportunity-coin-route'
    && !(Array.isArray(choice.coinRouteIds) && choice.coinRouteIds.length)) return null;
  return choice;
}

function coinRouteCoreOptions(input, stateful = {}, options = {}) {
  const self = input?.self || null;
  return {
    dist: distanceBetween,
    moveStaminaCost: distance => opportunityMoveStaminaCost(distance, options),
    pickupStaminaMs: options.opportunityCoinPickupStaminaMs ?? BROWSER_RUNTIME_DEFAULTS.opportunityCoinPickupStaminaMs,
    sampleDistance: options.coinRouteLegSampleDistance ?? BROWSER_RUNTIME_DEFAULTS.coinRouteLegSampleDistance,
    threatDangerRadius: threat => coinThreatDangerRadius(threat, options),
    coinBlockedByThreat: (origin, coin, threat) => coinBlockedByThreat(origin, coin, threat, options),
    clusterRadius: options.coinRouteClusterRadius ?? BROWSER_RUNTIME_DEFAULTS.coinRouteClusterRadius,
    maxPointsDense: options.coinRouteMaxPointsDense ?? BROWSER_RUNTIME_DEFAULTS.coinRouteMaxPointsDense,
    maxPointsMid: options.coinRouteMaxPointsMid ?? BROWSER_RUNTIME_DEFAULTS.coinRouteMaxPointsMid,
    maxPointsSparse: options.coinRouteMaxPointsSparse ?? BROWSER_RUNTIME_DEFAULTS.coinRouteMaxPointsSparse,
    linkDistance: options.coinRouteLinkDistance ?? BROWSER_RUNTIME_DEFAULTS.coinRouteLinkDistance,
    maxLinkDistance: options.coinRouteMaxLinkDistance ?? BROWSER_RUNTIME_DEFAULTS.coinRouteMaxLinkDistance,
    beamWidth: options.coinRouteBeamWidth ?? BROWSER_RUNTIME_DEFAULTS.coinRouteBeamWidth,
    coinOpportunityValue: options.coinOpportunityValue ?? BROWSER_RUNTIME_DEFAULTS.coinOpportunityValue,
    valueScore: (value, staminaCost, weight = options.coinOpportunityValue ?? BROWSER_RUNTIME_DEFAULTS.coinOpportunityValue) => opportunityValueScoreCore(value, staminaCost, {
      weight,
      distanceFloor: options.opportunityDistanceFloor ?? BROWSER_RUNTIME_DEFAULTS.opportunityDistanceFloor,
      distanceScoreScale: options.opportunityDistanceScoreScale ?? BROWSER_RUNTIME_DEFAULTS.opportunityDistanceScoreScale
    }),
    staminaAffordable: staminaCost => opportunityStaminaAffordable(self, staminaCost, options),
    nearbyFirstCoinDistance: options.coinRouteNearbyFirstCoinDistance ?? BROWSER_RUNTIME_DEFAULTS.coinRouteNearbyFirstCoinDistance,
    firstCoinDistanceRatio: options.coinRouteFirstCoinDistanceRatio ?? BROWSER_RUNTIME_DEFAULTS.coinRouteFirstCoinDistanceRatio,
    firstCoinDistanceSlack: options.coinRouteFirstCoinDistanceSlack ?? BROWSER_RUNTIME_DEFAULTS.coinRouteFirstCoinDistanceSlack,
    firstRoutePointDistanceRatio: options.coinRouteFirstRoutePointDistanceRatio ?? BROWSER_RUNTIME_DEFAULTS.coinRouteFirstRoutePointDistanceRatio,
    firstRoutePointDistanceSlack: options.coinRouteFirstRoutePointDistanceSlack ?? BROWSER_RUNTIME_DEFAULTS.coinRouteFirstRoutePointDistanceSlack,
    firstRoutePointCosMin: options.coinRouteFirstRoutePointCosMin ?? BROWSER_RUNTIME_DEFAULTS.coinRouteFirstRoutePointCosMin,
    firstRoutePointLaneRadius: options.coinRouteFirstRoutePointLaneRadius ?? BROWSER_RUNTIME_DEFAULTS.coinRouteFirstRoutePointLaneRadius,
    firstRouteDistanceRatio: options.coinRouteFirstRouteDistanceRatio ?? BROWSER_RUNTIME_DEFAULTS.coinRouteFirstRouteDistanceRatio,
    firstRouteDistanceSlack: options.coinRouteFirstRouteDistanceSlack ?? BROWSER_RUNTIME_DEFAULTS.coinRouteFirstRouteDistanceSlack,
    choiceType: choice => String(choice?.type || ''),
    choiceId: choice => String(choice?.id ?? ''),
    heldMinOverlap: options.coinRouteHeldMinOverlap ?? BROWSER_RUNTIME_DEFAULTS.coinRouteHeldMinOverlap,
    switchMargin: options.coinRouteSwitchMargin ?? BROWSER_RUNTIME_DEFAULTS.coinRouteSwitchMargin,
    opportunitySwitchMargin: options.opportunitySwitchMargin ?? OPPORTUNITY_CONSTANTS.OPPORTUNITY_SWITCH_MARGIN,
    switchRelativeMargin: options.coinRouteSwitchRelativeMargin ?? BROWSER_RUNTIME_DEFAULTS.coinRouteSwitchRelativeMargin,
    opportunitySwitchRelativeMargin: options.opportunitySwitchRelativeMargin ?? BROWSER_RUNTIME_DEFAULTS.opportunitySwitchRelativeMargin,
    maxDistance: Math.max(0, Number(options.coinRouteMaxDistance ?? options.globalCoinMaxDistance ?? BROWSER_RUNTIME_DEFAULTS.coinRouteMaxDistance)),
    poolLimit: options.coinRoutePoolLimit ?? BROWSER_RUNTIME_DEFAULTS.coinRoutePoolLimit,
    anchorLimit: options.coinRouteAnchorLimit ?? BROWSER_RUNTIME_DEFAULTS.coinRouteAnchorLimit,
    safeCoinCandidates: (coins, routeThreats, maxDistance, routeSelf = self) => (coins || [])
      .filter(coin => {
        const limit = Number(maxDistance);
        if (Number.isFinite(limit) && limit > 0 && Number(coin?.distance) > limit) return false;
        return true;
      })
      .filter(coin => coinSafeFromThreats(coin, routeThreats, options))
      .filter(coin => opportunityStaminaAffordable(routeSelf, opportunityCoinStaminaCost(coin, options), options)),
    isSnapshotOnlyCoin: coin => Boolean(coin?.snapshotOnly && input?.profitCoinSource !== 'snapshot-fallback'),
    heldChoice: currentHeldCoinChoice(stateful, input?.nowMs),
    heldRouteChoice: currentHeldCoinRouteChoice(stateful, input?.nowMs)
  };
}

function controlledExplorationConfig(options = {}) {
  return {
    maxAcceptedShots: Math.max(1, Number(options.activeProfitExplorationMaxAcceptedShots ?? 10)),
    maxDurationMs: Math.max(1000, Number(options.activeProfitExplorationMaxDurationMs ?? 8000)),
    maxStaminaMs: Math.max(500, Number(options.activeProfitExplorationMaxStaminaMs ?? 5000)),
    qualifyingFrames: Math.max(1, Number(options.activeProfitExplorationQualifyingFrames ?? 3)),
    missingHoldMs: Math.max(250, Number(options.activeProfitExplorationMissingHoldMs ?? 1800)),
    shotStaminaMs: Math.max(0, Number(options.opportunityShotStaminaCostMs ?? 500)),
    moveStaminaPerCm: Math.max(0, Number(options.opportunityMoveStaminaPerCm
      ?? BROWSER_RUNTIME_DEFAULTS.opportunityMoveStaminaPerCm
      ?? 1)),
    attackRange: Math.max(0, Number(options.attackRange || DEFAULT_ATTACK_RANGE))
  };
}

function explorationTargetIdFromAction(action) {
  if (!action || action.explorationAdmitted !== true) return '';
  return targetKey(action.target);
}

function recordControlledExplorationEvent(stateful, session, type, nowMs, detail = {}) {
  if (!stateful || !session || !type) return null;
  const event = {
    type,
    sessionId: String(session.sessionId || ''),
    targetId: String(session.targetId || ''),
    targetName: session.targetName || '',
    at: nowMs,
    ...detail
  };
  stateful.explorationLifecycleEvents = [
    ...(Array.isArray(stateful.explorationLifecycleEvents) ? stateful.explorationLifecycleEvents : []),
    event
  ].slice(-32);
  return event;
}

function finishControlledExplorationSession(stateful, targetId, reason, nowMs) {
  const sessions = stateful.explorationSessions || {};
  const session = sessions[targetId];
  if (!session) return null;
  const finished = {
    ...session,
    active: false,
    endedAt: nowMs,
    durationMs: Math.max(0, nowMs - Number(session.sessionStartedAt || nowMs)),
    terminationReason: reason || 'ended'
  };
  recordControlledExplorationEvent(stateful, finished, 'terminated', nowMs, {
    terminationReason: finished.terminationReason,
    durationMs: finished.durationMs,
    acceptedShots: Number(finished.acceptedShots || 0)
  });
  recordControlledExplorationEvent(stateful, finished, 'settled', nowMs, {
    terminationReason: finished.terminationReason,
    actualApproachSpent: Math.round(Number(finished.approachSpent || 0)),
    actualShootingSpent: Math.round(Number(finished.shootingSpent || 0)),
    actualTotalSpent: Math.round(Number(finished.totalSpent || 0)),
    estimatedApproachSpent: Math.round(Number(finished.estimatedApproachSpent || 0)),
    remainingBudget: Math.max(0, Math.round(Number(finished.remainingBudget || 0)))
  });
  delete sessions[targetId];
  if (stateful.explorationCandidates) delete stateful.explorationCandidates[targetId];
  stateful.explorationTerminations = stateful.explorationTerminations && typeof stateful.explorationTerminations === 'object'
    ? stateful.explorationTerminations
    : {};
  stateful.explorationTerminations[targetId] = {
    targetId,
    targetEntityId: session.targetEntityId ?? null,
    endedAt: nowMs,
    lastSeenAt: Number(session.lastSeenAt || nowMs),
    reason: reason || 'ended'
  };
  stateful.explorationHistory = [
    ...(Array.isArray(stateful.explorationHistory) ? stateful.explorationHistory : []),
    finished
  ].slice(-12);
  return finished;
}

function reconcileControlledExplorationSessions(input, stateful = {}, options = {}) {
  const config = controlledExplorationConfig(options);
  const nowMs = Number(input?.nowMs || Date.now());
  const sessions = stateful.explorationSessions && typeof stateful.explorationSessions === 'object'
    ? stateful.explorationSessions
    : {};
  stateful.explorationSessions = sessions;
  stateful.explorationCandidates = stateful.explorationCandidates && typeof stateful.explorationCandidates === 'object'
    ? stateful.explorationCandidates
    : {};
  stateful.explorationTerminations = stateful.explorationTerminations && typeof stateful.explorationTerminations === 'object'
    ? stateful.explorationTerminations
    : {};
  const visibleById = new Map((input?.visibleTargets || [])
    .map(target => [targetKey(target), target])
    .filter(([id]) => id));
  const killedIds = new Set((input?.selfKillEvidence || [])
    .map(item => String(item?.targetUserId ?? item?.target_user_id ?? item?.targetId ?? item?.target_id ?? item?.userId ?? item?.user_id ?? ''))
    .filter(Boolean));
  const previousActionTargetId = explorationTargetIdFromAction(stateful.lastDecisionAction);
  const selfPoint = Number.isFinite(Number(input?.self?.x)) && Number.isFinite(Number(input?.self?.y))
    ? { x: Number(input.self.x), y: Number(input.self.y), at: nowMs }
    : null;
  for (const [targetId, session] of Object.entries(sessions)) {
    const visible = visibleById.get(targetId) || null;
    const visibleEntityId = visible?.entity_id ?? visible?.entityId ?? visible?.id ?? null;
    if (visible && session.targetEntityId !== null && session.targetEntityId !== undefined
      && visibleEntityId !== null && visibleEntityId !== undefined
      && String(visibleEntityId) !== String(session.targetEntityId)) {
      finishControlledExplorationSession(stateful, targetId, 'target-identity-changed', nowMs);
      continue;
    }
    if (visible && (visible.alive === false || hpValue(visible) === 0)) {
      finishControlledExplorationSession(stateful, targetId, 'target-killed', nowMs);
      continue;
    }
    if (killedIds.has(targetId)) {
      finishControlledExplorationSession(stateful, targetId, 'self-kill-confirmed', nowMs);
      continue;
    }
    if (stateful.dangerousCombatTargets?.[targetId] || stateful.easyKillTargetSuppressions?.[targetId]) {
      finishControlledExplorationSession(stateful, targetId, 'target-failed-or-suppressed', nowMs);
      continue;
    }
    if (visible) {
      session.lastSeenAt = nowMs;
      session.lastKnownDistance = numberOrNull(visible.distance ?? distanceBetween(input.self, visible));
      session.targetName = visible.name || session.targetName || '';
    } else if (nowMs - Number(session.lastSeenAt || session.sessionStartedAt || nowMs) > config.missingHoldMs) {
      finishControlledExplorationSession(stateful, targetId, 'target-missing-timeout', nowMs);
      continue;
    }
    if (previousActionTargetId === targetId && selfPoint && session.lastSelfPoint) {
      const moved = Math.hypot(
        selfPoint.x - Number(session.lastSelfPoint.x || 0),
        selfPoint.y - Number(session.lastSelfPoint.y || 0)
      );
      if (Number.isFinite(moved) && moved > 0) {
        session.approachDistanceCm = Math.max(0, Number(session.approachDistanceCm || 0)) + moved;
        session.approachSpent = Math.max(0, Number(session.approachSpent || 0)) + moved * config.moveStaminaPerCm;
        if (nowMs - Number(session.lastApproachProgressEventAt || 0) >= 1000) {
          recordControlledExplorationEvent(stateful, session, 'approach-progress', nowMs, {
            movedDistanceCm: Math.round(moved),
            approachDistanceCm: Math.round(Number(session.approachDistanceCm || 0)),
            approachSpent: Math.round(Number(session.approachSpent || 0))
          });
          session.lastApproachProgressEventAt = nowMs;
        }
      }
    }
    if (selfPoint) session.lastSelfPoint = selfPoint;
    const metrics = stateful.combatMetrics || null;
    if (String(metrics?.targetId ?? '') === targetId) {
      const metricsAccepted = Math.max(0, Number(metrics.acceptedShots || 0));
      const previousAccepted = Math.max(0, Number(session.lastCombatAcceptedShots || 0));
      const acceptedDelta = Math.max(0, metricsAccepted - previousAccepted);
      session.acceptedShots = Math.max(0, Number(session.acceptedShots || 0)) + acceptedDelta;
      const metricsShooting = Math.max(0, Number(metrics.shootingStaminaSpent || metricsAccepted * config.shotStaminaMs));
      const previousShooting = Math.max(0, Number(session.lastCombatShootingSpent || 0));
      session.shootingSpent = Math.max(0, Number(session.shootingSpent || 0))
        + Math.max(acceptedDelta * config.shotStaminaMs, metricsShooting - previousShooting);
      if (acceptedDelta > 0) {
        recordControlledExplorationEvent(stateful, session, 'shot', nowMs, {
          acceptedDelta,
          acceptedShots: Number(session.acceptedShots || 0),
          shootingSpent: Math.round(Number(session.shootingSpent || 0))
        });
      }
      session.lastCombatAcceptedShots = metricsAccepted;
      session.lastCombatShootingSpent = metricsShooting;
    }
    session.durationMs = Math.max(0, nowMs - Number(session.sessionStartedAt || nowMs));
    session.totalSpent = Math.max(0, Number(session.approachSpent || 0)) + Math.max(0, Number(session.shootingSpent || 0));
    session.remainingBudget = Math.max(0, config.maxStaminaMs - session.totalSpent);
    session.maxStaminaMs = config.maxStaminaMs;
    session.maxAcceptedShots = config.maxAcceptedShots;
    session.maxDurationMs = config.maxDurationMs;
    if (session.totalSpent >= config.maxStaminaMs) {
      finishControlledExplorationSession(stateful, targetId, 'stamina-budget-exhausted', nowMs);
    } else if (session.acceptedShots >= config.maxAcceptedShots) {
      finishControlledExplorationSession(stateful, targetId, 'shot-budget-exhausted', nowMs);
    } else if (session.durationMs >= config.maxDurationMs) {
      finishControlledExplorationSession(stateful, targetId, 'duration-budget-exhausted', nowMs);
    }
  }
  for (const [targetId, candidate] of Object.entries(stateful.explorationCandidates)) {
    if (nowMs - Number(candidate.lastSeenAt || 0) > config.missingHoldMs) delete stateful.explorationCandidates[targetId];
  }
  for (const [targetId, termination] of Object.entries(stateful.explorationTerminations)) {
    const visible = visibleById.get(targetId) || null;
    if (visible) {
      termination.lastSeenAt = nowMs;
      continue;
    }
    if (nowMs - Number(termination.lastSeenAt || termination.endedAt || 0) > config.missingHoldMs) {
      delete stateful.explorationTerminations[targetId];
    }
  }
  return config;
}

function observeControlledExplorationCandidate(input, stateful, item, config) {
  const nowMs = Number(input.nowMs || Date.now());
  const targetId = String(item.id);
  const existingSession = stateful.explorationSessions?.[targetId] || null;
  if (existingSession) return { session: existingSession, observation: null, rejectionReason: '' };
  const termination = stateful.explorationTerminations?.[targetId] || null;
  if (termination) {
    return {
      session: null,
      observation: stateful.explorationCandidates?.[targetId] || null,
      rejectionReason: `previous-session-${termination.reason || 'terminated'}`
    };
  }
  const records = stateful.explorationCandidates;
  const previous = records[targetId] || null;
  const currentTick = numberOrNull(input.realtime?.tick);
  const sameObservedFrame = previous && currentTick !== null && Number(previous.lastTick) === currentTick;
  const continuous = Boolean(previous
    && nowMs - Number(previous.lastSeenAt || 0) <= Math.max(config.missingHoldMs, 2500));
  const qualifiedFrames = sameObservedFrame
    ? Math.max(1, Number(previous.qualifiedFrames || 1))
    : (continuous ? Math.max(1, Number(previous.qualifiedFrames || 0)) + 1 : 1);
  const target = item.sourceTarget || {};
  const estimatedApproachDistanceCm = Math.max(0, Number(item.distance ?? target.distance ?? distanceBetween(input.self, target)) - config.attackRange);
  const estimatedApproachSpent = estimatedApproachDistanceCm * config.moveStaminaPerCm;
  const observation = {
    targetId,
    targetName: target.name || '',
    targetEntityId: target.entity_id ?? target.entityId ?? target.id ?? null,
    qualifiedFrames,
    requiredQualifiedFrames: config.qualifyingFrames,
    firstSeenAt: continuous ? Number(previous.firstSeenAt || nowMs) : nowMs,
    lastSeenAt: nowMs,
    lastTick: currentTick,
    estimatedApproachDistanceCm,
    estimatedApproachSpent,
    maxStaminaMs: config.maxStaminaMs
  };
  records[targetId] = observation;
  if (qualifiedFrames < config.qualifyingFrames) {
    return { session: null, observation, rejectionReason: 'insufficient-qualified-frames' };
  }
  if (estimatedApproachSpent >= config.maxStaminaMs) {
    return { session: null, observation, rejectionReason: 'estimated-approach-over-budget' };
  }
  const existingCombatMetrics = String(stateful.combatMetrics?.targetId ?? '') === targetId
    ? stateful.combatMetrics
    : null;
  const existingAcceptedShots = Math.max(0, Number(existingCombatMetrics?.acceptedShots || 0));
  const existingShootingSpent = Math.max(0, Number(
    existingCombatMetrics?.shootingStaminaSpent
      ?? existingAcceptedShots * config.shotStaminaMs
  ));
  const session = {
    active: true,
    sessionId: `exploration-${targetId}-${nowMs}`,
    targetId,
    targetName: target.name || '',
    targetEntityId: observation.targetEntityId,
    sessionStartedAt: nowMs,
    lastSeenAt: nowMs,
    lastKnownDistance: numberOrNull(item.distance ?? target.distance),
    qualifiedFrames,
    approachDistanceCm: 0,
    approachSpent: 0,
    shootingSpent: 0,
    totalSpent: 0,
    remainingBudget: config.maxStaminaMs,
    acceptedShots: 0,
    durationMs: 0,
    maxStaminaMs: config.maxStaminaMs,
    maxAcceptedShots: config.maxAcceptedShots,
    maxDurationMs: config.maxDurationMs,
    estimatedApproachDistanceCm,
    estimatedApproachSpent,
    lastSelfPoint: Number.isFinite(Number(input.self?.x)) && Number.isFinite(Number(input.self?.y))
      ? { x: Number(input.self.x), y: Number(input.self.y), at: nowMs }
      : null,
    lastCombatAcceptedShots: existingAcceptedShots,
    lastCombatShootingSpent: existingShootingSpent,
    lastApproachProgressEventAt: 0,
    terminationReason: ''
  };
  stateful.explorationSessions[targetId] = session;
  recordControlledExplorationEvent(stateful, session, 'admitted', nowMs, {
    qualifiedFrames,
    estimatedApproachDistanceCm: Math.round(estimatedApproachDistanceCm),
    estimatedApproachSpent: Math.round(estimatedApproachSpent),
    maxStaminaMs: config.maxStaminaMs,
    maxAcceptedShots: config.maxAcceptedShots,
    maxDurationMs: config.maxDurationMs
  });
  return { session, observation, rejectionReason: '' };
}

function buildOpportunityDecision(input, stateful = {}, options = {}) {
  const thresholdContext = options.profitThresholdContext || buildProfitThresholdContext(input, options);
  if (!input.self) {
    return {
      opportunities: [],
      rawChoice: null,
      choice: null,
      sorted: [],
      switchLock: stateful.switchLock || null,
      opportunityChoice: stateful.currentOpportunity || null,
      action: null
    };
  }
  const includeAfkProfitTargets = options.includeAfkProfitTargets !== false;
  const explorationConfig = reconcileControlledExplorationSessions(input, stateful, options);
  const coinMaxDistance = Math.max(0, Number(options.coinMaxDistance || BROWSER_RUNTIME_DEFAULTS.coinMaxDistance));
  const globalCoinMaxDistance = Math.max(0, Number(options.globalCoinMaxDistance || DEFAULT_GLOBAL_COIN_MAX_DISTANCE));
  const opportunityThreats = input.avoidanceThreats || input.activeThreats || [];
  clearDangerousOpportunityState(stateful, input.nowMs);
  const fieldMigrationCoin = pickFieldMigrationCoin(input, opportunityThreats, thresholdContext, options);
  const coinGroups = input.profitCoins.length
    ? [
        { coins: input.profitCoins, maxDistance: coinMaxDistance },
        { coins: input.profitCoins, maxDistance: globalCoinMaxDistance },
        ...(fieldMigrationCoin ? [{ coins: [fieldMigrationCoin], maxDistance: Math.max(0, Number(options.fieldMigrationMaxDistance ?? BROWSER_RUNTIME_DEFAULTS.fieldMigrationMaxDistance)) }] : [])
      ]
    : [];
  const routeCoin = input.self && coinGroups.length
    ? pickCoinRouteOpportunityCore(
        input.self,
        uniqueVisibleRouteCoinsCore(coinGroups, {
          isSnapshotOnlyCoin: coin => Boolean(coin?.snapshotOnly && input.profitCoinSource !== 'snapshot-fallback'),
          coinKey: coinRouteKey
        }),
        opportunityThreats,
        coinRouteCoreOptions(input, stateful, options)
      )
    : null;
  const opportunityOptions = {
    maxCoinDistance: coinMaxDistance,
    globalCoinMaxDistance,
    routeMaxDistance: options.coinRouteMaxDistance ?? BROWSER_RUNTIME_DEFAULTS.coinRouteMaxDistance,
    attackRange: options.attackRange || DEFAULT_ATTACK_RANGE,
    attackEngageRange: options.attackEngageRange || DEFAULT_ATTACK_ENGAGE_RANGE,
    visibleDistance: opportunityVisibleDistance(options),
    nearbyPriorityDistance: opportunityNearbyPriorityDistance(options),
    highValueCoinPriorityAmount: options.highValueCoinPriorityAmount || OPPORTUNITY_CONSTANTS.HIGH_VALUE_COIN_PRIORITY_AMOUNT,
    highValueCoinPriorityMaxDistance: highValueCoinPriorityRange(options),
    switchHoldMs: options.opportunitySwitchHoldMs || OPPORTUNITY_CONSTANTS.OPPORTUNITY_SWITCH_HOLD_MS,
    switchMargin: options.opportunitySwitchMargin || OPPORTUNITY_CONSTANTS.OPPORTUNITY_SWITCH_MARGIN,
    scoreCoinOpportunity: coin => scoreCoinOpportunity(coin, options),
    coinStaminaCost: coin => opportunityCoinStaminaCost(coin, options),
    coinStaminaAffordable: (_coin, staminaCost) => opportunityStaminaAffordable(input.self, staminaCost, options),
    safeCoinCandidates: (coins, activeThreats, maxDistance) => (coins || [])
      .filter(coin => {
        const limit = Number(maxDistance);
        if (Number.isFinite(limit) && limit > 0 && Number(coin?.distance) > limit) return false;
        return true;
      })
      .filter(coin => coinSafeFromThreats(coin, activeThreats, options)),
    snapshotCoinNavigationReason: coin => coin?.snapshotOnly
      ? snapshotCoinNavigationReasonCore(coin, {
          coinMaxDistance: options.nearCoinPriorityDistance || OPPORTUNITY_CONSTANTS.NEAR_COIN_PRIORITY_DISTANCE,
          isSnapshotOnlyCoin: item => Boolean(item?.snapshotOnly)
        })
      : 'visible-coin',
    scoreEnemyOpportunity: target => scoreEnemyOpportunity(target, {
      ...options,
      recentCombatMetrics: stateful.combatMetrics,
      combatTargetState: String(stateful.combatTarget?.id ?? '') === String(target?.user_id ?? target?.userId ?? '')
        ? stateful.combatTarget
        : null,
      opponentBehaviorState: stateful.opponentBehaviorStates?.[String(target?.user_id ?? target?.userId ?? '')] || null,
      isAfkProfitTarget: item => input.afkTargets.includes(item)
    }),
    enemyStaminaCost: target => enemyStaminaCost(target, {
      ...options,
      recentCombatMetrics: stateful.combatMetrics
    }),
    opportunityStaminaAffordable: staminaCost => opportunityStaminaAffordable(input.self, staminaCost, options),
    isAfkProfitTarget: target => input.afkTargets.includes(target),
    priorityTier: item => opportunityPriorityTierCore(item, {
      visibleDistance: opportunityVisibleDistance(options),
      nearbyPriorityDistance: opportunityNearbyPriorityDistance(options)
    }),
    self: input.self,
    moveStaminaPerCm: options.opportunityMoveStaminaPerCm ?? BROWSER_RUNTIME_DEFAULTS.opportunityMoveStaminaPerCm ?? 1,
    switchConfirmFrames: options.opportunitySwitchConfirmFrames ?? 3,
    switchRelativeMargin: options.opportunitySwitchRelativeMargin ?? BROWSER_RUNTIME_DEFAULTS.opportunitySwitchRelativeMargin ?? 0,
    afkFinishCommitmentMaxHp: options.afkFinishCommitmentMaxHp ?? 60,
    afkFinishCommitmentMaxStaminaCost: options.afkFinishCommitmentMaxStaminaCost ?? 25000,
    nowMs: input.nowMs
  };
  const afkOpportunityTargets = includeAfkProfitTargets
    ? input.afkTargets
      .filter(target => !targetDangerousCooldownRecord(stateful, target, input.nowMs))
      .filter(target => !afkOpportunityBlockedByStaminaCooldown(target, opportunityOptions))
      .filter(target => targetSafeFromOpportunityThreats(target, opportunityThreats, options))
    : [];
  const easyKillOpportunityTargets = (input.easyKillTargets || [])
    .filter(target => !targetDangerousCooldownRecord(stateful, target, input.nowMs))
    .filter(target => !easyKillTargetSuppressed(stateful, target, input.nowMs))
    .filter(target => targetSafeFromOpportunityThreats(target, opportunityThreats, options));
  const enemyOpportunityTargets = Array.from(new Map(
    [...afkOpportunityTargets, ...easyKillOpportunityTargets]
      .map(target => [String(target.user_id ?? target.userId ?? target.entity_id ?? target.entityId ?? ''), target])
      .filter(([id]) => id)
  ).values());
  let rawOpportunities = prioritizeBrowserlessOpportunities(buildOpportunityCandidatesCore(
    input.self,
    opportunityThreats,
    coinGroups,
    enemyOpportunityTargets,
    routeCoin,
    opportunityOptions
  ), options).map(item => {
    if (item.type !== 'enemy') return item;
    const effective = effectiveProfitReward(item.sourceTarget, easyKillOpportunityScoringOptions(item.sourceTarget, stateful, options));
    return {
      ...item,
      reason: item.sourceTarget?.easyKillProfitTarget ? 'easy-kill-active-profit' : item.reason,
      reward: effective.expectedReward,
      expectedReward: effective.expectedReward,
      effectiveProfitReward: effective
    };
  });
  const filtered = filterProfitCandidatesCore(rawOpportunities, thresholdContext, {
    reward: profitOpportunityThresholdReward,
    staminaCost: item => item.staminaCost,
    summaryLimit: 12
  });
  rawOpportunities = filtered.annotated;
  let eligibleOpportunities = filtered.candidates.map(item => ({
    ...item,
    eligibleByExpectedROI: true,
    explorationAdmitted: false,
    profitThresholdActive: Boolean(thresholdContext.active),
    profitThresholdRewardCoins: thresholdContext.threshold?.rewardCoins ?? null,
    profitThresholdStaminaMilli: thresholdContext.threshold?.staminaMilli ?? null
  }));
  let explorationAdmission = null;
  const explorationEvaluations = [];
  if (thresholdContext.active && eligibleOpportunities.length === 0) {
    const injury = stateful.browserlessInjury || null;
    const candidates = rawOpportunities
      .filter(item => item.type === 'enemy' && item.sourceTarget?.active && item.sourceTarget?.easyKillProfitTarget)
      .filter(item => item.profitThresholdEligible === false)
      .filter(item => !item.sourceTarget?.firing)
      .filter(item => !(input.bullets || []).some(bullet => String(bulletOwnerId(bullet) ?? '') === String(item.id)))
      .filter(item => !injury || String(injury.targetKey || '') !== String(item.id) || input.nowMs - Number(injury.at || 0) > 3000)
      .map(item => {
        const observed = observeControlledExplorationCandidate(input, stateful, item, explorationConfig);
        const session = observed.session;
        const evaluation = {
          targetId: String(item.id),
          targetName: item.sourceTarget?.name || '',
          qualifiedFrames: Number(observed.observation?.qualifiedFrames ?? session?.qualifiedFrames ?? 0),
          requiredQualifiedFrames: explorationConfig.qualifyingFrames,
          estimatedApproachSpent: Number(observed.observation?.estimatedApproachSpent ?? session?.estimatedApproachSpent ?? 0),
          approachSpent: Number(session?.approachSpent || 0),
          shootingSpent: Number(session?.shootingSpent || 0),
          totalSpent: Number(session?.totalSpent || 0),
          remainingBudget: Number(session?.remainingBudget ?? explorationConfig.maxStaminaMs),
          durationMs: Number(session?.durationMs || 0),
          acceptedShots: Number(session?.acceptedShots || 0),
          rejectionReason: observed.rejectionReason || ''
        };
        explorationEvaluations.push(evaluation);
        return { item, session, evaluation };
      })
      .filter(row => row.session
        && row.session.acceptedShots < explorationConfig.maxAcceptedShots
        && row.session.totalSpent < explorationConfig.maxStaminaMs
        && row.session.durationMs < explorationConfig.maxDurationMs)
      .sort((a, b) => Number(b.item.score || -Infinity) - Number(a.item.score || -Infinity));
    const selected = candidates[0] || null;
    if (selected) {
      explorationAdmission = {
        targetId: String(selected.item.id),
        targetName: selected.item.sourceTarget?.name || '',
        acceptedShots: Number(selected.session.acceptedShots || 0),
        maxAcceptedShots: explorationConfig.maxAcceptedShots,
        durationMs: Number(selected.session.durationMs || 0),
        maxDurationMs: explorationConfig.maxDurationMs,
        approachSpent: Number(selected.session.approachSpent || 0),
        shootingSpent: Number(selected.session.shootingSpent || 0),
        totalSpent: Number(selected.session.totalSpent || 0),
        remainingBudget: Number(selected.session.remainingBudget || 0),
        maxStaminaMs: explorationConfig.maxStaminaMs,
        sessionStartedAt: Number(selected.session.sessionStartedAt || input.nowMs),
        lastSeenAt: Number(selected.session.lastSeenAt || input.nowMs),
        qualifiedFrames: Number(selected.session.qualifiedFrames || 0),
        estimatedApproachSpent: Number(selected.session.estimatedApproachSpent || 0),
        terminationReason: selected.session.terminationReason || '',
        reason: 'no-eligible-visible-profit'
      };
      eligibleOpportunities = [{
        ...selected.item,
        eligibleByExpectedROI: false,
        explorationAdmitted: true,
        profitThresholdEligible: true,
        profitThresholdReason: 'controlled-exploration',
        profitThresholdActive: true,
        profitThresholdRewardCoins: thresholdContext.threshold?.rewardCoins ?? null,
        profitThresholdStaminaMilli: thresholdContext.threshold?.staminaMilli ?? null,
        explorationAdmission
      }];
    }
  }
  let opportunities = eligibleOpportunities;
  const storedCurrent = stateful.currentOpportunity || null;
  const storedCurrentEligible = storedCurrent && profitTargetEligibleCore(
    profitOpportunityThresholdReward(storedCurrent),
    storedCurrent.staminaCost,
    thresholdContext.threshold
  );
  const current = thresholdContext.active && !storedCurrentEligible ? null : storedCurrent;
  const currentEnemyPresent = current?.type === 'enemy'
    && opportunities.some(item => String(item.type) === 'enemy' && String(item.id) === String(current.id));
  const enemyMissingHoldMs = Math.max(0, Number(options.enemyMissingHoldMs ?? 1800));
  const enemyLastSeenAt = Number(current?.lastSeenAt || current?.at || 0);
  if (
    current?.type === 'enemy'
    && !currentEnemyPresent
    && enemyMissingHoldMs > 0
    && input.nowMs - enemyLastSeenAt <= enemyMissingHoldMs
    && Number.isFinite(Number(current.x))
    && Number.isFinite(Number(current.y))
    && (!thresholdContext.active || current.profitThresholdEligible === true)
  ) {
    const cachedTarget = {
      type: 'enemy',
      userId: current.id,
      id: current.id,
      x: Number(current.x),
      y: Number(current.y),
      distance: distanceBetween(input.self, current),
      active: false,
      cachedNavigationOnly: true,
      authority: 'last-realtime-position'
    };
    opportunities = opportunities.concat([{
      type: 'enemy',
      id: current.id,
      x: cachedTarget.x,
      y: cachedTarget.y,
      distance: cachedTarget.distance,
      score: Number(current.score || 0),
      staminaCost: Number(current.staminaCost || 0),
      priorityTier: Number(current.priorityTier || 0),
      actionKind: 'seek-enemy',
      reason: 'missing-realtime-enemy-hold',
      missingHold: true,
      sourceTarget: cachedTarget
    }]);
  }
  const rawChoiceResult = chooseStableOpportunityCore(
    rawOpportunities,
    null,
    null,
    opportunityOptions
  );
  const rawChosen = rawChoiceResult.chosen || null;
  const rawAction = rawChosen
    ? {
        kind: rawChosen.actionKind || rawChosen.type,
        band: 'profit',
        reason: rawChosen.reason || 'best-opportunity',
        target: rawChosen.type === 'coin'
          ? summarizeCoin(rawChosen.sourceCoin)
          : { ...summarizeTarget(rawChosen.sourceTarget), cachedNavigationOnly: Boolean(rawChosen.sourceTarget?.cachedNavigationOnly) },
        reward: rawChosen.reward,
        expectedReward: rawChosen.expectedReward ?? rawChosen.reward,
        effectiveProfitReward: rawChosen.effectiveProfitReward || null,
        eligibleByExpectedROI: rawChosen.eligibleByExpectedROI === undefined
          ? rawChosen.profitThresholdEligible !== false
          : Boolean(rawChosen.eligibleByExpectedROI),
        explorationAdmitted: Boolean(rawChosen.explorationAdmitted),
        explorationAdmission: rawChosen.explorationAdmission || null,
        staminaCost: rawChosen.staminaCost,
        profitThresholdEligible: rawChosen.profitThresholdEligible,
        profitThresholdReason: rawChosen.profitThresholdReason,
        ...(rawChosen.type === 'coin' && rawChosen.sourceCoin?.coinRoute
          ? { coinRoute: coinRouteActionMetaCore(rawChosen.sourceCoin.coinRoute, rawChosen.sourceCoin.distance) }
          : {})
      }
    : null;
  const choice = chooseStableOpportunityCore(
    opportunities,
    current,
    stateful.switchLock || null,
    opportunityOptions
  );
  const chosen = choice.chosen || null;
  const action = chosen
    ? {
        kind: chosen.actionKind || chosen.type,
        band: 'profit',
        reason: chosen.reason || 'best-opportunity',
        target: chosen.type === 'coin'
          ? summarizeCoin(chosen.sourceCoin)
          : { ...summarizeTarget(chosen.sourceTarget), cachedNavigationOnly: Boolean(chosen.sourceTarget?.cachedNavigationOnly) },
        reward: chosen.reward,
        expectedReward: chosen.expectedReward ?? chosen.reward,
        effectiveProfitReward: chosen.effectiveProfitReward || null,
        eligibleByExpectedROI: chosen.eligibleByExpectedROI !== false,
        explorationAdmitted: Boolean(chosen.explorationAdmitted),
        explorationAdmission: chosen.explorationAdmission || null,
        staminaCost: chosen.staminaCost,
        profitThresholdEligible: chosen.profitThresholdEligible,
        profitThresholdReason: chosen.profitThresholdReason,
        opportunitySwitch: choice.switchDiagnostics || null,
        ...(chosen.type === 'coin' && chosen.sourceCoin?.coinRoute
          ? { coinRoute: coinRouteActionMetaCore(chosen.sourceCoin.coinRoute, chosen.sourceCoin.distance) }
          : {})
      }
    : null;
  const remembered = rememberOpportunityChoiceCore(chosen, action, current, opportunityOptions);
  const explorationLifecycleEvents = Array.isArray(stateful.explorationLifecycleEvents)
    ? stateful.explorationLifecycleEvents.splice(0, stateful.explorationLifecycleEvents.length)
    : [];
  return {
    opportunities,
    rawOpportunities,
    rawChoice: rawChosen,
    rawAction,
    choice: chosen,
    sorted: choice.sorted || [],
    switchLock: thresholdContext.active && !opportunities.length ? null : (choice.switchLock || null),
    switchDiagnostics: choice.switchDiagnostics || null,
    opportunityChoice: remembered.choice || null,
    action: remembered.action || action,
    threshold: {
      ...thresholdContext,
      rawCount: filtered.rawCount,
      eligibleCount: filtered.eligibleCount,
      filteredCount: filtered.filteredCount,
      filtered: filtered.filtered,
      explorationAdmission,
      explorationEvaluations: explorationEvaluations.slice(0, 8),
      explorationLifecycleEvents: cloneJson(explorationLifecycleEvents),
      explorationSessions: Object.values(stateful.explorationSessions || {}).slice(0, 8).map(session => ({
        sessionId: session.sessionId || '',
        targetId: session.targetId,
        targetName: session.targetName || '',
        approachSpent: Number(session.approachSpent || 0),
        shootingSpent: Number(session.shootingSpent || 0),
        totalSpent: Number(session.totalSpent || 0),
        remainingBudget: Number(session.remainingBudget || 0),
        durationMs: Number(session.durationMs || 0),
        acceptedShots: Number(session.acceptedShots || 0),
        sessionStartedAt: Number(session.sessionStartedAt || 0),
        lastSeenAt: Number(session.lastSeenAt || 0),
        terminationReason: session.terminationReason || ''
      }))
    }
  };
}

function easyKillPreferredTargetIdFromOpportunity(opportunity = null, stateful = {}) {
  const choice = opportunity?.choice || null;
  if (choice?.type === 'enemy' && choice.sourceTarget?.easyKillProfitTarget === true) {
    return easyKillTargetUserId(choice.sourceTarget) ?? choice.id ?? null;
  }
  const stored = stateful.opportunityChoice || stateful.currentOpportunity || null;
  if (stored?.type === 'enemy'
    && stored.profitThresholdEligible !== false
    && String(stored.reason || '') === 'easy-kill-active-profit') {
    return stored.id ?? null;
  }
  return null;
}

function buildRecoveryDecision(input, opportunity, options = {}) {
  if (!input?.self || !isRecoveringSelf(input.self)) return null;
  const choice = opportunity?.choice || null;
  if (choice?.type === 'coin') {
    const distance = Number(choice.distance ?? choice.sourceCoin?.distance ?? Infinity);
    const amount = Number(choice.amount ?? choice.sourceCoin?.amount ?? 0);
    const recoveryCoinMaxDistance = Math.max(0, Number(options.recoveryCoinMaxDistance ?? DEFAULT_RECOVERY_COIN_MAX_DISTANCE));
    if (Number.isFinite(distance) && distance <= recoveryCoinMaxDistance) {
      return {
        ...(opportunity.action || {}),
        kind: choice.actionKind || 'coin',
        band: 'profit',
        reason: 'recovery-foot-coin',
        target: summarizeCoin(choice.sourceCoin),
        recovery: recoverySummary(input.self)
      };
    }
    const playerDropMinAmount = Math.max(1, Number(options.recoveryPlayerDropMinAmount ?? DEFAULT_RECOVERY_PLAYER_DROP_MIN_AMOUNT));
    const playerDropMaxDistance = Math.max(0, Number(options.postAttackRecoveryDropMaxDistance ?? DEFAULT_POST_ATTACK_RECOVERY_DROP_MAX_DISTANCE));
    if (input.profitCoinSource === 'snapshot-player-drop'
      && amount >= playerDropMinAmount
      && Number.isFinite(distance)
      && distance <= playerDropMaxDistance) {
      return {
        ...(opportunity.action || {}),
        kind: choice.actionKind || 'coin',
        band: 'profit',
        reason: 'post-attack-drop-coin',
        target: summarizeCoin(choice.sourceCoin),
        recovery: recoverySummary(input.self)
      };
    }
  }
  return {
    kind: 'recover',
    band: 'recover',
    reason: 'wait-for-full-stamina-and-hp',
    stopMotion: true,
    self: summarizeTarget(input.self),
    recovery: recoverySummary(input.self)
  };
}

function lowHpRecoveryThreatRadiusForHp(selfHp, options = {}) {
  const hp = numberOrNull(selfHp);
  if (hp === null) return null;
  const lowHpAnchor = Math.max(0, numberOrNull(
    options.lowHpRecoveryThreatLowHpAnchor
      ?? options.recoveryThreatExitLowHpAnchor
  ) ?? DEFAULT_LOW_HP_RECOVERY_THREAT_LOW_HP_ANCHOR);
  const requestedHighHpAnchor = numberOrNull(
    options.lowHpRecoveryThreatHighHpAnchor
      ?? options.recoveryThreatExitHighHpAnchor
      ?? options.lowHpRecoveryThreatHp
      ?? options.recoveryThreatExitHpThreshold
      ?? options.combatLowHpLeaveThreshold
  );
  const highHpAnchor = requestedHighHpAnchor !== null && requestedHighHpAnchor > lowHpAnchor
    ? requestedHighHpAnchor
    : Math.max(lowHpAnchor + 1, DEFAULT_LOW_HP_RECOVERY_THREAT_HP);
  const lowHpRadius = Math.max(0, numberOrNull(
    options.lowHpRecoveryThreatRadius
      ?? options.recoveryThreatExitRadius
      ?? options.loginPointSafetyRadius
  ) ?? DEFAULT_LOW_HP_RECOVERY_THREAT_RADIUS);
  const highHpRadius = Math.max(0, numberOrNull(
    options.lowHpRecoveryThreatHighHpRadius
      ?? options.recoveryThreatExitHighHpRadius
  ) ?? DEFAULT_LOW_HP_RECOVERY_THREAT_HIGH_HP_RADIUS);
  const slopeCmPerHp = (highHpRadius - lowHpRadius) / (highHpAnchor - lowHpAnchor);
  const unclampedRadius = lowHpRadius + (hp - lowHpAnchor) * slopeCmPerHp;
  return {
    radius: Math.max(0, Math.round(unclampedRadius)),
    unclampedRadius,
    lowHpAnchor,
    lowHpRadius,
    highHpAnchor,
    highHpRadius,
    slopeCmPerHp
  };
}

function buildLowHpRecoveryThreatExitDecision(input, options = {}) {
  if (!browserlessSafetyExitModeEnabled(options) || !input?.self || !isRecoveringSelf(input.self)) return null;
  const selfHp = hpValue(input.self);
  const radiusModel = lowHpRecoveryThreatRadiusForHp(selfHp, options);
  const radius = Number(radiusModel?.radius || 0);
  const attackRange = Math.max(0, Number(options.combatAttackRange ?? options.attackRange ?? DEFAULT_ATTACK_RANGE));
  const effectiveAvoidanceWidth = Math.max(0, radius - attackRange);
  if (radius <= attackRange) return null;
  const threats = [];
  const seen = new Set();
  for (const target of input.visibleTargets || []) {
    if (!target || target.alive === false || target.whitelisted || target.easyKillThreatExempt) continue;
    if (target.authority && target.authority !== 'realtime') continue;
    if (!(target.active || target.firing || isCurrentlyActiveEntity(target, options))) continue;
    const distance = Number(target.distance ?? distanceBetween(input.self, target));
    if (!Number.isFinite(distance) || distance <= attackRange || distance > radius) continue;
    const key = targetKey(target) || `${Number(target.x)}:${Number(target.y)}:${String(target.name || '')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    threats.push({ target, distance });
  }
  threats.sort((a, b) => a.distance - b.distance);
  const nearest = threats[0] || null;
  if (!nearest) return null;
  return {
    kind: 'safety-exit',
    band: 'safety',
    reason: 'recovery-low-hp-active-threat-leave',
    shouldLeave: true,
    stopMotion: true,
    self: summarizeTarget(input.self),
    target: summarizeTarget(nearest.target),
    threats: threats.slice(0, 5).map(item => summarizeTarget(item.target)),
    recovery: recoverySummary(input.self),
    recoverySafety: {
      authority: 'realtime',
      selfHp,
      hpThreshold: radiusModel.highHpAnchor,
      radius,
      attackRange,
      effectiveAvoidanceWidth,
      radiusModel: {
        lowHpAnchor: radiusModel.lowHpAnchor,
        lowHpRadius: radiusModel.lowHpRadius,
        highHpAnchor: radiusModel.highHpAnchor,
        highHpRadius: radiusModel.highHpRadius,
        slopeCmPerHp: radiusModel.slopeCmPerHp
      },
      threatCount: threats.length,
      nearestDistance: Math.round(nearest.distance),
      trigger: 'active-threat-entered-precombat-recovery-annulus'
    }
  };
}

function entityMatchesAttack(entity, attack) {
  if (!entity || !attack) return false;
  const entityId = entity.user_id ?? entity.userId ?? entity.entity_id ?? entity.entityId;
  return entityId !== null
    && entityId !== undefined
    && attack.id !== null
    && attack.id !== undefined
    && String(entityId) === String(attack.id);
}

function matchingPostAttackDropEvidence(input, attack, options = {}) {
  const attackId = String(attack?.id ?? '');
  if (!attackId) return false;
  const radius = Math.max(0, Number(options.postAttackDropCoinRadius ?? BROWSER_RUNTIME_DEFAULTS.postAttackDropCoinRadius));
  const coins = mergeProfitCoinCandidates(
    input?.realtimeCoins || [],
    input?.snapshotVisibleCoins || input?.profitCoins || []
  );
  return coins.some(coin => postAttackCoinMatchesAttackCore(coin, attack, {
    dist: distanceBetween,
    dropCoinRadius: radius
  }));
}

function postAttackDisappearanceKillPlausibility(attack, input, options = {}) {
  if (!attack) return null;
  const attackId = String(attack.id ?? '');
  const selfKillIds = new Set((input?.selfKillTargetIds || []).map(String));
  if (attackId && selfKillIds.has(attackId)) return true;
  if (matchingPostAttackDropEvidence(input, attack, options)) return true;
  const hp = numberOrNull(attack.hp);
  if (hp === null) return null;
  if (hp <= 0) return true;
  const selfId = input?.self?.user_id ?? input?.self?.userId ?? input?.userId ?? null;
  const selfBulletCount = selfId === null || selfId === undefined
    ? 0
    : (input?.bullets || []).filter(bullet => String(bulletOwnerId(bullet) ?? '') === String(selfId)).length;
  const damagePerShot = Math.max(0.1, Number(
    options.opportunityEstimatedDamagePerShot
      ?? BROWSER_RUNTIME_DEFAULTS.opportunityEstimatedDamagePerShot
      ?? OPPORTUNITY_CONSTANTS.ESTIMATED_DAMAGE_PER_SHOT
  ));
  return hp <= Math.max(1, selfBulletCount) * damagePerShot;
}

function browserlessPostAttackDropResolvedAt(attack, input, nowMs, currentCombatTarget = null, options = {}) {
  if (!attack) return 0;
  const selfKillIds = new Set((input?.selfKillTargetIds || []).map(String));
  if (selfKillIds.has(String(attack.id))) {
    if (!attack.postAttackDropResolvedAt) attack.postAttackDropResolvedAt = nowMs;
    return attack.postAttackDropResolvedAt;
  }
  const visible = [currentCombatTarget, ...(input?.visibleTargets || [])]
    .filter(Boolean)
    .find(entity => entityMatchesAttack(entity, attack));
  if (visible && visible.alive !== false && Number(visible.hp ?? 1) > 0) {
    attack.postAttackDropResolvedAt = 0;
    return 0;
  }
  if (postAttackDisappearanceKillPlausibility(attack, input, options) === false) {
    attack.postAttackDropResolvedAt = 0;
    return 0;
  }
  if (!attack.postAttackDropResolvedAt) attack.postAttackDropResolvedAt = nowMs;
  return attack.postAttackDropResolvedAt;
}

function postAttackThreats(input) {
  return [
    ...(input?.avoidanceThreats || input?.activeThreats || []),
    ...(input?.snapshotActiveThreats || [])
  ];
}

function reconcilePostAttackSettlements(input, stateful = {}, options = {}, combat = null) {
  const coins = mergeProfitCoinCandidates(
    input?.realtimeCoins || [],
    input?.snapshotVisibleCoins || input?.profitCoins || []
  );
  const waitMs = Math.max(0, Number(options.postAttackDropWaitMs ?? BROWSER_RUNTIME_DEFAULTS.postAttackDropWaitMs));
  const result = updatePostAttackSettlementCore(stateful.postAttackSettlements || {}, {
    nowMs: input?.nowMs,
    attacks: stateful.attackHistory || [],
    coins,
    visibleTargets: input?.visibleTargets || []
  }, {
    waitMs,
    minDrop: 0,
    resolveMaxMs: Math.max(waitMs, Number(options.postAttackDropResolveMaxMs ?? BROWSER_RUNTIME_DEFAULTS.postAttackDropResolveMaxMs ?? waitMs) || waitMs),
    pickupMs: Math.max(0, Number(options.postAttackDropCoinPriorityMs ?? BROWSER_RUNTIME_DEFAULTS.postAttackDropCoinPriorityMs)),
    dropCoinRadius: Math.max(0, Number(options.postAttackDropCoinRadius ?? BROWSER_RUNTIME_DEFAULTS.postAttackDropCoinRadius)),
    dist: distanceBetween,
    resolveAttack: attack => browserlessPostAttackDropResolvedAt(
      attack,
      input,
      input.nowMs,
      combat?.target || combat?.dryRun?.target,
      options
    )
  });
  for (const settlement of Object.values(result.states || {})) {
    if (settlement?.coin) settlement.matchedCoinKey = profitCoinKey(settlement.coin);
  }
  stateful.postAttackSettlements = result.states;
  stateful.postAttackSettlement = result.selected || null;
  return {
    activeCount: result.activeCount,
    terminalCount: result.terminalCount,
    selected: result.selected ? cloneJson({ ...result.selected, coin: undefined }) : null
  };
}

function reconcilePostKillSettlement(input, stateful = {}, combat = {}, previousCombatTarget = null, options = {}) {
  const observation = stateful.realtimeSnapshotObservation || null;
  const metricsTargetId = String(stateful.combatMetrics?.targetId ?? '');
  const previousTargetId = String(targetIdForAttackHistory(previousCombatTarget) ?? '');
  const disappearanceTarget = metricsTargetId && metricsTargetId === previousTargetId
    ? previousCombatTarget
    : null;
  const disappearanceKillPlausible = disappearanceTarget
    ? postAttackDisappearanceKillPlausibility(disappearanceTarget, input, options)
    : null;
  const result = updatePostKillSettlementCore(stateful.postKillSettlement || null, {
    nowMs: input?.nowMs,
    previousCombatTarget,
    currentCombatTarget: combat?.target || combat?.dryRun?.target || null,
    combatMetrics: stateful.combatMetrics || null,
    visibleTargets: input?.visibleTargets || [],
    selfKillEvidence: input?.selfKillEvidence?.length ? input.selfKillEvidence : (observation?.selfKillEvidence || []),
    playerDropCoins: input?.selfKilledPlayerDropCoins?.length ? input.selfKilledPlayerDropCoins : (observation?.coins || []),
    snapshotTick: input?.fallback?.tick ?? observation?.tick ?? null,
    disappearanceKillPlausible
  }, {
    unconfirmedMs: options.postKillUnconfirmedTailMs
      ?? Math.max(1500, Number(options.postAttackDropWaitMs ?? BROWSER_RUNTIME_DEFAULTS.postAttackDropWaitMs)),
    confirmedMs: options.postAttackDropResolveMaxMs ?? BROWSER_RUNTIME_DEFAULTS.postAttackDropResolveMaxMs,
    pickupMs: options.postAttackDropCoinPriorityMs ?? BROWSER_RUNTIME_DEFAULTS.postAttackDropCoinPriorityMs,
    recentShotMs: options.postKillRecentShotMs ?? 1500
  });
  stateful.postKillSettlement = result.state || null;
  return settlementSummary(stateful.postKillSettlement, input?.nowMs);
}

function buildPostKillSettlementWaitDecision(input, stateful = {}) {
  const settlement = stateful.postKillSettlement || null;
  if (!input?.self || !settlement || settlement.phase === 'drop-visible') return null;
  return {
    kind: 'post-attack-drop-wait',
    band: 'profit',
    reason: 'post-kill-settlement-wait',
    target: {
      type: 'post-attack-target',
      id: settlement.targetId,
      name: settlement.targetName || '',
      drop: numberOrNull(settlement.targetDrop),
      postAttackTarget: {
        id: settlement.targetId,
        name: settlement.targetName || '',
        drop: numberOrNull(settlement.targetDrop),
        phase: settlement.phase || 'unconfirmed-tail',
        ageMs: Math.max(0, Math.round(input.nowMs - Number(settlement.startedAt || input.nowMs)))
      }
    },
    postKillSettlement: settlementSummary(settlement, input.nowMs)
  };
}

function safePostAttackCoinCandidates(input, maxDistance, options = {}) {
  if (!input?.self) return [];
  const threats = postAttackThreats(input);
  return (input.profitCoins || [])
    .filter(coin => Number(coin?.amount || 0) > 0)
    .filter(coin => Number(coin?.distance || Infinity) <= Number(maxDistance || Infinity))
    .filter(coin => coinSafeFromThreats(coin, threats, options))
    .filter(coin => opportunityStaminaAffordable(input.self, opportunityCoinStaminaCost(coin, options), options));
}

function buildPostAttackDropCoinDecision(input, stateful = {}, options = {}, combat = null) {
  if (!input?.self) return null;
  const settlement = stateful.postAttackSettlement || null;
  if (!settlement || !['drop-observed', 'pickup-protected'].includes(settlement.phase)) return null;
  const recovery = isRecoveringSelf(input.self);
  const maxDistance = recovery
    ? Math.max(0, Number(options.postAttackRecoveryDropMaxDistance ?? DEFAULT_POST_ATTACK_RECOVERY_DROP_MAX_DISTANCE))
    : Math.max(0, Number(options.postAttackDropCoinMaxDistance ?? BROWSER_RUNTIME_DEFAULTS.postAttackDropCoinMaxDistance));
  const coin = safePostAttackCoinCandidates(input, maxDistance, options)
    .find(candidate => profitCoinKey(candidate) === settlement.matchedCoinKey) || null;
  if (!coin) return null;
  const score = scoreCoinOpportunity(coin, options);
  if (recovery && score < Math.max(0, Number(options.postAttackRecoveryDropMinScore ?? 0))) return null;
  return buildPriorityCoinDecision(input, coin, 'post-attack-drop-coin', options, {
    postAttackTarget: {
      id: settlement.targetId,
      name: settlement.targetName || '',
      drop: numberOrNull(settlement.targetDrop),
      x: numberOrNull(settlement.x),
      y: numberOrNull(settlement.y),
      phase: settlement.phase,
      matchedCoinKey: settlement.matchedCoinKey,
      matchedCoinEvidence: settlement.matchedCoinEvidence || ''
    }
  });
}

function buildPostAttackDropWaitDecision(input, stateful = {}, options = {}, combat = null) {
  if (!input?.self) return null;
  const target = stateful.postAttackSettlement || null;
  if (!target || target.phase !== 'pending') return null;
  const minDrop = Math.max(0, Number(options.postAttackDropWaitMinDrop ?? options.attackMinDrop ?? DEFAULT_ATTACK_MIN_DROP) || 0);
  if (Number(target.targetDrop || 0) < minDrop) return null;
  const distance = distanceBetween(input.self, target);
  const maxDistance = Math.max(0, Number(options.postAttackDropWaitMaxDistance ?? options.opportunityVisibleDistance ?? options.globalCoinMaxDistance ?? DEFAULT_GLOBAL_COIN_MAX_DISTANCE));
  const stopDistance = Math.max(0, Number(options.postAttackDropWaitStopDistance ?? BROWSER_RUNTIME_DEFAULTS.postAttackDropWaitStopDistance ?? BROWSER_RUNTIME_DEFAULTS.coinPickupSweepDistance ?? 0));
  if (!(distance > stopDistance && distance <= maxDistance)) return null;
  if (postAttackThreats(input).some(threat => !coinSafeFromThreats(target, [threat], options))) return null;
  return {
    kind: 'post-attack-drop-wait',
    band: 'profit',
    reason: 'post-attack-drop-wait-position',
    target: {
      type: 'post-attack-target',
      id: target.targetId,
      name: target.targetName || '',
      x: numberOrNull(target.x),
      y: numberOrNull(target.y),
      drop: numberOrNull(target.targetDrop),
      distance: Math.round(distance),
      postAttackTarget: {
        id: target.targetId,
        name: target.targetName || '',
        drop: numberOrNull(target.targetDrop),
        phase: target.phase,
        ageMs: Math.max(0, Math.round(input.nowMs - Number(target.lastAttackAt || input.nowMs))),
        resolvedAgeMs: Math.max(0, Math.round(input.nowMs - Number(target.resolvedAt || input.nowMs)))
      }
    }
  };
}

function pickNearestSafeProfitCoin(input, maxDistance, options = {}) {
  if (!input?.self || !(Number(maxDistance) > 0)) return null;
  const threats = [
    ...(input.avoidanceThreats || input.activeThreats || []),
    ...(input.snapshotActiveThreats || [])
  ];
  return (input.profitCoins || [])
    .filter(coin => Number(coin?.amount || 0) > 0)
    .filter(coin => Number(coin?.distance || Infinity) <= Number(maxDistance))
    .filter(coin => coinSafeFromThreats(coin, threats, options))
    .filter(coin => opportunityStaminaAffordable(input.self, opportunityCoinStaminaCost(coin, options), options))
    .sort((a, b) => profitCoinPriorityRank(b) - profitCoinPriorityRank(a)
      || Number(a.distance || Infinity) - Number(b.distance || Infinity)
      || Number(b.amount || 0) - Number(a.amount || 0))[0] || null;
}

function buildPriorityCoinDecision(input, coin, reason, options = {}, extra = {}) {
  if (!input?.self || !coin) return null;
  return {
    kind: Number(coin.distance || Infinity) <= Number(options.coinMaxDistance ?? BROWSER_RUNTIME_DEFAULTS.coinMaxDistance)
      ? 'coin'
      : 'seek-coin',
    band: 'profit',
    reason,
    reward: Number(coin.coinRoute?.value ?? coin.fieldAmount ?? coin.amount ?? 0),
    staminaCost: opportunityCoinStaminaCost(coin, options),
    target: summarizeCoin(coin),
    ...extra
  };
}

function buildRecoveryFootCoinDecision(input, options = {}) {
  if (!input?.self || !isRecoveringSelf(input.self)) return null;
  const coin = pickNearestSafeProfitCoin(input, Math.max(0, Number(options.recoveryCoinMaxDistance ?? DEFAULT_RECOVERY_COIN_MAX_DISTANCE)), options);
  if (!coin) return null;
  return buildPriorityCoinDecision(input, coin, 'recovery-foot-coin', options, {
    recovery: recoverySummary(input.self)
  });
}

function buildFootCoinPriorityDecision(input, reason, options = {}) {
  if (!input?.self) return null;
  const maxDistance = Math.max(0, Number(options.footCoinPriorityDistance ?? OPPORTUNITY_CONSTANTS.FOOT_COIN_PRIORITY_DISTANCE));
  const coin = pickNearestSafeProfitCoin(input, maxDistance, options);
  if (!coin) return null;
  return buildPriorityCoinDecision(input, coin, reason, options);
}

function summarizeOpportunisticShotTarget(target, options = {}) {
  if (!target) return null;
  return {
    ...summarizeTarget(target),
    id: target.user_id ?? target.userId ?? target.id ?? '',
    hp: hpValue(target),
    score: Number.isFinite(Number(target.opportunisticScore)) ? Math.round(Number(target.opportunisticScore)) : null,
    staminaCost: Number.isFinite(Number(target.opportunisticStaminaCost)) ? Math.round(Number(target.opportunisticStaminaCost)) : null,
    estimatedShots: Number.isFinite(Number(target.opportunisticEstimatedShots)) ? Math.round(Number(target.opportunisticEstimatedShots)) : null,
    reason: 'opportunistic-afk-drop-shot',
    minScoreRatio: Math.max(0, Number(options.opportunisticShotMinScoreRatio ?? BROWSER_RUNTIME_DEFAULTS.opportunisticShotMinScoreRatio ?? 1))
  };
}

function pickOpportunisticShotTarget(input, stateful = {}, options = {}) {
  if (!input?.self) return null;
  const attackRange = Math.max(0, Number(options.attackRange ?? options.combatAttackRange ?? DEFAULT_ATTACK_RANGE));
  const commitRange = Math.max(0, Number(options.afkAttackCommitRangeCm
    ?? options.afkAttackCommitRange
    ?? options.browserlessAfkAttackCommitRangeCm
    ?? DEFAULT_AFK_ATTACK_COMMIT_RANGE_CM));
  const maxShotRange = commitRange > 0 ? Math.min(attackRange, commitRange) : attackRange;
  return (input.afkTargets || [])
    .filter(target => !targetDangerousCooldownRecord(stateful, target, input.nowMs))
    .filter(target => target.alive !== false && !target.invulnerable && !target.active && !target.firing)
    .filter(target => Number(target.distance || Infinity) <= maxShotRange)
    .map(target => {
      const staminaCost = enemyStaminaCost(target, options);
      return {
        ...target,
        opportunisticScore: scoreEnemyOpportunity(target, options),
        opportunisticStaminaCost: staminaCost,
        opportunisticEstimatedShots: estimatedKillShots(target, options)
      };
    })
    .filter(target => opportunityStaminaAffordable(input.self, target.opportunisticStaminaCost, options))
    .sort((a, b) => Number(b.opportunisticScore || -Infinity) - Number(a.opportunisticScore || -Infinity)
      || entityDropValue(b) - entityDropValue(a)
      || Number(a.distance || Infinity) - Number(b.distance || Infinity))[0] || null;
}

function actionOpportunityScoreForShot(action, options = {}) {
  const explicit = Number(action?.score ?? action?.opportunityChoice?.score);
  if (Number.isFinite(explicit)) return explicit;
  const target = action?.target || {};
  if ((action?.kind === 'coin' || action?.kind === 'seek-coin') && Number(target.amount || 0) > 0) {
    return scoreCoinOpportunity({
      amount: Number(target.amount || 0),
      distance: Number(target.distance || 0),
      opportunityStaminaCost: Number.isFinite(Number(action?.staminaCost)) ? Number(action.staminaCost) : undefined
    }, options);
  }
  return -Infinity;
}

function bestCompetingEnemyOpportunityScore(opportunity, shot) {
  const shotId = shot?.user_id ?? shot?.userId ?? shot?.id ?? null;
  return (opportunity?.opportunities || [])
    .filter(candidate => String(candidate?.type || '') === 'enemy')
    .filter(candidate => {
      if (shotId === null || shotId === undefined || shotId === '') return true;
      const candidateId = candidate?.id
        ?? candidate?.sourceTarget?.user_id
        ?? candidate?.sourceTarget?.userId
        ?? null;
      return candidateId === null || candidateId === undefined || String(candidateId) !== String(shotId);
    })
    .reduce((best, candidate) => {
      const score = Number(candidate?.score);
      return Number.isFinite(score) ? Math.max(best, score) : best;
    }, -Infinity);
}

function opportunisticShotBeatsAction(action, shot, opportunity = null, options = {}) {
  const shotScore = Number(shot?.opportunisticScore ?? -Infinity);
  if (!Number.isFinite(shotScore)) return false;
  const actionScore = actionOpportunityScoreForShot(action, options);
  const competingEnemyScore = bestCompetingEnemyOpportunityScore(opportunity, shot);
  const comparisonScore = Math.max(actionScore, competingEnemyScore);
  const minRatio = Math.max(0, Number(options.opportunisticShotMinScoreRatio ?? BROWSER_RUNTIME_DEFAULTS.opportunisticShotMinScoreRatio ?? 1));
  return !Number.isFinite(comparisonScore) || comparisonScore <= 0 || shotScore >= comparisonScore * minRatio;
}

function attachOpportunisticShotDecision(action, input, stateful = {}, options = {}, opportunity = null) {
  if (!action || isRecoveringSelf(input?.self)) return action;
  if (action.opportunisticShot || action.combat) return action;
  if (action.kind !== 'coin' && action.kind !== 'seek-coin') return action;
  const shot = pickOpportunisticShotTarget(input, stateful, options);
  if (!shot || !opportunisticShotBeatsAction(action, shot, opportunity, options)) return action;
  return {
    ...action,
    opportunisticShot: summarizeOpportunisticShotTarget(shot, options)
  };
}

function buildOpportunisticShotWaitDecision(input, stateful = {}, options = {}) {
  if (!input?.self || isRecoveringSelf(input.self)) return null;
  const shot = pickOpportunisticShotTarget(input, stateful, options);
  if (!shot) return null;
  const target = summarizeOpportunisticShotTarget(shot, options);
  return {
    kind: 'opportunistic-shot',
    band: 'profit',
    reason: 'opportunistic-afk-drop-shot',
    target,
    opportunisticShot: target
  };
}

function safetyActionIsHardLeave(action) {
  return Boolean(action && (action.shouldLeave === true || action.kind === 'safety-exit' || action.kind === 'leave'));
}

function safetyActionCanYieldToInjuredFootCoin(action) {
  if (!action || safetyActionIsHardLeave(action)) return false;
  return action.kind === 'return-block-scan' || action.reason === 'return-block-lateral-scan';
}

function recoverySummary(self) {
  return {
    hp: hpValue(self),
    maxHp: maxHpValue(self) ?? 100,
    stamina5s: numberOrNull(self?.stamina_5s_remaining_milli ?? self?.stamina5sRemainingMilli),
    stamina5sLimit: numberOrNull(self?.stamina_5s_limit_milli ?? self?.stamina5sLimitMilli)
  };
}

function criticalUnknownPressureExit(input, options = {}) {
  const selfHp = hpValue(input?.self);
  const combatExit = evaluateCombatHpExitCore({ selfHp, targetHp: null }, options);
  if (combatExit?.rule !== 'critical-hp') return null;
  if (!hasLikelyIncomingBullet(input)) return null;
  return {
    kind: 'safety-exit',
    band: 'safety',
    reason: combatExit.reason,
    shouldLeave: true,
    stopMotion: true,
    self: summarizeTarget(input.self),
    combatExit: {
      ...combatExit,
      triggerSource: 'unknown-incoming-pressure'
    },
    criticalPressure: {
      selfHp,
      threshold: combatExit.threshold,
      bulletCount: Number(input?.realtime?.bulletCount || 0)
    }
  };
}

function browserlessSafetyExitModeEnabled(options = {}) {
  const mode = String(options.controlMode || '');
  return options.nonCombatProfit === true
    || mode === 'non-combat-profit'
    || mode === 'profit-live'
    || mode === 'combat-live';
}

function targetKey(target) {
  const id = target?.user_id ?? target?.userId ?? target?.id ?? target?.entity_id ?? target?.entityId;
  return id === null || id === undefined || id === '' ? '' : String(id);
}

function combatDecisionHandlesVisibleTarget(combat, target, options = {}) {
  if (!target || options.combatActionEligible === false) return false;
  const combatTarget = combat?.target || combat?.dryRun?.target || null;
  const combatKey = targetKey(combatTarget);
  const currentKey = targetKey(target);
  return Boolean(combatKey && currentKey && combatKey === currentKey);
}

function incomingBulletPressure(input) {
  const selfId = input?.self?.user_id ?? input?.self?.userId ?? input?.userId ?? null;
  const ownerIds = new Set();
  let unknownIncoming = false;
  let incomingCount = 0;
  for (const bullet of input?.bullets || []) {
    const ownerId = bulletOwnerId(bullet);
    if (ownerId === null || ownerId === undefined || ownerId === '') {
      unknownIncoming = true;
      incomingCount += 1;
      continue;
    }
    if (selfId !== null && selfId !== undefined && selfId !== '' && String(ownerId) === String(selfId)) continue;
    ownerIds.add(String(ownerId));
    incomingCount += 1;
  }
  return {
    ownerIds,
    unknownIncoming,
    incomingCount,
    hasIncoming: unknownIncoming || ownerIds.size > 0
  };
}

function recentBrowserlessCombatPressure(input, stateful, options = {}) {
  const nowMs = Number(input?.nowMs || Date.now());
  const recentMs = browserlessInjuryRecentMs(options);
  const metrics = stateful?.combatMetrics || null;
  const combatTarget = stateful?.combatTarget || null;
  const metricsId = String(metrics?.targetId ?? '');
  const combatTargetId = String(combatTarget?.id ?? '');
  const candidates = [];
  const addCandidate = (id, observedAt, source, fields = {}) => {
    if (!id || !(observedAt > 0) || observedAt > nowMs || nowMs - observedAt > recentMs) return;
    const visible = (input?.visibleTargets || []).find(target => targetKey(target) === id) || null;
    const target = visible || {
      type: 'enemy',
      id,
      userId: numberOrNull(id),
      name: fields.name || '',
      authority: 'realtime-history',
      x: numberOrNull(fields.x),
      y: numberOrNull(fields.y),
      hp: numberOrNull(fields.hp),
      maxHp: numberOrNull(fields.maxHp),
      drop: numberOrNull(fields.drop),
      distance: numberOrNull(fields.distance),
      active: Boolean(fields.active),
      moving: Boolean(fields.moving),
      firing: Boolean(fields.firing),
      alive: true,
      easyKillKnown: Boolean(fields.easyKillKnown),
      easyKillDamagedToday: Boolean(fields.easyKillDamagedToday),
      easyKillThreatExempt: Boolean(fields.easyKillThreatExempt)
    };
    candidates.push({
      key: id,
      target,
      observedAt,
      ageMs: Math.max(0, Math.round(nowMs - observedAt)),
      source
    });
  };
  const metricsObservedAt = Number(metrics?.lastObservedAt || 0);
  const metricsCombatTarget = metricsId && combatTargetId === metricsId ? combatTarget : null;
  addCandidate(metricsId, metricsObservedAt, 'recent-combat-metrics', {
    name: metrics?.targetName || metricsCombatTarget?.name || '',
    x: metricsCombatTarget?.x,
    y: metricsCombatTarget?.y,
    hp: numberOrNull(metrics?.lastTargetHp) ?? numberOrNull(metricsCombatTarget?.hp ?? metricsCombatTarget?.displayHp),
    drop: metricsCombatTarget?.drop,
    distance: metricsCombatTarget?.distance,
    active: metricsCombatTarget?.active,
    moving: metricsCombatTarget?.moving,
    firing: metricsCombatTarget?.firing,
    easyKillKnown: metricsCombatTarget?.easyKillKnown,
    easyKillDamagedToday: metricsCombatTarget?.easyKillDamagedToday,
    easyKillThreatExempt: metricsCombatTarget?.easyKillThreatExempt
  });
  addCandidate(combatTargetId, Number(combatTarget?.at || 0), 'recent-combat-target', {
    name: combatTarget?.name || '',
    x: combatTarget?.x,
    y: combatTarget?.y,
    hp: numberOrNull(combatTarget?.hp ?? combatTarget?.displayHp),
    drop: combatTarget?.drop,
    distance: combatTarget?.distance,
    active: combatTarget?.active,
    moving: combatTarget?.moving,
    firing: combatTarget?.firing,
    easyKillKnown: combatTarget?.easyKillKnown,
    easyKillDamagedToday: combatTarget?.easyKillDamagedToday,
    easyKillThreatExempt: combatTarget?.easyKillThreatExempt
  });
  candidates.sort((a, b) => b.observedAt - a.observedAt || Number(b.source === 'recent-combat-metrics') - Number(a.source === 'recent-combat-metrics'));
  return candidates[0] || null;
}

function pickBrowserlessInjuryPressure(input, stateful, options = {}) {
  const bulletPressure = incomingBulletPressure(input);
  const maxDistance = Math.max(
    Number(options.browserlessInjuryThreatRangeCm || 0),
    Number(options.profitLiveInjuryExitRange || 0),
    Number(options.activeAvoidMaxDistance || 0),
    Number(BROWSER_RUNTIME_DEFAULTS.activeAvoidMaxDistance || 0),
    DEFAULT_PROFIT_LIVE_INJURY_EXIT_RANGE
  );
  const recentCombat = recentBrowserlessCombatPressure(input, stateful, options);
  const candidates = (input?.visibleTargets || [])
    .filter(target => target?.alive !== false)
    .map(target => {
      const key = targetKey(target);
      const distance = Number(target.distance);
      const bulletOwner = Boolean(key && bulletPressure.ownerIds.has(key));
      const recentCombatTarget = Boolean(key && recentCombat?.key === key);
      const inRange = Number.isFinite(distance) && distance <= maxDistance;
      const score = (bulletOwner ? 1000000000 : 0)
        + (recentCombatTarget ? 700000000 : 0)
        + (target.firing ? 500000000 : 0)
        + (target.active ? 100000000 : 0)
        - (Number.isFinite(distance) ? distance : 0);
      return { target, key, distance, bulletOwner, recentCombatTarget, inRange, score };
    })
    .sort((a, b) => b.score - a.score);
  const bulletOwnerCandidate = candidates.find(candidate => candidate.bulletOwner) || null;
  const recentVisibleCandidate = recentCombat
    ? candidates.find(candidate => candidate.key === recentCombat.key && candidate.inRange) || null
    : null;
  const firingCandidates = candidates.filter(candidate => candidate.inRange && candidate.target.firing);
  let selected = null;
  let targetSource = 'none';
  let attributable = false;
  if (bulletOwnerCandidate) {
    selected = bulletOwnerCandidate.target;
    targetSource = 'incoming-bullet-owner';
    attributable = true;
  } else if (recentVisibleCandidate?.target?.firing) {
    selected = recentVisibleCandidate.target;
    targetSource = 'recent-combat-firing-target';
    attributable = true;
  } else if (firingCandidates.length === 1) {
    selected = firingCandidates[0].target;
    targetSource = 'single-firing-target';
    attributable = true;
  } else if (recentCombat && !recentCombat.target?.easyKillThreatExempt) {
    selected = recentVisibleCandidate?.target || recentCombat.target;
    targetSource = recentCombat.source;
  }
  return {
    target: selected,
    targetSource,
    attributable,
    recentCombatTargetKey: recentCombat?.key || '',
    recentCombatAgeMs: recentCombat?.ageMs ?? null,
    ...bulletPressure
  };
}

function browserlessInjuryRecentMs(options = {}) {
  return Math.max(1000, Number(options.browserlessInjuryLeaveRecentMs || 6000));
}

function attributeBrowserlessHpDropToBullet(input, stateful, hpDrop, nowMs, options = {}) {
  const previousRisk = stateful?.browserlessLeaveRisk || null;
  const observations = (Array.isArray(previousRisk?.bulletObservations) ? previousRisk.bulletObservations : [])
    .filter(observation => nowMs - Number(observation.at || 0) <= 2500);
  const selectedPrediction = previousRisk?.lastCover?.selectedThreatPrediction || null;
  const fallbackPredictions = (selectedPrediction?.dangerousBullets || []).map(item => ({
    ...item,
    at: Number(previousRisk?.at || nowMs),
    observedTick: numberOrNull(previousRisk?.tick),
    pendingVelocityCommand: cloneJson(selectedPrediction?.pendingVelocityCommand || null),
    predictedVelocitySchedule: cloneJson(selectedPrediction?.predictedVelocitySchedule || []),
    commandDelayTicks: numberOrNull(selectedPrediction?.commandDelayTicks)
  }));
  const predictionHistory = [
    ...(Array.isArray(previousRisk?.bulletPredictionHistory) ? previousRisk.bulletPredictionHistory : []),
    ...fallbackPredictions
  ].filter(prediction => nowMs - Number(prediction.at || 0) <= 2500);
  const currentIds = new Set((input?.bullets || []).map(leaveRiskBulletId).filter(Boolean));
  const currentTick = numberOrNull(input?.realtime?.tick);
  const timingToleranceMs = Math.max(150, Number(options.combatHitAttributionTimingToleranceMs || 500));
  const hitRadius = Math.max(1, Number(options.combatBulletHitRadiusCm || 200));
  const candidates = observations.flatMap(observation => {
    const id = String(observation.id || '');
    const matchingPredictions = predictionHistory.filter(prediction => {
      if (String(prediction?.bulletId || '') !== id) return false;
      if (prediction.ownerId !== null && prediction.ownerId !== undefined
        && observation.ownerId !== null && observation.ownerId !== undefined
        && String(prediction.ownerId) !== String(observation.ownerId)) return false;
      if (numberOrNull(prediction.createdTick) !== null && numberOrNull(observation.createdTick) !== null
        && Number(prediction.createdTick) !== Number(observation.createdTick)) return false;
      return true;
    });
    const variants = matchingPredictions.length ? matchingPredictions : [null];
    return variants.map(prediction => {
      const expectedImpactAt = Number(prediction?.at ?? observation.at ?? 0)
        + Math.max(0, Number(prediction?.timeToImpact ?? observation.timeToImpact ?? 0));
      const timingErrorMs = Number.isFinite(expectedImpactAt) ? Math.abs(nowMs - expectedImpactAt) : Infinity;
      const disappeared = !currentIds.has(id);
      const expiredNearNow = currentTick !== null && Number.isFinite(Number(observation.expireTick))
        ? currentTick >= Number(observation.expireTick) - 1
        : false;
      const predictedCpa = numberOrNull(prediction?.cpa);
      const observedCpa = numberOrNull(observation.cpa);
      const trajectoryClose = Math.min(
        predictedCpa === null ? Infinity : predictedCpa,
        observedCpa === null ? Infinity : observedCpa
      ) <= hitRadius * 1.5;
      const plausible = Boolean(prediction)
        && timingErrorMs <= timingToleranceMs
        && (disappeared || expiredNearNow || trajectoryClose);
      return {
        observation,
        prediction,
        expectedImpactAt,
        timingErrorMs,
        disappeared,
        expiredNearNow,
        trajectoryClose,
        plausible,
        score: (plausible ? 0 : 100000)
          + timingErrorMs
          + (prediction ? 0 : 1000)
          + (disappeared ? 0 : 250)
      };
    });
  }).sort((left, right) => left.score - right.score);
  const matched = candidates.find(candidate => candidate.plausible) || null;
  let classification = 'unmatched-hit';
  if (matched?.prediction?.predictedHit) classification = 'matched-hit';
  else if (matched) classification = 'predicted-safe-false-negative';
  const matchedCommand = matched?.prediction?.pendingVelocityCommand || selectedPrediction?.pendingVelocityCommand || null;
  const actualTransitions = input?.command?.movement?.actualVelocityTransitions || [];
  const actualTransition = matchedCommand?.commandId === null || matchedCommand?.commandId === undefined
    ? null
    : actualTransitions.find(item => String(item?.commandId ?? '') === String(matchedCommand.commandId)) || null;
  const predictedSchedule = matched?.prediction?.predictedVelocitySchedule
    || selectedPrediction?.predictedVelocitySchedule
    || [];
  const predictedCommand = matchedCommand?.commandId === null || matchedCommand?.commandId === undefined
    ? null
    : predictedSchedule.find(item => String(item?.commandId ?? '') === String(matchedCommand.commandId)) || null;
  const expectedEffectiveTick = numberOrNull(matchedCommand?.expectedEffectiveTick)
    ?? (numberOrNull(matched?.prediction?.observedTick) !== null && numberOrNull(predictedCommand?.effectiveAfterTicks) !== null
      ? Number(matched.prediction.observedTick) + Number(predictedCommand.effectiveAfterTicks)
      : null);
  const actualEffectiveTick = numberOrNull(actualTransition?.tick);
  const attribution = {
    classification,
    hpDrop: Math.round(Number(hpDrop || 0) * 10) / 10,
    bulletId: matched?.observation?.id || '',
    ownerId: matched?.observation?.ownerId || '',
    createdTick: numberOrNull(matched?.observation?.createdTick),
    expireTick: numberOrNull(matched?.observation?.expireTick),
    observedTick: numberOrNull(matched?.observation?.observedTick),
    damageTick: currentTick,
    observedAt: numberOrNull(matched?.observation?.at),
    expectedImpactAt: Number.isFinite(Number(matched?.expectedImpactAt)) ? Number(matched.expectedImpactAt) : null,
    timingErrorMs: Number.isFinite(Number(matched?.timingErrorMs)) ? Math.round(Number(matched.timingErrorMs)) : null,
    disappeared: Boolean(matched?.disappeared),
    predictedHit: Boolean(matched?.prediction?.predictedHit),
    predictedCpa: numberOrNull(matched?.prediction?.cpa),
    predictedTti: numberOrNull(matched?.prediction?.timeToImpact),
    observedCpa: numberOrNull(matched?.observation?.cpa),
    observedTti: numberOrNull(matched?.observation?.timeToImpact),
    owner: matched?.prediction?.ownerId ?? matched?.observation?.ownerId ?? null,
    pendingVelocityCommand: cloneJson(matchedCommand),
    predictedVelocitySchedule: cloneJson(predictedSchedule),
    commandDelayTicks: numberOrNull(matched?.prediction?.commandDelayTicks ?? selectedPrediction?.commandDelayTicks),
    expectedCommandEffectiveTick: expectedEffectiveTick,
    actualCommandEffectiveTick: actualEffectiveTick,
    commandTimingErrorTicks: expectedEffectiveTick !== null && actualEffectiveTick !== null
      ? actualEffectiveTick - expectedEffectiveTick
      : null,
    movementCommandMatched: Boolean(actualTransition),
    candidateDirection: matched?.prediction ? {
      dx: Number(matched.prediction.dx || 0),
      dy: Number(matched.prediction.dy || 0)
    } : null
  };
  stateful.combatHitAttributionHistory = [
    ...(Array.isArray(stateful.combatHitAttributionHistory) ? stateful.combatHitAttributionHistory : []),
    attribution
  ].slice(-32);
  const summary = stateful.combatHitAttributionSummary && typeof stateful.combatHitAttributionSummary === 'object'
    ? stateful.combatHitAttributionSummary
    : { total: 0, matchedHit: 0, unmatchedHit: 0, predictedSafeFalseNegative: 0 };
  summary.total += 1;
  if (classification === 'matched-hit') summary.matchedHit += 1;
  else if (classification === 'predicted-safe-false-negative') summary.predictedSafeFalseNegative += 1;
  else summary.unmatchedHit += 1;
  stateful.combatHitAttributionSummary = summary;
  return attribution;
}

function rememberBrowserlessInjury(input, stateful, options = {}) {
  if (!stateful || typeof stateful !== 'object') return null;
  const nowMs = Number(input?.nowMs || Date.now());
  const self = input?.self || null;
  const hp = hpValue(self);
  const key = targetKey(self);
  const previous = stateful.browserlessLastSelf || null;
  const recentMs = browserlessInjuryRecentMs(options);
  const minDrop = Math.max(0.1, Number(options.browserlessInjuryLeaveMinHpDrop || 1));
  if (!self || hp === null || !key) {
    stateful.browserlessLastSelf = null;
    return stateful.browserlessInjury || null;
  }
  if (previous && String(previous.key || '') === key) {
    const previousHp = Number(previous.hp);
    const hpDrop = previousHp - hp;
    if (Number.isFinite(previousHp) && hpDrop >= minDrop) {
      const pressure = pickBrowserlessInjuryPressure(input, stateful, options);
      const hitAttribution = attributeBrowserlessHpDropToBullet(input, stateful, hpDrop, nowMs, options);
      stateful.browserlessInjury = {
        at: nowMs,
        previousHp,
        currentHp: hp,
        hpDrop: Math.round(hpDrop * 10) / 10,
        targetKey: targetKey(pressure.target),
        target: summarizeTarget(pressure.target),
        targetSource: pressure.targetSource,
        attributable: pressure.attributable,
        recentCombatTargetKey: pressure.recentCombatTargetKey,
        recentCombatAgeMs: pressure.recentCombatAgeMs,
        hasIncoming: pressure.hasIncoming,
        unknownIncoming: pressure.unknownIncoming,
        incomingCount: pressure.incomingCount,
        hitAttribution,
        reason: 'self-hp-drop'
      };
    }
  }
  stateful.browserlessLastSelf = {
    key,
    hp,
    x: numberOrNull(self.x),
    y: numberOrNull(self.y),
    at: nowMs
  };
  const injury = stateful.browserlessInjury || null;
  if (injury && nowMs - Number(injury.at || 0) > recentMs) {
    stateful.browserlessInjury = null;
    return null;
  }
  return stateful.browserlessInjury || null;
}

function browserlessInjuryTarget(injury, currentPressure) {
  const rememberedTarget = injury?.target || null;
  const rememberedKey = String(injury?.targetKey || targetKey(rememberedTarget) || '');
  const currentTarget = currentPressure?.target || null;
  const currentKey = targetKey(currentTarget);
  if (currentTarget && (!rememberedKey || currentKey === rememberedKey)) return currentTarget;
  return rememberedTarget || currentTarget;
}

function resolveBrowserlessPressureActor(input, stateful, combat, options = {}, context = {}) {
  const currentPressure = context.currentPressure
    || pickBrowserlessInjuryPressure(input, stateful, options);
  const injury = context.injury || stateful?.browserlessInjury || null;
  const ownerIds = Array.from(new Set((context.ownerIds || [])
    .map(value => String(value || ''))
    .filter(Boolean)));
  const singleOwnerId = ownerIds.length === 1 ? ownerIds[0] : '';
  const ownerTarget = singleOwnerId
    ? (input?.visibleTargets || []).find(target => targetKey(target) === singleOwnerId) || null
    : null;
  const injuryTarget = browserlessInjuryTarget(injury, currentPressure);
  const actor = ownerTarget || injuryTarget || currentPressure?.target || null;
  const actorId = targetKey(actor)
    || singleOwnerId
    || String(injury?.targetKey || '');
  const combatTarget = combat?.target || combat?.dryRun?.target || null;
  const combatTargetId = targetKey(combatTarget);
  const actorMatchesCombatTarget = Boolean(actorId && combatTargetId && actorId === combatTargetId);
  const actorInvulnerable = Boolean(actor && isInvulnerableEntity(actor));
  const actorVisible = Boolean(actorId && (input?.visibleTargets || []).some(target => targetKey(target) === actorId));
  const actorAttackable = Boolean(
    actor
      && actor.alive !== false
      && actorVisible
      && !actorInvulnerable
  );
  const combatCanHandlePressure = Boolean(
    actorMatchesCombatTarget
      && actorAttackable
      && options.combatActionEligible !== false
  );
  const actorSource = ownerTarget
    ? 'incoming-bullet-owner'
    : (currentPressure?.target && targetKey(currentPressure.target) === actorId
      ? currentPressure.targetSource
      : (injury?.targetSource || 'unknown'));
  const attributionConfidence = ownerTarget
    ? 'direct-owner'
    : (currentPressure?.attributable
      ? 'attributed-current-pressure'
      : (injury?.attributable ? 'remembered-attribution' : (actorId ? 'remembered-pressure' : 'unknown')));
  let suppressionReason = 'no-established-combat-suppression';
  if (combatCanHandlePressure) suppressionReason = 'same-attackable-actor-established-combat';
  else if (!actorId) suppressionReason = 'pressure-actor-unknown';
  else if (!combatTargetId) suppressionReason = 'combat-target-missing';
  else if (!actorMatchesCombatTarget) suppressionReason = 'pressure-actor-differs-from-combat-target';
  else if (actorInvulnerable) suppressionReason = 'pressure-actor-invulnerable';
  else if (!actorVisible) suppressionReason = 'pressure-actor-not-visible';
  else if (!actorAttackable) suppressionReason = 'pressure-actor-not-attackable';
  else if (options.combatActionEligible === false) suppressionReason = 'combat-action-ineligible';
  return {
    actor,
    actorId: actorId || null,
    actorSource,
    combatTargetId: combatTargetId || null,
    actorMatchesCombatTarget,
    actorAttackable,
    actorInvulnerable,
    actorVisible,
    attributionConfidence,
    combatCanHandlePressure,
    suppressionReason
  };
}

function browserlessEngagedTargetHpEvidence(input, combat, pressureTargets = [], ownerIds = []) {
  const ownerKeys = new Set((ownerIds || []).map(value => String(value || '')).filter(Boolean));
  const byId = new Map();
  const add = (target, source) => {
    if (!target || target.alive === false) return;
    const id = targetKey(target);
    const hp = hpValue(target);
    if (!id || hp === null || byId.has(id)) return;
    byId.set(id, { id, hp, source, target });
  };
  add(combat?.target || combat?.dryRun?.target, 'combat-target');
  for (const target of pressureTargets || []) add(target, 'pressure-target');
  for (const target of input?.visibleTargets || []) {
    if (ownerKeys.has(targetKey(target))) add(target, 'incoming-bullet-owner');
  }
  const targets = Array.from(byId.values());
  const averageHp = targets.length
    ? targets.reduce((total, item) => total + item.hp, 0) / targets.length
    : null;
  return {
    targetHp: averageHp === null ? null : Math.round(averageHp * 10) / 10,
    source: targets.length > 1 ? 'engaged-target-average' : (targets[0]?.source || 'unknown'),
    targetCount: targets.length,
    targets: targets.map(item => ({
      id: item.id,
      name: entityDisplayName(item.target),
      hp: item.hp,
      source: item.source
    }))
  };
}

function browserlessInjuryTargetHpEvidence(stateful, target, injury, nowMs, options = {}) {
  const targetId = targetKey(target) || String(injury?.targetKey || '');
  const metrics = stateful?.combatMetrics || null;
  const metricsId = String(metrics?.targetId ?? '');
  const lastObservedAt = Number(metrics?.lastObservedAt || 0);
  const metricsRecent = Boolean(
    targetId
      && metricsId === targetId
      && lastObservedAt > 0
      && lastObservedAt <= nowMs
      && nowMs - lastObservedAt <= browserlessInjuryRecentMs(options)
  );
  const metricsHp = metricsRecent ? numberOrNull(metrics?.lastTargetHp) : null;
  if (metricsHp !== null) {
    return {
      targetHp: metricsHp,
      source: 'recent-realtime-combat-metrics',
      ageMs: Math.max(0, Math.round(nowMs - lastObservedAt))
    };
  }
  return {
    targetHp: hpValue(target) ?? hpValue(injury?.target),
    source: target ? 'current-pressure-target' : (injury?.target ? 'remembered-pressure-target' : 'unknown'),
    ageMs: null
  };
}

function buildBrowserlessInjuryHpExitDecision(input, stateful, combat, options = {}) {
  const injury = rememberBrowserlessInjury(input, stateful, options);
  if (options.browserlessInjuryLeaveEnabled === false) return null;
  if (!browserlessSafetyExitModeEnabled(options) || !input?.self || !injury) return null;
  const currentPressure = pickBrowserlessInjuryPressure(input, stateful, options);
  const pressureActor = resolveBrowserlessPressureActor(input, stateful, combat, options, {
    injury,
    currentPressure
  });
  if (pressureActor.combatCanHandlePressure) return null;
  const target = pressureActor.actor;
  if (!target && !injury.hasIncoming && !currentPressure.hasIncoming) return null;
  const nowMs = Number(input.nowMs || Date.now());
  const directTargetHpEvidence = browserlessInjuryTargetHpEvidence(stateful, target, injury, nowMs, options);
  const engagedTargetHpEvidence = browserlessEngagedTargetHpEvidence(input, combat, [target]);
  const targetHpEvidence = engagedTargetHpEvidence.targetCount > 1
    ? engagedTargetHpEvidence
    : directTargetHpEvidence;
  const currentPressureMatches = targetKey(currentPressure.target) === targetKey(target);
  const pressureTargetSource = currentPressureMatches
    ? currentPressure.targetSource
    : (injury.targetSource || 'unknown');
  const combatExit = evaluateCombatHpExitCore({
    selfHp: hpValue(input.self),
    targetHp: targetHpEvidence.targetHp
  }, options);
  if (!combatExit) return null;
  return {
    kind: 'safety-exit',
    band: 'safety',
    reason: combatExit.reason,
    shouldLeave: true,
    stopMotion: true,
    self: summarizeTarget(input.self),
    target: summarizeTarget(target) || injury.target || null,
    combatExit: {
      ...combatExit,
      target: summarizeTarget(target) || injury.target || null,
      triggerSource: 'recent-injury-pressure',
      pressureTargetSource,
      targetHpSource: targetHpEvidence.source,
      targetHpAgeMs: targetHpEvidence.ageMs,
      engagedTargetCount: engagedTargetHpEvidence.targetCount,
      engagedTargets: engagedTargetHpEvidence.targets
    },
    injury: {
      previousHp: numberOrNull(injury.previousHp),
      currentHp: hpValue(input.self),
      hpDrop: numberOrNull(injury.hpDrop),
      ageMs: Math.max(0, Math.round(nowMs - Number(injury.at || nowMs))),
      hasIncoming: Boolean(injury.hasIncoming || currentPressure.hasIncoming),
      unknownIncoming: Boolean(injury.unknownIncoming || currentPressure.unknownIncoming),
      incomingCount: Number(currentPressure.incomingCount || injury.incomingCount || 0),
      targetSource: pressureTargetSource,
      attributable: Boolean(currentPressureMatches ? currentPressure.attributable : injury.attributable),
      recentCombatTargetKey: String(injury.recentCombatTargetKey || currentPressure.recentCombatTargetKey || ''),
      recentCombatAgeMs: numberOrNull(injury.recentCombatAgeMs ?? currentPressure.recentCombatAgeMs),
      exitRule: combatExit.rule,
      evaluatedTargetHp: targetHpEvidence.targetHp,
      targetHpSource: targetHpEvidence.source,
      engagedTargetCount: engagedTargetHpEvidence.targetCount,
      engagedTargets: engagedTargetHpEvidence.targets,
      pressureActor: {
        actorId: pressureActor.actorId,
        actorSource: pressureActor.actorSource,
        combatTargetId: pressureActor.combatTargetId,
        actorMatchesCombatTarget: pressureActor.actorMatchesCombatTarget,
        actorAttackable: pressureActor.actorAttackable,
        actorInvulnerable: pressureActor.actorInvulnerable,
        attributionConfidence: pressureActor.attributionConfidence,
        suppressionReason: pressureActor.suppressionReason
      }
    }
  };
}

function leaveRiskBulletId(bullet) {
  return String(
    bullet?.bullet_id
      ?? bullet?.bulletId
      ?? `${bullet?.createdTick ?? bullet?.created_tick ?? ''}:${bullet?.startX ?? bullet?.start_x ?? bullet?.x ?? ''}:${bullet?.startY ?? bullet?.start_y ?? bullet?.y ?? ''}`
  );
}

function compactLeaveCover(cover) {
  if (!cover) return null;
  const { threatField = [], ...summary } = cover;
  const selected = (Array.isArray(threatField) ? threatField : []).find(candidate => (
    Number(candidate?.dx || 0) === Number(cover.dx || 0)
      && Number(candidate?.dy || 0) === Number(cover.dy || 0)
  )) || null;
  return {
    ...summary,
    selectedThreatPrediction: selected ? {
      dx: Number(selected.dx || 0),
      dy: Number(selected.dy || 0),
      directHits: Number(selected.directHits || 0),
      unavoidableHits: Number(selected.unavoidableHits || 0),
      minCPA: numberOrNull(selected.minCPA),
      minTTI: numberOrNull(selected.minTTI),
      commandDelayTicks: numberOrNull(selected.commandDelayTicks),
      pendingVelocityCommand: cloneJson(selected.pendingVelocityCommand || null),
      predictedVelocitySchedule: cloneJson(selected.predictedVelocitySchedule || []),
      dangerousBullets: cloneJson(selected.dangerousBullets || [])
    } : null
  };
}

function recentCombatResidualThreatContinuityCore(input = {}) {
  const nowMs = Number(input.nowMs || Date.now());
  const ownerIds = Array.from(new Set((input.ownerIds || []).map(String).filter(Boolean)));
  const ownerId = ownerIds.length === 1 ? ownerIds[0] : '';
  const metrics = input.recentCombatMetrics && typeof input.recentCombatMetrics === 'object'
    ? input.recentCombatMetrics
    : {};
  const settlement = input.postKillSettlement && typeof input.postKillSettlement === 'object'
    ? input.postKillSettlement
    : null;
  const recentTargetId = String(
    input.recentCombatTargetId
      ?? settlement?.targetId
      ?? metrics.targetId
      ?? ''
  );
  const metricsTargetId = String(metrics.targetId ?? '');
  const metricsMatch = Boolean(!metricsTargetId || !recentTargetId || metricsTargetId === recentTargetId);
  const lastObservedAt = Number(metrics.lastObservedAt || input.recentCombatLastObservedAt || 0);
  const startedAt = Number(metrics.startedAt || input.recentCombatStartedAt || 0);
  const maxAgeMs = Math.max(500, Number(input.maxAgeMs || 2000));
  const ageMs = lastObservedAt > 0 ? Math.max(0, nowMs - lastObservedAt) : null;
  const establishedEvidence = Boolean(metricsMatch && (
    Number(metrics.acceptedShots || 0) > 0
      || (startedAt > 0 && nowMs - startedAt >= 1000)
  ));
  const settlementActive = Boolean(
    settlement
      && settlement.active !== false
      && String(settlement.targetId ?? '') === recentTargetId
      && (!Number(settlement.expiresAt) || Number(settlement.expiresAt) >= nowMs)
  );
  const sameOwner = Boolean(ownerId && recentTargetId && ownerId === recentTargetId);
  const recentEstablished = Boolean(
    sameOwner
      && establishedEvidence
      && ageMs !== null
      && ageMs <= maxAgeMs
  );
  const active = Boolean(sameOwner && (settlementActive || recentEstablished));
  return {
    active,
    reason: active
      ? (settlementActive ? 'post-kill-settlement-residual-threat' : 'recent-established-combat-residual-threat')
      : '',
    ownerId: ownerId || null,
    recentTargetId: recentTargetId || null,
    ageMs,
    maxAgeMs,
    metricsMatch,
    establishedEvidence,
    settlementActive,
    recentEstablished
  };
}

function buildBrowserlessPredictedThreatExitDecision(state, input, stateful, combat, options = {}) {
  if (!browserlessSafetyExitModeEnabled(options) || !input?.self) return null;
  const nowMs = Number(input.nowMs || Date.now());
  const selfHp = hpValue(input.self);
  if (selfHp === null) return null;
  const maxHp = maxHpValue(input.self) ?? 100;
  const pendingCover = buildLeavePendingCover(state, {
    triggerDecision: {
      action: combat?.exitAction || combat?.action || null,
      combat: combat?.dryRun || null
    },
    target: combat?.target || null,
    lastCover: stateful?.browserlessLeaveRisk?.lastCover || null
  }, {
    ...options,
    nowMs
  })?.cover || null;
  const incoming = normalizedIncomingBullets(state, input.self, options)
    .filter(bullet => incomingBulletHasCollisionRiskCore(bullet, options))
    .filter(bullet => {
      const ownerId = String(bullet?.ownerId ?? '');
      if (!ownerId) return true;
      const target = (input.visibleTargets || []).find(item => targetKey(item) === ownerId) || null;
      return !target?.easyKillThreatExempt;
    });
  const ownerIds = Array.from(new Set(incoming
    .map(bullet => String(bullet?.ownerId ?? ''))
    .filter(Boolean)));
  const previous = stateful.browserlessLeaveRisk && typeof stateful.browserlessLeaveRisk === 'object'
    ? stateful.browserlessLeaveRisk
    : {};
  const hpSamples = (Array.isArray(previous.hpSamples) ? previous.hpSamples : [])
    .filter(sample => nowMs - Number(sample.at || 0) <= 2500);
  const lastHpSample = hpSamples[hpSamples.length - 1] || null;
  if (!lastHpSample
    || Number(lastHpSample.hp) !== selfHp
    || Number(lastHpSample.tick) !== Number(input.realtime?.tick)) {
    hpSamples.push({ at: nowMs, tick: input.realtime?.tick ?? null, hp: selfHp });
  }
  const recentHpSamples = hpSamples.filter(sample => nowMs - Number(sample.at || 0) <= 1250);
  const peakSample = recentHpSamples.slice().sort((a, b) => Number(b.hp) - Number(a.hp) || Number(a.at) - Number(b.at))[0] || null;
  const recentDamage = peakSample ? Math.max(0, Number(peakSample.hp) - selfHp) : 0;
  const recentDamageWindowMs = recentDamage > 0 && peakSample
    ? Math.max(0, nowMs - Number(peakSample.at || nowMs))
    : 0;
  const bulletObservations = (Array.isArray(previous.bulletObservations) ? previous.bulletObservations : [])
    .filter(item => nowMs - Number(item.at || 0) <= 1500);
  const observedIds = new Set(bulletObservations.map(item => item.id));
  for (const bullet of incoming) {
    const id = leaveRiskBulletId(bullet);
    if (!id || observedIds.has(id)) continue;
    observedIds.add(id);
    bulletObservations.push({
      id,
      ownerId: String(bullet.ownerId ?? ''),
      at: nowMs,
      observedTick: numberOrNull(input.realtime?.tick),
      createdTick: numberOrNull(bullet.createdTick ?? bullet.created_tick),
      expireTick: numberOrNull(bullet.expireTick ?? bullet.expire_tick),
      speed: numberOrNull(bullet.speed),
      timeToImpact: numberOrNull(bullet.timeToImpact),
      cpa: numberOrNull(bullet.cpa),
      x: numberOrNull(bullet.x),
      y: numberOrNull(bullet.y),
      direction: bullet.direction ? {
        dx: numberOrNull(bullet.direction.dx),
        dy: numberOrNull(bullet.direction.dy)
      } : null
    });
  }
  const commandDelayTicks = Math.max(0, Number(
    state?.command?.shooting?.timing?.p90Ticks
      ?? state?.command?.shooting?.executionDelay?.p90Ticks
      ?? 5
  ));
  const prediction = evaluatePredictedLeaveHpCore({
    selfHp,
    directHits: pendingCover?.directHits,
    unavoidableHits: pendingCover?.unavoidableHits,
    recentDamage,
    recentDamageWindowMs,
    commandDelayMs: commandDelayTicks * 50
  }, options);
  const previousAction = stateful.lastDecisionAction || null;
  const previousBand = String(previousAction?.band || '');
  const previousReason = String(previousAction?.reason || '');
  const combatDurationMs = Math.max(0, Number(combat?.dryRun?.durationMs || 0));
  const residualThreatContinuity = recentCombatResidualThreatContinuityCore({
    nowMs,
    ownerIds,
    recentCombatTargetId: targetIdForAttackHistory(options.recentCombatTarget),
    recentCombatMetrics: options.recentCombatMetrics || stateful.combatMetrics,
    postKillSettlement: options.postKillSettlement || stateful.postKillSettlement,
    maxAgeMs: options.recentCombatResidualThreatMs
  });
  const ownerTarget = ownerIds.length === 1
    ? (input.visibleTargets || []).find(target => targetKey(target) === ownerIds[0] && !target.easyKillThreatExempt) || null
    : null;
  const attributableIncoming = ownerIds.length === 1 && incoming.length > 0;
  const attributedOwnerTarget = ownerTarget || (attributableIncoming
    ? { userId: numberOrNull(ownerIds[0]) ?? ownerIds[0] }
    : null);
  const sameOwnerDistinctBullets = ownerIds.length === 1
    ? new Set(bulletObservations.filter(item => item.ownerId === ownerIds[0]).map(item => item.id)).size
    : 0;
  const continuousIncoming = attributableIncoming && sameOwnerDistinctBullets >= 2;
  const injury = stateful.browserlessInjury || null;
  const currentPressure = pickBrowserlessInjuryPressure(input, stateful, options);
  const pressureActor = resolveBrowserlessPressureActor(input, stateful, combat, options, {
    injury,
    currentPressure,
    ownerIds
  });
  const engagedTargetHpEvidence = browserlessEngagedTargetHpEvidence(
    input,
    combat,
    [pressureActor.actor, ownerTarget],
    ownerIds
  );
  const staticHpExit = engagedTargetHpEvidence.targetCount > 1
    ? evaluateCombatHpExitCore({
        selfHp,
        targetHp: engagedTargetHpEvidence.targetHp
      }, options)
    : null;
  const combatEstablished = Boolean(
    pressureActor.combatCanHandlePressure
      || residualThreatContinuity.active
  );
  const recovering = previousBand === 'recover'
    || /recover|wait-for-full-stamina-and-hp/i.test(previousReason);
  const unestablished = !combatEstablished;
  const rapidDamage = recentDamage >= Math.max(3, Number(options.leavePredictionRapidDamageHp || 6))
    && recentDamageWindowMs > 0
    && recentDamageWindowMs <= Math.max(500, Number(options.leavePredictionRapidDamageWindowMs || 1000))
    && Boolean(attributableIncoming || injury?.attributable || injury?.hasIncoming);
  let reason = '';
  let rule = '';
  if (prediction?.shouldLeave) {
    reason = prediction.reason;
    rule = prediction.rule;
  } else if (staticHpExit) {
    reason = staticHpExit.reason;
    rule = staticHpExit.rule;
  }
  const target = pressureActor.actor
    || attributedOwnerTarget
    || combat?.target
    || browserlessInjuryTarget(injury, currentPressure);
  let lastCover = compactLeaveCover(pendingCover);
  if (!lastCover?.selectedThreatPrediction
    && previous.lastCover?.selectedThreatPrediction
    && nowMs - Number(previous.lastCover.atMs || previous.at || 0) <= 1500) {
    lastCover = {
      ...(lastCover || {}),
      selectedThreatPrediction: cloneJson(previous.lastCover.selectedThreatPrediction)
    };
  }
  const bulletPredictionHistory = (Array.isArray(previous.bulletPredictionHistory)
    ? previous.bulletPredictionHistory
    : [])
    .filter(item => nowMs - Number(item.at || 0) <= 2500);
  const selectedThreatPrediction = lastCover?.selectedThreatPrediction || null;
  for (const bullet of selectedThreatPrediction?.dangerousBullets || []) {
    const bulletId = String(bullet?.bulletId || '');
    if (!bulletId) continue;
    const entry = {
      ...cloneJson(bullet),
      at: nowMs,
      observedTick: numberOrNull(input.realtime?.tick),
      dx: Number(selectedThreatPrediction.dx || 0),
      dy: Number(selectedThreatPrediction.dy || 0),
      commandDelayTicks: numberOrNull(selectedThreatPrediction.commandDelayTicks),
      pendingVelocityCommand: cloneJson(selectedThreatPrediction.pendingVelocityCommand || null),
      predictedVelocitySchedule: cloneJson(selectedThreatPrediction.predictedVelocitySchedule || [])
    };
    const duplicateIndex = bulletPredictionHistory.findIndex(item => (
      String(item?.bulletId || '') === bulletId
        && Number(item?.observedTick ?? -1) === Number(entry.observedTick ?? -1)
        && Number(item?.dx || 0) === entry.dx
        && Number(item?.dy || 0) === entry.dy
    ));
    if (duplicateIndex >= 0) bulletPredictionHistory[duplicateIndex] = entry;
    else bulletPredictionHistory.push(entry);
  }
  const assessment = {
    at: nowMs,
    tick: input.realtime?.tick ?? null,
    selfHp,
    maxHp,
    recovering,
    combatEstablished,
    combatDurationMs,
    residualThreatContinuity,
    incomingCount: incoming.length,
    ownerIds,
    attributableIncoming,
    sameOwnerDistinctBullets,
    continuousIncoming,
    recentDamage,
    recentDamageWindowMs,
    rapidDamage,
    engagedTargetHp: engagedTargetHpEvidence.targetHp,
    engagedTargetHpSource: engagedTargetHpEvidence.source,
    engagedTargetCount: engagedTargetHpEvidence.targetCount,
    engagedTargets: engagedTargetHpEvidence.targets,
    pressureActor: {
      actorId: pressureActor.actorId,
      actorSource: pressureActor.actorSource,
      combatTargetId: pressureActor.combatTargetId,
      actorMatchesCombatTarget: pressureActor.actorMatchesCombatTarget,
      actorAttackable: pressureActor.actorAttackable,
      actorInvulnerable: pressureActor.actorInvulnerable,
      attributionConfidence: pressureActor.attributionConfidence,
      suppressionReason: pressureActor.suppressionReason
    },
    prediction,
    lastCover,
    hpSamples: hpSamples.slice(-32),
    bulletObservations: bulletObservations.slice(-32),
    bulletPredictionHistory: bulletPredictionHistory.slice(-64),
    rule,
    reason
  };
  stateful.browserlessLeaveRisk = assessment;
  if (!reason) {
    const dodgeDx = Number(pendingCover?.dx || 0);
    const dodgeDy = Number(pendingCover?.dy || 0);
    if (!combat?.target && residualThreatContinuity.active && incoming.length && (dodgeDx || dodgeDy)) {
      return {
        kind: 'flee',
        band: 'safety',
        reason: 'post-combat-residual-bullet-dodge',
        shouldLeave: false,
        stopMotion: false,
        dx: dodgeDx,
        dy: dodgeDy,
        target: summarizeTarget(options.recentCombatTarget || attributedOwnerTarget),
        threats: [],
        residualThreatContinuity,
        leaveRisk: {
          ...assessment,
          hpSamples: undefined,
          bulletObservations: undefined,
          bulletPredictionHistory: undefined
        }
      };
    }
    return null;
  }
  return {
    kind: 'safety-exit',
    band: 'safety',
    reason,
    shouldLeave: true,
    stopMotion: false,
    self: summarizeTarget(input.self),
    target: summarizeTarget(target),
    combatExit: {
      shouldLeave: true,
      policy: prediction?.shouldLeave ? prediction.policy : staticHpExit?.policy,
      rule,
      reason,
      selfHp,
      targetHp: engagedTargetHpEvidence.targetHp,
      targetHpSource: engagedTargetHpEvidence.source,
      engagedTargetCount: engagedTargetHpEvidence.targetCount,
      engagedTargets: engagedTargetHpEvidence.targets,
      predictedLeave: prediction,
      triggerSource: 'realtime-leave-risk'
    },
    leaveRisk: {
      ...assessment,
      hpSamples: undefined,
      bulletObservations: undefined,
      bulletPredictionHistory: undefined
    }
  };
}

function browserlessPursuitThresholdMs(self, threat, options = {}) {
  const normalMs = Math.max(0, Number(options.pursuitLeaveMs ?? BROWSER_RUNTIME_DEFAULTS.pursuitLeaveMs ?? 300000));
  const nonFullHp = isInjuredSelf(self, options);
  const invulnerable = Boolean(threat?.invulnerable);
  const candidates = [normalMs];
  if (nonFullHp) candidates.push(Math.max(0, Number(options.pursuitLeaveNonFullHpMs ?? BROWSER_RUNTIME_DEFAULTS.pursuitLeaveNonFullHpMs ?? normalMs)));
  if (invulnerable) candidates.push(Math.max(0, Number(options.pursuitLeaveInvulnerableMs ?? BROWSER_RUNTIME_DEFAULTS.pursuitLeaveInvulnerableMs ?? normalMs)));
  if (nonFullHp && invulnerable) {
    candidates.push(Math.max(0, Number(options.pursuitLeaveNonFullHpInvulnerableMs
      ?? BROWSER_RUNTIME_DEFAULTS.pursuitLeaveNonFullHpInvulnerableMs
      ?? options.pursuitLeaveInvulnerableMs
      ?? options.pursuitLeaveNonFullHpMs
      ?? normalMs)));
  }
  return Math.max(0, Math.min(...candidates.filter(value => Number.isFinite(value))));
}

function browserlessPursuitPressure(input, threat, previous, options = {}) {
  if (!input?.self || !threat || threat.alive === false) return null;
  const distance = Number(threat.distance ?? distanceBetween(input.self, threat));
  const trackRadius = Math.max(0, Number(options.pursuitTrackRadius ?? BROWSER_RUNTIME_DEFAULTS.pursuitTrackRadius ?? 42000));
  if (!Number.isFinite(distance) || distance > trackRadius) return null;
  const id = targetKey(threat);
  if (!id) return null;
  const vx = Number(threat.vx || 0);
  const vy = Number(threat.vy || 0);
  const speedValue = Math.max(0, Number(threat.speed ?? entitySpeed(threat)) || 0);
  const tx = Number(input.self.x) - Number(threat.x);
  const ty = Number(input.self.y) - Number(threat.y);
  const d = Math.max(1, Math.hypot(tx, ty));
  const towardScore = speedValue > 0 ? ((vx * tx) + (vy * ty)) / (speedValue * d) : 0;
  const closingDistance = previous && String(previous.id || '') === id
    ? Number(previous.distance) - distance
    : 0;
  const dangerRadius = Math.max(0, Number(options.dangerRadius ?? BROWSER_RUNTIME_DEFAULTS.dangerRadius ?? 17000));
  const cautionRadius = Math.max(0, Number(options.activeCautionRadius ?? BROWSER_RUNTIME_DEFAULTS.activeCautionRadius ?? 23000));
  const cautionMargin = Math.max(0, Number(options.activeCautionExitMargin ?? BROWSER_RUNTIME_DEFAULTS.activeCautionExitMargin ?? 0));
  const towardMin = Number(options.pursuitTowardCosMin ?? BROWSER_RUNTIME_DEFAULTS.pursuitTowardCosMin ?? 0.25);
  const closingMin = Math.max(0, Number(options.pursuitClosingMinDistance ?? BROWSER_RUNTIME_DEFAULTS.pursuitClosingMinDistance ?? 250));
  const closePressure = distance <= dangerRadius;
  const cautionPressure = distance <= cautionRadius + cautionMargin;
  const towardPressure = cautionPressure && towardScore >= towardMin;
  const closingPressure = cautionPressure && closingDistance >= closingMin;
  const firingPressure = Boolean(threat.firing && cautionPressure);
  const invulnerablePressure = Boolean(threat.invulnerable && distance <= Math.max(cautionRadius, Number(options.activeAvoidMaxDistance || BROWSER_RUNTIME_DEFAULTS.activeAvoidMaxDistance || 0)));
  if (!closePressure && !towardPressure && !closingPressure && !firingPressure && !invulnerablePressure) return null;
  return {
    threat,
    id,
    score: (firingPressure ? 50000 : 0)
      + (closePressure ? 30000 : 0)
      + (invulnerablePressure ? 20000 : 0)
      + Math.max(0, towardScore) * 10000
      + Math.max(0, closingDistance)
      - distance / 10,
    reason: firingPressure ? 'firing-threat'
      : closePressure ? 'inside-danger-radius'
        : invulnerablePressure ? 'invulnerable-pressure'
          : towardPressure ? 'moving-toward-self'
            : 'closing-distance',
    distance,
    speed: speedValue,
    moving: Boolean(threat.moving),
    towardScore,
    closingDistance
  };
}

function updateBrowserlessPursuit(input, stateful, combat, options = {}) {
  if (!stateful || typeof stateful !== 'object') return null;
  if (!browserlessSafetyExitModeEnabled(options) || !input?.self) {
    stateful.browserlessPursuit = null;
    return null;
  }
  const nowMs = Number(input.nowMs || Date.now());
  const previous = stateful.browserlessPursuit || null;
  const candidates = (input.avoidanceThreats || [])
    .map(threat => browserlessPursuitPressure(input, threat, previous, options))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
  const picked = candidates[0] || null;
  const loopGapGraceMs = Number.isFinite(Number(options.loopDelayMs))
    ? Number(options.loopDelayMs) + Math.max(10000, Number(options.decisionIntervalMs || 0) * 5)
    : 0;
  const lostGraceMs = Math.max(0, Number(
    options.browserlessPursuitLostGraceMs
      ?? Math.max(Number(options.pursuitLostGraceMs ?? BROWSER_RUNTIME_DEFAULTS.pursuitLostGraceMs ?? 10000), loopGapGraceMs)
  ));
  if (!picked) {
    if (previous && nowMs - Number(previous.lastSeenAt || 0) <= lostGraceMs) {
      stateful.browserlessPursuit = {
        ...previous,
        active: false,
        durationMs: Math.max(0, Number(previous.lastSeenAt || nowMs) - Number(previous.startedAt || nowMs))
      };
      return stateful.browserlessPursuit;
    }
    stateful.browserlessPursuit = null;
    return null;
  }
  const same = previous && String(previous.id || '') === String(picked.id)
    && nowMs - Number(previous.lastSeenAt || 0) <= lostGraceMs;
  const combatSuppressed = combatDecisionHandlesVisibleTarget(combat, picked.threat, options);
  const startedAt = combatSuppressed ? nowMs : (same ? Number(previous.startedAt || nowMs) : nowMs);
  const thresholdMs = browserlessPursuitThresholdMs(input.self, picked.threat, options);
  stateful.browserlessPursuit = {
    id: picked.id,
    name: picked.threat.name || '',
    startedAt,
    lastSeenAt: nowMs,
    durationMs: Math.max(0, nowMs - startedAt),
    distance: Math.round(picked.distance),
    speed: Math.round(picked.speed),
    moving: Boolean(picked.moving),
    active: true,
    reason: picked.reason,
    towardScore: Math.round(picked.towardScore * 1000) / 1000,
    closingDistance: Math.round(picked.closingDistance),
    thresholdMs,
    invulnerable: Boolean(picked.threat.invulnerable),
    nonFullHp: isInjuredSelf(input.self, options),
    combatSuppressed,
    target: summarizeTarget(picked.threat)
  };
  return stateful.browserlessPursuit;
}

function buildBrowserlessPursuitLeaveDecision(input, stateful, combat, options = {}) {
  if (options.browserlessPursuitLeaveEnabled === false) return null;
  const pursuit = updateBrowserlessPursuit(input, stateful, combat, options);
  if (!pursuit || !pursuit.active || pursuit.combatSuppressed) return null;
  if (Number(pursuit.durationMs || 0) < Number(pursuit.thresholdMs || 0)) return null;
  return {
    kind: 'safety-exit',
    band: 'safety',
    reason: 'pursuit-leave',
    shouldLeave: true,
    stopMotion: true,
    self: summarizeTarget(input.self),
    target: pursuit.target || null,
    pursuit: {
      id: pursuit.id,
      name: pursuit.name,
      durationMs: Math.round(Number(pursuit.durationMs || 0)),
      thresholdMs: Math.round(Number(pursuit.thresholdMs || 0)),
      distance: pursuit.distance,
      reason: pursuit.reason,
      invulnerable: Boolean(pursuit.invulnerable),
      nonFullHp: Boolean(pursuit.nonFullHp)
    }
  };
}

function buildCombatDecision(input, stateful = {}, options = {}) {
  const combatLiveEnabled = (options.controlMode === 'combat-live' || options.controlMode === 'profit-live') && options.combatEnabled === true;
  const combatVisibleTargets = filterEconomicSuppressedCombatTargets(input, stateful);
  const combatRealtime = {
    ...(input.rawRealtime || {}),
    // Keep targets and bullets realtime-only, but pass the enriched realtime self so
    // browserless combat sees snapshot-sourced private stamina fields.
    self: input.self || input.rawRealtime?.self || null,
    // Visible targets keep realtime coordinates/authority plus browserless recent
    // motion and snapshot-sourced reward metadata. Snapshot coordinates still do
    // not enter combat target, aim, or fire decisions.
    entities: [
      input.self || input.rawRealtime?.self || null,
      ...combatVisibleTargets
    ].filter(Boolean)
  };
  const combat = buildBrowserlessCombatDryRun({
    userId: input.userId,
    realtime: combatRealtime,
    command: input.command || null
  }, {
    ...options,
    decisionState: stateful,
    liveCombatEnabled: combatLiveEnabled
  });
  const target = combat.target || null;
  const actionKind = combatLiveEnabled
    ? 'combat-live'
    : (options.controlMode === 'combat-dry-run' ? 'combat-dry-run' : 'combat-candidate');
  const actionReason = combatLiveEnabled
    ? 'combat-live-realtime'
    : (options.controlMode === 'combat-dry-run' ? 'combat-dry-run-realtime' : 'realtime-visible-threat');
  const exitAction = combat.exit?.shouldLeave
    ? {
        kind: 'safety-exit',
        band: 'safety',
        reason: combat.exit.reason,
        shouldLeave: true,
        stopMotion: true,
        target: combat.exit.target || target,
        combatExit: combat.exit
      }
    : null;
  return {
    target,
    candidates: combat.candidates || [],
    dryRun: combat,
    exitAction,
    action: target
      ? {
          kind: actionKind,
          band: 'combat',
          reason: actionReason,
          target
        }
      : null
  };
}

function combatDecisionClosePressureActive(combatDecision) {
  const target = combatDecision?.target || combatDecision?.dryRun?.target || null;
  if (!target) return false;
  const phase = combatDecision?.dryRun?.combatPhase || null;
  return phase?.active === true
    || phase?.phase === 'close-pressure'
    || target.combatPhase === 'close-pressure'
    || target.closePressure?.active === true;
}

function buildBrowserlessRealtimeControlDecision(state, stateful = {}, options = {}) {
  const stageTimings = {};
  let stageStarted = performance.now();
  const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  const realtime = state?.realtime || {};
  const fallback = state?.fallback || state?.snapshot || {};
  const cacheKey = [
    realtime.tick ?? '',
    realtime.receivedAtMs ?? '',
    fallback.tick ?? '',
    fallback.receivedAtMs ?? '',
    stateful?.combatTarget?.id ?? '',
    options.controlMode || '',
    options.combatEnabled === true ? 1 : 0
  ].join('|');
  const cached = stateful?.[REALTIME_INPUT_CACHE] || null;
  let inputStageScale = null;
  let input;
  if (cached?.key === cacheKey && nowMs - Number(cached.createdAt || 0) <= 500) {
    input = {
      ...cached.input,
      nowMs,
      realtime: {
        ...cached.input.realtime,
        frameAgeMs: numberOrNull(realtime.frameAgeMs)
      }
    };
    stageTimings['input-cache-hit'] = performance.now() - stageStarted;
    inputStageScale = cached.scale || null;
  } else {
    let inputStages = null;
    input = buildBrowserlessCombatStrategyInput(state, {
      ...options,
      onCombatInputStageTimings: (stages, scale) => {
        inputStages = stages;
        inputStageScale = scale;
      }
    }, stateful);
    if (inputStages) {
      for (const [name, durationMs] of Object.entries(inputStages)) {
        stageTimings[`input-${name}`] = durationMs;
      }
    }
    if (stateful && typeof stateful === 'object') {
      stateful[REALTIME_INPUT_CACHE] = { key: cacheKey, createdAt: nowMs, input, scale: inputStageScale };
    }
  }
  stageTimings.input = performance.now() - stageStarted;
  stageStarted = performance.now();
  const coinPickups = recentRealtimeSnapshotCoinPickups(stateful, input.nowMs);
  stageTimings.coinPickups = performance.now() - stageStarted;
  stageStarted = performance.now();
  observePostAttackCoinBaseline(input, stateful, options);
  stageTimings.postAttackCoinBaseline = performance.now() - stageStarted;
  stageStarted = performance.now();
  reconcileEasyKillTracker(input, stateful, options);
  stageTimings.easyKill = performance.now() - stageStarted;
  stageStarted = performance.now();
  // Combat refresh replaces stateful.combatTarget rather than mutating the
  // previous object. Keep the old reference for post-kill reconciliation so
  // the realtime loop does not deep-clone the bounded motion/behavior history
  // on every frame.
  const previousCombatTarget = stateful.combatTarget || null;
  const combat = buildCombatDecision(input, stateful, {
    ...options,
    easyKillPreferredTargetId: easyKillPreferredTargetIdFromOpportunity(null, stateful)
  });
  let realtimeMarginalRoiStopLoss = null;
  let nonThreatEconomicStopLoss = evaluateNonThreatCombatEconomicStopLoss(
    input,
    combat,
    stateful,
    null,
    options
  );
  if (nonThreatEconomicStopLoss?.softTriggered && !nonThreatEconomicStopLoss.excluded) {
    realtimeMarginalRoiStopLoss = evaluateProactiveCombatMarginalRoi(
      input,
      combat,
      {},
      stateful,
      buildProfitThresholdContext(input, options),
      options
    );
    nonThreatEconomicStopLoss = evaluateNonThreatCombatEconomicStopLoss(
      input,
      combat,
      stateful,
      realtimeMarginalRoiStopLoss,
      options
    );
  }
  if (combat?.dryRun && realtimeMarginalRoiStopLoss) {
    combat.dryRun.marginalRoiStopLoss = realtimeMarginalRoiStopLoss;
  }
  if (combat?.dryRun && nonThreatEconomicStopLoss) {
    combat.dryRun.nonThreatEconomicStopLoss = nonThreatEconomicStopLoss;
  }
  const realtimeEconomicSuppression = rememberNonThreatCombatEconomicSuppression(
    input,
    combat,
    nonThreatEconomicStopLoss,
    stateful,
    options
  );
  const combatForProfit = realtimeEconomicSuppression
    ? {
        ...combat,
        target: null,
        dryRun: combat.dryRun
          ? {
              ...combat.dryRun,
              target: null,
              combatPhase: {
                ...(combat.dryRun.combatPhase || {}),
                active: false,
                economicStopLossReleased: true
              }
            }
          : combat.dryRun
      }
    : combat;
  stageTimings.combat = performance.now() - stageStarted;
  stageStarted = performance.now();
  rememberBrowserlessInjury(input, stateful, options);
  const postKillSettlement = reconcilePostKillSettlement(input, stateful, combat, previousCombatTarget, options);
  const postKillSettlementWaitAction = buildPostKillSettlementWaitDecision(input, stateful);
  const lootControl = buildRealtimeLootControl(input, combatForProfit, stateful, options);
  const combatActionEligible = isCombatActionEligibleForDecision(combat, options) && !realtimeEconomicSuppression;
  const controlOptions = {
    ...options,
    combatActionEligible
  };
  const longStaminaExhaustedLeaveAction = buildLongStaminaExhaustedLeaveDecision(input, controlOptions);
  const combatExitAction = combat.exitAction || null;
  const injuryHpExitAction = buildBrowserlessInjuryHpExitDecision(input, stateful, combat, controlOptions);
  const predictedThreatExitAction = buildBrowserlessPredictedThreatExitDecision(state, input, stateful, combat, controlOptions);
  const pursuitLeaveAction = buildBrowserlessPursuitLeaveDecision(input, stateful, combat, controlOptions);
  const lowHpRecoveryThreatExitAction = buildLowHpRecoveryThreatExitDecision(input, controlOptions);
  const safetyAction = profitLiveSafetyDecision(input, combat, stateful, controlOptions, null);
  const healthyLootPriority = Boolean(
    lootControl.action
      && lootControl.summary?.eligible
      && hpValue(input.self) > highValueCoinPriorityHealthyHp(options)
  );
  const selectedCombatExitAction = healthyLootPriority
    && combatExitAction?.reason === 'combat-hp-disadvantage-leave'
    ? null
    : combatExitAction;
  const selectedInjuryHpExitAction = healthyLootPriority
    && injuryHpExitAction?.reason === 'combat-hp-disadvantage-leave'
    ? null
    : injuryHpExitAction;
  const combatAction = combat.target && combatActionEligible ? combat.action : null;
  const closePressureCombatAction = combatAction && combatDecisionClosePressureActive(combat)
    ? combatAction
    : null;
  const defensiveCombatAction = combatAction && (
    combat.target?.combatIntent === 'defensive'
      || combat.target?.firing
      || targetHasRealBulletPressure(input, combat.target, stateful.combatTarget)
  ) ? combatAction : null;
  const action = longStaminaExhaustedLeaveAction
    || selectedCombatExitAction
    || selectedInjuryHpExitAction
    || predictedThreatExitAction
    || pursuitLeaveAction
    || lowHpRecoveryThreatExitAction
    || (healthyLootPriority && safetyAction?.reason === 'avoid-invulnerable-target'
      ? null
      : safetyAction)
    || lootControl.action
    || closePressureCombatAction
    || defensiveCombatAction
    || postKillSettlementWaitAction
    || combatAction
    || null;
  let dangerousCombatExit = selectedCombatExitAction
    ? rememberDangerousCombatExitTarget(input, combat, stateful, options)
    : null;
  if (!dangerousCombatExit) {
    dangerousCombatExit = rememberDangerousSafetyExitTarget(
      input,
      selectedInjuryHpExitAction,
      stateful,
      options,
      'recent-injury-pressure'
    );
  }
  if (!dangerousCombatExit) {
    dangerousCombatExit = rememberDangerousSafetyExitTarget(
      input,
      predictedThreatExitAction,
      stateful,
      options,
      'realtime-leave-risk'
    );
  }
  stageTimings.gates = performance.now() - stageStarted;
  stageStarted = performance.now();
  const output = {
    kind: action?.kind || '',
    band: action?.band || '',
    reason: action?.reason || '',
    action,
    combat: {
      ...(lootControl.combat || combat.dryRun || {}),
      dangerousTargetCooldown: dangerousCombatExit,
      profitPursuitSuppression: realtimeEconomicSuppression
    },
    exitAction: action?.shouldLeave ? action : null,
    realtimeControl: true,
    tick: input.realtime.tick,
    at: new Date(input.nowMs).toISOString(),
    input: {
      self: summarizeTarget(input.self),
      stamina: input.stamina,
      realtime: input.realtime,
      nearby: realtimeNearbyObservationSummary(input, combat, lootControl.assessment, options),
      coinPickups: topItems(coinPickups, item => item, 20),
      selfKillEvidence: input.realtimeSnapshotObservation?.selfKillEvidence || [],
      postKillSettlement,
      loot: lootControl.summary,
      dataGaps: input.dataGaps
    }
  };
  if (action) reconcileEasyKillCombatOutcome(output, input, options);
  stageTimings.output = performance.now() - stageStarted;
  if (typeof options.onRealtimeStageTimings === 'function') {
    const behavior = combat?.dryRun?.behavior || null;
    options.onRealtimeStageTimings(stageTimings, {
      rawEntityCount: Array.isArray(state?.realtime?.entities) ? state.realtime.entities.length : 0,
      visibleTargetCount: input.visibleTargets.length,
      activeThreatCount: input.activeThreats.length,
      bulletCount: input.bullets.length,
      combatCandidateCount: combat?.candidates?.length || 0,
      behaviorSampleCount: behavior?.metrics?.sampleCount || 0,
      routeCandidateCount: combat?.dryRun?.aim?.routeCoverage?.candidates?.length || 0,
      learningCellCount: Object.keys(stateful?.combatLearning?.hitRateByModeDistance || {}).length,
      input: inputStageScale
    });
  }
  return output;
}

function buildRealtimeLootControl(input, combat, stateful = {}, options = {}) {
  const assessment = selectRealtimeLootCandidate(input, stateful, options);
  const coin = assessment.selected || null;
  const summaryBase = {
    active: false,
    eligible: false,
    reason: assessment.reason,
    blockedReason: '',
    ageMs: assessment.ageMs,
    maxAgeMs: assessment.maxAgeMs,
    minAmount: assessment.minAmount,
    maxDistance: assessment.maxDistance,
    candidateCount: assessment.candidateCount,
    candidate: coin ? {
      id: coin.id,
      amount: Math.round(Number(coin.amount || 0)),
      distance: Math.round(Number(coin.distance || 0)),
      sourceUserId: numberOrNull(coin.source_user_id),
      selfKilledPlayerDrop: Boolean(coin.selfKilledPlayerDrop),
      authority: 'snapshot'
    } : null
  };
  if (!coin || !input?.self) return { action: null, combat: null, assessment, summary: summaryBase };
  const selfHp = hpValue(input.self);
  const healthyHp = highValueCoinPriorityHealthyHp(options);
  if (selfHp === null || selfHp <= healthyHp) {
    return {
      action: null,
      combat: null,
      assessment,
      summary: { ...summaryBase, blockedReason: 'self-hp-below-loot-threshold', healthyHp, selfHp }
    };
  }
  const combatExit = combat?.exitAction || (combat?.dryRun?.exit?.shouldLeave ? combat.dryRun.exit : null);
  const deferredCombatExitReason = combatExit?.reason === 'combat-hp-disadvantage-leave'
    ? combatExit.reason
    : '';
  if (combatExit && !deferredCombatExitReason) {
    return {
      action: null,
      combat: null,
      assessment,
      summary: { ...summaryBase, blockedReason: 'combat-exit-required', healthyHp, selfHp }
    };
  }
  const combatFocus = establishedCombatLootPriority(combat, coin, stateful, options);
  if (combatFocus.blocked) {
    return {
      action: null,
      combat: null,
      assessment,
      summary: {
        ...summaryBase,
        blockedReason: combatFocus.reason,
        healthyHp,
        selfHp,
        combatFocus
      }
    };
  }
  const closePressureActive = combatDecisionClosePressureActive(combat);
  const closePressurePhase = combat?.dryRun?.combatPhase || combat?.combatPhase || null;
  const ordinaryProfitClosePressure = closePressureActive && closePressurePhase?.ordinaryProfit === true;
  if (closePressureActive && !ordinaryProfitClosePressure) {
    return {
      action: null,
      combat: null,
      assessment,
      summary: {
        ...summaryBase,
        blockedReason: 'close-pressure-combat-lock',
        closePressure: true,
        ordinaryProfitClosePressure: false,
        combatTargetId: targetIdentity(combat?.target || combat?.dryRun?.target)
      }
    };
  }
  const incoming = incomingBulletPressure(input);
  const reason = coin.selfKilledPlayerDrop
    ? 'post-kill-drop-priority'
    : 'high-value-visible-coin-priority';
  if (!incoming.hasIncoming) {
    const directCombatSummary = combat?.dryRun ? {
      ...combat.dryRun,
      shooting: {
        ...(combat.dryRun.shooting || {}),
        wouldShoot: false,
        commandSuppressed: true,
        state: 'loot-priority',
        reason: 'post-kill-loot-priority'
      },
      realtimeLoot: {
        reason,
        target: summarizeCoin(coin),
        incomingCount: 0,
        mode: 'direct-coin',
        deferredCombatExitReason
      }
    } : null;
    return {
      action: {
        kind: Number(coin.distance || Infinity) <= Number(options.coinMaxDistance ?? BROWSER_RUNTIME_DEFAULTS.coinMaxDistance)
          ? 'coin'
          : 'seek-coin',
        band: 'profit',
        reason,
        reward: Number(coin.amount || 0),
        staminaCost: opportunityCoinStaminaCost(coin, options),
        target: summarizeCoin(coin),
        realtimeLootPriority: true
      },
      combat: directCombatSummary,
      assessment,
      summary: {
        ...summaryBase,
        active: true,
        eligible: true,
        mode: 'direct-coin',
        releasedOrdinaryProfitClosePressure: ordinaryProfitClosePressure,
        healthyHp,
        selfHp,
        deferredCombatExitReason
      }
    };
  }
  const safeDirection = safeLootDodgeDirection(combat, input.self, coin);
  if (!combat?.target || !safeDirection) {
    return {
      action: null,
      combat: null,
      assessment,
      summary: {
        ...summaryBase,
        blockedReason: combat?.target ? 'no-safe-loot-progress-vector' : 'incoming-bullet-without-target',
        releasedOrdinaryProfitClosePressure: ordinaryProfitClosePressure,
        healthyHp,
        selfHp,
        incomingCount: incoming.incomingCount
      }
    };
  }
  const combatSummary = {
    ...combat.dryRun,
    movement: {
      ...(combat.dryRun?.movement || {}),
      dx: Number(safeDirection.dx || 0),
      dy: Number(safeDirection.dy || 0),
      reason: 'post-kill-loot-safe-dodge',
      modifiers: Array.from(new Set([...(combat.dryRun?.movement?.modifiers || []), 'post-kill-loot']))
    },
    shooting: {
      ...(combat.dryRun?.shooting || {}),
      wouldShoot: false,
      commandSuppressed: true,
      state: 'loot-priority',
      reason: 'post-kill-loot-priority'
    },
    realtimeLoot: {
      reason,
      target: summarizeCoin(coin),
      incomingCount: incoming.incomingCount,
      deferredCombatExitReason,
      safeDirection: { dx: Number(safeDirection.dx || 0), dy: Number(safeDirection.dy || 0) }
    }
  };
  return {
    action: {
      kind: 'combat-live',
      band: 'combat',
      reason: 'post-kill-loot-safe-dodge',
      target: combat.target,
      lootTarget: summarizeCoin(coin),
      realtimeLootPriority: true
    },
    combat: combatSummary,
    assessment,
    summary: {
      ...summaryBase,
      active: true,
      eligible: true,
      mode: 'safe-dodge-toward-coin',
      releasedOrdinaryProfitClosePressure: ordinaryProfitClosePressure,
      healthyHp,
      selfHp,
      incomingCount: incoming.incomingCount,
      deferredCombatExitReason,
      safeDirection: { dx: Number(safeDirection.dx || 0), dy: Number(safeDirection.dy || 0) }
    }
  };
}

function establishedCombatLootPriority(combat, coin, stateful = {}, options = {}) {
  const target = combat?.target || combat?.dryRun?.target || null;
  const result = (blocked, reason, detail = {}) => ({ blocked, reason, ...detail });
  if (!coin || !target) return result(false, 'missing-coin-or-combat-target');
  if (coin.selfKilledPlayerDrop) return result(false, 'self-kill-drop-protected');
  if (target.alive === false || target.invulnerable === true) return result(false, 'combat-target-invalid');

  const targetId = targetIdentity(target);
  const metrics = stateful?.combatMetrics || null;
  const metricsMatch = Boolean(
    targetId
      && metrics?.targetId !== null
      && metrics?.targetId !== undefined
      && String(metrics.targetId) === String(targetId)
  );
  const targetDamage = metricsMatch ? Math.max(0, Number(metrics.targetDamage || 0)) : 0;
  const combatPhaseDamage = Math.max(0, Number(combat?.dryRun?.combatPhase?.damageFromStart || 0));
  const easyKillEvidence = Boolean(target.easyKillProfitTarget || target.easyKillKnown);
  const productiveCombat = targetDamage > 0 || combatPhaseDamage > 0;
  const established = Boolean(target.combatEngagement || (metricsMatch && Number(metrics.acceptedShots || 0) > 0));
  const targetDrop = Math.max(0, entityDropValue(target));
  const coinAmount = Math.max(0, Number(coin.amount || 0));
  const configuredRatio = Number(options.combatLootTargetDropRatio ?? DEFAULT_COMBAT_LOOT_TARGET_DROP_RATIO);
  const requiredDropRatio = Math.max(1, Number.isFinite(configuredRatio)
    ? configuredRatio
    : DEFAULT_COMBAT_LOOT_TARGET_DROP_RATIO);
  const requiredTargetDrop = coinAmount * requiredDropRatio;
  const detail = {
    targetId: targetId || '',
    targetDrop,
    coinAmount,
    requiredDropRatio,
    requiredTargetDrop,
    easyKillEvidence,
    productiveCombat,
    targetDamage: Math.max(targetDamage, combatPhaseDamage),
    established
  };
  if (!established) return result(false, 'combat-not-established', detail);
  if (!easyKillEvidence && !productiveCombat) return result(false, 'combat-profit-unproven', detail);
  if (!(targetDrop >= requiredTargetDrop)) return result(false, 'coin-value-outranks-combat', detail);
  return result(true, 'established-higher-value-combat', detail);
}

function isCombatActionEligibleForDecision(combatDecision, options = {}) {
  const target = combatDecision?.target || combatDecision?.dryRun?.target || null;
  if (!target) return false;
  if (options.controlMode !== 'profit-live') return true;
  if (target.combatEngagement) return true;
  if (target.combatIntent === 'defensive') return true;
  return Boolean(target.active || target.firing);
}

function buildThreatFleeDecision(stateful, input, target, reason, options = {}, extra = {}) {
  const flee = lockedFleeDirectionCore(stateful, input.self, [target], reason, {
    ...options,
    nowMs: input.nowMs,
    dangerRadius: options.dangerRadius ?? options.activeCautionRadius ?? DEFAULT_PROFIT_LIVE_THREAT_EXIT_RANGE
  });
  return {
    kind: 'flee',
    band: 'safety',
    reason,
    dx: flee.dx,
    dy: flee.dy,
    locked: flee.locked,
    stopMotion: false,
    target: summarizeTarget(target),
    threats: [summarizeTarget(target)].filter(Boolean),
    self: summarizeTarget(input.self),
    ...extra
  };
}

function profitLiveSafetyDecision(input, combatDecision, stateful = {}, options = {}, blockedAction = null) {
  if (options.controlMode !== 'profit-live' || !input.self) return null;
  const realtimeTarget = combatDecision?.dryRun?.target || combatDecision?.target || null;
  const selfHp = hpValue(input.self);
  const criticalExit = evaluateCombatHpExitCore({ selfHp, targetHp: null }, options);
  const criticalTarget = [
    ...(realtimeTarget ? [realtimeTarget] : []),
    ...(input.firingThreats || []),
    ...(input.avoidanceThreats || [])
  ]
    .filter(target => target && target.alive !== false && (target.active || target.firing || isBrowserlessAvoidanceThreat(target)))
    .sort((a, b) => Number(a.distance || Infinity) - Number(b.distance || Infinity))[0] || null;
  if (criticalExit?.rule === 'critical-hp' && criticalTarget) {
    const combatTargetId = realtimeTarget?.userId ?? realtimeTarget?.user_id ?? realtimeTarget?.entityId ?? realtimeTarget?.entity_id ?? null;
    const criticalTargetId = criticalTarget?.userId ?? criticalTarget?.user_id ?? criticalTarget?.entityId ?? criticalTarget?.entity_id ?? null;
    const combatHandlesCriticalTarget = options.combatActionEligible !== false
      && !criticalTarget.invulnerable
      && combatTargetId !== null
      && combatTargetId !== undefined
      && criticalTargetId !== null
      && criticalTargetId !== undefined
      && String(combatTargetId) === String(criticalTargetId);
    if (!combatHandlesCriticalTarget) {
      return {
        kind: 'safety-exit',
        band: 'safety',
        reason: criticalExit.reason,
        shouldLeave: true,
        stopMotion: true,
        target: summarizeTarget(criticalTarget),
        self: summarizeTarget(input.self),
        combatExit: {
          ...criticalExit,
          targetHp: hpValue(criticalTarget),
          hpGap: hpValue(criticalTarget) === null ? null : hpValue(criticalTarget) - selfHp,
          triggerSource: 'unhandled-visible-pressure'
        },
        criticalThreat: {
          selfHp,
          threshold: criticalExit.threshold,
          distance: Math.round(Number(criticalTarget.distance || 0))
        }
      };
    }
  }
  const target = (input.avoidanceThreats || [])
    .filter(isBrowserlessAvoidanceThreat)
    .sort((a, b) => Number(a.distance || Infinity) - Number(b.distance || Infinity))[0] || null;
  const distance = Number(target?.distance);
  if (!target || !Number.isFinite(distance)) return criticalUnknownPressureExit(input, options);
  const threatExitRange = Math.max(0, Number(options.profitLiveThreatExitRange || DEFAULT_PROFIT_LIVE_THREAT_EXIT_RANGE));
  const invulnerableAvoidRange = Math.max(threatExitRange, Number(options.activeAvoidMaxDistance || BROWSER_RUNTIME_DEFAULTS.activeAvoidMaxDistance || threatExitRange));
  if (distance > invulnerableAvoidRange) return null;
  return buildThreatFleeDecision(stateful, input, target, 'avoid-invulnerable-target', {
    ...options,
    dangerRadius: invulnerableAvoidRange
  });
}

function targetIdentity(target) {
  const id = target?.userId ?? target?.user_id ?? target?.entityId ?? target?.entity_id ?? target?.id;
  if (id === null || id === undefined || id === '') return '';
  return String(id);
}

function dangerousTargetCooldownMs(options = {}, reason = '') {
  if (String(reason || '') === 'combat-exit-poor-exchange') {
    const poorExchangeValue = Number(options.combatPoorExchangeCooldownMs ?? 300000);
    return Number.isFinite(poorExchangeValue) ? Math.max(0, poorExchangeValue) : 300000;
  }
  const value = Number(options.browserlessDangerousTargetCooldownMs
    ?? BROWSER_RUNTIME_DEFAULTS.browserlessDangerousTargetCooldownMs
    ?? DEFAULT_DANGEROUS_TARGET_COOLDOWN_MS);
  return Number.isFinite(value) ? Math.max(0, value) : DEFAULT_DANGEROUS_TARGET_COOLDOWN_MS;
}

function dangerousCombatTargetMap(stateful = {}, nowMs = 0) {
  if (!stateful || typeof stateful !== 'object') return {};
  if (!stateful.dangerousCombatTargets || typeof stateful.dangerousCombatTargets !== 'object' || Array.isArray(stateful.dangerousCombatTargets)) {
    stateful.dangerousCombatTargets = {};
  }
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  for (const [id, item] of Object.entries(stateful.dangerousCombatTargets)) {
    if (Number(item?.until || 0) <= now) delete stateful.dangerousCombatTargets[id];
  }
  return stateful.dangerousCombatTargets;
}

function dangerousTargetCooldownRecordById(stateful = {}, targetId = '', nowMs = 0) {
  const id = String(targetId || '');
  if (!id) return null;
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  const record = dangerousCombatTargetMap(stateful, now)[id] || null;
  return record && Number(record.until || 0) > now ? record : null;
}

function targetDangerousCooldownRecord(stateful = {}, target = null, nowMs = 0) {
  const id = targetIdentity(target);
  return id ? dangerousTargetCooldownRecordById(stateful, id, nowMs) : null;
}

function opportunityChoiceTargetId(choice) {
  if (!choice) return '';
  if (String(choice.type || '') === 'enemy') {
    const id = choice.id ?? choice.userId ?? choice.user_id ?? choice.target?.userId ?? choice.target?.user_id;
    if (id !== null && id !== undefined && id !== '') return String(id);
  }
  const key = String(choice.key || '');
  if (key.startsWith('enemy:')) return key.slice('enemy:'.length);
  return targetIdentity(choice.sourceTarget || choice.target || choice);
}

function clearDangerousOpportunityState(stateful = {}, nowMs = 0) {
  if (!stateful || typeof stateful !== 'object') return;
  const choice = stateful.currentOpportunity || stateful.opportunityChoice || null;
  const targetId = opportunityChoiceTargetId(choice);
  if (!targetId || !dangerousTargetCooldownRecordById(stateful, targetId, nowMs)) return;
  stateful.opportunityChoice = null;
  stateful.currentOpportunity = null;
  stateful.opportunitySwitchLock = null;
  stateful.switchLock = null;
}

function rememberDangerousCombatTarget(stateful = {}, target = null, reason = '', input = {}, options = {}, extra = {}) {
  if (!stateful || typeof stateful !== 'object' || !target) return null;
  const targetId = targetIdentity(target);
  if (!targetId) return null;
  const cooldownMs = dangerousTargetCooldownMs(options, reason);
  if (!(cooldownMs > 0)) return null;
  const nowMs = Number.isFinite(Number(input?.nowMs)) ? Number(input.nowMs) : Date.now();
  const record = {
    reason: String(reason || 'dangerous-combat-target'),
    targetId,
    at: nowMs,
    until: nowMs + cooldownMs,
    cooldownMs: Math.round(cooldownMs),
    selfHp: numberOrNull(input?.self?.hp),
    targetHp: numberOrNull(target?.hp),
    targetDrop: entityDropValue(target),
    target: summarizeTarget(target),
    ...extra
  };
  dangerousCombatTargetMap(stateful, nowMs)[targetId] = cloneJson(record);
  clearSuppressedCombatTarget(stateful, targetId);
  return record;
}

function rememberDangerousCombatExitTarget(input, combatDecision, stateful = {}, options = {}) {
  const exit = combatDecision?.exitAction || combatDecision?.dryRun?.exit || combatDecision?.exit || null;
  const reason = String(exit?.reason || '');
  if (!DANGEROUS_COMBAT_EXIT_REASONS.has(reason)) return null;
  const target = exit.target || combatDecision?.target || combatDecision?.dryRun?.target || null;
  return rememberDangerousCombatTarget(stateful, target, reason, input, options, {
    exit: true,
    exitSelfHp: numberOrNull(exit?.selfHp ?? exit?.combatExit?.selfHp),
    exitTargetHp: numberOrNull(exit?.targetHp ?? exit?.combatExit?.targetHp)
  });
}

function rememberDangerousSafetyExitTarget(input, action, stateful = {}, options = {}, triggerSource = 'realtime-leave-risk') {
  const reason = String(action?.reason || '');
  if (!action?.target || !DANGEROUS_COMBAT_EXIT_REASONS.has(reason)) return null;
  return rememberDangerousCombatTarget(stateful, action.target, reason, input, options, {
    exit: true,
    exitSelfHp: numberOrNull(action.combatExit?.selfHp),
    exitTargetHp: numberOrNull(action.combatExit?.targetHp),
    triggerSource
  });
}

function targetHasRealBulletPressure(input, target, combatState = {}) {
  const id = targetIdentity(target);
  if (!id) return false;
  if (Number(combatState?.seenTargetRealBulletAt || 0) > 0) return true;
  return (input?.bullets || []).some(bullet => {
    if (!bullet || bullet.synthetic) return false;
    const ownerId = bulletOwnerId(bullet);
    return ownerId !== null && ownerId !== undefined && String(ownerId) === id;
  });
}

function proactiveCombatDefensiveRiskAssessment(combatDecision, input, stateful = {}, options = {}) {
  const target = combatDecision?.target || combatDecision?.dryRun?.target || null;
  const targetId = targetIdentity(target);
  const combatState = stateful?.combatTarget || null;
  const nowMs = Number.isFinite(Number(input?.nowMs)) ? Number(input.nowMs) : Date.now();
  const targetBullets = targetId
    ? (input?.bullets || []).filter(bullet => !bullet?.synthetic && String(bulletOwnerId(bullet) ?? '') === targetId)
    : [];
  const collisionRiskBullets = targetBullets.filter(bullet => incomingBulletHasCollisionRiskCore(bullet, options));
  const injury = stateful?.browserlessInjury || null;
  const injuryAgeMs = injury?.at ? Math.max(0, nowMs - Number(injury.at || 0)) : null;
  const recentAttributedInjury = Boolean(
    injury
      && injuryAgeMs <= Math.max(1000, Number(options.proactiveCombatDefensiveInjuryMs ?? 3000))
      && injury.attributable !== false
      && String(injury.targetKey || injury.recentCombatTargetKey || '') === targetId
  );
  const samples = (combatState?.motionSamples || []).filter(sample => nowMs - Number(sample.at || 0) <= 2500);
  const firstDistance = numberOrNull(samples[0]?.distance);
  const lastDistance = numberOrNull(samples.at(-1)?.distance ?? target?.distance);
  const closingDistanceCm = firstDistance !== null && lastDistance !== null ? firstDistance - lastDistance : 0;
  const firingAgeMs = Number(combatState?.lastFiringAt || 0) > 0
    ? Math.max(0, nowMs - Number(combatState.lastFiringAt))
    : null;
  const recentFiringWhileClosing = Boolean(
    (target?.firing || (firingAgeMs !== null && firingAgeMs <= Math.max(500, Number(options.proactiveCombatRecentFiringMs ?? 1500))))
      && closingDistanceCm >= Math.max(50, Number(options.proactiveCombatClosingRiskCm ?? 200))
  );
  const originIntent = String(combatState?.originIntent || combatState?.intent || target?.combatIntent || '');
  const originReason = String(combatState?.originReason || '');
  const engagedMs = profitPursuitEngagedMs(combatDecision, stateful, nowMs);
  const explicitDefensiveOrigin = originIntent === 'defensive' && Boolean(
    /safety|injury|incoming|defensive|threat/i.test(originReason)
      || engagedMs <= Math.max(1000, Number(options.proactiveCombatDefensiveOriginHoldMs ?? 3000))
  );
  const reasons = [];
  if (recentAttributedInjury) reasons.push('recent-attributed-injury');
  if (collisionRiskBullets.length) reasons.push('collision-risk-target-bullet');
  if (recentFiringWhileClosing) reasons.push('recent-firing-while-closing');
  if (explicitDefensiveOrigin) reasons.push('explicit-defensive-origin');
  return {
    defensive: reasons.length > 0,
    reasons,
    targetBulletCount: targetBullets.length,
    collisionRiskBulletCount: collisionRiskBullets.length,
    recentAttributedInjury,
    injuryAgeMs,
    recentFiringWhileClosing,
    firingAgeMs,
    closingDistanceCm: Math.round(closingDistanceCm),
    explicitDefensiveOrigin,
    originIntent,
    originReason,
    engagedMs
  };
}

function profitPursuitSuppressionMap(stateful = {}, nowMs = 0) {
  if (!stateful || typeof stateful !== 'object') return {};
  if (!stateful.profitPursuitSuppressions || typeof stateful.profitPursuitSuppressions !== 'object' || Array.isArray(stateful.profitPursuitSuppressions)) {
    stateful.profitPursuitSuppressions = {};
  }
  for (const [id, item] of Object.entries(stateful.profitPursuitSuppressions)) {
    if (Number(item?.until || 0) <= nowMs) delete stateful.profitPursuitSuppressions[id];
  }
  return stateful.profitPursuitSuppressions;
}

function nonThreatCombatEconomicStateMap(stateful = {}, nowMs = 0, options = {}) {
  if (!stateful || typeof stateful !== 'object') return {};
  if (!stateful.nonThreatCombatEconomicsByTarget
    || typeof stateful.nonThreatCombatEconomicsByTarget !== 'object'
    || Array.isArray(stateful.nonThreatCombatEconomicsByTarget)) {
    stateful.nonThreatCombatEconomicsByTarget = {};
  }
  const ttlMs = Math.max(
    300000,
    Number(options.browserlessProfitPursuitHardNoDamageMs
      ?? BROWSER_RUNTIME_DEFAULTS.browserlessProfitPursuitHardNoDamageMs
      ?? COMBAT_ECONOMIC_STOP_LOSS_DEFAULTS.hardNoDamageMs) * 3
  );
  for (const [id, item] of Object.entries(stateful.nonThreatCombatEconomicsByTarget)) {
    if (Number(nowMs || 0) - Number(item?.updatedAt || 0) > ttlMs) delete stateful.nonThreatCombatEconomicsByTarget[id];
  }
  return stateful.nonThreatCombatEconomicsByTarget;
}

function economicStopLossOptions(options = {}) {
  return {
    softNoDamageMs: Number(options.browserlessProfitPursuitMinDamageMs
      ?? BROWSER_RUNTIME_DEFAULTS.browserlessProfitPursuitMinDamageMs
      ?? COMBAT_ECONOMIC_STOP_LOSS_DEFAULTS.softNoDamageMs),
    softMovementStamina: Number(options.browserlessProfitPursuitSoftMovementStaminaMs
      ?? BROWSER_RUNTIME_DEFAULTS.browserlessProfitPursuitSoftMovementStaminaMs
      ?? COMBAT_ECONOMIC_STOP_LOSS_DEFAULTS.softMovementStamina),
    hardNoDamageMs: Number(options.browserlessProfitPursuitHardNoDamageMs
      ?? BROWSER_RUNTIME_DEFAULTS.browserlessProfitPursuitHardNoDamageMs
      ?? COMBAT_ECONOMIC_STOP_LOSS_DEFAULTS.hardNoDamageMs),
    hardMovementStamina: Number(options.browserlessProfitPursuitHardMovementStaminaMs
      ?? BROWSER_RUNTIME_DEFAULTS.browserlessProfitPursuitHardMovementStaminaMs
      ?? COMBAT_ECONOMIC_STOP_LOSS_DEFAULTS.hardMovementStamina),
    pressureCycleMs: Number(options.browserlessProfitPursuitPressureCycleMs
      ?? BROWSER_RUNTIME_DEFAULTS.browserlessProfitPursuitPressureCycleMs
      ?? COMBAT_ECONOMIC_STOP_LOSS_DEFAULTS.pressureCycleMs),
    reentryDropRatio: Number(options.browserlessProfitPursuitReentryDropRatio
      ?? COMBAT_ECONOMIC_STOP_LOSS_DEFAULTS.reentryDropRatio),
    reentryDropMinimum: Number(options.browserlessProfitPursuitReentryDropMinimum
      ?? COMBAT_ECONOMIC_STOP_LOSS_DEFAULTS.reentryDropMinimum),
    reentryDistanceRatio: Number(options.browserlessProfitPursuitReentryDistanceRatio
      ?? COMBAT_ECONOMIC_STOP_LOSS_DEFAULTS.reentryDistanceRatio),
    reentryDistanceMinimumCm: Number(options.browserlessProfitPursuitReentryDistanceMinimumCm
      ?? COMBAT_ECONOMIC_STOP_LOSS_DEFAULTS.reentryDistanceMinimumCm)
  };
}

function economicProfitPursuitSuppressionRecordById(stateful = {}, targetId = '', nowMs = 0) {
  const id = String(targetId || '');
  if (!id) return null;
  const record = profitPursuitSuppressionMap(stateful, Number(nowMs || 0))[id] || null;
  return record?.economicStopLoss === true && Number(record.until || 0) > Number(nowMs || 0)
    ? record
    : null;
}

function economicStopLossThreatEvidence(input = {}, target = null, stateful = {}) {
  const targetId = targetIdentity(target);
  const bulletOwnerMatch = Boolean(targetId && (input.bullets || []).some(bullet => (
    !bullet?.synthetic && String(bulletOwnerId(bullet) ?? '') === targetId
  )));
  const combatTarget = String(stateful?.combatTarget?.id ?? '') === targetId ? stateful.combatTarget : null;
  const metrics = String(stateful?.combatMetrics?.targetId ?? '') === targetId ? stateful.combatMetrics : null;
  const injury = stateful?.browserlessInjury || null;
  const recentInjury = Boolean(
    targetId
      && String(injury?.targetKey || injury?.recentCombatTargetKey || '') === targetId
      && Number(input.nowMs || 0) - Number(injury?.at || 0) <= 3000
  );
  const reasons = [];
  if (target?.firing) reasons.push('target-firing');
  if (bulletOwnerMatch) reasons.push('target-real-bullet');
  if (combatTarget?.hasDamagedSelf || Number(metrics?.selfDamage || 0) > 0 || Number(metrics?.incomingHits || 0) > 0) {
    reasons.push('target-damaged-self');
  }
  if (Number(combatTarget?.seenTargetRealBulletAt || 0) > 0 || Number(metrics?.threatBulletCount || 0) > 0) {
    reasons.push('target-historical-bullet');
  }
  if (recentInjury) reasons.push('recent-attributed-injury');
  return {
    active: reasons.length > 0,
    reasons,
    bulletOwnerMatch,
    recentInjury
  };
}

function reconcileEconomicStopLossCooldowns(input = {}, stateful = {}, options = {}) {
  const nowMs = Number(input.nowMs || Date.now());
  const map = profitPursuitSuppressionMap(stateful, nowMs);
  const reentryOptions = economicStopLossOptions(options);
  for (const target of input.visibleTargets || []) {
    const targetId = targetIdentity(target);
    const record = economicProfitPursuitSuppressionRecordById(stateful, targetId, nowMs);
    if (!record) continue;
    const threat = economicStopLossThreatEvidence(input, target, stateful);
    const reentry = evaluateEconomicCooldownReentryCore(record, target, {
      threatEvidence: threat.active
    }, reentryOptions);
    record.lastReentryEvaluation = { ...reentry, at: nowMs, threatReasons: threat.reasons };
    if (!reentry.allowed) continue;
    delete map[targetId];
    delete nonThreatCombatEconomicStateMap(stateful, nowMs, options)[targetId];
    target.economicStopLossReentry = reentry.reason;
    if (reentry.threatEvidence) target.economicThreatReentry = true;
  }
}

function filterEconomicSuppressedCombatTargets(input = {}, stateful = {}) {
  const nowMs = Number(input.nowMs || Date.now());
  return (input.visibleTargets || []).filter(target => (
    !economicProfitPursuitSuppressionRecordById(stateful, targetIdentity(target), nowMs)
  ));
}

function evaluateNonThreatCombatEconomicStopLoss(input, combatDecision, stateful = {}, marginalRoiStopLoss = null, options = {}) {
  const target = combatDecision?.target || combatDecision?.dryRun?.target || null;
  const targetId = targetIdentity(target);
  if (!target || !targetId || !combatDecisionIsOrdinaryProfitPursuit(combatDecision, input, stateful)) return null;
  const nowMs = Number(input?.nowMs || Date.now());
  const combatTarget = String(stateful?.combatTarget?.id ?? '') === targetId ? stateful.combatTarget : {};
  const metrics = String(stateful?.combatMetrics?.targetId ?? '') === targetId ? stateful.combatMetrics : {};
  const missClose = combatDecision?.dryRun?.combatPhase?.active === true
    && combatDecision?.dryRun?.combatPhase?.range?.progressiveMissClose === true;
  if (missClose) {
    return {
      release: false,
      excluded: true,
      exclusionReason: 'progressive-miss-close-owned',
      reason: 'non-threat-economic-progressive-close-excluded',
      targetId,
      nowMs,
      target: summarizeTarget(target),
      targetDrop: entityDropValue(target),
      targetDistanceCm: Number.isFinite(Number(target.distance)) ? Math.round(Number(target.distance)) : null,
      missClose: cloneJson(combatDecision.dryRun.combatPhase)
    };
  }
  const defensiveRisk = proactiveCombatDefensiveRiskAssessment(combatDecision, input, stateful, options);
  const threat = economicStopLossThreatEvidence(input, target, stateful);
  const threatEvidence = Boolean(defensiveRisk.defensive || threat.active);
  const damageProgressAt = Number(combatTarget.damageProgressAt
    || combatTarget.lastDamageAt
    || metrics.damageProgressAt
    || metrics.startedAt
    || nowMs);
  const acceptedShotsSinceDamage = Math.max(
    0,
    Number(combatTarget.acceptedShotsSinceDamage
      ?? metrics.acceptedShotsSinceDamage
      ?? (Number(metrics.acceptedShots || 0) - Number(combatTarget.acceptedShotsAtLastDamage || 0)))
  );
  const movementStaminaSinceDamage = Math.max(
    0,
    Number(combatTarget.movementStaminaSinceDamage
      ?? metrics.movementStaminaSinceDamage
      ?? metrics.movementStaminaSpent
      ?? 0)
  );
  const stableCloseMs = Math.max(0, Number(combatTarget.stableCloseMs ?? metrics.stableCloseMs ?? 0));
  const stateMap = nonThreatCombatEconomicStateMap(stateful, nowMs, options);
  const result = evaluateNonThreatCombatEconomicStopLossCore({
    nowMs,
    targetId,
    startedAt: metrics.startedAt,
    damageProgressAt,
    acceptedShotsSinceDamage,
    movementStaminaSinceDamage,
    stableCloseMs,
    marginalNetROI: marginalRoiStopLoss?.marginalNetROI,
    requiredRoi: marginalRoiStopLoss?.requiredRoi,
    threatEvidence
  }, stateMap[targetId] || null, economicStopLossOptions(options));
  stateMap[targetId] = result.state;
  const releaseSuppressed = result.release === true;
  return {
    ...result,
    release: false,
    advisory: Boolean(result.advisory || releaseSuppressed),
    releaseSuppressed,
    originalReleaseReason: releaseSuppressed ? result.reason : '',
    reason: releaseSuppressed
      ? 'non-threat-economic-progressive-close-owned'
      : result.reason,
    target: summarizeTarget(target),
    targetDrop: entityDropValue(target),
    targetDistanceCm: Number.isFinite(Number(target.distance)) ? Math.round(Number(target.distance)) : null,
    defensiveRisk,
    threatEvidence: {
      active: threatEvidence,
      reasons: Array.from(new Set([...(defensiveRisk.reasons || []), ...threat.reasons]))
    }
  };
}

function rememberNonThreatCombatEconomicSuppression(input, combatDecision, economicStopLoss, stateful = {}, options = {}) {
  if (!economicStopLoss?.release) return null;
  const target = combatDecision?.target || combatDecision?.dryRun?.target || null;
  const targetId = targetIdentity(target);
  if (!target || !targetId) return null;
  const nowMs = Number(input?.nowMs || Date.now());
  const suppressMs = Math.max(
    30000,
    Math.min(
      60000,
      Number(options.browserlessProfitPursuitSuppressMs
        ?? BROWSER_RUNTIME_DEFAULTS.browserlessProfitPursuitSuppressMs
        ?? COMBAT_ECONOMIC_STOP_LOSS_DEFAULTS.cooldownMs)
    )
  );
  const suppression = {
    suppressed: true,
    economicStopLoss: true,
    reason: economicStopLoss.reason,
    targetId,
    at: nowMs,
    until: nowMs + suppressMs,
    suppressMs: Math.round(suppressMs),
    baselineDrop: entityDropValue(target),
    baselineDistanceCm: Number.isFinite(Number(target.distance)) ? Math.round(Number(target.distance)) : null,
    target: summarizeTarget(target),
    economics: cloneJson(economicStopLoss)
  };
  profitPursuitSuppressionMap(stateful, nowMs)[targetId] = suppression;
  clearSuppressedCombatTarget(stateful, targetId);
  return suppression;
}

function combatDecisionIsOrdinaryProfitPursuit(combatDecision, input, stateful = {}) {
  const target = combatDecision?.target || combatDecision?.dryRun?.target || null;
  if (!target) return false;
  const combatState = stateful?.combatTarget || null;
  const intent = String(target.combatIntent || combatState?.intent || '');
  const originIntent = String(combatState?.originIntent || combatState?.intent || intent || '');
  if (proactiveCombatDefensiveRiskAssessment(combatDecision, input, stateful).defensive) return false;
  if (intent === 'profit' || intent === 'engaged' || intent === 'reengage') return true;
  if (originIntent === 'profit' || originIntent === 'engaged' || originIntent === 'reengage') return true;
  if (combatDecision?.dryRun?.movement?.passiveRunner?.active) return true;
  return Boolean(entityDropValue(target) > 0 && (target.active || target.combatEngagement));
}

function profitPursuitEngagedMs(combatDecision, stateful = {}, nowMs = 0) {
  const target = combatDecision?.target || combatDecision?.dryRun?.target || null;
  const targetId = targetIdentity(target);
  const metrics = stateful?.combatMetrics || null;
  const metricsStartedAt = Number(metrics?.startedAt);
  if (targetId
    && String(metrics?.targetId ?? '') === targetId
    && Number.isFinite(metricsStartedAt)
    && metricsStartedAt > 0) {
    return Math.max(0, Number(nowMs || 0) - metricsStartedAt);
  }
  const combatState = stateful?.combatTarget || null;
  const combatStateId = String(combatState?.id ?? combatState?.userId ?? combatState?.user_id ?? '');
  const firstSeenAt = Number(combatState?.firstSeenAt || combatState?.at);
  if (targetId
    && combatStateId === targetId
    && Number.isFinite(firstSeenAt)
    && firstSeenAt > 0) {
    return Math.max(0, Number(nowMs || 0) - firstSeenAt);
  }
  // combatEngagement is presentation data rebuilt from the latest realtime
  // frame. Keep it only as a last-resort fallback because its age may reset on
  // every frame and must never override cumulative engagement state.
  const ageMs = Number(target?.combatEngagement?.ageMs);
  if (Number.isFinite(ageMs)) return Math.max(0, ageMs);
  return 0;
}

function clearSuppressedCombatTarget(stateful = {}, targetId = '') {
  if (!stateful || typeof stateful !== 'object' || !targetId) return;
  const currentId = String(stateful.combatTarget?.id ?? '');
  if (currentId && currentId === String(targetId)) stateful.combatTarget = null;
  const aimId = String(stateful.combatAim?.targetId ?? '');
  if (aimId && aimId === String(targetId)) stateful.combatAim = null;
  const opportunityId = opportunityChoiceTargetId(stateful.currentOpportunity || stateful.opportunityChoice || null);
  if (opportunityId && opportunityId === String(targetId)) {
    stateful.opportunityChoice = null;
    stateful.currentOpportunity = null;
    stateful.opportunitySwitchLock = null;
    stateful.switchLock = null;
  }
}

function profitPursuitDamageProgress(combatDecision, stateful = {}) {
  const combatState = stateful?.combatTarget || null;
  const target = combatDecision?.target || combatDecision?.dryRun?.target || null;
  const firstHp = numberOrNull(combatState?.firstHp ?? combatState?.startHp);
  const minHp = numberOrNull(combatState?.minHp);
  const targetHp = numberOrNull(target?.hp ?? combatState?.hp);
  let damageFromStart = numberOrNull(combatState?.damageFromStart);
  if (firstHp !== null && minHp !== null) {
    damageFromStart = Math.max(Number(damageFromStart || 0), firstHp - minHp);
  }
  if (firstHp !== null && targetHp !== null) {
    damageFromStart = Math.max(Number(damageFromStart || 0), firstHp - targetHp);
  }
  return {
    firstHp,
    minHp,
    targetHp,
    damageFromStart,
    known: firstHp !== null && (minHp !== null || targetHp !== null) && damageFromStart !== null
  };
}

function rewardPerTenStamina(reward, staminaCost) {
  const value = Number(reward);
  const cost = Number(staminaCost);
  if (!(value >= 0) || !(cost > 0)) return null;
  return value * 10000 / cost;
}

function evaluateProactiveCombatMarginalRoi(input, combatDecision, opportunity = {}, stateful = {}, thresholdContext = {}, options = {}) {
  const target = combatDecision?.target || combatDecision?.dryRun?.target || null;
  if (!target) return null;
  const combatState = stateful?.combatTarget || null;
  const intent = String(target.combatIntent || combatState?.intent || '');
  const originIntent = String(combatState?.originIntent || combatState?.intent || intent || '');
  const profitPursuit = Boolean(
    ['profit', 'engaged', 'reengage'].includes(intent)
      || ['profit', 'engaged', 'reengage'].includes(originIntent)
      || combatDecision?.dryRun?.movement?.passiveRunner?.active
      || (entityDropValue(target) > 0 && (target.active || target.combatEngagement))
  );
  if (!profitPursuit) return null;
  const defensiveRisk = proactiveCombatDefensiveRiskAssessment(combatDecision, input, stateful, options);
  if (defensiveRisk.defensive) {
    return {
      ready: false,
      active: false,
      triggered: false,
      disengage: false,
      excluded: true,
      exclusionReason: 'defensive-risk-evidence',
      reason: 'proactive-combat-marginal-roi-defensive-excluded',
      defensiveRisk,
      engagedMs: defensiveRisk.engagedMs
    };
  }
  if (!stateful.proactiveCombatMarginalRoiState || typeof stateful.proactiveCombatMarginalRoiState !== 'object') {
    stateful.proactiveCombatMarginalRoiState = {};
  }
  const nowMs = Number.isFinite(Number(input?.nowMs)) ? Number(input.nowMs) : Date.now();
  const targetId = targetIdentity(target);
  if (!targetId) return null;
  const engagedMs = profitPursuitEngagedMs(combatDecision, stateful, nowMs);
  const metrics = stateful.combatMetrics || {};
  const metricsMatch = String(metrics.targetId ?? '') === targetId;
  const acceptedShots = metricsMatch ? Math.max(0, Number(metrics.acceptedShots || 0)) : 0;
  const confirmedHits = metricsMatch ? Math.max(0, Number(metrics.confirmedHits || 0)) : 0;
  const behaviorHitRate = numberOrNull(combatDecision?.dryRun?.behavior?.recentHitRate);
  const observedHitRate = acceptedShots > 0 ? confirmedHits / acceptedShots : null;
  const acceptedHitRateEWMA = Math.max(0.03, Math.min(0.95,
    observedHitRate === null
      ? (behaviorHitRate ?? 0.18)
      : ((confirmedHits + Math.max(1, Number(behaviorHitRate ?? 0.18) * 6)) / (acceptedShots + 6))
  ));
  const targetHp = numberOrNull(target.hp ?? stateful.combatTarget?.hp);
  const selfHp = numberOrNull(input?.self?.hp);
  const remainingAcceptedShots = targetHp === null
    ? null
    : Math.ceil(Math.ceil(Math.max(0, targetHp) / 3) / acceptedHitRateEWMA);
  const distance = Number(target.distance ?? stateful.combatTarget?.distance);
  const approachStamina = Number.isFinite(distance)
    ? Math.max(0, distance - 7500) * Math.max(0, Number(options.movementCostMsPerCm ?? 1))
    : 0;
  const preDodgeStamina = ['burst', 'sustained', 'preparing'].includes(String(
    combatDecision?.dryRun?.behavior?.dimensions?.shootingPhase?.state || ''
  )) ? Math.max(0, Number(options.combatShootDodgeReserveMs || 1800)) : 0;
  const shootingStamina = remainingAcceptedShots === null
    ? Infinity
    : remainingAcceptedShots * Math.max(1, Number(options.combatShotStaminaCostMs ?? 500));
  const switchCost = Math.max(0, Number(options.opportunitySwitchCostStaminaMs ?? 500));
  const completionOptions = {
    ...options,
    recentCombatMetrics: metrics,
    behaviorHitRate: acceptedHitRateEWMA,
    combatTargetState: stateful.combatTarget,
    opponentBehaviorState: stateful.combatTarget?.opponentBehaviorState || null,
    exchangeStopLoss: combatDecision?.dryRun?.exchangeStopLoss || null
  };
  const completion = activeTargetCompletionEstimate(target, completionOptions);
  const completionProbability = Math.max(0.03, Math.min(0.95, Number(completion.probability || 0)));
  const escapeHazard = Math.max(0, Math.min(0.97, 1 - completionProbability));
  const expectedRemainingStamina = shootingStamina + approachStamina + preDodgeStamina + switchCost;
  const effectiveReward = effectiveProfitReward(target, {
    ...completionOptions,
    staminaCostOverride: expectedRemainingStamina
  });
  const expectedRemainingReward = effectiveReward.expectedReward;
  const marginalNetROI = effectiveReward.netROI;
  const isCurrentTargetChoice = choice => String(choice?.type || '') === 'enemy'
    && opportunityChoiceTargetId(choice) === targetId;
  const rawAlternative = opportunity.rawChoice || null;
  const stableAlternative = opportunity.choice || null;
  const alternative = rawAlternative && !isCurrentTargetChoice(rawAlternative)
    ? rawAlternative
    : (stableAlternative && !isCurrentTargetChoice(stableAlternative) ? stableAlternative : null);
  const alternativeReward = numberOrNull(alternative?.reward ?? alternative?.expectedReward ?? alternative?.amount);
  const alternativeStamina = numberOrNull(alternative?.staminaCost ?? alternative?.estimatedStaminaCost);
  const bestAlternativeNetROI = alternativeReward === null || alternativeStamina === null
    ? null
    : rewardPerTenStamina(alternativeReward, alternativeStamina);
  const threshold = thresholdContext?.active
    ? Math.max(0, Number(thresholdContext?.threshold?.coinsPer10Stamina ?? 0))
    : 0;
  const requiredRoi = Math.max(threshold, Number(bestAlternativeNetROI || 0) * 0.85);
  const ready = engagedMs >= Math.max(8000, Number(options.proactiveCombatMarginalRoiMinEngageMs ?? 8000))
    && acceptedShots >= Math.max(10, Number(options.proactiveCombatMarginalRoiMinAcceptedShots ?? 10))
    && marginalNetROI !== null;
  const damageProgress = profitPursuitDamageProgress(combatDecision, stateful);
  const recentDamage = nowMs - Number(stateful.combatTarget?.lastDamageAt || 0) <= 3000
    ? Math.max(0, Number(stateful.combatTarget?.lastDamageAmount || 0))
    : 0;
  const lowHpFinishProtected = targetHp !== null && selfHp !== null
    && targetHp <= 20
    && selfHp >= targetHp + 10
    && (recentDamage > 0 || Number(damageProgress.damageFromStart || 0) > 0);
  const disadvantaged = Boolean(ready && !lowHpFinishProtected && marginalNetROI < requiredRoi);
  const previous = stateful.proactiveCombatMarginalRoiState[targetId] || null;
  const disadvantageSinceAt = disadvantaged
    ? Number(previous?.disadvantageSinceAt || nowMs)
    : 0;
  const confirmMs = Math.max(2000, Number(options.proactiveCombatMarginalRoiConfirmMs ?? 2500));
  const triggered = Boolean(disadvantaged && nowMs - disadvantageSinceAt >= confirmMs);
  const result = {
    ready,
    active: disadvantaged,
    triggered,
    // ROI remains an admission signal. Once the stable fight has enough
    // evidence to evaluate marginal ROI, dropping it would hand control to an
    // opponent that continues firing. Keep the result as diagnostics only.
    disengage: false,
    advisory: triggered,
    reason: triggered
      ? 'proactive-combat-marginal-roi-continue-established'
      : (disadvantaged ? 'proactive-combat-marginal-roi-disadvantage' : 'proactive-combat-marginal-roi-acceptable'),
    acceptedHitRateEWMA,
    completionProbability,
    escapeHazard,
    remainingAcceptedShots,
    expectedRemainingReward,
    expectedRemainingStamina: Number.isFinite(expectedRemainingStamina) ? Math.round(expectedRemainingStamina) : null,
    marginalNetROI,
    bestAlternativeNetROI,
    bestAlternativeType: String(alternative?.type || ''),
    bestAlternativeTargetId: opportunityChoiceTargetId(alternative),
    thresholdActive: Boolean(thresholdContext?.active),
    thresholdRoi: threshold,
    requiredRoi,
    disadvantageSinceAt,
    confirmMs,
    engagedMs,
    acceptedShots,
    lowHpFinishProtected,
    effectiveProfitReward: effectiveReward,
    defensiveRisk
  };
  stateful.proactiveCombatMarginalRoiState[targetId] = {
    ...result,
    updatedAt: nowMs
  };
  return result;
}

function buildProfitPursuitSuppression(input, combatDecision, stateful = {}, options = {}) {
  const target = combatDecision?.target || combatDecision?.dryRun?.target || null;
  if (!target || !combatDecisionIsOrdinaryProfitPursuit(combatDecision, input, stateful)) return null;
  const nowMs = Number.isFinite(Number(input?.nowMs)) ? Number(input.nowMs) : Date.now();
  const targetId = targetIdentity(target);
  if (!targetId) return null;
  const suppressions = profitPursuitSuppressionMap(stateful, nowMs);
  const closePressure = combatDecision?.dryRun?.combatPhase?.active === true
    || stateful?.combatTarget?.combatPhase === 'close-pressure';
  const centerRadius = browserlessCenterActivityRadius(options);
  const centerExtension = Math.max(0, Number(options.combatAttackRange ?? options.attackRange ?? DEFAULT_ATTACK_RANGE));
  const pursuitRadius = centerRadius > 0 ? centerRadius + centerExtension : 0;
  const selfRadius = pointRadiusFromOrigin(input?.self);
  const targetRadius = pointRadiusFromOrigin(target);
  const outsideCenterReason = pursuitRadius > 0 && Number.isFinite(targetRadius) && targetRadius > pursuitRadius
    ? 'profit-pursuit-target-outside-center'
    : (pursuitRadius > 0 && Number.isFinite(selfRadius) && selfRadius > pursuitRadius
        ? 'profit-pursuit-self-outside-center'
        : '');
  const cached = suppressions[targetId] || null;
  if (cached && Number(cached.until || 0) > nowMs && (!closePressure || outsideCenterReason)) {
    clearSuppressedCombatTarget(stateful, targetId);
    return {
      ...cloneJson(cached),
      remainingMs: Math.max(0, Math.round(Number(cached.until || 0) - nowMs)),
      cached: true,
      suppressed: true
    };
  }
  const dangerous = dangerousTargetCooldownRecordById(stateful, targetId, nowMs);
  if (dangerous) {
    clearSuppressedCombatTarget(stateful, targetId);
    return {
      ...cloneJson(dangerous),
      reason: 'profit-pursuit-dangerous-target-cooldown',
      dangerousReason: dangerous.reason || '',
      remainingMs: Math.max(0, Math.round(Number(dangerous.until || 0) - nowMs)),
      dangerousCooldown: true,
      suppressed: true
    };
  }

  if (closePressure && !outsideCenterReason) {
    delete suppressions[targetId];
    return {
      suppressed: false,
      closePressure: true,
      reason: 'profit-pursuit-close-pressure',
      targetId,
      at: nowMs,
      engagedMs: Math.round(profitPursuitEngagedMs(combatDecision, stateful, nowMs)),
      trigger: combatDecision?.dryRun?.combatPhase?.triggerReason
        || stateful?.combatTarget?.closePressure?.triggerReason
        || 'stable-no-progress-engagement',
      target: summarizeTarget(target)
    };
  }

  const exchangeStopLoss = combatDecision?.dryRun?.exchangeStopLoss || null;
  if (exchangeStopLoss?.disengage) {
    const suppressMs = Math.max(60000, Number(options.combatExchangeSuppressMs || 300000));
    const suppression = {
      reason: exchangeStopLoss.reason || 'combat-exchange-stop-loss',
      targetId,
      at: nowMs,
      until: nowMs + suppressMs,
      suppressMs: Math.round(suppressMs),
      exchangeStopLoss: cloneJson(exchangeStopLoss)
    };
    suppressions[targetId] = suppression;
    clearSuppressedCombatTarget(stateful, targetId);
    return { ...suppression, suppressed: true };
  }

  const marginalRoiStopLoss = combatDecision?.dryRun?.marginalRoiStopLoss || null;
  if (marginalRoiStopLoss?.disengage) {
    const suppressMs = Math.max(30000, Number(options.proactiveCombatMarginalRoiSuppressMs || 120000));
    const suppression = {
      reason: marginalRoiStopLoss.reason || 'proactive-combat-marginal-roi-stop-loss',
      targetId,
      at: nowMs,
      until: nowMs + suppressMs,
      suppressMs: Math.round(suppressMs),
      marginalRoiStopLoss: cloneJson(marginalRoiStopLoss)
    };
    suppressions[targetId] = suppression;
    clearSuppressedCombatTarget(stateful, targetId);
    return { ...suppression, suppressed: true };
  }

  // New ordinary-profit targets remain constrained to the dense center. An
  // already engaged target gets one attack-range of hysteresis so crossing
  // the exact circle edge cannot cancel a close finishing opportunity.
  const engagedMs = profitPursuitEngagedMs(combatDecision, stateful, nowMs);
  const damageProgress = profitPursuitDamageProgress(combatDecision, stateful);
  let reason = outsideCenterReason;
  if (!reason) return null;

  const suppressMs = Math.max(0, Number(options.browserlessProfitPursuitSuppressMs
    ?? BROWSER_RUNTIME_DEFAULTS.browserlessProfitPursuitSuppressMs
    ?? 60000));
  const suppression = {
    suppressed: true,
    reason,
    targetId,
    at: nowMs,
    until: nowMs + suppressMs,
    suppressMs: Math.round(suppressMs),
    engagedMs: Math.round(engagedMs),
    centerRadiusCm: Math.round(centerRadius),
    centerExtensionCm: Math.round(centerExtension),
    pursuitRadiusCm: Math.round(pursuitRadius),
    selfRadiusCm: Number.isFinite(selfRadius) ? Math.round(selfRadius) : null,
    targetRadiusCm: Number.isFinite(targetRadius) ? Math.round(targetRadius) : null,
    firstHp: damageProgress.firstHp,
    minHp: damageProgress.minHp,
    targetHp: damageProgress.targetHp,
    damageFromStart: damageProgress.damageFromStart === null ? null : Math.round(Number(damageProgress.damageFromStart) * 10) / 10,
    target: summarizeTarget(target)
  };
  suppressions[targetId] = cloneJson(suppression);
  clearSuppressedCombatTarget(stateful, targetId);
  return suppression;
}

function easyKillApproachWindowMs(options = {}) {
  const value = Number(options.browserlessEasyKillApproachWindowMs
    ?? BROWSER_RUNTIME_DEFAULTS.browserlessEasyKillApproachWindowMs
    ?? DEFAULT_EASY_KILL_APPROACH_WINDOW_MS);
  return Number.isFinite(value) ? Math.max(1000, value) : DEFAULT_EASY_KILL_APPROACH_WINDOW_MS;
}

function easyKillApproachMinClosingCm(options = {}) {
  const value = Number(options.browserlessEasyKillApproachMinClosingCm
    ?? BROWSER_RUNTIME_DEFAULTS.browserlessEasyKillApproachMinClosingCm
    ?? DEFAULT_EASY_KILL_APPROACH_MIN_CLOSING_CM);
  return Number.isFinite(value) ? Math.max(0, value) : DEFAULT_EASY_KILL_APPROACH_MIN_CLOSING_CM;
}

function reconcileEasyKillTracker(input, stateful = {}, options = {}) {
  const tracker = easyKillPlayerTracker(options);
  if (!tracker) return refreshEasyKillTargetAnnotations(input, stateful, options);
  callEasyKillPlayerTracker(options, 'observeKillEvidence', input.selfKillEvidence || [], {
    atMs: input.nowMs,
    selfHp: hpValue(input.self),
    selfMaxHp: numberOrNull(input.self?.max_hp ?? input.self?.maxHp)
  });
  callEasyKillPlayerTracker(options, 'expirePendingOutcomes', input.nowMs);
  callEasyKillPlayerTracker(options, 'observeVisibleTargets', input.visibleTargets || [], {
    atMs: input.nowMs,
    tick: input.realtime?.tick,
    missingGraceMs: Math.max(2500, Number(options.enemyMissingHoldMs || 0)),
    reason: 'active-target-missing'
  });
  return refreshEasyKillTargetAnnotations(input, stateful, options, easyKillTrackerStatus(options));
}

function easyKillApproachTarget(input, approach) {
  if (!approach) return null;
  const id = String(approach.targetId ?? '');
  if (!id) return null;
  return (input?.visibleTargets || []).find(target => String(easyKillTargetUserId(target) ?? '') === id) || null;
}

function clearEasyKillOpportunityTarget(stateful = {}, targetId = '') {
  if (!targetId) return;
  clearSuppressedCombatTarget(stateful, targetId);
  const choiceId = opportunityChoiceTargetId(stateful.opportunityChoice || stateful.currentOpportunity || null);
  if (choiceId === String(targetId)) {
    stateful.opportunityChoice = null;
    stateful.currentOpportunity = null;
    stateful.opportunitySwitchLock = null;
    stateful.switchLock = null;
  }
}

function suppressEasyKillTarget(stateful = {}, target = null, input = {}, options = {}, reason = '') {
  const userId = easyKillTargetUserId(target);
  if (userId === null) return null;
  const nowMs = Number(input?.nowMs || Date.now());
  const suppressMs = Math.max(0, Number(options.browserlessProfitPursuitSuppressMs
    ?? BROWSER_RUNTIME_DEFAULTS.browserlessProfitPursuitSuppressMs
    ?? 60000));
  const record = {
    reason: String(reason || 'easy-kill-stop-loss'),
    at: nowMs,
    until: nowMs + suppressMs,
    target: summarizeTarget(target)
  };
  ensureEasyKillTargetSuppressionMap(stateful, nowMs)[String(userId)] = record;
  clearEasyKillOpportunityTarget(stateful, String(userId));
  return record;
}

function recordEasyKillApproachFailure(input, stateful = {}, target = null, options = {}, reason = '', detail = {}) {
  if (!target) return null;
  const userId = easyKillTargetUserId(target);
  if (userId === null) return null;
  const suppression = suppressEasyKillTarget(stateful, target, input, options, reason);
  callEasyKillPlayerTracker(options, 'recordImmediateFailure', target, reason, { atMs: input.nowMs });
  for (const visible of input.visibleTargets || []) {
    if (String(easyKillTargetUserId(visible) ?? '') !== String(userId)) continue;
    visible.easyKillKnown = false;
    visible.easyKillProfitTarget = false;
  }
  input.easyKillTargets = (input.easyKillTargets || []).filter(item => String(easyKillTargetUserId(item) ?? '') !== String(userId));
  if (input.easyKill) input.easyKill.visibleEligibleCount = input.easyKillTargets.length;
  stateful.easyKillApproach = null;
  return {
    reason: String(reason || 'easy-kill-approach-stop-loss'),
    targetId: String(userId),
    at: input.nowMs,
    windowMs: easyKillApproachWindowMs(options),
    minClosingCm: easyKillApproachMinClosingCm(options),
    suppression,
    target: summarizeTarget(target),
    ...detail
  };
}

function reconcileEasyKillApproach(input, stateful = {}, options = {}) {
  const approach = stateful.easyKillApproach || null;
  if (!approach) return null;
  const combatTarget = stateful.combatTarget || null;
  const combatTargetId = targetIdentity(combatTarget);
  if ((combatTarget?.combatPhase === 'close-pressure' || combatTarget?.closePressure?.active === true)
    && combatTargetId
    && combatTargetId === String(approach.targetId ?? '')) {
    stateful.easyKillApproach = null;
    return null;
  }
  const nowMs = Number(input?.nowMs || Date.now());
  const target = easyKillApproachTarget(input, approach);
  if (!target) {
    const missingSince = Number(approach.missingSince || 0) || nowMs;
    approach.missingSince = missingSince;
    const missingHoldMs = Math.max(1000, Number(options.enemyMissingHoldMs || 1800));
    if (nowMs - missingSince >= missingHoldMs) {
      return recordEasyKillApproachFailure(input, stateful, {
        userId: approach.targetId,
        name: approach.name || '',
        x: approach.x,
        y: approach.y,
        distance: approach.lastDistance,
        active: true,
        easyKillKnown: true,
        easyKillProfitTarget: true
      }, options, 'easy-kill-approach-target-missing', {
        missingMs: Math.max(0, nowMs - missingSince)
      });
    }
    stateful.easyKillApproach = approach;
    return null;
  }
  approach.missingSince = 0;
  approach.name = entityDisplayName(target) || approach.name || '';
  approach.x = numberOrNull(target.x);
  approach.y = numberOrNull(target.y);
  const distance = Number(target.distance);
  approach.lastDistance = Number.isFinite(distance) ? distance : approach.lastDistance;
  if (!target.easyKillKnown || !target.active || target.alive === false || target.invulnerable) {
    return recordEasyKillApproachFailure(input, stateful, target, options, 'easy-kill-approach-target-unavailable');
  }
  const combatRange = Math.max(0, Number(options.combatAttackRange || options.attackRange || DEFAULT_ATTACK_RANGE));
  if (Number.isFinite(distance) && distance <= combatRange) {
    stateful.easyKillApproach = null;
    return null;
  }
  const windowMs = easyKillApproachWindowMs(options);
  const minClosingCm = easyKillApproachMinClosingCm(options);
  if (!Number.isFinite(Number(approach.windowStartDistance))) approach.windowStartDistance = distance;
  if (!Number.isFinite(Number(approach.windowStartedAt))) approach.windowStartedAt = nowMs;
  const elapsedMs = Math.max(0, nowMs - Number(approach.windowStartedAt || nowMs));
  if (Number.isFinite(distance) && elapsedMs >= windowMs) {
    const closingCm = Number(approach.windowStartDistance) - distance;
    if (closingCm < minClosingCm) {
      return recordEasyKillApproachFailure(input, stateful, target, options, 'easy-kill-approach-no-progress', {
        elapsedMs: Math.round(elapsedMs),
        windowStartDistance: Math.round(Number(approach.windowStartDistance)),
        currentDistance: Math.round(distance),
        closingCm: Math.round(closingCm)
      });
    }
    approach.windowStartedAt = nowMs;
    approach.windowStartDistance = distance;
  }
  stateful.easyKillApproach = approach;
  return null;
}

function rememberEasyKillApproach(action, input, stateful = {}, options = {}) {
  if (!stateful || typeof stateful !== 'object') return null;
  const target = action?.target || null;
  const eligible = action?.band === 'profit'
    && (action?.kind === 'seek-enemy' || action?.kind === 'attack')
    && target?.easyKillProfitTarget === true;
  if (!eligible) {
    if (Number(stateful.easyKillApproach?.missingSince || 0) > 0) return stateful.easyKillApproach;
    stateful.easyKillApproach = null;
    return null;
  }
  const userId = easyKillTargetUserId(target);
  const distance = Number(target?.distance);
  const combatRange = Math.max(0, Number(options.combatAttackRange || options.attackRange || DEFAULT_ATTACK_RANGE));
  if (userId === null || !Number.isFinite(distance) || distance <= combatRange) {
    stateful.easyKillApproach = null;
    return null;
  }
  const previous = stateful.easyKillApproach || null;
  if (previous && String(previous.targetId ?? '') === String(userId)) return previous;
  stateful.easyKillApproach = {
    targetId: String(userId),
    name: target.name || '',
    startedAt: input.nowMs,
    windowStartedAt: input.nowMs,
    windowStartDistance: distance,
    lastDistance: distance,
    missingSince: 0,
    x: numberOrNull(target.x),
    y: numberOrNull(target.y)
  };
  return stateful.easyKillApproach;
}

function reconcileEasyKillCombatOutcome(decision, input, options = {}) {
  const tracker = easyKillPlayerTracker(options);
  if (!tracker || !decision) return null;
  const action = decision.action || {};
  const combatTarget = decision.combat?.target || null;
  const activeCombatEngaged = action.kind === 'combat-live'
    || ((action.kind === 'leave' || action.kind === 'safety-exit' || action.shouldLeave) && decision.combat?.exit);
  if (activeCombatEngaged && combatTarget?.active === true) {
    callEasyKillPlayerTracker(options, 'observeCombatEngagement', combatTarget, {
      atMs: input.nowMs,
      tick: decision.tick ?? decision.combat?.tick ?? null,
      selfHp: hpValue(input.self),
      selfMaxHp: numberOrNull(input.self?.max_hp ?? input.self?.maxHp)
    });
  }
  const pursuitSuppression = decision.combat?.profitPursuitSuppression || null;
  if (pursuitSuppression?.targetId && pursuitSuppression.suppressed !== false) {
    callEasyKillPlayerTracker(options, 'finishEngagement', pursuitSuppression.targetId, pursuitSuppression.reason || 'profit-pursuit-stopped', { atMs: input.nowMs });
  }
  if (action.shouldLeave || action.kind === 'leave' || action.kind === 'safety-exit') {
    return callEasyKillPlayerTracker(options, 'finishActiveEngagements', action.reason || 'combat-exit', { atMs: input.nowMs });
  }
  const status = easyKillTrackerStatus(options);
  const active = (status.engagements || []).filter(item => item.active);
  for (const engagement of active) {
    const reason = easyKillEngagementFinishReason(decision, engagement.userId);
    if (!reason) continue;
    callEasyKillPlayerTracker(options, 'finishEngagement', engagement.userId, reason, { atMs: input.nowMs });
  }
  return null;
}

function easyKillEngagementFinishReason(decision, engagementUserId) {
  const action = decision?.action || {};
  const combatTarget = decision?.combat?.target || null;
  const selectedCombatTargetId = EASY_KILL_ENGAGEMENT_CONTINUATION_ACTIONS.has(action.kind)
    ? easyKillTargetUserId(action.target || combatTarget)
    : null;
  if (selectedCombatTargetId === null || String(selectedCombatTargetId) === String(engagementUserId)) return '';
  const combatTargetId = easyKillTargetUserId(combatTarget);
  if (combatTargetId !== null
    && String(engagementUserId) === String(combatTargetId)
    && decision?.combat?.kiteReassessment?.blocked) {
    return 'retreat-kite-better-profit';
  }
  return 'combat-target-switched';
}

function buildReturnToCenterDecision(input, options = {}) {
  if (!input?.self) return null;
  const radius = browserlessCenterActivityRadius(options);
  if (!(radius > 0)) return null;
  const selfRadius = pointRadiusFromOrigin(input.self);
  if (!Number.isFinite(selfRadius) || selfRadius <= radius) return null;
  const x = Number(input.self.x);
  const y = Number(input.self.y);
  const dx = Number.isFinite(x) ? Math.sign(-x) : 0;
  const dy = Number.isFinite(y) ? Math.sign(-y) : 0;
  if (!dx && !dy) return null;
  return {
    kind: 'patrol',
    band: 'recover',
    reason: 'return-to-center-activity-radius',
    dx,
    dy,
    stopMotion: false,
    self: summarizeTarget(input.self),
    centerActivity: {
      radiusCm: Math.round(radius),
      selfRadiusCm: Math.round(selfRadius),
      distanceOutsideCm: Math.max(0, Math.round(selfRadius - radius))
    }
  };
}

function buildOutsideCenterProfitWaitDecision(input, options = {}) {
  if (!input?.self) return null;
  const radius = browserlessCenterActivityRadius(options);
  if (!(radius > 0)) return null;
  const selfRadius = pointRadiusFromOrigin(input.self);
  if (!Number.isFinite(selfRadius) || selfRadius <= radius) return null;
  return {
    kind: 'wait',
    band: 'recover',
    reason: 'outside-center-profit-wait',
    stopMotion: true,
    profitDropout: {
      kind: 'outside-center-profit-wait',
      yieldable: true
    },
    self: summarizeTarget(input.self),
    centerActivity: {
      radiusCm: Math.round(radius),
      selfRadiusCm: Math.round(selfRadius),
      distanceOutsideCm: Math.max(0, Math.round(selfRadius - radius))
    }
  };
}

function buildOutsideCenterIdleTimeoutLeaveDecision(input, outsideCenterIdle, options = {}) {
  if (!outsideCenterIdle?.shouldExit || !input?.self) return null;
  return {
    kind: 'leave',
    band: 'safety',
    reason: 'outside-center-idle-timeout-leave',
    shouldLeave: true,
    stopMotion: true,
    reloginDelayMs: Math.max(1000, Number(options.loopDelayMs || 30000)),
    self: summarizeTarget(input.self),
    outsideCenterIdle: cloneJson(outsideCenterIdle.summary)
  };
}

function buildBrowserlessDecision(state, stateful = {}, options = {}) {
  const input = buildBrowserlessStrategyInput(state, options, stateful);
  observePostAttackCoinBaseline(input, stateful, {
    ...options,
    forcePostAttackCoinDecoration: true
  });
  const coinPickups = observeBrowserlessCoinPickups(input, stateful, options);
  cleanupCoinProgressState(stateful, input.nowMs, options);
  applyIgnoredCoinFilter(input, stateful);
  clearActiveCoinCompetitionDecisionState(input, stateful);
  const easyKillTrackerState = reconcileEasyKillTracker(input, stateful, options);
  const easyKillApproachStopLoss = reconcileEasyKillApproach(input, stateful, options);
  const staleSelfMs = Math.max(1000, Number(options.staleSelfMs || DEFAULT_STALE_SELF_MS));
  const staleSelfConfirmMs = Math.max(0, Number(options.staleSelfConfirmMs ?? DEFAULT_STALE_SELF_CONFIRM_MS));
  const staleSelfExitMs = staleSelfMs + staleSelfConfirmMs;
  const nonCombatProfit = options.controlMode === 'non-combat-profit' || options.nonCombatProfit === true;
  const profitLive = options.controlMode === 'profit-live';
  const combatDryRun = options.controlMode === 'combat-dry-run';
  const combatLiveEnabled = (options.controlMode === 'combat-live' || profitLive) && options.combatEnabled === true;
  const combatDecisionEnabled = options.combatDecisionEnabled !== false && !nonCombatProfit && (!profitLive || options.combatEnabled === true);
  const frameAge = Number(input.realtime.frameAgeMs);
  const realtimeStale = Number.isFinite(frameAge) && frameAge > staleSelfExitMs;
  const profitThresholdContext = buildProfitThresholdContext(input, options);
  const profitSelectionInput = buildProfitSelectionInput(input, profitThresholdContext, options, stateful);
  const opportunity = buildOpportunityDecision(input, stateful, {
    ...options,
    profitThresholdContext,
    includeAfkProfitTargets: nonCombatProfit ? false : options.includeAfkProfitTargets
  });
  const easyKillPreferredTargetId = easyKillPreferredTargetIdFromOpportunity(opportunity, stateful);
  const previousCombatTarget = cloneJson(stateful.combatTarget || null);
  const previousCombatMetrics = cloneJson(stateful.combatMetrics || null);
  const previousCombatTargetId = targetIdForAttackHistory(previousCombatTarget);
  const combat = buildCombatDecision(input, stateful, {
    ...options,
    easyKillPreferredTargetId
  });
  const closePressureCombat = combatDecisionClosePressureActive(combat);
  const marginalRoiStopLoss = evaluateProactiveCombatMarginalRoi(
    input,
    combat,
    opportunity,
    stateful,
    profitThresholdContext,
    options
  );
  if (combat?.dryRun && marginalRoiStopLoss) combat.dryRun.marginalRoiStopLoss = marginalRoiStopLoss;
  const nonThreatEconomicStopLoss = evaluateNonThreatCombatEconomicStopLoss(
    input,
    combat,
    stateful,
    marginalRoiStopLoss,
    options
  );
  if (combat?.dryRun && nonThreatEconomicStopLoss) {
    combat.dryRun.nonThreatEconomicStopLoss = nonThreatEconomicStopLoss;
  }
  let dangerousCombatExit = rememberDangerousCombatExitTarget(input, combat, stateful, options);
  const combatPursuitSuppression = rememberNonThreatCombatEconomicSuppression(
    input,
    combat,
    nonThreatEconomicStopLoss,
    stateful,
    options
  ) || buildProfitPursuitSuppression(input, combat, stateful, options);
  const combatPursuitSuppressed = Boolean(
    combatPursuitSuppression && combatPursuitSuppression.suppressed !== false
  );
  let combatActionEligible = isCombatActionEligibleForDecision(combat, options) && !combatPursuitSuppressed;
  const combatTarget = combat?.target || null;
  const postKillSettlement = reconcilePostKillSettlement(input, stateful, combat, previousCombatTarget, options);
  const postAttackSettlement = reconcilePostAttackSettlements(input, stateful, options, combat);
  const combatTargetId = targetIdForAttackHistory(combatTarget);
  const continuingPreviousCombatTarget = previousCombatTargetId !== null
    && previousCombatTargetId !== undefined
    && previousCombatTargetId !== ''
    && combatTargetId !== null
    && combatTargetId !== undefined
    && combatTargetId !== ''
    && String(previousCombatTargetId) === String(combatTargetId);
  const recentCombatCommitmentMs = Math.max(5000, Number(options.combatEngageGraceMs || 30000));
  const acceptedShotCommittedTarget = [stateful.combatMetrics, previousCombatMetrics].some(metrics => {
    const metricsTargetId = metrics?.targetId;
    const observedAt = Number(metrics?.actualLastShotAt || metrics?.lastObservedAt || metrics?.startedAt || 0);
    return combatTargetId !== null
      && combatTargetId !== undefined
      && combatTargetId !== ''
      && metricsTargetId !== null
      && metricsTargetId !== undefined
      && metricsTargetId !== ''
      && String(metricsTargetId) === String(combatTargetId)
      && Number(metrics?.acceptedShots || 0) > 0
      && observedAt > 0
      && input.nowMs - observedAt <= recentCombatCommitmentMs;
  });
  const freshProactiveCombat = Boolean(
    combatActionEligible
      && combatTarget
      && !closePressureCombat
      && combatTarget.combatIntent !== 'defensive'
      && !combatTarget.combatEngagement
      && !continuingPreviousCombatTarget
  );
  let activeCombatOpportunity = null;
  let kiteReassessment = null;
  const competingOpportunity = opportunity.choice || opportunity.rawChoice || null;
  if (freshProactiveCombat && competingOpportunity) {
    const combatScore = scoreEnemyOpportunity(combatTarget, {
      ...options,
      recentCombatMetrics: stateful.combatMetrics,
      behaviorHitRate: combat.dryRun?.behavior?.recentHitRate ?? undefined,
      combatTargetState: stateful.combatTarget,
      opponentBehaviorState: stateful.combatTarget?.opponentBehaviorState || null,
      exchangeStopLoss: combat.dryRun?.exchangeStopLoss || null,
      isAfkProfitTarget: () => false
    });
    const competingScore = Number(competingOpportunity.score || 0);
    const competingTargetId = opportunityChoiceTargetId(competingOpportunity);
    const sameCombatTarget = Boolean(competingTargetId
      && String(competingTargetId) === String(combatTarget?.userId ?? combatTarget?.user_id ?? ''));
    const switchRatio = 1 + Math.max(0, Number(options.opportunitySwitchRelativeMargin || OPPORTUNITY_CONSTANTS.OPPORTUNITY_SWITCH_RELATIVE_MARGIN || 0));
    const blocked = !acceptedShotCommittedTarget
      && !sameCombatTarget
      && Number.isFinite(Number(combatScore))
      && competingScore > Number(combatScore) * switchRatio;
    activeCombatOpportunity = {
      combatScore: Number.isFinite(Number(combatScore)) ? Math.round(Number(combatScore)) : null,
      competingScore: Math.round(competingScore),
      competingType: competingOpportunity.type || '',
      competingSource: opportunity.choice ? 'stable-choice' : 'raw-choice',
      sameCombatTarget,
      hitRateSource: combat.dryRun?.behavior?.recentHitRate !== null
        && combat.dryRun?.behavior?.recentHitRate !== undefined
        && Number.isFinite(Number(combat.dryRun.behavior.recentHitRate))
        ? 'behavior-mode-distance'
        : (stateful.combatMetrics?.targetId === String(combatTarget.userId) ? 'recent-target' : 'active-default'),
      blocked
    };
    if (blocked) combatActionEligible = false;
  }
  if (combatActionEligible
    && !closePressureCombat
    && combat.dryRun?.behavior?.mode === 'retreat-kite'
    && combat.dryRun?.behavior?.responsePolicy?.reassessProfit
    && combatDecisionIsOrdinaryProfitPursuit(combat, input, stateful)) {
    const combatScore = scoreEnemyOpportunity(combatTarget, {
      ...options,
      recentCombatMetrics: stateful.combatMetrics,
      behaviorHitRate: combat.dryRun.behavior.recentHitRate ?? undefined,
      combatTargetState: stateful.combatTarget,
      opponentBehaviorState: stateful.combatTarget?.opponentBehaviorState || null,
      exchangeStopLoss: combat.dryRun?.exchangeStopLoss || null,
      isAfkProfitTarget: () => false
    });
    const competingScore = Number(opportunity.rawChoice?.score || 0);
    const switchRatio = 1 + Math.max(0, Number(options.opportunitySwitchRelativeMargin || OPPORTUNITY_CONSTANTS.OPPORTUNITY_SWITCH_RELATIVE_MARGIN || 0));
    const blocked = Boolean(opportunity.rawChoice && competingScore > Number(combatScore || 0) * switchRatio);
    kiteReassessment = {
      triggered: true,
      noProgressMs: combat.dryRun.behavior.noProgressMs,
      combatScore: Number.isFinite(Number(combatScore)) ? Math.round(Number(combatScore)) : null,
      competingScore: opportunity.rawChoice ? Math.round(competingScore) : null,
      competingType: opportunity.rawChoice?.type || '',
      aimConfidence: numberOrNull(combat.dryRun?.aim?.confidence),
      targetDrop: entityDropValue(combatTarget),
      blocked,
      reason: blocked ? 'retreat-kite-better-profit' : 'retreat-kite-high-value-or-no-better-profit'
    };
    if (blocked) combatActionEligible = false;
  }
  const combatForProfit = combatPursuitSuppressed
    ? {
        ...combat,
        target: null,
        dryRun: combat.dryRun ? { ...combat.dryRun, target: null } : combat.dryRun
      }
    : combat;
  const highValueCoinPriorityAction = (profitLive || nonCombatProfit)
    ? buildHighValueVisibleCoinPriorityDecision(profitSelectionInput, combatForProfit, options)
    : null;
  const safetyContextOptions = {
    ...options,
    combatActionEligible,
    recentCombatTarget: previousCombatTarget,
    recentCombatMetrics: stateful.combatMetrics || previousCombatMetrics,
    postKillSettlement
  };
  const predictedThreatExitAction = input.self && !realtimeStale
    ? buildBrowserlessPredictedThreatExitDecision(state, input, stateful, combat, safetyContextOptions)
    : null;
  const lowHpRecoveryThreatExitAction = input.self && !realtimeStale
    ? buildLowHpRecoveryThreatExitDecision(input, safetyContextOptions)
    : null;
  let safetyAction = profitLiveSafetyDecision(input, combat, stateful, safetyContextOptions, opportunity.rawAction);
  if (safetyAction) {
    const threat = safetyAction.target || safetyAction.threats?.[0] || null;
    const threatId = threat?.userId ?? threat?.user_id ?? threat?.entityId ?? threat?.entity_id ?? null;
    const realBulletOwner = threatId !== null && threatId !== undefined && (input.bullets || []).some(bullet => {
      const ownerId = bullet?.owner_user_id ?? bullet?.ownerUserId ?? bullet?.owner_id ?? bullet?.ownerId ?? bullet?.user_id;
      return ownerId !== null && ownerId !== undefined && String(ownerId) === String(threatId);
    });
    const evidence = {
      realBulletOwner,
      firing: Boolean(threat?.firing || threat?.shooting || threat?.is_firing),
      recentDamage: Boolean(input.injury?.active || input.self?.recentlyDamaged),
      invulnerableClose: Boolean(threat?.invulnerable && Number(threat?.distance || Infinity) <= Number(options.activeAvoidMaxDistance || BROWSER_RUNTIME_DEFAULTS.activeAvoidMaxDistance || 0))
    };
    safetyAction = {
      ...safetyAction,
      threatEvidence: evidence,
      urgent: Object.values(evidence).some(Boolean)
    };
  }
  const injuryHpExitAction = input.self && !realtimeStale
    ? buildBrowserlessInjuryHpExitDecision(input, stateful, combat, safetyContextOptions)
    : null;
  if (!dangerousCombatExit) {
    dangerousCombatExit = rememberDangerousSafetyExitTarget(
      input,
      injuryHpExitAction,
      stateful,
      options,
      'recent-injury-pressure'
    );
  }
  if (!dangerousCombatExit) {
    dangerousCombatExit = rememberDangerousSafetyExitTarget(
      input,
      predictedThreatExitAction,
      stateful,
      options,
      'realtime-leave-risk'
    );
  }
  const pursuitLeaveAction = input.self && !realtimeStale
    ? buildBrowserlessPursuitLeaveDecision(input, stateful, combat, safetyContextOptions)
    : null;
  const longStaminaExhaustedLeaveAction = input.self && !realtimeStale
    ? buildLongStaminaExhaustedLeaveDecision(input, options)
    : null;
  const hardSafetyAction = safetyActionIsHardLeave(safetyAction) ? safetyAction : null;
  const combatExitAction = combat.exitAction || null;
  const safetyYieldsToHighValueCoin = Boolean(
    safetyAction
      && safetyAction.reason === 'avoid-invulnerable-target'
      && highValueCoinPriorityAction
  );
  const immediateSafetyAction = safetyAction
    && !hardSafetyAction
    && !safetyYieldsToHighValueCoin
    && !safetyActionCanYieldToInjuredFootCoin(safetyAction)
    ? safetyAction
    : null;
  const rawCoinStaminaBudgetExitAction = (profitLive || nonCombatProfit)
    ? buildStaminaBudgetExitDecision(input, options)
    : null;
  const eligibleProfitStaminaBudgetExitAction = (profitLive || nonCombatProfit)
    && !rawCoinStaminaBudgetExitAction
    && !opportunity.choice
    ? buildEligibleProfitStaminaBudgetExitDecision(profitSelectionInput, options)
    : null;
  const staminaBudgetExitAction = rawCoinStaminaBudgetExitAction || eligibleProfitStaminaBudgetExitAction;
  const postAttackDropCoinAction = (profitLive || nonCombatProfit) ? buildPostAttackDropCoinDecision(profitSelectionInput, stateful, options, combat) : null;
  const postAttackDropWaitAction = (profitLive || nonCombatProfit)
    ? (buildPostAttackDropWaitDecision(input, stateful, options, combat) || buildPostKillSettlementWaitDecision(input, stateful))
    : null;
  const recoveryFootCoinAction = (profitLive || nonCombatProfit) ? buildRecoveryFootCoinDecision(profitSelectionInput, options) : null;
  const recoveryAction = (profitLive || nonCombatProfit) ? buildRecoveryDecision(input, opportunity, options) : null;
  const injuredCautionFootCoinAction = safetyAction
    && safetyActionCanYieldToInjuredFootCoin(safetyAction)
    && input.self
    && isInjuredSelf(input.self, options)
    ? buildFootCoinPriorityDecision(profitSelectionInput, 'foot-coin-before-active-caution', options)
    : null;
  const returnToCenterAction = input.self && !realtimeStale && (profitLive || nonCombatProfit)
    ? buildReturnToCenterDecision(input, options)
    : null;
  const outsideCenterProfitWaitAction = returnToCenterAction
    ? buildOutsideCenterProfitWaitDecision(input, options)
    : null;
  const footCoinPriorityAction = (profitLive || nonCombatProfit) ? buildFootCoinPriorityDecision(profitSelectionInput, 'foot-coin-priority', options) : null;
  const dailyFinalCoinAction = (profitLive || nonCombatProfit) && !recoveryAction
    ? buildDailyStaminaFinalCoinDecision(profitSelectionInput, options)
    : null;
  const opportunisticShotWaitAction = (profitLive || nonCombatProfit)
    ? buildOpportunisticShotWaitDecision(profitSelectionInput, stateful, options)
    : null;
  const staminaBlockedWaitAction = (profitLive || nonCombatProfit)
    ? buildStaminaBlockedWaitDecision(profitSelectionInput, options)
    : null;
  const singleCoinBaitEntryAllowed = Boolean(
    profitThresholdContext.active
      && input.self
      && !realtimeStale
      && !hardSafetyAction
      && !lowHpRecoveryThreatExitAction
      && !longStaminaExhaustedLeaveAction
      && !predictedThreatExitAction
      && !combatExitAction
      && !injuryHpExitAction
      && !pursuitLeaveAction
      && !immediateSafetyAction
      && !returnToCenterAction
      && !highValueCoinPriorityAction
      && !(combat.target && combatDecisionEnabled && combatActionEligible)
      && !postAttackDropCoinAction
      && !postAttackDropWaitAction
      && !staminaBudgetExitAction
      && !recoveryFootCoinAction
      && !recoveryAction
      && !injuredCautionFootCoinAction
      && !safetyAction
      && !dailyFinalCoinAction
  );
  const singleCoinBait = buildSingleCoinBaitDecision(
    input,
    opportunity,
    stateful,
    {
      ...options,
      singleCoinBaitEnabled: options.singleCoinBaitEnabled !== false && profitThresholdContext.active
    },
    singleCoinBaitEntryAllowed
  );
  const singleCoinBaitAction = dailyFinalCoinAction ? null : singleCoinBait.action;
  const singleCoinBaitReleaseAction = singleCoinBait.phase === 'release'
    && Number(singleCoinBait.commitmentRank || 0) > 0
    ? singleCoinBaitAction
    : null;
  const noCandidateWaitReason = profitThresholdContext.active
    && Number(opportunity.threshold?.filteredCount || 0) > 0
    && Number(opportunity.threshold?.eligibleCount || 0) === 0
    ? 'dynamic-profit-threshold-wait'
    : 'no-profitable-candidate';
  let kind = 'wait';
  let band = 'wait';
  let reason = '';
  let action = { kind: 'wait', band: 'wait', reason: '' };
  let finalSelection = null;
  let outsideCenterIdle = null;
  if (!input.self) {
    reason = 'missing-realtime-self';
    action.reason = reason;
  } else if (realtimeStale) {
    reason = 'stale-realtime-self';
    action.reason = reason;
  } else {
    const combatAction = combat.target && combatDecisionEnabled && combatActionEligible ? combat.action : null;
    const combatHardGate = Boolean(combatAction && (
      closePressureCombat
      || combat.target?.combatIntent === 'defensive'
      || combat.target?.firing
      || targetHasRealBulletPressure(input, combat.target, stateful.combatTarget)
    ));
    const validUntil = input.nowMs + Math.max(250, Number(options.decisionIntervalMs || 1000));
    const candidate = (candidateAction, order, switchReason, hardGate = false, extra = {}) => buildFinalActionCandidate(candidateAction, {
      nowMs: input.nowMs,
      order,
      switchReason,
      hardGate,
      validUntil,
      ...extra
    });
    let candidates = [
      candidate(hardSafetyAction, 10, 'hard-safety', true, { riskScore: 100 }),
      candidate(longStaminaExhaustedLeaveAction, 20, 'stamina-exhausted-hard-gate', true, { riskScore: 100 }),
      candidate(combatExitAction, 30, 'combat-exit-hard-gate', true, { riskScore: 100 }),
      candidate(injuryHpExitAction, 35, 'injury-hp-hard-gate', true, { riskScore: 100 }),
      candidate(predictedThreatExitAction, 40, 'predicted-threat-hard-gate', true, { riskScore: 100 }),
      candidate(pursuitLeaveAction, 50, 'pursuit-hard-gate', true, { riskScore: 90 }),
      candidate(lowHpRecoveryThreatExitAction, 52, 'low-hp-recovery-threat-hard-gate', true, { riskScore: 100 }),
      candidate(immediateSafetyAction, 55, 'realtime-safety-hard-gate', true, { riskScore: immediateSafetyAction?.urgent ? 100 : 80 }),
      candidate(combatAction, 60, 'engaged-defensive-combat-stick', combatHardGate, {
        roiScore: activeCombatOpportunity?.combatScore,
        staminaCost: combat.dryRun?.metrics?.totalStaminaSpent,
        riskScore: combat.dryRun?.behavior?.mode === 'pressure-shooter' ? 70 : 40
      }),
      candidate(highValueCoinPriorityAction && !singleCoinBaitReleaseAction ? highValueCoinPriorityAction : null, 70, 'high-value-visible-coin'),
      candidate(postAttackDropCoinAction, 80, 'post-attack-drop-coin', false, { commitmentRank: 20 }),
      candidate(postAttackDropWaitAction, 90, 'post-attack-drop-wait', false, { commitmentRank: 20 }),
      candidate(staminaBudgetExitAction, 100, 'stamina-budget-exit', true, { riskScore: 100 }),
      candidate(recoveryFootCoinAction, 110, 'recovery-foot-coin', true),
      candidate(recoveryAction, 120, 'ordinary-recovery', true),
      candidate(injuredCautionFootCoinAction, 130, 'injured-caution-foot-coin'),
      candidate(safetyAction, 140, 'yieldable-safety'),
      candidate(singleCoinBaitAction, 150, 'single-coin-bait', false, {
        commitmentRank: Number(singleCoinBait.commitmentRank || 0),
        netROI: Number.isFinite(Number(singleCoinBaitAction?.netROI)) ? Number(singleCoinBaitAction.netROI) : undefined
      }),
      candidate(footCoinPriorityAction, 160, 'foot-coin-priority'),
      candidate(dailyFinalCoinAction, 170, 'daily-final-coin'),
      candidate(opportunity.choice ? opportunity.action : null, 180, 'best-eligible-profit', false, {
        roiScore: opportunity.choice?.score,
        staminaCost: opportunity.choice?.staminaCost
      }),
      candidate(outsideCenterProfitWaitAction, 185, 'outside-center-profit-wait'),
      candidate(returnToCenterAction, 190, 'return-to-center-fallback'),
      candidate(opportunisticShotWaitAction, 200, 'opportunistic-shot-wait'),
      candidate(staminaBlockedWaitAction, 210, 'stamina-blocked-wait'),
      candidate({
        kind: 'wait',
        band: 'wait',
        reason: noCandidateWaitReason,
        profitDropout: {
          kind: noCandidateWaitReason,
          yieldable: true
        }
      }, 999, 'no-candidate-wait')
    ].filter(Boolean);
    finalSelection = selectFinalActionCandidateCore(candidates);
    action = finalSelection?.action || action;
    outsideCenterIdle = updateOutsideCenterIdleCore(
      stateful.outsideCenterIdle,
      {
        nowMs: input.nowMs,
        self: input.self,
        action
      },
      {
        centerRadiusCm: browserlessCenterActivityRadius(options),
        timeoutMs: options.browserlessOutsideCenterIdleExitMs
      }
    );
    stateful.outsideCenterIdle = outsideCenterIdle.state;
    if (outsideCenterIdle.shouldExit) {
      const timeoutLeaveAction = buildOutsideCenterIdleTimeoutLeaveDecision(input, outsideCenterIdle, options);
      candidates = [
        candidate(timeoutLeaveAction, 5, 'outside-center-idle-timeout', true, { riskScore: 100 }),
        ...candidates
      ].filter(Boolean);
      finalSelection = selectFinalActionCandidateCore(candidates);
      action = finalSelection?.action || action;
    }
    kind = action.finalCandidate?.switchReason === 'best-eligible-profit'
      ? 'profit-candidate'
      : (action.kind || 'wait');
    band = action.band || 'wait';
    reason = action.reason || 'no-profitable-candidate';
    finalSelection = {
      selected: action.finalCandidate || null,
      candidates: candidates.map(item => ({
        kind: item.action.kind || '',
        reason: item.action.reason || '',
        ...item.action.finalCandidate
      }))
    };
  }
  if (!outsideCenterIdle) {
    outsideCenterIdle = updateOutsideCenterIdleCore(
      stateful.outsideCenterIdle,
      {
        nowMs: input.nowMs,
        self: input.self,
        action
      },
      {
        centerRadiusCm: browserlessCenterActivityRadius(options),
        timeoutMs: options.browserlessOutsideCenterIdleExitMs
      }
    );
    stateful.outsideCenterIdle = outsideCenterIdle.state;
  }
  if (input.self && !realtimeStale) {
    const selectedAction = attachOpportunisticShotDecision(action, profitSelectionInput, stateful, options, opportunity);
    if (selectedAction !== action) {
      action = selectedAction;
      kind = action.kind || kind;
      band = action.band || band;
      reason = action.reason || reason;
    }
    let finalAction = applyStaleCoinEscape(
      applyCoinProgressToAction(selectedAction, input, stateful, options),
      stateful,
      input.nowMs
    );
    const ignoredBait = clearIgnoredSingleCoinBait(finalAction, stateful, options);
    finalAction = ignoredBait.action;
    if (ignoredBait.cleared) {
      singleCoinBait.state = null;
      singleCoinBait.phase = '';
      singleCoinBait.coin = null;
      singleCoinBait.action = null;
      singleCoinBait.summary = null;
    }
    if (finalAction !== selectedAction) {
      action = finalAction;
      kind = action.kind || kind;
      band = action.band || band;
      reason = action.reason || reason;
    }
    action = annotateProfitActionThreshold(action, profitThresholdContext, options);
    clearIneligibleFinalProfitHold(stateful, profitThresholdContext, opportunity);
    const arbitratedAction = applyBrowserlessFinalActionArbitration(action, stateful, input, options, opportunity);
    if (arbitratedAction !== action) {
      action = arbitratedAction;
      kind = action.kind || kind;
      band = action.band || band;
      reason = action.reason || reason;
    }
    const diagnosedAction = recordBrowserlessActionSwitchDiagnostics(action, stateful, input, options);
    if (diagnosedAction !== action) {
      action = diagnosedAction;
    }
  }
  const ignoredActionCoinId = action?.ignoredCoin?.id || '';
  const rememberedOpportunityKey = coinDecisionKey(opportunity.opportunityChoice?.sourceCoin || opportunity.opportunityChoice);
  const selectedProfitTargetId = action?.finalCandidate?.priorityBand === 'profit'
    ? opportunityChoiceTargetId(action?.opportunityChoice || action?.target)
    : '';
  const selectedProfitChoice = action?.opportunityChoice
    || opportunity.sorted?.find(item => opportunityChoiceTargetId(item) === selectedProfitTargetId)
    || null;
  const outputOpportunityChoice = ignoredActionCoinId && rememberedOpportunityKey === ignoredActionCoinId
    ? null
    : (action?.finalCandidate?.switchReason === 'best-eligible-profit'
        ? selectedProfitChoice
        : (opportunity.opportunityChoice || null));
  const outputSwitchLock = outputOpportunityChoice ? (opportunity.switchLock || null) : null;
  if (finalSelection) {
    finalSelection.selected = action?.finalCandidate || null;
    const selectedTargetKey = String(action?.finalCandidate?.targetKey || '');
    if (selectedTargetKey && !finalSelection.candidates.some(item => String(item.targetKey || '') === selectedTargetKey)) {
      finalSelection.candidates.unshift({
        kind: action.kind || '',
        reason: action.reason || '',
        ...action.finalCandidate,
        retainedByArbitration: true
      });
    }
  }
  rememberEasyKillApproach(action, input, stateful, options);
  stateful.lastDecisionAction = cloneJson(action);
  const easyKillCandidateDiagnostics = summarizeEasyKillCandidateDiagnostics(
    input,
    opportunity,
    stateful,
    options,
    action
  );
  const decision = {
    ok: true,
    dryRun: true,
    kind,
    band,
    reason,
    at: new Date(input.nowMs).toISOString(),
    tick: input.realtime.tick,
    action,
    finalSelection,
    input: {
      self: summarizeTarget(input.self),
      stamina: input.stamina,
      realtime: input.realtime,
      fallback: input.fallback,
      centerActivity: {
        ...input.centerActivity,
        outsideIdle: cloneJson(outsideCenterIdle.summary)
      },
      profitCoinSource: input.profitCoinSource,
      activeCoinCompetition: cloneJson(input.activeCoinCompetition),
      coinPickups: topItems(coinPickups, item => item, 20),
      selfKillEvidence: topItems(input.selfKillEvidence, item => item, 20),
      postKillSettlement,
      postAttackSettlement,
      nearby: summarizeNearbyForPanel(input, action, combat.dryRun || combat, options, stateful.singleCoinBait),
      dataGaps: input.dataGaps
    },
    profit: {
      best: summarizeOpportunity(
        action?.finalCandidate?.switchReason === 'best-eligible-profit'
          ? (outputOpportunityChoice || opportunity.choice)
          : opportunity.choice
      ),
      rawBest: summarizeOpportunity(opportunity.rawChoice),
      candidates: topItems(opportunity.sorted, summarizeOpportunity),
      threshold: opportunity.threshold,
      switch: opportunity.switchDiagnostics || null,
      competition: cloneJson(input.activeCoinCompetition),
      singleCoinBait: singleCoinBait.summary,
      singleCoinBaitLifecycle: cloneJson(singleCoinBait.lifecycle || null),
      singleCoinBaitContinuation: cloneJson(singleCoinBait.continuation || null),
      singleCoinBaitOpportunityEvaluations: cloneJson(singleCoinBait.opportunityEvaluations || []),
      postAttackSettlement,
      easyKill: {
        ...cloneJson(input.easyKill || {}),
        ...easyKillCandidateDiagnostics,
        tracker: easyKillTrackerState ? {
          file: easyKillTrackerState.file || '',
          playerCount: Number(easyKillTrackerState.playerCount ?? easyKillTrackerState.players?.length ?? 0),
          blockedCount: Array.isArray(easyKillTrackerState.blockedUserIds) ? easyKillTrackerState.blockedUserIds.length : 0
        } : null,
        approach: cloneJson(stateful.easyKillApproach || null),
        stopLoss: easyKillApproachStopLoss
      }
    },
    combat: {
      ...(combat.dryRun || {}),
      target: combat.dryRun?.target || summarizeTarget(combat.target),
      actionEligible: combatActionEligible,
      activeCombatOpportunity,
      kiteReassessment,
      dangerousTargetCooldown: dangerousCombatExit,
      profitPursuitSuppression: combatPursuitSuppression,
      hitAttribution: {
        summary: cloneJson(stateful.combatHitAttributionSummary || null),
        last: cloneJson((stateful.combatHitAttributionHistory || []).at(-1) || null)
      },
      candidates: combat.dryRun?.candidates || topItems(combat.candidates, target => ({
        ...summarizeTarget(target),
        score: Number.isFinite(Number(target.combatScore)) ? Math.round(Number(target.combatScore)) : null
      }))
    },
    stateful: {
      lastDecisionAction: cloneJson(stateful.lastDecisionAction || null),
      opportunityChoice: outputOpportunityChoice,
      switchLock: outputSwitchLock,
      singleCoinBait: cloneJson(stateful.singleCoinBait || null),
      outsideCenterIdle: cloneJson(stateful.outsideCenterIdle || null)
    }
  };
  reconcileEasyKillCombatOutcome(decision, input, options);
  return decision;
}

function summarizeBrowserlessDecision(decision) {
  if (!decision || typeof decision !== 'object') return null;
  return {
    kind: decision.kind || '',
    band: decision.band || '',
    reason: decision.reason || '',
    runId: decision.runId || '',
    at: decision.at || '',
    tick: decision.tick ?? null,
    action: decision.action || null,
    finalSelection: decision.finalSelection || null,
    input: decision.input || null,
    profit: decision.profit || null,
    combat: decision.combat || null
  };
}

function decisionStatePatch(decision) {
  const summary = summarizeBrowserlessDecision(decision);
  if (!summary) return {};
  const observedSelf = summary.input?.self && typeof summary.input.self === 'object'
    ? summary.input.self
    : null;
  const observedStamina = summary.input?.stamina && typeof summary.input.stamina === 'object'
    ? summary.input.stamina
    : null;
  const hasObservedStamina = Boolean(observedStamina && Object.values(observedStamina).some(value => (
    value !== null && value !== undefined && value !== ''
  )));
  const observedTick = summary.tick ?? summary.input?.realtime?.tick;
  const lastKnown = observedSelf
    ? {
        self: observedSelf,
        ...(hasObservedStamina ? { stamina: observedStamina } : {}),
        ...(summary.at ? { at: summary.at } : {}),
        ...(observedTick !== null && observedTick !== undefined && observedTick !== '' && Number.isFinite(Number(observedTick))
          ? { tick: Number(observedTick) }
          : {})
      }
    : null;
  return {
    runner: {
      currentAction: summary.action
    },
    current: {
      self: summary.input?.self || null,
      stamina: summary.input?.stamina || null,
      profit: summary.profit || null,
      combatSummary: summary.combat || null,
      decision: summary,
      decisionState: decision.stateful?.decisionState || null
    },
    ...(lastKnown ? { lastKnown } : {})
  };
}

function targetIdForAttackHistory(target) {
  return target?.userId ?? target?.user_id ?? target?.entityId ?? target?.entity_id ?? target?.id ?? null;
}

function recordAttackHistoryFromActionResult(decisionState, actionResult, decision, options = {}) {
  if (!decisionState || !actionResult) return null;
  const shoot = actionResult.shoot || null;
  if (!shoot?.ok || shoot.skipped || !shoot.command) return null;
  const target = actionResult.target || decision?.action?.target || decision?.combat?.target || null;
  const id = targetIdForAttackHistory(target);
  if (id === null || id === undefined || id === '') return null;
  const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  const combat = actionResult.kind === 'combat-live' || decision?.band === 'combat' || decision?.action?.band === 'combat';
  const coinBaseline = decisionState.postAttackCoinBaseline || null;
  const entry = {
    id,
    name: target?.name || '',
    drop: numberOrNull(target?.drop),
    dropKnown: entityDropKnown(target),
    hp: numberOrNull(target?.hp),
    maxHp: numberOrNull(target?.maxHp ?? target?.max_hp),
    x: numberOrNull(target?.x),
    y: numberOrNull(target?.y),
    distance: numberOrNull(target?.distance),
    at: nowMs,
    tick: numberOrNull(decision?.tick ?? decision?.combat?.tick),
    coinBaselineObservedAt: Number(coinBaseline?.observedAt || 0),
    coinBaselineKeys: Array.isArray(coinBaseline?.keys) ? coinBaseline.keys.slice(0, 1024) : [],
    action: combat ? 'opportunistic-shot' : 'attack',
    afk: !combat && target?.active !== true,
    active: Boolean(target?.active),
    combat,
    mode: target?.mode || target?.profitMetadataMode || '',
    moving: Boolean(target?.moving),
    firing: Boolean(target?.firing)
  };
  decisionState.attackHistory = [
    ...(Array.isArray(decisionState.attackHistory) ? decisionState.attackHistory : []),
    entry
  ].slice(-50);
  if (combat) {
    const previousMetrics = decisionState.combatMetrics || {};
    const sameTarget = String(previousMetrics.targetId ?? '') === String(id);
    const baseMetrics = sameTarget ? previousMetrics : {};
    const previousShotAt = Number(baseMetrics.actualLastShotAt || 0);
    const previousStartedAt = Number(baseMetrics.startedAt);
    decisionState.combatMetrics = {
      ...baseMetrics,
      targetId: String(id),
      targetName: target?.name || baseMetrics.targetName || '',
      startedAt: sameTarget && Number.isFinite(previousStartedAt) ? previousStartedAt : nowMs,
      startedTick: sameTarget
        ? (numberOrNull(baseMetrics.startedTick) ?? numberOrNull(decision?.tick ?? decision?.combat?.tick))
        : numberOrNull(decision?.tick ?? decision?.combat?.tick),
      requestedShots: Number(baseMetrics.requestedShots ?? baseMetrics.actualShots ?? 0) + 1,
      actualShots: Number(baseMetrics.requestedShots ?? baseMetrics.actualShots ?? 0) + 1,
      actualLastShotAt: nowMs,
      actualLastShotTick: numberOrNull(decision?.tick ?? decision?.combat?.tick),
      actualShotIntervalMs: previousShotAt > 0 ? Math.max(0, nowMs - previousShotAt) : null
    };
    if (entry.active) {
      callEasyKillPlayerTracker(options, 'observeCombatShot', target, {
        atMs: nowMs,
        tick: decision?.tick ?? decision?.combat?.tick ?? null,
        selfHp: numberOrNull(decision?.input?.self?.hp),
        selfMaxHp: numberOrNull(decision?.input?.self?.maxHp ?? decision?.input?.self?.max_hp)
      });
    }
  }
  if (!combat) {
    decisionState.combatTarget = {
      id,
      at: nowMs,
      firstSeenAt: nowMs,
      name: entry.name || '',
      x: entry.x,
      y: entry.y,
      hp: numberOrNull(target?.knownHp ?? target?.hp),
      displayHp: numberOrNull(target?.hp),
      drop: entry.drop,
      dropKnown: entry.dropKnown,
      distance: entry.distance,
      reason: decision?.action?.reason || decision?.reason || actionResult.reason || 'profit-afk-attack',
      intent: 'profit',
      originIntent: 'afk-profit',
      originReason: decision?.action?.reason || decision?.reason || actionResult.reason || 'profit-afk-attack',
      lastDamageAt: nowMs,
      lastInRangeAt: nowMs,
      seenTargetRealBulletAt: 0,
      lastDamageAmount: 0,
      noDamageMs: 0,
      motionSamples: [],
      self: null
    };
  }
  return entry;
}

function createBrowserlessDecisionAdapter(options = {}) {
  const decisionState = createBrowserlessDecisionState(options);
  return {
    decide(state, nextOptions = {}) {
      const decision = buildBrowserlessDecision(state, decisionState, {
        ...options,
        ...nextOptions
      });
      decisionState.opportunityChoice = decision.stateful?.opportunityChoice ?? null;
      decisionState.opportunitySwitchLock = decision.stateful?.switchLock || null;
      if (nextOptions.includeDecisionStateSummary !== false) {
        decision.stateful.decisionState = summarizeBrowserlessDecisionState(decisionState);
      }
      return decision;
    },
    evaluateCombat(state, nextOptions = {}) {
      const mergedOptions = { ...options, ...nextOptions };
      const input = buildBrowserlessCombatStrategyInput(state, mergedOptions, decisionState);
      reconcileEasyKillTracker(input, decisionState, mergedOptions);
      const combat = buildCombatDecision(input, decisionState, {
        ...mergedOptions,
        easyKillPreferredTargetId: easyKillPreferredTargetIdFromOpportunity(null, decisionState)
      });
      const output = {
        action: combat.exitAction || combat.action || { kind: 'wait', band: 'wait', reason: 'combat-control-no-target' },
        combat: combat.dryRun,
        exitAction: combat.exitAction || null
      };
      reconcileEasyKillCombatOutcome(output, input, mergedOptions);
      return output;
    },
    evaluateRealtime(state, nextOptions = {}) {
      return buildBrowserlessRealtimeControlDecision(state, decisionState, {
        ...options,
        ...nextOptions
      });
    },
    refreshSnapshotObservation(state, nextOptions = {}) {
      const mergedOptions = { ...options, ...nextOptions };
      const self = state?.realtime?.self || state?.realtime?.lastSelf || null;
      if (!self) return null;
      return refreshRealtimeSnapshotObservation(
        state,
        self,
        decisionState,
        mergedOptions,
        Number.isFinite(Number(mergedOptions.nowMs)) ? Number(mergedOptions.nowMs) : Date.now()
      );
    },
    syncPlannerDecision(decision) {
      const plannerState = decision?.stateful || null;
      if (!plannerState || typeof plannerState !== 'object') return false;
      const proposedChoice = plannerState.opportunityChoice ?? null;
      const currentCombatTargetId = targetIdForAttackHistory(decisionState.combatTarget);
      const proposedTargetId = opportunityChoiceTargetId(proposedChoice);
      if (currentCombatTargetId !== null
        && currentCombatTargetId !== undefined
        && currentCombatTargetId !== ''
        && (proposedTargetId === null
          || proposedTargetId === undefined
          || proposedTargetId === ''
          || String(proposedTargetId) !== String(currentCombatTargetId))) {
        return false;
      }
      decisionState.opportunityChoice = cloneJson(proposedChoice);
      decisionState.opportunitySwitchLock = cloneJson(plannerState.switchLock || null);
      decisionState.lastDecisionAction = cloneJson(plannerState.lastDecisionAction || decision?.action || null);
      return true;
    },
    patchState(patch = {}) {
      for (const [key, value] of Object.entries(patch || {})) {
        if (key === 'currentOpportunity' || key === 'switchLock') continue;
        if (key === 'finalActionPreemption' && value && typeof value === 'object') {
          const incomingGeneration = Math.max(0, Number(value.generation || 0) || 0);
          const consumedGeneration = Math.max(
            0,
            Number(decisionState.finalActionPreemptionConsumedGeneration || 0) || 0
          );
          if (incomingGeneration > consumedGeneration) {
            decisionState.finalActionPreemption = cloneJson(value);
            decisionState.finalActionPreemptionConsumedGeneration = incomingGeneration;
            if (decisionState.finalActionArbitration && typeof decisionState.finalActionArbitration === 'object') {
              decisionState.finalActionArbitration.profitDropout = null;
              decisionState.finalActionArbitration.lastPreemption = cloneJson(value);
            }
          }
        } else if (key === 'combatTarget' && value && decisionState.combatTarget
          && String(value.id ?? '') === String(decisionState.combatTarget.id ?? '')) {
          decisionState.combatTarget = { ...decisionState.combatTarget, ...cloneJson(value) };
        } else if ((key === 'combatEngagements'
          || key === 'combatMetricsByTarget'
          || key === 'nonThreatCombatEconomicsByTarget') && value && typeof value === 'object') {
          const current = decisionState[key] || {};
          const incoming = cloneJson(value);
          decisionState[key] = { ...current };
          for (const [entryKey, entryValue] of Object.entries(incoming)) {
            decisionState[key][entryKey] = entryValue && typeof entryValue === 'object' && current[entryKey]
              ? { ...current[entryKey], ...entryValue }
              : entryValue;
          }
        } else {
          decisionState[key] = cloneJson(value);
        }
      }
      return true;
    },
    getState() {
      return cloneJson(decisionState);
    },
    getCombatPersistenceState() {
      return {
        combatMetrics: decisionState.combatMetrics || null,
        combatTarget: decisionState.combatTarget || null,
        combatEngagements: decisionState.combatEngagements || {},
        combatMetricsByTarget: decisionState.combatMetricsByTarget || {},
        combatLearning: decisionState.combatLearning || null
      };
    },
    getRealtimePersistenceState() {
      return {
        finalActionPreemption: decisionState.finalActionPreemption || null,
        attackHistory: decisionState.attackHistory || [],
        postKillSettlement: decisionState.postKillSettlement || null,
        combatTarget: decisionState.combatTarget || null,
        combatEngagements: decisionState.combatEngagements || {},
        combatMetricsByTarget: decisionState.combatMetricsByTarget || {},
        combatTargetSwitchGate: decisionState.combatTargetSwitchGate || null,
        combatTargetSwitchHistory: decisionState.combatTargetSwitchHistory || null,
        combatAim: decisionState.combatAim || null,
        combatMetrics: decisionState.combatMetrics || null,
        opponentBehaviorStates: decisionState.opponentBehaviorStates || {},
        combatLearning: decisionState.combatLearning || null,
        combatHitAttributionHistory: decisionState.combatHitAttributionHistory || [],
        combatHitAttributionSummary: decisionState.combatHitAttributionSummary || null,
        seenEntities: decisionState.seenEntities || {},
        browserlessLastSelf: decisionState.browserlessLastSelf || null,
        browserlessInjury: decisionState.browserlessInjury || null,
        browserlessLeaveRisk: decisionState.browserlessLeaveRisk || null,
        browserlessPursuit: decisionState.browserlessPursuit || null,
        profitPursuitSuppressions: decisionState.profitPursuitSuppressions || {},
        nonThreatCombatEconomicsByTarget: decisionState.nonThreatCombatEconomicsByTarget || {},
        dangerousCombatTargets: decisionState.dangerousCombatTargets || {},
        recentInvulnerableThreats: decisionState.recentInvulnerableThreats || {},
        easyKillApproach: decisionState.easyKillApproach || null,
        easyKillTargetSuppressions: decisionState.easyKillTargetSuppressions || {},
        fleeLock: decisionState.fleeLock || null,
        returnBlockLock: decisionState.returnBlockLock || null,
        returnBlockScan: decisionState.returnBlockScan || null
      };
    },
    noteRealtimeFinalActionPreemption(action = {}, atMs = Date.now()) {
      const band = String(action.band || '');
      if (!['exit', 'safety', 'combat', 'recover'].includes(band)) return false;
      const previousGeneration = Math.max(
        0,
        Number(decisionState.finalActionPreemption?.generation || 0) || 0
      );
      decisionState.finalActionPreemption = {
        generation: Math.min(Number.MAX_SAFE_INTEGER, previousGeneration + 1),
        at: Number.isFinite(Number(atMs)) ? Number(atMs) : Date.now(),
        source: 'realtime-control',
        band,
        reason: String(action.reason || '')
      };
      return true;
    },
    getStatusSummary() {
      return summarizeBrowserlessDecisionState(decisionState);
    },
    observeActionResult(actionResult, decision, eventOptions = {}) {
      return recordAttackHistoryFromActionResult(decisionState, actionResult, decision, {
        ...options,
        ...eventOptions,
        nowMs: eventOptions.nowMs ?? eventOptions.atMs ?? options.now?.() ?? Date.now()
      });
    },
    finalizeEasyKillEngagements(reason = 'canary-ended', eventOptions = {}) {
      return callEasyKillPlayerTracker({
        ...options,
        ...eventOptions
      }, 'finishActiveEngagements', reason, {
        atMs: eventOptions.nowMs ?? eventOptions.atMs ?? options.now?.() ?? Date.now()
      });
    }
  };
}

module.exports = {
  BROWSER_RUNTIME_DEFAULTS,
  activeTargetCompletionEstimate,
  activeTargetExpectedReward,
  attributeBrowserlessHpDropToBullet,
  effectiveProfitReward,
  establishedCombatLootPriority,
  buildBrowserlessDecision,
  buildBrowserlessCombatStrategyInput,
  buildBrowserlessRealtimeControlDecision,
  buildBrowserlessRuntimeDefaults,
  buildBrowserlessStrategyInput,
  currentProfitThresholdEligibility,
  buildLowHpRecoveryThreatExitDecision,
  createBrowserlessDecisionAdapter,
  normalizedProfitOpportunityKey,
  decisionStatePatch,
  distanceBetween,
  easyKillEngagementFinishReason,
  evaluateProactiveCombatMarginalRoi,
  lowHpRecoveryThreatRadiusForHp,
  opportunityEnemyStaminaCost,
  normalizeCoinForDecision,
  normalizeEntityForDecision,
  observeBrowserlessCoinPickups,
  recentCombatResidualThreatContinuityCore,
  recordAttackHistoryFromActionResult,
  singleCoinBaitReturnPlan,
  summarizeBrowserlessDecision,
  snapshotSelfKillEvidence,
  realtimeNearbyObservationSummary,
  summarizeNearbyForPanel,
  summarizeBrowserlessDecisionState
};
