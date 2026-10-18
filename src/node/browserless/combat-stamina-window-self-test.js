'use strict';

const assert = require('assert');
const { combatStaminaWindowCore, usesCombatStaminaWindow } = require('../../strategy/combat-stamina-window');
const { determineCombatFireState } = require('../../strategy/combat-fire-discipline');
const { createBrowserlessActionAdapter } = require('./action-adapter');
const { createBrowserlessStateStore } = require('./state-store');
const { buildIncomingPressureFixture } = require('./incoming-pressure-self-test');
const { buildBrowserlessCombatDryRun } = require('./combat-adapter');

function runCombatStaminaWindowSelfTest() {
  let at = 10000;
  let sends = 0;
  let moves = 0;
  let reject = false;
  const store = createBrowserlessStateStore({ userId: 1, now: () => at });
  const target = { user_id: 8, x: 1000, y: 0, hp: 100, active: true, authority: 'realtime' };
  const snapshot = { realtime: { tick: 10, receivedAtMs: at, self: { user_id: 1, x: 0, y: 0, hp: 100 } },
    command: store.getCommandState(at) };
  const makeAdapter = () => createBrowserlessActionAdapter({ now: () => at,
    shootRepeatEnabled: false, velocityRepeatEnabled: false, commandIntervalMs: 0,
    transport: { sendVelocity() { moves += 1; }, sendShoot() {
      if (reject) throw new Error('test transport rejection');
      sends += 1;
    } },
    onShootRequest: request => store.recordShootRequest(request)
  });
  let adapter = makeAdapter();
  const decision = (tick, index = 0, active = true) => {
    const nextTarget = { ...target, user_id: index % 2 ? 9 : 8, active };
    return { kind: 'combat-live', band: 'combat', action: { kind: 'combat-live', band: 'combat', target: nextTarget }, combat: {
      target: nextTarget, self: snapshot.realtime.self,
      movement: { dx: index % 2 ? -1 : 1, dy: 1, reason: 'test-dodge' },
      aim: { x: 1000, y: 0 }, metrics: { engagementGeneration: `generation-${index}` },
      shooting: { wouldShoot: true, commandSuppressed: false, cadenceMs: 160,
        executionCadenceMs: 160, targetRole: index % 2 ? 'secondary' : 'primary' },
      timing: { observedTick: tick }
    } };
  };
  // Ten-frame slots, not the retired wall-clock cadence or rolling stamina
  // budget, authorize each dispatch. Delayed telemetry and missing ACKs cannot
  // replenish a frame slot.
  for (let i = 0; i < 11; i += 1) {
    at = 10000 + i * 160;
    const tick = 10 + i * 10;
    snapshot.realtime.tick = tick;
    snapshot.realtime.receivedAtMs = at;
    snapshot.command = store.getCommandState(at);
    const result = adapter.applyDecision(snapshot, decision(tick, i));
    assert.strictEqual(result.shoot.skipped, false, `frame ${tick} should dispatch`);
    assert.strictEqual(result.shoot.command?.frameClaim?.ok, true);
  }
  assert.strictEqual(sends, 11, 'the old five-second budget cannot reject legal frame slots');
  const duplicateTick = 110;
  const blocked = adapter.applyDecision(snapshot, decision(duplicateTick, 11));
  assert.strictEqual(blocked.shoot.reason, 'shoot-frame:frame-slot-already-consumed');
  assert.strictEqual(sends, 11);
  assert(moves >= 12, 'a frame-slot rejection cannot prevent movement dispatch');
  const dispatches = store.getCommandState(at).shooting.staminaDispatches;
  assert.strictEqual(dispatches.length, 11);
  assert.strictEqual(combatStaminaWindowCore(dispatches, at).spentMilli, 5500);
  assert.strictEqual(combatStaminaWindowCore(dispatches, 14999).allowed, false);
  assert.strictEqual(combatStaminaWindowCore(dispatches, 15160).allowed, true);
  assert.strictEqual(combatStaminaWindowCore(dispatches, 9000).allowed, false);
  assert.strictEqual(combatStaminaWindowCore(dispatches.slice(0, 9), at, 501).allowed, false);
  assert.strictEqual(combatStaminaWindowCore(dispatches.slice(0, 9), at, 500).allowed, true);
  assert.strictEqual(combatStaminaWindowCore([
    ...dispatches,
    { requestedAtMs: at, shotCostMilli: 500, executionClass: 'profit-opportunity' }
  ], at).spentMilli, 5500, 'AFK opportunity shots do not consume combat budget');

  // A transport rejection still consumes the claimed frame. It is never
  // retried on that slot; the next legal slot can dispatch normally.
  adapter = makeAdapter();
  snapshot.command = store.getCommandState(at);
  at = 15000;
  snapshot.realtime.tick = 120;
  snapshot.realtime.receivedAtMs = at;
  reject = true;
  assert.strictEqual(adapter.applyDecision(snapshot, decision(120, 12)).shoot.reason, 'send-shoot-failed');
  assert.strictEqual(store.getCommandState(at).shooting.requestedShots, 11);
  reject = false;
  assert.strictEqual(
    adapter.applyDecision(snapshot, decision(120, 12)).shoot.reason,
    'shoot-frame:frame-slot-already-consumed'
  );
  at = 15500;
  snapshot.realtime.tick = 130;
  snapshot.realtime.receivedAtMs = at;
  assert.strictEqual(adapter.applyDecision(snapshot, decision(130, 13)).shoot.skipped, false);
  assert.strictEqual(sends, 12);
  assert.strictEqual(usesCombatStaminaWindow({ active: false }, 'primary'), false);
  assert.strictEqual(usesCombatStaminaWindow({ active: false }, 'secondary'), true);

  // The legacy window cannot override independent hard reserve or Dodge
  // reserve classification.
  const hardBlocked = determineCombatFireState({ stamina5s: 1 }, target, {
    hardReserveMs: 9999,
    dodgeActionCostMs: 9999
  });
  assert.strictEqual(hardBlocked.state, 'disabled');
  assert.strictEqual(hardBlocked.reason, 'below-hard-reserve');
  const normal = determineCombatFireState({ stamina5s: 10000 }, target, {
    hardReserveMs: 1000,
    dodgeReserveMs: 2400,
    shotCostMs: 500,
    dodgeActionCostMs: 1000
  });
  assert.strictEqual(normal.state, 'normal');
  assert.strictEqual(normal.reason, 'normal-fire');

  const fixture = buildIncomingPressureFixture({ selfHp: 70, stamina: 2400 });
  fixture.state.command = { shooting: { staminaDispatches: dispatches } };
  const dry = buildBrowserlessCombatDryRun(fixture.state, { ...fixture.options, nowMs: 11600 });
  assert.strictEqual(dry.shooting.staminaWindow.allowed, false);
  assert.notStrictEqual(dry.shooting.finalFireBlocker, 'combat-window-exhausted');
  assert.strictEqual(dry.movement.combatStaminaBudget.movementIndependent, true);
  return { ok: true, cases: 24 };
}

module.exports = { runCombatStaminaWindowSelfTest };
if (require.main === module) console.log(JSON.stringify(runCombatStaminaWindowSelfTest()));
