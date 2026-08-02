'use strict';

// Bounded, realtime-only evidence for explaining an observed self HP drop.
// This module is deliberately diagnostic: its result must never authorize
// fire, movement, target selection, or an exit.

const DIRECTIONS = Object.freeze([
  { dx: 0, dy: -1 },
  { dx: 1, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 1, dy: 1 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 1 },
  { dx: -1, dy: 0 },
  { dx: -1, dy: -1 },
  { dx: 0, dy: 0 }
]);

const DEFAULT_BUFFER_MS = 2000;
const DEFAULT_MAX_OBSERVATIONS = 40;
const DEFAULT_MAX_BULLETS_PER_OBSERVATION = 12;
const DEFAULT_MAX_FRAME_GAP_TICKS = 3;

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizedDirection(value = {}) {
  return {
    dx: Math.max(-1, Math.min(1, Math.sign(Number(value.dx || 0)))),
    dy: Math.max(-1, Math.min(1, Math.sign(Number(value.dy || 0))))
  };
}

function directionKey(value = {}) {
  const direction = normalizedDirection(value);
  return `${direction.dx},${direction.dy}`;
}

function bulletId(bullet = {}) {
  return String(
    bullet.bulletId
      ?? bullet.bullet_id
      ?? bullet.id
      ?? `${bullet.createdTick ?? bullet.created_tick ?? ''}:${bullet.x ?? ''}:${bullet.y ?? ''}`
  );
}

function normalizedBulletDirection(bullet = {}) {
  const direction = bullet.direction && typeof bullet.direction === 'object'
    ? bullet.direction
    : bullet;
  const dx = numberOrNull(direction.dx ?? direction.vx);
  const dy = numberOrNull(direction.dy ?? direction.vy);
  if (dx === null || dy === null || (dx === 0 && dy === 0)) return null;
  const length = Math.hypot(dx, dy);
  return {
    dx: dx / length,
    dy: dy / length
  };
}

function compactBullet(bullet = {}) {
  const id = bulletId(bullet);
  if (!id || id === ':') return null;
  const position = bullet.position && typeof bullet.position === 'object'
    ? bullet.position
    : bullet;
  const x = numberOrNull(position.x);
  const y = numberOrNull(position.y);
  const direction = normalizedBulletDirection(bullet);
  const speed = numberOrNull(
    bullet.speed
      ?? bullet.speedPerTick
      ?? bullet.speed_per_tick
      ?? (bullet.vx !== undefined || bullet.vy !== undefined
        ? Math.hypot(Number(bullet.vx || 0), Number(bullet.vy || 0))
        : null)
  );
  return {
    bulletId: id.slice(0, 96),
    ownerId: bullet.ownerId ?? bullet.owner_id ?? bullet.owner_user_id ?? null,
    incoming: bullet.incoming === true,
    collisionPath: bullet.collisionPath !== false,
    createdTick: numberOrNull(bullet.createdTick ?? bullet.created_tick),
    expireTick: numberOrNull(bullet.expireTick ?? bullet.expire_tick),
    currentTick: numberOrNull(bullet.currentTick ?? bullet.tick),
    x,
    y,
    direction,
    speed,
    trajectoryEvidence: x !== null
      && y !== null
      && direction !== null
      && speed !== null
      && speed > 0
      && numberOrNull(bullet.currentTick ?? bullet.tick) !== null,
    timeToImpactMs: numberOrNull(bullet.timeToImpactMs ?? bullet.timeToImpact ?? bullet.time_to_impact_ms),
    cpaCm: numberOrNull(bullet.cpaCm ?? bullet.cpa),
    predictedHit: bullet.predictedHit === true,
    currentHoldHit: bullet.currentHoldHit === true,
    expectedHit: bullet.expectedHit === true,
    trajectoryUncertaintyCm: numberOrNull(
      bullet.trajectoryUncertaintyCm ?? bullet.trajectory_uncertainty_cm
    )
  };
}

function compactThreat(threat = {}) {
  return {
    dx: normalizedDirection(threat).dx,
    dy: normalizedDirection(threat).dy,
    directHits: Math.max(0, Number(threat.directHits || 0)),
    unavoidableHits: Math.max(0, Number(threat.unavoidableHits || 0)),
    avoidableHits: Math.max(0, Number(threat.avoidableHits || 0)),
    minCPA: numberOrNull(threat.minCPA ?? threat.worstCaseCpaCm),
    worstCaseCpaCm: numberOrNull(threat.worstCaseCpaCm ?? threat.minCPA),
    minTTI: numberOrNull(threat.minTTI),
    scheduleRobust: threat.scheduleRobust !== false
  };
}

function createCombatObservationBuffer(options = {}) {
  return {
    observations: [],
    bufferMs: Math.max(500, Number(options.bufferMs ?? DEFAULT_BUFFER_MS)),
    maxObservations: Math.max(8, Math.round(Number(options.maxObservations ?? DEFAULT_MAX_OBSERVATIONS))),
    maxBulletsPerObservation: Math.max(
      1,
      Math.round(Number(options.maxBulletsPerObservation ?? DEFAULT_MAX_BULLETS_PER_OBSERVATION))
    )
  };
}

function compactSelf(self = {}) {
  return {
    x: numberOrNull(self.x),
    y: numberOrNull(self.y),
    vx: numberOrNull(self.vx),
    vy: numberOrNull(self.vy),
    hp: numberOrNull(self.hp ?? self.knownHp ?? self.displayHp)
  };
}

function observeCombatFrameCore(previousState = null, input = {}, options = {}) {
  const state = previousState && typeof previousState === 'object'
    ? previousState
    : createCombatObservationBuffer(options);
  const nowMs = numberOrNull(input.atMs ?? input.nowMs) ?? Date.now();
  const tick = numberOrNull(input.tick ?? input.currentTick);
  const self = compactSelf(input.self || {});
  const direction = normalizedDirection(input.selectedDirection || input.self || {});
  const pending = input.pendingMovement && typeof input.pendingMovement === 'object'
    ? {
        visible: input.pendingMovement.visible !== false,
        sentAtMs: numberOrNull(input.pendingMovement.sentAtMs),
        visibleAtMs: numberOrNull(input.pendingMovement.visibleAtMs),
        generation: String(input.pendingMovement.generation || '').slice(0, 96)
      }
    : null;
  const bullets = (Array.isArray(input.bullets) ? input.bullets : [])
    .filter(bullet => bullet && bullet.incoming === true)
    .map(compactBullet)
    .filter(Boolean)
    .slice(0, state.maxBulletsPerObservation);
  const previous = state.observations.at(-1) || null;
  const observation = {
    atMs: nowMs,
    tick,
    self,
    movement: {
      selectedDirection: direction,
      visibleDirection: normalizedDirection(input.visibleDirection || input.self || {}),
      pending
    },
    bullets
  };
  state.observations.push(observation);
  while (state.observations.length > state.maxObservations) state.observations.shift();
  while (state.observations.length > 1
    && nowMs - Number(state.observations[0].atMs || nowMs) > state.bufferMs) {
    state.observations.shift();
  }
  const hpLoss = previous?.self?.hp !== null
    && previous?.self?.hp !== undefined
    && self.hp !== null
    && self.hp < previous.self.hp - 0.01;
  return {
    state,
    observation,
    previous,
    hpLoss: hpLoss
      ? {
          previousHp: previous.self.hp,
          currentHp: self.hp,
          amount: previous.self.hp - self.hp,
          frameGapMs: Math.max(0, nowMs - Number(previous.atMs || nowMs)),
          frameGapTicks: tick !== null && previous.tick !== null
            ? Math.max(0, tick - previous.tick)
            : null,
          observations: state.observations.slice(-state.maxObservations)
        }
      : null
  };
}

function uniqueBullets(observations = []) {
  const byId = new Map();
  for (const observation of observations) {
    for (const bullet of observation?.bullets || []) {
      const id = String(bullet.bulletId || '');
      if (!id || byId.has(id)) continue;
      byId.set(id, bullet);
    }
  }
  return [...byId.values()].slice(0, DEFAULT_MAX_BULLETS_PER_OBSERVATION * 2);
}

function threatForDirection(threatField, direction) {
  const key = directionKey(direction);
  return (Array.isArray(threatField) ? threatField : [])
    .map(compactThreat)
    .find(item => directionKey(item) === key) || null;
}

function directionSummary(threatField, selectedDirection) {
  return DIRECTIONS.map(direction => {
    const threat = threatForDirection(threatField, direction);
    return {
      ...direction,
      selected: directionKey(direction) === directionKey(selectedDirection),
      evidence: Boolean(threat),
      directHits: threat?.directHits ?? null,
      unavoidableHits: threat?.unavoidableHits ?? null,
      avoidableHits: threat?.avoidableHits ?? null,
      minCPA: threat?.minCPA ?? null,
      worstCaseCpaCm: threat?.worstCaseCpaCm ?? null,
      minTTI: threat?.minTTI ?? null,
      scheduleRobust: threat?.scheduleRobust ?? null
    };
  });
}

function candidateBulletSummary(bullet) {
  return {
    bulletId: String(bullet.bulletId || ''),
    ownerId: bullet.ownerId ?? null,
    createdTick: bullet.createdTick,
    expireTick: bullet.expireTick,
    currentTick: bullet.currentTick,
    x: bullet.x,
    y: bullet.y,
    direction: bullet.direction,
    speed: bullet.speed,
    trajectoryEvidence: bullet.trajectoryEvidence === true,
    timeToImpactMs: bullet.timeToImpactMs,
    cpaCm: bullet.cpaCm,
    predictedHit: bullet.predictedHit,
    currentHoldHit: bullet.currentHoldHit,
    expectedHit: bullet.expectedHit,
    trajectoryUncertaintyCm: bullet.trajectoryUncertaintyCm
  };
}

function trajectoryMatchAtLoss(bullet, observations = [], currentObservation = {}, options = {}) {
  if (bullet?.trajectoryEvidence !== true) return null;
  const lossTick = numberOrNull(currentObservation.tick);
  const lossAtMs = numberOrNull(currentObservation.atMs);
  const tickMs = Math.max(1, Number(options.tickMs ?? 50));
  const hitRadiusCm = Math.max(1, Number(options.hitRadiusCm ?? 200));
  const maxProjectionTicks = Math.max(1, Number(options.maxProjectionTicks ?? 60));
  const selfX = numberOrNull(currentObservation.self?.x);
  const selfY = numberOrNull(currentObservation.self?.y);
  if (selfX === null || selfY === null) return null;
  const samples = observations
    .flatMap(observation => observation?.bullets || [])
    .filter(sample => String(sample.bulletId || '') === String(bullet.bulletId || ''))
    .filter(sample => sample.trajectoryEvidence === true);
  let best = null;
  for (const sample of samples) {
    const sampleTick = numberOrNull(sample.currentTick);
    const sampleAtMs = numberOrNull(
      observations.find(observation => (observation.bullets || []).includes(sample))?.atMs
    );
    let elapsedTicks = null;
    if (lossTick !== null && sampleTick !== null) elapsedTicks = lossTick - sampleTick;
    else if (lossAtMs !== null && sampleAtMs !== null) elapsedTicks = (lossAtMs - sampleAtMs) / tickMs;
    if (elapsedTicks === null || elapsedTicks < -1 || elapsedTicks > maxProjectionTicks) continue;
    const projectedX = sample.x + sample.direction.dx * sample.speed * Math.max(0, elapsedTicks);
    const projectedY = sample.y + sample.direction.dy * sample.speed * Math.max(0, elapsedTicks);
    const distanceCm = Math.hypot(projectedX - selfX, projectedY - selfY);
    const uncertaintyCm = Math.max(0, Number(sample.trajectoryUncertaintyCm || 0));
    const thresholdCm = hitRadiusCm + uncertaintyCm;
    const candidate = {
      bulletId: sample.bulletId,
      ownerId: sample.ownerId ?? null,
      elapsedTicks: Number(elapsedTicks.toFixed(2)),
      projectedX: Number(projectedX.toFixed(2)),
      projectedY: Number(projectedY.toFixed(2)),
      distanceCm: Number(distanceCm.toFixed(2)),
      thresholdCm: Number(thresholdCm.toFixed(2))
    };
    if (!best || candidate.distanceCm < best.distanceCm) best = candidate;
  }
  return best && best.distanceCm <= best.thresholdCm ? best : null;
}

function completeCombatHpLossAttributionCore(pending = null, input = {}, options = {}) {
  if (!pending || !pending.hpLoss) return null;
  const hpLoss = pending.hpLoss;
  const current = pending.observations?.at(-1) || {};
  const selectedDirection = normalizedDirection(
    input.selectedDirection || current.movement?.selectedDirection || current.self || {}
  );
  const threatField = Array.isArray(input.threatField) ? input.threatField : [];
  const directions = directionSummary(threatField, selectedDirection);
  const completeDirections = directions.filter(item => item.evidence);
  const bullets = uniqueBullets(pending.observations || []);
  const collisionCandidates = bullets.filter(bullet => (
    bullet.collisionPath !== false
    && (bullet.predictedHit || bullet.currentHoldHit || bullet.expectedHit || bullet.cpaCm !== null)
  ));
  const physicalMatches = collisionCandidates
    .map(bullet => ({ bullet, match: trajectoryMatchAtLoss(bullet, pending.observations || [], current, options) }))
    .filter(item => item.match)
    .sort((left, right) => left.match.distanceCm - right.match.distanceCm);
  const currentThreat = threatForDirection(threatField, selectedDirection);
  const allDirectionsUnsafe = completeDirections.length >= DIRECTIONS.length
    && completeDirections.every(item => item.directHits > 0 || item.unavoidableHits > 0);
  const commandVisibility = input.commandVisibility && typeof input.commandVisibility === 'object'
    ? input.commandVisibility
    : current.movement?.pending;
  const commandNotVisible = commandVisibility?.visible === false;
  const maxFrameGapTicks = Math.max(
    1,
    Math.round(Number(options.maxFrameGapTicks ?? DEFAULT_MAX_FRAME_GAP_TICKS))
  );
  let classification = 'ambiguous';
  let evidenceStatus = 'complete';
  let reason = 'no-decisive-causal-match';
  if (hpLoss.frameGapTicks !== null && hpLoss.frameGapTicks > maxFrameGapTicks) {
    classification = 'observation-gap';
    evidenceStatus = 'insufficient';
    reason = 'frame-gap-exceeds-causal-window';
  } else if (commandNotVisible) {
    classification = 'command-not-visible';
    reason = 'selected-movement-command-not-visible-before-hp-loss';
  } else if (allDirectionsUnsafe) {
    classification = 'unavoidable-all-directions';
    reason = 'all-observed-directions-have-direct-or-unavoidable-risk';
  } else if (currentThreat && (currentThreat.directHits > 0 || currentThreat.unavoidableHits > 0)) {
    classification = 'selected-direction-risk';
    reason = 'selected-direction-has-collision-risk-while-another-direction-is-safer';
  } else if (physicalMatches.length > 0) {
    classification = 'matched-collision';
    reason = 'realtime-bullet-trajectory-matches-hp-loss-window';
  } else if (!threatField.length || !bullets.length) {
    classification = 'no-physical-match';
    evidenceStatus = 'insufficient';
    reason = 'no-realtime-bullet-or-threat-field-in-causal-window';
  } else if (collisionCandidates.length > 0) {
    classification = 'no-physical-match';
    evidenceStatus = 'insufficient';
    reason = 'realtime-threat-summary-lacks-trajectory-proof';
  }
  const completeBulletTicks = bullets
    .map(bullet => bullet.currentTick ?? bullet.createdTick)
    .filter(value => value !== null && value !== undefined);
  return {
    type: 'combat-hp-loss-attribution',
    source: 'realtime-native-bounded-buffer',
    classification,
    evidenceStatus,
    reason,
    hpLoss: Number(hpLoss.amount.toFixed(3)),
    previousSelfHp: hpLoss.previousHp,
    currentSelfHp: hpLoss.currentHp,
    frameGapMs: hpLoss.frameGapMs,
    frameGapTicks: hpLoss.frameGapTicks,
    lastCompleteBulletTick: completeBulletTicks.length ? Math.max(...completeBulletTicks) : null,
    commandVisibilityDelayMs: numberOrNull(
      input.commandVisibilityDelayMs
        ?? (commandVisibility
          && commandVisibility.visibleAtMs !== null
          && commandVisibility.visibleAtMs !== undefined
          && commandVisibility.sentAtMs !== null
          && commandVisibility.sentAtMs !== undefined
          ? commandVisibility.visibleAtMs - commandVisibility.sentAtMs
          : null)
    ),
    movementDirection: selectedDirection,
    movementGeneration: String(
      input.movementGeneration || commandVisibility?.generation || ''
    ).slice(0, 96),
    candidateBullets: physicalMatches.slice(0, 8).map(item => ({
      ...candidateBulletSummary(item.bullet),
      trajectoryMatch: item.match
    })),
    counterfactualDirections: directions,
    candidateCount: physicalMatches.length,
    completeDirectionCount: completeDirections.length,
    threatFieldEvidence: threatField.length > 0,
    diagnosticOnly: true
  };
}

function runCombatHpLossAttributionSelfTest() {
  const cases = [];
  const assert = (name, condition) => {
    cases.push({ name, ok: Boolean(condition) });
    if (!condition) throw new Error(`combat HP attribution self-test failed: ${name}`);
  };
  try {
    let buffer = createCombatObservationBuffer({ maxObservations: 8, maxBulletsPerObservation: 2 });
    let frame = observeCombatFrameCore(buffer, {
      atMs: 1000,
      tick: 10,
      self: { x: 0, y: 0, hp: 100 },
      selectedDirection: { dx: 1, dy: 0 },
      bullets: []
    });
    assert('no HP loss produces no pending attribution', frame.hpLoss === null);
    buffer = frame.state;
    frame = observeCombatFrameCore(buffer, {
      atMs: 1050,
      tick: 11,
      self: { x: 50, y: 0, hp: 97 },
      selectedDirection: { dx: 1, dy: 0 },
      bullets: [
        {
          id: 'b1', incoming: true, currentTick: 11, x: 0, y: 0,
          direction: { dx: 1, dy: 0 }, speed: 50, cpaCm: 40, predictedHit: true
        },
        {
          id: 'b2', incoming: true, currentTick: 11, x: 0, y: 0,
          direction: { dx: 1, dy: 0 }, speed: 40, cpaCm: 60, expectedHit: true
        },
        {
          id: 'b3', incoming: true, currentTick: 11, x: 0, y: 0,
          direction: { dx: 1, dy: 0 }, speed: 30, cpaCm: 80, expectedHit: true
        }
      ]
    });
    const matched = completeCombatHpLossAttributionCore(
      { hpLoss: frame.hpLoss, observations: frame.state.observations },
      { selectedDirection: { dx: 1, dy: 0 }, threatField: [] }
    );
    assert('bounded bullet buffer and matched collision classification', frame.state.observations.length === 2
      && frame.observation.bullets.length === 2
      && matched.classification === 'matched-collision'
      && matched.candidateCount === 2
      && matched.diagnosticOnly === true);

    const commandNotVisible = completeCombatHpLossAttributionCore(
      { hpLoss: frame.hpLoss, observations: frame.state.observations },
      { selectedDirection: { dx: 1, dy: 0 }, threatField: [], commandVisibility: { visible: false } }
    );
    assert('invisible movement command is classified before bullet inference', commandNotVisible.classification === 'command-not-visible');

    const allDirectionsUnsafe = completeCombatHpLossAttributionCore(
      { hpLoss: frame.hpLoss, observations: frame.state.observations },
      {
        selectedDirection: { dx: 1, dy: 0 },
        threatField: DIRECTIONS.map(direction => ({ ...direction, directHits: 1, unavoidableHits: 0 }))
      }
    );
    assert('all-direction collision evidence is classified as unavoidable', allDirectionsUnsafe.classification === 'unavoidable-all-directions'
      && allDirectionsUnsafe.completeDirectionCount === DIRECTIONS.length);

    const gap = completeCombatHpLossAttributionCore(
      {
        hpLoss: { ...frame.hpLoss, frameGapTicks: 4 },
        observations: frame.state.observations
      },
      { selectedDirection: { dx: 1, dy: 0 }, threatField: [] }
    );
    assert('large tick gap remains evidence-insufficient', gap.classification === 'observation-gap'
      && gap.evidenceStatus === 'insufficient');

    const noMatch = completeCombatHpLossAttributionCore(
      { hpLoss: frame.hpLoss, observations: frame.state.observations.map(item => ({ ...item, bullets: [] })) },
      { selectedDirection: { dx: 1, dy: 0 }, threatField: [] }
    );
    assert('missing realtime causal objects are never declared safe', noMatch.classification === 'no-physical-match'
      && noMatch.evidenceStatus === 'insufficient');

    return { ok: true, cases };
  } catch (error) {
    return { ok: false, error: error?.message || String(error), cases };
  }
}

module.exports = {
  DIRECTIONS,
  createCombatObservationBuffer,
  observeCombatFrameCore,
  completeCombatHpLossAttributionCore,
  runCombatHpLossAttributionSelfTest
};
