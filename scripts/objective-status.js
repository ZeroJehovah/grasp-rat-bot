#!/usr/bin/env node
'use strict';

const fs = require('fs');
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
    failOnIncomplete: false
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--manifest') out.manifestPath = path.resolve(args[++i] || out.manifestPath);
    else if (arg === '--log-dir') out.logDir = path.resolve(args[++i] || out.logDir);
    else if (arg === '--latest') out.latest = Math.max(0, Number(args[++i] || out.latest) || out.latest);
    else if (arg === '--json') out.json = true;
    else if (arg === '--fail-on-incomplete') out.failOnIncomplete = true;
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
  const requirements = [
    {
      key: 'exit-reasons-and-relogin-delay',
      ok: staticCheck.ok && liveOk,
      evidence: 'static verifier plus objective log audit for top-level exit, missing/generic reasons, unsafe delay, required delay, and login attempts during holds'
    },
    {
      key: 'similar-roi-no-ambiguous-wait',
      ok: staticCheck.ok && !liveReport.issues.some(item => item.issue === 'ambiguous-opportunity-wait'),
      evidence: 'static verifier checks obsolete wait strings are absent; log audit flags any reappearing ambiguous wait'
    },
    {
      key: 'post-login-zoom-out',
      ok: staticCheck.ok,
      evidence: 'static verifier checks six scheduled native zoom-out clicks after self detection'
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
      ok: staticCheck.ok
        && liveReport.activeCombatEvents.length > 0
        && liveReport.hpDisadvantageExitEvents.length > 0
        && !liveReport.issues.some(item => item.issue === 'coin-action-with-active-player-in-range'),
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
  console.log(`Live evidence: ${status.liveEvidence.ok ? 'ok' : 'missing/failing'} - entries=${status.liveEvidence.entries}/${status.liveEvidence.scannedEntries}, exits=${status.liveEvidence.exitEvents}, activeCombat=${status.liveEvidence.activeCombatEvents}, hpDisadvantageExits=${status.liveEvidence.hpDisadvantageExitEvents}`);
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

function main() {
  const options = parseArgs(process.argv.slice(2));
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
