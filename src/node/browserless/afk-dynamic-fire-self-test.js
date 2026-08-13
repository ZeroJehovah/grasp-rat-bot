'use strict';

const assert = require('assert');
const { createBrowserlessActionAdapter } = require('./action-adapter');

function action(target) {
  return {
    action: {
      kind: 'attack',
      band: 'profit',
      reason: 'invulnerable-profit-commitment-attack',
      target: {
        type: 'enemy',
        invulnerableProfitCommitment: true,
        ...target
      }
    }
  };
}

function frame(target, overrides = {}) {
  const self = {
    entity_id: 1,
    user_id: 7,
    x: 0,
    y: 0,
    hp: 100,
    stamina_5s_remaining_milli: 1000000,
    stamina_5s_limit_milli: 1000000,
    ...(overrides.self || {})
  };
  return {
    realtime: {
      tick: overrides.tick ?? 1,
      receivedAtMs: overrides.receivedAtMs ?? 1000,
      self,
      entities: [self, target],
      bullets: overrides.bullets || []
    },
    command: overrides.command || { shooting: { pendingShots: [], expiredShots: [] } }
  };
}

function runAfkDynamicFireSelfTest() {
  const velocities = [];
  const shots = [];
  const adapter = createBrowserlessActionAdapter({
    userId: 7,
    commandIntervalMs: 0,
    shootRepeatEnabled: false,
    afkAttackDynamicFireEnabled: true,
    afkAttackOwnDamageRateHpPerSec: 3,
    afkAttackExternalDamageRateHpPerSec: 2.05,
    transport: {
      sendVelocity(dx, dy) {
        velocities.push({ dx, dy });
        return { ok: true };
      },
      sendShoot(x, y) {
        shots.push({ x, y });
        return { ok: true };
      }
    }
  });

  const target = {
    entity_id: 2,
    user_id: 41,
    x: 10000,
    y: 0,
    hp: 20,
    current_join_mode: 'Passive',
    vx: 0,
    vy: 0
  };
  const delayed = adapter.applyDecision(frame(target), action({
    userId: 41,
    x: 10000,
    y: 0,
    hp: 100,
    invulnerable: false
  }));
  assert.strictEqual(delayed.kind, 'profit-attack');
  assert.strictEqual(delayed.shoot.skipped, true);
  assert.strictEqual(delayed.shoot.reason, 'afk-fire-delay-own-kill-before-near');
  assert.strictEqual(delayed.movement.reason, 'profit-afk-attack-approach');
  assert.strictEqual(shots.length, 0);
  assert.strictEqual(velocities.at(-1).dx, 1);

  const invulnerable = adapter.applyDecision(frame({
    ...target,
    invulnerable: true,
    invulnerable_remaining_ticks: 10
  }), action({
    userId: 41,
    x: 10000,
    y: 0,
    hp: 20,
    invulnerable: false
  }));
  assert.strictEqual(invulnerable.reason, 'profit-invulnerable-target-approach');
  assert.strictEqual(shots.length, 0);

  const near = {
    ...target,
    x: 900,
    hp: 3
  };
  const fired = adapter.applyDecision(frame(near), action({
    userId: 41,
    x: 10000,
    y: 0,
    hp: 100,
    invulnerable: false
  }));
  assert.strictEqual(fired.shoot.skipped, false);
  assert.strictEqual(fired.shoot.firePolicy.authorized, true);
  assert.strictEqual(fired.shoot.firePolicy.remainingHp, 3);
  assert.strictEqual(shots.length, 1);

  const missing = adapter.applyDecision({
    realtime: {
      tick: 2,
      self: frame(target).realtime.self,
      entities: [frame(target).realtime.self],
      bullets: []
    }
  }, action({ userId: 41, x: 900, y: 0, hp: 3 }));
  assert.strictEqual(missing.reason, 'profit-committed-target-missing-realtime');
  assert.strictEqual(shots.length, 1);

  let evidenceNow = 1000;
  const evidenceShots = [];
  const evidenceAdapter = createBrowserlessActionAdapter({
    userId: 7,
    now: () => evidenceNow,
    commandIntervalMs: 0,
    shootRepeatEnabled: false,
    afkAttackDynamicFireEnabled: true,
    afkAttackOwnDamageRateHpPerSec: 3,
    afkAttackExternalDamageRateHpPerSec: 2.05,
    transport: {
      sendVelocity() {
        return { ok: true };
      },
      sendShoot(x, y) {
        evidenceShots.push({ x, y });
        return { ok: true };
      }
    }
  });
  const externallyPressured = {
    ...target,
    hp: 45
  };
  const externalEvidence = evidenceAdapter.applyDecision(frame(externallyPressured, {
    tick: 20,
    receivedAtMs: evidenceNow,
    bullets: [{
      bullet_id: 901,
      owner_user_id: 9,
      start_x: 0,
      start_y: 0,
      dir_x: 1,
      dir_y: 0,
      created_tick: 0,
      speed_per_tick: 500
    }]
  }), action({ userId: 41, x: 10000, y: 0, hp: 100, invulnerable: false }));
  assert.strictEqual(externalEvidence.shoot.skipped, true);
  assert.strictEqual(externalEvidence.shoot.reason, 'afk-fire-delay-external-kill-before-near');
  assert.strictEqual(externalEvidence.shoot.firePolicy.externalBulletEvidenceCount, 1);
  assert.strictEqual(externalEvidence.shoot.firePolicy.externalDamageRateHpPerSec, 2.05);
  assert.strictEqual(evidenceShots.length, 0);

  const selfBulletShots = [];
  const selfBulletAdapter = createBrowserlessActionAdapter({
    userId: 7,
    now: () => 1500,
    commandIntervalMs: 0,
    shootRepeatEnabled: false,
    afkAttackDynamicFireEnabled: true,
    afkAttackOwnDamageRateHpPerSec: 3,
    afkAttackExternalDamageRateHpPerSec: 2.05,
    transport: {
      sendVelocity() {
        return { ok: true };
      },
      sendShoot(x, y) {
        selfBulletShots.push({ x, y });
        return { ok: true };
      }
    }
  });
  const selfBulletOnly = selfBulletAdapter.applyDecision(frame(externallyPressured, {
    tick: 20,
    receivedAtMs: 1500,
    bullets: [{
      bullet_id: 902,
      owner_id: 1,
      start_x: 0,
      start_y: 0,
      dir_x: 1,
      dir_y: 0,
      created_tick: 0,
      speed_per_tick: 500
    }]
  }), action({ userId: 41, x: 10000, y: 0, hp: 100, invulnerable: false }));
  assert.strictEqual(selfBulletOnly.shoot.firePolicy.externalBulletEvidenceCount, 0);
  assert.strictEqual(selfBulletOnly.shoot.firePolicy.externalDamageRateHpPerSec, 0);
  assert.strictEqual(selfBulletOnly.shoot.skipped, false);
  assert.strictEqual(selfBulletShots.length, 1);

  const ownDamageShots = [];
  let ownDamageNow = 2000;
  const ownDamageAdapter = createBrowserlessActionAdapter({
    userId: 7,
    now: () => ownDamageNow,
    commandIntervalMs: 0,
    combatShootMinIntervalMs: 1,
    shootRepeatEnabled: false,
    afkAttackDynamicFireEnabled: true,
    afkAttackOwnDamageRateHpPerSec: 3,
    afkAttackExternalDamageRateHpPerSec: 2.05,
    transport: {
      sendVelocity() {
        return { ok: true };
      },
      sendShoot(x, y) {
        ownDamageShots.push({ x, y });
        return { ok: true };
      }
    }
  });
  const ownDamageTarget = { ...target, x: 900, hp: 100 };
  const firstOwnShot = ownDamageAdapter.applyDecision(frame(ownDamageTarget, {
    tick: 40,
    receivedAtMs: ownDamageNow
  }), action({ userId: 41, x: 900, y: 0, hp: 100, invulnerable: false }));
  assert.strictEqual(firstOwnShot.shoot.skipped, false);
  assert.strictEqual(ownDamageShots.length, 1);
  ownDamageNow += 1000;
  const ownDamageObserved = ownDamageAdapter.applyDecision(frame({
    ...ownDamageTarget,
    hp: 97
  }, {
    tick: 60,
    receivedAtMs: ownDamageNow
  }), action({ userId: 41, x: 900, y: 0, hp: 100, invulnerable: false }));
  assert.strictEqual(ownDamageObserved.shoot.firePolicy.unexplainedExternalDamageRateHpPerSec, 0);
  assert.strictEqual(ownDamageObserved.shoot.firePolicy.externalDamageRateHpPerSec, 0);

  return {
    ok: true,
    cases: 7,
    velocityCount: velocities.length,
    shootCount: shots.length,
    evidenceShootCount: evidenceShots.length,
    ownDamageShootCount: ownDamageShots.length
  };
}

if (require.main === module) {
  try {
    process.stdout.write(JSON.stringify(runAfkDynamicFireSelfTest()) + '\n');
  } catch (error) {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  }
}

module.exports = { runAfkDynamicFireSelfTest };
