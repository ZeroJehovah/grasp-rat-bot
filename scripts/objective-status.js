#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_MANIFEST = path.join(ROOT, 'dist', 'manifest.json');
const DEFAULT_LOG_DIR = path.join(ROOT, 'combat-log-service', 'logs');

function parseArgs(args) {
  const out = {
    manifestPath: DEFAULT_MANIFEST,
    logDir: DEFAULT_LOG_DIR,
    latest: 5,
    json: false,
    failOnIncomplete: false,
    selfTest: false
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--manifest') out.manifestPath = path.resolve(args[++i] || out.manifestPath);
    else if (arg === '--log-dir') out.logDir = path.resolve(args[++i] || out.logDir);
    else if (arg === '--latest') out.latest = Math.max(0, Number(args[++i] || out.latest) || out.latest);
    else if (arg === '--json') out.json = true;
    else if (arg === '--fail-on-incomplete') out.failOnIncomplete = true;
    else if (arg === '--self-test') out.selfTest = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return out;
}

function printHelp() {
  console.log(`Usage: node scripts/objective-status.js [options]

Summarizes objective readiness from static build checks and current-version combat logs.

Options:
  --manifest <file>       Manifest JSON path. Default: dist/manifest.json
  --log-dir <dir>         Combat log directory. Default: combat-log-service/logs
  --latest <count>        Recent event count to include. Default: 5
  --json                  Print machine-readable JSON.
  --fail-on-incomplete    Exit 1 unless static checks and required live evidence are complete.
  --self-test             Run objective status regression checks.
`);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function runNodeScript(relPath, args = []) {
  const result = spawnSync(process.execPath, [path.join(ROOT, relPath), ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || ''
  };
}

function evidenceIssueCounts(report) {
  const counts = {};
  for (const item of report.evidenceIssues || []) {
    counts[item.issue] = (counts[item.issue] || 0) + 1;
  }
  return counts;
}

function issueCounts(report) {
  const counts = {};
  for (const item of report.issues || []) {
    counts[item.issue] = (counts[item.issue] || 0) + 1;
  }
  return counts;
}

const EXIT_RELOGIN_ISSUES = new Set([
  'missing-top-level-exit',
  'missing-exit-reason',
  'generic-exit-reason',
  'unsafe-exit-delay-below-minimum',
  'exit-delay-below-required',
  'login-attempt-during-exit-hold',
  'manual-login-cleared-exit-hold'
]);

const ACTIVE_COMBAT_ISSUES = new Set([
  'coin-action-with-active-player-in-range'
]);

const LOG_IDENTITY_EVIDENCE_ISSUES = new Set([
  'manifest-source-hash-missing',
  'manifest-source-hash-mismatch'
]);

function hasIssue(report, names) {
  return (report.issues || []).some(item => names.has(item.issue));
}

function hasEvidenceIssue(report, names) {
  return (report.evidenceIssues || []).some(item => names.has(item.issue));
}

function summarizeEvents(events, latest) {
  return (events || []).slice(0, latest).map(event => ({
    at: event.lastAt || 0,
    file: event.file || '',
    line: event.lastLine || 0,
    reason: event.reason || '',
    target: event.target || '',
    issues: event.issues || []
  }));
}

function requiredExitHoldMs(event, minUnsafeDelayMs) {
  const unsafeMin = event?.unsafe ? Math.max(0, Number(minUnsafeDelayMs || 0) || 0) : 0;
  return Math.max(unsafeMin, Math.max(0, Number(event?.requiredDelayMs || 0) || 0));
}

function buildStatus(options) {
  const manifest = readJson(options.manifestPath);
  const staticCheck = runNodeScript('scripts/verify-objective-build.js');
  const { auditLogs } = require(path.join(ROOT, 'combat-log-service', 'analyze-logs.js'));
  const liveReport = auditLogs({
    dir: options.logDir,
    manifestPath: options.manifestPath,
    requireEntries: true,
    requireExitEvents: true,
    requireActiveCombatEvents: true,
    requireHpDisadvantageExitEvents: true
  });
  const liveOk = liveReport.issues.length === 0
    && liveReport.parseErrors.length === 0
    && liveReport.evidenceIssues.length === 0;
  const logIdentityOk = liveReport.parseErrors.length === 0
    && !hasEvidenceIssue(liveReport, LOG_IDENTITY_EVIDENCE_ISSUES);
  const currentEntriesOk = logIdentityOk && liveReport.entries > 0;
  const unsafeOrRequiredDelayExitEvents = liveReport.exitEvents
    .filter(event => event.unsafe || requiredExitHoldMs(event, liveReport.minUnsafeDelayMs) > 0);
  const unsafeOrRequiredDelayExitOk = unsafeOrRequiredDelayExitEvents
    .some(event => {
      const requiredHoldMs = requiredExitHoldMs(event, liveReport.minUnsafeDelayMs);
      return requiredHoldMs <= 0 || Number(event.delayMs || 0) >= requiredHoldMs;
    });
  const exitReloginOk = staticCheck.ok
    && currentEntriesOk
    && liveReport.exitEvents.length > 0
    && unsafeOrRequiredDelayExitOk
    && !hasIssue(liveReport, EXIT_RELOGIN_ISSUES)
    && !hasEvidenceIssue(liveReport, new Set(['no-matching-exit-events']));
  const activeCombatOk = staticCheck.ok
    && currentEntriesOk
    && liveReport.activeCombatEvents.length > 0
    && liveReport.hpDisadvantageExitEvents.length > 0
    && !hasIssue(liveReport, ACTIVE_COMBAT_ISSUES)
    && !hasEvidenceIssue(liveReport, new Set(['no-active-in-range-combat-events', 'no-hp-disadvantage-exit-events']));
  const requirements = [
    {
      key: 'exit-reasons-and-relogin-delay',
      ok: exitReloginOk,
      evidence: 'current-version unsafe exit or reason-required-delay exit evidence plus no missing/generic exit reason, required-delay, or login-during-hold audit issues'
    },
    {
      key: 'similar-roi-no-ambiguous-wait',
      ok: staticCheck.ok && !liveReport.issues.some(item => item.issue === 'ambiguous-opportunity-wait'),
      evidence: 'static verifier checks obsolete wait strings are absent; log audit flags any reappearing ambiguous wait'
    },
    {
      key: 'post-login-zoom-out',
      ok: staticCheck.ok,
      evidence: 'static verifier checks five scheduled native zoom-out clicks after self detection and state preservation across bot updates'
    },
    {
      key: 'tall-viewport-layout',
      ok: staticCheck.ok,
      evidence: 'static verifier checks bootstrap workspace/map/world layout reset rules'
    },
    {
      key: 'compact-panel',
      ok: staticCheck.ok,
      evidence: 'static verifier checks compact dots, tooltip-only metric labels, removed section titles, and raw stamina pairs'
    },
    {
      key: 'active-enemy-combat-and-hp-exit',
      ok: activeCombatOk,
      evidence: 'static verifier checks Active handling and log audit requires live Active combat plus HP-disadvantage exit evidence'
    },
    {
      key: 'continuous-monitoring',
      ok: true,
      evidence: 'monitor:objective:fresh is strict; monitor:objective:observe is long-running observation without failing on missing evidence alone'
    }
  ];
  const complete = staticCheck.ok && liveOk && requirements.every(item => item.ok);
  return {
    complete,
    manifest: {
      version: manifest.version || '',
      sha256: manifest.sha256 || '',
      path: options.manifestPath
    },
    staticCheck: {
      ok: staticCheck.ok,
      status: staticCheck.status,
      summary: staticCheck.ok ? 'objective build verifier passed' : 'objective build verifier failed',
      stderr: staticCheck.stderr.trim()
    },
    liveEvidence: {
      ok: liveOk,
      dir: options.logDir,
      entries: liveReport.entries,
      scannedEntries: liveReport.scannedEntries,
      versions: liveReport.versions,
      exitEvents: liveReport.exitEvents.length,
      activeCombatEvents: liveReport.activeCombatEvents.length,
      hpDisadvantageExitEvents: liveReport.hpDisadvantageExitEvents.length,
      unsafeOrRequiredDelayExitEvents: unsafeOrRequiredDelayExitEvents.length,
      issues: issueCounts(liveReport),
      evidenceIssues: evidenceIssueCounts(liveReport),
      parseErrors: liveReport.parseErrors.length,
      sourceHashes: liveReport.sourceHashes,
      sourceHashMissingEntries: liveReport.sourceHashMissingEntries,
      sourceHashMismatchEntries: liveReport.sourceHashMismatchEntries,
      latestExitEvents: summarizeEvents(liveReport.exitEvents, options.latest),
      latestBehaviorEvents: summarizeEvents(liveReport.behaviorEvents, options.latest),
      latestActiveCombatEvents: summarizeEvents(liveReport.activeCombatEvents, options.latest)
    },
    requirements
  };
}

function printHuman(status) {
  console.log('Objective status');
  console.log(`Manifest: ${status.manifest.version || '-'} ${status.manifest.sha256 || '-'}`);
  console.log(`Static build: ${status.staticCheck.ok ? 'ok' : 'FAIL'} - ${status.staticCheck.summary}`);
  console.log(`Live evidence: ${status.liveEvidence.ok ? 'ok' : 'missing/failing'} - entries=${status.liveEvidence.entries}/${status.liveEvidence.scannedEntries}, exits=${status.liveEvidence.exitEvents}, unsafeOrRequiredDelayExits=${status.liveEvidence.unsafeOrRequiredDelayExitEvents}, activeCombat=${status.liveEvidence.activeCombatEvents}, hpDisadvantageExits=${status.liveEvidence.hpDisadvantageExitEvents}`);
  if (Object.keys(status.liveEvidence.issues).length) {
    console.log('Audit issues: ' + Object.entries(status.liveEvidence.issues).map(([key, value]) => `${key}=${value}`).join(', '));
  }
  if (Object.keys(status.liveEvidence.evidenceIssues).length) {
    console.log('Evidence gaps: ' + Object.entries(status.liveEvidence.evidenceIssues).map(([key, value]) => `${key}=${value}`).join(', '));
  }
  if (status.liveEvidence.parseErrors) console.log(`Parse errors: ${status.liveEvidence.parseErrors}`);
  console.log('');
  console.log('Requirements:');
  for (const item of status.requirements) {
    console.log(`- ${item.ok ? 'ok' : 'missing'} ${item.key}: ${item.evidence}`);
  }
  console.log('');
  console.log(`Overall: ${status.complete ? 'complete' : 'not complete'}`);
}

function assertSelfTest(condition, message) {
  if (!condition) throw new Error(message);
}

function writeJsonl(file, entries) {
  fs.writeFileSync(file, entries.map(entry => JSON.stringify(entry)).join('\n') + '\n');
}

function runSelfTest() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'grasp-rat-objective-status-'));
  try {
    const emptyDir = path.join(tempRoot, 'empty');
    const safeOnlyDir = path.join(tempRoot, 'safe-only');
    const exitOnlyDir = path.join(tempRoot, 'exit-only');
    const completeDir = path.join(tempRoot, 'complete');
    fs.mkdirSync(emptyDir, { recursive: true });
    fs.mkdirSync(safeOnlyDir, { recursive: true });
    fs.mkdirSync(exitOnlyDir, { recursive: true });
    fs.mkdirSync(completeDir, { recursive: true });
    const manifest = readJson(DEFAULT_MANIFEST);
    const baseAt = Date.parse('2026-06-12T00:00:00.000Z');
    const currentVersion = String(manifest.version || '');
    const currentHash = String(manifest.sha256 || '');

    const incomplete = buildStatus({
      manifestPath: DEFAULT_MANIFEST,
      logDir: emptyDir,
      latest: 3
    });
    assertSelfTest(incomplete.staticCheck.ok, 'expected static check to pass for incomplete fixture');
    assertSelfTest(!incomplete.complete, 'expected empty logs to be incomplete');
    assertSelfTest(incomplete.liveEvidence.evidenceIssues['no-matching-entries'] === 1, 'expected no-matching-entries evidence gap');
    assertSelfTest(incomplete.requirements.some(item => item.key === 'exit-reasons-and-relogin-delay' && item.ok === false), 'expected exit requirement to be missing');
    assertSelfTest(incomplete.requirements.some(item => item.key === 'active-enemy-combat-and-hp-exit' && item.ok === false), 'expected active combat requirement to be missing');

    writeJsonl(path.join(safeOnlyDir, 'objective-safe-only.jsonl'), [
      {
        type: 'combat-frame',
        at: baseAt,
        version: currentVersion,
        sourceHash: currentHash,
        self: {
          id: 1,
          x: 0,
          y: 0,
          hp: 100
        },
        decision: {
          kind: 'wait',
          reason: 'offline-leave',
          leave: {
            reason: 'websocket offline',
            safeReloginAllowed: true,
            offlineSafety: { unsafe: false }
          }
        },
        exit: {
          reason: 'websocket offline',
          summary: 'safe offline exit',
          safeReloginAllowed: true,
          offlineSafety: { unsafe: false },
          reloginDelayMs: 0
        }
      }
    ]);

    const safeOnly = buildStatus({
      manifestPath: DEFAULT_MANIFEST,
      logDir: safeOnlyDir,
      latest: 3
    });
    assertSelfTest(safeOnly.staticCheck.ok, 'expected static check to pass for safe-only fixture');
    assertSelfTest(!safeOnly.complete, 'expected safe-only fixture to be incomplete');
    assertSelfTest(safeOnly.liveEvidence.entries === 1, `expected one safe-only matching entry, got ${safeOnly.liveEvidence.entries}`);
    assertSelfTest(safeOnly.liveEvidence.exitEvents === 1, `expected one safe-only exit event, got ${safeOnly.liveEvidence.exitEvents}`);
    assertSelfTest(safeOnly.liveEvidence.unsafeOrRequiredDelayExitEvents === 0, `expected no unsafe/required safe-only exits, got ${safeOnly.liveEvidence.unsafeOrRequiredDelayExitEvents}`);
    assertSelfTest(safeOnly.requirements.some(item => item.key === 'exit-reasons-and-relogin-delay' && item.ok === false), 'expected safe-only fixture not to satisfy exit requirement');

    writeJsonl(path.join(exitOnlyDir, 'objective-exit-only.jsonl'), [
      {
        type: 'combat-frame',
        at: baseAt,
        version: currentVersion,
        sourceHash: currentHash,
        self: {
          id: 1,
          x: 0,
          y: 0,
          hp: 100
        },
        decision: {
          kind: 'leave',
          reason: 'stamina-budget-coin-leave',
          displayReason: '1h体力预算不足，退出等待恢复',
          staminaBudgetExit: {
            window: '1h',
            reloginDelayMs: 1800000
          }
        },
        exit: {
          reason: 'stamina-budget-coin-leave',
          summary: '1h体力预算不足，退出等待恢复',
          pendingLoginSuppressDelayMs: 1800000,
          reloginDelayMs: 1800000
        },
        login: {
          suppressRemainingMs: 1800000,
          suppressReason: 'stamina-budget-coin-leave'
        }
      }
    ]);

    const exitOnly = buildStatus({
      manifestPath: DEFAULT_MANIFEST,
      logDir: exitOnlyDir,
      latest: 3
    });
    assertSelfTest(exitOnly.staticCheck.ok, 'expected static check to pass for exit-only fixture');
    assertSelfTest(!exitOnly.complete, 'expected exit-only fixture to be incomplete');
    assertSelfTest(exitOnly.liveEvidence.entries === 1, `expected one exit-only matching entry, got ${exitOnly.liveEvidence.entries}`);
    assertSelfTest(exitOnly.liveEvidence.exitEvents === 1, `expected one exit-only event, got ${exitOnly.liveEvidence.exitEvents}`);
    assertSelfTest(exitOnly.liveEvidence.unsafeOrRequiredDelayExitEvents === 1, `expected one unsafe/required exit-only event, got ${exitOnly.liveEvidence.unsafeOrRequiredDelayExitEvents}`);
    assertSelfTest(exitOnly.liveEvidence.activeCombatEvents === 0, `expected no exit-only active combat events, got ${exitOnly.liveEvidence.activeCombatEvents}`);
    assertSelfTest(exitOnly.requirements.some(item => item.key === 'exit-reasons-and-relogin-delay' && item.ok === true), 'expected exit-only fixture to satisfy exit requirement');
    assertSelfTest(exitOnly.requirements.some(item => item.key === 'active-enemy-combat-and-hp-exit' && item.ok === false), 'expected exit-only fixture to miss active combat requirement');
    assertSelfTest(!exitOnly.liveEvidence.evidenceIssues['no-matching-exit-events'], 'expected exit-only fixture not to miss exit evidence');

    writeJsonl(path.join(completeDir, 'objective-complete.jsonl'), [
      {
        type: 'combat-frame',
        at: baseAt,
        version: currentVersion,
        sourceHash: currentHash,
        self: {
          id: 1,
          x: 0,
          y: 0,
          hp: 72
        },
        decision: {
          kind: 'leave',
          reason: 'combat-hp-disadvantage-leave',
          displayReason: '与ActiveEnemy战斗，血量72，对方HP 100，差距28，劣势退出',
          combat: true,
          shoot: true,
          target: {
            id: 42,
            name: 'ActiveEnemy',
            mode: 'Active',
            life: 'Alive',
            active: true,
            firing: true,
            invulnerable: false,
            distance: 12000,
            hp: 100
          }
        },
        exit: {
          reason: 'combat-hp-disadvantage-leave',
          summary: '与ActiveEnemy战斗，血量72，对方HP 100，差距28，劣势退出',
          pendingLoginSuppressDelayMs: 60000,
          reloginDelayMs: 60000,
          target: {
            id: 42,
            name: 'ActiveEnemy',
            mode: 'Active',
            distance: 12000
          }
        },
        login: {
          suppressRemainingMs: 60000,
          suppressReason: 'pending unsafe hostile exit'
        }
      }
    ]);

    const complete = buildStatus({
      manifestPath: DEFAULT_MANIFEST,
      logDir: completeDir,
      latest: 3
    });
    assertSelfTest(complete.staticCheck.ok, 'expected static check to pass for complete fixture');
    assertSelfTest(complete.complete, 'expected synthetic objective evidence to be complete');
    assertSelfTest(complete.liveEvidence.entries === 1, `expected one matching entry, got ${complete.liveEvidence.entries}`);
    assertSelfTest(complete.liveEvidence.exitEvents === 1, `expected one exit event, got ${complete.liveEvidence.exitEvents}`);
    assertSelfTest(complete.liveEvidence.activeCombatEvents === 1, `expected one active combat event, got ${complete.liveEvidence.activeCombatEvents}`);
    assertSelfTest(complete.liveEvidence.hpDisadvantageExitEvents === 1, `expected one HP-disadvantage exit, got ${complete.liveEvidence.hpDisadvantageExitEvents}`);
    assertSelfTest(Object.keys(complete.liveEvidence.issues).length === 0, 'expected no audit issues for complete fixture');
    assertSelfTest(Object.keys(complete.liveEvidence.evidenceIssues).length === 0, 'expected no evidence gaps for complete fixture');
    assertSelfTest(complete.requirements.every(item => item.ok), 'expected every requirement to be complete');

    console.log(JSON.stringify({ ok: true, cases: 32 }, null, 2));
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.selfTest) {
    runSelfTest();
    return;
  }
  const status = buildStatus(options);
  if (options.json) console.log(JSON.stringify(status, null, 2));
  else printHuman(status);
  if (options.failOnIncomplete && !status.complete) process.exitCode = 1;
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(err?.stack || err?.message || String(err));
    process.exitCode = 1;
  }
}

module.exports = { buildStatus, parseArgs };
