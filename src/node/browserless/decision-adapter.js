'use strict';

const { attackWorthTakingCore } = require('../../strategy/attack-worth');
const { isInvulnerableEntity } = require('../../strategy/combat-target-selection');
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
  buildFinalActionCandidate,
  selectFinalActionCandidateCore
} = require('../../strategy/final-candidate-selection');
const {
  buildReturnBlockActionCore,
  lockedFleeDirectionCore
} = require('../../strategy/active-threat-avoidance');
const { evaluateCombatHpExitCore } = require('../../strategy/combat-exit');
const {
  pickPostAttackDropCoinCore,
  pickPostAttackDropWaitTargetCore
} = require('../../strategy/post-attack-drop');
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
  coinRouteActionMetaCore,
  coinRouteKey,
  pickCoinRouteOpportunityCore
} = require('../../strategy/coin-route');
const { applyFinalActionArbitrationCore } = require('../../strategy/action-arbitration');
const { recordActionSwitchDiagnosticsCore } = require('../../strategy/action-switch-diagnostics');
const {
  buildDynamicProfitThresholdCore,
  filterProfitCandidatesCore,
  profitTargetEligibleCore
} = require('../../strategy/profit-threshold');
const {
  singleCoinBaitPolicyCore
} = require('../../strategy/single-coin-bait');
const { targetIsWhitelisted, targetWhitelistNameSet } = require('../../shared/target-whitelist');
const {
  createBrowserlessDecisionState,
  summarizeBrowserlessDecisionState
} = require('./decision-state');

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
const DEFAULT_SNAPSHOT_VISIBLE_COIN_MAX_DISTANCE = BROWSER_RUNTIME_DEFAULTS.globalCoinMaxDistance;
const DEFAULT_OPPORTUNITY_VISIBLE_DISTANCE = BROWSER_RUNTIME_DEFAULTS.opportunityVisibleDistance;
const DEFAULT_OPPORTUNITY_NEARBY_PRIORITY_DISTANCE = BROWSER_RUNTIME_DEFAULTS.opportunityNearbyPriorityDistance;
const DEFAULT_GLOBAL_COIN_MAX_DISTANCE = BROWSER_RUNTIME_DEFAULTS.globalCoinMaxDistance;
const DEFAULT_RECOVERY_COIN_MAX_DISTANCE = BROWSER_RUNTIME_DEFAULTS.recoveryCoinMaxDistance;
const DEFAULT_RECOVERY_PLAYER_DROP_MIN_AMOUNT = 2;
const DEFAULT_POST_ATTACK_RECOVERY_DROP_MAX_DISTANCE = BROWSER_RUNTIME_DEFAULTS.postAttackRecoveryDropMaxDistance;
const DEFAULT_STAMINA_BUDGET_RELOGIN_DELAY_MS = BROWSER_RUNTIME_DEFAULTS.staminaBudgetReloginDelayMs;
const DEFAULT_AFK_ATTACK_COMMIT_RANGE_CM = 5000;
const DEFAULT_AFK_DISPLAY_INACTIVE_MS = 60000;
const DEFAULT_INVULNERABLE_PROFIT_APPROACH_DISTANCE_CM = 5000;
const DEFAULT_INVULNERABLE_PROFIT_MOVE_SPEED_CM_PER_SEC = 1000;
const DEFAULT_DANGEROUS_TARGET_COOLDOWN_MS = BROWSER_RUNTIME_DEFAULTS.browserlessDangerousTargetCooldownMs ?? 900000;
const DEFAULT_PROFIT_PURSUIT_MIN_DAMAGE_MS = BROWSER_RUNTIME_DEFAULTS.browserlessProfitPursuitMinDamageMs ?? 60000;
const DEFAULT_PROFIT_PURSUIT_MIN_DAMAGE_HP = BROWSER_RUNTIME_DEFAULTS.browserlessProfitPursuitMinDamageHp ?? 10;
const DAY_MS = 24 * 60 * 60 * 1000;
const UTC8_OFFSET_MS = 8 * 60 * 60 * 1000;
const DANGEROUS_COMBAT_EXIT_REASONS = new Set([
  'combat-critical-hp-leave',
  'combat-hp-disadvantage-leave',
  'combat-low-hp-disadvantage-leave'
]);

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

function centerActivityInputSummary(self, filtered = {}, options = {}) {
  const radiusCm = browserlessCenterActivityRadius(options);
  if (!(radiusCm > 0)) return null;
  const selfRadius = pointRadiusFromOrigin(self);
  return {
    radiusCm: Math.round(radiusCm),
    selfRadiusCm: Number.isFinite(selfRadius) ? Math.round(selfRadius) : null,
    selfOutsideCm: Number.isFinite(selfRadius) ? Math.max(0, Math.round(selfRadius - radiusCm)) : null,
    filteredAfkTargets: Math.max(0, Math.round(Number(filtered.afkTargets || 0))),
    filteredRealtimeCoins: Math.max(0, Math.round(Number(filtered.realtimeCoins || 0))),
    filteredSnapshotCoins: Math.max(0, Math.round(Number(filtered.snapshotCoins || 0)))
  };
}

const STAMINA_REMAINING_FIELDS = {
  '5s': [
    'stamina_5s_remaining_milli',
    'stamina_5s_remaining_ms',
    'stamina5sRemainingMilli',
    'stamina5sRemainingMs',
    'stamina5s',
    'stamina_5s',
    'stamina_remaining_ms',
    'staminaRemainingMs',
    'stamina'
  ],
  '1h': [
    'stamina_1h_remaining_milli',
    'stamina_1h_remaining_ms',
    'stamina1hRemainingMilli',
    'stamina1hRemainingMs',
    'stamina1h',
    'stamina_1h'
  ],
  '1d': [
    'stamina_1d_remaining_milli',
    'stamina_1d_remaining_ms',
    'stamina1dRemainingMilli',
    'stamina1dRemainingMs',
    'stamina1d',
    'stamina_1d'
  ]
};

const STAMINA_LIMIT_FIELDS = {
  '5s': [
    'stamina_5s_limit_milli',
    'stamina_5s_limit_ms',
    'stamina5sLimitMilli',
    'stamina5sLimitMs',
    'stamina5sLimit',
    'stamina_5s_limit',
    'stamina_limit_ms',
    'staminaLimitMs',
    'staminaLimit'
  ],
  '1h': [
    'stamina_1h_limit_milli',
    'stamina_1h_limit_ms',
    'stamina1hLimitMilli',
    'stamina1hLimitMs',
    'stamina1hLimit',
    'stamina_1h_limit'
  ],
  '1d': [
    'stamina_1d_limit_milli',
    'stamina_1d_limit_ms',
    'stamina1dLimitMilli',
    'stamina1dLimitMs',
    'stamina1dLimit',
    'stamina_1d_limit'
  ]
};

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

function staminaRemainingValue(entity, windowName) {
  return firstNumberFromFields(entity, STAMINA_REMAINING_FIELDS[windowName] || []);
}

function staminaLimitForWindow(entity, windowName) {
  return firstNumberFromFields(entity, STAMINA_LIMIT_FIELDS[windowName] || []);
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

function hasFull5sStamina(entity, options = {}) {
  const remaining = staminaRemainingValue(entity, '5s');
  const limit = staminaLimitForWindow(entity, '5s') ?? 10000;
  const ratio = Math.max(0, Number(options.staminaFullRatio ?? BROWSER_RUNTIME_DEFAULTS.staminaFullRatio ?? 0.98) || 0.98);
  return remaining !== null && Number.isFinite(limit) && limit > 0 && remaining >= limit * ratio;
}

function targetWhitelistFromOptions(options = {}) {
  if (options.targetWhitelistNameSet instanceof Set) return options.targetWhitelistNameSet;
  if (options.targetWhitelist && typeof options.targetWhitelist === 'object') return options.targetWhitelist;
  if (Array.isArray(options.targetWhitelistNames)) {
    return targetWhitelistNameSet(options.targetWhitelistNames, options.targetWhitelistMaxNames ?? BROWSER_RUNTIME_DEFAULTS.targetWhitelistMaxNames);
  }
  return null;
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

function entityDropValue(entity) {
  return Number(entity?.drop ?? entity?.Drop ?? entity?.reward ?? entity?.coin_reward ?? entity?.death_reward_preview ?? entity?.death_drop_coins ?? 0) || 0;
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

function isBrowserlessAvoidanceThreat(target) {
  if (!target || target.alive === false) return false;
  return Boolean(target.active && target.invulnerable);
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
  const normalized = {
    ...cloneJson(entity),
    user_id: numberOrNull(entity.user_id),
    entity_id: numberOrNull(entity.entity_id),
    name: entityDisplayName(entity),
    x,
    y,
    hp: numberOrNull(entity.hp),
    max_hp: numberOrNull(entity.max_hp),
    drop: entityDropValue(entity),
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
  const output = cloneJson(realtimeSelf);
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
  const reward = entityDropValue(snapshotEntity);
  if (!(reward > 0)) {
    return output;
  }
  const currentDrop = entityDropValue(entity);
  return {
    ...output,
    death_reward_preview: snapshotEntity.death_reward_preview,
    death_drop_coins: snapshotEntity.death_drop_coins,
    coins: snapshotEntity.coins,
    reward: currentDrop > 0 ? entity.reward : reward,
    coin_reward: currentDrop > 0 ? entity.coin_reward : reward,
    drop: currentDrop > 0 ? entity.drop : reward,
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
    ...cloneJson(drop),
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
    hp: numberOrNull(target.hp),
    maxHp: numberOrNull(target.max_hp ?? target.maxHp),
    drop: entityDropValue(target),
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
    profitMetadataAuthority: target.profitMetadataAuthority || '',
    profitMetadataMode: target.profitMetadataMode || '',
    profitMetadataActive: Boolean(target.profitMetadataActive)
  };
}

function summarizeCoin(coin) {
  if (!coin) return null;
  const routeMeta = coinRouteActionMetaCore(coin.coinRoute || null, coin.distance);
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
    snapshotOnly: Boolean(coin.snapshotOnly)
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
    profitThresholdEligible: item.profitThresholdEligible === undefined ? null : Boolean(item.profitThresholdEligible),
    profitThresholdReason: item.profitThresholdReason || '',
    target: item.sourceTarget ? summarizeTarget(item.sourceTarget) : null,
    coin: item.sourceCoin ? summarizeCoin(item.sourceCoin) : null,
    held: Boolean(item.held)
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
  if (String(item?.type || '') === 'enemy') return entityDropValue(item?.sourceTarget || item);
  const sourceCoin = item?.sourceCoin || item || {};
  if (sourceCoin.fieldMigration || String(item?.reason || '') === 'migrate-to-known-field') {
    return Number(item?.amount ?? sourceCoin.amount);
  }
  return Number(item?.routeValue ?? sourceCoin.routeValue ?? sourceCoin.coinRoute?.value
    ?? item?.fieldAmount ?? sourceCoin.fieldAmount ?? item?.amount ?? sourceCoin.amount);
}

function buildProfitSelectionInput(input, thresholdContext, options = {}) {
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
    ))
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
  for (const coin of input?.profitCoins || []) {
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
  return points.slice(1).map(point => {
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

function coinPanelCandidates(input, action) {
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

function shouldShowNearbyPanelPlayer(target, action, combat) {
  if (!target) return false;
  if (targetPlayerSelected(action, combat, target)) return true;
  if (entityDisplayName(target)) return true;
  if (numberOrNull(entityDropValue(target)) > 0) return true;
  if (staminaRemainingValue(target, '5s') !== null) return true;
  if (target.active || target.moving || target.firing || target.invulnerable) return true;
  if (invulnerableRemainingMs(target) !== null) return true;
  return false;
}

function panelPlayerCandidates(input) {
  const activeIds = new Set((input.activeThreats || [])
    .concat(input.firingThreats || [], input.avoidanceThreats || [], input.snapshotActiveThreats || [])
    .map(panelPlayerTargetKey)
    .filter(Boolean));
  const afkIds = new Set((input.afkTargets || [])
    .concat(input.afkPanelTargets || [])
    .map(panelPlayerTargetKey)
    .filter(Boolean));
  return (input.visibleTargets || [])
    .filter(target => activeIds.has(panelPlayerTargetKey(target))
      || afkIds.has(panelPlayerTargetKey(target))
      || targetPlayerSelected(input.currentAction, input.currentCombat, target));
}

function summarizeNearbyForPanel(input, action, combat, options = {}) {
  if (!input?.self) return null;
  const panelInput = { ...input, currentAction: action, currentCombat: combat };
  const attackRange = Math.max(0, Number(options.attackRange ?? options.combatAttackRange ?? DEFAULT_ATTACK_RANGE));
  const visibleRange = Math.max(0, Number(
    input.fallback?.snapshotVisibleCoinMaxDistanceCm
      ?? options.globalCoinMaxDistance
      ?? options.opportunityVisibleDistance
      ?? DEFAULT_GLOBAL_COIN_MAX_DISTANCE
  ));
  const coins = coinPanelCandidates(input, action)
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
      String(coin.authority || '') || null
    ]);
  const selectableAfkTargetIds = new Set((input.afkTargets || [])
    .filter(target => !afkOpportunityBlockedByStaminaCooldown(target, options))
    .map(panelPlayerTargetKey)
    .filter(Boolean));
  const afkTargetIds = new Set((input.afkPanelTargets || input.afkTargets || [])
    .map(panelPlayerTargetKey)
    .filter(Boolean));
  const lowDropThreshold = Math.max(0, Number(options.attackMinAfkDrop ?? DEFAULT_ATTACK_MIN_AFK_DROP));
  const players = panelPlayerCandidates(panelInput)
    .filter(target => Number.isFinite(Number(target?.distance)))
    .filter(target => visibleRange <= 0 || Number(target.distance) <= visibleRange)
    .sort((a, b) => Number(a.distance) - Number(b.distance))
    .map(target => {
      const drop = numberOrNull(entityDropValue(target));
      const fullStamina5s = hasFull5sStamina(target, options);
      const afkSelectable = selectableAfkTargetIds.has(panelPlayerTargetKey(target));
      const afk = afkTargetIds.has(panelPlayerTargetKey(target));
      const lowValueFullStamina = Boolean(fullStamina5s && drop !== null && drop < lowDropThreshold);
      return [
        entityDisplayName(target) || '未知玩家',
        numberOrNull(target.hp),
        staminaRemainingValue(target, '5s'),
        drop,
        invulnerableRemainingMs(target, options),
        Math.round(Number(target.distance)),
        targetPlayerSelected(action, combat, target) ? 1 : 0,
        String(target.current_join_mode || target.mode || target.joined || target.profitMetadataMode || '') || null,
        fullStamina5s ? 1 : 0,
        afkSelectable ? 1 : 0,
        afk ? 1 : 0,
        afk && afkDisplayGreen(target, options) ? 1 : 0,
        lowValueFullStamina ? 1 : 0
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

function buildBrowserlessStrategyInput(state, options = {}, stateful = {}) {
  const realtime = state?.realtime || {};
  const fallback = state?.fallback || state?.snapshot || {};
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
  annotateBrowserlessRecentActivity(realtimeEntities, stateful, options.nowMs, options);
  const decisionEntities = realtimeEntities.map(entity => refreshDecisionEntityActivity(entity, options));
  const visibleTargets = decisionEntities
    .filter(entity => Number(entity.user_id) !== selfUserId)
    .filter(entity => Number.isFinite(Number(entity.x)) && Number.isFinite(Number(entity.y)));
  updateBrowserlessOpportunityAfkStaminaObservations(visibleTargets, stateful, options.nowMs, options);
  const activeThreats = visibleTargets.filter(entity => entity.active && entity.alive !== false);
  const firingThreats = visibleTargets.filter(entity => entity.firing && entity.alive !== false);
  const avoidanceThreats = visibleTargets.filter(isBrowserlessAvoidanceThreat);
  const snapshotActiveThreats = [];
  const snapshotFallbackThreats = [
    ...avoidanceThreats,
    ...firingThreats.filter(threat => !avoidanceThreats.includes(threat))
  ].filter(threat => snapshotFallbackThreatBlocks(threat, self, options));
  const afkObservationTargetsRaw = visibleTargets.filter(entity => {
    if (entity.whitelisted || entity.active || entity.moving || entity.firing || entity.alive === false) return false;
    if (entity.invulnerable && !invulnerableProfitTargetReadyOnApproach(entity, options)) return false;
    return attackWorthTakingCore(self, entity, {
      attackMinDrop: options.attackMinDrop ?? DEFAULT_ATTACK_MIN_DROP,
      attackMinAfkDrop: options.attackMinAfkDrop ?? DEFAULT_ATTACK_MIN_AFK_DROP,
      attackMinRewardRatio: options.attackMinRewardRatio ?? DEFAULT_ATTACK_MIN_REWARD_RATIO,
      isWhitelistedTarget: target => isWhitelistedTargetForOptions(target, options),
      isAfkProfitTarget: () => true,
      dropValue: entityDropValue
    });
  });
  const afkObservationTargets = filterCenterActivityProfitItems(afkObservationTargetsRaw, options);
  const afkPanelTargets = afkObservationTargets.filter(entity => hasFull5sStamina(entity, options));
  const afkTargets = afkPanelTargets.filter(entity => !afkTargetBlockedByRecentActivity(entity, options));
  const realtimeCoinsRaw = buildNativeCoinSnapshotCore(Array.isArray(realtime.coinDrops) ? realtime.coinDrops : [], { nowMs: options.nowMs })
    .map(drop => normalizeCoinForDecision(drop, self, 'realtime'))
    .filter(Boolean)
    .filter(coin => Number(coin.amount || 0) > 0);
  const realtimeCoins = filterCenterActivityProfitItems(realtimeCoinsRaw, options);
  const snapshotCoinsRaw = (Array.isArray(fallback.coinDrops) ? fallback.coinDrops : [])
    .map(drop => normalizeCoinForDecision(drop, self, 'snapshot'))
    .filter(Boolean)
    .filter(coin => Number(coin.amount || 0) > 0);
  const snapshotCoins = filterCenterActivityProfitItems(snapshotCoinsRaw, options);
  const centerFiltered = {
    afkTargets: Math.max(0, afkObservationTargetsRaw.length - afkObservationTargets.length),
    realtimeCoins: Math.max(0, realtimeCoinsRaw.length - realtimeCoins.length),
    snapshotCoins: Math.max(0, snapshotCoinsRaw.length - snapshotCoins.length)
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
  const selfKillTargetTicks = selfKillTargetTicksFromMessages(Array.isArray(fallback.messages) ? fallback.messages : [], selfUserId);
  const selfKillTargetIds = Array.from(selfKillTargetTicks.keys());
  const selfKillEvidence = summarizeSelfKillEvidence(selfKillTargetTicks);
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
  const profitCoins = realtimeCoins.length
    ? realtimeCoins
    : (selfKilledPlayerDropCoins.length
        ? mergeProfitCoinCandidates(selfKilledPlayerDropProfitCoins, snapshotFallbackProfitCoins)
        : snapshotFallbackProfitCoins);
  const profitCoinSource = realtimeCoins.length
    ? 'realtime'
    : (selfKilledPlayerDropCoins.length ? 'snapshot-player-drop' : (snapshotFallbackAllowed ? 'snapshot-fallback' : 'none'));
  return {
    userId: Number(state?.userId || options.userId || 0),
    nowMs: Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now(),
    rawRealtime: realtime,
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
    realtimeCoins,
    snapshotCoins,
    snapshotVisibleCoins,
    selfKilledPlayerDropCoins,
    selfKillTargetIds,
    selfKillEvidence,
    profitCoins,
    profitCoinSource,
    bullets: Array.isArray(realtime.bullets) ? cloneJson(realtime.bullets) : [],
    dataGaps
  };
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
  return opportunityValueScoreCore(entityDropValue(target), opportunityEnemyStaminaCost(target, options), {
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
  return (input?.bullets || []).some(bullet => {
    const ownerId = bulletOwnerId(bullet);
    if (ownerId === null || ownerId === undefined || ownerId === '') return true;
    if (selfId === null || selfId === undefined || selfId === '') return true;
    return String(ownerId) !== String(selfId);
  });
}

function highValueThreatBlocksLowHpCoin(threat, options = {}) {
  if (!threat || threat.alive === false || threat.invulnerable) return false;
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
  const realtimeCandidates = (input.realtimeCoins || []).filter(coin => !coin.snapshotOnly);
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
  const maxDistance = Math.max(0, Number(options.globalCoinMaxDistance
    ?? options.opportunityVisibleDistance
    ?? options.coinMaxDistance
    ?? DEFAULT_GLOBAL_COIN_MAX_DISTANCE));
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
    target: summarizeCoin(coin),
    highValueCoinPriority: {
      amount: Math.max(0, Math.round(Number(coin.amount || 0))),
      minAmount: highValueCoinPriorityAmount(options),
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
  const metrics = options.recentCombatMetrics?.targetId !== undefined
    && String(options.recentCombatMetrics.targetId) === String(target?.user_id ?? target?.userId ?? '')
    ? options.recentCombatMetrics
    : null;
  const observedShots = Number(metrics?.actualShots || 0);
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
  return (moveCost + shotCost) * riskScale;
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
  const values = ['1h', '1d']
    .map(key => opportunityWindowStaminaBudget(self, key, options))
    .filter(value => Number.isFinite(value));
  if (!values.length) return Infinity;
  return Math.min(...values);
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

function buildSingleCoinBaitDecision(input, opportunity, stateful = {}, options = {}, allowEnter = true) {
  const previous = stateful.singleCoinBait || null;
  const policy = singleCoinBaitPolicyCore({
    self: input?.self || null,
    nowMs: input?.nowMs,
    previous,
    selectedOpportunity: opportunity?.choice || null,
    opportunities: opportunity?.opportunities || [],
    realtimeCoins: input?.realtimeCoins || [],
    allowEnter
  }, singleCoinBaitCoreOptions(options));

  if (previous && !policy.state) {
    clearSingleCoinBaitTracking(stateful, previous, { clearFinalAction: true });
  }
  stateful.singleCoinBait = policy.state ? cloneJson(policy.state) : null;
  if (!policy.state || !policy.coin) {
    return { ...policy, action: null, summary: null };
  }

  if (policy.phase === 'hold') {
    clearSingleCoinBaitTracking(stateful, policy.state);
  } else if (policy.phase === 'release' && policy.transitioned) {
    clearSingleCoinBaitTracking(stateful, policy.state);
  }

  const summary = singleCoinBaitActionSummary(policy.state, input, options);
  const target = summarizeCoin(policy.coin);
  if (policy.phase === 'hold') {
    return {
      ...policy,
      summary,
      action: {
        kind: 'wait',
        band: 'wait',
        reason: 'single-coin-bait-hold',
        target,
        singleCoinBait: summary
      }
    };
  }

  const coinMaxDistance = Math.max(0, Number(options.coinMaxDistance || BROWSER_RUNTIME_DEFAULTS.coinMaxDistance));
  const actionKind = Number(policy.coin.distance || Infinity) <= coinMaxDistance ? 'coin' : 'seek-coin';
  return {
    ...policy,
    summary,
    action: {
      kind: actionKind,
      band: 'profit',
      reason: policy.phase === 'release' ? 'single-coin-bait-release' : 'single-coin-bait-return',
      target,
      reward: 1,
      staminaCost: opportunityCoinStaminaCost(policy.coin, options),
      singleCoinBait: summary
    }
  };
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

function clearIneligibleFinalProfitHold(stateful = {}, thresholdContext, options = {}) {
  if (!thresholdContext?.active) return;
  const arbitration = ensureFinalActionArbitrationState(stateful);
  const previous = annotateProfitActionThreshold(arbitration.lastAction, thresholdContext, options);
  if (previous?.band === 'profit' && previous.profitThresholdEligible !== true) {
    arbitration.lastAction = null;
    arbitration.lastFocus = null;
    arbitration.lastSelectedAt = 0;
  } else if (previous) {
    arbitration.lastAction = previous;
  }
}

function targetSwitchDiagnosticsHistoryLimit(options = {}) {
  return Math.max(4, Math.round(Number(options.targetSwitchDiagnosticsHistoryLimit ?? BROWSER_RUNTIME_DEFAULTS.targetSwitchDiagnosticsHistoryLimit ?? 24) || 24));
}

function targetSwitchOscillationWindowMs(options = {}) {
  return Math.max(1000, Math.round(Number(options.targetSwitchOscillationWindowMs ?? BROWSER_RUNTIME_DEFAULTS.targetSwitchOscillationWindowMs ?? 10000) || 10000));
}

function applyBrowserlessFinalActionArbitration(action, stateful = {}, input = {}, options = {}) {
  return applyFinalActionArbitrationCore(action, ensureFinalActionArbitrationState(stateful), {
    nowMs: input?.nowMs,
    source: options.controlMode || 'browserless',
    holdMs: finalActionArbitrationHoldMs(options),
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
    isSnapshotOnlyCoin: item => Boolean(item?.snapshotOnly),
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
    return amount >= highValueAmount ? Math.max(base, 2) : base;
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

function nearestRealtimeCoinWithin(self, coins, activeThreats, maxDistance, options = {}) {
  if (!(Number(maxDistance) > 0)) return null;
  return (coins || [])
    .filter(coin => !coin.snapshotOnly)
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
  const nearby = nearestRealtimeCoinWithin(self, coins, activeThreats, blockDistance, options);
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
    const totalAmount = members.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const staminaCost = opportunityCoinStaminaCost(coin, options);
    const score = opportunityValueScoreCore(totalAmount, staminaCost, {
      weight: options.coinOpportunityValue ?? BROWSER_RUNTIME_DEFAULTS.coinOpportunityValue,
      distanceFloor: options.opportunityDistanceFloor ?? BROWSER_RUNTIME_DEFAULTS.opportunityDistanceFloor,
      distanceScoreScale: options.opportunityDistanceScoreScale ?? BROWSER_RUNTIME_DEFAULTS.opportunityDistanceScoreScale
    });
    if (!best || score > Number(best.score || -Infinity)) {
      best = {
        ...coin,
        score,
        fieldScore: score,
        opportunityScore: score,
        opportunityStaminaCost: staminaCost,
        fieldMigration: true,
        fieldMembers: members.length,
        fieldAmount: totalAmount,
        members: members.length,
        totalAmount
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
      isAfkProfitTarget: item => input.afkTargets.includes(item)
    }),
    enemyStaminaCost: target => enemyStaminaCost(target, options),
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
    nowMs: input.nowMs
  };
  const afkOpportunityTargets = includeAfkProfitTargets
    ? input.afkTargets
      .filter(target => !targetDangerousCooldownRecord(stateful, target, input.nowMs))
      .filter(target => !afkOpportunityBlockedByStaminaCooldown(target, opportunityOptions))
      .filter(target => targetSafeFromOpportunityThreats(target, opportunityThreats, options))
    : [];
  let rawOpportunities = prioritizeBrowserlessOpportunities(buildOpportunityCandidatesCore(
    input.self,
    opportunityThreats,
    coinGroups,
    afkOpportunityTargets,
    routeCoin,
    opportunityOptions
  ), options);
  const filtered = filterProfitCandidatesCore(rawOpportunities, thresholdContext, {
    reward: profitOpportunityThresholdReward,
    staminaCost: item => item.staminaCost,
    summaryLimit: 12
  });
  rawOpportunities = filtered.annotated;
  let opportunities = filtered.candidates.map(item => ({
    ...item,
    profitThresholdActive: Boolean(thresholdContext.active),
    profitThresholdRewardCoins: thresholdContext.threshold?.rewardCoins ?? null,
    profitThresholdStaminaMilli: thresholdContext.threshold?.staminaMilli ?? null
  }));
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
      filtered: filtered.filtered
    }
  };
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

function entityMatchesAttack(entity, attack) {
  if (!entity || !attack) return false;
  const entityId = entity.user_id ?? entity.userId ?? entity.entity_id ?? entity.entityId;
  return entityId !== null
    && entityId !== undefined
    && attack.id !== null
    && attack.id !== undefined
    && String(entityId) === String(attack.id);
}

function browserlessPostAttackDropResolvedAt(attack, input, nowMs) {
  if (!attack) return 0;
  const selfKillIds = new Set((input?.selfKillTargetIds || []).map(String));
  if (selfKillIds.has(String(attack.id))) {
    if (!attack.postAttackDropResolvedAt) attack.postAttackDropResolvedAt = nowMs;
    return attack.postAttackDropResolvedAt;
  }
  const visible = (input?.visibleTargets || []).find(entity => entityMatchesAttack(entity, attack));
  if (visible && visible.alive !== false && Number(visible.hp ?? 1) > 0) {
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

function safePostAttackCoinCandidates(input, maxDistance, options = {}) {
  if (!input?.self) return [];
  const threats = postAttackThreats(input);
  return (input.profitCoins || [])
    .filter(coin => Number(coin?.amount || 0) > 0)
    .filter(coin => Number(coin?.distance || Infinity) <= Number(maxDistance || Infinity))
    .filter(coin => coinSafeFromThreats(coin, threats, options))
    .filter(coin => opportunityStaminaAffordable(input.self, opportunityCoinStaminaCost(coin, options), options));
}

function buildPostAttackDropCoinDecision(input, stateful = {}, options = {}) {
  if (!input?.self || !Array.isArray(stateful.attackHistory) || !stateful.attackHistory.length) return null;
  const recovery = isRecoveringSelf(input.self);
  const maxDistance = recovery
    ? Math.max(0, Number(options.postAttackRecoveryDropMaxDistance ?? DEFAULT_POST_ATTACK_RECOVERY_DROP_MAX_DISTANCE))
    : Math.max(0, Number(options.postAttackDropCoinMaxDistance ?? BROWSER_RUNTIME_DEFAULTS.postAttackDropCoinMaxDistance));
  const result = pickPostAttackDropCoinCore(stateful.attackHistory, safePostAttackCoinCandidates(input, maxDistance, options), {
    nowMs: input.nowMs,
    priorityMs: Math.max(0, Number(options.postAttackDropCoinPriorityMs ?? BROWSER_RUNTIME_DEFAULTS.postAttackDropCoinPriorityMs)),
    includeSingle: !recovery,
    minAmount: Math.max(0, Number(options.postAttackDropCoinMinAmount ?? 1)),
    maxDistance,
    minScore: recovery ? Math.max(0, Number(options.postAttackRecoveryDropMinScore ?? 0)) : 0,
    dropCoinRadius: Math.max(0, Number(options.postAttackDropCoinRadius ?? BROWSER_RUNTIME_DEFAULTS.postAttackDropCoinRadius)),
    dist: distanceBetween,
    resolveAttack: attack => browserlessPostAttackDropResolvedAt(attack, input, input.nowMs),
    scoreCoin: coin => scoreCoinOpportunity(coin, options)
  });
  const coin = result.selected || null;
  if (!coin) return null;
  return buildPriorityCoinDecision(input, coin, 'post-attack-drop-coin', options, {
    postAttackTarget: coin.postAttackTarget || null
  });
}

function buildPostAttackDropWaitDecision(input, stateful = {}, options = {}) {
  if (!input?.self || !Array.isArray(stateful.attackHistory) || !stateful.attackHistory.length) return null;
  const waitMs = Math.max(0, Number(options.postAttackDropWaitMs ?? BROWSER_RUNTIME_DEFAULTS.postAttackDropWaitMs));
  const target = pickPostAttackDropWaitTargetCore(stateful.attackHistory, input.profitCoins || [], postAttackThreats(input), {
    nowMs: input.nowMs,
    self: input.self,
    dist: distanceBetween,
    waitMs,
    minDrop: Math.max(0, Number(options.postAttackDropWaitMinDrop ?? options.attackMinDrop ?? DEFAULT_ATTACK_MIN_DROP) || 0),
    resolveMaxMs: Math.max(waitMs, Number(options.postAttackDropResolveMaxMs ?? BROWSER_RUNTIME_DEFAULTS.postAttackDropResolveMaxMs ?? waitMs) || waitMs),
    maxDistance: Math.max(0, Number(options.postAttackDropWaitMaxDistance ?? options.opportunityVisibleDistance ?? options.globalCoinMaxDistance ?? DEFAULT_GLOBAL_COIN_MAX_DISTANCE)),
    stopDistance: Math.max(0, Number(options.postAttackDropWaitStopDistance ?? BROWSER_RUNTIME_DEFAULTS.postAttackDropWaitStopDistance ?? BROWSER_RUNTIME_DEFAULTS.coinPickupSweepDistance ?? 0)),
    dropCoinRadius: Math.max(0, Number(options.postAttackDropCoinRadius ?? BROWSER_RUNTIME_DEFAULTS.postAttackDropCoinRadius)),
    resolveAttack: attack => browserlessPostAttackDropResolvedAt(attack, input, input.nowMs),
    coinBlockedByThreat: (_origin, item, threat) => !coinSafeFromThreats(item, [threat], options)
  });
  if (!target) return null;
  return {
    kind: 'post-attack-drop-wait',
    band: 'profit',
    reason: 'post-attack-drop-wait-position',
    target: {
      type: 'post-attack-target',
      id: target.id,
      name: target.name || '',
      x: numberOrNull(target.x),
      y: numberOrNull(target.y),
      drop: numberOrNull(target.drop),
      distance: Number.isFinite(Number(target.distance)) ? Math.round(Number(target.distance)) : null,
      postAttackTarget: {
        id: target.id,
        name: target.name || '',
        drop: numberOrNull(target.drop),
        ageMs: Math.max(0, Math.round(input.nowMs - Number(target.at || input.nowMs))),
        resolvedAgeMs: Math.max(0, Math.round(input.nowMs - Number(target.postAttackDropResolvedAt || input.nowMs)))
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

function opportunisticShotBeatsAction(action, shot, options = {}) {
  const shotScore = Number(shot?.opportunisticScore ?? -Infinity);
  if (!Number.isFinite(shotScore)) return false;
  const actionScore = actionOpportunityScoreForShot(action, options);
  const minRatio = Math.max(0, Number(options.opportunisticShotMinScoreRatio ?? BROWSER_RUNTIME_DEFAULTS.opportunisticShotMinScoreRatio ?? 1));
  return !Number.isFinite(actionScore) || actionScore <= 0 || shotScore >= actionScore * minRatio;
}

function attachOpportunisticShotDecision(action, input, stateful = {}, options = {}) {
  if (!action || isRecoveringSelf(input?.self)) return action;
  if (action.opportunisticShot || action.combat) return action;
  if (action.kind !== 'coin' && action.kind !== 'seek-coin') return action;
  const shot = pickOpportunisticShotTarget(input, stateful, options);
  if (!shot || !opportunisticShotBeatsAction(action, shot, options)) return action;
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

function pickBrowserlessInjuryPressure(input, options = {}) {
  const bulletPressure = incomingBulletPressure(input);
  const maxDistance = Math.max(
    Number(options.browserlessInjuryThreatRangeCm || 0),
    Number(options.profitLiveInjuryExitRange || 0),
    Number(options.activeAvoidMaxDistance || 0),
    Number(BROWSER_RUNTIME_DEFAULTS.activeAvoidMaxDistance || 0),
    DEFAULT_PROFIT_LIVE_INJURY_EXIT_RANGE
  );
  const candidates = (input?.visibleTargets || [])
    .filter(target => target?.alive !== false)
    .filter(target => {
      const key = targetKey(target);
      const distance = Number(target.distance);
      if (key && bulletPressure.ownerIds.has(key)) return true;
      if (!Number.isFinite(distance) || distance > maxDistance) return false;
      return Boolean(target.active || target.firing || target.recentlyActive);
    })
    .map(target => {
      const key = targetKey(target);
      const distance = Number(target.distance);
      const bulletOwner = key && bulletPressure.ownerIds.has(key);
      const unknownFiring = bulletPressure.unknownIncoming && target.firing;
      const score = (bulletOwner ? 1000000000 : 0)
        + (unknownFiring ? 700000000 : 0)
        + (target.firing ? 500000000 : 0)
        + (target.invulnerable ? 200000000 : 0)
        + (target.active ? 100000000 : 0)
        - (Number.isFinite(distance) ? distance : 0);
      return { target, score };
    })
    .sort((a, b) => b.score - a.score);
  return {
    target: candidates[0]?.target || null,
    ...bulletPressure
  };
}

function browserlessInjuryRecentMs(options = {}) {
  return Math.max(1000, Number(options.browserlessInjuryLeaveRecentMs || 6000));
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
      const pressure = pickBrowserlessInjuryPressure(input, options);
      stateful.browserlessInjury = {
        at: nowMs,
        previousHp,
        currentHp: hp,
        hpDrop: Math.round(hpDrop * 10) / 10,
        targetKey: targetKey(pressure.target),
        target: summarizeTarget(pressure.target),
        hasIncoming: pressure.hasIncoming,
        unknownIncoming: pressure.unknownIncoming,
        incomingCount: pressure.incomingCount,
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
  const currentPressure = pickBrowserlessInjuryPressure(input, options);
  if (combat?.target && options.combatActionEligible !== false) return null;
  const target = browserlessInjuryTarget(injury, currentPressure);
  if (!target && !injury.hasIncoming && !currentPressure.hasIncoming) return null;
  const nowMs = Number(input.nowMs || Date.now());
  const targetHpEvidence = browserlessInjuryTargetHpEvidence(stateful, target, injury, nowMs, options);
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
      targetHpSource: targetHpEvidence.source,
      targetHpAgeMs: targetHpEvidence.ageMs
    },
    injury: {
      previousHp: numberOrNull(injury.previousHp),
      currentHp: hpValue(input.self),
      hpDrop: numberOrNull(injury.hpDrop),
      ageMs: Math.max(0, Math.round(nowMs - Number(injury.at || nowMs))),
      hasIncoming: Boolean(injury.hasIncoming || currentPressure.hasIncoming),
      unknownIncoming: Boolean(injury.unknownIncoming || currentPressure.unknownIncoming),
      incomingCount: Number(currentPressure.incomingCount || injury.incomingCount || 0),
      exitRule: combatExit.rule,
      evaluatedTargetHp: targetHpEvidence.targetHp,
      targetHpSource: targetHpEvidence.source
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
      ...(input.visibleTargets || [])
    ].filter(Boolean)
  };
  const combat = buildBrowserlessCombatDryRun({
    userId: input.userId,
    realtime: combatRealtime
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

function dangerousTargetCooldownMs(options = {}) {
  const value = Number(options.browserlessDangerousTargetCooldownMs
    ?? BROWSER_RUNTIME_DEFAULTS.browserlessDangerousTargetCooldownMs
    ?? DEFAULT_DANGEROUS_TARGET_COOLDOWN_MS);
  return Number.isFinite(value) ? Math.max(0, value) : DEFAULT_DANGEROUS_TARGET_COOLDOWN_MS;
}

function profitPursuitMinDamageMs(options = {}) {
  const value = Number(options.browserlessProfitPursuitMinDamageMs
    ?? BROWSER_RUNTIME_DEFAULTS.browserlessProfitPursuitMinDamageMs
    ?? DEFAULT_PROFIT_PURSUIT_MIN_DAMAGE_MS);
  return Number.isFinite(value) ? Math.max(0, value) : DEFAULT_PROFIT_PURSUIT_MIN_DAMAGE_MS;
}

function profitPursuitMinDamageHp(options = {}) {
  const value = Number(options.browserlessProfitPursuitMinDamageHp
    ?? BROWSER_RUNTIME_DEFAULTS.browserlessProfitPursuitMinDamageHp
    ?? DEFAULT_PROFIT_PURSUIT_MIN_DAMAGE_HP);
  return Number.isFinite(value) ? Math.max(0, value) : DEFAULT_PROFIT_PURSUIT_MIN_DAMAGE_HP;
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
  const cooldownMs = dangerousTargetCooldownMs(options);
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

function combatDecisionIsOrdinaryProfitPursuit(combatDecision, input, stateful = {}) {
  const target = combatDecision?.target || combatDecision?.dryRun?.target || null;
  if (!target) return false;
  const combatState = stateful?.combatTarget || null;
  const intent = String(target.combatIntent || combatState?.intent || '');
  const originIntent = String(combatState?.originIntent || combatState?.intent || intent || '');
  if (intent === 'defensive' || originIntent === 'defensive') return false;
  if (target.firing || targetHasRealBulletPressure(input, target, combatState)) return false;
  if (intent === 'profit' || intent === 'engaged' || intent === 'reengage') return true;
  if (originIntent === 'profit' || originIntent === 'engaged' || originIntent === 'reengage') return true;
  if (combatDecision?.dryRun?.movement?.passiveRunner?.active) return true;
  return Boolean(entityDropValue(target) > 0 && (target.active || target.combatEngagement));
}

function profitPursuitEngagedMs(combatDecision, stateful = {}, nowMs = 0) {
  const target = combatDecision?.target || combatDecision?.dryRun?.target || null;
  const ageMs = Number(target?.combatEngagement?.ageMs);
  if (Number.isFinite(ageMs)) return Math.max(0, ageMs);
  const combatState = stateful?.combatTarget || null;
  const firstSeenAt = Number(combatState?.firstSeenAt || combatState?.at || nowMs);
  return Math.max(0, Number(nowMs || 0) - firstSeenAt);
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

function buildProfitPursuitSuppression(input, combatDecision, stateful = {}, options = {}) {
  const target = combatDecision?.target || combatDecision?.dryRun?.target || null;
  if (!target || !combatDecisionIsOrdinaryProfitPursuit(combatDecision, input, stateful)) return null;
  const nowMs = Number.isFinite(Number(input?.nowMs)) ? Number(input.nowMs) : Date.now();
  const targetId = targetIdentity(target);
  if (!targetId) return null;
  const suppressions = profitPursuitSuppressionMap(stateful, nowMs);
  const cached = suppressions[targetId] || null;
  if (cached && Number(cached.until || 0) > nowMs) {
    clearSuppressedCombatTarget(stateful, targetId);
    return {
      ...cloneJson(cached),
      remainingMs: Math.max(0, Math.round(Number(cached.until || 0) - nowMs)),
      cached: true
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
      dangerousCooldown: true
    };
  }

  const centerRadius = browserlessCenterActivityRadius(options);
  const selfRadius = pointRadiusFromOrigin(input?.self);
  const targetRadius = pointRadiusFromOrigin(target);
  const engagedMs = profitPursuitEngagedMs(combatDecision, stateful, nowMs);
  const minDamageMs = profitPursuitMinDamageMs(options);
  const minDamageHp = profitPursuitMinDamageHp(options);
  const damageProgress = profitPursuitDamageProgress(combatDecision, stateful);
  const maxMs = Math.max(0, Number(options.browserlessProfitPursuitMaxMs
    ?? BROWSER_RUNTIME_DEFAULTS.browserlessProfitPursuitMaxMs
    ?? 60000));
  let reason = '';
  if (centerRadius > 0 && Number.isFinite(targetRadius) && targetRadius > centerRadius) {
    reason = 'profit-pursuit-target-outside-center';
  } else if (centerRadius > 0 && Number.isFinite(selfRadius) && selfRadius > centerRadius) {
    reason = 'profit-pursuit-self-outside-center';
  } else if (minDamageMs > 0
    && minDamageHp > 0
    && engagedMs >= minDamageMs
    && damageProgress.known
    && Number(damageProgress.damageFromStart || 0) < minDamageHp) {
    reason = 'profit-pursuit-low-damage';
  } else if (maxMs > 0 && engagedMs >= maxMs) {
    reason = 'profit-pursuit-max-ms';
  }
  if (!reason) return null;

  const suppressMs = Math.max(0, Number(options.browserlessProfitPursuitSuppressMs
    ?? BROWSER_RUNTIME_DEFAULTS.browserlessProfitPursuitSuppressMs
    ?? 60000));
  const suppression = {
    reason,
    targetId,
    at: nowMs,
    until: nowMs + suppressMs,
    suppressMs: Math.round(suppressMs),
    engagedMs: Math.round(engagedMs),
    centerRadiusCm: Math.round(centerRadius),
    selfRadiusCm: Number.isFinite(selfRadius) ? Math.round(selfRadius) : null,
    targetRadiusCm: Number.isFinite(targetRadius) ? Math.round(targetRadius) : null,
    firstHp: damageProgress.firstHp,
    minHp: damageProgress.minHp,
    targetHp: damageProgress.targetHp,
    damageFromStart: damageProgress.damageFromStart === null ? null : Math.round(Number(damageProgress.damageFromStart) * 10) / 10,
    minDamageMs: Math.round(minDamageMs),
    minDamageHp: Math.round(minDamageHp * 10) / 10,
    target: summarizeTarget(target)
  };
  suppressions[targetId] = cloneJson(suppression);
  if (reason === 'profit-pursuit-low-damage') {
    rememberDangerousCombatTarget(stateful, target, reason, input, options, {
      engagedMs: Math.round(engagedMs),
      damageFromStart: suppression.damageFromStart,
      minDamageHp: suppression.minDamageHp
    });
  }
  clearSuppressedCombatTarget(stateful, targetId);
  return suppression;
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

function buildBrowserlessDecision(state, stateful = {}, options = {}) {
  const input = buildBrowserlessStrategyInput(state, options, stateful);
  cleanupCoinProgressState(stateful, input.nowMs, options);
  applyIgnoredCoinFilter(input, stateful);
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
  const profitSelectionInput = buildProfitSelectionInput(input, profitThresholdContext, options);
  const opportunity = buildOpportunityDecision(input, stateful, {
    ...options,
    profitThresholdContext,
    includeAfkProfitTargets: nonCombatProfit ? false : options.includeAfkProfitTargets
  });
  const combat = buildCombatDecision(input, stateful, options);
  let dangerousCombatExit = rememberDangerousCombatExitTarget(input, combat, stateful, options);
  const combatPursuitSuppression = buildProfitPursuitSuppression(input, combat, stateful, options);
  let combatActionEligible = isCombatActionEligibleForDecision(combat, options) && !combatPursuitSuppression;
  const combatTarget = combat?.target || null;
  const freshProactiveCombat = Boolean(
    combatActionEligible
      && combatTarget
      && combatTarget.combatIntent !== 'defensive'
      && !combatTarget.combatEngagement
  );
  let activeCombatOpportunity = null;
  let kiteReassessment = null;
  if (freshProactiveCombat && opportunity.rawChoice) {
    const combatScore = scoreEnemyOpportunity(combatTarget, {
      ...options,
      recentCombatMetrics: stateful.combatMetrics,
      behaviorHitRate: combat.dryRun?.behavior?.recentHitRate ?? undefined,
      isAfkProfitTarget: () => false
    });
    const competingScore = Number(opportunity.rawChoice.score || 0);
    const switchRatio = 1 + Math.max(0, Number(options.opportunitySwitchRelativeMargin || OPPORTUNITY_CONSTANTS.OPPORTUNITY_SWITCH_RELATIVE_MARGIN || 0));
    const blocked = Number.isFinite(Number(combatScore)) && competingScore > Number(combatScore) * switchRatio;
    activeCombatOpportunity = {
      combatScore: Number.isFinite(Number(combatScore)) ? Math.round(Number(combatScore)) : null,
      competingScore: Math.round(competingScore),
      competingType: opportunity.rawChoice.type || '',
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
    && combat.dryRun?.behavior?.mode === 'retreat-kite'
    && combat.dryRun?.behavior?.responsePolicy?.reassessProfit
    && combatDecisionIsOrdinaryProfitPursuit(combat, input, stateful)) {
    const combatScore = scoreEnemyOpportunity(combatTarget, {
      ...options,
      recentCombatMetrics: stateful.combatMetrics,
      behaviorHitRate: combat.dryRun.behavior.recentHitRate ?? undefined,
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
  const combatForProfit = combatPursuitSuppression
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
    combatActionEligible
  };
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
  if (!dangerousCombatExit
    && injuryHpExitAction?.target
    && DANGEROUS_COMBAT_EXIT_REASONS.has(String(injuryHpExitAction.reason || ''))) {
    dangerousCombatExit = rememberDangerousCombatTarget(
      stateful,
      injuryHpExitAction.target,
      injuryHpExitAction.reason,
      input,
      options,
      {
        exit: true,
        exitSelfHp: numberOrNull(injuryHpExitAction.combatExit?.selfHp),
        exitTargetHp: numberOrNull(injuryHpExitAction.combatExit?.targetHp),
        triggerSource: 'recent-injury-pressure'
      }
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
  const staminaBudgetExitAction = (profitLive || nonCombatProfit) ? buildStaminaBudgetExitDecision(input, options) : null;
  const postAttackDropCoinAction = (profitLive || nonCombatProfit) ? buildPostAttackDropCoinDecision(profitSelectionInput, stateful, options) : null;
  const postAttackDropWaitAction = (profitLive || nonCombatProfit) ? buildPostAttackDropWaitDecision(input, stateful, options) : null;
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
    input.self
      && !realtimeStale
      && !hardSafetyAction
      && !longStaminaExhaustedLeaveAction
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
    options,
    singleCoinBaitEntryAllowed
  );
  const singleCoinBaitAction = dailyFinalCoinAction ? null : singleCoinBait.action;
  const singleCoinBaitReleaseAction = singleCoinBait.phase === 'release' ? singleCoinBaitAction : null;
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
  if (!input.self) {
    reason = 'missing-realtime-self';
    action.reason = reason;
  } else if (realtimeStale) {
    reason = 'stale-realtime-self';
    action.reason = reason;
  } else {
    const combatAction = combat.target && combatDecisionEnabled && combatActionEligible ? combat.action : null;
    const validUntil = input.nowMs + Math.max(250, Number(options.decisionIntervalMs || 1000));
    const candidate = (candidateAction, order, switchReason, hardGate = false, extra = {}) => buildFinalActionCandidate(candidateAction, {
      nowMs: input.nowMs,
      order,
      switchReason,
      hardGate,
      validUntil,
      ...extra
    });
    const candidates = [
      candidate(hardSafetyAction, 10, 'hard-safety', true, { riskScore: 100 }),
      candidate(longStaminaExhaustedLeaveAction, 20, 'stamina-exhausted-hard-gate', true, { riskScore: 100 }),
      candidate(combatExitAction, 30, 'combat-exit-hard-gate', true, { riskScore: 100 }),
      candidate(injuryHpExitAction, 40, 'injury-hp-hard-gate', true, { riskScore: 100 }),
      candidate(pursuitLeaveAction, 50, 'pursuit-hard-gate', true, { riskScore: 90 }),
      candidate(immediateSafetyAction, 55, 'realtime-safety-hard-gate', true, { riskScore: immediateSafetyAction?.urgent ? 100 : 80 }),
      candidate(combatAction, 60, 'engaged-defensive-combat-stick', false, {
        roiScore: activeCombatOpportunity?.combatScore,
        staminaCost: combat.dryRun?.metrics?.totalStaminaSpent,
        riskScore: combat.dryRun?.behavior?.mode === 'pressure-shooter' ? 70 : 40
      }),
      candidate(highValueCoinPriorityAction && !singleCoinBaitReleaseAction ? highValueCoinPriorityAction : null, 70, 'high-value-visible-coin'),
      candidate(postAttackDropCoinAction, 80, 'post-attack-drop-coin'),
      candidate(postAttackDropWaitAction, 90, 'post-attack-drop-wait'),
      candidate(staminaBudgetExitAction, 100, 'stamina-budget-exit'),
      candidate(recoveryFootCoinAction, 110, 'recovery-foot-coin'),
      candidate(recoveryAction, 120, 'ordinary-recovery'),
      candidate(injuredCautionFootCoinAction, 130, 'injured-caution-foot-coin'),
      candidate(safetyAction, 140, 'yieldable-safety'),
      candidate(singleCoinBaitAction, 150, 'single-coin-bait'),
      candidate(footCoinPriorityAction, 160, 'foot-coin-priority'),
      candidate(dailyFinalCoinAction, 170, 'daily-final-coin'),
      candidate(opportunity.choice ? opportunity.action : null, 180, 'best-eligible-profit', false, {
        roiScore: opportunity.choice?.score,
        staminaCost: opportunity.choice?.staminaCost
      }),
      candidate(returnToCenterAction, 190, 'return-to-center-fallback'),
      candidate(opportunisticShotWaitAction, 200, 'opportunistic-shot-wait'),
      candidate(staminaBlockedWaitAction, 210, 'stamina-blocked-wait'),
      candidate({ kind: 'wait', band: 'wait', reason: noCandidateWaitReason }, 999, 'no-candidate-wait')
    ].filter(Boolean);
    finalSelection = selectFinalActionCandidateCore(candidates);
    action = finalSelection?.action || action;
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
  if (input.self && !realtimeStale) {
    const selectedAction = attachOpportunisticShotDecision(action, profitSelectionInput, stateful, options);
    if (selectedAction !== action) {
      action = selectedAction;
      kind = action.kind || kind;
      band = action.band || band;
      reason = action.reason || reason;
    }
    const finalAction = applyStaleCoinEscape(
      applyCoinProgressToAction(selectedAction, input, stateful, options),
      stateful,
      input.nowMs
    );
    if (finalAction !== selectedAction) {
      action = finalAction;
      kind = action.kind || kind;
      band = action.band || band;
      reason = action.reason || reason;
    }
    action = annotateProfitActionThreshold(action, profitThresholdContext, options);
    clearIneligibleFinalProfitHold(stateful, profitThresholdContext, options);
    const arbitratedAction = applyBrowserlessFinalActionArbitration(action, stateful, input, options);
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
  const outputOpportunityChoice = ignoredActionCoinId && rememberedOpportunityKey === ignoredActionCoinId
    ? null
    : (opportunity.opportunityChoice || null);
  const outputSwitchLock = outputOpportunityChoice ? (opportunity.switchLock || null) : null;
  if (finalSelection) finalSelection.selected = action?.finalCandidate || null;
  stateful.lastDecisionAction = cloneJson(action);
  return {
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
      centerActivity: input.centerActivity,
      profitCoinSource: input.profitCoinSource,
      selfKillEvidence: topItems(input.selfKillEvidence, item => item, 20),
      nearby: summarizeNearbyForPanel(input, action, combat.dryRun || combat, options),
      dataGaps: input.dataGaps
    },
    profit: {
      best: summarizeOpportunity(opportunity.choice),
      rawBest: summarizeOpportunity(opportunity.rawChoice),
      candidates: topItems(opportunity.sorted, summarizeOpportunity),
      threshold: opportunity.threshold,
      switch: opportunity.switchDiagnostics || null,
      singleCoinBait: singleCoinBait.summary
    },
    combat: {
      ...(combat.dryRun || {}),
      target: combat.dryRun?.target || summarizeTarget(combat.target),
      actionEligible: combatActionEligible,
      activeCombatOpportunity,
      kiteReassessment,
      dangerousTargetCooldown: dangerousCombatExit,
      profitPursuitSuppression: combatPursuitSuppression,
      candidates: combat.dryRun?.candidates || topItems(combat.candidates, target => ({
        ...summarizeTarget(target),
        score: Number.isFinite(Number(target.combatScore)) ? Math.round(Number(target.combatScore)) : null
      }))
    },
    stateful: {
      opportunityChoice: outputOpportunityChoice,
      switchLock: outputSwitchLock,
      singleCoinBait: cloneJson(stateful.singleCoinBait || null)
    }
  };
}

function summarizeBrowserlessDecision(decision) {
  if (!decision || typeof decision !== 'object') return null;
  return {
    kind: decision.kind || '',
    band: decision.band || '',
    reason: decision.reason || '',
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
    }
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
  const entry = {
    id,
    name: target?.name || '',
    drop: numberOrNull(target?.drop),
    x: numberOrNull(target?.x),
    y: numberOrNull(target?.y),
    distance: numberOrNull(target?.distance),
    at: nowMs,
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
    const previousShotAt = Number(previousMetrics.actualLastShotAt || 0);
    decisionState.combatMetrics = {
      ...previousMetrics,
      targetId: String(id),
      actualShots: Number(previousMetrics.actualShots || 0) + 1,
      actualLastShotAt: nowMs,
      actualShotIntervalMs: previousShotAt > 0 ? Math.max(0, nowMs - previousShotAt) : null
    };
    recordCombatShotLearning(decisionState, target, decision?.combat || {}, { nowMs });
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
      decision.stateful.decisionState = summarizeBrowserlessDecisionState(decisionState);
      return decision;
    },
    evaluateCombat(state, nextOptions = {}) {
      const mergedOptions = { ...options, ...nextOptions };
      const input = buildBrowserlessStrategyInput(state, mergedOptions, decisionState);
      const combat = buildCombatDecision(input, decisionState, mergedOptions);
      return {
        action: combat.exitAction || combat.action || { kind: 'wait', band: 'wait', reason: 'combat-control-no-target' },
        combat: combat.dryRun,
        exitAction: combat.exitAction || null
      };
    },
    getState() {
      return cloneJson(decisionState);
    },
    getStatusSummary() {
      return summarizeBrowserlessDecisionState(decisionState);
    },
    observeActionResult(actionResult, decision, eventOptions = {}) {
      return recordAttackHistoryFromActionResult(decisionState, actionResult, decision, {
        nowMs: eventOptions.nowMs ?? eventOptions.atMs ?? options.now?.() ?? Date.now()
      });
    }
  };
}

module.exports = {
  BROWSER_RUNTIME_DEFAULTS,
  buildBrowserlessDecision,
  buildBrowserlessRuntimeDefaults,
  buildBrowserlessStrategyInput,
  createBrowserlessDecisionAdapter,
  decisionStatePatch,
  distanceBetween,
  opportunityEnemyStaminaCost,
  normalizeCoinForDecision,
  normalizeEntityForDecision,
  recordAttackHistoryFromActionResult,
  summarizeBrowserlessDecision,
  summarizeBrowserlessDecisionState
};
