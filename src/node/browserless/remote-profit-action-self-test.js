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

  const continuationScenario = persistentCandidateEligible => {
    let atMs = 1000;
    let timerId = 1;
    const timers = [];
    const velocities = [];
    const continuationAdapter = createBrowserlessActionAdapter({
      now: () => atMs,
      commandIntervalMs: 0,
      getTransportHealth: () => ({
        connected: true,
        exit: {},
        frameLoss: { rate: 0, expectedTicks: 0 },
        latency: { p90Ms: 100 },
        processingQueue: { p90Ms: 10 },
        frames: { lastAgeMs: 50 }
      }),
      setTimeout(callback, delayMs) {
        const id = timerId++;
        timers.push({ id, callback, delayMs });
        return id;
      },
      clearTimeout() {},
      transport: {
        sendVelocity(dx, dy, reason) {
          velocities.push({ dx, dy, reason });
          return { ok: true };
        }
      }
    });
    const fallbackCoin = { drop_id: 500, amount: 5000, x: 100, y: 0 };
    const stateSnapshot = (tick, selfX, receivedAtMs) => ({
      command: { movement: { timing: { exactReady: true, p90WallMs: 100, exactSampleCount: 4 } } },
      realtime: {
        tick,
        frameAgeMs: 0,
        receivedAtMs,
        self: { x: selfX, y: 0, vx: 0, vy: 0 },
        coinDrops: [],
        coinDropsObserved: true
      },
      fallback: {
        tick: 900,
        frameAgeMs: 20000,
        receivedAtMs: receivedAtMs - 20000,
        coinDrops: [fallbackCoin],
        coinDropsObserved: true
      }
    });
    const target = {
      type: 'coin',
      id: 500,
      drop_id: 500,
      key: 'id:500',
      x: 100,
      y: 0,
      amount: 5000,
      authority: 'snapshot',
      snapshotOnly: true,
      persistentCandidateEligible
    };
    const firstDecision = {
      action: { kind: 'seek-coin', band: 'profit', reason: 'persistent-snapshot-coin', target }
    };
    const first = continuationAdapter.applyDecision(stateSnapshot(1, 0, 1000), firstDecision);
    const pulseTimer = timers.find(timer => timer.delayMs === first.precisionPulseMs);
    assert.ok(pulseTimer, 'near-coin continuation schedules a precision-pulse stop');
    atMs += pulseTimer.delayMs;
    pulseTimer.callback();
    atMs = 1100;
    const continued = continuationAdapter.continueCloseCoinPickup(stateSnapshot(2, 50, 1100));
    return {
      first,
      continued,
      velocities,
      nearCoinContinuation: continuationAdapter.getState().nearCoinContinuation
    };
  };

  const persistentContinuation = continuationScenario(true);
  assert.strictEqual(persistentContinuation.continued?.ok, true);
  assert.strictEqual(Number(persistentContinuation.continued?.target?.drop_id), 500);
  assert.strictEqual(persistentContinuation.continued?.nearCoinContinuation?.pulseCount, 2);
  const ordinarySnapshotContinuation = continuationScenario(false);
  assert.strictEqual(ordinarySnapshotContinuation.continued, null);
  assert.strictEqual(ordinarySnapshotContinuation.nearCoinContinuation, null);

  return { ok: true, cases: 7, velocityCount, shootCount, postKillVelocityCount: postKillVelocities.length };
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
