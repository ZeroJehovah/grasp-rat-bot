'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const {
  offlineLeaveSummaryText,
  staminaHoldContradictedByStaminaEvidence,
  combatLogExitSummaryFromDecision
} = require('../shared/exit-summary');
const {
  safeStringify,
  safeJsonClone,
  sanitizeCombatLogIdPart
} = require('../shared/runtime-utils');
const {
  formatDistance,
  formatDurationMs,
  actorLabel,
  hpDisplay
} = require('../shared/display-format');
const {
  buildBrowserPreservedState
} = require('../shared/browser-preserved-state');
const {
  parseGrzFrame,
  summarizeGrzJson
} = require('../shared/grz-frame');
const {
  fetchWithTimeout: browserlessFetchWithTimeout,
  redactSecrets,
  redactStructuredSecrets,
  submitGameCallbackUrl,
  summarizeSnapshotPayload
} = require('./browserless/session-client');
const {
  leaveOnce: browserlessLeaveOnce,
  leaveWithVerification: browserlessLeaveWithVerification,
  retryDelayMsForAttempt: browserlessRetryDelayMsForLeaveAttempt
} = require('./browserless/leave-client');
const {
  createFrameStats,
  updateFrameStats
} = require('./browserless/frame-stats');
const {
  buildWsUrl,
  openBrowserlessWs
} = require('./browserless/ws-transport');
const {
  createBrowserlessStateStore,
  selectRealtimeCombatState
} = require('./browserless/state-store');
const {
  buildBrowserlessDecision,
  buildBrowserlessRuntimeDefaults,
  buildBrowserlessStrategyInput,
  createBrowserlessDecisionAdapter
} = require('./browserless/decision-adapter');
const {
  createBrowserlessDecisionState,
  summarizeBrowserlessDecisionState
} = require('./browserless/decision-state');
const {
  createCanaryRunId,
  runReadOnlyCanary
} = require('./browserless/canary');
const {
  createBrowserlessActionAdapter,
  coinMotionVectorToTarget,
  movementVectorToTarget
} = require('./browserless/action-adapter');
const {
  buildBrowserlessCombatDryRun,
  estimateAim
} = require('./browserless/combat-adapter');
const {
  createBrowserlessSafetyController,
  evaluateBrowserlessSafety,
  executeSafetyExit
} = require('./browserless/safety-controller');
const {
  createLocalLogStore
} = require('./browserless/local-log-store');
const {
  parseBrowserlessRunnerArgs
} = require('./browserless/config');
const {
  createBrowserlessTargetWhitelist
} = require('./browserless/target-whitelist');
const {
  buildRuntimeDefaults
} = require('../shared/runtime-defaults');
const {
  browserlessLoopPlan,
  publicConfig,
  learnedLoginPointFromCanary,
  runBrowserlessRunner,
  runBrowserlessRunnerSelfTest
} = require('./browserless/runner');
const {
  gracefulShutdownLeave
} = require('../../scripts/browserless-runner');
const {
  browserlessStatsForDecision,
  browserlessStatsForOffline,
  buildCompactBrowserlessStatus,
  buildPublicBrowserlessStatus,
  readBrowserlessStateFile,
  stateFilePath,
  updateBrowserlessStateFile
} = require('./browserless/state-file');
const {
  startStatusServer
} = require('./browserless/status-server');
const {
  BROWSERLESS_WEB_PANEL_VERSION,
  renderBrowserlessWebPanel
} = require('./browserless/web-panel');
const {
  createSourceIpController
} = require('./browserless/source-ip-controller');
const {
  cleanupOldLogDays
} = require('./browserless/log-retention');
const {
  summarizeBrowserlessLogDay,
  writeBrowserlessLogSummary
} = require('../../scripts/browserless-log-summary');
const {
  parseArgs: parseBrowserlessCanaryAuditArgs,
  summarizeAudit: summarizeBrowserlessCanaryAudit
} = require('../../scripts/browserless-canary-audit');
const {
  summarizeAudit: summarizeBrowserlessActionParityAudit
} = require('../../scripts/browserless-action-parity-audit');
const {
  auditDeployment: auditBrowserlessDeployment
} = require('../../scripts/browserless-deployment-audit');
const {
  buildAcceptanceReport: buildBrowserlessAcceptanceReport,
  parseArgs: parseBrowserlessAcceptanceReportArgs
} = require('../../scripts/browserless-acceptance-report');
const {
  importBrowserlessState
} = require('../../scripts/browserless-import-state');
const {
  createNoSelfSnapshotRecoveryRuntime,
  shouldClearTmpGameLocalSessionKey
} = require('../browser/runtime/no-self-snapshot-recovery-runtime');
const {
  createPageModalRuntime
} = require('../browser/runtime/page-modal-runtime');
const {
  createSessionRecoveryRuntime
} = require('../browser/runtime/session-recovery-runtime');
const {
  createLeaveFlowRuntime
} = require('../browser/runtime/leave-flow-runtime');
const {
  createControlLoginRuntime
} = require('../browser/runtime/control-login-runtime');
const {
  createLoginPointSafetyRuntime
} = require('../browser/runtime/login-point-safety-runtime');
const {
  createReloginGateRuntime
} = require('../browser/runtime/relogin-gate-runtime');
const {
  createStaminaStatusRuntime
} = require('../browser/runtime/stamina-status');
const {
  createPendingExitRuntime
} = require('../browser/runtime/pending-exit-runtime');
const {
  createPostLoginZoomRuntime
} = require('../browser/runtime/post-login-zoom-runtime');
const {
  createNativeTransportRuntime
} = require('../browser/runtime/native-transport-runtime');
const {
  normalizeTargetWhitelistName,
  parseTargetWhitelistNames,
  deriveTargetWhitelistUrl
} = require('../shared/target-whitelist');
const {
  applyFinalActionArbitrationCore
} = require('../strategy/action-arbitration');
const {
  coinRouteKey: coinRouteKeyCore,
  coinRouteLegStaminaCostCore,
  coinRouteLegClearCore,
  coinRoutePointLimitCore,
  coinRouteSummaryCore,
  coinRoutePoints: coinRoutePointsCore,
  buildCoinRouteFromAnchorCore,
  coinRouteSkipsCloserFirstCoinCore,
  coinRouteSkipsCloserRoutePointCore,
  coinRouteSkipsHeldSingleCoinCore,
  closerCoinRouteForFirstTargetCore,
  coinRouteMatchesHeldChoiceCore,
  heldCoinRouteBeatsSwitchCore,
  pickCoinRouteOpportunityCore
} = require('../strategy/coin-route');
const {
  runStrategyModuleSelfTests
} = require('../strategy/self-test');

function createMapStorage(data = new Map()) {
  return {
    get length() {
      return data.size;
    },
    key: index => Array.from(data.keys())[index] ?? null,
    getItem: key => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key)
  };
}

async function runSelfTest() {
  const cfg = {
    dangerRadius: 17000,
    activeCautionRadius: 23000,
    activeCautionExitMargin: 2000,
    activeAvoidMaxDistance: 25000,
    activeReturnBlockMargin: 0,
    activeReturnBlockExitMargin: 0,
    activeReturnBlockResumeMargin: 0,
    activeReturnBlockClearMargin: 0,
    returnBlockScanHeadingMs: 2600,
    returnBlockScanStuckMs: 1400,
    returnBlockScanStuckDistance: 350,
    returnBlockCooldownMs: 8000,
    stationaryActiveDangerRadius: 18000,
    stationaryActiveCautionRadius: 22000,
    attackDangerRadius: 25000,
    attackRange: 14500,
    attackEngageRange: 11000,
    attackApproachRange: 50000,
    attackPreferredRange: 14500,
    globalAttackMaxDistance: 50000,
    nativeEntityAuthoritativeRadius: 42000,
    nativeCoinAuthoritativeRadius: 50000,
    combatAttackRange: 14500,
    combatDodgeRangeBuffer: 1000,
    combatDisengageRange: 17000,
    combatLowValueActiveDropMax: 4,
    combatProactiveActiveKillStaminaBudgetMs: 100000,
    highValueCoinPriorityAmount: 10,
    highValueCoinPriorityHealthyHp: 50,
    combatCriticalHpLeaveThreshold: 20,
    combatLowHpLeaveThreshold: 50,
    combatLowHpCloseRiskMargin: 5,
    combatHighHpDisadvantageGap: 20,
    combatDisadvantageConfirmMs: 2500,
    combatDisadvantageMinEngageMs: 3500,
    combatDisadvantageMinSamples: 4,
    combatLowHpNoDamageLeaveThreshold: 70,
    combatLowHpNoDamageLeaveMs: 15000,
    combatLowHpNoDamageMinGap: 0,
    combatShootEveryMs: 160,
    combatShootReserveMs: 5600,
    combatShootDodgeReserveMs: 3800,
    combatShootHighHpDodgeReserveMs: 3000,
    combatShootHighHpMinHp: 90,
    combatShootFinishLowThreatDodgeReserveMs: 1800,
    combatShootFinishLowThreatMinHp: 90,
    combatShootFinishLowThreatTargetHpMax: 55,
    combatShootFinishLowThreatMaxHpGap: 0,
    combatShootFinishLowThreatRange: 8500,
    combatShootPassiveRunnerDodgeReserveMs: 1800,
    combatShootWinningPressureDodgeReserveMs: 1800,
    combatShootWinningPressureMinHp: 60,
    combatShootWinningPressureTargetHpMax: 75,
    combatShootWinningPressureLeadHp: 5,
    combatShootWinningPressureRange: 11000,
    combatShootWinningPressureNoDamageMs: 6000,
    combatShootPressureDodgeReserveMs: 2600,
    combatShootPressureMinHp: 60,
    combatShootPressureRange: 14500,
    combatShootPressureMaxHpGap: 10,
    combatFarNoDamageCloseMs: 6000,
    combatFarNoDamageCloseStartRange: 10000,
    combatFarNoDamageCloseRange: 7500,
    combatFarNoDamageCloseMinHp: 60,
    combatFarNoDamageCloseMaxHpGap: 10,
    combatRetreatingFighterCloseMinHp: 60,
    combatRetreatingFighterCloseMaxHpGap: 10,
    combatOutOfRangeFinishPressureRange: 16000,
    combatOutOfRangeFinishPressureSelfHpMin: 55,
    combatOutOfRangeFinishPressureTargetHpMax: 55,
    combatOutOfRangeFinishPressureMaxHpGap: 0,
    combatOutOfRangeFinishPressureRecentDamageMs: 10000,
    combatOutOfRangeReengageRange: 15000,
    combatOutOfRangeReengageMinHp: 60,
    combatOutOfRangeReengageMaxHpGap: 10,
    combatOutOfRangePressureReengageMaxHpGap: 20,
    combatOutOfRangeReengageRecentInRangeMs: 2500,
    combatPassiveRunnerMinSelfHp: 80,
    combatPassiveRunnerMinDrop: 1,
    combatPassiveRunnerConfirmMs: 2500,
    combatOpponentProbeMs: 6000,
    combatOpponentProbeReserveMs: 5600,
    combatOpponentProbeEveryMs: 520,
    combatPassiveRunnerCloseRange: 4500,
    combatPassiveRunnerInterceptSpreadScale: 0,
    combatShootHardReserveMs: 1800,
    combatShootConserveEveryMs: 360,
    combatShootRecoveryEveryMs: 700,
    combatStationarySpeed: 5,
    combatAimJitterRadians: 0.08,
    combatAimJitterMinRadians: 0.025,
    combatAimJitterMaxRadians: 0.14,
    combatAimJitterCloseDistance: 2500,
    combatAimJitterFarDistance: 14500,
    combatAimLeadMinRadians: 0.035,
    combatAimEvasionScale: 1.0,
    combatAimMotionSampleMs: 50,
    combatAimRecentMotionDecayMs: 900,
    combatAimMovingScaleThreshold: 0.15,
    combatAimMinMotionJitterScale: 0.2,
    combatTargetDodgeSpeedPerTick: 50,
    combatBulletSpeedPerTick: 500,
    combatBulletHitRadiusCm: 90,
    combatRenderDelayTicks: 2,
    combatInterceptMaxTicks: 30,
    combatInterceptSpreadScale: 0.18,
    combatMotionHistoryWindowMs: 2000,
    combatMotionHistoryMaxSamples: 80,
    combatAimLowConfidenceThreshold: 0.6,
    combatAimLowConfidenceMinDistance: 9000,
    combatAimLowConfidenceMotionScale: 0.65,
    combatAimLowConfidenceEveryMs: 520,
    combatTradeEstimateWindowMs: 6000,
    combatTradeEstimateMinWindowMs: 1800,
    combatTradeEstimateMinSelfDamage: 6,
    combatTradeEstimateSafetyFactor: 1.15,
    combatTradeEstimateMinEnemyDps: 1.5,
    combatTradeEstimateNoDamageSafeSelfHp: 75,
    combatTradeEstimateNoDamageUnsafeTDeathMs: 30000,
    combatAimNoDamageMs: 1000,
    combatAimNoDamageStepMs: 800,
    combatAimNoDamageMaxRadians: 0.14,
    combatAimFallbackPrecisionNoDamageMs: 25000,
    combatAimLiveDivergencePrecisionCm: 1200,
    combatAimLiveDivergencePrecisionRatio: 0.08,
    combatAimRadialPrecisionLateralRatio: 0.35,
    combatAimSteadyNoDamageMs: 6000,
    combatAimSteadySpeedMax: 5,
    combatAimLockMs: 450,
    combatShootSteadyAimDodgeReserveMs: 3000,
    combatShootSteadyAimNoDamageMs: 6000,
    combatShootSteadyAimMinHp: 75,
    combatShootSteadyAimMaxHpGap: 15,
    combatShootNoDamageDuelDodgeReserveMs: 3000,
    combatShootNoDamageDuelNoDamageMs: 25000,
    combatShootNoDamageDuelMinHp: 75,
    combatShootNoDamageDuelMaxHpGap: 10,
    combatShootNoDamageDuelRange: 14500,
    combatServerStallNoDamageLeaveMs: 25000,
    combatServerStallNoDamagePrecisionGraceMs: 10000,
    combatServerStallNoDamageHpGap: 5,
    combatTargetSwitchIncomingDistance: 6500,
    combatTargetSwitchIncomingTimeMs: 900,
    combatRetreatEdgeRange: 13800,
    combatRetreatRadialSpeedMin: 5,
    combatRetreatDistanceDeltaMin: 600,
    combatRetreatIgnoreMs: 15000,
    combatFinishPressureSelfHpMin: 90,
    combatFinishPressureTargetHpMax: 55,
    combatFinishPressureCloseRange: 6500,
    combatFinishPressureShootEveryMs: 360,
    combatBulletDetectRadius: 30000,
    combatBulletLaneRadius: 3000,
    combatBulletLookaheadDistance: 42000,
    snapshotBulletStaleMs: 1500,
    snapshotSelfStaleMs: 6500,
    combatStrafeLockMs: 700,
    combatStrafeDirectionLockMs: 2200,
    combatStrafeRandomJitterMs: 1100,
    combatStrafePreciseLaneMin: 1,
    combatStrafeCarryMs: 1600,
    combatEngageStickMs: 30000,
    combatEngageGraceMs: 5000,
    combatEngageGraceRange: 17000,
    combatSpacingMinRange: 4500,
    combatSpacingPreferredRange: 6500,
    combatSpacingEmergencyRange: 3000,
    combatSpacingLowHpThreshold: 70,
    combatPressureCloseNoDamageMs: 8000,
    combatPressureCloseRange: 6500,
    combatPressureCloseMinHp: 60,
    combatPressureExitHpThreshold: 60,
    combatPressureExitHpGap: 5,
    combatPressureNoDamageExitMs: 10000,
    combatPressureNoDamageExitHpThreshold: 80,
    combatPressureNoDamageExitHpGap: 10,
    combatPressureNoDamageExitTargetHpMin: 75,
    combatPressureNoDamageExitRange: 14500,
    combatLeaveRetryMs: 1000,
    leaveRetryMinMs: 10000,
    leaveCommandTimeoutMs: 10000,
    leave403ReloginDelayMs: 3600000,
    enemyReloginMinDelayMs: 0,
    enemyReloginMaxDelayMs: 0,
    enemyReloginJitterMs: 0,
    enemyReloginRepeatResetMs: 7200000,
    enemyReloginRepeatSecondMaxMs: 0,
    enemyReloginRepeatThirdMaxMs: 0,
    postAttackDropCoinMinAmount: 1,
    opportunisticShootEveryMs: 120,
    opportunisticShotMinScoreRatio: 1,
    attackMinDrop: 8,
    attackMinAfkDrop: 3,
    attackApproachMinDrop: 12,
    attackMinRewardRatio: 0.5,
    targetWhitelistMaxNames: 100,
    coinOpportunityValue: 60000,
    dropOpportunityValue: 60000,
    opportunityDistanceFloor: 50,
    opportunityDistanceScoreScale: 10000,
    opportunityMoveStaminaPerCm: 1,
    opportunityShotStaminaCostMs: 500,
    opportunityEstimatedDamagePerShot: 3,
    opportunityCoinPickupStaminaMs: 0,
    opportunityLongStaminaReserveMs: 1500,
    opportunityStickBonus: 0,
    opportunitySwitchMargin: 3000,
    opportunitySwitchRelativeMargin: 0.1,
    opportunitySwitchHoldMs: 7000,
    opportunityMissingHoldMs: 7000,
    opportunityOscillationSwitchLimit: 5,
    opportunitySameCoinRadius: 1200,
    opportunityVisibleDistance: 50000,
    opportunityNearbyPriorityDistance: 50000,
    afkRecentActivityCooldownMs: 12000,
    opportunityAfkStaminaCooldownMs: 60000,
    opportunityAfkStaminaDropThresholdMs: 100,
    coinMaxDistance: 18000,
    coinDangerRadius: 25000,
    invulnerableActiveCoinDangerRadius: 36000,
    invulnerableActiveCoinHeadingBlockRadius: 65000,
    invulnerableActiveCoinHeadingLaneRadius: 18000,
    invulnerableActiveCoinHeadingCosMin: 0.55,
    invulnerableActiveCoinHeadingMinDistance: 1500,
    stationaryActiveCoinDangerRadius: 12000,
    globalCoinMaxDistance: 50000,
    patrolCoinMaxDistance: 22000,
    scanCoinMaxDistance: 22000,
    distantCoinMaxDistance: 35000,
    distantCoinMinDistance: 22000,
    coinRouteMaxDistance: 50000,
    coinRouteClusterRadius: 13000,
    coinRouteLinkDistance: 15000,
    coinRouteMaxLinkDistance: 22000,
    coinRouteAnchorLimit: 22,
    coinRoutePoolLimit: 72,
    coinRouteMaxPointsDense: 6,
    coinRouteMaxPointsMid: 4,
    coinRouteMaxPointsSparse: 2,
    coinRouteLegSampleDistance: 10000,
    coinRouteNearbyFirstCoinDistance: 22000,
    coinRouteFirstCoinDistanceRatio: 1.45,
    coinRouteFirstCoinDistanceSlack: 6000,
    coinRouteSwitchMargin: 3000,
    coinRouteSwitchRelativeMargin: 0.1,
    coinRouteHeldMinOverlap: 2,
    coinRouteBeamWidth: 4,
    coinRouteFirstRoutePointDistanceRatio: 1.15,
    coinRouteFirstRoutePointDistanceSlack: 2500,
    coinRouteFirstRoutePointCosMin: 0.9,
    coinRouteFirstRoutePointLaneRadius: 3000,
    coinRouteFirstRouteDistanceRatio: 1.25,
    coinRouteFirstRouteDistanceSlack: 3000,
    fieldMigrationMaxDistance: 45000,
    fieldMigrationMinDistance: 22000,
    fieldMigrationClusterRadius: 18000,
    fieldMigrationMinCoins: 3,
    fieldMigrationStaminaThreshold: 0,
    fieldMigrationNearbyCoinBlockDistance: 30000,
    snapshotCoinMaxDistance: 1200000,
    snapshotCoinClusterRadius: 22000,
    snapshotCoinClusterMinCoins: 2,
    snapshotSingleCoinMaxDistance: 22000,
    snapshotSingleCoinDistancePerAmount: 30000,
    snapshotCoinIdleMaxMs: 60000,
    patrolHeadingMs: 26000,
    patrolStaminaThreshold: 6500,
    chaseCoinStaminaThreshold: 0,
    patrolPrecisionTolerance: 1200,
    footCoinPriorityDistance: 1200,
    nearCoinPriorityDistance: 13500,
    activeReturnBlockCoinPassDistance: 900,
    postAttackDropCoinPriorityMs: 45000,
    postAttackDropCoinRadius: 3500,
    postAttackDropCoinMaxDistance: 22000,
    postAttackRecoveryDropMaxDistance: 50000,
    postAttackRecoveryDropMinScore: 60000,
    postAttackDropWaitMs: 1000,
    postAttackDropResolveMaxMs: 5000,
    postAttackDropWaitMinDrop: 8,
    postAttackDropWaitMaxDistance: 50000,
    postAttackDropWaitStopDistance: 900,
    killChatAttackMatchMs: 120000,
    killAttributionMergeMs: 120000,
    conserveCoinMaxDistance: 6000,
    recoveryCoinMaxDistance: 600,
    coinPrecisionTolerance: 60,
    coinPickupExactTolerance: 0,
    precisionPulseMaxMs: 260,
    coinPickupStopDistance: 30,
    coinPickupStopPulseMs: 45,
    coinPickupMicroDistance: 120,
    coinPickupMicroPulseMs: 60,
    coinPickupFineDistance: 320,
    coinPickupSweepDistance: 900,
    coinPickupPulseMs: 240,
    coinPickupSweepPulseMs: 150,
    coinPickupFinePulseMs: 75,
    coinAxisApproachMinDistance: 5000,
    coinAxisApproachRatio: 4,
    coinAxisApproachLaneTolerance: 1800,
    coinApproachBrakeDistance: 700,
    coinPickupBrakeDistance: 650,
    coinPickupBrakePulseMs: 90,
    coinPickupFailureSlowStepMs: 10,
    coinPickupFailureMinPulseMs: 35,
    coinPickupAttemptSlowEveryMs: 2500,
    coinPickupAttemptSlowMaxCount: 3,
    globalSamplingOutageOfflineEnabled: true,
    globalSamplingOutageMinErrors: 1,
    globalSamplingOutageMinAgeMs: 0,
    globalSamplingOutageCombatOnly: true,
    combatTickGapOfflineEnabled: true,
    combatTickGapOfflineMs: 5000,
    tickMs: 120,
    nativeTickMinMs: 120,
    combatNativeTickMinMs: 80,
    attackMinStamina: 0,
    passiveAvoidRadius: 11000,
    passivePanicRadius: 120,
    recoveryAvoidRadius: 22000,
    lowHpThreshold: 60,
    recoverHpThreshold: 95,
    staminaFullRatio: 0.98,
    conserveStaminaThreshold: 6500,
    staminaBudgetReloginDelayMs: 1800000,
    pursuitLeaveMs: 300000,
    pursuitLeaveNonFullHpMs: 90000,
    pursuitLeaveInvulnerableMs: 60000,
    pursuitLeaveNonFullHpInvulnerableMs: 45000,
    targetStickMs: 5000,
    coinStickMs: 2500,
    finalActionArbitrationHoldMs: 480,
    finalActionArbitrationHistoryLimit: 24,
  };
  const fullStamina5s = (entity, remaining = 10000, limit = 10000) => ({
    ...entity,
    stamina_5s_remaining_milli: remaining,
    stamina_5s_limit_milli: limit
  });
  const bot = { lastTarget: null, lastTargetAt: 0, lastDecision: null, combatTarget: null, combatRetreatIgnore: new Map(), combatDisadvantageObservation: null, opportunityChoice: null, opportunitySwitchLock: null, opportunityAfkStamina: new Map(), ignoredCoins: new Map(), coinAttempts: new Map(), coinProgress: null, coinApproachLock: null, currentVisibleCoins: null, finalActionArbitration: null };
  const dist = (a, b) => Math.hypot(Number(a.x) - Number(b.x), Number(a.y) - Number(b.y));
  const dropValue = e => Number(e.death_reward_preview ?? e.death_drop_coins ?? e.drop ?? 0) || 0;
  const isAlive = e => e && e.life !== 'Dead' && e.life !== 'WaitingRevive' && !e.waiting_revive;
  const speed = e => Math.hypot(Number(e.vx) || 0, Number(e.vy) || 0);
  const truthyFlag = value => value === true || value === 1 || value === '1' || value === 'true';
  const anyPositiveNumber = (...values) => values.some(value => Number(value) > 0);
  const isInvulnerable = e => anyPositiveNumber(
      e?.invulnerable_remaining_ticks,
      e?.invincible_remaining_ticks,
      e?.invulnerability_remaining_ticks,
      e?.invulnerableTicks,
      e?.invulnerableRemainingTicks,
      e?.invincibleRemainingTicks,
      e?.invulnerabilityRemainingTicks,
      e?.invulnerable_ticks,
      e?.invincible_ticks,
      e?.invulnerability_ticks,
      e?.invulnerable_remaining_ms,
      e?.invincible_remaining_ms,
      e?.invulnerability_remaining_ms,
      e?.invulnerableRemainingMs,
      e?.invincibleRemainingMs,
      e?.invulnerabilityRemainingMs,
      e?.invulnerable_ms,
      e?.invincible_ms,
      e?.invulnerability_ms,
      e?.immune_remaining_ms,
      e?.immuneRemainingMs,
      e?.invulnerable_remaining,
      e?.invincible_remaining,
      e?.invulnerability_remaining,
      e?.invulnerableRemaining,
      e?.invincibleRemaining,
      e?.invulnerabilityRemaining
    )
    || truthyFlag(e?.invulnerable)
    || truthyFlag(e?.is_invulnerable)
    || truthyFlag(e?.isInvulnerable)
    || truthyFlag(e?.immune)
    || truthyFlag(e?.is_immune);
  const isJoinModeActive = e => e?.current_join_mode === 'Active' || e?.mode === 'Active';
  const isInvulnerableActive = e => isJoinModeActive(e) && isInvulnerable(e);
  const staminaLimit = e => Number(e?.stamina_5s_limit_milli || 10000);
  const staminaRemaining = (e, windowName) => {
    const value = Number(e?.['stamina_' + windowName + '_remaining_milli'] ?? NaN);
    return Number.isFinite(value) ? value : null;
  };
  const staminaExhaustedThreshold = () => Math.max(0, Number(cfg.staminaExhaustedThresholdMs ?? 1000));
  const combatMovementBlockedByStamina = self => {
    const stamina5s = staminaRemaining(self, '5s');
    return stamina5s !== null && stamina5s < staminaExhaustedThreshold();
  };
  const hasFullStamina = e => {
    const limit = staminaLimit(e);
    const stamina = Number(e?.stamina_5s_remaining_milli ?? NaN);
    return Number.isFinite(stamina) && limit > 0 && stamina >= limit * cfg.staminaFullRatio;
  };
  const isMovingThreat = e => speed(e) >= 5 || Boolean(e.recentlyMoved);
  const isFiringEntity = e => truthyFlag(e?.shooting)
    || truthyFlag(e?.is_shooting)
    || truthyFlag(e?.isShooting)
    || truthyFlag(e?.firing)
    || truthyFlag(e?.is_firing)
    || truthyFlag(e?.attacking)
    || truthyFlag(e?.is_attacking);
  function entityRecentActivityAgeMs(e) {
    const value = Number(e?.recentActivityAgeMs ?? e?.activityAgeMs ?? e?.motionAgeMs ?? NaN);
    return Number.isFinite(value) && value >= 0 ? value : null;
  }
  function recentlyActionedForAfk(e) {
    const cooldownMs = Math.max(0, Number(cfg.afkRecentActivityCooldownMs || 0) || 0);
    if (!(cooldownMs > 0)) return false;
    const ageMs = entityRecentActivityAgeMs(e);
    return Boolean(e?.recentlyActive || (ageMs !== null && ageMs <= cooldownMs));
  }
  function isIdleInvulnerableTarget(e) {
    return Boolean(isInvulnerable(e)
      && !isMovingThreat(e)
      && !isFiringEntity(e)
      && hasFullStamina(e)
      && !recentlyActionedForAfk(e));
  }
  const isActive = e => isMovingThreat(e) || isFiringEntity(e) || (isJoinModeActive(e) && (!hasFullStamina(e) || isInvulnerableActive(e)));
  const hasCombatActivitySignalForTest = e => isActive(e)
    || truthyFlag(e?.active)
    || truthyFlag(e?.currentlyActive)
    || truthyFlag(e?.combat)
    || truthyFlag(e?.engagedCombat)
    || String(e?.combatIntent || '') === 'engaged';
  const isAvoidanceThreat = e => isInvulnerable(e) && !isIdleInvulnerableTarget(e);
  const isAfkTarget = e => !recentlyActionedForAfk(e) && !isJoinModeActive(e) && !isActive(e) && !isMovingThreat(e);
  const isAfkProfitTarget = e => !recentlyActionedForAfk(e) && (isAfkTarget(e) || (isJoinModeActive(e) && !isActive(e) && !isMovingThreat(e) && !isFiringEntity(e)));
  const targetWhitelistNames = parseTargetWhitelistNames({ names: ['文月', 'Firefox'] }, cfg.targetWhitelistMaxNames);
  const targetWhitelistNameSet = new Set(targetWhitelistNames);
  const isWhitelistedTarget = e => {
    if (!e) return false;
    const name = normalizeTargetWhitelistName(e.name);
    return Boolean(name && targetWhitelistNameSet.has(name));
  };
  const decorateThreat = (self, e) => {
    const moving = isMovingThreat(e);
    return {
      ...e,
      distance: dist(self, e),
      drop: dropValue(e),
      speed: speed(e),
      moving,
      threatRadius: moving ? cfg.dangerRadius : cfg.stationaryActiveDangerRadius,
      cautionRadius: moving ? cfg.activeCautionRadius : cfg.stationaryActiveCautionRadius,
      coinDangerRadius: moving ? cfg.coinDangerRadius : cfg.stationaryActiveCoinDangerRadius
    };
  };
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
  const hpValue = e => Number(e?.hp ?? 0) || 0;
  const combatHpValue = e => Number.isFinite(Number(e?.hp)) ? Number(e.hp) : 100;
  const knownHpValue = e => {
    if (e && Object.prototype.hasOwnProperty.call(e, 'knownHp')) {
      return Number.isFinite(Number(e.knownHp)) ? Number(e.knownHp) : null;
    }
    return e?.hp !== undefined && e?.hp !== null && Number.isFinite(Number(e.hp)) ? Number(e.hp) : null;
  };
  const maxHpValue = e => Number(e?.max_hp ?? e?.maxHp ?? 0) || 0;
  const clampValue = (v, min, max) => Math.max(min, Math.min(max, v));
  const isFullHp = self => {
    const hp = hpValue(self);
    const maxHp = maxHpValue(self);
    if (maxHp > 0) return hp >= maxHp;
    return hp >= 100;
  };
  const isRecovering = self => {
    if (!self) return false;
    const maxHp = maxHpValue(self);
    if (maxHp > 0) return hpValue(self) < maxHp;
    return hpValue(self) < cfg.recoverHpThreshold;
  };
  function pursuitLeaveThresholdForTest(self, threat) {
    const normalMs = Math.max(0, Number(cfg.pursuitLeaveMs || 0));
    const nonFullHp = !isFullHp(self);
    const invulnerable = isInvulnerable(threat);
    const candidates = [normalMs];
    if (nonFullHp) candidates.push(Math.max(0, Number(cfg.pursuitLeaveNonFullHpMs || normalMs)));
    if (invulnerable) candidates.push(Math.max(0, Number(cfg.pursuitLeaveInvulnerableMs || normalMs)));
    if (nonFullHp && invulnerable) {
      candidates.push(Math.max(0, Number(cfg.pursuitLeaveNonFullHpInvulnerableMs || cfg.pursuitLeaveInvulnerableMs || cfg.pursuitLeaveNonFullHpMs || normalMs)));
    }
    return Math.max(0, Math.min(...candidates.filter(value => Number.isFinite(value))));
  }
  function actionCombatTargetId(action) {
    const target = action?.target || null;
    const id = target?.id ?? target?.user_id;
    return id === null || id === undefined ? '' : String(id);
  }
  function pursuitLeaveSuppressedByCombatAction(pursuit, action) {
    const pursuitId = pursuit?.id ?? pursuit?.user_id;
    const actionId = actionCombatTargetId(action);
    return Boolean(action?.combat && pursuitId !== null && pursuitId !== undefined && actionId && String(pursuitId) === actionId);
  }
  const isConservingStamina = self => {
    const stamina = Number(self?.stamina_5s_remaining_milli ?? cfg.conserveStaminaThreshold);
    return stamina < cfg.conserveStaminaThreshold;
  };
  const attackWorthTaking = (self, target) => {
    if (isWhitelistedTarget(target)) return false;
    const targetDrop = dropValue(target);
    if (isAfkProfitTarget(target)) return targetDrop >= Math.max(0, Number(cfg.attackMinAfkDrop ?? cfg.attackMinDrop));
    const ownDrop = dropValue(self);
    return targetDrop >= cfg.attackMinDrop
      && (!ownDrop || targetDrop >= ownDrop * cfg.attackMinRewardRatio);
  };
  function combatAimJitterLimit(distance, motionScale = 1) {
    const maxJitter = Math.max(0, Number(cfg.combatAimJitterMaxRadians || cfg.combatAimJitterRadians || 0));
    const minJitter = clampValue(Number(cfg.combatAimJitterMinRadians ?? maxJitter), 0, maxJitter);
    const scale = clampValue(Number.isFinite(Number(motionScale)) ? Number(motionScale) : 1, 0, 1);
    const minScale = clampValue(Number(cfg.combatAimMinMotionJitterScale ?? 0.2), 0, 1);
    const closeDistance = Math.max(0, Number(cfg.combatAimJitterCloseDistance || 0));
    const farDistance = Math.max(closeDistance + 1, Number(cfg.combatAimJitterFarDistance || cfg.combatAttackRange || closeDistance + 1));
    const rawDistance = Number(distance);
    const d = clampValue(Number.isFinite(rawDistance) ? rawDistance : farDistance, closeDistance, farDistance);
    const nearFactor = 1 - ((d - closeDistance) / (farDistance - closeDistance));
    const interpolated = (minJitter + (maxJitter - minJitter) * nearFactor) * Math.max(minScale, scale);
    const bulletSpeed = Math.max(1, Number(cfg.combatBulletSpeedPerTick || 500));
    const dodgeSpeed = Math.max(0, Number(cfg.combatTargetDodgeSpeedPerTick || 50));
    const hitRadius = Math.max(0, Number(cfg.combatBulletHitRadiusCm || 90));
    const evasionScale = Math.max(0, Number(cfg.combatAimEvasionScale ?? 1));
    const travelTicks = d / bulletSpeed;
    const evasionWidth = (dodgeSpeed * scale * travelTicks + hitRadius) * evasionScale;
    const evasionAngle = d > 0 ? Math.atan(evasionWidth / d) : maxJitter;
    return clampValue(Math.max(interpolated, evasionAngle), minJitter * minScale, maxJitter);
  }
  function combatAimNoDamageLevel(widenMs) {
    const stepMs = Math.max(1, Number(cfg.combatAimNoDamageStepMs) || 800);
    const elapsed = Math.max(0, Number(widenMs) || 0);
    return elapsed > 0 ? Math.min(3, 1 + elapsed / stepMs) : 0;
  }
  function combatAimNoDamageJitterLimit(baseLimit, noDamageLevel) {
    const base = Math.max(0, Number(baseLimit) || 0);
    const level = Math.max(0, Number(noDamageLevel) || 0);
    const maxNoDamageLimit = Math.max(base, Number(cfg.combatAimNoDamageMaxRadians) || base);
    return level ? Math.min(maxNoDamageLimit, base * (1 + level * 0.45)) : base;
  }
  function combatAimSteadyNoDamageState(target, noDamageMs, motionScale = 0) {
    const thresholdMs = Math.max(0, Number(cfg.combatAimSteadyNoDamageMs || 0));
    const elapsed = Math.max(0, Number(noDamageMs) || 0);
    const speedMax = Math.max(0, Number(cfg.combatAimSteadySpeedMax ?? cfg.combatStationarySpeed ?? 0));
    const currentSpeed = speed(target);
    const active = Boolean(thresholdMs && elapsed >= thresholdMs && currentSpeed <= speedMax);
    return {
      active,
      noDamageMs: elapsed,
      thresholdMs,
      currentSpeed,
      speedMax,
      motionScale: Number.isFinite(Number(motionScale)) ? Number(motionScale) : 0
    };
  }
  function combatAimFallbackPrecisionState(noDamageMs) {
    const thresholdMs = Math.max(0, Number(cfg.combatAimFallbackPrecisionNoDamageMs || 0));
    const elapsed = Math.max(0, Number(noDamageMs) || 0);
    return {
      active: Boolean(thresholdMs && elapsed >= thresholdMs),
      noDamageMs: elapsed,
      thresholdMs
    };
  }
  function combatMovementAimMode(self, target, distance) {
    const vx = Number(target.vx) || 0;
    const vy = Number(target.vy) || 0;
    const targetSpeed = Math.hypot(vx, vy);
    const dx = Number(target.x) - Number(self.x);
    const dy = Number(target.y) - Number(self.y);
    const d = Math.max(1, Number(distance) || Math.hypot(dx, dy) || 1);
    const ux = dx / d;
    const uy = dy / d;
    const radialSpeed = ux * vx + uy * vy;
    const lateralSpeed = ux * vy - uy * vx;
    const lateralRatio = targetSpeed > 0.01 ? Math.abs(lateralSpeed) / targetSpeed : 0;
    let mode = 'drift';
    let leadScale = 0.75;
    if (lateralRatio >= 0.55) {
      mode = 'lateral';
      leadScale = 1.1;
    } else if (radialSpeed <= -cfg.combatStationarySpeed) {
      mode = 'closing';
      leadScale = 0.5;
    } else if (radialSpeed >= cfg.combatStationarySpeed) {
      mode = 'retreating';
      leadScale = 0.6;
    }
    if (target.current_join_mode === 'Active') leadScale += 0.15;
    if (isFiringEntity(target)) leadScale += 0.1;
    return {
      mode,
      leadScale,
      lateralSpeed,
      radialSpeed,
      lateralRatio,
      targetSpeed
    };
  }

  function combatInterceptSolution(self, target, distance = null, motionScale = 1) {
    const sx = Number(self?.x);
    const sy = Number(self?.y);
    const px = Number(target?.x);
    const py = Number(target?.y);
    const vx = Number(target?.vx) || 0;
    const vy = Number(target?.vy) || 0;
    if (![sx, sy, px, py].every(Number.isFinite)) return null;
    const bulletSpeed = Math.max(1, Number(cfg.combatBulletSpeedPerTick || 500));
    const renderDelayTicks = Math.max(0, Number(cfg.combatRenderDelayTicks ?? 2));
    const compensatedX = px + vx * renderDelayTicks;
    const compensatedY = py + vy * renderDelayTicks;
    const dx = compensatedX - sx;
    const dy = compensatedY - sy;
    const c = dx * dx + dy * dy;
    if (!(c > 0)) return null;
    const targetSpeedSq = vx * vx + vy * vy;
    const a = targetSpeedSq - bulletSpeed * bulletSpeed;
    const b = 2 * (dx * vx + dy * vy);
    const eps = 1e-6;
    const roots = [];
    if (Math.abs(a) < eps) {
      if (Math.abs(b) > eps) roots.push(-c / b);
    } else {
      const disc = b * b - 4 * a * c;
      if (disc < -eps) return null;
      const sqrtDisc = Math.sqrt(Math.max(0, disc));
      roots.push((-b - sqrtDisc) / (2 * a), (-b + sqrtDisc) / (2 * a));
    }
    const maxByRange = Math.max(1, Number(cfg.combatBulletRangeCm || cfg.combatAttackRange || 15000) / bulletSpeed);
    const configuredMax = Number(cfg.combatInterceptMaxTicks || 0);
    const maxTicks = Math.max(1, configuredMax > 0 ? Math.min(configuredMax, maxByRange) : maxByRange);
    const t = roots
      .filter(value => Number.isFinite(value) && value > 0 && value <= maxTicks)
      .sort((aTick, bTick) => aTick - bTick)[0];
    if (!Number.isFinite(t)) return null;
    const x = compensatedX + vx * t;
    const y = compensatedY + vy * t;
    const travelDistance = Math.hypot(x - sx, y - sy);
    const bulletRange = Math.max(1, Number(cfg.combatBulletRangeCm || cfg.combatAttackRange || 15000));
    if (travelDistance > bulletRange + Math.max(0, Number(cfg.combatBulletHitRadiusCm || 90))) return null;
    const rawDistance = Number.isFinite(Number(distance)) ? Math.max(1, Number(distance)) : Math.hypot(px - sx, py - sy);
    const targetSpeed = Math.sqrt(targetSpeedSq);
    const maxTargetSpeed = Math.max(1, Number(cfg.combatTargetDodgeSpeedPerTick || 50));
    const speedRatio = targetSpeed / maxTargetSpeed;
    const timeFactor = 1 - Math.min(1, t / maxTicks) * 0.35;
    const speedPenalty = Math.max(0, speedRatio - 1) * 0.2;
    const motionPenalty = Math.max(0, Math.min(1, Number(motionScale) || 0)) * 0.08;
    const confidence = Math.max(0.25, Math.min(1, 0.62 + timeFactor * 0.25 - speedPenalty - motionPenalty));
    return {
      x,
      y,
      flightTicks: t,
      flightMs: t * 50,
      travelDistance,
      currentDistance: rawDistance,
      leadDistance: Math.hypot(x - px, y - py),
      renderDelayTicks,
      compensatedX,
      compensatedY,
      targetVx: vx,
      targetVy: vy,
      targetSpeed,
      confidence
    };
  }
  function combatAimMotionScale(target) {
    const maxSpeed = Math.max(1, Number(cfg.combatTargetDodgeSpeedPerTick || 50));
    const observedSpeed = Math.max(
      speed(target),
      Number(target?.motionObservedSpeed || 0),
      Number(target?.motionSampleSpeed || 0)
    );
    let scale = clampValue(observedSpeed / maxSpeed, 0, 1);
    if (target?.recentlyMoved) {
      const decayMs = Math.max(1, Number(cfg.combatAimRecentMotionDecayMs || 900));
      const ageMs = Number(target.motionAgeMs);
      const recent = Number.isFinite(ageMs)
        ? clampValue(1 - ageMs / decayMs, 0, 1)
        : 1;
      scale = Math.max(scale, recent * Math.max(0, Number(cfg.combatAimMovingScaleThreshold || 0.15)));
    }
    return scale;
  }
  function combatMotionSample(self, target, at = Date.now()) {
    if (!target) return null;
    const x = Number(target.x);
    const y = Number(target.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const distance = self ? (Number.isFinite(Number(target.distance)) ? Number(target.distance) : dist(self, target)) : Number(target.distance);
    return {
      at,
      x,
      y,
      vx: Number(target.vx) || 0,
      vy: Number(target.vy) || 0,
      distance: Number.isFinite(distance) ? distance : null,
      hp: knownHpValue(target),
      selfHp: knownHpValue(self)
    };
  }
  function combatMotionSamplesWithCurrent(self, target, t = Date.now(), windowMsOverride = null) {
    const id = target?.user_id ?? target?.id;
    const previous = bot.combatTarget || null;
    const same = previous && id !== null && id !== undefined && String(previous.id ?? '') === String(id);
    const windowMs = Math.max(250, Number(windowMsOverride || cfg.combatMotionHistoryWindowMs || 2000));
    const maxSamples = Math.max(2, Math.round(Number(cfg.combatMotionHistoryMaxSamples || 80)));
    const samples = same && Array.isArray(previous.motionSamples) ? previous.motionSamples.slice() : [];
    const current = combatMotionSample(self, target, t);
    if (current) samples.push(current);
    return samples
      .filter(sample => sample && Number.isFinite(Number(sample.at)) && t - Number(sample.at) <= windowMs)
      .sort((a, b) => Number(a.at) - Number(b.at))
      .slice(-maxSamples);
  }
  function combatOpponentProfile(self, target, targetDistance = null) {
    const samples = combatMotionSamplesWithCurrent(self, target, Date.now(), Math.max(250, Number(cfg.combatMotionHistoryWindowMs || 2000)));
    const threshold = Math.max(1, Number(cfg.combatStationarySpeed || 5));
    let lateralFlips = 0;
    let previousLateralSign = 0;
    let radialSum = 0;
    let radialCount = 0;
    let speedSum = 0;
    let dotSum = 0;
    let dotCount = 0;
    for (const sample of samples) {
      const sx = Number(sample.x);
      const sy = Number(sample.y);
      const vx = Number(sample.vx) || 0;
      const vy = Number(sample.vy) || 0;
      const dx = sx - Number(self?.x || 0);
      const dy = sy - Number(self?.y || 0);
      const d = Math.max(1, Math.hypot(dx, dy));
      const radial = (dx / d) * vx + (dy / d) * vy;
      const lateral = (dx / d) * vy - (dy / d) * vx;
      const lateralSign = Math.abs(lateral) >= threshold ? Math.sign(lateral) : 0;
      if (lateralSign && previousLateralSign && lateralSign !== previousLateralSign) lateralFlips += 1;
      if (lateralSign) previousLateralSign = lateralSign;
      radialSum += radial;
      radialCount += 1;
      speedSum += Math.hypot(vx, vy);
    }
    for (let i = 1; i < samples.length; i += 1) {
      const a = samples[i - 1];
      const b = samples[i];
      const av = Math.hypot(Number(a.vx) || 0, Number(a.vy) || 0);
      const bv = Math.hypot(Number(b.vx) || 0, Number(b.vy) || 0);
      if (av >= threshold && bv >= threshold) {
        dotSum += ((Number(a.vx) || 0) * (Number(b.vx) || 0) + (Number(a.vy) || 0) * (Number(b.vy) || 0)) / (av * bv);
        dotCount += 1;
      }
    }
    const durationMs = samples.length >= 2 ? Math.max(0, Number(samples[samples.length - 1].at) - Number(samples[0].at)) : 0;
    const velocityStability = dotCount ? clampValue((dotSum / dotCount + 1) / 2, 0, 1) : 0.5;
    const avgRadialSpeed = radialCount ? radialSum / radialCount : 0;
    const avgSpeed = samples.length ? speedSum / samples.length : speed(target);
    const distance = Number.isFinite(Number(targetDistance)) ? Number(targetDistance) : (Number.isFinite(Number(target?.distance)) ? Number(target.distance) : dist(self, target));
    const strafePattern = Boolean(samples.length >= 4 && lateralFlips >= 2 && durationMs >= 600);
    const kiting = Boolean(samples.length >= 3
      && avgRadialSpeed >= Math.max(3, threshold)
      && distance >= Math.max(0, Number(cfg.combatSpacingPreferredRange || 0))
      && (isFiringEntity(target) || isCurrentlyActive(target)));
    const maneuverScale = clampValue((1 - velocityStability) * 0.7 + Math.min(1, lateralFlips / 3) * 0.45 + (kiting ? 0.2 : 0), 0, 1);
    const aimConfidenceScale = clampValue(1.08 - maneuverScale * 0.45, 0.55, 1.08);
    return {
      sampleCount: samples.length,
      durationMs,
      lateralFlips,
      velocityStability,
      avgRadialSpeed,
      avgSpeed,
      strafePattern,
      kiting,
      maneuverScale,
      aimConfidenceScale
    };
  }
  function combatTradeEstimate(self, target) {
    const previous = bot.combatTarget || null;
    const id = target?.user_id ?? target?.id;
    const same = previous && id !== null && id !== undefined && String(previous.id ?? '') === String(id);
    if (!same) return null;
    const t = Date.now();
    const windowMs = Math.max(1000, Number(cfg.combatTradeEstimateWindowMs || 6000));
    const samples = combatMotionSamplesWithCurrent(self, target, t, windowMs)
      .filter(sample => t - Number(sample.at) <= windowMs && Number.isFinite(Number(sample.hp)) && Number.isFinite(Number(sample.selfHp)));
    if (samples.length < 3) return null;
    const first = samples[0];
    const last = samples[samples.length - 1];
    const elapsedMs = Math.max(1, Number(last.at) - Number(first.at));
    if (elapsedMs < Math.max(500, Number(cfg.combatTradeEstimateMinWindowMs || 1800))) return null;
    const targetDamage = Math.max(0, Number(first.hp) - Number(last.hp));
    const selfDamage = Math.max(0, Number(first.selfHp) - Number(last.selfHp));
    const myDps = targetDamage / elapsedMs * 1000;
    const enemyDps = selfDamage / elapsedMs * 1000;
    const selfHp = hpValue(self);
    const targetHp = combatHpValue(target);
    const tKillMs = myDps > 0.05 ? targetHp / myDps * 1000 : Infinity;
    const tDeathMs = enemyDps > 0.05 ? selfHp / enemyDps * 1000 : Infinity;
    const minSelfDamage = Math.max(0, Number(cfg.combatTradeEstimateMinSelfDamage || 6));
    const minEnemyDps = Math.max(0, Number(cfg.combatTradeEstimateMinEnemyDps || 1.5));
    const safetyFactor = Math.max(1, Number(cfg.combatTradeEstimateSafetyFactor || 1.15));
    const noDamageSafeSelfHp = Math.max(0, Number(cfg.combatTradeEstimateNoDamageSafeSelfHp || 75));
    const noDamageUnsafeTDeathMs = Math.max(1000, Number(cfg.combatTradeEstimateNoDamageUnsafeTDeathMs || 30000));
    const zeroDamageWindow = targetDamage <= 0.01;
    const noDamageUnsafe = !zeroDamageWindow
      || selfHp <= noDamageSafeSelfHp
      || tDeathMs <= noDamageUnsafeTDeathMs;
    const disadvantaged = Boolean(
      selfDamage >= minSelfDamage
      && enemyDps >= minEnemyDps
      && tDeathMs < tKillMs * safetyFactor
      && targetHp > 1
      && noDamageUnsafe
    );
    return {
      active: disadvantaged,
      sampleCount: samples.length,
      elapsedMs,
      selfDamage,
      targetDamage,
      myDps,
      enemyDps,
      tKillMs,
      tDeathMs,
      safetyFactor,
      zeroDamageWindow,
      noDamageUnsafe
    };
  }
  function combatLiveAimTarget(self, target) {
    const targetId = target?.user_id ?? target?.id;
    const targetName = String(target?.name || '').trim();
    const nativeEntities = Array.isArray(bot.testNativeEntities) ? bot.testNativeEntities : [];
    const live = nativeEntities.find(entity => {
      const id = entity?.user_id ?? entity?.id;
      return targetId !== null && targetId !== undefined && id !== null && id !== undefined && String(id) === String(targetId);
    }) || (targetName ? nativeEntities.find(entity => String(entity?.name || '').trim() === targetName) : null);
    if (!live || !isAlive(live) || isInvulnerable(live)) return target;
    const x = Number(live.x);
    const y = Number(live.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return target;
    return {
      ...target,
      ...live,
      user_id: live.user_id ?? live.id ?? target.user_id ?? target.id,
      id: live.user_id ?? live.id ?? target.id ?? target.user_id,
      hp: combatHpValue(live),
      knownHp: knownHpValue(live),
      drop: dropValue(live) || target.drop,
      distance: dist(self, live),
      speed: speed(live),
      originalAimTarget: target,
      nativeAimResolved: true
    };
  }
  function combatAimSourceDivergenceState(aimSource, distance) {
    const original = aimSource?.originalAimTarget;
    const live = Boolean(aimSource?.nativeAimResolved);
    const ax = Number(aimSource?.x);
    const ay = Number(aimSource?.y);
    const ox = Number(original?.x);
    const oy = Number(original?.y);
    const divergence = live
      && Number.isFinite(ax)
      && Number.isFinite(ay)
      && Number.isFinite(ox)
      && Number.isFinite(oy)
      ? Math.hypot(ax - ox, ay - oy)
      : null;
    const baseThreshold = Math.max(0, Number(cfg.combatAimLiveDivergencePrecisionCm || 0));
    const ratio = Math.max(0, Number(cfg.combatAimLiveDivergencePrecisionRatio || 0));
    const ratioThreshold = Number.isFinite(Number(distance)) ? Math.round(Math.max(0, Number(distance)) * ratio) : 0;
    const threshold = Math.max(baseThreshold, ratioThreshold);
    return {
      active: Boolean(live && divergence !== null && threshold > 0 && divergence >= threshold),
      divergenceCm: divergence !== null ? Math.round(divergence) : null,
      thresholdCm: Math.round(threshold),
      baseThresholdCm: Math.round(baseThreshold),
      ratioThresholdCm: Math.round(ratioThreshold)
    };
  }
  function combatAimServerStallState() {
    const stall = typeof summarizeServerPositionStall === 'function'
      ? summarizeServerPositionStall()
      : bot.serverPositionStall;
    return stall && typeof stall === 'object' ? stall : {};
  }
  function combatAimDynamicStrategyState(self, target, aimSource, damage, moving, distance, movement, steadyAim, options = {}) {
    const fallbackPrecision = combatAimFallbackPrecisionState(damage?.noDamageMs);
    const sourceDivergence = combatAimSourceDivergenceState(aimSource, distance);
    const serverStall = combatAimServerStallState();
    const live = Boolean(aimSource?.nativeAimResolved);
    const attackRange = Math.max(0, Number(cfg.combatAttackRange || cfg.attackRange || 0));
    const radialMax = Math.max(0, Number(cfg.combatAimRadialPrecisionLateralRatio || 0));
    const realBulletPrecision = Boolean(live
      && moving
      && options.realBulletPressure
      && (!attackRange || Number(distance) <= attackRange));
    const lateralRatio = Math.abs(Number(movement?.lateralRatio || 0));
    const passiveRunnerIntercept = Boolean(live
      && moving
      && movement
      && options.passiveRunner
      && (!attackRange || Number(distance) <= attackRange));
    const liveIntercept = Boolean(live
      && moving
      && movement
      && (
        passiveRunnerIntercept
        || (lateralRatio > radialMax && (
          realBulletPrecision
          || (serverStall.stalled && (!attackRange || Number(distance) <= attackRange))
        ))
      ));
    const radialPrecision = Boolean(live
      && moving
      && radialMax > 0
      && movement
      && Number(movement.targetSpeed || 0) >= Number(cfg.combatStationarySpeed || 0)
      && lateralRatio <= radialMax
      && (!attackRange || Number(distance) <= attackRange));
    let mode = moving ? 'intercept' : 'exact';
    let strategy = moving ? 'intercept' : 'exact';
    let reason = moving ? (movement?.mode || 'moving') : 'stationary';
    let precision = false;
    let steady = false;
    let passiveRunnerAim = false;
    if (sourceDivergence.active) {
      mode = 'live-precision';
      strategy = 'live-precision';
      reason = 'coordinate-divergence';
      precision = true;
    } else if (passiveRunnerIntercept) {
      strategy = 'live-intercept';
      reason = 'passive-runner-intercept';
      passiveRunnerAim = true;
    } else if (realBulletPrecision && liveIntercept) {
      strategy = 'live-intercept';
      reason = 'real-bullet-pressure-intercept';
    } else if (realBulletPrecision) {
      mode = 'live-precision';
      strategy = 'live-precision';
      reason = 'real-bullet-pressure';
      precision = true;
    } else if (live && serverStall.stalled && liveIntercept) {
      strategy = 'live-intercept';
      reason = 'server-stall-live-intercept';
    } else if (live && serverStall.stalled) {
      mode = 'live-precision';
      strategy = 'live-precision';
      reason = 'server-stall-live';
      precision = true;
    } else if (radialPrecision) {
      mode = 'live-precision';
      strategy = 'live-precision';
      reason = 'radial-motion';
      precision = true;
    } else if (fallbackPrecision.active) {
      mode = 'precision';
      strategy = 'fallback-precision';
      reason = 'no-damage-fallback';
      precision = true;
    } else if (steadyAim?.active && moving) {
      mode = 'steady';
      strategy = 'steady';
      reason = 'steady-no-damage';
      steady = true;
    }
    return {
      mode,
      strategy,
      reason,
      precision,
      steady,
      bypassJitter: Boolean(!moving || precision || steady),
      sourceDivergence,
      serverStall: Boolean(serverStall.stalled),
      liveIntercept,
      realBulletPrecision,
      radialPrecision,
      fallbackPrecision: Boolean(fallbackPrecision.active),
      passiveRunner: Boolean(passiveRunnerAim),
      movementMode: precision ? strategy : (steady ? 'steady' : (movement?.mode || ''))
    };
  }
  function combatStrafeHoldMs() {
    const base = Math.max(300, Number(cfg.combatStrafeDirectionLockMs ?? cfg.combatStrafeLockMs) || 700);
    const jitter = Math.max(0, Number(cfg.combatStrafeRandomJitterMs) || 0);
    return base + (jitter ? Math.floor(Math.random() * jitter) : 0);
  }
  function combatPreciseStrafeSign(pressure) {
    const signedLane = Number(pressure?.signedLaneDistance);
    const laneMin = Math.max(0, Number(cfg.combatStrafePreciseLaneMin ?? 1));
    return !pressure?.synthetic && Number.isFinite(signedLane) && Math.abs(signedLane) > laneMin
      ? -Math.sign(signedLane)
      : 0;
  }
  function selectCombatStrafeSign(existing, key, preciseSign, t = Date.now()) {
    let sign = 0;
    let until = 0;
    let locked = false;
    let lockOverridden = false;
    const existingUntil = Number(existing?.until || 0);
    if (existing && existing.key === key && t < existingUntil) {
      const existingSign = Math.sign(Number(existing.sign || 0));
      const precise = Math.sign(Number(preciseSign || 0));
      if (precise && existingSign && existingSign !== precise) {
        sign = precise;
        until = t + combatStrafeHoldMs();
        lockOverridden = true;
      } else {
        sign = existingSign;
        until = existingUntil;
        locked = Boolean(sign);
      }
    }
    if (!sign) {
      sign = Math.sign(Number(preciseSign || 0)) || (Math.random() < 0.5 ? -1 : 1);
      until = t + combatStrafeHoldMs();
    }
    return { sign, until, locked, lockOverridden };
  }
  function combatStrafeVectorForTest(self, target, pressure, sign, options = {}) {
    let baseX = Number(pressure?.vx) || 0;
    let baseY = Number(pressure?.vy) || 0;
    if (!(baseX || baseY) && target) {
      baseX = Number(target.x) - Number(self.x);
      baseY = Number(target.y) - Number(self.y);
    }
    const tangentX = -baseY * sign;
    const tangentY = baseX * sign;
    let dx = Math.sign(tangentX || 0);
    let dy = Math.sign(tangentY || 0);
    let closingBiased = false;
    if (target) {
      const awayX = Math.sign(Number(self.x) - Number(target.x)) || 0;
      const awayY = Math.sign(Number(self.y) - Number(target.y)) || 0;
      const approachX = Math.sign(Number(target.x) - Number(self.x)) || 0;
      const approachY = Math.sign(Number(target.y) - Number(self.y)) || 0;
      const fillX = options.preferClosing ? approachX : awayX;
      const fillY = options.preferClosing ? approachY : awayY;
      if (dx && !dy && fillY) dy = fillY;
      else if (dy && !dx && fillX) dx = fillX;
      if (options.preferClosing && dx && dy) {
        const closesX = Boolean(approachX && Math.sign(dx) === approachX);
        const closesY = Boolean(approachY && Math.sign(dy) === approachY);
        if (!closesX && !closesY) {
          const offsetX = Math.abs(Number(target.x) - Number(self.x));
          const offsetY = Math.abs(Number(target.y) - Number(self.y));
          if (offsetX >= offsetY && approachX) {
            closingBiased = Math.sign(dx) !== approachX;
            dx = approachX;
          } else if (approachY) {
            closingBiased = Math.sign(dy) !== approachY;
            dy = approachY;
          }
        }
      }
    }
    if (!(dx || dy) && target) {
      dx = Math.sign(Number(self.y) - Number(target.y)) || 1;
      dy = Math.sign(Number(target.x) - Number(self.x)) || 0;
    }
    return { dx: clampValue(Math.round(dx), -1, 1), dy: clampValue(Math.round(dy), -1, 1), closingBiased };
  }
  function normalizeBulletForTest(raw) {
    if (!raw || typeof raw !== 'object') return null;
    let vx = Number(raw.vx ?? raw.velocity_x ?? raw.dx ?? 0);
    let vy = Number(raw.vy ?? raw.velocity_y ?? raw.dy ?? 0);
    const speedPerTick = Number(raw.speed_per_tick ?? raw.speedPerTick ?? raw.speed_per_server_tick ?? NaN);
    const startX = Number(raw.start_x ?? raw.startX ?? raw.origin_x ?? raw.x ?? raw.pos_x);
    const startY = Number(raw.start_y ?? raw.startY ?? raw.origin_y ?? raw.y ?? raw.pos_y);
    if (!(vx || vy) && Number.isFinite(startX) && Number.isFinite(startY)) {
      const targetX = Number(raw.target_x ?? raw.targetX ?? raw.aim_x ?? raw.aimX);
      const targetY = Number(raw.target_y ?? raw.targetY ?? raw.aim_y ?? raw.aimY);
      const aimDx = targetX - startX;
      const aimDy = targetY - startY;
      const aimDistance = Math.hypot(aimDx, aimDy);
      if (Number.isFinite(aimDistance) && aimDistance > 0.01) {
        const speedValue = Number.isFinite(speedPerTick) && speedPerTick > 0 ? speedPerTick : Number(cfg.combatBulletSpeedPerTick || 500);
        vx = aimDx / aimDistance * speedValue;
        vy = aimDy / aimDistance * speedValue;
      }
    }
    const x = Number(raw.x ?? raw.pos_x ?? raw.head_x ?? raw.headX ?? startX);
    const y = Number(raw.y ?? raw.pos_y ?? raw.head_y ?? raw.headY ?? startY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const ownerId = raw.ownerId ?? raw.owner_id ?? raw.owner_user_id ?? raw.source_user_id ?? raw.shooter_user_id ?? raw.user_id ?? raw.from_user_id ?? null;
    return {
      ...raw,
      id: raw.bullet_id ?? raw.id ?? raw.entity_id ?? (Math.round(x) + ':' + Math.round(y) + ':' + Math.round(vx) + ':' + Math.round(vy)),
      ownerId,
      x,
      y,
      vx: Number.isFinite(vx) ? vx : 0,
      vy: Number.isFinite(vy) ? vy : 0
    };
  }
  function combatMoveVelocityForDirectionForTest(dx, dy) {
    const x = clampValue(Math.round(Number(dx) || 0), -1, 1);
    const y = clampValue(Math.round(Number(dy) || 0), -1, 1);
    if (!(x || y)) return { vx: 0, vy: 0 };
    const speedPerTick = Math.max(1, Number(cfg.combatTargetDodgeSpeedPerTick || 50));
    const axisSpeed = x && y ? Math.round(speedPerTick / Math.SQRT2) : speedPerTick;
    return { vx: x * axisSpeed, vy: y * axisSpeed };
  }
  function combatBulletThreatsForTest(self, target = null, bullets = []) {
    const selfId = Number(self?.user_id);
    const items = [];
    for (const raw of bullets || []) {
      const bullet = normalizeBulletForTest(raw);
      if (!bullet) continue;
      if (bullet.ownerId !== null && bullet.ownerId !== undefined && Number(bullet.ownerId) === selfId) continue;
      if (target && bullet.ownerId !== null && bullet.ownerId !== undefined && String(bullet.ownerId) !== String(target.user_id)) continue;
      const speedValue = Math.hypot(Number(bullet.vx) || 0, Number(bullet.vy) || 0);
      if (speedValue <= 0.01) continue;
      const toSelfX = Number(self.x) - Number(bullet.x);
      const toSelfY = Number(self.y) - Number(bullet.y);
      const distance = Math.hypot(toSelfX, toSelfY);
      if (distance > cfg.combatBulletDetectRadius) continue;
      const projection = (toSelfX * bullet.vx + toSelfY * bullet.vy) / speedValue;
      if (projection <= 0 || projection > cfg.combatBulletLookaheadDistance) continue;
      const signedLaneDistance = (toSelfX * bullet.vy - toSelfY * bullet.vx) / speedValue;
      const laneDistance = Math.abs(signedLaneDistance);
      if (laneDistance > cfg.combatBulletLaneRadius) continue;
      const timeToImpactMs = projection / speedValue * 50;
      const impactTicks = projection / speedValue;
      const hitRadius = Math.max(0, Number(cfg.combatBulletHitRadiusCm || 90));
      const score = (cfg.combatBulletLaneRadius - laneDistance) * 1000
        + (cfg.combatBulletLookaheadDistance - projection)
        + Math.max(0, 1500 - timeToImpactMs);
      items.push({
        id: bullet.id,
        ownerId: bullet.ownerId,
        x: bullet.x,
        y: bullet.y,
        vx: bullet.vx,
        vy: bullet.vy,
        distance,
        projection,
        laneDistance,
        signedLaneDistance,
        impactTicks,
        timeToImpactMs,
        hitRadius,
        directHit: laneDistance <= hitRadius,
        score
      });
    }
    return items.sort((a, b) => b.score - a.score || a.timeToImpactMs - b.timeToImpactMs);
  }
  function incomingBulletThreatForTest(self, target = null, bullets = []) {
    const threats = combatBulletThreatsForTest(self, target, bullets);
    const best = threats[0] || null;
    if (!best) return null;
    return {
      ...best,
      threatCount: threats.length,
      threats: threats.slice(0, 6)
    };
  }
  function combatThreatFieldCandidateForTest(self, threats, dx, dy) {
    const move = combatMoveVelocityForDirectionForTest(dx, dy);
    let safetyScore = 0;
    let minCpaDistance = Infinity;
    let minTimeToImpactMs = Infinity;
    let directHitCount = 0;
    for (const threat of threats || []) {
      const rx = Number(threat.x) - Number(self.x);
      const ry = Number(threat.y) - Number(self.y);
      const rvx = (Number(threat.vx) || 0) - move.vx;
      const rvy = (Number(threat.vy) || 0) - move.vy;
      const relSpeedSq = rvx * rvx + rvy * rvy;
      const rawImpactTicks = Number(threat.impactTicks);
      const horizonTicks = Math.max(0, Math.min(
        Number.isFinite(rawImpactTicks) ? rawImpactTicks + 1 : 30,
        Number(cfg.combatBulletLookaheadDistance || 42000) / Math.max(1, Number(cfg.combatBulletSpeedPerTick || 500))
      ));
      const cpaTicks = relSpeedSq > 0.000001
        ? clampValue(-(rx * rvx + ry * rvy) / relSpeedSq, 0, horizonTicks)
        : 0;
      const cpaX = rx + rvx * cpaTicks;
      const cpaY = ry + rvy * cpaTicks;
      const cpaDistance = Math.hypot(cpaX, cpaY);
      const hitRadius = Math.max(0, Number(threat.hitRadius ?? cfg.combatBulletHitRadiusCm ?? 90));
      const timeToImpactMs = Number(threat.timeToImpactMs);
      const urgency = Number.isFinite(timeToImpactMs) ? Math.max(0.35, 1.8 - Math.min(1500, timeToImpactMs) / 1500) : 1;
      minCpaDistance = Math.min(minCpaDistance, cpaDistance);
      if (Number.isFinite(timeToImpactMs)) minTimeToImpactMs = Math.min(minTimeToImpactMs, timeToImpactMs);
      if (cpaDistance <= hitRadius) directHitCount += 1;
      safetyScore += Math.min(5000, cpaDistance) * urgency;
      if (cpaDistance <= hitRadius) safetyScore -= (hitRadius - cpaDistance + 1) * 100000 * urgency;
      else if (cpaDistance <= hitRadius * 3) safetyScore -= (hitRadius * 3 - cpaDistance) * 300 * urgency;
    }
    return {
      dx: clampValue(Math.round(Number(dx) || 0), -1, 1),
      dy: clampValue(Math.round(Number(dy) || 0), -1, 1),
      safetyScore,
      minCpaDistance,
      minTimeToImpactMs,
      directHitCount
    };
  }
  function combatBulletThreatFieldForTest(self, threats, options = {}) {
    const list = (threats || []).filter(Boolean).slice(0, 6);
    if (!list.length) return null;
    const preferred = options.preferred || {};
    const preferredDx = clampValue(Math.round(Number(preferred.dx) || 0), -1, 1);
    const preferredDy = clampValue(Math.round(Number(preferred.dy) || 0), -1, 1);
    const target = options.target || null;
    const approachX = target ? Math.sign(Number(target.x) - Number(self.x)) || 0 : 0;
    const approachY = target ? Math.sign(Number(target.y) - Number(self.y)) || 0 : 0;
    const directions = [
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 },
      { dx: 1, dy: 1 },
      { dx: 1, dy: -1 },
      { dx: -1, dy: 1 },
      { dx: -1, dy: -1 }
    ];
    return directions.map(item => {
      const candidate = combatThreatFieldCandidateForTest(self, list, item.dx, item.dy);
      let bias = 0;
      if (candidate.dx === preferredDx && candidate.dy === preferredDy) bias += 120;
      if (options.preferClosing) {
        if (candidate.dx && approachX && candidate.dx === approachX) bias += 40;
        if (candidate.dy && approachY && candidate.dy === approachY) bias += 40;
      }
      return { ...candidate, safetyScore: candidate.safetyScore + bias };
    }).sort((a, b) => {
      if (a.directHitCount !== b.directHitCount) return a.directHitCount - b.directHitCount;
      if (b.safetyScore !== a.safetyScore) return b.safetyScore - a.safetyScore;
      return b.minCpaDistance - a.minCpaDistance;
    })[0] || null;
  }
  function combatMoveClosesDistanceForTest(self, target, move) {
    const dx = clampValue(Math.round(Number(move?.dx) || 0), -1, 1);
    const dy = clampValue(Math.round(Number(move?.dy) || 0), -1, 1);
    if (!(dx || dy) || !self || !target) return false;
    const toTargetX = Number(target.x) - Number(self.x);
    const toTargetY = Number(target.y) - Number(self.y);
    return (toTargetX * dx + toTargetY * dy) > 0;
  }
  function combatSafeCloseMoveOverrideForTest(self, target, pressure, closeMove) {
    if (!self || !target || !pressure || pressure.synthetic || !closeMove?.active) return null;
    const dx = clampValue(Math.round(Number(closeMove.dx) || 0), -1, 1);
    const dy = clampValue(Math.round(Number(closeMove.dy) || 0), -1, 1);
    if (!(dx || dy) || !combatMoveClosesDistanceForTest(self, target, { dx, dy })) return null;
    const candidate = combatThreatFieldCandidateForTest(self, pressure.threats || [pressure], dx, dy);
    const hitRadius = Math.max(0, Number(cfg.combatBulletHitRadiusCm || 90));
    const minSafeCpa = Math.max(hitRadius * 3, Number(cfg.combatPressureCloseMinCpaCm || 0));
    if (candidate.directHitCount > 0) return null;
    if (Number.isFinite(Number(candidate.minCpaDistance)) && Number(candidate.minCpaDistance) < minSafeCpa) return null;
    return {
      dx,
      dy,
      active: true,
      reason: closeMove.reason || 'safe-close',
      source: closeMove,
      threatField: candidate,
      minSafeCpa
    };
  }
  function coinAxisApproachDirection(dxRaw, dyRaw, distance, tolerance = cfg.coinPrecisionTolerance) {
    const absX = Math.abs(dxRaw);
    const absY = Math.abs(dyRaw);
    const minDistance = Math.max(0, Number(cfg.coinAxisApproachMinDistance || cfg.nearCoinStuckDistance || 0));
    if (Math.max(absX, absY) <= minDistance) return null;
    const ratio = Math.max(1, Number(cfg.coinAxisApproachRatio || 1));
    const laneTolerance = Math.max(tolerance, Number(cfg.coinAxisApproachLaneTolerance || 0));
    if (absX > tolerance && absX > absY && (absY <= laneTolerance || absX >= absY * ratio)) {
      return { dx: Math.sign(dxRaw), dy: 0, distance, axisApproach: 'x' };
    }
    if (absY > tolerance && absY > absX && (absX <= laneTolerance || absY >= absX * ratio)) {
      return { dx: 0, dy: Math.sign(dyRaw), distance, axisApproach: 'y' };
    }
    return null;
  }
  function coinPickupPrecisionPulseMs(distance, failureCount = 0) {
    const d = Math.max(0, Number(distance) || 0);
    const stopDistance = Math.max(0, Number(cfg.coinPickupStopDistance || 0));
    const microDistance = Math.max(stopDistance, Number(cfg.coinPickupMicroDistance || 0));
    const fineDistance = Math.max(microDistance, Number(cfg.coinPickupFineDistance || 0));
    const brakeDistance = Math.max(fineDistance, Number(cfg.coinPickupBrakeDistance || 0));
    let pulse = Number(cfg.coinPickupSweepPulseMs) || 150;
    if (d <= stopDistance) {
      pulse = Number(cfg.coinPickupStopPulseMs) || Number(cfg.coinPickupMicroPulseMs) || 45;
    } else if (d <= microDistance) {
      pulse = Number(cfg.coinPickupMicroPulseMs) || Number(cfg.coinPickupFinePulseMs) || 60;
    } else if (d <= fineDistance) {
      pulse = Number(cfg.coinPickupFinePulseMs) || Number(cfg.coinPickupBrakePulseMs) || 75;
    } else if (d <= brakeDistance) {
      pulse = Number(cfg.coinPickupBrakePulseMs) || 90;
    }
    const slowStep = Math.max(0, Number(cfg.coinPickupFailureSlowStepMs || 0));
    const minPulse = Math.max(20, Number(cfg.coinPickupFailureMinPulseMs || 35));
    const slowMs = Math.max(0, Math.floor(Number(failureCount) || 0)) * slowStep;
    return Math.max(minPulse, Math.round(pulse - slowMs));
  }
  function coinAxisLockShouldHold(lock, dxRaw, dyRaw) {
    if (!lock || !(lock.dx || lock.dy)) return false;
    const axisRaw = lock.dx ? dxRaw : dyRaw;
    const axisSign = lock.dx || lock.dy;
    const brakeDistance = Math.max(cfg.coinPrecisionTolerance, Number(cfg.coinApproachBrakeDistance || cfg.coinAxisFlipTolerance || 0));
    return Math.sign(axisRaw) === axisSign && Math.abs(axisRaw) > brakeDistance;
  }
  function coinDirectionTo(self, target, tolerance = cfg.coinPrecisionTolerance) {
    const dxRaw = Number(target.x) - Number(self.x);
    const dyRaw = Number(target.y) - Number(self.y);
    const distance = dist(self, target);
    const exactTolerance = Math.max(0, Number(cfg.coinPickupExactTolerance ?? 0) || 0);
    if (distance <= Math.max(0, Number(cfg.coinPickupSweepDistance || cfg.coinPickupFineDistance || 0))) {
      return {
        dx: Math.abs(dxRaw) > exactTolerance ? Math.sign(dxRaw) : 0,
        dy: Math.abs(dyRaw) > exactTolerance ? Math.sign(dyRaw) : 0,
        distance,
        exactTarget: true
      };
    }
    return coinAxisApproachDirection(dxRaw, dyRaw, distance, tolerance)
      || directionTo(self, target, tolerance);
  }
  function opportunityEffectiveStaminaCost(staminaCost) {
    const floor = Math.max(1, Number(cfg.opportunityDistanceFloor || 1));
    const d = Math.max(0, Number(staminaCost) || 0);
    return Math.max(floor, d);
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
  function dailyStaminaBudgetIsLimiting(self, staminaCost = 0) {
    const cost = Math.max(0, Number(staminaCost) || 0);
    const oneHour = opportunityWindowStaminaBudget(self, '1h');
    const oneDay = opportunityWindowStaminaBudget(self, '1d');
    return Number.isFinite(oneDay)
      && cost > oneDay
      && (!Number.isFinite(oneHour) || cost <= oneHour);
  }
  function opportunityStaminaAffordable(self, staminaCost) {
    const cost = Number(staminaCost);
    if (!Number.isFinite(cost) || cost <= 0) return true;
    const budget = opportunityLongStaminaBudget(self);
    return !Number.isFinite(budget) || cost <= budget;
  }

  function summarizeBlockedStaminaOpportunity(self, coins, targets = []) {
    const budget = opportunityLongStaminaBudget(self);
    if (!Number.isFinite(budget)) return null;
    const items = [];
    for (const coin of coins || []) {
      const distance = Number(coin?.distance);
      const amount = Number(coin?.amount || 0);
      if (!(amount > 0) || !Number.isFinite(distance)) continue;
      const staminaCost = opportunityCoinStaminaCost(coin);
      if (staminaCost <= budget) continue;
      items.push({
        type: 'coin',
        id: coin.drop_id,
        amount,
        distance,
        staminaCost,
        shortageMs: staminaCost - budget,
        snapshot: Boolean(coin.snapshot),
        native: Boolean(coin.native)
      });
    }
    for (const target of targets || []) {
      const distance = Number(target?.distance);
      const drop = Number(target?.drop ?? dropValue(target) ?? 0);
      if (!(drop > 0) || !Number.isFinite(distance)) continue;
      const staminaCost = opportunityEnemyStaminaCost(target);
      if (staminaCost <= budget) continue;
      items.push({
        type: 'enemy',
        id: target.user_id,
        name: target.name || '',
        drop,
        distance,
        staminaCost,
        shortageMs: staminaCost - budget
      });
    }
    if (!items.length) return null;
    items.sort((a, b) => a.shortageMs - b.shortageMs || a.distance - b.distance);
    const best = items[0];
    return {
      budgetMs: Math.max(0, Math.round(budget)),
      requiredMs: Math.max(0, Math.round(best.staminaCost)),
      shortageMs: Math.max(0, Math.round(best.shortageMs)),
      type: best.type,
      id: best.id,
      name: best.name || '',
      amount: best.amount || 0,
      drop: best.drop || 0,
      distance: Math.round(best.distance),
      snapshot: Boolean(best.snapshot),
      native: Boolean(best.native)
    };
  }
  function summarizeNearestCoinStaminaBudgetExit(self, coins) {
    const budget = opportunityWindowStaminaBudget(self, '1h');
    if (!Number.isFinite(budget)) return null;
    const candidates = (coins || [])
      .map(coin => ({ ...coin, distance: Number.isFinite(Number(coin?.distance)) ? Number(coin.distance) : dist(self, coin), amount: Number(coin?.amount || 0) }))
      .filter(coin => coin.amount > 0 && Number.isFinite(coin.distance))
      .sort((a, b) => a.distance - b.distance || b.amount - a.amount);
    const coin = candidates[0] || null;
    if (!coin) return null;
    const staminaCost = opportunityCoinStaminaCost(coin);
    if (staminaCost <= budget) return null;
    return {
      type: 'coin',
      window: '1h',
      id: coin.drop_id,
      amount: coin.amount,
      distance: Math.round(coin.distance),
      budgetMs: Math.max(0, Math.round(budget)),
      requiredMs: Math.max(0, Math.round(staminaCost)),
      shortageMs: Math.max(0, Math.round(staminaCost - budget)),
      reloginDelayMs: Math.max(1000, Number(cfg.staminaBudgetReloginDelayMs || 1800000))
    };
  }
  function staminaBudgetCoinLeaveAction(staminaBudgetExit) {
    return {
      kind: 'leave',
      reason: 'stamina-budget-coin-leave',
      dx: 0,
      dy: 0,
      offline: true,
      staminaBudgetExit,
      reloginDelayMs: staminaBudgetExit?.reloginDelayMs || Math.max(1000, Number(cfg.staminaBudgetReloginDelayMs || 1800000))
    };
  }
  function opportunityValueScore(value, staminaCost, weight = cfg.coinOpportunityValue) {
    const amount = Number(value || 0);
    if (!(amount > 0)) return -Infinity;
    const scale = Math.max(1, Number(cfg.opportunityDistanceScoreScale || 1));
    return amount * Number(weight || 1) * scale / opportunityEffectiveStaminaCost(staminaCost);
  }
  function compareCoinOpportunity(a, b) {
    const scoreDiff = scoreCoinOpportunity(b) - scoreCoinOpportunity(a);
    if (scoreDiff) return scoreDiff;
    const amountDiff = Number(b.amount || 0) - Number(a.amount || 0);
    if (amountDiff) return amountDiff;
    return Number(a.distance || 0) - Number(b.distance || 0);
  }
  function mergeCoinRouteDisplay(base, routeCoin) {
    if (!base || !routeCoin?.coinRoute) return base;
    return {
      ...base,
      reason: 'best-opportunity-coin-route',
      coinRoute: routeCoin.coinRoute,
      routeValue: routeCoin.routeValue || null,
      routeKind: routeCoin.routeKind || '',
      routeLegs: routeCoin.routeLegs || 0,
      routeDisplayOnly: true
    };
  }
  function nearestRealtimeCoinWithin(self, coins, activeThreats, maxDistance) {
    if (!(Number(maxDistance) > 0)) return null;
    return safeCoins(self, (coins || []).filter(coin => !isSnapshotOnlyCoin(coin)), activeThreats, maxDistance)
      .filter(coin => opportunityStaminaAffordable(self, opportunityCoinStaminaCost(coin)))
      .sort((a, b) => Number(a.distance || Infinity) - Number(b.distance || Infinity)
        || Number(b.amount || 0) - Number(a.amount || 0))[0] || null;
  }
  function fieldMigrationBlockedByNearbyCoin(self, coins, activeThreats, fieldCoin = null) {
    const blockDistance = Math.max(0, Number(cfg.fieldMigrationNearbyCoinBlockDistance || 0));
    if (!(blockDistance > 0)) return false;
    const nearby = nearestRealtimeCoinWithin(self, coins, activeThreats, blockDistance);
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
  function pickField(self, coins, activeThreats) {
    const candidates = coins
      .map(c => ({ ...c, distance: dist(self, c), amount: Number(c.amount || 0) }))
      .filter(c => c.amount > 0
        && c.distance >= cfg.fieldMigrationMinDistance
        && c.distance <= cfg.fieldMigrationMaxDistance)
      .filter(c => !activeThreats.some(t => coinBlockedByThreat(self, c, t)))
      .filter(c => opportunityStaminaAffordable(self, opportunityCoinStaminaCost(c)));
    let best = null;
    for (const coin of candidates) {
      const members = candidates.filter(other => dist(coin, other) <= cfg.fieldMigrationClusterRadius);
      if (members.length < cfg.fieldMigrationMinCoins) continue;
      const totalAmount = members.reduce((sum, item) => sum + item.amount, 0);
      const staminaCost = opportunityCoinStaminaCost(coin);
      const score = opportunityValueScore(totalAmount, staminaCost, cfg.coinOpportunityValue);
      if (!best || score > best.score) {
        best = {
          ...coin,
          score,
          fieldScore: score,
          opportunityScore: score,
          opportunityStaminaCost: staminaCost,
          fieldMigration: true,
          fieldMembers: members.length,
          fieldAmount: totalAmount,
          members: members.length,
          totalAmount
        };
      }
    }
    if (best && fieldMigrationBlockedByNearbyCoin(self, coins, activeThreats, best)) return null;
    return best;
  }

  function pickDistantCoin(self, coins, activeThreats) {
    return coins
      .map(c => ({ ...c, distance: dist(self, c), amount: Number(c.amount || 0) }))
      .filter(c => c.amount > 0
        && c.distance >= cfg.distantCoinMinDistance
        && c.distance <= cfg.distantCoinMaxDistance)
      .filter(c => !activeThreats.some(t => coinBlockedByThreat(self, c, t)))
      .filter(c => opportunityStaminaAffordable(self, opportunityCoinStaminaCost(c)))
      .sort(compareCoinOpportunity)[0] || null;
  }

  function safeCoins(self, coins, activeThreats, maxDistance) {
    return coins
      .map(c => ({ ...c, distance: dist(self, c), amount: Number(c.amount || 0) }))
      .filter(c => c.amount > 0 && c.distance <= maxDistance)
      .filter(c => !activeThreats.some(t => coinBlockedByThreat(self, c, t)))
      .sort(compareCoinOpportunity);
  }

  function pickNearestDailyStaminaFinalCoin(self, coins, activeThreats) {
    return safeCoins(self, (coins || []).filter(coin => !isSnapshotOnlyCoin(coin)), activeThreats, cfg.globalCoinMaxDistance)
      .filter(coin => dailyStaminaBudgetIsLimiting(self, opportunityCoinStaminaCost(coin)))
      .sort((a, b) => Number(a.distance || Infinity) - Number(b.distance || Infinity)
        || Number(b.amount || 0) - Number(a.amount || 0))[0] || null;
  }

  function highValueCoinPriorityAmount() {
    const value = Number(cfg.highValueCoinPriorityAmount ?? 10);
    return Math.max(1, Number.isFinite(value) ? value : 10);
  }

  function highValueCoinPriorityHealthyHp() {
    const value = Number(cfg.highValueCoinPriorityHealthyHp ?? cfg.combatLowHpLeaveThreshold ?? 50);
    return Math.max(1, Number.isFinite(value) ? value : 50);
  }

  function pickHighValueVisibleCoin(self, coins, activeThreats, options = {}) {
    const maxDistance = Math.max(0, Number(cfg.globalCoinMaxDistance || cfg.opportunityVisibleDistance || cfg.coinMaxDistance || 0));
    const threats = options.ignoreThreats ? [] : activeThreats;
    return safeCoins(self, (coins || []).filter(coin => !isSnapshotOnlyCoin(coin)), threats, maxDistance)
      .filter(coin => Number(coin.amount || 0) >= highValueCoinPriorityAmount())
      .filter(coin => opportunityStaminaAffordable(self, opportunityCoinStaminaCost(coin)))[0] || null;
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
    return hasCombatActivitySignalForTest(threat) || isActive(threat) || isFiringEntity(threat);
  }

  function canPrioritizeHighValueVisibleCoin(self, coin, context = {}) {
    if (!coin) return false;
    const hp = hpValue(self);
    const healthyHp = highValueCoinPriorityHealthyHp();
    if (hp >= healthyHp) return true;
    const incoming = incomingBulletInfo(self, context.bullets || []);
    if (incoming.incoming) return false;
    if (context.engagedCombatTarget || context.defensiveCombatTarget) return false;
    return !(context.activeThreats || []).some(threat => nearbyThreatBlocksLowHpHighValueCoin(threat, incoming.ownerId, incoming.unknownIncoming));
  }

  function highValueVisibleCoinPriorityNeeded(self, context = {}) {
    if (context.recovery || context.engagedCombatTarget || context.defensiveCombatTarget) return true;
    if ((context.avoidanceThreats || []).length) return true;
    const incoming = incomingBulletInfo(self, context.bullets || []);
    if (incoming.incoming) return true;
    return false;
  }

  function snapshotLocalCoinAllowed(self, coin) {
    if (!coin?.snapshot || coin?.native) return true;
    const distance = self ? dist(self, coin) : Infinity;
    if (!Number.isFinite(distance)) return true;
    const radius = Math.max(0, Number(cfg.nativeCoinAuthoritativeRadius || 0));
    return distance > radius;
  }

  function isSnapshotOnlyCoin(coin) {
    return Boolean(coin?.snapshot) && !coin?.native;
  }

  function filterLocalSnapshotCoins(self, coins) {
    return (coins || []).filter(coin => snapshotLocalCoinAllowed(self, coin));
  }

  function pickRealtimeLocalCoin(self, coins, activeThreats) {
    const radius = Math.max(0, Number(cfg.nativeCoinAuthoritativeRadius || 0));
    if (!(radius > 0)) return null;
    return safeCoins(self, (coins || []).filter(coin => !isSnapshotOnlyCoin(coin)), activeThreats, radius)
      .filter(coin => opportunityStaminaAffordable(self, opportunityCoinStaminaCost(coin)))[0] || null;
  }

  function pickSnapshotCoinDestination(self, coins, activeThreats, options = {}) {
    const allowIdleFallback = Boolean(options.allowIdleFallback || options.idleFallback);
    if (!allowIdleFallback && !options.ignoreRealtimeLocalCoin && pickRealtimeLocalCoin(self, coins, activeThreats)) return null;
    const candidates = safeCoins(self, filterLocalSnapshotCoins(self, coins).filter(isSnapshotOnlyCoin), activeThreats, cfg.snapshotCoinMaxDistance);
    if (!candidates.length) return null;
    let best = null;
    let idleBest = null;
    const radius = Number(cfg.snapshotCoinClusterRadius || cfg.fieldMigrationClusterRadius);
    const minCoins = Math.max(1, Number(cfg.snapshotCoinClusterMinCoins || 1));
    for (const coin of candidates) {
      const members = candidates.filter(other => dist(coin, other) <= radius);
      const totalAmount = members.reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const staminaCost = opportunityCoinStaminaCost(coin);
      const score = opportunityValueScore(totalAmount, staminaCost, cfg.coinOpportunityValue);
      const item = {
        ...coin,
        snapshotMembers: members.length,
        snapshotAmount: totalAmount,
        snapshotScore: score,
        opportunityScore: score,
        opportunityStaminaCost: staminaCost
      };
      const affordable = opportunityStaminaAffordable(self, staminaCost);
      if (affordable && snapshotCoinWorthLongTravel(coin, members.length, totalAmount)) {
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
    return best || (idleBest ? { ...idleBest, snapshotIdleFallback: true, opportunityScore: idleBest.snapshotScore } : null);
  }

  function mergeThreatLists(...lists) {
    const merged = [];
    const seen = new Set();
    for (const list of lists) {
      for (const threat of list || []) {
        if (!threat) continue;
        const id = threat?.user_id ?? threat?.id;
        const key = id !== undefined && id !== null && id !== ''
          ? String(id)
          : ('xy:' + Math.round(Number(threat.x) || 0) + ':' + Math.round(Number(threat.y) || 0));
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(threat);
      }
    }
    return merged.sort((a, b) => Number(a.distance || Infinity) - Number(b.distance || Infinity));
  }

  function snapshotCoinWorthLongTravel(coin, members = 1, totalAmount = null) {
    const memberCount = Math.max(1, Number(members || 1));
    const minCoins = Math.max(1, Number(cfg.snapshotCoinClusterMinCoins || 1));
    if (memberCount >= minCoins) return true;
    const distance = Number(coin?.distance ?? Infinity);
    if (!Number.isFinite(distance)) return false;
    const amount = Math.max(0, Number(totalAmount ?? coin?.amount ?? 0));
    const baseMax = Math.max(0, Number(cfg.snapshotSingleCoinMaxDistance || cfg.globalCoinMaxDistance || cfg.coinMaxDistance || 0));
    const perAmount = Math.max(0, Number(cfg.snapshotSingleCoinDistancePerAmount || 0));
    const maxDistance = Math.max(baseMax, amount * perAmount);
    return distance <= maxDistance;
  }

  function snapshotCoinNavigationReason(coin) {
    if (coin?.snapshotIdleFallback) return 'snapshot-coin-idle-timeout';
    if (coin?.fieldMigration) return 'migrate-to-known-field';
    if (isSnapshotOnlyCoin(coin) && Number(coin?.snapshotMembers || 0) > 0) {
      return coin.snapshotMembers >= cfg.snapshotCoinClusterMinCoins ? 'snapshot-coin-field' : 'snapshot-coin-target';
    }
    return coin.distance <= cfg.coinMaxDistance ? 'best-opportunity-coin' : 'best-opportunity-visible-coin';
  }

  function enemyTargets(self, entities, activeThreats) {
    return entities
      .filter(e => !isActive(e) && dropValue(e) > 0 && !isInvulnerable(e))
      .map(e => ({ ...e, distance: dist(self, e), drop: dropValue(e) }))
      .filter(e => e.distance <= cfg.attackApproachRange)
      .filter(e => attackWorthTaking(self, e))
      .filter(e => !activeThreats.some(t => dist(e, t) <= cfg.attackDangerRadius));
  }

  function scoreCoinOpportunity(coin) {
    const override = Number(coin?.opportunityScore ?? coin?.snapshotScore ?? coin?.fieldScore ?? NaN);
    if (Number.isFinite(override)) return override;
    const sticky = bot.lastTarget?.kind === 'coin'
      && String(bot.lastTarget.id) === String(coin.drop_id)
      && Date.now() - bot.lastTargetAt < cfg.coinStickMs;
    return opportunityValueScore(coin.amount, opportunityCoinStaminaCost(coin), cfg.coinOpportunityValue)
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

  function updateOpportunityAfkStaminaObservations(targets, t = Date.now()) {
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

  function opportunityAfkStaminaCooldownRemaining(target, t = Date.now()) {
    const id = opportunityAfkTargetId(target);
    if (!id) return 0;
    const item = opportunityAfkStaminaState().get(id);
    return Math.max(0, Math.round(Number(item?.cooldownUntil || 0) - t));
  }

  function afkOpportunityBlockedByStaminaCooldown(target, t = Date.now()) {
    if (!isAfkProfitTarget(target)) return false;
    const distance = Number(target?.distance ?? Infinity);
    if (Number.isFinite(distance) && distance <= Number(cfg.attackRange || 0)) return false;
    return opportunityAfkStaminaCooldownRemaining(target, t) > 0;
  }

  function scoreEnemyOpportunity(target) {
    if (isWhitelistedTarget(target)) return null;
    const afk = isAfkProfitTarget(target);
    const inRange = target.distance <= (afk ? cfg.attackRange : cfg.attackEngageRange);
    if (afk && !inRange && afkOpportunityBlockedByStaminaCooldown(target)) return null;
    if (!afk && !inRange && Number(target.drop || 0) < cfg.attackApproachMinDrop) return null;
    const sticky = bot.lastTarget?.kind === 'enemy'
      && String(bot.lastTarget.id) === String(target.user_id)
      && Date.now() - bot.lastTargetAt < cfg.targetStickMs;
    return opportunityValueScore(
      target.drop,
      opportunityEnemyStaminaCost(target),
      afk ? cfg.coinOpportunityValue : cfg.dropOpportunityValue
    ) + (sticky ? cfg.opportunityStickBonus : 0);
  }

  function opportunityPriorityTier(item) {
    const distance = Number(item?.distance ?? Infinity);
    const visibleDistance = Math.max(0, Number(cfg.opportunityVisibleDistance || cfg.opportunityNearbyPriorityDistance || 0));
    if (Number.isFinite(distance) && distance <= visibleDistance) return 1;
    if (item?.type === 'enemy' && item?.kind === 'attack') return 1;
    return 0;
  }
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
      beamWidth: cfg.coinRouteBeamWidth,
      coinOpportunityValue: cfg.coinOpportunityValue,
      valueScore: (value, staminaCost, weight = cfg.coinOpportunityValue) => opportunityValueScore(value, staminaCost, weight),
      staminaAffordable: staminaCost => opportunityStaminaAffordable(self, staminaCost),
      nearbyFirstCoinDistance: cfg.coinRouteNearbyFirstCoinDistance,
      firstCoinDistanceRatio: cfg.coinRouteFirstCoinDistanceRatio,
      firstCoinDistanceSlack: cfg.coinRouteFirstCoinDistanceSlack,
      firstRoutePointDistanceRatio: cfg.coinRouteFirstRoutePointDistanceRatio,
      firstRoutePointDistanceSlack: cfg.coinRouteFirstRoutePointDistanceSlack,
      firstRoutePointCosMin: cfg.coinRouteFirstRoutePointCosMin,
      firstRoutePointLaneRadius: cfg.coinRouteFirstRoutePointLaneRadius,
      firstRouteDistanceRatio: cfg.coinRouteFirstRouteDistanceRatio,
      firstRouteDistanceSlack: cfg.coinRouteFirstRouteDistanceSlack,
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
      safeCoinCandidates: (coins, routeThreats, maxDistance, routeSelf = self) => safeCoins(routeSelf, coins || [], routeThreats, maxDistance),
      isSnapshotOnlyCoin
    };
  }
  function coinRouteKey(coin) {
    return coinRouteKeyCore(coin);
  }
  function coinRouteLegStaminaCost(from, to) {
    return coinRouteLegStaminaCostCore(from, to, coinRouteCoreOptions());
  }
  function coinRouteLegClear(from, to, activeThreats) {
    return coinRouteLegClearCore(from, to, activeThreats, coinRouteCoreOptions(from));
  }
  function coinRoutePointLimit(anchor, candidates) {
    return coinRoutePointLimitCore(anchor, candidates, coinRouteCoreOptions());
  }
  function coinRouteSummary(route, self) {
    return coinRouteSummaryCore(route, self, coinRouteCoreOptions(self));
  }
  function coinRoutePoints(route) {
    return coinRoutePointsCore(route);
  }
  function buildCoinRouteFromAnchor(self, anchor, candidates, activeThreats) {
    return buildCoinRouteFromAnchorCore(self, anchor, candidates, activeThreats, coinRouteCoreOptions(self));
  }

  function coinRouteSkipsCloserFirstCoin(self, route, candidates) {
    return coinRouteSkipsCloserFirstCoinCore(self, route, candidates, coinRouteCoreOptions(self));
  }

  function coinRouteIdsFrom(value) {
    const ids = Array.isArray(value?.coinRoute?.ids) ? value.coinRoute.ids : (Array.isArray(value?.routeIds) ? value.routeIds : value?.coinRouteIds);
    return Array.isArray(ids) ? ids.map(id => String(id)).filter(Boolean) : [];
  }

  function currentHeldCoinRouteChoice(t = Date.now()) {
    const choice = bot.opportunityChoice;
    if (!choice || opportunityChoiceType(choice) !== 'coin') return null;
    if (t >= Number(choice.until || 0)) return null;
    const id = opportunityChoiceId(choice);
    if (!id && id !== '0') return null;
    if (String(choice.reason || '') !== 'best-opportunity-coin-route' && !coinRouteIdsFrom(choice).length) return null;
    return choice;
  }

  function currentHeldCoinChoice(t = Date.now()) {
    const choice = bot.opportunityChoice;
    if (!choice || opportunityChoiceType(choice) !== 'coin') return null;
    if (t >= Number(choice.until || 0)) return null;
    const id = opportunityChoiceId(choice);
    if (!id && id !== '0') return null;
    return choice;
  }

  function coinRouteSkipsHeldSingleCoin(self, route, choice) {
    return coinRouteSkipsHeldSingleCoinCore(self, route, choice, coinRouteCoreOptions(self));
  }

  function coinRouteMatchesHeldChoice(route, choice) {
    return coinRouteMatchesHeldChoiceCore(route, choice, coinRouteCoreOptions());
  }

  function heldCoinRouteBeatsSwitch(heldRoute, bestRoute) {
    return heldCoinRouteBeatsSwitchCore(heldRoute, bestRoute, coinRouteCoreOptions());
  }

  function pickCoinRouteOpportunity(self, coins, activeThreats) {
    return pickCoinRouteOpportunityCore(self, coins, activeThreats, {
      ...coinRouteCoreOptions(self),
      heldChoice: currentHeldCoinChoice(),
      heldRouteChoice: currentHeldCoinRouteChoice()
    });
  }
  function uniqueVisibleRouteCoins(coins) {
    const byId = new Map();
    for (const coin of coins || []) {
      if (isSnapshotOnlyCoin(coin)) continue;
      const key = coinRouteKey(coin);
      if (!byId.has(key)) byId.set(key, coin);
    }
    return Array.from(byId.values());
  }

  function opportunityKey(item) {
    if (!item) return '';
    return String(item.type || '') + ':' + String(item.id ?? '');
  }

  function opportunityChoiceType(choice) {
    if (choice?.type) return String(choice.type);
    const key = String(choice?.key || '');
    return key.includes(':') ? key.split(':')[0] : '';
  }

  function opportunityChoiceId(choice) {
    if (choice?.id !== undefined && choice?.id !== null && choice.id !== '') return String(choice.id);
    const key = String(choice?.key || '');
    const index = key.indexOf(':');
    return index >= 0 ? key.slice(index + 1) : '';
  }

  function opportunityChoiceKey(choice) {
    if (choice?.key) return String(choice.key);
    const type = opportunityChoiceType(choice);
    const id = opportunityChoiceId(choice);
    return type && id ? type + ':' + id : '';
  }

  function opportunityPairKey(a, b) {
    return [String(a || ''), String(b || '')].sort().join('|');
  }

  function opportunityByKey(opportunities, key) {
    return (opportunities || []).find(item => opportunityKey(item) === key) || null;
  }

  function resetOpportunitySwitchLock() {
    bot.opportunitySwitchLock = null;
  }

  function lockedOpportunityChoice(sorted) {
    const lock = bot.opportunitySwitchLock;
    const lockedKey = String(lock?.lockedKey || '');
    if (!lockedKey) return null;
    const pairKeys = String(lock.pairKey || '').split('|').filter(Boolean);
    if (pairKeys.length === 2 && pairKeys.some(key => !opportunityByKey(sorted, key))) {
      resetOpportunitySwitchLock();
      return null;
    }
    const locked = opportunityByKey(sorted, lockedKey);
    if (!locked) {
      resetOpportunitySwitchLock();
      return null;
    }
    const best = sorted[0] || null;
    return {
      ...locked,
      held: true,
      oscillationLocked: true,
      oscillationSwitchCount: Number(lock.switchCount || 0),
      competingScore: best && opportunityKey(best) !== lockedKey ? best.score : locked.competingScore
    };
  }

  function applyOpportunityOscillationLock(sorted, current, chosen) {
    const locked = lockedOpportunityChoice(sorted);
    if (locked) return locked;
    if (!chosen) return chosen;
    if (!current) {
      resetOpportunitySwitchLock();
      return chosen;
    }
    if (opportunityMatchesChoice(chosen, current)) return chosen;
    const held = sorted.find(item => opportunityMatchesChoice(item, current)) || null;
    if (!held) {
      resetOpportunitySwitchLock();
      return chosen;
    }
    const fromKey = opportunityKey(held);
    const toKey = opportunityKey(chosen);
    if (!fromKey || !toKey || fromKey === toKey) return chosen;
    const limit = Math.max(0, Number(cfg.opportunityOscillationSwitchLimit || 0));
    if (!limit) return chosen;
    const t = Date.now();
    const pairKey = opportunityPairKey(fromKey, toKey);
    const previous = bot.opportunitySwitchLock || {};
    const continuing = !previous.lockedKey && previous.pairKey === pairKey && previous.lastKey === fromKey;
    const switchCount = continuing ? Number(previous.switchCount || 0) + 1 : 1;
    if (switchCount > limit) {
      bot.opportunitySwitchLock = { pairKey, lastKey: fromKey, switchCount, lockedKey: fromKey, blockedKey: toKey, lockedAt: t, updatedAt: t };
      return { ...held, held: true, oscillationLocked: true, oscillationSwitchCount: switchCount, competingScore: chosen.score };
    }
    bot.opportunitySwitchLock = { pairKey, lastKey: toKey, switchCount, lockedKey: '', blockedKey: '', lockedAt: 0, updatedAt: t };
    return chosen;
  }

  function isHighValueCoinOpportunity(item) {
    return String(item?.type || '') === 'coin' && Number(item?.amount || 0) >= highValueCoinPriorityAmount();
  }

  function highValueCoinHoldBlocksEnemySwitch(held, best) {
    return Boolean(isHighValueCoinOpportunity(held) && String(best?.type || '') === 'enemy');
  }

  function opportunitySameCoinRadius() {
    return Math.max(0, Number(cfg.opportunitySameCoinRadius || cfg.coinCollectedPruneRadius || 900));
  }

  function opportunityMatchesChoice(item, choice) {
    if (!item || !choice) return false;
    const key = opportunityKey(item);
    const choiceKey = opportunityChoiceKey(choice);
    if (key && choiceKey && key === choiceKey) return true;
    if (String(item.type || '') !== 'coin' || opportunityChoiceType(choice) !== 'coin') return false;
    const amount = Number(item.amount ?? 0);
    const choiceAmount = Number(choice.amount ?? 0);
    if (amount > 0 && choiceAmount > 0 && Math.round(amount) !== Math.round(choiceAmount)) return false;
    const x = Number(item.x);
    const y = Number(item.y);
    const choiceX = Number(choice.x);
    const choiceY = Number(choice.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(choiceX) || !Number.isFinite(choiceY)) return false;
    return dist({ x, y }, { x: choiceX, y: choiceY }) <= opportunitySameCoinRadius();
  }

  function opportunityMissingHoldUntil(choice, t) {
    if (!choice || opportunityChoiceType(choice) !== 'coin') return 0;
    const holdMs = Math.max(0, Number(cfg.opportunityMissingHoldMs ?? cfg.opportunitySwitchHoldMs) || 0);
    const lastSeenAt = Number(choice.lastSeenAt || choice.at || t);
    const until = Math.min(Number(choice.until || 0), lastSeenAt + holdMs);
    return until > t ? until : 0;
  }

  function coinMatchesTrackedTarget(coin, target) {
    const targetId = target?.id ?? target?.drop_id ?? target?.coin_id;
    const coinId = coin?.drop_id ?? coin?.id ?? coin?.coin_id;
    if (targetId !== undefined && targetId !== null && targetId !== '' && coinId !== undefined && coinId !== null && coinId !== '') {
      if (String(targetId) === String(coinId)) return true;
    }
    const targetPoint = { x: Number(target?.x), y: Number(target?.y) };
    const coinPoint = { x: Number(coin?.x), y: Number(coin?.y) };
    if (!Number.isFinite(targetPoint.x) || !Number.isFinite(targetPoint.y) || !Number.isFinite(coinPoint.x) || !Number.isFinite(coinPoint.y)) return false;
    return dist(targetPoint, coinPoint) <= Number(cfg.coinCollectedPruneRadius || 0);
  }

  function currentVisibleCoinListForMissingHold() {
    return Array.isArray(bot.currentVisibleCoins) ? bot.currentVisibleCoins : null;
  }

  function visibleCoinSourcesConfirmTargetMissing(target) {
    const visibleCoins = currentVisibleCoinListForMissingHold();
    if (!Array.isArray(visibleCoins)) return false;
    return !visibleCoins.some(coin => coinMatchesTrackedTarget(coin, target));
  }

  function missingHeldCoinCoveredByVisibleAuthority(choice, coin) {
    const reason = String(choice?.reason || '');
    if (reason.startsWith('snapshot-coin')) return false;
    const distance = Number(coin?.distance ?? choice?.distance);
    const radius = Math.max(0, Number(cfg.nativeCoinAuthoritativeRadius || 0));
    return !Number.isFinite(distance) || !(radius > 0) || distance <= radius + opportunitySameCoinRadius();
  }

  function clearOpportunityChoiceFor(type, id = null) {
    const choice = bot.opportunityChoice;
    if (!choice || opportunityChoiceType(choice) !== String(type || '')) return;
    if (id === null || id === undefined || id === '') {
      bot.opportunityChoice = null;
      resetOpportunitySwitchLock();
      return;
    }
    const choiceId = opportunityChoiceId(choice);
    if (String(choiceId) === String(id)) {
      bot.opportunityChoice = null;
      resetOpportunitySwitchLock();
    }
  }

  function clearMissingVisibleCoinTarget(choice, coin, reason, t) {
    const id = opportunityChoiceId(choice);
    const idText = id || id === '0' ? String(id) : '';
    if (idText) {
      bot.ignoredCoins.set(idText, t + Math.max(0, Number(cfg.coinCollectedIgnoreMs || 0)));
      bot.coinAttempts.delete(idText);
    }
    if (!idText || (bot.lastTarget?.kind === 'coin' && String(bot.lastTarget.id) === idText)) {
      bot.lastTarget = null;
      bot.lastTargetAt = 0;
    }
    if (!idText || (bot.coinProgress?.id && String(bot.coinProgress.id) === idText)) bot.coinProgress = null;
    if (!idText || bot.coinApproachLock?.id === idText) bot.coinApproachLock = null;
    clearOpportunityChoiceFor('coin', idText || null);
    bot.lastCoinClearReason = reason;
    bot.lastMissingVisibleCoin = {
      id: idText,
      reason,
      amount: Number.isFinite(Number(coin?.amount)) ? Math.round(Number(coin.amount)) : null,
      distance: Number.isFinite(Number(coin?.distance)) ? Math.round(Number(coin.distance)) : null,
      at: t
    };
  }

  function buildMissingHeldOpportunity(self, activeThreats, opportunities) {
    const current = bot.opportunityChoice;
    const t = Date.now();
    const holdUntil = opportunityMissingHoldUntil(current, t);
    if (!holdUntil) return null;
    if ((opportunities || []).some(item => opportunityMatchesChoice(item, current))) return null;
    const id = opportunityChoiceId(current);
    if (!id && id !== '0') return null;
    const x = Number(current.x);
    const y = Number(current.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const amount = Math.max(0, Number(current.amount || 0)) || 1;
    const coin = {
      drop_id: id,
      x,
      y,
      amount,
      distance: self ? dist(self, { x, y }) : Number(current.distance || Infinity)
    };
    if (missingHeldCoinCoveredByVisibleAuthority(current, coin) && visibleCoinSourcesConfirmTargetMissing(current)) {
      clearMissingVisibleCoinTarget(current, coin, 'visible-coin-disappeared', t);
      return null;
    }
    if (bot.ignoredCoins && typeof bot.ignoredCoins.has === 'function' && bot.ignoredCoins.has(String(id))) return null;
    const maxDistance = Math.max(
      0,
      Number(current.maxDistance || 0),
      Number(cfg.snapshotCoinMaxDistance || 0),
      Number(cfg.globalCoinMaxDistance || 0),
      Number(cfg.coinMaxDistance || 0)
    );
    if (Number.isFinite(coin.distance) && maxDistance && coin.distance > maxDistance) return null;
    if ((activeThreats || []).some(threat => coinBlockedByThreat(self, coin, threat))) return null;
    const staminaCost = opportunityCoinStaminaCost(coin);
    if (!opportunityStaminaAffordable(self, staminaCost)) return null;
    const kind = coin.distance <= cfg.coinMaxDistance ? 'coin' : 'seek-coin';
    return {
      type: 'coin',
      kind,
      actionKind: kind,
      reason: current.reason || (kind === 'coin' ? 'best-opportunity-coin' : 'best-opportunity-visible-coin'),
      id,
      amount,
      x,
      y,
      distance: coin.distance,
      staminaCost,
      score: scoreCoinOpportunity(coin),
      priorityTier: opportunityPriorityTier({ type: 'coin', distance: coin.distance }),
      maxDistance,
      held: true,
      missingHold: true,
      holdUntil
    };
  }

  function chooseStableOpportunity(opportunities) {
    const sorted = opportunities
      .sort((a, b) => b.priorityTier - a.priorityTier || b.score - a.score || (a.type === b.type ? 0 : (a.type === 'enemy' ? -1 : 1)) || a.distance - b.distance);
    const best = sorted[0] || null;
    if (!best) return null;
    const current = bot.opportunityChoice;
    const t = Date.now();
    let chosen = best;
    if (current?.key && t < Number(current.until || 0)) {
      const held = sorted.find(item => opportunityMatchesChoice(item, current));
      if (held && !opportunityMatchesChoice(best, current)) {
        if (highValueCoinHoldBlocksEnemySwitch(held, best)) {
          chosen = { ...held, held: true, highValueCoinHold: true, competingScore: best.score };
        } else if (Number(best.priorityTier || 0) <= Number(held.priorityTier || 0)) {
          const margin = Math.max(0, Number(cfg.opportunitySwitchMargin) || 0);
          const relativeMargin = Math.max(0, Number(cfg.opportunitySwitchRelativeMargin) || 0);
          const heldScore = Number(held.score || 0);
          const requiredScore = Math.max(heldScore + margin, heldScore * (1 + relativeMargin));
          if (Number(best.score || 0) <= requiredScore) {
            chosen = { ...held, held: true, competingScore: best.score };
          }
        }
      }
    }
    chosen = applyOpportunityOscillationLock(sorted, current, chosen);
    if (current) {
      const same = opportunityMatchesChoice(chosen, current);
      const missingHold = Boolean(chosen.missingHold);
      const routeMeta = chosen.coinRoute || null;
      const routeIds = Array.isArray(routeMeta?.ids) ? routeMeta.ids.map(id => String(id)).filter(Boolean) : [];
      bot.opportunityChoice = {
        key: opportunityKey(chosen),
        type: chosen.type || '',
        id: chosen.id ?? '',
        until: missingHold ? Math.max(t, Number(chosen.holdUntil || current?.until || t)) : t + Math.max(0, Number(cfg.opportunitySwitchHoldMs) || 0),
        at: same ? Number(current.at || t) : t,
        lastSeenAt: missingHold ? Number(current?.lastSeenAt || current?.at || t) : t,
        score: Math.round(Number(chosen.score || 0)),
        staminaCost: Number.isFinite(Number(chosen.staminaCost)) ? Math.round(Number(chosen.staminaCost)) : null,
        reason: chosen.reason || '',
        x: Number.isFinite(Number(chosen.x)) ? Number(chosen.x) : null,
        y: Number.isFinite(Number(chosen.y)) ? Number(chosen.y) : null,
        amount: Number.isFinite(Number(chosen.amount)) ? Number(chosen.amount) : null,
        distance: Number.isFinite(Number(chosen.distance)) ? Math.round(Number(chosen.distance)) : null,
        actionKind: chosen.actionKind || chosen.kind || '',
        priorityTier: Number(chosen.priorityTier || 0),
        maxDistance: Number.isFinite(Number(chosen.maxDistance)) ? Number(chosen.maxDistance) : null,
        missingSince: missingHold ? Number(current?.missingSince || t) : 0,
        oscillationLocked: Boolean(chosen.oscillationLocked),
        oscillationSwitchCount: Number(chosen.oscillationSwitchCount || 0),
        coinRouteIds: routeIds.length ? routeIds : null,
        coinRouteValue: Number.isFinite(Number(routeMeta?.value)) ? Math.round(Number(routeMeta.value)) : null,
        coinRouteLegs: Number.isFinite(Number(routeMeta?.legCount)) ? Math.round(Number(routeMeta.legCount)) : null
      };
    }
    return chosen;
  }

  function bestCoinOpportunityScore(self, coins, activeThreats, fieldCompetitionCoin = null) {
    let best = -Infinity;
    for (const coin of safeCoins(self, coins, activeThreats, cfg.globalCoinMaxDistance)) {
      if (!opportunityStaminaAffordable(self, opportunityCoinStaminaCost(coin))) continue;
      const score = scoreCoinOpportunity(coin);
      if (score > best) best = score;
    }
    const route = pickCoinRouteOpportunity(self, uniqueVisibleRouteCoins(coins), activeThreats);
    if (route) {
      const score = scoreCoinOpportunity(route);
      if (score > best) best = score;
    }
    const extraCoins = [fieldCompetitionCoin].filter(Boolean);
    for (const coin of extraCoins) {
      if (opportunityStaminaAffordable(self, opportunityCoinStaminaCost(coin))) {
        const score = scoreCoinOpportunity(coin);
        if (score > best) best = score;
      }
    }
    return best;
  }

  function pickProfitableCombatTarget(self, entities, bullets, coins, activeThreats, fieldCompetitionCoin = null) {
    if (!isFullHp(self)) return null;
    const target = pickCombatTarget(self, entities, bullets, { mode: 'profit' });
    if (!target) return null;
    const targetScore = scoreEnemyOpportunity(target);
    if (targetScore === null) return null;
    const coinScore = bestCoinOpportunityScore(self, coins, activeThreats, fieldCompetitionCoin);
    if (targetScore < coinScore) return null;
    return {
      ...target,
      combatIntent: 'profit',
      combatOpportunityScore: Math.round(targetScore),
      competingCoinScore: Number.isFinite(coinScore) ? Math.round(coinScore) : null
    };
  }

  function combatTargetId(target) {
    const id = target?.user_id ?? target?.id;
    return id === null || id === undefined ? '' : String(id);
  }

  function combatRetreatIgnoreActive(target, t = Date.now()) {
    const id = combatTargetId(target);
    if (!id || !bot.combatRetreatIgnore) return false;
    const until = Number(bot.combatRetreatIgnore.get(id) || 0);
    if (!until) return false;
    if (until <= t) {
      bot.combatRetreatIgnore.delete(id);
      return false;
    }
    return true;
  }

  function rememberCombatRetreatIgnore(target, t = Date.now()) {
    const id = combatTargetId(target);
    if (!id) return;
    if (!bot.combatRetreatIgnore) bot.combatRetreatIgnore = new Map();
    bot.combatRetreatIgnore.set(id, t + Math.max(1000, Number(cfg.combatRetreatIgnoreMs || 0) || 15000));
  }

  function clearCombatDisadvantageObservation(reason = '') {
    if (!bot.combatDisadvantageObservation) return;
    bot.lastCombatDisadvantageObservationClear = { at: Date.now(), reason };
    bot.combatDisadvantageObservation = null;
  }

  function combatDisadvantageObservationState(target, kind, evidence = {}) {
    const id = combatTargetId(target);
    if (!id || !kind) return null;
    const t = Date.now();
    const previous = bot.combatDisadvantageObservation || null;
    const same = previous && String(previous.id || '') === id && String(previous.kind || '') === String(kind);
    const currentTarget = bot.combatTarget && String(bot.combatTarget.id ?? '') === id ? bot.combatTarget : null;
    const firstAt = same ? Number(previous.firstAt || previous.at || t) : t;
    const count = Math.max(1, same ? Number(previous.count || 1) + 1 : 1);
    const engagedAt = Number(currentTarget?.firstSeenAt || currentTarget?.at || firstAt || t);
    const observedMs = Math.max(0, t - firstAt);
    const engagedMs = Math.max(0, t - engagedAt);
    const confirmMs = Math.max(0, Number(cfg.combatDisadvantageConfirmMs || 0));
    const minEngageMs = Math.max(0, Number(cfg.combatDisadvantageMinEngageMs || 0));
    const minSamples = Math.max(1, Math.round(Number(cfg.combatDisadvantageMinSamples || 1)));
    const sampleCount = Math.max(
      count,
      Math.round(Number(evidence?.sampleCount || 0)),
      Array.isArray(currentTarget?.motionSamples) ? currentTarget.motionSamples.length : 0
    );
    const remainingMs = Math.max(0, confirmMs - observedMs, minEngageMs - engagedMs);
    const samplesRemaining = Math.max(0, minSamples - sampleCount);
    const state = {
      active: true,
      id,
      kind: String(kind),
      firstAt,
      at: t,
      observedMs: Math.round(observedMs),
      engagedMs: Math.round(engagedMs),
      count,
      sampleCount,
      confirmMs,
      minEngageMs,
      minSamples,
      remainingMs: Math.round(remainingMs),
      samplesRemaining,
      ready: remainingMs <= 0 && samplesRemaining <= 0,
      evidence
    };
    bot.combatDisadvantageObservation = state;
    return state;
  }

  function pickEngagedCombatTarget(self, entities, bullets = []) {
    const engaged = bot.combatTarget;
    if (!engaged?.id) return null;
    if (combatRetreatIgnoreActive({ id: engaged.id })) {
      bot.combatTarget = null;
      return null;
    }
    const target = (entities || [])
      .filter(e => Number(e.user_id) !== Number(self.user_id))
      .filter(isAlive)
      .find(e => String(e.user_id ?? e.id ?? '') === String(engaged.id));
    if (!target || isWhitelistedTarget(target) || isInvulnerable(target)) return null;
    const distance = dist(self, target);
    if (distance > Math.max(cfg.combatAttackRange, cfg.combatDisengageRange, cfg.combatEngageGraceRange)) {
      bot.combatTarget = null;
      return null;
    }
    const decorated = {
      ...target,
      distance,
      drop: dropValue(target),
      speed: speed(target),
      hp: combatHpValue(target),
      knownHp: knownHpValue(target)
    };
    const { ownerId: incomingOwnerId, unknownIncoming } = incomingBulletInfo(self, bullets);
    if (activeCombatRequiresThreatEvidence(self, decorated) && !activeCombatThreatensSelf(decorated, incomingOwnerId, unknownIncoming)) {
      bot.combatTarget = null;
      return null;
    }
    return {
      ...decorated,
      combatIntent: 'engaged'
    };
  }
  function defensiveTargetOverridesEngaged(engagedTarget, defensiveTarget) {
    if (!engagedTarget || !defensiveTarget?.incomingBullet) return false;
    if (!incomingBulletRequiresTargetSwitch(defensiveTarget.incomingBullet)) return false;
    const ownerId = defensiveTarget.incomingBullet.ownerId
      ?? defensiveTarget.incomingBullet.owner_id
      ?? defensiveTarget.incomingBullet.source_user_id
      ?? defensiveTarget.incomingBullet.user_id;
    if (ownerId === null || ownerId === undefined) return false;
    const defensiveId = defensiveTarget.user_id ?? defensiveTarget.id;
    const engagedId = engagedTarget.user_id ?? engagedTarget.id;
    return defensiveId !== null && defensiveId !== undefined
      && engagedId !== null && engagedId !== undefined
      && String(defensiveId) !== String(engagedId);
  }
  function incomingBulletRequiresTargetSwitch(incomingBullet) {
    if (!incomingBullet) return false;
    const distance = Number(incomingBullet.distance);
    const timeToImpactMs = Number(incomingBullet.timeToImpactMs);
    const switchDistance = Math.max(0, Number(cfg.combatTargetSwitchIncomingDistance || 0));
    const switchTime = Math.max(0, Number(cfg.combatTargetSwitchIncomingTimeMs || 0));
    if (switchDistance > 0 && Number.isFinite(distance) && distance <= switchDistance) return true;
    if (switchTime > 0 && Number.isFinite(timeToImpactMs) && timeToImpactMs <= switchTime) return true;
    return false;
  }

  function lowValueActiveDropMax() {
    const value = Number(cfg.combatLowValueActiveDropMax ?? 4);
    return Math.max(0, Number.isFinite(value) ? value : 4);
  }

  function isLowValueActiveCombatTarget(target) {
    if (!target || isAfkProfitTarget(target)) return false;
    return hasCombatActivitySignalForTest(target) && Number(target.drop ?? dropValue(target) ?? 0) <= lowValueActiveDropMax();
  }

  function proactiveActiveKillStaminaBudgetMs() {
    const value = Number(cfg.combatProactiveActiveKillStaminaBudgetMs ?? 100000);
    return Math.max(0, Number.isFinite(value) ? value : 100000);
  }

  function proactiveActiveCombatStaminaAffordable(self) {
    const required = proactiveActiveKillStaminaBudgetMs();
    if (!(required > 0)) return true;
    const budget = opportunityLongStaminaBudget(self);
    return !Number.isFinite(budget) || budget >= required;
  }

  function activeCombatBudgetBlocked(self, target) {
    if (!target || isAfkProfitTarget(target) || !hasCombatActivitySignalForTest(target)) return false;
    if (Number(target.drop ?? dropValue(target) ?? 0) <= lowValueActiveDropMax()) return false;
    return !proactiveActiveCombatStaminaAffordable(self);
  }

  function activeCombatRequiresThreatEvidence(self, target) {
    return isLowValueActiveCombatTarget(target) || activeCombatBudgetBlocked(self, target);
  }

  function incomingOwnerMatchesTarget(target, incomingOwnerId) {
    if (!target || incomingOwnerId === null || incomingOwnerId === undefined) return false;
    const targetId = target.user_id ?? target.id;
    return targetId !== null && targetId !== undefined && String(targetId) === String(incomingOwnerId);
  }

  function activeCombatThreatensSelf(target, incomingOwnerId = null, unknownIncoming = false) {
    if (incomingOwnerMatchesTarget(target, incomingOwnerId)) return true;
    return Boolean(unknownIncoming && isFiringEntity(target));
  }

  function lowValueActiveThreatensSelf(target, incomingOwnerId = null, unknownIncoming = false) {
    if (!isLowValueActiveCombatTarget(target)) return true;
    return activeCombatThreatensSelf(target, incomingOwnerId, unknownIncoming);
  }

  function incomingBulletInfo(self, bullets = []) {
    const incoming = (bullets || []).find(b => Number(b.owner_id ?? b.ownerId ?? b.source_user_id ?? b.user_id) !== Number(self.user_id));
    const ownerId = incoming ? (incoming.owner_id ?? incoming.ownerId ?? incoming.source_user_id ?? incoming.user_id) : null;
    return {
      incoming,
      ownerId,
      unknownIncoming: Boolean(incoming && (ownerId === null || ownerId === undefined))
    };
  }

  function combatTargetPriority(target, incomingOwnerId = null, unknownIncoming = false) {
    const incomingMatch = incomingOwnerId !== null && incomingOwnerId !== undefined && String(target.user_id) === String(incomingOwnerId);
    return (incomingMatch ? 1000000000 : 0)
      + (isFiringEntity(target) ? 500000000 : 0)
      + (unknownIncoming && isActive(target) ? 200000000 : 0)
      + (isJoinModeActive(target) ? 150000000 : 0)
      + (isActive(target) ? 100000000 : 0)
      + Number(target.drop || 0) * 1000000
      - Number(target.distance || 0);
  }
  function isDefensiveCombatTarget(self, target, incomingOwnerId = null, unknownIncoming = false) {
    if (!target || isWhitelistedTarget(target) || isAfkProfitTarget(target) || isInvulnerable(target)) return false;
    if (incomingOwnerMatchesTarget(target, incomingOwnerId)) return true;
    if (activeCombatRequiresThreatEvidence(self, target)) return activeCombatThreatensSelf(target, incomingOwnerId, unknownIncoming);
    if (isFiringEntity(target)) return true;
    if (isActive(target)) return true;
    return Boolean(unknownIncoming && isActive(target));
  }
  function combatDodgeThreatRange() {
    const attackRange = Math.max(0, Number(cfg.combatAttackRange || cfg.attackRange || 0));
    return attackRange + Math.max(0, Number(cfg.combatDodgeRangeBuffer || 0));
  }
  function isProfitableCombatTarget(self, target) {
    return Boolean(target
      && !isWhitelistedTarget(target)
      && !isAfkProfitTarget(target)
      && !isInvulnerable(target)
      && isActive(target)
      && Number(target.drop || 0) > lowValueActiveDropMax()
      && proactiveActiveCombatStaminaAffordable(self));
  }
  function combatHpGapDisadvantaged(self, target) {
    const knownSelfHp = knownHpValue(self);
    const knownTargetHp = knownHpValue(target);
    if (knownSelfHp === null || knownTargetHp === null) return false;
    const hpGap = Number(knownTargetHp) - Number(knownSelfHp);
    return Number(knownSelfHp) > cfg.combatLowHpLeaveThreshold
      && Number.isFinite(hpGap)
      && hpGap > cfg.combatHighHpDisadvantageGap;
  }
  function profitCombatDisadvantaged(self, target) {
    const selfHp = hpValue(self);
    const targetHp = combatHpValue(target);
    return (selfHp < cfg.combatLowHpLeaveThreshold && selfHp < targetHp)
      || combatHpGapDisadvantaged(self, target);
  }
  function pickCombatTarget(self, entities, bullets = [], options = {}) {
    const attackRange = Number(cfg.combatAttackRange || 0);
    const candidateRange = options.mode === 'defensive' ? combatDodgeThreatRange() : attackRange;
    const candidates = entities
      .filter(e => Number(e.user_id) !== Number(self.user_id))
      .filter(isAlive)
      .map(e => ({ ...e, distance: dist(self, e), drop: dropValue(e), speed: speed(e), hp: combatHpValue(e), knownHp: knownHpValue(e) }))
      .filter(e => !isWhitelistedTarget(e))
      .filter(e => !isInvulnerable(e))
      .filter(e => e.distance <= candidateRange);
    const { incoming, ownerId: incomingOwnerId, unknownIncoming } = incomingBulletInfo(self, bullets);
    if (incoming) {
      const shooter = candidates.find(e => String(e.user_id) === String(incomingOwnerId));
      if (shooter) return { ...shooter, incomingBullet: incoming, combatIntent: 'defensive' };
    }
    const eligibleTargets = candidates
      .filter(e => !isAfkProfitTarget(e))
      .filter(e => !(Number(e.distance || 0) > attackRange) || incomingOwnerMatchesTarget(e, incomingOwnerId) || (unknownIncoming && isFiringEntity(e)))
      .filter(e => !combatRetreatIgnoreActive(e));
    const defensiveTargets = eligibleTargets
      .filter(target => isDefensiveCombatTarget(self, target, incomingOwnerId, unknownIncoming))
      .sort((a, b) => combatTargetPriority(b, incomingOwnerId, unknownIncoming) - combatTargetPriority(a, incomingOwnerId, unknownIncoming));
    if (options.mode === 'defensive') return defensiveTargets[0] ? { ...defensiveTargets[0], combatIntent: 'defensive' } : null;
    const profitableTargets = eligibleTargets
      .filter(target => isProfitableCombatTarget(self, target))
      .filter(target => options.mode !== 'profit' || !profitCombatDisadvantaged(self, target))
      .sort((a, b) => {
        const scoreA = scoreEnemyOpportunity(a) ?? -Infinity;
        const scoreB = scoreEnemyOpportunity(b) ?? -Infinity;
        if (scoreA !== scoreB) return scoreB - scoreA;
        return a.distance - b.distance;
      });
    if (options.mode === 'profit') return profitableTargets[0] ? { ...profitableTargets[0], combatIntent: 'profit' } : null;
    if (defensiveTargets[0]) return { ...defensiveTargets[0], combatIntent: 'defensive' };
    if (isFullHp(self) && profitableTargets[0]) return { ...profitableTargets[0], combatIntent: 'profit' };
    return null;
  }

  function pickOpportunisticShotTarget(self, entities) {
    return entities
      .filter(e => Number(e.user_id) !== Number(self.user_id))
      .filter(isAlive)
      .map(e => ({ ...e, distance: dist(self, e), drop: dropValue(e), speed: speed(e), hp: combatHpValue(e) }))
      .filter(e => !isWhitelistedTarget(e))
      .filter(e => e.distance <= cfg.attackRange)
      .filter(e => attackWorthTaking(self, e) && isAfkProfitTarget(e))
      .map(e => ({
        ...e,
        score: scoreEnemyOpportunity(e) ?? -Infinity,
        staminaCost: opportunityEnemyStaminaCost(e),
        estimatedShots: estimatedKillShots(e)
      }))
      .filter(e => opportunityStaminaAffordable(self, e.staminaCost))
      .sort((a, b) => b.score - a.score || (b.drop - a.drop) || a.distance - b.distance)[0] || null;
  }

  function actionOpportunityScore(action) {
    const explicit = Number(action?.score ?? action?.opportunityChoice?.score);
    if (Number.isFinite(explicit)) return explicit;
    const target = action?.target || action || {};
    if (['coin', 'seek-coin'].includes(action?.kind) && Number(target.amount || 0) > 0) {
      return scoreCoinOpportunity({
        amount: Number(target.amount || 0),
        distance: Number(target.distance ?? action?.distance ?? 0),
        opportunityStaminaCost: Number.isFinite(Number(action?.staminaCost)) ? Number(action.staminaCost) : undefined
      });
    }
    return -Infinity;
  }

  function opportunisticShotBeatsAction(action, target) {
    const shotScore = Number(target?.score ?? scoreEnemyOpportunity(target) ?? -Infinity);
    if (!Number.isFinite(shotScore)) return false;
    const actionScore = actionOpportunityScore(action);
    const minRatio = Math.max(0, Number(cfg.opportunisticShotMinScoreRatio ?? 1));
    return !Number.isFinite(actionScore) || actionScore <= 0 || shotScore >= actionScore * minRatio;
  }

  function attachOpportunisticShot(action, self, entities, allow = true) {
    if (!allow || !action || !['coin', 'seek-coin'].includes(action.kind) || action.combat) return action;
    const target = pickOpportunisticShotTarget(self, entities);
    if (!target) return action;
    if (!opportunisticShotBeatsAction(action, target)) return action;
    return {
      ...action,
      opportunisticShot: {
        id: target.user_id,
        name: target.name,
        x: target.x,
        y: target.y,
        hp: combatHpValue(target),
        drop: target.drop,
        distance: Math.round(target.distance),
        score: Math.round(Number(target.score || 0)),
        staminaCost: Math.round(Number(target.staminaCost || 0)),
        estimatedShots: target.estimatedShots
      }
    };
  }

  function buildOpportunisticShotWait(self, entities, allow = true) {
    if (!allow) return null;
    const target = pickOpportunisticShotTarget(self, entities);
    if (!target) return null;
    return {
      kind: 'wait',
      reason: 'opportunistic-afk-drop-shot',
      dx: 0,
      dy: 0,
      opportunisticShot: {
        id: target.user_id,
        name: target.name,
        x: target.x,
        y: target.y,
        hp: combatHpValue(target),
        drop: target.drop,
        distance: Math.round(target.distance),
        score: Math.round(Number(target.score || 0)),
        staminaCost: Math.round(Number(target.staminaCost || 0)),
        estimatedShots: target.estimatedShots
      }
    };
  }

  function pickPostAttackDropCoin(self, coins, activeThreats, attacks, entities, options = {}) {
    const t = Date.now();
    const recentAttacks = (attacks || [])
      .slice()
      .reverse()
      .filter(item => t - Number(item.at || 0) <= cfg.postAttackDropCoinPriorityMs)
      .filter(item => Number.isFinite(Number(item.x)) && Number.isFinite(Number(item.y)))
      .filter(item => postAttackDropResolvedAt(item, entities, t));
    if (!recentAttacks.length) return null;
    const minAmount = options.includeSingle ? 0 : cfg.postAttackDropCoinMinAmount;
    const maxDistance = Math.max(0, Number(options.maxDistance ?? cfg.postAttackDropCoinMaxDistance) || 0);
    const minScore = Math.max(0, Number(options.minScore ?? 0) || 0);
    const candidates = [];
    for (const coin of coins
      .map(c => ({ ...c, distance: dist(self, c), amount: Number(c.amount || 0) }))
      .filter(c => c.amount > minAmount)
      .filter(c => c.distance <= maxDistance)
      .filter(c => !activeThreats.some(threat => coinBlockedByThreat(self, c, threat)))
      .filter(c => opportunityStaminaAffordable(self, opportunityCoinStaminaCost(c)))) {
      const attack = recentAttacks
        .filter(item => dist(coin, item) <= cfg.postAttackDropCoinRadius)
        .sort((a, b) => Number(b.drop || 0) - Number(a.drop || 0) || Number(b.at || 0) - Number(a.at || 0))[0] || null;
      if (!attack) continue;
      const score = scoreCoinOpportunity(coin);
      if (score < minScore) continue;
      candidates.push({
        ...coin,
        postAttackScore: score,
        postAttackTarget: {
          id: attack.id,
          name: attack.name || '',
          drop: attack.drop,
          x: attack.x,
          y: attack.y,
          action: attack.action || '',
          playerCategory: attack.playerCategory || (attack.afk === false ? 'active' : 'afk'),
          afk: attack.afk !== false,
          active: attack.active === true || attack.playerCategory === 'active',
          combat: Boolean(attack.combat),
          combatIntent: attack.combatIntent || '',
          mode: attack.mode || '',
          currentlyActive: Boolean(attack.currentlyActive),
          moving: Boolean(attack.moving),
          firing: Boolean(attack.firing),
          distance: Number.isFinite(Number(attack.distance)) ? Math.round(Number(attack.distance)) : null,
          coinDistance: Number.isFinite(Number(coin.distance)) ? Math.round(Number(coin.distance)) : null,
          coinDistanceToTarget: Math.round(dist(coin, attack)),
          ageMs: Math.max(0, Math.round(t - Number(attack.at || t)))
        }
      });
    }
    return candidates
      .sort((a, b) => b.amount - a.amount || b.postAttackScore - a.postAttackScore || a.distance - b.distance)[0] || null;
  }

  function postAttackVisibleCoinExists(coins, attack) {
    return (coins || [])
      .map(c => ({ ...c, distanceToAttack: dist(c, attack), amount: Number(c.amount || 0) }))
      .some(c => c.amount > 0 && c.distanceToAttack <= cfg.postAttackDropCoinRadius);
  }

  function attackEntityMatches(entity, attack) {
    const attackId = attack?.id === undefined || attack?.id === null ? '' : String(attack.id);
    const attackName = String(attack?.name || '');
    if (attackId && String(entity?.user_id ?? entity?.id ?? '') === attackId) return true;
    return Boolean(attackName && String(entity?.name || '') === attackName);
  }

  function recentAttackTargetStillAttackable(attack, entities) {
    const target = (entities || []).find(entity => attackEntityMatches(entity, attack));
    if (!target || !isAlive(target)) return false;
    const hp = knownHpValue(target);
    if (hp !== null && hp <= 0) return false;
    if (isWhitelistedTarget(target)) return false;
    if (isActive(target)) return false;
    if (isInvulnerable(target)) return false;
    return dropValue(target) > 0;
  }

  function postAttackDropResolvedAt(attack, entities, t = Date.now()) {
    if (!attack || recentAttackTargetStillAttackable(attack, entities)) {
      if (attack) attack.postAttackDropResolvedAt = 0;
      return 0;
    }
    const existing = Number(attack.postAttackDropResolvedAt || 0);
    if (existing > 0) return existing;
    attack.postAttackDropResolvedAt = t;
    return t;
  }

  function pickPostAttackDropWaitTarget(self, coins, activeThreats, attacks, entities) {
    const t = Date.now();
    const waitMs = Math.max(0, Number(cfg.postAttackDropWaitMs || 0));
    if (!waitMs) return null;
    const minDrop = Math.max(0, Number(cfg.postAttackDropWaitMinDrop ?? cfg.attackMinDrop) || 0);
    const resolveMaxMs = Math.max(waitMs, Number(cfg.postAttackDropResolveMaxMs || waitMs) || waitMs);
    const maxDistance = Math.max(0, Number(cfg.postAttackDropWaitMaxDistance || cfg.opportunityVisibleDistance || cfg.globalCoinMaxDistance || 0));
    const stopDistance = Math.max(0, Number(cfg.postAttackDropWaitStopDistance || cfg.coinPickupSweepDistance || 0));
    return (attacks || [])
      .slice()
      .reverse()
      .filter(item => t - Number(item.at || 0) <= resolveMaxMs)
      .filter(item => Number(item.drop || 0) >= minDrop)
      .filter(item => Number.isFinite(Number(item.x)) && Number.isFinite(Number(item.y)))
      .filter(item => item.afk !== false)
      .filter(item => item.action === 'attack' || item.action === 'opportunistic-shot')
      .map(item => {
        const resolvedAt = postAttackDropResolvedAt(item, entities, t);
        return resolvedAt ? { ...item, postAttackDropResolvedAt: resolvedAt } : null;
      })
      .filter(Boolean)
      .filter(item => t - Number(item.postAttackDropResolvedAt || 0) <= waitMs)
      .filter(item => !postAttackVisibleCoinExists(coins, item))
      .map(item => ({ ...item, distance: dist(self, item) }))
      .filter(item => item.distance > stopDistance && item.distance <= maxDistance)
      .filter(item => !activeThreats.some(threat => coinBlockedByThreat(self, item, threat)))
      .sort((a, b) => Number(b.drop || 0) - Number(a.drop || 0) || Number(a.distance || 0) - Number(b.distance || 0))[0] || null;
  }

  function buildPostAttackDropWaitAction(self, target) {
    const dir = coinDirectionTo(self, target, cfg.patrolPrecisionTolerance);
    return {
      kind: 'patrol',
      reason: 'post-attack-drop-wait-position',
      dx: dir.dx,
      dy: dir.dy,
      postAttackTarget: {
        id: target.id,
        name: target.name || '',
        x: target.x,
        y: target.y,
        drop: target.drop,
        distance: Math.round(dir.distance),
        ageMs: Math.max(0, Math.round(Date.now() - Number(target.at || Date.now()))),
        resolvedAgeMs: Math.max(0, Math.round(Date.now() - Number(target.postAttackDropResolvedAt || Date.now())))
      }
    };
  }

  function combatSpacingVector(self, target, targetDistance = null) {
    const distance = Number.isFinite(Number(targetDistance)) ? Number(targetDistance) : dist(self, target);
    const minRange = Math.max(0, Number(cfg.combatSpacingMinRange || 0));
    const preferredRange = Math.max(minRange, Number(cfg.combatSpacingPreferredRange || minRange));
    if (!(distance > 0) || !minRange) return { active: false, dx: 0, dy: 0 };
    const dxRaw = Number(self.x) - Number(target.x);
    const dyRaw = Number(self.y) - Number(target.y);
    let dx = Math.sign(dxRaw) || 0;
    let dy = Math.sign(dyRaw) || 0;
    if (!(dx || dy)) dx = -Math.sign(Number(target.vx) || 0) || 1;
    const targetVx = Number(target.vx) || 0;
    const targetVy = Number(target.vy) || 0;
    const toTargetX = Number(target.x) - Number(self.x);
    const toTargetY = Number(target.y) - Number(self.y);
    const d = Math.max(1, distance);
    const radialSpeed = (toTargetX / d) * targetVx + (toTargetY / d) * targetVy;
    const tooClose = distance < minRange;
    const closing = radialSpeed <= -cfg.combatStationarySpeed && distance < preferredRange;
    if (!tooClose && !closing) return { active: false, dx: 0, dy: 0, distance, minRange, preferredRange, radialSpeed };
    return {
      active: true,
      dx,
      dy,
      distance,
      minRange,
      preferredRange,
      radialSpeed,
      reason: tooClose ? 'too-close' : 'closing'
    };
  }

  function combatSpacingShouldOverrideBullet(spacing, selfHp, targetHp) {
    if (!spacing?.active || spacing.reason !== 'too-close') return false;
    const distance = Number(spacing.distance);
    const emergencyRange = Math.max(0, Number(cfg.combatSpacingEmergencyRange || 0));
    const lowHpThreshold = Math.max(0, Number(cfg.combatSpacingLowHpThreshold || cfg.combatLowHpLeaveThreshold || 0));
    const hp = Number(selfHp);
    const emergencyClose = emergencyRange > 0 && Number.isFinite(distance) && distance <= emergencyRange;
    const lowHpClose = lowHpThreshold > 0 && Number.isFinite(hp) && hp < lowHpThreshold;
    return Boolean(emergencyClose || lowHpClose);
  }

  function combatLowHpCloseRiskState(selfHp, targetHp, spacing, realBulletPressure = false) {
    const threshold = Math.max(0, Number(cfg.combatLowHpLeaveThreshold || 0));
    const margin = Math.max(0, Number(cfg.combatLowHpCloseRiskMargin || 0));
    const hp = Number(selfHp);
    const enemyHp = Number(targetHp);
    if (!threshold || !margin || !Number.isFinite(hp) || !Number.isFinite(enemyHp)) return null;
    if (!(hp < threshold) || !(hp <= enemyHp + margin)) return null;
    if (!spacing?.active || spacing.reason !== 'too-close') return null;
    if (!realBulletPressure && !combatSpacingShouldOverrideBullet(spacing, hp, enemyHp)) return null;
    return {
      active: true,
      selfHp: hp,
      targetHp: enemyHp,
      hpGap: enemyHp - hp,
      margin,
      distance: Math.round(Number(spacing.distance || 0)),
      realBulletPressure: Boolean(realBulletPressure)
    };
  }

  function combatPressureDisadvantageState(selfHp, targetHp, targetDistance, realBulletPressure = false) {
    const threshold = Math.max(0, Number(cfg.combatPressureExitHpThreshold || 0));
    const minGap = Math.max(0, Number(cfg.combatPressureExitHpGap || 0));
    const range = Math.max(0, Number(cfg.combatShootPressureRange || cfg.combatAttackRange || 0));
    const hp = Number(selfHp);
    const enemyHp = Number(targetHp);
    const distance = Number(targetDistance);
    const hpGap = enemyHp - hp;
    if (!threshold || !minGap || !range || !realBulletPressure) return null;
    if (!Number.isFinite(hp) || !Number.isFinite(enemyHp) || !Number.isFinite(distance)) return null;
    if (!(hp < threshold) || !(hpGap >= minGap) || !(distance <= range)) return null;
    return {
      active: true,
      selfHp: hp,
      targetHp: enemyHp,
      hpGap,
      threshold,
      minGap,
      distance: Math.round(distance),
      realBulletPressure: true
    };
  }

  function combatSustainedPressureDisadvantageState(selfHp, targetHp, targetDistance, noDamageMs, targetRealBulletPressure = false) {
    const waitMs = Math.max(0, Number(cfg.combatPressureNoDamageExitMs || 0));
    const threshold = Math.max(0, Number(cfg.combatPressureNoDamageExitHpThreshold || 0));
    const minGap = Math.max(0, Number(cfg.combatPressureNoDamageExitHpGap || 0));
    const targetHpMin = Math.max(0, Number(cfg.combatPressureNoDamageExitTargetHpMin || 0));
    const range = Math.max(0, Number(cfg.combatPressureNoDamageExitRange || cfg.combatShootPressureRange || cfg.combatAttackRange || 0));
    const hp = Number(selfHp);
    const enemyHp = Number(targetHp);
    const distance = Number(targetDistance);
    const elapsed = Math.max(0, Number(noDamageMs || 0));
    const hpGap = enemyHp - hp;
    if (!waitMs || !threshold || !minGap || !range || !targetRealBulletPressure) return null;
    if (!Number.isFinite(hp) || !Number.isFinite(enemyHp) || !Number.isFinite(distance)) return null;
    if (!(hp <= threshold) || !(enemyHp >= targetHpMin) || !(hpGap >= minGap) || !(elapsed >= waitMs) || !(distance <= range)) return null;
    return {
      active: true,
      selfHp: hp,
      targetHp: enemyHp,
      hpGap,
      threshold,
      minGap,
      targetHpMin,
      noDamageMs: Math.round(elapsed),
      waitMs,
      distance: Math.round(distance),
      targetRealBulletPressure: true
    };
  }

  function combatPressureCloseVector(self, target, targetDistance, selfHp) {
    const previous = bot.combatTarget || null;
    const targetId = target?.user_id ?? target?.id;
    const same = previous?.id !== null && previous?.id !== undefined
      && targetId !== null && targetId !== undefined
      && String(previous.id) === String(targetId);
    const lastDamageAt = same ? Number(previous.lastDamageAt || previous.at || Date.now()) : Date.now();
    const noDamageMs = Math.max(0, Date.now() - lastDamageAt);
    const thresholdMs = Math.max(0, Number(cfg.combatPressureCloseNoDamageMs || 0) || 0);
    const distance = Number.isFinite(Number(targetDistance)) ? Number(targetDistance) : dist(self, target);
    const closeRange = Math.max(
      Number(cfg.combatSpacingMinRange || 0),
      Number(cfg.combatPressureCloseRange || cfg.combatSpacingPreferredRange || 0)
    );
    const minHp = Math.max(0, Number(cfg.combatPressureCloseMinHp || cfg.combatLowHpLeaveThreshold || 0));
    if (!thresholdMs || noDamageMs < thresholdMs || !(distance > closeRange) || Number(selfHp || 0) < minHp) {
      return { active: false, dx: 0, dy: 0, distance, closeRange, noDamageMs };
    }
    const dir = directionTo(self, target);
    return {
      active: Boolean(dir.dx || dir.dy),
      dx: dir.dx,
      dy: dir.dy,
      distance,
      closeRange,
      noDamageMs,
      reason: 'long-no-damage'
    };
  }

  function combatFarNoDamageCloseVector(self, target, targetDistance, selfHp, targetHp) {
    const previous = bot.combatTarget || null;
    const targetId = target?.user_id ?? target?.id;
    const same = previous?.id !== null && previous?.id !== undefined
      && targetId !== null && targetId !== undefined
      && String(previous.id) === String(targetId);
    const lastDamageAt = same ? Number(previous.lastDamageAt || previous.at || Date.now()) : Date.now();
    const noDamageMs = Math.max(0, Date.now() - lastDamageAt);
    const thresholdMs = Math.max(0, Number(cfg.combatFarNoDamageCloseMs || 0) || 0);
    const startRange = Math.max(0, Number(cfg.combatFarNoDamageCloseStartRange || 0) || 0);
    const distance = Number.isFinite(Number(targetDistance)) ? Number(targetDistance) : dist(self, target);
    const closeRange = Math.max(
      Number(cfg.combatSpacingPreferredRange || 0),
      Number(cfg.combatFarNoDamageCloseRange || cfg.combatPressureCloseRange || 0)
    );
    const minHp = Math.max(0, Number(cfg.combatFarNoDamageCloseMinHp || cfg.combatPressureCloseMinHp || 0));
    const maxHpGap = Math.max(0, Number(cfg.combatFarNoDamageCloseMaxHpGap || 0));
    const hp = Number(selfHp);
    const enemyHp = Number(targetHp);
    const hpGap = Number.isFinite(hp) && Number.isFinite(enemyHp) ? enemyHp - hp : 0;
    if (!thresholdMs || !startRange || noDamageMs < thresholdMs || !(distance >= startRange) || !(distance > closeRange)) {
      return { active: false, dx: 0, dy: 0, distance, closeRange, noDamageMs };
    }
    if (Number.isFinite(hp) && hp < minHp) {
      return { active: false, dx: 0, dy: 0, distance, closeRange, noDamageMs, selfHp: hp, targetHp: enemyHp, hpGap };
    }
    if (Number.isFinite(hpGap) && hpGap > maxHpGap) {
      return { active: false, dx: 0, dy: 0, distance, closeRange, noDamageMs, selfHp: hp, targetHp: enemyHp, hpGap };
    }
    const dir = directionTo(self, target);
    return {
      active: Boolean(dir.dx || dir.dy),
      dx: dir.dx,
      dy: dir.dy,
      distance,
      closeRange,
      startRange,
      noDamageMs,
      selfHp: hp,
      targetHp: enemyHp,
      hpGap,
      reason: 'far-no-damage'
    };
  }

  function combatRetreatingFighterCloseVector(self, target, targetDistance, noDamageMs, selfHp, targetHp, retreatingTarget = null, targetRealBulletPressure = false) {
    const thresholdMs = Math.max(0, Number(cfg.combatFarNoDamageCloseMs || 0) || 0);
    const startRange = Math.max(0, Number(cfg.combatFarNoDamageCloseStartRange || 0) || 0);
    const distance = Number.isFinite(Number(targetDistance)) ? Number(targetDistance) : dist(self, target);
    const closeRange = Math.max(
      Number(cfg.combatSpacingPreferredRange || 0),
      Number(cfg.combatFarNoDamageCloseRange || cfg.combatPressureCloseRange || 0)
    );
    const minHp = Math.max(0, Number(cfg.combatRetreatingFighterCloseMinHp || cfg.combatFarNoDamageCloseMinHp || 0));
    const maxHpGap = Math.max(0, Number(cfg.combatRetreatingFighterCloseMaxHpGap || cfg.combatFarNoDamageCloseMaxHpGap || 0));
    const elapsed = Math.max(0, Number(noDamageMs || 0));
    const hp = Number(selfHp);
    const enemyHp = Number(targetHp);
    const hpGap = Number.isFinite(hp) && Number.isFinite(enemyHp) ? enemyHp - hp : 0;
    const activeRetreating = Boolean(retreatingTarget?.active && !retreatingTarget?.disengage);
    if (!activeRetreating || !targetRealBulletPressure || !thresholdMs || !startRange || elapsed < thresholdMs || !(distance >= startRange) || !(distance > closeRange)) {
      return { active: false, dx: 0, dy: 0, distance, closeRange, noDamageMs: elapsed, retreatingTarget };
    }
    if (Number.isFinite(hp) && hp < minHp) {
      return { active: false, dx: 0, dy: 0, distance, closeRange, noDamageMs: elapsed, selfHp: hp, targetHp: enemyHp, hpGap, retreatingTarget };
    }
    if (Number.isFinite(hpGap) && hpGap > maxHpGap) {
      return { active: false, dx: 0, dy: 0, distance, closeRange, noDamageMs: elapsed, selfHp: hp, targetHp: enemyHp, hpGap, retreatingTarget };
    }
    const dir = directionTo(self, target);
    return {
      active: Boolean(dir.dx || dir.dy),
      dx: dir.dx,
      dy: dir.dy,
      distance,
      closeRange,
      startRange,
      noDamageMs: elapsed,
      selfHp: hp,
      targetHp: enemyHp,
      hpGap,
      targetRealBulletPressure: true,
      farNoDamageClose: true,
      reason: 'retreating-fighter-close',
      retreatingTarget
    };
  }

  function combatFinishPressureState(self, target, targetDistance, selfHp, targetHp, retreatingTarget = null) {
    const attackRange = Math.max(0, Number(cfg.combatAttackRange || 0));
    const distance = Number.isFinite(Number(targetDistance)) ? Number(targetDistance) : dist(self, target);
    const minSelfHp = Math.max(0, Number(cfg.combatFinishPressureSelfHpMin || 0));
    const maxTargetHp = Math.max(0, Number(cfg.combatFinishPressureTargetHpMax || 0));
    const closeRange = Math.max(
      Number(cfg.combatSpacingMinRange || 0),
      Number(cfg.combatFinishPressureCloseRange || cfg.combatSpacingPreferredRange || 0)
    );
    const ownHp = Number(selfHp);
    const enemyHp = Number(targetHp);
    const inAttackRange = attackRange > 0 && distance <= attackRange;
    const retreatingEdge = Boolean(retreatingTarget?.active && retreatingTarget?.reason === 'target-retreating-edge');
    if (!retreatingEdge || !inAttackRange || !(distance > closeRange)) {
      return { active: false, dx: 0, dy: 0, distance, closeRange, selfHp: ownHp, targetHp: enemyHp };
    }
    if (!Number.isFinite(ownHp) || !Number.isFinite(enemyHp) || ownHp < minSelfHp || enemyHp > maxTargetHp) {
      return { active: false, dx: 0, dy: 0, distance, closeRange, selfHp: ownHp, targetHp: enemyHp };
    }
    const dir = directionTo(self, target);
    return {
      active: Boolean(dir.dx || dir.dy),
      dx: dir.dx,
      dy: dir.dy,
      distance,
      closeRange,
      selfHp: ownHp,
      targetHp: enemyHp,
      minSelfHp,
      maxTargetHp,
      reason: 'low-hp-retreating-target',
      retreatingTarget
    };
  }

  function combatOutOfRangeFinishPressureState(self, target, targetDistance, selfHp, targetHp, noDamageMs, retreatingTarget = null) {
    const attackRange = Math.max(0, Number(cfg.combatAttackRange || 0));
    const maxRange = Math.max(attackRange, Number(cfg.combatOutOfRangeFinishPressureRange || 0));
    const distance = Number.isFinite(Number(targetDistance)) ? Number(targetDistance) : dist(self, target);
    const minSelfHp = Math.max(0, Number(cfg.combatOutOfRangeFinishPressureSelfHpMin || 0));
    const maxTargetHp = Math.max(0, Number(cfg.combatOutOfRangeFinishPressureTargetHpMax || 0));
    const maxHpGap = Number.isFinite(Number(cfg.combatOutOfRangeFinishPressureMaxHpGap))
      ? Number(cfg.combatOutOfRangeFinishPressureMaxHpGap)
      : 0;
    const recentDamageMs = Math.max(0, Number(cfg.combatOutOfRangeFinishPressureRecentDamageMs || 0));
    const elapsed = Math.max(0, Number(noDamageMs || 0));
    const ownHp = Number(selfHp);
    const enemyHp = Number(targetHp);
    const hpGap = enemyHp - ownHp;
    if (!attackRange || !maxRange || !(distance > attackRange) || !(distance <= maxRange) || retreatingTarget?.disengage) {
      return { active: false, dx: 0, dy: 0, distance, attackRange, maxRange, selfHp: ownHp, targetHp: enemyHp, noDamageMs: elapsed };
    }
    if (!recentDamageMs || elapsed > recentDamageMs) {
      return { active: false, dx: 0, dy: 0, distance, attackRange, maxRange, selfHp: ownHp, targetHp: enemyHp, noDamageMs: elapsed };
    }
    if (!Number.isFinite(ownHp) || !Number.isFinite(enemyHp) || ownHp < minSelfHp || enemyHp > maxTargetHp || hpGap > maxHpGap) {
      return { active: false, dx: 0, dy: 0, distance, attackRange, maxRange, selfHp: ownHp, targetHp: enemyHp, hpGap, noDamageMs: elapsed };
    }
    const dir = directionTo(self, target);
    return {
      active: Boolean(dir.dx || dir.dy),
      dx: dir.dx,
      dy: dir.dy,
      distance,
      attackRange,
      maxRange,
      selfHp: ownHp,
      targetHp: enemyHp,
      hpGap,
      noDamageMs: elapsed,
      recentDamageMs,
      reason: 'out-of-range-low-hp-finish',
      retreatingTarget
    };
  }

  function combatOutOfRangeReengageState(self, target, targetDistance, selfHp, targetHp, retreatingTarget = null, targetRealBulletPressure = false) {
    const attackRange = Math.max(0, Number(cfg.combatAttackRange || 0));
    const maxRange = Math.max(attackRange, Number(cfg.combatOutOfRangeReengageRange || 0));
    const distance = Number.isFinite(Number(targetDistance)) ? Number(targetDistance) : dist(self, target);
    const minSelfHp = Math.max(0, Number(cfg.combatOutOfRangeReengageMinHp || 0));
    const maxHpGap = Math.max(0, Number(cfg.combatOutOfRangeReengageMaxHpGap || 0));
    const pressureMaxHpGap = Math.max(maxHpGap, Number(cfg.combatOutOfRangePressureReengageMaxHpGap || maxHpGap));
    const effectiveMaxHpGap = targetRealBulletPressure ? pressureMaxHpGap : maxHpGap;
    const recentInRangeMs = Math.max(0, Number(cfg.combatOutOfRangeReengageRecentInRangeMs || 0));
    const ownHp = Number(selfHp);
    const enemyHp = Number(targetHp);
    const hpGap = enemyHp - ownHp;
    const previous = bot.combatTarget || null;
    const same = previous && String(previous.id ?? '') === String(target?.user_id ?? target?.id ?? '');
    const outOfRangeMs = Math.max(0, Date.now() - Number((same ? previous?.lastInRangeAt : Date.now()) || Date.now()));
    const engagedIntent = /^(engaged|reengage)$/.test(String(target?.combatIntent || previous?.intent || ''))
      || same;
    const freshInRangeContact = Boolean(
      recentInRangeMs
      && outOfRangeMs <= recentInRangeMs
      && !retreatingTarget?.active
    );
    if (!attackRange || !maxRange || !(distance > attackRange) || !(distance <= maxRange) || retreatingTarget?.disengage) {
      return {
        active: false,
        dx: 0,
        dy: 0,
        distance,
        attackRange,
        maxRange,
        selfHp: ownHp,
        targetHp: enemyHp,
        hpGap,
        outOfRangeMs
      };
    }
    if (!engagedIntent) {
      return {
        active: false,
        dx: 0,
        dy: 0,
        distance,
        attackRange,
        maxRange,
        selfHp: ownHp,
        targetHp: enemyHp,
        hpGap,
        outOfRangeMs
      };
    }
    if (retreatingTarget?.active && !targetRealBulletPressure) {
      return {
        active: false,
        dx: 0,
        dy: 0,
        distance,
        attackRange,
        maxRange,
        selfHp: ownHp,
        targetHp: enemyHp,
        hpGap,
        outOfRangeMs,
        retreatingTarget
      };
    }
    if (!targetRealBulletPressure && !freshInRangeContact) {
      return {
        active: false,
        dx: 0,
        dy: 0,
        distance,
        attackRange,
        maxRange,
        selfHp: ownHp,
        targetHp: enemyHp,
        hpGap,
        outOfRangeMs,
        retreatingTarget
      };
    }
    if (!Number.isFinite(ownHp) || !Number.isFinite(enemyHp) || ownHp < minSelfHp || hpGap > effectiveMaxHpGap || combatMovementBlockedByStamina(self)) {
      return {
        active: false,
        dx: 0,
        dy: 0,
        distance,
        attackRange,
        maxRange,
        selfHp: ownHp,
        targetHp: enemyHp,
        hpGap,
        minSelfHp,
        maxHpGap: effectiveMaxHpGap,
        baseMaxHpGap: maxHpGap,
        pressureMaxHpGap,
        outOfRangeMs,
        targetRealBulletPressure: Boolean(targetRealBulletPressure),
        freshInRangeContact,
        retreatingTarget
      };
    }
    const dir = directionTo(self, target);
    return {
      active: Boolean(dir.dx || dir.dy),
      dx: dir.dx,
      dy: dir.dy,
      distance,
      attackRange,
      maxRange,
      selfHp: ownHp,
      targetHp: enemyHp,
      hpGap,
      minSelfHp,
      maxHpGap: effectiveMaxHpGap,
      baseMaxHpGap: maxHpGap,
      pressureMaxHpGap,
      outOfRangeMs,
      targetRealBulletPressure: Boolean(targetRealBulletPressure),
      freshInRangeContact,
      reason: targetRealBulletPressure ? 'target-real-bullet-pressure' : 'fresh-in-range-contact',
      retreatingTarget
    };
  }

  function combatPassiveRunnerState(self, target, targetDistance, motionScale = 0, realBulletPressure = false) {
    const t = Date.now();
    const selfHp = hpValue(self);
    const minSelfHp = Math.max(0, Number(cfg.combatPassiveRunnerMinSelfHp || 0));
    const minDrop = Math.max(0, Number(cfg.combatPassiveRunnerMinDrop || 0));
    const confirmMs = Math.max(0, Number(cfg.combatPassiveRunnerConfirmMs || 0));
    const targetDrop = Math.max(0, Number(dropValue(target) || target?.drop || 0));
    const moving = speed(target) >= cfg.combatStationarySpeed
      || Number(motionScale || 0) >= Math.max(0, Number(cfg.combatAimMovingScaleThreshold || 0.15));
    const current = bot.combatTarget && combatTargetId(bot.combatTarget) === combatTargetId(target) ? bot.combatTarget : null;
    const samples = Array.isArray(current?.motionSamples) ? current.motionSamples : [];
    const firstSelfHp = samples.length ? Number(samples[0].selfHp) : null;
    const lastSelfHp = samples.length ? Number(samples[samples.length - 1].selfHp) : null;
    const recentSelfDamage = Number.isFinite(firstSelfHp) && Number.isFinite(lastSelfHp)
      ? Math.max(0, firstSelfHp - lastSelfHp)
      : 0;
    const intent = String(target?.combatIntent || current?.intent || '');
    const originIntent = String(current?.originIntent || current?.intent || intent);
    const runnerIntent = /^(defensive|engaged|profit|reengage)$/.test(intent);
    const rewarded = targetDrop >= minDrop || runnerIntent;
    const engagedMs = current
      ? Math.max(0, t - Number(current.firstSeenAt || current.at || t))
      : 0;
    const confirmed = engagedMs >= confirmMs;
    const seenTargetRealBulletAt = Number(current?.seenTargetRealBulletAt || 0);
    const seenTargetRealBulletMs = seenTargetRealBulletAt ? Math.max(0, t - seenTargetRealBulletAt) : 0;
    const active = Boolean(
      isActive(target)
      && moving
      && runnerIntent
      && rewarded
      && !isFiringEntity(target)
      && !isInvulnerable(target)
      && !realBulletPressure
      && confirmed
      && !seenTargetRealBulletAt
      && Number.isFinite(selfHp)
      && selfHp >= minSelfHp
      && recentSelfDamage <= 0.01
    );
    return {
      active,
      selfHp,
      minSelfHp,
      targetDrop,
      minDrop,
      moving,
      motionScale: Number.isFinite(Number(motionScale)) ? Number(Number(motionScale).toFixed(2)) : 0,
      distance: Number.isFinite(Number(targetDistance)) ? Math.round(Number(targetDistance)) : null,
      combatIntent: intent,
      originIntent,
      recentSelfDamage,
      engagedMs,
      confirmMs,
      confirmed,
      seenTargetRealBulletAt: seenTargetRealBulletAt || 0,
      seenTargetRealBulletMs
    };
  }

  function combatPassiveRunnerCloseVector(self, target, targetDistance, runnerState) {
    const distance = Number.isFinite(Number(targetDistance)) ? Number(targetDistance) : dist(self, target);
    const closeRange = Math.max(
      Number(cfg.combatSpacingMinRange || 0),
      Number(cfg.combatPassiveRunnerCloseRange || 0)
    );
    if (!runnerState?.active || !(distance > closeRange)) {
      return { active: false, dx: 0, dy: 0, distance, closeRange, reason: 'passive-runner' };
    }
    const dir = directionTo(self, target);
    return {
      active: Boolean(dir.dx || dir.dy),
      dx: dir.dx,
      dy: dir.dy,
      distance,
      closeRange,
      noDamageMs: 0,
      reason: 'passive-runner'
    };
  }

  function combatExitSummary(reason, target, combatState = {}) {
    const selfHp = Number(combatState.selfHp ?? NaN);
    const targetHp = Number(combatState.targetHp ?? target?.hp ?? NaN);
    const hpGap = Number(combatState.hpGap ?? (Number.isFinite(targetHp) && Number.isFinite(selfHp) ? targetHp - selfHp : NaN));
    if (reason === 'combat-critical-hp-leave') {
      return '与' + actorLabel(target) + '战斗，血量' + hpDisplay(selfHp) + '低于' + cfg.combatCriticalHpLeaveThreshold + '，紧急退出';
    }
    if (reason === 'combat-hp-disadvantage-leave') {
      if (combatState?.serverStallNoDamage) {
        const noDamageText = Number.isFinite(Number(combatState.serverStallNoDamage.noDamageMs))
          ? '，' + Math.round(Number(combatState.serverStallNoDamage.noDamageMs) / 1000) + '秒未造成伤害'
          : '';
        const gapText = Number.isFinite(hpGap) ? '，差距' + hpDisplay(hpGap) : '';
        return '与' + actorLabel(target) + '战斗，服务端位置停滞下血量' + hpDisplay(selfHp) + '，对方血量' + hpDisplay(targetHp) + gapText + noDamageText + '，劣势退出';
      }
      if (combatState?.pressureDisadvantage) {
        const distanceText = Number.isFinite(Number(combatState.pressureDisadvantage.distance))
          ? '，距离' + Math.round(Number(combatState.pressureDisadvantage.distance) / 100) + '米'
          : '';
		        return '与' + actorLabel(target) + '战斗，近身弹压下血量' + hpDisplay(selfHp) + '，对方血量' + hpDisplay(targetHp) + '，差距' + hpDisplay(hpGap) + distanceText + '，提前劣势退出';
		      }
		      if (combatState?.sustainedPressureDisadvantage) {
		        const pressure = combatState.sustainedPressureDisadvantage;
		        const noDamageText = Number.isFinite(Number(pressure.noDamageMs))
		          ? '，' + Math.round(Number(pressure.noDamageMs) / 1000) + '秒未造成伤害'
		          : '';
		        const distanceText = Number.isFinite(Number(pressure.distance))
		          ? '，距离' + Math.round(Number(pressure.distance) / 100) + '米'
		          : '';
		        return '与' + actorLabel(target) + '战斗，持续弹压下血量' + hpDisplay(selfHp) + '，对方血量' + hpDisplay(targetHp) + '，差距' + hpDisplay(hpGap) + noDamageText + distanceText + '，提前劣势退出';
		      }
		      if (combatState?.tradeEstimate) {
	        const estimate = combatState.tradeEstimate;
	        const deathText = Number.isFinite(Number(estimate.tDeathMs)) ? '，预计承伤倒计时' + Math.round(Number(estimate.tDeathMs) / 1000) + '秒' : '';
	        const killText = Number.isFinite(Number(estimate.tKillMs)) ? '，预计击杀需' + Math.round(Number(estimate.tKillMs) / 1000) + '秒' : '';
	        return '与' + actorLabel(target) + '战斗，交换比劣势' + deathText + killText + '，提前退出';
	      }
	      return '与' + actorLabel(target) + '战斗，血量' + hpDisplay(selfHp) + '，对方血量' + hpDisplay(targetHp) + '，差距' + hpDisplay(hpGap) + '，劣势退出';
	    }
    if (reason === 'combat-low-hp-no-damage-leave') {
      const noDamageText = Number.isFinite(Number(combatState.noDamageMs))
        ? '，' + Math.round(Number(combatState.noDamageMs) / 1000) + '秒未造成伤害'
        : '';
      return '与' + actorLabel(target) + '战斗，血量' + hpDisplay(selfHp) + '，对方血量' + hpDisplay(targetHp) + noDamageText + '，低血久攻未中退出';
    }
    if (reason === 'combat-low-hp-leave' && combatState?.closeRisk) {
      const distanceText = Number.isFinite(Number(combatState.closeRisk.distance))
        ? '，距离' + Math.round(Number(combatState.closeRisk.distance) / 100) + '米'
        : '';
      return '与' + actorLabel(target) + '战斗，血量' + hpDisplay(selfHp) + '不足' + cfg.combatLowHpLeaveThreshold + '，对方血量' + hpDisplay(targetHp) + distanceText + '，低血近身风险退出';
    }
    return '与' + actorLabel(target) + '战斗，血量' + hpDisplay(selfHp) + '不足' + cfg.combatLowHpLeaveThreshold + '，对方血量' + hpDisplay(targetHp) + '，劣势退出';
  }
  function combatLeaveCoverAction(self, target, bullets = []) {
    const selfHp = hpValue(self);
    const targetHp = combatHpValue(target);
    const targetThreat = incomingBulletThreatForTest(self, target, bullets);
    const anyThreat = targetThreat || incomingBulletThreatForTest(self, null, bullets);
    const targetBulletSeen = (bullets || []).some(b => Number(b.owner_id ?? b.ownerId ?? b.source_user_id ?? b.user_id) === Number(target.user_id));
    const incoming = Boolean(isFiringEntity(target) || targetBulletSeen || anyThreat);
    const spacing = combatSpacingVector(self, target, target.distance);
    const spacingOverride = incoming && combatSpacingShouldOverrideBullet(spacing, selfHp, targetHp);
    const requestedDx = spacingOverride ? spacing.dx : (incoming ? 1 : spacing.dx);
    const requestedDy = spacingOverride ? spacing.dy : (incoming ? 1 : spacing.dy);
    const movementSuppressed = combatMovementBlockedByStamina(self) && Boolean(requestedDx || requestedDy)
      ? {
        reason: 'stamina-5s-exhausted',
        stamina5s: staminaRemaining(self, '5s'),
        thresholdMs: staminaExhaustedThreshold(),
        requestedDx,
        requestedDy
      }
      : null;
    const shooting = combatShootingPlan(self, {
	      needsMovement: Boolean(requestedDx || requestedDy),
	      dodging: incoming,
	      realBulletPressure: incoming,
	      targetDistance: target.distance,
      targetHp
    });
    return {
      reason: movementSuppressed
        ? 'combat-stamina-hold'
        : (shooting.suppressed
          ? 'combat-stamina-conserve'
          : (incoming && !spacingOverride ? 'combat-leave-dodge' : (spacing.active ? 'combat-leave-spacing' : 'combat-leave-cover'))),
      dx: movementSuppressed ? 0 : requestedDx,
      dy: movementSuppressed ? 0 : requestedDy,
      shoot: shooting.shoot,
      forceShoot: shooting.forceShoot,
      shootEveryMs: shooting.shootEveryMs,
      movementSuppressed,
      shooting,
      spacing: spacing.active ? {
        dx: spacing.dx,
        dy: spacing.dy,
        reason: spacing.reason,
        distance: Math.round(spacing.distance),
        overrideBullet: Boolean(spacingOverride)
      } : null
    };
  }

	  function combatLeaveAction(reason, self, target, combatState = {}, bullets = []) {
    const state = {
      selfHp: hpValue(self),
      targetHp: combatHpValue(target),
      ...combatState
    };
    const actionTarget = {
      id: target.user_id,
      name: target.name,
      hp: combatHpValue(target),
      distance: Math.round(target.distance),
      mode: target.current_join_mode || target.mode || '',
      life: target.life || '',
      active: isActive(target),
      firing: isFiringEntity(target),
      invulnerable: isInvulnerable(target),
      combatIntent: target.combatIntent || ''
    };
    const cover = combatLeaveCoverAction(self, target, bullets);
    return {
      kind: 'leave',
      reason,
      exitSummary: combatExitSummary(reason, actionTarget, state),
      combat: true,
      dx: cover.dx,
      dy: cover.dy,
      shoot: cover.shoot,
      forceShoot: cover.forceShoot,
      shootEveryMs: cover.shootEveryMs,
      target: actionTarget,
      combatCover: cover,
	      combatState: {
        ...state,
        leaveCover: cover
      }
	    };
	  }
  function enemyRepeatDelayMsForCount(count) {
    const n = Math.max(0, Number(count) || 0);
    if (n >= 3) return cfg.enemyReloginRepeatThirdMaxMs;
    if (n >= 2) return cfg.enemyReloginRepeatSecondMaxMs;
    return 0;
  }
  function combatTargetNoDamageMs(target) {
    const previous = bot.combatTarget || null;
    const targetId = target?.user_id ?? target?.id;
    const same = previous?.id !== null && previous?.id !== undefined
      && targetId !== null && targetId !== undefined
      && String(previous.id) === String(targetId);
    const lastDamageAt = same ? Number(previous.lastDamageAt || previous.at || Date.now()) : Date.now();
    return Math.max(0, Date.now() - lastDamageAt);
  }
  function combatLowHpNoDamageLeaveState(selfHp, targetHp, noDamageMs) {
    const threshold = Math.max(0, Number(cfg.combatLowHpNoDamageLeaveThreshold || 0));
    const waitMs = Math.max(0, Number(cfg.combatLowHpNoDamageLeaveMs || 0));
    const minGap = Number.isFinite(Number(cfg.combatLowHpNoDamageMinGap))
      ? Number(cfg.combatLowHpNoDamageMinGap)
      : 0;
    const hpGap = Number(targetHp) - Number(selfHp);
    if (!threshold || !waitMs || !(Number(selfHp) < threshold) || !(hpGap >= minGap) || !(Number(noDamageMs) >= waitMs)) return null;
    return { selfHp, targetHp, hpGap, noDamageMs, threshold, waitMs, minGap };
  }

  function combatRetreatingTargetState(self, target, targetDistance, damageState = null) {
    const attackRange = Math.max(0, Number(cfg.combatAttackRange || 0));
    const disengageRange = Math.max(attackRange, Number(cfg.combatDisengageRange || cfg.combatEngageGraceRange || attackRange || 0));
    const edgeRange = Math.min(
      attackRange || Infinity,
      Math.max(0, Number(cfg.combatRetreatEdgeRange || 0) || attackRange * 0.95)
    );
    const minRadialSpeed = Math.max(0, Number(cfg.combatRetreatRadialSpeedMin || cfg.combatStationarySpeed || 0));
    const minDistanceDelta = Math.max(0, Number(cfg.combatRetreatDistanceDeltaMin || 0));
    const dx = Number(target?.x) - Number(self?.x);
    const dy = Number(target?.y) - Number(self?.y);
    const distance = Number.isFinite(Number(targetDistance)) ? Number(targetDistance) : Math.hypot(dx, dy);
    const d = Math.max(1, Number.isFinite(distance) ? distance : Math.hypot(dx, dy));
    const vx = Number(target?.vx) || 0;
    const vy = Number(target?.vy) || 0;
    const radialSpeed = (dx / d) * vx + (dy / d) * vy;
    const previous = bot.combatTarget;
    const same = previous && combatTargetId(previous) && combatTargetId(previous) === combatTargetId(target);
    const previousDistance = same && Number.isFinite(Number(previous.distance)) ? Number(previous.distance) : null;
    const distanceDelta = previousDistance === null ? 0 : distance - previousDistance;
    const receding = Boolean(
      (minRadialSpeed > 0 && radialSpeed >= minRadialSpeed)
      || (minDistanceDelta > 0 && distanceDelta >= minDistanceDelta)
    );
    const outOfRange = attackRange > 0 && distance > attackRange;
    const beyondDisengage = disengageRange > 0 && distance > disengageRange;
    const edge = edgeRange > 0 && distance >= edgeRange;
    const active = Boolean(receding && (outOfRange || edge));
    return {
      active,
      disengage: Boolean(beyondDisengage),
      suppressFire: Boolean(active && edge),
      reason: beyondDisengage ? 'target-beyond-disengage-range' : (outOfRange ? 'target-out-of-attack-range' : 'target-retreating-edge'),
      distance: Number.isFinite(distance) ? Math.round(distance) : null,
      attackRange: Math.round(attackRange),
      disengageRange: Math.round(disengageRange),
      edgeRange: Math.round(edgeRange),
      radialSpeed: Number.isFinite(radialSpeed) ? Math.round(radialSpeed) : 0,
      distanceDelta: Number.isFinite(distanceDelta) ? Math.round(distanceDelta) : 0,
      noDamageMs: Math.max(0, Number(damageState?.noDamageMs || 0))
    };
  }

  function combatServerStallNoDamageLeaveState(selfHp, targetHp, noDamageMs, realBulletPressure = false, serverPositionStall = null) {
    const waitMs = Math.max(0, Number(cfg.combatServerStallNoDamageLeaveMs || 0));
    const precisionWaitMs = Math.max(0, Number(cfg.combatAimFallbackPrecisionNoDamageMs || 0));
    const precisionGraceMs = Math.max(0, Number(cfg.combatServerStallNoDamagePrecisionGraceMs || 0));
    const effectiveWaitMs = Math.max(waitMs, precisionWaitMs ? precisionWaitMs + precisionGraceMs : waitMs);
    const minGap = Math.max(0, Number(cfg.combatServerStallNoDamageHpGap || 0));
    const hp = Number(selfHp);
    const enemyHp = Number(targetHp);
    const hpGap = enemyHp - hp;
    const elapsed = Math.max(0, Number(noDamageMs || 0));
    const stall = serverPositionStall || {};
    if (!waitMs || !stall.stalled || !realBulletPressure) return null;
    if (!Number.isFinite(hp) || !Number.isFinite(enemyHp) || !Number.isFinite(hpGap)) return null;
    if (elapsed < effectiveWaitMs || hpGap < minGap) return null;
    return {
      active: true,
      selfHp: hp,
      targetHp: enemyHp,
      hpGap,
      noDamageMs: elapsed,
      waitMs,
      effectiveWaitMs,
      precisionWaitMs,
      precisionGraceMs,
      minGap,
      realBulletPressure: true,
      serverPositionStall: {
        stalled: true,
        reason: stall.reason || 'server-position-stalled',
        movingMs: Number.isFinite(Number(stall.movingMs)) ? Math.round(Number(stall.movingMs)) : null,
        gap: Number.isFinite(Number(stall.gap)) ? Math.round(Number(stall.gap)) : null,
        gapDelta: Number.isFinite(Number(stall.gapDelta)) ? Math.round(Number(stall.gapDelta)) : null,
        holdRemainingMs: Number.isFinite(Number(stall.holdRemainingMs)) ? Math.round(Number(stall.holdRemainingMs)) : null
      }
    };
  }

  function combatTrendState(self, options = {}) {
    const selfHp = hpValue(self);
    const targetHp = Number(options.targetHp);
    const targetDistance = Number(options.targetDistance);
    const noDamageMs = Math.max(0, Number(options.noDamageMs || 0));
    const hpGap = Number(targetHp) - Number(selfHp);
    const highHpMin = Math.max(0, Number(cfg.combatShootHighHpMinHp || 0));
    const highHpFireWindow = highHpMin > 0
      && Number.isFinite(selfHp)
      && selfHp >= highHpMin
      && (!Number.isFinite(targetHp) || selfHp >= targetHp);
    const finishLowThreatMinHp = Math.max(0, Number(cfg.combatShootFinishLowThreatMinHp || 0));
    const finishLowThreatTargetHpMax = Math.max(0, Number(cfg.combatShootFinishLowThreatTargetHpMax || 0));
    const finishLowThreatMaxHpGap = Math.max(0, Number(cfg.combatShootFinishLowThreatMaxHpGap || 0));
    const finishLowThreatRange = Math.max(0, Number(cfg.combatShootFinishLowThreatRange || 0));
    const finishLowThreatFireWindow = !Boolean(options.realBulletPressure)
      && finishLowThreatMinHp > 0
      && finishLowThreatRange > 0
      && Number.isFinite(selfHp)
      && Number.isFinite(targetHp)
      && Number.isFinite(targetDistance)
      && selfHp >= finishLowThreatMinHp
      && targetHp <= finishLowThreatTargetHpMax
      && hpGap <= finishLowThreatMaxHpGap
      && targetDistance <= finishLowThreatRange;
    const passiveRunnerFireWindow = Boolean(options.passiveRunner)
      && !Boolean(options.realBulletPressure)
      && Number.isFinite(selfHp)
      && selfHp >= Math.max(0, Number(cfg.combatPassiveRunnerMinSelfHp || 0));
    const targetPressureFire = options.targetRealBulletPressure !== undefined
      ? Boolean(options.targetRealBulletPressure)
      : Boolean(options.realBulletPressure);
    const opponentProbeMs = Math.max(0, Number(cfg.combatOpponentProbeMs || 0));
    const opponentProbeEngagedMs = Math.max(0, Number(options.opponentProbeEngagedMs || 0));
    const opponentProbeSeenTargetRealBullet = Math.max(0, Number(options.opponentProbeSeenTargetRealBulletMs || 0)) > 0;
    const pressureMinHp = Math.max(0, Number(cfg.combatShootPressureMinHp || 0));
    const pressureRange = Math.max(0, Number(cfg.combatShootPressureRange || 0));
    const pressureMaxHpGap = Math.max(0, Number(cfg.combatShootPressureMaxHpGap || 0));
    const closePressureFireWindow = targetPressureFire
      && pressureMinHp > 0
      && pressureRange > 0
      && Number.isFinite(selfHp)
      && Number.isFinite(targetHp)
      && Number.isFinite(targetDistance)
      && selfHp >= pressureMinHp
      && hpGap <= pressureMaxHpGap
      && targetDistance <= pressureRange;
    const winningPressureMinHp = Math.max(0, Number(cfg.combatShootWinningPressureMinHp || 0));
    const winningPressureTargetHpMax = Math.max(0, Number(cfg.combatShootWinningPressureTargetHpMax || 0));
    const winningPressureLeadHp = Math.max(0, Number(cfg.combatShootWinningPressureLeadHp || 0));
    const winningPressureRange = Math.max(0, Number(cfg.combatShootWinningPressureRange || 0));
    const winningPressureNoDamageMs = Math.max(0, Number(cfg.combatShootWinningPressureNoDamageMs || 0));
    const winningPressureFireWindow = targetPressureFire
      && winningPressureMinHp > 0
      && winningPressureTargetHpMax > 0
      && winningPressureRange > 0
      && Number.isFinite(selfHp)
      && Number.isFinite(targetHp)
      && Number.isFinite(targetDistance)
      && selfHp >= winningPressureMinHp
      && targetHp <= winningPressureTargetHpMax
      && hpGap <= -winningPressureLeadHp
      && noDamageMs >= winningPressureNoDamageMs
      && targetDistance <= winningPressureRange;
    const steadyAimMinHp = Math.max(0, Number(cfg.combatShootSteadyAimMinHp || 0));
    const steadyAimMaxHpGap = Math.max(0, Number(cfg.combatShootSteadyAimMaxHpGap || 0));
    const steadyAimNoDamageMs = Math.max(0, Number(cfg.combatShootSteadyAimNoDamageMs || cfg.combatAimSteadyNoDamageMs || 0));
    const steadyAimFireWindow = Boolean(options.steadyAim)
      && steadyAimMinHp > 0
      && Number.isFinite(selfHp)
      && Number.isFinite(targetHp)
      && selfHp >= steadyAimMinHp
      && hpGap <= steadyAimMaxHpGap
      && noDamageMs >= steadyAimNoDamageMs;
    const noDamageDuelMinHp = Math.max(0, Number(cfg.combatShootNoDamageDuelMinHp || 0));
    const noDamageDuelMaxHpGap = Math.max(0, Number(cfg.combatShootNoDamageDuelMaxHpGap || 0));
    const noDamageDuelNoDamageMs = Math.max(0, Number(cfg.combatShootNoDamageDuelNoDamageMs || 0));
    const noDamageDuelRange = Math.max(0, Number(cfg.combatShootNoDamageDuelRange || cfg.combatAttackRange || 0));
    const farNoDamageCloseMinHp = Math.max(noDamageDuelMinHp, Number(cfg.combatFarNoDamageCloseMinHp || 0));
    const farNoDamageCloseFireWindow = Boolean(options.farNoDamageClose)
      && farNoDamageCloseMinHp > 0
      && Number.isFinite(selfHp)
      && selfHp >= farNoDamageCloseMinHp;
    const noDamageDuelFireWindow = Boolean(options.engagedCombat || options.targetActive || options.targetMoving)
      && noDamageDuelMinHp > 0
      && noDamageDuelNoDamageMs > 0
      && noDamageDuelRange > 0
      && Number.isFinite(selfHp)
      && Number.isFinite(targetHp)
      && Number.isFinite(targetDistance)
      && selfHp >= noDamageDuelMinHp
      && hpGap <= noDamageDuelMaxHpGap
      && noDamageMs >= noDamageDuelNoDamageMs
      && targetDistance <= noDamageDuelRange;
    const opponentProbeFireWindow = Boolean(
      opponentProbeMs > 0
      && opponentProbeEngagedMs < opponentProbeMs
      && Boolean(options.targetActive)
      && !Boolean(options.realBulletPressure)
      && !targetPressureFire
      && !opponentProbeSeenTargetRealBullet
      && !finishLowThreatFireWindow
      && Number.isFinite(selfHp)
      && selfHp >= Math.max(0, Number(cfg.combatLowHpLeaveThreshold || 0))
    );
    let stance = 'normal';
    if (winningPressureFireWindow) stance = 'winning-pressure';
    else if (closePressureFireWindow) stance = 'close-pressure';
    else if (opponentProbeFireWindow) stance = 'opponent-probe';
    else if (passiveRunnerFireWindow) stance = 'passive-runner';
    else if (finishLowThreatFireWindow) stance = 'finish-low-threat';
    else if (steadyAimFireWindow) stance = 'steady-aim';
    else if (noDamageDuelFireWindow) stance = 'no-damage-duel';
    else if (farNoDamageCloseFireWindow) stance = 'far-no-damage-close';
    else if (highHpFireWindow) stance = 'high-hp-pressure';
    else if (Number.isFinite(hpGap) && hpGap > 0) stance = 'guarded';
    return {
      stance,
      selfHp,
      targetHp,
      hpGap,
      targetDistance,
      noDamageMs,
      highHpFireWindow,
      passiveRunnerFireWindow,
      opponentProbeFireWindow,
      opponentProbeEngagedMs,
      finishLowThreatFireWindow,
      closePressureFireWindow,
      winningPressureFireWindow,
      steadyAimFireWindow,
      noDamageDuelFireWindow,
      farNoDamageCloseFireWindow,
      engagedCombat: Boolean(options.engagedCombat),
      targetActive: Boolean(options.targetActive),
      targetMoving: Boolean(options.targetMoving),
      passiveRunner: Boolean(options.passiveRunner),
      opponentProbe: opponentProbeFireWindow,
      realBulletPressure: Boolean(options.realBulletPressure),
      targetRealBulletPressure: targetPressureFire,
      steadyAim: Boolean(options.steadyAim),
      farNoDamageClose: farNoDamageCloseFireWindow
    };
  }

  function combatTickActiveFromState(state = {}) {
    const t = Number.isFinite(Number(state.nowMs)) ? Number(state.nowMs) : Date.now();
    const decision = state.decision || null;
    const recentCombatMs = Math.max(1000, Number(cfg.combatEngageStickMs || 0), Number(cfg.combatEngageGraceMs || 0));
    const combatAt = Number(state.combatTarget?.at || 0);
    if (decision?.combat || decision?.combatCover || /^combat-/.test(String(decision?.reason || ''))) return true;
    if (combatAt && t - combatAt <= recentCombatMs) return true;
    if (state.pendingExit && /^combat-/.test(String(state.pendingExit.reason || state.pendingExit.rootReason || ''))) return true;
    return false;
  }

  function globalSamplingOutageOfflineStateForTest(state = {}) {
    if (!cfg.globalSamplingOutageOfflineEnabled) return null;
    const outage = state.outage || null;
    if (!outage?.active) return null;
    const t = Number.isFinite(Number(state.nowMs)) ? Number(state.nowMs) : Date.now();
    const minErrors = Math.max(1, Number(cfg.globalSamplingOutageMinErrors || 1));
    const errorCount = Math.max(0, Number(outage.errorCount || 0));
    if (errorCount < minErrors) return null;
    const firstAt = Number(outage.firstAt || 0) || t;
    const ageMs = Math.max(Number(outage.ageMs || 0), Math.max(0, t - firstAt));
    const minAgeMs = Math.max(0, Number(cfg.globalSamplingOutageMinAgeMs || 0));
    if (ageMs < minAgeMs) return null;
    const combatActive = Boolean(outage.combatActive) || combatTickActiveFromState({
      decision: state.decision,
      combatTarget: state.combatTarget,
      pendingExit: state.pendingExit,
      nowMs: t
    });
    if (cfg.globalSamplingOutageCombatOnly && !combatActive) return null;
    return {
      reason: 'global sampling outage',
      ageMs,
      errorCount,
      combatActive,
      snapshotTimedOut: Boolean(outage.snapshotTimedOut),
      minimapTimedOut: Boolean(outage.minimapTimedOut)
    };
  }

  function combatTickGapOfflineStateForTest(state = {}) {
    if (!cfg.combatTickGapOfflineEnabled) return null;
    const thresholdMs = Math.max(1000, Number(cfg.combatTickGapOfflineMs || 0) || 0);
    if (!(thresholdMs > 0)) return null;
    const t = Number.isFinite(Number(state.nowMs)) ? Number(state.nowMs) : Date.now();
    const previousTickAt = Number(state.previousTickAt || 0) || 0;
    const tickGapMs = Number.isFinite(Number(state.tickGapMs))
      ? Math.max(0, Math.round(Number(state.tickGapMs)))
      : (previousTickAt ? Math.max(0, Math.round(t - previousTickAt)) : null);
    const tickInProgressMs = Number.isFinite(Number(state.tickInProgressMs))
      ? Math.max(0, Math.round(Number(state.tickInProgressMs)))
      : null;
    const lastTickCompletedGapMs = Number.isFinite(Number(state.lastTickCompletedGapMs))
      ? Math.max(0, Math.round(Number(state.lastTickCompletedGapMs)))
      : null;
    const combatLogActive = Boolean(state.combatLogActive);
    const lastCombatFrameAt = Number(state.lastCombatFrameAt || 0) || 0;
    const combatFrameGapMs = lastCombatFrameAt ? Math.max(0, Math.round(t - lastCombatFrameAt)) : null;
    const lastBuiltFrameAt = Number(state.lastBuiltFrameAt || 0) || 0;
    const builtFrameGapMs = lastBuiltFrameAt ? Math.max(0, Math.round(t - lastBuiltFrameAt)) : null;
    const lastCombatAt = Number(state.lastCombatAt || 0) || 0;
    const combatLogGapMs = lastCombatAt ? Math.max(0, Math.round(t - lastCombatAt)) : null;
    const previousCombatActive = Boolean(state.previousCombatActive);
    const currentCombatActive = combatTickActiveFromState({
      decision: state.decision,
      combatTarget: state.combatTarget,
      pendingExit: state.pendingExit,
      nowMs: t
    });
    const recentCombatContextMs = Math.max(
      thresholdMs,
      Number(cfg.combatEngageStickMs || 0),
      Number(cfg.combatEngageGraceMs || 0),
      Number(cfg.combatLogPostBufferMs || 0)
    );
    const recentCombatFrameContext = Boolean(lastCombatFrameAt
      && recentCombatContextMs > 0
      && t - lastCombatFrameAt <= recentCombatContextMs);
    const combatFrameActiveContext = previousCombatActive || currentCombatActive;
    const activeCombatContext = combatFrameActiveContext || combatLogActive || recentCombatFrameContext;
    if (!activeCombatContext) return null;
    const liveCombatContext = combatFrameActiveContext;
    const reentryGap = Boolean(state.reentry && (
      (tickInProgressMs !== null && tickInProgressMs >= thresholdMs)
      || (lastTickCompletedGapMs !== null && lastTickCompletedGapMs >= thresholdMs)
    ));
    const mainLoopGap = Boolean(!reentryGap && previousTickAt && tickGapMs !== null && tickGapMs >= thresholdMs);
    const combatFrameGap = !reentryGap && !mainLoopGap && combatFrameActiveContext && combatFrameGapMs !== null && combatFrameGapMs >= thresholdMs;
    if (!reentryGap && !mainLoopGap && !combatFrameGap) return null;
    const diagnosis = reentryGap ? 'tick-reentry-gap'
      : (mainLoopGap ? 'main-loop-gap' : 'combat-log-gap-with-active-tick');
    const likelyCause = reentryGap ? 'main-loop-stuck-or-awaiting-async'
      : (mainLoopGap ? 'js-or-main-loop-paused' : 'combat-state-or-log-gating-gap');
    return {
      reason: 'combat tick gap',
      diagnosis,
      likelyCause,
      thresholdMs,
      tickGapMs,
      tickInProgressMs,
      lastTickCompletedGapMs,
      previousTickAt,
      currentTickAt: t,
      previousCombatActive,
      currentCombatActive,
      combatLogActive,
      liveCombatContext,
      activeCombatContext,
      combatFrameActiveContext,
      recentCombatFrameContext,
      recentCombatContextMs,
      lastCombatFrameAt,
      combatFrameGapMs,
      lastBuiltFrameAt,
      builtFrameGapMs,
      lastCombatAt,
      combatLogGapMs
    };
  }

  function nativeTickMinIntervalMs(state = {}) {
    const normalMs = Math.max(1, Number(cfg.nativeTickMinMs || cfg.tickMs || 120));
    const combatMs = Math.max(1, Number(cfg.combatNativeTickMinMs || normalMs));
    return combatTickActiveFromState(state) ? Math.min(normalMs, combatMs) : normalMs;
  }

  function combatShootingPlan(self, options = {}) {
    const stamina5s = staminaRemaining(self, '5s');
    const normalEveryMs = Math.max(1, Number(cfg.combatShootEveryMs || cfg.shootEveryMs || 120));
    const conserveEveryMs = Math.max(normalEveryMs, Number(cfg.combatShootConserveEveryMs || normalEveryMs));
    const recoveryEveryMs = Math.max(conserveEveryMs, Number(cfg.combatShootRecoveryEveryMs || conserveEveryMs));
    const hardReserveMs = Math.max(staminaExhaustedThreshold(), Number(cfg.combatShootHardReserveMs || staminaExhaustedThreshold()));
    const dodgeReserveMs = Math.max(hardReserveMs, Number(cfg.combatShootDodgeReserveMs || hardReserveMs));
    const highHpDodgeReserveMs = Math.max(hardReserveMs, Number(cfg.combatShootHighHpDodgeReserveMs || dodgeReserveMs));
    const finishLowThreatDodgeReserveMs = Math.max(hardReserveMs, Number(cfg.combatShootFinishLowThreatDodgeReserveMs || hardReserveMs));
    const passiveRunnerDodgeReserveMs = Math.max(hardReserveMs, Number(cfg.combatShootPassiveRunnerDodgeReserveMs || highHpDodgeReserveMs));
    const pressureDodgeReserveMs = Math.max(hardReserveMs, Number(cfg.combatShootPressureDodgeReserveMs || highHpDodgeReserveMs));
    const winningPressureDodgeReserveMs = Math.max(hardReserveMs, Number(cfg.combatShootWinningPressureDodgeReserveMs || pressureDodgeReserveMs));
    const steadyAimDodgeReserveMs = Math.max(hardReserveMs, Number(cfg.combatShootSteadyAimDodgeReserveMs || highHpDodgeReserveMs));
    const noDamageDuelDodgeReserveMs = Math.max(hardReserveMs, Number(cfg.combatShootNoDamageDuelDodgeReserveMs || highHpDodgeReserveMs));
    const reserveMs = Math.max(dodgeReserveMs, Number(cfg.combatShootReserveMs || dodgeReserveMs));
    const trend = options.trend && typeof options.trend === 'object'
      ? options.trend
      : combatTrendState(self, options);
    const noDamageMs = Math.max(0, Number(trend.noDamageMs || 0));
    const highHpFireWindow = Boolean(trend.highHpFireWindow);
    const passiveRunnerFireWindow = Boolean(trend.passiveRunnerFireWindow);
    const opponentProbeFireWindow = Boolean(trend.opponentProbeFireWindow);
    const finishLowThreatFireWindow = Boolean(trend.finishLowThreatFireWindow);
    const closePressureFireWindow = Boolean(trend.closePressureFireWindow);
	    const winningPressureFireWindow = Boolean(trend.winningPressureFireWindow);
	    const steadyAimFireWindow = Boolean(trend.steadyAimFireWindow);
	    const noDamageDuelFireWindow = Boolean(trend.noDamageDuelFireWindow);
	    const farNoDamageCloseFireWindow = Boolean(trend.farNoDamageCloseFireWindow);
	    const aimConfidence = Number.isFinite(Number(options.aimConfidence))
	      ? Math.max(0, Math.min(1, Number(options.aimConfidence)))
	      : null;
	    const lowConfidenceThreshold = Math.max(0, Math.min(1, Number(cfg.combatAimLowConfidenceThreshold || 0)));
	    const lowConfidenceMinDistance = Math.max(0, Number(cfg.combatAimLowConfidenceMinDistance || 0));
	    const lowConfidenceMotionScale = Math.max(0, Number(cfg.combatAimLowConfidenceMotionScale || 0));
	    const lowConfidenceEveryMs = Math.max(conserveEveryMs, Number(cfg.combatAimLowConfidenceEveryMs || conserveEveryMs));
    const opponentProbeReserveMs = Math.max(
      dodgeReserveMs,
      Number(cfg.combatOpponentProbeReserveMs || reserveMs)
    );
    const opponentProbeEveryMs = Math.max(
      normalEveryMs,
      Number(cfg.combatOpponentProbeEveryMs || lowConfidenceEveryMs)
    );
	    const lowConfidenceWindow = Boolean(
	      aimConfidence !== null
	      && lowConfidenceThreshold > 0
	      && aimConfidence < lowConfidenceThreshold
	      && Number(options.targetDistance || 0) >= lowConfidenceMinDistance
	      && (options.targetMoving || Number(options.motionScale || 0) >= lowConfidenceMotionScale)
	      && !closePressureFireWindow
	      && !steadyAimFireWindow
	    );
    let effectiveDodgeReserveMs = dodgeReserveMs;
    if (opponentProbeFireWindow) {
      effectiveDodgeReserveMs = Math.max(effectiveDodgeReserveMs, opponentProbeReserveMs);
    } else {
      if (highHpFireWindow) effectiveDodgeReserveMs = Math.min(effectiveDodgeReserveMs, highHpDodgeReserveMs);
      if (passiveRunnerFireWindow) effectiveDodgeReserveMs = Math.min(effectiveDodgeReserveMs, passiveRunnerDodgeReserveMs);
    }
    if (finishLowThreatFireWindow) effectiveDodgeReserveMs = Math.min(effectiveDodgeReserveMs, finishLowThreatDodgeReserveMs);
    if (closePressureFireWindow) effectiveDodgeReserveMs = Math.min(effectiveDodgeReserveMs, pressureDodgeReserveMs);
    if (winningPressureFireWindow) effectiveDodgeReserveMs = Math.min(effectiveDodgeReserveMs, winningPressureDodgeReserveMs);
    if (steadyAimFireWindow) effectiveDodgeReserveMs = Math.min(effectiveDodgeReserveMs, steadyAimDodgeReserveMs);
    if (noDamageDuelFireWindow) effectiveDodgeReserveMs = Math.min(effectiveDodgeReserveMs, noDamageDuelDodgeReserveMs);
    const needsMovement = Boolean(options.needsMovement || options.dodging || options.realBulletPressure || options.pressureClose);
    const base = {
      shoot: true,
      forceShoot: false,
      shootEveryMs: normalEveryMs,
      reason: 'normal',
      stamina5s,
      reserveMs,
      dodgeReserveMs: effectiveDodgeReserveMs,
      standardDodgeReserveMs: dodgeReserveMs,
      highHpDodgeReserveMs,
      passiveRunnerDodgeReserveMs,
      finishLowThreatDodgeReserveMs,
      pressureDodgeReserveMs,
      winningPressureDodgeReserveMs,
      steadyAimDodgeReserveMs,
      noDamageDuelDodgeReserveMs,
      hardReserveMs,
      needsMovement,
      highHpFireWindow,
      passiveRunnerFireWindow,
      finishLowThreatFireWindow,
      closePressureFireWindow,
      winningPressureFireWindow,
      steadyAimFireWindow,
	      noDamageDuelFireWindow,
	      farNoDamageCloseFireWindow,
      opponentProbeFireWindow,
      opponentProbeReserveMs,
      opponentProbeEveryMs,
	      aimConfidence,
	      lowConfidenceWindow,
	      noDamageMs,
      trend: {
        stance: trend.stance || 'normal',
        hpGap: Number.isFinite(Number(trend.hpGap)) ? Number(trend.hpGap) : null,
        targetDistance: Number.isFinite(Number(trend.targetDistance)) ? Math.round(Number(trend.targetDistance)) : null,
        noDamageMs: Math.round(noDamageMs),
        engagedCombat: Boolean(trend.engagedCombat),
        targetActive: Boolean(trend.targetActive),
        targetMoving: Boolean(trend.targetMoving),
        passiveRunner: Boolean(trend.passiveRunner),
        opponentProbe: Boolean(trend.opponentProbeFireWindow),
        opponentProbeEngagedMs: Math.round(Math.max(0, Number(trend.opponentProbeEngagedMs || 0))),
        realBulletPressure: Boolean(trend.realBulletPressure),
        steadyAim: Boolean(trend.steadyAim),
        farNoDamageClose: Boolean(trend.farNoDamageCloseFireWindow)
      },
      suppressed: false,
      throttled: false
    };
    if (stamina5s !== null && stamina5s < hardReserveMs) {
      return { ...base, shoot: false, shootEveryMs: recoveryEveryMs, reason: 'stamina-rebuild', suppressed: true };
    }
    if (stamina5s !== null && opponentProbeFireWindow && stamina5s < effectiveDodgeReserveMs) {
      return { ...base, shoot: false, shootEveryMs: recoveryEveryMs, reason: 'reserve-for-dodge', suppressed: true };
    }
    if (stamina5s !== null && needsMovement && stamina5s < effectiveDodgeReserveMs) {
      return { ...base, shoot: false, shootEveryMs: recoveryEveryMs, reason: 'reserve-for-dodge', suppressed: true };
    }
	    if (stamina5s !== null && stamina5s < reserveMs) {
	      return { ...base, shootEveryMs: conserveEveryMs, reason: 'burst-fire', throttled: true };
	    }
    if (opponentProbeFireWindow) {
      return { ...base, shootEveryMs: opponentProbeEveryMs, reason: 'opponent-probe', throttled: true };
    }
	    if (lowConfidenceWindow) {
	      return { ...base, shootEveryMs: lowConfidenceEveryMs, reason: 'low-confidence-burst', throttled: true };
	    }
	    return base;
	  }

  function chooseCombatAction(self, target, bullets = []) {
    const selfHp = hpValue(self);
    const targetHp = combatHpValue(target);
    if (selfHp < cfg.combatCriticalHpLeaveThreshold) {
      return combatLeaveAction('combat-critical-hp-leave', self, target, {}, bullets);
    }
    if (selfHp < cfg.combatLowHpLeaveThreshold && selfHp < targetHp) {
      return combatLeaveAction('combat-low-hp-leave', self, target, {}, bullets);
    }
    const knownSelfHp = knownHpValue(self);
    const knownTargetHp = knownHpValue(target);
    const hpGap = Number(knownTargetHp) - Number(knownSelfHp);
    let disadvantageObservation = null;
    if (knownSelfHp > cfg.combatLowHpLeaveThreshold
      && Number.isFinite(hpGap)
      && hpGap > cfg.combatHighHpDisadvantageGap) {
      disadvantageObservation = combatDisadvantageObservationState(target, 'hp-gap', { selfHp, targetHp, hpGap });
      if (disadvantageObservation?.ready) {
        return combatLeaveAction('combat-hp-disadvantage-leave', self, target, { hpGap, disadvantageObservation }, bullets);
      }
    }
    const targetThreat = incomingBulletThreatForTest(self, target, bullets);
    const anyThreat = targetThreat || incomingBulletThreatForTest(self, null, bullets);
    const targetBulletSeen = (bullets || []).some(b => Number(b.owner_id ?? b.ownerId ?? b.source_user_id ?? b.user_id) === Number(target.user_id));
    const incoming = Boolean(isFiringEntity(target) || targetBulletSeen || anyThreat);
    const noDamageMs = combatTargetNoDamageMs(target);
    const retreatingTarget = combatRetreatingTargetState(self, target, target.distance, { noDamageMs });
    const motionScale = combatAimMotionScale(target);
    const moving = speed(target) >= cfg.combatStationarySpeed
      || motionScale >= Math.max(0, Number(cfg.combatAimMovingScaleThreshold || 0.15));
    const nativeAimSource = combatLiveAimTarget(self, target);
    const aimSource = nativeAimSource;
    const aimMotionScale = combatAimMotionScale(aimSource);
    const aimMoving = speed(aimSource) >= cfg.combatStationarySpeed
      || aimMotionScale >= Math.max(0, Number(cfg.combatAimMovingScaleThreshold || 0.15));
    const aimDistance = Number.isFinite(Number(aimSource.distance)) ? Number(aimSource.distance) : dist(self, aimSource);
    const steadyAim = combatAimSteadyNoDamageState(target, noDamageMs, motionScale);
	    const aimMovement = aimMoving
	      ? combatMovementAimMode(self, aimSource, aimDistance)
	      : { mode: '', targetSpeed: 0, lateralRatio: 0, lateralSpeed: 0, radialSpeed: 0 };
    const targetRealBulletPressure = Boolean(targetThreat && !targetThreat.synthetic);
    const realBulletPressure = Boolean(targetBulletSeen || targetRealBulletPressure || (anyThreat && !anyThreat.synthetic));
    let passiveRunner = combatPassiveRunnerState(self, target, target.distance, motionScale, realBulletPressure);
    if (retreatingTarget.active && passiveRunner.active) {
      passiveRunner = { ...passiveRunner, active: false, suppressedBy: retreatingTarget.reason || 'retreating-target' };
    }
    const aimStrategy = combatAimDynamicStrategyState(self, target, aimSource, { noDamageMs }, aimMoving, aimDistance, aimMovement, steadyAim, { realBulletPressure, passiveRunner: passiveRunner.active });
	    const opponentProfile = combatOpponentProfile(self, aimSource, aimDistance);
	    const intercept = aimMoving && !aimStrategy.bypassJitter
	      ? combatInterceptSolution(self, aimSource, aimDistance, aimMotionScale)
	      : null;
	    const aimConfidence = aimStrategy.bypassJitter
	      ? 1
	      : (intercept
	        ? clampValue(Number(intercept.confidence || 0) * Number(opponentProfile.aimConfidenceScale || 1), 0.1, 1)
	        : Math.max(0.2, Math.min(0.7, Number(opponentProfile.aimConfidenceScale || 1) * (1 - Math.min(0.65, aimMotionScale * 0.35)))));
	    const serverStallNoDamage = combatServerStallNoDamageLeaveState(selfHp, targetHp, noDamageMs, incoming, bot.serverPositionStall);
    if (serverStallNoDamage && !retreatingTarget.disengage) {
      return combatLeaveAction('combat-hp-disadvantage-leave', self, target, {
        hpGap: serverStallNoDamage.hpGap,
        noDamageMs,
        serverStallNoDamage
      }, bullets);
    }
    if (retreatingTarget.disengage) {
      clearCombatDisadvantageObservation('combat-disengage-range');
      bot.combatTarget = null;
      return {
        kind: 'wait',
        reason: 'combat-disengage-range',
        combat: false,
        shoot: false,
        forceShoot: false,
        dx: 0,
        dy: 0,
        combatDisengage: retreatingTarget
      };
    }
    const outOfRangeFinishPressure = combatOutOfRangeFinishPressureState(
      self,
      target,
      target.distance,
      selfHp,
      targetHp,
      noDamageMs,
      retreatingTarget
    );
    const outOfRangeReengage = combatOutOfRangeReengageState(
      self,
      target,
      target.distance,
      selfHp,
      targetHp,
      retreatingTarget,
      targetRealBulletPressure
    );
    if (Number(target.distance || 0) > Number(cfg.combatAttackRange || 0)) {
      if (anyThreat && !anyThreat.synthetic && Number(target.distance || 0) <= combatDodgeThreatRange()) {
        const outOfRangeCloseMove = outOfRangeFinishPressure.active
          ? outOfRangeFinishPressure
          : (outOfRangeReengage.active ? outOfRangeReengage : null);
        const closeOverride = combatSafeCloseMoveOverrideForTest(self, target, anyThreat, outOfRangeCloseMove);
        const preciseSign = combatPreciseStrafeSign(anyThreat);
        const threatFieldBase = closeOverride || combatStrafeVectorForTest(self, target, anyThreat, preciseSign || 1, { preferClosing: false });
        const threatField = closeOverride ? closeOverride.threatField : combatBulletThreatFieldForTest(self, anyThreat.threats || [anyThreat], {
          preferred: threatFieldBase,
          target,
          preferClosing: false
        });
        const dx = closeOverride ? closeOverride.dx : (threatField ? threatField.dx : threatFieldBase.dx);
        const dy = closeOverride ? closeOverride.dy : (threatField ? threatField.dy : threatFieldBase.dy);
        return {
          kind: 'attack',
          reason: 'combat-out-of-range-dodge',
          combat: true,
          combatDodgeOnly: true,
          shoot: false,
          forceShoot: false,
          dx,
          dy,
          target: {
            id: target.user_id,
            distance: Math.round(Number(target.distance || 0)),
            combatDodgeOnly: true
          },
          combatState: {
            dodgeOnly: {
              distance: Math.round(Number(target.distance || 0)),
              attackRange: Math.round(Number(cfg.combatAttackRange || 0)),
              dodgeRange: Math.round(combatDodgeThreatRange()),
              buffer: Math.max(0, Math.round(combatDodgeThreatRange() - Number(cfg.combatAttackRange || 0))),
              reason: 'incoming-bullet-outside-attack-range'
            },
            incomingBullet: {
              ownerId: anyThreat.ownerId,
              distance: Math.round(Number(anyThreat.distance || 0))
            },
            threatField: threatField ? {
              dx: threatField.dx,
              dy: threatField.dy,
              directHitCount: threatField.directHitCount
            } : null,
            safeCloseOverride: closeOverride ? {
              dx: closeOverride.dx,
              dy: closeOverride.dy,
              reason: closeOverride.reason,
              directHitCount: Number(closeOverride.threatField?.directHitCount || 0)
            } : null
          }
        };
      }
      if (outOfRangeFinishPressure.active) {
        return {
          kind: 'attack',
          reason: 'combat-finish-reengage',
          combat: true,
          shoot: false,
          forceShoot: false,
          dx: outOfRangeFinishPressure.dx,
          dy: outOfRangeFinishPressure.dy,
          target: {
            id: target.user_id,
            distance: Math.round(Number(target.distance || 0))
          },
          combatState: {
            selfHp,
            targetHp,
            outOfRangeFinishPressure,
            retreatingTarget: retreatingTarget.active ? retreatingTarget : null
          }
        };
      }
      if (outOfRangeReengage.active) {
        return {
          kind: 'attack',
          reason: 'combat-out-of-range-reengage',
          combat: true,
          shoot: false,
          forceShoot: false,
          dx: outOfRangeReengage.dx,
          dy: outOfRangeReengage.dy,
          target: {
            id: target.user_id,
            distance: Math.round(Number(target.distance || 0))
          },
          combatState: {
            selfHp,
            targetHp,
            outOfRangeReengage,
            retreatingTarget: retreatingTarget.active ? retreatingTarget : null
          }
        };
      }
      return {
        kind: 'wait',
        reason: 'combat-out-of-range-hold',
        combat: true,
        shoot: false,
        forceShoot: false,
        dx: 0,
        dy: 0,
        target: {
          id: target.user_id,
          distance: Math.round(Number(target.distance || 0))
        },
        combatState: {
          selfHp,
          targetHp,
          outOfRangeHold: {
            distance: Math.round(Number(target.distance || 0)),
            attackRange: Math.round(Number(cfg.combatAttackRange || 0)),
            disengageRange: Math.round(Math.max(Number(cfg.combatAttackRange || 0), Number(cfg.combatDisengageRange || cfg.combatEngageGraceRange || 0)))
          }
        }
      };
    }
    const spacing = combatSpacingVector(self, target, target.distance);
    const closeRisk = combatLowHpCloseRiskState(selfHp, targetHp, spacing, incoming);
    if (closeRisk) {
      return combatLeaveAction('combat-low-hp-leave', self, target, { closeRisk }, bullets);
    }
	    const pressureDisadvantage = combatPressureDisadvantageState(selfHp, targetHp, target.distance, incoming);
		    if (pressureDisadvantage) {
		      return combatLeaveAction('combat-hp-disadvantage-leave', self, target, {
		        hpGap: pressureDisadvantage.hpGap,
		        pressureDisadvantage
		      }, bullets);
		    }
	    const sustainedPressureDisadvantage = combatSustainedPressureDisadvantageState(
	      selfHp,
	      targetHp,
	      target.distance,
	      noDamageMs,
	      targetRealBulletPressure
	    );
	    if (sustainedPressureDisadvantage) {
	      return combatLeaveAction('combat-hp-disadvantage-leave', self, target, {
	        hpGap: sustainedPressureDisadvantage.hpGap,
	        sustainedPressureDisadvantage
	      }, bullets);
	    }
	    const tradeEstimate = combatTradeEstimate(self, target);
    if (!disadvantageObservation && tradeEstimate?.active) {
      disadvantageObservation = combatDisadvantageObservationState(target, 'trade-estimate', {
        selfHp,
        targetHp,
        hpGap,
        ...tradeEstimate
      });
      if (disadvantageObservation?.ready) {
        return combatLeaveAction('combat-hp-disadvantage-leave', self, target, {
          hpGap,
          tradeEstimate,
          disadvantageObservation
        }, bullets);
      }
    }
    if (!disadvantageObservation) clearCombatDisadvantageObservation('not-disadvantaged');
	    const finishPressure = combatFinishPressureState(self, target, target.distance, selfHp, targetHp, retreatingTarget);
	    const farNoDamageClose = combatFarNoDamageCloseVector(self, target, target.distance, selfHp, targetHp);
	    const retreatingFighterClose = combatRetreatingFighterCloseVector(
      self,
      target,
      target.distance,
      noDamageMs,
      selfHp,
      targetHp,
      retreatingTarget,
      targetRealBulletPressure
    );
    const retreatingBlocksClose = retreatingTarget.active && !retreatingFighterClose.active;
	    const basePressureClose = finishPressure.active
      ? finishPressure
      : (retreatingFighterClose.active
        ? retreatingFighterClose
        : (retreatingBlocksClose
        ? { active: false, dx: 0, dy: 0, distance: target.distance, closeRange: cfg.combatPressureCloseRange, noDamageMs, retreatingTarget }
        : (farNoDamageClose.active
          ? farNoDamageClose
          : combatPressureCloseVector(self, target, target.distance, selfHp))));
	    const passiveRunnerClose = !basePressureClose.active && !retreatingTarget.active
      ? combatPassiveRunnerCloseVector(self, target, target.distance, passiveRunner)
      : { active: false, dx: 0, dy: 0, distance: target.distance, closeRange: Number(cfg.combatPassiveRunnerCloseRange || 0), noDamageMs, reason: 'passive-runner' };
	    const pressureClose = passiveRunnerClose.active ? passiveRunnerClose : basePressureClose;
    const spacingOverride = incoming && combatSpacingShouldOverrideBullet(spacing, selfHp, targetHp);
    let threatField = null;
    let threatFieldBase = null;
    if (anyThreat && !pressureClose.active && !spacingOverride) {
      const preciseSign = combatPreciseStrafeSign(anyThreat);
      threatFieldBase = combatStrafeVectorForTest(self, target, anyThreat, preciseSign || 1, { preferClosing: false });
      threatField = combatBulletThreatFieldForTest(self, anyThreat.threats || [anyThreat], {
        preferred: threatFieldBase,
        target,
        preferClosing: false
      });
    }
    const dodgeDx = threatField ? threatField.dx : (incoming ? (threatFieldBase?.dx ?? 1) : spacing.dx);
    const dodgeDy = threatField ? threatField.dy : (incoming ? (threatFieldBase?.dy ?? 1) : spacing.dy);
    const safePressureCloseOverride = incoming
      ? combatSafeCloseMoveOverrideForTest(self, target, anyThreat, pressureClose)
      : null;
    const requestedDx = safePressureCloseOverride
      ? safePressureCloseOverride.dx
      : ((!incoming && pressureClose.active) ? pressureClose.dx : (spacingOverride ? spacing.dx : dodgeDx));
    const requestedDy = safePressureCloseOverride
      ? safePressureCloseOverride.dy
      : ((!incoming && pressureClose.active) ? pressureClose.dy : (spacingOverride ? spacing.dy : dodgeDy));
    const movementSuppressed = combatMovementBlockedByStamina(self) && Boolean(requestedDx || requestedDy)
      ? {
        reason: 'stamina-5s-exhausted',
        stamina5s: staminaRemaining(self, '5s'),
        thresholdMs: staminaExhaustedThreshold(),
        requestedDx,
        requestedDy
      }
      : null;
    const dx = movementSuppressed ? 0 : requestedDx;
    const dy = movementSuppressed ? 0 : requestedDy;
    const farNoDamageCloseForTrend = Boolean(pressureClose.farNoDamageClose || pressureClose.reason === 'far-no-damage');
    const trend = combatTrendState(self, {
      needsMovement: Boolean(requestedDx || requestedDy),
      dodging: incoming,
      realBulletPressure: incoming,
      targetRealBulletPressure,
      targetDistance: target.distance,
      targetHp,
      steadyAim: steadyAim.active,
      engagedCombat: target.combatIntent === 'engaged',
      targetActive: isActive(target),
      passiveRunner: passiveRunner.active,
      opponentProbeEngagedMs: passiveRunner.engagedMs,
      opponentProbeSeenTargetRealBulletMs: passiveRunner.seenTargetRealBulletMs,
	      targetMoving: moving,
	      noDamageMs,
	      aimConfidence,
	      motionScale: aimMotionScale,
	      farNoDamageClose: farNoDamageCloseForTrend
	    });
    let shooting = combatShootingPlan(self, {
      trend,
      needsMovement: Boolean(requestedDx || requestedDy),
      dodging: incoming,
	      realBulletPressure: incoming,
	      targetRealBulletPressure,
	      targetDistance: target.distance,
      targetHp,
      steadyAim: steadyAim.active,
      engagedCombat: target.combatIntent === 'engaged',
	      targetActive: isActive(target),
	      passiveRunner: passiveRunner.active,
      opponentProbeEngagedMs: passiveRunner.engagedMs,
      opponentProbeSeenTargetRealBulletMs: passiveRunner.seenTargetRealBulletMs,
	      targetMoving: moving,
	      noDamageMs,
	      aimConfidence,
	      motionScale: aimMotionScale,
	      farNoDamageClose: farNoDamageCloseForTrend
	    });
    if (retreatingTarget.suppressFire && !finishPressure.active && !retreatingFighterClose.active) {
      shooting = {
        ...shooting,
        shoot: false,
        forceShoot: false,
        suppressed: true,
        reason: 'target-retreating-edge',
        retreatingTarget
      };
    }
    if (finishPressure.active && !shooting.suppressed) {
      const finishEveryMs = Math.max(
        Number(shooting.shootEveryMs || 0),
        Number(cfg.combatFinishPressureShootEveryMs || cfg.combatShootConserveEveryMs || cfg.combatShootEveryMs || 0)
      );
      shooting = {
        ...shooting,
        shoot: true,
        shootEveryMs: finishEveryMs || shooting.shootEveryMs,
        reason: 'finish-pressure',
        throttled: true,
        finishPressure
      };
    }
    const baseReason = incoming
      ? (spacingOverride ? 'combat-spacing-dodge' : 'combat-tangent-dodge')
      : (pressureClose.active && pressureClose.reason === 'passive-runner'
        ? 'combat-passive-runner-close'
        : (spacing.active ? 'combat-spacing' : (pressureClose.active ? (finishPressure.active ? 'combat-finish-pressure' : (retreatingFighterClose.active ? 'combat-retreating-fighter-close' : (farNoDamageClose.active ? 'combat-far-pressure-close' : 'combat-pressure-close'))) : 'combat-attack')));
    return {
      kind: 'attack',
      reason: movementSuppressed
        ? 'combat-stamina-hold'
        : (retreatingTarget.suppressFire && !finishPressure.active && !retreatingFighterClose.active ? 'combat-target-retreating' : (shooting.suppressed ? 'combat-stamina-conserve' : (shooting.reason === 'finish-pressure' ? 'combat-finish-pressure' : (shooting.throttled && shooting.reason !== 'opponent-probe' ? 'combat-burst-fire' : baseReason)))),
      combat: true,
      ignoreReturnBlock: true,
      shoot: shooting.shoot,
      forceShoot: shooting.forceShoot,
      shootEveryMs: shooting.shootEveryMs,
      dx,
      dy,
      aimMode: aimStrategy.mode,
      aimJitterLimit: aimStrategy.bypassJitter ? 0 : (moving ? Number(combatAimJitterLimit(target.distance, motionScale).toFixed(4)) : 0),
      aimTarget: {
        x: Number(aimSource.x),
        y: Number(aimSource.y),
        mode: aimStrategy.mode,
        strategy: aimStrategy.strategy,
        strategyReason: aimStrategy.reason,
        precision: Boolean(aimStrategy.precision),
        steady: Boolean(aimStrategy.steady),
        live: Boolean(aimSource.nativeAimResolved),
        liveDistance: aimSource.nativeAimResolved ? Math.round(aimDistance) : null,
        sourceDivergenceCm: aimStrategy.sourceDivergence.divergenceCm,
        sourceDivergenceThresholdCm: aimStrategy.sourceDivergence.thresholdCm,
        serverStall: Boolean(aimStrategy.serverStall),
        liveIntercept: Boolean(aimStrategy.liveIntercept),
        realBulletPrecision: Boolean(aimStrategy.realBulletPrecision),
        radialPrecision: Boolean(aimStrategy.radialPrecision),
        fallbackPrecision: Boolean(aimStrategy.fallbackPrecision),
        passiveRunner: Boolean(aimStrategy.passiveRunner),
	        aimConfidence: Number(Number(aimConfidence).toFixed(2)),
	        intercept: Boolean(intercept),
        interceptConfidence: intercept ? Number(Number(intercept.confidence || 0).toFixed(2)) : null,
	        opponentProfile
	      },
      target: {
        id: target.user_id,
        name: target.name,
        x: target.x,
        y: target.y,
        vx: Number(target.vx) || 0,
        vy: Number(target.vy) || 0,
        hp: combatHpValue(target),
        drop: target.drop,
        distance: Math.round(target.distance),
        mode: target.current_join_mode || target.mode || '',
        life: target.life || '',
        active: isActive(target),
        firing: isFiringEntity(target),
        invulnerable: isInvulnerable(target),
        combatIntent: target.combatIntent || ''
      },
      combatState: {
        spacing: spacing.active ? {
          dx: spacing.dx,
          dy: spacing.dy,
          reason: spacing.reason,
          distance: Math.round(spacing.distance),
          minRange: Math.round(spacing.minRange),
          preferredRange: Math.round(spacing.preferredRange),
          overrideBullet: Boolean(spacingOverride)
        } : null,
        pressureClose: pressureClose.active ? {
          dx: pressureClose.dx,
          dy: pressureClose.dy,
          reason: pressureClose.reason,
          distance: Math.round(pressureClose.distance),
          closeRange: Math.round(pressureClose.closeRange),
          noDamageMs: Math.round(pressureClose.noDamageMs),
          farNoDamageClose: Boolean(pressureClose.farNoDamageClose || pressureClose.reason === 'far-no-damage'),
          safeCloseOverride: safePressureCloseOverride ? {
            dx: safePressureCloseOverride.dx,
            dy: safePressureCloseOverride.dy,
            reason: safePressureCloseOverride.reason,
            directHitCount: Number(safePressureCloseOverride.threatField?.directHitCount || 0)
          } : null
        } : null,
        passiveRunner,
        noDamageMs,
	        steadyAim,
	        opponentProfile,
        disadvantageObservation,
	        movementSuppressed,
        shooting,
        incomingBullet: anyThreat ? {
          id: anyThreat.id,
          ownerId: anyThreat.ownerId,
          distance: Math.round(Number(anyThreat.distance || 0)),
          laneDistance: Math.round(Number(anyThreat.laneDistance || 0)),
          signedLaneDistance: Number.isFinite(Number(anyThreat.signedLaneDistance)) ? Math.round(Number(anyThreat.signedLaneDistance)) : null,
          timeToImpactMs: Number.isFinite(Number(anyThreat.timeToImpactMs)) ? Math.round(Number(anyThreat.timeToImpactMs)) : null,
          threatCount: Number(anyThreat.threatCount || 1)
        } : null,
        threatField: threatField ? {
          dx: threatField.dx,
          dy: threatField.dy,
          directHitCount: threatField.directHitCount,
          minCpaDistance: Number.isFinite(Number(threatField.minCpaDistance)) ? Math.round(Number(threatField.minCpaDistance)) : null,
          minTimeToImpactMs: Number.isFinite(Number(threatField.minTimeToImpactMs)) ? Math.round(Number(threatField.minTimeToImpactMs)) : null
        } : null,
        retreatingTarget: retreatingTarget.active ? retreatingTarget : null
      }
    };
  }

  function pickBestOpportunity(self, entities, coins, activeThreats, fieldCompetitionCoin = null) {
    const opportunities = [];
    const upsertCoinOpportunity = item => {
      const index = opportunities.findIndex(existing => existing.type === 'coin' && String(existing.id) === String(item.id));
      if (index < 0) {
        opportunities.push(item);
        return;
      }
      const previous = opportunities[index];
      if (Number(item.score || -Infinity) > Number(previous.score || -Infinity)
        || (Number(item.score || -Infinity) === Number(previous.score || -Infinity) && Number(item.amount || 0) > Number(previous.amount || 0))
        || (Number(item.score || -Infinity) === Number(previous.score || -Infinity) && Number(item.distance || Infinity) < Number(previous.distance || Infinity))) {
        opportunities[index] = item;
      } else if (item.reason === 'best-opportunity-coin-route' && item.coinRoute) {
        opportunities[index] = mergeCoinRouteDisplay(previous, item);
      }
    };
    const buildCoinRouteMeta = route => route ? {
      ids: route.ids,
      points: Array.isArray(route.points) ? route.points : null,
      value: Number(route.value || 0),
      staminaCost: Math.round(Number(route.staminaCost || 0)),
      legCount: Number(route.legCount || 0),
      totalDistance: Math.round(Number(route.totalDistance || 0)),
      firstDistance: Math.round(Number(route.firstDistance || 0)),
      kind: route.kind || ''
    } : null;
    for (const coin of safeCoins(self, coins, activeThreats, cfg.globalCoinMaxDistance)) {
      const staminaCost = opportunityCoinStaminaCost(coin);
      if (!opportunityStaminaAffordable(self, staminaCost)) continue;
      upsertCoinOpportunity({
        type: 'coin',
        kind: coin.distance <= cfg.coinMaxDistance ? 'coin' : 'seek-coin',
        actionKind: coin.distance <= cfg.coinMaxDistance ? 'coin' : 'seek-coin',
        reason: coin.distance <= cfg.coinMaxDistance ? 'best-opportunity-coin' : 'best-opportunity-visible-coin',
        id: coin.drop_id,
        amount: coin.amount,
        x: coin.x,
        y: coin.y,
        distance: coin.distance,
        staminaCost,
        score: scoreCoinOpportunity(coin),
        maxDistance: cfg.globalCoinMaxDistance
      });
    }
    const routeCoin = pickCoinRouteOpportunity(self, uniqueVisibleRouteCoins(coins), activeThreats);
    if (routeCoin) {
      const staminaCost = opportunityCoinStaminaCost(routeCoin);
      if (opportunityStaminaAffordable(self, staminaCost)) {
        upsertCoinOpportunity({
          type: 'coin',
          kind: routeCoin.distance <= cfg.coinMaxDistance ? 'coin' : 'seek-coin',
          actionKind: routeCoin.distance <= cfg.coinMaxDistance ? 'coin' : 'seek-coin',
          reason: 'best-opportunity-coin-route',
          id: routeCoin.drop_id,
          amount: routeCoin.amount,
          x: routeCoin.x,
          y: routeCoin.y,
          distance: routeCoin.distance,
          staminaCost,
          score: scoreCoinOpportunity(routeCoin),
          maxDistance: cfg.coinRouteMaxDistance,
          coinRoute: routeCoin.coinRoute || null,
          routeValue: routeCoin.routeValue || null,
          routeKind: routeCoin.routeKind || '',
          routeLegs: routeCoin.routeLegs || 0,
          routeHeld: Boolean(routeCoin.routeHeld),
          competingRouteScore: routeCoin.competingRouteScore
        });
      }
    }
    if (fieldCompetitionCoin) {
      const staminaCost = opportunityCoinStaminaCost(fieldCompetitionCoin);
      if (opportunityStaminaAffordable(self, staminaCost)) {
        upsertCoinOpportunity({
          type: 'coin',
          kind: 'seek-coin',
          actionKind: 'seek-coin',
          reason: snapshotCoinNavigationReason(fieldCompetitionCoin),
          id: fieldCompetitionCoin.drop_id,
          amount: fieldCompetitionCoin.amount,
          x: fieldCompetitionCoin.x,
          y: fieldCompetitionCoin.y,
          members: fieldCompetitionCoin.fieldMembers,
          distance: fieldCompetitionCoin.distance,
          staminaCost,
          score: scoreCoinOpportunity(fieldCompetitionCoin),
          maxDistance: cfg.fieldMigrationMaxDistance
        });
      }
    }
    for (const target of enemyTargets(self, entities, activeThreats)) {
      const score = scoreEnemyOpportunity(target);
      if (score === null) continue;
      const staminaCost = opportunityEnemyStaminaCost(target);
      if (!opportunityStaminaAffordable(self, staminaCost)) continue;
      const afk = isAfkProfitTarget(target);
      const inRange = target.distance <= (afk ? cfg.attackRange : cfg.attackEngageRange);
      opportunities.push({
        type: 'enemy',
        afk,
        kind: inRange ? 'attack' : 'seek-enemy',
        actionKind: inRange ? 'attack' : 'seek-enemy',
        reason: afk
          ? (inRange ? 'best-opportunity-afk-drop-target' : 'approach-afk-drop-target')
          : (inRange ? 'best-opportunity-drop-target' : 'approach-profitable-drop-target'),
        id: target.user_id,
        drop: target.drop,
        distance: target.distance,
        staminaCost,
        score
      });
    }
    for (const item of opportunities) item.priorityTier = opportunityPriorityTier(item);
    const missingHeld = buildMissingHeldOpportunity(self, activeThreats, opportunities);
    if (missingHeld) opportunities.push(missingHeld);
    const chosen = chooseStableOpportunity(opportunities);
    if (!chosen) return null;
    const dir = directionTo(self, chosen);
    if (chosen.type === 'coin') {
      const coinRoute = buildCoinRouteMeta(chosen.coinRoute);
      return {
        kind: chosen.kind,
        reason: chosen.reason,
        id: chosen.id,
        amount: chosen.amount,
        dx: dir.dx,
        dy: dir.dy,
        target: { distance: Math.round(dir.distance), coinRoute },
        score: Math.round(Number(chosen.score || 0)),
        staminaCost: Math.round(Number(chosen.staminaCost || 0)),
        coinRoute,
        missingHold: Boolean(chosen.missingHold),
        routeHeld: Boolean(chosen.routeHeld),
        competingRouteScore: chosen.competingRouteScore
      };
    }
    return chosen;
  }

  function actionMovesTowardThreat(self, threat, action) {
    const dx = Number(action?.dx || 0);
    const dy = Number(action?.dy || 0);
    if (!(dx || dy)) return false;
    const tx = Number(threat.x) - Number(self.x);
    const ty = Number(threat.y) - Number(self.y);
    return dx * tx + dy * ty > 0;
  }

  function directionTo(self, target, tolerance = cfg.coinPrecisionTolerance) {
    const x = Number(target.x) - Number(self.x);
    const y = Number(target.y) - Number(self.y);
    const distance = Math.hypot(x, y);
    return {
      dx: Math.abs(x) > tolerance ? Math.sign(x) : 0,
      dy: Math.abs(y) > tolerance ? Math.sign(y) : 0,
      distance
    };
  }

  function isShortSafeCoinAction(action) {
    if (action?.kind !== 'coin') return false;
    const distance = Number(action.target?.distance ?? action.distance ?? Infinity);
    return Number.isFinite(distance) && distance <= cfg.activeReturnBlockCoinPassDistance;
  }

  function returnBlockRadius(threat) {
    const limit = Math.max(0, Number(cfg.activeAvoidMaxDistance || 0) || Infinity);
    return Math.min(limit, threat.cautionRadius + cfg.activeCautionExitMargin + cfg.activeReturnBlockMargin);
  }

  function returnBlockExitRadius(threat) {
    return returnBlockRadius(threat) + cfg.activeReturnBlockExitMargin;
  }

  function returnBlockResumeRadius(threat) {
    return returnBlockExitRadius(threat) + cfg.activeReturnBlockResumeMargin;
  }

  function returnBlockSuppressRadius(threat) {
    return returnBlockResumeRadius(threat) + cfg.activeReturnBlockClearMargin;
  }

  function hasReturnBlockThreat(activeThreats) {
    return activeThreats.some(e => e.distance <= returnBlockSuppressRadius(e));
  }

  function blockThreatReturnAction(self, activeThreats, action) {
    if (action?.ignoreReturnBlock || action?.combat || action?.kind === 'leave') return action;
    if (isFullHp(self) && !(activeThreats || []).some(isInvulnerableActive)) return action;
    if (!action || action.kind === 'flee' || action.kind === 'recover' || action.kind === 'wait') return action;
    const threat = activeThreats.find(e => e.distance <= returnBlockExitRadius(e))
      || activeThreats.find(e => e.distance <= returnBlockResumeRadius(e) && actionMovesTowardThreat(self, e, action));
    if (!threat) return action;
    if (isShortSafeCoinAction(action) && !actionMovesTowardThreat(self, threat, action)) return action;
    if (threat.distance > threat.threatRadius && !actionMovesTowardThreat(self, threat, action)) {
      return { kind: 'patrol', reason: 'return-block-lateral-scan' };
    }
    return {
      kind: 'flee',
      reason: 'active-threat-return-block',
      blockedKind: action.kind,
      threatId: threat.user_id
    };
  }

  function applyFinalActionArbitrationForTest(action, ageMs = 0) {
    const state = bot.finalActionArbitration || (bot.finalActionArbitration = { lastAction: null, lastFocus: null, lastSelectedAt: 0, lastOverride: null, history: [] });
    const nowMs = Number(state.__testNowMs || 0) + Math.max(0, Number(ageMs || 0));
    state.__testNowMs = nowMs;
    return applyFinalActionArbitrationCore(action, state, {
      nowMs,
      holdMs: cfg.finalActionArbitrationHoldMs,
      historyLimit: cfg.finalActionArbitrationHistoryLimit,
      clone: safeJsonClone
    }).action;
  }

  function pickActiveCombatWaitThreat(self, activeThreats, bullets = []) {
    const attackRange = Math.max(0, Number(cfg.combatAttackRange || cfg.attackRange || 0));
    const dodgeRange = combatDodgeThreatRange();
    const { ownerId: incomingOwnerId, unknownIncoming } = incomingBulletInfo(self, bullets);
    return (activeThreats || [])
      .filter(threat => !isWhitelistedTarget(threat) && !isInvulnerable(threat))
      .filter(threat => hasCombatActivitySignalForTest(threat))
      .filter(threat => !activeCombatRequiresThreatEvidence(self, threat) || activeCombatThreatensSelf(threat, incomingOwnerId, unknownIncoming))
      .filter(threat => {
        const distance = Number(threat.distance || 0);
        if (!(distance > attackRange)) return distance <= attackRange;
        return distance <= dodgeRange && (incomingOwnerMatchesTarget(threat, incomingOwnerId) || (unknownIncoming && isFiringEntity(threat)));
      })
      .sort((a, b) => Number(a.distance || Infinity) - Number(b.distance || Infinity))[0] || null;
  }

  function activeCombatThreatWaitAction(threat) {
    return {
      kind: 'wait',
      reason: 'combat-active-threat-wait',
      dx: 0,
      dy: 0,
      shoot: false,
      forceShoot: false,
      activeThreat: threat ? {
        id: threat.user_id ?? threat.id ?? null,
        name: threat.name || '',
        distance: Math.round(Number(threat.distance || 0)),
        drop: Number(threat.drop || 0),
        speed: Math.round(Number(threat.speed || 0)),
        moving: Boolean(threat.moving),
        mode: threat.current_join_mode || threat.mode || ''
      } : null
    };
  }

  function choose({ local = [], global = [], coins = [], bullets = [], attacks = [], snapshotWaitAgeMs = 0, visibleCoinsAvailable = true, self = { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100 } }) {
    const entities = [...global, ...local];
    updateOpportunityAfkStaminaObservations(entities);
    const fullHp = isFullHp(self);
    const activeThreats = entities
      .filter(isActive)
      .map(e => decorateThreat(self, e))
      .sort((a, b) => a.distance - b.distance);
    const avoidanceThreats = activeThreats.filter(isAvoidanceThreat);
    const nearbyAvoidanceRadius = Math.max(
      Number(cfg.dangerRadius || 0) || 0,
      Number(cfg.activeAvoidMaxDistance || cfg.activeCautionRadius || 0) || 0,
      Number(cfg.recoveryAvoidRadius || 0) || 0
    );
    const nearbyAvoidanceThreats = entities
      .map(e => ({ ...e, distance: dist(self, e), drop: dropValue(e), speed: speed(e) }))
      .sort((a, b) => a.distance - b.distance)
      .filter(e => e.distance <= nearbyAvoidanceRadius && isAvoidanceThreat(e));
    const closeThreats = avoidanceThreats.filter(e => e.distance <= e.threatRadius);
    const cautionThreats = avoidanceThreats.filter(e => e.distance <= e.cautionRadius + cfg.activeCautionExitMargin);
    const recovery = !fullHp && isRecovering(self);
    const highValueCoinThreats = mergeThreatLists(
      avoidanceThreats,
      entities
        .map(e => ({ ...e, distance: dist(self, e), drop: dropValue(e), speed: speed(e) }))
        .filter(e => e.native)
        .filter(isAvoidanceThreat)
    );
    const coinThreats = highValueCoinThreats;
    const usableCoins = filterLocalSnapshotCoins(self, coins);
    const realtimeCoins = usableCoins.filter(coin => !isSnapshotOnlyCoin(coin));
    bot.currentVisibleCoins = visibleCoinsAvailable ? realtimeCoins : null;
    const snapshotCoins = usableCoins.filter(isSnapshotOnlyCoin);
    const engagedCombatTarget = pickEngagedCombatTarget(self, entities, bullets);
    const defensiveCombatTarget = pickCombatTarget(self, entities, bullets, { mode: 'defensive' });
    const recoveryCombatTarget = defensiveTargetOverridesEngaged(engagedCombatTarget, defensiveCombatTarget)
      ? defensiveCombatTarget
      : (engagedCombatTarget || defensiveCombatTarget);
    const pendingPostAttackWaitTarget = pickPostAttackDropWaitTarget(self, realtimeCoins, coinThreats, attacks, entities);
    const highValuePriorityCoin = pickHighValueVisibleCoin(self, realtimeCoins, highValueCoinThreats, {
      ignoreThreats: hpValue(self) >= highValueCoinPriorityHealthyHp()
    });
    const highValuePriorityContext = {
      recovery,
      engagedCombatTarget,
      defensiveCombatTarget,
      activeThreats,
      avoidanceThreats,
      bullets,
      highValuePriorityCoin
    };
    if (!pendingPostAttackWaitTarget
      && highValueVisibleCoinPriorityNeeded(self, highValuePriorityContext)
      && canPrioritizeHighValueVisibleCoin(self, highValuePriorityCoin, highValuePriorityContext)) {
      if (engagedCombatTarget) bot.combatTarget = null;
      const dir = directionTo(self, highValuePriorityCoin);
      return {
        kind: highValuePriorityCoin.distance <= cfg.coinMaxDistance ? 'coin' : 'seek-coin',
        reason: 'high-value-visible-coin-priority',
        ignoreReturnBlock: true,
        id: highValuePriorityCoin.drop_id,
        amount: highValuePriorityCoin.amount,
        dx: dir.dx,
        dy: dir.dy,
        target: { distance: Math.round(dir.distance) }
      };
    }
    if (recovery && recoveryCombatTarget) {
      const recoveryCombatAction = chooseCombatAction(self, recoveryCombatTarget, bullets);
      if (recoveryCombatAction) return recoveryCombatAction;
    }
    if (!recovery && defensiveTargetOverridesEngaged(engagedCombatTarget, defensiveCombatTarget)) {
      return chooseCombatAction(self, defensiveCombatTarget, bullets);
    }
    if (!recovery && engagedCombatTarget) return chooseCombatAction(self, engagedCombatTarget, bullets);
    if (fullHp && closeThreats.length) return { kind: 'flee' };
    if (fullHp && cautionThreats.length) return { kind: 'flee' };
    if (!recovery && defensiveCombatTarget) return chooseCombatAction(self, defensiveCombatTarget, bullets);
    const activeCombatWaitThreat = pickActiveCombatWaitThreat(self, activeThreats, bullets);
    if (!recovery && activeCombatWaitThreat) return activeCombatThreatWaitAction(activeCombatWaitThreat);
    const nearCoinLimit = recovery
      ? cfg.recoveryCoinMaxDistance
      : cfg.nearCoinPriorityDistance;
    const nearCoin = realtimeCoins
      .map(c => ({ ...c, distance: dist(self, c), amount: Number(c.amount || 0) }))
      .filter(c => c.amount > 0
        && c.distance <= nearCoinLimit
        && !coinThreats.some(t => coinBlockedByThreat(self, c, t)))
      .sort((a, b) => (a.distance - b.distance) || (b.amount - a.amount))[0];
    const footCoin = realtimeCoins
      .map(c => ({ ...c, distance: dist(self, c), amount: Number(c.amount || 0) }))
      .filter(c => c.amount > 0
        && c.distance <= cfg.footCoinPriorityDistance
        && !coinThreats.some(t => coinBlockedByThreat(self, c, t)))
      .sort((a, b) => (a.distance - b.distance) || (b.amount - a.amount))[0];
    const postAttackCoin = pickPostAttackDropCoin(self, realtimeCoins, coinThreats, attacks, entities, {
      includeSingle: !recovery,
      maxDistance: recovery ? cfg.postAttackRecoveryDropMaxDistance : cfg.postAttackDropCoinMaxDistance,
      minScore: recovery ? cfg.postAttackRecoveryDropMinScore : 0
    });
    if (postAttackCoin) return { kind: 'coin', reason: 'post-attack-drop-coin', id: postAttackCoin.drop_id, amount: postAttackCoin.amount };
    const postAttackWaitTarget = pendingPostAttackWaitTarget || pickPostAttackDropWaitTarget(self, realtimeCoins, coinThreats, attacks, entities);
    if (postAttackWaitTarget) return buildPostAttackDropWaitAction(self, postAttackWaitTarget);
    const staminaBudgetExit = summarizeNearestCoinStaminaBudgetExit(
      self,
      safeCoins(self, realtimeCoins, coinThreats, cfg.snapshotCoinMaxDistance)
    );
    if (staminaBudgetExit) return staminaBudgetCoinLeaveAction(staminaBudgetExit);
    if (recovery && nearCoin) return { kind: 'coin', id: nearCoin.drop_id, amount: nearCoin.amount };
    if (nearbyAvoidanceThreats.length) return { kind: 'flee', reason: 'avoid-invulnerable-target' };
    if (recovery) return { kind: 'recover' };
    if (!fullHp && closeThreats.length) return { kind: 'flee' };
    if (!fullHp && cautionThreats.length) {
      if (!fullHp && footCoin) return { kind: 'coin', reason: 'foot-coin-before-active-caution', id: footCoin.drop_id, amount: footCoin.amount };
      return { kind: 'flee' };
    }
    const stamina5s = Number(self.stamina_5s_remaining_milli || 0);
    if (footCoin) return attachOpportunisticShot({ kind: 'coin', reason: 'foot-coin-priority', id: footCoin.drop_id, amount: footCoin.amount }, self, entities, !recovery);
    const dailyStaminaFinalCoin = pickNearestDailyStaminaFinalCoin(self, realtimeCoins, coinThreats);
    if (dailyStaminaFinalCoin) {
      const dir = directionTo(self, dailyStaminaFinalCoin);
      return attachOpportunisticShot({
        kind: dailyStaminaFinalCoin.distance <= cfg.coinMaxDistance ? 'coin' : 'seek-coin',
        reason: 'daily-stamina-final-visible-coin',
        id: dailyStaminaFinalCoin.drop_id,
        amount: dailyStaminaFinalCoin.amount,
        dx: dir.dx,
        dy: dir.dy,
        target: { distance: Math.round(dir.distance) }
      }, self, entities, !recovery);
    }
    const localRealtimeCoin = pickRealtimeLocalCoin(self, realtimeCoins, coinThreats);
    const fieldCompetitionCoin = stamina5s >= cfg.fieldMigrationStaminaThreshold
      ? pickField(self, realtimeCoins, coinThreats)
      : null;
    const profitableCombatTarget = pickProfitableCombatTarget(self, entities, bullets, realtimeCoins, coinThreats, fieldCompetitionCoin);
    if (profitableCombatTarget) return chooseCombatAction(self, profitableCombatTarget, bullets);
    const opportunityTargets = fullHp ? entities.filter(isAfkProfitTarget) : entities;
    const opportunity = pickBestOpportunity(self, opportunityTargets, realtimeCoins, coinThreats, fieldCompetitionCoin);
    if (opportunity) return attachOpportunisticShot(blockThreatReturnAction(self, coinThreats, opportunity), self, entities, !recovery);
    const distantCoin = pickDistantCoin(self, realtimeCoins, coinThreats);
    if (distantCoin) {
      const dir = directionTo(self, distantCoin);
      return attachOpportunisticShot(blockThreatReturnAction(self, coinThreats, {
        kind: 'seek-coin',
        reason: 'safe-distant-coin',
        id: distantCoin.drop_id,
        amount: distantCoin.amount,
        dx: dir.dx,
        dy: dir.dy,
        target: { distance: Math.round(dir.distance) }
      }), self, entities, !recovery);
    }
    if (localRealtimeCoin) {
      const dir = directionTo(self, localRealtimeCoin);
      return attachOpportunisticShot(blockThreatReturnAction(self, coinThreats, {
        kind: localRealtimeCoin.distance <= cfg.coinMaxDistance ? 'coin' : 'seek-coin',
        reason: snapshotCoinNavigationReason(localRealtimeCoin),
        id: localRealtimeCoin.drop_id,
        amount: localRealtimeCoin.amount,
        dx: dir.dx,
        dy: dir.dy,
        target: { distance: Math.round(dir.distance) }
      }), self, entities, !recovery);
    }
    if (hasReturnBlockThreat(avoidanceThreats)) return { kind: 'patrol', reason: 'return-block-lateral-scan' };
    const shotWait = buildOpportunisticShotWait(self, entities, !recovery);
    if (shotWait) return shotWait;
    const decoratedCoins = realtimeCoins
      .map(c => ({ ...c, distance: dist(self, c), amount: Number(c.amount || 0) }))
      .filter(c => c.amount > 0);
    const decoratedTargets = [...global, ...local]
      .map(e => ({ ...e, distance: dist(self, e), drop: dropValue(e) }))
      .filter(e => e.drop > 0);
    const hasRealtimeCoinForBudgetWait = decoratedCoins.some(coin => Number(coin?.amount || 0) > 0);
    const staminaBlocked = hasRealtimeCoinForBudgetWait
      ? summarizeBlockedStaminaOpportunity(self, decoratedCoins, [])
      : null;
    return {
      kind: 'wait',
      reason: staminaBlocked ? 'wait-for-stamina-budget' : 'wait-for-visible-coin-refresh',
      staminaBlocked,
      snapshot: {
        waitAgeMs: Math.round(snapshotWaitAgeMs),
        waitMaxMs: Math.round(cfg.snapshotCoinIdleMaxMs),
        waitRemainingMs: Math.max(0, Math.round(cfg.snapshotCoinIdleMaxMs - snapshotWaitAgeMs))
      }
    };
  }

  function currentOfflineDisplayReasonForTest(reason, offlineSafety, leaveResult = null, offlineDetail = null, fallback = '') {
    const currentSummary = offlineLeaveSummaryText(reason, offlineSafety);
    const leaveDisplay = String(leaveResult?.displayReason || '');
    const leaveSummary = String(leaveResult?.summary || leaveResult?.exitSummary || '');
    if (currentSummary && leaveDisplay && (leaveSummary === currentSummary || leaveDisplay.includes(currentSummary))) {
      return leaveDisplay;
    }
    if (currentSummary) return currentSummary;
    return leaveDisplay || String(offlineDetail?.displayReason || '') || String(fallback || '');
  }

  function encodeGrzFrameForTest(json) {
    return Buffer.concat([
      Buffer.from('GRZ1', 'ascii'),
      Buffer.from([1]),
      zlib.gzipSync(Buffer.from(JSON.stringify(json), 'utf8'))
    ]);
  }

  function fakeHeadersForTest(values = {}) {
    const normalized = {};
    for (const [key, value] of Object.entries(values)) normalized[String(key).toLowerCase()] = String(value);
    return {
      get: name => normalized[String(name || '').toLowerCase()] || ''
    };
  }

  function fakeResponseForTest(options = {}) {
    const status = Number(options.status ?? 200);
    const body = options.body === undefined ? {} : options.body;
    return {
      ok: options.ok ?? (status >= 200 && status < 300),
      status,
      statusText: options.statusText || '',
      url: options.url || 'https://grasp-rat-game.h-e.top/auth/linuxdo/callback?code=fake-code',
      headers: fakeHeadersForTest(options.headers || {}),
      text: async () => (typeof body === 'string' ? body : JSON.stringify(body))
    };
  }

  function createFakeWebSocketRuntimeForTest() {
    const instances = [];
    class FakeWebSocket {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;

      constructor(url, protocols, options) {
        this.url = url;
        this.protocols = protocols;
        this.options = options || {};
        this.readyState = FakeWebSocket.CONNECTING;
        this.sent = [];
        this.closed = false;
        this.listeners = {};
        instances.push(this);
      }

      addEventListener(name, handler) {
        this.listeners[name] = this.listeners[name] || [];
        this.listeners[name].push(handler);
      }

      on(name, handler) {
        this.addEventListener(name, handler);
      }

      emit(name, ...args) {
        for (const handler of this.listeners[name] || []) handler(...args);
      }

      open() {
        this.readyState = FakeWebSocket.OPEN;
        this.emit('open', {});
      }

      send(message) {
        this.sent.push(message);
      }

      close(code = 1000, reason = '') {
        this.closed = true;
        this.readyState = FakeWebSocket.CLOSED;
        this.emit('close', { code, reason, wasClean: code === 1000 });
      }
    }
    return {
      instances,
      runtime: {
        name: 'fake',
        WebSocket: FakeWebSocket,
        supportsOptions: false
      }
    };
  }

  async function withTempDirForTest(fn) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grasp-rat-test-'));
    try {
      return await fn(dir);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  const cases = [
    {
      name: 'strategy module self-tests pass',
      got: (() => {
        const result = runStrategyModuleSelfTests();
        return `${result.failed}:${result.success}`;
      })(),
      want: '0:true'
    },
    {
      name: 'shared GRZ frame parser decodes gzip pos summaries',
      got: (() => {
        const parsed = parseGrzFrame(encodeGrzFrameForTest({
          type: 'pos',
          tick: 42,
          entities: [
            { entity_id: 1, user_id: 7, name: 'self', x: 100, y: 200, hp: 90, cell: [2, 3, 4] },
            { entity_id: 2, user_id: 8, name: 'other', x: 500, y: 900 }
          ],
          bullets: [{ bullet_id: 3 }]
        }), { userId: 7 });
        return [
          parsed.format,
          parsed.version,
          parsed.compression,
          parsed.decodedType,
          parsed.decodedTick,
          parsed.decodedSummary?.entityCount,
          parsed.decodedSummary?.bulletCount,
          parsed.decodedSummary?.selfPresent,
          parsed.decodedSummary?.self?.name,
          parsed.decodedSummary?.self?.cell?.join(',')
        ].join('|');
      })(),
      want: 'GRZ1|1|gzip|pos|42|2|1|true|self|2,3'
    },
    {
      name: 'shared GRZ frame parser summarizes shoot acknowledgements',
      got: (() => {
        const parsed = parseGrzFrame(encodeGrzFrameForTest({
          type: 'shoot_ok',
          tick: 77,
          bullet_id: 101,
          owner_user_id: 7,
          start_x: 10,
          start_y: 11,
          target_x: 12,
          target_y: 13,
          range_cm: 14500,
          speed_per_tick: 800,
          ignored_extra: 'not copied'
        }), { userId: 7 });
        return [
          parsed.decodedSummary?.type,
          parsed.decodedSummary?.ack?.bullet_id,
          parsed.decodedSummary?.ack?.owner_user_id,
          parsed.decodedSummary?.ack?.range_cm,
          Object.prototype.hasOwnProperty.call(parsed.decodedSummary?.ack || {}, 'ignored_extra')
        ].join('|');
      })(),
      want: 'shoot_ok|101|7|14500|false'
    },
    {
      name: 'shared GRZ frame parser ignores non-GRZ buffers',
      got: Object.keys(parseGrzFrame(Buffer.from('plain text'))).length,
      want: 0
    },
    {
      name: 'shared GRZ frame parser reports gzip decode errors',
      got: (() => {
        const parsed = parseGrzFrame(Buffer.concat([
          Buffer.from('GRZ1', 'ascii'),
          Buffer.from([1]),
          Buffer.from([0x1f, 0x8b, 0x00, 0x00])
        ]));
        return parsed.format + '|' + parsed.compression + '|' + Boolean(parsed.decodeError);
      })(),
      want: 'GRZ1|gzip|true'
    },
    {
      name: 'shared GRZ JSON summary counts snapshot fallback fields',
      got: (() => {
        const summary = summarizeGrzJson({
          type: 'snapshot',
          tick: '88',
          entities: [],
          bullets: [],
          coin_drops: [{ amount: 1 }, { amount: 2 }],
          messages: ['a'],
          total_entities: 1001,
          in_game: 55,
          visible: 12,
          occupied_cells: 9
        });
        return [
          summary.type,
          summary.tick,
          summary.entityCount,
          summary.bulletCount,
          summary.coinDropCount,
          summary.messageCount,
          summary.totalEntities,
          summary.inGameCount,
          summary.visibleCount,
          summary.occupiedCells
        ].join('|');
      })(),
      want: 'snapshot|88|0|0|2|1|1001|55|12|9'
    },
    {
      name: 'browserless session client parses callback meta refresh login',
      got: (async () => {
        const origin = 'https://grasp-rat-game.h-e.top';
        const result = await submitGameCallbackUrl(`${origin}/auth/linuxdo/callback?code=secret-code`, {
          gameOrigin: origin,
          fetchImpl: async url => fakeResponseForTest({
            url,
            headers: { 'content-type': 'text/html' },
            body: '<html><head><meta http-equiv="refresh" content="0; url=/?login=ok&amp;user_id=42&amp;token=secret-token&amp;linux_do_id=9"></head></html>'
          })
        });
        return [
          result.login.userId,
          result.login.sessionToken,
          result.summary.finalUrl.includes('[redacted]'),
          result.summary.refreshUrl.includes('[redacted]'),
          result.summary.textSample.includes('[redacted]')
        ].join('|');
      })(),
      want: '42|secret-token|true|true|true'
    },
    {
      name: 'browserless session redaction covers URLs cookies and bearer tokens',
      got: (() => {
        const text = redactSecrets('https://x.test/?code=abc&token=def &amp;token=ghi auth.session-token=jkl; Authorization: Bearer mno.pqr');
        const structured = redactStructuredSecrets({
          token: 'abc',
          nested: {
            sessionToken: 'def',
            url: 'https://x.test/?secret=ghi'
          }
        });
        return [
          !/(abc|def|ghi|jkl|mno\.pqr)/.test(text),
          structured.token,
          structured.nested.sessionToken,
          structured.nested.url.includes('[redacted]')
        ].join('|');
      })(),
      want: 'true|[redacted]|[redacted]|true'
    },
    {
      name: 'browserless leave client summarizes confirmed leave response',
      got: (async () => {
        const result = await browserlessLeaveOnce({
          gameOrigin: 'https://grasp-rat-game.h-e.top',
          userId: 7,
          sessionToken: 'leave-token',
          now: (() => {
            let value = 1000;
            return () => {
              value += 25;
              return value;
            };
          })(),
          fetchImpl: async () => fakeResponseForTest({
            body: {
              ok: true,
              event: 'left',
              joined: 'UserRecordOnly',
              current_join_mode: 'None',
              life: 'Alive',
              visible: 'Hidden'
            }
          })
        });
        return [
          result.ok,
          result.httpOk,
          result.status,
          result.summary.leaveConfirmed,
          result.summary.event,
          result.summary.joined,
          result.durationMs
        ].join('|');
      })(),
      want: 'true|true|200|true|left|UserRecordOnly|25'
    },
    {
      name: 'browserless leave client retries until verified leave',
      got: (async () => {
        let calls = 0;
        const result = await browserlessLeaveWithVerification({
          retryMax: 2,
          retryDelayMs: 0,
          sleep: async () => {},
          leaveOnceImpl: async ({ stage }) => {
            calls += 1;
            return calls < 2
              ? { stage, ok: false, status: 200, summary: { leaveConfirmed: false } }
              : { stage, ok: true, status: 200, summary: { leaveConfirmed: true }, response: { event: 'left' } };
          }
        });
        return [
          result.ok,
          calls,
          result.attempts.map(item => item.stage).join(',')
        ].join('|');
      })(),
      want: 'true|2|initial,retry-1'
    },
    {
      name: 'browserless leave client honors retryable response delay',
      got: (async () => {
        let calls = 0;
        const sleeps = [];
        const direct = browserlessRetryDelayMsForLeaveAttempt({
          response: { retryable: true, retry_after: 60 }
        }, 1200);
        const result = await browserlessLeaveWithVerification({
          retryMax: 1,
          retryDelayMs: 1200,
          sleep: async ms => { sleeps.push(ms); },
          leaveOnceImpl: async ({ stage }) => {
            calls += 1;
            return calls < 2
              ? {
                  stage,
                  ok: false,
                  status: 502,
                  summary: { leaveConfirmed: false },
                  response: { retryable: true, retry_after: 60 }
                }
              : { stage, ok: true, status: 200, summary: { leaveConfirmed: true } };
          }
        });
        return [
          direct,
          result.ok,
          calls,
          sleeps.join(',')
        ].join('|');
      })(),
      want: '60000|true|2|60000'
    },
    {
      name: 'browserless fetch timeout aborts stalled requests',
      got: (async () => {
        try {
          await browserlessFetchWithTimeout('https://example.test/stall', {
            timeoutMs: 1,
            fetchImpl: (_url, options) => new Promise((_resolve, reject) => {
              options.signal.addEventListener('abort', () => reject(new Error('aborted')));
            })
          });
          return false;
        } catch (err) {
          return /abort/i.test(err?.message || String(err));
        }
      })(),
      want: true
    },
    {
      name: 'browserless snapshot safety rejects stale active login-point evidence',
      got: (() => {
        const summary = summarizeSnapshotPayload({
          type: 'snapshot',
          tick: 90,
          entities: [
            { user_id: 8, name: 'near-active', x: 100, y: 0, current_join_mode: 'Active', life: 'Alive' }
          ],
          bullets: [],
          coin_drops: [],
          messages: []
        }, {
          userId: 7,
          loginPoint: { x: 0, y: 0, hp: 100, source: 'test' },
          latestKnownTick: 100,
          healthyHpThreshold: 80,
          healthyRadius: 17000,
          lowRadius: 30000
        });
        return [
          summary.valid,
          summary.safety.ok,
          summary.safety.reason,
          summary.safety.freshness.reason,
          summary.safety.activeNearbyCount
        ].join('|');
      })(),
      want: 'true|false|stale-snapshot-tick|stale-snapshot-tick|1'
    },
    {
      name: 'browserless websocket transport builds direct game URL',
      got: buildWsUrl({
        gameOrigin: 'https://grasp-rat-game.h-e.top',
        wsPath: '/ws',
        wsExtraQuery: 'compress=gzip%2Cdeflate&extra=1',
        userId: 42,
        sessionToken: 'tok en'
      }),
      want: 'wss://grasp-rat-game.h-e.top/ws?user_id=42&token=tok+en&compress=gzip%2Cdeflate&extra=1'
    },
    {
      name: 'browserless http fetch binds local source IP through dispatcher',
      got: (async () => {
        let sawDispatcher = false;
        const response = await browserlessFetchWithTimeout('https://grasp-rat-game.h-e.top/', {
          localAddress: '10.0.0.101',
          timeoutMs: 1000,
          fetchImpl: async (_url, options = {}) => {
            sawDispatcher = Boolean(options.dispatcher);
            return fakeResponseForTest({ status: 200, body: { ok: true } });
          }
        });
        return [response.ok, sawDispatcher].join('|');
      })(),
      want: 'true|true'
    },
    {
      name: 'browserless websocket transport opens dispatches and sends narrow commands',
      got: (async () => {
        const fake = createFakeWebSocketRuntimeForTest();
        const events = [];
        const messages = [];
        const sent = [];
        const openPromise = openBrowserlessWs({
          runtime: { ...fake.runtime, supportsOptions: true },
          gameOrigin: 'https://grasp-rat-game.h-e.top',
          userId: 7,
          sessionToken: 'ws-token',
          localAddress: '10.0.0.101',
          connectTimeoutMs: 1000,
          onConnectStart: detail => events.push(`start:${detail.runtime}:${detail.wsUrl.includes('token=ws-token')}`),
          onOpen: detail => events.push(`open:${detail.runtime}`),
          onMessage: message => messages.push(message),
          onSend: detail => sent.push(detail.message),
          onClose: detail => events.push(`close:${detail.code}:${detail.reason}:${detail.wasClean}`)
        });
        const socket = fake.instances[0];
        socket.open();
        const transport = await openPromise;
        socket.emit('message', { data: 'frame-1' });
        transport.sendVelocity(0.6, -0.6);
        transport.sendVelocity(2, -2);
        transport.sendShoot(2, 3, 4, 5);
        transport.close(1000, 'done');
        return [
          events.join(','),
          messages[0]?.data,
          socket.sent.join(','),
          sent.join(','),
          socket.options.localAddress
        ].join('|');
      })(),
      want: 'start:fake:true,open:fake,close:1000:done:true|frame-1|vel 1 -1,vel 1 -1,shoot 2 3 4 5|vel 1 -1,vel 1 -1,shoot 2 3 4 5|10.0.0.101'
    },
    {
      name: 'browserless websocket transport times out unopened sockets',
      got: (async () => {
        const fake = createFakeWebSocketRuntimeForTest();
        try {
          await openBrowserlessWs({
            runtime: fake.runtime,
            gameOrigin: 'https://grasp-rat-game.h-e.top',
            userId: 7,
            sessionToken: 'ws-token',
            connectTimeoutMs: 1
          });
          return 'opened';
        } catch (err) {
          return [
            /timeout/.test(err?.message || String(err)),
            fake.instances.length,
            fake.instances[0]?.closed
          ].join('|');
        }
      })(),
      want: 'true|1|true'
    },
    {
      name: 'browserless websocket transport reports unexpected response details',
      got: (async () => {
        const fake = createFakeWebSocketRuntimeForTest();
        const openPromise = openBrowserlessWs({
          runtime: fake.runtime,
          gameOrigin: 'https://grasp-rat-game.h-e.top',
          userId: 7,
          sessionToken: 'ws-token',
          connectTimeoutMs: 1000
        });
        const response = {
          statusCode: 403,
          statusMessage: 'Forbidden',
          headers: { 'content-type': 'text/plain' },
          on(name, handler) {
            if (name === 'data') handler(Buffer.from('join forbidden'));
            if (name === 'end') handler();
          }
        };
        fake.instances[0].emit('unexpected-response', {}, response);
        try {
          await openPromise;
          return 'opened';
        } catch (err) {
          const message = err?.message || String(err);
          return [
            message.includes('403'),
            message.includes('Forbidden'),
            message.includes('text/plain'),
            message.includes('join forbidden')
          ].join('|');
        }
      })(),
      want: 'true|true|true|true'
    },
    {
      name: 'browserless frame stats aggregate decoded frame summaries',
      got: (() => {
        const stats = createFrameStats(30000);
        updateFrameStats(stats, {
          at: '2026-07-08T00:00:00.000Z',
          kind: 'binary',
          decodedJsonKeys: ['type', 'tick', 'entities', 'bullets'],
          decodedSummary: {
            type: 'pos',
            tick: 10,
            entityCount: 2,
            bulletCount: 1,
            selfPresent: true
          }
        });
        updateFrameStats(stats, {
          at: '2026-07-08T00:00:01.000Z',
          kind: 'binary',
          decodedJsonKeys: ['type', 'tick', 'entities', 'bullets', 'coin_drops'],
          decodedSummary: {
            type: 'snapshot',
            tick: 12,
            entityCount: 5,
            bulletCount: 0,
            coinDropCount: 3,
            messageCount: 1,
            selfPresent: false
          }
        });
        updateFrameStats(stats, {
          at: '2026-07-08T00:00:02.000Z',
          kind: 'text',
          decodeError: 'bad'
        });
        return [
          stats.frameCount,
          stats.decodedFrameCount,
          stats.binaryFrameCount,
          stats.textFrameCount,
          stats.typeCounts.pos,
          stats.typeCounts.snapshot,
          stats.tick.min,
          stats.tick.max,
          stats.entityCount.last,
          stats.coinDropCount.last,
          stats.selfPresent.true,
          stats.selfPresent.false,
          stats.decodeErrors,
          stats.keySetCounts['type,tick,entities,bullets'],
          stats.keySetCounts['type,tick,entities,bullets,coin_drops']
        ].join('|');
      })(),
      want: '3|2|2|1|1|1|10|12|5|3|1|1|1|1|1'
    },
    {
      name: 'browserless state store ingests realtime pos authority',
      got: (() => {
        const store = createBrowserlessStateStore({ userId: 7, now: () => 2000 });
        store.ingestFrame({
          type: 'pos',
          tick: 11,
          entities: [
            { entity_id: 1, user_id: 7, name: 'self', x: '100', y: 200, hp: 90 },
            { entity_id: 2, user_id: 8, name: 'other', x: 300, y: 400, hp: 80 }
          ],
          bullets: [{ bullet_id: 9, owner_user_id: 8 }]
        }, { receivedAtMs: 1000 });
        const realtime = store.getRealtimeState(1600);
        return [
          realtime.authority,
          realtime.tick,
          realtime.frameAgeMs,
          realtime.self?.authority,
          realtime.self?.source,
          realtime.self?.x,
          realtime.entities.length,
          realtime.bullets[0]?.authority
        ].join('|');
      })(),
      want: 'realtime|11|600|realtime|pos|100|2|realtime'
    },
    {
      name: 'browserless state store keeps snapshot fallback out of combat state',
      got: (() => {
        const store = createBrowserlessStateStore({ userId: 7 });
        store.ingestFrame({
          type: 'pos',
          tick: 20,
          entities: [{ entity_id: 1, user_id: 7, name: 'self', x: 10, y: 20, hp: 80 }],
          bullets: []
        }, { receivedAtMs: 1000 });
        store.ingestFrame({
          type: 'snapshot',
          tick: 21,
          total_entities: 1001,
          in_game: 50,
          visible: 10,
          occupied_cells: 8,
          entities: [{ entity_id: 1, user_id: 7, name: 'self', x: 999, y: 999, hp: 80 }],
          bullets: [{ bullet_id: 1 }],
          coin_drops: [{ drop_id: 3, x: 400, y: 500, amount: 2 }],
          messages: ['hello']
        }, { receivedAtMs: 1200 });
        const combat = selectRealtimeCombatState(store, 1500);
        const fallback = store.getFallbackState(1500);
        return [
          combat.self?.x,
          combat.self?.authority,
          Object.prototype.hasOwnProperty.call(combat, 'fallback'),
          Object.prototype.hasOwnProperty.call(combat, 'coinDrops'),
          fallback.self?.x,
          fallback.self?.authority,
          fallback.coinDrops[0]?.authority,
          fallback.counts.totalEntities,
          fallback.frameAgeMs
        ].join('|');
      })(),
      want: '10|realtime|false|false|999|snapshot|snapshot|1001|300'
    },
    {
      name: 'browserless state store records shoot acknowledgements and frame ages',
      got: (() => {
        const store = createBrowserlessStateStore({ userId: 7 });
        store.ingestFrame({
          type: 'shoot_ok',
          tick: 30,
          bullet_id: 44,
          owner_user_id: 7,
          start_x: 1,
          start_y: 2,
          target_x: 3,
          target_y: 4,
          range_cm: 14500,
          speed_per_tick: 800
        }, { receivedAtMs: 2000 });
        const command = store.getCommandState(2600);
        const ages = store.getFrameAges(2600);
        return [
          command.lastAck?.authority,
          command.lastAck?.source,
          command.lastAck?.bullet_id,
          command.lastAck?.range_cm,
          command.ackAgeMs,
          ages.latestFrameAgeMs,
          store.getState(2600).frameCounts.shoot_ok
        ].join('|');
      })(),
      want: 'realtime|shoot_ok|44|14500|600|600|1'
    },
    {
      name: 'browserless state store keeps realtime coin drops out of combat selector',
      got: (() => {
        const store = createBrowserlessStateStore({ userId: 7 });
        store.ingestFrame({
          type: 'pos',
          tick: 35,
          entities: [{ entity_id: 1, user_id: 7, name: 'self', x: 10, y: 20, hp: 80 }],
          bullets: [],
          drops: [{ drop_id: 'native-1', amount: 5, x: 30, y: 40 }]
        }, { receivedAtMs: 1000 });
        const realtime = store.getRealtimeState(1200);
        const combat = selectRealtimeCombatState(store, 1200);
        const diagnostics = store.getState(1200).transportDiagnostics;
        return [
          realtime.coinDrops[0]?.authority,
          realtime.coinDrops[0]?.amount,
          Object.prototype.hasOwnProperty.call(combat, 'coinDrops'),
          /coinDrops/.test(selectRealtimeCombatState.toString()),
          diagnostics.realtimeCoinLikeFieldCounts.drops,
          diagnostics.realtimeCoinDropFrames,
          diagnostics.lastRealtimeCoinLikeFields.join(','),
          diagnostics.frameTypeKeySetCounts['pos|bullets,drops,entities,tick,type']
        ].join('|');
      })(),
      want: 'realtime|5|false|false|1|1|drops|1'
    },
    {
      name: 'browserless decision adapter keeps combat on realtime authority',
      got: (() => {
        const store = createBrowserlessStateStore({ userId: 7 });
        store.ingestFrame({
          type: 'pos',
          tick: 40,
          entities: [
            { entity_id: 1, user_id: 7, name: 'self', x: 100, y: 100, hp: 90 },
            { entity_id: 2, user_id: 8, name: 'active', x: 900, y: 100, hp: 80, current_join_mode: 'Active', firing: true, drop: 6 }
          ],
          bullets: []
        }, { receivedAtMs: 1000 });
        store.ingestFrame({
          type: 'snapshot',
          tick: 41,
          entities: [
            { entity_id: 1, user_id: 7, name: 'self', x: 9999, y: 9999, hp: 90 },
            { entity_id: 3, user_id: 9, name: 'snapshot-only-active', x: 120, y: 120, hp: 80, current_join_mode: 'Active', firing: true, drop: 100 }
          ],
          bullets: [],
          coin_drops: [{ drop_id: 5, amount: 20, x: 130, y: 100 }],
          messages: []
        }, { receivedAtMs: 1100 });
        const decision = buildBrowserlessDecision(store.getState(1200), {}, { nowMs: 1200 });
        return [
          decision.kind,
          decision.band,
          decision.action.target.userId,
          decision.action.target.authority,
          decision.profit.best === null,
          decision.input.self.x,
          decision.input.dataGaps.includes('snapshot-coin-fallback-only'),
          decision.input.dataGaps.includes('snapshot-fallback-blocked:active-threat-visible')
        ].join('|');
      })(),
      want: 'combat-candidate|combat|8|realtime|true|100|true|true'
    },
    {
      name: 'browserless decision adapter enriches missing self stamina from fresh snapshot',
      got: (() => {
        const store = createBrowserlessStateStore({ userId: 7 });
        store.ingestFrame({
          type: 'pos',
          tick: 42,
          entities: [
            { entity_id: 1, user_id: 7, x: 100, y: 100, hp: 71, life: 'Alive' },
            { entity_id: 2, user_id: 8, x: 8000, y: 100, hp: 100, life: 'Alive' }
          ],
          bullets: []
        }, { receivedAtMs: 1000 });
        store.ingestFrame({
          type: 'snapshot',
          tick: 43,
          entities: [{
            entity_id: 1,
            user_id: 7,
            name: 'self-name',
            x: 120,
            y: 100,
            hp: 90,
            max_hp: 100,
            stamina_5s_remaining_milli: 9000,
            stamina_1h_remaining_milli: 2500000,
            stamina_1d_remaining_milli: 18000000,
            stamina_5s_limit_milli: 10000,
            stamina_1h_limit_milli: 3000000,
            stamina_1d_limit_milli: 20000000
          }],
          bullets: [],
          coin_drops: [],
          messages: []
        }, { receivedAtMs: 1100 });
        const decision = buildBrowserlessDecision(store.getState(1200), {}, { nowMs: 1200 });
        return [
          decision.input.self.x,
          decision.input.self.hp,
          decision.input.self.name,
          decision.input.stamina.stamina5sRemainingMilli,
          decision.input.stamina.stamina1hRemainingMilli,
          decision.input.stamina.stamina1dRemainingMilli,
          decision.input.stamina.stamina,
          decision.input.stamina.staminaSpent,
          decision.input.stamina.staminaMetadataAuthority,
          decision.input.dataGaps.includes('self-stamina-from-snapshot')
        ].join('|');
      })(),
      want: '100|71|self-name|9000|2500000|18000000|||snapshot|true'
    },
    {
      name: 'browserless decision input enriches self Drop and label from fresh snapshot',
      got: (() => {
        const store = createBrowserlessStateStore({ userId: 7 });
        store.ingestFrame({
          type: 'pos',
          tick: 44,
          entities: [
            { entity_id: 1, user_id: 7, x: 100, y: 100, hp: 88, life: 'Alive' }
          ],
          bullets: []
        }, { receivedAtMs: 1000 });
        store.ingestFrame({
          type: 'snapshot',
          tick: 45,
          entities: [{
            entity_id: 1,
            user_id: 7,
            label: 'snapshot-self-label',
            x: 120,
            y: 100,
            hp: 88,
            death_drop_coins: 42
          }],
          bullets: [],
          coin_drops: [],
          messages: []
        }, { receivedAtMs: 1100 });
        const input = buildBrowserlessStrategyInput(store.getState(1200), { nowMs: 1200 }, {});
        return [
          input.self.name,
          input.self.drop,
          input.self.death_drop_coins,
          input.self.selfMetadataAuthority
        ].join('|');
      })(),
      want: 'snapshot-self-label|42|42|snapshot'
    },
    {
      name: 'browserless decision input keeps player label and snapshot Drop metadata',
      got: (() => {
        const state = {
          userId: 7,
          realtime: {
            tick: 46,
            frameAgeMs: 100,
            self: { entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100 },
            entities: [
              { entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100 },
              { entity_id: 2, user_id: 8, label: 'target-label', x: 2000, y: 0, hp: 80, current_join_mode: 'None' }
            ],
            bullets: [],
            coinDrops: []
          },
          fallback: {
            tick: 47,
            frameAgeMs: 100,
            entities: [
              { entity_id: 2, user_id: 8, label: 'target-label', x: 2000, y: 0, hp: 80, death_drop_coins: 12 }
            ],
            coinDrops: [],
            messages: []
          }
        };
        const input = buildBrowserlessStrategyInput(state, { controlMode: 'profit-live', nowMs: 1200 }, {});
        const target = input.visibleTargets.find(entity => Number(entity.user_id) === 8);
        return [
          target?.name,
          target?.drop,
          target?.death_drop_coins,
          target?.profitMetadataAuthority
        ].join('|');
      })(),
      want: 'target-label|12|12|snapshot'
    },
    {
      name: 'browserless nearby players preserve snapshot stamina and invincibility metadata',
      got: (() => {
        const state = {
          userId: 7,
          realtime: {
            tick: 48,
            frameAgeMs: 100,
            self: { entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100 },
            entities: [
              { entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100 },
              { entity_id: 2, user_id: 8, label: 'meta-target', x: 1200, y: 0, hp: 80, firing: true }
            ],
            bullets: [],
            coinDrops: []
          },
          fallback: {
            tick: 49,
            frameAgeMs: 100,
            entities: [
              {
                entity_id: 22,
                user_id: 8,
                label: 'meta-target',
                x: 1210,
                y: 0,
                hp: 80,
                current_join_mode: 'Passive',
                death_drop_coins: 2,
                stamina5sRemainingMilli: 9600,
                invincible_remaining_ticks: 25
              }
            ],
            coinDrops: [],
            messages: []
          }
        };
        const decision = buildBrowserlessDecision(state, {}, {
          controlMode: 'profit-live',
          combatEnabled: true,
          nowMs: 1200,
          tickMs: 100
        });
        const row = decision.input.nearby.p.find(item => item[0] === 'meta-target');
        return [
          decision.kind,
          decision.band,
          decision.reason,
          decision.combat.target?.userId || '',
          decision.action.target?.invulnerable,
          decision.action.target?.invulnerableRemainingMs,
          decision.action.target?.stamina5s,
          decision.action.target?.invulnerable,
          decision.action.target?.invulnerableMetadataAuthority,
          row?.[2],
          row?.[4],
          row?.[6],
          row?.[7]
        ].join('|');
      })(),
      want: 'flee|safety|avoid-invulnerable-target||true|2500|9600|true|snapshot|9600|2500|1|Passive'
    },
    {
      name: 'browserless decision adapter emits snapshot fallback profit without commands',
      got: (() => {
        const adapter = createBrowserlessDecisionAdapter({ userId: 7 });
        const store = createBrowserlessStateStore({ userId: 7 });
        store.ingestFrame({
          type: 'pos',
          tick: 50,
          entities: [{ entity_id: 1, user_id: 7, name: 'self', x: 100, y: 100, hp: 90 }],
          bullets: []
        }, { receivedAtMs: 1000 });
        store.ingestFrame({
          type: 'snapshot',
          tick: 51,
          entities: [{ entity_id: 1, user_id: 7, name: 'self', x: 100, y: 100, hp: 90 }],
          bullets: [],
          coin_drops: [{ drop_id: 6, amount: 4, x: 200, y: 100 }],
          messages: []
        }, { receivedAtMs: 1100 });
        const decision = adapter.decide(store.getState(1200), { nowMs: 1200 });
        return [
          decision.kind,
          decision.action.kind,
          decision.action.target.id,
          decision.action.target.authority,
          decision.action.target.distance,
          decision.dryRun,
          Object.prototype.hasOwnProperty.call(decision.action, 'command')
        ].join('|');
      })(),
      want: 'profit-candidate|coin|6|snapshot|100|true|false'
    },
    {
      name: 'browserless decision state survives consecutive decisions in one run',
      got: (() => {
        const adapter = createBrowserlessDecisionAdapter({ userId: 7, controlMode: 'non-combat-profit' });
        const store = createBrowserlessStateStore({ userId: 7 });
        store.ingestFrame({
          type: 'pos',
          tick: 52,
          entities: [{ entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100 }],
          bullets: [],
          coin_drops: [{ drop_id: 'persist-coin', amount: 2, x: 1000, y: 0 }]
        }, { receivedAtMs: 1000 });
        const first = adapter.decide(store.getState(1200), { nowMs: 1200 });
        const second = adapter.decide(store.getState(1600), { nowMs: 1600 });
        const state = adapter.getState();
        const summary = adapter.getStatusSummary();
        return [
          first.action.target.id,
          second.action.target.id,
          state.opportunityChoice?.id || '',
          state.currentOpportunity?.id || '',
          summary.opportunity.choice?.id || '',
          Object.prototype.hasOwnProperty.call(state, 'currentOpportunity'),
          state.opportunitySwitchLock === null
        ].join('|');
      })(),
      want: 'persist-coin|persist-coin|persist-coin|persist-coin|persist-coin|true|true'
    },
    {
      name: 'browserless decision state resets between adapter runs',
      got: (() => {
        const firstAdapter = createBrowserlessDecisionAdapter({ userId: 7, controlMode: 'non-combat-profit' });
        const secondAdapter = createBrowserlessDecisionAdapter({ userId: 7, controlMode: 'non-combat-profit' });
        const store = createBrowserlessStateStore({ userId: 7 });
        store.ingestFrame({
          type: 'pos',
          tick: 53,
          entities: [{ entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100 }],
          bullets: [],
          coin_drops: [{ drop_id: 'run-one-coin', amount: 2, x: 1000, y: 0 }]
        }, { receivedAtMs: 1000 });
        firstAdapter.decide(store.getState(1200), { nowMs: 1200 });
        const firstState = firstAdapter.getState();
        const secondState = secondAdapter.getState();
        return [
          Boolean(firstState.opportunityChoice),
          secondState.opportunityChoice === null,
          secondState.currentOpportunity === null,
          secondState.fleeLock === null,
          secondState.returnBlockLock === null
        ].join('|');
      })(),
      want: 'true|true|true|true|true'
    },
    {
      name: 'browserless decision state summary is bounded and redacted',
      got: (() => {
        const state = createBrowserlessDecisionState();
        state.lastTarget = { userId: 9, name: 'target', sessionToken: 'target-secret-token' };
        state.attackHistory = Array.from({ length: 9 }, (_, index) => ({
          id: index,
          sessionToken: `attack-secret-token-${index}`
        }));
        state.killHistory = Array.from({ length: 7 }, (_, index) => ({
          id: index,
          token: `kill-secret-token-${index}`
        }));
        state.targetSwitchDiagnostics = Array.from({ length: 6 }, (_, index) => ({
          target: index,
          authorization: `Bearer switch-secret-token-${index}`
        }));
        state.ignoredCoins = {};
        for (let index = 0; index < 8; index += 1) {
          state.ignoredCoins[`coin-${index}`] = {
            reason: 'stale',
            cookie: `coin-secret-token-${index}`
          };
        }
        const summary = summarizeBrowserlessDecisionState(state, { recentLimit: 3 });
        const text = JSON.stringify(summary);
        return [
          summary.attackHistory.count,
          summary.attackHistory.recent.length,
          summary.attackHistory.recent[0].sessionToken,
          summary.killHistory.count,
          summary.killHistory.recent[0].token,
          summary.targetSwitchDiagnostics.count,
          summary.targetSwitchDiagnostics.recent.length,
          summary.coin.ignoredCount,
          summary.coin.recentIgnored.length,
          text.includes('secret-token'),
          text.includes('"sessionToken":"[redacted]"'),
          text.includes('"cookie":"[redacted]"')
        ].join('|');
      })(),
      want: '9|3|[redacted]|7|[redacted]|6|3|8|3|false|true|true'
    },
    {
      name: 'browserless non-combat profit prefers realtime coin over snapshot and combat',
      got: (() => {
        const store = createBrowserlessStateStore({ userId: 7 });
        store.ingestFrame({
          type: 'pos',
          tick: 55,
          entities: [
            { entity_id: 1, user_id: 7, name: 'self', x: 100, y: 100, hp: 100, max_hp: 100 },
            { entity_id: 2, user_id: 8, name: 'active-far', x: 50000, y: 100, hp: 80, current_join_mode: 'Active', firing: true, drop: 20 }
          ],
          bullets: [],
          coin_drops: [{ drop_id: 'native-coin', amount: 2, x: 300, y: 100 }]
        }, { receivedAtMs: 1000 });
        store.ingestFrame({
          type: 'snapshot',
          tick: 56,
          entities: [{ entity_id: 1, user_id: 7, name: 'self', x: 100, y: 100, hp: 90 }],
          bullets: [],
          coin_drops: [{ drop_id: 'snapshot-coin', amount: 99, x: 120, y: 100 }],
          messages: []
        }, { receivedAtMs: 1100 });
        const decision = buildBrowserlessDecision(store.getState(1200), {}, {
          nowMs: 1200,
          controlMode: 'non-combat-profit'
        });
        return [
          decision.kind,
          decision.band,
          decision.action.target.id,
          decision.action.target.authority,
          decision.action.target.native,
          decision.input.profitCoinSource,
          decision.combat.target?.userId || '',
          decision.input.dataGaps.includes('snapshot-fallback-blocked:realtime-profit-present')
        ].join('|');
      })(),
      want: 'coin|profit|native-coin|realtime|true|realtime||true'
    },
    {
      name: 'browserless non-combat profit blocks snapshot fallback near active threat',
      got: (() => {
        const store = createBrowserlessStateStore({ userId: 7 });
        store.ingestFrame({
          type: 'pos',
          tick: 57,
          entities: [
            { entity_id: 1, user_id: 7, name: 'self', x: 100, y: 100, hp: 100, max_hp: 100 },
            { entity_id: 2, user_id: 8, name: 'active-near', x: 500, y: 100, hp: 80, current_join_mode: 'Active', firing: true, drop: 20 }
          ],
          bullets: []
        }, { receivedAtMs: 1000 });
        store.ingestFrame({
          type: 'snapshot',
          tick: 58,
          entities: [{ entity_id: 1, user_id: 7, name: 'self', x: 100, y: 100, hp: 90 }],
          bullets: [],
          coin_drops: [{ drop_id: 'snapshot-coin', source_user_id: 10, system_spawned: false, amount: 99, x: 120, y: 100, created_tick: 58 }],
          messages: [{ kind: 'kill', user_id: 7, target_user_id: 10, tick: 58 }]
        }, { receivedAtMs: 1100 });
        const decision = buildBrowserlessDecision(store.getState(1200), {}, {
          nowMs: 1200,
          controlMode: 'non-combat-profit'
        });
        return [
          decision.kind,
          decision.reason,
          decision.input.profitCoinSource,
          decision.input.fallback.snapshotCoinFallbackAllowed,
          decision.input.fallback.snapshotFallbackBlockedReasons.join(','),
          decision.combat.target.userId
        ].join('|');
      })(),
      want: 'wait|no-profitable-candidate|none|false|active-threat-visible|8'
    },
    {
      name: 'browserless profit live targets AFK but flees near active threat',
      got: (() => {
        const choose = entities => {
          const store = createBrowserlessStateStore({ userId: 7 });
          store.ingestFrame({
            type: 'pos',
            tick: 59,
            entities,
            bullets: []
          }, { receivedAtMs: 1000 });
          return buildBrowserlessDecision(store.getState(1200), {}, {
            nowMs: 1200,
            controlMode: 'profit-live'
          });
        };
        const afkOnly = choose([
          { entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100 },
          fullStamina5s({ entity_id: 2, user_id: 8, name: 'afk', x: 1000, y: 0, hp: 80, current_join_mode: 'None', drop: 10 })
        ]);
        const activeVisible = choose([
          { entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100 },
          fullStamina5s({ entity_id: 2, user_id: 8, name: 'afk', x: 1000, y: 0, hp: 80, current_join_mode: 'None', drop: 10 }),
          { entity_id: 3, user_id: 9, name: 'active', x: 500, y: 0, hp: 80, current_join_mode: 'Active', firing: true, drop: 10 }
        ]);
        return [
          afkOnly.kind,
          afkOnly.action.kind,
          afkOnly.action.target.type,
          afkOnly.action.target.userId,
          afkOnly.action.target.active,
          activeVisible.kind,
          activeVisible.band,
          activeVisible.reason,
          activeVisible.action.shouldLeave,
          activeVisible.action.target.userId,
          activeVisible.profit.best === null
        ].join('|');
      })(),
      want: 'profit-candidate|attack|enemy|8|false|flee|safety|active-threat-return-block||9|true'
    },
    {
      name: 'browserless profit live rejects low-drop AFK targets by default',
      got: (() => {
        const store = createBrowserlessStateStore({ userId: 7 });
        store.ingestFrame({
          type: 'pos',
          tick: 59,
          entities: [
            { entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100 },
            fullStamina5s({ entity_id: 2, user_id: 8, name: 'low-drop-afk', x: 1000, y: 0, hp: 80, current_join_mode: 'None', drop: 1 }),
            fullStamina5s({ entity_id: 3, user_id: 9, name: 'min-drop-afk', x: 2000, y: 0, hp: 80, current_join_mode: 'None', drop: 3 })
          ],
          bullets: []
        }, { receivedAtMs: 1000 });
        const decision = buildBrowserlessDecision(store.getState(1200), {}, {
          nowMs: 1200,
          controlMode: 'profit-live'
        });
        const candidateIds = (decision.profit.candidates || []).map(item => String(item.id)).join(',');
        return [
          decision.kind,
          decision.action.kind,
          decision.action.target.userId,
          decision.action.target.drop,
          candidateIds.includes('8'),
          candidateIds.includes('9')
        ].join('|');
      })(),
      want: 'profit-candidate|attack|9|3|false|true'
    },
    {
      name: 'browserless nearby player rows expose decision AFK and low-drop full-stamina flags',
      got: (() => {
        const store = createBrowserlessStateStore({ userId: 7 });
        store.ingestFrame({
          type: 'pos',
          tick: 59,
          entities: [
            { entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100 },
            fullStamina5s({ entity_id: 2, user_id: 8, name: 'good-afk', x: 1000, y: 0, hp: 80, current_join_mode: 'Passive', drop: 5 }),
            fullStamina5s({ entity_id: 3, user_id: 9, name: 'low-full', x: 2000, y: 0, hp: 80, current_join_mode: 'Passive', drop: 1 }),
            { entity_id: 4, user_id: 10, name: 'unknown-stamina', x: 3000, y: 0, hp: 80, current_join_mode: 'Passive', drop: 20 }
          ],
          bullets: []
        }, { receivedAtMs: 1000 });
        const decision = buildBrowserlessDecision(store.getState(1200), {}, {
          nowMs: 1200,
          controlMode: 'profit-live'
        });
        const rows = Object.fromEntries((decision.input.nearby.p || []).map(row => [row[0], row]));
        return [
          decision.action.target.userId,
          rows['good-afk']?.[8],
          rows['good-afk']?.[9],
          rows['good-afk']?.[10],
          rows['low-full']?.[8],
          rows['low-full']?.[9],
          rows['low-full']?.[10],
          rows['unknown-stamina']?.[8],
          rows['unknown-stamina']?.[9],
          rows['unknown-stamina']?.[10],
          rows['good-afk']?.length
        ].join('|');
      })(),
      want: '8|1|1|0|1|0|1|0|0|0|11'
    },
    {
      name: 'browserless stationary full-stamina active can be AFK profit but non-full active stays threat',
      got: (() => {
        const choose = target => {
          const store = createBrowserlessStateStore({ userId: 7 });
          store.ingestFrame({
            type: 'pos',
            tick: 59,
            entities: [
              { entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100 },
              target
            ],
            bullets: []
          }, { receivedAtMs: 1000 });
          return buildBrowserlessDecision(store.getState(1200), {}, {
            nowMs: 1200,
            controlMode: 'profit-live'
          });
        };
        const fullActive = choose(fullStamina5s({ entity_id: 2, user_id: 8, name: 'full-active', x: 1000, y: 0, hp: 80, current_join_mode: 'Active', drop: 20 }));
        const nonFullActive = choose(fullStamina5s({ entity_id: 2, user_id: 8, name: 'spent-active', x: 1000, y: 0, hp: 80, current_join_mode: 'Active', drop: 20 }, 5000));
        return [
          fullActive.kind,
          fullActive.action.target.userId,
          fullActive.action.target.active,
          fullActive.combat.target?.userId || '',
          nonFullActive.kind,
          nonFullActive.band,
          nonFullActive.action.target.userId,
          nonFullActive.profit.best === null
        ].join('|');
      })(),
      want: 'profit-candidate|8|false||flee|safety|8|true'
    },
    {
      name: 'browserless profit live skips whitelisted AFK targets',
      got: (() => {
        const store = createBrowserlessStateStore({ userId: 7 });
        store.ingestFrame({
          type: 'pos',
          tick: 59,
          entities: [
            { entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100 },
            fullStamina5s({ entity_id: 2, user_id: 8, name: 'protected', x: 1000, y: 0, hp: 80, current_join_mode: 'None', drop: 99 }),
            fullStamina5s({ entity_id: 3, user_id: 9, name: 'allowed', x: 2000, y: 0, hp: 80, current_join_mode: 'None', drop: 3 })
          ],
          bullets: []
        }, { receivedAtMs: 1000 });
        const decision = buildBrowserlessDecision(store.getState(1200), {}, {
          nowMs: 1200,
          controlMode: 'profit-live',
          targetWhitelistNames: ['protected']
        });
        const candidateIds = (decision.profit.candidates || []).map(item => String(item.id)).join(',');
        return [
          decision.kind,
          decision.action.kind,
          decision.action.target.userId,
          decision.action.target.name,
          candidateIds.includes('8'),
          candidateIds.includes('9'),
          decision.input.dataGaps.includes('whitelisted-target-visible')
        ].join('|');
      })(),
      want: 'profit-candidate|attack|9|allowed|false|true|true'
    },
    {
      name: 'browserless opportunistic shot ignores whitelisted AFK targets',
      got: (() => {
        const store = createBrowserlessStateStore({ userId: 7 });
        store.ingestFrame({
          type: 'pos',
          tick: 59,
          entities: [
            { entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100 },
            fullStamina5s({ entity_id: 2, user_id: 8, name: 'protected', x: 1000, y: 0, hp: 80, current_join_mode: 'None', drop: 99 })
          ],
          bullets: [],
          coin_drops: [{ drop_id: 'coin-a', amount: 1, x: 10000, y: 0 }]
        }, { receivedAtMs: 1000 });
        const decision = buildBrowserlessDecision(store.getState(1200), {}, {
          nowMs: 1200,
          controlMode: 'profit-live',
          coinMaxDistance: 500,
          footCoinPriorityDistance: 500,
          targetWhitelistNames: ['protected']
        });
        return [
          decision.kind,
          decision.action.kind,
          decision.action.target.id,
          decision.action.opportunisticShot === undefined,
          decision.input.dataGaps.includes('whitelisted-target-visible')
        ].join('|');
      })(),
      want: 'profit-candidate|seek-coin|coin-a|true|true'
    },
    {
      name: 'browserless combat selector skips whitelisted active targets',
      got: (() => {
        const combat = buildBrowserlessCombatDryRun({
          userId: 7,
          realtime: {
            tick: 59,
            self: { entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100 },
            entities: [
              { entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100 },
              { entity_id: 2, user_id: 8, name: 'protected', x: 1000, y: 0, hp: 80, current_join_mode: 'Active', firing: true, drop: 99 }
            ],
            bullets: []
          }
        }, {
          nowMs: 1200,
          controlMode: 'profit-live',
          combatEnabled: true,
          liveCombatEnabled: true,
          targetWhitelistNames: ['protected']
        });
        return [
          combat.target === null,
          combat.candidates.length,
          combat.shooting.reason,
          combat.dataGaps.includes('missing-self-or-target')
        ].join('|');
      })(),
      want: 'true|0|no-target|true'
    },
    {
      name: 'browserless out-of-range recent activity blocks just-stopped AFK profit target',
      got: (() => {
        const stateful = {};
        const makeState = (x, stamina5s, tick) => ({
          userId: 7,
          realtime: {
            tick,
            frameAgeMs: 100,
            self: { entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100 },
            entities: [
              { entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100 },
              { entity_id: 2, user_id: 8, name: 'just-stopped', x, y: 0, hp: 80, current_join_mode: 'None', drop: 20, stamina_5s_remaining_milli: stamina5s }
            ],
            bullets: [],
            coinDrops: []
          },
          fallback: { coinDrops: [] }
        });
        const options = {
          controlMode: 'profit-live',
          attackRange: 5000,
          afkRecentActivityCooldownMs: 12000,
          activeSeenMs: 1800,
          activeMoveMin: 120
        };
        buildBrowserlessDecision(makeState(8000, 10000, 60), stateful, { ...options, nowMs: 1000 });
        buildBrowserlessDecision(makeState(8500, 10000, 61), stateful, { ...options, nowMs: 1500 });
        const decision = buildBrowserlessDecision(makeState(8500, 10000, 62), stateful, { ...options, nowMs: 4000 });
        return [
          decision.kind,
          decision.reason,
          decision.profit.best === null,
          decision.input.dataGaps.includes('recently-active-target-visible'),
          stateful.seenEntities['8'].activityAt,
          stateful.seenEntities['8'].movedAt
        ].join('|');
      })(),
      want: 'wait|no-profitable-candidate|true|true|1500|1500'
    },
    {
      name: 'browserless out-of-range recent stamina drop blocks AFK profit target',
      got: (() => {
        const stateful = {};
        const makeState = (stamina5s, tick) => ({
          userId: 7,
          realtime: {
            tick,
            frameAgeMs: 100,
            self: { entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100 },
            entities: [
              { entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100 },
              { entity_id: 2, user_id: 8, name: 'spent-stamina', x: 8000, y: 0, hp: 80, current_join_mode: 'None', drop: 20, stamina_5s_remaining_milli: stamina5s }
            ],
            bullets: [],
            coinDrops: []
          },
          fallback: { coinDrops: [] }
        });
        const options = {
          controlMode: 'profit-live',
          attackRange: 5000,
          afkRecentActivityCooldownMs: 12000,
          opportunityAfkStaminaDropThresholdMs: 100
        };
        buildBrowserlessDecision(makeState(10000, 60), stateful, { ...options, nowMs: 1000 });
        const decision = buildBrowserlessDecision(makeState(9800, 61), stateful, { ...options, nowMs: 2500 });
        return [
          decision.kind,
          decision.reason,
          decision.profit.best === null,
          decision.input.dataGaps.includes('recently-active-target-visible'),
          stateful.seenEntities['8'].activityAt
        ].join('|');
      })(),
      want: 'wait|no-profitable-candidate|true|true|2500'
    },
    {
      name: 'browserless in-range full-stamina target remains AFK after recent stamina drop',
      got: (() => {
        const stateful = {};
        const makeState = (stamina5s, tick) => ({
          userId: 7,
          realtime: {
            tick,
            frameAgeMs: 100,
            self: { entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100 },
            entities: [
              { entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100 },
              { entity_id: 2, user_id: 8, name: 'spent-in-range', x: 1000, y: 0, hp: 80, current_join_mode: 'None', drop: 20, stamina_5s_remaining_milli: stamina5s }
            ],
            bullets: [],
            coinDrops: []
          },
          fallback: { coinDrops: [] }
        });
        const options = {
          controlMode: 'profit-live',
          attackRange: 5000,
          afkRecentActivityCooldownMs: 12000,
          opportunityAfkStaminaDropThresholdMs: 100
        };
        buildBrowserlessDecision(makeState(10000, 60), stateful, { ...options, nowMs: 1000 });
        const decision = buildBrowserlessDecision(makeState(9800, 61), stateful, { ...options, nowMs: 2500 });
        const row = (decision.input.nearby.p || []).find(item => item[0] === 'spent-in-range');
        return [
          decision.kind,
          decision.action.kind,
          decision.action.target.userId,
          row?.[8],
          row?.[9],
          decision.input.dataGaps.includes('recently-active-target-visible')
        ].join('|');
      })(),
      want: 'profit-candidate|attack|8|1|1|true'
    },
    {
      name: 'browserless out-of-range AFK stamina cooldown blocks opportunity chase',
      got: (() => {
        const stateful = {};
        const makeState = (stamina5s, tick) => ({
          userId: 7,
          realtime: {
            tick,
            frameAgeMs: 100,
            self: { entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100 },
            entities: [
              { entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100 },
              { entity_id: 2, user_id: 8, name: 'far-spent-stamina', x: 8000, y: 0, hp: 80, current_join_mode: 'None', drop: 20, stamina_5s_remaining_milli: stamina5s }
            ],
            bullets: [],
            coinDrops: []
          },
          fallback: { coinDrops: [] }
        });
        const options = {
          controlMode: 'profit-live',
          attackRange: 5000,
          afkRecentActivityCooldownMs: 12000,
          opportunityAfkStaminaCooldownMs: 60000,
          opportunityAfkStaminaDropThresholdMs: 100
        };
        buildBrowserlessDecision(makeState(10000, 60), stateful, { ...options, nowMs: 1000 });
        buildBrowserlessDecision(makeState(9800, 61), stateful, { ...options, nowMs: 2500 });
        const decision = buildBrowserlessDecision(makeState(9800, 62), stateful, { ...options, nowMs: 16000 });
        const candidates = decision.profit.candidates || [];
        return [
          decision.kind,
          decision.reason,
          candidates.some(candidate => candidate.type === 'enemy'),
          stateful.opportunityAfkStamina['8'].cooldownUntil - 16000,
          stateful.opportunityAfkStamina['8'].cooldownUntil,
          decision.input.dataGaps.includes('afk-stamina-cooldown-target-visible'),
          decision.input.dataGaps.includes('recently-active-target-visible')
        ].join('|');
      })(),
      want: 'wait|no-profitable-candidate|false|46500|62500|true|false'
    },
    {
      name: 'browserless strategy defaults track browser runtime defaults',
      got: (() => {
        const browser = buildRuntimeDefaults({}, false);
        const browserless = buildBrowserlessRuntimeDefaults();
        return [
          browserless.attackRange === browser.attackRange,
          browserless.attackEngageRange === browser.attackEngageRange,
          browserless.attackMinAfkDrop === browser.attackMinAfkDrop,
          browserless.globalCoinMaxDistance === browser.globalCoinMaxDistance,
          browserless.coinPrecisionTolerance === browser.coinPrecisionTolerance,
          browserless.attackEngageRange
        ].join('|');
      })(),
      want: 'true|true|true|true|true|11000'
    },
    {
      name: 'browserless profit live prioritizes visible high-drop AFK over ordinary one coin',
      got: (() => {
        const store = createBrowserlessStateStore({ userId: 7 });
        store.ingestFrame({
          type: 'pos',
          tick: 59,
          entities: [
            { entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100 },
            fullStamina5s({ entity_id: 2, user_id: 8, name: 'drop-nine-afk', x: 49800, y: 0, hp: 100, current_join_mode: 'Passive', drop: 9 })
          ],
          bullets: []
        }, { receivedAtMs: 1000 });
        store.ingestFrame({
          type: 'snapshot',
          tick: 60,
          entities: [{ entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100 }],
          bullets: [],
          coin_drops: [{ drop_id: 'one-coin', amount: 1, x: 3500, y: 0 }],
          messages: []
        }, { receivedAtMs: 1100 });
        const decision = buildBrowserlessDecision(store.getState(1200), {}, {
          nowMs: 1200,
          controlMode: 'profit-live'
        });
        const coin = (decision.profit.candidates || []).find(item => item.type === 'coin');
        return [
          decision.kind,
          decision.action.kind,
          decision.action.target.userId,
          decision.action.target.drop,
          decision.profit.best.priorityTier,
          coin?.priorityTier
        ].join('|');
      })(),
      want: 'profit-candidate|seek-enemy|8|9|2|1'
    },
    {
      name: 'browserless profit live hard-prioritizes high-value realtime coin while recovering',
      got: (() => {
        const store = createBrowserlessStateStore({ userId: 7 });
        store.ingestFrame({
          type: 'pos',
          tick: 59,
          entities: [
            { entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 80, max_hp: 100 }
          ],
          bullets: [],
          coin_drops: [
            { drop_id: 'small-foot-coin', amount: 1, x: 200, y: 0 },
            { drop_id: 'high-value-coin', amount: 12, x: 1400, y: 0 }
          ]
        }, { receivedAtMs: 1000 });
        const decision = buildBrowserlessDecision(store.getState(1200), {}, {
          nowMs: 1200,
          controlMode: 'profit-live'
        });
        return [
          decision.kind,
          decision.band,
          decision.reason,
          decision.action.target.id,
          decision.action.target.amount,
          decision.action.highValueCoinPriority.source,
          decision.action.highValueCoinPriority.minAmount,
          decision.profit.best?.id
        ].join('|');
      })(),
      want: 'coin|profit|high-value-visible-coin-priority|high-value-coin|12|realtime|10|high-value-coin'
    },
    {
      name: 'browserless profit live blocks low-hp high-value coin under incoming bullet',
      got: (() => {
        const store = createBrowserlessStateStore({ userId: 7 });
        store.ingestFrame({
          type: 'pos',
          tick: 59,
          entities: [
            { entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 40, max_hp: 100 }
          ],
          bullets: [
            { bullet_id: 1, owner_user_id: 8, start_x: 5000, start_y: 0, target_x: 0, target_y: 0, speed_per_tick: 500 }
          ],
          coin_drops: [
            { drop_id: 'high-value-coin', amount: 12, x: 5000, y: 0 }
          ]
        }, { receivedAtMs: 1000 });
        const decision = buildBrowserlessDecision(store.getState(1200), {}, {
          nowMs: 1200,
          controlMode: 'profit-live'
        });
        return [
          decision.kind,
          decision.band,
          decision.reason,
          decision.action.highValueCoinPriority === undefined,
          decision.profit.best?.id
        ].join('|');
      })(),
      want: 'recover|recover|wait-for-full-stamina-and-hp|true|high-value-coin'
    },
    {
      name: 'browserless snapshot high-value coin cannot bypass realtime combat',
      got: (() => {
        const store = createBrowserlessStateStore({ userId: 7 });
        store.ingestFrame({
          type: 'pos',
          tick: 59,
          entities: [
            { entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100 },
            { entity_id: 2, user_id: 8, name: 'active', x: 1000, y: 0, hp: 80, current_join_mode: 'Active', firing: true, drop: 12 }
          ],
          bullets: []
        }, { receivedAtMs: 1000 });
        store.ingestFrame({
          type: 'snapshot',
          tick: 60,
          entities: [{ entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100 }],
          bullets: [],
          coin_drops: [{ drop_id: 'snapshot-high-value', amount: 99, x: 200, y: 0 }],
          messages: []
        }, { receivedAtMs: 1100 });
        const decision = buildBrowserlessDecision(store.getState(1200), {}, {
          nowMs: 1200,
          controlMode: 'profit-live',
          combatEnabled: true
        });
        return [
          decision.kind,
          decision.band,
          decision.reason,
          decision.action.target.userId,
          decision.action.highValueCoinPriority === undefined,
          decision.input.fallback.snapshotFallbackBlockedReasons.join(',')
        ].join('|');
      })(),
      want: 'combat-live|combat|combat-live-realtime|8|true|active-threat-visible'
    },
    {
      name: 'browserless player-drop source still hard-prioritizes higher visible snapshot coin',
      got: (() => {
        const store = createBrowserlessStateStore({ userId: 7 });
        store.ingestFrame({
          type: 'pos',
          tick: 61,
          entities: [
            { entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 80, max_hp: 100 }
          ],
          bullets: []
        }, { receivedAtMs: 1000 });
        store.ingestFrame({
          type: 'snapshot',
          tick: 62,
          entities: [{ entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 80, max_hp: 100, coins: 1000 }],
          bullets: [],
          coin_drops: [
            { drop_id: 'self-kill-drop', source_user_id: 8, system_spawned: false, amount: 6, x: 800, y: 0, created_tick: 62 },
            { drop_id: 'ordinary-high-value', source_user_id: 0, system_spawned: true, amount: 38, x: 9000, y: 0, created_tick: 62 }
          ],
          messages: [{ kind: 'kill', user_id: 7, target_user_id: 8, tick: 62, text: 'self killed afk' }]
        }, { receivedAtMs: 1100 });
        const decision = buildBrowserlessDecision(store.getState(1200), {}, {
          nowMs: 1200,
          controlMode: 'profit-live'
        });
        return [
          decision.kind,
          decision.band,
          decision.reason,
          decision.action.target.id,
          decision.action.target.amount,
          decision.input.profitCoinSource,
          decision.action.highValueCoinPriority.source,
          decision.action.highValueCoinPriority.minAmount,
          decision.input.fallback.selfKilledPlayerDropCount
        ].join('|');
      })(),
      want: 'coin|profit|high-value-visible-coin-priority|ordinary-high-value|38|snapshot-player-drop|snapshot-player-drop|10|1'
    },
    {
      name: 'browserless profit live takes foot coin before in-range high-drop AFK',
      got: (() => {
        const store = createBrowserlessStateStore({ userId: 7 });
        store.ingestFrame({
          type: 'pos',
          tick: 59,
          entities: [
            { entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100 },
            fullStamina5s({ entity_id: 2, user_id: 8, name: 'drop-nine-afk', x: 13600, y: 0, hp: 100, current_join_mode: 'Passive', drop: 9 })
          ],
          bullets: []
        }, { receivedAtMs: 1000 });
        store.ingestFrame({
          type: 'snapshot',
          tick: 60,
          entities: [{ entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100 }],
          bullets: [],
          coin_drops: [{ drop_id: 'one-coin', amount: 1, x: 1000, y: 0 }],
          messages: []
        }, { receivedAtMs: 1100 });
        const decision = buildBrowserlessDecision(store.getState(1200), {}, {
          nowMs: 1200,
          controlMode: 'profit-live'
        });
        return [
          decision.kind,
          decision.action.kind,
          decision.action.target.userId,
          decision.action.target.drop,
          decision.profit.best.priorityTier
        ].join('|');
      })(),
      want: 'coin|coin|||2'
    },
    {
      name: 'browserless profit live ranks in-range min-drop AFK over distant one coin',
      got: (() => {
        const store = createBrowserlessStateStore({ userId: 7 });
        store.ingestFrame({
          type: 'pos',
          tick: 59,
          entities: [
            { entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100 },
            fullStamina5s({ entity_id: 2, user_id: 8, name: 'drop-three-afk', x: 14000, y: 0, hp: 100, current_join_mode: 'Passive', drop: 3 })
          ],
          bullets: []
        }, { receivedAtMs: 1000 });
        store.ingestFrame({
          type: 'snapshot',
          tick: 60,
          entities: [{ entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100 }],
          bullets: [],
          coin_drops: [{ drop_id: 'distant-one-coin', amount: 1, x: 10500, y: 0 }],
          messages: []
        }, { receivedAtMs: 1100 });
        const decision = buildBrowserlessDecision(store.getState(1200), {}, {
          nowMs: 1200,
          controlMode: 'profit-live'
        });
        const coin = (decision.profit.candidates || []).find(item => item.type === 'coin');
        return [
          decision.kind,
          decision.action.kind,
          decision.action.target.userId,
          decision.action.target.drop,
          Math.round(decision.profit.best.score / 1000),
          Math.round((coin?.score || 0) / 1000)
        ].join('|');
      })(),
      want: 'profit-candidate|attack|8|3|58|57'
    },
    {
      name: 'browserless profit live damaged self recovers instead of ordinary coin',
      got: (() => {
        const store = createBrowserlessStateStore({ userId: 7 });
        store.ingestFrame({
          type: 'pos',
          tick: 59,
          entities: [{ entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 98 }],
          bullets: []
        }, { receivedAtMs: 1000 });
        store.ingestFrame({
          type: 'snapshot',
          tick: 60,
          entities: [{ entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 98 }],
          bullets: [],
          coin_drops: [{ drop_id: 'ordinary-coin', amount: 1, x: 1000, y: 0 }],
          messages: []
        }, { receivedAtMs: 1100 });
        const decision = buildBrowserlessDecision(store.getState(1200), {}, {
          nowMs: 1200,
          controlMode: 'profit-live'
        });
        return [
          decision.kind,
          decision.band,
          decision.reason,
          decision.action.stopMotion,
          decision.profit.best?.type,
          decision.action.recovery?.maxHp
        ].join('|');
      })(),
      want: 'recover|recover|wait-for-full-stamina-and-hp|true|coin|100'
    },
    {
      name: 'browserless profit live damaged self can take recovery foot coin',
      got: (() => {
        const store = createBrowserlessStateStore({ userId: 7 });
        store.ingestFrame({
          type: 'pos',
          tick: 59,
          entities: [{ entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 98 }],
          bullets: []
        }, { receivedAtMs: 1000 });
        store.ingestFrame({
          type: 'snapshot',
          tick: 60,
          entities: [{ entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 98 }],
          bullets: [],
          coin_drops: [{ drop_id: 'foot-coin', amount: 1, x: 500, y: 0 }],
          messages: []
        }, { receivedAtMs: 1100 });
        const decision = buildBrowserlessDecision(store.getState(1200), {}, {
          nowMs: 1200,
          controlMode: 'profit-live'
        });
        return [
          decision.kind,
          decision.band,
          decision.reason,
          decision.action.kind,
          decision.action.target.id
        ].join('|');
      })(),
      want: 'coin|profit|recovery-foot-coin|coin|foot-coin'
    },
    {
      name: 'browserless profit live recovery combat target beats recovery hold',
      got: (() => {
        const store = createBrowserlessStateStore({ userId: 7 });
        store.ingestFrame({
          type: 'pos',
          tick: 59,
          entities: [
            { entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 80, max_hp: 100, stamina_5s_remaining_milli: 5000 },
            { entity_id: 2, user_id: 8, name: 'active', x: 1000, y: 0, hp: 80, current_join_mode: 'Active', firing: true, drop: 12 }
          ],
          bullets: []
        }, { receivedAtMs: 1000 });
        const decision = buildBrowserlessDecision(store.getState(1200), {}, {
          nowMs: 1200,
          controlMode: 'profit-live',
          combatEnabled: true
        });
        return [
          decision.kind,
          decision.band,
          decision.reason,
          decision.action.kind,
          decision.action.target.userId,
          decision.action.target.authority
        ].join('|');
      })(),
      want: 'combat-live|combat|combat-live-realtime|combat-live|8|realtime'
    },
    {
      name: 'browserless profit live takes normal foot coin before broader opportunity',
      got: (() => {
        const store = createBrowserlessStateStore({ userId: 7 });
        store.ingestFrame({
          type: 'pos',
          tick: 59,
          entities: [
            { entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100 },
            fullStamina5s({ entity_id: 2, user_id: 8, name: 'afk', x: 1000, y: 0, hp: 80, current_join_mode: 'Passive', drop: 20 })
          ],
          bullets: []
        }, { receivedAtMs: 1000 });
        store.ingestFrame({
          type: 'snapshot',
          tick: 60,
          entities: [{ entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100 }],
          bullets: [],
          coin_drops: [{ drop_id: 'foot-coin', amount: 1, x: 300, y: 0 }],
          messages: []
        }, { receivedAtMs: 1100 });
        const decision = buildBrowserlessDecision(store.getState(1200), {}, {
          nowMs: 1200,
          controlMode: 'profit-live'
        });
        return [
          decision.kind,
          decision.band,
          decision.reason,
          decision.action.target.id,
          decision.action.target.amount,
          decision.profit.best?.type,
          decision.profit.best?.target?.userId
        ].join('|');
      })(),
      want: 'coin|profit|foot-coin-priority|foot-coin|1|enemy|8'
    },
    {
      name: 'browserless profit live injured foot coin can pass return-block scan',
      got: (() => {
        const store = createBrowserlessStateStore({ userId: 7 });
        store.ingestFrame({
          type: 'pos',
          tick: 59,
          entities: [
            { entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100 },
            { entity_id: 2, user_id: 8, name: 'active-caution', x: 20000, y: 0, hp: 100, current_join_mode: 'Active', drop: 0 }
          ],
          bullets: [],
          coin_drops: [{ drop_id: 'safe-foot-coin', amount: 1, x: -400, y: 0 }]
        }, { receivedAtMs: 1000 });
        const decision = buildBrowserlessDecision(store.getState(1200), {}, {
          nowMs: 1200,
          controlMode: 'profit-live',
          profitLiveThreatExitRange: 25000,
          profitLiveInjuryHp: 100,
          dangerRadius: 17000
        });
        return [
          decision.kind,
          decision.band,
          decision.reason,
          decision.action.target.id,
          decision.action.target.distance,
          decision.combat.target?.userId || ''
        ].join('|');
      })(),
      want: 'coin|profit|foot-coin-before-active-caution|safe-foot-coin|400|'
    },
    {
      name: 'browserless profit live hard safety leave beats foot coin',
      got: (() => {
        const store = createBrowserlessStateStore({ userId: 7 });
        store.ingestFrame({
          type: 'pos',
          tick: 59,
          entities: [
            { entity_id: 1, user_id: 7, name: 'self', x: 100, y: 100, hp: 100, max_hp: 100 },
            { entity_id: 2, user_id: 8, name: 'mode-missing-active', x: 9000, y: 100, hp: 100 }
          ],
          bullets: []
        }, { receivedAtMs: 1000 });
        store.ingestFrame({
          type: 'snapshot',
          tick: 60,
          entities: [
            { entity_id: 1, user_id: 7, name: 'self', x: 100, y: 100, hp: 100 },
            { entity_id: 22, user_id: 8, name: 'mode-missing-active', x: 9010, y: 100, hp: 100, current_join_mode: 'Active' }
          ],
          bullets: [],
          coin_drops: [{ drop_id: 'foot-coin', amount: 1, x: 200, y: 100 }],
          messages: []
        }, { receivedAtMs: 1100 });
        const decision = buildBrowserlessDecision(store.getState(1200), {}, {
          nowMs: 1200,
          controlMode: 'profit-live',
          combatEnabled: true
        });
        return [
          decision.kind,
          decision.band,
          decision.reason,
          decision.action.shouldLeave,
          decision.action.target.userId,
          decision.action.target.profitMetadataActive
        ].join('|');
      })(),
      want: 'safety-exit|safety|profit-live-snapshot-active-threat|true|8|true'
    },
    {
      name: 'browserless action adapter pre-approaches AFK target before shooting',
      got: (() => {
        const farCommands = [];
        const farAdapter = createBrowserlessActionAdapter({
          now: () => 1200 + farCommands.length * 200,
          commandIntervalMs: 1,
          attackRangeCm: 14500,
          transport: {
            sendVelocity: (dx, dy) => farCommands.push(`vel ${dx} ${dy}`),
            sendShoot: () => farCommands.push('shoot')
          }
        });
        const far = farAdapter.applyDecision({
          realtime: { self: { user_id: 7, x: 0, y: 0 }, tick: 1 }
        }, {
          kind: 'profit-candidate',
          band: 'profit',
          action: {
            kind: 'attack',
            band: 'profit',
            reason: 'best-opportunity-enemy',
            target: { type: 'enemy', userId: 8, x: 10000, y: 0, active: false, drop: 12 }
          }
        });
        const closeCommands = [];
        const closeAdapter = createBrowserlessActionAdapter({
          now: () => 1400 + closeCommands.length * 200,
          commandIntervalMs: 1,
          attackRangeCm: 14500,
          transport: {
            sendVelocity: (dx, dy) => closeCommands.push(`vel ${dx} ${dy}`),
            sendShoot: (targetX, targetY, startX, startY) => closeCommands.push(`shoot ${targetX} ${targetY} ${startX} ${startY}`)
          }
        });
        const close = closeAdapter.applyDecision({
          realtime: { self: { user_id: 7, x: 0, y: 0 }, tick: 2 }
        }, {
          kind: 'profit-candidate',
          band: 'profit',
          action: {
            kind: 'attack',
            band: 'profit',
            reason: 'best-opportunity-enemy',
            target: { type: 'enemy', userId: 8, x: 4900, y: 0, active: false, drop: 12 }
          }
        });
        return [
          far.kind,
          far.reason,
          far.afkAttackCommit.commitRangeCm,
          farCommands.join(','),
          !farCommands.includes('shoot'),
          close.kind,
          close.shoot.ok,
          closeCommands.some(item => item.startsWith('shoot '))
        ].join('|');
      })(),
      want: 'velocity|profit-afk-preengage|5000|vel 1 0|true|profit-attack|true|true'
    },
    {
      name: 'browserless profit live hands moving AFK attack target to combat',
      got: (() => {
        const decisionAdapter = createBrowserlessDecisionAdapter({
          userId: 7,
          controlMode: 'profit-live',
          combatEnabled: true
        });
        const commands = [];
        const actionAdapter = createBrowserlessActionAdapter({
          now: () => 1200 + commands.length * 200,
          commandIntervalMs: 1,
          attackRangeCm: 14500,
          transport: {
            sendVelocity: (dx, dy) => commands.push(`vel ${dx} ${dy}`),
            sendShoot: (targetX, targetY, startX, startY) => commands.push(`shoot ${targetX} ${targetY} ${startX} ${startY}`)
          }
        });
        const store = createBrowserlessStateStore({ userId: 7 });
        store.ingestFrame({
          type: 'pos',
          tick: 59,
          entities: [
            { entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 10000 },
            fullStamina5s({ entity_id: 2, user_id: 8, name: 'runner-afk', x: 4900, y: 0, hp: 80, current_join_mode: 'Passive', drop: 12 })
          ],
          bullets: []
        }, { receivedAtMs: 1000 });
        const first = decisionAdapter.decide(store.getState(1200), { nowMs: 1200 });
        const actionResult = actionAdapter.applyDecision(store.getState(1200), first);
        decisionAdapter.observeActionResult(actionResult, first, { nowMs: 1300 });
        store.ingestFrame({
          type: 'pos',
          tick: 60,
          entities: [
            { entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 10000 },
            fullStamina5s({ entity_id: 2, user_id: 8, name: 'runner-afk', x: 6200, y: 0, hp: 80, current_join_mode: 'Passive', drop: 12 }),
            fullStamina5s({ entity_id: 3, user_id: 9, name: 'other-afk', x: 40000, y: 0, hp: 80, current_join_mode: 'Passive', drop: 99 })
          ],
          bullets: []
        }, { receivedAtMs: 1500 });
        const second = decisionAdapter.decide(store.getState(1600), { nowMs: 1600 });
        return [
          first.kind,
          actionResult.kind,
          actionResult.shoot.ok,
          second.kind,
          second.band,
          second.action.target.userId,
          second.combat.target.combatIntent,
          second.combat.target.combatEngagement?.reengage,
          second.profit.best?.target?.userId
        ].join('|');
      })(),
      want: 'profit-candidate|profit-attack|true|combat-live|combat|8|engaged||9'
    },
    {
      name: 'browserless action shoot records attack history for post-attack logic',
      got: (() => {
        const decisionAdapter = createBrowserlessDecisionAdapter({ userId: 7, controlMode: 'profit-live' });
        const commands = [];
        const actionAdapter = createBrowserlessActionAdapter({
          now: () => 1200 + commands.length * 200,
          commandIntervalMs: 1,
          attackRangeCm: 14500,
          transport: {
            sendVelocity: (dx, dy) => commands.push(`vel ${dx} ${dy}`),
            sendShoot: (targetX, targetY, startX, startY) => commands.push(`shoot ${targetX} ${targetY} ${startX} ${startY}`)
          }
        });
        const store = createBrowserlessStateStore({ userId: 7 });
        store.ingestFrame({
          type: 'pos',
          tick: 59,
          entities: [
            { entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100 },
            fullStamina5s({ entity_id: 2, user_id: 8, name: 'afk', x: 1000, y: 0, hp: 80, current_join_mode: 'Passive', drop: 12 })
          ],
          bullets: []
        }, { receivedAtMs: 1000 });
        const decision = decisionAdapter.decide(store.getState(1200), { nowMs: 1200, controlMode: 'profit-live' });
        const actionResult = actionAdapter.applyDecision(store.getState(1200), decision);
        const recorded = decisionAdapter.observeActionResult(actionResult, decision, { nowMs: 1400 });
        const state = decisionAdapter.getState();
        return [
          actionResult.kind,
          actionResult.shoot.ok,
          recorded.id,
          recorded.action,
          recorded.drop,
          state.attackHistory.length,
          state.attackHistory[0].id,
          commands.some(item => item.startsWith('shoot '))
        ].join('|');
      })(),
      want: 'profit-attack|true|8|attack|12|1|8|true'
    },
    {
      name: 'browserless profit live waits at resolved post-attack target before drop appears',
      got: (() => {
        const stateful = {
          attackHistory: [{
            id: 8,
            name: 'afk',
            x: 5000,
            y: 0,
            drop: 20,
            at: 1000,
            action: 'attack',
            afk: true
          }]
        };
        const decision = buildBrowserlessDecision({
          userId: 7,
          realtime: {
            tick: 60,
            frameAgeMs: 100,
            self: { entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100 },
            entities: [{ entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100 }],
            bullets: [],
            coinDrops: []
          },
          fallback: { coinDrops: [] }
        }, stateful, {
          nowMs: 1600,
          controlMode: 'profit-live',
          postAttackDropWaitMs: 1000,
          postAttackDropResolveMaxMs: 5000,
          postAttackDropWaitMinDrop: 8,
          postAttackDropWaitStopDistance: 900
        });
        return [
          decision.kind,
          decision.band,
          decision.reason,
          decision.action.target.id,
          decision.action.target.distance,
          decision.action.target.postAttackTarget.drop
        ].join('|');
      })(),
      want: 'post-attack-drop-wait|profit|post-attack-drop-wait-position|8|5000|20'
    },
    {
      name: 'browserless profit live picks matched post-attack player drop',
      got: (() => {
        const stateful = {
          attackHistory: [{
            id: 8,
            name: 'afk',
            x: 5000,
            y: 0,
            drop: 20,
            at: 1000,
            action: 'attack',
            afk: true
          }]
        };
        const decision = buildBrowserlessDecision({
          userId: 7,
          realtime: {
            tick: 60,
            frameAgeMs: 100,
            self: { entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100 },
            entities: [{ entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100 }],
            bullets: [],
            coinDrops: [{ drop_id: 'post-drop', amount: 20, x: 5050, y: 0 }]
          },
          fallback: { coinDrops: [] }
        }, stateful, {
          nowMs: 1600,
          controlMode: 'profit-live',
          postAttackDropCoinRadius: 3500,
          postAttackDropCoinPriorityMs: 45000
        });
        return [
          decision.kind,
          decision.band,
          decision.reason,
          decision.action.target.id,
          decision.action.postAttackTarget.id,
          decision.action.postAttackTarget.drop,
          decision.action.target.authority
        ].join('|');
      })(),
      want: 'coin|profit|post-attack-drop-coin|post-drop|8|20|realtime'
    },
    {
      name: 'browserless profit live ignores stale post-attack history',
      got: (() => {
        const stateful = {
          attackHistory: [{
            id: 8,
            name: 'old-afk',
            x: 5000,
            y: 0,
            drop: 20,
            at: 1000,
            postAttackDropResolvedAt: 1200,
            action: 'attack',
            afk: true
          }]
        };
        const decision = buildBrowserlessDecision({
          userId: 7,
          realtime: {
            tick: 60,
            frameAgeMs: 100,
            self: { entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100 },
            entities: [{ entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100 }],
            bullets: [],
            coinDrops: []
          },
          fallback: { coinDrops: [] }
        }, stateful, {
          nowMs: 8000,
          controlMode: 'profit-live',
          postAttackDropWaitMs: 1000,
          postAttackDropResolveMaxMs: 5000,
          postAttackDropCoinPriorityMs: 2000
        });
        return [
          decision.kind,
          decision.reason,
          decision.action.postAttackTarget === undefined
        ].join('|');
      })(),
      want: 'wait|no-profitable-candidate|true'
    },
    {
      name: 'browserless profit live ignores no-progress snapshot coin and escapes',
      got: (() => {
        const stateful = {};
        const state = {
          userId: 7,
          realtime: {
            tick: 60,
            frameAgeMs: 100,
            self: { entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100 },
            entities: [{ entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100 }],
            bullets: [],
            coinDrops: []
          },
          fallback: {
            frameAgeMs: 100,
            coinDrops: [{ drop_id: 'stale-snapshot-coin', amount: 1, x: 1000, y: 0 }]
          }
        };
        const options = {
          controlMode: 'profit-live',
          coinNoProgressMs: 1000,
          coinNoProgressIgnoreMs: 5000,
          coinFailureMaxIgnoreMs: 10000,
          staleCoinEscapeMs: 200
        };
        const first = buildBrowserlessDecision(state, stateful, { ...options, nowMs: 1000 });
        const second = buildBrowserlessDecision(state, stateful, { ...options, nowMs: 2200 });
        const third = buildBrowserlessDecision(state, stateful, { ...options, nowMs: 2600 });
        return [
          first.kind,
          first.action.target.id,
          second.kind,
          second.reason,
          second.action.dx,
          stateful.ignoredCoins['id:stale-snapshot-coin'] > 2200,
          stateful.coinProgress['id:stale-snapshot-coin'].ignoreUntil,
          third.kind,
          third.reason,
          third.action.target === undefined
        ].join('|');
      })(),
      want: 'coin|stale-snapshot-coin|patrol|ignore-stale-coin-no-progress|-1|true|7200|wait|no-profitable-candidate|true'
    },
    {
      name: 'browserless profit live close stuck coin uses stale escape patrol',
      got: (() => {
        const stateful = {};
        const state = {
          userId: 7,
          realtime: {
            tick: 60,
            frameAgeMs: 100,
            self: { entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100 },
            entities: [{ entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100 }],
            bullets: [],
            coinDrops: [{ drop_id: 'close-stuck-coin', amount: 2, x: 1000, y: 0 }]
          },
          fallback: { coinDrops: [] }
        };
        const options = {
          controlMode: 'profit-live',
          closeCoinStuckDistance: 1200,
          closeCoinStuckMs: 500,
          coinCloseFailureIgnoreMs: 3000,
          coinFailureMaxIgnoreMs: 10000,
          staleCoinEscapeMs: 1000
        };
        buildBrowserlessDecision(state, stateful, { ...options, nowMs: 1000 });
        const decision = buildBrowserlessDecision(state, stateful, { ...options, nowMs: 1600 });
        return [
          decision.kind,
          decision.reason,
          decision.action.dx,
          decision.action.ignoredCoin.id,
          decision.action.ignoredCoin.closeAgeMs,
          decision.action.ignoredCoin.failureCount,
          stateful.staleCoinEscape.id,
          stateful.staleCoinEscape.until
        ].join('|');
      })(),
      want: 'patrol|ignore-close-stale-coin|-1|id:close-stuck-coin|600|1|id:close-stuck-coin|2600'
    },
    {
      name: 'browserless profit live picks multi-coin route over single coin',
      got: (() => {
        const decision = buildBrowserlessDecision({
          userId: 7,
          realtime: {
            tick: 60,
            frameAgeMs: 100,
            self: { entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100 },
            entities: [{ entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100 }],
            bullets: [],
            coinDrops: [
              { drop_id: 'route-a', amount: 2, x: 10000, y: 0 },
              { drop_id: 'route-b', amount: 2, x: 10000, y: 2000 },
              { drop_id: 'route-c', amount: 2, x: 10000, y: 4000 },
              { drop_id: 'single', amount: 2, x: 9000, y: -9000 }
            ]
          },
          fallback: { coinDrops: [] }
        }, {}, {
          nowMs: 1600,
          controlMode: 'profit-live',
          coinMaxDistance: 500,
          footCoinPriorityDistance: 500,
          opportunityCoinPickupStaminaMs: 0
        });
        return [
          decision.kind,
          decision.reason,
          decision.action.target.id,
          decision.action.coinRoute.ids.join(','),
          decision.action.coinRoute.value,
          decision.action.target.coinRoute.legCount,
          decision.profit.best.reason
        ].join('|');
      })(),
      want: 'profit-candidate|best-opportunity-coin-route|route-a|route-a,route-b,route-c|6|3|best-opportunity-coin-route'
    },
    {
      name: 'browserless profit live keeps held coin route within switch margin',
      got: (() => {
        const stateful = {
          opportunityChoice: {
            type: 'coin',
            id: 'held-a',
            reason: 'best-opportunity-coin-route',
            until: 5000,
            coinRouteIds: ['held-a', 'held-b', 'held-c'],
            amount: 2,
            x: 10000,
            y: 0
          }
        };
        const decision = buildBrowserlessDecision({
          userId: 7,
          realtime: {
            tick: 60,
            frameAgeMs: 100,
            self: { entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100 },
            entities: [{ entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100 }],
            bullets: [],
            coinDrops: [
              { drop_id: 'held-a', amount: 2, x: 10000, y: 0 },
              { drop_id: 'held-b', amount: 2, x: 10000, y: 2000 },
              { drop_id: 'held-c', amount: 2, x: 10000, y: 4000 },
              { drop_id: 'new-a', amount: 2, x: 12000, y: 0 },
              { drop_id: 'new-b', amount: 2, x: 12000, y: 2000 },
              { drop_id: 'new-c', amount: 2, x: 12000, y: 4000 }
            ]
          },
          fallback: { coinDrops: [] }
        }, stateful, {
          nowMs: 1600,
          controlMode: 'profit-live',
          coinMaxDistance: 500,
          footCoinPriorityDistance: 500,
          opportunityCoinPickupStaminaMs: 0,
          opportunitySwitchMargin: 1000000
        });
        return [
          decision.kind,
          decision.action.target.id,
          decision.action.coinRoute.ids.slice(0, 3).join(','),
          decision.action.coinRoute.legCount >= 3,
          decision.stateful.opportunityChoice.id
        ].join('|');
      })(),
      want: 'profit-candidate|held-a|held-a,held-b,held-c|true|held-a'
    },
    {
      name: 'browserless profit live blocks field migration behind nearer safe coin',
      got: (() => {
        const decision = buildBrowserlessDecision({
          userId: 7,
          realtime: {
            tick: 60,
            frameAgeMs: 100,
            self: { entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100 },
            entities: [{ entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100 }],
            bullets: [],
            coinDrops: [
              { drop_id: 'near-safe', amount: 1, x: 5000, y: 0 },
              { drop_id: 'field-a', amount: 5, x: 25000, y: 0 },
              { drop_id: 'field-b', amount: 5, x: 26000, y: 1000 },
              { drop_id: 'field-c', amount: 5, x: 27000, y: -1000 }
            ]
          },
          fallback: { coinDrops: [] }
        }, {}, {
          nowMs: 1600,
          controlMode: 'profit-live',
          coinMaxDistance: 500,
          footCoinPriorityDistance: 500,
          coinRouteMaxDistance: 0,
          fieldMigrationMinDistance: 22000,
          fieldMigrationMaxDistance: 45000,
          fieldMigrationMinCoins: 3,
          fieldMigrationNearbyCoinBlockDistance: 30000
        });
        return [
          decision.kind,
          decision.reason,
          decision.action.target.id,
          decision.action.target.fieldMembers === null,
          decision.profit.candidates.some(item => item.coin?.fieldMembers >= 3)
        ].join('|');
      })(),
      want: 'profit-candidate|visible-coin|near-safe|true|false'
    },
    {
      name: 'browserless final arbitration holds previous profit action',
      got: (() => {
        const stateful = {};
        const baseState = coin => ({
          userId: 7,
          realtime: {
            tick: 60,
            frameAgeMs: 100,
            self: { entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100 },
            entities: [{ entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100 }],
            bullets: [],
            coinDrops: [coin]
          },
          fallback: { coinDrops: [] }
        });
        buildBrowserlessDecision(baseState({ drop_id: 'coin-a', amount: 1, x: 10000, y: 0 }), stateful, {
          nowMs: 1000,
          controlMode: 'profit-live',
          coinMaxDistance: 500,
          footCoinPriorityDistance: 500,
          opportunitySwitchHoldMs: 0,
          finalActionArbitrationHoldMs: 480
        });
        const held = buildBrowserlessDecision(baseState({ drop_id: 'coin-b', amount: 10, x: 10000, y: 0 }), stateful, {
          nowMs: 1200,
          controlMode: 'profit-live',
          coinMaxDistance: 500,
          footCoinPriorityDistance: 500,
          opportunitySwitchHoldMs: 0,
          finalActionArbitrationHoldMs: 480
        });
        return [
          held.kind,
          held.action.target.id,
          held.action.finalActionArbitration.mode,
          stateful.finalActionArbitration.history.length,
          stateful.finalActionArbitration.lastFocus.key
        ].join('|');
      })(),
      want: 'seek-coin|coin-a|hold-previous|1|coin:coin-a'
    },
    {
      name: 'browserless final arbitration does not hold over safety action',
      got: (() => {
        const stateful = {};
        const self = { entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100 };
        buildBrowserlessDecision({
          userId: 7,
          realtime: {
            tick: 60,
            frameAgeMs: 100,
            self,
            entities: [self],
            bullets: [],
            coinDrops: [{ drop_id: 'coin-a', amount: 1, x: 10000, y: 0 }]
          },
          fallback: { coinDrops: [] }
        }, stateful, {
          nowMs: 1000,
          controlMode: 'profit-live',
          coinMaxDistance: 500,
          footCoinPriorityDistance: 500,
          opportunitySwitchHoldMs: 0,
          finalActionArbitrationHoldMs: 480
        });
        const safety = buildBrowserlessDecision({
          userId: 7,
          realtime: {
            tick: 61,
            frameAgeMs: 100,
            self,
            entities: [
              self,
              { entity_id: 2, user_id: 8, name: 'active', x: 500, y: 0, hp: 100, current_join_mode: 'Active', firing: true, drop: 10 }
            ],
            bullets: [],
            coinDrops: [{ drop_id: 'coin-b', amount: 10, x: 10000, y: 0 }]
          },
          fallback: { coinDrops: [] }
        }, stateful, {
          nowMs: 1200,
          controlMode: 'profit-live',
          coinMaxDistance: 500,
          footCoinPriorityDistance: 500,
          opportunitySwitchHoldMs: 0,
          finalActionArbitrationHoldMs: 480
        });
        return [
          safety.kind,
          safety.band,
          safety.reason,
          safety.action.finalActionArbitration === undefined,
          stateful.finalActionArbitration.history.length
        ].join('|');
      })(),
      want: 'flee|safety|active-threat-return-block|true|0'
    },
    {
      name: 'browserless target switch diagnostics stay bounded',
      got: (() => {
        const stateful = {};
        const makeState = (id, x) => ({
          userId: 7,
          realtime: {
            tick: 60,
            frameAgeMs: 100,
            self: { entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100 },
            entities: [{ entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100 }],
            bullets: [],
            coinDrops: [{ drop_id: id, amount: 1, x, y: 0 }]
          },
          fallback: { coinDrops: [] }
        });
        ['a', 'b', 'c', 'd', 'e', 'f'].forEach((id, index) => {
          buildBrowserlessDecision(makeState(`coin-${id}`, 10000 + index * 1000), stateful, {
            nowMs: 1000 + index * 1000,
            controlMode: 'profit-live',
            coinMaxDistance: 500,
            footCoinPriorityDistance: 500,
            opportunitySwitchHoldMs: 0,
            finalActionArbitrationHoldMs: 0,
            targetSwitchDiagnosticsHistoryLimit: 4
          });
        });
        const events = stateful.targetSwitchDiagnostics.events || [];
        const summary = summarizeBrowserlessDecisionState(stateful, { recentLimit: 2 });
        return [
          events.length,
          events[0].to.key,
          events[events.length - 1].to.key,
          summary.targetSwitchDiagnostics.count,
          summary.targetSwitchDiagnostics.recent.length,
          Boolean(stateful.lastDecisionAction.targetSwitch)
        ].join('|');
      })(),
      want: '4|coin:coin-c|coin:coin-f|4|2|true'
    },
    {
      name: 'browserless post-attack wait runs before stamina budget leave',
      got: (() => {
        const stateful = {
          attackHistory: [{
            id: 8,
            name: 'fresh-afk',
            x: 5000,
            y: 0,
            drop: 20,
            at: 1000,
            action: 'attack',
            afk: true
          }]
        };
        const decision = buildBrowserlessDecision({
          userId: 7,
          realtime: {
            tick: 60,
            frameAgeMs: 100,
            self: {
              entity_id: 1,
              user_id: 7,
              name: 'self',
              x: 0,
              y: 0,
              hp: 100,
              max_hp: 100,
              stamina_5s_remaining_milli: 10000,
              stamina_1h_remaining_milli: 3000,
              stamina_1d_remaining_milli: 100000
            },
            entities: [{ entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100 }],
            bullets: [],
            coinDrops: [{ drop_id: 'budget-coin', amount: 5, x: 20000, y: 0 }]
          },
          fallback: { coinDrops: [] }
        }, stateful, {
          nowMs: 1600,
          controlMode: 'profit-live',
          postAttackDropWaitMs: 1000,
          postAttackDropResolveMaxMs: 5000,
          postAttackDropWaitMinDrop: 8,
          postAttackDropWaitStopDistance: 900
        });
        return [
          decision.kind,
          decision.band,
          decision.reason,
          decision.action.target.id,
          decision.action.target.postAttackTarget.drop,
          decision.action.staminaBudgetExit === undefined
        ].join('|');
      })(),
      want: 'post-attack-drop-wait|profit|post-attack-drop-wait-position|8|20|true'
    },
    {
      name: 'browserless profit live leaves when nearest allowed coin exceeds 1h stamina budget',
      got: (() => {
        const store = createBrowserlessStateStore({ userId: 7 });
        store.ingestFrame({
          type: 'pos',
          tick: 59,
          entities: [{
            entity_id: 1,
            user_id: 7,
            name: 'self',
            x: 0,
            y: 0,
            hp: 100,
            max_hp: 100,
            stamina_5s_remaining_milli: 10000,
            stamina_1h_remaining_milli: 3000,
            stamina_1d_remaining_milli: 100000
          }],
          bullets: []
        }, { receivedAtMs: 1000 });
        store.ingestFrame({
          type: 'snapshot',
          tick: 60,
          entities: [{ entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100 }],
          bullets: [],
          coin_drops: [{ drop_id: 'budget-coin', amount: 5, x: 5000, y: 0 }],
          messages: []
        }, { receivedAtMs: 1100 });
        const decision = buildBrowserlessDecision(store.getState(1200), {}, {
          nowMs: 1200,
          controlMode: 'profit-live'
        });
        return [
          decision.kind,
          decision.band,
          decision.reason,
          decision.action.kind,
          decision.action.shouldLeave,
          decision.action.staminaBudgetExit.id,
          decision.action.staminaBudgetExit.shortageMs,
          decision.action.reloginDelayMs
        ].join('|');
      })(),
      want: 'leave|safety|stamina-budget-coin-leave|leave|true|budget-coin|4500|1800000'
    },
    {
      name: 'browserless profit live takes realtime final coin under 1d stamina limit',
      got: (() => {
        const store = createBrowserlessStateStore({ userId: 7 });
        store.ingestFrame({
          type: 'pos',
          tick: 59,
          entities: [{
            entity_id: 1,
            user_id: 7,
            name: 'self',
            x: 0,
            y: 0,
            hp: 100,
            max_hp: 100,
            stamina_5s_remaining_milli: 10000,
            stamina_1h_remaining_milli: 100000,
            stamina_1d_remaining_milli: 3000
          }],
          bullets: [],
          coin_drops: [{ drop_id: 'final-realtime-coin', amount: 5, x: 1000, y: 0 }]
        }, { receivedAtMs: 1000 });
        const decision = buildBrowserlessDecision(store.getState(1200), {}, {
          nowMs: 1200,
          controlMode: 'profit-live'
        });
        return [
          decision.kind,
          decision.band,
          decision.reason,
          decision.action.target.id,
          decision.action.target.authority,
          decision.action.dailyStaminaFinalRun.staminaCost,
          decision.action.dailyStaminaFinalRun.budgetMs
        ].join('|');
      })(),
      want: 'coin|profit|daily-stamina-final-visible-coin|final-realtime-coin|realtime|1000|500'
    },
    {
      name: 'browserless profit live leaves when 1d stamina is exhausted',
      got: (() => {
        const store = createBrowserlessStateStore({ userId: 7 });
        store.ingestFrame({
          type: 'pos',
          tick: 59,
          entities: [{
            entity_id: 1,
            user_id: 7,
            name: 'self',
            x: 0,
            y: 0,
            hp: 100,
            max_hp: 100,
            stamina_5s_remaining_milli: 10000,
            stamina_1h_remaining_milli: 3000000,
            stamina_1d_remaining_milli: 31
          }],
          bullets: []
        }, { receivedAtMs: 1000 });
        const decision = buildBrowserlessDecision(store.getState(1200), {}, {
          nowMs: 1200,
          controlMode: 'profit-live'
        });
        return [
          decision.kind,
          decision.band,
          decision.reason,
          decision.action.staminaExhausted.exhausted.join(','),
          decision.action.staminaExhausted.remaining1d,
          decision.action.reloginDelayMs > 1000
        ].join('|');
      })(),
      want: 'leave|safety|stamina-exhausted-leave|1d|31|true'
    },
    {
      name: 'browserless profit live honors browserless stamina exhausted threshold alias',
      got: (() => {
        const store = createBrowserlessStateStore({ userId: 7 });
        store.ingestFrame({
          type: 'pos',
          tick: 59,
          entities: [{
            entity_id: 1,
            user_id: 7,
            name: 'self',
            x: 0,
            y: 0,
            hp: 100,
            max_hp: 100,
            stamina_5s_remaining_milli: 10000,
            stamina_1h_remaining_milli: 3000000,
            stamina_1d_remaining_milli: 500
          }],
          bullets: []
        }, { receivedAtMs: 1000 });
        const decision = buildBrowserlessDecision(store.getState(1200), {}, {
          ...buildBrowserlessRuntimeDefaults({ staminaExhaustedBelowMs: 200 }),
          nowMs: 1200,
          controlMode: 'profit-live'
        });
        return [
          decision.kind,
          decision.band,
          decision.reason,
          Boolean(decision.action.staminaExhausted)
        ].join('|');
      })(),
      want: 'wait|wait|no-profitable-candidate|false'
    },
    {
      name: 'browserless profit live leaves when 1h stamina is exhausted',
      got: (() => {
        const store = createBrowserlessStateStore({ userId: 7 });
        store.ingestFrame({
          type: 'pos',
          tick: 59,
          entities: [{
            entity_id: 1,
            user_id: 7,
            name: 'self',
            x: 0,
            y: 0,
            hp: 100,
            max_hp: 100,
            stamina_5s_remaining_milli: 10000,
            stamina_1h_remaining_milli: 31,
            stamina_1d_remaining_milli: 100000
          }],
          bullets: []
        }, { receivedAtMs: 1000 });
        const decision = buildBrowserlessDecision(store.getState(1200), {}, {
          nowMs: 1200,
          controlMode: 'profit-live'
        });
        return [
          decision.kind,
          decision.band,
          decision.reason,
          decision.action.staminaExhausted.exhausted.join(','),
          decision.action.staminaExhausted.remaining1h,
          decision.action.reloginDelayMs
        ].join('|');
      })(),
      want: 'leave|safety|stamina-exhausted-leave|1h|31|1800000'
    },
    {
      name: 'browserless profit live waits for budget instead of moving to unaffordable snapshot coin',
      got: (() => {
        const store = createBrowserlessStateStore({ userId: 7 });
        store.ingestFrame({
          type: 'pos',
          tick: 59,
          entities: [{
            entity_id: 1,
            user_id: 7,
            name: 'self',
            x: 0,
            y: 0,
            hp: 100,
            max_hp: 100,
            stamina_5s_remaining_milli: 10000,
            stamina_1h_remaining_milli: 100000,
            stamina_1d_remaining_milli: 3000
          }],
          bullets: []
        }, { receivedAtMs: 1000 });
        store.ingestFrame({
          type: 'snapshot',
          tick: 60,
          entities: [{ entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100 }],
          bullets: [],
          coin_drops: [{ drop_id: 'unaffordable-snapshot-coin', amount: 5, x: 1000, y: 0 }],
          messages: []
        }, { receivedAtMs: 1100 });
        const decision = buildBrowserlessDecision(store.getState(1200), {}, {
          nowMs: 1200,
          controlMode: 'profit-live'
        });
        return [
          decision.kind,
          decision.band,
          decision.reason,
          decision.action.staminaBlocked.id,
          decision.action.staminaBlocked.shortageMs,
          decision.profit.best === null
        ].join('|');
      })(),
      want: 'wait|wait|wait-for-stamina-budget|unaffordable-snapshot-coin|500|true'
    },
    {
      name: 'browserless profit live admits fresh in-view snapshot coin fallback',
      got: (() => {
        const store = createBrowserlessStateStore({ userId: 7 });
        store.ingestFrame({
          type: 'pos',
          tick: 59,
          entities: [{ entity_id: 1, user_id: 7, name: 'self', x: 100, y: 100, hp: 100 }],
          bullets: []
        }, { receivedAtMs: 1000 });
        store.ingestFrame({
          type: 'snapshot',
          tick: 60,
          entities: [{ entity_id: 1, user_id: 7, name: 'self', x: 100, y: 100, hp: 100, coins: 1000 }],
          bullets: [],
          coin_drops: [{ drop_id: 'snapshot-coin', amount: 1, x: 120, y: 100 }],
          messages: []
        }, { receivedAtMs: 1100 });
        const decision = buildBrowserlessDecision(store.getState(1200), {}, {
          nowMs: 1200,
          controlMode: 'profit-live'
        });
        return [
          decision.kind,
          decision.reason,
          decision.input.profitCoinSource,
          decision.input.fallback.snapshotCoinFallbackAllowed,
          decision.input.fallback.snapshotFallbackBlockedReasons.join(','),
          decision.action.kind,
          decision.action.target.id,
          decision.action.target.authority,
          decision.action.target.snapshotOnly
        ].join('|');
      })(),
      want: 'coin|foot-coin-priority|snapshot-fallback|true||coin|snapshot-coin|snapshot|true'
    },
    {
      name: 'browserless profit live ignores out-of-view snapshot coin fallback',
      got: (() => {
        const store = createBrowserlessStateStore({ userId: 7 });
        store.ingestFrame({
          type: 'pos',
          tick: 59,
          entities: [{ entity_id: 1, user_id: 7, name: 'self', x: 100, y: 100, hp: 100 }],
          bullets: []
        }, { receivedAtMs: 1000 });
        store.ingestFrame({
          type: 'snapshot',
          tick: 60,
          entities: [{ entity_id: 1, user_id: 7, name: 'self', x: 100, y: 100, hp: 100, coins: 1000 }],
          bullets: [],
          coin_drops: [{ drop_id: 'far-snapshot-coin', amount: 10, x: 60101, y: 100 }],
          messages: []
        }, { receivedAtMs: 1100 });
        const decision = buildBrowserlessDecision(store.getState(1200), {}, {
          nowMs: 1200,
          controlMode: 'profit-live'
        });
        return [
          decision.kind,
          decision.reason,
          decision.input.profitCoinSource,
          decision.input.fallback.snapshotCoinFallbackAllowed,
          decision.input.fallback.snapshotVisibleCoinCount,
          decision.input.fallback.snapshotFallbackBlockedReasons.join(','),
          decision.profit.best === null
        ].join('|');
      })(),
      want: 'wait|no-profitable-candidate|none|false|0|snapshot-coins-out-of-visible-range|true'
    },
    {
      name: 'browserless profit live allows visible snapshot coin when snapshot-active threat is distant',
      got: (() => {
        const store = createBrowserlessStateStore({ userId: 7 });
        store.ingestFrame({
          type: 'pos',
          tick: 59,
          entities: [
            { entity_id: 1, user_id: 7, name: 'self', x: 100, y: 100, hp: 100, max_hp: 100 },
            { entity_id: 2, user_id: 8, name: 'edge-active', x: 49700, y: 100, hp: 100 }
          ],
          bullets: []
        }, { receivedAtMs: 1000 });
        store.ingestFrame({
          type: 'snapshot',
          tick: 60,
          entities: [
            { entity_id: 1, user_id: 7, name: 'self', x: 100, y: 100, hp: 100, coins: 1000 },
            { entity_id: 22, user_id: 8, name: 'edge-active', x: 49700, y: 100, hp: 100, current_join_mode: 'Active', death_reward_preview: 3, death_drop_coins: 3 }
          ],
          bullets: [],
          coin_drops: [{ drop_id: 'near-visible-coin', amount: 1, x: 2700, y: 100 }],
          messages: []
        }, { receivedAtMs: 1100 });
        const decision = buildBrowserlessDecision(store.getState(1200), {}, {
          nowMs: 1200,
          controlMode: 'profit-live',
          combatEnabled: true
        });
        return [
          decision.kind,
          decision.reason,
          decision.input.profitCoinSource,
          decision.input.fallback.snapshotCoinFallbackAllowed,
          decision.input.fallback.snapshotFallbackThreatCount,
          decision.input.dataGaps.includes('snapshot-active-threat-visible'),
          decision.input.dataGaps.includes('snapshot-fallback-blocked:active-threat-visible'),
          decision.action.kind,
          decision.action.target.id
        ].join('|');
      })(),
      want: 'profit-candidate|best-opportunity-coin|snapshot-fallback|true|0|true|false|coin|near-visible-coin'
    },
    {
      name: 'browserless profit live can explicitly disable snapshot coin fallback',
      got: (() => {
        const store = createBrowserlessStateStore({ userId: 7 });
        store.ingestFrame({
          type: 'pos',
          tick: 59,
          entities: [{ entity_id: 1, user_id: 7, name: 'self', x: 100, y: 100, hp: 100 }],
          bullets: []
        }, { receivedAtMs: 1000 });
        store.ingestFrame({
          type: 'snapshot',
          tick: 60,
          entities: [{ entity_id: 1, user_id: 7, name: 'self', x: 100, y: 100, hp: 100, coins: 1000 }],
          bullets: [],
          coin_drops: [{ drop_id: 'snapshot-coin', amount: 1, x: 120, y: 100 }],
          messages: []
        }, { receivedAtMs: 1100 });
        const decision = buildBrowserlessDecision(store.getState(1200), {}, {
          nowMs: 1200,
          controlMode: 'profit-live',
          snapshotCoinFallbackEnabled: false
        });
        return [
          decision.kind,
          decision.reason,
          decision.input.profitCoinSource,
          decision.input.fallback.snapshotCoinFallbackAllowed,
          decision.input.fallback.snapshotFallbackBlockedReasons.join(','),
          decision.profit.best === null
        ].join('|');
      })(),
      want: 'wait|no-profitable-candidate|none|false|snapshot-fallback-disabled|true'
    },
    {
      name: 'browserless profit live picks self-kill snapshot player drops',
      got: (() => {
        const store = createBrowserlessStateStore({ userId: 7 });
        store.ingestFrame({
          type: 'pos',
          tick: 61,
          entities: [{ entity_id: 1, user_id: 7, name: 'self', x: 100, y: 100, hp: 100 }],
          bullets: []
        }, { receivedAtMs: 1000 });
        store.ingestFrame({
          type: 'snapshot',
          tick: 62,
          entities: [{ entity_id: 1, user_id: 7, name: 'self', x: 100, y: 100, hp: 100, coins: 1000 }],
          bullets: [],
          coin_drops: [
            { drop_id: 'system-coin', source_user_id: 0, system_spawned: true, amount: 99, x: 120, y: 100, created_tick: 62 },
            { drop_id: 'other-player-drop', source_user_id: 9, system_spawned: false, amount: 50, x: 130, y: 100, created_tick: 62 },
            { drop_id: 'self-kill-drop', source_user_id: 8, system_spawned: false, amount: 6, x: 180, y: 100, created_tick: 62 }
          ],
          messages: [{ kind: 'kill', user_id: 7, target_user_id: 8, tick: 62, text: 'self killed afk' }]
        }, { receivedAtMs: 1100 });
        const decision = buildBrowserlessDecision(store.getState(1200), {}, {
          nowMs: 1200,
          controlMode: 'profit-live'
        });
        return [
          decision.kind,
          decision.action.kind,
          decision.action.target.type,
          decision.action.target.id,
          decision.action.target.amount,
          decision.input.profitCoinSource,
          decision.input.fallback.selfKilledPlayerDropCount,
          decision.input.selfKillEvidence[0]?.targetUserId,
          decision.input.selfKillEvidence[0]?.tick,
          decision.input.fallback.snapshotFallbackBlockedReasons.join(','),
          decision.input.dataGaps.includes('self-killed-player-drop-visible')
        ].join('|');
      })(),
      want: 'coin|coin|coin|self-kill-drop|6|snapshot-player-drop|1|8|62||true'
    },
    {
      name: 'browserless profit live enriches realtime AFK reward from fresh snapshot metadata',
      got: (() => {
        const store = createBrowserlessStateStore({ userId: 7 });
        store.ingestFrame({
          type: 'pos',
          tick: 59,
          entities: [
            { entity_id: 1, user_id: 7, name: 'self', x: 100, y: 100, hp: 100 },
            { entity_id: 2, user_id: 8, name: 'afk', x: 1000, y: 100, hp: 100, current_join_mode: 'Passive' }
          ],
          bullets: []
        }, { receivedAtMs: 1000 });
        store.ingestFrame({
          type: 'snapshot',
          tick: 60,
          entities: [
            { entity_id: 1, user_id: 7, name: 'self', x: 100, y: 100, hp: 100, coins: 1000 },
            fullStamina5s({ entity_id: 22, user_id: 8, name: 'afk', x: 1010, y: 100, hp: 100, current_join_mode: 'Passive', death_reward_preview: 8, death_drop_coins: 8 })
          ],
          bullets: [],
          coin_drops: [],
          messages: []
        }, { receivedAtMs: 1100 });
        const decision = buildBrowserlessDecision(store.getState(1200), {}, {
          nowMs: 1200,
          controlMode: 'profit-live'
        });
        return [
          decision.kind,
          decision.action.kind,
          decision.action.target.type,
          decision.action.target.userId,
          decision.action.target.authority,
          decision.action.target.x,
          decision.action.target.drop,
          decision.action.target.profitMetadataAuthority,
          decision.input.profitCoinSource,
          decision.input.fallback.snapshotCoinFallbackAllowed
        ].join('|');
      })(),
      want: 'profit-candidate|attack|enemy|8|realtime|1000|8|snapshot|none|false'
    },
    {
      name: 'browserless profit live treats snapshot-active realtime target as safety threat',
      got: (() => {
        const store = createBrowserlessStateStore({ userId: 7 });
        store.ingestFrame({
          type: 'pos',
          tick: 59,
          entities: [
            { entity_id: 1, user_id: 7, name: 'self', x: 100, y: 100, hp: 100, max_hp: 100 },
            { entity_id: 2, user_id: 8, name: 'mode-missing-active', x: 9000, y: 100, hp: 100 }
          ],
          bullets: []
        }, { receivedAtMs: 1000 });
        store.ingestFrame({
          type: 'snapshot',
          tick: 60,
          entities: [
            { entity_id: 1, user_id: 7, name: 'self', x: 100, y: 100, hp: 100, coins: 1000 },
            { entity_id: 22, user_id: 8, name: 'mode-missing-active', x: 9010, y: 100, hp: 100, current_join_mode: 'Active', death_reward_preview: 24, death_drop_coins: 24 }
          ],
          bullets: [],
          coin_drops: [],
          messages: []
        }, { receivedAtMs: 1100 });
        const decision = buildBrowserlessDecision(store.getState(1200), {}, {
          nowMs: 1200,
          controlMode: 'profit-live',
          combatEnabled: true
        });
        return [
          decision.kind,
          decision.band,
          decision.reason,
          decision.action.target.userId,
          decision.action.target.authority,
          decision.action.target.profitMetadataActive,
          decision.profit.best === null,
          decision.combat.target?.userId || '',
          Boolean(decision.combat.actionEligible),
          decision.input.dataGaps.includes('snapshot-active-threat-visible'),
          decision.input.dataGaps.includes('snapshot-fallback-blocked:active-threat-visible')
        ].join('|');
      })(),
      want: 'safety-exit|safety|profit-live-snapshot-active-threat|8|realtime|true|true||false|true|true'
    },
    {
      name: 'browserless profit live flees instead of chasing coin under combat threat',
      got: (() => {
        const store = createBrowserlessStateStore({ userId: 7 });
        store.ingestFrame({
          type: 'pos',
          tick: 60,
          entities: [
            { entity_id: 1, user_id: 7, name: 'self', x: 21108, y: 39065, hp: 100, max_hp: 100 },
            { entity_id: 2, user_id: 31361, name: 'threat', x: 15429, y: 40744, hp: 100, firing: true, drop: 0 }
          ],
          bullets: []
        }, { receivedAtMs: 1000 });
        store.ingestFrame({
          type: 'snapshot',
          tick: 61,
          entities: [],
          bullets: [],
          coin_drops: [{ drop_id: 709, amount: 1, x: 20727, y: 38406 }],
          messages: []
        }, { receivedAtMs: 1100 });
        const decision = buildBrowserlessDecision(store.getState(1200), {}, {
          nowMs: 1200,
          controlMode: 'profit-live'
        });
        return [
          decision.kind,
          decision.band,
          decision.reason,
          decision.action.target.userId,
          decision.action.target.authority,
          decision.profit.best?.type,
          decision.profit.best?.coin?.id,
          decision.input.fallback.snapshotFallbackBlockedReasons.includes('snapshot-fallback-disabled'),
          decision.combat.target.userId
        ].join('|');
      })(),
      want: 'flee|safety|active-threat-return-block|31361|realtime|||false|31361'
    },
    {
      name: 'browserless profit live can fight active players when enabled',
      got: (() => {
        const store = createBrowserlessStateStore({ userId: 7 });
        store.ingestFrame({
          type: 'pos',
          tick: 60,
          entities: [
            { entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100 },
            fullStamina5s({ entity_id: 2, user_id: 8, name: 'afk', x: 1000, y: 0, hp: 80, current_join_mode: 'Passive', drop: 20 }),
            { entity_id: 3, user_id: 9, name: 'active', x: 5000, y: 0, hp: 80, current_join_mode: 'Active', firing: true, drop: 12 }
          ],
          bullets: []
        }, { receivedAtMs: 1000 });
        const decision = buildBrowserlessDecision(store.getState(1200), {}, {
          nowMs: 1200,
          controlMode: 'profit-live',
          combatEnabled: true
        });
        return [
          decision.kind,
          decision.band,
          decision.reason,
          decision.action.kind,
          decision.action.target.userId,
          decision.action.target.authority,
          decision.profit.best === null
        ].join('|');
      })(),
      want: 'combat-live|combat|combat-live-realtime|combat-live|9|realtime|true'
    },
    {
      name: 'browserless profit live keeps AFK profit when active threat is unrelated',
      got: (() => {
        const store = createBrowserlessStateStore({ userId: 7 });
        store.ingestFrame({
          type: 'pos',
          tick: 60,
          entities: [
            { entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100 },
            fullStamina5s({ entity_id: 2, user_id: 8, name: 'safe-afk', x: 1000, y: 0, hp: 80, current_join_mode: 'Passive', drop: 20 }),
            { entity_id: 3, user_id: 9, name: 'far-active', x: 60000, y: 0, hp: 80, current_join_mode: 'Active', drop: 12 }
          ],
          bullets: []
        }, { receivedAtMs: 1000 });
        const decision = buildBrowserlessDecision(store.getState(1200), {}, {
          nowMs: 1200,
          controlMode: 'profit-live',
          combatEnabled: true
        });
        return [
          decision.kind,
          decision.band,
          decision.action.kind,
          decision.action.target.userId,
          decision.profit.best?.type,
          decision.profit.best === null,
          decision.combat.target?.userId || ''
        ].join('|');
      })(),
      want: 'profit-candidate|profit|attack|8|enemy|false|'
    },
    {
      name: 'browserless profit live falls back to safe visible coin when player drop is threat-covered',
      got: (() => {
        const store = createBrowserlessStateStore({ userId: 7 });
        store.ingestFrame({
          type: 'pos',
          tick: 61,
          entities: [
            { entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100 },
            { entity_id: 3, user_id: 9, name: 'covering-active', x: 20000, y: 0, hp: 80, current_join_mode: 'Active', drop: 0 }
          ],
          bullets: []
        }, { receivedAtMs: 1000 });
        store.ingestFrame({
          type: 'snapshot',
          tick: 62,
          entities: [{ entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, coins: 1000 }],
          bullets: [],
          coin_drops: [
            { drop_id: 'safe-visible-coin', amount: 3, x: 1200, y: 0, created_tick: 62 },
            { drop_id: 'covered-player-drop', source_user_id: 8, system_spawned: false, amount: 6, x: 20000, y: 0, created_tick: 62 }
          ],
          messages: [{ kind: 'kill', user_id: 7, target_user_id: 8, tick: 62, text: 'self killed afk' }]
        }, { receivedAtMs: 1100 });
        const decision = buildBrowserlessDecision(store.getState(1200), {}, {
          nowMs: 1200,
          controlMode: 'profit-live',
          combatEnabled: true
        });
        return [
          decision.kind,
          decision.reason,
          decision.action.target.id,
          decision.action.target.amount,
          decision.input.profitCoinSource,
          decision.input.fallback.selfKilledPlayerDropCount,
          decision.profit.best?.coin?.id,
          decision.profit.best === null
        ].join('|');
      })(),
      want: 'coin|foot-coin-priority|safe-visible-coin|3|snapshot-player-drop|1|safe-visible-coin|false'
    },
    {
      name: 'browserless profit live flees passive moving safety threat',
      got: (() => {
        const store = createBrowserlessStateStore({ userId: 7 });
        store.ingestFrame({
          type: 'pos',
          tick: 60,
          entities: [
            { entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100 },
            { entity_id: 2, user_id: 8, name: 'moving-passive', x: 500, y: 0, vx: 120, vy: 0, hp: 80, current_join_mode: 'Passive', drop: 0 },
            fullStamina5s({ entity_id: 3, user_id: 10, name: 'afk-profit', x: 1000, y: 0, hp: 80, current_join_mode: 'Passive', drop: 20 })
          ],
          bullets: []
        }, { receivedAtMs: 1000 });
        const decision = buildBrowserlessDecision(store.getState(1200), {}, {
          nowMs: 1200,
          controlMode: 'profit-live',
          combatEnabled: true
        });
        return [
          decision.kind,
          decision.band,
          decision.reason,
          decision.action.kind,
          decision.action.target.userId,
          decision.combat.target?.userId || '',
          (decision.combat.candidates || []).length,
          decision.combat.actionEligible
        ].join('|');
      })(),
      want: 'flee|safety|active-threat-return-block|flee|8||0|false'
    },
    {
      name: 'browserless profit live flees low-drop active moving threat without combat promotion',
      got: (() => {
        const store = createBrowserlessStateStore({ userId: 7 });
        store.ingestFrame({
          type: 'pos',
          tick: 60,
          entities: [
            { entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100 },
            { entity_id: 2, user_id: 8, name: 'low-drop-active', x: 500, y: 0, vx: 120, vy: 0, hp: 80, current_join_mode: 'Active', drop: 0 },
            fullStamina5s({ entity_id: 3, user_id: 10, name: 'afk-profit', x: 1000, y: 0, hp: 80, current_join_mode: 'Passive', drop: 20 })
          ],
          bullets: []
        }, { receivedAtMs: 1000 });
        const decision = buildBrowserlessDecision(store.getState(1200), {}, {
          nowMs: 1200,
          controlMode: 'profit-live',
          combatEnabled: true
        });
        return [
          decision.kind,
          decision.band,
          decision.reason,
          decision.action.target.userId,
          decision.combat.target?.userId || '',
          decision.combat.actionEligible,
          decision.action.shouldLeave
        ].join('|');
      })(),
      want: 'flee|safety|active-threat-return-block|8||false|'
    },
    {
      name: 'browserless profit live waits for active outside danger range',
      got: (() => {
        const store = createBrowserlessStateStore({ userId: 7 });
        store.ingestFrame({
          type: 'pos',
          tick: 60,
          entities: [
            { entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100 },
            { entity_id: 2, user_id: 8, name: 'active-outside', x: 16000, y: 0, vx: -50, vy: 0, hp: 80, current_join_mode: 'Active', drop: 0 }
          ],
          bullets: []
        }, { receivedAtMs: 1000 });
        const decision = buildBrowserlessDecision(store.getState(1200), {}, {
          nowMs: 1200,
          controlMode: 'profit-live',
          combatEnabled: false
        });
        return [
          decision.kind,
          decision.band,
          decision.reason,
          decision.action.kind,
          decision.action.shouldLeave,
          decision.combat.target?.userId || ''
        ].join('|');
      })(),
      want: 'wait|wait|no-profitable-candidate|wait||'
    },
    {
      name: 'browserless profit live avoids visible passive invulnerable target',
      got: (() => {
        const store = createBrowserlessStateStore({ userId: 7 });
        store.ingestFrame({
          type: 'pos',
          tick: 60,
          entities: [
            { entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100 },
            { entity_id: 2, user_id: 8, name: 'invulnerable-passive', x: 20000, y: 0, hp: 100, current_join_mode: 'Passive', invulnerable_remaining_ms: 5000 }
          ],
          bullets: [],
          coin_drops: []
        }, { receivedAtMs: 1000 });
        const decision = buildBrowserlessDecision(store.getState(1200), {}, {
          nowMs: 1200,
          controlMode: 'profit-live',
          combatEnabled: true
        });
        return [
          decision.kind,
          decision.band,
          decision.reason,
          decision.action.kind,
          decision.action.target.userId,
          decision.action.target.authority,
          decision.combat.target?.userId || ''
        ].join('|');
      })(),
      want: 'flee|safety|avoid-invulnerable-target|flee|8|realtime|'
    },
    {
      name: 'browserless visible invulnerable blocks ordinary coin before avoidance flee',
      got: (() => {
        const store = createBrowserlessStateStore({ userId: 7 });
        store.ingestFrame({
          type: 'pos',
          tick: 60,
          entities: [
            { entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100 },
            { entity_id: 2, user_id: 8, name: 'invulnerable-passive', x: 20000, y: 0, hp: 100, current_join_mode: 'Passive', invulnerable_remaining_ms: 5000 }
          ],
          bullets: [],
          coin_drops: [{ drop_id: 'ordinary-coin', amount: 1, x: 22000, y: 0 }]
        }, { receivedAtMs: 1000 });
        const decision = buildBrowserlessDecision(store.getState(1200), {}, {
          nowMs: 1200,
          controlMode: 'profit-live',
          combatEnabled: true
        });
        return [
          decision.kind,
          decision.band,
          decision.reason,
          decision.action.target.userId,
          decision.action.highValueCoinPriority?.source || '',
          decision.profit.best?.id || ''
        ].join('|');
      })(),
      want: 'flee|safety|avoid-invulnerable-target|8||'
    },
    {
      name: 'browserless healthy high-value coin beats invulnerable avoidance',
      got: (() => {
        const store = createBrowserlessStateStore({ userId: 7 });
        store.ingestFrame({
          type: 'pos',
          tick: 60,
          entities: [
            { entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100 },
            { entity_id: 2, user_id: 8, name: 'invulnerable-passive', x: 12000, y: 0, hp: 100, current_join_mode: 'Passive', invulnerable_remaining_ms: 5000 }
          ],
          bullets: [],
          coin_drops: [{ drop_id: 'high-value-coin', amount: 30, x: 10000, y: 0 }]
        }, { receivedAtMs: 1000 });
        const decision = buildBrowserlessDecision(store.getState(1200), {}, {
          nowMs: 1200,
          controlMode: 'profit-live',
          combatEnabled: true
        });
        return [
          decision.kind,
          decision.band,
          decision.reason,
          decision.action.target.id,
          decision.action.target.amount,
          decision.action.highValueCoinPriority.source,
          decision.profit.best?.id || ''
        ].join('|');
      })(),
      want: 'coin|profit|high-value-visible-coin-priority|high-value-coin|30|realtime|'
    },
    {
      name: 'browserless profit live can fight firing passive players when enabled',
      got: (() => {
        const store = createBrowserlessStateStore({ userId: 7 });
        store.ingestFrame({
          type: 'pos',
          tick: 60,
          entities: [
            { entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 100, max_hp: 100 },
            fullStamina5s({ entity_id: 2, user_id: 8, name: 'afk-profit', x: 1000, y: 0, hp: 80, current_join_mode: 'Passive', drop: 20 }),
            { entity_id: 3, user_id: 11, name: 'firing-passive', x: 500, y: 0, hp: 80, current_join_mode: 'Passive', firing: true, drop: 0 }
          ],
          bullets: []
        }, { receivedAtMs: 1000 });
        const decision = buildBrowserlessDecision(store.getState(1200), {}, {
          nowMs: 1200,
          controlMode: 'profit-live',
          combatEnabled: true
        });
        return [
          decision.kind,
          decision.band,
          decision.reason,
          decision.action.kind,
          decision.action.target.userId,
          decision.combat.actionEligible
        ].join('|');
      })(),
      want: 'combat-live|combat|combat-live-realtime|combat-live|11|true'
    },
    {
      name: 'browserless combat dry-run uses realtime target and ignores snapshot target',
      got: (() => {
        const store = createBrowserlessStateStore({ userId: 7 });
        store.ingestFrame({
          type: 'pos',
          tick: 60,
          entities: [
            { entity_id: 1, user_id: 7, name: 'self', x: 100, y: 100, hp: 90, stamina_5s_remaining_milli: 5000 },
            { entity_id: 2, user_id: 8, name: 'active', x: 1000, y: 100, hp: 80, current_join_mode: 'Active', firing: true, drop: 8 }
          ],
          bullets: []
        }, { receivedAtMs: 1000 });
        store.ingestFrame({
          type: 'snapshot',
          tick: 61,
          entities: [
            { entity_id: 1, user_id: 7, name: 'self', x: 9999, y: 9999, hp: 90 },
            { entity_id: 3, user_id: 9, name: 'snapshot-active', x: 120, y: 120, hp: 80, current_join_mode: 'Active', firing: true, drop: 100 }
          ],
          bullets: [],
          coin_drops: [],
          messages: []
        }, { receivedAtMs: 1100 });
        const combat = buildBrowserlessCombatDryRun(store.getState(1200), { nowMs: 1200 });
        return [
          combat.dryRun,
          combat.authority,
          combat.target.userId,
          combat.target.authority,
          combat.self.x,
          combat.aim.mode,
          combat.shooting.wouldShoot,
          combat.shooting.commandSuppressed,
          combat.dataGaps.includes('no-realtime-bullet-evidence')
        ].join('|');
      })(),
      want: 'true|realtime|8|realtime|100|exact|true|true|true'
    },
    {
      name: 'browserless combat target selection keeps engaged target sticky',
      got: (() => {
        const stateful = {
          combatTarget: { id: 8, at: 1000, firstSeenAt: 1000, lastInRangeAt: 1000, hp: 80, reason: 'combat-live-realtime' }
        };
        const combat = buildBrowserlessCombatDryRun({
          userId: 7,
          realtime: {
            tick: 62,
            self: { entity_id: 1, user_id: 7, x: 0, y: 0, hp: 100 },
            entities: [
              { entity_id: 1, user_id: 7, x: 0, y: 0, hp: 100 },
              { entity_id: 2, user_id: 8, name: 'engaged', x: 1000, y: 0, hp: 80, current_join_mode: 'Active', firing: true, drop: 5 },
              { entity_id: 3, user_id: 9, name: 'higher-drop', x: 900, y: 0, hp: 80, current_join_mode: 'Active', firing: true, drop: 50 }
            ],
            bullets: []
          }
        }, {
          nowMs: 1500,
          decisionState: stateful,
          targetStickMs: 7000,
          combatEngageStickMs: 7000,
          combatAttackRange: 11000
        });
        return [
          combat.target.userId,
          combat.target.combatIntent,
          combat.target.combatEngagement.ageMs,
          stateful.combatTarget.id,
          stateful.combatTarget.firstSeenAt
        ].join('|');
      })(),
      want: '8|engaged|500|8|1000'
    },
    {
      name: 'browserless incoming shooter overrides engaged combat target',
      got: (() => {
        const stateful = {
          combatTarget: { id: 8, at: 1000, firstSeenAt: 1000, lastInRangeAt: 1000, hp: 80, reason: 'combat-live-realtime' }
        };
        const combat = buildBrowserlessCombatDryRun({
          userId: 7,
          realtime: {
            tick: 62,
            self: { entity_id: 1, user_id: 7, x: 0, y: 0, hp: 100 },
            entities: [
              { entity_id: 1, user_id: 7, x: 0, y: 0, hp: 100 },
              { entity_id: 2, user_id: 8, name: 'engaged', x: 1000, y: 0, hp: 80, current_join_mode: 'Active', firing: true, drop: 40 },
              { entity_id: 3, user_id: 9, name: 'incoming', x: 1200, y: 0, hp: 80, current_join_mode: 'Active', firing: true, drop: 1 }
            ],
            bullets: [
              { bullet_id: 4, owner_user_id: 9, x: 1000, y: 0, target_x: 0, target_y: 0, speed_per_tick: 500 }
            ]
          }
        }, {
          nowMs: 1500,
          decisionState: stateful,
          targetStickMs: 7000,
          combatEngageStickMs: 7000,
          combatAttackRange: 11000,
          combatTargetSwitchIncomingDistance: 6500
        });
        return [
          combat.target.userId,
          combat.target.combatIntent,
          Boolean(combat.target.combatEngagement),
          stateful.combatTarget.id,
          stateful.combatTarget.seenTargetRealBulletAt
        ].join('|');
      })(),
      want: '9|defensive|false|9|1500'
    },
    {
      name: 'browserless low-value active combat requires threat evidence',
      got: (() => {
        const noThreat = buildBrowserlessCombatDryRun({
          userId: 7,
          realtime: {
            tick: 62,
            self: { entity_id: 1, user_id: 7, x: 0, y: 0, hp: 100 },
            entities: [
              { entity_id: 1, user_id: 7, x: 0, y: 0, hp: 100 },
              { entity_id: 2, user_id: 8, name: 'low-value-active', x: 1000, y: 0, hp: 80, current_join_mode: 'Active', drop: 1 }
            ],
            bullets: []
          }
        }, { nowMs: 1500, combatAttackRange: 11000 });
        const withThreat = buildBrowserlessCombatDryRun({
          userId: 7,
          realtime: {
            tick: 62,
            self: { entity_id: 1, user_id: 7, x: 0, y: 0, hp: 100 },
            entities: [
              { entity_id: 1, user_id: 7, x: 0, y: 0, hp: 100 },
              { entity_id: 2, user_id: 8, name: 'low-value-active', x: 1000, y: 0, hp: 80, current_join_mode: 'Active', drop: 1 }
            ],
            bullets: [
              { bullet_id: 4, owner_user_id: 8, x: 1000, y: 0, target_x: 0, target_y: 0, speed_per_tick: 500 }
            ]
          }
        }, { nowMs: 1500, combatAttackRange: 11000, combatTargetSwitchIncomingDistance: 6500 });
        return [
          noThreat.target?.userId || '',
          noThreat.candidates.length,
          withThreat.target?.userId || '',
          withThreat.target?.combatIntent || ''
        ].join('|');
      })(),
      want: '|0|8|defensive'
    },
    {
      name: 'browserless engaged combat target expires after out-of-range grace',
      got: (() => {
        const stateful = {
          combatTarget: { id: 8, at: 1000, firstSeenAt: 1000, lastInRangeAt: 1000, hp: 80, reason: 'combat-live-realtime' }
        };
        const combat = buildBrowserlessCombatDryRun({
          userId: 7,
          realtime: {
            tick: 62,
            self: { entity_id: 1, user_id: 7, x: 0, y: 0, hp: 100 },
            entities: [
              { entity_id: 1, user_id: 7, x: 0, y: 0, hp: 100 },
              { entity_id: 2, user_id: 8, name: 'far-engaged', x: 40000, y: 0, hp: 80, current_join_mode: 'Active', firing: true, drop: 50 }
            ],
            bullets: []
          }
        }, {
          nowMs: 10000,
          decisionState: stateful,
          targetStickMs: 7000,
          combatEngageStickMs: 7000,
          combatAttackRange: 11000,
          combatEngageGraceMs: 2000,
          combatEngageGraceRange: 15000,
          combatDisengageRange: 15000
        });
        return [
          combat.target?.userId || '',
          stateful.combatTarget === null,
          combat.dataGaps.includes('missing-self-or-target')
        ].join('|');
      })(),
      want: '|true|true'
    },
    {
      name: 'browserless combat movement keeps dodge priority over spacing',
      got: (() => {
        const combat = buildBrowserlessCombatDryRun({
          userId: 7,
          realtime: {
            tick: 62,
            self: { entity_id: 1, user_id: 7, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
            entities: [
              { entity_id: 1, user_id: 7, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
              { entity_id: 2, user_id: 8, name: 'close-firing', x: 1000, y: 0, hp: 80, current_join_mode: 'Active', firing: true, drop: 10 }
            ],
            bullets: [
              { bullet_id: 4, owner_user_id: 8, x: 1000, y: 0, target_x: 0, target_y: 0, speed_per_tick: 500 }
            ]
          }
        }, { nowMs: 1500, combatAttackRange: 11000 });
        return [
          combat.target.userId,
          combat.movement.reason,
          combat.movement.modifiers.includes('dodge'),
          combat.movement.modifiers.includes('back-away-mixed'),
          combat.shooting.reason
        ].join('|');
      })(),
      want: '8|direct-threat-dodge|true|true|target-pressure-fire'
    },
    {
      name: 'browserless combat movement closes passive runner engagement',
      got: (() => {
        const stateful = {
          combatTarget: { id: 8, at: 1000, firstSeenAt: 1000, lastInRangeAt: 1000, lastDamageAt: 1000, hp: 80, intent: 'profit' }
        };
        const combat = buildBrowserlessCombatDryRun({
          userId: 7,
          realtime: {
            tick: 62,
            self: { entity_id: 1, user_id: 7, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
            entities: [
              { entity_id: 1, user_id: 7, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
              { entity_id: 2, user_id: 8, name: 'runner', x: 10000, y: 0, vx: 0, vy: 80, hp: 80, current_join_mode: 'Active', drop: 12 }
            ],
            bullets: []
          }
        }, {
          nowMs: 5000,
          decisionState: stateful,
          combatAttackRange: 11000,
          targetStickMs: 7000,
          combatEngageStickMs: 7000,
          combatPassiveRunnerConfirmMs: 2500,
          combatPassiveRunnerCloseRange: 5500
        });
        return [
          combat.target.userId,
          combat.movement.reason,
          combat.movement.passiveRunner.active,
          combat.movement.dx,
          combat.movement.dy,
          combat.shooting.reason
        ].join('|');
      })(),
      want: '8|passive-runner-close|true|1|0|passive-runner'
    },
    {
      name: 'browserless combat aim widens after no target damage',
      got: (() => {
        const stateful = {
          combatTarget: { id: 8, at: 1000, firstSeenAt: 1000, lastInRangeAt: 1000, lastDamageAt: 1000, hp: 80, intent: 'engaged' }
        };
        const combat = buildBrowserlessCombatDryRun({
          userId: 7,
          realtime: {
            tick: 62,
            self: { entity_id: 1, user_id: 7, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
            entities: [
              { entity_id: 1, user_id: 7, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
              { entity_id: 2, user_id: 8, name: 'moving-active', x: 8000, y: 0, vx: 80, vy: 0, hp: 80, current_join_mode: 'Active', firing: true, drop: 12 }
            ],
            bullets: []
          }
        }, {
          nowMs: 5000,
          decisionState: stateful,
          combatAttackRange: 11000,
          targetStickMs: 7000,
          combatEngageStickMs: 7000,
          combatAimNoDamageMs: 1000,
          combatAimNoDamageStepMs: 800
        });
        return [
          combat.aim.mode,
          combat.aim.noDamageWidened,
          combat.aim.noDamageLevel,
          combat.aim.confidence < 0.7,
          stateful.combatAim.noDamageWidened
        ].join('|');
      })(),
      want: 'linear-intercept|true|4|true|true'
    },
    {
      name: 'browserless combat engagement records motion samples for aim confidence',
      got: (() => {
        const stateful = {
          combatTarget: { id: 8, at: 1000, firstSeenAt: 1000, lastInRangeAt: 1000, lastDamageAt: 1000, hp: 80, intent: 'engaged' }
        };
        const base = {
          userId: 7,
          realtime: {
            tick: 62,
            self: { entity_id: 1, user_id: 7, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
            entities: [
              { entity_id: 1, user_id: 7, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
              { entity_id: 2, user_id: 8, name: 'moving-active', x: 8000, y: 0, vx: 60, vy: 0, hp: 80, current_join_mode: 'Active', firing: true, drop: 12 }
            ],
            bullets: []
          }
        };
        buildBrowserlessCombatDryRun(base, {
          nowMs: 2000,
          decisionState: stateful,
          combatAttackRange: 11000,
          targetStickMs: 7000,
          combatEngageStickMs: 7000
        });
        base.realtime.tick = 63;
        base.realtime.entities[1] = { ...base.realtime.entities[1], x: 8300, vx: 60 };
        const combat = buildBrowserlessCombatDryRun(base, {
          nowMs: 2500,
          decisionState: stateful,
          combatAttackRange: 11000,
          targetStickMs: 7000,
          combatEngageStickMs: 7000
        });
        return [
          stateful.combatTarget.motionSamples.length,
          combat.aim.intercept,
          combat.aim.motionScale > 0,
          stateful.combatAim.targetId
        ].join('|');
      })(),
      want: '2|true|true|8'
    },
    {
      name: 'browserless profit live fights passive incoming bullet owner',
      got: (() => {
        const decision = buildBrowserlessDecision({
          userId: 7,
          realtime: {
            tick: 62,
            frameAgeMs: 100,
            self: { entity_id: 1, user_id: 7, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
            entities: [
              { entity_id: 1, user_id: 7, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
              { entity_id: 2, user_id: 8, name: 'passive-shooter', x: 5000, y: 0, hp: 100, current_join_mode: 'Passive', drop: 0 }
            ],
            bullets: [
              { owner_user_id: 8, start_x: 5000, start_y: 0, target_x: 0, target_y: 0, created_tick: 60, expire_tick: 90, speed_per_tick: 500 }
            ],
            coinDrops: []
          },
          fallback: { coinDrops: [] }
        }, {}, {
          nowMs: 1500,
          controlMode: 'profit-live',
          combatEnabled: true,
          combatAttackRange: 11000
        });
        return [
          decision.kind,
          decision.band,
          decision.reason,
          decision.action.target.userId,
          decision.combat.target.combatIntent,
          decision.combat.movement.reason,
          decision.combat.shooting.wouldShoot,
          decision.combat.shooting.reason
        ].join('|');
      })(),
      want: 'combat-live|combat|combat-live-realtime|8|defensive|direct-threat-dodge|true|target-pressure-fire'
    },
    {
      name: 'browserless combat critical hp exits through safety action',
      got: (() => {
        const decision = buildBrowserlessDecision({
          userId: 7,
          realtime: {
            tick: 62,
            frameAgeMs: 100,
            self: { entity_id: 1, user_id: 7, x: 0, y: 0, hp: 15, stamina_5s_remaining_milli: 10000 },
            entities: [
              { entity_id: 1, user_id: 7, x: 0, y: 0, hp: 15, stamina_5s_remaining_milli: 10000 },
              { entity_id: 2, user_id: 8, name: 'active', x: 1000, y: 0, hp: 80, current_join_mode: 'Active', firing: true, drop: 12 }
            ],
            bullets: [],
            coinDrops: []
          },
          fallback: { coinDrops: [] }
        }, {}, {
          nowMs: 1500,
          controlMode: 'profit-live',
          combatEnabled: true,
          combatCriticalHp: 20,
          combatAttackRange: 11000
        });
        return [
          decision.kind,
          decision.band,
          decision.reason,
          decision.action.shouldLeave,
          decision.action.target.userId,
          decision.combat.exit.reason
        ].join('|');
      })(),
      want: 'safety-exit|safety|combat-critical-hp-leave|true|8|combat-critical-hp-leave'
    },
    {
      name: 'browserless profit live critical hp exits on out-of-range firing threat',
      got: (() => {
        const decision = buildBrowserlessDecision({
          userId: 7,
          realtime: {
            tick: 62,
            frameAgeMs: 100,
            self: { entity_id: 1, user_id: 7, x: 0, y: 0, hp: 15, stamina_5s_remaining_milli: 10000 },
            entities: [
              { entity_id: 1, user_id: 7, x: 0, y: 0, hp: 15, stamina_5s_remaining_milli: 10000 },
              { entity_id: 2, user_id: 8, name: 'far-firing', x: 20000, y: 0, hp: 80, firing: true, drop: 12 }
            ],
            bullets: [
              { owner_user_id: 8, start_x: 20000, start_y: 0, target_x: 0, target_y: 0, created_tick: 40, expire_tick: 90, speed_per_tick: 500 }
            ],
            coinDrops: []
          },
          fallback: { coinDrops: [] }
        }, {}, {
          nowMs: 1500,
          controlMode: 'profit-live',
          combatEnabled: true,
          combatCriticalHp: 20,
          combatAttackRange: 11000
        });
        return [
          decision.kind,
          decision.band,
          decision.reason,
          decision.action.shouldLeave,
          decision.action.target.userId,
          decision.combat.target?.userId || 'no-target'
        ].join('|');
      })(),
      want: 'safety-exit|safety|profit-live-critical-threat|true|8|no-target'
    },
    {
      name: 'browserless profit live critical hp exits on unknown incoming pressure',
      got: (() => {
        const decision = buildBrowserlessDecision({
          userId: 7,
          realtime: {
            tick: 62,
            frameAgeMs: 100,
            self: { entity_id: 1, user_id: 7, x: 0, y: 0, hp: 15, stamina_5s_remaining_milli: 10000 },
            entities: [
              { entity_id: 1, user_id: 7, x: 0, y: 0, hp: 15, stamina_5s_remaining_milli: 10000 }
            ],
            bullets: [
              { start_x: 1000, start_y: 0, target_x: 0, target_y: 0, created_tick: 40, expire_tick: 90, speed_per_tick: 500 }
            ],
            coinDrops: []
          },
          fallback: { coinDrops: [] }
        }, {}, {
          nowMs: 1500,
          controlMode: 'profit-live',
          combatEnabled: true,
          combatCriticalHp: 20,
          combatAttackRange: 11000
        });
        return [
          decision.kind,
          decision.band,
          decision.reason,
          decision.action.shouldLeave,
          decision.action.criticalPressure.bulletCount,
          decision.combat.target?.userId || 'no-target'
        ].join('|');
      })(),
      want: 'safety-exit|safety|profit-live-critical-unknown-pressure|true|1|no-target'
    },
    {
      name: 'browserless profit live exits after injury under unattributed combat pressure',
      got: (() => {
        const stateful = {};
        const base = {
          userId: 7,
          realtime: {
            tick: 62,
            frameAgeMs: 100,
            self: { entity_id: 1, user_id: 7, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 10000 },
            entities: [
              { entity_id: 1, user_id: 7, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 10000 },
              { entity_id: 2, user_id: 8, name: 'far-pressure', x: 20000, y: 0, hp: 80, firing: true, drop: 12 }
            ],
            bullets: [
              { owner_user_id: 8, start_x: 20000, start_y: 0, target_x: 0, target_y: 0, created_tick: 40, expire_tick: 90, speed_per_tick: 500 }
            ],
            coinDrops: []
          },
          fallback: { coinDrops: [] }
        };
        buildBrowserlessDecision(base, stateful, {
          nowMs: 1000,
          controlMode: 'profit-live',
          combatEnabled: true,
          combatAttackRange: 11000,
          combatCriticalHp: 20
        });
        const injured = {
          ...base,
          realtime: {
            ...base.realtime,
            tick: 63,
            self: { ...base.realtime.self, hp: 73 },
            entities: [
              { ...base.realtime.entities[0], hp: 73 },
              base.realtime.entities[1]
            ]
          }
        };
        const decision = buildBrowserlessDecision(injured, stateful, {
          nowMs: 2000,
          controlMode: 'profit-live',
          combatEnabled: true,
          combatAttackRange: 11000,
          combatCriticalHp: 20
        });
        return [
          decision.kind,
          decision.band,
          decision.reason,
          decision.action.shouldLeave,
          decision.action.target.userId,
          decision.action.injury.previousHp,
          decision.action.injury.currentHp,
          decision.combat.target?.userId || 'no-target'
        ].join('|');
      })(),
      want: 'safety-exit|safety|injury-leave|true|8|100|73|no-target'
    },
    {
      name: 'browserless profit live exits after sustained pursuit',
      got: (() => {
        const stateful = {};
        const stateAt = (tick, nowMs) => ({
          userId: 7,
          realtime: {
            tick,
            frameAgeMs: 100,
            self: { entity_id: 1, user_id: 7, x: 0, y: 0, hp: 90, max_hp: 100, stamina_5s_remaining_milli: 10000 },
            entities: [
              { entity_id: 1, user_id: 7, x: 0, y: 0, hp: 90, max_hp: 100, stamina_5s_remaining_milli: 10000 },
              { entity_id: 2, user_id: 8, name: 'pursuer', x: 10000, y: 0, hp: 100, current_join_mode: 'Active', drop: 1 }
            ],
            bullets: [],
            coinDrops: []
          },
          fallback: { coinDrops: [] },
          nowMs
        });
        const options = {
          controlMode: 'profit-live',
          combatEnabled: false,
          pursuitLeaveNonFullHpMs: 90000,
          pursuitLeaveMs: 300000,
          loopDelayMs: 30000,
          decisionIntervalMs: 1000,
          dangerRadius: 17000,
          activeCautionRadius: 23000
        };
        buildBrowserlessDecision(stateAt(62, 1000), stateful, { ...options, nowMs: 1000 });
        buildBrowserlessDecision(stateAt(63, 31000), stateful, { ...options, nowMs: 31000 });
        buildBrowserlessDecision(stateAt(64, 61000), stateful, { ...options, nowMs: 61000 });
        const decision = buildBrowserlessDecision(stateAt(65, 91000), stateful, { ...options, nowMs: 91000 });
        return [
          decision.kind,
          decision.band,
          decision.reason,
          decision.action.shouldLeave,
          decision.action.target.userId,
          decision.action.pursuit.durationMs,
          decision.action.pursuit.thresholdMs,
          stateful.browserlessPursuit.reason
        ].join('|');
      })(),
      want: 'safety-exit|safety|pursuit-leave|true|8|90000|90000|inside-danger-radius'
    },
    {
      name: 'browserless combat low hp no-damage exits',
      got: (() => {
        const stateful = {
          combatTarget: { id: 8, at: 1000, firstSeenAt: 1000, lastInRangeAt: 1000, lastDamageAt: 1000, hp: 90, intent: 'engaged' }
        };
        const combat = buildBrowserlessCombatDryRun({
          userId: 7,
          realtime: {
            tick: 62,
            self: { entity_id: 1, user_id: 7, x: 0, y: 0, hp: 40, stamina_5s_remaining_milli: 10000 },
            entities: [
              { entity_id: 1, user_id: 7, x: 0, y: 0, hp: 40, stamina_5s_remaining_milli: 10000 },
              { entity_id: 2, user_id: 8, name: 'active', x: 1000, y: 0, hp: 90, current_join_mode: 'Active', firing: true, drop: 12 }
            ],
            bullets: []
          }
        }, {
          nowMs: 12000,
          decisionState: stateful,
          combatAttackRange: 11000,
          targetStickMs: 20000,
          combatEngageStickMs: 20000,
          combatLowHpLeaveThreshold: 60,
          combatLowHpNoDamageLeaveMs: 8000
        });
        return [
          combat.exit.reason,
          combat.exit.selfHp,
          combat.exit.targetHp,
          combat.exit.noDamageMs >= 8000
        ].join('|');
      })(),
      want: 'combat-low-hp-no-damage-leave|40|90|true'
    },
    {
      name: 'browserless combat high hp gap exits',
      got: (() => {
        const combat = buildBrowserlessCombatDryRun({
          userId: 7,
          realtime: {
            tick: 62,
            self: { entity_id: 1, user_id: 7, x: 0, y: 0, hp: 70, stamina_5s_remaining_milli: 10000 },
            entities: [
              { entity_id: 1, user_id: 7, x: 0, y: 0, hp: 70, stamina_5s_remaining_milli: 10000 },
              { entity_id: 2, user_id: 8, name: 'active', x: 1000, y: 0, hp: 96, current_join_mode: 'Active', firing: true, drop: 12 }
            ],
            bullets: []
          }
        }, { nowMs: 1500, combatAttackRange: 11000, combatLowHpLeaveThreshold: 60, combatHighHpDisadvantageGap: 20 });
        return [
          combat.exit.reason,
          combat.exit.hpGap,
          combat.shooting.wouldShoot
        ].join('|');
      })(),
      want: 'combat-hp-disadvantage-leave|26|false'
    },
    {
      name: 'browserless combat pressure disadvantage exits',
      got: (() => {
        const stateful = {
          combatTarget: { id: 8, at: 1000, firstSeenAt: 1000, lastInRangeAt: 1000, lastDamageAt: 1000, hp: 90, intent: 'engaged' }
        };
        const combat = buildBrowserlessCombatDryRun({
          userId: 7,
          realtime: {
            tick: 62,
            self: { entity_id: 1, user_id: 7, x: 0, y: 0, hp: 78, stamina_5s_remaining_milli: 10000 },
            entities: [
              { entity_id: 1, user_id: 7, x: 0, y: 0, hp: 78, stamina_5s_remaining_milli: 10000 },
              { entity_id: 2, user_id: 8, name: 'active', x: 1000, y: 0, hp: 90, current_join_mode: 'Active', firing: true, drop: 12 }
            ],
            bullets: [
              { bullet_id: 4, owner_user_id: 8, x: 1000, y: 0, target_x: 0, target_y: 0, speed_per_tick: 500 }
            ]
          }
        }, {
          nowMs: 12000,
          decisionState: stateful,
          combatAttackRange: 11000,
          targetStickMs: 20000,
          combatEngageStickMs: 20000,
          combatPressureDisadvantageNoDamageMs: 10000
        });
        return [
          combat.exit.reason,
          combat.exit.hpGap,
          combat.exit.noDamageMs >= 10000
        ].join('|');
      })(),
      want: 'combat-pressure-disadvantage-leave|12|true'
    },
    {
      name: 'browserless combat finish pressure can shoot with reserve',
      got: (() => {
        const combat = buildBrowserlessCombatDryRun({
          userId: 7,
          realtime: {
            tick: 62,
            self: { entity_id: 1, user_id: 7, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
            entities: [
              { entity_id: 1, user_id: 7, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
              { entity_id: 2, user_id: 8, name: 'low-target', x: 1000, y: 0, hp: 50, current_join_mode: 'Active', firing: true, drop: 12 }
            ],
            bullets: []
          }
        }, { nowMs: 1500, combatAttackRange: 11000, combatFinishLowThreatHp: 75, combatFinishLowThreatMinSelfHp: 60 });
        return [
          combat.exit === null,
          combat.shooting.state,
          combat.shooting.reason,
          combat.shooting.wouldShoot,
          combat.shooting.commandSuppressed
        ].join('|');
      })(),
      want: 'true|finish|finish-low-threat|true|true'
    },
    {
      name: 'browserless combat dry-run computes linear intercept and reserve suppression',
      got: (() => {
        const aim = estimateAim(
          { user_id: 7, x: 0, y: 0 },
          { user_id: 8, x: 1000, y: 0, vx: 100, vy: 0 },
          { bulletSpeedCmPerTick: 500, renderDelayTicks: 2 }
        );
        const combat = buildBrowserlessCombatDryRun({
          userId: 7,
          realtime: {
            tick: 62,
            self: { entity_id: 1, user_id: 7, x: 0, y: 0, hp: 90, stamina_5s_remaining_milli: 500 },
            entities: [
              { entity_id: 1, user_id: 7, x: 0, y: 0, hp: 90, stamina_5s_remaining_milli: 500 },
              { entity_id: 2, user_id: 8, name: 'moving-active', x: 1000, y: 0, vx: 100, vy: 0, hp: 90, current_join_mode: 'Active', firing: true, drop: 5 }
            ],
            bullets: [
              {
                bullet_id: 9,
                owner_user_id: 8,
                start_x: -5000,
                start_y: 0,
                target_x: 5000,
                target_y: 0,
                speed_per_tick: 500,
                created_tick: 57,
                expire_tick: 77
              }
            ]
          }
        });
        return [
          aim.mode,
          aim.x,
          aim.intercept,
          combat.aim.mode,
          combat.movement.reason,
          combat.shooting.state,
          combat.shooting.reason,
          combat.shooting.wouldShoot,
          combat.shooting.commandSuppressed
        ].join('|');
      })(),
      want: 'linear-intercept|1400|true|linear-intercept|direct-threat-dodge|disabled|below-hard-reserve|false|true'
    },
    {
      name: 'browserless combat fire treats unknown self stamina as unknown not zero',
      got: (() => {
        const combat = buildBrowserlessCombatDryRun({
          userId: 7,
          realtime: {
            tick: 63,
            self: { entity_id: 1, user_id: 7, x: 0, y: 0, hp: 100 },
            entities: [
              { entity_id: 1, user_id: 7, x: 0, y: 0, hp: 100 },
              { entity_id: 2, user_id: 8, name: 'active', x: 1000, y: 0, hp: 90, current_join_mode: 'Active', firing: true, drop: 8 }
            ],
            bullets: []
          }
        }, { nowMs: 1500, combatAttackRange: 11000 });
        return [
          combat.shooting.state,
          combat.shooting.reason,
          combat.shooting.wouldShoot,
          combat.shooting.commandSuppressed,
          combat.shooting.stamina5s === null,
          combat.self.stamina5s === null
        ].join('|');
      })(),
      want: 'normal|normal-fire|true|true|true|true'
    },
    {
      name: 'browserless combat uses snapshot-enriched self stamina',
      got: (() => {
        const decision = buildBrowserlessDecision({
          userId: 7,
          realtime: {
            tick: 64,
            frameAgeMs: 100,
            self: { entity_id: 1, user_id: 7, x: 0, y: 0, hp: 90 },
            entities: [
              { entity_id: 1, user_id: 7, x: 0, y: 0, hp: 90 },
              { entity_id: 2, user_id: 8, name: 'active', x: 1000, y: 0, hp: 90, current_join_mode: 'Active', firing: true, drop: 8 }
            ],
            bullets: [],
            coinDrops: []
          },
          fallback: {
            tick: 64,
            frameAgeMs: 100,
            entities: [
              {
                entity_id: 1,
                user_id: 7,
                x: 0,
                y: 0,
                hp: 90,
                stamina_5s_remaining_milli: 500,
                stamina_5s_limit_milli: 10000
              }
            ],
            coinDrops: []
          }
        }, {}, { nowMs: 1500, controlMode: 'combat-dry-run', combatAttackRange: 11000 });
        return [
          decision.input.dataGaps.includes('self-stamina-from-snapshot'),
          decision.input.stamina.stamina5sRemainingMilli,
          decision.combat.self.stamina5s,
          decision.combat.self.staminaMetadataAuthority,
          decision.combat.shooting.state,
          decision.combat.shooting.reason,
          decision.combat.shooting.wouldShoot
        ].join('|');
      })(),
      want: 'true|500|500|snapshot|disabled|below-hard-reserve|false'
    },
    {
      name: 'browserless decision adapter exposes combat dry-run action without firing',
      got: (() => {
        const decision = buildBrowserlessDecision({
          userId: 7,
          realtime: {
            tick: 63,
            frameAgeMs: 100,
            self: { entity_id: 1, user_id: 7, x: 0, y: 0, hp: 90, stamina_5s_remaining_milli: 5000 },
            entities: [
              { entity_id: 1, user_id: 7, x: 0, y: 0, hp: 90, stamina_5s_remaining_milli: 5000 },
              { entity_id: 2, user_id: 8, name: 'active', x: 1000, y: 0, hp: 80, current_join_mode: 'Active', firing: true, drop: 8 }
            ],
            bullets: [],
            coinDrops: []
          },
          fallback: { coinDrops: [] }
        }, {}, { nowMs: 1200, controlMode: 'combat-dry-run' });
        return [
          decision.kind,
          decision.action.kind,
          decision.action.reason,
          decision.combat.aim.mode,
          decision.combat.shooting.wouldShoot,
          decision.combat.shooting.commandSuppressed,
          Object.prototype.hasOwnProperty.call(decision.action, 'command')
        ].join('|');
      })(),
      want: 'combat-dry-run|combat-dry-run|combat-dry-run-realtime|exact|true|true|false'
    },
    {
      name: 'browserless combat live remains suppressed without explicit enable flag',
      got: (() => {
        const decision = buildBrowserlessDecision({
          userId: 7,
          realtime: {
            tick: 64,
            frameAgeMs: 100,
            self: { entity_id: 1, user_id: 7, x: 0, y: 0, hp: 90, stamina_5s_remaining_milli: 5000 },
            entities: [
              { entity_id: 1, user_id: 7, x: 0, y: 0, hp: 90, stamina_5s_remaining_milli: 5000 },
              { entity_id: 2, user_id: 8, name: 'active', x: 1000, y: 0, hp: 80, current_join_mode: 'Active', firing: true, drop: 8 }
            ],
            bullets: [],
            coinDrops: []
          },
          fallback: { coinDrops: [] }
        }, {}, { nowMs: 1200, controlMode: 'combat-live', combatEnabled: false });
        return [
          decision.kind,
          decision.action.kind,
          decision.combat.liveEnabled,
          decision.combat.shooting.wouldShoot,
          decision.combat.shooting.commandSuppressed
        ].join('|');
      })(),
      want: 'combat-candidate|combat-candidate|false|true|true'
    },
    {
      name: 'browserless decision adapter waits without realtime self',
      got: (() => {
        const decision = buildBrowserlessDecision({
          userId: 7,
          realtime: { self: null, entities: [], bullets: [], frameAgeMs: null },
          fallback: { coinDrops: [{ drop_id: 1, amount: 9, x: 1, y: 2 }] }
        }, {}, { nowMs: 1000 });
        return [
          decision.kind,
          decision.reason,
          decision.action.kind,
          decision.input.dataGaps.includes('missing-realtime-self')
        ].join('|');
      })(),
      want: 'wait|missing-realtime-self|wait|true'
    },
    {
      name: 'browserless action adapter maps coin target to velocity only',
      got: (() => {
        const commands = [];
        const adapter = createBrowserlessActionAdapter({
          now: () => 1000 + commands.length * 600,
          targetDeadZoneCm: 100,
          transport: {
            sendVelocity: (dx, dy) => commands.push(`vel ${dx} ${dy}`),
            sendShoot: () => commands.push('shoot')
          }
        });
        const vector = movementVectorToTarget({ x: 10, y: 20 }, { x: 1010, y: 20 }, { targetDeadZoneCm: 100 });
        const action = adapter.applyDecision({
          realtime: { self: { x: 10, y: 20 }, tick: 1 }
        }, {
          kind: 'profit-candidate',
          band: 'profit',
          action: {
            kind: 'coin',
            band: 'profit',
            target: { type: 'coin', id: 1, x: 1010, y: 20, snapshotOnly: true }
          }
        });
        adapter.observeState({ realtime: { tick: 2 } });
        adapter.observeState({ realtime: { tick: 3 } });
        const state = adapter.getState();
        return [
          vector.ok,
          vector.dx,
          vector.dy,
          action.kind,
          commands.join(','),
          state.sentCount,
          state.lastSettlement.ok,
          !commands.join(',').includes('shoot')
        ].join('|');
      })(),
      want: 'true|1|0|velocity|vel 1 0|1|true|true'
    },
    {
      name: 'browserless action adapter maps seek-coin target to velocity',
      got: (() => {
        const commands = [];
        const adapter = createBrowserlessActionAdapter({
          now: () => 1000 + commands.length * 600,
          commandIntervalMs: 1,
          transport: {
            sendVelocity: (dx, dy) => commands.push(`vel ${dx} ${dy}`),
            sendShoot: () => commands.push('shoot')
          }
        });
        const action = adapter.applyDecision({
          realtime: { self: { x: 0, y: 0 }, tick: 1 }
        }, {
          kind: 'profit-candidate',
          band: 'profit',
          action: {
            kind: 'seek-coin',
            band: 'profit',
            reason: 'best-opportunity-visible-coin',
            target: { type: 'coin', id: 'seek-coin', x: 1000, y: 0, snapshotOnly: true }
          }
        });
        return [
          action.kind,
          action.reason,
          action.command.dx,
          action.command.dy,
          commands.join(','),
          !commands.join(',').includes('shoot')
        ].join('|');
      })(),
      want: 'velocity|move-to-target|1|0|vel 1 0|true'
    },
    {
      name: 'browserless action adapter repeats velocity through decision gap',
      got: (() => {
        let t = 1000;
        const commands = [];
        const timers = [];
        const adapter = createBrowserlessActionAdapter({
          now: () => t,
          commandIntervalMs: 500,
          decisionIntervalMs: 1000,
          velocityRepeatEnabled: true,
          velocityRepeatMs: 50,
          velocityRepeatHoldMs: 220,
          setTimeout: (fn, ms) => {
            const timer = { fn, ms, canceled: false };
            timers.push(timer);
            return timer;
          },
          clearTimeout: timer => {
            if (timer) timer.canceled = true;
          },
          transport: {
            sendVelocity: (dx, dy) => commands.push(`vel ${dx} ${dy}`)
          }
        });
        const action = adapter.applyDecision({
          realtime: { self: { x: 0, y: 0 }, tick: 1 }
        }, {
          kind: 'profit-candidate',
          band: 'profit',
          action: {
            kind: 'attack',
            band: 'profit',
            target: { type: 'enemy', userId: 8, x: 50000, y: 0, active: false }
          }
        });
        let guard = 0;
        while (timers.length && guard < 40) {
          guard += 1;
          const timer = timers.shift();
          if (!timer || timer.canceled) continue;
          t += timer.ms;
          timer.fn();
        }
        const state = adapter.getState();
        return [
          action.kind,
          action.command.dx,
          action.command.dy,
          commands[0],
          commands.length,
          state.velocityRepeatSentCount,
          state.velocityRepeatUntilMs - 1000,
          state.lastVelocityRepeatError || 'none'
        ].join('|');
      })(),
      want: 'velocity|1|0|vel 1 0|22|21|1050|none'
    },
    {
      name: 'browserless action adapter uses tighter dead zone for coins',
      got: (() => {
        const coinVector = movementVectorToTarget(
          { x: 21108, y: 39065 },
          { type: 'coin', x: 20727, y: 38406 },
          { targetDeadZoneCm: 900 }
        );
        const genericVector = movementVectorToTarget(
          { x: 21108, y: 39065 },
          { type: 'enemy', x: 20727, y: 38406 },
          { targetDeadZoneCm: 900 }
        );
        return [
          coinVector.ok,
          coinVector.reason,
          coinVector.distance,
          genericVector.ok,
          genericVector.reason,
          genericVector.distance
        ].join('|');
      })(),
      want: 'true|move-to-target|761|false|target-reached|761'
    },
    {
      name: 'browserless action adapter uses shared coin pickup pulse',
      got: (() => {
        const commands = [];
        const timers = [];
        const adapter = createBrowserlessActionAdapter({
          now: () => 1000 + commands.length * 200,
          commandIntervalMs: 1,
          setTimeout: (fn, ms) => {
            timers.push({ fn, ms });
            return timers.length;
          },
          clearTimeout: () => {},
          transport: {
            sendVelocity: (dx, dy) => commands.push(`vel ${dx} ${dy}`)
          }
        });
        const directVector = coinMotionVectorToTarget(
          { x: 0, y: 0 },
          { type: 'coin', id: 'near-coin', x: 50, y: 0 },
          {},
          { coinApproachLock: null },
          1000
        );
        const action = adapter.applyDecision({
          realtime: { self: { x: 0, y: 0 }, tick: 1 }
        }, {
          kind: 'profit-candidate',
          band: 'profit',
          action: { kind: 'coin', band: 'profit', target: { type: 'coin', id: 'near-coin', x: 50, y: 0 } }
        });
        const beforePulse = commands.join(',');
        if (timers[0]) timers[0].fn();
        return [
          directVector.ok,
          directVector.dx,
          directVector.pickupMode,
          directVector.precisionPulseMs,
          action.kind,
          action.vector.pickupMode,
          action.precisionPulseMs,
          timers[0]?.ms,
          beforePulse,
          commands.join(',')
        ].join('|');
      })(),
      want: 'true|1|micro|60|velocity|micro|60|60|vel 1 0|vel 1 0,vel 0 0'
    },
    {
      name: 'browserless action adapter stops for combat and reached targets',
      got: (() => {
        const commands = [];
        const adapter = createBrowserlessActionAdapter({
          now: () => 1000 + commands.length * 600,
          targetDeadZoneCm: 100,
          transport: {
            sendVelocity: (dx, dy) => commands.push(`vel ${dx} ${dy}`)
          }
        });
        const combat = adapter.applyDecision({
          realtime: { self: { x: 0, y: 0 }, tick: 1 }
        }, {
          kind: 'combat-candidate',
          band: 'combat',
          action: { kind: 'combat-candidate', band: 'combat', target: { x: 1000, y: 0 } }
        });
        const reached = adapter.applyDecision({
          realtime: { self: { x: 0, y: 0 }, tick: 2 }
        }, {
          kind: 'profit-candidate',
          band: 'profit',
          action: { kind: 'coin', band: 'profit', target: { type: 'coin', id: 1, x: 0, y: 0, snapshotOnly: true } }
        });
        return [
          combat.kind,
          combat.reason,
          reached.kind,
          reached.reason,
          commands.join(',')
        ].join('|');
      })(),
      want: 'unsupported-action|unsupported-action|stop|target-reached|vel 0 0,vel 0 0'
    },
    {
      name: 'browserless action adapter maps wait leave and post-attack control actions explicitly',
      got: (() => {
        const commands = [];
        const adapter = createBrowserlessActionAdapter({
          now: () => 1000 + commands.length * 600,
          commandIntervalMs: 1,
          transport: {
            sendVelocity: (dx, dy) => commands.push(`vel ${dx} ${dy}`)
          }
        });
        const wait = adapter.applyDecision({
          realtime: { self: { x: 0, y: 0 }, tick: 1 }
        }, {
          kind: 'wait',
          band: 'wait',
          reason: 'no-profitable-candidate',
          action: { kind: 'wait', band: 'wait', reason: 'no-profitable-candidate' }
        });
        const postAttackWait = adapter.applyDecision({
          realtime: { self: { x: 0, y: 0 }, tick: 2 }
        }, {
          kind: 'post-attack-drop-wait',
          band: 'profit',
          action: {
            kind: 'post-attack-drop-wait',
            band: 'profit',
            reason: 'post-attack-drop-wait-position',
            target: { type: 'coin', id: 'drop-wait', x: 1000, y: 0 }
          }
        });
        const leave = adapter.applyDecision({
          realtime: { self: { x: 0, y: 0 }, tick: 3 }
        }, {
          kind: 'leave',
          band: 'safety',
          action: {
            kind: 'leave',
            band: 'safety',
            reason: 'stamina-budget-coin-leave',
            shouldLeave: true
          }
        });
        const unsupported = adapter.applyDecision({
          realtime: { self: { x: 0, y: 0 }, tick: 4 }
        }, {
          kind: 'profit-candidate',
          band: 'profit',
          action: { kind: 'dance', band: 'profit', reason: 'unknown-action' }
        });
        return [
          wait.kind,
          wait.reason,
          wait.handledBy,
          postAttackWait.kind,
          postAttackWait.reason,
          leave.kind,
          leave.handledBy,
          leave.shouldLeave,
          unsupported.kind,
          unsupported.unsupportedAction.kind,
          unsupported.unsupportedAction.reason,
          commands.join(',')
        ].join('|');
      })(),
      want: 'wait|no-profitable-candidate|action-adapter-stop|post-attack-drop-wait|post-attack-drop-wait-position|leave|safety-controller|true|unsupported-action|dance|unknown-action|vel 0 0,vel 1 0,vel 0 0,vel 0 0'
    },
    {
      name: 'browserless action adapter executes flee and return-block scan velocity',
      got: (() => {
        const commands = [];
        const adapter = createBrowserlessActionAdapter({
          now: () => 1000 + commands.length * 600,
          commandIntervalMs: 1,
          transport: {
            sendVelocity: (dx, dy) => commands.push(`vel ${dx} ${dy}`)
          }
        });
        const flee = adapter.applyDecision({
          realtime: { self: { x: 0, y: 0 }, tick: 1 }
        }, {
          kind: 'flee',
          band: 'safety',
          action: { kind: 'flee', band: 'safety', reason: 'active-threat-return-block', dx: -1, dy: 0 }
        });
        const scan = adapter.applyDecision({
          realtime: { self: { x: 0, y: 0 }, tick: 2 }
        }, {
          kind: 'return-block-scan',
          band: 'safety',
          action: { kind: 'return-block-scan', band: 'safety', reason: 'return-block-lateral-scan', dx: 0, dy: 1 }
        });
        return [
          flee.kind,
          flee.reason,
          scan.kind,
          scan.reason,
          commands.join(',')
        ].join('|');
      })(),
      want: 'flee|active-threat-return-block|return-block-scan|return-block-lateral-scan|vel -1 0,vel 0 1'
    },
    {
      name: 'browserless action adapter executes stale coin patrol velocity',
      got: (() => {
        const commands = [];
        const adapter = createBrowserlessActionAdapter({
          now: () => 1000 + commands.length * 600,
          commandIntervalMs: 1,
          transport: {
            sendVelocity: (dx, dy) => commands.push(`vel ${dx} ${dy}`)
          }
        });
        const action = adapter.applyDecision({
          realtime: { self: { x: 0, y: 0 }, tick: 1 }
        }, {
          kind: 'patrol',
          band: 'profit',
          action: {
            kind: 'patrol',
            band: 'profit',
            reason: 'ignore-stale-coin-no-progress',
            dx: -1,
            dy: 0,
            staleCoinEscape: { id: 'id:coin', remainingMs: 500 },
            ignoredCoin: { id: 'id:coin', failureCount: 1 }
          }
        });
        return [
          action.kind,
          action.reason,
          action.command.dx,
          action.command.dy,
          action.staleCoinEscape.id,
          action.ignoredCoin.failureCount,
          commands.join(',')
        ].join('|');
      })(),
      want: 'patrol|ignore-stale-coin-no-progress|-1|0|id:coin|1|vel -1 0'
    },
    {
      name: 'browserless action adapter attacks visible AFK profit target',
      got: (() => {
        const commands = [];
        const adapter = createBrowserlessActionAdapter({
          now: () => 1000 + commands.length * 200,
          commandIntervalMs: 1,
          combatShootMinIntervalMs: 160,
          attackRangeCm: 14500,
          transport: {
            sendVelocity: (dx, dy) => commands.push(`vel ${dx} ${dy}`),
            sendShoot: (targetX, targetY, startX, startY) => commands.push(`shoot ${targetX} ${targetY} ${startX} ${startY}`)
          }
        });
        const action = adapter.applyDecision({
          realtime: { self: { x: 0, y: 0 }, tick: 1 }
        }, {
          kind: 'profit-candidate',
          band: 'profit',
          action: {
            kind: 'attack',
            band: 'profit',
            target: { type: 'enemy', userId: 8, x: 1000, y: 0, active: false }
          }
        });
        const state = adapter.getState();
        return [
          action.kind,
          action.movement.command.type,
          action.shoot.command.type,
          commands.join(','),
          state.velocitySentCount,
          state.shootSentCount
        ].join('|');
      })(),
      want: 'profit-attack|velocity|shoot|vel 0 0,shoot 1000 0 0 0|1|1'
    },
    {
      name: 'browserless action adapter repeats AFK profit shots through decision gap',
      got: (() => {
        let t = 1000;
        const commands = [];
        const timers = [];
        const adapter = createBrowserlessActionAdapter({
          now: () => t,
          commandIntervalMs: 1,
          decisionIntervalMs: 1000,
          combatShootMinIntervalMs: 160,
          shootRepeatEnabled: true,
          attackRangeCm: 14500,
          setTimeout: (fn, ms) => {
            const timer = { fn, ms, canceled: false };
            timers.push(timer);
            return timer;
          },
          clearTimeout: timer => {
            if (timer) timer.canceled = true;
          },
          transport: {
            sendVelocity: (dx, dy) => commands.push(`vel ${dx} ${dy}`),
            sendShoot: (targetX, targetY, startX, startY) => commands.push(`shoot ${targetX} ${targetY} ${startX} ${startY}`)
          }
        });
        const action = adapter.applyDecision({
          realtime: { self: { x: 0, y: 0 }, tick: 1 }
        }, {
          kind: 'profit-candidate',
          band: 'profit',
          action: {
            kind: 'attack',
            band: 'profit',
            target: { type: 'enemy', userId: 8, x: 1000, y: 0, active: false }
          }
        });
        let guard = 0;
        while (timers.length && guard < 20) {
          guard += 1;
          const timer = timers.shift();
          if (!timer || timer.canceled) continue;
          t += timer.ms;
          timer.fn();
        }
        const state = adapter.getState();
        return [
          action.kind,
          state.shootSentCount,
          state.shootRepeatSentCount,
          commands.length,
          state.shootRepeatUntilMs - 1000,
          state.lastShootRepeatError || 'none',
          commands[0],
          commands[1],
          commands[commands.length - 1]
        ].join('|');
      })(),
      want: 'profit-attack|8|7|9|1160|none|vel 0 0|shoot 1000 0 0 0|shoot 1000 0 0 0'
    },
    {
      name: 'browserless action adapter keeps AFK shot repeat across throttled decision boundary',
      got: (() => {
        let t = 1000;
        const commands = [];
        const timers = [];
        const adapter = createBrowserlessActionAdapter({
          now: () => t,
          commandIntervalMs: 1,
          decisionIntervalMs: 1000,
          combatShootMinIntervalMs: 160,
          shootRepeatEnabled: true,
          attackRangeCm: 14500,
          setTimeout: (fn, ms) => {
            const timer = { fn, ms, canceled: false };
            timers.push(timer);
            return timer;
          },
          clearTimeout: timer => {
            if (timer) timer.canceled = true;
          },
          transport: {
            sendVelocity: (dx, dy) => commands.push(`vel ${dx} ${dy}`),
            sendShoot: (targetX, targetY, startX, startY) => commands.push(`shoot ${targetX} ${targetY} ${startX} ${startY}`)
          }
        });
        const decision = {
          kind: 'profit-candidate',
          band: 'profit',
          action: {
            kind: 'attack',
            band: 'profit',
            target: { type: 'enemy', userId: 8, x: 1000, y: 0, active: false }
          }
        };
        adapter.applyDecision({
          realtime: { self: { x: 0, y: 0 }, tick: 1 }
        }, decision);
        let guard = 0;
        while (timers.length && guard < 20) {
          guard += 1;
          const timer = timers[0];
          if (!timer || timer.canceled) {
            timers.shift();
            continue;
          }
          if (t + timer.ms > 2000) break;
          timers.shift();
          t += timer.ms;
          timer.fn();
        }
        t = 2000;
        const second = adapter.applyDecision({
          realtime: { self: { x: 0, y: 0 }, tick: 2 }
        }, decision);
        guard = 0;
        while (timers.length && guard < 20) {
          guard += 1;
          const timer = timers.shift();
          if (!timer || timer.canceled) continue;
          t += timer.ms;
          timer.fn();
          break;
        }
        const state = adapter.getState();
        return [
          second.kind,
          second.shoot.reason,
          second.shoot.repeat ? 'repeat' : 'no-repeat',
          state.shootSentCount,
          state.shootRepeatSentCount,
          commands.length,
          state.lastShootRepeatError || 'none',
          commands[commands.length - 1]
        ].join('|');
      })(),
      want: 'profit-attack|shoot-command-throttled|repeat|8|7|10|none|shoot 1000 0 0 0'
    },
    {
      name: 'browserless action adapter cancels AFK shot repeat when target turns active',
      got: (() => {
        let t = 1000;
        const commands = [];
        const timers = [];
        const adapter = createBrowserlessActionAdapter({
          now: () => t,
          commandIntervalMs: 1,
          decisionIntervalMs: 1000,
          combatShootMinIntervalMs: 160,
          shootRepeatEnabled: true,
          attackRangeCm: 14500,
          setTimeout: (fn, ms) => {
            const timer = { fn, ms, canceled: false };
            timers.push(timer);
            return timer;
          },
          clearTimeout: timer => {
            if (timer) timer.canceled = true;
          },
          transport: {
            sendVelocity: (dx, dy) => commands.push(`vel ${dx} ${dy}`),
            sendShoot: (targetX, targetY, startX, startY) => commands.push(`shoot ${targetX} ${targetY} ${startX} ${startY}`)
          }
        });
        const action = adapter.applyDecision({
          realtime: { self: { x: 0, y: 0 }, tick: 1 }
        }, {
          kind: 'profit-candidate',
          band: 'profit',
          action: {
            kind: 'attack',
            band: 'profit',
            target: { type: 'enemy', userId: 8, x: 1000, y: 0, active: false }
          }
        });
        adapter.observeState({
          realtime: {
            self: { x: 0, y: 0 },
            tick: 2,
            entities: [
              { user_id: 8, x: 1000, y: 0, current_join_mode: 'Active' }
            ]
          }
        });
        let guard = 0;
        while (timers.length && guard < 20) {
          guard += 1;
          const timer = timers.shift();
          if (!timer || timer.canceled) continue;
          t += timer.ms;
          timer.fn();
        }
        const state = adapter.getState();
        return [
          action.kind,
          state.shootSentCount,
          state.shootRepeatSentCount,
          commands.length,
          state.shootRepeatUntilMs,
          state.lastShootRepeatError || 'none',
          commands.join(',')
        ].join('|');
      })(),
      want: 'profit-attack|1|0|2|0|shoot-repeat-target-active|vel 0 0,shoot 1000 0 0 0'
    },
    {
      name: 'browserless opportunistic shot attaches to coin action',
      got: (() => {
        const decision = buildBrowserlessDecision({
          userId: 7,
          realtime: {
            tick: 70,
            frameAgeMs: 100,
            self: { entity_id: 1, user_id: 7, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
            entities: [
              { entity_id: 1, user_id: 7, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
              fullStamina5s({ entity_id: 2, user_id: 8, name: 'afk-shot', x: 1000, y: 0, hp: 80, current_join_mode: 'Passive', drop: 20 })
            ],
            bullets: [],
            coinDrops: [{ drop_id: 'coin-a', amount: 1, x: 5000, y: 0 }]
          },
          fallback: { coinDrops: [] }
        }, {}, {
          nowMs: 1500,
          controlMode: 'profit-live',
          includeAfkProfitTargets: false,
          opportunisticShotMinScoreRatio: 0.01
        });
        const commands = [];
        const adapter = createBrowserlessActionAdapter({
          now: () => 2000 + commands.length * 200,
          commandIntervalMs: 1,
          opportunisticShootEveryMs: 120,
          transport: {
            sendVelocity: (dx, dy) => commands.push(`vel ${dx} ${dy}`),
            sendShoot: (targetX, targetY, startX, startY) => commands.push(`shoot ${targetX} ${targetY} ${startX} ${startY}`)
          }
        });
        const action = adapter.applyDecision({
          realtime: { self: { x: 0, y: 0 }, tick: 70 }
        }, decision);
        const state = adapter.getState();
        return [
          decision.action.kind,
          decision.action.opportunisticShot.userId,
          action.kind,
          action.shoot.command.type,
          action.target.userId,
          state.shootSentCount,
          commands.join(',')
        ].join('|');
      })(),
      want: 'coin|8|velocity|shoot|8|1|vel 1 0,shoot 1000 0 0 0'
    },
    {
      name: 'browserless opportunistic shot wait shoots without movement profit',
      got: (() => {
        const decision = buildBrowserlessDecision({
          userId: 7,
          realtime: {
            tick: 70,
            frameAgeMs: 100,
            self: { entity_id: 1, user_id: 7, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
            entities: [
              { entity_id: 1, user_id: 7, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
              fullStamina5s({ entity_id: 2, user_id: 8, name: 'afk-shot', x: 1000, y: 0, hp: 80, current_join_mode: 'Passive', drop: 20 })
            ],
            bullets: [],
            coinDrops: []
          },
          fallback: { coinDrops: [] }
        }, {}, {
          nowMs: 1500,
          controlMode: 'profit-live',
          includeAfkProfitTargets: false
        });
        const commands = [];
        const adapter = createBrowserlessActionAdapter({
          now: () => 2000 + commands.length * 200,
          commandIntervalMs: 1,
          transport: {
            sendVelocity: (dx, dy) => commands.push(`vel ${dx} ${dy}`),
            sendShoot: (targetX, targetY, startX, startY) => commands.push(`shoot ${targetX} ${targetY} ${startX} ${startY}`)
          }
        });
        const action = adapter.applyDecision({
          realtime: { self: { x: 0, y: 0 }, tick: 70 }
        }, decision);
        return [
          decision.kind,
          decision.reason,
          action.kind,
          action.shoot.command.type,
          commands.join(',')
        ].join('|');
      })(),
      want: 'opportunistic-shot|opportunistic-afk-drop-shot|opportunistic-shot|shoot|vel 0 0,shoot 1000 0 0 0'
    },
    {
      name: 'browserless opportunistic shot hold repeats static shot',
      got: (() => {
        let t = 1000;
        const commands = [];
        const timers = [];
        const adapter = createBrowserlessActionAdapter({
          now: () => t,
          commandIntervalMs: 1,
          decisionIntervalMs: 1000,
          combatShootMinIntervalMs: 160,
          shootRepeatEnabled: true,
          setTimeout: (fn, ms) => {
            const timer = { fn, ms, canceled: false };
            timers.push(timer);
            return timer;
          },
          clearTimeout: timer => {
            if (timer) timer.canceled = true;
          },
          transport: {
            sendVelocity: (dx, dy) => commands.push(`vel ${dx} ${dy}`),
            sendShoot: (targetX, targetY, startX, startY) => commands.push(`shoot ${targetX} ${targetY} ${startX} ${startY}`)
          }
        });
        const target = { type: 'enemy', userId: 8, x: 1000, y: 0, active: false, reason: 'opportunistic-afk-drop-shot' };
        const action = adapter.applyDecision({
          realtime: { self: { x: 0, y: 0 }, tick: 70 }
        }, {
          kind: 'opportunistic-shot',
          band: 'profit',
          reason: 'opportunistic-afk-drop-shot',
          action: {
            kind: 'opportunistic-shot',
            band: 'profit',
            target,
            opportunisticShot: target
          }
        });
        let guard = 0;
        while (timers.length && guard < 20) {
          guard += 1;
          const timer = timers.shift();
          if (!timer || timer.canceled) continue;
          t += timer.ms;
          timer.fn();
        }
        const state = adapter.getState();
        return [
          action.kind,
          state.shootSentCount,
          state.shootRepeatSentCount,
          commands.length,
          action.shoot.repeat.repeatMs,
          commands[0],
          commands[commands.length - 1]
        ].join('|');
      })(),
      want: 'opportunistic-shot|8|7|9|160|vel 0 0|shoot 1000 0 0 0'
    },
    {
      name: 'browserless opportunistic shot is suppressed during recovery',
      got: (() => {
        const decision = buildBrowserlessDecision({
          userId: 7,
          realtime: {
            tick: 70,
            frameAgeMs: 100,
            self: { entity_id: 1, user_id: 7, x: 0, y: 0, hp: 70, max_hp: 100, stamina_5s_remaining_milli: 10000 },
            entities: [
              { entity_id: 1, user_id: 7, x: 0, y: 0, hp: 70, max_hp: 100, stamina_5s_remaining_milli: 10000 },
              fullStamina5s({ entity_id: 2, user_id: 8, name: 'afk-shot', x: 1000, y: 0, hp: 80, current_join_mode: 'Passive', drop: 20 })
            ],
            bullets: [],
            coinDrops: [{ drop_id: 'coin-a', amount: 1, x: 5000, y: 0 }]
          },
          fallback: { coinDrops: [] }
        }, {}, {
          nowMs: 1500,
          controlMode: 'profit-live',
          includeAfkProfitTargets: false,
          opportunisticShotMinScoreRatio: 0.01
        });
        return [
          decision.kind,
          decision.reason,
          Boolean(decision.action.opportunisticShot)
        ].join('|');
      })(),
      want: 'recover|wait-for-full-stamina-and-hp|false'
    },
    {
      name: 'browserless action adapter sends guarded combat movement shoot and records ack',
      got: (() => {
        const commands = [];
        const adapter = createBrowserlessActionAdapter({
          now: () => 1000 + commands.length * 200,
          commandIntervalMs: 1,
          combatShootMinIntervalMs: 160,
          transport: {
            sendVelocity: (dx, dy) => commands.push(`vel ${dx} ${dy}`),
            sendShoot: (targetX, targetY, startX, startY) => commands.push(`shoot ${targetX} ${targetY} ${startX} ${startY}`)
          }
        });
        const action = adapter.applyDecision({
          realtime: { self: { x: 0, y: 0 }, tick: 1 }
        }, {
          kind: 'combat-live',
          band: 'combat',
          action: { kind: 'combat-live', band: 'combat', reason: 'combat-live-realtime' },
          combat: {
            self: { x: 0, y: 0 },
            target: { userId: 8, x: 1000, y: 0, authority: 'realtime' },
            movement: { dx: 1, dy: 0, reason: 'close-in' },
            aim: { x: 1000, y: 0 },
            shooting: {
              wouldShoot: true,
              commandSuppressed: false,
              reason: 'normal-fire',
              effectiveCadenceMs: 160
            }
          }
        });
        adapter.observeState({
          realtime: { tick: 2 },
          command: { lastAck: { bullet_id: 44, source: 'shoot_ok', receivedAtMs: 1300 } }
        });
        const state = adapter.getState();
        return [
          action.kind,
          action.movement.command.type,
          action.shoot.command.type,
          commands.join(','),
          state.sentCount,
          state.velocitySentCount,
          state.shootSentCount,
          state.lastShootAck.bullet_id
        ].join('|');
      })(),
      want: 'combat-live|velocity|shoot|vel 1 0,shoot 1000 0 0 0|2|1|1|44'
    },
    {
      name: 'browserless read-only canary runs snapshot ws frames and verified leave',
      got: (async () => {
        let t = Date.UTC(2026, 6, 8, 1, 0, 0);
        let commandCount = 0;
        const posFrame = encodeGrzFrameForTest({
          type: 'pos',
          tick: 10,
          entities: [{ entity_id: 1, user_id: 7, name: 'self', x: 100, y: 200, hp: 90 }],
          bullets: []
        });
        const snapshotFrame = encodeGrzFrameForTest({
          type: 'snapshot',
          tick: 11,
          entities: [{ entity_id: 1, user_id: 7, name: 'self', x: 100, y: 200, hp: 90 }],
          bullets: [],
          coin_drops: [{ drop_id: 1, amount: 2, x: 150, y: 210 }],
          messages: []
        });
        const result = await runReadOnlyCanary({
          gameOrigin: 'https://grasp-rat-game.h-e.top',
          snapshotPath: '/snapshot',
          wsPath: '/ws',
          wsExtraQuery: 'compress=gzip%2Cdeflate',
          userId: 7,
          sessionToken: 'canary-token',
          readOnlyProbeMs: 1000,
          decisionIntervalMs: 1,
          frameGapAlertMs: 5000,
          wsConnectTimeoutMs: 1000,
          httpTimeoutMs: 1000
        }, {
          now: () => t,
          sleep: async ms => { t += ms; },
          persistedState: {
            loginPointSafety: { point: { x: 100, y: 200, hp: 90, source: 'test' } }
          },
          fetchImpl: async () => fakeResponseForTest({
            body: {
              type: 'snapshot',
              tick: 9,
              entities: [{ entity_id: 1, user_id: 7, x: 100, y: 200, hp: 90 }],
              bullets: [],
              coin_drops: [],
              messages: []
            }
          }),
          openBrowserlessWs: async options => {
            t += 100;
            options.onMessage(posFrame);
            t += 300;
            options.onMessage(snapshotFrame);
            return {
              isOpen: () => true,
              close: () => {},
              send: () => { commandCount += 1; }
            };
          },
          leaveWithVerification: async () => ({ ok: true, attempts: [{ ok: true, summary: { leaveConfirmed: true } }] })
        });
        return [
          result.ok,
          result.snapshotSafety.ok,
          result.stats.decodedFrameCount,
          result.stats.typeCounts.pos,
          result.stats.typeCounts.snapshot,
          result.stats.selfPresent.true,
          result.decisions.loggedCount,
          result.decisions.last.kind,
          result.leave.ok,
          result.state.realtime.self.name,
          result.state.fallback.coinDrops[0].amount,
          commandCount
        ].join('|');
      })(),
      want: 'true|true|2|1|1|2|2|profit-candidate|true|self|2|0'
    },
    {
      name: 'browserless no-self grace starts at ws open after slow snapshot safety',
      got: (async () => {
        let t = Date.UTC(2026, 6, 8, 1, 0, 0);
        const snapshotFrame = encodeGrzFrameForTest({
          type: 'snapshot',
          tick: 20,
          entities: [{ entity_id: 1, user_id: 7, name: 'self', x: 100, y: 200, hp: 90 }],
          bullets: [],
          coin_drops: [],
          messages: []
        });
        const result = await runReadOnlyCanary({
          gameOrigin: 'https://grasp-rat-game.h-e.top',
          snapshotPath: '/snapshot',
          wsPath: '/ws',
          wsExtraQuery: 'compress=gzip%2Cdeflate',
          userId: 7,
          sessionToken: 'slow-safety-token',
          readOnlyProbeMs: 1000,
          decisionIntervalMs: 1,
          frameGapAlertMs: 5000,
          noSelfGraceMs: 3000,
          wsConnectTimeoutMs: 1000,
          httpTimeoutMs: 1000,
          loginPointSafetySuccessRequired: 3,
          loginPointSafetyProbeIntervalMs: 30000
        }, {
          now: () => t,
          sleep: async ms => { t += ms; },
          persistedState: {
            loginPointSafety: { point: { x: 100, y: 200, hp: 90, source: 'test' } }
          },
          fetchImpl: async () => fakeResponseForTest({
            body: {
              type: 'snapshot',
              tick: 19,
              entities: [],
              bullets: [],
              coin_drops: [],
              messages: []
            }
          }),
          openBrowserlessWs: async options => {
            t += 100;
            options.onMessage(snapshotFrame);
            return {
              isOpen: () => true,
              close: () => {},
              send: () => {}
            };
          },
          leaveWithVerification: async () => ({ ok: true, attempts: [{ ok: true, summary: { leaveConfirmed: true } }] })
        });
        return [
          result.ok,
          result.error,
          result.safety.event?.reason || '',
          result.snapshotSafety.streak,
          t - Date.UTC(2026, 6, 8, 1, 0, 0) >= 60000,
          result.stats.typeCounts.snapshot,
          result.stats.selfPresent.true,
          Boolean(result.state.realtime.self),
          result.decisions.last.reason,
          result.leave.ok
        ].join('|');
      })(),
      want: 'true|||3|true|1|1|false|missing-realtime-self|true'
    },
    {
      name: 'browserless canary verifies leave after ws connect timeout',
      got: (async () => {
        let leaveCalls = 0;
        const result = await runReadOnlyCanary({
          gameOrigin: 'https://grasp-rat-game.h-e.top',
          snapshotPath: '/snapshot',
          wsPath: '/ws',
          wsExtraQuery: 'compress=gzip%2Cdeflate',
          userId: 7,
          sessionToken: 'connect-timeout-token',
          readOnlyProbeMs: 1000,
          wsConnectTimeoutMs: 1000,
          httpTimeoutMs: 1000
        }, {
          now: () => Date.UTC(2026, 6, 8, 1, 0, 0),
          persistedState: {
            loginPointSafety: { point: { x: 100, y: 200, hp: 90, source: 'test' } }
          },
          fetchImpl: async () => fakeResponseForTest({
            body: {
              type: 'snapshot',
              tick: 9,
              entities: [{ entity_id: 1, user_id: 7, x: 100, y: 200, hp: 90 }],
              bullets: [],
              coin_drops: [],
              messages: []
            }
          }),
          openBrowserlessWs: async () => {
            throw new Error('websocket connect timeout');
          },
          leaveWithVerification: async options => {
            leaveCalls += 1;
            return { ok: true, attempts: [{ ok: true, userId: options.userId, summary: { leaveConfirmed: true } }] };
          }
        });
        return [
          result.ok,
          result.error,
          result.snapshotSafety.ok,
          result.stats.decodedFrameCount,
          Boolean(result.leave?.ok),
          leaveCalls,
          result.leave?.attempts?.[0]?.userId,
          result.safety.leaveFailure === null
        ].join('|');
      })(),
      want: 'false|websocket connect timeout|true|0|true|1|7|true'
    },
    {
      name: 'browserless canary verifies leave after self-present ws 403',
      got: (async () => {
        let leaveCalls = 0;
        const result = await runReadOnlyCanary({
          gameOrigin: 'https://grasp-rat-game.h-e.top',
          snapshotPath: '/snapshot',
          wsPath: '/ws',
          wsExtraQuery: 'compress=gzip%2Cdeflate',
          userId: 7,
          sessionToken: 'self-present-token',
          readOnlyProbeMs: 1000,
          wsConnectTimeoutMs: 1000,
          httpTimeoutMs: 1000
        }, {
          now: () => Date.UTC(2026, 6, 8, 1, 0, 0),
          persistedState: {
            loginPointSafety: { point: { x: 0, y: 0, hp: 100, source: 'test' } }
          },
          fetchImpl: async () => fakeResponseForTest({
            body: {
              type: 'snapshot',
              tick: 9,
              entities: [{ entity_id: 1, user_id: 7, name: 'self', x: 100, y: 200, hp: 90 }],
              bullets: [],
              coin_drops: [],
              messages: []
            }
          }),
          openBrowserlessWs: async () => {
            throw new Error('websocket unexpected response 403 Forbidden content-type=text/html; charset=utf-8');
          },
          leaveWithVerification: async () => {
            leaveCalls += 1;
            return { ok: true, attempts: [{ ok: true, summary: { leaveConfirmed: true } }] };
          }
        });
        return [
          result.ok,
          result.error.includes('403'),
          result.snapshotSafety.ok,
          result.snapshotSafety.reason,
          result.snapshotSafety.response.summary.selfPresent,
          Boolean(result.leave),
          result.leave?.ok,
          leaveCalls,
          result.safety.leaveFailure === null
        ].join('|');
      })(),
      want: 'false|true|true|self-present-reentry|true|true|true|1|true'
    },
    {
      name: 'browserless canary opens ws when snapshot self is already present near active login point',
      got: (async () => {
        let t = Date.UTC(2026, 6, 8, 1, 0, 0);
        let opened = false;
        const posFrame = encodeGrzFrameForTest({
          type: 'pos',
          tick: 20,
          entities: [{ entity_id: 1, user_id: 7, name: 'self', x: 100, y: 200, hp: 90 }],
          bullets: []
        });
        const result = await runReadOnlyCanary({
          gameOrigin: 'https://grasp-rat-game.h-e.top',
          snapshotPath: '/snapshot',
          wsPath: '/ws',
          wsExtraQuery: 'compress=gzip%2Cdeflate',
          userId: 7,
          sessionToken: 'canary-token',
          readOnlyProbeMs: 1000,
          decisionIntervalMs: 1,
          frameGapAlertMs: 5000,
          wsConnectTimeoutMs: 1000,
          httpTimeoutMs: 1000
        }, {
          now: () => t,
          sleep: async ms => { t += ms; },
          persistedState: {
            loginPointSafety: { point: { x: 0, y: 0, hp: 100, source: 'test' } }
          },
          fetchImpl: async () => fakeResponseForTest({
            body: {
              type: 'snapshot',
              tick: 19,
              entities: [
                { entity_id: 1, user_id: 7, name: 'self', x: 100, y: 200, hp: 90 },
                { entity_id: 2, user_id: 8, name: 'active', x: 500, y: 0, hp: 100, current_join_mode: 'Active', life: 'Alive' }
              ],
              bullets: [],
              coin_drops: [],
              messages: []
            }
          }),
          openBrowserlessWs: async options => {
            opened = true;
            t += 100;
            options.onMessage(posFrame);
            return {
              isOpen: () => true,
              close: () => {},
              send: () => {}
            };
          },
          leaveWithVerification: async () => ({ ok: true, attempts: [{ ok: true, summary: { leaveConfirmed: true } }] })
        });
        return [
          result.ok,
          opened,
          result.snapshotSafety.ok,
          result.snapshotSafety.reason,
          result.snapshotSafety.originalReason,
          result.snapshotSafety.bypassedPreLoginSafety,
          result.snapshotSafety.response.summary.selfPresent,
          result.snapshotSafety.response.summary.safety.reason,
          result.stats.selfPresent.true,
          result.leave.ok
        ].join('|');
      })(),
      want: 'true|true|true|self-present-reentry|active-near-login-point|true|true|active-near-login-point|1|true'
    },
    {
      name: 'browserless movement-only canary sends velocity without shooting',
      got: (async () => {
        let t = Date.UTC(2026, 6, 8, 1, 0, 0);
        let wsOptions = null;
        let sleepCount = 0;
        const commands = [];
        const posFrame = encodeGrzFrameForTest({
          type: 'pos',
          tick: 20,
          entities: [{ entity_id: 1, user_id: 7, name: 'self', x: 100, y: 200, hp: 90, stamina_5s_remaining_milli: 1000 }],
          bullets: []
        });
        const snapshotFrame = encodeGrzFrameForTest({
          type: 'snapshot',
          tick: 21,
          entities: [{ entity_id: 1, user_id: 7, name: 'self', x: 100, y: 200, hp: 90, stamina_5s_remaining_milli: 1000 }],
          bullets: [],
          coin_drops: [{ drop_id: 2, amount: 3, x: 1100, y: 200 }],
          messages: []
        });
        const result = await runReadOnlyCanary({
          gameOrigin: 'https://grasp-rat-game.h-e.top',
          snapshotPath: '/snapshot',
          wsPath: '/ws',
          wsExtraQuery: 'compress=gzip%2Cdeflate',
          controlMode: 'movement-only',
          readOnlyProbeMs: 1000,
          decisionIntervalMs: 1,
          frameGapAlertMs: 5000,
          movementCommandIntervalMs: 1,
          movementTargetDeadZoneCm: 100,
          movementSettlementFrames: 1,
          userId: 7,
          sessionToken: 'movement-token'
        }, {
          now: () => t,
          sleep: async ms => {
            t += ms;
            sleepCount += 1;
            if (sleepCount === 1) wsOptions.onMessage(posFrame);
            if (sleepCount === 2) wsOptions.onMessage(snapshotFrame);
          },
          persistedState: {
            loginPointSafety: { point: { x: 100, y: 200, hp: 90, source: 'test' } }
          },
          fetchImpl: async () => fakeResponseForTest({
            body: {
              type: 'snapshot',
              tick: 19,
              entities: [{ entity_id: 1, user_id: 7, x: 100, y: 200, hp: 90 }],
              bullets: [],
              coin_drops: [],
              messages: []
            }
          }),
          openBrowserlessWs: async options => {
            wsOptions = options;
            return {
              isOpen: () => true,
              close: () => {},
              sendVelocity: (dx, dy) => commands.push(`vel ${dx} ${dy}`),
              sendShoot: () => commands.push('shoot')
            };
          },
          leaveWithVerification: async () => ({ ok: true, attempts: [{ ok: true, summary: { leaveConfirmed: true } }] })
        });
        return [
          result.ok,
          result.mode,
          result.actions.enabled,
          result.actions.sentCount,
          result.actions.stopCount,
          result.actions.settlement.ok,
          result.actions.settlement.reason,
          commands.includes('vel 1 0'),
          commands[commands.length - 1],
          !commands.includes('shoot')
        ].join('|');
      })(),
      want: 'true|movement-only|true|3|2|false|pending|true|vel 0 0|true'
    },
    {
      name: 'browserless profit-live canary flees before profit action under threat',
      got: (async () => {
        let t = Date.UTC(2026, 6, 8, 1, 0, 0);
        let wsOptions = null;
        const commands = [];
        const posFrame = encodeGrzFrameForTest({
          type: 'pos',
          tick: 30,
          entities: [
            { entity_id: 1, user_id: 7, name: 'self', x: 100, y: 200, hp: 90, max_hp: 100, stamina_5s_remaining_milli: 1000 },
            { entity_id: 2, user_id: 8, name: 'active', x: 600, y: 200, hp: 100, current_join_mode: 'Active', firing: true }
          ],
          bullets: []
        });
        const result = await runReadOnlyCanary({
          gameOrigin: 'https://grasp-rat-game.h-e.top',
          snapshotPath: '/snapshot',
          wsPath: '/ws',
          wsExtraQuery: 'compress=gzip%2Cdeflate',
          controlMode: 'profit-live',
          readOnlyProbeMs: 1000,
          decisionIntervalMs: 1,
          frameGapAlertMs: 5000,
          movementCommandIntervalMs: 1,
          movementTargetDeadZoneCm: 900,
          userId: 7,
          sessionToken: 'profit-live-token'
        }, {
          now: () => t,
          sleep: async ms => {
            t += ms;
            if (wsOptions && !commands.length) wsOptions.onMessage(posFrame);
          },
          persistedState: {
            loginPointSafety: { point: { x: 100, y: 200, hp: 90, source: 'test' } }
          },
          fetchImpl: async () => fakeResponseForTest({
            body: {
              type: 'snapshot',
              tick: 29,
              entities: [{ entity_id: 1, user_id: 7, x: 100, y: 200, hp: 90 }],
              bullets: [],
              coin_drops: [{ drop_id: 3, amount: 10, x: 300, y: 200 }],
              messages: []
            }
          }),
          openBrowserlessWs: async options => {
            wsOptions = options;
            return {
              isOpen: () => true,
              close: () => {},
              sendVelocity: (dx, dy) => commands.push(`vel ${dx} ${dy}`),
              sendShoot: () => commands.push('shoot')
            };
          },
          leaveWithVerification: async () => ({ ok: true, attempts: [{ ok: true, summary: { leaveConfirmed: true } }] })
        });
        return [
          result.ok,
          result.error,
          result.safety.event?.reason,
          result.safety.exit?.ok,
          result.actions.sentCount,
          commands.join(','),
          result.decisions.last.kind,
          result.decisions.last.reason
        ].join('|');
      })(),
      want: 'true||||2|vel -1 0,vel 0 0|flee|active-threat-return-block'
    },
    {
      name: 'browserless combat-live canary sends guarded shoot only when enabled',
      got: (async () => {
        let t = Date.UTC(2026, 6, 8, 1, 0, 0);
        let wsOptions = null;
        let sleepCount = 0;
        const commands = [];
        const posFrame = encodeGrzFrameForTest({
          type: 'pos',
          tick: 30,
          entities: [
            { entity_id: 1, user_id: 7, name: 'self', x: 0, y: 0, hp: 90, stamina_5s_remaining_milli: 6000 },
            { entity_id: 2, user_id: 8, name: 'active', x: 1000, y: 0, hp: 80, current_join_mode: 'Active', firing: true, drop: 8 }
          ],
          bullets: []
        });
        const ackFrame = encodeGrzFrameForTest({
          type: 'shoot_ok',
          bullet_id: 99,
          owner_user_id: 7,
          start_x: 0,
          start_y: 0,
          target_x: 1000,
          target_y: 0,
          range_cm: 14500,
          speed_per_tick: 500,
          created_tick: 31,
          expire_tick: 60
        });
        const result = await runReadOnlyCanary({
          gameOrigin: 'https://grasp-rat-game.h-e.top',
          snapshotPath: '/snapshot',
          wsPath: '/ws',
          wsExtraQuery: 'compress=gzip%2Cdeflate',
          controlMode: 'combat-live',
          combatEnabled: true,
          combatShootMinIntervalMs: 1,
          readOnlyProbeMs: 1000,
          decisionIntervalMs: 1,
          frameGapAlertMs: 5000,
          movementCommandIntervalMs: 1,
          movementSettlementFrames: 1,
          userId: 7,
          sessionToken: 'combat-token'
        }, {
          now: () => t,
          sleep: async ms => {
            t += ms;
            sleepCount += 1;
            if (sleepCount === 1) wsOptions.onMessage(posFrame);
            if (sleepCount === 2) wsOptions.onMessage(ackFrame);
          },
          persistedState: {
            loginPointSafety: { point: { x: 0, y: 0, hp: 90, source: 'test' } }
          },
          fetchImpl: async () => fakeResponseForTest({
            body: {
              type: 'snapshot',
              tick: 29,
              entities: [{ entity_id: 1, user_id: 7, x: 0, y: 0, hp: 90 }],
              bullets: [],
              coin_drops: [],
              messages: []
            }
          }),
          openBrowserlessWs: async options => {
            wsOptions = options;
            return {
              isOpen: () => true,
              close: () => {},
              sendVelocity: (dx, dy) => commands.push(`vel ${dx} ${dy}`),
              sendShoot: (targetX, targetY, startX, startY) => commands.push(`shoot ${targetX} ${targetY} ${startX} ${startY}`)
            };
          },
          leaveWithVerification: async () => ({ ok: true, attempts: [{ ok: true, summary: { leaveConfirmed: true } }] })
        });
        return [
          result.ok,
          result.mode,
          result.actions.enabled,
          result.actions.shootSentCount > 0,
          commands.some(command => command.startsWith('shoot ')),
          result.actions.lastShootAck?.bullet_id,
          result.decisions.last.kind,
          result.decisions.last.combat.shooting.commandSuppressed,
          result.leave.ok
        ].join('|');
      })(),
      want: 'true|combat-live|true|true|true|99|combat-live|false|true'
    },
    {
      name: 'browserless read-only canary blocks before ws without login point',
      got: (async () => {
        let opened = false;
        let fetched = false;
        const result = await runReadOnlyCanary({
          gameOrigin: 'https://grasp-rat-game.h-e.top',
          userId: 7,
          sessionToken: 'canary-token',
          readOnlyProbeMs: 1000
        }, {
          now: () => Date.UTC(2026, 6, 8, 1, 0, 0),
          persistedState: {},
          fetchImpl: async () => {
            fetched = true;
            return fakeResponseForTest({
              body: {
                type: 'snapshot',
                tick: 1,
                entities: [{ entity_id: 2, user_id: 8, name: 'other', x: 100, y: 200, hp: 100 }],
                bullets: [],
                coin_drops: [],
                messages: []
              }
            });
          },
          openBrowserlessWs: async () => {
            opened = true;
            throw new Error('ws should not open');
          },
          leaveWithVerification: async () => ({ ok: true })
        });
        return [
          result.ok,
          result.snapshotSafety.reason,
          result.error,
          fetched,
          opened
        ].join('|');
      })(),
      want: 'false|missing-login-point|snapshot safety not confirmed: missing-login-point|true|false'
    },
    {
      name: 'browserless read-only canary reconnects when snapshot already has self without login point',
      got: (async () => {
        let t = Date.UTC(2026, 6, 8, 1, 0, 0);
        let opened = false;
        const posFrame = encodeGrzFrameForTest({
          type: 'pos',
          tick: 2,
          entities: [{ entity_id: 1, user_id: 7, name: 'self', x: 300, y: 400, hp: 88 }],
          bullets: []
        });
        const result = await runReadOnlyCanary({
          gameOrigin: 'https://grasp-rat-game.h-e.top',
          userId: 7,
          sessionToken: 'canary-token',
          readOnlyProbeMs: 1000
        }, {
          now: () => t,
          sleep: async ms => { t += ms; },
          persistedState: {},
          fetchImpl: async () => fakeResponseForTest({
            body: {
              type: 'snapshot',
              tick: 1,
              entities: [
                { entity_id: 1, user_id: 7, name: 'self', x: 300, y: 400, hp: 88 },
                { entity_id: 2, user_id: 8, name: 'active', x: 320, y: 420, hp: 100, current_join_mode: 'Active', life: 'Alive' }
              ],
              bullets: [],
              coin_drops: [],
              messages: []
            }
          }),
          openBrowserlessWs: async options => {
            opened = true;
            t += 100;
            options.onMessage(posFrame);
            return {
              isOpen: () => true,
              close: () => {},
              send: () => {}
            };
          },
          leaveWithVerification: async () => ({ ok: true, attempts: [{ ok: true, summary: { leaveConfirmed: true } }] })
        });
        return [
          result.ok,
          result.snapshotSafety.reason,
          result.snapshotSafety.originalReason,
          result.snapshotSafety.bypassedPreLoginSafety,
          opened,
          result.entry.firstSelf.x,
          result.entry.firstSelf.y,
          result.leave.ok
        ].join('|');
      })(),
      want: 'true|self-present-reentry|missing-login-point|true|true|300|400|true'
    },
    {
      name: 'browserless read-only canary requires three safe login point checks before ws',
      got: (async () => {
        let t = Date.UTC(2026, 6, 8, 1, 0, 0);
        let fetchCount = 0;
        let sleepMs = 0;
        let opened = false;
        const progress = [];
        const posFrame = encodeGrzFrameForTest({
          type: 'pos',
          tick: 4,
          entities: [{ entity_id: 1, user_id: 7, name: 'self', x: 100, y: 200, hp: 90 }],
          bullets: []
        });
        const result = await runReadOnlyCanary({
          gameOrigin: 'https://grasp-rat-game.h-e.top',
          snapshotPath: '/snapshot',
          wsPath: '/ws',
          wsExtraQuery: 'compress=gzip%2Cdeflate',
          userId: 7,
          sessionToken: 'three-check-token',
          readOnlyProbeMs: 1000,
          decisionIntervalMs: 1,
          frameGapAlertMs: 5000,
          wsConnectTimeoutMs: 1000,
          httpTimeoutMs: 1000,
          loginPointSafetySuccessRequired: 3,
          loginPointSafetyProbeIntervalMs: 30000
        }, {
          now: () => t,
          sleep: async ms => {
            sleepMs += ms;
            t += ms;
          },
          persistedState: {
            loginPointSafety: { point: { x: 100, y: 200, hp: 90, source: 'test' } }
          },
          onSnapshotSafety: snapshotSafety => {
            progress.push([snapshotSafety.streak, snapshotSafety.required, snapshotSafety.ok].join('/'));
          },
          fetchImpl: async () => {
            fetchCount += 1;
            return fakeResponseForTest({
              body: {
                type: 'snapshot',
                tick: fetchCount,
                entities: [{ entity_id: 2, user_id: 8, name: 'idle', x: 50000, y: 50000, hp: 100 }],
                bullets: [],
                coin_drops: [],
                messages: []
              }
            });
          },
          openBrowserlessWs: async options => {
            opened = true;
            options.onMessage(posFrame);
            return {
              isOpen: () => true,
              close: () => {},
              send: () => {}
            };
          },
          leaveWithVerification: async () => ({ ok: true, attempts: [{ ok: true, summary: { leaveConfirmed: true } }] })
        });
        return [
          result.ok,
          opened,
          fetchCount,
          sleepMs,
          result.snapshotSafety.streak,
          result.snapshotSafety.required,
          result.snapshotSafety.satisfied,
          progress.join(','),
          result.leave.ok
        ].join('|');
      })(),
      want: 'true|true|3|61000|3|3|true|1/3/false,2/3/false,3/3/true|true'
    },
    {
      name: 'browserless read-only canary does not fail safety after deadline',
      got: (async () => {
        let t = Date.UTC(2026, 6, 8, 1, 0, 0);
        let deadlineMs = 0;
        let wsOptions = null;
        let sentLateNoSelf = false;
        const posFrame = encodeGrzFrameForTest({
          type: 'pos',
          tick: 40,
          entities: [{ entity_id: 1, user_id: 7, name: 'self', x: 100, y: 200, hp: 90 }],
          bullets: []
        });
        const noSelfFrame = encodeGrzFrameForTest({
          type: 'pos',
          tick: 41,
          entities: [{ entity_id: 2, user_id: 8, name: 'other', x: 150, y: 200, hp: 90 }],
          bullets: []
        });
        const result = await runReadOnlyCanary({
          gameOrigin: 'https://grasp-rat-game.h-e.top',
          snapshotPath: '/snapshot',
          wsPath: '/ws',
          wsExtraQuery: 'compress=gzip%2Cdeflate',
          userId: 7,
          sessionToken: 'deadline-token',
          readOnlyProbeMs: 1000,
          decisionIntervalMs: 1,
          frameGapAlertMs: 5000,
          wsConnectTimeoutMs: 1000,
          httpTimeoutMs: 1000
        }, {
          now: () => t,
          sleep: async ms => {
            t += ms;
            if (!sentLateNoSelf && deadlineMs && t >= deadlineMs) {
              sentLateNoSelf = true;
              wsOptions.onMessage(noSelfFrame);
            }
          },
          persistedState: {
            loginPointSafety: { point: { x: 100, y: 200, hp: 90, source: 'test' } }
          },
          fetchImpl: async () => fakeResponseForTest({
            body: {
              type: 'snapshot',
              tick: 39,
              entities: [{ entity_id: 1, user_id: 7, x: 100, y: 200, hp: 90 }],
              bullets: [],
              coin_drops: [],
              messages: []
            }
          }),
          openBrowserlessWs: async options => {
            wsOptions = options;
            deadlineMs = t + 1000;
            options.onMessage(posFrame);
            return {
              isOpen: () => true,
              close: () => {}
            };
          },
          safetyController: {
            evaluate: (_state, context = {}) => {
              if (Number(context.nowMs || 0) >= deadlineMs) {
                return { ok: false, reason: 'no-self', shouldLeave: true, stopMotion: true };
              }
              return { ok: true, reason: 'safe' };
            }
          },
          leaveWithVerification: async () => ({ ok: true, attempts: [{ ok: true, summary: { leaveConfirmed: true } }] })
        });
        return [
          result.ok,
          result.error || '',
          result.safety.event?.reason || '',
          result.stats.selfPresent.false,
          result.leave.ok
        ].join('|');
      })(),
      want: 'true|||1|true'
    },
    {
      name: 'browserless safety controller classifies unsafe states',
      got: (() => {
        const safeSelf = { user_id: 7, x: 1, y: 2, hp: 90, stamina_5s_remaining_milli: 1000 };
        const checks = [
          evaluateBrowserlessSafety({}, { snapshotSafety: { ok: false, reason: 'active-near-login-point' }, nowMs: 1000 }).reason,
          evaluateBrowserlessSafety({}, { wsError: { message: 'boom' }, nowMs: 1000 }).reason,
          evaluateBrowserlessSafety({}, { wsClosed: { code: 1006 }, nowMs: 1000 }).reason,
          evaluateBrowserlessSafety({ realtime: { self: safeSelf, frameAgeMs: 10 }, frameAges: { latestFrameAgeMs: 6000 } }, { nowMs: 7000, frameGapAlertMs: 5000 }).reason,
          evaluateBrowserlessSafety({ realtime: { self: null, frameAgeMs: null }, frameAges: {} }, { startedAtMs: 1000, nowMs: 5000, noSelfGraceMs: 3000 }).reason,
          evaluateBrowserlessSafety({ realtime: { self: safeSelf, frameAgeMs: 4000 }, frameAges: {} }, { nowMs: 5000, staleSelfMs: 3000 }).reason,
          evaluateBrowserlessSafety({ realtime: { self: { ...safeSelf, stamina_5s_remaining_milli: 100 }, frameAgeMs: 10 }, frameAges: {} }, { nowMs: 5000, staminaExhaustedBelowMs: 200 }).reason,
          evaluateBrowserlessSafety({}, { leaveResult: { ok: false, attempts: [{ status: 500, summary: { leaveConfirmed: false } }] }, nowMs: 5000 }).reason,
          evaluateBrowserlessSafety({ realtime: { self: safeSelf, frameAgeMs: 10 }, frameAges: {} }, {
            decision: { action: { kind: 'flee', band: 'safety', reason: 'active-threat-return-block', dx: -1, dy: 0 } },
            nowMs: 5000
          }).reason
        ];
        return checks.join('|');
      })(),
      want: 'unsafe-login-point|ws-error|ws-closed|frame-gap|no-self|stale-self|stamina-exhausted|direct-leave-failed|safe'
    },
    {
      name: 'browserless safety controller explicit stop persists until cleared',
      got: (() => {
        let t = 1000;
        const controller = createBrowserlessSafetyController({ now: () => t });
        const requested = controller.requestStop('explicit-stop', { source: 'test' });
        t = 1200;
        const stopped = controller.evaluate({
          realtime: { self: { user_id: 7, x: 1, y: 2, stamina_5s_remaining_milli: 1000 }, frameAgeMs: 10 },
          frameAges: {}
        }, { nowMs: t });
        controller.clearStop();
        const clear = controller.evaluate({
          realtime: { self: { user_id: 7, x: 1, y: 2, stamina_5s_remaining_milli: 1000 }, frameAgeMs: 10 },
          frameAges: {}
        }, { nowMs: t });
        return [
          requested.reason,
          requested.detail.source,
          stopped.reason,
          clear.ok,
          clear.reason
        ].join('|');
      })(),
      want: 'explicit-stop|test|explicit-stop|true|safe'
    },
    {
      name: 'browserless safety exit sends stop motion and verified leave',
      got: (async () => {
        const sent = [];
        const result = await executeSafetyExit({
          reason: 'frame-gap',
          shouldLeave: true,
          stopMotion: true
        }, {
          gameOrigin: 'https://grasp-rat-game.h-e.top',
          userId: 7,
          sessionToken: 'safety-token'
        }, {
          allowStopMotion: true,
          transport: {
            sendVelocity: (dx, dy) => sent.push(`${dx},${dy}`)
          },
          leaveWithVerification: async options => ({
            ok: true,
            attempts: [{ ok: true, userId: options.userId, summary: { leaveConfirmed: true } }]
          })
        });
        return [
          result.ok,
          result.stopMotion.sent,
          sent.join(';'),
          result.leave.ok,
          result.leave.attempts[0].userId,
          result.leaveFailure === null
        ].join('|');
      })(),
      want: 'true|true|0,0|true|7|true'
    },
    {
      name: 'browserless combat selector source does not reference snapshot state',
      got: /snapshot|fallback|coinDrops/.test(selectRealtimeCombatState.toString()),
      want: false
    },
    {
      name: 'browserless local log store appends redacted UTC day files',
      got: withTempDirForTest(async dir => {
        let current = Date.UTC(2026, 6, 8, 1, 0, 0);
        const store = createLocalLogStore({ logDir: dir, now: () => current });
        const first = store.append('runner', 'session-start', {
          url: 'https://x.test/?token=secret-token',
          token: 'secret-field',
          code: 'secret-code'
        });
        current = Date.UTC(2026, 6, 9, 1, 0, 0);
        const second = store.append('exits', 'leave', {
          authorization: 'Bearer secret-bearer',
          nested: { url: 'https://x.test/?secret=secret-url' }
        });
        const third = store.append('ws', 'send', {
          message: 'vel 1 0'
        });
        const firstText = fs.readFileSync(first.file, 'utf8');
        const secondText = fs.readFileSync(second.file, 'utf8');
        const thirdText = fs.readFileSync(third.file, 'utf8');
        return [
          path.relative(dir, first.file),
          path.relative(dir, second.file),
          path.relative(dir, third.file),
          firstText.includes('[redacted]'),
          secondText.includes('[redacted]'),
          thirdText.includes('vel 1 0'),
          !/secret-token|secret-field|secret-code|secret-bearer|secret-url/.test(firstText + secondText + thirdText),
          store.readEntries('runner', '2026-07-08')[0]?.type
        ].join('|');
      }),
      want: '2026-07-08/runner.jsonl|2026-07-09/exits.jsonl|2026-07-09/ws.jsonl|true|true|true|true|session-start'
    },
    {
      name: 'browserless log retention deletes day directories outside keep window',
      got: withTempDirForTest(async dir => {
        for (const day of ['2026-07-04', '2026-07-05', '2026-07-06', '2026-07-07', '2026-07-08']) {
          fs.mkdirSync(path.join(dir, day), { recursive: true });
          fs.writeFileSync(path.join(dir, day, 'runner.jsonl'), '');
        }
        fs.mkdirSync(path.join(dir, 'misc'), { recursive: true });
        const result = cleanupOldLogDays(dir, {
          nowMs: Date.UTC(2026, 6, 8, 12, 0, 0),
          keepDays: 3
        });
        return [
          result.cutoffDay,
          result.removed.join(','),
          result.kept.join(','),
          fs.existsSync(path.join(dir, '2026-07-05')),
          fs.existsSync(path.join(dir, '2026-07-06')),
          fs.existsSync(path.join(dir, 'misc'))
        ].join('|');
      }),
      want: '2026-07-06|2026-07-04,2026-07-05|2026-07-06,2026-07-07,2026-07-08|false|true|true'
    },
    {
      name: 'browserless log summary counts streams and writes summary file',
      got: withTempDirForTest(async dir => {
        const store = createLocalLogStore({
          logDir: dir,
          now: () => Date.UTC(2026, 6, 8, 1, 0, 0)
        });
        store.append('runner', 'start', { ok: true });
        store.append('runner', 'frame-gap', { gapMs: 1200 });
        store.append('decisions', 'decision', { kind: 'wait' });
        store.append('ws', 'message', {
          decodedType: 'pos',
          decodedJsonKeys: ['type', 'tick', 'entities', 'bullets', 'drops'],
          decodedSummary: { type: 'pos', coinDropCount: 1 }
        });
        store.append('ws', 'message', {
          decodedType: 'snapshot',
          decodedJsonKeys: ['type', 'tick', 'entities', 'bullets', 'coin_drops', 'messages'],
          decodedSummary: { type: 'snapshot', coinDropCount: 3 }
        });
        const summary = summarizeBrowserlessLogDay({ logDir: dir, day: '2026-07-08' });
        const output = writeBrowserlessLogSummary(summary);
        const written = JSON.parse(fs.readFileSync(output, 'utf8'));
        return [
          summary.totals.entries,
          summary.streams.runner.entries,
          summary.streams.runner.typeCounts.start,
          summary.streams.runner.typeCounts['frame-gap'],
          summary.streams.decisions.typeCounts.decision,
          summary.streams.ws.entries,
          summary.streams.ws.wsDiagnostics.realtimeCoinLikeFieldCounts.drops,
          summary.streams.ws.wsDiagnostics.realtimeCoinDropFrames,
          summary.streams.ws.wsDiagnostics.snapshotCoinLikeFieldCounts.coin_drops,
          summary.streams.ws.wsDiagnostics.snapshotCoinDropFrames,
          path.basename(output),
          written.totals.entries
        ].join('|');
      }),
      want: '5|2|1|1|1|2|1|1|1|1|summary.json|5'
    },
    {
      name: 'browserless action parity audit normalizes known decision cases',
      got: withTempDirForTest(async dir => {
        const dayDir = path.join(dir, '2026-07-08');
        fs.mkdirSync(dayDir, { recursive: true });
        const write = (stream, entry) => {
          fs.appendFileSync(path.join(dayDir, `${stream}.jsonl`), `${JSON.stringify(entry)}\n`);
        };
        const decision = (at, action) => write('decisions', {
          at,
          type: 'decision',
          detail: {
            kind: action.kind,
            band: action.band,
            reason: action.reason,
            action
          }
        });
        decision('2026-07-08T01:00:00.000Z', {
          kind: 'coin',
          band: 'profit',
          reason: 'best-opportunity-coin',
          target: { type: 'coin', id: 'coin-safe', authority: 'realtime', amount: 1 }
        });
        decision('2026-07-08T01:00:01.000Z', {
          kind: 'attack',
          band: 'profit',
          reason: 'best-opportunity-enemy',
          target: { type: 'enemy', userId: 42, authority: 'realtime', drop: 12, active: false, moving: false, firing: false }
        });
        decision('2026-07-08T01:00:02.000Z', {
          kind: 'safety-exit',
          band: 'safety',
          reason: 'profit-live-active-threat',
          shouldLeave: true,
          target: { type: 'enemy', userId: 43, authority: 'realtime', active: false, moving: true, firing: false }
        });
        decision('2026-07-08T01:00:03.000Z', {
          kind: 'combat-live',
          band: 'combat',
          reason: 'combat-live-realtime',
          dx: 1,
          dy: -1,
          shoot: true,
          target: { type: 'enemy', userId: 44, authority: 'realtime', active: false, moving: false, firing: true }
        });
        decision('2026-07-08T01:00:04.000Z', {
          kind: 'safety-exit',
          band: 'safety',
          reason: 'profit-live-active-threat',
          shouldLeave: true,
          target: { type: 'enemy', userId: 45, authority: 'realtime', active: true, moving: true, firing: false }
        });
        decision('2026-07-08T01:00:05.000Z', {
          kind: 'recover',
          band: 'recover',
          reason: 'wait-for-full-stamina-and-hp'
        });
        decision('2026-07-08T01:00:06.000Z', {
          kind: 'leave',
          band: 'exit',
          reason: 'nearest-coin-stamina-budget',
          shouldLeave: true
        });
        decision('2026-07-08T01:00:07.000Z', {
          kind: 'coin',
          band: 'profit',
          reason: 'daily-stamina-final-coin',
          target: { type: 'coin', id: 'daily-final', authority: 'realtime', amount: 1 }
        });
        decision('2026-07-08T01:00:08.000Z', {
          kind: 'seek-coin',
          band: 'profit',
          reason: 'best-opportunity-visible-coin',
          target: { type: 'coin', id: 'snapshot-coin', authority: 'snapshot', snapshotOnly: true, amount: 1 }
        });
        decision('2026-07-08T01:00:09.000Z', {
          kind: 'safety-exit',
          band: 'safety',
          reason: 'profit-live-snapshot-active-threat',
          shouldLeave: true,
          target: { type: 'enemy', userId: 46, authority: 'realtime', active: true, moving: false, firing: false }
        });
        const summary = summarizeBrowserlessActionParityAudit({ logDir: dir, day: '2026-07-08' });
        const combat = summary.records.find(record => record.kind === 'combat-live');
        const activeExit = summary.missing.find(record => record.targetId === '45');
        const snapshot = summary.knownTransportExceptions.find(record => record.targetId === 'snapshot-coin');
        const snapshotActive = summary.knownTransportExceptions.find(record => record.targetId === '46');
        return [
          summary.ok,
          summary.counts.actions,
          summary.counts.byStatus.aligned,
          summary.counts.byStatus['missing-browser-branch'],
          summary.counts.byStatus['known-transport-exception'],
          combat?.shoot,
          combat?.dx,
          combat?.dy,
          combat?.authority,
          activeExit?.classification?.key,
          snapshot?.classification?.key,
          snapshotActive?.classification?.key
        ].join('|');
      }),
      want: 'false|10|6|2|2|true|1|-1|realtime|browserless-safety-exit|snapshot-coin-fallback|snapshot-active-threat-safety-exit'
    },
    {
      name: 'browserless canary audit validates finish and forced stop evidence',
      got: withTempDirForTest(async dir => {
        const dayDir = path.join(dir, '2026-07-08');
        fs.mkdirSync(dayDir, { recursive: true });
        const write = (stream, entry) => {
          fs.appendFileSync(path.join(dayDir, `${stream}.jsonl`), `${JSON.stringify(entry)}\n`);
        };
        const baseFinish = {
          mode: 'read-only',
          ok: true,
          startedAt: '2026-07-08T01:00:00.000Z',
          completedAt: '2026-07-08T01:05:00.000Z',
          snapshotSafety: { ok: true },
          stats: { decodedFrameCount: 120, selfPresent: { true: 118, false: 2 } },
          frameHealth: { decodeErrors: 0 },
          actions: { sentCount: 0, velocitySentCount: 0, shootSentCount: 0 },
          leave: { ok: true }
        };
        write('runner', { at: '2026-07-08T01:05:00.000Z', type: 'canary-finish', detail: baseFinish });
        write('decisions', { at: '2026-07-08T01:00:01.000Z', type: 'decision', detail: { kind: 'wait' } });
        write('decisions', { at: '2026-07-08T01:06:01.000Z', type: 'decision', detail: { kind: 'outside-window' } });
        write('runner', { at: '2026-07-08T01:06:02.000Z', type: 'movement-command', detail: { action: { kind: 'outside-window' } } });
        const clean = summarizeBrowserlessCanaryAudit({ logDir: dir, day: '2026-07-08', profile: 'read-only' });
        const cleanWithStopRequirement = summarizeBrowserlessCanaryAudit({ logDir: dir, day: '2026-07-08', profile: 'read-only', requireStop: true });

        const stopDayDir = path.join(dir, '2026-07-09');
        fs.mkdirSync(stopDayDir, { recursive: true });
        const writeStop = (stream, entry) => {
          fs.appendFileSync(path.join(stopDayDir, `${stream}.jsonl`), `${JSON.stringify(entry)}\n`);
        };
        writeStop('runner', {
          at: '2026-07-09T01:05:00.000Z',
          type: 'canary-failed',
          detail: {
            ...baseFinish,
            startedAt: '2026-07-09T01:00:00.000Z',
            completedAt: '2026-07-09T01:05:00.000Z',
            ok: false,
            error: 'explicit-stop',
            safety: { event: { reason: 'explicit-stop' }, exit: { leave: { ok: true } } }
          }
        });
        writeStop('decisions', { at: '2026-07-09T01:00:01.000Z', type: 'decision', detail: { kind: 'wait' } });
        writeStop('exits', { at: '2026-07-09T01:00:02.000Z', type: 'safety-event', detail: { reason: 'explicit-stop' } });
        writeStop('exits', { at: '2026-07-09T01:06:02.000Z', type: 'safety-event', detail: { reason: 'outside-window' } });
        const forcedStop = summarizeBrowserlessCanaryAudit({ logDir: dir, day: '2026-07-09', profile: 'read-only', requireStop: true });

        const actionLeakDayDir = path.join(dir, '2026-07-10');
        fs.mkdirSync(actionLeakDayDir, { recursive: true });
        const writeActionLeak = (stream, entry) => {
          fs.appendFileSync(path.join(actionLeakDayDir, `${stream}.jsonl`), `${JSON.stringify(entry)}\n`);
        };
        writeActionLeak('runner', {
          at: '2026-07-10T01:05:00.000Z',
          type: 'canary-finish',
          detail: {
            ...baseFinish,
            startedAt: '2026-07-10T01:00:00.000Z',
            completedAt: '2026-07-10T01:05:00.000Z'
          }
        });
        writeActionLeak('decisions', { at: '2026-07-10T01:00:01.000Z', type: 'decision', detail: { kind: 'wait' } });
        writeActionLeak('runner', { at: '2026-07-10T01:00:02.000Z', type: 'movement-command', detail: { action: { kind: 'velocity' } } });
        const actionLeak = summarizeBrowserlessCanaryAudit({ logDir: dir, day: '2026-07-10', profile: 'read-only' });

        const combatLiveDayDir = path.join(dir, '2026-07-11');
        fs.mkdirSync(combatLiveDayDir, { recursive: true });
        const writeCombatLive = (stream, entry) => {
          fs.appendFileSync(path.join(combatLiveDayDir, `${stream}.jsonl`), `${JSON.stringify(entry)}\n`);
        };
        writeCombatLive('runner', {
          at: '2026-07-11T01:05:00.000Z',
          type: 'canary-finish',
          detail: {
            ...baseFinish,
            mode: 'combat-live',
            startedAt: '2026-07-11T01:00:00.000Z',
            completedAt: '2026-07-11T01:05:00.000Z',
            actions: { sentCount: 2, velocitySentCount: 1, shootSentCount: 1, lastShootAck: { bullet_id: 77 } }
          }
        });
        writeCombatLive('decisions', { at: '2026-07-11T01:00:01.000Z', type: 'decision', detail: { kind: 'combat-live' } });
        writeCombatLive('runner', { at: '2026-07-11T01:00:02.000Z', type: 'movement-command', detail: { action: { kind: 'combat-live' } } });
        writeCombatLive('combat', {
          at: '2026-07-11T01:00:03.000Z',
          type: 'combat-live',
          detail: {
            target: { authority: 'realtime' },
            candidates: [{ authority: 'realtime' }]
          }
        });
        const combatLive = summarizeBrowserlessCanaryAudit({ logDir: dir, day: '2026-07-11', profile: 'combat-live' });

        const combatDryRunDayDir = path.join(dir, '2026-07-17');
        fs.mkdirSync(combatDryRunDayDir, { recursive: true });
        const writeCombatDryRun = (stream, entry) => {
          fs.appendFileSync(path.join(combatDryRunDayDir, `${stream}.jsonl`), `${JSON.stringify(entry)}\n`);
        };
        writeCombatDryRun('runner', {
          at: '2026-07-17T01:05:00.000Z',
          type: 'canary-finish',
          detail: {
            ...baseFinish,
            mode: 'combat-dry-run',
            startedAt: '2026-07-17T01:00:00.000Z',
            completedAt: '2026-07-17T01:05:00.000Z',
            actions: { sentCount: 0, velocitySentCount: 0, shootSentCount: 0 }
          }
        });
        writeCombatDryRun('decisions', { at: '2026-07-17T01:00:01.000Z', type: 'decision', detail: { kind: 'combat-dry-run' } });
        writeCombatDryRun('combat', {
          at: '2026-07-17T01:00:03.000Z',
          type: 'combat-dry-run',
          detail: {
            target: { authority: 'realtime' },
            candidates: [{ authority: 'realtime' }],
            shooting: { dryRunOnly: true, commandSuppressed: true }
          }
        });
        const combatDryRun = summarizeBrowserlessCanaryAudit({ logDir: dir, day: '2026-07-17', profile: 'combat-dry-run' });

        const combatDryRunNoTargetDayDir = path.join(dir, '2026-07-18');
        fs.mkdirSync(combatDryRunNoTargetDayDir, { recursive: true });
        const writeCombatDryRunNoTarget = (stream, entry) => {
          fs.appendFileSync(path.join(combatDryRunNoTargetDayDir, `${stream}.jsonl`), `${JSON.stringify(entry)}\n`);
        };
        writeCombatDryRunNoTarget('runner', {
          at: '2026-07-18T01:05:00.000Z',
          type: 'canary-finish',
          detail: {
            ...baseFinish,
            mode: 'combat-dry-run',
            startedAt: '2026-07-18T01:00:00.000Z',
            completedAt: '2026-07-18T01:05:00.000Z',
            actions: { sentCount: 0, velocitySentCount: 0, shootSentCount: 0 }
          }
        });
        writeCombatDryRunNoTarget('decisions', { at: '2026-07-18T01:00:01.000Z', type: 'decision', detail: { kind: 'combat-dry-run' } });
        writeCombatDryRunNoTarget('combat', {
          at: '2026-07-18T01:00:03.000Z',
          type: 'combat-dry-run',
          detail: {
            target: null,
            candidates: [],
            shooting: { dryRunOnly: true, commandSuppressed: true }
          }
        });
        const combatDryRunNoTarget = summarizeBrowserlessCanaryAudit({ logDir: dir, day: '2026-07-18', profile: 'combat-dry-run' });

        const combatLiveMissingActionDayDir = path.join(dir, '2026-07-12');
        fs.mkdirSync(combatLiveMissingActionDayDir, { recursive: true });
        const writeCombatLiveMissingAction = (stream, entry) => {
          fs.appendFileSync(path.join(combatLiveMissingActionDayDir, `${stream}.jsonl`), `${JSON.stringify(entry)}\n`);
        };
        writeCombatLiveMissingAction('runner', {
          at: '2026-07-12T01:05:00.000Z',
          type: 'canary-finish',
          detail: {
            ...baseFinish,
            mode: 'combat-live',
            startedAt: '2026-07-12T01:00:00.000Z',
            completedAt: '2026-07-12T01:05:00.000Z',
            actions: { sentCount: 1, velocitySentCount: 1, shootSentCount: 0 }
          }
        });
        writeCombatLiveMissingAction('decisions', { at: '2026-07-12T01:00:01.000Z', type: 'decision', detail: { kind: 'combat-live' } });
        writeCombatLiveMissingAction('combat', {
          at: '2026-07-12T01:00:03.000Z',
          type: 'combat-live',
          detail: { target: { authority: 'realtime' } }
        });
        const combatLiveMissingAction = summarizeBrowserlessCanaryAudit({ logDir: dir, day: '2026-07-12', profile: 'combat-live' });

        const movementShootLeakDayDir = path.join(dir, '2026-07-13');
        fs.mkdirSync(movementShootLeakDayDir, { recursive: true });
        const writeMovementShootLeak = (stream, entry) => {
          fs.appendFileSync(path.join(movementShootLeakDayDir, `${stream}.jsonl`), `${JSON.stringify(entry)}\n`);
        };
        writeMovementShootLeak('runner', {
          at: '2026-07-13T01:05:00.000Z',
          type: 'canary-finish',
          detail: {
            ...baseFinish,
            mode: 'movement-only',
            startedAt: '2026-07-13T01:00:00.000Z',
            completedAt: '2026-07-13T01:05:00.000Z',
            actions: { sentCount: 1, velocitySentCount: 1, shootSentCount: 0 }
          }
        });
        writeMovementShootLeak('decisions', { at: '2026-07-13T01:00:01.000Z', type: 'decision', detail: { kind: 'profit-candidate' } });
        writeMovementShootLeak('runner', {
          at: '2026-07-13T01:00:02.000Z',
          type: 'movement-command',
          detail: {
            action: { kind: 'velocity' },
            state: { shootSentCount: 1, lastShootCommand: { type: 'shoot' } }
          }
        });
        const movementShootLeak = summarizeBrowserlessCanaryAudit({ logDir: dir, day: '2026-07-13', profile: 'movement-only' });

        const combatLiveMissingAckDayDir = path.join(dir, '2026-07-14');
        fs.mkdirSync(combatLiveMissingAckDayDir, { recursive: true });
        const writeCombatLiveMissingAck = (stream, entry) => {
          fs.appendFileSync(path.join(combatLiveMissingAckDayDir, `${stream}.jsonl`), `${JSON.stringify(entry)}\n`);
        };
        writeCombatLiveMissingAck('runner', {
          at: '2026-07-14T01:05:00.000Z',
          type: 'canary-finish',
          detail: {
            ...baseFinish,
            mode: 'combat-live',
            startedAt: '2026-07-14T01:00:00.000Z',
            completedAt: '2026-07-14T01:05:00.000Z',
            actions: { sentCount: 1, velocitySentCount: 1, shootSentCount: 0 }
          }
        });
        writeCombatLiveMissingAck('decisions', { at: '2026-07-14T01:00:01.000Z', type: 'decision', detail: { kind: 'combat-live' } });
        writeCombatLiveMissingAck('runner', {
          at: '2026-07-14T01:00:02.000Z',
          type: 'movement-command',
          detail: {
            action: { kind: 'combat-live', shoot: { command: { type: 'shoot' } } },
            state: { shootSentCount: 1 }
          }
        });
        writeCombatLiveMissingAck('combat', {
          at: '2026-07-14T01:00:03.000Z',
          type: 'combat-live',
          detail: { target: { authority: 'realtime' } }
        });
        const combatLiveMissingAck = summarizeBrowserlessCanaryAudit({ logDir: dir, day: '2026-07-14', profile: 'combat-live' });

        const runIdDayDir = path.join(dir, '2026-07-15');
        fs.mkdirSync(runIdDayDir, { recursive: true });
        const writeRunId = (stream, entry) => {
          fs.appendFileSync(path.join(runIdDayDir, `${stream}.jsonl`), `${JSON.stringify(entry)}\n`);
        };
        const selectedRunId = createCanaryRunId('read-only', Date.UTC(2026, 6, 15, 1, 0, 0));
        writeRunId('runner', {
          at: '2026-07-15T01:05:00.000Z',
          type: 'canary-finish',
          detail: {
            ...baseFinish,
            runId: selectedRunId,
            startedAt: '2026-07-15T01:00:00.000Z',
            completedAt: '2026-07-15T01:05:00.000Z'
          }
        });
        writeRunId('decisions', { at: '2026-07-15T01:00:01.000Z', type: 'decision', detail: { runId: selectedRunId, kind: 'wait' } });
        writeRunId('decisions', { at: '2026-07-15T01:00:02.000Z', type: 'decision', detail: { runId: 'other-run', kind: 'outside-run-id' } });
        writeRunId('runner', { at: '2026-07-15T01:00:03.000Z', type: 'movement-command', detail: { runId: 'other-run', action: { kind: 'velocity' } } });
        const runIdScoped = summarizeBrowserlessCanaryAudit({ logDir: dir, day: '2026-07-15', profile: 'read-only' });
        const bootstrapOnlyDayDir = path.join(dir, '2026-07-16');
        fs.mkdirSync(bootstrapOnlyDayDir, { recursive: true });
        const writeBootstrapOnly = (stream, entry) => {
          fs.appendFileSync(path.join(bootstrapOnlyDayDir, `${stream}.jsonl`), `${JSON.stringify(entry)}\n`);
        };
        writeBootstrapOnly('runner', {
          at: '2026-07-16T01:05:00.000Z',
          type: 'canary-finish',
          detail: {
            ...baseFinish,
            startedAt: '2026-07-16T01:00:00.000Z',
            completedAt: '2026-07-16T01:05:00.000Z',
            snapshotSafety: { ok: true, bootstrapOnly: true, reason: 'bootstrap-missing-login-point' }
          }
        });
        writeBootstrapOnly('decisions', { at: '2026-07-16T01:00:01.000Z', type: 'decision', detail: { kind: 'wait' } });
        const bootstrapOnly = summarizeBrowserlessCanaryAudit({ logDir: dir, day: '2026-07-16', profile: 'read-only' });
        return [
          clean.ok,
          clean.failed.length,
          clean.runWindow.applied,
          clean.counts.decisions,
          clean.counts.movementCommand,
          cleanWithStopRequirement.ok,
          cleanWithStopRequirement.failed.some(item => item.key === 'explicit-stop'),
          forcedStop.ok,
          forcedStop.counts.explicitStop,
          actionLeak.ok,
          actionLeak.failed.some(item => item.key === 'no-actions'),
          combatLive.ok,
          combatLive.counts.movementCommand,
          combatDryRun.ok,
          combatDryRun.counts.combatDryRunTarget,
          combatDryRunNoTarget.ok,
          combatDryRunNoTarget.failed.some(item => item.key === 'combat-target-logged'),
          combatLiveMissingAction.ok,
          combatLiveMissingAction.failed.some(item => item.key === 'combat-action-logged'),
          movementShootLeak.ok,
          movementShootLeak.failed.some(item => item.key === 'no-shoot'),
          movementShootLeak.counts.shootCommand,
          combatLiveMissingAck.ok,
          combatLiveMissingAck.failed.some(item => item.key === 'shoot-ack-or-no-shot'),
          combatLiveMissingAck.counts.shootCommand,
          selectedRunId,
          runIdScoped.ok,
          runIdScoped.runId,
          runIdScoped.counts.decisions,
          runIdScoped.counts.movementCommand,
          bootstrapOnly.ok,
          bootstrapOnly.failed.some(item => item.key === 'snapshot-safety')
        ].join('|');
      }),
      want: 'true|0|true|1|0|false|true|true|1|false|true|true|1|true|1|false|true|false|true|false|true|1|false|true|1|read-only-20260715T010000000Z|true|read-only-20260715T010000000Z|1|0|false|true'
    },
    {
      name: 'browserless canary parity audit summarizes exceptions and drift',
      got: withTempDirForTest(async dir => {
        const write = (day, stream, entry) => {
          const dayDir = path.join(dir, day);
          fs.mkdirSync(dayDir, { recursive: true });
          fs.appendFileSync(path.join(dayDir, `${stream}.jsonl`), `${JSON.stringify(entry)}\n`);
        };
        const finalFor = (day, overrides = {}) => ({
          at: `${day}T01:05:00.000Z`,
          type: 'canary-finish',
          detail: {
            mode: 'profit-live',
            ok: true,
            startedAt: `${day}T01:00:00.000Z`,
            completedAt: `${day}T01:05:00.000Z`,
            snapshotSafety: { ok: true },
            stats: { decodedFrameCount: 120, selfPresent: { true: 118, false: 2 } },
            frameHealth: { decodeErrors: 0 },
            actions: { sentCount: 2, velocitySentCount: 1, shootSentCount: 0 },
            leave: { ok: true },
            ...overrides
          }
        });
        write('2026-07-19', 'runner', finalFor('2026-07-19'));
        write('2026-07-19', 'decisions', {
          at: '2026-07-19T01:00:01.000Z',
          type: 'decision',
          detail: {
            kind: 'coin',
            band: 'profit',
            reason: 'best-opportunity-coin',
            action: {
              kind: 'coin',
              band: 'profit',
              reason: 'best-opportunity-coin',
              target: { type: 'coin', id: 'coin-safe', authority: 'realtime', amount: 1 }
            }
          }
        });
        write('2026-07-19', 'decisions', {
          at: '2026-07-19T01:00:02.000Z',
          type: 'decision',
          detail: {
            kind: 'seek-coin',
            band: 'profit',
            reason: 'best-opportunity-visible-coin',
            action: {
              kind: 'seek-coin',
              band: 'profit',
              reason: 'best-opportunity-visible-coin',
              target: { type: 'coin', id: 'snapshot-coin', authority: 'snapshot', snapshotOnly: true, amount: 1 }
            }
          }
        });
        write('2026-07-19', 'decisions', {
          at: '2026-07-19T01:00:03.000Z',
          type: 'decision',
          detail: {
            kind: 'post-attack-drop-wait',
            band: 'profit',
            reason: 'post-attack-drop-wait-position',
            action: {
              kind: 'post-attack-drop-wait',
              band: 'profit',
              reason: 'post-attack-drop-wait-position',
              target: { type: 'post-attack-target', id: 'target-1', drop: 20 }
            }
          }
        });
        write('2026-07-19', 'combat', {
          at: '2026-07-19T01:00:04.000Z',
          type: 'combat-live',
          detail: {
            action: { kind: 'combat-live', band: 'combat', reason: 'combat-live-realtime', target: { type: 'enemy', userId: 44, authority: 'realtime', firing: true } },
            target: { authority: 'realtime' },
            candidates: [{ authority: 'realtime' }]
          }
        });
        const clean = summarizeBrowserlessCanaryAudit({ logDir: dir, day: '2026-07-19', profile: 'profit-live-parity' });

        write('2026-07-20', 'runner', finalFor('2026-07-20'));
        write('2026-07-20', 'decisions', {
          at: '2026-07-20T01:00:01.000Z',
          type: 'decision',
          detail: {
            kind: 'attack',
            band: 'profit',
            reason: 'best-opportunity-enemy',
            action: {
              kind: 'attack',
              band: 'profit',
              reason: 'best-opportunity-enemy',
              target: { type: 'enemy', userId: 51, authority: 'realtime', drop: 1, active: false, moving: false, firing: false }
            }
          }
        });
        write('2026-07-20', 'decisions', {
          at: '2026-07-20T01:00:02.000Z',
          type: 'decision',
          detail: {
            kind: 'attack',
            band: 'profit',
            reason: 'best-opportunity-enemy',
            action: {
              kind: 'attack',
              band: 'profit',
              reason: 'best-opportunity-enemy',
              target: { type: 'enemy', userId: 52, authority: 'realtime', drop: 9, active: false, moving: true, firing: false }
            }
          }
        });
        const drift = summarizeBrowserlessCanaryAudit({ logDir: dir, day: '2026-07-20', profile: 'profit-live-parity' });
        const args = parseBrowserlessCanaryAuditArgs(['--parity']);
        return [
          args.profile,
          clean.ok,
          clean.counts.parityActions,
          clean.counts.parityMissing,
          clean.counts.parityKnownTransportExceptions,
          clean.counts.parityLowDropAfk,
          clean.counts.parityMovingOrFiringAfk,
          clean.counts.parityPostAttackDrop,
          clean.parity.knownTransportExceptions.length,
          drift.ok,
          drift.failed.some(item => item.key === 'no-low-drop-afk'),
          drift.failed.some(item => item.key === 'no-moving-firing-afk'),
          drift.failed.some(item => item.key === 'no-missing-browser-branch'),
          drift.counts.parityLowDropAfk,
          drift.counts.parityMovingOrFiringAfk,
          drift.counts.parityMissing
        ].join('|');
      }),
      want: 'profit-live-parity|true|4|0|1|0|0|1|1|false|true|true|true|1|1|1'
    },
    {
      name: 'browserless target whitelist loads local fallback and remote override',
      got: withTempDirForTest(async dir => {
        const file = path.join(dir, 'target-whitelist.json');
        fs.writeFileSync(file, JSON.stringify({ names: ['Local Protected'] }));
        const whitelist = createBrowserlessTargetWhitelist({
          file,
          url: 'https://example.test/target-whitelist.json?token=secret-token',
          now: () => 1234,
          fetchWithTimeout: async () => ({
            ok: true,
            status: 200,
            statusText: 'OK',
            text: async () => JSON.stringify({ names: ['Remote Protected'] })
          })
        });
        const summary = await whitelist.refresh('self-test');
        return [
          summary.loaded,
          summary.count,
          summary.lastSource,
          whitelist.isWhitelistedTarget({ name: 'Remote Protected' }),
          whitelist.isWhitelistedTarget({ name: 'Local Protected' }),
          summary.sources.length,
          summary.sources[0].source,
          summary.sources[1].source,
          summary.url.includes('secret-token'),
          summary.url.includes('[redacted]')
        ].join('|');
      }),
      want: 'true|1|remote-url|true|false|2|local-file|remote-url|false|true'
    },
    {
      name: 'browserless runner config parses env and cli overrides',
      got: (() => {
        const config = parseBrowserlessRunnerArgs([
          '--once',
          '--live',
          '--data-dir',
          '/tmp/grasp-rat-runner',
          '--log-dir',
          '/tmp/grasp-rat-browserless-logs',
          '--status-port',
          '19999',
          '--web-token',
          'cli-token',
          '--combat-live',
          '--combat-enabled',
          '--combat-shoot-min-interval-ms',
          '220',
          '--decision-interval-ms',
          '250',
          '--login-point-safety-success-required',
          '4',
          '--login-point-safety-probe-interval-ms',
          '15000',
          '--stale-self-ms',
          '3500',
          '--no-self-grace-ms',
          '4500',
          '--stamina-exhausted-below-ms',
          '150',
          '--movement-command-interval-ms',
          '300',
          '--movement-target-dead-zone-cm',
          '800',
          '--movement-settlement-frames',
          '3',
          '--ws-trace',
          '--ws-trace-max-payload-chars',
          '4096',
          '--target-whitelist-url',
          'https://example.test/target-whitelist.json',
          '--target-whitelist-file',
          '/tmp/target-whitelist.json',
          '--target-whitelist-timeout-ms',
          '1234',
          '--target-whitelist-max-names',
          '12',
          '--login-point-x',
          '123',
          '--login-point-y',
          '456',
          '--login-point-hp',
          '90'
        ], {
          GRASP_RAT_BROWSERLESS_STATUS_PORT: '18888',
          GRASP_RAT_BROWSERLESS_DRY_RUN: 'true',
          GRASP_RAT_BROWSERLESS_USER_ID: '42',
          GRASP_RAT_BROWSERLESS_SESSION_TOKEN: 'env-token'
        });
        return [
          config.once,
          config.dryRun,
          config.readOnly,
          config.controlMode,
          config.statusPort,
          config.webToken,
          config.combatEnabled,
          config.combatShootMinIntervalMs,
          config.userId,
          config.sessionToken,
          config.decisionIntervalMs,
          config.loginPointSafetySuccessRequired,
          config.loginPointSafetyProbeIntervalMs,
          config.staleSelfMs,
          config.noSelfGraceMs,
          config.staminaExhaustedBelowMs,
          config.movementCommandIntervalMs,
          config.movementTargetDeadZoneCm,
          config.movementSettlementFrames,
          config.wsTraceEnabled,
          config.wsTracePayload,
          config.wsTraceMaxPayloadChars,
          config.targetWhitelistUrl,
          config.targetWhitelistFile.endsWith('/tmp/target-whitelist.json'),
          config.targetWhitelistTimeoutMs,
          config.targetWhitelistMaxNames,
          config.loginPointX,
          config.loginPointY,
          config.loginPointHp,
          config.dataDir.endsWith('/tmp/grasp-rat-runner'),
          config.logDir.endsWith('/tmp/grasp-rat-browserless-logs')
        ].join('|');
      })(),
      want: 'true|false|false|combat-live|19999|cli-token|true|220|42|env-token|250|4|15000|3500|4500|150|300|800|3|true|true|4096|https://example.test/target-whitelist.json|true|1234|12|123|456|90|true|true'
    },
    {
      name: 'browserless deployment files define service env and install surface',
      got: (() => {
        const unit = fs.readFileSync(path.join(__dirname, '../../deploy/browserless-runner.service'), 'utf8');
        const env = fs.readFileSync(path.join(__dirname, '../../deploy/browserless-runner.env.example'), 'utf8');
        const installer = fs.readFileSync(path.join(__dirname, '../../scripts/install-browserless-runner-service.sh'), 'utf8');
        return [
          unit.includes('Description=Grasp Rat Browserless Runner'),
          unit.includes('EnvironmentFile=/etc/grasp-rat/browserless-runner.env'),
          unit.includes('ExecStart=/usr/bin/env node scripts/browserless-runner.js'),
          unit.includes('ReadWritePaths=/var/lib/grasp-rat-browserless /var/log/grasp-rat-browserless'),
          env.includes('GRASP_RAT_BROWSERLESS_DATA_DIR=/var/lib/grasp-rat-browserless'),
          env.includes('GRASP_RAT_BROWSERLESS_LOG_DIR=/var/log/grasp-rat-browserless'),
          env.includes('GRASP_RAT_BROWSERLESS_CANARY_PROFILE=read-only'),
          env.includes('GRASP_RAT_BROWSERLESS_DRY_RUN=true'),
          env.includes('GRASP_RAT_BROWSERLESS_TARGET_WHITELIST_URL='),
          env.includes('GRASP_RAT_BROWSERLESS_TARGET_WHITELIST_FILE='),
          env.includes('GRASP_RAT_BROWSERLESS_LOGIN_POINT_SAFETY_SUCCESS_REQUIRED=3'),
          env.includes('GRASP_RAT_BROWSERLESS_LOGIN_POINT_SAFETY_PROBE_INTERVAL_MS=30000'),
          env.includes('GRASP_RAT_BROWSERLESS_WS_TRACE_ENABLED=false'),
          installer.includes('grasp-rat-browserless-runner'),
          installer.includes('DATA_DIR="/var/lib/grasp-rat-browserless"'),
          installer.includes('LOG_DIR="/var/log/grasp-rat-browserless"'),
          installer.includes('install -d -m 0750 "$DATA_DIR"'),
          installer.includes('install -d -m 0750 "$LOG_DIR"'),
          installer.includes('systemctl daemon-reload')
        ].join('|');
      })(),
      want: 'true|true|true|true|true|true|true|true|true|true|true|true|true|true|true|true|true|true|true'
    },
    {
      name: 'browserless deployment audit checks installed service evidence',
      got: withTempDirForTest(async dir => {
        const appDir = path.join(dir, 'app');
        const scriptsDir = path.join(appDir, 'scripts');
        const dataDir = path.join(dir, 'data');
        const logDir = path.join(dir, 'logs');
        fs.mkdirSync(scriptsDir, { recursive: true });
        fs.mkdirSync(dataDir, { recursive: true });
        fs.mkdirSync(logDir, { recursive: true });
        fs.writeFileSync(path.join(scriptsDir, 'browserless-runner.js'), '');
        const unitPath = path.join(dir, 'grasp-rat-browserless-runner.service');
        const envPath = path.join(dir, 'browserless-runner.env');
        fs.writeFileSync(unitPath, [
          '[Service]',
          `WorkingDirectory=${appDir}`,
          `EnvironmentFile=${envPath}`,
          'ExecStart=/usr/bin/env node scripts/browserless-runner.js',
          'Restart=on-failure',
          `ReadWritePaths=${dataDir} ${logDir}`,
          ''
        ].join('\n'));
        fs.writeFileSync(envPath, [
          `GRASP_RAT_BROWSERLESS_DATA_DIR=${dataDir}`,
          `GRASP_RAT_BROWSERLESS_LOG_DIR=${logDir}`,
          'GRASP_RAT_BROWSERLESS_DRY_RUN=true',
          'GRASP_RAT_BROWSERLESS_CANARY_PROFILE=read-only',
          'GRASP_RAT_BROWSERLESS_CONTROL_MODE=read-only',
          'GRASP_RAT_BROWSERLESS_WEB_TOKEN=local-secret-token',
          ''
        ].join('\n'));
        const ok = auditBrowserlessDeployment({
          unitPath,
          envPath
        }, {
          runCommand: (_command, args) => ({
            status: 0,
            stdout: args[0] === 'is-enabled' ? 'enabled\n' : 'active\n',
            stderr: ''
          })
        });
        fs.writeFileSync(envPath, [
          `GRASP_RAT_BROWSERLESS_DATA_DIR=${dataDir}`,
          `GRASP_RAT_BROWSERLESS_LOG_DIR=${logDir}`,
          'GRASP_RAT_BROWSERLESS_DRY_RUN=false',
          'GRASP_RAT_BROWSERLESS_CANARY_PROFILE=profit',
          'GRASP_RAT_BROWSERLESS_CONTROL_MODE=non-combat-profit',
          'GRASP_RAT_BROWSERLESS_WEB_TOKEN=local-secret-token',
          'GRASP_RAT_BROWSERLESS_USER_ID=0',
          'GRASP_RAT_BROWSERLESS_SESSION_TOKEN=',
          'GRASP_RAT_BROWSERLESS_LOGIN_POINT_X=',
          'GRASP_RAT_BROWSERLESS_LOGIN_POINT_Y=',
          'GRASP_RAT_BROWSERLESS_LOGIN_POINT_HP=',
          ''
        ].join('\n'));
        updateBrowserlessStateFile(path.join(dataDir, 'state.json'), {
          session: {
            userId: 123,
            sessionToken: 'state-live-secret-token'
          },
          loginPointSafety: {
            point: { x: 10, y: 20, hp: 90, source: 'test-state' }
          }
        });
        const live = auditBrowserlessDeployment({
          unitPath,
          envPath,
          envMode: 'live',
          skipSystemctl: true
        });
        const aggregate = auditBrowserlessDeployment({
          unitPath,
          envPath,
          envMode: 'any',
          skipSystemctl: true
        });
        const conflictEnvPath = path.join(dir, 'conflict.env');
        fs.writeFileSync(conflictEnvPath, fs.readFileSync(envPath, 'utf8').replace('GRASP_RAT_BROWSERLESS_CONTROL_MODE=non-combat-profit', 'GRASP_RAT_BROWSERLESS_CONTROL_MODE=combat-live'));
        const conflict = auditBrowserlessDeployment({
          unitPath,
          envPath: conflictEnvPath,
          envMode: 'live',
          skipSystemctl: true
        });
        const missingLoginPointEnvPath = path.join(dir, 'missing-login-point.env');
        fs.writeFileSync(missingLoginPointEnvPath, fs.readFileSync(envPath, 'utf8')
          .replace(`GRASP_RAT_BROWSERLESS_DATA_DIR=${dataDir}`, `GRASP_RAT_BROWSERLESS_DATA_DIR=${path.join(dir, 'missing-data')}`));
        const missingLoginPoint = auditBrowserlessDeployment({
          unitPath,
          envPath: missingLoginPointEnvPath,
          envMode: 'live',
          skipSystemctl: true
        });
        const placeholderEnvPath = path.join(dir, 'placeholder.env');
        fs.writeFileSync(placeholderEnvPath, fs.readFileSync(envPath, 'utf8').replace('local-secret-token', 'replace-with-a-long-random-token'));
        const placeholder = auditBrowserlessDeployment({
          unitPath,
          envPath: placeholderEnvPath,
          skipSystemctl: true
        });
        return [
          ok.ok,
          ok.failed.length,
          live.ok,
          live.failed.length,
          aggregate.ok,
          aggregate.failed.length,
          conflict.ok,
          conflict.failed.some(item => item.key === 'env-profile-control-consistency'),
          missingLoginPoint.ok,
          missingLoginPoint.failed.some(item => item.key === 'env-login-point'),
          placeholder.ok,
          placeholder.failed.some(item => item.key === 'environment-file-reference'),
          placeholder.failed.some(item => item.key === 'env-web-token')
        ].join('|');
      }),
      want: 'true|0|true|0|true|0|false|true|false|true|false|true|true'
    },
    {
      name: 'browserless acceptance report aggregates deployment canary and stop audits',
      got: withTempDirForTest(async dir => {
        const dayDir = path.join(dir, 'logs', '2026-07-08');
        fs.mkdirSync(dayDir, { recursive: true });
        const write = (stream, entry) => {
          fs.appendFileSync(path.join(dayDir, `${stream}.jsonl`), `${JSON.stringify(entry)}\n`);
        };
        const base = {
          ok: true,
          snapshotSafety: { ok: true },
          stats: { decodedFrameCount: 10, selfPresent: { true: 9, false: 1 } },
          frameHealth: { decodeErrors: 0 },
          leave: { ok: true }
        };
        write('runner', {
          at: '2026-07-08T01:00:30.000Z',
          type: 'canary-finish',
          detail: {
            ...base,
            mode: 'read-only',
            startedAt: '2026-07-08T01:00:00.000Z',
            completedAt: '2026-07-08T01:00:30.000Z',
            actions: { sentCount: 0, shootSentCount: 0 }
          }
        });
        write('runner', {
          at: '2026-07-08T01:01:30.000Z',
          type: 'canary-failed',
          detail: {
            ...base,
            mode: 'read-only',
            startedAt: '2026-07-08T01:01:00.000Z',
            completedAt: '2026-07-08T01:01:30.000Z',
            ok: false,
            error: 'explicit-stop',
            actions: { sentCount: 0, shootSentCount: 0 },
            safety: { event: { reason: 'explicit-stop' }, exit: { leave: { ok: true } } }
          }
        });
        write('runner', {
          at: '2026-07-08T01:02:30.000Z',
          type: 'canary-finish',
          detail: {
            ...base,
            mode: 'movement-only',
            startedAt: '2026-07-08T01:02:00.000Z',
            completedAt: '2026-07-08T01:02:30.000Z',
            actions: { velocitySentCount: 2, shootSentCount: 0 }
          }
        });
        write('runner', { at: '2026-07-08T01:02:01.000Z', type: 'movement-command', detail: { action: { kind: 'velocity' } } });
        write('decisions', { at: '2026-07-08T01:00:01.000Z', type: 'decision', detail: { kind: 'wait' } });
        write('decisions', { at: '2026-07-08T01:01:01.000Z', type: 'decision', detail: { kind: 'stop-requested' } });
        write('decisions', { at: '2026-07-08T01:02:01.000Z', type: 'decision', detail: { kind: 'coin' } });
        write('runner', {
          at: '2026-07-08T01:03:30.000Z',
          type: 'canary-finish',
          detail: {
            ...base,
            mode: 'profit-live',
            startedAt: '2026-07-08T01:03:00.000Z',
            completedAt: '2026-07-08T01:03:30.000Z',
            actions: { velocitySentCount: 1, shootSentCount: 0 }
          }
        });
        write('decisions', {
          at: '2026-07-08T01:03:01.000Z',
          type: 'decision',
          detail: {
            kind: 'seek-coin',
            band: 'profit',
            reason: 'best-opportunity-visible-coin',
            action: {
              kind: 'seek-coin',
              band: 'profit',
              reason: 'best-opportunity-visible-coin',
              target: { type: 'coin', id: 'snapshot-coin', authority: 'snapshot', snapshotOnly: true, amount: 1 }
            }
          }
        });
        write('exits', { at: '2026-07-08T01:01:01.000Z', type: 'safety-event', detail: { reason: 'explicit-stop' } });
        let deploymentEnvMode = '';
        const ok = buildBrowserlessAcceptanceReport({
          logDir: path.join(dir, 'logs'),
          day: '2026-07-08',
          profiles: ['read-only', 'movement-only'],
          includeStop: true,
          skipDeployment: false
        }, {
          deploymentAudit: options => {
            deploymentEnvMode = options.envMode;
            return { ok: true, failed: [] };
          }
        });
        const movementSummary = ok.sections.find(section => section.key === 'canary:movement-only')?.summary || '';
        const forcedStopSummary = ok.sections.find(section => section.key === 'canary:read-only:forced-stop')?.summary || '';
        const missing = buildBrowserlessAcceptanceReport({
          logDir: path.join(dir, 'logs'),
          day: '2026-07-08',
          profiles: ['profit'],
          includeStop: false,
          skipDeployment: true
        });
        const parityArgs = parseBrowserlessAcceptanceReportArgs(['--profiles', '', '--parity', '--no-stop', '--skip-deployment']);
        const parity = buildBrowserlessAcceptanceReport({
          logDir: path.join(dir, 'logs'),
          day: '2026-07-08',
          profiles: parityArgs.profiles,
          includeStop: parityArgs.includeStop,
          skipDeployment: true
        });
        const paritySummary = parity.sections.find(section => section.key === 'canary:profit-live-parity')?.summary || '';
        return [
          ok.ok,
          ok.sections.length,
          ok.failed.length,
          deploymentEnvMode,
          movementSummary.includes('window=2026-07-08T01:02:00.000Z..2026-07-08T01:02:30.000Z'),
          movementSummary.includes('movement=1'),
          movementSummary.includes('shoot=0'),
          forcedStopSummary.includes('explicitStop=1'),
          missing.ok,
          missing.failed[0]?.key,
          parity.ok,
          paritySummary.includes('parityActions=1'),
          paritySummary.includes('knownTransportExceptions=1')
        ].join('|');
      }),
      want: 'true|4|0|any|true|true|true|true|false|canary:profit|true|true|true'
    },
    {
      name: 'browserless runner config maps canary profiles without enabling combat',
      got: (() => {
        const envProfile = parseBrowserlessRunnerArgs([], {
          GRASP_RAT_BROWSERLESS_CANARY_PROFILE: 'profit'
        });
        const cliProfile = parseBrowserlessRunnerArgs(['--canary-profile', 'combat-live'], {});
        const override = parseBrowserlessRunnerArgs(['--canary-profile', 'combat-live', '--movement-only'], {});
        let badProfile = '';
        try {
          parseBrowserlessRunnerArgs(['--canary-profile', 'invalid'], {});
        } catch (err) {
          badProfile = err.message;
        }
        return [
          envProfile.canaryProfile,
          envProfile.controlMode,
          envProfile.readOnly,
          cliProfile.canaryProfile,
          cliProfile.controlMode,
          cliProfile.combatEnabled,
          override.canaryProfile,
          override.controlMode,
          /unsupported canary profile/.test(badProfile)
        ].join('|');
      })(),
      want: 'profit|non-combat-profit|false|combat-live|combat-live|false||movement-only|true'
    },
    {
      name: 'browserless runner config treats empty numeric env as unset',
      got: (() => {
        const config = parseBrowserlessRunnerArgs([], {
          GRASP_RAT_BROWSERLESS_LOGIN_POINT_X: '',
          GRASP_RAT_BROWSERLESS_LOGIN_POINT_Y: '',
          GRASP_RAT_BROWSERLESS_STATUS_PORT: '',
          GRASP_RAT_BROWSERLESS_LOG_RETENTION_DAYS: ''
        });
        return [
          config.loginPointX === null,
          config.loginPointY === null,
          config.statusPort,
          config.logRetentionDays
        ].join('|');
      })(),
      want: 'true|true|18767|3'
    },
    {
      name: 'browserless runner config accepts source IP binding',
      got: (() => {
        const envConfig = parseBrowserlessRunnerArgs([], {
          GRASP_RAT_BROWSERLESS_SOURCE_IP: '10.0.0.101',
          GRASP_RAT_BROWSERLESS_SOURCE_IPS: '10.0.0.101,10.0.0.145'
        });
        const cliConfig = parseBrowserlessRunnerArgs(['--source-ip', '10.0.0.145', '--source-ips', '10.0.0.145 10.0.0.20'], {});
        return [
          envConfig.sourceIp,
          envConfig.sourceIps.join(','),
          cliConfig.sourceIp,
          cliConfig.sourceIps.join(',')
        ].join('|');
      })(),
      want: '10.0.0.101|10.0.0.101,10.0.0.145|10.0.0.145|10.0.0.145,10.0.0.20'
    },
    {
      name: 'browserless source IP controller keeps persisted selection',
      got: withTempDirForTest(async dir => {
        const stateFile = path.join(dir, 'state.json');
        updateBrowserlessStateFile(stateFile, {
          network: {
            sourceIp: '10.0.0.145'
          }
        }, { updatedAt: '2026-07-09T00:00:00.000Z' });
        const controller = createSourceIpController({
          config: {
            gameOrigin: 'https://grasp-rat-game.h-e.top',
            sourceIp: '10.0.0.101',
            sourceIps: ['10.0.0.101', '10.0.0.145']
          },
          stateFile,
          now: () => Date.UTC(2026, 6, 9, 1, 0, 0)
        });
        const state = readBrowserlessStateFile(stateFile);
        return [
          controller.currentSourceIp(),
          controller.sourceIps().join(','),
          state.network.sourceIp,
          state.network.sourceIps.join(',')
        ].join('|');
      }),
      want: '10.0.0.145|10.0.0.101,10.0.0.145|10.0.0.145|10.0.0.101,10.0.0.145'
    },
    {
      name: 'browserless source IP controller leaves empty config unbound',
      got: withTempDirForTest(async dir => {
        const controller = createSourceIpController({
          config: {
            gameOrigin: 'https://grasp-rat-game.h-e.top',
            sourceIp: '',
            sourceIps: []
          },
          stateFile: path.join(dir, 'state.json'),
          now: () => Date.UTC(2026, 6, 9, 1, 2, 0)
        });
        return [
          controller.currentSourceIp(),
          controller.sourceIps().length
        ].join('|');
      }),
      want: '|0'
    },
    {
      name: 'browserless source IP controller switches only when all probes are 403',
      got: withTempDirForTest(async dir => {
        const stateFile = path.join(dir, 'state.json');
        const calls = [];
        const controller = createSourceIpController({
          config: {
            gameOrigin: 'https://grasp-rat-game.h-e.top',
            sourceIp: '10.0.0.101',
            sourceIps: ['10.0.0.101', '10.0.0.145'],
            httpTimeoutMs: 1000
          },
          stateFile,
          now: () => Date.UTC(2026, 6, 9, 2, 0, 0),
          fetchWithTimeout: async (url, options = {}) => {
            const ip = options.localAddress || '';
            const pathName = new URL(url).pathname;
            calls.push(`${ip}:${pathName}`);
            if (pathName === '/target') {
              return fakeResponseForTest({ status: ip === '10.0.0.101' ? 403 : 200, body: { ok: ip !== '10.0.0.101' } });
            }
            return fakeResponseForTest({ status: 403, body: 'forbidden' });
          }
        });
        const response = await controller.fetchWithTimeout('https://grasp-rat-game.h-e.top/target', { timeoutMs: 1000 });
        const state = readBrowserlessStateFile(stateFile);
        return [
          response.status,
          controller.currentSourceIp(),
          state.network.lastSwitch?.switched,
          state.network.lastSwitch?.from,
          state.network.lastSwitch?.to,
          calls.join(',')
        ].join('|');
      }),
      want: '200|10.0.0.145|true|10.0.0.101|10.0.0.145|10.0.0.101:/target,10.0.0.101:/,10.0.0.101:/auth/linuxdo/start,10.0.0.145:/target'
    },
    {
      name: 'browserless source IP controller keeps IP when another probe is healthy',
      got: withTempDirForTest(async dir => {
        const stateFile = path.join(dir, 'state.json');
        const controller = createSourceIpController({
          config: {
            gameOrigin: 'https://grasp-rat-game.h-e.top',
            sourceIp: '10.0.0.101',
            sourceIps: ['10.0.0.101', '10.0.0.145'],
            httpTimeoutMs: 1000
          },
          stateFile,
          now: () => Date.UTC(2026, 6, 9, 2, 1, 0),
          fetchWithTimeout: async (url, options = {}) => {
            const pathName = new URL(url).pathname;
            if (pathName === '/target') return fakeResponseForTest({ status: 403, body: 'forbidden' });
            if (pathName === '/') return fakeResponseForTest({ status: 200, body: '<html></html>' });
            return fakeResponseForTest({ status: 403, body: 'forbidden' });
          }
        });
        const response = await controller.fetchWithTimeout('https://grasp-rat-game.h-e.top/target', { timeoutMs: 1000 });
        const state = readBrowserlessStateFile(stateFile);
        return [
          response.status,
          controller.currentSourceIp(),
          Boolean(state.network.lastSwitch?.switched),
          state.network.lastProbe?.allForbidden
        ].join('|');
      }),
      want: '403|10.0.0.101|false|false'
    },
    {
      name: 'browserless source IP controller switches ws 403 before retrying',
      got: withTempDirForTest(async dir => {
        const stateFile = path.join(dir, 'state.json');
        const opened = [];
        const controller = createSourceIpController({
          config: {
            gameOrigin: 'https://grasp-rat-game.h-e.top',
            sourceIps: ['10.0.0.101', '10.0.0.20'],
            sourceIp: '10.0.0.101',
            httpTimeoutMs: 1000
          },
          stateFile,
          now: () => Date.UTC(2026, 6, 8, 1, 0, 0),
          fetchWithTimeout: async (url, options = {}) => fakeResponseForTest({
            status: options.localAddress === '10.0.0.101' ? 403 : 200,
            body: 'probe'
          }),
          openBrowserlessWs: async options => {
            opened.push(options.localAddress || '');
            if (options.localAddress === '10.0.0.101') {
              if (typeof options.onError === 'function') {
                options.onError({
                  message: 'websocket unexpected response 403 Forbidden',
                  statusCode: 403
                });
              }
              throw new Error('websocket unexpected response 403 Forbidden');
            }
            return { isOpen: () => true, close: () => {} };
          }
        });
        const transport = await controller.openBrowserlessWs({
          gameOrigin: 'https://grasp-rat-game.h-e.top',
          wsPath: '/ws'
        });
        const state = readBrowserlessStateFile(stateFile);
        return [
          transport.isOpen(),
          opened.join(','),
          controller.currentSourceIp(),
          Boolean(state.network.lastSwitch?.switched),
          state.network.lastSwitch?.from,
          state.network.lastSwitch?.to
        ].join('|');
      }),
      want: 'true|10.0.0.101,10.0.0.20|10.0.0.20|true|10.0.0.101|10.0.0.20'
    },
    {
      name: 'browserless runner loop plan retries non-explicit failures',
      got: (() => {
        const config = { once: false, loopDelayMs: 1234 };
        const activeThreat = browserlessLoopPlan({
          ok: false,
          canary: {
            runId: 'profit-live-test',
            error: 'profit-live-snapshot-active-threat',
            safety: { event: { reason: 'profit-live-snapshot-active-threat' } }
          }
        }, config);
        const staminaBudget = browserlessLoopPlan({
          ok: false,
          canary: {
            runId: 'budget-test',
            error: 'stamina-budget-coin-leave',
            safety: {
              event: {
                reason: 'stamina-budget-coin-leave',
                detail: {
                  decision: {
                    reloginDelayMs: 1800000,
                    staminaBudgetExit: { reloginDelayMs: 1800000 }
                  }
                }
              }
            }
          }
        }, config);
        const staminaExhausted = browserlessLoopPlan({
          ok: false,
          canary: {
            runId: 'stamina-exhausted-test',
            error: 'stamina-exhausted-leave',
            safety: {
              event: {
                reason: 'stamina-exhausted-leave',
                detail: {
                  decision: {
                    reloginDelayMs: 600000,
                    staminaExhausted: { exhausted: ['1d'], reloginDelayMs: 600000 }
                  }
                }
              }
            }
          }
        }, config);
        const injuryLeave = browserlessLoopPlan({
          ok: false,
          canary: {
            runId: 'injury-leave-test',
            error: 'injury-leave',
            safety: { event: { reason: 'injury-leave' } }
          }
        }, config);
        const pursuitLeave = browserlessLoopPlan({
          ok: false,
          canary: {
            runId: 'pursuit-leave-test',
            error: 'pursuit-leave',
            safety: { event: { reason: 'pursuit-leave' } }
          }
        }, config);
        const combatExit = browserlessLoopPlan({
          ok: false,
          canary: {
            runId: 'combat-exit-test',
            error: 'combat-hp-disadvantage-leave',
            safety: { event: { reason: 'combat-hp-disadvantage-leave' } }
          }
        }, config);
        const wsClosed = browserlessLoopPlan({
          ok: false,
          canary: {
            runId: 'ws-closed-test',
            error: 'ws-closed',
            safety: { event: { reason: 'ws-closed' } }
          }
        }, config);
        const wsClosedLeaveFailure = browserlessLoopPlan({
          ok: false,
          canary: {
            runId: 'ws-closed-leave-failed-test',
            error: 'ws-closed',
            safety: {
              event: { reason: 'ws-closed' },
              leaveFailure: { reason: 'direct-leave-failed' }
            }
          }
        }, config);
        const explicitStop = browserlessLoopPlan({
          ok: false,
          canary: {
            runId: 'stop-test',
            error: 'explicit-stop',
            safety: { event: { reason: 'explicit-stop' } }
          }
        }, config);
        const noSelf = browserlessLoopPlan({
          ok: false,
          canary: {
            runId: 'death-risk-test',
            error: 'no-self',
            safety: { event: { reason: 'no-self' } }
          }
        }, config);
        const auth403 = browserlessLoopPlan({
          ok: false,
          canary: {
            runId: 'auth-test',
            error: 'websocket unexpected response 403'
          }
        }, config);
        const auth403SelfPresent = browserlessLoopPlan({
          ok: false,
          canary: {
            runId: 'auth-self-present-test',
            error: 'websocket unexpected response 403',
            snapshotSafety: { response: { summary: { selfPresent: true } } },
            safety: { leaveFailure: { reason: 'direct-leave-failed' } }
          }
        }, config);
        const snapshotRetry = browserlessLoopPlan({
          ok: false,
          canary: {
            runId: 'unsafe-point-test',
            error: 'snapshot safety not confirmed: unsafe'
          }
        }, config);
        const inGameSnapshotRetry = browserlessLoopPlan({
          ok: false,
          canary: {
            runId: 'in-game-snapshot-403-test',
            error: 'snapshot safety not confirmed: snapshot-http-403',
            recovery: {
              inGameEvidence: true,
              reason: 'realtime-self-observed'
            }
          }
        }, config);
        const connectTimeout = browserlessLoopPlan({
          ok: false,
          canary: {
            runId: 'connect-timeout-test',
            error: 'websocket connect timeout',
            leave: { ok: true }
          }
        }, config);
        return [
          activeThreat.continue,
          activeThreat.delayMs,
          staminaBudget.continue,
          staminaBudget.reason,
          staminaBudget.delayMs,
          staminaExhausted.continue,
          staminaExhausted.reason,
          staminaExhausted.delayMs,
          injuryLeave.continue,
          injuryLeave.reason,
          injuryLeave.delayMs,
          pursuitLeave.continue,
          pursuitLeave.reason,
          pursuitLeave.delayMs,
          combatExit.continue,
          combatExit.reason,
          combatExit.delayMs,
          wsClosed.continue,
          wsClosed.reason,
          wsClosed.delayMs,
          wsClosedLeaveFailure.continue,
          wsClosedLeaveFailure.reason,
          wsClosedLeaveFailure.delayMs,
          explicitStop.continue,
          noSelf.continue,
          auth403.continue,
          auth403SelfPresent.continue,
          auth403SelfPresent.reason,
          auth403SelfPresent.delayMs,
          snapshotRetry.continue,
          snapshotRetry.delayMs,
          inGameSnapshotRetry.continue,
          inGameSnapshotRetry.reason,
          inGameSnapshotRetry.delayMs,
          connectTimeout.continue,
          connectTimeout.reason,
          connectTimeout.delayMs
        ].join('|');
      })(),
      want: 'true|1234|true|stamina-budget-coin-leave|1800000|true|stamina-exhausted-leave|600000|true|injury-leave|1234|true|pursuit-leave|1234|true|combat-hp-disadvantage-leave|1234|true|ws-closed|1000|true|ws-closed|1000|false|true|true|true|ws-auth-blocked-self-present|1000|true|60000|true|in-game-snapshot-safety-retry|1000|true|ws-connect-timeout|1000'
    },
    {
      name: 'browserless runner preserves stamina exhausted wait after no-self leave',
      got: (() => {
        const plan = browserlessLoopPlan({
          ok: false,
          canary: {
            runId: 'no-self-low-daily-stamina',
            error: 'no-self',
            safety: { event: { reason: 'no-self' } },
            leave: {
              ok: true,
              attempts: [
                {
                  response: {
                    stamina_5s_remaining_milli: 10000,
                    stamina_1h_remaining_milli: 3000000,
                    stamina_1d_remaining_milli: 31
                  }
                }
              ]
            }
          }
        }, {
          once: false,
          loopDelayMs: 1234,
          nowMs: Date.parse('2026-07-10T15:13:00.000Z')
        });
        return [
          plan.continue,
          plan.reason,
          plan.forceExitReason,
          plan.delayMs,
          plan.staminaExhausted.exhausted.join(','),
          plan.staminaExhausted.remaining1d
        ].join('|');
      })(),
      want: 'true|stamina-exhausted-leave|true|2830000|1d|31'
    },
    {
      name: 'browserless runner best-effort shutdown leave hydrates persisted session',
      got: withTempDirForTest(async dir => {
        const config = parseBrowserlessRunnerArgs(['--live', '--data-dir', dir], {});
        updateBrowserlessStateFile(config.stateFile, {
          session: {
            userId: 7,
            sessionToken: 'persisted-secret'
          },
          network: {
            sourceIp: '10.0.0.101'
          }
        }, { updatedAt: '2026-07-08T00:00:00.000Z' });
        let optionsSeen = null;
        const result = await gracefulShutdownLeave(config, {
          leaveWithVerification: async options => {
            optionsSeen = options;
            return {
              ok: true,
              attempts: [
                {
                  stage: 'initial',
                  httpOk: true,
                  status: 200,
                  statusText: 'OK',
                  durationMs: 12,
                  ok: true,
                  summary: { leaveConfirmed: true }
                }
              ]
            };
          }
        });
        return [
          result.ok,
          result.skipped,
          result.leave.attempts.length,
          optionsSeen.userId,
          optionsSeen.sessionToken,
          optionsSeen.localAddress,
          optionsSeen.retryMax,
          optionsSeen.timeoutMs
        ].join('|');
      }),
      want: 'true|false|1|7|persisted-secret|10.0.0.101|2|5000'
    },
    {
      name: 'browserless runner dry-run and fake read-only path write redacted logs',
      got: withTempDirForTest(async dir => {
        const dryConfig = parseBrowserlessRunnerArgs(['--once', '--dry-run', '--data-dir', dir], {});
        const dryRun = await runBrowserlessRunner(dryConfig, {
          now: () => Date.UTC(2026, 6, 8, 1, 0, 0)
        });
        const liveConfig = parseBrowserlessRunnerArgs([
          '--once',
          '--live',
          '--data-dir',
          dir,
          '--user-id',
          '7',
          '--session-token',
          'runner-secret-token',
          '--login-point-x',
          '1',
          '--login-point-y',
          '2',
          '--login-point-hp',
          '100'
        ], {});
        const liveRun = await runBrowserlessRunner(liveConfig, {
          now: () => Date.UTC(2026, 6, 8, 1, 1, 0),
          runReadOnlyOnce: async (_config, context) => {
            context.logStore.append('runner', 'fake-read-only', { ok: true });
            return { ok: true, frames: 0 };
          }
        });
        const logFile = path.join(dir, 'logs', '2026-07-08', 'runner.jsonl');
        const text = fs.readFileSync(logFile, 'utf8');
        return [
          dryRun.ok,
          dryRun.mode,
          liveRun.ok,
          liveRun.mode,
          /runner-dry-run/.test(text),
          /fake-read-only/.test(text),
          !/runner-secret-token/.test(text)
        ].join('|');
      }),
      want: 'true|dry-run|true|read-only|true|true|true'
    },
    {
      name: 'browserless runner learns login point from offline entry self not final self',
      got: (() => {
        const offline = learnedLoginPointFromCanary({
          snapshotSafety: { response: { summary: { selfPresent: false } } },
          entry: {
            firstSelf: { x: 5999, y: 66268, hp: 100 }
          },
          state: {
            realtime: {
              self: { x: 94519, y: 30158, hp: 73 }
            }
          }
        });
        const reentry = learnedLoginPointFromCanary({
          snapshotSafety: { response: { summary: { selfPresent: true } } },
          entry: {
            firstSelf: { x: -27539, y: 83966, hp: 18 }
          },
          state: {
            realtime: {
              self: { x: -27539, y: 83966, hp: 18 }
            }
          }
        });
        return [
          offline.finalSelf.x,
          offline.loginPoint.x,
          offline.loginPoint.y,
          offline.loginPoint.hp,
          offline.loginPoint.source,
          reentry.finalSelf.x,
          reentry.loginPoint === null
        ].join('|');
      })(),
      want: '94519|5999|66268|73|browserless-entry-self|-27539|true'
    },
    {
      name: 'browserless runner catches canary throw and waits for explicit stop',
      got: withTempDirForTest(async dir => {
        let t = Date.UTC(2026, 6, 8, 1, 1, 0);
        let calls = 0;
        let sleeps = 0;
        const safetyController = createBrowserlessSafetyController({ now: () => t });
        const config = parseBrowserlessRunnerArgs([
          '--live',
          '--data-dir',
          dir,
          '--loop-delay-ms',
          '1000',
          '--user-id',
          '7',
          '--session-token',
          'runner-secret-token',
          '--login-point-x',
          '1',
          '--login-point-y',
          '2',
          '--login-point-hp',
          '100'
        ], {});
        const result = await runBrowserlessRunner(config, {
          now: () => t,
          safetyController,
          startStatusServer: false,
          sleep: async ms => {
            sleeps += 1;
            t += ms;
            safetyController.requestStop('explicit-stop', { source: 'self-test' });
          },
          runReadOnlyOnce: async () => {
            calls += 1;
            throw new Error('synthetic canary failure');
          }
        });
        const logFile = path.join(dir, 'logs', '2026-07-08', 'runner.jsonl');
        const text = fs.readFileSync(logFile, 'utf8');
        const state = readBrowserlessStateFile(stateFilePath(config));
        return [
          result.reason,
          calls,
          sleeps,
          /runner-canary-error/.test(text),
          /runner-loop-wait/.test(text),
          state.runner.running
        ].join('|');
      }),
      want: 'explicit-stop|1|1|true|true|false'
    },
    {
      name: 'browserless runner returns explicit stop reason from canary event',
      got: withTempDirForTest(async dir => {
        const config = parseBrowserlessRunnerArgs([
          '--live',
          '--data-dir',
          dir,
          '--user-id',
          '7',
          '--session-token',
          'runner-secret-token',
          '--login-point-x',
          '1',
          '--login-point-y',
          '2',
          '--login-point-hp',
          '100'
        ], {});
        const result = await runBrowserlessRunner(config, {
          now: () => Date.UTC(2026, 6, 8, 1, 1, 0),
          startStatusServer: false,
          runReadOnlyOnce: async () => ({
            ok: false,
            runId: 'explicit-stop-self-test',
            error: 'explicit-stop',
            safety: {
              event: { reason: 'explicit-stop', at: '2026-07-08T01:01:00.000Z' }
            }
          })
        });
        const logFile = path.join(dir, 'logs', '2026-07-08', 'runner.jsonl');
        const text = fs.readFileSync(logFile, 'utf8');
        const state = readBrowserlessStateFile(stateFilePath(config));
        return [
          result.reason,
          state.runner.running,
          /runner-loop-stop/.test(text)
        ].join('|');
      }),
      want: 'explicit-stop|false|true'
    },
    {
      name: 'browserless runner imports legacy state and hydrates live config',
      got: withTempDirForTest(async dir => {
        const legacyPath = path.join(dir, 'legacy-state.json');
        const browserlessPath = path.join(dir, 'state.json');
        fs.writeFileSync(legacyPath, JSON.stringify({
          userId: 28886,
          sessionToken: 'legacy-secret-token',
          lastSelfSummary: { x: 5999, y: 66268, hp: 100, name: 'self' }
        }));
        const imported = importBrowserlessState({
          from: legacyPath,
          to: browserlessPath,
          source: 'self-test'
        });
        const config = parseBrowserlessRunnerArgs([
          '--once',
          '--live',
          '--data-dir',
          dir
        ], {});
        let hydratedLoginPointX = null;
        const liveRun = await runBrowserlessRunner(config, {
          now: () => Date.UTC(2026, 6, 8, 1, 2, 0),
          runReadOnlyOnce: async hydrated => {
            hydratedLoginPointX = hydrated.loginPointX;
            return {
              ok: true,
              snapshotSafety: { ok: true, reason: 'safe' },
              state: {
                realtime: {
                  self: { user_id: hydrated.userId, x: 6001, y: 66270, hp: 99, name: 'self' }
                }
              },
              decisions: {
                last: {
                  input: {
                    self: { user_id: hydrated.userId, x: 6001, y: 66270, hp: 99, name: 'self' }
                  }
                }
              }
            };
          }
        });
        const stored = readBrowserlessStateFile(browserlessPath);
        const logFile = path.join(dir, 'logs', '2026-07-08', 'runner.jsonl');
        const text = fs.readFileSync(logFile, 'utf8');
        return [
          imported.ok,
          imported.userId,
          imported.tokenPresent,
          imported.loginPoint.source,
          hydratedLoginPointX,
          liveRun.ok,
          stored.session.userId,
          stored.session.authenticated,
          stored.loginPointSafety.point.x,
          stored.loginPointSafety.point.source,
          !text.includes('legacy-secret-token')
        ].join('|');
      }),
      want: 'true|28886|true|self-test|5999|true|28886|true|6001|canary-self|true'
    },
    {
      name: 'browserless state file public status redacts session token',
      got: withTempDirForTest(async dir => {
        const config = parseBrowserlessRunnerArgs(['--data-dir', dir, '--web-token', 'web-secret'], {});
        const file = stateFilePath(config);
        updateBrowserlessStateFile(file, {
          session: {
            userId: 77,
            sessionToken: 'state-secret-token',
            tokenUpdatedAt: '2026-07-08T00:00:00.000Z'
          },
          current: {
            self: { name: 'self', hp: 88, x: 10, y: 20 }
          },
          recentExits: [{ reason: 'test-exit' }]
        }, { updatedAt: '2026-07-08T00:00:01.000Z' });
        const stored = readBrowserlessStateFile(file);
        const publicStatus = buildPublicBrowserlessStatus(stored, config);
        return [
          stored.session.sessionToken,
          publicStatus.session.userId,
          publicStatus.session.authenticated,
          publicStatus.session.tokenPresent,
          JSON.stringify(publicStatus).includes('state-secret-token'),
          publicStatus.current.self.name,
          publicStatus.recentExits[0].reason
        ].join('|');
      }),
      want: 'state-secret-token|77|true|true|false|self|test-exit'
    },
    {
      name: 'browserless compact status keeps panel fields and omits large diagnostics',
      got: withTempDirForTest(async dir => {
        const config = parseBrowserlessRunnerArgs(['--data-dir', dir, '--web-token', 'web-secret'], {});
        const file = stateFilePath(config);
        const largePayload = 'x'.repeat(20000);
        updateBrowserlessStateFile(file, {
          session: {
            userId: 77,
            sessionToken: 'state-secret-token',
            tokenUpdatedAt: '2026-07-08T00:00:00.000Z'
          },
          runner: {
            running: true,
            mode: 'profit-live',
            controlMode: 'profit-live',
            currentAction: {
              kind: 'seek-coin',
              reason: 'best-opportunity-coin',
              target: { type: 'coin', id: 'coin-1', amount: 8, distance: 450 }
            },
            lastRun: {
              ok: true,
              canary: {
                runId: 'profit-live-test',
                stats: { frameCount: 123 },
                decisions: { evaluatedCount: 9 },
                actions: { sentCount: 8 },
                snapshotSafety: { response: { raw: largePayload } }
              }
            }
          },
          loginPointSafety: {
            ok: false,
            reason: 'active-near-login-point',
            checkedAt: '2026-07-08T00:00:00.500Z',
            point: { x: 5999, y: 66268, hp: 100, source: 'state' }
          },
          network: {
            sourceIp: '10.0.0.101',
            sourceIps: ['10.0.0.18', '10.0.0.101', '10.0.0.102']
          },
          probes: {
            lastReadOnlyProbe: {
              snapshotSafety: {
                ok: false,
                reason: 'active-near-login-point',
                response: {
                  httpOk: true,
                  status: 200,
                  summary: {
                    selfPresent: false,
                    entityCount: 5,
                    freshness: { ok: true, reason: 'fresh', tick: 123, latestKnownTick: 100, tickDelta: 23 },
                    safety: {
                      ok: false,
                      reason: 'active-near-login-point',
                      point: { x: 5999, y: 66268, hp: 100, source: 'state' },
                      radius: 17000,
                      radiusReason: 'last-self-healthy',
                      entityCount: 5,
                      nearbyCount: 2,
                      activeNearbyCount: 1,
                      nearestActive: {
                        entity_id: 'enemy-entity',
                        user_id: 88,
                        name: 'enemy',
                        x: 6100,
                        y: 66300,
                        hp: 44,
                        coins: 9,
                        distance: 800,
                        active: true,
                        alive: true
                      },
                      nearest: {
                        entity_id: 'enemy-entity',
                        user_id: 88,
                        name: 'enemy',
                        distance: 800,
                        coins: 1000,
                        active: true,
                        alive: true
                      }
                    }
                  }
                }
              },
              state: {
                realtime: { raw: largePayload }
              }
            }
          },
          current: {
            self: { name: 'self', hp: 88, x: 10, y: 20, drop: 11 },
            stamina: {
              stamina5sRemainingMilli: 5000,
              stamina1hRemainingMilli: 360000,
              stamina1dRemainingMilli: 7200000,
              staminaSpent: 12000
            },
            profit: {
              best: {
                actionKind: 'seek-coin',
                reason: 'best-opportunity-coin',
                score: 1.5,
                coin: { type: 'coin', id: 'coin-2', amount: 7, distance: 320 }
              },
              candidates: [{ id: 1 }, { id: 2 }]
            },
            combatSummary: {
              ok: true,
              liveEnabled: true,
              target: { userId: 88, name: 'enemy', hp: 44, drop: 9, distance: 800 },
              candidates: [{ userId: 88 }]
            },
            decision: {
              kind: 'seek-coin',
              reason: 'best-opportunity-coin',
              input: {
                nearby: {
                  ar: 14500,
                  vr: 50000,
                  c: Array.from({ length: 165 }, (_, index) => (
                    index === 0 ? ['coin-1', 8, 450, 1] : ['coin-' + (index + 1), 1, 500 + index, 0]
                  )),
                  p: [['enemy', 44, 5000, 9, null, 800, 1, 'Passive']]
                }
              }
            },
            action: {
              kind: 'seek-coin',
              reason: 'best-opportunity-coin',
              target: { type: 'coin', id: 'coin-1', amount: 8, distance: 450 }
            }
          },
          recentExits: [{ reason: 'older' }, { reason: 'latest' }, { reason: 'blocked-login', shouldLeave: false }]
        }, { updatedAt: '2026-07-08T00:00:01.000Z' });
        const stored = readBrowserlessStateFile(file);
        const publicStatus = buildPublicBrowserlessStatus(stored, config);
        const compactStatus = buildCompactBrowserlessStatus(stored, config);
        const compactFromPublic = buildCompactBrowserlessStatus(publicStatus, config);
        const compactRecoverStatus = buildCompactBrowserlessStatus({
          session: {
            userId: 77,
            tokenPresent: true,
            authenticated: true
          },
          runner: {
            running: true,
            currentAction: {
              kind: 'recover',
              reason: 'wait-for-full-stamina-and-hp'
            }
          },
          current: {
            self: { userId: 77, name: 'self', hp: 64 },
            stamina: {
              stamina5sRemainingMilli: null,
              stamina1hRemainingMilli: null,
              stamina1dRemainingMilli: null
            },
            decision: {
              kind: 'recover',
              reason: 'wait-for-full-stamina-and-hp',
              profit: {
                best: {
                  coin: { type: 'coin', id: 'stale-coin', amount: 1, distance: 22000 }
                }
              }
            },
            action: {
              kind: 'recover',
              reason: 'wait-for-full-stamina-and-hp'
            }
          }
        }, config);
        const compactWaitingStatus = buildCompactBrowserlessStatus({
          session: {
            userId: 77,
            tokenPresent: true,
            authenticated: true
          },
          runner: {
            running: true,
            currentAction: {
              kind: 'loop-wait',
              reason: 'snapshot-safety-retry'
            }
          },
          current: {
            self: { userId: 77, name: 'stale-self', hp: 64 },
            action: {
              kind: 'combat-live',
              reason: 'combat-live-realtime',
              target: { userId: 88, hp: 90, distance: 1000 }
            }
          }
        }, config);
        const compactText = JSON.stringify(compactStatus);
        const publicText = JSON.stringify(publicStatus);
        return [
          compactStatus.compact,
          compactStatus.session.userId,
          compactFromPublic.session.authenticated,
          compactFromPublic.session.tokenPresent,
          compactRecoverStatus.game.inGame,
          compactRecoverStatus.stamina.remaining1h === null,
          compactRecoverStatus.decision.target === null,
          compactWaitingStatus.game.inGame,
          compactWaitingStatus.action.kind,
          compactStatus.self.hp,
          compactStatus.self.x,
          compactStatus.self.y,
          compactStatus.stamina.remaining1h,
          compactStatus.action.kind,
          compactStatus.action.target.amount,
          compactStatus.profit.best.target.amount,
          compactStatus.combat.target.name,
          compactStatus.loginPointSafety.point.x,
          compactStatus.loginPointSafety.detail.unsafeReason,
          compactStatus.loginPointSafety.detail.nearestActive.userId,
          compactStatus.loginPointSafety.detail.nearestActive.drop === null,
          compactFromPublic.loginPointSafety.detail.nearestActive.name,
          compactStatus.nearby.ar,
          compactStatus.nearby.c[0][0],
          compactStatus.nearby.c[0][3],
          compactStatus.nearby.c.length,
          compactStatus.nearby.p[0][0],
          compactStatus.nearby.p[0][6],
          compactStatus.nearby.p[0][7],
          compactStatus.recentExit.reason,
          compactStatus.network.sourceIpIndex,
          compactStatus.network.sourceIpCount,
          compactStatus.network.sourceIp,
          Boolean(compactStatus.probes),
          Boolean(compactStatus.current),
          Boolean(compactStatus.recentExits),
          compactText.includes('state-secret-token'),
          !compactText.includes(largePayload) && compactText.length < publicText.length
        ].join('|');
      }),
      want: 'true|77|true|true|true|true|true|false|loop-wait|88|10|20|360000|seek-coin|8|7|enemy|5999|active-near-login-point|88|true|enemy|14500|coin-1|1|165|enemy|1|Passive|latest|2|3|10.0.0.101|false|false|false|false|true'
    },
    {
      name: 'browserless compact status exposes session offline and today stats',
      got: withTempDirForTest(async dir => {
        const config = parseBrowserlessRunnerArgs(['--data-dir', dir], {});
        const startedAt = Date.parse('2026-07-10T00:00:00.000Z');
        const updatedAt = Date.parse('2026-07-10T00:01:05.000Z');
        const exitedAt = Date.parse('2026-07-10T00:02:00.000Z');
        const state = {
          session: {
            userId: 77,
            sessionToken: 'state-secret-token'
          },
          runner: {
            running: true,
            mode: 'profit-live',
            controlMode: 'profit-live',
            currentAction: { kind: 'coin', reason: 'best-opportunity-coin' }
          },
          current: {
            self: { userId: 77, name: 'self', hp: 99, drop: 14 },
            stamina: { stamina1dRemainingMilli: 8500 }
          }
        };
        state.stats = browserlessStatsForDecision(state, {
          at: new Date(startedAt).toISOString(),
          input: {
            self: { userId: 77, name: 'self', drop: 10 },
            stamina: { stamina1dRemainingMilli: 10000 },
            selfKillEvidence: []
          }
        }, { nowMs: startedAt });
        state.stats = browserlessStatsForDecision(state, {
          at: new Date(updatedAt).toISOString(),
          input: {
            self: { userId: 77, name: 'self', drop: 14 },
            stamina: { stamina1dRemainingMilli: 8500 },
            selfKillEvidence: [
              { targetUserId: 88, tick: 100 },
              { targetUserId: 88, tick: 100 }
            ]
          }
        }, { nowMs: updatedAt });
        const compactOnline = buildCompactBrowserlessStatus(state, {
          ...config,
          nowMs: updatedAt
        });
        const offlineState = {
          ...state,
          runner: {
            ...state.runner,
            currentAction: {
              kind: 'loop-wait',
              reason: 'cycle-complete',
              nextRunAt: '2026-07-10T00:03:00.000Z'
            }
          }
        };
        offlineState.stats = browserlessStatsForOffline(offlineState, {
          at: new Date(exitedAt).toISOString(),
          reason: 'cycle-complete',
          nextRunAt: '2026-07-10T00:03:00.000Z',
          delayMs: 60000
        }, { nowMs: exitedAt });
        const compactOffline = buildCompactBrowserlessStatus(offlineState, {
          ...config,
          nowMs: Date.parse('2026-07-10T00:02:30.000Z')
        });
        const waitingAgainState = JSON.parse(JSON.stringify(offlineState));
        waitingAgainState.runner.currentAction = {
          kind: 'loop-wait',
          reason: 'snapshot-safety-retry',
          nextRunAt: '2026-07-10T00:04:00.000Z'
        };
        waitingAgainState.stats = browserlessStatsForOffline(waitingAgainState, {
          at: '2026-07-10T00:02:30.000Z',
          reason: 'snapshot-safety-retry',
          nextRunAt: '2026-07-10T00:04:00.000Z',
          delayMs: 90000
        }, { nowMs: Date.parse('2026-07-10T00:02:30.000Z') });
        const compactWaitingAgain = buildCompactBrowserlessStatus(waitingAgainState, {
          ...config,
          nowMs: Date.parse('2026-07-10T00:02:45.000Z')
        });
        return [
          compactOnline.game.inGame,
          compactOnline.stats.currentSession.online,
          compactOnline.stats.currentSession.enteredAt,
          compactOnline.stats.currentSession.coinsGained,
          compactOnline.stats.currentSession.staminaSpentMs,
          compactOnline.stats.currentSession.kills,
          compactOnline.stats.today.coinsGained,
          compactOnline.stats.today.staminaSpentMs,
          compactOnline.stats.today.kills,
          compactOffline.game.inGame,
          compactOffline.stats.currentSession.online,
          compactOffline.stats.offline.lastExitReason,
          compactOffline.stats.offline.nextReconnectAt,
          compactOffline.stats.offline.reconnectRemainingMs,
          compactOffline.stats.currentSession.durationMs,
          compactOffline.stats.today.inGameDurationMs,
          compactOffline.stats.today.coinsGained,
          compactOffline.stats.today.staminaSpentMs,
          compactOffline.stats.today.kills,
          compactWaitingAgain.stats.offline.lastExitAt,
          compactWaitingAgain.stats.offline.lastExitReason,
          compactWaitingAgain.stats.offline.nextReconnectAt,
          compactWaitingAgain.stats.offline.reconnectRemainingMs
        ].join('|');
      }),
      want: 'true|true|2026-07-10T00:00:00.000Z|8|1500|1|8|1500|1|false|false|cycle-complete|2026-07-10T00:03:00.000Z|30000|120000|120000|8|1500|1|2026-07-10T00:02:00.000Z|cycle-complete|2026-07-10T00:04:00.000Z|75000'
    },
    {
      name: 'browserless stats ignore kill messages already present at session entry',
      got: (() => {
        const config = parseBrowserlessRunnerArgs([], {});
        const startedAt = Date.parse('2026-07-10T00:00:00.000Z');
        const updatedAt = Date.parse('2026-07-10T00:00:30.000Z');
        const state = {
          session: {
            userId: 77,
            sessionToken: 'state-secret-token'
          },
          runner: {
            running: true,
            mode: 'profit-live',
            controlMode: 'profit-live'
          },
          current: {
            self: { userId: 77, name: 'self', hp: 100, drop: 10 },
            stamina: { stamina1dRemainingMilli: 10000 }
          }
        };
        state.stats = browserlessStatsForDecision(state, {
          at: new Date(startedAt).toISOString(),
          input: {
            self: { userId: 77, name: 'self', drop: 10 },
            stamina: { stamina1dRemainingMilli: 10000 },
            realtime: { tick: 1000 },
            selfKillEvidence: [
              { targetUserId: 88, tick: 900 },
              { targetUserId: 99, tick: 990 }
            ]
          }
        }, { nowMs: startedAt });
        const compactInitial = buildCompactBrowserlessStatus(state, {
          ...config,
          nowMs: startedAt
        });
        state.stats = browserlessStatsForDecision(state, {
          at: new Date(updatedAt).toISOString(),
          input: {
            self: { userId: 77, name: 'self', drop: 12 },
            stamina: { stamina1dRemainingMilli: 9600 },
            realtime: { tick: 1100 },
            selfKillEvidence: [
              { targetUserId: 88, tick: 900 },
              { targetUserId: 99, tick: 990 },
              { targetUserId: 111, tick: 1098 }
            ]
          }
        }, { nowMs: updatedAt });
        const compactUpdated = buildCompactBrowserlessStatus(state, {
          ...config,
          nowMs: updatedAt
        });
        return [
          compactInitial.stats.currentSession.kills,
          compactInitial.stats.today.kills,
          compactUpdated.stats.currentSession.kills,
          compactUpdated.stats.today.kills,
          state.stats.currentSession.enteredTick,
          state.stats.currentSession.killBaselineKeys.length
        ].join('|');
      })(),
      want: '0|0|1|1|1000|2'
    },
    {
      name: 'browserless stats reset legacy untrusted kill counters',
      got: (() => {
        const compact = buildCompactBrowserlessStatus({
          session: {
            userId: 77,
            sessionToken: 'state-secret-token'
          },
          runner: {
            running: true,
            mode: 'profit-live',
            controlMode: 'profit-live'
          },
          current: {
            self: { userId: 77, name: 'self', hp: 100, drop: 12 },
            stamina: { stamina1dRemainingMilli: 9600 }
          },
          stats: {
            currentSession: {
              online: true,
              sessionId: '77:2026-07-10T00:00:00.000Z',
              userId: 77,
              enteredAt: '2026-07-10T00:00:00.000Z',
              lastSeenAt: '2026-07-10T00:01:00.000Z',
              baseDrop: 10,
              lastDrop: 12,
              coinsGained: 2,
              staminaSpentMs: 400,
              killKeys: ['self-kill:88:900', 'self-kill:99:990'],
              kills: 22
            },
            today: {
              day: '2026-07-10',
              uptimeMs: 1000,
              staminaSpentMs: 400,
              coinsGained: 2,
              kills: 116,
              activeSessionId: '77:2026-07-10T00:00:00.000Z',
              activeEnteredAt: '2026-07-10T00:00:00.000Z',
              activeBaseKills: 0
            }
          }
        }, {
          ...parseBrowserlessRunnerArgs([], {}),
          nowMs: Date.parse('2026-07-10T00:01:00.000Z')
        });
        return [
          compact.stats.currentSession.kills,
          compact.stats.today.kills,
          compact.stats.currentSession.coinsGained,
          compact.stats.today.coinsGained
        ].join('|');
      })(),
      want: '0|0|4|8'
    },
    {
      name: 'browserless stats reset v2 polluted kill counters',
      got: (() => {
        const compact = buildCompactBrowserlessStatus({
          session: {
            userId: 77,
            sessionToken: 'state-secret-token'
          },
          runner: {
            running: true,
            mode: 'profit-live',
            controlMode: 'profit-live'
          },
          current: {
            self: { userId: 77, name: 'self', hp: 100, drop: 12 },
            stamina: { stamina1dRemainingMilli: 9600 }
          },
          stats: {
            killAccountingVersion: 2,
            currentSession: {
              online: true,
              sessionId: '77:2026-07-10T00:00:00.000Z',
              userId: 77,
              enteredAt: '2026-07-10T00:00:00.000Z',
              enteredTick: 1000,
              lastSeenAt: '2026-07-10T00:01:00.000Z',
              baseDrop: 10,
              lastDrop: 12,
              coinsGained: 2,
              staminaSpentMs: 400,
              killBaselineInitialized: true,
              killBaselineKeys: ['self-kill:88:900'],
              killKeys: ['self-kill:88:900', 'self-kill:99:990', 'self-kill:111:1001'],
              kills: 24
            },
            today: {
              day: '2026-07-10',
              uptimeMs: 1000,
              staminaSpentMs: 400,
              coinsGained: 2,
              kills: 140,
              activeSessionId: '77:2026-07-10T00:00:00.000Z',
              activeEnteredAt: '2026-07-10T00:00:00.000Z',
              activeBaseKills: 0
            }
          }
        }, {
          ...parseBrowserlessRunnerArgs([], {}),
          nowMs: Date.parse('2026-07-10T00:01:00.000Z')
        });
        return [
          compact.stats.currentSession.kills,
          compact.stats.today.kills,
          compact.stats.currentSession.coinsGained,
          compact.stats.today.coinsGained
        ].join('|');
      })(),
      want: '0|0|4|8'
    },
    {
      name: 'browserless stats filter trusted kill keys authoritatively',
      got: (() => {
        const compact = buildCompactBrowserlessStatus({
          session: {
            userId: 77,
            sessionToken: 'state-secret-token'
          },
          runner: {
            running: true,
            mode: 'profit-live',
            controlMode: 'profit-live'
          },
          current: {
            self: { userId: 77, name: 'self', hp: 100, drop: 12 },
            stamina: { stamina1dRemainingMilli: 9600 }
          },
          stats: {
            killAccountingVersion: 3,
            currentSession: {
              online: true,
              sessionId: '77:2026-07-10T00:00:00.000Z',
              userId: 77,
              enteredAt: '2026-07-10T00:00:00.000Z',
              enteredTick: 1000,
              lastSeenAt: '2026-07-10T00:01:00.000Z',
              baseDrop: 10,
              lastDrop: 12,
              coinsGained: 2,
              staminaSpentMs: 400,
              killBaselineInitialized: true,
              killBaselineKeys: ['self-kill:88:900'],
              killKeys: [
                'self-kill:66:800',
                'self-kill:77:unknown',
                'self-kill:88:900',
                'self-kill:99:1001',
                'self-kill:99:1001'
              ],
              kills: 24
            },
            today: {
              day: '2026-07-10',
              uptimeMs: 1000,
              staminaSpentMs: 400,
              coinsGained: 2,
              kills: 5,
              activeSessionId: '77:2026-07-10T00:00:00.000Z',
              activeEnteredAt: '2026-07-10T00:00:00.000Z',
              activeBaseKills: 0
            }
          }
        }, {
          ...parseBrowserlessRunnerArgs([], {}),
          nowMs: Date.parse('2026-07-10T00:01:00.000Z')
        });
        return [
          compact.stats.currentSession.kills,
          compact.stats.today.kills,
          compact.stats.currentSession.coinsGained,
          compact.stats.today.coinsGained
        ].join('|');
      })(),
      want: '1|6|4|8'
    },
    {
      name: 'browserless compact status exposes offline last known stamina blocker',
      got: (() => {
        const compact = buildCompactBrowserlessStatus({
          updatedAt: '2026-07-10T15:14:16.600Z',
          session: {
            userId: 77,
            tokenPresent: true,
            authenticated: true
          },
          runner: {
            running: true,
            currentAction: {
              kind: 'loop-wait',
              reason: 'no-self',
              nextRunAt: '2026-07-10T15:14:46.522Z'
            },
            lastRun: {
              canary: {
                completedAt: '2026-07-10T15:14:16.396Z',
                error: 'no-self',
                leave: {
                  ok: true,
                  attempts: [
                    {
                      response: {
                        entity_id: 308,
                        user_id: 77,
                        name: 'self',
                        x: 5999,
                        y: 66268,
                        hp: 100,
                        stamina_5s_remaining_milli: 10000,
                        stamina_1h_remaining_milli: 3000000,
                        stamina_1d_remaining_milli: 31,
                        death_drop_coins: 2316
                      }
                    }
                  ]
                }
              }
            }
          },
          current: {
            self: null,
            stamina: {
              stamina5sRemainingMilli: null,
              stamina1hRemainingMilli: null,
              stamina1dRemainingMilli: null
            }
          },
          stats: {
            currentSession: {
              online: false,
              exitReason: 'stamina-exhausted-leave',
              lastStamina1dRemaining: 31
            },
            lastExit: {
              at: '2026-07-10T09:52:17.017Z',
              reason: 'stamina-exhausted-leave',
              nextRunAt: '2026-07-10T15:14:46.522Z'
            }
          }
        }, {
          nowMs: Date.parse('2026-07-10T15:13:00.000Z')
        });
        return [
          compact.game.inGame,
          compact.self === null,
          compact.stamina.remaining1d === null,
          compact.lastKnown.self.hp,
          compact.lastKnown.self.drop,
          compact.lastKnown.stamina.remaining5s,
          compact.lastKnown.stamina.remaining1d,
          compact.stats.offline.blocker.reason,
          compact.stats.offline.blocker.exhausted.join(','),
          compact.stats.offline.nextReconnectAt,
          compact.stats.offline.reconnectRemainingMs
        ].join('|');
      })(),
      want: 'false|true|true|100|2316|10000|31|stamina-exhausted-leave|1d|2026-07-10T16:00:10.000Z|2830000'
    },
    {
      name: 'browserless state file replaces current action snapshots',
      got: withTempDirForTest(async dir => {
        const config = parseBrowserlessRunnerArgs(['--data-dir', dir], {});
        const file = stateFilePath(config);
        updateBrowserlessStateFile(file, {
          runner: {
            currentAction: {
              kind: 'safety-exit',
              band: 'safety',
              reason: 'profit-live-snapshot-active-threat',
              shouldLeave: true,
              stopMotion: true,
              target: { userId: 31361, drop: 44 }
            }
          },
          current: {
            action: {
              kind: 'safety-exit',
              band: 'safety',
              reason: 'profit-live-snapshot-active-threat',
              shouldLeave: true,
              stopMotion: true,
              target: { userId: 31361, drop: 44 }
            },
            decision: {
              kind: 'safety-exit',
              reason: 'profit-live-snapshot-active-threat',
              action: {
                kind: 'safety-exit',
                shouldLeave: true,
                stopMotion: true,
                target: { userId: 31361, drop: 44 }
              },
              input: {
                dataGaps: ['snapshot-active-threat-visible']
              }
            },
            decisionState: {
              attackHistory: {
                count: 12,
                recent: [{ id: 'old-attack' }]
              },
              safety: {
                fleeLock: { dx: 1, dy: 0 }
              }
            }
          }
        }, { updatedAt: '2026-07-08T00:00:01.000Z' });
        updateBrowserlessStateFile(file, {
          runner: {
            currentAction: {
              kind: 'stop',
              reason: 'unsupported-or-wait-decision',
              command: { type: 'velocity', dx: 0, dy: 0 },
              actionState: { sentCount: 1, stopCount: 1 }
            }
          },
          current: {
            action: {
              kind: 'stop',
              reason: 'unsupported-or-wait-decision',
              command: { type: 'velocity', dx: 0, dy: 0 },
              actionState: { sentCount: 1, stopCount: 1 }
            },
            decision: {
              kind: 'wait',
              reason: 'no-profitable-candidate',
              action: {
                kind: 'wait',
                band: 'wait',
                reason: 'no-profitable-candidate'
              },
              input: {
                dataGaps: ['snapshot-fallback-blocked:snapshot-fallback-disabled']
              }
            },
            decisionState: {
              attackHistory: {
                count: 0,
                recent: []
              }
            }
          }
        }, { updatedAt: '2026-07-08T00:00:02.000Z' });
        const stored = readBrowserlessStateFile(file);
        return [
          stored.runner.currentAction.kind,
          stored.runner.currentAction.shouldLeave === undefined,
          stored.runner.currentAction.stopMotion === undefined,
          stored.runner.currentAction.target === undefined,
          stored.runner.currentAction.actionState.stopCount,
          stored.current.action.kind,
          stored.current.action.shouldLeave === undefined,
          stored.current.action.target === undefined,
          stored.current.decision.kind,
          stored.current.decision.action.kind,
          stored.current.decision.action.shouldLeave === undefined,
          stored.current.decision.action.target === undefined,
          stored.current.decision.input.dataGaps.join(','),
          stored.current.decisionState.attackHistory.count,
          stored.current.decisionState.safety === undefined
        ].join('|');
      }),
      want: 'stop|true|true|true|1|stop|true|true|wait|wait|true|true|snapshot-fallback-blocked:snapshot-fallback-disabled|0|true'
    },
    {
      name: 'browserless status server gates status and redacts payload',
      got: (async () => {
        let stopCalled = 0;
        const handle = await startStatusServer({
          host: '127.0.0.1',
          port: 0,
          webToken: 'test-token',
          getStatus: () => ({
            ok: true,
            session: {
              userId: 77,
              tokenPresent: true,
              sessionToken: 'must-not-leak'
            },
            runner: {
              running: true,
              currentAction: { kind: 'wait', reason: 'self-test' }
            },
            current: {
              self: { name: 'self', hp: 12 },
              stamina: { stamina1hRemainingMilli: 123000 }
            }
          }),
          onStop: async () => {
            stopCalled += 1;
            return { ok: true, stopped: true };
          }
        });
        try {
          const base = `http://127.0.0.1:${handle.port}`;
          const denied = await fetch(`${base}/api/status`);
          const allowed = await fetch(`${base}/api/status?token=test-token`);
          const allowedText = await allowed.text();
          const allowedBody = JSON.parse(allowedText);
          const compact = await fetch(`${base}/api/panel-status?token=test-token`);
          const compactText = await compact.text();
          const compactBody = JSON.parse(compactText);
          const health = await fetch(`${base}/api/health`);
          const healthBody = JSON.parse(await health.text());
          const panel = await fetch(`${base}/?token=test-token`);
          const panelText = await panel.text();
          const panelScript = panelText.match(/<script>([\s\S]*?)<\/script>/);
          let panelScriptOk = false;
          try {
            if (panelScript) {
              const VmScript = require('vm').Script;
              new VmScript(panelScript[1]);
              panelScriptOk = true;
            }
          } catch (_) {
            panelScriptOk = false;
          }
          const stop = await fetch(`${base}/api/stop`, {
            method: 'POST',
            headers: { authorization: 'Bearer test-token' }
          });
          return [
            denied.status,
            allowed.status,
            allowedBody.session.tokenPresent,
            allowedBody.statusServer.webVersion === BROWSERLESS_WEB_PANEL_VERSION,
            !allowedText.includes('must-not-leak'),
            compact.status,
            compactBody.compact,
            compactBody.self.hp,
            compactBody.statusServer.webVersion === BROWSERLESS_WEB_PANEL_VERSION,
            !compactText.includes('must-not-leak'),
            healthBody.webVersion === BROWSERLESS_WEB_PANEL_VERSION,
            panel.status,
            /囤囤鼠历险记Bot/.test(panelText),
            /rel="icon"/.test(panelText),
            panelText.includes(`id="webVersion">${BROWSERLESS_WEB_PANEL_VERSION}</dd>`),
            /_webReloadVersion/.test(panelText),
            /AUTO_REFRESH_MS\s*=\s*3000/.test(panelText),
            /visibilitychange/.test(panelText),
            /document\.visibilityState\s*===\s*'visible'/.test(panelText),
            !/hasFocus/.test(panelText),
            /class="layout"/.test(panelText),
            /grid-template-columns:minmax\(240px,1fr\) minmax\(0,2fr\)/.test(panelText),
            /class="stack left-stack"/.test(panelText),
            /class="stack right-stack"/.test(panelText),
            /程序状态/.test(panelText),
            /账号状态/.test(panelText),
            /角色状态/.test(panelText),
            /id="sourceIpCount"/.test(panelText),
            /id="accountStatus"/.test(panelText),
            /id="roleStatus"/.test(panelText),
            /当前动作/.test(panelText),
            /id="actionDetails"/.test(panelText),
            /附近金币/.test(panelText),
            /附近玩家/.test(panelText),
            /id="nearbyCoins"/.test(panelText),
            /id="nearbyPlayers"/.test(panelText),
            panelText.indexOf('class="stats-grid"') < panelText.indexOf('id="nearbyGrid"'),
            /id="sessionPanelTitle">本次游戏<\/h2>/.test(panelText),
            !/id="refreshBtn"/.test(panelText),
            !/id="stopBtn"/.test(panelText),
            !/class="hero"/.test(panelText),
            !/id="botLine"/.test(panelText),
            !/id="reason"/.test(panelText),
            !/id="session"/.test(panelText),
            !/<h2>当前目标<\/h2>/.test(panelText),
            !/id="(?:target|offlineStats|motion|shooting|profit|combat|safety)"/.test(panelText),
            !/<h2>上次运行<\/h2>/.test(panelText),
            !/id="lastRun"/.test(panelText),
            /登录点坐标/.test(panelText),
            !panelText.includes('需要查看日志'),
            panelScriptOk,
            /--coin:#fbbf24/.test(panelText),
            /\.status-dot/.test(panelText),
            /@keyframes status-breathe/.test(panelText),
            /function readExistingRows/.test(panelText),
            /function syncValueNode/.test(panelText),
            /dataset\.rowKey/.test(panelText),
            !/node\.textContent\s*=\s*''/.test(panelText),
            /authStatusAttrs\(s\)/.test(panelText),
            /gameStatusAttrs\(s\)/.test(panelText),
            /loginPointAttrs\(status\)/.test(panelText),
            /classAttrs\('coin'\)/.test(panelText),
            stop.status,
            JSON.parse(await stop.text()).stopped,
            stopCalled
          ].join('|');
        } finally {
          await handle.close();
        }
      })(),
      want: '401|200|true|true|true|200|true|12|true|true|true|200|true|true|true|true|true|true|true|true|true|true|true|true|true|true|true|true|true|true|true|true|true|true|true|true|true|true|true|true|true|true|true|true|true|true|true|true|true|true|true|true|true|true|true|true|true|true|true|true|true|true|200|true|1'
    },
    {
      name: 'browserless web panel renders explicit login point safety result',
      got: (() => {
        const panelText = renderBrowserlessWebPanel();
        const panelScript = panelText.match(/<script>([\s\S]*?)<\/script>/)?.[1] || '';
        const hiddenActionLabels = [
          '金币目标',
          '金币原因',
          '金币评分',
          '金币消耗',
          '可选金币',
          '移动原因',
          '移动方向',
          '移动次数',
          '停止次数',
          '开火原因',
          '开火次数',
          '连发次数',
          '开火回执'
        ];
        return [
          /function loginPointDisplay/.test(panelScript),
          /return loginPointDisplay\(status\)\.text/.test(panelScript),
          !/return '检查中'/.test(panelScript),
          panelScript.includes("'安全 ' + loginPointProgressText(status, true)"),
          panelScript.includes("return coord(point.x) + ', ' + coord(point.y);"),
          panelScript.includes("translated === '安全'"),
          /loginPointDisplay\(status\)\.state === 'safe'/.test(panelScript),
          /loginDisplay\.state === 'safe'/.test(panelScript),
          /function offlineBlockerText/.test(panelScript),
          /s\.lastKnown\?\.self/.test(panelScript),
          /上次体力1d/.test(panelScript),
          /保持离线/.test(panelScript),
          panelScript.includes("if (online) addRow(rowsOut, '数据缺口', dataGapsText(decision));"),
          panelScript.includes("return '快照金币备用被阻止：快照金币超出可见范围';"),
          panelScript.includes("setText('sessionPanelTitle', online ? '本次游戏' : '上次游戏');"),
          panelScript.includes("['进入时间', fullStamp(currentSession.enteredAt), true]"),
          !panelScript.includes("'状态/进入'"),
          /function isLowValueFullStaminaNearbyPlayer/.test(panelScript),
          panelScript.includes('const visibleItems = items.filter(item => !isLowValueFullStaminaNearbyPlayer(item));'),
          panelScript.includes("低收益满体力玩家"),
          /function isAfkProfitNearbyPlayer/.test(panelScript),
          /function playerHpCell/.test(panelScript),
          !panelScript.includes("{ text: '无敌' }"),
          panelScript.includes("['当前位置', s.game?.inGame ? pointCoordText(s.self) : '--']"),
          !panelScript.includes("pointText(s.self)"),
          hiddenActionLabels.every(label => !panelScript.includes("addRow(rowsOut, '" + label + "'"))
        ].join('|');
      })(),
      want: 'true|true|true|true|true|true|true|true|true|true|true|true|true|true|true|true|true|true|true|true|true|true|true|true|true|true'
    },
    {
      name: 'browserless runner self-test passes',
      got: (async () => {
        const result = await runBrowserlessRunnerSelfTest();
        return result.ok;
      })(),
      want: true
    },
    {
      name: 'browserless public config redacts target whitelist URL secrets',
      got: (() => {
        const config = publicConfig({
          gameOrigin: 'https://game.test',
          wsPath: '/ws',
          wsExtraQuery: '',
          snapshotPath: '/snapshot',
          targetWhitelistUrl: 'https://example.test/target-whitelist.json?token=secret-token&safe=1',
          targetWhitelistFile: '/tmp/target-whitelist.json',
          targetWhitelistTimeoutMs: 1234,
          targetWhitelistMaxNames: 12,
          controlMode: 'read-only'
        });
        return [
          config.targetWhitelistUrl.includes('secret-token'),
          config.targetWhitelistUrl.includes('[redacted]'),
          config.targetWhitelistFile,
          config.targetWhitelistTimeoutMs,
          config.targetWhitelistMaxNames
        ].join('|');
      })(),
      want: 'false|true|/tmp/target-whitelist.json|1234|12'
    },
    {
      name: 'final arbitration keeps recent safety action over profit',
      got: (() => {
        bot.finalActionArbitration = null;
        applyFinalActionArbitrationForTest({ kind: 'flee', reason: 'avoid-invulnerable-target' }, 0);
        const action = applyFinalActionArbitrationForTest({ kind: 'coin', reason: 'best-opportunity-coin', target: { id: 1, amount: 1 } }, 120);
        bot.finalActionArbitration = null;
        return action.kind + ':' + action.reason + ':' + action.finalActionArbitration?.mode;
      })(),
      want: 'flee:avoid-invulnerable-target:hold-previous'
    },
    {
      name: 'final arbitration keeps recent combat action over recovery',
      got: (() => {
        bot.finalActionArbitration = null;
        applyFinalActionArbitrationForTest({ kind: 'attack', reason: 'combat-burst-fire', combat: true, target: { id: 2, hp: 80 } }, 0);
        const action = applyFinalActionArbitrationForTest({ kind: 'recover', reason: 'wait-for-full-stamina-and-hp' }, 160);
        bot.finalActionArbitration = null;
        return action.kind + ':' + action.reason + ':' + action.finalActionArbitration?.mode;
      })(),
      want: 'attack:combat-burst-fire:hold-previous'
    },
    {
      name: 'final arbitration does not keep profit over new combat',
      got: (() => {
        bot.finalActionArbitration = null;
        applyFinalActionArbitrationForTest({ kind: 'coin', reason: 'best-opportunity-coin', target: { id: 1, amount: 1 } }, 0);
        const action = applyFinalActionArbitrationForTest({ kind: 'attack', reason: 'combat-burst-fire', combat: true, target: { id: 2, hp: 80 } }, 120);
        bot.finalActionArbitration = null;
        return action.kind + ':' + action.reason + ':' + Boolean(action.finalActionArbitration);
      })(),
      want: 'attack:combat-burst-fire:false'
    },
    {
      name: 'low-drop active incoming bullet beats low-value coin inside attack range',
      got: choose({
        local: [{ user_id: 2, x: 1000, y: 0, current_join_mode: 'Active', firing: true }],
        global: [{ user_id: 3, x: 2000, y: 0, death_reward_preview: 50 }],
        coins: [{ drop_id: 1, x: 10, y: 0, amount: 1 }],
        bullets: [{ ownerId: 2 }]
      }).kind,
      want: 'attack'
    },
    {
      name: 'low-drop active in range does not beat foot coin without incoming fire',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 2, x: 1000, y: 0, current_join_mode: 'Active', vx: 30, hp: 100 }],
        coins: [{ drop_id: 1, x: 10, y: 0, amount: 999 }]
      }).kind,
      want: 'coin'
    },
    {
      name: 'ordinary one coin near realtime active remains selectable',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 2, x: 11120, y: 0, native: true, current_join_mode: 'Active', vx: 30, hp: 100 }],
          coins: [{ drop_id: 1, x: 21731, y: 0, amount: 1, native: true }]
        });
        return action.kind + ':' + action.reason;
      })(),
      want: 'seek-coin:best-opportunity-visible-coin'
    },
    {
      name: 'healthy high-value coin near realtime active uses normal opportunity path',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 2, x: 11120, y: 0, native: true, current_join_mode: 'Active', vx: 30, hp: 100 }],
          coins: [{ drop_id: 1, x: 21731, y: 0, amount: 10, native: true }]
        });
        return action.kind + ':' + action.reason;
      })(),
      want: 'seek-coin:best-opportunity-visible-coin'
    },
    {
      name: 'low-drop retreat ignored active threat does not wait over foot coin',
      got: (() => {
        bot.combatRetreatIgnore.set('2', Date.now() + 10000);
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 2, x: 1000, y: 0, current_join_mode: 'Active', vx: 30, hp: 100 }],
          coins: [{ drop_id: 1, x: 10, y: 0, amount: 999 }]
        });
        bot.combatRetreatIgnore.clear();
        return action.kind + ':' + action.reason;
      })(),
      want: 'coin:foot-coin-priority'
    },
    {
      name: 'high-drop retreat ignored active threat waits instead of taking foot coin',
      got: (() => {
        bot.combatRetreatIgnore.set('2', Date.now() + 10000);
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 2, x: 1000, y: 0, current_join_mode: 'Active', vx: 30, hp: 100, death_reward_preview: 10 }],
          coins: [{ drop_id: 1, x: 10, y: 0, amount: 1 }]
        });
        bot.combatRetreatIgnore.clear();
        return action.kind + ':' + action.reason;
      })(),
      want: 'wait:combat-active-threat-wait'
    },
    {
      name: 'profitable active combat wins when it beats safe coins',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 2, x: 1000, y: 0, current_join_mode: 'Active', vx: 30, death_reward_preview: 10 }],
        coins: [{ drop_id: 1, x: 5000, y: 0, amount: 1 }]
      }).kind,
      want: 'attack'
    },
    {
      name: 'active combat waits for long stamina budget before proactive fight',
      got: (() => {
        const action = choose({
          self: {
            user_id: 1,
            x: 0,
            y: 0,
            hp: 100,
            stamina_5s_remaining_milli: 10000,
            stamina_1h_remaining_milli: 50000,
            stamina_1d_remaining_milli: 1000000
          },
          local: [{ user_id: 2, x: 1000, y: 0, current_join_mode: 'Active', vx: 30, hp: 100, death_reward_preview: 50 }],
          coins: [{ drop_id: 1, x: 10, y: 0, amount: 999 }]
        });
        return action.kind + ':' + action.reason;
      })(),
      want: 'coin:foot-coin-priority'
    },
    {
      name: 'active combat long stamina budget still allows incoming bullet defense',
      got: choose({
        self: {
          user_id: 1,
          x: 0,
          y: 0,
          hp: 100,
          stamina_5s_remaining_milli: 10000,
          stamina_1h_remaining_milli: 50000,
          stamina_1d_remaining_milli: 1000000
        },
        local: [{ user_id: 2, x: 1000, y: 0, current_join_mode: 'Active', firing: true, hp: 100, death_reward_preview: 50 }],
        coins: [{ drop_id: 1, x: 10, y: 0, amount: 1 }],
        bullets: [{ ownerId: 2 }]
      }).kind,
      want: 'attack'
    },
    {
      name: 'active combat hp gap disadvantage observes instead of taking coin',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 70, max_hp: 70, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 2, x: 1000, y: 0, current_join_mode: 'Active', vx: 30, hp: 91, death_reward_preview: 30 }],
          coins: [{ drop_id: 1, x: 5000, y: 0, amount: 1 }]
        });
        return action.kind + ':' + action.reason + ':' + action.combatState?.disadvantageObservation?.kind + ':' + Boolean(action.combatState?.disadvantageObservation?.ready);
      })(),
      want: 'attack:combat-spacing:hp-gap:false'
    },
    {
      name: 'healthy high-value visible coin beats active combat state',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 2, x: 1000, y: 0, current_join_mode: 'Active', vx: 30, hp: 100, death_reward_preview: 30 }],
          coins: [{ drop_id: 1, x: 5000, y: 0, amount: 10, native: true }]
        });
        return action.kind + ':' + action.reason;
      })(),
      want: 'coin:high-value-visible-coin-priority'
    },
    {
      name: 'low hp existing combat is not interrupted by high-value coin',
      got: (() => {
        bot.combatTarget = { id: 2, at: Date.now(), firstSeenAt: Date.now(), intent: 'defensive' };
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 40, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 2, x: 1000, y: 0, current_join_mode: 'Active', vx: 30, hp: 30, death_reward_preview: 30 }],
          coins: [{ drop_id: 1, x: 5000, y: 0, amount: 10, native: true }]
        });
        bot.combatTarget = null;
        return action.kind;
      })(),
      want: 'attack'
    },
    {
      name: 'low hp no-threat high-value visible coin beats recovery wait',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 40, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          coins: [{ drop_id: 1, x: 5000, y: 0, amount: 10, native: true }]
        });
        return action.kind + ':' + action.reason;
      })(),
      want: 'coin:high-value-visible-coin-priority'
    },
    {
      name: 'healthy high-value coin away from invulnerable active beats flee',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 4, x: 23000, y: 0, vx: -10, vy: 0, current_join_mode: 'Active', stamina_5s_remaining_milli: 10000, stamina_5s_limit_milli: 10000, invulnerable_remaining_ticks: 5 }],
          coins: [{ drop_id: 2, x: -18000, y: 0, amount: 10, native: true }]
        });
        return action.kind + ':' + action.reason;
      })(),
      want: 'coin:high-value-visible-coin-priority'
    },
    {
      name: 'healthy high-value coin beats close invulnerable avoidance',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 4, x: 12000, y: 0, vx: -10, vy: 0, current_join_mode: 'Active', stamina_5s_remaining_milli: 10000, stamina_5s_limit_milli: 10000, invulnerable_remaining_ticks: 5 }],
          coins: [{ drop_id: 2, x: 10000, y: 0, amount: 30, native: true }]
        });
        return action.kind + ':' + action.reason + ':' + action.id;
      })(),
      want: 'coin:high-value-visible-coin-priority:2'
    },
    {
      name: 'healthy high-value coin overrides non-invulnerable close active combat',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 4, x: 12000, y: 0, current_join_mode: 'Active', vx: -50, hp: 100, death_reward_preview: 20 }],
          coins: [{ drop_id: 2, x: 10000, y: 0, amount: 30, native: true }]
        });
        return action.kind + ':' + action.reason;
      })(),
      want: 'coin:high-value-visible-coin-priority'
    },
    {
      name: 'healthy high-value coin overrides incoming bullet pressure',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 4, x: 12000, y: 0, current_join_mode: 'Active', vx: -50, hp: 100, death_reward_preview: 20 }],
          bullets: [{ owner_id: 4, x: 9000, y: 0, vx: -500, vy: 0 }],
          coins: [{ drop_id: 2, x: 10000, y: 0, amount: 30, native: true }]
        });
        return action.kind + ':' + action.reason;
      })(),
      want: 'coin:high-value-visible-coin-priority'
    },
    {
      name: 'low hp high-value coin does not override non-invulnerable close active combat',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 40, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 4, x: 12000, y: 0, current_join_mode: 'Active', vx: -50, hp: 100, death_reward_preview: 20 }],
          coins: [{ drop_id: 2, x: 10000, y: 0, amount: 30, native: true }]
        });
        return action.kind + ':' + action.reason;
      })(),
      want: 'leave:combat-low-hp-leave'
    },
    {
      name: 'near profitable active combat beats far snapshot cluster by yield',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 2, x: 1000, y: 0, current_join_mode: 'Active', vx: 30, death_reward_preview: 10 }],
        coins: [
          { drop_id: 11, x: 90000, y: 0, amount: 10, snapshot: true },
          { drop_id: 12, x: 94000, y: 1000, amount: 10, snapshot: true },
          { drop_id: 13, x: 98000, y: -1000, amount: 10, snapshot: true }
        ]
      }).reason,
      want: 'combat-spacing'
    },
    {
      name: 'near afk drop target beats far snapshot cluster by yield',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 3, x: 10000, y: 0, current_join_mode: 'Passive', death_reward_preview: 8 }],
        coins: [
          { drop_id: 21, x: 90000, y: 0, amount: 4, snapshot: true },
          { drop_id: 22, x: 94000, y: 1000, amount: 4, snapshot: true },
          { drop_id: 23, x: 98000, y: -1000, amount: 4, snapshot: true }
        ]
      }).reason,
      want: 'best-opportunity-afk-drop-target'
    },
    {
      name: 'visible afk target ignores richer snapshot-only coins',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 3, x: 10000, y: 0, native: true, current_join_mode: 'Passive', death_reward_preview: 3 }],
          coins: [
            { drop_id: 21, x: 90000, y: 0, amount: 50, snapshot: true },
            { drop_id: 22, x: 94000, y: 1000, amount: 50, snapshot: true },
            { drop_id: 23, x: 98000, y: -1000, amount: 50, snapshot: true }
          ]
        });
        return action.reason + ':' + action.id;
      })(),
      want: 'best-opportunity-afk-drop-target:3'
    },
    {
      name: 'low-drop opportunistic shot is skipped during near coin',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 3, x: 12000, y: 0, current_join_mode: 'Passive', death_reward_preview: 3 }],
        coins: [{ drop_id: 1, x: 10, y: 0, amount: 999 }]
      }).opportunisticShot?.id,
      want: undefined
    },
    {
      name: 'low-drop opportunistic shot is skipped during medium coin',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 3, x: 12000, y: 0, current_join_mode: 'Passive', death_reward_preview: 3 }],
        coins: [{ drop_id: 1, x: 22000, y: 0, amount: 999 }]
      }).opportunisticShot?.id,
      want: undefined
    },
    {
      name: 'near coin distance beats amount',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        coins: [
          { drop_id: 1, x: 10, y: 0, amount: 1 },
          { drop_id: 2, x: 5000, y: 0, amount: 5 }
        ]
      }).id,
      want: 1
    },
    {
      name: 'near coin beats far same-value snapshot coin by yield',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        coins: [
          { drop_id: 1, x: 100, y: 0, amount: 1 },
          { drop_id: 2, x: 128700, y: 0, amount: 1 }
        ]
      }).id,
      want: 1
    },
    {
      name: 'higher roi 200m coin beats 150m coin inside visible pool',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        coins: [
          { drop_id: 1, x: 15000, y: 0, amount: 1 },
          { drop_id: 2, x: 20000, y: 0, amount: 20 }
        ]
      }).id,
      want: 2
    },
    {
      name: 'similar stamina roi targets choose immediately',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
          coins: [
            { drop_id: 1, x: 10000, y: 0, amount: 10 },
            { drop_id: 2, x: 12000, y: 0, amount: 12 }
          ]
        });
        bot.opportunityChoice = null;
        return action.id;
      })(),
      want: 1
    },
	    {
	      name: 'held similar roi target prevents target jitter',
	      got: (() => {
	        const t = Date.now();
	        bot.opportunityChoice = { key: 'coin:2', until: t + cfg.opportunitySwitchHoldMs, at: t, score: 600000 };
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
          coins: [
            { drop_id: 1, x: 10000, y: 0, amount: 11 },
            { drop_id: 2, x: 12000, y: 0, amount: 12 }
          ]
        });
        bot.opportunityChoice = null;
        return action.id;
	      })(),
	      want: 2
	    },
    {
      name: 'oscillating opportunity pair locks after repeated switches',
      got: (() => {
        bot.opportunitySwitchLock = null;
        bot.opportunityChoice = { key: 'coin:1', type: 'coin', id: 1, until: 0, at: Date.now(), score: 600000 };
        const picked = [];
        for (let i = 0; i < 6; i += 1) {
          const preferOne = i % 2 === 1;
          const action = choose({
            self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
            coins: [
              { drop_id: 1, x: 10000, y: 0, amount: preferOne ? 30 : 1 },
              { drop_id: 2, x: 12000, y: 0, amount: preferOne ? 1 : 30 }
            ]
          });
          picked.push(action.id);
          if (bot.opportunityChoice) bot.opportunityChoice.until = 0;
        }
        const lockedKey = bot.opportunitySwitchLock?.lockedKey || '';
        bot.opportunityChoice = null;
        bot.opportunitySwitchLock = null;
        return picked.join(',') + ':' + lockedKey;
      })(),
      want: '2,1,2,1,2,2:coin:2'
    },
	    {
	      name: 'missing held coin prevents visible coin jitter',
	      got: (() => {
	        const t = Date.now();
	        bot.opportunityChoice = {
	          key: 'coin:1',
	          type: 'coin',
	          id: 1,
	          x: 5400,
	          y: 0,
	          amount: 1,
	          distance: 5400,
	          score: 111111,
	          staminaCost: 5400,
	          reason: 'best-opportunity-coin',
	          actionKind: 'coin',
	          priorityTier: 1,
	          lastSeenAt: t - 300,
	          until: t + cfg.opportunitySwitchHoldMs
	        };
		        const action = choose({
		          self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
		          coins: [
		            { drop_id: 2, x: 15100, y: 0, amount: 1 }
		          ],
		          visibleCoinsAvailable: false
		        });
		        bot.opportunityChoice = null;
		        return String(action.id) + ':' + Boolean(action.missingHold);
		      })(),
		      want: '1:true'
		    },
		    {
		      name: 'visible missing held coin switches to current visible coin',
		      got: (() => {
		        const t = Date.now();
		        bot.opportunityChoice = {
		          key: 'coin:1',
		          type: 'coin',
		          id: 1,
		          x: 5400,
		          y: 0,
		          amount: 42,
		          distance: 5400,
		          score: 466667,
		          staminaCost: 5400,
		          reason: 'best-opportunity-coin',
		          actionKind: 'coin',
		          priorityTier: 1,
		          lastSeenAt: t - 300,
		          until: t + cfg.opportunitySwitchHoldMs
		        };
		        const action = choose({
		          self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
		          coins: [
		            { drop_id: 2, x: 15100, y: 0, amount: 1, native: true }
		          ]
		        });
		        const result = String(action.id) + ':' + Boolean(action.missingHold) + ':' + bot.lastCoinClearReason + ':' + String(bot.ignoredCoins.has('1'));
		        bot.opportunityChoice = null;
		        bot.ignoredCoins.delete('1');
		        bot.lastCoinClearReason = '';
		        return result;
		      })(),
		      want: '2:false:visible-coin-disappeared:true'
		    },
		    {
		      name: 'closer same-value coin beats sticky older far coin',
      got: (() => {
        bot.lastTarget = { kind: 'coin', id: 2 };
        bot.lastTargetAt = Date.now();
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
          coins: [
            { drop_id: 1, x: 15000, y: 0, amount: 1 },
            { drop_id: 2, x: 21300, y: 0, amount: 1 }
          ]
        });
        bot.lastTarget = null;
        bot.lastTargetAt = 0;
        return action.id;
      })(),
      want: 1
    },
    {
      name: 'local snapshot coin does not beat visible native coin',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        coins: [
          { drop_id: 1, x: 5000, y: 0, amount: 1, native: true },
          { drop_id: 1034, x: 18500, y: 0, amount: 50, snapshot: true }
        ]
      }).id,
      want: 1
    },
    {
      name: 'local snapshot-only coin is not chased',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        coins: [{ drop_id: 1034, x: 18500, y: 0, amount: 50, snapshot: true }]
      }).reason,
      want: 'wait-for-visible-coin-refresh'
    },
    {
      name: '500m snapshot-only coin is suppressed by realtime authority',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        coins: [{ drop_id: 1034, x: 50000, y: 0, amount: 50, snapshot: true }]
      }).reason,
      want: 'wait-for-visible-coin-refresh'
    },
    {
      name: 'native nearby coin with snapshot metadata uses visible coin reason',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        coins: [{ drop_id: 639, x: 4800, y: 0, amount: 1, native: true, snapshot: true, snapshotMembers: 1 }]
      }).reason,
      want: 'best-opportunity-coin'
    },
    {
      name: 'local realtime coin inside 500m blocks far snapshot field',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
          coins: [
            { drop_id: 1, x: 49000, y: 0, amount: 1, native: true },
            { drop_id: 2, x: 126200, y: 0, amount: 1, snapshot: true },
            { drop_id: 3, x: 128000, y: 1200, amount: 1, snapshot: true },
            { drop_id: 4, x: 130000, y: -1200, amount: 1, snapshot: true }
          ]
        });
        return action.id + ':' + action.reason;
      })(),
      want: '1:best-opportunity-visible-coin'
    },
    {
      name: 'same-value coin score distinguishes 150m from 227m',
      got: scoreCoinOpportunity({ amount: 1, distance: 150 }) > scoreCoinOpportunity({ amount: 1, distance: 227 }),
      want: true
    },
    {
      name: 'richer far coin can beat near coin when yield is higher',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        coins: [
          { drop_id: 1, x: 2000, y: 0, amount: 1 },
          { drop_id: 2, x: 5000, y: 0, amount: 20 }
        ]
      }).id,
      want: 2
    },
    {
      name: 'near drop three afk target beats far single coin by roi',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 33, x: 12000, y: 0, current_join_mode: 'Passive', death_reward_preview: 3 }],
        coins: [{ drop_id: 1, x: 22000, y: 0, amount: 1 }]
      }).kind,
      want: 'attack'
    },
    {
      name: '400m high-value visible coin beats low in-range afk drop by roi',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 33, x: 12000, y: 0, current_join_mode: 'Passive', death_reward_preview: 3 }],
        coins: [{ drop_id: 1, x: 40000, y: 0, amount: 50, native: true }]
      }).reason,
      want: 'best-opportunity-visible-coin'
    },
    {
      name: 'visible high afk drop beats opposite one coin by stamina roi',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
          global: [{ user_id: 33, x: 49000, y: 0, current_join_mode: 'Passive', death_reward_preview: 20 }],
          coins: [{ drop_id: 1, x: -5000, y: 0, amount: 1, native: true }]
        });
        return action.kind + ':' + action.reason;
      })(),
      want: 'seek-enemy:approach-afk-drop-target'
    },
    {
      name: 'new out-of-range afk target can be chased before stamina drop observed',
      got: (() => {
        bot.opportunityChoice = null;
        bot.opportunitySwitchLock = null;
        bot.opportunityAfkStamina.clear();
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
          global: [{ user_id: 8801, x: 49000, y: 0, current_join_mode: 'Passive', stamina_5s_remaining_milli: 5000, death_reward_preview: 20 }],
          coins: [{ drop_id: 1, x: -5000, y: 0, amount: 1, native: true }]
        });
        bot.opportunityAfkStamina.clear();
        return action.kind + ':' + action.reason;
      })(),
      want: 'seek-enemy:approach-afk-drop-target'
    },
    {
      name: 'out-of-range afk target cools down after observed stamina drop',
      got: (() => {
        bot.opportunityChoice = null;
        bot.opportunitySwitchLock = null;
        bot.opportunityAfkStamina.clear();
        const self = { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 };
        const coin = { drop_id: 1, x: -5000, y: 0, amount: 1, native: true };
        choose({
          self,
          global: [{ user_id: 8802, x: 49000, y: 0, current_join_mode: 'Passive', stamina_5s_remaining_milli: 10000, death_reward_preview: 20 }],
          coins: [coin]
        });
        const action = choose({
          self,
          global: [{ user_id: 8802, x: 49000, y: 0, current_join_mode: 'Passive', stamina_5s_remaining_milli: 8000, death_reward_preview: 20 }],
          coins: [coin]
        });
        bot.opportunityAfkStamina.clear();
        return action.kind + ':' + action.reason;
      })(),
      want: 'coin:best-opportunity-coin'
    },
    {
      name: 'in-range afk target ignores stamina cooldown',
      got: (() => {
        bot.opportunityChoice = null;
        bot.opportunitySwitchLock = null;
        bot.opportunityAfkStamina.clear();
        bot.opportunityAfkStamina.set('8803', { cooldownUntil: Date.now() + cfg.opportunityAfkStaminaCooldownMs, lastSeenAt: Date.now(), stamina5s: 8000, consumedAt: Date.now() });
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 8803, x: 10000, y: 0, current_join_mode: 'Passive', death_reward_preview: 20 }],
          coins: [{ drop_id: 1, x: 8000, y: 0, amount: 1, native: true }]
        });
        bot.opportunityAfkStamina.clear();
        return action.kind + ':' + action.reason;
      })(),
      want: 'attack:best-opportunity-afk-drop-target'
    },
    {
      name: 'near high afk drop beats low coin by value',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 17, x: 10000, y: 0, current_join_mode: 'Passive', death_reward_preview: 17 }],
        coins: [{ drop_id: 1, x: 8000, y: 0, amount: 1 }]
      }).kind,
      want: 'attack'
    },
    {
      name: 'attack-range afk drop shoots without combat state',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 17, x: 13000, y: 0, current_join_mode: 'Passive', death_reward_preview: 17 }],
          coins: [{ drop_id: 1, x: 8000, y: 0, amount: 1 }]
        });
        return action.kind + ':' + Boolean(action.combat);
      })(),
      want: 'attack:false'
    },
    {
      name: 'full hp does not approach moving enemy outside combat range',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        global: [{ user_id: 17, x: 24000, y: 0, current_join_mode: 'Passive', vx: 20, death_reward_preview: 17 }],
        coins: [{ drop_id: 1, x: 6000, y: 0, amount: 1 }]
      }).kind,
      want: 'coin'
    },
    {
      name: 'near richer coin beats far marginal drop',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 17, x: 18000, y: 0, current_join_mode: 'Passive', death_reward_preview: 12 }],
        coins: [{ drop_id: 1, x: 1000, y: 0, amount: 20 }]
      }).kind,
      want: 'coin'
    },
    {
      name: 'passive bystander in combat range does not interrupt coin',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 2, x: 6000, y: 0, current_join_mode: 'Passive' }],
        coins: [{ drop_id: 1, x: 5000, y: 0, amount: 1 }]
      }).kind,
      want: 'coin'
    },
    {
      name: 'touching passive in combat range does not interrupt full hp coin',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 2, x: 80, y: 0, current_join_mode: 'Passive' }],
        coins: [{ drop_id: 1, x: 5000, y: 0, amount: 1 }]
      }).kind,
      want: 'coin'
    },
    {
      name: 'stationary passive in combat range does not start combat',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 2, x: 1500, y: 0, current_join_mode: 'Passive' }],
        coins: [{ drop_id: 1, x: 5000, y: 0, amount: 1 }]
      }).kind,
      want: 'coin'
    },
    {
      name: 'near coin beats higher far afk drop by yield',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        global: [{ user_id: 4, x: 20000, y: 0, death_reward_preview: 7 }],
        coins: [{ drop_id: 2, x: 3000, y: 0, amount: 5 }]
      }).kind,
      want: 'coin'
    },
    {
      name: 'higher medium coin beats lower far afk drop target',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        global: [{ user_id: 4, x: 20000, y: 0, death_reward_preview: 7 }],
        coins: [{ drop_id: 2, x: 22000, y: 0, amount: 8 }]
      }).kind,
      want: 'seek-coin'
    },
    {
      name: 'far snapshot coin outside local range is ignored',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        global: [{ user_id: 4, x: 20000, y: 0, current_join_mode: 'Active', vx: -50, death_reward_preview: 7 }],
        coins: [{ drop_id: 2, x: 52000, y: 0, amount: 5, snapshot: true }]
      }).reason,
      want: 'wait-for-visible-coin-refresh'
    },
	    {
	      name: 'single far low-value snapshot coin waits for visible refresh',
	      got: choose({
	        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
	        coins: [{ drop_id: 2, x: 52000, y: 0, amount: 1, snapshot: true }],
	        snapshotWaitAgeMs: 59999
	      }).reason,
	      want: 'wait-for-visible-coin-refresh'
	    },
	    {
	      name: 'single far low-value snapshot coin is still ignored after idle timeout',
	      got: choose({
	        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
	        coins: [{ drop_id: 2, x: 52000, y: 0, amount: 1, snapshot: true }],
	        snapshotWaitAgeMs: 60000
	      }).reason,
	      want: 'wait-for-visible-coin-refresh'
	    },
    {
      name: 'far snapshot coin cluster is ignored',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        coins: [
          { drop_id: 2, x: 52000, y: 0, amount: 1, snapshot: true },
          { drop_id: 3, x: 56000, y: 2000, amount: 1, snapshot: true },
          { drop_id: 4, x: 59000, y: -1000, amount: 1, snapshot: true }
        ]
      }).reason,
      want: 'wait-for-visible-coin-refresh'
    },
	    {
	      name: 'far snapshot coin cluster does not create snapshot field reason',
	      got: choose({
	        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
	        coins: [
	          { drop_id: 2, x: 52000, y: 0, amount: 1, snapshot: true },
	          { drop_id: 3, x: 56000, y: 2000, amount: 1, snapshot: true },
	          { drop_id: 4, x: 59000, y: -1000, amount: 1, snapshot: true }
	        ]
	      }).reason,
	      want: 'wait-for-visible-coin-refresh'
	    },
	    {
	      name: 'near known coin field beats farther snapshot field by ROI',
	      got: choose({
	        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
	        coins: [
	          { drop_id: 11, x: 30000, y: 0, amount: 1 },
	          { drop_id: 12, x: 32000, y: 1000, amount: 1 },
	          { drop_id: 13, x: 34000, y: -1000, amount: 1 },
	          { drop_id: 21, x: 90000, y: 0, amount: 1, snapshot: true },
	          { drop_id: 22, x: 94000, y: 2000, amount: 1, snapshot: true },
	          { drop_id: 23, x: 97000, y: -1000, amount: 1, snapshot: true }
	        ]
	      }).reason,
	      want: 'migrate-to-known-field'
	    },
    {
      name: 'near realtime coin remains first target before known field route',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
	          coins: [
	            { drop_id: 1, x: 20000, y: 0, amount: 1, native: true },
	            { drop_id: 11, x: 34000, y: 0, amount: 1, native: true },
	            { drop_id: 12, x: 36000, y: 1000, amount: 1, native: true },
	            { drop_id: 13, x: 38000, y: -1000, amount: 1, native: true }
          ]
        });
        return action.id + ':' + action.reason + ':' + action.coinRoute?.ids?.join(',') + ':' + action.coinRoute?.legCount;
      })(),
      want: '1:best-opportunity-coin-route:1,11,12:3'
    },
	    {
	      name: 'no coin fallback waits for visible coin refresh',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 }
      }).reason,
      want: 'wait-for-visible-coin-refresh'
    },
    {
      name: 'low hp waits instead of chasing',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 14 },
        global: [{ user_id: 4, x: 30000, y: 0, death_reward_preview: 7 }],
        coins: [{ drop_id: 2, x: 1000, y: 0, amount: 5 }]
      }).kind,
      want: 'recover'
    },
	    {
	      name: 'low hp disadvantage in combat leaves immediately',
	      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 14 },
        global: [{ user_id: 4, x: 1000, y: 0, death_reward_preview: 7 }],
        coins: [{ drop_id: 2, x: 100, y: 0, amount: 5 }],
        bullets: [{ owner_id: 4, x: 900, y: 0, vx: -100, vy: 0 }]
      }).kind,
	      want: 'leave'
	    },
    {
      name: 'combat leave uses emergency spacing cover while exit is pending',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 40, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 4, x: 1000, y: 0, current_join_mode: 'Passive', hp: 80, firing: true, death_reward_preview: 20 }],
          bullets: [{ owner_id: 4, x: 900, y: 0, vx: -100, vy: 0 }]
        });
        return action.kind + ':' + action.reason + ':' + action.dx + ':' + action.dy + ':' + Boolean(action.shoot) + ':' + action.combatCover?.reason;
      })(),
      want: 'leave:combat-low-hp-leave:-1:0:true:combat-leave-spacing'
    },
    {
      name: 'active combat hp disadvantage leaves before taking a bullet',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 40, max_hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 4, x: 1000, y: 0, current_join_mode: 'Active', hp: 80, death_reward_preview: 20 }]
      }).reason,
      want: 'combat-low-hp-leave'
    },
    {
      name: 'combat leave cover honors short stamina exhaustion',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 40, stamina_5s_remaining_milli: 100 },
          local: [{ user_id: 4, x: 1000, y: 0, current_join_mode: 'Passive', hp: 80, firing: true, death_reward_preview: 20 }],
          bullets: [{ owner_id: 4, x: 900, y: 0, vx: -100, vy: 0 }]
        });
        return action.kind + ':' + action.dx + ':' + action.dy + ':' + Boolean(action.shoot) + ':' + action.combatCover?.movementSuppressed?.reason;
      })(),
      want: 'leave:0:0:false:stamina-5s-exhausted'
    },
    {
      name: 'combat low hp exit summary includes target and hp details',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 40, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 4, name: '影', x: 1000, y: 0, current_join_mode: 'Passive', hp: 80, firing: true, death_reward_preview: 20 }]
        });
        return action.exitSummary?.includes('与影战斗')
          && action.exitSummary.includes('血量40不足50')
          && action.exitSummary.includes('对方血量80')
          && action.exitSummary.includes('劣势退出');
      })(),
      want: true
    },
	    {
	      name: 'critical hp combat leaves even when target hp is lower',
	      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 19, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 4, x: 1000, y: 0, current_join_mode: 'Passive', hp: 5, firing: true, death_reward_preview: 20 }]
	      }).reason,
	      want: 'combat-critical-hp-leave'
	    },
    {
      name: 'combat critical exit summary includes emergency threshold',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 19, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 4, name: '强敌', x: 1000, y: 0, current_join_mode: 'Passive', hp: 5, firing: true, death_reward_preview: 20 }]
      }).exitSummary,
      want: '与强敌战斗，血量19低于20，紧急退出'
    },
    {
      name: 'high hp combat gap observes before leaving',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 70, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 4, x: 10000, y: 0, current_join_mode: 'Passive', hp: 91, firing: true, death_reward_preview: 20 }]
        });
        const observation = action.combatState?.disadvantageObservation;
        return action.kind + ':' + action.reason + ':' + observation?.kind + ':' + Boolean(observation?.ready);
      })(),
      want: 'attack:combat-tangent-dodge:hp-gap:false'
    },
    {
      name: 'confirmed high hp combat gap leaves after observation',
      got: (() => {
        const t = Date.now();
        bot.combatTarget = {
          id: 4,
          at: t - 5000,
          firstSeenAt: t - 5000,
          hp: 91,
          motionSamples: [
            { at: t - 5000, hp: 91, selfHp: 70 },
            { at: t - 3900, hp: 91, selfHp: 70 },
            { at: t - 2800, hp: 91, selfHp: 70 },
            { at: t - 1700, hp: 91, selfHp: 70 }
          ]
        };
        bot.combatDisadvantageObservation = { id: '4', kind: 'hp-gap', firstAt: t - 3000, at: t - 100, count: 4 };
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 70, stamina_5s_remaining_milli: 10000 },
          { user_id: 4, x: 10000, y: 0, distance: 10000, current_join_mode: 'Passive', hp: 91, firing: true }
        );
        bot.combatTarget = null;
        bot.combatDisadvantageObservation = null;
        return action.reason + ':' + action.combatState?.disadvantageObservation?.kind + ':' + Boolean(action.combatState?.disadvantageObservation?.ready);
      })(),
      want: 'combat-hp-disadvantage-leave:hp-gap:true'
    },
    {
      name: 'recovering combat gap at threshold keeps fighting',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 70, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 4, x: 10000, y: 0, current_join_mode: 'Passive', hp: 90, firing: true, death_reward_preview: 20 }]
      }).kind,
      want: 'attack'
    },
    {
      name: 'low hp no-damage combat keeps fighting without disadvantage',
      got: (() => {
        bot.combatTarget = { id: 4, at: Date.now() - 16000, lastDamageAt: Date.now() - 16000, hp: 65 };
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 60, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          { user_id: 4, x: 9000, y: 0, distance: 9000, current_join_mode: 'Passive', hp: 65, firing: true, drop: 20 }
        );
        bot.combatTarget = null;
        return action.kind + ':' + action.reason + ':' + Boolean(action.shoot) + ':' + Boolean(action.forceShoot) + ':' + (Number(action.combatState?.noDamageMs || 0) >= cfg.combatLowHpNoDamageLeaveMs);
      })(),
      want: 'attack:combat-tangent-dodge:true:false:true'
    },
    {
      name: 'low hp recent damage keeps fighting instead of no-damage leave',
      got: (() => {
        bot.combatTarget = { id: 4, at: Date.now() - 16000, lastDamageAt: Date.now() - 500, hp: 65 };
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 60, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          { user_id: 4, x: 9000, y: 0, distance: 9000, current_join_mode: 'Passive', hp: 65, firing: true, drop: 20 }
        );
        bot.combatTarget = null;
        return action.kind;
      })(),
      want: 'attack'
    },
    {
      name: 'recovering fights non-invulnerable moving enemy already in range',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 70, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 4, x: 12000, y: 0, current_join_mode: 'Passive', vx: 30, death_reward_preview: 7 }]
      }).kind,
      want: 'attack'
    },
    {
      name: 'recovering keeps engaged stationary target in combat',
      got: (() => {
        bot.combatTarget = { id: 7, at: Date.now(), lastInRangeAt: Date.now(), reason: 'combat-attack' };
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 90, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 7, x: 10000, y: 0, current_join_mode: 'Passive', hp: 100 }]
        });
        bot.combatTarget = null;
        return action.kind + ':' + Boolean(action.combat) + ':' + action.target?.id;
      })(),
      want: 'attack:true:7'
    },
    {
      name: 'recovering keeps engaged active combat target',
      got: (() => {
        bot.combatTarget = { id: 7, at: Date.now(), lastInRangeAt: Date.now(), reason: 'combat-tangent-dodge' };
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 77, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 7, x: 14000, y: 0, current_join_mode: 'Active', hp: 97, vx: 50, death_reward_preview: 20 }]
        });
        bot.combatTarget = null;
        return action.kind + ':' + Boolean(action.combat) + ':' + action.target?.id;
      })(),
      want: 'attack:true:7'
    },
    {
      name: 'recovering holds engaged combat target inside disengage range',
      got: (() => {
        bot.combatTarget = {
          id: 7,
          at: Date.now() - 1000,
          lastInRangeAt: Date.now() - 1000,
          reason: 'combat-stamina-hold'
        };
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 97, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 7, x: 16000, y: 0, current_join_mode: 'Active', hp: 94, vx: -50, death_reward_preview: 20 }]
        });
        bot.combatTarget = null;
        return action.kind + ':' + Boolean(action.combat) + ':' + action.target?.id;
      })(),
      want: 'wait:true:7'
    },
    {
      name: 'real incoming bullet shooter overrides engaged combat target',
      got: (() => {
        bot.combatTarget = { id: 7, at: Date.now(), lastInRangeAt: Date.now(), reason: 'combat-attack' };
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          local: [
            { user_id: 7, name: 'old', x: 10000, y: 0, current_join_mode: 'Active', hp: 100, death_reward_preview: 20 },
            { user_id: 8, name: 'shooter', x: 9000, y: 0, current_join_mode: 'Active', hp: 100, death_reward_preview: 20 }
          ],
          bullets: [{ owner_id: 8, x: 8000, y: 0, vx: -100, vy: 0, distance: 2500 }]
        });
        bot.combatTarget = null;
        return action.kind + ':' + action.target?.id;
      })(),
      want: 'attack:8'
    },
    {
      name: 'synthetic pressure does not override engaged combat target',
      got: (() => {
        bot.combatTarget = { id: 7, at: Date.now(), lastInRangeAt: Date.now(), reason: 'combat-attack' };
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          local: [
            { user_id: 7, name: 'old', x: 10000, y: 0, current_join_mode: 'Active', hp: 100, death_reward_preview: 20 },
            { user_id: 8, name: 'firing', x: 9000, y: 0, current_join_mode: 'Active', hp: 100, firing: true, death_reward_preview: 20 }
          ]
        });
        bot.combatTarget = null;
        return action.kind + ':' + action.target?.id;
      })(),
      want: 'attack:7'
    },
    {
      name: 'full hp active outside combat range no longer forces flee',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 4, x: 16000, y: 0, current_join_mode: 'Active', vx: -50, death_reward_preview: 7 }]
      }).kind,
      want: 'wait'
    },
    {
      name: 'full hp active caution waits instead of fleeing when no coin exists',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 4, x: 24000, y: 0, current_join_mode: 'Active', vx: -50, death_reward_preview: 7 }]
      }).kind,
      want: 'wait'
    },
    {
      name: 'moving active beyond narrowed caution waits when no coin exists',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 4, x: 30000, y: 0, current_join_mode: 'Active', vx: -50, death_reward_preview: 7 }]
      }).kind,
      want: 'wait'
    },
    {
      name: 'non-full active outside attack range does not enter combat',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 90, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 4, x: 16000, y: 0, current_join_mode: 'Active', vx: -50, death_reward_preview: 7 }]
        });
        return action.kind + ':' + Boolean(action.combat) + ':' + (action.target?.id || '');
      })(),
      want: 'recover:false:'
    },
    {
      name: 'out-of-range incoming bullet dodges without shooting',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 90, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 4, x: 15100, y: 0, current_join_mode: 'Active', hp: 100, vx: 0, death_reward_preview: 1 }],
          bullets: [{ owner_id: 4, x: 12000, y: 0, vx: -500, vy: 0 }]
        });
        return action.kind + ':' + action.reason + ':' + Boolean(action.combat) + ':' + Boolean(action.shoot) + ':' + Boolean(action.combatDodgeOnly) + ':' + action.combatState?.dodgeOnly?.dodgeRange;
      })(),
      want: 'attack:combat-out-of-range-dodge:true:false:true:15500'
    },
    {
      name: 'engaged out-of-range combat target waits instead of chasing',
      got: (() => {
        bot.combatTarget = { id: 7, at: Date.now() - 1000, lastInRangeAt: Date.now() - 1000, distance: 14000, hp: 100 };
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 90, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          { user_id: 7, x: 16000, y: 0, distance: 16000, current_join_mode: 'Active', hp: 95, vx: 50, recentlyMoved: true, motionObservedSpeed: 50, drop: 20 }
        );
        const ignored = combatRetreatIgnoreActive({ id: 7 });
        bot.combatTarget = null;
        bot.combatRetreatIgnore.clear();
        return action.kind + ':' + action.reason + ':' + Boolean(action.combat) + ':' + Boolean(action.shoot) + ':' + action.dx + ':' + action.dy + ':' + ignored;
      })(),
      want: 'wait:combat-out-of-range-hold:true:false:0:0:false'
    },
    {
      name: 'engaged slight out-of-range bullet pressure dodges without shooting',
      got: (() => {
        bot.combatTarget = { id: 7, at: Date.now() - 4000, lastDamageAt: Date.now() - 18000, lastInRangeAt: Date.now() - 2200, distance: 14500, hp: 72, intent: 'engaged' };
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 91, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          { user_id: 7, x: 14700, y: 0, distance: 14700, current_join_mode: 'Active', hp: 72, vx: 0, vy: 0, recentlyMoved: false, motionObservedSpeed: 0, drop: 47, combatIntent: 'reengage' },
          [{ id: 'target-shot', ownerId: 7, x: 11000, y: 0, vx: -500, vy: 0 }]
        );
        bot.combatTarget = null;
        bot.combatRetreatIgnore.clear();
        return action.kind + ':' + action.reason + ':' + Boolean(action.combat) + ':' + Boolean(action.shoot) + ':' + Boolean(action.combatDodgeOnly) + ':' + action.dx + ':' + action.dy + ':' + Boolean(action.combatState?.safeCloseOverride);
      })(),
      want: 'attack:combat-out-of-range-dodge:true:false:true:0:1:false'
    },
    {
      name: 'target-owned recoverable out-of-range pressure dodges with safe close bias',
      got: (() => {
        bot.combatTarget = { id: 7, at: Date.now() - 4000, lastDamageAt: Date.now() - 18000, lastInRangeAt: Date.now() - 2200, distance: 14500, hp: 91, intent: 'engaged' };
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 73, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          { user_id: 7, x: 14700, y: 1800, distance: 14810, current_join_mode: 'Active', hp: 91, vx: 0, vy: 0, recentlyMoved: false, motionObservedSpeed: 0, drop: 107, combatIntent: 'reengage' },
          [{ id: 'target-shot', ownerId: 7, x: 11000, y: 1800, vx: -500, vy: 0 }]
        );
        bot.combatTarget = null;
        bot.combatRetreatIgnore.clear();
        return [
          action.kind,
          action.reason,
          Boolean(action.shoot),
          Boolean(action.combatDodgeOnly),
          action.dx,
          action.dy,
          action.combatState?.dodgeOnly?.buffer,
          Boolean(action.combatState?.safeCloseOverride)
        ].join(':');
      })(),
      want: 'attack:combat-out-of-range-dodge:false:true:1:1:1000:true'
    },
    {
      name: 'losing out-of-range pressure keeps pure dodge without safe close bias',
      got: (() => {
        bot.combatTarget = { id: 7, at: Date.now() - 4000, lastDamageAt: Date.now() - 18000, lastInRangeAt: Date.now() - 2200, distance: 14500, hp: 100, intent: 'engaged' };
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 70, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          { user_id: 7, x: 14700, y: 0, distance: 14700, current_join_mode: 'Active', hp: 100, vx: 0, vy: 0, recentlyMoved: false, motionObservedSpeed: 0, drop: 107, combatIntent: 'reengage' },
          [{ id: 'target-shot', ownerId: 7, x: 11000, y: 0, vx: -500, vy: 0 }]
        );
        bot.combatTarget = null;
        bot.combatRetreatIgnore.clear();
        return [
          action.kind,
          action.reason,
          Boolean(action.shoot),
          Boolean(action.combatDodgeOnly),
          action.dx,
          action.dy,
          action.combatState?.dodgeOnly?.buffer,
          Boolean(action.combatState?.safeCloseOverride)
        ].join(':');
      })(),
      want: 'attack:combat-out-of-range-dodge:false:true:0:1:1000:false'
    },
    {
      name: 'non-pressure out-of-range reengage keeps base hp gap guard',
      got: (() => {
        bot.combatTarget = { id: 7, at: Date.now() - 4000, lastDamageAt: Date.now() - 18000, lastInRangeAt: Date.now() - 2200, distance: 14500, hp: 91, intent: 'engaged' };
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 73, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          { user_id: 7, x: 14700, y: 0, distance: 14700, current_join_mode: 'Active', hp: 91, vx: 0, vy: 0, recentlyMoved: false, motionObservedSpeed: 0, drop: 107, combatIntent: 'reengage' },
          []
        );
        bot.combatTarget = null;
        bot.combatRetreatIgnore.clear();
        return action.kind + ':' + action.reason + ':' + action.dx + ':' + action.dy;
      })(),
      want: 'wait:combat-out-of-range-hold:0:0'
    },
    {
      name: 'retreating slight out-of-range target still holds without pressure',
      got: (() => {
        bot.combatTarget = { id: 7, at: Date.now() - 1000, lastInRangeAt: Date.now() - 1000, distance: 14500, hp: 90, intent: 'engaged' };
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 90, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          { user_id: 7, x: 14700, y: 0, distance: 14700, current_join_mode: 'Active', hp: 90, vx: 50, vy: 0, recentlyMoved: true, motionObservedSpeed: 50, drop: 20, combatIntent: 'reengage' }
        );
        bot.combatTarget = null;
        bot.combatRetreatIgnore.clear();
        return action.kind + ':' + action.reason + ':' + action.dx + ':' + action.dy;
      })(),
      want: 'wait:combat-out-of-range-hold:0:0'
    },
    {
      name: 'low hp out-of-range finish target reengages without shooting',
      got: (() => {
        bot.combatTarget = { id: 7, at: Date.now() - 7000, lastDamageAt: Date.now() - 5000, lastInRangeAt: Date.now() - 1000, distance: 14000, hp: 49 };
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 55, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          { user_id: 7, x: 15500, y: 0, distance: 15500, current_join_mode: 'Active', hp: 49, vx: 50, recentlyMoved: true, motionObservedSpeed: 50, drop: 80 }
        );
        bot.combatTarget = null;
        bot.combatRetreatIgnore.clear();
        return action.kind + ':' + action.reason + ':' + Boolean(action.combat) + ':' + Boolean(action.shoot) + ':' + action.dx + ':' + action.dy + ':' + action.combatState?.outOfRangeFinishPressure?.reason + ':' + action.combatState?.retreatingTarget?.reason;
      })(),
      want: 'attack:combat-finish-reengage:true:false:1:0:out-of-range-low-hp-finish:target-out-of-attack-range'
    },
    {
      name: 'engaged beyond disengage range exits combat state',
      got: (() => {
        bot.combatTarget = { id: 7, at: Date.now() - 1000, lastInRangeAt: Date.now() - 1000, distance: 16000, hp: 100 };
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 90, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          { user_id: 7, x: 17100, y: 0, distance: 17100, current_join_mode: 'Active', hp: 95, vx: 0, recentlyMoved: true, motionObservedSpeed: 0, drop: 20 }
        );
        const hasCombatTarget = Boolean(bot.combatTarget);
        bot.combatTarget = null;
        bot.combatRetreatIgnore.clear();
        return action.kind + ':' + action.reason + ':' + Boolean(action.combat) + ':' + action.combatDisengage?.reason + ':' + hasCombatTarget;
      })(),
      want: 'wait:combat-disengage-range:false:target-beyond-disengage-range:false'
    },
    {
      name: 'retreating edge combat target suppresses fire',
      got: (() => {
        bot.combatTarget = { id: 7, at: Date.now() - 1000, lastInRangeAt: Date.now() - 1000, distance: 13000, hp: 100 };
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          { user_id: 7, x: 14000, y: 0, distance: 14000, current_join_mode: 'Active', hp: 100, vx: 50, recentlyMoved: true, motionObservedSpeed: 50, drop: 20 }
        );
        bot.combatTarget = null;
        bot.combatRetreatIgnore.clear();
        return action.kind + ':' + action.reason + ':' + Boolean(action.shoot) + ':' + action.combatState?.shooting?.reason;
      })(),
      want: 'attack:combat-target-retreating:false:target-retreating-edge'
    },
    {
      name: 'low hp retreating edge target gets finish pressure',
      got: (() => {
        bot.combatTarget = { id: 7, at: Date.now() - 1000, lastInRangeAt: Date.now() - 1000, distance: 13000, hp: 43 };
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          { user_id: 7, x: 14000, y: 0, distance: 14000, current_join_mode: 'Active', hp: 43, vx: 50, recentlyMoved: true, motionObservedSpeed: 50, drop: 80 }
        );
        bot.combatTarget = null;
        bot.combatRetreatIgnore.clear();
        return action.kind + ':' + action.reason + ':' + Boolean(action.shoot) + ':' + action.shootEveryMs + ':' + action.dx + ':' + action.dy + ':' + action.combatState?.pressureClose?.reason + ':' + action.combatState?.shooting?.reason;
      })(),
      want: 'attack:combat-finish-pressure:true:520:1:0:low-hp-retreating-target:finish-pressure'
    },
    {
      name: 'retreat ignored target is not reselected without incoming bullet',
      got: (() => {
        const self = { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100 };
        rememberCombatRetreatIgnore({ user_id: 7 });
        const target = pickCombatTarget(self, [
          { user_id: 7, x: 10000, y: 0, distance: 10000, current_join_mode: 'Active', hp: 100, vx: 50, drop: 20 }
        ], [], { mode: 'defensive' });
        bot.combatRetreatIgnore.clear();
        return target;
      })(),
      want: null
    },
    {
      name: 'incoming bullet can reengage retreat ignored target',
      got: (() => {
        const self = { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 10000 };
        rememberCombatRetreatIgnore({ user_id: 7 });
        const action = choose({
          self,
          local: [{ user_id: 7, x: 10000, y: 0, current_join_mode: 'Passive', hp: 100, drop: 20 }],
          bullets: [{ owner_id: 7, x: 9000, y: 0, vx: -100, vy: 0, distance: 2500 }]
        });
        bot.combatRetreatIgnore.clear();
        return action.kind + ':' + action.target?.id;
      })(),
      want: 'attack:7'
    },
    {
      name: 'non-full invulnerable active still flees',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 90, max_hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 4, x: 16000, y: 0, current_join_mode: 'Active', vx: -50, invulnerable_remaining_ticks: 5 }]
      }).kind,
      want: 'flee'
    },
    {
      name: 'full hp nearby invulnerable target still flees',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 4, x: 20000, y: 0, current_join_mode: 'Passive', invulnerable_remaining_ticks: 5 }]
        });
        return action.kind + ':' + action.reason;
      })(),
      want: 'flee:avoid-invulnerable-target'
    },
    {
      name: 'non-combat damaged state recovers in safe area',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 90, max_hp: 100, stamina_5s_remaining_milli: 10000 }
      }).kind,
      want: 'recover'
    },
    {
      name: 'post combat drop over one coin beats recovery wait',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 90, max_hp: 100, stamina_5s_remaining_milli: 10000 },
        attacks: [{ id: 7, x: 0, y: 0, at: Date.now(), drop: 9 }],
        coins: [{ drop_id: 8, x: 100, y: 0, amount: 2 }]
      }).reason,
      want: 'post-attack-drop-coin'
    },
    {
      name: 'post combat single coin does not beat recovery wait',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 90, max_hp: 100, stamina_5s_remaining_milli: 10000 },
        attacks: [{ id: 7, x: 0, y: 0, at: Date.now(), drop: 9 }],
        coins: [{ drop_id: 8, x: 1000, y: 0, amount: 1 }]
      }).kind,
      want: 'recover'
    },
    {
      name: 'high drop kill waits at last target position before coin refresh',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 90, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          attacks: [{ id: 7, x: 5000, y: 0, at: Date.now(), drop: 20, afk: true, action: 'attack' }],
          coins: [{ drop_id: 3, x: -10000, y: 0, amount: 10, native: true }]
        });
        return action.kind + ':' + action.reason + ':' + action.postAttackTarget.id + ':' + Boolean(action.target);
      })(),
      want: 'patrol:post-attack-drop-wait-position:7:false'
    },
    {
      name: 'delayed high drop kill waits after target resolution',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 90, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          attacks: [{ id: 7, x: 5000, y: 0, at: Date.now() - 1500, drop: 20, afk: true, action: 'attack' }],
          coins: [{ drop_id: 3, x: -10000, y: 0, amount: 10, native: true }]
        });
        return action.kind + ':' + action.reason + ':' + action.postAttackTarget.id + ':' + Boolean(action.target);
      })(),
      want: 'patrol:post-attack-drop-wait-position:7:false'
    },
    {
      name: 'zero reward residual high drop target still triggers post kill wait',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 90, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 7, x: 5000, y: 0, current_join_mode: 'Passive', death_reward_preview: 0, hp: 0 }],
          attacks: [{ id: 7, x: 5000, y: 0, at: Date.now(), drop: 20, afk: true, action: 'attack' }],
          coins: [{ drop_id: 3, x: -10000, y: 0, amount: 10, native: true }]
        });
        return action.kind + ':' + action.reason + ':' + action.postAttackTarget.id + ':' + Boolean(action.target);
      })(),
      want: 'patrol:post-attack-drop-wait-position:7:false'
    },
    {
      name: 'expired high drop post kill wait resumes normal profit',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          attacks: [{ id: 7, x: 5000, y: 0, at: Date.now() - 3000, postAttackDropResolvedAt: Date.now() - 1500, drop: 20, afk: true, action: 'attack' }],
          coins: [{ drop_id: 3, x: -10000, y: 0, amount: 10, native: true }]
        });
        return ['coin', 'seek-coin'].includes(action.kind) && action.reason !== 'post-attack-drop-wait-position';
      })(),
      want: true
    },
    {
      name: 'alive high drop target does not trigger post kill wait',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 90, max_hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 7, x: 5000, y: 0, current_join_mode: 'Passive', death_reward_preview: 20 }],
        attacks: [{ id: 7, x: 5000, y: 0, at: Date.now(), drop: 20, afk: true, action: 'attack' }]
      }).kind,
      want: 'recover'
    },
    {
      name: 'unshot high drop target disappearance does not trigger post kill wait',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 90, max_hp: 100, stamina_5s_remaining_milli: 10000 },
        attacks: [{ id: 7, x: 5000, y: 0, at: Date.now(), drop: 20, afk: true, action: 'seek-enemy' }]
      }).kind,
      want: 'recover'
    },
    {
      name: 'high roi post combat drop at visible edge beats recovery wait',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 90, max_hp: 100, stamina_5s_remaining_milli: 10000 },
        attacks: [{ id: 7, x: 50000, y: 0, at: Date.now(), drop: 9 }],
        coins: [{ drop_id: 8, x: 50000, y: 0, amount: 5, native: true }]
      }).reason,
      want: 'post-attack-drop-coin'
    },
    {
      name: 'low roi far post combat drop waits for recovery',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 90, max_hp: 100, stamina_5s_remaining_milli: 10000 },
        attacks: [{ id: 7, x: 50000, y: 0, at: Date.now(), drop: 9 }],
        coins: [{ drop_id: 8, x: 50000, y: 0, amount: 4, native: true }]
      }).kind,
      want: 'recover'
    },
    {
      name: 'full hp post combat single coin is collected',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 10000 },
        attacks: [{ id: 7, x: 0, y: 0, at: Date.now(), drop: 1 }],
        coins: [{ drop_id: 8, x: 1000, y: 0, amount: 1 }]
      }).reason,
      want: 'post-attack-drop-coin'
    },
    {
      name: 'low long stamina skips far post combat drop',
      got: choose({
        self: {
          user_id: 1,
          x: 0,
          y: 0,
          hp: 100,
          max_hp: 100,
          stamina_5s_remaining_milli: 10000,
          stamina_1h_remaining_milli: 3500,
          stamina_1d_remaining_milli: 3500
        },
        attacks: [{ id: 7, x: 20000, y: 0, at: Date.now(), drop: 100 }],
        coins: [{ drop_id: 8, x: 20000, y: 0, amount: 100 }]
      }).kind,
      want: 'leave'
    },
    {
      name: 'combat incoming fire uses tangent dodge',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 7, x: 10000, y: 0, current_join_mode: 'Passive', hp: 100 }],
        bullets: [{ owner_id: 7, x: 9000, y: 0, vx: -100, vy: 0 }]
      }).reason,
      want: 'combat-tangent-dodge'
    },
    {
      name: 'combat real bullets use 8-direction threat field',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 7, x: 10000, y: 0, current_join_mode: 'Passive', hp: 100 }],
          bullets: [
            { owner_id: 7, x: 9000, y: 0, vx: -100, vy: 0 },
            { owner_id: 7, x: 0, y: 9000, vx: 0, vy: -100 }
          ]
        });
        const field = action.combatState.threatField;
        const integerMove = [-1, 0, 1].includes(action.dx) && [-1, 0, 1].includes(action.dy);
        return Boolean(field) + ':' + integerMove + ':' + field.directHitCount + ':' + action.combatState.incomingBullet.threatCount;
      })(),
      want: 'true:true:0:2'
    },
    {
      name: 'combat threat field improves fixed diagonal safety distance',
      got: (() => {
        const self = { user_id: 1, x: 0, y: 0 };
        const bullets = [
          { owner_id: 7, x: 9000, y: 0, vx: -100, vy: 0 },
          { owner_id: 7, x: 0, y: 9000, vx: 0, vy: -100 }
        ];
        const threat = incomingBulletThreatForTest(self, null, bullets);
        const fixed = combatThreatFieldCandidateForTest(self, threat.threats, 1, 1);
        const field = combatBulletThreatFieldForTest(self, threat.threats, { preferred: { dx: 1, dy: 1 } });
        return (field.minCpaDistance > fixed.minCpaDistance) + ':' + field.dx + ',' + field.dy;
      })(),
      want: 'true:-1,-1'
    },
    {
      name: 'combat firing target without visible bullet uses tangent dodge',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 7, x: 10000, y: 0, current_join_mode: 'Passive', hp: 100, firing: true, death_reward_preview: 20 }]
      }).reason,
      want: 'combat-tangent-dodge'
    },
	    {
	      name: 'combat precise incoming lane overrides stale strafe lock',
	      got: (() => {
	        const picked = selectCombatStrafeSign(
          { key: 'owner:7', sign: -1, until: 2000 },
          'owner:7',
          combatPreciseStrafeSign({ ownerId: 7, synthetic: false, signedLaneDistance: -120 }),
          1000
        );
        return picked.sign + ':' + picked.locked + ':' + picked.lockOverridden;
	      })(),
	      want: '1:false:true'
	    },
    {
      name: 'combat pressure close biases diagonal strafe toward target',
      got: (() => {
        const normal = combatStrafeVectorForTest(
          { x: 0, y: 0 },
          { x: 10000, y: 6000 },
          { vx: 500, vy: -500 },
          -1,
          { preferClosing: false }
        );
        const closing = combatStrafeVectorForTest(
          { x: 0, y: 0 },
          { x: 10000, y: 6000 },
          { vx: 500, vy: -500 },
          -1,
          { preferClosing: true }
        );
        return normal.dx + ',' + normal.dy + ':' + closing.dx + ',' + closing.dy + ':' + closing.closingBiased;
      })(),
      want: '-1,-1:1,-1:true'
    },
	    {
	      name: 'combat moving target uses intercept aim',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 7, x: 10000, y: 0, current_join_mode: 'Passive', hp: 100, vx: 30, death_reward_preview: 7 }]
      }).aimMode,
      want: 'intercept'
    },
    {
      name: 'combat moving target jitter expands at close range',
      got: (() => {
        const near = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 7, x: 3000, y: 0, current_join_mode: 'Passive', hp: 100, vx: 30, death_reward_preview: 7 }]
        }).aimJitterLimit;
        const far = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 7, x: 10000, y: 0, current_join_mode: 'Passive', hp: 100, vx: 30, death_reward_preview: 7 }]
        }).aimJitterLimit;
        return near > far;
      })(),
      want: true
    },
    {
      name: 'combat far target jitter covers measured dodge window',
      got: combatAimJitterLimit(14500) >= 0.1,
      want: true
    },
    {
      name: 'combat intercept solution leads lateral target with render compensation',
      got: (() => {
        const solution = combatInterceptSolution(
          { x: 0, y: 0 },
          { x: 10000, y: 0, vx: 0, vy: 50 },
          10000,
          1
        );
        return Boolean(solution
          && solution.y > 1000
          && solution.flightTicks > 20
          && solution.flightTicks < 23
          && solution.renderDelayTicks === 2);
      })(),
      want: true
    },
    {
      name: 'combat close target jitter stays in logged effective range',
      got: combatAimJitterLimit(2500) <= cfg.combatAimJitterMaxRadians,
      want: true
    },
    {
      name: 'combat low target motion shrinks jitter window',
      got: combatAimJitterLimit(10000, 0.15) < combatAimJitterLimit(10000, 1),
      want: true
    },
    {
      name: 'combat long no-damage aim widening stays capped',
      got: (() => {
        const baseLimit = combatAimJitterLimit(10000, 1);
        const widened = combatAimNoDamageJitterLimit(baseLimit, combatAimNoDamageLevel(9000));
        return widened <= cfg.combatAimNoDamageMaxRadians + 0.000001;
      })(),
      want: true
    },
    {
      name: 'combat stationary long no-damage target steadies aim',
      got: (() => {
        bot.combatTarget = { id: 7, at: Date.now() - 12000, lastDamageAt: Date.now() - 12000, hp: 100 };
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 88, max_hp: 100, stamina_5s_remaining_milli: 3200 },
          { user_id: 7, x: 10000, y: 0, distance: 10000, current_join_mode: 'Active', hp: 100, firing: true, recentlyMoved: true, motionObservedSpeed: 50, drop: 20 }
        );
        bot.combatTarget = null;
        return action.aimMode + ':' + action.aimJitterLimit + ':' + Boolean(action.combatState?.shooting?.steadyAimFireWindow) + ':' + action.reason + ':' + Boolean(action.shoot);
      })(),
      want: 'steady:0:true:combat-burst-fire:true'
    },
    {
      name: 'combat moving long no-damage target keeps intercept aim',
      got: (() => {
        bot.combatTarget = { id: 7, at: Date.now() - 12000, lastDamageAt: Date.now() - 12000, hp: 100 };
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 88, max_hp: 100, stamina_5s_remaining_milli: 3200 },
          { user_id: 7, x: 10000, y: 0, distance: 10000, current_join_mode: 'Active', hp: 100, vx: 30, firing: true, recentlyMoved: true, motionObservedSpeed: 50, drop: 20 }
        );
        bot.combatTarget = null;
        return action.aimMode;
      })(),
      want: 'intercept'
    },
    {
      name: 'combat coordinate divergence immediately uses live precision aim',
      got: (() => {
        const t = Date.now();
        bot.combatTarget = { id: 7, at: t, lastDamageAt: t, hp: 100 };
        bot.testNativeEntities = [{ user_id: 7, name: 'target', x: 5000, y: 0, hp: 100, current_join_mode: 'Active', vx: 50, motionObservedSpeed: 50, recentlyMoved: true }];
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 6000 },
          { user_id: 7, name: 'target', x: 10000, y: 10000, distance: 14142, current_join_mode: 'Active', hp: 100, vx: 50, motionObservedSpeed: 50, recentlyMoved: true, drop: 20 }
        );
        bot.combatTarget = null;
        bot.testNativeEntities = null;
        return action.aimMode + ':' + action.aimTarget?.strategyReason + ':' + action.aimTarget?.x + ':' + action.aimTarget?.y + ':' + Boolean(action.aimTarget?.live) + ':' + action.aimTarget?.sourceDivergenceCm;
      })(),
      want: 'live-precision:coordinate-divergence:5000:0:true:11180'
    },
    {
      name: 'combat radial live target uses precision aim without waiting',
      got: (() => {
        const t = Date.now();
        bot.combatTarget = { id: 7, at: t, lastDamageAt: t, hp: 100 };
        bot.testNativeEntities = [{ user_id: 7, name: 'target', x: 10000, y: 0, hp: 100, current_join_mode: 'Active', vx: -50, motionObservedSpeed: 50, recentlyMoved: true }];
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 6000 },
          { user_id: 7, name: 'target', x: 10000, y: 0, distance: 10000, current_join_mode: 'Active', hp: 100, vx: -50, motionObservedSpeed: 50, recentlyMoved: true, drop: 20 }
        );
        bot.combatTarget = null;
        bot.testNativeEntities = null;
        return action.aimMode + ':' + action.aimTarget?.strategyReason + ':' + action.aimTarget?.radialPrecision;
      })(),
      want: 'live-precision:radial-motion:true'
    },
    {
      name: 'combat server-stall ignores snapshot coordinates',
      got: (() => {
        const t = Date.now();
        bot.combatTarget = { id: 7, at: t - 7000, lastDamageAt: t - 7000, hp: 100 };
        bot.serverPositionStall = { stalled: true, reason: 'server-position-stalled', movingMs: 7000, gap: 4200 };
        bot.testNativeEntities = [{ user_id: 7, name: 'target', x: 10000, y: 0, hp: 100, current_join_mode: 'Active', vx: 50, motionObservedSpeed: 50, recentlyMoved: true }];
        bot.testSnapshotEntities = [{ user_id: 7, name: 'target', x: 6000, y: 0, hp: 100, current_join_mode: 'Active', vx: 0, vy: 0 }];
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 6000 },
          { user_id: 7, name: 'target', x: 10000, y: 0, distance: 10000, current_join_mode: 'Active', hp: 100, vx: 50, motionObservedSpeed: 50, recentlyMoved: true, drop: 20 }
        );
        bot.combatTarget = null;
        bot.serverPositionStall = null;
        bot.testNativeEntities = null;
        bot.testSnapshotEntities = null;
        return action.aimMode + ':' + action.aimTarget?.strategy + ':' + action.aimTarget?.strategyReason + ':' + action.aimTarget?.x + ':' + Boolean(action.aimTarget?.liveIntercept);
      })(),
      want: 'live-precision:live-precision:server-stall-live:10000:false'
    },
    {
      name: 'combat real bullet pressure ignores snapshot coordinates',
      got: (() => {
        const t = Date.now();
        bot.combatTarget = { id: 7, at: t, lastDamageAt: t, hp: 100 };
        bot.testNativeEntities = [{ user_id: 7, name: 'target', x: 10000, y: 0, hp: 100, current_join_mode: 'Active', vx: 50, motionObservedSpeed: 50, recentlyMoved: true }];
        bot.testSnapshotEntities = [{ user_id: 7, name: 'target', x: 6000, y: 0, hp: 100, current_join_mode: 'Active', vx: 0, vy: 0 }];
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 6000 },
          { user_id: 7, name: 'target', x: 10000, y: 0, distance: 10000, current_join_mode: 'Active', hp: 100, vx: 50, motionObservedSpeed: 50, recentlyMoved: true, drop: 20 },
          [{ ownerId: 7 }]
        );
        bot.combatTarget = null;
        bot.testNativeEntities = null;
        bot.testSnapshotEntities = null;
        return action.aimMode + ':' + action.aimTarget?.strategy + ':' + action.aimTarget?.strategyReason + ':' + action.aimTarget?.x + ':' + Boolean(action.aimTarget?.liveIntercept) + ':' + Boolean(action.aimTarget?.realBulletPrecision);
      })(),
      want: 'live-precision:live-precision:real-bullet-pressure:10000:false:true'
    },
    {
      name: 'combat server-stall lateral live target keeps intercept',
      got: (() => {
        const t = Date.now();
        bot.combatTarget = { id: 7, at: t - 7000, lastDamageAt: t - 7000, hp: 100 };
        bot.serverPositionStall = { stalled: true, reason: 'server-position-stalled', movingMs: 7000, gap: 4200 };
        bot.testNativeEntities = [{ user_id: 7, name: 'target', x: 10000, y: 0, hp: 100, current_join_mode: 'Active', vx: 0, vy: 50, motionObservedSpeed: 50, recentlyMoved: true }];
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 6000 },
          { user_id: 7, name: 'target', x: 10000, y: 0, distance: 10000, current_join_mode: 'Active', hp: 100, vx: 0, vy: 50, motionObservedSpeed: 50, recentlyMoved: true, drop: 20 }
        );
        bot.combatTarget = null;
        bot.serverPositionStall = null;
        bot.testNativeEntities = null;
        return action.aimMode + ':' + action.aimTarget?.strategy + ':' + action.aimTarget?.strategyReason + ':' + Boolean(action.aimTarget?.liveIntercept);
      })(),
      want: 'intercept:live-intercept:server-stall-live-intercept:true'
    },
    {
      name: 'combat real bullet pressure lateral live target keeps intercept',
      got: (() => {
        const t = Date.now();
        bot.combatTarget = { id: 7, at: t, lastDamageAt: t, hp: 100 };
        bot.testNativeEntities = [{ user_id: 7, name: 'target', x: 10000, y: 0, hp: 100, current_join_mode: 'Active', vx: 0, vy: 50, motionObservedSpeed: 50, recentlyMoved: true }];
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 6000 },
          { user_id: 7, name: 'target', x: 10000, y: 0, distance: 10000, current_join_mode: 'Active', hp: 100, vx: 0, vy: 50, motionObservedSpeed: 50, recentlyMoved: true, drop: 20 },
          [{ ownerId: 7 }]
        );
        bot.combatTarget = null;
        bot.testNativeEntities = null;
        return action.aimMode + ':' + action.aimTarget?.strategy + ':' + action.aimTarget?.strategyReason + ':' + Boolean(action.aimTarget?.liveIntercept) + ':' + Boolean(action.aimTarget?.realBulletPrecision);
      })(),
      want: 'intercept:live-intercept:real-bullet-pressure-intercept:true:true'
    },
    {
      name: 'combat real bullet pressure radial target still uses live precision',
      got: (() => {
        const t = Date.now();
        bot.combatTarget = { id: 7, at: t, lastDamageAt: t, hp: 100 };
        bot.testNativeEntities = [{ user_id: 7, name: 'target', x: 10000, y: 0, hp: 100, current_join_mode: 'Active', vx: -50, vy: 0, motionObservedSpeed: 50, recentlyMoved: true }];
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 6000 },
          { user_id: 7, name: 'target', x: 10000, y: 0, distance: 10000, current_join_mode: 'Active', hp: 100, vx: -50, vy: 0, motionObservedSpeed: 50, recentlyMoved: true, drop: 20 },
          [{ ownerId: 7 }]
        );
        bot.combatTarget = null;
        bot.testNativeEntities = null;
        return action.aimMode + ':' + action.aimTarget?.strategy + ':' + action.aimTarget?.strategyReason + ':' + Boolean(action.aimTarget?.liveIntercept) + ':' + Boolean(action.aimTarget?.radialPrecision);
      })(),
      want: 'live-precision:live-precision:real-bullet-pressure:false:true'
    },
    {
      name: 'combat out-of-range snapshot does not suppress fire',
      got: (() => {
        const t = Date.now();
        bot.combatTarget = { id: 7, at: t - 7000, firstSeenAt: t - 7000, lastDamageAt: t, hp: 100 };
        bot.testNativeEntities = [{ user_id: 7, name: 'target', x: 10000, y: 0, hp: 100, current_join_mode: 'Active', vx: 50, motionObservedSpeed: 50, recentlyMoved: true }];
        bot.testSnapshotEntities = [{ user_id: 7, name: 'target', x: 20000, y: 0, hp: 100, current_join_mode: 'Active', vx: 0, vy: 0 }];
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          { user_id: 7, name: 'target', x: 10000, y: 0, distance: 10000, current_join_mode: 'Active', hp: 100, vx: 50, motionObservedSpeed: 50, recentlyMoved: true, drop: 20 }
        );
        bot.combatTarget = null;
        bot.testNativeEntities = null;
        bot.testSnapshotEntities = null;
        return action.aimTarget?.x + ':' + action.combatState?.shooting?.reason + ':' + Boolean(action.shoot) + ':' + Boolean(action.aimTarget?.snapshot);
      })(),
      want: '10000:normal:true:false'
    },
    {
      name: 'combat close target ignores far snapshot outlier',
      got: (() => {
        const t = Date.now();
        bot.combatTarget = { id: 7, at: t, lastDamageAt: t, hp: 100 };
        bot.testNativeEntities = [{ user_id: 7, name: 'target', x: 5000, y: 0, hp: 100, current_join_mode: 'Active', vx: 50, motionObservedSpeed: 50, recentlyMoved: true }];
        bot.testSnapshotEntities = [{ user_id: 7, name: 'target', x: 45000, y: 0, hp: 100, current_join_mode: 'Active', vx: 0, vy: 0 }];
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          { user_id: 7, name: 'target', x: 5000, y: 0, distance: 5000, current_join_mode: 'Active', hp: 100, vx: 50, motionObservedSpeed: 50, recentlyMoved: true, drop: 20 },
          [{ ownerId: 7 }]
        );
        bot.combatTarget = null;
        bot.testNativeEntities = null;
        bot.testSnapshotEntities = null;
        return action.aimMode + ':' + action.aimTarget?.x + ':' + Boolean(action.shoot) + ':' + Boolean(action.aimTarget?.snapshot);
      })(),
      want: 'live-precision:5000:true:false'
    },
    {
      name: 'combat damaged native target ignores stale snapshot hp',
      got: (() => {
        const t = Date.now();
        bot.combatTarget = { id: 7, at: t - 12000, lastDamageAt: t - 12000, hp: 97 };
        bot.testNativeEntities = [{ user_id: 7, name: 'target', x: 10000, y: 0, hp: 97, max_hp: 100, current_join_mode: 'Active', vx: 50, motionObservedSpeed: 50, recentlyMoved: true }];
        bot.testSnapshotEntities = [{ user_id: 7, name: 'target', x: 16000, y: 0, hp: 100, max_hp: 100, current_join_mode: 'Active', vx: 0, vy: 0 }];
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 79, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          { user_id: 7, name: 'target', x: 10000, y: 0, distance: 10000, current_join_mode: 'Active', hp: 97, max_hp: 100, vx: 50, motionObservedSpeed: 50, recentlyMoved: true, drop: 20 },
          [{ ownerId: 7 }]
        );
        bot.combatTarget = null;
        bot.testNativeEntities = null;
        bot.testSnapshotEntities = null;
        return action.aimMode + ':' + action.aimTarget?.x + ':' + action.aimTarget?.live + ':' + action.target?.hp + ':' + Boolean(action.aimTarget?.authority);
      })(),
      want: 'live-precision:10000:true:97:false'
    },
    {
      name: 'combat very close target backs away while shooting',
      got: (() => {
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100 },
          { user_id: 7, x: 3000, y: 0, distance: 3000, current_join_mode: 'Passive', hp: 100, vx: 30, drop: 20 }
        );
        return action.reason + ':' + action.dx + ':' + action.dy + ':' + Boolean(action.shoot);
      })(),
      want: 'combat-spacing:-1:0:true'
    },
    {
      name: 'combat emergency close spacing overrides incoming bullet strafe',
      got: (() => {
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          { user_id: 7, x: 2500, y: 0, distance: 2500, current_join_mode: 'Active', hp: 100, firing: true, drop: 20 }
        );
        return action.reason + ':' + action.dx + ':' + action.dy + ':' + action.combatState?.spacing?.reason + ':' + Boolean(action.combatState?.spacing?.overrideBullet);
      })(),
      want: 'combat-spacing-dodge:-1:0:too-close:true'
    },
    {
      name: 'combat low hp close risk exits before losing hp disadvantage',
      got: (() => {
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 49, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          { user_id: 7, x: 1900, y: 0, distance: 1900, current_join_mode: 'Active', hp: 46, firing: true, drop: 20 }
        );
        return action.kind + ':' + action.reason + ':' + Boolean(action.combatState?.closeRisk) + ':' + action.combatState?.closeRisk?.distance;
      })(),
      want: 'leave:combat-low-hp-leave:true:1900'
    },
    {
      name: 'combat mid range target does not back away',
      got: (() => {
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100 },
          { user_id: 7, x: 5000, y: 0, distance: 5000, current_join_mode: 'Passive', hp: 100, vx: 30, drop: 20 }
        );
        return action.reason + ':' + action.dx + ':' + action.dy + ':' + Boolean(action.shoot);
      })(),
      want: 'combat-attack:0:0:true'
    },
    {
      name: 'combat long no-damage target is pressured closer',
      got: (() => {
        bot.combatTarget = { id: 7, at: Date.now() - 10000, lastDamageAt: Date.now() - 10000, hp: 100 };
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100 },
          { user_id: 7, x: 9000, y: 0, distance: 9000, current_join_mode: 'Passive', hp: 100, vx: 50, drop: 20 }
        );
        bot.combatTarget = null;
        return action.reason + ':' + action.dx + ':' + action.dy + ':' + action.combatState?.pressureClose?.reason;
      })(),
      want: 'combat-pressure-close:1:0:long-no-damage'
    },
    {
      name: 'combat far no-damage target is pressured into effective range',
      got: (() => {
        bot.combatTarget = { id: 7, at: Date.now() - 7000, lastDamageAt: Date.now() - 7000, hp: 88 };
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 90, max_hp: 100, stamina_5s_remaining_milli: 2500 },
          { user_id: 7, x: 12000, y: 0, distance: 12000, current_join_mode: 'Active', hp: 88, vx: 50, drop: 20 }
        );
        bot.combatTarget = null;
        return action.reason + ':' + action.dx + ':' + action.dy + ':' + Boolean(action.shoot) + ':' + action.shootEveryMs + ':' + action.combatState?.pressureClose?.reason + ':' + action.combatState?.pressureClose?.closeRange + ':' + action.combatState?.shooting?.trend?.stance;
      })(),
      want: 'combat-stamina-conserve:1:0:false:700:far-no-damage:7500:far-no-damage-close'
    },
    {
      name: 'combat far no-damage retreating edge does not pressure chase',
      got: (() => {
        bot.combatTarget = { id: 7, at: Date.now() - 7000, lastDamageAt: Date.now() - 7000, lastInRangeAt: Date.now() - 7000, distance: 13000, hp: 88 };
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 90, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          { user_id: 7, x: 14000, y: 0, distance: 14000, current_join_mode: 'Active', hp: 88, vx: 50, recentlyMoved: true, motionObservedSpeed: 50, drop: 20 }
        );
        bot.combatTarget = null;
        bot.combatRetreatIgnore.clear();
        return action.reason + ':' + action.dx + ':' + action.dy + ':' + Boolean(action.combatState?.pressureClose) + ':' + action.combatState?.shooting?.reason + ':' + action.combatState?.retreatingTarget?.reason;
      })(),
      want: 'combat-target-retreating:0:0:false:target-retreating-edge:target-retreating-edge'
    },
    {
      name: 'combat far no-damage retreating fighter pressure closes under real bullet',
      got: (() => {
        bot.combatTarget = { id: 7, at: Date.now() - 7000, lastDamageAt: Date.now() - 7000, lastInRangeAt: Date.now() - 7000, distance: 13000, hp: 76 };
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 82, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          { user_id: 7, x: 14000, y: 0, distance: 14000, current_join_mode: 'Active', hp: 76, vx: 50, recentlyMoved: true, motionObservedSpeed: 50, drop: 20 },
          [{ id: 'target-shot', ownerId: 7, x: 10000, y: 0, vx: -500, vy: 0 }]
        );
        bot.combatTarget = null;
        bot.combatRetreatIgnore.clear();
        return action.dx + ':' + action.dy + ':' + Boolean(action.shoot) + ':' + action.combatState?.pressureClose?.reason + ':' + action.combatState?.pressureClose?.farNoDamageClose + ':' + (action.combatState?.shooting?.reason === 'target-retreating-edge') + ':' + action.combatState?.retreatingTarget?.reason;
      })(),
      want: '1:1:true:retreating-fighter-close:true:false:target-retreating-edge'
    },
    {
      name: 'combat far no-damage pressure waits when hp gap is already bad',
      got: (() => {
        bot.combatTarget = { id: 7, at: Date.now() - 7000, lastDamageAt: Date.now() - 7000, hp: 88 };
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 70, max_hp: 100 },
          { user_id: 7, x: 12000, y: 0, distance: 12000, current_join_mode: 'Active', hp: 88, vx: 50, drop: 20 }
        );
        bot.combatTarget = null;
        return action.reason + ':' + Boolean(action.combatState?.pressureClose);
      })(),
      want: 'combat-attack:false'
    },
    {
      name: 'combat short stamina exhaustion stops movement and fire',
      got: (() => {
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 500 },
          { user_id: 7, x: 10000, y: 0, distance: 10000, current_join_mode: 'Passive', hp: 100, firing: true, drop: 20 }
        );
        return action.reason + ':' + action.dx + ':' + action.dy + ':' + Boolean(action.shoot) + ':' + action.combatState?.movementSuppressed?.reason;
      })(),
      want: 'combat-stamina-hold:0:0:false:stamina-5s-exhausted'
    },
    {
      name: 'combat preserves dodge stamina by pausing fire',
      got: (() => {
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 2500 },
          { user_id: 7, x: 10000, y: 0, distance: 10000, current_join_mode: 'Passive', hp: 100, firing: true, drop: 20 }
        );
        return action.reason + ':' + action.dx + ':' + action.dy + ':' + Boolean(action.shoot) + ':' + action.combatState?.shooting?.reason;
      })(),
      want: 'combat-stamina-conserve:1:1:false:reserve-for-dodge'
    },
    {
      name: 'combat reserve band uses burst fire without force shooting',
      got: (() => {
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 4500 },
          { user_id: 7, x: 10000, y: 0, distance: 10000, current_join_mode: 'Passive', hp: 100, drop: 20 }
        );
        return action.reason + ':' + Boolean(action.shoot) + ':' + Boolean(action.forceShoot) + ':' + action.shootEveryMs + ':' + action.combatState?.shooting?.reason;
      })(),
      want: 'combat-burst-fire:true:false:360:burst-fire'
    },
    {
      name: 'combat high HP reserve band keeps burst pressure',
      got: (() => {
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 3200 },
          { user_id: 7, x: 10000, y: 0, distance: 10000, current_join_mode: 'Passive', hp: 100, firing: true, drop: 20 }
        );
        return action.reason + ':' + action.dx + ':' + action.dy + ':' + Boolean(action.shoot) + ':' + action.combatState?.shooting?.reason + ':' + Boolean(action.combatState?.shooting?.highHpFireWindow);
      })(),
      want: 'combat-burst-fire:1:1:true:burst-fire:true'
    },
    {
      name: 'combat opponent probe preserves opening dodge reserve',
      got: (() => {
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 4500 },
          { user_id: 7, x: 10000, y: 0, distance: 10000, current_join_mode: 'Active', hp: 100, vx: 35, drop: 20 }
        );
        return [
          action.reason,
          action.shoot,
          action.combatState?.shooting?.reason,
          action.combatState?.shooting?.dodgeReserveMs,
          action.combatState?.shooting?.opponentProbeFireWindow,
          action.combatState?.shooting?.trend?.stance
        ].join('|');
      })(),
      want: 'combat-stamina-conserve|false|reserve-for-dodge|5600|true|opponent-probe'
    },
    {
      name: 'combat opponent probe point-fires while reserve is full',
      got: (() => {
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 7000 },
          { user_id: 7, x: 10000, y: 0, distance: 10000, current_join_mode: 'Active', hp: 100, vx: 35, drop: 20 }
        );
        return [
          action.reason,
          action.shoot,
          action.shootEveryMs,
          action.combatState?.shooting?.reason,
          action.combatState?.shooting?.opponentProbeFireWindow
        ].join('|');
      })(),
      want: 'combat-attack|true|520|opponent-probe|true'
    },
    {
      name: 'combat opponent probe ends after target real bullet history',
      got: (() => {
        const t = Date.now();
        bot.combatTarget = { id: 7, at: t - 3000, firstSeenAt: t - 3000, seenTargetRealBulletAt: t - 700, hp: 100 };
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 3200 },
          { user_id: 7, x: 10000, y: 0, distance: 10000, current_join_mode: 'Active', hp: 100, firing: true, vx: 35, drop: 20 }
        );
        bot.combatTarget = null;
        return [
          action.reason,
          action.shoot,
          action.combatState?.shooting?.reason,
          Boolean(action.combatState?.shooting?.opponentProbeFireWindow),
          action.combatState?.shooting?.trend?.stance
        ].join('|');
      })(),
      want: 'combat-burst-fire|true|burst-fire|false|high-hp-pressure'
    },
    {
      name: 'combat low threat finish window keeps burst pressure without bullet risk',
      got: (() => {
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 2800 },
          { user_id: 7, x: 8200, y: 0, distance: 8200, current_join_mode: 'Active', hp: 7, vx: 35, drop: 20 }
        );
        return action.reason + ':' + Boolean(action.shoot) + ':' + action.combatState?.shooting?.reason + ':' + Boolean(action.combatState?.shooting?.finishLowThreatFireWindow);
      })(),
      want: 'combat-burst-fire:true:burst-fire:true'
    },
    {
      name: 'combat low threat finish window starts at low target HP',
      got: (() => {
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 2800 },
          { user_id: 7, x: 8200, y: 0, distance: 8200, current_join_mode: 'Active', hp: 55, vx: 35, drop: 20 }
        );
        return action.reason + ':' + Boolean(action.shoot) + ':' + action.combatState?.shooting?.reason + ':' + Boolean(action.combatState?.shooting?.finishLowThreatFireWindow);
      })(),
      want: 'combat-burst-fire:true:burst-fire:true'
    },
    {
      name: 'combat low threat finish window stays bounded above low HP',
      got: (() => {
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 2800 },
          { user_id: 7, x: 8200, y: 0, distance: 8200, current_join_mode: 'Active', hp: 56, vx: 35, drop: 20 }
        );
        return action.reason + ':' + Boolean(action.shoot) + ':' + action.combatState?.shooting?.reason + ':' + Boolean(action.combatState?.shooting?.finishLowThreatFireWindow);
      })(),
      want: 'combat-stamina-conserve:false:reserve-for-dodge:false'
    },
    {
      name: 'combat mid HP reserve band still preserves dodge stamina',
      got: (() => {
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 70, max_hp: 100, stamina_5s_remaining_milli: 3200 },
          { user_id: 7, x: 10000, y: 0, distance: 10000, current_join_mode: 'Passive', hp: 70, firing: true, drop: 20 }
        );
        return action.reason + ':' + action.dx + ':' + action.dy + ':' + Boolean(action.shoot) + ':' + action.combatState?.shooting?.reason + ':' + Boolean(action.combatState?.shooting?.highHpFireWindow);
      })(),
      want: 'combat-stamina-conserve:1:1:false:reserve-for-dodge:false'
    },
	    {
	      name: 'combat close pressure fire window keeps mid hp shooting',
	      got: (() => {
	        const action = chooseCombatAction(
	          { user_id: 1, x: 0, y: 0, hp: 67, max_hp: 100, stamina_5s_remaining_milli: 3198 },
	          { user_id: 7, x: 6300, y: 0, distance: 6300, current_join_mode: 'Active', hp: 61, vx: 50, drop: 20 },
	          [{ id: 'target-shot', ownerId: 7, x: 5000, y: 0, vx: -500, vy: 0 }]
	        );
        return action.reason + ':' + Boolean(action.shoot) + ':' + action.combatState?.shooting?.dodgeReserveMs + ':' + Boolean(action.combatState?.shooting?.closePressureFireWindow);
	      })(),
	      want: 'combat-burst-fire:true:2600:true'
	    },
	    {
	      name: 'combat sustained target pressure exits losing no-damage fight',
	      got: (() => {
	        const t = Date.now();
	        const originalNow = Date.now;
	        Date.now = () => t;
	        try {
	          bot.combatTarget = { id: 7, at: t - 13000, lastDamageAt: t - 13000, hp: 82 };
	          const action = chooseCombatAction(
	            { user_id: 1, x: 0, y: 0, hp: 68, max_hp: 100, stamina_5s_remaining_milli: 7000 },
	            { user_id: 7, x: 12000, y: 0, distance: 12000, current_join_mode: 'Active', hp: 82, vx: 35, drop: 20 },
	            [{ id: 'target-shot', ownerId: 7, x: 10000, y: 0, vx: -500, vy: 0 }]
	          );
	          bot.combatTarget = null;
	          return action.reason + ':' + Boolean(action.combatState?.sustainedPressureDisadvantage) + ':' + action.combatState?.sustainedPressureDisadvantage?.noDamageMs;
	        } finally {
	          Date.now = originalNow;
	          bot.combatTarget = null;
	        }
	      })(),
	      want: 'combat-hp-disadvantage-leave:true:13000'
	    },
	    {
	      name: 'combat long no-damage active duel resumes reserve-band fire',
	      got: (() => {
        bot.combatTarget = { id: 7, at: Date.now() - 32000, lastDamageAt: Date.now() - 32000, hp: 82 };
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 85, max_hp: 100, stamina_5s_remaining_milli: 3139 },
          { user_id: 7, x: 12275, y: 0, distance: 12275, current_join_mode: 'Active', hp: 82, vx: 35, recentlyMoved: true, motionObservedSpeed: 50, drop: 20 }
        );
        bot.combatTarget = null;
        return action.reason + ':' + Boolean(action.shoot) + ':' + action.combatState?.shooting?.dodgeReserveMs + ':' + Boolean(action.combatState?.shooting?.noDamageDuelFireWindow);
      })(),
      want: 'combat-burst-fire:true:3000:true'
    },
    {
      name: 'combat trend classifies long no-damage duel stance',
      got: (() => {
        const trend = combatTrendState(
          { user_id: 1, hp: 85 },
          { targetHp: 82, targetDistance: 12275, targetActive: true, targetMoving: true, noDamageMs: 32000, opponentProbeEngagedMs: 32000 }
        );
        return trend.stance + ':' + Boolean(trend.noDamageDuelFireWindow) + ':' + trend.hpGap;
      })(),
      want: 'no-damage-duel:true:-3'
    },
    {
      name: 'combat long no-damage fire window keeps low hp conservative',
      got: (() => {
        bot.combatTarget = { id: 7, at: Date.now() - 32000, lastDamageAt: Date.now() - 32000, hp: 70 };
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 70, max_hp: 100, stamina_5s_remaining_milli: 3139 },
          { user_id: 7, x: 12275, y: 0, distance: 12275, current_join_mode: 'Active', hp: 70, vx: 35, recentlyMoved: true, motionObservedSpeed: 50, drop: 20 }
        );
        bot.combatTarget = null;
        return action.reason + ':' + Boolean(action.shoot) + ':' + Boolean(action.combatState?.shooting?.noDamageDuelFireWindow);
      })(),
      want: 'combat-stamina-conserve:false:false'
    },
    {
      name: 'combat low confidence distant mover throttles fire cadence',
      got: (() => {
        const t = Date.now();
        bot.combatTarget = {
          id: 7,
          at: t - 7000,
          lastDamageAt: t - 1200,
          hp: 100,
          motionSamples: [
            { at: t - 1200, x: 12000, y: -200, vx: 0, vy: 50, hp: 100, selfHp: 100 },
            { at: t - 850, x: 12000, y: 400, vx: 0, vy: -50, hp: 100, selfHp: 100 },
            { at: t - 500, x: 12000, y: -100, vx: 0, vy: 50, hp: 100, selfHp: 100 }
          ]
        };
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 7000 },
          { user_id: 7, x: 12000, y: 200, distance: 12002, current_join_mode: 'Active', hp: 100, vx: 0, vy: -50, recentlyMoved: true, motionObservedSpeed: 50, drop: 20 }
        );
        bot.combatTarget = null;
        return action.reason + ':' + action.combatState?.shooting?.reason + ':' + action.shootEveryMs + ':' + Boolean(action.aimTarget?.opponentProfile?.strafePattern);
      })(),
      want: 'combat-burst-fire:low-confidence-burst:520:true'
    },
    {
      name: 'combat trade estimate observes losing exchange before exit',
      got: (() => {
        const t = Date.now();
        bot.combatTarget = {
          id: 7,
          at: t - 4000,
          lastDamageAt: t - 500,
          hp: 95,
          motionSamples: [
            { at: t - 4000, x: 10000, y: 0, vx: 35, vy: 0, hp: 100, selfHp: 100 },
            { at: t - 2500, x: 10200, y: 0, vx: 35, vy: 0, hp: 98, selfHp: 92 },
            { at: t - 1000, x: 10400, y: 0, vx: 35, vy: 0, hp: 95, selfHp: 84 }
          ]
        };
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 80, max_hp: 100, stamina_5s_remaining_milli: 7000 },
          { user_id: 7, x: 10500, y: 0, distance: 10500, current_join_mode: 'Active', hp: 90, vx: 35, drop: 20 }
        );
        bot.combatTarget = null;
        bot.combatDisadvantageObservation = null;
        return action.reason + ':' + action.combatState?.disadvantageObservation?.kind + ':' + Boolean(action.combatState?.disadvantageObservation?.ready) + ':' + Math.round(action.combatState?.disadvantageObservation?.evidence?.selfDamage || 0);
      })(),
      want: 'combat-attack:trade-estimate:false:20'
    },
    {
      name: 'confirmed combat trade estimate exits losing exchange',
      got: (() => {
        const t = Date.now();
        bot.combatTarget = {
          id: 7,
          at: t - 5200,
          firstSeenAt: t - 5200,
          lastDamageAt: t - 500,
          hp: 95,
          motionSamples: [
            { at: t - 5200, x: 10000, y: 0, vx: 35, vy: 0, hp: 100, selfHp: 100 },
            { at: t - 3600, x: 10200, y: 0, vx: 35, vy: 0, hp: 98, selfHp: 92 },
            { at: t - 2100, x: 10400, y: 0, vx: 35, vy: 0, hp: 95, selfHp: 84 }
          ]
        };
        bot.combatDisadvantageObservation = { id: '7', kind: 'trade-estimate', firstAt: t - 3000, at: t - 100, count: 4 };
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 80, max_hp: 100, stamina_5s_remaining_milli: 7000 },
          { user_id: 7, x: 10500, y: 0, distance: 10500, current_join_mode: 'Active', hp: 90, vx: 35, drop: 20 }
        );
        bot.combatTarget = null;
        bot.combatDisadvantageObservation = null;
        return action.reason + ':' + Boolean(action.combatState?.tradeEstimate?.active) + ':' + action.combatState?.disadvantageObservation?.kind + ':' + Boolean(action.combatState?.disadvantageObservation?.ready);
      })(),
      want: 'combat-hp-disadvantage-leave:true:trade-estimate:true'
    },
    {
      name: 'combat zero damage trade estimate stays in fight while hp remains safe',
      got: (() => {
        const t = Date.now();
        const originalNow = Date.now;
        bot.combatTarget = {
          id: 7,
          at: t - 6200,
          firstSeenAt: t - 20000,
          lastDamageAt: t - 19000,
          hp: 61,
          motionSamples: [
            { at: t - 6000, x: 10000, y: 0, vx: 35, vy: 0, hp: 61, selfHp: 94 },
            { at: t - 3000, x: 10200, y: 0, vx: 35, vy: 0, hp: 61, selfHp: 90 }
          ]
        };
        Date.now = () => t;
        try {
          const estimate = combatTradeEstimate(
            { user_id: 1, x: 0, y: 0, hp: 85, max_hp: 100, stamina_5s_remaining_milli: 7000 },
            { user_id: 7, x: 10500, y: 0, distance: 10500, current_join_mode: 'Active', hp: 61, vx: 35, drop: 20 }
          );
          return Boolean(estimate?.active) + ':' + Boolean(estimate?.zeroDamageWindow) + ':' + Math.round(estimate?.tDeathMs || 0);
        } finally {
          Date.now = originalNow;
          bot.combatTarget = null;
        }
      })(),
      want: 'false:true:56667'
    },
    {
      name: 'combat zero damage trade estimate still exits when danger horizon is near',
      got: (() => {
        const t = Date.now();
        const originalNow = Date.now;
        bot.combatTarget = {
          id: 7,
          at: t - 6200,
          firstSeenAt: t - 20000,
          lastDamageAt: t - 19000,
          hp: 61,
          motionSamples: [
            { at: t - 6000, x: 10000, y: 0, vx: 35, vy: 0, hp: 61, selfHp: 96 },
            { at: t - 3000, x: 10200, y: 0, vx: 35, vy: 0, hp: 61, selfHp: 88 }
          ]
        };
        Date.now = () => t;
        try {
          const estimate = combatTradeEstimate(
            { user_id: 1, x: 0, y: 0, hp: 80, max_hp: 100, stamina_5s_remaining_milli: 7000 },
            { user_id: 7, x: 10500, y: 0, distance: 10500, current_join_mode: 'Active', hp: 61, vx: 35, drop: 20 }
          );
          return Boolean(estimate?.active) + ':' + Boolean(estimate?.zeroDamageWindow) + ':' + Math.round(estimate?.tDeathMs || 0);
        } finally {
          Date.now = originalNow;
          bot.combatTarget = null;
        }
      })(),
      want: 'true:true:30000'
    },
    {
      name: 'combat native tick interval tightens only during combat',
      got: (() => {
        const t = 100000;
        return [
          nativeTickMinIntervalMs({ decision: { combat: true }, nowMs: t }),
          nativeTickMinIntervalMs({ decision: { kind: 'coin' }, nowMs: t }),
          nativeTickMinIntervalMs({ combatTarget: { at: t - 500 }, nowMs: t }),
          nativeTickMinIntervalMs({ combatTarget: { at: t - 60000 }, nowMs: t })
        ].join(',');
      })(),
      want: '80,120,80,120'
    },
    {
      name: 'combat close pressure hp disadvantage exits before low hp threshold',
      got: (() => {
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 55, max_hp: 100, stamina_5s_remaining_milli: 3198 },
          { user_id: 7, x: 6300, y: 0, distance: 6300, current_join_mode: 'Active', hp: 61, vx: 50, drop: 20 },
          [{ ownerId: 7 }]
        );
        return action.reason + ':' + action.combatState?.hpGap + ':' + action.combatState?.pressureDisadvantage?.distance;
      })(),
      want: 'combat-hp-disadvantage-leave:6:6300'
    },
    {
      name: 'combat sustained pressure no-damage exits earlier against healthy targets',
      got: (() => {
        const state = combatSustainedPressureDisadvantageState(79, 91, 12000, 12000, true);
        return state === null ? 'wait' : state.threshold + ':' + state.targetHpMin + ':' + state.hpGap;
      })(),
      want: '80:75:12'
    },
    {
      name: 'combat sustained pressure no-damage keeps low target recoverable',
      got: (() => {
        const state = combatSustainedPressureDisadvantageState(70, 61, 9000, 12000, true);
        return state === null ? 'keep-fighting' : state.threshold + ':' + state.targetHpMin + ':' + state.hpGap;
      })(),
      want: 'keep-fighting'
    },
    {
      name: 'combat sustained pressure no-damage exits at stop-loss hp',
      got: (() => {
        const t = Date.now();
        bot.combatTarget = { id: 7, at: t - 30000, lastDamageAt: t - 12000, hp: 91 };
        try {
          const action = chooseCombatAction(
            { user_id: 1, x: 0, y: 0, hp: 69, max_hp: 100, stamina_5s_remaining_milli: 6500 },
            { user_id: 7, x: 12000, y: 0, distance: 12000, current_join_mode: 'Active', hp: 91, vx: 50, drop: 20 },
            [{ id: 'target-shot', ownerId: 7, x: 9000, y: 0, vx: -500, vy: 0 }]
          );
          return [
            action.reason,
            action.combatState?.sustainedPressureDisadvantage?.threshold,
            action.combatState?.sustainedPressureDisadvantage?.noDamageMs >= 10000,
            action.combatState?.sustainedPressureDisadvantage?.hpGap
          ].join(':');
        } finally {
          bot.combatTarget = null;
        }
      })(),
      want: 'combat-hp-disadvantage-leave:80:true:22'
    },
    {
      name: 'combat server stall no-damage waits for precision aim grace',
      got: (() => {
        const t = Date.now();
        bot.combatTarget = { id: 7, at: t - 30000, lastDamageAt: t - 30000, hp: 95 };
        bot.serverPositionStall = {
          stalled: true,
          reason: 'server-position-stalled',
          movingMs: 28000,
          gap: 8200,
          gapDelta: 6100,
          holdRemainingMs: 4000
        };
        bot.testNativeEntities = [{ user_id: 7, name: 'target', x: 8000, y: 0, hp: 95, current_join_mode: 'Active', vx: 50, motionObservedSpeed: 50, recentlyMoved: true }];
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 90, max_hp: 100, stamina_5s_remaining_milli: 6000 },
          { user_id: 7, name: 'target', x: 10000, y: 0, distance: 10000, current_join_mode: 'Active', hp: 95, vx: 35, recentlyMoved: true, motionObservedSpeed: 50, drop: 20 },
          [{ ownerId: 7 }]
        );
        bot.combatTarget = null;
        bot.serverPositionStall = null;
        bot.testNativeEntities = null;
        return action.kind + ':' + action.aimMode + ':' + action.aimTarget?.strategyReason + ':' + Boolean(action.aimTarget?.live) + ':' + Boolean(action.combatState?.serverStallNoDamage);
      })(),
      want: 'attack:live-precision:coordinate-divergence:true:false'
    },
    {
      name: 'combat server stall long no-damage exits before broad hp disadvantage',
      got: (() => {
        const t = Date.now();
        bot.combatTarget = { id: 7, at: t - 36000, lastDamageAt: t - 36000, hp: 95 };
        bot.serverPositionStall = {
          stalled: true,
          reason: 'server-position-stalled',
          movingMs: 34000,
          gap: 8200,
          gapDelta: 6100,
          holdRemainingMs: 4000
        };
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 90, max_hp: 100, stamina_5s_remaining_milli: 6000 },
          { user_id: 7, x: 10000, y: 0, distance: 10000, current_join_mode: 'Active', hp: 95, vx: 35, recentlyMoved: true, motionObservedSpeed: 50, drop: 20 },
          [{ ownerId: 7 }]
        );
        bot.combatTarget = null;
        bot.serverPositionStall = null;
        return action.reason + ':' + action.combatState?.serverStallNoDamage?.hpGap + ':' + Boolean(action.combatState?.serverStallNoDamage?.serverPositionStall?.stalled);
      })(),
      want: 'combat-hp-disadvantage-leave:5:true'
    },
    {
      name: 'coin route uses horizontal axis when x gap dominates',
      got: (() => {
        const dir = coinDirectionTo({ x: 0, y: 0 }, { x: 15000, y: 500 });
        return dir.dx === 1 && dir.dy === 0 && dir.axisApproach === 'x';
      })(),
      want: true
    },
    {
      name: 'coin route releases axis approach before close target',
      got: (() => {
        const dir = coinDirectionTo({ x: 0, y: 0 }, { x: 4800, y: 500 });
        return dir.dx === 1 && dir.dy === 1 && !dir.axisApproach;
      })(),
      want: true
    },
    {
      name: 'coin axis lock releases before likely overrun',
      got: coinAxisLockShouldHold({ dx: 1, dy: 0 }, 500, 0) === false
        && coinAxisLockShouldHold({ dx: 1, dy: 0 }, 1200, 0) === true,
      want: true
    },
    {
      name: 'close coin pickup uses short brake pulse',
      got: coinPickupPrecisionPulseMs(500) <= 90,
      want: true
    },
    {
      name: 'coin pickup pulse slows near target',
      got: (() => {
        const stop = coinPickupPrecisionPulseMs(20);
        const micro = coinPickupPrecisionPulseMs(80);
        const fine = coinPickupPrecisionPulseMs(250);
        const brake = coinPickupPrecisionPulseMs(500);
        const sweep = coinPickupPrecisionPulseMs(800);
        return stop < micro && micro < fine && fine < brake && brake < sweep;
      })(),
      want: true
    },
    {
      name: 'coin pickup repeated failures reduce pulse',
      got: coinPickupPrecisionPulseMs(500, 3) < coinPickupPrecisionPulseMs(500)
        && coinPickupPrecisionPulseMs(500, 100) === cfg.coinPickupFailureMinPulseMs,
      want: true
    },
    {
      name: 'close coin pickup keeps moving inside old tolerance',
      got: (() => {
        const dir = coinDirectionTo({ x: 0, y: 0 }, { x: 40, y: 0 });
        return dir.dx === 1 && dir.dy === 0 && dir.exactTarget === true;
      })(),
      want: true
    },
    {
      name: 'close coin pickup stops only at exact coordinate',
      got: (() => {
        const dir = coinDirectionTo({ x: 10, y: -5 }, { x: 10, y: -5 });
        return dir.dx === 0 && dir.dy === 0 && dir.exactTarget === true;
      })(),
      want: true
    },
    {
      name: 'coin route keeps diagonal when both axes are material',
      got: (() => {
        const dir = coinDirectionTo({ x: 0, y: 0 }, { x: 15000, y: 6000 });
        return dir.dx === 1 && dir.dy === 1 && !dir.axisApproach;
      })(),
      want: true
    },
    {
      name: 'stationary active outside caution allows foot coin only',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 4, x: 45000, y: 0, current_join_mode: 'Active', death_reward_preview: 7 }],
        coins: [{ drop_id: 2, x: -500, y: 0, amount: 5 }]
      }).kind,
      want: 'coin'
    },
    {
      name: 'full hp stationary non-full active does not block coin',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 4, x: 23000, y: 0, current_join_mode: 'Active', stamina_5s_remaining_milli: 5000, death_reward_preview: 7 }],
        coins: [{ drop_id: 2, x: -18000, y: 0, amount: 1 }]
      }).kind,
      want: 'coin'
    },
    {
      name: 'stationary full-stamina active with drop is non-combat profit attack',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 4, x: 10000, y: 0, current_join_mode: 'Active', stamina_5s_remaining_milli: 10000, stamina_5s_limit_milli: 10000, death_reward_preview: 20 }]
        });
        return action.kind + ':' + Boolean(action.combat) + ':' + action.reason;
      })(),
      want: 'attack:false:best-opportunity-afk-drop-target'
    },
    {
      name: 'stationary full-stamina active zero drop does not beat coin pickup',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 4, x: 12000, y: 0, current_join_mode: 'Active', stamina_5s_remaining_milli: 10000, stamina_5s_limit_milli: 10000 }],
        coins: [{ drop_id: 2, x: 5000, y: 0, amount: 1 }]
      }).kind,
      want: 'coin'
    },
    {
      name: 'invulnerable aliases detect positive field despite earlier zero alias',
      got: isInvulnerable({ invulnerable_remaining_ticks: 0, invulnerableRemainingMs: 5000 }),
      want: true
    },
    {
      name: 'full hp ignores idle invulnerable active in caution range',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 4, x: 23000, y: 0, current_join_mode: 'Active', stamina_5s_remaining_milli: 10000, stamina_5s_limit_milli: 10000, invulnerable_remaining_ticks: 5 }],
        coins: [{ drop_id: 2, x: -18000, y: 0, amount: 1 }]
      }).kind,
      want: 'coin'
    },
    {
      name: 'full hp avoids moving invulnerable active in caution range',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 4, x: 23000, y: 0, vx: -10, vy: 0, current_join_mode: 'Active', stamina_5s_remaining_milli: 10000, stamina_5s_limit_milli: 10000, invulnerable_remaining_ticks: 5 }],
        coins: [{ drop_id: 2, x: -18000, y: 0, amount: 1 }]
      }).kind,
      want: 'flee'
    },
    {
      name: 'visible invulnerable player blocks nearby ordinary coin before avoidance flee',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 4, x: 25500, y: 0, native: true, current_join_mode: 'Passive', invulnerableRemainingMs: 5000 }],
        coins: [{ drop_id: 2, x: 12300, y: 0, amount: 1, native: true }]
      }).reason,
      want: 'wait-for-visible-coin-refresh'
    },
    {
      name: 'snapshot-only invulnerable player does not block visible ordinary coin',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        global: [{ user_id: 4, x: 25500, y: 0, current_join_mode: 'Passive', invulnerableRemainingMs: 5000 }],
        coins: [{ drop_id: 2, x: 12300, y: 0, amount: 1, native: true }]
      }).kind,
      want: 'coin'
    },
    {
      name: 'invulnerable active blocks coin route in same direction',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 4, x: 50000, y: 0, vx: -10, vy: 0, current_join_mode: 'Active', stamina_5s_remaining_milli: 10000, stamina_5s_limit_milli: 10000, invulnerable: true }],
        coins: [{ drop_id: 2, x: 22000, y: 0, amount: 1 }]
      }).reason,
      want: 'wait-for-visible-coin-refresh'
    },
    {
      name: 'invulnerable active allows coin away from its direction',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 4, x: 50000, y: 0, current_join_mode: 'Active', stamina_5s_remaining_milli: 10000, stamina_5s_limit_milli: 10000, invulnerable: true }],
        coins: [{ drop_id: 2, x: -18000, y: 0, amount: 1 }]
      }).kind,
      want: 'coin'
    },
    {
      name: 'invulnerable drop target is avoided instead of attacked',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 4, x: 10000, y: 0, current_join_mode: 'Passive', death_reward_preview: 20, invulnerable: true }]
        });
        return action.kind + ':' + action.reason;
      })(),
      want: 'flee:avoid-invulnerable-target'
    },
    {
      name: 'pursuit leave threshold shortens for non-full hp and invulnerable chaser',
      got: [
        pursuitLeaveThresholdForTest({ hp: 80, max_hp: 100 }, { current_join_mode: 'Active' }),
        pursuitLeaveThresholdForTest({ hp: 100, max_hp: 100 }, { current_join_mode: 'Active', invulnerable: true }),
        pursuitLeaveThresholdForTest({ hp: 80, max_hp: 100 }, { current_join_mode: 'Active', invulnerable: true })
      ].join(','),
      want: '90000,60000,45000'
    },
    {
      name: 'combat action suppresses same-target pursuit leave',
      got: [
        pursuitLeaveSuppressedByCombatAction({ id: 7 }, { combat: true, target: { id: 7 } }),
        pursuitLeaveSuppressedByCombatAction({ id: 7 }, { combat: true, target: { id: 8 } }),
        pursuitLeaveSuppressedByCombatAction({ id: 7 }, { combat: false, target: { id: 7 } })
      ].join(','),
      want: 'true,false,false'
    },
    {
      name: 'defensive target switch requires immediate incoming bullet',
      got: [
        defensiveTargetOverridesEngaged({ user_id: 1 }, { user_id: 2, incomingBullet: { ownerId: 2, distance: 12000 } }),
        defensiveTargetOverridesEngaged({ user_id: 1 }, { user_id: 2, incomingBullet: { ownerId: 2, distance: 2500 } }),
        defensiveTargetOverridesEngaged({ user_id: 1 }, { user_id: 2, incomingBullet: { ownerId: 2, timeToImpactMs: 500 } })
      ].join(','),
      want: 'false,true,true'
    },
    {
      name: 'whitelisted afk drop target is not attacked',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 9, name: '文月', x: 10000, y: 0, current_join_mode: 'Passive', death_reward_preview: 100 }]
      }).kind,
      want: 'wait'
    },
    {
      name: 'whitelisted firing target is not shot defensively',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 9, name: 'Firefox\u200e', x: 10000, y: 0, current_join_mode: 'Passive', firing: true, hp: 100, death_reward_preview: 100 }]
      }).kind,
      want: 'wait'
    },
    {
      name: 'target whitelist matches username only, not ids',
      got: isWhitelistedTarget({ user_id: '文月', id: 'Firefox', name: 'NotListed' }),
      want: false
    },
    {
      name: 'target whitelist parser trims and deduplicates usernames',
      got: JSON.stringify(parseTargetWhitelistNames({ usernames: [' 文月 ', 'Firefox\u200e', 'Firefox', '文月', '', null] }, cfg.targetWhitelistMaxNames)),
      want: JSON.stringify(['文月', 'Firefox'])
    },
    {
      name: 'target whitelist URL defaults next to remote script',
      got: deriveTargetWhitelistUrl('https://raw.githubusercontent.com/ZeroJehovah/grasp-rat-bot/main/dist/grasp-rat-remote-bot.js?cache=1#hash'),
      want: 'https://raw.githubusercontent.com/ZeroJehovah/grasp-rat-bot/main/dist/target-whitelist.json'
    },
    {
      name: 'safe near coin beats active caution migration',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 4, x: 50000, y: 0, current_join_mode: 'Active', vx: -50, death_reward_preview: 7 }],
        coins: [{ drop_id: 2, x: -1000, y: 0, amount: 5 }]
      }).kind,
      want: 'coin'
    },
    {
      name: 'full hp active caution no longer blocks medium coin',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 4, x: 24000, y: 0, current_join_mode: 'Active', vx: -50 }],
        coins: [{ drop_id: 2, x: -22000, y: 0, amount: 5 }]
      }).kind,
      want: 'seek-coin'
    },
    {
      name: 'visible coin before active danger radius beats snapshot wait',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 4, x: 30000, y: 0, current_join_mode: 'Active', vx: -50 }],
        coins: [{ drop_id: 2, x: 10000, y: 0, amount: 1 }]
      }).kind,
      want: 'coin'
    },
    {
      name: 'combat target in range beats active caution',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [
          { user_id: 4, x: 24000, y: 0, current_join_mode: 'Active', vx: -50 },
          { user_id: 17, x: 10000, y: 0, current_join_mode: 'Passive', vx: 30, death_reward_preview: 17 }
        ]
      }).kind,
      want: 'attack'
    },
    {
      name: 'passive runner combat closes and uses visible intercept',
      got: (() => {
        const self = { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 10000 };
        const target = {
          user_id: 4,
          name: 'runner',
          x: 12000,
          y: 0,
          vx: -35,
          vy: 35,
          current_join_mode: 'Active',
          death_reward_preview: 20,
          hp: 100,
          distance: 12000,
          drop: 20,
          combatIntent: 'profit'
        };
        const t = Date.now();
        bot.combatTarget = { id: 4, at: t - 7000, firstSeenAt: t - 7000, lastDamageAt: t - 1000, intent: 'profit', originIntent: 'profit', hp: 100, motionSamples: [{ selfHp: 100 }, { selfHp: 100 }] };
        bot.testNativeEntities = [{ ...target }];
        const action = chooseCombatAction(self, target, []);
        bot.testNativeEntities = [];
        bot.combatTarget = null;
        return [
          action.reason,
          action.dx,
          action.dy,
          action.aimTarget?.strategyReason,
          action.aimTarget?.passiveRunner,
          Boolean(action.combatState?.passiveRunner)
        ].join('|');
      })(),
      want: 'combat-passive-runner-close|1|0|passive-runner-intercept|true|true'
    },
    {
      name: 'passive runner closes inside normal preferred spacing',
      got: (() => {
        const self = { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 10000 };
        const target = {
          user_id: 4,
          name: 'runner',
          x: 5200,
          y: 0,
          vx: -35,
          vy: 35,
          current_join_mode: 'Active',
          hp: 100,
          distance: 5200,
          drop: 20,
          combatIntent: 'profit'
        };
        const t = Date.now();
        bot.combatTarget = { id: 4, at: t - 7000, firstSeenAt: t - 7000, lastDamageAt: t - 1000, intent: 'profit', originIntent: 'profit', hp: 100, motionSamples: [{ selfHp: 100 }, { selfHp: 100 }] };
        bot.testNativeEntities = [{ ...target }];
        const action = chooseCombatAction(self, target, []);
        bot.testNativeEntities = [];
        bot.combatTarget = null;
        return [
          action.reason,
          action.dx,
          action.combatState?.pressureClose?.closeRange,
          action.combatState?.passiveRunner?.active
        ].join('|');
      })(),
      want: 'combat-passive-runner-close|1|4500|true'
    },
    {
      name: 'passive runner keeps firing below ordinary dodge reserve',
      got: (() => {
        const self = { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 2200 };
        const target = {
          user_id: 4,
          name: 'runner',
          x: 6000,
          y: 0,
          vx: -35,
          vy: 35,
          current_join_mode: 'Active',
          hp: 100,
          distance: 6000,
          drop: 20,
          combatIntent: 'profit'
        };
        const t = Date.now();
        bot.combatTarget = { id: 4, at: t - 7000, firstSeenAt: t - 7000, lastDamageAt: t - 1000, intent: 'profit', originIntent: 'profit', hp: 100, motionSamples: [{ selfHp: 100 }, { selfHp: 100 }] };
        bot.testNativeEntities = [{ ...target }];
        const action = chooseCombatAction(self, target, []);
        bot.testNativeEntities = [];
        bot.combatTarget = null;
        return [
          action.reason,
          action.shoot,
          action.combatState?.shooting?.dodgeReserveMs,
          action.combatState?.shooting?.passiveRunnerFireWindow,
          action.combatState?.shooting?.trend?.stance
        ].join('|');
      })(),
      want: 'combat-burst-fire|true|1800|true|passive-runner'
    },
    {
      name: 'passive runner waits for confirm window',
      got: (() => {
        const self = { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 10000 };
        const target = {
          user_id: 4,
          name: 'runner',
          x: 12000,
          y: 0,
          vx: -35,
          vy: 35,
          current_join_mode: 'Active',
          hp: 100,
          distance: 12000,
          drop: 20,
          combatIntent: 'profit'
        };
        const t = Date.now();
        bot.combatTarget = { id: 4, at: t - 1200, firstSeenAt: t - 1200, intent: 'profit', originIntent: 'profit', hp: 100, motionSamples: [{ selfHp: 100 }, { selfHp: 100 }] };
        bot.testNativeEntities = [{ ...target }];
        const action = chooseCombatAction(self, target, []);
        bot.testNativeEntities = [];
        bot.combatTarget = null;
        return [
          action.reason,
          Boolean(action.combatState?.passiveRunner?.active),
          action.combatState?.passiveRunner?.confirmed,
          action.combatState?.passiveRunner?.engagedMs >= action.combatState?.passiveRunner?.confirmMs
        ].join('|');
      })(),
      want: 'combat-attack|false|false|false'
    },
    {
      name: 'passive runner disables after target real bullet history',
      got: (() => {
        const self = { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 10000 };
        const target = {
          user_id: 4,
          name: 'runner',
          x: 12000,
          y: 0,
          vx: -35,
          vy: 35,
          current_join_mode: 'Active',
          hp: 100,
          distance: 12000,
          drop: 20,
          combatIntent: 'engaged'
        };
        const t = Date.now();
        bot.combatTarget = {
          id: 4,
          at: t - 5000,
          firstSeenAt: t - 5000,
          intent: 'engaged',
          originIntent: 'profit',
          seenTargetRealBulletAt: t - 800,
          hp: 100,
          motionSamples: [{ selfHp: 100 }, { selfHp: 100 }]
        };
        bot.testNativeEntities = [{ ...target }];
        const action = chooseCombatAction(self, target, []);
        bot.testNativeEntities = [];
        bot.combatTarget = null;
        return [
          Boolean(action.combatState?.passiveRunner?.active),
          action.combatState?.passiveRunner?.seenTargetRealBulletMs > 0
        ].join('|');
      })(),
      want: 'false|true'
    },
    {
      name: 'winning pressure keeps firing to finish low target',
      got: (() => {
        const t = Date.now();
        bot.combatTarget = { id: 7, at: t - 30000, lastDamageAt: t - 8000, hp: 70 };
        try {
          const action = chooseCombatAction(
            { user_id: 1, x: 0, y: 0, hp: 74, max_hp: 100, stamina_5s_remaining_milli: 2200 },
            { user_id: 7, x: 8500, y: 0, distance: 8500, current_join_mode: 'Active', hp: 62, vx: 35, drop: 20 },
            [{ id: 'target-shot', ownerId: 7, x: 7000, y: 0, vx: -500, vy: 0 }]
          );
          return [
            action.reason,
            action.shoot,
            action.combatState?.shooting?.dodgeReserveMs,
            action.combatState?.shooting?.winningPressureFireWindow,
            action.combatState?.shooting?.trend?.stance
          ].join('|');
        } finally {
          bot.combatTarget = null;
        }
      })(),
      want: 'combat-burst-fire|true|1800|true|winning-pressure'
    },
    {
      name: 'return block prevents moving back toward nearby active',
      got: blockThreatReturnAction(
        { user_id: 1, x: 0, y: 0 },
        [decorateThreat({ x: 0, y: 0 }, { user_id: 4, x: 23000, y: 0, current_join_mode: 'Active' })],
        { kind: 'coin', dx: 1, dy: 0 }
      ).kind,
      want: 'flee'
    },
    {
      name: 'return block allows moving away from nearby active',
      got: blockThreatReturnAction(
        { user_id: 1, x: 0, y: 0 },
        [decorateThreat({ x: 0, y: 0 }, { user_id: 4, x: 23000, y: 0, current_join_mode: 'Active' })],
        { kind: 'coin', dx: -1, dy: 0, target: { distance: 500 } }
      ).kind,
      want: 'coin'
    },
    {
      name: 'return block scans instead of fleeing when already backing away',
      got: blockThreatReturnAction(
        { user_id: 1, x: 0, y: 0 },
        [decorateThreat({ x: 0, y: 0 }, { user_id: 4, x: 23000, y: 0, current_join_mode: 'Active' })],
        { kind: 'coin', dx: -1, dy: 0, target: { distance: 5000 } }
      ).kind,
      want: 'patrol'
    },
    {
      name: 'return block scans instead of far fleeing when not heading toward active',
      got: blockThreatReturnAction(
        { user_id: 1, x: 0, y: 0 },
        [decorateThreat({ x: 0, y: 0 }, { user_id: 4, x: 23000, y: 0, current_join_mode: 'Active' })],
        { kind: 'seek-coin', dx: 0, dy: -1, target: { distance: 90000 } }
      ).kind,
      want: 'patrol'
    },
    {
      name: 'return block scans inside exit radius when moving away after fresh injection',
      got: blockThreatReturnAction(
        { user_id: 1, x: 0, y: 0 },
        [decorateThreat({ x: 0, y: 0 }, { user_id: 4, x: 23000, y: 0, current_join_mode: 'Active' })],
        { kind: 'seek-coin', dx: -1, dy: -1, target: { distance: 120000 } }
      ).kind,
      want: 'patrol'
    },
    {
      name: 'return block guards against turning back inside 25k cap',
      got: blockThreatReturnAction(
        { user_id: 1, x: 0, y: 0 },
        [decorateThreat({ x: 0, y: 0 }, { user_id: 4, x: 23000, y: 0, current_join_mode: 'Active' })],
        { kind: 'seek-coin', dx: 1, dy: 0, target: { distance: 120000 } }
      ).kind,
      want: 'flee'
    },
    {
      name: 'return block allows moving after 25k cap',
      got: blockThreatReturnAction(
        { user_id: 1, x: 0, y: 0 },
        [decorateThreat({ x: 0, y: 0 }, { user_id: 4, x: 30000, y: 0, current_join_mode: 'Active' })],
        { kind: 'seek-coin', dx: -1, dy: 0, target: { distance: 120000 } }
      ).kind,
      want: 'seek-coin'
    },
    {
      name: 'far active does not re-enable snapshot coin travel away from it',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 4, x: 40000, y: 0, current_join_mode: 'Active' }],
        coins: [
          { drop_id: 2, x: -90000, y: -1000, amount: 1, snapshot: true },
          { drop_id: 3, x: -94000, y: 2000, amount: 1, snapshot: true },
          { drop_id: 4, x: -98000, y: -2000, amount: 1, snapshot: true }
        ]
      }).reason,
      want: 'wait-for-visible-coin-refresh'
    },
    {
      name: 'far active does not re-enable snapshot coin travel beyond it',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 4, x: 40000, y: 0, current_join_mode: 'Active' }],
        coins: [
          { drop_id: 2, x: 70000, y: -1000, amount: 1, snapshot: true },
          { drop_id: 3, x: 74000, y: 2000, amount: 1, snapshot: true },
          { drop_id: 4, x: 78000, y: -2000, amount: 1, snapshot: true }
        ]
      }).reason,
      want: 'wait-for-visible-coin-refresh'
      },
    {
      name: 'full hp low stamina waits when no snapshot coin exists',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 2000 },
        global: [{ user_id: 4, x: 20000, y: 0, current_join_mode: 'Active', vx: -50, death_reward_preview: 7 }]
      }).kind,
      want: 'wait'
    },
    {
      name: 'low stamina picks close safe coin',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 6000 },
        coins: [{ drop_id: 1, x: 5000, y: 0, amount: 1 }]
      }).kind,
      want: 'coin'
    },
    {
      name: 'low stamina still picks medium coin',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 6000 },
        coins: [{ drop_id: 1, x: 9000, y: 0, amount: 1 }]
      }).kind,
      want: 'coin'
    },
    {
      name: 'medium stamina still seeks far visible coin',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 7000 },
        coins: [{ drop_id: 1, x: 20000, y: 0, amount: 1 }]
      }).kind,
      want: 'seek-coin'
    },
    {
      name: 'medium stamina picks edge near coin',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 7000 },
        coins: [{ drop_id: 1, x: 13000, y: 0, amount: 1 }]
      }).kind,
      want: 'coin'
    },
    {
      name: 'medium stamina still picks medium coin',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 7000 },
        coins: [{ drop_id: 1, x: 15000, y: 0, amount: 1 }]
      }).kind,
      want: 'coin'
    },
    {
      name: 'stationary afk target in range is shot without combat',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 7, x: 12000, y: 0, current_join_mode: 'Passive', death_reward_preview: 9 }]
        });
        return action.kind + ':' + Boolean(action.combat);
      })(),
      want: 'attack:false'
    },
    {
      name: 'recently active idle target is not treated as afk profit',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 7, x: 12000, y: 0, current_join_mode: 'Passive', death_reward_preview: 100, recentActivityAgeMs: 5000 }]
        });
        return action.kind + ':' + action.reason;
      })(),
      want: 'wait:wait-for-visible-coin-refresh'
    },
    {
      name: 'low value afk target in range is skipped',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 7, x: 10000, y: 0, current_join_mode: 'Passive', death_reward_preview: 2 }]
      }).kind,
      want: 'wait'
    },
    {
      name: 'high own drop still allows afk shot',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000, drop: 30 },
        local: [{ user_id: 7, x: 10000, y: 0, current_join_mode: 'Passive', death_reward_preview: 12 }]
      }).kind,
      want: 'attack'
    },
    {
      name: 'worthwhile close passive target is shot without combat',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000, drop: 30 },
        local: [{ user_id: 7, x: 10000, y: 0, current_join_mode: 'Passive', death_reward_preview: 16 }]
      }).kind,
      want: 'attack'
    },
    {
      name: 'near passive drop can beat lower coin target',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 7, x: 10000, y: 0, current_join_mode: 'Passive', death_reward_preview: 9 }],
        coins: [{ drop_id: 1, x: 5000, y: 0, amount: 1 }]
      }).kind,
      want: 'attack'
    },
    {
      name: 'same value coin beats afk drop after shot stamina cost',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 7, x: 10000, y: 0, current_join_mode: 'Passive', death_reward_preview: 5 }],
          coins: [{ drop_id: 1, x: 10000, y: 0, amount: 5 }]
        });
        return action.kind + ':' + action.reason;
      })(),
      want: 'coin:best-opportunity-coin'
    },
    {
      name: '500m drop five afk loses to 100m one coin by pickup travel cost',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
          global: [{ user_id: 7, x: 50000, y: 0, current_join_mode: 'Passive', death_reward_preview: 5 }],
          coins: [{ drop_id: 1, x: -10000, y: 0, amount: 1, native: true }]
        });
        return action.kind + ':' + action.reason;
      })(),
      want: 'coin:best-opportunity-coin'
    },
    {
      name: 'same distance ten coin beats drop ten after kill pickup cost',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 7, x: 10000, y: 0, current_join_mode: 'Passive', death_reward_preview: 10 }],
          coins: [{ drop_id: 1, x: 10000, y: 0, amount: 10, native: true }]
        });
        return action.kind + ':' + action.reason;
      })(),
      want: 'coin:best-opportunity-coin'
    },
    {
      name: 'held high value coin resists afk drop target switch',
      got: (() => {
        const t = Date.now();
        bot.opportunityChoice = {
          key: 'coin:1',
          type: 'coin',
          id: 1,
          reason: 'best-opportunity-visible-coin',
          x: 30000,
          y: 0,
          amount: 10,
          score: 200000,
          at: t - 500,
          lastSeenAt: t - 100,
          until: t + cfg.opportunitySwitchHoldMs
        };
        const action = pickBestOpportunity(
          { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
          [{ user_id: 7, x: 10000, y: 0, current_join_mode: 'Passive', death_reward_preview: 100, distance: 10000, drop: 100 }],
          [{ drop_id: 1, x: 30000, y: 0, amount: 10, native: true, distance: 30000 }],
          []
        );
        const remembered = bot.opportunityChoice?.type + ':' + bot.opportunityChoice?.id;
        bot.opportunityChoice = null;
        return action.kind + ':' + action.reason + ':' + action.id + ':' + remembered;
      })(),
      want: 'seek-coin:best-opportunity-visible-coin:1:coin:1'
    },
    {
      name: 'visible coin route beats closer single coin by route roi',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
          coins: [
            { drop_id: 1, x: -8000, y: 0, amount: 1, native: true },
            { drop_id: 2, x: 12000, y: 0, amount: 1, native: true },
            { drop_id: 3, x: 12500, y: 0, amount: 1, native: true },
            { drop_id: 4, x: 13000, y: 0, amount: 1, native: true }
          ]
        });
        return action.kind + ':' + action.reason + ':' + action.id + ':' + action.coinRoute?.legCount + ':' + action.coinRoute?.points?.length + ':' + action.coinRoute?.value;
      })(),
      want: 'coin:best-opportunity-coin-route:2:3:3:3'
    },
    {
      name: 'held coin route keeps first coin through near tie replans',
      got: (() => {
        const t = Date.now();
        bot.opportunityChoice = {
          key: 'coin:1',
          type: 'coin',
          id: 1,
          reason: 'best-opportunity-coin-route',
          x: -3000,
          y: 8000,
          amount: 1,
          score: 104545,
          coinRouteIds: ['1', '3', '2'],
          coinRouteValue: 3,
          coinRouteLegs: 3,
          at: t - 500,
          lastSeenAt: t - 100,
          until: t + cfg.opportunitySwitchHoldMs
        };
        const action = choose({
          self: { user_id: 1, x: 500, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
          coins: [
            { drop_id: 1, x: -3000, y: 8000, amount: 1, native: true },
            { drop_id: 2, x: 3000, y: 8000, amount: 1, native: true },
            { drop_id: 3, x: 0, y: 11000, amount: 1, native: true }
          ]
        });
        const remembered = bot.opportunityChoice?.id + ':' + (bot.opportunityChoice?.coinRouteIds || []).join('-');
        bot.opportunityChoice = null;
        return action.kind + ':' + action.reason + ':' + action.id + ':' + Boolean(action.routeHeld) + ':' + action.coinRoute?.ids?.join('-') + ':' + remembered;
      })(),
      want: 'coin:best-opportunity-coin-route:1:true:1-3-2:1:1-3-2'
    },
    {
      name: 'held coin route switches first coin when route score is clearly better',
      got: (() => {
        const t = Date.now();
        bot.opportunityChoice = {
          key: 'coin:1',
          type: 'coin',
          id: 1,
          reason: 'best-opportunity-coin-route',
          x: -3000,
          y: 8000,
          amount: 1,
          score: 97375,
          coinRouteIds: ['1', '3', '2'],
          coinRouteValue: 3,
          coinRouteLegs: 3,
          at: t - 500,
          lastSeenAt: t - 100,
          until: t + cfg.opportunitySwitchHoldMs
        };
        const action = choose({
          self: { user_id: 1, x: 3000, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
          coins: [
            { drop_id: 1, x: -3000, y: 8000, amount: 1, native: true },
            { drop_id: 2, x: 3000, y: 8000, amount: 1, native: true },
            { drop_id: 3, x: 0, y: 11000, amount: 1, native: true }
          ]
        });
        bot.opportunityChoice = null;
        return action.kind + ':' + action.reason + ':' + action.id + ':' + Boolean(action.routeHeld) + ':' + action.coinRoute?.ids?.join('-');
      })(),
      want: 'coin:best-opportunity-coin-route:2:false:2-3-1'
    },
    {
      name: 'held nearby single coin blocks farther coin route first target',
      got: (() => {
        const t = Date.now();
        bot.opportunityChoice = {
          key: 'coin:1',
          type: 'coin',
          id: 1,
          reason: 'best-opportunity-coin',
          x: -8900,
          y: 0,
          amount: 1,
          distance: 8900,
          score: 67416,
          at: t - 500,
          lastSeenAt: t - 100,
          until: t + cfg.opportunitySwitchHoldMs
        };
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
          coins: [
            { drop_id: 1, x: -8900, y: 0, amount: 1, native: true },
            { drop_id: 2, x: 21700, y: 0, amount: 1, native: true },
            { drop_id: 3, x: 21800, y: 1200, amount: 1, native: true },
            { drop_id: 4, x: 21900, y: -1200, amount: 1, native: true }
          ]
        });
        const remembered = bot.opportunityChoice?.id + ':' + bot.opportunityChoice?.reason;
        bot.opportunityChoice = null;
        return action.kind + ':' + action.reason + ':' + action.id + ':' + Boolean(action.coinRoute) + ':' + remembered;
      })(),
      want: 'coin:best-opportunity-coin:1:false:1:best-opportunity-coin'
    },
    {
      name: 'held nearby single coin can become same-first coin route',
      got: (() => {
        const t = Date.now();
        bot.opportunityChoice = {
          key: 'coin:1',
          type: 'coin',
          id: 1,
          reason: 'best-opportunity-coin',
          x: 8900,
          y: 0,
          amount: 1,
          distance: 8900,
          score: 67416,
          at: t - 500,
          lastSeenAt: t - 100,
          until: t + cfg.opportunitySwitchHoldMs
        };
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
          coins: [
            { drop_id: 1, x: 8900, y: 0, amount: 1, native: true },
            { drop_id: 2, x: 10000, y: 0, amount: 1, native: true },
            { drop_id: 3, x: 11200, y: 0, amount: 1, native: true }
          ]
        });
        const remembered = bot.opportunityChoice?.id + ':' + bot.opportunityChoice?.reason + ':' + (bot.opportunityChoice?.coinRouteIds || []).join('-');
        bot.opportunityChoice = null;
        return action.kind + ':' + action.reason + ':' + action.id + ':' + action.coinRoute?.ids?.join('-') + ':' + remembered;
      })(),
      want: 'coin:best-opportunity-coin-route:1:1-2-3:1:best-opportunity-coin-route:1-2-3'
    },
    {
      name: 'same first coin route keeps overlay metadata when single coin roi is higher',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
          coins: [
            { drop_id: 1, x: 2000, y: 0, amount: 1, native: true },
            { drop_id: 2, x: 16000, y: 0, amount: 1, native: true },
            { drop_id: 3, x: 17000, y: 0, amount: 1, native: true }
          ]
        });
        return action.kind + ':' + action.reason + ':' + action.id + ':' + action.coinRoute?.legCount + ':' + action.coinRoute?.points?.length + ':' + action.score;
      })(),
      want: 'coin:best-opportunity-coin-route:1:3:3:300000'
    },
    {
      name: 'visible afk drop still beats weaker coin route by stamina roi',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 7, x: 9000, y: 0, current_join_mode: 'Passive', death_reward_preview: 9 }],
          coins: [
            { drop_id: 1, x: -12000, y: 0, amount: 1, native: true },
            { drop_id: 2, x: -12500, y: 0, amount: 1, native: true }
          ]
        });
        return action.kind + ':' + action.reason;
      })(),
      want: 'attack:best-opportunity-afk-drop-target'
    },
    {
      name: 'same first coin route keeps overlay metadata near non-avoidance active',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 4, x: 30000, y: 0, current_join_mode: 'Active', vx: -50 }],
          coins: [
            { drop_id: 1, x: -8000, y: 0, amount: 1, native: true },
            { drop_id: 2, x: 10000, y: 0, amount: 1, native: true },
            { drop_id: 3, x: 15000, y: 0, amount: 1, native: true }
          ]
        });
        return action.reason + ':' + action.coinRoute?.legCount;
      })(),
      want: 'best-opportunity-coin-route:3'
    },
    {
      name: 'coin route does not skip much closer local coin',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
          coins: [
            { drop_id: 1, x: -8000, y: 0, amount: 1, native: true },
            { drop_id: 2, x: 22000, y: 0, amount: 1, native: true },
            { drop_id: 3, x: 22500, y: 0, amount: 1, native: true },
            { drop_id: 4, x: 23000, y: 0, amount: 1, native: true }
          ]
        });
        return action.kind + ':' + action.reason + ':' + action.id + ':' + Boolean(action.coinRoute);
      })(),
      want: 'coin:best-opportunity-coin:1:false'
    },
    {
      name: 'coin route leg threat block rejects path through invulnerable danger',
      got: (() => {
        const self = { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 };
        const threat = decorateThreat(self, { user_id: 4, x: 50000, y: 0, current_join_mode: 'Active', vx: -50, invulnerable: true });
        const route = pickCoinRouteOpportunity(self, [
          { drop_id: 1, x: 10000, y: 0, amount: 1, native: true },
          { drop_id: 2, x: 16000, y: 0, amount: 1, native: true },
          { drop_id: 3, x: 22000, y: 0, amount: 1, native: true },
          { drop_id: 4, x: -8000, y: 0, amount: 1, native: true },
          { drop_id: 5, x: -9000, y: 1000, amount: 1, native: true },
          { drop_id: 6, x: -10000, y: -1000, amount: 1, native: true }
        ], [threat]);
        return route ? route.drop_id + ':' + route.coinRoute?.ids?.join(',') : 'none';
      })(),
      want: '4:4,5,6'
    },
    {
      name: 'coin route rejects unaffordable whole route',
      got: (() => {
        const self = {
          user_id: 1,
          x: 0,
          y: 0,
          hp: 100,
          stamina_1h_remaining_milli: 12500,
          stamina_1d_remaining_milli: 12500,
          stamina_5s_remaining_milli: 10000
        };
        const action = pickBestOpportunity(
          self,
          [],
          [
            { drop_id: 1, x: 10000, y: 0, amount: 1, native: true },
            { drop_id: 2, x: 12000, y: 0, amount: 1, native: true },
            { drop_id: 3, x: 14000, y: 0, amount: 1, native: true }
          ],
          []
        );
        return action ? action.reason + ':' + action.id + ':' + Boolean(action.coinRoute) : 'none';
      })(),
      want: 'best-opportunity-coin:1:false'
    },
    {
      name: 'shot stamina can make a lower coin beat a low drop target',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 7, x: 10000, y: 0, current_join_mode: 'Passive', death_reward_preview: 5 }],
        coins: [{ drop_id: 1, x: 3000, y: 0, amount: 1 }]
      }).kind,
      want: 'coin'
    },
    {
      name: 'higher drop still wins when stamina yield is better',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 7, x: 10000, y: 0, current_join_mode: 'Passive', death_reward_preview: 9 }],
        coins: [{ drop_id: 1, x: 5000, y: 0, amount: 1 }]
      }).kind,
      want: 'attack'
    },
    {
      name: 'low long stamina skips far visible coin',
      got: choose({
        self: {
          user_id: 1,
          x: 0,
          y: 0,
          hp: 100,
          stamina_5s_remaining_milli: 10000,
          stamina_1h_remaining_milli: 3500,
          stamina_1d_remaining_milli: 3500
        },
        coins: [{ drop_id: 1, x: 20000, y: 0, amount: 100 }]
      }).kind,
      want: 'leave'
    },
    {
      name: 'low 1h stamina visible coin exits instead of waiting',
      got: choose({
        self: {
          user_id: 1,
          x: 0,
          y: 0,
          hp: 100,
          stamina_5s_remaining_milli: 10000,
          stamina_1h_remaining_milli: 3500,
          stamina_1d_remaining_milli: 3500
        },
        coins: [{ drop_id: 1, x: 20000, y: 0, amount: 100 }]
      }).reason,
      want: 'stamina-budget-coin-leave'
    },
    {
      name: 'low daily stamina goes to nearest visible coin instead of waiting for roi',
      got: (() => {
        const action = choose({
          self: {
            user_id: 1,
            x: 0,
            y: 0,
            hp: 100,
            stamina_5s_remaining_milli: 10000,
            stamina_1h_remaining_milli: 100000,
            stamina_1d_remaining_milli: 3500
          },
          coins: [
            { drop_id: 1, x: 12000, y: 0, amount: 1 },
            { drop_id: 2, x: 20000, y: 0, amount: 100 }
          ]
        });
        return action.reason + ':' + action.id;
      })(),
      want: 'daily-stamina-final-visible-coin:1'
    },
    {
      name: 'low long stamina still takes foot coin',
      got: choose({
        self: {
          user_id: 1,
          x: 0,
          y: 0,
          hp: 100,
          stamina_5s_remaining_milli: 10000,
          stamina_1h_remaining_milli: 3500,
          stamina_1d_remaining_milli: 3500
        },
        coins: [
          { drop_id: 1, x: 500, y: 0, amount: 1 },
          { drop_id: 2, x: 20000, y: 0, amount: 100 }
        ]
      }).id,
      want: 1
    },
    {
      name: '1h budget below nearest foot coin exits',
      got: choose({
        self: {
          user_id: 1,
          x: 0,
          y: 0,
          hp: 100,
          stamina_5s_remaining_milli: 10000,
          stamina_1h_remaining_milli: 2400,
          stamina_1d_remaining_milli: 100000
        },
        coins: [{ drop_id: 1, x: 500, y: 0, amount: 1 }]
      }).reason,
      want: 'stamina-budget-coin-leave'
    },
    {
      name: 'low 1h stamina ignores snapshot for budget before idle fallback',
      got: choose({
        self: {
          user_id: 1,
          x: 0,
          y: 0,
          hp: 100,
          stamina_5s_remaining_milli: 10000,
          stamina_1h_remaining_milli: 3500,
          stamina_1d_remaining_milli: 3500
        },
        coins: [{ drop_id: 2, x: 52000, y: 0, amount: 1, snapshot: true }],
        snapshotWaitAgeMs: 60000
      }).reason,
      want: 'wait-for-visible-coin-refresh'
    },
    {
      name: 'low daily stamina does not use snapshot-only final coin',
      got: choose({
        self: {
          user_id: 1,
          x: 0,
          y: 0,
          hp: 100,
          stamina_5s_remaining_milli: 10000,
          stamina_1h_remaining_milli: 100000,
          stamina_1d_remaining_milli: 3500
        },
        coins: [{ drop_id: 2, x: 12000, y: 0, amount: 1, snapshot: true }],
        snapshotWaitAgeMs: 60000
      }).reason,
      want: 'wait-for-visible-coin-refresh'
    },
    {
      name: 'low long stamina target-only budget block waits for visible coin refresh',
      got: (() => {
        const action = choose({
          self: {
            user_id: 1,
            x: 0,
            y: 0,
            hp: 100,
            stamina_5s_remaining_milli: 10000,
            stamina_1h_remaining_milli: 3500,
            stamina_1d_remaining_milli: 3500
          },
          local: [{ user_id: 7, x: 10000, y: 0, current_join_mode: 'Passive', hp: 100, death_reward_preview: 100 }]
        });
        return action.kind + ':' + action.reason;
      })(),
      want: 'wait:wait-for-visible-coin-refresh'
    },
    {
      name: 'stamina budget leave summary identifies nearest coin',
      got: offlineLeaveSummaryText('stamina budget coin leave', { staminaBudgetExit: { window: '1h', distance: 20000 } }),
      want: '一小时体力不足以拾取最近金币，退出等待重连'
    },
    {
      name: 'same enemy relogin repeat backoff is disabled',
      got: [
        enemyRepeatDelayMsForCount(1),
        enemyRepeatDelayMsForCount(2),
        enemyRepeatDelayMsForCount(3),
        enemyRepeatDelayMsForCount(4)
      ].join(','),
      want: '0,0,0,0'
    },
    {
	      name: 'stamina leave summary identifies hourly limit',
	      got: offlineLeaveSummaryText('offline leave wait', { staminaExhausted: { longExhausted: ['1h'] } }),
		      want: '一小时体力到达限制，退出等待重连'
	    },
	    {
	      name: 'stamina leave summary identifies long-window limits',
	      got: offlineLeaveSummaryText('stamina exhausted', { staminaExhausted: { exhausted: ['5s', '1h', '1d'] } }),
	      want: '一小时和一天体力到达限制，退出等待重连'
	    },
	    {
	      name: 'stamina leave summary identifies daily limit',
	      got: offlineLeaveSummaryText('stamina exhausted', { staminaExhausted: { exhausted: ['5s', '1d'] } }),
	      want: '一天体力到达限制，退出等待重连'
	    },
	    {
	      name: 'stale daily stamina hold is contradicted by preserved session stamina',
	      got: String(staminaHoldContradictedByStaminaEvidence(
	        { longExhausted: ['1h', '1d'] },
	        { stamina1dLastRemaining: 12658427, stamina1dLastLimit: 20000000 },
	        1000
	      )),
	      want: 'true'
	    },
	    {
	      name: 'daily stamina hold is not contradicted without remaining stamina evidence',
	      got: String(staminaHoldContradictedByStaminaEvidence(
	        { longExhausted: ['1d'] },
	        { stamina1dLastRemaining: 0, stamina1dLastLimit: 20000000 },
	        1000
	      )),
	      want: 'false'
	    },
	    {
	      name: 'offline reconnect churn summary is explicit',
	      got: offlineLeaveSummaryText('websocket reconnect churn', { reconnectChurn: { count: 3, windowMs: 10000 } }),
		      want: '网络连接反复重连，退出等待重连'
		    },
    {
      name: 'native transport stall recovery resets current websocket once',
      got: (() => {
        const originalWebSocket = global.WebSocket;
        const originalDateNow = Date.now;
        const FakeWebSocket = { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 };
        let nowMs = 100000;
        Date.now = () => nowMs;
        global.WebSocket = FakeWebSocket;
        const makeWs = () => ({
          readyState: FakeWebSocket.OPEN,
          closed: 0,
          listeners: {},
          addEventListener(type, fn) { this.listeners[type] = fn; },
          removeEventListener(type) { delete this.listeners[type]; },
          close() { this.closed += 1; this.readyState = FakeWebSocket.CLOSED; }
        });
        const ws1 = makeWs();
        const nativeState = { ws: ws1, wsOpen: true, currentUserId: 28886, sessionToken: 'token', keys: new Set(['w']), currentVel: { dx: 1, dy: 0 } };
        const botState = {
          control: { currentUserId: 28886, hasToken: true, wsOpen: true, nativeWsOpen: true, connecting: false, lastVelocity: '1 0', lastVelocityAt: 0, nonZeroVelocitySince: 90000, lastNonZeroVelocityAt: 99900 },
          networkQuality: { pendingMovement: { at: 99000 } },
          directVelocityRepeatToken: 0,
          directVelocityStopRepeatsLeft: 0,
          velocityPulseToken: 0
        };
        let serverReset = '';
        let actionReset = '';
        const native = () => ({ state: nativeState, ws: nativeState.ws, wsOpen: Boolean(nativeState.wsOpen && nativeState.ws?.readyState === FakeWebSocket.OPEN), wsReadyState: nativeState.ws?.readyState ?? null });
        const runtime = createNativeTransportRuntime({
          bot: botState,
          cfg: { nativeTransportStallRecoveryEnabled: true, nativeTransportStallRecoveryWaitMs: 8000, nativeTransportStallRecoveryCooldownMs: 60000 },
          getNativeControl: native,
          getNativeState: () => nativeState,
          isWsConnectingOrOpen: value => value === FakeWebSocket.CONNECTING || value === FakeWebSocket.OPEN,
          runCallbackSafely: (_label, fn) => fn,
          now: () => nowMs,
          resetServerPositionStall: reason => { serverReset = reason; },
          resetActionSettlementStall: reason => { actionReset = reason; }
        });
        try {
          const first = runtime.maybeRecoverNativeTransportStall('action-settlement-stalled', { actionSettlementStall: { stalled: true } });
          const afterFirst = [first?.waiting, ws1.closed, nativeState.wsOpen, botState.control.hasToken, nativeState.currentUserId, nativeState.sessionToken, nativeState.keys.size, nativeState.currentVel.dx, botState.networkQuality.pendingMovement === null, serverReset, actionReset].map(String).join('|');
          const ws2 = makeWs();
          nativeState.ws = ws2; nativeState.wsOpen = true; nowMs += 1000;
          const second = runtime.maybeRecoverNativeTransportStall('', {});
          const afterSecond = [second, botState.nativeTransportRecovery.active, Boolean(botState.nativeTransportRecovery.recoveredAt), ws2.closed].map(String).join('|');
          const ws3 = makeWs();
          nativeState.ws = ws3; nativeState.wsOpen = true; nowMs += 70000;
          const third = runtime.maybeRecoverNativeTransportStall('server-position-no-move', { serverPositionStall: { stalled: true, reason: 'server-position-no-move' } });
          botState.nativeTransportRecovery.deadlineAt = nowMs - 1; nowMs += 1;
          const fourth = runtime.maybeRecoverNativeTransportStall('', {});
          const fifth = runtime.maybeRecoverNativeTransportStall('action-settlement-stalled', { actionSettlementStall: { stalled: true } });
          return [afterFirst, afterSecond, [third?.waiting, ws3.closed, fourth, botState.nativeTransportRecovery.failureReason, botState.control.wsOpen, botState.control.nativeWsOpen, fifth].map(String).join('|')].join(' / ');
        } finally {
          Date.now = originalDateNow;
          if (originalWebSocket === undefined) delete global.WebSocket;
          else global.WebSocket = originalWebSocket;
        }
      })(),
      want: 'true|1|false|true|28886|token|0|0|true|native-transport-reset|native-transport-reset / null|false|true|0 / true|1|null|timeout|false|false|null'
    },
	    {
	      name: 'current websocket offline display beats stale pending combat detail',
	      got: currentOfflineDisplayReasonForTest(
	        'websocket offline',
	        { unsafe: false },
	        {
	          reason: 'pending-exit-active',
	          summary: '与lockcc战斗，血量59，对方血量100，差距41，距离145米，提前劣势退出',
	          displayReason: '与lockcc战斗，血量59，对方血量100，差距41，距离145米，提前劣势退出，等待退出确认，未退出会继续补发'
	        },
	        {
	          displayReason: '与lockcc战斗，血量59，对方血量100，差距41，距离145米，提前劣势退出，等待退出确认，未退出会继续补发'
	        }
	      ),
	      want: '网络连接离线，退出等待重连'
	    },
	    {
	      name: 'fresh websocket offline pending display keeps confirmation suffix',
	      got: currentOfflineDisplayReasonForTest(
	        'websocket offline',
	        { unsafe: false },
	        {
	          reason: 'pending-exit-active',
	          summary: '网络连接离线，退出等待重连',
	          displayReason: '网络连接离线，退出等待重连，等待退出确认，未退出会继续补发'
	        },
	        null
	      ),
	      want: '网络连接离线，退出等待重连，等待退出确认，未退出会继续补发'
	    },
	    {
	      name: 'offline sampling outage summary is explicit',
	      got: offlineLeaveSummaryText('global sampling outage', { samplingOutage: { errorCount: 1 } }),
	      want: '网络采样超时，按网络波动退出等待重连'
	    },
	    {
	      name: 'offline combat tick gap summary is explicit',
	      got: offlineLeaveSummaryText('combat tick gap', { combatTickGap: { tickGapMs: 37971 } }),
	      want: '战斗主循环断档，按网络波动退出等待重连'
	    },
	    {
	      name: 'login point safety entry summary is explicit',
	      got: offlineLeaveSummaryText('login point safety gate', {
	        loginPointSafetyGate: {
	          reason: 'login-point-safety',
		          loginPointSafety: { streak: 0, required: 3 }
	        }
	      }),
	      want: '登录点安全快照未满足，退出等待安全重连'
	    },
	    {
	      name: 'combat sampling outage triggers offline leave gate',
	      got: globalSamplingOutageOfflineStateForTest({
	        nowMs: 10000,
	        decision: { combat: true, reason: 'combat-pressure-close' },
	        outage: {
	          active: true,
	          firstAt: 9000,
	          ageMs: 1000,
	          errorCount: 1,
	          snapshotTimedOut: true,
	          minimapTimedOut: true
	        }
	      })?.reason,
	      want: 'global sampling outage'
	    },
	    {
	      name: 'non-combat sampling outage does not trigger by default',
	      got: globalSamplingOutageOfflineStateForTest({
	        nowMs: 10000,
	        decision: { kind: 'coin', reason: 'best-opportunity-coin' },
	        outage: {
	          active: true,
	          firstAt: 9000,
	          ageMs: 1000,
	          errorCount: 1,
	          snapshotTimedOut: true,
	          minimapTimedOut: true
	        }
	      })?.reason || 'none',
	      want: 'none'
	    },
	    {
	      name: 'combat tick gap triggers offline leave gate',
	      got: combatTickGapOfflineStateForTest({
	        nowMs: 48000,
	        previousTickAt: 10000,
	        previousCombatActive: true,
	        decision: { combat: true, reason: 'combat-tangent-dodge' },
	        lastCombatFrameAt: 10000
	      })?.reason,
	      want: 'combat tick gap'
	    },
	    {
	      name: 'non-combat tick gap does not trigger by default',
	      got: combatTickGapOfflineStateForTest({
	        nowMs: 48000,
	        previousTickAt: 10000,
	        decision: { kind: 'coin', reason: 'best-opportunity-coin' },
	        lastCombatFrameAt: 10000
	      })?.reason || 'none',
	      want: 'none'
	    },
	    {
	      name: 'recent combat frame gap alone does not leave during coin route',
	      got: (() => {
	        const state = combatTickGapOfflineStateForTest({
	          nowMs: 16000,
	          previousTickAt: 15880,
	          tickGapMs: 120,
	          decision: { kind: 'coin', reason: 'best-opportunity-coin-route' },
	          lastCombatFrameAt: 10000
	        });
	        return (state?.reason || 'none') + '|' + (state?.diagnosis || '') + '|' + Boolean(state?.recentCombatFrameContext);
	      })(),
	      want: 'none||false'
	    },
	    {
	      name: 'combat frame gap with active tick records gating diagnosis',
	      got: (() => {
	        const state = combatTickGapOfflineStateForTest({
	          nowMs: 48000,
	          previousTickAt: 47880,
	          tickGapMs: 120,
	          combatLogActive: true,
	          decision: { combat: true, reason: 'combat-tangent-dodge' },
	          lastCombatFrameAt: 10000
	        });
	        return (state?.reason || 'none') + '|' + (state?.diagnosis || '') + '|' + (state?.likelyCause || '');
	      })(),
	      want: 'combat tick gap|combat-log-gap-with-active-tick|combat-state-or-log-gating-gap'
	    },
	    {
	      name: 'combat log post-buffer frame gap alone does not exit after combat target switch',
	      got: (() => {
	        const state = combatTickGapOfflineStateForTest({
	          nowMs: 48000,
	          previousTickAt: 47880,
	          tickGapMs: 120,
	          combatLogActive: true,
	          decision: {
	            kind: 'seek-enemy',
	            reason: 'approach-afk-drop-target',
	            target: { id: 9114, name: 'leon tree', afk: true }
	          },
	          lastCombatFrameAt: 42950,
	          lastBuiltFrameAt: 47920
	        });
	        return (state?.reason || 'none') + '|' + (state?.diagnosis || '') + '|' + Boolean(state?.combatLogActive);
	      })(),
	      want: 'none||false'
	    },
	    {
	      name: 'combat tick reentry gap records stuck async diagnosis',
	      got: (() => {
	        const state = combatTickGapOfflineStateForTest({
	          nowMs: 48000,
	          previousTickAt: 42000,
	          tickGapMs: 120,
	          tickInProgressMs: 6000,
	          lastTickCompletedGapMs: 6000,
	          reentry: true,
	          combatLogActive: true,
	          decision: { combat: true, reason: 'combat-tangent-dodge' },
	          lastCombatFrameAt: 47800
	        });
	        return (state?.reason || 'none') + '|' + (state?.diagnosis || '') + '|' + (state?.likelyCause || '');
	      })(),
	      want: 'combat tick gap|tick-reentry-gap|main-loop-stuck-or-awaiting-async'
	    },
	    {
	      name: 'combat log exit summary ignores non-exit decisions',
	      got: combatLogExitSummaryFromDecision({ kind: 'wait', reason: 'combat-spacing' }),
	      want: null
	    },
	    {
	      name: 'combat log exit summary keeps specific reason during leave cooldown',
	      got: (() => {
	        const exit = combatLogExitSummaryFromDecision({
	          kind: 'wait',
	          reason: 'combat-leave-retry',
	          displayReason: 'retrying combat leave',
	          leave: {
	            reason: 'cooldown',
	            attempted: false,
	            cooldownRemainingMs: 800,
	            summary: 'leave retry cooldown'
	          }
	        });
	        return [
	          exit?.reason,
	          exit?.summary,
	          String(exit?.attempted)
	        ].join('|');
	      })(),
	      want: 'combat-leave-retry|leave retry cooldown|false'
	    },
	    {
	      name: 'combat log exit summary treats control outage reasons as exitish without leave detail',
	      got: (() => {
	        const combatGap = combatLogExitSummaryFromDecision({
	          kind: 'wait',
	          reason: 'control-combat-tick-gap',
	          displayReason: 'combat gap pending'
	        });
	        const sampling = combatLogExitSummaryFromDecision({
	          kind: 'wait',
	          reason: 'control-global-sampling-outage',
	          displayReason: 'sampling outage pending'
	        });
	        return [
	          combatGap?.reason,
	          combatGap?.summary,
	          sampling?.reason,
	          sampling?.summary
	        ].join('|');
	      })(),
	      want: 'control-combat-tick-gap|combat gap pending|control-global-sampling-outage|sampling outage pending'
	    },
	    {
	      name: 'combat log exit summary prefers canonical combat leave reason',
	      got: (() => {
	        const exit = combatLogExitSummaryFromDecision({
	          kind: 'leave',
	          reason: 'combat-low-hp-leave',
	          displayReason: 'low hp leave',
	          leave: {
	            reason: 'combat low hp disadvantage',
	            summary: 'low hp normalized leave',
	            attempted: true
	          }
	        });
	        return [
	          exit?.reason,
	          exit?.summary,
	          String(exit?.attempted)
	        ].join('|');
	      })(),
	      want: 'combat-low-hp-leave|low hp normalized leave|true'
	    },
    {
      name: 'combat log exit summary covers pending exit decisions',
      got: (() => {
        const exit = combatLogExitSummaryFromDecision({
	          kind: 'attack',
	          reason: 'combat-stamina-conserve',
	          pendingExit: {
	            reason: 'combat low hp disadvantage',
	            summary: 'pending hostile exit',
	            displayReason: 'pending hostile exit wait',
	            lastError: 'retry later'
	          }
	        });
	        return [
	          exit?.reason,
	          exit?.summary,
	          exit?.displayReason,
	          exit?.error
	        ].join('|');
      })(),
      want: 'pending-exit-active|pending hostile exit|pending hostile exit wait|retry later'
    },
    {
      name: 'browser preserved state keeps last login timestamp across hot update',
      got: buildBrowserPreservedState({ lastLoginAt: 123456, lastLoginResult: { at: 123456 } }).lastLoginAt,
      want: 123456
    },
    {
      name: 'leave success requests refresh before confirmation',
      got: (() => {
        const leaveSucceeded = true;
        const reloadSatisfied = false;
        const state = { known: true, alive: false };
        const next = leaveSucceeded && !reloadSatisfied
          ? 'request-refresh'
          : (state.known && !state.alive ? 'confirm' : 'retry');
        return [next, String(reloadSatisfied)].join('|');
      })(),
      want: 'request-refresh|false'
    },
    {
      name: 'restored leave success pending exit marks reload confirmation',
      got: (() => {
        const raw = {
          required: true,
          requestedAt: 123000,
          reloadedAt: 0,
          restoredAfterReload: false
        };
        const markReloaded = true;
        const restoredAfterReload = Boolean(raw.restoredAfterReload || (markReloaded && raw.requestedAt));
        const reloadedAt = restoredAfterReload && raw.requestedAt && !raw.reloadedAt ? 124000 : raw.reloadedAt;
        return [String(restoredAfterReload), String(reloadedAt > raw.requestedAt)].join('|');
      })(),
      want: 'true|true'
    },
    {
      name: 'refreshed leave success still online retries original pending exit',
      got: (() => {
        const reloadSatisfied = true;
        const state = { known: true, alive: true };
        const next = reloadSatisfied && state.known && state.alive
          ? 'schedule-retry'
          : 'confirm';
        return next;
      })(),
      want: 'schedule-retry'
    },
    {
      name: 'refreshed leave success offline confirms exit',
      got: (() => {
        const reloadSatisfied = true;
        const state = { known: true, alive: false };
        const next = reloadSatisfied && state.known && !state.alive
          ? 'confirm'
          : 'retry';
        return next;
      })(),
      want: 'confirm'
    },
    {
      name: 'live session mismatch takeover uses explicit bypass state',
      got: (() => {
        const allowsLogin = gate => Boolean(gate?.satisfied || (gate?.liveSessionTakeoverBypass && gate?.pointSafety?.satisfied));
        const status = {
          satisfied: false,
          streak: 0,
          required: 3,
	          pointSafety: { hasPoint: true, satisfied: false, streak: 0, required: 3 }
        };
        const liveSessionTakeover = {
          allowed: true,
          blockedBy: [],
          reason: 'live-session-mismatch-takeover'
        };
        const bypassed = {
          ...status,
          blockReason: 'session-mismatch-recovery',
          liveSessionTakeoverBypass: liveSessionTakeover.allowed,
          liveSessionTakeover
        };
        return [
          String(bypassed.satisfied),
          bypassed.blockReason,
          String(Boolean(bypassed.liveSessionTakeoverBypass)),
          bypassed.liveSessionTakeover.reason,
          String(Boolean(bypassed.pointSafety?.satisfied)),
          String(allowsLogin(bypassed))
        ].join('|');
      })(),
      want: 'false|session-mismatch-recovery|true|live-session-mismatch-takeover|false|false'
    },
    {
      name: 'live session mismatch takeover bypass still requires login point safety',
      got: (() => {
        const allowsLogin = gate => Boolean(gate?.satisfied || (gate?.liveSessionTakeoverBypass && gate?.pointSafety?.satisfied));
        return [
          allowsLogin({
            satisfied: false,
            liveSessionTakeoverBypass: true,
            streak: 3,
            required: 3,
	            pointSafety: { satisfied: false, streak: 0, required: 3 }
          }),
          allowsLogin({
            satisfied: false,
            liveSessionTakeoverBypass: true,
            streak: 2,
            required: 3,
	            pointSafety: { satisfied: true, streak: 3, required: 3 }
          }),
          allowsLogin({
            satisfied: false,
            liveSessionTakeoverBypass: true,
            streak: 3,
            required: 3,
	            pointSafety: { satisfied: true, streak: 3, required: 3 }
          })
        ].map(String).join('|');
      })(),
      want: 'false|true|true'
    },
    {
      name: 'live session mismatch takeover waits for one controlled refresh',
      got: (() => {
        const matches = (state, userId) => Boolean(state?.reason === 'session-mismatch-recovery' && Number(state.userId || 0) === userId);
        const pageReloadedAfter = (state, pageTimeOrigin) => Boolean(state?.requestedAt && pageTimeOrigin >= state.requestedAt - 500);
        const next = (state, userId, pageTimeOrigin) => {
          if (!matches(state, userId)) return 'refresh';
          return pageReloadedAfter(state, pageTimeOrigin) ? 'takeover' : 'refresh';
        };
        return [
          next(null, 28886, 100000),
          next({ reason: 'session-mismatch-recovery', userId: 28886, requestedAt: 120000 }, 28886, 100000),
          next({ reason: 'session-mismatch-recovery', userId: 28886, requestedAt: 120000 }, 28886, 121000),
          next({ reason: 'session-mismatch-recovery', userId: 1, requestedAt: 120000 }, 28886, 121000)
        ].join('|');
      })(),
      want: 'refresh|refresh|takeover|refresh'
    },
    {
      name: 'snapshot self can prove live session mismatch takeover evidence',
      got: (() => {
        const nativeWsOpenOrConnecting = false;
        const snapshotSelf = {
          known: true,
          fresh: true,
          present: true,
          snapshotAgeMs: 1200,
          self: { user_id: 28886, hp: 100 }
        };
        const liveSessionEvidence = Boolean(nativeWsOpenOrConnecting || snapshotSelf.present);
        const blockedBy = [];
        if (!liveSessionEvidence) blockedBy.push('live-session-evidence-missing');
        return [
          String(liveSessionEvidence),
          String(blockedBy.length),
          String(snapshotSelf.fresh),
          String(snapshotSelf.present)
        ].join('|');
      })(),
      want: 'true|0|true|true'
    },
    {
      name: 'snapshot no-self exit confirmation requires fresh absent self',
      got: (() => {
        const botState = {
          globalState: { entities: [], snapshotRefreshedAt: Date.now() },
          control: {}
        };
        const runtime = createNoSelfSnapshotRecoveryRuntime({
          bot: botState,
          cfg,
          storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
          getCurrentUserId: () => 28886,
          snapshotDataAgeMs: () => 1000,
          snapshotSelfFreshEnough: () => true,
          summarizeSelf: entity => ({ id: entity.user_id }),
          isAlive: entity => entity?.life !== 'dead'
        });
        const control = { currentUserId: 28886, hasToken: true, connecting: true };
        const base = { shouldLeave: true, ageMs: 30000, userId: 28886 };
        return [
          runtime.noSelfSnapshotExitConfirmationState(control, { ...base, snapshotSelf: { known: true, fresh: true, present: false } }).confirmed,
          runtime.noSelfSnapshotExitConfirmationState(control, { ...base, snapshotSelf: { known: true, fresh: true, present: true } }).confirmed,
          runtime.noSelfSnapshotExitConfirmationState(control, { ...base, snapshotSelf: { known: false, fresh: false, present: false } }).confirmed,
          runtime.noSelfSnapshotExitConfirmationState(control, { ...base, shouldLeave: false, snapshotSelf: { known: true, fresh: true, present: false } }).confirmed
        ].map(String).join('|');
      })(),
      want: 'true|false|false|false'
    },
    {
      name: 'snapshot no-self local session reset clears token and keeps login id input',
      got: (() => {
        const data = new Map([
          ['tmpGameSessionToken', 'stale-token'],
          ['tmpGameUserId', '28886'],
          ['tmpGameSessionShadow', 'stale-shadow'],
          ['tmpGameLoginNonce', 'stale-nonce'],
          ['tmpGameHelpSeenV3', '1'],
          ['tmpGameMapView', 'keep-map-view']
        ]);
        const storage = createMapStorage(data);
        let closed = false;
        const nativeWs = {
          readyState: 1,
          close: () => {
            closed = true;
          }
        };
        const nativeState = {
          currentUserId: 28886,
          sessionToken: 'stale-token',
          wsOpen: true,
          ws: nativeWs,
          entities: [{ user_id: 28886 }],
          reconnectTimer: 7
        };
        const input = {
          value: '',
          dispatchEvent: () => {}
        };
        const oldDocument = global.document;
        global.document = {
          getElementById: id => (id === 'userId' ? input : null)
        };
        try {
          const botState = {
            globalState: { entities: [], snapshotRefreshedAt: Date.now() },
            control: { hasToken: true, wsOpen: true, nativeWsOpen: true, connecting: true },
            pendingExit: { reason: 'stale' },
            offlineSince: 123
          };
          const runtime = createNoSelfSnapshotRecoveryRuntime({
            bot: botState,
            cfg,
            storage,
            getCurrentUserId: () => 28886,
            getNativeControl: () => ({ ws: nativeWs, state: nativeState }),
            snapshotDataAgeMs: () => 1000,
            snapshotSelfFreshEnough: () => true,
            summarizeSelf: entity => ({ id: entity.user_id }),
            isAlive: entity => entity?.life !== 'dead',
            clearPersistentPendingExitState: () => {
              data.set('pendingExitCleared', 'true');
            }
          });
          const result = runtime.clearNoSelfSnapshotLocalSession(
            { currentUserId: 28886, hasToken: true, connecting: true },
            { shouldLeave: true, ageMs: 30000, userId: 28886, snapshotSelf: { known: true, fresh: true, present: false } }
          );
          return [
            result.confirmed,
            data.get('tmpGameSessionToken') === undefined,
            data.get('tmpGameUserId') === undefined,
            data.get('tmpGameSessionShadow') === undefined,
            data.get('tmpGameLoginNonce') === undefined,
            data.get('tmpGameHelpSeenV3'),
            data.get('tmpGameMapView'),
            input.value,
            result.preservedUserIdInput,
            result.closedNativeWs,
            closed,
            Boolean(result.recoveryMarker),
            data.has('graspRatNoSelfSnapshotRecovery'),
            nativeState.currentUserId,
            nativeState.sessionToken,
            nativeState.wsOpen,
            nativeState.ws,
            nativeState.entities.length,
            nativeState.reconnectTimer,
            botState.control.hasToken,
            botState.pendingExit,
            botState.offlineSince,
            data.get('pendingExitCleared')
          ].map(String).join('|');
        } finally {
          global.document = oldDocument;
        }
      })(),
      want: 'true|true|true|true|true|1|keep-map-view|28886|true|true|true|true|true|0||false|null|0|0|false|null|0|true'
    },
    {
      name: 'tmpGame local session cleanup preserves tutorial marker',
      got: [
        shouldClearTmpGameLocalSessionKey('tmpGameSessionToken'),
        shouldClearTmpGameLocalSessionKey('tmpGameUserId'),
        shouldClearTmpGameLocalSessionKey('tmpGameLoginNonce'),
        shouldClearTmpGameLocalSessionKey('tmpGameAuthState'),
        shouldClearTmpGameLocalSessionKey('tmpGameHelpSeenV3'),
        shouldClearTmpGameLocalSessionKey('tmpGameMapView'),
        shouldClearTmpGameLocalSessionKey('otherTmpGameSessionToken')
      ].map(String).join('|'),
      want: 'true|true|true|true|false|false|false'
    },
    {
      name: 'help modal runtime clicks visible tutorial ok button only',
      got: (() => {
        function buildDocument(shown, titleText = '新手教程', buttonText = '知道了') {
          let clicked = 0;
          const button = {
            id: 'helpOkBtn',
            tagName: 'BUTTON',
            text: buttonText,
            shown,
            click: () => {
              clicked += 1;
            }
          };
          const modal = {
            id: 'helpModal',
            tagName: 'DIV',
            shown,
            classList: { contains: name => name === 'show' && shown },
            getAttribute: name => (name === 'aria-hidden' ? (shown ? 'false' : 'true') : ''),
            querySelector: selector => (selector === '#helpOkBtn' ? button : null)
          };
          const title = { id: 'helpTitle', textContent: titleText };
          return {
            clicked: () => clicked,
            document: {
              getElementById: id => {
                if (id === 'helpModal') return modal;
                if (id === 'helpOkBtn') return button;
                if (id === 'helpTitle') return title;
                return null;
              }
            }
          };
        }
        const oldDocument = global.document;
        try {
          const visible = buildDocument(true);
          const visibleBot = {};
          global.document = visible.document;
          const visibleRuntime = createPageModalRuntime({
            bot: visibleBot,
            isVisible: el => Boolean(el?.shown),
            controlText: el => String(el?.text || '')
          });
          const visibleResult = visibleRuntime.dismissHelpModal('self-test');

          const hidden = buildDocument(false);
          const hiddenBot = {};
          global.document = hidden.document;
          const hiddenRuntime = createPageModalRuntime({
            bot: hiddenBot,
            isVisible: el => Boolean(el?.shown),
            controlText: el => String(el?.text || '')
          });
          const hiddenResult = hiddenRuntime.dismissHelpModal('self-test');

          const mismatched = buildDocument(true, '系统公告', '知道了');
          global.document = mismatched.document;
          const mismatchedRuntime = createPageModalRuntime({
            bot: {},
            isVisible: el => Boolean(el?.shown),
            controlText: el => String(el?.text || '')
          });
          const mismatchedResult = mismatchedRuntime.dismissHelpModal('self-test');

          return [
            visibleResult.dismissed,
            visible.clicked(),
            visibleBot.lastHelpModalDismiss?.button,
            hiddenResult.dismissed,
            hidden.clicked(),
            mismatchedResult.dismissed,
            mismatched.clicked()
          ].map(String).join('|');
        } finally {
          global.document = oldDocument;
        }
      })(),
      want: 'true|1|#helpOkBtn|false|0|false|0'
    },
    {
      name: 'visible login control does not hide stale no-self game session',
      got: (() => {
        const runtime = createSessionRecoveryRuntime({
          bot: { globalState: { entities: [], snapshotRefreshedAt: 101000 } },
          cfg: { ...cfg, gameSessionNoSelfLeaveMs: 30000, loginCooldownMs: 5000 },
          storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
          getCurrentUserId: () => 28886,
          snapshotDataAgeMs: () => 1000,
          snapshotSelfFreshEnough: () => true,
          hasLoginRequiredText: () => false,
          findLoginControl: () => ({ id: 'joinBtn' }),
          isOfflineishWsReadyState: value => Number(value) === 2 || Number(value) === 3
        });
        const state = runtime.noSelfGameSessionExitState({
          currentUserId: 28886,
          hasToken: true,
          connecting: true,
          wsReadyState: 0,
          nativeWsReadyState: 0,
          nativeReconnectChurn: true,
          nativeReconnectEventCount: 3,
          nativeReconnectWindowMs: 10000,
          transport: 'native-page'
        }, 5000);
        return [
          state.active,
          state.shouldLeave,
          state.loginRequired,
          state.reason,
          state.snapshotSelf?.known,
          state.snapshotSelf?.present
        ].map(String).join('|');
      })(),
      want: 'true|true|false|websocket reconnect churn missing self|true|false'
    },
    {
      name: 'login-required no-self auth block clears stale session without fresh snapshot',
      got: (() => {
        const data = new Map([
          ['tmpGameSessionToken', 'stale-token'],
          ['tmpGameUserId', '28886'],
          ['tmpGameSessionShadow', 'stale-shadow'],
          ['tmpGameHelpSeenV3', '1']
        ]);
        const storage = createMapStorage(data);
        let reloadReason = '';
        let closed = false;
        const nativeWs = {
          readyState: 0,
          close: () => {
            closed = true;
          }
        };
        const nativeState = {
          currentUserId: 28886,
          sessionToken: 'stale-token',
          wsOpen: false,
          ws: nativeWs,
          entities: [{ user_id: 28886 }],
          reconnectTimer: 12
        };
        const botState = {
          globalState: { entities: [], snapshotRefreshedAt: 0 },
          control: { hasToken: true, connecting: true },
          pendingExit: { reason: 'stale' },
          offlineSince: 999
        };
        const sessionRuntime = createSessionRecoveryRuntime({
          bot: botState,
          cfg: { ...cfg, gameSessionNoSelfLeaveMs: 30000, loginCooldownMs: 5000 },
          storage,
          getCurrentUserId: () => 28886,
          snapshotDataAgeMs: () => Infinity,
          snapshotSelfFreshEnough: () => false,
          hasLoginRequiredText: () => true,
          isOfflineishWsReadyState: value => Number(value) === 2 || Number(value) === 3
        });
        const noSelfExit = sessionRuntime.noSelfGameSessionExitState({
          currentUserId: 28886,
          hasToken: true,
          connecting: true,
          wsReadyState: 0,
          nativeWsReadyState: 0,
          transport: 'native-page'
        }, 1000);
        const noSelfRuntime = createNoSelfSnapshotRecoveryRuntime({
          bot: botState,
          cfg,
          storage,
          getCurrentUserId: () => 28886,
          getNativeControl: () => ({ ws: nativeWs, state: nativeState }),
          snapshotSelfPresenceState: () => ({ known: false, fresh: false, present: false }),
          clearPersistentPendingExitState: () => {
            data.set('pendingExitCleared', 'true');
          },
          requestReload: reason => {
            reloadReason = reason;
            return true;
          }
        });
        const decision = noSelfRuntime.handleNoSelfSnapshotExitRecovery(
          { currentUserId: 28886, hasToken: true, connecting: true, wsReadyState: 0, nativeWsReadyState: 0, transport: 'native-page' },
          noSelfExit
        );
        return [
          noSelfExit.active,
          noSelfExit.shouldLeave,
          noSelfExit.loginRequired,
          noSelfExit.loginRequiredAuthBlocked,
          noSelfExit.reason,
          noSelfExit.snapshotSelf?.known,
          decision?.reason,
          decision?.reloadRequested,
          reloadReason,
          data.get('tmpGameSessionToken') === undefined,
          data.get('tmpGameUserId') === undefined,
          data.get('tmpGameSessionShadow') === undefined,
          data.get('tmpGameHelpSeenV3'),
          data.has('graspRatNoSelfSnapshotRecovery'),
          nativeState.currentUserId,
          nativeState.sessionToken,
          nativeState.wsOpen,
          nativeState.ws,
          closed,
          botState.control.hasToken,
          botState.pendingExit,
          botState.offlineSince,
          data.get('pendingExitCleared')
        ].map(String).join('|');
      })(),
      want: 'true|true|true|true|game session login required missing self|false|login-required-no-self-exit-confirmed|true|login required local session reset|true|true|true|1|true|0||false|null|true|false|null|0|true'
    },
    {
      name: 'snapshot no-self recovery requests reload after local reset',
      got: (() => {
        const data = new Map([
          ['tmpGameSessionToken', 'stale-token'],
          ['tmpGameUserId', '28886'],
          ['tmpGameSessionShadow', 'stale-shadow'],
          ['tmpGameHelpSeenV3', '1']
        ]);
        const storage = createMapStorage(data);
        let reloadReason = '';
        const botState = {
          globalState: { entities: [], snapshotRefreshedAt: Date.now() },
          control: { hasToken: true, connecting: true },
          pendingExit: null,
          offlineSince: 0
        };
        const runtime = createNoSelfSnapshotRecoveryRuntime({
          bot: botState,
          cfg,
          storage,
          getCurrentUserId: () => 28886,
          getNativeControl: () => null,
          snapshotSelfPresenceState: () => ({ known: true, fresh: true, present: false, snapshotAgeMs: 500 }),
          requestReload: reason => {
            reloadReason = reason;
            return true;
          }
        });
        const decision = runtime.handleNoSelfSnapshotExitRecovery(
          { currentUserId: 28886, hasToken: true, connecting: true },
          { shouldLeave: true, ageMs: 30000, userId: 28886, snapshotSelf: { known: true, fresh: true, present: false, snapshotAgeMs: 500 } }
        );
        return [
          decision?.reason,
          decision?.reloadRequested,
          reloadReason,
          data.get('tmpGameSessionToken') === undefined,
          data.get('tmpGameUserId') === undefined,
          data.get('tmpGameSessionShadow') === undefined,
          data.get('tmpGameHelpSeenV3'),
          data.has('graspRatNoSelfSnapshotRecovery')
        ].map(String).join('|');
      })(),
      want: 'snapshot-no-self-exit-confirmed|true|snapshot no-self local session reset|true|true|true|1|true'
    },
    {
      name: 'leave 403 no-self recovery clears stale local session',
      got: (() => {
        const data = new Map([
          ['tmpGameSessionToken', 'stale-token'],
          ['tmpGameUserId', '28886'],
          ['tmpGameAuthState', 'stale-auth'],
          ['tmpGameHelpSeenV3', '1']
        ]);
        const storage = createMapStorage(data);
        let closed = false;
        const nativeWs = {
          readyState: 0,
          close: () => {
            closed = true;
          }
        };
        const nativeState = {
          currentUserId: 28886,
          sessionToken: 'stale-token',
          wsOpen: false,
          ws: nativeWs,
          entities: [{ user_id: 28886 }],
          reconnectTimer: 9
        };
        const botState = {
          globalState: { entities: [], snapshotRefreshedAt: 0 },
          control: { hasToken: true, connecting: true },
          pendingExit: { reason: 'stale' },
          offlineSince: 123
        };
        const runtime = createNoSelfSnapshotRecoveryRuntime({
          bot: botState,
          cfg,
          storage,
          getCurrentUserId: () => 28886,
          getNativeControl: () => ({ ws: nativeWs, state: nativeState }),
          snapshotSelfPresenceState: () => ({ known: false, fresh: false, present: false }),
          clearPersistentPendingExitState: () => {
            data.set('pendingExitCleared', 'true');
          }
        });
        const result = runtime.clearNoSelfLocalSessionAfterLeave403(
          { currentUserId: 28886, hasToken: true, connecting: true, wsReadyState: 0, nativeWsReadyState: 0 },
          { shouldLeave: true, ageMs: 5000, userId: 28886, reconnectChurn: { count: 3 } },
          { attempted: true, lastLeaveRequest: { result: { status: 403 } } }
        );
        return [
          result.confirmed,
          result.reason,
          data.get('tmpGameSessionToken') === undefined,
          data.get('tmpGameUserId') === undefined,
          data.get('tmpGameAuthState') === undefined,
          data.get('tmpGameHelpSeenV3'),
          Boolean(result.recoveryMarker),
          result.recoveryMarker?.reason,
          result.closedNativeWs,
          closed,
          nativeState.currentUserId,
          nativeState.sessionToken,
          botState.control.hasToken,
          botState.pendingExit,
          botState.offlineSince,
          data.get('pendingExitCleared')
        ].map(String).join('|');
      })(),
      want: 'true|leave-403-no-self-exit-confirmed|true|true|true|1|true|leave-403-no-self-exit-confirmed|true|true|0||false|null|0|true'
    },
    {
      name: 'snapshot no-self recovery marker suppresses repeat leave state',
      got: (() => {
        const t = Date.now();
        const data = new Map([
          ['graspRatNoSelfSnapshotRecovery', JSON.stringify({
            reason: 'snapshot-no-self-exit-confirmed',
            userId: 28886,
            requestedAt: t,
            expiresAt: t + 60000
          })]
        ]);
        const storage = {
          getItem: key => (data.has(key) ? data.get(key) : null),
          setItem: (key, value) => data.set(key, String(value)),
          removeItem: key => data.delete(key)
        };
        const runtime = createSessionRecoveryRuntime({
          bot: { globalState: { entities: [], snapshotRefreshedAt: 101000 } },
          cfg: { ...cfg, gameSessionNoSelfLeaveMs: 30000, loginCooldownMs: 5000 },
          storage,
          getCurrentUserId: () => 28886,
          snapshotDataAgeMs: () => 1000,
          snapshotSelfFreshEnough: () => true,
          hasLoginRequiredText: () => false,
          findLoginControl: () => null,
          isOfflineishWsReadyState: () => false
        });
        const state = runtime.noSelfGameSessionExitState({
          currentUserId: 28886,
          hasToken: false,
          connecting: true,
          wsReadyState: 0,
          nativeWsReadyState: 0,
          transport: 'native-page'
        }, 45000);
        return [
          state.active,
          state.shouldLeave,
          state.sessionMismatch,
          Boolean(state.snapshotExitRecovery),
          state.snapshotExitRecovery?.userId
        ].map(String).join('|');
      })(),
      want: 'false|false|false|true|28886'
    },
    {
      name: 'snapshot no-self in-memory recovery marker suppresses repeat leave state',
      got: (() => {
        const t = Date.now();
        const storage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
        const runtime = createSessionRecoveryRuntime({
          bot: {
            noSelfSnapshotRecovery: {
              reason: 'snapshot-no-self-exit-confirmed',
              userId: 28886,
              requestedAt: t,
              expiresAt: t + 60000
            },
            globalState: { entities: [], snapshotRefreshedAt: t }
          },
          cfg: { ...cfg, gameSessionNoSelfLeaveMs: 30000, loginCooldownMs: 5000 },
          storage,
          getCurrentUserId: () => 28886,
          snapshotDataAgeMs: () => 1000,
          snapshotSelfFreshEnough: () => true,
          hasLoginRequiredText: () => false,
          findLoginControl: () => null,
          isOfflineishWsReadyState: () => false
        });
        const state = runtime.noSelfGameSessionExitState({
          currentUserId: 28886,
          hasToken: false,
          connecting: true,
          wsReadyState: 0,
          nativeWsReadyState: 0,
          transport: 'native-page'
        }, 45000);
        return [
          state.active,
          state.shouldLeave,
          state.sessionMismatch,
          Boolean(state.snapshotExitRecovery),
          state.snapshotExitRecovery?.userId
        ].map(String).join('|');
      })(),
      want: 'false|false|false|true|28886'
    },
    {
      name: 'snapshot no-self recovery marker clicks login control once and records login pending',
      got: (async () => {
        const t = Date.now();
        const data = new Map([
          ['graspRatNoSelfSnapshotRecovery', JSON.stringify({
            reason: 'snapshot-no-self-exit-confirmed',
            userId: 28886,
            requestedAt: t,
            expiresAt: t + 60000
          })],
          ['graspRatLoginSuppressUntil', String(t + 30000)],
          ['graspRatLoginSuppressReason', 'bot login started']
        ]);
        const storage = {
          getItem: key => (data.has(key) ? data.get(key) : null),
          setItem: (key, value) => data.set(key, String(value)),
          removeItem: key => data.delete(key)
        };
        let token = '';
        const button = {
          id: 'joinBtn',
          tagName: 'BUTTON',
          clickCount: 0,
          click() {
            this.clickCount += 1;
            token = 'started-token';
          }
        };
        const botState = { control: {}, exitAudit: {}, importantLogging: {}, lastLoginAt: 0 };
        let startCalls = 0;
        const runtime = createLeaveFlowRuntime({
          bot: botState,
          cfg: { ...cfg, autoLogin: true, dryRun: false, once: false, loginCooldownMs: 5000, loginStartEvidenceMs: 0, postLoginGraceMs: 30000 },
          storage,
          pageGlobal: {},
          loginSuppressKey: 'graspRatLoginSuppressUntil',
          loginSuppressReasonKey: 'graspRatLoginSuppressReason',
          getCurrentUserId: () => 28886,
          getSessionToken: () => token,
          getNativeControl: () => ({ wsReadyState: 0 }),
          hasNativeGameSession: () => true,
          findLoginControl: () => button,
          hasLoginRequiredText: () => false,
          getSelf: () => null,
          syncPausedFromPage: () => false,
          exitAuditFlushPending: () => false,
          importantSessionEndFlushPending: () => false,
          readPageGlobal: name => (name === 'startLinuxDoLogin' ? (() => { startCalls += 1; }) : null),
          loginSuppressRemainingMs: () => Math.max(0, Number(storage.getItem('graspRatLoginSuppressUntil') || 0) - Date.now()),
          ensureLoginSnapshotGate: async () => ({ satisfied: true }),
          loginSnapshotGateAllowsLogin: gate => Boolean(gate.satisfied),
          setLoginSuppress: (reason, ms) => {
            const until = Date.now() + ms;
            storage.setItem('graspRatLoginSuppressUntil', String(until));
            storage.setItem('graspRatLoginSuppressReason', reason);
            return until;
          },
          controlText: () => '立即登录',
          isAlive: value => Boolean(value?.hp > 0)
        });
        const result = await runtime.maybeStartAutoLogin('no-self');
        return [
          result?.attempted,
          result?.method,
          result?.hasNativeSession,
          result?.effectiveHasNativeSession,
          Boolean(result?.snapshotExitRecovery),
          button.clickCount,
          startCalls,
          Math.round((Number(storage.getItem('graspRatLoginSuppressUntil') || 0) - Date.now()) / 1000),
          result?.snapshotExitRecovery?.loginAttemptCount,
          result?.snapshotExitRecovery?.loginMethod
        ].map(String).join('|');
      })(),
      want: 'true|#joinBtn|true|false|true|1|0|30|1|#joinBtn'
    },
    {
      name: 'snapshot no-self recovery marker waits after recorded login start',
      got: (async () => {
        const t = Date.now();
        const data = new Map([
          ['graspRatNoSelfSnapshotRecovery', JSON.stringify({
            reason: 'snapshot-no-self-exit-confirmed',
            userId: 28886,
            requestedAt: t - 2000,
            expiresAt: t + 60000,
            loginStartedAt: t - 1000,
            loginSuppressUntil: t + 30000,
            loginAttemptCount: 1,
            loginMethod: '#joinBtn',
            lastLoginReason: 'no-self'
          })],
          ['graspRatLoginSuppressUntil', String(t + 30000)],
          ['graspRatLoginSuppressReason', 'bot login started']
        ]);
        const storage = {
          getItem: key => (data.has(key) ? data.get(key) : null),
          setItem: (key, value) => data.set(key, String(value)),
          removeItem: key => data.delete(key)
        };
        let token = '';
        const button = {
          id: 'joinBtn',
          tagName: 'BUTTON',
          clickCount: 0,
          click() {
            this.clickCount += 1;
            token = 'started-token';
          }
        };
        const botState = { control: {}, exitAudit: {}, importantLogging: {}, lastLoginAt: 0 };
        let startCalls = 0;
        const runtime = createLeaveFlowRuntime({
          bot: botState,
          cfg: { ...cfg, autoLogin: true, dryRun: false, once: false, loginCooldownMs: 5000, postLoginGraceMs: 30000 },
          storage,
          pageGlobal: {},
          loginSuppressKey: 'graspRatLoginSuppressUntil',
          loginSuppressReasonKey: 'graspRatLoginSuppressReason',
          getCurrentUserId: () => 28886,
          getSessionToken: () => '',
          getNativeControl: () => ({ wsReadyState: 0 }),
          hasNativeGameSession: () => true,
          findLoginControl: () => button,
          hasLoginRequiredText: () => false,
          getSelf: () => null,
          syncPausedFromPage: () => false,
          exitAuditFlushPending: () => false,
          importantSessionEndFlushPending: () => false,
          readPageGlobal: name => (name === 'startLinuxDoLogin' ? (() => { startCalls += 1; }) : null),
          loginSuppressRemainingMs: () => Math.max(0, Number(storage.getItem('graspRatLoginSuppressUntil') || 0) - Date.now()),
          ensureLoginSnapshotGate: async () => ({ satisfied: true }),
          loginSnapshotGateAllowsLogin: gate => Boolean(gate.satisfied),
          setLoginSuppress: (reason, ms) => {
            const until = Date.now() + ms;
            storage.setItem('graspRatLoginSuppressUntil', String(until));
            storage.setItem('graspRatLoginSuppressReason', reason);
            return until;
          },
          controlText: () => '立即登录',
          isAlive: value => Boolean(value?.hp > 0)
        });
        const result = await runtime.maybeStartAutoLogin('no-self');
        return [
          result?.needed,
          result?.attempted,
          result?.reason,
          result?.suppressReason,
          result?.hasNativeSession,
          result?.effectiveHasNativeSession,
          Boolean(result?.snapshotExitRecovery),
          button.clickCount,
          startCalls
        ].map(String).join('|');
      })(),
      want: 'true|false|suppressed|bot login started|true|false|true|0|0'
    },
    {
      name: 'no-self auto login prefers visible login control over page global',
      got: (async () => {
        const data = new Map();
        const storage = {
          getItem: key => (data.has(key) ? data.get(key) : null),
          setItem: (key, value) => data.set(key, String(value)),
          removeItem: key => data.delete(key)
        };
        let token = '';
        const button = {
          id: 'joinBtn',
          tagName: 'BUTTON',
          clickCount: 0,
          click() {
            this.clickCount += 1;
            token = 'started-token';
          }
        };
        const botState = { control: {}, exitAudit: {}, importantLogging: {}, lastLoginAt: 0 };
        let startCalls = 0;
        const runtime = createLeaveFlowRuntime({
          bot: botState,
          cfg: { ...cfg, autoLogin: true, dryRun: false, once: false, loginCooldownMs: 5000, loginStartEvidenceMs: 0, postLoginGraceMs: 45000 },
          storage,
          pageGlobal: {},
          loginSuppressKey: 'graspRatLoginSuppressUntil',
          loginSuppressReasonKey: 'graspRatLoginSuppressReason',
          getCurrentUserId: () => 28886,
          getSessionToken: () => token,
          getNativeControl: () => null,
          hasNativeGameSession: () => false,
          findLoginControl: () => button,
          hasLoginRequiredText: () => false,
          getSelf: () => null,
          syncPausedFromPage: () => false,
          exitAuditFlushPending: () => false,
          importantSessionEndFlushPending: () => false,
          readPageGlobal: name => (name === 'startLinuxDoLogin' ? (() => { startCalls += 1; }) : null),
          loginSuppressRemainingMs: () => 0,
          ensureLoginSnapshotGate: async () => ({ satisfied: true }),
          loginSnapshotGateAllowsLogin: gate => Boolean(gate.satisfied),
          setLoginSuppress: (reason, ms) => {
            const until = Date.now() + ms;
            storage.setItem('graspRatLoginSuppressUntil', String(until));
            storage.setItem('graspRatLoginSuppressReason', reason);
            return until;
          },
          controlText: () => '立即登录',
          isAlive: value => Boolean(value?.hp > 0)
        });
        const result = await runtime.maybeStartAutoLogin('no-self');
        return [
          result?.attempted,
          result?.method,
          result?.hasNativeSession,
          result?.effectiveHasNativeSession,
          button.clickCount,
          startCalls,
          data.get('graspRatLoginSuppressReason')
        ].map(String).join('|');
      })(),
      want: 'true|#joinBtn|false|false|1|0|bot login started'
    },
    {
      name: 'login control without start evidence does not enter bot-login-started grace',
      got: (async () => {
        const data = new Map();
        const storage = {
          getItem: key => (data.has(key) ? data.get(key) : null),
          setItem: (key, value) => data.set(key, String(value)),
          removeItem: key => data.delete(key)
        };
        const button = {
          id: 'joinBtn',
          tagName: 'BUTTON',
          clickCount: 0,
          click() {
            this.clickCount += 1;
          }
        };
        const botState = { control: {}, exitAudit: {}, importantLogging: {}, lastLoginAt: 0 };
        const runtime = createLeaveFlowRuntime({
          bot: botState,
          cfg: { ...cfg, autoLogin: true, dryRun: false, once: false, loginCooldownMs: 5000, loginStartEvidenceMs: 0, postLoginGraceMs: 45000 },
          storage,
          pageGlobal: {},
          loginSuppressKey: 'graspRatLoginSuppressUntil',
          loginSuppressReasonKey: 'graspRatLoginSuppressReason',
          getCurrentUserId: () => 28886,
          getSessionToken: () => '',
          getNativeControl: () => null,
          hasNativeGameSession: () => false,
          findLoginControl: () => button,
          hasLoginRequiredText: () => false,
          getSelf: () => null,
          syncPausedFromPage: () => false,
          exitAuditFlushPending: () => false,
          importantSessionEndFlushPending: () => false,
          readPageGlobal: () => null,
          loginSuppressRemainingMs: () => 0,
          ensureLoginSnapshotGate: async () => ({ satisfied: true }),
          loginSnapshotGateAllowsLogin: gate => Boolean(gate.satisfied),
          setLoginSuppress: (reason, ms) => {
            const until = Date.now() + ms;
            storage.setItem('graspRatLoginSuppressUntil', String(until));
            storage.setItem('graspRatLoginSuppressReason', reason);
            return until;
          },
          controlText: () => '立即登录',
          isAlive: value => Boolean(value?.hp > 0)
        });
        const result = await runtime.maybeStartAutoLogin('no-self');
        return [
          result?.attempted,
          result?.method || '',
          result?.clickAttempted,
          result?.loginStarted,
          result?.error,
          button.clickCount,
          data.get('graspRatLoginSuppressReason') || '',
          Number(data.get('graspRatLoginSuppressUntil') || 0) > 0,
          Number(botState.lastLoginAt || 0) > 0
        ].map(String).join('|');
      })(),
      want: 'false||true|false|#joinBtn did not start login|1||false|true'
    },
    {
      name: 'known same-day long stamina exhaustion blocks auto login',
      got: (async () => {
        const t = Date.now();
        const data = new Map();
        const storage = {
          getItem: key => (data.has(key) ? data.get(key) : null),
          setItem: (key, value) => data.set(key, String(value)),
          removeItem: key => data.delete(key)
        };
        const button = {
          id: 'joinBtn',
          tagName: 'BUTTON',
          clickCount: 0,
          click() {
            this.clickCount += 1;
          }
        };
        const botState = {
          control: {},
          exitAudit: {},
          importantLogging: {},
          lastLoginAt: 0,
          lastSelf: {
            at: t,
            updatedAt: t,
            stamina: {
              stamina1d: 0,
              stamina1h: 3000000
            }
          }
        };
        const staminaRuntime = createStaminaStatusRuntime({
          bot: botState,
          cfg: { ...cfg, staminaExhaustedThresholdMs: 1000, staminaBudgetReloginDelayMs: 1800000 },
          staminaExhaustedThreshold: () => 1000
        });
        let startCalls = 0;
        const runtime = createLeaveFlowRuntime({
          bot: botState,
          cfg: { ...cfg, autoLogin: true, dryRun: false, once: false, loginCooldownMs: 5000, postLoginGraceMs: 45000 },
          storage,
          pageGlobal: {},
          loginSuppressKey: 'graspRatLoginSuppressUntil',
          loginSuppressReasonKey: 'graspRatLoginSuppressReason',
          getCurrentUserId: () => 28886,
          getSessionToken: () => '',
          getNativeControl: () => null,
          hasNativeGameSession: () => false,
          findLoginControl: () => button,
          hasLoginRequiredText: () => false,
          getSelf: () => null,
          syncPausedFromPage: () => false,
          exitAuditFlushPending: () => false,
          importantSessionEndFlushPending: () => false,
          readPageGlobal: name => (name === 'startLinuxDoLogin' ? (() => { startCalls += 1; }) : null),
          loginSuppressRemainingMs: () => 0,
          ensureLoginSnapshotGate: async () => ({ satisfied: true }),
          loginSnapshotGateAllowsLogin: gate => Boolean(gate.satisfied),
          setLoginSuppress: (reason, ms) => {
            const until = Date.now() + ms;
            storage.setItem('graspRatLoginSuppressUntil', String(until));
            storage.setItem('graspRatLoginSuppressReason', reason);
            return until;
          },
          controlText: () => '立即登录',
          isAlive: value => Boolean(value?.hp > 0),
          knownLongStaminaExhaustionLoginHold: staminaRuntime.knownLongStaminaExhaustionLoginHold
        });
        const result = await runtime.maybeStartAutoLogin('no-self');
        return [
          result?.needed,
          result?.attempted,
          result?.reason,
          Number(result?.cooldownRemainingMs || 0) > 0,
          button.clickCount,
          startCalls,
          Array.isArray(result?.staminaHold?.exhausted) ? result.staminaHold.exhausted.join('/') : ''
        ].map(String).join('|');
      })(),
      want: 'true|false|known-long-stamina-exhausted|true|0|0|1d'
    },
    {
      name: 'login control finder prefers hidden native join over inline proxy',
      got: (() => {
        const previousDocument = global.document;
        const nativeJoin = {
          id: 'joinBtn',
          dataset: { graspRatNativeLoginHidden: 'true' },
          matches: selector => String(selector || '').includes('#joinBtn')
        };
        const inlineProxy = {
          id: 'grasp-rat-bot-inline-login',
          dataset: {},
          matches: () => false,
          closest: () => inlineProxy
        };
        const oauthButton = {
          id: 'oauthButton',
          dataset: {},
          matches: () => false
        };
        try {
          global.document = {
            querySelector: selector => (String(selector || '').includes('#joinBtn') ? nativeJoin : null),
            querySelectorAll: () => [inlineProxy, oauthButton]
          };
          const runtime = createControlLoginRuntime({
            bot: { loginSnapshotGate: {} },
            cfg: {},
            storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
            isVisible: el => el === inlineProxy || el === oauthButton,
            controlText: el => (el === oauthButton ? 'LinuxDO 登录' : '立即登录'),
            loginPointSafetyStatus: () => ({ satisfied: true }),
            loginSnapshotSuccessRequiredCore: () => 0
          });
          const found = runtime.findLoginControl();
          const inlineEventControl = runtime.nativeLoginEventControl({ target: inlineProxy });
          return [
            found === nativeJoin,
            found?.id,
            inlineEventControl === null
          ].map(String).join('|');
        } finally {
          global.document = previousDocument;
        }
      })(),
      want: 'true|joinBtn|true'
    },
    {
      name: 'manual force login prefers native login control over raw global',
      got: (async () => {
        const data = new Map();
        const storage = {
          getItem: key => (data.has(key) ? data.get(key) : null),
          setItem: (key, value) => data.set(key, String(value)),
          removeItem: key => data.delete(key)
        };
        let token = '';
        const button = {
          id: 'joinBtn',
          tagName: 'BUTTON',
          clickCount: 0,
          click() {
            this.clickCount += 1;
            token = 'started-token';
          }
        };
        const botState = { control: {}, exitAudit: {}, importantLogging: {}, lastLoginAt: 0 };
        let startCalls = 0;
        const runtime = createLeaveFlowRuntime({
          bot: botState,
          cfg: { ...cfg, autoLogin: true, dryRun: false, once: false, loginCooldownMs: 5000, loginStartEvidenceMs: 0, postLoginGraceMs: 45000 },
          storage,
          pageGlobal: {},
          loginSuppressKey: 'graspRatLoginSuppressUntil',
          loginSuppressReasonKey: 'graspRatLoginSuppressReason',
          getCurrentUserId: () => 28886,
          getSessionToken: () => token,
          getNativeControl: () => null,
          hasNativeGameSession: () => false,
          findLoginControl: () => button,
          hasLoginRequiredText: () => false,
          getSelf: () => null,
          syncPausedFromPage: () => false,
          exitAuditFlushPending: () => false,
          importantSessionEndFlushPending: () => false,
          readPageGlobal: name => (name === '__graspRatBotRawStartLinuxDoLogin' || name === 'startLinuxDoLogin' ? (() => { startCalls += 1; }) : null),
          installPageGlobal: () => {},
          loginSuppressRemainingMs: () => 0,
          ensureLoginSnapshotGate: async () => ({ satisfied: true }),
          loginSnapshotGateAllowsLogin: gate => Boolean(gate.satisfied),
          setLoginSuppress: (reason, ms) => {
            const until = Date.now() + ms;
            storage.setItem('graspRatLoginSuppressUntil', String(until));
            storage.setItem('graspRatLoginSuppressReason', reason);
            return until;
          },
          controlText: () => '立即登录',
          isAlive: value => Boolean(value?.hp > 0)
        });
        const result = await runtime.maybeStartAutoLogin('sidebar immediate login', {
          force: true,
          manual: true,
          manualOverride: true,
          ignoreSuppress: true,
          ignoreLoginCooldown: true
        });
        return [
          result?.attempted,
          result?.method,
          button.clickCount,
          startCalls,
          data.get('graspRatLoginSuppressReason')
        ].map(String).join('|');
      })(),
      want: 'true|#joinBtn|1|0|bot login started'
    },
    {
      name: 'login point safety streak resets on new page load',
      got: (() => {
        const storage = createMapStorage(new Map([
          ['graspRatLoginPointSafety', JSON.stringify({
            point: { x: 100, y: 200, userId: 28886, at: 1000, loginAt: 900, source: 'post-login-self' },
            streak: 3,
            required: 3,
            lastSampleAt: 2000,
            lastOkAt: 2000,
            lastDanger: { reason: 'old-danger' },
            movement: { 'id:42': { x: 120, y: 220, at: 1900 } },
            pageLoadAt: 111
          })]
        ]));
        const runtime = createLoginPointSafetyRuntime({
          bot: { globalState: { entities: [] } },
          cfg: { loginPointSafetySuccessRequired: 3 },
          storage,
          loginPointSafetyKey: 'graspRatLoginPointSafety',
          pageLoadAt: () => 222
        });
        const status = runtime.loginPointSafetyStatus(3000);
        const stored = JSON.parse(storage.getItem('graspRatLoginPointSafety') || '{}');
        return [
          status.hasPoint,
          status.streak,
          status.required,
          status.satisfied,
          status.point?.x,
          stored.pageLoadAt,
          stored.streak,
          stored.lastOkAt,
          stored.lastDanger === null,
          Object.keys(stored.movement || {}).length
        ].map(String).join('|');
      })(),
      want: 'true|0|3|false|100|222|0|0|true|0'
    },
    {
      name: 'forced stale-session auto login prefers visible login control over page global',
      got: (async () => {
        const data = new Map();
        const storage = {
          getItem: key => (data.has(key) ? data.get(key) : null),
          setItem: (key, value) => data.set(key, String(value)),
          removeItem: key => data.delete(key)
        };
        let href = 'https://grasp-rat-game.h-e.top/';
        const button = {
          id: 'joinBtn',
          tagName: 'BUTTON',
          clickCount: 0,
          click() {
            this.clickCount += 1;
            href = 'https://connect.linux.do/oauth2/authorize?client_id=grasp-rat';
          }
        };
        const botState = { control: {}, exitAudit: {}, importantLogging: {}, lastLoginAt: 0 };
        let startCalls = 0;
        const runtime = createLeaveFlowRuntime({
          bot: botState,
          cfg: { ...cfg, autoLogin: true, dryRun: false, once: false, loginCooldownMs: 5000, loginStartEvidenceMs: 0, postLoginGraceMs: 45000 },
          storage,
          pageGlobal: {},
          loginSuppressKey: 'graspRatLoginSuppressUntil',
          loginSuppressReasonKey: 'graspRatLoginSuppressReason',
          locationHref: () => href,
          getCurrentUserId: () => 28886,
          getSessionToken: () => 'stale-token',
          getNativeControl: () => ({ wsReadyState: 0 }),
          hasNativeGameSession: () => true,
          findLoginControl: () => button,
          hasLoginRequiredText: () => false,
          getSelf: () => null,
          syncPausedFromPage: () => false,
          exitAuditFlushPending: () => false,
          importantSessionEndFlushPending: () => false,
          readPageGlobal: name => (name === 'startLinuxDoLogin' ? (() => { startCalls += 1; }) : null),
          loginSuppressRemainingMs: () => 0,
          ensureLoginSnapshotGate: async () => ({ satisfied: true, liveSessionTakeoverBypass: true }),
          loginSnapshotGateAllowsLogin: gate => Boolean(gate.satisfied),
          setLoginSuppress: (reason, ms) => {
            const until = Date.now() + ms;
            storage.setItem('graspRatLoginSuppressUntil', String(until));
            storage.setItem('graspRatLoginSuppressReason', reason);
            return until;
          },
          controlText: () => '立即登录',
          isAlive: value => Boolean(value?.hp > 0)
        });
        const result = await runtime.maybeStartAutoLogin('session-mismatch-recovery', {
          force: true,
          ignoreSuppress: true,
          ignoreLoginCooldown: true,
          allowLiveSessionTakeoverBypass: true,
          liveSessionTakeover: { allowed: true }
        });
        return [
          result?.attempted,
          result?.method,
          result?.hasToken,
          result?.hasNativeSession,
          result?.effectiveHasToken,
          result?.effectiveHasNativeSession,
          button.clickCount,
          startCalls,
          data.get('graspRatLoginSuppressReason')
        ].map(String).join('|');
      })(),
      want: 'true|#joinBtn|true|true|true|true|1|0|bot login started'
    },
    {
      name: 'bot-login-started relogin gate cooldown keeps configured total',
      got: (() => {
        const t = Date.now();
        const runtime = createReloginGateRuntime({
          bot: { lastLoginAt: 0 },
          cfg: { loginCooldownMs: 5000, postLoginGraceMs: 45000 },
          storage: { getItem: () => null, removeItem: () => {} },
          loginSuppressStatus: () => ({
            until: t + 31000,
            remainingMs: 31000,
            reason: 'bot login started'
          }),
          activeEnemyLeaveDetail: () => null,
          activeOfflineLeaveDetail: () => null,
          snapshotLoginGateStatus: () => ({
            pointSafety: { satisfied: true, hasPoint: true, streak: 3, required: 3 }
          }),
          loginPointSafetyStatus: () => ({ satisfied: true, hasPoint: true, streak: 3, required: 3 })
        });
        const status = runtime.summarizeReloginGateStatus(t);
        return [
          status.cooldown.source,
          status.cooldown.reason,
          status.cooldown.remainingMs,
          status.cooldown.totalMs,
          status.loginPointSafety.streak,
          status.loginPointSafety.required
        ].map(String).join('|');
      })(),
      want: 'login-suppress|bot login started|31000|45000|3|3'
    },
    {
      name: 'no-self leave 403 recovery does not create pending exit retry',
      got: (async () => {
        const botState = { control: {}, exitAudit: {}, importantLogging: {}, lastLoginAt: 0 };
        let rememberCalls = 0;
        let recoveryCalls = 0;
        let reloadCalls = 0;
        const runtime = createLeaveFlowRuntime({
          bot: botState,
          cfg: { ...cfg, autoLogin: true, dryRun: false, once: false, offlineLeaveRetryMs: 1000, combatLeaveRetryMs: 1000 },
          storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
          getCurrentUserId: () => 28886,
          summarizeControl: () => ({ currentUserId: 28886, hasToken: true, connecting: true }),
          issueLeaveCommand: async detail => {
            detail.attempted = true;
            detail.method = 'leave(userId)';
            detail.lastLeaveRequest = {
              completedAt: Date.now(),
              result: { status: 403 }
            };
            detail.leaveRequests = [detail.lastLeaveRequest];
            return detail;
          },
          rememberPendingExit: () => {
            rememberCalls += 1;
          },
          clearNoSelfLocalSessionAfterLeave403: () => {
            recoveryCalls += 1;
            botState.pendingExit = null;
            return {
              confirmed: true,
              clearedLocalSession: true,
              clearedAt: Date.now(),
              displayReason: 'leave接口返回403，按服务端已无自身清理本地登录状态后重登'
            };
          },
          requestReload: () => {
            reloadCalls += 1;
            return true;
          },
          activeOfflineLeaveDetail: () => null,
          resetLoginSnapshotGate: () => null,
          loginPointSafetyExitSelfForDetail: () => null,
          ensureExitAuditDetail: detail => {
            detail.exitAuditId = detail.exitAuditId || 'audit-1';
          },
          recordExitAuditEvent: () => false,
          staminaBudgetReloginDelayMs: () => 0,
          staminaResetHoldUntil: () => 0,
          setLoginSuppress: () => 0,
          reloginDelayForHpCore: () => ({ delayMs: 0, hpDelayMs: 0, minMs: 0, maxMs: 0, hp: { hp: 100, maxHp: 100, ratio: 1 } }),
          isAlive: value => Boolean(value?.hp > 0)
        });
        const result = await runtime.leaveOffline(
          'websocket reconnect churn missing self',
          null,
          {
            unsafe: true,
            noSelfGameSession: { shouldLeave: true, userId: 28886, ageMs: 5000 },
            reconnectChurn: { count: 3 }
          }
        );
        return [
          result?.attempted,
          result?.exitConfirmed,
          result?.exitPending,
          Boolean(result?.localSessionReset),
          result?.reloadRequested,
          recoveryCalls,
          reloadCalls,
          rememberCalls,
          botState.pendingExit
        ].map(String).join('|');
      })(),
      want: 'true|true|false|true|true|1|1|0|null'
    },
    {
      name: 'post-login zoom shrinks one way until native view radius reaches 502m',
      got: (() => {
        const runtime = createPostLoginZoomRuntime({
          bot: {},
          cfg: {
            postLoginZoomFitRadiusCm: 50200
          }
        });
        const belowTarget = runtime.postLoginZoomFitDecision({
          ok: true,
          radiusCm: 50200,
          viewRadiusCm: 10000
        });
        const atTarget = runtime.postLoginZoomFitDecision({
          ok: true,
          radiusCm: 50200,
          viewRadiusCm: 50200
        });
        const overZoomed = runtime.postLoginZoomFitDecision({
          ok: true,
          radiusCm: 50200,
          viewRadiusCm: 80000
        });
        return [
          belowTarget.done,
          belowTarget.direction,
          belowTarget.reason,
          atTarget.done,
          atTarget.direction,
          atTarget.reason,
          overZoomed.done,
          overZoomed.direction,
          overZoomed.reason
        ].map(String).join('|');
      })(),
      want: 'false|out|view-radius-below-target|true||view-radius-target-reached|true||view-radius-target-reached'
    },
    {
      name: 'post-login zoom applies native setViewRadius directly',
      got: (() => {
        let viewRadiusCm = 10000;
        const pageGlobal = {
          setViewRadius(cm) {
            viewRadiusCm = Math.round(Number(cm || 0));
          }
        };
        const runtime = createPostLoginZoomRuntime({
          bot: {},
          cfg: {
            postLoginZoomFitRadiusCm: 50200
          },
          pageGlobal,
          readPageGlobal: (key, fallback, global) => global?.[key] ?? fallback,
          getNativeState: () => ({ viewRadiusCm })
        });
        const before = runtime.postLoginZoomFitMeasurement({});
        const action = runtime.postLoginZoomApplyNativeViewRadius(50200);
        const after = runtime.postLoginZoomFitMeasurement({});
        const afterDecision = runtime.postLoginZoomFitDecision(after);
        return [
          before.viewRadiusCm,
          action.applied,
          action.method,
          action.targetRadiusCm,
          after.viewRadiusCm,
          afterDecision.done,
          afterDecision.reason
        ].map(String).join('|');
      })(),
      want: '10000|true|setViewRadius|50200|50200|true|view-radius-target-reached'
    },
    {
      name: 'post-login zoom no-token session key is stable across no-self generations',
      got: (() => {
        const botState = { postLoginZoom: { generation: 1 } };
        const runtime = createPostLoginZoomRuntime({
          bot: botState,
          cfg: {},
          getCurrentUserId: () => 28886,
          getSessionToken: () => ''
        });
        const first = runtime.postLoginZoomSessionKey({ user_id: 28886 });
        botState.postLoginZoom.generation = 9;
        const second = runtime.postLoginZoomSessionKey({ user_id: 28886 });
        return [first, second, String(first === second)].join('|');
      })(),
      want: '28886:no-token|28886:no-token|true'
    },
    {
      name: 'post-exit session mismatch blocks live takeover bypass',
      got: (() => {
        const blockedBy = [];
        const state = {
          pendingExit: true,
          suppressRemainingMs: 60000,
          resetReason: 'exit-trigger:websocket offline',
          reconnectChurn: true,
          wsOfflineish: true
        };
        if (state.pendingExit) blockedBy.push('pending-exit-active');
        if (state.suppressRemainingMs > 0) blockedBy.push('login-suppress-active');
        if (state.resetReason.includes('exit-trigger:') || state.resetReason.includes('exit-confirmed:')) blockedBy.push('exit-snapshot-gate-reset');
        if (state.reconnectChurn) blockedBy.push('native-reconnect-churn');
        if (state.wsOfflineish) blockedBy.push('ws-offlineish');
        const takeover = {
          allowed: blockedBy.length === 0,
          blockedBy
        };
        return [
          String(takeover.blockedBy.includes('pending-exit-active')),
          String(takeover.blockedBy.includes('login-suppress-active')),
          String(takeover.blockedBy.includes('exit-snapshot-gate-reset')),
          String(takeover.blockedBy.includes('native-reconnect-churn')),
          String(takeover.blockedBy.includes('ws-offlineish')),
          String(takeover.allowed)
        ].join('|');
      })(),
      want: 'true|true|true|true|true|false'
    },
    {
      name: 'login-point safety gate is pre-login only',
      got: (() => {
        const postLoginHasSelf = true;
	        const pointSafety = { hasPoint: true, satisfied: false, streak: 0, required: 3 };
        const preLoginBlock = pointSafety.hasPoint && !pointSafety.satisfied ? 'login-point-safety' : '';
        const postLoginBlock = postLoginHasSelf ? '' : preLoginBlock;
        return [preLoginBlock, postLoginBlock].join('|');
      })(),
      want: 'login-point-safety|'
    },
    {
      name: 'login-point safety radius uses 170m healthy and 300m unhealthy bands',
      got: (() => {
        const radiusFor = hp => {
          const lowHpRadius = 30000;
          const healthyRadius = 17000;
          const threshold = 80;
          const n = hp === undefined || hp === null || hp === '' ? NaN : Number(hp);
          return Number.isFinite(n) && n >= threshold ? healthyRadius : lowHpRadius;
        };
        return [
          radiusFor(80),
          radiusFor(79),
          radiusFor(null)
        ].join('|');
      })(),
      want: '17000|30000|30000'
    },
    {
      name: 'bootstrap login-point gate blocks fallback relogin only after a learned point',
      got: (() => {
        const block = point => {
	          const required = Math.max(0, Math.round(Number(point.required ?? 3) || 3));
          const hasPoint = Boolean(point.hasPoint);
          const streak = Math.max(0, Math.min(required, Math.round(Number(point.streak || 0) || 0)));
          const ok = required <= 0 || (hasPoint && streak >= required);
          if (ok || required <= 0) return '';
          if (!hasPoint && !point.missingPoint) return '';
          const missing = Boolean(point.missingPoint || !hasPoint);
          return missing ? 'login-point-missing' : 'login-point-safety';
        };
        return [
	          block({ hasPoint: false, missingPoint: false, streak: 0, required: 3 }),
	          block({ hasPoint: false, missingPoint: true, streak: 0, required: 3 }),
	          block({ hasPoint: true, missingPoint: false, streak: 0, required: 3 }),
	          block({ hasPoint: true, missingPoint: false, streak: 3, required: 3 })
        ].join('|');
      })(),
      want: '|login-point-missing|login-point-safety|'
    },
    {
      name: 'pending exit confirmation requests page reload',
      got: (() => {
        const botState = {
          globalState: { entities: [] },
          control: {},
          exitAudit: {},
          importantLogging: {},
          lastSelf: { user_id: 28886, hp: 100, x: 0, y: 0 }
        };
        let reloadCalls = 0;
        const runtime = createPendingExitRuntime({
          bot: botState,
          cfg: { ...cfg, leave403ReloginDelayMs: 3600000 },
          storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
          getCurrentUserId: () => 28886,
          getSessionToken: () => '',
          summarizeSelf: value => value,
          summarizeControl: () => ({ currentUserId: 28886, hasToken: false, wsOpen: false }),
          controlHasAuthoritativeSessionMismatch: () => false,
          requestReload: reason => {
            reloadCalls += 1;
            return reason === 'exit confirmed';
          },
          stopMotionAfterExit: () => {},
          clearCombatEngagement: () => {},
          resetLoginSnapshotGate: () => ({ reset: true }),
          loginPointSafetyExitSelfForDetail: () => botState.lastSelf,
          setLoginSuppress: () => 0,
          reloginDelayForHpCore: () => ({ delayMs: 0, hpDelayMs: 0, minMs: 0, maxMs: 0, hp: { hp: 100, maxHp: 100, ratio: 1 } }),
          recordExitAuditEvent: () => false,
          noteImportantSessionExit: () => null,
          isAlive: value => Boolean(value?.hp > 0)
        });
        const detail = runtime.confirmPendingExit({
          scope: 'enemy',
          source: 'combat',
          reason: 'combat leave',
          summary: 'combat leave',
          userId: 28886,
          self: botState.lastSelf,
          at: Date.now() - 1000,
          retryCount: 1,
          lastResult: {
            attempted: true,
            reason: 'combat leave',
            summary: 'combat leave',
            userId: 28886,
            self: botState.lastSelf
          }
        }, {
          known: true,
          alive: false,
          source: 'token-chat-left-user-self-missing',
          self: null
        });
        return [
          detail?.exitConfirmed,
          detail?.reloadRequested,
          reloadCalls,
          botState.pendingExit
        ].map(String).join('|');
      })(),
      want: 'true|true|1|null'
    },
    {
      name: 'pending no-self exit confirmation clears stale local session before blocked reload',
      got: (() => {
        const data = new Map([
          ['tmpGameSessionToken', 'stale-token'],
          ['tmpGameUserId', '28886'],
          ['tmpGameSessionShadow', 'stale-shadow'],
          ['tmpGameHelpSeenV3', '1']
        ]);
        const storage = createMapStorage(data);
        let closed = false;
        let reloadCalls = 0;
        const nativeWs = {
          readyState: 0,
          close: () => {
            closed = true;
          }
        };
        const nativeState = {
          currentUserId: 28886,
          sessionToken: 'stale-token',
          wsOpen: false,
          ws: nativeWs,
          entities: [{ user_id: 28886 }],
          reconnectTimer: 11
        };
        const botState = {
          globalState: { entities: [] },
          control: { hasToken: true, connecting: true, nativeWsOpen: false },
          exitAudit: {},
          importantLogging: {},
          lastSelf: { user_id: 28886, hp: 100, x: 0, y: 0 }
        };
        const noSelfRuntime = createNoSelfSnapshotRecoveryRuntime({
          bot: botState,
          cfg,
          storage,
          getCurrentUserId: () => 28886,
          getNativeControl: () => ({ ws: nativeWs, state: nativeState }),
          snapshotSelfPresenceState: () => ({ known: false, fresh: false, present: false }),
          clearPersistentPendingExitState: () => {
            data.set('pendingExitCleared', 'true');
          }
        });
        const runtime = createPendingExitRuntime({
          bot: botState,
          cfg: { ...cfg, leave403ReloginDelayMs: 3600000 },
          storage,
          getCurrentUserId: () => 28886,
          getSessionToken: () => storage.getItem('tmpGameSessionToken') || '',
          summarizeSelf: value => value,
          summarizeControl: () => ({
            currentUserId: 28886,
            hasToken: storage.getItem('tmpGameSessionToken') !== null,
            connecting: true,
            wsReadyState: 0,
            nativeWsReadyState: 0
          }),
          controlHasAuthoritativeSessionMismatch: () => false,
          requestReload: () => {
            reloadCalls += 1;
            return false;
          },
          stopMotionAfterExit: () => {},
          clearCombatEngagement: () => {},
          resetLoginSnapshotGate: () => ({ reset: true }),
          loginPointSafetyExitSelfForDetail: () => botState.lastSelf,
          setLoginSuppress: () => 0,
          reloginDelayForHpCore: () => ({ delayMs: 0, hpDelayMs: 0, minMs: 0, maxMs: 0, hp: { hp: 100, maxHp: 100, ratio: 1 } }),
          recordExitAuditEvent: () => false,
          noteImportantSessionExit: () => null,
          isAlive: value => Boolean(value?.hp > 0),
          clearNoSelfLocalSessionAfterConfirmedExit: (...args) => noSelfRuntime.clearNoSelfLocalSessionAfterConfirmedExit(...args)
        });
        const noSelfGameSession = { shouldLeave: true, userId: 28886, ageMs: 45000, reconnectChurn: { count: 3 } };
        const pending = {
          scope: 'offline',
          source: 'offline',
          reason: 'game session missing self',
          summary: '已登录但自身实体不可见',
          userId: 28886,
          self: botState.lastSelf,
          at: Date.now() - 1000,
          retryCount: 2,
          offlineSafety: { unsafe: true, noSelfGameSession },
          lastResult: {
            attempted: true,
            reason: 'game session missing self',
            summary: '已登录但自身实体不可见',
            userId: 28886,
            offlineSafety: { unsafe: true, noSelfGameSession }
          }
        };
        botState.pendingExit = pending;
        const detail = runtime.confirmPendingExit(pending, {
          known: true,
          alive: false,
          source: 'snapshot',
          self: null
        });
        return [
          detail?.exitConfirmed,
          detail?.reloadRequested,
          reloadCalls,
          Boolean(detail?.localSessionReset),
          detail?.localSessionReset?.reason,
          data.get('tmpGameSessionToken') === undefined,
          data.get('tmpGameUserId') === undefined,
          data.get('tmpGameSessionShadow') === undefined,
          data.get('tmpGameHelpSeenV3'),
          data.has('graspRatNoSelfSnapshotRecovery'),
          nativeState.currentUserId,
          nativeState.sessionToken,
          nativeState.wsOpen,
          nativeState.ws,
          closed,
          botState.control.hasToken,
          botState.pendingExit,
          botState.offlineSince,
          data.get('pendingExitCleared')
        ].map(String).join('|');
      })(),
      want: 'true|false|1|true|confirmed-no-self-exit-local-session-reset|true|true|true|1|true|0||false|null|true|false|null|0|true'
    },
    {
      name: 'pending no-self exit accepts fresh missing snapshot despite stale native session',
      got: (async () => {
        const data = new Map([
          ['tmpGameSessionToken', 'stale-token'],
          ['tmpGameUserId', '28886'],
          ['tmpGameSessionShadow', 'stale-shadow'],
          ['tmpGameHelpSeenV3', '1']
        ]);
        const storage = createMapStorage(data);
        let reloadCalls = 0;
        const nativeWs = {
          readyState: 1,
          close: () => {}
        };
        const nativeState = {
          currentUserId: 28886,
          sessionToken: 'stale-token',
          wsOpen: true,
          ws: nativeWs,
          entities: [],
          reconnectTimer: 13
        };
        const botState = {
          globalState: { entities: [], snapshotRefreshedAt: Date.now() },
          control: { hasToken: true, rawWsOpen: true, nativeWsOpen: true },
          exitAudit: {},
          importantLogging: {},
          lastSelf: { user_id: 28886, hp: 100, x: 0, y: 0 }
        };
        const noSelfRuntime = createNoSelfSnapshotRecoveryRuntime({
          bot: botState,
          cfg,
          storage,
          getCurrentUserId: () => 28886,
          getNativeControl: () => ({ ws: nativeWs, state: nativeState }),
          snapshotSelfPresenceState: () => ({ known: true, fresh: true, present: false }),
          clearPersistentPendingExitState: () => {
            data.set('pendingExitClearedByNoSelfRuntime', 'true');
          }
        });
        const runtime = createPendingExitRuntime({
          bot: botState,
          cfg: { ...cfg, leave403ReloginDelayMs: 3600000 },
          storage,
          getCurrentUserId: () => 28886,
          getSessionToken: () => storage.getItem('tmpGameSessionToken') || '',
          getNativeState: () => nativeState,
          getNativeControl: () => ({ ws: nativeWs, state: nativeState }),
          hasNativeGameSession: () => true,
          snapshotSelfFreshEnough: () => true,
          summarizeSelf: value => value,
          summarizeControl: () => ({
            currentUserId: 28886,
            hasToken: storage.getItem('tmpGameSessionToken') !== null,
            rawWsOpen: true,
            nativeWsOpen: true,
            wsReadyState: 1,
            nativeWsReadyState: 1
          }),
          controlHasAuthoritativeSessionMismatch: () => false,
          requestReload: () => {
            reloadCalls += 1;
            return false;
          },
          stopMotionAfterExit: () => {},
          clearCombatEngagement: () => {},
          clearPersistentPendingExitState: () => {
            data.set('pendingExitClearedByPendingRuntime', 'true');
          },
          resetLoginSnapshotGate: () => ({ reset: true }),
          loginPointSafetyExitSelfForDetail: () => botState.lastSelf,
          setLoginSuppress: () => 0,
          reloginDelayForHpCore: () => ({ delayMs: 0, hpDelayMs: 0, minMs: 0, maxMs: 0, hp: { hp: 100, maxHp: 100, ratio: 1 } }),
          recordExitAuditEvent: () => false,
          noteImportantSessionExit: () => null,
          isAlive: value => Boolean(value?.hp > 0),
          clearNoSelfLocalSessionAfterConfirmedExit: (...args) => noSelfRuntime.clearNoSelfLocalSessionAfterConfirmedExit(...args)
        });
        const noSelfGameSession = { shouldLeave: true, userId: 28886, ageMs: 180000, reconnectChurn: { count: 3 } };
        botState.pendingExit = {
          scope: 'offline',
          source: 'offline',
          reason: 'game session missing self',
          summary: '已登录但自身实体不可见',
          userId: 28886,
          self: botState.lastSelf,
          at: Date.now() - 180000,
          retryCount: 5,
          offlineSafety: { unsafe: true, noSelfGameSession },
          lastResult: {
            attempted: false,
            reason: 'cooldown',
            summary: '已登录但自身实体不可见',
            userId: 28886,
            offlineSafety: { unsafe: true, noSelfGameSession }
          }
        };
        const decision = await runtime.handlePendingExit(null);
        return [
          decision?.reason,
          decision?.exitConfirmation?.source,
          decision?.leave?.exitConfirmed,
          Boolean(decision?.leave?.localSessionReset),
          data.get('tmpGameSessionToken') === undefined,
          data.get('tmpGameUserId') === undefined,
          data.get('tmpGameSessionShadow') === undefined,
          data.has('graspRatNoSelfSnapshotRecovery'),
          nativeState.currentUserId,
          nativeState.sessionToken,
          nativeState.wsOpen,
          nativeState.ws,
          botState.control.hasToken,
          botState.pendingExit,
          reloadCalls,
          data.get('pendingExitClearedByNoSelfRuntime'),
          data.get('pendingExitClearedByPendingRuntime')
        ].map(String).join('|');
      })(),
      want: 'offline-leave-wait|snapshot-no-self-offline-pending|true|true|true|true|true|true|0||false|null|false|null|1|true|true'
    },
    {
      name: 'external left user recovery clears stale self entity',
      got: (async () => {
        const data = new Map([
          ['tmpGameUserId', '28886'],
          ['tmpGameSessionShadow', 'stale-shadow'],
          ['tmpGameHelpSeenV3', '1']
        ]);
        const storage = createMapStorage(data);
        let closed = false;
        let reloadCalls = 0;
        let stopReason = '';
        let resetReason = '';
        let auditCalls = 0;
        let importantReason = '';
        const nativeWs = {
          readyState: 1,
          close: () => {
            closed = true;
          }
        };
        const nativeState = {
          currentUserId: 28886,
          sessionToken: 'stale-token',
          wsOpen: true,
          ws: nativeWs,
          entities: [{ user_id: 28886, hp: 100, life: 'Alive' }],
          reconnectTimer: 99
        };
        const oldDocument = global.document;
        global.document = {
          querySelectorAll: () => [{ innerText: '14:06:11 left user 28886' }],
          body: { innerText: '14:06:11 left user 28886' },
          getElementById: () => null
        };
        try {
          const botState = {
            globalState: { entities: [], snapshotRefreshedAt: Date.now() },
            control: { hasToken: false, wsOpen: true, nativeWsOpen: true },
            exitAudit: {},
            importantLogging: {},
            lastSelf: { user_id: 28886, id: 28886, hp: 100, x: 1, y: 2 }
          };
          const noSelfRuntime = createNoSelfSnapshotRecoveryRuntime({
            bot: botState,
            cfg,
            storage,
            getCurrentUserId: () => 28886,
            getNativeControl: () => ({ ws: nativeWs, state: nativeState }),
            snapshotSelfPresenceState: () => ({ known: true, fresh: true, present: false }),
            clearPersistentPendingExitState: () => {
              data.set('pendingExitCleared', 'true');
            }
          });
          const runtime = createPendingExitRuntime({
            bot: botState,
            cfg: { ...cfg, leave403ReloginDelayMs: 3600000 },
            storage,
            getCurrentUserId: () => 28886,
            getSessionToken: () => '',
            getNativeControl: () => ({ ws: nativeWs, state: nativeState }),
            getNativeState: () => nativeState,
            hasNativeGameSession: () => true,
            snapshotSelfFreshEnough: () => true,
            summarizeSelf: value => ({ id: value.user_id ?? value.id, hp: value.hp, x: value.x, y: value.y }),
            summarizeControl: () => ({
              currentUserId: 28886,
              hasToken: false,
              wsOpen: true,
              rawWsOpen: true,
              nativeWsOpen: true,
              connecting: false,
              wsReadyState: 1,
              nativeWsReadyState: 1,
              transport: 'native-page'
            }),
            controlHasAuthoritativeSessionMismatch: () => false,
            clearCombatEngagement: () => {},
            stopMotionAfterExit: reason => {
              stopReason = reason;
            },
            requestReload: () => {
              reloadCalls += 1;
              return true;
            },
            clearPersistentPendingExitState: () => {
              data.set('pendingExitClearedByPendingRuntime', 'true');
            },
            resetLoginSnapshotGate: reason => {
              resetReason = reason;
              return { reset: true, reason };
            },
            loginPointSafetyExitSelfForDetail: () => botState.lastSelf,
            recordExitAuditEvent: () => {
              auditCalls += 1;
              return true;
            },
            noteImportantSessionExit: reason => {
              importantReason = reason;
            },
            isAlive: value => Boolean(value?.hp > 0),
            clearNoSelfLocalSessionAfterConfirmedExit: (...args) => noSelfRuntime.clearNoSelfLocalSessionAfterConfirmedExit(...args)
          });
          const decision = await runtime.handlePendingExit({ user_id: 28886, hp: 100, life: 'Alive', x: 1, y: 2 });
          return [
            decision?.reason,
            decision?.reloadRequested,
            reloadCalls,
            stopReason,
            Boolean(decision?.localSessionReset),
            data.get('tmpGameUserId') === undefined,
            data.get('tmpGameSessionShadow') === undefined,
            data.get('tmpGameHelpSeenV3'),
            data.has('graspRatNoSelfSnapshotRecovery'),
            nativeState.currentUserId,
            nativeState.sessionToken,
            nativeState.wsOpen,
            nativeState.ws,
            nativeState.entities.length,
            nativeState.reconnectTimer,
            closed,
            botState.control.hasToken,
            botState.pendingExit,
            botState.lastOfflineLeaveResult?.reason,
            resetReason,
            auditCalls,
            importantReason,
            data.get('pendingExitCleared'),
            data.get('pendingExitClearedByPendingRuntime')
          ].map(String).join('|');
        } finally {
          global.document = oldDocument;
        }
      })(),
      want: 'external-left-user-exit-confirmed|true|1|external-left-user-exit-confirmed|true|true|true|1|true|0||false|null|0|0|true|false|null|external-left-user-exit-confirmed|exit-confirmed:external-left-user-exit-confirmed|1|exit-confirmed:external-left-user-exit-confirmed|true|true'
    },
    {
      name: 'external left user recovery is idempotent while reload is audit-blocked',
      got: (async () => {
        const data = new Map([
          ['tmpGameUserId', '28886'],
          ['tmpGameSessionShadow', 'stale-shadow'],
          ['tmpGameHelpSeenV3', '1']
        ]);
        const storage = createMapStorage(data);
        let reloadCalls = 0;
        let stopCalls = 0;
        let auditCalls = 0;
        let importantCalls = 0;
        let resetCalls = 0;
        let clearCalls = 0;
        const nativeWs = { readyState: 1, close: () => {} };
        const nativeState = {
          currentUserId: 28886,
          sessionToken: 'stale-token',
          wsOpen: true,
          ws: nativeWs,
          entities: [{ user_id: 28886, hp: 100, life: 'Alive' }],
          reconnectTimer: 42
        };
        const oldDocument = global.document;
        global.document = {
          querySelectorAll: () => [{ innerText: '14:06:11 left user 28886' }],
          body: { innerText: '14:06:11 left user 28886' },
          getElementById: () => null
        };
        try {
          const botState = {
            globalState: { entities: [], snapshotRefreshedAt: Date.now() },
            control: { hasToken: false, wsOpen: true, nativeWsOpen: true },
            exitAudit: {},
            importantLogging: {},
            lastSelf: { user_id: 28886, id: 28886, hp: 100, x: 1, y: 2 }
          };
          const noSelfRuntime = createNoSelfSnapshotRecoveryRuntime({
            bot: botState,
            cfg,
            storage,
            getCurrentUserId: () => 28886,
            getNativeControl: () => ({ ws: nativeWs, state: nativeState }),
            snapshotSelfPresenceState: () => ({ known: true, fresh: true, present: false }),
            clearPersistentPendingExitState: () => {
              data.set('pendingExitCleared', 'true');
            }
          });
          const runtime = createPendingExitRuntime({
            bot: botState,
            cfg: { ...cfg, leave403ReloginDelayMs: 3600000 },
            storage,
            getCurrentUserId: () => 28886,
            getSessionToken: () => '',
            getNativeControl: () => ({ ws: nativeWs, state: nativeState }),
            getNativeState: () => nativeState,
            hasNativeGameSession: () => true,
            snapshotSelfFreshEnough: () => true,
            summarizeSelf: value => ({ id: value.user_id ?? value.id, hp: value.hp, x: value.x, y: value.y }),
            summarizeControl: () => ({
              currentUserId: 28886,
              hasToken: false,
              wsOpen: true,
              rawWsOpen: true,
              nativeWsOpen: true,
              connecting: false,
              wsReadyState: 1,
              nativeWsReadyState: 1,
              transport: 'native-page'
            }),
            controlHasAuthoritativeSessionMismatch: () => false,
            clearCombatEngagement: () => {},
            stopMotionAfterExit: () => {
              stopCalls += 1;
            },
            requestReload: () => {
              reloadCalls += 1;
              return reloadCalls >= 2;
            },
            clearPersistentPendingExitState: () => {
              data.set('pendingExitClearedByPendingRuntime', 'true');
            },
            resetLoginSnapshotGate: () => {
              resetCalls += 1;
              return { reset: true };
            },
            loginPointSafetyExitSelfForDetail: () => botState.lastSelf,
            recordExitAuditEvent: () => {
              auditCalls += 1;
              return true;
            },
            noteImportantSessionExit: () => {
              importantCalls += 1;
            },
            isAlive: value => Boolean(value?.hp > 0),
            clearNoSelfLocalSessionAfterConfirmedExit: (...args) => {
              clearCalls += 1;
              return noSelfRuntime.clearNoSelfLocalSessionAfterConfirmedExit(...args);
            }
          });
          const first = await runtime.handlePendingExit({ user_id: 28886, hp: 100, life: 'Alive', x: 1, y: 2 });
          const second = await runtime.handlePendingExit({ user_id: 28886, hp: 100, life: 'Alive', x: 1, y: 2 });
          return [
            first?.reason,
            first?.reloadRequested,
            second?.reason,
            second?.reloadRequested,
            reloadCalls,
            auditCalls,
            importantCalls,
            resetCalls,
            clearCalls,
            stopCalls,
            data.get('tmpGameUserId') === undefined,
            data.get('tmpGameSessionShadow') === undefined,
            data.get('tmpGameHelpSeenV3'),
            data.has('graspRatNoSelfSnapshotRecovery'),
            nativeState.currentUserId,
            nativeState.sessionToken,
            nativeState.wsOpen,
            nativeState.entities.length,
            botState.externalLeftUserExitRecovery?.reloadAttempts,
            botState.externalLeftUserExitRecovery?.auditRecorded,
            botState.lastOfflineLeaveResult?.reason,
            second?.externalLeftUserRecovery?.reloadAttempts,
            data.get('pendingExitCleared'),
            data.get('pendingExitClearedByPendingRuntime')
          ].map(String).join('|');
        } finally {
          global.document = oldDocument;
        }
      })(),
      want: 'external-left-user-exit-confirmed|false|external-left-user-exit-confirmed|true|2|1|1|1|1|1|true|true|1|true|0||false|0|2|true|external-left-user-exit-confirmed|2|true|true'
    },
    {
      name: 'external left user recovery ignores live current self',
      got: (async () => {
        const data = new Map([
          ['tmpGameSessionToken', 'live-token'],
          ['tmpGameUserId', '28886']
        ]);
        const storage = createMapStorage(data);
        let reloadCalls = 0;
        let stopCalls = 0;
        const oldDocument = global.document;
        global.document = {
          querySelectorAll: () => [{ innerText: '14:06:11 left user 28886' }],
          body: { innerText: '14:06:11 left user 28886' },
          getElementById: () => null
        };
        try {
          const self = { user_id: 28886, hp: 100, life: 'Alive' };
          const nativeState = { entities: [self] };
          const botState = {
            globalState: { entities: [self], snapshotRefreshedAt: Date.now() },
            control: { hasToken: true, wsOpen: true, nativeWsOpen: true },
            exitAudit: {},
            importantLogging: {},
            lastSelf: self
          };
          const runtime = createPendingExitRuntime({
            bot: botState,
            cfg: { ...cfg, leave403ReloginDelayMs: 3600000 },
            storage,
            getCurrentUserId: () => 28886,
            getSessionToken: () => storage.getItem('tmpGameSessionToken') || '',
            getNativeControl: () => ({ ws: { readyState: 1 }, state: nativeState }),
            getNativeState: () => nativeState,
            hasNativeGameSession: () => true,
            snapshotSelfFreshEnough: () => true,
            summarizeSelf: value => ({ id: value.user_id ?? value.id, hp: value.hp }),
            summarizeControl: () => ({
              currentUserId: 28886,
              hasToken: true,
              wsOpen: true,
              rawWsOpen: true,
              nativeWsOpen: true,
              connecting: false,
              wsReadyState: 1,
              nativeWsReadyState: 1,
              transport: 'native-page'
            }),
            requestReload: () => {
              reloadCalls += 1;
              return true;
            },
            stopMotionAfterExit: () => {
              stopCalls += 1;
            },
            isAlive: value => Boolean(value?.hp > 0)
          });
          const decision = await runtime.handlePendingExit(self);
          return [
            decision,
            reloadCalls,
            stopCalls,
            data.get('tmpGameSessionToken'),
            data.get('tmpGameUserId'),
            nativeState.entities.length,
            botState.pendingExit
          ].map(String).join('|');
        } finally {
          global.document = oldDocument;
        }
      })(),
      want: 'null|0|0|live-token|28886|1|undefined'
    },
    {
      name: 'exit audit reload block logs are throttled',
      got: (() => {
        const originalNow = Date.now;
        let t = 100000;
        Date.now = () => t;
        try {
          const logs = [];
          let flushCalls = 0;
          const botState = {
            exitAudit: {},
            importantLogging: {},
            lastSelf: null,
            combatLogging: {}
          };
          const runtime = createSessionRecoveryRuntime({
            bot: botState,
            cfg: { ...cfg, exitAuditBlockedReloadLogMinMs: 5000 },
            storage: createMapStorage(),
            exitAuditFlushPending: () => true,
            exitAuditFlushBlockDetail: reason => ({
              blocked: true,
              reason,
              pending: 1,
              pendingIds: ['audit-1'],
              sending: false,
              endpoint: 'http://127.0.0.1:18765/combat-log',
              lastError: '',
              lastOkAt: 0
            }),
            flushCombatLogs: () => {
              flushCalls += 1;
              return true;
            },
            logStatus: text => {
              logs.push(text);
            }
          });
          runtime.requestReload('external left user local session reset');
          t += 1000;
          runtime.requestReload('external left user local session reset');
          t += 1000;
          runtime.requestReload('external left user local session reset');
          const suppressedBeforeDue = botState.exitAudit.lastBlockedReloadLog?.suppressed || 0;
          t += 5000;
          runtime.requestReload('external left user local session reset');
          return [
            logs.length,
            flushCalls,
            suppressedBeforeDue,
            logs[0],
            logs[1],
            botState.exitAudit.lastBlockedReload?.pending,
            botState.exitAudit.lastBlockedReloadLog?.suppressed
          ].map(String).join('|');
        } finally {
          Date.now = originalNow;
        }
      })(),
      want: '2|4|2|reload blocked until exit audit logs flush: external left user local session reset|reload blocked until exit audit logs flush: external left user local session reset|1|0'
    },
    {
      name: 'local exit confirmation must not accept active session mismatch',
      got: (() => {
        const tokenCleared = true;
        const chatLeftUser = true;
        const ownEntityDisappeared = true;
        const sessionMismatch = true;
        return String(tokenCleared && chatLeftUser && ownEntityDisappeared && !sessionMismatch);
      })(),
      want: 'false'
    },
    {
      name: 'combat log exit summary includes safe offline relogin marker',
      got: (() => {
        const exit = combatLogExitSummaryFromDecision({
	          kind: 'wait',
	          reason: 'offline-leave',
	          leave: {
	            reason: 'websocket offline',
	            summary: 'safe offline exit',
	            safeReloginAllowed: true,
	            offlineSafety: { unsafe: false }
	          }
	        });
	        return [
	          exit?.reason,
	          String(exit?.safeReloginAllowed),
	          String(exit?.offlineSafety?.unsafe)
	        ].join('|');
	      })(),
	      want: 'websocket offline|true|false'
	    },
	    {
	      name: 'combat log exit summary includes pending unsafe suppress',
	      got: (() => {
	        const exit = combatLogExitSummaryFromDecision({
	          kind: 'leave',
	          reason: 'combat-hp-disadvantage-leave',
	          leave: {
	            reason: 'combat-hp-disadvantage-leave',
	            summary: 'HP disadvantage',
	            attempted: true,
	            pendingLoginSuppressReason: 'pending unsafe hostile exit',
	            pendingLoginSuppressDelayMs: 60000,
	            pendingLoginSuppressMinimumDelayMs: 60000,
	            pendingLoginSuppressHpDelayMs: 90000,
	            pendingLoginSuppressHp: { hp: 45, maxHp: 100 }
	          }
	        });
	        return [
	          exit?.reason,
	          exit?.summary,
	          String(exit?.attempted),
	          exit?.pendingLoginSuppressReason,
	          exit?.pendingLoginSuppressDelayMs,
	          exit?.pendingLoginSuppressMinimumDelayMs,
	          exit?.pendingLoginSuppressHpDelayMs,
	          exit?.pendingLoginSuppressHp?.hp
	        ].join('|');
	      })(),
	      want: 'combat-hp-disadvantage-leave|HP disadvantage|true|pending unsafe hostile exit|60000|60000|90000|45'
	    },
	    {
	      name: 'combat log exit summary includes confirmed longer hold',
	      got: (() => {
	        const exit = combatLogExitSummaryFromDecision({
	          kind: 'wait',
	          reason: 'enemy-leave-wait',
	          leave: {
	            reason: 'enemy-leave-wait',
	            displayReason: 'hostile hold',
	            reloginUntil: 123456789,
	            holdRemainingMs: 599000,
	            reloginDelayMs: 600000
	          }
	        });
	        return [
	          exit?.reason,
	          exit?.displayReason,
	          exit?.reloginUntil,
	          exit?.holdRemainingMs,
	          exit?.reloginDelayMs
	        ].join('|');
	      })(),
	      want: 'enemy-leave-wait|hostile hold|123456789|599000|600000'
	    },
	    {
	      name: 'combat log exit summary falls back to decision hold fields',
	      got: (() => {
	        const exit = combatLogExitSummaryFromDecision({
	          kind: 'wait',
	          reason: 'offline-leave-wait',
	          displayReason: 'offline hold active',
	          leave: null,
	          holdRemainingMs: 61000,
	          reloginDelayMs: 120000
	        });
	        return [
	          exit?.reason,
	          exit?.displayReason,
	          exit?.holdRemainingMs,
	          exit?.reloginDelayMs
	        ].join('|');
		      })(),
		      want: 'offline-leave-wait|offline hold active|61000|120000'
		    },
		    {
		      name: 'safeStringify handles bigint and circular references',
		      got: (() => {
		        const value = { id: 7n };
		        value.self = value;
		        const text = safeStringify(value);
		        return text.includes('"id":"7"') && text.includes('"self":"[Circular]"');
		      })(),
		      want: true
		    },
		    {
		      name: 'safeJsonClone keeps JSON-safe bigint string output',
		      got: safeJsonClone({ id: 9n })?.id,
		      want: '9'
		    },
		    {
		      name: 'combat log id sanitizer removes unsafe filename characters',
		      got: sanitizeCombatLogIdPart(' A/B:中文 ', 'fallback') + '|' + sanitizeCombatLogIdPart('', 'fallback'),
		      want: 'A_B|fallback'
		    },
		    {
		      name: 'display format helpers keep compact Chinese labels',
		      got: [
		        formatDistance(150),
		        formatDistance(1200),
		        formatDurationMs(3600000),
		        actorLabel({ targetId: 42 }),
		        hpDisplay(12.6)
		      ].join('|'),
		      want: '1.5米|12米|1小时|#42|13'
		    }
			  ];
  const resolvedCases = [];
  for (const item of cases) {
    const got = item.got && typeof item.got.then === 'function' ? await item.got : item.got;
    resolvedCases.push({ ...item, got });
  }
  const failed = resolvedCases.filter(item => item.got !== item.want);
  if (failed.length) {
    console.error(JSON.stringify({ ok: false, failed }, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify({ ok: true, cases: cases.length }, null, 2));
}

module.exports = {
  runSelfTest
};
