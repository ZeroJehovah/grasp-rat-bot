'use strict';

const {
  dailyStaminaBudgetIsLimitingCore,
  summarizeBlockedStaminaOpportunityCore,
  summarizeNearestCoinStaminaBudgetExitCore,
  pickNearestDailyStaminaFinalCoinCore
} = require('./runtime/stamina-budget');

function opportunityStaminaSource() {
  return String.raw`  function opportunityEffectiveStaminaCost(staminaCost) {
    return opportunityEffectiveStaminaCostCore(staminaCost, {
      distanceFloor: cfg.opportunityDistanceFloor
    });
  }

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

	  ${dailyStaminaBudgetIsLimitingCore.toString()}
	  ${summarizeBlockedStaminaOpportunityCore.toString()}
	  ${summarizeNearestCoinStaminaBudgetExitCore.toString()}
	  ${pickNearestDailyStaminaFinalCoinCore.toString()}

	  function dailyStaminaBudgetIsLimiting(self, staminaCost = 0) {
	    return dailyStaminaBudgetIsLimitingCore(
	      staminaCost,
	      opportunityWindowStaminaBudget(self, '1h'),
	      opportunityWindowStaminaBudget(self, '1d')
	    );
	  }

  function opportunityStaminaAffordable(self, staminaCost) {
    const cost = Number(staminaCost);
    if (!Number.isFinite(cost) || cost <= 0) return true;
    const budget = opportunityLongStaminaBudget(self);
    return !Number.isFinite(budget) || cost <= budget;
  }

	  function summarizeBlockedStaminaOpportunity(self, coins, targets = []) {
	    return summarizeBlockedStaminaOpportunityCore(coins, targets, {
	      budget: opportunityLongStaminaBudget(self),
	      coinStaminaCost: opportunityCoinStaminaCost,
	      enemyStaminaCost: opportunityEnemyStaminaCost,
	      targetDrop: dropValue
	    });
	  }

	  function summarizeNearestCoinStaminaBudgetExit(self, coins) {
	    return summarizeNearestCoinStaminaBudgetExitCore(self, coins, {
	      budget: opportunityWindowStaminaBudget(self, '1h'),
	      dist,
	      coinStaminaCost: opportunityCoinStaminaCost,
	      reloginDelayMs: staminaBudgetReloginDelayMs()
	    });
	  }

	  function pickNearestDailyStaminaFinalCoin(self, coins, activeThreats) {
	    return pickNearestDailyStaminaFinalCoinCore(
	      safeCoinCandidates(coins, activeThreats, cfg.globalCoinMaxDistance, self),
	      {
	        isSnapshotOnlyCoin,
	        coinStaminaCost: opportunityCoinStaminaCost,
	        dailyStaminaBudgetIsLimiting: staminaCost => dailyStaminaBudgetIsLimiting(self, staminaCost)
	      }
	    );
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

  function opportunityValueScore(value, staminaCost, weight = cfg.coinOpportunityValue) {
    return opportunityValueScoreCore(value, staminaCost, {
      weight,
      distanceFloor: cfg.opportunityDistanceFloor,
      distanceScoreScale: cfg.opportunityDistanceScoreScale
    });
  }

	  function compareCoinOpportunity(a, b) {
	    const scoreDiff = scoreCoinOpportunity(b) - scoreCoinOpportunity(a);
	    if (scoreDiff) return scoreDiff;
	    const amountDiff = Number(b.amount || 0) - Number(a.amount || 0);
	    if (amountDiff) return amountDiff;
	    return Number(a.distance || 0) - Number(b.distance || 0);
	  }

	  function mergeCoinRouteDisplay(base, routeCoin) {
	    return mergeCoinRouteDisplayCore(base, routeCoin);
	  }
`;
}

module.exports = { opportunityStaminaSource };
