'use strict';

const fs = require('fs');
const path = require('path');

const SCHEMA_VERSION = 3;
const UTC8_OFFSET_MS = 8 * 60 * 60 * 1000;
const DEFAULT_RECORD_THRESHOLD = 50;
const DEFAULT_SNAPSHOT_GAP_MS = 30 * 1000;

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
    lastGlobalSnapshotAt: '',
    lastGlobalSnapshotSource: '',
    players: {}
  };
}

function normalizeStore(value, expectedDay) {
  if (!value || typeof value !== 'object' || value.day !== expectedDay) return emptyStore(expectedDay);
  const output = emptyStore(expectedDay);
  output.updatedAt = String(value.updatedAt || '');
  output.lastSnapshotAt = String(value.lastSnapshotAt || '');
  output.lastSnapshotSource = String(value.lastSnapshotSource || '');
  output.lastGlobalSnapshotAt = String(value.lastGlobalSnapshotAt || '');
  output.lastGlobalSnapshotSource = String(value.lastGlobalSnapshotSource || '');
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
      lastObservedTick: numberOrNull(player.lastObservedTick),
      online: player.online === true ? true : (player.online === false ? false : null),
      onlineObservedAt: String(player.onlineObservedAt || ''),
      onlineCheckedAt: String(player.onlineCheckedAt || '')
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
    const candidateIsLater = Number.isFinite(existingLastMs) && Number.isFinite(candidateLastMs)
      ? candidateLastMs >= existingLastMs
      : (candidateLastTick !== null && existingLastTick !== null
        ? candidateLastTick >= existingLastTick
        : !Number.isFinite(existingLastMs));
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
      lastObservedTick: latest.lastObservedTick,
      online: latest.online ?? existing.online ?? candidate.online ?? null,
      onlineObservedAt: latest.onlineObservedAt || existing.onlineObservedAt || candidate.onlineObservedAt,
      onlineCheckedAt: latest.onlineCheckedAt || existing.onlineCheckedAt || candidate.onlineCheckedAt
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

function writeStore(file, store, backgroundIo = null) {
  if (backgroundIo?.writeJsonAtomic) {
    if (!backgroundIo.writeJsonAtomic(file, store)) throw new Error('background high-drop persistence unavailable');
    return;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(store, null, 2) + '\n');
  fs.renameSync(temporary, file);
}

function createHighDropPlayerTracker(options = {}) {
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const file = path.resolve(options.file || path.join(process.cwd(), 'data', 'browserless-runner', 'high-drop-players.json'));
  const threshold = Math.max(0, Number(options.threshold ?? DEFAULT_RECORD_THRESHOLD));
  const backgroundIo = options.backgroundIo && typeof options.backgroundIo === 'object' ? options.backgroundIo : null;
  let store = readStore(file, dayKey(now()));
  let lastWriteAtMs = Date.parse(store.updatedAt || '');
  if (!Number.isFinite(lastWriteAtMs)) lastWriteAtMs = 0;

  function ensureToday(atMs = now()) {
    const today = dayKey(atMs);
    if (store.day === today) return false;
    store = emptyStore(today);
    writeStore(file, store, backgroundIo);
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
    const source = String(detail.source || 'snapshot');
    const globalSnapshot = detail.global === true || (detail.global !== false && source !== 'ws');
    const presentUserIds = new Set();
    for (const entity of payload.entities) {
      const identity = entityIdentity(entity);
      if (identity && (selfUserId === null || identity.userId !== selfUserId)) {
        presentUserIds.add(identity.userId);
      }
    }
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
          lastObservedTick: snapshotTick,
          online: true,
          onlineObservedAt: at,
          onlineCheckedAt: globalSnapshot ? at : ''
        };
        updated += 1;
        continue;
      }
      const nextMax = Math.max(Number(existing.maxDrop), drop);
      const existingObservedAtMs = Date.parse(existing.lastObservedAt || '');
      const staleObservation = Number.isFinite(existingObservedAtMs) && atMs < existingObservedAtMs;
      const displayChanged = existing.maxDrop !== nextMax
        || (!staleObservation && (existing.name !== name
          || existing.entityId !== identity.entityId
          || existing.latestDrop !== drop
          || existing.online !== true));
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
            lastObservedTick: snapshotTick,
            online: true,
            onlineObservedAt: at,
            ...(globalSnapshot ? { onlineCheckedAt: at } : {})
          })
        };
        if (displayChanged) updated += 1;
      }
    }
    if (globalSnapshot) {
      for (const [key, player] of Object.entries(store.players)) {
        const online = presentUserIds.has(player.userId);
        if (player.online !== online) updated += 1;
        store.players[key] = {
          ...player,
          online,
          onlineCheckedAt: at,
          ...(online ? { onlineObservedAt: at } : {})
        };
      }
      store.lastGlobalSnapshotAt = at;
      store.lastGlobalSnapshotSource = source;
    }
    const shouldPersist = updated > 0
      || globalSnapshot
      || !lastWriteAtMs
      || atMs - lastWriteAtMs >= DEFAULT_SNAPSHOT_GAP_MS;
    store.updatedAt = at;
    store.lastSnapshotAt = at;
    store.lastSnapshotSource = source;
    if (shouldPersist) {
      writeStore(file, store, backgroundIo);
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
      lastGlobalSnapshotAt: store.lastGlobalSnapshotAt,
      lastGlobalSnapshotSource: store.lastGlobalSnapshotSource,
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
  const minimumIntervalMs = Math.max(1000, Number(options.minimumIntervalMs || 1000));
  const intervalMs = Math.max(minimumIntervalMs, Number(options.intervalMs || DEFAULT_SNAPSHOT_GAP_MS));
  const globalIntervalMs = Number(options.globalIntervalMs) > 0
    ? Math.max(minimumIntervalMs, Number(options.globalIntervalMs))
    : 0;
  const notReadyRetryMs = Math.min(intervalMs, Math.max(1000, Number(options.notReadyRetryMs || 30000)));
  let timer = null;
  let stopped = true;
  let inFlight = false;
  let lastSnapshotAtMs = Math.max(0, Number(options.lastSnapshotAtMs || 0));
  let lastGlobalSnapshotAtMs = Math.max(0, Number(options.lastGlobalSnapshotAtMs || 0));
  let lastAttemptAtMs = 0;
  let lifecycleGeneration = 0;

  function currentIntervalMs() {
    if (typeof options.getIntervalMs !== 'function') return intervalMs;
    const dynamic = Number(options.getIntervalMs({
      nowMs: now(),
      lastSnapshotAtMs,
      lastAttemptAtMs,
      inFlight,
      stopped
    }));
    return Math.max(minimumIntervalMs, Number.isFinite(dynamic) ? dynamic : intervalMs);
  }

  function schedule(delayMs = null) {
    if (stopped) return;
    if (timer) clearTimer(timer);
    const t = now();
    const snapshotBase = Math.max(lastSnapshotAtMs, lastAttemptAtMs);
    const snapshotDelay = snapshotBase
      ? Math.max(0, currentIntervalMs() - Math.max(0, t - snapshotBase))
      : 0;
    const globalBase = Math.max(lastGlobalSnapshotAtMs, lastAttemptAtMs);
    const globalDelay = globalIntervalMs > 0
      ? (globalBase ? Math.max(0, globalIntervalMs - Math.max(0, t - globalBase)) : 0)
      : Infinity;
    const delay = delayMs === null
      ? Math.min(snapshotDelay, globalDelay)
      : Math.max(0, Number(delayMs));
    timer = setTimer(run, delay);
    timer?.unref?.();
  }

  function noteSnapshot(observedAtMs = now(), detail = {}) {
    const scheduleAtMs = Number(detail.scheduleAtMs ?? observedAtMs);
    const value = Number.isFinite(scheduleAtMs) ? scheduleAtMs : Number(observedAtMs);
    if (Number.isFinite(value)) {
      lastSnapshotAtMs = Math.max(lastSnapshotAtMs, value);
      if (detail.global === true) lastGlobalSnapshotAtMs = Math.max(lastGlobalSnapshotAtMs, value);
    }
    schedule();
  }

  function refreshSchedule() {
    schedule();
  }

  async function run() {
    timer = null;
    if (stopped || inFlight) return;
    const runGeneration = lifecycleGeneration;
    if (typeof options.isReady === 'function' && !options.isReady()) {
      schedule(notReadyRetryMs);
      return;
    }
    const t = now();
    const snapshotBase = Math.max(lastSnapshotAtMs, lastAttemptAtMs);
    const globalBase = Math.max(lastGlobalSnapshotAtMs, lastAttemptAtMs);
    const snapshotDue = !snapshotBase || t - snapshotBase >= currentIntervalMs();
    const globalDue = globalIntervalMs > 0 && (!globalBase || t - globalBase >= globalIntervalMs);
    if (!snapshotDue && !globalDue) {
      schedule();
      return;
    }
    inFlight = true;
    const attemptAtMs = now();
    lastAttemptAtMs = attemptAtMs;
    try {
      const payload = await options.fetchSnapshot();
      if (payload && !stopped && runGeneration === lifecycleGeneration && typeof options.onSnapshot === 'function') {
        await options.onSnapshot(payload, {
          source: 'gap-http',
          observedAtMs: now(),
          scheduleAtMs: attemptAtMs,
          global: true
        });
      }
    } catch (err) {
      if (!stopped && runGeneration === lifecycleGeneration && typeof options.onError === 'function') {
        options.onError(err);
      }
    } finally {
      inFlight = false;
      if (!stopped) schedule();
    }
  }

  function start(detail = {}) {
    lifecycleGeneration += 1;
    if (detail.reset === true) {
      const snapshotAtMs = Math.max(0, Number(detail.snapshotAtMs || 0));
      const globalSnapshotAtMs = Math.max(0, Number(detail.globalSnapshotAtMs ?? snapshotAtMs));
      lastSnapshotAtMs = snapshotAtMs;
      lastGlobalSnapshotAtMs = globalSnapshotAtMs;
      lastAttemptAtMs = 0;
    }
    stopped = false;
    schedule(detail.immediate === true ? 0 : (lastSnapshotAtMs ? null : 1000));
  }

  function stop() {
    lifecycleGeneration += 1;
    stopped = true;
    if (timer) clearTimer(timer);
    timer = null;
  }

  return {
    noteSnapshot,
    refreshSchedule,
    start,
    stop,
    status() {
      return {
        intervalMs,
        globalIntervalMs,
        minimumIntervalMs,
        currentIntervalMs: currentIntervalMs(),
        lastSnapshotAtMs,
        lastGlobalSnapshotAtMs,
        lastAttemptAtMs,
        inFlight,
        stopped,
        lifecycleGeneration
      };
    }
  };
}

module.exports = {
  DEFAULT_RECORD_THRESHOLD,
  DEFAULT_SNAPSHOT_GAP_MS,
  createHighDropPlayerTracker,
  createSnapshotGapPoller,
  dayKey,
  entityDrop
};
