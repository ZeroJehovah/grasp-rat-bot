'use strict';

const assert = require('assert');
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

function state(self, entities = [], coinDrops = []) {
  return {
    userId: 7,
    realtime: {
      tick: 1,
      frameAgeMs: 0,
      self,
      entities: [self, ...entities],
      bullets: [],
      coinDrops
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

  const missing = decide(
    adapter,
    state(fullStaminaSelf()),
    5001,
    supersededBatch,
    { controlMode: 'profit-live', combatEnabled: true }
  );
  assert.strictEqual(missing.action?.kind, 'seek-enemy');
  assert.strictEqual(missing.action?.target?.userId, 99);
  assert.strictEqual(missing.action?.target?.cachedNavigationOnly, true);
  assert.strictEqual(missing.profit?.mission?.highValue, true);

  const highValueDetour = decide(
    adapter,
    state(fullStaminaSelf(), [], [{ drop_id: 'high-detour', amount: 100, x: 100, y: 0 }]),
    5100,
    supersededBatch,
    { controlMode: 'profit-live', combatEnabled: true }
  );
  assert.strictEqual(highValueDetour.action?.target?.type, 'coin');
  assert.strictEqual(highValueDetour.profit?.mission?.targetId, '99');
  assert.strictEqual(highValueDetour.profit?.mission?.highValue, true);

  const resumed = decide(
    adapter,
    state(fullStaminaSelf(), [{ ...realtimeMango, x: 45000 }]),
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
  assert.strictEqual(resumed.profit?.mission?.highValue, true);
}

function runRemoteProfitDecisionSelfTest() {
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
  assert.strictEqual(incoming.action?.reason, 'incoming-bullet-dodge');
  assert.strictEqual(incoming.input?.loot?.blockedReason, 'incoming-bullet-without-target');

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

  return { ok: true, cases: 46 };
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
