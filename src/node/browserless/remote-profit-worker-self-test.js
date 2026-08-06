'use strict';

const assert = require('assert');
const { EventEmitter } = require('events');
const {
  createRemoteProfitWorker,
  isRemoteProfitSnapshotEligible,
  remoteProfitRealtimeSelfFromLiveState
} = require('./remote-profit-worker');

function requestPayload(generationHint = 0) {
  return {
    generationHint,
    tick: generationHint,
    source: 'gap-http',
    observedAtMs: Date.now(),
    self: { user_id: 1, x: 0, y: 0 },
    entities: [{
      user_id: 10,
      entity_id: 100,
      x: 1000,
      y: 0,
      hp: 100,
      drop: 50,
      current_join_mode: 'Passive',
      stamina_1d_remaining_milli: 980,
      stamina_1d_limit_milli: 1000
    }],
    easyKillPlayers: [],
    whitelistUserIds: [],
    scoringOptions: {
      opportunityMoveStaminaPerCm: 1,
      opportunityShotStaminaCostMs: 1,
      opportunityExpectedDamagePerShot: 3
    },
    online: true
  };
}

async function runRemoteProfitWorkerSelfTest() {
  const events = [];
  const worker = createRemoteProfitWorker({
    enabled: true,
    now: () => Date.now(),
    onEvent: (type, detail) => events.push({ type, detail })
  });
  try {
    const first = await worker.publish(requestPayload(1));
    assert(first && first.candidates.length === 1);
    assert.strictEqual(first.generation, 1);
    const context = worker.context(Date.now());
    assert(context && context.candidates.length === 1);
    assert.strictEqual(worker.observeRealtimeEntities([{ user_id: 10 }]), 1);
    assert.strictEqual(worker.observeRealtimeEntities([]), 0);
    assert.deepStrictEqual(worker.context(Date.now()).realtimeSupersededIds, ['10'], 'realtime takeover remains permanent after disappearance');
    worker.observeDecision({ profit: { remoteProfit: { generation: 1, realtimeSupersededIds: [10], missSuppressedIds: [11] } } });
    const suppressed = worker.context(Date.now());
    assert.deepStrictEqual(suppressed.realtimeSupersededIds, ['10']);
    assert.deepStrictEqual(suppressed.missSuppressedIds, ['11']);
    const second = await worker.publish(requestPayload(2));
    assert(second && second.generation === 2);
    const reset = worker.context(Date.now());
    assert.deepStrictEqual(reset.realtimeSupersededIds, []);
    assert.deepStrictEqual(reset.missSuppressedIds, []);
    const status = worker.status(Date.now());
    assert.strictEqual(status.latestPublishedGeneration, 2);
    assert(status.completed >= 2);
    if (process.platform === 'linux') assert(Number(status.workerNice) >= 10);
    assert(events.some(event => event.type === 'published'));
    assert.strictEqual(isRemoteProfitSnapshotEligible(
      'gap-http', { global: true }, true, { authority: 'realtime', x: 0, y: 0 }
    ), true);
    for (const detail of [
      { source: 'ws', detail: { global: true } },
      { source: 'gap-http', detail: { global: false } },
      { source: 'pre-login', detail: { global: true } },
      { source: 'exit-verification', detail: { global: true } }
    ]) {
      assert.strictEqual(isRemoteProfitSnapshotEligible(
        detail.source, detail.detail, true, { authority: 'realtime', x: 0, y: 0 }
      ), false, `lifecycle source must not publish: ${detail.source}`);
    }
    assert.strictEqual(isRemoteProfitSnapshotEligible(
      'gap-http', { global: true }, false, { authority: 'realtime', x: 0, y: 0 }
    ), false);
    assert.strictEqual(isRemoteProfitSnapshotEligible(
      'gap-http', { global: true }, true, { authority: 'snapshot', x: 0, y: 0 }
    ), false);
    assert.strictEqual(isRemoteProfitSnapshotEligible(
      'gap-http', { global: true }, true, { authority: 'realtime', x: null, y: 0 }
    ), false);
    const runnerSelf = remoteProfitRealtimeSelfFromLiveState({
      current: {
        self: {
          authority: 'realtime',
          userId: 7,
          x: 123,
          y: 456,
          hp: 88
        }
      }
    }, 1);
    assert.strictEqual(runnerSelf.authority, 'realtime');
    assert.strictEqual(isRemoteProfitSnapshotEligible('gap-http', { global: true }, true, runnerSelf), true);
    assert.strictEqual(remoteProfitRealtimeSelfFromLiveState({
      current: { self: { authority: 'realtime', x: null, y: 0 } }
    }, 1), null);
    const busyPending = worker.publish(requestPayload(3));
    const busyImmediate = await worker.publish(requestPayload(4));
    assert.strictEqual(busyImmediate, null);
    await busyPending;
    return { ok: true, cases: 17, status };
  } finally {
    await worker.close();
  }
}

function fakeWorkerFactory(mode, clock, calls) {
  return () => {
    calls.count += 1;
    const worker = new EventEmitter();
    worker.unref = () => {};
    worker.terminate = async () => { worker.terminated = true; };
    setImmediate(() => worker.emit('message', { kind: 'ready' }));
    worker.postMessage = message => {
      if (message.kind !== 'evaluate') return;
      if (mode === 'hang') return;
      if (mode === 'crash') {
        setImmediate(() => worker.emit('error', new Error('fake-crash')));
        return;
      }
      setImmediate(() => worker.emit('message', {
        kind: 'result',
        id: message.id,
        result: {
          generation: message.request.generation,
          source: message.request.source,
          observedAtMs: message.request.observedAtMs,
          candidates: [],
          diagnostics: {}
        },
        computeMs: 0
      }));
    };
    return worker;
  };
}

async function runRemoteProfitWorkerLifecycleSelfTest() {
  let clock = 1000;
  const calls = { count: 0 };
  const timeoutWorker = createRemoteProfitWorker({
    now: () => clock,
    timeoutMs: 20,
    workerFactory: fakeWorkerFactory('hang', () => clock, calls)
  });
  const timedOut = await timeoutWorker.publish(requestPayload(1));
  assert.strictEqual(timedOut, null);
  assert.strictEqual(timeoutWorker.status(clock).timeouts, 1);
  assert.strictEqual(timeoutWorker.context(clock), null);
  await timeoutWorker.close();

  const crashCalls = { count: 0 };
  const crashWorker = createRemoteProfitWorker({
    now: () => clock,
    timeoutMs: 100,
    workerFactory: fakeWorkerFactory('crash', () => clock, crashCalls)
  });
  assert.strictEqual(await crashWorker.publish(requestPayload(2)), null);
  assert.strictEqual(crashWorker.status(clock).failed, true);
  assert.match(crashWorker.status(clock).lastError, /fake-crash/);
  await crashWorker.close();

  const graceCalls = { count: 0 };
  const graceWorker = createRemoteProfitWorker({
    now: () => clock,
    workerFactory: fakeWorkerFactory('respond', () => clock, graceCalls)
  });
  const first = await graceWorker.publish(requestPayload(3));
  assert(first && first.generation === 1);
  const pending = graceWorker.publish(requestPayload(4));
  clock += 1000;
  assert(graceWorker.context(clock), 'old batch remains inside pending grace');
  clock += 5001;
  assert.strictEqual(graceWorker.context(clock), null, 'old batch expires after pending grace');
  await pending;
  const ttl = graceWorker.status(clock);
    assert.strictEqual(ttl.latestRequestedGeneration, 2);
  assert.strictEqual(graceWorker.context(Date.parse(ttl.expiresAt)), null, 'hard TTL expires at the boundary');
  await graceWorker.close();

  const rebuildCalls = { count: 0 };
  const rebuildWorkers = [];
  const rebuildWorker = createRemoteProfitWorker({
    now: () => clock,
    timeoutMs: 100,
    workerFactory: (() => {
      let first = true;
      return () => {
        const mode = first ? 'crash' : 'respond';
        first = false;
        const instance = fakeWorkerFactory(mode, () => clock, rebuildCalls)();
        rebuildWorkers.push(instance);
        return instance;
      };
    })()
  });
  assert.strictEqual(await rebuildWorker.publish(requestPayload(5)), null);
  const rebuilt = await rebuildWorker.publish(requestPayload(6));
  assert(rebuilt && rebuilt.generation === 2, 'worker rebuild should recover on next generation');
  assert.strictEqual(rebuildCalls.count, 2);
  const recoveredContext = rebuildWorker.context(clock);
  rebuildWorkers[0].emit('exit', 1);
  assert.strictEqual(rebuildWorker.status(clock).failed, false);
  assert.deepStrictEqual(rebuildWorker.context(clock), recoveredContext);
  await rebuildWorker.close();
  const disabledWorker = createRemoteProfitWorker({ enabled: false, now: () => clock });
  assert.strictEqual(await disabledWorker.publish(requestPayload(7)), null);
  assert.strictEqual(disabledWorker.status(clock).latestRequestedGeneration, 0);
  await disabledWorker.close();
  return {
    ok: true,
    cases: 13,
    timeoutWorkerCalls: calls.count,
    crashWorkerCalls: crashCalls.count,
    graceWorkerCalls: graceCalls.count,
    rebuildWorkerCalls: rebuildCalls.count
  };
}

if (require.main === module) {
  Promise.all([runRemoteProfitWorkerSelfTest(), runRemoteProfitWorkerLifecycleSelfTest()])
    .then(results => process.stdout.write(JSON.stringify({
      ok: results.every(result => result.ok),
      cases: results.reduce((sum, result) => sum + result.cases, 0),
      basic: results[0],
      lifecycle: results[1]
    }) + '\n'))
    .catch(error => {
      process.stderr.write(`${error.stack || error}\n`);
      process.exitCode = 1;
    });
}

module.exports = { runRemoteProfitWorkerSelfTest, runRemoteProfitWorkerLifecycleSelfTest };
