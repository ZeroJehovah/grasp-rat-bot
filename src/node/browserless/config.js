'use strict';

const path = require('path');
const {
  DEFAULT_LOCAL_TARGET_WHITELIST_FILE,
  DEFAULT_TARGET_WHITELIST_URL
} = require('./target-whitelist');

const MIN_SNAPSHOT_EDGE_INTERVAL_MS = 30000;

const DEFAULTS = {
  gameOrigin: 'https://grasp-rat-game.h-e.top',
  wsPath: '/ws',
  wsExtraQuery: 'compress=gzip%2Cdeflate',
  snapshotPath: '/snapshot',
  targetWhitelistUrl: DEFAULT_TARGET_WHITELIST_URL,
  targetWhitelistFile: DEFAULT_LOCAL_TARGET_WHITELIST_FILE,
  targetWhitelistTimeoutMs: 7000,
  targetWhitelistMaxNames: 100,
  dataDir: path.join(process.cwd(), 'data', 'browserless-runner'),
  logDir: '',
  statusHost: '127.0.0.1',
  statusPort: 18767,
  webToken: '',
  readOnly: true,
  controlMode: 'read-only',
  canaryProfile: '',
  dryRun: true,
  once: false,
  logRetentionDays: 2,
  wsConnectTimeoutMs: 10000,
  readOnlyProbeMs: 30000,
  frameGapAlertMs: 2000,
  transportHealthWindowMs: 10000,
  transportHealthActiveWarmupMs: 1000,
  transportHealthActiveHoldMs: 2500,
  transportLatencyDecisionWindowMs: 3000,
  transportLatencyExitMs: 2500,
  transportLatencyExitSustainMs: 2000,
  transportFrameLossExitRate: 0.05,
  transportFrameLossExitSustainMs: 2000,
  transportFrameLossMinimumExpectedTicks: 100,
  leaveRetryMax: 3,
  leaveRetryMs: 200,
  leaveHedgeMs: 1000,
  leaveDangerHedgeMs: 350,
  httpTimeoutMs: 10000,
  sourceIpProbeTimeoutMs: 60000,
  decisionIntervalMs: 1000,
  loopDelayMs: 30000,
  loginIntervalMs: 60000,
  actionSettlementRecoveryMaxMs: 10000,
  dailyFirstLoginDelayMs: 30000,
  loginPointSafetySuccessRequired: 1,
  loginPointSafetyProbeIntervalMs: 30000,
  loginPointSingleBlockerBypassMs: 3600000,
  snapshotEdgeEnabled: true,
  snapshotEdgeIntervalMs: MIN_SNAPSHOT_EDGE_INTERVAL_MS,
  snapshotEdgeMaxWaitMs: 60000,
  snapshotEdgeMaxErrors: 3,
  snapshotEdgeBackoffMs: 60000,
  staleSelfMs: 3000,
  staleSelfConfirmMs: 2000,
  noSelfGraceMs: 3000,
  staminaExhaustedBelowMs: 200,
  movementCommandIntervalMs: 500,
  movementTargetDeadZoneCm: 900,
  movementSettlementFrames: 2,
  movementSettlementStallMs: 5000,
  movementSettlementMinDistanceCm: 80,
  singleCoinBaitEnabled: true,
  singleCoinBaitHoldRadiusCm: 1000,
  browserlessCenterActivityRadiusCm: 100000,
  browserlessOutsideCenterIdleExitMs: 180000,
  browserlessProfitPursuitMaxMs: 60000,
  browserlessProfitPursuitSuppressMs: 60000,
  browserlessDangerousTargetCooldownMs: 900000,
  browserlessProfitPursuitMinDamageMs: 60000,
  browserlessProfitPursuitMinDamageHp: 10,
  browserlessProfitPursuitSoftMovementStaminaMs: 100000,
  browserlessProfitPursuitHardNoDamageMs: 180000,
  browserlessProfitPursuitHardMovementStaminaMs: 300000,
  browserlessProfitPursuitPressureCycleMs: 60000,
  combatEnabled: false,
  dynamicWhitelistProximitySafetyEnabled: true,
  preTargetIncomingDodgeEnabled: true,
  combatRobustDodgeEnabled: true,
  combatDistanceAwareDodgeEnabled: true,
  combatCloseBandReserveEnabled: true,
  combatMovementStabilityEnabled: false,
  combatSafeRetreatInterceptEnabled: false,
  combatTargetSwitchUrgentReversalGuardEnabled: false,
  combatShootMinIntervalMs: 160,
  combatControlIntervalMs: 50,
  combatClosePressureMinRangeCm: 4500,
  combatClosePressureMaxRangeCm: 5500,
  combatFrameJitterMs: 50,
  combatClosePressureHysteresisCm: 300,
  combatClosePressureShootEveryMs: 520,
  combatClosePressureReserveMs: 2600,
  combatClosePressureMinSelfHp: 60,
  combatClosePressureMaxHpGap: 20,
  combatLootRacePositioningEnabled: true,
  combatLootRaceMinDrop: 10,
  combatLootRaceMaxKillHorizonMs: 1200,
  combatLootRaceCompetitorEtaMarginMs: 350,
  combatLootRaceMinSelfHp: 50,
  combatLootRaceMinOwnEtaMs: 250,
  combatEfficiencyWindowMs: 0,
  combatEfficiencyReferenceDamageHp: 9,
  combatEfficiencyExpectedDamagePerShot: 3,
  combatEfficiencyExpectedShotCadenceMs: 160,
  combatEfficiencyMinimumWindowMs: 1000,
  combatEfficiencyCloseStepCm: 1000,
  combatEfficiencyMinimumDistanceCm: 1000,
  combatEfficiencyRequiredCloserRatio: 0.5,
  combatEfficiencySampleGapCapMs: 250,
  combatResponsePolicyShadowConfirmTicks: 6,
  combatResponsePolicyShadowMinimumHoldMs: 500,
  combatTrajectoryCoverageMode: 'live-single',
  combatEvasiveAimEnabled: true,
  combatEvasiveAimTriggerEnabled: false,
  combatEvasiveAimEarlyDetectionEnabled: true,
  wsTraceEnabled: false,
  wsTracePayload: true,
  wsTraceMaxPayloadChars: 0,
  sourceIp: '',
  sourceIps: [],
  sourceIpInterface: 'enp0s6',
  loginPointX: null,
  loginPointY: null,
  loginPointHp: null,
  invulnerableProfitApproachDistanceCm: 0,
  invulnerableProfitApproachSlackMs: 10000,
  invulnerableProfitAxisSpeedCmPerSec: 950,
  invulnerableProfitDiagonalSpeedCmPerSec: 940,
  invulnerableProfitRouteSegmentOverheadMs: 120,
  afkAttackApproachReserveMaxMs: 5000,
  afkAttackFireMaxRangeCm: 14500,
  afkAttackDynamicFireEnabled: true,
  afkAttackOwnDamageRateHpPerSec: 3,
  afkAttackExternalDamageRateHpPerSec: 2.05,
  afkAttackProjectileSpeedCmPerSec: 10000,
  afkAttackHpSafetyBuffer: 3,
  dynamicProfitThresholdEnabled: true,
  browserlessRemoteProfitTargetsEnabled: true,
  profitThresholdCoinsPer10Stamina: 1,
  profitThresholdHourlyStaminaLimit: 3000,
  profitThresholdResetReserveMs: 14400000
};

const CANARY_PROFILES = {
  'read-only': 'read-only',
  'movement-only': 'movement-only',
  profit: 'non-combat-profit',
  'combat-dry-run': 'combat-dry-run',
  'combat-live': 'combat-live'
};

function boolEnv(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return /^(?:1|true|yes|on)$/i.test(String(value).trim());
}

function numberEnv(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function trajectoryCoverageMode(value, fallback = 'live-single') {
  const allowed = new Set(['off', 'shadow', 'live-single', 'live-volley']);
  const normalized = String(value || '').trim().toLowerCase();
  if (allowed.has(normalized)) return normalized;
  const normalizedFallback = String(fallback || '').trim().toLowerCase();
  return allowed.has(normalizedFallback) ? normalizedFallback : 'live-single';
}

function listEnv(value, fallback = []) {
  if (Array.isArray(value)) return value.map(item => String(item || '').trim()).filter(Boolean);
  if (value === undefined || value === null || value === '') return fallback.slice();
  return String(value)
    .split(/[\s,;]+/g)
    .map(item => item.trim())
    .filter(Boolean);
}

function applyCanaryProfile(config, profile) {
  const value = String(profile || '').trim();
  if (!value) return config;
  const controlMode = CANARY_PROFILES[value];
  if (!controlMode) throw new Error(`unsupported canary profile: ${profile}`);
  config.canaryProfile = value;
  config.controlMode = controlMode;
  config.readOnly = controlMode === 'read-only';
  return config;
}

function parseBrowserlessRunnerArgs(argv = [], env = process.env) {
  const config = {
    ...DEFAULTS,
    gameOrigin: env.GRASP_RAT_BROWSERLESS_GAME_ORIGIN || DEFAULTS.gameOrigin,
    wsPath: env.GRASP_RAT_BROWSERLESS_WS_PATH || DEFAULTS.wsPath,
    wsExtraQuery: env.GRASP_RAT_BROWSERLESS_WS_EXTRA_QUERY || DEFAULTS.wsExtraQuery,
    snapshotPath: env.GRASP_RAT_BROWSERLESS_SNAPSHOT_PATH || DEFAULTS.snapshotPath,
    targetWhitelistUrl: env.GRASP_RAT_BROWSERLESS_TARGET_WHITELIST_URL ?? DEFAULTS.targetWhitelistUrl,
    targetWhitelistFile: env.GRASP_RAT_BROWSERLESS_TARGET_WHITELIST_FILE ?? DEFAULTS.targetWhitelistFile,
    targetWhitelistTimeoutMs: numberEnv(env.GRASP_RAT_BROWSERLESS_TARGET_WHITELIST_TIMEOUT_MS, DEFAULTS.targetWhitelistTimeoutMs),
    targetWhitelistMaxNames: numberEnv(env.GRASP_RAT_BROWSERLESS_TARGET_WHITELIST_MAX_NAMES, DEFAULTS.targetWhitelistMaxNames),
    dataDir: env.GRASP_RAT_BROWSERLESS_DATA_DIR || DEFAULTS.dataDir,
    logDir: env.GRASP_RAT_BROWSERLESS_LOG_DIR || DEFAULTS.logDir,
    statusHost: env.GRASP_RAT_BROWSERLESS_STATUS_HOST || DEFAULTS.statusHost,
    statusPort: numberEnv(env.GRASP_RAT_BROWSERLESS_STATUS_PORT, DEFAULTS.statusPort),
    webToken: env.GRASP_RAT_BROWSERLESS_WEB_TOKEN || DEFAULTS.webToken,
    readOnly: boolEnv(env.GRASP_RAT_BROWSERLESS_READ_ONLY, DEFAULTS.readOnly),
    controlMode: env.GRASP_RAT_BROWSERLESS_CONTROL_MODE || DEFAULTS.controlMode,
    canaryProfile: env.GRASP_RAT_BROWSERLESS_CANARY_PROFILE || DEFAULTS.canaryProfile,
    dryRun: boolEnv(env.GRASP_RAT_BROWSERLESS_DRY_RUN, DEFAULTS.dryRun),
    once: boolEnv(env.GRASP_RAT_BROWSERLESS_ONCE, DEFAULTS.once),
    logRetentionDays: numberEnv(env.GRASP_RAT_BROWSERLESS_LOG_RETENTION_DAYS, DEFAULTS.logRetentionDays),
    wsConnectTimeoutMs: numberEnv(env.GRASP_RAT_BROWSERLESS_WS_CONNECT_TIMEOUT_MS, DEFAULTS.wsConnectTimeoutMs),
    readOnlyProbeMs: numberEnv(env.GRASP_RAT_BROWSERLESS_READONLY_PROBE_MS, DEFAULTS.readOnlyProbeMs),
    frameGapAlertMs: numberEnv(env.GRASP_RAT_BROWSERLESS_FRAME_GAP_ALERT_MS, DEFAULTS.frameGapAlertMs),
    transportHealthWindowMs: numberEnv(env.GRASP_RAT_BROWSERLESS_TRANSPORT_HEALTH_WINDOW_MS, DEFAULTS.transportHealthWindowMs),
    transportHealthActiveWarmupMs: numberEnv(env.GRASP_RAT_BROWSERLESS_TRANSPORT_HEALTH_ACTIVE_WARMUP_MS, DEFAULTS.transportHealthActiveWarmupMs),
    transportHealthActiveHoldMs: numberEnv(env.GRASP_RAT_BROWSERLESS_TRANSPORT_HEALTH_ACTIVE_HOLD_MS, DEFAULTS.transportHealthActiveHoldMs),
    transportLatencyDecisionWindowMs: numberEnv(env.GRASP_RAT_BROWSERLESS_TRANSPORT_LATENCY_DECISION_WINDOW_MS, DEFAULTS.transportLatencyDecisionWindowMs),
    transportLatencyExitMs: numberEnv(env.GRASP_RAT_BROWSERLESS_TRANSPORT_LATENCY_EXIT_MS, DEFAULTS.transportLatencyExitMs),
    transportLatencyExitSustainMs: numberEnv(env.GRASP_RAT_BROWSERLESS_TRANSPORT_LATENCY_EXIT_SUSTAIN_MS, DEFAULTS.transportLatencyExitSustainMs),
    transportFrameLossExitRate: numberEnv(env.GRASP_RAT_BROWSERLESS_TRANSPORT_FRAME_LOSS_EXIT_RATE, DEFAULTS.transportFrameLossExitRate),
    transportFrameLossExitSustainMs: numberEnv(env.GRASP_RAT_BROWSERLESS_TRANSPORT_FRAME_LOSS_EXIT_SUSTAIN_MS, DEFAULTS.transportFrameLossExitSustainMs),
    transportFrameLossMinimumExpectedTicks: numberEnv(env.GRASP_RAT_BROWSERLESS_TRANSPORT_FRAME_LOSS_MINIMUM_EXPECTED_TICKS, DEFAULTS.transportFrameLossMinimumExpectedTicks),
    leaveRetryMax: numberEnv(env.GRASP_RAT_BROWSERLESS_LEAVE_RETRY_MAX, DEFAULTS.leaveRetryMax),
    leaveRetryMs: numberEnv(env.GRASP_RAT_BROWSERLESS_LEAVE_RETRY_MS, DEFAULTS.leaveRetryMs),
    leaveHedgeMs: numberEnv(env.GRASP_RAT_BROWSERLESS_LEAVE_HEDGE_MS, DEFAULTS.leaveHedgeMs),
    leaveDangerHedgeMs: numberEnv(env.GRASP_RAT_BROWSERLESS_LEAVE_DANGER_HEDGE_MS, DEFAULTS.leaveDangerHedgeMs),
    httpTimeoutMs: numberEnv(env.GRASP_RAT_BROWSERLESS_HTTP_TIMEOUT_MS, DEFAULTS.httpTimeoutMs),
    sourceIpProbeTimeoutMs: numberEnv(env.GRASP_RAT_BROWSERLESS_SOURCE_IP_PROBE_TIMEOUT_MS, DEFAULTS.sourceIpProbeTimeoutMs),
    decisionIntervalMs: numberEnv(env.GRASP_RAT_BROWSERLESS_DECISION_INTERVAL_MS, DEFAULTS.decisionIntervalMs),
    loopDelayMs: numberEnv(env.GRASP_RAT_BROWSERLESS_LOOP_DELAY_MS, DEFAULTS.loopDelayMs),
    loginIntervalMs: Math.max(60000, numberEnv(
      env.GRASP_RAT_BROWSERLESS_LOGIN_INTERVAL_MS,
      DEFAULTS.loginIntervalMs
    )),
    actionSettlementRecoveryMaxMs: Math.min(30000, Math.max(3000, numberEnv(
      env.GRASP_RAT_BROWSERLESS_ACTION_SETTLEMENT_RECOVERY_MAX_MS,
      DEFAULTS.actionSettlementRecoveryMaxMs
    ))),
    dailyFirstLoginDelayMs: numberEnv(env.GRASP_RAT_BROWSERLESS_DAILY_FIRST_LOGIN_DELAY_MS, DEFAULTS.dailyFirstLoginDelayMs),
    loginPointSafetySuccessRequired: numberEnv(env.GRASP_RAT_BROWSERLESS_LOGIN_POINT_SAFETY_SUCCESS_REQUIRED, DEFAULTS.loginPointSafetySuccessRequired),
    loginPointSafetyProbeIntervalMs: numberEnv(env.GRASP_RAT_BROWSERLESS_LOGIN_POINT_SAFETY_PROBE_INTERVAL_MS, DEFAULTS.loginPointSafetyProbeIntervalMs),
    loginPointSingleBlockerBypassMs: numberEnv(env.GRASP_RAT_BROWSERLESS_LOGIN_POINT_SINGLE_BLOCKER_BYPASS_MS, DEFAULTS.loginPointSingleBlockerBypassMs),
    snapshotEdgeEnabled: boolEnv(env.GRASP_RAT_BROWSERLESS_SNAPSHOT_EDGE_ENABLED, DEFAULTS.snapshotEdgeEnabled),
    snapshotEdgeIntervalMs: Math.max(
      MIN_SNAPSHOT_EDGE_INTERVAL_MS,
      numberEnv(env.GRASP_RAT_BROWSERLESS_SNAPSHOT_EDGE_INTERVAL_MS, DEFAULTS.snapshotEdgeIntervalMs)
    ),
    snapshotEdgeMaxWaitMs: numberEnv(env.GRASP_RAT_BROWSERLESS_SNAPSHOT_EDGE_MAX_WAIT_MS, DEFAULTS.snapshotEdgeMaxWaitMs),
    snapshotEdgeMaxErrors: numberEnv(env.GRASP_RAT_BROWSERLESS_SNAPSHOT_EDGE_MAX_ERRORS, DEFAULTS.snapshotEdgeMaxErrors),
    snapshotEdgeBackoffMs: numberEnv(env.GRASP_RAT_BROWSERLESS_SNAPSHOT_EDGE_BACKOFF_MS, DEFAULTS.snapshotEdgeBackoffMs),
    staleSelfMs: numberEnv(env.GRASP_RAT_BROWSERLESS_STALE_SELF_MS, DEFAULTS.staleSelfMs),
    staleSelfConfirmMs: numberEnv(env.GRASP_RAT_BROWSERLESS_STALE_SELF_CONFIRM_MS, DEFAULTS.staleSelfConfirmMs),
    noSelfGraceMs: numberEnv(env.GRASP_RAT_BROWSERLESS_NO_SELF_GRACE_MS, DEFAULTS.noSelfGraceMs),
    staminaExhaustedBelowMs: numberEnv(env.GRASP_RAT_BROWSERLESS_STAMINA_EXHAUSTED_BELOW_MS, DEFAULTS.staminaExhaustedBelowMs),
    movementCommandIntervalMs: numberEnv(env.GRASP_RAT_BROWSERLESS_MOVEMENT_COMMAND_INTERVAL_MS, DEFAULTS.movementCommandIntervalMs),
    movementTargetDeadZoneCm: numberEnv(env.GRASP_RAT_BROWSERLESS_MOVEMENT_TARGET_DEAD_ZONE_CM, DEFAULTS.movementTargetDeadZoneCm),
    movementSettlementFrames: numberEnv(env.GRASP_RAT_BROWSERLESS_MOVEMENT_SETTLEMENT_FRAMES, DEFAULTS.movementSettlementFrames),
    movementSettlementStallMs: numberEnv(env.GRASP_RAT_BROWSERLESS_MOVEMENT_SETTLEMENT_STALL_MS, DEFAULTS.movementSettlementStallMs),
    movementSettlementMinDistanceCm: numberEnv(env.GRASP_RAT_BROWSERLESS_MOVEMENT_SETTLEMENT_MIN_DISTANCE_CM, DEFAULTS.movementSettlementMinDistanceCm),
    singleCoinBaitEnabled: boolEnv(env.GRASP_RAT_BROWSERLESS_SINGLE_COIN_BAIT_ENABLED, DEFAULTS.singleCoinBaitEnabled),
    singleCoinBaitHoldRadiusCm: numberEnv(env.GRASP_RAT_BROWSERLESS_SINGLE_COIN_BAIT_HOLD_RADIUS_CM, DEFAULTS.singleCoinBaitHoldRadiusCm),
    browserlessCenterActivityRadiusCm: numberEnv(env.GRASP_RAT_BROWSERLESS_CENTER_ACTIVITY_RADIUS_CM, DEFAULTS.browserlessCenterActivityRadiusCm),
    browserlessOutsideCenterIdleExitMs: numberEnv(env.GRASP_RAT_BROWSERLESS_OUTSIDE_CENTER_IDLE_EXIT_MS, DEFAULTS.browserlessOutsideCenterIdleExitMs),
    browserlessProfitPursuitMaxMs: numberEnv(env.GRASP_RAT_BROWSERLESS_PROFIT_PURSUIT_MAX_MS, DEFAULTS.browserlessProfitPursuitMaxMs),
    browserlessProfitPursuitSuppressMs: numberEnv(env.GRASP_RAT_BROWSERLESS_PROFIT_PURSUIT_SUPPRESS_MS, DEFAULTS.browserlessProfitPursuitSuppressMs),
    browserlessDangerousTargetCooldownMs: numberEnv(env.GRASP_RAT_BROWSERLESS_DANGEROUS_TARGET_COOLDOWN_MS, DEFAULTS.browserlessDangerousTargetCooldownMs),
    browserlessProfitPursuitMinDamageMs: numberEnv(env.GRASP_RAT_BROWSERLESS_PROFIT_PURSUIT_MIN_DAMAGE_MS, DEFAULTS.browserlessProfitPursuitMinDamageMs),
    browserlessProfitPursuitMinDamageHp: numberEnv(env.GRASP_RAT_BROWSERLESS_PROFIT_PURSUIT_MIN_DAMAGE_HP, DEFAULTS.browserlessProfitPursuitMinDamageHp),
    browserlessProfitPursuitSoftMovementStaminaMs: numberEnv(env.GRASP_RAT_BROWSERLESS_PROFIT_PURSUIT_SOFT_MOVEMENT_STAMINA_MS, DEFAULTS.browserlessProfitPursuitSoftMovementStaminaMs),
    browserlessProfitPursuitHardNoDamageMs: numberEnv(env.GRASP_RAT_BROWSERLESS_PROFIT_PURSUIT_HARD_NO_DAMAGE_MS, DEFAULTS.browserlessProfitPursuitHardNoDamageMs),
    browserlessProfitPursuitHardMovementStaminaMs: numberEnv(env.GRASP_RAT_BROWSERLESS_PROFIT_PURSUIT_HARD_MOVEMENT_STAMINA_MS, DEFAULTS.browserlessProfitPursuitHardMovementStaminaMs),
    browserlessProfitPursuitPressureCycleMs: numberEnv(env.GRASP_RAT_BROWSERLESS_PROFIT_PURSUIT_PRESSURE_CYCLE_MS, DEFAULTS.browserlessProfitPursuitPressureCycleMs),
    combatEnabled: boolEnv(env.GRASP_RAT_BROWSERLESS_COMBAT_ENABLED, DEFAULTS.combatEnabled),
    dynamicWhitelistProximitySafetyEnabled: boolEnv(
      env.GRASP_RAT_BROWSERLESS_DYNAMIC_WHITELIST_PROXIMITY_SAFETY_ENABLED,
      DEFAULTS.dynamicWhitelistProximitySafetyEnabled
    ),
    preTargetIncomingDodgeEnabled: boolEnv(
      env.GRASP_RAT_BROWSERLESS_PRE_TARGET_INCOMING_DODGE_ENABLED,
      DEFAULTS.preTargetIncomingDodgeEnabled
    ),
    combatRobustDodgeEnabled: boolEnv(env.GRASP_RAT_BROWSERLESS_COMBAT_ROBUST_DODGE_ENABLED, DEFAULTS.combatRobustDodgeEnabled),
    combatDistanceAwareDodgeEnabled: boolEnv(
      env.GRASP_RAT_BROWSERLESS_COMBAT_DISTANCE_AWARE_DODGE_ENABLED,
      DEFAULTS.combatDistanceAwareDodgeEnabled
    ),
    combatCloseBandReserveEnabled: boolEnv(env.GRASP_RAT_BROWSERLESS_COMBAT_CLOSE_BAND_RESERVE_ENABLED, DEFAULTS.combatCloseBandReserveEnabled),
    combatMovementStabilityEnabled: boolEnv(env.GRASP_RAT_BROWSERLESS_COMBAT_MOVEMENT_STABILITY_ENABLED, DEFAULTS.combatMovementStabilityEnabled),
    combatSafeRetreatInterceptEnabled: boolEnv(
      env.GRASP_RAT_BROWSERLESS_COMBAT_SAFE_RETREAT_INTERCEPT_ENABLED,
      DEFAULTS.combatSafeRetreatInterceptEnabled
    ),
    combatTargetSwitchUrgentReversalGuardEnabled: boolEnv(
      env.GRASP_RAT_BROWSERLESS_COMBAT_TARGET_SWITCH_URGENT_REVERSAL_GUARD_ENABLED,
      DEFAULTS.combatTargetSwitchUrgentReversalGuardEnabled
    ),
    combatShootMinIntervalMs: numberEnv(env.GRASP_RAT_BROWSERLESS_COMBAT_SHOOT_MIN_INTERVAL_MS, DEFAULTS.combatShootMinIntervalMs),
    combatControlIntervalMs: numberEnv(env.GRASP_RAT_BROWSERLESS_COMBAT_CONTROL_INTERVAL_MS, DEFAULTS.combatControlIntervalMs),
    combatClosePressureMinRangeCm: numberEnv(env.GRASP_RAT_BROWSERLESS_COMBAT_CLOSE_PRESSURE_MIN_RANGE_CM, DEFAULTS.combatClosePressureMinRangeCm),
    combatClosePressureMaxRangeCm: numberEnv(env.GRASP_RAT_BROWSERLESS_COMBAT_CLOSE_PRESSURE_MAX_RANGE_CM, DEFAULTS.combatClosePressureMaxRangeCm),
    combatFrameJitterMs: numberEnv(env.GRASP_RAT_BROWSERLESS_COMBAT_FRAME_JITTER_MS, DEFAULTS.combatFrameJitterMs),
    combatClosePressureHysteresisCm: numberEnv(env.GRASP_RAT_BROWSERLESS_COMBAT_CLOSE_PRESSURE_HYSTERESIS_CM, DEFAULTS.combatClosePressureHysteresisCm),
    combatClosePressureShootEveryMs: numberEnv(env.GRASP_RAT_BROWSERLESS_COMBAT_CLOSE_PRESSURE_SHOOT_EVERY_MS, DEFAULTS.combatClosePressureShootEveryMs),
    combatClosePressureReserveMs: numberEnv(env.GRASP_RAT_BROWSERLESS_COMBAT_CLOSE_PRESSURE_RESERVE_MS, DEFAULTS.combatClosePressureReserveMs),
    combatClosePressureMinSelfHp: numberEnv(env.GRASP_RAT_BROWSERLESS_COMBAT_CLOSE_PRESSURE_MIN_SELF_HP, DEFAULTS.combatClosePressureMinSelfHp),
    combatClosePressureMaxHpGap: numberEnv(env.GRASP_RAT_BROWSERLESS_COMBAT_CLOSE_PRESSURE_MAX_HP_GAP, DEFAULTS.combatClosePressureMaxHpGap),
    combatLootRacePositioningEnabled: boolEnv(
      env.GRASP_RAT_BROWSERLESS_COMBAT_LOOT_RACE_POSITIONING_ENABLED,
      DEFAULTS.combatLootRacePositioningEnabled
    ),
    combatLootRaceMinDrop: numberEnv(
      env.GRASP_RAT_BROWSERLESS_COMBAT_LOOT_RACE_MIN_DROP,
      DEFAULTS.combatLootRaceMinDrop
    ),
    combatLootRaceMaxKillHorizonMs: numberEnv(
      env.GRASP_RAT_BROWSERLESS_COMBAT_LOOT_RACE_MAX_KILL_HORIZON_MS,
      DEFAULTS.combatLootRaceMaxKillHorizonMs
    ),
    combatLootRaceCompetitorEtaMarginMs: numberEnv(
      env.GRASP_RAT_BROWSERLESS_COMBAT_LOOT_RACE_COMPETITOR_ETA_MARGIN_MS,
      DEFAULTS.combatLootRaceCompetitorEtaMarginMs
    ),
    combatLootRaceMinSelfHp: numberEnv(
      env.GRASP_RAT_BROWSERLESS_COMBAT_LOOT_RACE_MIN_SELF_HP,
      DEFAULTS.combatLootRaceMinSelfHp
    ),
    combatLootRaceMinOwnEtaMs: numberEnv(
      env.GRASP_RAT_BROWSERLESS_COMBAT_LOOT_RACE_MIN_OWN_ETA_MS,
      DEFAULTS.combatLootRaceMinOwnEtaMs
    ),
    combatEfficiencyWindowMs: numberEnv(env.GRASP_RAT_BROWSERLESS_COMBAT_EFFICIENCY_WINDOW_MS, DEFAULTS.combatEfficiencyWindowMs),
    combatEfficiencyReferenceDamageHp: numberEnv(env.GRASP_RAT_BROWSERLESS_COMBAT_EFFICIENCY_REFERENCE_DAMAGE_HP, DEFAULTS.combatEfficiencyReferenceDamageHp),
    combatEfficiencyExpectedDamagePerShot: numberEnv(env.GRASP_RAT_BROWSERLESS_COMBAT_EFFICIENCY_EXPECTED_DAMAGE_PER_SHOT, DEFAULTS.combatEfficiencyExpectedDamagePerShot),
    combatEfficiencyExpectedShotCadenceMs: numberEnv(env.GRASP_RAT_BROWSERLESS_COMBAT_EFFICIENCY_EXPECTED_SHOT_CADENCE_MS, DEFAULTS.combatEfficiencyExpectedShotCadenceMs),
    combatEfficiencyMinimumWindowMs: numberEnv(env.GRASP_RAT_BROWSERLESS_COMBAT_EFFICIENCY_MINIMUM_WINDOW_MS, DEFAULTS.combatEfficiencyMinimumWindowMs),
    combatEfficiencyCloseStepCm: numberEnv(env.GRASP_RAT_BROWSERLESS_COMBAT_EFFICIENCY_CLOSE_STEP_CM, DEFAULTS.combatEfficiencyCloseStepCm),
    combatEfficiencyMinimumDistanceCm: numberEnv(env.GRASP_RAT_BROWSERLESS_COMBAT_EFFICIENCY_MINIMUM_DISTANCE_CM, DEFAULTS.combatEfficiencyMinimumDistanceCm),
    combatEfficiencyRequiredCloserRatio: numberEnv(env.GRASP_RAT_BROWSERLESS_COMBAT_EFFICIENCY_REQUIRED_CLOSER_RATIO, DEFAULTS.combatEfficiencyRequiredCloserRatio),
    combatEfficiencySampleGapCapMs: numberEnv(env.GRASP_RAT_BROWSERLESS_COMBAT_EFFICIENCY_SAMPLE_GAP_CAP_MS, DEFAULTS.combatEfficiencySampleGapCapMs),
    combatResponsePolicyShadowConfirmTicks: numberEnv(env.GRASP_RAT_BROWSERLESS_COMBAT_RESPONSE_POLICY_SHADOW_CONFIRM_TICKS, DEFAULTS.combatResponsePolicyShadowConfirmTicks),
    combatResponsePolicyShadowMinimumHoldMs: numberEnv(env.GRASP_RAT_BROWSERLESS_COMBAT_RESPONSE_POLICY_SHADOW_MINIMUM_HOLD_MS, DEFAULTS.combatResponsePolicyShadowMinimumHoldMs),
    combatTrajectoryCoverageMode: trajectoryCoverageMode(
      env.GRASP_RAT_BROWSERLESS_COMBAT_TRAJECTORY_COVERAGE_MODE,
      DEFAULTS.combatTrajectoryCoverageMode
    ),
    combatEvasiveAimEnabled: boolEnv(
      env.GRASP_RAT_BROWSERLESS_COMBAT_EVASIVE_AIM_ENABLED,
      DEFAULTS.combatEvasiveAimEnabled
    ),
    combatEvasiveAimTriggerEnabled: boolEnv(
      env.GRASP_RAT_BROWSERLESS_COMBAT_EVASIVE_AIM_TRIGGER_ENABLED,
      DEFAULTS.combatEvasiveAimTriggerEnabled
    ),
    combatEvasiveAimEarlyDetectionEnabled: boolEnv(
      env.GRASP_RAT_BROWSERLESS_COMBAT_EVASIVE_AIM_EARLY_DETECTION_ENABLED,
      DEFAULTS.combatEvasiveAimEarlyDetectionEnabled
    ),
    wsTraceEnabled: boolEnv(env.GRASP_RAT_BROWSERLESS_WS_TRACE_ENABLED ?? env.GRASP_RAT_BROWSERLESS_WS_TRACE, DEFAULTS.wsTraceEnabled),
    wsTracePayload: boolEnv(env.GRASP_RAT_BROWSERLESS_WS_TRACE_PAYLOAD, DEFAULTS.wsTracePayload),
    wsTraceMaxPayloadChars: numberEnv(env.GRASP_RAT_BROWSERLESS_WS_TRACE_MAX_PAYLOAD_CHARS, DEFAULTS.wsTraceMaxPayloadChars),
    sourceIp: env.GRASP_RAT_BROWSERLESS_SOURCE_IP || DEFAULTS.sourceIp,
    sourceIps: listEnv(env.GRASP_RAT_BROWSERLESS_SOURCE_IPS, DEFAULTS.sourceIps),
    sourceIpInterface: env.GRASP_RAT_BROWSERLESS_SOURCE_IP_INTERFACE || DEFAULTS.sourceIpInterface,
    userId: numberEnv(env.GRASP_RAT_BROWSERLESS_USER_ID, 0),
    sessionToken: env.GRASP_RAT_BROWSERLESS_SESSION_TOKEN || '',
    loginPointX: numberEnv(env.GRASP_RAT_BROWSERLESS_LOGIN_POINT_X, DEFAULTS.loginPointX),
    loginPointY: numberEnv(env.GRASP_RAT_BROWSERLESS_LOGIN_POINT_Y, DEFAULTS.loginPointY),
    loginPointHp: numberEnv(env.GRASP_RAT_BROWSERLESS_LOGIN_POINT_HP, DEFAULTS.loginPointHp),
    invulnerableProfitApproachDistanceCm: numberEnv(env.GRASP_RAT_BROWSERLESS_INVULNERABLE_PROFIT_APPROACH_DISTANCE_CM, DEFAULTS.invulnerableProfitApproachDistanceCm),
    invulnerableProfitApproachSlackMs: numberEnv(env.GRASP_RAT_BROWSERLESS_INVULNERABLE_PROFIT_APPROACH_SLACK_MS, DEFAULTS.invulnerableProfitApproachSlackMs),
    invulnerableProfitAxisSpeedCmPerSec: numberEnv(env.GRASP_RAT_BROWSERLESS_INVULNERABLE_PROFIT_AXIS_SPEED_CM_PER_SEC, DEFAULTS.invulnerableProfitAxisSpeedCmPerSec),
    invulnerableProfitDiagonalSpeedCmPerSec: numberEnv(env.GRASP_RAT_BROWSERLESS_INVULNERABLE_PROFIT_DIAGONAL_SPEED_CM_PER_SEC, DEFAULTS.invulnerableProfitDiagonalSpeedCmPerSec),
    invulnerableProfitRouteSegmentOverheadMs: numberEnv(env.GRASP_RAT_BROWSERLESS_INVULNERABLE_PROFIT_ROUTE_SEGMENT_OVERHEAD_MS, DEFAULTS.invulnerableProfitRouteSegmentOverheadMs),
    afkAttackApproachReserveMaxMs: numberEnv(env.GRASP_RAT_BROWSERLESS_AFK_ATTACK_APPROACH_RESERVE_MAX_MS, DEFAULTS.afkAttackApproachReserveMaxMs),
    afkAttackFireMaxRangeCm: numberEnv(env.GRASP_RAT_BROWSERLESS_AFK_ATTACK_FIRE_MAX_RANGE_CM, DEFAULTS.afkAttackFireMaxRangeCm),
    afkAttackDynamicFireEnabled: boolEnv(env.GRASP_RAT_BROWSERLESS_AFK_ATTACK_DYNAMIC_FIRE_ENABLED, DEFAULTS.afkAttackDynamicFireEnabled),
    afkAttackOwnDamageRateHpPerSec: numberEnv(env.GRASP_RAT_BROWSERLESS_AFK_ATTACK_OWN_DAMAGE_RATE_HP_PER_SEC, DEFAULTS.afkAttackOwnDamageRateHpPerSec),
    afkAttackExternalDamageRateHpPerSec: numberEnv(env.GRASP_RAT_BROWSERLESS_AFK_ATTACK_EXTERNAL_DAMAGE_RATE_HP_PER_SEC, DEFAULTS.afkAttackExternalDamageRateHpPerSec),
    afkAttackProjectileSpeedCmPerSec: numberEnv(env.GRASP_RAT_BROWSERLESS_AFK_ATTACK_PROJECTILE_SPEED_CM_PER_SEC, DEFAULTS.afkAttackProjectileSpeedCmPerSec),
    afkAttackHpSafetyBuffer: numberEnv(env.GRASP_RAT_BROWSERLESS_AFK_ATTACK_HP_SAFETY_BUFFER, DEFAULTS.afkAttackHpSafetyBuffer),
    dynamicProfitThresholdEnabled: boolEnv(env.GRASP_RAT_BROWSERLESS_DYNAMIC_PROFIT_THRESHOLD_ENABLED, DEFAULTS.dynamicProfitThresholdEnabled),
    browserlessRemoteProfitTargetsEnabled: boolEnv(
      env.GRASP_RAT_BROWSERLESS_REMOTE_PROFIT_TARGETS_ENABLED,
      DEFAULTS.browserlessRemoteProfitTargetsEnabled
    ),
    profitThresholdCoinsPer10Stamina: numberEnv(env.GRASP_RAT_BROWSERLESS_PROFIT_THRESHOLD_COINS_PER_10_STAMINA, DEFAULTS.profitThresholdCoinsPer10Stamina),
    profitThresholdHourlyStaminaLimit: numberEnv(env.GRASP_RAT_BROWSERLESS_PROFIT_THRESHOLD_HOURLY_STAMINA_LIMIT, DEFAULTS.profitThresholdHourlyStaminaLimit),
    profitThresholdResetReserveMs: numberEnv(env.GRASP_RAT_BROWSERLESS_PROFIT_THRESHOLD_RESET_RESERVE_MS, DEFAULTS.profitThresholdResetReserveMs),
    selfTest: false,
    help: false
  };
  applyCanaryProfile(config, config.canaryProfile);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--read-only') {
      config.readOnly = true;
      config.controlMode = 'read-only';
      config.canaryProfile = '';
    } else if (arg === '--movement-only') {
      config.controlMode = 'movement-only';
      config.readOnly = false;
      config.canaryProfile = '';
    } else if (arg === '--non-combat-profit') {
      config.controlMode = 'non-combat-profit';
      config.readOnly = false;
      config.canaryProfile = '';
    } else if (arg === '--profit-live') {
      config.controlMode = 'profit-live';
      config.readOnly = false;
      config.canaryProfile = '';
    } else if (arg === '--combat-dry-run') {
      config.controlMode = 'combat-dry-run';
      config.readOnly = false;
      config.canaryProfile = '';
    } else if (arg === '--combat-live') {
      config.controlMode = 'combat-live';
      config.readOnly = false;
      config.canaryProfile = '';
    } else if (arg === '--combat-enabled') {
      config.combatEnabled = true;
    } else if (arg === '--no-combat-enabled') {
      config.combatEnabled = false;
    } else if (arg === '--dynamic-whitelist-proximity-safety') {
      config.dynamicWhitelistProximitySafetyEnabled = true;
    } else if (arg === '--no-dynamic-whitelist-proximity-safety') {
      config.dynamicWhitelistProximitySafetyEnabled = false;
    } else if (arg === '--pre-target-incoming-dodge') {
      config.preTargetIncomingDodgeEnabled = true;
    } else if (arg === '--no-pre-target-incoming-dodge') {
      config.preTargetIncomingDodgeEnabled = false;
    } else if (arg === '--control-mode') {
      config.controlMode = argv[++i] || config.controlMode;
      config.readOnly = config.controlMode === 'read-only';
      config.canaryProfile = '';
    } else if (arg === '--canary-profile') {
      applyCanaryProfile(config, argv[++i] || '');
    } else if (arg === '--dry-run') {
      config.dryRun = true;
    } else if (arg === '--live') {
      config.dryRun = false;
    } else if (arg === '--once') {
      config.once = true;
    } else if (arg === '--data-dir') {
      config.dataDir = argv[++i] || config.dataDir;
    } else if (arg === '--log-dir') {
      config.logDir = argv[++i] || config.logDir;
    } else if (arg === '--status-host') {
      config.statusHost = argv[++i] || config.statusHost;
    } else if (arg === '--status-port') {
      config.statusPort = numberEnv(argv[++i], config.statusPort);
    } else if (arg === '--web-token') {
      config.webToken = argv[++i] || '';
    } else if (arg === '--user-id') {
      config.userId = numberEnv(argv[++i], 0);
    } else if (arg === '--session-token') {
      config.sessionToken = argv[++i] || '';
    } else if (arg === '--log-retention-days') {
      config.logRetentionDays = numberEnv(argv[++i], config.logRetentionDays);
    } else if (arg === '--read-only-probe-ms') {
      config.readOnlyProbeMs = numberEnv(argv[++i], config.readOnlyProbeMs);
    } else if (arg === '--frame-gap-alert-ms') {
      config.frameGapAlertMs = numberEnv(argv[++i], config.frameGapAlertMs);
    } else if (arg === '--transport-health-window-ms') {
      config.transportHealthWindowMs = numberEnv(argv[++i], config.transportHealthWindowMs);
    } else if (arg === '--transport-health-active-warmup-ms') {
      config.transportHealthActiveWarmupMs = numberEnv(argv[++i], config.transportHealthActiveWarmupMs);
    } else if (arg === '--transport-health-active-hold-ms') {
      config.transportHealthActiveHoldMs = numberEnv(argv[++i], config.transportHealthActiveHoldMs);
    } else if (arg === '--transport-latency-decision-window-ms') {
      config.transportLatencyDecisionWindowMs = numberEnv(argv[++i], config.transportLatencyDecisionWindowMs);
    } else if (arg === '--transport-latency-exit-ms') {
      config.transportLatencyExitMs = numberEnv(argv[++i], config.transportLatencyExitMs);
    } else if (arg === '--transport-latency-exit-sustain-ms') {
      config.transportLatencyExitSustainMs = numberEnv(argv[++i], config.transportLatencyExitSustainMs);
    } else if (arg === '--transport-frame-loss-exit-rate') {
      config.transportFrameLossExitRate = numberEnv(argv[++i], config.transportFrameLossExitRate);
    } else if (arg === '--transport-frame-loss-exit-sustain-ms') {
      config.transportFrameLossExitSustainMs = numberEnv(argv[++i], config.transportFrameLossExitSustainMs);
    } else if (arg === '--transport-frame-loss-minimum-expected-ticks') {
      config.transportFrameLossMinimumExpectedTicks = numberEnv(argv[++i], config.transportFrameLossMinimumExpectedTicks);
    } else if (arg === '--snapshot-path') {
      config.snapshotPath = argv[++i] || config.snapshotPath;
    } else if (arg === '--target-whitelist-url') {
      config.targetWhitelistUrl = argv[++i] ?? '';
    } else if (arg === '--target-whitelist-file') {
      config.targetWhitelistFile = argv[++i] ?? '';
    } else if (arg === '--target-whitelist-timeout-ms') {
      config.targetWhitelistTimeoutMs = numberEnv(argv[++i], config.targetWhitelistTimeoutMs);
    } else if (arg === '--target-whitelist-max-names') {
      config.targetWhitelistMaxNames = numberEnv(argv[++i], config.targetWhitelistMaxNames);
    } else if (arg === '--decision-interval-ms') {
      config.decisionIntervalMs = numberEnv(argv[++i], config.decisionIntervalMs);
    } else if (arg === '--loop-delay-ms') {
      config.loopDelayMs = numberEnv(argv[++i], config.loopDelayMs);
    } else if (arg === '--login-interval-ms') {
      config.loginIntervalMs = Math.max(60000, numberEnv(argv[++i], config.loginIntervalMs));
    } else if (arg === '--action-settlement-recovery-max-ms') {
      config.actionSettlementRecoveryMaxMs = Math.min(30000, Math.max(3000, numberEnv(
        argv[++i], config.actionSettlementRecoveryMaxMs
      )));
    } else if (arg === '--daily-first-login-delay-ms') {
      config.dailyFirstLoginDelayMs = numberEnv(argv[++i], config.dailyFirstLoginDelayMs);
    } else if (arg === '--login-point-safety-success-required') {
      config.loginPointSafetySuccessRequired = numberEnv(argv[++i], config.loginPointSafetySuccessRequired);
    } else if (arg === '--login-point-safety-probe-interval-ms') {
      config.loginPointSafetyProbeIntervalMs = numberEnv(argv[++i], config.loginPointSafetyProbeIntervalMs);
    } else if (arg === '--login-point-single-blocker-bypass-ms') {
      config.loginPointSingleBlockerBypassMs = numberEnv(argv[++i], config.loginPointSingleBlockerBypassMs);
    } else if (arg === '--snapshot-edge-enabled') {
      config.snapshotEdgeEnabled = true;
    } else if (arg === '--no-snapshot-edge-enabled') {
      config.snapshotEdgeEnabled = false;
    } else if (arg === '--snapshot-edge-interval-ms') {
      config.snapshotEdgeIntervalMs = Math.max(
        MIN_SNAPSHOT_EDGE_INTERVAL_MS,
        numberEnv(argv[++i], config.snapshotEdgeIntervalMs)
      );
    } else if (arg === '--snapshot-edge-max-wait-ms') {
      config.snapshotEdgeMaxWaitMs = numberEnv(argv[++i], config.snapshotEdgeMaxWaitMs);
    } else if (arg === '--snapshot-edge-max-errors') {
      config.snapshotEdgeMaxErrors = numberEnv(argv[++i], config.snapshotEdgeMaxErrors);
    } else if (arg === '--snapshot-edge-backoff-ms') {
      config.snapshotEdgeBackoffMs = numberEnv(argv[++i], config.snapshotEdgeBackoffMs);
    } else if (arg === '--stale-self-ms') {
      config.staleSelfMs = numberEnv(argv[++i], config.staleSelfMs);
    } else if (arg === '--stale-self-confirm-ms') {
      config.staleSelfConfirmMs = numberEnv(argv[++i], config.staleSelfConfirmMs);
    } else if (arg === '--no-self-grace-ms') {
      config.noSelfGraceMs = numberEnv(argv[++i], config.noSelfGraceMs);
    } else if (arg === '--stamina-exhausted-below-ms') {
      config.staminaExhaustedBelowMs = numberEnv(argv[++i], config.staminaExhaustedBelowMs);
    } else if (arg === '--movement-command-interval-ms') {
      config.movementCommandIntervalMs = numberEnv(argv[++i], config.movementCommandIntervalMs);
    } else if (arg === '--movement-target-dead-zone-cm') {
      config.movementTargetDeadZoneCm = numberEnv(argv[++i], config.movementTargetDeadZoneCm);
    } else if (arg === '--movement-settlement-frames') {
      config.movementSettlementFrames = numberEnv(argv[++i], config.movementSettlementFrames);
    } else if (arg === '--movement-settlement-stall-ms') {
      config.movementSettlementStallMs = numberEnv(argv[++i], config.movementSettlementStallMs);
    } else if (arg === '--movement-settlement-min-distance-cm') {
      config.movementSettlementMinDistanceCm = numberEnv(argv[++i], config.movementSettlementMinDistanceCm);
    } else if (arg === '--center-activity-radius-cm') {
      config.browserlessCenterActivityRadiusCm = numberEnv(argv[++i], config.browserlessCenterActivityRadiusCm);
    } else if (arg === '--outside-center-idle-exit-ms') {
      config.browserlessOutsideCenterIdleExitMs = numberEnv(argv[++i], config.browserlessOutsideCenterIdleExitMs);
    } else if (arg === '--profit-pursuit-max-ms') {
      config.browserlessProfitPursuitMaxMs = numberEnv(argv[++i], config.browserlessProfitPursuitMaxMs);
    } else if (arg === '--profit-pursuit-suppress-ms') {
      config.browserlessProfitPursuitSuppressMs = numberEnv(argv[++i], config.browserlessProfitPursuitSuppressMs);
    } else if (arg === '--dangerous-target-cooldown-ms') {
      config.browserlessDangerousTargetCooldownMs = numberEnv(argv[++i], config.browserlessDangerousTargetCooldownMs);
    } else if (arg === '--profit-pursuit-min-damage-ms') {
      config.browserlessProfitPursuitMinDamageMs = numberEnv(argv[++i], config.browserlessProfitPursuitMinDamageMs);
    } else if (arg === '--profit-pursuit-min-damage-hp') {
      config.browserlessProfitPursuitMinDamageHp = numberEnv(argv[++i], config.browserlessProfitPursuitMinDamageHp);
    } else if (arg === '--profit-pursuit-soft-movement-stamina-ms') {
      config.browserlessProfitPursuitSoftMovementStaminaMs = numberEnv(argv[++i], config.browserlessProfitPursuitSoftMovementStaminaMs);
    } else if (arg === '--profit-pursuit-hard-no-damage-ms') {
      config.browserlessProfitPursuitHardNoDamageMs = numberEnv(argv[++i], config.browserlessProfitPursuitHardNoDamageMs);
    } else if (arg === '--profit-pursuit-hard-movement-stamina-ms') {
      config.browserlessProfitPursuitHardMovementStaminaMs = numberEnv(argv[++i], config.browserlessProfitPursuitHardMovementStaminaMs);
    } else if (arg === '--profit-pursuit-pressure-cycle-ms') {
      config.browserlessProfitPursuitPressureCycleMs = numberEnv(argv[++i], config.browserlessProfitPursuitPressureCycleMs);
    } else if (arg === '--combat-shoot-min-interval-ms') {
      config.combatShootMinIntervalMs = numberEnv(argv[++i], config.combatShootMinIntervalMs);
    } else if (arg === '--no-combat-robust-dodge') {
      config.combatRobustDodgeEnabled = false;
    } else if (arg === '--combat-distance-aware-dodge') {
      config.combatDistanceAwareDodgeEnabled = true;
    } else if (arg === '--no-combat-distance-aware-dodge') {
      config.combatDistanceAwareDodgeEnabled = false;
    } else if (arg === '--no-combat-close-band-reserve') {
      config.combatCloseBandReserveEnabled = false;
    } else if (arg === '--combat-movement-stability') {
      config.combatMovementStabilityEnabled = true;
    } else if (arg === '--no-combat-movement-stability') {
      config.combatMovementStabilityEnabled = false;
    } else if (arg === '--combat-safe-retreat-intercept') {
      config.combatSafeRetreatInterceptEnabled = true;
    } else if (arg === '--no-combat-safe-retreat-intercept') {
      config.combatSafeRetreatInterceptEnabled = false;
    } else if (arg === '--combat-control-interval-ms') {
      config.combatControlIntervalMs = numberEnv(argv[++i], config.combatControlIntervalMs);
    } else if (arg === '--combat-close-pressure-min-range-cm') {
      config.combatClosePressureMinRangeCm = numberEnv(argv[++i], config.combatClosePressureMinRangeCm);
    } else if (arg === '--combat-close-pressure-max-range-cm') {
      config.combatClosePressureMaxRangeCm = numberEnv(argv[++i], config.combatClosePressureMaxRangeCm);
    } else if (arg === '--combat-frame-jitter-ms') {
      config.combatFrameJitterMs = numberEnv(argv[++i], config.combatFrameJitterMs);
    } else if (arg === '--combat-close-pressure-hysteresis-cm') {
      config.combatClosePressureHysteresisCm = numberEnv(argv[++i], config.combatClosePressureHysteresisCm);
    } else if (arg === '--combat-close-pressure-shoot-every-ms') {
      config.combatClosePressureShootEveryMs = numberEnv(argv[++i], config.combatClosePressureShootEveryMs);
    } else if (arg === '--combat-close-pressure-reserve-ms') {
      config.combatClosePressureReserveMs = numberEnv(argv[++i], config.combatClosePressureReserveMs);
    } else if (arg === '--combat-close-pressure-min-self-hp') {
      config.combatClosePressureMinSelfHp = numberEnv(argv[++i], config.combatClosePressureMinSelfHp);
    } else if (arg === '--combat-close-pressure-max-hp-gap') {
      config.combatClosePressureMaxHpGap = numberEnv(argv[++i], config.combatClosePressureMaxHpGap);
    } else if (arg === '--combat-loot-race-positioning') {
      config.combatLootRacePositioningEnabled = true;
    } else if (arg === '--no-combat-loot-race-positioning') {
      config.combatLootRacePositioningEnabled = false;
    } else if (arg === '--combat-loot-race-min-drop') {
      config.combatLootRaceMinDrop = numberEnv(argv[++i], config.combatLootRaceMinDrop);
    } else if (arg === '--combat-loot-race-max-kill-horizon-ms') {
      config.combatLootRaceMaxKillHorizonMs = numberEnv(argv[++i], config.combatLootRaceMaxKillHorizonMs);
    } else if (arg === '--combat-loot-race-competitor-eta-margin-ms') {
      config.combatLootRaceCompetitorEtaMarginMs = numberEnv(argv[++i], config.combatLootRaceCompetitorEtaMarginMs);
    } else if (arg === '--combat-loot-race-min-self-hp') {
      config.combatLootRaceMinSelfHp = numberEnv(argv[++i], config.combatLootRaceMinSelfHp);
    } else if (arg === '--combat-loot-race-min-own-eta-ms') {
      config.combatLootRaceMinOwnEtaMs = numberEnv(argv[++i], config.combatLootRaceMinOwnEtaMs);
    } else if (arg === '--combat-efficiency-window-ms') {
      config.combatEfficiencyWindowMs = numberEnv(argv[++i], config.combatEfficiencyWindowMs);
    } else if (arg === '--combat-efficiency-reference-damage-hp') {
      config.combatEfficiencyReferenceDamageHp = numberEnv(argv[++i], config.combatEfficiencyReferenceDamageHp);
    } else if (arg === '--combat-efficiency-expected-damage-per-shot') {
      config.combatEfficiencyExpectedDamagePerShot = numberEnv(argv[++i], config.combatEfficiencyExpectedDamagePerShot);
    } else if (arg === '--combat-efficiency-expected-shot-cadence-ms') {
      config.combatEfficiencyExpectedShotCadenceMs = numberEnv(argv[++i], config.combatEfficiencyExpectedShotCadenceMs);
    } else if (arg === '--combat-efficiency-minimum-window-ms') {
      config.combatEfficiencyMinimumWindowMs = numberEnv(argv[++i], config.combatEfficiencyMinimumWindowMs);
    } else if (arg === '--combat-efficiency-close-step-cm') {
      config.combatEfficiencyCloseStepCm = numberEnv(argv[++i], config.combatEfficiencyCloseStepCm);
    } else if (arg === '--combat-efficiency-minimum-distance-cm') {
      config.combatEfficiencyMinimumDistanceCm = numberEnv(argv[++i], config.combatEfficiencyMinimumDistanceCm);
    } else if (arg === '--combat-efficiency-required-closer-ratio') {
      config.combatEfficiencyRequiredCloserRatio = numberEnv(argv[++i], config.combatEfficiencyRequiredCloserRatio);
    } else if (arg === '--combat-efficiency-sample-gap-cap-ms') {
      config.combatEfficiencySampleGapCapMs = numberEnv(argv[++i], config.combatEfficiencySampleGapCapMs);
    } else if (arg === '--combat-response-policy-shadow-confirm-ticks') {
      config.combatResponsePolicyShadowConfirmTicks = numberEnv(argv[++i], config.combatResponsePolicyShadowConfirmTicks);
    } else if (arg === '--combat-response-policy-shadow-minimum-hold-ms') {
      config.combatResponsePolicyShadowMinimumHoldMs = numberEnv(argv[++i], config.combatResponsePolicyShadowMinimumHoldMs);
    } else if (arg === '--combat-trajectory-coverage-mode') {
      config.combatTrajectoryCoverageMode = trajectoryCoverageMode(argv[++i], config.combatTrajectoryCoverageMode);
    } else if (arg === '--combat-evasive-aim') {
      config.combatEvasiveAimEnabled = true;
    } else if (arg === '--no-combat-evasive-aim') {
      config.combatEvasiveAimEnabled = false;
    } else if (arg === '--combat-evasive-aim-trigger') {
      config.combatEvasiveAimTriggerEnabled = true;
    } else if (arg === '--no-combat-evasive-aim-trigger') {
      config.combatEvasiveAimTriggerEnabled = false;
    } else if (arg === '--combat-evasive-aim-early-detection') {
      config.combatEvasiveAimEarlyDetectionEnabled = true;
    } else if (arg === '--no-combat-evasive-aim-early-detection') {
      config.combatEvasiveAimEarlyDetectionEnabled = false;
    } else if (arg === '--ws-trace') {
      config.wsTraceEnabled = true;
    } else if (arg === '--no-ws-trace') {
      config.wsTraceEnabled = false;
    } else if (arg === '--ws-trace-summary-only') {
      config.wsTracePayload = false;
    } else if (arg === '--ws-trace-max-payload-chars') {
      config.wsTraceMaxPayloadChars = numberEnv(argv[++i], config.wsTraceMaxPayloadChars);
    } else if (arg === '--source-ip') {
      config.sourceIp = argv[++i] || '';
    } else if (arg === '--source-ips') {
      config.sourceIps = listEnv(argv[++i] || '', []);
    } else if (arg === '--source-ip-interface') {
      config.sourceIpInterface = String(argv[++i] || config.sourceIpInterface).trim() || config.sourceIpInterface;
    } else if (arg === '--source-ip-probe-timeout-ms') {
      config.sourceIpProbeTimeoutMs = numberEnv(argv[++i], config.sourceIpProbeTimeoutMs);
    } else if (arg === '--login-point-x') {
      config.loginPointX = numberEnv(argv[++i], config.loginPointX);
    } else if (arg === '--login-point-y') {
      config.loginPointY = numberEnv(argv[++i], config.loginPointY);
    } else if (arg === '--login-point-hp') {
      config.loginPointHp = numberEnv(argv[++i], config.loginPointHp);
    } else if (arg === '--dynamic-profit-threshold') {
      config.dynamicProfitThresholdEnabled = true;
    } else if (arg === '--no-dynamic-profit-threshold') {
      config.dynamicProfitThresholdEnabled = false;
    } else if (arg === '--profit-threshold-coins-per-10-stamina') {
      config.profitThresholdCoinsPer10Stamina = numberEnv(argv[++i], config.profitThresholdCoinsPer10Stamina);
    } else if (arg === '--profit-threshold-hourly-stamina-limit') {
      config.profitThresholdHourlyStaminaLimit = numberEnv(argv[++i], config.profitThresholdHourlyStaminaLimit);
    } else if (arg === '--profit-threshold-reset-reserve-ms') {
      config.profitThresholdResetReserveMs = numberEnv(argv[++i], config.profitThresholdResetReserveMs);
    } else if (arg === '--self-test') {
      config.selfTest = true;
    } else if (arg === '--help' || arg === '-h') {
      config.help = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (!['read-only', 'movement-only', 'non-combat-profit', 'profit-live', 'combat-dry-run', 'combat-live'].includes(String(config.controlMode || ''))) {
    throw new Error(`unsupported control mode: ${config.controlMode}`);
  }
  if (String(config.sourceIpInterface || '') !== DEFAULTS.sourceIpInterface) {
    throw new Error(`unsupported source IP interface: ${config.sourceIpInterface}; expected ${DEFAULTS.sourceIpInterface}`);
  }
  config.readOnly = config.controlMode === 'read-only';
  config.dataDir = path.resolve(config.dataDir);
  config.logDir = path.resolve(config.logDir || path.join(config.dataDir, 'logs'));
  config.targetWhitelistFile = config.targetWhitelistFile ? path.resolve(config.targetWhitelistFile) : '';
  config.stateFile = path.join(config.dataDir, 'state.json');
  return config;
}

function usage() {
  return [
    'Usage: node scripts/browserless-runner.js [options]',
    '',
    'Options:',
    '  --read-only              Start in read-only mode (default)',
    '  --movement-only          Enable live movement-only velocity commands; shooting remains disabled',
    '  --non-combat-profit      Enable supervised non-combat coin profit movement; shooting remains disabled',
    '  --profit-live            Enable supervised profit mode for coins, AFK targets, and opt-in active combat',
    '  --combat-dry-run         Evaluate combat target/movement/aim/fire intent without movement or shooting',
    '  --combat-live            Enable guarded live combat mode; requires --combat-enabled before shooting',
    '  --combat-enabled         Allow combat-live/profit-live combat movement and shoot commands. Default: false',
    '  --[no-]dynamic-whitelist-proximity-safety  Enable HP-scaled whitelist contact combat and low-HP exits. Default: enabled',
    '  --[no-]pre-target-incoming-dodge  Execute collision-path Dodge before a combat target exists. Default: enabled',
    '  --canary-profile <name>  read-only, movement-only, profit, combat-dry-run, or combat-live',
    '  --control-mode <mode>    read-only, movement-only, non-combat-profit, profit-live, combat-dry-run, or combat-live. Default: read-only',
    '  --dry-run                Do not connect to live game transport (default)',
    '  --live                   Disable dry-run; live transport still requires an explicit control mode',
    '  --once                   Run one bounded skeleton cycle and exit',
    '  --data-dir <dir>         State/log root. Default: data/browserless-runner',
    '  --log-dir <dir>          JSONL log root. Default: <data-dir>/logs',
    '  --status-host <host>     Status host placeholder. Default: 127.0.0.1',
    '  --status-port <port>     Status port placeholder. Default: 18767',
    '  --web-token <token>      Required later when status server is enabled',
    '  --user-id <id>           Manual session user id, usually loaded from state later',
    '  --session-token <token>  Manual session token, usually loaded from state later',
    '  --read-only-probe-ms <ms>  Read-only canary duration. Default: 30000',
    '  --frame-gap-alert-ms <ms>  Read-only canary frame-gap failure threshold. Default: 2000',
    '  --transport-health-window-ms <ms>  Active inferred frame-loss window. Default: 10000',
    '  --transport-health-active-warmup-ms <ms>  Active sampling warmup. Default: 1000',
    '  --transport-health-active-hold-ms <ms>  Keep active sampling after control quiets. Default: 2500',
    '  --transport-latency-decision-window-ms <ms>  Relative-latency P90 window. Default: 3000',
    '  --transport-latency-exit-ms <ms>  Hostile active latency P90 exit threshold. Default: 2500',
    '  --transport-latency-exit-sustain-ms <ms>  Required sustained latency breach. Default: 2000',
    '  --transport-frame-loss-exit-rate <ratio>  Hostile active inferred-loss exit ratio. Default: 0.05',
    '  --transport-frame-loss-exit-sustain-ms <ms>  Required sustained inferred-loss breach. Default: 2000',
    '  --transport-frame-loss-minimum-expected-ticks <n>  Minimum active ticks before loss exit. Default: 100',
    '  --snapshot-path <path>    Snapshot path for pre-login safety. Default: /snapshot',
    '  --target-whitelist-url <url>   Browserless target whitelist URL. Default: project dist/target-whitelist.json',
    '  --target-whitelist-file <file> Local whitelist fallback. Default: ./dist/target-whitelist.json',
    '  --decision-interval-ms <ms>  Dry-run decision log/status interval. Default: 1000',
    '  --loop-delay-ms <ms>    Delay before the next non-once live cycle after recoverable exit. Default: 30000',
    '  --action-settlement-recovery-max-ms <ms>  Bounded non-combat settlement recovery window (3000-30000). Default: 10000',
    '  --daily-first-login-delay-ms <ms>  Earliest UTC+8 daily first login after midnight. Default: 30000',
    '  --login-point-safety-success-required <n>  Legacy consecutive checks when snapshot edge mode is disabled. Default: 1',
    '  --login-interval-ms <ms>  Hard minimum between successful logins; values below 60000 are clamped. Default: 60000',
    '  --login-point-safety-probe-interval-ms <ms>  Delay between those checks. Default: 30000',
    '  --[no-]snapshot-edge-enabled  Wait for a post-baseline snapshot version and evaluate it once. Default: enabled',
    '  --snapshot-edge-interval-ms <ms>  Snapshot version probe interval; values below 30000 are clamped. Default: 30000',
    '  --snapshot-edge-max-wait-ms <ms>  Maximum active edge-probe window. Default: 60000',
    '  --snapshot-edge-max-errors <n>  Consecutive edge-probe errors before backoff. Default: 3',
    '  --snapshot-edge-backoff-ms <ms>  Backoff after edge timeout/error limit. Default: 60000',
    '  --stale-self-ms <ms>      Safety stale-self threshold. Default: 3000',
    '  --stale-self-confirm-ms <ms>  Extra stale-self confirmation window before leave. Default: 2000',
    '  --no-self-grace-ms <ms>   Safety no-self grace window. Default: 3000',
    '  --stamina-exhausted-below-ms <ms>  Safety stamina floor. Default: 200',
    '  --movement-command-interval-ms <ms>  Movement velocity throttle. Default: 500',
    '  --movement-target-dead-zone-cm <cm>  Movement target stop radius. Default: 900',
    '  --movement-settlement-frames <n>  Realtime frames needed after command. Default: 2',
    '  --movement-settlement-stall-ms <ms>  Reconnect when nonzero movement makes no coordinate progress. Default: 5000',
    '  --movement-settlement-min-distance-cm <cm>  Coordinate progress needed to reset the stall timer. Default: 80',
    '  --[no-]combat-movement-stability  Apply threat-aware short combat direction settlement. Default: disabled',
    '  --center-activity-radius-cm <cm>  Start the outside-center no-profit timer beyond this origin radius. Default: 100000',
    '  --outside-center-idle-exit-ms <ms>  Leave after waiting outside the center without profit. Default: 180000',
    '  --profit-pursuit-max-ms <ms>  Legacy no-damage pursuit diagnostic threshold. Default: 60000',
    '  --profit-pursuit-suppress-ms <ms>  Suppression cooldown after a profit pursuit is stopped. Default: 60000',
    '  --dangerous-target-cooldown-ms <ms>  Cooldown for ordinary profit against targets that forced a combat leave. Default: 900000',
    '  --profit-pursuit-min-damage-ms <ms>  Legacy no-damage diagnostic threshold. Default: 60000',
    '  --profit-pursuit-min-damage-hp <hp>  Legacy low-damage diagnostic amount. Default: 10',
    '  --profit-pursuit-soft-movement-stamina-ms <ms>  Advisory movement-stamina review threshold. Default: 100000',
    '  --profit-pursuit-hard-no-damage-ms <ms>  Advisory no-damage review threshold. Default: 180000',
    '  --profit-pursuit-hard-movement-stamina-ms <ms>  Advisory movement-stamina review threshold. Default: 300000',
    '  --profit-pursuit-pressure-cycle-ms <ms>  Advisory economic pressure-cycle threshold. Default: 60000',
    '  --combat-shoot-min-interval-ms <ms>  Minimum live combat shoot interval. Default: 160',
    '  --combat-control-interval-ms <ms>     Recompute live combat from each fresh server tick. Default: 50',
    '  --combat-close-pressure-min-range-cm <cm>  Lower bound for predictive close pressure. Default: 4500',
    '  --combat-close-pressure-max-range-cm <cm>  Upper bound for predictive close pressure. Default: 5500',
    '  --combat-frame-jitter-ms <ms>  Realtime frame jitter included in pressure range budget. Default: 50',
    '  --combat-close-pressure-hysteresis-cm <cm>  Distance hysteresis around pressure range. Default: 300',
    '  --combat-close-pressure-shoot-every-ms <ms>  Bounded close-pressure firing cadence. Default: 520',
    '  --combat-close-pressure-reserve-ms <ms>  Close-pressure stamina reserve. Default: 2600',
    '  --combat-close-pressure-min-self-hp <hp>  Minimum HP for exchange continuation. Default: 60',
    '  --combat-close-pressure-max-hp-gap <hp>  Maximum target HP lead for continuation. Default: 20',
    '  --[no-]combat-loot-race-positioning  Enable low-HP high-Drop competitor positioning. Default: enabled',
    '  --combat-loot-race-min-drop <coins>  Minimum target Drop for loot-race positioning. Default: 10',
    '  --combat-loot-race-max-kill-horizon-ms <ms>  Maximum estimated lethal horizon. Default: 1200',
    '  --combat-loot-race-competitor-eta-margin-ms <ms>  Allowed competitor ETA margin. Default: 350',
    '  --combat-loot-race-min-self-hp <hp>  Minimum self HP for loot-race positioning. Default: 50',
    '  --combat-loot-race-min-own-eta-ms <ms>  Ignore already-safe own drop ETA. Default: 250',
    '  --combat-efficiency-window-ms <ms>  Explicit efficiency-window override; 0 derives the Drop-aware 9 HP window. Default: 0',
    '  --combat-efficiency-reference-damage-hp <hp>  Reference damage used to derive the efficiency window. Default: 9',
    '  --combat-efficiency-expected-damage-per-shot <hp>  Expected damage per successful shot for the derived window. Default: 3',
    '  --combat-efficiency-expected-shot-cadence-ms <ms>  Expected normal combat shot cadence for the derived window. Default: 160',
    '  --combat-efficiency-minimum-window-ms <ms>  Safety floor for the derived efficiency window. Default: 1000',
    '  --combat-efficiency-close-step-cm <cm>  Distance removed after each maintained low-efficiency window. Default: 1000',
    '  --combat-efficiency-minimum-distance-cm <cm>  Lowest forced-close goal. Default: 1000',
    '  --combat-efficiency-required-closer-ratio <ratio>  Required time share inside the closer range. Default: 0.5',
    '  --combat-efficiency-sample-gap-cap-ms <ms>  Maximum one-frame contribution to closer-range time. Default: 250',
    '  --combat-response-policy-shadow-confirm-ticks <n>  Candidate confirmations for shadow policy latch. Default: 6',
    '  --combat-response-policy-shadow-minimum-hold-ms <ms>  Minimum shadow policy hold. Default: 500',
    '  --combat-trajectory-coverage-mode <mode>  Multi-trajectory aim mode: off|shadow|live-single|live-volley. Default: live-single',
    '  --[no-]combat-evasive-aim  Enable the five-strategy evasive-opponent aim experiment. Default: enabled',
    '  --[no-]combat-evasive-aim-trigger  Allow the experiment to trigger (apply offset angles). Default: disabled',
    '  --[no-]combat-evasive-aim-early-detection  Allow strict zero-hit evasive behavior to switch before the half-window fallback. Default: enabled',
    '  --no-combat-robust-dodge  Disable robust Dodge schedule/trajectory uncertainty for rollback',
    '  --no-combat-distance-aware-dodge  Disable distance-aware Dodge rollout for rollback',
    '  --no-combat-close-band-reserve  Disable the two-shot close-band reserve for rollback',
    '  --ws-trace              Write decoded WebSocket frame/command trace to ws.jsonl',
    '  --no-ws-trace           Disable WebSocket trace logging',
    '  --ws-trace-summary-only  Log WebSocket frame summaries without decoded payloads',
    '  --ws-trace-max-payload-chars <n>  Truncate decoded WS payload JSON; 0 means full payload',
    '  --source-ip <ip>        Bind browserless HTTP/WS outbound sockets to this local source IP',
    '  --source-ips <list>     Legacy compatibility pool; new login candidates come from the enp0s6 interface',
    '  --source-ip-interface <name>  Fixed login-preflight interface; only enp0s6 is accepted',
    '  --source-ip-probe-timeout-ms <ms>  Anonymous homepage probe timeout. Default: 60000',
    '  --login-point-x <cm>      Manual login point x for canary safety',
    '  --login-point-y <cm>      Manual login point y for canary safety',
    '  --login-point-hp <hp>     Manual login point HP context for canary safety',
    '  --login-point-single-blocker-bypass-ms <ms>  Full-HP bypass after one sole blocker persists. Default: 3600000',
    '  --dynamic-profit-threshold  Enable the dynamic ordinary-profit threshold (default: true)',
    '  --no-dynamic-profit-threshold  Disable the dynamic ordinary-profit threshold',
    '  --profit-threshold-coins-per-10-stamina <n>  Reward coins per 10 stamina. Default: 1',
    '  --profit-threshold-hourly-stamina-limit <n>  Theoretical stamina burn per hour. Default: 3000',
    '  --profit-threshold-reset-reserve-ms <ms>  UTC+8 reset reserve. Default: 14400000',
    '  --self-test              Run runner skeleton self-test'
  ].join('\n');
}

module.exports = {
  CANARY_PROFILES,
  DEFAULTS,
  applyCanaryProfile,
  parseBrowserlessRunnerArgs,
  usage
};
