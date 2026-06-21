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
  const files = [];
  function walk(dir) {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) walk(fullPath);
      else if (item.isFile() && item.name.endsWith('.jsonl')) files.push(fullPath);
    }
  }
  walk(dayDir);
  return files.sort();
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
          __file: path.relative(dayDir, file),
          __line: index + 1,
          __at: Number(entry.at || entry.receivedAt || 0) || 0
        });
      } catch (err) {
        entries.push({
          type: 'parse-error',
          error: err.message || String(err),
          __file: path.relative(dayDir, file),
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

function hasOwnFiniteNumber(object, key) {
  return Boolean(object
    && Object.prototype.hasOwnProperty.call(object, key)
    && Number.isFinite(Number(object[key])));
}

function nonNegativeInteger(value) {
  return Math.max(0, Math.round(number(value)));
}

function optionalNonNegativeInteger(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : null;
}

function sessionBalanceDelta(session) {
  if (!hasOwnFiniteNumber(session, 'baseCoins') || !hasOwnFiniteNumber(session, 'currentCoins')) return null;
  return Math.max(0, Math.round(Number(session.currentCoins) - Number(session.baseCoins)));
}

function sessionCollectedCoins(session) {
  if (!session || typeof session !== 'object') return 0;
  const pickedCoins = hasOwnFiniteNumber(session, 'pickedCoins') ? nonNegativeInteger(session.pickedCoins) : null;
  const coinsGained = hasOwnFiniteNumber(session, 'coinsGained') ? nonNegativeInteger(session.coinsGained) : 0;
  const balanceDelta = sessionBalanceDelta(session);
  if (pickedCoins !== null) {
    if (pickedCoins > 0) return pickedCoins;
    if (balanceDelta !== null) return balanceDelta;
    return 0;
  }
  if (balanceDelta !== null) return Math.max(coinsGained, balanceDelta);
  return coinsGained;
}

function sessionScore(session) {
  return (number(session.exitAt) ? 10 ** 15 : 0)
    + number(session.updatedAt)
    + number(session.loginDurationMs)
    + number(session.staminaSpentMs)
    + number(session.coinsGained)
    + number(session.killRewardCoins);
}

function exitReasonPriority(reason, summary = '') {
  const value = `${String(reason || '')} ${String(summary || '')}`.toLowerCase();
  if (!value.trim()) return 0;
  if (/combat|injury|pursuit|sustained/.test(value)) return 90;
  if (/stamina|offline|websocket|reconnect|control-ws/.test(value)) return 80;
  if (/leave-success|exit-confirmed/.test(value) && !/no-self|game session missing self/.test(value)) return 70;
  if (/login-before-session-end/.test(value)) return 35;
  if (/no-self|game session missing self|not-alive/.test(value)) return 20;
  if (/[\u4e00-\u9fff]/.test(summary)) return 50;
  return 40;
}

function betterExitDetails(previous, next) {
  const candidates = [previous, next]
    .filter(Boolean)
    .map(item => ({
      reason: item.exitReason || '',
      summary: item.exitSummary || '',
      exitAt: number(item.exitAt),
      updatedAt: number(item.updatedAt)
    }))
    .filter(item => item.reason || item.summary);
  candidates.sort((a, b) => {
    const priority = exitReasonPriority(b.reason, b.summary) - exitReasonPriority(a.reason, a.summary);
    if (priority) return priority;
    const summaryLength = String(b.summary || '').length - String(a.summary || '').length;
    if (summaryLength) return summaryLength;
    return number(b.exitAt || b.updatedAt) - number(a.exitAt || a.updatedAt);
  });
  return candidates[0] || null;
}

function mergeSession(previous, next) {
  if (!previous) return { ...next };
  const base = sessionScore(next) >= sessionScore(previous) ? { ...previous, ...next } : { ...next, ...previous };
  const exitDetails = betterExitDetails(previous, next);
  for (const key of ['exitReason', 'exitSummary', 'version', 'sourceHash']) {
    if (!base[key]) base[key] = previous[key] || next[key] || '';
  }
  if (exitDetails) {
    base.exitReason = exitDetails.reason || base.exitReason || '';
    base.exitSummary = exitDetails.summary || base.exitSummary || '';
  }
  if (!base.exitAt) base.exitAt = previous.exitAt || next.exitAt || 0;
  if (!base.loginAt) base.loginAt = previous.loginAt || next.loginAt || 0;
  return base;
}

function killKey(kill) {
  const id = kill.id ?? kill.userId;
  const identity = id !== null && id !== undefined && id !== '' ? `id:${id}` : `name:${kill.name || kill.victim || ''}`;
  return [
    number(kill.at),
    identity,
    number(kill.targetDropCoins)
  ].join('|');
}

function normalizeKill(kill) {
  if (!kill || typeof kill !== 'object') return null;
  const playerCategory = normalizePlayerCategory(kill);
  const rawRewardCoins = Number.isFinite(Number(kill.rewardCoins ?? kill.drop)) ? Math.max(0, Math.round(Number(kill.rewardCoins ?? kill.drop))) : 0;
  const targetDropCoins = Number.isFinite(Number(kill.targetDropCoins ?? kill.targetDrop ?? kill.drop ?? kill.rewardCoins)) ? Math.max(0, Math.round(Number(kill.targetDropCoins ?? kill.targetDrop ?? kill.drop ?? kill.rewardCoins))) : 0;
  const rewardConfirmed = Boolean(kill.rewardConfirmed || kill.dropMatched);
  const killConfirmed = Boolean(kill.killConfirmed || kill.chatConfirmed || kill.dropMatched || kill.rewardConfirmed);
  const rewardCoins = rewardConfirmed ? rawRewardCoins : 0;
  const battleStartedAt = number(kill.battleStartedAt ?? kill.startedAt);
  const battleEndedAt = number(kill.battleEndedAt ?? kill.endedAt ?? kill.at);
  const battleDurationMs = number(kill.battleDurationMs, battleStartedAt && battleEndedAt ? battleEndedAt - battleStartedAt : 0);
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
    killConfirmed,
    pickupConfirmed: rewardConfirmed,
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
    attackDistance: Number.isFinite(Number(kill.attackDistance)) ? Math.round(Number(kill.attackDistance)) : null,
    battleStartedAt,
    battleEndedAt,
    battleDurationMs,
    battleStaminaSpentStartMs: optionalNonNegativeInteger(kill.battleStaminaSpentStartMs),
    battleStaminaSpentEndMs: optionalNonNegativeInteger(kill.battleStaminaSpentEndMs),
    battleStaminaSpentMs: optionalNonNegativeInteger(kill.battleStaminaSpentMs)
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

function mergeKill(previous, next) {
  const a = normalizeKill(previous);
  const b = normalizeKill(next);
  if (!a) return b;
  if (!b) return a;
  const category = a.playerCategory === 'active' || b.playerCategory === 'active'
    ? 'active'
    : (a.playerCategory === 'afk' || b.playerCategory === 'afk' ? 'afk' : 'unknown');
  const rewardConfirmed = Boolean(a.rewardConfirmed || b.rewardConfirmed || a.dropMatched || b.dropMatched);
  const rawRewardCoins = Math.max(number(a.reportedRewardCoins), number(b.reportedRewardCoins), number(a.rewardCoins), number(b.rewardCoins));
  const targetDropCoins = Math.max(number(a.targetDropCoins), number(b.targetDropCoins));
  const battleStartedAt = [a.battleStartedAt, b.battleStartedAt].map(number).filter(Boolean).sort((x, y) => x - y)[0] || 0;
  const battleEndedAt = Math.max(number(a.battleEndedAt), number(b.battleEndedAt), number(a.at), number(b.at));
  const staminaStarts = [a.battleStaminaSpentStartMs, b.battleStaminaSpentStartMs]
    .filter(value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)))
    .map(Number);
  const staminaEnds = [a.battleStaminaSpentEndMs, b.battleStaminaSpentEndMs]
    .filter(value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)))
    .map(Number);
  const battleStaminaSpentStartMs = staminaStarts.length ? Math.max(0, Math.round(Math.min(...staminaStarts))) : null;
  const battleStaminaSpentEndMs = staminaEnds.length ? Math.max(0, Math.round(Math.max(...staminaEnds))) : null;
  return {
    ...a,
    ...b,
    at: number(b.at) || number(a.at),
    time: b.time || a.time || '',
    name: b.name || a.name || '',
    id: b.id ?? a.id ?? null,
    rewardCoins: rewardConfirmed ? rawRewardCoins : 0,
    reportedRewardCoins: rawRewardCoins,
    targetDropCoins,
    unconfirmedDropCoins: rewardConfirmed ? 0 : Math.max(targetDropCoins, rawRewardCoins),
    rewardConfirmed,
    killConfirmed: Boolean(a.killConfirmed || b.killConfirmed || a.chatConfirmed || b.chatConfirmed || rewardConfirmed),
    pickupConfirmed: rewardConfirmed,
    playerCategory: category,
    afk: category === 'afk',
    active: category === 'active',
    combat: Boolean(a.combat || b.combat),
    combatIntent: b.combatIntent || a.combatIntent || '',
    mode: b.mode || a.mode || '',
    matchedAttack: Boolean(a.matchedAttack || b.matchedAttack),
    dropMatched: Boolean(a.dropMatched || b.dropMatched),
    chatConfirmed: Boolean(a.chatConfirmed || b.chatConfirmed),
    source: a.source && b.source && a.source !== b.source ? `${a.source}+${b.source}` : (b.source || a.source || ''),
    attackDistance: Number.isFinite(Number(b.attackDistance)) ? b.attackDistance : a.attackDistance,
    battleStartedAt,
    battleEndedAt,
    battleDurationMs: battleStartedAt && battleEndedAt ? Math.max(0, Math.round(battleEndedAt - battleStartedAt)) : Math.max(number(a.battleDurationMs), number(b.battleDurationMs)),
    battleStaminaSpentStartMs,
    battleStaminaSpentEndMs,
    battleStaminaSpentMs: battleStaminaSpentStartMs !== null && battleStaminaSpentEndMs !== null
      ? Math.max(0, Math.round(battleStaminaSpentEndMs - battleStaminaSpentStartMs))
      : (b.battleStaminaSpentMs !== null && b.battleStaminaSpentMs !== undefined ? b.battleStaminaSpentMs : a.battleStaminaSpentMs)
  };
}

function mergeKillLists(sessionKills, eventKills) {
  const map = new Map();
  for (const kill of [...(sessionKills || []), ...(eventKills || [])].map(normalizeKill).filter(Boolean)) {
    const key = killKey(kill);
    const previous = map.get(key);
    map.set(key, previous ? mergeKill(previous, kill) : kill);
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
    exitReason: combat.exitReason || '',
    exitSummary: combat.exitSummary || '',
    kill: combat.kill || null,
    startReason: combat.startReason || '',
    lastReason: combat.lastReason || '',
    startedWithExitOnly: Boolean(combat.startedWithExitOnly),
    engagementObserved: combat.engagementObserved === true,
    sampleCount: Math.max(0, Math.round(number(combat.sampleCount))),
    version: combat.version || '',
    sourceHash: combat.sourceHash || '',
    updatedAt: number(combat.updatedAt),
    exitEvidence: combat.exitEvidence || null
  };
}

function mergeCombat(previous, next) {
  const normalized = normalizeCombat(next);
  if (!normalized) return previous || null;
  if (!previous) return normalized;
  const merged = combatScore(normalized) >= combatScore(previous)
    ? { ...previous, ...normalized, enemy: { ...(previous.enemy || {}), ...(normalized.enemy || {}) } }
    : { ...normalized, ...previous, enemy: { ...(normalized.enemy || {}), ...(previous.enemy || {}) } };
  const exitEvidence = betterExitEvidence(previous.exitEvidence, normalized.exitEvidence);
  if (exitEvidence) merged.exitEvidence = exitEvidence;
  return merged;
}

function combatKeyFromTarget(target) {
  if (!target || typeof target !== 'object') return '';
  const id = target.id ?? target.user_id ?? target.targetId;
  const name = target.name ?? target.targetName;
  if (id !== undefined && id !== null && id !== '') return `id:${id}`;
  return name ? `name:${name}` : '';
}

function normalizeTradeEvidence(entry) {
  const evidence = entry?.combat?.disadvantageObservation?.evidence || entry?.combat?.tradeEstimate || null;
  if (!evidence || typeof evidence !== 'object') return null;
  const rawTKillMs = evidence.tKillMs;
  const rawTDeathMs = evidence.tDeathMs;
  return {
    sampleCount: Math.max(0, Math.round(number(evidence.sampleCount))),
    elapsedMs: Math.max(0, Math.round(number(evidence.elapsedMs))),
    selfDamage: Math.max(0, number(evidence.selfDamage)),
    targetDamage: Math.max(0, number(evidence.targetDamage)),
    myDps: number(evidence.myDps, NaN),
    enemyDps: number(evidence.enemyDps, NaN),
    tKillMs: rawTKillMs !== null && rawTKillMs !== undefined && Number.isFinite(Number(rawTKillMs)) ? Math.max(0, Math.round(Number(rawTKillMs))) : null,
    tDeathMs: rawTDeathMs !== null && rawTDeathMs !== undefined && Number.isFinite(Number(rawTDeathMs)) ? Math.max(0, Math.round(Number(rawTDeathMs))) : null
  };
}

function normalizeExitEvidence(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const combat = entry.combat && typeof entry.combat === 'object' ? entry.combat : {};
  const target = entry.target && typeof entry.target === 'object' ? entry.target : {};
  const self = entry.self && typeof entry.self === 'object' ? entry.self : {};
  const injury = entry.injury && typeof entry.injury === 'object' ? entry.injury : null;
  const reason = entry.reason || entry.exitReason || '';
  const summary = entry.summary || entry.exitSummary || '';
  const targetName = target.name || target.targetName || combat.target?.name || '';
  const targetId = target.id ?? target.user_id ?? target.targetId ?? combat.target?.id ?? null;
  const trade = normalizeTradeEvidence(entry);
  return {
    at: number(entry.__at || entry.at),
    reason,
    summary,
    auditKind: entry.auditKind || '',
    source: entry.source || entry.exitAuditSource || '',
    target: {
      id: targetId,
      name: targetName,
      key: combatKeyFromTarget(target),
      hp: Number.isFinite(Number(target.hp ?? target.knownHp)) ? Number(target.hp ?? target.knownHp) : null
    },
    selfHp: Number.isFinite(Number(self.hp ?? combat.selfHp)) ? Number(self.hp ?? combat.selfHp) : null,
    targetHp: Number.isFinite(Number(target.hp ?? target.knownHp ?? combat.targetHp)) ? Number(target.hp ?? target.knownHp ?? combat.targetHp) : null,
    hpGap: Number.isFinite(Number(combat.hpGap)) ? Number(combat.hpGap) : null,
    noDamageMs: Number.isFinite(Number(combat.serverStallNoDamage?.noDamageMs)) ? Math.max(0, Math.round(Number(combat.serverStallNoDamage.noDamageMs))) : null,
    trade,
    injury: injury ? {
      selfHpBefore: Number.isFinite(Number(injury.selfHpBefore)) ? Number(injury.selfHpBefore) : null,
      selfHpAfter: Number.isFinite(Number(injury.selfHpAfter)) ? Number(injury.selfHpAfter) : null,
      sourceName: injury.nearestActive?.name || injury.nearestHuman?.name || injury.nearestAvoidance?.name || '',
      sourceId: injury.nearestActive?.id ?? injury.nearestActive?.user_id ?? injury.nearestHuman?.id ?? injury.nearestHuman?.user_id ?? injury.nearestAvoidance?.id ?? injury.nearestAvoidance?.user_id ?? null
    } : null
  };
}

function exitEvidencePriority(evidence) {
  if (!evidence) return 0;
  const base = exitReasonPriority(evidence.reason, evidence.summary);
  return base
    + (evidence.auditKind === 'exit-confirmed' ? 4 : 0)
    + (evidence.trade ? 3 : 0)
    + (evidence.noDamageMs ? 2 : 0)
    + (evidence.injury ? 2 : 0);
}

function betterExitEvidence(previous, next) {
  const candidates = [previous, next].filter(Boolean);
  candidates.sort((a, b) => {
    const priority = exitEvidencePriority(b) - exitEvidencePriority(a);
    if (priority) return priority;
    const summaryLength = String(b.summary || '').length - String(a.summary || '').length;
    if (summaryLength) return summaryLength;
    return number(b.at) - number(a.at);
  });
  return candidates[0] || null;
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

function detailJoin(parts) {
  return parts.filter(Boolean).join('；');
}

function knownReasonText(reason) {
  const value = String(reason || '').toLowerCase();
  if (!value) return '';
  if (/login-before-session-end/.test(value)) return '重新登录前上一局已经不可用，按下一次登录前收口；这表示日志没有记录到上一局真实退出动作，不等同于本局刚因自身不可见而退出';
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

function parsedTradeExitSummary(text, evidence = null) {
  const value = stripReconnectSuffix(text);
  const match = value.match(/^与(.+?)战斗，交换比劣势(?:，预计承伤倒计时([^，]+))?(?:，预计击杀需([^，]+))?，提前退出$/);
  if (!match) return '';
  const [, name, legacyDeath = '', legacyKill = ''] = match;
  const trade = evidence?.trade || null;
  const enemyName = evidence?.target?.name || name;
  if (!trade) {
    const estimates = detailJoin([
      legacyDeath ? `预计继续承伤约${legacyDeath}` : '',
      legacyKill ? `预计击杀还需${legacyKill}` : ''
    ]);
    return `与${enemyName}战斗，因近期换血不利而主动退出${estimates ? `；${estimates}` : ''}`;
  }
  const observed = trade.elapsedMs ? `最近${formatDuration(trade.elapsedMs)}` : '最近一段交战';
  const selfDamage = Number.isFinite(Number(trade.selfDamage)) ? `我方掉血${formatHp(trade.selfDamage)}` : '';
  const targetDamage = Number.isFinite(Number(trade.targetDamage)) ? `对方掉血${formatHp(trade.targetDamage)}` : '';
  const deathText = trade.tDeathMs !== null && trade.tDeathMs !== undefined ? `按当前承伤速度预计我方约${formatDuration(trade.tDeathMs)}后会被击杀` : '';
  const killText = trade.tKillMs !== null && trade.tKillMs !== undefined ? `预计击杀对方还需${formatDuration(trade.tKillMs)}` : '当前窗口未造成有效伤害，无法估算击杀时间';
  return `与${enemyName}战斗，因近期换血不利而主动退出：${observed}${trade.sampleCount ? `、${trade.sampleCount}个样本` : ''}内${detailJoin([selfDamage, targetDamage])}；${detailJoin([deathText, killText])}`;
}

function parsedCombatExitSummary(text) {
  const value = stripReconnectSuffix(text);
  let match = value.match(/^与(.+?)战斗，近身弹压下血量([^，]+)，对方(?:HP|血量)\s*([^，]+)，差距([^，]+)(?:，距离([^，]+))?，提前劣势退出$/);
  if (match) {
    const [, name, selfHp, targetHp, gap, distance] = match;
    return `与${name}战斗，因近距离弹道压力下血量劣势而主动退出：退出时我方血量${selfHp}，对方血量${targetHp}，对方高${gap}${distance ? `，双方距离${distance}` : ''}`;
  }
  match = value.match(/^与(.+?)战斗，服务端位置停滞下血量([^，]+)，对方(?:HP|血量)\s*([^，]+)，差距([^，]+)(?:，(\d+)秒未造成伤害)?，劣势退出$/);
  if (match) {
    const [, name, selfHp, targetHp, gap, noDamageSeconds] = match;
    const noDamageText = noDamageSeconds ? `，连续${noDamageSeconds}秒没有对目标造成伤害` : '';
    return `与${name}战斗，因久攻未中且血量劣势而主动退出：服务端位置长时间没有推进${noDamageText}；退出时我方血量${selfHp}，对方血量${targetHp}，对方高${gap}`;
  }
  match = value.match(/^与(.+?)战斗，血量([^，]+)，对方(?:HP|血量)\s*([^，]+)，差距([^，]+)，劣势退出$/);
  if (match) {
    const [, name, selfHp, targetHp, gap] = match;
    return `与${name}战斗，因血量劣势而主动退出：退出时我方血量${selfHp}，对方血量${targetHp}，对方高${gap}`;
  }
  match = value.match(/^与(.+?)战斗，血量([^，]+)，对方(?:HP|血量)\s*([^，]+)(，\d+秒未造成伤害)?，低血久攻未中退出$/);
  if (match) {
    const [, name, selfHp, targetHp, noDamageText = ''] = match;
    return `与${name}战斗，因低血且久攻未中而主动退出：退出时我方血量${selfHp}，对方血量${targetHp}${noDamageText}`;
  }
  match = value.match(/^与(.+?)战斗，血量([^，]+)不足([^，]+)，对方(?:HP|血量)\s*([^，]+)(?:，距离([^，]+))?，低血近身风险退出$/);
  if (match) {
    const [, name, selfHp, threshold, targetHp, distance] = match;
    return `与${name}战斗，因低血且近距离风险高而主动退出：我方血量${selfHp}低于阈值${threshold}，对方血量${targetHp}${distance ? `，双方距离${distance}` : ''}`;
  }
  match = value.match(/^与(.+?)战斗，血量([^，]+)不足([^，]+)，对方(?:HP|血量)\s*([^，]+)，劣势退出$/);
  if (match) {
    const [, name, selfHp, threshold, targetHp] = match;
    return `与${name}战斗，因低血劣势而主动退出：我方血量${selfHp}低于阈值${threshold}，对方血量${targetHp}`;
  }
  match = value.match(/^与(.+?)战斗，血量([^，]+)低于([^，]+)，紧急退出$/);
  if (match) {
    const [, name, selfHp, threshold] = match;
    return `与${name}战斗，因血量过低而紧急退出：我方血量${selfHp}低于阈值${threshold}`;
  }
  return '';
}

function verboseExitText(reason, summary, evidence = null) {
  const text = String(summary || reason || '');
  const reasonValue = String(reason || '').toLowerCase();
  if (!text) return '原因未记录';
  if (/login-before-session-end/.test(reasonValue)) return knownReasonText(reason);
  if (/session-interrupted-before-next-login/.test(reasonValue) || /上次登录未记录退出|下一次登录时发现上一局已结束/.test(text)) {
    return '下一次登录时发现上一局已结束，按下一次登录时间收口';
  }
  const tradeText = parsedTradeExitSummary(text, evidence);
  if (tradeText) return tradeText;
  const parsed = parsedCombatExitSummary(text) || parsedStaminaExitSummary(text) || parsedNetworkExitSummary(text);
  if (parsed) return parsed;
  if (/game session missing self|no-self/i.test(text) || /game session missing self|no-self/i.test(reason || '')) {
    return '已登录但自身实体不可见，退出等待重连';
  }
  if (/injury hp drop/.test(reasonValue) && text) return stripReconnectSuffix(text);
  const fallback = stripReconnectSuffix(text);
  if (/[\u4e00-\u9fff]/.test(fallback) && !/[A-Za-z][A-Za-z -]*:/.test(fallback)) return fallback;
  return knownReasonText(reason) || knownReasonText(summary) || '原因未归类';
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
  return verboseExitText(reason, summary, null);
}

function buildExitEvents(entries) {
  const groups = new Map();
  for (const entry of entries.filter(item => item.type === 'exit-audit')) {
    const evidence = normalizeExitEvidence(entry);
    const id = entry.exitAuditId || `${entry.__file}:${entry.__line}`;
    const current = groups.get(id) || {
      id,
      firstAt: entry.__at,
      lastAt: entry.__at,
      confirmedAt: 0,
      reason: '',
      summary: '',
      evidence: null,
      version: '',
      files: new Set()
    };
    current.firstAt = Math.min(current.firstAt, entry.__at);
    current.lastAt = Math.max(current.lastAt, entry.__at);
    current.confirmedAt = Math.max(current.confirmedAt, number(entry.confirmedAt));
    current.reason = entry.reason || current.reason;
    current.summary = entry.summary || current.summary;
    current.evidence = betterExitEvidence(current.evidence, evidence);
    current.version = entry.version || current.version;
    current.files.add(entry.__file);
    groups.set(id, current);
  }
  return Array.from(groups.values()).sort((a, b) => a.firstAt - b.firstAt);
}

function exitEventTime(event) {
  return number(event?.confirmedAt) || number(event?.lastAt) || number(event?.firstAt);
}

function exitEventInSession(event, session, nextLoginAt = Infinity) {
  const at = exitEventTime(event);
  const loginAt = number(session?.loginAt);
  const exitAt = number(session?.exitAt) || nextLoginAt;
  return at && loginAt && at >= loginAt && at <= exitAt + 5000;
}

function targetMatchesExitEvidence(combat, evidence) {
  if (!combat || !evidence) return false;
  const combatKey = combat.enemy?.id !== null && combat.enemy?.id !== undefined && combat.enemy?.id !== ''
    ? `id:${combat.enemy.id}`
    : (combat.enemy?.name ? `name:${combat.enemy.name}` : '');
  const evidenceKey = evidence.target?.key || (evidence.target?.id !== null && evidence.target?.id !== undefined && evidence.target?.id !== ''
    ? `id:${evidence.target.id}`
    : (evidence.target?.name ? `name:${evidence.target.name}` : ''));
  if (combatKey && evidenceKey && combatKey === evidenceKey) return true;
  const injuryKey = evidence.injury?.sourceId !== null && evidence.injury?.sourceId !== undefined && evidence.injury?.sourceId !== ''
    ? `id:${evidence.injury.sourceId}`
    : (evidence.injury?.sourceName ? `name:${evidence.injury.sourceName}` : '');
  if (combatKey && injuryKey && combatKey === injuryKey) return true;
  return Boolean(combat.enemy?.name && (
    (evidence.target?.name && combat.enemy.name === evidence.target.name)
    || (evidence.injury?.sourceName && combat.enemy.name === evidence.injury.sourceName)
  ));
}

function attachExitEvidenceToSessions(sessionList, exitEvents) {
  for (let i = 0; i < sessionList.length; i += 1) {
    const session = sessionList[i];
    const nextLoginAt = number(sessionList[i + 1]?.loginAt, Infinity);
    const evidence = exitEvents
      .filter(event => exitEventInSession(event, session, nextLoginAt))
      .map(event => event.evidence)
      .filter(Boolean)
      .reduce((best, item) => betterExitEvidence(best, item), null);
    if (evidence) session.exitEvidence = betterExitEvidence(session.exitEvidence, evidence);
  }
}

function attachExitEvidenceToCombats(combatList, sessionList, exitEvents) {
  for (const combat of combatList) {
    const session = combat.sessionId ? sessionList.find(item => item.sessionId === combat.sessionId) : null;
    const sessionIndex = session ? sessionList.indexOf(session) : -1;
    const nextLoginAt = sessionIndex >= 0 ? number(sessionList[sessionIndex + 1]?.loginAt, Infinity) : Infinity;
    const evidence = exitEvents
      .filter(event => (!session || exitEventInSession(event, session, nextLoginAt))
        && exitEventTime(event) >= number(combat.startedAt) - 5000
        && exitEventTime(event) <= (number(combat.endedAt) || number(combat.startedAt)) + 5000
        && targetMatchesExitEvidence(combat, event.evidence))
      .map(event => event.evidence)
      .filter(Boolean)
      .reduce((best, item) => betterExitEvidence(best, item), null);
    if (evidence) combat.exitEvidence = betterExitEvidence(combat.exitEvidence, evidence);
  }
}

function buildReport(entries, options = {}) {
  const importantEventsById = new Map();
  const sessionEndEvents = [];
  for (const entry of entries.filter(item => item.type === 'important-log')) {
    if (entry.importantType === 'session-end') {
      sessionEndEvents.push(entry);
      continue;
    }
    const id = entry.importantLogId || `${entry.__file}:${entry.__line}`;
    const previous = importantEventsById.get(id);
    if (!previous || number(entry.__at) >= number(previous.__at)) importantEventsById.set(id, entry);
  }
  const importantEvents = [...Array.from(importantEventsById.values()), ...sessionEndEvents].sort((a, b) => a.__at - b.__at);
  const sessions = new Map();
  const killEvents = new Map();
  const combats = new Map();
  for (const event of importantEvents) {
    if (event.session && event.session.sessionId) {
      const sessionPayload = { ...event.session };
      if (event.exitReason && !sessionPayload.exitReason) sessionPayload.exitReason = event.exitReason;
      if (event.exitSummary && !sessionPayload.exitSummary) sessionPayload.exitSummary = event.exitSummary;
      sessions.set(sessionPayload.sessionId, mergeSession(sessions.get(sessionPayload.sessionId), sessionPayload));
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
    }
    const collectedCoins = sessionCollectedCoins(session);
    session.coinsGained = collectedCoins;
    session.pureRefreshCoins = Math.max(0, collectedCoins - number(session.attributedKillRewardCoins || session.killRewardCoins));
    session.dropMatchedKillCount = kills.filter(kill => kill.dropMatched).length;
    session.chatConfirmedKillCount = kills.filter(kill => kill.chatConfirmed).length;
    if (!number(session.exitAt)) {
      const exit = exitEvents.find(item => item.firstAt >= number(session.loginAt) && item.firstAt < nextLoginAt);
      if (exit) {
        session.inferredExit = true;
        session.exitAt = exit.confirmedAt || exit.lastAt || exit.firstAt;
        session.exitReason = exit.reason;
        session.exitSummary = exit.summary;
        session.exitEvidence = betterExitEvidence(session.exitEvidence, exit.evidence);
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
  attachExitEvidenceToSessions(sessionList, exitEvents);
  attachExitEvidenceToCombats(combatList, sessionList, exitEvents);
  const battleOutcomes = buildBattleOutcomes(sessionList, combatList);
  const battleTotals = battleOutcomeTotals(battleOutcomes);
  const completed = sessionList.filter(item => number(item.exitAt) && !item.inferredExit);
  const inferred = sessionList.filter(item => number(item.exitAt) && item.inferredExit);
  const open = sessionList.filter(item => !number(item.exitAt));
  return {
    day: options.day || '',
    entries: entries.length,
    files: Array.from(new Set(entries.map(item => item.__file))).sort(),
    sessions: sessionList,
    combats: combatList,
    battleOutcomes,
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
      combatStaminaSpentMs: combatList.reduce((sum, item) => sum + number(item.staminaSpentMs), 0),
      battleOutcomes: battleTotals.count,
      battleOutcomeKills: battleTotals.kills,
      battleOutcomeFailures: battleTotals.failures,
      battleOutcomeRewardCoins: battleTotals.rewardCoins,
      battleOutcomeMissedDropCoins: battleTotals.missedDropCoins,
      battleOutcomeFailedDropCoins: battleTotals.failedDropCoins,
      battleOutcomeStaminaSpentMs: battleTotals.staminaSpentMs
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

function combatHpEvidenceText(combat) {
  if (!combat) return '';
  return detailJoin([
    `本段战斗${formatDuration(combat.durationMs)}`,
    `我方血量${formatHpChange(combat.selfHpStart, combat.selfHpEnd, combat.selfHpDelta)}`,
    `对方血量${formatHpChange(combat.enemyHpStart, combat.enemyHpEnd, combat.enemyHpDelta)}`
  ]);
}

function combatExitEvidenceText(combat) {
  const evidence = combat?.exitEvidence || null;
  if (!evidence) return '';
  const reasonTextValue = verboseExitText(evidence.reason, evidence.summary, evidence);
  return detailJoin([reasonTextValue, combatHpEvidenceText(combat)]);
}

function formatEnemy(enemy) {
  const name = String(enemy?.name || '').trim();
  const id = enemy?.id === null || enemy?.id === undefined || enemy?.id === '' ? '' : String(enemy.id);
  if (name && id) return `${name}（${id}）`;
  return name || id || '-';
}

function formatOutcomeEnemy(enemy) {
  const name = String(enemy?.name || '').trim();
  const id = enemy?.id === null || enemy?.id === undefined || enemy?.id === '' ? '' : String(enemy.id);
  if (name && id) return `${name}(#${id})`;
  if (id) return `#${id}`;
  return name || '-';
}

function formatOutcomeTimeRange(startedAt, endedAt) {
  const start = formatTime(startedAt);
  const end = formatTime(endedAt || startedAt);
  return `${start}-${end}`;
}

function formatOutcomeStamina(value) {
  return value === null || value === undefined || !Number.isFinite(Number(value)) ? '-' : formatStaminaSpent(value);
}

function formatOutcomeDrop(value) {
  return value === null || value === undefined || !Number.isFinite(Number(value)) ? '-' : String(number(value));
}

function formatOutcomeReward(outcome) {
  if (!outcome) return '0币';
  return `${formatCoins(number(outcome.rewardCoins))}（${String(outcome.rewardStatus || '')}）`;
}

function playerCategoryText(category) {
  const value = String(category || '').toLowerCase();
  if (value === 'active') return '活跃';
  if (value === 'afk') return '挂机';
  return '未知';
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
  if (value === 'combat-hp-disadvantage-leave') return 'HP劣势';
  if (value === 'combat-low-hp-leave') return '低血或近身风险';
  if (value === 'combat-critical-hp-leave') return '血量过低';
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
  if (reasonValue === 'target-switched') return '目标切换：改打其他目标，原目标记录结束';
  if (reasonValue === 'post-combat-timeout' && /target-retreating/.test(`${startReason} ${lastReason}`)) {
    return '敌方逃离：目标脱离交火范围';
  }
  if (reasonValue === 'post-combat-timeout') return '敌方逃离：目标消失或脱离交火范围';
  if (value === 'left') {
    if (reasonValue === 'enemy-leave-wait' || reasonValue === 'exit-confirmed') {
      const evidenceText = combatExitEvidenceText(combat);
      if (evidenceText) return `我方主动退出：${evidenceText}；退出后等待安全重登`;
      const hpText = combatHpDisadvantageText(combat);
      return hpText
        ? `我方主动退出：退出后等待安全重登；缺少具体退出原因，只记录到${hpText}`
        : '我方主动退出：退出后等待安全重登；缺少具体退出原因';
    }
    return detail ? `我方主动退出：${detail}` : '我方主动退出';
  }
  if (value === 'retreated') return detail ? `我方脱战：${detail}（未退出本局）` : '我方脱战（未退出本局）';
  if (value === 'disengaged') return detail ? `敌方逃离：${detail}` : '敌方逃离：目标消失或脱离交火范围';
  if (value === 'ongoing') return detail ? `仍在记录中：${detail}` : '仍在记录中';
  return detail ? `状态未归类：${detail}` : '状态未归类';
}

function killOutcomeKey(kill) {
  const normalized = normalizeKill(kill);
  if (!normalized) return '';
  const identity = normalized.id !== null && normalized.id !== undefined && normalized.id !== '' ? `id:${normalized.id}` : `name:${normalized.name || ''}`;
  return [
    number(normalized.at),
    identity,
    number(normalized.targetDropCoins)
  ].join('|');
}

function killMatchesCombat(kill, combat) {
  if (!kill || !combat) return false;
  const id = kill.id ?? kill.userId;
  const enemyId = combat.enemy?.id;
  if (id !== null && id !== undefined && id !== '' && enemyId !== null && enemyId !== undefined && enemyId !== '' && String(id) === String(enemyId)) return true;
  const name = String(kill.name || kill.victim || '').trim();
  const enemyName = String(combat.enemy?.name || '').trim();
  return Boolean(name && enemyName && name === enemyName);
}

function findSessionForCombat(combat, sessions) {
  if (!combat) return null;
  if (combat.sessionId) {
    const byId = sessions.find(item => item.sessionId === combat.sessionId);
    if (byId) return byId;
  }
  return sessions.find(session => {
    const loginAt = number(session.loginAt);
    const exitAt = number(session.exitAt) || Infinity;
    const startedAt = number(combat.startedAt);
    return loginAt && startedAt >= loginAt && startedAt <= exitAt;
  }) || null;
}

function findKillForCombat(combat, sessions) {
  const session = findSessionForCombat(combat, sessions);
  const kills = Array.isArray(session?.kills) ? session.kills.map(normalizeKill).filter(Boolean) : [];
  const endedAt = number(combat?.endedAt) || number(combat?.updatedAt) || number(combat?.startedAt);
  const candidates = kills
    .filter(kill => killMatchesCombat(kill, combat))
    .map(kill => ({ kill, age: Math.abs(number(kill.at) - endedAt) }))
    .filter(item => !endedAt || item.age <= 120000);
  candidates.sort((a, b) => a.age - b.age || number(b.kill.rewardCoins) - number(a.kill.rewardCoins));
  return candidates[0]?.kill || null;
}

function combineCombatKill(combat, sessionKill) {
  const combatKill = normalizeKill(combat?.kill);
  const merged = { ...(combatKill || {}), ...(sessionKill || {}) };
  if (!combatKill && !sessionKill) {
    return {
      at: number(combat?.endedAt) || number(combat?.startedAt),
      name: combat?.enemy?.name || '',
      id: combat?.enemy?.id ?? null,
      rewardCoins: 0,
      reportedRewardCoins: number(combat?.enemy?.drop),
      targetDropCoins: number(combat?.enemy?.drop),
      rewardConfirmed: false,
      killConfirmed: false,
      playerCategory: normalizePlayerCategory({ mode: combat?.enemy?.mode }),
      afk: false,
      active: false
    };
  }
  const targetDropCoins = Math.max(number(combat?.enemy?.drop), number(combatKill?.targetDropCoins), number(sessionKill?.targetDropCoins));
  const rewardConfirmed = Boolean(combatKill?.rewardConfirmed || sessionKill?.rewardConfirmed || combatKill?.dropMatched || sessionKill?.dropMatched);
  const killConfirmed = Boolean(rewardConfirmed || combatKill?.killConfirmed || sessionKill?.killConfirmed || combat?.result === 'won');
  const rawRewardCoins = Math.max(number(combatKill?.reportedRewardCoins), number(sessionKill?.reportedRewardCoins), targetDropCoins);
  let playerCategory = normalizePlayerCategory(sessionKill || combatKill || {});
  if (String(combat?.enemy?.mode || '').toLowerCase() === 'active') playerCategory = 'active';
  return {
    ...merged,
    at: number(merged.at) || number(combat?.endedAt) || number(combat?.startedAt),
    name: merged.name || combat?.enemy?.name || '',
    id: merged.id ?? combat?.enemy?.id ?? null,
    targetDropCoins,
    reportedRewardCoins: rawRewardCoins,
    rewardConfirmed,
    killConfirmed,
    rewardCoins: rewardConfirmed ? Math.max(number(combatKill?.rewardCoins), number(sessionKill?.rewardCoins), rawRewardCoins) : 0,
    playerCategory,
    afk: playerCategory === 'afk',
    active: playerCategory === 'active'
  };
}

function combatIsBattleFailure(combat) {
  if (!combat) return false;
  const result = String(combat.result || '').toLowerCase();
  if (result === 'lost') return true;
  if (result !== 'left') return false;
  const text = [
    combat.resultReason,
    combat.lastReason,
    combat.startReason,
    combat.exitReason,
    combat.exitSummary,
    combat.exitEvidence?.reason,
    combat.exitEvidence?.summary
  ].join(' ').toLowerCase();
  return /combat[-\s_]*(hp|low|critical|trade)|hp disadvantage|low hp|critical hp|disadvantage|injury|pursuit|劣势|低血|久攻未中|交换比/.test(text);
}

function outcomePlayerCategory(combat, kill) {
  if (String(combat?.enemy?.mode || '').toLowerCase() === 'active') return 'active';
  const fromKill = normalizePlayerCategory(kill);
  if (fromKill !== 'unknown') return fromKill;
  const mode = String(combat?.enemy?.mode || kill?.mode || '').toLowerCase();
  if (mode === 'active') return 'active';
  if (mode === 'passive') return 'afk';
  return 'unknown';
}

function buildBattleOutcomes(sessions, combats) {
  const outcomes = [];
  const usedKills = new Set();
  for (const combat of combats || []) {
    const sessionKill = findKillForCombat(combat, sessions || []);
    const kill = combineCombatKill(combat, sessionKill);
    if (sessionKill) usedKills.add(killOutcomeKey(sessionKill));
    if (combat.result === 'won' || kill.killConfirmed) {
      const playerCategory = outcomePlayerCategory(combat, kill);
      outcomes.push({
        type: 'kill',
        startedAt: number(combat.startedAt),
        endedAt: number(combat.endedAt) || number(kill.at),
        durationMs: number(combat.durationMs),
        staminaSpentMs: Number.isFinite(Number(combat.staminaSpentMs)) ? Math.max(0, Math.round(Number(combat.staminaSpentMs))) : null,
        enemy: { id: kill.id ?? combat.enemy?.id ?? null, name: kill.name || combat.enemy?.name || '' },
        playerCategory,
        drop: Math.max(number(combat.enemy?.drop), number(kill.targetDropCoins), number(kill.reportedRewardCoins)),
        status: '确认击杀',
        rewardCoins: number(kill.rewardCoins),
        rewardStatus: number(kill.rewardCoins) > 0 ? '已拾取' : '未拾取',
        combatSummaryId: combat.combatSummaryId || '',
        sessionId: combat.sessionId || '',
        source: 'combat-summary'
      });
    } else if (combatIsBattleFailure(combat)) {
      outcomes.push({
        type: 'failure',
        startedAt: number(combat.startedAt),
        endedAt: number(combat.endedAt),
        durationMs: number(combat.durationMs),
        staminaSpentMs: Number.isFinite(Number(combat.staminaSpentMs)) ? Math.max(0, Math.round(Number(combat.staminaSpentMs))) : null,
        enemy: { id: combat.enemy?.id ?? null, name: combat.enemy?.name || '' },
        playerCategory: outcomePlayerCategory(combat, null),
        drop: number(combat.enemy?.drop),
        status: combat.result === 'lost' ? '失败' : '劣势离场',
        rewardCoins: 0,
        rewardStatus: '未击杀',
        combatSummaryId: combat.combatSummaryId || '',
        sessionId: combat.sessionId || '',
        source: 'combat-summary'
      });
    }
  }
  for (const session of sessions || []) {
    for (const kill of (Array.isArray(session.kills) ? session.kills.map(normalizeKill).filter(Boolean) : [])) {
      const key = killOutcomeKey(kill);
      if (!kill.killConfirmed || usedKills.has(key)) continue;
      outcomes.push({
        type: 'kill',
        startedAt: number(kill.battleStartedAt) || number(kill.at),
        endedAt: number(kill.battleEndedAt) || number(kill.at),
        durationMs: number(kill.battleDurationMs),
        staminaSpentMs: kill.battleStaminaSpentMs,
        enemy: { id: kill.id ?? null, name: kill.name || '' },
        playerCategory: normalizePlayerCategory(kill),
        drop: Math.max(number(kill.targetDropCoins), number(kill.reportedRewardCoins)),
        status: '确认击杀',
        rewardCoins: number(kill.rewardCoins),
        rewardStatus: number(kill.rewardCoins) > 0 ? '已拾取' : '未拾取',
        combatSummaryId: '',
        sessionId: session.sessionId || '',
        source: 'kill'
      });
      usedKills.add(key);
    }
  }
  return outcomes.sort((a, b) => number(a.startedAt) - number(b.startedAt) || number(a.endedAt) - number(b.endedAt));
}

function battleOutcomeTotals(outcomes) {
  const list = outcomes || [];
  return {
    count: list.length,
    kills: list.filter(item => item.type === 'kill').length,
    failures: list.filter(item => item.type === 'failure').length,
    rewardCoins: list.reduce((sum, item) => sum + number(item.rewardCoins), 0),
    missedDropCoins: list.filter(item => item.type === 'kill' && number(item.rewardCoins) <= 0).reduce((sum, item) => sum + number(item.drop), 0),
    failedDropCoins: list.filter(item => item.type === 'failure').reduce((sum, item) => sum + number(item.drop), 0),
    staminaSpentMs: list.reduce((sum, item) => sum + number(item.staminaSpentMs), 0)
  };
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
      ? `推断收口：${verboseExitText(session.exitReason, session.exitSummary, session.exitEvidence)}`
      : session.incomplete && !number(session.exitAt)
      ? (session.nextLoginAt ? `日志尚未收口：下一次登录在${formatDuration(session.nextLoginAt - number(session.loginAt))}后出现` : '日志尚未收口')
      : verboseExitText(session.exitReason, session.exitSummary, session.exitEvidence);
    console.log(`| ${index + 1} | ${formatTime(session.loginAt)} | ${exit} | ${formatDuration(session.loginDurationMs)} | ${formatStaminaSpent(session.staminaSpentMs)} | ${formatCoins(session.pureRefreshCoins)} | ${formatKillCell(session.afkKillCount, session.afkKillRewardCoins, session.afkUnconfirmedDropCoins, session.afkUnconfirmedKillCount)} | ${formatKillCell(session.activeKillCount, session.activeKillRewardCoins, session.activeUnconfirmedDropCoins, session.activeUnconfirmedKillCount)} | ${formatCoins(session.coinsGained)} | ${status} |`);
  });
  console.log('');
  console.log(`登录合计：明确退出${report.totals.completed}/${report.totals.sessions}，推断收口${report.totals.inferred}，尚未收口${report.totals.incomplete}，总耗时${formatDuration(report.totals.loginDurationMs)}，消耗体力${formatStaminaSpent(report.totals.staminaSpentMs)}，拾取刷新金币${report.totals.pureRefreshCoins}币，击杀挂机玩家${formatKillCell(report.totals.afkKillCount, report.totals.afkKillRewardCoins, report.totals.afkUnconfirmedDropCoins, report.totals.afkUnconfirmedKillCount)}，击杀活跃玩家${formatKillCell(report.totals.activeKillCount, report.totals.activeKillRewardCoins, report.totals.activeUnconfirmedDropCoins, report.totals.activeUnconfirmedKillCount)}，总收益${report.totals.coinsGained}币`);
  console.log('');
  console.log('## 实际战斗收益统计');
  console.log('说明：只统计确认击杀和失败/劣势离场；敌方逃离、目标切换、未交战安全避让不计入。收益只按已拾取的掉落金币计算，确认击杀但未拾取显示收益+0（未拾取）。');
  console.log('');
  if (!report.battleOutcomes.length) {
    console.log('无记录');
  } else {
    console.log('| # | 开始时间 | 结束时间 | 耗时 | 消耗体力 | 战斗对象 | 类别 | Drop | 结果 | 实际收益 |');
    console.log('|---:|---|---|---:|---:|---|---|---:|---|---|');
    report.battleOutcomes.forEach((outcome, index) => {
      console.log(`| ${index + 1} | ${formatTime(outcome.startedAt)} | ${formatTime(outcome.endedAt || outcome.startedAt)} | ${formatDuration(outcome.durationMs)} | ${formatOutcomeStamina(outcome.staminaSpentMs)} | ${formatOutcomeEnemy(outcome.enemy)} | ${playerCategoryText(outcome.playerCategory)} | ${formatOutcomeDrop(outcome.drop)} | ${outcome.status} | ${formatOutcomeReward(outcome)} |`);
    });
    console.log('');
    console.log(`实际战斗收益合计：记录${report.totals.battleOutcomes}，确认击杀${report.totals.battleOutcomeKills}，失败/劣势离场${report.totals.battleOutcomeFailures}，已拾取收益${report.totals.battleOutcomeRewardCoins}币，确认击杀未拾取Drop${report.totals.battleOutcomeMissedDropCoins}币，失败未获Drop${report.totals.battleOutcomeFailedDropCoins}币，消耗体力${formatStaminaSpent(report.totals.battleOutcomeStaminaSpentMs)}`);
  }
  console.log('');
  console.log('## 活跃玩家战斗统计');
  console.log('说明：战斗结果先按互斥一级类别归类：胜利、失败、我方主动退出、敌方逃离、目标切换；冒号后是该类别下的触发原因或证据。敌方逃离包括目标脱离范围、突然消失、退出或传送；避开无敌目标属于安全移动，不计入本表。');
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
  const s3 = 'session-d';
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
      importantType: 'session-end',
      importantLogId: `${s2}:end:combat`,
      at: 15000,
      sessionId: s2,
      exitReason: 'leave-success:combat hp disadvantage',
      exitSummary: '与login-threat战斗，交换比劣势，预计承伤倒计时20秒，提前退出',
      session: {
        sessionId: s2,
        loginAt: 10000,
        exitAt: 15000,
        loginDurationMs: 5000,
        staminaSpentMs: 1000,
        pickedCoins: 0,
        coinsGained: 0,
        version: 'bootstrap-0.4.141'
      }
    },
    {
      type: 'important-log',
      importantType: 'session-end',
      importantLogId: `${s2}:end:no-self`,
      at: 18000,
      sessionId: s2,
      exitReason: 'login-before-session-end:no-self',
      exitSummary: '重新登录前上一局已不可用，按登录前收口',
      session: {
        sessionId: s2,
        loginAt: 10000,
        exitAt: 18000,
        loginDurationMs: 8000,
        staminaSpentMs: 2000,
        pickedCoins: 0,
        coinsGained: 0,
        version: 'bootstrap-0.4.141'
      }
    },
    {
      type: 'important-log',
      importantType: 'session-start',
      importantLogId: 'session-c:start',
      at: 20000,
      sessionId: 'session-c',
      session: { sessionId: 'session-c', loginAt: 20000, version: 'bootstrap-0.4.140', staminaSpentMs: 0, coinsGained: 0 }
    },
    {
      type: 'important-log',
      importantType: 'session-start',
      importantLogId: `${s3}:start`,
      at: 30000,
      sessionId: s3,
      session: {
        sessionId: s3,
        loginAt: 30000,
        version: 'bootstrap-0.4.140',
        staminaSpentMs: 0,
        coinsGained: 0,
        baseCoins: 0,
        currentCoins: 0
      }
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
        version: 'bootstrap-0.4.141',
        kills: [
          { at: 3500, name: 'active-target', id: 8, rewardCoins: 4, targetDrop: 4, playerCategory: 'afk', matchedAttack: true, dropMatched: true, source: 'drop-coin-match' }
        ]
      }
    },
    {
      type: 'important-log',
      importantType: 'kill',
      importantLogId: `${s1}:kill-afk`,
      at: 3000,
      sessionId: s1,
      kill: { at: 3000, name: 'afk-target', id: 7, rewardCoins: 9, targetDrop: 9, playerCategory: 'afk', matchedAttack: true, dropMatched: true, battleStartedAt: 1800, battleEndedAt: 3000, battleDurationMs: 1200, battleStaminaSpentMs: 1500 }
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
      kill: { at: 3700, name: 'unpicked-active-target', id: 10, rewardCoins: 30, targetDrop: 30, playerCategory: 'active', combat: true, chatConfirmed: true, dropMatched: false, battleStartedAt: 3200, battleEndedAt: 3700, battleDurationMs: 500, battleStaminaSpentMs: 600 }
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
      at: 13000,
      sessionId: s2,
      combat: {
        combatSummaryId: `${s2}:immediate-exit`,
        sessionId: s2,
        startedAt: 11000,
        endedAt: 13000,
        durationMs: 2000,
        staminaSpentMs: 0,
        enemy: { id: 9, name: 'login-threat', mode: 'Active', drop: 11 },
        selfHpStart: 90,
        selfHpEnd: 70,
        selfHpDelta: -20,
        enemyHpStart: 100,
        enemyHpEnd: 96,
        enemyHpDelta: -4,
        result: 'left',
        resultReason: 'enemy-leave-wait',
        startReason: 'combat-burst-fire',
        lastReason: 'combat-leave-retry',
        engagementObserved: true,
        sampleCount: 5
      }
    },
    {
      type: 'exit-audit',
      auditKind: 'exit-confirmed',
      exitAuditId: `${s2}:exit`,
      at: 15000,
      confirmedAt: 15000,
      reason: 'combat hp disadvantage',
      summary: '与login-threat战斗，交换比劣势，预计承伤倒计时20秒，提前退出',
      self: { hp: 70 },
      target: { id: 9, name: 'login-threat', hp: 96 },
      combat: {
        selfHp: 70,
        targetHp: 96,
        tradeEstimate: {
          active: true,
          sampleCount: 4,
          elapsedMs: 5000,
          selfDamage: 20,
          targetDamage: 4,
          myDps: 0.8,
          enemyDps: 4,
          tKillMs: 120000,
          tDeathMs: 20000
        }
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
    },
    {
      type: 'important-log',
      importantType: 'session-end',
      importantLogId: `${s3}:end`,
      at: 30600,
      sessionId: s3,
      exitReason: 'leave-success:stamina exhausted',
      exitSummary: '一小时和一天体力到达限制，退出等待重连',
      session: {
        sessionId: s3,
        loginAt: 30000,
        exitAt: 30600,
        loginDurationMs: 600,
        staminaSpentMs: 0,
        pickedCoins: 0,
        coinsGained: 1000,
        pureRefreshCoins: 1000,
        killRewardCoins: 0,
        baseCoins: 0,
        currentCoins: 0,
        version: 'bootstrap-0.4.141'
      }
    }
  ]);
  const report = buildReport(readEntries(dayDir), { day });
  assertSelfTest(report.sessions.length === 4, `expected 4 sessions, got ${report.sessions.length}`);
  assertSelfTest(report.sessions[0].exitAt === 5000, 'cross-file session-end was not merged');
  assertSelfTest(report.sessions[0].staminaSpentMs === 123000, 'cross-file stamina was not preserved');
  assertSelfTest(report.sessions[0].pureRefreshCoins === 7, 'pure refreshed coin total was not preserved');
  assertSelfTest(report.sessions[0].afkKillCount === 1 && report.sessions[0].afkKillRewardCoins === 9, 'AFK kill bucket was not computed');
  assertSelfTest(report.sessions[0].activeKillCount === 1 && report.sessions[0].activeKillRewardCoins === 4, 'active kill confirmed reward bucket was not computed');
  const mergedActiveKill = report.sessions[0].kills.find(kill => kill.name === 'active-target');
  assertSelfTest(mergedActiveKill?.playerCategory === 'active' && mergedActiveKill.chatConfirmed === false && mergedActiveKill.dropMatched === true, 'duplicate kill merge did not preserve the stronger active classification');
  assertSelfTest(report.sessions[0].activeUnconfirmedKillCount === 1, 'active unconfirmed kill count was not computed');
  assertSelfTest(report.sessions[0].activeUnconfirmedDropCoins === 30, 'active unconfirmed drop bucket was not computed');
  assertSelfTest(report.sessions[0].afkKillRewardCoins + report.sessions[0].activeKillRewardCoins <= report.sessions[0].coinsGained, 'confirmed kill rewards exceed total gained coins');
  assertSelfTest(report.sessions[1].exitReason === 'leave-success:combat hp disadvantage', 'more specific combat exit reason was overwritten by later no-self closeout');
  const placeholderSession = report.sessions.find(item => item.sessionId === s3);
  assertSelfTest(placeholderSession?.coinsGained === 0, 'explicit zero pickedCoins incorrectly fell back to raw coinsGained');
  assertSelfTest(placeholderSession?.pureRefreshCoins === 0, 'explicit zero pickedCoins incorrectly produced refresh coins');
  assertSelfTest(report.totals.coinsGained === 20, `expected normalized total coins to stay at 20, got ${report.totals.coinsGained}`);
  assertSelfTest(reasonText('login-before-session-end:no-self', '重新登录前上一局已不可用，按登录前收口').includes('上一局已经不可用'), 'login-before no-self closeout was not explained');
  assertSelfTest(report.combats.length === 2, `expected 2 combats, got ${report.combats.length}`);
  assertSelfTest(report.combats.some(item => item.combatSummaryId === `${s2}:immediate-exit`), 'engaged enemy-leave-wait combat was incorrectly filtered out');
  assertSelfTest(!report.combats.some(item => item.combatSummaryId === `${s2}:safety-avoid`), 'safety avoidance was incorrectly counted as combat');
  assertSelfTest(report.combats[0].staminaSpentMs === 2500, 'combat stamina was not preserved');
  assertSelfTest(report.combats[0].selfHpDelta === -18 && report.combats[0].enemyHpDelta === -100, 'combat HP deltas were not preserved');
  assertSelfTest(report.battleOutcomes.length === 4, `expected 4 battle outcomes, got ${report.battleOutcomes.length}`);
  assertSelfTest(report.totals.battleOutcomeKills === 3 && report.totals.battleOutcomeFailures === 1, 'battle outcome kill/failure totals are wrong');
  assertSelfTest(report.totals.battleOutcomeRewardCoins === 13, `expected 13 picked battle reward coins, got ${report.totals.battleOutcomeRewardCoins}`);
  assertSelfTest(report.totals.battleOutcomeMissedDropCoins === 30, 'unpicked confirmed kill drop was not tracked');
  assertSelfTest(report.totals.battleOutcomeFailedDropCoins === 11, 'failed battle drop exposure was not tracked');
  const unpickedOutcome = report.battleOutcomes.find(item => item.enemy.name === 'unpicked-active-target');
  assertSelfTest(unpickedOutcome?.status === '确认击杀' && unpickedOutcome.rewardCoins === 0 && unpickedOutcome.rewardStatus === '未拾取', 'chat-confirmed unpicked kill was not rendered as confirmed zero-profit kill');
  assertSelfTest(unpickedOutcome?.staminaSpentMs === 600, 'standalone kill battle stamina was not preserved');
  const failedOutcome = report.battleOutcomes.find(item => item.enemy.name === 'login-threat');
  assertSelfTest(failedOutcome?.status === '劣势离场' && failedOutcome.rewardStatus === '未击杀', 'combat disadvantage exit was not rendered as failed battle outcome');
  const waitCombat = report.combats.find(item => item.combatSummaryId === `${s2}:immediate-exit`);
  assertSelfTest(waitCombat?.exitEvidence?.trade?.selfDamage === 20, 'enemy-leave-wait combat did not attach exit trade evidence');
  assertSelfTest(resultText('left', 'combat-hp-disadvantage-leave') === '我方主动退出：HP劣势', 'HP-disadvantage exit result text is not exclusive');
  assertSelfTest(resultText('left', 'combat-low-hp-leave') === '我方主动退出：低血或近身风险', 'low-HP exit result text is not exclusive');
  assertSelfTest(resultText('left', 'combat-critical-hp-leave') === '我方主动退出：血量过低', 'critical-HP exit result text is not exclusive');
  assertSelfTest(resultText('left', 'wait-for-full-stamina-and-hp') === '敌方逃离：目标脱离，随后留局恢复', 'recovery wait result text is not folded into enemy flee');
  assertSelfTest(resultText('retreated', 'avoid-invulnerable-target') === '安全避让：避开无敌目标（未退出本局）', 'safety avoidance result text is not explicit');
  assertSelfTest(resultText('disengaged', 'target-switched') === '目标切换：改打其他目标，原目标记录结束', 'target-switched combat result text is not exclusive');
  assertSelfTest(resultText('disengaged', 'post-combat-timeout', { lastReason: 'combat-target-retreating' }) === '敌方逃离：目标脱离交火范围', 'retreating-target combat result text is not explicit');
  assertSelfTest(resultText('disengaged', 'post-combat-timeout') === '敌方逃离：目标消失或脱离交火范围', 'post-combat timeout result text is not folded into enemy flee');
  assertSelfTest(resultText('left', 'enemy-leave-wait', waitCombat).includes('近期换血不利') && resultText('left', 'enemy-leave-wait', waitCombat).includes('退出后等待安全重登'), 'enemy leave wait result text does not include concrete exit evidence');
  const originalLog = console.log;
  const lines = [];
  console.log = (...args) => lines.push(args.join(' '));
  try {
    printReport(report);
  } finally {
    console.log = originalLog;
  }
  assertSelfTest(lines.includes('| # | 开始时间 | 结束时间 | 耗时 | 消耗体力 | 战斗对象 | 类别 | Drop | 结果 | 实际收益 |'), 'actual battle outcome section did not render a table header');
  assertSelfTest(lines.some(line => /\| 1 \| .* \| .* \| .* \| .* \| .* \| .* \| \d+ \| .* \| .*币（/.test(line)), 'actual battle outcome section did not render table rows');
  assertSelfTest(!lines.some(line => /^- \d{2}:\d{2}:\d{2}-/.test(line)), 'actual battle outcome section still renders bullet rows');
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
