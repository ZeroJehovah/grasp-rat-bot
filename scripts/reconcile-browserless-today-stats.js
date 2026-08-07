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

function staminaEvidence(entry) {
  const decision = entry?.detail?.decision || entry?.detail || {};
  const stamina = decision?.input?.stamina || {};
  const remaining = Number(stamina.stamina1dRemainingMilli ?? stamina.remaining1d ?? stamina.stamina1d);
  const limit = Number(stamina.stamina1dLimitMilli ?? stamina.limit1d ?? stamina.stamina1dLimit);
  if (!Number.isFinite(remaining) || !Number.isFinite(limit) || limit <= 0) return null;
  return { remaining, limit };
}

function exitStaminaEvidence(entry) {
  const response = entry?.detail?.response || {};
  const remaining = Number(response.stamina_1d_remaining_milli ?? response.stamina1dRemainingMilli);
  const limit = Number(response.stamina_1d_limit_milli ?? response.stamina1dLimitMilli);
  if (!Number.isFinite(remaining) || !Number.isFinite(limit) || limit <= 0) return null;
  return { remaining, limit };
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
  const contextDays = utcLogDays(Math.max(0, startMs - DAY_MS), endMs);
  const wsFiles = days.map(day => path.join(options.logDir, day, 'ws.jsonl'));
  const contextWsFiles = contextDays.map(day => path.join(options.logDir, day, 'ws.jsonl'));
  const decisionFiles = days.map(day => path.join(options.logDir, day, 'decisions.jsonl'));
  const exitFiles = days.map(day => path.join(options.logDir, day, 'exits.jsonl'));
  const runnerFiles = contextDays.map(day => path.join(options.logDir, day, 'runner.jsonl'));
  const runs = new Map();
  let previousDrop = null;
  let positiveDropUnits = 0;
  let dropResetCount = 0;
  let selfSamples = 0;
  let firstSelfAt = '';
  let lastSelfAt = '';
  let lastDrop = null;
  let initialDrop = null;
  let maxDrop = null;
  let contextDrop = null;
  let contextTick = null;
  let dayDropPending = false;
  let fallbackPreviousDrop = null;
  let fallbackInitialDrop = null;
  let fallbackMaxDrop = null;
  let fallbackLatestDrop = null;
  let fallbackPositiveDropUnits = 0;
  let fallbackDropResetCount = 0;

  const loginRowsByRunId = new Map();
  const terminalRowsByRunId = new Map();
  await eachJsonLine(runnerFiles, entry => {
    const atMs = Date.parse(String(entry?.at || ''));
    if (!Number.isFinite(atMs) || atMs < startMs - DAY_MS || atMs > endMs) return;
    const runId = String(entry?.detail?.runId || '');
    if (!runId) return;
    if (entry.type === 'source-ip-login-success') {
      const existing = loginRowsByRunId.get(runId);
      if (!existing || atMs < existing.atMs) loginRowsByRunId.set(runId, { runId, atMs, at: entry.at });
      return;
    }
    if (entry.type !== 'runner-stop' && entry.type !== 'runner-finish') return;
    const completedAtMs = Date.parse(String(entry?.detail?.completedAt || ''));
    const terminalAtMs = Number.isFinite(completedAtMs) ? completedAtMs : atMs;
    const rows = terminalRowsByRunId.get(runId) || [];
    rows.push({ runId, atMs: terminalAtMs, loggedAtMs: atMs, at: entry.at, type: entry.type });
    terminalRowsByRunId.set(runId, rows);
  });

  const loginRows = Array.from(loginRowsByRunId.values()).sort((a, b) => a.atMs - b.atMs);
  const runnerSessions = [];
  for (let index = 0; index < loginRows.length; index += 1) {
    const login = loginRows[index];
    const nextLoginAtMs = loginRows[index + 1]?.atMs ?? Infinity;
    const terminal = (terminalRowsByRunId.get(login.runId) || [])
      .filter(row => row.atMs >= login.atMs)
      .sort((a, b) => a.atMs - b.atMs)[0] || null;
    const rawEndMs = Math.min(terminal?.atMs ?? endMs, nextLoginAtMs, endMs);
    const sessionStartMs = Math.max(login.atMs, startMs);
    if (rawEndMs < sessionStartMs || login.atMs > endMs) continue;
    runnerSessions.push({
      runId: login.runId,
      enteredAt: new Date(login.atMs).toISOString(),
      exitedAt: new Date(rawEndMs).toISOString(),
      durationMs: Math.max(0, rawEndMs - sessionStartMs),
      completed: Boolean(terminal && terminal.atMs <= nextLoginAtMs && terminal.atMs <= endMs),
      terminalType: terminal?.type || ''
    });
  }

  function observeFallbackDrop(drop) {
    if (fallbackInitialDrop === null) fallbackInitialDrop = drop;
    fallbackMaxDrop = fallbackMaxDrop === null ? drop : Math.max(fallbackMaxDrop, drop);
    if (fallbackPreviousDrop !== null) {
      if (drop >= fallbackPreviousDrop) fallbackPositiveDropUnits += drop - fallbackPreviousDrop;
      else fallbackDropResetCount += 1;
    }
    fallbackPreviousDrop = drop;
    fallbackLatestDrop = drop;
  }

  function startNewDayDropBaseline(drop) {
    initialDrop = drop;
    maxDrop = drop;
    lastDrop = drop;
    positiveDropUnits = 0;
    dropResetCount = 0;
  }

  await eachJsonLine(contextWsFiles, entry => {
    const atMs = Date.parse(String(entry?.at || ''));
    if (!Number.isFinite(atMs) || atMs > endMs) return;
    const self = entry?.detail?.decodedSummary?.self;
    if (Number(self?.user_id ?? self?.userId) !== Number(options.userId)) return;
    const drop = Number(self?.death_drop_coins ?? self?.drop);
    if (!Number.isFinite(drop)) return;
    const tick = Number(entry?.detail?.decodedSummary?.tick);
    const hasTick = Number.isFinite(tick);
    if (atMs < startMs) {
      contextDrop = drop;
      contextTick = hasTick ? tick : null;
      return;
    }
    const runId = String(entry?.detail?.runId || 'unknown-run');
    const run = runs.get(runId);
    if (!run) runs.set(runId, { runId, firstAtMs: atMs, lastAtMs: atMs });
    else run.lastAtMs = Math.max(run.lastAtMs, atMs);
    if (selfSamples === 0) {
      dayDropPending = contextDrop !== null || contextTick !== null;
      if (dayDropPending) {
        fallbackPreviousDrop = null;
        fallbackInitialDrop = null;
        fallbackMaxDrop = null;
        fallbackLatestDrop = null;
        fallbackPositiveDropUnits = 0;
        fallbackDropResetCount = 0;
        observeFallbackDrop(drop);
        const epochAlreadyReset = hasTick && contextTick !== null && tick < contextTick;
        if (epochAlreadyReset) {
          dayDropPending = false;
          startNewDayDropBaseline(drop);
        }
      } else {
        startNewDayDropBaseline(drop);
      }
    } else if (dayDropPending) {
      observeFallbackDrop(drop);
      const epochReset = hasTick && contextTick !== null && tick < contextTick;
      if (epochReset) {
        dayDropPending = false;
        startNewDayDropBaseline(drop);
      }
    } else {
      if (previousDrop !== null) {
        if (drop >= previousDrop) positiveDropUnits += drop - previousDrop;
        else dropResetCount += 1;
      }
      maxDrop = maxDrop === null ? drop : Math.max(maxDrop, drop);
      lastDrop = drop;
    }
    previousDrop = drop;
    selfSamples += 1;
    if (!firstSelfAt) firstSelfAt = entry.at;
    lastSelfAt = entry.at;
  });

  if (dayDropPending) {
    initialDrop = fallbackInitialDrop;
    maxDrop = fallbackMaxDrop;
    lastDrop = fallbackLatestDrop;
    positiveDropUnits = fallbackPositiveDropUnits;
    dropResetCount = fallbackDropResetCount;
  }

  let firstEvidenceAt = '';
  let baseline = null;
  const seenKills = new Set();
  let kills = 0;
  let decisionRows = 0;
  let staminaSamples = 0;
  let staminaSpentBeforeResetMs = 0;
  let staminaResetCount = 0;
  let lastStamina1dRemaining = null;
  let lastStamina1dLimit = null;
  let lastStamina1dObservedAt = '';
  const exitStaminaEvents = [];
  await eachJsonLine(exitFiles, entry => {
    const atMs = Date.parse(String(entry?.at || ''));
    if (!Number.isFinite(atMs) || atMs < startMs || atMs > endMs) return;
    const stamina = exitStaminaEvidence(entry);
    if (!stamina) return;
    exitStaminaEvents.push({ at: entry.at, atMs, stamina });
  });
  exitStaminaEvents.sort((a, b) => a.atMs - b.atMs);
  function observeStamina(stamina, at) {
    const fullDailyRefill = lastStamina1dRemaining !== null
      && stamina.remaining > lastStamina1dRemaining
      && stamina.remaining >= stamina.limit;
    if (fullDailyRefill) {
      const completedSegmentLimit = lastStamina1dLimit !== null && lastStamina1dLimit > 0
        ? lastStamina1dLimit
        : stamina.limit;
      staminaSpentBeforeResetMs += Math.max(0, completedSegmentLimit - lastStamina1dRemaining);
      staminaResetCount += 1;
    }
    lastStamina1dRemaining = stamina.remaining;
    lastStamina1dLimit = stamina.limit;
    lastStamina1dObservedAt = at;
    staminaSamples += 1;
  }
  let nextExitStaminaIndex = 0;
  await eachJsonLine(decisionFiles, entry => {
    const atMs = Date.parse(String(entry?.at || ''));
    if (!Number.isFinite(atMs) || atMs < startMs || atMs > endMs) return;
    while (nextExitStaminaIndex < exitStaminaEvents.length
      && exitStaminaEvents[nextExitStaminaIndex].atMs <= atMs) {
      const exitEvent = exitStaminaEvents[nextExitStaminaIndex++];
      observeStamina(exitEvent.stamina, exitEvent.at);
    }
    const stamina = staminaEvidence(entry);
    if (stamina) observeStamina(stamina, entry.at);
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
  while (nextExitStaminaIndex < exitStaminaEvents.length) {
    const exitEvent = exitStaminaEvents[nextExitStaminaIndex++];
    observeStamina(exitEvent.stamina, exitEvent.at);
  }

  const wsInGameDurationMs = Array.from(runs.values()).reduce((sum, run) => (
    sum + Math.max(0, run.lastAtMs - run.firstAtMs)
  ), 0);
  const runnerInGameDurationMs = runnerSessions.reduce((sum, session) => sum + session.durationMs, 0);
  const useRunnerSessions = runnerSessions.length > 0;
  const inGameDurationMs = useRunnerSessions ? runnerInGameDurationMs : wsInGameDurationMs;
  const runCount = useRunnerSessions ? runnerSessions.length : runs.size;
  const staminaSpentMs = lastStamina1dRemaining === null || lastStamina1dLimit === null
    ? null
    : Math.max(0, Math.round(staminaSpentBeforeResetMs + lastStamina1dLimit - lastStamina1dRemaining));
  return {
    day: options.day,
    cutoff: new Date(endMs).toISOString(),
    userId: Number(options.userId),
    files: {
      ws: wsFiles.filter(fs.existsSync),
      decisions: decisionFiles.filter(fs.existsSync),
      exits: exitFiles.filter(fs.existsSync),
      runner: runnerFiles.filter(fs.existsSync)
    },
    evidence: {
      selfSamples,
      decisionRows,
      runCount,
      durationSource: useRunnerSessions ? 'runner-login-lifecycle' : 'ws-observation-window',
      runnerSessionCount: runnerSessions.length,
      runnerCompletedSessionCount: runnerSessions.filter(session => session.completed).length,
      runnerOpenSessionCount: runnerSessions.filter(session => !session.completed).length,
      runnerSessions,
      firstSelfAt,
      lastSelfAt,
      firstEvidenceAt,
      initialKillBaselineCount: baseline?.size || 0,
      initialDrop,
      maxDrop,
      dropResetCount,
      lastDrop,
      staminaSamples,
      staminaResetCount,
      lastStamina1dRemaining,
      lastStamina1dLimit,
      lastStamina1dObservedAt
    },
    stats: {
      uptimeMs: inGameDurationMs,
      staminaSpentMs,
      staminaSpentBeforeResetMs: Math.max(0, Math.round(staminaSpentBeforeResetMs)),
      dropUnitsGained: positiveDropUnits,
      coinsGained: positiveDropUnits * 2,
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
  const hasDropEvidence = Number(analysis?.evidence?.selfSamples || 0) > 0;
  const rawAnalyzedStaminaSpentMs = analysis?.stats?.staminaSpentMs;
  const staminaSpentMs = rawAnalyzedStaminaSpentMs !== null
    && rawAnalyzedStaminaSpentMs !== undefined
    && Number.isFinite(Number(rawAnalyzedStaminaSpentMs))
    ? Math.max(0, Math.round(Number(rawAnalyzedStaminaSpentMs)))
    : authoritativeStaminaSpent(state, analysis.day);
  const today = {
    ...currentToday,
    day: analysis.day,
    uptimeMs: Math.max(Number(currentToday.uptimeMs || 0), analysis.stats.uptimeMs),
    coinsGained: hasDropEvidence
      ? analysis.stats.coinsGained
      : Number(currentToday.coinsGained || 0),
    kills: Math.max(Number(currentToday.kills || 0), analysis.stats.kills),
    sessionCount: Math.max(Number(currentToday.sessionCount || 0), analysis.evidence.runCount),
    ...(hasDropEvidence ? {
      initialDrop: analysis.evidence.initialDrop,
      maxDrop: analysis.evidence.maxDrop,
      latestDrop: analysis.evidence.lastDrop,
      dropResetCount: analysis.evidence.dropResetCount,
      crossDayDropPending: null
    } : {}),
    ...(staminaSpentMs === null ? {} : { staminaSpentMs }),
    ...(analysis.evidence.staminaSamples > 0 ? {
      staminaSpentBeforeResetMs: analysis.stats.staminaSpentBeforeResetMs,
      staminaResetCount: analysis.evidence.staminaResetCount,
      lastStamina1dRemaining: analysis.evidence.lastStamina1dRemaining,
      lastStamina1dLimit: analysis.evidence.lastStamina1dLimit,
      lastStamina1dObservedAt: analysis.evidence.lastStamina1dObservedAt
    } : {})
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
      pickedCoins: Number(currentToday.coinsGained || 0),
      kills: Number(currentToday.kills || 0),
      sessionCount: Number(currentToday.sessionCount || 0)
    },
    after: {
      uptimeMs: today.uptimeMs,
      staminaSpentMs: Number(today.staminaSpentMs || 0),
      coinsGained: today.coinsGained,
      pickedCoins: today.coinsGained,
      kills: today.kills,
      sessionCount: today.sessionCount
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
      ['2026-07-15T00:00:00.000Z', 20000000, [{ targetUserId: 1, tick: 1 }]],
      ['2026-07-15T00:00:05.000Z', 19000000, [{ targetUserId: 1, tick: 1 }, { targetUserId: 2, tick: 2 }]],
      ['2026-07-15T00:00:10.000Z', 19500000, null],
      ['2026-07-15T00:00:15.000Z', 18800000, null],
      ['2026-07-15T00:01:05.000Z', 19400000, [{ targetUserId: 2, tick: 2 }, { targetUserId: 3, tick: 3 }]]
    ].map(([at, remaining, selfKillEvidence]) => JSON.stringify({
      at,
      detail: {
        input: {
          ...(selfKillEvidence ? { selfKillEvidence } : {}),
          stamina: { stamina1dRemainingMilli: remaining, stamina1dLimitMilli: 20000000 }
        }
      }
    })).join('\n') + '\n';
    const exits = JSON.stringify({
      at: '2026-07-15T00:01:00.000Z',
      type: 'leave-request-result',
      detail: {
        response: {
          stamina_1d_remaining_milli: 20000000,
          stamina_1d_limit_milli: 20000000
        }
      }
    }) + '\n';
    fs.writeFileSync(path.join(dir, 'ws.jsonl'), ws);
    fs.writeFileSync(path.join(dir, 'decisions.jsonl'), decisions);
    fs.writeFileSync(path.join(dir, 'exits.jsonl'), exits);
    const analysis = await analyzeDay({
      day: '2026-07-15',
      cutoffMs: Date.parse('2026-07-15T07:59:59.000Z'),
      logDir,
      userId: 7
    });
    const reconciled = reconcileState({
      stats: {
        currentSession: { online: false },
        today: { day: '2026-07-15', staminaSpentMs: 600000 }
      }
      }, analysis);
    const crossDayLogDir = path.join(root, 'cross-day-logs');
    const crossDayPreviousDir = path.join(crossDayLogDir, '2026-07-15');
    const crossDayDir = path.join(crossDayLogDir, '2026-07-16');
    fs.mkdirSync(crossDayPreviousDir, { recursive: true });
    fs.mkdirSync(crossDayDir, { recursive: true });
    const crossDayRows = [
      ['2026-07-15T15:59:59.000Z', 2000, 100],
      ['2026-07-15T16:00:01.000Z', 2000, 101],
      ['2026-07-15T16:00:02.000Z', 0, 102],
      ['2026-07-15T16:00:16.000Z', 4000, 10],
      ['2026-07-15T16:00:17.000Z', 4010, 11]
    ].map(([at, drop, tick]) => JSON.stringify({
      at,
      type: 'message',
      detail: {
        runId: 'cross-day-run',
        decodedSummary: { tick, self: { user_id: 7, death_drop_coins: drop } }
      }
    })).join('\n') + '\n';
    fs.writeFileSync(path.join(crossDayPreviousDir, 'ws.jsonl'), crossDayRows.split('\n')[0] + '\n');
    fs.writeFileSync(path.join(crossDayDir, 'ws.jsonl'), crossDayRows.split('\n').slice(1).join('\n'));
    const crossDayAnalysis = await analyzeDay({
      day: '2026-07-16',
      cutoffMs: Date.parse('2026-07-16T07:59:59.000Z'),
      logDir: crossDayLogDir,
      userId: 7
    });
    const runnerOnlyLogDir = path.join(root, 'runner-only-logs');
    const runnerOnlyDir = path.join(runnerOnlyLogDir, '2026-07-15');
    fs.mkdirSync(runnerOnlyDir, { recursive: true });
    const runnerRows = [
      {
        at: '2026-07-15T00:00:00.000Z',
        type: 'source-ip-login-success',
        detail: { runId: 'runner-a' }
      },
      {
        at: '2026-07-15T00:10:01.000Z',
        type: 'runner-stop',
        detail: { runId: 'runner-a', completedAt: '2026-07-15T00:10:00.000Z' }
      },
      {
        at: '2026-07-15T00:15:00.000Z',
        type: 'runner-stop',
        detail: { runId: 'failed-before-login', completedAt: '2026-07-15T00:15:00.000Z' }
      },
      {
        at: '2026-07-15T00:20:00.000Z',
        type: 'source-ip-login-success',
        detail: { runId: 'runner-b' }
      },
      {
        at: '2026-07-15T00:40:01.000Z',
        type: 'runner-finish',
        detail: { runId: 'runner-b', completedAt: '2026-07-15T00:40:00.000Z' }
      },
      {
        at: '2026-07-15T00:50:00.000Z',
        type: 'source-ip-login-success',
        detail: { runId: 'runner-c' }
      }
    ].map(row => JSON.stringify(row)).join('\n') + '\n';
    fs.writeFileSync(path.join(runnerOnlyDir, 'runner.jsonl'), runnerRows);
    const runnerOnlyAnalysis = await analyzeDay({
      day: '2026-07-15',
      cutoffMs: Date.parse('2026-07-15T01:00:00.000Z'),
      logDir: runnerOnlyLogDir,
      userId: 7
    });
    const runnerOnlyReconciled = reconcileState({
      stats: {
        currentSession: { online: false },
        today: {
          day: '2026-07-15',
          uptimeMs: 1234,
          staminaSpentMs: 5678,
          coinsGained: 980,
          kills: 50,
          sessionCount: 1,
          initialDrop: 5238,
          maxDrop: 5728,
          latestDrop: 5728,
          dropResetCount: 2,
          crossDayDropPending: { drop: 5728 }
        }
      }
    }, runnerOnlyAnalysis);
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
      ok: analysis.stats.dropUnitsGained === 20
        && analysis.stats.coinsGained === 40
        && analysis.stats.pickedCoins === 40
        && analysis.stats.kills === 2
        && analysis.stats.staminaSpentMs === 1800000
        && analysis.stats.staminaSpentBeforeResetMs === 1200000
        && analysis.evidence.staminaResetCount === 1
        && reconciled.today.staminaSpentMs === 1800000
        && reconciled.today.staminaSpentBeforeResetMs === 1200000
        && analysis.stats.uptimeMs === 30000
        && analysis.evidence.dropResetCount === 1
        && crossDayAnalysis.evidence.initialDrop === 4000
        && crossDayAnalysis.evidence.maxDrop === 4010
        && crossDayAnalysis.evidence.lastDrop === 4010
        && crossDayAnalysis.stats.dropUnitsGained === 10
        && crossDayAnalysis.stats.coinsGained === 20
        && crossDayAnalysis.evidence.dropResetCount === 0
        && runnerOnlyAnalysis.stats.uptimeMs === 2400000
        && runnerOnlyAnalysis.evidence.durationSource === 'runner-login-lifecycle'
        && runnerOnlyAnalysis.evidence.runCount === 3
        && runnerOnlyAnalysis.evidence.runnerCompletedSessionCount === 2
        && runnerOnlyAnalysis.evidence.runnerOpenSessionCount === 1
        && runnerOnlyReconciled.today.uptimeMs === 2400000
        && runnerOnlyReconciled.today.sessionCount === 3
        && runnerOnlyReconciled.today.coinsGained === 980
        && runnerOnlyReconciled.today.initialDrop === 5238
        && runnerOnlyReconciled.today.maxDrop === 5728
        && runnerOnlyReconciled.today.latestDrop === 5728
        && runnerOnlyReconciled.today.dropResetCount === 2
        && runnerOnlyReconciled.today.crossDayDropPending?.drop === 5728
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
