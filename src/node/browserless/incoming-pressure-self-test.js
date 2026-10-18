'use strict';

const assert = require('assert');

const {
  buildBrowserlessCombatDryRun,
  buildCombatMovementPlan
} = require('./combat-adapter');
const { ownedMovementDirectionCore, selectDodgeThreatDirectionCore } = require('../../strategy/combat-movement-ownership');

function runOwnedMovementDirectionSelfTest() {
  const vectors = [
    { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
    { dx: 1, dy: 0 }, { dx: -1, dy: 0 },
    { dx: 0, dy: 0 }, { dx: -1, dy: 1 }
  ];
  for (const direction of vectors) {
    assert.deepStrictEqual(ownedMovementDirectionCore(direction, { dx: 1, dy: -1 }), direction);
  }
  assert.deepStrictEqual(ownedMovementDirectionCore({ dx: 0 }, { dx: 1, dy: -1 }), { dx: 0, dy: -1 });
  assert.deepStrictEqual(ownedMovementDirectionCore(null, null), { dx: 0, dy: 0 });
  const residualDirection = { dx: 0, dy: -1 };
  const currentDodge = { dx: -1, dy: -1, threatField: [{ dx: -1, dy: -1, directHits: 1 }] };
  assert.strictEqual(selectDodgeThreatDirectionCore({ dodge: currentDodge, residualDirection, hasCollisionBullet: false }), currentDodge);
  assert.strictEqual(selectDodgeThreatDirectionCore({ dodge: { dx: 1, dy: 1 }, residualDirection, hasCollisionBullet: false }), residualDirection);
  assert.strictEqual(selectDodgeThreatDirectionCore({ dodge: currentDodge, residualDirection, hasCollisionBullet: true }), currentDodge);
  const contactEntryDodge = { dx: 1, dy: 0 };
  assert.strictEqual(selectDodgeThreatDirectionCore({ contactEntryDodge, dodge: currentDodge, residualDirection }), contactEntryDodge);

  // Rotate a real incoming projectile scenario through all four quadrants.
  // The late-shot hold used to leak the old axis into the chosen cardinal Dodge.
  for (let rotation = 0; rotation < 4; rotation += 1) {
    const rotate = (x, y) => {
      for (let i = 0; i < rotation; i += 1) [x, y] = [-y, x];
      return { x: x || 0, y: y || 0 };
    };
    const velocity = rotate(-35, 0);
    const targetPoint = rotate(-4000, -3000);
    const self = {
      user_id: 1, x: 0, y: 0, vx: velocity.x, vy: velocity.y,
      hp: 100, max_hp: 100, stamina_5s_remaining_milli: 10000,
      current_join_mode: 'Active', moving: true
    };
    const target = {
      user_id: 2, ...targetPoint, vx: 0, vy: 0, hp: 100, drop: 100,
      current_join_mode: 'Active', active: true
    };
    const decisionState = {
      combatTarget: {
        id: 2, at: 5000, firstSeenAt: 4000, hp: 100, firstHp: 100, minHp: 100,
        originIntent: 'profit', intent: 'profit', combatRole: 'primary', self
      },
      profitMission: {
        active: true, type: 'enemy', targetId: '2',
        navigationTarget: { ...target, authority: 'realtime' }
      }
    };
    const plan = buildCombatMovementPlan(self, { ...target, distance: 5000 }, [{
      bulletId: 'fixture', ownerId: 2, x: target.x / 5, y: target.y / 5,
      vx: -target.x / 10, vy: -target.y / 10, speed: 500,
      direction: { dx: -target.x / 5000, dy: -target.y / 5000 },
      incoming: true, collisionPath: true, distance: 1000, timeToImpact: 100,
      currentTick: 100, createdTick: 90, expireTick: 120
    }], {
      nowMs: 5000, currentTick: 100, combatDistanceAwareDodgeEnabled: true, combatBulletHitRadiusCm: 90,
      movementExecutionTiming: { sampleCount: 10, medianTicks: 2, p90Ticks: 3 },
      combatTargetState: { id: 2, firstSeenAt: 4000, motionSamples: [] }
    });
    assert.deepStrictEqual({ dx: plan.dx, dy: plan.dy }, plan.dodgeOwnership.direction,
      'movement planning must preserve the cardinal Dodge before final arbitration');
    const retainedPlan = buildCombatMovementPlan(self, { ...target, distance: 5000 }, [{
      bulletId: 'fixture', ownerId: 2, x: target.x / 5, y: target.y / 5,
      vx: -target.x / 10, vy: -target.y / 10, speed: 500,
      direction: { dx: -target.x / 5000, dy: -target.y / 5000 },
      incoming: true, collisionPath: true, distance: 1000, timeToImpact: 100,
      currentTick: 100, createdTick: 90, expireTick: 120
    }], {
      nowMs: 5000, currentTick: 100, combatDistanceAwareDodgeEnabled: true, combatBulletHitRadiusCm: 90,
      movementExecutionTiming: { sampleCount: 10, medianTicks: 2, p90Ticks: 3 },
      combatTargetState: { id: 2, firstSeenAt: 4000, motionSamples: [] },
      residualThreatLease: { active: true, ageMs: 50, leaseMs: 2500, direction: { dx: 1, dy: 1 } }
    });
    assert.deepStrictEqual(retainedPlan.dodgeOwnership.direction, plan.dodgeOwnership.direction,
      'fresh trajectory risk must displace a retained direction without static collision evidence');
    const result = buildBrowserlessCombatDryRun({
      userId: 1,
      realtime: {
        tick: 100, receivedAtMs: 5000, frameAgeMs: 0, self,
        entities: [self, target],
        bullets: [{
          bullet_id: 1, owner_id: 2, start_x: target.x, start_y: target.y,
          target_x: 0, target_y: 0, created_tick: 92, expire_tick: 122, speed: 500
        }]
      }
    }, {
      nowMs: 5000, controlMode: 'profit-live', combatEnabled: true, liveCombatEnabled: true,
      combatAttackRange: 14500, combatDistanceAwareDodgeEnabled: true, combatBulletHitRadiusCm: 90,
      movementExecutionTiming: { sampleCount: 10, medianTicks: 2, p90Ticks: 3 },
      decisionState, profitMission: decisionState.profitMission
    });
    const selected = result.movement.dodgeOwnership.direction;
    assert.strictEqual(result.movement.ownership.owner, 'emergency-dodge');
    assert.strictEqual(Math.abs(selected.dx) + Math.abs(selected.dy), 1, 'fixture selects a cardinal Dodge');
    assert.deepStrictEqual({ dx: result.movement.dx, dy: result.movement.dy }, selected,
      'final combat movement must preserve both axes of the selected Dodge');
    assert.deepStrictEqual(decisionState.combatTarget.lastDodgeDirection, selected,
      'residual continuation must remember the same vector');
    assert.strictEqual(result.shooting.wouldShoot, true, 'Dodge correction must preserve in-range fire');
    assert.strictEqual(result.exit, null);
  }
  return { ok: true, cases: 16 };
}

function buildIncomingPressureFixture({ nowMs = 10000, selfHp = 91, stamina = 3200 } = {}) {
  const self = {
    user_id: 1,
    name: 'self',
    x: 0,
    y: 0,
    hp: selfHp,
    max_hp: 100,
    stamina_5s_remaining_milli: stamina,
    current_join_mode: 'Active'
  };
  const primary = {
    user_id: 101,
    name: 'primary',
    x: 392,
    y: 0,
    hp: 1,
    drop: 573,
    current_join_mode: 'Active',
    active: true,
    moving: true,
    firing: false,
    alive: true
  };
  const secondary = {
    user_id: 202,
    name: 'secondary',
    x: 2046,
    y: 0,
    hp: 100,
    drop: 3719,
    current_join_mode: 'Active',
    active: true,
    moving: true,
    firing: true,
    alive: true,
    dynamicWhitelistMember: true,
    whitelisted: true
  };
  const sample = (at, ownerId) => ({
    at,
    ownerId,
    x: ownerId === 202 ? 2046 : 392,
    y: 0,
    distance: ownerId === 202 ? 2046 : 392,
    newBulletCount: 1,
    firing: true,
    selfHp: at === 9000 ? 94 : 91,
    selfHpLoss: at === 9000 ? 3 : 3,
    selfDamageAmount: 3,
    attributableSelfDamage: true
  });
  const secondaryState = {
    id: '202',
    at: nowMs - 100,
    firstSeenAt: nowMs - 3000,
    name: 'secondary',
    x: secondary.x,
    y: secondary.y,
    hp: 100,
    firstHp: 100,
    minHp: 100,
    drop: secondary.drop,
    dropKnown: true,
    distance: 2046,
    active: true,
    moving: true,
    firing: true,
    lastFiringAt: nowMs - 100,
    lastThreatAt: nowMs - 100,
    lastIncomingBulletAt: nowMs - 100,
    lastSelfDamageAt: nowMs - 200,
    lastSelfDamage: 3,
    hasDamagedSelf: true,
    selfHpLossObserved: true,
    combatRole: 'secondary',
    secondaryTarget: true,
    primaryTargetId: '101',
    originIntent: 'defensive',
    intent: 'defensive',
    whitelisted: true,
    dynamicWhitelistMember: true,
    lastDodgeDirection: { dx: 1, dy: 0 },
    motionSamples: [sample(9000, 202), sample(9500, 202)],
    self: { ...self, hp: selfHp }
  };
  const primaryState = {
    id: '101',
    at: nowMs - 200,
    firstSeenAt: nowMs - 3000,
    name: 'primary',
    x: primary.x,
    y: primary.y,
    hp: 1,
    firstHp: 43,
    minHp: 1,
    drop: primary.drop,
    dropKnown: true,
    distance: 392,
    active: true,
    moving: true,
    firing: true,
    lastFiringAt: nowMs - 200,
    combatRole: 'primary',
    primaryTargetId: '101',
    originIntent: 'profit',
    intent: 'profit',
    motionSamples: [sample(9000, 101), sample(9500, 101)],
    self: { ...self, hp: selfHp }
  };
  const stateful = {
    profitMission: {
      active: true,
      targetId: '101',
      type: 'enemy',
      navigationAuthority: 'realtime',
      navigationTarget: { ...primary, authority: 'realtime', distance: 392 }
    },
    combatTarget: secondaryState,
    combatEngagements: {
      '202': secondaryState,
      '101': primaryState
    },
    combatMetrics: {
      targetId: '202',
      targetName: 'secondary',
      startedAt: nowMs - 3000,
      engagementId: 'self-test-engagement',
      engagementGeneration: 'self-test-generation',
      controlGeneration: 'self-test-control',
      acceptedShots: 5,
      actualShots: 5,
      confirmedHits: 0,
      targetDamage: 0,
      totalStaminaSpent: 0,
      lastSelectedDodgeDirection: { dx: 1, dy: 0 }
    },
    combatMetricsByTarget: {
      '202': { targetId: '202', targetDamage: 0 },
      '101': { targetId: '101', targetDamage: 42 }
    },
    combatExecutionLedger: { dispatchTimesByTarget: {} }
  };
  const state = {
    userId: 1,
    realtime: {
      tick: Math.round(nowMs / 50),
      receivedAtMs: nowMs,
      frameAgeMs: 0,
      self,
      entities: [self, primary, secondary],
      bullets: []
    }
  };
  const options = {
    controlMode: 'profit-live',
    combatEnabled: true,
    liveCombatEnabled: true,
    decisionState: stateful,
    profitMission: stateful.profitMission,
    nowMs,
    combatAttackRange: 14500,
    attackRange: 14500,
    dynamicWhitelistMemberUserIds: [202],
    dynamicWhitelistEnabledUserIds: [202],
    dailyDamageUserIds: [202],
    combatRealtimeTargetFreshMs: 500,
    incomingPressureEvidenceLeaseMs: 2500
  };
  return { state, stateful, options, self, primary, secondary };
}

function runIncomingPressureSelfTest() {
  const ownedMovementDirection = runOwnedMovementDirectionSelfTest();
  const fixture = buildIncomingPressureFixture();
  const result = buildBrowserlessCombatDryRun(fixture.state, fixture.options);
  assert.strictEqual(result.target?.userId, 202, 'secondary must remain the realtime combat target');
  assert.strictEqual(result.shooting.primaryRewardSurvivalRace.closePressureActive, false);
  assert.strictEqual(result.incomingPressureEvidence.active, true);
  assert.deepStrictEqual(
    result.incomingPressureContext.incomingOwnerIds.sort(),
    ['101', '202']
  );
  assert.strictEqual(result.shooting.primaryRewardSurvivalRace.incomingOwnerCount, 2);
  assert.strictEqual(result.shooting.primaryRewardSurvivalRace.opponentShots, 4);
  assert.strictEqual(result.shooting.primaryRewardSurvivalRace.observedIncomingRateHpPerSec, 6);
  assert.strictEqual(result.shooting.primaryRewardSurvivalRace.evaluated, true);
  assert.strictEqual(result.shooting.primaryRewardSurvivalRace.continuePrimary, true);
  assert.strictEqual(result.shooting.primaryFinishRace.eligible, true);
  assert.strictEqual(result.shooting.primaryFinishRace.reason, 'primary-finish-race-soft-reserve-override');
  assert.strictEqual(result.fireTargetRole, 'primary');
  assert.strictEqual(result.shooting.wouldShoot, true);
  assert.strictEqual(result.exit, null);

  const movementOptions = {
    nowMs: 10000,
    currentTick: 200,
    combatAttackRange: 14500,
    combatTargetState: {
      id: '202',
      combatRole: 'secondary',
      secondaryTarget: true,
      lastThreatAt: 9000,
      motionSamples: []
    },
    residualThreatLease: {
      active: true,
      source: 'retained-owner-evidence',
      ownerIds: ['202'],
      threatGeneration: 'residual-self-test',
      evidenceAt: 9000,
      ageMs: 650,
      leaseMs: 2500,
      direction: { dx: 1, dy: 0 },
      currentCollision: false
    },
    previousDodgeOwnership: {
      active: true,
      threatGeneration: 'residual-self-test',
      direction: { dx: 1, dy: 0 },
      at: 9000,
      holdUntil: 9500
    },
    combatDodgeOwnershipHoldMs: 500
  };
  const residualMovement = buildCombatMovementPlan(
    fixture.self,
    { ...fixture.secondary, distance: 2046 },
    [],
    movementOptions
  );
  assert.strictEqual(residualMovement.residualThreatLease.active, true);
  assert.strictEqual(residualMovement.residualThreatLease.retained, true);
  assert.strictEqual(residualMovement.residualThreatLease.dodgeContinuationMs, 650);
  assert.strictEqual(residualMovement.ownership.owner, 'emergency-dodge');
  assert.ok(residualMovement.modifiers.includes('dodge'));

  // One millisecond past the Dodge continuation window the retained defensive evidence must
  // still be retained (the 2500ms lease is untouched) while Dodge is no longer forced.
  const continuationExpiredMovement = buildCombatMovementPlan(
    fixture.self,
    { ...fixture.secondary, distance: 2046 },
    [],
    {
      ...movementOptions,
      nowMs: 9651,
      currentTick: 213,
      residualThreatLease: {
        ...movementOptions.residualThreatLease,
        ageMs: 651
      }
    }
  );
  assert.strictEqual(continuationExpiredMovement.residualThreatLease.active, false);
  assert.strictEqual(continuationExpiredMovement.residualThreatLease.retained, true);
  assert.strictEqual(continuationExpiredMovement.residualThreatLease.dodgeContinuationExpired, true);
  assert.notStrictEqual(continuationExpiredMovement.ownership.owner, 'emergency-dodge');
  assert.ok(!continuationExpiredMovement.modifiers.includes('dodge'));

  // A current collision-path bullet stays authoritative for the whole retention lease.
  const collisionMovement = buildCombatMovementPlan(
    fixture.self,
    { ...fixture.secondary, distance: 2046 },
    [],
    {
      ...movementOptions,
      nowMs: 11500,
      currentTick: 229,
      residualThreatLease: {
        ...movementOptions.residualThreatLease,
        source: 'current-collision-bullet',
        ageMs: 2500,
        currentCollision: true
      }
    }
  );
  assert.strictEqual(collisionMovement.residualThreatLease.active, true);
  assert.strictEqual(collisionMovement.ownership.owner, 'emergency-dodge');
  assert.ok(collisionMovement.modifiers.includes('dodge'));

  const expiredMovement = buildCombatMovementPlan(
    fixture.self,
    { ...fixture.secondary, distance: 2046 },
    [],
    {
      ...movementOptions,
      nowMs: 11501,
      currentTick: 230,
      residualThreatLease: {
        ...movementOptions.residualThreatLease,
        source: 'current-collision-bullet',
        ageMs: 2501,
        currentCollision: true
      }
    }
  );
  assert.strictEqual(expiredMovement.residualThreatLease.active, false);
  assert.strictEqual(expiredMovement.residualThreatLease.retained, false);
  assert.notStrictEqual(expiredMovement.ownership.owner, 'emergency-dodge');
  assert.ok(!expiredMovement.modifiers.includes('dodge'));

  const lowHpFixture = buildIncomingPressureFixture({ selfHp: 50 });
  const lowHpResult = buildBrowserlessCombatDryRun(lowHpFixture.state, lowHpFixture.options);
  assert.strictEqual(lowHpResult.target?.userId, 202);
  assert.strictEqual(lowHpResult.exit?.reason, 'combat-low-hp-secondary-leave');
  assert.strictEqual(lowHpResult.shooting.wouldShoot, false);

  return {
    ok: true,
    cases: 6 + ownedMovementDirection.cases,
    ownedMovementDirection,
    pressureEvidence: result.incomingPressureEvidence,
    primaryFinishRace: result.shooting.primaryFinishRace,
    residualMovement: {
      owner: residualMovement.ownership.owner,
      continuationExpiredOwner: continuationExpiredMovement.ownership.owner,
      collisionOwner: collisionMovement.ownership.owner,
      expiredOwner: expiredMovement.ownership.owner
    },
    lowHpExit: lowHpResult.exit?.reason
  };
}

module.exports = { buildIncomingPressureFixture, runIncomingPressureSelfTest };

if (require.main === module) {
  console.log(JSON.stringify(runIncomingPressureSelfTest(), null, 2));
}
