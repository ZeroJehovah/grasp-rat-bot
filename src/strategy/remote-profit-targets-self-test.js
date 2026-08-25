'use strict';

const assert = require('assert');
const {
  buildRemotePlayerNavigationOpportunitiesCore,
  evaluateRemoteProfitTargets,
  remoteProfitApproachDistanceCm,
  remoteProfitApproachEtaMs,
  remoteProfitDistanceFactor
} = require('./remote-profit-targets');
const { invulnerableProfitSelectionCostCore } = require('./invulnerable-profit-selection');
const {
  canonicalInvulnerabilityMsFrom,
  protocolInvulnerabilityMsFrom,
  rawInvulnerabilityMsToWallMs,
  rawInvulnerabilityMsFrom
} = require('./invulnerability-time');
const { invulnerableApproachWindowCore } = require('./invulnerable-approach-window');
const {
  profitTargetDistanceCorrectionCore,
  freshestProfitTargetPositionCore
} = require('./profit-target-distance-correction');
const { playerMissionHoldsAgainstHighValueCoinCore } = require('./opportunity-choice');

function scoring(target) {
  const distance = Number(target.distance || 0);
  const staminaCost = Math.max(1, distance / 10);
  const expectedReward = Number(target.drop || 0);
  return { expectedReward, staminaCost, baseScore: expectedReward / staminaCost };
}

function target(overrides = {}) {
  return {
    user_id: 10,
    entity_id: 100,
    x: 1000,
    y: 0,
    hp: 100,
    drop: 50,
    current_join_mode: 'Passive',
    stamina_1d_remaining_milli: 980,
    stamina_1d_limit_milli: 1000,
    ...overrides
  };
}

function evaluate(entities, overrides = {}) {
  return evaluateRemoteProfitTargets({
    generation: 7,
    tick: 12,
    source: 'gap-http',
    observedAtMs: 1000,
    self: { user_id: 1, x: 0, y: 0 },
    entities,
    easyKillPlayers: [],
    whitelistUserIds: [],
    config: { ...overrides },
    online: true
  }, { scoreTarget: (_entity, details) => scoring({ ...details, drop: _entity.drop, distance: details.distance }) });
}

function evaluateAt(self, entities, overrides = {}) {
  return evaluateRemoteProfitTargets({
    generation: 7,
    tick: 12,
    source: 'gap-http',
    observedAtMs: 1000,
    self: { user_id: 1, ...self },
    entities,
    easyKillPlayers: [],
    whitelistUserIds: [],
    config: { ...overrides },
    online: true
  }, { scoreTarget: (_entity, details) => scoring({ ...details, drop: _entity.drop, distance: details.distance }) });
}

// The wait station, its hysteresis band, the measured close-in ETA and the risk
// budget replace the old fixed boundary hold, so each branch is pinned here.
function assertInvulnerableApproachWindow() {
  const self = { x: 0, y: 0 };
  const stationary = { x: 11500, y: 0 };
  const held = invulnerableApproachWindowCore({
    self,
    target: stationary,
    invulnerable: true,
    targetActive: true,
    distanceCm: 11500,
    remainingMs: 60000
  });
  assert.strictEqual(held.active, true);
  assert.strictEqual(held.phase, 'wait');
  assert.strictEqual(held.waitDistanceCm, 11000);
  assert.strictEqual(held.holdFloorCm, 10000);
  assert.strictEqual(held.releaseDistanceCm, 12000);
  assert.strictEqual(held.engagementDistanceCm, 6500);
  assert.strictEqual(held.closingSpeedCmPerSec, 792);
  assert.strictEqual(held.closeEtaMs, 5682);
  assert.strictEqual(held.triggerRemainingMs, 7182);
  assert.strictEqual(held.hold, true);
  assert.strictEqual(held.separate, false);
  assert.strictEqual(held.approach, false);
  assert.strictEqual(held.reason, 'invulnerable-wait-station-hold');

  const inside = invulnerableApproachWindowCore({
    self, target: stationary, invulnerable: true, targetActive: true, distanceCm: 8000, remainingMs: 60000
  });
  assert.strictEqual(inside.separate, true);
  assert.strictEqual(inside.hold, false);

  const outside = invulnerableApproachWindowCore({
    self, target: stationary, invulnerable: true, targetActive: true, distanceCm: 20000, remainingMs: 60000
  });
  assert.strictEqual(outside.approach, true);
  assert.strictEqual(outside.hold, false);

  const closing = invulnerableApproachWindowCore({
    self, target: stationary, invulnerable: true, targetActive: true, distanceCm: 11000, remainingMs: 7000
  });
  assert.strictEqual(closing.phase, 'closing');
  assert.strictEqual(closing.separate, false);
  assert.strictEqual(closing.reason, 'invulnerable-close-eta-reached');

  const staminaHold = invulnerableApproachWindowCore({
    self,
    target: stationary,
    invulnerable: true,
    targetActive: true,
    distanceCm: 11000,
    remainingMs: 7000,
    stamina5sRemainingMilli: 2000
  });
  assert.strictEqual(staminaHold.phase, 'wait');
  assert.strictEqual(staminaHold.riskBudget.ok, false);
  assert(staminaHold.riskBudget.reasons.includes('stamina-5s-below-approach-reserve'));
  assert.strictEqual(staminaHold.reason, 'invulnerable-close-risk-budget-hold');

  const hpHold = invulnerableApproachWindowCore({
    self, target: stationary, invulnerable: true, targetActive: true, distanceCm: 11000, remainingMs: 7000, selfHp: 50
  });
  assert(hpHold.riskBudget.reasons.includes('self-hp-below-approach-floor'));

  const shotHold = invulnerableApproachWindowCore({
    self,
    target: stationary,
    invulnerable: true,
    targetActive: true,
    distanceCm: 11000,
    remainingMs: 7000,
    unavoidableCurrentShot: true
  });
  assert(shotHold.riskBudget.reasons.includes('unavoidable-current-shot'));
  assert.strictEqual(shotHold.phase, 'wait');

  const framesHold = invulnerableApproachWindowCore({
    self,
    target: stationary,
    invulnerable: true,
    targetActive: true,
    distanceCm: 11000,
    remainingMs: 7000,
    unavoidableShotFrames: 3
  });
  assert(framesHold.riskBudget.reasons.includes('recent-unavoidable-shots'));

  // A protocol "invulnerable, duration unknown" countdown must never release.
  const unknown = invulnerableApproachWindowCore({
    self, target: stationary, invulnerable: true, targetActive: true, distanceCm: 11000, remainingMs: -1
  });
  assert.strictEqual(unknown.remainingMs, null);
  assert.strictEqual(unknown.phase, 'wait');
  assert.strictEqual(unknown.reason, 'invulnerable-unknown-remaining-hold');

  assert.strictEqual(invulnerableApproachWindowCore({
    self, target: stationary, invulnerable: false, targetActive: true, distanceCm: 11000, remainingMs: 60000
  }).reason, 'not-invulnerable');
  assert.strictEqual(invulnerableApproachWindowCore({
    self, target: stationary, invulnerable: true, targetActive: false, distanceCm: 11000, remainingMs: 60000
  }).reason, 'target-not-active');
  assert.strictEqual(invulnerableApproachWindowCore({
    self, target: stationary, invulnerable: true, targetActive: true, remainingMs: 60000
  }).reason, 'unknown-distance');

  // A stale planner request outside the configured band is clamped, not obeyed.
  assert.strictEqual(invulnerableApproachWindowCore({
    self,
    target: stationary,
    invulnerable: true,
    targetActive: true,
    distanceCm: 11000,
    remainingMs: 60000,
    waitDistanceCm: 15000
  }).waitDistanceCm, 12000);
  assert.strictEqual(invulnerableApproachWindowCore({
    self,
    target: stationary,
    invulnerable: true,
    targetActive: true,
    distanceCm: 11000,
    remainingMs: 60000,
    waitDistanceCm: 3000
  }).waitDistanceCm, 10000);

  // `vx` is cm per 50ms server tick, so a fleeing target lowers the closing
  // speed and lengthens the close-in trigger.
  const fleeing = invulnerableApproachWindowCore({
    self,
    target: { x: 11000, y: 0, vx: 10, vy: 0 },
    invulnerable: true,
    targetActive: true,
    distanceCm: 11000,
    remainingMs: 60000
  });
  assert.strictEqual(fleeing.closingSpeedCmPerSec, 632);
  assert.strictEqual(fleeing.closeEtaMs, 7120);
  assert.strictEqual(fleeing.triggerRemainingMs, 8620);
}

// The snapshot worker prices the move leg from its own separation, which can be
// minutes stale by the time the planner arbitrates the candidate.
function assertProfitTargetDistanceCorrection() {
  const corrected = profitTargetDistanceCorrectionCore({
    snapshotDistanceCm: 44179,
    snapshotStaminaCost: 131230,
    snapshotBaseScore: 10,
    freshDistanceCm: 29436
  });
  assert.strictEqual(corrected.applied, true);
  assert.strictEqual(corrected.reason, 'fresh-distance-move-stamina-recomputed');
  assert.strictEqual(corrected.fixedStaminaCost, 87051);
  assert.strictEqual(corrected.staminaCost, 116487);
  assert.strictEqual(corrected.distanceCm, 29436);
  assert.strictEqual(corrected.staminaDeltaMilli, -14743);
  assert(Math.abs(corrected.baseScore - 10 * (131230 / 116487)) < 1e-9);
  assert(corrected.baseScore > 10, 'a closer target than the snapshot claimed scores higher');

  const unchanged = profitTargetDistanceCorrectionCore({
    snapshotDistanceCm: 30000,
    snapshotStaminaCost: 50000,
    snapshotBaseScore: 4,
    freshDistanceCm: 30000
  });
  assert.strictEqual(unchanged.applied, false);
  assert.strictEqual(unchanged.staminaCost, 50000);
  assert.strictEqual(unchanged.baseScore, 4);

  // A snapshot cost at or below its own move component was priced with another
  // model, so re-adding a move leg at this rate would invent a cost.
  const foreignModel = profitTargetDistanceCorrectionCore({
    snapshotDistanceCm: 90000,
    snapshotStaminaCost: 1000,
    snapshotBaseScore: 10,
    freshDistanceCm: 220500
  });
  assert.strictEqual(foreignModel.applied, false);
  assert.strictEqual(foreignModel.reason, 'snapshot-cost-excludes-move-component');
  assert.strictEqual(foreignModel.staminaCost, 1000);
  assert.strictEqual(foreignModel.baseScore, 10);

  assert.strictEqual(profitTargetDistanceCorrectionCore({
    snapshotDistanceCm: 44179, snapshotStaminaCost: 131230, snapshotBaseScore: 10
  }).reason, 'missing-fresh-distance');
  assert.strictEqual(profitTargetDistanceCorrectionCore({
    snapshotBaseScore: 10, freshDistanceCm: 29436
  }).reason, 'missing-snapshot-economics');
  assert.strictEqual(profitTargetDistanceCorrectionCore({
    snapshotDistanceCm: 44179, snapshotStaminaCost: 131230, snapshotBaseScore: 10, freshDistanceCm: 29436
  }, { opportunityMoveStaminaPerCm: 0 }).reason, 'no-move-stamina-component');

  const arrived = profitTargetDistanceCorrectionCore({
    snapshotDistanceCm: 40000,
    snapshotStaminaCost: 40001,
    snapshotBaseScore: 2,
    freshDistanceCm: 0
  });
  assert.strictEqual(arrived.staminaCost, 1);
}

function assertFreshestProfitTargetPosition() {
  const snapshotOnly = freshestProfitTargetPositionCore({
    snapshotX: 44000, snapshotY: 0, snapshotAgeMs: 120000
  });
  assert.strictEqual(snapshotOnly.source, 'snapshot');
  assert.strictEqual(snapshotOnly.position.x, 44000);

  const realtime = freshestProfitTargetPositionCore({
    snapshotX: 44000, snapshotY: 0, snapshotAgeMs: 120000,
    realtimeX: 29000, realtimeY: 1000, realtimeAgeMs: 500
  });
  assert.strictEqual(realtime.source, 'realtime');
  assert.strictEqual(realtime.position.x, 29000);
  assert.strictEqual(realtime.position.authority, 'realtime');

  assert.strictEqual(freshestProfitTargetPositionCore({
    snapshotX: 44000, snapshotY: 0, snapshotAgeMs: 120000,
    realtimeX: 29000, realtimeY: 0, realtimeAgeMs: 5000
  }).source, 'snapshot-realtime-stale');
  assert.strictEqual(freshestProfitTargetPositionCore({
    snapshotX: 44000, snapshotY: 0, snapshotAgeMs: 100,
    realtimeX: 29000, realtimeY: 0, realtimeAgeMs: 500
  }).source, 'snapshot-newer');
  assert.strictEqual(freshestProfitTargetPositionCore({
    snapshotX: 44000, snapshotY: 0, snapshotAgeMs: 120000,
    realtimeX: 29000, realtimeY: 0, realtimeAgeMs: 5000
  }, { profitTargetRealtimePositionMaxAgeMs: 8000 }).source, 'realtime');
  assert.strictEqual(freshestProfitTargetPositionCore({}).source, 'none');
  assert.strictEqual(freshestProfitTargetPositionCore({ realtimeX: 1, realtimeY: 2, realtimeAgeMs: 100 }).source, 'realtime');
}

// The high-value-visible-coin shortcut is arbitrated ahead of the ordinary
// profit choice, so the same hold rule has to apply there.
function assertPlayerMissionHoldsAgainstHighValueCoin() {
  const mission = { type: 'enemy', score: 100 };
  assert.strictEqual(playerMissionHoldsAgainstHighValueCoinCore(mission, { score: 90 }), true);
  assert.strictEqual(playerMissionHoldsAgainstHighValueCoinCore(mission, { score: 120 }), false);
  assert.strictEqual(playerMissionHoldsAgainstHighValueCoinCore(mission, { score: 120 }, {
    coinPreemptionRelativeMargin: 0.25
  }), true);
  assert.strictEqual(playerMissionHoldsAgainstHighValueCoinCore(mission, { score: 130 }, {
    coinPreemptionRelativeMargin: 0.25
  }), false);
  // Our own primary target's drop is never held against.
  assert.strictEqual(playerMissionHoldsAgainstHighValueCoinCore(mission, {
    score: 10, primaryTargetDropPriority: true
  }), false);
  assert.strictEqual(playerMissionHoldsAgainstHighValueCoinCore({ type: 'coin', score: 100 }, { score: 10 }), false);
  assert.strictEqual(playerMissionHoldsAgainstHighValueCoinCore({
    type: 'remote-player-navigation', score: 10
  }, { score: 5 }), true);
  assert.strictEqual(playerMissionHoldsAgainstHighValueCoinCore({ type: 'enemy' }, { score: 5 }), false);
  assert.strictEqual(playerMissionHoldsAgainstHighValueCoinCore(mission, null), false);
}

function runRemoteProfitTargetsSelfTest() {
  assert.strictEqual(remoteProfitDistanceFactor(50000), 1);
  assert.strictEqual(remoteProfitDistanceFactor(100000), 0.75);
  assert.strictEqual(remoteProfitDistanceFactor(150000), 0.5);
  assert.strictEqual(remoteProfitDistanceFactor(250000), 0.5);
  assert.strictEqual(remoteProfitApproachEtaMs(100000), 105105);
  assert.strictEqual(remoteProfitApproachDistanceCm('high-drop-afk'), 150);
  assert.strictEqual(remoteProfitApproachDistanceCm('high-drop-afk', {
    playerDropPickupRadiusCm: 220,
    invulnerableAfkApproachDistanceCm: 0
  }), 220);
  assert.strictEqual(remoteProfitApproachDistanceCm('easy-kill-active'), 11000);
  assert.strictEqual(remoteProfitApproachEtaMs(100000, {}, 'easy-kill-active'), 93684);
  assert.strictEqual(rawInvulnerabilityMsToWallMs(36600), 15250);
  assert.strictEqual(rawInvulnerabilityMsToWallMs(34200), 14250);
  assert.strictEqual(rawInvulnerabilityMsFrom({ invulnerable_remaining_ms: 36600 }), 15250);
  assert.strictEqual(protocolInvulnerabilityMsFrom({ invulnerableRemainingMs: 226080 }), 94200);
  assert.strictEqual(canonicalInvulnerabilityMsFrom({ invulnerableRemainingMs: 94200 }), 94200);

  assert.strictEqual(evaluate([target({ drop: 49 })]).candidates.length, 1, 'nearby drop 49 remains eligible');
  assert.strictEqual(evaluate([target({ drop: 20 })]).candidates.length, 1, 'nearby drop 20 is eligible');
  assert.strictEqual(evaluate([target({ drop: 19 })]).candidates.length, 0, 'nearby drop below 20 is rejected');
  assert.strictEqual(evaluateAt({ x: -100001, y: 0 }, [target({ x: 0, drop: 49 })]).candidates.length, 0, 'outside 1000m keeps the 50 minimum');
  assert.strictEqual(evaluate([target({ drop: 50 })]).candidates.length, 1);
  assert.strictEqual(evaluate([target({ hp: 99 })]).candidates.length, 0);
  assert.strictEqual(evaluate([target({ hp: 100, max_hp: 1 })]).candidates.length, 1);
  assert.strictEqual(evaluate([target({ hp: 100, max_hp: 'invalid' })]).candidates.length, 1);
  assert.strictEqual(evaluate([target({ hp: 100, max_hp: undefined })]).candidates.length, 1);
  assert.strictEqual(evaluate([target({ stamina_1d_remaining_milli: 979 })]).candidates.length, 0);
  assert.strictEqual(evaluate([target({ stamina_1d_remaining_milli: 980 })]).candidates.length, 1);
  assert.strictEqual(evaluate([target({ stamina_1d_remaining_milli: 981, stamina_1d_limit_milli: 1000 })]).candidates.length, 1);
  assert.strictEqual(evaluate([target({ stamina_1d_remaining_milli: 1000, stamina_1d_limit_milli: undefined })]).candidates.length, 0);
  const fullStaminaActive = evaluate([target({ user_id: 18, current_join_mode: 'Active' })]);
  assert.strictEqual(fullStaminaActive.candidates.length, 0, 'native Active players are not remote AFK targets');
  assert.strictEqual(fullStaminaActive.diagnostics.filtered['active-join-mode'], 1);
  const activeWithoutCanonicalFlag = evaluateRemoteProfitTargets({
    generation: 6,
    self: { user_id: 1, x: 0, y: 0 },
    entities: [target({ user_id: 19, current_join_mode: 'Active' })],
    easyKillPlayers: [],
    config: {},
    online: true
  }, {
    normalizeEntity: entity => ({
      ...entity,
      userId: entity.user_id,
      x: entity.x,
      y: entity.y,
      hp: entity.hp,
      drop: entity.drop,
      active: false,
      moving: false,
      firing: false,
      alive: true,
      recentActivity: false,
      stamina1dRemaining: entity.stamina_1d_remaining_milli,
      stamina1dLimit: entity.stamina_1d_limit_milli
    }),
    scoreTarget: (_entity, details) => scoring({ ...details, drop: _entity.drop, distance: details.distance })
  });
  assert.strictEqual(activeWithoutCanonicalFlag.candidates.length, 0, 'raw Active mode survives custom normalization');

  const easyListed = evaluateRemoteProfitTargets({
    generation: 8,
    self: { user_id: 1, x: 0, y: 0 },
    entities: [target({ user_id: 20, hp: 1, drop: 50, current_join_mode: 'Active' })],
    easyKillPlayers: [{ userId: 20, score: 1 }],
    config: {},
    online: true
  }, { scoreTarget: (_entity, details) => scoring({ ...details, drop: _entity.drop, distance: details.distance }) });
  assert.strictEqual(easyListed.candidates.length, 1);
  assert.strictEqual(easyListed.candidates[0].classification, 'easy-kill-active');
  const easyListedAfk = evaluateRemoteProfitTargets({
    generation: 8,
    self: { user_id: 1, x: 0, y: 0 },
    entities: [target({
      user_id: 25,
      hp: 17,
      drop: 50,
      current_join_mode: 'Passive',
      stamina_1d_remaining_milli: 100
    })],
    easyKillPlayers: [{ userId: 25, score: 2 }],
    config: {},
    online: true
  }, { scoreTarget: (_entity, details) => scoring({ ...details, drop: _entity.drop, distance: details.distance }) });
  assert.strictEqual(easyListedAfk.candidates.length, 1);
  assert.strictEqual(easyListedAfk.candidates[0].classification, 'easy-kill-afk');
  assert.strictEqual(easyListedAfk.candidates[0].active, false);
  assert.strictEqual(easyListedAfk.diagnostics.easyKillAfkCount, 1);
  let observedScoringActive = null;
  const activeEconomics = evaluateRemoteProfitTargets({
    generation: 9,
    self: { user_id: 1, x: 0, y: 0 },
    entities: [target({ user_id: 22, hp: 1, current_join_mode: 'Active', stamina_1d_remaining_milli: 100 })],
    easyKillPlayers: [{ userId: 22, score: 2 }],
    config: {},
    online: true
  }, {
    normalizeEntity: entity => ({
      ...entity,
      userId: entity.user_id,
      active: false,
      joinModeActive: true,
      moving: false,
      firing: false,
      alive: true,
      x: entity.x,
      y: entity.y,
      hp: entity.hp,
      drop: entity.drop,
      stamina1dRemaining: entity.stamina_1d_remaining_milli,
      stamina1dLimit: entity.stamina_1d_limit_milli,
      invulnerable: false,
      invulnerableRemainingMs: null
    }),
    scoreTarget: (scoredTarget, details) => {
      observedScoringActive = scoredTarget.active;
      return scoring({ ...details, drop: scoredTarget.drop, distance: details.distance });
    }
  });
  assert.strictEqual(activeEconomics.candidates.length, 1);
  assert.strictEqual(observedScoringActive, true, 'easy-kill candidates use active economics');
  assert.strictEqual(evaluate([target({ drop: Infinity })]).candidates.length, 0);
  assert.strictEqual(evaluate([target({ x: NaN })]).candidates.length, 0);
  assert.strictEqual(evaluateRemoteProfitTargets({
    self: { user_id: 1, x: 0, y: 0 },
    entities: [target({ user_id: 19, hp: 1, x: 50000, current_join_mode: 'Active' })],
    easyKillPlayers: [{ userId: 19, score: 1 }],
    config: {},
    online: true
  }, { scoreTarget: (_entity, details) => scoring({ ...details, drop: _entity.drop, distance: details.distance }) }).candidates.length, 1);
  assert.strictEqual(evaluateRemoteProfitTargets({
    self: { user_id: 1, x: 0, y: 0 },
    entities: [target({ user_id: 20, hp: 1, x: 50001, current_join_mode: 'Active' })],
    easyKillPlayers: [{ userId: 20, score: 1 }],
    config: {},
    online: true
  }, { scoreTarget: (_entity, details) => scoring({ ...details, drop: _entity.drop, distance: details.distance }) }).candidates.length, 0);

  const scoreTwo = evaluateRemoteProfitTargets({
    self: { user_id: 1, x: -100000, y: 0 },
    entities: [target({ user_id: 21, hp: 1, x: 100000, current_join_mode: 'Active' })],
    easyKillPlayers: [{ userId: 21, score: 2 }],
    config: {},
    online: true
  }, { scoreTarget: (_entity, details) => scoring({ ...details, drop: _entity.drop, distance: details.distance }) });
  assert.strictEqual(scoreTwo.candidates.length, 1, 'score 2 has no self-distance cap');
  const scoreThree = evaluateRemoteProfitTargets({
    self: { user_id: 1, x: -100000, y: 0 },
    entities: [target({ user_id: 23, hp: 1, x: 100000, current_join_mode: 'Active' })],
    easyKillPlayers: [{ userId: 23, score: 3 }],
    config: {},
    online: true
  }, { scoreTarget: (_entity, details) => scoring({ ...details, drop: _entity.drop, distance: details.distance }) });
  assert.strictEqual(scoreThree.candidates.length, 1, 'score 3 has no self-distance cap');
  assert.strictEqual(evaluate([target({ x: 100000 })]).candidates.length, 1);
  assert.strictEqual(evaluate([target({ x: 100001 })]).candidates.length, 0);

  const invulnerableReady = evaluate([target({ x: 100000, invulnerable: true, invulnerableRemainingMs: 80000 })]);
  assert.strictEqual(invulnerableReady.candidates.length, 1);
  assert.strictEqual(invulnerableReady.candidates[0].approachDistanceCm, 150);
  const invulnerableLate = evaluate([target({ x: 100000, invulnerable: true, invulnerableRemainingMs: 115000 })]);
  assert.strictEqual(invulnerableLate.candidates.length, 1);
  const invulnerableActiveReady = evaluateRemoteProfitTargets({
    self: { user_id: 1, x: 0, y: 0 },
    entities: [target({ user_id: 24, x: 100000, current_join_mode: 'Active', invulnerable: true, invulnerableRemainingMs: 85000 })],
    easyKillPlayers: [{ userId: 24, score: 3 }],
    config: {},
    online: true
  }, { scoreTarget: (_entity, details) => scoring({ ...details, drop: _entity.drop, distance: details.distance }) });
  assert.strictEqual(invulnerableActiveReady.candidates.length, 1);
  assert.strictEqual(invulnerableActiveReady.candidates[0].approachDistanceCm, 11000);
  const invulnerableActiveLate = evaluateRemoteProfitTargets({
    self: { user_id: 1, x: 0, y: 0 },
    entities: [target({ user_id: 24, x: 100000, current_join_mode: 'Active', invulnerable: true, invulnerableRemainingMs: 89475 })],
    easyKillPlayers: [{ userId: 24, score: 3 }],
    config: {},
    online: true
  }, { scoreTarget: (_entity, details) => scoring({ ...details, drop: _entity.drop, distance: details.distance }) });
  assert.strictEqual(invulnerableActiveLate.candidates.length, 1);
  const rawInvulnerableReady = evaluate([target({ x: 15000, invulnerable: true, invulnerable_remaining_ms: 24000 })]);
  assert.strictEqual(rawInvulnerableReady.candidates.length, 1, 'raw protocol countdown converts to wall milliseconds');
  const rawInvulnerableLate = evaluate([target({ x: 15000, invulnerable: true, invulnerable_remaining_ms: 60000 })]);
  assert.strictEqual(rawInvulnerableLate.candidates.length, 1, 'converted countdown is diagnostic only');
  const rawCamelFallbackReady = evaluate([target({
    x: 15000,
    invulnerable: true,
    invulnerableRemainingMs: 24000
  })], { rawProtocolFields: true });
  assert.strictEqual(rawCamelFallbackReady.candidates.length, 1, 'raw camel countdown converts in fallback normalizer');

  const mangoSelection = invulnerableProfitSelectionCostCore({
    staminaCost: 172342.3169,
    expectedReward: 1,
    invulnerable: true,
    invulnerableRemainingMs: 51440,
    approachEtaMs: 82813
  });
  const competingSelection = invulnerableProfitSelectionCostCore({
    staminaCost: 53418.3765,
    expectedReward: 1,
    invulnerable: true,
    invulnerableRemainingMs: 119000,
    approachEtaMs: 24481
  });
  assert.strictEqual(mangoSelection.selectionStaminaCost, 172342.3169);
  assert(Math.abs(competingSelection.selectionStaminaCost - 98314.9015) < 1e-9);
  assert(Math.abs(1816980 * mangoSelection.selectionScoreMultiplier - 1816980) < 1e-9);
  assert(Math.abs(1908107 * competingSelection.selectionScoreMultiplier - 1036749.839) < 1);

  const conflict = evaluateRemoteProfitTargets({
    self: { user_id: 1, x: 0, y: 0 },
    entities: [target({ user_id: 30, hp: 100, current_join_mode: 'Active', active: false, stamina_1d_remaining_milli: 1000 })],
    easyKillPlayers: [{ userId: 30, score: 3 }],
    config: {},
    online: true
  }, {
    normalizeEntity: entity => ({
      ...entity,
      userId: entity.user_id,
      x: entity.x,
      y: entity.y,
      hp: entity.hp,
      drop: entity.drop,
      active: false,
      joinModeActive: true,
      moving: false,
      firing: false,
      alive: true,
      recentActivity: false,
      invulnerable: false,
      invulnerableRemainingMs: null,
      stamina1dRemaining: entity.stamina_1d_remaining_milli,
      stamina1dLimit: entity.stamina_1d_limit_milli
    }),
    scoreTarget: (_entity, details) => scoring({ ...details, drop: _entity.drop, distance: details.distance })
  });
  assert.strictEqual(conflict.candidates.length, 1);
  assert.strictEqual(conflict.candidates[0].classification, 'easy-kill-active');
  assert.strictEqual(conflict.diagnostics.classificationConflictCount, 0, 'native Active mode keeps AFK and easy-kill classes exclusive');

  for (const economics of [
    { expectedReward: Infinity, staminaCost: 1, baseScore: 1 },
    { expectedReward: 50, staminaCost: Infinity, baseScore: 1 },
    { expectedReward: 50, staminaCost: 1, baseScore: NaN }
  ]) {
    const invalidEconomics = evaluateRemoteProfitTargets({
      self: { user_id: 1, x: 0, y: 0 },
      entities: [target({ user_id: 31 })],
      easyKillPlayers: [],
      config: {},
      online: true
    }, { scoreTarget: () => economics });
    assert.strictEqual(invalidEconomics.candidates.length, 0);
  }

  const stableTie = evaluate([
    target({ user_id: 10, x: 1000 }),
    target({ user_id: 2, x: 1000 })
  ]);
  assert.deepStrictEqual(stableTie.candidates.map(item => item.userId), [2, 10]);

  const batch = evaluate(Array.from({ length: 70 }, (_, index) => target({ user_id: 100 + index, x: 100 + index })));
  assert.strictEqual(batch.candidates.length, 64);
  const first = batch.candidates[0];
  const opportunities = buildRemotePlayerNavigationOpportunitiesCore([first], { generation: 7, snapshotAt: '1970-01-01T00:00:01.000Z' });
  assert.strictEqual(opportunities.length, 1);
  assert.strictEqual(opportunities[0].actionKind, 'seek-remote-player');
  assert.strictEqual(opportunities[0].authority, 'snapshot-navigation');
  assert.strictEqual(opportunities[0].selectionScore, opportunities[0].adjustedScore);
  const movedSelfOpportunities = buildRemotePlayerNavigationOpportunitiesCore([first], {
    generation: 7,
    snapshotAt: '1970-01-01T00:00:01.000Z'
  });
  assert.strictEqual(movedSelfOpportunities[0].distance, opportunities[0].distance);
  assert.strictEqual(movedSelfOpportunities[0].baseScore, opportunities[0].baseScore);
  assert.strictEqual(movedSelfOpportunities[0].distanceFactor, opportunities[0].distanceFactor);
  assert.strictEqual(movedSelfOpportunities[0].adjustedScore, opportunities[0].adjustedScore);
  assertInvulnerableApproachWindow();
  assertProfitTargetDistanceCorrection();
  assertFreshestProfitTargetPosition();
  assertPlayerMissionHoldsAgainstHighValueCoin();
  return { ok: true, cases: 93 };
}

if (require.main === module) {
  process.stdout.write(JSON.stringify(runRemoteProfitTargetsSelfTest()) + '\n');
}

module.exports = { runRemoteProfitTargetsSelfTest };
