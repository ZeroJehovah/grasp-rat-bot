'use strict';

const fs = require('fs');
const path = require('path');
const {
  nameObservationFreshness,
  timestampOrNull
} = require('./player-name-observation');

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

function entityExternalBalanceSnapshot(entity) {
  return numberOrNull(entity?.external_balance_snapshot ?? entity?.externalBalanceSnapshot);
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
    selfExternalBalanceSnapshot: null,
    selfExternalBalanceSnapshotAt: '',
    selfExternalBalanceSnapshotTick: null,
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
  output.selfExternalBalanceSnapshot = numberOrNull(value.selfExternalBalanceSnapshot);
  output.selfExternalBalanceSnapshotAt = String(value.selfExternalBalanceSnapshotAt || '');
  output.selfExternalBalanceSnapshotTick = numberOrNull(value.selfExternalBalanceSnapshotTick);
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
      externalBalanceSnapshot: numberOrNull(
        player.externalBalanceSnapshot ?? player.external_balance_snapshot
      ),
      externalBalanceSnapshotAt: String(player.externalBalanceSnapshotAt || ''),
      externalBalanceSnapshotTick: numberOrNull(player.externalBalanceSnapshotTick),
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
    const candidateIsLater = !Number.isFinite(candidateLastMs) && !Number.isFinite(existingLastMs)
      ? (candidateLastTick !== null && existingLastTick !== null
        ? candidateLastTick >= existingLastTick
        : !Number.isFinite(existingLastMs))
      : nameObservationFreshness({
          observedAtMs: Number.isFinite(candidateLastMs) ? candidateLastMs : null,
          observedTick: candidateLastTick,
          previousObservedAtMs: Number.isFinite(existingLastMs) ? existingLastMs : null,
          previousObservedTick: existingLastTick
        }).accepted;
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
      externalBalanceSnapshot: latest.externalBalanceSnapshot
        ?? existing.externalBalanceSnapshot
        ?? candidate.externalBalanceSnapshot,
      externalBalanceSnapshotAt: latest.externalBalanceSnapshotAt
        || existing.externalBalanceSnapshotAt
        || candidate.externalBalanceSnapshotAt,
      externalBalanceSnapshotTick: latest.externalBalanceSnapshotTick
        ?? existing.externalBalanceSnapshotTick
        ?? candidate.externalBalanceSnapshotTick,
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
    let observationAdvanced = 0;
    for (const entity of payload.entities) {
      if (!entity || typeof entity !== 'object') continue;
      const identity = entityIdentity(entity);
      const externalBalanceSnapshot = entityExternalBalanceSnapshot(entity);
      if (identity && selfUserId !== null && identity.userId === selfUserId && externalBalanceSnapshot !== null) {
        const selfObservedAtMs = timestampOrNull(store.selfExternalBalanceSnapshotAt);
        const freshness = nameObservationFreshness({
          observedAtMs: atMs,
          observedTick: snapshotTick,
          previousObservedAtMs: selfObservedAtMs,
          previousObservedTick: store.selfExternalBalanceSnapshotTick
        });
        if (freshness.accepted) {
          const changed = store.selfExternalBalanceSnapshot !== externalBalanceSnapshot;
          store.selfExternalBalanceSnapshot = externalBalanceSnapshot;
          store.selfExternalBalanceSnapshotAt = at;
          store.selfExternalBalanceSnapshotTick = snapshotTick;
          if (changed || freshness.advanced) updated += 1;
        }
      }
      const existing = identity ? store.players[identity.key] || null : null;
      if (
        identity
        && (selfUserId === null || identity.userId !== selfUserId)
        && existing
        && externalBalanceSnapshot !== null
      ) {
        const balanceFreshness = nameObservationFreshness({
          observedAtMs: atMs,
          observedTick: snapshotTick,
          previousObservedAtMs: timestampOrNull(
            existing.externalBalanceSnapshotAt || existing.lastObservedAt
          ),
          previousObservedTick: existing.externalBalanceSnapshotTick ?? existing.lastObservedTick
        });
        if (balanceFreshness.accepted) {
          const changed = existing.externalBalanceSnapshot !== externalBalanceSnapshot;
          store.players[identity.key] = {
            ...existing,
            externalBalanceSnapshot,
            externalBalanceSnapshotAt: at,
            externalBalanceSnapshotTick: snapshotTick
          };
          if (changed || balanceFreshness.advanced) updated += 1;
        }
      }
      const drop = entityDrop(entity);
      if (!identity || drop === null) continue;
      if (selfUserId !== null && identity.userId === selfUserId) continue;
      const trackedPlayer = store.players[identity.key] || null;
      if (!trackedPlayer && drop < threshold) continue;
      observed += 1;
      const fallbackName = identity.userId !== null ? `#${identity.userId}` : identity.entityId ? `#${identity.entityId}` : '';
      const name = entityName(entity, trackedPlayer?.name || fallbackName);
      if (!trackedPlayer) {
        store.players[identity.key] = {
          key: identity.key,
          userId: identity.userId,
          entityId: identity.entityId,
          name,
          initialDrop: drop,
          maxDrop: drop,
          latestDrop: drop,
          externalBalanceSnapshot,
          externalBalanceSnapshotAt: externalBalanceSnapshot === null ? '' : at,
          externalBalanceSnapshotTick: externalBalanceSnapshot === null ? null : snapshotTick,
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
      const existingObservedAtMs = timestampOrNull(trackedPlayer.lastObservedAt);
      const freshness = nameObservationFreshness({
        observedAtMs: atMs,
        observedTick: snapshotTick,
        previousObservedAtMs: existingObservedAtMs,
        previousObservedTick: trackedPlayer.lastObservedTick
      });
      const staleObservation = !freshness.accepted;
      if (freshness.advanced) observationAdvanced += 1;
      // maxDrop 与 latestDrop 使用同一套新旧门控: stale/乱序观测不得抬高 max、也不得
      // 回退 latest，避免出现 latestDrop < maxDrop。
      if (!staleObservation) {
        const nextMax = Math.max(Number(trackedPlayer.maxDrop), drop);
        const displayChanged = trackedPlayer.maxDrop !== nextMax
          || trackedPlayer.name !== name
          || trackedPlayer.entityId !== identity.entityId
          || trackedPlayer.latestDrop !== drop
          || (externalBalanceSnapshot !== null
            && trackedPlayer.externalBalanceSnapshot !== externalBalanceSnapshot)
          || trackedPlayer.online !== true;
        if (displayChanged || freshness.advanced) {
          store.players[identity.key] = {
            ...trackedPlayer,
            maxDrop: nextMax,
            entityId: identity.entityId,
            name,
            latestDrop: drop,
            ...(externalBalanceSnapshot !== null ? { externalBalanceSnapshot } : {}),
            lastObservedAt: at,
            lastObservedTick: snapshotTick,
            online: true,
            onlineObservedAt: at,
            ...(externalBalanceSnapshot !== null
              ? { externalBalanceSnapshotAt: at, externalBalanceSnapshotTick: snapshotTick }
              : {}),
            ...(globalSnapshot ? { onlineCheckedAt: at } : {})
          };
          if (displayChanged) updated += 1;
        }
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
      || observationAdvanced > 0
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
      selfExternalBalanceSnapshot: store.selfExternalBalanceSnapshot,
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
  let nextAttemptAtMs = 0;
  let lastCompletedAtMs = 0;
  let lastSuccessAtMs = 0;
  let lastFailureAtMs = 0;
  let lastFailureHttpStatus = null;
  let lastError = '';
  let lifecycleGeneration = 0;
  let nextRequestAllowBurst = false;

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

  function currentGlobalIntervalMs() {
    if (globalIntervalMs <= 0) return 0;
    if (typeof options.getGlobalIntervalMs !== 'function') return globalIntervalMs;
    const dynamic = Number(options.getGlobalIntervalMs({
      nowMs: now(),
      lastSnapshotAtMs,
      lastGlobalSnapshotAtMs,
      lastAttemptAtMs,
      inFlight,
      stopped
    }));
    return Math.max(minimumIntervalMs, Number.isFinite(dynamic) ? dynamic : globalIntervalMs);
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
    const effectiveGlobalIntervalMs = currentGlobalIntervalMs();
    const globalDelay = effectiveGlobalIntervalMs > 0
      ? (globalBase ? Math.max(0, effectiveGlobalIntervalMs - Math.max(0, t - globalBase)) : 0)
      : Infinity;
    const delay = delayMs === null
      ? Math.min(snapshotDelay, globalDelay)
      : Math.max(0, Number(delayMs));
    nextAttemptAtMs = t + Math.max(0, Number(delay) || 0);
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
    nextAttemptAtMs = 0;
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
    const effectiveGlobalIntervalMs = currentGlobalIntervalMs();
    const globalDue = effectiveGlobalIntervalMs > 0
      && (!globalBase || t - globalBase >= effectiveGlobalIntervalMs);
    if (!snapshotDue && !globalDue) {
      schedule();
      return;
    }
    inFlight = true;
    const attemptAtMs = now();
    lastAttemptAtMs = attemptAtMs;
    const allowBurst = nextRequestAllowBurst;
    nextRequestAllowBurst = false;
    try {
      const payload = await options.fetchSnapshot({
        allowBurst,
        attemptAtMs,
        lifecycleGeneration: runGeneration
      });
      if (payload && !stopped && runGeneration === lifecycleGeneration && typeof options.onSnapshot === 'function') {
        await options.onSnapshot(payload, {
          source: 'gap-http',
          observedAtMs: now(),
          scheduleAtMs: attemptAtMs,
          global: true
        });
      }
      lastCompletedAtMs = now();
      lastSuccessAtMs = lastCompletedAtMs;
      lastError = '';
    } catch (err) {
      lastCompletedAtMs = now();
      lastFailureAtMs = lastCompletedAtMs;
      lastFailureHttpStatus = Number.isFinite(Number(err?.status ?? err?.statusCode))
        ? Math.round(Number(err.status ?? err.statusCode))
        : null;
      lastError = err?.message || String(err);
      if (!stopped && runGeneration === lifecycleGeneration && typeof options.onError === 'function') {
        options.onError(err);
      }
    } finally {
      inFlight = false;
      if (!stopped) schedule();
    }
  }

  function start(detail = {}) {
    if (stopped) lifecycleGeneration += 1;
    if (detail.reset === true) {
      const snapshotAtMs = Math.max(0, Number(detail.snapshotAtMs || 0));
      const globalSnapshotAtMs = Math.max(0, Number(detail.globalSnapshotAtMs ?? snapshotAtMs));
      lastSnapshotAtMs = snapshotAtMs;
      lastGlobalSnapshotAtMs = globalSnapshotAtMs;
      lastAttemptAtMs = 0;
      nextAttemptAtMs = 0;
      lastCompletedAtMs = 0;
      lastSuccessAtMs = 0;
      lastFailureAtMs = 0;
      lastFailureHttpStatus = null;
      lastError = '';
    }
    nextRequestAllowBurst = detail.allowBurst === true;
    stopped = false;
    schedule(detail.immediate === true ? 0 : (lastSnapshotAtMs ? null : 1000));
  }

  function stop() {
    lifecycleGeneration += 1;
    stopped = true;
    nextRequestAllowBurst = false;
    if (timer) clearTimer(timer);
    timer = null;
    nextAttemptAtMs = 0;
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
        currentGlobalIntervalMs: currentGlobalIntervalMs(),
        lastSnapshotAtMs,
        lastGlobalSnapshotAtMs,
        lastAttemptAtMs,
        nextAttemptAtMs,
        nextAttemptAt: nextAttemptAtMs > 0 ? new Date(nextAttemptAtMs).toISOString() : '',
        lastCompletedAtMs,
        lastSuccessAtMs,
        lastFailureAtMs,
        lastFailureHttpStatus,
        lastError,
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
