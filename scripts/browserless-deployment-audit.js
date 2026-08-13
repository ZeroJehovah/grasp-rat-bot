#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  loginPointFromAnyState,
  readBrowserlessStateFile,
  sessionFromAnyState
} = require('../src/node/browserless/state-file');
const { DEFAULTS: BROWSERLESS_CONFIG_DEFAULTS } = require('../src/node/browserless/config');
const { verifyRelease } = require('./verify-browserless-release');

const DEFAULT_SERVICE_NAME = 'grasp-rat-browserless-runner';
const DEFAULT_UNIT_PATH = `/etc/systemd/system/${DEFAULT_SERVICE_NAME}.service`;
const DEFAULT_ENV_PATH = '/etc/grasp-rat/browserless-runner.env';
const DEFAULT_DATA_DIR = '/var/lib/grasp-rat-browserless';
const DEFAULT_LOG_DIR = '/var/log/grasp-rat-browserless';
const DEFAULT_RELEASE_ROOT = '/opt/grasp-rat-browserless';
const DEFAULT_SOURCE_DIR = '/home/ubuntu/grasp-rat-bot/src';
const VALID_ENV_MODES = new Set(['safe', 'live', 'any']);
const VALID_CONTROL_MODES = new Set(['read-only', 'movement-only', 'non-combat-profit', 'profit-live', 'combat-dry-run', 'combat-live']);
const VALID_CANARY_PROFILES = new Set(['read-only', 'movement-only', 'profit', 'combat-dry-run', 'combat-live']);
const CANARY_PROFILE_CONTROL_MODES = {
  'read-only': 'read-only',
  'movement-only': 'movement-only',
  profit: 'non-combat-profit',
  'combat-dry-run': 'combat-dry-run',
  'combat-live': 'combat-live'
};

function parseArgs(argv) {
  const out = {
    serviceName: DEFAULT_SERVICE_NAME,
    unitPath: DEFAULT_UNIT_PATH,
    envPath: DEFAULT_ENV_PATH,
    dataDir: '',
    logDir: '',
    releaseRoot: DEFAULT_RELEASE_ROOT,
    sourceDir: DEFAULT_SOURCE_DIR,
    expectedRevision: '',
    envMode: 'safe',
    skipSystemctl: false,
    json: false,
    failOnIncomplete: false,
    help: false
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--service-name') out.serviceName = argv[++i] || out.serviceName;
    else if (arg === '--unit') out.unitPath = argv[++i] || out.unitPath;
    else if (arg === '--env') out.envPath = argv[++i] || out.envPath;
    else if (arg === '--data-dir') out.dataDir = argv[++i] || out.dataDir;
    else if (arg === '--log-dir') out.logDir = argv[++i] || out.logDir;
    else if (arg === '--release-root') out.releaseRoot = argv[++i] || out.releaseRoot;
    else if (arg === '--source-dir') out.sourceDir = argv[++i] || out.sourceDir;
    else if (arg === '--expected-revision') out.expectedRevision = argv[++i] || '';
    else if (arg === '--env-mode') out.envMode = argv[++i] || out.envMode;
    else if (arg === '--skip-systemctl') out.skipSystemctl = true;
    else if (arg === '--json') out.json = true;
    else if (arg === '--fail-on-incomplete') out.failOnIncomplete = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return out;
}

function readText(file) {
  try {
    return { ok: true, text: fs.readFileSync(file, 'utf8'), error: '' };
  } catch (error) {
    return { ok: false, text: '', error: error?.message || String(error) };
  }
}

function unitValues(unitText, key) {
  const escaped = String(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return Array.from(String(unitText || '').matchAll(new RegExp(`^${escaped}=(.*)$`, 'gm')), match => match[1].trim());
}

function unitValue(unitText, key) {
  return unitValues(unitText, key)[0] || '';
}

function normalizeEnvironmentFile(value) {
  return String(value || '').replace(/^-/, '').trim();
}

function parseEnvText(text) {
  const env = {};
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index <= 0) continue;
    env[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
  return env;
}

function parseNullEnv(buffer) {
  return parseEnvText(Buffer.from(buffer || '').toString('utf8').replace(/\0/g, '\n'));
}

function parseSystemctlShow(text) {
  const values = {};
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const index = rawLine.indexOf('=');
    if (index <= 0) continue;
    values[rawLine.slice(0, index)] = rawLine.slice(index + 1).trim();
  }
  return values;
}

function commandRunner(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: options.timeoutMs || 5000
  });
  return {
    status: Number(result.status ?? (result.error ? 1 : 0)),
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error ? (result.error.message || String(result.error)) : ''
  };
}

function addCheck(checks, key, ok, evidence, detail = {}) {
  checks.push({ key, ok: Boolean(ok), evidence, detail });
}

function accessOk(dir) {
  try {
    const stat = fs.statSync(dir);
    if (!stat.isDirectory()) return { ok: false, reason: 'not-directory' };
    fs.accessSync(dir, fs.constants.R_OK | fs.constants.W_OK);
    return { ok: true, reason: '' };
  } catch (error) {
    return { ok: false, reason: error?.message || String(error) };
  }
}

function directoryOk(dir) {
  try {
    return fs.statSync(dir).isDirectory();
  } catch (_) {
    return false;
  }
}

function symlinkOk(file) {
  try {
    return fs.lstatSync(file).isSymbolicLink();
  } catch (_) {
    return false;
  }
}

function isEnvBool(value) {
  return /^(?:true|false)$/i.test(String(value || '').trim());
}

function isPositiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0;
}

function isNumber(value) {
  const text = String(value ?? '').trim();
  return text !== '' && Number.isFinite(Number(text));
}

function addEnvChecks(checks, env, envMode, persistedState = {}) {
  const profile = env.GRASP_RAT_BROWSERLESS_CANARY_PROFILE || '';
  const control = env.GRASP_RAT_BROWSERLESS_CONTROL_MODE || '';
  const dryRun = env.GRASP_RAT_BROWSERLESS_DRY_RUN || '';
  const sourceIpInterface = env.GRASP_RAT_BROWSERLESS_SOURCE_IP_INTERFACE || 'enp0s6';
  const legacySourceIpPool = env.GRASP_RAT_BROWSERLESS_SOURCE_IPS || '';
  const configuredDailyFirstLoginDelayMs = String(env.GRASP_RAT_BROWSERLESS_DAILY_FIRST_LOGIN_DELAY_MS || '').trim();
  const expectedDailyFirstLoginDelayMs = Number(BROWSERLESS_CONFIG_DEFAULTS.dailyFirstLoginDelayMs);
  const stateSession = sessionFromAnyState(persistedState);
  const stateLoginPoint = loginPointFromAnyState(persistedState);
  const profilePresent = Boolean(profile);
  const controlPresent = Boolean(control);
  const profileOk = !profile || VALID_CANARY_PROFILES.has(profile);
  const controlOk = !control || VALID_CONTROL_MODES.has(control);
  const expectedControl = profileOk && profile ? CANARY_PROFILE_CONTROL_MODES[profile] : '';
  const profileControlConsistent = !profilePresent || !controlPresent || expectedControl === control;
  const modeOk = profileOk && controlOk && profileControlConsistent && (profilePresent || controlPresent);

  addCheck(checks, 'env-mode', VALID_ENV_MODES.has(envMode), `envMode=${envMode}`);
  if (!VALID_ENV_MODES.has(envMode)) return;
  addCheck(checks, 'env-source-ip-interface', sourceIpInterface === 'enp0s6', `GRASP_RAT_BROWSERLESS_SOURCE_IP_INTERFACE=${sourceIpInterface}`);
  addCheck(checks, 'env-source-ip-static-pool-removed', !legacySourceIpPool, `GRASP_RAT_BROWSERLESS_SOURCE_IPS=${legacySourceIpPool ? '[legacy pool still configured]' : 'absent'}`);
  addCheck(
    checks,
    'env-daily-first-login-delay',
    !configuredDailyFirstLoginDelayMs
      || (isNumber(configuredDailyFirstLoginDelayMs) && Number(configuredDailyFirstLoginDelayMs) === expectedDailyFirstLoginDelayMs),
    `GRASP_RAT_BROWSERLESS_DAILY_FIRST_LOGIN_DELAY_MS=${configuredDailyFirstLoginDelayMs || `[default ${expectedDailyFirstLoginDelayMs}]`}, expected=${expectedDailyFirstLoginDelayMs}`
  );

  if (envMode === 'safe') {
    addCheck(checks, 'env-safe-dry-run', dryRun === 'true', `GRASP_RAT_BROWSERLESS_DRY_RUN=${dryRun || 'missing'}`);
    addCheck(checks, 'env-read-only-profile', profile === 'read-only' || control === 'read-only', `profile=${profile}, control=${control}`);
    addCheck(checks, 'env-profile-control-consistency', profileControlConsistent, `profile=${profile || 'missing'}, control=${control || 'missing'}, expectedControl=${expectedControl || 'missing'}`);
    return;
  }

  if (envMode === 'live') {
    const userId = Number(env.GRASP_RAT_BROWSERLESS_USER_ID || 0) || stateSession.userId;
    const sessionTokenPresent = Boolean(env.GRASP_RAT_BROWSERLESS_SESSION_TOKEN || stateSession.sessionToken);
    const loginPointX = isNumber(env.GRASP_RAT_BROWSERLESS_LOGIN_POINT_X) ? Number(env.GRASP_RAT_BROWSERLESS_LOGIN_POINT_X) : stateLoginPoint?.x;
    const loginPointY = isNumber(env.GRASP_RAT_BROWSERLESS_LOGIN_POINT_Y) ? Number(env.GRASP_RAT_BROWSERLESS_LOGIN_POINT_Y) : stateLoginPoint?.y;
    const loginPointHp = isNumber(env.GRASP_RAT_BROWSERLESS_LOGIN_POINT_HP) ? Number(env.GRASP_RAT_BROWSERLESS_LOGIN_POINT_HP) : stateLoginPoint?.hp;
    addCheck(checks, 'env-live-dry-run', dryRun === 'false', `GRASP_RAT_BROWSERLESS_DRY_RUN=${dryRun || 'missing'}`);
    addCheck(checks, 'env-live-profile', modeOk, `profile=${profile}, control=${control}`);
    addCheck(checks, 'env-profile-control-consistency', profileControlConsistent, `profile=${profile || 'missing'}, control=${control || 'missing'}, expectedControl=${expectedControl || 'missing'}`);
    addCheck(checks, 'env-live-session', isPositiveNumber(userId) && sessionTokenPresent, `userId=${userId || 'missing'}, sessionTokenPresent=${sessionTokenPresent}, source=${env.GRASP_RAT_BROWSERLESS_SESSION_TOKEN ? 'env' : (stateSession.sessionToken ? 'state' : 'missing')}`);
    addCheck(checks, 'env-login-point', isNumber(loginPointX) && isNumber(loginPointY) && isNumber(loginPointHp), `x=${loginPointX ?? 'missing'}, y=${loginPointY ?? 'missing'}, hp=${loginPointHp ?? 'missing'}, source=${stateLoginPoint ? 'state' : 'env'}`);
    return;
  }

  addCheck(checks, 'env-dry-run-value', isEnvBool(dryRun), `GRASP_RAT_BROWSERLESS_DRY_RUN=${dryRun || 'missing'}`);
  addCheck(checks, 'env-control-profile', modeOk, `profile=${profile}, control=${control}`);
  addCheck(checks, 'env-profile-control-consistency', profileControlConsistent, `profile=${profile || 'missing'}, control=${control || 'missing'}, expectedControl=${expectedControl || 'missing'}`);
}

function resolveCurrentRelease(releaseRoot) {
  const currentLink = path.join(releaseRoot, 'current');
  if (!symlinkOk(currentLink)) return { ok: false, currentLink, currentReleaseDir: '', error: 'current is not a symlink' };
  try {
    const currentReleaseDir = fs.realpathSync(currentLink);
    const releasesDir = path.join(releaseRoot, 'releases');
    const directChild = path.dirname(currentReleaseDir) === releasesDir;
    return {
      ok: directChild && directoryOk(currentReleaseDir),
      currentLink,
      currentReleaseDir,
      error: directChild ? (directoryOk(currentReleaseDir) ? '' : 'current release is not a directory') : 'current target is outside releases'
    };
  } catch (error) {
    return { ok: false, currentLink, currentReleaseDir: '', error: error?.message || String(error) };
  }
}

function auditDeployment(options = {}, deps = {}) {
  const serviceName = options.serviceName || DEFAULT_SERVICE_NAME;
  const unitPath = path.resolve(String(options.unitPath || DEFAULT_UNIT_PATH));
  const envPath = path.resolve(String(options.envPath || DEFAULT_ENV_PATH));
  const releaseRoot = path.resolve(String(options.releaseRoot || DEFAULT_RELEASE_ROOT));
  const sourceDir = path.resolve(String(options.sourceDir || DEFAULT_SOURCE_DIR));
  const expectedRevision = String(options.expectedRevision || '').trim().toLowerCase();
  const envMode = String(options.envMode || 'safe').trim() || 'safe';
  const runCommand = deps.runCommand || commandRunner;
  const networkInterfaces = typeof deps.networkInterfaces === 'function' ? deps.networkInterfaces : os.networkInterfaces;
  const releaseVerifier = deps.verifyRelease || verifyRelease;
  const readProcFile = deps.readProcFile || (file => fs.readFileSync(file));
  const checks = [];

  const unit = readText(unitPath);
  addCheck(checks, 'unit-file', unit.ok, unit.ok ? unitPath : unit.error);
  const envFile = readText(envPath);
  addCheck(checks, 'env-file', envFile.ok, envFile.ok ? envPath : envFile.error);

  const current = resolveCurrentRelease(releaseRoot);
  addCheck(checks, 'release-current-symlink', current.ok, current.ok ? `${current.currentLink} -> ${current.currentReleaseDir}` : `${current.currentLink}: ${current.error}`);
  let releaseReport = null;
  if (current.ok) {
    try {
      releaseReport = releaseVerifier(current.currentReleaseDir, {
        requireReadOnly: true,
        requireRootOwned: true,
        requireDirectoryId: true,
        requireRuntimeCompatible: true
      });
      addCheck(checks, 'release-integrity', Boolean(releaseReport?.ok), releaseReport?.ok ? `${releaseReport.releaseId}, digest=${releaseReport.artifactDigest}` : 'release verifier returned an incomplete result');
    } catch (error) {
      addCheck(checks, 'release-integrity', false, error?.message || String(error));
    }
  } else {
    addCheck(checks, 'release-integrity', false, 'not checked because current release is unresolved');
  }

  const manifestFile = current.currentReleaseDir ? path.join(current.currentReleaseDir, 'release-manifest.json') : '';
  const manifestRead = manifestFile ? readText(manifestFile) : { ok: false, text: '', error: 'release unresolved' };
  let manifest = {};
  try {
    manifest = manifestRead.ok ? JSON.parse(manifestRead.text) : {};
  } catch (error) {
    addCheck(checks, 'release-manifest-readable', false, error?.message || String(error));
  }
  if (!checks.some(check => check.key === 'release-manifest-readable')) {
    addCheck(checks, 'release-manifest-readable', manifestRead.ok && Boolean(manifest.releaseId), manifestRead.ok ? `releaseId=${manifest.releaseId || 'missing'}` : manifestRead.error);
  }
  addCheck(
    checks,
    'release-expected-revision',
    !expectedRevision || manifest.sourceRevision === expectedRevision || manifest.runtimeRevision === expectedRevision,
    `expected=${expectedRevision || 'not-set'}, source=${manifest.sourceRevision || 'missing'}, runtime=${manifest.runtimeRevision || 'missing'}`
  );

  const releaseEnvPath = current.currentReleaseDir ? path.join(current.currentReleaseDir, 'release.env') : '';
  const releaseEnvRead = releaseEnvPath ? readText(releaseEnvPath) : { ok: false, text: '', error: 'release unresolved' };
  addCheck(checks, 'release-env-file', releaseEnvRead.ok, releaseEnvRead.ok ? releaseEnvPath : releaseEnvRead.error);
  const baseEnv = parseEnvText(envFile.text);
  const releaseEnv = parseEnvText(releaseEnvRead.text);
  const env = { ...baseEnv, ...releaseEnv };
  const dataDir = path.resolve(String(options.dataDir || env.GRASP_RAT_BROWSERLESS_DATA_DIR || DEFAULT_DATA_DIR));
  const logDir = path.resolve(String(options.logDir || env.GRASP_RAT_BROWSERLESS_LOG_DIR || DEFAULT_LOG_DIR));
  addCheck(checks, 'release-env-revision', releaseEnv.GRASP_RAT_BROWSERLESS_REVISION === manifest.runtimeRevision, `release.env=${releaseEnv.GRASP_RAT_BROWSERLESS_REVISION || 'missing'}, manifest=${manifest.runtimeRevision || 'missing'}`);
  addCheck(checks, 'release-env-whitelist-file', releaseEnv.GRASP_RAT_BROWSERLESS_TARGET_WHITELIST_FILE === 'dist/target-whitelist.json', `value=${releaseEnv.GRASP_RAT_BROWSERLESS_TARGET_WHITELIST_FILE || 'missing'}`);
  addCheck(
    checks,
    'release-env-whitelist-url',
    Boolean(manifest.sourceRevision) && releaseEnv.GRASP_RAT_BROWSERLESS_TARGET_WHITELIST_URL === `https://raw.githubusercontent.com/ZeroJehovah/grasp-rat-bot/${manifest.sourceRevision}/dist/target-whitelist.json`,
    `value=${releaseEnv.GRASP_RAT_BROWSERLESS_TARGET_WHITELIST_URL || 'missing'}`
  );

  const workingDirectory = unitValue(unit.text, 'WorkingDirectory');
  const environmentFiles = unitValues(unit.text, 'EnvironmentFile').map(normalizeEnvironmentFile);
  const execStart = unitValue(unit.text, 'ExecStart');
  const readWritePaths = unitValue(unit.text, 'ReadWritePaths');
  const readOnlyPaths = unitValue(unit.text, 'ReadOnlyPaths');
  const inaccessiblePaths = unitValue(unit.text, 'InaccessiblePaths');
  addCheck(checks, 'service-name', serviceName === DEFAULT_SERVICE_NAME, `serviceName=${serviceName}`);
  addCheck(checks, 'source-primary-checkout', directoryOk(path.join(sourceDir, '.git')), `sourceDir=${sourceDir}, .git=${directoryOk(path.join(sourceDir, '.git')) ? 'directory' : 'missing-or-nondirectory'}`);
  addCheck(checks, 'working-directory', path.resolve(workingDirectory || '/') === path.join(releaseRoot, 'current'), `WorkingDirectory=${workingDirectory || 'missing'}, expected=${path.join(releaseRoot, 'current')}`);
  addCheck(checks, 'runner-entrypoint', execStart === '/usr/bin/node browserless-runner.cjs', `ExecStart=${execStart || 'missing'}`);
  addCheck(checks, 'environment-file-reference', environmentFiles.includes(envPath), `EnvironmentFiles=${environmentFiles.join(',') || 'missing'}`);
  addCheck(checks, 'release-environment-file-reference', environmentFiles.includes(path.join(releaseRoot, 'current', 'release.env')), `EnvironmentFiles=${environmentFiles.join(',') || 'missing'}`);
  addCheck(checks, 'service-nice', unitValue(unit.text, 'Nice') === '-10', `Nice=${unitValue(unit.text, 'Nice') || 'missing'}`);
  addCheck(checks, 'restart-policy', unitValue(unit.text, 'Restart') === 'on-failure', `Restart=${unitValue(unit.text, 'Restart') || 'missing'}`);
  addCheck(checks, 'graceful-stop-timeout', unitValue(unit.text, 'TimeoutStopSec') === 'infinity', `TimeoutStopSec=${unitValue(unit.text, 'TimeoutStopSec') || 'missing'}`);
  addCheck(checks, 'release-read-only-path', readOnlyPaths.split(/\s+/).includes(releaseRoot), `ReadOnlyPaths=${readOnlyPaths || 'missing'}`);
  addCheck(checks, 'source-inaccessible-path', inaccessiblePaths.split(/\s+/).includes(sourceDir), `InaccessiblePaths=${inaccessiblePaths || 'missing'}`);
  addCheck(checks, 'read-write-paths', readWritePaths.includes(dataDir) && readWritePaths.includes(logDir), `ReadWritePaths=${readWritePaths || 'missing'}`);

  addCheck(checks, 'env-data-dir', env.GRASP_RAT_BROWSERLESS_DATA_DIR === dataDir, `GRASP_RAT_BROWSERLESS_DATA_DIR=${env.GRASP_RAT_BROWSERLESS_DATA_DIR || 'missing'}`);
  addCheck(checks, 'env-log-dir', env.GRASP_RAT_BROWSERLESS_LOG_DIR === logDir, `GRASP_RAT_BROWSERLESS_LOG_DIR=${env.GRASP_RAT_BROWSERLESS_LOG_DIR || 'missing'}`);
  const persistedState = readBrowserlessStateFile(path.join(dataDir, 'state.json'));
  addEnvChecks(checks, env, envMode, persistedState);
  if (envMode === 'live' || envMode === 'any') {
    const interfaces = networkInterfaces() || {};
    const addresses = Array.isArray(interfaces.enp0s6)
      ? interfaces.enp0s6.filter(item => (item?.family === 'IPv4' || item?.family === 4) && item?.address)
      : [];
    addCheck(checks, 'source-ip-interface-addresses', addresses.length >= 3, `enp0s6 IPv4 count=${addresses.length}`);
  }
  addCheck(checks, 'env-web-token', Boolean(env.GRASP_RAT_BROWSERLESS_WEB_TOKEN && env.GRASP_RAT_BROWSERLESS_WEB_TOKEN !== 'replace-with-a-long-random-token'), 'web token is present and not the example placeholder');
  const dataAccess = accessOk(dataDir);
  addCheck(checks, 'data-dir-access', dataAccess.ok, dataAccess.ok ? dataDir : dataAccess.reason);
  const logAccess = accessOk(logDir);
  addCheck(checks, 'log-dir-access', logAccess.ok, logAccess.ok ? logDir : logAccess.reason);

  const systemctl = { skipped: Boolean(options.skipSystemctl), enabled: null, active: null, show: null, processCwd: null };
  if (options.skipSystemctl) {
    for (const key of [
      'systemctl-enabled',
      'systemctl-active',
      'systemctl-running-state',
      'systemctl-main-start',
      'systemctl-loaded-working-directory',
      'systemctl-main-pid',
      'systemctl-loaded-nice',
      'systemctl-no-restarts',
      'process-working-directory',
      'process-command-line',
      'process-runtime-revision',
      'process-source-inaccessible'
    ]) addCheck(checks, key, true, 'skipped by --skip-systemctl');
  } else {
    const enabled = runCommand('systemctl', ['is-enabled', serviceName]);
    systemctl.enabled = enabled;
    addCheck(checks, 'systemctl-enabled', enabled.status === 0 && enabled.stdout.trim() === 'enabled', `status=${enabled.status}, stdout=${enabled.stdout.trim() || ''}, stderr=${enabled.stderr.trim() || enabled.error || ''}`);
    const active = runCommand('systemctl', ['is-active', serviceName]);
    systemctl.active = active;
    addCheck(checks, 'systemctl-active', active.status === 0 && active.stdout.trim() === 'active', `status=${active.status}, stdout=${active.stdout.trim() || ''}, stderr=${active.stderr.trim() || active.error || ''}`);
    const show = runCommand('systemctl', [
      'show', serviceName,
      '-p', 'ActiveState',
      '-p', 'SubState',
      '-p', 'Result',
      '-p', 'ExecMainPID',
      '-p', 'ExecMainStartTimestamp',
      '-p', 'ExecMainStartTimestampMonotonic',
      '-p', 'WorkingDirectory',
      '-p', 'Nice',
      '-p', 'NRestarts'
    ]);
    systemctl.show = show;
    const showValues = parseSystemctlShow(show.stdout);
    const showError = show.stderr.trim() || show.error || '';
    addCheck(checks, 'systemctl-running-state', show.status === 0 && showValues.ActiveState === 'active' && showValues.SubState === 'running' && showValues.Result === 'success', `status=${show.status}, ActiveState=${showValues.ActiveState || 'missing'}, SubState=${showValues.SubState || 'missing'}, Result=${showValues.Result || 'missing'}, stderr=${showError}`);
    const startMonotonicText = String(showValues.ExecMainStartTimestampMonotonic || '').trim();
    addCheck(checks, 'systemctl-main-start', show.status === 0 && Boolean(showValues.ExecMainStartTimestamp) && /^\d+$/.test(startMonotonicText) && Number(startMonotonicText) > 0, `ExecMainStartTimestamp=${showValues.ExecMainStartTimestamp || 'missing'}, ExecMainStartTimestampMonotonic=${startMonotonicText || 'missing'}`);
    addCheck(checks, 'systemctl-loaded-working-directory', show.status === 0 && path.resolve(showValues.WorkingDirectory || '/') === path.join(releaseRoot, 'current'), `WorkingDirectory=${showValues.WorkingDirectory || 'missing'}, expected=${path.join(releaseRoot, 'current')}`);
    addCheck(checks, 'systemctl-loaded-nice', showValues.Nice === '-10', `Nice=${showValues.Nice || 'missing'}`);
    addCheck(checks, 'systemctl-no-restarts', showValues.NRestarts === '0', `NRestarts=${showValues.NRestarts || 'missing'}`);
    const mainPidText = String(showValues.ExecMainPID || '').trim();
    const mainPid = /^\d+$/.test(mainPidText) ? Number(mainPidText) : 0;
    const mainPidOk = show.status === 0 && Number.isSafeInteger(mainPid) && mainPid > 0;
    addCheck(checks, 'systemctl-main-pid', mainPidOk, `ExecMainPID=${mainPidText || 'missing'}, stderr=${showError}`);

    if (mainPidOk) {
      const processCwd = runCommand('readlink', ['-f', `/proc/${mainPid}/cwd`]);
      systemctl.processCwd = processCwd;
      const actualCwd = processCwd.stdout.trim();
      addCheck(checks, 'process-working-directory', processCwd.status === 0 && Boolean(current.currentReleaseDir) && path.resolve(actualCwd || '/') === current.currentReleaseDir, `status=${processCwd.status}, cwd=${actualCwd || 'missing'}, expected=${current.currentReleaseDir || 'unresolved'}, stderr=${processCwd.stderr.trim() || processCwd.error || ''}`);

      try {
        const commandLine = Buffer.from(readProcFile(`/proc/${mainPid}/cmdline`)).toString('utf8').split('\0').filter(Boolean);
        addCheck(checks, 'process-command-line', commandLine.length === 2 && commandLine[0] === '/usr/bin/node' && commandLine[1] === 'browserless-runner.cjs', `cmdline=${commandLine.join(' ') || 'missing'}`);
      } catch (error) {
        addCheck(checks, 'process-command-line', false, error?.message || String(error));
      }
      try {
        const processEnv = parseNullEnv(readProcFile(`/proc/${mainPid}/environ`));
        addCheck(checks, 'process-runtime-revision', processEnv.GRASP_RAT_BROWSERLESS_REVISION === manifest.runtimeRevision, `process=${processEnv.GRASP_RAT_BROWSERLESS_REVISION || 'missing'}, manifest=${manifest.runtimeRevision || 'missing'}`);
      } catch (error) {
        addCheck(checks, 'process-runtime-revision', false, error?.message || String(error));
      }
      const sourceProbe = runCommand('nsenter', ['-t', String(mainPid), '-m', '--', 'test', '!', '-r', path.join(sourceDir, 'scripts', 'browserless-runner.js')]);
      addCheck(checks, 'process-source-inaccessible', sourceProbe.status === 0, `status=${sourceProbe.status}, sourceEntry=${path.join(sourceDir, 'scripts', 'browserless-runner.js')}, stderr=${sourceProbe.stderr.trim() || sourceProbe.error || ''}`);
    } else {
      for (const key of ['process-working-directory', 'process-command-line', 'process-runtime-revision', 'process-source-inaccessible']) {
        addCheck(checks, key, false, `not checked because ExecMainPID=${mainPidText || 'missing'} is not a positive running process ID`);
      }
    }
  }

  const failed = checks.filter(check => !check.ok);
  return {
    ok: failed.length === 0,
    serviceName,
    unitPath,
    envPath,
    envMode,
    sourceDir,
    releaseRoot,
    currentReleaseDir: current.currentReleaseDir,
    release: releaseReport || (manifest.releaseId ? {
      releaseId: manifest.releaseId,
      sourceRevision: manifest.sourceRevision,
      runtimeRevision: manifest.runtimeRevision,
      artifactDigest: manifest.artifactDigest
    } : null),
    dataDir,
    logDir,
    generatedAt: new Date().toISOString(),
    checks,
    failed,
    systemctl
  };
}

function formatHuman(report) {
  const lines = [
    `Browserless deployment audit: ${report.ok ? 'ok' : 'incomplete'}`,
    `Service: ${report.serviceName}`,
    `Unit: ${report.unitPath}`,
    `Env: ${report.envPath}`,
    `Env mode: ${report.envMode}`,
    `Release root: ${report.releaseRoot}`,
    `Current release: ${report.currentReleaseDir || 'unresolved'}`
  ];
  for (const check of report.checks) lines.push(`- ${check.ok ? 'ok' : 'missing'} ${check.key}: ${check.evidence}`);
  return lines.join('\n');
}

function usage() {
  return [
    'Usage: node scripts/browserless-deployment-audit.js [options]',
    '',
    'Options:',
    '  --unit <file>               Installed systemd unit.',
    '  --env <file>                Base environment file.',
    '  --env-mode safe|live|any    Validate runtime mode.',
    '  --release-root <dir>        Immutable release root.',
    '  --source-dir <dir>          Primary source checkout hidden from the service.',
    '  --expected-revision <rev>   Require the manifest source/runtime revision.',
    '  --data-dir <dir>            Override data directory.',
    '  --log-dir <dir>             Override log directory.',
    '  --skip-systemctl            Skip live systemd/process checks.',
    '  --json                      Print JSON.',
    '  --fail-on-incomplete        Exit nonzero when any check fails.',
    '',
    'Run as root (normally via sudo -n) for root-ownership and /proc evidence.'
  ].join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  const report = auditDeployment(args);
  console.log(args.json ? JSON.stringify(report, null, 2) : formatHuman(report));
  if (args.failOnIncomplete && !report.ok) process.exitCode = 1;
}

if (require.main === module) {
  main().catch(error => {
    console.error(error?.stack || error?.message || String(error));
    process.exit(1);
  });
}

module.exports = {
  DEFAULT_RELEASE_ROOT,
  auditDeployment,
  formatHuman,
  parseArgs,
  parseEnvText,
  parseNullEnv,
  parseSystemctlShow,
  resolveCurrentRelease,
  unitValue,
  unitValues
};
