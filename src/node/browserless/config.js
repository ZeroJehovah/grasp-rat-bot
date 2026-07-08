'use strict';

const path = require('path');

const DEFAULTS = {
  gameOrigin: 'https://grasp-rat-game.h-e.top',
  wsPath: '/ws',
  wsExtraQuery: 'compress=gzip%2Cdeflate',
  dataDir: path.join(process.cwd(), 'data', 'browserless-runner'),
  statusHost: '127.0.0.1',
  statusPort: 18767,
  webToken: '',
  readOnly: true,
  dryRun: true,
  once: false,
  logRetentionDays: 3,
  wsConnectTimeoutMs: 10000
};

function boolEnv(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return /^(?:1|true|yes|on)$/i.test(String(value).trim());
}

function numberEnv(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function parseBrowserlessRunnerArgs(argv = [], env = process.env) {
  const config = {
    ...DEFAULTS,
    gameOrigin: env.GRASP_RAT_BROWSERLESS_GAME_ORIGIN || DEFAULTS.gameOrigin,
    wsPath: env.GRASP_RAT_BROWSERLESS_WS_PATH || DEFAULTS.wsPath,
    wsExtraQuery: env.GRASP_RAT_BROWSERLESS_WS_EXTRA_QUERY || DEFAULTS.wsExtraQuery,
    dataDir: env.GRASP_RAT_BROWSERLESS_DATA_DIR || DEFAULTS.dataDir,
    statusHost: env.GRASP_RAT_BROWSERLESS_STATUS_HOST || DEFAULTS.statusHost,
    statusPort: numberEnv(env.GRASP_RAT_BROWSERLESS_STATUS_PORT, DEFAULTS.statusPort),
    webToken: env.GRASP_RAT_BROWSERLESS_WEB_TOKEN || DEFAULTS.webToken,
    readOnly: boolEnv(env.GRASP_RAT_BROWSERLESS_READ_ONLY, DEFAULTS.readOnly),
    dryRun: boolEnv(env.GRASP_RAT_BROWSERLESS_DRY_RUN, DEFAULTS.dryRun),
    once: boolEnv(env.GRASP_RAT_BROWSERLESS_ONCE, DEFAULTS.once),
    logRetentionDays: numberEnv(env.GRASP_RAT_BROWSERLESS_LOG_RETENTION_DAYS, DEFAULTS.logRetentionDays),
    wsConnectTimeoutMs: numberEnv(env.GRASP_RAT_BROWSERLESS_WS_CONNECT_TIMEOUT_MS, DEFAULTS.wsConnectTimeoutMs),
    userId: numberEnv(env.GRASP_RAT_BROWSERLESS_USER_ID, 0),
    sessionToken: env.GRASP_RAT_BROWSERLESS_SESSION_TOKEN || '',
    selfTest: false,
    help: false
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--read-only') {
      config.readOnly = true;
    } else if (arg === '--dry-run') {
      config.dryRun = true;
    } else if (arg === '--live') {
      config.dryRun = false;
    } else if (arg === '--once') {
      config.once = true;
    } else if (arg === '--data-dir') {
      config.dataDir = argv[++i] || config.dataDir;
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
    } else if (arg === '--self-test') {
      config.selfTest = true;
    } else if (arg === '--help' || arg === '-h') {
      config.help = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  config.dataDir = path.resolve(config.dataDir);
  config.logDir = path.join(config.dataDir, 'logs');
  config.stateFile = path.join(config.dataDir, 'state.json');
  return config;
}

function usage() {
  return [
    'Usage: node scripts/browserless-runner.js [options]',
    '',
    'Options:',
    '  --read-only              Start in read-only mode (default)',
    '  --dry-run                Do not connect to live game transport (default)',
    '  --live                   Disable dry-run; live read-only is gated until canary support is added',
    '  --once                   Run one bounded skeleton cycle and exit',
    '  --data-dir <dir>         State/log root. Default: data/browserless-runner',
    '  --status-host <host>     Status host placeholder. Default: 127.0.0.1',
    '  --status-port <port>     Status port placeholder. Default: 18767',
    '  --web-token <token>      Required later when status server is enabled',
    '  --user-id <id>           Manual session user id, usually loaded from state later',
    '  --session-token <token>  Manual session token, usually loaded from state later',
    '  --self-test              Run runner skeleton self-test'
  ].join('\n');
}

module.exports = {
  DEFAULTS,
  parseBrowserlessRunnerArgs,
  usage
};
