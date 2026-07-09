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
  logRetentionDays: 3,
  wsConnectTimeoutMs: 10000,
  readOnlyProbeMs: 30000,
  frameGapAlertMs: 5000,
  leaveRetryMax: 3,
  leaveRetryMs: 1200,
  httpTimeoutMs: 10000,
  decisionIntervalMs: 1000,
  loopDelayMs: 30000,
  staleSelfMs: 3000,
  noSelfGraceMs: 3000,
  staminaExhaustedBelowMs: 200,
  movementCommandIntervalMs: 500,
  movementTargetDeadZoneCm: 900,
  movementSettlementFrames: 2,
  combatEnabled: false,
  combatShootMinIntervalMs: 160,
  wsTraceEnabled: false,
  wsTracePayload: true,
  wsTraceMaxPayloadChars: 0,
  sourceIp: '',
  sourceIps: [],
  loginPointX: null,
  loginPointY: null,
  loginPointHp: null
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
    httpTimeoutMs: numberEnv(env.GRASP_RAT_BROWSERLESS_HTTP_TIMEOUT_MS, DEFAULTS.httpTimeoutMs),
    decisionIntervalMs: numberEnv(env.GRASP_RAT_BROWSERLESS_DECISION_INTERVAL_MS, DEFAULTS.decisionIntervalMs),
    loopDelayMs: numberEnv(env.GRASP_RAT_BROWSERLESS_LOOP_DELAY_MS, DEFAULTS.loopDelayMs),
    staleSelfMs: numberEnv(env.GRASP_RAT_BROWSERLESS_STALE_SELF_MS, DEFAULTS.staleSelfMs),
    noSelfGraceMs: numberEnv(env.GRASP_RAT_BROWSERLESS_NO_SELF_GRACE_MS, DEFAULTS.noSelfGraceMs),
    staminaExhaustedBelowMs: numberEnv(env.GRASP_RAT_BROWSERLESS_STAMINA_EXHAUSTED_BELOW_MS, DEFAULTS.staminaExhaustedBelowMs),
    movementCommandIntervalMs: numberEnv(env.GRASP_RAT_BROWSERLESS_MOVEMENT_COMMAND_INTERVAL_MS, DEFAULTS.movementCommandIntervalMs),
    movementTargetDeadZoneCm: numberEnv(env.GRASP_RAT_BROWSERLESS_MOVEMENT_TARGET_DEAD_ZONE_CM, DEFAULTS.movementTargetDeadZoneCm),
    movementSettlementFrames: numberEnv(env.GRASP_RAT_BROWSERLESS_MOVEMENT_SETTLEMENT_FRAMES, DEFAULTS.movementSettlementFrames),
    combatEnabled: boolEnv(env.GRASP_RAT_BROWSERLESS_COMBAT_ENABLED, DEFAULTS.combatEnabled),
    combatShootMinIntervalMs: numberEnv(env.GRASP_RAT_BROWSERLESS_COMBAT_SHOOT_MIN_INTERVAL_MS, DEFAULTS.combatShootMinIntervalMs),
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
    } else if (arg === '--stale-self-ms') {
      config.staleSelfMs = numberEnv(argv[++i], config.staleSelfMs);
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
    } else if (arg === '--combat-shoot-min-interval-ms') {
      config.combatShootMinIntervalMs = numberEnv(argv[++i], config.combatShootMinIntervalMs);
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
    '  --frame-gap-alert-ms <ms>  Read-only canary frame-gap failure threshold. Default: 5000',
    '  --snapshot-path <path>    Snapshot path for pre-login safety. Default: /snapshot',
    '  --target-whitelist-url <url>   Browserless target whitelist URL. Default: project dist/target-whitelist.json',
    '  --target-whitelist-file <file> Local whitelist fallback. Default: ./dist/target-whitelist.json',
    '  --decision-interval-ms <ms>  Dry-run decision log/status interval. Default: 1000',
    '  --loop-delay-ms <ms>    Delay before the next non-once live cycle after recoverable exit. Default: 30000',
    '  --stale-self-ms <ms>      Safety stale-self threshold. Default: 3000',
    '  --no-self-grace-ms <ms>   Safety no-self grace window. Default: 3000',
    '  --stamina-exhausted-below-ms <ms>  Safety stamina floor. Default: 200',
    '  --movement-command-interval-ms <ms>  Movement velocity throttle. Default: 500',
    '  --movement-target-dead-zone-cm <cm>  Movement target stop radius. Default: 900',
    '  --movement-settlement-frames <n>  Realtime frames needed after command. Default: 2',
    '  --combat-shoot-min-interval-ms <ms>  Minimum live combat shoot interval. Default: 160',
    '  --ws-trace              Write decoded WebSocket frame/command trace to ws.jsonl',
    '  --no-ws-trace           Disable WebSocket trace logging',
    '  --ws-trace-summary-only  Log WebSocket frame summaries without decoded payloads',
    '  --ws-trace-max-payload-chars <n>  Truncate decoded WS payload JSON; 0 means full payload',
    '  --source-ip <ip>        Bind browserless HTTP/WS outbound sockets to this local source IP',
    '  --source-ips <list>     Ordered local source IP list for 403-based hot switching',
    '  --login-point-x <cm>      Manual login point x for canary safety',
    '  --login-point-y <cm>      Manual login point y for canary safety',
    '  --login-point-hp <hp>     Manual login point HP context for canary safety',
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
