'use strict';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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
  const renderDelayTicks = Math.max(0, Number(options.renderDelayTicks ?? 2));
  const compensatedX = px + vx * renderDelayTicks;
  const compensatedY = py + vy * renderDelayTicks;
  const dx = compensatedX - sx;
  const dy = compensatedY - sy;
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
  const travelDistance = Math.hypot(x - sx, y - sy);
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
    renderDelayTicks,
    targetSpeed,
    confidence: clamp(0.62 + timeFactor * 0.25 - speedPenalty - motionPenalty, 0.25, 1)
  };
}

module.exports = { opponentMotionProfileCore, quadraticInterceptCore };
