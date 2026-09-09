'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const { fetchWithTimeout, readResponseBody } = require('./session-client');
const { createBrowserlessLeaveSupervisor } = require('./leave-supervisor');
const { createSnapshotRequestScheduler } = require('./snapshot-request-scheduler');

async function runSessionClientSelfTest() {
  const results = [];
  const check = (name, condition) => results.push({ name, ok: Boolean(condition) });
  const sockets = new Set();
  let leaveRequests = 0;
  let leaveMode = 'recover';
  let queuedRequests = 0;
  let notifyQueueReady;
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    let mode = pathname.slice(1);
    if (mode === 'queue-hold') {
      queuedRequests += 1;
      if (queuedRequests === 4) notifyQueueReady?.();
      return;
    }
    if (mode === 'leave') {
      leaveRequests += 1;
      mode = leaveMode === 'fail' ? 'trickle'
        : (leaveRequests === 1 ? 'trickle' : (leaveRequests === 2 ? 'forbidden' : 'left'));
    }
    if (mode === 'headers') return;
    response.setHeader('content-type', 'application/json');
    if (mode === 'truncated') {
      response.setHeader('content-length', '1000');
      response.write('{');
      const timer = setTimeout(() => response.destroy(), 10);
      response.once('close', () => clearTimeout(timer));
    } else if (mode === 'trickle' || mode === 'stall') {
      response.write('{');
      if (mode === 'trickle') {
        const timer = setInterval(() => response.write(' '), 10);
        response.once('close', () => clearInterval(timer));
      }
    } else if (mode === 'redirect') {
      response.writeHead(302, { location: '/ok' });
      response.end('redirect');
    } else if (mode === 'forbidden') {
      response.writeHead(403, { 'cf-mitigated': 'challenge' });
      response.end('{"error":"forbidden"}');
    } else {
      response.end(request.method === 'HEAD' ? ''
        : (mode === 'left' ? '{"event":"left"}' : '{"ok":true}'));
    }
  });
  server.on('connection', socket => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const gameOrigin = `http://127.0.0.1:${server.address().port}`;
  const timeoutMs = 120;
  async function boundedOutcome(promise) {
    let timer;
    try {
      return await Promise.race([
        promise.then(value => ({ value }), error => ({ error })),
        new Promise(resolve => { timer = setTimeout(() => resolve({ hung: true }), 1200); })
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  let supervisor;
  try {
    for (const [name, transport] of [
      ['bound', { localAddress: '127.0.0.1' }],
      ['fetch', { fetchImpl: globalThis.fetch }]
    ]) {
      for (const mode of ['headers', 'truncated', 'stall', 'trickle']) {
        const result = await boundedOutcome((async () => {
          const response = await fetchWithTimeout(`${gameOrigin}/${mode}`, {
            ...transport, timeoutMs: mode === 'truncated' ? 2000 : timeoutMs
          });
          return readResponseBody(response);
        })());
        check(`${name} ${mode} settles as a failure`, result.error instanceof Error);
        for (const socket of sockets) socket.destroy();
      }
      const response = await fetchWithTimeout(`${gameOrigin}/ok`, { ...transport, timeoutMs });
      await new Promise(resolve => setTimeout(resolve, 150));
      const body = await readResponseBody(response);
      check(`${name} completed JSON and headers survive their deadline`, response.ok && response.status === 200
        && response.headers.get('content-type') === 'application/json' && body.json.ok === true);
      const head = await fetchWithTimeout(`${gameOrigin}/ok`, { ...transport, method: 'HEAD', timeoutMs: 2000 });
      check(`${name} empty HEAD completes`, head.ok && await head.text() === '');
      const redirect = await fetchWithTimeout(`${gameOrigin}/redirect`, { ...transport, redirect: 'manual', timeoutMs: 2000 });
      check(`${name} manual redirect metadata survives`, redirect.status === 302
        && redirect.headers.get('location') === '/ok');
      const forbidden = await fetchWithTimeout(`${gameOrigin}/forbidden`, { ...transport, timeoutMs: 2000 });
      check(`${name} HTTP rejection body and challenge headers survive`, !forbidden.ok
        && forbidden.status === 403 && forbidden.headers.get('cf-mitigated') === 'challenge'
        && (await readResponseBody(forbidden)).json.error === 'forbidden');
    }
    const queueReady = new Promise(resolve => { notifyQueueReady = resolve; });
    const occupied = Array.from({ length: 4 }, () => fetchWithTimeout(`${gameOrigin}/queue-hold`, {
      localAddress: '127.0.0.1', timeoutMs: 2000
    }).catch(error => error));
    await boundedOutcome(queueReady);
    check('pooled test fills all four sockets', queuedRequests === 4);
    const queued = await boundedOutcome(fetchWithTimeout(`${gameOrigin}/ok`, {
      localAddress: '127.0.0.1', timeoutMs
    }));
    check('request waiting for pooled socket obeys total deadline', queued.error instanceof Error);
    for (const socket of sockets) socket.destroy();
    await Promise.all(occupied);

    for (const phase of ['headers', 'body']) {
      let signal;
      const outcome = await boundedOutcome(fetchWithTimeout(`${gameOrigin}/unused`, {
        timeoutMs,
        fetchImpl: async (_url, options) => {
          signal = options.signal;
          if (phase === 'headers') return new Promise(() => {});
          return { ok: true, status: 200, text: () => new Promise(() => {}) };
        }
      }));
      check(`uncooperative fetch ${phase} cannot outlive deadline`, outcome.error instanceof Error && signal.aborted);
    }

    supervisor = createBrowserlessLeaveSupervisor();
    await supervisor.ready();
    const leaveOptions = {
      gameOrigin, userId: 7, sessionToken: 'local-http-self-test-only',
      localAddress: '127.0.0.1', timeoutMs, retryMax: 2, hedgeDelayMs: 25, retryDelayMs: 0
    };
    const recovered = await boundedOutcome(supervisor.leave(leaveOptions));
    check('leave worker retries after initial drip and rejected hedge', recovered.value?.ok
      && recovered.value.attempts.length === 3 && leaveRequests === 3);
    leaveMode = 'fail';
    const failed = await boundedOutcome(supervisor.leave({ ...leaveOptions, retryMax: 1 }));
    check('leave worker returns unconfirmed after bounded failures', failed.value?.ok === false
      && failed.value.attempts.length === 2 && supervisor.status().pending === 0);
    leaveMode = 'recover';
    const next = await boundedOutcome(supervisor.leave({ ...leaveOptions, retryMax: 0 }));
    check('leave worker admits next recovery after failed bodies', next.value?.ok === true);

    let atMs = 1000;
    let fetchCount = 0;
    const starts = [];
    const scheduler = createSnapshotRequestScheduler({
      now: () => atMs,
      sleep: async ms => { atMs += ms; },
      fetchSnapshot: async () => {
        starts.push(atMs);
        fetchCount += 1;
        const response = await fetchWithTimeout(`${gameOrigin}/${fetchCount === 1 ? 'trickle' : 'ok'}`, {
          localAddress: '127.0.0.1', timeoutMs
        });
        return { ok: true, payload: (await readResponseBody(response)).json };
      }
    });
    const first = scheduler.request();
    check('snapshot requests still share one flight', scheduler.request() === first);
    const firstOutcome = await boundedOutcome(first);
    check('failed response releases snapshot scheduler', firstOutcome.error instanceof Error && !scheduler.status().inFlight);
    const secondOutcome = await boundedOutcome(scheduler.request());
    check('snapshot recovery retains ordinary 30-second start interval', secondOutcome.value?.ok
      && fetchCount === 2 && starts[1] - starts[0] === 30000);
  } finally {
    await supervisor?.close();
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => server.close(resolve));
  }
  return { ok: results.every(result => result.ok), checks: results.length, results };
}

if (require.main === module) {
  runSessionClientSelfTest().then(result => {
    console.log(JSON.stringify(result, null, 2));
    assert.ok(result.ok, 'session client self-test failed');
  }).catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { runSessionClientSelfTest };
