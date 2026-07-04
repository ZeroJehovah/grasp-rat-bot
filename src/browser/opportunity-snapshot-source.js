'use strict';

function opportunitySnapshotSource(options = {}) {
  const opportunityValueScoreCall = (valueExpr, staminaExpr, weightExpr) => options.bundledRuntime
    ? `opportunityValueScoreCore(${valueExpr}, ${staminaExpr}, {
        weight: ${weightExpr},
        distanceFloor: cfg.opportunityDistanceFloor,
        distanceScoreScale: cfg.opportunityDistanceScoreScale
      })`
    : `opportunityValueScore(${valueExpr}, ${staminaExpr}, ${weightExpr})`;
  const snapshotCoinWorthLongTravelCall = (coinExpr, membersExpr, totalExpr) => options.bundledRuntime
    ? `snapshotCoinWorthLongTravelCore(${coinExpr}, ${membersExpr}, ${totalExpr}, coinTargetCoreOptions())`
    : `snapshotCoinWorthLongTravel(${coinExpr}, ${membersExpr}, ${totalExpr})`;
  const localSnapshotCoinWrapperSource = options.bundledRuntime ? '' : String.raw`
  function snapshotCoinWorthLongTravel(coin, members = 1, totalAmount = null) {
    return snapshotCoinWorthLongTravelCore(coin, members, totalAmount, coinTargetCoreOptions());
  }

	  function snapshotCoinNavigationReason(coin) {
	    return snapshotCoinNavigationReasonCore(coin, coinTargetCoreOptions());
  }

`;
  return String.raw`	  function snapshotCoinAgeMs() {
	    return bot.globalState.snapshotRefreshedAt ? Math.max(0, Date.now() - Number(bot.globalState.snapshotRefreshedAt || 0)) : Infinity;
	  }

	  function isSnapshotCoinWaitAction(action) {
	    const reason = String(action?.reason || '');
	    return reason === 'wait-for-snapshot-coin'
	      || reason === 'wait-for-stamina-budget'
	      || reason === 'snapshot-coin-idle-timeout';
	  }

	  function pickSnapshotCoinDestination(self, allCoins, activeThreats, options = {}) {
	    const allowIdleFallback = Boolean(options.allowIdleFallback || options.idleFallback);
	    const ageMs = snapshotCoinAgeMs();
	    if (ageMs > cfg.snapshotCoinStaleMs) return null;
		    const candidates = safeCoinCandidates((allCoins || []).filter(isSnapshotOnlyCoin), activeThreats, cfg.snapshotCoinMaxDistance, self);
	    if (!candidates.length) return null;
	    const buildSnapshotItem = coin => {
	      const members = candidates.filter(other => dist(coin, other) <= Number(cfg.snapshotCoinClusterRadius || cfg.fieldMigrationClusterRadius));
	      const totalAmount = members.reduce((sum, item) => sum + Number(item.amount || 0), 0);
	      const staminaCost = opportunityCoinStaminaCost(coin);
	      const score = ${opportunityValueScoreCall('totalAmount', 'staminaCost', 'cfg.coinOpportunityValue')};
	      return {
	        ...coin,
	        snapshotMembers: members.length,
	        snapshotAmount: totalAmount,
	        snapshotScore: score,
	        opportunityStaminaCost: staminaCost,
	        snapshotAgeMs: ageMs
	      };
	    };
	    const asOpportunity = item => ({ ...item, opportunityScore: item.snapshotScore });
	    const asIdleFallback = item => ({ ...asOpportunity(item), snapshotIdleFallback: true });
	    let stickyFallback = null;
	    if (bot.lastTarget?.kind === 'coin' && now() - bot.lastTargetAt < cfg.coinStickMs) {
	      const sticky = candidates.find(c => String(c.drop_id) === String(bot.lastTarget.id));
	      if (sticky) {
	        const stickyItem = buildSnapshotItem(sticky);
	        if (coinStaminaAffordableWithDiagnostic(self, sticky, stickyItem.opportunityStaminaCost)
	          && ${snapshotCoinWorthLongTravelCall('sticky', 'stickyItem.snapshotMembers', 'stickyItem.snapshotAmount')}) return asOpportunity(stickyItem);
	        if (allowIdleFallback) stickyFallback = stickyItem;
	      }
	    }
	    let best = null;
	    let idleBest = stickyFallback;
	    const radius = Number(cfg.snapshotCoinClusterRadius || cfg.fieldMigrationClusterRadius);
	    const minCoins = Math.max(1, Number(cfg.snapshotCoinClusterMinCoins || 1));
	    for (const coin of candidates.slice(0, 300)) {
	      const members = candidates.filter(other => dist(coin, other) <= radius);
	      const totalAmount = members.reduce((sum, item) => sum + Number(item.amount || 0), 0);
	      const staminaCost = opportunityCoinStaminaCost(coin);
	      const score = ${opportunityValueScoreCall('totalAmount', 'staminaCost', 'cfg.coinOpportunityValue')};
	      const item = {
	        ...coin,
        snapshotMembers: members.length,
        snapshotAmount: totalAmount,
        snapshotScore: score,
	        opportunityStaminaCost: staminaCost,
	        snapshotAgeMs: ageMs
	      };
	      const affordable = coinStaminaAffordableWithDiagnostic(self, coin, staminaCost);
	      if (affordable && ${snapshotCoinWorthLongTravelCall('coin', 'members.length', 'totalAmount')}) {
	        if (!best
	          || item.snapshotScore > best.snapshotScore
	          || (item.snapshotScore === best.snapshotScore && members.length >= minCoins && best.snapshotMembers < minCoins)
	          || (item.snapshotScore === best.snapshotScore && item.distance < best.distance)) best = item;
	      }
	      if (allowIdleFallback && (!idleBest
	        || item.snapshotScore > idleBest.snapshotScore
	        || (item.snapshotScore === idleBest.snapshotScore && item.distance < idleBest.distance))) {
	        idleBest = item;
	      }
	    }
	    if (best) return asOpportunity(best);
	    return idleBest ? asIdleFallback(idleBest) : null;
	  }

${localSnapshotCoinWrapperSource}

  function scoreCoinOpportunity(coin) {
    const override = Number(coin?.opportunityScore ?? coin?.snapshotScore ?? coin?.fieldScore ?? NaN);
    if (Number.isFinite(override)) return override;
    const sticky = bot.lastTarget?.kind === 'coin'
      && String(bot.lastTarget.id) === String(coin.drop_id)
      && now() - bot.lastTargetAt < cfg.coinStickMs;
    return ${opportunityValueScoreCall('coin.amount', 'opportunityCoinStaminaCost(coin)', 'cfg.coinOpportunityValue')}
      + (sticky ? cfg.opportunityStickBonus : 0);
  }

  function opportunityAfkTargetId(target) {
    const id = target?.user_id ?? target?.id;
    return id === undefined || id === null || id === '' ? '' : String(id);
  }

  function targetStamina5sRemaining(target) {
    const value = Number(target?.stamina_5s_remaining_milli ?? target?.stamina5s ?? target?.stamina_5s ?? NaN);
    return Number.isFinite(value) ? value : null;
  }

  function opportunityAfkStaminaState() {
    if (!(bot.opportunityAfkStamina instanceof Map)) bot.opportunityAfkStamina = new Map();
    return bot.opportunityAfkStamina;
  }

  function opportunityAfkStaminaCooldownMs() {
    const value = Number(cfg.opportunityAfkStaminaCooldownMs ?? 60000);
    return Math.max(0, Number.isFinite(value) ? value : 60000);
  }

  function opportunityAfkStaminaDropThresholdMs() {
    const value = Number(cfg.opportunityAfkStaminaDropThresholdMs ?? 100);
    return Math.max(0, Number.isFinite(value) ? value : 100);
  }

  function updateOpportunityAfkStaminaObservations(targets, t = now()) {
    const state = opportunityAfkStaminaState();
    const cooldownMs = opportunityAfkStaminaCooldownMs();
    const dropThreshold = opportunityAfkStaminaDropThresholdMs();
    const observationGapMs = Math.max(1000, Number(cfg.activeSeenMs || 0) * 2, Number(cfg.tickMs || 0) * 8);
    for (const target of targets || []) {
      const id = opportunityAfkTargetId(target);
      if (!id) continue;
      const stamina5s = targetStamina5sRemaining(target);
      const previous = state.get(id) || {};
      const previousStamina = Number(previous.stamina5s);
      const previousSeenAt = Number(previous.lastSeenAt || 0);
      const continuous = previousSeenAt > 0 && t - previousSeenAt <= observationGapMs;
      let cooldownUntil = Math.max(0, Number(previous.cooldownUntil || 0));
      let consumedAt = Math.max(0, Number(previous.consumedAt || 0));
      if (Number.isFinite(stamina5s) && continuous && Number.isFinite(previousStamina) && stamina5s + dropThreshold < previousStamina) {
        cooldownUntil = Math.max(cooldownUntil, t + cooldownMs);
        consumedAt = t;
      }
      state.set(id, {
        stamina5s: Number.isFinite(stamina5s) ? stamina5s : (Number.isFinite(previousStamina) ? previousStamina : null),
        lastSeenAt: t,
        cooldownUntil,
        consumedAt
      });
    }
    const ttlMs = Math.max(300000, cooldownMs * 5);
    for (const [id, item] of state.entries()) {
      const lastSeenAt = Number(item?.lastSeenAt || 0);
      const cooldownUntil = Number(item?.cooldownUntil || 0);
      if (cooldownUntil <= t && lastSeenAt > 0 && t - lastSeenAt > ttlMs) state.delete(id);
    }
  }

  function opportunityAfkStaminaCooldownRemaining(target, t = now()) {
    const id = opportunityAfkTargetId(target);
    if (!id) return 0;
    const item = opportunityAfkStaminaState().get(id);
    return Math.max(0, Math.round(Number(item?.cooldownUntil || 0) - t));
  }

  function afkOpportunityBlockedByStaminaCooldown(target, t = now()) {
    if (!isAfkProfitTarget(target)) return false;
    const distance = Number(target?.distance ?? Infinity);
    if (Number.isFinite(distance) && distance <= Number(cfg.attackRange || 0)) return false;
    return opportunityAfkStaminaCooldownRemaining(target, t) > 0;
  }

  function scoreEnemyOpportunity(target) {
    if (isWhitelistedTarget(target)) return null;
    const afk = isAfkProfitTarget(target);
    const inRange = Number(target.distance || Infinity) <= (afk ? cfg.attackRange : cfg.attackEngageRange);
    if (afk && !inRange && afkOpportunityBlockedByStaminaCooldown(target)) return null;
    if (!afk && !inRange && Number(target.drop || 0) < cfg.attackApproachMinDrop) return null;
    const sticky = bot.lastTarget?.kind === 'enemy'
      && String(bot.lastTarget.id) === String(target.user_id)
      && now() - bot.lastTargetAt < cfg.targetStickMs;
    return ${opportunityValueScoreCall('target.drop', 'opportunityEnemyStaminaCost(target)', 'afk ? cfg.coinOpportunityValue : cfg.dropOpportunityValue')} + (sticky ? cfg.opportunityStickBonus : 0);
  }
`;
}

module.exports = { opportunitySnapshotSource };
