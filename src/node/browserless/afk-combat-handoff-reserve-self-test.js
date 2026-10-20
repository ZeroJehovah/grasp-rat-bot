'use strict';

const assert = require('assert');
const { createBrowserlessActionAdapter } = require('./action-adapter');

// Non-zero historical reserves are regression controls and confer no authority.

function makeAdapter(overrides = {}) {
  const commands = [];
  const adapter = createBrowserlessActionAdapter({
    userId: 7,
    now: () => 1000,
    commandIntervalMs: 1,
    shootRepeatEnabled: false,
    combatShootMinIntervalMs: 160,
    afkShootMinIntervalMs: 160,
    combatShootPassiveRunnerDodgeReserveMs: 1800,
    opportunityMoveStaminaPerCm: 1,
    opportunityShotStaminaCostMs: 500,
    attackRangeCm: 14500,
    afkAttackCombatHandoffReserveMs: 3300,
    transport: {
      sendVelocity: (dx, dy) => {
        commands.push(`vel ${dx} ${dy}`);
        return { ok: true };
      },
      sendShoot: (x, y) => {
        commands.push(`shoot ${x} ${y}`);
        return { ok: true };
      }
    },
    ...overrides
  });
  return { adapter, commands };
}

function afkTarget(overrides = {}) {
  return {
    type: 'enemy',
    userId: 8,
    user_id: 8,
    entity_id: 8,
    x: 103,
    y: 0,
    hp: 11,
    max_hp: 100,
    drop: 62,
    current_join_mode: 'Passive',
    vx: 0,
    vy: 0,
    active: false,
    ...overrides
  };
}

// A realtime Active competitor near the same primary target: this is the
// generalized observable that makes a combat handoff reachable.
function competitor(overrides = {}) {
  return {
    userId: 9,
    user_id: 9,
    entity_id: 9,
    x: 900,
    y: 0,
    hp: 100,
    max_hp: 100,
    current_join_mode: 'Active',
    vx: 40,
    vy: 40,
    firing: true,
    active: true,
    ...overrides
  };
}

function apply(adapter, target, stamina5s, entities = []) {
  const self = {
    entity_id: 1,
    user_id: 7,
    x: 0,
    y: 0,
    hp: 100,
    stamina5s
  };
  return adapter.applyDecision({
    realtime: {
      tick: 10,
      receivedAtMs: 1000,
      self: { ...self, stamina_5s_remaining_milli: stamina5s },
      entities: [{ ...self, stamina_5s_remaining_milli: stamina5s }, target, ...entities],
      bullets: []
    },
    command: { shooting: { pendingShots: [], expiredShots: [] } }
  }, {
    kind: 'profit-candidate',
    band: 'profit',
    input: { self: { x: 0, y: 0, stamina5s } },
    action: { kind: 'attack', band: 'profit', target }
  });
}

function runAfkCombatHandoffReserveSelfTest() {
  const cases = [];
  for (const stamina of [499, 500, 2960, 3300]) {
    for (const bystanders of [[], [competitor()], [competitor({ active: false, current_join_mode: 'Passive' })]]) {
      const { adapter, commands } = makeAdapter();
      const result = apply(adapter, afkTarget(), stamina, bystanders);
      assert.strictEqual(result.shoot.requiredStaminaMs, 500);
      assert.strictEqual(result.shoot.staminaPlan.source, 'actual-shot-only');
      assert.strictEqual(commands.some(entry => entry.startsWith('shoot ')), stamina >= 500);
      if (stamina < 500) assert.strictEqual(result.shoot.reason, 'actual-stamina-unaffordable');
      cases.push({ stamina, bystanders: bystanders.length });
      adapter.sealTransport();
    }
  }
  const { adapter } = makeAdapter();
  const distant = apply(adapter, afkTarget({ x: 9000 }), 500,
    [competitor({ x: 9000, y: 12000 })]);
  assert.strictEqual(distant.shoot.staminaPlan.requiredStaminaMs, 500);
  adapter.sealTransport();
  return { ok: true, cases: [...cases, { distance: 9000 }] };
}

if (require.main === module) {
  const result = runAfkCombatHandoffReserveSelfTest();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.ok ? 0 : 1);
}

module.exports = { runAfkCombatHandoffReserveSelfTest };
