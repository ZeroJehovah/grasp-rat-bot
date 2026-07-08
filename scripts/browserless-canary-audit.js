#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { readJsonlEntries } = require('./browserless-log-summary');

const PROFILE_MODES = {
  'read-only': 'read-only',
  'movement-only': 'movement-only',
  profit: 'non-combat-profit',
  'combat-dry-run': 'combat-dry-run',
  'combat-live': 'combat-live'
};

function parseArgs(argv) {
  const out = {
    logDir: path.join(process.cwd(), 'data', 'browserless-runner', 'logs'),
    day: new Date().toISOString().slice(0, 10),
    profile: 'read-only',
    requireStop: false,
    json: false,
    failOnIncomplete: false,
    help: false
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--log-dir') out.logDir = argv[++i] || out.logDir;
    else if (arg === '--day') out.day = argv[++i] || out.day;
    else if (arg === '--profile') out.profile = argv[++i] || out.profile;
    else if (arg === '--require-stop') out.requireStop = true;
    else if (arg === '--json') out.json = true;
    else if (arg === '--fail-on-incomplete') out.failOnIncomplete = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!PROFILE_MODES[out.profile]) throw new Error(`unsupported canary profile: ${out.profile}`);
  return out;
}

function loadStreams(logDir, day) {
  const dayDir = path.join(path.resolve(String(logDir)), String(day));
  const streams = {};
  for (const stream of ['runner', 'decisions', 'combat', 'exits']) {
    streams[stream] = readJsonlEntries(path.join(dayDir, `${stream}.jsonl`));
  }
  return { dayDir, streams };
}

function finalCanaryEntries(entries, mode) {
  return entries
    .filter(entry => (entry?.type === 'canary-finish' || entry?.type === 'canary-failed')
      && (!mode || entry?.detail?.mode === mode))
    .sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')));
}

function lastItem(items) {
  return items.length ? items[items.length - 1] : null;
}

function isExplicitStopFinal(entry) {
  const detail = entry?.detail || {};
  return detail?.safety?.event?.reason === 'explicit-stop'
    || detail?.error === 'explicit-stop';
}

function selectFinalCanaryEntry(entries, options = {}) {
  const ordered = entries.slice().sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')));
  if (options.requireStop) {
    return ordered.slice().reverse().find(isExplicitStopFinal) || lastItem(ordered);
  }
  return ordered.slice().reverse().find(entry => entry?.type === 'canary-finish' && entry?.detail?.ok === true)
    || lastItem(ordered);
}

function countWhere(items, predicate) {
  return items.reduce((count, item) => count + (predicate(item) ? 1 : 0), 0);
}

function parseTimeMs(value) {
  const ms = Date.parse(String(value || ''));
  return Number.isFinite(ms) ? ms : null;
}

function selectedRunWindow(finalEntry) {
  const detail = finalEntry?.detail || {};
  const startMs = parseTimeMs(detail.startedAt);
  const endMs = parseTimeMs(detail.completedAt) ?? parseTimeMs(finalEntry?.at);
  if (startMs === null || endMs === null || endMs < startMs) {
    return {
      applied: false,
      startAt: '',
      completedAt: ''
    };
  }
  return {
    applied: true,
    startMs,
    endMs,
    startAt: new Date(startMs).toISOString(),
    completedAt: new Date(endMs).toISOString()
  };
}

function entryInRunWindow(entry, window) {
  if (!window?.applied) return true;
  const atMs = parseTimeMs(entry?.at);
  return atMs !== null && atMs >= window.startMs && atMs <= window.endMs;
}

function filterStreamsToRunWindow(streams, window) {
  if (!window?.applied) return streams;
  const filtered = {};
  for (const [key, entries] of Object.entries(streams)) {
    filtered[key] = entries.filter(entry => entryInRunWindow(entry, window));
  }
  return filtered;
}

function addCheck(checks, key, ok, evidence, detail = {}) {
  checks.push({
    key,
    ok: Boolean(ok),
    evidence,
    detail
  });
}

function allCombatTargetsRealtime(entries) {
  for (const entry of entries) {
    const target = entry?.detail?.target || null;
    if (target && target.authority !== 'realtime') return false;
    const candidates = Array.isArray(entry?.detail?.candidates) ? entry.detail.candidates : [];
    if (candidates.some(candidate => candidate?.authority && candidate.authority !== 'realtime')) return false;
  }
  return true;
}

function allCombatDryRunSuppressed(entries) {
  for (const entry of entries) {
    const shooting = entry?.detail?.shooting || {};
    if (shooting.dryRunOnly !== true) return false;
    if (shooting.commandSuppressed !== true) return false;
  }
  return true;
}

function summarizeAudit(options = {}) {
  const profile = String(options.profile || 'read-only');
  const mode = PROFILE_MODES[profile];
  const { dayDir, streams } = loadStreams(options.logDir, options.day);
  const checks = [];
  const finalEntries = finalCanaryEntries(streams.runner, mode);
  const finalEntry = selectFinalCanaryEntry(finalEntries, { requireStop: options.requireStop });
  const final = finalEntry?.detail || null;
  const runWindow = selectedRunWindow(finalEntry);
  const scopedStreams = filterStreamsToRunWindow(streams, runWindow);
  const decisionCount = countWhere(scopedStreams.decisions, entry => entry?.type === 'decision');
  const movementCommandCount = countWhere(scopedStreams.runner, entry => entry?.type === 'movement-command');
  const combatDryRunEntries = scopedStreams.combat.filter(entry => entry?.type === 'combat-dry-run');
  const combatLiveEntries = scopedStreams.combat.filter(entry => entry?.type === 'combat-live');
  const safetyEvents = scopedStreams.exits.filter(entry => entry?.type === 'safety-event');
  const explicitStopEvents = safetyEvents.filter(entry => entry?.detail?.reason === 'explicit-stop');
  const leaveOk = Boolean(final?.leave?.ok || final?.safety?.exit?.leave?.ok);
  const explicitStopOk = Boolean(explicitStopEvents.length && leaveOk);

  addCheck(checks, 'final-event', Boolean(finalEntry), `found ${finalEntries.length} final canary events for mode ${mode}`);
  addCheck(checks, 'mode', final?.mode === mode, `expected ${mode}, got ${final?.mode || 'missing'}`);
  addCheck(checks, 'snapshot-safety', final?.snapshotSafety?.ok === true, `snapshotSafety.ok=${String(final?.snapshotSafety?.ok)}`);
  addCheck(checks, 'decoded-frames', Number(final?.stats?.decodedFrameCount || 0) > 0, `decodedFrameCount=${Number(final?.stats?.decodedFrameCount || 0)}`);
  addCheck(checks, 'self-observed', Number(final?.stats?.selfPresent?.true || 0) > 0, `selfPresent.true=${Number(final?.stats?.selfPresent?.true || 0)}`);
  addCheck(checks, 'decode-errors', Number(final?.frameHealth?.decodeErrors || 0) === 0, `decodeErrors=${Number(final?.frameHealth?.decodeErrors || 0)}`);
  addCheck(checks, 'leave-confirmed', leaveOk, `leave.ok=${String(leaveOk)}`);

  if (options.requireStop) {
    addCheck(checks, 'explicit-stop', explicitStopOk, `explicitStopEvents=${explicitStopEvents.length}, leave.ok=${String(leaveOk)}`);
  } else {
    addCheck(checks, 'clean-finish', finalEntry?.type === 'canary-finish' && final?.ok === true, `finalType=${finalEntry?.type || 'missing'}, ok=${String(final?.ok)}`);
  }

  addCheck(checks, 'decisions-logged', decisionCount > 0, `decision entries=${decisionCount}`);

  if (profile === 'read-only') {
    addCheck(checks, 'no-actions', Number(final?.actions?.sentCount || 0) === 0 && movementCommandCount === 0, `sent=${Number(final?.actions?.sentCount || 0)}, movement logs=${movementCommandCount}`);
    addCheck(checks, 'no-shoot', Number(final?.actions?.shootSentCount || 0) === 0, `shootSentCount=${Number(final?.actions?.shootSentCount || 0)}`);
  } else if (profile === 'movement-only') {
    addCheck(checks, 'velocity-sent', Number(final?.actions?.velocitySentCount || 0) > 0 && movementCommandCount > 0, `velocity=${Number(final?.actions?.velocitySentCount || 0)}, movement logs=${movementCommandCount}`);
    addCheck(checks, 'no-shoot', Number(final?.actions?.shootSentCount || 0) === 0, `shootSentCount=${Number(final?.actions?.shootSentCount || 0)}`);
  } else if (profile === 'profit') {
    const profitDecisionCount = countWhere(scopedStreams.decisions, entry => Boolean(entry?.detail?.profit));
    addCheck(checks, 'profit-decisions', profitDecisionCount > 0, `profit decision entries=${profitDecisionCount}`);
    addCheck(checks, 'velocity-sent', Number(final?.actions?.velocitySentCount || 0) > 0 && movementCommandCount > 0, `velocity=${Number(final?.actions?.velocitySentCount || 0)}, movement logs=${movementCommandCount}`);
    addCheck(checks, 'no-shoot', Number(final?.actions?.shootSentCount || 0) === 0, `shootSentCount=${Number(final?.actions?.shootSentCount || 0)}`);
  } else if (profile === 'combat-dry-run') {
    addCheck(checks, 'combat-logged', combatDryRunEntries.length > 0, `combat-dry-run entries=${combatDryRunEntries.length}`);
    addCheck(checks, 'combat-realtime-authority', allCombatTargetsRealtime(combatDryRunEntries), 'all logged combat targets/candidates use realtime authority');
    addCheck(checks, 'combat-suppressed', allCombatDryRunSuppressed(combatDryRunEntries), 'dry-run shooting rows are suppressed');
    addCheck(checks, 'no-actions', Number(final?.actions?.sentCount || 0) === 0 && movementCommandCount === 0, `sent=${Number(final?.actions?.sentCount || 0)}, movement logs=${movementCommandCount}`);
  } else if (profile === 'combat-live') {
    addCheck(checks, 'combat-logged', combatLiveEntries.length > 0, `combat-live entries=${combatLiveEntries.length}`);
    addCheck(checks, 'combat-realtime-authority', allCombatTargetsRealtime(combatLiveEntries), 'all logged combat targets/candidates use realtime authority');
    addCheck(checks, 'shoot-ack-or-no-shot', Number(final?.actions?.shootSentCount || 0) === 0 || Boolean(final?.actions?.lastShootAck), `shootSentCount=${Number(final?.actions?.shootSentCount || 0)}, lastShootAck=${Boolean(final?.actions?.lastShootAck)}`);
  }

  const failed = checks.filter(check => !check.ok);
  return {
    ok: failed.length === 0,
    profile,
    mode,
    day: String(options.day),
    logDir: path.resolve(String(options.logDir)),
    dayDir,
    generatedAt: new Date().toISOString(),
    requireStop: Boolean(options.requireStop),
    finalEvent: finalEntry ? { at: finalEntry.at || '', type: finalEntry.type || '', mode: final?.mode || '' } : null,
    runWindow: {
      applied: Boolean(runWindow.applied),
      startedAt: runWindow.startAt || '',
      completedAt: runWindow.completedAt || ''
    },
    counts: {
      runner: scopedStreams.runner.length,
      decisions: scopedStreams.decisions.length,
      combat: scopedStreams.combat.length,
      exits: scopedStreams.exits.length,
      movementCommand: movementCommandCount,
      combatDryRun: combatDryRunEntries.length,
      combatLive: combatLiveEntries.length,
      safetyEvent: safetyEvents.length,
      explicitStop: explicitStopEvents.length
    },
    rawCounts: {
      runner: streams.runner.length,
      decisions: streams.decisions.length,
      combat: streams.combat.length,
      exits: streams.exits.length
    },
    checks,
    failed
  };
}

function formatHuman(report) {
  const lines = [
    `Browserless canary audit: ${report.ok ? 'ok' : 'incomplete'}`,
    `Profile: ${report.profile} (${report.mode})`,
    `Logs: ${report.dayDir}`
  ];
  if (report.runWindow?.applied) {
    lines.push(`Run window: ${report.runWindow.startedAt} .. ${report.runWindow.completedAt}`);
  }
  for (const check of report.checks) {
    lines.push(`- ${check.ok ? 'ok' : 'missing'} ${check.key}: ${check.evidence}`);
  }
  return lines.join('\n');
}

function usage() {
  return [
    'Usage: node scripts/browserless-canary-audit.js [--log-dir <dir>] [--day YYYY-MM-DD] [--profile <name>] [--require-stop] [--json] [--fail-on-incomplete]',
    '',
    'Profiles: read-only, movement-only, profit, combat-dry-run, combat-live.',
    'Use --require-stop for a forced /api/stop validation; otherwise a clean canary finish is required.'
  ].join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  const report = summarizeAudit(args);
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
  PROFILE_MODES,
  formatHuman,
  parseArgs,
  summarizeAudit
};
