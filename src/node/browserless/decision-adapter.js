'use strict';

const { attackWorthTakingCore } = require('../../strategy/attack-worth');
const { isInvulnerableEntity } = require('../../strategy/combat-target-selection');
const {
  buildOpportunityCandidatesCore,
  opportunityPriorityTierCore,
  opportunityValueScoreCore
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
const { buildBrowserlessCombatDryRun } = require('./combat-adapter');
const {
  buildReturnBlockActionCore,
  lockedFleeDirectionCore
} = require('../../strategy/active-threat-avoidance');
const {
  createBrowserlessDecisionState,
  summarizeBrowserlessDecisionState
} = require('./decision-state');

const BROWSER_RUNTIME_DEFAULTS = buildRuntimeDefaults({}, false);
const DEFAULT_STALE_SELF_MS = 2500;
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
  if (entity.moving === true || entity.recentlyMoved === true || entity.recentlyActive === true) return true;
  const threshold = Math.max(0, Number(options.activeSpeedMin ?? BROWSER_RUNTIME_DEFAULTS.activeSpeedMin));
  return entitySpeed(entity) >= threshold;
}

function isCurrentlyActiveEntity(entity, options = {}) {
  if (!entity) return false;
  return isMovingEntity(entity, options) || isFiringEntity(entity) || isActiveEntity(entity);
}

function entityDropValue(entity) {
  return Number(entity?.drop ?? entity?.Drop ?? entity?.reward ?? entity?.coin_reward ?? entity?.death_reward_preview ?? entity?.death_drop_coins ?? 0) || 0;
}

function entityStaminaSummary(entity) {
  return {
    stamina: numberOrNull(entity?.stamina),
    stamina5sRemainingMilli: numberOrNull(entity?.stamina_5s_remaining_milli ?? entity?.stamina5sRemainingMilli),
    stamina1hRemainingMilli: numberOrNull(entity?.stamina_1h_remaining_milli ?? entity?.stamina1hRemainingMilli),
    stamina1dRemainingMilli: numberOrNull(entity?.stamina_1d_remaining_milli ?? entity?.stamina1dRemainingMilli),
    staminaSpent: numberOrNull(entity?.stamina_spent ?? entity?.staminaSpent)
  };
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
  const hp = Number(self?.hp);
  const maxHp = Number(self?.max_hp);
  const injuryHp = Math.max(1, Number(options.profitLiveInjuryHp || DEFAULT_PROFIT_LIVE_INJURY_HP));
  return Number.isFinite(hp)
    && ((Number.isFinite(maxHp) && hp < maxHp) || hp <= injuryHp);
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
  const normalized = {
    ...cloneJson(entity),
    user_id: numberOrNull(entity.user_id),
    entity_id: numberOrNull(entity.entity_id),
    name: entity.name || '',
    x,
    y,
    hp: numberOrNull(entity.hp),
    max_hp: numberOrNull(entity.max_hp),
    drop: entityDropValue(entity),
    authority,
    joinModeActive: isActiveEntity(entity),
    active: moving || firing || isActiveEntity(entity),
    moving,
    speed: numberOrNull(entity.speed ?? entity.speed_per_tick ?? entity.speedPerTick) ?? entitySpeed(entity),
    firing,
    alive: isAliveEntity(entity),
    invulnerable: isInvulnerableEntity(entity)
  };
  normalized.distance = self ? distanceBetween(self, normalized) : numberOrNull(entity.distance);
  return normalized;
}

function snapshotEntityByUserId(fallback) {
  const entities = Array.isArray(fallback?.entities) ? fallback.entities : [];
  const byUserId = new Map();
  for (const entity of entities) {
    const userId = numberOrNull(entity?.user_id);
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
  const snapshotActive = isCurrentlyActiveEntity(snapshotEntity, options);
  const modePatch = snapshotJoinMode
    ? {
        profitMetadataMode: snapshotJoinMode,
        profitMetadataActive: snapshotActive,
        profitMetadataDistance: Number.isFinite(metadataDistance) ? Math.round(metadataDistance) : null
      }
    : {
        profitMetadataActive: snapshotActive,
        profitMetadataDistance: Number.isFinite(metadataDistance) ? Math.round(metadataDistance) : null
      };
  const reward = entityDropValue(snapshotEntity);
  if (!(reward > 0)) {
    return {
      ...entity,
      ...modePatch
    };
  }
  const currentDrop = entityDropValue(entity);
  return {
    ...entity,
    ...modePatch,
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
    name: target.name || '',
    authority: target.authority || '',
    x: numberOrNull(target.x),
    y: numberOrNull(target.y),
    hp: numberOrNull(target.hp),
    drop: entityDropValue(target),
    distance: Number.isFinite(Number(target.distance)) ? Math.round(Number(target.distance)) : null,
    active: Boolean(target.active || isActiveEntity(target)),
    alive: target.alive !== false,
    profitMetadataAuthority: target.profitMetadataAuthority || '',
    profitMetadataMode: target.profitMetadataMode || '',
    profitMetadataActive: Boolean(target.profitMetadataActive)
  };
}

function summarizeCoin(coin) {
  if (!coin) return null;
  return {
    type: 'coin',
    id: coin.drop_id ?? coin.id ?? '',
    authority: coin.authority || '',
    x: numberOrNull(coin.x),
    y: numberOrNull(coin.y),
    amount: numberOrNull(coin.amount),
    distance: Number.isFinite(Number(coin.distance)) ? Math.round(Number(coin.distance)) : null,
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
    target: item.sourceTarget ? summarizeTarget(item.sourceTarget) : null,
    coin: item.sourceCoin ? summarizeCoin(item.sourceCoin) : null,
    held: Boolean(item.held)
  };
}

function topItems(items, mapper, limit = 5) {
  return (items || []).slice(0, limit).map(mapper).filter(Boolean);
}

function buildBrowserlessStrategyInput(state, options = {}) {
  const realtime = state?.realtime || {};
  const fallback = state?.fallback || state?.snapshot || {};
  const dataGaps = [];
  const snapshotFrameAgeMs = numberOrNull(fallback.frameAgeMs);
  const snapshotMaxAgeMs = Math.max(1000, Number(options.snapshotCoinFallbackMaxAgeMs || 5000));
  const snapshotFreshForMetadata = snapshotFrameAgeMs === null || snapshotFrameAgeMs <= snapshotMaxAgeMs;
  const snapshotEntitiesByUserId = snapshotFreshForMetadata ? snapshotEntityByUserId(fallback) : new Map();
  const self = normalizeEntityForDecision(realtime.self, null, 'realtime', options);
  if (!self) dataGaps.push('missing-realtime-self');
  const selfUserId = Number(self?.user_id ?? state?.userId ?? options.userId ?? 0);
  const realtimeEntities = (Array.isArray(realtime.entities) ? realtime.entities : [])
    .map(entity => enrichRealtimeEntityWithSnapshotProfitMetadata(
      entity,
      snapshotEntitiesByUserId.get(numberOrNull(entity?.user_id)),
      options
    ))
    .map(entity => normalizeEntityForDecision(entity, self, 'realtime', options))
    .filter(Boolean);
  const visibleTargets = realtimeEntities
    .filter(entity => Number(entity.user_id) !== selfUserId)
    .filter(entity => Number.isFinite(Number(entity.x)) && Number.isFinite(Number(entity.y)));
  const activeThreats = visibleTargets.filter(entity => entity.active && entity.alive !== false);
  const firingThreats = visibleTargets.filter(entity => entity.firing && entity.alive !== false);
  const snapshotActiveThreats = visibleTargets.filter(entity => entity.profitMetadataActive && !entity.active && entity.alive !== false);
  const snapshotFallbackThreats = [
    ...activeThreats,
    ...firingThreats.filter(threat => !activeThreats.includes(threat)),
    ...snapshotActiveThreats
  ].filter(threat => snapshotFallbackThreatBlocks(threat, self, options));
  const afkTargets = visibleTargets.filter(entity => {
    if (entity.active || entity.moving || entity.firing || entity.profitMetadataActive || entity.alive === false || entity.invulnerable) return false;
    return attackWorthTakingCore(self, entity, {
      attackMinDrop: options.attackMinDrop ?? DEFAULT_ATTACK_MIN_DROP,
      attackMinAfkDrop: options.attackMinAfkDrop ?? DEFAULT_ATTACK_MIN_AFK_DROP,
      attackMinRewardRatio: options.attackMinRewardRatio ?? DEFAULT_ATTACK_MIN_REWARD_RATIO,
      isAfkProfitTarget: () => true,
      dropValue: entityDropValue
    });
  });
  const realtimeCoins = buildNativeCoinSnapshotCore(Array.isArray(realtime.coinDrops) ? realtime.coinDrops : [], { nowMs: options.nowMs })
    .map(drop => normalizeCoinForDecision(drop, self, 'realtime'))
    .filter(Boolean)
    .filter(coin => Number(coin.amount || 0) > 0);
  const snapshotCoins = (Array.isArray(fallback.coinDrops) ? fallback.coinDrops : [])
    .map(drop => normalizeCoinForDecision(drop, self, 'snapshot'))
    .filter(Boolean)
    .filter(coin => Number(coin.amount || 0) > 0);
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
  if (!realtimeCoins.length && !snapshotCoins.length) dataGaps.push('no-coin-frame-type-observed');
  if (!realtimeCoins.length && snapshotCoins.length) dataGaps.push('snapshot-coin-fallback-only');
  if (selfKilledPlayerDropCoins.length) dataGaps.push('self-killed-player-drop-visible');
  if (snapshotActiveThreats.length) dataGaps.push('snapshot-active-threat-visible');
  if (snapshotFallbackBlockedReasons.length) dataGaps.push(...snapshotFallbackBlockedReasons.map(reason => `snapshot-fallback-blocked:${reason}`));
  if (!realtime.frameAgeMs && realtime.receivedAtMs) dataGaps.push('unknown-realtime-frame-age');
  const profitCoins = realtimeCoins.length
    ? realtimeCoins
    : (selfKilledPlayerDropCoins.length ? selfKilledPlayerDropCoins : (snapshotFallbackAllowed ? snapshotVisibleCoins : []));
  const profitCoinSource = realtimeCoins.length
    ? 'realtime'
    : (selfKilledPlayerDropCoins.length ? 'snapshot-player-drop' : (snapshotFallbackAllowed ? 'snapshot-fallback' : 'none'));
  return {
    userId: Number(state?.userId || options.userId || 0),
    nowMs: Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now(),
    rawRealtime: realtime,
    self,
    stamina: entityStaminaSummary(self || {}),
    frameAges: state?.frameAges || {},
    realtime: {
      tick: realtime.tick ?? null,
      frameAgeMs: numberOrNull(realtime.frameAgeMs),
      entityCount: realtimeEntities.length,
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
    snapshotActiveThreats,
    snapshotFallbackThreats,
    afkTargets,
    realtimeCoins,
    snapshotCoins,
    selfKilledPlayerDropCoins,
    profitCoins,
    profitCoinSource,
    bullets: Array.isArray(realtime.bullets) ? cloneJson(realtime.bullets) : [],
    dataGaps
  };
}

function scoreCoinOpportunity(coin, options = {}) {
  const weight = Number(options.coinOpportunityValue ?? BROWSER_RUNTIME_DEFAULTS.coinOpportunityValue ?? 1);
  return opportunityValueScoreCore(coin?.amount, opportunityCoinStaminaCost(coin, options), {
    distanceFloor: options.opportunityDistanceFloor ?? BROWSER_RUNTIME_DEFAULTS.opportunityDistanceFloor,
    distanceScoreScale: options.distanceScoreScale || options.opportunityDistanceScoreScale || BROWSER_RUNTIME_DEFAULTS.opportunityDistanceScoreScale || 10000,
    weight
  });
}

function scoreEnemyOpportunity(target, options = {}) {
  const isAfkProfitTarget = typeof options.isAfkProfitTarget === 'function'
    ? options.isAfkProfitTarget
    : () => false;
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
  const shotCost = estimatedKillShots(target, options)
    * Math.max(0, Number(options.opportunityShotStaminaCostMs ?? BROWSER_RUNTIME_DEFAULTS.opportunityShotStaminaCostMs ?? OPPORTUNITY_CONSTANTS.SHOT_STAMINA_COST_MS));
  return moveCost + shotCost;
}

function staminaRemaining(self, windowName) {
  const key = String(windowName || '').toLowerCase();
  if (!self || (key !== '5s' && key !== '1h' && key !== '1d')) return null;
  const value = numberOrNull(self[`stamina_${key}_remaining_milli`]);
  return value;
}

function staminaExhaustedThreshold(options = {}) {
  return Math.max(0, Number(options.staminaExhaustedThresholdMs ?? BROWSER_RUNTIME_DEFAULTS.staminaExhaustedThresholdMs ?? 1000));
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

function opportunityStaminaAffordable(self, staminaCost, options = {}) {
  const cost = Number(staminaCost);
  if (!Number.isFinite(cost) || cost <= 0) return true;
  const budget = opportunityLongStaminaBudget(self, options);
  return !Number.isFinite(budget) || cost <= budget;
}

function safeBudgetCoinCandidates(input, options = {}) {
  if (!input?.self) return [];
  return (input.profitCoins || [])
    .filter(coin => Number(coin?.amount || 0) > 0)
    .filter(coin => coinSafeFromThreats(coin, [
      ...(input.activeThreats || []),
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
    reloginDelayMs: options.staminaBudgetReloginDelayMs ?? DEFAULT_STAMINA_BUDGET_RELOGIN_DELAY_MS
  });
  if (!exit) return null;
  return {
    kind: 'leave',
    band: 'safety',
    reason: 'stamina-budget-coin-leave',
    shouldLeave: true,
    stopMotion: true,
    staminaBudgetExit: exit,
    reloginDelayMs: exit.reloginDelayMs ?? options.staminaBudgetReloginDelayMs ?? DEFAULT_STAMINA_BUDGET_RELOGIN_DELAY_MS,
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
  const distance = Number(item?.distance ?? Infinity);
  if (!Number.isFinite(distance) || distance > opportunityVisibleDistance(options)) return base;
  if (String(item?.type || '') === 'coin') {
    const amount = Number(item?.amount ?? item?.sourceCoin?.amount ?? 0);
    const highValueAmount = Math.max(1, Number(options.highValueCoinPriorityAmount || OPPORTUNITY_CONSTANTS.HIGH_VALUE_COIN_PRIORITY_AMOUNT));
    return amount >= highValueAmount ? Math.max(base, 2) : base;
  }
  if (String(item?.type || '') === 'enemy') {
    const drop = entityDropValue(item?.sourceTarget || item);
    const priorityDrop = Math.max(
      Number(options.afkTargetPriorityMinDrop ?? 0) || 0,
      Number(options.attackMinDrop ?? DEFAULT_ATTACK_MIN_DROP) || DEFAULT_ATTACK_MIN_DROP
    );
    return drop >= priorityDrop ? Math.max(base, 2) : base;
  }
  return base;
}

function prioritizeBrowserlessOpportunities(opportunities, options = {}) {
  return (opportunities || []).map(item => ({
    ...item,
    priorityTier: browserlessOpportunityPriorityTier(item, options)
  }));
}

function buildOpportunityDecision(input, stateful = {}, options = {}) {
  if (!input.self) {
    return {
      opportunities: [],
      choice: null,
      sorted: [],
      switchLock: stateful.switchLock || null,
      opportunityChoice: stateful.currentOpportunity || null,
      action: null
    };
  }
  const includeAfkProfitTargets = options.includeAfkProfitTargets !== false && !(options.blockAfkProfitWhenActiveThreatVisible && input.activeThreats.length);
  const coinGroups = input.profitCoins.length
    ? [{ coins: input.profitCoins, maxDistance: options.globalCoinMaxDistance || DEFAULT_GLOBAL_COIN_MAX_DISTANCE }]
    : [];
  const opportunityOptions = {
    maxCoinDistance: options.coinMaxDistance || BROWSER_RUNTIME_DEFAULTS.coinMaxDistance,
    globalCoinMaxDistance: options.globalCoinMaxDistance || DEFAULT_GLOBAL_COIN_MAX_DISTANCE,
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
    nowMs: input.nowMs
  };
  const opportunities = prioritizeBrowserlessOpportunities(buildOpportunityCandidatesCore(
    input.self,
    input.activeThreats.concat(input.snapshotActiveThreats || []),
    coinGroups,
    includeAfkProfitTargets ? input.afkTargets : [],
    null,
    opportunityOptions
  ), options);
  const choice = chooseStableOpportunityCore(
    opportunities,
    stateful.currentOpportunity || null,
    stateful.switchLock || null,
    opportunityOptions
  );
  const chosen = choice.chosen || null;
  const action = chosen
    ? {
        kind: chosen.actionKind || chosen.type,
        band: 'profit',
        reason: chosen.reason || 'best-opportunity',
        target: chosen.type === 'coin' ? summarizeCoin(chosen.sourceCoin) : summarizeTarget(chosen.sourceTarget)
      }
    : null;
  const remembered = rememberOpportunityChoiceCore(chosen, action, stateful.currentOpportunity || null, opportunityOptions);
  return {
    opportunities,
    choice: chosen,
    sorted: choice.sorted || [],
    switchLock: choice.switchLock || null,
    opportunityChoice: remembered.choice || stateful.currentOpportunity || null,
    action: remembered.action || action
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

function recoverySummary(self) {
  return {
    hp: hpValue(self),
    maxHp: maxHpValue(self) ?? 100,
    stamina5s: numberOrNull(self?.stamina_5s_remaining_milli ?? self?.stamina5sRemainingMilli),
    stamina5sLimit: numberOrNull(self?.stamina_5s_limit_milli ?? self?.stamina5sLimitMilli)
  };
}

function buildCombatDecision(input, options = {}) {
  const combatLiveEnabled = (options.controlMode === 'combat-live' || options.controlMode === 'profit-live') && options.combatEnabled === true;
  const combat = buildBrowserlessCombatDryRun({
    userId: input.userId,
    realtime: input.rawRealtime || {}
  }, {
    ...options,
    liveCombatEnabled: combatLiveEnabled
  });
  const target = combat.target || null;
  const actionKind = combatLiveEnabled
    ? 'combat-live'
    : (options.controlMode === 'combat-dry-run' ? 'combat-dry-run' : 'combat-candidate');
  const actionReason = combatLiveEnabled
    ? 'combat-live-realtime'
    : (options.controlMode === 'combat-dry-run' ? 'combat-dry-run-realtime' : 'realtime-visible-threat');
  return {
    target,
    candidates: combat.candidates || [],
    dryRun: combat,
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
  const realtimeThreatsById = new Map();
  for (const target of [
    ...(realtimeTarget && (realtimeTarget.active || realtimeTarget.firing) ? [realtimeTarget] : []),
    ...(input.activeThreats || []),
    ...(input.firingThreats || [])
  ]) {
    const id = target?.userId ?? target?.user_id ?? target?.entityId ?? target?.entity_id ?? `${target?.x}:${target?.y}`;
    if (!target || id === null || id === undefined) continue;
    if (target.alive === false) continue;
    const distance = Number(target.distance);
    if (!Number.isFinite(distance)) continue;
    if (!realtimeThreatsById.has(String(id)) || distance < Number(realtimeThreatsById.get(String(id)).distance || Infinity)) {
      realtimeThreatsById.set(String(id), target);
    }
  }
  const realtimeThreat = Array.from(realtimeThreatsById.values())
    .sort((a, b) => Number(a.distance || Infinity) - Number(b.distance || Infinity))[0] || null;
  const snapshotThreat = (input.snapshotActiveThreats || [])
    .slice()
    .sort((a, b) => Number(a.distance || Infinity) - Number(b.distance || Infinity))[0] || null;
  const target = realtimeThreat || snapshotThreat || realtimeTarget;
  const distance = Number(target?.distance);
  if (!target || !Number.isFinite(distance)) return null;
  const snapshotThreatening = Boolean(target.profitMetadataActive && !target.active);
  const threatening = Boolean(target.active || target.firing || snapshotThreatening);
  if (!threatening) return null;
  const threatExitRange = Math.max(0, Number(options.profitLiveThreatExitRange || DEFAULT_PROFIT_LIVE_THREAT_EXIT_RANGE));
  const injuryExitRange = Math.max(threatExitRange, Number(options.profitLiveInjuryExitRange || DEFAULT_PROFIT_LIVE_INJURY_EXIT_RANGE));
  const injured = isInjuredSelf(input.self, options);
  if (options.combatEnabled === true) {
    const combatTargetId = realtimeTarget?.userId ?? realtimeTarget?.user_id ?? realtimeTarget?.entityId ?? realtimeTarget?.entity_id ?? null;
    const threatId = target?.userId ?? target?.user_id ?? target?.entityId ?? target?.entity_id ?? null;
    const combatHandlesThreat = combatTargetId !== null
      && combatTargetId !== undefined
      && threatId !== null
      && threatId !== undefined
      && String(combatTargetId) === String(threatId);
    if (snapshotThreatening && distance <= threatExitRange) {
      return {
        kind: 'safety-exit',
        band: 'safety',
        reason: 'profit-live-snapshot-active-threat',
        shouldLeave: true,
        stopMotion: true,
        target: summarizeTarget(target),
        self: summarizeTarget(input.self)
      };
    }
    if (!combatHandlesThreat && (target.active || target.firing) && distance <= threatExitRange) {
      const avoidance = buildReturnBlockActionCore(stateful, input.self, [target], blockedAction || { kind: 'wait', reason: 'blocked-by-active-threat' }, {
        ...options,
        nowMs: input.nowMs
      });
      return avoidance
        ? { ...avoidance, target: summarizeTarget(target), self: summarizeTarget(input.self) }
        : buildThreatFleeDecision(stateful, input, target, 'profit-live-active-threat', options);
    }
    if (injured && distance <= threatExitRange) {
      return buildThreatFleeDecision(stateful, input, target, 'profit-live-combat-injury-threat', options);
    }
    return null;
  }
  let reason = '';
  if (distance <= threatExitRange) reason = 'profit-live-active-threat';
  else if (injured && distance <= injuryExitRange) reason = 'profit-live-injury-threat';
  if (!reason) return null;
  if (snapshotThreatening) {
    return {
      kind: 'safety-exit',
      band: 'safety',
      reason: 'profit-live-snapshot-active-threat',
      shouldLeave: true,
      stopMotion: true,
      target: summarizeTarget(target),
      self: summarizeTarget(input.self)
    };
  }
  const avoidance = buildReturnBlockActionCore(stateful, input.self, [target], blockedAction || { kind: 'wait', reason: 'blocked-by-active-threat' }, {
    ...options,
    nowMs: input.nowMs
  });
  return avoidance
    ? { ...avoidance, target: summarizeTarget(target), self: summarizeTarget(input.self) }
    : buildThreatFleeDecision(stateful, input, target, reason, options);
}

function buildBrowserlessDecision(state, stateful = {}, options = {}) {
  const input = buildBrowserlessStrategyInput(state, options);
  const staleSelfMs = Math.max(1000, Number(options.staleSelfMs || DEFAULT_STALE_SELF_MS));
  const nonCombatProfit = options.controlMode === 'non-combat-profit' || options.nonCombatProfit === true;
  const profitLive = options.controlMode === 'profit-live';
  const combatDryRun = options.controlMode === 'combat-dry-run';
  const combatLiveEnabled = (options.controlMode === 'combat-live' || profitLive) && options.combatEnabled === true;
  const combatDecisionEnabled = options.combatDecisionEnabled !== false && !nonCombatProfit && (!profitLive || options.combatEnabled === true);
  const frameAge = Number(input.realtime.frameAgeMs);
  const opportunity = buildOpportunityDecision(input, stateful, {
    ...options,
    includeAfkProfitTargets: nonCombatProfit ? false : options.includeAfkProfitTargets,
    blockAfkProfitWhenActiveThreatVisible: profitLive ? true : options.blockAfkProfitWhenActiveThreatVisible
  });
  const combat = buildCombatDecision(input, options);
  const combatActionEligible = isCombatActionEligibleForDecision(combat, options);
  const safetyAction = profitLiveSafetyDecision(input, combat, stateful, options, opportunity.action);
  const staminaBudgetExitAction = (profitLive || nonCombatProfit) ? buildStaminaBudgetExitDecision(input, options) : null;
  const recoveryAction = (profitLive || nonCombatProfit) ? buildRecoveryDecision(input, opportunity, options) : null;
  const dailyFinalCoinAction = (profitLive || nonCombatProfit) && !recoveryAction
    ? buildDailyStaminaFinalCoinDecision(input, options)
    : null;
  const staminaBlockedWaitAction = (profitLive || nonCombatProfit)
    ? buildStaminaBlockedWaitDecision(input, options)
    : null;
  let kind = 'wait';
  let band = 'wait';
  let reason = '';
  let action = { kind: 'wait', band: 'wait', reason: '' };
  if (!input.self) {
    reason = 'missing-realtime-self';
    action.reason = reason;
  } else if (Number.isFinite(frameAge) && frameAge > staleSelfMs) {
    reason = 'stale-realtime-self';
    action.reason = reason;
  } else if (safetyAction) {
    kind = safetyAction.kind;
    band = safetyAction.band;
    reason = safetyAction.reason;
    action = safetyAction;
  } else if (combat.target && combatDecisionEnabled && combatActionEligible) {
    kind = combatLiveEnabled ? 'combat-live' : (combatDryRun ? 'combat-dry-run' : 'combat-candidate');
    band = 'combat';
    reason = combat.action.reason;
    action = combat.action;
  } else if (staminaBudgetExitAction) {
    kind = staminaBudgetExitAction.kind;
    band = staminaBudgetExitAction.band;
    reason = staminaBudgetExitAction.reason;
    action = staminaBudgetExitAction;
  } else if (recoveryAction) {
    kind = recoveryAction.kind;
    band = recoveryAction.band;
    reason = recoveryAction.reason;
    action = recoveryAction;
  } else if (dailyFinalCoinAction) {
    kind = dailyFinalCoinAction.kind;
    band = dailyFinalCoinAction.band;
    reason = dailyFinalCoinAction.reason;
    action = dailyFinalCoinAction;
  } else if (opportunity.choice) {
    kind = 'profit-candidate';
    band = 'profit';
    reason = opportunity.action.reason;
    action = opportunity.action;
  } else if (staminaBlockedWaitAction) {
    kind = staminaBlockedWaitAction.kind;
    band = staminaBlockedWaitAction.band;
    reason = staminaBlockedWaitAction.reason;
    action = staminaBlockedWaitAction;
  } else {
    reason = 'no-profitable-candidate';
    action.reason = reason;
  }
  return {
    ok: true,
    dryRun: true,
    kind,
    band,
    reason,
    at: new Date(input.nowMs).toISOString(),
    tick: input.realtime.tick,
    action,
    input: {
      self: summarizeTarget(input.self),
      stamina: input.stamina,
      realtime: input.realtime,
      fallback: input.fallback,
      profitCoinSource: input.profitCoinSource,
      dataGaps: input.dataGaps
    },
    profit: {
      best: summarizeOpportunity(opportunity.choice),
      candidates: topItems(opportunity.sorted, summarizeOpportunity)
    },
    combat: {
      ...(combat.dryRun || {}),
      target: combat.dryRun?.target || summarizeTarget(combat.target),
      actionEligible: combatActionEligible,
      candidates: combat.dryRun?.candidates || topItems(combat.candidates, target => ({
        ...summarizeTarget(target),
        score: Number.isFinite(Number(target.combatScore)) ? Math.round(Number(target.combatScore)) : null
      }))
    },
    stateful: {
      opportunityChoice: opportunity.opportunityChoice || null,
      switchLock: opportunity.switchLock || null
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

function createBrowserlessDecisionAdapter(options = {}) {
  const decisionState = createBrowserlessDecisionState(options);
  return {
    decide(state, nextOptions = {}) {
      const decision = buildBrowserlessDecision(state, decisionState, {
        ...options,
        ...nextOptions
      });
      decisionState.opportunityChoice = decision.stateful?.opportunityChoice || decisionState.opportunityChoice || null;
      decisionState.opportunitySwitchLock = decision.stateful?.switchLock || null;
      decision.stateful.decisionState = summarizeBrowserlessDecisionState(decisionState);
      return decision;
    },
    getState() {
      return cloneJson(decisionState);
    },
    getStatusSummary() {
      return summarizeBrowserlessDecisionState(decisionState);
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
  normalizeCoinForDecision,
  normalizeEntityForDecision,
  summarizeBrowserlessDecision,
  summarizeBrowserlessDecisionState
};
