'use strict';

const { attackWorthTakingCore } = require('../../strategy/attack-worth');
const {
  isCombatEligibleThreat,
  isInvulnerableEntity,
  selectBestCombatTarget,
  calculateCombatTargetPriority
} = require('../../strategy/combat-target-selection');
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

const DEFAULT_STALE_SELF_MS = 2500;
const DEFAULT_ATTACK_RANGE = 14500;
const DEFAULT_ATTACK_ENGAGE_RANGE = 26000;
const DEFAULT_ATTACK_MIN_DROP = 1;

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
  return Number(entity?.drop ?? entity?.Drop ?? entity?.reward ?? entity?.coin_reward ?? 0) || 0;
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

function summarizeTarget(target) {
  if (!target) return null;
  return {
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
    alive: target.alive !== false
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
  const self = normalizeEntityForDecision(realtime.self, null, 'realtime');
  if (!self) dataGaps.push('missing-realtime-self');
  const realtimeEntities = (Array.isArray(realtime.entities) ? realtime.entities : [])
    .map(entity => normalizeEntityForDecision(entity, self, 'realtime'))
    .filter(Boolean);
  const selfUserId = Number(self?.user_id ?? state?.userId ?? options.userId ?? 0);
  const visibleTargets = realtimeEntities
    .filter(entity => Number(entity.user_id) !== selfUserId)
    .filter(entity => Number.isFinite(Number(entity.x)) && Number.isFinite(Number(entity.y)));
  const activeThreats = visibleTargets.filter(entity => entity.active && entity.alive !== false);
  const afkTargets = visibleTargets.filter(entity => {
    if (entity.active || entity.alive === false || entity.invulnerable) return false;
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
  const snapshotFrameAgeMs = numberOrNull(fallback.frameAgeMs);
  const snapshotMaxAgeMs = Math.max(1000, Number(options.snapshotCoinFallbackMaxAgeMs || 5000));
  const snapshotFallbackBlockedReasons = [];
  if (realtimeCoins.length) snapshotFallbackBlockedReasons.push('realtime-profit-present');
  if (activeThreats.length) snapshotFallbackBlockedReasons.push('active-threat-visible');
  if (snapshotFrameAgeMs !== null && snapshotFrameAgeMs > snapshotMaxAgeMs) snapshotFallbackBlockedReasons.push('snapshot-stale');
  const snapshotFallbackAllowed = Boolean(snapshotCoins.length && !snapshotFallbackBlockedReasons.length);
  if (!realtimeCoins.length && !snapshotCoins.length) dataGaps.push('no-coin-frame-type-observed');
  if (!realtimeCoins.length && snapshotCoins.length) dataGaps.push('snapshot-coin-fallback-only');
  if (snapshotFallbackBlockedReasons.length) dataGaps.push(...snapshotFallbackBlockedReasons.map(reason => `snapshot-fallback-blocked:${reason}`));
  if (!realtime.frameAgeMs && realtime.receivedAtMs) dataGaps.push('unknown-realtime-frame-age');
  return {
    userId: Number(state?.userId || options.userId || 0),
    nowMs: Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now(),
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
      authority: 'snapshot',
      snapshotCoinFallbackAllowed: snapshotFallbackAllowed,
      snapshotFallbackBlockedReasons
    },
    visibleTargets,
    activeThreats,
    afkTargets,
    realtimeCoins,
    snapshotCoins,
    profitCoins: realtimeCoins.length ? realtimeCoins : (snapshotFallbackAllowed ? snapshotCoins : []),
    profitCoinSource: realtimeCoins.length ? 'realtime' : (snapshotFallbackAllowed ? 'snapshot-fallback' : 'none'),
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
  const includeAfkProfitTargets = options.includeAfkProfitTargets !== false;
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
  if (!input.self) return { target: null, candidates: [], action: null };
  const context = {
    userId: input.userId,
    bullets: input.bullets,
    whitelistCheck: typeof options.whitelistCheck === 'function' ? options.whitelistCheck : () => false
  };
  const candidates = input.visibleTargets
    .filter(target => isCombatEligibleThreat(target, context))
    .map(target => ({
      ...target,
      combatScore: calculateCombatTargetPriority(input.self, target, context)
    }))
    .sort((a, b) => Number(b.combatScore || 0) - Number(a.combatScore || 0));
  const target = selectBestCombatTarget(input.self, candidates, context);
  return {
    target,
    candidates,
    action: target
      ? {
          kind: 'combat-candidate',
          band: 'combat',
          reason: 'realtime-visible-threat',
          target: summarizeTarget(target)
        }
      : null
  };
}

function buildBrowserlessDecision(state, stateful = {}, options = {}) {
  const input = buildBrowserlessStrategyInput(state, options);
  const staleSelfMs = Math.max(1000, Number(options.staleSelfMs || DEFAULT_STALE_SELF_MS));
  const nonCombatProfit = options.controlMode === 'non-combat-profit' || options.nonCombatProfit === true;
  const combatDecisionEnabled = options.combatDecisionEnabled !== false && !nonCombatProfit;
  const frameAge = Number(input.realtime.frameAgeMs);
  const opportunity = buildOpportunityDecision(input, stateful, {
    ...options,
    includeAfkProfitTargets: nonCombatProfit ? false : options.includeAfkProfitTargets
  });
  const combat = buildCombatDecision(input, options);
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
  } else if (combat.target && combatDecisionEnabled) {
    kind = 'combat-candidate';
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
      target: summarizeTarget(combat.target),
      candidates: topItems(combat.candidates, target => ({
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
