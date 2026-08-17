'use strict';

const assert = require('assert');
const {
  buildRemotePlayerNavigationOpportunitiesCore,
  evaluateRemoteProfitTargets,
  remoteProfitApproachDistanceCm,
  remoteProfitApproachEtaMs,
  remoteProfitDistanceFactor
} = require('./remote-profit-targets');
const {
  canonicalInvulnerabilityMsFrom,
  protocolInvulnerabilityMsFrom,
  rawInvulnerabilityMsToWallMs,
  rawInvulnerabilityMsFrom
} = require('./invulnerability-time');

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
  assert.strictEqual(remoteProfitApproachDistanceCm('easy-kill-active'), 10000);
  assert.strictEqual(remoteProfitApproachEtaMs(100000, {}, 'easy-kill-active'), 94737);
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
  assert.strictEqual(invulnerableActiveReady.candidates[0].approachDistanceCm, 10000);
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
  return { ok: true, cases: 51 };
}

if (require.main === module) {
  process.stdout.write(JSON.stringify(runRemoteProfitTargetsSelfTest()) + '\n');
}

module.exports = { runRemoteProfitTargetsSelfTest };
