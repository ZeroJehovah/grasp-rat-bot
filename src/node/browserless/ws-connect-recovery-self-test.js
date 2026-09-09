'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { runReadOnlyCanary } = require('./canary');
const { createSourceIpController } = require('./source-ip-controller');
const { openBrowserlessWs, createWebSocketConnectAbortError } = require('./ws-transport');
const { browserlessLoopPlan } = require('./runner');
const { createBrowserlessSafetyController } = require('./safety-controller');
const { normalizePendingExit, pendingExitFromCanary, pendingExitSnapshotResolution } = require('./pending-exit-recovery');

async function runWsConnectRecoverySelfTest() {
  const results = [];
  const check = (name, condition) => {
    assert.ok(condition, name);
    results.push({ name, ok: true });
  };
  let atMs = Date.UTC(2026, 8, 8, 2, 33, 25);
  const config = {
    gameOrigin: 'http://127.0.0.1:1', userId: 7, sessionToken: 'offline-test-only',
    readOnlyProbeMs: 1000, wsConnectTimeoutMs: 1, httpTimeoutMs: 1,
    targetWhitelistUrl: '', targetWhitelistFile: '', loopDelayMs: 30000
  };
  const healthyState = { loginPointSafety: { point: { x: 100, y: 200, hp: 100, source: 'test' } } };
  const absentSnapshot = {
    ok: true, reason: 'safe', satisfied: true,
    response: { summary: { valid: true, selfPresent: false, freshness: { ok: true } } }
  };
  const confirmedLeave = () => ({
    ok: true, attempts: [{ ok: true, status: 200, response: { ok: true, event: 'left', hp: 100 } }]
  });
  const failedLeave = () => ({ ok: false, error: 'request timeout', attempts: [{ ok: false, status: 502 }] });

  // Real timeout and close-event ordering, but no socket/network is created.
  class HangingSocket extends EventEmitter {
    constructor() { super(); this.readyState = 0; }
    close() {
      this.readyState = 3;
      this.emit('error', new Error('WebSocket was closed before the connection was established'));
      this.emit('close', 1006, '');
    }
  }
  const controller = createSourceIpController({
    config: { sourceIp: '127.0.0.1' },
    openBrowserlessWs: options => openBrowserlessWs({
      ...options, runtime: { name: 'offline-test', WebSocket: HangingSocket, supportsOptions: false }
    })
  });
  let timeout;
  try { await controller.openBrowserlessWs({ ...config, connectTimeoutMs: 1 }); }
  catch (error) { timeout = error; }
  check('timeout survives synchronous socket-close error', timeout?.message === 'websocket connect timeout');
  check('timeout retains typed code and original attempt', timeout?.code === 'websocket-connect-timeout'
    && timeout.attempts?.[0]?.error === 'websocket connect timeout');
  check('unwrapped timeout keeps fast loop classification', browserlessLoopPlan({
    canary: { error: timeout.message }
  }, config).delayMs === 1000);

  async function attempt(options = {}) {
    let leaveCalls = 0, openCalls = 0, fetchCalls = 0, signal = null;
    const events = [];
    const result = await runReadOnlyCanary(config, {
      now: () => atMs,
      safetyController: options.safetyController,
      persistedState: options.state || healthyState,
      ...(options.snapshot ? { precheckedSnapshotSafety: options.snapshot } : {}),
      fetchImpl: async () => { fetchCalls += 1; throw new Error('unexpected HTTP in offline test'); },
      logStore: { append: (stream, type, detail) => events.push({ stream, type, detail }) },
      openBrowserlessWs: async wsOptions => {
        openCalls += 1;
        signal = wsOptions.signal;
        if (options.onOpenAttempt) options.onOpenAttempt(wsOptions);
        throw options.error || timeout;
      },
      leaveWithVerification: async leaveOptions => {
        leaveCalls += 1;
        if (options.onLeave) return options.onLeave({ leaveCalls, signal, leaveOptions });
        return options.failLeave ? failedLeave() : confirmedLeave();
      }
    });
    return { result, leaveCalls, openCalls, fetchCalls, signal, events };
  }

  const recovered = await attempt();
  check('healthy HP exemption still performs no pre-login HTTP', recovered.fetchCalls === 0
    && recovered.result.snapshotSafety.reason === 'login-point-self-hp-exempt');
  check('zero frames and no self still dispatch protected leave', recovered.openCalls === 1
    && recovered.result.stats.frameCount === 0 && !recovered.result.entry.firstSelf
    && recovered.leaveCalls === 1 && recovered.result.leave.ok);
  check('failed attempt is cancelled before completion', recovered.signal?.aborted === true);
  check('uncertainty is explicit, not invented self authority', recovered.result.safety.event?.reason === 'ws-connect-unconfirmed-leave'
    && recovered.result.safety.event.selfAuthorityMissing === true
    && recovered.result.safety.leavePending.entryUnconfirmed === true
    && recovered.result.actions.sentCount === 0);
  check('HTTP confirmation emits a terminal recovery outcome', recovered.events.some(e =>
    e.type === 'exit-recovery-outcome' && e.detail.outcome === 'confirmed-absent' && e.detail.authority === 'HTTP'));
  check('confirmed recovery clears pending and uses fast loop', pendingExitFromCanary(null, recovered.result, atMs) === null
    && browserlessLoopPlan({ canary: recovered.result }, config).delayMs === 1000);

  const priorAbsent = await attempt({ snapshot: absentSnapshot });
  check('pre-upgrade snapshot absence cannot waive post-upgrade cleanup', priorAbsent.leaveCalls === 1);
  const earlyClose = await attempt({ error: new Error('WebSocket was closed before the connection was established') });
  check('legacy early-close error also enters protected leave', earlyClose.leaveCalls === 1);
  const upstreamFailure = await attempt({ error: new Error('websocket unexpected response 502 Bad Gateway') });
  check('gateway failure does not prove absence at origin', upstreamFailure.leaveCalls === 1);

  const challenge = new Error('Cloudflare challenge detected');
  challenge.connectionFailure = { type: 'cloudflare-challenge', source: 'ws-response', status: 403 };
  for (const error of [challenge, new Error('websocket unexpected response 403 Forbidden')]) {
    const rejected = await attempt({ snapshot: absentSnapshot, error });
    check(`${error.message}: explicit rejection without self avoids leave`, rejected.leaveCalls === 0
      && pendingExitFromCanary(null, rejected.result, atMs) === null);
  }

  // A failed leave must survive all subsequent zero-frame retries, fresh-looking
  // cached absence, observed presence, errors, and pending-chain expiry.
  const stranded = await attempt({ failLeave: true });
  let pending = pendingExitFromCanary(null, stranded.result, atMs);
  check('zero-frame unconfirmed leave persists', pending?.entryUnconfirmed === true && pending.httpStatuses.join(',') === '502');
  check('persistence preserves unknown HP, not zero/death', pending.startHp === null && pending.minHp === null && pending.lastHp === null);
  check('fresh-looking cached absence cannot clear unconfirmed entry', pendingExitSnapshotResolution(pending, absentSnapshot).active === true);
  const originalId = pending.exitAttemptId;
  for (let index = 0; index < 12; index += 1) {
    atMs += index === 11 ? 3600001 : 41000;
    const snapshot = index === 5
      ? { ...absentSnapshot, response: { summary: { selfPresent: true, self: { hp: 100 }, freshness: { ok: true } } } }
      : (index % 3 === 0 ? { ok: false, reason: 'snapshot-error', error: 'request timeout' } : absentSnapshot);
    const next = await attempt({ state: { ...healthyState, runner: { pendingExit: pending } }, snapshot, failLeave: true });
    pending = pendingExitFromCanary(pending, next.result, atMs);
    next.result.pendingExit = pending;
    check(`retry ${index + 1} cannot open WS and retains protected exit`, next.openCalls === 0
      && next.leaveCalls === 1 && pending?.entryUnconfirmed === true
      && browserlessLoopPlan({ canary: next.result }, config).reason === 'exit-recovery');
    check(`retry ${index + 1} preserves unknown HP`, pending.startHp === null
      && pending.lastHp === null && pending.minHp === null);
  }
  check('presence/expiry renews rather than discards protected chain', pending.exitAttemptId !== originalId);
  const terminal = await attempt({ state: { ...healthyState, runner: { pendingExit: pending } }, snapshot: absentSnapshot });
  check('only confirmed leave releases the recovered zero-frame chain', terminal.openCalls === 0
    && terminal.leaveCalls === 1 && terminal.result.leave.ok
    && pendingExitFromCanary(pending, terminal.result, atMs) === null);
  const ordinaryPending = normalizePendingExit({ ...pending, entryUnconfirmed: false }, atMs);
  check('ordinary exit retains fresh-snapshot absence behavior', pendingExitSnapshotResolution(ordinaryPending, absentSnapshot).cleared === true);

  let pendingWs;
  const lateOpen = await attempt({
    onOpenAttempt: wsOptions => { pendingWs = wsOptions; },
    onLeave: ({ leaveCalls, signal }) => {
      if (leaveCalls === 1) {
        assert.equal(signal.aborted, true, 'cancel before protective leave dispatch');
        pendingWs.onAbortedOpen({ runtime: 'offline-test' });
      }
      return confirmedLeave();
    }
  });
  check('late open after failed attempt reasserts leave without publication', lateOpen.leaveCalls === 2
    && lateOpen.result.safety.transportLifecycle.reassertLeave?.ok === true
    && !lateOpen.events.some(e => e.type === 'canary-ws-open'));
  const cancelled = await attempt({ error: createWebSocketConnectAbortError('leave-confirmed') });
  check('abort error alone is not terminal absence authority', cancelled.leaveCalls === 1);

  async function openedAttempt(options = {}) {
    let wsOptions, leaveCalls = 0, closed = false, waits = 0;
    const events = [];
    const result = await runReadOnlyCanary({
      ...config, readOnlyProbeMs: 2000, noSelfGraceMs: 500, ...options.config
    }, {
      now: () => atMs,
      sleep: async ms => {
        atMs += ms;
        waits += 1;
        if (options.onWait) options.onWait(wsOptions, waits);
      },
      persistedState: healthyState,
      fetchImpl: async () => { throw new Error('unexpected HTTP in opened-transport test'); },
      logStore: { append: (stream, type, detail) => events.push({ stream, type, detail }) },
      openBrowserlessWs: async value => {
        wsOptions = value;
        value.onOpen?.({ runtime: 'offline-test' });
        return { readyState: 1, isOpen: () => !closed, close: () => { closed = true; } };
      },
      leaveWithVerification: async () => {
        leaveCalls += 1;
        return options.failLeave ? failedLeave() : confirmedLeave();
      }
    });
    return { result, leaveCalls, closed, events };
  }

  for (const scenario of [
    { name: 'silent opened socket' },
    { name: 'probe ends before first-self grace', config: { noSelfGraceMs: 10000 } },
    { name: 'frames without self', onWait: ws => ws.onMessage(JSON.stringify({ type: 'pos', tick: 100, entities: [], bullets: [] })) },
    { name: 'early socket close', onWait: (ws, n) => { if (n === 1) ws.onClose({ code: 1006 }); } },
    { name: 'early socket error', onWait: (ws, n) => { if (n === 1) ws.onError({ message: 'connection lost' }); } }
  ]) {
    const opened = await openedAttempt(scenario);
    check(`${scenario.name} verifies exit before releasing transport`, opened.leaveCalls === 1
      && opened.result.leave?.ok === true && opened.closed);
    check(`${scenario.name} retains uncertainty without inventing self`, !opened.result.entry.firstSelf
      && opened.result.safety.leavePending?.entryUnconfirmed === true
      && opened.result.actions.sentCount === 0);
    check(`${scenario.name} permits recovery after HTTP confirmation`, pendingExitFromCanary(null, opened.result, atMs) === null);
  }
  const unobservedOpen = await openedAttempt({ failLeave: true });
  const unobservedPending = pendingExitFromCanary(null, unobservedOpen.result, atMs);
  check('opened-socket failed exit remains persisted despite zero frames', unobservedPending?.entryUnconfirmed === true
    && pendingExitSnapshotResolution(unobservedPending, absentSnapshot).active === true);

  const knownSession = await openedAttempt({
    onWait: (ws, n) => ws.onMessage(JSON.stringify({
      type: 'pos', tick: 100 + n,
      entities: n === 1 ? [{ entity_id: 1, user_id: 7, x: 0, y: 0, hp: 100 }] : [], bullets: []
    }))
  });
  check('established-session disappearance retains no-self recovery', knownSession.result.entry.firstSelf
    && knownSession.result.safety.event?.reason === 'no-self'
    && knownSession.result.safety.event?.shouldLeave === false && knownSession.leaveCalls === 0);

  const stopController = createBrowserlessSafetyController({ now: () => atMs });
  let knownPendingWs;
  const reassertFailed = await attempt({
    safetyController: stopController,
    snapshot: { ...absentSnapshot, response: { summary: { selfPresent: true, freshness: { ok: true } } } },
    onOpenAttempt: ws => {
      knownPendingWs = ws;
      stopController.requestStop('explicit-stop');
      ws.onMessage(JSON.stringify({ type: 'pos', tick: 100,
        entities: [{ entity_id: 1, user_id: 7, x: 0, y: 0, hp: 85 }], bullets: [] }), { coalescedDispatch: true });
    },
    onLeave: ({ leaveCalls }) => {
      if (leaveCalls === 1) {
        knownPendingWs.onAbortedOpen({ runtime: 'offline-test' });
        return confirmedLeave();
      }
      return failedLeave();
    }
  });
  const reassertPending = pendingExitFromCanary(null, reassertFailed.result, atMs);
  check('failed reassertion after a known session creates a new uncertain chain', reassertFailed.leaveCalls === 2
    && reassertFailed.result.entry.firstSelf && reassertPending?.entryUnconfirmed === true
    && reassertPending.originalReason === 'post-leave-ws-open');
  check('prior-session absence cannot clear failed late-open reassertion', pendingExitSnapshotResolution(reassertPending, absentSnapshot).active === true);

  return { ok: true, cases: results.length, results };
}

if (require.main === module) {
  runWsConnectRecoverySelfTest().then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => { console.error(error); process.exitCode = 1; });
}

module.exports = { runWsConnectRecoverySelfTest };
