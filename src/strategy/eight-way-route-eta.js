'use strict';

// Estimate the route produced by the browserless movement command, which is
// quantized to the eight cardinal/diagonal directions.
function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function estimateEightWayRouteCore(from = {}, to = {}, options = {}) {
  const sx = numberOrNull(from.x);
  const sy = numberOrNull(from.y);
  const tx = numberOrNull(to.x);
  const ty = numberOrNull(to.y);
  const requestedRadius = Math.max(0, Number(options.arrivalRadiusCm ?? 0) || 0);
  const axisSpeed = Math.max(1, Number(options.axisSpeedCmPerSec ?? 950) || 950);
  const diagonalSpeed = Math.max(1, Number(options.diagonalSpeedCmPerSec ?? 940) || 940);
  const segmentOverheadMs = Math.max(0, Number(options.segmentOverheadMs ?? 0) || 0);
  if ([sx, sy, tx, ty].some(value => value === null)) {
    const distance = numberOrNull(options.distanceCm ?? from.distance ?? to.distance);
    if (distance === null) return { ok: false, reason: 'missing-position', etaMs: null };
    const remaining = Math.max(0, distance - requestedRadius);
    return {
      ok: true,
      source: 'distance-fallback',
      distanceCm: Math.round(distance),
      routeDistanceCm: Math.round(remaining),
      diagonalDistanceCm: 0,
      cardinalDistanceCm: Math.round(remaining),
      segmentCount: remaining > 0 ? 1 : 0,
      etaMs: Math.round(remaining * 1000 / axisSpeed)
    };
  }

  const rawDx = tx - sx;
  const rawDy = ty - sy;
  const distance = Math.hypot(rawDx, rawDy);
  const remaining = Math.max(0, distance - requestedRadius);
  if (!(remaining > 0)) {
    return {
      ok: true,
      source: 'eight-way',
      distanceCm: Math.round(distance),
      routeDistanceCm: 0,
      diagonalDistanceCm: 0,
      cardinalDistanceCm: 0,
      segmentCount: 0,
      etaMs: 0
    };
  }

  // Scale the endpoint back to the arrival circle, then decompose the route
  // into diagonal and cardinal portions exactly as the quantized controller
  // does when it changes between {-1,0,1} direction pairs.
  const scale = remaining / distance;
  const dx = Math.abs(rawDx * scale);
  const dy = Math.abs(rawDy * scale);
  const diagonalDistanceCm = Math.min(dx, dy) * Math.SQRT2;
  const cardinalDistanceCm = Math.max(dx, dy) - Math.min(dx, dy);
  const diagonalComponent = Math.min(dx, dy);
  const cardinalComponent = Math.max(dx, dy) - diagonalComponent;
  const segmentCount = (diagonalComponent > 0 ? 1 : 0) + (cardinalComponent > 0 ? 1 : 0);
  const etaMs = diagonalDistanceCm * 1000 / diagonalSpeed
    + cardinalDistanceCm * 1000 / axisSpeed
    + Math.max(0, segmentCount - 1) * segmentOverheadMs;
  return {
    ok: true,
    source: 'eight-way',
    distanceCm: Math.round(distance),
    routeDistanceCm: Math.round(diagonalDistanceCm + cardinalDistanceCm),
    diagonalDistanceCm: Math.round(diagonalDistanceCm),
    cardinalDistanceCm: Math.round(cardinalDistanceCm),
    segmentCount,
    etaMs: Math.max(0, Math.round(etaMs))
  };
}

function estimateEightWayRouteEtaCore(from, to, options = {}) {
  return estimateEightWayRouteCore(from, to, options).etaMs;
}

module.exports = {
  estimateEightWayRouteCore,
  estimateEightWayRouteEtaCore
};
