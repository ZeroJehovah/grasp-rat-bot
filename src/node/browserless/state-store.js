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

function optionalNumericOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  return numericOrNull(value);
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

const COIN_DROP_ARRAY_FIELDS = ['coin_drops', 'coinDrops', 'drops', 'coins'];

function hasCoinDropArrayField(frame) {
  return Boolean(frame && typeof frame === 'object'
    && COIN_DROP_ARRAY_FIELDS.some(field => Array.isArray(frame[field])));
}

function coinDropArraysFromFrame(frame) {
  if (!frame || typeof frame !== 'object') return [];
  const arrays = [];
  for (const field of COIN_DROP_ARRAY_FIELDS) {
    const value = frame[field];
    if (Array.isArray(value)) arrays.push(...value);
  }
  return arrays;
}

function normalizeEntity(entity, meta) {
  if (!entity || typeof entity !== 'object') return null;
  return {
    ...entity,
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
    ...bullet,
    authority: meta.authority,
    source: meta.source,
    tick: meta.tick,
    receivedAtMs: meta.receivedAtMs
  };
}

function bulletKey(bullet) {
  const id = bullet?.bullet_id ?? bullet?.bulletId ?? bullet?.id;
  if (id !== null && id !== undefined && id !== '') return `bullet:${id}`;
  const owner = bullet?.owner_user_id ?? bullet?.ownerId ?? bullet?.owner_id ?? '';
  const created = bullet?.created_tick ?? bullet?.createdTick ?? '';
  const startX = bullet?.start_x ?? bullet?.startX ?? '';
  const startY = bullet?.start_y ?? bullet?.startY ?? '';
  return owner !== '' || created !== '' ? `trajectory:${owner}:${created}:${startX}:${startY}` : '';
}

function bulletDirectionAndSpeed(bullet) {
  let dx = numericOrNull(bullet?.dir_x ?? bullet?.direction?.dx);
  let dy = numericOrNull(bullet?.dir_y ?? bullet?.direction?.dy);
  const microsX = numericOrNull(bullet?.dir_x_micros);
  const microsY = numericOrNull(bullet?.dir_y_micros);
  if (dx === null && microsX !== null) dx = microsX / 1000000;
  if (dy === null && microsY !== null) dy = microsY / 1000000;
  if (dx === null || dy === null) {
    const startX = numericOrNull(bullet?.start_x ?? bullet?.startX);
    const startY = numericOrNull(bullet?.start_y ?? bullet?.startY);
    const targetX = numericOrNull(bullet?.target_x ?? bullet?.targetX);
    const targetY = numericOrNull(bullet?.target_y ?? bullet?.targetY);
    if ([startX, startY, targetX, targetY].every(value => value !== null)) {
      const length = Math.hypot(targetX - startX, targetY - startY);
      if (length > 0) {
        dx = (targetX - startX) / length;
        dy = (targetY - startY) / length;
      }
    }
  }
  return {
    dx,
    dy,
    speed: Math.max(1, numericOrNull(bullet?.speed_per_tick ?? bullet?.speedPerTick ?? bullet?.speed) ?? 500)
  };
}

function bulletTrajectorySummary(history) {
  const observations = Array.isArray(history?.observations) ? history.observations : [];
  const residuals = [];
  let largestGapTicks = 1;
  for (let index = 1; index < observations.length; index += 1) {
    const previous = observations[index - 1];
    const current = observations[index];
    const tickGap = Math.max(1, Number(current.tick) - Number(previous.tick));
    largestGapTicks = Math.max(largestGapTicks, tickGap);
    if ([previous.x, previous.y, current.x, current.y, current.dx, current.dy, current.speed].every(Number.isFinite)) {
      const predictedX = Number(previous.x) + Number(current.dx) * Number(current.speed) * tickGap;
      const predictedY = Number(previous.y) + Number(current.dy) * Number(current.speed) * tickGap;
      residuals.push(Math.hypot(Number(current.x) - predictedX, Number(current.y) - predictedY));
    }
  }
  const residualCm = residuals.length ? Math.max(...residuals.slice(-4)) : 0;
  const insufficientObservation = observations.length < 3;
  const uncertaintyCm = Math.min(260, Math.max(
    residualCm,
    insufficientObservation ? 180 : 0,
    Math.max(0, largestGapTicks - 1) * 50
  ));
  return {
    trajectoryObservationCount: observations.length,
    trajectoryResidualCm: Math.round(residualCm),
    trajectoryUncertaintyCm: Math.round(uncertaintyCm),
    trajectoryFrameGapTicks: largestGapTicks,
    trajectoryConfidence: insufficientObservation ? 'insufficient-observation' : 'bounded-history'
  };
}

function normalizeCoinDrop(drop, meta) {
  if (!drop || typeof drop !== 'object') return null;
  return {
    ...drop,
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

const DEFAULT_MOVEMENT_MEDIAN_TICKS = 2;
const DEFAULT_MOVEMENT_P90_TICKS = 5;
const MOVEMENT_TIMING_EXACT_MIN_SAMPLES = 4;

function movementTimingSummary(samples = [], transitions = []) {
  const boundedTransitions = (transitions || []).slice(-64);
  const exactTickValues = samples
    .filter(item => item?.attributionConfidence === 'exact' || item?.attributionConfidence === undefined)
    .map(item => item.tickDelayUpper ?? item.executionDelayTicks)
    .filter(value => value !== null && value !== undefined && value !== '')
    .map(Number)
    .filter(Number.isFinite)
    .slice(-64);
  const exactWallValues = samples
    .filter(item => item?.attributionConfidence === 'exact' || item?.attributionConfidence === undefined)
    .map(item => item.wallDelayMsUpper ?? item.executionDelayMs)
    .filter(value => value !== null && value !== undefined && value !== '')
    .map(Number)
    .filter(Number.isFinite)
    .slice(-64);
  const conservativeTickValues = boundedTransitions
    .filter(item => item?.attributionConfidence === 'bounded')
    .map(item => item.tickDelayUpper)
    .filter(value => value !== null && value !== undefined && value !== '')
    .map(Number)
    .filter(Number.isFinite);
  const conservativeWallValues = boundedTransitions
    .filter(item => item?.attributionConfidence === 'bounded')
    .map(item => item.wallDelayMsUpper)
    .filter(value => value !== null && value !== undefined && value !== '')
    .map(Number)
    .filter(Number.isFinite);
  const exactMedian = percentile(exactTickValues, 0.5);
  const exactDeviations = exactMedian === null
    ? []
    : exactTickValues.map(value => Math.abs(value - exactMedian));
  const exactReady = exactTickValues.length >= MOVEMENT_TIMING_EXACT_MIN_SAMPLES;
  const conservativeMedian = percentile(conservativeTickValues, 0.5);
  const conservativeP90 = percentile(conservativeTickValues, 0.9);
  const medianTicks = exactReady
    ? (exactMedian ?? DEFAULT_MOVEMENT_MEDIAN_TICKS)
    : Math.max(DEFAULT_MOVEMENT_MEDIAN_TICKS, exactMedian ?? 0, conservativeMedian ?? 0);
  const p90Ticks = exactReady
    ? (percentile(exactTickValues, 0.9) ?? DEFAULT_MOVEMENT_P90_TICKS)
    : Math.max(DEFAULT_MOVEMENT_P90_TICKS, percentile(exactTickValues, 0.9) ?? 0, conservativeP90 ?? 0);
  const attributionCounts = {
    exact: 0,
    bounded: 0,
    'ambiguous-reversal': 0,
    unmatched: 0
  };
  for (const transition of boundedTransitions) {
    const confidence = String(transition?.attributionConfidence || 'unmatched');
    if (Object.prototype.hasOwnProperty.call(attributionCounts, confidence)) attributionCounts[confidence] += 1;
  }
  return {
    sampleCount: exactTickValues.length,
    exactSampleCount: exactTickValues.length,
    boundedSampleCount: attributionCounts.bounded,
    ambiguousSampleCount: attributionCounts['ambiguous-reversal'],
    unmatchedSampleCount: attributionCounts.unmatched,
    medianTicks,
    p90Ticks,
    madTicks: percentile(exactDeviations, 0.5) ?? 0,
    medianWallMs: exactReady
      ? percentile(exactWallValues, 0.5)
      : (exactWallValues.length || conservativeWallValues.length
          ? Math.max(0, percentile(exactWallValues, 0.5) ?? 0, percentile(conservativeWallValues, 0.5) ?? 0)
          : null),
    p90WallMs: exactReady
      ? percentile(exactWallValues, 0.9)
      : (exactWallValues.length || conservativeWallValues.length
          ? Math.max(0, percentile(exactWallValues, 0.9) ?? 0, percentile(conservativeWallValues, 0.9) ?? 0)
          : null),
    exactReady,
    attributionCounts,
    source: exactReady
      ? 'visible-velocity-transition-exact-rolling'
      : (conservativeTickValues.length || exactTickValues.length
          ? 'visible-velocity-transition-bounded-upper-conservative'
          : 'startup-default')
  };
}

function velocityDirection(entity) {
  const vx = Number(entity?.vx || 0);
  const vy = Number(entity?.vy || 0);
  return {
    dx: Math.abs(vx) < 0.001 ? 0 : Math.sign(vx),
    dy: Math.abs(vy) < 0.001 ? 0 : Math.sign(vy),
    vx: Number.isFinite(vx) ? vx : 0,
    vy: Number.isFinite(vy) ? vy : 0
  };
}

function velocityDirectionKey(direction = {}) {
  return `${Math.sign(Number(direction.dx || 0))},${Math.sign(Number(direction.dy || 0))}`;
}

function commandCausallyPrecedesTransition(command, transitionAtMs, transitionTick) {
  const requestedAtMs = optionalNumericOrNull(command?.requestedAtMs);
  const observedAtMs = optionalNumericOrNull(transitionAtMs);
  if (requestedAtMs !== null && observedAtMs !== null && requestedAtMs > observedAtMs) return false;
  const observedTick = optionalNumericOrNull(command?.observedTick);
  return transitionTick === null || observedTick === null || observedTick <= transitionTick;
}

function movementDelayBounds(candidates = [], transitionAtMs, transitionTick) {
  const wallValues = candidates
    .map(command => optionalNumericOrNull(command?.requestedAtMs))
    .filter(value => value !== null && transitionAtMs !== null)
    .map(value => Math.max(0, transitionAtMs - value));
  const tickValues = candidates
    .map(command => optionalNumericOrNull(command?.observedTick))
    .filter(value => value !== null && transitionTick !== null)
    .map(value => Math.max(0, transitionTick - value));
  return {
    wallDelayMsLower: wallValues.length ? Math.min(...wallValues) : null,
    wallDelayMsUpper: wallValues.length ? Math.max(...wallValues) : null,
    tickDelayLower: tickValues.length ? Math.min(...tickValues) : null,
    tickDelayUpper: tickValues.length ? Math.max(...tickValues) : null
  };
}

function attributeVelocityTransition(commands = [], observedDirection = {}, meta = {}) {
  const transitionAtMs = optionalNumericOrNull(meta.receivedAtMs ?? meta.at);
  const transitionTick = optionalNumericOrNull(meta.tick);
  const observedKey = velocityDirectionKey(observedDirection);
  const causal = (commands || [])
    .filter(command => commandCausallyPrecedesTransition(command, transitionAtMs, transitionTick))
    .slice()
    .sort((left, right) => Number(left.sequence || 0) - Number(right.sequence || 0));
  const candidates = causal.filter(command => velocityDirectionKey(command) === observedKey);
  const earliestCandidateSequence = candidates.length
    ? Math.min(...candidates.map(command => Number(command.sequence || 0)))
    : null;
  const latestCandidateSequence = candidates.length
    ? Math.max(...candidates.map(command => Number(command.sequence || 0)))
    : null;
  const interveningDirections = earliestCandidateSequence === null || latestCandidateSequence === null
    ? []
    : causal.filter(command => Number(command.sequence || 0) > earliestCandidateSequence
      && Number(command.sequence || 0) < latestCandidateSequence
      && velocityDirectionKey(command) !== observedKey);
  const latestCandidate = candidates.at(-1) || null;
  const laterDifferentDirections = latestCandidate
    ? causal.filter(command => Number(command.sequence || 0) > Number(latestCandidate.sequence || 0)
      && velocityDirectionKey(command) !== observedKey)
    : [];
  const replacedByDifferentDirection = candidates.filter(command => (
    command?.replacedByCommandId !== null
      && command?.replacedByCommandId !== undefined
      && velocityDirectionKey(command?.replacedByDirection || {}) !== observedKey
  ));
  const ambiguousReversal = Boolean(
    interveningDirections.length
      || (candidates.length > 0 && laterDifferentDirections.length > 0)
      || replacedByDifferentDirection.length
  );
  let attributionConfidence = 'unmatched';
  if (candidates.length === 1 && !ambiguousReversal) attributionConfidence = 'exact';
  else if (candidates.length > 0 && ambiguousReversal) attributionConfidence = 'ambiguous-reversal';
  else if (candidates.length > 1) attributionConfidence = 'bounded';
  const bounds = movementDelayBounds(candidates, transitionAtMs, transitionTick);
  const firstCandidate = candidates[0] || null;
  const orderedReplacementCount = candidates.length
    ? causal.filter(command => Number(command.sequence || 0) > Number(firstCandidate.sequence || 0)
      && Number(command.sequence || 0) <= Number(latestCandidate.sequence || 0)).length
    : 0;
  const replacementCount = Math.max(orderedReplacementCount, replacedByDifferentDirection.length);
  const observedTickAgeAtSendMsValues = candidates
    .map(command => optionalNumericOrNull(command?.observedTickAgeAtSendMs))
    .filter(value => value !== null);
  return {
    attributionConfidence,
    candidateCommandCount: candidates.length,
    candidateCommandIds: candidates.map(command => command.commandId).filter(value => value !== null && value !== undefined).slice(-8),
    commandId: attributionConfidence === 'exact' ? latestCandidate?.commandId ?? null : null,
    repeatOwnerCommandId: attributionConfidence === 'exact' ? latestCandidate?.repeatOwnerCommandId ?? null : null,
    requestedAtMs: attributionConfidence === 'exact' ? latestCandidate?.requestedAtMs ?? null : null,
    observedTick: attributionConfidence === 'exact' ? latestCandidate?.observedTick ?? null : null,
    directionGeneration: candidates.length
      ? (latestCandidate?.directionGeneration ?? firstCandidate?.directionGeneration ?? null)
      : null,
    replacementCount,
    replacementsBeforeVisible: replacementCount,
    observedTickAgeAtSendMs: observedTickAgeAtSendMsValues.length
      ? Math.max(...observedTickAgeAtSendMsValues)
      : null,
    latestCandidateSequence,
    earliestCandidateSequence,
    causalCommandCount: causal.length,
    ...bounds
  };
}

function shotOriginSummary(samples = []) {
  const values = (samples || []).map(Number).filter(Number.isFinite).slice(-64);
  const median = percentile(values, 0.5);
  const deviations = median === null ? [] : values.map(value => Math.abs(value - median));
  return {
    sampleCount: values.length,
    medianCm: median,
    p90Cm: percentile(values, 0.9),
    madCm: percentile(deviations, 0.5)
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
      entitiesByUserId: {},
      bullets: [],
      bulletTrajectories: {},
      coinDrops: [],
      coinDropsObserved: false
    },
    snapshot: {
      authority: 'snapshot',
      source: 'snapshot',
      tick: null,
      receivedAtMs: 0,
      self: null,
      entities: [],
      entitiesByKey: {},
      entitiesByUserId: {},
      bullets: [],
      coinDrops: [],
      coinDropsObserved: false,
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
      originErrorSamples: [],
      ackLatencySamples: [],
      movement: {
        nextSequence: 1,
        nextDirectionGeneration: 1,
        pendingCommands: [],
        settledCommands: [],
        delaySamples: [],
        actualTransitions: [],
        lastObservedVelocity: null,
        lastRequestedDirection: null
      }
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
    const coinDropsObserved = hasCoinDropArrayField(frame);
    const normalizedEntities = entities
      .map(entity => normalizeEntity(entity, { ...meta, authority: 'realtime', source: 'pos' }))
      .filter(Boolean);
    const entitiesByKey = {};
    const entitiesByUserId = {};
    for (const entity of normalizedEntities) {
      const key = entityKey(entity);
      if (key) entitiesByKey[key] = entity;
      const userId = entity?.user_id ?? entity?.userId;
      if (userId !== null && userId !== undefined && userId !== '') entitiesByUserId[String(userId)] = entity;
    }
    state.realtime.tick = meta.tick;
    state.realtime.receivedAtMs = meta.receivedAtMs;
    state.realtime.entities = normalizedEntities;
    state.realtime.entitiesByKey = entitiesByKey;
    state.realtime.entitiesByUserId = entitiesByUserId;
    const trajectoryTtlMs = 2000;
    for (const [key, history] of Object.entries(state.realtime.bulletTrajectories)) {
      if (meta.receivedAtMs - Number(history.lastSeenAtMs || 0) > trajectoryTtlMs) delete state.realtime.bulletTrajectories[key];
    }
    for (const bullet of bullets) {
      const key = bulletKey(bullet);
      if (!key) continue;
      const current = state.realtime.bulletTrajectories[key] || { observations: [] };
      const x = numericOrNull(bullet.x ?? bullet.current_x ?? bullet.currentX);
      const y = numericOrNull(bullet.y ?? bullet.current_y ?? bullet.currentY);
      const direction = bulletDirectionAndSpeed(bullet);
      if (x !== null && y !== null && meta.tick !== null) {
        current.observations = current.observations.concat([{
          tick: meta.tick,
          atMs: meta.receivedAtMs,
          x,
          y,
          ...direction
        }]).slice(-5);
      }
      current.lastSeenAtMs = meta.receivedAtMs;
      state.realtime.bulletTrajectories[key] = current;
    }
    const retainedTrajectoryKeys = Object.entries(state.realtime.bulletTrajectories)
      .sort((a, b) => Number(b[1].lastSeenAtMs || 0) - Number(a[1].lastSeenAtMs || 0))
      .slice(0, 32)
      .map(([key]) => key);
    const retainedTrajectoryKeySet = new Set(retainedTrajectoryKeys);
    for (const key of Object.keys(state.realtime.bulletTrajectories)) {
      if (!retainedTrajectoryKeySet.has(key)) delete state.realtime.bulletTrajectories[key];
    }
    state.realtime.bullets = bullets
      .map(bullet => {
        const normalized = normalizeBullet(bullet, { ...meta, authority: 'realtime', source: 'pos' });
        const history = state.realtime.bulletTrajectories[bulletKey(bullet)];
        return normalized && history ? { ...normalized, ...bulletTrajectorySummary(history) } : normalized;
      })
      .filter(Boolean);
    state.realtime.coinDrops = coinDrops
      .map(drop => normalizeCoinDrop(drop, { ...meta, authority: 'realtime', source: 'pos' }))
      .filter(Boolean);
    state.realtime.coinDropsObserved = coinDropsObserved;
    state.realtime.self = normalizedEntities.find(entity => Number(entity.user_id) === Number(state.userId)) || null;
    if (state.realtime.self) state.realtime.lastSelf = cloneJson(state.realtime.self);
    observeVelocityTransition(state.realtime.self, meta);
  }

  function observeVelocityTransition(self, meta = {}) {
    if (!self) return null;
    const movement = state.command.movement;
    const observed = velocityDirection(self);
    const previous = movement.lastObservedVelocity;
    const changed = !previous || Number(previous.dx) !== observed.dx || Number(previous.dy) !== observed.dy;
    const tick = optionalNumericOrNull(meta.tick);
    if (changed && previous) {
      const attribution = attributeVelocityTransition(movement.pendingCommands, observed, {
        receivedAtMs: meta.receivedAtMs,
        tick
      });
      const exact = attribution.attributionConfidence === 'exact';
      const transition = {
        at: meta.receivedAtMs,
        tick,
        from: { dx: previous.dx, dy: previous.dy, vx: previous.vx, vy: previous.vy },
        to: observed,
        ...attribution,
        executionDelayTicks: exact ? attribution.tickDelayUpper : null,
        executionDelayMs: exact ? attribution.wallDelayMsUpper : null,
        velocitySendToVisibleWallMs: exact ? attribution.wallDelayMsUpper : null,
        visibleTransitionTickDelay: exact ? attribution.tickDelayUpper : null,
        matched: attribution.candidateCommandCount > 0
      };
      movement.actualTransitions.push(transition);
      movement.actualTransitions = movement.actualTransitions.slice(-64);
      const causalFrontier = attribution.attributionConfidence === 'ambiguous-reversal'
        ? null
        : attribution.latestCandidateSequence;
      if (causalFrontier !== null && causalFrontier !== undefined) {
        // A visible transition settles only commands of the observed direction.
        // Keep older, different-direction commands in the bounded schedule: they
        // were already sent and can still affect a piecewise Dodge projection.
        const candidateSequences = new Set(
          movement.pendingCommands
            .filter(command => Number(command.sequence || 0) <= Number(causalFrontier)
              && velocityDirectionKey(command) === velocityDirectionKey(observed))
            .map(command => Number(command.sequence || 0))
        );
        const settled = movement.pendingCommands.filter(command => candidateSequences.has(Number(command.sequence || 0)));
        const retained = movement.pendingCommands.filter(command => !candidateSequences.has(Number(command.sequence || 0)));
        for (const command of settled) {
          movement.settledCommands.push({
            ...command,
            settledAtMs: meta.receivedAtMs,
            settledTick: tick,
            attributionConfidence: transition.attributionConfidence,
            executionDelayTicks: exact && String(command.commandId) === String(transition.commandId)
              ? transition.executionDelayTicks
              : null
          });
        }
        movement.settledCommands = movement.settledCommands.slice(-64);
        movement.pendingCommands = retained;
      }
      if (exact && transition.executionDelayTicks !== null) {
        movement.delaySamples.push({
          at: meta.receivedAtMs,
          attributionConfidence: 'exact',
          executionDelayTicks: transition.executionDelayTicks,
          tickDelayUpper: transition.tickDelayUpper,
          wallDelayMsUpper: transition.wallDelayMsUpper
        });
        movement.delaySamples = movement.delaySamples.slice(-64);
      }
    }
    if (!changed) {
      const observedKey = velocityDirectionKey(observed);
      const settled = [];
      const retained = [];
      for (const command of movement.pendingCommands) {
        if (velocityDirectionKey(command) === observedKey) settled.push(command);
        else retained.push(command);
      }
      if (settled.length) {
        for (const command of settled) {
          movement.settledCommands.push({
            ...command,
            settledAtMs: meta.receivedAtMs,
            settledTick: tick,
            attributionConfidence: 'same-direction-visible-no-transition',
            executionDelayTicks: null
          });
        }
        movement.settledCommands = movement.settledCommands.slice(-64);
        movement.pendingCommands = retained;
      }
    }
    const timing = movementTimingSummary(movement.delaySamples, movement.actualTransitions);
    const observedAtMs = optionalNumericOrNull(meta.receivedAtMs);
    const maximumPendingAgeMs = Math.max(3000, Number(timing.p90Ticks || DEFAULT_MOVEMENT_P90_TICKS) * 50 * 8);
    movement.pendingCommands = movement.pendingCommands
      .filter(command => {
        const requestedAtMs = optionalNumericOrNull(command.requestedAtMs);
        return observedAtMs === null || requestedAtMs === null || observedAtMs - requestedAtMs <= maximumPendingAgeMs;
      })
      .slice(-32);
    movement.lastObservedVelocity = { ...observed, tick, at: meta.receivedAtMs };
    return movement.actualTransitions.at(-1) || null;
  }

  function ingestSnapshotFrame(frame, meta) {
    const entities = Array.isArray(frame.entities) ? frame.entities : [];
    const bullets = Array.isArray(frame.bullets) ? frame.bullets : [];
    const coinDrops = coinDropArraysFromFrame(frame);
    const coinDropsObserved = hasCoinDropArrayField(frame);
    const normalizedEntities = entities
      .map(entity => normalizeEntity(entity, { ...meta, authority: 'snapshot', source: 'snapshot' }))
      .filter(Boolean);
    const entitiesByKey = {};
    const entitiesByUserId = {};
    for (const entity of normalizedEntities) {
      const key = entityKey(entity);
      if (key) entitiesByKey[key] = entity;
      const userId = entity?.user_id ?? entity?.userId;
      if (userId !== null && userId !== undefined && userId !== '') entitiesByUserId[String(userId)] = entity;
    }
    state.snapshot.tick = meta.tick;
    state.snapshot.receivedAtMs = meta.receivedAtMs;
    state.snapshot.entities = normalizedEntities;
    state.snapshot.entitiesByKey = entitiesByKey;
    state.snapshot.entitiesByUserId = entitiesByUserId;
    state.snapshot.bullets = bullets
      .map(bullet => normalizeBullet(bullet, { ...meta, authority: 'snapshot', source: 'snapshot' }))
      .filter(Boolean);
    state.snapshot.coinDrops = coinDrops
      .map(drop => normalizeCoinDrop(drop, { ...meta, authority: 'snapshot', source: 'snapshot' }))
      .filter(Boolean);
    state.snapshot.coinDropsObserved = coinDropsObserved;
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
      const predictedShooterX = numericOrNull(confirmed.predictedShooterX);
      const predictedShooterY = numericOrNull(confirmed.predictedShooterY);
      const ackShooterX = numericOrNull(ack.start_x);
      const ackShooterY = numericOrNull(ack.start_y);
      confirmed.predictedShooterOrigin = predictedShooterX === null || predictedShooterY === null
        ? null
        : { x: predictedShooterX, y: predictedShooterY };
      confirmed.ackShooterOrigin = ackShooterX === null || ackShooterY === null
        ? null
        : { x: ackShooterX, y: ackShooterY };
      confirmed.shooterOriginErrorCm = confirmed.predictedShooterOrigin && confirmed.ackShooterOrigin
        ? Math.hypot(predictedShooterX - ackShooterX, predictedShooterY - ackShooterY)
        : null;
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
      if (Number.isFinite(confirmed.shooterOriginErrorCm)) {
        state.command.originErrorSamples.push(confirmed.shooterOriginErrorCm);
        state.command.originErrorSamples = state.command.originErrorSamples.slice(-64);
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
      flightTicks: numericOrNull(request.flightTicks),
      routeContextKey: String(request.routeContextKey || ''),
      routeCandidate: String(request.routeCandidate || ''),
      routeProbability: numericOrNull(request.routeProbability),
      predictedDirectionState: String(request.predictedDirectionState || ''),
      aimConfidence: numericOrNull(request.aimConfidence),
      expectedHitProbability: numericOrNull(request.expectedHitProbability),
      predictedShooterX: numericOrNull(request.predictedShooterX),
      predictedShooterY: numericOrNull(request.predictedShooterY),
      predictedTargetAtCreationX: numericOrNull(request.predictedTargetAtCreationX),
      predictedTargetAtCreationY: numericOrNull(request.predictedTargetAtCreationY),
      coverageMode: String(request.coverageMode || ''),
      coverageSessionId: String(request.coverageSessionId || ''),
      coverageSlot: numericOrNull(request.coverageSlot),
      coverageSelectedTrajectory: String(request.coverageSelectedTrajectory || ''),
      coverageVariant: String(request.coverageVariant || ''),
      coverageMassBefore: numericOrNull(request.coverageMassBefore),
      coverageMassAfter: numericOrNull(request.coverageMassAfter),
      marginalCoverage: numericOrNull(request.marginalCoverage),
      hardMarginalCoverage: numericOrNull(request.hardMarginalCoverage),
      coverageAimX: numericOrNull(request.coverageAimX),
      coverageAimY: numericOrNull(request.coverageAimY)
    };
    state.command.requestedShots += 1;
    state.command.pendingShots.push(shot);
    state.command.pendingShots = state.command.pendingShots.slice(-16);
    return cloneJson(shot);
  }

  function recordVelocityRequest(request = {}) {
    const movement = state.command.movement;
    const requestedAtMs = Number(request.requestedAtMs || now());
    const sequence = movement.nextSequence++;
    const commandId = request.commandId ?? sequence;
    const repeatOwnerCommandId = request.repeatOwnerCommandId ?? commandId;
    const dx = Math.max(-1, Math.min(1, Math.round(Number(request.dx || 0))));
    const dy = Math.max(-1, Math.min(1, Math.round(Number(request.dy || 0))));
    if (request.repeat === true) {
      const owner = [
        ...movement.pendingCommands,
        ...movement.settledCommands
      ].find(command => String(command.commandId) === String(repeatOwnerCommandId));
      if (owner) {
        owner.lastRepeatedAtMs = requestedAtMs;
        owner.repeatCount = Math.max(0, Number(owner.repeatCount || 0)) + 1;
        owner.lastRepeatObservedTickAgeMs = optionalNumericOrNull(request.observedTickAgeAtSendMs);
        owner.lastRepeatFrameReceivedAtMs = optionalNumericOrNull(request.frameReceivedAtMs ?? request.observedAtMs);
        return cloneJson(owner);
      }
    }
    const direction = { dx, dy };
    const previousDirection = movement.lastRequestedDirection;
    const directionChanged = !previousDirection || velocityDirectionKey(previousDirection) !== velocityDirectionKey(direction);
    const directionGeneration = directionChanged
      ? movement.nextDirectionGeneration++
      : Number(previousDirection.directionGeneration || Math.max(1, movement.nextDirectionGeneration - 1));
    for (const pending of movement.pendingCommands) {
      if (!pending.replacedByCommandId) {
        pending.replacedByCommandId = commandId;
        pending.replacedAtMs = requestedAtMs;
        pending.replacedByDirection = { dx, dy };
      }
    }
    const timing = movementTimingSummary(movement.delaySamples, movement.actualTransitions);
    const observedTick = optionalNumericOrNull(request.observedTick ?? state.realtime.tick);
    const observedAtMs = optionalNumericOrNull(request.observedAtMs ?? request.frameReceivedAtMs ?? state.realtime.receivedAtMs);
    const observedTickAgeAtSendMs = optionalNumericOrNull(request.observedTickAgeAtSendMs)
      ?? (observedAtMs === null ? null : Math.max(0, requestedAtMs - observedAtMs));
    const command = {
      sequence,
      commandId,
      repeatOwnerCommandId,
      dx,
      dy,
      generation: optionalNumericOrNull(request.generation),
      directionGeneration,
      reason: String(request.reason || ''),
      requestedAtMs,
      observedTick,
      observedAtMs,
      observedTickAgeAtSendMs,
      frameReceivedToDecisionMs: optionalNumericOrNull(request.frameReceivedToDecisionMs),
      decisionToVelocitySendMs: optionalNumericOrNull(request.decisionToVelocitySendMs),
      velocitySendObservedTickAgeMs: observedTickAgeAtSendMs,
      pendingDepthAtSend: movement.pendingCommands.length,
      ownership: request.ownership && typeof request.ownership === 'object'
        ? cloneJson(request.ownership)
        : null,
      expectedEffectiveTick: observedTick === null ? null : observedTick + Number(timing.p90Ticks || 5),
      repeat: false,
      repeatCount: 0,
      lastRepeatedAtMs: null,
      lastRepeatObservedTickAgeMs: null,
      lastRepeatFrameReceivedAtMs: null,
      replacedByCommandId: null,
      replacedAtMs: null,
      replacedByDirection: null
    };
    movement.pendingCommands.push(command);
    movement.pendingCommands = movement.pendingCommands.slice(-32);
    movement.lastRequestedDirection = { dx, dy, directionGeneration };
    return cloneJson(command);
  }

  function movementCommandState(options = {}) {
    const movement = state.command.movement;
    const timing = movementTimingSummary(movement.delaySamples, movement.actualTransitions);
    const currentTick = optionalNumericOrNull(state.realtime.tick);
    const clone = options.clone !== false;
    const copy = value => clone ? cloneJson(value) : value;
    const copyCommand = command => {
      if (!command) return null;
      const output = { ...command };
      if (command.ownership && typeof command.ownership === 'object') output.ownership = { ...command.ownership };
      return clone ? cloneJson(output) : output;
    };
    return {
      timing,
      observedVelocity: copy(movement.lastObservedVelocity),
      pendingVelocityCommands: movement.pendingCommands.slice(-8).map(command => ({
        ...copyCommand(command),
        effectiveAfterTicks: currentTick === null || command.expectedEffectiveTick === null
          ? Number(timing.p90Ticks || 5)
          : Math.max(0, Number(command.expectedEffectiveTick) - currentTick)
      })),
      actualVelocityTransitions: copy(movement.actualTransitions.slice(-16)),
      settledCommands: copy(movement.settledCommands.slice(-8)),
      lastRequestedDirection: copy(movement.lastRequestedDirection)
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
      lastSelf: cloneJson(state.realtime.lastSelf),
      entities: cloneJson(state.realtime.entities),
      entitiesByUserId: cloneJson(state.realtime.entitiesByUserId),
      bullets: cloneJson(state.realtime.bullets),
      coinDrops: cloneJson(state.realtime.coinDrops),
      coinDropsObserved: Boolean(state.realtime.coinDropsObserved)
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
      entitiesByUserId: cloneJson(state.snapshot.entitiesByUserId),
      bullets: cloneJson(state.snapshot.bullets),
      coinDrops: cloneJson(state.snapshot.coinDrops),
      coinDropsObserved: Boolean(state.snapshot.coinDropsObserved),
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
        shooterOrigin: shotOriginSummary(state.command.originErrorSamples),
        pendingShots: cloneJson(state.command.pendingShots.slice(-8)),
        confirmedShots: cloneJson(state.command.confirmedShots.slice(-16))
      },
      movement: movementCommandState({ clone: true })
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

  function getDecisionState(nowMs = now()) {
    expirePendingShots(nowMs);
    const timing = shotTimingSummary(state.command.delaySamples);
    const ackTimeoutMs = shotAckTimeoutMs(state.command.ackLatencySamples);
    return {
      userId: state.userId,
      latestFrameAtMs: state.latestFrameAtMs,
      latestFrameType: state.latestFrameType,
      frameCounts: state.frameCounts,
      frameAges: getFrameAges(nowMs),
      realtime: {
        authority: 'realtime',
        source: 'pos',
        tick: state.realtime.tick,
        receivedAtMs: state.realtime.receivedAtMs,
        frameAgeMs: frameAge(nowMs, state.realtime.receivedAtMs),
        self: state.realtime.self,
        lastSelf: state.realtime.lastSelf,
        entities: state.realtime.entities,
        entitiesByUserId: state.realtime.entitiesByUserId,
        bullets: state.realtime.bullets,
        coinDrops: state.realtime.coinDrops,
        coinDropsObserved: Boolean(state.realtime.coinDropsObserved)
      },
      fallback: {
        authority: 'snapshot',
        source: 'snapshot',
        tick: state.snapshot.tick,
        receivedAtMs: state.snapshot.receivedAtMs,
        frameAgeMs: frameAge(nowMs, state.snapshot.receivedAtMs),
        self: state.snapshot.self,
        entities: state.snapshot.entities,
        entitiesByUserId: state.snapshot.entitiesByUserId,
        bullets: state.snapshot.bullets,
        coinDrops: state.snapshot.coinDrops,
        coinDropsObserved: Boolean(state.snapshot.coinDropsObserved),
        messages: state.snapshot.messages,
        counts: state.snapshot.counts
      },
      command: {
        lastAck: state.command.lastAck,
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
          shooterOrigin: shotOriginSummary(state.command.originErrorSamples),
          pendingShots: state.command.pendingShots.slice(-8),
          confirmedShots: state.command.confirmedShots.slice(-16)
        },
        movement: movementCommandState({ clone: false })
      },
      transportDiagnostics: state.transportDiagnostics
    };
  }

  return {
    getCommandState,
    getDecisionState,
    getFallbackState,
    getFrameAges,
    getRealtimeState,
    getState,
    ingestDecodedFrame: ingestFrame,
    ingestFrame,
    recordShootRequest,
    recordVelocityRequest,
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
  selectRealtimeCombatState,
  attributeVelocityTransition,
  commandCausallyPrecedesTransition,
  movementDelayBounds,
  movementTimingSummary,
  velocityDirectionKey
};
