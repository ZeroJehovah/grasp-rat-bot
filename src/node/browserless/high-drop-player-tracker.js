'use strict';

const fs = require('fs');
const path = require('path');

const SCHEMA_VERSION = 2;
const UTC8_OFFSET_MS = 8 * 60 * 60 * 1000;
const DEFAULT_RECORD_THRESHOLD = 50;
const DEFAULT_SNAPSHOT_GAP_MS = 3 * 60 * 1000;

function cloneJson(value) {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

function dayKey(ms = Date.now()) {
  return new Date(Number(ms) + UTC8_OFFSET_MS).toISOString().slice(0, 10);
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function entityDrop(entity) {
  return numberOrNull(
    entity?.drop
      ?? entity?.Drop
      ?? entity?.reward
      ?? entity?.coin_reward
      ?? entity?.death_reward_preview
      ?? entity?.death_drop_coins
      ?? entity?.coins
  );
}

function entityName(entity, fallback = '') {
  return String(
    entity?.name
      || entity?.label
      || entity?.username
      || entity?.user_name
      || entity?.displayName
      || entity?.display_name
      || fallback
      || ''
  ).trim();
}

function entityIdentity(entity) {
  const userId = numberOrNull(entity?.user_id ?? entity?.userId);
  if (userId === null) return null;
  const entityId = entity?.entity_id ?? entity?.entityId ?? entity?.id;
  return {
    key: `user:${userId}`,
    userId,
    entityId: entityId === null || entityId === undefined || entityId === '' ? null : String(entityId)
  };
}

function emptyStore(day = '') {
  return {
    schemaVersion: SCHEMA_VERSION,
    day,
    updatedAt: '',
    lastSnapshotAt: '',
    lastSnapshotSource: '',
    players: {}
  };
}

function normalizeStore(value, expectedDay) {
  if (!value || typeof value !== 'object' || value.day !== expectedDay) return emptyStore(expectedDay);
  const output = emptyStore(expectedDay);
  output.updatedAt = String(value.updatedAt || '');
  output.lastSnapshotAt = String(value.lastSnapshotAt || '');
  output.lastSnapshotSource = String(value.lastSnapshotSource || '');
  for (const [key, player] of Object.entries(value.players || {})) {
    if (!player || typeof player !== 'object') continue;
    const userId = numberOrNull(player.userId ?? String(key || '').replace(/^user:/, ''));
    if (userId === null) continue;
    const initialDrop = numberOrNull(player.initialDrop);
    const maxDrop = numberOrNull(player.maxDrop);
    const latestDrop = numberOrNull(player.latestDrop);
    if (initialDrop === null || maxDrop === null || latestDrop === null) continue;
    const normalizedKey = `user:${userId}`;
    const candidate = {
      key: normalizedKey,
      userId,
      entityId: player.entityId === null || player.entityId === undefined ? null : String(player.entityId),
      name: String(player.name || ''),
      initialDrop,
      maxDrop,
      latestDrop,
      firstObservedAt: String(player.firstObservedAt || ''),
      lastObservedAt: String(player.lastObservedAt || ''),
      lastObservedTick: numberOrNull(player.lastObservedTick)
    };
    const existing = output.players[normalizedKey] || null;
    if (!existing) {
      output.players[normalizedKey] = candidate;
      continue;
    }
    const existingFirstMs = Date.parse(existing.firstObservedAt || '');
    const candidateFirstMs = Date.parse(candidate.firstObservedAt || '');
    const candidateIsEarlier = !Number.isFinite(existingFirstMs)
      || (Number.isFinite(candidateFirstMs) && candidateFirstMs < existingFirstMs);
    const existingLastMs = Date.parse(existing.lastObservedAt || '');
    const candidateLastMs = Date.parse(candidate.lastObservedAt || '');
    const existingLastTick = numberOrNull(existing.lastObservedTick);
    const candidateLastTick = numberOrNull(candidate.lastObservedTick);
    const candidateIsLater = existingLastTick !== null && candidateLastTick !== null
      ? candidateLastTick >= existingLastTick
      : (!Number.isFinite(existingLastMs)
        || (Number.isFinite(candidateLastMs) && candidateLastMs >= existingLastMs));
    const first = candidateIsEarlier ? candidate : existing;
    const latest = candidateIsLater ? candidate : existing;
    output.players[normalizedKey] = {
      ...existing,
      key: normalizedKey,
      userId,
      entityId: latest.entityId ?? existing.entityId ?? candidate.entityId,
      name: latest.name || existing.name || candidate.name,
      initialDrop: first.initialDrop,
      maxDrop: Math.max(existing.maxDrop, candidate.maxDrop),
      latestDrop: latest.latestDrop,
      firstObservedAt: first.firstObservedAt,
      lastObservedAt: latest.lastObservedAt,
      lastObservedTick: latest.lastObservedTick
    };
  }
  return output;
}

function readStore(file, expectedDay) {
  try {
    return normalizeStore(JSON.parse(fs.readFileSync(file, 'utf8')), expectedDay);
  } catch (_) {
    return emptyStore(expectedDay);
  }
}

function writeStore(file, store) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(store, null, 2) + '\n');
  fs.renameSync(temporary, file);
}

function createHighDropPlayerTracker(options = {}) {
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const file = path.resolve(options.file || path.join(process.cwd(), 'data', 'browserless-runner', 'high-drop-players.json'));
  const threshold = Math.max(0, Number(options.threshold ?? DEFAULT_RECORD_THRESHOLD));
  let store = readStore(file, dayKey(now()));
  let lastWriteAtMs = Date.parse(store.updatedAt || '');
  if (!Number.isFinite(lastWriteAtMs)) lastWriteAtMs = 0;

  function ensureToday(atMs = now()) {
    const today = dayKey(atMs);
    if (store.day === today) return false;
    store = emptyStore(today);
    writeStore(file, store);
    lastWriteAtMs = Number(atMs);
    return true;
  }

  function observeSnapshot(payload, detail = {}) {
    const observedAtMs = Number(detail.observedAtMs ?? now());
    const atMs = Number.isFinite(observedAtMs) ? observedAtMs : now();
    ensureToday(atMs);
    if (!payload || typeof payload !== 'object' || !Array.isArray(payload.entities)) {
      return { ok: false, reason: 'invalid-snapshot-payload', observed: 0, updated: 0 };
    }
    const at = new Date(atMs).toISOString();
    const snapshotTick = numberOrNull(payload.tick);
    const selfUserId = numberOrNull(detail.selfUserId);
    let observed = 0;
    let updated = 0;
    for (const entity of payload.entities) {
      if (!entity || typeof entity !== 'object') continue;
      const identity = entityIdentity(entity);
      const drop = entityDrop(entity);
      if (!identity || drop === null) continue;
      if (selfUserId !== null && identity.userId === selfUserId) continue;
      const existing = store.players[identity.key] || null;
      if (!existing && drop < threshold) continue;
      observed += 1;
      const fallbackName = identity.userId !== null ? `#${identity.userId}` : identity.entityId ? `#${identity.entityId}` : '';
      const name = entityName(entity, existing?.name || fallbackName);
      if (!existing) {
        store.players[identity.key] = {
          key: identity.key,
          userId: identity.userId,
          entityId: identity.entityId,
          name,
          initialDrop: drop,
          maxDrop: drop,
          latestDrop: drop,
          firstObservedAt: at,
          lastObservedAt: at,
          lastObservedTick: snapshotTick
        };
        updated += 1;
        continue;
      }
      const nextMax = Math.max(Number(existing.maxDrop), drop);
      const existingTick = numberOrNull(existing.lastObservedTick);
      const staleObservation = snapshotTick !== null && existingTick !== null && snapshotTick < existingTick;
      const displayChanged = existing.maxDrop !== nextMax
        || (!staleObservation && (existing.name !== name
          || existing.entityId !== identity.entityId
          || existing.latestDrop !== drop));
      const observationAdvanced = !staleObservation && existing.lastObservedTick !== snapshotTick;
      if (displayChanged || observationAdvanced) {
        store.players[identity.key] = {
          ...existing,
          maxDrop: nextMax,
          ...(staleObservation ? {} : {
            entityId: identity.entityId,
            name,
            latestDrop: drop,
            lastObservedAt: at,
            lastObservedTick: snapshotTick
          })
        };
        if (displayChanged) updated += 1;
      }
    }
    const shouldPersist = updated > 0
      || !lastWriteAtMs
      || atMs - lastWriteAtMs >= DEFAULT_SNAPSHOT_GAP_MS;
    store.updatedAt = at;
    store.lastSnapshotAt = at;
    store.lastSnapshotSource = String(detail.source || 'snapshot');
    if (shouldPersist) {
      writeStore(file, store);
      lastWriteAtMs = atMs;
    }
    return { ok: true, observed, updated, playerCount: Object.keys(store.players).length };
  }

  function status(atMs = now()) {
    ensureToday(atMs);
    const players = Object.values(store.players)
      .map(player => cloneJson(player))
      .sort((a, b) => Number(b.maxDrop) - Number(a.maxDrop)
        || Number(b.latestDrop) - Number(a.latestDrop)
        || String(a.name).localeCompare(String(b.name)));
    return {
      day: store.day,
      updatedAt: store.updatedAt,
      lastSnapshotAt: store.lastSnapshotAt,
      lastSnapshotSource: store.lastSnapshotSource,
      threshold,
      file,
      players
    };
  }

  return {
    file,
    observeSnapshot,
    status
  };
}

function createSnapshotGapPoller(options = {}) {
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const setTimer = typeof options.setTimeout === 'function' ? options.setTimeout : setTimeout;
  const clearTimer = typeof options.clearTimeout === 'function' ? options.clearTimeout : clearTimeout;
  const intervalMs = Math.max(1000, Number(options.intervalMs || DEFAULT_SNAPSHOT_GAP_MS));
  const notReadyRetryMs = Math.min(intervalMs, Math.max(1000, Number(options.notReadyRetryMs || 30000)));
  let timer = null;
  let stopped = true;
  let inFlight = false;
  let lastSnapshotAtMs = Math.max(0, Number(options.lastSnapshotAtMs || 0));
  let lastAttemptAtMs = 0;

  function schedule(delayMs = null) {
    if (stopped) return;
    if (timer) clearTimer(timer);
    const base = Math.max(lastSnapshotAtMs, lastAttemptAtMs);
    const delay = delayMs === null
      ? Math.max(1000, intervalMs - Math.max(0, now() - base))
      : Math.max(0, Number(delayMs));
    timer = setTimer(run, delay);
    timer?.unref?.();
  }

  function noteSnapshot(observedAtMs = now()) {
    const value = Number(observedAtMs);
    if (Number.isFinite(value)) lastSnapshotAtMs = Math.max(lastSnapshotAtMs, value);
    schedule();
  }

  async function run() {
    timer = null;
    if (stopped || inFlight) return;
    if (typeof options.isReady === 'function' && !options.isReady()) {
      schedule(notReadyRetryMs);
      return;
    }
    const base = Math.max(lastSnapshotAtMs, lastAttemptAtMs);
    if (base && now() - base < intervalMs) {
      schedule();
      return;
    }
    inFlight = true;
    lastAttemptAtMs = now();
    try {
      const payload = await options.fetchSnapshot();
      if (payload && typeof options.onSnapshot === 'function') {
        await options.onSnapshot(payload, { source: 'gap-http', observedAtMs: now() });
      }
    } catch (err) {
      if (typeof options.onError === 'function') options.onError(err);
    } finally {
      inFlight = false;
      schedule();
    }
  }

  function start() {
    if (!stopped) return;
    stopped = false;
    schedule(lastSnapshotAtMs ? null : 1000);
  }

  function stop() {
    stopped = true;
    if (timer) clearTimer(timer);
    timer = null;
  }

  return {
    noteSnapshot,
    start,
    stop,
    status() {
      return { intervalMs, lastSnapshotAtMs, lastAttemptAtMs, inFlight, stopped };
    }
  };
}

module.exports = {
  DEFAULT_SNAPSHOT_GAP_MS,
  createHighDropPlayerTracker,
  createSnapshotGapPoller,
  dayKey,
  entityDrop
};
