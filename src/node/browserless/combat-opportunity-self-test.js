'use strict';

const assert = require('assert');
const {
  pursuitApproachDirectionCore: heading, combatPressureWindowCore: pressureWindow,
  invulnerableEscortWaitCore: wait, uncommittedDefenseExitCore: exit
} = require('../../strategy/combat-opportunity-tactics');
const { buildCombatMovementPlan, buildBrowserlessCombatDryRun } = require('./combat-adapter');
const { buildUncommittedDefenseExitAction: finalExit } = require('./uncommitted-defense');
const { buildIncomingPressureFixture } = require('./incoming-pressure-self-test');
const { buildBrowserlessDecision, buildBrowserlessRealtimeControlDecision } = require('./decision-adapter');

function runCombatOpportunitySelfTest() {
  for (const [x, y, dx, dy] of [[7430, 15, 1, 0], [15, 7430, 0, 1], [-7430, 15, -1, 0],
    [15, -7430, 0, -1], [5000, 5000, 1, 1], [-5000, -5000, -1, -1]]) {
    const input = { self: { x: 0, y: 0 }, target: { x, y }, targetId: '2', nowMs: 10000,
      allowed: true, fallback: { dx: Math.sign(x), dy: Math.sign(y) } };
    assert.deepStrictEqual(heading(input).direction, { dx, dy });
    assert.strictEqual(heading({ ...input, allowed: false }).active, false);
    assert.strictEqual(heading(input, { combatPursuitHeadingEnabled: false }).active, false);
  }
  const pressure = pressureWindow(Array.from({ length: 11 }, (_, i) => ({
    at: 5000 + i * 500, selfHp: 100 - 3 * i, targetHp: 100 - (i % 3 === 0 ? i : i - i % 3),
    newBulletCount: 1
  })), 10000);
  assert.strictEqual(pressure.damage, 30);
  assert.strictEqual(pressure.targetDamage, 9);
  assert.strictEqual(pressure.sustained, true);
  assert.strictEqual(pressureWindow([{ at: 10000, selfHp: 70, newBulletCount: 8 }], 10000).sustained, false);
  assert.strictEqual(pressureWindow([{ at: 9000, selfHp: 50 }, { at: 9500, selfHp: 60 },
    { at: 10000, selfHp: 57 }], 10000).damage, 3, 'healing does not cancel subsequent damage');
  assert.strictEqual(pressureWindow([{ at: 10000, selfHp: 70 }, { at: 10000, selfHp: 60 },
    { at: 10001, selfHp: 50 }], 10000).damage, 0, 'duplicate/future observations do not fabricate losses');
  const waitInput = { nowMs: 10000, secondary: true, realtimePrimary: true,
    primary: { userId: '1', hp: 100, invulnerable: true, invulnerableProtectionLeaseUntilMs: 40000 },
    selfHp: 70, primaryDistanceCm: 5000, pressure };
  const first = wait(waitInput);
  assert.strictEqual(first.active, false);
  const active = wait({ ...waitInput, nowMs: 10250, previous: first.state });
  assert.strictEqual(active.active, true);
  assert.strictEqual(active.remainingMs, 29750);
  for (const change of [{ realtimePrimary: false }, { secondary: false }, { selfHp: 50 },
    { primary: { ...waitInput.primary, invulnerable: false } },
    { primary: { ...waitInput.primary, invulnerableProtectionLeaseUntilMs: 10000, invulnerableRemainingMs: 30000 } }]) {
    assert.strictEqual(wait({ ...waitInput, ...change, previous: active.state }).active, false);
  }
  assert.strictEqual(wait({ ...waitInput, primary: { userId: '1', hp: 100, invulnerable: true } }).state.active, false);
  assert.strictEqual(wait({ ...waitInput, nowMs: 12000, previous: active.state }).active, false, 'stale state reconfirms');
  const safe = wait({ ...waitInput, nowMs: 10300, previous: active.state, pressure: { ...pressure, sustained: false } });
  assert.strictEqual(safe.active, true);
  const safe2 = wait({ ...waitInput, nowMs: 11300, previous: safe.state, pressure: { ...pressure, sustained: false } });
  assert.strictEqual(safe2.active, false);
  const exitInput = { nowMs: 10000, targetId: '2', realtime: true, secondary: true, commitment: false,
    selfHp: 70, targetHp: 91, engagedMs: 5000, acceptedShots: 10, pressure };
  const pendingExit = exit(exitInput);
  assert.strictEqual(pendingExit.shouldLeave, false);
  const confirmedExit = exit({ ...exitInput, nowMs: 10250, previous: pendingExit.state });
  assert.strictEqual(confirmedExit.shouldLeave, true);
  for (const change of [{ commitment: true }, { commitment: undefined }, { realtime: false },
    { secondary: false }, { targetHp: 20 }, { selfHp: 50 }, { engagedMs: 2999 },
    { acceptedShots: 2 }, { finishOpportunity: true }, { invulnerable: true },
    { pressure: { ...pressure, sustained: false } }, { pressure: { ...pressure, damage: 17 } },
    { pressure: { ...pressure, targetDamage: 18 } }, { targetId: '3' }]) {
    assert.strictEqual(exit({ ...exitInput, nowMs: 10250, previous: pendingExit.state, ...change }).shouldLeave, false);
  }
  const combat = { target: { userId: '2' }, dryRun: { uncommittedDefense: confirmedExit,
    shooting: { wouldShoot: true } } };
  assert(finalExit(combat, {}, { evaluated: true }));
  assert.strictEqual(finalExit(combat), null);
  for (const state of [{ profitMission: { active: true } }, { realtimeLootIntent: {} },
    { postKillSettlement: { active: true, phase: 'drop-pending' } },
    { postKillSettlements: { one: { active: true, phase: 'drop-visible' } } }]) {
    assert.strictEqual(finalExit(combat, state, { evaluated: true }), null);
    assert.strictEqual(combat.dryRun.shooting.wouldShoot, true);
  }
  for (const key of ['profitChoice', 'lootAction', 'settlementAction', 'dropWaitAction']) {
    assert.strictEqual(finalExit(combat, {}, { evaluated: true, [key]: {} }), null, 'new same-tick reward protects fire');
  }
  assert(finalExit(combat, { postKillSettlements: {
    terminal: { active: false, phase: 'drop-visible' },
    diagnostic: { active: true, phase: 'drop-pending', ownDamageAttribution: true }
  } }, { evaluated: true }), 'diagnostic attribution cannot influence decisions');

  // Production movement: the final secondary override must preserve the wait.
  const self = { user_id: 1, x: 0, y: 0, hp: 70, stamina_5s_remaining_milli: 10000 };
  const primary = { ...waitInput.primary, user_id: 101, userId: 101, x: 5000, y: 0 };
  const target = { user_id: 202, x: 10000, y: 0, hp: 91, distance: 10000,
    active: true, combatRole: 'secondary', secondaryTarget: true, primaryTargetId: '101' };
  const targetState = { id: 202, firstSeenAt: 5000, motionSamples: [] };
  const options = { nowMs: 10000, realtimeTargets: [primary, target], combatTargetState: targetState,
    combatOpportunityPressure: pressure, combatCoverEnabled: false, realtimeStateFresh: true,
    profitMission: { active: true, type: 'enemy', targetId: '101', navigationTarget: primary } };
  buildCombatMovementPlan(self, target, [], options);
  const plan = buildCombatMovementPlan(self, target, [], { ...options, nowMs: 10250 });
  assert.strictEqual(plan.invulnerableEscortWait.active, true);
  assert.deepStrictEqual({ dx: plan.dx, dy: plan.dy }, { dx: 0, dy: 0 });
  assert.strictEqual(plan.reason, 'invulnerable-primary-pressure-wait');
  const pursuitTarget = { ...target, x: 7430, y: 15, distance: 7430, combatRole: 'primary',
    secondaryTarget: false, primaryTargetId: '' };
  const pursuit = buildCombatMovementPlan({ ...self, hp: 100 }, pursuitTarget, [], { nowMs: 10000 });
  assert.strictEqual(pursuit.pursuitApproach.active, true);
  assert.deepStrictEqual({ dx: pursuit.dx, dy: pursuit.dy }, { dx: 1, dy: 0 });

  const fixture = buildIncomingPressureFixture({ selfHp: 70, stamina: 10000 });
  fixture.primary.hp = 100;
  fixture.primary.invulnerable = true;
  fixture.primary.invulnerableProtectionLeaseUntilMs = 40000;
  fixture.stateful.profitMission.navigationTarget = { ...fixture.primary, authority: 'realtime' };
  fixture.stateful.combatTarget.motionSamples = Array.from({ length: 10 }, (_, i) => ({
    at: 5000 + i * 500, selfHp: 100 - 3 * i, targetHp: 100, newBulletCount: 1, x: 2046, y: 0
  }));
  fixture.stateful.combatTarget.invulnerableEscortWaitState = {
    id: '101', at: 9950, active: true, unsafeSince: 9600, safeSince: null
  };
  const before = buildBrowserlessCombatDryRun(structuredClone(fixture.state), {
    ...fixture.options, decisionState: structuredClone(fixture.stateful), combatInvulnerableEscortWaitEnabled: false
  });
  const after = buildBrowserlessCombatDryRun(structuredClone(fixture.state), {
    ...fixture.options, decisionState: structuredClone(fixture.stateful)
  });
  assert.strictEqual(after.movement.invulnerableEscortWait.active, true);
  assert.strictEqual(after.shooting.wouldShoot, true, 'wait must keep valid secondary shots');
  assert.strictEqual(after.shooting.wouldShoot, before.shooting.wouldShoot);
  assert.strictEqual(after.fireTarget?.userId, before.fireTarget?.userId);
  assert.strictEqual(after.exit, before.exit);
  for (const decide of [buildBrowserlessDecision, buildBrowserlessRealtimeControlDecision]) {
    const severeFixture = () => {
      const f = buildIncomingPressureFixture({ selfHp: 70, stamina: 10000 });
      f.state.realtime.entities = [f.self, f.secondary];
      f.secondary.hp = 91; f.secondary.primaryTargetId = '';
      f.stateful.profitMission = null; f.options.profitMission = null;
      f.stateful.combatTarget.primaryTargetId = ''; f.stateful.combatTarget.firstSeenAt = 4000;
      f.stateful.combatTarget.motionSamples = Array.from({ length: 10 }, (_, i) => ({
        at: 5000 + i * 500, selfHp: 100 - 3 * i, targetHp: 100 - Math.floor(i / 3) * 3,
        newBulletCount: 1, x: 2046, y: 0
      }));
      f.stateful.combatTarget.uncommittedDefenseState = { id: '202', at: 9950, since: 9600 };
      return f;
    };
    const f = severeFixture();
    const decision = decide(f.state, f.stateful, f.options);
    assert.strictEqual(decision.action.reason, 'uncommitted-defense-poor-exchange-leave');
    const disabled = severeFixture(); disabled.options.combatUncommittedDefenseExitEnabled = false;
    const original = decide(disabled.state, disabled.stateful, disabled.options);
    assert.notStrictEqual(original.action.reason, decision.action.reason);
    assert.strictEqual(decision.combat.shooting.wouldShoot, original.combat.shooting.wouldShoot,
      'candidate calculation must not cancel established defensive fire');
    const low = severeFixture(); low.self.hp = 50;
    assert.notStrictEqual(decide(low.state, low.stateful, low.options).action.reason, decision.action.reason,
      'the existing HP-50 hard exit retains precedence');
  }
  return { ok: true, groups: 8 };
}

if (require.main === module) console.log(JSON.stringify(runCombatOpportunitySelfTest()));
module.exports = { runCombatOpportunitySelfTest };
