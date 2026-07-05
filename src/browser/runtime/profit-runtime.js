'use strict';

const { createProfitArbitrationRuntime } = require('./profit-arbitration-runtime');
const { createProfitCoinRuntime } = require('./profit-coin-runtime');
const { createProfitOpportunityRuntime } = require('./profit-opportunity-runtime');
const { createProfitPostAttackRuntime } = require('./profit-post-attack-runtime');

function createProfitRuntime(runtime = {}) {
  const {
    bot,
    cfg,
    OPPORTUNITY_CONSTANTS = {},
    safeJsonClone = value => value,
    arrayCount = value => Array.isArray(value) ? value.length : 0,
    formatDistance = value => String(value),
    formatDurationMs = value => String(value),
    now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
    hypot = Math.hypot,
    dist = () => Infinity,
    clamp = (value, min, max) => Math.max(min, Math.min(max, value)),
    staminaRemaining = () => NaN,
    staminaExhaustedThreshold = () => 0,
    staminaBudgetReloginDelayMs = () => 0,
    isInvulnerableActive = () => false,
    isInvulnerable = () => false,
    isCurrentlyActive = () => false,
    isFiringEntity = () => false,
    isAfkProfitTarget = () => false,
    isWhitelistedTarget = () => false,
    hasCombatActivitySignal = () => false,
    hpValue = () => 0,
    combatHpValue = () => 100,
    knownHpValue = () => null,
    dropValue = () => 0,
    isFullHp = () => true,
    snapshotCoinLocalSuppressRadius = () => 0,
    isSnapshotOnlyCoin = () => false,
    normalizeCoinDrop = value => value,
    getNativeCoinSources = () => null,
    getNativeCoinList = () => null,
    entityFreshEnoughForOffense = () => true,
    isAlive = value => Boolean(value),
    attackWorthTakingCore = () => false,
    incomingBulletThreat = () => null,
    pickCombatTarget = () => null,
    isLowValueActiveCombatTarget = () => false,
    lowValueActiveThreatensSelf = () => false,
    updateSessionStats = () => {},
    pushBounded = (list, item, limit) => {
      if (Array.isArray(list)) {
        list.push(item);
        if (Number(limit) > 0 && list.length > limit) list.splice(0, list.length - limit);
      }
      return list;
    },
    importantSessionStaminaSpentMs = () => 0,
    recordKillHistoryItem = () => null,
    upsertImportantSessionRecord = () => null,
    summarizeSelf = value => value
  } = runtime;

  const coinRuntime = createProfitCoinRuntime({
    bot,
    cfg,
    OPPORTUNITY_CONSTANTS,
    safeJsonClone,
    now,
    hypot,
    dist,
    clamp,
    isInvulnerableActive,
    isInvulnerable,
    isCurrentlyActive,
    isFiringEntity,
    isWhitelistedTarget,
    hasCombatActivitySignal,
    hpValue,
    isFullHp,
    snapshotCoinLocalSuppressRadius,
    isSnapshotOnlyCoin,
    incomingBulletThreat,
    isLowValueActiveCombatTarget,
    lowValueActiveThreatensSelf,
    compareCoinOpportunity: (...args) => opportunityRuntime.compareCoinOpportunity(...args),
    opportunityCoinStaminaCost: (...args) => opportunityRuntime.opportunityCoinStaminaCost(...args),
    opportunityStaminaAffordable: (...args) => opportunityRuntime.opportunityStaminaAffordable(...args),
    opportunityValueScoreCore: (...args) => opportunityRuntime.opportunityValueScoreCore(...args)
  });

  const opportunityRuntime = createProfitOpportunityRuntime({
    bot,
    cfg,
    formatDistance,
    formatDurationMs,
    now,
    dist,
    staminaRemaining,
    staminaExhaustedThreshold,
    staminaBudgetReloginDelayMs,
    isSnapshotOnlyCoin,
    normalizeCoinDrop,
    getNativeCoinSources,
    isAfkProfitTarget,
    isWhitelistedTarget,
    isFullHp,
    combatHpValue,
    pickCombatTarget,
    ...coinRuntime,
    buildCoinAction: (...args) => postAttackRuntime.buildCoinAction(...args),
    coinTargetCoreOptions: (...args) => arbitrationRuntime.coinTargetCoreOptions(...args),
    coinMatchesTrackedTargetCore: (...args) => arbitrationRuntime.coinMatchesTrackedTargetCore(...args),
    snapshotCoinWorthLongTravelCore: (...args) => arbitrationRuntime.snapshotCoinWorthLongTravelCore(...args),
    snapshotCoinNavigationReasonCore: (...args) => arbitrationRuntime.snapshotCoinNavigationReasonCore(...args)
  });

  const postAttackRuntime = createProfitPostAttackRuntime({
    bot,
    cfg,
    now,
    hypot,
    knownHpValue,
    dropValue,
    isAlive,
    isWhitelistedTarget,
    isCurrentlyActive,
    isInvulnerable,
    entityFreshEnoughForOffense,
    isAfkProfitTarget,
    ...coinRuntime,
    ...opportunityRuntime
  });

  const arbitrationRuntime = createProfitArbitrationRuntime({
    bot,
    cfg,
    safeJsonClone,
    arrayCount,
    now,
    dist,
    isSnapshotOnlyCoin,
    normalizeCoinDrop,
    getNativeCoinList,
    updateSessionStats,
    pushBounded,
    importantSessionStaminaSpentMs,
    recordKillHistoryItem,
    upsertImportantSessionRecord,
    ...opportunityRuntime
  });

  return {
    ...coinRuntime,
    ...opportunityRuntime,
    ...postAttackRuntime,
    ...arbitrationRuntime
  };
}

module.exports = {
  createProfitRuntime
};
