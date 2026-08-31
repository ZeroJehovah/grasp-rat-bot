'use strict';

const assert = require('assert');

const {
  buildBrowserlessCombatDryRun,
  buildCombatMovementPlan
} = require('./combat-adapter');

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
    cases: 6,
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
