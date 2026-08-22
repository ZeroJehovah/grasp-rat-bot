'use strict';

const assert = require('assert');
const {
  createBrowserlessDecisionAdapter,
  buildBrowserlessCombatStrategyInput
} = require('./decision-adapter');
const {
  buildBrowserlessCombatDryRun,
  buildCombatMovementPlan,
  normalizeCombatBullet
} = require('./combat-adapter');
const {
  coinArrivalRetryVector,
  createBrowserlessActionAdapter
} = require('./action-adapter');
const { buildCompactBrowserlessStatus } = require('./state-file');
const {
  profitMissionArrivalStateCore,
  isOrdinarySnapshotProfitMissionCore
} = require('../../strategy/profit-mission-arrival');
const { selectCombatMovementArbitrationCore } = require('../../strategy/combat-movement');

const TARGET_POINT = { x: 100, y: 0 };

function selfAtDistance(distance, overrides = {}) {
  return {
    entity_id: 1,
    user_id: 7,
    name: 'self',
    x: TARGET_POINT.x - Number(distance),
    y: TARGET_POINT.y,
    hp: 100,
    max_hp: 100,
    stamina_5s_remaining_milli: 1000000,
    stamina_5s_limit_milli: 1000000,
    stamina_1h_remaining_milli: 10000000,
    stamina_1h_limit_milli: 10000000,
    stamina_1d_remaining_milli: 20000000,
    stamina_1d_limit_milli: 20000000,
    ...overrides
  };
}

function snapshotMission(id = 'arrival-1', point = TARGET_POINT, overrides = {}) {
  return {
    active: true,
    key: `coin:id:${id}`,
    missionKey: `coin:id:${id}`,
    type: 'coin',
    subjectId: id,
    targetId: id,
    navigationAuthority: 'snapshot',
    navigationTarget: {
      type: 'coin',
      id,
      amount: 1,
      x: point.x,
      y: point.y,
      authority: 'snapshot',
      snapshotOnly: true
    },
    ...overrides
  };
}

function snapshotCoin(id = 'arrival-1', point = TARGET_POINT, overrides = {}) {
  return {
    drop_id: id,
    id,
    amount: 1,
    x: point.x,
    y: point.y,
    ...overrides
  };
}

function coinState(distance, options = {}) {
  const id = String(options.id || 'arrival-1');
  const authority = String(options.authority || 'snapshot');
  const realtime = options.realtime === true;
  const includeCoin = options.includeCoin !== false;
  const observed = options.observed !== false;
  const self = selfAtDistance(distance, options.self || {});
  const coin = snapshotCoin(id, TARGET_POINT, {
    authority,
    ...(authority === 'snapshot' ? { snapshotOnly: true } : {})
  });
  const tick = Number(options.tick || Math.max(1, Math.round(Number(options.nowMs || 1000) / 50)));
  return {
    userId: 7,
    realtime: {
      tick,
      frameAgeMs: 0,
      receivedAtMs: Number(options.nowMs || 1000),
      self,
      entities: [self],
      bullets: options.bullets || [],
      coinDrops: realtime && includeCoin ? [coin] : [],
      coinDropsObserved: realtime && observed
    },
    fallback: {
      tick,
      frameAgeMs: 0,
      receivedAtMs: Number(options.nowMs || 1000),
      entities: [],
      coinDrops: !realtime && includeCoin ? [coin] : [],
      coinDropsObserved: !realtime && observed,
      messages: []
    },
    command: {
      shooting: { pendingShots: [], expiredShots: [] },
      movement: { pendingVelocityCommands: [] }
    }
  };
}

function decisionOptions(overrides = {}) {
  return {
    userId: 7,
    controlMode: 'non-combat-profit',
    combatEnabled: false,
    dynamicProfitThresholdEnabled: false,
    singleCoinBaitEnabled: false,
    finalActionArbitrationHoldMs: 0,
    opportunitySwitchConfirmFrames: 1,
    opportunitySwitchMargin: 0,
    opportunitySwitchRelativeMargin: 0,
    ...overrides
  };
}

function secondaryTarget(overrides = {}) {
  return {
    entity_id: 8,
    user_id: 8,
    name: 'secondary',
    x: 8000,
    y: 1000,
    hp: 100,
    max_hp: 100,
    distance: Math.hypot(8000, 1000),
    active: true,
    current_join_mode: 'Active',
    firing: false,
    authority: 'realtime',
    combatRole: 'secondary',
    secondaryTarget: true,
    combatIntent: 'defensive',
    ...overrides
  };
}

function combatMovementOptions(mission, overrides = {}) {
  return {
    nowMs: 1000,
    currentTick: 2,
    profitMission: mission,
    realtimeTargets: [secondaryTarget()],
    combatAttackRange: 14500,
    movementTargetDeadZoneCm: 900,
    combatMoveSpeedPerTick: 50,
    combatControlIntervalMs: 50,
    combatShootHardReserveMs: 0,
    combatShootDodgeReserveMs: 0,
    ...overrides
  };
}

function assertArrivalCoreBoundaries() {
  const mission = snapshotMission();
  assert.strictEqual(isOrdinarySnapshotProfitMissionCore(mission), true);
  assert.strictEqual(isOrdinarySnapshotProfitMissionCore({
    ...mission,
    navigationAuthority: 'realtime',
    navigationTarget: { ...mission.navigationTarget, authority: 'realtime', snapshotOnly: false }
  }), false);

  const at149 = profitMissionArrivalStateCore({
    mission,
    self: selfAtDistance(149)
  });
  const at150 = profitMissionArrivalStateCore({
    mission,
    self: selfAtDistance(150)
  });
  const at220 = profitMissionArrivalStateCore({
    mission,
    self: selfAtDistance(220),
    previous: at150
  });
  const at250 = profitMissionArrivalStateCore({
    mission,
    self: selfAtDistance(250),
    previous: at220
  });
  const at251 = profitMissionArrivalStateCore({
    mission,
    self: selfAtDistance(251),
    previous: at250
  });
  assert.strictEqual(at149.arrived, true);
  assert.strictEqual(at150.arrived, true);
  assert.strictEqual(at220.heldByHysteresis, true);
  assert.strictEqual(at250.heldByHysteresis, true);
  assert.strictEqual(at251.arrived, false);
  assert.strictEqual(at251.released, true);
  assert.strictEqual(at251.phase, 'released');
  return { at149, at150, at220, at250, at251 };
}

function assertArrivalRetryCore() {
  const mission = snapshotMission('retry-core');
  const arrived = profitMissionArrivalStateCore({
    mission,
    self: selfAtDistance(100),
    nowMs: 1000
  });
  const beforeSettlement = profitMissionArrivalStateCore({
    mission,
    self: selfAtDistance(100),
    previous: arrived,
    nowMs: 1999
  });
  const retryReady = profitMissionArrivalStateCore({
    mission,
    self: selfAtDistance(100),
    previous: arrived,
    nowMs: 2000
  });
  const active = profitMissionArrivalStateCore({
    mission,
    self: selfAtDistance(100, { x: 200 }),
    previous: {
      ...retryReady,
      retryCount: 1,
      retryActive: true,
      retryActiveUntilMs: 2045,
      nextRetryAtMs: 2295,
      retryDirection: { dx: 1, dy: 0 }
    },
    nowMs: 2020
  });
  const expiredPulse = profitMissionArrivalStateCore({
    mission,
    self: selfAtDistance(100, { x: 200 }),
    previous: {
      ...retryReady,
      retryCount: 1,
      retryActive: true,
      retryActiveUntilMs: 2045,
      nextRetryAtMs: 2295,
      retryDirection: { dx: 1, dy: 0 }
    },
    nowMs: 2050
  });
  assert.strictEqual(arrived.arrived, true);
  assert.strictEqual(arrived.retryReady, false);
  assert.strictEqual(beforeSettlement.retryReady, false);
  assert.strictEqual(retryReady.retryReady, true);
  assert.deepStrictEqual([retryReady.retryDirection.dx, retryReady.retryDirection.dy], [1, 0]);
  assert.strictEqual(active.retryActive, true);
  assert.deepStrictEqual([active.retryDirection.dx, active.retryDirection.dy], [1, 0]);
  assert.strictEqual(expiredPulse.retryActive, false);
  assert.strictEqual(expiredPulse.heldByHysteresis, false);
  assert.strictEqual(expiredPulse.retryReady, false);
  assert.deepStrictEqual([expiredPulse.retryDirection.dx, expiredPulse.retryDirection.dy], [1, 0]);
  return { retryReady, active, expiredPulse };
}

function assertDecisionArrivalAndCleanup() {
  const options = decisionOptions();
  const adapter = createBrowserlessDecisionAdapter(options);
  const first = adapter.decide(
    coinState(500, { nowMs: 1000 }),
    { ...options, nowMs: 1000 }
  );
  assert.notStrictEqual(first.action?.kind, 'wait');

  const held149 = adapter.decide(
    coinState(149, { nowMs: 1100 }),
    { ...options, nowMs: 1100 }
  );
  assert.strictEqual(held149.action?.kind, 'wait');
  assert.strictEqual(held149.action?.reason, 'profit-mission-arrival-hold');
  assert.strictEqual(held149.action?.stopMotion, true);
  assert.strictEqual(held149.stateful?.profitMission?.arrival?.arrived, true);

  const held150 = adapter.decide(
    coinState(150, { nowMs: 1150 }),
    { ...options, nowMs: 1150 }
  );
  const held220 = adapter.decide(
    coinState(220, { nowMs: 1200 }),
    { ...options, nowMs: 1200 }
  );
  const held250 = adapter.decide(
    coinState(250, { nowMs: 1250 }),
    { ...options, nowMs: 1250 }
  );
  assert.strictEqual(held150.action?.reason, 'profit-mission-arrival-hold');
  assert.strictEqual(held220.action?.reason, 'profit-mission-arrival-hold');
  assert.strictEqual(held220.stateful?.profitMission?.arrival?.heldByHysteresis, true);
  assert.strictEqual(held250.action?.reason, 'profit-mission-arrival-hold');

  const resumed251 = adapter.decide(
    coinState(251, { nowMs: 1300 }),
    { ...options, nowMs: 1300 }
  );
  assert.notStrictEqual(resumed251.action?.reason, 'profit-mission-arrival-hold');
  assert.notStrictEqual(resumed251.action?.kind, 'wait');

  const handoffAdapter = createBrowserlessDecisionAdapter(options);
  handoffAdapter.decide(coinState(149, { nowMs: 2000 }), { ...options, nowMs: 2000 });
  const realtimeHandoff = handoffAdapter.decide(
    coinState(149, { nowMs: 2050, realtime: true, authority: 'realtime' }),
    { ...options, nowMs: 2050 }
  );
  assert.notStrictEqual(realtimeHandoff.action?.reason, 'profit-mission-arrival-hold');
  assert.strictEqual(realtimeHandoff.action?.target?.authority, 'realtime');
  assert.strictEqual(realtimeHandoff.stateful?.profitMission?.arrival ?? null, null);

  const cleanupAdapter = createBrowserlessDecisionAdapter(options);
  cleanupAdapter.decide(coinState(500, { nowMs: 3000 }), { ...options, nowMs: 3000 });
  cleanupAdapter.decide(coinState(149, { nowMs: 3050 }), { ...options, nowMs: 3050 });
  const disappeared = cleanupAdapter.decide(
    coinState(149, { nowMs: 3100, includeCoin: false, observed: true }),
    { ...options, nowMs: 3100 }
  );
  assert.strictEqual(disappeared.stateful?.profitMission, null);
  assert.strictEqual(disappeared.stateful?.opportunityChoice, null);
  assert.strictEqual(disappeared.stateful?.currentOpportunity ?? null, null);
  const replanned = cleanupAdapter.decide(
    coinState(149, { nowMs: 3150, id: 'new-coin' }),
    { ...options, nowMs: 3150 }
  );
  assert.strictEqual(replanned.action?.target?.id, 'new-coin');
  assert.strictEqual(replanned.stateful?.profitMission?.key, 'coin:id:new-coin');
  return {
    first: first.action?.reason,
    heldReason: held149.action?.reason,
    resumedReason: resumed251.action?.reason,
    handoffAuthority: realtimeHandoff.action?.target?.authority,
    disappearanceReason: disappeared.action?.reason,
    replannedTarget: replanned.action?.target?.id
  };
}

function assertBoundedArrivalRetry() {
  const options = decisionOptions({
    profitMissionArrivalSettlementWaitMs: 1000,
    profitMissionArrivalRetryPulseMs: 45,
    profitMissionArrivalRetryCooldownMs: 250,
    profitMissionArrivalMaxRetries: 3,
    profitMissionArrivalRetryExhaustedCooldownMs: 30000
  });
  const retryAdapter = createBrowserlessDecisionAdapter(options);
  retryAdapter.decide(coinState(500, { nowMs: 1000 }), { ...options, nowMs: 1000 });
  const arrived = retryAdapter.decide(coinState(149, { nowMs: 1100 }), { ...options, nowMs: 1100 });
  assert.strictEqual(arrived.action?.reason, 'profit-mission-arrival-hold');

  const unobserved = retryAdapter.decide(
    coinState(149, { nowMs: 2100, observed: false }),
    { ...options, nowMs: 2100 }
  );
  assert.strictEqual(unobserved.action?.reason, 'profit-mission-arrival-hold');
  assert.strictEqual(unobserved.stateful?.profitMission?.arrival?.retryCount, 0);
  assert.strictEqual(unobserved.stateful?.profitMission?.arrival?.retryActive, false);

  const firstRetry = retryAdapter.decide(
    coinState(149, { nowMs: 2200 }),
    { ...options, nowMs: 2200 }
  );
  assert.strictEqual(firstRetry.action?.reason, 'profit-mission-arrival-retry');
  assert.strictEqual(firstRetry.action?.target?.arrivalRetry, true);
  assert.deepStrictEqual([
    firstRetry.action?.target?.arrivalRetryDirection?.dx,
    firstRetry.action?.target?.arrivalRetryDirection?.dy
  ], [1, 0]);

  const crossedDuringCooldown = retryAdapter.decide(
    coinState(100, { nowMs: 2300, self: { x: 200 } }),
    { ...options, nowMs: 2300 }
  );
  assert.strictEqual(crossedDuringCooldown.action?.reason, 'profit-mission-arrival-hold');
  assert.deepStrictEqual([
    crossedDuringCooldown.stateful?.profitMission?.arrival?.retryDirection?.dx,
    crossedDuringCooldown.stateful?.profitMission?.arrival?.retryDirection?.dy
  ], [1, 0]);

  const secondRetry = retryAdapter.decide(
    coinState(100, { nowMs: 2500, self: { x: 200 } }),
    { ...options, nowMs: 2500 }
  );
  assert.strictEqual(secondRetry.action?.reason, 'profit-mission-arrival-retry');
  assert.deepStrictEqual([
    secondRetry.action?.target?.arrivalRetryDirection?.dx,
    secondRetry.action?.target?.arrivalRetryDirection?.dy
  ], [1, 0]);

  const cleanupAdapter = createBrowserlessDecisionAdapter(options);
  cleanupAdapter.decide(coinState(500, { nowMs: 3000 }), { ...options, nowMs: 3000 });
  cleanupAdapter.decide(coinState(149, { nowMs: 3100 }), { ...options, nowMs: 3100 });
  const retry = cleanupAdapter.decide(coinState(149, { nowMs: 4100 }), { ...options, nowMs: 4100 });
  assert.strictEqual(retry.action?.reason, 'profit-mission-arrival-retry');
  const disappeared = cleanupAdapter.decide(
    coinState(149, { nowMs: 4200, includeCoin: false, observed: true }),
    { ...options, nowMs: 4200 }
  );
  assert.strictEqual(disappeared.stateful?.profitMission, null);
  assert.notStrictEqual(disappeared.action?.reason, 'profit-mission-arrival-retry');

  const exhaustedAdapter = createBrowserlessDecisionAdapter(options);
  exhaustedAdapter.decide(coinState(500, { nowMs: 5000 }), { ...options, nowMs: 5000 });
  exhaustedAdapter.decide(coinState(149, { nowMs: 5100 }), { ...options, nowMs: 5100 });
  const retryTimes = [6100, 6400, 6700];
  for (const nowMs of retryTimes) {
    const output = exhaustedAdapter.decide(coinState(149, { nowMs }), { ...options, nowMs });
    assert.strictEqual(output.action?.reason, 'profit-mission-arrival-retry');
  }
  const exhausted = exhaustedAdapter.decide(
    coinState(149, { nowMs: 7000 }),
    { ...options, nowMs: 7000 }
  );
  assert.strictEqual(exhausted.stateful?.profitMission, null);
  assert.notStrictEqual(exhausted.action?.reason, 'profit-mission-arrival-hold');
  assert.notStrictEqual(exhausted.action?.reason, 'profit-mission-arrival-retry');
  assert.strictEqual(exhausted.action?.kind, 'wait');
  const stillSuppressed = exhaustedAdapter.decide(
    coinState(149, { nowMs: 20000 }),
    { ...options, nowMs: 20000 }
  );
  assert.strictEqual(stillSuppressed.action?.kind, 'wait');
  assert.notStrictEqual(stillSuppressed.action?.reason, 'profit-mission-arrival-hold');

  const staminaWaitAdapter = createBrowserlessDecisionAdapter(options);
  staminaWaitAdapter.decide(coinState(500, { nowMs: 8000 }), { ...options, nowMs: 8000 });
  staminaWaitAdapter.decide(coinState(149, { nowMs: 8100 }), { ...options, nowMs: 8100 });
  const staminaWait = staminaWaitAdapter.decide(
    coinState(149, {
      nowMs: 9100,
      self: {
        stamina_1h_remaining_milli: 1,
        stamina_1d_remaining_milli: 1
      }
    }),
    {
      ...options,
      nowMs: 9100,
      opportunityMoveStaminaPerCm: 1
    }
  );
  assert.notStrictEqual(staminaWait.action?.reason, 'profit-mission-arrival-retry');
  assert.strictEqual(staminaWait.action?.staminaBlocked || staminaWait.action?.kind === 'leave', true);
  return {
    firstRetry: firstRetry.action.reason,
    fixedDirection: secondRetry.action.target.arrivalRetryDirection,
    exhaustedReason: exhausted.action.reason,
    suppressedReason: stillSuppressed.action.reason,
    staminaWaitReason: staminaWait.action.reason
  };
}

function assertCombatMovementArbitration() {
  const deadZoneMission = snapshotMission('dead-zone', { x: 500, y: 0 });
  const leftSelf = selfAtDistance(400);
  leftSelf.x = 100;
  const rightSelf = selfAtDistance(400);
  rightSelf.x = 900;
  const left = buildCombatMovementPlan(
    leftSelf,
    secondaryTarget(),
    [],
    combatMovementOptions(deadZoneMission)
  );
  const right = buildCombatMovementPlan(
    rightSelf,
    secondaryTarget(),
    [],
    combatMovementOptions(deadZoneMission)
  );
  assert.deepStrictEqual([left.dx, left.dy], [1, 0]);
  assert.deepStrictEqual([right.dx, right.dy], [-1, 0]);
  assert.strictEqual(left.secondaryTarget?.deadZoneHold, false);
  assert.strictEqual(right.secondaryTarget?.deadZoneHold, false);

  const pickupBandSelf = selfAtDistance(220);
  pickupBandSelf.x = 280;
  const pickupBand = buildCombatMovementPlan(
    pickupBandSelf,
    secondaryTarget(),
    [],
    combatMovementOptions(deadZoneMission)
  );
  assert.deepStrictEqual([pickupBand.dx, pickupBand.dy], [0, 0]);
  assert.strictEqual(pickupBand.reason, 'secondary-target-dead-zone-hold');
  assert.strictEqual(pickupBand.secondaryTarget?.deadZoneCm, 250);
  assert.strictEqual(pickupBand.secondaryTarget?.deadZoneHold, true);

  const beyondLeftSelf = selfAtDistance(1000);
  beyondLeftSelf.x = -500;
  const beyondRightSelf = selfAtDistance(1000);
  beyondRightSelf.x = 1500;
  const beyondLeft = buildCombatMovementPlan(
    beyondLeftSelf,
    secondaryTarget(),
    [],
    combatMovementOptions(deadZoneMission)
  );
  const beyondRight = buildCombatMovementPlan(
    beyondRightSelf,
    secondaryTarget(),
    [],
    combatMovementOptions(deadZoneMission)
  );
  assert.deepStrictEqual([beyondLeft.dx, beyondLeft.dy], [1, 0]);
  assert.deepStrictEqual([beyondRight.dx, beyondRight.dy], [-1, 0]);

  const arrivalMission = snapshotMission();
  const arrivalSelf = selfAtDistance(100);
  const arrival = buildCombatMovementPlan(
    arrivalSelf,
    secondaryTarget(),
    [],
    combatMovementOptions(arrivalMission)
  );
  assert.deepStrictEqual([arrival.dx, arrival.dy], [0, 0]);
  assert.strictEqual(arrival.reason, 'profit-mission-arrival-hold');
  assert.strictEqual(arrival.profitMissionArrivalHold, true);

  const retryArrival = profitMissionArrivalStateCore({
    mission: arrivalMission,
    self: selfAtDistance(100),
    nowMs: 1000
  });
  const retryMission = {
    ...arrivalMission,
    arrival: {
      ...retryArrival,
      retryCount: 1,
      retryActive: true,
      retryActiveUntilMs: 1045,
      nextRetryAtMs: 1295,
      retryDirection: { dx: 1, dy: 0 }
    }
  };
  const retryPlan = buildCombatMovementPlan(
    selfAtDistance(100, { x: 200 }),
    secondaryTarget(),
    [],
    combatMovementOptions(retryMission, { nowMs: 1020 })
  );
  assert.deepStrictEqual([retryPlan.dx, retryPlan.dy], [1, 0]);
  assert.strictEqual(retryPlan.reason, 'profit-mission-arrival-retry');
  assert.strictEqual(retryPlan.profitMissionArrivalRetry, true);
  assert.strictEqual(retryPlan.secondaryTarget?.arrivalRetry, true);

  const retryExpiredPlan = buildCombatMovementPlan(
    selfAtDistance(100, { x: 200 }),
    secondaryTarget(),
    [],
    combatMovementOptions(retryMission, { nowMs: 1050 })
  );
  assert.deepStrictEqual([retryExpiredPlan.dx, retryExpiredPlan.dy], [0, 0]);
  assert.strictEqual(retryExpiredPlan.reason, 'profit-mission-arrival-hold');
  assert.strictEqual(retryExpiredPlan.profitMissionArrivalRetry, false);

  const exhaustedPlan = buildCombatMovementPlan(
    selfAtDistance(100, { x: 200 }),
    secondaryTarget(),
    [],
    combatMovementOptions({
      ...retryMission,
      arrival: {
        ...retryMission.arrival,
        retryActive: false,
        retryExhausted: true,
        retryCount: 3,
        retryActiveUntilMs: 0
      }
    }, { nowMs: 2000 })
  );
  assert.notDeepStrictEqual([exhaustedPlan.dx, exhaustedPlan.dy], [0, 0]);
  assert.strictEqual(exhaustedPlan.secondaryTarget?.deadZoneHold, false);

  const incomingRaw = {
    bullet_id: 'arrival-priority-bullet',
    owner_user_id: 8,
    x: 8000,
    y: 0,
    target_x: 0,
    target_y: 0,
    speed_per_tick: 500,
    created_tick: 1,
    expire_tick: 30
  };
  const incomingBullet = normalizeCombatBullet(incomingRaw, arrivalSelf, { currentTick: 2 });
  const dodged = buildCombatMovementPlan(
    arrivalSelf,
    secondaryTarget(),
    [incomingBullet],
    combatMovementOptions(arrivalMission)
  );
  assert.strictEqual(dodged.profitMissionArrivalHold, true);
  assert.ok(dodged.modifiers.includes('dodge'));
  assert.notDeepStrictEqual([dodged.dx, dodged.dy], [0, 0]);
  assert.notStrictEqual(dodged.reason, 'profit-mission-arrival-hold');

  const retryDodged = buildCombatMovementPlan(
    arrivalSelf,
    secondaryTarget(),
    [incomingBullet],
    combatMovementOptions(retryMission, { nowMs: 1020 })
  );
  assert.strictEqual(retryDodged.profitMissionArrivalRetry, true);
  assert.ok(retryDodged.modifiers.includes('dodge'));
  assert.notDeepStrictEqual([retryDodged.dx, retryDodged.dy], [1, 0]);
  assert.notStrictEqual(retryDodged.reason, 'profit-mission-arrival-retry');

  const safeHold = selectCombatMovementArbitrationCore({
    threatField: [
      { dx: 1, dy: 0, directHits: 1, minCPA: 50 },
      { dx: 0, dy: 1, directHits: 0, minCPA: 300 },
      { dx: -1, dy: 0, directHits: 0, minCPA: 500 }
    ],
    strategicDirection: { dx: 1, dy: 0 },
    currentDirection: { dx: 0, dy: 1 },
    emergencyDirection: { dx: -1, dy: 0 }
  }, { minimumCpaCm: 200 });
  assert.strictEqual(safeHold.source, 'current-safe-hold');
  assert.deepStrictEqual([safeHold.dx, safeHold.dy], [0, 1]);
  return {
    deadZoneDirection: [left.dx, left.dy],
    pickupBandDirection: [pickupBand.dx, pickupBand.dy],
    arrivalReason: arrival.reason,
    dodgeReason: dodged.reason,
    dodgeDirection: [dodged.dx, dodged.dy],
    safeHoldSource: safeHold.source,
    retryReason: retryPlan.reason,
    retryExpiredReason: retryExpiredPlan.reason,
    exhaustedDirection: [exhaustedPlan.dx, exhaustedPlan.dy]
  };
}

function assertArrivalRetryActionAdapter() {
  const velocities = [];
  const timers = [];
  const actionAdapter = createBrowserlessActionAdapter({
    userId: 7,
    commandIntervalMs: 0,
    velocityRepeatEnabled: true,
    setTimeout(callback, delayMs) {
      const timer = { callback, delayMs, unref() {} };
      timers.push(timer);
      return timer;
    },
    clearTimeout() {},
    transport: {
      sendVelocity(dx, dy) {
        velocities.push({ dx, dy });
        return { ok: true };
      },
      sendShoot() {
        return { ok: true };
      }
    }
  });
  const target = {
    ...snapshotCoin('retry-action'),
    type: 'coin',
    authority: 'snapshot',
    snapshotOnly: true,
    arrivalRetry: true,
    arrivalRetryDirection: { dx: 1, dy: 0 },
    arrivalRetryPulseMs: 45
  };
  const vector = coinArrivalRetryVector(selfAtDistance(100), target, {});
  assert.strictEqual(vector.ok, true);
  assert.deepStrictEqual([vector.dx, vector.dy], [1, 0]);
  assert.strictEqual(vector.precisionPulseMs, 45);
  const applied = actionAdapter.applyDecision(
    coinState(100, { nowMs: 8000 }),
    {
      kind: 'seek-coin',
      band: 'profit',
      reason: 'profit-mission-arrival-retry',
      target
    }
  );
  assert.strictEqual(applied.reason, 'coin-arrival-retry-pulse');
  assert.deepStrictEqual(velocities, [{ dx: 1, dy: 0 }]);
  assert.strictEqual(timers.length, 1);
  assert.strictEqual(timers[0].delayMs, 45);
  timers[0].callback();
  assert.deepStrictEqual(velocities, [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }]);
  return { vector: [vector.dx, vector.dy], velocities, pulseMs: timers[0].delayMs };
}

function assertArrivalRetryStateCompaction() {
  const compact = buildCompactBrowserlessStatus({
    session: { userId: 7, sessionToken: 'self-test-token', authenticated: true },
    runner: { running: true, readOnly: true, dryRun: true, controlMode: 'non-combat-profit' },
    current: {
      self: selfAtDistance(100),
      profit: {
        mission: {
          active: true,
          key: 'coin:id:compact-retry',
          type: 'coin',
          navigationAuthority: 'snapshot',
          navigationTarget: { type: 'coin', id: 'compact-retry', x: 100, y: 0 },
          arrival: {
            arrived: true,
            settlementPending: true,
            arrivedAtMs: 1000,
            nextRetryAtMs: 2395,
            lastRetryAtMs: 2100,
            retryActiveUntilMs: 2145,
            retryCount: 1,
            retryReady: false,
            retryActive: true,
            retryExhausted: false,
            retryPulseMs: 45,
            retryCooldownMs: 250,
            maxRetries: 3,
            retryDirection: { dx: 1, dy: 0 }
          }
        }
      },
      decision: {}
    }
  });
  assert.strictEqual(compact.profit?.mission?.arrival?.retryActive, true);
  assert.strictEqual(compact.profit?.mission?.arrival?.retryCount, 1);
  assert.deepStrictEqual([
    compact.profit.mission.arrival.retryDirection.dx,
    compact.profit.mission.arrival.retryDirection.dy
  ], [1, 0]);
  return compact.profit.mission.arrival;
}

function assertSafetyAndSnapshotAuthority() {
  const mission = snapshotMission();
  const lowHpSelf = selfAtDistance(100, { hp: 50 });
  const secondary = secondaryTarget({ firing: true });
  const combatState = {
    userId: 7,
    realtime: {
      tick: 1,
      self: lowHpSelf,
      entities: [lowHpSelf, secondary],
      bullets: []
    },
    command: {
      shooting: { pendingShots: [], expiredShots: [] },
      movement: { pendingVelocityCommands: [] }
    }
  };
  const stateful = {
    profitMission: mission,
    combatTarget: {
      id: '8',
      user_id: 8,
      combatRole: 'secondary',
      intent: 'defensive',
      originIntent: 'defensive',
      at: 1000,
      firstSeenAt: 1000,
      hp: 100,
      active: true,
      firing: true
    }
  };
  const lowHp = buildBrowserlessCombatDryRun(combatState, {
    controlMode: 'profit-live',
    combatEnabled: true,
    liveCombatEnabled: true,
    decisionState: stateful,
    profitMission: mission,
    nowMs: 2000,
    combatLowHpLeaveThreshold: 50,
    combatAttackRange: 14500
  });
  assert.strictEqual(lowHp.exit?.reason, 'combat-low-hp-secondary-leave');

  const invulnerableAdapter = createBrowserlessDecisionAdapter(decisionOptions({
    controlMode: 'profit-live',
    combatEnabled: true
  }));
  const invulnerableSelf = selfAtDistance(1000);
  const invulnerableTarget = secondaryTarget({
    x: 1000,
    y: 0,
    distance: 1000,
    active: true,
    current_join_mode: 'Active',
    stamina_5s_remaining_milli: 5000,
    stamina_5s_limit_milli: 10000,
    invulnerable: true,
    invulnerableRemainingMs: 5000,
    invulnerable_remaining_ms: 5000
  });
  delete invulnerableTarget.combatRole;
  delete invulnerableTarget.secondaryTarget;
  delete invulnerableTarget.combatIntent;
  const invulnerableState = {
    userId: 7,
    realtime: {
      tick: 1,
      frameAgeMs: 0,
      self: invulnerableSelf,
      entities: [invulnerableSelf, invulnerableTarget],
      bullets: [],
      coinDrops: [],
      coinDropsObserved: true
    },
    fallback: { tick: 1, frameAgeMs: 0, entities: [], coinDrops: [], coinDropsObserved: true, messages: [] }
  };
  const invulnerable = invulnerableAdapter.decide(invulnerableState, {
    ...decisionOptions({ controlMode: 'profit-live', combatEnabled: true }),
    nowMs: 3000
  });
  assert.strictEqual(invulnerable.action?.reason, 'avoid-invulnerable-target');

  const snapshotOnlyEntity = {
    user_id: 9,
    entity_id: 9,
    x: 100,
    y: 0,
    hp: 100,
    max_hp: 100,
    current_join_mode: 'Active'
  };
  const snapshotState = {
    userId: 7,
    realtime: {
      tick: 1,
      self: selfAtDistance(100),
      entities: [selfAtDistance(100)],
      bullets: []
    },
    fallback: {
      tick: 1,
      frameAgeMs: 0,
      entities: [snapshotOnlyEntity],
      coinDrops: [snapshotCoin('snapshot-only')],
      coinDropsObserved: true,
      messages: []
    }
  };
  const snapshotMissionState = { profitMission: snapshotMission('snapshot-only') };
  const snapshotDryRun = buildBrowserlessCombatDryRun(snapshotState, {
    controlMode: 'profit-live',
    combatEnabled: true,
    liveCombatEnabled: true,
    decisionState: snapshotMissionState,
    profitMission: snapshotMissionState.profitMission,
    nowMs: 4000
  });
  assert.strictEqual(snapshotDryRun.target, null);
  assert.strictEqual(snapshotDryRun.aim, null);
  assert.strictEqual(snapshotDryRun.shooting?.wouldShoot, false);
  assert.strictEqual(snapshotDryRun.movement?.dodge, null);

  const input = buildBrowserlessCombatStrategyInput(snapshotState, {
    userId: 7,
    nowMs: 4000,
    controlMode: 'profit-live',
    combatEnabled: true
  }, {});
  assert.strictEqual(input.visibleTargets.length, 0);

  const velocities = [];
  const actionAdapter = createBrowserlessActionAdapter({
    userId: 7,
    commandIntervalMs: 0,
    transport: {
      sendVelocity(dx, dy) {
        velocities.push({ dx, dy });
        return { ok: true };
      },
      sendShoot() {
        return { ok: true };
      }
    }
  });
  const heldAction = {
    kind: 'wait',
    band: 'wait',
    reason: 'profit-mission-arrival-hold',
    stopMotion: true,
    profitMissionArrivalHold: true
  };
  const applied = actionAdapter.applyDecision(coinState(149, { nowMs: 5000 }), heldAction);
  assert.deepStrictEqual(velocities.at(-1), { dx: 0, dy: 0 });
  assert.strictEqual(applied.reason, 'profit-mission-arrival-hold');
  return {
    lowHpExit: lowHp.exit?.reason,
    invulnerableReason: invulnerable.action?.reason,
    snapshotTarget: snapshotDryRun.target,
    snapshotAim: snapshotDryRun.aim,
    stopCommand: velocities.at(-1)
  };
}

function runProfitMissionArrivalSelfTest() {
  const core = assertArrivalCoreBoundaries();
  const retryCore = assertArrivalRetryCore();
  const decision = assertDecisionArrivalAndCleanup();
  const boundedRetry = assertBoundedArrivalRetry();
  const combat = assertCombatMovementArbitration();
  const retryAction = assertArrivalRetryActionAdapter();
  const compactedRetry = assertArrivalRetryStateCompaction();
  const safety = assertSafetyAndSnapshotAuthority();
  return {
    ok: true,
    cases: 41,
    core: {
      arrivalRadiusCm: core.at150.arrivalRadiusCm,
      releaseRadiusCm: core.at250.releaseRadiusCm,
      releaseReason: core.at251.reason,
      retryReadyAtMs: retryCore.retryReady.nextRetryAtMs,
      retryDirection: [retryCore.active.retryDirection.dx, retryCore.active.retryDirection.dy]
    },
    decision,
    boundedRetry,
    combat,
    retryAction,
    compactedRetry,
    safety
  };
}

if (require.main === module) {
  try {
    process.stdout.write(`${JSON.stringify(runProfitMissionArrivalSelfTest())}\n`);
  } catch (error) {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  }
}

module.exports = { runProfitMissionArrivalSelfTest };
