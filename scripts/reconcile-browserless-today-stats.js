#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const {
  readBrowserlessStateFile,
  updateBrowserlessStateFile
} = require('../src/node/browserless/state-file');

const UTC8_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function usage() {
  return `Usage: node scripts/reconcile-browserless-today-stats.js [options]

Options:
  --day <YYYY-MM-DD>   UTC+8 day. Default: current day
  --cutoff <time>      Inclusive cutoff. Default: now
  --log-dir <dir>      Browserless log root. Default: /var/log/grasp-rat-browserless
  --state-file <file>  State file. Default: /var/lib/grasp-rat-browserless/state.json
  --user-id <id>       Self user id. Default: state session user id
  --apply              Atomically update stats.today; service must be offline
  --self-test          Run a deterministic fixture
  --help               Show this help`;
}

function dayKey(ms = Date.now()) {
  return new Date(Number(ms) + UTC8_OFFSET_MS).toISOString().slice(0, 10);
}

function dayStartMs(day) {
  const parsed = Date.parse(`${day}T00:00:00.000Z`);
  if (!Number.isFinite(parsed)) throw new Error(`invalid day: ${day}`);
  return parsed - UTC8_OFFSET_MS;
}

function parseArgs(argv) {
  const options = {
    day: dayKey(),
    cutoffMs: Date.now(),
    logDir: '/var/log/grasp-rat-browserless',
    stateFile: '/var/lib/grasp-rat-browserless/state.json',
    userId: 0,
    apply: false,
    selfTest: false,
    help: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--day') options.day = String(argv[++index] || '');
    else if (arg === '--cutoff') {
      const parsed = Date.parse(String(argv[++index] || ''));
      if (!Number.isFinite(parsed)) throw new Error('invalid --cutoff');
      options.cutoffMs = parsed;
    } else if (arg === '--log-dir') options.logDir = path.resolve(argv[++index] || '');
    else if (arg === '--state-file') options.stateFile = path.resolve(argv[++index] || '');
    else if (arg === '--user-id') options.userId = Number(argv[++index] || 0);
    else if (arg === '--apply') options.apply = true;
    else if (arg === '--self-test') options.selfTest = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`unknown option: ${arg}`);
  }
  return options;
}

function utcLogDays(startMs, endMs) {
  const output = [];
  let current = Math.floor(startMs / DAY_MS) * DAY_MS;
  const final = Math.floor(endMs / DAY_MS) * DAY_MS;
  while (current <= final) {
    output.push(new Date(current).toISOString().slice(0, 10));
    current += DAY_MS;
  }
  return output;
}

async function eachJsonLine(files, callback) {
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const lines = readline.createInterface({
      input: fs.createReadStream(file),
      crlfDelay: Infinity
    });
    for await (const line of lines) {
      if (!line) continue;
      let entry;
      try {
        entry = JSON.parse(line);
      } catch (_) {
        continue;
      }
      await callback(entry, file);
    }
  }
}

function killEvidence(entry) {
  const decision = entry?.detail?.decision || entry?.detail || {};
  return Array.isArray(decision?.input?.selfKillEvidence) ? decision.input.selfKillEvidence : null;
}

function killKey(item) {
  const target = item?.targetUserId ?? item?.target_user_id ?? item?.targetId ?? item?.id;
  const tick = item?.tick ?? item?.createdTick ?? item?.created_tick;
  if (target === null || target === undefined || target === '') return '';
  return `self-kill:${target}:${tick ?? 'unknown'}`;
}

async function analyzeDay(options) {
  const startMs = dayStartMs(options.day);
  const endMs = Math.min(startMs + DAY_MS - 1, Number(options.cutoffMs));
  if (endMs < startMs) throw new Error('cutoff is before the selected day');
  const days = utcLogDays(startMs, endMs);
  const wsFiles = days.map(day => path.join(options.logDir, day, 'ws.jsonl'));
  const decisionFiles = days.map(day => path.join(options.logDir, day, 'decisions.jsonl'));
  const runs = new Map();
  let previousDrop = null;
  let positiveDropUnits = 0;
  let dropResetCount = 0;
  let selfSamples = 0;
  let firstSelfAt = '';
  let lastSelfAt = '';
  let lastDrop = null;

  await eachJsonLine(wsFiles, entry => {
    const atMs = Date.parse(String(entry?.at || ''));
    if (!Number.isFinite(atMs) || atMs < startMs || atMs > endMs) return;
    const self = entry?.detail?.decodedSummary?.self;
    if (Number(self?.user_id ?? self?.userId) !== Number(options.userId)) return;
    const drop = Number(self?.death_drop_coins ?? self?.drop);
    if (!Number.isFinite(drop)) return;
    const runId = String(entry?.detail?.runId || 'unknown-run');
    const run = runs.get(runId);
    if (!run) runs.set(runId, { runId, firstAtMs: atMs, lastAtMs: atMs });
    else run.lastAtMs = Math.max(run.lastAtMs, atMs);
    if (previousDrop !== null) {
      if (drop >= previousDrop) positiveDropUnits += drop - previousDrop;
      else dropResetCount += 1;
    }
    previousDrop = drop;
    lastDrop = drop;
    selfSamples += 1;
    if (!firstSelfAt) firstSelfAt = entry.at;
    lastSelfAt = entry.at;
  });

  let firstEvidenceAt = '';
  let baseline = null;
  const seenKills = new Set();
  let kills = 0;
  let decisionRows = 0;
  await eachJsonLine(decisionFiles, entry => {
    const atMs = Date.parse(String(entry?.at || ''));
    if (!Number.isFinite(atMs) || atMs < startMs || atMs > endMs) return;
    const evidence = killEvidence(entry);
    if (!evidence) return;
    decisionRows += 1;
    const keys = evidence.map(killKey).filter(Boolean);
    if (!baseline) {
      baseline = new Set(keys);
      for (const key of keys) seenKills.add(key);
      firstEvidenceAt = entry.at;
      return;
    }
    for (const key of keys) {
      if (seenKills.has(key)) continue;
      seenKills.add(key);
      kills += 1;
    }
  });

  const inGameDurationMs = Array.from(runs.values()).reduce((sum, run) => (
    sum + Math.max(0, run.lastAtMs - run.firstAtMs)
  ), 0);
  return {
    day: options.day,
    cutoff: new Date(endMs).toISOString(),
    userId: Number(options.userId),
    files: { ws: wsFiles.filter(fs.existsSync), decisions: decisionFiles.filter(fs.existsSync) },
    evidence: {
      selfSamples,
      decisionRows,
      runCount: runs.size,
      firstSelfAt,
      lastSelfAt,
      firstEvidenceAt,
      initialKillBaselineCount: baseline?.size || 0,
      dropResetCount,
      lastDrop
    },
    stats: {
      uptimeMs: inGameDurationMs,
      coinsGained: positiveDropUnits,
      pickedCoins: positiveDropUnits * 2,
      kills
    }
  };
}

function authoritativeStaminaSpent(state, day) {
  const session = state?.stats?.currentSession || {};
  const lastSeenMs = Date.parse(String(session.lastSeenAt || session.exitedAt || ''));
  if (!Number.isFinite(lastSeenMs) || dayKey(lastSeenMs) !== day) return null;
  const remaining = Number(session.lastStamina1dRemaining);
  const limit = Number(session.lastStamina1dLimit);
  if (!Number.isFinite(remaining) || !Number.isFinite(limit) || limit <= 0) return null;
  return Math.max(0, Math.round(limit - remaining));
}

function reconcileState(state, analysis) {
  const currentToday = state?.stats?.today || {};
  const staminaSpentMs = authoritativeStaminaSpent(state, analysis.day);
  const today = {
    ...currentToday,
    day: analysis.day,
    uptimeMs: Math.max(Number(currentToday.uptimeMs || 0), analysis.stats.uptimeMs),
    coinsGained: Math.max(Number(currentToday.coinsGained || 0), analysis.stats.coinsGained),
    kills: Math.max(Number(currentToday.kills || 0), analysis.stats.kills),
    sessionCount: Math.max(Number(currentToday.sessionCount || 0), analysis.evidence.runCount),
    ...(staminaSpentMs === null ? {} : { staminaSpentMs })
  };
  if (!state?.stats?.currentSession?.online) {
    today.activeSessionId = '';
    today.activeEnteredAt = '';
    today.activeBaseStaminaSpentMs = 0;
    today.activeBaseCoinsGained = 0;
    today.activeBaseKills = 0;
  }
  return {
    ...analysis,
    before: {
      uptimeMs: Number(currentToday.uptimeMs || 0),
      staminaSpentMs: Number(currentToday.staminaSpentMs || 0),
      coinsGained: Number(currentToday.coinsGained || 0),
      pickedCoins: Number(currentToday.coinsGained || 0) * 2,
      kills: Number(currentToday.kills || 0)
    },
    after: {
      uptimeMs: today.uptimeMs,
      staminaSpentMs: Number(today.staminaSpentMs || 0),
      coinsGained: today.coinsGained,
      pickedCoins: today.coinsGained * 2,
      kills: today.kills
    },
    today
  };
}

function assertApplySafe(state, options) {
  if (state?.stats?.currentSession?.online) {
    throw new Error('refusing --apply while currentSession.online=true; stop the service first');
  }
  const stateDay = String(state?.stats?.today?.day || '');
  if (stateDay && stateDay !== options.day) {
    throw new Error(`refusing --apply for ${options.day} because state.stats.today.day is ${stateDay}`);
  }
}

async function runSelfTest() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'grasp-rat-reconcile-'));
  try {
    const logDir = path.join(root, 'logs');
    const dir = path.join(logDir, '2026-07-15');
    fs.mkdirSync(dir, { recursive: true });
    const ws = [
      ['2026-07-15T00:00:00.000Z', 'run-a', 100],
      ['2026-07-15T00:00:10.000Z', 'run-a', 110],
      ['2026-07-15T00:01:00.000Z', 'run-b', 10],
      ['2026-07-15T00:01:20.000Z', 'run-b', 20]
    ].map(([at, runId, drop]) => JSON.stringify({
      at,
      type: 'message',
      detail: { runId, decodedSummary: { self: { user_id: 7, death_drop_coins: drop } } }
    })).join('\n') + '\n';
    const decisions = [
      ['2026-07-15T00:00:00.000Z', [{ targetUserId: 1, tick: 1 }]],
      ['2026-07-15T00:00:05.000Z', [{ targetUserId: 1, tick: 1 }, { targetUserId: 2, tick: 2 }]],
      ['2026-07-15T00:01:05.000Z', [{ targetUserId: 2, tick: 2 }, { targetUserId: 3, tick: 3 }]]
    ].map(([at, selfKillEvidence]) => JSON.stringify({ at, detail: { input: { selfKillEvidence } } })).join('\n') + '\n';
    fs.writeFileSync(path.join(dir, 'ws.jsonl'), ws);
    fs.writeFileSync(path.join(dir, 'decisions.jsonl'), decisions);
    const analysis = await analyzeDay({
      day: '2026-07-15',
      cutoffMs: Date.parse('2026-07-15T07:59:59.000Z'),
      logDir,
      userId: 7
    });
    let mismatchedDayRejected = false;
    try {
      assertApplySafe({
        stats: {
          currentSession: { online: false },
          today: { day: '2026-07-16' }
        }
      }, { day: '2026-07-15' });
    } catch (_) {
      mismatchedDayRejected = true;
    }
    return {
      ok: analysis.stats.coinsGained === 20
        && analysis.stats.pickedCoins === 40
        && analysis.stats.kills === 2
        && analysis.stats.uptimeMs === 30000
        && analysis.evidence.dropResetCount === 1
        && mismatchedDayRejected,
      analysis
    };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  if (options.selfTest) {
    const result = await runSelfTest();
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
    return;
  }
  const state = readBrowserlessStateFile(options.stateFile);
  options.userId = Number(options.userId || state?.session?.userId || 0);
  if (!options.userId) throw new Error('missing user id');
  if (options.apply) assertApplySafe(state, options);
  const analysis = await analyzeDay(options);
  const reconciled = reconcileState(state, analysis);
  if (options.apply) {
    updateBrowserlessStateFile(options.stateFile, {
      stats: {
        ...state.stats,
        today: reconciled.today
      }
    }, { updatedAt: new Date().toISOString() });
  }
  console.log(JSON.stringify({
    ok: true,
    applied: options.apply,
    ...reconciled
  }, null, 2));
}

if (require.main === module) {
  main().catch(error => {
    console.error(error?.stack || error?.message || String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  analyzeDay,
  assertApplySafe,
  authoritativeStaminaSpent,
  dayKey,
  reconcileState,
  runSelfTest
};
