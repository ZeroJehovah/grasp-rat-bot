'use strict';

const DEFAULT_BULLET_SPEED_CM_PER_TICK = 500;
const DEFAULT_BULLET_LIFETIME_TICKS = 30;
const DEFAULT_HIT_RADIUS_CM = 90;
const DEFAULT_TARGET_SPEED_CM_PER_TICK = 50;
const DEFAULT_CONTROL_INTERVAL_TICKS = 4;
const DEFAULT_MINIMUM_MARGINAL_COVERAGE = 0.02;
const COVERAGE_MODES = new Set(['off', 'shadow', 'live-single', 'live-volley']);

function normalizeTrajectoryCoverageMode(value, fallback = 'shadow') {
  const normalized = String(value || '').trim().toLowerCase();
  if (COVERAGE_MODES.has(normalized)) return normalized;
  const normalizedFallback = String(fallback || '').trim().toLowerCase();
  return COVERAGE_MODES.has(normalizedFallback) ? normalizedFallback : 'shadow';
}

function shouldApplyTrajectoryCoverageCore(input = {}) {
  return normalizeTrajectoryCoverageMode(input.mode, 'shadow') === 'live-single'
    && input.highEntropy === true
    && input.successfulAimProtected !== true
    && input.planActive === true
    && input.hasSelection === true;
}

function finiteNumber(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function pointAt(path, tick) {
  const index = Math.max(0, Math.min(path.points.length - 1, Math.round(Number(tick) || 0)));
  return path.points[index] || null;
}

function normalizeVector(dx, dy) {
  const length = Math.hypot(dx, dy);
  if (!(length > 0)) return { x: 0, y: 0, length: 0 };
  return { x: dx / length, y: dy / length, length };
}

function velocityToward(from, to, ticks, maxSpeed) {
  const remainingTicks = Math.max(1, Number(ticks) || 1);
  const dx = Number(to.x) - Number(from.x);
  const dy = Number(to.y) - Number(from.y);
  const required = Math.hypot(dx, dy) / remainingTicks;
  const direction = normalizeVector(dx, dy);
  const speed = Math.min(Math.max(0, Number(maxSpeed) || 0), required);
  return { vx: direction.x * speed, vy: direction.y * speed };
}

function trajectoryPointKey(point) {
  return `${Math.round(Number(point?.x || 0) / 25)}:${Math.round(Number(point?.y || 0) / 25)}`;
}

function buildPathVariant(candidate, input, variant, delayTicks, variantWeight, options = {}) {
  const maxTicks = Math.max(1, Math.min(60, Math.round(Number(options.maxTrajectoryTicks ?? DEFAULT_BULLET_LIFETIME_TICKS))));
  const maxTargetSpeed = Math.max(1, Number(options.maxTargetSpeedCmPerTick ?? DEFAULT_TARGET_SPEED_CM_PER_TICK));
  const creation = input.predictedTargetAtCreation;
  const currentVx = Number(creation.vx || input.target?.vx || 0);
  const currentVy = Number(creation.vy || input.target?.vy || 0);
  const baseFlightTicks = Math.max(1, Math.min(maxTicks, Number(input.flightTicks || 0)
    || Math.hypot(Number(candidate.x) - Number(input.predictedShooterOrigin.x), Number(candidate.y) - Number(input.predictedShooterOrigin.y))
      / Math.max(1, Number(options.bulletSpeedCmPerTick ?? DEFAULT_BULLET_SPEED_CM_PER_TICK))));
  const effectiveDelayTicks = Math.max(0, Math.min(maxTicks - 1, Math.round(Number(delayTicks) || 0)));
  const points = [{ x: Number(creation.x), y: Number(creation.y) }];
  let x = Number(creation.x);
  let y = Number(creation.y);
  let finalVelocity = { vx: currentVx, vy: currentVy };
  for (let tick = 1; tick <= maxTicks; tick += 1) {
    if (tick <= effectiveDelayTicks) {
      x += currentVx;
      y += currentVy;
      finalVelocity = { vx: currentVx, vy: currentVy };
    } else {
      const remaining = Math.max(1, baseFlightTicks - tick + 1);
      const desired = velocityToward(
        { x, y },
        { x: Number(candidate.x), y: Number(candidate.y) },
        remaining,
        maxTargetSpeed
      );
      x += desired.vx;
      y += desired.vy;
      finalVelocity = desired;
    }
    if (tick > baseFlightTicks) {
      x = points[tick - 1].x + finalVelocity.vx;
      y = points[tick - 1].y + finalVelocity.vy;
    }
    points.push({ x, y });
  }
  return {
    id: `${candidate.hypothesis}:${variant}`,
    cluster: String(candidate.hypothesis || ''),
    variant,
    delayTicks: effectiveDelayTicks,
    weight: Math.max(0, Number(candidate.probability || 0)) * Math.max(0, Number(variantWeight || 0)),
    uncertaintyCm: Math.max(
      DEFAULT_HIT_RADIUS_CM,
      Number(candidate.uncertaintyCm || 0),
      maxTargetSpeed * Math.max(1, effectiveDelayTicks)
    ),
    directionState: candidate.directionState || null,
    points
  };
}

function buildTrajectoryPathsCore(input = {}, options = {}) {
  const routeCandidates = (Array.isArray(input.routeCandidates) ? input.routeCandidates : [])
    .filter(candidate => candidate && Number.isFinite(Number(candidate.x)) && Number.isFinite(Number(candidate.y)))
    .filter(candidate => candidate.physicallyReachable !== false)
    .slice(0, Math.max(1, Math.min(4, Number(options.maxRouteClusters || 4))));
  if (!routeCandidates.length || !input.predictedTargetAtCreation || !input.predictedShooterOrigin) return [];
  const probabilityTotal = routeCandidates.reduce((sum, candidate) => sum + Math.max(0, Number(candidate.probability || 0)), 0);
  const normalized = routeCandidates.map(candidate => ({
    ...candidate,
    probability: probabilityTotal > 0
      ? Math.max(0, Number(candidate.probability || 0)) / probabilityTotal
      : 1 / routeCandidates.length
  }));
  const controlDelay = Math.max(1, Math.round(Number(input.controlIntervalTicks ?? options.controlIntervalTicks ?? DEFAULT_CONTROL_INTERVAL_TICKS)));
  const learnedDwell = Math.max(0, Math.round(Number(input.learnedDwellTicks || 0)));
  const paths = [];
  for (const candidate of normalized) {
    const variants = learnedDwell > controlDelay
      ? [
          ['immediate', 0, 0.55],
          ['one-control-delay', controlDelay, 0.3],
          ['learned-dwell', Math.min(learnedDwell, 12), 0.15]
        ]
      : [
          ['immediate', 0, 0.67],
          ['one-control-delay', controlDelay, 0.33]
        ];
    for (const [variant, delayTicks, weight] of variants) {
      paths.push(buildPathVariant(candidate, input, variant, delayTicks, weight, options));
    }
  }
  const totalWeight = paths.reduce((sum, path) => sum + path.weight, 0);
  return paths.map(path => ({
    ...path,
    weight: totalWeight > 0 ? path.weight / totalWeight : 1 / paths.length
  }));
}

function buildCandidateShotForPath(path, input = {}, options = {}) {
  const bulletSpeed = Math.max(1, Number(options.bulletSpeedCmPerTick ?? DEFAULT_BULLET_SPEED_CM_PER_TICK));
  const lifetime = Math.max(1, Math.min(path.points.length - 1, Math.round(Number(options.bulletLifetimeTicks ?? DEFAULT_BULLET_LIFETIME_TICKS))));
  const origin = input.predictedShooterOrigin;
  let best = null;
  for (let tick = 1; tick <= lifetime; tick += 1) {
    const targetPoint = pointAt(path, tick);
    const distance = Math.hypot(Number(targetPoint.x) - Number(origin.x), Number(targetPoint.y) - Number(origin.y));
    const radialGap = Math.abs(distance - bulletSpeed * tick);
    if (!best || radialGap < best.radialGap) best = { tick, targetPoint, radialGap, distance };
  }
  if (!best) return null;
  const direction = normalizeVector(Number(best.targetPoint.x) - Number(origin.x), Number(best.targetPoint.y) - Number(origin.y));
  if (!(direction.length > 0)) return null;
  return {
    id: path.id,
    hypothesis: path.cluster,
    variant: path.variant,
    aimX: Number(best.targetPoint.x),
    aimY: Number(best.targetPoint.y),
    startX: Number(origin.x),
    startY: Number(origin.y),
    startTick: Number(input.createdTick || 0),
    expireTick: Number(input.createdTick || 0) + lifetime,
    directionX: direction.x,
    directionY: direction.y,
    interceptTick: best.tick,
    radialGapCm: best.radialGap,
    routeProbability: path.weight,
    directionState: path.directionState || null
  };
}

function dedupeCandidateShots(shots = [], options = {}) {
  const angleTolerance = Math.max(0.0001, Number(options.angleToleranceRadians || 0.0025));
  const result = [];
  for (const shot of shots.filter(Boolean)) {
    const duplicate = result.find(existing => {
      const dot = clamp(existing.directionX * shot.directionX + existing.directionY * shot.directionY, -1, 1);
      return Math.acos(dot) <= angleTolerance && Math.abs(existing.interceptTick - shot.interceptTick) <= 1;
    });
    if (!duplicate) result.push(shot);
  }
  return result.slice(0, Math.max(1, Math.min(12, Number(options.maxShotCandidates || 12))));
}

function shotCorridorMissCore(shot, path, input = {}, options = {}) {
  const bulletSpeed = Math.max(1, Number(shot.speedPerTick || options.bulletSpeedCmPerTick || DEFAULT_BULLET_SPEED_CM_PER_TICK));
  const planCreatedTick = Number(input.createdTick || 0);
  const startTick = Number.isFinite(Number(shot.startTick)) ? Number(shot.startTick) : planCreatedTick;
  const expireTick = Number.isFinite(Number(shot.expireTick))
    ? Number(shot.expireTick)
    : startTick + Math.max(1, Number(options.bulletLifetimeTicks || DEFAULT_BULLET_LIFETIME_TICKS));
  const direction = Number.isFinite(Number(shot.directionX)) && Number.isFinite(Number(shot.directionY))
    ? normalizeVector(Number(shot.directionX), Number(shot.directionY))
    : normalizeVector(Number(shot.aimX) - Number(shot.startX), Number(shot.aimY) - Number(shot.startY));
  if (!(direction.length > 0)) return Infinity;
  let minimum = Infinity;
  for (let relativeTick = 0; relativeTick < path.points.length; relativeTick += 1) {
    const absoluteTick = planCreatedTick + relativeTick;
    if (absoluteTick < startTick || absoluteTick > expireTick) continue;
    const elapsed = absoluteTick - startTick;
    const bulletX = Number(shot.startX) + direction.x * bulletSpeed * elapsed;
    const bulletY = Number(shot.startY) + direction.y * bulletSpeed * elapsed;
    const targetPoint = path.points[relativeTick];
    minimum = Math.min(minimum, Math.hypot(bulletX - targetPoint.x, bulletY - targetPoint.y));
  }
  return minimum;
}

function coverageScoreForMiss(miss, path, options = {}) {
  if (!Number.isFinite(miss)) return 0;
  const hitRadius = Math.max(1, Number(options.hitRadiusCm ?? DEFAULT_HIT_RADIUS_CM));
  if (miss <= hitRadius) return 1;
  const uncertainty = Math.max(hitRadius, Number(path.uncertaintyCm || hitRadius));
  return Math.min(0.5, clamp(1 - (miss - hitRadius) / uncertainty, 0, 1));
}

function coverageForShots(shots, paths, input, options) {
  const pathRows = paths.map(path => {
    let bestScore = 0;
    let bestMiss = Infinity;
    let bestShotId = '';
    for (const shot of shots) {
      const miss = shotCorridorMissCore(shot, path, input, options);
      const score = coverageScoreForMiss(miss, path, options);
      if (score > bestScore || (score === bestScore && miss < bestMiss)) {
        bestScore = score;
        bestMiss = miss;
        bestShotId = String(shot.id || '');
      }
    }
    return {
      pathId: path.id,
      cluster: path.cluster,
      variant: path.variant,
      weight: path.weight,
      bestScore,
      bestMiss,
      bestShotId,
      hardCovered: bestMiss <= Math.max(1, Number(options.hitRadiusCm ?? DEFAULT_HIT_RADIUS_CM))
    };
  });
  return {
    mass: pathRows.reduce((sum, row) => sum + row.weight * row.bestScore, 0),
    hardMass: pathRows.reduce((sum, row) => sum + row.weight * (row.hardCovered ? 1 : 0), 0),
    pathRows
  };
}

function coverageWithCandidate(before, shot, paths, input, options) {
  const hitRadius = Math.max(1, Number(options.hitRadiusCm ?? DEFAULT_HIT_RADIUS_CM));
  const pathRows = paths.map((path, index) => {
    const previous = before.pathRows[index];
    const miss = shotCorridorMissCore(shot, path, input, options);
    const score = coverageScoreForMiss(miss, path, options);
    const replace = score > previous.bestScore || (score === previous.bestScore && miss < previous.bestMiss);
    const bestMiss = replace ? miss : previous.bestMiss;
    return {
      pathId: path.id,
      cluster: path.cluster,
      variant: path.variant,
      weight: path.weight,
      bestScore: replace ? score : previous.bestScore,
      bestMiss,
      bestShotId: replace ? String(shot.id || '') : previous.bestShotId,
      hardCovered: bestMiss <= hitRadius
    };
  });
  return {
    mass: pathRows.reduce((sum, row) => sum + row.weight * row.bestScore, 0),
    hardMass: pathRows.reduce((sum, row) => sum + row.weight * (row.hardCovered ? 1 : 0), 0),
    pathRows
  };
}

function candidateCoverageMetrics(before, shot, paths, input, options) {
  const hitRadius = Math.max(1, Number(options.hitRadiusCm ?? DEFAULT_HIT_RADIUS_CM));
  let mass = 0;
  let hardMass = 0;
  for (let index = 0; index < paths.length; index += 1) {
    const path = paths[index];
    const previous = before.pathRows[index];
    const miss = shotCorridorMissCore(shot, path, input, options);
    const score = coverageScoreForMiss(miss, path, options);
    const replace = score > previous.bestScore || (score === previous.bestScore && miss < previous.bestMiss);
    const bestScore = replace ? score : previous.bestScore;
    const bestMiss = replace ? miss : previous.bestMiss;
    mass += path.weight * bestScore;
    if (bestMiss <= hitRadius) hardMass += path.weight;
  }
  return { mass, hardMass };
}

function summarizeClusters(paths, selectedCoverage) {
  const clusters = new Map();
  for (const path of paths) {
    const row = clusters.get(path.cluster) || {
      hypothesis: path.cluster,
      probability: 0,
      variantCount: 0,
      hardCoveredWeight: 0,
      bestMissCm: null
    };
    row.probability += path.weight;
    row.variantCount += 1;
    const covered = selectedCoverage?.pathRows?.find(item => item.pathId === path.id);
    if (covered) {
      if (covered.hardCovered) row.hardCoveredWeight += path.weight;
      if (Number.isFinite(covered.bestMiss)) {
        row.bestMissCm = row.bestMissCm === null ? covered.bestMiss : Math.min(row.bestMissCm, covered.bestMiss);
      }
    }
    clusters.set(path.cluster, row);
  }
  return Array.from(clusters.values())
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 4)
    .map(row => ({
      ...row,
      probability: Number(row.probability.toFixed(4)),
      hardCoveredWeight: Number(row.hardCoveredWeight.toFixed(4)),
      bestMissCm: row.bestMissCm === null ? null : Math.round(row.bestMissCm)
    }));
}

function normalizeExistingShots(shots = [], input = {}, options = {}) {
  const targetId = String(input.targetId ?? '');
  const planCreatedTick = Number(input.createdTick || 0);
  return (Array.isArray(shots) ? shots : [])
    .filter(Boolean)
    .filter(shot => !targetId || !shot.targetId || String(shot.targetId) === targetId)
    .map((shot, index) => {
      const startX = finiteNumber(shot.startX ?? shot.start_x);
      const startY = finiteNumber(shot.startY ?? shot.start_y);
      const aimX = finiteNumber(shot.coverageAimX ?? shot.shadowTargetX ?? shot.targetX ?? shot.target_x);
      const aimY = finiteNumber(shot.coverageAimY ?? shot.shadowTargetY ?? shot.targetY ?? shot.target_y);
      const hasCoverageAim = finiteNumber(shot.coverageAimX ?? shot.shadowTargetX) !== null
        && finiteNumber(shot.coverageAimY ?? shot.shadowTargetY) !== null;
      let directionX = finiteNumber(shot.directionX ?? shot.dir_x);
      let directionY = finiteNumber(shot.directionY ?? shot.dir_y);
      const microsX = finiteNumber(shot.dir_x_micros);
      const microsY = finiteNumber(shot.dir_y_micros);
      if (directionX === null && microsX !== null) directionX = microsX / 1000000;
      if (directionY === null && microsY !== null) directionY = microsY / 1000000;
      if ((hasCoverageAim || directionX === null || directionY === null)
        && startX !== null && startY !== null && aimX !== null && aimY !== null) {
        const direction = normalizeVector(aimX - startX, aimY - startY);
        directionX = direction.x;
        directionY = direction.y;
      }
      const startTick = finiteNumber(shot.createdTick ?? shot.created_tick,
        finiteNumber(shot.predictedCreatedTick,
          finiteNumber(shot.observedTick, planCreatedTick) + Number(input.executionDelayTicks || 0)));
      const expireTick = finiteNumber(shot.expireTick ?? shot.expire_tick,
        startTick + Math.max(1, Number(options.bulletLifetimeTicks || DEFAULT_BULLET_LIFETIME_TICKS)));
      if ([startX, startY, directionX, directionY, startTick, expireTick].some(value => value === null)) return null;
      if (expireTick < planCreatedTick) return null;
      return {
        id: String(shot.bulletId ?? shot.bullet_id ?? shot.commandId ?? shot.sequence ?? `existing-${index}`),
        targetId: shot.targetId ?? null,
        startX,
        startY,
        directionX,
        directionY,
        startTick,
        expireTick,
        speedPerTick: finiteNumber(shot.speedPerTick ?? shot.speed_per_tick, Number(options.bulletSpeedCmPerTick || DEFAULT_BULLET_SPEED_CM_PER_TICK))
      };
    })
    .filter(Boolean)
    .slice(-16);
}

function buildTrajectoryCoveragePlanCore(input = {}, options = {}) {
  const paths = buildTrajectoryPathsCore(input, options);
  if (!paths.length) {
    return {
      active: false,
      reason: 'no-trajectory-paths',
      selected: null,
      existingCoverageMass: 0,
      candidateCount: 0,
      trajectoryCount: 0,
      clusters: []
    };
  }
  const existingShots = normalizeExistingShots(input.existingShots, input, options);
  const before = coverageForShots(existingShots, paths, input, options);
  const candidates = dedupeCandidateShots(
    paths.map(path => buildCandidateShotForPath(path, input, options)),
    options
  ).map(shot => {
    const after = candidateCoverageMetrics(before, shot, paths, input, options);
    return {
      ...shot,
      coverageMassAfter: after.mass,
      hardCoverageMassAfter: after.hardMass,
      marginalCoverage: Math.max(0, after.mass - before.mass),
      hardMarginalCoverage: Math.max(0, after.hardMass - before.hardMass)
    };
  }).sort((a, b) => b.marginalCoverage - a.marginalCoverage
    || b.hardMarginalCoverage - a.hardMarginalCoverage
    || b.routeProbability - a.routeProbability
    || a.radialGapCm - b.radialGapCm);
  const selected = candidates[0] || null;
  const selectedCoverage = selected
    ? coverageWithCandidate(before, selected, paths, input, options)
    : null;
  const minimumMarginalCoverage = Math.max(0, Number(options.minimumMarginalCoverage ?? DEFAULT_MINIMUM_MARGINAL_COVERAGE));
  const qualified = Boolean(selected && selected.marginalCoverage >= minimumMarginalCoverage);
  const selectedSummary = selected ? {
    id: selected.id,
    hypothesis: selected.hypothesis,
    variant: selected.variant,
    aimX: Math.round(selected.aimX),
    aimY: Math.round(selected.aimY),
    interceptTick: selected.interceptTick,
    radialGapCm: Math.round(selected.radialGapCm * 10) / 10,
    routeProbability: Number(selected.routeProbability.toFixed(4)),
    coverageMassBefore: Number(before.mass.toFixed(4)),
    coverageMassAfter: Number(selected.coverageMassAfter.toFixed(4)),
    hardCoverageMassBefore: Number(before.hardMass.toFixed(4)),
    hardCoverageMassAfter: Number(selected.hardCoverageMassAfter.toFixed(4)),
    marginalCoverage: Number(selected.marginalCoverage.toFixed(4)),
    hardMarginalCoverage: Number(selected.hardMarginalCoverage.toFixed(4)),
    directionState: selected.directionState || null
  } : null;
  return {
    active: qualified,
    reason: selected ? (qualified ? 'marginal-coverage-selected' : 'marginal-coverage-below-threshold') : 'no-shot-candidates',
    selected: selectedSummary,
    existingCoverageMass: Number(before.mass.toFixed(4)),
    existingHardCoverageMass: Number(before.hardMass.toFixed(4)),
    existingShotCount: existingShots.length,
    candidateCount: candidates.length,
    trajectoryCount: paths.length,
    clusters: summarizeClusters(paths, selectedCoverage),
    candidates: candidates.slice(0, 4).map(candidate => ({
      hypothesis: candidate.hypothesis,
      variant: candidate.variant,
      aimX: Math.round(candidate.aimX),
      aimY: Math.round(candidate.aimY),
      marginalCoverage: Number(candidate.marginalCoverage.toFixed(4)),
      hardMarginalCoverage: Number(candidate.hardMarginalCoverage.toFixed(4)),
      radialGapCm: Math.round(candidate.radialGapCm * 10) / 10
    }))
  };
}

module.exports = {
  buildTrajectoryCoveragePlanCore,
  buildTrajectoryPathsCore,
  normalizeTrajectoryCoverageMode,
  shouldApplyTrajectoryCoverageCore,
  shotCorridorMissCore
};
