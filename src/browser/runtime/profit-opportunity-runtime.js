'use strict';

function createProfitOpportunityRuntime(runtime = {}) {
  const {
    bot,
    cfg,
    formatDistance = value => String(value),
    formatDurationMs = value => String(value),
    now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
    dist = () => Infinity,
    staminaRemaining = () => NaN,
    staminaExhaustedThreshold = () => 0,
    staminaBudgetReloginDelayMs = () => 0,
    isSnapshotOnlyCoin = () => false,
    normalizeCoinDrop = value => value,
    getNativeCoinSources = () => null,
    isAfkProfitTarget = () => false,
    isWhitelistedTarget = () => false,
    isFullHp = () => true,
    combatHpValue = () => 100,
    pickCombatTarget = () => null,
    safeCoinCandidates = () => [],
    coinStaminaAffordableWithDiagnostic = () => true,
    recordCoinFilterDiagnostic = () => {},
    coinThreatDangerRadius = () => 0,
    coinBlockedByThreat = () => false,
    highValueCoinPriorityAmount = () => 1,
    buildCoinAction = () => null,
    coinTargetCoreOptions = () => ({}),
    coinMatchesTrackedTargetCore = () => false,
    snapshotCoinWorthLongTravelCore = () => false,
    snapshotCoinNavigationReasonCore = () => ''
  } = runtime;

const {
  dailyStaminaBudgetIsLimitingCore,
  summarizeBlockedStaminaOpportunityCore,
  summarizeNearestCoinStaminaBudgetExitCore,
  pickNearestDailyStaminaFinalCoinCore
} = require('./stamina-budget');

  function opportunityMoveStaminaCost(distance, stopDistance = 0) {
    const travel = Math.max(0, Number(distance || 0) - Math.max(0, Number(stopDistance || 0)));
    return travel * Math.max(0, Number(cfg.opportunityMoveStaminaPerCm ?? 1));
  }

  function opportunityCoinStaminaCost(coin) {
    const override = Number(coin?.opportunityStaminaCost ?? coin?.staminaCost ?? NaN);
    if (Number.isFinite(override) && override >= 0) return override;
    return opportunityMoveStaminaCost(coin?.distance, 0)
      + Math.max(0, Number(cfg.opportunityCoinPickupStaminaMs || 0));
  }

  function estimatedKillShots(target) {
    const damage = Math.max(0.1, Number(cfg.opportunityEstimatedDamagePerShot || 3));
    const hp = Math.max(1, Number(combatHpValue(target) || 100));
    return Math.max(1, Math.ceil(hp / damage));
  }

  function opportunityEnemyStaminaCost(target) {
    const moveCost = opportunityMoveStaminaCost(target?.distance, 0);
    const shotCost = estimatedKillShots(target) * Math.max(0, Number(cfg.opportunityShotStaminaCostMs || 500));
    return moveCost + shotCost;
  }

	  function opportunityWindowStaminaBudget(self, windowName) {
	    const remaining = staminaRemaining(self, windowName);
	    if (!Number.isFinite(remaining)) return Infinity;
	    const reserve = staminaExhaustedThreshold() + Math.max(0, Number(cfg.opportunityLongStaminaReserveMs || 0));
	    return Math.max(0, remaining - reserve);
	  }

	  function opportunityLongStaminaBudget(self) {
	    const values = ['1h', '1d']
	      .map(key => opportunityWindowStaminaBudget(self, key))
	      .filter(value => Number.isFinite(value));
	    if (!values.length) return Infinity;
	    return Math.min(...values);
	  }

  function opportunityStaminaAffordable(self, staminaCost) {
    const cost = Number(staminaCost);
    if (!Number.isFinite(cost) || cost <= 0) return true;
    const budget = opportunityLongStaminaBudget(self);
    return !Number.isFinite(budget) || cost <= budget;
  }

	  function dailyStaminaFinalCoinAction(self, coin) {
	    if (!coin) return null;
	    const action = buildCoinAction(
	      self,
	      coin,
	      'daily-stamina-final-visible-coin',
	      coin.distance <= cfg.coinMaxDistance ? 'coin' : 'seek-coin'
	    );
	    return {
	      ...action,
	      dailyStaminaFinalRun: {
	        staminaCost: Math.round(opportunityCoinStaminaCost(coin)),
	        budgetMs: Math.max(0, Math.round(opportunityWindowStaminaBudget(self, '1d'))),
	        distance: Math.round(Number(coin.distance || 0)),
	        amount: Math.max(0, Math.round(Number(coin.amount || 0)))
	      }
	    };
	  }

	  function staminaBudgetCoinLeaveSummary(staminaBudgetExit) {
	    const detail = staminaBudgetExit || {};
	    return '一小时体力预算不足，最近金币距离' + formatDistance(detail.distance)
	      + '，预算' + formatDurationMs(detail.budgetMs)
	      + '，需要' + formatDurationMs(detail.requiredMs)
	      + '，差' + formatDurationMs(detail.shortageMs)
	      + '，退出等待重连';
	  }

	  function staminaBudgetCoinLeaveDisplay(staminaBudgetExit) {
	    return staminaBudgetCoinLeaveSummary(staminaBudgetExit)
	      + '，等待' + formatDurationMs(staminaBudgetExit?.reloginDelayMs || staminaBudgetReloginDelayMs());
	  }

	  function staminaBudgetCoinLeaveAction(staminaBudgetExit) {
	    return {
	      kind: 'leave',
	      reason: 'stamina-budget-coin-leave',
	      dx: 0,
	      dy: 0,
	      offline: true,
	      ignoreReturnBlock: true,
	      displayReason: staminaBudgetCoinLeaveDisplay(staminaBudgetExit),
	      staminaBudgetExit,
	      reloginDelayMs: staminaBudgetExit?.reloginDelayMs || staminaBudgetReloginDelayMs()
	    };
	  }

	  function compareCoinOpportunity(a, b) {
	    const scoreDiff = scoreCoinOpportunity(b) - scoreCoinOpportunity(a);
	    if (scoreDiff) return scoreDiff;
	    const amountDiff = Number(b.amount || 0) - Number(a.amount || 0);
	    if (amountDiff) return amountDiff;
	    return Number(a.distance || 0) - Number(b.distance || 0);
	  }

	  function snapshotCoinAgeMs() {
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
	      const score = opportunityValueScoreCore(totalAmount, staminaCost, {
        weight: cfg.coinOpportunityValue,
        distanceFloor: cfg.opportunityDistanceFloor,
        distanceScoreScale: cfg.opportunityDistanceScoreScale
      });
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
	          && snapshotCoinWorthLongTravelCore(sticky, stickyItem.snapshotMembers, stickyItem.snapshotAmount, coinTargetCoreOptions())) return asOpportunity(stickyItem);
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
	      const score = opportunityValueScoreCore(totalAmount, staminaCost, {
        weight: cfg.coinOpportunityValue,
        distanceFloor: cfg.opportunityDistanceFloor,
        distanceScoreScale: cfg.opportunityDistanceScoreScale
      });
	      const item = {
	        ...coin,
        snapshotMembers: members.length,
        snapshotAmount: totalAmount,
        snapshotScore: score,
	        opportunityStaminaCost: staminaCost,
	        snapshotAgeMs: ageMs
	      };
	      const affordable = coinStaminaAffordableWithDiagnostic(self, coin, staminaCost);
	      if (affordable && snapshotCoinWorthLongTravelCore(coin, members.length, totalAmount, coinTargetCoreOptions())) {
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

  function scoreCoinOpportunity(coin) {
    const override = Number(coin?.opportunityScore ?? coin?.snapshotScore ?? coin?.fieldScore ?? NaN);
    if (Number.isFinite(override)) return override;
    const sticky = bot.lastTarget?.kind === 'coin'
      && String(bot.lastTarget.id) === String(coin.drop_id)
      && now() - bot.lastTargetAt < cfg.coinStickMs;
    return opportunityValueScoreCore(coin.amount, opportunityCoinStaminaCost(coin), {
        weight: cfg.coinOpportunityValue,
        distanceFloor: cfg.opportunityDistanceFloor,
        distanceScoreScale: cfg.opportunityDistanceScoreScale
      })
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
    return opportunityValueScoreCore(target.drop, opportunityEnemyStaminaCost(target), {
        weight: afk ? cfg.coinOpportunityValue : cfg.dropOpportunityValue,
        distanceFloor: cfg.opportunityDistanceFloor,
        distanceScoreScale: cfg.opportunityDistanceScoreScale
      }) + (sticky ? cfg.opportunityStickBonus : 0);
  }


const {
  opportunityEffectiveStaminaCostCore,
  opportunityValueScoreCore,
  opportunityPriorityTierCore,
  mergeCoinRouteDisplayCore,
  uniqueVisibleRouteCoinsCore,
  buildCoinOpportunityCandidatesCore,
  buildEnemyOpportunityCandidatesCore,
  buildOpportunityCandidatesCore,
  bestCoinOpportunityScoreCore
} = require('./opportunity-candidates');

  function opportunityPriorityTier(item) {
    return opportunityPriorityTierCore(item, {
      visibleDistance: cfg.opportunityVisibleDistance,
      nearbyPriorityDistance: cfg.opportunityNearbyPriorityDistance
    });
  }

const {
  defaultDist,
  coinRouteKey,
  coinRouteIdsFrom,
  coinRouteLegStaminaCostCore,
  coinRouteLegClearCore,
  coinRoutePointLimitCore,
  coinRouteSummaryCore,
  coinRoutePoints,
  coinRouteActionMetaCore,
  buildCoinRouteFromAnchorCore,
  coinRouteSkipsCloserFirstCoinCore,
  coinRouteSkipsHeldSingleCoinCore,
  coinRouteMatchesHeldChoiceCore,
  heldCoinRouteBeatsSwitchCore,
  pickCoinRouteOpportunityCore
} = require('./coin-route');

	  function coinRouteCoreOptions(self = null) {
	    return {
	      dist,
	      moveStaminaCost: opportunityMoveStaminaCost,
	      pickupStaminaMs: cfg.opportunityCoinPickupStaminaMs,
	      sampleDistance: cfg.coinRouteLegSampleDistance,
	      threatDangerRadius: coinThreatDangerRadius,
	      coinBlockedByThreat,
	      clusterRadius: cfg.coinRouteClusterRadius,
	      maxPointsDense: cfg.coinRouteMaxPointsDense,
	      maxPointsMid: cfg.coinRouteMaxPointsMid,
	      maxPointsSparse: cfg.coinRouteMaxPointsSparse,
	      linkDistance: cfg.coinRouteLinkDistance,
	      maxLinkDistance: cfg.coinRouteMaxLinkDistance,
	      coinOpportunityValue: cfg.coinOpportunityValue,
	      valueScore: (value, staminaCost, weight = cfg.coinOpportunityValue) => opportunityValueScoreCore(value, staminaCost, {
	        weight,
	        distanceFloor: cfg.opportunityDistanceFloor,
	        distanceScoreScale: cfg.opportunityDistanceScoreScale
	      }),
	      staminaAffordable: staminaCost => opportunityStaminaAffordable(self, staminaCost),
	      recordDiagnostic: (coin, reason, detail) => recordCoinFilterDiagnostic(coin, reason, detail),
	      nearbyFirstCoinDistance: cfg.coinRouteNearbyFirstCoinDistance,
	      firstCoinDistanceRatio: cfg.coinRouteFirstCoinDistanceRatio,
	      firstCoinDistanceSlack: cfg.coinRouteFirstCoinDistanceSlack,
	      choiceType: opportunityChoiceType,
	      choiceId: opportunityChoiceId,
	      heldMinOverlap: cfg.coinRouteHeldMinOverlap,
	      switchMargin: cfg.coinRouteSwitchMargin,
	      opportunitySwitchMargin: cfg.opportunitySwitchMargin,
	      switchRelativeMargin: cfg.coinRouteSwitchRelativeMargin,
	      opportunitySwitchRelativeMargin: cfg.opportunitySwitchRelativeMargin,
	      maxDistance: Math.max(0, Number(cfg.coinRouteMaxDistance || cfg.globalCoinMaxDistance || 0)),
	      poolLimit: cfg.coinRoutePoolLimit,
	      anchorLimit: cfg.coinRouteAnchorLimit,
	      safeCoinCandidates,
	      isSnapshotOnlyCoin
	    };
	  }

  function currentHeldCoinRouteChoice(t = now()) {
    const choice = bot.opportunityChoice;
    if (!choice || opportunityChoiceType(choice) !== 'coin') return null;
    if (t >= Number(choice.until || 0)) return null;
    const id = opportunityChoiceId(choice);
    if (!id && id !== '0') return null;
    if (String(choice.reason || '') !== 'best-opportunity-coin-route' && !coinRouteIdsFrom(choice).length) return null;
    return choice;
  }

  function currentHeldCoinChoice(t = now()) {
    const choice = bot.opportunityChoice;
    if (!choice || opportunityChoiceType(choice) !== 'coin') return null;
    if (t >= Number(choice.until || 0)) return null;
    const id = opportunityChoiceId(choice);
    if (!id && id !== '0') return null;
    return choice;
  }
	  function opportunityCandidateCoreOptions(self = null) {
	    return {
	      safeCoinCandidates,
	      coinStaminaCost: opportunityCoinStaminaCost,
	      coinStaminaAffordable: (coin, staminaCost = opportunityCoinStaminaCost(coin)) => coinStaminaAffordableWithDiagnostic(self, coin, staminaCost),
	      scoreCoinOpportunity,
	      snapshotCoinNavigationReason: coin => snapshotCoinNavigationReasonCore(coin, coinTargetCoreOptions()),
	      maxCoinDistance: cfg.coinMaxDistance,
	      routeMaxDistance: cfg.coinRouteMaxDistance,
	      scoreEnemyOpportunity,
	      enemyStaminaCost: opportunityEnemyStaminaCost,
	      opportunityStaminaAffordable: staminaCost => opportunityStaminaAffordable(self, staminaCost),
	      isAfkProfitTarget,
	      attackRange: cfg.attackRange,
	      attackEngageRange: cfg.attackEngageRange,
	      priorityTier: opportunityPriorityTier,
	      visibleDistance: cfg.opportunityVisibleDistance,
	      nearbyPriorityDistance: cfg.opportunityNearbyPriorityDistance
	    };
	  }

  function pickProfitableCombatTarget(self, combatTargets, bullets, coinGroups, activeThreats) {
    if (!isFullHp(self)) return null;
    const target = pickCombatTarget(self, combatTargets, bullets, { mode: 'profit' });
    if (!target) return null;
    const targetScore = scoreEnemyOpportunity(target);
    if (targetScore === null) return null;
    if (!opportunityStaminaAffordable(self, opportunityEnemyStaminaCost(target))) return null;
    const coinScore = (() => {
      const route = pickCoinRouteOpportunityCore(self, uniqueVisibleRouteCoinsCore(coinGroups, { isSnapshotOnlyCoin, coinKey: coinRouteKey }), activeThreats, {
      ...coinRouteCoreOptions(self),
      heldChoice: currentHeldCoinChoice(),
      heldRouteChoice: currentHeldCoinRouteChoice()
    });
      return bestCoinOpportunityScoreCore(self, coinGroups, activeThreats, route, opportunityCandidateCoreOptions(self));
    })();
    if (targetScore < coinScore) return null;
    return {
      ...target,
      combatIntent: 'profit',
      combatOpportunityScore: Math.round(targetScore),
      competingCoinScore: Number.isFinite(coinScore) ? Math.round(coinScore) : null
    };
  }

const {
  opportunityKey,
  opportunityChoiceType,
  opportunityChoiceId,
  opportunityChoiceKey,
  opportunityPairKey,
  opportunityByKey,
  opportunityMatchesChoiceCore,
  isHighValueCoinOpportunityCore,
  highValueCoinHoldBlocksEnemySwitchCore,
  lockedOpportunityChoiceCore,
  applyOpportunityOscillationLockCore,
  chooseStableOpportunityCore,
  opportunityMissingHoldUntilCore,
  missingHeldCoinCoveredByVisibleAuthorityCore,
  buildMissingHeldOpportunityCore,
  opportunityRouteIds,
  rememberOpportunityChoiceCore
} = require('./opportunity-choice');

			  function opportunityChoiceCoreOptions(extra = {}) {
			    return {
			      dist,
			      sameCoinRadius: opportunitySameCoinRadius(),
			      highValueCoinPriorityAmount: highValueCoinPriorityAmount(),
			      switchMargin: cfg.opportunitySwitchMargin,
			      switchRelativeMargin: cfg.opportunitySwitchRelativeMargin,
			      switchHoldMs: cfg.opportunitySwitchHoldMs,
			      oscillationSwitchLimit: cfg.opportunityOscillationSwitchLimit,
			      nowMs: now(),
			      ...extra
			    };
			  }

		  function resetOpportunitySwitchLock() {
		    bot.opportunitySwitchLock = null;
		  }

		  function opportunitySameCoinRadius() {
		    return Math.max(0, Number(cfg.opportunitySameCoinRadius || cfg.coinCollectedPruneRadius || 900));
		  }

			  function currentVisibleCoinListForMissingHold() {
			    if (typeof getNativeCoinSources !== 'function') return null;
			    let sources = [];
			    try {
			      sources = getNativeCoinSources();
			    } catch (_) {
			      return null;
			    }
			    if (!Array.isArray(sources) || !sources.length) return null;
			    const visibleSources = sources.filter(source => {
			      if (!source || !Array.isArray(source.list)) return false;
			      const label = String(source.label || '').toLowerCase();
			      return !label.includes('snapshot');
			    });
			    if (!visibleSources.length) return null;
			    const coins = [];
			    for (const source of visibleSources) {
			      for (const raw of source.list) {
			        const coin = normalizeCoinDrop(raw, 'native');
			        if (coin) coins.push(coin);
			      }
			    }
			    return coins;
			  }

			  function visibleCoinSourcesConfirmTargetMissing(target) {
			    const visibleCoins = currentVisibleCoinListForMissingHold();
			    if (!Array.isArray(visibleCoins)) return false;
			    return !visibleCoins.some(coin => coinMatchesTrackedTargetCore(coin, target, coinTargetCoreOptions()));
			  }

			  function clearMissingVisibleCoinTarget(choice, coin, reason, t) {
			    const id = opportunityChoiceId(choice);
			    const idText = id || id === '0' ? String(id) : '';
			    if (coin) recordCoinFilterDiagnostic(coin, 'visible-missing');
			    if (idText) {
			      const ignoreMs = Math.max(0, Number(cfg.coinCollectedIgnoreMs || 0));
			      if (ignoreMs > 0) bot.ignoredCoins.set(idText, t + ignoreMs);
			      bot.coinAttempts.delete(idText);
			    }
			    if (!idText || (bot.lastTarget?.kind === 'coin' && String(bot.lastTarget.id) === idText)) {
			      bot.lastTarget = null;
			      bot.lastTargetAt = 0;
			    }
			    if (!idText || (bot.coinProgress?.id && String(bot.coinProgress.id) === idText)) bot.coinProgress = null;
			    if (!idText || bot.coinApproachLock?.id === idText) bot.coinApproachLock = null;
			    if (shouldClearOpportunityChoiceCore(bot.opportunityChoice, 'coin', idText || null)) {
        bot.opportunityChoice = null;
        resetOpportunitySwitchLock();
      }
			    bot.lastCoinClearReason = reason;
			    bot.lastMissingVisibleCoin = {
			      id: idText,
			      reason,
			      amount: Number.isFinite(Number(coin?.amount)) ? Math.round(Number(coin.amount)) : null,
			      distance: Number.isFinite(Number(coin?.distance)) ? Math.round(Number(coin.distance)) : null,
			      at: Date.now()
			    };
			  }


const { pickBestOpportunityCore } = require('./opportunity-pick');

const { patrolDirectionCore } = require('./patrol');

const { shouldClearOpportunityChoiceCore } = require('./opportunity-clear');

  return {
    dailyStaminaBudgetIsLimitingCore,
    summarizeBlockedStaminaOpportunityCore,
    summarizeNearestCoinStaminaBudgetExitCore,
    pickNearestDailyStaminaFinalCoinCore,
    opportunityMoveStaminaCost,
    opportunityCoinStaminaCost,
    estimatedKillShots,
    opportunityEnemyStaminaCost,
    opportunityWindowStaminaBudget,
    opportunityLongStaminaBudget,
    opportunityStaminaAffordable,
    dailyStaminaFinalCoinAction,
    staminaBudgetCoinLeaveSummary,
    staminaBudgetCoinLeaveDisplay,
    staminaBudgetCoinLeaveAction,
    compareCoinOpportunity,
    snapshotCoinAgeMs,
    isSnapshotCoinWaitAction,
    pickSnapshotCoinDestination,
    scoreCoinOpportunity,
    opportunityAfkTargetId,
    targetStamina5sRemaining,
    opportunityAfkStaminaState,
    opportunityAfkStaminaCooldownMs,
    opportunityAfkStaminaDropThresholdMs,
    updateOpportunityAfkStaminaObservations,
    opportunityAfkStaminaCooldownRemaining,
    afkOpportunityBlockedByStaminaCooldown,
    scoreEnemyOpportunity,
    opportunityEffectiveStaminaCostCore,
    opportunityValueScoreCore,
    opportunityPriorityTierCore,
    mergeCoinRouteDisplayCore,
    uniqueVisibleRouteCoinsCore,
    buildCoinOpportunityCandidatesCore,
    buildEnemyOpportunityCandidatesCore,
    buildOpportunityCandidatesCore,
    bestCoinOpportunityScoreCore,
    opportunityPriorityTier,
    defaultDist,
    coinRouteKey,
    coinRouteIdsFrom,
    coinRouteLegStaminaCostCore,
    coinRouteLegClearCore,
    coinRoutePointLimitCore,
    coinRouteSummaryCore,
    coinRoutePoints,
    coinRouteActionMetaCore,
    buildCoinRouteFromAnchorCore,
    coinRouteSkipsCloserFirstCoinCore,
    coinRouteSkipsHeldSingleCoinCore,
    coinRouteMatchesHeldChoiceCore,
    heldCoinRouteBeatsSwitchCore,
    pickCoinRouteOpportunityCore,
    coinRouteCoreOptions,
    currentHeldCoinRouteChoice,
    currentHeldCoinChoice,
    opportunityCandidateCoreOptions,
    pickProfitableCombatTarget,
    opportunityKey,
    opportunityChoiceType,
    opportunityChoiceId,
    opportunityChoiceKey,
    opportunityPairKey,
    opportunityByKey,
    opportunityMatchesChoiceCore,
    isHighValueCoinOpportunityCore,
    highValueCoinHoldBlocksEnemySwitchCore,
    lockedOpportunityChoiceCore,
    applyOpportunityOscillationLockCore,
    chooseStableOpportunityCore,
    opportunityMissingHoldUntilCore,
    missingHeldCoinCoveredByVisibleAuthorityCore,
    buildMissingHeldOpportunityCore,
    opportunityRouteIds,
    rememberOpportunityChoiceCore,
    opportunityChoiceCoreOptions,
    resetOpportunitySwitchLock,
    opportunitySameCoinRadius,
    currentVisibleCoinListForMissingHold,
    visibleCoinSourcesConfirmTargetMissing,
    clearMissingVisibleCoinTarget,
    pickBestOpportunityCore,
    patrolDirectionCore,
    shouldClearOpportunityChoiceCore
  };
}

module.exports = {
  createProfitOpportunityRuntime
};
