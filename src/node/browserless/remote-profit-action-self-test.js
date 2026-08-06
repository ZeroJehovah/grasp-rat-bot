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
  return { ok: true, cases: 2, velocityCount, shootCount };
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
