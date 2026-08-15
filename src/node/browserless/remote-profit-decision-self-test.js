'use strict';

const assert = require('assert');
const { createBrowserlessActionAdapter } = require('./action-adapter');
const {
  buildBrowserlessStrategyInput,
  createBrowserlessDecisionAdapter
} = require('./decision-adapter');

function fullStaminaSelf(overrides = {}) {
  return {
    entity_id: 1,
    user_id: 7,
    name: 'self',
    x: 0,
    y: 0,
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

function remoteCandidate(overrides = {}) {
  return {
    userId: 99,
    name: 'remote',
    x: 90000,
    y: 0,
    hp: 100,
    drop: 50,
    active: false,
    classification: 'high-drop-afk',
    easyKillScore: null,
    distance: 90000,
    expectedReward: 50,
    staminaCost: 1000,
    baseScore: 10,
    distanceFactor: 0.75,
    adjustedScore: 7.5,
    ...overrides
  };
}

function state(self, entities = [], coinDrops = [], coinDropsObserved = false) {
  return {
    userId: 7,
    realtime: {
      tick: 1,
      frameAgeMs: 0,
      self,
      entities: [self, ...entities],
      bullets: [],
      coinDrops,
      coinDropsObserved
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

function batch(candidate, overrides = {}) {
  return {
    generation: 3,
    source: 'gap-http',
    observedAtMs: 1000,
    expiresAtMs: 211000,
    candidates: [candidate],
    realtimeSupersededIds: [],
    missSuppressedIds: [],
    ...overrides
  };
}

function decide(adapter, currentState, nowMs, remoteProfitBatch, options = {}) {
  return adapter.decide(currentState, {
    userId: 7,
    controlMode: 'non-combat-profit',
    combatEnabled: false,
    dynamicProfitThresholdEnabled: false,
    singleCoinBaitEnabled: false,
    finalActionArbitrationHoldMs: 0,
    opportunitySwitchConfirmFrames: 1,
    opportunitySwitchMargin: 0,
    opportunitySwitchRelativeMargin: 0,
    nowMs,
    remoteProfitBatch,
    ...options
  });
}

function assertImmediateRemoteRelease(nextBatch, firstNowMs = 2000, nextNowMs = 2100) {
  const adapter = createBrowserlessDecisionAdapter({
    userId: 7,
    controlMode: 'non-combat-profit',
    combatEnabled: false,
    singleCoinBaitEnabled: false,
    finalActionArbitrationHoldMs: 1800,
    opportunitySwitchConfirmFrames: 1,
    opportunitySwitchMargin: 0,
    opportunitySwitchRelativeMargin: 0
  });
  const first = decide(adapter, state(fullStaminaSelf()), firstNowMs, batch(remoteCandidate()), {
    finalActionArbitrationHoldMs: 1800
  });
  assert.strictEqual(first.action?.kind, 'seek-remote-player');
  const next = decide(
    adapter,
    state(fullStaminaSelf(), [], [{ drop_id: 'ordinary', amount: 1, x: 100, y: 0 }]),
    nextNowMs,
    nextBatch,
    { finalActionArbitrationHoldMs: 1800 }
  );
  assert.notStrictEqual(next.action?.kind, 'seek-remote-player');
  assert.strictEqual(next.action?.target?.type, 'coin');
  return next;
}

function assertRealtimeSupersededMissionContinuity() {
  const adapter = createBrowserlessDecisionAdapter({
    userId: 7,
    controlMode: 'profit-live',
    combatEnabled: true,
    singleCoinBaitEnabled: false,
    finalActionArbitrationHoldMs: 0,
    opportunitySwitchConfirmFrames: 1,
    opportunitySwitchMargin: 0,
    opportunitySwitchRelativeMargin: 0
  });
  const firstBatch = batch(remoteCandidate({
    name: 'mango',
    active: true,
    classification: 'easy-kill-active',
    easyKillScore: 2,
    drop: 134,
    expectedReward: 60,
    adjustedScore: 300000
  }));
  const first = decide(adapter, state(fullStaminaSelf()), 2000, firstBatch, {
    controlMode: 'profit-live',
    combatEnabled: true
  });
  assert.strictEqual(first.action?.kind, 'seek-remote-player');
  assert.strictEqual(first.profit?.mission?.highValue, true);

  const supersededBatch = {
    ...firstBatch,
    realtimeSupersededIds: ['99']
  };
  const paused = decide(
    adapter,
    state(fullStaminaSelf(), [], [{ drop_id: 'detour', amount: 1, x: 100, y: 0 }]),
    2100,
    supersededBatch,
    { controlMode: 'profit-live', combatEnabled: true }
  );
  assert.strictEqual(paused.action?.target?.type, 'coin');
  assert.notStrictEqual(paused.action?.kind, 'seek-remote-player');
  assert.strictEqual(paused.profit?.mission?.targetId, '99');
  assert.strictEqual(paused.profit?.mission?.highValue, true);
  assert.strictEqual(paused.profit?.mission?.navigationPaused, true);
  assert.strictEqual(
    paused.profit?.mission?.currentDistanceCm,
    first.profit?.mission?.currentDistanceCm
  );
  assert.strictEqual(
    paused.profit?.mission?.lastConfirmedAt,
    first.profit?.mission?.lastConfirmedAt
  );
  assert.strictEqual(
    paused.profit?.mission?.navigationPauseReason,
    'realtime-superseded-awaiting-authority'
  );

  const realtimeMango = {
    entity_id: 2,
    user_id: 99,
    name: 'mango',
    x: 48000,
    y: 0,
    vx: -35,
    vy: 0,
    hp: 100,
    max_hp: 100,
    drop: 134,
    current_join_mode: 'Active',
    stamina_5s_remaining_milli: 1000000,
    stamina_5s_limit_milli: 1000000,
    stamina_1h_remaining_milli: 3000000,
    stamina_1d_remaining_milli: 20000000
  };
  const handoff = decide(
    adapter,
    state(fullStaminaSelf(), [realtimeMango]),
    2200,
    supersededBatch,
    {
      controlMode: 'profit-live',
      combatEnabled: true,
      easyKillPlayers: [{ userId: 99, score: 2 }],
      dailyDamageUserIds: []
    }
  );
  assert.strictEqual(handoff.action?.kind, 'seek-enemy');
  assert.strictEqual(handoff.action?.target?.userId, 99);
  assert.strictEqual(handoff.profit?.mission?.type, 'enemy');
  assert.strictEqual(handoff.profit?.mission?.targetId, '99');
  assert.strictEqual(handoff.profit?.mission?.highValue, true);
  assert.strictEqual(handoff.profit?.mission?.lockReason, 'same-target-authority-handoff');

  const missingWithinHold = decide(
    adapter,
    state(fullStaminaSelf()),
    2300,
    supersededBatch,
    { controlMode: 'profit-live', combatEnabled: true }
  );
  assert.strictEqual(missingWithinHold.action?.kind, 'seek-enemy');
  assert.strictEqual(missingWithinHold.action?.target?.cachedNavigationOnly, true);
  assert.strictEqual(missingWithinHold.profit?.mission?.highValue, true);

  const missing = decide(
    adapter,
    state(fullStaminaSelf()),
    5001,
    supersededBatch,
    { controlMode: 'profit-live', combatEnabled: true }
  );
  assert.notStrictEqual(missing.action?.kind, 'seek-enemy');
  assert.strictEqual(missing.profit?.mission, null);
  assert.strictEqual(missing.profit?.missingEnemyHold?.releaseReason, 'missing-hold-expired');
  assert.strictEqual(adapter.getState().easyKillTargetSuppressions?.['99'], undefined);

  const highValueDetour = decide(
    adapter,
    state(fullStaminaSelf(), [], [{ drop_id: 'high-detour', amount: 100, x: 100, y: 0 }], true),
    5100,
    supersededBatch,
    { controlMode: 'profit-live', combatEnabled: true }
  );
  assert.strictEqual(highValueDetour.action?.target?.type, 'coin');
  assert.strictEqual(highValueDetour.profit?.mission?.type, 'coin');
  assert.notStrictEqual(highValueDetour.profit?.mission?.targetId, '99');

  const resumed = decide(
    adapter,
    state(fullStaminaSelf(), [{ ...realtimeMango, x: 45000 }], [], true),
    5200,
    supersededBatch,
    {
      controlMode: 'profit-live',
      combatEnabled: true,
      easyKillPlayers: [{ userId: 99, score: 2 }],
      dailyDamageUserIds: []
    }
  );
  assert.strictEqual(resumed.action?.target?.userId, 99);
  assert.strictEqual(resumed.profit?.mission?.targetId, '99');
  assert.strictEqual(resumed.profit?.mission?.selectedAt, 5200);
  assert.notStrictEqual(resumed.profit?.mission?.selectedAt, handoff.profit?.mission?.selectedAt);
  assert.strictEqual(resumed.action?.target?.cachedNavigationOnly, false);
}

function assertSelfKillReleasesSupersededMission() {
  const adapter = createBrowserlessDecisionAdapter({
    userId: 7,
    controlMode: 'profit-live',
    combatEnabled: true,
    singleCoinBaitEnabled: false,
    finalActionArbitrationHoldMs: 0,
    opportunitySwitchConfirmFrames: 1,
    opportunitySwitchMargin: 0,
    opportunitySwitchRelativeMargin: 0
  });
  const remote = remoteCandidate({
    name: 'kane-shape',
    drop: 61,
    expectedReward: 61,
    adjustedScore: 300000
  });
  const remoteBatch = batch(remote);
  const first = decide(adapter, state(fullStaminaSelf()), 2000, remoteBatch, {
    controlMode: 'profit-live',
    combatEnabled: true
  });
  assert.strictEqual(first.action?.kind, 'seek-remote-player');
  assert.strictEqual(first.profit?.mission?.targetId, '99');

  const supersededBatch = {
    ...remoteBatch,
    realtimeSupersededIds: ['99']
  };
  const realtimeTarget = {
    entity_id: 2,
    user_id: 99,
    name: 'kane-shape',
    x: 48000,
    y: 0,
    vx: 0,
    vy: 0,
    hp: 1,
    max_hp: 100,
    drop: 61,
    current_join_mode: 'Passive',
    stamina_5s_remaining_milli: 1000000,
    stamina_5s_limit_milli: 1000000,
    stamina_1h_remaining_milli: 3000000,
    stamina_1d_remaining_milli: 20000000
  };
  const handoff = decide(
    adapter,
    state(fullStaminaSelf({ x: 47800 }), [realtimeTarget]),
    2200,
    supersededBatch,
    { controlMode: 'profit-live', combatEnabled: true }
  );
  assert.strictEqual(handoff.profit?.mission?.type, 'enemy');
  assert.strictEqual(handoff.profit?.mission?.targetId, '99');
  assert.strictEqual(handoff.profit?.mission?.highValue, true);

  const killedState = state(fullStaminaSelf({ x: 47800 }));
  killedState.realtime.tick = 6268;
  killedState.fallback.tick = 6268;
  killedState.fallback.coinDrops = [{
    drop_id: 'drop-99',
    source_user_id: 99,
    amount: 61,
    x: 48000,
    y: 0,
    created_tick: 6264
  }];
  killedState.fallback.messages = [{
    kind: 'kill',
    user_id: 7,
    target_user_id: 99,
    target_name: 'kane-shape',
    tick: 6264
  }];
  const killed = decide(adapter, killedState, 3000, supersededBatch, {
    controlMode: 'profit-live',
    combatEnabled: true
  });
  assert.strictEqual(killed.action?.kind, 'coin');
  assert.strictEqual(killed.action?.target?.selfKilledPlayerDrop, true);
  assert.strictEqual(killed.input?.postKillSettlement?.phase, 'drop-visible');
  assert.strictEqual(killed.profit?.mission, null);
  assert.strictEqual(adapter.getState().profitMission, null);

  const settledState = state(fullStaminaSelf({ x: 48000 }));
  settledState.realtime.tick = 6290;
  settledState.fallback.tick = 6290;
  settledState.fallback.messages = killedState.fallback.messages;
  const settled = decide(adapter, settledState, 3200, supersededBatch, {
    controlMode: 'profit-live',
    combatEnabled: true
  });
  assert.notStrictEqual(settled.action?.target?.userId, 99);
  assert.strictEqual(settled.profit?.mission, null);
  assert.strictEqual(
    settled.input?.postKillSettlements?.find(item => item.targetId === '99')?.phase,
    'settled'
  );

  adapter.patchState({
    profitMission: {
      active: true,
      key: 'enemy:99',
      missionKey: 'enemy:99',
      type: 'enemy',
      subjectId: '99',
      targetId: '99',
      navigationTarget: { ...realtimeTarget, hp: 100, x: 45000 },
      choice: {
        type: 'enemy',
        id: 99,
        sourceTarget: { ...realtimeTarget, hp: 100, x: 45000 }
      },
      highValue: true,
      selectedAt: 6000,
      expiresAt: 186000
    }
  });
  const respawnedState = state(fullStaminaSelf(), [{ ...realtimeTarget, hp: 100, x: 45000 }]);
  respawnedState.realtime.tick = 6291;
  respawnedState.fallback.tick = 6291;
  respawnedState.fallback.messages = killedState.fallback.messages;
  adapter.evaluateRealtime(respawnedState, { nowMs: 6100 });
  assert.strictEqual(adapter.getState().profitMission?.targetId, '99');
  assert.strictEqual(adapter.getState().profitMission?.selectedAt, 6000);
}

function ordinaryProfitTarget(userId, x, drop, overrides = {}) {
  return {
    entity_id: 1000 + userId,
    user_id: userId,
    name: `profit-target-${userId}`,
    x,
    y: 0,
    vx: 0,
    vy: 0,
    hp: 100,
    max_hp: 100,
    drop,
    current_join_mode: 'AFK',
    active: false,
    stamina_5s_remaining_milli: 1000000,
    stamina_5s_limit_milli: 1000000,
    stamina_1h_remaining_milli: 10000000,
    stamina_1h_limit_milli: 10000000,
    stamina_1d_remaining_milli: 20000000,
    stamina_1d_limit_milli: 20000000,
    ...overrides
  };
}

function assertRemoteMissionDoesNotOverrideRealtimeProfit() {
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
  const remoteBatch = batch(remoteCandidate({
    userId: 9127,
    name: 'off-screen',
    x: 52512,
    drop: 87,
    expectedReward: 87,
    staminaCost: 100000,
    adjustedScore: 620744
  }), { generation: 23 });
  const first = decide(adapter, state(fullStaminaSelf()), 2000, remoteBatch, {
    controlMode: 'profit-live',
    combatEnabled: true
  });
  assert.strictEqual(first.action?.kind, 'seek-remote-player');
  assert.strictEqual(first.action?.target?.userId, 9127);
  assert.strictEqual(first.profit?.mission?.targetId, '9127');

  const invulnerableVisible = ordinaryProfitTarget(7248, 1600, 103, {
    invulnerable_remaining_ms: 12000
  });
  const visible = decide(
    adapter,
    state(fullStaminaSelf(), [invulnerableVisible], 2),
    2100,
    remoteBatch,
    { controlMode: 'profit-live', combatEnabled: true }
  );
  assert.strictEqual(visible.action?.kind, 'seek-enemy');
  assert.strictEqual(visible.action?.target?.userId, 7248);
  assert.strictEqual(visible.action?.reason, 'invulnerable-profit-approach-window');
  assert.strictEqual(visible.profit?.remoteProfit?.remoteMissionReclaimBlocked, true);
  // The mission remains resumable, but it cannot own the current action while
  // a valid realtime/native profit target is available.
  assert.strictEqual(visible.profit?.mission?.type, 'remote-player-navigation');
  assert.strictEqual(visible.profit?.mission?.targetId, '9127');
  assert.strictEqual(visible.profit?.remoteProfit?.selected, null);

  const nextSnapshot = {
    ...remoteBatch,
    generation: 24,
    observedAtMs: 3000,
    candidates: [remoteCandidate({
      userId: 9127,
      name: 'off-screen',
      x: 55096,
      drop: 87,
      expectedReward: 87,
      staminaCost: 100000,
      adjustedScore: 594676
    })]
  };
  const anotherVisible = ordinaryProfitTarget(6649, 33311, 103);
  const next = decide(
    adapter,
    state(fullStaminaSelf(), [anotherVisible], 3),
    3200,
    nextSnapshot,
    { controlMode: 'profit-live', combatEnabled: true }
  );
  assert.strictEqual(next.action?.kind, 'seek-enemy');
  assert.strictEqual(next.action?.target?.userId, 6649);
  assert.notStrictEqual(next.action?.kind, 'seek-remote-player');
  assert.strictEqual(next.profit?.remoteProfit?.remoteMissionReclaimBlocked, true);
  assert.strictEqual(next.profit?.remoteProfit?.selected, null);
}

function escortCombatTarget(overrides = {}) {
  return {
    entity_id: 1008,
    user_id: 8,
    name: 'realtime-attacker',
    x: 8000,
    y: 3000,
    vx: 0,
    vy: 0,
    hp: 100,
    max_hp: 100,
    drop: 1,
    current_join_mode: 'Active',
    active: true,
    firing: false,
    stamina_5s_remaining_milli: 1000000,
    stamina_5s_limit_milli: 1000000,
    stamina_1h_remaining_milli: 10000000,
    stamina_1h_limit_milli: 10000000,
    stamina_1d_remaining_milli: 20000000,
    stamina_1d_limit_milli: 20000000,
    ...overrides
  };
}

function escortState(self, entities, tick, options = {}) {
  return {
    userId: 7,
    realtime: {
      tick,
      frameAgeMs: Number(options.frameAgeMs || 0),
      receivedAtMs: Number(options.receivedAtMs || tick * 50),
      self,
      entities: [self, ...entities],
      bullets: options.bullets || [],
      coinDrops: [],
      coinDropsObserved: true
    },
    fallback: {
      tick,
      frameAgeMs: 0,
      entities: [],
      coinDrops: [],
      messages: []
    },
    command: {
      shooting: {
        pendingShots: [],
        expiredShots: [],
        controlGeneration: options.controlGeneration || 'escort-control'
      },
      movement: { pendingVelocityCommands: [] }
    }
  };
}

function profitCandidate(decision, userId) {
  return (decision.profit?.candidates || []).find(candidate => (
    String(candidate.id) === String(userId)
  )) || null;
}

function assertOrdinaryProfitEscortContinuity() {
  const adapter = createBrowserlessDecisionAdapter({
    userId: 7,
    controlMode: 'profit-live',
    combatEnabled: true,
    dynamicProfitThresholdEnabled: false,
    singleCoinBaitEnabled: false,
    finalActionArbitrationHoldMs: 0,
    opportunitySwitchConfirmFrames: 2,
    opportunitySwitchMargin: 0,
    opportunitySwitchRelativeMargin: 0,
    enemyMissingHoldMs: 1800,
    combatTargetFrameGapHoldMs: 250
  });
  const decisionOptions = {
    controlMode: 'profit-live',
    combatEnabled: true,
    opportunitySwitchConfirmFrames: 2,
    enemyMissingHoldMs: 1800,
    combatTargetFrameGapHoldMs: 250
  };
  const lowProfit = ordinaryProfitTarget(42, 21000, 15);
  const selected = decide(
    adapter,
    escortState(fullStaminaSelf(), [lowProfit], 1),
    1000,
    null,
    decisionOptions
  );
  assert.strictEqual(selected.action?.kind, 'seek-enemy');
  assert.strictEqual(selected.action?.target?.userId, 42);
  assert.strictEqual(selected.profit?.mission?.highValue, false);
  assert.strictEqual(selected.action?.finalCandidate?.commitmentRank, 0);
  const lowVisibleCandidate = profitCandidate(selected, 42);
  assert(lowVisibleCandidate);

  const entryThreat = escortCombatTarget({ firing: true });
  const entered = decide(
    adapter,
    escortState(fullStaminaSelf(), [lowProfit, entryThreat], 2),
    1100,
    null,
    decisionOptions
  );
  const enteredContinuity = entered.combat?.profitEscortContinuity?.active;
  assert.strictEqual(entered.action?.kind, 'combat-live');
  assert.strictEqual(entered.combat?.target?.userId, 8);
  assert.strictEqual(entered.combat?.profitEscortContinuity?.entered, true);
  assert.strictEqual(enteredContinuity?.missionKey, 'enemy:42');
  assert.strictEqual(enteredContinuity?.combatTargetId, '8');
  assert(enteredContinuity?.engagementGeneration);
  assert.strictEqual(enteredContinuity?.entryEvidence?.targetFiring, true);
  assert.strictEqual(entered.combat?.movement?.profitEscort?.latched, true);
  assert(Number(entered.combat?.movement?.profitEscort?.missionProgress) > 0);
  assert.strictEqual(entered.combat?.movement?.profitEscort?.overrideReason, 'contact-entry-dodge');

  const maintained = decide(
    adapter,
    escortState(
      fullStaminaSelf({ x: 100 }),
      [escortCombatTarget({ x: 7800, firing: false })],
      3
    ),
    1700,
    null,
    decisionOptions
  );
  assert.strictEqual(maintained.action?.kind, 'combat-live');
  assert.strictEqual(maintained.combat?.target?.combatIntent, 'engaged');
  assert.strictEqual(maintained.combat?.profitEscortContinuity?.maintained, true);
  assert.strictEqual(
    maintained.combat?.profitEscortContinuity?.active?.engagementGeneration,
    enteredContinuity.engagementGeneration
  );
  assert.strictEqual(maintained.combat?.movement?.profitEscort?.latched, true);
  assert.strictEqual(maintained.combat?.movement?.profitEscort?.maintained, true);
  assert.strictEqual(maintained.combat?.movement?.profitEscort?.evidence?.targetFiring, false);
  assert.strictEqual(maintained.combat?.movement?.profitEscort?.evidence?.realTargetBulletPressure, false);
  assert.strictEqual(maintained.combat?.movement?.profitEscort?.overrideReason, '');
  assert(Number(maintained.combat?.movement?.profitEscort?.missionProgress) > 0);
  assert(Number(maintained.profit?.mission?.netProgressCm) > 0);

  const heldPastOrdinaryGap = decide(
    adapter,
    escortState(
      fullStaminaSelf({ x: 500 }),
      [escortCombatTarget({ x: 7400, firing: false })],
      4
    ),
    3100,
    null,
    decisionOptions
  );
  assert.strictEqual(heldPastOrdinaryGap.action?.kind, 'combat-live');
  assert.strictEqual(heldPastOrdinaryGap.profit?.mission?.targetId, '42');
  assert.strictEqual(heldPastOrdinaryGap.profit?.mission?.highValue, false);
  assert(Number(heldPastOrdinaryGap.profit?.missingEnemyHold?.ageMs) > 1800);
  assert.strictEqual(heldPastOrdinaryGap.profit?.missingEnemyHold?.continuityHold, true);
  assert.strictEqual(heldPastOrdinaryGap.profit?.missingEnemyHold?.releaseReason, '');
  assert.strictEqual(heldPastOrdinaryGap.combat?.movement?.profitEscort?.maintained, true);

  const highProfit = ordinaryProfitTarget(77, 30000, 77);
  const switchPending = decide(
    adapter,
    escortState(
      fullStaminaSelf({ x: 600 }),
      [highProfit, escortCombatTarget({ x: 7300, firing: false })],
      5
    ),
    3200,
    null,
    decisionOptions
  );
  assert.strictEqual(switchPending.profit?.mission?.targetId, '42');
  assert.strictEqual(switchPending.profit?.switch?.bestRejectedReason, 'confirmation');
  assert.strictEqual(switchPending.profit?.switch?.confirmationFrames, 1);
  assert.strictEqual(switchPending.profit?.switch?.confirmationRequired, 2);

  const switched = decide(
    adapter,
    escortState(
      fullStaminaSelf({ x: 700 }),
      [highProfit, escortCombatTarget({ x: 7200, firing: false })],
      6
    ),
    3300,
    null,
    decisionOptions
  );
  const switchedHighCandidate = profitCandidate(switched, 77);
  const switchedLowCandidate = profitCandidate(switched, 42);
  assert.strictEqual(switched.action?.kind, 'combat-live');
  assert.strictEqual(switched.profit?.mission?.targetId, '77');
  assert.strictEqual(switched.profit?.mission?.highValue, false);
  assert.strictEqual(switched.profit?.switch?.confirmationFrames, 2);
  assert.strictEqual(switched.profit?.profitEscortContinuityRelease?.releaseReason, 'profit-mission-replaced');
  assert.strictEqual(switched.profit?.profitEscortContinuity?.missionKey, 'enemy:77');
  assert.strictEqual(switched.profit?.profitEscortContinuity?.entryReason, 'same-engagement-mission-rebind');
  assert.strictEqual(
    switched.profit?.profitEscortContinuity?.engagementGeneration,
    enteredContinuity.engagementGeneration
  );
  assert.strictEqual(switched.combat?.movement?.profitEscort?.latched, true);
  assert.strictEqual(switched.combat?.movement?.profitEscort?.maintained, true);
  assert(switchedHighCandidate);
  assert(switchedLowCandidate);
  assert.strictEqual(switchedHighCandidate.priorityTier, lowVisibleCandidate.priorityTier);
  assert(Number(switchedHighCandidate.score) > Number(switchedLowCandidate.score));

  const baselineAdapter = createBrowserlessDecisionAdapter({
    userId: 7,
    controlMode: 'profit-live',
    combatEnabled: true,
    dynamicProfitThresholdEnabled: false,
    singleCoinBaitEnabled: false,
    finalActionArbitrationHoldMs: 0,
    opportunitySwitchConfirmFrames: 2,
    opportunitySwitchMargin: 0,
    opportunitySwitchRelativeMargin: 0
  });
  const highBaseline = decide(
    baselineAdapter,
    escortState(fullStaminaSelf({ x: 700 }), [highProfit], 6),
    3300,
    null,
    decisionOptions
  );
  const baselineHighCandidate = profitCandidate(highBaseline, 77);
  assert(baselineHighCandidate);
  assert.strictEqual(switchedHighCandidate.priorityTier, baselineHighCandidate.priorityTier);
  assert.strictEqual(switchedHighCandidate.score, baselineHighCandidate.score);
  assert.strictEqual(switchedHighCandidate.staminaCost, baselineHighCandidate.staminaCost);
  assert.strictEqual(
    switchedHighCandidate.effectiveProfitReward?.netROI,
    baselineHighCandidate.effectiveProfitReward?.netROI
  );

  const cachedState = escortState(fullStaminaSelf({ x: 800 }), [], 7);
  const cachedNavigation = decide(
    adapter,
    cachedState,
    3400,
    null,
    decisionOptions
  );
  assert.strictEqual(cachedNavigation.action?.kind, 'seek-enemy');
  assert.strictEqual(cachedNavigation.action?.target?.userId, 77);
  assert.strictEqual(cachedNavigation.action?.target?.cachedNavigationOnly, true);
  assert.strictEqual(cachedNavigation.action?.finalCandidate?.priorityBand, 'profit');
  assert.strictEqual(cachedNavigation.action?.finalCandidate?.commitmentRank, 0);
  assert.strictEqual(cachedNavigation.combat?.target, null);
  assert.strictEqual(cachedNavigation.combat?.aim, null);
  assert.strictEqual(cachedNavigation.action?.opportunisticShot, undefined);
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
  const cachedApplied = actionAdapter.applyDecision(cachedState, cachedNavigation);
  assert.strictEqual(cachedApplied.kind, 'velocity');
  assert.strictEqual(cachedApplied.reason, 'missing-realtime-enemy-hold');
  assert.strictEqual(cachedApplied.cachedNavigationOnly, true);
  assert.strictEqual(velocities.length, 1);
  assert.strictEqual(shots.length, 0);

  const released = decide(
    adapter,
    escortState(fullStaminaSelf({ x: 900 }), [], 8),
    3601,
    null,
    decisionOptions
  );
  assert.strictEqual(released.combat?.targetFrameGapReset?.reason, 'combat-target-frame-gap-reset');
  assert.strictEqual(
    released.profit?.profitEscortContinuityRelease?.releaseReason,
    'combat-engagement-frame-gap-expired'
  );
  assert.strictEqual(released.profit?.profitEscortContinuity, null);

  const cleared = decide(
    adapter,
    escortState(fullStaminaSelf({ x: 1000 }), [], 9),
    5201,
    null,
    decisionOptions
  );
  assert.strictEqual(cleared.profit?.mission, null);
  assert.strictEqual(cleared.profit?.missingEnemyHold?.releaseReason, 'missing-hold-expired');
  assert.notStrictEqual(cleared.action?.target?.userId, 8);
  assert.notStrictEqual(cleared.action?.target?.userId, 77);

  const unaffordableAdapter = createBrowserlessDecisionAdapter({
    userId: 7,
    controlMode: 'profit-live',
    combatEnabled: true,
    dynamicProfitThresholdEnabled: false,
    singleCoinBaitEnabled: false,
    finalActionArbitrationHoldMs: 0,
    opportunitySwitchConfirmFrames: 1,
    opportunitySwitchMargin: 0,
    opportunitySwitchRelativeMargin: 0,
    enemyMissingHoldMs: 1800
  });
  const immediateSwitchOptions = {
    ...decisionOptions,
    opportunitySwitchConfirmFrames: 1
  };
  decide(
    unaffordableAdapter,
    escortState(fullStaminaSelf(), [lowProfit], 1),
    1000,
    null,
    immediateSwitchOptions
  );
  decide(
    unaffordableAdapter,
    escortState(fullStaminaSelf(), [lowProfit, entryThreat], 2),
    1100,
    null,
    immediateSwitchOptions
  );
  const exhaustedSelf = fullStaminaSelf({
    x: 100,
    stamina_5s_remaining_milli: 0,
    stamina_1h_remaining_milli: 0,
    stamina_1d_remaining_milli: 0
  });
  const unaffordable = decide(
    unaffordableAdapter,
    escortState(exhaustedSelf, [escortCombatTarget({ firing: false })], 3),
    3100,
    null,
    immediateSwitchOptions
  );
  assert.strictEqual(unaffordable.action?.reason, 'stamina-exhausted-leave');
  assert.strictEqual(unaffordable.profit?.mission, null);
  assert.strictEqual(unaffordable.profit?.profitEscortContinuity, null);
  assert.strictEqual(unaffordable.profit?.missingEnemyHold?.releaseReason, 'held-stamina-unaffordable');
  assert.strictEqual(
    unaffordable.profit?.profitEscortContinuityRelease?.releaseReason,
    'escort-held-stamina-unaffordable'
  );

  const staleRealtimeAdapter = createBrowserlessDecisionAdapter({
    userId: 7,
    controlMode: 'profit-live',
    combatEnabled: true,
    dynamicProfitThresholdEnabled: false,
    singleCoinBaitEnabled: false,
    finalActionArbitrationHoldMs: 0,
    opportunitySwitchConfirmFrames: 1,
    opportunitySwitchMargin: 0,
    opportunitySwitchRelativeMargin: 0,
    profitEscortRealtimeStaleMs: 3000
  });
  decide(
    staleRealtimeAdapter,
    escortState(fullStaminaSelf(), [lowProfit], 1),
    1000,
    null,
    immediateSwitchOptions
  );
  decide(
    staleRealtimeAdapter,
    escortState(fullStaminaSelf(), [lowProfit, entryThreat], 2),
    1100,
    null,
    immediateSwitchOptions
  );
  const staleRealtime = decide(
    staleRealtimeAdapter,
    escortState(
      fullStaminaSelf({ x: 100 }),
      [lowProfit, escortCombatTarget({ firing: false })],
      3,
      { frameAgeMs: 4001 }
    ),
    1200,
    null,
    { ...immediateSwitchOptions, profitEscortRealtimeStaleMs: 3000 }
  );
  assert.strictEqual(staleRealtime.action?.kind, 'combat-live');
  assert.strictEqual(staleRealtime.profit?.profitEscortContinuity, null);
  assert.strictEqual(
    staleRealtime.profit?.profitEscortContinuityRelease?.releaseReason,
    'realtime-state-stale'
  );

  const plannerSyncAdapter = createBrowserlessDecisionAdapter({ userId: 7 });
  plannerSyncAdapter.patchState({
    profitEscortContinuity: null,
    profitEscortContinuityLastRelease: {
      active: false,
      missionKey: 'enemy:42',
      combatTargetId: '8',
      engagementGeneration: 'escort-control:8:1:2',
      lastUpdatedAt: 2900,
      releasedAt: 3000,
      releaseReason: 'combat-engagement-frame-gap-expired'
    }
  });
  plannerSyncAdapter.syncPlannerDecision({
    stateful: {
      profitEscortContinuity: {
        active: true,
        missionKey: 'enemy:42',
        combatTargetId: '8',
        engagementGeneration: 'escort-control:8:1:2',
        lastUpdatedAt: 2000,
        expiresAt: 10000
      },
      profitEscortContinuityLastRelease: null,
      opportunityChoice: null,
      switchLock: null
    }
  });
  assert.strictEqual(plannerSyncAdapter.getState().profitEscortContinuity, null);
  assert.strictEqual(
    plannerSyncAdapter.getState().profitEscortContinuityLastRelease?.releasedAt,
    3000
  );
  plannerSyncAdapter.syncPlannerDecision({
    stateful: {
      profitEscortContinuity: {
        active: true,
        missionKey: 'enemy:77',
        combatTargetId: '8',
        engagementGeneration: 'escort-control:8:1:2',
        lastUpdatedAt: 3100,
        expiresAt: 10000
      },
      profitEscortContinuityLastRelease: {
        active: false,
        missionKey: 'enemy:42',
        releasedAt: 3100,
        releaseReason: 'profit-mission-replaced'
      },
      opportunityChoice: null,
      switchLock: null
    }
  });
  assert.strictEqual(plannerSyncAdapter.getState().profitEscortContinuity?.missionKey, 'enemy:77');
  assert.strictEqual(
    plannerSyncAdapter.getState().profitEscortContinuityLastRelease?.releaseReason,
    'profit-mission-replaced'
  );
}

function assertAfkProfitIgnoresOffLaneActiveBystander() {
  const adapterOptions = {
    userId: 7,
    controlMode: 'profit-live',
    combatEnabled: true,
    dynamicProfitThresholdEnabled: false,
    singleCoinBaitEnabled: false,
    finalActionArbitrationHoldMs: 0,
    opportunitySwitchConfirmFrames: 1,
    opportunitySwitchMargin: 0,
    opportunitySwitchRelativeMargin: 0
  };
  const decisionAdapter = createBrowserlessDecisionAdapter(adapterOptions);
  const commands = [];
  const actionAdapter = createBrowserlessActionAdapter({
    ...adapterOptions,
    now: () => 1000,
    commandIntervalMs: 1,
    afkShootMinIntervalMs: 160,
    opportunityMoveStaminaPerCm: 1,
    opportunityShotStaminaCostMs: 500,
    transport: {
      sendVelocity(dx, dy) {
        commands.push(`vel ${dx} ${dy}`);
        return { ok: true };
      },
      sendShoot(x, y, startX, startY) {
        commands.push(`shoot ${x} ${y} ${startX} ${startY}`);
        return { ok: true };
      }
    }
  });
  const self = fullStaminaSelf({
    stamina_5s_remaining_milli: 5568,
    stamina_5s_limit_milli: 10000
  });
  const profitTarget = ordinaryProfitTarget(42, 12801, 147);
  const firstState = escortState(self, [profitTarget], 1);
  const first = decide(decisionAdapter, firstState, 1000, null, adapterOptions);
  assert.strictEqual(first.action?.kind, 'attack');
  assert.strictEqual(first.action?.target?.userId, 42);
  const applied = actionAdapter.applyDecision(firstState, first.action);
  assert.strictEqual(applied.shoot?.ok, true);
  assert.strictEqual(applied.shoot?.skipped, false);
  assert.strictEqual(applied.shoot?.requiredStaminaMs, 5000);
  assert.strictEqual(applied.shoot?.staminaPlan?.uncappedMovementReserveMs, 11801);
  assert.strictEqual(applied.shoot?.staminaPlan?.movementReserveCapped, true);
  assert(commands.some(command => command.startsWith('shoot 12801 0 ')));
  decisionAdapter.observeActionResult(applied, first, { nowMs: 1000 });
  assert.strictEqual(decisionAdapter.getState().attackHistory?.length, 1);

  const activeBystander = escortCombatTarget({
    entity_id: 1008,
    user_id: 8,
    name: 'active-bystander',
    x: 14835,
    y: 0,
    vx: 0,
    vy: 0,
    active: true,
    current_join_mode: 'Active',
    firing: false,
    drop: 775,
    stamina_5s_remaining_milli: 5000,
    stamina_5s_limit_milli: 10000
  });
  const offLaneBullet = {
    bullet_id: 'off-lane-bystander-shot',
    owner_user_id: 8,
    x: 12000,
    y: 11700,
    target_x: 0,
    target_y: 11700,
    speed_per_tick: 500,
    created_tick: 2,
    expire_tick: 50
  };
  const retained = decide(
    decisionAdapter,
    escortState(self, [profitTarget, activeBystander], 2, { bullets: [offLaneBullet] }),
    1100,
    null,
    adapterOptions
  );
  assert.strictEqual(retained.action?.kind, 'attack');
  assert.strictEqual(retained.action?.target?.userId, 42);
  assert.strictEqual(retained.combat?.target, null);
  assert.strictEqual(retained.combat?.contactEntryGuard?.active, false);
  assert.strictEqual(retained.combat?.profitEscortContinuity?.active, null);

  const collisionBullet = {
    ...offLaneBullet,
    bullet_id: 'collision-bystander-shot',
    y: 0,
    target_y: 0,
    created_tick: 3
  };
  const defended = decide(
    decisionAdapter,
    escortState(self, [profitTarget, activeBystander], 3, { bullets: [collisionBullet] }),
    1200,
    null,
    adapterOptions
  );
  assert.strictEqual(defended.action?.kind, 'flee');
  assert.strictEqual(defended.action?.reason, 'incoming-bullet-dodge');
  assert.strictEqual(defended.combat?.target?.userId, 8);
  assert.strictEqual(defended.combat?.target?.combatIntent, 'defensive');
  assert.strictEqual(defended.combat?.contactEntryGuard?.realBulletTakeover, true);
}

function runRemoteProfitDecisionSelfTest() {
  assertOrdinaryProfitEscortContinuity();
  assertAfkProfitIgnoresOffLaneActiveBystander();
  const adapter = createBrowserlessDecisionAdapter({
    userId: 7,
    controlMode: 'non-combat-profit',
    combatEnabled: false,
    singleCoinBaitEnabled: false,
    finalActionArbitrationHoldMs: 0,
    opportunitySwitchConfirmFrames: 1,
    opportunitySwitchMargin: 0,
    opportunitySwitchRelativeMargin: 0
  });
  const candidate = remoteCandidate();
  const remoteBatch = batch(candidate);
  const first = decide(adapter, state(fullStaminaSelf()), 2000, remoteBatch);
  assert.strictEqual(first.action?.kind, 'seek-remote-player');
  assert.strictEqual(first.action?.reason, 'remote-snapshot-profit-target');
  assert.strictEqual(first.action?.target?.authority, 'snapshot-navigation');
  assert.strictEqual(first.action?.target?.remoteNavigationOnly, true);
  assert.strictEqual(first.profit?.remoteProfit?.selected?.userId, 99);
  assert.strictEqual(first.combat?.target, null);
  assert.strictEqual(first.action?.opportunisticShot, undefined);

  const escortAdapter = createBrowserlessDecisionAdapter({
    userId: 7,
    controlMode: 'profit-live',
    combatEnabled: true,
    finalActionArbitrationHoldMs: 0,
    opportunitySwitchConfirmFrames: 1,
    opportunitySwitchMargin: 0,
    opportunitySwitchRelativeMargin: 0
  });
  const defensiveCrossingTarget = {
    entity_id: 8,
    user_id: 8,
    name: 'dynamic-member',
    x: 8000,
    y: 0,
    vx: -50,
    vy: 0,
    hp: 100,
    max_hp: 100,
    drop: 1,
    current_join_mode: 'Active',
    firing: true,
    stamina_5s_remaining_milli: 1000000,
    stamina_5s_limit_milli: 1000000
  };
  const escortDecision = decide(
    escortAdapter,
    state(fullStaminaSelf({ hp: 60 }), [defensiveCrossingTarget]),
    2000,
    remoteBatch,
    {
      controlMode: 'profit-live',
      combatEnabled: true,
      dynamicWhitelistMemberUserIds: [8],
      dynamicWhitelistEnabledUserIds: [8]
    }
  );
  assert.strictEqual(escortDecision.action?.kind, 'combat-live');
  assert.strictEqual(escortDecision.profit?.mission?.type, 'remote-player-navigation');
  assert.strictEqual(escortDecision.combat?.movement?.profitEscort?.active, true);
  assert.strictEqual(escortDecision.combat?.movement?.profitEscort?.missionTargetId, '99');
  assert.strictEqual(escortDecision.combat?.movement?.profitEscort?.direction?.dx, 1);
  assert.notStrictEqual(escortDecision.combat?.movement?.profitEscort?.direction?.dy, 0);
  assert(
    Number(escortDecision.combat?.movement?.dx || 0)
      || Number(escortDecision.combat?.movement?.dy || 0),
    'combat movement must remain non-zero while escorting the profit mission'
  );

  const escortReleased = decide(
    escortAdapter,
    state(fullStaminaSelf({ x: 1000, hp: 100 }), [], []),
    5000,
    remoteBatch,
    {
      dynamicWhitelistMemberUserIds: [8],
      dynamicWhitelistEnabledUserIds: [8]
    }
  );
  assert.strictEqual(escortReleased.action?.kind, 'seek-remote-player');
  assert.strictEqual(escortReleased.profit?.mission?.type, 'remote-player-navigation');

  const pursuitAdapter = createBrowserlessDecisionAdapter({
    userId: 7,
    controlMode: 'profit-live',
    combatEnabled: true,
    finalActionArbitrationHoldMs: 0,
    opportunitySwitchConfirmFrames: 1,
    opportunitySwitchMargin: 0,
    opportunitySwitchRelativeMargin: 0
  });
  const directPursuitTarget = {
    ...defensiveCrossingTarget,
    x: 8000,
    firing: false
  };
  const directPursuitFirst = decide(
    pursuitAdapter,
    state(fullStaminaSelf(), [directPursuitTarget]),
    2000,
    remoteBatch,
    {
      controlMode: 'profit-live',
      combatEnabled: true,
      dynamicWhitelistMemberUserIds: [8],
      dynamicWhitelistEnabledUserIds: [8]
    }
  );
  assert.strictEqual(directPursuitFirst.action?.kind, 'combat-live');
  const directPursuitSecond = decide(
    pursuitAdapter,
    state(fullStaminaSelf(), [{ ...directPursuitTarget, x: 7000 }]),
    2050,
    remoteBatch,
    {
      controlMode: 'profit-live',
      combatEnabled: true,
      dynamicWhitelistMemberUserIds: [8],
      dynamicWhitelistEnabledUserIds: [8]
    }
  );
  assert.strictEqual(directPursuitSecond.action?.kind, 'combat-live');
  assert.strictEqual(directPursuitSecond.combat?.target?.userId, 8);
  assert.strictEqual(directPursuitSecond.combat?.target?.combatIntent, 'defensive');
  assert.strictEqual(directPursuitSecond.combat?.movement?.profitEscort?.active, true);
  assert.strictEqual(directPursuitSecond.profit?.mission?.targetId, '99');

  const invulnerableRemoteAdapter = createBrowserlessDecisionAdapter({
    userId: 7,
    controlMode: 'non-combat-profit',
    combatEnabled: false,
    finalActionArbitrationHoldMs: 1800,
    opportunitySwitchConfirmFrames: 1,
    opportunitySwitchMargin: 0,
    opportunitySwitchRelativeMargin: 0
  });
  const invulnerableActiveCandidate = remoteCandidate({
    active: true,
    classification: 'easy-kill-active',
    easyKillScore: 3,
    invulnerable: true,
    invulnerableRemainingMs: 75000,
    approachDistanceCm: 15000,
    approachEtaMs: 75000
  });
  const invulnerableActiveBatch = batch(invulnerableActiveCandidate);
  const invulnerableRemoteFirst = decide(
    invulnerableRemoteAdapter,
    state(fullStaminaSelf()),
    2000,
    invulnerableActiveBatch,
    { finalActionArbitrationHoldMs: 1800 }
  );
  assert.strictEqual(invulnerableRemoteFirst.action?.kind, 'seek-remote-player');
  assert.strictEqual(invulnerableRemoteFirst.action?.target?.invulnerableRemainingMs, 74000);
  assert.strictEqual(invulnerableRemoteFirst.action?.target?.arrivalToleranceCm, 15000);
  const invulnerableRemoteTooClose = decide(
    invulnerableRemoteAdapter,
    state(fullStaminaSelf({ x: 10000 }), [], [{ drop_id: 'fallback', amount: 1, x: 10100, y: 0 }]),
    2100,
    invulnerableActiveBatch,
    { finalActionArbitrationHoldMs: 1800 }
  );
  assert.strictEqual(invulnerableRemoteTooClose.profit.remoteProfit.filtered['invulnerable-not-ready-on-current-approach'], 1);
  assert.notStrictEqual(invulnerableRemoteTooClose.action?.kind, 'seek-remote-player');

  const realtimeInvulnerableAdapter = createBrowserlessDecisionAdapter({
    userId: 7,
    controlMode: 'profit-live',
    combatEnabled: true,
    dynamicProfitThresholdEnabled: false,
    finalActionArbitrationHoldMs: 1800,
    opportunitySwitchConfirmFrames: 1,
    opportunitySwitchMargin: 0,
    opportunitySwitchRelativeMargin: 0
  });
  const activeInvulnerable = (x, rawRemaining) => ({
    entity_id: 2,
    user_id: 88,
    name: 'active-invulnerable',
    x,
    y: 0,
    vx: -35,
    vy: 0,
    hp: 100,
    max_hp: 100,
    drop: 100,
    current_join_mode: 'Active',
    invulnerable: true,
    invulnerable_remaining_ms: rawRemaining
  });
  const realtimeInvulnerableReady = decide(
    realtimeInvulnerableAdapter,
    state(fullStaminaSelf(), [activeInvulnerable(50000, 84000)]),
    3000,
    null,
    {
      controlMode: 'profit-live',
      combatEnabled: true,
      easyKillPlayers: [{ userId: 88, score: 3 }],
      dailyDamageUserIds: [],
      finalActionArbitrationHoldMs: 1800
    }
  );
  assert.strictEqual(realtimeInvulnerableReady.action?.kind, 'seek-enemy');
  assert.strictEqual(realtimeInvulnerableReady.action?.target?.easyKillInvulnerableApproachEligible, true);
  assert.strictEqual(realtimeInvulnerableReady.action?.target?.invulnerableApproachDistanceCm, 15000);
  const realtimeInvulnerableTooClose = decide(
    realtimeInvulnerableAdapter,
    state(fullStaminaSelf(), [activeInvulnerable(20000, 72000)]),
    3100,
    null,
    {
      controlMode: 'profit-live',
      combatEnabled: true,
      easyKillPlayers: [{ userId: 88, score: 3 }],
      dailyDamageUserIds: [],
      finalActionArbitrationHoldMs: 1800
    }
  );
  assert.strictEqual(realtimeInvulnerableTooClose.profit.easyKill.stopLoss?.reason, 'easy-kill-invulnerability-eta-no-longer-eligible');
  assert.notStrictEqual(realtimeInvulnerableTooClose.action?.kind, 'seek-enemy');

  const highValueCoin = decide(
    adapter,
    state(fullStaminaSelf(), [], [{ drop_id: 'high', amount: 100, x: 100, y: 0 }]),
    2500,
    remoteBatch
  );
  assert.notStrictEqual(highValueCoin.action?.kind, 'seek-remote-player');
  assert.strictEqual(highValueCoin.action?.target?.type, 'coin');

  const safetyPreemption = decide(
    adapter,
    state(fullStaminaSelf({ hp: 40 }), [{
      entity_id: 3,
      user_id: 55,
      x: 1000,
      y: 0,
      hp: 100,
      max_hp: 100,
      current_join_mode: 'Active',
      vx: 50,
      firing: true
    }]),
    2600,
    remoteBatch,
    { controlMode: 'profit-live', profitLiveInjuryHp: 55 }
  );
  assert.notStrictEqual(safetyPreemption.action?.kind, 'seek-remote-player');
  assert.strictEqual(safetyPreemption.band, 'safety');

  const realtimeTakeover = decide(
    adapter,
    state(fullStaminaSelf(), [{
      entity_id: 2,
      user_id: 99,
      x: 88000,
      y: 0,
      hp: 100,
      max_hp: 100,
      current_join_mode: 'Passive',
      drop: 50,
      stamina_5s_remaining_milli: 1000000,
      stamina_5s_limit_milli: 1000000,
      stamina_1d_remaining_milli: 20000000,
      stamina_1d_limit_milli: 20000000
    }]),
    3000,
    remoteBatch
  );
  assert(realtimeTakeover.profit.remoteProfit.realtimeSupersededIds.includes('99'));
  assert.notStrictEqual(realtimeTakeover.action?.kind, 'seek-remote-player');

  const arrivalMiss = decide(
    adapter,
    state(fullStaminaSelf({ x: 90000, y: 0 })),
    4000,
    remoteBatch
  );
  assert(arrivalMiss.profit.remoteProfit.missSuppressedIds.includes('99'));
  assert.notStrictEqual(arrivalMiss.action?.kind, 'seek-remote-player');

  const expired = decide(adapter, state(fullStaminaSelf()), 211000, remoteBatch);
  assert.strictEqual(expired.profit.remoteProfit.valid, false);
  assert.notStrictEqual(expired.action?.kind, 'seek-remote-player');

  const thresholdCandidate = remoteCandidate({
    userId: 100,
    expectedReward: 50,
    staminaCost: 1000,
    adjustedScore: 0.01,
    baseScore: 0.02,
    distanceFactor: 0.5
  });
  const thresholdDecision = decide(
    adapter,
    state(fullStaminaSelf()),
    2000,
    batch(thresholdCandidate, { generation: 4 }),
    {
      dynamicProfitThresholdEnabled: true,
      profitThresholdCoinsPer10Stamina: 0.2,
      profitThresholdHourlyStaminaLimit: 3000,
      profitThresholdResetReserveMs: 0
    }
  );
  const thresholdOpportunity = thresholdDecision.profit.candidates
    ?.find(item => item.type === 'remote-player-navigation');
  assert(thresholdOpportunity, 'remote opportunity must reach threshold annotation');
  assert.strictEqual(thresholdOpportunity.profitThresholdEligible, true);
  assert.strictEqual(thresholdOpportunity.expectedReward, 50);
  assert.strictEqual(thresholdOpportunity.staminaCost, 1000);
  assert.strictEqual(thresholdDecision.action?.kind, 'seek-remote-player');

  const disabled = decide(
    adapter,
    state(fullStaminaSelf()),
    2000,
    remoteBatch,
    { browserlessRemoteProfitTargetsEnabled: false }
  );
  assert.strictEqual(disabled.profit.remoteProfit.enabled, false);
  assert.notStrictEqual(disabled.action?.kind, 'seek-remote-player');

  const input = buildBrowserlessStrategyInput(state(fullStaminaSelf()), {
    nowMs: 2000,
    remoteProfitBatch: remoteBatch
  }, {});
  assert.strictEqual(input.remoteProfitBatch.candidates.length, 1);

  assertImmediateRemoteRelease(batch(remoteCandidate(), { generation: 4, candidates: [] }));
  assertImmediateRemoteRelease(batch(remoteCandidate(), { missSuppressedIds: ['99'] }));
  assertImmediateRemoteRelease(remoteBatch, 210900, 211000);
  assertRealtimeSupersededMissionContinuity();
  assertSelfKillReleasesSupersededMission();
  assertRemoteMissionDoesNotOverrideRealtimeProfit();

  const ordinaryAdapter = createBrowserlessDecisionAdapter({
    userId: 7,
    controlMode: 'non-combat-profit',
    combatEnabled: false,
    singleCoinBaitEnabled: false,
    finalActionArbitrationHoldMs: 1800,
    opportunitySwitchConfirmFrames: 1,
    opportunitySwitchMargin: 0,
    opportunitySwitchRelativeMargin: 0
  });
  const ordinaryFirst = decide(
    ordinaryAdapter,
    state(fullStaminaSelf(), [], [{ drop_id: 'coin-a', amount: 2, x: 100, y: 0 }]),
    2000,
    null,
    { finalActionArbitrationHoldMs: 1800 }
  );
  const ordinaryNext = decide(
    ordinaryAdapter,
    state(fullStaminaSelf(), [], [{ drop_id: 'coin-b', amount: 1, x: 100, y: 0 }]),
    2100,
    null,
    { finalActionArbitrationHoldMs: 1800 }
  );
  assert.strictEqual(ordinaryFirst.action?.target?.id, 'coin-a');
  assert.strictEqual(ordinaryNext.action?.target?.id, 'coin-a', 'ordinary final-action hold remains unchanged');

  // A realtime loot target is evaluated against the current native self
  // position on every frame. Keep the same target through one narrow boundary
  // crossing so a 14500cm coin does not hand control to an invulnerable-player
  // safety memory for a single 50ms frame.
  const lootThreat = {
    entity_id: 2,
    user_id: 42,
    name: 'invulnerable-target',
    x: 15769,
    y: 0,
    hp: 100,
    max_hp: 100,
    current_join_mode: 'Active',
    invulnerable: true,
    invulnerable_remaining_ms: 5000,
    stamina_5s_remaining_milli: 10000,
    stamina_5s_limit_milli: 10000
  };
  const lootState = ({
    tick,
    selfX,
    hp = 93,
    coinDrops = [{ drop_id: 'boundary-coin', amount: 26, x: 14500, y: 0 }],
    bullets = [],
    snapshotTick = 1,
    snapshotAtMs = 1000
  }) => {
    const self = fullStaminaSelf({
      entity_id: 1,
      x: selfX,
      y: 0,
      hp,
      max_hp: 100
    });
    return {
      userId: 7,
      realtime: {
        tick,
        receivedAtMs: 1000 + tick * 50,
        frameAgeMs: 0,
        self,
        entities: [self, lootThreat],
        bullets: bullets
      },
      fallback: {
        tick: snapshotTick,
        receivedAtMs: snapshotAtMs,
        frameAgeMs: 0,
        entities: [],
        coinDrops,
        messages: []
      }
    };
  };
  const boundaryAdapter = createBrowserlessDecisionAdapter({
    userId: 7,
    controlMode: 'profit-live',
    combatEnabled: true,
    finalActionArbitrationHoldMs: 0
  });
  const boundaryInitial = boundaryAdapter.evaluateRealtime(
    lootState({ tick: 1, selfX: 0 }),
    { nowMs: 1050 }
  );
  const boundaryHeld = boundaryAdapter.evaluateRealtime(
    lootState({ tick: 2, selfX: -2 }),
    { nowMs: 1100 }
  );
  const boundaryRecovered = boundaryAdapter.evaluateRealtime(
    lootState({ tick: 3, selfX: 0 }),
    { nowMs: 1150 }
  );
  assert.strictEqual(boundaryInitial.action?.reason, 'high-value-visible-coin-priority');
  assert.strictEqual(boundaryHeld.action?.kind, 'coin');
  assert.strictEqual(boundaryHeld.action?.reason, 'high-value-visible-coin-priority');
  assert.strictEqual(boundaryHeld.input?.loot?.retainedBoundaryIntent, true);
  assert.strictEqual(boundaryHeld.input?.loot?.candidate?.distance, 14502);
  assert.strictEqual(boundaryRecovered.action?.kind, 'coin');
  assert.strictEqual(boundaryRecovered.input?.loot?.retainedBoundaryIntent, false);

  const incomingBullet = {
    bullet_id: 1,
    owner_user_id: 42,
    start_x: 15769,
    start_y: 0,
    target_x: 0,
    target_y: 0,
    speed_per_tick: 500,
    created_tick: 1,
    expire_tick: 30
  };
  const incoming = boundaryAdapter.evaluateRealtime(
    lootState({ tick: 4, selfX: -2, bullets: [incomingBullet] }),
    { nowMs: 1200 }
  );
  assert.strictEqual(incoming.action?.reason, 'post-kill-loot-safe-dodge');
  assert.strictEqual(incoming.input?.loot?.mode, 'safe-dodge-toward-coin');
  assert.strictEqual(incoming.input?.loot?.blockedReason, '');
  assert.ok(Number(incoming.action?.dx || 0) > 0, 'healthy high-value loot keeps positive coin progress under fire');

  const missingCoinAdapter = createBrowserlessDecisionAdapter({
    userId: 7,
    controlMode: 'profit-live',
    combatEnabled: true,
    finalActionArbitrationHoldMs: 0
  });
  missingCoinAdapter.evaluateRealtime(
    lootState({ tick: 1, selfX: 0 }),
    { nowMs: 1050 }
  );
  const missingCoin = missingCoinAdapter.evaluateRealtime(
    lootState({ tick: 2, selfX: -2, coinDrops: [], snapshotTick: 2 }),
    { nowMs: 1100 }
  );
  assert.notStrictEqual(missingCoin.action?.kind, 'coin');
  assert.strictEqual(missingCoinAdapter.getState().realtimeLootIntent, null);

  const outOfBandAdapter = createBrowserlessDecisionAdapter({
    userId: 7,
    controlMode: 'profit-live',
    combatEnabled: true,
    finalActionArbitrationHoldMs: 0
  });
  outOfBandAdapter.evaluateRealtime(
    lootState({ tick: 1, selfX: 0 }),
    { nowMs: 1050 }
  );
  const outOfBand = outOfBandAdapter.evaluateRealtime(
    lootState({ tick: 2, selfX: -400 }),
    { nowMs: 1100 }
  );
  assert.notStrictEqual(outOfBand.action?.kind, 'coin');
  assert.strictEqual(outOfBandAdapter.getState().realtimeLootIntent, null);

  const lowHpAdapter = createBrowserlessDecisionAdapter({
    userId: 7,
    controlMode: 'profit-live',
    combatEnabled: true,
    finalActionArbitrationHoldMs: 0
  });
  lowHpAdapter.evaluateRealtime(
    lootState({ tick: 1, selfX: 0 }),
    { nowMs: 1050 }
  );
  const lowHp = lowHpAdapter.evaluateRealtime(
    lootState({ tick: 2, selfX: -2, hp: 50 }),
    { nowMs: 1100 }
  );
  assert.notStrictEqual(lowHp.action?.kind, 'coin');
  assert.strictEqual(lowHp.input?.loot?.blockedReason, 'self-hp-below-loot-threshold');

  const expiredHoldAdapter = createBrowserlessDecisionAdapter({
    userId: 7,
    controlMode: 'profit-live',
    combatEnabled: true,
    finalActionArbitrationHoldMs: 0
  });
  expiredHoldAdapter.evaluateRealtime(
    lootState({ tick: 1, selfX: 0 }),
    { nowMs: 1050 }
  );
  const expiredHold = expiredHoldAdapter.evaluateRealtime(
    lootState({ tick: 2, selfX: -2 }),
    { nowMs: 1651 }
  );
  assert.notStrictEqual(expiredHold.action?.kind, 'coin');
  assert.strictEqual(expiredHoldAdapter.getState().realtimeLootIntent, null);

  const staleAdapter = createBrowserlessDecisionAdapter({
    userId: 7,
    controlMode: 'profit-live',
    combatEnabled: true,
    finalActionArbitrationHoldMs: 0
  });
  staleAdapter.evaluateRealtime(
    lootState({ tick: 1, selfX: 0 }),
    { nowMs: 1050 }
  );
  const stale = staleAdapter.evaluateRealtime(
    lootState({ tick: 2, selfX: -2 }),
    { nowMs: 3601 }
  );
  assert.notStrictEqual(stale.action?.kind, 'coin');
  assert.strictEqual(stale.input?.loot?.reason, 'snapshot-stale');
  assert.strictEqual(staleAdapter.getState().realtimeLootIntent, null);

  return { ok: true, cases: 64 };
}

if (require.main === module) {
  try {
    process.stdout.write(JSON.stringify(runRemoteProfitDecisionSelfTest()) + '\n');
  } catch (error) {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  }
}

module.exports = { runRemoteProfitDecisionSelfTest };
