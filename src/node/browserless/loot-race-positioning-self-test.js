'use strict';

const assert = require('assert');
const { buildCombatMovementPlan } = require('./combat-adapter');

function closePressureRange(minRangeCm = 0) {
  return {
    rangeCm: 3408,
    minRangeCm,
    maxRangeCm: 3508,
    reactiveBoundaryCm: 4500,
    normalMinRangeCm: 3509,
    normalMaxRangeCm: 4508,
    unconstrainedRangeCm: 3500,
    flightMs: 450,
    responseBudgetMs: 350,
    tickMs: 50,
    bulletSpeedCmPerTick: 500,
    controlIntervalMs: 50,
    movementP90Ticks: 1,
    playerSpeedCmPerTick: 50,
    hitRadiusCm: 90,
    clearanceTicks: 2,
    clearanceMs: 100,
    zeroLatencyUnreliableRangeCm: 1000,
    frameJitterMs: 50,
    reactionSafetyMarginMs: 100,
    ballisticConstraintSatisfied: false,
    progressiveMissClose: true,
    efficiencyDistanceControl: true
  };
}

function fixtureOptions(enabled, minRangeCm = 0) {
  const self = {
    user_id: 28886,
    x: -55293,
    y: -296,
    hp: 97,
    vx: 50,
    vy: 0
  };
  const target = {
    user_id: 31361,
    x: -54408,
    y: -2788,
    hp: 11,
    drop: 47,
    dropKnown: true,
    dropAuthority: 'realtime',
    profitMetadataAuthority: 'snapshot',
    distance: 2644,
    active: true,
    firing: false,
    combatIntent: 'reengage'
  };
  const competitor = {
    user_id: 10283,
    x: -51804,
    y: -1301,
    hp: 100,
    active: true,
    current_join_mode: 'Active',
    vx: 0,
    vy: 0
  };
  const combatTargetState = {
    id: '31361',
    combatPhase: 'close-pressure',
    closePressure: {
      active: true,
      range: closePressureRange(minRangeCm),
      pressureAttackCommitted: true
    },
    firstHp: 44,
    minHp: 11,
    damageFromStart: 33,
    lastDamageAmount: 3,
    noDamageMs: 101,
    lastDamageAt: 1786689542703,
    firstSeenAt: 1786689501645,
    at: 1786689542753,
    originIntent: 'profit',
    intent: 'reengage',
    acceptedShotsAtLastDamage: 0,
    acceptedShotsSinceDamage: 1,
    opponentBehaviorState: {
      mode: 'zigzag-strafe',
      confidence: 0.89,
      responsePolicy: { name: 'opponent-exhausted-window', closeIn: true }
    },
    escapeDecision: { confirmed: false }
  };
  return {
    nowMs: 1786689542753,
    combatTargetState,
    realtimeTargets: [self, target, competitor],
    combatMetrics: { targetDamage: 33, confirmedHits: 10 },
    combatAim: {
      predictedTargetAtCreation: { x: -54358, y: -2788 },
      x: -54094,
      y: -2793
    },
    combatLootRacePositioningEnabled: enabled,
    combatLootRaceCompetitorEtaMarginMs: 350,
    combatLootRaceMaxKillHorizonMs: 1200,
    combatLootRaceMinSelfHp: 50,
    combatLootRaceMinOwnEtaMs: 250,
    combatMoveSpeedPerTick: 50,
    combatControlIntervalMs: 50,
    combatShootMinIntervalMs: 160,
    self,
    target
  };
}

function distanceTo(point, target) {
  return Math.hypot(
    Number(point.x) - Number(target.x),
    Number(point.y) - Number(target.y)
  );
}

function runLootRacePositioningSelfTest() {
  const disabledInput = fixtureOptions(false);
  const disabled = buildCombatMovementPlan(
    disabledInput.self,
    disabledInput.target,
    [],
    disabledInput
  );
  assert.strictEqual(disabled.dx, 1);
  assert.strictEqual(disabled.dy, 0);
  assert.strictEqual(disabled.reason, 'close-pressure-deterministic-strafe');

  const enabledInput = fixtureOptions(true);
  const enabled = buildCombatMovementPlan(
    enabledInput.self,
    enabledInput.target,
    [],
    enabledInput
  );
  assert.strictEqual(enabled.dx, 1);
  assert.strictEqual(enabled.dy, -1);
  assert.strictEqual(enabled.reason, 'combat-loot-race-approach');
  assert.deepStrictEqual(enabled.lootRacePositioning.direction, { dx: 1, dy: -1 });
  assert.strictEqual(enabled.lootRacePositioning.applied, true);
  assert.strictEqual(enabled.lootRacePositioning.competitorId, '10283');
  assert.strictEqual(enabled.lootRacePositioning.targetDropSource, 'realtime-target-drop');
  assert.strictEqual(enabled.lootRacePositioning.targetDropAuthority, 'realtime');
  assert.strictEqual(enabled.lootRacePositioning.dropPointSource, 'aim-predicted-target-at-creation');
  assert.strictEqual(enabled.lootRacePositioning.killHorizonMs, 640);
  const dropPoint = enabled.lootRacePositioning.dropPoint;
  const baselineNext = {
    x: enabledInput.self.x + disabled.dx * 50,
    y: enabledInput.self.y + disabled.dy * 50
  };
  const selectedNext = {
    x: enabledInput.self.x + enabled.dx * 50,
    y: enabledInput.self.y + enabled.dy * 50
  };
  const baselineNextDistance = distanceTo(baselineNext, dropPoint);
  const selectedNextDistance = distanceTo(selectedNext, dropPoint);
  assert.ok(selectedNextDistance < baselineNextDistance);

  const snapshotMetadataInput = fixtureOptions(true);
  snapshotMetadataInput.target = {
    ...snapshotMetadataInput.target,
    dropAuthority: 'snapshot'
  };
  const snapshotMetadata = buildCombatMovementPlan(
    snapshotMetadataInput.self,
    snapshotMetadataInput.target,
    [],
    snapshotMetadataInput
  );
  assert.strictEqual(snapshotMetadata.lootRacePositioning.active, false);
  assert.strictEqual(snapshotMetadata.lootRacePositioning.reason, 'snapshot-drop-not-combat-authority');
  assert.strictEqual(snapshotMetadata.lootRacePositioning.applied, false);
  assert.strictEqual(snapshotMetadata.reason, 'close-pressure-deterministic-strafe');

  const safetyInput = fixtureOptions(true, 4500);
  const safety = buildCombatMovementPlan(
    safetyInput.self,
    safetyInput.target,
    [],
    safetyInput
  );
  assert.strictEqual(safety.lootRacePositioning.active, false);
  assert.strictEqual(safety.lootRacePositioning.reason, 'close-pressure-positioning-window-inactive');
  assert.strictEqual(safety.lootRacePositioning.applied, false);
  assert.ok(safety.modifiers.includes('back-away'));

  return {
    ok: true,
    cases: 4,
    baselineDirection: { dx: disabled.dx, dy: disabled.dy },
    selectedDirection: { dx: enabled.dx, dy: enabled.dy },
    baselineNextDistanceCm: Number(baselineNextDistance.toFixed(3)),
    selectedNextDistanceCm: Number(selectedNextDistance.toFixed(3)),
    oneTickProgressImprovementCm: Number((baselineNextDistance - selectedNextDistance).toFixed(3)),
    safetyReason: safety.lootRacePositioning.reason
  };
}

if (require.main === module) {
  try {
    process.stdout.write(`${JSON.stringify(runLootRacePositioningSelfTest())}\n`);
  } catch (error) {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  }
}

module.exports = { runLootRacePositioningSelfTest };
