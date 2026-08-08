'use strict';

const DEFAULT_MAP_TRAIL_MAX_AGE_MS = 30000;
const DEFAULT_MAP_TRAIL_MAX_SAMPLES = 720;
const DEFAULT_MAP_TRAIL_STATUS_SAMPLES = 180;
const DEFAULT_MAP_TRAIL_MAX_PLAYERS = 64;
const DEFAULT_MAP_TRAIL_VISIBLE_RANGE = 50000;

function numericOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function entityUserId(entity) {
  const value = numericOrNull(entity?.user_id ?? entity?.userId);
  return value === null ? null : value;
}

function entityId(entity) {
  const value = entity?.entity_id ?? entity?.entityId ?? entity?.id;
  return value === null || value === undefined || value === '' ? null : String(value);
}

function mapTrailKey(entity, self = false) {
  if (!entity || typeof entity !== 'object') return '';
  const userId = entityUserId(entity);
  if (userId !== null) return `${self ? 'self' : 'player'}:${String(userId)}`;
  const id = entityId(entity);
  if (id === null) return '';
  return `${self ? 'self' : 'player'}:${id}`;
}

function entityName(entity) {
  return String(entity?.name || entity?.username || entity?.display_name || '').slice(0, 96);
}

function compactTrailSamples(samples, limit) {
  const source = Array.isArray(samples) ? samples : [];
  const maximum = Math.max(2, Math.round(Number(limit) || DEFAULT_MAP_TRAIL_STATUS_SAMPLES));
  if (source.length <= maximum) return source.map(sample => sample.slice());
  const output = [];
  const lastIndex = source.length - 1;
  for (let index = 0; index < maximum; index += 1) {
    const sourceIndex = Math.round(index * lastIndex / (maximum - 1));
    const sample = source[sourceIndex];
    if (!sample) continue;
    if (output.length && output.at(-1)[2] === sample[2]) continue;
    output.push(sample.slice());
  }
  return output;
}

function createMapTrailTracker(options = {}) {
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const maxAgeMs = Math.max(1000, Math.round(Number(options.maxAgeMs) || DEFAULT_MAP_TRAIL_MAX_AGE_MS));
  const maxSamples = Math.max(2, Math.round(Number(options.maxSamples) || DEFAULT_MAP_TRAIL_MAX_SAMPLES));
  const statusSamples = Math.max(2, Math.round(Number(options.statusSamples) || DEFAULT_MAP_TRAIL_STATUS_SAMPLES));
  const maxPlayers = Math.max(1, Math.round(Number(options.maxPlayers) || DEFAULT_MAP_TRAIL_MAX_PLAYERS));
  const visibleRange = Math.max(
    0,
    Number(options.visibleRange ?? DEFAULT_MAP_TRAIL_VISIBLE_RANGE) || 0
  );
  const includeSelf = options.includeSelf !== false;
  const histories = new Map();
  let latestObservedAtMs = 0;
  let latestTick = null;

  function pruneExpired(atMs) {
    const cutoff = Number(atMs) - maxAgeMs;
    for (const [key, history] of histories.entries()) {
      if (Number(history?.lastSeenAtMs || 0) < cutoff) histories.delete(key);
      else if (Array.isArray(history?.samples)) {
        history.samples = history.samples.filter(sample => {
          const sampleAtMs = Number(sample?.[2]);
          return Number.isFinite(sampleAtMs) && sampleAtMs >= cutoff && sampleAtMs <= Number(atMs);
        });
      }
    }
  }

  function appendObservation(entity, key, atMs, tick) {
    const x = numericOrNull(entity?.x);
    const y = numericOrNull(entity?.y);
    if (!key || x === null || y === null) return false;
    let history = histories.get(key);
    if (!history) {
      history = {
        key,
        name: entityName(entity),
        samples: [],
        lastSeenAtMs: 0,
        lastTick: null
      };
      histories.set(key, history);
    }
    const previous = history.samples.at(-1);
    const previousAtMs = Number(previous?.[2] || 0);
    if ((!previous || atMs >= previousAtMs)
      && (!previous || Number(previous[0]) !== x || Number(previous[1]) !== y)) {
      const normalizedTick = numericOrNull(tick);
      history.samples.push(normalizedTick === null ? [x, y, atMs] : [x, y, atMs, normalizedTick]);
      if (history.samples.length > maxSamples) {
        history.samples.splice(0, history.samples.length - maxSamples);
      }
    }
    if (entityName(entity)) history.name = entityName(entity);
    history.lastSeenAtMs = Math.max(Number(history.lastSeenAtMs || 0), atMs);
    history.lastTick = numericOrNull(tick);
    return true;
  }

  function retainNewestPlayers() {
    const entries = [...histories.values()]
      .filter(history => !String(history.key).startsWith('self:'))
      .sort((left, right) => Number(right.lastSeenAtMs || 0) - Number(left.lastSeenAtMs || 0));
    for (const history of entries.slice(maxPlayers)) histories.delete(history.key);
  }

  function observeRealtime(entities, self, observedAtMs = now(), tick = null) {
    const atMs = numericOrNull(observedAtMs);
    if (atMs === null) return { ok: false, reason: 'invalid-observed-at' };
    const sourceEntities = Array.isArray(entities) ? entities : [];
    const selfX = numericOrNull(self?.x);
    const selfY = numericOrNull(self?.y);
    if (selfX === null || selfY === null) {
      clear();
      return { ok: false, reason: 'missing-realtime-self' };
    }
    latestObservedAtMs = Math.max(latestObservedAtMs, atMs);
    latestTick = numericOrNull(tick);
    pruneExpired(atMs);
    const observedKeys = new Set();
    const candidates = includeSelf && self ? [self, ...sourceEntities] : sourceEntities;
    const seenKeys = new Set();
    for (const entity of candidates) {
      if (!entity || typeof entity !== 'object') continue;
      const userId = entityUserId(entity);
      const selfUserId = entityUserId(self);
      const selfEntityId = entityId(self);
      const selfEntity = (userId !== null && selfUserId !== null && userId === selfUserId)
        || (userId === null && selfUserId === null && entityId(entity) !== null && entityId(entity) === selfEntityId)
        || entity === self;
      const x = numericOrNull(entity.x);
      const y = numericOrNull(entity.y);
      if (x === null || y === null) continue;
      const distance = Math.hypot(x - selfX, y - selfY);
      if (!selfEntity && visibleRange > 0 && distance > visibleRange) continue;
      const key = mapTrailKey(entity, selfEntity);
      if (!key || seenKeys.has(key)) continue;
      seenKeys.add(key);
      observedKeys.add(key);
      appendObservation(entity, key, atMs, tick);
    }
    for (const key of histories.keys()) {
      if (!observedKeys.has(key)) histories.delete(key);
    }
    retainNewestPlayers();
    return {
      ok: true,
      observedAtMs: atMs,
      tick: numericOrNull(tick),
      visibleCount: Math.max(0, observedKeys.size - (includeSelf && observedKeys.has(mapTrailKey(self, true)) ? 1 : 0)),
      trailCount: histories.size
    };
  }

  function status(atMs = now()) {
    const observedAtMs = numericOrNull(atMs) ?? Date.now();
    pruneExpired(observedAtMs);
    if (!latestObservedAtMs && !histories.size) return null;
    const items = [...histories.values()]
      .sort((left, right) => Number(right.lastSeenAtMs || 0) - Number(left.lastSeenAtMs || 0))
      .map(history => ({
        k: history.key,
        n: history.name || '',
        s: compactTrailSamples(history.samples, statusSamples),
        at: history.lastSeenAtMs,
        tick: history.lastTick
      }))
      .filter(item => item.s.length > 0);
    return {
      version: 1,
      authority: 'realtime',
      source: 'pos',
      visibleRange,
      maxAgeMs,
      observedAt: latestObservedAtMs ? new Date(latestObservedAtMs).toISOString() : '',
      ageMs: latestObservedAtMs ? Math.max(0, observedAtMs - latestObservedAtMs) : null,
      tick: latestTick,
      items
    };
  }

  function clear() {
    histories.clear();
    latestObservedAtMs = 0;
    latestTick = null;
  }

  return {
    observeRealtime,
    status,
    clear,
    size: () => histories.size
  };
}

function runMapTrailTrackerSelfTest() {
  const startAtMs = Date.parse('2026-08-08T01:00:00.000Z');
  const tracker = createMapTrailTracker({
    visibleRange: 5000,
    statusSamples: 32,
    now: () => startAtMs
  });
  const self = { user_id: 7, entity_id: 1, name: 'self', x: 0, y: 0 };
  const inside = { user_id: 8, entity_id: 2, name: 'inside', x: 1000, y: 0 };
  const outside = { user_id: 9, entity_id: 3, name: 'outside', x: 6000, y: 0 };
  tracker.observeRealtime([self, inside, outside], self, startAtMs, 100);
  tracker.observeRealtime([
    { ...self, x: 100, y: 0 },
    { ...inside, x: 1200, y: 20 },
    outside
  ], { ...self, x: 100, y: 0 }, startAtMs + 50, 101);
  const initial = tracker.status(startAtMs + 50);
  tracker.observeRealtime([
    { ...self, x: 200, y: 0 },
    { ...outside, x: 7000, y: 0 }
  ], { ...self, x: 200, y: 0 }, startAtMs + 100, 102);
  const afterLeave = tracker.status(startAtMs + 100);
  tracker.observeRealtime([
    { ...self, x: 300, y: 0 },
    { ...inside, x: 900, y: 40 }
  ], { ...self, x: 300, y: 0 }, startAtMs + 150, 103);
  const reappeared = tracker.status(startAtMs + 150);
  const initialPlayer = initial?.items?.find(item => item.k === 'player:8') || null;
  const reappearedPlayer = reappeared?.items?.find(item => item.k === 'player:8') || null;
  return {
    ok: initial?.authority === 'realtime'
      && initial?.source === 'pos'
      && initialPlayer?.s?.length === 2
      && !initial.items.some(item => item.k === 'player:9')
      && !afterLeave.items.some(item => item.k === 'player:8')
      && reappearedPlayer?.s?.length === 1
      && reappearedPlayer.s[0][0] === 900,
    initialItems: initial?.items?.map(item => [item.k, item.s.length]) || [],
    afterLeaveItems: afterLeave?.items?.map(item => item.k) || [],
    reappearedItems: reappeared?.items?.map(item => [item.k, item.s.length]) || []
  };
}

module.exports = {
  DEFAULT_MAP_TRAIL_MAX_AGE_MS,
  DEFAULT_MAP_TRAIL_MAX_PLAYERS,
  DEFAULT_MAP_TRAIL_MAX_SAMPLES,
  DEFAULT_MAP_TRAIL_STATUS_SAMPLES,
  DEFAULT_MAP_TRAIL_VISIBLE_RANGE,
  createMapTrailTracker,
  runMapTrailTrackerSelfTest
};
