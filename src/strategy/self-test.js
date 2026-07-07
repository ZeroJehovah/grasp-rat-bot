'use strict';

/**
 * Strategy Module Self-Tests
 *
 * Tests for the extracted strategy modules to ensure correctness.
 */

const { ACTION_PRIORITY_BANDS, getActionPriorityBand, buildActionFocus } = require('./action-priority');
const { applyFinalActionArbitration } = require('./action-arbitration');
const { recordActionSwitchDiagnosticsCore } = require('./action-switch-diagnostics');
const { attackWorthTakingCore } = require('./attack-worth');
const {
  exitMotionStopLockRemainingMsCore,
  postExitDecisionWithoutTargetCore
} = require('./exit-motion');
const {
  pendingExitRetryMsCore,
  pendingExitDisplayReasonCore,
  summarizePendingExitCore,
  leaveRequestHasHttp403Core,
  leaveDetailHasHttp403Core,
  leaveDetailSucceededCore,
  leaveSuccessReloadConfirmationForDetailCore,
  leaveSuccessReloadConfirmationSatisfiedCore,
  pendingExitWaitReasonCore
} = require('./pending-exit');
const {
  leaveCommandFailureMessageCore,
  summarizeLeaveCommandResultCore,
  leaveDetailFailedForClashRescueCore,
  clashLeaveRescueAttemptsCore,
  nextClashLeaveRescueStageCore,
  summarizeClashLeaveRescueResultCore,
  clashLeaveRescueRetryDetailCore,
  resetClashLeaveRescueRoundCore
} = require('./leave-command');
const { buildCoinDiagnostics, addCoinFilterDiagnostic } = require('./coin-diagnostics');
const {
  coinAxisLockShouldHoldCore,
  coinDirectionToCore,
  coinMotionMetaCore,
  coinPickupPrecisionPulseMsCore
} = require('./coin-motion');
const {
  coinTargetKeyCore,
  coinMatchesTrackedTargetCore,
  trackedCoinTargetForCollectionCore,
  buildNativeCoinSnapshotCore,
  pointToSegmentDistanceCore,
  pickIncidentalCoinPickupsCore,
  snapshotCoinWorthLongTravelCore,
  snapshotCoinNavigationReasonCore
} = require('./coin-target');
const {
  coinFailureIgnoreCore,
  staleCoinEscapeDirectionCore,
  coinProgressIntentCore,
  coinAttemptExpiredCore,
  updateCoinAttemptCore,
  updateCoinProgressRecordCore,
  buildIgnoredCoinProgressCore,
  buildIgnoredCoinPatrolActionCore,
  coinIgnoreCleanupIntentCore
} = require('./coin-progress');
const {
  buildCoinRouteFromAnchorCore,
  coinRouteActionMetaCore,
  coinRouteSkipsCloserFirstCoinCore,
  pickCoinRouteOpportunityCore
} = require('./coin-route');
const {
  opportunityChoiceType,
  opportunityChoiceId,
  opportunityChoiceKey,
  opportunityMatchesChoiceCore,
  chooseStableOpportunityCore,
  buildMissingHeldOpportunityCore,
  rememberOpportunityChoiceCore
} = require('./opportunity-choice');
const {
  opportunityPriorityTierCore,
  buildOpportunityCandidatesCore,
  bestCoinOpportunityScoreCore
} = require('./opportunity-candidates');
const { pickBestOpportunityCore } = require('./opportunity-pick');
const { patrolDirectionCore } = require('./patrol');
const {
  postAttackVisibleCoinExistsCore,
  pickPostAttackDropCoinCore,
  pickPostAttackDropWaitTargetCore
} = require('./post-attack-drop');
const { buildDropMatchedKillCore } = require('./drop-matched-kill');
const {
  dailyStaminaBudgetIsLimitingCore,
  summarizeBlockedStaminaOpportunityCore,
  summarizeNearestCoinStaminaBudgetExitCore,
  pickNearestDailyStaminaFinalCoinCore
} = require('./stamina-budget');
const {
  aggregateChaseCandidates,
  buildChaseSourceListsCore,
  chaseKilledCandidateSuppressionDecision,
  chaseLowDropClearDecision,
  chooseChaseTarget,
  decorateChaseTargets,
  normalizeChaseCandidate,
  normalizeChaseModeState,
  selectPanelCandidates
} = require('./chase-mode');
const { COMBAT_CONSTANTS, validateCombatConstants } = require('./combat-constants');
const { OPPORTUNITY_CONSTANTS, calculateOpportunityROI, validateOpportunityConstants } = require('./opportunity-constants');

function runStrategyModuleSelfTests() {
  const results = [];

  // Test action priority bands
  results.push({
    name: 'action-priority-exit',
    passed: getActionPriorityBand({ kind: 'leave' }) === ACTION_PRIORITY_BANDS.exit
  });

  results.push({
    name: 'action-priority-safety',
    passed: getActionPriorityBand({ kind: 'flee' }) === ACTION_PRIORITY_BANDS.safety
  });

  results.push({
    name: 'action-priority-combat',
    passed: getActionPriorityBand({ kind: 'combat' }) === ACTION_PRIORITY_BANDS.combat
  });

  results.push({
    name: 'action-priority-profit',
    passed: getActionPriorityBand({ kind: 'coin' }) === ACTION_PRIORITY_BANDS.profit
  });

  const attackWorthOptions = {
    isWhitelistedTarget: target => target?.whitelisted === true,
    dropValue: actor => Number(actor?.drop || 0),
    isAfkProfitTarget: target => target?.afk === true,
    attackMinDrop: 3,
    attackMinAfkDrop: 2,
    attackMinRewardRatio: 1.5
  };
  results.push({
    name: 'attack-worth-core-blocks-whitelisted-target',
    passed: attackWorthTakingCore({ drop: 0 }, { drop: 99, whitelisted: true }, attackWorthOptions) === false
  });
  results.push({
    name: 'attack-worth-core-uses-afk-drop-threshold',
    passed: attackWorthTakingCore({ drop: 0 }, { drop: 2, afk: true }, attackWorthOptions) === true
      && attackWorthTakingCore({ drop: 0 }, { drop: 1, afk: true }, attackWorthOptions) === false
  });
  results.push({
    name: 'attack-worth-core-uses-reward-ratio-for-active-target',
    passed: attackWorthTakingCore({ drop: 4 }, { drop: 5 }, attackWorthOptions) === false
      && attackWorthTakingCore({ drop: 4 }, { drop: 6 }, attackWorthOptions) === true
  });

  results.push({
    name: 'exit-motion-core-computes-stop-lock',
    passed: exitMotionStopLockRemainingMsCore(1000, 8000, 2500) === 6500
      && exitMotionStopLockRemainingMsCore(1000, -1, 2500) === 0
      && exitMotionStopLockRemainingMsCore(0, 8000, 2500) === 0
  });
  const postExitPreviousDecision = postExitDecisionWithoutTargetCore({
    kind: 'combat',
    reason: 'previous-reason',
    dx: 1,
    dy: -1,
    target: { id: 'enemy' },
    aimTarget: { id: 'enemy' },
    opportunisticShot: { id: 'enemy' },
    combat: true,
    shoot: true,
    forceShoot: true,
    combatCover: { id: 'cover' }
  }, '', {
    lastExitMotionStopReason: 'last-stop',
    exitMotionLockRemainingMs: () => 123
  });
  results.push({
    name: 'exit-motion-core-sanitizes-targeted-decision',
    passed: postExitPreviousDecision.kind === 'wait'
      && postExitPreviousDecision.reason === 'previous-reason'
      && postExitPreviousDecision.dx === 0
      && postExitPreviousDecision.dy === 0
      && postExitPreviousDecision.target === null
      && postExitPreviousDecision.aimTarget === null
      && postExitPreviousDecision.opportunisticShot === null
      && postExitPreviousDecision.combat === false
      && postExitPreviousDecision.shoot === false
      && postExitPreviousDecision.forceShoot === false
      && postExitPreviousDecision.combatCover === null
      && postExitPreviousDecision.exitMotionStopped === true
      && postExitPreviousDecision.exitMotionStopReason === 'last-stop'
      && postExitPreviousDecision.exitMotionLockRemainingMs === 123
  });
  const postExitExplicitReason = postExitDecisionWithoutTargetCore(null, 'exit-confirmed', {
    lastExitMotionStopReason: 'last-stop',
    exitMotionLockRemainingMs: 0
  });
  results.push({
    name: 'exit-motion-core-explicit-reason-overrides-fallbacks',
    passed: postExitExplicitReason.reason === 'exit-confirmed'
      && postExitExplicitReason.exitMotionStopReason === 'exit-confirmed'
      && postExitExplicitReason.exitMotionLockRemainingMs === 0
  });

  const pendingExitRetryOptions = {
    leaveRetryMinMs: 10000,
    leaveCommandTimeoutMs: 3000,
    offlineLeaveRetryMs: 12000,
    combatLeaveRetryMs: 4000,
    pursuitLeaveRetryMs: 16000
  };
  results.push({
    name: 'pending-exit-retry-core-applies-source-specific-floors',
    passed: pendingExitRetryMsCore({ scope: 'offline', source: 'offline' }, pendingExitRetryOptions) === 12000
      && pendingExitRetryMsCore({ scope: 'enemy', source: 'pursuit' }, pendingExitRetryOptions) === 16000
      && pendingExitRetryMsCore({ scope: 'enemy', source: 'combat' }, pendingExitRetryOptions) === 10000
  });
  results.push({
    name: 'pending-exit-display-core-uses-summary-fallback',
    passed: pendingExitDisplayReasonCore('追击退出') === '追击退出，等待退出确认，未退出会继续补发'
      && pendingExitDisplayReasonCore('') === '退出请求已发送，等待退出确认，未退出会继续补发'
  });
  const pendingExitSummary = summarizePendingExitCore({
    scope: 'enemy',
    source: 'combat',
    reason: 'combat leave',
    summary: '战斗退出',
    displayReason: '战斗退出等待',
    at: 1000,
    lastAttemptAt: 1500,
    retryCount: 2,
    userId: 'self-1',
    combatCover: { reason: 'cover', dx: 2, dy: -2, shoot: true },
    lastResult: { leaveRequestPending: true, error: 'timeout' }
  }, {
    nowMs: 2500,
    retryMs: 3000,
    reloadConfirmation: {
      required: true,
      requestedAt: 1800,
      reloadedAt: 2200,
      restoredAfterReload: true,
      count: 1,
      reason: 'leave-success'
    }
  });
  results.push({
    name: 'pending-exit-summary-core-normalizes-runtime-status',
    passed: pendingExitSummary.ageMs === 1500
      && pendingExitSummary.lastAttemptAgeMs === 1000
      && pendingExitSummary.retryRemainingMs === 2000
      && pendingExitSummary.leaveRequestPending === true
      && pendingExitSummary.reloadConfirmation?.ageAfterReloadMs === 300
      && pendingExitSummary.combatCover?.dx === 1
      && pendingExitSummary.combatCover?.dy === -1
      && pendingExitSummary.lastError === 'timeout'
  });
  results.push({
    name: 'pending-exit-leave-request-http-403-core-detects-status-and-text',
    passed: leaveRequestHasHttp403Core({ status: 403 }) === true
      && leaveRequestHasHttp403Core({ result: { statusCode: 403 } }) === true
      && leaveRequestHasHttp403Core({ message: 'HTTP 403 Forbidden' }) === true
      && leaveRequestHasHttp403Core({ message: 'HTTP 4030' }) === false
  });
  results.push({
    name: 'pending-exit-leave-detail-http-403-core-scans-request-history',
    passed: leaveDetailHasHttp403Core({ lastLeaveRequest: { statusCode: 403 } }) === true
      && leaveDetailHasHttp403Core({ leaveRequests: [{ status: 500 }, { statusText: 'Forbidden' }] }) === true
      && leaveDetailHasHttp403Core({ leaveRequests: [{ status: 500 }] }) === false
  });
  results.push({
    name: 'pending-exit-leave-detail-success-core-rejects-error-pending-and-403',
    passed: leaveDetailSucceededCore({ attempted: true, method: 'leave', lastLeaveRequest: { completedAt: 1000 } }) === true
      && leaveDetailSucceededCore({ attempted: true, leaveRequestPending: true, method: 'leave' }) === false
      && leaveDetailSucceededCore({ attempted: true, error: 'timeout', method: 'leave' }) === false
      && leaveDetailSucceededCore({ attempted: true, method: 'leave', lastLeaveRequest: { status: 403 } }) === false
  });
  const existingReloadConfirmation = {
    required: true,
    requestedAt: 1100,
    count: 2,
    restoredAfterReload: true
  };
  const normalizeReloadConfirmation = value => value?.required ? value : null;
  const leaveSuccessReloadConfirmation = leaveSuccessReloadConfirmationForDetailCore({
    attempted: true,
    at: 900,
    lastLeaveRequest: {
      completedAt: 1000,
      requestId: 'leave-request-1'
    }
  }, {
    reloadConfirmation: existingReloadConfirmation
  }, 1200, {
    normalizeReloadConfirmation
  });
  results.push({
    name: 'pending-exit-leave-success-reload-confirmation-core-preserves-existing-state',
    passed: leaveSuccessReloadConfirmation.required === true
      && leaveSuccessReloadConfirmation.reason === 'leave-success'
      && leaveSuccessReloadConfirmation.leaveSucceededAt === 1000
      && leaveSuccessReloadConfirmation.requestId === 'leave-request-1'
      && leaveSuccessReloadConfirmation.requestedAt === 1100
      && leaveSuccessReloadConfirmation.count === 2
      && leaveSuccessReloadConfirmationForDetailCore({ attempted: false }, {
        reloadConfirmation: existingReloadConfirmation
      }, 1200, { normalizeReloadConfirmation }) === existingReloadConfirmation
  });
  results.push({
    name: 'pending-exit-leave-success-reload-confirmation-satisfied-core-checks-reload-marker',
    passed: leaveSuccessReloadConfirmationSatisfiedCore({ restoredAfterReload: true }) === true
      && leaveSuccessReloadConfirmationSatisfiedCore({ reloadedAt: 1200 }) === true
      && leaveSuccessReloadConfirmationSatisfiedCore({ requestedAt: 1100 }) === false
  });
  results.push({
    name: 'pending-exit-wait-reason-core-preserves-source-reasons',
    passed: pendingExitWaitReasonCore({ scope: 'offline', source: 'offline' }, false) === 'offline-leave'
      && pendingExitWaitReasonCore({ scope: 'offline', source: 'offline' }, true) === 'offline-leave-wait'
      && pendingExitWaitReasonCore({ scope: 'enemy', source: 'pursuit' }, false) === 'pursuit-leave-retry'
      && pendingExitWaitReasonCore({ scope: 'enemy', source: 'combat' }, true) === 'enemy-leave-wait'
  });
  results.push({
    name: 'leave-command-failure-message-core-classifies-result-errors',
    passed: leaveCommandFailureMessageCore(false) === 'leave request returned false'
      && leaveCommandFailureMessageCore({ ok: false, message: 'blocked' }) === 'blocked'
      && leaveCommandFailureMessageCore({ error: 'network' }) === 'network'
      && leaveCommandFailureMessageCore({ status: 500, statusText: 'server' }) === 'server'
      && leaveCommandFailureMessageCore({ ok: true }) === ''
  });
  const summarizedLeaveResult = summarizeLeaveCommandResultCore({
    ok: false,
    statusCode: 403,
    statusText: 'Forbidden',
    message: 'blocked',
    error: 'denied'
  });
  results.push({
    name: 'leave-command-result-summary-core-normalizes-primitive-and-object-results',
    passed: summarizeLeaveCommandResultCore(undefined).type === 'undefined'
      && summarizeLeaveCommandResultCore(false).value === false
      && summarizeLeaveCommandResultCore('abc').value === 'abc'
      && summarizedLeaveResult.type === 'object'
      && summarizedLeaveResult.status === 403
      && summarizedLeaveResult.error === 'denied'
  });
  results.push({
    name: 'leave-command-clash-rescue-failure-core-gates-hook-enabled-failed-detail',
    passed: leaveDetailFailedForClashRescueCore({
      attempted: true,
      error: 'timeout'
    }, {
      clashLeaveRescueEnabled: true,
      hasClashLeaveRescueHook: true
    }) === true
      && leaveDetailFailedForClashRescueCore({
        attempted: true,
        error: 'timeout'
      }, {
        clashLeaveRescueEnabled: true,
        hasClashLeaveRescueHook: false
      }) === false
      && leaveDetailFailedForClashRescueCore({
        attempted: true,
        method: 'leave',
        lastLeaveRequest: { completedAt: 1000 }
      }, {
        clashLeaveRescueEnabled: true,
        hasClashLeaveRescueHook: true
      }) === false
  });
  const clashAttemptsDetail = {
    clashLeaveRescueAttempts: [
      null,
      { stage: 'auto' },
      'bad',
      { stage: 'direct' }
    ]
  };
  results.push({
    name: 'leave-command-clash-rescue-stage-core-filters-attempts-and-picks-next',
    passed: clashLeaveRescueAttemptsCore(clashAttemptsDetail).length === 2
      && nextClashLeaveRescueStageCore(clashAttemptsDetail) === 'manual'
      && nextClashLeaveRescueStageCore({ clashLeaveRescueAttempts: [{ stage: 'auto' }] }, {
        stageOrder: ['auto', 'manual']
      }) === 'manual'
  });
  const clashResultSummary = summarizeClashLeaveRescueResultCore({
    ok: false,
    target: 'proxy',
    closeConnections: {
      ok: false,
      status: 599,
      error: 'close failed'
    }
  }, 'direct', '', { nowMs: 2000 });
  results.push({
    name: 'leave-command-clash-rescue-result-core-summarizes-proxy-result',
    passed: clashResultSummary.stage === 'direct'
      && clashResultSummary.ok === false
      && clashResultSummary.target === 'proxy'
      && clashResultSummary.at === 2000
      && clashResultSummary.closeConnections?.status === 599
  });
  const clashRetryDetail = clashLeaveRescueRetryDetailCore({
    at: 1000,
    attempted: true,
    method: 'leave',
    error: '403',
    leaveRequestPending: true,
    lastLeaveRequest: { requestId: 'old' },
    leaveRequests: [{ requestId: 'old' }],
    reason: 'leave-http-403',
    clashLeaveRescueAttempts: [{ stage: 'auto' }]
  }, 'direct', {
    nowMs: 3000,
    cloneForPendingExit: value => ({ ...value, cloned: true }),
    pendingExitDisplayReason: summary => 'display:' + summary
  });
  results.push({
    name: 'leave-command-clash-rescue-retry-detail-core-clears-stale-request-state',
    passed: clashRetryDetail.cloned === true
      && clashRetryDetail.at === 3000
      && clashRetryDetail.attempted === false
      && clashRetryDetail.method === ''
      && clashRetryDetail.error === ''
      && clashRetryDetail.leaveRequestPending === false
      && Array.isArray(clashRetryDetail.leaveRequests)
      && clashRetryDetail.leaveRequests.length === 0
      && clashRetryDetail.clashLeaveRescueStage === 'direct'
      && clashRetryDetail.displayReason === 'display:leave-http-403'
  });
  const clashResetDetail = resetClashLeaveRescueRoundCore({
    clashLeaveRescueAttempts: [{ stage: 'auto' }],
    clashLeaveRescue: { stage: 'auto' },
    clashLeaveRescueStage: 'auto',
    clashLeaveRescueRetry: true
  });
  results.push({
    name: 'leave-command-clash-rescue-reset-core-clears-round-state',
    passed: Array.isArray(clashResetDetail.clashLeaveRescueAttempts)
      && clashResetDetail.clashLeaveRescueAttempts.length === 0
      && clashResetDetail.clashLeaveRescue === null
      && clashResetDetail.clashLeaveRescueStage === ''
      && clashResetDetail.clashLeaveRescueRetry === false
  });

  // Test action focus building
  const testAction = {
    kind: 'coin',
    reason: 'test-coin',
    target: { id: 'test123', x: 1000, y: 2000 }
  };
  const focus = buildActionFocus(testAction);
  results.push({
    name: 'action-focus-build',
    passed: focus && focus.kind === 'coin' && focus.targetKey === 'test123'
  });

  // Test arbitration - safety over profit
  const safetyAction = { kind: 'flee', reason: 'test-flee' };
  const profitAction = { kind: 'coin', reason: 'test-coin' };

  const state1 = {
    lastAction: safetyAction,
    lastFocus: buildActionFocus(safetyAction),
    lastSelectedAt: Date.now() - 100,
    lastOverride: null,
    history: []
  };

  const arb1 = applyFinalActionArbitration(
    profitAction,
    safetyAction,
    state1,
    { finalActionArbitrationHoldMs: 480 }
  );

  results.push({
    name: 'arbitration-safety-holds-over-profit',
    passed: arb1.held && arb1.action.kind === 'flee'
  });

  // Test arbitration - combat over profit (should hold)
  const combatAction = { kind: 'combat', reason: 'test-combat' };
  const state2 = {
    lastAction: combatAction,
    lastFocus: buildActionFocus(combatAction),
    lastSelectedAt: Date.now() - 100,
    lastOverride: null,
    history: []
  };

  const arb2 = applyFinalActionArbitration(
    profitAction,
    combatAction,
    state2,
    { finalActionArbitrationHoldMs: 480 }
  );

  results.push({
    name: 'arbitration-combat-holds-over-profit',
    passed: arb2.held && arb2.action.kind === 'combat'
  });

  // Test arbitration - profit does not hold over combat
  const state3 = {
    lastAction: profitAction,
    lastFocus: buildActionFocus(profitAction),
    lastSelectedAt: Date.now() - 100,
    lastOverride: null,
    history: []
  };

  const arb3 = applyFinalActionArbitration(
    combatAction,
    profitAction,
    state3,
    { finalActionArbitrationHoldMs: 480 }
  );

  results.push({
    name: 'arbitration-profit-does-not-hold-over-combat',
    passed: !arb3.held && arb3.action.kind === 'combat'
  });

  // Test arbitration - exit never held
  const exitAction = { kind: 'leave', reason: 'test-exit' };
  const state4 = {
    lastAction: combatAction,
    lastFocus: buildActionFocus(combatAction),
    lastSelectedAt: Date.now() - 100,
    lastOverride: null,
    history: []
  };

  const arb4 = applyFinalActionArbitration(
    exitAction,
    combatAction,
    state4,
    { finalActionArbitrationHoldMs: 480 }
  );

  results.push({
    name: 'arbitration-exit-never-held',
    passed: !arb4.held && arb4.action.kind === 'leave'
  });

  // Test target switch diagnostics
  const switchState = { lastFocus: null, lastTargetFocus: null, lastSwitch: null, events: [] };
  recordActionSwitchDiagnosticsCore(
    { kind: 'coin', reason: 'best-opportunity-coin', target: { id: 'coin-a', amount: 1 } },
    switchState,
    { nowMs: 1000, historyLimit: 24, oscillationWindowMs: 10000 }
  );
  const switchResult = recordActionSwitchDiagnosticsCore(
    { kind: 'coin', reason: 'best-opportunity-coin', target: { id: 'coin-b', amount: 1 } },
    switchState,
    {
      nowMs: 1120,
      historyLimit: 24,
      oscillationWindowMs: 10000,
      tickCount: 7,
      source: 'self-test',
      previousDecision: { kind: 'coin', reason: 'previous', score: 1.6, staminaCost: 9.2 }
    }
  );
  results.push({
    name: 'target-switch-diagnostic-records-event',
    passed: switchResult.event
      && switchResult.action.targetSwitch
      && switchResult.event.type === 'target-switch'
      && switchResult.event.pairSwitchCount === 1
      && switchResult.event.previousDecision.score === 2
      && switchResult.event.previousDecision.staminaCost === 9
  });

  const oscillationResult = recordActionSwitchDiagnosticsCore(
    { kind: 'coin', reason: 'best-opportunity-coin', target: { id: 'coin-a', amount: 1 } },
    switchState,
    { nowMs: 1240, historyLimit: 24, oscillationWindowMs: 10000 }
  );
  results.push({
    name: 'target-switch-diagnostic-detects-reversal',
    passed: oscillationResult.event
      && oscillationResult.event.pairSwitchCount === 2
      && oscillationResult.event.oscillating === true
  });

  // Test coin diagnostics
  const coinDiag = buildCoinDiagnostics(
    { x: 10.2, y: 20.6 },
    {
      realtimeNearCoins: [{ drop_id: 'near', amount: 1, distance: 100 }],
      realtimeCoins: [
        { drop_id: 'ignored', amount: 2, distance: 300, x: 10, y: 20, native: true },
        { drop_id: 'far', amount: 9, distance: 20000 }
      ],
      realtimeGlobalCoins: [{ drop_id: 'global', amount: 1, distance: 400 }],
      realtimePatrolCoins: [],
      snapshotCoins: [{ drop_id: 'snap', amount: 5, distance: 500, snapshot: true }]
    },
    {
      nearDistance: 1000,
      limit: 4,
      nowMs: 1000,
      ignoredCoinUntil: coin => coin?.drop_id === 'ignored' ? 2500 : 0
    }
  );
  results.push({
    name: 'coin-diagnostics-builds-near-summaries',
    passed: coinDiag
      && coinDiag.nearDistance === 1000
      && coinDiag.realtimeNearCount === 1
      && coinDiag.realtimeCount === 2
      && coinDiag.ignoredNearCoins[0]?.id === 'ignored'
      && coinDiag.ignoredNearCoins[0]?.remainingMs === 1500
      && coinDiag.snapshotOnlyNearCoins[0]?.id === 'snap'
      && coinDiag.nearestRealtimeCoins[0]?.id === 'ignored'
  });

  addCoinFilterDiagnostic(coinDiag, { drop_id: 'blocked', amount: 1, distance: 900 }, 'threat-blocked', {
    nearDistance: 1000,
    limit: 4,
    detail: { threat: { id: 7 } }
  });
  addCoinFilterDiagnostic(coinDiag, { drop_id: 'blocked', amount: 1, distance: 700 }, 'threat-blocked', {
    nearDistance: 1000,
    limit: 4,
    detail: { threat: { id: 7 } }
  });
  addCoinFilterDiagnostic(coinDiag, { drop_id: 'too-far', amount: 1, distance: 3000 }, 'max-distance', {
    nearDistance: 1000,
    limit: 4
  });
  results.push({
    name: 'coin-diagnostics-filter-entries-dedupe',
    passed: coinDiag.filteredNearCoins.length === 1
      && coinDiag.filteredNearCoins[0].id === 'blocked'
      && coinDiag.filteredNearCoins[0].distance === 700
      && coinDiag.filteredNearCoins[0].threat.id === 7
  });

  // Test coin motion
  const coinMotionOptions = {
    tolerance: 60,
    coinPrecisionTolerance: 60,
    coinAxisApproachMinDistance: 5000,
    coinAxisApproachRatio: 4,
    coinAxisApproachLaneTolerance: 1800,
    coinPickupStopDistance: 30,
    coinPickupStopPulseMs: 45,
    coinPickupMicroDistance: 120,
    coinPickupMicroPulseMs: 60,
    coinPickupFineDistance: 320,
    coinPickupFinePulseMs: 75,
    coinPickupBrakeDistance: 650,
    coinPickupBrakePulseMs: 90,
    coinPickupSweepDistance: 900,
    coinPickupSweepPulseMs: 150,
    coinPickupPulseMs: 180,
    coinPickupExactTolerance: 0,
    coinPickupFailureSlowStepMs: 10,
    coinPickupFailureMinPulseMs: 35,
    coinApproachBrakeDistance: 700,
    coinApproachLockMs: 900,
    nearCoinStuckDistance: 5000,
    nowMs: 1000
  };
  const axisCoinMotion = coinDirectionToCore(
    { x: 0, y: 0 },
    { drop_id: 'axis', x: 15000, y: 500 },
    coinMotionOptions
  );
  results.push({
    name: 'coin-motion-axis-approach-dominant-gap',
    passed: axisCoinMotion.direction.dx === 1
      && axisCoinMotion.direction.dy === 0
      && axisCoinMotion.direction.axisApproach === 'x'
      && axisCoinMotion.lockUpdate?.lock?.id === 'axis'
  });

  const nearCoinMotion = coinDirectionToCore(
    { x: 0, y: 0 },
    { drop_id: 'near-axis', x: 4800, y: 500 },
    coinMotionOptions
  );
  results.push({
    name: 'coin-motion-near-stuck-uses-single-axis',
    passed: nearCoinMotion.direction.dx === 1
      && nearCoinMotion.direction.dy === 0
      && !nearCoinMotion.direction.axisApproach
      && nearCoinMotion.lockUpdate?.action === 'set'
  });

  results.push({
    name: 'coin-motion-axis-lock-release-threshold',
    passed: coinAxisLockShouldHoldCore({ dx: 1, dy: 0 }, 500, 0, coinMotionOptions) === false
      && coinAxisLockShouldHoldCore({ dx: 1, dy: 0 }, 1200, 0, coinMotionOptions) === true
  });

  results.push({
    name: 'coin-motion-pickup-pulse-tiers',
    passed: (() => {
      const stop = coinPickupPrecisionPulseMsCore(20, 0, coinMotionOptions);
      const micro = coinPickupPrecisionPulseMsCore(80, 0, coinMotionOptions);
      const fine = coinPickupPrecisionPulseMsCore(250, 0, coinMotionOptions);
      const brake = coinPickupPrecisionPulseMsCore(500, 0, coinMotionOptions);
      const sweep = coinPickupPrecisionPulseMsCore(800, 0, coinMotionOptions);
      return stop === 45 && micro === 60 && fine === 75 && brake === 90 && sweep === 150;
    })()
  });

  results.push({
    name: 'coin-motion-pickup-failures-reduce-pulse',
    passed: coinPickupPrecisionPulseMsCore(500, 3, coinMotionOptions) < coinPickupPrecisionPulseMsCore(500, 0, coinMotionOptions)
      && coinPickupPrecisionPulseMsCore(500, 100, coinMotionOptions) === coinMotionOptions.coinPickupFailureMinPulseMs
  });

  const closeCoinMotion = coinDirectionToCore(
    { x: 0, y: 0 },
    { drop_id: 'close', x: 40, y: 0 },
    { ...coinMotionOptions, pickupFailureCount: 2, pickupAttemptSlowCount: 1 }
  );
  results.push({
    name: 'coin-motion-close-pickup-pushes-through',
    passed: closeCoinMotion.direction.dx === 1
      && closeCoinMotion.direction.dy === 0
      && closeCoinMotion.direction.exactTarget === true
      && closeCoinMotion.direction.pickupMicro === true
      && closeCoinMotion.direction.precisionPulseMs === 35
      && closeCoinMotion.lockUpdate?.lock?.until === 1180
  });

  const exactCoinMotion = coinDirectionToCore(
    { x: 10, y: -5 },
    { drop_id: 'exact', x: 10, y: -5 },
    { ...coinMotionOptions, lock: { id: 'exact', dx: 1, dy: 0, until: 2000 } }
  );
  results.push({
    name: 'coin-motion-exact-coordinate-stops-and-clears-own-lock',
    passed: exactCoinMotion.direction.dx === 0
      && exactCoinMotion.direction.dy === 0
      && exactCoinMotion.direction.exactTarget === true
      && exactCoinMotion.lockUpdate?.action === 'clear'
      && exactCoinMotion.lockUpdate?.id === 'exact'
      && exactCoinMotion.lockUpdate?.all === false
  });

  const diagonalCoinMotion = coinDirectionToCore(
    { x: 0, y: 0 },
    { drop_id: 'diagonal', x: 15000, y: 6000 },
    { ...coinMotionOptions, lock: { id: 'other', dx: 1, dy: 0, until: 2000 } }
  );
  results.push({
    name: 'coin-motion-diagonal-fallback-clears-stale-lock',
    passed: diagonalCoinMotion.direction.dx === 1
      && diagonalCoinMotion.direction.dy === 1
      && !diagonalCoinMotion.direction.axisApproach
      && diagonalCoinMotion.lockUpdate?.action === 'clear'
      && diagonalCoinMotion.lockUpdate?.all === true
  });

  const motionMeta = coinMotionMetaCore({
    pickupSweep: true,
    pickupFine: true,
    pickupFailureCount: 2,
    pickupAttemptSlowCount: 1,
    precisionPulseMs: 70.6,
    locked: true,
    pushThrough: true
  });
  results.push({
    name: 'coin-motion-meta-summarizes-pickup-state',
    passed: motionMeta.pickupMode === 'fine'
      && motionMeta.pickupSlowCount === 3
      && motionMeta.pickupFailureCount === 2
      && motionMeta.pickupAttemptSlowCount === 1
      && motionMeta.precisionPulseMs === 71
      && motionMeta.motionLocked === true
      && motionMeta.pushThrough === true
  });

  // Test coin target identity and collection matching
  results.push({
    name: 'coin-target-key-prefers-id-and-falls-back-to-coordinate',
    passed: coinTargetKeyCore({ id: 'coin-a', x: 10, y: 20, amount: 2 }) === 'id:coin-a'
      && coinTargetKeyCore({ x: 10.4, y: 20.6, amount: 2.2 }) === 'xy:10:21:2'
      && coinTargetKeyCore({ amount: 1 }) === ''
  });

  results.push({
    name: 'coin-target-matches-id-or-prune-radius',
    passed: coinMatchesTrackedTargetCore(
      { drop_id: 7, x: 1000, y: 0 },
      { id: '7', x: 9000, y: 0 },
      { coinCollectedPruneRadius: 100 }
    ) === true
      && coinMatchesTrackedTargetCore(
        { x: 1040, y: 0 },
        { x: 1000, y: 0 },
        { coinCollectedPruneRadius: 50 }
      ) === true
      && coinMatchesTrackedTargetCore(
        { x: 1100, y: 0 },
        { x: 1000, y: 0 },
        { coinCollectedPruneRadius: 50 }
      ) === false
  });

  const decisionTrackedCoin = trackedCoinTargetForCollectionCore({
    lastDecision: {
      kind: 'coin',
      target: { x: 300, y: 400, amount: 3 },
      postAttackTarget: { id: 'enemy-1', name: 'Enemy' }
    },
    lastTarget: { kind: 'coin', id: 'last-coin' },
    coinProgress: { id: 'progress-coin' }
  }, { x: 0, y: 0 });
  results.push({
    name: 'coin-target-tracked-decision-fills-id-distance-and-post-attack',
    passed: decisionTrackedCoin?.id === 'last-coin'
      && decisionTrackedCoin?.distance === 500
      && decisionTrackedCoin?.postAttackTarget?.id === 'enemy-1'
  });

  const fallbackTrackedCoin = trackedCoinTargetForCollectionCore({
    lastTarget: { kind: 'coin', id: 'held-coin' },
    coinProgress: { id: 'progress-coin', lastDistance: 42, amount: 5, x: 10, y: 20, postAttackTarget: { id: 'enemy-2' } }
  });
  results.push({
    name: 'coin-target-tracked-fallback-uses-last-target-and-progress',
    passed: fallbackTrackedCoin?.id === 'held-coin'
      && fallbackTrackedCoin?.distance === 42
      && fallbackTrackedCoin?.amount === 5
      && fallbackTrackedCoin?.postAttackTarget?.id === 'enemy-2'
  });

  const nativeSnapshot = buildNativeCoinSnapshotCore([
    { drop_id: 'a', amount: 2.4, x: '10', y: '20' },
    { amount: 3, x: 30, y: 40 },
    { drop_id: 'zero', amount: 0, x: 50, y: 60 },
    { drop_id: 'bad', amount: 1, x: NaN, y: 60 }
  ], { nowMs: 1234 });
  results.push({
    name: 'coin-target-native-snapshot-normalizes-and-filters',
    passed: nativeSnapshot.length === 2
      && nativeSnapshot[0].key === 'id:a'
      && nativeSnapshot[0].amount === 2
      && nativeSnapshot[0].at === 1234
      && nativeSnapshot[1].key === 'xy:30:40:3'
  });

  results.push({
    name: 'coin-target-point-to-segment-distance',
    passed: pointToSegmentDistanceCore({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 }) === 3
      && pointToSegmentDistanceCore({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 }) === 5
      && pointToSegmentDistanceCore({ x: NaN, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 1 }) === Infinity
  });

  const currentIncidentalPickups = pickIncidentalCoinPickupsCore([
    { id: 'picked', key: 'id:picked', amount: 2, x: 10, y: 0, at: 900 },
    { id: 'still-visible', key: 'id:still-visible', amount: 3, x: 100, y: 0, at: 900 },
    { id: 'old', key: 'id:old', amount: 4, x: 10, y: 0, at: 0 }
  ], [
    { id: 'still-visible', key: 'id:still-visible', amount: 3, x: 100, y: 0, at: 1000 }
  ], { x: 0, y: 0 }, null, {
    nowMs: 1000,
    incidentalCoinPickupMemoryMs: 500,
    coinCollectedConfirmDistance: 20
  });
  results.push({
    name: 'coin-target-incidental-pickup-current-radius',
    passed: currentIncidentalPickups.length === 1
      && currentIncidentalPickups[0].coin.id === 'picked'
      && currentIncidentalPickups[0].currentDistance === 10
  });

  const pathIncidentalPickups = pickIncidentalCoinPickupsCore([
    { id: 'path', key: 'id:path', amount: 1, x: 50, y: 5, at: 1000 },
    { id: 'far', key: 'id:far', amount: 1, x: 50, y: 30, at: 1000 }
  ], [], { x: 100, y: 0 }, { x: 0, y: 0 }, {
    nowMs: 1200,
    incidentalCoinPickupMemoryMs: 1000,
    coinCollectedConfirmDistance: 10
  });
  results.push({
    name: 'coin-target-incidental-pickup-self-path',
    passed: pathIncidentalPickups.length === 1
      && pathIncidentalPickups[0].coin.id === 'path'
      && pathIncidentalPickups[0].pathDistance === 5
  });

  const snapshotHelperOptions = {
    snapshotCoinClusterMinCoins: 3,
    snapshotSingleCoinMaxDistance: 1000,
    snapshotSingleCoinDistancePerAmount: 300,
    globalCoinMaxDistance: 500,
    coinMaxDistance: 800,
    isSnapshotOnlyCoin: coin => Boolean(coin?.snapshotOnly)
  };
  results.push({
    name: 'coin-target-snapshot-worth-cluster-beats-distance',
    passed: snapshotCoinWorthLongTravelCore({ distance: 100000, amount: 1 }, 3, 3, snapshotHelperOptions) === true
  });

  results.push({
    name: 'coin-target-snapshot-worth-single-distance-scales-by-amount',
    passed: snapshotCoinWorthLongTravelCore({ distance: 1500, amount: 5 }, 1, 5, snapshotHelperOptions) === true
      && snapshotCoinWorthLongTravelCore({ distance: 1501, amount: 5 }, 1, 5, snapshotHelperOptions) === false
      && snapshotCoinWorthLongTravelCore({ distance: Infinity, amount: 99 }, 1, 99, snapshotHelperOptions) === false
  });

  results.push({
    name: 'coin-target-snapshot-navigation-reason-priority',
    passed: snapshotCoinNavigationReasonCore({ snapshotIdleFallback: true }, snapshotHelperOptions) === 'snapshot-coin-idle-timeout'
      && snapshotCoinNavigationReasonCore({ fieldMigration: true }, snapshotHelperOptions) === 'migrate-to-known-field'
      && snapshotCoinNavigationReasonCore({ snapshotOnly: true, snapshotMembers: 3 }, snapshotHelperOptions) === 'snapshot-coin-field'
      && snapshotCoinNavigationReasonCore({ snapshotOnly: true, snapshotMembers: 1 }, snapshotHelperOptions) === 'snapshot-coin-target'
  });

  results.push({
    name: 'coin-target-snapshot-navigation-visible-distance',
    passed: snapshotCoinNavigationReasonCore({ distance: 800 }, snapshotHelperOptions) === 'best-opportunity-coin'
      && snapshotCoinNavigationReasonCore({ distance: 801 }, snapshotHelperOptions) === 'best-opportunity-visible-coin'
  });

  const dropMatchedKill = buildDropMatchedKillCore({
    id: 'drop-coin-1',
    amount: 5,
    x: 10.4,
    y: 20.6,
    distance: 33.3,
    postAttackTarget: {
      id: 'enemy-1',
      name: 'Enemy One',
      drop: 5,
      playerCategory: 'active',
      active: true,
      combat: true,
      battleStartedAt: 1000,
      battleStaminaSpentStartMs: 200
    }
  }, 5, { id: 'self', coins: 12 }, 'post-attack-drop-visible', {
    nowMs: 2500,
    sessionId: 'session-1',
    sessionStaminaSpentMs: 650,
    seenKillKeys: new Set(),
    coinTargetKey: coinTargetKeyCore
  });
  results.push({
    name: 'drop-matched-kill-core-builds-confirmed-kill',
    passed: dropMatchedKill?.seenKey === 'drop-coin-match|id:enemy-1|id:drop-coin-1|5'
      && dropMatchedKill?.kill?.victim === 'Enemy One'
      && dropMatchedKill?.kill?.rewardConfirmed === true
      && dropMatchedKill?.kill?.dropMatched === true
      && dropMatchedKill?.kill?.active === true
      && dropMatchedKill?.kill?.battleDurationMs === 1500
      && dropMatchedKill?.kill?.battleStaminaSpentMs === 450
      && dropMatchedKill?.kill?.sessionId === 'session-1'
      && dropMatchedKill?.kill?.coin?.x === 10
      && dropMatchedKill?.kill?.coin?.y === 21
      && dropMatchedKill?.kill?.attributionReason === 'post-attack-drop-visible'
  });
  results.push({
    name: 'drop-matched-kill-core-rejects-mismatch-and-seen-key',
    passed: buildDropMatchedKillCore({ postAttackTarget: { id: 'enemy', drop: 6 } }, 5, null, '', {}) === null
      && buildDropMatchedKillCore({ id: 'drop-coin-1', amount: 5, x: 10, y: 20, postAttackTarget: { id: 'enemy-1', drop: 5 } }, 5, null, '', {
        seenKillKeys: new Set(['drop-coin-match|id:enemy-1|id:drop-coin-1|5']),
        coinTargetKey: coinTargetKeyCore
      }) === null
  });

  // Test coin progress/failure helpers
  const coinProgressOptions = {
    coinIgnoreMs: 100,
    coinProgressMinGain: 100,
    coinNearStuckResetGain: 5,
    closeCoinStuckDistance: 50,
    nearCoinStuckDistance: 200,
    closeCoinStuckMs: 400,
    nearCoinStuckMs: 900,
    coinNoProgressMs: 1500,
    coinFailureDecayMs: 1000,
    coinCloseFailureIgnoreMs: 200,
    coinNearFailureIgnoreMs: 300,
    coinNoProgressIgnoreMs: 400,
    coinFailureMaxIgnoreMs: 1000,
    staleCoinEscapeMs: 750
  };
  const closeFailure = coinFailureIgnoreCore({ count: 2, lastAt: 900 }, 'close', 1000, coinProgressOptions);
  results.push({
    name: 'coin-progress-failure-ignore-increments-and-caps',
    passed: closeFailure.count === 3
      && closeFailure.ignoreMs === 600
      && closeFailure.ignoreUntil === 1600
      && coinFailureIgnoreCore({ count: 9, lastAt: 950 }, 'close', 1000, coinProgressOptions).ignoreMs === 1000
  });

  results.push({
    name: 'coin-progress-failure-ignore-decays-and-picks-reason-base',
    passed: coinFailureIgnoreCore({ count: 5, lastAt: 500 }, 'near', 2000, coinProgressOptions).count === 1
      && coinFailureIgnoreCore({}, 'near', 1000, coinProgressOptions).ignoreMs === 300
      && coinFailureIgnoreCore({}, 'progress', 1000, coinProgressOptions).ignoreMs === 400
  });

  const escapeAway = staleCoinEscapeDirectionCore(
    { target: { id: 'coin', x: 10, y: 0 }, dx: 1, dy: 0 },
    { x: 0, y: 0 },
    5000,
    coinProgressOptions
  );
  results.push({
    name: 'coin-progress-stale-escape-moves-away-from-target',
    passed: escapeAway.dx === -1
      && escapeAway.dy === 0
      && escapeAway.state.id === 'coin'
      && escapeAway.state.until === 5750
  });

  const escapeFallback = staleCoinEscapeDirectionCore(
    { target: { id: 'same', x: 0, y: 0 }, dx: 0, dy: 0 },
    { x: 0, y: 0 },
    3000,
    coinProgressOptions
  );
  results.push({
    name: 'coin-progress-stale-escape-fallback-phase',
    passed: escapeFallback.dx === 0
      && escapeFallback.dy === -1
      && escapeFallback.state.until === 3750
  });

  results.push({
    name: 'coin-progress-intent-and-attempt-expiry',
    passed: coinProgressIntentCore({ kind: 'coin', target: { id: 'a' } })
      && coinProgressIntentCore({ kind: 'seek-coin', target: { id: 'b' } })
      && coinProgressIntentCore({ kind: 'patrol', reason: 'coin sweep', target: { id: 'c' } })
      && !coinProgressIntentCore({ kind: 'patrol', reason: 'walk', target: { id: 'c' } })
      && coinAttemptExpiredCore({ startedAt: 0, lastSeenAt: 100 }, 500, coinProgressOptions)
      && !coinAttemptExpiredCore({ startedAt: 0, lastSeenAt: 250 }, 500, coinProgressOptions)
  });

  const improvedAttempt = updateCoinAttemptCore(
    { id: 'coin', startedAt: 100, lastImprovedAt: 100, bestDistance: 1000, lastDistance: 1000, amount: 1, x: 0, y: 0 },
    { kind: 'coin', target: { id: 'coin', distance: 850, amount: 2, x: 5, y: 6, postAttackTarget: { id: 'enemy' } } },
    1000,
    coinProgressOptions
  );
  results.push({
    name: 'coin-progress-attempt-updates-improvement-and-target',
    passed: improvedAttempt.attempt.bestDistance === 850
      && improvedAttempt.attempt.lastImprovedAt === 1000
      && improvedAttempt.attempt.lastDistance === 850
      && improvedAttempt.attempt.amount === 2
      && improvedAttempt.attempt.x === 5
      && improvedAttempt.attempt.y === 6
      && improvedAttempt.attempt.postAttackTarget.id === 'enemy'
      && !improvedAttempt.closeStuck
      && !improvedAttempt.nearStuck
  });

  const closeStuckAttempt = updateCoinAttemptCore(
    { id: 'coin', startedAt: 500, lastImprovedAt: 500, bestDistance: 40, lastDistance: 40, amount: 1, x: 0, y: 0, closeStartedAt: 1000, nearStartedAt: 0 },
    { kind: 'coin', target: { id: 'coin', distance: 40, amount: 1, x: 1, y: 1 } },
    1500,
    coinProgressOptions
  );
  results.push({
    name: 'coin-progress-attempt-detects-close-stale',
    passed: closeStuckAttempt.closeStuck
      && !closeStuckAttempt.nearStuck
      && closeStuckAttempt.attempt.closeStartedAt === 1000
      && closeStuckAttempt.attempt.nearStartedAt === 1500
  });

  const newProgress = updateCoinProgressRecordCore(
    null,
    { id: 'coin', amount: 3, x: 1, y: 2, postAttackTarget: { id: 'drop' } },
    500,
    1000,
    coinProgressOptions
  );
  const improvedProgress = updateCoinProgressRecordCore(
    { id: 'coin', startedAt: 0, lastImprovedAt: 0, bestDistance: 1000, lastDistance: 1000, postAttackTarget: { id: 'old' } },
    { id: 'coin', amount: 3, x: 2, y: 3 },
    850,
    1000,
    coinProgressOptions
  );
  const staleProgress = updateCoinProgressRecordCore(
    { id: 'coin', startedAt: 100, lastImprovedAt: 100, bestDistance: 1000, lastDistance: 1000, postAttackTarget: { id: 'old' } },
    { id: 'coin', amount: 4, x: 4, y: 5 },
    950,
    2000,
    coinProgressOptions
  );
  results.push({
    name: 'coin-progress-record-initial-improved-and-stale',
    passed: newProgress.progress.startedAt === 1000
      && newProgress.progress.bestDistance === 500
      && newProgress.progress.postAttackTarget.id === 'drop'
      && improvedProgress.improved
      && improvedProgress.progress.bestDistance === 850
      && improvedProgress.progress.lastImprovedAt === 1000
      && staleProgress.stale
      && staleProgress.progress.lastDistance === 950
      && staleProgress.progress.postAttackTarget.id === 'old'
  });

  const ignoredStuckProgress = buildIgnoredCoinProgressCore('coin', closeStuckAttempt.attempt, 40, 1500, 1700, 'stuck');
  const ignoredStuckAction = buildIgnoredCoinPatrolActionCore(
    { kind: 'coin', target: { id: 'coin' } },
    'coin',
    40,
    closeStuckAttempt.attempt,
    { ignoreMs: 200, count: 2 },
    { dx: -1, dy: 0 },
    1500,
    'ignore-close-stale-coin',
    true
  );
  results.push({
    name: 'coin-progress-ignored-stuck-record-and-action',
    passed: ignoredStuckProgress.ignoredAt === 1500
      && ignoredStuckProgress.ignoreUntil === 1700
      && ignoredStuckProgress.bestDistance === 40
      && ignoredStuckAction.kind === 'patrol'
      && ignoredStuckAction.dx === -1
      && ignoredStuckAction.ignoredCoin.closeAgeMs === 500
      && ignoredStuckAction.ignoredCoin.nearAgeMs === 0
      && ignoredStuckAction.ignoredCoin.ageMs === 1000
      && ignoredStuckAction.ignoredCoin.failureCount === 2
  });

  const ignoredProgressRecord = buildIgnoredCoinProgressCore('coin', staleProgress.progress, 950, 2000, 2400, 'progress');
  const ignoredProgressAction = buildIgnoredCoinPatrolActionCore(
    { kind: 'coin', target: { id: 'coin' } },
    'coin',
    950,
    staleProgress.progress,
    { ignoreMs: 400, count: 3 },
    { dx: 0, dy: 1 },
    2000,
    'ignore-stale-coin-no-progress'
  );
  results.push({
    name: 'coin-progress-ignored-no-progress-record-and-action',
    passed: ignoredProgressRecord.ignoredAt === 2000
      && ignoredProgressRecord.ignoreUntil === 2400
      && ignoredProgressRecord.lastDistance === 950
      && ignoredProgressAction.reason === 'ignore-stale-coin-no-progress'
      && ignoredProgressAction.dy === 1
      && ignoredProgressAction.ignoredCoin.bestDistance === 1000
      && ignoredProgressAction.ignoredCoin.ignoreMs === 400
      && ignoredProgressAction.ignoredCoin.failureCount === 3
      && !Object.prototype.hasOwnProperty.call(ignoredProgressAction.ignoredCoin, 'ageMs')
  });

  results.push({
    name: 'coin-progress-ignore-cleanup-intent',
    passed: coinIgnoreCleanupIntentCore({ kind: 'coin', id: 12 }, { id: '12' }, '12').clearLastTarget
      && coinIgnoreCleanupIntentCore({ kind: 'enemy', id: '12' }, { id: '12' }, '12').clearLastTarget === false
      && coinIgnoreCleanupIntentCore({ kind: 'coin', id: '12' }, { id: '12' }, '12').clearCoinApproachLock
      && coinIgnoreCleanupIntentCore({ kind: 'coin', id: '12' }, { id: 12 }, '12').clearCoinApproachLock === false
  });

  // Test coin route planning
  const routeSelf = { x: 0, y: 0 };
  const routeCoins = [
    { drop_id: '1', amount: 1, x: 1000, y: 0, distance: 1000 },
    { drop_id: '2', amount: 1, x: 2000, y: 0, distance: 2000 },
    { drop_id: '3', amount: 1, x: 3000, y: 0, distance: 3000 }
  ];
  const routeOptions = {
    dist: (a, b) => Math.hypot(Number(a.x) - Number(b.x), Number(a.y) - Number(b.y)),
    moveStaminaCost: distance => Number(distance || 0),
    pickupStaminaMs: 0,
    valueScore: (value, cost) => cost > 0 ? value * 100000 / cost : Infinity,
    staminaAffordable: cost => cost <= 10000,
    coinOpportunityValue: 100000,
    sampleDistance: 10000,
    clusterRadius: 5000,
    maxPointsDense: 6,
    maxPointsMid: 4,
    maxPointsSparse: 3,
    linkDistance: 1500,
    maxLinkDistance: 2500,
    nearbyFirstCoinDistance: 22000,
    firstCoinDistanceRatio: 1.45,
    firstCoinDistanceSlack: 6000,
    choiceType: choice => String(choice?.type || ''),
    choiceId: choice => String(choice?.id ?? ''),
    heldMinOverlap: 2,
    switchMargin: 3000,
    switchRelativeMargin: 0.1,
    maxDistance: 50000,
    poolLimit: 72,
    anchorLimit: 22,
    safeCoinCandidates: (coins, threats, maxDistance, self) => (coins || [])
      .map(coin => ({ ...coin, distance: Number.isFinite(Number(coin.distance)) ? Number(coin.distance) : Math.hypot(Number(self.x) - Number(coin.x), Number(self.y) - Number(coin.y)) }))
      .filter(coin => coin.distance <= maxDistance),
    isSnapshotOnlyCoin: coin => Boolean(coin?.snapshotOnly)
  };
  const builtRoute = buildCoinRouteFromAnchorCore(routeSelf, routeCoins[0], routeCoins, [], routeOptions);
  results.push({
    name: 'coin-route-builds-metadata',
    passed: builtRoute
      && builtRoute.coinRoute?.legCount === 3
      && builtRoute.coinRoute?.points?.length === 3
      && builtRoute.coinRoute?.ids?.join(',') === '1,2,3'
      && builtRoute.routeKind === 'short'
  });

  const routeActionMeta = coinRouteActionMetaCore({
    ids: ['a', 'b'],
    points: [{ id: 'a' }],
    value: 2.5,
    staminaCost: 123.6,
    legCount: 2.2,
    totalDistance: 456.7,
    kind: 'short'
  }, 321.4);
  const routeActionMetaFallback = coinRouteActionMetaCore({ ids: ['x'] }, 321.4);
  results.push({
    name: 'coin-route-action-meta-rounds-and-falls-back',
    passed: routeActionMeta?.ids?.join(',') === 'a,b'
      && routeActionMeta.points?.length === 1
      && routeActionMeta.value === 2.5
      && routeActionMeta.staminaCost === 124
      && routeActionMeta.legCount === 2.2
      && routeActionMeta.totalDistance === 457
      && routeActionMeta.firstDistance === 321
      && routeActionMeta.kind === 'short'
      && routeActionMetaFallback.firstDistance === 321
      && routeActionMetaFallback.points === null
      && coinRouteActionMetaCore(null, 999) === null
  });

  results.push({
    name: 'coin-route-closer-first-guard',
    passed: coinRouteSkipsCloserFirstCoinCore(
      routeSelf,
      { drop_id: 'far-route', amount: 3, x: 30000, y: 0, distance: 30000, coinRoute: { firstDistance: 30000 } },
      [{ drop_id: 'near', amount: 1, x: 10000, y: 0, distance: 10000 }],
      routeOptions
    ) === true
  });

  const heldRouteChoice = {
    type: 'coin',
    id: '1',
    reason: 'best-opportunity-coin-route',
    until: 10000,
    coinRouteIds: ['1', '2', '3']
  };
  const pickedRoute = pickCoinRouteOpportunityCore(routeSelf, [
    ...routeCoins,
    { drop_id: '4', amount: 10, x: 9000, y: 0, distance: 9000 },
    { drop_id: '5', amount: 10, x: 10000, y: 0, distance: 10000 },
    { drop_id: '6', amount: 10, x: 11000, y: 0, distance: 11000 }
  ], [], {
    ...routeOptions,
    nearbyFirstCoinDistance: 0,
    staminaAffordable: cost => cost <= 20000,
    heldChoice: heldRouteChoice,
    heldRouteChoice
  });
  results.push({
    name: 'coin-route-pick-stabilizes-held-route',
    passed: pickedRoute
      && pickedRoute.drop_id === '1'
      && pickedRoute.routeHeld === true
      && pickedRoute.coinRoute?.ids?.join(',') === '1,2,3'
  });

  // Test opportunity choice/stability
  const opportunityChoice = { key: 'coin:abc', x: 100, y: 100, amount: 2 };
  results.push({
    name: 'opportunity-choice-key-parsing',
    passed: opportunityChoiceType(opportunityChoice) === 'coin'
      && opportunityChoiceId(opportunityChoice) === 'abc'
      && opportunityChoiceKey({ type: 'enemy', id: 7 }) === 'enemy:7'
  });

  results.push({
    name: 'opportunity-choice-coordinate-match',
    passed: opportunityMatchesChoiceCore(
      { type: 'coin', id: 'new-id', amount: 2, x: 120, y: 100 },
      { type: 'coin', id: 'old-id', amount: 2, x: 100, y: 100 },
      {
        sameCoinRadius: 50,
        dist: (a, b) => Math.hypot(Number(a.x) - Number(b.x), Number(a.y) - Number(b.y))
      }
    ) === true
  });

  const heldChoice = { key: 'coin:a', type: 'coin', id: 'a', until: 2000, score: 100 };
  const holdResult = chooseStableOpportunityCore([
    { type: 'coin', id: 'b', amount: 2, x: 300, y: 0, distance: 300, score: 105, priorityTier: 1 },
    { type: 'coin', id: 'a', amount: 1, x: 100, y: 0, distance: 100, score: 100, priorityTier: 1 }
  ], heldChoice, null, {
    nowMs: 1000,
    sameCoinRadius: 50,
    switchMargin: 10,
    switchRelativeMargin: 0,
    oscillationSwitchLimit: 0
  });
  results.push({
    name: 'opportunity-choice-holds-with-margin',
    passed: holdResult.chosen?.id === 'a'
      && holdResult.chosen?.held === true
      && holdResult.chosen?.competingScore === 105
  });

  const highValueResult = chooseStableOpportunityCore([
    { type: 'enemy', id: 'enemy', distance: 100, score: 500, priorityTier: 1 },
    { type: 'coin', id: 'coin', amount: 10, x: 100, y: 0, distance: 100, score: 100, priorityTier: 1 }
  ], { key: 'coin:coin', type: 'coin', id: 'coin', until: 2000 }, null, {
    nowMs: 1000,
    highValueCoinPriorityAmount: 10,
    switchMargin: 0,
    switchRelativeMargin: 0,
    oscillationSwitchLimit: 0
  });
  results.push({
    name: 'opportunity-choice-high-value-coin-holds-enemy-switch',
    passed: highValueResult.chosen?.id === 'coin'
      && highValueResult.chosen?.held === true
      && highValueResult.chosen?.highValueCoinHold === true
  });

  const opportunityOscillationResult = chooseStableOpportunityCore([
    { type: 'coin', id: 'b', amount: 2, x: 300, y: 0, distance: 300, score: 120, priorityTier: 1 },
    { type: 'coin', id: 'a', amount: 1, x: 100, y: 0, distance: 100, score: 100, priorityTier: 1 }
  ], { key: 'coin:a', type: 'coin', id: 'a', until: 0 }, {
    pairKey: 'coin:a|coin:b',
    lastKey: 'coin:a',
    switchCount: 1,
    lockedKey: '',
    blockedKey: '',
    lockedAt: 0,
    updatedAt: 900
  }, {
    nowMs: 1000,
    sameCoinRadius: 50,
    switchMargin: 0,
    switchRelativeMargin: 0,
    oscillationSwitchLimit: 1
  });
  results.push({
    name: 'opportunity-choice-oscillation-locks-current',
    passed: opportunityOscillationResult.chosen?.id === 'a'
      && opportunityOscillationResult.chosen?.oscillationLocked === true
      && opportunityOscillationResult.switchLock?.lockedKey === 'coin:a'
      && opportunityOscillationResult.switchLock?.blockedKey === 'coin:b'
  });

  const rememberedChoice = rememberOpportunityChoiceCore(
    {
      type: 'coin',
      id: 'coin-a',
      amount: 2,
      x: 100,
      y: 200,
      distance: 345.6,
      staminaCost: 789.2,
      score: 123.7,
      actionKind: 'coin',
      priorityTier: 1,
      held: true,
      competingScore: 140.2
    },
    { kind: 'coin', reason: 'best-opportunity-coin' },
    { key: 'coin:coin-a', type: 'coin', id: 'coin-a', at: 900, until: 1200 },
    { nowMs: 1000, switchHoldMs: 500, sameCoinRadius: 50 }
  );
  results.push({
    name: 'opportunity-choice-remember-builds-choice-and-action-metadata',
    passed: rememberedChoice.choice?.key === 'coin:coin-a'
      && rememberedChoice.choice?.at === 900
      && rememberedChoice.choice?.until === 1500
      && rememberedChoice.choice?.score === 124
      && rememberedChoice.choice?.staminaCost === 789
      && rememberedChoice.action?.opportunityChoice?.held === true
      && rememberedChoice.action?.opportunityChoice?.competingScore === 140
      && rememberedChoice.action?.opportunityChoice?.holdRemainingMs === 500
  });

  const rememberedRouteMissing = rememberOpportunityChoiceCore(
    {
      type: 'coin',
      id: 'route-a',
      amount: 5,
      x: 100,
      y: 200,
      distance: 1000,
      staminaCost: 500,
      score: 200,
      actionKind: 'seek-coin',
      priorityTier: 1,
      maxDistance: 50000,
      missingHold: true,
      holdUntil: 1800,
      routeHeld: true,
      competingRouteScore: 199.6,
      coinRoute: { ids: ['route-a', 'route-b'], value: 7.4, legCount: 2.2 }
    },
    { kind: 'seek-coin', reason: 'best-opportunity-coin-route' },
    { key: 'coin:route-a', type: 'coin', id: 'route-a', at: 700, lastSeenAt: 800, until: 2200, missingSince: 900 },
    { nowMs: 1000, switchHoldMs: 500, sameCoinRadius: 50 }
  );
  results.push({
    name: 'opportunity-choice-remember-preserves-missing-route-metadata',
    passed: rememberedRouteMissing.choice?.until === 1800
      && rememberedRouteMissing.choice?.lastSeenAt === 800
      && rememberedRouteMissing.choice?.missingSince === 900
      && rememberedRouteMissing.choice?.coinRouteIds?.join(',') === 'route-a,route-b'
      && rememberedRouteMissing.choice?.coinRouteValue === 7
      && rememberedRouteMissing.choice?.coinRouteLegs === 2
      && rememberedRouteMissing.action?.opportunityChoice?.routeHeld === true
      && rememberedRouteMissing.action?.opportunityChoice?.competingRouteScore === 200
  });

  const missingHeldOptions = {
    nowMs: 1500,
    self: { x: 0, y: 0 },
    dist: (a, b) => Math.hypot(Number(a.x) - Number(b.x), Number(a.y) - Number(b.y)),
    sameCoinRadius: 50,
    missingHoldMs: 2000,
    switchHoldMs: 500,
    nativeCoinAuthoritativeRadius: 50000,
    snapshotCoinMaxDistance: 0,
    globalCoinMaxDistance: 50000,
    coinMaxDistance: 200,
    visibleSourcesConfirmMissing: false,
    ignoredCoin: () => false,
    coinBlockedByThreat: () => false,
    coinStaminaCost: coin => Number(coin.distance || 0) + 10,
    coinStaminaAffordable: (self, coin, cost) => Number(cost || 0) <= 10000,
    scoreCoinOpportunity: coin => Number(coin.amount || 0) * 1000 / Math.max(1, Number(coin.distance || 0)),
    priorityTier: item => Number(item.distance || Infinity) <= 500 ? 1 : 0
  };
  const missingHeldBuilt = buildMissingHeldOpportunityCore(
    { key: 'coin:held', type: 'coin', id: 'held', amount: 3, x: 100, y: 0, at: 1000, lastSeenAt: 1000, until: 3000 },
    [{ type: 'coin', id: 'other', amount: 1, x: 400, y: 0, score: 20, priorityTier: 1 }],
    missingHeldOptions
  );
  results.push({
    name: 'opportunity-choice-missing-held-builds-candidate',
    passed: missingHeldBuilt.opportunity?.id === 'held'
      && missingHeldBuilt.opportunity?.actionKind === 'coin'
      && missingHeldBuilt.opportunity?.missingHold === true
      && missingHeldBuilt.opportunity?.holdUntil === 3000
      && missingHeldBuilt.opportunity?.staminaCost === 110
      && missingHeldBuilt.opportunity?.score === 30
      && missingHeldBuilt.opportunity?.priorityTier === 1
  });

  const missingHeldClear = buildMissingHeldOpportunityCore(
    { key: 'coin:gone', type: 'coin', id: 'gone', amount: 1, x: 100, y: 0, at: 1000, lastSeenAt: 1000, until: 3000, reason: 'best-opportunity-coin' },
    [],
    { ...missingHeldOptions, visibleSourcesConfirmMissing: true }
  );
  results.push({
    name: 'opportunity-choice-missing-held-requests-visible-clear',
    passed: missingHeldClear.clearMissing === true
      && missingHeldClear.clearReason === 'visible-coin-disappeared'
      && missingHeldClear.coin?.drop_id === 'gone'
  });

  const missingHeldSnapshot = buildMissingHeldOpportunityCore(
    { key: 'coin:snapshot', type: 'coin', id: 'snapshot', amount: 1, x: 100, y: 0, at: 1000, lastSeenAt: 1000, until: 3000, reason: 'snapshot-coin-target' },
    [],
    { ...missingHeldOptions, visibleSourcesConfirmMissing: true }
  );
  results.push({
    name: 'opportunity-choice-missing-held-keeps-snapshot-choice',
    passed: missingHeldSnapshot.clearMissing === false
      && missingHeldSnapshot.opportunity?.id === 'snapshot'
      && missingHeldSnapshot.opportunity?.actionKind === 'coin'
  });

  // Test opportunity candidate construction
  const candidateOptions = {
    safeCoinCandidates: (coins, threats, maxDistance) => (coins || []).filter(coin => Number(coin.distance || 0) <= maxDistance),
    coinStaminaCost: coin => Number(coin.staminaCost ?? coin.distance ?? 0),
    coinStaminaAffordable: (coin, cost) => Number(cost ?? coin.staminaCost ?? 0) <= 10000,
    scoreCoinOpportunity: coin => Number(coin.score ?? coin.opportunityScore ?? 0),
    snapshotCoinNavigationReason: coin => Number(coin.distance || 0) <= 1500 ? 'best-opportunity-coin' : 'best-opportunity-visible-coin',
    maxCoinDistance: 1500,
    routeMaxDistance: 50000,
    scoreEnemyOpportunity: target => target.blocked ? null : Number(target.score || 0),
    enemyStaminaCost: target => Number(target.staminaCost || 0),
    opportunityStaminaAffordable: cost => cost <= 5000,
    isAfkProfitTarget: target => Boolean(target.afk),
    attackRange: 1000,
    attackEngageRange: 5000,
    priorityTier: item => opportunityPriorityTierCore(item, { visibleDistance: 2000 })
  };

  const dedupedCoinCandidates = buildOpportunityCandidatesCore({ x: 0, y: 0 }, [], [{
    maxDistance: 5000,
    coins: [
      { drop_id: 'same', amount: 1, distance: 500, score: 10 },
      { drop_id: 'same', amount: 3, distance: 800, score: 10 },
      { drop_id: 'other', amount: 1, distance: 400, score: 9 }
    ]
  }], [], null, candidateOptions);
  results.push({
    name: 'opportunity-candidates-dedupes-coin-by-score-amount-distance',
    passed: dedupedCoinCandidates.length === 2
      && dedupedCoinCandidates.find(item => item.id === 'same')?.amount === 3
      && dedupedCoinCandidates.find(item => item.id === 'same')?.actionKind === 'coin'
  });

  const routeCandidate = buildOpportunityCandidatesCore({ x: 0, y: 0 }, [], [{
    maxDistance: 5000,
    coins: [{ drop_id: 'route', amount: 1, distance: 900, score: 10 }]
  }], [], {
    drop_id: 'route',
    amount: 4,
    distance: 900,
    score: 12,
    route: true,
    routeValue: 4,
    routeHeld: true,
    competingRouteScore: 11,
    coinRoute: { ids: ['route', 'next'], value: 4, legCount: 2 }
  }, candidateOptions);
  results.push({
    name: 'opportunity-candidates-route-winner-preserves-metadata',
    passed: routeCandidate[0]?.reason === 'best-opportunity-coin-route'
      && routeCandidate[0]?.coinRoute?.ids?.join(',') === 'route,next'
      && routeCandidate[0]?.routeHeld === true
      && routeCandidate[0]?.competingRouteScore === 11
  });

  const routeDisplayCandidate = buildOpportunityCandidatesCore({ x: 0, y: 0 }, [], [{
    maxDistance: 5000,
    coins: [{ drop_id: 'display', amount: 5, distance: 700, score: 12 }]
  }], [], {
    drop_id: 'display',
    amount: 2,
    distance: 700,
    score: 12,
    route: true,
    routeValue: 2,
    routeKind: 'short',
    coinRoute: { ids: ['display', 'near'], value: 2, legCount: 2 }
  }, candidateOptions);
  results.push({
    name: 'opportunity-candidates-route-display-merge-keeps-base-coin',
    passed: routeDisplayCandidate[0]?.amount === 5
      && routeDisplayCandidate[0]?.reason === 'best-opportunity-coin-route'
      && routeDisplayCandidate[0]?.sourceCoin?.routeDisplayOnly === true
      && routeDisplayCandidate[0]?.coinRoute?.ids?.join(',') === 'display,near'
  });

  const enemyCandidate = buildOpportunityCandidatesCore({ x: 0, y: 0 }, [], [], [
    { user_id: 'afk', distance: 900, score: 8, staminaCost: 100, afk: true },
    { user_id: 'active-far', distance: 6000, score: 9, staminaCost: 100, afk: false },
    { user_id: 'blocked', distance: 500, score: 20, staminaCost: 100, blocked: true }
  ], null, candidateOptions);
  results.push({
    name: 'opportunity-candidates-builds-enemy-action-kind',
    passed: enemyCandidate.length === 2
      && enemyCandidate.find(item => item.id === 'afk')?.actionKind === 'attack'
      && enemyCandidate.find(item => item.id === 'active-far')?.actionKind === 'seek-enemy'
  });

  const bestCoinRouteScore = bestCoinOpportunityScoreCore({ x: 0, y: 0 }, [{
    maxDistance: 5000,
    coins: [{ drop_id: 'coin', amount: 1, distance: 500, score: 5, staminaCost: 100 }]
  }], [], { drop_id: 'route-score', amount: 2, distance: 900, score: 9, staminaCost: 100 }, candidateOptions);
  results.push({
    name: 'opportunity-candidates-best-coin-score-includes-route',
    passed: bestCoinRouteScore === 9
  });

  let flattenedEnemyCount = 0;
  const pickCoreBaseOptions = {
    enemyOpportunityCandidates: (origin, targets) => {
      flattenedEnemyCount = targets.length;
      return targets;
    },
    uniqueVisibleRouteCoins: groups => (groups || []).flatMap(group => group.coins || []),
    pickCoinRouteOpportunity: () => null,
    opportunityCandidateCoreOptions: () => candidateOptions,
    buildCoinAction: (origin, coin, reason, kind) => ({
      kind,
      reason,
      target: { id: coin.drop_id, amount: coin.amount }
    }),
    buildEnemyAction: (origin, target, reason) => ({
      kind: 'attack',
      reason,
      target: { id: target.user_id }
    }),
    buildMissingHeldOpportunity: () => null,
    chooseStableOpportunity: opportunities => opportunities.slice().sort((a, b) => b.score - a.score)[0] || null,
    rememberOpportunityChoice: (item, action) => ({
      ...action,
      pickedType: item.type,
      pickedId: item.id
    })
  };
  const pickedOpportunity = pickBestOpportunityCore({ x: 0, y: 0 }, [], [{
    maxDistance: 5000,
    coins: [{ drop_id: 'pick-coin', amount: 5, distance: 500, score: 15 }]
  }], [[{ user_id: 'pick-enemy', distance: 900, score: 8, staminaCost: 100, afk: true }]], {
    ...pickCoreBaseOptions,
    disableMissingHold: true
  });
  results.push({
    name: 'opportunity-pick-core-builds-and-remembers-best-action',
    passed: flattenedEnemyCount === 1
      && pickedOpportunity?.kind === 'coin'
      && pickedOpportunity?.pickedType === 'coin'
      && pickedOpportunity?.pickedId === 'pick-coin'
  });

  const pickedMissingHeldOpportunity = pickBestOpportunityCore({ x: 0, y: 0 }, [], [{
    maxDistance: 5000,
    coins: [{ drop_id: 'pick-coin', amount: 5, distance: 500, score: 15 }]
  }], [[]], {
    ...pickCoreBaseOptions,
    buildMissingHeldOpportunity: () => ({
      type: 'coin',
      id: 'missing-pick',
      amount: 9,
      distance: 400,
      score: 99,
      priorityTier: 1,
      action: () => ({ kind: 'coin', reason: 'missing-held', target: { id: 'missing-pick' } })
    })
  });
  results.push({
    name: 'opportunity-pick-core-includes-missing-held-opportunity',
    passed: pickedMissingHeldOpportunity?.pickedId === 'missing-pick'
      && pickedMissingHeldOpportunity?.reason === 'missing-held'
  });

  const patrolScan = patrolDirectionCore({ x: 0, y: 0 }, [], [], { x: 200, y: 0 }, {
    patrolPrecisionTolerance: 10,
    patrolCoinMaxDistance: 500
  });
  results.push({
    name: 'patrol-direction-core-scans-toward-distant-coin',
    passed: patrolScan.direction?.dx === 1
      && patrolScan.direction?.dy === 0
      && patrolScan.direction?.reason === 'scan-toward-distant-coin'
      && patrolScan.clearPatrolHeading === false
  });

  const patrolSpacing = patrolDirectionCore({ x: 0, y: 0 }, [{ x: 1000, y: 0 }], [{ x: 0, y: 1000 }], null, {
    dangerRadius: 3000,
    activeAvoidMaxDistance: 3000,
    activeCautionRadius: 2000
  });
  results.push({
    name: 'patrol-direction-core-maintains-safe-spacing',
    passed: patrolSpacing.direction?.dx === -1
      && patrolSpacing.direction?.dy === -1
      && patrolSpacing.direction?.reason === 'maintain-safe-spacing'
      && patrolSpacing.clearPatrolHeading === true
  });

  const patrolWait = patrolDirectionCore({ x: 0, y: 0 }, [{ x: 9000, y: 0 }], [{ x: 60000, y: 0 }], null, {
    dangerRadius: 3000,
    activeAvoidMaxDistance: 3000,
    activeCautionRadius: 2000
  });
  results.push({
    name: 'patrol-direction-core-waits-without-visible-profit',
    passed: patrolWait.direction?.dx === 0
      && patrolWait.direction?.dy === 0
      && patrolWait.direction?.reason === 'wait-for-visible-coin-refresh'
      && patrolWait.clearPatrolHeading === true
  });

  const postAttackDist = (a, b) => Math.hypot(Number(a.x) - Number(b.x), Number(a.y) - Number(b.y));
  results.push({
    name: 'post-attack-drop-visible-coin-exists-core',
    passed: postAttackVisibleCoinExistsCore(
      [{ x: 1010, y: 0, amount: 1 }, { x: 9000, y: 0, amount: 20 }],
      { x: 1000, y: 0 },
      { dist: postAttackDist, dropCoinRadius: 50 }
    ) === true
      && postAttackVisibleCoinExistsCore(
        [{ x: 1010, y: 0, amount: 0 }],
        { x: 1000, y: 0 },
        { dist: postAttackDist, dropCoinRadius: 50 }
      ) === false
  });

  const postAttackCoinOptions = {
    nowMs: 10000,
    dist: postAttackDist,
    priorityMs: 5000,
    includeSingle: false,
    minAmount: 1,
    minScore: 10,
    dropCoinRadius: 3500,
    resolveAttack: item => Number(item.resolvedAt || 0),
    scoreCoin: coin => Number(coin.score || 0)
  };
  const postAttackCoinPicked = pickPostAttackDropCoinCore([
    { id: 'old', x: 2000, y: 0, at: 4000, resolvedAt: 9700, drop: 50, afk: true, action: 'attack' },
    { id: 'target-low', x: 2000, y: 0, at: 9000, resolvedAt: 9700, drop: 12, afk: true, action: 'attack' },
    {
      id: 'target-high',
      name: 'HighDrop',
      x: 2100,
      y: 0,
      at: 9100,
      resolvedAt: 9800,
      drop: 20,
      afk: true,
      action: 'opportunistic-shot',
      combat: true,
      battleStaminaSpentStartMs: 123.4,
      staminaSpentMs: 567.8
    }
  ], [
    { drop_id: 'coin-a', x: 2050, y: 0, amount: 3, distance: 2050, score: 30 }
  ], postAttackCoinOptions);
  results.push({
    name: 'post-attack-drop-coin-picks-matched-visible-drop',
    passed: postAttackCoinPicked.selected?.drop_id === 'coin-a'
      && postAttackCoinPicked.selected?.postAttackTarget?.id === 'target-high'
      && postAttackCoinPicked.selected?.postAttackTarget?.name === 'HighDrop'
      && postAttackCoinPicked.selected?.postAttackTarget?.action === 'opportunistic-shot'
      && postAttackCoinPicked.selected?.postAttackTarget?.coinDistanceToTarget === 50
      && postAttackCoinPicked.selected?.postAttackTarget?.battleStaminaSpentStartMs === 123
      && postAttackCoinPicked.selected?.postAttackTarget?.staminaSpentMs === 568
      && postAttackCoinPicked.candidates.length === 1
  });

  const postAttackCoinFiltered = pickPostAttackDropCoinCore([
    { id: 'target', x: 2000, y: 0, at: 9000, resolvedAt: 9700, drop: 20, afk: true, action: 'attack' }
  ], [
    { drop_id: 'single', x: 2000, y: 0, amount: 1, distance: 2000, score: 100 },
    { drop_id: 'low-score', x: 2100, y: 0, amount: 2, distance: 2100, score: 5 },
    { drop_id: 'far', x: 9000, y: 0, amount: 4, distance: 9000, score: 100 }
  ], postAttackCoinOptions);
  results.push({
    name: 'post-attack-drop-coin-filters-amount-score-radius',
    passed: postAttackCoinFiltered.selected === null
      && postAttackCoinFiltered.candidates.length === 0
  });

  const postAttackCoinBest = pickPostAttackDropCoinCore([
    { id: 'target', x: 2000, y: 0, at: 9000, resolvedAt: 9700, drop: 20, afk: true, action: 'attack' }
  ], [
    { drop_id: 'score-win', x: 2100, y: 0, amount: 2, distance: 2100, score: 50 },
    { drop_id: 'lower-score', x: 2050, y: 0, amount: 2, distance: 2050, score: 20 },
    { drop_id: 'amount-win', x: 2500, y: 0, amount: 3, distance: 2500, score: 10 }
  ], postAttackCoinOptions);
  results.push({
    name: 'post-attack-drop-coin-selects-amount-before-score',
    passed: postAttackCoinBest.selected?.drop_id === 'amount-win'
      && postAttackCoinBest.candidates.length === 3
  });

  const postAttackWaitOptions = {
    nowMs: 10000,
    self: { x: 0, y: 0 },
    dist: postAttackDist,
    waitMs: 1000,
    resolveMaxMs: 5000,
    minDrop: 8,
    maxDistance: 50000,
    stopDistance: 900,
    dropCoinRadius: 3500,
    resolveAttack: item => Number(item.resolvedAt || 0),
    coinBlockedByThreat: () => false
  };
  const postAttackPicked = pickPostAttackDropWaitTargetCore([
    { id: 'low', x: 1200, y: 0, at: 9000, resolvedAt: 9700, drop: 7, afk: true, action: 'attack' },
    { id: 'near', x: 850, y: 0, at: 9000, resolvedAt: 9700, drop: 30, afk: true, action: 'attack' },
    { id: 'best', x: 2200, y: 0, at: 9000, resolvedAt: 9700, drop: 20, afk: true, action: 'opportunistic-shot' },
    { id: 'older', x: 1200, y: 0, at: 9000, resolvedAt: 9700, drop: 12, afk: true, action: 'attack' }
  ], [], [], postAttackWaitOptions);
  results.push({
    name: 'post-attack-drop-wait-picks-resolved-target',
    passed: postAttackPicked?.id === 'best'
      && postAttackPicked?.postAttackDropResolvedAt === 9700
      && Math.round(postAttackPicked?.distance || 0) === 2200
  });

  const postAttackChaseActivePicked = pickPostAttackDropWaitTargetCore([
    { id: 'active-chase', x: 2200, y: 0, at: 9000, resolvedAt: 9700, drop: 20, afk: false, active: true, chase: true, action: 'attack' },
    { id: 'active-normal', x: 1800, y: 0, at: 9000, resolvedAt: 9700, drop: 25, afk: false, active: true, action: 'attack' }
  ], [], [], postAttackWaitOptions);
  results.push({
    name: 'post-attack-drop-wait-allows-active-chase-targets',
    passed: postAttackChaseActivePicked?.id === 'active-chase'
  });

  const postAttackCovered = pickPostAttackDropWaitTargetCore([
    { id: 'covered', x: 2200, y: 0, at: 9000, resolvedAt: 9700, drop: 20, afk: true, action: 'attack' }
  ], [{ x: 2200, y: 100, amount: 1 }], [], postAttackWaitOptions);
  const postAttackThreatBlocked = pickPostAttackDropWaitTargetCore([
    { id: 'blocked', x: 2200, y: 0, at: 9000, resolvedAt: 9700, drop: 20, afk: true, action: 'attack' }
  ], [], [{ x: 2000, y: 0 }], {
    ...postAttackWaitOptions,
    coinBlockedByThreat: () => true
  });
  results.push({
    name: 'post-attack-drop-wait-skips-covered-or-threat-blocked',
    passed: postAttackCovered === null && postAttackThreatBlocked === null
  });

  results.push({
    name: 'stamina-budget-daily-limit-core',
    passed: dailyStaminaBudgetIsLimitingCore(800, 1000, 700) === true
      && dailyStaminaBudgetIsLimitingCore(1200, 1000, 700) === false
      && dailyStaminaBudgetIsLimitingCore(800, Infinity, 700) === true
      && dailyStaminaBudgetIsLimitingCore(800, 1000, Infinity) === false
  });

  const blockedStaminaSummary = summarizeBlockedStaminaOpportunityCore([
    { drop_id: 'expensive-coin', amount: 2, distance: 300, staminaCost: 1500, snapshot: true },
    { drop_id: 'cheap-coin', amount: 1, distance: 100, staminaCost: 900 }
  ], [
    { user_id: 'enemy', name: 'Enemy', drop: 4, distance: 200, staminaCost: 1200 }
  ], {
    budget: 1000,
    coinStaminaCost: coin => Number(coin.staminaCost || 0),
    enemyStaminaCost: target => Number(target.staminaCost || 0)
  });
  results.push({
    name: 'stamina-budget-blocked-summary-picks-smallest-shortage',
    passed: blockedStaminaSummary?.type === 'enemy'
      && blockedStaminaSummary?.id === 'enemy'
      && blockedStaminaSummary?.requiredMs === 1200
      && blockedStaminaSummary?.shortageMs === 200
      && blockedStaminaSummary?.distance === 200
  });

  const nearestCoinExit = summarizeNearestCoinStaminaBudgetExitCore({ x: 0, y: 0 }, [
    { drop_id: 'far', x: 500, y: 0, amount: 5, staminaCost: 2000, native: true },
    { drop_id: 'near', x: 100, y: 0, amount: 1, staminaCost: 1500, snapshot: true }
  ], {
    budget: 1000,
    dist: postAttackDist,
    coinStaminaCost: coin => Number(coin.staminaCost || 0),
    reloginDelayMs: 1800000
  });
  results.push({
    name: 'stamina-budget-nearest-coin-exit-summary',
    passed: nearestCoinExit?.id === 'near'
      && nearestCoinExit?.distance === 100
      && nearestCoinExit?.requiredMs === 1500
      && nearestCoinExit?.reloginDelayMs === 1800000
      && nearestCoinExit?.snapshot === true
  });

  const dailyFinalCoin = pickNearestDailyStaminaFinalCoinCore([
    { drop_id: 'snapshot', amount: 10, distance: 50, staminaCost: 600, snapshotOnly: true },
    { drop_id: 'far', amount: 5, distance: 500, staminaCost: 600 },
    { drop_id: 'near', amount: 1, distance: 100, staminaCost: 600 },
    { drop_id: 'affordable', amount: 20, distance: 10, staminaCost: 300 }
  ], {
    coinStaminaCost: coin => Number(coin.staminaCost || 0),
    oneHourBudget: 1000,
    oneDayBudget: 500,
    isSnapshotOnlyCoin: coin => Boolean(coin.snapshotOnly)
  });
  results.push({
    name: 'stamina-budget-daily-final-picks-nearest-visible-limiting-coin',
    passed: dailyFinalCoin?.drop_id === 'near'
  });

  const chaseSelf = { user_id: 'self', x: 0, y: 0 };
  const chaseDist = (a, b) => Math.hypot(Number(a.x) - Number(b.x), Number(a.y) - Number(b.y));
  const chaseCandidates = aggregateChaseCandidates([
    {
      source: 'snapshot',
      items: [
        { user_id: 'a', name: 'A-old', x: 10000, y: 0, drop: 15, hp: 80, snapshot: true, observedAt: 1000 },
        { user_id: 'b', name: 'B', x: 4000, y: 0, drop: 11, hp: 60, snapshot: true, observedAt: 1000 }
      ]
    },
    {
      source: 'native',
      items: [
        { user_id: 'a', name: 'A-live', x: 2000, y: 0, drop: 12, hp: 70, native: true, observedAt: 1200 }
      ]
    },
    {
      source: 'minimap',
      items: [
        { user_id: 'c', x: 1000, y: 0, drop: 20, minimapOnly: true, observedAt: 1200 }
      ]
    }
  ], { self: chaseSelf, dist: chaseDist, nowMs: 1200 });
  const chaseA = chaseCandidates.find(item => item.id === 'a');
  const chaseC = chaseCandidates.find(item => item.id === 'c');
  results.push({
    name: 'chase-mode-aggregation-prefers-native-position-and-preserves-drop-metadata',
    passed: chaseA?.name === 'A-live'
      && chaseA?.x === 2000
      && chaseA?.visible === true
      && chaseA?.drop === 15
      && chaseA?.latestDrop === 12
      && chaseC?.minimapOnly === true
      && chaseC?.visible === false
  });

  const chasePanelPool = [];
  for (let i = 0; i < 12; i += 1) {
    chasePanelPool.push({ id: 'drop-' + i, name: 'D' + i, drop: 30 - i, distance: 100000 + i, marked: false });
  }
  for (let i = 0; i < 12; i += 1) {
    chasePanelPool.push({ id: 'near-' + i, name: 'N' + i, drop: 10 + i, distance: i + 1, marked: false });
  }
  const chasePanel = selectPanelCandidates(chasePanelPool, [{ id: 'marked' }], {
    minDrop: 10,
    topDropLimit: 10,
    nearestLimit: 10,
    maxCandidates: 20
  });
  results.push({
    name: 'chase-mode-panel-candidates-use-top-drop-nearest-union-cap',
    passed: chasePanel.length === 20
      && chasePanel.some(item => item.id === 'drop-0')
      && chasePanel.some(item => item.id === 'near-0')
      && !chasePanel.some(item => item.id === 'drop-11')
  });

  const chaseState = normalizeChaseModeState({
    targets: [
      { id: 'far', name: 'Far', dropAtMark: 18, lastDrop: 18, markedAt: 100 },
      { id: 'near', name: 'Near', dropAtMark: 16, lastDrop: 16, markedAt: 100 }
    ]
  });
  const decoratedChaseTargets = decorateChaseTargets(chaseState, [
    { id: 'far', name: 'Far', drop: 18, distance: 5000, seekableNow: true },
    { id: 'near', name: 'Near', drop: 16, distance: 1000, seekableNow: true }
  ], { nowMs: 500 });
  const chaseSticky = chooseChaseTarget(decoratedChaseTargets, { id: 'far', at: 100 }, {
    nowMs: 500,
    stickMs: 1000,
    minDrop: 10
  });
  const chaseNearest = chooseChaseTarget(decoratedChaseTargets, { id: 'far', at: 100 }, {
    nowMs: 2000,
    stickMs: 1000,
    minDrop: 10
  });
  results.push({
    name: 'chase-mode-target-selection-sticks-then-picks-nearest',
    passed: chaseSticky?.id === 'far' && chaseNearest?.id === 'near'
  });

  const lowDropDecorated = decorateChaseTargets(
    normalizeChaseModeState({ targets: [{ id: 'low', dropAtMark: 14, lastDrop: 14 }] }),
    [{ id: 'low', drop: 7, latestDrop: 7, distance: 1000, seekableNow: true, source: 'snapshot', observedAt: 1000, explicitFreshDropLow: true }],
    { nowMs: 1100 }
  );
  const minimapOnlyDecorated = decorateChaseTargets(
    normalizeChaseModeState({ targets: [{ id: 'mini', dropAtMark: 20, lastDrop: 20 }] }),
    [{ id: 'mini', drop: 20, distance: 500, seekableNow: true, visible: false, minimapOnly: true, source: 'minimap' }],
    { nowMs: 1100 }
  );
  results.push({
    name: 'chase-mode-state-retains-targets-but-exposes-low-drop-and-minimap-status',
    passed: lowDropDecorated[0]?.explicitFreshDropLow === true
      && minimapOnlyDecorated[0]?.visible === false
      && minimapOnlyDecorated[0]?.seekableNow === true
  });
  const visibleLowDropCandidate = {
    id: 'visible-low',
    drop: 0,
    latestDrop: 0,
    visible: true,
    native: true,
    explicitFreshDropLow: true
  };
  const visibleLowDropFirst = chaseLowDropClearDecision(visibleLowDropCandidate, null, {
    nowMs: 1000,
    visibleGraceMs: 1500
  });
  const visibleLowDropPending = chaseLowDropClearDecision(visibleLowDropCandidate, visibleLowDropFirst.observation, {
    nowMs: 2200,
    visibleGraceMs: 1500
  });
  const visibleLowDropMature = chaseLowDropClearDecision(visibleLowDropCandidate, visibleLowDropFirst.observation, {
    nowMs: 2600,
    visibleGraceMs: 1500
  });
  const snapshotLowDropClear = chaseLowDropClearDecision({
    id: 'snapshot-low',
    drop: 0,
    latestDrop: 0,
    snapshot: true,
    source: 'snapshot',
    explicitFreshDropLow: true
  }, null, { nowMs: 1000, visibleGraceMs: 1500 });
  results.push({
    name: 'chase-mode-visible-low-drop-clear-waits-for-grace-window',
    passed: visibleLowDropFirst.pending === true
      && visibleLowDropFirst.clear === false
      && visibleLowDropFirst.observation?.since === 1000
      && visibleLowDropPending.clear === false
      && visibleLowDropMature.clear === true
      && snapshotLowDropClear.clear === true
      && snapshotLowDropClear.pending === false
  });

  const killedSuppression = { id: 'killed', killedAt: 5000 };
  const staleKilledCandidate = normalizeChaseCandidate({
    user_id: 'killed',
    name: 'Killed',
    drop: 20,
    x: 1000,
    y: 0,
    observedAt: 4900
  }, { self: chaseSelf, dist: chaseDist, nowMs: 6000 });
  const liveResidualKilledCandidate = normalizeChaseCandidate({
    user_id: 'killed',
    name: 'Killed',
    drop: 20,
    x: 1000,
    y: 0,
    native: true
  }, { self: chaseSelf, dist: chaseDist, nowMs: 6000 });
  const freshKilledCandidate = normalizeChaseCandidate({
    user_id: 'killed',
    name: 'Killed',
    drop: 20,
    x: 1000,
    y: 0,
    observedAt: 5100
  }, { self: chaseSelf, dist: chaseDist, nowMs: 6000 });
  const staleSuppressionDecision = chaseKilledCandidateSuppressionDecision(staleKilledCandidate, killedSuppression);
  const liveResidualSuppressionDecision = chaseKilledCandidateSuppressionDecision(liveResidualKilledCandidate, killedSuppression);
  const freshSuppressionDecision = chaseKilledCandidateSuppressionDecision(freshKilledCandidate, killedSuppression);
  const nativeGlobalResidualCandidate = aggregateChaseCandidates(buildChaseSourceListsCore({
    globalTargets: [{
      user_id: 'killed',
      name: 'Killed',
      drop: 20,
      x: 1000,
      y: 0,
      native: true,
      global: true
    }]
  }, { snapshotRefreshedAt: 5100 }), { self: chaseSelf, dist: chaseDist, nowMs: 6000 })[0];
  const nativeGlobalSuppressionDecision = chaseKilledCandidateSuppressionDecision(nativeGlobalResidualCandidate, killedSuppression);
  results.push({
    name: 'chase-mode-killed-target-suppression-waits-for-explicit-new-observation',
    passed: staleSuppressionDecision.suppress === true
      && liveResidualSuppressionDecision.suppress === true
      && liveResidualSuppressionDecision.observedAt === 0
      && nativeGlobalSuppressionDecision.suppress === true
      && nativeGlobalSuppressionDecision.observedAt === 0
      && freshSuppressionDecision.release === true
      && freshSuppressionDecision.observedAt === 5100
  });

  // Test combat constants validation
  const combatErrors = validateCombatConstants();
  results.push({
    name: 'combat-constants-valid',
    passed: combatErrors.length === 0,
    errors: combatErrors
  });

  // Test opportunity constants validation
  const opportunityErrors = validateOpportunityConstants();
  results.push({
    name: 'opportunity-constants-valid',
    passed: opportunityErrors.length === 0,
    errors: opportunityErrors
  });

  // Test opportunity ROI calculation
  const roi1 = calculateOpportunityROI(10, 1000);
  results.push({
    name: 'opportunity-roi-basic',
    passed: Math.abs(roi1 - 0.01) < 0.001
  });

  const roi2 = calculateOpportunityROI(10, 0);
  results.push({
    name: 'opportunity-roi-zero-cost',
    passed: roi2 === Infinity
  });

  // Summary
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  return {
    passed,
    failed,
    total: results.length,
    results,
    success: failed === 0
  };
}

module.exports = {
  runStrategyModuleSelfTests
};
