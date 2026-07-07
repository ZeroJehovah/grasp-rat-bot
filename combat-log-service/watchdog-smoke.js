#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createServer } = require('./server');
const { DEFAULT_WATCHDOG_CONFIG } = require('./watchdog');

const GAME_ORIGIN = 'https://grasp-rat-game.h-e.top';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function requestJson(baseUrl, pathname, options = {}) {
  const res = await fetch(`${baseUrl}${pathname}`, {
    method: options.method || 'GET',
    headers: options.body ? { 'content-type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch (_) {
    body = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`${options.method || 'GET'} ${pathname} failed: ${res.status} ${body?.error || text}`);
  }
  return body;
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      const address = server.address();
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function closeServer(server) {
  return new Promise(resolve => server.close(() => resolve()));
}

async function runWatchdogSmoke() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'grasp-rat-watchdog-smoke-'));
  const externalCalls = [];
  const fakeFetch = async (url, req = {}) => {
    externalCalls.push({ url: String(url), method: String(req.method || 'GET'), body: req.body || '' });
    return {
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify({ ok: true, smoke: true })
    };
  };
  const server = createServer({
    dir: root,
    maxBodyBytes: 8 * 1024 * 1024,
    splitFiles: true,
    watchdog: {
      ...DEFAULT_WATCHDOG_CONFIG,
      enabled: false,
      intervalMs: 100,
      auditEnabled: true
    },
    fetch: fakeFetch
  });

  try {
    const baseUrl = await listen(server);
    const health = await requestJson(baseUrl, '/health');
    assert(health.ok === true, 'health endpoint did not return ok');
    assert(health.watchdog?.enabled === false, 'watchdog should be disabled by default');

    const dryRunStatus = await requestJson(baseUrl, '/watchdog/config', {
      method: 'POST',
      body: {
        enabled: true,
        dryRun: true,
        activeRescueEnabled: false,
        damagedCombatStaleMs: 250,
        combatHeartbeatStaleMs: 250,
        heartbeatStaleMs: 250,
        directLeave: {
          enabled: true,
          verified: true,
          timeoutMs: 500,
          retryMax: 0,
          allowedOrigins: [GAME_ORIGIN]
        }
      }
    });
    assert(dryRunStatus.enabled === true && dryRunStatus.dryRun === true, 'dry-run config did not apply');

    const heartbeat = {
      type: 'watchdog-heartbeat',
      pageId: 'operator-smoke',
      userId: 28886,
      at: Date.now(),
      sequence: 1,
      visibilityState: 'hidden',
      combatActive: true,
      damagedInCombat: true,
      self: { id: 28886, hp: 58, maxHp: 100, life: 'Alive' },
      target: { id: 27355, name: 'Smoke Target', hp: 100, distance: 12665 },
      decision: { reason: 'operator-smoke', pendingExit: false },
      control: { wsOpen: true, nativeWsOpen: true, hasToken: true },
      runtime: { lastCombatTickAt: Date.now(), lastTickCompletedAt: Date.now() },
      leaveAuth: {
        available: true,
        userId: 28886,
        origin: GAME_ORIGIN,
        sessionToken: 'smoke-secret-token',
        expiresAt: Date.now() + 30000,
        descriptor: {
          url: `${GAME_ORIGIN}/api/leave`,
          method: 'POST',
          headers: { authorization: 'Bearer ${sessionToken}' },
          bodyJson: { userId: '${userId}' }
        }
      }
    };
    const heartbeatResult = await requestJson(baseUrl, '/watchdog/heartbeat', {
      method: 'POST',
      body: heartbeat
    });
    assert(heartbeatResult.ok === true, 'heartbeat endpoint did not accept payload');
    let status = await requestJson(baseUrl, '/watchdog/status');
    assert(status.stateCount === 1, 'watchdog status did not expose heartbeat state');
    assert(status.directLeave.readyStates === 1, 'direct leave readiness was not visible');

    await sleep(320);
    await server.watchdog.checkNow();
    await server.watchdog.flushAudit();
    const auditFile = server.watchdog.auditPath(Date.now());
    const auditText = fs.readFileSync(auditFile, 'utf8');
    assert(auditText.includes('watchdog-would-rescue'), 'dry-run would-rescue audit was not written');
    assert(!auditText.includes('smoke-secret-token'), 'watchdog audit leaked token');

    await requestJson(baseUrl, '/watchdog/config', {
      method: 'POST',
      body: {
        dryRun: false,
        activeRescueEnabled: true
      }
    });
    await requestJson(baseUrl, '/watchdog/heartbeat', {
      method: 'POST',
      body: { ...heartbeat, sequence: 2, at: Date.now() }
    });
    await sleep(320);
    await server.watchdog.checkNow();
    await sleep(20);
    await server.watchdog.flushAudit();
    assert(externalCalls.some(call => call.url === `${GAME_ORIGIN}/api/leave`), 'active rescue did not call fake direct leave');
    await requestJson(baseUrl, '/combat-log', {
      method: 'POST',
      body: {
        combatId: 'watchdog-smoke-exit',
        startedAt: Date.now(),
        entries: [{
          type: 'exit-audit',
          auditKind: 'exit-confirmed',
          at: Date.now(),
          userId: 28886,
          combatId: 'watchdog-smoke-exit',
          exitAuditId: 'watchdog-smoke-exit-confirmed',
          exitAuditLogId: 'watchdog-smoke-exit-confirmed:exit-confirmed'
        }]
      }
    });
    await sleep(20);
    await server.watchdog.flushAudit();
    status = await requestJson(baseUrl, '/watchdog/status');
    assert(status.states[0]?.rescue?.confirmed === true, 'combat-log exit confirmation did not update watchdog rescue state');
    assert(status.states[0]?.rescue?.confirmation === 'combat-log:exit-confirmed', 'watchdog rescue confirmation did not record combat-log source');

    status = await requestJson(baseUrl, '/watchdog/config', {
      method: 'POST',
      body: { enabled: false, activeRescueEnabled: false, dryRun: true }
    });
    assert(status.enabled === false, 'watchdog did not disable');

    console.log(JSON.stringify({
      ok: true,
      baseUrl,
      auditFile,
      directLeaveCalls: externalCalls.filter(call => call.url === `${GAME_ORIGIN}/api/leave`).length
    }, null, 2));
  } finally {
    await closeServer(server).catch(() => {});
    fs.rmSync(root, { recursive: true, force: true });
  }
}

if (require.main === module) {
  runWatchdogSmoke().catch(err => {
    console.error(err.stack || err.message);
    process.exit(1);
  });
}

module.exports = {
  runWatchdogSmoke
};
