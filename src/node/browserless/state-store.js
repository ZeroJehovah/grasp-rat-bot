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

function incrementCount(map, key) {
  const normalized = String(key || 'unknown');
  map[normalized] = Number(map[normalized] || 0) + 1;
}

function frameKeySet(frame) {
  if (!frame || typeof frame !== 'object') return '';
  return Object.keys(frame).sort().join(',');
}

function topLevelCoinLikeFields(frame) {
  if (!frame || typeof frame !== 'object') return [];
  return Object.keys(frame)
    .filter(key => /coin|drop|loot/i.test(String(key)))
    .sort();
}

function coinDropArraysFromFrame(frame) {
  if (!frame || typeof frame !== 'object') return [];
  const fields = ['coin_drops', 'coinDrops', 'drops', 'coins'];
  const arrays = [];
  for (const field of fields) {
    const value = frame[field];
    if (Array.isArray(value)) arrays.push(...value);
  }
  return arrays;
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

function percentile(values, ratio) {
  const sorted = (values || []).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

function shotTimingSummary(samples = []) {
  const values = samples.map(item => Number(item.executionDelayTicks)).filter(Number.isFinite).slice(-64);
  const median = percentile(values, 0.5);
  const deviations = median === null ? [] : values.map(value => Math.abs(value - median));
  return {
    sampleCount: values.length,
    medianTicks: median === null ? 5 : median,
    p90Ticks: percentile(values, 0.9) ?? 5,
    madTicks: percentile(deviations, 0.5) ?? 0,
    source: values.length ? 'confirmed-shoot-rolling' : 'startup-default'
  };
}

function shotAckTimeoutMs(samples = []) {
  const values = samples.map(Number).filter(Number.isFinite).slice(-64);
  const p90 = percentile(values, 0.9);
  return Math.max(1000, Math.min(5000, Math.round((p90 ?? 1000) * 3)));
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
      lastSelf: null,
      entities: [],
      entitiesByKey: {},
      bullets: [],
      coinDrops: []
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
      lastAck: null,
      nextShotSequence: 1,
      requestedShots: 0,
      acceptedShots: 0,
      unackedShots: 0,
      pendingShots: [],
      confirmedShots: [],
      delaySamples: [],
      ackLatencySamples: []
    },
    transportDiagnostics: {
      frameKeySetCounts: {},
      frameTypeKeySetCounts: {},
      coinLikeFieldCounts: {},
      realtimeCoinLikeFieldCounts: {},
      snapshotCoinLikeFieldCounts: {},
      realtimeCoinDropFrames: 0,
      snapshotCoinDropFrames: 0,
      lastRealtimeCoinLikeFields: [],
      lastSnapshotCoinLikeFields: []
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
    recordTransportDiagnostics(frame, state.latestFrameType);
    if (type === 'pos') ingestRealtimeFrame(frame, { receivedAtMs, tick });
    else if (type === 'snapshot') ingestSnapshotFrame(frame, { receivedAtMs, tick });
    else if (type === 'shoot_ok') ingestShootOk(frame, { receivedAtMs, tick });
    return { ok: true, type: state.latestFrameType, tick };
  }

  function recordTransportDiagnostics(frame, type) {
    const keySet = frameKeySet(frame);
    if (keySet) {
      incrementCount(state.transportDiagnostics.frameKeySetCounts, keySet);
      incrementCount(state.transportDiagnostics.frameTypeKeySetCounts, `${type || 'unknown'}|${keySet}`);
    }
    const coinLikeFields = topLevelCoinLikeFields(frame);
    for (const field of coinLikeFields) incrementCount(state.transportDiagnostics.coinLikeFieldCounts, field);
    if (type === 'pos') {
      for (const field of coinLikeFields) incrementCount(state.transportDiagnostics.realtimeCoinLikeFieldCounts, field);
      state.transportDiagnostics.lastRealtimeCoinLikeFields = coinLikeFields;
      if (coinDropArraysFromFrame(frame).length) state.transportDiagnostics.realtimeCoinDropFrames += 1;
    } else if (type === 'snapshot') {
      for (const field of coinLikeFields) incrementCount(state.transportDiagnostics.snapshotCoinLikeFieldCounts, field);
      state.transportDiagnostics.lastSnapshotCoinLikeFields = coinLikeFields;
      if (coinDropArraysFromFrame(frame).length) state.transportDiagnostics.snapshotCoinDropFrames += 1;
    }
  }

  function ingestRealtimeFrame(frame, meta) {
    const entities = Array.isArray(frame.entities) ? frame.entities : [];
    const bullets = Array.isArray(frame.bullets) ? frame.bullets : [];
    const coinDrops = coinDropArraysFromFrame(frame);
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
    state.realtime.coinDrops = coinDrops
      .map(drop => normalizeCoinDrop(drop, { ...meta, authority: 'realtime', source: 'pos' }))
      .filter(Boolean);
    state.realtime.self = normalizedEntities.find(entity => Number(entity.user_id) === Number(state.userId)) || null;
    if (state.realtime.self) state.realtime.lastSelf = cloneJson(state.realtime.self);
  }

  function ingestSnapshotFrame(frame, meta) {
    const entities = Array.isArray(frame.entities) ? frame.entities : [];
    const bullets = Array.isArray(frame.bullets) ? frame.bullets : [];
    const coinDrops = coinDropArraysFromFrame(frame);
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
    const ack = {
      ...summarizeGrzShotAck(frame),
      authority: 'realtime',
      source: 'shoot_ok',
      tick: meta.tick,
      receivedAtMs: meta.receivedAtMs
    };
    expirePendingShots(meta.receivedAtMs);
    const targetX = numericOrNull(ack.target_x);
    const targetY = numericOrNull(ack.target_y);
    const pending = state.command.pendingShots
      .map((item, index) => ({ item, index, distance: targetX === null || targetY === null
        ? index
        : Math.hypot(Number(item.targetX) - targetX, Number(item.targetY) - targetY) }))
      .sort((a, b) => a.distance - b.distance || a.index - b.index)[0] || null;
    let confirmed = null;
    if (pending) {
      state.command.pendingShots.splice(pending.index, 1);
      const observedTick = numericOrNull(pending.item.observedTick);
      const createdTick = numericOrNull(ack.created_tick);
      confirmed = {
        ...pending.item,
        ...ack,
        acceptedAtMs: meta.receivedAtMs,
        requestToAckMs: Math.max(0, meta.receivedAtMs - Number(pending.item.requestedAtMs || 0)),
        observedTick,
        createdTick,
        executionDelayTicks: observedTick !== null && createdTick !== null ? createdTick - observedTick : null
      };
      state.command.acceptedShots += 1;
      state.command.ackLatencySamples.push(confirmed.requestToAckMs);
      state.command.ackLatencySamples = state.command.ackLatencySamples.slice(-64);
      state.command.confirmedShots.push(confirmed);
      state.command.confirmedShots = state.command.confirmedShots.slice(-64);
      if (Number.isFinite(confirmed.executionDelayTicks) && confirmed.executionDelayTicks >= 0) {
        state.command.delaySamples.push({
          at: meta.receivedAtMs,
          executionDelayTicks: confirmed.executionDelayTicks
        });
        state.command.delaySamples = state.command.delaySamples.slice(-64);
      }
    }
    state.command.lastAck = { ...ack, matchedShot: confirmed };
  }

  function expirePendingShots(atMs = now()) {
    const timeoutMs = shotAckTimeoutMs(state.command.ackLatencySamples);
    const retained = [];
    for (const shot of state.command.pendingShots) {
      if (Number(atMs) - Number(shot.requestedAtMs || 0) > timeoutMs) state.command.unackedShots += 1;
      else retained.push(shot);
    }
    state.command.pendingShots = retained;
  }

  function recordShootRequest(request = {}) {
    const requestedAtMs = Number(request.requestedAtMs || now());
    expirePendingShots(requestedAtMs);
    const shot = {
      sequence: state.command.nextShotSequence++,
      commandId: request.commandId ?? null,
      requestedAtMs,
      targetId: request.targetId ?? null,
      targetX: numericOrNull(request.targetX),
      targetY: numericOrNull(request.targetY),
      startX: numericOrNull(request.startX),
      startY: numericOrNull(request.startY),
      observedTick: numericOrNull(request.observedTick),
      aimMode: String(request.aimMode || ''),
      hypothesis: String(request.hypothesis || ''),
      flightTicks: numericOrNull(request.flightTicks)
    };
    state.command.requestedShots += 1;
    state.command.pendingShots.push(shot);
    state.command.pendingShots = state.command.pendingShots.slice(-16);
    return cloneJson(shot);
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
      lastSelf: cloneJson(state.realtime.lastSelf),
      entities: cloneJson(state.realtime.entities),
      bullets: cloneJson(state.realtime.bullets),
      coinDrops: cloneJson(state.realtime.coinDrops)
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
    expirePendingShots(nowMs);
    const timing = shotTimingSummary(state.command.delaySamples);
    const ackTimeoutMs = shotAckTimeoutMs(state.command.ackLatencySamples);
    return {
      lastAck: cloneJson(state.command.lastAck),
      ackAgeMs: frameAge(nowMs, state.command.lastAck?.receivedAtMs),
      shooting: {
        requestedShots: state.command.requestedShots,
        acceptedShots: state.command.acceptedShots,
        unackedShots: state.command.unackedShots,
        pendingCount: state.command.pendingShots.length,
        acceptanceRate: state.command.requestedShots > 0
          ? state.command.acceptedShots / state.command.requestedShots
          : null,
        ackTimeoutMs,
        timing,
        pendingShots: cloneJson(state.command.pendingShots.slice(-8)),
        confirmedShots: cloneJson(state.command.confirmedShots.slice(-16))
      }
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
      command: getCommandState(nowMs),
      transportDiagnostics: cloneJson(state.transportDiagnostics)
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
    recordShootRequest,
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
  coinDropArraysFromFrame,
  entityKey,
  frameKeySet,
  selectRealtimeCombatState
};
