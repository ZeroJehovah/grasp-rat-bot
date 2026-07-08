#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const DEFAULT_SERVICE_NAME = 'grasp-rat-browserless-runner';
const DEFAULT_UNIT_PATH = `/etc/systemd/system/${DEFAULT_SERVICE_NAME}.service`;
const DEFAULT_ENV_PATH = '/etc/grasp-rat/browserless-runner.env';
const DEFAULT_DATA_DIR = '/var/lib/grasp-rat-browserless';
const DEFAULT_LOG_DIR = '/var/log/grasp-rat-browserless';
const VALID_ENV_MODES = new Set(['safe', 'live', 'any']);
const VALID_CONTROL_MODES = new Set(['read-only', 'movement-only', 'non-combat-profit', 'combat-dry-run', 'combat-live']);
const VALID_CANARY_PROFILES = new Set(['read-only', 'movement-only', 'profit', 'combat-dry-run', 'combat-live']);

function parseArgs(argv) {
  const out = {
    serviceName: DEFAULT_SERVICE_NAME,
    unitPath: DEFAULT_UNIT_PATH,
    envPath: DEFAULT_ENV_PATH,
    dataDir: '',
    logDir: '',
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
  } catch (err) {
    return { ok: false, text: '', error: err?.message || String(err) };
  }
}

function unitValue(unitText, key) {
  const escaped = String(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`^${escaped}=(.*)$`, 'm').exec(unitText || '');
  return match ? match[1].trim() : '';
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
  checks.push({
    key,
    ok: Boolean(ok),
    evidence,
    detail
  });
}

function accessOk(dir) {
  try {
    const stat = fs.statSync(dir);
    if (!stat.isDirectory()) return { ok: false, reason: 'not-directory' };
    fs.accessSync(dir, fs.constants.R_OK | fs.constants.W_OK);
    return { ok: true, reason: '' };
  } catch (err) {
    return { ok: false, reason: err?.message || String(err) };
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
  return Number.isFinite(Number(value));
}

function addEnvChecks(checks, env, envMode) {
  const profile = env.GRASP_RAT_BROWSERLESS_CANARY_PROFILE || '';
  const control = env.GRASP_RAT_BROWSERLESS_CONTROL_MODE || '';
  const dryRun = env.GRASP_RAT_BROWSERLESS_DRY_RUN || '';
  const profilePresent = Boolean(profile);
  const controlPresent = Boolean(control);
  const profileOk = !profile || VALID_CANARY_PROFILES.has(profile);
  const controlOk = !control || VALID_CONTROL_MODES.has(control);
  const modeOk = profileOk && controlOk && (profilePresent || controlPresent);

  addCheck(checks, 'env-mode', VALID_ENV_MODES.has(envMode), `envMode=${envMode}`);
  if (!VALID_ENV_MODES.has(envMode)) return;

  if (envMode === 'safe') {
    addCheck(checks, 'env-safe-dry-run', dryRun === 'true', `GRASP_RAT_BROWSERLESS_DRY_RUN=${dryRun || 'missing'}`);
    addCheck(checks, 'env-read-only-profile', profile === 'read-only' || control === 'read-only', `profile=${profile}, control=${control}`);
    return;
  }

  if (envMode === 'live') {
    addCheck(checks, 'env-live-dry-run', dryRun === 'false', `GRASP_RAT_BROWSERLESS_DRY_RUN=${dryRun || 'missing'}`);
    addCheck(checks, 'env-live-profile', modeOk, `profile=${profile}, control=${control}`);
    addCheck(checks, 'env-live-session', isPositiveNumber(env.GRASP_RAT_BROWSERLESS_USER_ID) && Boolean(env.GRASP_RAT_BROWSERLESS_SESSION_TOKEN), `userId=${env.GRASP_RAT_BROWSERLESS_USER_ID || 'missing'}, sessionTokenPresent=${Boolean(env.GRASP_RAT_BROWSERLESS_SESSION_TOKEN)}`);
    addCheck(checks, 'env-login-point', isNumber(env.GRASP_RAT_BROWSERLESS_LOGIN_POINT_X) && isNumber(env.GRASP_RAT_BROWSERLESS_LOGIN_POINT_Y) && isNumber(env.GRASP_RAT_BROWSERLESS_LOGIN_POINT_HP), `x=${env.GRASP_RAT_BROWSERLESS_LOGIN_POINT_X || 'missing'}, y=${env.GRASP_RAT_BROWSERLESS_LOGIN_POINT_Y || 'missing'}, hp=${env.GRASP_RAT_BROWSERLESS_LOGIN_POINT_HP || 'missing'}`);
    return;
  }

  addCheck(checks, 'env-dry-run-value', isEnvBool(dryRun), `GRASP_RAT_BROWSERLESS_DRY_RUN=${dryRun || 'missing'}`);
  addCheck(checks, 'env-control-profile', modeOk, `profile=${profile}, control=${control}`);
}

function auditDeployment(options = {}, deps = {}) {
  const serviceName = options.serviceName || DEFAULT_SERVICE_NAME;
  const unitPath = path.resolve(String(options.unitPath || DEFAULT_UNIT_PATH));
  const envPath = path.resolve(String(options.envPath || DEFAULT_ENV_PATH));
  const envMode = String(options.envMode || 'safe').trim() || 'safe';
  const runCommand = deps.runCommand || commandRunner;
  const checks = [];

  const unit = readText(unitPath);
  addCheck(checks, 'unit-file', unit.ok, unit.ok ? unitPath : unit.error);
  const envFile = readText(envPath);
  addCheck(checks, 'env-file', envFile.ok, envFile.ok ? envPath : envFile.error);

  const env = parseEnvText(envFile.text);
  const dataDir = path.resolve(String(options.dataDir || env.GRASP_RAT_BROWSERLESS_DATA_DIR || DEFAULT_DATA_DIR));
  const logDir = path.resolve(String(options.logDir || env.GRASP_RAT_BROWSERLESS_LOG_DIR || DEFAULT_LOG_DIR));
  const workingDirectory = unitValue(unit.text, 'WorkingDirectory');
  const environmentFile = unitValue(unit.text, 'EnvironmentFile');
  const execStart = unitValue(unit.text, 'ExecStart');
  const readWritePaths = unitValue(unit.text, 'ReadWritePaths');

  addCheck(checks, 'service-name', serviceName === DEFAULT_SERVICE_NAME, `serviceName=${serviceName}`);
  addCheck(checks, 'working-directory', Boolean(workingDirectory && fs.existsSync(workingDirectory)), `WorkingDirectory=${workingDirectory || 'missing'}`);
  addCheck(checks, 'runner-entrypoint', Boolean(workingDirectory && fs.existsSync(path.join(workingDirectory, 'scripts', 'browserless-runner.js'))), `entrypoint=${workingDirectory ? path.join(workingDirectory, 'scripts', 'browserless-runner.js') : 'missing'}`);
  addCheck(checks, 'environment-file-reference', environmentFile === envPath, `EnvironmentFile=${environmentFile || 'missing'}`);
  addCheck(checks, 'exec-start', execStart.includes('node scripts/browserless-runner.js'), `ExecStart=${execStart || 'missing'}`);
  addCheck(checks, 'restart-policy', unitValue(unit.text, 'Restart') === 'on-failure', `Restart=${unitValue(unit.text, 'Restart') || 'missing'}`);
  addCheck(checks, 'read-write-paths', readWritePaths.includes(dataDir) && readWritePaths.includes(logDir), `ReadWritePaths=${readWritePaths || 'missing'}`);

  addCheck(checks, 'env-data-dir', env.GRASP_RAT_BROWSERLESS_DATA_DIR === dataDir, `GRASP_RAT_BROWSERLESS_DATA_DIR=${env.GRASP_RAT_BROWSERLESS_DATA_DIR || 'missing'}`);
  addCheck(checks, 'env-log-dir', env.GRASP_RAT_BROWSERLESS_LOG_DIR === logDir, `GRASP_RAT_BROWSERLESS_LOG_DIR=${env.GRASP_RAT_BROWSERLESS_LOG_DIR || 'missing'}`);
  addEnvChecks(checks, env, envMode);
  addCheck(checks, 'env-web-token', Boolean(env.GRASP_RAT_BROWSERLESS_WEB_TOKEN && env.GRASP_RAT_BROWSERLESS_WEB_TOKEN !== 'replace-with-a-long-random-token'), 'web token is present and not the example placeholder');

  const dataAccess = accessOk(dataDir);
  addCheck(checks, 'data-dir-access', dataAccess.ok, dataAccess.ok ? dataDir : dataAccess.reason);
  const logAccess = accessOk(logDir);
  addCheck(checks, 'log-dir-access', logAccess.ok, logAccess.ok ? logDir : logAccess.reason);

  const systemctl = {
    skipped: Boolean(options.skipSystemctl),
    enabled: null,
    active: null
  };
  if (options.skipSystemctl) {
    addCheck(checks, 'systemctl-enabled', true, 'skipped by --skip-systemctl');
    addCheck(checks, 'systemctl-active', true, 'skipped by --skip-systemctl');
  } else {
    const enabled = runCommand('systemctl', ['is-enabled', serviceName]);
    systemctl.enabled = enabled;
    addCheck(checks, 'systemctl-enabled', enabled.status === 0 && enabled.stdout.trim() === 'enabled', `status=${enabled.status}, stdout=${enabled.stdout.trim() || ''}, stderr=${enabled.stderr.trim() || enabled.error || ''}`);
    const active = runCommand('systemctl', ['is-active', serviceName]);
    systemctl.active = active;
    addCheck(checks, 'systemctl-active', active.status === 0 && active.stdout.trim() === 'active', `status=${active.status}, stdout=${active.stdout.trim() || ''}, stderr=${active.stderr.trim() || active.error || ''}`);
  }

  const failed = checks.filter(check => !check.ok);
  return {
    ok: failed.length === 0,
    serviceName,
    unitPath,
    envPath,
    envMode,
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
    `Env mode: ${report.envMode}`
  ];
  for (const check of report.checks) {
    lines.push(`- ${check.ok ? 'ok' : 'missing'} ${check.key}: ${check.evidence}`);
  }
  return lines.join('\n');
}

function usage() {
  return [
    'Usage: node scripts/browserless-deployment-audit.js [--unit <file>] [--env <file>] [--env-mode safe|live|any] [--data-dir <dir>] [--log-dir <dir>] [--skip-systemctl] [--json] [--fail-on-incomplete]',
    '',
    'Run on the VPS after installing and starting grasp-rat-browserless-runner.',
    'Default --env-mode safe checks dry-run/read-only deployment defaults. Use live before supervised live canaries and any for final aggregate acceptance.',
    'Use --skip-systemctl only for static file/directory checks.'
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
  main().catch(err => {
    console.error(err?.stack || err?.message || String(err));
    process.exit(1);
  });
}

module.exports = {
  auditDeployment,
  formatHuman,
  parseArgs,
  parseEnvText,
  unitValue
};
