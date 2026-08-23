'use strict';

const assert = require('assert');
const { createBrowserlessActionAdapter } = require('./action-adapter');
const {
  buildBrowserlessStrategyInput,
  buildPostKillSettlementWaitDecision,
  createBrowserlessDecisionAdapter,
  effectiveProfitReward,
  postKillSettlementMovement,
  applyPostKillSettlementMovementToCombat,
  scoreEnemyOpportunity
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

function defaultAdapter(overrides = {}) {
  return createBrowserlessDecisionAdapter({
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
  });
}

function assertDynamicThresholdLinkedCoinRoute() {
  const nowMs = Date.parse('2026-08-17T01:31:00.594Z');
  const self = fullStaminaSelf({
    x: -104126,
    y: 10103,
    stamina_5s_remaining_milli: 10000,
    stamina_5s_limit_milli: 10000,
    stamina_1h_remaining_milli: 2606523,
    stamina_1h_limit_milli: 3000000,
    stamina_1d_remaining_milli: 11706605,
    stamina_1d_limit_milli: 20000000
  });
  const currentState = state(self);
  currentState.realtime.tick = 675693;
  currentState.fallback = {
    tick: 675685,
    frameAgeMs: 401,
    entities: [],
    messages: [],
    coinDropsObserved: true,
    coinDrops: [
      { drop_id: 4184, amount: 1, x: -92685, y: -11301 },
      { drop_id: 4294, amount: 1, x: -85583, y: -12894 },
      { drop_id: 4279, amount: 1, x: -82084, y: -11115 },
      { drop_id: 4231, amount: 1, x: -77892, y: -21587 },
      { drop_id: 4263, amount: 1, x: -96176, y: -20828 },
      { drop_id: 4302, amount: 1, x: -84374, y: -26098 },
      { drop_id: 4254, amount: 1, x: -82741, y: -28864 },
      { drop_id: 4248, amount: 1, x: -77029, y: -26431 }
    ]
  };
  const decision = decide(defaultAdapter(), currentState, nowMs, null, {
    dynamicProfitThresholdEnabled: true,
    profitThresholdCoinsPer10Stamina: 1,
    profitThresholdHourlyStaminaLimit: 3000,
    profitThresholdResetReserveMs: 4 * 60 * 60 * 1000
  });
  assert.strictEqual(decision.action?.reason, 'best-opportunity-coin-route');
  assert.notStrictEqual(decision.action?.kind, 'wait');
  assert.strictEqual(decision.profit?.best?.profitThresholdEligible, true);
  assert.ok(Number(decision.profit?.best?.reward || 0) >= 6);
  assert.ok(Number(decision.profit?.best?.staminaCost || Infinity) <= 60000);
  assert.ok((decision.action?.target?.coinRoute?.ids || []).length >= 6);
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

  const missingWithinOrdinaryHold = decide(
    adapter,
    state(fullStaminaSelf()),
    3501,
    supersededBatch,
    { controlMode: 'profit-live', combatEnabled: true }
  );
  assert.strictEqual(missingWithinOrdinaryHold.action?.kind, 'seek-enemy');
  assert.strictEqual(missingWithinOrdinaryHold.action?.target?.cachedNavigationOnly, true);
  assert.strictEqual(missingWithinOrdinaryHold.profit?.mission?.targetId, '99');
  assert.strictEqual(missingWithinOrdinaryHold.profit?.missingEnemyHold?.holdMs, 1800);

  const missing = decide(
    adapter,
    state(fullStaminaSelf()),
    4201,
    supersededBatch,
    { controlMode: 'profit-live', combatEnabled: true }
  );
  assert.notStrictEqual(missing.action?.kind, 'seek-enemy');
  assert.strictEqual(missing.profit?.mission, null);
  assert.ok([
    'missing-hold-expired',
    'held-provenance-expired'
  ].includes(missing.profit?.missingEnemyHold?.releaseReason));
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

function assertPassiveRealtimeDamageDoesNotDiscardRemoteMission() {
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
  const original = remoteCandidate({
    userId: 99,
    name: 'high-drop-passive',
    x: 48000,
    drop: 153,
    expectedReward: 153,
    adjustedScore: 1700000
  });
  const detour = remoteCandidate({
    userId: 2703,
    name: 'lower-drop-passive',
    x: 106000,
    drop: 101,
    expectedReward: 101,
    adjustedScore: 394000
  });
  const remoteBatch = batch(original, {
    generation: 11,
    candidates: [original, detour]
  });
  const first = decide(adapter, state(fullStaminaSelf()), 2000, remoteBatch, {
    controlMode: 'profit-live',
    combatEnabled: true
  });
  assert.strictEqual(first.action?.target?.userId, 99);

  // Seed the native activity watermark with a stamina change. The target is
  // still Passive and alive, but it is temporarily excluded from AFK profit
  // candidates after third-party activity changes its HP/stamina.
  adapter.patchState({
    seenEntities: {
      '99': {
        x: 48000,
        y: 0,
        seenAt: 2000,
        movedAt: 0,
        activityAt: 0,
        motionObservedSpeed: 0,
        stamina5s: 1000000
      }
    }
  });
  const target = {
    entity_id: 2,
    user_id: 99,
    name: 'high-drop-passive',
    x: 48000,
    y: 0,
    hp: 97,
    max_hp: 100,
    current_join_mode: 'Passive',
    stamina_5s_remaining_milli: 999000,
    stamina_5s_limit_milli: 1000000,
    drop: 153
  };
  const retained = decide(
    adapter,
    state(fullStaminaSelf(), [target]),
    2200,
    { ...remoteBatch, realtimeSupersededIds: ['99'] },
    { controlMode: 'profit-live', combatEnabled: true }
  );
  assert.strictEqual(retained.action?.kind, 'seek-remote-player');
  assert.strictEqual(retained.action?.target?.userId, 99);
  assert.strictEqual(retained.profit?.mission?.targetId, '99');
  assert.strictEqual(retained.profit?.mission?.navigationPaused, false);
  assert.strictEqual(retained.profit?.remoteProfit?.selected?.userId, 99);
}

function assertLowerValuePassiveEnemyDoesNotTakeRemotePrimaryMission() {
  const common = {
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
  const adapter = createBrowserlessDecisionAdapter(common);
  const passiveTarget = ordinaryProfitTarget(6398, 14000, 15, {
    name: 'feeli',
    current_join_mode: 'AFK',
    active: false,
    firing: false
  });
  const initial = decide(
    adapter,
    state(fullStaminaSelf(), [passiveTarget]),
    2000,
    null,
    common
  );
  assert.strictEqual(initial.action?.target?.userId, 6398);

  const primaryBatch = batch(remoteCandidate({
    userId: 31361,
    name: 'mango',
    x: 220500,
    drop: 546,
    active: true,
    classification: 'easy-kill-active',
    expectedReward: 323.084,
    staminaCost: 1000,
    adjustedScore: 18461937
  }), { generation: 12 });
  const recovered = decide(
    adapter,
    state(fullStaminaSelf(), [passiveTarget]),
    2100,
    primaryBatch,
    common
  );
  assert.strictEqual(recovered.action?.kind, 'seek-remote-player');
  assert.strictEqual(recovered.action?.target?.userId, 31361);
  assert.strictEqual(recovered.profit?.mission?.targetId, '31361');
  assert.strictEqual(recovered.combat?.target, null);
  assert.ok(recovered.profit?.candidates?.some(candidate => (
    candidate.type === 'remote-player-navigation' && String(candidate.id) === '31361'
  )));
  assert.ok(recovered.profit?.candidates?.some(candidate => String(candidate.id) === '6398'));
}

function assertActivePlayerPickupRadiusCoinCompetition() {
  const common = {
    userId: 7,
    controlMode: 'profit-live',
    combatEnabled: true,
    singleCoinBaitEnabled: false,
    finalActionArbitrationHoldMs: 0,
    opportunitySwitchConfirmFrames: 1,
    opportunitySwitchMargin: 0,
    opportunitySwitchRelativeMargin: 0
  };
  const activePlayer = {
    entity_id: 2,
    user_id: 8,
    name: 'pickup-rival',
    x: 4750,
    y: 0,
    hp: 100,
    max_hp: 100,
    current_join_mode: 'Active',
    stamina_5s_remaining_milli: 1000000,
    stamina_5s_limit_milli: 1000000
  };
  const blockedState = state(fullStaminaSelf(), [activePlayer]);
  blockedState.fallback.tick = 2;
  blockedState.fallback.receivedAtMs = 2000;
  blockedState.fallback.coinDrops = [{
    drop_id: 319,
    amount: 16,
    x: 4800,
    y: 0
  }];
  const blocked = createBrowserlessDecisionAdapter(common).evaluateRealtime(
    blockedState,
    { ...common, nowMs: 2000 }
  );
  assert.strictEqual(blocked.action, null);
  assert.strictEqual(blocked.input?.loot?.reason, 'active-player-in-coin-pickup-area');
  assert.strictEqual(blocked.input?.loot?.candidateCount, 0);
  assert.strictEqual(blocked.input?.loot?.competitionBlocked?.[0]?.competitorId, '8');

  const committedAdapter = createBrowserlessDecisionAdapter(common);
  const initialState = state(fullStaminaSelf());
  initialState.fallback.tick = 3;
  initialState.fallback.receivedAtMs = 3000;
  initialState.fallback.coinDrops = [{ drop_id: 319, amount: 16, x: 4800, y: 0 }];
  const initial = committedAdapter.evaluateRealtime(initialState, { ...common, nowMs: 3000 });
  assert.strictEqual(initial.action?.kind, 'coin');

  const competitionState = state(fullStaminaSelf(), [activePlayer]);
  competitionState.fallback.tick = 4;
  competitionState.fallback.receivedAtMs = 3200;
  competitionState.fallback.coinDrops = [{ drop_id: 319, amount: 16, x: 4800, y: 0 }];
  const retained = committedAdapter.evaluateRealtime(competitionState, { ...common, nowMs: 3200 });
  assert.strictEqual(retained.action?.kind, 'coin');
  assert.strictEqual(retained.action?.target?.id, 319);
  assert.strictEqual(retained.input?.loot?.reason, 'high-value-visible-coin');
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
  assert.strictEqual(killed.profit?.mission?.type, 'coin');
  assert.strictEqual(killed.profit?.mission?.targetId, 'drop-99');
  assert.strictEqual(adapter.getState().completedProfitTargets?.['99']?.reason, 'self-kill-evidence');

  const settledState = state(fullStaminaSelf({ x: 48000 }));
  settledState.realtime.tick = 6290;
  settledState.fallback.tick = 6290;
  settledState.fallback.coinDropsObserved = true;
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
  assert.strictEqual(visible.profit?.remoteProfit?.remoteMissionReclaimBlocked, false);
  assert.strictEqual(visible.profit?.mission?.type, 'enemy');
  assert.strictEqual(visible.profit?.mission?.targetId, '7248');
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
  assert.strictEqual(next.profit?.remoteProfit?.remoteMissionReclaimBlocked, false);
  assert.strictEqual(next.profit?.mission?.targetId, '6649');
  assert.strictEqual(next.profit?.remoteProfit?.selected, null);
}

function assertProfitMissionContinuityRegressions() {
  const common = {
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
  const remoteHeldAdapter = createBrowserlessDecisionAdapter(common);
  const remoteHeldBatch = batch(remoteCandidate({
    userId: 501,
    drop: 120,
    expectedReward: 120,
    adjustedScore: 2000000
  }));
  const remoteSelected = decide(remoteHeldAdapter, state(fullStaminaSelf()), 2000, remoteHeldBatch, common);
  assert.strictEqual(remoteSelected.action?.target?.userId, 501);
  const lowerVisible = ordinaryProfitTarget(502, 1000, 20);
  const remoteRetained = decide(
    remoteHeldAdapter,
    state(fullStaminaSelf(), [lowerVisible]),
    2100,
    remoteHeldBatch,
    common
  );
  assert.strictEqual(remoteRetained.action?.kind, 'seek-remote-player');
  assert.strictEqual(remoteRetained.action?.target?.userId, 501);
  assert.strictEqual(remoteRetained.profit?.mission?.targetId, '501');

  const visibleHeldAdapter = createBrowserlessDecisionAdapter(common);
  const visibleHighDrop = ordinaryProfitTarget(601, 1600, 120);
  const visibleSelected = decide(
    visibleHeldAdapter,
    state(fullStaminaSelf(), [visibleHighDrop]),
    3000,
    null,
    common
  );
  assert.strictEqual(visibleSelected.action?.target?.userId, 601);
  const lowerActiveRemoteBatch = batch(remoteCandidate({
    userId: 602,
    active: true,
    classification: 'easy-kill-active',
    easyKillScore: 3,
    drop: 80,
    expectedReward: 80,
    adjustedScore: 999999999
  }), { generation: 9, observedAtMs: 3000 });
  const visibleRetained = decide(
    visibleHeldAdapter,
    state(fullStaminaSelf(), [visibleHighDrop]),
    3100,
    lowerActiveRemoteBatch,
    common
  );
  assert.strictEqual(visibleRetained.action?.kind, 'attack');
  assert.strictEqual(visibleRetained.action?.target?.userId, 601);
  assert.strictEqual(visibleRetained.profit?.mission?.targetId, '601');
  assert.strictEqual(
    visibleRetained.profit?.remoteProfit?.filtered?.['lower-active-offscreen-than-visible-high-drop'],
    1
  );

  const killReplayAdapter = createBrowserlessDecisionAdapter(common);
  const killReplayBatch = batch(remoteCandidate({ userId: 701, drop: 90, expectedReward: 90 }), { tick: 8000 });
  decide(killReplayAdapter, state(fullStaminaSelf()), 4000, killReplayBatch, common);
  const killMessage = {
    kind: 'kill',
    user_id: 7,
    target_user_id: 701,
    target_name: 'historical-target',
    tick: 8000
  };
  const firstKillFrame = state(fullStaminaSelf());
  firstKillFrame.realtime.tick = 8000;
  firstKillFrame.fallback.tick = 8000;
  firstKillFrame.fallback.messages = [killMessage];
  decide(killReplayAdapter, firstKillFrame, 4100, killReplayBatch, common);
  const firstUntil = killReplayAdapter.getState().completedProfitTargets?.['701']?.until;
  const replayedKillFrame = state(fullStaminaSelf());
  replayedKillFrame.realtime.tick = 8000;
  replayedKillFrame.fallback.tick = 8000;
  replayedKillFrame.fallback.messages = [killMessage];
  decide(killReplayAdapter, replayedKillFrame, 5000, killReplayBatch, common);
  assert.strictEqual(killReplayAdapter.getState().completedProfitTargets?.['701']?.until, firstUntil);
  assert.strictEqual(Object.keys(killReplayAdapter.getState().completedProfitKillEvidence || {}).length, 1);
}

function assertTickWatermarkedCompletionRegressions() {
  const common = {
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
  const mango = remoteCandidate({
    userId: 31361,
    name: 'mango',
    drop: 227,
    expectedReward: 227,
    adjustedScore: 900000
  });
  const crossDayAdapter = createBrowserlessDecisionAdapter(common);
  const oldBatch = batch(mango, { generation: 1, tick: 1682100 });
  const oldFrame = state(fullStaminaSelf());
  oldFrame.realtime.tick = 1682100;
  oldFrame.fallback.tick = 1682100;
  decide(crossDayAdapter, oldFrame, 1000, oldBatch, common);
  const crossDayFrame = state(fullStaminaSelf());
  crossDayFrame.realtime.tick = 73;
  crossDayFrame.fallback.tick = 73;
  crossDayFrame.fallback.messages = [{
    kind: 'kill',
    user_id: 7,
    target_user_id: 31361,
    target_name: 'mango',
    tick: 1682100
  }];
  const crossDay = decide(
    crossDayAdapter,
    crossDayFrame,
    2000,
    batch(mango, { generation: 2, tick: 73 }),
    common
  );
  assert.strictEqual(crossDayAdapter.getState().completedProfitTargets?.['31361'], undefined);
  assert.strictEqual(crossDayAdapter.getState().completedProfitKillEvidence?.['31361:1682100'], undefined);
  assert.strictEqual(crossDay.profit?.remoteProfit?.filtered?.['target-drop-observed'], undefined);
  assert.strictEqual(crossDay.profit?.remoteProfit?.selected?.userId, 31361);
  assert.strictEqual(crossDay.input?.postKillSettlement, null);

  const sameSnapshotAdapter = createBrowserlessDecisionAdapter(common);
  const sameSnapshotBatch = batch(mango, { generation: 3, tick: 6268 });
  const sameSnapshotFrame = state(fullStaminaSelf(), [], [{
    drop_id: 'mango-drop',
    source_user_id: 31361,
    amount: 227,
    x: 90000,
    y: 0
  }], true);
  sameSnapshotFrame.realtime.tick = 6268;
  sameSnapshotFrame.fallback.tick = 6268;
  const sameSnapshot = decide(sameSnapshotAdapter, sameSnapshotFrame, 3000, sameSnapshotBatch, common);
  assert.strictEqual(sameSnapshot.profit?.remoteProfit?.filtered?.['target-drop-observed'], 1);
  assert.strictEqual(sameSnapshotAdapter.getState().completedProfitTargets?.['31361']?.observedTick, 6268);
  const newerSnapshotFrame = state(fullStaminaSelf());
  newerSnapshotFrame.realtime.tick = 6290;
  newerSnapshotFrame.fallback.tick = 6290;
  const newerSnapshot = decide(
    sameSnapshotAdapter,
    newerSnapshotFrame,
    3100,
    batch(mango, { generation: 4, tick: 6290 }),
    common
  );
  assert.strictEqual(newerSnapshot.profit?.remoteProfit?.filtered?.['target-drop-observed'], undefined);
  assert.strictEqual(newerSnapshot.profit?.remoteProfit?.selected?.userId, 31361);

  const persistentCoinAdapter = createBrowserlessDecisionAdapter(common);
  const persistentCoinBatch = batch(mango, { generation: 5, tick: 6268 });
  const persistentCoinFirst = state(fullStaminaSelf(), [], [{
    drop_id: 'mango-drop',
    source_user_id: 31361,
    amount: 227,
    x: 90000,
    y: 0
  }], true);
  persistentCoinFirst.realtime.tick = 6268;
  persistentCoinFirst.fallback.tick = 6268;
  decide(persistentCoinAdapter, persistentCoinFirst, 4000, persistentCoinBatch, common);
  const persistentCoinSame = state(fullStaminaSelf(), [], [{
    drop_id: 'mango-drop',
    source_user_id: 31361,
    amount: 227,
    x: 90000,
    y: 0
  }], true);
  persistentCoinSame.realtime.tick = 6290;
  persistentCoinSame.fallback.tick = 6290;
  const persistent = decide(
    persistentCoinAdapter,
    persistentCoinSame,
    4100,
    batch(mango, { generation: 6, tick: 6290 }),
    common
  );
  assert.strictEqual(persistent.profit?.remoteProfit?.filtered?.['target-drop-observed'], 1);
  assert.strictEqual(persistentCoinAdapter.getState().completedProfitTargets?.['31361']?.observedTick, 6290);
  const persistentCoinGone = state(fullStaminaSelf());
  persistentCoinGone.realtime.tick = 6310;
  persistentCoinGone.fallback.tick = 6310;
  const released = decide(
    persistentCoinAdapter,
    persistentCoinGone,
    4200,
    batch(mango, { generation: 7, tick: 6310 }),
    common
  );
  assert.strictEqual(released.profit?.remoteProfit?.filtered?.['target-drop-observed'], undefined);
  assert.strictEqual(released.profit?.remoteProfit?.selected?.userId, 31361);

  const noTickAdapter = createBrowserlessDecisionAdapter(common);
  const noTickFrame = state(fullStaminaSelf());
  noTickFrame.realtime.tick = 73;
  noTickFrame.fallback.tick = 73;
  noTickFrame.fallback.messages = [{
    kind: 'kill',
    user_id: 7,
    target_user_id: 31361,
    target_name: 'mango'
  }];
  const noTick = decide(
    noTickAdapter,
    noTickFrame,
    5000,
    batch(mango, { generation: 8, tick: 73 }),
    common
  );
  assert.strictEqual(noTickAdapter.getState().completedProfitTargets?.['31361'], undefined);
  assert.strictEqual(noTick.profit?.remoteProfit?.filtered?.['target-drop-observed'], undefined);
  assert.strictEqual(noTick.profit?.remoteProfit?.selected?.userId, 31361);

  const syncAdapter = createBrowserlessDecisionAdapter(common);
  syncAdapter.patchState({
    profitTickEpoch: 2,
    profitLastRealtimeTick: 73,
    completedProfitTargets: {
      '31361': {
        tickEpoch: 2,
        eventTick: 70,
        observedTick: 73,
        observedAt: 7000,
        until: 999999999
      }
    }
  });
  syncAdapter.syncPlannerDecision({
    stateful: {
      profitTickEpoch: 1,
      profitLastRealtimeTick: 1682100,
      completedProfitTargets: {
        '31361': {
          tickEpoch: 1,
          eventTick: 1682100,
          observedTick: 1682100,
          observedAt: 9000,
          until: 999999999
        }
      },
      completedProfitKillEvidence: {}
    }
  });
  assert.strictEqual(syncAdapter.getState().profitTickEpoch, 2);
  assert.strictEqual(syncAdapter.getState().completedProfitTargets?.['31361']?.observedTick, 73);
  syncAdapter.syncPlannerDecision({
    stateful: {
      profitTickEpoch: 3,
      profitLastRealtimeTick: 90,
      completedProfitTargets: {
        '31361': {
          tickEpoch: 3,
          eventTick: 88,
          observedTick: 90,
          observedAt: 10000,
          until: 999999999
        }
      },
      completedProfitKillEvidence: {}
    }
  });
  assert.strictEqual(syncAdapter.getState().profitTickEpoch, 3);
  assert.strictEqual(syncAdapter.getState().completedProfitTargets?.['31361']?.observedTick, 90);
}

function assertDualTargetRuntimeRules() {
  const common = {
    userId: 7,
    controlMode: 'profit-live',
    combatEnabled: true,
    dynamicProfitThresholdEnabled: false,
    singleCoinBaitEnabled: false,
    finalActionArbitrationHoldMs: 0,
    opportunitySwitchConfirmFrames: 1,
    opportunitySwitchMargin: 0,
    opportunitySwitchRelativeMargin: 0,
    combatShootNoPressureDodgeReserveMs: 0,
    combatShootDodgeReserveMs: 0
  };
  const primary = {
    entity_id: 2042,
    user_id: 42,
    name: 'primary-profit',
    x: -5000,
    y: 0,
    vx: 0,
    vy: 0,
    hp: 100,
    max_hp: 100,
    current_join_mode: 'AFK',
    active: false,
    firing: false,
    stamina_5s_remaining_milli: 1000000,
    stamina_5s_limit_milli: 1000000,
    drop: 80
  };
  const secondary = {
    entity_id: 2008,
    user_id: 8,
    name: 'secondary-defender',
    x: 8000,
    y: 3000,
    vx: 0,
    vy: 0,
    hp: 100,
    max_hp: 100,
    current_join_mode: 'Active',
    active: true,
    firing: true,
    stamina_5s_remaining_milli: 1000000,
    stamina_5s_limit_milli: 1000000,
    drop: 1
  };
  const dualAdapter = createBrowserlessDecisionAdapter(common);
  const defensiveFrame = state(
    fullStaminaSelf({ hp: 70 }),
    [{ ...primary, invulnerable: true, invulnerable_remaining_ms: 5000 }, secondary]
  );
  defensiveFrame.realtime.bullets = [{
    bullet_id: 'secondary-defensive-shot',
    owner_user_id: 8,
    x: 8000,
    y: 10000,
    target_x: 0,
    target_y: 10000,
    speed_per_tick: 500,
    created_tick: 1,
    expire_tick: 30
  }];
  const dual = decide(
    dualAdapter,
    defensiveFrame,
    1000,
    null,
    common
  );
  assert.strictEqual(dual.action?.kind, 'combat-live');
  assert.strictEqual(dual.combat?.target?.combatRole, 'secondary');
  assert.strictEqual(dual.combat?.target?.primaryTargetId, '42');
  assert.strictEqual(dual.combat?.fireTarget?.userId, 8);
  assert.strictEqual(dual.combat?.shooting?.wouldShoot, true);
  assert.strictEqual(dual.combat?.shooting?.mode, 'secondary-defensive');
  assert.strictEqual(dual.combat?.shooting?.secondaryPolicy?.opponentShots, 1);
  assert.strictEqual(dual.combat?.exit, null);

  const primaryFrame = state(fullStaminaSelf({ hp: 70 }), [primary, secondary]);
  primaryFrame.realtime.tick = 2;
  const primarySelected = decide(dualAdapter, primaryFrame, 1100, null, common);
  assert.strictEqual(primarySelected.combat?.target?.userId, 8);
  // The previous frame's protection lease remains active, so the defensive
  // secondary is still the only legal fire target.
  assert.strictEqual(primarySelected.combat?.fireTarget?.userId, 8);
  assert.strictEqual(primarySelected.combat?.shooting?.targetRole, 'secondary');
  assert.strictEqual(primarySelected.combat?.shooting?.mode, 'secondary-defensive');
  assert.strictEqual(primarySelected.combat?.shooting?.wouldShoot, true);

  let missingPrimaryDecision = null;
  for (const [tick, nowMs] of [[3, 1200], [4, 1350], [5, 1500]]) {
    const missingPrimaryFrame = state(fullStaminaSelf({ hp: 80 }), [secondary]);
    missingPrimaryFrame.realtime.tick = tick;
    missingPrimaryFrame.realtime.receivedAtMs = nowMs;
    missingPrimaryDecision = decide(dualAdapter, missingPrimaryFrame, nowMs, null, common);
  }
  const missingPrimaryState = dualAdapter.getState();
  const primarySettlement = Object.values(missingPrimaryState.postKillSettlements || {})
    .find(settlement => settlement?.primaryTargetDropPriority === true);
  assert.strictEqual(primarySettlement?.targetId, '42');
  assert.strictEqual(primarySettlement?.x, -5000);
  assert.strictEqual(primarySettlement?.authority, 'realtime');
  assert.strictEqual(primarySettlement?.killAttribution, 'external-or-unknown');
  assert.strictEqual(missingPrimaryState.primaryTargetSettlementEvidence?.published, true);

  const reappearanceAdapter = createBrowserlessDecisionAdapter(common);
  const replayPrimaryPresence = (entities, tick, nowMs) => {
    const frame = state(fullStaminaSelf({ hp: 80 }), entities);
    frame.realtime.tick = tick;
    frame.realtime.receivedAtMs = nowMs;
    return decide(reappearanceAdapter, frame, nowMs, null, common);
  };
  replayPrimaryPresence([primary, secondary], 20, 5000);
  replayPrimaryPresence([primary, secondary], 21, 5050);
  replayPrimaryPresence([secondary], 22, 5100);
  replayPrimaryPresence([secondary], 23, 5250);
  replayPrimaryPresence([secondary], 24, 5400);
  const firstDisappearanceEvidence = {
    ...reappearanceAdapter.getState().primaryTargetSettlementEvidence
  };
  assert.strictEqual(firstDisappearanceEvidence.targetId, '42');
  assert.strictEqual(firstDisappearanceEvidence.published, true);
  assert.strictEqual(firstDisappearanceEvidence.observedAtMs, 5400);

  replayPrimaryPresence([primary, secondary], 25, 5450);
  const reappearedState = reappearanceAdapter.getState();
  assert.strictEqual(reappearedState.primaryTargetSettlementEvidence, null);
  assert.ok(Object.values(reappearedState.postKillSettlements || {}).some(settlement => (
    settlement?.targetId === '42'
      && settlement?.terminalReason === 'target-reappeared-alive'
      && settlement?.active === false
  )));

  replayPrimaryPresence([primary, secondary], 26, 5500);
  replayPrimaryPresence([secondary], 27, 5550);
  replayPrimaryPresence([secondary], 28, 5700);
  replayPrimaryPresence([secondary], 29, 5850);
  const secondDisappearanceState = reappearanceAdapter.getState();
  assert.strictEqual(secondDisappearanceState.primaryTargetSettlementEvidence?.targetId, '42');
  assert.strictEqual(secondDisappearanceState.primaryTargetSettlementEvidence?.published, true);
  assert.strictEqual(secondDisappearanceState.primaryTargetSettlementEvidence?.observedAtMs, 5850);
  assert.ok(Object.values(secondDisappearanceState.postKillSettlements || {}).some(settlement => (
    settlement?.targetId === '42'
      && settlement?.primaryTargetDropPriority === true
      && settlement?.active !== false
      && settlement?.startedAt === 5850
  )));

  const pressureBullet = (id, tick) => ({
    bullet_id: id,
    owner_user_id: 8,
    x: 1000,
    y: 5000,
    target_x: 0,
    target_y: 5000,
    speed_per_tick: 500,
    created_tick: tick,
    expire_tick: tick + 30
  });
  const pressureDecision = (adapter, primaryTarget, tick, nowMs, bullets, selfHp = 70) => {
    const pressureSecondary = { ...secondary, x: 1000, y: 0 };
    const current = state(fullStaminaSelf({ hp: selfHp }), [primaryTarget, pressureSecondary]);
    current.realtime.tick = tick;
    current.realtime.receivedAtMs = nowMs;
    current.realtime.bullets = bullets;
    return decide(adapter, current, nowMs, null, common);
  };
  const unsafePressureAdapter = createBrowserlessDecisionAdapter(common);
  pressureDecision(
    unsafePressureAdapter,
    { ...primary, x: -5000, hp: 100 },
    10,
    2000,
    [pressureBullet('pressure-1', 10)]
  );
  const unsafePressure = pressureDecision(
    unsafePressureAdapter,
    { ...primary, x: -5000, hp: 100 },
    11,
    2100,
    [pressureBullet('pressure-1', 10), pressureBullet('pressure-2', 11)]
  );
  assert.strictEqual(unsafePressure.combat?.shooting?.secondaryPolicy?.closePressure?.active, true);
  assert.strictEqual(unsafePressure.combat?.shooting?.mode, 'secondary-focus');
  assert.strictEqual(unsafePressure.combat?.shooting?.secondaryFocusActive, true);
  assert.strictEqual(unsafePressure.combat?.fireTarget?.userId, 8);
  assert.strictEqual(unsafePressure.combat?.shooting?.secondaryPolicy?.throttleExempt, true);
  assert.strictEqual(unsafePressure.combat?.movement?.secondaryTarget?.direction?.dx, -1);

  const safePressureAdapter = createBrowserlessDecisionAdapter(common);
  pressureDecision(
    safePressureAdapter,
    { ...primary, x: -500, hp: 1 },
    20,
    3000,
    [pressureBullet('safe-pressure-1', 20)],
    100
  );
  const safePressure = pressureDecision(
    safePressureAdapter,
    { ...primary, x: -500, hp: 1 },
    21,
    3100,
    [pressureBullet('safe-pressure-1', 20), pressureBullet('safe-pressure-2', 21)],
    100
  );
  assert.strictEqual(safePressure.combat?.shooting?.secondaryPolicy?.closePressure?.active, true);
  assert.strictEqual(safePressure.combat?.shooting?.mode, 'primary-finish-race');
  assert.strictEqual(safePressure.combat?.fireTarget?.userId, 42);
  assert.strictEqual(safePressure.combat?.shooting?.primaryFinishRace?.eligible, true);
  assert.strictEqual(safePressure.combat?.shooting?.targetRole, 'primary');
  assert.strictEqual(safePressure.combat?.shooting?.secondaryPolicy?.dispatchCountInWindow, 0);
  assert.strictEqual(safePressure.combat?.shooting?.primaryRewardSurvivalRace?.continuePrimary, true);

  const primaryDrop = {
    drop_id: 'primary-drop',
    source_user_id: 42,
    amount: 1,
    x: -5000,
    y: 0,
    authority: 'realtime'
  };
  const primaryDropDecision = decide(
    dualAdapter,
    state(fullStaminaSelf({ hp: 80 }), [secondary], [primaryDrop], true),
    1550,
    null,
    common
  );
  assert.strictEqual(primaryDropDecision.action?.reason, 'primary-target-drop-priority');
  assert.strictEqual(primaryDropDecision.action?.target?.primaryTargetDropPriority, true);
  assert.strictEqual(primaryDropDecision.action?.target?.selfKilledPlayerDrop, false);
  assert.strictEqual(primaryDropDecision.action?.target?.killAttribution, 'external-or-unknown');

  const lowHpPrimaryDropDecision = decide(
    dualAdapter,
    state(fullStaminaSelf({ hp: 50 }), [secondary], [primaryDrop], true),
    1600,
    null,
    common
  );
  assert.strictEqual(lowHpPrimaryDropDecision.action?.shouldLeave, true);
  assert.notStrictEqual(lowHpPrimaryDropDecision.action?.reason, 'primary-target-drop-priority');
  assert.strictEqual(lowHpPrimaryDropDecision.action?.finalCandidate?.hardGate, true);

  const raceAdapter = createBrowserlessDecisionAdapter({
    ...common,
    easyKillPlayers: [{ userId: 8, score: 3 }],
    dailyDamageUserIds: [8]
  });
  const raceTarget = {
    ...secondary,
    x: 5000,
    y: 5000,
    hp: 10,
    drop: 120,
    firing: true
  };
  const raceFirst = decide(
    raceAdapter,
    state(fullStaminaSelf(), [raceTarget]),
    2000,
    null,
    { ...common, easyKillPlayers: [{ userId: 8, score: 3 }], dailyDamageUserIds: [8] }
  );
  assert.strictEqual(raceFirst.combat?.target?.combatRole, 'primary');
  assert.strictEqual(raceFirst.combat?.movement?.profitKillRace?.active, false);
  assert.notStrictEqual(raceFirst.combat?.movement?.reason, 'profit-target-competition-approach');
  const closerPlayer = {
    entity_id: 2009,
    user_id: 9,
    name: 'closer-active-player',
    x: 4900,
    y: 5000,
    vx: 0,
    vy: 0,
    hp: 100,
    max_hp: 100,
    current_join_mode: 'Active',
    active: false,
    firing: false,
    stamina_5s_remaining_milli: 1000000,
    stamina_5s_limit_milli: 1000000,
    drop: 0
  };
  const raceSecond = decide(
    raceAdapter,
    state(fullStaminaSelf(), [{ ...raceTarget, firing: false }, closerPlayer]),
    3000,
    null,
    { ...common, easyKillPlayers: [{ userId: 8, score: 3 }], dailyDamageUserIds: [8] }
  );
  assert.strictEqual(raceSecond.combat?.target?.combatRole, 'primary');
  assert.strictEqual(raceSecond.combat?.movement?.reason, 'profit-target-competition-approach');
  assert.strictEqual(raceSecond.combat?.shooting?.wouldShoot, false);
  assert.strictEqual(
    raceSecond.combat?.shooting?.finalFireBlocker,
    'profit-kill-race:active-player-as-close-or-closer-to-primary-profit-target'
  );
  assert.strictEqual(raceSecond.combat?.shooting?.profitKillRace?.closerCompetitor?.id, '9');

  const racePickupRadius = decide(
    raceAdapter,
    state(fullStaminaSelf({ x: 4850, y: 5000 }), [{ ...raceTarget, firing: false }, closerPlayer]),
    4000,
    null,
    { ...common, easyKillPlayers: [{ userId: 8, score: 3 }], dailyDamageUserIds: [8] }
  );
  assert.strictEqual(racePickupRadius.combat?.target?.combatRole, 'primary');
  assert.strictEqual(racePickupRadius.combat?.shooting?.profitKillRace?.insidePickupRadius, true);
  assert.strictEqual(racePickupRadius.combat?.shooting?.wouldShoot, true);
}

function assertHpSegmentedSecondaryEngagementRules() {
  const common = {
    userId: 7,
    controlMode: 'profit-live',
    combatEnabled: true,
    dynamicProfitThresholdEnabled: false,
    singleCoinBaitEnabled: false,
    finalActionArbitrationHoldMs: 0,
    opportunitySwitchConfirmFrames: 1,
    opportunitySwitchMargin: 0,
    opportunitySwitchRelativeMargin: 0,
    combatShootNoPressureDodgeReserveMs: 0,
    combatShootDodgeReserveMs: 0
  };
  const player = (overrides = {}) => ({
    entity_id: 2008,
    user_id: 8,
    name: 'ordinary-player',
    x: 5000,
    y: 0,
    vx: 0,
    vy: 0,
    hp: 100,
    max_hp: 100,
    current_join_mode: 'Active',
    active: true,
    firing: false,
    stamina_5s_remaining_milli: 10000,
    stamina_5s_limit_milli: 10000,
    drop: 10,
    ...overrides
  });
  const primary = player({
    entity_id: 2042,
    user_id: 42,
    name: 'selected-primary',
    x: 6000,
    vx: 10,
    stamina_5s_remaining_milli: 5000,
    drop: 100
  });
  const installMission = (adapter, missionTarget) => adapter.patchState({
    profitMission: {
      active: true,
      key: `enemy:${missionTarget.user_id}`,
      missionKey: `enemy:${missionTarget.user_id}`,
      type: 'enemy',
      subjectId: String(missionTarget.user_id),
      targetId: String(missionTarget.user_id),
      navigationTarget: { ...missionTarget },
      choice: { type: 'enemy', id: missionTarget.user_id, sourceTarget: { ...missionTarget } },
      highValue: true,
      selectedAt: 500,
      expiresAt: 200000
    }
  });
  const installPrimaryMission = adapter => installMission(adapter, primary);

  const profitable = decide(
    createBrowserlessDecisionAdapter(common),
    state(fullStaminaSelf({ hp: 100 }), [player({ vx: 10, stamina_5s_remaining_milli: 5000 })]),
    1000,
    null,
    common
  );
  assert.strictEqual(profitable.combat?.target?.userId, 8);
  assert.strictEqual(profitable.combat?.target?.combatRole, 'primary');
  assert.strictEqual(profitable.combat?.target?.secondaryTarget, false);

  const highHpNonPrimaryAdapter = createBrowserlessDecisionAdapter(common);
  installPrimaryMission(highHpNonPrimaryAdapter);
  const highHpNonPrimary = decide(
    highHpNonPrimaryAdapter,
    state(fullStaminaSelf({ hp: 100 }), [primary, player({
      vx: 10,
      stamina_5s_remaining_milli: 5000,
      drop: 90
    })]),
    1100,
    null,
    common
  );
  assert.notStrictEqual(highHpNonPrimary.combat?.target?.userId, 8);
  assert.strictEqual(highHpNonPrimary.stateful?.profitMission?.targetId, '42');

  const lowDropAttacker = decide(
    createBrowserlessDecisionAdapter(common),
    state(fullStaminaSelf({ hp: 100 }), [player({ drop: 1, firing: true })]),
    1200,
    null,
    common
  );
  assert.strictEqual(lowDropAttacker.combat?.target?.combatRole, 'secondary');
  assert.strictEqual(lowDropAttacker.combat?.target?.primaryTargetId, '');
  assert.strictEqual(lowDropAttacker.combat?.shooting?.wouldShoot, false);
  assert.strictEqual(lowDropAttacker.combat?.shooting?.secondaryPolicy?.opponentShots, 0);
  assert.strictEqual(lowDropAttacker.combat?.movement?.modifiers?.includes('close-in'), false);

  const mediumContact = decide(
    createBrowserlessDecisionAdapter(common),
    state(fullStaminaSelf({ hp: 70, stamina_5s_remaining_milli: 10 }), [player({
      x: 14500,
      drop: 0,
      active: true,
      current_join_mode: 'Active',
      stamina_5s_remaining_milli: 5000
    })]),
    1300,
    null,
    common
  );
  assert.strictEqual(mediumContact.combat?.target?.combatRole, 'secondary');
  assert.strictEqual(mediumContact.combat?.target?.combatIntent, 'secondary-proximity');
  assert.strictEqual(mediumContact.combat?.shooting?.wouldShoot, false);
  assert.strictEqual(mediumContact.combat?.shooting?.secondaryPolicy?.opponentShots, 0);
  assert.strictEqual(mediumContact.combat?.movement?.dx, 0);
  assert.strictEqual(mediumContact.combat?.movement?.dy, 0);

  const mediumPassiveIgnored = decide(
    createBrowserlessDecisionAdapter(common),
    state(fullStaminaSelf({ hp: 70 }), [player({
      x: 14500,
      drop: 0,
      active: false,
      current_join_mode: 'Passive'
    })]),
    1350,
    null,
    common
  );
  assert.strictEqual(mediumPassiveIgnored.combat?.target, null);
  assert.notStrictEqual(mediumPassiveIgnored.action?.reason, 'combat-low-hp-secondary-leave');

  const outsideMedium = decide(
    createBrowserlessDecisionAdapter(common),
    state(fullStaminaSelf({ hp: 70 }), [player({
      x: 14501,
      drop: 0,
      active: false,
      current_join_mode: 'Passive'
    })]),
    1400,
    null,
    common
  );
  assert.strictEqual(outsideMedium.combat?.target, null);

  const lowHpPassiveIgnored = decide(
    createBrowserlessDecisionAdapter(common),
    state(fullStaminaSelf({ hp: 50 }), [player({
      drop: 0,
      active: false,
      current_join_mode: 'Passive'
    })]),
    1450,
    null,
    common
  );
  assert.strictEqual(lowHpPassiveIgnored.combat?.target, null);
  assert.notStrictEqual(lowHpPassiveIgnored.action?.reason, 'combat-low-hp-secondary-leave');

  for (const selfHp of [49, 50]) {
    for (const targetHp of [40, 60]) {
      const lowHpSecondary = decide(
        createBrowserlessDecisionAdapter(common),
        state(fullStaminaSelf({ hp: selfHp }), [player({
          hp: targetHp,
          drop: 0,
          active: true,
          current_join_mode: 'Active',
          stamina_5s_remaining_milli: 5000
        })]),
        1500 + selfHp + targetHp,
        null,
        common
      );
      assert.strictEqual(lowHpSecondary.combat?.target?.combatRole, 'secondary');
      assert.strictEqual(lowHpSecondary.combat?.exit?.reason, 'combat-low-hp-secondary-leave');
      assert.strictEqual(lowHpSecondary.action?.reason, 'combat-low-hp-secondary-leave');
    }
  }

  const lowHpPrimaryAheadTarget = player({
      hp: 40,
      drop: 100,
      vx: 10,
      stamina_5s_remaining_milli: 5000
  });
  const lowHpPrimaryAheadAdapter = createBrowserlessDecisionAdapter(common);
  installMission(lowHpPrimaryAheadAdapter, lowHpPrimaryAheadTarget);
  const lowHpPrimaryAhead = decide(
    lowHpPrimaryAheadAdapter,
    state(fullStaminaSelf({ hp: 49 }), [lowHpPrimaryAheadTarget]),
    1600,
    null,
    common
  );
  assert.strictEqual(lowHpPrimaryAhead.combat?.target?.combatRole, 'primary');
  assert.notStrictEqual(lowHpPrimaryAhead.combat?.exit?.reason, 'combat-low-hp-secondary-leave');
  assert.notStrictEqual(lowHpPrimaryAhead.action?.reason, 'combat-low-hp-secondary-leave');

  const lowHpPrimaryBehindTarget = player({
      hp: 60,
      drop: 100,
      vx: 10,
      stamina_5s_remaining_milli: 5000
  });
  const lowHpPrimaryBehindAdapter = createBrowserlessDecisionAdapter(common);
  installMission(lowHpPrimaryBehindAdapter, lowHpPrimaryBehindTarget);
  const lowHpPrimaryBehind = decide(
    lowHpPrimaryBehindAdapter,
    state(fullStaminaSelf({ hp: 49 }), [lowHpPrimaryBehindTarget]),
    1700,
    null,
    common
  );
  assert.strictEqual(lowHpPrimaryBehind.combat?.target?.combatRole, 'primary');
  assert.strictEqual(lowHpPrimaryBehind.combat?.exit?.reason, 'combat-low-hp-disadvantage-leave');

  const lowHpCrossfireAdapter = createBrowserlessDecisionAdapter(common);
  installPrimaryMission(lowHpCrossfireAdapter);
  const lowHpCrossfire = decide(
    lowHpCrossfireAdapter,
    state(fullStaminaSelf({ hp: 49 }), [primary, player({
      drop: 0,
      active: true,
      current_join_mode: 'Active',
      stamina_5s_remaining_milli: 5000
    })]),
    1800,
    null,
    common
  );
  assert.strictEqual(lowHpCrossfire.combat?.target?.userId, 8);
  assert.strictEqual(lowHpCrossfire.combat?.target?.combatRole, 'secondary');
  assert.strictEqual(lowHpCrossfire.action?.reason, 'combat-low-hp-secondary-leave');
  assert.strictEqual(lowHpCrossfire.stateful?.profitMission?.targetId, '42');

  const retentionAdapter = createBrowserlessDecisionAdapter(common);
  installPrimaryMission(retentionAdapter);
  const entered = decide(
    retentionAdapter,
    state(fullStaminaSelf({ hp: 100 }), [primary, player({ drop: 1, firing: true })]),
    2000,
    null,
    common
  );
  const retainedAtBoundary = decide(
    retentionAdapter,
    state(fullStaminaSelf({ hp: 100 }), [primary, player({ drop: 1, firing: false })]),
    7000,
    null,
    common
  );
  const releasedAfterBoundary = decide(
    retentionAdapter,
    state(fullStaminaSelf({ hp: 100 }), [primary, player({ drop: 1, firing: false })]),
    7001,
    null,
    common
  );
  assert.strictEqual(entered.combat?.target?.combatRole, 'secondary');
  assert.strictEqual(retainedAtBoundary.combat?.target?.combatRole, 'secondary');
  assert.strictEqual(retainedAtBoundary.combat?.secondaryRetention?.ageMs, 5000);
  assert.strictEqual(releasedAfterBoundary.combat?.target?.userId, 42);
  assert.strictEqual(releasedAfterBoundary.combat?.secondaryTargetRelease?.reason, 'secondary-defensive-evidence-cleared');
  assert.strictEqual(releasedAfterBoundary.stateful?.profitMission?.targetId, '42');
  assert.strictEqual(releasedAfterBoundary.stateful?.combatEngagements?.['8'], undefined);
  assert.strictEqual(releasedAfterBoundary.stateful?.combatMetricsByTarget?.['8'], undefined);
  assert.notStrictEqual(String(releasedAfterBoundary.stateful?.combatTarget?.id || ''), '8');
  assert.notStrictEqual(String(releasedAfterBoundary.stateful?.combatAim?.targetId || ''), '8');
  assert.strictEqual(releasedAfterBoundary.stateful?.combatHpObservationTargetId === '8', false);
  assert.ok(releasedAfterBoundary.stateful?.combatTargetSwitchGate == null);
  assert.ok(releasedAfterBoundary.stateful?.combatTargetSwitchHistory == null);
  assert.strictEqual(releasedAfterBoundary.stateful?.profitEscortContinuity, null);
  assert.strictEqual(
    releasedAfterBoundary.stateful?.profitEscortContinuityLastRelease?.releaseReason,
    'secondary-defensive-evidence-cleared'
  );

  const mediumReleaseAdapter = createBrowserlessDecisionAdapter(common);
  const mediumEntered = decide(
    mediumReleaseAdapter,
    state(fullStaminaSelf({ hp: 70 }), [player({
      drop: 0,
      active: false,
      current_join_mode: 'Passive',
      firing: true
    })]),
    3000,
    null,
    common
  );
  const mediumOutsideAtBoundary = decide(
    mediumReleaseAdapter,
    state(fullStaminaSelf({ hp: 70 }), [player({
      x: 14501,
      drop: 0,
      active: false,
      current_join_mode: 'Passive',
      firing: false
    })]),
    8000,
    null,
    common
  );
  const mediumReleased = decide(
    mediumReleaseAdapter,
    state(fullStaminaSelf({ hp: 70 }), [player({
      x: 14501,
      drop: 0,
      active: false,
      current_join_mode: 'Passive',
      firing: false
    })]),
    8001,
    null,
    common
  );
  assert.strictEqual(mediumEntered.combat?.target?.combatRole, 'secondary');
  assert.strictEqual(mediumOutsideAtBoundary.combat?.target?.combatRole, 'secondary');
  assert.strictEqual(mediumReleased.combat?.target, null);
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

function assertInvulnerableProfitEscortArbitration() {
  const options = {
    userId: 7,
    controlMode: 'profit-live',
    combatEnabled: true,
    dynamicProfitThresholdEnabled: false,
    singleCoinBaitEnabled: false,
    finalActionArbitrationHoldMs: 0,
    opportunitySwitchConfirmFrames: 1,
    opportunitySwitchMargin: 0,
    opportunitySwitchRelativeMargin: 0,
    combatShootNoPressureDodgeReserveMs: 0,
    combatShootDodgeReserveMs: 0
  };
  const remoteBatch = batch(remoteCandidate({
    userId: 99,
    name: 'primary-profit',
    x: 50000,
    drop: 80,
    expectedReward: 80,
    adjustedScore: 300000
  }));
  const invulnerableSecondary = (overrides = {}) => escortCombatTarget({
    invulnerable: true,
    invulnerable_remaining_ms: 80000,
    firing: false,
    ...overrides
  });
  const adapter = createBrowserlessDecisionAdapter(options);

  const entered = decide(
    adapter,
    state(fullStaminaSelf(), [invulnerableSecondary({ firing: true })]),
    1000,
    remoteBatch,
    options
  );
  assert.strictEqual(entered.action?.kind, 'combat-live');
  assert.strictEqual(entered.combat?.target?.combatRole, 'secondary');
  assert.strictEqual(entered.combat?.target?.primaryTargetId, '99');
  assert.strictEqual(entered.combat?.shooting?.wouldShoot, false);
  assert.strictEqual(
    entered.combat?.invulnerableAvoidanceArbitration?.reason,
    'invulnerable-avoidance-yielded-to-secondary'
  );

  const realtimeAdapter = createBrowserlessDecisionAdapter(options);
  realtimeAdapter.decide(
    state(fullStaminaSelf(), [invulnerableSecondary({ firing: true })]),
    {
      ...options,
      nowMs: 1000,
      remoteProfitBatch: remoteBatch
    }
  );
  const realtimeHeld = realtimeAdapter.evaluateRealtime(
    state(fullStaminaSelf(), [invulnerableSecondary()]),
    {
      ...options,
      nowMs: 1100
    }
  );
  assert.strictEqual(realtimeHeld.action?.kind, 'combat-live');
  assert.strictEqual(
    realtimeHeld.combat?.invulnerableAvoidanceArbitration?.reason,
    'invulnerable-avoidance-yielded-to-secondary'
  );

  const retainedAt5000 = decide(
    adapter,
    state(fullStaminaSelf(), [invulnerableSecondary()]),
    6000,
    remoteBatch,
    options
  );
  assert.strictEqual(retainedAt5000.combat?.secondaryRetention?.retained, true);
  assert.strictEqual(retainedAt5000.action?.kind, 'combat-live');
  assert.strictEqual(retainedAt5000.combat?.movement?.reason, 'secondary-follow-primary-target');
  assert.strictEqual(
    retainedAt5000.combat?.invulnerableAvoidanceArbitration?.reason,
    'invulnerable-avoidance-yielded-to-secondary'
  );

  const releasedAt5001 = decide(
    adapter,
    state(fullStaminaSelf(), [invulnerableSecondary()]),
    6001,
    remoteBatch,
    options
  );
  assert.strictEqual(releasedAt5001.combat?.target, null);
  assert.strictEqual(releasedAt5001.action?.kind, 'seek-remote-player');
  assert.strictEqual(releasedAt5001.profit?.mission?.targetId, '99');
  assert.strictEqual(
    releasedAt5001.combat?.invulnerableAvoidanceArbitration?.reason,
    'invulnerable-avoidance-yielded-to-primary-mission'
  );

  const noMissionAdapter = createBrowserlessDecisionAdapter(options);
  const noMission = decide(
    noMissionAdapter,
    state(fullStaminaSelf(), [invulnerableSecondary()]),
    1000,
    null,
    options
  );
  assert.strictEqual(noMission.action?.reason, 'avoid-invulnerable-target');
  assert.strictEqual(noMission.combat?.invulnerableAvoidanceArbitration, null);

  const collisionAdapter = createBrowserlessDecisionAdapter(options);
  const collisionBullet = {
    bullet_id: 'invulnerable-secondary-collision',
    owner_user_id: 8,
    x: 8000,
    y: 0,
    target_x: 0,
    target_y: 0,
    speed_per_tick: 500,
    created_tick: 1,
    expire_tick: 30
  };
  const collision = decide(
    collisionAdapter,
    escortState(
      fullStaminaSelf(),
      [invulnerableSecondary()],
      1,
      { bullets: [collisionBullet] }
    ),
    1000,
    remoteBatch,
    options
  );
  assert.strictEqual(collision.action?.reason, 'incoming-bullet-dodge');
  assert.strictEqual(collision.combat?.target?.combatRole, 'secondary');

  const velocityCommands = [];
  const shootCommands = [];
  const actionAdapter = createBrowserlessActionAdapter({
    ...options,
    now: () => 1000,
    commandIntervalMs: 0,
    transport: {
      sendVelocity(dx, dy) {
        velocityCommands.push({ dx, dy });
        return { ok: true };
      },
      sendShoot(x, y) {
        shootCommands.push({ x, y });
        return { ok: true };
      }
    }
  });
  const applied = actionAdapter.applyDecision(
    escortState(fullStaminaSelf(), [invulnerableSecondary({ firing: true })], 1),
    entered,
    { source: 'realtime-control', observedTick: 1 }
  );
  assert.strictEqual(applied.kind, 'combat-live');
  assert.strictEqual(applied.reason, 'combat-live-realtime');
  assert.strictEqual(applied.movement?.reason, entered.combat?.movement?.reason);
  assert.deepStrictEqual(
    velocityCommands.at(-1),
    { dx: entered.combat?.movement?.dx, dy: entered.combat?.movement?.dy }
  );
  assert.strictEqual(applied.movement?.command?.ownership?.source, 'realtime-control');
  assert.strictEqual(applied.movement?.command?.ownership?.band, 'combat');
  assert.strictEqual(shootCommands.length, 0);
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
  assert.strictEqual(maintained.combat?.target?.combatRole, 'secondary');
  assert.strictEqual(maintained.combat?.profitEscortContinuity?.maintained, true);
  assert.strictEqual(
    maintained.combat?.profitEscortContinuity?.active?.engagementGeneration,
    enteredContinuity.engagementGeneration
  );
  assert.strictEqual(maintained.combat?.movement?.profitEscort?.latched, true);
  assert.strictEqual(maintained.combat?.movement?.profitEscort?.maintained, true);
  assert.strictEqual(maintained.combat?.movement?.profitEscort?.evidence?.targetFiring, false);
  assert.strictEqual(maintained.combat?.movement?.profitEscort?.evidence?.realTargetBulletPressure, false);
  assert.strictEqual(maintained.combat?.movement?.reason, 'secondary-follow-primary-target');
  assert.strictEqual(maintained.combat?.movement?.dx, 1);
  assert.strictEqual(
    maintained.combat?.movement?.profitEscort?.overrideReason,
    'secondary-follow-primary-target'
  );
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

function assertPostKillSettlementContinuity() {
  const self = fullStaminaSelf({ x: 0, y: 0, hp: 80 });
  const secondary = {
    type: 'enemy',
    userId: 8,
    entity_id: 2008,
    name: 'settlement-secondary',
    x: 1000,
    y: 0,
    hp: 100,
    max_hp: 100,
    active: true,
    authority: 'realtime'
  };
  const combat = {
    target: secondary,
    dryRun: {
      target: secondary,
      movement: { dx: 1, dy: 0, reason: 'secondary-follow-primary-target' },
      shooting: {
        wouldShoot: true,
        commandSuppressed: false,
        target: secondary,
        targetRole: 'secondary',
        cadenceMs: 160,
        executionCadenceMs: 160,
        aim: { x: 1000, y: 0 }
      }
    }
  };
  const settlement = {
    active: true,
    phase: 'drop-pending',
    targetId: '42',
    targetName: 'primary',
    targetDrop: 551,
    x: -5000,
    y: 0,
    startedAt: 1000,
    updatedAt: 1100,
    matchedCoinKey: ''
  };
  const options = { playerDropPickupRadiusCm: 150 };
  const at151 = buildPostKillSettlementWaitDecision(
    { self, nowMs: 1200 },
    { postKillSettlement: settlement },
    combat,
    options
  );
  assert.strictEqual(at151.kind, 'combat-live');
  assert.strictEqual(at151.reason, 'post-kill-settlement-defensive-escort');
  assert.strictEqual(at151.defensiveSettlementComposite, true);
  assert.strictEqual(at151.target.userId, 8);
  assert.strictEqual(at151.postKillSettlementMovement.arrived, false);
  assert.ok(Number(at151.postKillSettlementMovement.dx) < 0);

  for (const distance of [149, 150]) {
    const arrived = buildPostKillSettlementWaitDecision(
      { self: { ...self, x: -5000 + distance, y: 0 }, nowMs: 1201 },
      { postKillSettlement: settlement },
      combat,
      options
    );
    assert.strictEqual(arrived.kind, 'combat-live');
    assert.strictEqual(arrived.postKillSettlementMovement.arrived, true);
    assert.strictEqual(arrived.postKillSettlementMovement.dx, 0);
    assert.strictEqual(arrived.postKillSettlementMovement.dy, 0);
    assert.strictEqual(arrived.postKillSettlementMovement.reason, 'post-kill-settlement-arrived');
  }

  const fallback = buildPostKillSettlementWaitDecision(
    { self, nowMs: 1202 },
    {
      postKillSettlement: {
        ...settlement,
        phase: 'drop-visible',
        matchedCoinKey: 'id:coin-42'
      }
    },
    combat,
    options
  );
  assert.strictEqual(fallback.kind, 'combat-live');
  assert.strictEqual(fallback.reason, 'post-kill-settlement-defensive-escort');

  const visible = buildPostKillSettlementWaitDecision(
    { self, nowMs: 1203, realtimeObservedCoins: [{ key: 'id:coin-42', amount: 551, x: -5000, y: 0 }] },
    {
      postKillSettlement: {
        ...settlement,
        phase: 'drop-visible',
        matchedCoinKey: 'id:coin-42'
      }
    },
    combat,
    options
  );
  assert.strictEqual(visible, null, 'the dedicated realtime loot controller owns a visible matched coin');

  const completed = buildPostKillSettlementWaitDecision(
    { self, nowMs: 1204 },
    { postKillSettlement: { ...settlement, active: false, phase: 'settled' } },
    combat,
    options
  );
  assert.strictEqual(completed, null, 'completed settlements release the movement/fire composite');

  const appliedCombat = {
    dryRun: {
      movement: { dx: 1, dy: 0, reason: 'secondary-follow-primary-target' },
      shooting: combat.dryRun.shooting
    }
  };
  applyPostKillSettlementMovementToCombat(appliedCombat, at151);
  assert.ok(Number(appliedCombat.dryRun.movement.dx) < 0);
  assert.strictEqual(appliedCombat.dryRun.shooting.wouldShoot, true);
  assert.strictEqual(appliedCombat.dryRun.shooting.targetRole, 'secondary');

  const velocities = [];
  const shots = [];
  const actionAdapter = createBrowserlessActionAdapter({
    userId: 7,
    commandIntervalMs: 0,
    combatShootMinIntervalMs: 1,
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
  const execution = actionAdapter.applyDecision(
    { realtime: { tick: 1, self, entities: [self, secondary] } },
    {
      action: {
        kind: 'combat-live',
        band: 'combat',
        reason: at151.reason,
        target: secondary,
        defensiveSettlementComposite: true,
        postKillSettlementMovement: at151.postKillSettlementMovement
      },
      combat: {
        target: secondary,
        movement: { dx: at151.postKillSettlementMovement.dx, dy: at151.postKillSettlementMovement.dy, reason: 'post-kill-settlement-approach' },
        shooting: combat.dryRun.shooting
      }
    }
  );
  assert.strictEqual(execution.kind, 'combat-live');
  assert.ok(Number(velocities.at(-1)?.dx) < 0);
  assert.strictEqual(shots.length, 1, 'authorized secondary fire survives settlement movement');
}

function runRemoteProfitDecisionSelfTest() {
  const realtimeScoreOptions = {
    isAfkProfitTarget: () => true,
    staminaCostOverride: 107,
    coinOpportunityValue: 1,
    opportunityDistanceScoreScale: 1,
    opportunityDistanceFloor: 1
  };
  const ordinaryRealtimeTarget = { drop: 49, active: false };
  const qualityRealtimeTarget = { drop: 52, active: false };
  const ordinaryRealtimeScore = scoreEnemyOpportunity(ordinaryRealtimeTarget, {
    ...realtimeScoreOptions,
    staminaCostOverride: 100
  });
  const qualityRealtimeScore = scoreEnemyOpportunity(qualityRealtimeTarget, realtimeScoreOptions);
  const qualityRealtimeEconomics = effectiveProfitReward(qualityRealtimeTarget, realtimeScoreOptions);
  assert(qualityRealtimeScore > ordinaryRealtimeScore, 'Drop quality bonus can prioritize a scarcer high-Drop target');
  assert.strictEqual(qualityRealtimeEconomics.expectedReward, 52);
  assert.strictEqual(qualityRealtimeEconomics.staminaCost, 107);
  assert.strictEqual(qualityRealtimeEconomics.netROI, 52 / 107 * 10000);

  assertInvulnerableProfitEscortArbitration();
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
  const remoteBatch = batch(candidate, { tick: 1 });
  const first = decide(adapter, state(fullStaminaSelf()), 2000, remoteBatch);
  assert.strictEqual(first.action?.kind, 'seek-remote-player');
  assert.strictEqual(first.action?.reason, 'remote-snapshot-profit-target');
  assert.strictEqual(first.action?.target?.authority, 'snapshot-navigation');
  assert.strictEqual(first.action?.target?.remoteNavigationOnly, true);
  assert.strictEqual(first.action?.target?.arrivalToleranceCm, 1000);
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

  const movementOnlyAdapter = createBrowserlessDecisionAdapter({
    userId: 7,
    controlMode: 'profit-live',
    combatEnabled: true,
    finalActionArbitrationHoldMs: 0,
    opportunitySwitchConfirmFrames: 1,
    opportunitySwitchMargin: 0,
    opportunitySwitchRelativeMargin: 0
  });
  const movementOnlyTarget = {
    ...defensiveCrossingTarget,
    x: 8000,
    firing: false
  };
  const movementOnlyFirst = decide(
    movementOnlyAdapter,
    state(fullStaminaSelf(), [movementOnlyTarget]),
    2000,
    remoteBatch,
    {
      controlMode: 'profit-live',
      combatEnabled: true,
      dynamicWhitelistMemberUserIds: [8],
      dynamicWhitelistEnabledUserIds: [8]
    }
  );
  assert.strictEqual(movementOnlyFirst.action?.kind, 'seek-remote-player');
  assert.strictEqual(movementOnlyFirst.combat?.target, null);
  const movementOnlySecond = decide(
    movementOnlyAdapter,
    state(fullStaminaSelf(), [{ ...movementOnlyTarget, x: 7000 }]),
    2050,
    remoteBatch,
    {
      controlMode: 'profit-live',
      combatEnabled: true,
      dynamicWhitelistMemberUserIds: [8],
      dynamicWhitelistEnabledUserIds: [8]
    }
  );
  assert.strictEqual(movementOnlySecond.action?.kind, 'seek-remote-player');
  assert.strictEqual(movementOnlySecond.combat?.target, null);
  assert.strictEqual(movementOnlySecond.combat?.contactEntryGuard?.active, false);
  assert.strictEqual(
    movementOnlySecond.combat?.contactEntryGuard?.assessment?.blockedReason,
    'dynamic-whitelist-movement-authority-disabled'
  );
  assert.strictEqual(movementOnlySecond.profit?.mission?.targetId, '99');

  const boundedDefenseAdapter = createBrowserlessDecisionAdapter({
    userId: 7,
    controlMode: 'profit-live',
    combatEnabled: true,
    finalActionArbitrationHoldMs: 0,
    opportunitySwitchConfirmFrames: 1,
    opportunitySwitchMargin: 0,
    opportunitySwitchRelativeMargin: 0
  });
  const boundedDefenseOptions = {
    controlMode: 'profit-live',
    combatEnabled: true,
    dynamicWhitelistMemberUserIds: [8],
    dynamicWhitelistEnabledUserIds: [8]
  };
  const boundedDefenseEntered = decide(
    boundedDefenseAdapter,
    state(fullStaminaSelf(), [{ ...defensiveCrossingTarget, x: 8000, vx: 0, firing: true }]),
    3000,
    remoteBatch,
    boundedDefenseOptions
  );
  const boundedDefenseRetained = decide(
    boundedDefenseAdapter,
    state(fullStaminaSelf(), [{ ...defensiveCrossingTarget, x: 8000, vx: 0, firing: false }]),
    3050,
    remoteBatch,
    boundedDefenseOptions
  );
  const boundedDefenseReleased = decide(
    boundedDefenseAdapter,
    state(fullStaminaSelf(), [{ ...defensiveCrossingTarget, x: 8000, vx: 0, firing: false }]),
    8101,
    remoteBatch,
    boundedDefenseOptions
  );
  assert.strictEqual(boundedDefenseEntered.action?.kind, 'combat-live');
  assert.strictEqual(boundedDefenseEntered.combat?.target?.combatRole, 'secondary');
  assert.strictEqual(boundedDefenseRetained.action?.kind, 'combat-live');
  assert.strictEqual(boundedDefenseRetained.combat?.secondaryRetention?.retained, true);
  assert.strictEqual(boundedDefenseRetained.combat?.profitEscortContinuity?.maintained, true);
  assert.strictEqual(boundedDefenseReleased.action?.kind, 'seek-remote-player');
  assert.strictEqual(boundedDefenseReleased.combat?.target, null);
  assert.strictEqual(
    boundedDefenseReleased.combat?.secondaryTargetRelease?.reason,
    'secondary-defensive-evidence-cleared'
  );
  assert.strictEqual(boundedDefenseReleased.profit?.mission?.targetId, '99');
  assert.strictEqual(boundedDefenseReleased.profit?.profitEscortContinuity, null);

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
    approachDistanceCm: 10000,
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
  const remoteApproachAdapter = createBrowserlessActionAdapter({
    userId: 7,
    commandIntervalMs: 0,
    shootRepeatEnabled: false,
    transport: {
      sendVelocity() { return { ok: true }; },
      sendShoot() { return { ok: true }; }
    }
  });
  const remoteActiveClose = remoteApproachAdapter.applyDecision(
    state(fullStaminaSelf({ x: 80000 })),
    invulnerableRemoteFirst
  );
  assert.strictEqual(remoteActiveClose.kind, 'velocity');
  assert.strictEqual(remoteActiveClose.reason, 'profit-active-invulnerable-separate');
  const invulnerableAfkBatch = batch(remoteCandidate({
    invulnerable: true,
    invulnerableRemainingMs: 75000,
    approachDistanceCm: 0,
    approachEtaMs: 90000
  }));
  const invulnerableAfkNear = decide(
    invulnerableRemoteAdapter,
    state(fullStaminaSelf({ x: 89999 })),
    2000,
    invulnerableAfkBatch,
    { finalActionArbitrationHoldMs: 1800 }
  );
  assert.strictEqual(invulnerableAfkNear.action?.kind, 'seek-remote-player');
  assert.strictEqual(invulnerableAfkNear.action?.target?.arrivalToleranceCm, 150);
  const invulnerableRemoteTooClose = decide(
    invulnerableRemoteAdapter,
    state(fullStaminaSelf({ x: 10000 }), [], [{ drop_id: 'fallback', amount: 1, x: 10100, y: 0 }]),
    2100,
    invulnerableActiveBatch,
    { finalActionArbitrationHoldMs: 1800 }
  );
  assert.strictEqual(invulnerableRemoteTooClose.profit.remoteProfit.filtered['invulnerable-not-ready-on-current-approach'], undefined);
  assert.strictEqual(invulnerableRemoteTooClose.action?.kind, 'seek-remote-player');

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
  const activeApproachAdapter = createBrowserlessActionAdapter({
    userId: 7,
    commandIntervalMs: 0,
    shootRepeatEnabled: false,
    transport: {
      sendVelocity() { return { ok: true }; },
      sendShoot() { return { ok: true }; }
    }
  });
  const activeApproachAction = activeApproachAdapter.applyDecision(
    state(fullStaminaSelf({ x: 0 }), [activeInvulnerable(20000, 72000)]),
    realtimeInvulnerableReady
  );
  assert.strictEqual(activeApproachAction.reason, 'profit-active-invulnerable-approach');
  const activeCloseAction = activeApproachAdapter.applyDecision(
    state(fullStaminaSelf({ x: 0 }), [activeInvulnerable(10000, 72000)]),
    realtimeInvulnerableReady
  );
  assert.strictEqual(activeCloseAction.reason, 'profit-active-invulnerable-separate');
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
  assert.strictEqual(realtimeInvulnerableTooClose.profit.easyKill.stopLoss, null);
  assert.strictEqual(realtimeInvulnerableTooClose.action?.kind, 'seek-enemy');

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
  assertDynamicThresholdLinkedCoinRoute();
  assertRealtimeSupersededMissionContinuity();
  assertPassiveRealtimeDamageDoesNotDiscardRemoteMission();
  assertLowerValuePassiveEnemyDoesNotTakeRemotePrimaryMission();
  assertActivePlayerPickupRadiusCoinCompetition();
  assertSelfKillReleasesSupersededMission();
  assertRemoteMissionDoesNotOverrideRealtimeProfit();
  assertProfitMissionContinuityRegressions();
  assertTickWatermarkedCompletionRegressions();
  assertDualTargetRuntimeRules();
  assertHpSegmentedSecondaryEngagementRules();
  assertPostKillSettlementContinuity();

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
    start_x: 14000,
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

  const selfKillCompositeOptions = {
    userId: 7,
    controlMode: 'profit-live',
    combatEnabled: true,
    finalActionArbitrationHoldMs: 0,
    opportunitySwitchConfirmFrames: 1,
    opportunitySwitchMargin: 0,
    opportunitySwitchRelativeMargin: 0,
    combatShootNoPressureDodgeReserveMs: 0,
    combatShootDodgeReserveMs: 0
  };
  const selfKillCompositeAdapter = createBrowserlessDecisionAdapter(selfKillCompositeOptions);
  selfKillCompositeAdapter.patchState({
    postKillSettlements: {
      '42': {
        active: true,
        phase: 'drop-visible',
        targetId: '42',
        primaryTargetDropPriority: false,
        killAttribution: 'self',
        startedAt: 4000,
        updatedAt: 4000
      }
    }
  });
  const selfKillCompositeSecondary = {
    entity_id: 2008,
    user_id: 8,
    name: 'self-kill-defense-secondary',
    x: 1000,
    y: 0,
    vx: 0,
    vy: 0,
    hp: 100,
    max_hp: 100,
    current_join_mode: 'Active',
    active: true,
    firing: true,
    stamina_5s_remaining_milli: 1000000,
    stamina_5s_limit_milli: 1000000,
    drop: 1
  };
  const selfKillCompositeFrame = state(
    fullStaminaSelf({ hp: 80 }),
    [selfKillCompositeSecondary],
    [{ drop_id: 'self-kill-composite-drop', source_user_id: 42, amount: 29, x: -5000, y: 0 }],
    true
  );
  selfKillCompositeFrame.realtime.tick = 40;
  selfKillCompositeFrame.realtime.receivedAtMs = 4000;
  selfKillCompositeFrame.realtime.bullets = [];
  selfKillCompositeFrame.realtime.coinDrops = [];
  selfKillCompositeFrame.realtime.coinDropsObserved = false;
  selfKillCompositeFrame.fallback.coinDrops = [{
    drop_id: 'self-kill-composite-drop',
    source_user_id: 42,
    amount: 29,
    x: -5000,
    y: 0
  }];
  selfKillCompositeFrame.fallback.coinDropsObserved = true;
  const selfKillComposite = selfKillCompositeAdapter.evaluateRealtime(
    selfKillCompositeFrame,
    { ...selfKillCompositeOptions, nowMs: 4000 }
  );
  assert.strictEqual(selfKillComposite.action?.kind, 'combat-live');
  assert.strictEqual(selfKillComposite.action?.reason, 'post-kill-loot-defensive-escort');
  assert.strictEqual(selfKillComposite.input?.loot?.compositeDefense, true);
  assert.strictEqual(selfKillComposite.combat?.realtimeLoot?.navigationActive, true);
  assert.strictEqual(selfKillComposite.combat?.realtimeLoot?.navigationAuthority, 'snapshot-navigation');
  assert.strictEqual(selfKillComposite.combat?.shooting?.defensiveSecondaryTarget, true);
  assert.strictEqual(selfKillComposite.combat?.shooting?.target?.userId, 8);
  assert.ok(Number(selfKillComposite.combat?.movement?.dx || 0) < 0,
    'composite loot movement keeps positive progress toward the self-kill drop');
  const compositeVelocities = [];
  const compositeShots = [];
  const compositeActionAdapter = createBrowserlessActionAdapter({
    userId: 7,
    commandIntervalMs: 0,
    combatShootMinIntervalMs: 1,
    shootRepeatEnabled: false,
    transport: {
      sendVelocity(dx, dy) {
        compositeVelocities.push({ dx, dy });
        return { ok: true };
      },
      sendShoot(x, y) {
        compositeShots.push({ x, y });
        return { ok: true };
      }
    }
  });
  const compositeApplied = compositeActionAdapter.applyDecision(
    selfKillCompositeFrame,
    selfKillComposite
  );
  assert.strictEqual(compositeApplied.kind, 'combat-live');
  assert.ok(Number(compositeVelocities.at(-1)?.dx || 0) < 0,
    'execution preserves movement toward the drop');
  assert.strictEqual(compositeShots.length, selfKillComposite.combat?.shooting?.wouldShoot ? 1 : 0,
    'execution preserves the defensive secondary fire decision');

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

  const staleSnapshotAdapter = defaultAdapter();
  const staleSnapshotFirst = decide(staleSnapshotAdapter, state(fullStaminaSelf()), 2000, remoteBatch);
  assert.strictEqual(staleSnapshotFirst.action?.kind, 'seek-remote-player');
  const sourceDrop = {
    drop_id: 'mango-drop',
    source_user_id: 99,
    amount: 50,
    x: 90000,
    y: 0
  };
  decide(
    staleSnapshotAdapter,
    state(fullStaminaSelf(), [], [sourceDrop], true),
    2100,
    remoteBatch
  );
  const staleSnapshotReplay = decide(
    staleSnapshotAdapter,
    state(fullStaminaSelf()),
    2200,
    remoteBatch
  );
  assert.strictEqual(staleSnapshotReplay.profit?.remoteProfit?.filtered?.['target-drop-observed'], 1);
  assert.notStrictEqual(staleSnapshotReplay.action?.kind, 'seek-remote-player');
  assert.strictEqual(staleSnapshotAdapter.getState().profitMission, null);

  const lowDropSettlementAdapter = defaultAdapter();
  const lowDropFirst = decide(lowDropSettlementAdapter, state(fullStaminaSelf()), 2000, remoteBatch);
  assert.strictEqual(lowDropFirst.action?.kind, 'seek-remote-player');
  lowDropSettlementAdapter.patchState({
    postAttackSettlement: {
      phase: 'drop-observed',
      targetId: '37351',
      targetName: 'temporary-target',
      targetDrop: 5,
      x: 100,
      y: 0,
      matchedCoinKey: 'id:1097',
      matchedCoinAmount: 5,
      matchedCoinEvidence: 'realtime'
    }
  });
  const lowDropDecision = decide(
    lowDropSettlementAdapter,
    state(fullStaminaSelf(), [], [{
      drop_id: 1097,
      amount: 5,
      source_user_id: 37351,
      x: 100,
      y: 0
    }], true),
    2100,
    remoteBatch
  );
  assert.strictEqual(lowDropDecision.action?.kind, 'seek-remote-player');
  assert.strictEqual(lowDropDecision.profit?.postKillCoinSuppression?.removedCount, 1);
  assert.strictEqual(lowDropDecision.stateful.profitMission?.targetId, '99');

  return { ok: true, cases: 88 };
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
