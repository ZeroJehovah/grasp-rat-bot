'use strict';

const DIRECTION_ORDER = [
  { dx: 0, dy: -1 },
  { dx: 1, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 1, dy: 1 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 1 },
  { dx: -1, dy: 0 },
  { dx: -1, dy: -1 },
  { dx: 0, dy: 0 }
];

function normalizedDodgeDirection(direction = {}) {
  return {
    dx: Math.max(-1, Math.min(1, Math.sign(Number(direction?.dx || 0)))),
    dy: Math.max(-1, Math.min(1, Math.sign(Number(direction?.dy || 0))))
  };
}

function finiteOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function finiteOrNumber(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function directionKey(direction = {}) {
  const normalized = normalizedDodgeDirection(direction);
  return `${normalized.dx},${normalized.dy}`;
}

function fixedDirectionIndex(direction = {}) {
  const normalized = normalizedDodgeDirection(direction);
  const key = directionKey(normalized);
  const index = DIRECTION_ORDER.findIndex(item => directionKey(item) === key);
  return index >= 0 ? index : DIRECTION_ORDER.length;
}

function bulletRiskCore(bullet = {}, hitRadius = 90) {
  const radius = Math.max(1, Number(hitRadius || 90));
  const rawCpa = finiteOrNull(
    bullet.cpa
      ?? bullet.rawCpaCm
      ?? bullet.minRawCpaCm
      ?? bullet.distance
  );
  const uncertainty = Math.max(0, finiteOrNumber(
    bullet.trajectoryUncertaintyCm
      ?? bullet.trajectory_uncertainty_cm,
    0
  ));
  const robustCpa = rawCpa === null
    ? null
    : Math.max(0, rawCpa - uncertainty);
  const bulletId = String(
    bullet.bulletId
      ?? bullet.bullet_id
      ?? bullet.id
      ?? ''
  );
  return {
    bulletId,
    rawCpaCm: rawCpa,
    robustCpaCm: robustCpa,
    timeToImpactMs: finiteOrNull(
      bullet.timeToImpact ?? bullet.timeToImpactMs ?? bullet.time_to_impact_ms
    ),
    physicalHit: rawCpa !== null && rawCpa < radius,
    robustHit: robustCpa !== null && robustCpa < radius
  };
}

function riskFieldsFromCandidates(candidate = {}, options = {}) {
  const hitRadius = Math.max(1, Number(options.hitRadius ?? candidate.hitRadiusCm ?? 90));
  const suppliedBullets = Array.isArray(candidate.dodgeRiskBullets)
    ? candidate.dodgeRiskBullets
    : (Array.isArray(candidate.dangerousBullets) ? candidate.dangerousBullets : []);
  const bullets = suppliedBullets.map(bullet => bulletRiskCore(bullet, hitRadius));
  let physicalHits = 0;
  let robustHits = 0;
  let minRawCpaCm = Infinity;
  let minRobustCpaCm = Infinity;
  let firstPhysicalCollisionTtiMs = Infinity;
  let firstPhysicalCollisionBulletId = '';
  let minClearanceBulletId = '';
  let minRobustClearanceBulletId = '';
  for (const bullet of bullets) {
    if (bullet.rawCpaCm !== null) {
      if (bullet.rawCpaCm < minRawCpaCm) {
        minRawCpaCm = bullet.rawCpaCm;
        minClearanceBulletId = bullet.bulletId;
      }
      if (bullet.physicalHit) {
        physicalHits += 1;
        if (bullet.timeToImpactMs !== null && bullet.timeToImpactMs < firstPhysicalCollisionTtiMs) {
          firstPhysicalCollisionTtiMs = bullet.timeToImpactMs;
          firstPhysicalCollisionBulletId = bullet.bulletId;
        }
      }
    }
    if (bullet.robustCpaCm !== null) {
      if (bullet.robustCpaCm < minRobustCpaCm) {
        minRobustCpaCm = bullet.robustCpaCm;
        minRobustClearanceBulletId = bullet.bulletId;
      }
      if (bullet.robustHit) robustHits += 1;
    }
  }
  const candidateHasAggregateFields = candidate.physicalHits !== undefined
    || candidate.robustHits !== undefined
    || candidate.minRawCpaCm !== undefined
    || candidate.minRobustCpaCm !== undefined;
  if (!candidateHasAggregateFields && !bullets.length) {
    // Old replay fixtures only retain the conservative hit count. Treat that
    // count as both tiers until a caller supplies the raw trajectory fields.
    physicalHits = Math.max(0, Number(candidate.directHits || 0));
    robustHits = Math.max(0, Number(candidate.directHits || 0));
    minRawCpaCm = finiteOrNumber(candidate.rawMinCPA, Infinity);
    minRobustCpaCm = finiteOrNumber(candidate.minCPA ?? candidate.worstCaseCpaCm, Infinity);
  } else {
    const legacyHits = candidate.directHits === null || candidate.directHits === undefined
      ? null
      : Math.max(0, Number(candidate.directHits || 0));
    physicalHits = candidate.physicalHits === undefined
      ? Math.max(physicalHits, legacyHits === null ? 0 : legacyHits)
      : Math.max(0, Number(candidate.physicalHits || 0));
    robustHits = candidate.robustHits === undefined
      ? Math.max(physicalHits, legacyHits === null ? 0 : legacyHits)
      : Math.max(0, Number(candidate.robustHits || 0));
    minRawCpaCm = finiteOrNumber(candidate.minRawCpaCm, minRawCpaCm);
    minRobustCpaCm = finiteOrNumber(candidate.minRobustCpaCm, minRobustCpaCm);
  }
  const minRawClearanceCm = Number.isFinite(minRawCpaCm) ? minRawCpaCm - hitRadius : Infinity;
  const minRobustClearanceCm = Number.isFinite(minRobustCpaCm) ? minRobustCpaCm - hitRadius : Infinity;
  const aggregateFirstCollisionTtiMs = Object.prototype.hasOwnProperty.call(
    candidate,
    'firstPhysicalCollisionTtiMs'
  )
    ? finiteOrNull(candidate.firstPhysicalCollisionTtiMs)
    : (Number.isFinite(firstPhysicalCollisionTtiMs) ? firstPhysicalCollisionTtiMs : null);
  const aggregateFirstCollisionBulletId = String(
    candidate.firstPhysicalCollisionBulletId || firstPhysicalCollisionBulletId || ''
  );
  const aggregateMinClearanceBulletId = String(
    candidate.minClearanceBulletId || minClearanceBulletId || ''
  );
  const aggregateMinRobustClearanceBulletId = String(
    candidate.minRobustClearanceBulletId || minRobustClearanceBulletId || ''
  );
  return {
    hitRadiusCm: hitRadius,
    physicalHits,
    robustHits,
    minRawCpaCm: Number.isFinite(minRawCpaCm) ? minRawCpaCm : null,
    minRobustCpaCm: Number.isFinite(minRobustCpaCm) ? minRobustCpaCm : null,
    minRawClearanceCm: Number.isFinite(minRawClearanceCm) ? minRawClearanceCm : null,
    minRobustClearanceCm: Number.isFinite(minRobustClearanceCm) ? minRobustClearanceCm : null,
    firstPhysicalCollisionTtiMs: aggregateFirstCollisionTtiMs,
    firstPhysicalCollisionBulletId: aggregateFirstCollisionBulletId,
    minClearanceBulletId: aggregateMinClearanceBulletId,
    minRobustClearanceBulletId: aggregateMinRobustClearanceBulletId
  };
}

function normalizeDodgeRiskCandidate(candidate = {}, options = {}) {
  const direction = normalizedDodgeDirection(candidate);
  const risk = riskFieldsFromCandidates(candidate, options);
  return {
    ...candidate,
    dx: direction.dx,
    dy: direction.dy,
    physicalHits: risk.physicalHits,
    robustHits: risk.robustHits,
    directHits: Number.isFinite(Number(candidate.directHits))
      ? Number(candidate.directHits)
      : risk.robustHits,
    minRawCpaCm: risk.minRawCpaCm,
    minRobustCpaCm: risk.minRobustCpaCm,
    minRawClearanceCm: risk.minRawClearanceCm,
    minRobustClearanceCm: risk.minRobustClearanceCm,
    firstPhysicalCollisionTtiMs: risk.firstPhysicalCollisionTtiMs,
    firstPhysicalCollisionBulletId: risk.firstPhysicalCollisionBulletId,
    minClearanceBulletId: risk.minClearanceBulletId,
    minRobustClearanceBulletId: risk.minRobustClearanceBulletId,
    hitRadiusCm: risk.hitRadiusCm
  };
}

function compareRiskNumber(left, right, smallerIsBetter, unknown = Infinity) {
  const leftValue = left === null || left === undefined ? unknown : Number(left);
  const rightValue = right === null || right === undefined ? unknown : Number(right);
  if (leftValue === rightValue) return 0;
  if (smallerIsBetter) return leftValue < rightValue ? -1 : 1;
  return leftValue > rightValue ? -1 : 1;
}

function compareDodgeCandidateRiskCore(left = {}, right = {}, options = {}) {
  const hitRadius = Math.max(1, Number(options.hitRadius ?? left.hitRadiusCm ?? right.hitRadiusCm ?? 90));
  const a = normalizeDodgeRiskCandidate(left, { hitRadius });
  const b = normalizeDodgeRiskCandidate(right, { hitRadius });
  return compareRiskNumber(a.physicalHits, b.physicalHits, true, Infinity)
    || compareRiskNumber(a.robustHits, b.robustHits, true, Infinity)
    || compareRiskNumber(a.minRobustClearanceCm, b.minRobustClearanceCm, false, -Infinity)
    || compareRiskNumber(a.minRawClearanceCm, b.minRawClearanceCm, false, -Infinity)
    || compareRiskNumber(
      a.firstPhysicalCollisionTtiMs,
      b.firstPhysicalCollisionTtiMs,
      false,
      Infinity
    );
}

function worseDodgeCandidateCore(left, right, options = {}) {
  return compareDodgeCandidateRiskCore(left, right, options) > 0 ? left : right;
}

function bestDodgeCandidateCore(left, right, options = {}) {
  return compareDodgeCandidateRiskCore(left, right, options) <= 0 ? left : right;
}

function collapsedDodgeCandidatesCore(candidates = [], options = {}) {
  const byDirection = new Map();
  for (const raw of Array.isArray(candidates) ? candidates : []) {
    if (!raw || typeof raw !== 'object') continue;
    const candidate = normalizeDodgeRiskCandidate(raw, options);
    if (typeof options.candidateAllowed === 'function' && options.candidateAllowed(candidate) !== true) continue;
    const key = directionKey(candidate);
    const previous = byDirection.get(key);
    byDirection.set(key, previous ? worseDodgeCandidateCore(previous, candidate, options) : candidate);
  }
  return Array.from(byDirection.values());
}

function directionTurnCostCore(from = {}, to = {}) {
  const a = normalizedDodgeDirection(from);
  const b = normalizedDodgeDirection(to);
  if (!(a.dx || a.dy) || !(b.dx || b.dy)) return 0;
  const dot = a.dx * b.dx + a.dy * b.dy;
  if (dot >= 1) return 0;
  if (dot >= Math.SQRT1_2) return 1;
  if (dot >= 0) return 2;
  return 4;
}

function preferredDirectionMatchCore(candidate, preferred = []) {
  const key = directionKey(candidate);
  return (Array.isArray(preferred) ? preferred : [preferred])
    .filter(Boolean)
    .some(item => directionKey(item) === key);
}

function selectDodgeCandidateCore(candidates = [], options = {}) {
  const collapsed = collapsedDodgeCandidatesCore(candidates, options);
  if (!collapsed.length) return null;
  const currentDirection = options.currentDirection
    ? normalizedDodgeDirection(options.currentDirection)
    : null;
  const preferredDirections = [
    ...(Array.isArray(options.preferredDirections) ? options.preferredDirections : []),
    ...(options.preferredDirection ? [options.preferredDirection] : [])
  ].filter(Boolean);
  const scoreCandidate = typeof options.scoreCandidate === 'function'
    ? options.scoreCandidate
    : null;
  // Loot callers have already restricted candidates to one collision tier.
  // Coin progress is their business objective inside that safe tier; every
  // other Dodge consumer compares the complete risk key first.
  const scoreWithinSafeTier = options.scoreWithinSafeTier === true && Boolean(scoreCandidate);
  return collapsed.sort((left, right) => {
    if (scoreWithinSafeTier) {
      const score = Number(scoreCandidate(right) || 0) - Number(scoreCandidate(left) || 0);
      if (score) return score;
    }
    const risk = compareDodgeCandidateRiskCore(left, right, options);
    if (risk) return risk;
    if (currentDirection) {
      const turn = directionTurnCostCore(currentDirection, left)
        - directionTurnCostCore(currentDirection, right);
      if (turn) return turn;
    }
    if (preferredDirections.length) {
      const leftPreferred = preferredDirectionMatchCore(left, preferredDirections) ? 1 : 0;
      const rightPreferred = preferredDirectionMatchCore(right, preferredDirections) ? 1 : 0;
      if (leftPreferred !== rightPreferred) return rightPreferred - leftPreferred;
    }
    if (scoreCandidate) {
      const score = Number(scoreCandidate(right) || 0) - Number(scoreCandidate(left) || 0);
      if (score) return score;
    }
    return fixedDirectionIndex(left) - fixedDirectionIndex(right);
  })[0] || null;
}

function isPhysicalDodgeSafeCore(candidate = {}, options = {}) {
  return normalizeDodgeRiskCandidate(candidate, options).physicalHits === 0;
}

function isRobustDodgeSafeCore(candidate = {}, options = {}) {
  const normalized = normalizeDodgeRiskCandidate(candidate, options);
  return normalized.physicalHits === 0
    && normalized.robustHits === 0
    && candidate.scheduleRobust !== false;
}

function safestTierCandidateCore(candidates = [], options = {}) {
  const normalized = collapsedDodgeCandidatesCore(candidates, options);
  const physicalSafe = normalized.filter(candidate => candidate.physicalHits === 0);
  if (physicalSafe.length) {
    const robustSafe = physicalSafe.filter(candidate => (
      candidate.robustHits === 0 && candidate.scheduleRobust !== false
    ));
    return selectDodgeCandidateCore(robustSafe.length ? robustSafe : physicalSafe, options);
  }
  const robustSafe = normalized.filter(candidate => (
    candidate.robustHits === 0 && candidate.scheduleRobust !== false
  ));
  return robustSafe.length
    ? selectDodgeCandidateCore(robustSafe, options)
    : null;
}

function movementSafetyOverrideCore(input = {}, options = {}) {
  const field = Array.isArray(input.threatField) ? input.threatField : [];
  const completeField = collapsedDodgeCandidatesCore(field);
  const normalizedField = collapsedDodgeCandidatesCore(field, options);
  const current = input.currentDirection
    ? completeField.find(row => directionKey(row) === directionKey(input.currentDirection)) || null
    : null;
  const physicalSafe = normalizedField.filter(row => row.physicalHits === 0);
  const robustSafe = physicalSafe.filter(row => row.robustHits === 0 && row.scheduleRobust !== false);
  // When every direction collides, there is no safe tier. The final guard
  // still has to pick the least risky complete key instead of preserving the
  // current or pending command; that command may be the worse lane.
  const selected = safestTierCandidateCore(field, options)
    || selectDodgeCandidateCore(normalizedField, options);
  const risk = candidate => candidate ? {
    physicalHits: candidate.physicalHits,
    robustHits: candidate.robustHits,
    minRawCpaCm: candidate.minRawCpaCm,
    minRobustCpaCm: candidate.minRobustCpaCm,
    minRawClearanceCm: candidate.minRawClearanceCm,
    minRobustClearanceCm: candidate.minRobustClearanceCm,
    firstPhysicalCollisionTtiMs: candidate.firstPhysicalCollisionTtiMs,
    firstPhysicalCollisionBulletId: candidate.firstPhysicalCollisionBulletId,
    minClearanceBulletId: candidate.minClearanceBulletId,
    minRobustClearanceBulletId: candidate.minRobustClearanceBulletId
  } : null;
  if (input.hardGate === true) {
    return {
      applied: false,
      reason: String(input.hardGateReason || 'higher-priority-hard-gate'),
      current: risk(current),
      selected: risk(selected),
      direction: null
    };
  }
  if (!normalizedField.length || !current || !selected) {
    return {
      applied: false,
      reason: !normalizedField.length ? 'no-current-threat-field' : 'current-direction-not-evaluated',
      current: risk(current),
      selected: risk(selected),
      direction: null
    };
  }
  let override = false;
  let reason = '';
  if (physicalSafe.length) {
    if (current.physicalHits > 0) {
      override = true;
      reason = 'physical-collision-to-safe-direction';
    }
  } else if (robustSafe.length) {
    if (current.robustHits > 0) {
      override = true;
      reason = 'robust-collision-to-safe-direction';
    }
  } else if (compareDodgeCandidateRiskCore(current, selected, options) > 0) {
    override = true;
    reason = 'no-safe-direction-best-effort-risk-order';
  }
  return {
    applied: override,
    reason: override ? reason : (physicalSafe.length
      ? 'current-direction-physically-safe'
      : (robustSafe.length ? 'current-direction-robust-safe' : 'all-directions-collide')),
    current: risk(current),
    selected: risk(selected),
    direction: override ? { dx: selected.dx, dy: selected.dy } : null
  };
}

module.exports = {
  DIRECTION_ORDER,
  bestDodgeCandidateCore,
  collapsedDodgeCandidatesCore,
  compareDodgeCandidateRiskCore,
  directionKey,
  fixedDirectionIndex,
  isPhysicalDodgeSafeCore,
  isRobustDodgeSafeCore,
  movementSafetyOverrideCore,
  normalizeDodgeRiskCandidate,
  normalizedDodgeDirection,
  riskFieldsFromCandidates,
  safestTierCandidateCore,
  selectDodgeCandidateCore,
  worseDodgeCandidateCore
};
