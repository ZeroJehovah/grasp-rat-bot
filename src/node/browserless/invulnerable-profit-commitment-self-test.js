'use strict';

const assert = require('assert');
const { createBrowserlessActionAdapter } = require('./action-adapter');
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
    name: `target-${userId}`,
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

function state(selfEntity, entities, coinDrops = [], bullets = [], tick = 1) {
  return {
    userId: 7,
    realtime: {
      tick,
      frameAgeMs: 0,
      self: selfEntity,
      entities: [selfEntity, ...entities],
      bullets,
      coinDrops,
      coinDropsObserved: true
    },
    fallback: {
      tick,
      frameAgeMs: 0,
      entities: [],
      coinDrops: [],
      messages: []
    },
    command: { shooting: { pendingShots: [], expiredShots: [] } }
  };
}

function adapter(overrides = {}) {
  return createBrowserlessDecisionAdapter({
    userId: 7,
    controlMode: 'profit-live',
    combatEnabled: true,
    dynamicProfitThresholdEnabled: false,
    singleCoinBaitEnabled: false,
    finalActionArbitrationHoldMs: 0,
    opportunitySwitchConfirmFrames: 1,
    opportunitySwitchMargin: 0,
    opportunitySwitchRelativeMargin: 0,
    ...overrides
  });
}

function decide(decisionAdapter, gameState, nowMs, overrides = {}) {
  return decisionAdapter.decide(gameState, {
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
    ...overrides
  });
}

function candidate(decision, userId) {
  return (decision.profit?.candidates || []).find(item => String(item.id) === String(userId)) || null;
}

function remoteBatch() {
  return {
    generation: 3,
    observedAtMs: 1000,
    expiresAtMs: 211000,
    candidates: [{
      userId: 31361,
      name: 'remote-profit',
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
}

function runInvulnerableProfitCommitmentSelfTest() {
  const outsideTarget = afk(21, 21000, 20, 120000);
  const outside = decide(adapter(), state(self(), [outsideTarget]), 1000);
  assert(candidate(outside, 21), 'invulnerability remaining time no longer blocks a profitable AFK target');

  const readyTarget = afk(21, 21000, 20, 25000);
  const ready = decide(adapter(), state(self(), [readyTarget]), 1000);
  const readyCandidate = candidate(ready, 21);
  assert(readyCandidate);
  assert.strictEqual(readyCandidate.target?.invulnerableApproachWindowOpen, true);
  assert.strictEqual(readyCandidate.target?.invulnerableApproachEstimate?.ready, true);
  assert.strictEqual(ready.action?.target?.userId, 21);
  assert.strictEqual(ready.action?.reason, 'invulnerable-profit-approach-window');
  assert.strictEqual(ready.action?.finalCandidate?.switchReason, 'best-eligible-profit');

  const ordinary = decide(adapter(), state(self(), [afk(21, 21000, 20, 0)]), 1000);
  const ordinaryCandidate = candidate(ordinary, 21);
  assert(ordinaryCandidate);
  assert.strictEqual(readyCandidate.priorityTier, ordinaryCandidate.priorityTier);
  assert.strictEqual(readyCandidate.score, ordinaryCandidate.score);
  assert.strictEqual(readyCandidate.expectedReward, ordinaryCandidate.expectedReward);
  assert.strictEqual(readyCandidate.staminaCost, ordinaryCandidate.staminaCost);
  assert.strictEqual(
    readyCandidate.effectiveProfitReward?.netROI,
    ordinaryCandidate.effectiveProfitReward?.netROI
  );

  const switchingAdapter = adapter({ opportunitySwitchConfirmFrames: 2 });
  const lowInvulnerable = afk(24, 12000, 15, 12000);
  const selectedLow = decide(switchingAdapter, state(self(), [lowInvulnerable], [], [], 1), 1000, {
    opportunitySwitchConfirmFrames: 2
  });
  assert.strictEqual(selectedLow.action?.target?.userId, 24);
  const highOrdinary = afk(77, 30000, 77, 0);
  const pendingSwitch = decide(
    switchingAdapter,
    state(self(), [lowInvulnerable, highOrdinary], [], [], 2),
    1100,
    { opportunitySwitchConfirmFrames: 2 }
  );
  assert.strictEqual(pendingSwitch.action?.target?.userId, 24);
  assert.strictEqual(pendingSwitch.profit?.switch?.bestRejectedReason, 'confirmation');
  assert.strictEqual(pendingSwitch.profit?.switch?.confirmationFrames, 1);
  assert.strictEqual(pendingSwitch.profit?.switch?.confirmationRequired, 2);
  assert.strictEqual(switchingAdapter.getState().switchLock?.pendingKey, 'enemy:77');
  const switched = decide(
    switchingAdapter,
    state(self(), [lowInvulnerable, highOrdinary], [], [], 3),
    1200,
    { opportunitySwitchConfirmFrames: 2 }
  );
  assert.strictEqual(switched.action?.target?.userId, 77);
  assert(Number(candidate(switched, 77)?.score) > Number(candidate(switched, 24)?.score));
  assert.strictEqual(switched.stateful.invulnerableProfitApproach, undefined);
  assert.strictEqual(switched.profit?.invulnerableCommitment, undefined);
  assert.strictEqual(
    switched.finalSelection?.candidates.some(item => (
      item.switchReason === 'invulnerable-profit-target-commitment'
        || Number(item.commitmentRank) === 30
    )),
    false
  );

  const competingAdapter = adapter();
  const competing = decide(
    competingAdapter,
    state(self(), [readyTarget], [{ drop_id: 'coin-100', amount: 100, x: 100, y: 0 }]),
    1000,
    { remoteProfitBatch: remoteBatch() }
  );
  assert((competing.profit?.candidates || []).some(item => item.type === 'coin'));
  assert(candidate(competing, 21));
  assert(candidate(competing, 31361));

  const legacyAdapter = adapter({
    nowMs: 900,
    invulnerableProfitApproach: {
      targetId: '24',
      targetName: 'legacy-target',
      openedAt: 100,
      phase: 'invulnerable-approach'
    }
  });
  const legacyDecision = decide(
    legacyAdapter,
    state(self(), [lowInvulnerable, highOrdinary]),
    1000
  );
  assert.strictEqual(legacyDecision.action?.target?.userId, 77);
  assert.strictEqual(legacyAdapter.getState().invulnerableProfitApproach, undefined);
  assert.strictEqual(legacyAdapter.getState().legacyStateMigration?.reason, 'legacy-state-cleared');
  legacyAdapter.patchState({
    invulnerableProfitApproach: { targetId: '24', phase: 'vulnerable-attack' }
  });
  assert.strictEqual(legacyAdapter.getState().invulnerableProfitApproach, undefined);

  const actionDecisionAdapter = adapter();
  const protectedTarget = afk(41, 900, 20, 5000, 3);
  const protectedDecision = decide(actionDecisionAdapter, state(self(), [protectedTarget]), 2000);
  const velocities = [];
  const shots = [];
  const actionAdapter = createBrowserlessActionAdapter({
    userId: 7,
    commandIntervalMs: 0,
    shootRepeatEnabled: false,
    transport: {
      sendVelocity(dx, dy) {
        velocities.push({ dx, dy });
        return { ok: true };
      },
      sendShoot(x, y) {
        shots.push({ x, y });
        return { ok: true };
      }
    }
  });
  const protectedAction = actionAdapter.applyDecision(
    state(self(), [protectedTarget], [], [], 4),
    protectedDecision
  );
  assert.strictEqual(protectedAction.reason, 'profit-invulnerable-target-approach');
  assert.strictEqual(protectedAction.kind, 'velocity');
  assert.strictEqual(shots.length, 0);

  const vulnerableTarget = afk(41, 900, 20, 0, 3);
  const vulnerableDecision = decide(actionDecisionAdapter, state(self(), [vulnerableTarget], [], [], 5), 2100);
  const vulnerableAction = actionAdapter.applyDecision(
    state(self(), [vulnerableTarget], [], [], 5),
    vulnerableDecision
  );
  assert.strictEqual(vulnerableAction.kind, 'profit-attack');
  assert.strictEqual(vulnerableAction.shoot.skipped, false);
  assert.strictEqual(shots.length, 1);

  const missingAction = actionAdapter.applyDecision(
    state(self(), [], [], [], 6),
    vulnerableDecision
  );
  assert.strictEqual(missingAction.reason, 'profit-target-missing-realtime');
  assert.strictEqual(shots.length, 1);

  return { ok: true, cases: 18 };
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
