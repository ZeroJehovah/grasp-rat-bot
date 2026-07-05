'use strict';

import runtimeUtils from './runtime/runtime-utils.js';
import displayFormat from './runtime/display-format.js';
import targetWhitelist from './runtime/target-whitelist.js';
import exitSummary from './runtime/exit-summary.js';
import preservedState from './runtime/browser-preserved-state.js';
import persistentExit from './runtime/persistent-exit.js';
import persistentLastSelf from './runtime/persistent-last-self.js';
import persistentClear from './runtime/persistent-clear.js';
import pendingExitPersistence from './runtime/pending-exit-persistence.js';
import pendingExit from './runtime/pending-exit.js';
import leaveCommand from './runtime/leave-command.js';
import refreshExitDetail from './runtime/refresh-exit-detail.js';
import restoredCoinFailures from './runtime/restored-coin-failures.js';
import restoredRuntimeState from './runtime/restored-runtime-state.js';
import loginSnapshotGate from './runtime/login-snapshot-gate.js';
import runtimeDiagnostics from './runtime/runtime-diagnostics.js';
import runtimeStateBindings from './runtime/runtime-state-bindings.js';
import exitRelogin from './runtime/exit-relogin.js';
import runtimeDefaults from './runtime/runtime-defaults.js';
import actionPriority from './runtime/action-priority.js';
import actionArbitration from './runtime/action-arbitration.js';
import actionSwitchDiagnostics from './runtime/action-switch-diagnostics.js';
import attackWorth from './runtime/attack-worth.js';
import exitMotion from './runtime/exit-motion.js';
import coinDiagnostics from './runtime/coin-diagnostics.js';
import coinMotion from './runtime/coin-motion.js';
import coinTarget from './runtime/coin-target.js';
import coinProgress from './runtime/coin-progress.js';
import coinRoute from './runtime/coin-route.js';
import opportunityChoice from './runtime/opportunity-choice.js';
import opportunityClear from './runtime/opportunity-clear.js';
import opportunityCandidates from './runtime/opportunity-candidates.js';
import opportunityPick from './runtime/opportunity-pick.js';
import patrol from './runtime/patrol.js';
import postAttackDrop from './runtime/post-attack-drop.js';
import dropMatchedKill from './runtime/drop-matched-kill.js';
import staminaBudget from './runtime/stamina-budget.js';
import opportunityConstants from './runtime/opportunity-constants.js';
import runtimeBootstrapBindings from './runtime/runtime-bootstrap-bindings.js';
import pageAdapter from './page-global-core.js';
import arrayCountRuntime from './runtime/array-count.js';

const HELPER_ENTRY_KEY = '__graspRatRuntimeHelperEntry';
const CONFIG_KEY = '__GRASP_RAT_RUNTIME_HELPER_ENTRY_CONFIG__';

function normalizeConfig(value) {
  return value && typeof value === 'object' ? value : {};
}

function helperStatus(config = {}) {
  const sampleAction = {
    kind: 'coin',
    reason: 'runtime-helper-entry',
    target: { id: 'coin-spike', x: 100, y: 200 },
    coin: { id: 'coin-spike', amount: 3 }
  };
  const nextAction = {
    kind: 'coin',
    reason: 'runtime-helper-entry-next',
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
  const dropMatchedKillResult = dropMatchedKill.buildDropMatchedKillCore({
    id: 'post-attack-coin',
    amount: 6,
    x: 12,
    y: 0,
    distance: 10,
    postAttackTarget: {
      id: 'post-attack-target',
      name: 'Post Target',
      drop: 6,
      battleStartedAt: 900,
      battleStaminaSpentStartMs: 100
    }
  }, 6, { id: 'self-spike' }, 'post-attack-drop-visible', {
    nowMs: 1000,
    sessionId: 'spike-session',
    sessionStaminaSpentMs: 250,
    coinTargetKey: coinTarget.coinTargetKeyCore
  });
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
  const runtimeBootstrapBinding = runtimeBootstrapBindings.createRuntimeBootstrapBindings({
    version: 'bootstrap-base',
    sourceUrl: 'https://example.invalid/dist/grasp-rat-remote-bot.js',
    targetWhitelistUrl: 'https://example.invalid/dist/target-whitelist.json',
    targetWhitelistMaxNames: 5
  }, {
    pageGlobal: {
      __graspRatBotRuntimeConfig: {
        version: 'bootstrap-runtime',
        targetWhitelistUrl: 'https://example.invalid/dist/target-whitelist.json'
      },
      __graspRatBot: {
        targetWhitelist: {
          url: 'https://example.invalid/dist/target-whitelist.json',
          names: ['Alpha', 'Beta'],
          lastOkAt: 1234
        }
      }
    }
  });
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
  const pendingExitCoreRetryMs = pendingExit.pendingExitRetryMsCore({
    scope: 'offline',
    source: 'offline'
  }, {
    leaveRetryMinMs: 1000,
    offlineLeaveRetryMs: 4500,
    combatLeaveRetryMs: 1200
  });
  const pendingExitCoreDisplayReason = pendingExit.pendingExitDisplayReasonCore('core summary');
  const pendingExitCoreSummary = pendingExit.summarizePendingExitCore({
    scope: 'enemy',
    source: 'combat',
    reason: 'combat leave',
    summary: 'combat summary',
    displayReason: 'combat display',
    at: 1000,
    lastAttemptAt: 1400,
    retryCount: 3,
    combatCover: { dx: 2, dy: -2, shoot: true },
    lastResult: { error: 'timeout' }
  }, {
    nowMs: 2000,
    retryMs: 1000
  });
  const pendingExitCoreHttp403 = pendingExit.leaveRequestHasHttp403Core({ message: 'HTTP 403 Forbidden' });
  const pendingExitCoreDetailHttp403 = pendingExit.leaveDetailHasHttp403Core({
    leaveRequests: [{ status: 500 }, { statusCode: 403 }]
  });
  const pendingExitCoreLeaveSucceeded = pendingExit.leaveDetailSucceededCore({
    attempted: true,
    method: 'leave',
    lastLeaveRequest: {
      completedAt: 2100,
      requestId: 'spike-leave'
    }
  });
  const pendingExitCoreReloadConfirmation = pendingExit.leaveSuccessReloadConfirmationForDetailCore({
    attempted: true,
    method: 'leave',
    at: 2000,
    lastLeaveRequest: {
      completedAt: 2100,
      requestId: 'spike-leave'
    }
  }, {
    reloadConfirmation: {
      required: true,
      requestedAt: 2200,
      restoredAfterReload: true
    }
  }, 2300, {
    normalizeReloadConfirmation: pendingExitPersistence.normalizePendingExitReloadConfirmationCore
  });
  const pendingExitCoreReloadSatisfied = pendingExit.leaveSuccessReloadConfirmationSatisfiedCore(pendingExitCoreReloadConfirmation);
  const pendingExitCoreWaitReason = pendingExit.pendingExitWaitReasonCore({
    scope: 'enemy',
    source: 'pursuit'
  }, false);
  const leaveCommandFailureMessage = leaveCommand.leaveCommandFailureMessageCore({ status: 403, statusText: 'Forbidden' });
  const leaveCommandResultSummary = leaveCommand.summarizeLeaveCommandResultCore({ success: false, statusCode: 403, error: 'denied' });
  const leaveCommandClashFailed = leaveCommand.leaveDetailFailedForClashRescueCore({
    attempted: true,
    error: 'timeout'
  }, {
    clashLeaveRescueEnabled: true,
    hasClashLeaveRescueHook: true
  });
  const leaveCommandNextClashStage = leaveCommand.nextClashLeaveRescueStageCore({
    clashLeaveRescueAttempts: [{ stage: 'auto' }]
  });
  const leaveCommandClashSummary = leaveCommand.summarizeClashLeaveRescueResultCore({
    target: 'proxy',
    switched: { status: 200 }
  }, 'direct', '', { nowMs: 2400 });
  const leaveCommandRetryDetail = leaveCommand.clashLeaveRescueRetryDetailCore({
    attempted: true,
    method: 'leave',
    reason: 'leave-http-403',
    leaveRequestPending: true,
    leaveRequests: [{ requestId: 'old' }],
    clashLeaveRescueAttempts: [{ stage: 'auto' }]
  }, 'direct', {
    nowMs: 2500,
    pendingExitDisplayReason: summary => 'display:' + summary
  });
  const leaveCommandResetDetail = leaveCommand.resetClashLeaveRescueRoundCore({
    clashLeaveRescueAttempts: [{ stage: 'auto' }],
    clashLeaveRescue: { stage: 'auto' },
    clashLeaveRescueStage: 'auto',
    clashLeaveRescueRetry: true
  });
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
    lastTickSource: 'runtime-helper-entry'
  });
  runtimeDiagnostics.recordRuntimeDiagnosticsCore(null, { ignored: true });
  const runtimeStateStorage = {
    values: new Map([
      ['state-last-self', JSON.stringify({ at: 1000, self: { id: 'state-binding-self', hp: 91 } })],
      ['state-enemy', JSON.stringify({
        at: 1000,
        reason: 'state-binding-enemy',
        summary: 'state binding enemy',
        reloginUntil: 2500,
        reloginDelayMs: 500
      })],
      ['state-pending', JSON.stringify({
        at: 1000,
        updatedAt: 1700,
        reason: 'state-binding-pending',
        summary: 'state binding pending',
        retryCount: 1
      })]
    ]),
    getItem(key) {
      return this.values.get(key) || null;
    },
    setItem(key, value) {
      this.values.set(key, value);
      this.writtenKey = key;
      this.writtenValue = JSON.parse(value);
    },
    removeItem(key) {
      this.values.delete(key);
      this.removedKey = key;
    }
  };
  const runtimeStateBinding = runtimeStateBindings.createRuntimeStateBindings({
    storage: runtimeStateStorage,
    cfg: {
      lastSelfPersistMaxMs: 10000,
      pendingExitPersistMaxMs: 10000,
      leaveRetryMinMs: 1000,
      offlineLeaveRetryMs: 3000,
      combatLeaveRetryMs: 2000,
      pursuitLeaveRetryMs: 2500
    },
    keys: {
      lastSelfStateKey: 'state-last-self',
      pendingExitStateKey: 'state-pending',
      enemyLeaveStateKey: 'state-enemy',
      offlineLeaveStateKey: 'state-offline'
    },
    preserved: {
      coinFailures: [['state-coin', { count: 3, reason: 'progress', lastAt: 1700 }]],
      pendingExit: {
        at: 1000,
        updatedAt: 1200,
        reason: 'memory-state-binding',
        summary: 'memory state binding'
      }
    },
    previousBot: null,
    now: () => 2000,
    performanceNow: () => 2000
  });
  const runtimeStateLastSelf = runtimeStateBinding.readPersistentLastSelfState(2000);
  runtimeStateBinding.writePersistentLastSelfState({ id: 'state-binding-written' }, 2100);
  const runtimeStatePendingWritten = runtimeStateBinding.writePersistentPendingExitStateCore(
    runtimeStateStorage,
    'state-pending',
    {
      at: 1900,
      updatedAt: 1950,
      reason: 'state-binding-written-pending',
      summary: 'state binding written pending',
      retryCount: 2
    },
    2000,
    runtimeStateBinding.pendingExitPersistenceCoreHelpers()
  );
  const runtimeStateDiagnosticsBot = { runtimeDiagnostics: null };
  runtimeStateBinding.recordRuntimeDiagnosticsCore(runtimeStateDiagnosticsBot, {
    lastTickSource: 'runtime-state-bindings'
  });
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
  const exitReloginBoundStreakDetail = { target: { user_id: 42, name: '追击者' } };
  const exitReloginBoundStreak = exitRelogin.updateEnemyLeaveStreakBoundCore(
    exitReloginBoundStreakDetail,
    3000,
    exitReloginStreakStorage,
    exitReloginStreakBot,
    exitReloginStreakCfg,
    { enemyLeaveStreakKey: 'enemy-streak-key' }
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
    nearestActive: { name: '远处无敌', distance: 50000, invulnerable: true },
    nearestHuman: { name: '伤害者' },
    previousHp: 90,
    currentHp: 55
  }, {
    actorLabel: exitReloginSummaryHelpers.actorLabel,
    hpDisplay: exitReloginSummaryHelpers.hpDisplay
  });
  const exitReloginHealthyHighValueInjurySuppressed = exitRelogin.healthyHighValueCoinInjuryLeaveSuppressedCore(
    { currentHp: 97 },
    { kind: 'coin', reason: 'high-value-visible-coin-priority' },
    { healthyHp: 50 }
  );
  const exitReloginLowHpHighValueInjurySuppressed = exitRelogin.healthyHighValueCoinInjuryLeaveSuppressedCore(
    { currentHp: 49 },
    { kind: 'coin', reason: 'high-value-visible-coin-priority' },
    { healthyHp: 50 }
  );
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
  const exitReloginSuppressMatch = exitRelogin.isExitLoginSuppressReasonCore('combat leave');
  const exitReloginUnsafeMin = exitRelogin.unsafeExitReloginMinDelayMsCore({
    unsafeExitReloginMinDelayMs: 1234
  });
  const exitReloginPendingReason = exitRelogin.pendingExitSuppressReasonCore('enemy leave');
  const exitReloginPendingUnsafeEvents = [];
  const exitReloginPendingUnsafeDetail = { attempted: true };
  const exitReloginPendingUnsafeUntil = exitRelogin.primePendingUnsafeExitLoginSuppressBoundCore(
    'enemy leave',
    'combat leave',
    exitReloginPendingUnsafeDetail,
    { hp: 65 },
    { minimumDelayMs: 4000 },
    {
      hpInfoForRelogin: selfLike => ({ hp: selfLike?.hp, ratio: 0.65 }),
      reloginDelayForHp: () => ({ delayMs: 2000, hpDelayMs: 2000, hp: { hp: 65, ratio: 0.65 } }),
      cfg: { unsafeExitReloginMinDelayMs: 1234 },
      setLoginSuppress: (reason, delayMs) => {
        exitReloginPendingUnsafeEvents.push(['set-login-suppress', reason, delayMs]);
        return 5000 + delayMs;
      },
      now: () => 5000
    }
  );
  const exitReloginAuditEvents = [];
  const exitReloginAuditDetail = {
    reason: 'offline leave',
    exitTriggeredAt: 4321
  };
  const exitReloginAuditId = exitRelogin.startExitAuditBoundCore(
    exitReloginAuditDetail,
    { reason: 'offline unsafe', source: 'spike' },
    { lastSelf: { hp: 77 } },
    {
      resetLoginSnapshotGate: (reason, self) => {
        exitReloginAuditEvents.push(['reset', reason, self?.hp]);
        return { reason, selfHp: self?.hp };
      },
      loginPointSafetyExitSelfForDetail: (detail, meta, lastSelf) => ({
        hp: detail.self?.hp ?? meta.self?.hp ?? lastSelf?.hp
      }),
      ensureExitAuditDetail: (detail, meta) => {
        detail.exitAuditId = 'audit-spike';
        detail.auditMetaSource = meta.source;
      },
      recordExitAuditEvent: (type, detail, event) => {
        exitReloginAuditEvents.push([type, detail.exitAuditId, event.at, event.source]);
      },
      now: () => 5000
    }
  );
  const exitReloginSuppressEvents = [];
  const exitReloginSuppressHelpers = {
    loginSuppressKey: 'suppress',
    loginSuppressReasonKey: 'suppressReason',
    enemyLeaveStateKey: 'enemy-state',
    offlineLeaveStateKey: 'offline-state',
    isExitLoginSuppressReason: exitRelogin.isExitLoginSuppressReasonCore,
    hpInfoForRelogin: selfLike => ({ hp: selfLike?.hp, ratio: Number(selfLike?.hp || 0) / 100 }),
    reloginDelayForHp: () => ({
      delayMs: 2000,
      hpDelayMs: 2000,
      minMs: 1000,
      maxMs: 4000,
      baseMaxMs: 4000,
      repeatMinMs: 0,
      hp: { hp: 70, ratio: 0.7 }
    }),
    updateEnemyLeaveStreak: (detail, t) => {
      exitReloginSuppressEvents.push(['streak', t]);
      if (detail) detail.streaked = true;
    },
    clearLoginSuppressMatching: pattern => exitReloginSuppressEvents.push(['clear-suppress', pattern.test('offline leave')]),
    finalizeLeaveDisplayReason: detail => {
      detail.finalized = true;
      return detail;
    },
    writePersistentExitState: (key, detail) => exitReloginSuppressEvents.push(['write-exit', key, detail.loginSuppressReason || '', detail.reusedExitSuppress || false]),
    setLoginSuppress: (reason, delayMs) => {
      exitReloginSuppressEvents.push(['set-login-suppress', reason, delayMs]);
      return 1000 + delayMs;
    },
    now: () => 1000
  };
  const exitReloginSuppressReuseStorage = {
    getItem(key) {
      if (key === 'suppress') return '9000';
      if (key === 'suppressReason') return 'combat leave';
      return null;
    }
  };
  const exitReloginSuppressReuseBot = { pursuitReloginUntil: 0, lastEnemyLeaveWaitMs: 111 };
  const exitReloginSuppressReuseDetail = { summary: 'reuse hold' };
  const exitReloginSuppressReuseUntil = exitRelogin.setExitReloginSuppressCore(
    exitReloginSuppressReuseBot,
    exitReloginSuppressReuseStorage,
    'enemy leave',
    'combat leave',
    exitReloginSuppressReuseDetail,
    { hp: 70 },
    { minimumUntil: 2000 },
    exitReloginSuppressHelpers
  );
  const exitReloginSuppressZeroStorage = { getItem: () => null };
  const exitReloginSuppressZeroBot = { offlineReloginUntil: 5000, lastOfflineLeaveWaitMs: 3000 };
  const exitReloginSuppressZeroDetail = { summary: 'zero hold' };
  const exitReloginSuppressZeroUntil = exitRelogin.setExitReloginSuppressCore(
    exitReloginSuppressZeroBot,
    exitReloginSuppressZeroStorage,
    'offline leave',
    'offline leave',
    exitReloginSuppressZeroDetail,
    { hp: 100 },
    {},
    {
      ...exitReloginSuppressHelpers,
      reloginDelayForHp: () => ({ delayMs: 0, hpDelayMs: 0, minMs: 0, maxMs: 0, baseMaxMs: 0, repeatMinMs: 0, hp: { hp: 100, ratio: 1 } })
    }
  );
  const exitReloginSuppressNewStorage = { getItem: () => null };
  const exitReloginSuppressNewBot = { pursuitReloginUntil: 0, lastEnemyLeaveWaitMs: 0 };
  const exitReloginSuppressNewDetail = { summary: 'new hold' };
  const exitReloginSuppressNewUntil = exitRelogin.setExitReloginSuppressCore(
    exitReloginSuppressNewBot,
    exitReloginSuppressNewStorage,
    'enemy leave',
    'combat leave',
    exitReloginSuppressNewDetail,
    { hp: 60 },
    { minimumUntil: 7000, minimumReason: 'spike-minimum' },
    exitReloginSuppressHelpers
  );
  const exitReloginSuppressBoundBot = { pursuitReloginUntil: 0, lastEnemyLeaveWaitMs: 0 };
  const exitReloginSuppressBoundStorage = {
    values: {},
    getItem(key) {
      return this.values[key] ?? null;
    },
    setItem(key, value) {
      this.values[key] = value;
    }
  };
  const exitReloginSuppressBoundDetail = { summary: 'bound hold', target: { user_id: 99, name: 'bound-streak-enemy' } };
  const exitReloginSuppressBoundUntil = exitRelogin.setExitReloginSuppressBoundCore(
    exitReloginSuppressBoundBot,
    exitReloginSuppressBoundStorage,
    'enemy leave',
    'combat leave',
    exitReloginSuppressBoundDetail,
    { hp: 65 },
    { minimumUntil: 6000 },
    {
      ...exitReloginSuppressHelpers,
      cfg: exitReloginStreakCfg,
      enemyLeaveStreakKey: 'enemy-streak-key'
    }
  );
  const exitReloginBudgetHold = exitRelogin.staminaBudgetExitHoldUntilCore(
    { coin: { id: 'budget-coin' } },
    1000,
    () => 3000
  );
  const exitReloginStaminaHold = exitRelogin.staminaExitHoldUntilForDetailCore({
    offlineSafety: {
      staminaBudgetExit: { coin: { id: 'budget-coin' } },
      staminaExhausted: { window: '1d' }
    }
  }, 1000, {
    staminaBudgetExitHoldUntil: (detail, t) => exitRelogin.staminaBudgetExitHoldUntilCore(detail, t, () => 3000),
    staminaResetHoldUntil: () => ({ until: 6000, reason: 'stamina reset' })
  });
  const exitReloginStaminaHoldBound = exitRelogin.staminaExitHoldUntilForDetailBoundCore({
    offlineSafety: {
      staminaBudgetExit: { coin: { id: 'budget-coin' } },
      staminaExhausted: { window: '1d' }
    }
  }, 1000, {
    staminaBudgetReloginDelayMs: () => 3000,
    staminaResetHoldUntil: () => ({ until: 6000, reason: 'stamina reset' })
  });
  const exitReloginOfflineUnsafe = exitRelogin.offlineExitRequiresUnsafeReloginDelayCore(
    'global sampling outage',
    { samplingOutage: true }
  );
  const exitReloginHoldBot = {
    pursuitReloginUntil: 0,
    offlineReloginUntil: 0,
    lastEnemyLeaveResult: null,
    lastOfflineLeaveResult: null
  };
  const exitReloginHoldStorage = {
    values: {
      suppress: '3000',
      suppressReason: 'combat leave'
    },
    getItem(key) {
      return this.values[key] ?? null;
    },
    removeItem(key) {
      this.removed = this.removed || [];
      this.removed.push(key);
      delete this.values[key];
    }
  };
  const exitReloginEnemyHoldRemaining = exitRelogin.enemyReloginHoldRemainingMsBoundCore(
    exitReloginHoldBot,
    exitReloginHoldStorage,
    {
      loginSuppressKey: 'suppress',
      loginSuppressReasonKey: 'suppressReason',
      cfg: exitReloginStreakCfg,
      enemyLeaveStreakKey: 'enemy-streak-key',
      enemyLeaveStateKey: 'enemy-state',
      readPersistentExitState: () => ({ reloginUntil: 2500, reason: 'enemy-leave' }),
      now: () => 1000
    }
  );
  exitReloginHoldStorage.values.suppress = '4500';
  exitReloginHoldStorage.values.suppressReason = 'offline leave';
  const exitReloginOfflineHoldRemaining = exitRelogin.offlineReloginHoldRemainingMsBoundCore(
    exitReloginHoldBot,
    exitReloginHoldStorage,
    {
      loginSuppressKey: 'suppress',
      loginSuppressReasonKey: 'suppressReason',
      offlineLeaveStateKey: 'offline-state',
      readPersistentExitState: () => ({ reloginUntil: 2000, reason: 'offline-leave' }),
      staleOfflineStaminaHoldContradicted: () => false,
      clearOfflineReloginHold: reason => {
        exitReloginHoldBot.clearedOfflineReason = reason;
      },
      now: () => 1000
    }
  );
  const exitReloginClearStorage = {
    values: {
      suppress: '5000',
      suppressReason: 'offline leave'
    },
    getItem(key) {
      return this.values[key] ?? null;
    },
    removeItem(key) {
      this.removed = this.removed || [];
      this.removed.push(key);
      delete this.values[key];
    }
  };
  const exitReloginClearedSuppress = exitRelogin.clearLoginSuppressMatchingBoundCore(
    exitReloginClearStorage,
    /offline.*leave/i,
    {
      loginSuppressKey: 'suppress',
      loginSuppressReasonKey: 'suppressReason'
    }
  );
  const exitReloginOfflineSuppressEvents = [];
  const exitReloginOfflineSuppressBot = {
    offlineReloginUntil: 4500,
    lastOfflineLeaveWaitMs: 3500,
    lastOfflineLeaveResult: null
  };
  const exitReloginOfflineSuppressDetail = {
    offlineSafety: { unsafe: true },
    summary: 'offline suppress spike'
  };
  const exitReloginOfflineSuppressReturn = exitRelogin.setOfflineLeaveSuppressCore(
    exitReloginOfflineSuppressBot,
    'offline unsafe spike',
    exitReloginOfflineSuppressDetail,
    { hp: 80 },
    {},
    {
      now: 1000,
      staminaExitHoldUntilForDetail: () => null,
      offlineExitRequiresUnsafeReloginDelay: () => true,
      finalizeLeaveDisplayReason: detail => {
        detail.finalized = true;
        return detail;
      },
      writePersistentExitState: (key, detail) => exitReloginOfflineSuppressEvents.push(['write-exit', key, detail.safeReloginAllowed]),
      setExitReloginSuppress: () => {
        throw new Error('unexpected suppress path for zero-hold spike');
      },
      offlineLeaveStateKey: 'offline-state'
    }
  );
  const exitReloginOfflineSuppressBoundCalls = [];
  const exitReloginOfflineSuppressBoundDetail = {
    offlineSafety: { staminaBudgetExit: { coin: { id: 'bound-budget-coin' } } },
    summary: 'offline suppress bound spike'
  };
  const exitReloginOfflineSuppressBoundReturn = exitRelogin.setOfflineLeaveSuppressBoundCore(
    { offlineReloginUntil: 0, lastOfflineLeaveWaitMs: 0 },
    {
      getItem: () => null
    },
    'stamina budget spike',
    exitReloginOfflineSuppressBoundDetail,
    { hp: 90 },
    {},
    {
      loginSuppressKey: 'suppress',
      loginSuppressReasonKey: 'suppressReason',
      enemyLeaveStateKey: 'enemy-state',
      offlineLeaveStateKey: 'offline-state',
      now: () => 1000,
      staminaBudgetReloginDelayMs: () => 3000,
      staminaResetHoldUntil: () => null,
      hpInfoForRelogin: selfLike => ({ hp: selfLike?.hp }),
      reloginDelayForHp: () => {
        throw new Error('unexpected variable delay for bound stamina hold spike');
      },
      updateEnemyLeaveStreak: () => {},
      clearLoginSuppressMatching: () => {},
      finalizeLeaveDisplayReason: detail => detail,
      writePersistentExitState: (key, detail) => {
        exitReloginOfflineSuppressBoundCalls.push(['write-exit', key, detail.loginSuppressReason, detail.staminaBudgetHold?.staminaBudgetExit?.coin?.id]);
      },
      setLoginSuppress: (storageReason, delayMs) => {
        exitReloginOfflineSuppressBoundCalls.push(['set-suppress', storageReason, delayMs]);
        return 1000 + delayMs;
      }
    }
  );
  const exitReloginPendingStaminaDetail = {
    offlineSafety: { staminaBudgetExit: { coin: { id: 'stamina-spike' } } }
  };
  const exitReloginPendingStaminaUntil = exitRelogin.primePendingStaminaExitLoginSuppressBoundCore(
    exitReloginPendingStaminaDetail,
    {
      now: () => 1000,
      staminaBudgetReloginDelayMs: () => 5000,
      staminaResetHoldUntil: () => null,
      setLoginSuppress: (reason, delayMs) => {
        exitReloginOfflineSuppressEvents.push(['set-login-suppress', reason, delayMs]);
        return 1000 + delayMs;
      }
    }
  );
  const exitReloginClearEnemyEvents = [];
  const exitReloginClearEnemyDetail = { reloginUntil: 7000, holdRemainingMs: 5000, reloginDelayMs: 6000 };
  const exitReloginClearActiveEnemyDetail = { reloginUntil: 6500, holdRemainingMs: 4500, reloginDelayMs: 5500 };
  const exitReloginClearEnemyBot = {
    pursuitReloginUntil: 7000,
    lastEnemyLeaveWaitMs: 5000,
    lastEnemyLeaveResult: exitReloginClearEnemyDetail,
    lastPursuitLeaveResult: { reloginUntil: 6200 },
    lastCombatLeaveResult: null,
    lastInjuryLeaveResult: { reloginUntil: 6100 },
    pendingExit: { scope: 'offline', reason: 'keep-offline' }
  };
  const exitReloginClearEnemyStorage = {
    values: {
      suppress: '9000',
      suppressReason: 'combat leave'
    },
    removed: [],
    getItem(key) {
      return this.values[key] ?? null;
    },
    removeItem(key) {
      this.removed.push(key);
      if (key === 'suppressReason') exitReloginClearEnemyEvents.push(['clear-suppress', true]);
      delete this.values[key];
    }
  };
  exitRelogin.clearEnemyReloginHoldBoundCore(exitReloginClearEnemyBot, exitReloginClearEnemyStorage, 'spike enemy recovery', {
    now: () => 6000,
    activeEnemyLeaveDetail: () => exitReloginClearActiveEnemyDetail,
    writePersistentPendingExitState: pending => exitReloginClearEnemyEvents.push(['write-pending', pending.reason]),
    clearPersistentPendingExitState: () => exitReloginClearEnemyEvents.push(['clear-pending']),
    clearExitHoldDetail: (detail, reason, t) => {
      detail.reloginUntil = 0;
      detail.holdRemainingMs = 0;
      detail.reloginDelayMs = 0;
      detail.clearedReason = reason;
      detail.clearedAt = t;
      exitReloginClearEnemyEvents.push(['clear-detail', reason, t]);
    },
    clearPersistentExitState: key => exitReloginClearEnemyEvents.push(['clear-exit', key]),
    loginSuppressKey: 'suppress',
    loginSuppressReasonKey: 'suppressReason',
    enemyLeaveStateKey: 'enemy-state'
  });
  const exitReloginClearOfflineEvents = [];
  const exitReloginClearOfflineDetail = { reloginUntil: 8000, holdRemainingMs: 4000, reloginDelayMs: 3000 };
  const exitReloginClearOfflineBot = {
    offlineReloginUntil: 8000,
    lastOfflineLeaveWaitMs: 4000,
    lastOfflineLeaveResult: exitReloginClearOfflineDetail,
    pendingExit: { scope: 'enemy', reason: 'keep-enemy' }
  };
  const exitReloginClearOfflineStorage = {
    values: {
      suppress: '10000',
      suppressReason: 'offline leave'
    },
    removed: [],
    getItem(key) {
      return this.values[key] ?? null;
    },
    removeItem(key) {
      this.removed.push(key);
      if (key === 'suppressReason') exitReloginClearOfflineEvents.push(['clear-suppress', true]);
      delete this.values[key];
    }
  };
  exitRelogin.clearOfflineReloginHoldBoundCore(exitReloginClearOfflineBot, exitReloginClearOfflineStorage, 'spike offline recovery', {
    now: () => 7000,
    writePersistentPendingExitState: pending => exitReloginClearOfflineEvents.push(['write-pending', pending.reason]),
    clearPersistentPendingExitState: () => exitReloginClearOfflineEvents.push(['clear-pending']),
    clearPersistentExitState: key => exitReloginClearOfflineEvents.push(['clear-exit', key]),
    loginSuppressKey: 'suppress',
    loginSuppressReasonKey: 'suppressReason',
    offlineLeaveStateKey: 'offline-state'
  });
  const names = targetWhitelist.parseTargetWhitelistNames({
    names: [' Firefox\u200e ', 'Firefox', '文月']
  }, 10);
  return {
    version: String(config.version || 'runtime-helper-entry'),
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
    dropMatchedKillVictim: dropMatchedKillResult?.kill?.victim,
    dropMatchedKillStaminaMs: dropMatchedKillResult?.kill?.battleStaminaSpentMs,
    staminaBudgetDailyLimited,
    staminaBudgetExitShortageMs: staminaBudgetExit?.shortageMs,
    opportunityConstantHighValue,
    opportunityConstantRoi,
    runtimeBootstrapVersion: runtimeBootstrapBinding.cfg.version,
    runtimeBootstrapBotKey: runtimeBootstrapBinding.BOT_KEY,
    runtimeBootstrapWhitelistCount: runtimeBootstrapBinding.targetWhitelistState.names.length,
    runtimeBootstrapWhitelistLastOkAt: runtimeBootstrapBinding.targetWhitelistState.lastOkAt,
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
    pendingExitCoreRetryMs,
    pendingExitCoreDisplayReason,
    pendingExitCoreRetryRemainingMs: pendingExitCoreSummary.retryRemainingMs,
    pendingExitCoreCombatDx: pendingExitCoreSummary.combatCover?.dx,
    pendingExitCoreHttp403,
    pendingExitCoreDetailHttp403,
    pendingExitCoreLeaveSucceeded,
    pendingExitCoreReloadRequestId: pendingExitCoreReloadConfirmation.requestId,
    pendingExitCoreReloadSatisfied,
    pendingExitCoreWaitReason,
    leaveCommandFailureMessage,
    leaveCommandResultStatus: leaveCommandResultSummary.status,
    leaveCommandClashFailed,
    leaveCommandNextClashStage,
    leaveCommandClashSummaryAt: leaveCommandClashSummary.at,
    leaveCommandRetryStage: leaveCommandRetryDetail.clashLeaveRescueStage,
    leaveCommandRetryPending: leaveCommandRetryDetail.leaveRequestPending,
    leaveCommandResetCleared: leaveCommandResetDetail.clashLeaveRescueAttempts.length === 0
      && leaveCommandResetDetail.clashLeaveRescue === null,
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
    runtimeStateLastSelfId: runtimeStateLastSelf?.id,
    runtimeStateLastSelfWritten: JSON.parse(runtimeStateStorage.values.get('state-last-self') || '{}')?.self?.id === 'state-binding-written',
    runtimeStateRestoredFailureCount: arrayCountRuntime.arrayCount(runtimeStateBinding.restoredFailures),
    runtimeStateRestoredEnemyReason: runtimeStateBinding.restoredEnemyLeaveState?.reason,
    runtimeStateRestoredEnemyHold: runtimeStateBinding.restoredEnemyLeaveState?.holdRemainingMs,
    runtimeStateInitialPendingReason: runtimeStateBinding.initialPendingExitState?.reason,
    runtimeStatePendingWrittenReason: runtimeStatePendingWritten?.reason,
    runtimeStateDiagnosticsSource: runtimeStateDiagnosticsBot.runtimeDiagnostics?.lastTickSource,
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
    exitReloginBoundStreakCount: exitReloginBoundStreak?.count,
    exitReloginBoundStreakRepeatDelay: exitReloginBoundStreakDetail.reloginRepeatDelayMs,
    exitReloginWrittenStreakCount: exitReloginStreakStorage.writtenValue?.count,
    exitReloginBotStreakKey: exitReloginStreakBot.enemyLeaveStreak?.key,
    exitReloginCombatSummary,
    exitReloginCombatActionDx: exitReloginCombatAction.dx,
    exitReloginCombatActionShoot: exitReloginCombatAction.shoot,
    exitReloginPursuitSummary,
    exitReloginInjurySummary,
    exitReloginHealthyHighValueInjurySuppressed,
    exitReloginLowHpHighValueInjurySuppressed,
    exitReloginOfflineSummary,
    exitReloginOfflineDisplay,
    exitReloginHpDelayMs: exitReloginHpDelay.delayMs,
    exitReloginHpDelayRepeatMinMs: exitReloginHpDelay.repeatMinMs,
    exitReloginSuppressMatch,
    exitReloginUnsafeMin,
    exitReloginPendingReason,
    exitReloginPendingUnsafeUntil,
    exitReloginPendingUnsafeDelay: exitReloginPendingUnsafeDetail.pendingLoginSuppressDelayMs,
    exitReloginPendingUnsafeReason: exitReloginPendingUnsafeDetail.pendingLoginSuppressReason,
    exitReloginPendingUnsafeMinimum: exitReloginPendingUnsafeDetail.pendingLoginSuppressMinimumDelayMs,
    exitReloginPendingUnsafeHpDelay: exitReloginPendingUnsafeDetail.pendingLoginSuppressHpDelayMs,
    exitReloginPendingUnsafeEnemyReason: exitReloginPendingUnsafeDetail.enemyLeaveReason,
    exitReloginPendingUnsafeEventCount: arrayCountRuntime.arrayCount(exitReloginPendingUnsafeEvents),
    exitReloginAuditId,
    exitReloginAuditResetReason: exitReloginAuditDetail.loginSnapshotGateReset?.reason,
    exitReloginAuditResetSelfHp: exitReloginAuditDetail.loginSnapshotGateReset?.selfHp,
    exitReloginAuditMetaSource: exitReloginAuditDetail.auditMetaSource,
    exitReloginAuditEventAt: exitReloginAuditEvents.find(event => event[0] === 'exit-trigger')?.[2],
    exitReloginAuditEventCount: arrayCountRuntime.arrayCount(exitReloginAuditEvents),
    exitReloginSuppressReuseUntil,
    exitReloginSuppressReuseBotUntil: exitReloginSuppressReuseBot.pursuitReloginUntil,
    exitReloginSuppressReuseHold: exitReloginSuppressReuseDetail.holdRemainingMs,
    exitReloginSuppressReuseReason: exitReloginSuppressReuseDetail.loginSuppressReason,
    exitReloginSuppressReusePersisted: exitReloginSuppressEvents.some(event => event[0] === 'write-exit' && event[1] === 'enemy-state' && event[3] === true),
    exitReloginSuppressZeroUntil,
    exitReloginSuppressZeroBotUntil: exitReloginSuppressZeroBot.offlineReloginUntil,
    exitReloginSuppressZeroSkipped: exitReloginSuppressZeroDetail.defensiveReloginDelaySkipped,
    exitReloginSuppressZeroPersisted: exitReloginSuppressEvents.some(event => event[0] === 'write-exit' && event[1] === 'offline-state' && event[2] === ''),
    exitReloginSuppressNewUntil,
    exitReloginSuppressNewDelay: exitReloginSuppressNewDetail.reloginDelayMs,
    exitReloginSuppressNewMinimum: exitReloginSuppressNewDetail.reloginMinimumDelayMs,
    exitReloginSuppressNewStreaked: exitReloginSuppressNewDetail.streaked,
    exitReloginSuppressNewPersisted: exitReloginSuppressEvents.some(event => event[0] === 'write-exit' && event[1] === 'enemy-state' && event[2] === 'enemy leave'),
    exitReloginSuppressBoundUntil,
    exitReloginSuppressBoundDelay: exitReloginSuppressBoundDetail.reloginDelayMs,
    exitReloginSuppressBoundStreakCount: exitReloginSuppressBoundDetail.enemyLeaveStreak?.count,
    exitReloginSuppressEventCount: arrayCountRuntime.arrayCount(exitReloginSuppressEvents),
    exitReloginBudgetHoldUntil: exitReloginBudgetHold?.until,
    exitReloginStaminaHoldReason: exitReloginStaminaHold?.reason,
    exitReloginStaminaHoldBoundReason: exitReloginStaminaHoldBound?.reason,
    exitReloginOfflineUnsafe,
    exitReloginEnemyHoldRemaining,
    exitReloginEnemyHoldBotUntil: exitReloginHoldBot.pursuitReloginUntil,
    exitReloginOfflineHoldRemaining,
    exitReloginOfflineHoldBotUntil: exitReloginHoldBot.offlineReloginUntil,
    exitReloginClearedSuppress,
    exitReloginClearRemovedCount: arrayCountRuntime.arrayCount(exitReloginClearStorage.removed || []),
    exitReloginOfflineSuppressReturn,
    exitReloginOfflineSuppressUntil: exitReloginOfflineSuppressBot.offlineReloginUntil,
    exitReloginOfflineSuppressWaitMs: exitReloginOfflineSuppressBot.lastOfflineLeaveWaitMs,
    exitReloginOfflineSuppressSafe: exitReloginOfflineSuppressDetail.safeReloginAllowed,
    exitReloginOfflineSuppressSkipped: exitReloginOfflineSuppressDetail.defensiveReloginDelaySkipped,
    exitReloginOfflineSuppressFinalized: exitReloginOfflineSuppressDetail.finalized,
    exitReloginOfflineSuppressBoundReturn,
    exitReloginOfflineSuppressBoundReason: exitReloginOfflineSuppressBoundCalls.find(call => call[0] === 'set-suppress')?.[1],
    exitReloginOfflineSuppressBoundCoin: exitReloginOfflineSuppressBoundCalls.find(call => call[0] === 'write-exit')?.[3],
    exitReloginOfflineSuppressBoundFixed: exitReloginOfflineSuppressBoundCalls.find(call => call[0] === 'set-suppress')?.[2],
    exitReloginPendingStaminaUntil,
    exitReloginPendingStaminaDelay: exitReloginPendingStaminaDetail.pendingLoginSuppressDelayMs,
    exitReloginPendingStaminaBudgetCoin: exitReloginPendingStaminaDetail.staminaBudgetHold?.staminaBudgetExit?.coin?.id,
    exitReloginPrefixEventCount: arrayCountRuntime.arrayCount(exitReloginOfflineSuppressEvents),
    exitReloginEnemyClearUntil: exitReloginClearEnemyBot.pursuitReloginUntil,
    exitReloginEnemyClearPendingReason: exitReloginClearEnemyBot.pendingExit?.reason,
    exitReloginEnemyClearDetailAt: exitReloginClearEnemyDetail.onlineRecoveryAt,
    exitReloginEnemyClearDetailHold: exitReloginClearEnemyDetail.holdRemainingMs,
    exitReloginEnemyClearEventCount: arrayCountRuntime.arrayCount(exitReloginClearEnemyEvents),
    exitReloginEnemyClearRemovedCount: arrayCountRuntime.arrayCount(exitReloginClearEnemyStorage.removed),
    exitReloginOfflineClearUntil: exitReloginClearOfflineBot.offlineReloginUntil,
    exitReloginOfflineClearPendingReason: exitReloginClearOfflineBot.pendingExit?.reason,
    exitReloginOfflineClearDetailAt: exitReloginClearOfflineDetail.onlineRecoveryAt,
    exitReloginOfflineClearDetailHold: exitReloginClearOfflineDetail.holdRemainingMs,
    exitReloginOfflineClearEventCount: arrayCountRuntime.arrayCount(exitReloginClearOfflineEvents),
    exitReloginOfflineClearRemovedCount: arrayCountRuntime.arrayCount(exitReloginClearOfflineStorage.removed),
    preservedKills: arrayCountRuntime.arrayCount(preservedState.buildBrowserPreservedState({
      killHistory: ['a', 'b', 'c']
    }).killHistory),
    defaultStatusEvery: runtimeDefaults.buildRuntimeDefaults({ statusEvery: 0 }, false).statusEvery,
    storageProbe: pageAdapter.readPageLocalStorageJson('graspRatRuntimeHelperEntryProbe', { ok: false }),
    json: runtimeUtils.safeStringify({
      ok: true,
      bigint: BigInt(7)
    })
  };
}

function installRuntimeHelperEntry(config = {}) {
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
  pageAdapter.installPageGlobal(HELPER_ENTRY_KEY, installed);
  return installed.status();
}

const runtimeConfig = normalizeConfig(pageAdapter.readPageGlobal(CONFIG_KEY, {}));

installRuntimeHelperEntry(runtimeConfig);

export {
  HELPER_ENTRY_KEY,
  helperStatus,
  installRuntimeHelperEntry
};
