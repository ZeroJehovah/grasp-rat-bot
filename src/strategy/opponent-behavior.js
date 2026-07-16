'use strict';

const OPPONENT_BEHAVIOR_MODES = Object.freeze([
  'stationary',
  'steady-linear',
  'zigzag-strafe',
  'retreat-kite',
  'charge-close',
  'pressure-shooter',
  'mixed/unknown'
]);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function percentile(values = [], ratio = 0.5) {
  const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

function burstCadenceMetricsCore(intervals = []) {
  const positive = (intervals || []).map(Number).filter(value => Number.isFinite(value) && value > 0);
  const baseMedian = percentile(positive, 0.5);
  const baseMad = baseMedian === null
    ? null
    : percentile(positive.map(value => Math.abs(value - baseMedian)), 0.5);
  if (baseMedian === null) {
    return {
      burstIntervals: [],
      interBurstGaps: [],
      burstIntervalMedianTicks: null,
      burstIntervalMadTicks: null,
      burstIntervalP90Ticks: null,
      burstIntervalCv: null,
      burstSampleCount: 0,
      interBurstGapMedianTicks: null,
      currentBurstIntervalCount: 0,
      currentBurstShotCount: 0,
      burstConfidence: 0,
      burstPredictable: false,
      splitThresholdTicks: null
    };
  }
  const splitThresholdTicks = Math.max(
    baseMedian * 1.8,
    baseMedian + Math.max(0, Number(baseMad || 0)) * 3,
    baseMedian + 3
  );
  const normalized = positive.map(interval => {
    if (interval <= splitThresholdTicks) return { kind: 'burst', value: interval, multiple: 1 };
    const multiple = Math.round(interval / baseMedian);
    const normalizedValue = multiple > 0 ? interval / multiple : interval;
    const multipleTolerance = Math.max(1, Number(baseMad || 0) * 2);
    if (Number(baseMad || 0) <= baseMedian * 0.2
      && multiple >= 2
      && multiple <= 3
      && Math.abs(normalizedValue - baseMedian) <= multipleTolerance) {
      return { kind: 'burst', value: normalizedValue, multiple };
    }
    return { kind: 'gap', value: interval, multiple: 1 };
  });
  const burstIntervals = normalized.filter(item => item.kind === 'burst').map(item => item.value);
  const interBurstGaps = normalized.filter(item => item.kind === 'gap').map(item => item.value);
  const burstIntervalMedianTicks = percentile(burstIntervals, 0.5);
  const burstIntervalMadTicks = burstIntervalMedianTicks === null
    ? null
    : percentile(burstIntervals.map(value => Math.abs(value - burstIntervalMedianTicks)), 0.5);
  const burstIntervalP90Ticks = percentile(burstIntervals, 0.9);
  const mean = burstIntervals.length
    ? burstIntervals.reduce((sum, value) => sum + value, 0) / burstIntervals.length
    : null;
  const variance = mean === null
    ? null
    : burstIntervals.reduce((sum, value) => sum + (value - mean) ** 2, 0) / burstIntervals.length;
  const burstIntervalCv = mean && variance !== null ? Math.sqrt(variance) / mean : null;
  let currentBurstIntervalCount = 0;
  for (let index = normalized.length - 1; index >= 0; index -= 1) {
    if (normalized[index].kind === 'gap') break;
    currentBurstIntervalCount += 1;
  }
  const burstSampleCount = burstIntervals.length;
  const sampleConfidence = clamp(burstSampleCount / 4, 0, 1);
  const currentConfidence = clamp(currentBurstIntervalCount / 2, 0, 1);
  const variationConfidence = burstIntervalCv === null ? 0 : clamp(1 - burstIntervalCv * 1.5, 0, 1);
  const burstConfidence = sampleConfidence * currentConfidence * variationConfidence;
  return {
    burstIntervals,
    interBurstGaps,
    burstIntervalMedianTicks,
    burstIntervalMadTicks,
    burstIntervalP90Ticks,
    burstIntervalCv,
    burstSampleCount,
    interBurstGapMedianTicks: percentile(interBurstGaps, 0.5),
    currentBurstIntervalCount,
    currentBurstShotCount: positive.length ? currentBurstIntervalCount + 1 : 0,
    burstConfidence,
    burstPredictable: Boolean(
      burstSampleCount >= 3
        && currentBurstIntervalCount >= 2
        && burstConfidence >= 0.55
    ),
    splitThresholdTicks
  };
}

function behaviorDistanceBand(distance) {
  const value = Number(distance);
  if (!Number.isFinite(value)) return 'unknown';
  if (value < 4500) return 'close';
  if (value < 7500) return 'preferred';
  if (value < 10500) return 'far';
  return 'edge';
}

function behaviorLearningBaseKey(behavior, distance) {
  const object = behavior && typeof behavior === 'object' ? behavior : null;
  const mode = String(object?.mode || behavior || 'mixed/unknown');
  const dimensions = object?.dimensions || {};
  const movement = String(dimensions.movementIntent?.state || mode || 'erratic');
  const shooting = String(dimensions.shootingPhase?.state || 'unknown');
  const stamina = String(dimensions.staminaPhase?.state || 'unknown');
  const style = String(dimensions.controlStyle?.state || 'unknown');
  return [
    `movement=${movement}`,
    `shooting=${shooting}`,
    `stamina=${stamina}`,
    `style=${style}`,
    `distance=${behaviorDistanceBand(distance)}`
  ].join('|');
}

function behaviorLearningKey(behavior, distance, aimStrategy = 'all') {
  return `${behaviorLearningBaseKey(behavior, distance)}|aim=${String(aimStrategy || 'all')}`;
}

function sampleDistance(sample) {
  const explicit = numberOrNull(sample?.distance);
  if (explicit !== null) return explicit;
  const sx = Number(sample?.selfX);
  const sy = Number(sample?.selfY);
  const tx = Number(sample?.x);
  const ty = Number(sample?.y);
  return [sx, sy, tx, ty].every(Number.isFinite) ? Math.hypot(tx - sx, ty - sy) : null;
}

const MOVEMENT_DIRECTION_STATES = Object.freeze([
  'stop',
  'east',
  'south-east',
  'south',
  'south-west',
  'west',
  'north-west',
  'north',
  'north-east'
]);

function movementDirectionState(vx, vy, stationarySpeed = 5) {
  const dx = Number(vx) || 0;
  const dy = Number(vy) || 0;
  if (Math.hypot(dx, dy) < Math.max(0, Number(stationarySpeed) || 0)) return 'stop';
  const octant = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  return ({
    '-4': 'west',
    '-3': 'north-west',
    '-2': 'north',
    '-1': 'north-east',
    0: 'east',
    1: 'south-east',
    2: 'south',
    3: 'south-west',
    4: 'west'
  })[octant] || 'stop';
}

function movementDirectionVector(state) {
  return ({
    east: { x: 1, y: 0 },
    'south-east': { x: Math.SQRT1_2, y: Math.SQRT1_2 },
    south: { x: 0, y: 1 },
    'south-west': { x: -Math.SQRT1_2, y: Math.SQRT1_2 },
    west: { x: -1, y: 0 },
    'north-west': { x: -Math.SQRT1_2, y: -Math.SQRT1_2 },
    north: { x: 0, y: -1 },
    'north-east': { x: Math.SQRT1_2, y: -Math.SQRT1_2 },
    stop: { x: 0, y: 0 }
  })[String(state)] || { x: 0, y: 0 };
}

function movementSpeedBand(speed, options = {}) {
  const value = Math.max(0, Number(speed) || 0);
  const stationarySpeed = Math.max(0, Number(options.stationarySpeed ?? 5));
  const referenceSpeed = Math.max(stationarySpeed + 1, Number(options.referenceSpeed ?? 50));
  if (value < stationarySpeed) return 'stopped';
  if (value < referenceSpeed * 0.45) return 'slow';
  if (value < referenceSpeed * 0.85) return 'cruise';
  return 'fast';
}

function movementDwellBand(dwellTicks) {
  const value = Math.max(0, Number(dwellTicks) || 0);
  if (value < 6) return 'new';
  if (value < 20) return 'settled';
  return 'long';
}

function movementActionPhaseFromSample(sample = {}, dwellMs = 0, options = {}) {
  const stationarySpeed = Math.max(0, Number(options.stationarySpeed ?? 5));
  const serverTickMs = Math.max(1, Number(options.serverTickMs ?? 50));
  const vx = Number(sample.vx) || 0;
  const vy = Number(sample.vy) || 0;
  const speed = Math.hypot(vx, vy);
  const dx = Number(sample.x) - Number(sample.selfX || 0);
  const dy = Number(sample.y) - Number(sample.selfY || 0);
  const distance = Math.max(1, Math.hypot(dx, dy));
  const radialSpeed = dx / distance * vx + dy / distance * vy;
  const lateralSpeed = dx / distance * vy - dy / distance * vx;
  const relationThreshold = Math.max(2, Number(options.relationSpeedThreshold ?? stationarySpeed));
  const dwellTicks = Math.max(0, dwellMs / serverTickMs);
  return {
    currentDirection: movementDirectionState(vx, vy, stationarySpeed),
    currentDirectionVector: movementDirectionVector(movementDirectionState(vx, vy, stationarySpeed)),
    dwellMs: Math.round(Math.max(0, dwellMs)),
    dwellTicks: Math.round(dwellTicks * 10) / 10,
    dwellBand: movementDwellBand(dwellTicks),
    ticksSinceTurn: Math.round(dwellTicks * 10) / 10,
    speed: Math.round(speed * 100) / 100,
    speedBand: movementSpeedBand(speed, options),
    radialSpeed: Math.round(radialSpeed * 100) / 100,
    radialRelation: radialSpeed > relationThreshold
      ? 'receding'
      : (radialSpeed < -relationThreshold ? 'closing' : 'stable'),
    lateralSpeed: Math.round(lateralSpeed * 100) / 100,
    lateralRelation: lateralSpeed > relationThreshold
      ? 'right'
      : (lateralSpeed < -relationThreshold ? 'left' : 'center'),
    distanceBand: behaviorDistanceBand(sampleDistance(sample))
  };
}

function movementActionPhaseCore(samples = [], options = {}) {
  const history = (samples || []).filter(Boolean);
  const last = history.at(-1);
  if (!last) return movementActionPhaseFromSample({}, 0, options);
  const stationarySpeed = Math.max(0, Number(options.stationarySpeed ?? 5));
  const currentDirection = movementDirectionState(last.vx, last.vy, stationarySpeed);
  let directionSinceAt = Number(last.at || 0);
  for (let index = history.length - 2; index >= 0; index -= 1) {
    const sample = history[index];
    if (movementDirectionState(sample?.vx, sample?.vy, stationarySpeed) !== currentDirection) break;
    directionSinceAt = Number(sample?.at || directionSinceAt);
  }
  return movementActionPhaseFromSample(
    last,
    Math.max(0, Number(last.at || 0) - directionSinceAt),
    options
  );
}

function movementRouteContextKeyCore(behavior, distance, phase = {}) {
  const mode = String(behavior?.mode || behavior || 'mixed/unknown');
  return [
    `mode=${mode}`,
    `distance=${phase.distanceBand || behaviorDistanceBand(distance)}`,
    `direction=${phase.currentDirection || 'stop'}`,
    `dwell=${phase.dwellBand || movementDwellBand(phase.dwellTicks)}`,
    `speed=${phase.speedBand || 'stopped'}`,
    `radial=${phase.radialRelation || 'stable'}`,
    `lateral=${phase.lateralRelation || 'center'}`
  ].join('|');
}

function movementTransitionModelCore(samples = [], options = {}) {
  const stationarySpeed = Math.max(0, Number(options.stationarySpeed ?? 5));
  const history = (samples || []).filter(Boolean);
  const states = history.map(sample => movementDirectionState(sample?.vx, sample?.vy, stationarySpeed));
  const counts = {};
  const conditionalCounts = {};
  let transitionCount = 0;
  let directionSinceAt = Number(history[0]?.at || 0);
  for (let index = 1; index < states.length; index += 1) {
    const from = states[index - 1];
    const to = states[index];
    if (!counts[from]) counts[from] = {};
    counts[from][to] = Number(counts[from][to] || 0) + 1;
    if (index > 1 && from !== states[index - 2]) directionSinceAt = Number(history[index - 1]?.at || directionSinceAt);
    const previousSample = history[index - 1] || {};
    const phase = movementActionPhaseFromSample(
      previousSample,
      Math.max(0, Number(previousSample.at || 0) - directionSinceAt),
      options
    );
    const contextKey = movementRouteContextKeyCore(options.mode || 'mixed/unknown', sampleDistance(previousSample), phase);
    if (!conditionalCounts[contextKey]) conditionalCounts[contextKey] = {};
    conditionalCounts[contextKey][to] = Number(conditionalCounts[contextKey][to] || 0) + 1;
    transitionCount += 1;
  }
  const matrix = {};
  for (const [from, row] of Object.entries(counts)) {
    const total = Object.values(row).reduce((sum, value) => sum + Number(value || 0), 0);
    matrix[from] = Object.fromEntries(Object.entries(row)
      .map(([to, value]) => [to, total > 0 ? Number(value) / total : 0])
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
  }
  const currentState = states[states.length - 1] || 'stop';
  const phase = movementActionPhaseCore(history, options);
  const contextKey = movementRouteContextKeyCore(options.mode || 'mixed/unknown', sampleDistance(history.at(-1)), phase);
  const conditionalRow = conditionalCounts[contextKey] || {};
  const conditionalTotal = Object.values(conditionalRow).reduce((sum, value) => sum + Number(value || 0), 0);
  const conditionalNext = Object.entries(conditionalRow)
    .map(([state, count]) => ({
      state,
      count: Number(count || 0),
      probability: conditionalTotal > 0 ? Number(count) / conditionalTotal : 0,
      vector: movementDirectionVector(state)
    }))
    .sort((a, b) => b.probability - a.probability || a.state.localeCompare(b.state));
  const next = Object.entries(matrix[currentState] || {})
    .map(([state, probability]) => ({ state, probability, vector: movementDirectionVector(state) }))
    .sort((a, b) => b.probability - a.probability || a.state.localeCompare(b.state));
  const entropy = next.length
    ? -next.reduce((sum, item) => sum + (item.probability > 0 ? item.probability * Math.log2(item.probability) : 0), 0)
    : null;
  const rowPredictabilities = Object.values(matrix)
    .map(row => Math.max(0, ...Object.values(row).map(Number).filter(Number.isFinite)))
    .filter(Number.isFinite);
  return {
    states: MOVEMENT_DIRECTION_STATES,
    currentState,
    phase,
    contextKey,
    conditionalSampleCount: conditionalTotal,
    conditionalNext,
    transitionCount,
    matrix,
    next,
    entropy,
    predictability: rowPredictabilities.length
      ? rowPredictabilities.reduce((sum, value) => sum + value, 0) / rowPredictabilities.length
      : 0.5,
    confidence: clamp(transitionCount / Math.max(4, Number(options.fullConfidenceTransitions ?? 12)), 0, 1)
  };
}

function opponentBehaviorMetricsCore(samples = [], options = {}) {
  const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  const windowMs = Math.max(2000, Number(options.windowMs ?? 12000));
  const stationarySpeed = Math.max(1, Number(options.stationarySpeed ?? 5));
  const history = (samples || [])
    .filter(sample => sample && nowMs - Number(sample.at || 0) <= windowMs)
    .slice(-80);
  let radialSum = 0;
  let lateralSum = 0;
  let speedSum = 0;
  let velocityDotSum = 0;
  let velocityDotCount = 0;
  let lateralFlips = 0;
  let stopGoSwitches = 0;
  let firingSamples = 0;
  let pressureSamples = 0;
  let previousLateralSign = 0;
  let previousMoving = null;
  let lastLateralFlipAt = 0;
  const shotIntervals = [];
  const directionDwells = [];
  const reactionLatencies = [];
  const staminaCycleIntervals = [];
  let previousShotAt = 0;
  const shotEvents = [];
  const seenShotEvents = new Set();
  let previousDirection = '';
  let directionSinceAt = 0;
  let previousTargetHp = null;
  let pendingStimulusAt = 0;
  let previousStamina = null;
  let previousStaminaTrend = 0;
  let lastStaminaRecoveryAt = 0;
  for (let index = 0; index < history.length; index += 1) {
    const sample = history[index];
    const dx = Number(sample.x) - Number(sample.selfX || 0);
    const dy = Number(sample.y) - Number(sample.selfY || 0);
    const distance = Math.max(1, Math.hypot(dx, dy));
    const vx = Number(sample.vx) || 0;
    const vy = Number(sample.vy) || 0;
    const radial = dx / distance * vx + dy / distance * vy;
    const lateral = dx / distance * vy - dy / distance * vx;
    const speed = Math.hypot(vx, vy);
    const at = Number(sample.at || nowMs);
    const directionState = movementDirectionState(vx, vy, stationarySpeed);
    if (!previousDirection) {
      previousDirection = directionState;
      directionSinceAt = at;
    } else if (directionState !== previousDirection) {
      directionDwells.push(Math.max(0, at - directionSinceAt));
      previousDirection = directionState;
      directionSinceAt = at;
    }
    radialSum += radial;
    lateralSum += Math.abs(lateral);
    speedSum += speed;
    const lateralSign = Math.abs(lateral) >= stationarySpeed ? Math.sign(lateral) : 0;
    if (lateralSign && previousLateralSign && lateralSign !== previousLateralSign) {
      lateralFlips += 1;
      lastLateralFlipAt = Number(sample.at || nowMs);
    }
    if (lateralSign) previousLateralSign = lateralSign;
    const moving = speed >= stationarySpeed;
    if (previousMoving !== null && moving !== previousMoving) stopGoSwitches += 1;
    previousMoving = moving;
    if (sample.firing) firingSamples += 1;
    if (sample.firing || sample.realBulletPressure) pressureSamples += 1;
    const sampleShotEvents = Array.isArray(sample.newShotEvents) ? sample.newShotEvents : [];
    for (const event of sampleShotEvents) {
      const createdTick = numberOrNull(event?.createdTick ?? event?.created_tick);
      if (createdTick === null) continue;
      const key = String(event?.bulletId ?? event?.bullet_id ?? createdTick);
      if (seenShotEvents.has(key)) continue;
      seenShotEvents.add(key);
      shotEvents.push({
        bulletId: key,
        createdTick,
        observedAt: at
      });
    }
    if (!sampleShotEvents.length && Number(sample.newBulletCount || 0) > 0) {
      if (previousShotAt) shotIntervals.push(at - previousShotAt);
      previousShotAt = at;
    }
    const targetHp = numberOrNull(sample.targetHp);
    if (targetHp !== null && previousTargetHp !== null && targetHp < previousTargetHp) pendingStimulusAt = at;
    const directionChanged = index > 0 && directionState !== movementDirectionState(history[index - 1]?.vx, history[index - 1]?.vy, stationarySpeed);
    if (pendingStimulusAt && at > pendingStimulusAt && at - pendingStimulusAt <= 2500
      && (directionChanged || Number(sample.newBulletCount || 0) > 0)) {
      reactionLatencies.push(at - pendingStimulusAt);
      pendingStimulusAt = 0;
    }
    if (targetHp !== null) previousTargetHp = targetHp;
    const stamina = numberOrNull(sample.targetStamina5s);
    if (stamina !== null && previousStamina !== null) {
      const trend = Math.sign(stamina - previousStamina);
      if (trend > 0 && previousStaminaTrend < 0) {
        if (lastStaminaRecoveryAt) staminaCycleIntervals.push(at - lastStaminaRecoveryAt);
        lastStaminaRecoveryAt = at;
      }
      if (trend) previousStaminaTrend = trend;
    }
    if (stamina !== null) previousStamina = stamina;
    if (index > 0) {
      const previous = history[index - 1];
      const previousSpeed = Math.hypot(Number(previous.vx) || 0, Number(previous.vy) || 0);
      if (previousSpeed >= stationarySpeed && speed >= stationarySpeed) {
        velocityDotSum += ((Number(previous.vx) || 0) * vx + (Number(previous.vy) || 0) * vy) / (previousSpeed * speed);
        velocityDotCount += 1;
      }
    }
  }
  const first = history[0] || null;
  const last = history[history.length - 1] || null;
  const durationMs = first && last ? Math.max(0, Number(last.at || 0) - Number(first.at || 0)) : 0;
  const firstDistance = sampleDistance(first);
  const lastDistance = sampleDistance(last);
  const netDistanceChange = firstDistance !== null && lastDistance !== null ? lastDistance - firstDistance : 0;
  const distanceChangeRate = durationMs > 0 ? netDistanceChange / (durationMs / 1000) : 0;
  const sampleCount = history.length;
  const velocityStability = velocityDotCount ? clamp((velocityDotSum / velocityDotCount + 1) / 2, 0, 1) : 0.5;
  const intervalMean = shotIntervals.length
    ? shotIntervals.reduce((sum, value) => sum + value, 0) / shotIntervals.length
    : null;
  const intervalVariance = intervalMean === null ? null : shotIntervals.reduce((sum, value) => sum + (value - intervalMean) ** 2, 0) / shotIntervals.length;
  const shotIntervalCv = intervalMean && intervalVariance !== null ? Math.sqrt(intervalVariance) / intervalMean : null;
  const orderedShotEvents = shotEvents
    .slice()
    .sort((a, b) => a.createdTick - b.createdTick || a.observedAt - b.observedAt)
    .slice(-32);
  const shotIntervalTicks = [];
  for (let index = 1; index < orderedShotEvents.length; index += 1) {
    const interval = orderedShotEvents[index].createdTick - orderedShotEvents[index - 1].createdTick;
    if (interval > 0) shotIntervalTicks.push(interval);
  }
  const burstCadence = burstCadenceMetricsCore(shotIntervalTicks);
  const intervalMedianTicks = burstCadence.burstIntervalMedianTicks;
  const intervalMadTicks = burstCadence.burstIntervalMadTicks;
  const intervalP90Ticks = burstCadence.burstIntervalP90Ticks;
  const intervalTickMean = shotIntervalTicks.length
    ? shotIntervalTicks.reduce((sum, value) => sum + value, 0) / shotIntervalTicks.length
    : null;
  const intervalTickVariance = intervalTickMean === null
    ? null
    : shotIntervalTicks.reduce((sum, value) => sum + (value - intervalTickMean) ** 2, 0) / shotIntervalTicks.length;
  const shotIntervalTickCv = intervalTickMean && intervalTickVariance !== null
    ? Math.sqrt(intervalTickVariance) / intervalTickMean
    : null;
  const serverTickMs = Math.max(1, Number(options.serverTickMs ?? 50));
  const coefficientOfVariation = values => {
    if (!values.length) return null;
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    if (!(mean > 0)) return null;
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
    return Math.sqrt(variance) / mean;
  };
  const movementTransitions = movementTransitionModelCore(history, { stationarySpeed });
  return {
    sampleCount,
    durationMs,
    avgRadialSpeed: sampleCount ? radialSum / sampleCount : 0,
    avgLateralSpeed: sampleCount ? lateralSum / sampleCount : 0,
    avgSpeed: sampleCount ? speedSum / sampleCount : 0,
    velocityStability,
    lateralFlips,
    stopGoSwitches,
    firingRatio: sampleCount ? firingSamples / sampleCount : 0,
    pressureRatio: sampleCount ? pressureSamples / sampleCount : 0,
    firstDistance,
    lastDistance,
    netDistanceChange,
    distanceChangeRate,
    lastLateralFlipAt,
    shotIntervals,
    shotEvents: orderedShotEvents,
    shotIntervalTicks,
    shotIntervalMeanMs: intervalMedianTicks === null ? intervalMean : intervalMedianTicks * serverTickMs,
    shotIntervalCv: burstCadence.burstIntervalCv === null ? shotIntervalCv : burstCadence.burstIntervalCv,
    overallShotIntervalCv: shotIntervalTickCv,
    overallIntervalMedianTicks: percentile(shotIntervalTicks, 0.5),
    intervalMedianTicks,
    intervalMadTicks,
    intervalP90Ticks,
    burstIntervalMedianTicks: burstCadence.burstIntervalMedianTicks,
    burstIntervalMadTicks: burstCadence.burstIntervalMadTicks,
    burstIntervalP90Ticks: burstCadence.burstIntervalP90Ticks,
    burstSampleCount: burstCadence.burstSampleCount,
    interBurstGapMedianTicks: burstCadence.interBurstGapMedianTicks,
    currentBurstIntervalCount: burstCadence.currentBurstIntervalCount,
    currentBurstShotCount: orderedShotEvents.length
      ? Math.max(1, burstCadence.currentBurstShotCount)
      : 0,
    burstConfidence: burstCadence.burstConfidence,
    burstPredictable: burstCadence.burstPredictable,
    burstSplitThresholdTicks: burstCadence.splitThresholdTicks,
    lastCreatedTick: orderedShotEvents.at(-1)?.createdTick ?? null,
    directionDwells,
    directionDwellCv: coefficientOfVariation(directionDwells),
    reactionLatencies,
    reactionLatencyCv: coefficientOfVariation(reactionLatencies),
    staminaCycleIntervals,
    staminaCycleCv: coefficientOfVariation(staminaCycleIntervals),
    movementTransitions
  };
}

function behaviorDimensionsCore(previous, classified, metrics, sample, nowMs, options = {}) {
  const previousDimensions = previous?.dimensions || {};
  const movementCandidate = classified.mode === 'pressure-shooter' ? 'erratic' : ({
    'steady-linear': 'approach',
    'retreat-kite': 'retreat',
    'charge-close': 'approach',
    'zigzag-strafe': 'zigzag',
    stationary: 'stationary'
  }[classified.mode] || 'erratic');
  const previousMovement = previousDimensions.movementIntent || null;
  const explicitReverse = (previousMovement?.state === 'retreat' && movementCandidate === 'approach')
    || (previousMovement?.state === 'approach' && movementCandidate === 'retreat');
  const movementCandidateSince = previousMovement?.candidate === movementCandidate
    ? Number(previousMovement.candidateSince || nowMs)
    : nowMs;
  const movementConfirmed = !previousMovement
    || previousMovement.state === movementCandidate
    || explicitReverse
    || nowMs - movementCandidateSince >= Math.max(3000, Number(options.movementConfirmMs || 3000));
  const movementIntent = {
    state: movementConfirmed ? movementCandidate : previousMovement.state,
    confidence: classified.confidence,
    candidate: movementConfirmed ? '' : movementCandidate,
    candidateSince: movementConfirmed ? 0 : movementCandidateSince,
    probabilities: {
      [movementCandidate]: classified.confidence,
      [movementConfirmed ? movementCandidate : previousMovement.state]: Math.max(
        Number(previousMovement?.confidence || 0),
        1 - classified.confidence
      )
    }
  };
  const previousShooting = previousDimensions.shootingPhase || null;
  const serverTickMs = Math.max(1, Number(options.serverTickMs ?? 50));
  const currentTick = numberOrNull(sample.currentTick ?? sample.tick);
  const lastCreatedTick = numberOrNull(metrics.lastCreatedTick);
  const intervalMedianTicks = numberOrNull(metrics.intervalMedianTicks);
  const intervalMadTicks = numberOrNull(metrics.intervalMadTicks);
  const intervalP90Ticks = numberOrNull(metrics.intervalP90Ticks);
  const burstPredictable = metrics.burstPredictable === undefined
    ? intervalMedianTicks !== null
    : Boolean(metrics.burstPredictable);
  const predictedCreatedTick = lastCreatedTick !== null && intervalMedianTicks !== null && burstPredictable
    ? lastCreatedTick + intervalMedianTicks
    : null;
  const commandDelayP90Ticks = Math.max(0, Number(sample.commandDelayP90Ticks ?? options.commandDelayP90Ticks ?? 5));
  const bulletSpeedCmPerTick = Math.max(1, Number(options.bulletSpeedCmPerTick ?? 500));
  const distance = sampleDistance(sample);
  const flightTicks = distance === null ? null : distance / bulletSpeedCmPerTick;
  const safetyMarginTicks = Math.max(1, Number(options.preDodgeSafetyMarginTicks ?? 2));
  const reactionNeedTicks = commandDelayP90Ticks + 1 + safetyMarginTicks;
  const uncertaintyTicks = Math.max(
    1,
    Number(intervalMadTicks || 0) * 2,
    intervalP90Ticks !== null && intervalMedianTicks !== null ? intervalP90Ticks - intervalMedianTicks : 0
  );
  const prepareLeadTicks = intervalMedianTicks === null
    ? null
    : Math.max(1, Math.min(intervalMedianTicks * 0.8, uncertaintyTicks + Math.max(1, reactionNeedTicks - Number(flightTicks || 0))));
  const nextShotInTicks = predictedCreatedTick !== null && currentTick !== null
    ? predictedCreatedTick - currentTick
    : null;
  const nextShotInMs = nextShotInTicks === null ? null : nextShotInTicks * serverTickMs;
  const newShotCount = Array.isArray(sample.newShotEvents)
    ? sample.newShotEvents.length
    : Math.max(0, Number(sample.newBulletCount || 0));
  const lastLocalShotAt = [...(previous?.samples || []), sample]
    .slice().reverse().find(item => Number(item.newBulletCount || 0) > 0)?.at || 0;
  const legacyRecentShot = lastCreatedTick === null
    && lastLocalShotAt > 0
    && Number.isFinite(Number(metrics.shotIntervalMeanMs))
    && nowMs - Number(lastLocalShotAt) <= Number(metrics.shotIntervalMeanMs) * 0.6;
  const sinceLastCreatedTicks = lastCreatedTick !== null && currentTick !== null
    ? Math.max(0, currentTick - lastCreatedTick)
    : null;
  const densityWindowTicks = intervalMedianTicks === null ? 4 : Math.max(2, Math.round(intervalMedianTicks * 0.35));
  const recentCreatedEvent = sinceLastCreatedTicks !== null && sinceLastCreatedTicks <= densityWindowTicks;
  let shootingState = 'idle';
  let shootingPhaseSource = 'no-created-tick-cadence';
  if (newShotCount > 0) {
    shootingState = 'burst';
    shootingPhaseSource = 'new-created-tick-event';
  } else if (recentCreatedEvent && (metrics.shotEvents || []).length >= 2) {
    shootingState = 'sustained';
    shootingPhaseSource = 'recent-created-tick-density';
  } else if (legacyRecentShot) {
    shootingState = 'sustained';
    shootingPhaseSource = 'local-observation-fallback';
  } else if (nextShotInTicks !== null && prepareLeadTicks !== null
    && nextShotInTicks >= -uncertaintyTicks && nextShotInTicks <= prepareLeadTicks) {
    shootingState = 'preparing';
    shootingPhaseSource = 'predicted-created-tick-window';
  } else if (sinceLastCreatedTicks !== null && intervalMedianTicks !== null
    && sinceLastCreatedTicks <= intervalMedianTicks + uncertaintyTicks) {
    shootingState = 'cooldown';
    shootingPhaseSource = 'post-created-tick-cooldown';
  } else if (['burst', 'sustained', 'preparing'].includes(previousShooting?.state)) {
    shootingState = 'cooldown';
    shootingPhaseSource = 'phase-transition-cooldown';
  }
  const shootingPhase = {
    state: shootingState,
    confidence: intervalMedianTicks === null
      ? 0.35
      : clamp(Number(metrics.burstConfidence ?? (1 - Number(metrics.shotIntervalCv ?? 0.75))), 0.35, 0.95),
    updatedAt: nowMs,
    nextShotInMs: nextShotInMs === null ? null : Math.round(nextShotInMs),
    shootingPhaseSource,
    lastCreatedTick,
    intervalMedianTicks,
    intervalMadTicks,
    intervalP90Ticks,
    burstIntervalMedianTicks: numberOrNull(metrics.burstIntervalMedianTicks),
    burstIntervalMadTicks: numberOrNull(metrics.burstIntervalMadTicks),
    burstSampleCount: Math.max(0, Number(metrics.burstSampleCount || 0)),
    interBurstGapMedianTicks: numberOrNull(metrics.interBurstGapMedianTicks),
    currentBurstIntervalCount: Math.max(0, Number(metrics.currentBurstIntervalCount || 0)),
    currentBurstShotCount: Math.max(0, Number(metrics.currentBurstShotCount || 0)),
    burstConfidence: Number(metrics.burstConfidence || 0),
    burstPredictable,
    predictedCreatedTick,
    prepareLeadTicks: prepareLeadTicks === null ? null : Math.round(prepareLeadTicks * 10) / 10,
    commandDelayP90Ticks,
    flightTicks: flightTicks === null ? null : Math.round(flightTicks * 10) / 10,
    oldBulletPressure: Boolean(sample.realBulletPressure)
  };
  const stamina = numberOrNull(sample.targetStamina5s);
  const previousStamina = numberOrNull(previous?.samples?.[Math.max(0, (previous.samples?.length || 1) - 1)]?.targetStamina5s);
  const elapsedMs = Math.max(0, nowMs - Number(previous?.lastAt || nowMs));
  const inferredUpper = stamina === null && previousDimensions.staminaPhase
    ? clamp(Number(previousDimensions.staminaPhase.upperBound ?? 10000)
      - Number(sample.newBulletCount || 0) * 500
      - (Math.hypot(Number(sample.vx || 0), Number(sample.vy || 0)) > 5 ? elapsedMs : -elapsedMs), 0, 10000)
    : stamina;
  const inferredLower = stamina === null && inferredUpper !== null
    ? Math.max(0, inferredUpper - 1000)
    : stamina;
  const staminaState = inferredUpper !== null && inferredUpper <= 1200
    ? 'exhausted-likely'
    : (stamina !== null && previousStamina !== null && stamina < previousStamina - 250
        ? 'depleting'
        : (stamina !== null && previousStamina !== null && stamina > previousStamina + 250 ? 'recovering' : 'high'));
  const staminaPhase = {
    state: staminaState,
    confidence: stamina === null ? (inferredUpper === null ? 0.25 : 0.5) : 0.8,
    lowerBound: inferredLower,
    upperBound: inferredUpper
  };
  const automationEvidenceReady = metrics.durationMs >= Math.max(8000, Number(options.controlStyleMinMs || 8000));
  const evidence = [];
  const addEvidence = (value, weight) => {
    if (Number.isFinite(Number(value))) evidence.push({ value: clamp(Number(value), 0, 1), weight });
  };
  const regularFire = ((metrics.shotIntervalTicks?.length || 0) >= 3 || (metrics.shotIntervals?.length || 0) >= 3)
    && metrics.shotIntervalCv !== null
    ? clamp(1 - metrics.shotIntervalCv, 0, 1)
    : null;
  const transitionPredictability = Number(metrics.movementTransitions?.predictability ?? 0.5);
  const dwellRegularity = metrics.directionDwells?.length >= 2 && metrics.directionDwellCv !== null
    ? clamp(1 - metrics.directionDwellCv, 0, 1)
    : null;
  const reactionRegularity = metrics.reactionLatencies?.length >= 2 && metrics.reactionLatencyCv !== null
    ? clamp(1 - metrics.reactionLatencyCv, 0, 1)
    : null;
  const staminaRegularity = metrics.staminaCycleIntervals?.length >= 2 && metrics.staminaCycleCv !== null
    ? clamp(1 - metrics.staminaCycleCv, 0, 1)
    : null;
  addEvidence(regularFire, 0.3);
  addEvidence(transitionPredictability, 0.3);
  addEvidence(dwellRegularity, 0.15);
  addEvidence(reactionRegularity, 0.15);
  addEvidence(staminaRegularity, 0.1);
  const evidenceWeight = evidence.reduce((sum, item) => sum + item.weight, 0);
  const automationLikelihood = evidenceWeight > 0
    ? clamp(evidence.reduce((sum, item) => sum + item.value * item.weight, 0) / evidenceWeight, 0, 1)
    : 0.35;
  const styleCandidate = regularFire !== null && regularFire >= 0.7 && transitionPredictability >= 0.65
    ? 'periodic-script'
    : (reactionRegularity !== null && reactionRegularity >= 0.65 && transitionPredictability >= 0.55
        ? 'reactive-script'
        : (automationLikelihood >= 0.68 ? 'reactive-script' : 'human-like'));
  const controlStyle = automationEvidenceReady
    ? {
        state: styleCandidate,
        confidence: clamp(Math.abs(automationLikelihood - 0.5) * 2 * Math.min(1, evidenceWeight / 0.6), 0.35, 0.95),
        sampleMs: metrics.durationMs,
        evidenceWeight,
        provisional: false
      }
    : {
        state: 'human-like',
        confidence: 0.25,
        sampleMs: metrics.durationMs,
        evidenceWeight,
        provisional: true
      };
  return {
    movementIntent,
    shootingPhase,
    staminaPhase,
    controlStyle,
    automationLikelihood,
    automationConfidence: controlStyle.confidence
  };
}

function classifyOpponentBehaviorCore(metrics = {}, options = {}) {
  const evidenceScale = clamp(Number(metrics.durationMs || 0) / Math.max(1, Number(options.fullConfidenceMs ?? 2500)), 0.25, 1);
  const sampleScale = clamp(Number(metrics.sampleCount || 0) / 8, 0.25, 1);
  const confidenceScale = Math.min(evidenceScale, sampleScale);
  if (metrics.avgSpeed <= Number(options.stationarySpeed ?? 5) && metrics.stopGoSwitches <= 1) {
    return { mode: 'stationary', confidence: clamp((0.75 - metrics.avgSpeed / 20) * confidenceScale + 0.2, 0, 1), reason: 'low-speed' };
  }
  const retreatSpeed = Number(options.retreatRadialSpeed ?? 12);
  const distanceRate = Number(options.retreatDistanceRate ?? 8);
  if (metrics.avgRadialSpeed >= retreatSpeed && metrics.distanceChangeRate >= distanceRate) {
    return { mode: 'retreat-kite', confidence: clamp((0.55 + Math.min(0.35, metrics.avgRadialSpeed / 100)) * confidenceScale + 0.1, 0, 1), reason: 'sustained-distance-growth' };
  }
  if (metrics.lateralFlips >= 2 && metrics.avgLateralSpeed >= Number(options.strafeLateralSpeed ?? 10)) {
    return { mode: 'zigzag-strafe', confidence: clamp((0.55 + Math.min(0.35, metrics.lateralFlips * 0.08)) * confidenceScale + 0.1, 0, 1), reason: 'repeated-lateral-flips' };
  }
  if (metrics.avgRadialSpeed <= -retreatSpeed && metrics.distanceChangeRate <= -distanceRate) {
    return { mode: 'charge-close', confidence: clamp((0.55 + Math.min(0.35, Math.abs(metrics.avgRadialSpeed) / 100)) * confidenceScale + 0.1, 0, 1), reason: 'sustained-distance-closing' };
  }
  if (metrics.pressureRatio >= 0.45) {
    return { mode: 'pressure-shooter', confidence: clamp(0.55 + metrics.pressureRatio * 0.4, 0, 1), reason: 'sustained-fire-or-bullets' };
  }
  if (metrics.avgSpeed > Number(options.stationarySpeed ?? 5) && metrics.velocityStability >= 0.78 && metrics.stopGoSwitches <= 2) {
    return { mode: 'steady-linear', confidence: clamp((0.55 + metrics.velocityStability * 0.35) * confidenceScale + 0.1, 0, 1), reason: 'stable-velocity' };
  }
  return { mode: 'mixed/unknown', confidence: clamp(0.25 + confidenceScale * 0.35, 0, 0.65), reason: 'mixed-motion' };
}

function opponentResponsePolicyCore(mode, context = {}) {
  const distance = Number(context.distance);
  const hitRate = numberOrNull(context.hitRate);
  const targetPressure = Boolean(context.targetPressure);
  const sinceFlipMs = Number(context.lastLateralFlipAt || 0) > 0
    ? Math.max(0, Number(context.nowMs || Date.now()) - Number(context.lastLateralFlipAt))
    : Infinity;
  const staminaUpperBound = numberOrNull(context.staminaUpperBound);
  const movementIntent = String(context.movementIntent || '');
  const shootingPhase = String(context.shootingPhase || '');
  const combinedPressure = ['burst', 'sustained', 'preparing'].includes(shootingPhase);
  const combinedRetreat = mode === 'retreat-kite'
    || movementIntent === 'retreat'
    || (movementIntent === 'zigzag' && Number(context.distanceChangeRate || 0) > Number(context.combinedRetreatRate ?? 4));
  const combinedZigzag = mode === 'zigzag-strafe'
    || movementIntent === 'zigzag'
    || Number(context.lateralFlips || 0) >= 2;
  if (staminaUpperBound !== null
    && staminaUpperBound <= Number(context.exhaustedUpperBound ?? 1200)
    && context.noThreateningBullets === true) {
    return {
      name: 'opponent-exhausted-window',
      closeIn: true,
      aimLeadScale: 0.9,
      suppressFire: false,
      minimumCadenceMs: 0,
      maximumCadenceMs: Math.max(120, Number(context.exhaustedCadenceMs ?? 160)),
      reassessProfit: false,
      reason: 'opponent-exhausted-window',
      staminaUpperBound
    };
  }
  if (combinedPressure && combinedRetreat && combinedZigzag) {
    const inefficient = hitRate !== null && hitRate < Number(context.minHitRate ?? 0.12);
    const edge = Number.isFinite(distance) && distance > Number(context.edgeRangeCm ?? 10500);
    return {
      name: 'zigzag-retreat-pressure',
      closeIn: true,
      aimLeadScale: 0.9,
      suppressFire: Boolean((edge || inefficient) && !targetPressure),
      minimumCadenceMs: edge || inefficient ? (targetPressure ? 800 : 0) : 160,
      reassessProfit: Number(context.noProgressMs || 0) >= Number(context.reassessMs ?? 8000),
      preferredMinDistanceCm: 4500,
      preferredMaxDistanceCm: 10500,
      reason: edge
        ? 'zigzag-retreat-pressure-edge-close'
        : (inefficient ? 'zigzag-retreat-pressure-low-hit-close' : 'zigzag-retreat-pressure-track')
    };
  }
  if (mode === 'retreat-kite') {
    const inefficient = hitRate !== null && hitRate < Number(context.minHitRate ?? 0.12);
    const far = Number.isFinite(distance) && distance > Number(context.fireRangeCm ?? 7500);
    return {
      name: 'retreat-kite-close-first',
      closeIn: true,
      aimLeadScale: 1,
      suppressFire: Boolean((far || inefficient) && !targetPressure),
      minimumCadenceMs: (far || inefficient) && targetPressure ? 800 : 0,
      reassessProfit: Number(context.noProgressMs || 0) >= Number(context.reassessMs ?? 10000),
      reason: far ? 'retreat-kite-distance' : (inefficient ? 'retreat-kite-low-hit-rate' : 'retreat-kite-track')
    };
  }
  if (mode === 'zigzag-strafe') {
    const burstWindow = sinceFlipMs >= 100 && sinceFlipMs <= 800;
    const inefficient = hitRate !== null && hitRate < Number(context.minHitRate ?? 0.12);
    return {
      name: 'zigzag-flip-burst',
      closeIn: false,
      aimLeadScale: 1,
      suppressFire: false,
      minimumCadenceMs: inefficient ? (burstWindow ? 160 : 520) : 0,
      burstWindow,
      reason: inefficient
        ? (burstWindow ? 'post-flip-stable-window' : 'wait-for-lateral-flip')
        : 'zigzag-hit-rate-acceptable'
    };
  }
  if (mode === 'stationary') {
    return { name: 'stationary-exact', closeIn: false, aimLeadScale: 0, suppressFire: false, minimumCadenceMs: 0, reason: 'exact-position' };
  }
  if (mode === 'charge-close') {
    return { name: 'charge-low-lead-spacing', closeIn: false, aimLeadScale: 0.35, suppressFire: false, minimumCadenceMs: 0, reason: 'closing-target-low-lead' };
  }
  if (mode === 'steady-linear') {
    return { name: 'steady-quadratic-intercept', closeIn: false, aimLeadScale: 1, suppressFire: false, minimumCadenceMs: 0, reason: 'stable-linear-motion' };
  }
  if (mode === 'pressure-shooter') {
    return { name: 'pressure-dodge-intercept', closeIn: false, aimLeadScale: 0.88, suppressFire: false, minimumCadenceMs: 0, reason: 'latency-adjusted-pressure-response' };
  }
  return { name: 'mixed-baseline', closeIn: false, aimLeadScale: 1, suppressFire: false, minimumCadenceMs: 0, reason: 'insufficient-mode-confidence' };
}

function updateOpponentBehaviorStateCore(previous = null, sample = {}, options = {}) {
  const nowMs = Number.isFinite(Number(sample.at ?? options.nowMs)) ? Number(sample.at ?? options.nowMs) : Date.now();
  const resetGapMs = Math.max(2000, Number(options.resetGapMs ?? 15000));
  const prior = previous && nowMs - Number(previous.lastAt || 0) <= resetGapMs ? previous : null;
  const windowMs = Math.max(2000, Number(options.windowMs ?? 12000));
  const samples = [...(Array.isArray(prior?.samples) ? prior.samples : []), { ...sample, at: nowMs }]
    .filter(item => nowMs - Number(item.at || 0) <= windowMs)
    .slice(-80);
  const metrics = opponentBehaviorMetricsCore(samples, { ...options, nowMs, windowMs });
  const classified = classifyOpponentBehaviorCore(metrics, options);
  const dimensions = behaviorDimensionsCore(prior, classified, metrics, sample, nowMs, options);
  const currentMode = OPPONENT_BEHAVIOR_MODES.includes(String(prior?.mode)) ? String(prior.mode) : 'mixed/unknown';
  let mode = currentMode;
  let since = Number(prior?.since || nowMs);
  let candidateMode = '';
  let candidateSince = 0;
  let transitionReason = 'mode-maintained';
  if (classified.mode !== currentMode) {
    candidateMode = classified.mode;
    candidateSince = prior?.candidateMode === classified.mode ? Number(prior.candidateSince || nowMs) : nowMs;
    const confirmMs = currentMode === 'mixed/unknown'
      ? Math.max(600, Number(options.enterConfirmMs ?? 800))
      : Math.max(800, Number(options.exitConfirmMs ?? 1100));
    if (nowMs - candidateSince >= confirmMs) {
      mode = classified.mode;
      since = nowMs;
      candidateMode = '';
      candidateSince = 0;
      transitionReason = `${currentMode}->${mode}:${classified.reason}`;
    } else {
      transitionReason = `candidate:${classified.mode}:${classified.reason}`;
    }
  }
  metrics.movementTransitions = movementTransitionModelCore(samples, {
    ...options,
    mode
  });
  metrics.movementPhase = metrics.movementTransitions.phase;
  let progressAt = Number(prior?.progressAt || since || nowMs);
  let progressDistance = numberOrNull(prior?.progressDistance);
  const distance = sampleDistance(sample);
  if (mode !== 'retreat-kite') {
    progressAt = nowMs;
    progressDistance = distance;
  } else if (progressDistance === null || (distance !== null && distance <= progressDistance - Number(options.progressResetCm ?? 500))) {
    progressAt = nowMs;
    progressDistance = distance;
  }
  const noProgressMs = mode === 'retreat-kite' ? Math.max(0, nowMs - progressAt) : 0;
  const responsePolicy = opponentResponsePolicyCore(mode, {
    ...options,
    distance,
    hitRate: sample.hitRate,
    targetPressure: sample.realBulletPressure || sample.firing,
    noThreateningBullets: sample.hasThreateningBullet === false
      || (!sample.realBulletPressure && Number(sample.newBulletCount || 0) <= 0),
    staminaUpperBound: dimensions.staminaPhase?.upperBound,
    movementIntent: dimensions.movementIntent?.state,
    shootingPhase: dimensions.shootingPhase?.state,
    distanceChangeRate: metrics.distanceChangeRate,
    lateralFlips: metrics.lateralFlips,
    lastLateralFlipAt: metrics.lastLateralFlipAt || prior?.lastLateralFlipAt,
    noProgressMs,
    nowMs
  });
  return {
    mode,
    confidence: mode === classified.mode ? classified.confidence : Number(prior?.confidence || classified.confidence),
    since,
    candidateMode,
    candidateSince,
    candidateConfidence: candidateMode ? classified.confidence : null,
    transitionReason,
    responsePolicy,
    metrics,
    samples,
    lastAt: nowMs,
    lastLateralFlipAt: metrics.lastLateralFlipAt || Number(prior?.lastLateralFlipAt || 0),
    progressAt,
    progressDistance,
    noProgressMs,
    dimensions: {
      movementIntent: dimensions.movementIntent,
      shootingPhase: dimensions.shootingPhase,
      staminaPhase: dimensions.staminaPhase,
      controlStyle: dimensions.controlStyle
    },
    automationLikelihood: dimensions.automationLikelihood,
    automationConfidence: dimensions.automationConfidence
  };
}

module.exports = {
  MOVEMENT_DIRECTION_STATES,
  OPPONENT_BEHAVIOR_MODES,
  behaviorDistanceBand,
  behaviorDimensionsCore,
  behaviorLearningBaseKey,
  behaviorLearningKey,
  burstCadenceMetricsCore,
  classifyOpponentBehaviorCore,
  movementDirectionState,
  movementDirectionVector,
  movementActionPhaseCore,
  movementDwellBand,
  movementRouteContextKeyCore,
  movementSpeedBand,
  movementTransitionModelCore,
  opponentBehaviorMetricsCore,
  opponentResponsePolicyCore,
  updateOpponentBehaviorStateCore
};
