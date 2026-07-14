'use strict';

const fs = require('fs');
const path = require('path');

const SCHEMA_VERSION = 1;
const DEFAULT_OUTCOME_GRACE_MS = 40000;
const DEFAULT_PERSIST_INTERVAL_MS = 5000;

function cloneJson(value) {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function targetUserId(target) {
  return numberOrNull(target?.userId ?? target?.user_id ?? target?.targetUserId ?? target?.target_user_id);
}

function targetName(target, fallback = '') {
  return String(
    target?.name
      || target?.targetName
      || target?.target_name
      || target?.label
      || fallback
      || ''
  ).trim();
}

function targetDrop(target) {
  return numberOrNull(
    target?.drop
      ?? target?.Drop
      ?? target?.reward
      ?? target?.coin_reward
      ?? target?.death_reward_preview
      ?? target?.death_drop_coins
  );
}

function playerKey(userId) {
  const id = numberOrNull(userId);
  return id === null ? '' : `user:${id}`;
}

function emptyStore() {
  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: '',
    players: {},
    engagements: {}
  };
}

function normalizePlayer(key, player) {
  if (!player || typeof player !== 'object') return null;
  const userId = targetUserId(player) ?? numberOrNull(String(key || '').replace(/^user:/, ''));
  if (userId === null) return null;
  return {
    key: playerKey(userId),
    userId,
    name: targetName(player, `#${userId}`),
    killCount: Math.max(1, Math.round(Number(player.killCount || 1))),
    firstKilledAt: String(player.firstKilledAt || player.lastKilledAt || ''),
    lastKilledAt: String(player.lastKilledAt || player.firstKilledAt || ''),
    lastKillTick: numberOrNull(player.lastKillTick),
    lastDrop: targetDrop(player)
  };
}

function normalizeEngagement(key, engagement) {
  if (!engagement || typeof engagement !== 'object') return null;
  const userId = targetUserId(engagement) ?? numberOrNull(String(key || '').replace(/^user:/, ''));
  if (userId === null) return null;
  return {
    key: playerKey(userId),
    userId,
    name: targetName(engagement, `#${userId}`),
    active: engagement.active !== false && !engagement.endedAt,
    startedAt: String(engagement.startedAt || ''),
    startedAtMs: Math.max(0, Number(engagement.startedAtMs || Date.parse(engagement.startedAt || '') || 0)),
    startedTick: numberOrNull(engagement.startedTick),
    lastShotAt: String(engagement.lastShotAt || engagement.startedAt || ''),
    lastShotAtMs: Math.max(0, Number(engagement.lastShotAtMs || Date.parse(engagement.lastShotAt || '') || 0)),
    lastShotTick: numberOrNull(engagement.lastShotTick),
    shotCount: Math.max(0, Math.round(Number(engagement.shotCount || 0))),
    lastSeenAtMs: Math.max(0, Number(engagement.lastSeenAtMs || engagement.lastShotAtMs || 0)),
    missingSinceMs: Math.max(0, Number(engagement.missingSinceMs || 0)),
    endedAt: String(engagement.endedAt || ''),
    endedAtMs: Math.max(0, Number(engagement.endedAtMs || Date.parse(engagement.endedAt || '') || 0)),
    outcomeDueAt: String(engagement.outcomeDueAt || ''),
    outcomeDueAtMs: Math.max(0, Number(engagement.outcomeDueAtMs || Date.parse(engagement.outcomeDueAt || '') || 0)),
    endReason: String(engagement.endReason || ''),
    lastDrop: targetDrop(engagement)
  };
}

function normalizeStore(value) {
  const output = emptyStore();
  if (!value || typeof value !== 'object') return output;
  output.updatedAt = String(value.updatedAt || '');
  for (const [key, player] of Object.entries(value.players || {})) {
    const normalized = normalizePlayer(key, player);
    if (normalized) output.players[normalized.key] = normalized;
  }
  for (const [key, engagement] of Object.entries(value.engagements || {})) {
    const normalized = normalizeEngagement(key, engagement);
    if (normalized) output.engagements[normalized.key] = normalized;
  }
  return output;
}

function readStore(file) {
  try {
    return normalizeStore(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch (_) {
    return emptyStore();
  }
}

function writeStore(file, store) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(store, null, 2) + '\n');
  fs.renameSync(temporary, file);
}

function createEasyKillPlayerTracker(options = {}) {
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const onEvent = typeof options.onEvent === 'function' ? options.onEvent : null;
  const file = path.resolve(options.file || path.join(process.cwd(), 'data', 'browserless-runner', 'easy-kill-players.json'));
  const outcomeGraceMs = Math.max(0, Number(options.outcomeGraceMs ?? DEFAULT_OUTCOME_GRACE_MS));
  const persistIntervalMs = Math.max(0, Number(options.persistIntervalMs ?? DEFAULT_PERSIST_INTERVAL_MS));
  let store = readStore(file);
  let lastWriteAtMs = Date.parse(store.updatedAt || '');
  if (!Number.isFinite(lastWriteAtMs)) lastWriteAtMs = 0;
  if (!fs.existsSync(file)) {
    const createdAtMs = now();
    store.updatedAt = new Date(createdAtMs).toISOString();
    writeStore(file, store);
    lastWriteAtMs = createdAtMs;
  }

  function emit(event) {
    if (!onEvent || !event) return;
    try {
      onEvent(cloneJson(event));
    } catch (_) {}
  }

  function persist(atMs = now()) {
    const timestamp = Number.isFinite(Number(atMs)) ? Number(atMs) : now();
    store.updatedAt = new Date(timestamp).toISOString();
    writeStore(file, store);
    lastWriteAtMs = timestamp;
  }

  function playerStatus() {
    return Object.values(store.players)
      .map(player => cloneJson(player))
      .sort((a, b) => Number(b.killCount || 0) - Number(a.killCount || 0)
        || String(b.lastKilledAt || '').localeCompare(String(a.lastKilledAt || ''))
        || String(a.name || '').localeCompare(String(b.name || '')));
  }

  function engagementStatus() {
    return Object.values(store.engagements)
      .map(engagement => cloneJson(engagement))
      .sort((a, b) => Number(b.lastShotAtMs || 0) - Number(a.lastShotAtMs || 0));
  }

  function status() {
    const players = playerStatus();
    const engagements = engagementStatus();
    return {
      file,
      updatedAt: store.updatedAt,
      playerCount: players.length,
      players,
      blockedUserIds: engagements.filter(item => !item.active).map(item => item.userId),
      engagements
    };
  }

  function observeCombatShot(target, detail = {}) {
    if (!target || target.active !== true) return { ok: false, reason: 'non-active-target' };
    const userId = targetUserId(target);
    if (userId === null) return { ok: false, reason: 'missing-user-id' };
    const atMs = Number.isFinite(Number(detail.atMs)) ? Number(detail.atMs) : now();
    const at = new Date(atMs).toISOString();
    const key = playerKey(userId);
    const previous = store.engagements[key] || null;
    const reopened = Boolean(previous && !previous.active);
    const created = !previous || reopened;
    const engagementOnly = detail.engagementOnly === true;
    const name = targetName(target, previous?.name || store.players[key]?.name || `#${userId}`);
    const startedAtMs = created ? atMs : Number(previous.startedAtMs || atMs);
    const startedTick = created
      ? numberOrNull(detail.tick)
      : (numberOrNull(previous.startedTick) ?? numberOrNull(detail.tick));
    store.engagements[key] = {
      key,
      userId,
      name,
      active: true,
      startedAt: new Date(startedAtMs).toISOString(),
      startedAtMs,
      startedTick,
      lastShotAt: engagementOnly ? String(previous?.lastShotAt || '') : at,
      lastShotAtMs: engagementOnly ? Number(previous?.lastShotAtMs || 0) : atMs,
      lastShotTick: engagementOnly ? numberOrNull(previous?.lastShotTick) : numberOrNull(detail.tick),
      shotCount: Math.max(0, Number(previous?.shotCount || 0) + (engagementOnly ? 0 : 1)),
      lastSeenAtMs: atMs,
      missingSinceMs: 0,
      endedAt: '',
      endedAtMs: 0,
      outcomeDueAt: '',
      outcomeDueAtMs: 0,
      endReason: '',
      lastDrop: targetDrop(target) ?? targetDrop(previous)
    };
    if (created || !lastWriteAtMs || atMs - lastWriteAtMs >= persistIntervalMs) persist(atMs);
    if (created) {
      emit({
        type: 'engagement-started',
        at,
        userId,
        name,
        reopened,
        tick: numberOrNull(detail.tick)
      });
    }
    return { ok: true, created, reopened, engagement: cloneJson(store.engagements[key]) };
  }

  function observeCombatEngagement(target, detail = {}) {
    return observeCombatShot(target, { ...detail, engagementOnly: true });
  }

  function observeVisibleTargets(targets = [], detail = {}) {
    const atMs = Number.isFinite(Number(detail.atMs)) ? Number(detail.atMs) : now();
    const missingGraceMs = Math.max(0, Number(detail.missingGraceMs || 0));
    const visibleByUserId = new Map();
    for (const target of targets || []) {
      const userId = targetUserId(target);
      if (userId !== null) visibleByUserId.set(userId, target);
    }
    const ended = [];
    for (const engagement of Object.values(store.engagements)) {
      if (!engagement.active) continue;
      const target = visibleByUserId.get(engagement.userId) || null;
      if (target) {
        engagement.lastSeenAtMs = atMs;
        engagement.missingSinceMs = 0;
        engagement.name = targetName(target, engagement.name);
        engagement.lastDrop = targetDrop(target) ?? engagement.lastDrop;
        continue;
      }
      if (!engagement.missingSinceMs) engagement.missingSinceMs = atMs;
      if (missingGraceMs > 0 && atMs - engagement.missingSinceMs < missingGraceMs) continue;
      const result = finishEngagement(engagement.userId, detail.reason || 'active-target-missing', { atMs });
      if (result.ok) ended.push(result.engagement);
    }
    return { ok: true, ended };
  }

  function finishEngagement(userIdValue, reason = 'not-killed', detail = {}) {
    const userId = numberOrNull(userIdValue);
    if (userId === null) return { ok: false, reason: 'missing-user-id' };
    const key = playerKey(userId);
    const engagement = store.engagements[key] || null;
    if (!engagement) return { ok: false, reason: 'no-engagement' };
    if (!engagement.active) return { ok: true, alreadyEnded: true, engagement: cloneJson(engagement) };
    const atMs = Number.isFinite(Number(detail.atMs)) ? Number(detail.atMs) : now();
    const dueAtMs = atMs + Math.max(0, Number(detail.outcomeGraceMs ?? outcomeGraceMs));
    engagement.active = false;
    engagement.endedAt = new Date(atMs).toISOString();
    engagement.endedAtMs = atMs;
    engagement.outcomeDueAt = new Date(dueAtMs).toISOString();
    engagement.outcomeDueAtMs = dueAtMs;
    engagement.endReason = String(reason || 'not-killed');
    engagement.missingSinceMs = 0;
    persist(atMs);
    emit({
      type: 'engagement-ended-pending',
      at: engagement.endedAt,
      userId,
      name: engagement.name,
      reason: engagement.endReason,
      outcomeDueAt: engagement.outcomeDueAt
    });
    return { ok: true, engagement: cloneJson(engagement) };
  }

  function finishActiveEngagements(reason = 'canary-ended', detail = {}) {
    const ended = [];
    for (const engagement of Object.values(store.engagements)) {
      if (!engagement.active) continue;
      const result = finishEngagement(engagement.userId, reason, detail);
      if (result.ok) ended.push(result.engagement);
    }
    return { ok: true, ended };
  }

  function observeKillEvidence(evidence = [], detail = {}) {
    const atMs = Number.isFinite(Number(detail.atMs)) ? Number(detail.atMs) : now();
    const confirmed = [];
    for (const item of evidence || []) {
      const userId = targetUserId(item);
      if (userId === null) continue;
      const key = playerKey(userId);
      const engagement = store.engagements[key] || null;
      if (!engagement) continue;
      const tick = numberOrNull(item?.tick);
      if (tick !== null && engagement.startedTick !== null && tick < engagement.startedTick) continue;
      const existing = store.players[key] || null;
      const name = targetName(item, engagement.name || existing?.name || `#${userId}`);
      const killedAt = String(item?.at || '') || new Date(atMs).toISOString();
      store.players[key] = {
        key,
        userId,
        name,
        killCount: Math.max(1, Number(existing?.killCount || 0) + 1),
        firstKilledAt: existing?.firstKilledAt || killedAt,
        lastKilledAt: killedAt,
        lastKillTick: tick,
        lastDrop: engagement.lastDrop ?? existing?.lastDrop ?? null
      };
      delete store.engagements[key];
      const event = {
        type: 'killed',
        at: killedAt,
        userId,
        name,
        tick,
        added: !existing,
        killCount: store.players[key].killCount
      };
      confirmed.push(event);
      emit(event);
    }
    if (confirmed.length) persist(atMs);
    return { ok: true, confirmed };
  }

  function expirePendingOutcomes(atMsValue = now()) {
    const atMs = Number.isFinite(Number(atMsValue)) ? Number(atMsValue) : now();
    const expired = [];
    let changed = false;
    for (const [key, engagement] of Object.entries(store.engagements)) {
      if (engagement.active || !(Number(engagement.outcomeDueAtMs || 0) > 0) || atMs < Number(engagement.outcomeDueAtMs)) continue;
      const existing = store.players[key] || null;
      if (existing) delete store.players[key];
      delete store.engagements[key];
      changed = true;
      const event = {
        type: 'not-killed',
        at: new Date(atMs).toISOString(),
        userId: engagement.userId,
        name: engagement.name,
        reason: engagement.endReason || 'outcome-timeout',
        removed: Boolean(existing)
      };
      expired.push(event);
      emit(event);
    }
    if (changed) persist(atMs);
    return { ok: true, expired };
  }

  function recordImmediateFailure(target, reason = 'approach-stop-loss', detail = {}) {
    const userId = targetUserId(target);
    if (userId === null) return { ok: false, reason: 'missing-user-id' };
    const atMs = Number.isFinite(Number(detail.atMs)) ? Number(detail.atMs) : now();
    const key = playerKey(userId);
    const existing = store.players[key] || null;
    const engagement = store.engagements[key] || null;
    if (existing) delete store.players[key];
    if (engagement) delete store.engagements[key];
    if (existing || engagement) persist(atMs);
    const event = {
      type: 'not-killed',
      at: new Date(atMs).toISOString(),
      userId,
      name: targetName(target, existing?.name || engagement?.name || `#${userId}`),
      reason: String(reason || 'approach-stop-loss'),
      removed: Boolean(existing),
      immediate: true
    };
    emit(event);
    return { ok: true, event };
  }

  return {
    file,
    expirePendingOutcomes,
    finishActiveEngagements,
    finishEngagement,
    observeCombatEngagement,
    observeCombatShot,
    observeKillEvidence,
    observeVisibleTargets,
    recordImmediateFailure,
    status
  };
}

module.exports = {
  DEFAULT_OUTCOME_GRACE_MS,
  createEasyKillPlayerTracker,
  playerKey,
  targetUserId
};
