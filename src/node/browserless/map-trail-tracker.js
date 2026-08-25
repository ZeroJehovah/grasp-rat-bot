'use strict';

const DEFAULT_MAP_TRAIL_MAX_AGE_MS = 30000;
const DEFAULT_MAP_TRAIL_MAX_SAMPLES = 720;
const DEFAULT_MAP_TRAIL_STATUS_SAMPLES = 180;
const DEFAULT_MAP_TRAIL_STATUS_BUCKET_MS = 250;
const DEFAULT_MAP_TRAIL_LIVE_TAIL_SAMPLES = 40;
const DEFAULT_MAP_TRAIL_UNOBSERVED_GRACE_MS = 2000;
const DEFAULT_MAP_TRAIL_MAX_PLAYERS = 160;
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

function entityMoving(entity) {
  const vx = numericOrNull(entity?.vx);
  const vy = numericOrNull(entity?.vy);
  return vx !== null && vy !== null && Math.hypot(vx, vy) > 0.001;
}

function compareTrailPriority(left, right) {
  return Number(Boolean(right?.moving)) - Number(Boolean(left?.moving))
    || Number((right?.samples?.length || 0) > 1) - Number((left?.samples?.length || 0) > 1)
    || Number(right?.lastSeenAtMs || 0) - Number(left?.lastSeenAtMs || 0)
    || String(left?.key || '').localeCompare(String(right?.key || ''));
}

// 导出给面板的采样集合必须在两次状态构建之间保持稳定。等距下标抽稀做不到: 缓冲区每收到一帧
// 就整体位移一格, 抽稀命中的下标随之漂移, 同一批采样点会被反复换掉, 面板按 at 认出的老点忽隐忽现,
// 于是轨迹在刷新时被重画而不是整体平移。这里改成"冻结前缀 + 原始尾巴":
// 老采样按绝对时间桶只保留每桶第一个采样, 桶边界只由 at 决定, 一个点一旦被导出就会一直被导出
// 直到自然过期(保留集合是嵌套的); 最新的若干个采样原样导出, 保证轨迹头部精度。
function compactTrailSamples(samples, limit, bucketMs, liveTailSamples) {
  const source = Array.isArray(samples) ? samples : [];
  const maximum = Math.max(2, Math.round(Number(limit) || DEFAULT_MAP_TRAIL_STATUS_SAMPLES));
  if (source.length <= maximum) return source.map(sample => sample.slice());
  const bucket = Math.max(1, Math.round(Number(bucketMs) || DEFAULT_MAP_TRAIL_STATUS_BUCKET_MS));
  const tailCount = Math.max(1, Math.min(
    Math.round(Number(liveTailSamples) || DEFAULT_MAP_TRAIL_LIVE_TAIL_SAMPLES),
    Math.floor(maximum / 2)
  ));
  const tailStart = Math.max(0, source.length - tailCount);
  const output = [];
  const pushSample = sample => {
    if (output.length && output.at(-1)[2] === sample[2]) return;
    output.push(sample.slice());
  };
  let lastBucket = null;
  for (let index = 0; index < tailStart; index += 1) {
    const sample = source[index];
    const at = Number(sample?.[2]);
    if (!Number.isFinite(at)) continue;
    const sampleBucket = Math.floor(at / bucket);
    if (sampleBucket === lastBucket) continue;
    lastBucket = sampleBucket;
    pushSample(sample);
  }
  for (let index = tailStart; index < source.length; index += 1) {
    const sample = source[index];
    if (!Number.isFinite(Number(sample?.[2]))) continue;
    pushSample(sample);
  }
  // 超出预算时只从最老的一端截断, 保留集合仍然是嵌套的。
  return output.length > maximum ? output.slice(output.length - maximum) : output;
}

function createMapTrailTracker(options = {}) {
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const maxAgeMs = Math.max(1000, Math.round(Number(options.maxAgeMs) || DEFAULT_MAP_TRAIL_MAX_AGE_MS));
  const maxSamples = Math.max(2, Math.round(Number(options.maxSamples) || DEFAULT_MAP_TRAIL_MAX_SAMPLES));
  const statusSamples = Math.max(2, Math.round(Number(options.statusSamples) || DEFAULT_MAP_TRAIL_STATUS_SAMPLES));
  const statusBucketMs = Math.max(
    1,
    Math.round(Number(options.statusBucketMs) || DEFAULT_MAP_TRAIL_STATUS_BUCKET_MS)
  );
  const liveTailSamples = Math.max(
    1,
    Math.round(Number(options.liveTailSamples) || DEFAULT_MAP_TRAIL_LIVE_TAIL_SAMPLES)
  );
  const unobservedGraceMs = Math.max(0, Math.round(
    Number(options.unobservedGraceMs ?? DEFAULT_MAP_TRAIL_UNOBSERVED_GRACE_MS) || 0
  ));
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
        moving: false,
        lastSeenAtMs: 0,
        lastTick: null
      };
      histories.set(key, history);
    }
    const previous = history.samples.at(-1);
    const previousAtMs = Number(previous?.[2] || 0);
    const positionChanged = Boolean(previous
      && (Number(previous[0]) !== x || Number(previous[1]) !== y));
    if ((!previous || atMs >= previousAtMs) && (!previous || positionChanged)) {
      const normalizedTick = numericOrNull(tick);
      history.samples.push(normalizedTick === null ? [x, y, atMs] : [x, y, atMs, normalizedTick]);
      if (history.samples.length > maxSamples) {
        history.samples.splice(0, history.samples.length - maxSamples);
      }
    }
    if (entityName(entity)) history.name = entityName(entity);
    history.moving = entityMoving(entity) || positionChanged;
    history.lastSeenAtMs = Math.max(Number(history.lastSeenAtMs || 0), atMs);
    history.lastTick = numericOrNull(tick);
    return true;
  }

  function retainNewestPlayers() {
    const entries = [...histories.values()]
      .filter(history => !String(history.key).startsWith('self:'))
      .sort(compareTrailPriority);
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
    // 单帧缺席不再立即清空历史: 视野边界上的玩家会在相邻 pos 帧之间反复进出,
    // 立即删除会让轨迹整条消失再从一个点重新长出来, 看起来就是一次重画。
    // 缺席超过宽限期才真正丢弃, 面板本来就只画有当前标记的身份, 不会出现孤立轨迹。
    for (const [key, history] of histories.entries()) {
      if (observedKeys.has(key)) continue;
      if (atMs - Number(history?.lastSeenAtMs || 0) > unobservedGraceMs) histories.delete(key);
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
      .sort(compareTrailPriority)
      .map(history => ({
        k: history.key,
        n: history.name || '',
        s: compactTrailSamples(history.samples, statusSamples, statusBucketMs, liveTailSamples),
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
  tracker.observeRealtime(
    [{ ...self, x: 400, y: 0 }],
    { ...self, x: 400, y: 0 },
    startAtMs + 2400,
    104
  );
  const afterGrace = tracker.status(startAtMs + 2400);
  const stableTracker = createMapTrailTracker({
    visibleRange: 50000,
    statusSamples: 180,
    includeSelf: false,
    now: () => startAtMs
  });
  const stableSelf = { user_id: 11, entity_id: 11, name: 'stable-self', x: 0, y: 0 };
  let stableObserved = 0;
  const observeStable = count => {
    for (let index = 0; index < count; index += 1) {
      stableObserved += 1;
      stableTracker.observeRealtime(
        [{ user_id: 12, entity_id: 12, name: 'stable', x: 1000 + stableObserved * 7, y: stableObserved * 3 }],
        stableSelf,
        startAtMs + stableObserved * 50,
        200 + stableObserved
      );
    }
    return startAtMs + stableObserved * 50;
  };
  const stableFirst = stableTracker.status(observeStable(400));
  const stableSecond = stableTracker.status(observeStable(60));
  const stableFirstSamples = stableFirst?.items?.find(item => item.k === 'player:12')?.s || [];
  const stableSecondSamples = stableSecond?.items?.find(item => item.k === 'player:12')?.s || [];
  const stableSecondAtSet = new Set(stableSecondSamples.map(sample => sample[2]));
  // 已经冻结的前缀(上一次导出里除最新原始尾巴以外的部分)必须整段留在下一次导出中,
  // 只有自然过期或预算截断能从最老一端移除采样。
  const stableFrozen = stableFirstSamples
    .slice(0, -DEFAULT_MAP_TRAIL_LIVE_TAIL_SAMPLES)
    .filter(sample => sample[2] >= (stableSecondSamples[0]?.[2] ?? 0));
  const stableDropped = stableFrozen.filter(sample => !stableSecondAtSet.has(sample[2]));
  const crowdedTracker = createMapTrailTracker({
    visibleRange: 5000,
    maxPlayers: 64,
    now: () => startAtMs
  });
  const crowdedSelf = { user_id: 70, entity_id: 70, name: 'crowded-self', x: 0, y: 0 };
  const crowdedPlayers = Array.from({ length: 80 }, (_, index) => ({
    user_id: 1000 + index,
    entity_id: 1000 + index,
    name: `crowded-${index}`,
    x: 1000 + (index % 10) * 100,
    y: Math.floor(index / 10) * 100,
    vx: index === 79 ? 50 : 0,
    vy: 0
  }));
  crowdedTracker.observeRealtime(
    [crowdedSelf, ...crowdedPlayers],
    crowdedSelf,
    startAtMs,
    200
  );
  crowdedTracker.observeRealtime(
    [crowdedSelf, ...crowdedPlayers.map((player, index) => (
      index === 79 ? { ...player, x: player.x + 50 } : player
    ))],
    crowdedSelf,
    startAtMs + 50,
    201
  );
  const crowded = crowdedTracker.status(startAtMs + 50);
  const initialPlayer = initial?.items?.find(item => item.k === 'player:8') || null;
  const afterLeavePlayer = afterLeave?.items?.find(item => item.k === 'player:8') || null;
  const reappearedPlayer = reappeared?.items?.find(item => item.k === 'player:8') || null;
  const crowdedMovingPlayer = crowded?.items?.find(item => item.k === 'player:1079') || null;
  return {
    ok: initial?.authority === 'realtime'
      && initial?.source === 'pos'
      && initialPlayer?.s?.length === 2
      && !initial.items.some(item => item.k === 'player:9')
      && afterLeavePlayer?.s?.length === 2
      && reappearedPlayer?.s?.length === 3
      && reappearedPlayer.s.at(-1)[0] === 900
      && !afterGrace.items.some(item => item.k === 'player:8')
      && stableFrozen.length > 0
      && stableDropped.length === 0
      && stableSecondSamples.length > 0
      && stableSecondSamples.length <= 180
      && crowdedMovingPlayer?.s?.length === 2
      && crowded.items.length === 65,
    initialItems: initial?.items?.map(item => [item.k, item.s.length]) || [],
    afterLeaveItems: afterLeave?.items?.map(item => [item.k, item.s.length]) || [],
    reappearedItems: reappeared?.items?.map(item => [item.k, item.s.length]) || [],
    afterGraceItems: afterGrace?.items?.map(item => item.k) || [],
    stableExport: {
      firstCount: stableFirstSamples.length,
      secondCount: stableSecondSamples.length,
      frozenCount: stableFrozen.length,
      droppedCount: stableDropped.length
    },
    crowded: {
      itemCount: crowded?.items?.length || 0,
      movingPlayer: crowdedMovingPlayer ? [crowdedMovingPlayer.k, crowdedMovingPlayer.s.length] : null
    }
  };
}

module.exports = {
  DEFAULT_MAP_TRAIL_LIVE_TAIL_SAMPLES,
  DEFAULT_MAP_TRAIL_MAX_AGE_MS,
  DEFAULT_MAP_TRAIL_MAX_PLAYERS,
  DEFAULT_MAP_TRAIL_MAX_SAMPLES,
  DEFAULT_MAP_TRAIL_STATUS_BUCKET_MS,
  DEFAULT_MAP_TRAIL_STATUS_SAMPLES,
  DEFAULT_MAP_TRAIL_UNOBSERVED_GRACE_MS,
  DEFAULT_MAP_TRAIL_VISIBLE_RANGE,
  createMapTrailTracker,
  runMapTrailTrackerSelfTest
};
