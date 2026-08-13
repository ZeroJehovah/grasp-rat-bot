'use strict';

const assert = require('assert');
const { createBrowserlessDecisionAdapter } = require('./decision-adapter');

function self(x = 0, y = 0) {
  return {
    entity_id: 1,
    user_id: 7,
    name: 'self',
    x,
    y,
    hp: 100,
    max_hp: 100,
    stamina_5s_remaining_milli: 1000000,
    stamina_5s_limit_milli: 1000000,
    stamina_1h_remaining_milli: 10000000,
    stamina_1h_limit_milli: 10000000,
    stamina_1d_remaining_milli: 20000000,
    stamina_1d_limit_milli: 20000000
  };
}

function afk(userId, x, drop, invulnerableRemainingMs = 0, hp = 100) {
  return {
    entity_id: userId + 1000,
    user_id: userId,
    name: `afk-${userId}`,
    x,
    y: 0,
    vx: 0,
    vy: 0,
    hp,
    max_hp: 100,
    drop,
    current_join_mode: 'Passive',
    stamina_5s_remaining_milli: 1000000,
    stamina_5s_limit_milli: 1000000,
    stamina_1h_remaining_milli: 10000000,
    stamina_1h_limit_milli: 10000000,
    stamina_1d_remaining_milli: 20000000,
    stamina_1d_limit_milli: 20000000,
    ...(invulnerableRemainingMs > 0 ? {
      invulnerable: true,
      invulnerableRemainingMs
    } : {})
  };
}

function state(selfEntity, entities, coinDrops = [], bullets = []) {
  return {
    userId: 7,
    realtime: {
      tick: 1,
      frameAgeMs: 0,
      self: selfEntity,
      entities: [selfEntity, ...entities],
      bullets,
      coinDrops,
      coinDropsObserved: true
    },
    fallback: {
      tick: 1,
      frameAgeMs: 0,
      entities: [],
      coinDrops: [],
      messages: []
    }
  };
}

function decide(adapter, gameState, nowMs, remoteProfitBatch = null) {
  return adapter.decide(gameState, {
    userId: 7,
    controlMode: 'profit-live',
    combatEnabled: true,
    dynamicProfitThresholdEnabled: false,
    singleCoinBaitEnabled: false,
    finalActionArbitrationHoldMs: 0,
    opportunitySwitchConfirmFrames: 1,
    opportunitySwitchMargin: 0,
    opportunitySwitchRelativeMargin: 0,
    nowMs,
    remoteProfitBatch
  });
}

function runInvulnerableProfitCommitmentSelfTest() {
  const adapter = createBrowserlessDecisionAdapter({
    userId: 7,
    controlMode: 'profit-live',
    combatEnabled: true,
    dynamicProfitThresholdEnabled: false,
    singleCoinBaitEnabled: false,
    finalActionArbitrationHoldMs: 0,
    opportunitySwitchConfirmFrames: 1,
    opportunitySwitchMargin: 0,
    opportunitySwitchRelativeMargin: 0
  });
  const high = afk(41, 27000, 41, 38000);
  const low = afk(24, 47000, 24, 62000);
  const remoteProfitBatch = {
    generation: 3,
    observedAtMs: 1000,
    expiresAtMs: 211000,
    candidates: [{
      userId: 31361,
      name: 'remote-high',
      x: 90000,
      y: 0,
      hp: 100,
      drop: 515,
      active: false,
      classification: 'high-drop-afk',
      distance: 90000,
      expectedReward: 515,
      staminaCost: 1000,
      baseScore: 1000000,
      distanceFactor: 1,
      adjustedScore: 1000000
    }],
    realtimeSupersededIds: [],
    missSuppressedIds: []
  };

  const selected = decide(adapter, state(self(), [high, low]), 1000, remoteProfitBatch);
  assert.strictEqual(selected.action?.target?.userId, 41);
  assert.strictEqual(selected.action?.reason, 'invulnerable-profit-commitment-approach');
  assert.strictEqual(selected.profit?.invulnerableCommitment?.targetId, '41');

  const vulnerableHigh = afk(41, 27000, 41, 0, 100);
  const stillInvulnerableLow = afk(24, 46000, 24, 61000);
  const approachedSelf = self(18000, 0);
  const attacked = decide(adapter, state(approachedSelf, [vulnerableHigh, stillInvulnerableLow]), 39000, remoteProfitBatch);
  assert.strictEqual(attacked.action?.target?.userId, 41);
  assert.strictEqual(attacked.action?.kind, 'attack');
  assert.strictEqual(attacked.action?.reason, 'invulnerable-profit-commitment-attack');
  assert.strictEqual(attacked.profit?.invulnerableCommitment?.phase, 'vulnerable-attack');
  assert.strictEqual(attacked.profit?.mission, null);

  const reinvulnerableHigh = afk(41, 27000, 41, 5000, 100);
  const protectedAgain = decide(
    adapter,
    state(approachedSelf, [reinvulnerableHigh, stillInvulnerableLow]),
    39500,
    remoteProfitBatch
  );
  assert.strictEqual(protectedAgain.action?.target?.userId, 41);
  assert.strictEqual(protectedAgain.action?.kind, 'seek-enemy');
  assert.strictEqual(protectedAgain.action?.reason, 'invulnerable-profit-commitment-approach');
  assert.strictEqual(protectedAgain.profit?.invulnerableCommitment?.phase, 'invulnerable-approach');

  const competing = decide(adapter, state(approachedSelf, [vulnerableHigh, stillInvulnerableLow], [
    { drop_id: 'ordinary', amount: 100, x: 18100, y: 0 }
  ]), 40000, remoteProfitBatch);
  assert.strictEqual(competing.action?.target?.userId, 41);
  assert.strictEqual(competing.action?.reason, 'invulnerable-profit-commitment-attack');

  const attacker = {
    entity_id: 1999,
    user_id: 999,
    name: 'attacker',
    x: 18500,
    y: 0,
    vx: 0,
    vy: 0,
    hp: 80,
    max_hp: 100,
    drop: 1,
    current_join_mode: 'Active',
    firing: true,
    stamina_5s_remaining_milli: 1000000,
    stamina_5s_limit_milli: 1000000,
    stamina_1h_remaining_milli: 10000000,
    stamina_1h_limit_milli: 10000000,
    stamina_1d_remaining_milli: 20000000,
    stamina_1d_limit_milli: 20000000
  };
  const defensive = decide(adapter, state(approachedSelf, [vulnerableHigh, stillInvulnerableLow, attacker], [], [{
    bullet_id: 900,
    owner_user_id: 999,
    start_x: 18500,
    start_y: 0,
    target_x: 18000,
    target_y: 0,
    created_tick: 1,
    speed_per_tick: 500
  }]), 40500, remoteProfitBatch);
  assert.ok(['combat-live', 'flee'].includes(defensive.action?.kind));
  assert.notStrictEqual(defensive.action?.target?.userId, 41);
  assert.strictEqual(defensive.profit?.invulnerableCommitment?.targetId, '41');

  const resumedAfterDefense = decide(
    adapter,
    state(approachedSelf, [vulnerableHigh, stillInvulnerableLow]),
    41000,
    remoteProfitBatch
  );
  assert.strictEqual(resumedAfterDefense.action?.target?.userId, 41);
  assert.strictEqual(resumedAfterDefense.action?.reason, 'invulnerable-profit-commitment-attack');
  assert.strictEqual(resumedAfterDefense.profit?.invulnerableCommitment?.targetId, '41');

  const released = decide(adapter, state(approachedSelf, [stillInvulnerableLow]), 43000, remoteProfitBatch);
  assert.notStrictEqual(released.action?.target?.userId, 41);
  assert.strictEqual(released.profit?.invulnerableCommitment, null);

  const graceAdapter = createBrowserlessDecisionAdapter({
    userId: 7,
    controlMode: 'profit-live',
    combatEnabled: true,
    dynamicProfitThresholdEnabled: false,
    singleCoinBaitEnabled: false,
    finalActionArbitrationHoldMs: 0,
    opportunitySwitchConfirmFrames: 1,
    opportunitySwitchMargin: 0,
    opportunitySwitchRelativeMargin: 0
  });
  const footCoin = { drop_id: 'foot-one', amount: 1, x: 400, y: 0 };
  decide(graceAdapter, state(self(), [], [footCoin]), 1000, null);
  const graceTarget = afk(51, 21000, 60, 70000);
  const grace = decide(graceAdapter, state(self(), [graceTarget], [footCoin]), 1100, null);
  assert.strictEqual(grace.action?.target?.id, 'foot-one');
  assert.strictEqual(grace.profit?.invulnerableCommitment?.targetId, '51');
  assert.strictEqual(grace.profit?.invulnerableCommitment?.phase, 'coin-grace');
  const firstDeadlineAt = Number(grace.profit.invulnerableCommitment.departureDeadlineAt);
  const shortenedDeadlineAt = Math.min(firstDeadlineAt, 1200 + 1500);
  graceAdapter.patchState({
    invulnerableProfitApproach: {
      ...grace.profit.invulnerableCommitment,
      departureDeadlineAt: shortenedDeadlineAt
    }
  });
  const routeLengthened = decide(
    graceAdapter,
    state(self(-9000, 0), [graceTarget], [footCoin]),
    1200,
    null
  );
  assert.ok(Number(routeLengthened.profit?.invulnerableCommitment?.departureDeadlineAt) <= shortenedDeadlineAt);
  const departed = decide(graceAdapter, state(self(), [graceTarget], [
    footCoin,
    { drop_id: 'new-one', amount: 1, x: 300, y: 0 }
  ]), firstDeadlineAt + 1, null);
  assert.strictEqual(departed.action?.target?.userId, 51);
  assert.strictEqual(departed.profit?.invulnerableCommitment?.phase, 'invulnerable-approach');

  const lifecycleCases = [
    {
      name: 'dead',
      target: afk(61, 21000, 60, 0, 0),
      releaseReason: 'target-dead'
    },
    {
      name: 'active',
      target: { ...afk(61, 21000, 60), current_join_mode: 'Active', active: true },
      releaseReason: 'target-became-active'
    },
    {
      name: 'moving',
      target: { ...afk(61, 21000, 60), vx: 50 },
      releaseReason: 'target-became-active'
    },
    {
      name: 'protected',
      target: { ...afk(61, 21000, 60), creatorProtected: true },
      releaseReason: 'target-protected'
    }
  ];
  for (const lifecycleCase of lifecycleCases) {
    const lifecycleAdapter = createBrowserlessDecisionAdapter({
      userId: 7,
      controlMode: 'profit-live',
      combatEnabled: true,
      dynamicProfitThresholdEnabled: false,
      singleCoinBaitEnabled: false,
      finalActionArbitrationHoldMs: 0,
      opportunitySwitchConfirmFrames: 1,
      opportunitySwitchMargin: 0,
      opportunitySwitchRelativeMargin: 0
    });
    const lifecycleTarget = afk(61, 21000, 60, 70000);
    const established = decide(lifecycleAdapter, state(self(), [lifecycleTarget]), 1000, null);
    assert.strictEqual(established.profit?.invulnerableCommitment?.targetId, '61', lifecycleCase.name);
    const lifecycleReleased = decide(lifecycleAdapter, state(self(), [lifecycleCase.target]), 2000, null);
    assert.strictEqual(lifecycleReleased.profit?.invulnerableCommitment, null, lifecycleCase.name);
    assert.strictEqual(
      lifecycleAdapter.getState().invulnerableProfitApproachLastRelease?.releaseReason,
      lifecycleCase.releaseReason,
      lifecycleCase.name
    );
  }

  const missingAdapter = createBrowserlessDecisionAdapter({
    userId: 7,
    controlMode: 'profit-live',
    combatEnabled: true,
    dynamicProfitThresholdEnabled: false,
    singleCoinBaitEnabled: false,
    finalActionArbitrationHoldMs: 0,
    opportunitySwitchConfirmFrames: 1,
    opportunitySwitchMargin: 0,
    opportunitySwitchRelativeMargin: 0
  });
  const missingTarget = afk(71, 21000, 60, 70000);
  const missingEstablished = decide(missingAdapter, state(self(), [missingTarget]), 1000, null);
  assert.strictEqual(missingEstablished.profit?.invulnerableCommitment?.targetId, '71');
  const missingHeld = decide(missingAdapter, state(self(), []), 2000, null);
  assert.strictEqual(missingHeld.action?.reason, 'invulnerable-profit-commitment-realtime-hold');
  assert.strictEqual(missingHeld.profit?.invulnerableCommitment?.targetId, '71');
  const missingReleased = decide(missingAdapter, state(self(), []), 3001, null);
  assert.strictEqual(missingReleased.profit?.invulnerableCommitment, null);
  assert.strictEqual(
    missingAdapter.getState().invulnerableProfitApproachLastRelease?.releaseReason,
    'target-missing-timeout'
  );

  return { ok: true, cases: 15 };
}

if (require.main === module) {
  try {
    process.stdout.write(JSON.stringify(runInvulnerableProfitCommitmentSelfTest()) + '\n');
  } catch (error) {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  }
}

module.exports = { runInvulnerableProfitCommitmentSelfTest };
