'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createEasyKillPlayerTracker, SEARCH_COOLDOWN_MS } = require('./easy-kill-player-tracker');
const { createBrowserlessDecisionAdapter } = require('./decision-adapter');
const { buildBrowserlessCombatDryRun } = require('./combat-adapter');

function runCombatSearchRegressionSelfTest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'combat-search-'));
  let now = Date.parse('2026-10-06T03:00:00Z');
  const file = path.join(dir, 'easy.json');
  let tracker = createEasyKillPlayerTracker({ file, now: () => now });
  const player = { userId: 92, name: 'moving-player' };
  const score = () => tracker.status().players.find(p => p.userId === 92)?.score;
  try {
    tracker.upsertManualPlayer(player, { atMs: now, score: 10 });
    tracker.recordImmediateFailure(player, 'easy-kill-approach-no-progress', { atMs: now });
    assert.strictEqual(score(), 9);
    const until = now + SEARCH_COOLDOWN_MS;
    tracker.recordImmediateFailure(player, 'easy-kill-approach-no-progress', { atMs: now + 1 });
    assert.strictEqual(score(), 9, 'duplicate queued effects do not double-decrement');
    tracker = createEasyKillPlayerTracker({ file, now: () => now });
    assert(tracker.status().blockedUserIds.includes(92), 'cooldown survives restart');
    now = until - 1;
    assert(tracker.status().blockedUserIds.includes(92));
    now += 1;
    assert(!tracker.status().blockedUserIds.includes(92), 'exact expiry releases search');
    const self = { entity_id: 1, user_id: 7, x: 0, y: 0, hp: 100, max_hp: 100,
      stamina_5s_remaining_milli: 10000, stamina_5s_limit_milli: 10000,
      stamina_1h_remaining_milli: 3000000, stamina_1h_limit_milli: 3000000,
      stamina_1d_remaining_milli: 20000000, stamina_1d_limit_milli: 20000000 };
    const candidate = { ...player, x: 60000, y: 0, hp: 100, drop: 600, active: true,
      classification: 'easy-kill-active', easyKillScore: 9, distance: 60000,
      expectedReward: 540, staminaCost: 100000, baseScore: 10000000,
      distanceFactor: 1, adjustedScore: 10000000 };
    const batch = { generation: 3, tick: 100, source: 'gap-http', observedAtMs: now,
      expiresAtMs: now + 210000, candidates: [candidate] };
    const options = { userId: 7, controlMode: 'profit-live', combatEnabled: true,
      easyKillPlayerTracker: tracker, dynamicProfitThresholdEnabled: false,
      singleCoinBaitEnabled: false, finalActionArbitrationHoldMs: 0,
      opportunitySwitchConfirmFrames: 1, opportunitySwitchMargin: 0, opportunitySwitchRelativeMargin: 0 };
    const adapter = createBrowserlessDecisionAdapter(options);
    const state = (entities = [], frameAgeMs = 0) => ({ userId: 7, realtime: {
      tick: 100 + Math.floor((now - batch.observedAtMs) / 50), frameAgeMs, self,
      entities: [self, ...entities], bullets: [], coinDrops: [], coinDropsObserved: true
    }, fallback: { tick: 100, frameAgeMs: 0, entities: [], coinDrops: [], messages: [] } });
    const decide = (remote = batch, entities = [], frameAgeMs = 0) => adapter.decide(state(entities, frameAgeMs), {
      ...options, nowMs: now, remoteProfitBatch: remote
    });
    const first = decide();
    assert.strictEqual(first.action.kind, 'seek-remote-player');
    for (let i = 0; i < 4; i += 1) { now += 1000; decide(); }
    assert.strictEqual(score(), 9, 'off-screen absence is not a failed search');
    candidate.x = 30000;
    candidate.distance = 30000;
    now += 1000; decide();
    now += 1000; decide(batch, [], 1001);
    assert.strictEqual(adapter.getState().remoteEasyKillSearch, null, 'stale native frames reset absence confirmation');
    for (let i = 0; i < 4; i += 1) { now += 1000; decide(); }
    assert.strictEqual(score(), 8, 'selected visible-area search failure deducts once');
    assert(tracker.status().blockedUserIds.includes(92));
    const refreshed = { ...batch, generation: 4, observedAtMs: now, expiresAtMs: now + 210000 };
    const blocked = decide(refreshed);
    assert.notStrictEqual(blocked.action.target?.userId, 92, 'new snapshot cannot bypass cooldown');
    assert.strictEqual(adapter.getRealtimePersistenceState().remoteEasyKillSearch, null);
    const native = { entity_id: 2, user_id: 92, name: player.name, x: 5000, y: 0,
      hp: 100, current_join_mode: 'Active', firing: true, drop: 600 };
    const defensive = decide(refreshed, [native]);
    assert.strictEqual(defensive.combat.target?.userId, 92, 'cooldown does not suppress defensive combat');
    assert.notStrictEqual(defensive.combat.target?.combatRole, 'primary');

    tracker.upsertManualPlayer({ userId: 93 }, { atMs: now, score: 1 });
    tracker.recordImmediateFailure({ userId: 93 }, 'search-failed', { atMs: now });
    tracker = createEasyKillPlayerTracker({ file, now: () => now });
    assert(tracker.status().blockedUserIds.includes(93), 'score-zero deletion retains cooldown');
    now += SEARCH_COOLDOWN_MS;
    const cleanAdapter = createBrowserlessDecisionAdapter({ ...options, easyKillPlayerTracker: tracker });
    const removed = cleanAdapter.decide(state(), { ...options, easyKillPlayerTracker: tracker, nowMs: now,
      remoteProfitBatch: { ...batch, observedAtMs: now, expiresAtMs: now + 210000,
        candidates: [{ ...candidate, userId: 93, easyKillScore: 1 }] } });
    assert.notStrictEqual(removed.action.target?.userId, 93, 'expired cooldown does not resurrect a deleted player from an old batch');
    assert(removed.profit.remoteProfit.filtered['easy-kill-no-longer-known'] > 0);
    tracker.observeCombatEngagement(player, { atMs: now, tick: 1000 });
    tracker.finishEngagement(92, 'frame-gap', { atMs: now, outcomeGraceMs: 0 });
    tracker.expirePendingOutcomes(now);
    assert(!tracker.status().blockedUserIds.includes(92), 'technical failure does not create a scoring cooldown');

    // Known historical damage must not make HP80/100 leave on initial contact
    // or after the old confirmation timeout. Only fresh losing exchange does.
    const combatState = {};
    const fight = (hp, targetHp, at) => buildBrowserlessCombatDryRun({ userId: 7, realtime: {
      tick: at / 50, frameAgeMs: 0, self: { ...self, hp },
      entities: [{ ...self, hp }, { ...native, hp: targetHp }], bullets: []
    } }, { nowMs: at, decisionState: combatState, selectedProfitCombatTargetId: '92',
      combatAttackRange: 14500, damageActorUserIds: [92] });
    const initialFight = fight(80, 100, 1000);
    assert.strictEqual(initialFight.exit, null);
    assert.strictEqual(initialFight.shooting.wouldShoot, true, 'initial HP gap preserves the valid fire opportunity');
    assert.strictEqual(fight(80, 100, 6000).exit, null);
    assert.strictEqual(fight(77, 97, 6050).exit, null, 'equal losses keep fighting');
    assert.strictEqual(fight(74, 97, 6100).exit?.reason, 'combat-hp-disadvantage-leave');
    return { ok: true, cases: 17 };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
module.exports = { runCombatSearchRegressionSelfTest };
if (require.main === module) console.log(JSON.stringify(runCombatSearchRegressionSelfTest()));
