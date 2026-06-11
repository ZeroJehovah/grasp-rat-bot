#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  dir: path.join(__dirname, 'logs'),
  minUnsafeDelayMs: 60000,
  eventGapMs: 30000,
  eventLineGap: 100,
  latest: 20,
  json: false,
  failOnIssue: false
};

function parseArgs(args) {
  const out = { ...DEFAULTS };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--dir') out.dir = path.resolve(args[++i] || out.dir);
    else if (arg === '--min-unsafe-delay-ms') out.minUnsafeDelayMs = Math.max(0, Number(args[++i] || out.minUnsafeDelayMs) || out.minUnsafeDelayMs);
    else if (arg === '--event-gap-ms') out.eventGapMs = Math.max(0, Number(args[++i] || out.eventGapMs) || out.eventGapMs);
    else if (arg === '--event-line-gap') out.eventLineGap = Math.max(0, Number(args[++i] || out.eventLineGap) || out.eventLineGap);
    else if (arg === '--latest') out.latest = Math.max(0, Number(args[++i] || out.latest) || out.latest);
    else if (arg === '--json') out.json = true;
    else if (arg === '--fail-on-issue') out.failOnIssue = true;
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
  console.log(`Usage: node analyze-logs.js [options]

Options:
  --dir <dir>                    Log directory. Default: ./logs
  --min-unsafe-delay-ms <ms>     Required delay for unsafe exits. Default: ${DEFAULTS.minUnsafeDelayMs}
  --event-gap-ms <ms>            Split same-summary events after this time gap. Default: ${DEFAULTS.eventGapMs}
  --event-line-gap <count>       Split same-summary events after this line gap. Default: ${DEFAULTS.eventLineGap}
  --latest <count>               Number of recent exit events to print. Default: ${DEFAULTS.latest}
  --json                         Print machine-readable JSON.
  --fail-on-issue                Exit with code 1 when issues are found.
`);
}

function walkJsonlFiles(rootDir) {
  const files = [];
  function walk(dir) {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      if (err && err.code === 'ENOENT') return;
      throw err;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else if (entry.isFile() && entry.name.endsWith('.jsonl')) files.push(fullPath);
    }
  }
  walk(rootDir);
  return files.sort();
}

function parseJsonl(file) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\n/);
  const entries = [];
  const errors = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      entries.push({ line: i + 1, entry: JSON.parse(line) });
    } catch (err) {
      errors.push({ line: i + 1, error: err?.message || String(err) });
    }
  }
  return { entries, errors };
}

function numberOrZero(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function entryTime(entry) {
  return numberOrZero(entry?.at) || numberOrZero(entry?.receivedAt) || 0;
}

function isoTime(value) {
  const t = Number(value || 0);
  if (!Number.isFinite(t) || t <= 0) return '';
  return new Date(t).toISOString();
}

function textParts(entry) {
  const decision = entry?.decision || {};
  const exit = entry?.exit || {};
  const enemyExit = entry?.enemyExit || {};
  const leave = decision?.leave || {};
  return [
    decision.reason,
    decision.displayReason,
    decision.exitSummary,
    leave.reason,
    leave.summary,
    leave.displayReason,
    exit.reason,
    exit.summary,
    exit.displayReason,
    exit.pendingLoginSuppressReason,
    enemyExit.reason,
    enemyExit.summary,
    enemyExit.displayReason
  ].filter(Boolean).map(String);
}

function exitReason(entry) {
  const decision = entry?.decision || {};
  return String(
    entry?.exit?.reason
    || decision?.leave?.reason
    || decision?.reason
    || entry?.enemyExit?.reason
    || ''
  );
}

function exitSummary(entry) {
  const decision = entry?.decision || {};
  return String(
    entry?.exit?.summary
    || entry?.exit?.displayReason
    || decision?.leave?.summary
    || decision?.leave?.displayReason
    || decision?.displayReason
    || decision?.exitSummary
    || entry?.enemyExit?.summary
    || entry?.enemyExit?.displayReason
    || ''
  );
}

function hasTopLevelExit(entry) {
  return Boolean(entry?.exit && typeof entry.exit === 'object');
}

function isExitish(entry) {
  const decision = entry?.decision || {};
  const reason = exitReason(entry);
  return hasTopLevelExit(entry)
    || Boolean(entry?.enemyExit)
    || decision.kind === 'leave'
    || /(?:^|[-\s])(leave|exit|offline|reconnect|control-ws|stamina-exhausted)(?:$|[-\s])/i.test(reason);
}

function isUnsafeExit(entry) {
  const text = textParts(entry).join(' ').toLowerCase();
  return /(combat|injury|pursuit|offline|reconnect|disconnect|control-ws|server-position|websocket|战斗|受伤|伤害|追击|离线|断连|重连)/i.test(text);
}

function delayMs(entry) {
  const decision = entry?.decision || {};
  const leave = decision?.leave || {};
  const exit = entry?.exit || {};
  const enemyExit = entry?.enemyExit || {};
  const pendingCombatLeave = entry?.pendingCombatLeave || {};
  return Math.max(
    numberOrZero(exit.pendingLoginSuppressDelayMs),
    numberOrZero(exit.reloginDelayMs),
    numberOrZero(exit.holdRemainingMs),
    numberOrZero(leave.pendingLoginSuppressDelayMs),
    numberOrZero(leave.reloginDelayMs),
    numberOrZero(leave.holdRemainingMs),
    numberOrZero(decision.pendingLoginSuppressDelayMs),
    numberOrZero(decision.reloginDelayMs),
    numberOrZero(decision.holdRemainingMs),
    numberOrZero(enemyExit.reloginDelayMs),
    numberOrZero(enemyExit.holdRemainingMs),
    numberOrZero(pendingCombatLeave.holdRemainingMs)
  );
}

function targetLabel(entry) {
  const candidates = [
    entry?.target,
    entry?.decision?.target,
    entry?.decision?.leave?.target,
    entry?.exit?.target,
    entry?.enemyExit?.target,
    entry?.enemyExit?.enemyActor,
    entry?.injury?.nearestActive
  ];
  const picked = candidates.find(Boolean) || null;
  if (!picked) return '';
  return String(picked.name || picked.label || picked.id || picked.user_id || picked.targetId || '');
}

function eventSignature(entry) {
  return [
    exitReason(entry),
    exitSummary(entry),
    targetLabel(entry)
  ].join('|');
}

function auditFile(file, rootDir, options) {
  const parsed = parseJsonl(file);
  const relFile = path.relative(rootDir, file) || file;
  const versions = new Set();
  const exitEvents = [];
  const activeBySignature = new Map();
  let firstAt = 0;
  let lastAt = 0;
  for (const item of parsed.entries) {
    const entry = item.entry;
    const t = entryTime(entry);
    if (t && (!firstAt || t < firstAt)) firstAt = t;
    if (t && t > lastAt) lastAt = t;
    if (entry?.version) versions.add(String(entry.version));
    if (!isExitish(entry)) continue;
    const signature = eventSignature(entry) || `${item.line}:${exitReason(entry)}`;
    const existing = activeBySignature.get(signature);
    const timeGap = existing && t && existing.lastAt ? Math.abs(t - Number(existing.lastAt || 0)) : 0;
    const lineGap = existing ? Math.max(0, item.line - Number(existing.lastLine || 0)) : 0;
    const reuseExisting = Boolean(existing)
      && lineGap <= Math.max(0, Number(options.eventLineGap || 0))
      && (!timeGap || timeGap <= Math.max(0, Number(options.eventGapMs || 0)));
    const topLevelExit = hasTopLevelExit(entry);
    const unsafe = isUnsafeExit(entry);
    const eventDelayMs = delayMs(entry);
    const issues = [];
    if (!topLevelExit) issues.push('missing-top-level-exit');
    if (unsafe && eventDelayMs < options.minUnsafeDelayMs) issues.push('unsafe-exit-delay-below-minimum');
    const event = reuseExisting ? existing : {
      file: relFile,
      firstLine: item.line,
      lastLine: item.line,
      firstAt: t,
      lastAt: t,
      version: entry?.version || '',
      reason: exitReason(entry),
      summary: exitSummary(entry),
      target: targetLabel(entry),
      topLevelExit,
      unsafe,
      delayMs: eventDelayMs,
      count: 0,
      issues: []
    };
    if (!reuseExisting) {
      exitEvents.push(event);
      activeBySignature.set(signature, event);
    }
    event.lastLine = item.line;
    if (t && (!event.firstAt || t < event.firstAt)) event.firstAt = t;
    if (t && t > event.lastAt) event.lastAt = t;
    event.topLevelExit = event.topLevelExit || topLevelExit;
    event.unsafe = event.unsafe || unsafe;
    event.delayMs = Math.max(event.delayMs, eventDelayMs);
    event.count += 1;
    for (const issue of issues) {
      if (!event.issues.includes(issue)) event.issues.push(issue);
    }
  }
  return {
    file: relFile,
    entries: parsed.entries.length,
    parseErrors: parsed.errors,
    versions: Array.from(versions).sort(),
    firstAt,
    lastAt,
    exitEvents
  };
}

function auditLogs(options) {
  const files = walkJsonlFiles(options.dir);
  const fileReports = files.map(file => auditFile(file, options.dir, options));
  const exitEvents = fileReports.flatMap(report => report.exitEvents)
    .sort((a, b) => Number(b.lastAt || 0) - Number(a.lastAt || 0));
  const issues = exitEvents.flatMap(event => event.issues.map(issue => ({ issue, event })));
  const parseErrors = fileReports.flatMap(report => report.parseErrors.map(error => ({ file: report.file, ...error })));
  return {
    dir: options.dir,
    minUnsafeDelayMs: options.minUnsafeDelayMs,
    files: fileReports.length,
    entries: fileReports.reduce((sum, report) => sum + report.entries, 0),
    parseErrors,
    versions: Array.from(new Set(fileReports.flatMap(report => report.versions))).sort(),
    exitEvents,
    issues
  };
}

function printHuman(report, options) {
  console.log('Combat log audit');
  console.log(`Dir: ${report.dir}`);
  console.log(`Files: ${report.files}, entries: ${report.entries}, versions: ${report.versions.join(', ') || '-'}`);
  console.log(`Exit events: ${report.exitEvents.length}, issues: ${report.issues.length}, parse errors: ${report.parseErrors.length}`);
  if (report.issues.length) {
    const counts = new Map();
    for (const item of report.issues) counts.set(item.issue, (counts.get(item.issue) || 0) + 1);
    console.log('Issue counts: ' + Array.from(counts.entries()).map(([issue, count]) => `${issue}=${count}`).join(', '));
  }
  const latest = report.exitEvents.slice(0, options.latest);
  if (latest.length) {
    console.log('');
    console.log(`Latest exit events (${latest.length}):`);
    for (const event of latest) {
      const flags = [];
      if (!event.topLevelExit) flags.push('missing exit');
      if (event.unsafe) flags.push('unsafe');
      if (event.delayMs) flags.push(`delay=${event.delayMs}ms`);
      if (event.issues.length) flags.push(`issues=${event.issues.join('+')}`);
      console.log(`- ${isoTime(event.lastAt) || '-'} ${event.file}:${event.firstLine}-${event.lastLine} ${event.reason || '-'}${event.target ? ` target=${event.target}` : ''} (${flags.join(', ') || 'ok'})`);
      if (event.summary) console.log(`  ${event.summary}`);
    }
  }
  if (report.parseErrors.length) {
    console.log('');
    console.log('Parse errors:');
    for (const error of report.parseErrors.slice(0, 20)) {
      console.log(`- ${error.file}:${error.line} ${error.error}`);
    }
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = auditLogs(options);
  if (options.json) console.log(JSON.stringify(report, null, 2));
  else printHuman(report, options);
  if (options.failOnIssue && (report.issues.length || report.parseErrors.length)) process.exitCode = 1;
}

if (require.main === module) main();

module.exports = { auditLogs, parseArgs };
