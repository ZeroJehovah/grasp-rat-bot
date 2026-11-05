'use strict';
const assert = require('assert');
const { buildCombatMovementPlan } = require('./combat-adapter');
const {
  calculateDodgeDirection,
  resolveDistanceAwareDodgeCore,
  sameRadialIntentCore,
  selectCombatMovementArbitrationCore,
  stabilizeCombatMovementDirectionCore
} = require('../../strategy/combat-movement');
const { resolveDodgeExecutionDirectionCore } = require('../../strategy/combat-movement-ownership');
function runSecondaryDodgeSelfTest() {
  const self = { x: 0, y: 0, vx: 0, vy: 0, hp: 70, stamina_5s_remaining_milli: 5000 };
  const target = { user_id: 2, x: 3200, y: 0, vx: 0, vy: 0, distance: 3200, active: true, combatRole: 'secondary' };
  const options = { nowMs: 10000, combatDistanceAwareDodgeEnabled: true, combatShootDodgeReserveMs: 2600,
    movementExecutionTiming: { sampleCount: 10, medianTicks: 2, p90Ticks: 2 }, distanceAwareDodgeRng: () => 0.5,
    combatTargetState: { opponentBehaviorState: { metrics: { burstSampleCount: 4, shotIntervalCv: 0, realBulletPressure: true },
      dimensions: { shootingPhase: { state: 'idle', nextShotInMs: 0 } } } } };
  const start = buildCombatMovementPlan(self, target, [], options);
  assert(start.distanceAwareDodge.applied && (start.dx || start.dy), 'inactive ownership cannot erase pre-dodge');
  assert.strictEqual(start.dx, start.distanceAwareDodge.direction.dx);
  assert.strictEqual(start.dy, start.distanceAwareDodge.direction.dy);
  const moving = buildCombatMovementPlan({ ...self, vy: 50 }, target, [], options);
  assert.strictEqual(moving.distanceAwareDodge.preDodgeReason, 'preserve-safe-current-motion');
  assert.strictEqual(moving.dx, 0); assert.strictEqual(moving.dy, 1);
  for (const override of [{ leaveActive: true }, { collisionRisk: true }, { combatDistanceAwareDodgeEnabled: false }]) {
    assert(!buildCombatMovementPlan(self, target, [], { ...options, ...override }).distanceAwareDodge.applied);
  }
  for (const stamina of [3500, 2400, 500, 0]) {
    assert(buildCombatMovementPlan({ ...self, stamina_5s_remaining_milli: stamina }, target, [], options)
      .distanceAwareDodge.applied, 'shooting reserves cannot block defensive pre-dodge');
  }
  const bullet = { x: -200, y: 0, distance: 200, incoming: true, speed: 500, direction: { dx: 1, dy: 0 }, timeToImpact: 20, remainingTicks: 1 };
  const forecast = remainingTicks => calculateDodgeDirection(self, [{ ...bullet, remainingTicks }], { hitRadius: 90, commandDelayTicks: 5 });
  const stopped = forecast(1).threatField.find(row => row.dx === 0 && row.dy === 0);
  assert(stopped.directHits === 1 && stopped.rawMinCPA < 0.001, 'swept segment catches between-tick hit');
  const expired = forecast(0.1).threatField.find(row => row.dx === 0 && row.dy === 0);
  assert(expired.directHits === 0, 'projectile lifetime must not round up beyond expiry');

  // Two crossing lanes: reversing avoids the later shot but intersects the
  // nearer shot. Both directions have one conservative collision risk; the
  // nearer shot is still avoidable by continuing the current movement.
  const crossing = [
    { bullet_id: 'near', x: 2360, y: 619, direction: { dx: -0.946284, dy: -0.323337 }, timeToImpact: 243 },
    { bullet_id: 'later', x: 4249, y: 1478, direction: { dx: -0.954707, dy: -0.297544 }, timeToImpact: 443 }
  ].map(item => ({ ...item, incoming: true, distance: Math.hypot(item.x, item.y),
    speed: 500, remainingTicks: 20, trajectoryUncertaintyCm: 180 }));
  const crossingOptions = { hitRadius: 90, commandDelayTicks: 2,
    movementExecutionTiming: { sampleCount: 10, medianTicks: 2, p90Ticks: 2 } };
  const crossingSelf = { ...self, vx: -35, vy: 35 };
  const crossingDodge = calculateDodgeDirection(crossingSelf, crossing, crossingOptions);
  const selected = crossingDodge.threatField.find(row => row.dx === crossingDodge.dx && row.dy === crossingDodge.dy);
  const reversal = crossingDodge.threatField.find(row => row.dx === 0 && row.dy === -1);
  assert.strictEqual(selected.directHits, reversal.directHits, 'the comparison has equal total collision risk');
  assert.strictEqual(selected.unavoidableHits, 0, 'a time-budget label cannot justify entering an avoidable near shot');
  assert.strictEqual(reversal.unavoidableHits, 1);
  assert.strictEqual(selected.physicalHits, 0,
    'a raw-safe lane outranks every lane that physically intersects a projectile');
  assert(selected.robustHits <= reversal.robustHits,
    'equal raw safety must not worsen the complete robust collision key');
  assert(selected.minRobustClearanceCm > reversal.minRobustClearanceCm,
    'equal collision counts must still order by signed robust clearance');
  assert(selected.minRawClearanceCm > reversal.minRawClearanceCm,
    'the selected lane retains more physical clearance');
  assert(selected.dangerousBullets.find(item => item.bulletId === 'near').cpa > 380);
  assert(reversal.dangerousBullets.find(item => item.bulletId === 'near').cpa < 90);
  assert(crossingDodge.threatField.every(row => selected.directHits <= row.directHits),
    'avoiding an imminent shot cannot accept more total collisions');
  const crossingPlan = buildCombatMovementPlan(crossingSelf, target, crossing,
    { ...options, ...crossingOptions, combatBulletHitRadiusCm: 90 });
  assert.strictEqual(crossingPlan.ownership.owner, 'emergency-dodge');
  assert.strictEqual(crossingPlan.dy, 1, 'the near-shot-safe direction survives final secondary movement ownership');
  const single = calculateDodgeDirection(crossingSelf, crossing.slice(0, 1), crossingOptions);
  assert.strictEqual(single.threatField[0].directHits, 0, 'fully safe directions retain priority');
  const allHit = [-1, 1].map(dy => ({ dx: 0, dy, directHits: 1, unavoidableHits: 1, minCPA: 0 }));
  const closeInput = { self, target, targetId: '2', engagementId: 'test', nowMs: 10000,
    baseMovement: { dx: 0, dy: 0 }, radialIntentVector: { dx: 0, dy: 0 },
    currentDirection: { dx: 1, dy: 0 }, dodge: { threatField: allHit },
    activeOpponent: true, reactionSlack: { tickMs: 50, commandBudgetMs: 400,
      prospectiveReactionSlackMs: -80, currentShotAvoidability: 'unavoidable', threateningBulletCount: 1 } };
  const left = resolveDistanceAwareDodgeCore(closeInput, { rng: () => 0 });
  const right = resolveDistanceAwareDodgeCore(closeInput, { rng: () => 0.99 });
  assert(left.applied && right.applied && left.direction.dy !== right.direction.dy,
    'random choice explores both equally risky tangents');
  const held = resolveDistanceAwareDodgeCore({ ...closeInput, nowMs: 10100, previousState: left.state }, { rng: () => 0.99 });
  assert.strictEqual(held.direction.dy, left.direction.dy, 'latch prevents per-frame random reversal');
  const changedRisk = resolveDistanceAwareDodgeCore({ ...closeInput, nowMs: 10100, previousState: left.state,
    dodge: { threatField: [{ ...allHit[0], directHits: 2 }, allHit[1]] } }, { rng: () => 0 });
  assert.strictEqual(changedRisk.direction.dy, 1, 'new collision risk immediately invalidates latch');
  const axisReversalInput = {
    ...closeInput,
    radialIntentVector: { dx: 0, dy: -1 }
  };
  const axisReversalFirst = resolveDistanceAwareDodgeCore(axisReversalInput, { rng: () => 0 });
  const axisReversalOther = resolveDistanceAwareDodgeCore(axisReversalInput, { rng: () => 0.99 });
  assert(axisReversalFirst.applied && axisReversalOther.applied
    && axisReversalFirst.closeTangentAxisReversal && axisReversalOther.closeTangentAxisReversal
    && axisReversalFirst.randomChoice?.candidateCount === 2
    && axisReversalOther.randomChoice?.candidateCount === 2
    && axisReversalFirst.direction.dy === -1 && axisReversalOther.direction.dy === 1
    && axisReversalFirst.radialOverrideReason === 'emergency-close-tangent-reversal',
  'close unavoidable fire exposes both equally safe tangent signs to the random choice');
  assert(axisReversalFirst.randomChoice?.holdMs >= 250
    && axisReversalFirst.randomChoice?.holdMs <= 400
    && axisReversalOther.randomChoice?.holdMs >= 250
    && axisReversalOther.randomChoice?.holdMs <= 400
    && axisReversalOther.randomChoice.holdMs > axisReversalFirst.randomChoice.holdMs,
  'close tangent hold duration is sampled inside the bounded interval');
  const sameLaneResample = resolveDistanceAwareDodgeCore({
    ...axisReversalInput,
    nowMs: 10260,
    previousState: axisReversalFirst.state
  }, { rng: () => 0 });
  assert(sameLaneResample.applied && sameLaneResample.direction.dy === -1
    && sameLaneResample.randomChoice?.forcedDirectionChange === false,
  'a random repeat may extend the current lane only up to its hard age cap');
  const forcedAlternate = resolveDistanceAwareDodgeCore({
    ...axisReversalInput,
    nowMs: 10401,
    previousState: sameLaneResample.state
  }, { rng: () => 0 });
  assert(forcedAlternate.applied && forcedAlternate.direction.dy === 1
    && forcedAlternate.randomChoice?.forcedDirectionChange === true,
  'the lane age cap forces the other safe tangent instead of resampling the same axis indefinitely');
  const distantAxisReversal = resolveDistanceAwareDodgeCore({
    ...axisReversalInput,
    reactionSlack: { ...axisReversalInput.reactionSlack, prospectiveReactionSlackMs: 900 }
  }, { rng: () => 0.99 });
  assert(!distantAxisReversal.applied && !distantAxisReversal.closeTangentAxisReversal,
  'distant late fire does not receive the close-tangent axis reversal');
  assert(resolveDistanceAwareDodgeCore({ ...closeInput, lowStamina: true }, { rng: () => 0 }).applied);
  for (const extra of [{ exitActive: true }, { collisionRisk: true },
    { reactionSlack: { ...closeInput.reactionSlack, prospectiveReactionSlackMs: 900 } }]) {
    assert(!resolveDistanceAwareDodgeCore({ ...closeInput, ...extra }, { rng: () => 0 }).applied,
      'safety and a distant late shot cannot authorize close tangents');
  }
  const improvedAllCollision = resolveDistanceAwareDodgeCore({
    ...closeInput,
    reactionSlack: { ...closeInput.reactionSlack, prospectiveReactionSlackMs: 900 },
    dodge: { threatField: [
      { dx: 1, dy: 0, directHits: 2, physicalHits: 2, robustHits: 2, minCPA: 20,
        minRawCpaCm: 20, minRobustCpaCm: 20 },
      { dx: 0, dy: -1, directHits: 1, physicalHits: 1, robustHits: 1, minCPA: 80,
        minRawCpaCm: 80, minRobustCpaCm: 80 },
      { dx: 0, dy: 1, directHits: 1, physicalHits: 1, robustHits: 1, minCPA: 80,
        minRawCpaCm: 80, minRobustCpaCm: 80 }
    ] }
  }, { rng: () => 0 });
  assert(improvedAllCollision.applied
    && improvedAllCollision.blockedReason === 'unavoidable-best-risk-fallback'
    && improvedAllCollision.direction.dy === -1,
  'all-collision fallback uses the complete risk key beyond the close budget');
  const unavoidablePlan = buildCombatMovementPlan({ ...self, stamina_5s_remaining_milli: 10000 }, target,
    [{ ...bullet, remainingTicks: 10 }], { ...options, movementExecutionTiming: { sampleCount: 10, medianTicks: 5, p90Ticks: 5 } });
  assert.strictEqual(unavoidablePlan.distanceAwareDodge.preDodgeReason, 'unavoidable-close-tangent');
  assert.strictEqual(unavoidablePlan.dy, unavoidablePlan.distanceAwareDodge.direction.dy,
    'selected tangent survives final movement arbitration');
  const diagonalTangent = buildCombatMovementPlan({ ...self, vy: -50, stamina_5s_remaining_milli: 10000 },
    { ...target, x: -2500, y: -1500, vx: 35, vy: 35, distance: Math.hypot(2500, 1500) },
    [{ ...bullet, bullet_id: 1, ownerId: 2, cpa: 10 }], {
      ...options, distanceAwareDodgeRng: () => 0.25,
      movementExecutionTiming: { sampleCount: 10, medianTicks: 5, p90Ticks: 5 }
    });
  assert.deepStrictEqual([diagonalTangent.distanceAwareDodge.direction.dx, diagonalTangent.distanceAwareDodge.direction.dy],
    [1, -1], 'fixture selects a new equally risky diagonal instead of the early cardinal direction');
  assert.deepStrictEqual([diagonalTangent.dx, diagonalTangent.dy], [1, -1],
    'current verified close tangent must reach the final movement command');
  assert.deepStrictEqual(diagonalTangent.dodgeOwnership.direction, { dx: 1, dy: -1 },
    'retained ownership must carry the direction actually selected for execution');
  assert.strictEqual(diagonalTangent.dodgeOwnership.executionDirection.reason, 'current-risk-verified-dodge');
  const owned = { active: true, currentThreat: true, direction: { dx: 0, dy: -1 } };
  const candidate = { dx: 1, dy: -1 };
  const baselineRisk = { ...owned.direction, directHits: 1, unavoidableHits: 1 };
  const candidateRisk = { ...candidate, directHits: 1, unavoidableHits: 1 };
  const execute = extra => resolveDodgeExecutionDirectionCore({
    ownership: owned, evaluated: true, evaluatedDirection: candidate,
    threatField: [baselineRisk, candidateRisk], ...extra
  });
  assert.deepStrictEqual(execute().direction, candidate);
  assert(execute().accepted && execute().changed);
  const originalOwned = JSON.stringify(owned);
  execute();
  assert.strictEqual(JSON.stringify(owned), originalOwned, 'the pure gate cannot mutate a previous lease');
  for (const field of [[], [baselineRisk], [candidateRisk],
    [baselineRisk, { ...candidateRisk, directHits: 2 }],
    [{ ...baselineRisk, minRawCpaCm: 300, minRawClearanceCm: 210,
      minRobustCpaCm: 300, minRobustClearanceCm: 210 }, {
      ...candidateRisk,
      minRawCpaCm: 120,
      minRawClearanceCm: 30,
      minRobustCpaCm: 120,
      minRobustClearanceCm: 30
    }],
    [baselineRisk, { ...candidateRisk, directHits: null }]]) {
    const denied = execute({ threatField: field });
    assert(!denied.accepted);
    assert.deepStrictEqual(denied.direction, owned.direction,
      'missing evidence or increased total/imminent risk must preserve emergency ownership');
  }
  const explanatoryTie = execute({
    threatField: [
      { ...baselineRisk, unavoidableHits: 0 },
      { ...candidateRisk, unavoidableHits: 1 }
    ]
  });
  assert(explanatoryTie.accepted,
    'unavoidableHits is explanatory and cannot deny an otherwise equal complete risk key');
  const missingExplanatoryField = execute({
    threatField: [baselineRisk, { ...candidateRisk, unavoidableHits: undefined }]
  });
  assert(missingExplanatoryField.accepted,
    'a missing explanatory field cannot substitute for collision risk evidence');
  assert(!execute({ evaluated: false }).accepted, 'a budget-blocked candidate has no execution authority');
  const safe = execute({ threatField: [baselineRisk, { ...candidateRisk, directHits: 0, unavoidableHits: 0 }] });
  assert(safe.accepted, 'strictly safer current trajectories remain eligible');
  const progressField = [
    { dx: -1, dy: -1, directHits: 0, physicalHits: 0, robustHits: 0,
      minRawCpaCm: 518.6264, minRobustCpaCm: 518.6264, worstCaseCpaCm: 518.6264, scheduleRobust: true },
    { dx: -1, dy: 1, directHits: 0, physicalHits: 0, robustHits: 0,
      minRawCpaCm: 422.2327, minRobustCpaCm: 422.2327, worstCaseCpaCm: 422.2327, scheduleRobust: true }
  ];
  const progressArbitration = selectCombatMovementArbitrationCore({
    threatField: progressField,
    strategicDirection: { dx: -1, dy: 1 },
    currentDirection: { dx: -1, dy: -1 },
    emergencyDirection: { dx: -1, dy: -1 },
    preferStrategicProgress: true
  }, { minimumCpaCm: 200 });
  const progressExecution = resolveDodgeExecutionDirectionCore({
    ownership: owned,
    evaluated: true,
    evaluatedDirection: progressArbitration,
    threatField: progressField,
    preferSafeProgress: true,
    minimumCpaCm: 200
  });
  const unsafeProgressExecution = resolveDodgeExecutionDirectionCore({
    ownership: owned,
    evaluated: true,
    evaluatedDirection: { dx: -1, dy: 1 },
    threatField: [progressField[0], { ...progressField[1], physicalHits: 1, robustHits: 1,
      directHits: 1, worstCaseCpaCm: 180, minCPA: 180, minRawCpaCm: 180, minRobustCpaCm: 180 }],
    preferSafeProgress: true,
    minimumCpaCm: 200
  });
  const missingProgressExecution = resolveDodgeExecutionDirectionCore({
    ownership: owned,
    evaluated: true,
    evaluatedDirection: { dx: -1, dy: 1 },
    threatField: [progressField[0]],
    preferSafeProgress: true,
    minimumCpaCm: 200
  });
  assert.strictEqual(progressArbitration.source, 'strategic-safe');
  assert(progressExecution.accepted
    && progressExecution.reason === 'strategic-safe-progress'
    && progressExecution.direction.dx === -1 && progressExecution.direction.dy === 1,
  'a safe lower-clearance escort direction keeps primary progress over retained emergency ownership');
  assert(!unsafeProgressExecution.accepted
    && unsafeProgressExecution.reason === 'strategic-progress-not-safe'
    && unsafeProgressExecution.direction.dy === -1,
  'safe-progress preference still rejects a collision or below-threshold candidate');
  assert(!missingProgressExecution.accepted
    && missingProgressExecution.reason === 'strategic-progress-not-safe'
    && missingProgressExecution.direction.dy === -1,
  'safe-progress preference rejects a candidate absent from the current native risk field');
  const initialProgressLane = stabilizeCombatMovementDirectionCore({
    nowMs: 10000,
    tick: 200,
    targetId: '2',
    engagementId: 'escort-progress',
    candidateDirection: { dx: -1, dy: -1 },
    currentDirection: { dx: -1, dy: -1 },
    threatField: progressField,
    movementTiming: { sampleCount: 10, medianTicks: 2, p90Ticks: 2 }
  }, { minimumCpaCm: 200 });
  const policyHeldProgressLane = stabilizeCombatMovementDirectionCore({
    nowMs: 10050,
    tick: 201,
    targetId: '2',
    engagementId: 'escort-progress',
    candidateDirection: { dx: -1, dy: 1 },
    currentDirection: { dx: -1, dy: -1 },
    threatField: progressField,
    movementTiming: { sampleCount: 10, medianTicks: 2, p90Ticks: 2 },
    previousState: initialProgressLane.state
  }, { minimumCpaCm: 200 });
  const progressLaneRelease = stabilizeCombatMovementDirectionCore({
    nowMs: 10050,
    tick: 201,
    targetId: '2',
    engagementId: 'escort-progress',
    candidateDirection: { dx: -1, dy: 1 },
    currentDirection: { dx: -1, dy: -1 },
    threatField: progressField,
    movementTiming: { sampleCount: 10, medianTicks: 2, p90Ticks: 2 },
    previousState: initialProgressLane.state,
    strategicProgressOverride: true
  }, { minimumCpaCm: 200 });
  assert(policyHeldProgressLane.held && policyHeldProgressLane.direction.dy === -1,
    'ordinary stability retains its conservative safe-lane behavior');
  assert(!progressLaneRelease.held && progressLaneRelease.switched
    && progressLaneRelease.direction.dy === 1
    && progressLaneRelease.reason === 'movement-stability-strategic-progress-release',
  'a fully verified escort progress direction releases the stale safe-lane hold');
  const escortProgressPlan = buildCombatMovementPlan(
    { user_id: 1, x: 0, y: 0, vx: 0, vy: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
    { user_id: 2, x: 0, y: 5000, vx: 0, vy: 0, distance: 5000, hp: 80,
      active: true, combatRole: 'secondary', secondaryTarget: true },
    [{ bullet_id: 1, ownerId: 2, x: -4000, y: 2000, distance: 4472,
      incoming: true, speed: 500, direction: { dx: 1, dy: 0 }, timeToImpact: 800,
      remainingTicks: 16 }],
    {
      nowMs: 10000,
      profitMission: {
        active: true, key: 'enemy:3', missionKey: 'enemy:3', type: 'enemy', targetId: '3',
        navigationTarget: { userId: 3, x: 0, y: 10000, authority: 'realtime' }, expiresAt: 20000
      },
      profitEscortContinuity: {
        active: true, missionKey: 'enemy:3', combatTargetId: '2',
        engagementGeneration: 'escort-progress', controlGeneration: 'control:1', expiresAt: 20000
      },
      engagementGeneration: 'escort-progress',
      controlGeneration: 'control:1',
      residualThreatLease: {
        active: true, currentCollision: false, ageMs: 100, leaseMs: 2500,
        direction: { dx: 0, dy: -1 }, ownerIds: ['2'], threatGeneration: 'bullet:1'
      },
      combatTargetState: { lastThreatAt: 9900 },
      combatDistanceAwareDodgeEnabled: false,
      combatMovementSafeCpaCm: 200,
      combatCoverEnabled: false
    }
  );
  assert.deepStrictEqual([escortProgressPlan.dx, escortProgressPlan.dy], [0, 1]);
  assert.strictEqual(escortProgressPlan.reason, 'profit-escort-safe-progress');
  assert.strictEqual(escortProgressPlan.ownership.owner, 'emergency-dodge');
  assert.strictEqual(escortProgressPlan.dodgeOwnership.executionDirection.reason, 'strategic-safe-progress');
  assert.strictEqual(escortProgressPlan.profitEscort.overrideReason, '');
  const prospective = execute({ ownership: { ...owned, currentThreat: false }, threatField: [] });
  assert(prospective.accepted, 'a lease without current collision evidence cannot erase an authorized pre-dodge');
  const axisStop = execute({ evaluatedDirection: { dx: 0, dy: 1 },
    threatField: [baselineRisk, { dx: 0, dy: 1, directHits: 1, unavoidableHits: 1 }] });
  assert.deepStrictEqual(axisStop.direction, { dx: 0, dy: 1 }, 'explicit zero axes survive final ownership');
  const lowBudget = buildCombatMovementPlan({ ...self, vy: -50, stamina_5s_remaining_milli: 2400 },
    { ...target, x: -2500, y: -1500, vx: 35, vy: 35, distance: Math.hypot(2500, 1500) },
    [{ ...bullet, bullet_id: 1, ownerId: 2, cpa: 10 }], options);
  assert(lowBudget.distanceAwareDodge.applied);
  assert.notStrictEqual(lowBudget.distanceAwareDodge.preDodgeReason, 'stamina-insufficient');
  assert(lowBudget.dodgeOwnership.executionDirection.accepted, 'low stamina cannot erase the evaluated Dodge direction');
  // A diagonal escort heading used to exclude both cardinal tangents even
  // when every direction had the same unavoidable current-shot risk.
  const escortSelf = { ...self, hp: 100, vy: -50, stamina_5s_remaining_milli: 6600 };
  const escortTarget = { ...target, x: 9, y: -2871, vx: 0, vy: -50,
    distance: Math.hypot(9, 2871), combatIntent: 'defensive' };
  const escortBullet = { ...bullet, x: 0, y: -200, bullet_id: 1, ownerId: 2,
    direction: { dx: 0, dy: 1 }, remainingTicks: 10, cpa: 0 };
  const escortOptions = { ...options, combatCoverEnabled: false,
    movementExecutionTiming: { sampleCount: 10, medianTicks: 2, p90Ticks: 3 },
    profitMission: { active: true, type: 'enemy', key: 'enemy:3', targetId: 3,
      navigationTarget: { user_id: 3, x: -10000, y: 10000, hp: 100, authority: 'realtime' } } };
  const escortPlan = buildCombatMovementPlan(escortSelf, escortTarget, [escortBullet], escortOptions);
  assert.deepStrictEqual([escortPlan.dx, escortPlan.dy], [-1, 0],
    'nearby unavoidable fire permits a forward cardinal tangent during diagonal escort');
  assert.strictEqual(escortPlan.distanceAwareDodge.radialOverrideReason, 'emergency-close-tangent-reversal');
  assert.strictEqual(escortPlan.dodgeOwnership.executionDirection.reason, 'current-risk-verified-dodge');
  assert(!sameRadialIntentCore({ dx: -1, dy: 0 }, { dx: -1, dy: 1 }),
    'ordinary pre-dodge must still preserve both navigation axes');
  const tangentField = [
    { dx: 0, dy: -1, directHits: 1, unavoidableHits: 1, minCPA: 0 },
    { dx: -1, dy: 0, directHits: 1, unavoidableHits: 1, minCPA: 0 },
    { dx: 1, dy: 0, directHits: 1, unavoidableHits: 1, minCPA: 0 }
  ];
  const escortInput = { ...closeInput, self: escortSelf, target: escortTarget,
    baseMovement: { dx: 0, dy: -1 }, currentDirection: { dx: 0, dy: -1 },
    baseDistanceBand: 'escort', defensiveEscort: true,
    radialIntentVector: { dx: -1, dy: 1 }, dodge: { threatField: tangentField } };
  const pausedAxis = resolveDistanceAwareDodgeCore(escortInput, { rng: () => 0.99 });
  assert(pausedAxis.applied && pausedAxis.direction.dx === 1 && pausedAxis.direction.dy === 0,
    'the close emergency may select the safe tangent that reverses the primary heading');
  for (const extra of [{ defensiveEscort: false }, { baseDistanceBand: 'approach' },
    { currentDirection: { dx: 0, dy: 0 } }, { currentDirection: { dx: -1, dy: -1 } }]) {
    const plan = resolveDistanceAwareDodgeCore({ ...escortInput, ...extra }, { rng: () => 0.5 });
    assert(plan.applied && plan.closeTangentAxisReversal,
      'the approved close-tangent reversal does not depend on one navigation band');
  }
  for (const extra of [{ exitActive: true }, { collisionRisk: true },
    { reactionSlack: { ...closeInput.reactionSlack, prospectiveReactionSlackMs: 900 } }]) {
    assert(!resolveDistanceAwareDodgeCore({ ...escortInput, ...extra }, { rng: () => 0.5 }).applied,
      'the exception still requires close current risk and unchanged safety gates');
  }
  const changedTangentFallback = resolveDistanceAwareDodgeCore({ ...escortInput,
    dodge: { threatField: [
      ...tangentField.map(row => row.dx === -1 ? { ...row, directHits: 2 } : row),
      { dx: -1, dy: 1, directHits: 1, unavoidableHits: 1, minCPA: 0 }
    ] }
  }, { rng: () => 0.5 });
  assert(changedTangentFallback.applied
    && changedTangentFallback.blockedReason === 'unavoidable-close-tangent'
    && changedTangentFallback.direction.dx === 1
    && changedTangentFallback.direction.dy === 0,
  'the close tangent pool contains only the best available collision-risk tier');
  const boundedTangent = resolveDistanceAwareDodgeCore(escortInput, { rng: () => 0,
    boundaryMarginCm: 0, boundary: { minX: 0, maxX: 10000, minY: -10000, maxY: 10000 } });
  assert(boundedTangent.applied && boundedTangent.direction.dx === 1 && boundedTangent.direction.dy === 0,
    'the broadened tangent choice still removes candidates outside the movement boundary');
  const strictAxis = resolveDistanceAwareDodgeCore({ ...escortInput,
    target: { ...escortTarget, x: 0, y: -3000 },
    dodge: { threatField: [...tangentField, { dx: -1, dy: 1, directHits: 1, unavoidableHits: 1, minCPA: 0 }] }
  }, { rng: () => 0.5 });
  assert.strictEqual(strictAxis.radialOverrideReason, 'emergency-close-tangent-reversal',
    'all equally safe geometric tangents remain eligible in the close emergency');
  for (let turns = 0; turns < 4; turns++) {
    const rotate = (x, y) => {
      for (let n = 0; n < turns; n++) [x, y] = [-y, x];
      return [x || 0, y || 0];
    };
    const vector = v => { const [dx, dy] = rotate(v.dx, v.dy); return { ...v, dx, dy }; };
    const [x, y] = rotate(escortTarget.x, escortTarget.y);
    const rotated = resolveDistanceAwareDodgeCore({ ...escortInput, target: { ...escortTarget, x, y },
      baseMovement: vector(escortInput.baseMovement), currentDirection: vector(escortInput.currentDirection),
      radialIntentVector: vector(escortInput.radialIntentVector), dodge: { threatField: tangentField.map(vector) }
    }, { rng: () => 0.99 });
    assert(rotated.applied);
    assert.deepStrictEqual([rotated.direction.dx, rotated.direction.dy], rotate(1, 0),
      'the emergency rule must generalize across all map orientations');
  }
  const resumedNavigation = buildCombatMovementPlan(escortSelf, escortTarget, [], {
    ...escortOptions, combatTargetState: {}, distanceAwareDodgeState: escortPlan.distanceAwareDodge.state,
    nowMs: 11000
  });
  assert(!resumedNavigation.distanceAwareDodge.applied,
    'a previous axis pause does not authorize a fresh pre-dodge without current attack evidence');
  assert.deepStrictEqual([resumedNavigation.dx, resumedNavigation.dy], [-1, 1],
    'ordinary primary navigation resumes after the emergency');
  return { ok: true, cases: 65 };
}
module.exports = { runSecondaryDodgeSelfTest };
if (require.main === module) console.log(JSON.stringify(runSecondaryDodgeSelfTest()));
