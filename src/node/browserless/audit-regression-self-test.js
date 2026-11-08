'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const { startStatusServer } = require('./status-server');
const { submitGameCallbackUrl, redactStructuredSecrets, stringifyRedactedJson } = require('./session-client');
const { sourceIpProbeMetrics } = require('./source-ip-probe');

async function runAuditRegressionSelfTest() {
  const cases = [];
  const check = async (name, run) => { await run(); cases.push(name); };
  await check('A-001 malformed unauthenticated Host leaves status server alive', async () => {
    const handle = await startStatusServer({ host: '127.0.0.1', port: 0, webToken: 'fixture-token' });
    const get = (host, route) => new Promise((resolve, reject) => {
      const req = http.get({ host: '127.0.0.1', port: handle.port, path: route,
        headers: { host }, agent: false }, res => {
        res.resume(); res.on('end', () => resolve(res.statusCode));
      });
      req.setTimeout(2000, () => req.destroy(new Error('status fixture timed out')));
      req.on('error', reject);
    });
    try {
      assert.equal(await get('[', '/api/status'), 400);
      assert.equal(await get('localhost', '/api/status'), 401);
      assert.equal(await get('localhost', '/api/health'), 200);
    } finally { await handle.close(); }
  });
  await check('A-002 HTML credentials never enter login summaries or errors', async () => {
    const secret = 'fixture-private-session-token';
    for (const quote of ["'", '"']) {
      const html = `<script>localStorage.setItem(${quote}tmpGameUserId${quote},${quote}7${quote});`
        + `localStorage.setItem(${quote}tmpGameSessionToken${quote},${quote}${secret}${quote});</script>`;
      for (const status of [200, 400]) {
        const response = await submitGameCallbackUrl('https://game.example/auth/callback', {
          fetchWithTimeout: async () => ({ ok: status === 200, status,
            headers: new Headers({ 'content-type': 'text/html' }), text: async () => html })
        }).catch(error => error);
        if (status === 200) {
          assert.equal(response.login?.sessionToken, secret);
          assert(!JSON.stringify(response.summary).includes(secret));
        } else {
          assert(response instanceof Error);
          assert(!response.message.includes(secret));
          assert(!JSON.stringify(response).includes(secret));
        }
      }
      assert(!JSON.stringify(redactStructuredSecrets({ text: html })).includes(secret));
      assert(!stringifyRedactedJson({ nested: { text: html } }).includes(secret));
      const incomplete = html.replace('tmpGameUserId', 'unknownKey');
      await assert.rejects(submitGameCallbackUrl('https://game.example/auth/callback', {
        fetchWithTimeout: async () => ({ ok: true, status: 200, headers: new Headers(), text: async () => incomplete })
      }), error => !error.message.includes(secret) && !JSON.stringify(error).includes(secret));
    }
  });
  await check('A-004 six-hour half-life applies to success and latency weights', () => {
    const nowMs = Date.parse('2026-11-08T12:00:00Z');
    const halfLifeMs = 6 * 60 * 60 * 1000;
    const sample = (age, latency = 100) => ({ ip: '127.0.0.1', status: 200,
      observedAt: new Date(nowMs - age).toISOString(), totalMs: latency, ttfbMs: latency });
    for (const [age, weight] of [[0, 1], [halfLifeMs, 0.5], [2 * halfLifeMs, 0.25]]) {
      assert.equal(sourceIpProbeMetrics([sample(age)], nowMs).weightedSampleWeight, weight);
    }
    const metrics = sourceIpProbeMetrics([sample(0, 100), sample(halfLifeMs, 400)], nowMs);
    assert.equal(metrics.weightedMeanMs, 200);
    assert.equal(metrics.weightedTotalMeanMs, 200);
  });
  const runtime = await require('./audit-runtime-regression-self-test').runAuditRuntimeRegressionSelfTest();
  cases.push(`runtime authority regressions (${runtime.cases})`);
  return { ok: true, cases: cases.length, checks: cases };
}

if (require.main === module) runAuditRegressionSelfTest().then(result => {
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}).catch(error => { console.error(error); process.exitCode = 1; });

module.exports = { runAuditRegressionSelfTest };
