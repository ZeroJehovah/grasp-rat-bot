'use strict';

const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { combatTargetAdmissionCore } = require('../../strategy/combat-target-selection');
const { secondaryFirePolicy, dualTargetFireArbitration } = require('../../strategy/dual-target-policy');
const { buildBrowserlessCombatStrategyInput, buildBrowserlessStrategyInput,
  createBrowserlessDecisionAdapter } = require('./decision-adapter');
const { buildBrowserlessCombatDryRun } = require('./combat-adapter');
const { createBrowserlessActionAdapter } = require('./action-adapter');
const { createDailyDamagePlayerTracker } = require('./daily-damage-player-tracker');
const { createBrowserlessDecisionWorker } = require('./decision-worker');
const { createBrowserlessRealtimeControlWorker } = require('./realtime-control-worker');
const { buildIncomingPressureFixture } = require('./incoming-pressure-self-test');

function fixture(hp = 80, distance = 2000) {
  const self = { user_id: 1, x: 0, y: 0, hp, max_hp: 100,
    current_join_mode: 'Active', stamina_5s_remaining_milli: 10000 };
  const target = { user_id: 2, name: 'quiet-player', x: distance, y: 0, hp: 100,
    current_join_mode: 'Passive', stamina_5s_remaining_milli: 10000, drop: 0 };
  return { userId: 1, realtime: { tick: 200, frameAgeMs: 0, receivedAtMs: 10000,
    self, entities: [self, target], bullets: [] }, command: { shooting: {} },
    fallback: { entities: [], coinDrops: [] } };
}

async function runDailyDamageSecondarySelfTest() {
  const cases = [];
  const check = (name, fn) => { fn(); cases.push(name); };
  const target = { user_id: 2, hp: 100, authority: 'realtime', active: false,
    distance: 2000, dailyDamageActor: true };
  const context = { selfHp: 80, combatAttackRange: 14500 };
  check('quiet-history-admission-is-close-medium-hp-secondary-only', () => {
    const admission = combatTargetAdmissionCore(target, context);
    assert.equal(admission.secondaryEligible, true);
    assert.equal(admission.attackEvidence, false);
    assert.equal(admission.dailyDamageCloseEvidence, true);
    assert.equal(admission.profitEligible, false);
    for (const changed of [{ distance: 2001 }, { dailyDamageActor: false },
      { authority: 'snapshot' }, { alive: false }, { invulnerable: true },
      { creatorProtected: true }, { legacyWhitelistProtected: true }, { whitelisted: true }]) {
      assert.equal(combatTargetAdmissionCore({ ...target, ...changed }, context).eligible, false);
    }
    assert.equal(combatTargetAdmissionCore(target, { ...context, selfHp: 81 }).eligible, false);
    assert.equal(combatTargetAdmissionCore(target, { ...context, selfHp: 51 }).eligible, true);
    assert.equal(combatTargetAdmissionCore(target, { ...context, selfHp: 50 }).lowHpSecondaryExit, true);
    assert.equal(combatTargetAdmissionCore({ ...target, invulnerable: true },
      { ...context, selfHp: 50 }).lowHpSecondaryExit, true);
    assert.equal(combatTargetAdmissionCore({ ...target, active: true },
      { ...context, profitMissionTargetId: '2' }).profitEligible, true);
  });
  check('quota-history-exemption-does-not-become-sustained-pressure', () => {
    const input = { nowMs: 10000, target, dispatchTimes: [9000], combatTargetState: { motionSamples: [] } };
    const policy = secondaryFirePolicy(input);
    assert.equal(policy.allowed, true);
    assert.equal(policy.quotaExemptionReason, 'daily-damage-close');
    assert.equal(policy.closePressure.active, false);
    for (const changed of [{ distance: 2001 }, { dailyDamageActor: false }, { invulnerable: true }]) {
      assert.equal(secondaryFirePolicy({ ...input, target: { ...target, ...changed } }).allowed, false);
    }
    const sustained = secondaryFirePolicy({ ...input, combatTargetState: {
      motionSamples: [{ at: 9500, newBulletCount: 1 }, { at: 9900, newBulletCount: 1 }] } });
    assert.equal(sustained.quotaExemptionReason, 'sustained-close-fire+daily-damage-close');
    assert.equal(secondaryFirePolicy({ ...input, target: { ...target, dailyDamageActor: false },
      combatTargetState: { motionSamples: [{ at: 9500, newBulletCount: 1 }, { at: 9900, newBulletCount: 1 }] }
    }).quotaExemptionReason, 'sustained-close-fire');
    assert.equal(dualTargetFireArbitration({ secondaryActive: true, primaryAuthorized: true,
      closePressure: policy.closePressure, rewardRace: { shouldFocusSecondary: true }
    }).primarySelected, true);
  });
  const options = { nowMs: 10000, userId: 1, combatEnabled: true, liveCombatEnabled: true,
    controlMode: 'profit-live', canaryProfile: 'profit-live', dailyDamageUserIds: [2] };
  check('quiet-full-stamina-native-player-survives-realtime-prefilter-and-fires', () => {
    const state = fixture();
    const input = buildBrowserlessCombatStrategyInput(state, options, {});
    assert.equal(input.visibleTargets[0].dailyDamageActor, true);
    assert.equal(input.visibleTargets[0].damagedSelfToday, false);
    assert.equal(input.visibleTargets[0].active, false);
    const control = createBrowserlessDecisionAdapter(options).evaluateRealtime(state, options);
    assert.equal(control.combat.target.userId, 2);
    assert.equal(control.combat.target.combatRole, 'secondary');
    assert.equal(control.kind, 'combat-live');
    assert.equal(control.combat.shooting.wouldShoot, true);
    assert.equal(control.combat.shooting.secondaryPolicy.opponentShots, 0);
    assert.equal(control.combat.shooting.secondaryPolicy.closePressure.active, false);
    const outside = createBrowserlessDecisionAdapter(options).evaluateRealtime(fixture(80, 2001), options);
    assert.equal(outside.combat.target, null);
    const healthy = createBrowserlessDecisionAdapter(options).evaluateRealtime(fixture(81), options);
    assert.equal(healthy.combat.target, null);
    const low = createBrowserlessDecisionAdapter(options).evaluateRealtime(fixture(50), options);
    assert.equal(low.exitAction.shouldLeave, true);
    assert.equal(low.combat.shooting.wouldShoot, false);
  });
  check('existing-primary-fire-wins-quiet-daily-secondary', () => {
    const f = buildIncomingPressureFixture({ selfHp: 80, stamina: 10000 });
    const secondary = f.state.realtime.entities.find(entity => entity.user_id === 202);
    Object.assign(secondary, { x: 2000, firing: false, active: false, moving: false,
      vx: 0, vy: 0, dailyDamageActor: true });
    f.stateful.combatTarget.motionSamples = [];
    f.stateful.combatTarget.secondaryDispatchTimes = [9900];
    const result = buildBrowserlessCombatDryRun(f.state, f.options);
    assert.equal(result.shooting.secondaryPolicy.quotaExemptionReason, 'daily-damage-close');
    assert.equal(result.shooting.secondaryPolicy.closePressure.active, false);
    assert.equal(result.fireTargetRole, 'primary');
    assert.equal(result.fireTarget.userId, 101);
  });
  check('daily-secondary-wire-keeps-ten-tick-and-single-dispatch-gates', () => {
    const state = fixture();
    const control = createBrowserlessDecisionAdapter(options).evaluateRealtime(state, options);
    const shots = [];
    const adapter = createBrowserlessActionAdapter({ now: () => 10000,
      shootRepeatEnabled: false, velocityRepeatEnabled: false, commandIntervalMs: 0,
      transport: { sendVelocity() {}, sendShoot() { shots.push(true); } } });
    const decision = { kind: 'combat-live', band: 'combat', combat: control.combat };
    assert.equal(adapter.applyDecision(state, decision).shoot.skipped, false);
    assert.equal(adapter.applyDecision(state, decision).shoot.skipped, true);
    state.realtime.tick = 201;
    decision.combat.timing.observedTick = 201;
    assert.equal(adapter.applyDecision(state, decision).shoot.reason, 'shoot-frame:frame-not-on-grid');
    assert.equal(shots.length, 1);
    adapter.sealTransport();
  });
  check('utc8-midnight-reload-and-stable-id-clear-daily-admission', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grasp-rat-daily-secondary-'));
    try {
      let nowMs = Date.parse('2026-10-19T15:59:58Z');
      const file = path.join(dir, 'damage.json');
      const tracker = createDailyDamagePlayerTracker({ file, now: () => nowMs });
      const state = fixture();
      tracker.observeDecision(state, {}, { atMs: nowMs, tick: 200 });
      state.realtime.self.hp = 77;
      state.realtime.bullets = [{ owner_user_id: 2 }];
      nowMs += 1000;
      tracker.observeDecision(state, {}, { atMs: nowMs, tick: 220 });
      state.realtime.bullets = [];
      const reloaded = createDailyDamagePlayerTracker({ file, now: () => nowMs });
      const read = () => buildBrowserlessCombatStrategyInput(state,
        { nowMs, damagePlayerTracker: reloaded }, {}).visibleTargets;
      assert.equal(read()[0].dailyDamageActor, true);
      state.realtime.entities[1].name = 'renamed';
      assert.equal(read()[0].dailyDamageActor, true);
      nowMs += 1000;
      assert.equal(reloaded.status(nowMs).playerCount, 0);
      assert.equal(read().length, 0);
      assert.equal(buildBrowserlessStrategyInput(state, { nowMs, damagePlayerTracker: reloaded }, {})
        .visibleTargets[0].dailyDamageActor, false);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
  const state = fixture();
  const contextForWorker = { damageStatus: { players: [{ userId: 2 }], userIds: [2] } };
  const workerOptions = { ...options };
  delete workerOptions.dailyDamageUserIds;
  const realtimeWorker = createBrowserlessRealtimeControlWorker(workerOptions);
  const plannerWorker = createBrowserlessDecisionWorker(workerOptions);
  try {
    await realtimeWorker.ready();
    const result = await realtimeWorker.evaluate(state, workerOptions, contextForWorker);
    assert.equal(result.control.combat.target.dailyDamageActor, true);
    assert.equal(result.control.combat.shooting.wouldShoot, true);
    assert.equal(result.control.kind, 'combat-live');
    await plannerWorker.ready();
    const planner = await plannerWorker.decide(state, workerOptions, contextForWorker);
    assert.equal(planner.decision.combat.target.dailyDamageActor, true);
    // Planner recovery remains an independent final-selection decision.
    assert.equal(planner.decision.combat.shooting.wouldShoot, true);
    cases.push('main-realtime-worker-and-planner-share-daily-identity');
  } finally {
    await realtimeWorker.close();
    await plannerWorker.close();
  }
  return { ok: true, cases };
}

module.exports = { runDailyDamageSecondarySelfTest };
if (require.main === module) runDailyDamageSecondarySelfTest().then(result => console.log(JSON.stringify(result)));
