#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createWatchdogService, DEFAULT_WATCHDOG_CONFIG } = require('./watchdog');

const GAME_ORIGIN = 'https://grasp-rat-game.h-e.top';
const INCIDENT_AT = Date.UTC(2026, 6, 7, 7, 55, 40, 828);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function parseArgs(args) {
  const out = {
    scenario: 'incident-2026-07-07-main-loop-gap',
    stallMs: 21000,
    thresholdMs: 2000,
    hp: 58,
    dir: '',
    keepLogs: false,
    expect: 'rescue',
    selfTest: false
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--scenario') out.scenario = String(args[++i] || out.scenario);
    else if (arg === '--stall-ms') out.stallMs = Math.max(0, Math.round(Number(args[++i] || out.stallMs) || out.stallMs));
    else if (arg === '--threshold-ms') out.thresholdMs = Math.max(250, Math.round(Number(args[++i] || out.thresholdMs) || out.thresholdMs));
    else if (arg === '--hp') out.hp = Math.max(1, Math.round(Number(args[++i] || out.hp) || out.hp));
    else if (arg === '--dir') out.dir = path.resolve(args[++i] || out.dir);
    else if (arg === '--keep-logs') out.keepLogs = true;
    else if (arg === '--expect') out.expect = String(args[++i] || out.expect);
    else if (arg === '--self-test') out.selfTest = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!['rescue', 'none'].includes(out.expect)) throw new Error(`unknown --expect value: ${out.expect}`);
  return out;
}

function printHelp() {
  console.log(`Usage: node watchdog-dry-run-replay.js [options]

Options:
  --scenario <name>       Scenario label. Default: incident-2026-07-07-main-loop-gap
  --stall-ms <ms>         Synthetic heartbeat stall duration. Default: 21000
  --threshold-ms <ms>     damagedCombatStaleMs/combat stale threshold. Default: 2000
  --hp <hp>               Synthetic self HP. Default: 58
  --dir <dir>             Audit output directory. Default: temporary directory
  --keep-logs             Keep temporary replay audit logs
  --expect rescue|none    Expected outcome. Default: rescue
  --self-test             Run replay regression checks
`);
}

function buildHeartbeat(at, options = {}) {
  return {
    type: 'watchdog-heartbeat',
    pageId: 'incident-2026-07-07',
    userId: 28886,
    at,
    sequence: 155540,
    visibilityState: 'hidden',
    pageLifecycle: 'hidden',
    combatActive: true,
    damagedInCombat: true,
    self: { id: 28886, hp: options.hp, maxHp: 100, life: 'Alive' },
    target: { id: 27355, name: 'RIS_YI', hp: 100, distance: 12665 },
    decision: { reason: 'combat-hp-disadvantage-leave', pendingExit: false },
    control: { wsOpen: true, nativeWsOpen: true, hasToken: true },
    runtime: { lastCombatTickAt: at, lastTickCompletedAt: at },
    leaveAuth: {
      available: true,
      userId: 28886,
      origin: GAME_ORIGIN,
      sessionToken: 'dry-run-secret-token',
      expiresAt: at + 30000,
      descriptor: {
        url: `${GAME_ORIGIN}/api/leave`,
        method: 'POST',
        headers: { authorization: 'Bearer ${sessionToken}' },
        bodyJson: { userId: '${userId}' }
      }
    }
  };
}

function readAuditLines(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8')
    .split(/\n+/)
    .filter(Boolean)
    .map(line => {
      try {
        return JSON.parse(line);
      } catch (_) {
        return { raw: line };
      }
    });
}

async function runDryRunReplay(options = {}) {
  const opts = { ...parseArgs([]), ...options };
  const root = opts.dir || fs.mkdtempSync(path.join(os.tmpdir(), 'grasp-rat-watchdog-replay-'));
  const removeRoot = !opts.dir && !opts.keepLogs;
  let now = Number(opts.startAt || INCIDENT_AT) || INCIDENT_AT;
  const externalCalls = [];
  const watchdog = createWatchdogService({
    dir: root,
    autoStart: false,
    now: () => now,
    fetch: async (url, req = {}) => {
      externalCalls.push({ url: String(url), method: String(req.method || 'GET') });
      throw new Error('dry-run replay must not call fetch');
    },
    config: {
      ...DEFAULT_WATCHDOG_CONFIG,
      enabled: true,
      activeRescueEnabled: false,
      dryRun: true,
      auditEnabled: true,
      auditFile: `watchdog-replay-${process.pid}-${Math.random().toString(36).slice(2, 8)}.jsonl`,
      heartbeatStaleMs: opts.thresholdMs,
      combatHeartbeatStaleMs: opts.thresholdMs,
      damagedCombatStaleMs: opts.thresholdMs,
      targetRecentMs: Math.max(0, opts.stallMs + 1000),
      directLeave: {
        ...DEFAULT_WATCHDOG_CONFIG.directLeave,
        enabled: true,
        verified: true,
        allowedOrigins: [GAME_ORIGIN]
      }
    }
  });

  try {
    const heartbeat = buildHeartbeat(now, opts);
    watchdog.handleHeartbeat(heartbeat, { remoteAddress: 'replay' });
    const before = await watchdog.checkNow();
    now += opts.stallMs;
    const after = await watchdog.checkNow();
    await watchdog.flushAudit();
    const auditFile = watchdog.auditPath(now);
    const auditLines = readAuditLines(auditFile);
    const wouldRescue = auditLines.filter(item => item.type === 'watchdog-would-rescue');
    const stateChanges = auditLines.filter(item => item.type === 'watchdog-state-change');
    const result = {
      ok: opts.expect === 'rescue' ? wouldRescue.length > 0 : wouldRescue.length === 0,
      scenario: opts.scenario,
      stallMs: opts.stallMs,
      thresholdMs: opts.thresholdMs,
      expected: opts.expect,
      wouldRescue: wouldRescue.length,
      stateChanges: stateChanges.map(item => item.state),
      before,
      after,
      externalCalls: externalCalls.length,
      auditFile: removeRoot ? '' : auditFile
    };
    const auditText = fs.existsSync(auditFile) ? fs.readFileSync(auditFile, 'utf8') : '';
    result.auditLeakedSecret = /dry-run-secret-token/.test(auditText);
    return result;
  } finally {
    watchdog.stop();
    if (removeRoot) fs.rmSync(root, { recursive: true, force: true });
  }
}

async function runSelfTest() {
  const rescue = await runDryRunReplay({ dir: fs.mkdtempSync(path.join(os.tmpdir(), 'grasp-rat-watchdog-replay-test-')), keepLogs: true });
  try {
    assert(rescue.ok, 'incident replay did not produce dry-run rescue');
    assert(rescue.wouldRescue === 1, 'incident replay should produce exactly one would-rescue audit');
    assert(rescue.externalCalls === 0, 'dry-run replay made an external call');
    assert(!rescue.auditLeakedSecret, 'dry-run replay leaked token into audit');
  } finally {
    if (rescue.auditFile) fs.rmSync(path.dirname(path.dirname(path.dirname(rescue.auditFile))), { recursive: true, force: true });
  }

  const noRescue = await runDryRunReplay({
    dir: fs.mkdtempSync(path.join(os.tmpdir(), 'grasp-rat-watchdog-replay-test-')),
    keepLogs: true,
    stallMs: 1000,
    thresholdMs: 2000,
    expect: 'none'
  });
  try {
    assert(noRescue.ok, 'below-threshold replay unexpectedly produced rescue');
    assert(noRescue.wouldRescue === 0, 'below-threshold replay wrote would-rescue audit');
  } finally {
    if (noRescue.auditFile) fs.rmSync(path.dirname(path.dirname(path.dirname(noRescue.auditFile))), { recursive: true, force: true });
  }
  console.log(JSON.stringify({ ok: true, cases: 2 }, null, 2));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.selfTest) {
    await runSelfTest();
    return;
  }
  const result = await runDryRunReplay(options);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok || result.auditLeakedSecret || result.externalCalls !== 0) process.exit(1);
}

if (require.main === module) {
  main().catch(err => {
    console.error(err.stack || err.message);
    process.exit(1);
  });
}

module.exports = {
  runDryRunReplay,
  buildHeartbeat
};
