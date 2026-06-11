#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULTS = {
  dir: path.join(__dirname, 'logs'),
  minUnsafeDelayMs: 60000,
  staminaBudgetDelayMs: 300000,
  combatAttackRange: 14500,
  eventGapMs: 30000,
  eventLineGap: 100,
  latest: 20,
  sinceMs: 0,
  sinceLabel: '',
  minVersion: '',
  version: '',
  manifestPath: '',
  manifestMode: 'exact',
  manifestVersion: '',
  watch: false,
  watchIntervalMs: 10000,
  watchCount: 0,
  json: false,
  failOnIssue: false,
  requireEntries: false,
  requireExitEvents: false,
  selfTest: false
};

function parseArgs(args) {
  const out = { ...DEFAULTS };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--dir') out.dir = path.resolve(args[++i] || out.dir);
    else if (arg === '--min-unsafe-delay-ms') out.minUnsafeDelayMs = Math.max(0, Number(args[++i] || out.minUnsafeDelayMs) || out.minUnsafeDelayMs);
    else if (arg === '--stamina-budget-delay-ms') out.staminaBudgetDelayMs = Math.max(0, Number(args[++i] || out.staminaBudgetDelayMs) || out.staminaBudgetDelayMs);
    else if (arg === '--combat-attack-range') out.combatAttackRange = Math.max(0, Number(args[++i] || out.combatAttackRange) || out.combatAttackRange);
    else if (arg === '--event-gap-ms') out.eventGapMs = Math.max(0, Number(args[++i] || out.eventGapMs) || out.eventGapMs);
    else if (arg === '--event-line-gap') out.eventLineGap = Math.max(0, Number(args[++i] || out.eventLineGap) || out.eventLineGap);
    else if (arg === '--latest') out.latest = Math.max(0, Number(args[++i] || out.latest) || out.latest);
    else if (arg === '--since') {
      out.sinceLabel = String(args[++i] || '');
      out.sinceMs = parseTimeArg(out.sinceLabel);
    } else if (arg === '--min-version') out.minVersion = String(args[++i] || '').trim();
    else if (arg === '--version') out.version = String(args[++i] || '').trim();
    else if (arg === '--manifest') out.manifestPath = path.resolve(args[++i] || out.manifestPath);
    else if (arg === '--manifest-mode') out.manifestMode = String(args[++i] || out.manifestMode).trim().toLowerCase();
    else if (arg === '--watch') out.watch = true;
    else if (arg === '--watch-interval-ms') out.watchIntervalMs = Math.max(250, Number(args[++i] || out.watchIntervalMs) || out.watchIntervalMs);
    else if (arg === '--watch-count') out.watchCount = Math.max(0, Number(args[++i] || out.watchCount) || out.watchCount);
    else if (arg === '--json') out.json = true;
    else if (arg === '--fail-on-issue') out.failOnIssue = true;
    else if (arg === '--require-entries') out.requireEntries = true;
    else if (arg === '--require-exit-events') out.requireExitEvents = true;
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
  console.log(`Usage: node analyze-logs.js [options]

Options:
  --dir <dir>                    Log directory. Default: ./logs
  --min-unsafe-delay-ms <ms>     Required delay for unsafe exits. Default: ${DEFAULTS.minUnsafeDelayMs}
  --stamina-budget-delay-ms <ms> Required delay for stamina-budget exits. Default: ${DEFAULTS.staminaBudgetDelayMs}
  --combat-attack-range <cm>     Range used for Active-player behavior audits. Default: ${DEFAULTS.combatAttackRange}
  --event-gap-ms <ms>            Split same-summary events after this time gap. Default: ${DEFAULTS.eventGapMs}
  --event-line-gap <count>       Split same-summary events after this line gap. Default: ${DEFAULTS.eventLineGap}
  --latest <count>               Number of recent exit events to print. Default: ${DEFAULTS.latest}
  --since <time>                 Only audit entries at/after this time. Use "now", epoch ms, or ISO time.
  --min-version <version>        Only audit entries at/above this bot version, e.g. bootstrap-0.4.97.
  --version <version>            Only audit entries from this exact bot version.
  --manifest <file>              Read the bot version from a manifest JSON file.
  --manifest-mode <exact|min>    How --manifest filters versions. Default: ${DEFAULTS.manifestMode}
  --watch                        Keep polling the log directory.
  --watch-interval-ms <ms>       Poll interval for --watch. Default: ${DEFAULTS.watchIntervalMs}
  --watch-count <count>          Stop after this many watch scans. Default: unlimited
  --json                         Print machine-readable JSON.
  --fail-on-issue                Exit with code 1 when issues are found.
  --require-entries              Treat zero matching log entries as an evidence failure.
  --require-exit-events          Treat zero matching exit events as an evidence failure.
  --self-test                    Run analyzer regression checks.
`);
}

function parseTimeArg(value) {
  const text = String(value || '').trim();
  if (!text) return 0;
  if (/^now$/i.test(text)) return Date.now();
  if (/^\d+$/.test(text)) {
    const n = Number(text);
    return n > 0 && n < 1000000000000 ? n * 1000 : n;
  }
  const parsed = Date.parse(text);
  if (Number.isFinite(parsed)) return parsed;
  throw new Error(`Invalid --since time: ${value}`);
}

function manifestVersion(manifestPath) {
  const text = fs.readFileSync(manifestPath, 'utf8');
  const parsed = JSON.parse(text);
  const version = String(parsed?.version || '').trim();
  if (!version) throw new Error(`Manifest version missing: ${manifestPath}`);
  return version;
}

function resolveOptions(options) {
  const out = { ...DEFAULTS, ...options };
  if (!out.manifestPath) return out;
  const mode = String(out.manifestMode || DEFAULTS.manifestMode).trim().toLowerCase();
  if (mode !== 'exact' && mode !== 'min') throw new Error(`Invalid --manifest-mode: ${out.manifestMode}`);
  const version = manifestVersion(out.manifestPath);
  out.manifestMode = mode;
  out.manifestVersion = version;
  if (mode === 'min') out.minVersion = version;
  else out.version = version;
  return out;
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

function versionParts(value) {
  return String(value || '')
    .match(/\d+/g)
    ?.map(part => Number(part))
    .filter(part => Number.isFinite(part)) || [];
}

function compareVersions(a, b) {
  const pa = versionParts(a);
  const pb = versionParts(b);
  const length = Math.max(pa.length, pb.length);
  for (let i = 0; i < length; i += 1) {
    const av = pa[i] || 0;
    const bv = pb[i] || 0;
    if (av !== bv) return av > bv ? 1 : -1;
  }
  return 0;
}

function entryMatchesFilters(entry, options) {
  const t = entryTime(entry);
  if (options.sinceMs && (!t || t < Number(options.sinceMs))) return false;
  const version = String(entry?.version || '');
  if (options.version && version !== options.version) return false;
  if (options.minVersion && (!version || compareVersions(version, options.minVersion) < 0)) return false;
  return true;
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
    || Boolean(loginExitHoldIssues(entry).length)
    || decision.kind === 'leave'
    || /(?:^|[-\s])(leave|exit|offline|reconnect|control-ws|stamina-exhausted)(?:$|[-\s])/i.test(reason);
}

function isUnsafeExit(entry) {
  const text = textParts(entry).join(' ').toLowerCase();
  return /(combat|injury|pursuit|offline|reconnect|disconnect|control-ws|server-position|websocket|战斗|受伤|伤害|追击|离线|断连|重连)/i.test(text);
}

function decisionText(entry) {
  const decision = entry?.decision || {};
  return [
    decision.kind,
    decision.reason,
    decision.displayReason,
    decision.summary,
    decision.target?.type,
    decision.target?.reason,
    decision.target?.source,
    decision.opportunity?.type,
    decision.opportunity?.reason
  ].filter(Boolean).map(String);
}

function isAmbiguousOpportunityWait(entry) {
  const decision = entry?.decision || {};
  const text = decisionText(entry).join(' ');
  return decision.reason === 'wait-for-clear-opportunity'
    || /收益接近|clear opportunity|ambiguous opportunity/i.test(text);
}

function isCombatDecision(entry) {
  const decision = entry?.decision || {};
  const kind = String(decision.kind || '').toLowerCase();
  const reason = String(decision.reason || '').toLowerCase();
  return Boolean(decision.combat || decision.shoot || decision.forceShoot)
    || kind === 'attack'
    || kind === 'leave'
    || /combat|attack|shoot|leave|exit|flee|recovery/.test(reason);
}

function isCoinDecision(entry) {
  const decision = entry?.decision || {};
  const text = decisionText(entry).join(' ');
  return /coin|金币|pickup|collect|drop|visible-coin|snapshot-coin|known-coin|foot-coin|coin-field/i.test(text);
}

function activePlayersInAttackRange(entry, options) {
  const range = Math.max(0, Number(options.combatAttackRange || DEFAULTS.combatAttackRange) || 0);
  const entities = Array.isArray(entry?.nearbyEntities) ? entry.nearbyEntities : [];
  return entities.filter(entity => {
    if (!entity || entity.active === false || String(entity.mode || '').toLowerCase() === 'passive') return false;
    if (String(entity.life || '').toLowerCase() === 'dead') return false;
    if (entity.invulnerable) return false;
    const distance = Number(entity.distance);
    return Number.isFinite(distance) && distance <= range;
  });
}

function behaviorIssues(entry, options) {
  const issues = [];
  if (isAmbiguousOpportunityWait(entry)) issues.push('ambiguous-opportunity-wait');
  if (!isCombatDecision(entry) && isCoinDecision(entry) && activePlayersInAttackRange(entry, options).length) {
    issues.push('coin-action-with-active-player-in-range');
  }
  return issues;
}

function delayMs(entry) {
  const decision = entry?.decision || {};
  const leave = decision?.leave || {};
  const exit = entry?.exit || {};
  const enemyExit = entry?.enemyExit || {};
  const pendingCombatLeave = entry?.pendingCombatLeave || {};
  const login = loginContext(entry);
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
    numberOrZero(pendingCombatLeave.holdRemainingMs),
    numberOrZero(login.suppressRemainingMs),
    numberOrZero(login.enemyHoldRemainingMs),
    numberOrZero(login.offlineHoldRemainingMs)
  );
}

function requiredDelayMs(entry, options) {
  const decision = entry?.decision || {};
  const leave = decision?.leave || {};
  const exit = entry?.exit || {};
  const base = isUnsafeExit(entry) ? Math.max(0, Number(options.minUnsafeDelayMs || 0) || 0) : 0;
  const explicit = Math.max(
    numberOrZero(exit.pendingLoginSuppressMinimumDelayMs),
    numberOrZero(exit.pendingLoginSuppressHpDelayMs),
    numberOrZero(leave.pendingLoginSuppressMinimumDelayMs),
    numberOrZero(leave.pendingLoginSuppressHpDelayMs),
    numberOrZero(decision.pendingLoginSuppressMinimumDelayMs),
    numberOrZero(decision.pendingLoginSuppressHpDelayMs)
  );
  const text = textParts(entry).join(' ');
  const staminaBudget = /stamina-budget|1h体力预算|体力预算不足/i.test(text)
    ? Math.max(0, Number(options.staminaBudgetDelayMs || DEFAULTS.staminaBudgetDelayMs) || 0)
    : 0;
  return Math.max(base, explicit, staminaBudget);
}

function loginContext(entry) {
  const login = entry?.login || {};
  const lastLogin = login.lastLogin || {};
  const decisionLogin = login.decisionLogin || entry?.decision?.login || {};
  const manualLogin = login.manualLogin || entry?.decision?.manualLogin || {};
  return {
    suppressRemainingMs: numberOrZero(login.suppressRemainingMs),
    suppressReason: String(login.suppressReason || ''),
    enemyHoldRemainingMs: numberOrZero(login.enemyHoldRemainingMs),
    offlineHoldRemainingMs: numberOrZero(login.offlineHoldRemainingMs),
    lastLoginReason: String(lastLogin.reason || ''),
    lastLoginAttempted: Boolean(lastLogin.attempted),
    lastLoginIgnoredSuppressMs: numberOrZero(lastLogin.ignoredSuppressMs),
    decisionLoginReason: String(decisionLogin.reason || ''),
    decisionLoginAttempted: Boolean(decisionLogin.attempted),
    decisionLoginIgnoredSuppressMs: numberOrZero(decisionLogin.ignoredSuppressMs),
    manualLoginReason: String(manualLogin.reason || ''),
    manualLoginSuppressClearedMs: numberOrZero(manualLogin.cleared?.suppressRemainingMs),
    manualLoginEnemyHoldClearedMs: numberOrZero(manualLogin.cleared?.enemyHoldRemainingMs),
    manualLoginOfflineHoldClearedMs: numberOrZero(manualLogin.cleared?.offlineHoldRemainingMs)
  };
}

function loginExitHoldIssues(entry) {
  const login = loginContext(entry);
  const issues = [];
  const activeHoldMs = Math.max(
    login.suppressRemainingMs,
    login.enemyHoldRemainingMs,
    login.offlineHoldRemainingMs,
    login.decisionLoginIgnoredSuppressMs
  );
  if (login.decisionLoginAttempted && activeHoldMs > 0) {
    issues.push('login-attempt-during-exit-hold');
  }
  const manualClearedMs = Math.max(
    login.manualLoginSuppressClearedMs,
    login.manualLoginEnemyHoldClearedMs,
    login.manualLoginOfflineHoldClearedMs
  );
  if (manualClearedMs > 0) {
    issues.push('manual-login-cleared-exit-hold');
  }
  return issues;
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
  const behaviorEvents = [];
  const activeBehaviorBySignature = new Map();
  let includedEntries = 0;
  let firstAt = 0;
  let lastAt = 0;
  for (const item of parsed.entries) {
    const entry = item.entry;
    if (!entryMatchesFilters(entry, options)) continue;
    includedEntries += 1;
    const t = entryTime(entry);
    if (t && (!firstAt || t < firstAt)) firstAt = t;
    if (t && t > lastAt) lastAt = t;
    if (entry?.version) versions.add(String(entry.version));
    const currentBehaviorIssues = behaviorIssues(entry, options);
    if (currentBehaviorIssues.length) {
      const activeTarget = activePlayersInAttackRange(entry, options)[0] || null;
      const activeTargetLabel = activeTarget ? String(activeTarget.name || activeTarget.id || activeTarget.user_id || '') : '';
      const decision = entry?.decision || {};
      const reason = String(decision.reason || decision.kind || currentBehaviorIssues[0] || '');
      const summary = String(decision.displayReason || decision.summary || reason || '');
      const target = activeTargetLabel || targetLabel(entry);
      const signature = [
        currentBehaviorIssues.join('+'),
        reason,
        summary,
        target
      ].join('|');
      const existing = activeBehaviorBySignature.get(signature);
      const timeGap = existing && t && existing.lastAt ? Math.abs(t - Number(existing.lastAt || 0)) : 0;
      const lineGap = existing ? Math.max(0, item.line - Number(existing.lastLine || 0)) : 0;
      const reuseExisting = Boolean(existing)
        && lineGap <= Math.max(0, Number(options.eventLineGap || 0))
        && (!timeGap || timeGap <= Math.max(0, Number(options.eventGapMs || 0)));
      const event = reuseExisting ? existing : {
        file: relFile,
        firstLine: item.line,
        lastLine: item.line,
        firstAt: t,
        lastAt: t,
        version: entry?.version || '',
        reason,
        summary,
        target,
        count: 0,
        issues: []
      };
      if (!reuseExisting) {
        behaviorEvents.push(event);
        activeBehaviorBySignature.set(signature, event);
      }
      event.lastLine = item.line;
      if (t && (!event.firstAt || t < event.firstAt)) event.firstAt = t;
      if (t && t > event.lastAt) event.lastAt = t;
      event.count += 1;
      for (const issue of currentBehaviorIssues) {
        if (!event.issues.includes(issue)) event.issues.push(issue);
      }
    }
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
    const eventRequiredDelayMs = requiredDelayMs(entry, options);
    const issues = [];
    const loginIssues = loginExitHoldIssues(entry);
    if (!topLevelExit && !loginIssues.length) issues.push('missing-top-level-exit');
    if (unsafe && eventDelayMs < options.minUnsafeDelayMs) issues.push('unsafe-exit-delay-below-minimum');
    for (const issue of loginIssues) issues.push(issue);
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
      requiredDelayMs: eventRequiredDelayMs,
      login: loginContext(entry),
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
    event.requiredDelayMs = Math.max(Number(event.requiredDelayMs || 0), eventRequiredDelayMs);
    const currentLogin = loginContext(entry);
    event.login = {
      ...event.login,
      suppressRemainingMs: Math.max(Number(event.login?.suppressRemainingMs || 0), currentLogin.suppressRemainingMs),
      suppressReason: currentLogin.suppressReason || event.login?.suppressReason || '',
      enemyHoldRemainingMs: Math.max(Number(event.login?.enemyHoldRemainingMs || 0), currentLogin.enemyHoldRemainingMs),
      offlineHoldRemainingMs: Math.max(Number(event.login?.offlineHoldRemainingMs || 0), currentLogin.offlineHoldRemainingMs),
      lastLoginReason: currentLogin.lastLoginReason || event.login?.lastLoginReason || '',
      lastLoginAttempted: Boolean(event.login?.lastLoginAttempted || currentLogin.lastLoginAttempted),
      lastLoginIgnoredSuppressMs: Math.max(Number(event.login?.lastLoginIgnoredSuppressMs || 0), currentLogin.lastLoginIgnoredSuppressMs),
      decisionLoginReason: currentLogin.decisionLoginReason || event.login?.decisionLoginReason || '',
      decisionLoginAttempted: Boolean(event.login?.decisionLoginAttempted || currentLogin.decisionLoginAttempted),
      decisionLoginIgnoredSuppressMs: Math.max(Number(event.login?.decisionLoginIgnoredSuppressMs || 0), currentLogin.decisionLoginIgnoredSuppressMs),
      manualLoginReason: currentLogin.manualLoginReason || event.login?.manualLoginReason || '',
      manualLoginSuppressClearedMs: Math.max(Number(event.login?.manualLoginSuppressClearedMs || 0), currentLogin.manualLoginSuppressClearedMs),
      manualLoginEnemyHoldClearedMs: Math.max(Number(event.login?.manualLoginEnemyHoldClearedMs || 0), currentLogin.manualLoginEnemyHoldClearedMs),
      manualLoginOfflineHoldClearedMs: Math.max(Number(event.login?.manualLoginOfflineHoldClearedMs || 0), currentLogin.manualLoginOfflineHoldClearedMs)
    };
    event.count += 1;
    for (const issue of issues) {
      if (!event.issues.includes(issue)) event.issues.push(issue);
    }
  }
  for (const event of exitEvents) {
    const baseRequiredMs = event.unsafe ? Math.max(0, Number(options.minUnsafeDelayMs || 0) || 0) : 0;
    if (Number(event.requiredDelayMs || 0) > baseRequiredMs && Number(event.delayMs || 0) < Number(event.requiredDelayMs || 0)) {
      if (!event.issues.includes('exit-delay-below-required')) event.issues.push('exit-delay-below-required');
    }
  }
  return {
    file: relFile,
    entries: includedEntries,
    scannedEntries: parsed.entries.length,
    parseErrors: parsed.errors,
    versions: Array.from(versions).sort(),
    firstAt,
    lastAt,
    exitEvents,
    behaviorEvents
  };
}

function auditLogs(options) {
  options = resolveOptions(options);
  const files = walkJsonlFiles(options.dir);
  const fileReports = files.map(file => auditFile(file, options.dir, options));
  const exitEvents = fileReports.flatMap(report => report.exitEvents)
    .sort((a, b) => Number(b.lastAt || 0) - Number(a.lastAt || 0));
  const behaviorEvents = fileReports.flatMap(report => report.behaviorEvents || [])
    .sort((a, b) => Number(b.lastAt || 0) - Number(a.lastAt || 0));
  const exitReasonCounts = eventReasonCounts(exitEvents);
  const behaviorReasonCounts = eventReasonCounts(behaviorEvents);
  const exitSafetyCounts = summarizeExitSafety(exitEvents, options.minUnsafeDelayMs);
  const issues = [
    ...exitEvents.flatMap(event => event.issues.map(issue => ({ issue, event }))),
    ...behaviorEvents.flatMap(event => event.issues.map(issue => ({ issue, event })))
  ];
  const parseErrors = fileReports.flatMap(report => report.parseErrors.map(error => ({ file: report.file, ...error })));
  const entries = fileReports.reduce((sum, report) => sum + report.entries, 0);
  const report = {
    dir: options.dir,
    minUnsafeDelayMs: options.minUnsafeDelayMs,
    requireEntries: Boolean(options.requireEntries),
    requireExitEvents: Boolean(options.requireExitEvents),
    sinceMs: options.sinceMs || 0,
    minVersion: options.minVersion || '',
    version: options.version || '',
    manifestPath: options.manifestPath || '',
    manifestMode: options.manifestMode || '',
    manifestVersion: options.manifestVersion || '',
    files: fileReports.length,
    entries,
    scannedEntries: fileReports.reduce((sum, report) => sum + report.scannedEntries, 0),
    parseErrors,
    versions: Array.from(new Set(fileReports.flatMap(report => report.versions))).sort(),
    exitEvents,
    behaviorEvents,
    exitReasonCounts,
    behaviorReasonCounts,
    exitSafetyCounts,
    issues,
    evidenceIssues: []
  };
  if (options.requireEntries && entries === 0) {
    report.evidenceIssues.push({
      issue: 'no-matching-entries',
      message: 'No log entries matched the active filters.'
    });
  }
  if (options.requireExitEvents && exitEvents.length === 0) {
    report.evidenceIssues.push({
      issue: 'no-matching-exit-events',
      message: 'No exit events matched the active filters.'
    });
  }
  return report;
}

function countIssues(items) {
  const counts = new Map();
  for (const item of items || []) counts.set(item.issue, (counts.get(item.issue) || 0) + 1);
  return Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}

function issueCounts(report) {
  return countIssues(report.issues);
}

function evidenceIssueCounts(report) {
  return countIssues(report.evidenceIssues);
}

function issueCount(report, issue) {
  return report.issues.filter(item => item.issue === issue).length;
}

function evidenceIssueCount(report, issue) {
  return report.evidenceIssues.filter(item => item.issue === issue).length;
}

function reportHasFailures(report) {
  return Boolean(report?.issues?.length || report?.parseErrors?.length || report?.evidenceIssues?.length);
}

function eventReasonCounts(events) {
  const byReason = new Map();
  for (const event of events || []) {
    const reason = String(event?.reason || '-');
    const existing = byReason.get(reason) || {
      reason,
      events: 0,
      frames: 0,
      unsafeEvents: 0,
      issueEvents: 0,
      maxDelayMs: 0,
      latestAt: 0,
      issues: []
    };
    existing.events += 1;
    existing.frames += Math.max(1, Number(event?.count || 0) || 0);
    if (event?.unsafe) existing.unsafeEvents += 1;
    if (event?.issues?.length) existing.issueEvents += 1;
    existing.maxDelayMs = Math.max(existing.maxDelayMs, Number(event?.delayMs || 0) || 0);
    existing.latestAt = Math.max(existing.latestAt, Number(event?.lastAt || 0) || 0);
    for (const issue of event?.issues || []) {
      if (!existing.issues.includes(issue)) existing.issues.push(issue);
    }
    byReason.set(reason, existing);
  }
  return Array.from(byReason.values())
    .sort((a, b) => (b.events - a.events) || (b.latestAt - a.latestAt) || a.reason.localeCompare(b.reason));
}

function formatReasonCounts(counts) {
  return counts.map(item => {
    const flags = [];
    if (item.frames !== item.events) flags.push(`frames=${item.frames}`);
    if (item.unsafeEvents) flags.push(`unsafe=${item.unsafeEvents}`);
    if (item.issueEvents) flags.push(`issueEvents=${item.issueEvents}`);
    if (item.maxDelayMs) flags.push(`maxDelay=${item.maxDelayMs}ms`);
    return `${item.reason}=${item.events}${flags.length ? ` (${flags.join(', ')})` : ''}`;
  }).join(', ');
}

function summarizeExitSafety(events, minUnsafeDelayMs) {
  const minDelay = Math.max(0, Number(minUnsafeDelayMs || 0) || 0);
  const out = {
    total: 0,
    safe: 0,
    unsafe: 0,
    unsafeDelayOk: 0,
    unsafeDelayBelowMin: 0,
    unsafeDelayMissing: 0,
    requiredDelayEvents: 0,
    requiredDelayOk: 0,
    requiredDelayBelowRequired: 0,
    minUnsafeDelayMs: minDelay,
    maxRequiredDelayMs: 0,
    maxObservedDelayMs: 0
  };
  for (const event of events || []) {
    out.total += 1;
    const delay = Math.max(0, Number(event?.delayMs || 0) || 0);
    const requiredDelay = Math.max(0, Number(event?.requiredDelayMs || 0) || 0);
    out.maxObservedDelayMs = Math.max(out.maxObservedDelayMs, delay);
    out.maxRequiredDelayMs = Math.max(out.maxRequiredDelayMs, requiredDelay);
    if (requiredDelay > 0) {
      out.requiredDelayEvents += 1;
      if (delay >= requiredDelay) out.requiredDelayOk += 1;
      else out.requiredDelayBelowRequired += 1;
    }
    if (!event?.unsafe) {
      out.safe += 1;
      continue;
    }
    out.unsafe += 1;
    if (delay >= minDelay) out.unsafeDelayOk += 1;
    else {
      out.unsafeDelayBelowMin += 1;
      if (!delay) out.unsafeDelayMissing += 1;
    }
  }
  return out;
}

function formatExitSafetyCounts(counts) {
  const c = counts || {};
  return [
    `total=${Number(c.total || 0)}`,
    `safe=${Number(c.safe || 0)}`,
    `unsafe=${Number(c.unsafe || 0)}`,
    `unsafeDelayOk=${Number(c.unsafeDelayOk || 0)}`,
    `unsafeDelayBelowMin=${Number(c.unsafeDelayBelowMin || 0)}`,
    `unsafeDelayMissing=${Number(c.unsafeDelayMissing || 0)}`,
    `requiredDelayOk=${Number(c.requiredDelayOk || 0)}/${Number(c.requiredDelayEvents || 0)}`,
    `requiredDelayBelowRequired=${Number(c.requiredDelayBelowRequired || 0)}`,
    `minUnsafeDelay=${Number(c.minUnsafeDelayMs || 0)}ms`,
    `maxRequiredDelay=${Number(c.maxRequiredDelayMs || 0)}ms`,
    `maxObservedDelay=${Number(c.maxObservedDelayMs || 0)}ms`
  ].join(', ');
}

function reportFingerprint(report) {
  const latest = report.exitEvents[0] || {};
  const latestBehavior = report.behaviorEvents?.[0] || {};
  return JSON.stringify({
    files: report.files,
    entries: report.entries,
    scannedEntries: report.scannedEntries,
    manifestVersion: report.manifestVersion || '',
    parseErrors: report.parseErrors.length,
    evidenceIssues: evidenceIssueCounts(report),
    issues: issueCounts(report),
    exitReasonCounts: report.exitReasonCounts,
    behaviorReasonCounts: report.behaviorReasonCounts,
    exitSafetyCounts: report.exitSafetyCounts,
    latestExit: {
      file: latest.file || '',
      line: latest.lastLine || 0,
      at: latest.lastAt || 0,
      reason: latest.reason || '',
      issues: latest.issues || []
    },
    latestBehavior: {
      file: latestBehavior.file || '',
      line: latestBehavior.lastLine || 0,
      at: latestBehavior.lastAt || 0,
      reason: latestBehavior.reason || '',
      issues: latestBehavior.issues || []
    }
  });
}

function printHuman(report, options) {
  console.log('Combat log audit');
  console.log(`Dir: ${report.dir}`);
  console.log(`Files: ${report.files}, entries: ${report.entries}/${report.scannedEntries}, versions: ${report.versions.join(', ') || '-'}`);
  if (report.sinceMs || report.minVersion || report.version || report.requireEntries || report.requireExitEvents) {
    const filters = [];
    if (report.sinceMs) filters.push(`since=${isoTime(report.sinceMs) || report.sinceMs}`);
    if (report.manifestVersion) filters.push(`manifest=${report.manifestVersion}${report.manifestMode ? `:${report.manifestMode}` : ''}`);
    if (report.minVersion) filters.push(`minVersion=${report.minVersion}`);
    if (report.version) filters.push(`version=${report.version}`);
    if (report.requireEntries) filters.push('requireEntries=true');
    if (report.requireExitEvents) filters.push('requireExitEvents=true');
    console.log('Filters: ' + filters.join(', '));
  }
  console.log(`Exit events: ${report.exitEvents.length}, behavior events: ${report.behaviorEvents.length}, issues: ${report.issues.length}, evidence issues: ${report.evidenceIssues.length}, parse errors: ${report.parseErrors.length}`);
  if (report.issues.length) {
    console.log('Issue counts: ' + issueCounts(report).map(([issue, count]) => `${issue}=${count}`).join(', '));
  }
  if (report.evidenceIssues.length) {
    console.log('Evidence issue counts: ' + evidenceIssueCounts(report).map(([issue, count]) => `${issue}=${count}`).join(', '));
  }
  if (report.exitEvents.length) {
    console.log('Exit safety counts: ' + formatExitSafetyCounts(report.exitSafetyCounts));
  }
  if (report.exitReasonCounts.length) {
    console.log('Exit reason counts: ' + formatReasonCounts(report.exitReasonCounts));
  }
  if (report.behaviorReasonCounts.length) {
    console.log('Behavior reason counts: ' + formatReasonCounts(report.behaviorReasonCounts));
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
      if (event.requiredDelayMs) flags.push(`required=${event.requiredDelayMs}ms`);
      if (event.login?.suppressRemainingMs) flags.push(`suppress=${event.login.suppressRemainingMs}ms`);
      if (event.login?.enemyHoldRemainingMs) flags.push(`enemyHold=${event.login.enemyHoldRemainingMs}ms`);
      if (event.login?.offlineHoldRemainingMs) flags.push(`offlineHold=${event.login.offlineHoldRemainingMs}ms`);
      if (event.login?.lastLoginReason) flags.push(`lastLogin=${event.login.lastLoginReason}${event.login.lastLoginAttempted ? ':attempted' : ''}`);
      if (event.login?.decisionLoginReason) flags.push(`decisionLogin=${event.login.decisionLoginReason}${event.login.decisionLoginAttempted ? ':attempted' : ''}`);
      if (event.login?.manualLoginReason) flags.push(`manualLogin=${event.login.manualLoginReason}`);
      if (event.login?.lastLoginIgnoredSuppressMs) flags.push(`ignoredSuppress=${event.login.lastLoginIgnoredSuppressMs}ms`);
      if (event.login?.decisionLoginIgnoredSuppressMs) flags.push(`decisionIgnoredSuppress=${event.login.decisionLoginIgnoredSuppressMs}ms`);
      if (event.login?.manualLoginSuppressClearedMs) flags.push(`manualClearedSuppress=${event.login.manualLoginSuppressClearedMs}ms`);
      if (event.issues.length) flags.push(`issues=${event.issues.join('+')}`);
      console.log(`- ${isoTime(event.lastAt) || '-'} ${event.file}:${event.firstLine}-${event.lastLine} ${event.reason || '-'}${event.target ? ` target=${event.target}` : ''} (${flags.join(', ') || 'ok'})`);
      if (event.summary) console.log(`  ${event.summary}`);
    }
  }
  const latestBehavior = report.behaviorEvents.slice(0, options.latest);
  if (latestBehavior.length) {
    console.log('');
    console.log(`Latest behavior events (${latestBehavior.length}):`);
    for (const event of latestBehavior) {
      const flags = [];
      if (event.count > 1) flags.push(`count=${event.count}`);
      if (event.issues.length) flags.push(`issues=${event.issues.join('+')}`);
      console.log(`- ${isoTime(event.lastAt) || '-'} ${event.file}:${event.firstLine}-${event.lastLine} ${event.reason || '-'}${event.target ? ` target=${event.target}` : ''} (${flags.join(', ') || 'ok'})`);
      if (event.summary && event.summary !== event.reason) console.log(`  ${event.summary}`);
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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function watchLogs(options) {
  let lastFingerprint = '';
  let lastReport = null;
  let scans = 0;
  console.log(`Watching ${options.dir} every ${options.watchIntervalMs}ms. Press Ctrl+C to stop.`);
  while (true) {
    const report = auditLogs(options);
    const fingerprint = reportFingerprint(report);
    const changed = fingerprint !== lastFingerprint;
    scans += 1;
    lastReport = report;
    if (changed) {
      console.log('');
      console.log(`Audit update ${new Date().toISOString()} scan=${scans}`);
      printHuman(report, options);
      lastFingerprint = fingerprint;
    } else {
      console.log(`${new Date().toISOString()} no change: files=${report.files} entries=${report.entries}/${report.scannedEntries} issues=${report.issues.length} evidenceIssues=${report.evidenceIssues.length}`);
    }
    if (options.watchCount && scans >= options.watchCount) break;
    await sleep(options.watchIntervalMs);
  }
  if (options.failOnIssue && lastReport && reportHasFailures(lastReport)) process.exitCode = 1;
}

async function main() {
  const options = resolveOptions(parseArgs(process.argv.slice(2)));
  if (options.selfTest) {
    runSelfTest();
    return;
  }
  if (options.watch) {
    await watchLogs(options);
    return;
  }
  const report = auditLogs(options);
  if (options.json) console.log(JSON.stringify(report, null, 2));
  else printHuman(report, options);
  if (options.failOnIssue && reportHasFailures(report)) process.exitCode = 1;
}

function assertSelfTest(condition, message) {
  if (!condition) throw new Error(message);
}

function runSelfTest() {
  let cases = 0;
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'grasp-rat-log-audit-'));
  try {
    const logsDir = path.join(tempRoot, 'logs');
    const loginLogsDir = path.join(tempRoot, 'login-logs');
    const behaviorLogsDir = path.join(tempRoot, 'behavior-logs');
    const requiredDelayLogsDir = path.join(tempRoot, 'required-delay-logs');
    const noExitLogsDir = path.join(tempRoot, 'no-exit-logs');
    const emptyLogsDir = path.join(tempRoot, 'empty-logs');
    const manifestPath = path.join(tempRoot, 'manifest.json');
    fs.mkdirSync(logsDir, { recursive: true });
    fs.mkdirSync(loginLogsDir, { recursive: true });
    fs.mkdirSync(behaviorLogsDir, { recursive: true });
    fs.mkdirSync(requiredDelayLogsDir, { recursive: true });
    fs.mkdirSync(noExitLogsDir, { recursive: true });
    fs.mkdirSync(emptyLogsDir, { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify({ version: 'bootstrap-0.4.97' }) + '\n');

    const baseAt = 1760000000000;
    const entries = [
      {
        type: 'combat-frame',
        at: baseAt,
        version: 'bootstrap-0.4.96',
        decision: {
          kind: 'leave',
          reason: 'combat-hp-disadvantage-leave',
          leave: {
            reason: 'combat-hp-disadvantage-leave',
            summary: 'legacy unsafe exit',
            pendingLoginSuppressDelayMs: 1000
          }
        }
      },
      {
        type: 'combat-frame',
        at: baseAt + 1000,
        version: 'bootstrap-0.4.97',
        decision: {
          kind: 'leave',
          reason: 'combat-hp-disadvantage-leave'
        },
        exit: {
          reason: 'combat-hp-disadvantage-leave',
          summary: 'current safe exit',
          pendingLoginSuppressReason: 'pending unsafe hostile exit',
          pendingLoginSuppressDelayMs: 60000
        },
        login: {
          suppressRemainingMs: 60000,
          suppressReason: 'pending unsafe hostile exit',
          enemyHoldRemainingMs: 90000,
          lastLogin: {
            reason: 'suppressed',
            attempted: false
          }
        }
      },
      {
        type: 'combat-frame',
        at: baseAt + 2000,
        version: 'bootstrap-0.4.97',
        decision: {
          kind: 'wait',
          reason: 'combat-spacing'
        }
      },
      {
        type: 'combat-end',
        at: baseAt + 3000,
        version: 'bootstrap-0.4.97',
        decision: {
          kind: 'wait',
          reason: 'enemy-leave-wait',
          displayReason: 'confirmed hostile hold'
        },
        exit: {
          reason: 'enemy-leave-wait',
          displayReason: 'confirmed hostile hold',
          holdRemainingMs: 120000,
          reloginDelayMs: 180000
        },
        login: {
          suppressRemainingMs: 120000,
          suppressReason: 'enemy leave',
          enemyHoldRemainingMs: 120000
        }
      }
    ];
    fs.writeFileSync(
      path.join(logsDir, 'sample.jsonl'),
      entries.map(entry => JSON.stringify(entry)).join('\n') + '\n'
    );

    const allReport = auditLogs({ dir: logsDir });
    cases += 1;
    assertSelfTest(allReport.entries === 4, `expected 4 included entries, got ${allReport.entries}`);
    cases += 1;
    assertSelfTest(allReport.exitEvents.length === 3, `expected 3 exit events, got ${allReport.exitEvents.length}`);
    cases += 1;
    assertSelfTest(issueCount(allReport, 'missing-top-level-exit') === 1, 'expected one missing top-level exit issue');
    cases += 1;
    assertSelfTest(issueCount(allReport, 'unsafe-exit-delay-below-minimum') === 1, 'expected one unsafe-delay issue');
    const allCombatReason = allReport.exitReasonCounts.find(item => item.reason === 'combat-hp-disadvantage-leave') || null;
    cases += 1;
    assertSelfTest(allCombatReason?.events === 2, `expected 2 combat reason events, got ${allCombatReason?.events}`);
    cases += 1;
    assertSelfTest(allCombatReason?.frames === 2, `expected 2 combat reason frames, got ${allCombatReason?.frames}`);
    cases += 1;
    assertSelfTest(allReport.exitSafetyCounts.total === 3, `expected 3 safety-counted exits, got ${allReport.exitSafetyCounts.total}`);
    cases += 1;
    assertSelfTest(allReport.exitSafetyCounts.unsafe === 2, `expected 2 unsafe exits, got ${allReport.exitSafetyCounts.unsafe}`);
    cases += 1;
    assertSelfTest(allReport.exitSafetyCounts.safe === 1, `expected 1 safe exit, got ${allReport.exitSafetyCounts.safe}`);
    cases += 1;
    assertSelfTest(allReport.exitSafetyCounts.unsafeDelayOk === 1, `expected 1 unsafe delay ok exit, got ${allReport.exitSafetyCounts.unsafeDelayOk}`);
    cases += 1;
    assertSelfTest(allReport.exitSafetyCounts.unsafeDelayBelowMin === 1, `expected 1 unsafe delay below minimum exit, got ${allReport.exitSafetyCounts.unsafeDelayBelowMin}`);

    const currentReport = auditLogs({ dir: logsDir, manifestPath });
    cases += 1;
    assertSelfTest(currentReport.manifestVersion === 'bootstrap-0.4.97', `expected manifest version bootstrap-0.4.97, got ${currentReport.manifestVersion}`);
    cases += 1;
    assertSelfTest(currentReport.entries === 3, `expected 3 current-version entries, got ${currentReport.entries}`);
    cases += 1;
    assertSelfTest(currentReport.exitEvents.length === 2, `expected 2 current-version exit events, got ${currentReport.exitEvents.length}`);
    cases += 1;
    assertSelfTest(currentReport.issues.length === 0, `expected no current-version issues, got ${currentReport.issues.length}`);
    const currentCombatExit = currentReport.exitEvents.find(event => event.reason === 'combat-hp-disadvantage-leave') || null;
    cases += 1;
    assertSelfTest(currentCombatExit?.login?.suppressRemainingMs === 60000, 'expected current exit login suppress context');
    cases += 1;
    assertSelfTest(currentCombatExit?.login?.enemyHoldRemainingMs === 90000, 'expected current exit enemy hold context');
    cases += 1;
    assertSelfTest(currentReport.exitEvents.some(event => event.reason === 'enemy-leave-wait' && event.topLevelExit && event.delayMs === 180000), 'expected combat-end exit wait to keep top-level exit and delay');
    cases += 1;
    assertSelfTest(currentReport.exitReasonCounts.length === 2, `expected 2 current exit reason counts, got ${currentReport.exitReasonCounts.length}`);
    cases += 1;
    assertSelfTest(currentReport.exitSafetyCounts.unsafeDelayBelowMin === 0, `expected no current unsafe exits below minimum, got ${currentReport.exitSafetyCounts.unsafeDelayBelowMin}`);

    const requiredReport = auditLogs({ dir: logsDir, manifestPath, requireEntries: true });
    cases += 1;
    assertSelfTest(requiredReport.entries === 3, `expected 3 required entries, got ${requiredReport.entries}`);
    cases += 1;
    assertSelfTest(requiredReport.evidenceIssues.length === 0, `expected no evidence issues with matching entries, got ${requiredReport.evidenceIssues.length}`);

    const requiredExitReport = auditLogs({ dir: logsDir, manifestPath, requireEntries: true, requireExitEvents: true });
    cases += 1;
    assertSelfTest(requiredExitReport.exitEvents.length === 2, `expected 2 required exit events, got ${requiredExitReport.exitEvents.length}`);
    cases += 1;
    assertSelfTest(requiredExitReport.evidenceIssues.length === 0, `expected no evidence issues with matching exit events, got ${requiredExitReport.evidenceIssues.length}`);

    const emptyRequiredReport = auditLogs({ dir: emptyLogsDir, manifestPath, requireEntries: true });
    cases += 1;
    assertSelfTest(emptyRequiredReport.entries === 0, `expected 0 empty required entries, got ${emptyRequiredReport.entries}`);
    cases += 1;
    assertSelfTest(evidenceIssueCount(emptyRequiredReport, 'no-matching-entries') === 1, 'expected one no-matching-entries evidence issue');
    cases += 1;
    assertSelfTest(reportHasFailures(emptyRequiredReport), 'expected empty required report to count as failure');

    fs.writeFileSync(
      path.join(noExitLogsDir, 'no-exit.jsonl'),
      JSON.stringify({
        type: 'combat-frame',
        at: baseAt + 3500,
        version: 'bootstrap-0.4.97',
        decision: {
          kind: 'attack',
          reason: 'combat-spacing',
          combat: true,
          shoot: true
        }
      }) + '\n'
    );
    const noExitRequiredReport = auditLogs({ dir: noExitLogsDir, manifestPath, requireEntries: true, requireExitEvents: true });
    cases += 1;
    assertSelfTest(noExitRequiredReport.entries === 1, `expected 1 no-exit entry, got ${noExitRequiredReport.entries}`);
    cases += 1;
    assertSelfTest(noExitRequiredReport.exitEvents.length === 0, `expected 0 no-exit events, got ${noExitRequiredReport.exitEvents.length}`);
    cases += 1;
    assertSelfTest(evidenceIssueCount(noExitRequiredReport, 'no-matching-exit-events') === 1, 'expected one no-matching-exit-events evidence issue');
    cases += 1;
    assertSelfTest(reportHasFailures(noExitRequiredReport), 'expected no-exit required report to count as failure');

    const reloginEntries = [
      {
        type: 'combat-end',
        at: baseAt + 4000,
        version: 'bootstrap-0.4.97',
        decision: {
          kind: 'wait',
          reason: 'auto-login'
        },
        login: {
          suppressRemainingMs: 60000,
          suppressReason: 'pending unsafe hostile exit',
          enemyHoldRemainingMs: 60000,
          decisionLogin: {
            reason: 'no-self',
            attempted: true,
            ignoredSuppressMs: 60000
          }
        }
      },
      {
        type: 'combat-end',
        at: baseAt + 5000,
        version: 'bootstrap-0.4.97',
        decision: {
          kind: 'wait',
          reason: 'manual-login'
        },
        login: {
          manualLogin: {
            reason: 'panel immediate login',
            cleared: {
              suppressRemainingMs: 45000,
              enemyHoldRemainingMs: 90000,
              offlineHoldRemainingMs: 0
            }
          }
        }
      }
    ];
    fs.writeFileSync(
      path.join(loginLogsDir, 'relogin.jsonl'),
      reloginEntries.map(entry => JSON.stringify(entry)).join('\n') + '\n'
    );
    const reloginReport = auditLogs({ dir: loginLogsDir, manifestPath });
    cases += 1;
    assertSelfTest(reloginReport.exitEvents.length === 2, `expected 2 relogin events, got ${reloginReport.exitEvents.length}`);
    cases += 1;
    assertSelfTest(issueCount(reloginReport, 'login-attempt-during-exit-hold') === 1, 'expected one login during hold issue');
    cases += 1;
    assertSelfTest(issueCount(reloginReport, 'manual-login-cleared-exit-hold') === 1, 'expected one manual login hold-clear issue');
    cases += 1;
    assertSelfTest(issueCount(reloginReport, 'missing-top-level-exit') === 0, 'expected relogin hold issues not to require top-level exit');

    const behaviorEntries = [
      {
        type: 'combat-pre-frame',
        at: baseAt + 6000,
        version: 'bootstrap-0.4.97',
        decision: {
          kind: 'wait',
          reason: 'wait-for-clear-opportunity',
          displayReason: '收益接近，原地等待更明确目标'
        }
      },
      {
        type: 'combat-frame',
        at: baseAt + 7000,
        version: 'bootstrap-0.4.97',
        decision: {
          kind: 'move',
          reason: 'visible-coin',
          target: {
            type: 'coin',
            id: 123
          }
        },
        nearbyEntities: [
          {
            id: 42,
            name: 'ActiveEnemy',
            mode: 'Active',
            life: 'Alive',
            active: true,
            invulnerable: false,
            distance: 12000
          }
        ]
      },
      {
        type: 'combat-frame',
        at: baseAt + 8000,
        version: 'bootstrap-0.4.97',
        decision: {
          kind: 'attack',
          reason: 'combat-spacing',
          combat: true,
          shoot: true
        },
        nearbyEntities: [
          {
            id: 42,
            name: 'ActiveEnemy',
            mode: 'Active',
            life: 'Alive',
            active: true,
            invulnerable: false,
            distance: 12000
          }
        ]
      }
    ];
    fs.writeFileSync(
      path.join(behaviorLogsDir, 'behavior.jsonl'),
      behaviorEntries.map(entry => JSON.stringify(entry)).join('\n') + '\n'
    );
    const behaviorReport = auditLogs({ dir: behaviorLogsDir, manifestPath });
    cases += 1;
    assertSelfTest(behaviorReport.behaviorEvents.length === 2, `expected 2 behavior events, got ${behaviorReport.behaviorEvents.length}`);
    cases += 1;
    assertSelfTest(issueCount(behaviorReport, 'ambiguous-opportunity-wait') === 1, 'expected one ambiguous opportunity wait issue');
    cases += 1;
    assertSelfTest(issueCount(behaviorReport, 'coin-action-with-active-player-in-range') === 1, 'expected one coin action with active player in range issue');
    cases += 1;
    assertSelfTest(issueCount(behaviorReport, 'missing-top-level-exit') === 0, 'expected behavior issues not to require top-level exit');
    const waitReason = behaviorReport.behaviorReasonCounts.find(item => item.reason === 'wait-for-clear-opportunity') || null;
    cases += 1;
    assertSelfTest(waitReason?.events === 1, `expected 1 wait behavior reason event, got ${waitReason?.events}`);
    const coinReason = behaviorReport.behaviorReasonCounts.find(item => item.reason === 'visible-coin') || null;
    cases += 1;
    assertSelfTest(coinReason?.events === 1, `expected 1 coin behavior reason event, got ${coinReason?.events}`);

    const requiredDelayEntries = [
      {
        type: 'combat-end',
        at: baseAt + 9000,
        version: 'bootstrap-0.4.97',
        decision: {
          kind: 'leave',
          reason: 'stamina-budget-coin-leave',
          displayReason: '1h体力预算不足，退出等待恢复'
        },
        exit: {
          reason: 'stamina-budget-coin-leave',
          summary: 'short stamina delay',
          reloginDelayMs: 60000
        }
      },
      {
        type: 'combat-end',
        at: baseAt + 10000,
        version: 'bootstrap-0.4.97',
        decision: {
          kind: 'leave',
          reason: 'stamina-budget-coin-leave',
          displayReason: '1h体力预算不足，退出等待恢复'
        },
        exit: {
          reason: 'stamina-budget-coin-leave',
          summary: 'full stamina delay',
          reloginDelayMs: 300000
        }
      }
    ];
    fs.writeFileSync(
      path.join(requiredDelayLogsDir, 'required-delay.jsonl'),
      requiredDelayEntries.map(entry => JSON.stringify(entry)).join('\n') + '\n'
    );
    const requiredDelayReport = auditLogs({ dir: requiredDelayLogsDir, manifestPath });
    cases += 1;
    assertSelfTest(requiredDelayReport.exitEvents.length === 2, `expected 2 required-delay exits, got ${requiredDelayReport.exitEvents.length}`);
    cases += 1;
    assertSelfTest(issueCount(requiredDelayReport, 'exit-delay-below-required') === 1, 'expected one exit below reason-specific required delay');
    cases += 1;
    assertSelfTest(requiredDelayReport.exitSafetyCounts.requiredDelayEvents === 2, `expected 2 required-delay events, got ${requiredDelayReport.exitSafetyCounts.requiredDelayEvents}`);
    cases += 1;
    assertSelfTest(requiredDelayReport.exitSafetyCounts.requiredDelayOk === 1, `expected 1 required-delay ok event, got ${requiredDelayReport.exitSafetyCounts.requiredDelayOk}`);
    cases += 1;
    assertSelfTest(requiredDelayReport.exitSafetyCounts.requiredDelayBelowRequired === 1, `expected 1 required-delay below event, got ${requiredDelayReport.exitSafetyCounts.requiredDelayBelowRequired}`);

    console.log(JSON.stringify({ ok: true, cases }, null, 2));
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error(err?.stack || err?.message || String(err));
    process.exitCode = 1;
  });
}

module.exports = { auditLogs, parseArgs, resolveOptions, runSelfTest };
