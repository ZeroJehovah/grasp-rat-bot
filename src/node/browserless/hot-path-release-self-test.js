'use strict';

const assert = require('node:assert/strict');
const {
  completeCallbackValidationErrors,
  createBenchmarkFrameClock
} = require('../../../scripts/benchmark-browserless-hot-path');
const { createTransportHealthMonitor } = require('./transport-health');
const { createBrowserlessDecisionAdapter } = require('./decision-adapter');
const { createBrowserlessRealtimeControlWorker } = require('./realtime-control-worker');

async function runHotPathReleaseSelfTest() {
  const results = [];
  const check = (name, assertion) => {
    assertion();
    results.push({ name, ok: true });
  };
  let elapsedMs = 0;
  const tick = createBenchmarkFrameClock(100, () => elapsedMs);
  check('5ms stress frames retain the native 50ms tick', () => {
    assert.deepEqual([0, 5, 49, 50, 51, 99, 100].map(at => {
      elapsedMs = at;
      return tick();
    }), [100, 100, 100, 101, 101, 101, 102]);
  });
  check('timer delays advance tick from elapsed time without regressions', () => {
    elapsedMs = 299;
    assert.equal(tick(), 105);
    elapsedMs = 280;
    assert.equal(tick(), 105);
    elapsedMs = 5000;
    assert.equal(tick(), 200);
  });
  const monitor = corrected => {
    let atMs = 1000000;
    const frameTick = createBenchmarkFrameClock(100, () => atMs);
    const health = createTransportHealthMonitor();
    health.setConnected(true, atMs);
    let triggered = false;
    let maxP90Ms = 0;
    for (let index = 0; index <= 1000; index++) {
      atMs = 1000000 + index * 5;
      health.observeFrame({ decodedType: 'pos', decodedTick: corrected ? frameTick() : 100 + index }, {
        receivedAtMs: atMs
      });
      const status = health.assess({ nowMs: atMs, combatActive: true, selfHp: 100 });
      triggered ||= status.exit.triggered;
      maxP90Ms = Math.max(maxP90Ms, status.latency.critical.p90Ms || 0);
    }
    return { triggered, maxP90Ms };
  };
  check('old accelerated tick reproduces a false latency exit', () => {
    const old = monitor(false);
    assert.equal(old.triggered, true);
    assert.ok(old.maxP90Ms > 6000);
  });
  check('corrected stress clock completes without artificial latency', () => {
    const current = monitor(true);
    assert.equal(current.triggered, false);
    assert.equal(current.maxP90Ms, 0);
  });
  const valid = { ok: true, measurementWindow: { durationMs: 5000 } };
  check('a full successful callback window passes', () => {
    assert.deepEqual(completeCallbackValidationErrors(valid, 5000), []);
  });
  check('an early exit cannot pass on sufficient callback counts', () => {
    assert.deepEqual(completeCallbackValidationErrors({
      ok: false, error: 'realtime-transport-critical-latency',
      realtimeControlCount: 90, measurementWindow: { durationMs: 4999 }
    }, 5000), ['canary-failed:realtime-transport-critical-latency', 'callback-window-incomplete']);
  });
  check('missing duration and full-duration failure remain failures', () => {
    assert.deepEqual(completeCallbackValidationErrors({ ok: true }, 5000), ['callback-window-incomplete']);
    assert.deepEqual(completeCallbackValidationErrors({ ...valid, ok: false, error: 'test' }, 5000), ['canary-failed:test']);
  });

  const adapter = createBrowserlessDecisionAdapter({ userId: 7 });
  const worker = createBrowserlessRealtimeControlWorker({ userId: 7 });
  try {
    await worker.ready();
    const decision = {
      tick: 50,
      action: { band: 'combat', target: { user_id: 8, name: 'target', hp: 80, drop: 12, x: 1000, y: 0 } },
      combat: { metrics: { engagementGeneration: 'engagement-a' } }
    };
    const action = {
      kind: 'combat-live',
      shoot: { ok: true, command: { engagementGeneration: 'engagement-a', controlGeneration: 'control-a' } }
    };
    adapter.observeActionResult(action, decision, { nowMs: 1000 });
    assert.equal(worker.observeActionResult(action, decision, { nowMs: 1000 }), true);
    decision.action.target.hp = 1;
    action.shoot.command.engagementGeneration = 'mutated-after-post';
    await worker.flush();
    let remote = (await worker.requestPersistence()).persistenceState;
    check('action feedback preserves history and generation across the Worker', () => {
      assert.deepEqual(remote.attackHistory, adapter.getRealtimePersistenceState().attackHistory);
      assert.deepEqual(remote.combatMetrics, adapter.getRealtimePersistenceState().combatMetrics);
      assert.equal(remote.attackHistory[0].hp, 80);
      assert.equal(remote.combatMetrics.engagementGeneration, 'engagement-a');
    });
    const exit = { action: { kind: 'leave', shouldLeave: true } };
    const skipped = { kind: 'combat-live', shoot: { ok: true, skipped: true } };
    adapter.observeActionResult(skipped, exit, { nowMs: 1200 });
    worker.observeActionResult(skipped, exit, { nowMs: 1200 });
    await worker.flush();
    remote = (await worker.requestPersistence()).persistenceState;
    check('skipped shots and exit dispatch preserve feedback behavior', () => {
      assert.equal(remote.attackHistory.length, 1);
      assert.equal(remote.combatMetrics.stopDispatchAt, 1200);
      assert.deepEqual(remote.combatMetrics, adapter.getRealtimePersistenceState().combatMetrics);
    });
  } finally {
    await worker.close();
  }
  return { ok: true, cases: results.length, results };
}

if (require.main === module) {
  runHotPathReleaseSelfTest().then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => { console.error(error); process.exitCode = 1; });
}

module.exports = { runHotPathReleaseSelfTest };
