'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { performance } = require('perf_hooks');
const { parseBrowserlessRunnerArgs } = require('./config');
const { cleanupOldLogDays } = require('./log-retention');
const { createLocalLogStore } = require('./local-log-store');
const { createBrowserlessBackgroundIo } = require('./background-io');
const {
  browserlessStatsForDecision,
  browserlessStatsForKillEvidence,
  browserlessStatsForOffline,
  browserlessCompactStatusSource,
  buildCompactBrowserlessStatus,
  buildPublicBrowserlessStatus,
  loginPointFromAnyState,
  mergeLiveActionState,
  mergeLiveState,
  mergeState,
  readBrowserlessStateFile,
  reconcileBrowserlessExitKillEvidence,
  sessionFromAnyState,
  stateFilePath,
  updateBrowserlessStateFile,
  writeBrowserlessStateFile
} = require('./state-file');
const { startStatusServer } = require('./status-server');
const {
  BROWSERLESS_WEB_PANEL_VERSION,
  highDropBalanceDeltaValueCore,
  groupBlockingFactorsCore,
  highDropRankValueCore,
  highDropSortValueCore,
  isStaminaExhaustionExitReasonCore,
  lastExitPanelVisibleCore,
  mapRemoteTargetPositionCore,
  panelTargetRolesCore,
  remoteTargetActivityTextCore
} = require('./web-panel');
const {
  createMapTrailTracker,
  runMapTrailTrackerSelfTest
} = require('./map-trail-tracker');
const {
  createRemoteProfitWorker,
  isRemoteProfitSnapshotEligible,
  remoteProfitRealtimeSelfFromLiveState
} = require('./remote-profit-worker');
const {
  applySingleBlockerLoginBypass,
  inspectCanaryFrame,
  runPreLoginSnapshotSafety,
  runReadOnlyCanary
} = require('./canary');
const { runTransportHealthSelfTest } = require('./transport-health');
const {
  DEFAULT_RECORD_THRESHOLD,
  DEFAULT_SNAPSHOT_GAP_MS,
  createHighDropPlayerTracker,
  createSnapshotGapPoller
} = require('./high-drop-player-tracker');
const {
  createSnapshotAuditObserver,
  runSnapshotAuditSelfTest
} = require('./snapshot-audit');
const {
  DEFAULT_SNAPSHOT_REQUEST_INTERVAL_MS,
  createSnapshotRequestScheduler,
  runSnapshotRequestSchedulerSelfTest
} = require('./snapshot-request-scheduler');
const {
  MAX_SCORE: EASY_KILL_MAX_SCORE,
  createEasyKillPlayerTracker
} = require('./easy-kill-player-tracker');
const { createCombatCompletionTracker } = require('./combat-completion-tracker');
const { createCombatBattleLog, runCombatBattleLogSelfTest } = require('./combat-battle-log');
const { createDailyDamagePlayerTracker } = require('./daily-damage-player-tracker');
const { createDynamicWhitelist } = require('./dynamic-whitelist');
const {
  DEFAULT_CHAT_ACTIVE_INTERVAL_MS,
  DEFAULT_CHAT_IDLE_INTERVAL_MS,
  createChatService,
  runChatServiceSelfTest
} = require('./chat-service');
const {
  inspectChatHistoryDatabase,
  runChatHistoryStoreSelfTest
} = require('./chat-history-store');
const {
  BROWSER_RUNTIME_DEFAULTS,
  buildBrowserlessRuntimeDefaults,
  buildBrowserlessRealtimeControlDecision,
  decisionStatePatch,
  establishedCombatLootPriority,
  observeBrowserlessCoinPickups,
  realtimeNearbyObservationSummary,
  snapshotSelfKillEvidence,
  summarizeNearbyForPanel
} = require('./decision-adapter');
const {
  dailyStaminaExitExemptAt,
  effectiveLongStaminaExhaustedWindows
} = require('../../shared/daily-stamina-window');
const { createBrowserlessActionAdapter } = require('./action-adapter');
const {
  buildBrowserlessCombatDryRun,
  runCombatAttackClockSelfTest
} = require('./combat-adapter');
const { runCombatShotExecutionSelfTest } = require('./combat-shot-execution-self-test');
const { runCombatTargetFrameGapSelfTest } = require('./combat-target-frame-gap-self-test');
const { runIncomingPressureSelfTest } = require('./incoming-pressure-self-test');
const { runInvulnerableWaitStationSelfTest } = require('./invulnerable-wait-station-self-test');
const { runLootRacePositioningSelfTest } = require('./loot-race-positioning-self-test');
const { createSourceIpController } = require('./source-ip-controller');
const {
  DEFAULT_SOURCE_IP_INTERFACE,
  SOURCE_IP_PREFLIGHT_INSUFFICIENT_COOLDOWN_MS,
  SOURCE_IP_PREFLIGHT_REQUIRED_COUNT,
  discoverInterfaceIpv4,
  ensureSourceIpPreflight,
  normalizeSourceIpPreflight,
  requestAnonymousGameRoot,
  reusableSourceIpPreflight,
  runSourceIpPreflightSelfTest,
  sourceIpPreflightErrorCategory
} = require('./source-ip-preflight');
const { createBrowserlessSafetyController } = require('./safety-controller');
const {
  actionTargetKey,
  createRestartDrainCoordinator,
  evaluateRestartReadiness,
  restartDrainAllowsDecision,
  restartDrainRetainsCommittedDecision
} = require('./restart-readiness');
const { browserlessRuntimeRevision, browserlessRuntimeRevisionStatus } = require('./runtime-revision');
const { runSnapshotEdgeSelfTest } = require('./snapshot-edge-wait');
const {
  REQUEST_CLASSES,
  runRequestRatePolicySelfTest
} = require('./request-rate-policy');
const {
  normalizePendingExit,
  pendingExitFromCanary,
  pendingExitSnapshotResolution,
  runPendingExitRecoverySelfTest
} = require('./pending-exit-recovery');
const {
  armLoginRecoveryAssociation,
  consumeLoginRecoveryAssociation,
  normalizePendingLoginRecovery,
  runLoginRecoveryAssociationSelfTest
} = require('./login-recovery-association');
const {
  buildSnapshotProbeUrl,
  readResponseBody,
  redactSecrets,
  summarizeSnapshotPayload
} = require('./session-client');
const { runCloudflareChallengeSelfTest } = require('./cloudflare-challenge');
const { runSourceIpProbeSelfTest } = require('./source-ip-probe');
const { runRemoteProfitWorkerSelfTest } = require('./remote-profit-worker-self-test');
const { runRemoteProfitActionSelfTest } = require('./remote-profit-action-self-test');
const { runRemoteProfitDecisionSelfTest } = require('./remote-profit-decision-self-test');
const { runMissingEnemyHoldSelfTest } = require('./missing-enemy-hold-self-test');
const { runActiveJoinModeProfitSelfTest } = require('./active-join-mode-profit-self-test');
const { runInvulnerableProfitCommitmentSelfTest } = require('./invulnerable-profit-commitment-self-test');
const { runAfkDynamicFireSelfTest } = require('./afk-dynamic-fire-self-test');
const { runProfitMissionArrivalSelfTest } = require('./profit-mission-arrival-self-test');
const { runInvulnerableAfkSelfTest } = require('../../strategy/invulnerable-afk-self-test');

const DAY_MS = 24 * 60 * 60 * 1000;
const UTC8_OFFSET_MS = 8 * 60 * 60 * 1000;
const CONFIRMED_LEAVE_SNAPSHOT_IGNORE_MS = 40000;
const SELF_TEST_MAIN_THREAD_BUDGET_MS = 50;
const STATUS_COMPACT_REFRESH_MS = 500;
const STATUS_COMPACT_MAX_STALE_MS = 5000;
const STATUS_RENDER_TIMEOUT_MS = 2000;
const BACKGROUND_IO_CLOSE_TIMEOUT_MS = 5000;
const STATUS_IO_CLOSE_TIMEOUT_MS = 2000;
const STATUS_WALL_TIME_SPIKE_MS = 50;
const STATUS_CPU_USAGE_SOURCES = new Set(['linux-main-thread-schedstat', 'unavailable']);
const STATUS_WALL_CLASSIFICATIONS = new Set(['cpu-work', 'pause-gc-or-contention', 'cpu-sampler-unavailable']);

function roundedStatusTiming(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(Math.max(0, number) * 1000) / 1000 : null;
}

function statusWallTimeSpikeDetail(task, durationMs, detail = {}, runtimeRevision = browserlessRuntimeRevision()) {
  const roundedDurationMs = roundedStatusTiming(durationMs);
  if (roundedDurationMs === null || Number(durationMs) < STATUS_WALL_TIME_SPIKE_MS) return null;
  const cpuWorkMs = roundedStatusTiming(detail.cpuWorkMs);
  const nonCpuWallMs = roundedStatusTiming(detail.nonCpuWallMs);
  const cpuUsageSource = STATUS_CPU_USAGE_SOURCES.has(detail.cpuUsageSource)
    ? detail.cpuUsageSource
    : 'unavailable';
  const completeProfile = cpuUsageSource !== 'unavailable'
    && cpuWorkMs !== null
    && nonCpuWallMs !== null;
  const classification = completeProfile && STATUS_WALL_CLASSIFICATIONS.has(detail.classification)
    ? detail.classification
    : 'cpu-sampler-unavailable';
  const output = {
    task: String(task || '').slice(0, 80),
    durationMs: roundedDurationMs,
    diagnosticOnly: true,
    cpuUsageSource: completeProfile ? cpuUsageSource : 'unavailable',
    cpuWorkMs: completeProfile ? cpuWorkMs : null,
    nonCpuWallMs: completeProfile ? nonCpuWallMs : null,
    likelyPauseOrContention: completeProfile ? detail.likelyPauseOrContention === true : null,
    classification,
    runtimeRevision: String(runtimeRevision || 'unknown').slice(0, 64)
  };
  if (detail.path !== undefined) output.path = String(detail.path || '').slice(0, 160);
  if (typeof detail.compact === 'boolean') output.compact = detail.compact;
  return output;
}

function publicConfig(config) {
  return {
    gameOrigin: config.gameOrigin,
    wsPath: config.wsPath,
    wsExtraQuery: config.wsExtraQuery,
    snapshotPath: config.snapshotPath,
    targetWhitelistUrl: redactSecrets(config.targetWhitelistUrl || ''),
    targetWhitelistFile: config.targetWhitelistFile || '',
    targetWhitelistTimeoutMs: Number(config.targetWhitelistTimeoutMs || 0),
    targetWhitelistMaxNames: Number(config.targetWhitelistMaxNames || 0),
    dataDir: config.dataDir,
    logDir: config.logDir,
    statusHost: config.statusHost,
    statusPort: config.statusPort,
    webTokenPresent: Boolean(config.webToken),
    readOnly: Boolean(config.readOnly),
    controlMode: config.controlMode || 'read-only',
    canaryProfile: config.canaryProfile || '',
    dryRun: Boolean(config.dryRun),
    once: Boolean(config.once),
    logRetentionDays: Number(config.logRetentionDays || 0),
    readOnlyProbeMs: Number(config.readOnlyProbeMs || 0),
    frameGapAlertMs: Number(config.frameGapAlertMs || 0),
    transportHealthWindowMs: Number(config.transportHealthWindowMs || 0),
    transportHealthActiveWarmupMs: Number(config.transportHealthActiveWarmupMs || 0),
    transportHealthActiveHoldMs: Number(config.transportHealthActiveHoldMs || 0),
    transportLatencyDecisionWindowMs: Number(config.transportLatencyDecisionWindowMs || 0),
    transportLatencyExitMs: Number(config.transportLatencyExitMs || 0),
    transportLatencyExitSustainMs: Number(config.transportLatencyExitSustainMs || 0),
    transportFrameLossExitRate: Number(config.transportFrameLossExitRate || 0),
    transportFrameLossExitSustainMs: Number(config.transportFrameLossExitSustainMs || 0),
    transportFrameLossMinimumExpectedTicks: Number(config.transportFrameLossMinimumExpectedTicks || 0),
    leaveRetryMax: Number(config.leaveRetryMax || 0),
    leaveRetryMs: Number(config.leaveRetryMs || 0),
    leaveHedgeMs: Number(config.leaveHedgeMs || 0),
    leaveDangerHedgeMs: Number(config.leaveDangerHedgeMs || 0),
    sourceIpProbeTimeoutMs: Number(config.sourceIpProbeTimeoutMs || 0),
    decisionIntervalMs: Number(config.decisionIntervalMs || 0),
    loopDelayMs: Number(config.loopDelayMs || 0),
    loginIntervalMs: Math.max(60000, Number(config.loginIntervalMs || 0)),
    actionSettlementRecoveryMaxMs: actionSettlementRecoveryMaxMs(config),
    dailyFirstLoginDelayMs: Number(config.dailyFirstLoginDelayMs || 0),
    loginPointSafetySuccessRequired: Number(config.loginPointSafetySuccessRequired || 0),
    loginPointSafetyProbeIntervalMs: Number(config.loginPointSafetyProbeIntervalMs || 0),
    loginPointSingleBlockerBypassMs: Number(config.loginPointSingleBlockerBypassMs || 0),
    snapshotEdgeEnabled: config.snapshotEdgeEnabled === true,
    snapshotEdgeIntervalMs: Math.max(30000, Number(config.snapshotEdgeIntervalMs || 0)),
    snapshotEdgeMaxWaitMs: Number(config.snapshotEdgeMaxWaitMs || 0),
    snapshotEdgeMaxErrors: Number(config.snapshotEdgeMaxErrors || 0),
    snapshotEdgeBackoffMs: Number(config.snapshotEdgeBackoffMs || 0),
    staleSelfMs: Number(config.staleSelfMs || 0),
    staleSelfConfirmMs: Number(config.staleSelfConfirmMs || 0),
    noSelfGraceMs: Number(config.noSelfGraceMs || 0),
    staminaExhaustedBelowMs: Number(config.staminaExhaustedBelowMs || 0),
    movementCommandIntervalMs: Number(config.movementCommandIntervalMs || 0),
    movementTargetDeadZoneCm: Number(config.movementTargetDeadZoneCm || 0),
    playerDropPickupRadiusCm: Number(config.playerDropPickupRadiusCm || 0),
    invulnerableProfitApproachDistanceCm: Number(config.playerDropPickupRadiusCm || 0),
    invulnerableProfitArrivalHysteresisCm: Number(config.invulnerableProfitArrivalHysteresisCm || 0),
    movementSettlementFrames: Number(config.movementSettlementFrames || 0),
    movementSettlementStallMs: Number(config.movementSettlementStallMs || 0),
    movementSettlementMinDistanceCm: Number(config.movementSettlementMinDistanceCm || 0),
    singleCoinBaitEnabled: config.singleCoinBaitEnabled !== false,
    singleCoinBaitHoldRadiusCm: Number(config.singleCoinBaitHoldRadiusCm || 0),
    browserlessCenterActivityRadiusCm: Number(config.browserlessCenterActivityRadiusCm || 0),
    browserlessOutsideCenterIdleExitMs: Number(config.browserlessOutsideCenterIdleExitMs || 0),
    browserlessProfitPursuitMaxMs: Number(config.browserlessProfitPursuitMaxMs || 0),
    browserlessProfitPursuitSuppressMs: Number(config.browserlessProfitPursuitSuppressMs || 0),
    browserlessDangerousTargetCooldownMs: Number(config.browserlessDangerousTargetCooldownMs || 0),
    browserlessProfitPursuitMinDamageMs: Number(config.browserlessProfitPursuitMinDamageMs || 0),
    browserlessProfitPursuitMinDamageHp: Number(config.browserlessProfitPursuitMinDamageHp || 0),
    browserlessProfitPursuitSoftMovementStaminaMs: Number(config.browserlessProfitPursuitSoftMovementStaminaMs || 0),
    browserlessProfitPursuitHardNoDamageMs: Number(config.browserlessProfitPursuitHardNoDamageMs || 0),
    browserlessProfitPursuitHardMovementStaminaMs: Number(config.browserlessProfitPursuitHardMovementStaminaMs || 0),
    browserlessProfitPursuitPressureCycleMs: Number(config.browserlessProfitPursuitPressureCycleMs || 0),
    combatEnabled: Boolean(config.combatEnabled),
    combatRobustDodgeEnabled: config.combatRobustDodgeEnabled !== false,
    combatDistanceAwareDodgeEnabled: config.combatDistanceAwareDodgeEnabled !== false,
    combatCloseBandReserveEnabled: config.combatCloseBandReserveEnabled !== false,
    combatMovementStabilityEnabled: config.combatMovementStabilityEnabled === true,
    combatSafeRetreatInterceptEnabled: config.combatSafeRetreatInterceptEnabled === true,
    combatTargetSwitchUrgentReversalGuardEnabled: config.combatTargetSwitchUrgentReversalGuardEnabled === true,
    combatShootMinIntervalMs: Number(config.combatShootMinIntervalMs || 0),
    combatLootRacePositioningEnabled: config.combatLootRacePositioningEnabled !== false,
    combatLootRaceMinDrop: Number(config.combatLootRaceMinDrop || 0),
    combatLootRaceMaxKillHorizonMs: Number(config.combatLootRaceMaxKillHorizonMs || 0),
    combatLootRaceCompetitorEtaMarginMs: Number(config.combatLootRaceCompetitorEtaMarginMs || 0),
    combatLootRaceMinSelfHp: Number(config.combatLootRaceMinSelfHp || 0),
    combatLootRaceMinOwnEtaMs: Number(config.combatLootRaceMinOwnEtaMs || 0),
    combatEfficiencyWindowMs: Number(config.combatEfficiencyWindowMs || 0),
    combatEfficiencyReferenceDamageHp: Number(config.combatEfficiencyReferenceDamageHp || 0),
    combatEfficiencyExpectedDamagePerShot: Number(config.combatEfficiencyExpectedDamagePerShot || 0),
    combatEfficiencyExpectedShotCadenceMs: Number(config.combatEfficiencyExpectedShotCadenceMs || 0),
    combatEfficiencyMinimumWindowMs: Number(config.combatEfficiencyMinimumWindowMs || 0),
    combatEfficiencyCloseStepCm: Number(config.combatEfficiencyCloseStepCm || 0),
    combatEfficiencyMinimumDistanceCm: Number(config.combatEfficiencyMinimumDistanceCm || 0),
    combatEfficiencyRequiredCloserRatio: Number(config.combatEfficiencyRequiredCloserRatio || 0),
    combatEfficiencySampleGapCapMs: Number(config.combatEfficiencySampleGapCapMs || 0),
    combatResponsePolicyShadowConfirmTicks: Number(config.combatResponsePolicyShadowConfirmTicks || 0),
    combatResponsePolicyShadowMinimumHoldMs: Number(config.combatResponsePolicyShadowMinimumHoldMs || 0),
    combatTrajectoryCoverageMode: String(config.combatTrajectoryCoverageMode || 'live-single'),
    combatEvasiveAimEnabled: config.combatEvasiveAimEnabled !== false,
    combatEvasiveAimTriggerEnabled: config.combatEvasiveAimTriggerEnabled === true,
    combatEvasiveAimEarlyDetectionEnabled: config.combatEvasiveAimEarlyDetectionEnabled !== false,
    wsTraceEnabled: Boolean(config.wsTraceEnabled),
    wsTracePayload: Boolean(config.wsTracePayload),
    wsTraceMaxPayloadChars: Number(config.wsTraceMaxPayloadChars || 0),
    sourceIp: config.sourceIp || '',
    sourceIps: config.sourceIps || [],
    sourceIpInterface: config.sourceIpInterface || 'enp0s6',
    stateFile: config.stateFile || stateFilePath(config),
    loginPointPresent: hasConfigNumber(config.loginPointX) && hasConfigNumber(config.loginPointY),
    dynamicProfitThresholdEnabled: Boolean(config.dynamicProfitThresholdEnabled),
    browserlessRemoteProfitTargetsEnabled: config.browserlessRemoteProfitTargetsEnabled !== false,
    profitThresholdCoinsPer10Stamina: Number(config.profitThresholdCoinsPer10Stamina || 0),
    profitThresholdHourlyStaminaLimit: Number(config.profitThresholdHourlyStaminaLimit || 0),
    profitThresholdResetReserveMs: Number(config.profitThresholdResetReserveMs || 0),
    recoveryPriorityLowHpApproachStaminaMilli: Number(config.recoveryPriorityLowHpApproachStaminaMilli || 0),
    recoveryPriorityHighHpApproachStaminaMilli: Number(config.recoveryPriorityHighHpApproachStaminaMilli || 0),
    userId: Number(config.userId || 0),
    sessionTokenPresent: Boolean(config.sessionToken)
  };
}

function runLoginPointSingleBlockerSelfTest() {
  const startedAtMs = Date.UTC(2026, 6, 18, 0, 0, 0);
  const loginPoint = { x: 0, y: 0, hp: 100, maxHp: 100, source: 'self-test' };
  const blocker = {
    entity_id: 11,
    user_id: 1011,
    name: 'single-blocker',
    x: 1000,
    y: 0,
    hp: 100,
    max_hp: 100,
    current_join_mode: 'Active',
    stamina_5s_remaining_milli: 9000,
    stamina_5s_limit_milli: 10000,
    life: 'Alive'
  };
  const payload = {
    tick: 100,
    entities: [blocker],
    bullets: [],
    coin_drops: [],
    messages: []
  };
  const baseSummary = summarizeSnapshotPayload(payload, {
    userId: 7,
    loginPoint,
    latestKnownTick: 99,
    damageActorUserIds: [blocker.user_id]
  });
  const config = { loginPointSingleBlockerBypassMs: 3600000 };
  const first = applySingleBlockerLoginBypass(baseSummary, {}, config, startedAtMs);
  const firstState = {
    loginPointSafety: {
      point: loginPoint,
      detail: {
        singleBlockerHold: first.summary.safety.singleBlockerHold
      }
    }
  };
  const persistedHold = persistedSingleBlockerHoldForPoint(firstState, loginPoint);
  const changedPointHold = persistedSingleBlockerHoldForPoint(firstState, { ...loginPoint, x: 1 });
  const startupPending = pendingLoginPointSafetyPatch(
    config,
    'manual-login-point-pending-snapshot-safety',
    loginPoint,
    { detail: persistedHold ? { singleBlockerHold: persistedHold } : {} }
  );
  const elapsed = applySingleBlockerLoginBypass(baseSummary, firstState, config, startedAtMs + 3599999);
  const bypass = applySingleBlockerLoginBypass(baseSummary, firstState, config, startedAtMs + 3600000);
  const consumed = applySingleBlockerLoginBypass(baseSummary, {
    loginPointSafety: {
      detail: {
        singleBlockerHold: bypass.summary.safety.singleBlockerHold
      }
    }
  }, config, startedAtMs + 3601000);
  const multipleSummary = summarizeSnapshotPayload({
    ...payload,
    tick: 101,
    entities: [
      blocker,
      {
        ...blocker,
        entity_id: 12,
        user_id: 1012,
        name: 'second-blocker',
        x: 2000
      }
    ]
  }, {
    userId: 7,
    loginPoint,
    latestKnownTick: 100,
    damageActorUserIds: [blocker.user_id]
  });
  const multiple = applySingleBlockerLoginBypass(multipleSummary, firstState, config, startedAtMs + 3600000);
  const lowHpSummary = summarizeSnapshotPayload(payload, {
    userId: 7,
    loginPoint: { ...loginPoint, hp: 99 },
    latestKnownTick: 99,
    damageActorUserIds: [blocker.user_id]
  });
  const lowHp = applySingleBlockerLoginBypass(lowHpSummary, firstState, config, startedAtMs + 3600000);
  const staleSummary = summarizeSnapshotPayload(payload, {
    userId: 7,
    loginPoint,
    latestKnownTick: 101,
    damageActorUserIds: [blocker.user_id]
  });
  const stale = applySingleBlockerLoginBypass(staleSummary, firstState, config, startedAtMs + 3600000);
  const compact = buildCompactBrowserlessStatus({
    updatedAt: new Date(startedAtMs + 3600000).toISOString(),
    loginPointSafety: {
      ok: bypass.summary.safety.ok,
      reason: bypass.summary.safety.reason,
      checkedAt: new Date(startedAtMs + 3600000).toISOString(),
      point: loginPoint,
      detail: bypass.summary.safety
    }
  });
  const replacedDetail = mergeState({
    loginPointSafety: { detail: { blockingFactors: [{ reason: 'stale' }], stale: true } }
  }, {
    loginPointSafety: { detail: { blockingFactors: [] } }
  }).loginPointSafety.detail;
  return {
    ok: Boolean(
      baseSummary.safety.blockingPlayers.length === 1
        && baseSummary.safety.blockingFactors.length === 2
        && first.bypassed === false
        && first.summary.safety.singleBlockerHold.observationCount === 1
        && startupPending.detail.singleBlockerHold?.firstBlockedAt === first.summary.safety.singleBlockerHold.firstBlockedAt
        && startupPending.detail.singleBlockerHold?.observationCount === 1
        && changedPointHold === null
        && elapsed.bypassed === false
        && elapsed.summary.safety.singleBlockerHold.remainingMs === 1
        && bypass.bypassed === true
        && bypass.summary.safety.reason === 'single-blocker-timeout-bypass'
        && bypass.summary.safety.singleBlockerHold.fullHp === true
        && consumed.bypassed === false
        && consumed.summary.safety.singleBlockerHold.durationMs === 0
        && multiple.bypassed === false
        && multiple.summary.safety.singleBlockerHold.resetReason === 'multiple-blocking-players'
        && lowHp.bypassed === false
        && lowHp.summary.safety.singleBlockerHold.resetReason === 'login-point-not-full-hp'
        && stale.bypassed === false
        && stale.summary.safety.singleBlockerHold.resetReason === 'non-player-blocking-factor'
        && compact.loginPointSafety.detail.blockingPlayers.length === 1
        && compact.loginPointSafety.detail.blockingFactors.length === 2
        && compact.loginPointSafety.detail.singleBlockerHold.eligible === true
        && replacedDetail.blockingFactors.length === 0
        && replacedDetail.stale === undefined
    ),
    blockingPlayerCount: baseSummary.safety.blockingPlayers.length,
    blockingFactorCount: baseSummary.safety.blockingFactors.length,
    startupHoldPreserved: Boolean(startupPending.detail.singleBlockerHold),
    changedPointHoldPreserved: Boolean(changedPointHold),
    bypassReason: bypass.summary.safety.reason,
    consumedDurationMs: consumed.summary.safety.singleBlockerHold.durationMs,
    multipleResetReason: multiple.summary.safety.singleBlockerHold.resetReason,
    lowHpResetReason: lowHp.summary.safety.singleBlockerHold.resetReason,
    staleResetReason: stale.summary.safety.singleBlockerHold.resetReason,
    compactFactorCount: compact.loginPointSafety.detail.blockingFactors.length
  };
}

async function runLoginPointHighHpExemptionSelfTest() {
  const config = {
    gameOrigin: 'https://snapshot-safety.example',
    snapshotPath: '/snapshot',
    userId: 7,
    sessionToken: 'high-hp-self-test-token',
    snapshotEdgeEnabled: false,
    loginPointSafetySuccessRequired: 1
  };
  const payload = {
    tick: 100,
    entities: [],
    bullets: [],
    coin_drops: [],
    messages: []
  };
  const response = {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: { get: () => '' },
    text: async () => JSON.stringify(payload)
  };
  let fetchCount = 0;
  const deps = {
    now: () => Date.UTC(2026, 7, 5, 0, 0, 0),
    fetchWithTimeout: async () => {
      fetchCount += 1;
      return response;
    }
  };
  const highHp = await runPreLoginSnapshotSafety(config, {
    loginPointSafety: { point: { x: 0, y: 0, hp: 80, source: 'self-test' } }
  }, deps);
  const highHpFetchCount = fetchCount;
  const lowHp = await runPreLoginSnapshotSafety(config, {
    loginPointSafety: { point: { x: 0, y: 0, hp: 79, source: 'self-test' } }
  }, deps);
  const lowHpFetchCount = fetchCount;
  const recovery = await runPreLoginSnapshotSafety(config, {
    loginPointSafety: { point: { x: 0, y: 0, hp: 100, source: 'self-test' } },
    runner: { pendingExit: { exitAttemptId: 'self-test-pending-exit' } }
  }, deps);
  const recoveryFetchCount = fetchCount;
  let sharedSchedulerNowMs = Date.UTC(2026, 7, 5, 0, 1, 0);
  let sharedSchedulerFetchCount = 0;
  const sharedScheduler = createSnapshotRequestScheduler({
    now: () => sharedSchedulerNowMs,
    sleep: async delayMs => { sharedSchedulerNowMs += delayMs; },
    fetchSnapshot: async detail => {
      sharedSchedulerFetchCount += 1;
      return {
        ok: true,
        status: 200,
        payload: {
          tick: 100 + sharedSchedulerFetchCount,
          entities: [],
          bullets: [],
          coin_drops: [],
          messages: []
        },
        observedAtMs: sharedSchedulerNowMs,
        requestClass: detail.requestClass,
        purpose: detail.purpose
      };
    }
  });
  await sharedScheduler.request({
    requestClass: REQUEST_CLASSES.GAMEPLAY_SNAPSHOT,
    purpose: 'offline-poll',
    allowBurst: true
  });
  const sharedSchedulerSafety = await runPreLoginSnapshotSafety(config, {
    loginPointSafety: { point: { x: 0, y: 0, hp: 79, source: 'self-test' } }
  }, {
    now: () => sharedSchedulerNowMs,
    snapshotRequest: sharedScheduler.request
  });
  const sharedSchedulerFreshness = {
    ok: sharedSchedulerFetchCount === 2
      && sharedSchedulerSafety.response?.summary?.tick === 102
      && sharedSchedulerSafety.reused !== true,
    fetchCount: sharedSchedulerFetchCount,
    tick: sharedSchedulerSafety.response?.summary?.tick ?? null,
    reused: Boolean(sharedSchedulerSafety.reused)
  };
  return {
    ok: Boolean(
      highHp.ok
        && highHp.reason === 'login-point-self-hp-exempt'
        && highHp.bypassedPreLoginSafety === true
        && highHp.bypassKind === 'high-self-hp'
        && highHpFetchCount === 0
        && lowHpFetchCount === 1
        && lowHp.bypassedPreLoginSafety !== true
        && recoveryFetchCount === 2
        && recovery.bypassedPreLoginSafety !== true
        && sharedSchedulerFreshness.ok
    ),
    highHp,
    lowHp: {
      reason: lowHp.reason,
      bypassedPreLoginSafety: Boolean(lowHp.bypassedPreLoginSafety),
      fetchCount: lowHpFetchCount
    },
    recovery: {
      reason: recovery.reason,
      bypassedPreLoginSafety: Boolean(recovery.bypassedPreLoginSafety),
      fetchCount: recoveryFetchCount
    },
    sharedSchedulerFreshness
  };
}

async function runRequestRateControllerSelfTest() {
  let nowMs = 0;
  const waits = [];
  const requests = [];
  const httpStarts = [];
  const sensitiveHeaderValue = 'self-test-sensitive-header';
  const sensitiveBodyValue = 'self-test-sensitive-body';
  const controller = createSourceIpController({
    config: { sourceIp: '10.0.0.1' },
    now: () => nowMs,
    sleep: async delayMs => {
      waits.push(delayMs);
      nowMs += delayMs;
    },
    fetchWithTimeout: async (url, options = {}) => {
      requests.push({ url: String(url), atMs: nowMs, options });
      if (String(url) === 'ordinary-failure') throw new Error('synthetic request failure');
      return { ok: true, status: 200 };
    },
    logStore: {
      append: (stream, type, detail) => {
        if (stream === 'runner' && type === 'http-request-start') httpStarts.push(detail);
      }
    },
    requestAuthUrl: async options => {
      await options.fetchWithTimeout('login-auth', {});
      return 'https://connect.linux.do/oauth2/authorize/self-test';
    },
    submitCallbackInput: async (_input, options) => {
      await options.fetchWithTimeout('login-callback', {});
      return { login: { userId: 7, sessionToken: 'self-test' } };
    },
    leaveWithVerification: async options => {
      await options.fetchWithTimeout('exit-leave', {});
      return { ok: true, attempts: [] };
    }
  });

  await Promise.all([
    controller.fetchWithTimeout('gameplay-snapshot-1', {
      requestClass: REQUEST_CLASSES.GAMEPLAY_SNAPSHOT,
      requestPurpose: 'periodic-poll',
      schedulerRequestSequence: 41,
      headers: { authorization: sensitiveHeaderValue },
      body: sensitiveBodyValue
    }),
    controller.fetchWithTimeout('gameplay-snapshot-2', {
      requestClass: REQUEST_CLASSES.GAMEPLAY_SNAPSHOT,
      requestPurpose: 'prelogin-safety',
      schedulerRequestSequence: 42
    })
  ]);
  await controller.fetchWithTimeout('source-ip-probe', {
    requestClass: REQUEST_CLASSES.SOURCE_IP_PROBE
  });
  await controller.requestAuthUrl();
  await controller.submitCallbackInput('self-test-callback');
  await controller.leaveWithVerification();
  await controller.fetchWithTimeout('source-ip-preflight', {
    requestClass: REQUEST_CLASSES.SOURCE_IP_PREFLIGHT
  });
  await controller.fetchWithTimeout('unknown-class', {
    requestClass: 'unknown-class',
    requestPurpose: 'unbounded-purpose-that-must-not-be-logged'
  });
  let failureObserved = false;
  try {
    await controller.fetchWithTimeout('ordinary-failure');
  } catch (error) {
    failureObserved = error?.message === 'synthetic request failure';
  }
  await controller.fetchWithTimeout('ordinary-recovery');

  const snapshotRequests = requests.filter(item => item.url.startsWith('gameplay-snapshot-'));
  const snapshotGapMs = snapshotRequests.length === 2
    ? snapshotRequests[1].atMs - snapshotRequests[0].atMs
    : 0;
  const ordinaryStarts = httpStarts.filter(item => item.exempt !== true);
  const ordinaryGaps = ordinaryStarts.slice(1).map((item, index) => (
    Date.parse(item.startedAt) - Date.parse(ordinaryStarts[index].startedAt)
  ));
  const exemptStarts = httpStarts.filter(item => item.exempt === true);
  const expectedFields = [
    'exempt',
    'policySequence',
    'purpose',
    'requestClass',
    'requestSequence',
    'sourceIpSelectionGeneration',
    'startedAt',
    'waitMs'
  ];
  const allowlistOk = httpStarts.every(item => (
    JSON.stringify(Object.keys(item).sort()) === JSON.stringify(expectedFields)
  ));
  const snapshotStarts = httpStarts.filter(item => item.requestSequence > 0);
  const forwardedDiagnosticsStripped = requests.every(item => (
    !Object.hasOwn(item.options, 'requestClass')
      && !Object.hasOwn(item.options, 'requestPurpose')
      && !Object.hasOwn(item.options, 'schedulerRequestSequence')
      && !Object.hasOwn(item.options, 'challengePolicy')
  ));
  const serializedEvents = JSON.stringify(httpStarts);
  const sensitiveFieldsAbsent = !serializedEvents.includes(sensitiveHeaderValue)
    && !serializedEvents.includes(sensitiveBodyValue)
    && !/(?:url|headers|authorization|cookie|token|body|payload|response)/i.test(
      Object.keys(httpStarts[0] || {}).join('|')
    );
  return {
    ok: Boolean(
      snapshotRequests.length === 2
        && snapshotGapMs >= 30000
        && ordinaryStarts.length === 5
        && ordinaryGaps.every(gapMs => gapMs >= 30000)
        && exemptStarts.length === 5
        && exemptStarts.every(item => Date.parse(item.startedAt) === 30000)
        && JSON.stringify(exemptStarts.map(item => item.requestClass)) === JSON.stringify([
          REQUEST_CLASSES.SOURCE_IP_PROBE,
          REQUEST_CLASSES.LOGIN,
          REQUEST_CLASSES.LOGIN,
          REQUEST_CLASSES.EXIT,
          REQUEST_CLASSES.SOURCE_IP_PREFLIGHT
        ])
        && snapshotStarts.length === 2
        && snapshotStarts[0].requestSequence === 41
        && snapshotStarts[0].purpose === 'periodic-poll'
        && snapshotStarts[1].requestSequence === 42
        && snapshotStarts[1].purpose === 'prelogin-safety'
        && ordinaryStarts[2].requestClass === REQUEST_CLASSES.ORDINARY
        && ordinaryStarts[2].purpose === 'other'
        && failureObserved
        && requests.at(-1)?.url === 'ordinary-recovery'
        && allowlistOk
        && forwardedDiagnosticsStripped
        && sensitiveFieldsAbsent
        && httpStarts.every(item => item.sourceIpSelectionGeneration === 1)
    ),
    snapshotGapMs,
    waits,
    requests: requests.map(item => ({ url: item.url, atMs: item.atMs })),
    ordinaryGaps,
    exemptClasses: exemptStarts.map(item => item.requestClass),
    snapshotStarts,
    failureObserved,
    allowlistOk,
    forwardedDiagnosticsStripped,
    sensitiveFieldsAbsent
  };
}

function hasConfigNumber(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}

function errorMessage(error) {
  return error?.message || String(error || 'unknown error');
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const BATTLE_ACTIVITY_WINDOW_MS = 3000;

function actorMovingAt(actor, atMs) {
  if (!actor || typeof actor !== 'object') return 0;
  if (actor.moving === true) return atMs;
  const vx = numberOrNull(actor.vx);
  const vy = numberOrNull(actor.vy);
  return (vx !== null && Math.abs(vx) > 0) || (vy !== null && Math.abs(vy) > 0) ? atMs : 0;
}

function latestTargetShotAt(combat = {}) {
  const events = combat?.behavior?.metrics?.shotEvents;
  if (!Array.isArray(events) || !events.length) return 0;
  return events.reduce((latest, event) => Math.max(latest, numberOrNull(event?.observedAt) || 0), 0);
}

function battleActivityActor(previous = {}, actor = null, evidence = {}, atMs = Date.now()) {
  return {
    movingAt: actorMovingAt(actor, atMs) || numberOrNull(previous.movingAt) || 0,
    firingAt: Math.max(
      actor?.firing === true ? atMs : 0,
      numberOrNull(evidence.firingAt) || 0,
      numberOrNull(previous.firingAt) || 0
    )
  };
}

function browserlessBattlePresentation(previous, decision = {}) {
  const action = decision.action && typeof decision.action === 'object' ? decision.action : decision;
  const kind = String(action.kind || decision.kind || '');
  const band = String(action.band || decision.band || '');
  const battleLike = kind === 'attack' || kind === 'combat-live' || band === 'combat';
  const targetKey = battleLike ? actionTargetKey({ ...action, kind }) : '';
  const combat = decision.combat || {};
  const self = decision.input?.self || combat.self || null;
  const target = combat.target || action.target || decision.target || null;
  const currentX = numberOrNull(self?.x);
  const currentY = numberOrNull(self?.y);
  if (!targetKey || currentX === null || currentY === null) return null;
  const sameTarget = previous?.targetKey === targetKey;
  const observedAtMs = Date.parse(String(decision.at || '')) || Date.now();
  const startX = sameTarget ? (numberOrNull(previous.startX) ?? currentX) : currentX;
  const startY = sameTarget ? (numberOrNull(previous.startY) ?? currentY) : currentY;
  const startedAt = sameTarget
    ? String(previous.startedAt || combat.startedAt || decision.at || '')
    : String(combat.startedAt || decision.at || '');
  const previousActivity = sameTarget && previous?.activity && typeof previous.activity === 'object'
    ? previous.activity
    : {};
  return {
    targetKey,
    startedAt,
    startX,
    startY,
    movementDistance: Math.round(Math.hypot(currentX - startX, currentY - startY)),
    activity: {
      windowMs: BATTLE_ACTIVITY_WINDOW_MS,
      self: battleActivityActor(previousActivity.self, self, {
        firingAt: combat?.shooting?.actualLastShotAt
      }, observedAtMs),
      target: battleActivityActor(previousActivity.target, target, {
        firingAt: latestTargetShotAt(combat)
      }, observedAtMs)
    }
  };
}

function actionResultHasRecentShot(action = {}) {
  const shoot = action?.shoot;
  if (!shoot?.ok || !shoot.command) return false;
  return !shoot.skipped || shoot.reason === 'shoot-command-throttled';
}

function browserlessBattlePresentationAfterAction(previous, action = {}, context = {}) {
  if (!previous || typeof previous !== 'object' || !actionResultHasRecentShot(action)) return previous || null;
  const target = action.target || action.opportunisticShot || context?.summary?.action?.target || null;
  const targetKey = target ? actionTargetKey({ kind: 'attack', target }) : '';
  if (!targetKey || targetKey !== String(previous.targetKey || '')) return previous;
  const atMs = Number(context.atMs || 0) || Date.now();
  const activity = previous.activity && typeof previous.activity === 'object' ? previous.activity : {};
  return {
    ...previous,
    activity: {
      ...activity,
      windowMs: Math.max(1000, Number(activity.windowMs || BATTLE_ACTIVITY_WINDOW_MS)),
      self: {
        ...(activity.self && typeof activity.self === 'object' ? activity.self : {}),
        firingAt: atMs
      }
    }
  };
}

function loopPlanNowMs(config = {}) {
  const configured = Number(config.nowMs);
  return Number.isFinite(configured) ? configured : Date.now();
}

function nextDailyStaminaResetAt(t = Date.now()) {
  return Math.floor((Number(t) + UTC8_OFFSET_MS) / DAY_MS) * DAY_MS - UTC8_OFFSET_MS + DAY_MS;
}

function browserlessDayKey(t = Date.now()) {
  return new Date(Number(t) + UTC8_OFFSET_MS).toISOString().slice(0, 10);
}

function browserlessDayStartMs(t = Date.now()) {
  return Math.floor((Number(t) + UTC8_OFFSET_MS) / DAY_MS) * DAY_MS - UTC8_OFFSET_MS;
}

function isFirstBrowserlessLoginOfDay(state, nowMs = Date.now()) {
  const stats = state?.stats || {};
  const today = stats.today || {};
  const session = stats.currentSession || {};
  if (session.online) return false;
  const day = browserlessDayKey(nowMs);
  if (String(today.day || '') !== day) return true;
  return Math.max(0, Number(today.sessionCount || 0)) <= 0;
}

function browserlessDailyFirstLoginNotBeforeMs(state, config = {}, nowMs = Date.now()) {
  const nowValue = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  if (!isFirstBrowserlessLoginOfDay(state, nowValue)) return 0;
  const delayAfterMidnightMs = Math.max(0, Number(config.dailyFirstLoginDelayMs ?? 0));
  return browserlessDayStartMs(nowValue) + delayAfterMidnightMs;
}

function browserlessDailyFirstLoginDelayPlan(state, config = {}, nowMs = Date.now()) {
  const nowValue = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  const notBeforeMs = browserlessDailyFirstLoginNotBeforeMs(state, config, nowValue);
  if (!notBeforeMs) return null;
  const delayMs = Math.max(0, notBeforeMs - nowValue);
  if (delayMs <= 0) return null;
  return {
    continue: true,
    reason: 'daily-first-login-delay',
    delayMs,
    previousRunId: '',
    error: 'daily-first-login-delay',
    safetyReason: '',
    explicitDelay: true,
    notBeforeAt: new Date(notBeforeMs).toISOString()
  };
}

function browserlessLoginIntervalDelayPlan(state, config = {}, nowMs = Date.now()) {
  if (state?.stats?.currentSession?.online) return null;
  const nowValue = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  const lastLoginAtMs = parseIsoTimeMs(state?.runner?.lastLoginAt);
  if (!lastLoginAtMs) return null;
  const intervalMs = Math.max(60000, Number(config.loginIntervalMs ?? 60000));
  const notBeforeMs = lastLoginAtMs + intervalMs;
  const delayMs = Math.max(0, notBeforeMs - nowValue);
  if (delayMs <= 0) return null;
  return {
    continue: true,
    reason: 'login-interval',
    delayMs,
    previousRunId: '',
    error: 'login-interval',
    safetyReason: '',
    explicitDelay: true,
    explicitCooldown: true,
    notBeforeAt: new Date(notBeforeMs).toISOString()
  };
}

function preLoginSafetyLeadMs(config = {}) {
  if (config.snapshotEdgeEnabled === true) return 0;
  const required = loginPointSafetyRequiredFromConfig(config);
  const intervalMs = Math.max(0, Number(config.loginPointSafetyProbeIntervalMs || 0));
  return Math.max(0, required - 1) * intervalMs;
}

function sourceIpPreflightAction(status = {}, options = {}) {
  const preflight = normalizeSourceIpPreflight(status, Number(status.riskCount || 0));
  const phase = preflight.phase || 'idle';
  const reason = preflight.reason || 'source-ip-preflight';
  const kind = phase === 'insufficient' ? 'source-ip-preflight-cooldown' : 'source-ip-preflight';
  return {
    kind,
    band: 'safety',
    reason,
    phase,
    queuePhase: preflight.queuePhase || '',
    currentIp: preflight.currentIp || '',
    currentAttempt: preflight.currentAttempt,
    testedCount: preflight.testedCount,
    discoveredCount: preflight.discoveredCount,
    availableCount: preflight.availableCount,
    requiredCount: preflight.requiredCount,
    riskCount: preflight.riskCount,
    lastStatus: preflight.lastStatus,
    lastErrorCategory: preflight.lastErrorCategory || '',
    nextRetryAt: preflight.nextRetryAt || '',
    deferredForNextLoginPoint: Boolean(preflight.deferredForNextLoginPoint),
    deferredAt: preflight.deferredAt || '',
    reused: Boolean(options.reused),
    nextRunAt: options.nextRunAt || ''
  };
}

function sourceIpPreflightCanReuse(state = {}) {
  return reusableSourceIpPreflight(state);
}

function staminaExhaustedThresholdMs(config = {}) {
  return Math.max(0, Number(
    config.staminaExhaustedBelowMs
      ?? config.staminaExhaustedThresholdMs
      ?? BROWSER_RUNTIME_DEFAULTS.staminaExhaustedThresholdMs
      ?? 1000
  ));
}

function staminaBudgetReloginDelayMs(config = {}) {
  return Math.max(1000, Number(
    config.staminaBudgetReloginDelayMs
      ?? BROWSER_RUNTIME_DEFAULTS.staminaBudgetReloginDelayMs
      ?? 1800000
  ));
}

function staminaResetGraceMs(config = {}) {
  return Math.max(0, Number(
    config.staminaResetGraceMs
      ?? BROWSER_RUNTIME_DEFAULTS.staminaResetGraceMs
      ?? 0
  ));
}

function lastLeaveResponseFromCanary(canary) {
  const leaves = [
    canary?.leave,
    canary?.safety?.exit?.leave
  ];
  let fallback = null;
  for (const leave of leaves) {
    const attempts = Array.isArray(leave?.attempts) ? leave.attempts : [];
    for (let i = attempts.length - 1; i >= 0; i -= 1) {
      const response = attempts[i]?.response;
      if (!response || typeof response !== 'object') continue;
      if (!fallback) fallback = response;
      if (attempts[i]?.ok === true || (response.ok === true && response.event === 'left')) return response;
    }
  }
  return fallback;
}

function inferredLongStaminaExhaustionFromCanary(canary, config = {}) {
  const response = lastLeaveResponseFromCanary(canary);
  if (!response) return null;
  const thresholdMs = staminaExhaustedThresholdMs(config);
  const remaining1h = numberOrNull(response.stamina_1h_remaining_milli ?? response.stamina1hRemainingMilli);
  const remaining1d = numberOrNull(response.stamina_1d_remaining_milli ?? response.stamina1dRemainingMilli);
  const nowMs = loopPlanNowMs(config);
  const exhausted = effectiveLongStaminaExhaustedWindows([
    ...(remaining1h !== null && remaining1h < thresholdMs ? ['1h'] : []),
    ...(remaining1d !== null && remaining1d < thresholdMs ? ['1d'] : [])
  ], nowMs);
  if (!exhausted.length) return null;
  const resetAt = exhausted.includes('1d') ? nextDailyStaminaResetAt(nowMs) : 0;
  const fixedDelayMs = exhausted.includes('1h') ? staminaBudgetReloginDelayMs(config) : 0;
  const resetDelayMs = resetAt ? Math.max(0, resetAt + staminaResetGraceMs(config) - nowMs) : 0;
  const reloginDelayMs = Math.max(fixedDelayMs, resetDelayMs, 1000);
  return {
    exhausted,
    thresholdMs,
    remaining1h,
    remaining1d,
    resetAt,
    fixedDelayMs,
    reloginDelayMs
  };
}

function stateLongStaminaExhaustedWindows(state = {}, config = {}) {
  const thresholdMs = staminaExhaustedThresholdMs(config);
  const stamina = {
    ...(state?.stats?.currentSession || {}),
    ...(state?.current?.stamina || {}),
    ...(state?.lastKnown?.stamina || {})
  };
  const remaining1h = numberOrNull(
    stamina.remaining1h
      ?? stamina.stamina1hRemainingMilli
      ?? stamina.stamina_1h_remaining_milli
      ?? state?.stats?.lastStamina1hRemaining
  );
  const remaining1d = numberOrNull(
    stamina.remaining1d
      ?? stamina.stamina1dRemainingMilli
      ?? stamina.stamina_1d_remaining_milli
      ?? state?.stats?.lastStamina1dRemaining
  );
  return [
    ...(remaining1h !== null && remaining1h < thresholdMs ? ['1h'] : []),
    ...(remaining1d !== null && remaining1d < thresholdMs ? ['1d'] : [])
  ];
}

function migrateDailyStaminaDeadlineAt(state, reason, nextRunAtMs, nowMs, config = {}) {
  if (reason !== 'stamina-exhausted-leave' || !nextRunAtMs) return 0;
  const exhausted = stateLongStaminaExhaustedWindows(state, config);
  if (exhausted.length !== 1 || exhausted[0] !== '1d') return 0;
  const deadlineDayStartMs = browserlessDayStartMs(nextRunAtMs);
  if (nextRunAtMs > deadlineDayStartMs + 60 * 60 * 1000) return 0;
  if (dailyStaminaExitExemptAt(nowMs)) return nowMs;
  if (deadlineDayStartMs > nowMs) return deadlineDayStartMs;
  return 0;
}

function dailyStaminaResetNotBeforeAt(staminaExhaustion, nowMs) {
  if (staminaExhaustion?.exhausted?.length !== 1
    || staminaExhaustion.exhausted[0] !== '1d'
    || !Number.isFinite(Number(staminaExhaustion.resetAt))
    || Number(staminaExhaustion.resetAt) <= Number(nowMs)) return '';
  return new Date(Number(staminaExhaustion.resetAt)).toISOString();
}

function createNoThrowLogStore(logStore, onError = () => {}) {
  if (!logStore || typeof logStore !== 'object') return logStore;
  return {
    ...logStore,
    append(stream, type, detail = {}, options = {}) {
      try {
        return logStore.append(stream, type, detail, options);
      } catch (err) {
        onError(err, { operation: 'log-append', stream, type });
        return { error: errorMessage(err) };
      }
    },
    dayDirFor(ms) {
      try {
        return logStore.dayDirFor(ms);
      } catch (err) {
        onError(err, { operation: 'log-day-dir' });
        return '';
      }
    }
  };
}

function buildRunnerErrorCanary(error, config = {}, options = {}) {
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const message = errorMessage(error);
  const startedAt = options.startedAt || now();
  return {
    ok: false,
    runId: String(options.runId || `${config.controlMode || 'runner'}-error-${new Date(startedAt).toISOString().replace(/[-:.]/g, '')}`),
    mode: config.controlMode || 'read-only',
    startedAt: new Date(startedAt).toISOString(),
    completedAt: new Date(now()).toISOString(),
    error: message,
    connectionFailure: error?.connectionFailure || null,
    safety: {
      event: null,
      exit: null,
      leaveFailure: null
    }
  };
}

function hydrateConfigFromState(config, state) {
  const session = sessionFromAnyState(state);
  const loginPoint = loginPointFromAnyState(state);
  return {
    ...config,
    userId: Number(config.userId || 0) || session.userId,
    sessionToken: config.sessionToken || session.sessionToken,
    loginPointX: hasConfigNumber(config.loginPointX) ? Number(config.loginPointX) : loginPoint?.x ?? config.loginPointX,
    loginPointY: hasConfigNumber(config.loginPointY) ? Number(config.loginPointY) : loginPoint?.y ?? config.loginPointY,
    loginPointHp: hasConfigNumber(config.loginPointHp) ? Number(config.loginPointHp) : loginPoint?.hp ?? config.loginPointHp
  };
}

function parseIsoTimeMs(value) {
  const text = String(value || '').trim();
  if (!text) return 0;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function actionSettlementRecoveryMaxMs(config = {}) {
  return Math.min(30000, Math.max(3000, Number(
    config.actionSettlementRecoveryMaxMs ?? 10000
  ) || 10000));
}

function normalizeTransportRecovery(value, nowMs = Date.now(), config = {}) {
  if (!value || typeof value !== 'object') return null;
  if (value.expectedSelfPresent !== true) return null;
  const startedAtMs = parseIsoTimeMs(value.startedAt) || Number(value.startedAtMs || 0);
  if (!Number.isFinite(startedAtMs) || startedAtMs <= 0) return null;
  const deadlineAtMs = parseIsoTimeMs(value.deadlineAt) || Number(value.deadlineAtMs || 0)
    || startedAtMs + actionSettlementRecoveryMaxMs(config);
  const recoveryId = String(value.recoveryId || '');
  const sourceRunId = String(value.sourceRunId || '');
  if (!recoveryId || !sourceRunId) return null;
  const currentMs = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  return {
    recoveryId,
    sourceRunId,
    startedAt: new Date(startedAtMs).toISOString(),
    startedAtMs,
    deadlineAt: new Date(deadlineAtMs).toISOString(),
    deadlineAtMs,
    lastRealtimeTick: Math.max(0, Number(value.lastRealtimeTick || 0) || 0),
    expectedSelfPresent: true,
    probeCount: Math.max(0, Number(value.probeCount || 0) || 0),
    lastProbeAt: String(value.lastProbeAt || ''),
    lastProbeReason: String(value.lastProbeReason || ''),
    escalated: value.escalated === true,
    expired: currentMs >= deadlineAtMs
  };
}

function createTransportRecovery(loopPlan = {}, result = null, existing = null, config = {}, nowMs = Date.now()) {
  const current = normalizeTransportRecovery(existing, nowMs, config);
  const sourceRunId = String(loopPlan.previousRunId || result?.canary?.runId || '');
  if (current && current.sourceRunId === sourceRunId) return current;
  if (!sourceRunId) return null;
  const startedAtMs = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  const deadlineAtMs = startedAtMs + actionSettlementRecoveryMaxMs(config);
  const lastRealtimeTick = latestRealtimeTickFromResult(result);
  return {
    recoveryId: `transport-recovery:${sourceRunId}:${startedAtMs}`,
    sourceRunId,
    startedAt: new Date(startedAtMs).toISOString(),
    startedAtMs,
    deadlineAt: new Date(deadlineAtMs).toISOString(),
    deadlineAtMs,
    lastRealtimeTick,
    expectedSelfPresent: true,
    probeCount: 0,
    lastProbeAt: '',
    lastProbeReason: '',
    escalated: false,
    expired: false
  };
}

function resumeTransportRecoveryAfterCloudflareStop(loopPlan = {}, state = {}, config = {}, nowMs = Date.now()) {
  if (loopPlan.continue || loopPlan.reason !== 'cloudflare-challenge') return loopPlan;
  const transportRecovery = normalizeTransportRecovery(state?.runner?.transportRecovery, nowMs, config);
  if (!transportRecovery) return loopPlan;
  const remainingMs = Math.max(0, transportRecovery.deadlineAtMs - Number(nowMs));
  return {
    continue: true,
    reason: 'action-settlement-stalled',
    delayMs: Math.min(1000, remainingMs),
    previousRunId: transportRecovery.sourceRunId,
    error: 'cloudflare-challenge',
    safetyReason: 'action-settlement-stalled',
    transportRecovery,
    recoveredFromTerminalReason: 'cloudflare-challenge'
  };
}

const STAMINA_GAMEPLAY_DEADLINE_REASONS = new Set([
  'stamina-budget-coin-leave',
  'stamina-exhausted-leave'
]);

function staminaGameplayDeadlineReason(value) {
  const reason = String(value || '');
  return STAMINA_GAMEPLAY_DEADLINE_REASONS.has(reason) ? reason : '';
}

function gameplayDeadlineFromLoopPlan(loopPlan = {}, until = '', sourceRunId = '') {
  const untilMs = parseIsoTimeMs(until);
  if (!untilMs) return null;
  const reason = String(loopPlan.reason || 'persisted-reconnect-wait');
  const staminaReason = staminaGameplayDeadlineReason(reason);
  return {
    type: staminaReason ? 'stamina-reset' : (loopPlan.explicitDelay ? 'explicit-delay' : 'reconnect-wait'),
    reason,
    until: new Date(untilMs).toISOString(),
    explicit: Boolean(loopPlan.explicitDelay || staminaReason),
    snapshotEdgeReplaceable: Boolean(!loopPlan.explicitDelay && !staminaReason),
    sourceRunId: String(sourceRunId || loopPlan.previousRunId || '')
  };
}

function persistedReconnectDelayPlan(state, config = {}, nowMs = Date.now()) {
  const runner = state?.runner || {};
  const action = state?.runner?.currentAction || {};
  const stats = state?.stats || {};
  const lastExit = stats.lastExit || {};
  const gameplayDeadline = runner.gameplayDeadline && typeof runner.gameplayDeadline === 'object'
    ? runner.gameplayDeadline
    : null;
  const nowValue = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  const transportRecovery = normalizeTransportRecovery(runner.transportRecovery, nowValue, config);
  const pendingExit = normalizePendingExit(runner.pendingExit, nowValue, {
    maximumAgeMs: config.pendingExitPersistMaxMs
  });
  if (pendingExit) {
    const delayMs = Math.max(0, Number(pendingExit.nextRetryAtMs || 0) - nowValue);
    return {
      continue: true,
      reason: 'exit-recovery',
      delayMs,
      previousRunId: pendingExit.sourceRunId || action.previousRunId || '',
      error: pendingExit.lastError || pendingExit.reason || 'exit-recovery',
      safetyReason: pendingExit.reason || 'exit-recovery',
      nextRunAt: pendingExit.nextRetryAt,
      persisted: true,
      explicitDelay: false,
      explicitCooldown: false,
      deadlineType: 'pending-exit-retry',
      deadlineSource: 'pending-exit',
      pendingExit,
      gameplayDeadline: null,
      processStop: runner.processStop || null
    };
  }
  if (transportRecovery) {
    const remainingMs = Math.max(0, transportRecovery.deadlineAtMs - nowValue);
    return {
      continue: true,
      reason: 'action-settlement-stalled',
      delayMs: Math.min(1000, remainingMs),
      previousRunId: transportRecovery.sourceRunId,
      error: 'action-settlement-stalled',
      safetyReason: 'action-settlement-stalled',
      nextRunAt: new Date(nowValue + Math.min(1000, remainingMs)).toISOString(),
      persisted: true,
      explicitDelay: false,
      explicitCooldown: false,
      deadlineType: 'transport-recovery',
      deadlineSource: 'transport-recovery',
      gameplayDeadline: null,
      processStop: runner.processStop || null,
      transportRecovery
    };
  }
  const candidates = [
    { until: gameplayDeadline?.until, source: 'gameplay-deadline', reason: gameplayDeadline?.reason, explicit: gameplayDeadline?.explicit },
    { until: action.nextRunAt, source: 'current-action', reason: action.reason, explicit: action.explicitDelay },
    { until: lastExit.nextRunAt, source: 'last-exit', reason: lastExit.reason, explicit: false }
  ];
  let nextRunAtMs = 0;
  let nextRunAt = '';
  let selected = null;
  for (const candidate of candidates) {
    const parsed = parseIsoTimeMs(candidate.until);
    if (parsed > nextRunAtMs) {
      nextRunAtMs = parsed;
      nextRunAt = String(candidate.until || '');
      selected = candidate;
    }
  }
  const actionSafetyReason = String(action.safetyReason || '');
  const deadlineReason = String(gameplayDeadline?.reason || '');
  const lastExitReason = String(lastExit.reason || '');
  const selectedReason = String(selected?.reason || '');
  const staminaReason = [
    deadlineReason,
    actionSafetyReason,
    lastExitReason,
    action.reason,
    selectedReason
  ].map(staminaGameplayDeadlineReason).find(Boolean) || '';
  const originalNextRunAtMs = nextRunAtMs;
  const migratedDailyStaminaDeadlineMs = migrateDailyStaminaDeadlineAt(
    state,
    staminaReason,
    nextRunAtMs,
    nowValue,
    config
  );
  if (migratedDailyStaminaDeadlineMs > 0) {
    nextRunAtMs = migratedDailyStaminaDeadlineMs;
    nextRunAt = new Date(nextRunAtMs).toISOString();
  }
  const dailyFirstLoginNotBeforeMs = browserlessDailyFirstLoginNotBeforeMs(state, config, nextRunAtMs);
  const dailyFirstLoginDeadlineApplied = dailyFirstLoginNotBeforeMs > nextRunAtMs;
  if (dailyFirstLoginDeadlineApplied) {
    nextRunAtMs = dailyFirstLoginNotBeforeMs;
    nextRunAt = new Date(nextRunAtMs).toISOString();
  }
  const remainingMs = Math.max(0, nextRunAtMs - nowValue);
  if (remainingMs <= 0) return null;
  const maxDelayMs = Math.max(
    1000,
    Number(config.maxPersistedReconnectDelayMs || 0) || DAY_MS
  );
  if (remainingMs > maxDelayMs) return null;
  const reason = staminaReason || selectedReason || deadlineReason || actionSafetyReason || lastExitReason
    || String(action.reason || 'persisted-reconnect-wait');
  const explicitCooldown = Boolean(
    staminaReason
      || gameplayDeadline?.type === 'stamina-reset'
      || gameplayDeadline?.explicit
      || action.explicitDelay
      || selected?.explicit
      || dailyFirstLoginDeadlineApplied
  );
  const persistedGameplayDeadline = dailyFirstLoginDeadlineApplied
    ? gameplayDeadlineFromLoopPlan({
        reason: reason || 'daily-first-login-delay',
        explicitDelay: true,
        previousRunId: action.previousRunId || lastExit.runId || ''
      }, nextRunAt, action.previousRunId || lastExit.runId || '')
    : (gameplayDeadline || (staminaReason ? {
        type: 'stamina-reset',
        reason: staminaReason,
        until: nextRunAt,
        explicit: true,
        snapshotEdgeReplaceable: false,
        sourceRunId: String(action.previousRunId || lastExit.runId || '')
      } : null));
  return {
    continue: true,
    reason: reason || 'persisted-reconnect-wait',
    delayMs: remainingMs,
    previousRunId: action.previousRunId || '',
    error: reason || 'persisted-reconnect-wait',
    safetyReason: staminaReason || actionSafetyReason || lastExitReason || reason || '',
    nextRunAt,
    persisted: true,
    explicitDelay: Boolean(gameplayDeadline?.explicit || action.explicitDelay || selected?.explicit || dailyFirstLoginDeadlineApplied),
    explicitCooldown,
    deadlineType: String(persistedGameplayDeadline?.type || (staminaReason ? 'stamina-reset' : 'legacy-reconnect-wait')),
    deadlineSource: dailyFirstLoginDeadlineApplied ? 'daily-first-login' : String(selected?.source || ''),
    dailyFirstLoginDeadlineApplied,
    originalNextRunAt: originalNextRunAtMs > 0 ? new Date(originalNextRunAtMs).toISOString() : '',
    gameplayDeadline: persistedGameplayDeadline,
    processStop: runner.processStop || null,
    transportRecovery
  };
}

function loginPointSafetyRequiredFromConfig(config = {}) {
  if (config.snapshotEdgeEnabled === true) return 1;
  const required = Number(config.loginPointSafetySuccessRequired || 3);
  return Number.isFinite(required) && required > 0 ? Math.max(1, Math.round(required)) : 3;
}

function pendingLoginPointSafetyPatch(config = {}, reason = 'manual-login-point-pending-snapshot-safety', point = null, options = {}) {
  const currentPoint = point && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y))
    ? {
        x: Number(point.x),
        y: Number(point.y),
        hp: hasConfigNumber(point.hp) ? Number(point.hp) : null,
        source: point.source || 'state'
      }
    : null;
  return {
    ok: false,
    reason,
    point: currentPoint,
    checkedAt: '',
    snapshotSafety: null,
    detail: {
      ok: false,
      reason,
      originalReason: '',
      checkedAt: '',
      required: loginPointSafetyRequiredFromConfig(config),
      streak: 0,
      satisfied: false,
      selfPresent: null,
      bypassedPreLoginSafety: false,
      nearestActive: null,
      ...(options.detail && typeof options.detail === 'object' ? options.detail : {})
    }
  };
}

function persistedSingleBlockerHoldForPoint(state = {}, point = null) {
  const previousPoint = state?.loginPointSafety?.point || loginPointFromAnyState(state);
  const hold = state?.loginPointSafety?.detail?.singleBlockerHold;
  if (!hold || typeof hold !== 'object' || !hold.active) return null;
  if (!previousPoint || !point) return null;
  const previousX = Number(previousPoint.x);
  const previousY = Number(previousPoint.y);
  const nextX = Number(point.x);
  const nextY = Number(point.y);
  if (![previousX, previousY, nextX, nextY].every(Number.isFinite)) return null;
  if (previousX !== nextX || previousY !== nextY) return null;
  return { ...hold };
}

function learnedLoginPointFromCanary(canary) {
  const confirmedLeaveSelf = runnerResultConfirmedLeave({ canary })
    ? lastLeaveResponseFromCanary(canary)
    : null;
  const finalSelf = confirmedLeaveSelf
    || canary?.state?.realtime?.self
    || canary?.decisions?.last?.input?.self
    || null;
  const entrySelf = canary?.entry?.firstSelf || null;
  if (!finalSelf || !Number.isFinite(Number(finalSelf.x)) || !Number.isFinite(Number(finalSelf.y))) {
    return { finalSelf: null, loginPoint: null };
  }
  const snapshotSelfPresent = Boolean(canary?.snapshotSafety?.response?.summary?.selfPresent);
  const hasEntrySummary = canary && Object.prototype.hasOwnProperty.call(canary, 'entry');
  let pointSelf = null;
  if (!snapshotSelfPresent) {
    if (entrySelf && Number.isFinite(Number(entrySelf.x)) && Number.isFinite(Number(entrySelf.y))) {
      pointSelf = entrySelf;
    } else if (!hasEntrySummary) {
      pointSelf = finalSelf;
    }
  }
  const pointSource = pointSelf === entrySelf ? 'browserless-entry-self' : 'canary-self';
  return {
    finalSelf,
    loginPoint: pointSelf
      ? {
          x: Number(pointSelf.x),
          y: Number(pointSelf.y),
          hp: Number.isFinite(Number(finalSelf.hp))
            ? Number(finalSelf.hp)
            : (Number.isFinite(Number(pointSelf.hp)) ? Number(pointSelf.hp) : null),
          source: pointSource
        }
      : null
  };
}

function finalLastKnownFromCanary(previous, finalSelf, canary, nowMs = Date.now()) {
  if (!finalSelf || typeof finalSelf !== 'object') return previous || null;
  const remaining5s = numberOrNull(finalSelf.stamina_5s_remaining_milli ?? finalSelf.stamina5sRemainingMilli ?? finalSelf.stamina5s);
  const remaining1h = numberOrNull(finalSelf.stamina_1h_remaining_milli ?? finalSelf.stamina1hRemainingMilli ?? finalSelf.stamina1h);
  const remaining1d = numberOrNull(finalSelf.stamina_1d_remaining_milli ?? finalSelf.stamina1dRemainingMilli ?? finalSelf.stamina1d);
  const priorStamina = previous?.stamina && typeof previous.stamina === 'object' ? previous.stamina : {};
  return {
    ...(previous && typeof previous === 'object' ? previous : {}),
    self: finalSelf,
    stamina: {
      ...priorStamina,
      ...(remaining5s !== null ? { remaining5s, stamina5sRemainingMilli: remaining5s } : {}),
      ...(remaining1h !== null ? { remaining1h, stamina1hRemainingMilli: remaining1h } : {}),
      ...(remaining1d !== null ? { remaining1d, stamina1dRemainingMilli: remaining1d } : {})
    },
    at: canary?.completedAt || new Date(nowMs).toISOString(),
    tick: latestRealtimeTickFromResult({ canary }) || previous?.tick || null
  };
}

function browserlessLoopPlan(result, config = {}) {
  const canary = result?.canary || null;
  const safetyEvent = canary?.safety?.event || null;
  const safetyReason = safetyEvent?.reason || canary?.safety?.leaveFailure?.reason || '';
  const error = String(canary?.error || result?.reason || result?.error || '');
  const runId = canary?.runId || '';
  const snapshotSelfPresent = Boolean(canary?.snapshotSafety?.response?.summary?.selfPresent);
  const inGameRecoveryEvidence = Boolean(
    canary?.recovery?.inGameEvidence
      || snapshotSelfPresent
      || Number(canary?.stats?.selfPresent?.true || 0) > 0
      || canary?.entry?.firstSelf
      || safetyReason === 'direct-leave-failed'
      || canary?.safety?.leaveFailure
  );
  const delayMs = Math.max(1000, Number(config.loopDelayMs || 30000));
  const snapshotEdgeEnabled = config.snapshotEdgeEnabled === true;
  const fastDelayMs = 1000;
  const loopNowMs = parseIsoTimeMs(canary?.completedAt)
    || parseIsoTimeMs(canary?.startedAt)
    || loopPlanNowMs(config);
  const pendingExit = normalizePendingExit(canary?.pendingExit, loopNowMs, {
    maximumAgeMs: config.pendingExitPersistMaxMs
  });
  const stop = reason => ({
    continue: false,
    reason,
    delayMs: 0,
    previousRunId: runId,
    error,
    safetyReason
  });
  const resume = (reason, minimumDelayMs = 0, extra = null) => ({
    continue: true,
    reason,
    delayMs: /^snapshot safety not confirmed:/i.test(error)
      ? Math.max(delayMs, snapshotEdgeEnabled ? 0 : 60000, Number(minimumDelayMs || 0))
      : Math.max(delayMs, Number(minimumDelayMs || 0)),
    previousRunId: runId,
    error,
    safetyReason,
    ...(extra && typeof extra === 'object' ? extra : {})
  });
  const resumeFast = reason => ({
    continue: true,
    reason,
    delayMs: fastDelayMs,
    previousRunId: runId,
    error,
    safetyReason
  });

  const decisionDelayMs = Number(
    safetyEvent?.detail?.decision?.reloginDelayMs
    ?? safetyEvent?.detail?.decision?.staminaBudgetExit?.reloginDelayMs
    ?? 0
  );
  const inferredStaminaExhaustion = inferredLongStaminaExhaustionFromCanary(canary, config);
  const decisionStaminaExhaustion = safetyEvent?.detail?.decision?.staminaExhausted || null;
  const staminaResetNotBeforeAt = dailyStaminaResetNotBeforeAt(
    inferredStaminaExhaustion || decisionStaminaExhaustion,
    loopNowMs
  );
  const fastRecoverableTransportReasons = new Set([
    'action-settlement-stalled',
    'frame-gap',
    'stale-self',
    'ws-closed',
    'ws-error'
  ]);

  if (config.once) return stop('once');
  if (!result) return resume('missing-result');
  if (result.reason === 'missing-manual-session') return resume('missing-manual-session');
  if (safetyReason === 'explicit-stop' || safetyReason === 'restart-drain-ready') return stop(safetyReason);
  if (pendingExit) {
    const nextRetryAtMs = Math.max(0, Number(pendingExit.nextRetryAtMs || 0));
    const retryDelayMs = Math.max(0, nextRetryAtMs - loopNowMs);
    return {
      continue: true,
      reason: 'exit-recovery',
      delayMs: retryDelayMs,
      previousRunId: runId,
      error,
      safetyReason: pendingExit.reason || safetyReason,
      pendingExit,
      nextRunAt: pendingExit.nextRetryAt,
      explicitDelay: false,
      deadlineType: 'pending-exit-retry'
    };
  }
  if (canary?.connectionFailure?.type === 'cloudflare-challenge') {
    return {
      ...stop('cloudflare-challenge'),
      connectionFailure: canary.connectionFailure
    };
  }
  if (safetyReason === 'action-settlement-stalled' && !runnerResultConfirmedLeave(result)) {
    return {
      ...resumeFast(safetyReason),
      transportRecovery: {
        sourceRunId: runId,
        lastRealtimeTick: latestRealtimeTickFromResult(result),
        expectedSelfPresent: true
      }
    };
  }
  if (fastRecoverableTransportReasons.has(safetyReason)) {
    return resumeFast(safetyReason);
  }
  if (/websocket unexpected response 403|http 403|not logged in/i.test(error) && snapshotSelfPresent) {
    return resumeFast('ws-auth-blocked-self-present');
  }
  if (safetyReason === 'direct-leave-failed' || canary?.safety?.leaveFailure) return resumeFast('direct-leave-failed');
  if (inferredStaminaExhaustion && (safetyReason === 'no-self' || error === 'no-self')) {
    return resume('stamina-exhausted-leave', inferredStaminaExhaustion.reloginDelayMs, {
      explicitDelay: true,
      forceExitReason: true,
      staminaExhausted: inferredStaminaExhaustion,
      ...(staminaResetNotBeforeAt ? { notBeforeAt: staminaResetNotBeforeAt } : {})
    });
  }
  if (safetyReason === 'no-self') return resume('no-self');
  if (/websocket unexpected response 403|http 403|missing-manual-session|login-point-bootstrap-failed/i.test(error)) {
    return resume(error || 'auth-or-bootstrap-retry');
  }
  if (result.ok) return resume('cycle-complete');
  if (safetyReason === 'stamina-budget-coin-leave' || safetyReason === 'stamina-exhausted-leave') {
    return resume(
      safetyReason,
      Math.max(
        Number.isFinite(decisionDelayMs) ? decisionDelayMs : 0,
        inferredStaminaExhaustion?.reloginDelayMs || 0
      ),
      {
        explicitDelay: true,
        ...(inferredStaminaExhaustion ? { staminaExhausted: inferredStaminaExhaustion } : {}),
        ...(staminaResetNotBeforeAt ? { notBeforeAt: staminaResetNotBeforeAt } : {})
      }
    );
  }
  if ([
    'combat-action-settlement-stalled',
    'realtime-transport-critical-latency',
    'realtime-transport-degraded',
    'profit-live-snapshot-active-threat',
    'combat-critical-hp-leave',
    'combat-hp-disadvantage-leave',
    'combat-low-hp-disadvantage-leave',
    'combat-low-hp-secondary-leave',
    'combat-miss-close-timeout-leave',
    'combat-no-damage-generation-limit-leave',
    'recovery-low-hp-active-threat-leave',
    'recovery-low-hp-contact-leave',
    'recovery-contact-threat-leave',
    'recovery-contact-no-dodge-budget-leave',
    'dynamic-whitelist-low-hp-contact-leave',
    'dynamic-whitelist-contact-no-dodge-budget-leave',
    'injury-leave',
    'pursuit-leave'
  ].includes(safetyReason)) {
    return resume(safetyReason);
  }
  if (/^websocket connect timeout$/i.test(error)) return resumeFast('ws-connect-timeout');
  if (/^snapshot safety not confirmed:/i.test(error)) {
    if (inGameRecoveryEvidence) return resumeFast('in-game-snapshot-safety-retry');
    const snapshotReason = String(canary?.snapshotSafety?.reason || 'snapshot-safety-retry');
    if (snapshotEdgeEnabled && ['snapshot-edge-timeout', 'snapshot-edge-error-limit'].includes(snapshotReason)) {
      return resume(snapshotReason, Number(config.snapshotEdgeBackoffMs || 60000), { explicitDelay: true });
    }
    return resume('snapshot-safety-retry', 0, snapshotEdgeEnabled ? { snapshotEdgeRetry: true } : null);
  }
  return resume(error || safetyReason || 'unknown-error');
}

function browserlessTerminalStopRequestsRuntimeClose(result, reason = '') {
  if (reason === 'restart-drain-ready') return true;
  const event = result?.event || result?.canary?.safety?.event || null;
  const source = String(event?.detail?.source || '');
  return reason === 'explicit-stop' && /^(?:signal|restart-drain)(?:-|$)/.test(source);
}

function summarizeBrowserlessRunnerResult(result = {}) {
  const canary = result?.canary && typeof result.canary === 'object' ? result.canary : {};
  const safetyEvent = canary?.safety?.event || result?.event || null;
  const leaveAttempts = Array.isArray(canary?.leave?.attempts) ? canary.leave.attempts : [];
  const lastLeave = leaveAttempts.length ? leaveAttempts[leaveAttempts.length - 1] : null;
  const reason = redactSecrets(result.reason
    || safetyEvent?.reason
    || canary?.safety?.leaveFailure?.reason
    || canary?.error
    || result.error
    || '');
  const startedAt = canary.startedAt || result.startedAt || '';
  const completedAt = canary.completedAt || result.completedAt || '';
  const measuredDurationMs = Date.parse(completedAt) - Date.parse(startedAt);
  const maxTask = canary?.hotPath?.maxTask || null;
  return {
    ok: Boolean(result.ok),
    mode: result.mode || canary.mode || '',
    reason,
    runId: canary.runId || result.runId || '',
    startedAt,
    completedAt,
    durationMs: Number(canary.durationMs || result.durationMs || (Number.isFinite(measuredDurationMs) ? Math.max(0, measuredDurationMs) : 0)),
    error: redactSecrets(canary.error || result.error || ''),
    safety: safetyEvent ? {
      reason: safetyEvent.reason || '',
      at: safetyEvent.at || '',
      source: safetyEvent.detail?.source || ''
    } : null,
    leave: lastLeave ? {
      ok: Boolean(lastLeave.ok),
      stage: lastLeave.stage || '',
      status: Number(lastLeave.status || 0),
      durationMs: Number(lastLeave.durationMs || 0)
    } : null,
    frames: {
      count: Number(canary?.stats?.frameCount || 0),
      lastAt: canary?.stats?.lastFrameAt || '',
      lastTick: Number(canary?.stats?.tick?.last || 0)
    },
    hotPath: {
      overBudget: Boolean(canary?.hotPath?.overBudget),
      maxTask: maxTask ? {
        task: maxTask.task || '',
        durationMs: Number(maxTask.durationMs || 0),
        frameType: maxTask.frameType || '',
        tick: maxTask.tick ?? null
      } : null
    }
  };
}

async function closeBrowserlessStatusHandle(statusHandle) {
  if (!statusHandle?.close) return false;
  const pending = statusHandle.close();
  statusHandle.server?.closeAllConnections?.();
  await pending;
  return true;
}

function runnerResultExitDetail(result, fallbackReason = '') {
  const canary = result?.canary && typeof result.canary === 'object' ? result.canary : {};
  const safetyReason = canary?.safety?.event?.reason || canary?.safety?.leaveFailure?.reason || '';
  const reason = safetyReason || result?.reason || canary?.error || result?.error || fallbackReason || '';
  const finalSelf = lastLeaveResponseFromCanary(canary);
  const stamina1dRemainingMilli = numberOrNull(finalSelf?.stamina_1d_remaining_milli ?? finalSelf?.stamina1dRemainingMilli);
  const stamina1dLimitMilli = numberOrNull(finalSelf?.stamina_1d_limit_milli ?? finalSelf?.stamina1dLimitMilli);
  return {
    at: canary?.completedAt || result?.completedAt || '',
    reason,
    runId: String(canary?.runId || result?.runId || ''),
    stamina: stamina1dRemainingMilli !== null || stamina1dLimitMilli !== null
      ? { stamina1dRemainingMilli, stamina1dLimitMilli }
      : null
  };
}

function runnerResultConfirmedLeave(result) {
  const canary = result?.canary && typeof result.canary === 'object' ? result.canary : null;
  if (!canary) return false;
  return Boolean(canary.leave?.ok || canary.safety?.exit?.leave?.ok);
}

function preserveOnlineSessionForLoopWait(result, loopPlan = {}) {
  return Boolean(
    loopPlan?.continue
      && ['action-settlement-stalled', 'exit-recovery'].includes(String(loopPlan.reason || ''))
      && !runnerResultConfirmedLeave(result)
  );
}

function latestRealtimeTickFromResult(result) {
  const canary = result?.canary && typeof result.canary === 'object' ? result.canary : {};
  const candidates = [
    canary?.state?.realtime?.tick,
    canary?.decisions?.last?.input?.realtime?.tick,
    canary?.decisions?.last?.tick
  ].map(Number).filter(value => Number.isFinite(value) && value > 0);
  return candidates.length ? Math.max(...candidates) : 0;
}

function snapshotSelfForUser(payload, userId) {
  const id = Number(userId || 0);
  if (!id) return null;
  const direct = payload?.self;
  if (direct && Number(direct.user_id ?? direct.userId) === id) return direct;
  return (Array.isArray(payload?.entities) ? payload.entities : [])
    .find(entity => Number(entity?.user_id ?? entity?.userId) === id) || null;
}

function confirmedLeaveStateFromResult(result, nowMs = Date.now()) {
  if (!runnerResultConfirmedLeave(result)) return null;
  const confirmedAtMs = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  const ignoreUntilMs = confirmedAtMs + CONFIRMED_LEAVE_SNAPSHOT_IGNORE_MS;
  return {
    confirmedAt: new Date(confirmedAtMs).toISOString(),
    snapshotIgnoreUntil: new Date(ignoreUntilMs).toISOString(),
    lastRealtimeTick: latestRealtimeTickFromResult(result),
    runId: String(result?.canary?.runId || ''),
    ignoreUntilMs,
    quarantineRemainingMs: CONFIRMED_LEAVE_SNAPSHOT_IGNORE_MS
  };
}

function activeConfirmedLeaveState(state, nowMs = Date.now()) {
  const value = state?.runner?.confirmedLeave;
  if (!value || typeof value !== 'object') return null;
  const ignoreUntilMs = Date.parse(String(value.snapshotIgnoreUntil || ''));
  return {
    ...value,
    ignoreUntilMs: Number.isFinite(ignoreUntilMs) ? ignoreUntilMs : 0,
    quarantineRemainingMs: Number.isFinite(ignoreUntilMs)
      ? Math.max(0, ignoreUntilMs - Number(nowMs || Date.now()))
      : 0
  };
}

function snapshotSafetyAllowsImmediateResume(snapshotSafety) {
  const summary = snapshotSafety?.response?.summary || {};
  return Boolean(
    snapshotSafety?.ok
      && snapshotSafety?.reason === 'self-present-reentry'
      && snapshotSafety?.bypassedPreLoginSafety
      && summary.selfPresent === true
      && summary.freshness?.ok !== false
  );
}

function snapshotSafetyConfirmsOffline(snapshotSafety) {
  const summary = snapshotSafety?.response?.summary || {};
  return Boolean(
    summary.selfPresent === false
      && summary.freshness?.ok === true
      && !snapshotSafetyAllowsImmediateResume(snapshotSafety)
  );
}

function snapshotOfflineTransitionPatch(state, snapshotSafety, nowMs = Date.now()) {
  if (!snapshotSafetyConfirmsOffline(snapshotSafety)) return {};
  const safetyReady = Boolean(snapshotSafety?.ok && snapshotSafety?.satisfied !== false);
  const action = state?.runner?.currentAction || {};
  const session = state?.stats?.currentSession || {};
  const lastExit = state?.stats?.lastExit || {};
  const enteredAtMs = Date.parse(String(session.enteredAt || ''));
  const lastExitAtMs = Date.parse(String(lastExit.at || ''));
  const lastExitMatchesSession = Boolean(
    Number.isFinite(lastExitAtMs)
      && (!Number.isFinite(enteredAtMs) || lastExitAtMs >= enteredAtMs)
  );
  const checkedAt = snapshotSafety?.checkedAt || new Date(nowMs).toISOString();
  const patch = {
    runner: {
      currentAction: {
        kind: 'loop-wait',
        band: 'recover',
        reason: safetyReady ? 'login-point-safe-connecting' : 'snapshot-safety-retry',
        delayMs: Math.max(0, Number(action.delayMs || 0)),
        nextRunAt: String(action.nextRunAt || ''),
        previousRunId: String(action.previousRunId || lastExit.runId || '')
      }
    },
    stats: browserlessStatsForOffline(state, {
      at: lastExitMatchesSession ? lastExit.at : checkedAt,
      reason: lastExitMatchesSession
        ? (lastExit.reason || session.exitReason || 'snapshot-confirmed-offline')
        : (session.exitReason || 'snapshot-confirmed-offline'),
      runId: lastExitMatchesSession ? lastExit.runId : '',
      nextRunAt: String(action.nextRunAt || ''),
      delayMs: Math.max(0, Number(action.delayMs || 0))
    }, { nowMs })
  };
  return patch;
}

function snapshotStatusPatchFromSafety(previous = null, snapshotSafety = {}, nowMs = Date.now()) {
  const response = snapshotSafety?.response && typeof snapshotSafety.response === 'object'
    ? snapshotSafety.response
    : null;
  const attempted = snapshotSafety?.attempted === undefined
    ? Boolean(
        response
          || snapshotSafety?.request
          || snapshotSafety?.startedAtMs
          || snapshotSafety?.startedAt
          || snapshotSafety?.error
          || Number.isFinite(Number(snapshotSafety?.status))
      )
    : Boolean(snapshotSafety.attempted);
  const checkedAt = String(snapshotSafety?.checkedAt || new Date(nowMs).toISOString());
  const checkedAtMs = parseIsoTimeMs(checkedAt) || Number(nowMs) || Date.now();
  const numericOrIsoMs = value => {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : parseIsoTimeMs(value);
  };
  const startedAtMs = numericOrIsoMs(snapshotSafety?.startedAtMs || snapshotSafety?.startedAt)
    || numericOrIsoMs(snapshotSafety?.observedAtMs || snapshotSafety?.observedAt)
    || (attempted ? checkedAtMs : 0);
  const httpStatus = Number(response?.status ?? snapshotSafety?.status);
  const normalizedStatus = Number.isFinite(httpStatus) && httpStatus > 0 ? Math.round(httpStatus) : null;
  const fetchOk = response
    ? (response.ok !== undefined
        ? response.ok === true
        : (response.httpOk !== undefined
            ? response.httpOk === true
            : (normalizedStatus === null || (normalizedStatus >= 200 && normalizedStatus < 300))))
    : (attempted && snapshotSafety?.error ? false : null);
  const safetyOk = snapshotSafety?.ok === true && snapshotSafety?.satisfied !== false;
  const lastResult = !attempted
    ? 'not-requested'
    : (fetchOk === false ? 'failure' : (safetyOk ? 'safe' : 'unsafe'));
  const error = fetchOk === false
    ? String(snapshotSafety?.error || `snapshot HTTP ${normalizedStatus || 'error'}`)
    : String(snapshotSafety?.error || '');
  const previousStatus = previous && typeof previous === 'object' ? previous : {};
  return {
    ...previousStatus,
    inFlight: false,
    purpose: String(snapshotSafety?.snapshotPurpose || previousStatus.purpose || ''),
    source: attempted ? 'http' : 'local',
    lastResult,
    lastAttemptAt: attempted ? new Date(startedAtMs).toISOString() : String(previousStatus.lastAttemptAt || ''),
    lastCompletedAt: attempted ? checkedAt : String(previousStatus.lastCompletedAt || ''),
    lastSuccessAt: attempted && fetchOk === true
      ? checkedAt
      : String(previousStatus.lastSuccessAt || ''),
    lastFailureAt: attempted && fetchOk === false
      ? checkedAt
      : String(previousStatus.lastFailureAt || ''),
    lastHttpStatus: normalizedStatus,
    lastReason: String(snapshotSafety?.reason || previousStatus.lastReason || ''),
    lastError: error,
    selfPresent: snapshotSafety?.response?.summary?.selfPresent === undefined
      ? null
      : Boolean(snapshotSafety.response.summary.selfPresent),
    checkedAt,
    attempted,
    bypassedPreLoginSafety: snapshotSafety?.bypassedPreLoginSafety === true
  };
}

function preLoginSnapshotSafetyAction(state = {}) {
  const action = state?.runner?.currentAction || {};
  const safetyReason = String(state?.loginPointSafety?.reason || '');
  const reason = /pending-snapshot-safety/i.test(safetyReason)
    ? safetyReason
    : 'next-login-point-pending-snapshot-safety';
  return {
    kind: 'loop-wait',
    band: 'recover',
    reason,
    delayMs: 0,
    nextRunAt: '',
    previousRunId: String(action.previousRunId || state?.stats?.lastExit?.runId || '')
  };
}

function browserlessRestartDrainStateIsOffline(state = {}) {
  const runner = state?.runner || {};
  if (runner.pendingExit?.active !== false && runner.pendingExit) return false;
  if (runner.transportRecovery) return false;
  if (state?.stats?.currentSession?.online === true) return false;

  const action = runner.currentAction || {};
  const kind = String(action.kind || '');
  const reason = String(action.reason || '');
  if (runner.running === false || kind === 'stopped') return true;

  const preflightPhase = String(state?.network?.sourceIpPreflight?.phase || '');
  if (preflightPhase === 'login-attempt' || preflightPhase === 'active') return false;

  if (kind === 'loop-wait') return true;
  if (kind === 'source-ip-preflight' || kind === 'source-ip-preflight-cooldown') return true;
  return /pending-snapshot-safety|snapshot-safety-retry|source-ip-(?:preflight|snapshot)/i.test(reason);
}

async function runBrowserlessRunner(config, deps = {}) {
  const now = typeof deps.now === 'function' ? deps.now : Date.now;
  const sleep = typeof deps.sleep === 'function'
    ? deps.sleep
    : ms => new Promise(resolve => setTimeout(resolve, ms));
  const supervisorErrors = [];
  const recordSupervisorError = (err, detail = {}) => {
    supervisorErrors.push({
      at: new Date(now()).toISOString(),
      error: errorMessage(err),
      detail
    });
    if (supervisorErrors.length > 20) supervisorErrors.splice(0, supervisorErrors.length - 20);
  };
  const ownsBackgroundIo = !deps.backgroundIo && !deps.disableBackgroundIo;
  const backgroundIo = deps.backgroundIo || (deps.disableBackgroundIo
    ? null
    : createBrowserlessBackgroundIo({
        onError: (err, detail) => recordSupervisorError(err, { operation: 'background-io', ...detail })
      }));
  const ownsStatusRenderIo = !deps.statusRenderIo && !deps.disableBackgroundIo;
  const statusRenderIo = deps.statusRenderIo || (deps.disableBackgroundIo
    ? null
    : createBrowserlessBackgroundIo({
        onError: (err, detail) => recordSupervisorError(err, { operation: 'status-render-io', ...detail })
      }));
  const rawLogStore = deps.logStore || createLocalLogStore({ logDir: config.logDir, now, backgroundIo });
  const logStore = createNoThrowLogStore(rawLogStore, recordSupervisorError);
  const publishBackgroundIo = typeof deps.onBackgroundIoReady === 'function'
    ? deps.onBackgroundIoReady
    : null;
  const publishLiveState = typeof deps.onLiveStateReady === 'function'
    ? deps.onLiveStateReady
    : null;
  const publishLifecycleControl = typeof deps.onLifecycleControlReady === 'function'
    ? deps.onLifecycleControlReady
    : null;
  if (publishBackgroundIo && backgroundIo) {
    try {
      publishBackgroundIo(backgroundIo);
    } catch (err) {
      recordSupervisorError(err, { operation: 'background-io-publish' });
    }
  }
  let snapshotGapPoller = null;
  let statusHandle = null;
  let remoteProfitWorker = null;
  let closeRuntimeHandlesOnReturn = false;
  try {
  let liveState = null;
  let liveStatePersistencePending = false;
  let loginSuccessStatePatchGeneration = 0;
  let lastLoginSuccessStatePatchKey = '';
  const pendingLoginSuccessStatePatches = [];
  const pendingDeferredLoginSuccessStateWrites = [];
  if (publishLiveState) {
    try {
      publishLiveState(() => liveState);
    } catch (err) {
      recordSupervisorError(err, { operation: 'live-state-publish' });
    }
  }
  const patchLiveState = (patch, options = {}) => {
    const updatedAt = options.updatedAt || new Date(now()).toISOString();
    const base = liveState
      || options.baseState
      || readBrowserlessStateFile(config.stateFile || stateFilePath(config));
    liveState = mergeLiveState(base, { ...patch, updatedAt });
    return liveState;
  };
  const safetyController = deps.safetyController || createBrowserlessSafetyController({
    now,
    frameGapAlertMs: config.frameGapAlertMs,
    staleSelfMs: config.staleSelfMs,
    staleSelfConfirmMs: config.staleSelfConfirmMs,
    noSelfGraceMs: config.noSelfGraceMs,
    staminaExhaustedBelowMs: config.staminaExhaustedBelowMs
  });
  const stateFile = config.stateFile || stateFilePath(config);
  const restartDrain = deps.restartDrainCoordinator || createRestartDrainCoordinator({ now });
  const invalidateBackgroundStateCache = () => {
    if (!backgroundIo?.invalidateJsonCache) return true;
    return backgroundIo.invalidateJsonCache(stateFile);
  };
  const updateState = (patch, options = {}) => {
    try {
      const updated = updateBrowserlessStateFile(stateFile, patch, options);
      invalidateBackgroundStateCache();
      return updated;
    } catch (err) {
      recordSupervisorError(err, { operation: 'state-update' });
      logStore.append('runner', 'state-update-error', { error: errorMessage(err) });
      return readBrowserlessStateFile(stateFile);
    }
  };
  const writeState = state => {
    try {
      const written = writeBrowserlessStateFile(stateFile, state);
      invalidateBackgroundStateCache();
      return written;
    } catch (err) {
      recordSupervisorError(err, { operation: 'state-write' });
      logStore.append('runner', 'state-write-error', { error: errorMessage(err) });
      return readBrowserlessStateFile(stateFile);
    }
  };
  let lastRestartDrainLogKey = '';
  const publishRestartDrainStatus = (status, eventType = 'restart-drain-status') => {
    if (!status?.requested) return status;
    const publicStatus = {
      requested: true,
      reason: status.reason || 'restart-drain',
      requestedAt: status.requestedAt || '',
      requestedAtMs: Number(status.requestedAtMs || 0),
      commitmentKey: status.commitmentKey || '',
      waitMs: Number(status.waitMs || 0),
      readySince: Number(status.readySince || 0),
      stableMs: Number(status.stableMs || 0),
      ready: Boolean(status.ready),
      assessment: status.assessment || null
    };
    const key = JSON.stringify({
      eventType,
      ready: publicStatus.ready,
      assessment: publicStatus.assessment?.reason || '',
      commitmentKey: publicStatus.commitmentKey
    });
    const updatedAt = new Date(now()).toISOString();
    const processStop = {
      reason: publicStatus.reason,
      source: 'restart-drain',
      requestedAt: publicStatus.requestedAt || updatedAt
    };
    if (liveState) patchLiveState({ runner: { restartDrain: publicStatus, processStop } }, { updatedAt });
    else updateState({ runner: { restartDrain: publicStatus, processStop } }, { updatedAt });
    if (key !== lastRestartDrainLogKey) {
      lastRestartDrainLogKey = key;
      logStore.append('runner', eventType, publicStatus);
    }
    return publicStatus;
  };
  const lifecycleControl = {
    requestDrain(reason = 'restart-drain', detail = {}) {
      const currentState = liveState || readBrowserlessStateFile(stateFile);
      const action = currentState?.current?.decision?.action || currentState?.runner?.currentAction || {};
      const status = restartDrain.requestDrain(reason, {
        ...detail,
        commitmentKey: detail.commitmentKey || actionTargetKey(action)
      });
      if (browserlessRestartDrainStateIsOffline(currentState)) {
        restartDrain.observe(evaluateRestartReadiness({ online: false }));
        safetyController.requestStop('restart-drain-ready', {
          source: detail.source || 'lifecycle-control',
          offline: true,
          drain: restartDrain.status()
        });
      }
      return publishRestartDrainStatus(restartDrain.status(), 'restart-drain-requested');
    },
    forceStop(reason = 'explicit-stop', detail = {}) {
      const event = safetyController.requestStop(reason, {
        ...detail,
        source: detail.source || 'lifecycle-force-stop'
      });
      logStore.append('exits', 'stop-request', event);
      return { ok: true, event };
    },
    status: () => restartDrain.status()
  };
  if (publishLifecycleControl) {
    try {
      publishLifecycleControl(lifecycleControl);
    } catch (err) {
      recordSupervisorError(err, { operation: 'lifecycle-control-publish' });
    }
  }
  try {
    fs.mkdirSync(config.dataDir, { recursive: true });
  } catch (err) {
    recordSupervisorError(err, { operation: 'data-dir-create', dataDir: config.dataDir });
  }
  const highDropPlayerTracker = deps.highDropPlayerTracker || createHighDropPlayerTracker({
    file: path.join(config.dataDir, 'high-drop-players.json'),
    now,
    backgroundIo
  });
  const snapshotAuditObserver = deps.snapshotAuditObserver || createSnapshotAuditObserver({
    now,
    selfUserId: config.userId
  });
  const combatCompletionTracker = deps.combatCompletionTracker || createCombatCompletionTracker({
    file: path.join(config.dataDir, 'combat-learning.json'),
    now,
    backgroundIo
  });
  const combatBattleLog = deps.combatBattleLog || createCombatBattleLog({
    logDir: config.logDir,
    now,
    backgroundIo,
    onError: (err, detail) => recordSupervisorError(err, { operation: 'combat-battle-log', ...detail })
  });
  const easyKillPlayerTracker = deps.easyKillPlayerTracker || createEasyKillPlayerTracker({
    file: path.join(config.dataDir, 'easy-kill-players.json'),
    now,
    backgroundIo,
    onEvent: event => {
      combatCompletionTracker.observe(event);
      logStore.append('runner', 'easy-kill-player-outcome', event);
    }
  });
  const damagePlayerTracker = deps.damagePlayerTracker || createDailyDamagePlayerTracker({
    file: path.join(config.dataDir, 'daily-damage-players.json'),
    now,
    backgroundIo,
    onEvent: event => logStore.append('runner', 'daily-damage-player', event)
  });
  const mapTrailTracker = deps.mapTrailTracker || createMapTrailTracker({
    now,
    visibleRange: config.mapTrailVisibleRange
      ?? config.globalCoinMaxDistance
      ?? buildBrowserlessRuntimeDefaults(config).globalCoinMaxDistance
  });
  const observeMapTrailRealtime = (state, atMs) => mapTrailTracker.observeRealtime(
    state?.realtime?.entities || [],
    state?.realtime?.self || null,
    atMs,
    state?.realtime?.tick
  );
  const dynamicWhitelist = deps.dynamicWhitelist || createDynamicWhitelist({
    file: path.join(config.dataDir, 'dynamic-whitelist.json'),
    now,
    backgroundIo
  });
  // 动态白名单移除的统一出口: 面板手动移除与聊天击杀记录观察到的死亡共用同一套 easy-kill 提权与日志,
  // 保证两条路径的副作用完全一致。
  const applyDynamicWhitelistRemoval = (target, detail = {}) => {
    const atMs = Number.isFinite(Number(detail.atMs)) ? Number(detail.atMs) : now();
    const source = String(detail.source || 'dynamic-whitelist-remove');
    const observedDeath = detail.observedDeath === true;
    const result = observedDeath
      ? dynamicWhitelist.removeObservedDeath(target, { ...detail, atMs, source })
      : dynamicWhitelist.remove(target, atMs);
    if (result.ok === false) {
      return { ok: false, removed: false, reason: result.reason || 'remove-failed', player: null, easyKill: null };
    }
    if (result.removed !== true) {
      return { ok: true, removed: false, reason: result.reason || 'not-removed', player: result.player || null, easyKill: null };
    }
    const userId = Number(result.player?.userId ?? target?.userId ?? target?.user_id);
    const name = String(result.player?.name || target?.name || '');
    let easyKill = null;
    try {
      easyKill = easyKillPlayerTracker.upsertManualPlayer(
        { userId, name },
        { atMs, score: EASY_KILL_MAX_SCORE, source }
      );
    } catch (err) {
      recordSupervisorError(err, { operation: 'dynamic-whitelist-remove-easy-kill-upsert', source });
      easyKill = { ok: false, reason: errorMessage(err) };
    }
    logStore.append('runner', 'dynamic-whitelist-removed', {
      userId,
      name,
      source,
      removed: true,
      observedDeath,
      killerUserId: observedDeath ? (result.killerUserId ?? null) : null,
      selfKill: observedDeath ? Boolean(result.selfKill) : false,
      evidenceKey: observedDeath ? String(result.evidenceKey || '') : '',
      easyKillScore: easyKill?.ok ? easyKill.score : null,
      easyKillReason: easyKill?.ok ? '' : (easyKill?.reason || '')
    });
    compactStatusCacheText = '';
    return { ok: true, removed: true, reason: result.reason || source, player: result.player, easyKill };
  };
  // 聊天击杀记录里出现动态白名单成员被击杀(包括体力豁免后由我自己击杀的)时, 立即移出白名单。
  const observeDynamicWhitelistKillEvents = (killEvents, detail = {}) => {
    const events = Array.isArray(killEvents) ? killEvents : [];
    if (!events.length) return { observed: 0, removed: 0, removals: [] };
    const atMs = Number.isFinite(Number(detail.observedAtMs)) ? Number(detail.observedAtMs) : now();
    const source = `${detail.source || 'snapshot'}-kill-record`;
    const removals = [];
    let observed = 0;
    for (const event of events) {
      const victimUserId = Number(event?.victimUserId);
      if (!Number.isFinite(victimUserId)) continue;
      if (!dynamicWhitelist.isMember?.({ userId: victimUserId })) continue;
      observed += 1;
      const applied = applyDynamicWhitelistRemoval({ userId: victimUserId, name: event.victimName }, {
        atMs,
        observedAtMs: Number.isFinite(Number(event.occurredAtMs)) ? Number(event.occurredAtMs) : atMs,
        observedDeath: true,
        source,
        killerUserId: event.killerUserId,
        selfKill: event.mine === true,
        tick: event.tick,
        evidenceKey: event.key
      });
      if (!applied.removed) {
        logStore.append('runner', 'dynamic-whitelist-observed-death-skipped', {
          userId: victimUserId,
          name: String(event.victimName || ''),
          source,
          reason: applied.reason,
          killerUserId: event.killerUserId ?? null,
          selfKill: event.mine === true,
          evidenceKey: String(event.key || '')
        });
        continue;
      }
      removals.push({
        userId: victimUserId,
        name: applied.player?.name || String(event.victimName || ''),
        killerUserId: event.killerUserId ?? null,
        selfKill: event.mine === true,
        evidenceKey: String(event.key || ''),
        easyKillScore: applied.easyKill?.ok ? applied.easyKill.score : null
      });
    }
    return { observed, removed: removals.length, removals };
  };
  const easyKillPlayerStatus = () => {
    easyKillPlayerTracker.expirePendingOutcomes?.(now());
    return easyKillPlayerTracker.status();
  };
  const chatSeedPlayers = [
    ...(highDropPlayerTracker.status?.(now())?.players || []),
    ...(easyKillPlayerTracker.status?.(now())?.players || []),
    ...(damagePlayerTracker.status?.(now())?.players || []),
    ...(dynamicWhitelist.status?.().players || [])
  ];
  const chatService = deps.chatService || createChatService({
    now,
    getSelfUserId: () => config.userId,
    nameCacheFile: path.join(config.dataDir, 'chat-player-names.json'),
    historyFile: path.join(config.dataDir, 'chat-history.sqlite3'),
    backgroundIo,
    seedPlayers: chatSeedPlayers,
    onPollingDemandChange: () => snapshotGapPoller?.refreshSchedule?.()
  });
  let remoteProfitStaticWhitelistIds = [];
  const remoteProfitScoringOptions = {
    ...buildBrowserlessRuntimeDefaults(config),
    controlMode: config.controlMode,
    combatEnabled: config.combatEnabled === true
  };
  remoteProfitWorker = deps.remoteProfitWorker || createRemoteProfitWorker({
    now,
    enabled: config.browserlessRemoteProfitTargetsEnabled !== false,
    onEvent: (type, detail = {}) => {
      const eventType = String(type || 'event');
      if (!['published', 'discarded', 'timeout', 'worker-error'].includes(eventType)) return;
      logStore.append('runner', `remote-profit-${eventType}`, {
        generation: Number(detail.generation || 0),
        reason: String(detail.reason || ''),
        candidateCount: Number(detail.candidateCount || 0),
        error: String(detail.error || '').slice(0, 240),
        computeMs: Number(detail.computeMs || 0),
        roundTripMs: Number(detail.roundTripMs || 0)
      });
    }
  });
  const remoteProfitContext = atMs => remoteProfitWorker?.context?.(atMs) || null;
  const remoteProfitRealtimeSelf = () => remoteProfitRealtimeSelfFromLiveState(liveState, config.userId);
  let onlineSnapshotSession = null;
  let activeRunKillConfirmations = [];
  const recordSnapshotAudit = (payload, detail = {}) => {
    let audit;
    try {
      audit = snapshotAuditObserver.observe(payload, {
        ...detail,
        selfUserId: config.userId
      });
      const summaryEntry = logStore.append('snapshot-audit', 'snapshot-summary', {
        ...audit.summary,
        auditQueueStatus: 'queued',
        auditQueueError: ''
      }, {
        atMs: Number(detail.receivedAtMs ?? detail.observedAtMs ?? now())
      });
      if (summaryEntry?.error) {
        logStore.append('runner', 'snapshot-audit-write-error', {
          source: detail.source || 'snapshot',
          snapshotPurpose: detail.snapshotPurpose || '',
          stage: 'summary-queue',
          error: String(summaryEntry.error)
        });
        audit.summary = {
          ...audit.summary,
          auditQueueStatus: 'queue-failed',
          auditQueueError: String(summaryEntry.error)
        };
      }
      for (const observation of audit.observations || []) {
        const observationEntry = logStore.append('snapshot-audit', 'player-observation', observation, {
          atMs: Number(detail.receivedAtMs ?? detail.observedAtMs ?? now())
        });
        if (observationEntry?.error) {
          logStore.append('runner', 'snapshot-audit-write-error', {
            source: detail.source || 'snapshot',
            snapshotPurpose: detail.snapshotPurpose || '',
            stage: 'observation-queue',
            identityKey: observation.identityKey || '',
            error: String(observationEntry.error)
          });
        }
      }
      return audit;
    } catch (err) {
      recordSupervisorError(err, { operation: 'snapshot-audit-observe', source: detail.source || 'snapshot' });
      logStore.append('runner', 'snapshot-audit-write-error', {
        source: detail.source || 'snapshot',
        snapshotPurpose: detail.snapshotPurpose || '',
        error: errorMessage(err)
      });
      return { ok: false, error: errorMessage(err), summary: null, observations: [] };
    }
  };
  const observeSnapshotPayload = (payload, detail = {}) => {
    const observedAtMs = Number(detail.observedAtMs ?? now());
    const snapshotSource = String(detail.source || 'snapshot');
    if (detail.auditRecorded !== true) recordSnapshotAudit(payload, {
      ...detail,
      observedAtMs,
      receivedAtMs: detail.receivedAtMs ?? observedAtMs,
      snapshotKind: detail.snapshotKind || (snapshotSource === 'ws' ? 'ws' : 'http'),
      snapshotPurpose: detail.snapshotPurpose
        || (snapshotSource === 'ws' ? 'gameplay' : (snapshotSource === 'prelogin-http' ? 'login-point-safety' : 'gameplay'))
    });
    snapshotGapPoller?.noteSnapshot(observedAtMs, {
      global: detail.global === true || snapshotSource !== 'ws',
      scheduleAtMs: detail.scheduleAtMs
    });
    let chatResult = null;
    let dynamicWhitelistDeathResult = null;
    let dynamicWhitelistNameResult = null;
    let easyKillNameResult = null;
    let easyKillEvidenceResult = null;
    let damageNameResult = null;
    const sessionOnline = onlineSnapshotSession?.active === true
      || liveState?.stats?.currentSession?.online === true;
    const remoteSelf = remoteProfitRealtimeSelf() || onlineSnapshotSession?.self || null;
    if (isRemoteProfitSnapshotEligible(snapshotSource, detail, sessionOnline, remoteSelf)) {
      const dynamicStatus = dynamicWhitelist.status?.() || {};
      const easyStatus = easyKillPlayerTracker.status?.(observedAtMs) || {};
      const dynamicIds = [
        ...(dynamicStatus.memberUserIds || []),
        ...(dynamicStatus.userIds || []),
        ...(dynamicStatus.players || []).map(item => item?.userId ?? item?.user_id)
      ];
      const whitelistUserIds = [
        ...remoteProfitStaticWhitelistIds,
        ...dynamicIds
      ];
      const easyKillPlayers = Array.isArray(easyStatus.players) ? easyStatus.players.slice(0, 128) : [];
      const combatCompletionByUserId = {};
      for (const player of easyKillPlayers) {
        const userId = player?.userId ?? player?.user_id;
        if (userId === null || userId === undefined || userId === '') continue;
        try {
          combatCompletionByUserId[String(userId)] = combatCompletionTracker.probability(userId, observedAtMs);
        } catch (_) {}
      }
      remoteProfitWorker?.publish?.({
        source: snapshotSource,
        tick: payload?.tick ?? null,
        observedAtMs,
        online: true,
        self: remoteSelf,
        selfUserId: config.userId,
        entities: Array.isArray(payload?.entities) ? payload.entities : [],
        easyKillPlayers,
        combatCompletionByUserId,
        whitelistUserIds,
        scoringOptions: remoteProfitScoringOptions,
        config: {
          ...remoteProfitScoringOptions,
          minDrop: DEFAULT_RECORD_THRESHOLD,
          whitelistUserIds
        }
      }).catch?.(() => {});
    }
    try {
      chatResult = chatService.observeSnapshot?.(payload, {
        ...detail,
        observedAtMs
      }) || null;
    } catch (err) {
      recordSupervisorError(err, { operation: 'chat-snapshot-observe', source: detail.source || 'snapshot' });
      logStore.append('runner', 'chat-snapshot-observation-error', {
        source: detail.source || 'snapshot',
        error: errorMessage(err)
      });
    }
    try {
      dynamicWhitelistDeathResult = observeDynamicWhitelistKillEvents(chatResult?.killEvents, {
        source: detail.source || 'snapshot',
        observedAtMs
      });
    } catch (err) {
      recordSupervisorError(err, { operation: 'dynamic-whitelist-observed-death', source: detail.source || 'snapshot' });
      logStore.append('runner', 'dynamic-whitelist-observed-death-error', {
        source: detail.source || 'snapshot',
        error: errorMessage(err)
      });
    }
    try {
      dynamicWhitelistNameResult = dynamicWhitelist.observePlayerNames?.(payload?.entities || [], {
        atMs: observedAtMs,
        source: detail.source || 'snapshot',
        tick: payload?.tick
      }) || null;
    } catch (err) {
      recordSupervisorError(err, { operation: 'dynamic-whitelist-player-name-observe', source: detail.source || 'snapshot' });
      logStore.append('runner', 'dynamic-whitelist-player-name-observation-error', {
        source: detail.source || 'snapshot',
        error: errorMessage(err)
      });
    }
    try {
      easyKillNameResult = easyKillPlayerTracker.observePlayerNames?.(payload?.entities || [], {
        atMs: observedAtMs,
        source: detail.source || 'snapshot',
        tick: payload?.tick
      }) || null;
    } catch (err) {
      recordSupervisorError(err, { operation: 'easy-kill-player-name-observe', source: detail.source || 'snapshot' });
      logStore.append('runner', 'easy-kill-player-name-observation-error', {
        source: detail.source || 'snapshot',
        error: errorMessage(err)
      });
    }
    try {
      combatCompletionTracker.observePlayerNames?.(payload?.entities || [], {
        atMs: observedAtMs,
        source: detail.source || 'snapshot',
        tick: payload?.tick
      });
    } catch (err) {
      recordSupervisorError(err, { operation: 'combat-learning-player-name-observe', source: detail.source || 'snapshot' });
      logStore.append('runner', 'combat-learning-player-name-observation-error', {
        source: detail.source || 'snapshot',
        error: errorMessage(err)
      });
    }
    try {
      const evidence = snapshotSelfKillEvidence(payload, config.userId);
      const snapshotSelf = snapshotSelfForUser(payload, config.userId);
      const latestSelf = snapshotSelf
        || liveState?.current?.self
        || liveState?.lastKnown?.self
        || null;
      easyKillEvidenceResult = easyKillPlayerTracker.observeKillEvidence?.(evidence, {
        atMs: observedAtMs,
        source: detail.source || 'snapshot',
        tick: payload?.tick,
        selfHp: latestSelf?.hp,
        selfMaxHp: latestSelf?.max_hp ?? latestSelf?.maxHp
      }) || null;
      const confirmed = (easyKillEvidenceResult?.confirmed || []).map(item => ({
        ...item,
        source: detail.source || 'snapshot'
      }));
      if (confirmed.length) {
        activeRunKillConfirmations = [...activeRunKillConfirmations, ...confirmed].slice(-100);
        if (liveState) {
          patchLiveState({
            stats: browserlessStatsForKillEvidence(liveState, confirmed, { nowMs: observedAtMs })
          }, { updatedAt: new Date(observedAtMs).toISOString() });
        }
      }
    } catch (err) {
      recordSupervisorError(err, { operation: 'easy-kill-snapshot-kill-observe', source: detail.source || 'snapshot' });
      logStore.append('runner', 'easy-kill-snapshot-kill-observation-error', {
        source: detail.source || 'snapshot',
        error: errorMessage(err)
      });
    }
    try {
      damageNameResult = damagePlayerTracker.observePlayerNames?.(payload?.entities || [], {
        atMs: observedAtMs,
        source: detail.source || 'snapshot',
        tick: payload?.tick
      }) || null;
    } catch (err) {
      recordSupervisorError(err, { operation: 'daily-damage-player-name-observe', source: detail.source || 'snapshot' });
      logStore.append('runner', 'daily-damage-player-name-observation-error', {
        source: detail.source || 'snapshot',
        error: errorMessage(err)
      });
    }
    try {
      const result = highDropPlayerTracker.observeSnapshot(payload, {
        ...detail,
        observedAtMs,
        selfUserId: config.userId
      });
      if (result.updated > 0) {
        logStore.append('runner', 'high-drop-player-observation', {
          source: detail.source || 'snapshot',
          observed: result.observed,
          updated: result.updated,
          playerCount: result.playerCount
        });
      }
      return {
        ...result,
        chatMessagesObserved: Number(chatResult?.observed || 0),
        chatMessagesUpdated: Number(chatResult?.updated || 0),
        chatSendConfirmed: Boolean(chatResult?.confirmed),
        chatKillsObserved: Number(chatResult?.killsObserved || 0),
        dynamicWhitelistDeathsObserved: Number(dynamicWhitelistDeathResult?.observed || 0),
        dynamicWhitelistDeathsRemoved: Number(dynamicWhitelistDeathResult?.removed || 0),
        dynamicWhitelistNamesUpdated: Number(dynamicWhitelistNameResult?.updated || 0),
        easyKillNamesUpdated: Number(easyKillNameResult?.updated || 0),
        easyKillKillsConfirmed: Number(easyKillEvidenceResult?.confirmed?.length || 0),
        damageNamesUpdated: Number(damageNameResult?.updated || 0)
      };
    } catch (err) {
      recordSupervisorError(err, { operation: 'high-drop-player-observe', source: detail.source || 'snapshot' });
      logStore.append('runner', 'high-drop-player-observation-error', {
        source: detail.source || 'snapshot',
        error: errorMessage(err)
      });
      return {
        ok: false,
        error: errorMessage(err),
        chatMessagesObserved: Number(chatResult?.observed || 0),
        chatMessagesUpdated: Number(chatResult?.updated || 0),
        chatSendConfirmed: Boolean(chatResult?.confirmed),
        chatKillsObserved: Number(chatResult?.killsObserved || 0),
        dynamicWhitelistDeathsObserved: Number(dynamicWhitelistDeathResult?.observed || 0),
        dynamicWhitelistDeathsRemoved: Number(dynamicWhitelistDeathResult?.removed || 0),
        dynamicWhitelistNamesUpdated: Number(dynamicWhitelistNameResult?.updated || 0)
      };
    }
  };
  let retention = null;
  try {
    retention = cleanupOldLogDays(config.logDir, {
      nowMs: now(),
      keepDays: config.logRetentionDays
    });
  } catch (err) {
    recordSupervisorError(err, { operation: 'log-retention' });
    retention = { ok: false, error: errorMessage(err) };
  }
  let persisted = readBrowserlessStateFile(stateFile);
  const envSessionTokenProvided = Boolean(config.sessionToken);
  const envLoginPointProvided = hasConfigNumber(config.loginPointX) && hasConfigNumber(config.loginPointY);
  const persistedLoginPoint = loginPointFromAnyState(persisted);
  config = hydrateConfigFromState(config, persisted);
  let loginPointProvided = hasConfigNumber(config.loginPointX) && hasConfigNumber(config.loginPointY);
  const startupLoginPoint = loginPointProvided
    ? {
        x: Number(config.loginPointX),
        y: Number(config.loginPointY),
        hp: hasConfigNumber(config.loginPointHp) ? Number(config.loginPointHp) : null,
        source: envLoginPointProvided ? 'cli' : (persistedLoginPoint?.source || 'state')
      }
    : null;
  const startupSingleBlockerHold = persistedSingleBlockerHoldForPoint(persisted, startupLoginPoint);
  persisted = writeState({
    ...persisted,
    updatedAt: new Date(now()).toISOString(),
    session: {
      ...persisted.session,
      userId: config.userId || persisted.session.userId,
      sessionToken: config.sessionToken || persisted.session.sessionToken,
      tokenUpdatedAt: envSessionTokenProvided ? new Date(now()).toISOString() : persisted.session.tokenUpdatedAt
    },
    runner: {
      ...persisted.runner,
      running: true,
      mode: config.dryRun ? 'dry-run' : config.controlMode,
      readOnly: config.readOnly,
      controlMode: config.controlMode,
      canaryProfile: config.canaryProfile || '',
      dryRun: config.dryRun,
      combatEnabled: Boolean(config.combatEnabled),
      lastError: ''
    },
    loginPointSafety: loginPointProvided
      ? pendingLoginPointSafetyPatch(config, 'manual-login-point-pending-snapshot-safety', startupLoginPoint, {
          detail: startupSingleBlockerHold ? { singleBlockerHold: startupSingleBlockerHold } : {}
        })
      : persisted.loginPointSafety,
    logs: {
      ...persisted.logs,
      dataDir: config.dataDir,
      logDir: config.logDir,
      stateFile,
      currentDayDir: logStore.dayDirFor(now())
    }
  });

  const sourceIpController = deps.sourceIpController || createSourceIpController({
    config,
    preflightEnabled: true,
    stateFile,
    state: persisted,
    logStore,
    now,
    sleep,
    fetchWithTimeout: deps.fetchWithTimeout,
    openBrowserlessWs: deps.openBrowserlessWs,
    requestAuthUrl: deps.requestAuthUrl,
    submitCallbackInput: deps.submitCallbackInput,
    leaveWithVerification: deps.leaveWithVerification,
    onStatePersisted: invalidateBackgroundStateCache,
    requestRateStateFile: config.requestRateStateFile || path.join(config.dataDir, 'request-rate-state.json')
  });
  config.sourceIp = sourceIpController.currentSourceIp();
  config.sourceIps = sourceIpController.sourceIps();
  persisted = readBrowserlessStateFile(stateFile);

  const highDropStatusAtStart = highDropPlayerTracker.status(now());
  const lastHighDropSnapshotAtMs = Date.parse(highDropStatusAtStart.lastSnapshotAt || '');
  const lastHighDropGlobalSnapshotAtMs = Date.parse(highDropStatusAtStart.lastGlobalSnapshotAt || '');
  const snapshotRequestScheduler = deps.snapshotRequestScheduler || createSnapshotRequestScheduler({
    now,
    sleep,
    minimumIntervalMs: DEFAULT_SNAPSHOT_REQUEST_INTERVAL_MS,
    fetchSnapshot: async detail => {
      const url = buildSnapshotProbeUrl({
        gameOrigin: config.gameOrigin,
        snapshotPath: config.snapshotPath || '/snapshot',
        userId: config.userId,
        sessionToken: config.sessionToken,
        nowMs: now()
      });
      const requestClass = detail.requestClass || REQUEST_CLASSES.GAMEPLAY_SNAPSHOT;
      const response = await sourceIpController.fetchWithTimeout(url, {
        timeoutMs: config.httpTimeoutMs || config.wsConnectTimeoutMs || 10000,
        method: 'GET',
        requestClass,
        requestPurpose: detail.purpose,
        schedulerRequestSequence: detail.requestSequence,
        challengePolicy: requestClass === REQUEST_CLASSES.LOGIN ? 'login-stop' : undefined,
        cache: 'no-store'
      });
      const body = await readResponseBody(response);
      return {
        ok: Boolean(response.ok),
        status: response.status,
        statusText: response.statusText || '',
        response,
        body,
        payload: body.json,
        observedAtMs: now(),
        url
      };
    },
    onRequest: detail => {
      const startedAt = new Date(Number(detail.startedAtMs || now())).toISOString();
      const currentState = liveState || readBrowserlessStateFile(stateFile);
      patchLiveState({
        runner: {
          snapshotStatus: {
            ...(currentState?.runner?.snapshotStatus || {}),
            inFlight: true,
            lastAttemptAt: startedAt,
            purpose: String(detail.purpose || ''),
            source: 'http'
          }
        }
      });
      logStore.append('runner', 'snapshot-request-start', {
        requestSequence: Number(detail.requestSequence || 0),
        requestClass: detail.requestClass || '',
        purpose: detail.purpose || '',
        startedAt: new Date(Number(detail.startedAtMs || now())).toISOString(),
        waitMs: Number(detail.waitMs || 0),
        allowBurst: detail.allowBurst === true
      });
    },
    onResult: result => {
      const currentState = liveState || readBrowserlessStateFile(stateFile);
      const completedAt = new Date(now()).toISOString();
      const failed = result?.ok === false;
      const status = Number(result?.status);
      patchLiveState({
        runner: {
          snapshotStatus: {
            ...(currentState?.runner?.snapshotStatus || {}),
            inFlight: false,
            lastCompletedAt: completedAt,
            lastResult: failed ? 'failure' : 'fetch-success',
            lastSuccessAt: failed
              ? String(currentState?.runner?.snapshotStatus?.lastSuccessAt || '')
              : completedAt,
            lastFailureAt: failed ? completedAt : String(currentState?.runner?.snapshotStatus?.lastFailureAt || ''),
            lastHttpStatus: Number.isFinite(status) && status > 0 ? Math.round(status) : null,
            lastReason: failed ? String(result?.error || `snapshot HTTP ${status || 'error'}`) : '',
            lastError: failed ? String(result?.error || '') : '',
            purpose: String(result?.purpose || currentState?.runner?.snapshotStatus?.purpose || ''),
            source: 'http',
            attempted: true,
            checkedAt: completedAt
          }
        }
      });
      if (result?.ok !== false) return;
      logStore.append('runner', 'snapshot-request-error', {
        requestSequence: Number(result.requestSequence || 0),
        requestClass: result.requestClass || '',
        purpose: result.purpose || '',
        status: result.status ?? null,
        error: result.error || ''
      });
    }
  });
  const snapshotIntervalForMode = () => (
    onlineSnapshotSession?.active === true
      ? DEFAULT_SNAPSHOT_GAP_MS
      : (chatService.desiredSnapshotIntervalMs?.(now()) || DEFAULT_CHAT_IDLE_INTERVAL_MS)
  );
  snapshotGapPoller = deps.snapshotGapPoller || createSnapshotGapPoller({
    now,
    intervalMs: DEFAULT_CHAT_IDLE_INTERVAL_MS,
    minimumIntervalMs: DEFAULT_CHAT_ACTIVE_INTERVAL_MS,
    globalIntervalMs: DEFAULT_CHAT_IDLE_INTERVAL_MS,
    getIntervalMs: snapshotIntervalForMode,
    getGlobalIntervalMs: snapshotIntervalForMode,
    lastSnapshotAtMs: Number.isFinite(lastHighDropSnapshotAtMs) ? lastHighDropSnapshotAtMs : 0,
    lastGlobalSnapshotAtMs: Number.isFinite(lastHighDropGlobalSnapshotAtMs) ? lastHighDropGlobalSnapshotAtMs : 0,
    isReady: () => Boolean(config.userId && config.sessionToken),
    fetchSnapshot: async ({ allowBurst = false } = {}) => {
      const fetched = await snapshotRequestScheduler.request({
        requestClass: REQUEST_CLASSES.GAMEPLAY_SNAPSHOT,
        purpose: 'periodic-poll',
        allowBurst: allowBurst === true
      });
      if (!fetched.ok) throw new Error(`snapshot HTTP ${fetched.status}`);
      if (!fetched.payload || typeof fetched.payload !== 'object') {
        throw new Error('snapshot returned no JSON payload');
      }
      return fetched.payload;
    },
    onSnapshot: (payload, detail = {}) => {
      logStore.append('runner', 'gameplay-snapshot-poll', {
        observedAt: new Date(Number(detail.observedAtMs || now())).toISOString(),
        tick: payload?.tick ?? null,
        entityCount: Array.isArray(payload?.entities) ? payload.entities.length : 0,
        intervalMs: snapshotIntervalForMode()
      });
      return observeSnapshotPayload(payload, {
        ...detail,
        snapshotKind: 'http',
        snapshotPurpose: 'gameplay'
      });
    },
    onError: err => {
      recordSupervisorError(err, { operation: 'shared-gap-snapshot' });
      logStore.append('runner', 'shared-gap-snapshot-error', { error: errorMessage(err) });
    }
  });

  const refreshFromPersistedState = () => {
    persisted = readBrowserlessStateFile(stateFile);
    config = hydrateConfigFromState(config, persisted);
    try {
      sourceIpController.refreshFromState(persisted);
      config.sourceIp = sourceIpController.currentSourceIp();
      config.sourceIps = sourceIpController.sourceIps();
    } catch (err) {
      recordSupervisorError(err, { operation: 'source-ip-refresh' });
      logStore.append('runner', 'source-ip-refresh-error', { error: errorMessage(err) });
    }
  };

  const publishSourceIpNetwork = patch => {
    const preflightPatch = patch?.sourceIpPreflight;
    const runnerPatch = preflightPatch
      ? { currentAction: sourceIpPreflightAction(preflightPatch) }
      : {};
    const statePatch = {
      network: patch,
      ...(Object.keys(runnerPatch).length ? { runner: runnerPatch } : {})
    };
    const updatedAt = new Date(now()).toISOString();
    if (liveState) {
      // The realtime frame callback already owns a complete in-memory state
      // snapshot.  Updating state.json synchronously here can block the
      // WebSocket callback for more than the main-thread CPU budget.  Keep
      // the small lifecycle patch visible to external readers by queueing it
      // on the background IO worker; the self-test fallback remains
      // synchronous when that worker is intentionally disabled.
      const updated = patchLiveState(statePatch, { updatedAt });
      if (backgroundIo?.writeJsonPatchAtomic) {
        if (backgroundIo.writeJsonPatchAtomic(stateFile, {
          ...statePatch,
          updatedAt
        })) {
          liveStatePersistencePending = true;
        } else {
          updateState(statePatch, { updatedAt });
        }
      } else {
        updateState(statePatch, { updatedAt });
      }
      return updated;
    }
    const updated = updateState(statePatch, { updatedAt });
    persisted = updated;
    return updated;
  };

  const commitSourceIpLifecycle = (ips, patch = {}) => {
    if (typeof sourceIpController.prepareLifecycleSourceIps === 'function') {
      sourceIpController.prepareLifecycleSourceIps(ips, {
        ...patch,
        lifecyclePreparedAt: patch.sourceIpPreflight?.completedAt || new Date(now()).toISOString()
      });
      persisted = readBrowserlessStateFile(stateFile);
      config.sourceIp = sourceIpController.currentSourceIp();
      config.sourceIps = sourceIpController.sourceIps();
      if (liveState) {
        patchLiveState({ network: persisted.network }, { updatedAt: new Date(now()).toISOString() });
      }
      return persisted;
    }
    return publishSourceIpNetwork({
      ...patch,
      sourceIp: ips[0] || '',
      sourceIps: ips,
      lifecycleSourceIps: ips,
      lifecycleSourceIpIndex: 0,
      lifecyclePreparedAt: patch.sourceIpPreflight?.completedAt || new Date(now()).toISOString()
    });
  };

  const clearSourceIpLifecycle = (patch = {}) => {
    if (typeof sourceIpController.clearLifecycleSourceIps === 'function') {
      sourceIpController.clearLifecycleSourceIps({
        ...patch,
        reason: patch.reason || patch.sourceIpPreflight?.reason || 'source-ip-lifecycle-cleared'
      });
      persisted = readBrowserlessStateFile(stateFile);
      config.sourceIp = sourceIpController.currentSourceIp();
      config.sourceIps = sourceIpController.sourceIps();
      if (liveState) {
        patchLiveState({ network: persisted.network }, { updatedAt: new Date(now()).toISOString() });
      }
      return persisted;
    }
    return publishSourceIpNetwork({
      ...patch,
      sourceIps: [],
      lifecycleSourceIps: [],
      lifecycleSourceIpIndex: 0,
      lifecyclePreparedAt: ''
    });
  };

  const runLoginSourceIpPreflight = async () => {
    const stateBefore = readBrowserlessStateFile(stateFile);
    if (deps.sourceIpProbe && typeof deps.sourceIpProbe.selectSourceIps === 'function') {
      const reusable = reusableSourceIpPreflight(stateBefore);
      if (reusable) {
        const reusedAt = new Date(now()).toISOString();
        const sourceIpPreflight = normalizeSourceIpPreflight({
          ...reusable.sourceIpPreflight,
          phase: 'ready',
          reason: 'source-ip-probe-reused-without-retest',
          deferredForNextLoginPoint: false,
          reuseWithoutRetest: false,
          reusedAt
        }, reusable.sourceIpPreflight.riskCount);
        publishSourceIpNetwork({ sourceIpPreflight });
        logStore.append('runner', 'source-ip-probe-reused', {
          sourceIps: reusable.lifecycleSourceIps.slice(),
          originalCompletedAt: reusable.sourceIpPreflight.completedAt || '',
          reusedAt
        });
        return {
          ok: true,
          reused: true,
          availableIps: reusable.lifecycleSourceIps.slice(),
          sourceIpPreflight
        };
      }
      const discoveredIps = typeof deps.discoverSourceIps === 'function'
        ? deps.discoverSourceIps()
        : discoverInterfaceIpv4(config.sourceIpInterface || DEFAULT_SOURCE_IP_INTERFACE, deps.networkInterfaces);
      const result = deps.sourceIpProbe.selectSourceIps(discoveredIps, {
        nowMs: now(),
        requiredCount: SOURCE_IP_PREFLIGHT_REQUIRED_COUNT
      });
      logStore.append('runner', 'source-ip-probe-selection', {
        availableIps: result.availableIps || [],
        ok: Boolean(result.ok),
        reason: result.reason || '',
        diagnostics: result.diagnostics || null
      });
      if (result.ok) {
        await commitSourceIpLifecycle(result.availableIps, {
          sourceIpPreflight: result.sourceIpPreflight
        });
      } else {
        await clearSourceIpLifecycle({
          sourceIpPreflight: result.sourceIpPreflight,
          reason: result.reason || 'source-ip-probe-insufficient'
        });
      }
      return result;
    }
    const result = await ensureSourceIpPreflight({
      gameOrigin: config.gameOrigin,
      interfaceName: DEFAULT_SOURCE_IP_INTERFACE,
      state: stateBefore,
      readState: () => readBrowserlessStateFile(stateFile),
      now,
      monotonicNow: typeof deps.monotonicNow === 'function' ? deps.monotonicNow : () => performance.now(),
      networkInterfaces: deps.networkInterfaces,
      discoverIps: deps.discoverSourceIps,
      request: deps.sourceIpPreflightRequest || ((origin, ip, requestOptions) => requestAnonymousGameRoot(origin, ip, requestOptions)),
      requestTimeoutMs: 10000,
      sleep: async delayMs => restartDrain.wait(delayMs, sleep),
      shouldInterrupt: () => safetyController.getStopEvent()?.reason || (
        restartDrain.status?.().requested ? 'restart-drain' : ''
      ),
      persistNetwork: async patch => publishSourceIpNetwork(patch),
      commitLifecycle: async (ips, patch) => commitSourceIpLifecycle(ips, patch),
      clearLifecycle: async patch => clearSourceIpLifecycle(patch),
      log: (type, detail) => logStore.append('runner', type, detail)
    });
    if (result?.ok) {
      refreshFromPersistedState();
      const status = result.sourceIpPreflight || {};
      updateState({ runner: { currentAction: sourceIpPreflightAction(status, { reused: result.reused }) } }, {
        updatedAt: new Date(now()).toISOString()
      });
    }
    return result;
  };

  const markSourceIpLoginAttempt = () => {
    const current = liveState || persisted;
    const preflight = normalizeSourceIpPreflight(
      current.network?.sourceIpPreflight,
      Object.keys(current.network?.sourceIpRisk || {}).length
    );
    if (!current.network?.lifecycleSourceIps?.length) return;
    publishSourceIpNetwork({
      sourceIpPreflight: {
        ...preflight,
        phase: 'login-attempt',
        reason: 'source-ip-login-websocket-attempt',
        deferredForNextLoginPoint: false,
        reuseWithoutRetest: false,
        nextRetryAt: ''
      }
    });
    logStore.append('runner', 'source-ip-login-attempt', {
      sourceIp: current.network.sourceIp || '',
      lifecycleSourceIps: current.network.lifecycleSourceIps.slice(0, 3)
    });
  };

  const markSourceIpSnapshotWait = reason => {
    const current = readBrowserlessStateFile(stateFile);
    const lifecycleSourceIps = Array.isArray(current.network?.lifecycleSourceIps)
      ? current.network.lifecycleSourceIps.slice(0, 3)
      : [];
    if (lifecycleSourceIps.length !== SOURCE_IP_PREFLIGHT_REQUIRED_COUNT) return;
    const preflight = normalizeSourceIpPreflight(
      current.network?.sourceIpPreflight,
      Object.keys(current.network?.sourceIpRisk || {}).length
    );
    publishSourceIpNetwork({
      sourceIpPreflight: {
        ...preflight,
        phase: 'snapshot-wait',
        reason: String(reason || 'source-ip-snapshot-safety-wait').slice(0, 120),
        deferredForNextLoginPoint: false,
        reuseWithoutRetest: true,
        nextRetryAt: ''
      }
    });
  };

  const markSourceIpLoginSuccess = canary => {
    const runId = String(canary?.runId || canary?.entry?.runId || '');
    const loginAt = canary?.firstSelfAt
      || canary?.entry?.firstSelfAt
      || new Date(now()).toISOString();
    const patchKey = `${runId}\u0000${loginAt}`;
    if (patchKey === lastLoginSuccessStatePatchKey) return false;
    lastLoginSuccessStatePatchKey = patchKey;
    const current = liveState || readBrowserlessStateFile(stateFile) || persisted;
    const loginRecoveryAssociation = consumeLoginRecoveryAssociation(
      current.runner?.pendingLoginRecovery
    );
    const preflight = normalizeSourceIpPreflight(
      current.network?.sourceIpPreflight,
      Object.keys(current.network?.sourceIpRisk || {}).length
    );
    const lifecycleSourceIps = Array.isArray(current.network?.lifecycleSourceIps)
      ? current.network.lifecycleSourceIps.slice(0, SOURCE_IP_PREFLIGHT_REQUIRED_COUNT)
      : [];
    const activateLifecycle = lifecycleSourceIps.length === SOURCE_IP_PREFLIGHT_REQUIRED_COUNT
      && !(preflight.phase === 'active' && preflight.reason === 'source-ip-lifecycle-active');
    const sourceIpPreflight = activateLifecycle
      ? {
        ...preflight,
        phase: 'active',
        reason: 'source-ip-lifecycle-active',
        deferredForNextLoginPoint: false,
        reuseWithoutRetest: false,
        reusedAt: '',
        nextRetryAt: ''
      }
      : null;
    const loginPatch = {
      runner: {
        lastLoginAt: loginAt,
        recoveredFromExitAttemptId: loginRecoveryAssociation.recoveredFromExitAttemptId,
        pendingLoginRecovery: loginRecoveryAssociation.pendingLoginRecovery,
        ...(sourceIpPreflight ? { currentAction: sourceIpPreflightAction(sourceIpPreflight) } : {})
      },
      ...(sourceIpPreflight ? { network: { sourceIpPreflight } } : {})
    };
    const generation = ++loginSuccessStatePatchGeneration;
    const queuedAtMs = now();
    const patchBytes = Buffer.byteLength(JSON.stringify(loginPatch));
    patchLiveState(loginPatch, { updatedAt: loginAt, baseState: current });
    const patchRecord = {
      generation,
      queuedAtMs,
      loginAt,
      patchBytes,
      recoveredFromExitAttemptId: loginRecoveryAssociation.recoveredFromExitAttemptId,
      persistence: '',
      persisted: false,
      backgroundOperationErrorCount: 0
    };
    let backgroundQueued = false;
    if (backgroundIo?.writeJsonPatchAtomic) {
      patchRecord.backgroundOperationErrorCount = Number(
        backgroundIo.status?.().operationErrorCount || 0
      );
      backgroundQueued = backgroundIo.writeJsonPatchAtomic(stateFile, {
        ...loginPatch,
        updatedAt: loginAt
      });
      if (backgroundQueued) {
        patchRecord.persistence = 'background-worker';
        liveStatePersistencePending = true;
      }
    }
    if (!backgroundQueued) {
      patchRecord.persistence = 'deferred-main-thread';
      const deferredWrite = new Promise(resolve => {
        setImmediate(() => {
          try {
            updateBrowserlessStateFile(stateFile, loginPatch, { updatedAt: loginAt });
            invalidateBackgroundStateCache();
            patchRecord.persisted = true;
            resolve({ ok: true, generation });
          } catch (error) {
            resolve({ ok: false, generation, error });
          }
        });
      });
      pendingDeferredLoginSuccessStateWrites.push(deferredWrite);
    }
    pendingLoginSuccessStatePatches.push(patchRecord);
    logStore.append('runner', 'source-ip-login-success', {
      runId,
      loginAt,
      recoveredFromExitAttemptId: loginRecoveryAssociation.recoveredFromExitAttemptId,
      sourceIp: current.network.sourceIp || '',
      lifecycleSourceIps,
      statePatch: {
        generation,
        patchBytes,
        backgroundQueued,
        lifecycleMerged: Boolean(sourceIpPreflight),
        recoveredFromExitAttemptId: loginRecoveryAssociation.recoveredFromExitAttemptId,
        queueDelayMs: Math.max(0, now() - queuedAtMs)
      }
    });
    return activateLifecycle;
  };

  const beginGameplaySnapshotSession = (entry = {}, carriedSnapshot = null) => {
    const firstSelf = entry.firstSelf || entry.entry?.firstSelf || null;
    const x = Number(firstSelf?.x);
    const y = Number(firstSelf?.y);
    const self = Number.isFinite(x) && Number.isFinite(y)
      ? {
          authority: 'realtime',
          userId: Number(firstSelf?.userId ?? firstSelf?.user_id ?? config.userId) || config.userId,
          x,
          y,
          hp: Number.isFinite(Number(firstSelf?.hp)) ? Number(firstSelf.hp) : null
        }
      : null;
    onlineSnapshotSession = {
      active: true,
      runId: String(entry.runId || ''),
      startedAtMs: now(),
      self
    };
    remoteProfitWorker?.reset?.('gameplay-session-start');
    const carriedAtMs = Number(carriedSnapshot?.observedAtMs || 0);
    const carryEligible = Boolean(
      carriedSnapshot?.payload
      && typeof carriedSnapshot.payload === 'object'
      && Number.isFinite(carriedAtMs)
      && carriedAtMs > 0
    );
    if (carryEligible) {
      observeSnapshotPayload(carriedSnapshot.payload, {
        source: 'prelogin-http',
        observedAtMs: carriedAtMs,
        global: true,
        carriedIntoSession: true
      });
    }
    snapshotGapPoller?.start?.({
      reset: true,
      snapshotAtMs: carryEligible ? carriedAtMs : 0,
      globalSnapshotAtMs: carryEligible ? carriedAtMs : 0,
      immediate: !carryEligible,
      allowBurst: !carryEligible
    });
    logStore.append('runner', 'gameplay-snapshot-session-start', {
      runId: String(entry.runId || ''),
      intervalMs: DEFAULT_SNAPSHOT_GAP_MS,
      initialMode: carryEligible ? 'prelogin-snapshot-handoff' : 'post-login-immediate-fetch',
      carriedSnapshotAt: carryEligible ? new Date(carriedAtMs).toISOString() : ''
    });
  };

  const endGameplaySnapshotSession = reason => {
    if (!onlineSnapshotSession?.active) return false;
    const runId = onlineSnapshotSession.runId || '';
    onlineSnapshotSession = null;
    snapshotGapPoller?.refreshSchedule?.();
    remoteProfitWorker?.reset?.('gameplay-session-end');
    logStore.append('runner', 'gameplay-snapshot-session-stop', {
      runId,
      reason: String(reason || 'canary-finish')
    });
    return true;
  };

  const markSourceIpLoginFailure = (reason, canary = null) => {
    const current = readBrowserlessStateFile(stateFile);
    const preflight = normalizeSourceIpPreflight(
      current.network?.sourceIpPreflight,
      Object.keys(current.network?.sourceIpRisk || {}).length
    );
    clearSourceIpLifecycle({
      sourceIpPreflight: {
        ...preflight,
        phase: 'login-failed',
        reason: String(reason || 'source-ip-login-failed').slice(0, 120),
        completedAt: new Date(now()).toISOString(),
        deferredForNextLoginPoint: false,
        reuseWithoutRetest: false,
        nextRetryAt: ''
      },
      reason: reason || 'source-ip-login-failed'
    });
    logStore.append('runner', 'source-ip-login-failed', {
      reason: reason || 'source-ip-login-failed',
      runId: canary?.runId || ''
    });
  };

  let preparedSnapshotSafety = null;
  let preparedSnapshotPayload = null;
  const snapshotCarryRecord = (payload, detail = {}) => {
    if (String(detail.source || '') !== 'prelogin-http' || !payload || typeof payload !== 'object') return null;
    const observedAtMs = Number(detail.observedAtMs || now());
    if (!Number.isFinite(observedAtMs) || observedAtMs <= 0) return null;
    return { payload, observedAtMs };
  };
  const observePreparedSnapshotPayload = (payload, detail = {}) => {
    const result = observeSnapshotPayload(payload, detail);
    const carried = snapshotCarryRecord(payload, detail);
    if (carried) preparedSnapshotPayload = carried;
    return result;
  };
  const waitForLoopPlan = async (loopPlan, resultForStop = null) => {
    loopPlan = resumeTransportRecoveryAfterCloudflareStop(
      loopPlan,
      readBrowserlessStateFile(stateFile),
      config,
      now()
    );
    if (!loopPlan.continue) {
      if (!config.once) {
        const currentBeforeStop = readBrowserlessStateFile(stateFile);
        const stopDetail = runnerResultExitDetail(resultForStop, loopPlan.reason);
        updateState({
          runner: {
            running: false,
            currentAction: {
              kind: 'stopped',
              band: 'recover',
              reason: loopPlan.reason,
              previousRunId: loopPlan.previousRunId || ''
            }
          },
          stats: browserlessStatsForOffline(currentBeforeStop, {
            ...stopDetail,
            reason: stopDetail.reason || loopPlan.reason,
            nextRunAt: '',
            delayMs: 0
          }, { nowMs: now() })
        }, { updatedAt: new Date(now()).toISOString() });
        logStore.append('runner', 'runner-loop-stop', loopPlan);
      }
      if (resultForStop && loopPlan.reason === 'once') {
        // A one-shot run is a terminal runner invocation.  Mark runtime
        // handles for cleanup before returning so a snapshot poll started by
        // the final canary cannot leave a real timer/request behind.
        closeRuntimeHandlesOnReturn = true;
        return resultForStop;
      }
      const stopped = {
        ...(resultForStop || {
          ok: false,
          mode: config.controlMode || 'read-only'
        }),
        reason: loopPlan.reason || resultForStop?.reason || 'runner-loop-stop'
      };
      closeRuntimeHandlesOnReturn = closeRuntimeHandlesOnReturn
        || browserlessTerminalStopRequestsRuntimeClose(stopped, stopped.reason);
      return stopped;
    }

    const currentBeforeWait = readBrowserlessStateFile(stateFile);
    const newConfirmedLeave = confirmedLeaveStateFromResult(resultForStop, now());
    const confirmedLeave = newConfirmedLeave || activeConfirmedLeaveState(currentBeforeWait, now());
    const preserveOnlineSession = preserveOnlineSessionForLoopWait(resultForStop, loopPlan)
      && !confirmedLeave;
    const waitExitDetail = runnerResultExitDetail(resultForStop, loopPlan.reason);
    const waitReason = loopPlan.forceExitReason
      ? loopPlan.reason
      : (waitExitDetail.reason || loopPlan.reason);
    const resetLoginPointForNextEntry = Boolean(
      runnerResultConfirmedLeave(resultForStop)
        && loopPlan.reason !== 'snapshot-safety-retry'
        && loopPlan.reason !== 'in-game-snapshot-safety-retry'
    );
    const schedulingNowMs = now();
    const pendingExit = normalizePendingExit(
      loopPlan.pendingExit || currentBeforeWait?.runner?.pendingExit,
      schedulingNowMs,
      { maximumAgeMs: config.pendingExitPersistMaxMs }
    );
    const existingTransportRecovery = normalizeTransportRecovery(
      currentBeforeWait?.runner?.transportRecovery,
      schedulingNowMs,
      config
    );
    const transportRecovery = !pendingExit && !confirmedLeave
      ? (loopPlan.transportRecovery
          ? createTransportRecovery(loopPlan, resultForStop, existingTransportRecovery, config, schedulingNowMs)
          : existingTransportRecovery)
      : null;
    const transportRecoveryStarted = Boolean(
      transportRecovery
        && (!existingTransportRecovery || existingTransportRecovery.recoveryId !== transportRecovery.recoveryId)
    );
    const pendingExitDeadlineMs = pendingExit
      ? Math.max(schedulingNowMs, Number(pendingExit.nextRetryAtMs || schedulingNowMs))
      : 0;
    const explicitNotBeforeMs = parseIsoTimeMs(loopPlan.notBeforeAt);
    const initialPlannedNextRunAtMs = pendingExit
      ? pendingExitDeadlineMs
      : (explicitNotBeforeMs > schedulingNowMs
          ? explicitNotBeforeMs
          : schedulingNowMs + loopPlan.delayMs);
    const dailyFirstLoginNotBeforeMs = pendingExit ? 0 : browserlessDailyFirstLoginNotBeforeMs(
      currentBeforeWait,
      config,
      initialPlannedNextRunAtMs
    );
    const dailyFirstLoginDeadlineApplied = dailyFirstLoginNotBeforeMs > initialPlannedNextRunAtMs;
    const plannedNextRunAtMs = dailyFirstLoginDeadlineApplied
      ? dailyFirstLoginNotBeforeMs
      : initialPlannedNextRunAtMs;
    const scheduledLoopPlan = dailyFirstLoginDeadlineApplied
      ? {
          ...loopPlan,
          explicitDelay: true,
          notBeforeAt: new Date(dailyFirstLoginNotBeforeMs).toISOString(),
          dailyFirstLoginDeadlineApplied: true,
          originalDelayMs: loopPlan.delayMs
        }
      : loopPlan;
    // Fresh login-point snapshot checks are deliberately deferred until the
    // next real login gate, after anonymous source-IP preflight completes.
    // The injected legacy switch exists only for focused historical wait
    // self-tests; production never enables it.
    const firstDailyLoginAtNextRun = !pendingExit
      && isFirstBrowserlessLoginOfDay(currentBeforeWait, plannedNextRunAtMs);
    const shouldPrepareSnapshotSafety = deps.allowLegacyPreLoginWaitPreparation === true
      ? Boolean(
          !pendingExit && !firstDailyLoginAtNextRun && (
            confirmedLeave
            || resetLoginPointForNextEntry
            || loopPlan.reason === 'snapshot-safety-retry'
          )
        )
      : false;
    const plannedDelayMs = Math.max(0, plannedNextRunAtMs - schedulingNowMs);
    const effectiveDelayMs = pendingExit
      ? Math.max(0, pendingExitDeadlineMs - schedulingNowMs)
      : (shouldPrepareSnapshotSafety
          ? (config.snapshotEdgeEnabled === true && !scheduledLoopPlan.explicitDelay
              ? 0
              : Math.max(
                  plannedDelayMs,
                  preLoginSafetyLeadMs(config) + Number(confirmedLeave?.quarantineRemainingMs || 0)
                ))
          : plannedDelayMs);
    const nextRunAtMs = effectiveDelayMs === plannedDelayMs
      ? plannedNextRunAtMs
      : schedulingNowMs + effectiveDelayMs;
    const nextRunAt = new Date(nextRunAtMs).toISOString();
    const waitDetail = {
      ...scheduledLoopPlan,
      delayMs: effectiveDelayMs,
      nextRunAt,
      exitAttemptId: pendingExit?.exitAttemptId || '',
      supervisorErrors: supervisorErrors.slice(-5)
    };
    const exitRecoveryWait = loopPlan.reason === 'exit-recovery';
    const currentActionReason = resetLoginPointForNextEntry
      ? 'next-login-point-pending-snapshot-safety'
      : loopPlan.reason;
    updateState({
      runner: {
        running: true,
        mode: exitRecoveryWait ? 'exit-recovery' : (config.controlMode || 'read-only'),
        lastError: '',
        currentAction: {
          kind: exitRecoveryWait ? 'exit-recovery' : 'loop-wait',
          band: exitRecoveryWait ? 'exit' : 'recover',
          reason: currentActionReason,
          delayMs: effectiveDelayMs,
          nextRunAt,
          deadlineType: String(
            scheduledLoopPlan.deadlineType
              || (exitRecoveryWait ? 'exit-recovery-retry' : '')
          ),
          explicitCooldown: Boolean(scheduledLoopPlan.explicitCooldown),
          explicitDelay: Boolean(scheduledLoopPlan.explicitDelay),
          dailyFirstLoginDeadlineApplied,
          previousRunId: loopPlan.previousRunId || '',
          ...(exitRecoveryWait ? {
            pendingExit: pendingExit || null,
            exitAttemptId: pendingExit?.exitAttemptId || ''
          } : {})
        },
        gameplayDeadline: pendingExit
          ? null
          : gameplayDeadlineFromLoopPlan(scheduledLoopPlan, nextRunAt, loopPlan.previousRunId),
        transportRecovery,
        confirmedLeave: confirmedLeave
          ? {
              confirmedAt: confirmedLeave.confirmedAt || '',
              snapshotIgnoreUntil: confirmedLeave.snapshotIgnoreUntil || '',
              lastRealtimeTick: Number(confirmedLeave.lastRealtimeTick || 0),
              runId: confirmedLeave.runId || loopPlan.previousRunId || ''
            }
          : null
      },
      ...(resetLoginPointForNextEntry ? {
        loginPointSafety: pendingLoginPointSafetyPatch(
          config,
          'next-login-point-pending-snapshot-safety',
          loginPointFromAnyState(currentBeforeWait)
        )
      } : {}),
      stats: preserveOnlineSession
        ? currentBeforeWait.stats
        : browserlessStatsForOffline(currentBeforeWait, {
            ...waitExitDetail,
            reason: waitReason,
            nextRunAt,
            delayMs: effectiveDelayMs
          }, { nowMs: now() })
    }, { updatedAt: new Date(now()).toISOString() });
    logStore.append('runner', 'runner-loop-wait', waitDetail);
    if (transportRecovery) {
      if (transportRecoveryStarted) {
        logStore.append('runner', 'transport-recovery-start', {
          recoveryId: transportRecovery.recoveryId,
          sourceRunId: transportRecovery.sourceRunId,
          startedAt: transportRecovery.startedAt,
          deadlineAt: transportRecovery.deadlineAt,
          lastRealtimeTick: transportRecovery.lastRealtimeTick,
          expectedSelfPresent: true
        });
      }
      if (transportRecovery.expired) {
        const escalated = { ...transportRecovery, escalated: true, expired: true };
        updateState({
          runner: {
            transportRecovery: escalated,
            currentAction: {
              kind: 'exit-recovery',
              band: 'exit',
              reason: 'transport-recovery-deadline-leave',
              previousRunId: transportRecovery.sourceRunId,
              recoveryId: transportRecovery.recoveryId
            }
          }
        }, { updatedAt: new Date(now()).toISOString() });
        logStore.append('runner', 'transport-recovery-deadline-reached', {
          recoveryId: transportRecovery.recoveryId,
          sourceRunId: transportRecovery.sourceRunId,
          reason: 'deadline-expired',
          elapsedMs: Math.max(0, schedulingNowMs - transportRecovery.startedAtMs),
          deadlineAt: transportRecovery.deadlineAt,
          exitAttemptId: ''
        });
        return null;
      }
      let probe;
      try {
        preparedSnapshotPayload = null;
        probe = await (deps.runPreLoginSnapshotSafety || runPreLoginSnapshotSafety)({
          ...config,
          snapshotEdgeEnabled: false,
          loginPointSafetySuccessRequired: 1,
          loginPointSafetyProbeIntervalMs: 0
        }, currentBeforeWait, {
          now,
          sleep,
          fetchWithTimeout: sourceIpController.fetchWithTimeout,
          snapshotRequest: snapshotRequestScheduler.request,
          onSnapshotPayload: observePreparedSnapshotPayload,
          onSnapshotAuditPayload: recordSnapshotAudit,
          snapshotPurpose: 'exit-recovery-confirmation',
          easyKillPlayerTracker,
          damagePlayerTracker,
          dynamicWhitelist
        });
      } catch (err) {
        probe = { ok: false, reason: 'snapshot-error', error: errorMessage(err) };
      }
      const probeSummary = probe?.response?.summary || {};
      const selfPresent = snapshotSafetyAllowsImmediateResume(probe);
      const selfAbsent = snapshotSafetyConfirmsOffline(probe);
      const updatedRecovery = {
        ...transportRecovery,
        probeCount: transportRecovery.probeCount + 1,
        lastProbeAt: probe?.checkedAt || new Date(now()).toISOString(),
        lastProbeReason: String(probe?.reason || 'snapshot-error')
      };
      if (probe && typeof probe === 'object') recordSnapshotSafetyProgress(probe);
      logStore.append('runner', 'transport-recovery-probe', {
        recoveryId: updatedRecovery.recoveryId,
        sourceRunId: updatedRecovery.sourceRunId,
        reason: updatedRecovery.lastProbeReason,
        freshness: probeSummary?.freshness?.ok === undefined ? null : Boolean(probeSummary.freshness.ok),
        selfPresent,
        elapsedMs: Math.max(0, now() - updatedRecovery.startedAtMs),
        deadlineAt: updatedRecovery.deadlineAt
      });
      if (selfPresent) {
        preparedSnapshotSafety = probe;
        updateState({
          runner: {
            transportRecovery: updatedRecovery,
            currentAction: {
              kind: 'loop-wait',
              band: 'recover',
              reason: 'transport-recovery-ws-reopen',
              delayMs: 0,
              nextRunAt: '',
              previousRunId: updatedRecovery.sourceRunId,
              recoveryId: updatedRecovery.recoveryId
            }
          }
        }, { updatedAt: new Date(now()).toISOString() });
        refreshFromPersistedState();
        return null;
      }
      if (selfAbsent) {
        updateState({ runner: { transportRecovery: null } }, { updatedAt: new Date(now()).toISOString() });
        logStore.append('runner', 'transport-recovery-escalated', {
          recoveryId: updatedRecovery.recoveryId,
          sourceRunId: updatedRecovery.sourceRunId,
          reason: 'fresh-self-absent-full-login-safety',
          elapsedMs: Math.max(0, now() - updatedRecovery.startedAtMs),
          deadlineAt: updatedRecovery.deadlineAt,
          exitAttemptId: ''
        });
      } else {
        updateState({ runner: { transportRecovery: updatedRecovery } }, { updatedAt: new Date(now()).toISOString() });
      }
    }
    try {
      if (shouldPrepareSnapshotSafety) {
        const leadMs = preLoginSafetyLeadMs(config);
        const waitBeforeProbeMs = Math.max(0, effectiveDelayMs - leadMs);
        if (waitBeforeProbeMs > 0) {
          const waitResult = await restartDrain.wait(waitBeforeProbeMs, sleep);
          if (waitResult?.interrupted) {
            const interrupted = new Error('restart drain interrupted pre-login wait');
            interrupted.code = 'RESTART_DRAIN_WAIT_INTERRUPTED';
            throw interrupted;
          }
        }
        preparedSnapshotPayload = null;
        preparedSnapshotSafety = await (deps.runPreLoginSnapshotSafety || runPreLoginSnapshotSafety)(
          config,
          readBrowserlessStateFile(stateFile),
          {
            now,
            sleep,
            fetchWithTimeout: sourceIpController.fetchWithTimeout,
            snapshotRequest: snapshotRequestScheduler.request,
            onSnapshotPayload: observePreparedSnapshotPayload,
            onSnapshotAuditPayload: recordSnapshotAudit,
            onSnapshotSafety: recordSnapshotSafetyProgress,
            snapshotPurpose: 'login-point-safety',
            onSnapshotEdge: recordSnapshotEdgeProgress,
            easyKillPlayerTracker,
            damagePlayerTracker
          }
        );
        recordSnapshotSafetyProgress(preparedSnapshotSafety);
        const preparedSummary = preparedSnapshotSafety?.response?.summary || {};
        const preparedFreshness = preparedSummary?.freshness || {};
        logStore.append('runner', 'runner-prelogin-safety-prepared', {
          checkedAt: preparedSnapshotSafety?.checkedAt || '',
          ok: Boolean(preparedSnapshotSafety?.ok),
          reason: preparedSnapshotSafety?.reason || '',
          originalReason: preparedSnapshotSafety?.originalReason || preparedSummary?.safety?.reason || '',
          selfPresent: preparedSummary.selfPresent === undefined ? null : Boolean(preparedSummary.selfPresent),
          tick: preparedSummary.tick ?? null,
          freshness: {
            ok: preparedFreshness.ok === undefined ? null : Boolean(preparedFreshness.ok),
            reason: preparedFreshness.reason || '',
            latestKnownTick: preparedFreshness.latestKnownTick ?? null,
            tickDelta: preparedFreshness.tickDelta ?? null
          },
          self: preparedSummary.self ? {
            userId: preparedSummary.self.user_id ?? preparedSummary.self.userId ?? null,
            x: preparedSummary.self.x ?? null,
            y: preparedSummary.self.y ?? null,
            hp: preparedSummary.self.hp ?? null,
            joined: preparedSummary.self.joined || '',
            mode: preparedSummary.self.current_join_mode || ''
          } : null,
          streak: preparedSnapshotSafety?.streak ?? null,
          required: preparedSnapshotSafety?.required ?? null,
          nextRunAt,
          confirmedLeave: preparedSnapshotSafety?.confirmedLeave
            ? {
                confirmedAt: preparedSnapshotSafety.confirmedLeave.confirmedAt || '',
                snapshotIgnoreUntil: preparedSnapshotSafety.confirmedLeave.snapshotIgnoreUntil || '',
                lastRealtimeTick: Number(preparedSnapshotSafety.confirmedLeave.lastRealtimeTick || 0),
                quarantined: Boolean(preparedSnapshotSafety.confirmedLeave.quarantined)
              }
            : null
        });
        if (snapshotSafetyAllowsImmediateResume(preparedSnapshotSafety)) {
          const currentBeforeResume = readBrowserlessStateFile(stateFile);
          const pendingExit = normalizePendingExit(currentBeforeResume?.runner?.pendingExit, now(), {
            maximumAgeMs: config.pendingExitPersistMaxMs
          });
          updateState({
            runner: {
              running: true,
              mode: pendingExit ? 'exit-recovery' : (config.controlMode || 'read-only'),
              lastError: '',
              currentAction: {
                kind: pendingExit ? 'exit-recovery' : 'loop-wait',
                band: pendingExit ? 'exit' : 'recover',
                reason: pendingExit ? 'exit-recovery' : 'self-present-reentry',
                delayMs: 0,
                nextRunAt: '',
                previousRunId: loopPlan.previousRunId || '',
                ...(pendingExit ? { pendingExit } : {})
              },
              gameplayDeadline: null
            },
            stats: pendingExit
              ? currentBeforeResume.stats
              : browserlessStatsForOffline(currentBeforeResume, {
                  ...waitExitDetail,
                  reason: waitReason,
                  nextRunAt: '',
                  delayMs: 0
                }, { nowMs: now() })
          }, { updatedAt: new Date(now()).toISOString() });
          logStore.append('runner', 'runner-loop-wait-self-present-resume', {
            previousRunId: loopPlan.previousRunId || '',
            previousReason: loopPlan.reason,
            checkedAt: preparedSnapshotSafety?.checkedAt || '',
            tick: preparedSummary.tick ?? null,
            self: preparedSummary.self ? {
              x: preparedSummary.self.x ?? null,
              y: preparedSummary.self.y ?? null,
              hp: preparedSummary.self.hp ?? null,
              joined: preparedSummary.self.joined || '',
              mode: preparedSummary.self.current_join_mode || ''
            } : null
          });
          refreshFromPersistedState();
          return null;
        }
        const remainingMs = Math.max(0, nextRunAtMs - now());
        if (remainingMs > 0) {
          const waitResult = await restartDrain.wait(remainingMs, sleep);
          if (waitResult?.interrupted) {
            const interrupted = new Error('restart drain interrupted post-probe wait');
            interrupted.code = 'RESTART_DRAIN_WAIT_INTERRUPTED';
            throw interrupted;
          }
        }
      } else {
        await restartDrain.wait(effectiveDelayMs, sleep);
      }
    } catch (err) {
      if (err?.code !== 'RESTART_DRAIN_WAIT_INTERRUPTED') {
        recordSupervisorError(err, { operation: 'loop-sleep', delayMs: effectiveDelayMs });
        logStore.append('runner', 'loop-sleep-error', { error: errorMessage(err), delayMs: effectiveDelayMs });
      }
    }
    const requestedStop = safetyController.getStopEvent();
    if (requestedStop) {
      const stopped = {
        ok: false,
        mode: config.controlMode || 'read-only',
        reason: requestedStop.reason || 'explicit-stop',
        event: requestedStop
      };
      const currentBeforeStop = readBrowserlessStateFile(stateFile);
      updateState({
        runner: {
          running: false,
          lastRun: stopped,
          lastError: stopped.reason,
          currentAction: {
            kind: 'stopped',
            band: 'recover',
            reason: stopped.reason,
            previousRunId: loopPlan.previousRunId || ''
          }
        },
        stats: browserlessStatsForOffline(currentBeforeStop, {
          at: requestedStop.at,
          reason: stopped.reason,
          nextRunAt: '',
          delayMs: 0
        }, { nowMs: now() })
      }, { updatedAt: new Date(now()).toISOString() });
      logStore.append('runner', 'runner-loop-stop', {
        ...loopPlan,
        reason: stopped.reason,
        requestedStop
      });
      closeRuntimeHandlesOnReturn = closeRuntimeHandlesOnReturn
        || browserlessTerminalStopRequestsRuntimeClose(stopped, stopped.reason);
      return stopped;
    }
    safetyController.clearStop();
    updateState({ runner: { gameplayDeadline: null } }, { updatedAt: new Date(now()).toISOString() });
    refreshFromPersistedState();
    return null;
  };

  const loginPointSafetyPatchFromSnapshot = snapshotSafety => {
    const currentState = readBrowserlessStateFile(stateFile);
    const summary = snapshotSafety?.response?.summary && typeof snapshotSafety.response.summary === 'object'
      ? snapshotSafety.response.summary
      : {};
    const safety = summary.safety && typeof summary.safety === 'object' ? summary.safety : {};
    const checkedAt = snapshotSafety?.checkedAt || new Date(now()).toISOString();
    const point = safety.point || snapshotSafety?.loginPoint || currentState.loginPointSafety?.point || null;
    const required = Number(snapshotSafety?.required ?? safety.required ?? currentState.loginPointSafety?.detail?.required ?? 1);
    const streak = Number(snapshotSafety?.streak ?? safety.streak ?? 0);
    return {
      ok: Boolean(snapshotSafety?.ok && snapshotSafety?.satisfied !== false),
      reason: snapshotSafety?.reason || safety.reason || 'snapshot-safety-check',
      checkedAt,
      point,
      detail: {
        ...safety,
        ok: Boolean(snapshotSafety?.ok && snapshotSafety?.satisfied !== false),
        reason: snapshotSafety?.reason || safety.reason || '',
        originalReason: snapshotSafety?.originalReason || safety.reason || '',
        checkedAt,
        required: Number.isFinite(required) ? Math.max(1, Math.round(required)) : 1,
        streak: Number.isFinite(streak) ? Math.max(0, Math.round(streak)) : 0,
        satisfied: Boolean(snapshotSafety?.satisfied ?? safety.satisfied ?? (snapshotSafety?.ok && snapshotSafety?.satisfied !== false)),
        bypassedPreLoginSafety: Boolean(snapshotSafety?.bypassedPreLoginSafety),
        bypassKind: snapshotSafety?.bypassKind || '',
        selfPresent: summary.selfPresent === undefined ? null : Boolean(summary.selfPresent)
      }
    };
  };

  const recordSnapshotSafetyProgress = snapshotSafety => {
    if (!snapshotSafety || typeof snapshotSafety !== 'object') return;
    const summary = snapshotSafety?.response?.summary || {};
    const freshness = summary?.freshness || {};
    const clearsConfirmedLeave = Boolean(
      freshness.ok
        && (summary.selfPresent === false || snapshotSafetyAllowsImmediateResume(snapshotSafety))
    );
    const currentState = readBrowserlessStateFile(stateFile);
    const pendingResolution = pendingExitSnapshotResolution(currentState?.runner?.pendingExit, snapshotSafety);
    const priorExitRecoveryOutcomes = Array.isArray(currentState?.runner?.exitRecoveryOutcomes)
      ? currentState.runner.exitRecoveryOutcomes
      : [];
    const outcome = pendingResolution.outcome?.exitAttemptId
      && !priorExitRecoveryOutcomes.some(item => String(item?.exitAttemptId || '') === String(pendingResolution.outcome.exitAttemptId))
      ? pendingResolution.outcome
      : null;
    const loginRecoveryAssociation = outcome
      ? armLoginRecoveryAssociation(
          outcome,
          snapshotSafety?.checkedAt || new Date(now()).toISOString()
        )
      : null;
    const exitRecoveryOutcomes = outcome
      ? [...priorExitRecoveryOutcomes, outcome].slice(-64)
      : priorExitRecoveryOutcomes;
    const recoverySnapshot = snapshotSafety.snapshotPurpose === 'exit-recovery-confirmation';
    const patch = mergeState(snapshotOfflineTransitionPatch(currentState, snapshotSafety, now()), {
      runner: {
        snapshotStatus: snapshotStatusPatchFromSafety(
          currentState?.runner?.snapshotStatus,
          snapshotSafety,
          now()
        )
      },
      ...(recoverySnapshot ? {} : {
        loginPointSafety: loginPointSafetyPatchFromSnapshot(snapshotSafety)
      }),
      ...((clearsConfirmedLeave || pendingResolution.cleared) ? {
        runner: {
          ...(clearsConfirmedLeave ? { confirmedLeave: null } : {}),
          ...(pendingResolution.cleared ? { pendingExit: null } : {}),
          ...(outcome ? { exitRecoveryOutcomes } : {}),
          ...(loginRecoveryAssociation ? { pendingLoginRecovery: loginRecoveryAssociation } : {})
        }
      } : {})
    });
    const updatedAt = new Date(now()).toISOString();
    updateState(patch, { updatedAt });
    if (liveState) patchLiveState(patch, { updatedAt });
    logStore.append('runner', 'snapshot-safety-observation', {
      checkedAt: snapshotSafety?.checkedAt || '',
      snapshotPurpose: snapshotSafety?.snapshotPurpose || '',
      loginGateApplied: snapshotSafety?.loginGateApplied === true,
      carriedIntoSession: snapshotSafety?.carriedIntoSession === true,
      ok: Boolean(snapshotSafety?.ok),
      reason: snapshotSafety?.reason || '',
      originalReason: snapshotSafety?.originalReason || summary?.safety?.reason || '',
      attempt: snapshotSafety?.attempt ?? null,
      streak: snapshotSafety?.streak ?? null,
      required: snapshotSafety?.required ?? null,
      selfPresent: summary.selfPresent === undefined ? null : Boolean(summary.selfPresent),
      exitAttemptId: pendingResolution.pendingExit?.exitAttemptId || outcome?.exitAttemptId || '',
      tick: summary.tick ?? null,
      freshness: {
        ok: freshness.ok === undefined ? null : Boolean(freshness.ok),
        reason: freshness.reason || '',
        latestKnownTick: freshness.latestKnownTick ?? null,
        tickDelta: freshness.tickDelta ?? null
      },
      self: summary.self ? {
        userId: summary.self.user_id ?? summary.self.userId ?? null,
        x: summary.self.x ?? null,
        y: summary.self.y ?? null,
        hp: summary.self.hp ?? null,
        joined: summary.self.joined || '',
        mode: summary.self.current_join_mode || ''
      } : null,
      confirmedLeave: snapshotSafety?.confirmedLeave
        ? {
            confirmedAt: snapshotSafety.confirmedLeave.confirmedAt || '',
            snapshotIgnoreUntil: snapshotSafety.confirmedLeave.snapshotIgnoreUntil || '',
            lastRealtimeTick: Number(snapshotSafety.confirmedLeave.lastRealtimeTick || 0),
            quarantined: Boolean(snapshotSafety.confirmedLeave.quarantined)
          }
        : null,
      blockingPlayers: Array.isArray(summary?.safety?.blockingPlayers)
        ? summary.safety.blockingPlayers
        : [],
      blockingFactors: Array.isArray(summary?.safety?.blockingFactors)
        ? summary.safety.blockingFactors
        : [],
      singleBlockerHold: summary?.safety?.singleBlockerHold || null,
      bypassKind: snapshotSafety?.bypassKind || ''
    });
    if (outcome) logStore.append('runner', 'exit-recovery-outcome', outcome);
    if (pendingResolution.cleared) {
      logStore.append('runner', 'pending-exit-cleared-by-snapshot', {
        reason: pendingResolution.reason,
        checkedAt: snapshotSafety?.checkedAt || '',
        tick: summary.tick ?? null
      });
    }
  };

  const recordSnapshotEdgeProgress = progress => {
    if (!progress || typeof progress !== 'object') return;
    logStore.append('runner', `snapshot-edge-${progress.type || 'progress'}`, progress);
    const nextCheckAtMs = Number(progress.nextCheckAtMs);
    const nextSnapshotCheckAt = Number.isFinite(nextCheckAtMs) && nextCheckAtMs > now()
      ? new Date(nextCheckAtMs).toISOString()
      : '';
    const currentState = liveState || readBrowserlessStateFile(stateFile);
    const currentAction = currentState?.runner?.currentAction || {};
    patchLiveState({
      runner: {
        currentAction: {
          ...currentAction,
          nextSnapshotCheckAt
        }
      }
    }, { updatedAt: new Date(now()).toISOString() });
  };

  const onTransportOpen = (transport, detail = {}) => {
    chatService.attachTransport?.(transport, detail);
    logStore.append('runner', 'chat-transport-online', {
      runId: detail.runId || '',
      mode: detail.mode || ''
    });
  };
  const onTransportClose = (transport, detail = {}) => {
    const detached = chatService.detachTransport?.(transport);
    if (detached === false) return;
    logStore.append('runner', 'chat-transport-offline', {
      runId: detail.runId || '',
      mode: detail.mode || '',
      reason: detail.reason || ''
    });
  };

  let statusRenderDiagnostics = null;
  const backgroundIoStatus = io => {
    const status = io?.status?.() || null;
    if (!status) return null;
    return {
      ok: Boolean(status.ok),
      pending: Number(status.pending || 0),
      pendingRequests: Number(status.pendingRequests || 0),
      operationErrorCount: Number(status.operationErrorCount || 0)
    };
  };
  const buildStatusSource = compact => {
    const sourceStarted = performance.now();
    const remoteProfitStatus = remoteProfitWorker?.status?.(now()) || null;
    const baseState = liveState || readBrowserlessStateFile(stateFile);
    const sourceIpProbeStatus = deps.sourceIpProbe?.status?.() || null;
    const source = {
      ...baseState,
      network: {
        ...(baseState.network || {}),
        sourceIpProbe: sourceIpProbeStatus
      },
      runner: {
        ...(baseState.runner || {}),
        remoteProfit: remoteProfitStatus,
        snapshotScheduler: snapshotRequestScheduler.status?.() || null,
        snapshotPoller: snapshotGapPoller?.status?.() || null
      },
      remoteProfit: remoteProfitStatus,
      highDropPlayers: highDropPlayerTracker.status(now()),
      easyKillPlayers: easyKillPlayerStatus(),
      dailyDamagePlayers: damagePlayerTracker.status(now()),
      dynamicWhitelist: dynamicWhitelist.status(),
      mapTrails: mapTrailTracker.status(now()),
      chat: chatService.status?.(now()) || null,
      statusRender: {
        ...(statusRenderDiagnostics || {}),
        cacheMaxStaleMs: STATUS_COMPACT_MAX_STALE_MS,
        logQueue: backgroundIoStatus(backgroundIo),
        renderQueue: backgroundIoStatus(statusRenderIo)
      }
    };
    const sourceBuildMs = performance.now() - sourceStarted;
    if (!compact) return { source, sourceBuildMs, compactProjectionMs: 0 };
    const projectionStarted = performance.now();
    const projected = browserlessCompactStatusSource(source);
    return {
      source: projected,
      sourceBuildMs,
      compactProjectionMs: performance.now() - projectionStarted
    };
  };
  const statusRenderConfig = {
    ...publicConfig(config),
    webToken: config.webToken ? 'present' : '',
    webVersion: BROWSERLESS_WEB_PANEL_VERSION
  };
  let fullStatusCacheText = '';
  let fullStatusCacheAtMs = 0;
  let fullStatusInFlight = null;
  let compactStatusCacheText = '';
  let compactStatusCacheAtMs = 0;
  let compactStatusInFlight = null;
  const renderStatusTextNow = async compact => {
    const built = buildStatusSource(compact);
    const source = built.source;
    if (statusRenderIo?.renderStatus) {
      const rendered = await statusRenderIo.renderStatus(source, statusRenderConfig, compact, {
        timeoutMs: STATUS_RENDER_TIMEOUT_MS
      });
      if (compact) {
        statusRenderDiagnostics = {
          sourceBuildMs: Math.round(built.sourceBuildMs * 1000) / 1000,
          compactProjectionMs: Math.round(built.compactProjectionMs * 1000) / 1000,
          postMessageMs: Math.round(Number(rendered.postMs || 0) * 1000) / 1000,
          workerComputeMs: Math.round(Number(rendered.computeMs || 0) * 1000) / 1000,
          roundTripMs: Math.round(Number(rendered.roundTripMs || 0) * 1000) / 1000,
          responseSendMs: numberOrNull(statusRenderDiagnostics?.responseSendMs),
          bytes: Number(rendered.bytes || 0),
          renderedAt: new Date(now()).toISOString()
        };
      }
      return rendered.text;
    }
    const status = compact
      ? buildCompactBrowserlessStatus(source, statusRenderConfig)
      : {
          ...buildPublicBrowserlessStatus(source, statusRenderConfig),
          highDropPlayers: source.highDropPlayers,
          easyKillPlayers: source.easyKillPlayers,
          dailyDamagePlayers: source.dailyDamagePlayers,
          dynamicWhitelist: source.dynamicWhitelist,
          chat: source.chat
        };
    return JSON.stringify(status, null, 2);
  };
  const refreshCompactStatusText = () => {
    if (compactStatusInFlight) return compactStatusInFlight;
    compactStatusInFlight = renderStatusTextNow(true)
      .then(text => {
        compactStatusCacheText = text;
        compactStatusCacheAtMs = performance.now();
        return text;
      })
      .finally(() => {
        compactStatusInFlight = null;
      });
    return compactStatusInFlight;
  };
  const renderStatusText = compact => {
    if (compact) {
      const atMs = performance.now();
      if (compactStatusCacheText) {
        const cacheAgeMs = atMs - compactStatusCacheAtMs;
        if (cacheAgeMs >= STATUS_COMPACT_MAX_STALE_MS) {
          return refreshCompactStatusText().catch(err => {
            recordSupervisorError(err, { operation: 'compact-status-required-refresh', cacheAgeMs });
            throw err;
          });
        }
        if (cacheAgeMs >= STATUS_COMPACT_REFRESH_MS && !compactStatusInFlight) {
          setImmediate(() => refreshCompactStatusText().catch(err => {
            recordSupervisorError(err, { operation: 'compact-status-refresh' });
          }));
        }
        return Promise.resolve(compactStatusCacheText);
      }
      return refreshCompactStatusText();
    }
    const atMs = performance.now();
    if (fullStatusCacheText && atMs - fullStatusCacheAtMs < 1000) {
      return Promise.resolve(fullStatusCacheText);
    }
    if (fullStatusInFlight) return fullStatusInFlight;
    fullStatusInFlight = renderStatusTextNow(false)
      .then(text => {
        fullStatusCacheText = text;
        fullStatusCacheAtMs = performance.now();
        return text;
      })
      .finally(() => {
        fullStatusInFlight = null;
      });
    return fullStatusInFlight;
  };

  if (!config.once && Number(config.statusPort || 0) > 0 && deps.startStatusServer !== false) {
    const starter = deps.startStatusServer || startStatusServer;
    try {
      await refreshCompactStatusText();
      statusHandle = await starter({
        host: config.statusHost,
        port: config.statusPort,
        webToken: config.webToken,
        getStatusText: () => renderStatusText(false),
        getCompactStatusText: () => renderStatusText(true),
        onMainThreadTask: (task, durationMs, detail = {}) => {
          if (task === 'status-response' && detail.compact) {
            statusRenderDiagnostics = {
              ...(statusRenderDiagnostics || {}),
              responseSendMs: Math.round(Number(durationMs || 0) * 1000) / 1000
            };
          }
          const spike = statusWallTimeSpikeDetail(task, durationMs, detail);
          if (spike) logStore.append('runner', 'main-thread-wall-time-spike', spike);
        },
        getChat: () => chatService.status?.(now()) || { ok: true, messages: [] },
        onChatActivity: () => chatService.notePageActivity?.(now()),
        onChatSend: text => {
          const result = chatService.sendChat?.(text) || {
            ok: false,
            statusCode: 409,
            reason: 'chat-unavailable',
            error: '聊天服务不可用'
          };
          logStore.append('runner', result.ok ? 'chat-send' : 'chat-send-rejected', {
            ok: Boolean(result.ok),
            reason: result.reason || '',
            textLength: Number(result.textLength || String(text ?? '').length),
            statusCode: Number(result.statusCode || (result.ok ? 200 : 409))
          });
          return result;
        },
        onDynamicWhitelistAdd: name => {
          const requestedName = String(name || '').trim();
          if (!requestedName) return { ok: false, statusCode: 400, reason: 'empty-name', error: '请输入玩家名称' };
          const matches = chatService.findPlayersByName?.(requestedName) || [];
          if (!matches.length) return { ok: false, statusCode: 404, reason: 'player-not-found', error: '未找到该玩家，请等待全局快照记录后重试' };
          if (matches.length > 1) return { ok: false, statusCode: 409, reason: 'ambiguous-name', error: '存在同名玩家，无法安全添加' };
          const result = dynamicWhitelist.add(matches[0], now());
          logStore.append('runner', 'dynamic-whitelist-added', {
            userId: result.player?.userId ?? null,
            name: result.player?.name || requestedName,
            added: Boolean(result.added)
          });
          compactStatusCacheText = '';
          return { ok: true, added: Boolean(result.added), player: result.player };
        },
        onDynamicWhitelistRemove: name => {
          const requestedName = String(name || '').trim();
          if (!requestedName) return { ok: false, statusCode: 400, reason: 'empty-name', error: '请选择玩家名称' };
          // 面板只下发名称, userId 必须由服务端从动态白名单自身解析, 避免误删同名玩家。
          const members = dynamicWhitelist.status().players || [];
          const matches = members.filter(player => String(player?.name || '') === requestedName);
          if (!matches.length) return { ok: false, statusCode: 404, reason: 'player-not-found', error: '该玩家不在动态白名单中' };
          if (matches.length > 1) return { ok: false, statusCode: 409, reason: 'ambiguous-name', error: '存在同名玩家，无法安全移除' };
          const target = matches[0];
          const applied = applyDynamicWhitelistRemoval(target, {
            atMs: now(),
            source: 'dynamic-whitelist-remove'
          });
          if (applied.ok === false) {
            return { ok: false, statusCode: 400, reason: applied.reason || 'remove-failed', error: '移除失败' };
          }
          const easyKill = applied.easyKill;
          return {
            ok: true,
            removed: Boolean(applied.removed),
            player: applied.player,
            easyKill: easyKill?.ok ? { userId: easyKill.userId, name: easyKill.name, score: easyKill.score } : null
          };
        },
        onStop: async () => {
          const event = safetyController.requestStop('explicit-stop', { source: 'status-api' });
          const currentState = liveState || readBrowserlessStateFile(stateFile);
          const patch = {
            runner: {
              lastError: event.reason,
              currentAction: { kind: 'stop', band: 'safety', reason: event.reason }
            },
            recentExits: [...(currentState.recentExits || []), event].slice(-20)
          };
          const updatedAt = new Date(now()).toISOString();
          if (liveState) patchLiveState(patch, { updatedAt });
          else updateState(patch, { updatedAt });
          logStore.append('exits', 'stop-request', event);
          return { ok: true, event };
        },
        onAuthUrl: async () => {
          const authUrl = await sourceIpController.requestAuthUrl({
            gameOrigin: config.gameOrigin,
            timeoutMs: config.httpTimeoutMs
          });
          updateState({
            session: {
              lastAuthUrl: authUrl,
              lastAuthUrlAt: new Date(now()).toISOString()
            }
          }, { updatedAt: new Date(now()).toISOString() });
          logStore.append('runner', 'auth-url', { authUrlPresent: Boolean(authUrl) });
          return { ok: true, authUrl };
        },
        onCallback: async input => {
          const result = await sourceIpController.submitCallbackInput(input, {
            gameOrigin: config.gameOrigin,
            timeoutMs: config.httpTimeoutMs
          });
          updateState({
            session: {
              userId: result.login.userId,
              sessionToken: result.login.sessionToken,
              tokenUpdatedAt: new Date(now()).toISOString(),
              lastLoginSource: result.source || '',
              lastLoginSummary: result.summary || null
            },
            runner: {
              lastError: '',
              currentAction: {
                kind: 'loop-wait',
                band: 'recover',
                reason: 'manual-session-updated'
              }
            }
          }, { updatedAt: new Date(now()).toISOString() });
          refreshFromPersistedState();
          logStore.append('runner', 'login-ok', {
            userId: result.login.userId,
            tokenPresent: true,
            source: result.source || '',
            summary: result.summary || null
          });
          return {
            ok: true,
            userId: result.login.userId,
            tokenPresent: true,
            source: result.source || '',
            summary: result.summary || null
          };
        }
      });
    } catch (err) {
      recordSupervisorError(err, { operation: 'status-server-start', host: config.statusHost, port: config.statusPort });
      logStore.append('runner', 'status-server-error', { error: errorMessage(err), host: config.statusHost, port: config.statusPort });
    }
  }

  if (!config.once && !config.dryRun) {
    snapshotGapPoller.start({
      reset: false,
      immediate: false,
      allowBurst: false
    });
  }

  logStore.append('runner', 'runner-start', {
    runtimeRevision: browserlessRuntimeRevision(),
    runtimeRevisionResolution: browserlessRuntimeRevisionStatus(),
    strategySchemaVersion: 2,
    config: publicConfig(config),
    retention,
    statusServer: statusHandle ? { host: config.statusHost, port: statusHandle.port } : null
  });
  updateState({ runner: { restartDrain: null, processStop: null } }, { updatedAt: new Date(now()).toISOString() });

  let persistedDelayPlan = !config.once && !config.dryRun
    ? persistedReconnectDelayPlan(readBrowserlessStateFile(stateFile), config, now())
    : null;
  if (!persistedDelayPlan) {
    updateState({ runner: { gameplayDeadline: null } }, { updatedAt: new Date(now()).toISOString() });
  }
  if (persistedDelayPlan && config.snapshotEdgeEnabled === true) {
    const persistedState = readBrowserlessStateFile(stateFile);
    const persistedPendingExit = normalizePendingExit(
      persistedDelayPlan.pendingExit || persistedState?.runner?.pendingExit,
      now(),
      { maximumAgeMs: config.pendingExitPersistMaxMs }
    );
    const confirmed = activeConfirmedLeaveState(persistedState, now());
    const explicitCooldown = Boolean(persistedDelayPlan.explicitCooldown || persistedDelayPlan.explicitDelay);
    if (confirmed && !explicitCooldown && !persistedPendingExit) {
      logStore.append('runner', 'runner-persisted-delay-replaced-by-snapshot-edge', {
        previousReason: persistedDelayPlan.reason || '',
        previousNextRunAt: persistedDelayPlan.nextRunAt || '',
        confirmedAt: confirmed.confirmedAt || ''
      });
      persistedDelayPlan = null;
      updateState({ runner: { gameplayDeadline: null } }, { updatedAt: new Date(now()).toISOString() });
    }
  }
  let preservePersistedOnlineSession = false;
  if (persistedDelayPlan) {
    const persistedStateBeforeProbe = readBrowserlessStateFile(stateFile);
    const persistedPendingExit = normalizePendingExit(
      persistedDelayPlan.pendingExit || persistedStateBeforeProbe?.runner?.pendingExit,
      now(),
      { maximumAgeMs: config.pendingExitPersistMaxMs }
    );
    const persistedConfirmedLeave = activeConfirmedLeaveState(persistedStateBeforeProbe, now());
    const explicitCooldown = Boolean(persistedDelayPlan.explicitCooldown || persistedDelayPlan.explicitDelay);
    preservePersistedOnlineSession = Boolean(persistedPendingExit) || (
      preserveOnlineSessionForLoopWait(null, persistedDelayPlan)
        && !persistedConfirmedLeave
    );
    if (persistedPendingExit) {
      logStore.append('runner', 'runner-persisted-pending-exit-deadline', {
        previousRunId: persistedPendingExit.sourceRunId || '',
        reason: persistedPendingExit.reason,
        nextRetryAt: persistedPendingExit.nextRetryAt,
        delayMs: Math.max(0, Number(persistedPendingExit.nextRetryAtMs || now()) - now())
      });
    } else if (explicitCooldown) {
      logStore.append('runner', 'runner-persisted-explicit-cooldown-self-probe-skipped', {
        previousRunId: persistedDelayPlan.previousRunId || '',
        previousReason: persistedDelayPlan.reason,
        deadlineType: persistedDelayPlan.deadlineType || '',
        nextRunAt: persistedDelayPlan.nextRunAt || ''
      });
    } else if (persistedConfirmedLeave?.quarantineRemainingMs > 0) {
      logStore.append('runner', 'runner-persisted-wait-confirmed-leave-quarantine', {
        previousRunId: persistedDelayPlan.previousRunId || '',
        previousReason: persistedDelayPlan.reason,
        confirmedAt: persistedConfirmedLeave.confirmedAt || '',
        snapshotIgnoreUntil: persistedConfirmedLeave.snapshotIgnoreUntil || '',
        lastRealtimeTick: Number(persistedConfirmedLeave.lastRealtimeTick || 0),
        remainingMs: persistedConfirmedLeave.quarantineRemainingMs
      });
    } else if (persistedDelayPlan.transportRecovery) {
      logStore.append('runner', 'transport-recovery-persisted-resume', {
        recoveryId: persistedDelayPlan.transportRecovery.recoveryId,
        sourceRunId: persistedDelayPlan.transportRecovery.sourceRunId,
        deadlineAt: persistedDelayPlan.transportRecovery.deadlineAt,
        elapsedMs: Math.max(0, now() - persistedDelayPlan.transportRecovery.startedAtMs)
      });
    } else {
      try {
        preparedSnapshotPayload = null;
        const probe = await (deps.runPreLoginSnapshotSafety || runPreLoginSnapshotSafety)({
          ...config,
          snapshotEdgeEnabled: false,
          loginPointSafetySuccessRequired: 1,
          loginPointSafetyProbeIntervalMs: 0
        }, persistedStateBeforeProbe, {
          now,
          sleep,
          fetchWithTimeout: sourceIpController.fetchWithTimeout,
          snapshotRequest: snapshotRequestScheduler.request,
          onSnapshotPayload: observePreparedSnapshotPayload,
          onSnapshotAuditPayload: recordSnapshotAudit,
          snapshotPurpose: 'login-point-safety',
          easyKillPlayerTracker,
          damagePlayerTracker,
          dynamicWhitelist
        });
        const selfPresent = snapshotSafetyAllowsImmediateResume(probe);
        logStore.append('runner', 'runner-persisted-wait-self-probe', {
          checkedAt: probe?.checkedAt || '',
          ok: Boolean(probe?.ok),
          reason: probe?.reason || '',
          selfPresent,
          tick: probe?.response?.summary?.tick ?? null,
          nextRunAt: persistedDelayPlan.nextRunAt
        });
        if (selfPresent) {
          preparedSnapshotSafety = probe;
          recordSnapshotSafetyProgress(probe);
          const currentBeforeResume = readBrowserlessStateFile(stateFile);
          const pendingExit = normalizePendingExit(currentBeforeResume?.runner?.pendingExit, now(), {
            maximumAgeMs: config.pendingExitPersistMaxMs
          });
          updateState({
            runner: {
              running: true,
              mode: pendingExit ? 'exit-recovery' : (config.controlMode || 'read-only'),
              lastError: '',
              currentAction: {
                kind: pendingExit ? 'exit-recovery' : 'loop-wait',
                band: pendingExit ? 'exit' : 'recover',
                reason: pendingExit ? 'exit-recovery' : 'self-present-reentry',
                delayMs: 0,
                nextRunAt: '',
                deadlineType: pendingExit ? 'exit-recovery-retry' : '',
                explicitCooldown: false,
                explicitDelay: false,
                previousRunId: persistedDelayPlan.previousRunId || '',
                persisted: true,
                ...(pendingExit ? { pendingExit } : {})
              },
              gameplayDeadline: null
            },
            stats: (preservePersistedOnlineSession || pendingExit)
              ? currentBeforeResume.stats
              : browserlessStatsForOffline(currentBeforeResume, {
                  reason: persistedDelayPlan.safetyReason || persistedDelayPlan.reason,
                  nextRunAt: '',
                  delayMs: 0
                }, { nowMs: now() })
          }, { updatedAt: new Date(now()).toISOString() });
          logStore.append('runner', 'runner-persisted-wait-self-present-resume', {
            previousRunId: persistedDelayPlan.previousRunId || '',
            previousReason: persistedDelayPlan.reason,
            checkedAt: probe?.checkedAt || '',
            tick: probe?.response?.summary?.tick ?? null
          });
          persistedDelayPlan = null;
        }
      } catch (err) {
        recordSupervisorError(err, { operation: 'persisted-wait-self-probe' });
        logStore.append('runner', 'runner-persisted-wait-self-probe-error', {
          error: errorMessage(err),
          nextRunAt: persistedDelayPlan.nextRunAt
        });
      }
    }
  }
  if (persistedDelayPlan) {
    const currentBeforeWait = readBrowserlessStateFile(stateFile);
    const persistedPendingExit = normalizePendingExit(
      persistedDelayPlan.pendingExit || currentBeforeWait?.runner?.pendingExit,
      now(),
      { maximumAgeMs: config.pendingExitPersistMaxMs }
    );
    updateState({
      runner: {
        running: true,
        mode: persistedPendingExit ? 'exit-recovery' : (config.controlMode || 'read-only'),
        lastError: '',
        currentAction: {
          kind: persistedPendingExit ? 'exit-recovery' : 'loop-wait',
          band: persistedPendingExit ? 'exit' : 'recover',
          reason: persistedDelayPlan.reason,
          delayMs: persistedDelayPlan.delayMs,
          nextRunAt: persistedDelayPlan.nextRunAt,
          deadlineType: String(
            persistedDelayPlan.deadlineType
              || (persistedPendingExit ? 'exit-recovery-retry' : '')
          ),
          explicitCooldown: Boolean(persistedDelayPlan.explicitCooldown),
          explicitDelay: Boolean(persistedDelayPlan.explicitDelay),
          previousRunId: persistedDelayPlan.previousRunId || '',
          persisted: true,
          ...(persistedPendingExit ? { pendingExit: persistedPendingExit } : {})
        },
        gameplayDeadline: persistedPendingExit
          ? null
          : (persistedDelayPlan.gameplayDeadline || gameplayDeadlineFromLoopPlan(
              persistedDelayPlan,
              persistedDelayPlan.nextRunAt,
              persistedDelayPlan.previousRunId
            ))
      },
      stats: preservePersistedOnlineSession
        ? currentBeforeWait.stats
        : browserlessStatsForOffline(currentBeforeWait, {
            reason: persistedDelayPlan.safetyReason || persistedDelayPlan.reason,
            nextRunAt: persistedDelayPlan.nextRunAt,
            delayMs: persistedDelayPlan.delayMs
          }, { nowMs: now() })
    }, { updatedAt: new Date(now()).toISOString() });
    logStore.append('runner', 'runner-persisted-loop-wait', {
      ...persistedDelayPlan,
      supervisorErrors: supervisorErrors.slice(-5)
    });
    try {
      const waitMs = persistedPendingExit
        ? Math.max(0, Number(persistedPendingExit.nextRetryAtMs || now()) - now())
        : persistedDelayPlan.delayMs;
      await restartDrain.wait(waitMs, sleep);
    } catch (err) {
      recordSupervisorError(err, { operation: 'persisted-loop-sleep', delayMs: persistedDelayPlan.delayMs });
      logStore.append('runner', 'persisted-loop-sleep-error', { error: errorMessage(err), delayMs: persistedDelayPlan.delayMs });
    }
    const requestedStop = safetyController.getStopEvent();
    if (requestedStop) {
      const stopped = {
        ok: false,
        mode: config.controlMode || 'read-only',
        reason: requestedStop.reason || 'explicit-stop',
        event: requestedStop
      };
      const currentBeforeStop = readBrowserlessStateFile(stateFile);
      updateState({
        runner: {
          running: false,
          lastRun: stopped,
          lastError: stopped.reason,
          currentAction: {
            kind: 'stopped',
            band: 'recover',
            reason: stopped.reason,
            previousRunId: persistedDelayPlan.previousRunId || ''
          }
        },
        stats: browserlessStatsForOffline(currentBeforeStop, {
          at: requestedStop.at,
          reason: stopped.reason,
          nextRunAt: '',
          delayMs: 0
        }, { nowMs: now() })
      }, { updatedAt: new Date(now()).toISOString() });
      logStore.append('runner', 'runner-loop-stop', {
        ...persistedDelayPlan,
        reason: stopped.reason,
        requestedStop
      });
      closeRuntimeHandlesOnReturn = closeRuntimeHandlesOnReturn
        || browserlessTerminalStopRequestsRuntimeClose(stopped, stopped.reason);
      return stopped;
    }
    safetyController.clearStop();
    updateState({ runner: { gameplayDeadline: null } }, { updatedAt: new Date(now()).toISOString() });
    refreshFromPersistedState();
  }

  if (!['read-only', 'movement-only', 'non-combat-profit', 'profit-live', 'combat-dry-run', 'combat-live'].includes(String(config.controlMode || ''))) {
    const result = { ok: false, reason: 'unsupported-control-mode' };
    updateState({
      runner: {
        running: false,
        lastRun: result,
        lastError: result.reason
      }
    }, { updatedAt: new Date(now()).toISOString() });
    logStore.append('runner', 'runner-stop', result);
    return result;
  }

  if (config.dryRun) {
    const result = {
      ok: true,
      mode: 'dry-run',
      controlMode: config.controlMode || 'read-only',
      once: Boolean(config.once),
      statusPort: config.statusPort,
      message: 'browserless runner skeleton initialized without live transport'
    };
    updateState({
      runner: {
        running: !config.once,
        mode: 'dry-run',
        lastRun: result,
        lastError: ''
      }
    }, { updatedAt: new Date(now()).toISOString() });
    logStore.append('runner', 'runner-dry-run', result);
    return result;
  }

  if (config.once && (!config.userId || !config.sessionToken)) {
    const result = { ok: false, reason: 'missing-manual-session' };
    updateState({
      runner: {
        running: false,
        lastRun: result,
        lastError: result.reason
      }
    }, { updatedAt: new Date(now()).toISOString() });
    logStore.append('runner', 'runner-stop', result);
    return result;
  }

  const readOnlyCanary = deps.runReadOnlyOnce || runReadOnlyCanary;
  while (true) {
    if (!config.userId || !config.sessionToken) {
      const result = { ok: false, mode: config.controlMode || 'read-only', reason: 'missing-manual-session' };
      updateState({
        runner: {
          running: true,
          mode: config.controlMode || 'read-only',
          lastRun: result,
          lastError: result.reason,
          currentAction: {
            kind: 'loop-wait',
            band: 'recover',
            reason: result.reason
          }
        }
      }, { updatedAt: new Date(now()).toISOString() });
      logStore.append('runner', 'runner-session-wait', result);
      const stopped = await waitForLoopPlan(browserlessLoopPlan(result, config), result);
      if (stopped) return stopped;
      continue;
    }
    const loopState = readBrowserlessStateFile(stateFile);
    const activePendingExit = normalizePendingExit(loopState?.runner?.pendingExit, now(), {
      maximumAgeMs: config.pendingExitPersistMaxMs
    });
    const dailyFirstLoginPlan = activePendingExit ? null : browserlessDailyFirstLoginDelayPlan(
      loopState,
      config,
      now()
    );
    if (dailyFirstLoginPlan) {
      const stopped = await waitForLoopPlan(dailyFirstLoginPlan);
      if (stopped) return stopped;
      continue;
    }
    const sessionOnline = Boolean(loopState?.stats?.currentSession?.online);
    const transportRecoveryState = normalizeTransportRecovery(
      loopState?.runner?.transportRecovery,
      now(),
      config
    );
    const loginIntervalPlan = !activePendingExit && !transportRecoveryState
      ? browserlessLoginIntervalDelayPlan(loopState, config, now())
      : null;
    if (loginIntervalPlan) {
      const stopped = await waitForLoopPlan(loginIntervalPlan);
      if (stopped) return stopped;
      continue;
    }
    if (transportRecoveryState && !transportRecoveryState.expired && !preparedSnapshotSafety) {
      const stopped = await waitForLoopPlan({
        continue: true,
        reason: 'action-settlement-stalled',
        delayMs: Math.min(1000, Math.max(0, transportRecoveryState.deadlineAtMs - now())),
        previousRunId: transportRecoveryState.sourceRunId,
        error: 'action-settlement-stalled',
        safetyReason: 'action-settlement-stalled',
        transportRecovery: transportRecoveryState
      }, {
        ok: false,
        canary: {
          runId: transportRecoveryState.sourceRunId,
          safety: { event: { reason: 'action-settlement-stalled', shouldLeave: false } }
        }
      });
      if (stopped) return stopped;
      continue;
    }

    // A fresh anonymous source-IP preflight is a login gate. It runs only
    // after all existing waits/recovery branches have settled; an active
    // session and pending-exit recovery keep their already-bound lifecycle.
    let loginPreflightResult = null;
    if (!deps.disableSourceIpPreflight && !activePendingExit && !transportRecoveryState && !sessionOnline) {
      try {
        loginPreflightResult = await runLoginSourceIpPreflight();
      } catch (err) {
        recordSupervisorError(err, { operation: 'source-ip-preflight' });
        logStore.append('runner', 'source-ip-preflight-error', { error: errorMessage(err) });
        const current = readBrowserlessStateFile(stateFile);
        const previousPreflight = normalizeSourceIpPreflight(
          current.network?.sourceIpPreflight,
          Object.keys(current.network?.sourceIpRisk || {}).length
        );
        const errorReason = 'source-ip-preflight-error';
        const errorStatus = {
          ...previousPreflight,
          phase: 'error',
          reason: errorReason,
          completedAt: new Date(now()).toISOString(),
          nextRetryAt: '',
          deferredForNextLoginPoint: false,
          reuseWithoutRetest: false,
          reusedAt: '',
          lastErrorCategory: sourceIpPreflightErrorCategory(err)
        };
        try {
          await clearSourceIpLifecycle({
            sourceIpPreflight: errorStatus,
            reason: errorReason
          });
        } catch (clearError) {
          recordSupervisorError(clearError, { operation: 'source-ip-preflight-error-clear' });
          logStore.append('runner', 'source-ip-preflight-error-clear', {
            error: errorMessage(clearError)
          });
        }
        loginPreflightResult = {
          ok: false,
          reason: errorReason,
          error: errorMessage(err),
          sourceIpPreflight: errorStatus
        };
      }
      if (loginPreflightResult?.interrupted) {
        const interrupted = {
          ok: false,
          mode: config.controlMode || 'read-only',
          reason: loginPreflightResult.reason || 'source-ip-preflight-interrupted'
        };
        updateState({
          runner: {
            running: false,
            lastRun: interrupted,
            lastError: interrupted.reason,
            currentAction: sourceIpPreflightAction(loginPreflightResult.sourceIpPreflight || {}, {
              nextRunAt: ''
            })
          }
        }, { updatedAt: new Date(now()).toISOString() });
        return interrupted;
      }
      if (loginPreflightResult?.insufficient || loginPreflightResult?.reason === 'source-ip-preflight-insufficient') {
        const insufficientStatus = loginPreflightResult.sourceIpPreflight || readBrowserlessStateFile(stateFile).network?.sourceIpPreflight || {};
        const cachedProbeWait = loginPreflightResult.cached === true;
        const cachedRetryAtMs = Date.parse(String(insufficientStatus.nextRetryAt || ''));
        const cachedDelayMs = cachedRetryAtMs > now()
          ? cachedRetryAtMs - now()
          : Math.max(1000, Number(config.loopDelayMs || 30000));
        const cooldownReason = cachedProbeWait ? 'source-ip-probe-waiting' : 'source-ip-preflight-insufficient';
        const cooldownMs = cachedProbeWait ? cachedDelayMs : SOURCE_IP_PREFLIGHT_INSUFFICIENT_COOLDOWN_MS;
        const cooldownPlan = {
          continue: true,
          reason: cooldownReason,
          safetyReason: cooldownReason,
          delayMs: cooldownMs,
          explicitDelay: true,
          explicitCooldown: !cachedProbeWait,
          sourceIpPreflight: insufficientStatus,
          error: cooldownReason
        };
        updateState({
          runner: {
            currentAction: sourceIpPreflightAction(insufficientStatus, {
              nextRunAt: new Date(now() + cooldownMs).toISOString()
            }),
            gameplayDeadline: {
              type: cooldownReason,
              reason: cooldownReason,
              explicit: !cachedProbeWait,
              until: new Date(now() + cooldownMs).toISOString()
            }
          }
        }, { updatedAt: new Date(now()).toISOString() });
        const stopped = await waitForLoopPlan(cooldownPlan, {
          ok: false,
          mode: config.controlMode || 'read-only',
          reason: 'source-ip-preflight-insufficient'
        });
        if (stopped) return stopped;
        continue;
      }
      if (loginPreflightResult?.ok && loginPreflightResult.deferredForNextLoginPoint && !loginPreflightResult.reused) {
        const deferredStatus = loginPreflightResult.sourceIpPreflight || readBrowserlessStateFile(stateFile).network?.sourceIpPreflight || {};
        const deferredDelayMs = Math.max(1000, Number(config.loopDelayMs || 30000));
        const deferredPlan = {
          continue: true,
          reason: 'source-ip-preflight-deferred',
          safetyReason: 'source-ip-preflight-deferred',
          delayMs: deferredDelayMs,
          explicitDelay: true,
          sourceIpPreflight: deferredStatus,
          error: 'source-ip-preflight-deferred'
        };
        updateState({
          runner: {
            currentAction: sourceIpPreflightAction(deferredStatus, {
              nextRunAt: new Date(now() + deferredDelayMs).toISOString()
            })
          }
        }, { updatedAt: new Date(now()).toISOString() });
        logStore.append('runner', 'source-ip-preflight-deferred-loop', {
          delayMs: deferredDelayMs,
          sourceIps: loginPreflightResult.availableIps || [],
          elapsedMs: deferredStatus.elapsedMs || 0
        });
        const stopped = await waitForLoopPlan(deferredPlan, {
          ok: false,
          mode: config.controlMode || 'read-only',
          reason: 'source-ip-preflight-deferred'
        });
        if (stopped) return stopped;
        continue;
      }
      // Any unexpected preflight failure is a hard login gate failure.  Do
      // not fall through to snapshot/bootstrap/canary: no anonymous result
      // means there is no authorized three-IP lifecycle for a WebSocket.
      if (loginPreflightResult && !loginPreflightResult.ok) {
        const errorStatus = loginPreflightResult.sourceIpPreflight
          || readBrowserlessStateFile(stateFile).network?.sourceIpPreflight
          || {};
        const retryDelayMs = Math.max(1000, Number(config.loopDelayMs || 30000));
        const failurePlan = {
          continue: !config.once,
          reason: loginPreflightResult.reason || 'source-ip-preflight-error',
          safetyReason: loginPreflightResult.reason || 'source-ip-preflight-error',
          delayMs: retryDelayMs,
          explicitDelay: true,
          sourceIpPreflight: errorStatus,
          error: loginPreflightResult.error || loginPreflightResult.reason || 'source-ip-preflight-error'
        };
        updateState({
          runner: {
            currentAction: sourceIpPreflightAction(errorStatus, {
              nextRunAt: config.once ? '' : new Date(now() + retryDelayMs).toISOString()
            }),
            lastError: failurePlan.error
          }
        }, { updatedAt: new Date(now()).toISOString() });
        logStore.append('runner', 'source-ip-preflight-gate-failed', {
          reason: failurePlan.reason,
          error: failurePlan.error,
          retryDelayMs
        });
        const stopped = await waitForLoopPlan(failurePlan, {
          ok: false,
          mode: config.controlMode || 'read-only',
          reason: failurePlan.reason
        });
        if (stopped) return stopped;
        continue;
      }
    }
    loginPointProvided = hasConfigNumber(config.loginPointX) && hasConfigNumber(config.loginPointY);
    if (!loginPointProvided && config.controlMode === 'read-only') {
      let bootstrap;
      let bootstrapSnapshotPayload = null;
      const bootstrapDailyFirstLogin = isFirstBrowserlessLoginOfDay(readBrowserlessStateFile(stateFile), now());
      const observeBootstrapSnapshotPayload = (payload, detail = {}) => {
        const result = observeSnapshotPayload(payload, detail);
        const carried = snapshotCarryRecord(payload, detail);
        if (carried) bootstrapSnapshotPayload = carried;
        return result;
      };
      try {
        markSourceIpSnapshotWait('source-ip-login-point-bootstrap-wait');
        bootstrap = await readOnlyCanary(config, {
          logStore,
          now,
          persistedState: readBrowserlessStateFile(stateFile),
          safetyController,
          easyKillPlayerTracker,
          combatCompletionTracker,
          damagePlayerTracker,
          dynamicWhitelist,
          allowMissingLoginPointBootstrap: true,
          onSnapshotSafety: recordSnapshotSafetyProgress,
          onSnapshotPayload: observeBootstrapSnapshotPayload,
          onSnapshotAuditPayload: recordSnapshotAudit,
          getRemoteProfitContext: remoteProfitContext,
          onRemoteProfitDecision: decision => remoteProfitWorker?.observeDecision?.(decision),
          onRemoteProfitRealtime: entities => remoteProfitWorker?.observeRealtimeEntities?.(entities),
          onRemoteProfitWhitelist: ids => { remoteProfitStaticWhitelistIds = ids.slice(0, 128); },
          fetchWithTimeout: sourceIpController.fetchWithTimeout,
          snapshotRequest: snapshotRequestScheduler.request,
          openBrowserlessWs: sourceIpController.openBrowserlessWs,
          onLoginTransportAttempt: markSourceIpLoginAttempt,
          onLoginSuccess: entry => {
            mapTrailTracker.clear();
            markSourceIpLoginSuccess(entry);
            beginGameplaySnapshotSession(entry, bootstrapDailyFirstLogin ? null : bootstrapSnapshotPayload);
          },
          onMapTrailRealtime: observeMapTrailRealtime,
          onTransportOpen,
          onTransportClose,
          onTransportHealth: transportHealth => {
            patchLiveState({ network: { transportHealth } }, {
              updatedAt: new Date(now()).toISOString()
            });
          },
          leaveWithVerificationFallback: sourceIpController.leaveWithVerification
        });
      } catch (err) {
        recordSupervisorError(err, { operation: 'login-point-bootstrap-canary' });
        bootstrap = buildRunnerErrorCanary(err, config, { now, runId: 'login-point-bootstrap-error' });
        logStore.append('runner', 'runner-canary-error', bootstrap);
      }
      endGameplaySnapshotSession(bootstrap?.reason || bootstrap?.error || 'login-point-bootstrap-finish');
      if (runnerResultConfirmedLeave({ canary: bootstrap })) mapTrailTracker.clear();
      const learned = learnedLoginPointFromCanary(bootstrap);
      if (learned.loginPoint) {
        updateState({
          loginPointSafety: {
            ok: false,
            reason: 'learned-login-point-pending-snapshot-safety',
            point: learned.loginPoint,
            checkedAt: bootstrap.completedAt || new Date(now()).toISOString()
          },
          current: {
            self: learned.finalSelf
          },
          probes: {
            lastReadOnlyProbe: bootstrap
          }
        }, { updatedAt: new Date(now()).toISOString() });
        persisted = readBrowserlessStateFile(stateFile);
        config = hydrateConfigFromState(config, persisted);
        logStore.append('runner', 'login-point-learned', {
          point: learned.loginPoint,
          bootstrapRunId: bootstrap.runId || ''
        });
      } else {
        const result = { ok: false, mode: config.controlMode || 'read-only', reason: 'login-point-bootstrap-failed', canary: bootstrap };
        updateState({
          runner: {
            running: !config.once,
            mode: config.controlMode || 'read-only',
            lastRun: result,
            lastError: result.reason
          },
          probes: {
            lastReadOnlyProbe: bootstrap
          }
        }, { updatedAt: new Date(now()).toISOString() });
        logStore.append('runner', 'runner-bootstrap-failed', result);
        const stopped = await waitForLoopPlan(browserlessLoopPlan(result, config), result);
        if (stopped) return stopped;
        continue;
      }
    }
    let canary;
    let stateBeforeCanary = null;
    try {
      stateBeforeCanary = readBrowserlessStateFile(stateFile);
      const activeTransportRecovery = normalizeTransportRecovery(
        stateBeforeCanary?.runner?.transportRecovery,
        now(),
        config
      );
      const transportRecoveryEscalation = activeTransportRecovery?.expired === true
        ? activeTransportRecovery
        : null;
      const preLoginUpdatedAt = new Date(now()).toISOString();
      const preLoginPatch = {
        runner: { currentAction: preLoginSnapshotSafetyAction(stateBeforeCanary) }
      };
      stateBeforeCanary = updateState(preLoginPatch, { updatedAt: preLoginUpdatedAt });
      liveState = mergeLiveState(stateBeforeCanary, { ...preLoginPatch, updatedAt: preLoginUpdatedAt });
      activeRunKillConfirmations = [];
      const bypassPreLoginSafetyReason = isFirstBrowserlessLoginOfDay(stateBeforeCanary, now())
        ? 'daily-first-login-invulnerability'
        : '';
      const precheckedSnapshotSafety = bypassPreLoginSafetyReason ? null : preparedSnapshotSafety;
      let loginSnapshotPayload = bypassPreLoginSafetyReason ? null : preparedSnapshotPayload;
      preparedSnapshotSafety = null;
      preparedSnapshotPayload = null;
      if (!bypassPreLoginSafetyReason) {
        markSourceIpSnapshotWait('source-ip-snapshot-safety-wait');
      }
      const observeLoginSnapshotPayload = (payload, detail = {}) => {
        const result = observeSnapshotPayload(payload, detail);
        const carried = snapshotCarryRecord(payload, detail);
        if (carried) loginSnapshotPayload = carried;
        return result;
      };
      const publishDecisionLiveState = decision => {
        const currentBeforeDecision = liveState || stateBeforeCanary;
        const decisionPatch = decisionStatePatch(decision);
        const stats = browserlessStatsForDecision(currentBeforeDecision, decision, {
          nowMs: now(),
          assumeNormalized: true
        });
        patchLiveState({
          ...decisionPatch,
          current: {
            ...(decisionPatch.current || {}),
            battlePresentation: browserlessBattlePresentation(
              currentBeforeDecision.current?.battlePresentation,
              decision
            )
          }
        }, {
          updatedAt: new Date(now()).toISOString()
        });
        liveState.stats = stats;
      };
      canary = await readOnlyCanary(config, {
        logStore,
        combatBattleLog,
        now,
        persistedState: stateBeforeCanary,
        safetyController,
        easyKillPlayerTracker,
        combatCompletionTracker,
        damagePlayerTracker,
        dynamicWhitelist,
        bypassPreLoginSafetyReason,
        precheckedSnapshotSafety,
        transportRecoveryEscalation,
        onSnapshotSafety: recordSnapshotSafetyProgress,
        onSnapshotPayload: observeLoginSnapshotPayload,
        onSnapshotAuditPayload: recordSnapshotAudit,
        getRemoteProfitContext: remoteProfitContext,
        onRemoteProfitDecision: decision => remoteProfitWorker?.observeDecision?.(decision),
        onRemoteProfitRealtime: entities => remoteProfitWorker?.observeRealtimeEntities?.(entities),
        onRemoteProfitWhitelist: ids => { remoteProfitStaticWhitelistIds = ids.slice(0, 128); },
        onSnapshotEdge: recordSnapshotEdgeProgress,
        fetchWithTimeout: sourceIpController.fetchWithTimeout,
        snapshotRequest: snapshotRequestScheduler.request,
        openBrowserlessWs: sourceIpController.openBrowserlessWs,
        onLoginTransportAttempt: markSourceIpLoginAttempt,
        onLoginSuccess: entry => {
          mapTrailTracker.clear();
          markSourceIpLoginSuccess(entry);
          beginGameplaySnapshotSession(entry, loginSnapshotPayload);
        },
        onMapTrailRealtime: observeMapTrailRealtime,
        onTransportOpen,
        onTransportClose,
        onTransportHealth: transportHealth => {
          patchLiveState({
            network: { transportHealth }
          }, {
            updatedAt: new Date(now()).toISOString()
          });
        },
        leaveWithVerificationFallback: sourceIpController.leaveWithVerification,
        restartDrainCoordinator: restartDrain,
        onRestartDrainStatus: status => publishRestartDrainStatus(status),
        useDecisionWorker: deps.useDecisionWorker !== false,
        useRealtimeControlWorker: deps.useRealtimeControlWorker !== false,
        onDecision: decision => publishDecisionLiveState(decision),
        onCombatControl: decision => publishDecisionLiveState(decision),
        deferCombatControlStatus: true,
        onAction: (action, context = {}) => {
          const currentBeforeAction = liveState || stateBeforeCanary;
          const actionSnapshot = {
            ...(action || {}),
            actionState: context.actionState || null
          };
          liveState = mergeLiveActionState(currentBeforeAction, actionSnapshot, {
            updatedAt: new Date(now()).toISOString(),
            battlePresentation: browserlessBattlePresentationAfterAction(
              currentBeforeAction.current?.battlePresentation,
              action,
              context
            )
          });
        }
      });
    } catch (err) {
      recordSupervisorError(err, { operation: 'canary' });
      canary = buildRunnerErrorCanary(err, config, { now });
      logStore.append('runner', 'runner-canary-error', canary);
    }
    endGameplaySnapshotSession(canary?.reason || canary?.error || 'canary-finish');
    // Finalize any still-open per-battle log when the canary run ends so the
    // last engagement is compressed and indexed before the next loop/session.
    try {
      combatBattleLog.flush('canary-finish');
    } catch (err) {
      recordSupervisorError(err, { operation: 'combat-battle-log-flush' });
    }
    const { finalSelf, loginPoint: learnedLoginPoint } = learnedLoginPointFromCanary(canary);
    const previousPendingExit = stateBeforeCanary?.runner?.pendingExit || null;
    const snapshotClearedPendingExit = canary?.recovery?.pendingExitResolution === 'fresh-snapshot-self-absent';
    const nextPendingExit = snapshotClearedPendingExit
      ? null
      : pendingExitFromCanary(previousPendingExit, canary, now(), {
          maximumAgeMs: config.pendingExitPersistMaxMs
        });
    if (canary && typeof canary === 'object') canary.pendingExit = nextPendingExit;
    const result = {
      ok: Boolean(canary?.ok),
      mode: nextPendingExit ? 'exit-recovery' : (config.controlMode || 'read-only'),
      canary: canary || null
    };
    if (runnerResultConfirmedLeave(result)) mapTrailTracker.clear();
    const sourceIpPreflightStateAfterCanary = readBrowserlessStateFile(stateFile);
    const sourceIpPreflightAfterCanary = normalizeSourceIpPreflight(
      sourceIpPreflightStateAfterCanary.network?.sourceIpPreflight,
      Object.keys(sourceIpPreflightStateAfterCanary.network?.sourceIpRisk || {}).length
    );
    const sourceIpLoginAttempted = sourceIpPreflightAfterCanary.phase === 'login-attempt';
    const sourceIpLoginSucceeded = Boolean(canary?.entry?.firstSelf);
    if (sourceIpLoginSucceeded) {
      markSourceIpLoginSuccess(canary);
    }
    if (runnerResultConfirmedLeave(result)) {
      clearSourceIpLifecycle({
        sourceIpPreflight: {
          ...sourceIpPreflightAfterCanary,
          phase: 'consumed',
          reason: 'source-ip-lifecycle-consumed-after-leave',
          completedAt: new Date(now()).toISOString(),
          deferredForNextLoginPoint: false,
          reuseWithoutRetest: false,
          nextRetryAt: ''
        },
        reason: 'source-ip-lifecycle-consumed-after-leave'
      });
    } else if (!sourceIpLoginSucceeded &&
      sourceIpLoginAttempted
      && !nextPendingExit
      && !canary?.recovery?.exitRecovery
      && canary?.snapshotSafety?.ok !== false
    ) {
      markSourceIpLoginFailure(canary?.error || 'source-ip-login-failed', canary);
    }
    const finalDecisionPatch = canary?.decisions?.last ? decisionStatePatch(canary.decisions.last) : {};
    const safetyEvents = [canary?.safety?.event, canary?.safety?.leaveFailure]
      .filter(Boolean)
      .map(event => reconcileBrowserlessExitKillEvidence({
        ...event,
        runId: event.runId || canary?.runId || ''
      }, activeRunKillConfirmations));
    const currentStateBeforeFinish = readBrowserlessStateFile(stateFile);
    const finalStateBase = liveState || currentStateBeforeFinish;
    const activeTransportRecovery = normalizeTransportRecovery(
      finalStateBase?.runner?.transportRecovery,
      now(),
      config
    );
    const transportRecoveryRecovered = Boolean(
      activeTransportRecovery
        && canary?.entry?.firstSelf
        && !canary?.safety?.event?.shouldLeave
    );
    const priorExitRecoveryOutcomes = Array.isArray(finalStateBase?.runner?.exitRecoveryOutcomes)
      ? finalStateBase.runner.exitRecoveryOutcomes
      : [];
    const currentExitRecoveryOutcomes = Array.isArray(canary?.recovery?.exitOutcomes)
      ? canary.recovery.exitOutcomes
      : [];
    const confirmedAbsentExitRecoveryOutcome = currentExitRecoveryOutcomes.find(item => (
      String(item?.outcome || '') === 'confirmed-absent'
        && String(item?.exitAttemptId || '')
    ));
    const persistedLoginRecoveryAssociation = normalizePendingLoginRecovery(
      finalStateBase?.runner?.pendingLoginRecovery
    );
    const newlyConfirmedLoginRecoveryAssociation = sourceIpLoginSucceeded
      ? null
      : armLoginRecoveryAssociation(
          confirmedAbsentExitRecoveryOutcome,
          canary?.completedAt || new Date(now()).toISOString()
        );
    const finalPendingLoginRecovery = newlyConfirmedLoginRecoveryAssociation
      || persistedLoginRecoveryAssociation;
    const exitRecoveryOutcomes = Array.from(new Map([
      ...priorExitRecoveryOutcomes,
      ...currentExitRecoveryOutcomes
    ].filter(item => item?.exitAttemptId).map(item => [String(item.exitAttemptId), item])).values()).slice(-64);
    const finalLastKnown = finalLastKnownFromCanary(finalStateBase.lastKnown, finalSelf, canary, now());
    const completedLoginPointSafety = canary?.snapshotSafety
      && typeof canary.snapshotSafety === 'object'
      && canary.snapshotSafety.snapshotPurpose !== 'exit-recovery-confirmation'
      ? loginPointSafetyPatchFromSnapshot(canary.snapshotSafety)
      : null;
    const finalState = mergeState(finalStateBase, {
      ...finalDecisionPatch,
      ...(safetyEvents.length ? {
        recentExits: [...(finalStateBase.recentExits || []), ...safetyEvents].slice(-20)
      } : {}),
      runner: {
        ...(finalDecisionPatch.runner || {}),
        running: !config.once,
        mode: nextPendingExit ? 'exit-recovery' : (config.controlMode || 'read-only'),
        pendingExit: nextPendingExit,
        transportRecovery: (transportRecoveryRecovered || canary?.safety?.event?.reason === 'transport-recovery-deadline-leave')
          ? null
          : activeTransportRecovery,
        connectionFailure: canary?.connectionFailure || null,
        exitRecoveryOutcomes,
        pendingLoginRecovery: finalPendingLoginRecovery,
        lastRun: result,
        lastError: result.ok ? '' : (canary?.error || 'read-only-canary-failed')
      },
      ...(finalLastKnown ? { lastKnown: finalLastKnown } : {}),
      ...(finalSelf ? {
        current: {
          ...(finalDecisionPatch.current || {}),
          self: finalSelf
        }
      } : {}),
      ...(completedLoginPointSafety ? {
        loginPointSafety: {
          ...completedLoginPointSafety,
          ...(learnedLoginPoint ? {
            point: learnedLoginPoint,
            checkedAt: canary?.snapshotSafety?.checkedAt || canary?.completedAt || new Date(now()).toISOString()
          } : {})
        },
      } : learnedLoginPoint ? {
        loginPointSafety: {
          ok: false,
          reason: 'learned-from-canary-self',
          point: learnedLoginPoint,
          checkedAt: canary?.completedAt || new Date(now()).toISOString()
        }
      } : {}),
      probes: {
        lastReadOnlyProbe: canary || null
      }
    });
    finalState.updatedAt = new Date(now()).toISOString();
    if (pendingDeferredLoginSuccessStateWrites.length) {
      const deferredResults = await Promise.all(pendingDeferredLoginSuccessStateWrites.splice(0));
      for (const deferredResult of deferredResults) {
        if (deferredResult?.ok) continue;
        const err = deferredResult?.error || new Error('deferred login-success state patch failed');
        recordSupervisorError(err, {
          operation: 'deferred-login-success-state-patch',
          generation: deferredResult?.generation || 0
        });
        logStore.append('runner', 'login-success-state-patch-error', {
          generation: deferredResult?.generation || 0,
          persistence: 'deferred-main-thread',
          error: errorMessage(err)
        });
      }
    }
    if (liveStatePersistencePending && backgroundIo?.flush) {
      try {
        const flushResult = await backgroundIo.flush();
        for (const patch of pendingLoginSuccessStatePatches) {
          if (patch.persistence !== 'background-worker') continue;
          patch.persisted = Boolean(
            flushResult?.ok !== false
              && Number(flushResult?.pending || 0) === 0
              && Number(flushResult?.operationErrorCount || 0) === patch.backgroundOperationErrorCount
          );
        }
      } catch (err) {
        recordSupervisorError(err, { operation: 'live-state-persistence-flush' });
        logStore.append('runner', 'live-state-persistence-flush-error', { error: errorMessage(err) });
      }
      liveStatePersistencePending = false;
    }
    const writtenFinalState = writeState(finalState);
    const finalLastLoginAt = String(writtenFinalState?.runner?.lastLoginAt || '');
    const ackAtMs = now();
    for (const patch of pendingLoginSuccessStatePatches.splice(0)) {
      if (!patch.persisted && finalLastLoginAt === patch.loginAt) patch.persisted = true;
      if (patch.persisted) {
        logStore.append('runner', 'login-success-state-patch-ack', {
          generation: patch.generation,
          loginAt: patch.loginAt,
          recoveredFromExitAttemptId: patch.recoveredFromExitAttemptId,
          patchBytes: patch.patchBytes,
          persistence: patch.persistence,
          queueDelayMs: Math.max(0, ackAtMs - patch.queuedAtMs),
          persisted: true
        });
      } else {
        logStore.append('runner', 'login-success-state-patch-error', {
          generation: patch.generation,
          loginAt: patch.loginAt,
          recoveredFromExitAttemptId: patch.recoveredFromExitAttemptId,
          persistence: patch.persistence,
          error: 'login-success state patch was not confirmed on disk'
        });
      }
    }
    liveState = null;
    logStore.append('runner', result.ok ? 'runner-finish' : 'runner-stop', summarizeBrowserlessRunnerResult(result));
    if (transportRecoveryRecovered) {
      logStore.append('runner', 'transport-recovery-recovered', {
        recoveryId: activeTransportRecovery.recoveryId,
        sourceRunId: activeTransportRecovery.sourceRunId,
        elapsedMs: Math.max(0, now() - activeTransportRecovery.startedAtMs),
        wsReopenLatencyMs: Math.max(0, now() - activeTransportRecovery.startedAtMs),
        lastRealtimeTick: latestRealtimeTickFromResult({ canary })
      });
    } else if (activeTransportRecovery?.expired && canary?.safety?.event?.reason === 'transport-recovery-deadline-leave') {
      logStore.append('runner', 'transport-recovery-escalated', {
        recoveryId: activeTransportRecovery.recoveryId,
        sourceRunId: activeTransportRecovery.sourceRunId,
        reason: 'deadline-verified-leave',
        elapsedMs: Math.max(0, now() - activeTransportRecovery.startedAtMs),
        exitAttemptId: canary?.safety?.leavePending?.exitAttemptId || nextPendingExit?.exitAttemptId || ''
      });
    }

    const loopPlan = browserlessLoopPlan(result, config);
    const stopped = await waitForLoopPlan(loopPlan, result);
    if (stopped) return stopped;
  }
  } finally {
    try {
      if (closeRuntimeHandlesOnReturn) {
        try {
          snapshotGapPoller?.stop?.();
        } catch (err) {
          recordSupervisorError(err, { operation: 'snapshot-gap-poller-stop' });
        }
        try {
          await closeBrowserlessStatusHandle(statusHandle);
        } catch (err) {
          recordSupervisorError(err, { operation: 'status-server-close' });
        }
      }
      try {
        await remoteProfitWorker?.close?.();
      } catch (err) {
        recordSupervisorError(err, { operation: 'remote-profit-worker-close' });
      }
      if (ownsStatusRenderIo) await statusRenderIo.close({ timeoutMs: STATUS_IO_CLOSE_TIMEOUT_MS });
      if (ownsBackgroundIo) await backgroundIo.close({ timeoutMs: BACKGROUND_IO_CLOSE_TIMEOUT_MS });
    } finally {
      if (publishBackgroundIo) {
        try {
          publishBackgroundIo(null);
        } catch (_) {}
      }
      if (publishLiveState) {
        try {
          publishLiveState(null);
        } catch (_) {}
      }
      if (publishLifecycleControl) {
        try {
          publishLifecycleControl(null);
        } catch (_) {}
      }
    }
  }
}

function encodeBrowserlessSelfTestFrame(value) {
  return Buffer.concat([
    Buffer.from('GRZ1', 'ascii'),
    Buffer.from([1]),
    zlib.gzipSync(Buffer.from(JSON.stringify(value), 'utf8'))
  ]);
}

function currentMainThreadCpuMs() {
  try {
    const text = fs.readFileSync(`/proc/self/task/${process.pid}/schedstat`, 'utf8').trim();
    const runtimeNs = Number(text.split(/\s+/)[0]);
    return Number.isFinite(runtimeNs) ? runtimeNs / 1e6 : null;
  } catch (_) {
    return null;
  }
}

function complexCombatSelfTestFrames(userId = 7, frameCount = 48) {
  const passiveCount = 68;
  const snapshotCoins = Array.from({ length: 88 }, (_, index) => ({
    drop_id: 5000 + index,
    x: 2000 + (index % 11) * 3600,
    y: 1500 + Math.floor(index / 11) * 4200,
    amount: index % 17 === 0 ? 10 : 1
  }));
  const frameAt = index => {
    const tick = 500000 + index;
    const self = {
      entity_id: 1,
      user_id: userId,
      name: 'self-test-self',
      x: index * 20,
      y: index % 4 < 2 ? 0 : 20,
      vx: 20,
      vy: index % 4 < 2 ? 0 : 20,
      hp: 82,
      max_hp: 100,
      current_join_mode: 'Active',
      stamina_5s_remaining_milli: 6400,
      stamina_5s_limit_milli: 10000,
      stamina_1h_remaining_milli: 2400000,
      stamina_1h_limit_milli: 3000000,
      stamina_1d_remaining_milli: 16000000,
      stamina_1d_limit_milli: 20000000,
      death_drop_coins: 900
    };
    const activeTargets = Array.from({ length: 8 }, (_, targetIndex) => {
      const primary = targetIndex === 0;
      const direction = (index + targetIndex) % 6 < 3 ? -1 : 1;
      return {
        entity_id: 10 + targetIndex,
        user_id: 20 + targetIndex,
        name: primary ? 'complex-primary' : `complex-active-${targetIndex}`,
        x: 6500 + targetIndex * 900 + direction * index * 15,
        y: 800 + targetIndex * 550 + direction * index * 10,
        vx: direction * 35,
        vy: direction * 25,
        hp: primary ? 68 : 90 - targetIndex,
        max_hp: 100,
        current_join_mode: 'Active',
        firing: primary || targetIndex < 4,
        stamina_5s_remaining_milli: 4200 + targetIndex * 250,
        stamina_5s_limit_milli: 10000,
        death_drop_coins: primary ? 1800 : 80 + targetIndex * 10
      };
    });
    const passives = Array.from({ length: passiveCount }, (_, passiveIndex) => {
      const angle = passiveIndex / passiveCount * Math.PI * 2;
      const distance = 18000 + passiveIndex * 450;
      return {
        entity_id: 100 + passiveIndex,
        user_id: 1000 + passiveIndex,
        name: `complex-passive-${passiveIndex}`,
        x: Math.round(self.x + Math.cos(angle) * distance),
        y: Math.round(self.y + Math.sin(angle) * distance),
        vx: 0,
        vy: 0,
        hp: 100,
        max_hp: 100,
        current_join_mode: 'Passive',
        stamina_5s_remaining_milli: 10000,
        stamina_5s_limit_milli: 10000,
        death_drop_coins: passiveIndex % 5
      };
    });
    const bullets = activeTargets.slice(0, 6).map((target, bulletIndex) => ({
      bullet_id: index * 10 + bulletIndex + 1,
      owner_user_id: target.user_id,
      start_x: target.x,
      start_y: target.y,
      target_x: self.x,
      target_y: self.y,
      range_cm: 15000,
      speed_per_tick: 500,
      created_tick: tick - 2,
      expire_tick: tick + 28
    }));
    return { tick, self, entities: [self, ...activeTargets, ...passives], bullets };
  };
  const first = frameAt(0);
  const frames = [encodeBrowserlessSelfTestFrame({
    type: 'snapshot',
    tick: first.tick,
    entities: first.entities,
    bullets: first.bullets,
    coin_drops: snapshotCoins,
    messages: []
  })];
  for (let index = 1; index < frameCount; index += 1) {
    const frame = frameAt(index);
    frames.push(encodeBrowserlessSelfTestFrame({
      type: 'pos',
      tick: frame.tick,
      entities: frame.entities,
      bullets: frame.bullets
    }));
  }
  return frames;
}

async function runComplexCombatMainThreadBudgetSelfTest(tmp) {
  const frames = complexCombatSelfTestFrames();
  let nowMs = Date.UTC(2026, 6, 15, 9, 0, 0);
  let frameIndex = 0;
  let receiveFrame = null;
  let transportOpen = true;
  const frameCpuDurations = [];
  const backgroundIo = createBrowserlessBackgroundIo();
  const logStore = createLocalLogStore({
    logDir: path.join(tmp, 'frame-budget-logs'),
    now: () => nowMs,
    backgroundIo
  });
  const combatBattleLog = createCombatBattleLog({
    logDir: path.join(tmp, 'frame-budget-logs'),
    now: () => nowMs,
    backgroundIo
  });
  const targetWhitelist = {
    names: [],
    userIds: [],
    nameSet: new Set(),
    userIdSet: new Set(),
    refresh: async () => ({ loaded: true, count: 0 }),
    isWhitelistedTarget: () => false
  };
  try {
    const result = await runReadOnlyCanary({
      gameOrigin: 'https://self-test.invalid',
      userId: 7,
      sessionToken: 'complex-combat-self-test-token',
      readOnly: false,
      controlMode: 'profit-live',
      combatEnabled: true,
      readOnlyProbeMs: 3000,
      decisionIntervalMs: 1000,
      combatControlIntervalMs: 50,
      movementCommandIntervalMs: 500,
      frameGapAlertMs: 5000,
      wsTraceEnabled: true,
      wsTracePayload: false
    }, {
      now: () => nowMs,
      sleep: async ms => {
        const deadline = nowMs + Number(ms || 0);
        while (receiveFrame && frameIndex < frames.length && nowMs + 50 <= deadline) {
          nowMs += 50;
          const wallStarted = performance.now();
          const cpuStarted = currentMainThreadCpuMs();
          receiveFrame(frames[frameIndex]);
          const cpuFinished = currentMainThreadCpuMs();
          frameCpuDurations.push(
            cpuStarted !== null && cpuFinished !== null
              ? Math.max(0, cpuFinished - cpuStarted)
              : performance.now() - wallStarted
          );
          frameIndex += 1;
          await new Promise(resolve => setImmediate(resolve));
        }
        nowMs = deadline;
        await new Promise(resolve => setImmediate(resolve));
      },
      logStore,
      combatBattleLog,
      mainThreadBudgetMs: SELF_TEST_MAIN_THREAD_BUDGET_MS,
      wsFrameCoalescing: true,
      useDecisionWorker: true,
      useRealtimeControlWorker: false,
      targetWhitelist,
      precheckedSnapshotSafety: { ok: true, reason: 'self-test-prechecked', satisfied: true },
      persistedState: {
        loginPointSafety: { point: { x: 0, y: 0, hp: 100, source: 'self-test' } }
      },
      openBrowserlessWs: async options => {
        receiveFrame = options.onMessage;
        return {
          isOpen: () => transportOpen,
          close() { transportOpen = false; },
          sendVelocity() {},
          sendShoot() {}
        };
      },
      leaveWithVerification: async () => ({ ok: true, attempts: [{ ok: true }] })
    });
    await backgroundIo.flush();
    const ingressTiming = result.hotPath?.tasks?.['ws-message-ingress'] || {};
    const frameTiming = result.hotPath?.tasks?.['ws-message'] || {};
    const maxFrameMs = Number(frameTiming.maxMs || 0);
    const maxIngressWallMs = Number(ingressTiming.maxMs || 0);
    const wallOverBudgetCount = Number(frameTiming.wallOverBudgetCount || 0)
      + Number(ingressTiming.wallOverBudgetCount || 0);
    const measuredFrameCount = Number(frameTiming.count || 0);
    const ingressFrameCount = Number(ingressTiming.count || 0);
    const measuredIngressCpuMs = frameCpuDurations.length ? Math.max(...frameCpuDurations) : Infinity;
    const maxIngressCpuMs = Number.isFinite(Number(ingressTiming.maxCpuMs))
      ? Number(ingressTiming.maxCpuMs)
      : measuredIngressCpuMs;
    const maxProcessingCpuMs = Number.isFinite(Number(frameTiming.maxCpuMs))
      ? Number(frameTiming.maxCpuMs)
      : Infinity;
    const maxFrameCpuMs = Math.max(maxIngressCpuMs, maxProcessingCpuMs);
    const cpuOverBudgetCount = Number(ingressTiming.cpuOverBudgetCount || 0)
      + Number(frameTiming.cpuOverBudgetCount || 0);
    const warmup = result.decisions?.realtimeControlWarmup || null;
    const expectedWorkProfileSource = currentMainThreadCpuMs() === null
      ? null
      : 'linux-main-thread-schedstat';
    const workProfileSource = String(result.hotPath?.maxTask?.workProfile?.cpuUsageSource || '');
    const battleLogStatus = combatBattleLog.status();
    const combatDayDir = logStore.dayDirFor(nowMs);
    const battlesDir = path.join(combatDayDir, 'battles');
    const battleFiles = fs.existsSync(battlesDir)
      ? fs.readdirSync(battlesDir).filter(name => name.endsWith('.jsonl.gz'))
      : [];
    const legacyCombatLogExists = fs.existsSync(path.join(combatDayDir, 'combat.jsonl'));
    const battleIndexExists = fs.existsSync(path.join(battlesDir, 'index.jsonl'));
    const battleLogOk = Boolean(
      battleLogStatus.framesWritten > 0
      && battleFiles.length > 0
      && battleIndexExists
      && !legacyCombatLogExists
    );
    return {
      ok: Boolean(
        result.ok
        && warmup?.ok
        && warmup?.iterations === 6
        && measuredFrameCount >= 40
        && ingressFrameCount >= 40
        && Number(result.decisions?.realtimeControlCount || 0) >= 40
        && Number(result.decisions?.realtimeControlSchedule?.minimumTickStride || 0) === 1
        && frameCpuDurations.length === ingressFrameCount
        && cpuOverBudgetCount === 0
        && maxFrameCpuMs < SELF_TEST_MAIN_THREAD_BUDGET_MS
        && (!expectedWorkProfileSource || workProfileSource === expectedWorkProfileSource)
        && battleLogOk
      ),
      budgetMs: SELF_TEST_MAIN_THREAD_BUDGET_MS,
      frameCount: measuredFrameCount,
      ingressFrameCount,
      realtimeControlCount: Number(result.decisions?.realtimeControlCount || 0),
      maxFrameCpuMs: Math.round(maxFrameCpuMs * 1000) / 1000,
      maxIngressCpuMs: Math.round(maxIngressCpuMs * 1000) / 1000,
      maxProcessingCpuMs: Math.round(maxProcessingCpuMs * 1000) / 1000,
      cpuOverBudgetCount,
      maxFrameWallMs: Math.round(maxFrameMs * 1000) / 1000,
      maxIngressWallMs: Math.round(maxIngressWallMs * 1000) / 1000,
      wallOverBudgetCount,
      timingSource: currentMainThreadCpuMs() === null ? 'performance-now-fallback' : 'linux-main-thread-schedstat',
      workProfileSource,
      battleLogOk,
      battleLog: {
        ...battleLogStatus,
        battleFiles: battleFiles.length,
        indexExists: battleIndexExists,
        legacyCombatLogExists
      },
      warmup,
      maxTask: result.hotPath?.maxTask || null,
      maxCpuTask: result.hotPath?.maxCpuTask || null,
      canaryOk: Boolean(result.ok),
      canaryError: result.error || ''
    };
  } finally {
    await backgroundIo.close();
  }
}

async function runSourceIpPreflightRunnerIntegrationSelfTest(tmp) {
  const buildConfig = (name, options = {}) => {
    const dir = path.join(tmp, `source-ip-runner-${name}`);
    const argv = [
      ...(options.once === false ? [] : ['--once']),
      '--live',
      '--data-dir', dir,
      '--loop-delay-ms', '1000',
      '--user-id', '7',
      '--session-token', 'source-ip-runner-self-test-token',
      '--login-point-x', '1',
      '--login-point-y', '2',
      '--login-point-hp', '100',
      '--source-ip', '10.0.0.250',
      '--source-ips', '10.0.0.250,10.0.0.251,10.0.0.252,10.0.0.253'
    ];
    return parseBrowserlessRunnerArgs(argv, {});
  };
  const successfulCanary = (nowMs, options, runId) => {
    const self = { userId: 7, name: 'self', x: 1, y: 2, hp: 100, drop: 20 };
    options.onLoginTransportAttempt?.();
    options.onLoginSuccess?.({
      runId,
      sourceIp: '',
      firstSelf: self,
      firstSelfAt: new Date(nowMs).toISOString(),
      firstSelfTick: 1
    });
    options.onDecision?.({
      at: new Date(nowMs).toISOString(),
      input: {
        self,
        stamina: { stamina1dRemainingMilli: 20000000, stamina1dLimitMilli: 20000000 },
        selfKillEvidence: []
      }
    });
    return {
      ok: true,
      runId,
      completedAt: new Date(nowMs).toISOString(),
      snapshotSafety: { ok: true, reason: 'safe', satisfied: true },
      entry: { firstSelf: { user_id: 7, x: 1, y: 2, hp: 100 } },
      state: { realtime: { self } }
    };
  };
  const baseDeps = {
    startStatusServer: false,
    disableBackgroundIo: true,
    // Runner integration cases assert lifecycle ordering, not real snapshot
    // transport.  Keep the poller deterministic so a successful fixture
    // cannot leave a 30-second request-rate sleep after --once returns.
    snapshotGapPoller: {
      noteSnapshot() {},
      refreshSchedule() {},
      start() {},
      stop() {},
      status() { return { intervalMs: DEFAULT_SNAPSHOT_GAP_MS, stopped: true }; }
    }
  };

  const immediate = await (async () => {
    const config = buildConfig('immediate');
    let nowMs = Date.UTC(2026, 7, 2, 1, 0, 0);
    let monotonicMs = 0;
    const order = [];
    let canarySourceIp = '';
    let canarySourceIps = [];
    let bypassReason = '';
    let phaseBeforeCanaryReturn = '';
    const snapshotSessionEvents = [];
    const result = await runBrowserlessRunner(config, {
      ...baseDeps,
      now: () => nowMs,
      monotonicNow: () => monotonicMs,
      snapshotGapPoller: {
        noteSnapshot() {},
        refreshSchedule() {},
        start(detail = {}) { snapshotSessionEvents.push({ type: 'start', detail }); },
        stop() { snapshotSessionEvents.push({ type: 'stop' }); },
        status() { return { intervalMs: DEFAULT_SNAPSHOT_GAP_MS, stopped: true }; }
      },
      discoverSourceIps: () => ['10.0.0.12', '10.0.0.10', '10.0.0.9', '10.0.0.11'],
      sourceIpPreflightRequest: async (_origin, ip) => {
        order.push(ip);
        nowMs += 100;
        monotonicMs += 100;
        return { status: 200 };
      },
      runReadOnlyOnce: async (runtimeConfig, options) => {
        order.push('canary');
        canarySourceIp = runtimeConfig.sourceIp;
        canarySourceIps = runtimeConfig.sourceIps.slice();
        bypassReason = options.bypassPreLoginSafetyReason || '';
        const canary = successfulCanary(nowMs, options, 'source-ip-immediate-success');
        phaseBeforeCanaryReturn = readBrowserlessStateFile(stateFilePath(config)).network.sourceIpPreflight.phase;
        return canary;
      }
    });
    const state = readBrowserlessStateFile(stateFilePath(config));
    const logFile = path.join(config.logDir, browserlessDayKey(nowMs), 'runner.jsonl');
    const logText = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '';
    const logSafe = Boolean(
      logText
        && !logText.includes('source-ip-runner-self-test-token')
        && !/\?(?:[^\s"']*token|session|authorization|cookie)/i.test(logText)
    );
    const loginSuccessLogCount = (logText.match(/"type":"source-ip-login-success"/g) || []).length;
    const loginSuccessAckCount = (logText.match(/"type":"login-success-state-patch-ack"/g) || []).length;
    return {
      ok: Boolean(
        result.ok
          && JSON.stringify(order) === JSON.stringify(['10.0.0.9', '10.0.0.10', '10.0.0.11', 'canary'])
          && canarySourceIp === '10.0.0.9'
          && JSON.stringify(canarySourceIps) === JSON.stringify(['10.0.0.9', '10.0.0.10', '10.0.0.11'])
          && JSON.stringify(state.network.lifecycleSourceIps) === JSON.stringify(canarySourceIps)
          && state.network.sourceIpPreflight.phase === 'active'
          && state.runner.lastLoginAt === new Date(nowMs).toISOString()
          && phaseBeforeCanaryReturn === 'login-attempt'
          && loginSuccessLogCount === 1
          && loginSuccessAckCount === 1
          && bypassReason === 'daily-first-login-invulnerability'
          && snapshotSessionEvents.length === 2
          && snapshotSessionEvents[0].type === 'start'
          && snapshotSessionEvents[1].type === 'stop'
          && snapshotSessionEvents[0].detail.immediate === true
          && snapshotSessionEvents[0].detail.snapshotAtMs === 0
          && logSafe
      ),
      order,
      sourceIp: canarySourceIp,
      sourceIps: canarySourceIps,
      phase: state.network.sourceIpPreflight.phase,
      lastLoginAt: state.runner.lastLoginAt,
      phaseBeforeCanaryReturn,
      loginSuccessLogCount,
      loginSuccessAckCount,
      bypassReason,
      snapshotSessionEvents,
      logSafe
    };
  })();

  const preloginSnapshotHandoff = await (async () => {
    const config = buildConfig('prelogin-snapshot-handoff');
    let nowMs = Date.UTC(2026, 7, 2, 1, 30, 0);
    const snapshotObservedAtMs = nowMs - 250;
    updateBrowserlessStateFile(stateFilePath(config), {
      stats: {
        today: { day: browserlessDayKey(nowMs), sessionCount: 1 },
        currentSession: { online: false }
      }
    }, { updatedAt: new Date(nowMs - 60000).toISOString() });
    const snapshotSessionEvents = [];
    const remotePublications = [];
    const remoteResets = [];
    const snapshotGapPoller = {
      noteSnapshot() {},
      refreshSchedule() {},
      start(detail = {}) { snapshotSessionEvents.push({ type: 'start', detail }); },
      stop() { snapshotSessionEvents.push({ type: 'stop' }); },
      status() { return { intervalMs: DEFAULT_SNAPSHOT_GAP_MS, stopped: true }; }
    };
    const remoteProfitWorker = {
      context: () => null,
      observeDecision() {},
      observeRealtimeEntities() {},
      publish(payload) {
        remotePublications.push(payload);
        return Promise.resolve(null);
      },
      reset(reason) { remoteResets.push(reason); return true; },
      status: () => ({ enabled: true }),
      close: async () => ({})
    };
    let bypassReason = '';
    const result = await runBrowserlessRunner(config, {
      ...baseDeps,
      now: () => nowMs,
      snapshotGapPoller,
      remoteProfitWorker,
      discoverSourceIps: () => ['10.0.0.21', '10.0.0.22', '10.0.0.23'],
      sourceIpPreflightRequest: async () => ({ status: 200 }),
      runReadOnlyOnce: async (_runtimeConfig, options) => {
        bypassReason = options.bypassPreLoginSafetyReason || '';
        options.onSnapshotPayload?.({
          tick: 123,
          entities: [{ user_id: 99, x: 1000, y: 0, hp: 50, drop: 500 }]
        }, {
          source: 'prelogin-http',
          observedAtMs: snapshotObservedAtMs
        });
        return successfulCanary(nowMs, options, 'prelogin-snapshot-handoff-success');
      }
    });
    const publication = remotePublications[0] || null;
    return {
      ok: Boolean(
        result.ok
          && bypassReason === ''
          && snapshotSessionEvents.length === 2
          && snapshotSessionEvents[0].type === 'start'
          && snapshotSessionEvents[1].type === 'stop'
          && snapshotSessionEvents[0].detail.immediate === false
          && snapshotSessionEvents[0].detail.snapshotAtMs === snapshotObservedAtMs
          && remotePublications.length === 1
          && publication.source === 'prelogin-http'
          && publication.observedAtMs === snapshotObservedAtMs
          && publication.self?.authority === 'realtime'
          && remoteResets.join(',') === 'gameplay-session-start,gameplay-session-end'
      ),
      bypassReason,
      snapshotSessionEvents,
      remotePublicationCount: remotePublications.length,
      remoteSource: publication?.source || '',
      remoteResets
    };
  })();

  const healthyNoPrecheck = await (async () => {
    const config = buildConfig('healthy-no-precheck');
    const nowMs = Date.UTC(2026, 7, 2, 1, 45, 0);
    updateBrowserlessStateFile(stateFilePath(config), {
      stats: {
        today: { day: browserlessDayKey(nowMs), sessionCount: 1 },
        currentSession: { online: false }
      },
      lastKnown: { hp: 100 }
    }, { updatedAt: new Date(nowMs - 60000).toISOString() });
    const snapshotSessionEvents = [];
    let bypassReason = '';
    let observedPreLoginPayloadCount = 0;
    const result = await runBrowserlessRunner(config, {
      ...baseDeps,
      now: () => nowMs,
      snapshotGapPoller: {
        noteSnapshot() {},
        refreshSchedule() {},
        start(detail = {}) { snapshotSessionEvents.push({ type: 'start', detail }); },
        stop() { snapshotSessionEvents.push({ type: 'stop' }); },
        status() { return { intervalMs: DEFAULT_SNAPSHOT_GAP_MS, stopped: true }; }
      },
      discoverSourceIps: () => ['10.0.0.31', '10.0.0.32', '10.0.0.33'],
      sourceIpPreflightRequest: async () => ({ status: 200 }),
      runReadOnlyOnce: async (_runtimeConfig, options) => {
        bypassReason = options.bypassPreLoginSafetyReason || '';
        const originalObserver = options.onSnapshotPayload;
        options.onSnapshotPayload = (...args) => {
          observedPreLoginPayloadCount += 1;
          return originalObserver?.(...args);
        };
        return successfulCanary(nowMs, options, 'healthy-no-precheck-success');
      }
    });
    return {
      ok: Boolean(
        result.ok
          && config.loginPointHp === 100
          && bypassReason === ''
          && observedPreLoginPayloadCount === 0
          && snapshotSessionEvents.length === 2
          && snapshotSessionEvents[0].type === 'start'
          && snapshotSessionEvents[1].type === 'stop'
          && snapshotSessionEvents[0].detail.immediate === true
          && snapshotSessionEvents[0].detail.snapshotAtMs === 0
      ),
      loginPointHp: config.loginPointHp,
      bypassReason,
      observedPreLoginPayloadCount,
      snapshotSessionEvents
    };
  })();

  const deferredRestartReuse = await (async () => {
    const firstConfig = buildConfig('deferred-restart', { once: false });
    let nowMs = Date.UTC(2026, 7, 2, 2, 0, 0);
    let monotonicMs = 0;
    let firstRequestCount = 0;
    const firstSafety = createBrowserlessSafetyController({ now: () => nowMs });
    const firstResult = await runBrowserlessRunner(firstConfig, {
      ...baseDeps,
      now: () => nowMs,
      monotonicNow: () => monotonicMs,
      safetyController: firstSafety,
      discoverSourceIps: () => ['10.0.0.1', '10.0.0.2', '10.0.0.3'],
      sourceIpPreflightRequest: async () => {
        firstRequestCount += 1;
        nowMs -= 1000;
        monotonicMs += 4000;
        return { status: 200 };
      },
      sleep: async ms => {
        nowMs += Math.max(1, Math.floor(ms / 2));
        firstSafety.requestStop('source-ip-deferred-restart', { source: 'self-test' });
      },
      runReadOnlyOnce: async () => {
        throw new Error('deferred preflight opened canary before the next login point');
      }
    });
    const deferredState = readBrowserlessStateFile(stateFilePath(firstConfig));
    const deferredIps = deferredState.network.lifecycleSourceIps.slice();
    let secondRequestCount = 0;
    let secondDiscoveryCount = 0;
    let bypassReason = '';
    let reusedAtBeforeCanary = '';
    const secondConfig = buildConfig('deferred-restart');
    const secondResult = await runBrowserlessRunner(secondConfig, {
      ...baseDeps,
      now: () => nowMs,
      monotonicNow: () => monotonicMs,
      sleep: async ms => { nowMs += ms; },
      discoverSourceIps: () => {
        secondDiscoveryCount += 1;
        return ['10.0.0.99'];
      },
      sourceIpPreflightRequest: async () => {
        secondRequestCount += 1;
        return { status: 200 };
      },
      runReadOnlyOnce: async (_runtimeConfig, options) => {
        reusedAtBeforeCanary = readBrowserlessStateFile(stateFilePath(secondConfig)).network.sourceIpPreflight.reusedAt || '';
        bypassReason = options.bypassPreLoginSafetyReason || '';
        return successfulCanary(nowMs, options, 'source-ip-deferred-reused-success');
      }
    });
    const reusedState = readBrowserlessStateFile(stateFilePath(secondConfig));
    return {
      ok: Boolean(
        firstResult.reason === 'source-ip-deferred-restart'
          && firstRequestCount === 3
          && deferredState.network.sourceIpPreflight.phase === 'deferred'
          && deferredState.network.sourceIpPreflight.elapsedMs > 10000
          && Date.parse(deferredState.network.sourceIpPreflight.completedAt) < Date.parse(deferredState.network.sourceIpPreflight.startedAt)
          && deferredIps.length === 3
          && secondResult.ok
          && secondRequestCount === 0
          && secondDiscoveryCount === 0
          && reusedState.network.sourceIpPreflight.phase === 'active'
          && reusedAtBeforeCanary
          && JSON.stringify(reusedState.network.lifecycleSourceIps) === JSON.stringify(deferredIps)
          && bypassReason === 'daily-first-login-invulnerability'
      ),
      firstRequestCount,
      secondRequestCount,
      secondDiscoveryCount,
      deferredPhase: deferredState.network.sourceIpPreflight.phase,
      deferredElapsedMs: deferredState.network.sourceIpPreflight.elapsedMs,
      wallClockMovedBackward: Date.parse(deferredState.network.sourceIpPreflight.completedAt) < Date.parse(deferredState.network.sourceIpPreflight.startedAt),
      reusedPhase: reusedState.network.sourceIpPreflight.phase,
      reusedAt: reusedAtBeforeCanary,
      bypassReason
    };
  })();

  const snapshotWaitReuse = await (async () => {
    const config = buildConfig('snapshot-wait', { once: false });
    let nowMs = Date.UTC(2026, 7, 2, 3, 0, 0);
    let monotonicMs = 0;
    let requestCount = 0;
    let canaryCount = 0;
    const bypassReasons = [];
    updateBrowserlessStateFile(stateFilePath(config), {
      stats: {
        today: { day: browserlessDayKey(nowMs), sessionCount: 1 },
        currentSession: { online: false }
      }
    }, { updatedAt: new Date(nowMs).toISOString() });
    const result = await runBrowserlessRunner(config, {
      ...baseDeps,
      now: () => nowMs,
      monotonicNow: () => monotonicMs,
      discoverSourceIps: () => ['10.0.0.21', '10.0.0.22', '10.0.0.23'],
      sourceIpPreflightRequest: async () => {
        requestCount += 1;
        nowMs += 50;
        monotonicMs += 50;
        return { status: 200 };
      },
      sleep: async ms => { nowMs += ms; },
      runReadOnlyOnce: async (_runtimeConfig, options) => {
        canaryCount += 1;
        bypassReasons.push(options.bypassPreLoginSafetyReason || '');
        if (canaryCount === 1) {
          return {
            ok: false,
            runId: 'source-ip-snapshot-wait',
            completedAt: new Date(nowMs).toISOString(),
            error: 'snapshot safety not confirmed: active-near-login-point',
            snapshotSafety: { ok: false, reason: 'active-near-login-point', satisfied: false }
          };
        }
        return {
          ok: false,
          runId: 'source-ip-snapshot-reuse-stop',
          completedAt: new Date(nowMs).toISOString(),
          error: 'explicit-stop',
          snapshotSafety: { ok: true, reason: 'safe', satisfied: true },
          safety: { event: { reason: 'explicit-stop', at: new Date(nowMs).toISOString() } }
        };
      }
    });
    const state = readBrowserlessStateFile(stateFilePath(config));
    return {
      ok: Boolean(
        result.reason === 'explicit-stop'
          && requestCount === 3
          && canaryCount === 2
          && bypassReasons.every(reason => reason === '')
          && state.network.lifecycleSourceIps.length === 3
          && state.network.sourceIpPreflight.reusedAt
      ),
      requestCount,
      canaryCount,
      bypassReasons,
      lifecycleCount: state.network.lifecycleSourceIps.length,
      reusedAt: state.network.sourceIpPreflight.reusedAt
    };
  })();

  const loginFailureRetest = await (async () => {
    const firstConfig = buildConfig('login-failure-retest');
    let nowMs = Date.UTC(2026, 7, 2, 4, 0, 0);
    let monotonicMs = 0;
    let requestCount = 0;
    const bypassReasons = [];
    const discover = () => ['10.0.0.31', '10.0.0.32', '10.0.0.33'];
    const request = async () => {
      requestCount += 1;
      nowMs += 50;
      monotonicMs += 50;
      return { status: 200 };
    };
    await runBrowserlessRunner(firstConfig, {
      ...baseDeps,
      now: () => nowMs,
      monotonicNow: () => monotonicMs,
      discoverSourceIps: discover,
      sourceIpPreflightRequest: request,
      runReadOnlyOnce: async (_runtimeConfig, options) => {
        bypassReasons.push(options.bypassPreLoginSafetyReason || '');
        options.onLoginTransportAttempt?.();
        return {
          ok: false,
          runId: 'source-ip-login-failure',
          completedAt: new Date(nowMs).toISOString(),
          error: 'websocket connect timeout',
          snapshotSafety: { ok: true, reason: 'safe', satisfied: true }
        };
      }
    });
    const failedState = readBrowserlessStateFile(stateFilePath(firstConfig));
    const secondConfig = buildConfig('login-failure-retest');
    const secondResult = await runBrowserlessRunner(secondConfig, {
      ...baseDeps,
      now: () => nowMs,
      monotonicNow: () => monotonicMs,
      discoverSourceIps: discover,
      sourceIpPreflightRequest: request,
      runReadOnlyOnce: async (_runtimeConfig, options) => {
        bypassReasons.push(options.bypassPreLoginSafetyReason || '');
        return successfulCanary(nowMs, options, 'source-ip-login-retest-success');
      }
    });
    const succeededState = readBrowserlessStateFile(stateFilePath(secondConfig));
    return {
      ok: Boolean(
        failedState.network.lifecycleSourceIps.length === 0
          && failedState.network.sourceIps.length === 0
          && failedState.network.sourceIpPreflight.phase === 'login-failed'
          && failedState.stats.today.sessionCount === 0
          && requestCount === 6
          && secondResult.ok
          && bypassReasons.length === 2
          && bypassReasons.every(reason => reason === 'daily-first-login-invulnerability')
          && (succeededState.stats.currentSession.online || succeededState.stats.today.sessionCount === 1)
      ),
      requestCount,
      failedLifecycleCount: failedState.network.lifecycleSourceIps.length,
      failedSourceIpCount: failedState.network.sourceIps.length,
      failedSessionCount: failedState.stats.today.sessionCount,
      succeededSessionCount: succeededState.stats.today.sessionCount,
      succeededSessionOnline: Boolean(succeededState.stats.currentSession.online),
      bypassReasons
    };
  })();

  const insufficientRestartCooldown = await (async () => {
    const firstConfig = buildConfig('insufficient-restart', { once: false });
    let nowMs = Date.UTC(2026, 7, 2, 5, 0, 0);
    let monotonicMs = 0;
    let firstRequestCount = 0;
    const firstSafety = createBrowserlessSafetyController({ now: () => nowMs });
    await runBrowserlessRunner(firstConfig, {
      ...baseDeps,
      now: () => nowMs,
      monotonicNow: () => monotonicMs,
      safetyController: firstSafety,
      discoverSourceIps: () => ['10.0.0.41', '10.0.0.42', '10.0.0.43'],
      sourceIpPreflightRequest: async (_origin, ip) => {
        firstRequestCount += 1;
        nowMs += 100;
        monotonicMs += 100;
        return { status: ip === '10.0.0.43' ? 403 : 200 };
      },
      sleep: async ms => {
        nowMs += Math.max(1, Math.floor(ms / 10));
        firstSafety.requestStop('source-ip-cooldown-restart', { source: 'self-test' });
      },
      runReadOnlyOnce: async () => {
        throw new Error('insufficient preflight opened canary');
      }
    });
    const cooldownState = readBrowserlessStateFile(stateFilePath(firstConfig));
    const originalDeadline = cooldownState.runner.gameplayDeadline?.until || '';
    let secondRequestCount = 0;
    let secondDiscoveryCount = 0;
    const secondSafety = createBrowserlessSafetyController({ now: () => nowMs });
    const secondConfig = buildConfig('insufficient-restart', { once: false });
    const secondResult = await runBrowserlessRunner(secondConfig, {
      ...baseDeps,
      now: () => nowMs,
      monotonicNow: () => monotonicMs,
      safetyController: secondSafety,
      discoverSourceIps: () => {
        secondDiscoveryCount += 1;
        return ['10.0.0.44', '10.0.0.45', '10.0.0.46'];
      },
      sourceIpPreflightRequest: async () => {
        secondRequestCount += 1;
        return { status: 200 };
      },
      sleep: async ms => {
        nowMs += Math.max(1, Math.floor(ms / 10));
        secondSafety.requestStop('source-ip-cooldown-restart-second', { source: 'self-test' });
      },
      runReadOnlyOnce: async () => {
        throw new Error('cooldown restart opened canary');
      }
    });
    const restartedState = readBrowserlessStateFile(stateFilePath(secondConfig));
    return {
      ok: Boolean(
        firstRequestCount === 3
          && cooldownState.network.sourceIpPreflight.phase === 'insufficient'
          && cooldownState.network.sourceIpPreflight.availableCount === 2
          && cooldownState.network.lifecycleSourceIps.length === 0
          && originalDeadline
          && secondResult.reason === 'source-ip-cooldown-restart-second'
          && secondRequestCount === 0
          && secondDiscoveryCount === 0
          && restartedState.runner.gameplayDeadline?.until === originalDeadline
      ),
      firstRequestCount,
      secondRequestCount,
      secondDiscoveryCount,
      availableCount: cooldownState.network.sourceIpPreflight.availableCount,
      originalDeadline,
      restartedDeadline: restartedState.runner.gameplayDeadline?.until || ''
    };
  })();

  const genericFailureGate = await (async () => {
    const config = buildConfig('generic-failure');
    const nowMs = Date.UTC(2026, 7, 2, 6, 0, 0);
    let canaryCount = 0;
    const result = await runBrowserlessRunner(config, {
      ...baseDeps,
      now: () => nowMs,
      discoverSourceIps: () => {
        throw new Error('synthetic interface discovery failure');
      },
      runReadOnlyOnce: async () => {
        canaryCount += 1;
        return { ok: true };
      }
    });
    const state = readBrowserlessStateFile(stateFilePath(config));
    return {
      ok: Boolean(
        !result.ok
          && result.reason === 'source-ip-preflight-error'
          && canaryCount === 0
          && state.network.lifecycleSourceIps.length === 0
          && state.network.sourceIpPreflight.phase === 'error'
      ),
      reason: result.reason,
      canaryCount,
      lifecycleCount: state.network.lifecycleSourceIps.length,
      phase: state.network.sourceIpPreflight.phase
    };
  })();

  const confirmedLeaveClears = await (async () => {
    const config = buildConfig('confirmed-leave');
    let nowMs = Date.UTC(2026, 7, 2, 7, 0, 0);
    let monotonicMs = 0;
    const result = await runBrowserlessRunner(config, {
      ...baseDeps,
      now: () => nowMs,
      monotonicNow: () => monotonicMs,
      discoverSourceIps: () => ['10.0.0.51', '10.0.0.52', '10.0.0.53'],
      sourceIpPreflightRequest: async () => {
        nowMs += 50;
        monotonicMs += 50;
        return { status: 200 };
      },
      runReadOnlyOnce: async (_runtimeConfig, options) => ({
        ...successfulCanary(nowMs, options, 'source-ip-confirmed-leave'),
        leave: { ok: true, attempts: [{ ok: true, status: 200 }] }
      })
    });
    const state = readBrowserlessStateFile(stateFilePath(config));
    return {
      ok: Boolean(
        result.ok
          && state.network.lifecycleSourceIps.length === 0
          && state.network.sourceIps.length === 0
          && state.network.sourceIpPreflight.phase === 'consumed'
      ),
      lifecycleCount: state.network.lifecycleSourceIps.length,
      sourceIpCount: state.network.sourceIps.length,
      phase: state.network.sourceIpPreflight.phase
    };
  })();

  const cachedProbeSelection = await (async () => {
    const config = buildConfig('cached-probe-selection');
    let nowMs = Date.UTC(2026, 7, 2, 8, 0, 0);
    let requestCount = 0;
    let canarySourceIps = [];
    const selectedIps = ['10.0.0.61', '10.0.0.62', '10.0.0.63'];
    const sourceIpProbe = {
      selectSourceIps: discoveredIps => {
        if (JSON.stringify(discoveredIps) !== JSON.stringify(selectedIps)) {
          throw new Error('cached source IP probe received unexpected discovery');
        }
        return {
          ok: true,
          cached: true,
          reason: 'source-ip-probe-selected',
          availableIps: selectedIps.slice(),
          sourceIpPreflight: {
            phase: 'ready',
            reason: 'source-ip-probe-selected',
            queuePhase: 'cached-history',
            completedAt: new Date(nowMs).toISOString(),
            discoveredCount: selectedIps.length,
            ordinaryQueueCount: selectedIps.length,
            availableIps: selectedIps.slice(),
            availableCount: selectedIps.length,
            requiredCount: 3,
            riskCount: 0
          },
          diagnostics: { selectedAt: new Date(nowMs).toISOString(), candidates: [] }
        };
      }
    };
    const result = await runBrowserlessRunner(config, {
      ...baseDeps,
      now: () => nowMs,
      monotonicNow: () => 0,
      sourceIpProbe,
      discoverSourceIps: () => selectedIps.slice(),
      sourceIpPreflightRequest: async () => {
        requestCount += 1;
        throw new Error('cached source IP selection performed an anonymous request');
      },
      runReadOnlyOnce: async (_runtimeConfig, options) => {
        canarySourceIps = _runtimeConfig.sourceIps.slice();
        return successfulCanary(nowMs, options, 'source-ip-cached-selection');
      }
    });
    const state = readBrowserlessStateFile(stateFilePath(config));
    return {
      ok: Boolean(
        result.ok
          && requestCount === 0
          && JSON.stringify(canarySourceIps) === JSON.stringify(selectedIps)
          && JSON.stringify(state.network.lifecycleSourceIps) === JSON.stringify(selectedIps)
          && state.network.sourceIpPreflight.phase === 'active'
      ),
      requestCount,
      canarySourceIps,
      lifecycleSourceIps: state.network.lifecycleSourceIps,
      phase: state.network.sourceIpPreflight.phase
    };
  })();

  return {
    ok: Boolean(
      immediate.ok
        && preloginSnapshotHandoff.ok
        && healthyNoPrecheck.ok
        && deferredRestartReuse.ok
        && snapshotWaitReuse.ok
        && loginFailureRetest.ok
        && insufficientRestartCooldown.ok
        && genericFailureGate.ok
        && confirmedLeaveClears.ok
        && cachedProbeSelection.ok
    ),
    immediate,
    preloginSnapshotHandoff,
    healthyNoPrecheck,
    deferredRestartReuse,
    snapshotWaitReuse,
    loginFailureRetest,
    insufficientRestartCooldown,
    genericFailureGate,
    confirmedLeaveClears,
    cachedProbeSelection
  };
}

async function runLoginSuccessStatePatchPersistenceSelfTest(tmp, testOptions = {}) {
  const dataDir = path.join(tmp, 'login-success-state-patch');
  const config = parseBrowserlessRunnerArgs([
    '--once',
    '--live',
    '--data-dir', dataDir,
    '--loop-delay-ms', '1000',
    '--user-id', '7',
    '--session-token', 'login-success-state-patch-self-test-token',
    '--login-point-x', '1',
    '--login-point-y', '2',
    '--login-point-hp', '100',
    '--source-ip', '10.0.0.70',
    '--source-ips', '10.0.0.70,10.0.0.71,10.0.0.72'
  ], {});
  const stateFile = stateFilePath(config);
  const baseNowMs = Date.UTC(2026, 7, 7, 14, 30, 0);
  const loginCount = Math.max(13, Math.round(Number(testOptions.loginCount || 13)));
  const paddingBytes = Math.max(2 * 1024 * 1024, Math.round(Number(testOptions.paddingBytes || 0)));
  const selectedIps = ['10.0.0.70', '10.0.0.71', '10.0.0.72'];
  const recoveryAttemptId = 'exit:login-success-state-patch-recovery:123:0';
  writeBrowserlessStateFile(stateFile, {
    updatedAt: new Date(baseNowMs - 60000).toISOString(),
    diagnostics: {
      loginSuccessStatePatchPadding: 'x'.repeat(paddingBytes)
    },
    session: {
      userId: 7,
      sessionToken: 'login-success-state-patch-self-test-token'
    },
    runner: {
      lastLoginAt: '',
      pendingLoginRecovery: {
        recoveredFromExitAttemptId: recoveryAttemptId,
        armedAt: new Date(baseNowMs - 30000).toISOString()
      }
    },
    loginPointSafety: {
      ok: true,
      reason: 'self-test-ready',
      point: { x: 1, y: 2, hp: 100, source: 'self-test' },
      checkedAt: new Date(baseNowMs - 60000).toISOString()
    },
    lastKnown: {
      hp: 100,
      x: 1,
      y: 2,
      observedAt: new Date(baseNowMs - 60000).toISOString()
    },
    stats: {
      today: { day: browserlessDayKey(baseNowMs), sessionCount: 1 },
      currentSession: { online: false }
    }
  });
  const initialStateBytes = fs.statSync(stateFile).size;
  const callbackSamples = [];
  const cycleResults = [];
  for (let index = 0; index < loginCount; index += 1) {
    const nowMs = baseNowMs + index * 61000;
    const loginAt = new Date(nowMs).toISOString();
    updateBrowserlessStateFile(stateFile, {
      updatedAt: loginAt,
      stats: {
        today: { day: browserlessDayKey(nowMs), sessionCount: index + 1 },
        currentSession: {
          online: false,
          exitedAt: new Date(nowMs - 1000).toISOString(),
          exitReason: 'login-success-state-patch-self-test-cycle'
        }
      },
      runner: {
        pendingExit: null,
        transportRecovery: null
      },
      network: {
        sourceIp: '',
        sourceIps: [],
        lifecycleSourceIps: [],
        lifecycleSourceIpIndex: 0,
        lifecyclePreparedAt: '',
        sourceIpPreflight: {
          phase: 'idle',
          reason: 'login-success-state-patch-self-test-reset',
          availableIps: [],
          availableCount: 0,
          requiredCount: SOURCE_IP_PREFLIGHT_REQUIRED_COUNT,
          deferredForNextLoginPoint: false,
          reuseWithoutRetest: false
        }
      },
      lastKnown: {
        hp: 100,
        x: 1,
        y: 2,
        observedAt: loginAt
      }
    }, { updatedAt: loginAt });
    const sourceIpProbe = {
      selectSourceIps: () => ({
        ok: true,
        cached: true,
        reason: 'source-ip-probe-selected',
        availableIps: selectedIps.slice(),
        sourceIpPreflight: {
          phase: 'ready',
          reason: 'source-ip-probe-selected',
          queuePhase: 'cached-history',
          completedAt: loginAt,
          discoveredCount: selectedIps.length,
          ordinaryQueueCount: selectedIps.length,
          availableIps: selectedIps.slice(),
          availableCount: selectedIps.length,
          requiredCount: SOURCE_IP_PREFLIGHT_REQUIRED_COUNT,
          riskCount: 0
        },
        diagnostics: { selectedAt: loginAt, candidates: [] }
      })
    };
    let callbackCount = 0;
    const result = await runBrowserlessRunner(config, {
      startStatusServer: false,
      now: () => nowMs,
      monotonicNow: () => index * 61000,
      sourceIpProbe,
      discoverSourceIps: () => selectedIps.slice(),
      sourceIpPreflightRequest: async () => {
        throw new Error('login-success state patch self-test performed an anonymous source-IP request');
      },
      snapshotGapPoller: {
        noteSnapshot() {},
        refreshSchedule() {},
        start() {},
        stop() {},
        status() { return { intervalMs: DEFAULT_SNAPSHOT_GAP_MS, stopped: true }; }
      },
      runReadOnlyOnce: async (_runtimeConfig, options) => {
        const self = { userId: 7, name: 'self', x: 1, y: 2, hp: 100, drop: 20 };
        const runId = `login-success-state-patch-${String(index + 1).padStart(2, '0')}`;
        options.onLoginTransportAttempt?.();
        const cpuStarted = currentMainThreadCpuMs();
        const wallStarted = performance.now();
        options.onLoginSuccess?.({
          runId,
          firstSelf: self,
          firstSelfAt: loginAt,
          firstSelfTick: index + 1
        });
        const wallMs = performance.now() - wallStarted;
        const cpuFinished = currentMainThreadCpuMs();
        const cpuMs = cpuStarted !== null && cpuFinished !== null
          ? Math.max(0, cpuFinished - cpuStarted)
          : wallMs;
        callbackSamples.push({
          cycle: index + 1,
          runId,
          loginAt,
          cpuMs: Number(cpuMs.toFixed(3)),
          wallMs: Number(wallMs.toFixed(3)),
          timingSource: cpuStarted !== null && cpuFinished !== null
            ? 'linux-main-thread-schedstat'
            : 'performance-now-fallback'
        });
        callbackCount += 1;
        options.onDecision?.({
          at: loginAt,
          input: {
            self,
            stamina: { stamina1dRemainingMilli: 20000000, stamina1dLimitMilli: 20000000 },
            selfKillEvidence: []
          }
        });
        return {
          ok: true,
          runId,
          firstSelfAt: loginAt,
          completedAt: loginAt,
          snapshotSafety: { ok: true, reason: 'safe', satisfied: true },
          entry: {
            firstSelf: { user_id: 7, x: 1, y: 2, hp: 100 },
            firstSelfAt: loginAt
          },
          state: { realtime: { self } }
        };
      }
    });
    const persistedAfterCycle = readBrowserlessStateFile(stateFile);
    const expectedRecoveredFromExitAttemptId = index === 0 ? recoveryAttemptId : '';
    cycleResults.push({
      cycle: index + 1,
      ok: Boolean(
        result.ok
          && callbackCount === 1
          && persistedAfterCycle.runner.lastLoginAt === loginAt
          && persistedAfterCycle.runner.recoveredFromExitAttemptId === expectedRecoveredFromExitAttemptId
          && persistedAfterCycle.runner.pendingLoginRecovery === null
      ),
      runnerOk: Boolean(result.ok),
      callbackCount,
      expectedLastLoginAt: loginAt,
      persistedLastLoginAt: persistedAfterCycle.runner.lastLoginAt,
      expectedRecoveredFromExitAttemptId,
      persistedRecoveredFromExitAttemptId: persistedAfterCycle.runner.recoveredFromExitAttemptId,
      pendingLoginRecovery: persistedAfterCycle.runner.pendingLoginRecovery
    });
  }
  const finalLoginAtMs = baseNowMs + (loginCount - 1) * 61000;
  const onlineFinalState = readBrowserlessStateFile(stateFile);
  updateBrowserlessStateFile(stateFile, {
    stats: {
      currentSession: {
        online: false,
        exitedAt: new Date(finalLoginAtMs + 1).toISOString(),
        exitReason: 'login-success-state-patch-restart-gate'
      }
    }
  }, { updatedAt: new Date(finalLoginAtMs + 1).toISOString() });
  const finalState = readBrowserlessStateFile(stateFile);
  const finalStateBytes = fs.statSync(stateFile).size;
  const remainingAt15Seconds = browserlessLoginIntervalDelayPlan(
    finalState,
    config,
    finalLoginAtMs + 15000
  );
  const remainingAt59999 = browserlessLoginIntervalDelayPlan(
    finalState,
    config,
    finalLoginAtMs + 59999
  );
  const expiredAt60Seconds = browserlessLoginIntervalDelayPlan(
    finalState,
    config,
    finalLoginAtMs + 60000
  );
  const onlineTakeover = browserlessLoginIntervalDelayPlan({
    ...onlineFinalState,
    stats: {
      ...onlineFinalState.stats,
      currentSession: { ...onlineFinalState.stats?.currentSession, online: true }
    }
  }, config, finalLoginAtMs + 15000);
  const runnerLog = path.join(config.logDir, browserlessDayKey(finalLoginAtMs), 'runner.jsonl');
  const logRows = fs.existsSync(runnerLog)
    ? fs.readFileSync(runnerLog, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line))
    : [];
  const successRows = logRows.filter(row => row.type === 'source-ip-login-success');
  const ackRows = logRows.filter(row => row.type === 'login-success-state-patch-ack');
  const errorRows = logRows.filter(row => row.type === 'login-success-state-patch-error');
  const cpuViolations = callbackSamples.filter(sample => sample.cpuMs >= SELF_TEST_MAIN_THREAD_BUDGET_MS);
  const maxCpuMs = callbackSamples.length
    ? Math.max(...callbackSamples.map(sample => sample.cpuMs))
    : null;
  const maxWallMs = callbackSamples.length
    ? Math.max(...callbackSamples.map(sample => sample.wallMs))
    : null;
  const maximumPatchBytes = successRows.length
    ? Math.max(...successRows.map(row => Number(row.detail?.statePatch?.patchBytes || 0)))
    : null;
  return {
    ok: Boolean(
      initialStateBytes >= 2 * 1024 * 1024
        && finalStateBytes >= 2 * 1024 * 1024
        && callbackSamples.length === loginCount
        && cpuViolations.length === 0
        && cycleResults.every(item => item.ok)
        && finalState.runner.lastLoginAt === new Date(finalLoginAtMs).toISOString()
        && remainingAt15Seconds?.reason === 'login-interval'
        && remainingAt15Seconds?.delayMs === 45000
        && remainingAt59999?.delayMs === 1
        && expiredAt60Seconds === null
        && onlineTakeover === null
        && successRows.length === loginCount
        && ackRows.length === loginCount
        && errorRows.length === 0
        && successRows[0]?.detail?.recoveredFromExitAttemptId === recoveryAttemptId
        && successRows[0]?.detail?.statePatch?.recoveredFromExitAttemptId === recoveryAttemptId
        && successRows.slice(1).every(row => row.detail?.recoveredFromExitAttemptId === '')
        && successRows.slice(1).every(row => row.detail?.statePatch?.recoveredFromExitAttemptId === '')
        && successRows.every(row => row.detail?.statePatch?.backgroundQueued === true)
        && ackRows.every(row => row.detail?.persistence === 'background-worker')
        && maximumPatchBytes !== null
        && maximumPatchBytes < 8192
    ),
    loginCount,
    initialStateBytes,
    finalStateBytes,
    stateAtLeastTwoMiB: initialStateBytes >= 2 * 1024 * 1024 && finalStateBytes >= 2 * 1024 * 1024,
    timingSource: callbackSamples[0]?.timingSource || '',
    callbackBudgetMs: SELF_TEST_MAIN_THREAD_BUDGET_MS,
    maxCpuMs,
    maxWallMs,
    cpuViolationCount: cpuViolations.length,
    callbackSamples,
    cycleResults,
    finalLastLoginAt: finalState.runner.lastLoginAt,
    recoveryAssociation: {
      attemptId: recoveryAttemptId,
      firstLoginId: successRows[0]?.detail?.recoveredFromExitAttemptId || '',
      laterLoginIds: successRows.slice(1).map(row => row.detail?.recoveredFromExitAttemptId || ''),
      pendingAfterFinalLogin: finalState.runner.pendingLoginRecovery
    },
    intervalGate: {
      remainingAt15SecondsMs: remainingAt15Seconds?.delayMs ?? null,
      remainingAt59999Ms: remainingAt59999?.delayMs ?? null,
      expiredAt60Seconds: expiredAt60Seconds === null,
      onlineTakeoverBypassed: onlineTakeover === null
    },
    persistence: {
      successCount: successRows.length,
      ackCount: ackRows.length,
      errorCount: errorRows.length,
      maximumPatchBytes,
      backgroundQueuedCount: successRows.filter(row => row.detail?.statePatch?.backgroundQueued === true).length,
      backgroundAckCount: ackRows.filter(row => row.detail?.persistence === 'background-worker').length
    },
    runnerLog
  };
}

async function runCriticalLatencyExitRegressionSelfTest() {
  const nowMs = Date.parse('2026-08-02T11:00:00.000Z');
  const state = {
    realtime: {
      tick: 9001,
      receivedAtMs: nowMs,
      frameAgeMs: 0,
      self: { user_id: 7, hp: 3, x: 100, y: 200, vx: 0, vy: 0 },
      entities: [],
      bullets: []
    },
    command: { movement: { timing: { source: 'startup-default' } } }
  };
  const transportHealth = {
    connected: true,
    mode: 'active',
    latency: {
      currentMs: 29600,
      p90Ms: 29600,
      critical: {
        p90Ms: 29600,
        p90ThresholdMs: 5000,
        currentThresholdMs: 10000,
        currentFrameStreak: 2,
        currentFrameThreshold: 3
      }
    },
    exit: {
      hostilePressure: false,
      criticalLatencyTriggered: false,
      latencyTriggered: false,
      frameLossTriggered: false
    }
  };
  const controller = createBrowserlessSafetyController({ now: () => nowMs });
  const incidentEvent = controller.evaluate(state, {
    nowMs,
    transportHealth,
    actionSettlementStall: {
      active: true,
      stalled: true,
      stallMs: 5000,
      noProgressMs: 29600,
      observedFrames: 3
    },
    lastDecision: {
      kind: 'move-to-target',
      band: 'profit',
      action: { kind: 'move-to-target', band: 'profit', reason: 'best-opportunity-coin' }
    }
  });
  const pendingExit = pendingExitFromCanary(null, {
    runId: 'critical-latency-incident',
    startedAt: new Date(nowMs - 29600).toISOString(),
    stats: { frameCount: 4, realtimeFrameCount: 4, selfPresent: { true: 4, false: 0, unknown: 0 } },
    safety: {
      event: incidentEvent,
      leavePending: {
        exitAttemptId: `exit:critical-latency-incident:${nowMs}:0`,
        originalReason: incidentEvent.reason,
        sourceRunId: 'critical-latency-incident',
        startedAtMs: nowMs,
        startHp: 3,
        minHp: 3,
        lastHp: 3,
        httpStatuses: [502],
        requestResultCount: 1
      }
    },
    leave: { ok: false, error: 'HTTP 502', attempts: [{ status: 502 }] }
  }, nowMs);
  let wsOpenAttempts = 0;
  let leaveCalls = 0;
  const recovery = await runReadOnlyCanary({
    controlMode: 'read-only',
    gameOrigin: 'https://example.invalid',
    userId: '7',
    sessionToken: 'critical-latency-test-token',
    readOnlyProbeMs: 1000,
    targetWhitelistUrl: '',
    targetWhitelistFile: ''
  }, {
    now: () => nowMs + 1000,
    persistedState: {
      runner: { pendingExit },
      stats: { currentSession: { online: true } }
    },
    useLeaveSupervisor: false,
    runPreLoginSnapshotSafety: async () => ({
      ok: false,
      reason: 'active-session-present',
      checkedAt: new Date(nowMs + 1000).toISOString(),
      response: {
        summary: {
          valid: true,
          selfPresent: true,
          self: { user_id: 7, hp: 3 },
          freshness: { ok: true }
        }
      }
    }),
    openBrowserlessWs: async () => {
      wsOpenAttempts += 1;
      throw new Error('pending exit opened a forbidden websocket');
    },
    leaveWithVerification: async options => {
      leaveCalls += 1;
      options.onRequest?.({ stage: 'initial', startedAtMs: nowMs + 1000 });
      options.onResult?.({ stage: 'initial', status: 502, ok: false });
      return { ok: false, error: 'HTTP 502', attempts: [{ stage: 'initial', status: 502, ok: false }] };
    }
  });
  const loopPlan = browserlessLoopPlan({
    ok: false,
    canary: {
      ...recovery,
      pendingExit: pendingExitFromCanary(pendingExit, recovery, nowMs + 1000)
    }
  }, { loopDelayMs: 30000 });
  return {
    ok: Boolean(
      incidentEvent.reason === 'realtime-transport-critical-latency'
        && incidentEvent.shouldLeave === true
        && incidentEvent.stopMotion === true
        && incidentEvent.classification === 'exit'
        && incidentEvent.detail?.failureModes?.includes('action-settlement-stalled')
        && pendingExit?.reason === 'realtime-transport-critical-latency'
        && recovery.snapshotSafety?.reason === 'pending-exit-self-present'
        && recovery.recovery?.exitRecovery === true
        && recovery.safety?.event?.shouldLeave === true
        && recovery.safety?.transportLifecycle?.phase === 'suppressed-for-exit-recovery'
        && recovery.leave?.ok === false
        && leaveCalls === 1
        && wsOpenAttempts === 0
        && loopPlan.reason === 'exit-recovery'
    ),
    incidentEvent,
    pendingExit,
    recovery: {
      snapshotReason: recovery.snapshotSafety?.reason || '',
      exitRecovery: Boolean(recovery.recovery?.exitRecovery),
      safetyReason: recovery.safety?.event?.reason || '',
      transportPhase: recovery.safety?.transportLifecycle?.phase || '',
      leaveOk: recovery.leave?.ok === true,
      leaveCalls,
      wsOpenAttempts
    },
    loopPlan: { reason: loopPlan.reason, delayMs: loopPlan.delayMs }
  };
}

async function runPendingExitCanaryGateSelfTest() {
  const nowMs = Date.parse('2026-08-20T00:20:00.000Z');
  const pendingExit = {
    active: true,
    exitAttemptId: 'exit:self-test-pending-canary',
    originalReason: 'leave-not-confirmed',
    reason: 'leave-not-confirmed',
    sourceRunId: 'self-test-previous-canary',
    firstAtMs: nowMs - 30000,
    startedAtMs: nowMs - 30000,
    lastAttemptAtMs: nowMs - 25000,
    attemptCount: 1,
    requestAttemptCount: 1,
    startHp: 100,
    minHp: 100,
    lastHp: 100,
    httpStatuses: [502]
  };
  const snapshotPurposes = [];
  let wsOpenAttempts = 0;
  let normalWsOpenAttempts = 0;
  const baseConfig = {
    controlMode: 'read-only',
    gameOrigin: 'https://example.invalid',
    userId: '7',
    sessionToken: 'pending-exit-canary-self-test-token',
    readOnlyProbeMs: 1000,
    targetWhitelistUrl: '',
    targetWhitelistFile: ''
  };
  const recovery = await runReadOnlyCanary(baseConfig, {
    now: () => nowMs,
    sleep: async () => {},
    persistedState: {
      runner: {
        pendingExit,
        lastLoginAt: new Date(nowMs - 30000).toISOString()
      },
      stats: { currentSession: { online: false } }
    },
    useLeaveSupervisor: false,
    runPreLoginSnapshotSafety: async (_config, _state, deps) => {
      snapshotPurposes.push(String(deps.snapshotPurpose || ''));
      return {
        ok: true,
        reason: 'safe',
        satisfied: true,
        checkedAt: new Date(nowMs).toISOString(),
        response: {
          summary: {
            valid: true,
            selfPresent: false,
            freshness: { ok: true }
          }
        }
      };
    },
    openBrowserlessWs: async () => {
      wsOpenAttempts += 1;
      throw new Error('confirmed-absent pending-exit canary opened websocket');
    }
  });
  const normal = await runReadOnlyCanary(baseConfig, {
    now: () => nowMs,
    sleep: async () => {},
    persistedState: {
      runner: { lastLoginAt: new Date(nowMs - 30000).toISOString() },
      stats: { currentSession: { online: false } }
    },
    useLeaveSupervisor: false,
    runPreLoginSnapshotSafety: async (_config, _state, deps) => {
      snapshotPurposes.push(String(deps.snapshotPurpose || ''));
      return {
        ok: true,
        reason: 'safe',
        satisfied: true,
        checkedAt: new Date(nowMs).toISOString(),
        response: {
          summary: {
            valid: true,
            selfPresent: false,
            freshness: { ok: true }
          }
        }
      };
    },
    openBrowserlessWs: async () => {
      normalWsOpenAttempts += 1;
      throw new Error('normal-login self-test transport stub');
    }
  });
  const cooldown = browserlessLoginIntervalDelayPlan({
    runner: { lastLoginAt: new Date(nowMs - 30000).toISOString() },
    stats: { currentSession: { online: false } }
  }, { loginIntervalMs: 60000 }, nowMs);
  return {
    ok: Boolean(
      recovery.ok
        && recovery.recovery?.recoveryOutcome === 'confirmed-absent'
        && recovery.recovery?.loginGateApplied === false
        && recovery.recovery?.reloginDeferredThisCanary === true
        && recovery.snapshotSafety?.snapshotPurpose === 'exit-recovery-confirmation'
        && recovery.snapshotSafety?.loginGateApplied === false
        && recovery.safety?.transportLifecycle?.phase === 'suppressed-for-exit-recovery'
        && wsOpenAttempts === 0
        && snapshotPurposes[0] === 'exit-recovery-confirmation'
        && snapshotPurposes[1] === 'login-point-safety'
        && normalWsOpenAttempts === 1
        && cooldown?.reason === 'login-interval'
        && cooldown?.delayMs === 30000
    ),
    recovery: {
      ok: Boolean(recovery.ok),
      outcome: recovery.recovery?.recoveryOutcome || '',
      snapshotPurpose: recovery.snapshotSafety?.snapshotPurpose || '',
      loginGateApplied: recovery.snapshotSafety?.loginGateApplied === true,
      reloginDeferredThisCanary: recovery.recovery?.reloginDeferredThisCanary === true,
      transportPhase: recovery.safety?.transportLifecycle?.phase || '',
      wsOpenAttempts
    },
    normal: {
      ok: Boolean(normal.ok),
      snapshotPurpose: snapshotPurposes[1] || '',
      wsOpenAttempts: normalWsOpenAttempts
    },
    cooldown
  };
}

function runSnapshotAuditPersistenceSelfTest(tmp) {
  const atMs = Date.parse('2026-08-20T00:21:00.000Z');
  const auditObserver = createSnapshotAuditObserver({ selfUserId: 7, now: () => atMs });
  const logStore = createLocalLogStore({ logDir: path.join(tmp, 'snapshot-audit-persistence') });
  const payloads = [
    {
      payload: {
        tick: 101,
        entities: [
          { entity_id: 1, user_id: 7, name: 'self', drop: 999 },
          { entity_id: 2, user_id: 8, name: 'drop-200', drop: 200 },
          { entity_id: 3, user_id: 9, name: 'drop-201', drop: 201, hp: 80 },
          { entity_id: 4, name: 'entity-only', drop: 202 },
          { name: 'no-id', drop: 203 }
        ]
      },
      detail: {
        source: 'prelogin-http',
        global: true,
        snapshotKind: 'http',
        snapshotPurpose: 'exit-recovery-confirmation',
        observedAtMs: atMs,
        receivedAtMs: atMs + 5
      }
    },
    {
      payload: {
        tick: 102,
        entities: [{ entity_id: 3, user_id: 9, name: 'drop-201', drop: 205 }]
      },
      detail: {
        source: 'ws',
        global: false,
        snapshotKind: 'ws',
        snapshotPurpose: 'gameplay',
        observedAtMs: atMs + 1000,
        receivedAtMs: atMs + 1000
      }
    }
  ];
  const audits = [];
  for (const item of payloads) {
    const audit = auditObserver.observe(item.payload, item.detail);
    audits.push(audit);
    logStore.append('snapshot-audit', 'snapshot-summary', audit.summary, { atMs: item.detail.observedAtMs });
    for (const observation of audit.observations) {
      logStore.append('snapshot-audit', 'player-observation', observation, { atMs: item.detail.observedAtMs });
    }
  }
  const entries = logStore.readEntries('snapshot-audit', browserlessDayKey(atMs));
  const summaries = entries.filter(entry => entry.type === 'snapshot-summary').map(entry => entry.detail);
  const observations = entries.filter(entry => entry.type === 'player-observation').map(entry => entry.detail);
  return {
    ok: Boolean(
      audits.length === 2
        && entries.length === 5
        && summaries.length === 2
        && observations.length === 3
        && summaries[0]?.completeHttpSnapshot === true
        && summaries[0]?.absenceMeaning === 'complete-global-snapshot-only'
        && summaries[1]?.absenceMeaning === 'presence-only'
        && observations.every(item => item.drop > 200)
        && observations.some(item => item.identityKey === 'user:9' && item.drop === 201)
        && observations.some(item => item.identityKey === 'entity:4' && item.identityStable === false)
        && observations.some(item => item.identityKey === 'user:9' && item.drop === 205)
    ),
    entryCount: entries.length,
    summaryCount: summaries.length,
    observationCount: observations.length,
    observations: observations.map(item => ({ identityKey: item.identityKey, drop: item.drop }))
  };
}

async function runBrowserlessRunnerSelfTest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'grasp-rat-browserless-runner-'));
  try {
    const snapshotAudit = runSnapshotAuditSelfTest();
    const remoteProfitWorker = await runRemoteProfitWorkerSelfTest();
    const remoteProfitAction = runRemoteProfitActionSelfTest();
    const remoteProfitDecision = runRemoteProfitDecisionSelfTest();
    const invulnerableProfitCommitment = runInvulnerableProfitCommitmentSelfTest();
    const afkDynamicFire = runAfkDynamicFireSelfTest();
    const profitMissionArrival = runProfitMissionArrivalSelfTest();
    const invulnerableAfk = runInvulnerableAfkSelfTest();
    const missingEnemyHold = runMissingEnemyHoldSelfTest();
    const activeJoinModeProfit = runActiveJoinModeProfitSelfTest();
    const requestRatePolicy = await runRequestRatePolicySelfTest();
    const requestRateController = await runRequestRateControllerSelfTest();
    const snapshotRequestScheduler = await runSnapshotRequestSchedulerSelfTest();
    const loginPointHighHpExemption = await runLoginPointHighHpExemptionSelfTest();
    const sourceIpProbe = await runSourceIpProbeSelfTest();
    const sourceIpPreflight = await runSourceIpPreflightSelfTest();
    const sourceIpPreflightRunner = await runSourceIpPreflightRunnerIntegrationSelfTest(tmp);
    const loginSuccessStatePatch = await runLoginSuccessStatePatchPersistenceSelfTest(tmp);
    const criticalLatencyExitRegression = await runCriticalLatencyExitRegressionSelfTest();
    const establishedCombatLootPriorityTest = (() => {
      const combat = {
        target: {
          userId: 42,
          alive: true,
          active: true,
          drop: 143,
          easyKillKnown: true,
          combatEngagement: { realtimeHold: true }
        },
        dryRun: { combatPhase: { damageFromStart: 0 } }
      };
      const stateful = {
        combatMetrics: { targetId: '42', acceptedShots: 4, targetDamage: 3 }
      };
      const blocked = establishedCombatLootPriority(combat, { amount: 10 }, stateful);
      const productive = establishedCombatLootPriority({
        target: {
          userId: 42,
          alive: true,
          active: false,
          drop: 276,
          easyKillKnown: false,
          combatEngagement: { realtimeHold: true }
        },
        dryRun: { combatPhase: { damageFromStart: 3 } }
      }, { amount: 40 }, stateful);
      const betterCoin = establishedCombatLootPriority(combat, { amount: 200 }, stateful);
      const selfKillDrop = establishedCombatLootPriority(combat, {
        amount: 10,
        selfKilledPlayerDrop: true
      }, stateful);
      return {
        ok: blocked.blocked === true
          && blocked.reason === 'established-higher-value-combat'
          && productive.blocked === true
          && productive.productiveCombat === true
          && betterCoin.blocked === false
          && betterCoin.reason === 'coin-value-outranks-combat'
          && selfKillDrop.blocked === false
          && selfKillDrop.reason === 'self-kill-drop-protected',
        blocked,
        productive,
        betterCoin,
        selfKillDrop
      };
    })();
    const transportHealth = runTransportHealthSelfTest();
    const textFramePayload = {
      type: 'pos',
      tick: 123456,
      entities: [{ user_id: 7, entity_id: 1, hp: 88, x: 100, y: 200 }],
      bullets: []
    };
    const parsedTextFrame = inspectCanaryFrame(JSON.stringify(textFramePayload), { userId: 7 });
    const parsedBinaryFrame = inspectCanaryFrame(encodeBrowserlessSelfTestFrame(textFramePayload), { userId: 7 });
    const textFrameParsing = {
      ok: Boolean(
        parsedTextFrame.kind === 'text'
          && parsedTextFrame.decodedType === parsedBinaryFrame.decodedType
          && parsedTextFrame.decodedTick === parsedBinaryFrame.decodedTick
          && parsedTextFrame.decodedSummary?.selfPresent === true
          && parsedTextFrame.decodedSummary?.entityCount === parsedBinaryFrame.decodedSummary?.entityCount
          && parsedTextFrame.jsonParseError === undefined
      ),
      text: {
        type: parsedTextFrame.decodedType,
        tick: parsedTextFrame.decodedTick,
        summary: parsedTextFrame.decodedSummary
      },
      binary: {
        type: parsedBinaryFrame.decodedType,
        tick: parsedBinaryFrame.decodedTick,
        summary: parsedBinaryFrame.decodedSummary
      }
    };
    const dryConfig = parseBrowserlessRunnerArgs(['--once', '--dry-run', '--data-dir', tmp], {});
    const dryRun = await runBrowserlessRunner(dryConfig, {
      now: () => Date.UTC(2026, 6, 8, 1, 0, 0),
      disableBackgroundIo: true
    });
    const liveConfig = parseBrowserlessRunnerArgs([
      '--once',
      '--live',
      '--data-dir',
      tmp,
      '--user-id',
      '7',
      '--session-token',
      'self-test-token',
      '--login-point-x',
      '1',
      '--login-point-y',
      '2',
      '--login-point-hp',
      '100'
    ], {});
    updateBrowserlessStateFile(stateFilePath(liveConfig), {
      runner: {
        restartDrain: {
          requested: true,
          reason: 'stale-previous-process',
          requestedAt: '2026-07-08T00:00:00.000Z'
        }
      }
    }, { updatedAt: '2026-07-08T00:00:00.000Z' });
    const liveRun = await runBrowserlessRunner(liveConfig, {
      now: () => Date.UTC(2026, 6, 8, 1, 1, 0),
      disableBackgroundIo: true,
      disableSourceIpPreflight: true,
      runReadOnlyOnce: async () => ({ ok: true, frames: 0, fake: true })
    });
    const snapshotPersistenceDir = path.join(tmp, 'snapshot-persistence');
    const snapshotPersistenceConfig = parseBrowserlessRunnerArgs([
      '--once',
      '--live',
      '--data-dir',
      snapshotPersistenceDir,
      '--user-id',
      '7',
      '--session-token',
      'snapshot-persistence-token',
      '--login-point-x',
      '1',
      '--login-point-y',
      '2',
      '--login-point-hp',
      '100'
    ], {});
    const snapshotPersistenceStartedAt = '2026-08-02T02:30:00.000Z';
    const snapshotPersistenceCheckedAt = '2026-08-02T02:31:00.000Z';
    updateBrowserlessStateFile(stateFilePath(snapshotPersistenceConfig), {
      loginPointSafety: {
        ok: false,
        reason: 'damage-actor-near-login-point',
        checkedAt: snapshotPersistenceStartedAt,
        point: { x: 1, y: 2, hp: 100, source: 'self-test' },
        detail: {
          singleBlockerHold: {
            active: true,
            userId: 8,
            name: 'known-damager',
            firstBlockedAt: snapshotPersistenceStartedAt,
            lastBlockedAt: snapshotPersistenceStartedAt,
            durationMs: 0,
            thresholdMs: 3600000,
            remainingMs: 3600000,
            observationCount: 1,
            fullHp: true,
            pointHp: 100,
            requiredFullHp: 100,
            blockingPlayerCount: 1,
            blockingFactorCount: 1,
            eligible: false,
            bypassedAt: '',
            resetReason: 'new-single-blocker'
          }
        }
      }
    }, { updatedAt: snapshotPersistenceStartedAt });
    let startupHoldSeenByCanary = null;
    await runBrowserlessRunner(snapshotPersistenceConfig, {
      now: () => Date.parse(snapshotPersistenceCheckedAt),
      disableBackgroundIo: true,
      disableSourceIpPreflight: true,
      runReadOnlyOnce: async (_runtimeConfig, options) => {
        startupHoldSeenByCanary = options.persistedState?.loginPointSafety?.detail?.singleBlockerHold || null;
        return {
          ok: false,
          runId: 'snapshot-persistence-self-test',
          startedAt: snapshotPersistenceCheckedAt,
          completedAt: snapshotPersistenceCheckedAt,
          error: 'snapshot safety not confirmed: damage-actor-near-login-point',
          snapshotSafety: {
            ok: false,
            reason: 'damage-actor-near-login-point',
            checkedAt: snapshotPersistenceCheckedAt,
            required: 1,
            streak: 0,
            satisfied: false,
            response: {
              summary: {
                valid: true,
                selfPresent: false,
                tick: 101,
                freshness: { ok: true, reason: 'fresh' },
                safety: {
                  ok: false,
                  reason: 'damage-actor-near-login-point',
                  point: { x: 1, y: 2, hp: 100, source: 'self-test' },
                  singleBlockerHold: {
                    ...startupHoldSeenByCanary,
                    lastBlockedAt: snapshotPersistenceCheckedAt,
                    durationMs: 60000,
                    remainingMs: 3540000,
                    observationCount: 2,
                    resetReason: ''
                  }
                }
              }
            }
          },
          entry: { firstSelf: null },
          state: { realtime: { self: null } },
          decisions: { last: null },
          safety: { event: null, leaveFailure: null }
        };
      }
    });
    const snapshotPersistenceState = readBrowserlessStateFile(stateFilePath(snapshotPersistenceConfig));
    const completedSnapshotSafetyPersisted = {
      ok: Boolean(
        startupHoldSeenByCanary?.firstBlockedAt === snapshotPersistenceStartedAt
          && startupHoldSeenByCanary?.observationCount === 1
          && snapshotPersistenceState.loginPointSafety?.reason === 'damage-actor-near-login-point'
          && snapshotPersistenceState.loginPointSafety?.checkedAt === snapshotPersistenceCheckedAt
          && snapshotPersistenceState.loginPointSafety?.detail?.singleBlockerHold?.firstBlockedAt === snapshotPersistenceStartedAt
          && snapshotPersistenceState.loginPointSafety?.detail?.singleBlockerHold?.observationCount === 2
          && snapshotPersistenceState.loginPointSafety?.detail?.singleBlockerHold?.durationMs === 60000
      ),
      startupHold: startupHoldSeenByCanary,
      persisted: snapshotPersistenceState.loginPointSafety
    };
    const runnerResultSummary = summarizeBrowserlessRunnerResult({
      ok: false,
      mode: 'profit-live',
      canary: {
        runId: 'summary-self-test',
        startedAt: '2026-07-08T01:00:00.000Z',
        completedAt: '2026-07-08T01:01:00.000Z',
        error: 'restart-drain-ready',
        safety: { event: { reason: 'restart-drain-ready', detail: { source: 'restart-drain' } } },
        stats: { frameCount: 100, lastFrameAt: '2026-07-08T01:00:59.000Z', tick: { last: 200 } },
        decisions: { huge: 'x'.repeat(100000) },
        sessionToken: 'summary-secret-token'
      }
    });
    const runnerResultSummaryText = JSON.stringify(runnerResultSummary);
    const runnerResultSummaryOk = Boolean(
      runnerResultSummary.reason === 'restart-drain-ready'
        && runnerResultSummary.runId === 'summary-self-test'
        && runnerResultSummaryText.length < 2048
        && !runnerResultSummaryText.includes('summary-secret-token')
        && !runnerResultSummaryText.includes('"huge"')
    );
    const statusQueueProjection = buildCompactBrowserlessStatus({
      updatedAt: '2026-07-08T01:01:00.000Z',
      statusRender: {
        renderedAt: '2026-07-08T01:00:59.000Z',
        cacheMaxStaleMs: STATUS_COMPACT_MAX_STALE_MS,
        logQueue: { ok: true, pending: 123, pendingRequests: 0, operationErrorCount: 1 },
        renderQueue: { ok: true, pending: 0, pendingRequests: 1, operationErrorCount: 0 }
      }
    }, { statusHost: '127.0.0.1', statusPort: 18767 });
    const statusQueueProjectionOk = Boolean(
      statusQueueProjection.statusServer?.renderTiming?.cacheMaxStaleMs === STATUS_COMPACT_MAX_STALE_MS
        && statusQueueProjection.statusServer?.renderTiming?.logQueue?.pending === 123
        && statusQueueProjection.statusServer?.renderTiming?.renderQueue?.pendingRequests === 1
    );
    const loginPointSingleBlocker = runLoginPointSingleBlockerSelfTest();
    const singleBlockerConfig = parseBrowserlessRunnerArgs([
      '--login-point-single-blocker-bypass-ms',
      '1234'
    ], {});
    const singleBlockerConfigOk = singleBlockerConfig.loginPointSingleBlockerBypassMs === 1234;
    const loginIntervalConfig = parseBrowserlessRunnerArgs([
      '--login-interval-ms', '30000'
    ], {});
    const loginIntervalNowMs = Date.parse('2026-08-07T03:00:30.000Z');
    const loginIntervalState = {
      runner: { lastLoginAt: '2026-08-07T03:00:00.000Z' },
      stats: { currentSession: { online: false } }
    };
    const loginIntervalPlan = browserlessLoginIntervalDelayPlan(
      loginIntervalState,
      loginIntervalConfig,
      loginIntervalNowMs
    );
    const loginIntervalExpired = browserlessLoginIntervalDelayPlan(
      loginIntervalState,
      loginIntervalConfig,
      loginIntervalNowMs + 30000
    );
    const loginIntervalTakeover = browserlessLoginIntervalDelayPlan({
      ...loginIntervalState,
      stats: { currentSession: { online: true } }
    }, loginIntervalConfig, loginIntervalNowMs);
    const loginIntervalSelfTest = {
      ok: Boolean(
        loginIntervalConfig.loginIntervalMs === 60000
          && loginIntervalPlan?.reason === 'login-interval'
          && loginIntervalPlan?.delayMs === 30000
          && loginIntervalPlan?.explicitCooldown === true
          && loginIntervalExpired === null
          && loginIntervalTakeover === null
      ),
      configuredMs: loginIntervalConfig.loginIntervalMs,
      remainingMs: loginIntervalPlan?.delayMs ?? null,
      expired: loginIntervalExpired === null,
      takeoverBypassed: loginIntervalTakeover === null
    };
    const transportHealthConfig = parseBrowserlessRunnerArgs([
      '--transport-health-window-ms', '12000',
      '--transport-health-active-warmup-ms', '1100',
      '--transport-health-active-hold-ms', '2600',
      '--transport-latency-decision-window-ms', '3200',
      '--transport-latency-exit-ms', '2700',
      '--transport-latency-exit-sustain-ms', '2100',
      '--transport-frame-loss-exit-rate', '0.06',
      '--transport-frame-loss-exit-sustain-ms', '2200',
      '--transport-frame-loss-minimum-expected-ticks', '120'
    ], {});
    const transportHealthConfigOk = Boolean(
      transportHealthConfig.transportHealthWindowMs === 12000
        && transportHealthConfig.transportHealthActiveWarmupMs === 1100
        && transportHealthConfig.transportHealthActiveHoldMs === 2600
        && transportHealthConfig.transportLatencyDecisionWindowMs === 3200
        && transportHealthConfig.transportLatencyExitMs === 2700
        && transportHealthConfig.transportLatencyExitSustainMs === 2100
        && transportHealthConfig.transportFrameLossExitRate === 0.06
        && transportHealthConfig.transportFrameLossExitSustainMs === 2200
        && transportHealthConfig.transportFrameLossMinimumExpectedTicks === 120
    );
    const staleRestartDrainCleared = readBrowserlessStateFile(stateFilePath(liveConfig)).runner.restartDrain === null;
    const pendingDeadlineNowMs = Date.parse('2026-07-20T06:00:01.900Z');
    const pendingDeadline = normalizePendingExit({
      active: true,
      reason: 'frame-gap',
      sourceRunId: 'pending-deadline-self-test',
      firstAtMs: pendingDeadlineNowMs - 1900,
      lastAttemptAtMs: pendingDeadlineNowMs - 1900,
      attemptCount: 1,
      requestAttemptCount: 4,
      nextRetryAtMs: pendingDeadlineNowMs + 100,
      lastError: 'HTTP 502'
    }, pendingDeadlineNowMs);
    const pendingLoopPlan = browserlessLoopPlan({
      canary: {
        runId: 'pending-deadline-self-test',
        completedAt: new Date(pendingDeadlineNowMs).toISOString(),
        pendingExit: pendingDeadline,
        safety: { event: { reason: 'frame-gap' } }
      }
    }, { once: false, loopDelayMs: 30000 });
    const pendingPersistedPlan = persistedReconnectDelayPlan({
      runner: {
        pendingExit: pendingDeadline,
        currentAction: {
          reason: 'ordinary-loop-wait',
          nextRunAt: new Date(pendingDeadlineNowMs + 79000).toISOString()
        }
      },
      stats: { currentSession: { online: true } }
    }, { pendingExitPersistMaxMs: 3600000 }, pendingDeadlineNowMs);
    const pendingStaleResolution = pendingExitSnapshotResolution(pendingDeadline, {
      ok: false,
      response: { summary: { selfPresent: false, freshness: { ok: false } } }
    });
    const pendingAbsentResolution = pendingExitSnapshotResolution(pendingDeadline, {
      ok: true,
      response: { summary: { selfPresent: false, freshness: { ok: true } } }
    });
    const pendingDeadlineSelfTest = {
      ok: Boolean(
        pendingLoopPlan.reason === 'exit-recovery'
          && pendingLoopPlan.delayMs === 100
          && pendingPersistedPlan.reason === 'exit-recovery'
          && pendingPersistedPlan.delayMs === 100
          && pendingPersistedPlan.deadlineSource === 'pending-exit'
          && pendingStaleResolution.active
          && !pendingStaleResolution.cleared
          && pendingAbsentResolution.cleared
      ),
      loopDelayMs: pendingLoopPlan.delayMs,
      persistedDelayMs: pendingPersistedPlan.delayMs,
      deadlineSource: pendingPersistedPlan.deadlineSource,
      staleCleared: pendingStaleResolution.cleared,
      freshAbsentCleared: pendingAbsentResolution.cleared
    };
    const wsClosedPlan = browserlessLoopPlan({
      ok: false,
      canary: {
        runId: 'self-test-ws-closed',
        error: 'ws-closed',
        safety: { event: { reason: 'ws-closed' } }
      }
    }, { loopDelayMs: 30000 });
    const transportDegradedPlan = browserlessLoopPlan({
      ok: false,
      canary: {
        runId: 'self-test-transport-degraded',
        error: 'realtime-transport-degraded',
        safety: { event: { reason: 'realtime-transport-degraded' } }
      }
    }, { loopDelayMs: 30000 });
    const combatExitPlan = browserlessLoopPlan({
      ok: false,
      canary: {
        runId: 'self-test-combat-exit',
        error: 'combat-hp-disadvantage-leave',
        safety: { event: { reason: 'combat-hp-disadvantage-leave' } }
      }
    }, { loopDelayMs: 30000 });
    const restartDrainPlan = browserlessLoopPlan({
      ok: false,
      canary: {
        runId: 'self-test-restart-drain',
        error: 'restart-drain-ready',
        safety: { event: { reason: 'restart-drain-ready' } }
      }
    }, { loopDelayMs: 30000 });
    const restartDrainClosesRuntime = browserlessTerminalStopRequestsRuntimeClose({
      canary: { safety: { event: { reason: 'restart-drain-ready', detail: { source: 'restart-drain' } } } }
    }, 'restart-drain-ready');
    const signalForceClosesRuntime = browserlessTerminalStopRequestsRuntimeClose({
      event: { reason: 'explicit-stop', detail: { source: 'signal-force' } }
    }, 'explicit-stop');
    const apiStopKeepsRuntime = browserlessTerminalStopRequestsRuntimeClose({
      event: { reason: 'explicit-stop', detail: { source: 'status-api' } }
    }, 'explicit-stop');
    const legacyRestartDrainExplicitStopClosesRuntime = browserlessTerminalStopRequestsRuntimeClose({
      canary: { safety: { event: { reason: 'explicit-stop', detail: { source: 'restart-drain' } } } }
    }, 'explicit-stop');
    const restartDrainSafetyController = createBrowserlessSafetyController({ now: () => 1000 });
    restartDrainSafetyController.requestStop('restart-drain-ready', { source: 'restart-drain' });
    const restartDrainSafetyReason = restartDrainSafetyController.evaluate({
      realtime: { self: { user_id: 7, hp: 100, x: 0, y: 0 }, frameAgeMs: 0 },
      frameAges: {}
    }, { nowMs: 1000 }).reason;
    let statusCloseResolved = null;
    const statusCloseHandle = {
      close: () => new Promise(resolve => {
        statusCloseResolved = resolve;
      }),
      server: {
        closeAllConnections() {
          statusCloseResolved?.();
        }
      }
    };
    const forcedStatusConnectionsClosed = await closeBrowserlessStatusHandle(statusCloseHandle);
    let drainNowMs = 1000;
    const restartDrain = createRestartDrainCoordinator({ now: () => drainNowMs, idleStableMs: 500 });
    restartDrain.requestDrain('restart-drain', { commitmentKey: 'player:9667' });
    const restartDrainCombat = evaluateRestartReadiness({
      online: true,
      decision: { action: { kind: 'combat-live', band: 'combat', target: { userId: 9667 } } }
    });
    restartDrain.observe(restartDrainCombat);
    const restartDrainIdle = evaluateRestartReadiness({
      online: true,
      decision: { action: { kind: 'coin', band: 'profit', target: { id: 7293, amount: 1 } } }
    });
    const restartDrainUnlinkedPickup = evaluateRestartReadiness({
      online: true,
      commitmentKey: 'player:9667',
      decision: { action: { kind: 'coin', band: 'profit', target: { id: 7293, amount: 1 } } }
    });
    const retainedDrop41Mission = {
      active: true,
      type: 'enemy',
      key: 'enemy:895',
      targetId: '895',
      subjectId: '895',
      highValue: true,
      navigationTarget: { userId: 895, name: 'captured-profit-target', drop: 41 }
    };
    const capturedProfitWait = evaluateRestartReadiness({
      online: true,
      commitmentKey: 'player:895',
      decision: {
        action: { kind: 'wait', band: 'wait', reason: 'restart-drain-new-commitment-blocked' }
      },
      decisionState: { profitMission: retainedDrop41Mission }
    });
    const capturedProfitDefensiveCombat = evaluateRestartReadiness({
      online: true,
      commitmentKey: 'player:895',
      decision: {
        action: {
          kind: 'combat-live',
          band: 'combat',
          target: { userId: 32551, combatIntent: 'defensive', firing: true }
        }
      },
      decisionState: {
        combatTarget: { id: 32551, hp: 100 },
        profitMission: retainedDrop41Mission
      }
    });
    const capturedProfitReleased = evaluateRestartReadiness({
      online: true,
      commitmentKey: 'player:895',
      decision: {
        action: { kind: 'wait', band: 'wait', reason: 'restart-drain-new-commitment-blocked' }
      },
      decisionState: { profitMission: null }
    });
    restartDrain.observe(restartDrainIdle);
    drainNowMs = 1500;
    restartDrain.observe(restartDrainIdle);
    const restartDrainStatus = restartDrain.status();
    const restartDrainOfflineLifecycle = {
      snapshotWait: browserlessRestartDrainStateIsOffline({
        runner: {
          running: true,
          currentAction: { kind: 'source-ip-preflight', reason: 'source-ip-snapshot-safety-wait' }
        },
        network: { sourceIpPreflight: { phase: 'snapshot-wait' } },
        stats: { currentSession: { online: false } }
      }),
      loginAttempt: browserlessRestartDrainStateIsOffline({
        runner: {
          running: true,
          currentAction: { kind: 'source-ip-preflight', reason: 'source-ip-login-websocket-attempt' }
        },
        network: { sourceIpPreflight: { phase: 'login-attempt' } },
        stats: { currentSession: { online: false } }
      }),
      online: browserlessRestartDrainStateIsOffline({
        runner: { running: true, currentAction: { kind: 'loop-wait', reason: 'ws-recovery' } },
        stats: { currentSession: { online: true } }
      }),
      pendingExit: browserlessRestartDrainStateIsOffline({
        runner: {
          running: true,
          currentAction: { kind: 'loop-wait', reason: 'exit-recovery' },
          pendingExit: { active: true, exitAttemptId: 'exit:self-test' }
        },
        stats: { currentSession: { online: false } }
      }),
      transportRecovery: browserlessRestartDrainStateIsOffline({
        runner: {
          running: true,
          currentAction: { kind: 'loop-wait', reason: 'transport-recovery' },
          transportRecovery: { recoveryId: 'transport:self-test' }
        },
        stats: { currentSession: { online: false } }
      })
    };
    const committedDropAllowed = restartDrainAllowsDecision({
      action: {
        kind: 'coin',
        band: 'profit',
        reason: 'post-kill-drop-priority',
        target: {
          id: 'id:299',
          amount: 10,
          sourceUserId: 9667,
          selfKilledPlayerDrop: true
        }
      }
    }, restartDrainStatus);
    const unrelatedDropBlocked = restartDrainAllowsDecision({
      action: {
        kind: 'coin',
        band: 'profit',
        reason: 'post-kill-drop-priority',
        target: {
          id: 'id:300',
          amount: 10,
          sourceUserId: 9555,
          selfKilledPlayerDrop: true
        }
      }
    }, restartDrainStatus);
    const productionFootDropDecision = {
      action: {
        kind: 'coin',
        band: 'profit',
        reason: 'foot-coin-priority',
        target: {
          id: 205,
          amount: 9,
          sourceUserId: 22399,
          selfKilledPlayerDrop: true,
          playerDropPriority: true
        }
      }
    };
    const productionFootDropStatus = {
      ...restartDrainStatus,
      commitmentKey: 'player:22399'
    };
    const productionFootDropReadiness = evaluateRestartReadiness({
      online: true,
      decision: productionFootDropDecision
    });
    const productionFootDropRetained = restartDrainRetainsCommittedDecision(
      productionFootDropDecision,
      productionFootDropStatus
    );
    const unrelatedFootDropRetained = restartDrainRetainsCommittedDecision(
      productionFootDropDecision,
      { ...productionFootDropStatus, commitmentKey: 'player:9555' }
    );
    const closedTransportAdapter = createBrowserlessActionAdapter({
      transport: {
        sendVelocity() {
          throw new Error('websocket is not open');
        }
      },
      now: () => Date.UTC(2026, 6, 8, 1, 2, 0),
      commandIntervalMs: 0
    });
    const closedTransportAction = closedTransportAdapter.applyDecision({}, {
      kind: 'wait',
      band: 'wait',
      reason: 'missing-realtime-self',
      action: { kind: 'wait', band: 'wait', reason: 'missing-realtime-self' }
    });
    const chatService = runChatServiceSelfTest();
    const chatHistoryStore = runChatHistoryStoreSelfTest();
    const chatHistoryWorkerFile = path.join(tmp, 'chat-history-worker.sqlite3');
    const chatHistoryWorkerIo = createBrowserlessBackgroundIo();
    const chatHistoryWorkerQueued = chatHistoryWorkerIo.appendChatHistory(chatHistoryWorkerFile, {
      players: [{ userId: 17, name: 'Worker Alice', observedAtMs: 1000 }],
      messages: [{
        key: 'id:worker-1',
        id: 1,
        kind: 'chat',
        userId: 17,
        targetUserId: 0,
        text: 'worker history',
        occurredAtMs: 900,
        firstObservedAtMs: 1000,
        lastObservedAtMs: 1000,
        source: 'self-test'
      }]
    });
    const chatHistoryWorkerFlush = await chatHistoryWorkerIo.flush();
    await chatHistoryWorkerIo.close();
    const chatHistoryWorkerSummary = inspectChatHistoryDatabase(chatHistoryWorkerFile);
    const chatHistoryWorker = {
      ok: Boolean(
        chatHistoryWorkerQueued
        && chatHistoryWorkerFlush.ok
        && chatHistoryWorkerSummary.messages === 1
        && chatHistoryWorkerSummary.players === 2
      ),
      flush: chatHistoryWorkerFlush,
      summary: chatHistoryWorkerSummary
    };
    const dynamicSnapshotPoller = createSnapshotGapPoller({
      now: () => Date.UTC(2026, 6, 8, 1, 3, 0),
      intervalMs: DEFAULT_CHAT_IDLE_INTERVAL_MS,
      minimumIntervalMs: DEFAULT_CHAT_ACTIVE_INTERVAL_MS,
      getIntervalMs: () => 1000,
      fetchSnapshot: async () => ({})
    });
    const dynamicSnapshotPollerStatus = dynamicSnapshotPoller.status();
    let snapshotModeOnline = false;
    const snapshotModeScheduleDelays = [];
    const snapshotModePoller = createSnapshotGapPoller({
      now: () => Date.UTC(2026, 7, 8, 1, 3, 0),
      intervalMs: DEFAULT_CHAT_IDLE_INTERVAL_MS,
      minimumIntervalMs: DEFAULT_CHAT_ACTIVE_INTERVAL_MS,
      globalIntervalMs: DEFAULT_CHAT_IDLE_INTERVAL_MS,
      getIntervalMs: () => snapshotModeOnline
        ? DEFAULT_CHAT_ACTIVE_INTERVAL_MS
        : DEFAULT_CHAT_IDLE_INTERVAL_MS,
      getGlobalIntervalMs: () => snapshotModeOnline
        ? DEFAULT_CHAT_ACTIVE_INTERVAL_MS
        : DEFAULT_CHAT_IDLE_INTERVAL_MS,
      setTimeout: (_callback, delayMs) => {
        const handle = { delayMs, cleared: false, unref() {} };
        snapshotModeScheduleDelays.push(handle);
        return handle;
      },
      clearTimeout: handle => {
        if (handle) handle.cleared = true;
      },
      fetchSnapshot: async () => ({})
    });
    const snapshotModeAtMs = Date.UTC(2026, 7, 8, 1, 3, 0);
    snapshotModePoller.start({
      reset: true,
      snapshotAtMs: snapshotModeAtMs,
      globalSnapshotAtMs: snapshotModeAtMs,
      immediate: false
    });
    const offlineSnapshotModeStatus = snapshotModePoller.status();
    snapshotModeOnline = true;
    snapshotModePoller.refreshSchedule();
    const onlineSnapshotModeStatus = snapshotModePoller.status();
    snapshotModeOnline = false;
    snapshotModePoller.refreshSchedule();
    const restoredOfflineSnapshotModeStatus = snapshotModePoller.status();
    snapshotModePoller.stop();
    const snapshotModePollerTest = {
      ok: offlineSnapshotModeStatus.currentIntervalMs === DEFAULT_CHAT_IDLE_INTERVAL_MS
        && offlineSnapshotModeStatus.currentGlobalIntervalMs === DEFAULT_CHAT_IDLE_INTERVAL_MS
        && onlineSnapshotModeStatus.currentIntervalMs === DEFAULT_CHAT_ACTIVE_INTERVAL_MS
        && onlineSnapshotModeStatus.currentGlobalIntervalMs === DEFAULT_CHAT_ACTIVE_INTERVAL_MS
        && restoredOfflineSnapshotModeStatus.currentIntervalMs === DEFAULT_CHAT_IDLE_INTERVAL_MS
        && restoredOfflineSnapshotModeStatus.currentGlobalIntervalMs === DEFAULT_CHAT_IDLE_INTERVAL_MS
        && snapshotModeScheduleDelays.map(item => item.delayMs).join(',')
          === [DEFAULT_CHAT_IDLE_INTERVAL_MS, DEFAULT_CHAT_ACTIVE_INTERVAL_MS, DEFAULT_CHAT_IDLE_INTERVAL_MS].join(','),
      delays: snapshotModeScheduleDelays.map(item => item.delayMs),
      offlineIntervalMs: offlineSnapshotModeStatus.currentIntervalMs,
      onlineIntervalMs: onlineSnapshotModeStatus.currentIntervalMs,
      restoredOfflineIntervalMs: restoredOfflineSnapshotModeStatus.currentIntervalMs
    };
    const fixedSnapshotScheduleDelays = [];
    const fixedSnapshotPoller = createSnapshotGapPoller({
      now: () => Date.UTC(2026, 6, 8, 1, 3, 0),
      intervalMs: DEFAULT_SNAPSHOT_GAP_MS,
      minimumIntervalMs: DEFAULT_CHAT_ACTIVE_INTERVAL_MS,
      globalIntervalMs: DEFAULT_SNAPSHOT_GAP_MS,
      setTimeout: (_callback, delayMs) => {
        fixedSnapshotScheduleDelays.push(delayMs);
        return { unref() {} };
      },
      clearTimeout() {},
      fetchSnapshot: async () => ({})
    });
    const fixedSnapshotAtMs = Date.UTC(2026, 6, 8, 1, 3, 0);
    fixedSnapshotPoller.start({
      reset: true,
      snapshotAtMs: fixedSnapshotAtMs,
      globalSnapshotAtMs: fixedSnapshotAtMs,
      immediate: false
    });
    fixedSnapshotPoller.stop();
    fixedSnapshotPoller.start({ reset: true, immediate: true });
    fixedSnapshotPoller.stop();
    let resolveStaleSnapshot;
    const rolloverTimers = [];
    const rolloverSnapshotAtMs = Date.UTC(2026, 6, 8, 1, 4, 0);
    const rolloverSnapshotPoller = createSnapshotGapPoller({
      now: () => rolloverSnapshotAtMs,
      intervalMs: DEFAULT_SNAPSHOT_GAP_MS,
      minimumIntervalMs: DEFAULT_CHAT_ACTIVE_INTERVAL_MS,
      globalIntervalMs: DEFAULT_SNAPSHOT_GAP_MS,
      setTimeout: (callback, delayMs) => {
        const handle = { callback, delayMs, cleared: false, unref() {} };
        rolloverTimers.push(handle);
        return handle;
      },
      clearTimeout: handle => { handle.cleared = true; },
      fetchSnapshot: () => new Promise(resolve => { resolveStaleSnapshot = resolve; })
    });
    rolloverSnapshotPoller.start({ reset: true, immediate: true });
    const staleSnapshotRun = rolloverTimers[0].callback();
    rolloverSnapshotPoller.stop();
    rolloverSnapshotPoller.start({
      reset: true,
      snapshotAtMs: rolloverSnapshotAtMs,
      globalSnapshotAtMs: rolloverSnapshotAtMs,
      immediate: false
    });
    resolveStaleSnapshot({ tick: 1, entities: [] });
    await staleSnapshotRun;
    rolloverSnapshotPoller.stop();
    const fixedSnapshotPollerTest = {
      ok: DEFAULT_SNAPSHOT_GAP_MS === 30000
        && fixedSnapshotScheduleDelays[0] === 30000
        && fixedSnapshotScheduleDelays[1] === 0
        && rolloverTimers[1].delayMs === 30000
        && rolloverTimers[1].cleared === true
        && rolloverTimers[2].delayMs === 30000,
      intervalMs: DEFAULT_SNAPSHOT_GAP_MS,
      scheduleDelays: fixedSnapshotScheduleDelays,
      rolloverScheduleDelays: rolloverTimers.map(timer => timer.delayMs)
    };
    const routeAction = {
      kind: 'coin',
      target: { id: 'route-a', x: 20, y: 0, amount: 4 },
      coinRoute: {
        points: [
          { id: 'route-a', x: 20, y: 0, amount: 4, order: 1 },
          { id: 'route-b', x: 40, y: 0, amount: 4, order: 2 },
          { id: 'route-c', x: 60, y: 0, amount: 4, order: 3 }
        ]
      }
    };
    const routePanelInput = firstCoinPresent => ({
      self: { x: 0, y: 0 },
      profitCoins: [
        ...(firstCoinPresent ? [{ drop_id: 'route-a', id: 'route-a', x: 20, y: 0, amount: 4, distance: 20, authority: 'realtime' }] : []),
        { drop_id: 'route-b', id: 'route-b', x: 40, y: 0, amount: 4, distance: 40, authority: 'realtime' },
        { drop_id: 'route-c', id: 'route-c', x: 60, y: 0, amount: 4, distance: 60, authority: 'realtime' }
      ],
      visibleTargets: []
    });
    const routeRowsWhenFirstMissing = summarizeNearbyForPanel(
      routePanelInput(false),
      routeAction,
      {},
      { globalCoinMaxDistance: 50000 }
    ).c;
    const routeRowsWhenFirstPresent = summarizeNearbyForPanel(
      routePanelInput(true),
      routeAction,
      {},
      { globalCoinMaxDistance: 50000 }
    ).c;
    const previewRows = summarizeNearbyForPanel(
      routePanelInput(true),
      {
        kind: 'coin',
        band: 'profit',
        reason: 'best-opportunity-coin',
        target: { type: 'coin', id: 'route-a', amount: 4, distance: 20 },
        coinRoutePreview: routeAction.coinRoute
      },
      {},
      { globalCoinMaxDistance: 50000 }
    ).c;
    const expectedRouteRows = 'route-a:1:1,route-b:0:2,route-c:0:3';
    const expectedPreviewRows = 'route-a:1:0,route-b:0:0,route-c:0:0';
    const routeRowsText = rows => rows.map(row => `${row[0]}:${row[3]}:${row[4]}`).join(',');
    const nearbyCoinRoutePanelTest = {
      ok: routeRowsText(routeRowsWhenFirstMissing) === expectedRouteRows
        && routeRowsText(routeRowsWhenFirstPresent) === expectedRouteRows
        && routeRowsText(previewRows) === expectedPreviewRows
        && routeRowsWhenFirstPresent.find(row => row[0] === 'route-a')?.[7] === 20
        && routeRowsWhenFirstPresent.find(row => row[0] === 'route-a')?.[8] === 0
        && new Set(routeRowsWhenFirstMissing.map(row => row[0])).size === routeRowsWhenFirstMissing.length
        && new Set(routeRowsWhenFirstPresent.map(row => row[0])).size === routeRowsWhenFirstPresent.length
        && new Set(previewRows.map(row => row[0])).size === previewRows.length,
      missingFirst: routeRowsText(routeRowsWhenFirstMissing),
      presentFirst: routeRowsText(routeRowsWhenFirstPresent),
      previewOnly: routeRowsText(previewRows)
    };
    const lateDisplayCoins = Array.from({ length: 12 }, (_, index) => ({
      drop_id: `late-display-${index}`,
      id: `late-display-${index}`,
      x: 100 + index * 100,
      y: 0,
      amount: 1,
      distance: 100 + index * 100,
      authority: 'realtime'
    }));
    const lateDisplayRouteAction = {
      kind: 'coin',
      band: 'profit',
      target: lateDisplayCoins[10],
      coinRoute: {
        points: [
          { id: lateDisplayCoins[10].id, x: lateDisplayCoins[10].x, y: 0, amount: 1, order: 1 },
          { id: lateDisplayCoins[11].id, x: lateDisplayCoins[11].x, y: 0, amount: 1, order: 2 }
        ]
      }
    };
    const lateDisplayRows = summarizeNearbyForPanel(
      { self: { x: 0, y: 0 }, profitCoins: lateDisplayCoins, visibleTargets: [] },
      lateDisplayRouteAction,
      {},
      { globalCoinMaxDistance: 50000 }
    ).c;
    const lateDisplayCompact = buildCompactBrowserlessStatus({
      updatedAt: '2026-08-15T01:00:00.000Z',
      session: { userId: 7, sessionToken: 'late-display-self-test-token' },
      current: {
        self: { user_id: 7, name: 'self', x: 0, y: 0, hp: 100 },
        decision: {
          kind: 'coin',
          action: lateDisplayRouteAction,
          input: {
            nearby: {
              ar: 15000,
              vr: 50000,
              c: lateDisplayRows,
              p: [],
              observedAt: '2026-08-15T01:00:00.000Z',
              ageMs: 100
            }
          }
        }
      }
    }, { nowMs: Date.parse('2026-08-15T01:00:00.100Z') });
    const lateDisplayRouteIds = lateDisplayCompact.nearby?.c?.map(row => row[0]) || [];
    const lateDisplayRoutePanelTest = {
      ok: lateDisplayRouteIds.includes('late-display-10')
        && lateDisplayRouteIds.includes('late-display-11')
        && lateDisplayCompact.nearby?.c?.find(row => row[0] === 'late-display-10')?.[3] === 1
        && lateDisplayCompact.nearby?.c?.find(row => row[0] === 'late-display-10')?.[4] === 1
        && lateDisplayCompact.nearby?.c?.find(row => row[0] === 'late-display-11')?.[4] === 2
        && lateDisplayCompact.nearby?.coinLowHiddenCount === 0,
      ids: lateDisplayRouteIds,
      rows: lateDisplayCompact.nearby?.c || []
    };
    const remoteSnapshotPanelAction = {
      kind: 'seek-remote-player',
      band: 'profit',
      reason: 'remote-snapshot-profit-target',
      target: {
        type: 'enemy',
        userId: 99,
        name: '远程收益玩家',
        x: 90000,
        y: 0,
        hp: 100,
        drop: 134,
        distance: 90000,
        active: false,
        moving: false,
        firing: false,
        stamina5s: 10000,
        stamina5sLimit: 10000,
        authority: 'snapshot-navigation',
        remoteNavigationOnly: true
      }
    };
    const remoteSnapshotPanelRows = summarizeNearbyForPanel(
      { self: { x: 0, y: 0 }, profitCoins: [], visibleTargets: [] },
      remoteSnapshotPanelAction,
      {},
      { globalCoinMaxDistance: 50000 }
    ).p;
    const remoteSnapshotCompact = buildCompactBrowserlessStatus({
      updatedAt: '2026-08-15T01:01:00.000Z',
      session: { userId: 7, sessionToken: 'remote-display-self-test-token' },
      current: {
        self: { user_id: 7, name: 'self', x: 0, y: 0, hp: 100 },
        decision: {
          kind: 'seek-remote-player',
          action: remoteSnapshotPanelAction,
          input: {
            nearby: {
              ar: 15000,
              vr: 50000,
              c: [],
              p: remoteSnapshotPanelRows,
              observedAt: '2026-08-15T01:01:00.000Z',
              ageMs: 100
            }
          }
        }
      }
    }, { nowMs: Date.parse('2026-08-15T01:01:00.100Z') });
    const remoteSnapshotRow = remoteSnapshotCompact.nearby?.p?.find(row => row[9] === '99') || null;
    const remoteSnapshotTargetDisplayTest = {
      ok: remoteSnapshotPanelRows.some(row => row[9] === '99')
        && remoteSnapshotCompact.action?.target?.authority === 'snapshot-navigation'
        && remoteSnapshotCompact.action?.target?.remoteNavigationOnly === true
        && remoteSnapshotRow?.[0] === '远程收益玩家'
        && remoteSnapshotRow?.[5] === 90000
        && remoteSnapshotRow?.[6] === 1
        && remoteSnapshotRow?.[12] === 90000
        && remoteSnapshotRow?.[13] === 0,
      row: remoteSnapshotRow,
      nearbyRows: remoteSnapshotCompact.nearby?.p || []
    };
    const remoteSnapshotMapPosition = mapRemoteTargetPositionCore(90000, 0, 50000);
    const remoteSnapshotMapProjectionTest = {
      ok: remoteSnapshotMapPosition?.outside === true
        && remoteSnapshotMapPosition.dx > 49000
        && remoteSnapshotMapPosition.dx < 50000
        && remoteSnapshotMapPosition.dy === 0,
      position: remoteSnapshotMapPosition
    };
    const fleePanelInput = {
      self: { x: 0, y: 0 },
      visibleTargets: [
        { userId: 21557, name: 'Pyro', x: 10000, y: 0, vx: -35, vy: 35, distance: 10000, hp: 100, active: true, invulnerable: true },
        { userId: 34711, name: 'xuanze00', x: 5000, y: 0, distance: 5000, hp: 4, active: true }
      ],
      avoidanceThreats: [{ userId: 21557, name: 'Pyro', x: 10000, y: 0, distance: 10000, hp: 100, active: true, invulnerable: true }],
      activeThreats: [],
      firingThreats: [],
      snapshotActiveThreats: [],
      afkTargets: [],
      easyKillTargets: []
    };
    const fleePanelRows = summarizeNearbyForPanel(
      fleePanelInput,
      { kind: 'flee', target: { userId: 21557, name: 'Pyro' } },
      { target: { userId: 34711, name: 'xuanze00' } },
      { globalCoinMaxDistance: 50000 }
    ).p;
    const nearbyFleeTargetPanelTest = {
      ok: fleePanelRows.find(row => row[0] === 'Pyro')?.[9] === '21557'
        && fleePanelRows.find(row => row[0] === 'xuanze00')?.[9] === '34711'
        && fleePanelRows.find(row => row[0] === 'Pyro')?.[13] === 10000
        && fleePanelRows.find(row => row[0] === 'Pyro')?.[14] === 0,
      rows: fleePanelRows.map(row => `${row[0]}:${row[6]}:${row[9]}`).join(',')
    };
    const selectedRealtimeNearby = realtimeNearbyObservationSummary({
      self: { userId: 7, x: 0, y: 0 },
      nowMs: Date.parse('2026-07-26T01:48:00.100Z'),
      realtimeSnapshotObservation: {
        observedAtMs: Date.parse('2026-07-26T01:48:00.000Z'),
        nearby: {
          ar: 14500,
          vr: 50000,
          c: [],
          p: [['哈基米曼波噢耶', 69, 10000, 128, null, 10466, 0, 'Active', 1, '2480', 0, 0, 1, -77417, -1717, -35, 35]],
          observedAt: '2026-07-26T01:48:00.000Z',
          tick: 128523
        },
        _nearbyKeys: { coinKeys: [], playerKeys: ['2480'] }
      }
    }, { target: { userId: 2480, name: '哈基米曼波噢耶' } }, null);
    const selectedRealtimePlayerRow = selectedRealtimeNearby?.p?.[0] || [];
    const nearbySelectedPlayerCoordinatesTest = {
      ok: selectedRealtimePlayerRow[6] === 1
        && selectedRealtimePlayerRow[12] === 0
        && selectedRealtimePlayerRow[13] === -77417
        && selectedRealtimePlayerRow[14] === -1717
        && selectedRealtimePlayerRow[15] === -35
        && selectedRealtimePlayerRow[16] === 35,
      row: selectedRealtimePlayerRow
    };
    const crowdedMapTrailItems = Array.from({ length: 79 }, (_, index) => ({
      k: `player:${10000 + index}`,
      n: `map-player-${index}`,
      s: [[index, 0, Date.parse('2026-07-26T00:59:55.000Z'), 1]]
    }));
    crowdedMapTrailItems.push({
      k: 'player:2480',
      n: 'Pyro',
      s: [[10000, 0, Date.parse('2026-07-26T00:59:55.000Z'), 1], [10100, 20, Date.parse('2026-07-26T01:00:00.000Z'), 2]]
    });
    const nearbyMapCompact = buildCompactBrowserlessStatus({
      updatedAt: '2026-07-26T01:00:00.000Z',
      session: { userId: 7, sessionToken: 'nearby-map-self-test-token' },
      runner: { running: true },
      mapTrails: {
        version: 1,
        authority: 'realtime',
        source: 'pos',
        visibleRange: 50000,
        maxAgeMs: 30000,
        observedAt: '2026-07-26T01:00:00.000Z',
        items: crowdedMapTrailItems
      },
      current: {
        self: { user_id: 7, name: 'self', x: 0, y: 0, vx: 35, vy: -35, hp: 100 },
        decision: {
          kind: 'wait',
          at: '2026-07-26T01:00:00.000Z',
          input: {
            nearby: {
              ar: 15000,
              vr: 50000,
              c: routeRowsWhenFirstPresent,
              p: fleePanelRows,
              observedAt: '2026-07-26T01:00:00.000Z',
              ageMs: 100
            }
          }
        }
      }
    }, { nowMs: Date.parse('2026-07-26T01:00:00.100Z') });
    const nearbyMapCoordinatesTest = {
      ok: nearbyMapCompact.nearby?.compactVersion === 3
        && nearbyMapCompact.nearby?.c?.find(row => row[0] === 'route-a')?.[7] === 20
        && nearbyMapCompact.nearby?.c?.find(row => row[0] === 'route-a')?.[8] === 0
        && nearbyMapCompact.nearby?.p?.find(row => row[0] === 'Pyro')?.[12] === 10000
        && nearbyMapCompact.nearby?.p?.find(row => row[0] === 'Pyro')?.[13] === 0
        && nearbyMapCompact.nearby?.p?.find(row => row[0] === 'Pyro')?.[14] === -35
        && nearbyMapCompact.nearby?.p?.find(row => row[0] === 'Pyro')?.[15] === 35
        && nearbyMapCompact.self?.vx === 35
        && nearbyMapCompact.self?.vy === -35
        && nearbyMapCompact.mapTrails?.authority === 'realtime'
        && nearbyMapCompact.mapTrails?.source === 'pos'
        && nearbyMapCompact.mapTrails?.items?.length === 80
        && nearbyMapCompact.mapTrails?.items?.find(item => item.k === 'player:2480')?.s?.length === 2,
      coin: nearbyMapCompact.nearby?.c?.find(row => row[0] === 'route-a') || null,
      player: nearbyMapCompact.nearby?.p?.find(row => row[0] === 'Pyro') || null,
      trail: nearbyMapCompact.mapTrails?.items?.find(item => item.k === 'player:2480') || null
    };
    const mapTrailTrackerSelfTest = runMapTrailTrackerSelfTest();
    const nearbyMapLegacyCompact = buildCompactBrowserlessStatus({
      updatedAt: '2026-07-26T01:00:00.000Z',
      current: {
        decision: {
          kind: 'wait',
          input: {
            nearby: {
              compactVersion: 1,
              ar: 15000,
              vr: 50000,
              c: [routeRowsWhenFirstPresent[0].slice(0, 7)],
              p: [nearbyMapCompact.nearby.p[0].slice(0, 12)]
            }
          }
        }
      }
    });
    const nearbyMapMixedVersionCompact = buildCompactBrowserlessStatus({
      updatedAt: '2026-07-26T01:00:00.000Z',
      current: {
        decision: {
          kind: 'wait',
          input: {
            nearby: {
              compactVersion: 2,
              ar: 15000,
              vr: 50000,
              c: [routeRowsWhenFirstPresent[0].slice(0, 7)],
              p: [nearbyMapCompact.nearby.p[0].slice(0, 12)]
            }
          }
        }
      }
    });
    const nearbyMapLegacyCompatibilityTest = {
      ok: nearbyMapLegacyCompact.nearby?.compactVersion === 3
        && nearbyMapLegacyCompact.nearby?.c?.[0]?.length === 9
        && nearbyMapLegacyCompact.nearby?.c?.[0]?.[7] === null
        && nearbyMapLegacyCompact.nearby?.c?.[0]?.[8] === null
        && nearbyMapLegacyCompact.nearby?.p?.[0]?.length === 16
        && nearbyMapLegacyCompact.nearby?.p?.[0]?.[12] === null
        && nearbyMapLegacyCompact.nearby?.p?.[0]?.[13] === null
        && nearbyMapMixedVersionCompact.nearby?.c?.[0]?.length === 9
        && nearbyMapMixedVersionCompact.nearby?.c?.[0]?.[7] === null
        && nearbyMapMixedVersionCompact.nearby?.c?.[0]?.[8] === null
        && nearbyMapMixedVersionCompact.nearby?.p?.[0]?.length === 16
        && nearbyMapMixedVersionCompact.nearby?.p?.[0]?.[12] === null
        && nearbyMapMixedVersionCompact.nearby?.p?.[0]?.[13] === null,
      coinRowLength: nearbyMapLegacyCompact.nearby?.c?.[0]?.length || 0,
      playerRowLength: nearbyMapLegacyCompact.nearby?.p?.[0]?.length || 0,
      mixedVersionCoinRowLength: nearbyMapMixedVersionCompact.nearby?.c?.[0]?.length || 0,
      mixedVersionPlayerRowLength: nearbyMapMixedVersionCompact.nearby?.p?.[0]?.length || 0
    };
    const realtimeLootFixture = (selfHp, includeCoin, fixture = {}) => {
      const nowMs = Date.UTC(2026, 6, 23, 1, 29, 48);
      const coinX = Number(fixture.coinX ?? 5000);
      const coinY = Number(fixture.coinY ?? 0);
      return buildBrowserlessRealtimeControlDecision({
        userId: 28886,
        realtime: {
          tick: 100,
          receivedAtMs: nowMs,
          frameAgeMs: 0,
          self: {
            user_id: 28886,
            name: 'self',
            x: 0,
            y: 0,
            hp: selfHp,
            stamina_5s: 8000,
            stamina_1h: 2000000,
            stamina_1d: 10000000,
            current_join_mode: 'Active'
          },
          entities: [{
            user_id: 21557,
            name: 'Pyro',
            x: 10000,
            y: 0,
            hp: 100,
            stamina_5s: 8000,
            stamina_1h: 2000000,
            stamina_1d: 10000000,
            current_join_mode: 'Active',
            invulnerable: true,
            invulnerable_remaining_ms: 120000
          }],
          bullets: fixture.bullets || []
        },
        fallback: {
          tick: 99,
          receivedAtMs: nowMs - 50,
          frameAgeMs: 50,
          entities: [],
          coinDrops: includeCoin ? [{ id: 5422, x: coinX, y: coinY, amount: 22 }] : []
        }
      }, {}, {
        nowMs,
        controlMode: 'profit-live',
        combatEnabled: true,
        attackRange: 14500,
        globalCoinMaxDistance: 50000,
        realtimeLootMaxDistanceCm: 14500,
        activeAvoidMaxDistance: 25000,
        profitLiveThreatExitRange: 14500
      });
    };
    const healthyLootRealtimeDecision = realtimeLootFixture(100, true);
    const lowHpLootRealtimeDecision = realtimeLootFixture(49, true);
    const safeIncomingLootRealtimeDecision = realtimeLootFixture(79, true, {
      coinX: 0,
      coinY: 5000,
      bullets: [{
        bullet_id: 1,
        owner_user_id: 21557,
        start_x: 10000,
        start_y: 0,
        target_x: 0,
        target_y: 0,
        speed_per_tick: 500,
        created_tick: 99,
        expire_tick: 130
      }]
    });
    const damageCommitLootRealtimeDecision = realtimeLootFixture(79, true, {
      bullets: [{
        bullet_id: 2,
        owner_user_id: 21557,
        x: 1000,
        y: 0,
        start_x: 10000,
        start_y: 0,
        target_x: 0,
        target_y: 0,
        speed_per_tick: 500,
        created_tick: 99,
        expire_tick: 130
      }]
    });
    const realtimeLootSafetyArbitrationTest = {
      ok: healthyLootRealtimeDecision.kind === 'coin'
        && healthyLootRealtimeDecision.action?.target?.id === 5422
        && lowHpLootRealtimeDecision.kind === 'safety-exit'
        && lowHpLootRealtimeDecision.reason === 'combat-low-hp-secondary-leave'
        && safeIncomingLootRealtimeDecision.kind === 'combat-live'
        && safeIncomingLootRealtimeDecision.reason === 'post-kill-loot-safe-dodge'
        && safeIncomingLootRealtimeDecision.input?.loot?.mode === 'safe-dodge-toward-coin'
        && Number(safeIncomingLootRealtimeDecision.action?.dy || 0) > 0
        && damageCommitLootRealtimeDecision.kind === 'coin'
        && damageCommitLootRealtimeDecision.input?.loot?.mode === 'damage-commit'
        && damageCommitLootRealtimeDecision.input?.loot?.acceptedDamageRisk === true,
      healthy: { kind: healthyLootRealtimeDecision.kind, reason: healthyLootRealtimeDecision.reason },
      lowHp: { kind: lowHpLootRealtimeDecision.kind, reason: lowHpLootRealtimeDecision.reason },
      safeIncoming: {
        kind: safeIncomingLootRealtimeDecision.kind,
        reason: safeIncomingLootRealtimeDecision.reason,
        mode: safeIncomingLootRealtimeDecision.input?.loot?.mode
      },
      damageCommit: {
        kind: damageCommitLootRealtimeDecision.kind,
        reason: damageCommitLootRealtimeDecision.reason,
        mode: damageCommitLootRealtimeDecision.input?.loot?.mode
      }
    };
    const pickupObservationState = {};
    const pickupObservationAt = Date.parse('2026-07-20T00:00:00.000Z');
    const pickupBefore = observeBrowserlessCoinPickups({
      nowMs: pickupObservationAt,
      self: { x: 0, y: 0 },
      rawRealtime: { coinDropsObserved: true },
      realtimeObservedCoins: [{ drop_id: 'single-coin', amount: 1, x: 1000, y: 0 }]
    }, pickupObservationState, { coinCollectedConfirmDistance: 1800 });
    const pickupMissingAuthority = observeBrowserlessCoinPickups({
      nowMs: pickupObservationAt + 500,
      self: { x: 500, y: 0 },
      rawRealtime: { coinDropsObserved: false },
      realtimeObservedCoins: []
    }, pickupObservationState, { coinCollectedConfirmDistance: 1800 });
    const pickupAfter = observeBrowserlessCoinPickups({
      nowMs: pickupObservationAt + 1000,
      self: { x: 1000, y: 0 },
      rawRealtime: { coinDropsObserved: true },
      realtimeObservedCoins: []
    }, pickupObservationState, { coinCollectedConfirmDistance: 1800 });
    const browserlessCoinPickupObservationTest = {
      ok: pickupBefore.length === 0
        && pickupMissingAuthority.length === 0
        && pickupAfter.length === 1
        && pickupAfter[0].amount === 1,
      pickupCount: pickupAfter.length,
      amount: pickupAfter[0]?.amount ?? null
    };
    const snapshotPickupObservationState = {};
    const snapshotPickupBefore = observeBrowserlessCoinPickups({
      nowMs: pickupObservationAt,
      self: { x: 0, y: 0 },
      rawRealtime: { coinDropsObserved: false },
      fallback: { tick: 100, coinDropsObserved: true },
      snapshotObservedCoins: [
        { drop_id: 'snapshot-single', amount: 1, x: 0, y: 4000 },
        { drop_id: 'snapshot-far', amount: 1, x: 10000, y: 10000 }
      ]
    }, snapshotPickupObservationState, { coinCollectedConfirmDistance: 1800 });
    const snapshotPickupSameFrame = observeBrowserlessCoinPickups({
      nowMs: pickupObservationAt + 5000,
      self: { x: 0, y: 4000 },
      rawRealtime: { coinDropsObserved: false },
      fallback: { tick: 100, coinDropsObserved: true },
      snapshotObservedCoins: [
        { drop_id: 'snapshot-single', amount: 1, x: 0, y: 4000 },
        { drop_id: 'snapshot-far', amount: 1, x: 10000, y: 10000 }
      ]
    }, snapshotPickupObservationState, { coinCollectedConfirmDistance: 1800 });
    const snapshotPickupAfter = observeBrowserlessCoinPickups({
      nowMs: pickupObservationAt + 10000,
      self: { x: 4000, y: 4000 },
      rawRealtime: { coinDropsObserved: false },
      fallback: { tick: 200, coinDropsObserved: true },
      snapshotObservedCoins: []
    }, snapshotPickupObservationState, { coinCollectedConfirmDistance: 1800 });
    const snapshotPickupRepeated = observeBrowserlessCoinPickups({
      nowMs: pickupObservationAt + 11000,
      self: { x: 4000, y: 4000 },
      rawRealtime: { coinDropsObserved: false },
      fallback: { tick: 200, coinDropsObserved: true },
      snapshotObservedCoins: []
    }, snapshotPickupObservationState, { coinCollectedConfirmDistance: 1800 });
    const browserlessSnapshotCoinPickupObservationTest = {
      ok: snapshotPickupBefore.length === 0
        && snapshotPickupSameFrame.length === 0
        && snapshotPickupAfter.length === 1
        && snapshotPickupAfter[0].amount === 1
        && snapshotPickupAfter[0].reason === 'snapshot-coin-disappeared-near-path'
        && snapshotPickupRepeated.length === 0,
      pickupCount: snapshotPickupAfter.length,
      amount: snapshotPickupAfter[0]?.amount ?? null,
      reason: snapshotPickupAfter[0]?.reason || ''
    };
    const fastSnapshotPickupState = {};
    const fastSnapshotPickupOptions = {
      controlMode: 'profit-live',
      combatEnabled: true,
      attackRange: 14500,
      globalCoinMaxDistance: 50000,
      realtimeLootMaxDistanceCm: 14500,
      highValueCoinPriorityAmount: 10,
      coinCollectedConfirmDistance: 1800
    };
    const fastSnapshotPickupFrame = (atMs, tick, x, drop, coinDrops) => ({
      userId: 28886,
      realtime: {
        tick,
        receivedAtMs: atMs,
        frameAgeMs: 0,
        self: {
          user_id: 28886,
          name: 'self',
          x,
          y: 0,
          hp: 100,
          death_drop_coins: drop,
          stamina_5s: 8000,
          stamina_1h: 2000000,
          stamina_1d: 10000000,
          current_join_mode: 'Active'
        },
        entities: [],
        bullets: []
      },
      fallback: {
        tick: tick - 1,
        receivedAtMs: atMs,
        frameAgeMs: 0,
        entities: [],
        coinDrops
      }
    });
    const fastSnapshotPickupAt = Date.parse('2026-07-23T16:30:00.000Z');
    const fastSnapshotPickupVisible = buildBrowserlessRealtimeControlDecision(
      fastSnapshotPickupFrame(
        fastSnapshotPickupAt,
        35709,
        0,
        3972,
        [{ id: 424, x: 1000, y: 0, amount: 15 }]
      ),
      fastSnapshotPickupState,
      { ...fastSnapshotPickupOptions, nowMs: fastSnapshotPickupAt }
    );
    const fastSnapshotPickupGone = buildBrowserlessRealtimeControlDecision(
      fastSnapshotPickupFrame(fastSnapshotPickupAt + 2000, 35750, 1000, 3979, []),
      fastSnapshotPickupState,
      { ...fastSnapshotPickupOptions, nowMs: fastSnapshotPickupAt + 2000 }
    );
    const fastSnapshotPickupStatsState = {
      session: { userId: 28886, sessionToken: 'panel-self-test-token' },
      runner: { running: true, mode: 'profit-live', controlMode: 'profit-live' }
    };
    fastSnapshotPickupStatsState.stats = browserlessStatsForDecision(
      fastSnapshotPickupStatsState,
      fastSnapshotPickupVisible,
      { nowMs: fastSnapshotPickupAt }
    );
    fastSnapshotPickupStatsState.stats.currentSession.coinsGained = 74;
    fastSnapshotPickupStatsState.stats.currentSession.pickupObservedCoins = 27;
    fastSnapshotPickupStatsState.stats.currentSession.dropCalibratedCoins = 74;
    fastSnapshotPickupStatsState.stats = browserlessStatsForDecision(
      fastSnapshotPickupStatsState,
      fastSnapshotPickupGone,
      { nowMs: fastSnapshotPickupAt + 2000 }
    );
    const fastSnapshotPickupEvidence = fastSnapshotPickupGone.input?.coinPickups || [];
    const browserlessFastSnapshotPickupObservationTest = {
      ok: fastSnapshotPickupEvidence.length === 1
        && fastSnapshotPickupEvidence[0].key === 'id:424'
        && fastSnapshotPickupEvidence[0].amount === 15
        && fastSnapshotPickupEvidence[0].reason === 'realtime-snapshot-coin-disappeared-near-path'
        && fastSnapshotPickupStatsState.stats.currentSession.dropCalibratedCoins === 88
        && fastSnapshotPickupStatsState.stats.currentSession.coinsGained === 89,
      evidenceCount: fastSnapshotPickupEvidence.length,
      amount: fastSnapshotPickupEvidence[0]?.amount ?? null,
      reason: fastSnapshotPickupEvidence[0]?.reason || '',
      dropCalibratedCoins: fastSnapshotPickupStatsState.stats.currentSession.dropCalibratedCoins,
      coinsGained: fastSnapshotPickupStatsState.stats.currentSession.coinsGained
    };
    const highDropRankingTest = [
      ['self', 500, 700, 600],
      ['other', 500, 650, 650]
    ].sort((left, right) => highDropRankValueCore(right) - highDropRankValueCore(left))
      .map(item => item[0])
      .join(',') === 'other,self';
    const highDropSortTest = {
      drop: highDropSortValueCore(['player', 100, 140, 130], 'drop') === 130,
      todayIncome: highDropSortValueCore(['player', 100, 140, 130, 1, true, 2000000, 1000000], 'balance-change') === 2,
      todayIncomeValue: highDropBalanceDeltaValueCore(['player', 100, 140, 130, 1, true, 2000000, 1000000]) === 2,
      balance: highDropSortValueCore(['player', 100, 140, 140, 1, true, 1000000], 'balance') === 2,
      missingBalance: highDropSortValueCore(['player', 100, 140, 130, 1, true], 'balance') === -Infinity,
      missingTodayIncome: highDropSortValueCore(['player', 100, 140, 130, 1, true, 2000000], 'balance-change') === -Infinity
    };
    highDropSortTest.ok = Object.values(highDropSortTest).every(Boolean);
    const highDropRecencyTest = (() => {
      let observedAtMs = Date.UTC(2026, 6, 27, 0, 0, 0);
      const file = path.join(tmp, 'high-drop-recency-self-test.json');
      const tracker = createHighDropPlayerTracker({ file, now: () => observedAtMs });
      tracker.observeSnapshot({
        tick: 1722245,
        entities: [{ user_id: 36440, entity_id: 1, name: 'huaming song', drop: 787 }]
      }, { source: 'prelogin-http', observedAtMs });
      observedAtMs += 60000;
      tracker.observeSnapshot({
        tick: 100,
        entities: [{ user_id: 36440, entity_id: 2, name: 'huaming song', drop: 1762 }]
      }, { source: 'ws', observedAtMs });
      observedAtMs += 60000;
      tracker.observeSnapshot({
        tick: 90,
        entities: [{ user_id: 36440, entity_id: 3, name: 'huaming song latest', drop: 1705 }]
      }, { source: 'gap-http', observedAtMs });
      tracker.observeSnapshot({
        tick: 2000000,
        entities: [{ user_id: 36440, entity_id: 4, name: 'stale old name', drop: 1800 }]
      }, { source: 'ws', observedAtMs: observedAtMs - 90000 });
      const player = createHighDropPlayerTracker({ file, now: () => observedAtMs }).status().players[0];
      return {
        ok: player?.name === 'huaming song latest'
          && player?.entityId === '3'
          && player?.initialDrop === 787
          && player?.maxDrop === 1762
          && player?.latestDrop === 1705
          && player?.lastObservedTick === 90,
        player
      };
    })();
    const staminaExhaustionPanelTest = isStaminaExhaustionExitReasonCore('stamina-exhausted-leave')
      && isStaminaExhaustionExitReasonCore('体力耗尽')
      && !isStaminaExhaustionExitReasonCore('stamina-budget-coin-leave');
    const panelStatsState = {
      session: { userId: 7, sessionToken: 'panel-self-test-token' },
      runner: { running: true, mode: 'profit-live', controlMode: 'profit-live' },
      network: {
        transportHealth: {
          enabled: true,
          connected: true,
          mode: 'active',
          modeLabel: 'active-sampling',
          activity: { activeEvidence: true, reasons: ['combat-control'] },
          latency: { currentMs: 168, p90Ms: 448, sampleCount: 59, decisionWindowMs: 3000, exitThresholdMs: 2500 },
          processingQueue: { currentMs: 3, p90Ms: 12, sampleCount: 59, windowMs: 3000 },
          frameLoss: { rate: 0.005, percent: 0.5, missingTicks: 1, expectedTicks: 200, windowMs: 10000 },
          command: { movementP90Ms: 244, movementSampleCount: 56, shootingAckP90Ms: 877, shootingAckSampleCount: 12 },
          frames: { count: 200, lastTick: 123456 },
          exit: { hostilePressure: true, triggered: false, failureModes: [] }
        }
      }
    };
    const panelStatsDecision = (atMs, drop, coinPickups = []) => ({
      at: new Date(atMs).toISOString(),
      input: {
        self: { userId: 7, name: 'self', drop, dropKnown: true },
        stamina: {},
        coinPickups,
        selfKillEvidence: []
      }
    });
    const panelStatsStartedAt = Date.parse('2026-07-20T00:00:00.000Z');
    panelStatsState.stats = browserlessStatsForDecision(
      panelStatsState,
      panelStatsDecision(panelStatsStartedAt, 100),
      { nowMs: panelStatsStartedAt }
    );
    panelStatsState.stats = browserlessStatsForDecision(
      panelStatsState,
      panelStatsDecision(panelStatsStartedAt + 1000, 100, [{ key: 'id:single-coin', amount: 1, at: panelStatsStartedAt + 1000 }]),
      { nowMs: panelStatsStartedAt + 1000 }
    );
    const panelSingleCoinCompact = buildCompactBrowserlessStatus(panelStatsState, { nowMs: panelStatsStartedAt + 1000 });
    panelStatsState.stats = browserlessStatsForDecision(
      panelStatsState,
      panelStatsDecision(panelStatsStartedAt + 2000, 101, [{ key: 'id:second-single-coin', amount: 1, at: panelStatsStartedAt + 2000 }]),
      { nowMs: panelStatsStartedAt + 2000 }
    );
    const panelTwoCoinCompact = buildCompactBrowserlessStatus(panelStatsState, { nowMs: panelStatsStartedAt + 2000 });
    panelStatsState.stats = browserlessStatsForDecision(
      panelStatsState,
      panelStatsDecision(panelStatsStartedAt + 3000, 110),
      { nowMs: panelStatsStartedAt + 3000 }
    );
    panelStatsState.stats = browserlessStatsForDecision(
      panelStatsState,
      panelStatsDecision(panelStatsStartedAt + 4000, 20),
      { nowMs: panelStatsStartedAt + 4000 }
    );
    const panelStatsCompact = buildCompactBrowserlessStatus(panelStatsState, { nowMs: panelStatsStartedAt + 4000 });
    const panelOfflineTransitionAt = panelStatsStartedAt + 120000;
    const panelOfflineTransitionState = {
      session: { userId: 7, sessionToken: 'panel-self-test-token' },
      runner: {
        running: true,
        currentAction: {
          kind: 'combat-live',
          band: 'combat',
          reason: 'combat-attack',
          target: { userId: 8, name: 'previous-enemy' }
        }
      },
      current: {
        self: { userId: 7, name: 'self', hp: 49 },
        decision: {
          kind: 'combat-live',
          band: 'combat',
          reason: 'combat-attack',
          action: { kind: 'combat-live', reason: 'combat-attack', target: { userId: 8 } }
        }
      },
      stats: {
        currentSession: {
          online: true,
          sessionId: '7:panel-transition',
          userId: 7,
          enteredAt: new Date(panelStatsStartedAt).toISOString(),
          lastSeenAt: new Date(panelStatsStartedAt + 30000).toISOString()
        },
        lastExit: {
          at: new Date(panelStatsStartedAt + 60000).toISOString(),
          reason: 'combat-low-hp-disadvantage-leave',
          runId: 'panel-previous-run'
        }
      }
    };
    const panelOfflinePersistedState = mergeState(panelOfflineTransitionState, {
      stats: browserlessStatsForOffline(panelOfflineTransitionState, {
        at: new Date(panelStatsStartedAt + 60000).toISOString(),
        reason: 'combat-low-hp-disadvantage-leave',
        runId: 'panel-previous-run'
      }, { nowMs: panelStatsStartedAt + 60000 })
    });
    const panelOfflineTransitionPatch = snapshotOfflineTransitionPatch(panelOfflinePersistedState, {
      ok: true,
      reason: 'safe',
      satisfied: true,
      checkedAt: new Date(panelOfflineTransitionAt).toISOString(),
      response: {
        summary: {
          selfPresent: false,
          freshness: { ok: true },
          safety: { ok: true, reason: 'safe' }
        }
      }
    }, panelOfflineTransitionAt);
    const panelPreLoginCompact = buildCompactBrowserlessStatus(mergeState(panelOfflineTransitionState, {
      runner: { currentAction: preLoginSnapshotSafetyAction(panelOfflineTransitionState) }
    }), { nowMs: panelOfflineTransitionAt });
    const panelLoginPointRecheckState = previousCheck => buildCompactBrowserlessStatus({
      session: { userId: 7, sessionToken: 'panel-self-test-token' },
      runner: {
        running: true,
        currentAction: { kind: 'loop-wait', reason: 'next-login-point-pending-snapshot-safety' },
        ...(previousCheck ? {
          lastRun: {
            completedAt: previousCheck.checkedAt,
            canary: { snapshotSafety: previousCheck }
          }
        } : {})
      },
      loginPointSafety: {
        ok: false,
        reason: 'next-login-point-pending-snapshot-safety',
        checkedAt: '',
        point: { x: 5999, y: 66268, hp: 100, source: 'state' },
        detail: {
          ok: false,
          reason: 'next-login-point-pending-snapshot-safety',
          required: 1,
          streak: 0,
          satisfied: false
        }
      }
    }, { nowMs: panelOfflineTransitionAt });
    const panelUnsafeRecheckCompact = panelLoginPointRecheckState({
      ok: false,
      reason: 'damage-actor-near-login-point',
      checkedAt: '2026-07-27T08:22:21.694Z',
      required: 1,
      streak: 0,
      satisfied: false
    });
    const panelSafeRecheckCompact = panelLoginPointRecheckState({
      ok: true,
      reason: 'safe',
      checkedAt: '2026-07-27T08:20:01.000Z',
      required: 1,
      streak: 1,
      satisfied: true
    });
    const panelNeverCheckedCompact = panelLoginPointRecheckState(null);
    const panelCooldownUnsafeCompact = buildCompactBrowserlessStatus({
      session: { userId: 7, sessionToken: 'panel-self-test-token' },
      runner: {
        running: true,
        currentAction: {
          kind: 'loop-wait',
          reason: 'snapshot-safety-retry',
          nextRunAt: '2026-07-27T08:31:00.000Z'
        }
      },
      loginPointSafety: {
        ok: false,
        reason: 'damage-actor-near-login-point',
        checkedAt: '2026-07-27T08:30:00.000Z',
        point: { x: 5999, y: 66268, hp: 100, source: 'snapshot' },
        detail: {
          ok: false,
          reason: 'damage-actor-near-login-point',
          checkedAt: '2026-07-27T08:30:00.000Z',
          required: 1,
          streak: 0,
          satisfied: false
        }
      },
      stats: {
        currentSession: { online: false },
        lastExit: {
          at: '2026-07-27T08:20:00.000Z',
          reason: 'frame-gap',
          nextRunAt: '2026-07-27T08:31:00.000Z'
        }
      }
    }, { nowMs: Date.parse('2026-07-27T08:30:30.000Z') });
    const panelSnapshotEdgePending = pendingLoginPointSafetyPatch({
      snapshotEdgeEnabled: true,
      loginPointSafetySuccessRequired: 3
    });
    const panelSnapshotWaitCompact = buildCompactBrowserlessStatus({
      session: { userId: 7, sessionToken: 'panel-self-test-token' },
      runner: {
        running: true,
        currentAction: {
          kind: 'source-ip-preflight',
          reason: 'source-ip-snapshot-safety-wait',
          nextRunAt: '',
          nextSnapshotCheckAt: '2026-07-27T08:26:10.000Z'
        }
      },
      network: {
        sourceIpPreflight: {
          phase: 'snapshot-wait',
          reuseWithoutRetest: true
        }
      },
      loginPointSafety: {
        ok: false,
        reason: 'damage-actor-near-login-point',
        checkedAt: '2026-07-27T08:24:05.000Z',
        point: { x: 5999, y: 66268, hp: 100, source: 'snapshot' },
        detail: {
          ok: false,
          reason: 'damage-actor-near-login-point',
          checkedAt: '2026-07-27T08:24:05.000Z',
          required: 1,
          streak: 0,
          satisfied: false
        }
      },
      stats: {
        currentSession: { online: false },
        lastExit: {
          at: '2026-07-27T08:19:41.000Z',
          reason: 'frame-gap',
          nextRunAt: '2026-07-27T08:24:35.000Z'
        }
      }
    }, { nowMs: Date.parse('2026-07-27T08:25:40.000Z') });
    const panelOfflineTransitionCompact = buildCompactBrowserlessStatus(
      mergeState(panelOfflineTransitionState, panelOfflineTransitionPatch),
      { nowMs: panelOfflineTransitionAt }
    );
    const panelOnlineCombatWithoutSelfCompact = buildCompactBrowserlessStatus(
      mergeState(panelOfflineTransitionState, {
        current: { self: null },
        loginPointSafety: {
          ok: true,
          reason: 'safe',
          checkedAt: '2026-07-24T08:21:10.474Z',
          point: { x: 5999, y: 66268, hp: 100 },
          detail: { selfPresent: false, reason: 'safe', streak: 1, required: 1 }
        }
      }),
      { nowMs: Date.parse('2026-07-24T08:25:00.000Z') }
    );
    const panelOnlineCombatStopCompact = buildCompactBrowserlessStatus(
      mergeState(panelOfflineTransitionState, {
        runner: {
          currentAction: {
            kind: 'stop',
            band: 'combat',
            reason: 'combat-live-no-target'
          }
        },
        loginPointSafety: {
          ok: true,
          reason: 'safe',
          checkedAt: '2026-07-26T16:16:34.428Z',
          point: { x: 5999, y: 66268, hp: 100 },
          detail: { selfPresent: false, reason: 'safe', streak: 1, required: 1 }
        }
      }),
      { nowMs: Date.parse('2026-07-26T16:37:01.000Z') }
    );
    const panelTransportRecoveryCompact = buildCompactBrowserlessStatus({
      session: { userId: 7, sessionToken: 'panel-self-test-token' },
      runner: {
        running: true,
        currentAction: {
          kind: 'loop-wait',
          band: 'recover',
          reason: 'action-settlement-stalled',
          previousRunId: 'panel-current-run'
        }
      },
      current: {
        self: { userId: 7, name: 'self', hp: 100 },
        decision: { kind: 'seek-enemy', band: 'profit', reason: 'best-opportunity' }
      },
      stats: {
        currentSession: {
          online: true,
          sessionId: '7:panel-current-session',
          userId: 7,
          enteredAt: '2026-07-25T07:53:37.146Z',
          lastSeenAt: '2026-07-25T07:55:13.935Z'
        },
        lastExit: {
          at: '2026-07-25T07:53:13.504Z',
          reason: 'frame-gap',
          runId: 'panel-previous-exit-run'
        }
      },
      recentExits: [{
        ok: false,
        at: '2026-07-25T07:53:10.733Z',
        reason: 'frame-gap',
        classification: 'exit',
        shouldLeave: true,
        runId: 'panel-previous-exit-run'
      }]
    }, { nowMs: Date.parse('2026-07-25T07:55:13.935Z') });
    const panelLaggingSessionStatsCompact = buildCompactBrowserlessStatus({
      session: { userId: 7, sessionToken: 'panel-self-test-token' },
      runner: {
        running: true,
        currentAction: {
          kind: 'combat-live',
          band: 'combat',
          reason: 'combat-live-realtime',
          target: { userId: 8, name: 'current-enemy' }
        }
      },
      current: {
        self: {
          userId: 7,
          name: 'self',
          hp: 82,
          authority: 'realtime',
          source: 'pos',
          receivedAtMs: Date.parse('2026-07-26T16:37:01.000Z')
        },
        decision: {
          kind: 'combat-live',
          band: 'combat',
          reason: 'combat-live-realtime',
          at: '2026-07-26T16:37:01.000Z',
          action: { kind: 'combat-live', reason: 'combat-live-realtime', target: { userId: 8 } }
        }
      },
      loginPointSafety: {
        ok: true,
        reason: 'safe',
        checkedAt: '2026-07-26T16:16:34.428Z',
        point: { x: 5999, y: 66268, hp: 100 },
        detail: { selfPresent: false, reason: 'safe', streak: 1, required: 1 }
      },
      stats: {
        currentSession: {
          online: false,
          sessionId: '7:previous-session',
          userId: 7,
          enteredAt: '2026-07-26T16:02:01.151Z',
          exitedAt: '2026-07-26T16:16:01.755Z'
        },
        lastExit: {
          at: '2026-07-26T16:16:01.755Z',
          reason: 'combat-predicted-leave-hp',
          runId: 'panel-previous-exit-run'
        }
      }
    }, { nowMs: Date.parse('2026-07-26T16:37:01.000Z') });
    const panelBattleCompact = buildCompactBrowserlessStatus({
      session: { userId: 7, sessionToken: 'panel-self-test-token' },
      runner: { running: true, currentAction: { kind: 'combat-live', target: { userId: 8, distance: 5600 } } },
      current: {
        self: { userId: 7, name: 'self', hp: 86, maxHp: 100 },
        decision: {
          kind: 'combat-live',
          band: 'combat',
          at: '2026-07-20T00:00:15.000Z',
          target: { userId: 8, name: 'enemy', distance: 5600 }
        },
        combatSummary: {
          startedAt: '2026-07-20T00:00:00.000Z',
          durationMs: 15000,
          movementDistance: 20000,
          self: { userId: 7, name: 'self', hp: 86, maxHp: 100 },
          target: { userId: 8, name: 'enemy', hp: 73, maxHp: 100, distance: 5700, moving: true, firing: true }
        }
      }
    }, {});
    const panelDualTargetState = {
      session: { userId: 7, sessionToken: 'panel-dual-target-self-test-token' },
      runner: { running: true, currentAction: {
        kind: 'combat-live',
        target: {
          userId: 8,
          name: 'defender',
          combatRole: 'secondary',
          secondaryTarget: true,
          primaryTargetId: '9',
          authority: 'realtime',
          distance: 12000,
          hp: 90,
          drop: 200,
          active: true,
          moving: true,
          firing: true
        }
      } },
      current: {
        self: { userId: 7, name: 'self', hp: 100, maxHp: 100 },
        decision: {
          kind: 'combat-live',
          band: 'combat',
          action: { kind: 'combat-live', target: {
            userId: 8,
            name: 'defender',
            combatRole: 'secondary',
            secondaryTarget: true,
            primaryTargetId: '9',
            authority: 'realtime'
          } }
        },
        combatSummary: {
          target: {
            userId: 8,
            name: 'defender',
            combatRole: 'secondary',
            secondaryTarget: true,
            primaryTargetId: '9',
            authority: 'realtime',
            distance: 12000,
            hp: 90,
            drop: 200,
            active: true,
            moving: true,
            firing: true,
            combatIntent: 'whitelist-proximity'
          },
          fireTarget: { userId: 8, name: 'defender', combatRole: 'secondary', secondaryTarget: true },
          fireTargetRole: 'secondary',
          profitMission: {
            active: true,
            targetId: '9',
            type: 'enemy',
            currentDistanceCm: 3000,
            navigationTarget: {
              userId: 9,
              name: 'jackpot',
              authority: 'realtime',
              distance: 3000,
              hp: 30,
              drop: 300,
              active: false,
              moving: false,
              firing: false
            }
          }
        }
      }
    };
    const panelDualTargetCompact = buildCompactBrowserlessStatus(
      browserlessCompactStatusSource(panelDualTargetState),
      {}
    );
    const panelDualTargetRoles = panelTargetRolesCore(panelDualTargetCompact);
    const retainedRecoveryMission = {
      active: true,
      targetId: '6091',
      type: 'coin',
      navigationAuthority: 'snapshot',
      navigationTarget: {
        type: 'coin',
        id: '6091',
        amount: 1,
        x: 10056,
        y: 0,
        distance: 10056,
        authority: 'snapshot'
      }
    };
    const panelRecoveryCompact = buildCompactBrowserlessStatus(
      browserlessCompactStatusSource({
        session: { userId: 7, sessionToken: 'panel-recovery-self-test-token' },
        runner: {
          running: true,
          currentAction: {
            kind: 'recover',
            band: 'recover',
            reason: 'wait-for-full-stamina-and-hp',
            stopMotion: true
          }
        },
        current: {
          self: { userId: 7, name: 'self', x: 0, y: 0, hp: 88, maxHp: 100 },
          action: {
            kind: 'recover',
            band: 'recover',
            reason: 'wait-for-full-stamina-and-hp',
            stopMotion: true
          },
          decision: {
            kind: 'recover',
            band: 'recover',
            reason: 'wait-for-full-stamina-and-hp',
            action: {
              kind: 'recover',
              band: 'recover',
              reason: 'wait-for-full-stamina-and-hp',
              stopMotion: true
            },
            profit: { mission: retainedRecoveryMission }
          },
          profit: { mission: retainedRecoveryMission },
          combatSummary: { target: null, fireTarget: null, profitMission: retainedRecoveryMission }
        }
      }),
      {}
    );
    const panelRecoveryRoles = panelTargetRolesCore(panelRecoveryCompact);
    // 保留的 exit-recovery 事件只是"最后一次需要退出确认的退出",
    // 它的失败原因不能跨过后来一次干净的确认离场继续显示在面板上。
    const staleRecoveryExitEvent = {
      at: '2026-08-25T06:13:48.734Z',
      classification: 'exit-recovery',
      reason: 'frame-gap',
      error: 'frame-gap',
      shouldLeave: true
    };
    const panelStaleRecoveryErrorCompact = buildCompactBrowserlessStatus(
      browserlessCompactStatusSource({
        session: { userId: 7, sessionToken: 'panel-stale-recovery-self-test-token' },
        runner: {
          running: true,
          exitRecoveryOutcomes: [{
            exitAttemptId: 'panel-stale-recovery-attempt',
            originalReason: 'restart-drain-ready',
            outcome: 'confirmed-absent',
            startedAt: '2026-08-25T07:42:11.803Z',
            completedAt: '2026-08-25T07:42:11.949Z',
            durationMs: 146,
            httpStatuses: [200],
            lastHp: 100,
            reloginAllowed: true
          }]
        },
        recentExits: [
          staleRecoveryExitEvent,
          {
            at: '2026-08-25T07:42:11.949Z',
            reason: 'restart-drain-ready',
            shouldLeave: true,
            leaveConfirmation: { at: '2026-08-25T07:42:11.949Z', selfHp: 100 }
          }
        ],
        current: { self: { userId: 7, name: 'self', x: 0, y: 0, hp: 100, maxHp: 100 } }
      }),
      {}
    );
    const panelUnconfirmedRecoveryErrorCompact = buildCompactBrowserlessStatus(
      browserlessCompactStatusSource({
        session: { userId: 7, sessionToken: 'panel-unconfirmed-recovery-self-test-token' },
        runner: { running: true },
        recentExits: [staleRecoveryExitEvent],
        current: { self: { userId: 7, name: 'self', x: 0, y: 0, hp: 62, maxHp: 100 } }
      }),
      {}
    );
    const panelProfitHoldCompact = buildCompactBrowserlessStatus(
      browserlessCompactStatusSource({
        session: { userId: 7, sessionToken: 'panel-profit-hold-self-test-token' },
        runner: {
          running: true,
          currentAction: {
            kind: 'wait',
            band: 'profit',
            reason: 'single-coin-bait-hold',
            target: { type: 'coin', id: 'hold-coin', amount: 1, x: 200, y: 0, distance: 200 }
          }
        },
        current: {
          self: { userId: 7, name: 'self', x: 0, y: 0, hp: 100, maxHp: 100 },
          action: {
            kind: 'wait',
            band: 'profit',
            reason: 'single-coin-bait-hold',
            target: { type: 'coin', id: 'hold-coin', amount: 1, x: 200, y: 0, distance: 200 }
          },
          decision: {
            kind: 'wait',
            band: 'profit',
            reason: 'single-coin-bait-hold',
            action: {
              kind: 'wait',
              band: 'profit',
              reason: 'single-coin-bait-hold',
              target: { type: 'coin', id: 'hold-coin', amount: 1, x: 200, y: 0, distance: 200 }
            }
          },
          combatSummary: { target: null, fireTarget: null }
        }
      }),
      {}
    );
    const panelProfitHoldRoles = panelTargetRolesCore(panelProfitHoldCompact);
    const panelAfkPresentationInitial = browserlessBattlePresentation(null, {
      kind: 'attack',
      band: 'profit',
      at: '2026-07-20T00:01:00.000Z',
      action: { kind: 'attack', band: 'profit', target: { userId: 9, distance: 900 } },
      input: { self: { userId: 7, x: 0, y: 0 } }
    });
    const panelAfkPresentationMoved = browserlessBattlePresentation(panelAfkPresentationInitial, {
      kind: 'attack',
      band: 'profit',
      at: '2026-07-20T00:01:01.000Z',
      action: { kind: 'attack', band: 'profit', target: { userId: 9, distance: 800 } },
      input: { self: { userId: 7, x: 300, y: 400, vx: 50, vy: 0 } }
    });
    const panelAfkShotAt = Date.parse('2026-07-20T00:01:01.250Z');
    const panelAfkPresentationFiring = browserlessBattlePresentationAfterAction(
      panelAfkPresentationMoved,
      {
        kind: 'profit-attack',
        target: { userId: 9, distance: 800 },
        shoot: {
          ok: true,
          skipped: false,
          reason: 'profit-afk-attack',
          command: { id: 17, type: 'shoot' }
        }
      },
      { atMs: panelAfkShotAt }
    );
    const panelActivityStartedAt = Date.parse('2026-07-20T00:02:00.000Z');
    const panelActivityInitial = browserlessBattlePresentation(null, {
      kind: 'combat-live',
      band: 'combat',
      at: new Date(panelActivityStartedAt).toISOString(),
      action: { kind: 'combat-live', band: 'combat', target: { userId: 8, distance: 5000 } },
      input: { self: { userId: 7, x: 0, y: 0, vx: 50, vy: 0 } },
      combat: {
        target: { userId: 8, name: 'enemy', distance: 5000, vx: 0, vy: -50, firing: false },
        shooting: { actualLastShotAt: panelActivityStartedAt },
        behavior: { metrics: { shotEvents: [{ bulletId: 'activity-shot', observedAt: panelActivityStartedAt }] } }
      }
    });
    const panelActivityIdle = browserlessBattlePresentation(panelActivityInitial, {
      kind: 'combat-live',
      band: 'combat',
      at: new Date(panelActivityStartedAt + 1000).toISOString(),
      action: { kind: 'combat-live', band: 'combat', target: { userId: 8, distance: 5000 } },
      input: { self: { userId: 7, x: 0, y: 0, vx: 0, vy: 0 } },
      combat: {
        target: { userId: 8, name: 'enemy', distance: 5000, vx: 0, vy: 0, firing: false },
        shooting: { actualLastShotAt: panelActivityStartedAt },
        behavior: { metrics: { shotEvents: [{ bulletId: 'activity-shot', observedAt: panelActivityStartedAt }] } }
      }
    });
    const panelActivityState = {
      session: { userId: 7, sessionToken: 'panel-self-test-token' },
      runner: { running: true, currentAction: { kind: 'combat-live', target: { userId: 8, distance: 5000 } } },
      current: {
        self: { userId: 7, name: 'self', x: 0, y: 0, vx: 0, vy: 0, hp: 100, maxHp: 100 },
        decision: {
          kind: 'combat-live',
          band: 'combat',
          at: new Date(panelActivityStartedAt + 1000).toISOString(),
          action: { kind: 'combat-live', band: 'combat', target: { userId: 8, name: 'enemy', distance: 5000 } }
        },
        combatSummary: {
          self: { userId: 7, name: 'self', hp: 100, maxHp: 100, moving: false, firing: false },
          target: { userId: 8, name: 'enemy', hp: 100, maxHp: 100, distance: 5000, moving: false, firing: false }
        },
        battlePresentation: panelActivityIdle
      }
    };
    const panelActivityRecent = buildCompactBrowserlessStatus(
      browserlessCompactStatusSource(panelActivityState),
      { nowMs: panelActivityStartedAt + 2999 }
    );
    const panelActivityExpired = buildCompactBrowserlessStatus(
      browserlessCompactStatusSource(panelActivityState),
      { nowMs: panelActivityStartedAt + 3001 }
    );
    const groupedBlockingFactors = groupBlockingFactorsCore([
      { type: 'player', userId: 31361, name: 'mango', reason: 'active-near-login-point' },
      { type: 'player', userId: 31361, name: 'mango', reason: 'damage-actor-near-login-point' }
    ]);
    const panelAfkBattleCompact = buildCompactBrowserlessStatus({
      session: { userId: 7, sessionToken: 'panel-self-test-token' },
      runner: { running: true, currentAction: { kind: 'profit-attack', target: { userId: 9, distance: 800 } } },
      current: {
        self: { userId: 7, name: 'self', x: 300, y: 400, hp: 100, maxHp: 100 },
        decision: {
          kind: 'profit-candidate',
          band: 'profit',
          at: '2026-07-20T00:01:01.000Z',
          action: {
            kind: 'attack',
            band: 'profit',
            target: { userId: 9, name: 'afk-enemy', hp: 100, distance: 800, active: false }
          }
        },
        combatSummary: { actionEligible: false, target: null },
        battlePresentation: panelAfkPresentationFiring
      }
    }, { nowMs: panelAfkShotAt + 1000 });
    const panelRetargetPresentationInitial = browserlessBattlePresentation(null, {
      kind: 'combat-live',
      band: 'combat',
      at: '2026-07-30T07:47:54.065Z',
      action: { kind: 'combat-live', band: 'combat', target: { userId: 37288, distance: 13798 } },
      input: { self: { userId: 7, x: 14490, y: -2347 } }
    });
    const panelRetargetPresentationMoved = browserlessBattlePresentation(panelRetargetPresentationInitial, {
      kind: 'combat-live',
      band: 'combat',
      at: '2026-07-30T07:47:55.080Z',
      action: { kind: 'combat-live', band: 'combat', target: { userId: 37288, distance: 12703 } },
      input: { self: { userId: 7, x: 13930, y: -2907 } }
    });
    const panelRetargetCompact = buildCompactBrowserlessStatus({
      session: { userId: 7, sessionToken: 'panel-self-test-token' },
      runner: { running: true, currentAction: { kind: 'combat-live', target: { userId: 37288, distance: 12703 } } },
      current: {
        self: { userId: 7, name: 'self', x: 13930, y: -2907, hp: 100, maxHp: 100 },
        decision: {
          kind: 'combat-live',
          band: 'combat',
          at: '2026-07-30T07:47:55.080Z',
          target: { userId: 37288, name: 'new-enemy', distance: 12703 }
        },
        combatSummary: {
          movementDistance: 79246,
          self: { userId: 7, name: 'self', hp: 100, maxHp: 100 },
          target: { userId: 37288, name: 'new-enemy', hp: 100, distance: 12703 }
        },
        battlePresentation: panelRetargetPresentationMoved
      }
    }, { nowMs: Date.parse('2026-07-30T07:47:55.080Z') });
    const panelMismatchedBattleCompact = buildCompactBrowserlessStatus({
      session: { userId: 7, sessionToken: 'panel-self-test-token' },
      runner: { running: true, currentAction: { kind: 'attack', target: { userId: 9, distance: 800 } } },
      current: {
        self: { userId: 7, name: 'self', x: 300, y: 400, hp: 100, maxHp: 100 },
        decision: {
          kind: 'attack',
          band: 'profit',
          at: '2026-07-20T00:01:01.000Z',
          target: { userId: 9, name: 'afk-enemy', hp: 100, distance: 800, active: false }
        },
        battlePresentation: { ...panelAfkPresentationMoved, targetKey: 'player:10' }
      }
    }, {});
    const confirmedLeaveCanaryFixture = {
      runId: 'confirmed-leave-hp-sync',
      completedAt: '2026-07-23T16:09:53.879Z',
      state: {
        realtime: {
          tick: 93000,
          self: { user_id: 7, name: 'self', x: 100, y: 200, hp: 79 }
        }
      },
      entry: { firstSelf: { user_id: 7, name: 'self', x: 0, y: 0, hp: 100 } },
      leave: {
        ok: true,
        attempts: [{
          ok: true,
          response: {
            ok: true,
            event: 'left',
            user_id: 7,
            name: 'self',
            x: 110,
            y: 210,
            hp: 76,
            stamina_5s_remaining_milli: 6500,
            stamina_1h_remaining_milli: 2900000,
            stamina_1d_remaining_milli: 19000000
          }
        }]
      }
    };
    const confirmedLeaveLearned = learnedLoginPointFromCanary(confirmedLeaveCanaryFixture);
    const confirmedLeaveLastKnown = finalLastKnownFromCanary(
      {
        self: { userId: 7, name: 'self', hp: 79 },
        stamina: { stamina1dRemainingMilli: 19001000 },
        at: '2026-07-23T16:09:53.300Z',
        tick: 92990
      },
      confirmedLeaveLearned.finalSelf,
      confirmedLeaveCanaryFixture,
      Date.parse(confirmedLeaveCanaryFixture.completedAt)
    );
    const confirmedLeavePanelCompact = buildCompactBrowserlessStatus({
      session: { userId: 7, sessionToken: 'panel-self-test-token' },
      runner: { running: true, currentAction: { kind: 'loop-wait', reason: 'combat-hp-disadvantage-leave' } },
      current: { self: confirmedLeaveLearned.finalSelf },
      lastKnown: confirmedLeaveLastKnown,
      stats: {
        currentSession: { online: false, exitedAt: confirmedLeaveCanaryFixture.completedAt },
        lastExit: { at: confirmedLeaveCanaryFixture.completedAt, reason: 'combat-hp-disadvantage-leave' }
      }
    }, { nowMs: Date.parse(confirmedLeaveCanaryFixture.completedAt) + 1000 });
    const panelCombatState = {};
    const panelCombatInput = (nowMs, selfX, selfY) => ({
      userId: 7,
      realtime: {
        tick: Math.round(nowMs / 50),
        self: { entity_id: 1, user_id: 7, x: selfX, y: selfY, hp: 100 },
        entities: [
          { entity_id: 1, user_id: 7, x: selfX, y: selfY, hp: 100 },
          { entity_id: 2, user_id: 8, name: 'enemy', x: 1000, y: 0, hp: 100, current_join_mode: 'Active', firing: true }
        ],
        bullets: []
      }
    });
    const panelCombatInitial = buildBrowserlessCombatDryRun(panelCombatInput(1000, 0, 0), {
      nowMs: 1000,
      decisionState: panelCombatState,
      combatAttackRange: 11000
    });
    const panelCombatMoved = buildBrowserlessCombatDryRun(panelCombatInput(1500, 300, 400), {
      nowMs: 1500,
      decisionState: panelCombatState,
      combatAttackRange: 11000
    });
    let chatActivityCount = 0;
    const chatSendInputs = [];
    const statusTestHandle = await startStatusServer({
      host: '127.0.0.1',
      port: 0,
      webToken: 'status-self-test-token',
      getChat: () => ({ ok: true, sendAvailable: true, activityCount: chatActivityCount, messages: [] }),
      onChatActivity: () => { chatActivityCount += 1; },
      onChatSend: text => {
        chatSendInputs.push(text);
        return { ok: true, reason: 'self-test-chat-sent', textLength: String(text).length };
      }
    });
    let statusServerChatTest;
    try {
      const base = `http://127.0.0.1:${statusTestHandle.port}`;
      const pageResponse = await fetch(`${base}/`);
      const pageHtml = await pageResponse.text();
      const pageScript = pageHtml.match(/<script>([\s\S]*)<\/script>/)?.[1] || '';
      let pageScriptParses = false;
      try {
        Function(pageScript);
        pageScriptParses = Boolean(pageScript);
      } catch (_) {
        pageScriptParses = false;
      }
      const unauthorizedResponse = await fetch(`${base}/api/chat`);
      const chatResponse = await fetch(`${base}/api/chat?token=status-self-test-token`);
      const chatBody = await chatResponse.json();
      const sendResponse = await fetch(`${base}/api/chat/send?token=status-self-test-token`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'hello' })
      });
      const sendBody = await sendResponse.json();
      const targetMarkerInsideSharedRowEdge = pageHtml.includes('left:0;top:-1px;bottom:-1px;width:3px');
      const targetMarkerAvoidsAdjacentOverlap = pageHtml.includes('.target-current+.target-current::before,.target-current+.target-route-next::before,.target-route-next+.target-current::before,.target-route-next+.target-route-next::before{top:0}');
      const targetMarkerBoundaryOwnership = targetMarkerInsideSharedRowEdge && targetMarkerAvoidsAdjacentOverlap;
      const loginPointBlockerPanelPresent = pageHtml.includes('function blockingFactorsText(status)')
        && pageHtml.includes("addRow(rowsOut, '阻碍因素', blockingFactorsText(status))")
        && pageHtml.includes("addRow(rowsOut, '单人阻挡', singleBlocker)");
      const panelDetailTest = {
        ok: Boolean(
          panelDualTargetCompact.targets?.mode === 'dual'
          && panelDualTargetCompact.targets.primary?.userId === 9
          && panelDualTargetCompact.targets.secondary?.userId === 8
          && panelDualTargetCompact.combat?.primaryTarget?.userId === 9
          && panelDualTargetCompact.combat?.secondaryTarget?.userId === 8
          && panelDualTargetRoles.mode === 'dual'
          && panelDualTargetRoles.primary?.userId === 9
          && panelDualTargetRoles.secondary?.userId === 8
          && panelRecoveryCompact.targets?.mode === 'none'
          && panelRecoveryCompact.targets?.primary === null
          && panelRecoveryCompact.targets?.secondary === null
          && panelRecoveryCompact.combat?.primaryTarget === null
          && panelRecoveryRoles.mode === 'none'
          && panelRecoveryRoles.primary === null
          && panelRecoveryRoles.secondary === null
          && panelProfitHoldCompact.targets?.primary?.id === 'hold-coin'
          && panelProfitHoldRoles.primary?.id === 'hold-coin'
          && remoteTargetActivityTextCore({ active: true }) === '活动玩家'
          && remoteTargetActivityTextCore({ active: false, moving: false, firing: false }) === '挂机玩家'
          && pageHtml.includes('>Drop排行</h2>')
          && pageHtml.includes('grid-template-columns:minmax(0,1.3fr) minmax(0,.44fr) minmax(0,.55fr) minmax(0,.8fr)')
          // 每一列都要有右 padding, 末列不得例外, 否则额度数字会贴到 scrollbar-gutter 上。
          && pageHtml.includes('.high-drop-cell{box-sizing:border-box;min-width:0;padding-right:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}')
          && !pageHtml.includes('.high-drop-row>.high-drop-cell:last-child{padding-right')
          // 页内所有滚动条都不要背景, 只留一条半透明滑块。
          && pageHtml.includes(':root{scrollbar-width:thin;scrollbar-color:rgba(155,167,180,.42) transparent}')
          && pageHtml.includes('::-webkit-scrollbar{width:8px;height:8px;background:transparent}')
          && pageHtml.includes('::-webkit-scrollbar-track,::-webkit-scrollbar-track-piece,::-webkit-scrollbar-corner{background:transparent;border:0;box-shadow:none}')
          && pageHtml.includes('::-webkit-scrollbar-thumb{border-radius:999px;background:rgba(155,167,180,.42)}')
          && pageHtml.includes('id="transportHealthMode"')
          && pageHtml.includes('id="transportLatency"')
          && pageHtml.includes('id="transportFrameLoss"')
          && pageHtml.includes('帧丢失（推断）')
          && pageHtml.includes("metricValueFragment(current, metricKind, 'ms')")
          && pageHtml.includes("metricValueFragment(p90, metricKind, 'ms')")
          && pageHtml.includes("metricValueFragment(movement, 'movement', 'ms')")
          && pageHtml.includes("metricValueFragment(shooting, 'shooting', 'ms')")
          && pageHtml.includes("? 'transport-metric muted'")
          && pageHtml.includes('.transport-metric.muted,.transport-metric.muted .metric-value{color:var(--muted)}')
          && pageHtml.includes("if (health.mode === 'paused') return '挂机暂停'")
          && pageHtml.includes("if (health.mode === 'active') return '活跃采样'")
          && pageHtml.includes("{ text: '更新于', className: 'meta-label' }")
          && pageHtml.includes("{ text: stamp(status.highDropPlayers?.lastSnapshotAt) }")
          && pageHtml.includes("createHighDropRow('玩家名称', 'Drop', '今日收益', '额度', true")
          && pageHtml.includes("let highDropSortField = 'drop'")
          && pageHtml.includes("button.className = 'high-drop-sort' + (highDropSortField === field ? ' active' : '')")
          && pageHtml.includes("button.setAttribute('aria-sort', highDropSortField === field ? 'descending' : 'none')")
          && pageHtml.includes("rankedItems.sort((left, right) => highDropSortValue(right.item, highDropSortField) - highDropSortValue(left.item, highDropSortField)")
          && pageHtml.includes('const highDropBalanceValue = function highDropBalanceValueCore')
          && pageHtml.includes('externalBalance / 500000')
          && pageHtml.includes('toFixed(3)')
          && !pageHtml.includes('initial * 20 + (latest - initial) * 2')
          && pageHtml.includes('.high-drop-name.self.online,.high-drop-values.self.online{color:var(--green)}')
          && pageHtml.includes("+ (self ? ' self' : '')")
          && pageHtml.includes("if (reason === 'single-coin-bait-hold') return '正在等待'")
          && pageHtml.includes("'realtime-control-released': '当前没有需要实时接管的战斗或避险动作，等待常规规划'")
          && pageHtml.includes("if (kind === 'seek-enemy') return '正在靠近高Drop' + remoteTargetActivityText(target);")
          && pageHtml.includes("'easy-kill-active-profit': '历史战斗记录判定为低风险活动收益目标'")
          && pageHtml.includes("function targetDecisionBasisText(status, targetRoles)")
          && pageHtml.includes("addRow(rowsOut, '主目标', targetLabel(targetRoles.primary))")
          && pageHtml.includes("addRow(rowsOut, '副目标', targetLabel(targetRoles.secondary))")
          && pageHtml.includes("const panelTargetRoles =")
          && pageHtml.includes("'remote-snapshot-profit-target': '远程快照收益目标'")
          && pageHtml.includes("'seek-remote-player': '靠近远程收益玩家'")
          && pageHtml.includes("if (kind === 'seek-remote-player') return remoteSnapshotProfitTargetTitle(target);")
          && pageHtml.includes("if (reason === 'remote-snapshot-profit-target') return '远程快照收益目标';")
          && pageHtml.includes("if (text.includes('snapshot-navigation')) return 'HTTP全局快照';")
          && pageHtml.includes("chatKillsCollapsed = !chatKillsCollapsed")
          && !pageHtml.includes("togglePanelCollapse(document.getElementById('chatPanel'))")
          && pageHtml.includes('id="battleMovementDistance"')
          && pageHtml.includes('id="lastExitPanel"')
          && pageHtml.includes("return '等待重登冷却时间'")
          && pageHtml.includes("return { state: 'cooldown', cooldown: true, text: '重登冷却中，冷却结束后再检查' }")
          && pageHtml.includes("return withCooldown({ state: 'pending', afterOffline: true, text: '离线后等待快照检查' });")
          && pageHtml.includes('function loginPointSafetyCheckInFlight(status)')
          && pageHtml.includes("text: display.text + '（重登冷却中）'")
          && pageHtml.includes("if (phase === 'snapshot-wait') return '正在等待新的登录点快照';")
          && pageHtml.includes("if (loginPointSafetyCheckInFlight(status)) return '正在检查登录点安全';")
          && pageHtml.includes("checking: true, text: '上次检查不安全，正在检查新快照'")
          && pageHtml.includes('if (!snapshotStateShown && !loginDisplay.afterOffline && !loginDisplay.cooldown)')
          && pageHtml.includes("return '等待登录点快照安全检查'")
          && pageHtml.includes("if (reason === 'login-point-safe-connecting') return '登录点已安全，正在连接游戏'")
          && pageHtml.includes("text: '上次检查安全，等待新快照'")
          && pageHtml.includes("text: '上次检查不安全，等待新快照'")
          && pageHtml.includes("if (display.reviewing) return classAttrs('warn');")
          // 离线面板只保留一个"最近检查"时间, 快照拉取/完成/安全检查不再各占一行。
          && pageHtml.includes("addRow(rowsOut, '最近检查', fullStamp(snapshotCheckAt))")
          && !pageHtml.includes("loginDisplay.reviewing ? '上次检查时间' : '检查时间'")
          && !pageHtml.includes("addRow(rowsOut, '最近拉取时间'")
          && !pageHtml.includes("addRow(rowsOut, '最近完成时间'")
          && !pageHtml.includes("addRow(rowsOut, '最近快照完成时间'")
          && pageHtml.includes("if (online && !liveCombat) addRow(rowsOut, '原因', actionReasonDisplay(status), true)")
          && pageHtml.includes("const liveCombat = Boolean(realtimeOnline && (kind === 'combat-live' || action.kind === 'combat-live'))")
          && pageHtml.includes("'活动 ' + bool(target.active)")
          && !pageHtml.includes("'危险 ' + bool(target.active)")
          && pageHtml.includes('const exit = status.game?.inGame')
          // 计划时刻和它的倒计时是同一件事, 合并成一行并由 countdownPrefix 续算。
          && pageHtml.includes("addRow(rowsOut, '下次快照检查', scheduledAtText(scheduledSnapshotCheckAt), false, scheduledAtAttrs(scheduledSnapshotCheckAt))")
          && pageHtml.includes("addRow(rowsOut, '冷却结束', scheduledAtText(cooldownAt), false, scheduledAtAttrs(cooldownAt))")
          && pageHtml.includes("const scheduledAtText = iso => {")
          && pageHtml.includes("return clock === '--' ? stampText : stampText + '（' + clock + '后）';")
          && pageHtml.includes("const scheduledAtAttrs = iso => ({ countdownAt: iso, countdownPrefix: fullStamp(iso) });")
          && pageHtml.includes("const prefix = node.dataset.countdownPrefix || '';")
          && !pageHtml.includes("addRow(rowsOut, '检查倒计时'")
          && !pageHtml.includes("addRow(rowsOut, '冷却剩余'")
          && !pageHtml.includes("addRow(rowsOut, '重试剩余'")
          // Cloudflare 挑战只保留状态/时间/一条合并的检测详情。
          && pageHtml.includes("addRow(rowsOut, '检测详情', joinNonBlank([")
          && !pageHtml.includes("addRow(rowsOut, '检测依据'")
          && !pageHtml.includes("addRow(rowsOut, 'HTTP 状态'")
          && !pageHtml.includes("addRow(rowsOut, 'CF Ray'")
          && !pageHtml.includes("addRow(rowsOut, '游戏状态'")
          && !pageHtml.includes("addRow(rowsOut, '退出请求',")
          // 退出历史归"上次退出", "当前动作"只在退出确认仍是当前动作时展示,
          // 失败原因必须翻译, 不能把原始英文 token 直接标红。
          && pageHtml.includes("if (!online && (recovery.active || action.kind === 'exit-recovery')) {")
          && pageHtml.includes("addRow(rowsOut, '退出确认失败', reasonText(recovery.lastError), true, classAttrs('bad'));")
          && !pageHtml.includes("addRow(rowsOut, '退出触发', reasonText(recovery.triggerReason)")
          && !pageHtml.includes("addRow(rowsOut, '最近退出请求'")
          && !pageHtml.includes("addRow(rowsOut, '最近响应'")
          && pageHtml.includes("addRow(rowsOut, '预检结果', sourceIpPreflightLastResultText(status.network));")
          && !pageHtml.includes("addRow(rowsOut, reentry ? '当前坐标' : '登录点坐标'")
          // 上次退出: 确认与确认时间合并, 干净的 200 与"重登许可 是"不占行。
          && pageHtml.includes("? confirmationText + '（' + fullStamp(recovery.confirmationAt) + '）'")
          && !pageHtml.includes("addRow(rowsOut, '退出确认时间'")
          && pageHtml.includes('if (httpStatuses.some(item => number(item) !== 200)) {')
          && pageHtml.includes('if (recovery.reloginAllowed !== true) {')
          && pageHtml.includes("addRow(rowsOut, '下次退出确认', scheduledAtText(recovery.nextRetryAt), false, scheduledAtAttrs(recovery.nextRetryAt));")
          // 主目标连线必须跟随它指向的对象上色: 金币黄、挂机绿、快照灰,
          // 只有真实战斗才是红色。视野外与金币目标没有玩家 marker,
          // 需要回落到目标描述而不是整条线默认成战斗红。
          && pageHtml.includes('function mapTargetPathColor(status, target, marker) {')
          && pageHtml.includes("if (marker?.kind === 'coin') return '#fbbf24';")
          && pageHtml.includes("if (marker?.kind === 'player' && marker.color) return marker.color;")
          && pageHtml.includes('function mapTargetDescriptorRole(target) {')
          && pageHtml.includes('function mapTargetNearbyRole(status, target) {')
          && pageHtml.includes('function mapTargetMatchesCoin(target, item) {')
          && pageHtml.includes('color: mapTargetPathColor(status, target, marker || (fallbackPoint?.kind ? fallbackPoint : null)),')
          && pageHtml.includes('role: coinRole,')
          // 视野外目标行沿用同类视野内图标, 行样式仍提供快照灰。
          && pageHtml.includes("const targetIcon = targetType === 'remote-snapshot'")
          && pageHtml.includes("? (afkTarget ? 'afk' : 'combat')")
          && pageHtml.includes("{ text: name, icon: selected ? targetIcon : '' },")
          // 竖条 3px + 竖条-图标 5px, 与图标-名称的 5px 一致, 且只右移名称列。
          && pageHtml.includes('.target-current .target-name,.target-route-next .target-name{padding-left:8px}')
          // 已确认离场没有失败可报, 但保留事件仍要留给诊断用。
          && panelStaleRecoveryErrorCompact.exitRecovery.state === 'confirmed-absent'
          && panelStaleRecoveryErrorCompact.exitRecovery.lastError === ''
          && panelStaleRecoveryErrorCompact.exitRecovery.lastAttemptAt === '2026-08-25T07:42:11.803Z'
          && panelStaleRecoveryErrorCompact.exitRecovery.confirmationAt === '2026-08-25T07:42:11.949Z'
          && panelStaleRecoveryErrorCompact.exitRecovery.lastRecoveryEvent?.lastError === 'frame-gap'
          && panelUnconfirmedRecoveryErrorCompact.exitRecovery.state !== 'confirmed-absent'
          && panelUnconfirmedRecoveryErrorCompact.exitRecovery.lastError === 'frame-gap'
          && panelUnconfirmedRecoveryErrorCompact.exitRecovery.lastAttemptAt === '2026-08-25T06:13:48.734Z'
          && pageHtml.includes('Date.parse(reconnectAt) <= Date.now()')
          && !pageHtml.includes("addRow(rowsOut, '预检进度'")
          && !pageHtml.includes("addRow(rowsOut, '当前测试 IP'")
          && !pageHtml.includes("addRow(rowsOut, '下次重连'")
          && !pageHtml.includes("addRow(rowsOut, '剩余时间'")
          && !pageHtml.includes('loginPointProgressText')
          && !pageHtml.includes("addRow(rowsOut, '原因', online ? actionReasonDisplay(status) : reasonText(reason), true)")
          && pageHtml.includes("translated === '正在退出游戏' ? '已退出游戏' : translated")
          && pageHtml.includes('防守交战持续无进展，撤退后仍无法脱离，主动退出')
          && pageHtml.includes('groupBlockingFactors(factors).map(row =>')
          && !pageHtml.includes("[offlineRole ? '上次血量' : '血量'")
          && !pageHtml.includes("[offlineRole ? '上次Drop' : 'Drop'")
          && pageHtml.includes("updateBattlePanel(s);\n      updateLastExitPanel(s);")
          && pageHtml.includes('const staminaExhausted = isStaminaExhaustionExitReason(reason);')
          && pageHtml.includes('if (battle && !staminaExhausted)')
          && pageHtml.includes('grid-column:2;grid-row:2')
          && pageHtml.includes("setText(prefix + 'Hp', hp === null ? '--' : integer(hp))")
          && pageHtml.includes('const fleeTargetId = targetIdentity(status.action?.target);')
          && pageHtml.includes('const isFleeTarget = fleeTarget && selected')
          && pageHtml.includes("{ text: unit(actor?.stamina5s), className: battleStaminaClass(actor) }")
          && pageHtml.includes("{ text: spentStaminaUnit(currentSession.staminaSpentMs), className: 'ok' }")
          && pageHtml.includes("{ text: integer(currentSession.kills), className: 'bad' }")
          && panelStatsCompact.stats.today.initialDrop === 100
          && panelStatsCompact.stats.today.maxDrop === 110
          && panelStatsCompact.stats.today.latestDrop === 20
          && panelStatsCompact.network.transportHealth.mode === 'active'
          && panelStatsCompact.network.transportHealth.latency.p90Ms === 448
          && panelStatsCompact.network.transportHealth.frameLoss.percent === 0.5
          && panelStatsCompact.network.transportHealth.command.movementP90Ms === 244
          && panelSingleCoinCompact.stats.currentSession.coinsGained === 1
          && panelSingleCoinCompact.stats.today.coinsGained === 0
          && panelTwoCoinCompact.stats.currentSession.coinsGained === 2
          && panelTwoCoinCompact.stats.today.coinsGained === 2
          && panelStatsCompact.stats.currentSession.coinsGained === 20
          && panelStatsCompact.stats.today.coinsGained === 20
          && panelOfflineTransitionCompact.game.inGame === false
          && panelOfflineTransitionCompact.stats.currentSession.online === false
          && panelOfflineTransitionCompact.stats.currentSession.durationMs === 60000
          && panelOfflineTransitionCompact.stats.offline.lastExitReason === 'combat-low-hp-disadvantage-leave'
          && panelOfflineTransitionCompact.action.kind === 'loop-wait'
          && panelOfflineTransitionCompact.action.reason === 'login-point-safe-connecting'
          && panelPreLoginCompact.game.inGame === false
          && panelPreLoginCompact.action.kind === 'loop-wait'
          && panelPreLoginCompact.action.reason === 'next-login-point-pending-snapshot-safety'
          && panelCooldownUnsafeCompact.stats.offline.reconnectRemainingMs === 30000
          && panelCooldownUnsafeCompact.loginPointSafety.reason === 'damage-actor-near-login-point'
          && panelSnapshotEdgePending.detail.required === 1
          && panelSnapshotWaitCompact.stats.offline.nextReconnectAt === ''
          && panelSnapshotWaitCompact.stats.offline.scheduledReconnectAt === ''
          && panelSnapshotWaitCompact.stats.offline.reconnectRemainingMs === null
          && panelSnapshotWaitCompact.action.reason === 'source-ip-snapshot-safety-wait'
          && panelSnapshotWaitCompact.action.nextSnapshotCheckAt === '2026-07-27T08:26:10.000Z'
          && panelUnsafeRecheckCompact.loginPointSafety.detail.previousCheck?.ok === false
          && panelUnsafeRecheckCompact.loginPointSafety.detail.previousCheck?.reason === 'damage-actor-near-login-point'
          && panelUnsafeRecheckCompact.loginPointSafety.detail.previousCheck?.checkedAt === '2026-07-27T08:22:21.694Z'
          && panelSafeRecheckCompact.loginPointSafety.detail.previousCheck?.ok === true
          && panelSafeRecheckCompact.loginPointSafety.detail.previousCheck?.reason === 'safe'
          && panelNeverCheckedCompact.loginPointSafety.detail.previousCheck === null
          && panelOnlineCombatWithoutSelfCompact.game.inGame === true
          && panelOnlineCombatWithoutSelfCompact.stats.currentSession.online === true
          && panelOnlineCombatWithoutSelfCompact.stats.currentSession.realtimeOnline === true
          && panelOnlineCombatWithoutSelfCompact.action.kind === 'combat-live'
          && panelOnlineCombatStopCompact.game.inGame === true
          && panelOnlineCombatStopCompact.stats.currentSession.online === true
          && panelOnlineCombatStopCompact.stats.currentSession.realtimeOnline === true
          && panelOnlineCombatStopCompact.action.kind === 'combat-live'
          && lastExitPanelVisibleCore(panelOnlineCombatStopCompact) === false
          && panelTransportRecoveryCompact.game.inGame === false
          && panelTransportRecoveryCompact.stats.currentSession.online === true
          && panelTransportRecoveryCompact.stats.currentSession.realtimeOnline === false
          && panelTransportRecoveryCompact.stats.offline.lastExitReason === 'frame-gap'
          && panelTransportRecoveryCompact.recentExit?.reason === 'frame-gap'
          && lastExitPanelVisibleCore(panelTransportRecoveryCompact) === false
          && lastExitPanelVisibleCore(panelOnlineCombatWithoutSelfCompact) === false
          && panelLaggingSessionStatsCompact.game.inGame === true
          && panelLaggingSessionStatsCompact.stats.currentSession.online === true
          && panelLaggingSessionStatsCompact.stats.currentSession.realtimeOnline === true
          && panelLaggingSessionStatsCompact.action.kind === 'combat-live'
          && lastExitPanelVisibleCore(panelLaggingSessionStatsCompact) === false
          && browserlessCoinPickupObservationTest.ok
          && browserlessSnapshotCoinPickupObservationTest.ok
          && browserlessFastSnapshotPickupObservationTest.ok
          && highDropRankingTest
          && highDropSortTest.ok
          && highDropRecencyTest.ok
          && staminaExhaustionPanelTest
          && panelBattleCompact.battle.distance === 5600
          && panelBattleCompact.battle.movementDistance === 20000
          && panelAfkPresentationInitial.movementDistance === 0
          && panelAfkPresentationMoved.movementDistance === 500
          && panelAfkBattleCompact.battle.movementDistance === 500
          && panelRetargetCompact.battle.movementDistance === 792
          && panelAfkBattleCompact.battle.self.moving === true
          && panelAfkBattleCompact.battle.self.firing === true
          && panelMismatchedBattleCompact.battle.movementDistance === null
          && confirmedLeaveLearned.finalSelf.hp === 76
          && confirmedLeaveLearned.loginPoint.hp === 76
          && confirmedLeavePanelCompact.lastKnown.self.hp === 76
          && confirmedLeavePanelCompact.lastKnown.stamina.remaining1d === 19000000
          && panelActivityRecent.battle.self.moving === true
          && panelActivityRecent.battle.self.firing === true
          && panelActivityRecent.battle.target.moving === true
          && panelActivityRecent.battle.target.firing === true
          && panelActivityExpired.battle.self.moving === false
          && panelActivityExpired.battle.self.firing === false
          && panelActivityExpired.battle.target.moving === false
          && panelActivityExpired.battle.target.firing === false
          && groupedBlockingFactors.length === 1
          && groupedBlockingFactors[0].reasons.length === 2
          && panelCombatInitial.movementDistance === 0
          && panelCombatMoved.movementDistance === 500
          && nearbyFleeTargetPanelTest.ok
          && nearbySelectedPlayerCoordinatesTest.ok
          && nearbyMapCoordinatesTest.ok
          && nearbyMapLegacyCompatibilityTest.ok
          && realtimeLootSafetyArbitrationTest.ok
        ),
        selfDropRange: {
          initial: panelStatsCompact.stats.today.initialDrop,
          max: panelStatsCompact.stats.today.maxDrop,
          latest: panelStatsCompact.stats.today.latestDrop
        },
        pickedCoins: {
          single: panelSingleCoinCompact.stats.currentSession.coinsGained,
          pair: panelTwoCoinCompact.stats.currentSession.coinsGained,
          calibrated: panelStatsCompact.stats.currentSession.coinsGained
        },
        coinPickupObservation: browserlessCoinPickupObservationTest,
        snapshotCoinPickupObservation: browserlessSnapshotCoinPickupObservationTest,
        fastSnapshotCoinPickupObservation: browserlessFastSnapshotPickupObservationTest,
        highDropRanking: highDropRankingTest,
        highDropSort: highDropSortTest,
        highDropRecency: highDropRecencyTest,
        staminaExhaustionPanel: staminaExhaustionPanelTest,
        offlineTransition: {
          online: panelOfflineTransitionCompact.stats.currentSession.online,
          durationMs: panelOfflineTransitionCompact.stats.currentSession.durationMs,
          lastExitReason: panelOfflineTransitionCompact.stats.offline.lastExitReason,
          actionReason: panelOfflineTransitionCompact.action.reason
        },
        preLoginActionReason: panelPreLoginCompact.action.reason,
        loginPointRecheck: {
          unsafe: panelUnsafeRecheckCompact.loginPointSafety.detail.previousCheck,
          safe: panelSafeRecheckCompact.loginPointSafety.detail.previousCheck,
          neverChecked: panelNeverCheckedCompact.loginPointSafety.detail.previousCheck
        },
        onlineCombatWithoutSelf: {
          inGame: panelOnlineCombatWithoutSelfCompact.game.inGame,
          online: panelOnlineCombatWithoutSelfCompact.stats.currentSession.online,
          realtimeOnline: panelOnlineCombatWithoutSelfCompact.stats.currentSession.realtimeOnline,
          actionKind: panelOnlineCombatWithoutSelfCompact.action.kind
        },
        onlineCombatStop: {
          inGame: panelOnlineCombatStopCompact.game.inGame,
          online: panelOnlineCombatStopCompact.stats.currentSession.online,
          realtimeOnline: panelOnlineCombatStopCompact.stats.currentSession.realtimeOnline,
          actionKind: panelOnlineCombatStopCompact.action.kind,
          lastExitPanelVisible: lastExitPanelVisibleCore(panelOnlineCombatStopCompact)
        },
        transportRecovery: {
          inGame: panelTransportRecoveryCompact.game.inGame,
          online: panelTransportRecoveryCompact.stats.currentSession.online,
          realtimeOnline: panelTransportRecoveryCompact.stats.currentSession.realtimeOnline,
          lastExitReason: panelTransportRecoveryCompact.stats.offline.lastExitReason,
          recentExitReason: panelTransportRecoveryCompact.recentExit?.reason || '',
          lastExitPanelVisible: lastExitPanelVisibleCore(panelTransportRecoveryCompact)
        },
        laggingSessionStats: {
          inGame: panelLaggingSessionStatsCompact.game.inGame,
          online: panelLaggingSessionStatsCompact.stats.currentSession.online,
          realtimeOnline: panelLaggingSessionStatsCompact.stats.currentSession.realtimeOnline,
          actionKind: panelLaggingSessionStatsCompact.action.kind,
          lastExitPanelVisible: lastExitPanelVisibleCore(panelLaggingSessionStatsCompact)
        },
        battleDistance: panelBattleCompact.battle.distance,
        battleMovementDistance: panelBattleCompact.battle.movementDistance,
        afkBattleMovementDistance: panelAfkBattleCompact.battle.movementDistance,
        retargetBattleMovementDistance: panelRetargetCompact.battle.movementDistance,
        afkBattleSelfState: {
          moving: panelAfkBattleCompact.battle.self.moving,
          firing: panelAfkBattleCompact.battle.self.firing
        },
        confirmedLeaveLastKnown: {
          hp: confirmedLeavePanelCompact.lastKnown.self.hp,
          stamina1d: confirmedLeavePanelCompact.lastKnown.stamina.remaining1d
        },
        measuredMovementDistance: panelCombatMoved.movementDistance,
        nearbyFleeTargetPanel: nearbyFleeTargetPanelTest,
        nearbySelectedPlayerCoordinates: nearbySelectedPlayerCoordinatesTest,
        nearbyMapCoordinates: nearbyMapCoordinatesTest,
        nearbyMapTrails: mapTrailTrackerSelfTest,
        nearbyMapLegacyCompatibility: nearbyMapLegacyCompatibilityTest,
        realtimeLootSafetyArbitration: realtimeLootSafetyArbitrationTest
      };
      statusServerChatTest = {
        ok: Boolean(
          pageResponse.ok
          && pageHtml.includes('id="chatPanel"')
          && pageHtml.includes('id="mapPanel"')
          && pageHtml.includes('id="targetMap"')
          && pageHtml.indexOf('id="mapPanel"') < pageHtml.indexOf('id="nearbyGrid"')
          && pageHtml.includes('MAP_STALE_MS = 15000')
          && pageHtml.includes('MAP_MOVE_ANIMATION_MS = 260')
          && pageHtml.includes('MAP_TRAIL_MAX_AGE_MS = 30000')
          && pageHtml.includes('MAP_TRAIL_LINE_WIDTH = 2')
          && pageHtml.includes('const sourceIpDeferredDetailText = status => dailyFirstLoginExempt(status)')
          && pageHtml.includes('每日零点首次登录豁免仍有效，00:00:00 将直接使用主 IP 登录')
          && pageHtml.includes('先使用主 IP 做快照安全检查')
          && pageHtml.includes('function startMapMarkerAnimation(scene, markers, animate = true)')
          && pageHtml.includes('function syncMapTrailHistory(status, markers, nowMs)')
          && pageHtml.includes('function drawMapTrails(context, scene, markers, frame, progress = 1)')
          && pageHtml.includes('function buildMapTrailGeometry(scene, markers, frame')
          && pageHtml.includes('function renderedMapTrailGeometry(scene, markers, frame, camera, progress = 1)')
          && pageHtml.includes('const backend = status?.mapTrails')
          && pageHtml.includes("if (!key.startsWith('self:') && !markerColors.has(key)) continue;")
          && pageHtml.includes('if (!trailKeys.has(key)) continue;')
          && pageHtml.includes('const trailNowMs = mapTrailReferenceNowMs(status?.mapTrails, Date.now());')
          && pageHtml.includes('syncMapTrailHistory(status, markers, trailNowMs)')
          && pageHtml.includes('context.lineWidth = MAP_TRAIL_LINE_WIDTH')
          && pageHtml.includes('opacity: mapTrailOpacity(samples.at(-1).at, scene.trailNowMs, MAP_TRAIL_MAX_AGE_MS)')
          && pageHtml.includes('lineProgress: progress')
          && pageHtml.includes('const camera = interpolateMapCamera(mapTrailCamera(scene, frame), scene.previousTrailCamera, progress);')
          && pageHtml.includes('previousTrailGeometry: mapRenderedTrailGeometry')
          && pageHtml.includes('previousTrailCamera: mapRenderedTrailCamera')
          && pageHtml.includes('previousTargetLinePositions: mapRenderedTargetLinePositions')
          && pageHtml.includes('context.lineTo(points[index].px, points[index].py)')
          && pageHtml.includes('context.setLineDash([5, 4])')
          && !pageHtml.includes('quadraticCurveTo(')
          && !pageHtml.includes('lineDashOffset')
          && !pageHtml.includes('function startMapLineAnimation')
          && pageHtml.includes('id="mapFullscreenToggle"')
          && pageHtml.includes('body.map-page-fullscreen #mapPanel')
          && pageHtml.includes('document.body.classList.toggle(\'map-page-fullscreen\', !active)')
          && pageHtml.includes('退出地图网页全屏')
          && !pageHtml.includes('requestFullscreen')
          && !pageHtml.includes('fullscreenchange')
          && pageHtml.includes("mapKey: mapMarkerKey('coin', item?.[0])")
          && pageHtml.includes("mapKey: mapMarkerKey('player', item?.[9], name)")
          && pageHtml.includes("window.matchMedia('(prefers-reduced-motion: reduce)').matches")
          && pageHtml.includes('function traceMapDirectionArrow(context, marker)')
          && pageHtml.includes('const arcRadius = marker.radius + Math.max(1.5, marker.radius * .3)')
          && pageHtml.includes("context.strokeStyle = 'rgba(251,113,133,.68)'")
          && pageHtml.includes('context.lineWidth = .75')
          && pageHtml.includes("targetRole === 'remote-snapshot'")
          && pageHtml.includes('context.setLineDash([4, 4])')
          && pageHtml.includes("color: remoteSnapshot ? '#9ca3af'")
          && pageHtml.includes('mapRemoteTargetPosition')
          && pageHtml.includes('const leftSide = marker.px < marker.mapCenter')
          && pageHtml.includes('const topSide = marker.py < marker.mapCenter')
          && pageHtml.includes('Math.min(size - edgePadding - textWidth, x)')
          && pageHtml.includes("name + ' HP ' + integer(item?.[1])")
          && pageHtml.includes("amount > 1 ? integer(amount) : ''")
          && !pageHtml.includes('context.arc(marker.px, marker.py, marker.radius + 5')
          && pageScriptParses
          && pageHtml.includes('/api/chat/send')
          && unauthorizedResponse.status === 401
          && chatResponse.ok
          && chatBody.activityCount === 1
          && sendResponse.ok
          && sendBody.reason === 'self-test-chat-sent'
          && chatSendInputs[0] === 'hello'
          && targetMarkerBoundaryOwnership
          && loginPointBlockerPanelPresent
          && panelDetailTest.ok
        ),
        unauthorizedStatus: unauthorizedResponse.status,
        activityCount: chatActivityCount,
        sendInputs: chatSendInputs.slice(),
        webChatPanelPresent: pageHtml.includes('id="chatPanel"'),
        targetMapPanelPresent: pageHtml.includes('id="targetMap"'),
        pageScriptParses,
        targetMarkerInsideSharedRowEdge,
        targetMarkerAvoidsAdjacentOverlap,
        targetMarkerBoundaryOwnership,
        loginPointBlockerPanelPresent,
        staleRecoveryError: {
          confirmed: {
            state: panelStaleRecoveryErrorCompact.exitRecovery.state,
            lastError: panelStaleRecoveryErrorCompact.exitRecovery.lastError,
            lastAttemptAt: panelStaleRecoveryErrorCompact.exitRecovery.lastAttemptAt,
            retainedEventError: panelStaleRecoveryErrorCompact.exitRecovery.lastRecoveryEvent?.lastError || ''
          },
          unconfirmed: {
            state: panelUnconfirmedRecoveryErrorCompact.exitRecovery.state,
            lastError: panelUnconfirmedRecoveryErrorCompact.exitRecovery.lastError,
            lastAttemptAt: panelUnconfirmedRecoveryErrorCompact.exitRecovery.lastAttemptAt
          }
        },
        panelDetailTest
      };
    } finally {
      await statusTestHandle.close();
    }
    const complexCombatMainThreadBudget = await runComplexCombatMainThreadBudgetSelfTest(tmp);
    const snapshotEdge = await runSnapshotEdgeSelfTest();
    const cloudflareChallenge = runCloudflareChallengeSelfTest();
    const transportRecoveryCloudflare = (() => {
      const startedAtMs = Date.parse('2026-08-01T00:00:00.000Z');
      const recoveryState = {
        runner: {
          transportRecovery: {
            recoveryId: 'transport-recovery:self-test:1',
            sourceRunId: 'self-test-run',
            startedAt: '2026-08-01T00:00:00.000Z',
            deadlineAt: '2026-08-01T00:00:10.000Z',
            lastRealtimeTick: 321,
            expectedSelfPresent: true
          }
        }
      };
      const resumed = resumeTransportRecoveryAfterCloudflareStop({
        continue: false,
        reason: 'cloudflare-challenge',
        delayMs: 0,
        previousRunId: 'cloudflare-run'
      }, recoveryState, { actionSettlementRecoveryMaxMs: 10000 }, startedAtMs + 1000);
      const expired = resumeTransportRecoveryAfterCloudflareStop({
        continue: false,
        reason: 'cloudflare-challenge',
        delayMs: 0
      }, recoveryState, { actionSettlementRecoveryMaxMs: 10000 }, startedAtMs + 10000);
      const explicitStop = resumeTransportRecoveryAfterCloudflareStop({
        continue: false,
        reason: 'explicit-stop',
        delayMs: 0
      }, recoveryState, { actionSettlementRecoveryMaxMs: 10000 }, startedAtMs + 1000);
      return {
        ok: resumed.continue === true
          && resumed.reason === 'action-settlement-stalled'
          && resumed.delayMs === 1000
          && resumed.transportRecovery?.recoveryId === 'transport-recovery:self-test:1'
          && expired.continue === true
          && expired.delayMs === 0
          && explicitStop.reason === 'explicit-stop'
          && explicitStop.continue === false,
        resumed,
        expired,
        explicitStop
      };
    })();
    const pendingExitRecovery = runPendingExitRecoverySelfTest();
    const pendingExitCanaryGate = await runPendingExitCanaryGateSelfTest();
    const loginRecoveryAssociation = runLoginRecoveryAssociationSelfTest();
    const snapshotAuditPersistence = runSnapshotAuditPersistenceSelfTest(tmp);
    const combatBattleLog = runCombatBattleLogSelfTest();
    const combatAttackClock = runCombatAttackClockSelfTest();
    const combatShotExecution = runCombatShotExecutionSelfTest();
    const combatTargetFrameGap = runCombatTargetFrameGapSelfTest();
    const incomingPressure = runIncomingPressureSelfTest();
    const invulnerableWaitStation = runInvulnerableWaitStationSelfTest();
    const lootRacePositioning = runLootRacePositioningSelfTest();
    const dynamicWhitelist = await require('./dynamic-whitelist-self-test').runDynamicWhitelistSelfTest();
    const recoveryContact = require('./recovery-contact-self-test').runRecoveryContactSelfTest();
    const runnerLog = path.join(tmp, 'logs', '2026-07-08', 'runner.jsonl');
    const text = fs.readFileSync(runnerLog, 'utf8');
    return {
      ok: Boolean(
        sourceIpProbe.ok
        && requestRatePolicy.ok
        && remoteProfitWorker.ok
        && remoteProfitAction.ok
        && remoteProfitDecision.ok
        && invulnerableProfitCommitment.ok
        && afkDynamicFire.ok
        && profitMissionArrival.ok
        && invulnerableAfk.ok
        && missingEnemyHold.ok
        && activeJoinModeProfit.ok
        && requestRateController.ok
        && snapshotRequestScheduler.ok
        && loginPointHighHpExemption.ok
        && dryRun.ok
        && sourceIpPreflight.ok
        && sourceIpPreflightRunner.ok
        && loginSuccessStatePatch.ok
        && criticalLatencyExitRegression.ok
        && establishedCombatLootPriorityTest.ok
        && transportHealth.ok
        && textFrameParsing.ok
        && liveRun.ok
        && completedSnapshotSafetyPersisted.ok
        && runnerResultSummaryOk
        && statusQueueProjectionOk
        && loginPointSingleBlocker.ok
        && singleBlockerConfigOk
        && transportHealthConfigOk
        && staleRestartDrainCleared
        && pendingDeadlineSelfTest.ok
        && /runner-dry-run/.test(text)
        && /runner-finish/.test(text)
        && !/self-test-token/.test(text)
        && wsClosedPlan.continue
        && wsClosedPlan.delayMs === 1000
        && transportDegradedPlan.continue
        && transportDegradedPlan.delayMs === 30000
        && combatExitPlan.continue
        && combatExitPlan.delayMs === 30000
        && restartDrainPlan.continue === false
        && restartDrainPlan.reason === 'restart-drain-ready'
        && restartDrainClosesRuntime
        && signalForceClosesRuntime
        && !apiStopKeepsRuntime
        && legacyRestartDrainExplicitStopClosesRuntime
        && restartDrainSafetyReason === 'restart-drain-ready'
        && forcedStatusConnectionsClosed
        && restartDrainCombat.ready === false
        && restartDrainIdle.ready === true
        && restartDrainUnlinkedPickup.ready === false
        && restartDrainUnlinkedPickup.reason === 'captured-player-commitment-pickup-pending'
        && capturedProfitWait.ready === false
        && capturedProfitWait.reason === 'captured-profit-commitment-active'
        && capturedProfitWait.blocker?.targetId === '895'
        && capturedProfitWait.blocker?.targetDrop === 41
        && capturedProfitDefensiveCombat.ready === false
        && capturedProfitDefensiveCombat.reason === 'captured-profit-commitment-active'
        && capturedProfitReleased.ready === true
        && restartDrainStatus.ready === true
        && restartDrainOfflineLifecycle.snapshotWait === true
        && restartDrainOfflineLifecycle.loginAttempt === false
        && restartDrainOfflineLifecycle.online === false
        && restartDrainOfflineLifecycle.pendingExit === false
        && restartDrainOfflineLifecycle.transportRecovery === false
        && committedDropAllowed
        && !unrelatedDropBlocked
        && productionFootDropReadiness.ready === false
        && productionFootDropReadiness.reason === 'player-drop-pickup'
        && productionFootDropRetained
        && !unrelatedFootDropRetained
        && closedTransportAction.ok === false
        && closedTransportAction.transportClosed === true
        && chatService.ok
        && chatHistoryStore.ok
        && chatHistoryWorker.ok
        && dynamicSnapshotPollerStatus.currentIntervalMs === DEFAULT_CHAT_ACTIVE_INTERVAL_MS
        && snapshotModePollerTest.ok
        && fixedSnapshotPollerTest.ok
        && nearbyCoinRoutePanelTest.ok
        && lateDisplayRoutePanelTest.ok
        && remoteSnapshotTargetDisplayTest.ok
        && remoteSnapshotMapProjectionTest.ok
        && nearbySelectedPlayerCoordinatesTest.ok
        && nearbyMapCoordinatesTest.ok
        && nearbyMapLegacyCompatibilityTest.ok
        && mapTrailTrackerSelfTest.ok
        && statusServerChatTest.ok
        && snapshotEdge.ok
        && cloudflareChallenge.ok
        && transportRecoveryCloudflare.ok
        && pendingExitRecovery.ok
        && pendingExitCanaryGate.ok
        && loginRecoveryAssociation.ok
        && snapshotAuditPersistence.ok
        && combatBattleLog.ok
        && combatAttackClock.ok
        && combatShotExecution.ok
        && combatTargetFrameGap.ok
        && incomingPressure.ok
        && invulnerableWaitStation.ok
        && lootRacePositioning.ok
        && dynamicWhitelist.ok
        && recoveryContact.ok
        && snapshotAudit.ok
        && complexCombatMainThreadBudget.battleLogOk
        // Host scheduling/GC timing is diagnostic; functional runner blocks
        // remain release-gating without turning an external pause into a
        // product failure.
        && complexCombatMainThreadBudget.canaryOk
      ),
      establishedCombatLootPriority: establishedCombatLootPriorityTest,
      sourceIpProbe,
      requestRatePolicy,
      remoteProfitWorker,
      remoteProfitAction,
      remoteProfitDecision,
      invulnerableProfitCommitment,
      afkDynamicFire,
      profitMissionArrival,
      invulnerableAfk,
      missingEnemyHold,
      activeJoinModeProfit,
      requestRateController,
      snapshotRequestScheduler,
      loginPointHighHpExemption,
      sourceIpPreflight,
      sourceIpPreflightRunner,
      loginSuccessStatePatch,
      criticalLatencyExitRegression,
      transportHealth,
      textFrameParsing,
      dryRun,
      liveRun,
      completedSnapshotSafetyPersisted,
      runnerResultSummary: {
        ok: runnerResultSummaryOk,
        bytes: Buffer.byteLength(runnerResultSummaryText),
        value: runnerResultSummary
      },
      statusQueueProjection: {
        ok: statusQueueProjectionOk,
        renderTiming: statusQueueProjection.statusServer?.renderTiming || null
      },
      loginPointSingleBlocker,
      singleBlockerConfigOk,
      loginIntervalSelfTest,
      transportHealthConfigOk,
      staleRestartDrainCleared,
      pendingDeadlineSelfTest,
      wsClosedPlan,
      transportDegradedPlan,
      combatExitPlan,
      restartDrainPlan,
      restartDrainClosesRuntime,
      signalForceClosesRuntime,
      apiStopKeepsRuntime,
      legacyRestartDrainExplicitStopClosesRuntime,
      restartDrainSafetyReason,
      forcedStatusConnectionsClosed,
      restartDrainStatus,
      capturedProfitWait,
      capturedProfitDefensiveCombat,
      capturedProfitReleased,
      restartDrainOfflineLifecycle,
      committedDropAllowed,
      unrelatedDropBlocked,
      productionFootDropReadiness,
      productionFootDropRetained,
      unrelatedFootDropRetained,
      closedTransportAction,
      chatService,
      chatHistoryStore,
      chatHistoryWorker,
      snapshotModePollerTest,
      fixedSnapshotPoller: fixedSnapshotPollerTest,
      dynamicSnapshotPollerStatus,
      nearbyCoinRoutePanelTest,
      lateDisplayRoutePanelTest,
      remoteSnapshotTargetDisplayTest,
      remoteSnapshotMapProjectionTest,
      nearbySelectedPlayerCoordinatesTest,
      nearbyMapCoordinatesTest,
      mapTrailTrackerSelfTest,
      nearbyMapLegacyCompatibilityTest,
      statusServerChatTest,
      snapshotEdge,
      cloudflareChallenge,
      transportRecoveryCloudflare,
      pendingExitRecovery,
      pendingExitCanaryGate,
      loginRecoveryAssociation,
      snapshotAuditPersistence,
      combatBattleLog,
      combatAttackClock,
      combatShotExecution,
      combatTargetFrameGap,
      incomingPressure,
      invulnerableWaitStation,
      lootRacePositioning,
      dynamicWhitelist,
      recoveryContact,
      snapshotAudit,
      complexCombatMainThreadBudget,
      logFile: runnerLog
    };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

module.exports = {
  CONFIRMED_LEAVE_SNAPSHOT_IGNORE_MS,
  browserlessDayKey,
  browserlessDailyFirstLoginDelayPlan,
  browserlessLoginIntervalDelayPlan,
  browserlessLoopPlan,
  browserlessRestartDrainStateIsOffline,
  browserlessTerminalStopRequestsRuntimeClose,
  closeBrowserlessStatusHandle,
  confirmedLeaveStateFromResult,
  hydrateConfigFromState,
  isFirstBrowserlessLoginOfDay,
  learnedLoginPointFromCanary,
  preLoginSafetyLeadMs,
  sourceIpPreflightAction,
  sourceIpPreflightCanReuse,
  snapshotSafetyAllowsImmediateResume,
  snapshotStatusPatchFromSafety,
  statusWallTimeSpikeDetail,
  persistedReconnectDelayPlan,
  preserveOnlineSessionForLoopWait,
  publicConfig,
  runnerResultExitDetail,
  resumeTransportRecoveryAfterCloudflareStop,
  summarizeBrowserlessRunnerResult,
  isRemoteProfitSnapshotEligible,
  runBrowserlessRunner,
  runBrowserlessRunnerSelfTest,
  runLoginSuccessStatePatchPersistenceSelfTest
};
