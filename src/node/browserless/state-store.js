'use strict';

const { summarizeGrzShotAck } = require('../../shared/grz-frame');

function cloneJson(value) {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

function entityKey(entity) {
  if (entity?.entity_id !== undefined && entity?.entity_id !== null) return `entity:${entity.entity_id}`;
  if (entity?.user_id !== undefined && entity?.user_id !== null) return `user:${entity.user_id}`;
  if (entity?.id !== undefined && entity?.id !== null) return `id:${entity.id}`;
  return '';
}

function numericOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeEntity(entity, meta) {
  if (!entity || typeof entity !== 'object') return null;
  return {
    ...cloneJson(entity),
    x: numericOrNull(entity.x),
    y: numericOrNull(entity.y),
    vx: numericOrNull(entity.vx),
    vy: numericOrNull(entity.vy),
    hp: numericOrNull(entity.hp),
    max_hp: numericOrNull(entity.max_hp),
    authority: meta.authority,
    source: meta.source,
    tick: meta.tick,
    receivedAtMs: meta.receivedAtMs
  };
}

function normalizeBullet(bullet, meta) {
  if (!bullet || typeof bullet !== 'object') return null;
  return {
    ...cloneJson(bullet),
    authority: meta.authority,
    source: meta.source,
    tick: meta.tick,
    receivedAtMs: meta.receivedAtMs
  };
}

function normalizeCoinDrop(drop, meta) {
  if (!drop || typeof drop !== 'object') return null;
  return {
    ...cloneJson(drop),
    x: numericOrNull(drop.x),
    y: numericOrNull(drop.y),
    amount: numericOrNull(drop.amount),
    authority: meta.authority,
    source: meta.source,
    tick: meta.tick,
    receivedAtMs: meta.receivedAtMs
  };
}

function frameAge(nowMs, atMs) {
  const now = Number(nowMs);
  const at = Number(atMs);
  if (!Number.isFinite(now) || !Number.isFinite(at) || at <= 0) return null;
  return Math.max(0, now - at);
}

function createInitialState(userId = 0) {
  return {
    userId: Number(userId || 0),
    frameCounts: {},
    latestFrameAtMs: 0,
    latestFrameType: '',
    realtime: {
      authority: 'realtime',
      source: 'pos',
      tick: null,
      receivedAtMs: 0,
      self: null,
      entities: [],
      entitiesByKey: {},
      bullets: []
    },
    snapshot: {
      authority: 'snapshot',
      source: 'snapshot',
      tick: null,
      receivedAtMs: 0,
      self: null,
      entities: [],
      entitiesByKey: {},
      bullets: [],
      coinDrops: [],
      messages: [],
      counts: {
        totalEntities: null,
        inGame: null,
        visible: null,
        occupiedCells: null
      }
    },
    command: {
      lastAck: null
    }
  };
}

function createBrowserlessStateStore(options = {}) {
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const state = createInitialState(options.userId);

  function setUserId(userId) {
    state.userId = Number(userId || 0);
  }

  function reset(nextOptions = {}) {
    const next = createInitialState(nextOptions.userId ?? state.userId);
    for (const key of Object.keys(state)) delete state[key];
    Object.assign(state, next);
  }

  function ingestFrame(frame, meta = {}) {
    if (!frame || typeof frame !== 'object') {
      return { ok: false, reason: 'non-object-frame' };
    }
    const receivedAtMs = Number(meta.receivedAtMs || now());
    const type = typeof frame.type === 'string' ? frame.type : '';
    const tick = Number.isFinite(Number(frame.tick)) ? Number(frame.tick) : null;
    state.latestFrameAtMs = receivedAtMs;
    state.latestFrameType = type || 'unknown';
    state.frameCounts[state.latestFrameType] = Number(state.frameCounts[state.latestFrameType] || 0) + 1;
    if (type === 'pos') ingestRealtimeFrame(frame, { receivedAtMs, tick });
    else if (type === 'snapshot') ingestSnapshotFrame(frame, { receivedAtMs, tick });
    else if (type === 'shoot_ok') ingestShootOk(frame, { receivedAtMs, tick });
    return { ok: true, type: state.latestFrameType, tick };
  }

  function ingestRealtimeFrame(frame, meta) {
    const entities = Array.isArray(frame.entities) ? frame.entities : [];
    const bullets = Array.isArray(frame.bullets) ? frame.bullets : [];
    const normalizedEntities = entities
      .map(entity => normalizeEntity(entity, { ...meta, authority: 'realtime', source: 'pos' }))
      .filter(Boolean);
    const entitiesByKey = {};
    for (const entity of normalizedEntities) {
      const key = entityKey(entity);
      if (key) entitiesByKey[key] = entity;
    }
    state.realtime.tick = meta.tick;
    state.realtime.receivedAtMs = meta.receivedAtMs;
    state.realtime.entities = normalizedEntities;
    state.realtime.entitiesByKey = entitiesByKey;
    state.realtime.bullets = bullets
      .map(bullet => normalizeBullet(bullet, { ...meta, authority: 'realtime', source: 'pos' }))
      .filter(Boolean);
    state.realtime.self = normalizedEntities.find(entity => Number(entity.user_id) === Number(state.userId)) || null;
  }

  function ingestSnapshotFrame(frame, meta) {
    const entities = Array.isArray(frame.entities) ? frame.entities : [];
    const bullets = Array.isArray(frame.bullets) ? frame.bullets : [];
    const coinDrops = Array.isArray(frame.coin_drops) ? frame.coin_drops : [];
    const normalizedEntities = entities
      .map(entity => normalizeEntity(entity, { ...meta, authority: 'snapshot', source: 'snapshot' }))
      .filter(Boolean);
    const entitiesByKey = {};
    for (const entity of normalizedEntities) {
      const key = entityKey(entity);
      if (key) entitiesByKey[key] = entity;
    }
    state.snapshot.tick = meta.tick;
    state.snapshot.receivedAtMs = meta.receivedAtMs;
    state.snapshot.entities = normalizedEntities;
    state.snapshot.entitiesByKey = entitiesByKey;
    state.snapshot.bullets = bullets
      .map(bullet => normalizeBullet(bullet, { ...meta, authority: 'snapshot', source: 'snapshot' }))
      .filter(Boolean);
    state.snapshot.coinDrops = coinDrops
      .map(drop => normalizeCoinDrop(drop, { ...meta, authority: 'snapshot', source: 'snapshot' }))
      .filter(Boolean);
    state.snapshot.messages = Array.isArray(frame.messages) ? cloneJson(frame.messages) : [];
    state.snapshot.counts = {
      totalEntities: frame.total_entities ?? null,
      inGame: frame.in_game ?? null,
      visible: frame.visible ?? null,
      occupiedCells: frame.occupied_cells ?? null
    };
    state.snapshot.self = normalizedEntities.find(entity => Number(entity.user_id) === Number(state.userId)) || null;
  }

  function ingestShootOk(frame, meta) {
    state.command.lastAck = {
      ...summarizeGrzShotAck(frame),
      authority: 'realtime',
      source: 'shoot_ok',
      tick: meta.tick,
      receivedAtMs: meta.receivedAtMs
    };
  }

  function getFrameAges(nowMs = now()) {
    return {
      latestFrameAgeMs: frameAge(nowMs, state.latestFrameAtMs),
      realtimeAgeMs: frameAge(nowMs, state.realtime.receivedAtMs),
      snapshotAgeMs: frameAge(nowMs, state.snapshot.receivedAtMs),
      commandAckAgeMs: frameAge(nowMs, state.command.lastAck?.receivedAtMs)
    };
  }

  function getRealtimeState(nowMs = now()) {
    return {
      authority: 'realtime',
      source: 'pos',
      tick: state.realtime.tick,
      receivedAtMs: state.realtime.receivedAtMs,
      frameAgeMs: frameAge(nowMs, state.realtime.receivedAtMs),
      self: cloneJson(state.realtime.self),
      entities: cloneJson(state.realtime.entities),
      bullets: cloneJson(state.realtime.bullets)
    };
  }

  function getFallbackState(nowMs = now()) {
    return {
      authority: 'snapshot',
      source: 'snapshot',
      tick: state.snapshot.tick,
      receivedAtMs: state.snapshot.receivedAtMs,
      frameAgeMs: frameAge(nowMs, state.snapshot.receivedAtMs),
      self: cloneJson(state.snapshot.self),
      entities: cloneJson(state.snapshot.entities),
      bullets: cloneJson(state.snapshot.bullets),
      coinDrops: cloneJson(state.snapshot.coinDrops),
      messages: cloneJson(state.snapshot.messages),
      counts: cloneJson(state.snapshot.counts)
    };
  }

  function getCommandState(nowMs = now()) {
    return {
      lastAck: cloneJson(state.command.lastAck),
      ackAgeMs: frameAge(nowMs, state.command.lastAck?.receivedAtMs)
    };
  }

  function getState(nowMs = now()) {
    return {
      userId: state.userId,
      latestFrameAtMs: state.latestFrameAtMs,
      latestFrameType: state.latestFrameType,
      frameCounts: cloneJson(state.frameCounts),
      frameAges: getFrameAges(nowMs),
      realtime: getRealtimeState(nowMs),
      fallback: getFallbackState(nowMs),
      command: getCommandState(nowMs)
    };
  }

  return {
    getCommandState,
    getFallbackState,
    getFrameAges,
    getRealtimeState,
    getState,
    ingestDecodedFrame: ingestFrame,
    ingestFrame,
    reset,
    setUserId
  };
}

function selectRealtimeCombatState(store, nowMs) {
  const current = store.getRealtimeState(nowMs);
  return {
    authority: 'realtime',
    source: 'pos',
    tick: current.tick,
    frameAgeMs: current.frameAgeMs,
    self: current.self,
    entities: current.entities,
    bullets: current.bullets
  };
}

module.exports = {
  createBrowserlessStateStore,
  entityKey,
  selectRealtimeCombatState
};
