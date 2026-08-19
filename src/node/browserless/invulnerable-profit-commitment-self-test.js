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
  assert.strictEqual(ready.action?.target?.invulnerableApproachDistanceCm, 150);
  assert.strictEqual(ready.action?.target?.invulnerableApproachEstimate?.approachDistanceCm, 150);
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

  let incidentNow = 3000;
  const incidentCommands = [];
  const incidentTimers = [];
  const incidentActionAdapter = createBrowserlessActionAdapter({
    userId: 7,
    now: () => incidentNow,
    commandIntervalMs: 0,
    decisionIntervalMs: 1000,
    shootRepeatEnabled: false,
    playerDropPickupRadiusCm: 150,
    invulnerableProfitArrivalHysteresisCm: 100,
    setTimeout(fn, ms) {
      const timer = { fn, ms, canceled: false };
      incidentTimers.push(timer);
      return timer;
    },
    clearTimeout(timer) {
      if (timer) timer.canceled = true;
    },
    transport: {
      sendVelocity(dx, dy) {
        incidentCommands.push({ dx, dy, at: incidentNow });
        return { ok: true };
      },
      sendShoot() {
        throw new Error('invulnerable incident approach must not shoot');
      }
    }
  });
  const incidentTarget = {
    ...afk(41, -11129, 54, 120000),
    y: 70489
  };
  const incidentDecision = decide(
    adapter(),
    state(self(-11215, 70252), [incidentTarget], [], [], 10),
    incidentNow
  );
  const firstIncidentPulse = incidentActionAdapter.applyDecision(
    state(self(-11215, 70252), [incidentTarget], [], [], 10),
    incidentDecision
  );
  assert.strictEqual(firstIncidentPulse.reason, 'profit-invulnerable-target-approach');
  assert.strictEqual(firstIncidentPulse.approachDistanceCm, 150);
  assert.strictEqual(firstIncidentPulse.feedbackGuided, true);
  assert.strictEqual(firstIncidentPulse.precisionPulseMs, 75);
  assert.strictEqual(firstIncidentPulse.vector.pushThrough, undefined);
  assert.deepStrictEqual(incidentCommands.at(-1), { dx: 1, dy: 1, at: 3000 });
  incidentNow += 75;
  incidentTimers[0].fn();
  assert.deepStrictEqual(incidentCommands.at(-1), { dx: 0, dy: 0, at: 3075 });

  const secondSelf = self(-11162.5, 70304.5);
  incidentNow = 4000;
  const secondIncidentPulse = incidentActionAdapter.applyDecision(
    state(secondSelf, [incidentTarget], [], [], 11),
    incidentDecision
  );
  assert.strictEqual(secondIncidentPulse.precisionPulseMs, 75);
  assert.deepStrictEqual(incidentCommands.at(-1), { dx: 1, dy: 1, at: 4000 });
  incidentNow += 75;
  incidentTimers[1].fn();
  assert.deepStrictEqual(incidentCommands.at(-1), { dx: 0, dy: 0, at: 4075 });

  incidentNow = 5000;
  const arrivedIncident = incidentActionAdapter.applyDecision(
    state(self(-11110, 70357), [incidentTarget], [], [], 12),
    incidentDecision
  );
  assert.strictEqual(arrivedIncident.kind, 'stop');
  assert.strictEqual(arrivedIncident.reason, 'profit-invulnerable-target-close-wait');
  assert.strictEqual(arrivedIncident.arrival.distanceCm, 133);
  assert.strictEqual(arrivedIncident.arrival.releaseRadiusCm, 250);

  incidentNow = 6000;
  const hysteresisHold = incidentActionAdapter.applyDecision(
    state(self(-10909, 70489), [incidentTarget], [], [], 13),
    incidentDecision
  );
  assert.strictEqual(hysteresisHold.kind, 'stop');
  assert.strictEqual(hysteresisHold.arrival.distanceCm, 220);
  assert.strictEqual(hysteresisHold.arrival.heldByHysteresis, true);

  incidentNow = 7000;
  const releasedIncident = incidentActionAdapter.applyDecision(
    state(self(-10878, 70489), [incidentTarget], [], [], 14),
    incidentDecision
  );
  assert.strictEqual(releasedIncident.kind, 'velocity');
  assert.strictEqual(releasedIncident.vector.dx, -1);
  assert.strictEqual(releasedIncident.vector.dy, 0);
  assert.strictEqual(releasedIncident.vector.jitter, undefined);
  assert.strictEqual(releasedIncident.vector.crossSweep, undefined);
  assert.strictEqual(releasedIncident.precisionPulseMs, 75);

  const pendingIncidentTimer = incidentTimers.at(-1);
  const safetyAction = incidentActionAdapter.applyDecision(
    state(self(-10878, 70489), [incidentTarget], [], [], 15),
    {
      kind: 'flee',
      band: 'safety',
      action: { kind: 'flee', band: 'safety', reason: 'test-safety-preemption', dx: 0, dy: 1 }
    }
  );
  assert.strictEqual(safetyAction.reason, 'test-safety-preemption');
  assert.strictEqual(pendingIncidentTimer.canceled, true);
  assert.strictEqual(incidentActionAdapter.getState().invulnerableProfitApproach, null);
  assert.strictEqual(incidentActionAdapter.getState().invulnerableProfitApproachPulseCount, 3);
  assert.strictEqual(incidentActionAdapter.getState().invulnerableProfitApproachArrivalCount, 1);
  assert.strictEqual(incidentActionAdapter.getState().invulnerableProfitApproachReleaseCount, 1);

  const boundaryDecision = {
    action: {
      kind: 'seek-enemy',
      band: 'profit',
      reason: 'invulnerable-profit-approach-window',
      target: {
        type: 'enemy',
        userId: 55,
        x: 150,
        y: 0,
        hp: 100,
        drop: 54,
        invulnerable: true,
        active: false
      }
    }
  };
  const boundaryTarget = afk(55, 150, 54, 120000);
  const boundaryVelocities = [];
  const boundaryActionAdapter = createBrowserlessActionAdapter({
    userId: 7,
    commandIntervalMs: 0,
    shootRepeatEnabled: false,
    playerDropPickupRadiusCm: 150,
    transport: {
      sendVelocity(dx, dy) {
        boundaryVelocities.push({ dx, dy });
        return { ok: true };
      }
    }
  });
  const atBoundary = boundaryActionAdapter.applyDecision(
    state(self(), [boundaryTarget], [], [], 16),
    boundaryDecision
  );
  assert.strictEqual(atBoundary.reason, 'profit-invulnerable-target-close-wait');
  assert.deepStrictEqual(boundaryVelocities.at(-1), { dx: 0, dy: 0 });
  const outsideBoundaryAdapter = createBrowserlessActionAdapter({
    userId: 7,
    commandIntervalMs: 0,
    shootRepeatEnabled: false,
    playerDropPickupRadiusCm: 150,
    transport: { sendVelocity() { return { ok: true }; } }
  });
  const outsideBoundaryTarget = afk(55, 151, 54, 120000);
  const outsideBoundary = outsideBoundaryAdapter.applyDecision(
    state(self(), [outsideBoundaryTarget], [], [], 17),
    boundaryDecision
  );
  assert.strictEqual(outsideBoundary.reason, 'profit-invulnerable-target-approach');
  assert.strictEqual(outsideBoundary.precisionPulseMs, 75);

  const vulnerableTarget = afk(41, 900, 20, 0, 3);
  // The previous realtime countdown creates a short protection lease. Verify
  // normal AFK fire resumes only after that lease has expired.
  const vulnerableDecision = decide(actionDecisionAdapter, state(self(), [vulnerableTarget], [], [], 5), 5000);
  const vulnerableActionAdapter = createBrowserlessActionAdapter({
    userId: 7,
    commandIntervalMs: 0,
    shootRepeatEnabled: false,
    transport: {
      sendVelocity() { return { ok: true }; },
      sendShoot(x, y) {
        shots.push({ x, y });
        return { ok: true };
      }
    }
  });
  const vulnerableAction = vulnerableActionAdapter.applyDecision(
    state(self(), [vulnerableTarget], [], [], 5),
    vulnerableDecision
  );
  assert.strictEqual(vulnerableAction.kind, 'profit-attack');
  assert.strictEqual(vulnerableAction.shoot.skipped, false);
  assert.strictEqual(shots.length, 1);

  const missingAction = vulnerableActionAdapter.applyDecision(
    state(self(), [], [], [], 6),
    vulnerableDecision
  );
  assert.strictEqual(missingAction.reason, 'profit-target-missing-realtime');
  assert.strictEqual(shots.length, 1);

  return { ok: true, cases: 27 };
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
