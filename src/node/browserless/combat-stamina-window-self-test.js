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
  const snapshot = { realtime: { tick: 1, self: { user_id: 1, x: 0, y: 0, hp: 100 } },
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
  const decision = (index = 0, active = true) => {
    const nextTarget = { ...target, user_id: index % 2 ? 9 : 8, active };
    return { kind: 'combat-live', band: 'combat', action: { kind: 'combat-live', band: 'combat', target: nextTarget }, combat: {
      target: nextTarget, self: snapshot.realtime.self,
      movement: { dx: index % 2 ? -1 : 1, dy: 1, reason: 'test-dodge' },
      aim: { x: 1000, y: 0 }, metrics: { engagementGeneration: `generation-${index}` },
      shooting: { wouldShoot: true, commandSuppressed: false, cadenceMs: 160,
        executionCadenceMs: 160, targetRole: index % 2 ? 'secondary' : 'primary' }
    } };
  };
  // Intentionally reuse a stale decision/state and never ACK. Target/engagement
  // changes and delayed telemetry must not replenish a shared wire allowance.
  for (let i = 0; i < 10; i += 1) {
    at = 10000 + i * 160;
    assert.strictEqual(adapter.applyDecision(snapshot, decision(i)).shoot.skipped, false);
  }
  at = 11600;
  const blocked = adapter.applyDecision(snapshot, decision(10));
  assert.strictEqual(blocked.shoot.reason, 'combat-window-exhausted');
  assert.strictEqual(sends, 10);
  assert(moves >= 11, 'shooting exhaustion cannot prevent movement dispatch');
  const dispatches = store.getCommandState(at).shooting.staminaDispatches;
  assert.strictEqual(combatStaminaWindowCore(dispatches, at).spentMilli, 5000);
  assert.strictEqual(combatStaminaWindowCore(dispatches, 14999).allowed, false);
  assert.strictEqual(combatStaminaWindowCore(dispatches, 15000).allowed, true);
  assert.strictEqual(combatStaminaWindowCore(dispatches, 9000).allowed, false);
  assert.strictEqual(combatStaminaWindowCore(dispatches.slice(0, 9), at, 501).allowed, false);
  assert.strictEqual(combatStaminaWindowCore(dispatches.slice(0, 9), at, 500).allowed, true);
  assert.strictEqual(combatStaminaWindowCore([
    ...dispatches,
    { requestedAtMs: at, shotCostMilli: 500, executionClass: 'profit-opportunity' }
  ], at).spentMilli, 5000, 'AFK opportunity shots do not consume combat budget');
  // A new action adapter inherits recent requests from command state.
  adapter = makeAdapter();
  snapshot.command = store.getCommandState(at);
  assert.strictEqual(adapter.applyDecision(snapshot, decision(11)).shoot.reason, 'combat-window-exhausted');
  at = 15000;
  reject = true;
  assert.strictEqual(adapter.applyDecision(snapshot, decision()).shoot.reason, 'send-shoot-failed');
  assert.strictEqual(store.getCommandState(at).shooting.requestedShots, 10);
  reject = false;
  assert.strictEqual(adapter.applyDecision(snapshot, decision()).shoot.skipped, false);
  at = 15160;
  assert.strictEqual(adapter.applyDecision(snapshot, decision(1)).shoot.skipped, false);
  assert.strictEqual(sends, 12, 'exact expiry releases only the expired shots');
  assert.strictEqual(usesCombatStaminaWindow({ active: false }, 'primary'), false);
  assert.strictEqual(usesCombatStaminaWindow({ active: false }, 'secondary'), true);
  // The limiter is not installed on non-combat AFK output.
  at = 15320;
  assert.strictEqual(adapter.applyDecision(snapshot, decision(2, false)).shoot.skipped, false);
  const ready = determineCombatFireState({ stamina5s: 1 }, target, {
    hardReserveMs: 9999, dodgeActionCostMs: 9999,
    combatShootingBudget: combatStaminaWindowCore([], at)
  });
  assert.strictEqual(ready.state, 'normal');
  assert.strictEqual(ready.reserve, 0);
  assert.strictEqual(ready.dodgeActionCostMs, 0);
  const fixture = buildIncomingPressureFixture({ selfHp: 70, stamina: 2400 });
  fixture.state.command = { shooting: { staminaDispatches: dispatches } };
  const dry = buildBrowserlessCombatDryRun(fixture.state, { ...fixture.options, nowMs: 11600 });
  assert.strictEqual(dry.shooting.staminaWindow.allowed, false);
  assert.strictEqual(dry.shooting.wouldShoot, false);
  assert.strictEqual(dry.movement.combatStaminaBudget.movementIndependent, true);
  return { ok: true, cases: 25 };
}

module.exports = { runCombatStaminaWindowSelfTest };
if (require.main === module) console.log(JSON.stringify(runCombatStaminaWindowSelfTest()));
