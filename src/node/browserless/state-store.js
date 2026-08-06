'use strict';

const { summarizeGrzShotAck } = require('../../shared/grz-frame');

const EMPTY_ARRAY = Object.freeze([]);

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

function boundedLogIdentifier(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim().slice(0, 80);
  return text || null;
}

function shootAckReplayGeometry(shot = {}) {
  const replay = {
    bullet_id: boundedLogIdentifier(shot.bullet_id ?? shot.bulletId),
    owner_user_id: boundedLogIdentifier(shot.owner_user_id ?? shot.ownerUserId),
    start_x: optionalNumericOrNull(shot.start_x ?? shot.startX),
    start_y: optionalNumericOrNull(shot.start_y ?? shot.startY),
    target_x: optionalNumericOrNull(shot.target_x ?? shot.targetX),
    target_y: optionalNumericOrNull(shot.target_y ?? shot.targetY),
    dir_x_micros: optionalNumericOrNull(shot.dir_x_micros ?? shot.dirXMicros),
    dir_y_micros: optionalNumericOrNull(shot.dir_y_micros ?? shot.dirYMicros),
    range_cm: optionalNumericOrNull(shot.range_cm ?? shot.rangeCm),
    speed_per_tick: optionalNumericOrNull(shot.speed_per_tick ?? shot.speedPerTick),
    created_tick: optionalNumericOrNull(shot.created_tick ?? shot.createdTick),
    expire_tick: optionalNumericOrNull(shot.expire_tick ?? shot.expireTick),
    observedTick: optionalNumericOrNull(shot.observedTick),
    executionDelayTicks: optionalNumericOrNull(shot.executionDelayTicks)
  };
  return replay.bullet_id !== null
    && replay.start_x !== null
    && replay.start_y !== null
    && replay.dir_x_micros !== null
    && replay.dir_y_micros !== null
    && replay.created_tick !== null
    ? replay
    : null;
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
  if (!frame || typeof frame !== 'object') return EMPTY_ARRAY;
  let drops = null;
  for (const field of COIN_DROP_ARRAY_FIELDS) {
    const value = frame[field];
    if (!Array.isArray(value)) continue;
    if (drops === null) drops = value;
    else if (drops === value) continue;
    else if (drops.length === 0) drops = value;
    else if (value.length > 0) drops = [...drops, ...value];
  }
  return drops && drops.length ? drops : EMPTY_ARRAY;
}

function normalizeEntity(entity, meta, reuse = false) {
  if (!entity || typeof entity !== 'object') return null;
  if (reuse) {
    if (typeof entity.x !== 'number' || !Number.isFinite(entity.x)) entity.x = numericOrNull(entity.x);
    if (typeof entity.y !== 'number' || !Number.isFinite(entity.y)) entity.y = numericOrNull(entity.y);
    if (typeof entity.vx !== 'number' || !Number.isFinite(entity.vx)) entity.vx = numericOrNull(entity.vx);
    if (typeof entity.vy !== 'number' || !Number.isFinite(entity.vy)) entity.vy = numericOrNull(entity.vy);
    if (typeof entity.hp !== 'number' || !Number.isFinite(entity.hp)) entity.hp = numericOrNull(entity.hp);
    if (typeof entity.max_hp !== 'number' || !Number.isFinite(entity.max_hp)) entity.max_hp = numericOrNull(entity.max_hp);
    entity.authority = meta.authority;
    entity.source = meta.source;
    entity.tick = meta.tick;
    entity.receivedAtMs = meta.receivedAtMs;
    return entity;
  }
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

function normalizeBullet(bullet, meta, reuse = false) {
  if (!bullet || typeof bullet !== 'object') return null;
  if (reuse) {
    bullet.authority = meta.authority;
    bullet.source = meta.source;
    bullet.tick = meta.tick;
    bullet.receivedAtMs = meta.receivedAtMs;
    return bullet;
  }
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
  let residualCm = 0;
  let largestGapTicks = 1;
  for (let index = 1; index < observations.length; index += 1) {
    const previous = observations[index - 1];
    const current = observations[index];
    const tickGap = Math.max(1, Number(current.tick) - Number(previous.tick));
    largestGapTicks = Math.max(largestGapTicks, tickGap);
    if ([previous.x, previous.y, current.x, current.y, current.dx, current.dy, current.speed].every(Number.isFinite)) {
      const predictedX = Number(previous.x) + Number(current.dx) * Number(current.speed) * tickGap;
      const predictedY = Number(previous.y) + Number(current.dy) * Number(current.speed) * tickGap;
      residualCm = Math.max(
        residualCm,
        Math.hypot(Number(current.x) - predictedX, Number(current.y) - predictedY)
      );
    }
  }
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

function normalizeCoinDrop(drop, meta, reuse = false) {
  if (!drop || typeof drop !== 'object') return null;
  if (reuse) {
    if (typeof drop.x !== 'number' || !Number.isFinite(drop.x)) drop.x = numericOrNull(drop.x);
    if (typeof drop.y !== 'number' || !Number.isFinite(drop.y)) drop.y = numericOrNull(drop.y);
    if (typeof drop.amount !== 'number' || !Number.isFinite(drop.amount)) drop.amount = numericOrNull(drop.amount);
    drop.authority = meta.authority;
    drop.source = meta.source;
    drop.tick = meta.tick;
    drop.receivedAtMs = meta.receivedAtMs;
    return drop;
  }
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
  const exactCandidate = attributionConfidence === 'exact' ? latestCandidate : null;
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
    frameReceivedToDecisionMs: optionalNumericOrNull(exactCandidate?.frameReceivedToDecisionMs),
    decisionToVelocitySendMs: optionalNumericOrNull(exactCandidate?.decisionToVelocitySendMs),
    velocitySendObservedTickAgeMs: optionalNumericOrNull(
      exactCandidate?.velocitySendObservedTickAgeMs ?? exactCandidate?.observedTickAgeAtSendMs
    ),
    pendingDepthAtSend: optionalNumericOrNull(exactCandidate?.pendingDepthAtSend),
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

function createInitialState(userId = 0, controlGeneration = '') {
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
      controlGeneration: String(controlGeneration || ''),
      lastAck: null,
      nextShotSequence: 1,
      nextConfirmationSequence: 1,
      nextExecutionSequence: 1,
      requestedShots: 0,
      acceptedShots: 0,
      unackedShots: 0,
      orphanAckCount: 0,
      lateAckCount: 0,
      duplicateAckCount: 0,
      pendingShots: [],
      expiredShots: [],
      confirmedShots: [],
      shootExecutionEvents: [],
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
  const reuseRealtimeFrameObjects = options.reuseRealtimeFrameObjects === true;
  let shootExecutionListener = typeof options.onShootExecution === 'function'
    ? options.onShootExecution
    : null;
  let controlGenerationSequence = 0;
  const nextControlGeneration = reason => [
    'control',
    Math.round(Number(now()) || Date.now()),
    ++controlGenerationSequence,
    String(reason || 'start').replace(/[^\w.-]+/g, '_').slice(0, 32)
  ].join(':');
  const state = createInitialState(options.userId, nextControlGeneration('start'));
  let shotTimingCache = { samples: null, value: null };
  let shotAckTimeoutCache = { samples: null, value: null };
  let shotOriginCache = { samples: null, value: null };
  let movementTimingCache = { samples: null, transitions: null, value: null };

  function currentShotTimingSummary() {
    const samples = state.command.delaySamples;
    if (shotTimingCache.samples !== samples) {
      shotTimingCache = { samples, value: shotTimingSummary(samples) };
    }
    return shotTimingCache.value;
  }

  function currentShotAckTimeoutMs() {
    const samples = state.command.ackLatencySamples;
    if (shotAckTimeoutCache.samples !== samples) {
      shotAckTimeoutCache = { samples, value: shotAckTimeoutMs(samples) };
    }
    return shotAckTimeoutCache.value;
  }

  function currentShotOriginSummary() {
    const samples = state.command.originErrorSamples;
    if (shotOriginCache.samples !== samples) {
      shotOriginCache = { samples, value: shotOriginSummary(samples) };
    }
    return shotOriginCache.value;
  }

  function currentMovementTimingSummary() {
    const movement = state.command.movement;
    if (movementTimingCache.samples !== movement.delaySamples
      || movementTimingCache.transitions !== movement.actualTransitions) {
      movementTimingCache = {
        samples: movement.delaySamples,
        transitions: movement.actualTransitions,
        value: movementTimingSummary(movement.delaySamples, movement.actualTransitions)
      };
    }
    return movementTimingCache.value;
  }

  function setUserId(userId) {
    state.userId = Number(userId || 0);
  }

  function reset(nextOptions = {}) {
    const next = createInitialState(
      nextOptions.userId ?? state.userId,
      nextControlGeneration(nextOptions.reason || 'reset')
    );
    for (const key of Object.keys(state)) delete state[key];
    Object.assign(state, next);
  }

  function beginControlGeneration(reason = 'reconnect') {
    state.command.controlGeneration = nextControlGeneration(reason);
    return state.command.controlGeneration;
  }

  function getControlGeneration() {
    return String(state.command.controlGeneration || '');
  }

  function recordShootExecution(event = {}, optionsForRecord = {}) {
    const wireTarget = event.wireTarget && typeof event.wireTarget === 'object'
      ? {
          x: numericOrNull(event.wireTarget.x ?? event.wireTarget.targetX),
          y: numericOrNull(event.wireTarget.y ?? event.wireTarget.targetY)
        }
      : (numericOrNull(event.targetX) !== null || numericOrNull(event.targetY) !== null
          ? { x: numericOrNull(event.targetX), y: numericOrNull(event.targetY) }
          : null);
    const entry = {
      sequence: state.command.nextExecutionSequence++,
      type: String(event.type || 'shoot-execution'),
      atMs: optionalNumericOrNull(event.atMs) ?? now(),
      requestId: event.requestId ?? null,
      commandId: event.commandId ?? event.requestId ?? null,
      requestSequence: optionalNumericOrNull(event.requestSequence),
      controlGeneration: String(event.controlGeneration || state.command.controlGeneration || ''),
      engagementGeneration: String(event.engagementGeneration || ''),
      segmentGeneration: String(event.segmentGeneration || ''),
      ownerSelfId: event.ownerSelfId ?? state.userId ?? null,
      targetId: event.targetId ?? null,
      wireTarget,
      ownership: event.ownership && typeof event.ownership === 'object'
        ? {
            requestSequence: optionalNumericOrNull(event.ownership.requestSequence),
            controlGeneration: String(event.ownership.controlGeneration || ''),
            engagementGeneration: String(event.ownership.engagementGeneration || ''),
            segmentGeneration: String(event.ownership.segmentGeneration || ''),
            ownerSelfId: event.ownership.ownerSelfId ?? state.userId ?? null,
            wireTarget: event.ownership.wireTarget && typeof event.ownership.wireTarget === 'object'
              ? {
                  x: numericOrNull(event.ownership.wireTarget.x),
                  y: numericOrNull(event.ownership.wireTarget.y)
                }
              : null,
            dispatchTick: optionalNumericOrNull(event.ownership.dispatchTick)
          }
        : null,
      baseCadenceMs: optionalNumericOrNull(event.baseCadenceMs),
      executionCadenceMs: optionalNumericOrNull(event.executionCadenceMs),
      advisoryCadenceMs: optionalNumericOrNull(event.advisoryCadenceMs),
      lastDispatchAt: optionalNumericOrNull(event.lastDispatchAt),
      skipReason: String(event.skipReason || ''),
      outcome: String(event.outcome || ''),
      observedTick: optionalNumericOrNull(event.observedTick)
    };
    state.command.shootExecutionEvents.push(entry);
    if (state.command.shootExecutionEvents.length > 128) {
      state.command.shootExecutionEvents.splice(0, state.command.shootExecutionEvents.length - 128);
    }
    if (shootExecutionListener) {
      try {
        const listenerEntry = optionsForRecord.listenerAck
          ? { ...entry, ack: optionsForRecord.listenerAck }
          : entry;
        shootExecutionListener(
          optionsForRecord.listenerUsesInternal === true && listenerEntry === entry
            ? entry
            : cloneJson(listenerEntry)
        );
      } catch (_) {}
    }
    return optionsForRecord.returnInternal === true ? entry : cloneJson(entry);
  }

  function setShootExecutionListener(listener) {
    shootExecutionListener = typeof listener === 'function' ? listener : null;
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
    const frameMeta = {
      receivedAtMs: meta.receivedAtMs,
      tick: meta.tick,
      authority: 'realtime',
      source: 'pos'
    };
    const normalizedEntities = reuseRealtimeFrameObjects ? entities : [];
    const entitiesByUserId = {};
    let self = null;
    let normalizedEntityCount = 0;
    for (const rawEntity of entities) {
      const entity = normalizeEntity(rawEntity, frameMeta, reuseRealtimeFrameObjects);
      if (!entity) continue;
      if (reuseRealtimeFrameObjects) normalizedEntities[normalizedEntityCount] = entity;
      else normalizedEntities.push(entity);
      normalizedEntityCount += 1;
      const userId = entity?.user_id ?? entity?.userId;
      if (userId !== null && userId !== undefined && userId !== '') entitiesByUserId[userId] = entity;
      if (Number(userId) === Number(state.userId)) self = entity;
    }
    if (reuseRealtimeFrameObjects && normalizedEntityCount !== normalizedEntities.length) {
      normalizedEntities.length = normalizedEntityCount;
    }
    state.realtime.tick = meta.tick;
    state.realtime.receivedAtMs = meta.receivedAtMs;
    state.realtime.entities = normalizedEntities;
    state.realtime.entitiesByUserId = entitiesByUserId;
    const trajectoryTtlMs = 2000;
    for (const key in state.realtime.bulletTrajectories) {
      if (!Object.prototype.hasOwnProperty.call(state.realtime.bulletTrajectories, key)) continue;
      const history = state.realtime.bulletTrajectories[key];
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
        current.observations.push({
          tick: meta.tick,
          atMs: meta.receivedAtMs,
          x,
          y,
          ...direction
        });
        if (current.observations.length > 5) {
          current.observations.splice(0, current.observations.length - 5);
        }
      }
      current.lastSeenAtMs = meta.receivedAtMs;
      state.realtime.bulletTrajectories[key] = current;
    }
    const trajectoryKeys = Object.keys(state.realtime.bulletTrajectories);
    if (trajectoryKeys.length > 32) {
      trajectoryKeys.sort((left, right) => (
        Number(state.realtime.bulletTrajectories[right]?.lastSeenAtMs || 0)
          - Number(state.realtime.bulletTrajectories[left]?.lastSeenAtMs || 0)
      ));
      const retainedTrajectoryKeySet = new Set(trajectoryKeys.slice(0, 32));
      for (const key of trajectoryKeys) {
        if (!retainedTrajectoryKeySet.has(key)) delete state.realtime.bulletTrajectories[key];
      }
    }
    const normalizedBullets = reuseRealtimeFrameObjects ? bullets : [];
    let normalizedBulletCount = 0;
    for (const bullet of bullets) {
      const normalized = normalizeBullet(bullet, frameMeta, reuseRealtimeFrameObjects);
      if (!normalized) continue;
      const history = state.realtime.bulletTrajectories[bulletKey(bullet)];
      if (history && reuseRealtimeFrameObjects) Object.assign(normalized, bulletTrajectorySummary(history));
      const outputBullet = history && !reuseRealtimeFrameObjects
        ? { ...normalized, ...bulletTrajectorySummary(history) }
        : normalized;
      if (reuseRealtimeFrameObjects) normalizedBullets[normalizedBulletCount] = outputBullet;
      else normalizedBullets.push(outputBullet);
      normalizedBulletCount += 1;
    }
    if (reuseRealtimeFrameObjects && normalizedBulletCount !== normalizedBullets.length) {
      normalizedBullets.length = normalizedBulletCount;
    }
    state.realtime.bullets = normalizedBullets;
    const normalizedCoinDrops = reuseRealtimeFrameObjects && coinDrops !== EMPTY_ARRAY ? coinDrops : [];
    let normalizedCoinDropCount = 0;
    for (const drop of coinDrops) {
      const normalized = normalizeCoinDrop(drop, frameMeta, reuseRealtimeFrameObjects);
      if (!normalized) continue;
      if (reuseRealtimeFrameObjects) normalizedCoinDrops[normalizedCoinDropCount] = normalized;
      else normalizedCoinDrops.push(normalized);
      normalizedCoinDropCount += 1;
    }
    if (reuseRealtimeFrameObjects && normalizedCoinDropCount !== normalizedCoinDrops.length) {
      normalizedCoinDrops.length = normalizedCoinDropCount;
    }
    state.realtime.coinDrops = normalizedCoinDrops;
    state.realtime.coinDropsObserved = coinDropsObserved;
    state.realtime.self = self;
    if (self) state.realtime.lastSelf = self;
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
    const timing = currentMovementTimingSummary();
    const observedAtMs = optionalNumericOrNull(meta.receivedAtMs);
    const maximumPendingAgeMs = Math.max(3000, Number(timing.p90Ticks || DEFAULT_MOVEMENT_P90_TICKS) * 50 * 8);
    if (movement.pendingCommands.length) {
      movement.pendingCommands = movement.pendingCommands.filter(command => {
        const requestedAtMs = optionalNumericOrNull(command.requestedAtMs);
        return observedAtMs === null || requestedAtMs === null || observedAtMs - requestedAtMs <= maximumPendingAgeMs;
      });
      if (movement.pendingCommands.length > 32) {
        movement.pendingCommands.splice(0, movement.pendingCommands.length - 32);
      }
    }
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
    const ackIdentity = String(
      ack.bullet_id
        ?? ack.bulletId
        ?? (ack.created_tick === null || ack.created_tick === undefined
          ? ''
          : `${ack.created_tick}:${ack.start_x ?? ''}:${ack.start_y ?? ''}:${ack.target_x ?? ''}:${ack.target_y ?? ''}`)
    );
    const duplicate = ackIdentity
      ? state.command.confirmedShots.find(item => String(item.ackIdentity || '') === ackIdentity)
      : null;
    if (duplicate) {
      state.command.duplicateAckCount += 1;
      const execution = recordShootExecution({
        type: 'shoot-ack-duplicate',
        atMs: meta.receivedAtMs,
        requestId: duplicate.requestId ?? duplicate.commandId ?? null,
        requestSequence: duplicate.requestSequence ?? duplicate.sequence,
        controlGeneration: duplicate.controlGeneration,
        engagementGeneration: duplicate.engagementGeneration,
        segmentGeneration: duplicate.segmentGeneration,
        ownerSelfId: duplicate.ownerSelfId,
        targetId: duplicate.targetId,
        wireTarget: duplicate.ownership?.wireTarget,
        outcome: 'duplicate-ack',
        observedTick: meta.tick
      });
      state.command.lastAck = { ...ack, matchedShot: null, duplicateOf: cloneJson(duplicate), execution };
      return;
    }
    const targetX = numericOrNull(ack.target_x);
    const targetY = numericOrNull(ack.target_y);
    const createdTick = numericOrNull(ack.created_tick);
    const expectedDelayTicks = Math.max(0, Number(currentShotTimingSummary().medianTicks || 5));
    const candidates = [
      ...state.command.pendingShots.map((item, index) => ({ item, index, source: 'pending' })),
      ...state.command.expiredShots.map((item, index) => ({ item, index, source: 'expired' }))
    ];
    const pending = candidates
      .map(candidate => ({
        ...candidate,
        distance: targetX === null || targetY === null
          ? candidate.index
          : Math.hypot(Number(candidate.item.targetX) - targetX, Number(candidate.item.targetY) - targetY),
        creationDelayTicks: createdTick === null || numericOrNull(candidate.item.observedTick) === null
          ? null
          : createdTick - Number(candidate.item.observedTick)
      }))
      .filter(candidate => targetX === null || targetY === null || candidate.distance <= 5)
      .sort((a, b) => a.distance - b.distance
        || Number(a.creationDelayTicks === null || a.creationDelayTicks < 0)
          - Number(b.creationDelayTicks === null || b.creationDelayTicks < 0)
        || Math.abs(Number(a.creationDelayTicks ?? expectedDelayTicks) - expectedDelayTicks)
          - Math.abs(Number(b.creationDelayTicks ?? expectedDelayTicks) - expectedDelayTicks)
        || Number(a.source === 'expired') - Number(b.source === 'expired')
        || Number(a.item.requestedAtMs || 0) - Number(b.item.requestedAtMs || 0))[0] || null;
    let confirmed = null;
    if (pending) {
      if (pending.source === 'expired') {
        state.command.expiredShots.splice(pending.index, 1);
        state.command.unackedShots = Math.max(0, state.command.unackedShots - 1);
        state.command.lateAckCount += 1;
      } else {
        state.command.pendingShots.splice(pending.index, 1);
      }
      const observedTick = numericOrNull(pending.item.observedTick);
      confirmed = {
        ...pending.item,
        ...ack,
        ackIdentity,
        confirmationSequence: state.command.nextConfirmationSequence++,
        lateAck: pending.source === 'expired',
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
      recordShootExecution({
        type: pending.source === 'expired' ? 'shoot-ack-late' : 'shoot-ack-accepted',
        atMs: meta.receivedAtMs,
        requestId: confirmed.requestId ?? confirmed.commandId ?? null,
        requestSequence: confirmed.requestSequence ?? confirmed.sequence,
        controlGeneration: confirmed.controlGeneration,
        engagementGeneration: confirmed.engagementGeneration,
        segmentGeneration: confirmed.segmentGeneration,
        ownerSelfId: confirmed.ownerSelfId,
        targetId: confirmed.targetId,
        wireTarget: confirmed.ownership?.wireTarget || {
          x: confirmed.targetX,
          y: confirmed.targetY
        },
        ownership: confirmed.ownership,
        outcome: pending.source === 'expired' ? 'late-ack' : 'accepted',
        observedTick: meta.tick
      }, {
        listenerAck: shootAckReplayGeometry(confirmed)
      });
    } else {
      state.command.orphanAckCount += 1;
      recordShootExecution({
        type: 'shoot-ack-orphan',
        atMs: meta.receivedAtMs,
        controlGeneration: state.command.controlGeneration,
        outcome: 'orphan-ack',
        observedTick: meta.tick
      });
    }
    state.command.lastAck = { ...ack, matchedShot: confirmed };
  }

  function expirePendingShots(atMs = now()) {
    const timeoutMs = currentShotAckTimeoutMs();
    const pendingShots = state.command.pendingShots;
    let retainedCount = 0;
    for (const shot of pendingShots) {
      if (Number(atMs) - Number(shot.requestedAtMs || 0) > timeoutMs) {
        state.command.unackedShots += 1;
        state.command.expiredShots.push({ ...shot, expiredAtMs: Number(atMs) });
      } else {
        pendingShots[retainedCount] = shot;
        retainedCount += 1;
      }
    }
    if (retainedCount !== pendingShots.length) pendingShots.length = retainedCount;
    if (state.command.expiredShots.length > 64) {
      state.command.expiredShots.splice(0, state.command.expiredShots.length - 64);
    }
  }

  function recordShootRequest(request = {}, optionsForRecord = {}) {
    const requestedAtMs = Number(request.requestedAtMs || now());
    expirePendingShots(requestedAtMs);
    const requestSequence = state.command.nextShotSequence++;
    const ownerSelfId = request.ownerSelfId ?? state.userId ?? null;
    const wireTarget = {
      x: numericOrNull(request.targetX),
      y: numericOrNull(request.targetY)
    };
    const shot = {
      sequence: requestSequence,
      requestSequence,
      commandId: request.commandId ?? null,
      requestId: request.requestId ?? request.commandId ?? null,
      controlGeneration: String(request.controlGeneration || state.command.controlGeneration || ''),
      engagementGeneration: String(request.engagementGeneration || ''),
      segmentGeneration: String(request.segmentGeneration || ''),
      ownerSelfId,
      ownership: Object.freeze({
        requestSequence,
        controlGeneration: String(request.controlGeneration || state.command.controlGeneration || ''),
        engagementGeneration: String(request.engagementGeneration || ''),
        segmentGeneration: String(request.segmentGeneration || ''),
        ownerSelfId,
        wireTarget: Object.freeze({ ...wireTarget }),
        dispatchTick: numericOrNull(request.observedTick)
      }),
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
      coverageAimY: numericOrNull(request.coverageAimY),
      coverageApplied: request.coverageApplied === true,
      coverageBaselineExpectedMissCm: numericOrNull(request.coverageBaselineExpectedMissCm),
      coverageSelectedExpectedMissCm: numericOrNull(request.coverageSelectedExpectedMissCm),
      coverageExpectedMissImprovementCm: numericOrNull(request.coverageExpectedMissImprovementCm),
      coverageImprovementQualified: request.coverageImprovementQualified === true,
      coverageSelectionMode: String(request.coverageSelectionMode || ''),
      coverageRouteSelectionMode: String(request.coverageRouteSelectionMode || '')
    };
    state.command.requestedShots += 1;
    state.command.pendingShots.push(shot);
    // Keep enough recent requests to correlate a normal cadence during a
    // delayed-ACK window. Pending ACKs are diagnostic ownership state, not a
    // fire-rate gate; the bounded ledger still expires and trims old entries.
    state.command.pendingShots = state.command.pendingShots.slice(-64);
    return optionsForRecord.returnInternal === true ? shot : cloneJson(shot);
  }

  function recordVelocityRequest(request = {}, optionsForRecord = {}) {
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
        return optionsForRecord.returnInternal === true ? owner : cloneJson(owner);
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
    const timing = currentMovementTimingSummary();
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
    return optionsForRecord.returnInternal === true ? command : cloneJson(command);
  }

  function movementCommandState(options = {}) {
    const movement = state.command.movement;
    const timing = currentMovementTimingSummary();
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
      pendingVelocityCommands: movement.pendingCommands.length
        ? movement.pendingCommands.slice(-8).map(command => ({
        ...copyCommand(command),
        effectiveAfterTicks: currentTick === null || command.expectedEffectiveTick === null
          ? Number(timing.p90Ticks || 5)
          : Math.max(0, Number(command.expectedEffectiveTick) - currentTick)
        }))
        : (clone ? [] : EMPTY_ARRAY),
      actualVelocityTransitions: movement.actualTransitions.length
        ? copy(movement.actualTransitions.slice(-16))
        : (clone ? [] : EMPTY_ARRAY),
      settledCommands: movement.settledCommands.length
        ? copy(movement.settledCommands.slice(-8))
        : (clone ? [] : EMPTY_ARRAY),
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
    const timing = currentShotTimingSummary();
    const ackTimeoutMs = currentShotAckTimeoutMs();
    return {
      lastAck: cloneJson(state.command.lastAck),
      ackAgeMs: frameAge(nowMs, state.command.lastAck?.receivedAtMs),
      shooting: {
        controlGeneration: state.command.controlGeneration,
        lastRequestSequence: state.command.nextShotSequence - 1,
        lastConfirmationSequence: state.command.nextConfirmationSequence - 1,
        requestedShots: state.command.requestedShots,
        acceptedShots: state.command.acceptedShots,
        unackedShots: state.command.unackedShots,
        orphanAckCount: state.command.orphanAckCount,
        lateAckCount: state.command.lateAckCount,
        duplicateAckCount: state.command.duplicateAckCount,
        pendingCount: state.command.pendingShots.length,
        acceptanceRate: state.command.requestedShots > 0
          ? state.command.acceptedShots / state.command.requestedShots
          : null,
        ackTimeoutMs,
        timing,
        shooterOrigin: currentShotOriginSummary(),
        pendingShots: cloneJson(state.command.pendingShots.slice(-8)),
        expiredShots: cloneJson(state.command.expiredShots.slice(-8)),
        confirmedShots: cloneJson(state.command.confirmedShots.slice(-16)),
        executionEvents: cloneJson(state.command.shootExecutionEvents.slice(-32))
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
    const timing = currentShotTimingSummary();
    const ackTimeoutMs = currentShotAckTimeoutMs();
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
          controlGeneration: state.command.controlGeneration,
          lastRequestSequence: state.command.nextShotSequence - 1,
          lastConfirmationSequence: state.command.nextConfirmationSequence - 1,
          requestedShots: state.command.requestedShots,
          acceptedShots: state.command.acceptedShots,
          unackedShots: state.command.unackedShots,
          orphanAckCount: state.command.orphanAckCount,
          lateAckCount: state.command.lateAckCount,
          duplicateAckCount: state.command.duplicateAckCount,
          pendingCount: state.command.pendingShots.length,
          acceptanceRate: state.command.requestedShots > 0
            ? state.command.acceptedShots / state.command.requestedShots
            : null,
          ackTimeoutMs,
          timing,
          shooterOrigin: currentShotOriginSummary(),
          pendingShots: state.command.pendingShots.length ? state.command.pendingShots.slice(-8) : EMPTY_ARRAY,
          expiredShots: state.command.expiredShots.length ? state.command.expiredShots.slice(-8) : EMPTY_ARRAY,
          confirmedShots: state.command.confirmedShots.length ? state.command.confirmedShots.slice(-16) : EMPTY_ARRAY,
          executionEvents: state.command.shootExecutionEvents.length
            ? state.command.shootExecutionEvents.slice(-32)
            : EMPTY_ARRAY
        },
        movement: movementCommandState({ clone: false })
      },
      transportDiagnostics: state.transportDiagnostics
    };
  }

  return {
    getCommandState,
    getControlGeneration,
    getDecisionState,
    getFallbackState,
    getFrameAges,
    getRealtimeState,
    getState,
    ingestDecodedFrame: ingestFrame,
    ingestFrame,
    beginControlGeneration,
    recordShootExecution,
    recordShootRequest,
    recordVelocityRequest,
    reset,
    setShootExecutionListener,
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
