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

function behaviorDistanceBand(distance) {
  const value = Number(distance);
  if (!Number.isFinite(value)) return 'unknown';
  if (value < 4500) return 'close';
  if (value < 7500) return 'preferred';
  if (value < 10500) return 'far';
  return 'edge';
}

function behaviorLearningKey(mode, distance) {
  return `${OPPONENT_BEHAVIOR_MODES.includes(String(mode)) ? String(mode) : 'mixed/unknown'}:${behaviorDistanceBand(distance)}`;
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

function opponentBehaviorMetricsCore(samples = [], options = {}) {
  const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  const windowMs = Math.max(2000, Number(options.windowMs ?? 5000));
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
    lastLateralFlipAt
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
    return { name: 'pressure-dodge-intercept', closeIn: false, aimLeadScale: 1, suppressFire: false, minimumCadenceMs: 0, reason: 'preserve-pressure-response' };
  }
  return { name: 'mixed-baseline', closeIn: false, aimLeadScale: 1, suppressFire: false, minimumCadenceMs: 0, reason: 'insufficient-mode-confidence' };
}

function updateOpponentBehaviorStateCore(previous = null, sample = {}, options = {}) {
  const nowMs = Number.isFinite(Number(sample.at ?? options.nowMs)) ? Number(sample.at ?? options.nowMs) : Date.now();
  const resetGapMs = Math.max(2000, Number(options.resetGapMs ?? 15000));
  const prior = previous && nowMs - Number(previous.lastAt || 0) <= resetGapMs ? previous : null;
  const windowMs = Math.max(2000, Number(options.windowMs ?? 5000));
  const samples = [...(Array.isArray(prior?.samples) ? prior.samples : []), { ...sample, at: nowMs }]
    .filter(item => nowMs - Number(item.at || 0) <= windowMs)
    .slice(-80);
  const metrics = opponentBehaviorMetricsCore(samples, { ...options, nowMs, windowMs });
  const classified = classifyOpponentBehaviorCore(metrics, options);
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
    noProgressMs
  };
}

module.exports = {
  OPPONENT_BEHAVIOR_MODES,
  behaviorDistanceBand,
  behaviorLearningKey,
  classifyOpponentBehaviorCore,
  opponentBehaviorMetricsCore,
  opponentResponsePolicyCore,
  updateOpponentBehaviorStateCore
};
