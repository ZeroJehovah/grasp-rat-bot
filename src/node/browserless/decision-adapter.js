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
const { buildBrowserlessCombatDryRun } = require('./combat-adapter');

const DEFAULT_STALE_SELF_MS = 2500;
const DEFAULT_ATTACK_RANGE = 14500;
const DEFAULT_ATTACK_ENGAGE_RANGE = 26000;
const DEFAULT_ATTACK_MIN_DROP = 1;
const DEFAULT_PROFIT_LIVE_THREAT_EXIT_RANGE = DEFAULT_ATTACK_RANGE;
const DEFAULT_PROFIT_LIVE_INJURY_EXIT_RANGE = DEFAULT_ATTACK_ENGAGE_RANGE;
const DEFAULT_PROFIT_LIVE_INJURY_HP = 90;
const DEFAULT_PROFIT_LIVE_PLAYER_DROP_MAX_DISTANCE = 22000;
const DEFAULT_PROFIT_LIVE_PLAYER_DROP_MAX_AGE_TICKS = 8000;

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

function entityDropValue(entity) {
  return Number(entity?.drop ?? entity?.Drop ?? entity?.reward ?? entity?.coin_reward ?? entity?.death_reward_preview ?? entity?.death_drop_coins ?? 0) || 0;
}

function entityStaminaSummary(entity) {
  return {
    stamina: numberOrNull(entity?.stamina),
    stamina5sRemainingMilli: numberOrNull(entity?.stamina_5s_remaining_milli ?? entity?.stamina5sRemainingMilli),
    staminaSpent: numberOrNull(entity?.stamina_spent ?? entity?.staminaSpent)
  };
}

function normalizeEntityForDecision(entity, self = null, authority = 'realtime') {
  if (!entity || typeof entity !== 'object') return null;
  const x = numberOrNull(entity.x);
  const y = numberOrNull(entity.y);
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
    active: isActiveEntity(entity),
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
  const snapshotActive = isActiveEntity(snapshotEntity);
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
    userId: numberOrNull(target.user_id),
    entityId: numberOrNull(target.entity_id),
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
  const self = normalizeEntityForDecision(realtime.self, null, 'realtime');
  if (!self) dataGaps.push('missing-realtime-self');
  const selfUserId = Number(self?.user_id ?? state?.userId ?? options.userId ?? 0);
  const realtimeEntities = (Array.isArray(realtime.entities) ? realtime.entities : [])
    .map(entity => enrichRealtimeEntityWithSnapshotProfitMetadata(
      entity,
      snapshotEntitiesByUserId.get(numberOrNull(entity?.user_id)),
      options
    ))
    .map(entity => normalizeEntityForDecision(entity, self, 'realtime'))
    .filter(Boolean);
  const visibleTargets = realtimeEntities
    .filter(entity => Number(entity.user_id) !== selfUserId)
    .filter(entity => Number.isFinite(Number(entity.x)) && Number.isFinite(Number(entity.y)));
  const activeThreats = visibleTargets.filter(entity => entity.active && entity.alive !== false);
  const snapshotActiveThreats = visibleTargets.filter(entity => entity.profitMetadataActive && !entity.active && entity.alive !== false);
  const afkTargets = visibleTargets.filter(entity => {
    if (entity.active || entity.profitMetadataActive || entity.alive === false || entity.invulnerable) return false;
    return attackWorthTakingCore(self, entity, {
      attackMinDrop: options.attackMinDrop ?? DEFAULT_ATTACK_MIN_DROP,
      attackMinAfkDrop: options.attackMinAfkDrop ?? DEFAULT_ATTACK_MIN_DROP,
      attackMinRewardRatio: options.attackMinRewardRatio ?? 1,
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
  const selfKillTargetTicks = selfKillTargetTicksFromMessages(Array.isArray(fallback.messages) ? fallback.messages : [], selfUserId);
  const selfKilledPlayerDropFallbackEnabled = options.controlMode === 'profit-live';
  const selfKilledPlayerDropCoins = selfKilledPlayerDropFallbackEnabled
    ? snapshotCoins.filter(coin => isSelfKilledPlayerDropCoin(coin, selfKillTargetTicks, options))
    : [];
  const snapshotFallbackEnabledOption = options.snapshotCoinFallbackEnabled ?? options.allowSnapshotCoinFallback;
  const snapshotFallbackEnabled = snapshotFallbackEnabledOption === undefined
    ? options.controlMode !== 'profit-live'
    : snapshotFallbackEnabledOption !== false;
  const snapshotFallbackBlockedReasons = [];
  if (!snapshotFallbackEnabled) snapshotFallbackBlockedReasons.push('snapshot-fallback-disabled');
  if (realtimeCoins.length) snapshotFallbackBlockedReasons.push('realtime-profit-present');
  if (activeThreats.length) snapshotFallbackBlockedReasons.push('active-threat-visible');
  if (snapshotFrameAgeMs !== null && snapshotFrameAgeMs > snapshotMaxAgeMs) snapshotFallbackBlockedReasons.push('snapshot-stale');
  const snapshotFallbackAllowed = Boolean(snapshotFallbackEnabled && snapshotCoins.length && !snapshotFallbackBlockedReasons.length);
  if (!realtimeCoins.length && !snapshotCoins.length) dataGaps.push('no-coin-frame-type-observed');
  if (!realtimeCoins.length && snapshotCoins.length) dataGaps.push('snapshot-coin-fallback-only');
  if (selfKilledPlayerDropCoins.length) dataGaps.push('self-killed-player-drop-visible');
  if (snapshotActiveThreats.length) dataGaps.push('snapshot-active-threat-visible');
  if (snapshotFallbackBlockedReasons.length) dataGaps.push(...snapshotFallbackBlockedReasons.map(reason => `snapshot-fallback-blocked:${reason}`));
  if (!realtime.frameAgeMs && realtime.receivedAtMs) dataGaps.push('unknown-realtime-frame-age');
  const profitCoins = realtimeCoins.length
    ? realtimeCoins
    : (selfKilledPlayerDropCoins.length ? selfKilledPlayerDropCoins : (snapshotFallbackAllowed ? snapshotCoins : []));
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
      selfKilledPlayerDropCount: selfKilledPlayerDropCoins.length,
      authority: 'snapshot',
      snapshotCoinFallbackAllowed: snapshotFallbackAllowed,
      snapshotFallbackBlockedReasons
    },
    visibleTargets,
    activeThreats,
    snapshotActiveThreats,
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
  return opportunityValueScoreCore(coin?.amount, coin?.distance, {
    distanceScoreScale: options.distanceScoreScale || 10000,
    coinOpportunityValue: options.coinOpportunityValue ?? 1
  });
}

function scoreEnemyOpportunity(target, options = {}) {
  return opportunityValueScoreCore(entityDropValue(target), enemyStaminaCost(target, options), {
    distanceScoreScale: options.distanceScoreScale || 10000,
    coinOpportunityValue: options.enemyOpportunityValue ?? 1
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
  const shotCost = Math.max(0, Number(options.shotStaminaCostMs ?? OPPORTUNITY_CONSTANTS.SHOT_STAMINA_COST_MS));
  return Math.max(1, Number(target?.distance || 0) + shotCost);
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
    ? [{ coins: input.profitCoins, maxDistance: options.globalCoinMaxDistance || OPPORTUNITY_CONSTANTS.GLOBAL_COIN_MAX_DISTANCE }]
    : [];
  const opportunityOptions = {
    maxCoinDistance: options.nearCoinPriorityDistance || OPPORTUNITY_CONSTANTS.NEAR_COIN_PRIORITY_DISTANCE,
    globalCoinMaxDistance: options.globalCoinMaxDistance || OPPORTUNITY_CONSTANTS.GLOBAL_COIN_MAX_DISTANCE,
    attackRange: options.attackRange || DEFAULT_ATTACK_RANGE,
    attackEngageRange: options.attackEngageRange || DEFAULT_ATTACK_ENGAGE_RANGE,
    visibleDistance: options.nearCoinPriorityDistance || OPPORTUNITY_CONSTANTS.NEAR_COIN_PRIORITY_DISTANCE,
    highValueCoinPriorityAmount: options.highValueCoinPriorityAmount || OPPORTUNITY_CONSTANTS.HIGH_VALUE_COIN_PRIORITY_AMOUNT,
    switchHoldMs: options.opportunitySwitchHoldMs || OPPORTUNITY_CONSTANTS.OPPORTUNITY_SWITCH_HOLD_MS,
    switchMargin: options.opportunitySwitchMargin || OPPORTUNITY_CONSTANTS.OPPORTUNITY_SWITCH_MARGIN,
    scoreCoinOpportunity: coin => scoreCoinOpportunity(coin, options),
    coinStaminaCost: coin => Math.max(1, Number(coin?.distance || 0)),
    coinStaminaAffordable: () => true,
    safeCoinCandidates: (coins, activeThreats) => (coins || []).filter(coin => coinSafeFromThreats(coin, activeThreats, options)),
    snapshotCoinNavigationReason: coin => coin?.snapshotOnly
      ? snapshotCoinNavigationReasonCore(coin, {
          coinMaxDistance: options.nearCoinPriorityDistance || OPPORTUNITY_CONSTANTS.NEAR_COIN_PRIORITY_DISTANCE,
          isSnapshotOnlyCoin: item => Boolean(item?.snapshotOnly)
        })
      : 'visible-coin',
    scoreEnemyOpportunity: target => scoreEnemyOpportunity(target, options),
    enemyStaminaCost: target => enemyStaminaCost(target, options),
    opportunityStaminaAffordable: () => true,
    isAfkProfitTarget: target => input.afkTargets.includes(target),
    priorityTier: item => opportunityPriorityTierCore(item, {
      visibleDistance: options.nearCoinPriorityDistance || OPPORTUNITY_CONSTANTS.NEAR_COIN_PRIORITY_DISTANCE
    }),
    nowMs: input.nowMs
  };
  const opportunities = buildOpportunityCandidatesCore(
    input.self,
    input.activeThreats,
    coinGroups,
    includeAfkProfitTargets ? input.afkTargets : [],
    null,
    opportunityOptions
  );
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

function profitLiveSafetyDecision(input, combatDecision, options = {}) {
  if (options.controlMode !== 'profit-live' || !input.self) return null;
  const realtimeTarget = combatDecision?.dryRun?.target || combatDecision?.target || null;
  const snapshotThreat = (input.snapshotActiveThreats || [])
    .slice()
    .sort((a, b) => Number(a.distance || Infinity) - Number(b.distance || Infinity))[0] || null;
  const realtimeThreatening = Boolean(realtimeTarget?.active || realtimeTarget?.firing);
  const target = realtimeThreatening ? realtimeTarget : (snapshotThreat || realtimeTarget);
  const distance = Number(target?.distance);
  if (!target || !Number.isFinite(distance)) return null;
  const snapshotThreatening = Boolean(target.profitMetadataActive && !target.active);
  const threatening = Boolean(target.active || target.firing || snapshotThreatening);
  if (!threatening) return null;
  const threatExitRange = Math.max(0, Number(options.profitLiveThreatExitRange || DEFAULT_PROFIT_LIVE_THREAT_EXIT_RANGE));
  const injuryExitRange = Math.max(threatExitRange, Number(options.profitLiveInjuryExitRange || DEFAULT_PROFIT_LIVE_INJURY_EXIT_RANGE));
  const hp = Number(input.self.hp);
  const maxHp = Number(input.self.max_hp);
  const injuryHp = Math.max(1, Number(options.profitLiveInjuryHp || DEFAULT_PROFIT_LIVE_INJURY_HP));
  const injured = Number.isFinite(hp)
    && ((Number.isFinite(maxHp) && hp < maxHp) || hp <= injuryHp);
  if (options.combatEnabled === true) {
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
    if (injured && distance <= threatExitRange) {
      return {
        kind: 'safety-exit',
        band: 'safety',
        reason: 'profit-live-combat-injury-threat',
        shouldLeave: true,
        stopMotion: true,
        target,
        self: summarizeTarget(input.self)
      };
    }
    return null;
  }
  let reason = '';
  if (distance <= threatExitRange) reason = 'profit-live-active-threat';
  else if (injured && distance <= injuryExitRange) reason = 'profit-live-injury-threat';
  if (!reason) return null;
  return {
    kind: 'safety-exit',
    band: 'safety',
    reason,
    shouldLeave: true,
    stopMotion: true,
    target,
    self: summarizeTarget(input.self)
  };
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
  const safetyAction = profitLiveSafetyDecision(input, combat, options);
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
  } else if (opportunity.choice) {
    kind = 'profit-candidate';
    band = 'profit';
    reason = opportunity.action.reason;
    action = opportunity.action;
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
      decision: summary
    }
  };
}

function createBrowserlessDecisionAdapter(options = {}) {
  const stateful = {
    currentOpportunity: options.currentOpportunity || null,
    switchLock: options.switchLock || null
  };
  return {
    decide(state, nextOptions = {}) {
      const decision = buildBrowserlessDecision(state, stateful, {
        ...options,
        ...nextOptions
      });
      stateful.currentOpportunity = decision.stateful?.opportunityChoice || stateful.currentOpportunity || null;
      stateful.switchLock = decision.stateful?.switchLock || null;
      return decision;
    },
    getState() {
      return cloneJson(stateful);
    }
  };
}

module.exports = {
  buildBrowserlessDecision,
  buildBrowserlessStrategyInput,
  createBrowserlessDecisionAdapter,
  decisionStatePatch,
  distanceBetween,
  normalizeCoinForDecision,
  normalizeEntityForDecision,
  summarizeBrowserlessDecision
};
