'use strict';

const path = require('path');
const {
  DEFAULT_LOCAL_TARGET_WHITELIST_FILE,
  DEFAULT_TARGET_WHITELIST_URL
} = require('./target-whitelist');

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
  leaveRetryMax: 3,
  leaveRetryMs: 200,
  leaveHedgeMs: 1000,
  leaveDangerHedgeMs: 350,
  leavePrewarmIntervalMs: 3000,
  httpTimeoutMs: 10000,
  decisionIntervalMs: 1000,
  loopDelayMs: 30000,
  dailyFirstLoginDelayMs: 120000,
  loginPointSafetySuccessRequired: 1,
  loginPointSafetyProbeIntervalMs: 30000,
  loginPointSingleBlockerBypassMs: 3600000,
  snapshotEdgeEnabled: true,
  snapshotEdgeIntervalMs: 10000,
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
  combatRobustDodgeEnabled: true,
  combatCloseBandReserveEnabled: true,
  combatMovementStabilityEnabled: false,
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
  combatMissCloseTriggerShots: 10,
  combatMissCloseStepShots: 10,
  combatMissCloseStepCm: 1000,
  combatMissCloseMinimumDistanceCm: 1000,
  combatMissCloseTimeoutMs: 30000,
  combatMissCloseGenerationMaxMs: 90000,
  combatMissCloseGenerationMaxSteps: 4,
  combatResponsePolicyShadowConfirmTicks: 6,
  combatResponsePolicyShadowMinimumHoldMs: 500,
  combatTrajectoryCoverageMode: 'live-single',
  wsTraceEnabled: false,
  wsTracePayload: true,
  wsTraceMaxPayloadChars: 0,
  sourceIp: '',
  sourceIps: [],
  loginPointX: null,
  loginPointY: null,
  loginPointHp: null,
  dynamicProfitThresholdEnabled: true,
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
    leaveRetryMax: numberEnv(env.GRASP_RAT_BROWSERLESS_LEAVE_RETRY_MAX, DEFAULTS.leaveRetryMax),
    leaveRetryMs: numberEnv(env.GRASP_RAT_BROWSERLESS_LEAVE_RETRY_MS, DEFAULTS.leaveRetryMs),
    leaveHedgeMs: numberEnv(env.GRASP_RAT_BROWSERLESS_LEAVE_HEDGE_MS, DEFAULTS.leaveHedgeMs),
    leaveDangerHedgeMs: numberEnv(env.GRASP_RAT_BROWSERLESS_LEAVE_DANGER_HEDGE_MS, DEFAULTS.leaveDangerHedgeMs),
    leavePrewarmIntervalMs: numberEnv(env.GRASP_RAT_BROWSERLESS_LEAVE_PREWARM_INTERVAL_MS, DEFAULTS.leavePrewarmIntervalMs),
    httpTimeoutMs: numberEnv(env.GRASP_RAT_BROWSERLESS_HTTP_TIMEOUT_MS, DEFAULTS.httpTimeoutMs),
    decisionIntervalMs: numberEnv(env.GRASP_RAT_BROWSERLESS_DECISION_INTERVAL_MS, DEFAULTS.decisionIntervalMs),
    loopDelayMs: numberEnv(env.GRASP_RAT_BROWSERLESS_LOOP_DELAY_MS, DEFAULTS.loopDelayMs),
    dailyFirstLoginDelayMs: numberEnv(env.GRASP_RAT_BROWSERLESS_DAILY_FIRST_LOGIN_DELAY_MS, DEFAULTS.dailyFirstLoginDelayMs),
    loginPointSafetySuccessRequired: numberEnv(env.GRASP_RAT_BROWSERLESS_LOGIN_POINT_SAFETY_SUCCESS_REQUIRED, DEFAULTS.loginPointSafetySuccessRequired),
    loginPointSafetyProbeIntervalMs: numberEnv(env.GRASP_RAT_BROWSERLESS_LOGIN_POINT_SAFETY_PROBE_INTERVAL_MS, DEFAULTS.loginPointSafetyProbeIntervalMs),
    loginPointSingleBlockerBypassMs: numberEnv(env.GRASP_RAT_BROWSERLESS_LOGIN_POINT_SINGLE_BLOCKER_BYPASS_MS, DEFAULTS.loginPointSingleBlockerBypassMs),
    snapshotEdgeEnabled: boolEnv(env.GRASP_RAT_BROWSERLESS_SNAPSHOT_EDGE_ENABLED, DEFAULTS.snapshotEdgeEnabled),
    snapshotEdgeIntervalMs: numberEnv(env.GRASP_RAT_BROWSERLESS_SNAPSHOT_EDGE_INTERVAL_MS, DEFAULTS.snapshotEdgeIntervalMs),
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
    combatRobustDodgeEnabled: boolEnv(env.GRASP_RAT_BROWSERLESS_COMBAT_ROBUST_DODGE_ENABLED, DEFAULTS.combatRobustDodgeEnabled),
    combatCloseBandReserveEnabled: boolEnv(env.GRASP_RAT_BROWSERLESS_COMBAT_CLOSE_BAND_RESERVE_ENABLED, DEFAULTS.combatCloseBandReserveEnabled),
    combatMovementStabilityEnabled: boolEnv(env.GRASP_RAT_BROWSERLESS_COMBAT_MOVEMENT_STABILITY_ENABLED, DEFAULTS.combatMovementStabilityEnabled),
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
    combatMissCloseTriggerShots: numberEnv(env.GRASP_RAT_BROWSERLESS_COMBAT_MISS_CLOSE_TRIGGER_SHOTS, DEFAULTS.combatMissCloseTriggerShots),
    combatMissCloseStepShots: numberEnv(env.GRASP_RAT_BROWSERLESS_COMBAT_MISS_CLOSE_STEP_SHOTS, DEFAULTS.combatMissCloseStepShots),
    combatMissCloseStepCm: numberEnv(env.GRASP_RAT_BROWSERLESS_COMBAT_MISS_CLOSE_STEP_CM, DEFAULTS.combatMissCloseStepCm),
    combatMissCloseMinimumDistanceCm: numberEnv(env.GRASP_RAT_BROWSERLESS_COMBAT_MISS_CLOSE_MINIMUM_DISTANCE_CM, DEFAULTS.combatMissCloseMinimumDistanceCm),
    combatMissCloseTimeoutMs: numberEnv(env.GRASP_RAT_BROWSERLESS_COMBAT_MISS_CLOSE_TIMEOUT_MS, DEFAULTS.combatMissCloseTimeoutMs),
    combatMissCloseGenerationMaxMs: numberEnv(env.GRASP_RAT_BROWSERLESS_COMBAT_MISS_CLOSE_GENERATION_MAX_MS, DEFAULTS.combatMissCloseGenerationMaxMs),
    combatMissCloseGenerationMaxSteps: numberEnv(env.GRASP_RAT_BROWSERLESS_COMBAT_MISS_CLOSE_GENERATION_MAX_STEPS, DEFAULTS.combatMissCloseGenerationMaxSteps),
    combatResponsePolicyShadowConfirmTicks: numberEnv(env.GRASP_RAT_BROWSERLESS_COMBAT_RESPONSE_POLICY_SHADOW_CONFIRM_TICKS, DEFAULTS.combatResponsePolicyShadowConfirmTicks),
    combatResponsePolicyShadowMinimumHoldMs: numberEnv(env.GRASP_RAT_BROWSERLESS_COMBAT_RESPONSE_POLICY_SHADOW_MINIMUM_HOLD_MS, DEFAULTS.combatResponsePolicyShadowMinimumHoldMs),
    combatTrajectoryCoverageMode: trajectoryCoverageMode(
      env.GRASP_RAT_BROWSERLESS_COMBAT_TRAJECTORY_COVERAGE_MODE,
      DEFAULTS.combatTrajectoryCoverageMode
    ),
    wsTraceEnabled: boolEnv(env.GRASP_RAT_BROWSERLESS_WS_TRACE_ENABLED ?? env.GRASP_RAT_BROWSERLESS_WS_TRACE, DEFAULTS.wsTraceEnabled),
    wsTracePayload: boolEnv(env.GRASP_RAT_BROWSERLESS_WS_TRACE_PAYLOAD, DEFAULTS.wsTracePayload),
    wsTraceMaxPayloadChars: numberEnv(env.GRASP_RAT_BROWSERLESS_WS_TRACE_MAX_PAYLOAD_CHARS, DEFAULTS.wsTraceMaxPayloadChars),
    sourceIp: env.GRASP_RAT_BROWSERLESS_SOURCE_IP || DEFAULTS.sourceIp,
    sourceIps: listEnv(env.GRASP_RAT_BROWSERLESS_SOURCE_IPS, DEFAULTS.sourceIps),
    userId: numberEnv(env.GRASP_RAT_BROWSERLESS_USER_ID, 0),
    sessionToken: env.GRASP_RAT_BROWSERLESS_SESSION_TOKEN || '',
    loginPointX: numberEnv(env.GRASP_RAT_BROWSERLESS_LOGIN_POINT_X, DEFAULTS.loginPointX),
    loginPointY: numberEnv(env.GRASP_RAT_BROWSERLESS_LOGIN_POINT_Y, DEFAULTS.loginPointY),
    loginPointHp: numberEnv(env.GRASP_RAT_BROWSERLESS_LOGIN_POINT_HP, DEFAULTS.loginPointHp),
    dynamicProfitThresholdEnabled: boolEnv(env.GRASP_RAT_BROWSERLESS_DYNAMIC_PROFIT_THRESHOLD_ENABLED, DEFAULTS.dynamicProfitThresholdEnabled),
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
      config.snapshotEdgeIntervalMs = numberEnv(argv[++i], config.snapshotEdgeIntervalMs);
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
    } else if (arg === '--no-combat-close-band-reserve') {
      config.combatCloseBandReserveEnabled = false;
    } else if (arg === '--combat-movement-stability') {
      config.combatMovementStabilityEnabled = true;
    } else if (arg === '--no-combat-movement-stability') {
      config.combatMovementStabilityEnabled = false;
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
    } else if (arg === '--combat-miss-close-trigger-shots') {
      config.combatMissCloseTriggerShots = numberEnv(argv[++i], config.combatMissCloseTriggerShots);
    } else if (arg === '--combat-miss-close-step-shots') {
      config.combatMissCloseStepShots = numberEnv(argv[++i], config.combatMissCloseStepShots);
    } else if (arg === '--combat-miss-close-step-cm') {
      config.combatMissCloseStepCm = numberEnv(argv[++i], config.combatMissCloseStepCm);
    } else if (arg === '--combat-miss-close-minimum-distance-cm') {
      config.combatMissCloseMinimumDistanceCm = numberEnv(argv[++i], config.combatMissCloseMinimumDistanceCm);
    } else if (arg === '--combat-miss-close-timeout-ms') {
      config.combatMissCloseTimeoutMs = numberEnv(argv[++i], config.combatMissCloseTimeoutMs);
    } else if (arg === '--combat-miss-close-generation-max-ms') {
      config.combatMissCloseGenerationMaxMs = numberEnv(argv[++i], config.combatMissCloseGenerationMaxMs);
    } else if (arg === '--combat-miss-close-generation-max-steps') {
      config.combatMissCloseGenerationMaxSteps = numberEnv(argv[++i], config.combatMissCloseGenerationMaxSteps);
    } else if (arg === '--combat-response-policy-shadow-confirm-ticks') {
      config.combatResponsePolicyShadowConfirmTicks = numberEnv(argv[++i], config.combatResponsePolicyShadowConfirmTicks);
    } else if (arg === '--combat-response-policy-shadow-minimum-hold-ms') {
      config.combatResponsePolicyShadowMinimumHoldMs = numberEnv(argv[++i], config.combatResponsePolicyShadowMinimumHoldMs);
    } else if (arg === '--combat-trajectory-coverage-mode') {
      config.combatTrajectoryCoverageMode = trajectoryCoverageMode(argv[++i], config.combatTrajectoryCoverageMode);
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
    '  --snapshot-path <path>    Snapshot path for pre-login safety. Default: /snapshot',
    '  --target-whitelist-url <url>   Browserless target whitelist URL. Default: project dist/target-whitelist.json',
    '  --target-whitelist-file <file> Local whitelist fallback. Default: ./dist/target-whitelist.json',
    '  --decision-interval-ms <ms>  Dry-run decision log/status interval. Default: 1000',
    '  --loop-delay-ms <ms>    Delay before the next non-once live cycle after recoverable exit. Default: 30000',
    '  --daily-first-login-delay-ms <ms>  Earliest UTC+8 daily first login after midnight. Default: 120000',
    '  --login-point-safety-success-required <n>  Legacy consecutive checks when snapshot edge mode is disabled. Default: 1',
    '  --login-point-safety-probe-interval-ms <ms>  Delay between those checks. Default: 30000',
    '  --[no-]snapshot-edge-enabled  Wait for a post-baseline snapshot version and evaluate it once. Default: enabled',
    '  --snapshot-edge-interval-ms <ms>  Snapshot version probe interval. Default: 10000',
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
    '  --center-activity-radius-cm <cm>  Keep ordinary browserless profit inside this origin radius. Default: 100000',
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
    '  --combat-miss-close-trigger-shots <n>  Accepted no-damage shots before the first 10m close step. Default: 10',
    '  --combat-miss-close-step-shots <n>  Accepted no-damage shots at one reached goal before the next step. Default: 10',
    '  --combat-miss-close-step-cm <cm>  Distance removed by each progressive close step. Default: 1000',
    '  --combat-miss-close-minimum-distance-cm <cm>  Lowest progressive close goal. Default: 1000',
    '  --combat-miss-close-timeout-ms <ms>  Leave when one close step cannot be reached. Default: 30000',
    '  --combat-miss-close-generation-max-ms <ms>  Global no-damage close-pressure limit. Default: 90000',
    '  --combat-miss-close-generation-max-steps <n>  Maximum completed no-damage close steps. Default: 4',
    '  --combat-response-policy-shadow-confirm-ticks <n>  Candidate confirmations for shadow policy latch. Default: 6',
    '  --combat-response-policy-shadow-minimum-hold-ms <ms>  Minimum shadow policy hold. Default: 500',
    '  --combat-trajectory-coverage-mode <mode>  Multi-trajectory aim mode: off|shadow|live-single|live-volley. Default: live-single',
    '  --no-combat-robust-dodge  Disable robust Dodge schedule/trajectory uncertainty for rollback',
    '  --no-combat-close-band-reserve  Disable the two-shot close-band reserve for rollback',
    '  --ws-trace              Write decoded WebSocket frame/command trace to ws.jsonl',
    '  --no-ws-trace           Disable WebSocket trace logging',
    '  --ws-trace-summary-only  Log WebSocket frame summaries without decoded payloads',
    '  --ws-trace-max-payload-chars <n>  Truncate decoded WS payload JSON; 0 means full payload',
    '  --source-ip <ip>        Bind browserless HTTP/WS outbound sockets to this local source IP',
    '  --source-ips <list>     Ordered local source IP list for 403-based hot switching',
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
