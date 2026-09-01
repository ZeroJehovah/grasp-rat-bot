'use strict';

const assert = require('assert');
const { createBrowserlessActionAdapter } = require('./action-adapter');

// An AFK profit target that is already inside combat handoff range hands the
// shared 5s stamina pool to the combat fire path. That successor cannot fire
// below hardReserve + shotCost + dodgeActionCost, so the AFK travel-only floor
// (zero at full-attack range) must not be allowed to drain the pool below the
// successor's entry requirement while a handoff is actually reachable.

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
      tick: 1,
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

  // Lone AFK target: nothing can pull this into combat, so ordinary AFK output
  // keeps the travel-only floor and still fires at a nearly drained pool.
  {
    const { adapter, commands } = makeAdapter();
    const result = apply(adapter, afkTarget(), 296);
    cases.push({
      name: 'lone AFK target keeps travel-only floor at full-attack range',
      ok: result.shoot.ok === true
        && result.shoot.staminaPlan.combatHandoffReachable === false
        && result.shoot.staminaPlan.combatHandoffReserveMs === 0
        && result.shoot.staminaPlan.requiredStaminaMs === 0
        && commands.some(entry => entry.startsWith('shoot ')),
      requiredStaminaMs: result.shoot.staminaPlan.requiredStaminaMs,
      reachable: result.shoot.staminaPlan.combatHandoffReachable
    });
  }

  // Competitor observed near the same target while inside combat handoff range:
  // hold the successor's floor instead of draining the pool to zero.
  {
    const { adapter, commands } = makeAdapter();
    const result = apply(adapter, afkTarget(), 296, [competitor()]);
    cases.push({
      name: 'observed competitor holds the combat handoff reserve',
      ok: result.shoot.skipped === true
        && result.shoot.reason === 'afk-shoot-stamina-reserve'
        && result.shoot.staminaPlan.combatHandoffReachable === true
        && result.shoot.staminaPlan.combatHandoffReserveMs === 3300
        && result.shoot.staminaPlan.combatHandoffReserveApplied === true
        && result.shoot.staminaPlan.requiredStaminaMs === 3300
        && !commands.some(entry => entry.startsWith('shoot ')),
      reason: result.shoot.reason,
      requiredStaminaMs: result.shoot.staminaPlan.requiredStaminaMs
    });
  }

  // The reserve is a floor, not a permanent block: once the pool has recovered
  // past the successor's entry requirement, AFK fire resumes normally.
  {
    const { adapter, commands } = makeAdapter();
    const result = apply(adapter, afkTarget(), 3300, [competitor()]);
    cases.push({
      name: 'recovered stamina resumes AFK fire above the handoff reserve',
      ok: result.shoot.ok === true
        && result.shoot.staminaPlan.combatHandoffReachable === true
        && result.shoot.staminaPlan.requiredStaminaMs === 3300
        && commands.some(entry => entry.startsWith('shoot ')),
      requiredStaminaMs: result.shoot.staminaPlan.requiredStaminaMs
    });
  }

  // Travel budget still wins when it is the larger of the two floors, so the
  // approach reserve behavior is unchanged.
  {
    const { adapter } = makeAdapter();
    // Keep self strictly closer so UC-005's competition position gate stays open
    // and the stamina plan is the decision under test.
    const result = apply(adapter, afkTarget({ x: 9000 }), 9000, [competitor({ x: 9000, y: 12000 })]);
    cases.push({
      name: 'larger approach travel reserve still governs',
      ok: result.shoot.staminaPlan.requiredStaminaMs === 5000
        && result.shoot.staminaPlan.movementReserveCapped === true
        && result.shoot.staminaPlan.combatHandoffReserveApplied === false,
      requiredStaminaMs: result.shoot.staminaPlan.requiredStaminaMs
    });
  }

  // A passive bystander is not a handoff signal: only an observed active
  // competitor or an external bullet owner can pull this into combat.
  {
    const { adapter, commands } = makeAdapter();
    const result = apply(adapter, afkTarget(), 296, [competitor({
      userId: 11,
      user_id: 11,
      entity_id: 11,
      current_join_mode: 'Passive',
      vx: 0,
      vy: 0,
      firing: false,
      active: false
    })]);
    cases.push({
      name: 'passive bystander does not raise the AFK floor',
      ok: result.shoot.ok === true
        && result.shoot.staminaPlan.combatHandoffReachable === false
        && result.shoot.staminaPlan.requiredStaminaMs === 0
        && commands.some(entry => entry.startsWith('shoot ')),
      reachable: result.shoot.staminaPlan.combatHandoffReachable
    });
  }

  // An external bullet owner near us is the second generalized handoff signal,
  // independent of the competition observer.
  {
    const { adapter } = makeAdapter();
    const self = {
      entity_id: 1,
      user_id: 7,
      x: 0,
      y: 0,
      hp: 100,
      stamina5s: 296,
      stamina_5s_remaining_milli: 296
    };
    const target = afkTarget();
    const result = adapter.applyDecision({
      realtime: {
        tick: 1,
        receivedAtMs: 1000,
        self,
        entities: [self, target],
        bullets: [{
          owner_id: 21,
          owner_entity_id: 21,
          x: 400,
          y: 0,
          start_x: 400,
          start_y: 0,
          target_x: 0,
          target_y: 0,
          created_tick: 1
        }]
      },
      command: { shooting: { pendingShots: [], expiredShots: [] } }
    }, {
      kind: 'profit-candidate',
      band: 'profit',
      input: { self: { x: 0, y: 0, stamina5s: 296 } },
      action: { kind: 'attack', band: 'profit', target }
    });
    cases.push({
      name: 'external bullet owner raises the AFK floor',
      ok: result.shoot.staminaPlan.combatHandoffReachable === true
        && result.shoot.staminaPlan.requiredStaminaMs === 3300,
      reachable: result.shoot.staminaPlan.combatHandoffReachable,
      requiredStaminaMs: result.shoot.staminaPlan.requiredStaminaMs
    });
  }

  const failed = cases.filter(entry => entry.ok !== true);
  for (const entry of failed) {
    assert.fail(`${entry.name}: ${JSON.stringify(entry)}`);
  }
  return { ok: failed.length === 0, cases };
}

if (require.main === module) {
  const result = runAfkCombatHandoffReserveSelfTest();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.ok ? 0 : 1);
}

module.exports = { runAfkCombatHandoffReserveSelfTest };
