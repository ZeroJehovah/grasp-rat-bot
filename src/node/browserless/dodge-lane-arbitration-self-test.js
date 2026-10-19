'use strict';

const assert = require('assert');
const { createBrowserlessStateStore } = require('./state-store');
const {
  compareDodgeCandidateRiskCore,
  movementSafetyOverrideCore,
  normalizeDodgeRiskCandidate,
  safestTierCandidateCore,
  selectDodgeCandidateCore
} = require('../../strategy/combat-dodge-selection');
const { resolveDodgeExecutionDirectionCore } = require('../../strategy/combat-movement-ownership');
const {
  applyFinalMovementSafetyOverride,
  safeLootDodgeDirection
} = require('./decision-adapter');
const { summarizeDodgeThreatField } = require('./combat-adapter');

function ingestBullet(store, tick, bullet, atMs) {
  store.ingestFrame({
    type: 'pos',
    tick,
    entities: [{ user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100 }],
    bullets: [bullet]
  }, { receivedAtMs: atMs });
  return store.getRealtimeState(atMs).bullets[0];
}

function runDodgeLaneArbitrationSelfTest() {
  // Five server-shaped observations must become bounded projected history. A
  // complete server trajectory no longer carries the old permanent 180 cm
  // zero-observation penalty.
  const projectedStore = createBrowserlessStateStore({ userId: 1 });
  let projectedBullet = null;
  for (let index = 0; index < 5; index += 1) {
    const tick = 100 + index;
    projectedBullet = ingestBullet(projectedStore, tick, {
      bullet_id: 301,
      owner_id: 2,
      start_x: 1000,
      start_y: 0,
      dir_x: -1,
      dir_y: 0,
      speed_per_tick: 500,
      created_tick: 99,
      expire_tick: 130
    }, 1000 + index * 50);
  }
  assert.strictEqual(projectedBullet.trajectoryObservationCount, 5);
  assert.strictEqual(projectedBullet.trajectoryExplicitObservationCount, 0);
  assert.strictEqual(projectedBullet.trajectoryProjectedObservationCount, 5);
  assert.strictEqual(projectedBullet.trajectoryPositionSource, 'server-projection');
  assert.strictEqual(projectedBullet.trajectoryUncertaintyCm, 0);
  assert.strictEqual(projectedBullet.trajectoryConfidence, 'server-kinematics');

  const duplicateStore = createBrowserlessStateStore({ userId: 1 });
  const duplicateBullet = {
    bullet_id: 302,
    owner_id: 2,
    start_x: 1000,
    start_y: 0,
    dir_x: -1,
    dir_y: 0,
    speed_per_tick: 500,
    created_tick: 99
  };
  ingestBullet(duplicateStore, 10, duplicateBullet, 500);
  ingestBullet(duplicateStore, 11, duplicateBullet, 550);
  let duplicate = ingestBullet(duplicateStore, 11, duplicateBullet, 600);
  assert.strictEqual(duplicate.trajectoryObservationCount, 2, 'same-tick frames replace one observation');
  duplicate = ingestBullet(duplicateStore, 10, duplicateBullet, 650);
  assert.strictEqual(duplicate.trajectoryObservationCount, 2, 'tick regression cannot append history');

  const incompleteStore = createBrowserlessStateStore({ userId: 1 });
  const incomplete = ingestBullet(incompleteStore, 20, {
    bullet_id: 303,
    owner_id: 2,
    distance: 1000,
    timeToImpact: 500
  }, 1100);
  assert.strictEqual(incomplete.trajectoryObservationCount, 0);
  assert.strictEqual(incomplete.trajectoryUncertaintyCm, 180);
  assert.strictEqual(incomplete.trajectoryConfidence, 'insufficient-kinematics');

  // Explicit positions remain independent observations for residual checks,
  // while the projected history cannot masquerade as extra explicit samples.
  const residualStore = createBrowserlessStateStore({ userId: 1 });
  let residualBullet = null;
  for (let index = 0; index < 3; index += 1) {
    residualBullet = ingestBullet(residualStore, 200 + index, {
      bullet_id: 304,
      owner_id: 2,
      x: index * 110,
      y: 0,
      start_x: 0,
      start_y: 0,
      dir_x: 1,
      dir_y: 0,
      speed_per_tick: 100,
      created_tick: 199
    }, 2000 + index * 50);
  }
  assert.strictEqual(residualBullet.trajectoryExplicitObservationCount, 3);
  assert.strictEqual(residualBullet.trajectoryProjectedObservationCount, 0);
  assert.strictEqual(residualBullet.trajectoryResidualCm, 10);
  assert.strictEqual(residualBullet.trajectoryUncertaintyCm, 10);
  assert.strictEqual(residualBullet.trajectoryConfidence, 'projection-plus-explicit');

  // Threat summaries and old logs keep their legacy fields while exposing the
  // complete risk key used by every current selector.
  const summarizedField = summarizeDodgeThreatField([
    {
      dx: 0,
      dy: -1,
      directHits: 1,
      avoidableHits: 1,
      unavoidableHits: 0,
      minCPA: 0,
      rawMinCPA: 26,
      physicalHits: 1,
      robustHits: 1,
      minRawCpaCm: 26,
      minRobustCpaCm: 26,
      minRawClearanceCm: -64,
      minRobustClearanceCm: -64,
      firstPhysicalCollisionTtiMs: 293,
      firstPhysicalCollisionBulletId: '301',
      minClearanceBulletId: '301',
      physicalCollisionBulletIds: ['301'],
      robustCollisionBulletIds: ['301'],
      dangerousBullets: [{ bulletId: '301', cpa: 26, timeToImpact: 293 }]
    }
  ]);
  assert.strictEqual(summarizedField[0].directHits, 1);
  assert.strictEqual(summarizedField[0].physicalHits, 1);
  assert.strictEqual(summarizedField[0].robustHits, 1);
  assert.strictEqual(summarizedField[0].minRawCpaCm, 26);
  assert.strictEqual(summarizedField[0].minRobustCpaCm, 26);
  assert.strictEqual(summarizedField[0].firstPhysicalCollisionBulletId, '301');
  assert.deepStrictEqual(summarizedField[0].physicalCollisionBulletIds, ['301']);

  // Compact 2026-10-19 tick 4684 fixture. Bullet 300 is unrelated to every
  // collision and has the earliest TTI; bullets 301/302 define the two lanes.
  const crossingField = [
    {
      dx: 0, dy: -1, physicalHits: 1, robustHits: 1,
      minRawCpaCm: 26.07, minRawClearanceCm: -63.93,
      minRobustCpaCm: 26.07, minRobustClearanceCm: -63.93,
      dangerousBullets: [
        { bulletId: '301', cpa: 26.07, timeToImpact: 1000 },
        { bulletId: '302', cpa: 728.71, timeToImpact: 1000 },
        { bulletId: '300', cpa: 500, timeToImpact: 85 }
      ]
    },
    {
      dx: 1, dy: 0, physicalHits: 0, robustHits: 0,
      minRawCpaCm: 186.75, minRawClearanceCm: 96.75,
      minRobustCpaCm: 186.75, minRobustClearanceCm: 96.75,
      dangerousBullets: [
        { bulletId: '301', cpa: 186.75, timeToImpact: 1000 },
        { bulletId: '302', cpa: 223.16, timeToImpact: 1000 },
        { bulletId: '300', cpa: 385, timeToImpact: 85 }
      ]
    },
    {
      dx: -1, dy: 1, physicalHits: 0, robustHits: 0,
      minRawCpaCm: 210.64, minRawClearanceCm: 120.64,
      minRobustCpaCm: 210.64, minRobustClearanceCm: 120.64,
      dangerousBullets: [
        { bulletId: '301', cpa: 210.64, timeToImpact: 1000 },
        { bulletId: '302', cpa: 231.17, timeToImpact: 1000 },
        { bulletId: '300', cpa: 400, timeToImpact: 85 }
      ]
    },
    {
      dx: 0, dy: 0, physicalHits: 0, robustHits: 0,
      minRawCpaCm: 103.96, minRawClearanceCm: 13.96,
      minRobustCpaCm: 103.96, minRobustClearanceCm: 13.96,
      dangerousBullets: [
        { bulletId: '301', cpa: 103.96, timeToImpact: 1000 },
        { bulletId: '302', cpa: 381.52, timeToImpact: 1000 },
        { bulletId: '300', cpa: 450, timeToImpact: 85 }
      ]
    }
  ];
  const crossing = selectDodgeCandidateCore(crossingField, { hitRadius: 90 });
  assert(crossing.physicalHits === 0, 'raw-safe crossing lane must beat the selected collision lane');
  assert.deepStrictEqual([crossing.dx, crossing.dy], [-1, 1]);
  const crossingBullets = Object.fromEntries(crossing.dangerousBullets.map(item => [item.bulletId, item]));
  assert(crossingBullets['301'].cpa > 90 && crossingBullets['302'].cpa > 90,
    'the selected direction must clear both crossing bullets');
  assert.strictEqual(crossing.minClearanceBulletId, '301');
  assert.strictEqual(crossing.firstPhysicalCollisionTtiMs, null,
    'the unrelated early-TTI bullet cannot become the collision tie-break');
  const north = crossingField.find(item => item.dx === 0 && item.dy === -1);
  assert.strictEqual(compareDodgeCandidateRiskCore(crossing, north, { hitRadius: 90 }) < 0, true);

  // The diagnostic bullet list is intentionally bounded. Aggregate counts and
  // collision identities must still come from the complete evaluated field,
  // or a late bullet omitted from diagnostics could lose its attribution.
  const truncatedRisk = normalizeDodgeRiskCandidate({
    dx: 0,
    dy: -1,
    physicalHits: 2,
    robustHits: 2,
    minRawCpaCm: 10,
    minRobustCpaCm: 10,
    firstPhysicalCollisionTtiMs: 900,
    firstPhysicalCollisionBulletId: '17',
    minClearanceBulletId: '17',
    minRobustClearanceBulletId: '17',
    dodgeRiskBullets: [
      { bulletId: '1', cpa: 500, timeToImpact: 100 },
      { bulletId: '2', cpa: 400, timeToImpact: 200 }
    ]
  }, { hitRadius: 90 });
  assert.strictEqual(truncatedRisk.physicalHits, 2);
  assert.strictEqual(truncatedRisk.minRawCpaCm, 10);
  assert.strictEqual(truncatedRisk.firstPhysicalCollisionTtiMs, 900);
  assert.strictEqual(truncatedRisk.firstPhysicalCollisionBulletId, '17');
  assert.strictEqual(truncatedRisk.minClearanceBulletId, '17');
  assert.strictEqual(truncatedRisk.minRobustClearanceBulletId, '17');

  // A direction with multiple schedule variants is safe only when its worst
  // variant is safe. An optimistic row must not hide a raw collision.
  const duplicateScheduleField = [
    { dx: -1, dy: 1, physicalHits: 0, robustHits: 0,
      minRawCpaCm: 90.111, minRobustCpaCm: 90.111,
      dangerousBullets: [{ bulletId: '2322', cpa: 90.111, timeToImpact: 121 }] },
    { dx: -1, dy: 1, physicalHits: 1, robustHits: 1,
      minRawCpaCm: 89.995, minRobustCpaCm: 89.995,
      dangerousBullets: [{ bulletId: '2322', cpa: 89.995, timeToImpact: 121 }] },
    { dx: 1, dy: 0, physicalHits: 0, robustHits: 0,
      minRawCpaCm: 300, minRobustCpaCm: 300,
      dangerousBullets: [{ bulletId: '2322', cpa: 300, timeToImpact: 121 }] }
  ];
  const duplicateScheduleSafe = safestTierCandidateCore(duplicateScheduleField, { hitRadius: 90 });
  assert.deepStrictEqual([duplicateScheduleSafe.dx, duplicateScheduleSafe.dy], [1, 0],
    'a safe tier must collapse each direction to its worst schedule variant');
  const duplicateScheduleGuard = movementSafetyOverrideCore({
    threatField: duplicateScheduleField,
    currentDirection: { dx: -1, dy: 1 }
  }, { hitRadius: 90 });
  assert(duplicateScheduleGuard.applied
    && duplicateScheduleGuard.direction.dx === 1
    && duplicateScheduleGuard.direction.dy === 0);

  const collisionTie = [
    {
      dx: 0, dy: -1, physicalHits: 1, robustHits: 1,
      minRawCpaCm: 20, minRobustCpaCm: 20,
      firstPhysicalCollisionTtiMs: 500, firstPhysicalCollisionBulletId: 'early',
      dangerousBullets: [
        { bulletId: 'early', cpa: 20, timeToImpact: 500 },
        { bulletId: 'unrelated', cpa: 500, timeToImpact: 20 }
      ]
    },
    {
      dx: 1, dy: 0, physicalHits: 1, robustHits: 1,
      minRawCpaCm: 20, minRobustCpaCm: 20,
      firstPhysicalCollisionTtiMs: 900, firstPhysicalCollisionBulletId: 'late',
      dangerousBullets: [
        { bulletId: 'late', cpa: 20, timeToImpact: 900 },
        { bulletId: 'unrelated', cpa: 500, timeToImpact: 20 }
      ]
    }
  ];
  const laterCollision = selectDodgeCandidateCore(collisionTie, { hitRadius: 90 });
  assert.deepStrictEqual([laterCollision.dx, laterCollision.dy], [1, 0]);
  assert.strictEqual(laterCollision.firstPhysicalCollisionBulletId, 'late');

  const allCollide = [
    { dx: 0, dy: -1, physicalHits: 1, robustHits: 1, minRawCpaCm: 20, minRawClearanceCm: -70,
      minRobustCpaCm: 20, minRobustClearanceCm: -70, unavoidableHits: 1,
      dangerousBullets: [{ bulletId: 'a', cpa: 20, timeToImpact: 100 }] },
    { dx: 1, dy: 0, physicalHits: 1, robustHits: 1, minRawCpaCm: 80, minRawClearanceCm: -10,
      minRobustCpaCm: 80, minRobustClearanceCm: -10, unavoidableHits: 1,
      dangerousBullets: [{ bulletId: 'b', cpa: 80, timeToImpact: 100 }] }
  ];
  const fallback = selectDodgeCandidateCore(allCollide, {
    hitRadius: 90,
    currentDirection: { dx: 0, dy: -1 }
  });
  assert.deepStrictEqual([fallback.dx, fallback.dy], [1, 0],
    'unavoidable-current-shot cannot freeze the worse current lane');
  const fallbackGuard = movementSafetyOverrideCore({
    threatField: allCollide,
    currentDirection: { dx: 0, dy: -1 }
  }, { hitRadius: 90 });
  assert(fallbackGuard.applied && fallbackGuard.direction.dx === 1,
    'the final guard must also choose a best-effort lane when every direction collides');
  const explanatoryOnly = [
    { dx: 0, dy: -1, physicalHits: 1, robustHits: 1, minRawCpaCm: 20,
      minRawClearanceCm: -70, minRobustCpaCm: 20, minRobustClearanceCm: -70,
      unavoidableHits: 2, dangerousBullets: [{ bulletId: 'same', cpa: 20 }] },
    { dx: 1, dy: 0, physicalHits: 1, robustHits: 1, minRawCpaCm: 20,
      minRawClearanceCm: -70, minRobustCpaCm: 20, minRobustClearanceCm: -70,
      unavoidableHits: 0, dangerousBullets: [{ bulletId: 'same', cpa: 20 }] }
  ];
  assert.deepStrictEqual(
    [selectDodgeCandidateCore(explanatoryOnly).dx, selectDodgeCandidateCore(explanatoryOnly).dy],
    [0, -1],
    'unavoidableHits is explanatory and must not break a complete-risk tie'
  );

  const guardField = [
    { dx: 0, dy: 1, physicalHits: 1, robustHits: 1, minRawCpaCm: 0, minRawClearanceCm: -90,
      minRobustCpaCm: 0, minRobustClearanceCm: -90, dangerousBullets: [{ bulletId: 'lane', cpa: 0 }] },
    { dx: 1, dy: 0, physicalHits: 0, robustHits: 0, minRawCpaCm: 300, minRawClearanceCm: 210,
      minRobustCpaCm: 300, minRobustClearanceCm: 210, dangerousBullets: [{ bulletId: 'lane', cpa: 300 }] }
  ];
  const guard = movementSafetyOverrideCore({
    threatField: guardField,
    currentDirection: { dx: 0, dy: 1 },
    hardGate: false
  }, { hitRadius: 90 });
  assert(guard.applied && guard.direction.dx === 1 && guard.direction.dy === 0);
  assert.strictEqual(guard.current.minClearanceBulletId, 'lane');
  const hardGuard = movementSafetyOverrideCore({
    threatField: guardField,
    currentDirection: { dx: 0, dy: 1 },
    hardGate: true,
    hardGateReason: 'combat-hard-exit'
  }, { hitRadius: 90 });
  assert.strictEqual(hardGuard.applied, false);
  assert.strictEqual(hardGuard.reason, 'combat-hard-exit');

  // Loot selection must keep a physically safe lane even when its coin
  // progress is zero or negative. Coin progress is a tie-break inside the
  // safe tier, not a gate that can force the damage-commit fallback.
  const lootField = [
    { dx: 0, dy: -1, physicalHits: 1, robustHits: 1, minRawCpaCm: 20,
      minRawClearanceCm: -70, minRobustCpaCm: 20, minRobustClearanceCm: -70,
      dangerousBullets: [{ bulletId: 'loot-lane', cpa: 20 }] },
    { dx: 1, dy: 0, physicalHits: 0, robustHits: 0, minRawCpaCm: 300,
      minRawClearanceCm: 210, minRobustCpaCm: 300, minRobustClearanceCm: 210,
      dangerousBullets: [{ bulletId: 'loot-lane', cpa: 300 }] },
    { dx: -1, dy: 0, physicalHits: 0, robustHits: 0, minRawCpaCm: 280,
      minRawClearanceCm: 190, minRobustCpaCm: 280, minRobustClearanceCm: 190,
      dangerousBullets: [{ bulletId: 'loot-lane', cpa: 280 }] }
  ];
  const lootCombat = {
    target: { userId: 9, x: 2000, y: 0 },
    dryRun: { movement: { dodge: { threatField: lootField } } }
  };
  const zeroProgressLoot = safeLootDodgeDirection(
    lootCombat,
    { x: 0, y: 0 },
    { id: 77, x: 0, y: 100 }
  );
  assert(zeroProgressLoot);
  assert.deepStrictEqual([zeroProgressLoot.dx, zeroProgressLoot.dy], [1, 0]);
  assert.strictEqual(zeroProgressLoot.lootProgress, 0);
  assert.strictEqual(zeroProgressLoot.lootThreatFieldSource, 'combat-dodge');
  const progressFirstLoot = safeLootDodgeDirection(
    {
      target: { userId: 9, x: 2000, y: 0 },
      dryRun: { movement: { dodge: { threatField: [
        { dx: 0, dy: -1, physicalHits: 0, robustHits: 0,
          minRawCpaCm: 300, minRobustCpaCm: 300 },
        { dx: 1, dy: 0, physicalHits: 0, robustHits: 0,
          minRawCpaCm: 220, minRobustCpaCm: 220 }
      ] } } }
    },
    { x: 0, y: 0 },
    { id: 78, x: 1000, y: 0 }
  );
  assert.deepStrictEqual([progressFirstLoot.dx, progressFirstLoot.dy], [1, 0],
    'coin progress selects within the verified safe tier');

  // A downstream combat/loot composite cannot republish a raw-unsafe
  // direction after the combat layer has evaluated a safe lane.
  const finalCombat = {
    target: { userId: 9 },
    dryRun: {
      movement: {
        dx: 0,
        dy: 1,
        ownership: { owner: 'post-kill-loot-damage-commit' },
        dodge: { threatField: guardField }
      }
    }
  };
  const finalAction = {
    kind: 'combat-live',
    band: 'combat',
    reason: 'post-kill-loot-damage-commit',
    dx: 0,
    dy: 1
  };
  const finalGuard = applyFinalMovementSafetyOverride(
    finalCombat,
    finalAction,
    { x: 0, y: 0 },
    {}
  );
  assert(finalGuard.applied);
  assert.deepStrictEqual(
    [finalGuard.combat.dryRun.movement.dx, finalGuard.combat.dryRun.movement.dy],
    [1, 0]
  );
  assert.strictEqual(finalGuard.action.movementSafetyOverride.reason,
    'physical-collision-to-safe-direction');
  const navigationGuard = applyFinalMovementSafetyOverride(
    finalCombat,
    { ...finalAction, kind: 'seek-enemy', reason: 'profit-navigation' },
    { x: 0, y: 0 },
    {}
  );
  assert(navigationGuard.applied, 'ordinary profit navigation cannot replace a safer Dodge lane');
  const hardExit = applyFinalMovementSafetyOverride(
    finalCombat,
    { ...finalAction, kind: 'leave', band: 'exit', shouldLeave: true },
    { x: 0, y: 0 },
    {}
  );
  assert.strictEqual(hardExit.applied, false, 'hard exits remain authoritative');
  const safetyAction = applyFinalMovementSafetyOverride(
    finalCombat,
    { ...finalAction, band: 'safety', reason: 'avoid-invulnerable-target' },
    { x: 0, y: 0 },
    {}
  );
  assert.strictEqual(safetyAction.applied, false, 'safety movement remains authoritative');

  const ownershipBaseline = { dx: 0, dy: 1, directHits: 1, unavoidableHits: 0 };
  const ownershipCandidate = { dx: 1, dy: 0, directHits: 1, unavoidableHits: 0 };
  const ownershipField = [
    { ...ownershipBaseline, physicalHits: 1, robustHits: 1, minRawCpaCm: 20,
      minRawClearanceCm: -70, minRobustCpaCm: 20, minRobustClearanceCm: -70 },
    { ...ownershipCandidate, physicalHits: 1, robustHits: 1, minRawCpaCm: 80,
      minRawClearanceCm: -10, minRobustCpaCm: 80, minRobustClearanceCm: -10 }
  ];
  const ownership = resolveDodgeExecutionDirectionCore({
    ownership: { active: true, currentThreat: true, direction: ownershipBaseline },
    evaluated: true,
    evaluatedDirection: ownershipCandidate,
    threatField: ownershipField
  });
  assert(ownership.accepted, 'equal collision counts must use the complete risk key');

  return { ok: true, cases: 21 };
}

module.exports = { runDodgeLaneArbitrationSelfTest };

if (require.main === module) console.log(JSON.stringify(runDodgeLaneArbitrationSelfTest()));
