#!/usr/bin/env node
'use strict';

const { createWatchdogHeartbeatRuntime } = require('../src/browser/runtime/watchdog-heartbeat-runtime');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function createStorage(values = {}) {
  const data = { ...values };
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = String(value);
    }
  };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function runSelfTest() {
  let now = Date.UTC(2026, 6, 7, 8, 0, 0, 0);
  let intervalCallback = null;
  const requests = [];
  const cfg = {
    watchdogEnabled: false,
    watchdogEndpointConfigured: false,
    watchdogEndpoint: 'http://127.0.0.1:18765/watchdog/heartbeat',
    watchdogHeartbeatMs: 500,
    watchdogCombatHeartbeatMs: 200,
    watchdogHeartbeatTimeoutMs: 400,
    watchdogServiceStatusMs: 2000,
    watchdogSendLeaveDescriptor: false,
    watchdogLeaveDescriptor: null,
    watchdogLeaveDescriptorTtlMs: 30000
  };
  const bot = {
    watchdog: { pageId: 'page-runtime-test' },
    lastDecision: {
      kind: 'combat',
      reason: 'runtime-watchdog-test',
      target: { id: 27355, name: 'Target', hp: 91, distance: 12345 }
    },
    lastTickCombatActive: true,
    lastTickAt: now - 20,
    lastTickCompletedAt: now - 10,
    runtimeDiagnostics: { diagnosis: 'ok' }
  };
  const runtime = createWatchdogHeartbeatRuntime({
    bot,
    cfg,
    storage: createStorage({ tmpGameSessionToken: 'runtime-secret-token' }),
    pageGlobal: { addEventListener() {} },
    documentRef: { visibilityState: 'hidden', addEventListener() {} },
    locationRef: { origin: 'https://grasp-rat-game.h-e.top' },
    fetchFn: async (url, req = {}) => {
      const record = {
        url: String(url),
        method: String(req.method || 'GET'),
        body: req.body ? JSON.parse(String(req.body)) : null
      };
      requests.push(record);
      if (record.method === 'GET') {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            ok: true,
            enabled: true,
            activeRescueEnabled: false,
            dryRun: true,
            stateCount: 1,
            states: [{ pageId: 'page-runtime-test', heartbeatAgeMs: 37 }],
            directLeave: { enabled: true, verified: false, readyStates: 0 },
            clash: { enabled: true, validation: { ok: true } },
            warning: 'active rescue is enabled but direct leave is disabled or unverified',
            lastDecision: { type: 'watchdog-would-rescue', at: now - 1000 }
          })
        };
      }
      return {
        ok: true,
        status: 200,
        text: async () => '{"ok":true}'
      };
    },
    setIntervalFn: fn => {
      intervalCallback = fn;
      return { unref() {} };
    },
    clearIntervalFn: () => {
      intervalCallback = null;
    },
    setTimeoutFn: () => 0,
    clearTimeoutFn: () => {},
    now: () => now,
    getSelf: () => ({ id: 28886, hp: 58, maxHp: 100, life: 'Alive' }),
    summarizeSelf: self => self,
    getCurrentUserId: () => 28886,
    getSessionToken: () => 'runtime-secret-token',
    summarizeControl: () => ({ wsOpen: true, nativeWsOpen: true, hasToken: true, currentUserId: 28886 }),
    combatTickActiveFromState: () => true,
    recordRuntimeDiagnostics: detail => {
      bot.lastWatchdogDiagnostic = detail;
    }
  });

  assert(runtime.sendWatchdogHeartbeat(true) === false, 'disabled watchdog sent heartbeat');
  assert(requests.length === 0, 'disabled watchdog made network request');

  const configured = runtime.configureWatchdog({
    enabled: true,
    endpoint: 'http://127.0.0.1:18765/watchdog/heartbeat'
  });
  assert(configured.enabled === true, 'configureWatchdog did not enable heartbeat');
  assert(typeof intervalCallback === 'function', 'watchdog interval was not started');
  await flushPromises();
  assert(requests.some(item => item.method === 'GET' && item.url === 'http://127.0.0.1:18765/watchdog/status'), 'service status endpoint was not polled');

  assert(runtime.sendWatchdogHeartbeat(true) === true, 'enabled watchdog did not send forced heartbeat');
  await flushPromises();
  const firstPost = requests.find(item => item.method === 'POST');
  assert(firstPost, 'heartbeat POST was not made');
  assert(firstPost.body?.type === 'watchdog-heartbeat', 'heartbeat payload type mismatch');
  assert(firstPost.body?.combatActive === true, 'heartbeat did not mark combat active');
  assert(firstPost.body?.damagedInCombat === false, 'first combat heartbeat should not be marked damaged before HP drop');
  assert(firstPost.body?.leaveAuth?.sessionTokenPresent === true, 'heartbeat did not report token presence');
  assert(!Object.prototype.hasOwnProperty.call(firstPost.body?.leaveAuth || {}, 'sessionToken'), 'heartbeat leaked token without descriptor opt-in');

  now += 100;
  bot.lastDecision = { ...bot.lastDecision, reason: 'runtime-watchdog-damaged' };
  runtime.configureWatchdog({
    sendLeaveDescriptor: true,
    leaveDescriptor: {
      url: 'https://grasp-rat-game.h-e.top/api/leave',
      method: 'POST',
      headers: { authorization: 'Bearer ${sessionToken}' },
      bodyJson: { userId: '${userId}' }
    }
  });
  assert(runtime.sendWatchdogHeartbeat(true) === true, 'descriptor-enabled watchdog did not send heartbeat');
  await flushPromises();
  const posts = requests.filter(item => item.method === 'POST');
  const descriptorPost = posts[posts.length - 1];
  assert(descriptorPost.body.leaveAuth.sessionToken === 'runtime-secret-token', 'descriptor opt-in did not include token snapshot');
  assert(descriptorPost.body.leaveAuth.descriptor?.headers?.authorization === 'Bearer ${sessionToken}', 'descriptor template was not preserved');

  const status = runtime.summarizeWatchdogStatus();
  assert(status.statusEndpoint === 'http://127.0.0.1:18765/watchdog/status', 'status endpoint summary mismatch');
  assert(status.service?.enabled === true, 'service status enabled flag missing');
  assert(status.service?.dryRun === true, 'service status dry-run flag missing');
  assert(status.service?.directLeaveVerified === false, 'service direct leave verification summary mismatch');
  assert(status.service?.clashValidationOk === true, 'service Clash validation summary missing');
  assert(status.service?.heartbeatAgeMs === 37, 'service heartbeat age summary missing');
  assert(status.service?.lastDecisionType === 'watchdog-would-rescue', 'service last decision summary missing');

  runtime.configureWatchdog({ enabled: false });
  assert(runtime.summarizeWatchdogStatus().enabled === false, 'watchdog did not disable');
  assert(runtime.sendWatchdogHeartbeat(true) === false, 'disabled watchdog sent heartbeat after disable');

  console.log(JSON.stringify({ ok: true, cases: 16 }, null, 2));
}

if (require.main === module) {
  runSelfTest().catch(err => {
    console.error(err.stack || err.message);
    process.exit(1);
  });
}

module.exports = {
  runSelfTest
};
