'use strict';

function defaultDist(a, b) {
  const dx = Number(a?.x) - Number(b?.x);
  const dy = Number(a?.y) - Number(b?.y);
  return Number.isFinite(dx) && Number.isFinite(dy) ? Math.hypot(dx, dy) : Infinity;
}

function defaultDirectionTo(a, b, tolerance = 0) {
  const dx = Number(b?.x) - Number(a?.x);
  const dy = Number(b?.y) - Number(a?.y);
  const distance = Number.isFinite(dx) && Number.isFinite(dy) ? Math.hypot(dx, dy) : Infinity;
  const limit = Math.max(0, Number(tolerance || 0));
  return {
    dx: Math.abs(dx) > limit ? Math.sign(dx) : 0,
    dy: Math.abs(dy) > limit ? Math.sign(dy) : 0,
    distance
  };
}

function patrolDirectionCore(self, activeThreats, nearbyHumans, scanCoin = null, options = {}) {
  const directionTo = typeof options.directionTo === 'function' ? options.directionTo : defaultDirectionTo;
  const dist = typeof options.dist === 'function' ? options.dist : defaultDist;
  if (scanCoin) {
    const dir = directionTo(self, scanCoin, options.patrolPrecisionTolerance);
    if ((dir.dx || dir.dy) && dir.distance <= Math.max(0, Number(options.patrolCoinMaxDistance || 0))) {
      return {
        direction: {
          ...dir,
          reason: 'scan-toward-distant-coin'
        },
        clearPatrolHeading: false
      };
    }
  }

  let vx = 0;
  let vy = 0;
  for (const human of (nearbyHumans || []).slice(0, 8)) {
    const d = Math.max(1, dist(self, human));
    if (d > 50000) continue;
    const weight = (50000 - d + 1000) / d;
    vx += (Number(self?.x) - Number(human?.x)) * weight / d;
    vy += (Number(self?.y) - Number(human?.y)) * weight / d;
  }
  for (const threat of (activeThreats || []).slice(0, 4)) {
    const d = Math.max(1, dist(self, threat));
    const activeLimit = Math.max(
      Number(options.dangerRadius || 0),
      Number(options.activeAvoidMaxDistance || options.activeCautionRadius)
    );
    if (d > activeLimit) continue;
    const weight = (activeLimit - d + 1000) / d;
    vx += (Number(self?.x) - Number(threat?.x)) * weight / d;
    vy += (Number(self?.y) - Number(threat?.y)) * weight / d;
  }
  const dx = Math.abs(vx) > 0.01 ? Math.sign(vx) : 0;
  const dy = Math.abs(vy) > 0.01 ? Math.sign(vy) : 0;
  if (dx || dy) {
    return {
      direction: { dx, dy, distance: 0, reason: 'maintain-safe-spacing' },
      clearPatrolHeading: true
    };
  }
  return {
    direction: { dx: 0, dy: 0, distance: 0, reason: 'wait-for-visible-coin-refresh' },
    clearPatrolHeading: true
  };
}

module.exports = {
  defaultDist,
  defaultDirectionTo,
  patrolDirectionCore
};
