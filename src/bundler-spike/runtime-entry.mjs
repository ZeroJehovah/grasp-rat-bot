'use strict';

import runtimeUtils from '../browser/runtime/runtime-utils.js';
import displayFormat from '../browser/runtime/display-format.js';
import targetWhitelist from '../browser/runtime/target-whitelist.js';
import exitSummary from '../browser/runtime/exit-summary.js';
import preservedState from '../browser/runtime/browser-preserved-state.js';
import persistentExit from '../browser/runtime/persistent-exit.js';
import persistentLastSelf from '../browser/runtime/persistent-last-self.js';
import persistentClear from '../browser/runtime/persistent-clear.js';
import pendingExitPersistence from '../browser/runtime/pending-exit-persistence.js';
import refreshExitDetail from '../browser/runtime/refresh-exit-detail.js';
import restoredCoinFailures from '../browser/runtime/restored-coin-failures.js';
import restoredRuntimeState from '../browser/runtime/restored-runtime-state.js';
import loginSnapshotGate from '../browser/runtime/login-snapshot-gate.js';
import runtimeDiagnostics from '../browser/runtime/runtime-diagnostics.js';
import exitRelogin from '../browser/runtime/exit-relogin.js';
import runtimeDefaults from '../browser/runtime/runtime-defaults.js';
import actionPriority from '../browser/runtime/action-priority.js';
import actionArbitration from '../browser/runtime/action-arbitration.js';
import actionSwitchDiagnostics from '../browser/runtime/action-switch-diagnostics.js';
import attackWorth from '../browser/runtime/attack-worth.js';
import exitMotion from '../browser/runtime/exit-motion.js';
import coinDiagnostics from '../browser/runtime/coin-diagnostics.js';
import coinMotion from '../browser/runtime/coin-motion.js';
import coinTarget from '../browser/runtime/coin-target.js';
import coinProgress from '../browser/runtime/coin-progress.js';
import coinRoute from '../browser/runtime/coin-route.js';
import opportunityChoice from '../browser/runtime/opportunity-choice.js';
import opportunityClear from '../browser/runtime/opportunity-clear.js';
import opportunityCandidates from '../browser/runtime/opportunity-candidates.js';
import opportunityPick from '../browser/runtime/opportunity-pick.js';
import patrol from '../browser/runtime/patrol.js';
import postAttackDrop from '../browser/runtime/post-attack-drop.js';
import staminaBudget from '../browser/runtime/stamina-budget.js';
import opportunityConstants from '../browser/runtime/opportunity-constants.js';
import pageAdapter from '../browser/page-global-core.js';
import arrayCountRuntime from '../browser/runtime/array-count.js';

const SPIKE_KEY = '__graspRatBundlerSpike';
const CONFIG_KEY = '__GRASP_RAT_BUNDLER_SPIKE_CONFIG__';

function normalizeConfig(value) {
  return value && typeof value === 'object' ? value : {};
}

function helperStatus(config = {}) {
  const sampleAction = {
    kind: 'coin',
    reason: 'bundler-spike',
    target: { id: 'coin-spike', x: 100, y: 200 },
    coin: { id: 'coin-spike', amount: 3 }
  };
  const nextAction = {
    kind: 'coin',
    reason: 'bundler-spike-next',
    target: { id: 'coin-spike-next', x: 300, y: 400 },
    coin: { id: 'coin-spike-next', amount: 4 }
  };
  const switchState = { lastFocus: null, lastTargetFocus: null, lastSwitch: null, events: [] };
  actionSwitchDiagnostics.recordActionSwitchDiagnosticsCore(sampleAction, switchState, { nowMs: 1000 });
  const switchResult = actionSwitchDiagnostics.recordActionSwitchDiagnosticsCore(nextAction, switchState, { nowMs: 1200 });
  const arbitrationState = { lastAction: null, lastFocus: null, lastSelectedAt: 0, lastOverride: null, history: [] };
  actionArbitration.applyFinalActionArbitrationCore(sampleAction, arbitrationState, { nowMs: 1000, holdMs: 1000 });
  const arbitrationResult = actionArbitration.applyFinalActionArbitrationCore(nextAction, arbitrationState, { nowMs: 1200, holdMs: 1000 });
  const attackWorthResult = attackWorth.attackWorthTakingCore({ drop: 2 }, { drop: 5 }, {
    isWhitelistedTarget: () => false,
    dropValue: actor => Number(actor?.drop || 0),
    isAfkProfitTarget: () => false,
    attackMinDrop: 3,
    attackMinRewardRatio: 2
  });
  const exitMotionLock = exitMotion.exitMotionStopLockRemainingMsCore(1000, 8000, 2500);
  const exitMotionDecision = exitMotion.postExitDecisionWithoutTargetCore({
    kind: 'combat',
    reason: 'previous',
    dx: 1,
    dy: -1,
    target: { id: 'enemy' },
    shoot: true
  }, '', {
    lastExitMotionStopReason: 'last-stop',
    exitMotionLockRemainingMs: exitMotionLock
  });
  const coinDiagnosticResult = coinDiagnostics.buildCoinDiagnostics({ x: 0, y: 0 }, {
    realtimeNearCoins: [{ drop_id: 'coin-spike', amount: 3, distance: 100, x: 100, y: 0, native: true }],
    realtimeCoins: [
      { drop_id: 'coin-spike', amount: 3, distance: 100, x: 100, y: 0, native: true },
      { drop_id: 'ignored-spike', amount: 1, distance: 120, x: 120, y: 0, native: true }
    ],
    realtimeGlobalCoins: [],
    realtimePatrolCoins: [],
    snapshotCoins: [{ drop_id: 'snapshot-spike', amount: 2, distance: 150, x: 150, y: 0, snapshot: true }]
  }, {
    nearDistance: 200,
    limit: 4,
    nowMs: 1000,
    ignoredCoinUntil: coin => String(coin?.drop_id || '') === 'ignored-spike' ? 1800 : 0
  });
  const coinMotionResult = coinMotion.coinDirectionToCore({ x: 0, y: 0 }, {
    drop_id: 'motion-spike',
    x: 500,
    y: 0
  }, {
    nowMs: 1000,
    tolerance: 50,
    coinAxisApproachMinDistance: 100,
    coinAxisApproachRatio: 1,
    coinAxisApproachLaneTolerance: 10,
    coinApproachLockMs: 500,
    nearCoinStuckDistance: 1000,
    coinPickupSweepDistance: 100
  });
  const coinMotionMeta = coinMotion.coinMotionMetaCore(coinMotionResult.direction);
  const coinTargetKey = coinTarget.coinTargetKeyCore({ drop_id: 'target-spike', amount: 5, x: 10, y: 20 });
  const coinTargetSnapshot = coinTarget.buildNativeCoinSnapshotCore([
    { drop_id: 'target-spike', amount: 5, x: 10, y: 20 },
    { drop_id: 'target-other', amount: 1, x: 30, y: 40 }
  ], { nowMs: 1000 });
  const coinTargetMatched = coinTarget.coinMatchesTrackedTargetCore(
    { drop_id: 'target-spike', x: 10, y: 20 },
    { id: 'target-spike', x: 10, y: 20 },
    { coinCollectedPruneRadius: 5 }
  );
  const coinProgressFailure = coinProgress.coinFailureIgnoreCore(
    { count: 1, lastAt: 900 },
    'progress',
    1000,
    {
      coinFailureDecayMs: 5000,
      coinNoProgressIgnoreMs: 400,
      coinFailureMaxIgnoreMs: 2000
    }
  );
  const coinProgressAttempt = coinProgress.updateCoinAttemptCore(null, {
    kind: 'coin',
    target: { id: 'progress-spike', amount: 2, distance: 1000, x: 50, y: 60 }
  }, 1000, {
    closeCoinStuckDistance: 100,
    nearCoinStuckDistance: 200,
    coinProgressMinGain: 50,
    coinNearStuckResetGain: 20,
    closeCoinStuckMs: 500,
    nearCoinStuckMs: 700
  });
  const coinRouteKey = coinRoute.coinRouteKey({ drop_id: 'route-spike', amount: 7, x: 100, y: 200 });
  const coinRouteMeta = coinRoute.coinRouteActionMetaCore({
    ids: ['route-spike', 'route-next'],
    points: [
      { id: 'route-spike', x: 100, y: 200, amount: 7, order: 1 },
      { id: 'route-next', x: 150, y: 250, amount: 5, order: 2 }
    ],
    value: 12,
    staminaCost: 345.6,
    legCount: 2,
    totalDistance: 789.4,
    firstDistance: 123.2,
    kind: 'short'
  });
  const opportunityChoiceResult = opportunityChoice.chooseStableOpportunityCore([
    { type: 'coin', id: 'choice-held', score: 100, priorityTier: 1, distance: 100, amount: 10, x: 10, y: 20 },
    { type: 'enemy', id: 'choice-enemy', score: 120, priorityTier: 1, distance: 80 }
  ], {
    key: 'coin:choice-held',
    type: 'coin',
    id: 'choice-held',
    amount: 10,
    x: 10,
    y: 20,
    until: 2000
  }, null, {
    nowMs: 1000,
    switchMargin: 50,
    switchRelativeMargin: 0,
    highValueCoinPriorityAmount: 10,
    sameCoinRadius: 50
  });
  const opportunityRemembered = opportunityChoice.rememberOpportunityChoiceCore(
    opportunityChoiceResult.chosen,
    { kind: 'coin', reason: 'choice-spike' },
    null,
    { nowMs: 1000, switchHoldMs: 500 }
  );
  const opportunityClearExact = opportunityClear.shouldClearOpportunityChoiceCore(
    { type: 'coin', id: 'choice-held' },
    'coin',
    'choice-held'
  );
  const opportunityClearMismatch = opportunityClear.shouldClearOpportunityChoiceCore(
    { type: 'coin', id: 'choice-held' },
    'enemy',
    'choice-held'
  );
  const opportunityCandidateList = opportunityCandidates.buildOpportunityCandidatesCore(
    { x: 0, y: 0 },
    [],
    [{
      coins: [{ drop_id: 'candidate-coin', amount: 4, distance: 200, x: 200, y: 0 }],
      maxDistance: 500
    }],
    [{ user_id: 'candidate-enemy', distance: 100, opportunityScore: 3, staminaCost: 100 }],
    null,
    {
      safeCoinCandidates: coins => coins,
      coinStaminaCost: coin => Number(coin.distance || 0),
      coinStaminaAffordable: () => true,
      scoreCoinOpportunity: coin => Number(coin.amount || 0),
      snapshotCoinNavigationReason: () => 'candidate-coin',
      maxCoinDistance: 500,
      scoreEnemyOpportunity: target => Number(target.opportunityScore || 0),
      enemyStaminaCost: target => Number(target.staminaCost || 0),
      opportunityStaminaAffordable: () => true,
      isAfkProfitTarget: () => true,
      attackRange: 150,
      attackEngageRange: 200,
      priorityTier: item => opportunityCandidates.opportunityPriorityTierCore(item, { visibleDistance: 500 })
    }
  );
  const opportunityBestCoinScore = opportunityCandidates.bestCoinOpportunityScoreCore(
    { x: 0, y: 0 },
    [{
      coins: [{ drop_id: 'candidate-coin', amount: 4, distance: 200, x: 200, y: 0 }],
      maxDistance: 500
    }],
    [],
    null,
    {
      safeCoinCandidates: coins => coins,
      coinStaminaAffordable: () => true,
      scoreCoinOpportunity: coin => Number(coin.amount || 0)
    }
  );
  const opportunityPickResult = opportunityPick.pickBestOpportunityCore(
    { x: 0, y: 0 },
    [],
    [{
      coins: [{ drop_id: 'pick-coin', amount: 5, distance: 200, x: 200, y: 0 }],
      maxDistance: 500
    }],
    [[{ user_id: 'pick-enemy', distance: 100, opportunityScore: 3, staminaCost: 100 }]],
    {
      enemyOpportunityCandidates: (origin, targets) => targets,
      uniqueVisibleRouteCoins: groups => (groups || []).flatMap(group => group.coins || []),
      pickCoinRouteOpportunity: () => null,
      opportunityCandidateCoreOptions: () => ({
        safeCoinCandidates: coins => coins,
        coinStaminaCost: coin => Number(coin.distance || 0),
        coinStaminaAffordable: () => true,
        scoreCoinOpportunity: coin => Number(coin.amount || 0),
        snapshotCoinNavigationReason: () => 'pick-coin',
        maxCoinDistance: 500,
        scoreEnemyOpportunity: target => Number(target.opportunityScore || 0),
        enemyStaminaCost: target => Number(target.staminaCost || 0),
        opportunityStaminaAffordable: () => true,
        isAfkProfitTarget: () => true,
        attackRange: 150,
        attackEngageRange: 200,
        priorityTier: item => opportunityCandidates.opportunityPriorityTierCore(item, { visibleDistance: 500 })
      }),
      buildCoinAction: (origin, coin, reason, kind) => ({ kind, reason, target: { id: coin.drop_id } }),
      buildEnemyAction: (origin, target, reason) => ({ kind: 'attack', reason, target: { id: target.user_id } }),
      buildMissingHeldOpportunity: () => null,
      chooseStableOpportunity: opportunities => opportunities.slice().sort((a, b) => b.score - a.score)[0] || null,
      rememberOpportunityChoice: (item, action) => ({ ...action, pickedId: item.id, pickedType: item.type }),
      disableMissingHold: true
    }
  );
  const patrolScanResult = patrol.patrolDirectionCore(
    { x: 0, y: 0 },
    [],
    [],
    { x: 300, y: 0 },
    {
      patrolPrecisionTolerance: 10,
      patrolCoinMaxDistance: 500
    }
  );
  const postAttackVisibleCoinExists = postAttackDrop.postAttackVisibleCoinExistsCore(
    [{ drop_id: 'post-attack-visible', amount: 3, x: 10, y: 0 }],
    { id: 'post-attack-target', x: 0, y: 0 },
    { dropCoinRadius: 20 }
  );
  const postAttackDropResult = postAttackDrop.pickPostAttackDropCoinCore(
    [{
      id: 'post-attack-target',
      at: 900,
      x: 10,
      y: 0,
      drop: 6,
      action: 'attack',
      postAttackDropResolvedAt: 950
    }],
    [{ drop_id: 'post-attack-coin', amount: 6, distance: 10, x: 12, y: 0 }],
    {
      nowMs: 1000,
      priorityMs: 500,
      dropCoinRadius: 20,
      scoreCoin: coin => Number(coin.amount || 0) * 10
    }
  );
  const staminaBudgetDailyLimited = staminaBudget.dailyStaminaBudgetIsLimitingCore(1200, 2000, 1000);
  const staminaBudgetExit = staminaBudget.summarizeNearestCoinStaminaBudgetExitCore(
    { x: 0, y: 0 },
    [{ drop_id: 'stamina-coin', amount: 2, distance: 150, x: 150, y: 0 }],
    {
      budget: 100,
      coinStaminaCost: coin => Number(coin.distance || 0),
      reloginDelayMs: 1800000
    }
  );
  const opportunityConstantHighValue = opportunityConstants.OPPORTUNITY_CONSTANTS.HIGH_VALUE_COIN_PRIORITY_AMOUNT;
  const opportunityConstantRoi = opportunityConstants.calculateOpportunityROI(10, 2);
  const persistentLastSelfStorage = {
    value: JSON.stringify({ at: 1000, self: { id: 'last-self-spike', hp: 88 } }),
    getItem() {
      return this.value;
    },
    setItem(key, value) {
      this.writtenKey = key;
      this.writtenValue = JSON.parse(value);
    }
  };
  const persistentLastSelfRead = persistentLastSelf.readPersistentLastSelfStateCore(
    persistentLastSelfStorage,
    'last-self-key',
    10000,
    1500
  );
  const persistentLastSelfWrite = persistentLastSelf.writePersistentLastSelfStateCore(
    persistentLastSelfStorage,
    'last-self-key',
    { id: 'last-self-written', hp: 77 },
    2000
  );
  const persistentExitStorage = {
    value: JSON.stringify({
      at: 1000,
      reason: 'enemy-leave',
      reloginUntil: 1200,
      reloginDelayMs: 500
    }),
    getItem() {
      return this.value;
    },
    setItem(key, value) {
      this.writtenKey = key;
      this.writtenValue = JSON.parse(value);
    }
  };
  const persistentExitRefresh = (detail, t) => ({
    ...detail,
    refreshedAt: t,
    holdRemainingMs: Math.max(0, Number(detail.reloginUntil || 0) - t)
  });
  const persistentExitRead = persistentExit.readPersistentExitStateCore(
    persistentExitStorage,
    'exit-key',
    persistentExitRefresh,
    1500
  );
  const persistentExitWrite = persistentExit.writePersistentExitStateCore(
    persistentExitStorage,
    'exit-key',
    {
      at: 1100,
      attempted: true,
      method: 'leave',
      reason: 'offline-leave',
      summary: 'offline',
      reloginUntil: 3000,
      reloginDelayMs: 1000
    },
    persistentExitRefresh,
    2000
  );
  const persistentClearRemoved = persistentClear.clearPersistentStorageKey('persistent-clear-spike');
  const pendingExitHelpers = {
    pendingExitPersistMaxMs: 10000,
    cloneForPendingExit: value => value && typeof value === 'object' ? { ...value, cloned: true } : value,
    pendingExitDisplayReason: summary => `display:${summary}`,
    pendingExitRetryMs: pending => Number(pending.retryCount || 0) * 100 + 250,
    stringify: JSON.stringify
  };
  const pendingExitNormalized = pendingExitPersistence.normalizePendingExitStateForStorageCore({
    at: 1000,
    updatedAt: 1200,
    reason: 'offline-leave',
    summary: 'offline summary',
    retryCount: 2,
    self: { id: 'pending-self' },
    lastResult: {
      at: 1100,
      reason: 'offline-leave',
      reloadConfirmation: {
        required: true,
        requestedAt: 1050
      }
    }
  }, 1500, { markReloaded: true }, pendingExitHelpers);
  const pendingExitStorage = {
    value: JSON.stringify({
      at: 1000,
      updatedAt: 1250,
      reason: 'stored-leave',
      summary: 'stored summary',
      retryCount: 1
    }),
    getItem() {
      return this.value;
    },
    setItem(key, value) {
      this.writtenKey = key;
      this.writtenValue = JSON.parse(value);
    }
  };
  const pendingExitRead = pendingExitPersistence.readPersistedPendingExitStateCore(
    pendingExitStorage,
    'pending-exit-key',
    1500,
    {},
    pendingExitHelpers
  );
  const pendingExitWritten = pendingExitPersistence.writePersistentPendingExitStateCore(
    pendingExitStorage,
    'pending-exit-key',
    pendingExitNormalized,
    1600,
    pendingExitHelpers
  );
  const pendingExitChosen = pendingExitPersistence.chooseInitialPendingExitStateCore(
    { at: 1000, updatedAt: 1100, reason: 'memory-leave', summary: 'memory summary' },
    { at: 1000, updatedAt: 1250, reason: 'stored-leave', summary: 'stored summary' },
    1500,
    {},
    pendingExitHelpers
  );
  const refreshedExitDetail = refreshExitDetail.refreshExitDetailCore({
    reason: '',
    reloginUntil: 2400,
    offlineSafety: { staminaBudgetExit: true }
  }, (reason, offlineSafety) => (
    offlineSafety?.staminaBudgetExit ? `summary:${reason}` : `other:${reason}`
  ), detail => ({
    ...detail,
    displayReason: String(detail.summary || detail.reason || '')
  }), 1000);
  const restoredFailureList = restoredCoinFailures.restoredCoinFailuresCore([
    ['near-drop', { count: 1, reason: 'near', lastAt: 900 }],
    ['hard-drop', { count: 3, reason: 'progress', lastAt: 900 }],
    ['stale-drop', { count: 9, reason: 'progress', lastAt: 400, ignoreUntil: 1200 }]
  ], {
    coinFailureDecayMs: 500,
    coinFailureHardIgnoreCount: 3,
    coinFailureHardIgnoreMs: 600,
    coinFailureSevereIgnoreCount: 5,
    coinFailureSevereIgnoreMs: 1000
  }, 1000);
  const restoredRuntimeNow = (() => {
    const values = [2000, 2100];
    return () => values.shift() || 2200;
  })();
  const restoredRuntimeStateResult = restoredRuntimeState.restoreRuntimeStateCore({
    pendingExit: {
      at: 1000,
      updatedAt: 1100,
      reason: 'memory-pending',
      summary: 'memory pending'
    }
  }, null, {
    restoredCoinFailures: () => restoredFailureList,
    readPersistentExitState: key => ({ key, reason: `restored:${key}` }),
    readPersistedPendingExitState: (t, options) => ({
      at: 1000,
      updatedAt: t,
      reason: 'stored-pending',
      summary: 'stored pending',
      marked: options.markReloaded
    }),
    chooseInitialPendingExitState: (memoryState, storedState, t, options) => ({
      reason: storedState.reason,
      memoryReason: memoryState.reason,
      at: t,
      marked: options.markReloaded
    }),
    enemyLeaveStateKey: 'enemy-leave-key',
    offlineLeaveStateKey: 'offline-leave-key',
    nowMs: restoredRuntimeNow
  });
  const loginSnapshotRequired = loginSnapshotGate.loginSnapshotSuccessRequiredCore();
  const loginSnapshotGateState = loginSnapshotGate.normalizeLoginSnapshotGateStateCore({
    streak: 2.6,
    lastOkAt: 900,
    lastError: 404,
    resetReason: 'spike-reset'
  }, loginSnapshotRequired);
  const runtimeDiagnosticsBot = { runtimeDiagnostics: null };
  runtimeDiagnostics.recordRuntimeDiagnosticsCore(runtimeDiagnosticsBot, {
    lastTickDurationMs: 12.3,
    lastTickSource: 'bundler-spike'
  });
  runtimeDiagnostics.recordRuntimeDiagnosticsCore(null, { ignored: true });
  const exitReloginDisplay = exitRelogin.leaveWaitDisplayCore(
    '离线退出',
    { holdRemainingMs: 2500 },
    displayFormat.formatDurationMs
  );
  const exitReloginDetail = exitRelogin.finalizeLeaveDisplayReasonCore({
    reason: 'offline',
    summary: '离线退出',
    reloginDelayMs: 1500
  }, (base, detail) => exitRelogin.leaveWaitDisplayCore(base, detail, displayFormat.formatDurationMs));
  const exitReloginActor = exitRelogin.normalizeEnemyActorCore({ targetId: 42, targetName: '追击者' });
  const exitReloginFallbackActor = exitRelogin.enemyActorFromLeaveDetailCore({
    injury: {
      nearestHuman: { name: 'fallback-enemy' }
    }
  }, exitRelogin.normalizeEnemyActorCore);
  const exitReloginRepeatDelay = exitRelogin.enemyRepeatDelayMsForCountCore(3, {
    enemyReloginRepeatSecondMaxMs: 2000,
    enemyReloginRepeatThirdMaxMs: 5000
  });
  const exitReloginStreakBot = { enemyLeaveStreak: null };
  const exitReloginStreakCfg = {
    enemyReloginRepeatResetMs: 10000,
    enemyReloginRepeatSecondMaxMs: 2000,
    enemyReloginRepeatThirdMaxMs: 5000
  };
  const exitReloginStreakStorage = {
    value: JSON.stringify({
      key: 'id:42',
      id: 42,
      name: '追击者',
      count: 1,
      at: 1000
    }),
    getItem() {
      return this.value;
    },
    setItem(key, value) {
      this.writtenKey = key;
      this.writtenValue = JSON.parse(value);
      this.value = value;
    },
    removeItem(key) {
      this.removedKey = key;
      this.value = 'null';
    }
  };
  const exitReloginReadStreak = exitRelogin.readEnemyLeaveStreakCore(
    exitReloginStreakStorage,
    'enemy-streak-key',
    exitReloginStreakBot,
    exitReloginStreakCfg,
    1500,
    count => exitRelogin.enemyRepeatDelayMsForCountCore(count, exitReloginStreakCfg)
  );
  const exitReloginUpdateDetail = { target: { user_id: 42, name: '追击者' } };
  const exitReloginUpdatedStreak = exitRelogin.updateEnemyLeaveStreakCore(
    exitReloginUpdateDetail,
    2000,
    {
      cfg: exitReloginStreakCfg,
      enemyActorFromLeaveDetail: detail => exitRelogin.enemyActorFromLeaveDetailCore(detail, exitRelogin.normalizeEnemyActorCore),
      readEnemyLeaveStreak: t => exitRelogin.readEnemyLeaveStreakCore(
        exitReloginStreakStorage,
        'enemy-streak-key',
        exitReloginStreakBot,
        exitReloginStreakCfg,
        t,
        count => exitRelogin.enemyRepeatDelayMsForCountCore(count, exitReloginStreakCfg)
      ),
      writeEnemyLeaveStreak: streak => exitRelogin.writeEnemyLeaveStreakCore(
        exitReloginStreakStorage,
        'enemy-streak-key',
        exitReloginStreakBot,
        streak
      ),
      enemyRepeatDelayMsForCount: count => exitRelogin.enemyRepeatDelayMsForCountCore(count, exitReloginStreakCfg)
    }
  );
  const exitReloginSummaryHelpers = {
    cfg: {
      combatCriticalHpLeaveThreshold: 25,
      combatLowHpLeaveThreshold: 45
    },
    actorLabel: actor => String(actor?.name || actor?.targetName || actor?.id || 'unknown'),
    hpDisplay: hp => `${Math.round(Number(hp) || 0)}HP`,
    formatDurationMs: displayFormat.formatDurationMs
  };
  const exitReloginCombatSummary = exitRelogin.combatExitSummaryCore(
    'combat-hp-disadvantage-leave',
    { name: '强敌', hp: 80 },
    { selfHp: 50, targetHp: 80, pressureDisadvantage: { distance: 1234 } },
    exitReloginSummaryHelpers
  );
  const exitReloginCombatAction = exitRelogin.combatLeaveActionCore(
    'combat-low-hp-leave',
    { name: '强敌', hp: 70 },
    { selfHp: 30, targetHp: 70, closeRisk: { distance: 3000 } },
    { dx: 2, dy: -2, shoot: true, forceShoot: true },
    {
      combatExitSummary: (reason, target, state) => exitRelogin.combatExitSummaryCore(reason, target, state, exitReloginSummaryHelpers),
      clamp: (value, min, max) => Math.min(max, Math.max(min, value))
    }
  );
  const exitReloginPursuitSummary = exitRelogin.pursuitLeaveSummaryCore({
    name: '追击者',
    durationMs: 2500,
    distance: 12345
  }, {
    actorLabel: exitReloginSummaryHelpers.actorLabel,
    formatDurationMs: displayFormat.formatDurationMs,
    formatDistance: displayFormat.formatDistance
  });
  const exitReloginInjurySummary = exitRelogin.injuryLeaveSummaryCore({
    nearestHuman: { name: '伤害者' },
    previousHp: 90,
    currentHp: 55
  }, {
    actorLabel: exitReloginSummaryHelpers.actorLabel,
    hpDisplay: exitReloginSummaryHelpers.hpDisplay
  });
  const exitReloginOfflineSummary = exitRelogin.offlineLeaveSummaryCore('action settlement', {
    actionSettlementStall: true
  }, {
    staminaBudgetCoinLeaveSummary: () => 'stamina budget summary',
    staminaExhaustedWindowLabel: () => ''
  });
  const exitReloginOfflineDisplay = exitRelogin.currentOfflineDisplayReasonCore(
    'sampling outage',
    { samplingOutage: true },
    {
      summary: '网络采样超时，按网络波动退出等待重连',
      displayReason: '网络采样超时，按网络波动退出等待重连，等待3秒'
    },
    null,
    '',
    {
      offlineLeaveSummary: (reason, safety) => exitRelogin.offlineLeaveSummaryCore(reason, safety, {
        staminaBudgetCoinLeaveSummary: () => 'stamina budget summary',
        staminaExhaustedWindowLabel: () => ''
      })
    }
  );
  const exitReloginHpDelay = exitRelogin.reloginDelayForHpCore(
    { hp: 25 },
    { enemyLeaveStreak: { reloginMinMs: 6000 } },
    {
      cfg: {
        enemyReloginMinDelayMs: 1000,
        enemyReloginMaxDelayMs: 5000,
        enemyReloginJitterMs: 0
      },
      hpInfoForRelogin: () => ({ ratio: 0.25, hp: 25 }),
      randomBetween: () => 0,
      clamp: (value, min, max) => Math.min(max, Math.max(min, value))
    }
  );
  const names = targetWhitelist.parseTargetWhitelistNames({
    names: [' Firefox\u200e ', 'Firefox', '文月']
  }, 10);
  return {
    version: String(config.version || 'bundler-spike'),
    distance: displayFormat.formatDistance(12345),
    names,
    nameCount: arrayCountRuntime.arrayCount(names),
    actionFocus: actionPriority.actionFocusSummary(sampleAction),
    finalActionHeld: arbitrationResult.held,
    actionSwitch: switchResult.event,
    attackWorthResult,
    exitMotionLock,
    exitMotionDecisionReason: exitMotionDecision.reason,
    exitMotionDecisionTargetless: exitMotionDecision.target === null && exitMotionDecision.shoot === false,
    coinDiagnosticsIgnored: arrayCountRuntime.arrayCount(coinDiagnosticResult.ignoredNearCoins),
    coinDiagnosticsSnapshotOnly: arrayCountRuntime.arrayCount(coinDiagnosticResult.snapshotOnlyNearCoins),
    coinMotionDirection: coinMotionResult.direction,
    coinMotionRouteMode: coinMotionMeta.routeMode,
    coinTargetKey,
    coinTargetSnapshotCount: arrayCountRuntime.arrayCount(coinTargetSnapshot),
    coinTargetMatched,
    coinProgressIgnoreMs: coinProgressFailure.ignoreMs,
    coinProgressAttemptId: coinProgressAttempt.id,
    coinProgressIntent: coinProgress.coinProgressIntentCore(sampleAction),
    coinRouteKey,
    coinRouteLegCount: coinRouteMeta.legCount,
    coinRouteFirstDistance: coinRouteMeta.firstDistance,
    opportunityChoiceKey: opportunityChoice.opportunityKey(opportunityChoiceResult.chosen),
    opportunityChoiceHeld: opportunityChoiceResult.chosen?.held === true,
    opportunityChoiceHoldRemainingMs: opportunityRemembered.action?.opportunityChoice?.holdRemainingMs,
    opportunityClearExact,
    opportunityClearMismatch,
    opportunityCandidateCount: arrayCountRuntime.arrayCount(opportunityCandidateList),
    opportunityCandidateCoinReason: opportunityCandidateList.find(item => item.type === 'coin')?.reason,
    opportunityBestCoinScore,
    opportunityPickId: opportunityPickResult?.pickedId,
    opportunityPickKind: opportunityPickResult?.kind,
    patrolReason: patrolScanResult.direction?.reason,
    patrolClearHeading: patrolScanResult.clearPatrolHeading,
    postAttackVisibleCoinExists,
    postAttackDropSelectedId: postAttackDropResult.selected?.drop_id,
    staminaBudgetDailyLimited,
    staminaBudgetExitShortageMs: staminaBudgetExit?.shortageMs,
    opportunityConstantHighValue,
    opportunityConstantRoi,
    offlineSummary: exitSummary.offlineLeaveSummaryText('sampling outage', { samplingOutage: true }),
    persistentLastSelfId: persistentLastSelfRead?.id,
    persistentLastSelfWrite,
    persistentLastSelfWrittenAt: persistentLastSelfStorage.writtenValue?.at,
    persistentExitReadRestored: persistentExitRead?.restored === true,
    persistentExitReadReloginUntil: persistentExitRead?.reloginUntil,
    persistentExitWrite,
    persistentExitWrittenReason: persistentExitStorage.writtenValue?.reason,
    persistentExitWrittenHoldMs: persistentExitStorage.writtenValue?.holdRemainingMs,
    persistentClearRemoved,
    pendingExitDisplayReason: pendingExitNormalized.displayReason,
    pendingExitRetryMs: pendingExitNormalized.retryMs,
    pendingExitReloadRestored: pendingExitNormalized.reloadConfirmation?.restoredAfterReload,
    pendingExitReloadAt: pendingExitNormalized.reloadConfirmation?.reloadedAt,
    pendingExitReadReason: pendingExitRead?.reason,
    pendingExitWrittenReason: pendingExitStorage.writtenValue?.reason,
    pendingExitChosenReason: pendingExitChosen?.reason,
    refreshExitHoldRemainingMs: refreshedExitDetail.holdRemainingMs,
    refreshExitSummary: refreshedExitDetail.summary,
    refreshExitDisplayReason: refreshedExitDetail.displayReason,
    restoredFailureCount: arrayCountRuntime.arrayCount(restoredFailureList),
    restoredFailureHardIgnoreUntil: restoredFailureList.find(([id]) => id === 'hard-drop')?.[1]?.ignoreUntil,
    restoredFailureStaleIgnoreUntil: restoredFailureList.find(([id]) => id === 'stale-drop')?.[1]?.ignoreUntil,
    restoredRuntimeFailureCount: arrayCountRuntime.arrayCount(restoredRuntimeStateResult.restoredFailures),
    restoredRuntimeEnemyReason: restoredRuntimeStateResult.restoredEnemyLeaveState?.reason,
    restoredRuntimeOfflineReason: restoredRuntimeStateResult.restoredOfflineLeaveState?.reason,
    restoredRuntimePendingReason: restoredRuntimeStateResult.restoredPendingExitState?.reason,
    restoredRuntimeInitialReason: restoredRuntimeStateResult.initialPendingExitState?.reason,
    restoredRuntimeInitialAt: restoredRuntimeStateResult.initialPendingExitState?.at,
    restoredRuntimeMarked: restoredRuntimeStateResult.initialPendingExitState?.marked,
    loginSnapshotRequired,
    loginSnapshotStreak: loginSnapshotGateState.streak,
    loginSnapshotLastSampleAt: loginSnapshotGateState.lastSampleAt,
    loginSnapshotResetReason: loginSnapshotGateState.resetReason,
    runtimeDiagnosticsTickMs: runtimeDiagnosticsBot.runtimeDiagnostics?.lastTickDurationMs,
    runtimeDiagnosticsSource: runtimeDiagnosticsBot.runtimeDiagnostics?.lastTickSource,
    exitReloginDisplay,
    exitReloginSummary: exitReloginDetail.summary,
    exitReloginDisplayReason: exitReloginDetail.displayReason,
    exitReloginActorKey: exitReloginActor?.key,
    exitReloginActorLabel: exitReloginActor?.label,
    exitReloginFallbackActorKey: exitReloginFallbackActor?.key,
    exitReloginRepeatDelay,
    exitReloginReadStreakCount: exitReloginReadStreak?.count,
    exitReloginUpdatedStreakCount: exitReloginUpdatedStreak?.count,
    exitReloginUpdatedRepeatDelay: exitReloginUpdateDetail.reloginRepeatDelayMs,
    exitReloginWrittenStreakCount: exitReloginStreakStorage.writtenValue?.count,
    exitReloginBotStreakKey: exitReloginStreakBot.enemyLeaveStreak?.key,
    exitReloginCombatSummary,
    exitReloginCombatActionDx: exitReloginCombatAction.dx,
    exitReloginCombatActionShoot: exitReloginCombatAction.shoot,
    exitReloginPursuitSummary,
    exitReloginInjurySummary,
    exitReloginOfflineSummary,
    exitReloginOfflineDisplay,
    exitReloginHpDelayMs: exitReloginHpDelay.delayMs,
    exitReloginHpDelayRepeatMinMs: exitReloginHpDelay.repeatMinMs,
    preservedKills: arrayCountRuntime.arrayCount(preservedState.buildBrowserPreservedState({
      killHistory: ['a', 'b', 'c']
    }).killHistory),
    defaultStatusEvery: runtimeDefaults.buildRuntimeDefaults({ statusEvery: 0 }, false).statusEvery,
    storageProbe: pageAdapter.readPageLocalStorageJson('graspRatBundlerSpikeProbe', { ok: false }),
    json: runtimeUtils.safeStringify({
      ok: true,
      bigint: BigInt(7)
    })
  };
}

function installBundlerSpike(config = {}) {
  const installed = {
    installedAt: Date.now(),
    status() {
      return helperStatus(config);
    },
    stop(reason = 'manual') {
      this.stopped = true;
      this.stopReason = String(reason || 'manual');
      return this.status();
    }
  };
  pageAdapter.installPageGlobal(SPIKE_KEY, installed);
  return installed.status();
}

const runtimeConfig = normalizeConfig(pageAdapter.readPageGlobal(CONFIG_KEY, {}));

installBundlerSpike(runtimeConfig);

export {
  SPIKE_KEY,
  helperStatus,
  installBundlerSpike
};
