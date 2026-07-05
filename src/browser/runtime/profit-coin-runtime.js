'use strict';

function createProfitCoinRuntime(runtime = {}) {
  const {
    bot,
    cfg,
    OPPORTUNITY_CONSTANTS = {},
    safeJsonClone = value => value,
    now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
    hypot = Math.hypot,
    dist = () => Infinity,
    clamp = (value, min, max) => Math.max(min, Math.min(max, value)),
    isInvulnerableActive = () => false,
    isInvulnerable = () => false,
    isCurrentlyActive = () => false,
    isFiringEntity = () => false,
    isWhitelistedTarget = () => false,
    hasCombatActivitySignal = () => false,
    hpValue = () => 0,
    isFullHp = () => true,
    snapshotCoinLocalSuppressRadius = () => 0,
    isSnapshotOnlyCoin = () => false,
    incomingBulletThreat = () => null,
    isLowValueActiveCombatTarget = () => false,
    lowValueActiveThreatensSelf = () => false,
    compareCoinOpportunity = () => 0,
    opportunityCoinStaminaCost = () => 0,
    opportunityStaminaAffordable = () => true,
    opportunityValueScoreCore = () => 0
  } = runtime;

const {
  coinMotionNumber,
  coinMotionTolerance,
  coinAxisApproachDirectionCore,
  coinPickupPrecisionPulseMsCore,
  coinAxisLockShouldHoldCore,
  coinNearApproachAxisCore,
  coinDirectionToCore,
  coinMotionMetaCore
} = require('./coin-motion');

  function directionTo(self, target, tolerance = 250) {
    const dxRaw = Number(target.x) - Number(self.x);
    const dyRaw = Number(target.y) - Number(self.y);
    const absX = Math.abs(dxRaw);
    const absY = Math.abs(dyRaw);
    return {
      dx: absX > tolerance ? Math.sign(dxRaw) : 0,
      dy: absY > tolerance ? Math.sign(dyRaw) : 0,
      distance: hypot(dxRaw, dyRaw)
    };
  }

  function coinMotionCoreOptions(tolerance = cfg.coinPrecisionTolerance, extra = {}) {
    return {
      tolerance,
      coinPrecisionTolerance: cfg.coinPrecisionTolerance,
      coinAxisApproachMinDistance: cfg.coinAxisApproachMinDistance,
      coinAxisApproachRatio: cfg.coinAxisApproachRatio,
      coinAxisApproachLaneTolerance: cfg.coinAxisApproachLaneTolerance,
      coinPickupStopDistance: cfg.coinPickupStopDistance,
      coinPickupStopPulseMs: cfg.coinPickupStopPulseMs,
      coinPickupMicroDistance: cfg.coinPickupMicroDistance,
      coinPickupMicroPulseMs: cfg.coinPickupMicroPulseMs,
      coinPickupFineDistance: cfg.coinPickupFineDistance,
      coinPickupFinePulseMs: cfg.coinPickupFinePulseMs,
      coinPickupBrakeDistance: cfg.coinPickupBrakeDistance,
      coinPickupBrakePulseMs: cfg.coinPickupBrakePulseMs,
      coinPickupSweepDistance: cfg.coinPickupSweepDistance,
      coinPickupSweepPulseMs: cfg.coinPickupSweepPulseMs,
      coinPickupPulseMs: cfg.coinPickupPulseMs,
      coinPickupExactTolerance: cfg.coinPickupExactTolerance,
      coinPickupFailureSlowStepMs: cfg.coinPickupFailureSlowStepMs,
      coinPickupFailureMinPulseMs: cfg.coinPickupFailureMinPulseMs,
      coinApproachBrakeDistance: cfg.coinApproachBrakeDistance,
      coinAxisFlipTolerance: cfg.coinAxisFlipTolerance,
      coinApproachLockMs: cfg.coinApproachLockMs,
      nearCoinStuckDistance: cfg.nearCoinStuckDistance,
      ...extra
    };
  }

  function coinPickupFailureCount(id, t = now()) {
    if (!id && id !== 0) return 0;
    const failure = bot.coinFailures.get(String(id));
    if (!failure) return 0;
    const lastAt = Number(failure.lastAt || 0);
    if (lastAt && t - lastAt > Number(cfg.coinFailureDecayMs || 0)) return 0;
    return Math.max(0, Math.floor(Number(failure.count || 0)));
  }

  function coinPickupAttemptSlowCount(id, distance, t = now()) {
    if (!id && id !== 0) return 0;
    if (Number(distance) > Number(cfg.closeCoinStuckDistance || 0)) return 0;
    const progress = bot.coinProgress;
    if (!progress || String(progress.id) !== String(id)) return 0;
    const lastImprovedAt = Number(progress.lastImprovedAt || progress.startedAt || t);
    const everyMs = Math.max(1, Number(cfg.coinPickupAttemptSlowEveryMs || 2500));
    const maxCount = Math.max(0, Math.floor(Number(cfg.coinPickupAttemptSlowMaxCount || 0)));
    return clamp(Math.floor(Math.max(0, t - lastImprovedAt) / everyMs), 0, maxCount);
  }

  function applyCoinApproachLockUpdate(update) {
    if (!update) return;
    if (update.action === 'set' && update.lock) {
      bot.coinApproachLock = update.lock;
      return;
    }
    if (update.action === 'clear') {
      if (update.all || !bot.coinApproachLock || String(bot.coinApproachLock.id) === String(update.id)) {
        bot.coinApproachLock = null;
      }
    }
  }

const {
  coinDiagnosticsSummary,
  summarizeCoinDiagnosticsList,
  addCoinFilterDiagnostic,
  buildCoinDiagnostics
} = require('./coin-diagnostics');

  function coinThreatDangerRadius(threat) {
	    const base = Number(threat?.coinDangerRadius ?? cfg.coinDangerRadius);
	    if (isInvulnerableActive(threat)) return Math.max(base, Number(cfg.invulnerableActiveCoinDangerRadius || 0));
	    return base;
	  }

	  function coinHeadingBlockedByInvulnerableThreat(self, coin, threat) {
	    if (!self || !coin || !isInvulnerableActive(threat)) return false;
	    const coinDx = Number(coin.x) - Number(self.x);
	    const coinDy = Number(coin.y) - Number(self.y);
	    const threatDx = Number(threat.x) - Number(self.x);
	    const threatDy = Number(threat.y) - Number(self.y);
	    const coinDistance = Math.hypot(coinDx, coinDy);
	    const threatDistance = Math.hypot(threatDx, threatDy);
	    const minCoinDistance = Math.max(0, Number(cfg.invulnerableActiveCoinHeadingMinDistance || 0));
	    const blockRadius = Math.max(0, Number(cfg.invulnerableActiveCoinHeadingBlockRadius || 0));
	    if (!(coinDistance >= minCoinDistance) || !(threatDistance > 0) || threatDistance > blockRadius) return false;
	    const cos = (coinDx * threatDx + coinDy * threatDy) / Math.max(1, coinDistance * threatDistance);
	    if (cos < Number(cfg.invulnerableActiveCoinHeadingCosMin || 0)) return false;
	    const lane = Math.abs(coinDx * threatDy - coinDy * threatDx) / Math.max(1, threatDistance);
	    return lane <= Math.max(0, Number(cfg.invulnerableActiveCoinHeadingLaneRadius || 0))
	      && coinDistance <= threatDistance + Math.max(0, Number(cfg.invulnerableActiveCoinDangerRadius || 0));
	  }

	  function coinBlockedByThreat(self, coin, threat) {
	    const threatRadius = coinThreatDangerRadius(threat);
	    if (dist(coin, threat) <= threatRadius) {
	      if (!self) return true;
	      const coinDistance = dist(self, coin);
	      const threatDistance = Number.isFinite(Number(threat?.distance)) ? Number(threat.distance) : dist(self, threat);
	      if (!Number.isFinite(coinDistance) || !Number.isFinite(threatDistance)) return true;
	      if (coinDistance <= Math.max(0, Number(cfg.activeReturnBlockCoinPassDistance || 0))) return false;
	      if (isInvulnerableActive(threat)) return true;
	      const coinDx = Number(coin.x) - Number(self.x);
	      const coinDy = Number(coin.y) - Number(self.y);
	      const threatDx = Number(threat.x) - Number(self.x);
	      const threatDy = Number(threat.y) - Number(self.y);
	      const towardThreat = (coinDx * threatDx + coinDy * threatDy) > 0;
	      if (!towardThreat) return false;
	      const stopGap = threatDistance - coinDistance;
	      const stopBuffer = Math.max(0, Number(threat?.threatRadius || cfg.dangerRadius || 0));
	      if (stopGap <= stopBuffer) return true;
	    }
	    return coinHeadingBlockedByInvulnerableThreat(self, coin, threat);
	  }

	  function coinDiagnosticsNearDistance() {
	    return Math.max(0, Number(cfg.coinDiagnosticsNearDistance || cfg.opportunityVisibleDistance || cfg.globalCoinMaxDistance || cfg.nearCoinPriorityDistance || cfg.coinMaxDistance || 0));
	  }

	  function coinDiagnosticsLimit() {
	    return Math.max(1, Math.round(Number(cfg.coinDiagnosticsMaxEntries || 8) || 8));
	  }

	  function coinThreatDiagnostics(threat) {
	    if (!threat) return null;
	    return {
	      id: threat.user_id ?? threat.id ?? null,
	      name: threat.name || '',
	      distance: Number.isFinite(Number(threat.distance)) ? Math.round(Number(threat.distance)) : null,
	      radius: Math.round(coinThreatDangerRadius(threat)),
	      invulnerable: isInvulnerable(threat),
	      active: isCurrentlyActive(threat)
	    };
	  }

	  function recordCoinFilterDiagnostic(coin, reason, detail = {}) {
	    addCoinFilterDiagnostic(bot.coinDiagnostics, coin, reason, {
	      nearDistance: coinDiagnosticsNearDistance(),
	      limit: coinDiagnosticsLimit(),
	      detail
	    });
	  }

	  function coinStaminaAffordableWithDiagnostic(self, coin, staminaCost = opportunityCoinStaminaCost(coin), reason = 'stamina-unaffordable') {
	    const affordable = opportunityStaminaAffordable(self, staminaCost);
	    if (!affordable) recordCoinFilterDiagnostic(coin, reason, { staminaCost: Math.round(Number(staminaCost) || 0) });
	    return affordable;
	  }

	  function attachCoinDiagnostics(action) {
	    if (!action || !bot.coinDiagnostics) return action;
	    return {
	      ...action,
	      coinDiagnostics: safeJsonClone(bot.coinDiagnostics) || bot.coinDiagnostics
	    };
	  }

	  function safeCoinCandidates(coins, activeThreats, maxDistance, self = null) {
	    const t = now();
	    for (const [id, until] of bot.ignoredCoins.entries()) {
	      if (until <= t) bot.ignoredCoins.delete(id);
	    }
	    return (coins || []).map(c => ({
	      ...c,
	      distance: Number.isFinite(Number(c?.distance)) ? Number(c.distance) : (self ? dist(self, c) : Number(c?.distance))
	    })).filter(c => {
	      if (!(c.distance <= maxDistance)) {
	        if (Number(maxDistance || 0) >= coinDiagnosticsNearDistance()) {
	          recordCoinFilterDiagnostic(c, 'max-distance', { maxDistance: Math.round(Number(maxDistance || 0)) });
	        }
	        return false;
	      }
	      const ignoredUntil = bot.ignoredCoins.get(String(c.drop_id));
	      if (ignoredUntil) {
	        recordCoinFilterDiagnostic(c, 'ignored', { remainingMs: Math.max(0, Math.round(Number(ignoredUntil || 0) - t)) });
	        return false;
	      }
	      const blockingThreat = (activeThreats || []).find(threat => coinBlockedByThreat(self, c, threat));
	      if (blockingThreat) {
	        recordCoinFilterDiagnostic(c, 'threat-blocked', { threat: coinThreatDiagnostics(blockingThreat) });
	        return false;
	      }
	      return true;
	    })
	      .sort(compareCoinOpportunity);
	  }

	  function pickRealtimeLocalCoin(self, coins, activeThreats) {
	    const radius = snapshotCoinLocalSuppressRadius();
	    if (!(radius > 0)) return null;
	    return safeCoinCandidates((coins || []).filter(coin => !isSnapshotOnlyCoin(coin)), activeThreats, radius, self)
	      .filter(coin => coinStaminaAffordableWithDiagnostic(self, coin))[0] || null;
	  }

	  function nearestRealtimeCoinWithin(self, allCoins, activeThreats, maxDistance) {
	    if (!(Number(maxDistance) > 0)) return null;
	    return safeCoinCandidates((allCoins || []).filter(coin => !isSnapshotOnlyCoin(coin)), activeThreats, maxDistance, self)
	      .filter(coin => Number(coin.amount || 0) > 0)
	      .filter(coin => coinStaminaAffordableWithDiagnostic(self, coin))
	      .sort((a, b) => Number(a.distance || Infinity) - Number(b.distance || Infinity)
	        || Number(b.amount || 0) - Number(a.amount || 0))[0] || null;
	  }

	  function fieldMigrationBlockedByNearbyCoin(self, allCoins, activeThreats, fieldCoin = null) {
	    const blockDistance = Math.max(0, Number(cfg.fieldMigrationNearbyCoinBlockDistance || 0));
	    if (!(blockDistance > 0)) return false;
	    const nearby = nearestRealtimeCoinWithin(self, allCoins, activeThreats, blockDistance);
	    if (!nearby) return false;
	    if (fieldCoin) {
	      const nearbyId = nearby.drop_id ?? nearby.id;
	      const fieldId = fieldCoin.drop_id ?? fieldCoin.id;
	      if (nearbyId !== undefined && fieldId !== undefined && String(nearbyId) === String(fieldId)) return false;
	      const nearbyDistance = Number(nearby.distance ?? dist(self, nearby));
	      const fieldDistance = Number(fieldCoin.distance ?? dist(self, fieldCoin));
	      if (Number.isFinite(nearbyDistance) && Number.isFinite(fieldDistance) && nearbyDistance >= fieldDistance) return false;
	    }
	    return true;
	  }

	  function pickCoin(self, coins, activeThreats, maxDistance) {
	    const candidates = safeCoinCandidates(coins, activeThreats, maxDistance, self);
    if (!candidates.length) return null;
    if (bot.lastTarget?.kind === 'coin' && now() - bot.lastTargetAt < cfg.coinStickMs) {
      const sticky = candidates.find(c => String(c.drop_id) === String(bot.lastTarget.id));
      if (sticky) return sticky;
    }
    return candidates[0];
  }

	  function pickCoinField(self, allCoins, activeThreats) {
	    const candidates = safeCoinCandidates(allCoins, activeThreats, cfg.fieldMigrationMaxDistance, self)
      .filter(c => c.distance >= cfg.fieldMigrationMinDistance)
      .filter(c => coinStaminaAffordableWithDiagnostic(self, c));
    if (!candidates.length) return null;
    const buildFieldItem = coin => {
      const members = candidates.filter(other => dist(coin, other) <= cfg.fieldMigrationClusterRadius);
      if (members.length < cfg.fieldMigrationMinCoins) return null;
      const totalAmount = members.reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const staminaCost = opportunityCoinStaminaCost(coin);
      const score = opportunityValueScoreCore(totalAmount, staminaCost, {
        weight: cfg.coinOpportunityValue,
        distanceFloor: cfg.opportunityDistanceFloor,
        distanceScoreScale: cfg.opportunityDistanceScoreScale
      });
      return {
        ...coin,
        fieldMigration: true,
        fieldMembers: members.length,
        fieldAmount: totalAmount,
        fieldScore: score,
        opportunityScore: score,
        opportunityStaminaCost: staminaCost
      };
    };
    const current = bot.opportunityChoice;
    if (current?.key && current.reason === 'migrate-to-known-field' && now() < Number(current.until || 0)) {
      const heldCoin = candidates.find(c => String(c.drop_id) === String(current.id));
      const held = heldCoin ? buildFieldItem(heldCoin) : null;
      if (held && !fieldMigrationBlockedByNearbyCoin(self, allCoins, activeThreats, held)) return held;
    }
    let best = null;
    for (const coin of candidates.slice(0, 80)) {
      const item = buildFieldItem(coin);
      if (!item) continue;
      if (!best || item.fieldScore > best.fieldScore) best = item;
    }
    if (best && fieldMigrationBlockedByNearbyCoin(self, allCoins, activeThreats, best)) return null;
    return best;
  }

  function pickDistantCoin(self, allCoins, activeThreats) {
	    const candidates = safeCoinCandidates(allCoins, activeThreats, cfg.distantCoinMaxDistance, self)
      .filter(c => c.distance >= cfg.distantCoinMinDistance)
      .filter(c => coinStaminaAffordableWithDiagnostic(self, c));
    if (!candidates.length) return null;
    return candidates[0];
  }



  function highValueCoinPriorityAmount() {
    const value = Number(cfg.highValueCoinPriorityAmount ?? OPPORTUNITY_CONSTANTS.HIGH_VALUE_COIN_PRIORITY_AMOUNT);
    return Math.max(1, Number.isFinite(value) ? value : OPPORTUNITY_CONSTANTS.HIGH_VALUE_COIN_PRIORITY_AMOUNT);
  }

  function highValueCoinPriorityHealthyHp() {
    const value = Number(cfg.highValueCoinPriorityHealthyHp ?? cfg.combatLowHpLeaveThreshold ?? OPPORTUNITY_CONSTANTS.HIGH_VALUE_COIN_PRIORITY_HEALTHY_HP);
    return Math.max(1, Number.isFinite(value) ? value : OPPORTUNITY_CONSTANTS.HIGH_VALUE_COIN_PRIORITY_HEALTHY_HP);
  }

  function pickHighValueVisibleCoin(self, coins, activeThreats, options = {}) {
    const minAmount = highValueCoinPriorityAmount();
    const maxDistance = Math.max(0, Number(cfg.globalCoinMaxDistance || cfg.opportunityVisibleDistance || cfg.coinMaxDistance || 0));
    const threats = options.ignoreThreats ? [] : activeThreats;
    return safeCoinCandidates((coins || []).filter(coin => !isSnapshotOnlyCoin(coin)), threats, maxDistance, self)
      .filter(coin => Number(coin.amount || 0) >= minAmount)
      .filter(coin => coinStaminaAffordableWithDiagnostic(self, coin))[0] || null;
  }

  function nearbyThreatBlocksLowHpHighValueCoin(threat, incomingOwnerId = null, unknownIncoming = false) {
    if (!threat || isWhitelistedTarget(threat)) return false;
    const distance = Number(threat.distance ?? Infinity);
    const radius = Math.max(
      Number(cfg.combatAttackRange || 0),
      Number(threat.cautionRadius || 0) + Number(cfg.activeCautionExitMargin || 0),
      isInvulnerable(threat) ? Number(cfg.activeAvoidMaxDistance || cfg.activeCautionRadius || 0) : 0
    );
    if (!Number.isFinite(distance) || distance > radius) return false;
    if (isInvulnerable(threat)) return false;
    if (isLowValueActiveCombatTarget(threat)) return lowValueActiveThreatensSelf(threat, incomingOwnerId, unknownIncoming);
    return hasCombatActivitySignal(threat) || isCurrentlyActive(threat) || isFiringEntity(threat);
  }

  function canPrioritizeHighValueVisibleCoin(self, coin, context = {}) {
    if (!coin) return false;
    const hp = hpValue(self);
    const healthyHp = highValueCoinPriorityHealthyHp();
    if (hp >= healthyHp) return true;
    const incoming = incomingBulletThreat(self, null, context.bullets || []);
    if (incoming) return false;
    if (context.engagedCombatTarget || context.defensiveCombatTarget) return false;
    const incomingOwnerId = incoming?.ownerId;
    const unknownIncoming = Boolean(incoming && (incomingOwnerId === null || incomingOwnerId === undefined));
    return !(context.activeThreats || []).some(threat => nearbyThreatBlocksLowHpHighValueCoin(threat, incomingOwnerId, unknownIncoming));
  }

  function highValueVisibleCoinPriorityNeeded(self, context = {}) {
    if (context.recovery || context.engagedCombatTarget || context.defensiveCombatTarget) return true;
    if ((context.avoidanceThreats || []).length) return true;
    const incoming = incomingBulletThreat(self, null, context.bullets || []);
    if (incoming) return true;
    return false;
  }

  return {
    coinMotionNumber,
    coinMotionTolerance,
    coinAxisApproachDirectionCore,
    coinPickupPrecisionPulseMsCore,
    coinAxisLockShouldHoldCore,
    coinNearApproachAxisCore,
    coinDirectionToCore,
    coinMotionMetaCore,
    directionTo,
    coinMotionCoreOptions,
    coinPickupFailureCount,
    coinPickupAttemptSlowCount,
    applyCoinApproachLockUpdate,
    coinDiagnosticsSummary,
    summarizeCoinDiagnosticsList,
    addCoinFilterDiagnostic,
    buildCoinDiagnostics,
    coinThreatDangerRadius,
    coinHeadingBlockedByInvulnerableThreat,
    coinBlockedByThreat,
    coinDiagnosticsNearDistance,
    coinDiagnosticsLimit,
    coinThreatDiagnostics,
    recordCoinFilterDiagnostic,
    coinStaminaAffordableWithDiagnostic,
    attachCoinDiagnostics,
    safeCoinCandidates,
    pickRealtimeLocalCoin,
    nearestRealtimeCoinWithin,
    fieldMigrationBlockedByNearbyCoin,
    pickCoin,
    pickCoinField,
    pickDistantCoin,
    highValueCoinPriorityAmount,
    highValueCoinPriorityHealthyHp,
    pickHighValueVisibleCoin,
    nearbyThreatBlocksLowHpHighValueCoin,
    canPrioritizeHighValueVisibleCoin,
    highValueVisibleCoinPriorityNeeded
  };
}

module.exports = {
  createProfitCoinRuntime
};
