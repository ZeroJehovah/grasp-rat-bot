'use strict';

function patrolInlineSource() {
  return String.raw`

	  function patrolDirection(self, activeThreats, nearbyHumans, scanCoin = null) {
    if (scanCoin) {
      const dir = directionTo(self, scanCoin, cfg.patrolPrecisionTolerance);
      if ((dir.dx || dir.dy) && dir.distance <= cfg.patrolCoinMaxDistance) {
        return {
          ...dir,
          reason: 'scan-toward-distant-coin'
        };
      }
    }

    let vx = 0;
    let vy = 0;
    for (const human of nearbyHumans.slice(0, 8)) {
      const d = Math.max(1, dist(self, human));
      if (d > 50000) continue;
      const weight = (50000 - d + 1000) / d;
      vx += (Number(self.x) - Number(human.x)) * weight / d;
      vy += (Number(self.y) - Number(human.y)) * weight / d;
    }
    for (const threat of activeThreats.slice(0, 4)) {
      const d = Math.max(1, dist(self, threat));
      const activeLimit = Math.max(cfg.dangerRadius, Number(cfg.activeAvoidMaxDistance || cfg.activeCautionRadius));
      if (d > activeLimit) continue;
      const weight = (activeLimit - d + 1000) / d;
      vx += (Number(self.x) - Number(threat.x)) * weight / d;
      vy += (Number(self.y) - Number(threat.y)) * weight / d;
    }
	    let dx = Math.abs(vx) > 0.01 ? Math.sign(vx) : 0;
	    let dy = Math.abs(vy) > 0.01 ? Math.sign(vy) : 0;
	    if (dx || dy) {
	      bot.patrolHeading = null;
	      return { dx, dy, distance: 0, reason: 'maintain-safe-spacing' };
	    }
	    bot.patrolHeading = null;
		    return { dx: 0, dy: 0, distance: 0, reason: 'wait-for-visible-coin-refresh' };
		  }`;
}

function bundledPatrolSource() {
  return `const { patrolDirectionCore } = require('./src/browser/runtime/patrol');

	  function patrolDirection(self, activeThreats, nearbyHumans, scanCoin = null) {
	    const result = patrolDirectionCore(self, activeThreats, nearbyHumans, scanCoin, {
	      directionTo,
	      dist,
	      patrolPrecisionTolerance: cfg.patrolPrecisionTolerance,
	      patrolCoinMaxDistance: cfg.patrolCoinMaxDistance,
	      dangerRadius: cfg.dangerRadius,
	      activeAvoidMaxDistance: cfg.activeAvoidMaxDistance,
	      activeCautionRadius: cfg.activeCautionRadius
	    });
	    if (result?.clearPatrolHeading) bot.patrolHeading = null;
	    return result?.direction || { dx: 0, dy: 0, distance: 0, reason: 'wait-for-visible-coin-refresh' };
	  }`;
}

function patrolSource(options = {}) {
  if (options.bundledRuntime) return bundledPatrolSource();
  return patrolInlineSource();
}

module.exports = {
  bundledPatrolSource,
  patrolInlineSource,
  patrolSource
};
