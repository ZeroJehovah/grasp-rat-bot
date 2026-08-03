'use strict';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

const DEFAULT_BULLET_SPEED_CM_PER_TICK = 500;
const DEFAULT_BULLET_RANGE_CM = 15000;
const DEFAULT_BULLET_LIFETIME_TICKS = 30;
const DEFAULT_HIT_RADIUS_CM = 90;
const DEFAULT_CREATION_DELAY_TICKS = 5;
const DEFAULT_MAX_STATE_AGE_MS = 500;
const DEFAULT_MAX_CREATION_WINDOW_TICKS = 4;

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function creationDelayWindowCore(options = {}) {
  const fallback = Math.max(0, Number(
    options.creationDelayTicks
      ?? options.observationToExecutionTicks
      ?? options.renderDelayTicks
      ?? DEFAULT_CREATION_DELAY_TICKS
  ));
  const minimum = Math.max(0, Number(
    options.creationDelayMinTicks
      ?? options.creationDelayTicks
      ?? options.observationToExecutionTicks
      ?? fallback
  ));
  const maximum = Math.max(minimum, Number(
    options.creationDelayMaxTicks
      ?? options.creationDelayTicks
      ?? options.observationToExecutionTicks
      ?? fallback
  ));
  const width = maximum - minimum;
  const configuredSelected = finiteOrNull(options.selectedCreationDelayTicks);
  return {
    minTicks: minimum,
    maxTicks: maximum,
    widthTicks: width,
    selectedTicks: configuredSelected === null
      ? (minimum + maximum) / 2
      : clamp(configuredSelected, minimum, maximum),
    unstable: options.creationWindowUnstable === true
      || width > Math.max(0, Number(options.maxCreationWindowTicks ?? DEFAULT_MAX_CREATION_WINDOW_TICKS))
  };
}

function realtimeStateAgeCore(self, target, options = {}) {
  const explicitAge = finiteOrNull(options.realtimeStateAgeMs ?? options.observationAgeMs);
  if (explicitAge !== null) return Math.max(0, explicitAge);
  const nowMs = finiteOrNull(options.nowMs);
  const observedAt = finiteOrNull(
    options.realtimeStateObservedAtMs
      ?? options.observedAtMs
      ?? target?.receivedAtMs
      ?? self?.receivedAtMs
  );
  if (nowMs === null || observedAt === null) return null;
  return Math.max(0, nowMs - observedAt);
}

function solveInterceptAtCreationCore(self, target, options = {}) {
  const sx = finiteOrNull(self?.x);
  const sy = finiteOrNull(self?.y);
  const tx = finiteOrNull(target?.x);
  const ty = finiteOrNull(target?.y);
  const targetVx = finiteOrNull(target?.vx) ?? 0;
  const targetVy = finiteOrNull(target?.vy) ?? 0;
  const shooterVx = finiteOrNull(options.shooterVelocity?.vx ?? self?.vx) ?? 0;
  const shooterVy = finiteOrNull(options.shooterVelocity?.vy ?? self?.vy) ?? 0;
  const bulletSpeed = Math.max(1, Number(options.bulletSpeedCmPerTick ?? options.bulletSpeed ?? DEFAULT_BULLET_SPEED_CM_PER_TICK));
  const bulletRange = Math.max(1, Number(options.bulletRangeCm ?? options.bulletRange ?? DEFAULT_BULLET_RANGE_CM));
  const hitRadius = Math.max(0, Number(options.hitRadiusCm ?? options.hitRadius ?? DEFAULT_HIT_RADIUS_CM));
  const lifetimeTicks = Math.max(1, Number(
    options.bulletLifetimeTicks ?? options.maxTicks ?? Math.min(DEFAULT_BULLET_LIFETIME_TICKS, bulletRange / bulletSpeed)
  ));
  const stateAgeMs = realtimeStateAgeCore(self, target, options);
  const maxStateAgeMs = Math.max(0, Number(options.maxRealtimeStateAgeMs ?? DEFAULT_MAX_STATE_AGE_MS));
  const creationWindow = creationDelayWindowCore(options);
  const base = {
    reachable: false,
    reason: 'invalid-geometry',
    creationDelayWindowTicks: {
      min: creationWindow.minTicks,
      max: creationWindow.maxTicks,
      width: creationWindow.widthTicks
    },
    observationAgeMs: stateAgeMs,
    bulletSpeedCmPerTick: bulletSpeed,
    bulletRangeCm: bulletRange,
    bulletLifetimeTicks: lifetimeTicks,
    hitRadiusCm: hitRadius,
    predictedShooterOrigin: null,
    predictedTargetAtCreation: null,
    interceptTicks: null,
    interceptRangeCm: null,
    interceptPoint: null,
    rangeGapCm: null
  };
  if (target?.authority && String(target.authority) !== 'realtime') {
    return { ...base, reason: 'stale-realtime-state' };
  }
  if (stateAgeMs !== null && stateAgeMs > maxStateAgeMs) {
    return { ...base, reason: 'stale-realtime-state' };
  }
  if (![sx, sy, tx, ty, targetVx, targetVy, shooterVx, shooterVy].every(Number.isFinite)) return base;
  const targetCreationWindowDisplacementCm = Math.hypot(targetVx, targetVy) * creationWindow.widthTicks;
  if (creationWindow.unstable && targetCreationWindowDisplacementCm > hitRadius + 1e-6) {
    return {
      ...base,
      reason: 'creation-window-unstable',
      targetCreationWindowDisplacementCm
    };
  }

  const delayTicks = creationWindow.selectedTicks;
  const shooterOrigin = {
    x: sx + shooterVx * delayTicks,
    y: sy + shooterVy * delayTicks,
    vx: shooterVx,
    vy: shooterVy
  };
  const targetAtCreation = {
    x: tx + targetVx * delayTicks,
    y: ty + targetVy * delayTicks,
    vx: targetVx,
    vy: targetVy
  };
  const dx = targetAtCreation.x - shooterOrigin.x;
  const dy = targetAtCreation.y - shooterOrigin.y;
  const c = dx * dx + dy * dy;
  const resultBase = {
    ...base,
    predictedShooterOrigin: shooterOrigin,
    predictedTargetAtCreation: targetAtCreation,
    targetCreationWindowDisplacementCm
  };
  if (!(c > 0)) return { ...resultBase, reason: 'invalid-geometry' };

  const a = targetVx * targetVx + targetVy * targetVy - bulletSpeed * bulletSpeed;
  const b = 2 * (dx * targetVx + dy * targetVy);
  const roots = [];
  if (Math.abs(a) < 1e-6) {
    if (Math.abs(b) > 1e-6) roots.push(-c / b);
  } else {
    const discriminant = b * b - 4 * a * c;
    if (discriminant >= -1e-6) {
      const root = Math.sqrt(Math.max(0, discriminant));
      roots.push((-b - root) / (2 * a), (-b + root) / (2 * a));
    }
  }
  const positiveRoots = roots.filter(root => Number.isFinite(root) && root > 0).sort((left, right) => left - right);
  if (!positiveRoots.length) return { ...resultBase, reason: 'no-positive-intercept' };
  const flightTicks = positiveRoots[0];
  const interceptPoint = {
    x: targetAtCreation.x + targetVx * flightTicks,
    y: targetAtCreation.y + targetVy * flightTicks
  };
  const interceptRangeCm = Math.hypot(interceptPoint.x - shooterOrigin.x, interceptPoint.y - shooterOrigin.y);
  const rangeGapCm = Math.max(0, interceptRangeCm - bulletRange - hitRadius);
  if (rangeGapCm > 1e-6) {
    return {
      ...resultBase,
      reason: 'intercept-beyond-bullet-range',
      interceptTicks: flightTicks,
      interceptRangeCm,
      interceptPoint,
      rangeGapCm
    };
  }
  if (flightTicks > lifetimeTicks + 1e-6) {
    const edgeTarget = {
      x: targetAtCreation.x + targetVx * lifetimeTicks,
      y: targetAtCreation.y + targetVy * lifetimeTicks
    };
    const edgeRangeCm = Math.hypot(edgeTarget.x - shooterOrigin.x, edgeTarget.y - shooterOrigin.y);
    const edgeToleranceCm = Math.abs(edgeRangeCm - bulletSpeed * lifetimeTicks);
    if (edgeToleranceCm <= hitRadius + 1e-6 && edgeRangeCm <= bulletRange + hitRadius + 1e-6) {
      return {
        ...resultBase,
        reachable: true,
        reason: 'reachable',
        interceptTicks: lifetimeTicks,
        interceptRangeCm: bulletSpeed * lifetimeTicks,
        interceptPoint: edgeTarget,
        rangeGapCm: 0,
        edgeToleranceCm
      };
    }
    return {
      ...resultBase,
      reason: 'intercept-after-lifetime',
      interceptTicks: flightTicks,
      interceptRangeCm,
      interceptPoint,
      rangeGapCm
    };
  }
  return {
    ...resultBase,
    reachable: true,
    reason: 'reachable',
    interceptTicks: flightTicks,
    interceptRangeCm,
    interceptPoint,
    rangeGapCm: 0
  };
}

function evaluateAimPointReachabilityCore(origin, point, options = {}) {
  const ox = finiteOrNull(origin?.x);
  const oy = finiteOrNull(origin?.y);
  const px = finiteOrNull(point?.x);
  const py = finiteOrNull(point?.y);
  const bulletSpeed = Math.max(1, Number(options.bulletSpeedCmPerTick ?? options.bulletSpeed ?? DEFAULT_BULLET_SPEED_CM_PER_TICK));
  const bulletRange = Math.max(1, Number(options.bulletRangeCm ?? options.bulletRange ?? DEFAULT_BULLET_RANGE_CM));
  const hitRadius = Math.max(0, Number(options.hitRadiusCm ?? options.hitRadius ?? DEFAULT_HIT_RADIUS_CM));
  const lifetimeTicks = Math.max(1, Number(options.bulletLifetimeTicks ?? options.maxTicks ?? bulletRange / bulletSpeed));
  if (![ox, oy, px, py].every(Number.isFinite)) return { reachable: false, reason: 'invalid-geometry' };
  const distanceCm = Math.hypot(px - ox, py - oy);
  const flightTicks = distanceCm / bulletSpeed;
  if (distanceCm > bulletRange + hitRadius + 1e-6) {
    return { reachable: false, reason: 'intercept-beyond-bullet-range', distanceCm, flightTicks, rangeGapCm: distanceCm - bulletRange - hitRadius };
  }
  if (flightTicks > lifetimeTicks + 1e-6) {
    const edgeToleranceCm = Math.abs(distanceCm - bulletSpeed * lifetimeTicks);
    if (edgeToleranceCm <= hitRadius + 1e-6 && distanceCm <= bulletRange + hitRadius + 1e-6) {
      return {
        reachable: true,
        reason: 'reachable',
        distanceCm,
        flightTicks: lifetimeTicks,
        rangeGapCm: 0,
        edgeToleranceCm
      };
    }
    return { reachable: false, reason: 'intercept-after-lifetime', distanceCm, flightTicks, rangeGapCm: Math.max(0, distanceCm - bulletRange - hitRadius) };
  }
  return { reachable: true, reason: 'reachable', distanceCm, flightTicks, rangeGapCm: 0 };
}

function opponentMotionProfileCore(self, target, samples = [], options = {}) {
  const threshold = Math.max(1, Number(options.stationarySpeed || 5));
  const history = (samples || []).filter(Boolean).slice(-80);
  let lateralFlips = 0;
  let previousLateralSign = 0;
  let radialSum = 0;
  let speedSum = 0;
  let dotSum = 0;
  let dotCount = 0;
  for (const sample of history) {
    const dx = Number(sample.x) - Number(self?.x || 0);
    const dy = Number(sample.y) - Number(self?.y || 0);
    const distance = Math.max(1, Math.hypot(dx, dy));
    const vx = Number(sample.vx) || 0;
    const vy = Number(sample.vy) || 0;
    const lateral = dx / distance * vy - dy / distance * vx;
    const lateralSign = Math.abs(lateral) >= threshold ? Math.sign(lateral) : 0;
    if (lateralSign && previousLateralSign && lateralSign !== previousLateralSign) lateralFlips += 1;
    if (lateralSign) previousLateralSign = lateralSign;
    radialSum += dx / distance * vx + dy / distance * vy;
    speedSum += Math.hypot(vx, vy);
  }
  for (let index = 1; index < history.length; index += 1) {
    const previous = history[index - 1];
    const current = history[index];
    const previousSpeed = Math.hypot(Number(previous.vx) || 0, Number(previous.vy) || 0);
    const currentSpeed = Math.hypot(Number(current.vx) || 0, Number(current.vy) || 0);
    if (previousSpeed >= threshold && currentSpeed >= threshold) {
      dotSum += ((Number(previous.vx) || 0) * (Number(current.vx) || 0)
        + (Number(previous.vy) || 0) * (Number(current.vy) || 0)) / (previousSpeed * currentSpeed);
      dotCount += 1;
    }
  }
  const durationMs = history.length >= 2
    ? Math.max(0, Number(history[history.length - 1].at) - Number(history[0].at))
    : 0;
  const velocityStability = dotCount ? clamp((dotSum / dotCount + 1) / 2, 0, 1) : 0.5;
  const avgRadialSpeed = history.length ? radialSum / history.length : 0;
  const avgSpeed = history.length ? speedSum / history.length : Math.hypot(Number(target?.vx) || 0, Number(target?.vy) || 0);
  const strafePattern = history.length >= 4 && lateralFlips >= 2 && durationMs >= 600;
  const maneuverScale = clamp((1 - velocityStability) * 0.7 + Math.min(1, lateralFlips / 3) * 0.45, 0, 1);
  return {
    sampleCount: history.length,
    durationMs,
    lateralFlips,
    velocityStability,
    avgRadialSpeed,
    avgSpeed,
    strafePattern,
    maneuverScale,
    aimConfidenceScale: clamp(1.08 - maneuverScale * 0.45, 0.55, 1.08)
  };
}

function quadraticInterceptCore(self, target, options = {}) {
  const sx = Number(self?.x);
  const sy = Number(self?.y);
  const px = Number(target?.x);
  const py = Number(target?.y);
  const vx = Number(target?.vx) || 0;
  const vy = Number(target?.vy) || 0;
  if (![sx, sy, px, py].every(Number.isFinite)) return null;
  const bulletSpeed = Math.max(1, Number(options.bulletSpeed || 500));
  const observationToExecutionTicks = Math.max(0, Number(
    options.observationToExecutionTicks ?? options.renderDelayTicks ?? 5
  ));
  const predictShooterOrigin = options.predictShooterOrigin === true;
  const shooterVelocity = options.shooterVelocity && typeof options.shooterVelocity === 'object'
    ? options.shooterVelocity
    : self;
  const shooterVx = predictShooterOrigin ? (Number(shooterVelocity?.vx) || 0) : 0;
  const shooterVy = predictShooterOrigin ? (Number(shooterVelocity?.vy) || 0) : 0;
  const createdShooterX = sx + shooterVx * observationToExecutionTicks;
  const createdShooterY = sy + shooterVy * observationToExecutionTicks;
  const compensatedX = px + vx * observationToExecutionTicks;
  const compensatedY = py + vy * observationToExecutionTicks;
  const dx = compensatedX - createdShooterX;
  const dy = compensatedY - createdShooterY;
  const c = dx * dx + dy * dy;
  if (!(c > 0)) return null;
  const a = vx * vx + vy * vy - bulletSpeed * bulletSpeed;
  const b = 2 * (dx * vx + dy * vy);
  const roots = [];
  if (Math.abs(a) < 1e-6) {
    if (Math.abs(b) > 1e-6) roots.push(-c / b);
  } else {
    const discriminant = b * b - 4 * a * c;
    if (discriminant < -1e-6) return null;
    const root = Math.sqrt(Math.max(0, discriminant));
    roots.push((-b - root) / (2 * a), (-b + root) / (2 * a));
  }
  const bulletRange = Math.max(1, Number(options.bulletRange || 15000));
  const maxByRange = bulletRange / bulletSpeed;
  const configuredMax = Number(options.maxTicks || 0);
  const maxTicks = Math.max(1, configuredMax > 0 ? Math.min(configuredMax, maxByRange) : maxByRange);
  const flightTicks = roots.filter(value => Number.isFinite(value) && value > 0 && value <= maxTicks).sort((aTick, bTick) => aTick - bTick)[0];
  if (!Number.isFinite(flightTicks)) return null;
  const x = compensatedX + vx * flightTicks;
  const y = compensatedY + vy * flightTicks;
  const travelDistance = Math.hypot(x - createdShooterX, y - createdShooterY);
  if (travelDistance > bulletRange + Math.max(0, Number(options.hitRadius || 90))) return null;
  const targetSpeed = Math.hypot(vx, vy);
  const maxTargetSpeed = Math.max(1, Number(options.maxTargetSpeed || 50));
  const timeFactor = 1 - Math.min(1, flightTicks / maxTicks) * 0.35;
  const speedPenalty = Math.max(0, targetSpeed / maxTargetSpeed - 1) * 0.2;
  const motionPenalty = clamp(Number(options.motionScale || 0), 0, 1) * 0.08;
  return {
    x,
    y,
    flightTicks,
    flightMs: flightTicks * 50,
    travelDistance,
    leadDistance: Math.hypot(x - px, y - py),
    observationToExecutionTicks,
    renderDelayTicks: observationToExecutionTicks,
    predictedShooterOrigin: {
      x: createdShooterX,
      y: createdShooterY,
      vx: shooterVx,
      vy: shooterVy,
      confidence: predictShooterOrigin ? clamp(Number(options.shooterOriginConfidence ?? 1), 0, 1) : 0,
      source: predictShooterOrigin ? String(options.shooterOriginSource || 'realtime-velocity') : 'current-position'
    },
    predictedTargetAtCreation: {
      x: compensatedX,
      y: compensatedY,
      vx,
      vy
    },
    relativeExecutionDisplacement: {
      x: (vx - shooterVx) * observationToExecutionTicks,
      y: (vy - shooterVy) * observationToExecutionTicks
    },
    targetSpeed,
    confidence: clamp(0.62 + timeFactor * 0.25 - speedPenalty - motionPenalty, 0.25, 1)
  };
}

module.exports = {
  creationDelayWindowCore,
  evaluateAimPointReachabilityCore,
  opponentMotionProfileCore,
  quadraticInterceptCore,
  realtimeStateAgeCore,
  solveInterceptAtCreationCore
};
