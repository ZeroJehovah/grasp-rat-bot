'use strict';

const fs = require('fs');
const path = require('path');
const { redactStructuredSecrets } = require('./session-client');

const SCHEMA_VERSION = 1;
const KILL_ACCOUNTING_VERSION = 3;
const UTC8_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const PICKED_COINS_PER_SELF_DROP = 2;
const DEFAULT_STAMINA_EXHAUSTED_THRESHOLD_MS = 1000;
const DEFAULT_STAMINA_RESET_GRACE_MS = 10000;
const RECENT_EXIT_MATCH_WINDOW_MS = 60000;
const HIGH_DROP_PANEL_THRESHOLD = 500;

function defaultBrowserlessState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: '',
    session: {
      userId: 0,
      sessionToken: '',
      authenticated: false,
      tokenUpdatedAt: '',
      lastAuthUrl: '',
      lastAuthUrlAt: '',
      lastLoginSource: '',
      lastLoginSummary: null
    },
    runner: {
      running: false,
      mode: 'idle',
      readOnly: true,
      controlMode: 'read-only',
      canaryProfile: '',
      dryRun: true,
      combatEnabled: false,
      confirmedLeave: null,
      currentAction: null,
      lastRun: null,
      lastError: ''
    },
    probes: {
      lastSnapshotProbe: null,
      lastReadOnlyProbe: null
    },
    loginPointSafety: {
      ok: false,
      reason: 'unknown',
      point: null,
      checkedAt: '',
      detail: null
    },
    current: {
      self: null,
      stamina: null,
      profit: null,
      combatSummary: null,
      decision: null,
      decisionState: null,
      action: null
    },
    lastKnown: null,
    recentExits: [],
    network: {
      sourceIp: '',
      sourceIps: [],
      lastSelectedAt: '',
      lastSelectionReason: '',
      lastProbe: null,
      lastSwitch: null
    },
    stats: defaultBrowserlessStats(),
    logs: {
      dataDir: '',
      logDir: '',
      stateFile: '',
      currentDayDir: ''
    }
  };
}

function defaultBrowserlessStats() {
  return {
    killAccountingVersion: KILL_ACCOUNTING_VERSION,
    currentSession: {
      online: false,
      sessionId: '',
      userId: 0,
      enteredAt: '',
      enteredTick: null,
      lastSeenAt: '',
      exitedAt: '',
      exitReason: '',
      baseDrop: null,
      lastDrop: null,
      coinsGained: 0,
      lastStamina1dRemaining: null,
      lastStamina1dLimit: null,
      staminaSpentMs: 0,
      killBaselineInitialized: false,
      killBaselineKeys: [],
      killKeys: [],
      kills: 0
    },
    today: {
      day: '',
      uptimeMs: 0,
      staminaSpentMs: 0,
      coinsGained: 0,
      kills: 0,
      sessionCount: 0,
      activeSessionId: '',
      activeEnteredAt: '',
      activeBaseStaminaSpentMs: 0,
      activeBaseCoinsGained: 0,
      activeBaseKills: 0
    },
    lastExit: {
      at: '',
      reason: '',
      runId: '',
      nextRunAt: '',
      reconnectDelayMs: null
    }
  };
}

function cloneJson(value) {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function shouldReplaceStateObject(pathParts) {
  const pathKey = pathParts.join('.');
  return pathKey === 'runner.currentAction'
    || pathKey === 'runner.lastRun'
    || pathKey === 'probes.lastSnapshotProbe'
    || pathKey === 'probes.lastReadOnlyProbe'
    || pathKey === 'current.action'
    || pathKey === 'current.decision'
    || pathKey === 'current.decisionState'
    || pathKey === 'lastKnown.self'
    || pathKey === 'lastKnown.stamina';
}

function mergeState(base, patch, pathParts = []) {
  const output = isPlainObject(base) ? { ...base } : {};
  for (const [key, value] of Object.entries(patch || {})) {
    const nextPath = [...pathParts, key];
    if (shouldReplaceStateObject(nextPath)) {
      output[key] = cloneJson(value);
    } else if (isPlainObject(value) && isPlainObject(output[key])) {
      output[key] = mergeState(output[key], value, nextPath);
    } else {
      output[key] = cloneJson(value);
    }
  }
  return output;
}

function stateFilePath(config) {
  if (config?.stateFile) return path.resolve(config.stateFile);
  return path.join(path.resolve(config?.dataDir || path.join(process.cwd(), 'data', 'browserless-runner')), 'state.json');
}

function readBrowserlessStateFile(file, fallback = null) {
  const base = fallback || defaultBrowserlessState();
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return normalizeBrowserlessState(mergeState(base, parsed), file);
  } catch (_) {
    return normalizeBrowserlessState(base, file);
  }
}

function writeBrowserlessStateFile(file, state) {
  const normalized = normalizeBrowserlessState(state, file);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(normalized, null, 2) + '\n');
  return normalized;
}

function updateBrowserlessStateFile(file, patch, options = {}) {
  const current = readBrowserlessStateFile(file);
  const updated = mergeState(current, {
    ...patch,
    updatedAt: options.updatedAt || new Date().toISOString()
  });
  return writeBrowserlessStateFile(file, updated);
}

function normalizeBrowserlessState(state, file = '') {
  const normalized = mergeState(defaultBrowserlessState(), state || {});
  normalized.schemaVersion = SCHEMA_VERSION;
  normalized.session.userId = Number(normalized.session.userId || 0);
  normalized.session.sessionToken = String(normalized.session.sessionToken || '');
  normalized.session.authenticated = Boolean(normalized.session.userId && normalized.session.sessionToken);
  normalized.runner.running = Boolean(normalized.runner.running);
  normalized.runner.readOnly = normalized.runner.readOnly !== false;
  normalized.runner.dryRun = normalized.runner.dryRun !== false;
  normalized.lastKnown = normalizeBrowserlessLastKnown(
    normalized.lastKnown,
    normalized.current,
    normalized.updatedAt
  );
  normalized.recentExits = Array.isArray(normalized.recentExits) ? normalized.recentExits.slice(-20) : [];
  normalized.stats = normalizeBrowserlessStats(normalized.stats, state?.stats);
  normalized.network.sourceIp = String(normalized.network.sourceIp || '');
  normalized.network.sourceIps = Array.isArray(normalized.network.sourceIps)
    ? normalized.network.sourceIps.map(item => String(item || '').trim()).filter(Boolean)
    : [];
  if (file) normalized.logs.stateFile = path.resolve(file);
  return normalized;
}

function loginPointFromAnyState(state) {
  const point = state?.loginPointSafety?.point
    || state?.current?.self
    || state?.lastSelfSummary
    || null;
  if (!point || !Number.isFinite(Number(point.x)) || !Number.isFinite(Number(point.y))) return null;
  return {
    x: Number(point.x),
    y: Number(point.y),
    hp: Number.isFinite(Number(point.hp)) ? Number(point.hp) : null,
    source: point.source || 'state'
  };
}

function sessionFromAnyState(state) {
  const userId = Number(state?.session?.userId || state?.userId || 0);
  const sessionToken = String(state?.session?.sessionToken || state?.sessionToken || '');
  return {
    userId: Number.isFinite(userId) ? userId : 0,
    sessionToken
  };
}

function browserlessPatchFromLegacyState(state, options = {}) {
  const session = sessionFromAnyState(state);
  const loginPoint = loginPointFromAnyState(state);
  const nowIso = options.updatedAt || new Date().toISOString();
  const patch = {};
  if (session.userId || session.sessionToken) {
    patch.session = {
      userId: session.userId,
      sessionToken: session.sessionToken,
      tokenUpdatedAt: state?.session?.tokenUpdatedAt || (session.sessionToken ? nowIso : '')
    };
  }
  if (loginPoint) {
    patch.loginPointSafety = {
      ok: Boolean(state?.loginPointSafety?.ok),
      reason: state?.loginPointSafety?.reason || 'imported-login-point-pending-snapshot-safety',
      point: {
        ...loginPoint,
        source: options.source || loginPoint.source || 'import'
      },
      checkedAt: state?.loginPointSafety?.checkedAt || ''
    };
    patch.current = {
      self: {
        ...loginPoint,
        name: state?.lastSelfSummary?.name || state?.current?.self?.name || ''
      }
    };
  }
  return patch;
}

function compactNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function compactString(value, maxLength = 160) {
  const text = String(value || '');
  if (!text) return '';
  return text.length > maxLength ? text.slice(0, maxLength - 1) + '...' : text;
}

function parseTimeMs(value) {
  if (Number.isFinite(Number(value)) && Number(value) > 0) return Number(value);
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function isoFromMs(ms) {
  const value = Number(ms);
  return Number.isFinite(value) && value > 0 ? new Date(value).toISOString() : '';
}

function eventTimeMs(value, fallbackMs = Date.now()) {
  const parsed = parseTimeMs(value);
  if (parsed > 0) return parsed;
  const fallback = Number(fallbackMs);
  return Number.isFinite(fallback) && fallback > 0 ? fallback : Date.now();
}

function browserlessStatsDayKey(ms) {
  return new Date(eventTimeMs(ms, Date.now()) + UTC8_OFFSET_MS).toISOString().slice(0, 10);
}

function browserlessStatsDayStartMs(dayKey) {
  const parsed = Date.parse(String(dayKey || '') + 'T00:00:00.000Z');
  return Number.isFinite(parsed) ? parsed - UTC8_OFFSET_MS : 0;
}

function nextDailyStaminaResetAt(ms = Date.now()) {
  return Math.floor((Number(ms) + UTC8_OFFSET_MS) / DAY_MS) * DAY_MS - UTC8_OFFSET_MS + DAY_MS;
}

function normalizeBrowserlessStats(stats, rawStats = stats) {
  const inputKillAccountingVersion = Number(rawStats?.killAccountingVersion || 0);
  const resetUntrustedKills = inputKillAccountingVersion !== KILL_ACCOUNTING_VERSION;
  const normalized = mergeState(defaultBrowserlessStats(), stats || {});
  const session = normalized.currentSession || {};
  const today = normalized.today || {};
  const lastExit = normalized.lastExit || {};
  const enteredTick = resetUntrustedKills ? null : compactNumber(session.enteredTick);
  const killBaselineKeys = resetUntrustedKills
    ? []
    : (Array.isArray(session.killBaselineKeys)
        ? session.killBaselineKeys.map(item => compactString(item, 120)).filter(Boolean).slice(-300)
        : []);
  const killKeys = resetUntrustedKills
    ? []
    : normalizeSessionKillKeys(session.killKeys, {
        ...session,
        enteredTick,
        killBaselineKeys
      });
  normalized.killAccountingVersion = KILL_ACCOUNTING_VERSION;
  normalized.currentSession = {
    ...session,
    online: Boolean(session.online),
    sessionId: compactString(session.sessionId, 96),
    userId: compactNumber(session.userId) || 0,
    enteredAt: compactString(session.enteredAt, 48),
    enteredTick,
    lastSeenAt: compactString(session.lastSeenAt, 48),
    exitedAt: compactString(session.exitedAt, 48),
    exitReason: compactString(session.exitReason, 160),
    baseDrop: compactNumber(session.baseDrop),
    lastDrop: compactNumber(session.lastDrop),
    coinsGained: Math.max(0, Math.round(Number(session.coinsGained || 0) || 0)),
    lastStamina1dRemaining: compactNumber(session.lastStamina1dRemaining),
    lastStamina1dLimit: compactNumber(session.lastStamina1dLimit),
    staminaSpentMs: Math.max(0, Math.round(Number(session.staminaSpentMs || 0) || 0)),
    killBaselineInitialized: resetUntrustedKills ? false : Boolean(session.killBaselineInitialized),
    killBaselineKeys,
    killKeys,
    kills: killKeys.length
  };
  normalized.today = {
    ...today,
    day: compactString(today.day, 16),
    uptimeMs: Math.max(0, Math.round(Number(today.uptimeMs || 0) || 0)),
    staminaSpentMs: Math.max(0, Math.round(Number(today.staminaSpentMs || 0) || 0)),
    coinsGained: Math.max(0, Math.round(Number(today.coinsGained || 0) || 0)),
    kills: resetUntrustedKills ? 0 : Math.max(0, Math.round(Number(today.kills || 0) || 0)),
    sessionCount: Math.max(0, Math.round(Number(today.sessionCount || 0) || 0)),
    activeSessionId: compactString(today.activeSessionId, 96),
    activeEnteredAt: compactString(today.activeEnteredAt, 48),
    activeBaseStaminaSpentMs: Math.max(0, Math.round(Number(today.activeBaseStaminaSpentMs || 0) || 0)),
    activeBaseCoinsGained: Math.max(0, Math.round(Number(today.activeBaseCoinsGained || 0) || 0)),
    activeBaseKills: resetUntrustedKills ? 0 : Math.max(0, Math.round(Number(today.activeBaseKills || 0) || 0))
  };
  normalized.lastExit = {
    at: compactString(lastExit.at, 48),
    reason: compactString(lastExit.reason, 160),
    runId: compactString(lastExit.runId, 96),
    nextRunAt: compactString(lastExit.nextRunAt, 48),
    reconnectDelayMs: compactNumber(lastExit.reconnectDelayMs)
  };
  return normalized;
}

function resetBrowserlessTodayStats(day) {
  return {
    ...defaultBrowserlessStats().today,
    day
  };
}

function ensureBrowserlessStatsDay(stats, nowMs) {
  const day = browserlessStatsDayKey(nowMs);
  if (stats.today.day === day) return stats;
  stats.today = resetBrowserlessTodayStats(day);
  const session = stats.currentSession || {};
  if (session.online && session.sessionId) {
    stats.today.activeSessionId = session.sessionId;
    stats.today.activeEnteredAt = isoFromMs(Math.max(eventTimeMs(nowMs), browserlessStatsDayStartMs(day)));
    stats.today.activeBaseStaminaSpentMs = Math.max(0, Number(session.staminaSpentMs || 0) || 0);
    stats.today.activeBaseCoinsGained = Math.max(0, Number(session.coinsGained || 0) || 0);
    stats.today.activeBaseKills = Math.max(0, Number(session.kills || 0) || 0);
  }
  return stats;
}

function statsSelfDrop(self) {
  if (self?.dropKnown === false) return null;
  return compactNumber(self?.drop ?? self?.death_drop_coins ?? self?.coinsGained);
}

function pickedCoinsFromSelfDropDelta(value) {
  const dropDelta = compactNumber(value);
  if (dropDelta === null) return null;
  return Math.max(0, Math.round(dropDelta * PICKED_COINS_PER_SELF_DROP));
}

function statsSelfUserId(self, state) {
  return compactNumber(self?.userId ?? self?.user_id ?? state?.session?.userId);
}

function statsStamina1dRemaining(stamina, self) {
  return compactNumber(
    stamina?.stamina1dRemainingMilli
      ?? stamina?.remaining1d
      ?? stamina?.stamina1d
      ?? self?.stamina1dRemainingMilli
      ?? self?.stamina_1d_remaining_milli
      ?? self?.stamina1d
  );
}

function statsStamina1dLimit(stamina, self) {
  return compactNumber(
    stamina?.stamina1dLimitMilli
      ?? stamina?.stamina1dLimitMs
      ?? stamina?.stamina1dLimit
      ?? stamina?.limit1d
      ?? self?.stamina1dLimitMilli
      ?? self?.stamina_1d_limit_milli
      ?? self?.stamina1dLimit
      ?? self?.stamina_1d_limit
  );
}

function actualBrowserlessDailyStaminaSpentMs(stats) {
  const today = stats?.today || {};
  const session = stats?.currentSession || {};
  const observedAt = parseTimeMs(session.lastSeenAt);
  if (!today.day || !observedAt || browserlessStatsDayKey(observedAt) !== today.day) return null;
  const remaining = compactNumber(session.lastStamina1dRemaining);
  const limit = compactNumber(session.lastStamina1dLimit);
  if (remaining === null || limit === null || limit <= 0) return null;
  return Math.max(0, Math.round(limit - remaining));
}

function statsKillKey(item) {
  const target = item?.targetUserId ?? item?.target_user_id ?? item?.targetId ?? item?.id;
  const tick = statsKillTick(item);
  if (target === null || target === undefined || target === '') return '';
  return 'self-kill:' + String(target) + ':' + String(tick || 'unknown');
}

function statsKillTick(item) {
  return compactNumber(item?.tick ?? item?.createdTick ?? item?.created_tick);
}

function statsKillTickFromKey(key) {
  const match = /^self-kill:[^:]+:(.+)$/.exec(String(key || ''));
  if (!match || match[1] === 'unknown') return null;
  return compactNumber(match[1]);
}

function normalizeSessionKillKeys(keys, session) {
  if (!Array.isArray(keys)) return [];
  const baseline = new Set(Array.isArray(session?.killBaselineKeys) ? session.killBaselineKeys : []);
  const enteredTick = compactNumber(session?.enteredTick);
  const output = [];
  const seen = new Set();
  for (const rawKey of keys) {
    const key = compactString(rawKey, 120);
    if (!key || seen.has(key) || baseline.has(key)) continue;
    const tick = statsKillTickFromKey(key);
    if (enteredTick !== null) {
      if (tick === null || tick < enteredTick) continue;
    }
    seen.add(key);
    output.push(key);
  }
  return output.slice(-1000);
}

function statsDecisionTick(decision) {
  return compactNumber(decision?.input?.realtime?.tick ?? decision?.tick ?? decision?.input?.fallback?.tick);
}

function statsKillEvidenceFromDecision(decision) {
  return (Array.isArray(decision?.input?.selfKillEvidence) ? decision.input.selfKillEvidence : [])
    .map(item => ({
      key: statsKillKey(item),
      tick: statsKillTick(item)
    }))
    .filter(item => item.key);
}

function ensureSessionKillBaseline(session, decision) {
  const evidence = statsKillEvidenceFromDecision(decision);
  const decisionTick = statsDecisionTick(decision);
  if (session.enteredTick === null && decisionTick !== null) session.enteredTick = decisionTick;
  if (!session.killBaselineInitialized) {
    const baseline = new Set(Array.isArray(session.killBaselineKeys) ? session.killBaselineKeys : []);
    for (const item of evidence) baseline.add(item.key);
    session.killBaselineKeys = Array.from(baseline).slice(-300);
    session.killBaselineInitialized = true;
  }
  return evidence;
}

function startBrowserlessStatsSession(stats, state, self, stamina, nowMs, decision = null) {
  const userId = statsSelfUserId(self, state) || 0;
  const enteredAt = isoFromMs(nowMs);
  const sessionId = `${userId || 'user'}:${enteredAt}`;
  const drop = statsSelfDrop(self);
  const stamina1d = statsStamina1dRemaining(stamina, self);
  const stamina1dLimit = statsStamina1dLimit(stamina, self);
  const killEvidence = statsKillEvidenceFromDecision(decision);
  stats.currentSession = {
    ...defaultBrowserlessStats().currentSession,
    online: true,
    sessionId,
    userId,
    enteredAt,
    enteredTick: statsDecisionTick(decision),
    lastSeenAt: enteredAt,
    baseDrop: drop,
    lastDrop: drop,
    lastStamina1dRemaining: stamina1d,
    lastStamina1dLimit: stamina1dLimit,
    killBaselineInitialized: true,
    killBaselineKeys: killEvidence.map(item => item.key).slice(-300)
  };
  stats.today.activeSessionId = sessionId;
  stats.today.activeEnteredAt = enteredAt;
  stats.today.activeBaseStaminaSpentMs = 0;
  stats.today.activeBaseCoinsGained = 0;
  stats.today.activeBaseKills = 0;
  return stats.currentSession;
}

function updateBrowserlessStatsSessionStamina(session, stamina, self) {
  const stamina1d = statsStamina1dRemaining(stamina, self);
  const stamina1dLimit = statsStamina1dLimit(stamina, self);
  const previousStamina = compactNumber(session.lastStamina1dRemaining);
  if (stamina1d !== null) {
    if (previousStamina !== null && stamina1d < previousStamina) {
      const previousSpent = Math.max(0, Number(session.staminaSpentMs || 0) || 0);
      session.staminaSpentMs = Math.max(0, Math.round(previousSpent + previousStamina - stamina1d));
    }
    session.lastStamina1dRemaining = stamina1d;
  }
  if (stamina1dLimit !== null && stamina1dLimit > 0) session.lastStamina1dLimit = stamina1dLimit;
  return stamina1d !== null;
}

function updateBrowserlessStatsSession(session, decision, self, stamina, nowMs) {
  session.lastSeenAt = isoFromMs(nowMs);
  session.exitedAt = '';
  session.exitReason = '';
  const drop = statsSelfDrop(self);
  if (drop !== null) {
    if (session.baseDrop === null || Number(drop) < Number(session.baseDrop)) session.baseDrop = drop;
    session.lastDrop = drop;
    session.coinsGained = Math.max(
      Math.max(0, Number(session.coinsGained || 0) || 0),
      Math.max(0, Math.round(Number(drop) - Number(session.baseDrop || 0)))
    );
  }
  updateBrowserlessStatsSessionStamina(session, stamina, self);
  const evidence = ensureSessionKillBaseline(session, decision);
  const baselineKeys = new Set(Array.isArray(session.killBaselineKeys) ? session.killBaselineKeys : []);
  const killKeys = new Set(normalizeSessionKillKeys(session.killKeys, session));
  const enteredTick = compactNumber(session.enteredTick);
  for (const item of evidence) {
    if (baselineKeys.has(item.key)) continue;
    if (enteredTick !== null) {
      if (item.tick === null) continue;
      if (item.tick < enteredTick) {
        baselineKeys.add(item.key);
        continue;
      }
    }
    killKeys.add(item.key);
  }
  session.killBaselineKeys = Array.from(baselineKeys).slice(-300);
  session.killKeys = Array.from(killKeys).slice(-1000);
  session.kills = session.killKeys.length;
}

function browserlessStatsForDecision(state, decision, options = {}) {
  const stats = normalizeBrowserlessStats(state?.stats);
  const nowMs = eventTimeMs(decision?.at, options.nowMs);
  ensureBrowserlessStatsDay(stats, nowMs);
  const self = decision?.input?.self || null;
  if (!self || typeof self !== 'object') return stats;
  const stamina = decision?.input?.stamina || null;
  const userId = statsSelfUserId(self, state) || 0;
  const session = stats.currentSession || {};
  if (session.online && session.userId && userId && Number(session.userId) !== Number(userId)) {
    finalizeBrowserlessStatsSession(stats, {
      at: isoFromMs(nowMs),
      reason: 'user-changed'
    }, nowMs);
  }
  const active = stats.currentSession || {};
  if (!active.online || !active.sessionId) {
    startBrowserlessStatsSession(stats, state, self, stamina, nowMs, decision);
  }
  updateBrowserlessStatsSession(stats.currentSession, decision, self, stamina, nowMs);
  return normalizeBrowserlessStats(stats);
}

function todayActiveDelta(stats, nowMs) {
  const session = stats.currentSession || {};
  const today = stats.today || {};
  if (!session.online || !session.sessionId || today.activeSessionId !== session.sessionId) {
    return { uptimeMs: 0, staminaSpentMs: 0, coinsGained: 0, kills: 0 };
  }
  const dayStart = browserlessStatsDayStartMs(today.day || browserlessStatsDayKey(nowMs));
  const enteredMs = Math.max(parseTimeMs(today.activeEnteredAt || session.enteredAt), dayStart);
  const endMs = Math.max(enteredMs, nowMs);
  return {
    uptimeMs: Math.max(0, Math.round(endMs - enteredMs)),
    staminaSpentMs: Math.max(0, Math.round(Number(session.staminaSpentMs || 0) - Number(today.activeBaseStaminaSpentMs || 0))),
    coinsGained: Math.max(0, Math.round(Number(session.coinsGained || 0) - Number(today.activeBaseCoinsGained || 0))),
    kills: Math.max(0, Math.round(Number(session.kills || 0) - Number(today.activeBaseKills || 0)))
  };
}

function finalizeBrowserlessStatsSession(stats, detail = {}, nowMs = Date.now()) {
  ensureBrowserlessStatsDay(stats, nowMs);
  const session = stats.currentSession || {};
  const reason = compactString(detail.reason || session.exitReason || 'offline', 160);
  const at = compactString(detail.at || detail.completedAt || isoFromMs(nowMs), 48);
  let lastExitAt = stats.lastExit.at || '';
  let lastExitReason = stats.lastExit.reason || '';
  let lastExitRunId = stats.lastExit.runId || '';
  if (session.online && session.sessionId) {
    if (updateBrowserlessStatsSessionStamina(session, detail.stamina, detail.self) && at) {
      session.lastSeenAt = at;
    }
    const delta = todayActiveDelta(stats, eventTimeMs(at, nowMs));
    stats.today.uptimeMs += delta.uptimeMs;
    stats.today.staminaSpentMs += delta.staminaSpentMs;
    const actualStaminaSpentMs = actualBrowserlessDailyStaminaSpentMs(stats);
    if (actualStaminaSpentMs !== null) {
      stats.today.staminaSpentMs = Math.max(stats.today.staminaSpentMs, actualStaminaSpentMs);
    }
    stats.today.coinsGained += delta.coinsGained;
    stats.today.kills += delta.kills;
    stats.today.sessionCount += 1;
    if (stats.today.activeSessionId === session.sessionId) {
      stats.today.activeSessionId = '';
      stats.today.activeEnteredAt = '';
      stats.today.activeBaseStaminaSpentMs = 0;
      stats.today.activeBaseCoinsGained = 0;
      stats.today.activeBaseKills = 0;
    }
    session.online = false;
    session.exitedAt = at;
    session.exitReason = reason;
    lastExitAt = at || lastExitAt;
    lastExitReason = reason || lastExitReason;
    lastExitRunId = compactString(detail.runId || lastExitRunId, 96);
  } else if (detail.forceLastExit) {
    lastExitAt = at || lastExitAt;
    lastExitReason = reason || lastExitReason;
    lastExitRunId = compactString(detail.runId || lastExitRunId, 96);
  }
  stats.lastExit = {
    at: lastExitAt,
    reason: lastExitReason,
    runId: lastExitRunId,
    nextRunAt: compactString(detail.nextRunAt || stats.lastExit.nextRunAt, 48),
    reconnectDelayMs: compactNumber(detail.reconnectDelayMs ?? detail.delayMs ?? stats.lastExit.reconnectDelayMs)
  };
  return normalizeBrowserlessStats(stats);
}

function browserlessStatsForOffline(state, detail = {}, options = {}) {
  const stats = normalizeBrowserlessStats(state?.stats);
  const nowMs = eventTimeMs(detail.at || detail.completedAt, options.nowMs);
  return finalizeBrowserlessStatsSession(stats, detail, nowMs);
}

function compactBrowserlessStats(normalized, game, action, options = {}, lastKnown = null) {
  const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  const stats = normalizeBrowserlessStats(normalized?.stats);
  ensureBrowserlessStatsDay(stats, nowMs);
  const session = stats.currentSession || {};
  const online = Boolean(session.online);
  const realtimeOnline = Boolean(game?.inGame && online);
  const enteredMs = parseTimeMs(session.enteredAt);
  const lastSeenMs = parseTimeMs(session.lastSeenAt);
  const exitedMs = parseTimeMs(session.exitedAt);
  const durationEndMs = online ? nowMs : (exitedMs || lastSeenMs || nowMs);
  const activeDelta = todayActiveDelta(stats, nowMs);
  const summedTodayStaminaSpentMs = Math.max(0, Math.round(Number(stats.today.staminaSpentMs || 0) + activeDelta.staminaSpentMs));
  const actualTodayStaminaSpentMs = actualBrowserlessDailyStaminaSpentMs(stats);
  const todayDropDelta = Math.max(0, Math.round(Number(stats.today.coinsGained || 0) + activeDelta.coinsGained));
  const rawNextRunAt = action?.nextRunAt || stats.lastExit.nextRunAt || '';
  const offlineBlocker = compactOfflineBlocker(normalized, lastKnown, options, nowMs);
  const rawNextRunAtMs = parseTimeMs(rawNextRunAt);
  const blockerReadyAtMs = parseTimeMs(offlineBlocker?.nextReadyAt);
  const nextRunAt = blockerReadyAtMs > rawNextRunAtMs
    ? offlineBlocker.nextReadyAt
    : rawNextRunAt;
  const nextRunAtMs = parseTimeMs(nextRunAt);
  return {
    currentSession: {
      online,
      realtimeOnline,
      enteredAt: session.enteredAt || '',
      durationMs: enteredMs ? Math.max(0, Math.round(durationEndMs - enteredMs)) : 0,
      staminaSpentMs: compactNumber(session.staminaSpentMs),
      coinsGained: pickedCoinsFromSelfDropDelta(session.coinsGained),
      kills: compactNumber(session.kills)
    },
    offline: {
      lastExitAt: stats.lastExit.at || session.exitedAt || '',
      lastExitReason: stats.lastExit.reason || session.exitReason || '',
      lastExitRunId: stats.lastExit.runId || '',
      nextReconnectAt: compactString(nextRunAt, 48),
      reconnectRemainingMs: nextRunAtMs ? Math.max(0, Math.round(nextRunAtMs - nowMs)) : null,
      scheduledReconnectAt: compactString(rawNextRunAt, 48),
      blocker: offlineBlocker
    },
    today: {
      day: stats.today.day || browserlessStatsDayKey(nowMs),
      inGameDurationMs: Math.max(0, Math.round(Number(stats.today.uptimeMs || 0) + activeDelta.uptimeMs)),
      staminaSpentMs: actualTodayStaminaSpentMs === null
        ? summedTodayStaminaSpentMs
        : Math.max(summedTodayStaminaSpentMs, actualTodayStaminaSpentMs),
      coinsGained: pickedCoinsFromSelfDropDelta(todayDropDelta),
      kills: Math.max(0, Math.round(Number(stats.today.kills || 0) + activeDelta.kills))
    }
  };
}

function compactPoint(value) {
  if (!value || typeof value !== 'object') return null;
  const x = compactNumber(value.x);
  const y = compactNumber(value.y);
  if (x === null && y === null) return null;
  return {
    x,
    y,
    hp: compactNumber(value.hp),
    source: compactString(value.source, 48)
  };
}

function compactSafetyEntity(value) {
  if (!value || typeof value !== 'object') return null;
  const target = compactTarget({
    type: value.type || 'player',
    id: value.id ?? value.entity_id ?? value.entityId ?? null,
    userId: value.userId ?? value.user_id,
    entityId: value.entityId ?? value.entity_id ?? null,
    name: value.name || value.label,
    authority: value.authority || 'snapshot',
    hp: value.hp,
    drop: value.drop ?? value.Drop ?? value.reward ?? value.coin_reward ?? value.death_reward_preview ?? value.death_drop_coins,
    stamina5s: value.stamina5s ?? value.stamina5sRemainingMilli ?? value.stamina_5s_remaining_milli,
    stamina5sLimit: value.stamina5sLimit ?? value.stamina5sLimitMilli ?? value.stamina_5s_limit_milli,
    amount: value.amount ?? value.value,
    distance: value.distance,
    active: value.active,
    moving: value.moving,
    firing: value.firing
  });
  if (!target) return null;
  return {
    ...target,
    x: compactNumber(value.x),
    y: compactNumber(value.y),
    alive: value.alive === undefined ? null : Boolean(value.alive),
    mode: compactString(value.current_join_mode || value.mode || value.joined, 48),
    joinModeActive: value.joinModeActive === undefined ? null : Boolean(value.joinModeActive),
    stamina5sKnown: value.stamina5sKnown === undefined ? null : Boolean(value.stamina5sKnown),
    fullStamina5s: value.fullStamina5s === undefined ? null : Boolean(value.fullStamina5s),
    knownEasyKill: value.knownEasyKill === undefined ? null : Boolean(value.knownEasyKill),
    knownDamageActor: value.knownDamageActor === undefined ? null : Boolean(value.knownDamageActor),
    trustedEasyKill: value.trustedEasyKill === undefined ? null : Boolean(value.trustedEasyKill)
  };
}

function compactSafetyFreshness(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    ok: value.ok === undefined ? null : Boolean(value.ok),
    reason: compactString(value.reason, 120),
    tick: compactNumber(value.tick),
    latestKnownTick: compactNumber(value.latestKnownTick),
    tickDelta: compactNumber(value.tickDelta)
  };
}

function snapshotSafetyCandidate(value, owner = {}) {
  if (!value || typeof value !== 'object') return null;
  return {
    value,
    timeMs: parseTimeMs(
      value.checkedAt
        || owner.completedAt
        || owner.updatedAt
        || owner.at
        || owner.startedAt
    )
  };
}

function latestSnapshotSafetyCandidateForLoginPoint(normalized) {
  const candidates = [
    snapshotSafetyCandidate(normalized?.loginPointSafety?.snapshotSafety, normalized?.loginPointSafety),
    snapshotSafetyCandidate(normalized?.probes?.lastSnapshotProbe?.snapshotSafety, normalized?.probes?.lastSnapshotProbe),
    snapshotSafetyCandidate(normalized?.probes?.lastReadOnlyProbe?.snapshotSafety, normalized?.probes?.lastReadOnlyProbe),
    snapshotSafetyCandidate(normalized?.runner?.lastRun?.canary?.snapshotSafety, normalized?.runner?.lastRun?.canary)
  ].filter(Boolean);
  candidates.sort((a, b) => b.timeMs - a.timeMs);
  return candidates[0] || null;
}

function latestSnapshotSafetyForLoginPoint(normalized) {
  return latestSnapshotSafetyCandidateForLoginPoint(normalized)?.value || null;
}

function loginPointSafetyReasonPending(reason) {
  return /pending-snapshot-safety|snapshot-safety-streak-pending/i.test(String(reason || ''));
}

function compactLoginPointSafetyDetail(loginPointSafety, normalized) {
  const snapshotCandidate = latestSnapshotSafetyCandidateForLoginPoint(normalized);
  const snapshotSafety = snapshotCandidate?.value || null;
  const response = snapshotSafety?.response && typeof snapshotSafety.response === 'object'
    ? snapshotSafety.response
    : {};
  const summary = response.summary && typeof response.summary === 'object'
    ? response.summary
    : {};
  const snapshotSummarySafety = summary.safety && typeof summary.safety === 'object'
    ? summary.safety
    : {};
  const directDetail = loginPointSafety?.detail && typeof loginPointSafety.detail === 'object'
    ? loginPointSafety.detail
    : {};
  const directDetailTimeMs = parseTimeMs(loginPointSafety?.checkedAt || directDetail.checkedAt);
  const snapshotDetailTimeMs = snapshotCandidate?.timeMs || 0;
  const directDetailPending = loginPointSafetyReasonPending(loginPointSafety?.reason)
    || loginPointSafetyReasonPending(directDetail.reason);
  const hasDirectDetail = Object.keys(directDetail).length > 0;
  const hasSnapshotDetail = Object.keys(snapshotSummarySafety).length > 0;
  const useDirectDetail = hasDirectDetail && (
    directDetailPending
      || !hasSnapshotDetail
      || directDetailTimeMs >= snapshotDetailTimeMs
  );
  const detail = useDirectDetail ? directDetail : (hasSnapshotDetail ? snapshotSummarySafety : directDetail);
  const isolatePendingDetail = Boolean(useDirectDetail && directDetailPending);
  const okValue = detail.ok ?? (isolatePendingDetail ? loginPointSafety?.ok : snapshotSafety?.ok) ?? loginPointSafety?.ok;
  const reason = detail.reason || (useDirectDetail ? loginPointSafety?.reason : snapshotSafety?.reason) || loginPointSafety?.reason || '';
  const unsafeReason = okValue === false
    ? (reason || (useDirectDetail ? directDetail.originalReason : snapshotSafety?.originalReason) || loginPointSafety?.reason || 'unsafe')
    : '';
  const point = compactPoint(
    detail.point
      || snapshotSafety?.loginPoint
      || loginPointSafety?.point
  );
  const hasDetail = Boolean(
    snapshotSafety
      || Object.keys(directDetail).length
      || reason
      || point
  );
  if (!hasDetail) return null;
  const required = compactNumber(detail.required ?? (isolatePendingDetail ? undefined : snapshotSafety?.required) ?? directDetail.required);
  const effectiveRequired = required !== null ? required : 1;
  const streak = compactNumber(detail.streak ?? snapshotSafety?.streak ?? directDetail.streak);
  const effectiveStreak = streak !== null ? streak : (okValue === true ? effectiveRequired : 0);
  const nearestActive = detail.nearestActive
    || (isolatePendingDetail ? null : directDetail.nearestActive);
  const nearestDamageActor = detail.nearestDamageActor
    || (isolatePendingDetail ? null : directDetail.nearestDamageActor);
  const nearestTrustedEasyKill = detail.nearestTrustedEasyKill
    || (isolatePendingDetail ? null : directDetail.nearestTrustedEasyKill);
  const nearestDangerous = detail.nearestDangerous
    || (isolatePendingDetail ? null : directDetail.nearestDangerous)
    || nearestDamageActor
    || (nearestActive?.trustedEasyKill ? null : nearestActive);
  return {
    ok: okValue === undefined ? null : Boolean(okValue),
    reason: compactString(reason, 120),
    unsafeReason: compactString(unsafeReason, 120),
    originalReason: compactString((isolatePendingDetail || useDirectDetail)
      ? directDetail.originalReason
      : (snapshotSafety?.originalReason || directDetail.originalReason), 120),
    checkedAt: compactString(loginPointSafety?.checkedAt || directDetail.checkedAt, 48),
    streak: effectiveStreak,
    required: effectiveRequired,
    satisfied: detail.satisfied === undefined ? null : Boolean(detail.satisfied),
    bypassedPreLoginSafety: Boolean(detail.bypassedPreLoginSafety
      ?? (isolatePendingDetail ? undefined : snapshotSafety?.bypassedPreLoginSafety)
      ?? directDetail.bypassedPreLoginSafety),
    point,
    selfPresent: isolatePendingDetail
      ? (detail.selfPresent === undefined ? null : Boolean(detail.selfPresent))
      : (summary.selfPresent === undefined
      ? (detail.selfPresent === undefined ? null : Boolean(detail.selfPresent))
      : Boolean(summary.selfPresent)),
    nearestActive: compactSafetyEntity(nearestActive),
    nearestDamageActor: compactSafetyEntity(nearestDamageActor),
    nearestTrustedEasyKill: compactSafetyEntity(nearestTrustedEasyKill),
    nearestDangerous: compactSafetyEntity(nearestDangerous),
    damageActorNearbyCount: compactNumber(detail.damageActorNearbyCount),
    trustedEasyKillNearbyCount: compactNumber(detail.trustedEasyKillNearbyCount),
    dangerousNearbyCount: compactNumber(detail.dangerousNearbyCount)
  };
}

function compactTarget(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    type: compactString(value.type, 48),
    id: value.id ?? value.coinId ?? null,
    userId: compactNumber(value.userId),
    entityId: value.entityId ?? null,
    name: compactString(value.name || value.label, 80),
    authority: compactString(value.authority, 48),
    hp: compactNumber(value.hp),
    maxHp: compactNumber(value.maxHp ?? value.max_hp),
    drop: compactNumber(value.drop),
    stamina5s: compactNumber(value.stamina5s ?? value.stamina5sRemainingMilli ?? value.stamina_5s_remaining_milli),
    stamina5sLimit: compactNumber(value.stamina5sLimit ?? value.stamina5sLimitMilli ?? value.stamina_5s_limit_milli),
    stamina1h: compactNumber(value.stamina1h ?? value.stamina1hRemainingMilli ?? value.stamina_1h_remaining_milli),
    stamina1d: compactNumber(value.stamina1d ?? value.stamina1dRemainingMilli ?? value.stamina_1d_remaining_milli),
    staminaMetadataAuthority: compactString(value.staminaMetadataAuthority, 48),
    invulnerable: value.invulnerable === undefined ? null : Boolean(value.invulnerable),
    invulnerableRemainingMs: compactNumber(value.invulnerableRemainingMs ?? value.invulnerable_remaining_ms),
    invulnerableMetadataAuthority: compactString(value.invulnerableMetadataAuthority, 48),
    amount: compactNumber(value.amount ?? value.value),
    distance: compactNumber(value.distance ?? value.d),
    active: value.active === undefined ? null : Boolean(value.active),
    moving: value.moving === undefined ? null : Boolean(value.moving),
    firing: value.firing === undefined ? null : Boolean(value.firing),
    recentlyActive: value.recentlyActive === undefined ? null : Boolean(value.recentlyActive),
    recentlyMoved: value.recentlyMoved === undefined ? null : Boolean(value.recentlyMoved),
    easyKillKnown: value.easyKillKnown === undefined ? null : Boolean(value.easyKillKnown),
    easyKillDamagedToday: value.easyKillDamagedToday === undefined ? null : Boolean(value.easyKillDamagedToday),
    easyKillThreatExempt: value.easyKillThreatExempt === undefined ? null : Boolean(value.easyKillThreatExempt),
    profitMetadataMode: compactString(value.profitMetadataMode, 48),
    profitMetadataActive: value.profitMetadataActive === undefined ? null : Boolean(value.profitMetadataActive)
  };
}

function compactCommand(command) {
  if (!command || typeof command !== 'object') return null;
  return {
    type: compactString(command.type || command.kind, 48),
    dx: compactNumber(command.dx),
    dy: compactNumber(command.dy),
    vx: compactNumber(command.vx),
    vy: compactNumber(command.vy),
    x: compactNumber(command.x),
    y: compactNumber(command.y)
  };
}

function compactAction(action) {
  if (!action || typeof action !== 'object') return null;
  const state = action.actionState && typeof action.actionState === 'object' ? action.actionState : {};
  return {
    ok: action.ok === undefined ? null : Boolean(action.ok),
    kind: compactString(action.kind, 48),
    reason: compactString(action.reason, 120),
    delayMs: compactNumber(action.delayMs),
    nextRunAt: compactString(action.nextRunAt, 48),
    target: compactTarget(action.target),
    movement: action.movement && typeof action.movement === 'object'
      ? {
          ok: action.movement.ok === undefined ? null : Boolean(action.movement.ok),
          skipped: action.movement.skipped === undefined ? null : Boolean(action.movement.skipped),
          reason: compactString(action.movement.reason, 120),
          command: compactCommand(action.movement.command)
        }
      : null,
    shoot: action.shoot && typeof action.shoot === 'object'
      ? {
          ok: action.shoot.ok === undefined ? null : Boolean(action.shoot.ok),
          skipped: action.shoot.skipped === undefined ? null : Boolean(action.shoot.skipped),
          reason: compactString(action.shoot.reason, 120),
          cadenceMs: compactNumber(action.shoot.cadenceMs),
          command: compactCommand(action.shoot.command)
        }
      : null,
    counts: {
      sent: compactNumber(state.sentCount),
      velocity: compactNumber(state.velocitySentCount),
      shoot: compactNumber(state.shootSentCount),
      stop: compactNumber(state.stopCount),
      skipped: compactNumber(state.skippedCount),
      shootRepeat: compactNumber(state.shootRepeatSentCount)
    },
    lastShootAck: state.lastShootAck && typeof state.lastShootAck === 'object'
      ? {
          ok: state.lastShootAck.ok === undefined ? null : Boolean(state.lastShootAck.ok),
          type: compactString(state.lastShootAck.type || state.lastShootAck.kind, 48),
          at: compactString(state.lastShootAck.at, 48)
        }
      : null
  };
}

function compactDecision(decision) {
  if (!decision || typeof decision !== 'object') return null;
  const dataGaps = Array.isArray(decision.input?.dataGaps) ? decision.input.dataGaps : [];
  const kind = String(decision.kind || decision.action?.kind || '');
  const shouldExposeProfitTarget = [
    'coin',
    'seek-coin',
    'profit-candidate',
    'attack',
    'seek-enemy',
    'seek-drop',
    'post-attack-drop-wait'
  ].includes(kind);
  return {
    kind: compactString(decision.kind, 48),
    band: compactString(decision.band, 48),
    reason: compactString(decision.reason, 120),
    at: compactString(decision.at, 48),
    tick: compactNumber(decision.tick),
    actionKind: compactString(decision.action?.kind, 48),
    target: compactTarget(decision.target || decision.action?.target || (shouldExposeProfitTarget ? (decision.profit?.best?.target || decision.profit?.best?.coin) : null)),
    threshold: decision.profit?.threshold && typeof decision.profit.threshold === 'object'
      ? {
          active: decision.profit.threshold.active === undefined ? null : Boolean(decision.profit.threshold.active),
          reason: compactString(decision.profit.threshold.reason, 48),
          coinsPer10Stamina: compactNumber(decision.profit.threshold.threshold?.coinsPer10Stamina),
          remaining1dMilli: compactNumber(decision.profit.threshold.remaining1dMilli),
          burnCapacityMilli: compactNumber(decision.profit.threshold.burnCapacityMilli),
          resetAt: compactNumber(decision.profit.threshold.resetAt),
          reserveMs: compactNumber(decision.profit.threshold.reserveMs),
          rawCount: compactNumber(decision.profit.threshold.rawCount),
          eligibleCount: compactNumber(decision.profit.threshold.eligibleCount),
          filteredCount: compactNumber(decision.profit.threshold.filteredCount)
        }
      : null,
    dataGaps: dataGaps.slice(0, 5).map(item => compactString(item, 80)),
    dataGapCount: dataGaps.length
  };
}

function compactStamina(stamina, self) {
  const source = stamina && typeof stamina === 'object' ? stamina : {};
  const selfSource = self && typeof self === 'object' ? self : {};
  return {
    current: compactNumber(source.stamina ?? selfSource.stamina),
    spent: compactNumber(source.staminaSpent),
    remaining5s: compactNumber(source.remaining5s ?? source.stamina5sRemainingMilli ?? source.stamina5s ?? selfSource.stamina5s ?? selfSource.stamina_5s_remaining_milli),
    remaining1h: compactNumber(source.remaining1h ?? source.stamina1hRemainingMilli ?? source.stamina1h ?? selfSource.stamina1h ?? selfSource.stamina_1h_remaining_milli),
    remaining1d: compactNumber(source.remaining1d ?? source.stamina1dRemainingMilli ?? source.stamina1d ?? selfSource.stamina1d ?? selfSource.stamina_1d_remaining_milli)
  };
}

function compactSelf(self) {
  if (!self || typeof self !== 'object') return null;
  return {
    userId: compactNumber(self.userId ?? self.user_id),
    entityId: self.entityId ?? self.entity_id ?? null,
    name: compactString(self.name || self.label, 80),
    authority: compactString(self.authority, 48),
    x: compactNumber(self.x),
    y: compactNumber(self.y),
    hp: compactNumber(self.hp),
    drop: compactNumber(self.drop ?? self.Drop ?? self.death_drop_coins ?? self.death_reward_preview),
    active: self.active === undefined ? null : Boolean(self.active),
    moving: self.moving === undefined ? null : Boolean(self.moving),
    firing: self.firing === undefined ? null : Boolean(self.firing),
    alive: self.alive === undefined ? null : Boolean(self.alive)
  };
}

function normalizeBrowserlessLastKnown(value, current = {}, updatedAt = '') {
  const source = value && typeof value === 'object' ? value : {};
  const hasStoredSelf = Boolean(source.self && typeof source.self === 'object');
  const fallbackSelf = current?.self && typeof current.self === 'object' ? current.self : null;
  const rawSelf = hasStoredSelf ? source.self : fallbackSelf;
  const rawStamina = source.stamina && typeof source.stamina === 'object'
    ? source.stamina
    : (!hasStoredSelf ? current?.stamina : null);
  const self = compactSelf(rawSelf);
  const stamina = compactStamina(rawStamina, rawSelf);
  const hasStamina = stamina.remaining5s !== null
    || stamina.remaining1h !== null
    || stamina.remaining1d !== null;
  if (!self && !hasStamina) return null;
  const fallbackDecisionAt = !hasStoredSelf ? current?.decision?.at : '';
  const fallbackTick = !hasStoredSelf
    ? current?.decision?.tick ?? current?.decision?.input?.realtime?.tick
    : null;
  return {
    self,
    stamina,
    at: compactString(source.at || fallbackDecisionAt || updatedAt, 48),
    tick: compactNumber(source.tick ?? fallbackTick)
  };
}

function latestAttemptResponse(leave) {
  const attempts = Array.isArray(leave?.attempts) ? leave.attempts : [];
  for (let i = attempts.length - 1; i >= 0; i -= 1) {
    const response = attempts[i]?.response;
    if (response && typeof response === 'object') return response;
  }
  return null;
}

function latestKnownSelfSource(normalized) {
  const canary = normalized?.runner?.lastRun?.canary || null;
  const candidates = [
    normalized?.current?.self,
    latestAttemptResponse(canary?.leave),
    latestAttemptResponse(canary?.safety?.exit?.leave),
    canary?.state?.realtime?.self,
    canary?.state?.fallback?.self,
    normalized?.probes?.lastReadOnlyProbe?.state?.realtime?.self,
    normalized?.probes?.lastReadOnlyProbe?.state?.fallback?.self
  ];
  return candidates.find(item => item && typeof item === 'object') || null;
}

function compactLastKnown(normalized) {
  const persisted = normalized?.lastKnown && typeof normalized.lastKnown === 'object'
    ? normalized.lastKnown
    : null;
  const source = persisted?.self || latestKnownSelfSource(normalized);
  const self = compactSelf(source);
  const stamina = compactStamina(persisted?.stamina || normalized?.current?.stamina, source);
  const at = compactString(
    persisted?.at
      || normalized?.runner?.lastRun?.canary?.completedAt
      || normalized?.runner?.lastRun?.completedAt
      || normalized?.updatedAt,
    48
  );
  return self || stamina.remaining5s !== null || stamina.remaining1h !== null || stamina.remaining1d !== null
    ? { self, stamina, at }
    : null;
}

function compactOfflineBlocker(normalized, lastKnown, options = {}, nowMs = Date.now()) {
  const offlineReason = String(
    normalized?.runner?.currentAction?.reason
      || normalized?.stats?.lastExit?.reason
      || normalized?.stats?.currentSession?.exitReason
      || ''
  );
  const stamina = lastKnown?.stamina || compactStamina(normalized?.current?.stamina, normalized?.current?.self);
  const lastKnownAtMs = parseTimeMs(lastKnown?.at);
  const currentDayStartMs = browserlessStatsDayStartMs(browserlessStatsDayKey(nowMs));
  const staminaIsFromCurrentDay = !lastKnownAtMs || lastKnownAtMs >= currentDayStartMs;
  const thresholdMs = Math.max(0, Number(options.staminaExhaustedBelowMs ?? DEFAULT_STAMINA_EXHAUSTED_THRESHOLD_MS));
  const exhausted = [];
  if (staminaIsFromCurrentDay && stamina.remaining1h !== null && stamina.remaining1h < thresholdMs) exhausted.push('1h');
  if (staminaIsFromCurrentDay && stamina.remaining1d !== null && stamina.remaining1d < thresholdMs) exhausted.push('1d');
  if (!staminaIsFromCurrentDay) return null;
  if (!exhausted.length && !/stamina-exhausted-leave|体力耗尽/i.test(offlineReason)) return null;
  const resetGraceMs = Math.max(0, Number(options.staminaResetGraceMs ?? DEFAULT_STAMINA_RESET_GRACE_MS));
  const resetAt = exhausted.includes('1d') ? nextDailyStaminaResetAt(nowMs) : 0;
  const nextReadyAt = resetAt ? new Date(resetAt + resetGraceMs).toISOString() : '';
  return {
    reason: 'stamina-exhausted-leave',
    exhausted,
    thresholdMs,
    remaining1h: stamina.remaining1h,
    remaining1d: stamina.remaining1d,
    nextReadyAt
  };
}

function compactProfit(profit) {
  if (!profit || typeof profit !== 'object') return null;
  const best = profit.best && typeof profit.best === 'object' ? profit.best : null;
  const candidates = Array.isArray(profit.candidates) ? profit.candidates : [];
  return {
    best: best
      ? {
          type: compactString(best.type, 48),
          actionKind: compactString(best.actionKind, 48),
          reason: compactString(best.reason, 120),
          score: compactNumber(best.score),
          staminaCost: compactNumber(best.staminaCost),
          distance: compactNumber(best.distance),
          amount: compactNumber(best.amount),
          target: compactTarget(best.target || best.coin)
        }
      : null,
    candidateCount: candidates.length,
    threshold: profit.threshold && typeof profit.threshold === 'object'
      ? {
          active: profit.threshold.active === undefined ? null : Boolean(profit.threshold.active),
          reason: compactString(profit.threshold.reason, 48),
          coinsPer10Stamina: compactNumber(profit.threshold.threshold?.coinsPer10Stamina),
          remaining1dMilli: compactNumber(profit.threshold.remaining1dMilli),
          burnCapacityMilli: compactNumber(profit.threshold.burnCapacityMilli),
          resetAt: compactNumber(profit.threshold.resetAt),
          reserveMs: compactNumber(profit.threshold.reserveMs),
          rawCount: compactNumber(profit.threshold.rawCount),
          eligibleCount: compactNumber(profit.threshold.eligibleCount),
          filteredCount: compactNumber(profit.threshold.filteredCount)
        }
      : null
  };
}

function compactCombat(combat) {
  if (!combat || typeof combat !== 'object') return null;
  const candidates = Array.isArray(combat.candidates) ? combat.candidates : [];
  const dataGaps = Array.isArray(combat.dataGaps) ? combat.dataGaps : [];
  return {
    ok: combat.ok === undefined ? null : Boolean(combat.ok),
    dryRun: combat.dryRun === undefined ? null : Boolean(combat.dryRun),
    liveEnabled: combat.liveEnabled === undefined ? null : Boolean(combat.liveEnabled),
    authority: compactString(combat.authority, 48),
    tick: compactNumber(combat.tick),
    startedAt: compactString(combat.startedAt, 48),
    durationMs: compactNumber(combat.durationMs),
    self: compactTarget(combat.self),
    target: compactTarget(combat.target),
    candidateCount: candidates.length,
    movement: combat.movement && typeof combat.movement === 'object'
      ? {
          dx: compactNumber(combat.movement.dx),
          dy: compactNumber(combat.movement.dy),
          reason: compactString(combat.movement.reason, 120)
        }
      : null,
    shooting: combat.shooting && typeof combat.shooting === 'object'
      ? {
          wouldShoot: combat.shooting.wouldShoot === undefined ? null : Boolean(combat.shooting.wouldShoot),
          inRange: combat.shooting.inRange === undefined ? null : Boolean(combat.shooting.inRange),
          reason: compactString(combat.shooting.reason, 120),
          cadenceMs: compactNumber(combat.shooting.cadenceMs ?? combat.shooting.effectiveCadenceMs),
          stamina5s: compactNumber(combat.shooting.stamina5s)
        }
      : null,
    exit: combat.exit && typeof combat.exit === 'object'
      ? {
          kind: compactString(combat.exit.kind, 48),
          reason: compactString(combat.exit.reason, 120),
          selfHp: compactNumber(combat.exit.selfHp),
          targetHp: compactNumber(combat.exit.targetHp),
          hpGap: compactNumber(combat.exit.hpGap),
          threshold: compactNumber(combat.exit.threshold),
          minHpGap: compactNumber(combat.exit.minHpGap)
        }
      : null,
    dataGaps: dataGaps.slice(0, 5).map(item => compactString(item, 80)),
    dataGapCount: dataGaps.length
  };
}

function compactBattleActor(value, fallback = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const compact = compactTarget({ ...fallback, ...source }) || {};
  return {
    userId: compact.userId ?? compactNumber(fallback.userId ?? fallback.user_id),
    name: compact.name || compactString(fallback.name || fallback.label, 80),
    hp: compact.hp ?? compactNumber(fallback.hp),
    maxHp: compact.maxHp ?? compactNumber(fallback.maxHp ?? fallback.max_hp),
    drop: compact.drop ?? compactNumber(fallback.drop ?? fallback.Drop),
    stamina5s: compact.stamina5s ?? compactNumber(fallback.stamina5s ?? fallback.stamina5sRemainingMilli),
    stamina5sLimit: compact.stamina5sLimit ?? compactNumber(fallback.stamina5sLimit ?? fallback.stamina5sLimitMilli),
    stamina1h: compact.stamina1h ?? compactNumber(fallback.stamina1h ?? fallback.stamina1hRemainingMilli),
    stamina1d: compact.stamina1d ?? compactNumber(fallback.stamina1d ?? fallback.stamina1dRemainingMilli),
    active: compact.active ?? (fallback.active === undefined ? null : Boolean(fallback.active)),
    moving: compact.moving ?? (fallback.moving === undefined ? null : Boolean(fallback.moving)),
    firing: compact.firing ?? (fallback.firing === undefined ? null : Boolean(fallback.firing))
  };
}

function compactBattleStatus(normalized, game, action, decision, combat) {
  if (!game?.inGame) return null;
  const kind = String(action?.kind || decision?.kind || decision?.actionKind || '');
  const band = String(decision?.band || '');
  const combatLike = kind === 'attack' || kind === 'combat-live' || band === 'combat';
  const target = combat?.target || action?.target || decision?.target || null;
  if (!combatLike || !target || target.type === 'coin') return null;

  const current = normalized?.current || {};
  const rawCombat = current.combatSummary || current.decision?.combat || {};
  const stateCombatTarget = current.decisionState?.combat?.target || null;
  const stateStartedAtMs = compactNumber(stateCombatTarget?.firstSeenAt ?? stateCombatTarget?.at);
  const startedAt = compactString(
    combat?.startedAt
      || rawCombat.startedAt
      || (stateStartedAtMs !== null ? isoFromMs(stateStartedAtMs) : '')
      || decision?.at,
    48
  );
  const selfFallback = {
    ...(current.self && typeof current.self === 'object' ? current.self : {}),
    stamina5s: current.stamina?.stamina5sRemainingMilli ?? current.stamina?.stamina5s,
    stamina1h: current.stamina?.stamina1hRemainingMilli ?? current.stamina?.stamina1h,
    stamina1d: current.stamina?.stamina1dRemainingMilli ?? current.stamina?.stamina1d
  };
  return {
    active: true,
    kind: compactString(kind, 48),
    startedAt,
    durationMs: compactNumber(combat?.durationMs ?? rawCombat.durationMs),
    distance: compactNumber(target.distance),
    self: compactBattleActor(combat?.self, selfFallback),
    target: compactBattleActor(target),
    targetAfk: kind === 'attack' && target.active !== true
  };
}

function compactNearbyList(list, rowSize, limit = 160) {
  if (!Array.isArray(list)) return [];
  return list
    .filter(item => Array.isArray(item))
    .map(item => item.slice(0, rowSize).map(value => {
      if (typeof value === 'number') return compactNumber(value);
      if (typeof value === 'boolean') return value ? 1 : 0;
      if (value === null || value === undefined || value === '') return null;
      return compactString(value, 96);
    }))
    .slice(0, limit);
}

function sortCompactNearbyCoins(a, b) {
  const distanceA = compactNumber(a?.[2]);
  const distanceB = compactNumber(b?.[2]);
  const amountA = compactNumber(a?.[1]);
  const amountB = compactNumber(b?.[1]);
  return (distanceA ?? Number.POSITIVE_INFINITY) - (distanceB ?? Number.POSITIVE_INFINITY)
    || (amountB ?? 0) - (amountA ?? 0);
}

function compactNearbyCoins(list) {
  const rows = compactNearbyList(list, 7, Number.POSITIVE_INFINITY)
    .filter(row => compactNumber(row?.[1]) !== null && compactNumber(row?.[2]) !== null);
  const highValueRows = rows.filter(row => Number(row[1]) > 1);
  const lowValueRows = rows
    .filter(row => Number(row[1]) === 1)
    .sort(sortCompactNearbyCoins);
  const forcedLowValueRows = lowValueRows.filter(row => Boolean(row?.[3]) || Number(row?.[4] || 0) > 0 || Boolean(row?.[6]));
  const visibleLowValueRows = lowValueRows.slice(0, 10);
  const byId = new Map();
  for (const row of [...highValueRows, ...visibleLowValueRows, ...forcedLowValueRows]) {
    const key = compactString(row?.[0], 96) || String(byId.size);
    if (!byId.has(key)) byId.set(key, row);
  }
  return {
    rows: Array.from(byId.values()).sort(sortCompactNearbyCoins),
    lowHiddenCount: Math.max(0, lowValueRows.length - new Set([...visibleLowValueRows, ...forcedLowValueRows].map(row => compactString(row?.[0], 96))).size)
  };
}

function compactNearbyPlayers(list) {
  const rows = compactNearbyList(list, 13, Number.POSITIVE_INFINITY);
  const visibleRows = [];
  let lowHiddenCount = 0;
  for (const row of rows) {
    const currentShape = row.length >= 13;
    const foldAsLowValueAfk = currentShape ? row?.[12] : row?.[10];
    if (foldAsLowValueAfk) {
      lowHiddenCount += 1;
      continue;
    }
    if (currentShape) {
      visibleRows.push(row.slice(0, 12));
      continue;
    }
    const legacy = row.slice(0, 10);
    legacy.push(Boolean(row?.[9]) ? 1 : 0, Boolean(row?.[9]) ? 1 : 0);
    visibleRows.push(legacy);
  }
  return {
    rows: visibleRows,
    lowHiddenCount
  };
}

function compactNearby(nearby) {
  if (!nearby || typeof nearby !== 'object') return null;
  const coins = compactNearbyCoins(nearby.c || nearby.coins);
  const players = compactNearbyPlayers(nearby.p || nearby.players);
  return {
    ar: compactNumber(nearby.ar ?? nearby.attackRange),
    vr: compactNumber(nearby.vr ?? nearby.visibleRange),
    c: coins.rows,
    coinLowHiddenCount: coins.lowHiddenCount,
    p: players.rows,
    playerLowHiddenCount: players.lowHiddenCount
  };
}

function compactHighDropPlayers(value) {
  if (!value || typeof value !== 'object') return null;
  const players = Array.isArray(value.players) ? value.players : [];
  const rows = players.map(player => [
    compactString(player?.name, 96),
    compactNumber(player?.initialDrop),
    compactNumber(player?.maxDrop),
    compactNumber(player?.latestDrop),
    compactNumber(player?.userId)
  ]).filter(row => row[0] && row.slice(1).every(item => item !== null))
    .filter(row => row.slice(1, 4).some(item => item >= HIGH_DROP_PANEL_THRESHOLD))
    .slice(0, 160);
  return {
    day: compactString(value.day, 10),
    updatedAt: value.updatedAt || '',
    lastSnapshotAt: value.lastSnapshotAt || '',
    source: compactString(value.lastSnapshotSource, 32),
    p: rows
  };
}

function compactEasyKillPlayers(value) {
  if (!value || typeof value !== 'object') return null;
  const players = Array.isArray(value.players) ? value.players : [];
  return {
    updatedAt: value.updatedAt || '',
    p: players.map(player => {
      const scoreValue = compactNumber(player?.score ?? player?.killScore ?? player?.killCount);
      const rounded = scoreValue === null ? null : Math.round(scoreValue);
      const score = rounded === null || rounded <= 0 ? null : Math.min(3, rounded);
      return [compactString(player?.name, 96), score];
    }).filter(row => row[0] && row[1] !== null).slice(0, 160)
  };
}

function compactDailyDamagePlayers(value) {
  if (!value || typeof value !== 'object') return null;
  const players = Array.isArray(value.players) ? value.players : [];
  return {
    day: compactString(value.day, 10),
    updatedAt: value.updatedAt || '',
    p: players.map(player => compactString(player?.name, 96)).filter(Boolean).slice(0, 160)
  };
}

function compactRun(run) {
  if (!run || typeof run !== 'object') return null;
  const canary = run.canary && typeof run.canary === 'object' ? run.canary : null;
  const safetyReason = canary?.safety?.event?.reason || canary?.safety?.leaveFailure?.reason || '';
  return {
    ok: run.ok === undefined ? null : Boolean(run.ok),
    mode: compactString(run.mode || run.controlMode, 48),
    runId: compactString(run.runId || canary?.runId, 96),
    startedAt: compactString(run.startedAt || canary?.startedAt, 48),
    completedAt: compactString(run.completedAt || canary?.completedAt, 48),
    reason: compactString(run.reason || safetyReason, 120),
    error: compactString(run.error || canary?.error, 160),
    frames: compactNumber(canary?.stats?.frameCount),
    decisions: compactNumber(canary?.decisions?.evaluatedCount),
    actions: compactNumber(canary?.actions?.sentCount)
  };
}

function compactExit(event) {
  if (!event || typeof event !== 'object') return null;
  const detail = event.detail && typeof event.detail === 'object' ? event.detail : {};
  const decision = detail.decision && typeof detail.decision === 'object' ? detail.decision : {};
  const combat = decision.combat && typeof decision.combat === 'object'
    ? decision.combat
    : (detail.combat && typeof detail.combat === 'object' ? detail.combat : {});
  const combatExit = decision.combat?.exit && typeof decision.combat.exit === 'object'
    ? decision.combat.exit
    : (detail.combat?.exit && typeof detail.combat.exit === 'object' ? detail.combat.exit : {});
  const metrics = combat.metrics && typeof combat.metrics === 'object' ? combat.metrics : {};
  const injury = decision.injury && typeof decision.injury === 'object'
    ? decision.injury
    : (detail.injury && typeof detail.injury === 'object' ? detail.injury : {});
  const sourceSelf = decision.self || detail.self || decision.input?.self || combat.self || null;
  const sourceTarget = event.target || detail.target || decision.target || combatExit.target || combat.target || null;
  const sourceTargetId = compactNumber(sourceTarget?.userId ?? sourceTarget?.user_id);
  const metricsTargetId = compactNumber(metrics.targetId);
  const sourceTargetName = compactString(sourceTarget?.name || sourceTarget?.label, 80);
  const metricsTargetName = compactString(metrics.targetName, 80);
  const hasMetricsTarget = metricsTargetId !== null || Boolean(metricsTargetName);
  const metricsMatchSourceTarget = Boolean(sourceTarget && (
    (sourceTargetId !== null && metricsTargetId !== null && sourceTargetId === metricsTargetId)
      || ((sourceTargetId === null || metricsTargetId === null)
        && sourceTargetName
        && metricsTargetName
        && sourceTargetName === metricsTargetName)
  ));
  const combatFieldsMatchMetrics = !hasMetricsTarget || metricsMatchSourceTarget;
  const at = compactString(event.at || event.time || event.createdAt, 48);
  const metricStartedAtMs = compactNumber(metrics.startedAt);
  const combatStartedAtMs = combatFieldsMatchMetrics ? parseTimeMs(combat.startedAt) : 0;
  const startedAtMs = metricStartedAtMs !== null && metricStartedAtMs > 0
    ? metricStartedAtMs
    : (combatStartedAtMs > 0 ? combatStartedAtMs : null);
  const endedAtMs = compactNumber(metrics.lastObservedAt) || parseTimeMs(at) || parseTimeMs(decision.at);
  const durationMs = (combatFieldsMatchMetrics ? compactNumber(combat.durationMs) : null)
    ?? (startedAtMs !== null && endedAtMs > 0 ? Math.max(0, endedAtMs - startedAtMs) : null);
  const selfDamage = compactNumber(metrics.selfDamage) ?? compactNumber(injury.hpDrop);
  const targetDamage = compactNumber(metrics.targetDamage);
  const selfHpEnd = compactNumber(metrics.lastSelfHp)
    ?? compactNumber(combatExit.selfHp)
    ?? compactNumber(sourceSelf?.hp)
    ?? compactNumber(injury.currentHp);
  const selfHpStart = compactNumber(metrics.initialSelfHp)
    ?? compactNumber(injury.previousHp)
    ?? (selfHpEnd !== null && selfDamage !== null ? selfHpEnd + selfDamage : null);
  const targetHpEnd = compactNumber(metrics.lastTargetHp)
    ?? (combatFieldsMatchMetrics ? compactNumber(combatExit.targetHp) : null);
  const targetHpStart = compactNumber(metrics.initialTargetHp)
    ?? (targetHpEnd !== null && targetDamage !== null ? targetHpEnd + targetDamage : null);
  const battleTargetSource = hasMetricsTarget && !metricsMatchSourceTarget
    ? { userId: metricsTargetId, name: metricsTargetName }
    : (sourceTarget || { userId: metricsTargetId, name: metricsTargetName });
  const target = compactTarget({
    ...(battleTargetSource && typeof battleTargetSource === 'object' ? battleTargetSource : {}),
    userId: battleTargetSource?.userId ?? battleTargetSource?.user_id ?? metricsTargetId,
    name: battleTargetSource?.name || metricsTargetName || '',
    hp: targetHpEnd ?? battleTargetSource?.hp
  });
  const rawActualShots = compactNumber(metrics.actualShots);
  const actualShots = rawActualShots === null ? null : Math.max(0, rawActualShots);
  const rawConfirmedHits = compactNumber(metrics.confirmedHits);
  const confirmedHits = rawConfirmedHits === null || actualShots === null
    ? null
    : Math.min(actualShots, Math.max(0, rawConfirmedHits));
  const estimatedHitRate = actualShots !== null && actualShots > 0 && confirmedHits !== null
    ? Number((confirmedHits / actualShots * 100).toFixed(1))
    : null;
  const hasBattleEvidence = Boolean(
    target
      && (
        startedAtMs !== null
        || compactNumber(metrics.actualShots) !== null
        || compactNumber(metrics.confirmedHits) !== null
        || selfDamage !== null
        || targetDamage !== null
        || Object.keys(combatExit).length
        || String(event.reason || '').startsWith('combat-')
        || String(event.reason || '') === 'injury-leave'
      )
  );
  let outcome = '';
  if (hasBattleEvidence) {
    if (targetHpEnd !== null && targetHpEnd <= 0) outcome = 'victory';
    else if (selfHpEnd !== null && selfHpEnd <= 0) outcome = 'defeat';
    else if (event.shouldLeave !== false && (!hasMetricsTarget || metricsMatchSourceTarget)) outcome = 'self-left';
    else outcome = 'ended';
  }
  return {
    at,
    reason: compactString(event.reason || event.type, 120),
    runId: compactString(event.runId || event.detail?.runId, 96),
    shouldLeave: event.shouldLeave === undefined ? null : Boolean(event.shouldLeave),
    target: compactTarget(sourceTarget),
    selfHp: compactNumber(event.selfHp ?? detail.selfHp ?? combatExit.selfHp),
    targetHp: compactNumber(event.targetHp ?? detail.targetHp ?? combatExit.targetHp),
    hpGap: compactNumber(event.hpGap ?? detail.hpGap ?? combatExit.hpGap),
    threshold: compactNumber(event.threshold ?? detail.threshold ?? combatExit.threshold),
    minHpGap: compactNumber(event.minHpGap ?? detail.minHpGap ?? combatExit.minHpGap),
    battle: hasBattleEvidence
      ? {
          outcome,
          outcomeReason: compactString(event.reason || event.type, 120),
          startedAt: startedAtMs === null ? '' : isoFromMs(startedAtMs),
          endedAt: endedAtMs > 0 ? isoFromMs(endedAtMs) : at,
          durationMs,
          target,
          selfHpStart,
          selfHpEnd,
          targetHpStart,
          targetHpEnd,
          selfDamage,
          targetDamage,
          actualShots,
          confirmedHits,
          estimatedHitRate,
          staminaSpentMs: compactNumber(metrics.totalStaminaSpent)
        }
      : null
  };
}

function recentExitRunId(event) {
  return compactString(event?.runId || event?.detail?.runId, 96);
}

function recentExitMatchesLastExit(event, lastExit = {}) {
  if (!event || typeof event !== 'object') return false;
  const lastReason = compactString(lastExit.reason, 160);
  const eventReason = compactString(event.reason || event.type, 160);
  if (lastReason && eventReason && lastReason !== eventReason) return false;

  const lastRunId = compactString(lastExit.runId, 96);
  const eventRunId = recentExitRunId(event);
  if (lastRunId && eventRunId) return lastRunId === eventRunId;

  const lastAtMs = parseTimeMs(lastExit.at);
  const eventAtMs = parseTimeMs(event.at || event.time || event.createdAt);
  if (lastAtMs > 0 && eventAtMs > 0) {
    return Math.abs(lastAtMs - eventAtMs) <= RECENT_EXIT_MATCH_WINDOW_MS;
  }
  return Boolean(lastReason && eventReason && lastReason === eventReason);
}

function latestMatchingRecentActualExit(recentExits, lastExit = {}) {
  const actualExits = (Array.isArray(recentExits) ? recentExits : [])
    .filter(event => event?.shouldLeave !== false)
    .reverse();
  if (!actualExits.length) return null;
  const hasLastExitIdentity = Boolean(lastExit?.at || lastExit?.reason || lastExit?.runId);
  if (!hasLastExitIdentity) return actualExits[0];
  return actualExits.find(event => recentExitMatchesLastExit(event, lastExit)) || null;
}

function compactAuthReason(normalized) {
  const runner = normalized?.runner || {};
  const run = runner.lastRun && typeof runner.lastRun === 'object' ? runner.lastRun : {};
  const canary = run.canary && typeof run.canary === 'object' ? run.canary : {};
  const candidates = [
    runner.lastError,
    runner.currentAction?.reason,
    run.error,
    run.reason,
    canary.error,
    canary.safety?.event?.reason,
    canary.safety?.leaveFailure?.reason
  ];
  return compactString(candidates.find(Boolean), 160);
}

function reasonLooksInvalidSession(reason) {
  return /websocket unexpected response 403|http 403|not logged in|unauthori[sz]ed|forbidden|invalid.*(?:token|session)|(?:token|session).*(?:expired|invalid)/i.test(String(reason || ''));
}

function compactAuthStatus(normalized, session = {}) {
  const tokenPresent = Boolean(session.tokenPresent);
  const userId = compactNumber(normalized?.session?.userId);
  const reason = compactAuthReason(normalized);
  const invalid = Boolean(userId && tokenPresent && reasonLooksInvalidSession(reason));
  const missing = Boolean(!userId || !tokenPresent || /^missing-manual-session$/i.test(reason));
  const state = invalid ? 'invalid' : (missing ? 'missing' : 'ready');
  const needsReauth = invalid || missing;
  return {
    state,
    needsReauth,
    invalid,
    missing,
    authenticated: Boolean(userId && tokenPresent && !invalid),
    userId,
    tokenPresent,
    tokenUpdatedAt: compactString(normalized?.session?.tokenUpdatedAt, 48),
    authUrl: compactString(normalized?.session?.lastAuthUrl, 4096),
    authUrlAt: compactString(normalized?.session?.lastAuthUrlAt, 48),
    lastLoginSource: compactString(normalized?.session?.lastLoginSource, 80),
    reason,
    prompt: invalid
      ? '登录信息可能已经失效，请重新授权'
      : (missing ? '缺少可用登录信息，请先授权' : '登录信息可用')
  };
}

function compactGameStatus(normalized) {
  const current = normalized.current || {};
  const self = current.self && typeof current.self === 'object' ? current.self : null;
  const currentSession = normalized.stats?.currentSession || {};
  const lastExit = normalized.stats?.lastExit || {};
  const action = normalized.runner?.currentAction || current.action || current.decision || {};
  const kind = String(action.kind || '');
  const reason = String(action.reason || '');
  const waiting = ['loop-wait', 'stop', 'stopped'].includes(kind)
    || [
      'missing-manual-session',
      'snapshot-safety-retry',
      'login-point-bootstrap-failed',
      'unsupported-control-mode'
    ].includes(reason);
  const finalizedSession = Boolean(
    currentSession.online === false
      && (currentSession.exitedAt || lastExit.at)
  );
  const selfPresent = Boolean(self?.userId || self?.entityId || self?.name)
    && !waiting
    && !finalizedSession;
  return {
    inGame: selfPresent,
    selfPresent,
    state: selfPresent ? 'in-game' : (waiting ? 'waiting' : 'not-in-game')
  };
}

function buildPublicBrowserlessStatus(state, config = {}) {
  const normalized = normalizeBrowserlessState(state, state?.logs?.stateFile || '');
  const publicState = {
    schemaVersion: normalized.schemaVersion,
    updatedAt: normalized.updatedAt || '',
    session: {
      userId: normalized.session.userId,
      authenticated: normalized.session.authenticated,
      tokenPresent: Boolean(normalized.session.sessionToken),
      tokenUpdatedAt: normalized.session.tokenUpdatedAt || '',
      lastAuthUrl: normalized.session.lastAuthUrl || '',
      lastAuthUrlAt: normalized.session.lastAuthUrlAt || '',
      lastLoginSource: normalized.session.lastLoginSource || '',
      lastLoginSummary: normalized.session.lastLoginSummary || null
    },
    runner: normalized.runner,
    probes: normalized.probes,
    loginPointSafety: normalized.loginPointSafety,
    current: normalized.current,
    lastKnown: normalized.lastKnown,
    recentExits: normalized.recentExits,
    network: normalized.network,
    stats: normalized.stats,
    logs: {
      dataDir: normalized.logs.dataDir || config.dataDir || '',
      logDir: normalized.logs.logDir || config.logDir || '',
      stateFile: normalized.logs.stateFile || (config.dataDir ? stateFilePath(config) : ''),
      currentDayDir: normalized.logs.currentDayDir || ''
    },
    statusServer: {
      host: config.statusHost || '',
      port: Number(config.statusPort || 0),
      webTokenPresent: Boolean(config.webToken),
      webVersion: compactString(config.webVersion, 48)
    }
  };
  return redactStructuredSecrets(publicState);
}

function compactSnapshotProbeSource(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    startedAt: value.startedAt || '',
    completedAt: value.completedAt || '',
    checkedAt: value.checkedAt || '',
    updatedAt: value.updatedAt || '',
    at: value.at || '',
    snapshotSafety: value.snapshotSafety || null
  };
}

function compactLastRunSource(value) {
  if (!value || typeof value !== 'object') return null;
  const canary = value.canary && typeof value.canary === 'object' ? value.canary : {};
  return {
    error: value.error || '',
    reason: value.reason || '',
    canary: {
      error: canary.error || '',
      startedAt: canary.startedAt || '',
      completedAt: canary.completedAt || '',
      updatedAt: canary.updatedAt || '',
      at: canary.at || '',
      snapshotSafety: canary.snapshotSafety || null,
      safety: {
        event: canary.safety?.event ? { reason: canary.safety.event.reason || '' } : null,
        leaveFailure: canary.safety?.leaveFailure ? { reason: canary.safety.leaveFailure.reason || '' } : null
      }
    }
  };
}

function browserlessCompactStatusSource(state = {}) {
  const runner = state.runner && typeof state.runner === 'object' ? state.runner : {};
  const probes = state.probes && typeof state.probes === 'object' ? state.probes : {};
  const current = state.current && typeof state.current === 'object' ? state.current : {};
  return {
    schemaVersion: state.schemaVersion,
    updatedAt: state.updatedAt || '',
    session: state.session || {},
    runner: {
      running: Boolean(runner.running),
      mode: runner.mode || '',
      readOnly: runner.readOnly !== false,
      controlMode: runner.controlMode || 'read-only',
      canaryProfile: runner.canaryProfile || '',
      dryRun: runner.dryRun !== false,
      combatEnabled: Boolean(runner.combatEnabled),
      lastError: runner.lastError || '',
      currentAction: runner.currentAction || null,
      lastRun: compactLastRunSource(runner.lastRun)
    },
    probes: {
      lastSnapshotProbe: compactSnapshotProbeSource(probes.lastSnapshotProbe),
      lastReadOnlyProbe: compactSnapshotProbeSource(probes.lastReadOnlyProbe)
    },
    loginPointSafety: state.loginPointSafety || {},
    current: {
      self: current.self || null,
      stamina: current.stamina || null,
      action: current.action || null,
      decision: current.decision || null,
      profit: current.profit || null,
      combatSummary: current.combatSummary || null
    },
    lastKnown: state.lastKnown || {},
    recentExits: Array.isArray(state.recentExits) ? state.recentExits : [],
    network: state.network || {},
    stats: state.stats || {},
    logs: { stateFile: state.logs?.stateFile || '' },
    highDropPlayers: state.highDropPlayers || null,
    easyKillPlayers: state.easyKillPlayers || null,
    dailyDamagePlayers: state.dailyDamagePlayers || null
  };
}

function buildCompactBrowserlessStatus(state, config = {}) {
  const normalized = normalizeBrowserlessState(state, state?.logs?.stateFile || '');
  const inputSession = state?.session && typeof state.session === 'object' ? state.session : {};
  const tokenPresent = Boolean(normalized.session.sessionToken || inputSession.tokenPresent);
  const authenticated = Boolean(inputSession.authenticated || (normalized.session.userId && tokenPresent));
  const auth = compactAuthStatus(normalized, { tokenPresent, authenticated });
  const current = normalized.current || {};
  const action = compactAction(normalized.runner.currentAction) || compactAction(current.action);
  const recentExits = Array.isArray(normalized.recentExits) ? normalized.recentExits : [];
  const recentActualExit = latestMatchingRecentActualExit(recentExits, normalized.stats?.lastExit);
  const loginPointSafetyDetail = compactLoginPointSafetyDetail(normalized.loginPointSafety || {}, normalized);
  const loginPoint = compactPoint(normalized.loginPointSafety?.point) || loginPointSafetyDetail?.point || null;
  const game = compactGameStatus(normalized);
  const lastKnown = compactLastKnown(normalized);
  const sourceIp = normalized.network.sourceIp || '';
  const sourceIps = Array.isArray(normalized.network.sourceIps) ? normalized.network.sourceIps : [];
  const sourceIpIndex = sourceIp ? sourceIps.findIndex(item => item === sourceIp) + 1 : 0;
  const decision = compactDecision(current.decision);
  const combat = compactCombat(current.combatSummary || current.decision?.combat);
  const recentExit = compactExit(recentActualExit);
  const displayCombat = !game.inGame && recentExit?.battle?.target
    ? {
        ...(combat || {}),
        target: recentExit.battle.target
      }
    : combat;
  const compactState = {
    schemaVersion: normalized.schemaVersion,
    compact: true,
    updatedAt: normalized.updatedAt || '',
    session: {
      userId: normalized.session.userId,
      authenticated: auth.authenticated,
      tokenPresent,
      tokenUpdatedAt: normalized.session.tokenUpdatedAt || ''
    },
    auth,
    runner: {
      running: normalized.runner.running,
      mode: normalized.runner.mode || '',
      readOnly: normalized.runner.readOnly,
      controlMode: normalized.runner.controlMode || '',
      canaryProfile: normalized.runner.canaryProfile || '',
      dryRun: normalized.runner.dryRun,
      combatEnabled: Boolean(normalized.runner.combatEnabled),
      lastError: compactString(normalized.runner.lastError, 160)
    },
    game,
    self: compactSelf(current.self),
    stamina: compactStamina(current.stamina, current.self),
    lastKnown,
    decision,
    action,
    profit: compactProfit(current.profit || current.decision?.profit),
    combat: displayCombat,
    battle: compactBattleStatus(normalized, game, action, decision, displayCombat),
    nearby: compactNearby(current.decision?.input?.nearby),
    highDropPlayers: compactHighDropPlayers(normalized.highDropPlayers),
    easyKillPlayers: compactEasyKillPlayers(normalized.easyKillPlayers),
    dailyDamagePlayers: compactDailyDamagePlayers(normalized.dailyDamagePlayers),
    stats: compactBrowserlessStats(normalized, game, action, config, lastKnown),
    loginPointSafety: {
      ok: Boolean(normalized.loginPointSafety?.ok),
      reason: compactString(normalized.loginPointSafety?.reason, 120),
      checkedAt: normalized.loginPointSafety?.checkedAt || '',
      point: loginPoint,
      detail: loginPointSafetyDetail
    },
    network: {
      sourceIp,
      sourceIpIndex: sourceIpIndex > 0 ? sourceIpIndex : null,
      sourceIpCount: sourceIps.length,
      lastSelectedAt: normalized.network.lastSelectedAt || '',
      lastSelectionReason: compactString(normalized.network.lastSelectionReason, 120)
    },
    recentExit,
    statusServer: {
      host: config.statusHost || '',
      port: Number(config.statusPort || 0),
      webTokenPresent: Boolean(config.webToken),
      webVersion: compactString(config.webVersion, 48)
    }
  };
  return redactStructuredSecrets(compactState);
}

module.exports = {
  browserlessPatchFromLegacyState,
  browserlessStatsForDecision,
  browserlessStatsForOffline,
  browserlessCompactStatusSource,
  buildCompactBrowserlessStatus,
  buildPublicBrowserlessStatus,
  defaultBrowserlessState,
  loginPointFromAnyState,
  mergeState,
  readBrowserlessStateFile,
  sessionFromAnyState,
  stateFilePath,
  updateBrowserlessStateFile,
  writeBrowserlessStateFile
};
