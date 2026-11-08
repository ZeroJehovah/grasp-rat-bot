'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const { createNativeDataRuntime } = require('../src/browser/runtime/native-data-runtime');
const { createTargetWhitelistRuntime } = require('../src/browser/runtime/target-whitelist');
const { createCombatLogQueueRuntime } = require('../src/browser/runtime/combat-log-queue-runtime');
const { createExitAuditRuntime } = require('../src/browser/runtime/exit-audit-runtime');
const { createCombatTargetRuntime } = require('../src/browser/runtime/combat-target-runtime');
const { createNativeTransportRuntime } = require('../src/browser/runtime/native-transport-runtime');

async function main() {
  const checks = [];
  const root = path.resolve(__dirname, '..');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'grasp-frozen-audit-'));
  try {
    const nodeStub = path.join(temp, 'node');
    fs.writeFileSync(nodeStub, '#!/bin/sh\nprintf "%s\\n" "$GRASP_RAT_DEMO_HOST" "$GRASP_RAT_DEMO_WEB_TOKEN"\n', { mode: 0o755 });
    const env = { ...process.env, PATH: `${temp}:${process.env.PATH}` };
    delete env.GRASP_RAT_DEMO_HOST;
    delete env.GRASP_RAT_DEMO_WEB_TOKEN;
    const start = spawnSync('bash', [path.join(root, 'headless-demo/start-demo.sh')], { env, encoding: 'utf8' });
    assert.equal(start.status, 0, start.stderr);
    assert(start.stdout.endsWith('127.0.0.1\n\n'));
    for (const token of ['', '1234567890', 'change-this-before-start']) {
      const denied = spawnSync(process.execPath, [path.join(root, 'headless-demo/server.js')], {
        env: { ...process.env, GRASP_RAT_DEMO_HOST: '0.0.0.0', GRASP_RAT_DEMO_WEB_TOKEN: token },
        encoding: 'utf8', timeout: 3000
      });
      assert.equal(denied.status, 1);
      assert.match(denied.stderr, /Refusing to listen/);
    }
    checks.push('A-024 loopback startup and public placeholder rejection');

    let listener;
    const storage = { clashControllerSecret: 'fixture-secret' };
    const fetches = [];
    const event = { addListener() {} };
    const chrome = { runtime: { id: 'fixture', getURL: suffix => `chrome-extension://fixture/${suffix}`,
      onMessage: { addListener: fn => { listener = fn; } }, onInstalled: event, onStartup: event },
      storage: { local: { get: async () => ({ ...storage }), set: async items => Object.assign(storage, items) } },
      tabs: { onRemoved: event, onUpdated: event } };
    vm.runInNewContext(fs.readFileSync(path.join(root, 'extension/background.js'), 'utf8'), {
      chrome, URL, AbortController, setTimeout, clearTimeout,
      fetch: async (url, options) => { fetches.push({ url, options }); return { status: 200, text: async () => 'fixture', url }; }
    });
    const sender = { id: 'fixture', tab: { id: 1, url: 'https://grasp-rat-game.h-e.top/' },
      url: 'https://grasp-rat-game.h-e.top/', frameId: 0 };
    const request = (type, payload, from = sender) => new Promise(resolve => listener({ type, payload }, from, resolve));
    const publicUrl = 'https://raw.githubusercontent.com/ZeroJehovah/grasp-rat-bot/main/dist/manifest.json';
    assert.equal((await request('fetchText', { url: publicUrl })).ok, true);
    for (const payload of [{ url: 'http://127.0.0.1:9097/configs' }, { url: 'https://evil.invalid/' },
      { url: publicUrl, method: 'POST' }, { url: publicUrl, headers: { authorization: 'x' } },
      { url: publicUrl.replace('dist/manifest.json', 'other.txt') }]) {
      assert.equal((await request('fetchText', payload)).ok, false);
    }
    assert.equal((await request('storageSet', { items: { clashControllerSecret: 'changed' } })).ok, false);
    assert.equal((await request('storageSet', { items: { manifestUrl: 'https://evil.invalid/' } })).ok, false);
    assert.equal((await request('storageSet', { items: { graspRatBotPaused: true } })).ok, true);
    assert.equal((await request('storageGet', {})).values.clashControllerSecret, undefined);
    assert.equal((await request('fetchText', { url: publicUrl }, { ...sender, url: 'https://evil.invalid/' })).ok, false);
    assert.equal((await request('openGameTab', {})).ok, false);
    assert.equal(storage.clashControllerSecret, 'fixture-secret');
    assert.equal(fetches.length, 1);
    assert.equal(fetches[0].options.redirect, 'error');
    checks.push('A-025 background page permissions, URLs, methods, headers, storage and sender');

    const entry = fs.readFileSync(path.join(root, 'src/browser/runtime-entry.js'), 'utf8');
    const getter = entry.match(/getOwnEntity: (\(\) => \{[\s\S]*?\n    \}),\n    targetOverlayRenderEntities/)[1];
    const self = { user_id: 7, hp: 100, x: 0, y: 0 };
    let nativeReads = 0;
    const page = { getOwnEntity() { assert.equal(this, page); nativeReads += 1; return self; } };
    const getOwnEntity = vm.runInNewContext(`(${getter})`, {
      pageGlobal: page, readPageGlobal: (key, fallback, obj) => obj[key] || fallback,
      getSelf: () => { throw new Error('recursive bot getter'); }
    });
    const native = createNativeDataRuntime({ storage: null, bot: { globalState: { entities: [] } }, cfg: {}, getCurrentUserId: () => 7, getOwnEntity });
    assert.equal(native.getSelf(), self);
    assert.equal(nativeReads, 1);
    checks.push('A-026 original page getter invoked once with page receiver');

    const bot = { targetWhitelist: { url: 'https://fixture.invalid/whitelist', names: ['cached'], nameSet: new Set(['cached']) } };
    let payload = { userIds: [8, '9'] };
    const whitelist = createTargetWhitelistRuntime({ bot, cfg: {}, fetchJsonNoStore: async () => payload, now: () => 100 });
    assert(whitelist.isWhitelistedTarget({ name: 'cached' }));
    await whitelist.refreshTargetWhitelist();
    assert(whitelist.isWhitelistedTarget({ user_id: 8, name: 'renamed' }));
    assert(whitelist.isWhitelistedTarget({ userId: 9 }));
    assert(!whitelist.isWhitelistedTarget({ userId: 10 }));
    payload = { names: ['legacy'], userIds: [11] };
    await whitelist.refreshTargetWhitelist();
    assert(whitelist.isWhitelistedTarget({ name: 'legacy' }));
    assert(whitelist.isWhitelistedTarget({ user_id: 11 }));
    checks.push('A-027 ID-only and mixed whitelist plus legacy name cache');

    const memory = new Map();
    const localStorage = { getItem: key => memory.get(key) || null, setItem: (key, value) => memory.set(key, value) };
    const logBot = { combatLogging: { enabled: true, endpoint: 'https://fixture.invalid/log',
      pending: [{ type: 'exit-audit', exitAuditLogId: 'exit-1', criticalLog: true, at: Date.now() }],
      sent: 0, dropped: 0 } };
    const audit = createExitAuditRuntime({ bot: logBot, cfg: {}, storage: localStorage, exitAuditPendingLogsKey: 'exit' });
    audit.persistExitAuditLogEntry(logBot.combatLogging.pending[0]);
    assert.equal(audit.exitAuditFlushPending(), false);
    const queue = createCombatLogQueueRuntime({ bot: logBot, cfg: { combatLogTimeoutMs: 250 }, storage: localStorage,
      combatLogPendingEntriesKey: 'pending', removePersistedExitAuditLogs: audit.removePersistedExitAuditLogs });
    const realFetch = global.fetch;
    let signal;
    try {
      global.fetch = async (_url, options) => { signal = options.signal; return new Promise(() => {}); };
      assert(queue.flushCombatLogs(true));
      await new Promise(resolve => setTimeout(resolve, 350));
      assert.equal(signal.aborted, true);
      assert.equal(logBot.combatLogging.sending, false);
      assert.equal(logBot.combatLogging.pending.length, 1);
      assert.equal(audit.exitAuditFlushPending(), false);
      global.fetch = async () => ({ ok: true });
      assert(queue.flushCombatLogs(true));
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(logBot.combatLogging.pending.length, 0);
      assert.equal(logBot.combatLogging.sending, false);
    } finally { global.fetch = realFetch; }
    checks.push('A-028 hung upload cancellation, retained retry and durable exit recovery');

    const target = { user_id: 8, hp: 100, x: 5000, y: 0, native: true, active: true };
    const combatBot = { combatTarget: { id: 8, at: Date.now(), lastInRangeAt: Date.now() }, control: {} };
    const combat = createCombatTargetRuntime({ bot: combatBot,
      cfg: { targetStickMs: 10000, combatEngageStickMs: 10000, combatEngageGraceMs: 10000, combatAttackRange: 14500 },
      isAlive: entity => entity.hp > 0, isCurrentlyActive: entity => entity.active,
      dropValue: () => 100, dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
      isFullHp: () => true, opportunityLongStaminaBudget: () => Infinity });
    const snapshot = { ...target, native: false, snapshot: true };
    assert.equal(combat.pickEngagedCombatTarget(self, [], [snapshot]), null);
    assert.equal(combat.pickEngagedCombatTarget(self, [snapshot], [snapshot]), null);
    assert(combat.pickEngagedCombatTarget(self, [target], [target]));
    let visible = null;
    const sent = [];
    const ws = { send: command => sent.push(command), addEventListener() {}, removeEventListener() {} };
    const transport = createNativeTransportRuntime({ bot: combatBot, cfg: { directWsControlEnabled: true, shootEveryMs: 0 },
      getNativeEntityList: () => visible, getCurrentUserId: () => 7,
      getNativeControl: () => ({ ws, wsOpen: true, wsReadyState: 1 }), now: () => 1000 });
    const aim = { x: 5100, y: 30 };
    assert.equal(transport.shootAt(self, aim, true, { realtimeTarget: target }), false);
    visible = [{ ...self, native: true }, target];
    assert.equal(transport.shootAt(self, aim, true, { realtimeTarget: snapshot }), false);
    assert.equal(transport.shootAt(self, aim, true, { realtimeTarget: target }), true);
    assert.equal(sent.length, 1);
    assert.match(sent[0], /^shoot 5100 30 /);
    visible = [self];
    assert.equal(transport.shootAt(self, aim, true, { realtimeTarget: target }), false);
    checks.push('A-029 snapshot reacquisition rejected and dispatch requires current native target');
    process.stdout.write(JSON.stringify({ ok: true, checks }, null, 2) + '\n');
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
