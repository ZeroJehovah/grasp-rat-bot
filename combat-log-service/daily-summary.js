#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_DIR = path.join(__dirname, 'logs');

function parseArgs(args) {
  const out = {
    dir: DEFAULT_DIR,
    day: '',
    json: false,
    selfTest: false
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--dir') out.dir = path.resolve(args[++i] || out.dir);
    else if (arg === '--day') out.day = String(args[++i] || '');
    else if (arg === '--json') out.json = true;
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
  console.log(`Usage: node daily-summary.js [options]

Options:
  --dir <dir>   Log root directory. Default: ./logs
  --day <day>   Day directory, e.g. 2026-06-13. Default: latest day
  --json        Print machine-readable JSON
  --self-test   Run daily-summary regression checks
`);
}

function latestDay(root) {
  const days = fs.existsSync(root)
    ? fs.readdirSync(root, { withFileTypes: true })
      .filter(item => item.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(item.name))
      .map(item => item.name)
      .sort()
    : [];
  return days[days.length - 1] || '';
}

function listJsonlFiles(dayDir) {
  if (!fs.existsSync(dayDir)) return [];
  return fs.readdirSync(dayDir, { withFileTypes: true })
    .filter(item => item.isFile() && item.name.endsWith('.jsonl'))
    .map(item => path.join(dayDir, item.name))
    .sort();
}

function readEntries(dayDir) {
  const entries = [];
  for (const file of listJsonlFiles(dayDir)) {
    const lines = fs.readFileSync(file, 'utf8').split(/\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index].trim();
      if (!line) continue;
      try {
        const entry = JSON.parse(line);
        entries.push({
          ...entry,
          __file: path.basename(file),
          __line: index + 1,
          __at: Number(entry.at || entry.receivedAt || 0) || 0
        });
      } catch (err) {
        entries.push({
          type: 'parse-error',
          error: err.message || String(err),
          __file: path.basename(file),
          __line: index + 1,
          __at: 0
        });
      }
    }
  }
  entries.sort((a, b) => a.__at - b.__at || String(a.__file).localeCompare(String(b.__file)) || a.__line - b.__line);
  return entries;
}

function number(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function sessionScore(session) {
  return (number(session.exitAt) ? 10 ** 15 : 0)
    + number(session.updatedAt)
    + number(session.loginDurationMs)
    + number(session.staminaSpentMs)
    + number(session.coinsGained)
    + number(session.killRewardCoins);
}

function mergeSession(previous, next) {
  if (!previous) return { ...next };
  const base = sessionScore(next) >= sessionScore(previous) ? { ...previous, ...next } : { ...next, ...previous };
  for (const key of ['exitReason', 'exitSummary', 'version', 'sourceHash']) {
    if (!base[key]) base[key] = previous[key] || next[key] || '';
  }
  if (!base.exitAt) base.exitAt = previous.exitAt || next.exitAt || 0;
  if (!base.loginAt) base.loginAt = previous.loginAt || next.loginAt || 0;
  return base;
}

function killKey(kill) {
  return [
    number(kill.at),
    kill.id ?? '',
    kill.name || kill.victim || '',
    number(kill.rewardCoins),
    kill.source || '',
    kill.dropMatched ? 'drop' : ''
  ].join('|');
}

function normalizeKill(kill) {
  if (!kill || typeof kill !== 'object') return null;
  return {
    at: number(kill.at),
    time: kill.time || '',
    name: kill.name || kill.victim || '',
    id: kill.id ?? kill.userId ?? null,
    rewardCoins: Number.isFinite(Number(kill.rewardCoins ?? kill.drop)) ? Math.max(0, Math.round(Number(kill.rewardCoins ?? kill.drop))) : 0,
    matchedAttack: Boolean(kill.matchedAttack),
    dropMatched: Boolean(kill.dropMatched),
    chatConfirmed: Boolean(kill.chatConfirmed),
    source: kill.source || '',
    attackDistance: Number.isFinite(Number(kill.attackDistance)) ? Math.round(Number(kill.attackDistance)) : null
  };
}

function mergeKillLists(sessionKills, eventKills) {
  const map = new Map();
  for (const kill of [...(sessionKills || []), ...(eventKills || [])].map(normalizeKill).filter(Boolean)) {
    const key = killKey(kill);
    const previous = map.get(key);
    map.set(key, previous ? { ...previous, ...kill } : kill);
  }
  return Array.from(map.values()).sort((a, b) => number(a.at) - number(b.at));
}

function reasonText(reason, summary) {
  const text = String(summary || reason || '');
  if (!text) return '未记录退出';
  if (/game session missing self|no-self/i.test(text) || /game session missing self|no-self/i.test(reason || '')) {
    return '已登录但自身实体不可见，退出等待重连';
  }
  return text
    .replace(/，退出等待重连/g, '')
    .replace(/1h体力预算不足，/g, '1h预算不足：')
    .replace(/1d体力到达限制/g, '1d体力耗尽')
    .replace(/WebSocket 反复重连/g, 'WS反复重连')
    .replace(/WebSocket 离线/g, 'WS离线');
}

function buildExitEvents(entries) {
  const groups = new Map();
  for (const entry of entries.filter(item => item.type === 'exit-audit')) {
    const id = entry.exitAuditId || `${entry.__file}:${entry.__line}`;
    const current = groups.get(id) || {
      id,
      firstAt: entry.__at,
      lastAt: entry.__at,
      confirmedAt: 0,
      reason: '',
      summary: '',
      version: '',
      files: new Set()
    };
    current.firstAt = Math.min(current.firstAt, entry.__at);
    current.lastAt = Math.max(current.lastAt, entry.__at);
    current.confirmedAt = Math.max(current.confirmedAt, number(entry.confirmedAt));
    current.reason = entry.reason || current.reason;
    current.summary = entry.summary || current.summary;
    current.version = entry.version || current.version;
    current.files.add(entry.__file);
    groups.set(id, current);
  }
  return Array.from(groups.values()).sort((a, b) => a.firstAt - b.firstAt);
}

function buildReport(entries, options = {}) {
  const importantEventsById = new Map();
  for (const entry of entries.filter(item => item.type === 'important-log')) {
    const id = entry.importantLogId || `${entry.__file}:${entry.__line}`;
    const previous = importantEventsById.get(id);
    if (!previous || number(entry.__at) >= number(previous.__at)) importantEventsById.set(id, entry);
  }
  const importantEvents = Array.from(importantEventsById.values()).sort((a, b) => a.__at - b.__at);
  const sessions = new Map();
  const killEvents = new Map();
  for (const event of importantEvents) {
    if (event.session && event.session.sessionId) {
      sessions.set(event.session.sessionId, mergeSession(sessions.get(event.session.sessionId), event.session));
    }
    if (event.importantType === 'kill' && event.sessionId && event.kill) {
      const list = killEvents.get(event.sessionId) || [];
      list.push(event.kill);
      killEvents.set(event.sessionId, list);
    }
  }
  const exitEvents = buildExitEvents(entries);
  const sessionList = Array.from(sessions.values()).sort((a, b) => number(a.loginAt) - number(b.loginAt));
  for (let i = 0; i < sessionList.length; i += 1) {
    const session = sessionList[i];
    const nextLoginAt = number(sessionList[i + 1]?.loginAt, Infinity);
    const kills = mergeKillLists(session.kills || [], killEvents.get(session.sessionId) || []);
    session.kills = kills;
    session.rewardKillCount = kills.filter(kill => number(kill.rewardCoins) > 0).length;
    session.attributedKillRewardCoins = kills.reduce((sum, kill) => sum + number(kill.rewardCoins), 0);
    session.dropMatchedKillCount = kills.filter(kill => kill.dropMatched).length;
    session.chatConfirmedKillCount = kills.filter(kill => kill.chatConfirmed).length;
    if (!number(session.exitAt)) {
      const exit = exitEvents.find(item => item.firstAt >= number(session.loginAt) && item.firstAt < nextLoginAt);
      if (exit) {
        session.inferredExit = true;
        session.exitAt = exit.confirmedAt || exit.lastAt || exit.firstAt;
        session.exitReason = exit.reason;
        session.exitSummary = exit.summary;
        session.loginDurationMs = Math.max(0, session.exitAt - number(session.loginAt));
      } else if (Number.isFinite(nextLoginAt)) {
        session.incomplete = true;
        session.nextLoginAt = nextLoginAt;
      } else {
        session.incomplete = true;
      }
    }
  }
  const completed = sessionList.filter(item => number(item.exitAt) && !item.inferredExit);
  return {
    day: options.day || '',
    entries: entries.length,
    files: Array.from(new Set(entries.map(item => item.__file))).sort(),
    sessions: sessionList,
    totals: {
      sessions: sessionList.length,
      completed: completed.length,
      incomplete: sessionList.length - completed.length,
      loginDurationMs: completed.reduce((sum, item) => sum + number(item.loginDurationMs), 0),
      staminaSpentMs: completed.reduce((sum, item) => sum + number(item.staminaSpentMs), 0),
      coinsGained: completed.reduce((sum, item) => sum + number(item.coinsGained), 0),
      killRewardCoins: completed.reduce((sum, item) => sum + number(item.killRewardCoins), 0),
      attributedKillRewardCoins: completed.reduce((sum, item) => sum + number(item.attributedKillRewardCoins), 0),
      rewardKillCount: completed.reduce((sum, item) => sum + number(item.rewardKillCount), 0)
    }
  };
}

function formatTime(ms) {
  if (!ms) return '-';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date(ms));
}

function formatDuration(ms) {
  let seconds = Math.max(0, Math.round(number(ms) / 1000));
  const hours = Math.floor(seconds / 3600);
  seconds -= hours * 3600;
  const minutes = Math.floor(seconds / 60);
  seconds -= minutes * 60;
  return hours ? `${hours}h${String(minutes).padStart(2, '0')}m` : `${minutes}m${String(seconds).padStart(2, '0')}s`;
}

function formatVersion(version) {
  return String(version || '-').replace(/^bootstrap-0\./, '.');
}

function printReport(report) {
  console.log(`Day: ${report.day || '-'}; files=${report.files.length}; entries=${report.entries}`);
  console.log('| # | 登录-退出 | 时长 | 版本 | 收益/体力 | 会话击杀奖励 | 归因击杀 | 退出/状态 |');
  console.log('|---:|---|---:|---|---:|---:|---:|---|');
  report.sessions.forEach((session, index) => {
    const exit = number(session.exitAt) ? formatTime(session.exitAt) : '未记录';
    const status = session.inferredExit
      ? `未记录退出；${reasonText(session.exitReason, session.exitSummary)}（推断）`
      : session.incomplete && !number(session.exitAt)
      ? (session.nextLoginAt ? `未记录退出；下一次登录 ${formatDuration(session.nextLoginAt - number(session.loginAt))} 后出现` : '未记录退出')
      : reasonText(session.exitReason, session.exitSummary);
    console.log(`| ${index + 1} | ${formatTime(session.loginAt)}-${exit} | ${formatDuration(session.loginDurationMs)} | ${formatVersion(session.version)} | ${number(session.coinsGained)}币/${Math.round(number(session.staminaSpentMs) / 1000)}s | ${number(session.killRewardCoins)} | ${number(session.rewardKillCount)}次/${number(session.attributedKillRewardCoins)}币 | ${status} |`);
  });
  console.log('');
  console.log(`Totals: completed=${report.totals.completed}/${report.totals.sessions}, duration=${formatDuration(report.totals.loginDurationMs)}, coins=${report.totals.coinsGained}, stamina=${Math.round(report.totals.staminaSpentMs / 1000)}s, sessionKillRewards=${report.totals.killRewardCoins}, attributedKills=${report.totals.rewardKillCount}/${report.totals.attributedKillRewardCoins}`);
}

function assertSelfTest(condition, message) {
  if (!condition) throw new Error(message);
}

function writeJsonl(file, entries) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, entries.map(entry => JSON.stringify(entry)).join('\n') + '\n');
}

function runSelfTest() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'grasp-rat-daily-'));
  const day = '2026-06-13';
  const dayDir = path.join(root, day);
  const s1 = 'session-a';
  const s2 = 'session-b';
  writeJsonl(path.join(dayDir, 'important.jsonl'), [
    {
      type: 'important-log',
      importantType: 'session-start',
      importantLogId: `${s1}:start`,
      at: 1000,
      sessionId: s1,
      session: { sessionId: s1, loginAt: 1000, version: 'bootstrap-0.4.140', staminaSpentMs: 0, coinsGained: 0 }
    },
    {
      type: 'important-log',
      importantType: 'session-start',
      importantLogId: `${s2}:start`,
      at: 10000,
      sessionId: s2,
      session: { sessionId: s2, loginAt: 10000, version: 'bootstrap-0.4.140', staminaSpentMs: 0, coinsGained: 0 }
    },
    {
      type: 'important-log',
      importantType: 'session-start',
      importantLogId: 'session-c:start',
      at: 20000,
      sessionId: 'session-c',
      session: { sessionId: 'session-c', loginAt: 20000, version: 'bootstrap-0.4.140', staminaSpentMs: 0, coinsGained: 0 }
    }
  ]);
  writeJsonl(path.join(dayDir, 'combat.jsonl'), [
    {
      type: 'important-log',
      importantType: 'session-end',
      importantLogId: `${s1}:end`,
      at: 5000,
      sessionId: s1,
      exitReason: 'leave-success:sustained pursuit',
      exitSummary: '被Wen持续追击，持续2分钟，距离218米，退出等待重连',
      session: {
        sessionId: s1,
        loginAt: 1000,
        exitAt: 5000,
        loginDurationMs: 4000,
        staminaSpentMs: 123000,
        coinsGained: 7,
        killRewardCoins: 0,
        version: 'bootstrap-0.4.141'
      }
    }
  ]);
  const report = buildReport(readEntries(dayDir), { day });
  assertSelfTest(report.sessions.length === 3, `expected 3 sessions, got ${report.sessions.length}`);
  assertSelfTest(report.sessions[0].exitAt === 5000, 'cross-file session-end was not merged');
  assertSelfTest(report.sessions[0].staminaSpentMs === 123000, 'cross-file stamina was not preserved');
  assertSelfTest(report.sessions[1].incomplete === true, 'unclosed middle session was not marked incomplete');
  assertSelfTest(report.sessions[1].nextLoginAt === 20000, 'next-login context missing for incomplete session');
  fs.rmSync(root, { recursive: true, force: true });
  console.log('daily-summary self-test passed');
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.selfTest) {
    runSelfTest();
    return;
  }
  const day = options.day || latestDay(options.dir);
  if (!day) throw new Error(`No day directories found under ${options.dir}`);
  const dayDir = path.join(options.dir, day);
  const report = buildReport(readEntries(dayDir), { day });
  if (options.json) console.log(JSON.stringify(report, null, 2));
  else printReport(report);
}

if (require.main === module) main();

module.exports = {
  buildReport,
  readEntries,
  parseArgs,
  reasonText
};
