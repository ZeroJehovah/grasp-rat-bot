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
    number(kill.targetDropCoins),
    kill.source || '',
    kill.dropMatched ? 'drop' : ''
  ].join('|');
}

function normalizeKill(kill) {
  if (!kill || typeof kill !== 'object') return null;
  const playerCategory = normalizePlayerCategory(kill);
  const rawRewardCoins = Number.isFinite(Number(kill.rewardCoins ?? kill.drop)) ? Math.max(0, Math.round(Number(kill.rewardCoins ?? kill.drop))) : 0;
  const targetDropCoins = Number.isFinite(Number(kill.targetDrop ?? kill.drop ?? kill.rewardCoins)) ? Math.max(0, Math.round(Number(kill.targetDrop ?? kill.drop ?? kill.rewardCoins))) : 0;
  const rewardConfirmed = Boolean(kill.rewardConfirmed || kill.dropMatched);
  const rewardCoins = rewardConfirmed ? rawRewardCoins : 0;
  return {
    at: number(kill.at),
    time: kill.time || '',
    name: kill.name || kill.victim || '',
    id: kill.id ?? kill.userId ?? null,
    rewardCoins,
    reportedRewardCoins: rawRewardCoins,
    targetDropCoins,
    unconfirmedDropCoins: rewardConfirmed ? 0 : Math.max(targetDropCoins, rawRewardCoins),
    rewardConfirmed,
    playerCategory,
    afk: playerCategory === 'afk',
    active: playerCategory === 'active',
    combat: Boolean(kill.combat),
    combatIntent: kill.combatIntent || '',
    mode: kill.mode || kill.current_join_mode || '',
    matchedAttack: Boolean(kill.matchedAttack),
    dropMatched: Boolean(kill.dropMatched),
    chatConfirmed: Boolean(kill.chatConfirmed),
    source: kill.source || '',
    attackDistance: Number.isFinite(Number(kill.attackDistance)) ? Math.round(Number(kill.attackDistance)) : null
  };
}

function normalizePlayerCategory(item) {
  if (!item || typeof item !== 'object') return 'unknown';
  const explicit = String(item.playerCategory || item.killCategory || '').toLowerCase();
  if (explicit === 'active' || explicit === 'afk') return explicit;
  const activeSignal = Boolean(item.combat || item.active || item.currentlyActive || item.firing || item.moving);
  if (explicit && explicit !== 'unknown') return 'unknown';
  if (activeSignal) return 'active';
  if (explicit === 'unknown') return 'unknown';
  if (item.afk === false) return 'active';
  if (item.afk === true || item.matchedAttack || item.dropMatched || item.chatConfirmed) return 'afk';
  return 'unknown';
}

function killBucketSummary(kills) {
  const summary = {
    afk: { count: 0, rewardCoins: 0, unconfirmedCount: 0, unconfirmedDropCoins: 0 },
    active: { count: 0, rewardCoins: 0, unconfirmedCount: 0, unconfirmedDropCoins: 0 },
    unknown: { count: 0, rewardCoins: 0, unconfirmedCount: 0, unconfirmedDropCoins: 0 }
  };
  for (const kill of kills || []) {
    const bucket = normalizePlayerCategory(kill);
    const key = bucket === 'active' || bucket === 'afk' ? bucket : 'unknown';
    if (kill.rewardConfirmed) summary[key].count += 1;
    else summary[key].unconfirmedCount += 1;
    summary[key].rewardCoins += number(kill.rewardCoins);
    summary[key].unconfirmedDropCoins += number(kill.unconfirmedDropCoins);
  }
  return summary;
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

function combatScore(combat) {
  return (number(combat.endedAt) ? 10 ** 15 : 0)
    + number(combat.updatedAt)
    + number(combat.durationMs)
    + number(combat.sampleCount)
    + number(combat.staminaSpentMs);
}

function normalizeCombat(combat) {
  if (!combat || typeof combat !== 'object') return null;
  const enemy = combat.enemy && typeof combat.enemy === 'object' ? combat.enemy : {};
  const startedAt = number(combat.startedAt);
  const endedAt = number(combat.endedAt);
  return {
    combatSummaryId: combat.combatSummaryId || '',
    sessionId: combat.sessionId || '',
    userId: combat.userId ?? null,
    enemy: {
      id: enemy.id ?? enemy.user_id ?? null,
      name: enemy.name || enemy.label || '',
      mode: enemy.mode || enemy.current_join_mode || '',
      drop: Number.isFinite(Number(enemy.drop)) ? Math.max(0, Math.round(Number(enemy.drop))) : null
    },
    enemyKey: combat.enemyKey || '',
    startedAt,
    endedAt,
    durationMs: number(combat.durationMs, endedAt && startedAt ? endedAt - startedAt : 0),
    staminaSpentMs: Math.max(0, Math.round(number(combat.staminaSpentMs))),
    selfHpStart: Number.isFinite(Number(combat.selfHpStart)) ? Number(combat.selfHpStart) : null,
    selfHpEnd: Number.isFinite(Number(combat.selfHpEnd)) ? Number(combat.selfHpEnd) : null,
    selfHpDelta: Number.isFinite(Number(combat.selfHpDelta)) ? Number(combat.selfHpDelta) : null,
    enemyHpStart: Number.isFinite(Number(combat.enemyHpStart)) ? Number(combat.enemyHpStart) : null,
    enemyHpEnd: Number.isFinite(Number(combat.enemyHpEnd)) ? Number(combat.enemyHpEnd) : null,
    enemyHpDelta: Number.isFinite(Number(combat.enemyHpDelta)) ? Number(combat.enemyHpDelta) : null,
    result: combat.result || '',
    resultReason: combat.resultReason || '',
    kill: combat.kill || null,
    startReason: combat.startReason || '',
    lastReason: combat.lastReason || '',
    startedWithExitOnly: Boolean(combat.startedWithExitOnly),
    engagementObserved: combat.engagementObserved === true,
    sampleCount: Math.max(0, Math.round(number(combat.sampleCount))),
    version: combat.version || '',
    sourceHash: combat.sourceHash || '',
    updatedAt: number(combat.updatedAt)
  };
}

function mergeCombat(previous, next) {
  const normalized = normalizeCombat(next);
  if (!normalized) return previous || null;
  if (!previous) return normalized;
  return combatScore(normalized) >= combatScore(previous)
    ? { ...previous, ...normalized, enemy: { ...(previous.enemy || {}), ...(normalized.enemy || {}) } }
    : { ...normalized, ...previous, enemy: { ...(normalized.enemy || {}), ...(previous.enemy || {}) } };
}

function combatReasonIsExitOnly(reason) {
  return /leave|exit|offline|pursuit|injury|stamina|login|no-self|not-alive|paused|cloudflare|control-ws|flee|recover/i.test(String(reason || ''));
}

function combatReasonIsNonCombatSafety(reason) {
  const value = String(reason || '').toLowerCase();
  return /^(avoid-invulnerable-target|recovery-avoid-humans|passive-panic-distance|active-threat-before-bullet-range|active-threat-caution-migration|active-threat-return-block|return-block-lateral-scan)$/.test(value);
}

function combatIsNonCombatSafetyClosure(combat) {
  if (!combat || combat.kill) return false;
  return combatReasonIsNonCombatSafety(combat.resultReason);
}

function combatHasActualEngagement(combat) {
  if (!combat) return false;
  if (combat.kill) return true;
  if (combat.engagementObserved === true) return true;
  if (number(combat.enemyHpDelta) < 0 || number(combat.selfHpDelta) < 0) return true;
  if (!combatReasonIsExitOnly(combat.startReason)) return true;
  if (number(combat.sampleCount) > 1 && !combatReasonIsExitOnly(combat.lastReason)) return true;
  return false;
}

function stripReconnectSuffix(text) {
  const value = String(text || '').trim();
  const suffix = '，退出等待重连';
  return value.endsWith(suffix) ? value.slice(0, value.length - suffix.length) : value;
}

function legacyDurationText(text) {
  const value = String(text || '').trim();
  const milliseconds = value.match(/^(\d+(?:\.\d+)?)ms$/i);
  if (milliseconds) return `${milliseconds[1]}毫秒`;
  return value;
}

function knownReasonText(reason) {
  const value = String(reason || '').toLowerCase();
  if (!value) return '';
  if (/session-interrupted-before-next-login/.test(value)) return '下一次登录时发现上一局已结束，按下一次登录时间收口';
  if (/no-self|game session missing self/.test(value)) return '已登录但自身实体不可见，退出等待重连';
  if (/stamina-budget/.test(value)) return '一小时体力预算不足，退出等待恢复';
  if (/stamina exhausted|stamina-exhausted/.test(value)) return '一天体力耗尽';
  if (/combat hp disadvantage|combat-hp-disadvantage/.test(value)) return '战斗血量劣势，主动退出';
  if (/combat low hp|combat-low-hp/.test(value)) return '战斗低血风险，主动退出';
  if (/injury/.test(value)) return '受伤后主动退出';
  if (/pursuit|sustained pursuit/.test(value)) return '被持续追击，主动退出';
  if (/reconnect churn/.test(value)) return '网络连接反复重连，主动退出';
  if (/offline|websocket|control-ws/.test(value)) return '网络连接离线，主动退出';
  if (/leave-success|exit-confirmed/.test(value)) return '主动退出';
  return '';
}

function parsedCombatExitSummary(text) {
  const value = stripReconnectSuffix(text);
  let match = value.match(/^与(.+?)战斗，近身弹压下血量([^，]+)，对方(?:HP|血量)\s*([^，]+)，差距([^，]+)(?:，距离([^，]+))?，提前劣势退出$/);
  if (match) {
    const [, name, selfHp, targetHp, gap, distance] = match;
    return `与${name}战斗，近身弹压下血量${selfHp}，对方血量${targetHp}，差距${gap}${distance ? `，距离${distance}` : ''}，提前劣势退出`;
  }
  match = value.match(/^与(.+?)战斗，血量([^，]+)，对方(?:HP|血量)\s*([^，]+)，差距([^，]+)，劣势退出$/);
  if (match) {
    const [, name, selfHp, targetHp, gap] = match;
    return `与${name}战斗，血量${selfHp}，对方血量${targetHp}，差距${gap}，劣势退出`;
  }
  match = value.match(/^与(.+?)战斗，血量([^，]+)，对方(?:HP|血量)\s*([^，]+)(，\d+秒未造成伤害)?，低血久攻未中退出$/);
  if (match) {
    const [, name, selfHp, targetHp, noDamageText = ''] = match;
    return `与${name}战斗，血量${selfHp}，对方血量${targetHp}${noDamageText}，低血久攻未中退出`;
  }
  match = value.match(/^与(.+?)战斗，血量([^，]+)不足([^，]+)，对方(?:HP|血量)\s*([^，]+)(?:，距离([^，]+))?，低血近身风险退出$/);
  if (match) {
    const [, name, selfHp, threshold, targetHp, distance] = match;
    return `与${name}战斗，血量${selfHp}不足${threshold}，对方血量${targetHp}${distance ? `，距离${distance}` : ''}，低血近身风险退出`;
  }
  match = value.match(/^与(.+?)战斗，血量([^，]+)不足([^，]+)，对方(?:HP|血量)\s*([^，]+)，劣势退出$/);
  if (match) {
    const [, name, selfHp, threshold, targetHp] = match;
    return `与${name}战斗，血量${selfHp}不足${threshold}，对方血量${targetHp}，劣势退出`;
  }
  match = value.match(/^与(.+?)战斗，血量([^，]+)低于([^，]+)，紧急退出$/);
  if (match) {
    const [, name, selfHp, threshold] = match;
    return `与${name}战斗，血量${selfHp}低于${threshold}，紧急退出`;
  }
  return '';
}

function parsedStaminaExitSummary(text) {
  const value = stripReconnectSuffix(text);
  let match = value.match(/^(?:1h体力预算不足|1h预算不足|一小时体力预算不足|一小时预算不足)[，：:]最近金币距离([^，]+)，预算([^，]+)，需要([^，]+)，差([^，]+)$/);
  if (match) {
    const [, distance, budget, required, shortage] = match;
    return `一小时体力预算不足：最近金币距离${distance}，预算${legacyDurationText(budget)}，需要${legacyDurationText(required)}，差${legacyDurationText(shortage)}`;
  }
  if (/^(?:1h体力不足以拾取最近金币|一小时体力不足以拾取最近金币)/.test(value)) {
    return '一小时体力不足以拾取最近金币';
  }
  if (/^(?:1d体力到达限制|1d体力耗尽|一天体力到达限制|一天体力耗尽)/.test(value)) {
    return '一天体力耗尽';
  }
  if (/^(?:1h\/1d体力到达限制|一小时和一天体力到达限制)/.test(value)) {
    return '一小时和一天体力均已到达限制';
  }
  return '';
}

function parsedNetworkExitSummary(text) {
  const value = stripReconnectSuffix(text);
  if (/WebSocket\s*反复重连|网络连接反复重连/.test(value)) return '网络连接反复重连，主动退出';
  if (/WebSocket\s*离线且周围危险|网络连接离线且周围危险/.test(value)) return '网络连接离线且周围危险，主动退出';
  if (/WebSocket\s*离线|网络连接离线/.test(value)) return '网络连接离线，主动退出';
  return '';
}

function reasonText(reason, summary) {
  const text = String(summary || reason || '');
  const reasonValue = String(reason || '').toLowerCase();
  if (!text) return '原因未记录';
  if (/session-interrupted-before-next-login/.test(reasonValue) || /上次登录未记录退出|下一次登录时发现上一局已结束/.test(text)) {
    return '下一次登录时发现上一局已结束，按下一次登录时间收口';
  }
  if (/game session missing self|no-self/i.test(text) || /game session missing self|no-self/i.test(reason || '')) {
    return '已登录但自身实体不可见，退出等待重连';
  }
  const parsed = parsedCombatExitSummary(text) || parsedStaminaExitSummary(text) || parsedNetworkExitSummary(text);
  if (parsed) return parsed;
  const fallback = stripReconnectSuffix(text);
  if (/[\u4e00-\u9fff]/.test(fallback) && !/[A-Za-z][A-Za-z -]*:/.test(fallback)) return fallback;
  return knownReasonText(reason) || knownReasonText(summary) || '原因未归类';
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
  const combats = new Map();
  for (const event of importantEvents) {
    if (event.session && event.session.sessionId) {
      sessions.set(event.session.sessionId, mergeSession(sessions.get(event.session.sessionId), event.session));
    }
    if (event.importantType === 'kill' && event.sessionId && event.kill) {
      const list = killEvents.get(event.sessionId) || [];
      list.push(event.kill);
      killEvents.set(event.sessionId, list);
    }
    if (event.importantType === 'combat-summary' && event.combat) {
      const combat = normalizeCombat(event.combat);
      if (combat?.combatSummaryId && combatHasActualEngagement(combat) && !combatIsNonCombatSafetyClosure(combat)) {
        combats.set(combat.combatSummaryId, mergeCombat(combats.get(combat.combatSummaryId), combat));
      }
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
    session.unconfirmedKillDropCoins = kills.reduce((sum, kill) => sum + number(kill.unconfirmedDropCoins), 0);
    const buckets = killBucketSummary(kills);
    if (kills.length) {
      session.killRewardCoins = session.attributedKillRewardCoins;
      session.afkKillCount = buckets.afk.count;
      session.afkKillRewardCoins = buckets.afk.rewardCoins;
      session.afkUnconfirmedKillCount = buckets.afk.unconfirmedCount;
      session.afkUnconfirmedDropCoins = buckets.afk.unconfirmedDropCoins;
      session.activeKillCount = buckets.active.count;
      session.activeKillRewardCoins = buckets.active.rewardCoins;
      session.activeUnconfirmedKillCount = buckets.active.unconfirmedCount;
      session.activeUnconfirmedDropCoins = buckets.active.unconfirmedDropCoins;
      session.unknownKillCount = buckets.unknown.count;
      session.unknownKillRewardCoins = buckets.unknown.rewardCoins;
      session.unknownUnconfirmedKillCount = buckets.unknown.unconfirmedCount;
      session.unknownUnconfirmedDropCoins = buckets.unknown.unconfirmedDropCoins;
      const pickedCoins = number(session.pickedCoins) || number(session.coinsGained);
      session.pureRefreshCoins = Math.max(0, pickedCoins - number(session.attributedKillRewardCoins));
    } else {
      session.afkKillCount = number(session.afkKillCount);
      session.afkKillRewardCoins = number(session.afkKillRewardCoins);
      session.afkUnconfirmedKillCount = number(session.afkUnconfirmedKillCount);
      session.afkUnconfirmedDropCoins = number(session.afkUnconfirmedDropCoins);
      session.activeKillCount = number(session.activeKillCount);
      session.activeKillRewardCoins = number(session.activeKillRewardCoins);
      session.activeUnconfirmedKillCount = number(session.activeUnconfirmedKillCount);
      session.activeUnconfirmedDropCoins = number(session.activeUnconfirmedDropCoins);
      session.unknownKillCount = number(session.unknownKillCount);
      session.unknownKillRewardCoins = number(session.unknownKillRewardCoins);
      session.unknownUnconfirmedKillCount = number(session.unknownUnconfirmedKillCount);
      session.unknownUnconfirmedDropCoins = number(session.unknownUnconfirmedDropCoins);
      if (!Number.isFinite(Number(session.pureRefreshCoins))) {
        const pickedCoins = number(session.pickedCoins) || number(session.coinsGained);
        session.pureRefreshCoins = Math.max(0, pickedCoins - number(session.attributedKillRewardCoins || session.killRewardCoins));
      }
    }
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
  const combatList = Array.from(combats.values()).filter(Boolean).sort((a, b) => number(a.startedAt) - number(b.startedAt));
  for (const combat of combatList) {
    if (combat.sessionId) continue;
    const matched = sessionList.find(session => {
      const loginAt = number(session.loginAt);
      const exitAt = number(session.exitAt) || Infinity;
      return loginAt && number(combat.startedAt) >= loginAt && number(combat.startedAt) <= exitAt;
    });
    if (matched) combat.sessionId = matched.sessionId || '';
  }
  const completed = sessionList.filter(item => number(item.exitAt) && !item.inferredExit);
  const inferred = sessionList.filter(item => number(item.exitAt) && item.inferredExit);
  const open = sessionList.filter(item => !number(item.exitAt));
  return {
    day: options.day || '',
    entries: entries.length,
    files: Array.from(new Set(entries.map(item => item.__file))).sort(),
    sessions: sessionList,
    combats: combatList,
    totals: {
      sessions: sessionList.length,
      completed: completed.length,
      inferred: inferred.length,
      incomplete: open.length,
      loginDurationMs: completed.reduce((sum, item) => sum + number(item.loginDurationMs), 0),
      staminaSpentMs: completed.reduce((sum, item) => sum + number(item.staminaSpentMs), 0),
      coinsGained: completed.reduce((sum, item) => sum + number(item.coinsGained), 0),
      pureRefreshCoins: completed.reduce((sum, item) => sum + number(item.pureRefreshCoins), 0),
      killRewardCoins: completed.reduce((sum, item) => sum + number(item.killRewardCoins), 0),
      attributedKillRewardCoins: completed.reduce((sum, item) => sum + number(item.attributedKillRewardCoins), 0),
      unconfirmedKillDropCoins: completed.reduce((sum, item) => sum + number(item.unconfirmedKillDropCoins), 0),
      rewardKillCount: completed.reduce((sum, item) => sum + number(item.rewardKillCount), 0),
      afkKillCount: completed.reduce((sum, item) => sum + number(item.afkKillCount), 0),
      afkKillRewardCoins: completed.reduce((sum, item) => sum + number(item.afkKillRewardCoins), 0),
      afkUnconfirmedKillCount: completed.reduce((sum, item) => sum + number(item.afkUnconfirmedKillCount), 0),
      afkUnconfirmedDropCoins: completed.reduce((sum, item) => sum + number(item.afkUnconfirmedDropCoins), 0),
      activeKillCount: completed.reduce((sum, item) => sum + number(item.activeKillCount), 0),
      activeKillRewardCoins: completed.reduce((sum, item) => sum + number(item.activeKillRewardCoins), 0),
      activeUnconfirmedKillCount: completed.reduce((sum, item) => sum + number(item.activeUnconfirmedKillCount), 0),
      activeUnconfirmedDropCoins: completed.reduce((sum, item) => sum + number(item.activeUnconfirmedDropCoins), 0),
      combats: combatList.length,
      combatDurationMs: combatList.reduce((sum, item) => sum + number(item.durationMs), 0),
      combatStaminaSpentMs: combatList.reduce((sum, item) => sum + number(item.staminaSpentMs), 0)
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
  if (hours) return `${hours}小时${minutes}分钟`;
  if (minutes) return `${minutes}分${seconds}秒`;
  return `${seconds}秒`;
}

function formatCoins(value) {
  return `${number(value)}币`;
}

function formatKillCell(count, rewardCoins, unconfirmedDropCoins = 0, unconfirmedCount = 0) {
  const suspected = number(unconfirmedCount);
  const suspectedCoins = number(unconfirmedDropCoins);
  const suspectedText = suspected
    ? `（疑似${suspected}次${suspectedCoins ? `/${suspectedCoins}币` : ''}）`
    : '';
  return `${number(count)}次/${number(rewardCoins)}币${suspectedText}`;
}

function formatStaminaSpent(value) {
  return String(Math.round(number(value) / 1000));
}

function formatHp(value) {
  return Number.isFinite(Number(value)) ? String(Math.round(Number(value) * 10) / 10) : '-';
}

function formatHpChange(start, end, delta) {
  const deltaValue = Number.isFinite(Number(delta)) ? Number(delta) : (Number.isFinite(Number(start)) && Number.isFinite(Number(end)) ? Number(end) - Number(start) : null);
  const deltaText = deltaValue === null ? '' : `（${deltaValue > 0 ? '+' : ''}${Math.round(deltaValue * 10) / 10}）`;
  return `${formatHp(start)}到${formatHp(end)}${deltaText}`;
}

function combatHpDisadvantageText(combat) {
  const selfHp = Number(combat?.selfHpEnd);
  const enemyHp = Number(combat?.enemyHpEnd);
  if (!Number.isFinite(selfHp) || !Number.isFinite(enemyHp) || !(selfHp < enemyHp)) return '';
  return `我方HP ${formatHp(selfHp)}，对方HP ${formatHp(enemyHp)}`;
}

function formatEnemy(enemy) {
  const name = String(enemy?.name || '').trim();
  const id = enemy?.id === null || enemy?.id === undefined || enemy?.id === '' ? '' : String(enemy.id);
  if (name && id) return `${name}（${id}）`;
  return name || id || '-';
}

function combatReasonText(reason) {
  const value = String(reason || '').toLowerCase();
  if (!value) return '';
  if (value === 'kill') return '击杀确认';
  if (value === 'target-switched') return '目标切换，原战斗记录结束';
  if (value === 'post-combat-timeout') return '目标消失或脱离交火范围';
  if (value === 'wait-for-full-stamina-and-hp') return '目标脱离，随后留局恢复';
  if (value === 'avoid-invulnerable-target' || value === 'recovery-avoid-humans') return '避开无敌目标';
  if (value === 'enemy-leave-wait') return '等待安全重登';
  if (value === 'pursuit-leave') return '被持续追击';
  if (value === 'combat-hp-disadvantage-leave') return '战斗血量劣势';
  if (value === 'combat-low-hp-leave') return '战斗低血或近身风险';
  if (value === 'combat-critical-hp-leave') return '战斗血量过低';
  if (value === 'combat-low-hp-no-damage-leave') return '低血且久攻未中';
  if (value === 'injury-leave') return '受伤';
  if (value === 'offline-leave') return '连接离线';
  if (value === 'stamina-budget-coin-leave') return '一小时体力预算不足';
  if (value === 'stamina-exhausted-leave' || value === 'stamina exhausted') return '一天体力耗尽';
  if (value.startsWith('suspended:')) {
    if (value.includes('enemy-leave-wait')) return '离开后的重登等待中，战斗记录挂起';
    if (value.includes('login-suppressed')) return '重登等待中，战斗记录挂起';
    if (value.includes('manual-login')) return '手动登录中断战斗记录';
    return '等待状态中断战斗记录';
  }
  if (value.includes('leave')) return '触发离开';
  if (value.includes('recover') || value.includes('retreat') || value.includes('flee')) return '局内撤离或恢复';
  if (value.includes('timeout')) return '观察超时';
  return '原因未归类';
}

function resultText(result, reason, combat = null) {
  const value = String(result || '');
  const detail = combatReasonText(reason);
  const reasonValue = String(reason || '').toLowerCase();
  const lastReason = String(combat?.lastReason || '').toLowerCase();
  const startReason = String(combat?.startReason || '').toLowerCase();
  if (value === 'won') return detail ? `胜利：${detail}` : '胜利';
  if (value === 'lost') return detail ? `失败：${detail}` : '失败';
  if (reasonValue === 'wait-for-full-stamina-and-hp') return '敌方逃离：目标脱离，随后留局恢复';
  if (reasonValue === 'avoid-invulnerable-target' || reasonValue === 'recovery-avoid-humans') return '安全避让：避开无敌目标（未退出本局）';
  if (reasonValue === 'target-switched') return '切换交战目标：原目标不再作为当前战斗对象';
  if (reasonValue === 'post-combat-timeout' && /target-retreating/.test(`${startReason} ${lastReason}`)) {
    return '敌方逃离：目标脱离交火范围';
  }
  if (reasonValue === 'post-combat-timeout') return '敌方逃离：目标消失或脱离交火范围';
  if (value === 'left') {
    if (reasonValue === 'enemy-leave-wait') {
      const hpText = combatHpDisadvantageText(combat);
      return hpText
        ? `战斗劣势主动退出：${hpText}，已离开等待安全重登`
        : '战斗风险主动退出：已离开等待安全重登';
    }
    return detail ? `主动退出本局：${detail}` : '主动退出本局';
  }
  if (value === 'retreated') return detail ? `我方脱战：${detail}（未退出本局）` : '我方脱战（未退出本局）';
  if (value === 'disengaged') return detail ? `敌方逃离：${detail}` : '敌方逃离：目标消失或脱离交火范围';
  if (value === 'ongoing') return detail ? `仍在记录中：${detail}` : '仍在记录中';
  return detail ? `状态未归类：${detail}` : '状态未归类';
}

function printReport(report) {
  console.log(`日期：${report.day || '-'}；日志文件：${report.files.length}；记录数：${report.entries}`);
  console.log('');
  console.log('## 登录统计');
  console.log('说明：击杀列格式为确认次数/确认收益；疑似表示只有聊天或掉落值线索，未确认目标死亡或拾取，不计入总收益。');
  console.log('');
  console.log('| # | 登录时间 | 退出时间 | 耗时 | 消耗体力 | 拾取刷新金币 | 击杀挂机玩家 | 击杀活跃玩家 | 总收益 | 退出原因 |');
  console.log('|---:|---|---|---:|---:|---:|---:|---:|---:|---|');
  report.sessions.forEach((session, index) => {
    const exit = number(session.exitAt) ? formatTime(session.exitAt) : '未收口';
    const status = session.inferredExit
      ? `推断收口：${reasonText(session.exitReason, session.exitSummary)}`
      : session.incomplete && !number(session.exitAt)
      ? (session.nextLoginAt ? `日志尚未收口：下一次登录在${formatDuration(session.nextLoginAt - number(session.loginAt))}后出现` : '日志尚未收口')
      : reasonText(session.exitReason, session.exitSummary);
    console.log(`| ${index + 1} | ${formatTime(session.loginAt)} | ${exit} | ${formatDuration(session.loginDurationMs)} | ${formatStaminaSpent(session.staminaSpentMs)} | ${formatCoins(session.pureRefreshCoins)} | ${formatKillCell(session.afkKillCount, session.afkKillRewardCoins, session.afkUnconfirmedDropCoins, session.afkUnconfirmedKillCount)} | ${formatKillCell(session.activeKillCount, session.activeKillRewardCoins, session.activeUnconfirmedDropCoins, session.activeUnconfirmedKillCount)} | ${formatCoins(session.coinsGained)} | ${status} |`);
  });
  console.log('');
  console.log(`登录合计：明确退出${report.totals.completed}/${report.totals.sessions}，推断收口${report.totals.inferred}，尚未收口${report.totals.incomplete}，总耗时${formatDuration(report.totals.loginDurationMs)}，消耗体力${formatStaminaSpent(report.totals.staminaSpentMs)}，拾取刷新金币${report.totals.pureRefreshCoins}币，击杀挂机玩家${formatKillCell(report.totals.afkKillCount, report.totals.afkKillRewardCoins, report.totals.afkUnconfirmedDropCoins, report.totals.afkUnconfirmedKillCount)}，击杀活跃玩家${formatKillCell(report.totals.activeKillCount, report.totals.activeKillRewardCoins, report.totals.activeUnconfirmedDropCoins, report.totals.activeUnconfirmedKillCount)}，总收益${report.totals.coinsGained}币`);
  console.log('');
  console.log('## 活跃玩家战斗统计');
  console.log('说明：主动退出本局表示已离开当前局；敌方逃离包括目标脱离范围、突然消失、退出或传送；切换交战目标表示改打其他目标。避开无敌目标属于安全移动，不计入本表。');
  console.log('');
  if (!report.combats.length) {
    console.log('无记录');
  } else {
    console.log('| # | 战斗对象 | 开始时间 | 结束时间 | 耗时 | 消耗体力 | 我方血量变化 | 对方血量变化 | 战斗结果 |');
    console.log('|---:|---|---|---|---:|---:|---:|---:|---|');
    report.combats.forEach((combat, index) => {
      const endedAt = number(combat.endedAt) ? formatTime(combat.endedAt) : '未记录';
      console.log(`| ${index + 1} | ${formatEnemy(combat.enemy)} | ${formatTime(combat.startedAt)} | ${endedAt} | ${formatDuration(combat.durationMs)} | ${formatStaminaSpent(combat.staminaSpentMs)} | ${formatHpChange(combat.selfHpStart, combat.selfHpEnd, combat.selfHpDelta)} | ${formatHpChange(combat.enemyHpStart, combat.enemyHpEnd, combat.enemyHpDelta)} | ${resultText(combat.result, combat.resultReason, combat)} |`);
    });
    console.log('');
    console.log(`战斗合计：次数${report.totals.combats}，总耗时${formatDuration(report.totals.combatDurationMs)}，消耗体力${formatStaminaSpent(report.totals.combatStaminaSpentMs)}`);
  }
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
        pickedCoins: 20,
        coinsGained: 20,
        pureRefreshCoins: 7,
        killRewardCoins: 13,
        version: 'bootstrap-0.4.141'
      }
    },
    {
      type: 'important-log',
      importantType: 'kill',
      importantLogId: `${s1}:kill-afk`,
      at: 3000,
      sessionId: s1,
      kill: { at: 3000, name: 'afk-target', id: 7, rewardCoins: 9, targetDrop: 9, playerCategory: 'afk', matchedAttack: true, dropMatched: true }
    },
    {
      type: 'important-log',
      importantType: 'kill',
      importantLogId: `${s1}:kill-active`,
      at: 3500,
      sessionId: s1,
      kill: { at: 3500, name: 'active-target', id: 8, rewardCoins: 4, targetDrop: 4, playerCategory: 'active', combat: true, dropMatched: true }
    },
    {
      type: 'important-log',
      importantType: 'kill',
      importantLogId: `${s1}:kill-active-unconfirmed`,
      at: 3700,
      sessionId: s1,
      kill: { at: 3700, name: 'unpicked-active-target', id: 10, rewardCoins: 30, targetDrop: 30, playerCategory: 'active', combat: true, chatConfirmed: true, dropMatched: false }
    },
    {
      type: 'important-log',
      importantType: 'combat-summary',
      importantLogId: `${s1}:combat:summary`,
      at: 3600,
      sessionId: s1,
      combat: {
        combatSummaryId: `${s1}:combat`,
        sessionId: s1,
        startedAt: 1500,
        endedAt: 3600,
        durationMs: 2100,
        staminaSpentMs: 2500,
        enemy: { id: 8, name: 'active-target', mode: 'Active' },
        selfHpStart: 100,
        selfHpEnd: 82,
        selfHpDelta: -18,
        enemyHpStart: 100,
        enemyHpEnd: 0,
        enemyHpDelta: -100,
        result: 'won',
        resultReason: 'kill',
        sampleCount: 12
      }
    },
    {
      type: 'important-log',
      importantType: 'combat-summary',
      importantLogId: `${s2}:immediate-exit:summary`,
      at: 10600,
      sessionId: s2,
      combat: {
        combatSummaryId: `${s2}:immediate-exit`,
        sessionId: s2,
        startedAt: 10500,
        endedAt: 10600,
        durationMs: 100,
        staminaSpentMs: 0,
        enemy: { id: 9, name: 'login-threat', mode: 'Active' },
        selfHpStart: 40,
        selfHpEnd: 40,
        selfHpDelta: 0,
        enemyHpStart: 100,
        enemyHpEnd: 100,
        enemyHpDelta: 0,
        result: 'left',
        resultReason: 'combat-hp-disadvantage-leave',
        startReason: 'combat-hp-disadvantage-leave',
        lastReason: 'combat-hp-disadvantage-leave',
        startedWithExitOnly: true,
        engagementObserved: false,
        sampleCount: 1
      }
    },
    {
      type: 'important-log',
      importantType: 'combat-summary',
      importantLogId: `${s2}:safety-avoid:summary`,
      at: 11200,
      sessionId: s2,
      combat: {
        combatSummaryId: `${s2}:safety-avoid`,
        sessionId: s2,
        startedAt: 10800,
        endedAt: 11200,
        durationMs: 400,
        staminaSpentMs: 0,
        enemy: { id: 11, name: 'invulnerable-target', mode: 'Active' },
        selfHpStart: 90,
        selfHpEnd: 90,
        selfHpDelta: 0,
        enemyHpStart: 100,
        enemyHpEnd: 100,
        enemyHpDelta: 0,
        result: 'retreated',
        resultReason: 'recovery-avoid-humans',
        startReason: 'combat-attack',
        lastReason: 'recovery-avoid-humans',
        engagementObserved: true,
        sampleCount: 3
      }
    }
  ]);
  const report = buildReport(readEntries(dayDir), { day });
  assertSelfTest(report.sessions.length === 3, `expected 3 sessions, got ${report.sessions.length}`);
  assertSelfTest(report.sessions[0].exitAt === 5000, 'cross-file session-end was not merged');
  assertSelfTest(report.sessions[0].staminaSpentMs === 123000, 'cross-file stamina was not preserved');
  assertSelfTest(report.sessions[0].pureRefreshCoins === 7, 'pure refreshed coin total was not preserved');
  assertSelfTest(report.sessions[0].afkKillCount === 1 && report.sessions[0].afkKillRewardCoins === 9, 'AFK kill bucket was not computed');
  assertSelfTest(report.sessions[0].activeKillCount === 1 && report.sessions[0].activeKillRewardCoins === 4, 'active kill confirmed reward bucket was not computed');
  assertSelfTest(report.sessions[0].activeUnconfirmedKillCount === 1, 'active unconfirmed kill count was not computed');
  assertSelfTest(report.sessions[0].activeUnconfirmedDropCoins === 30, 'active unconfirmed drop bucket was not computed');
  assertSelfTest(report.sessions[0].afkKillRewardCoins + report.sessions[0].activeKillRewardCoins <= report.sessions[0].coinsGained, 'confirmed kill rewards exceed total gained coins');
  assertSelfTest(report.combats.length === 1, `expected 1 combat, got ${report.combats.length}`);
  assertSelfTest(!report.combats.some(item => item.combatSummaryId === `${s2}:immediate-exit`), 'immediate login exit was incorrectly counted as combat');
  assertSelfTest(!report.combats.some(item => item.combatSummaryId === `${s2}:safety-avoid`), 'safety avoidance was incorrectly counted as combat');
  assertSelfTest(report.combats[0].staminaSpentMs === 2500, 'combat stamina was not preserved');
  assertSelfTest(report.combats[0].selfHpDelta === -18 && report.combats[0].enemyHpDelta === -100, 'combat HP deltas were not preserved');
  assertSelfTest(resultText('left', 'combat-hp-disadvantage-leave') === '主动退出本局：战斗血量劣势', 'left combat result text is not explicit');
  assertSelfTest(resultText('left', 'wait-for-full-stamina-and-hp') === '敌方逃离：目标脱离，随后留局恢复', 'recovery wait result text is not folded into enemy flee');
  assertSelfTest(resultText('retreated', 'avoid-invulnerable-target') === '安全避让：避开无敌目标（未退出本局）', 'safety avoidance result text is not explicit');
  assertSelfTest(resultText('disengaged', 'target-switched') === '切换交战目标：原目标不再作为当前战斗对象', 'target-switched combat result text is not explicit');
  assertSelfTest(resultText('disengaged', 'post-combat-timeout', { lastReason: 'combat-target-retreating' }) === '敌方逃离：目标脱离交火范围', 'retreating-target combat result text is not explicit');
  assertSelfTest(resultText('disengaged', 'post-combat-timeout') === '敌方逃离：目标消失或脱离交火范围', 'post-combat timeout result text is not folded into enemy flee');
  assertSelfTest(resultText('left', 'enemy-leave-wait', { selfHpEnd: 38, enemyHpEnd: 44 }) === '战斗劣势主动退出：我方HP 38，对方HP 44，已离开等待安全重登', 'enemy leave wait result text is not explicit');
  assertSelfTest(report.sessions[1].incomplete === true, 'unclosed middle session was not marked incomplete');
  assertSelfTest(report.sessions[1].nextLoginAt === 20000, 'next-login context missing for incomplete session');
  fs.rmSync(root, { recursive: true, force: true });
  console.log('日报自检通过');
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
