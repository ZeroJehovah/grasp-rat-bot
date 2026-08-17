'use strict';

const assert = require('assert');
const { createBrowserlessActionAdapter } = require('./action-adapter');

function runRemoteProfitActionSelfTest() {
  let velocityCount = 0;
  let shootCount = 0;
  const adapter = createBrowserlessActionAdapter({
    now: () => 1000,
    remoteProfitArrivalToleranceCm: 1000,
    transport: {
      sendVelocity() {
        velocityCount += 1;
        return { ok: true };
      },
      sendShoot() {
        shootCount += 1;
        return { ok: true };
      }
    }
  });
  const decision = {
    action: {
      kind: 'seek-remote-player',
      band: 'profit',
      target: {
        type: 'enemy',
        userId: 88,
        x: 5000,
        y: 0,
        authority: 'snapshot-navigation',
        remoteNavigationOnly: true
      }
    }
  };
  const result = adapter.applyDecision({ realtime: { tick: 1, self: { x: 0, y: 0 } } }, decision);
  assert.strictEqual(result.kind, 'velocity');
  assert.strictEqual(result.reason, 'seek-remote-player');
  assert.strictEqual(result.remoteNavigationOnly, true);
  assert.strictEqual(velocityCount, 1);
  assert.strictEqual(shootCount, 0);

  const arrived = adapter.applyDecision({ realtime: { tick: 2, self: { x: 4500, y: 0 } } }, decision);
  assert.strictEqual(arrived.kind, 'stop');
  assert.strictEqual(arrived.reason, 'remote-target-arrived');
  assert.strictEqual(shootCount, 0);

  const postKillVelocities = [];
  const postKillAdapter = createBrowserlessActionAdapter({
    now: () => 2000,
    commandIntervalMs: 0,
    transport: {
      sendVelocity(dx, dy) {
        postKillVelocities.push({ dx, dy });
        return { ok: true };
      }
    }
  });
  const postKillDecision = x => ({
    action: {
      kind: 'post-attack-drop-wait',
      band: 'profit',
      reason: 'post-kill-settlement-wait',
      target: { type: 'post-attack-target', id: 91, x, y: 0 }
    }
  });
  const insidePickup = postKillAdapter.applyDecision(
    { realtime: { tick: 3, self: { x: 0, y: 0 } } },
    postKillDecision(149)
  );
  const pickupBoundary = postKillAdapter.applyDecision(
    { realtime: { tick: 4, self: { x: 0, y: 0 } } },
    postKillDecision(150)
  );
  const outsidePickup = postKillAdapter.applyDecision(
    { realtime: { tick: 5, self: { x: 0, y: 0 } } },
    postKillDecision(151)
  );
  assert.strictEqual(insidePickup.vector.reason, 'target-reached');
  assert.strictEqual(pickupBoundary.vector.reason, 'target-reached');
  assert.strictEqual(outsidePickup.vector.ok, true);
  assert.strictEqual(outsidePickup.vector.distance, 151);
  assert.strictEqual(postKillVelocities.at(-1).dx, 1);

  return { ok: true, cases: 5, velocityCount, shootCount, postKillVelocityCount: postKillVelocities.length };
}

if (require.main === module) {
  try {
    process.stdout.write(JSON.stringify(runRemoteProfitActionSelfTest()) + '\n');
  } catch (error) {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  }
}

module.exports = { runRemoteProfitActionSelfTest };
