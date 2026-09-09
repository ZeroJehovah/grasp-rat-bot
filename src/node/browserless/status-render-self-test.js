'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { isDeepStrictEqual } = require('util');
const { createBrowserlessBackgroundIo } = require('./background-io');
const { parseBrowserlessRunnerArgs } = require('./config');
const { redactStructuredSecrets } = require('./session-client');
const {
  browserlessCompactStatusSource,
  buildCompactBrowserlessStatus,
  buildPublicBrowserlessStatus,
  readBrowserlessStateFile,
  updateBrowserlessStateFile,
  writeBrowserlessStateFile
} = require('./state-file');

function expectedStatus(base, overlays, config, compact) {
  // Preserve the original runner's shallow overlay contract independently of
  // the implementation that builds the source in the Worker.
  const state = {
    ...base,
    ...overlays,
    network: { ...base.network, ...overlays.network },
    runner: { ...base.runner, ...overlays.runner }
  };
  const status = compact
    ? buildCompactBrowserlessStatus(browserlessCompactStatusSource(state, config), config)
    : redactStructuredSecrets({
        ...buildPublicBrowserlessStatus(state, config),
        highDropPlayers: state.highDropPlayers || null,
        easyKillPlayers: state.easyKillPlayers || null,
        dailyDamagePlayers: state.dailyDamagePlayers || null,
        dynamicWhitelist: state.dynamicWhitelist || null,
        chat: state.chat || null
      });
  // The contract is JSON text. Undefined fields in an empty/default state are
  // omitted on the wire, just as they were before moving the read.
  return JSON.parse(JSON.stringify(status));
}

async function runBrowserlessStatusRenderSelfTest() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'grasp-rat-status-render-'));
  const checks = {};
  const io = createBrowserlessBackgroundIo();
  const keepAlive = setInterval(() => {}, 1000);
  const nowMs = Date.parse('2026-09-09T04:00:00.000Z');
  const config = { nowMs, statusHost: '127.0.0.1', statusPort: 18799, webVersion: 'fixture' };
  try {
    const file = path.join(root, 'state.json');
    const persisted = writeBrowserlessStateFile(file, {
      updatedAt: new Date(nowMs).toISOString(),
      session: { userId: 7, sessionToken: 'status-fixture-secret', authenticated: true },
      runner: {
        running: false, mode: 'stored-mode', lastError: 'stored-error', lastLoginAt: new Date(nowMs - 120000).toISOString(),
        snapshotStatus: { lastReason: 'stored-snapshot' },
        lastRun: { ok: true, runId: 'previous-run', fixtureOpaque: 'not-a-status-field'.repeat(20000) }
      },
      current: { self: { userId: 7, hp: 82, x: 100, y: 200 } },
      network: { sourceIp: '192.0.2.1', lifecycleSourceIps: ['192.0.2.1', '192.0.2.2', '192.0.2.3'] },
      stats: { today: { day: '2026-09-09', sessionCount: 1 } }
    });
    const overlays = {
      network: { sourceIpProbe: { running: false, nextRoundAt: '2026-09-09T05:00:00.000Z' } },
      runner: { snapshotPoller: { stopped: true, intervalMs: 30000 }, remoteProfit: null },
      remoteProfit: null,
      highDropPlayers: { ok: true, entries: [] },
      easyKillPlayers: { ok: true, entries: [] },
      dailyDamagePlayers: { ok: true, entries: [] },
      dynamicWhitelist: { ok: true, entries: [] },
      chat: { ok: true, messages: [{ text: 'runtime chat' }] },
      mapTrails: null
    };
    for (const compact of [false, true]) {
      const rendered = await io.renderStatus(overlays, config, compact, { stateFile: file, timeoutMs: 5000 });
      const actual = JSON.parse(rendered.text);
      checks[`${compact ? 'compact' : 'full'}-file-source-parity`] = isDeepStrictEqual(
        actual, expectedStatus(persisted, overlays, config, compact)
      );
      checks[`${compact ? 'compact' : 'full'}-redaction`] = !rendered.text.includes('status-fixture-secret');
      checks[`${compact ? 'compact' : 'full'}-worker-read-timing`] = rendered.stateSource === 'file'
        && Number.isFinite(rendered.stateReadMs) && rendered.stateReadMs >= 0;
      if (compact) checks['compact-excludes-opaque-state'] = rendered.bytes < 64000
        && !rendered.text.includes('not-a-status-field');
    }
    const updated = updateBrowserlessStateFile(file, { current: { self: { hp: 77 } }, runner: { lastError: 'new-error' } });
    const changed = await io.renderStatus(overlays, config, true, { stateFile: file, timeoutMs: 5000 });
    checks['file-refresh-observes-new-persisted-state'] = isDeepStrictEqual(
      JSON.parse(changed.text), expectedStatus(updated, overlays, config, true)
    );
    const corruptFile = path.join(root, 'corrupt.json');
    fs.writeFileSync(corruptFile, '{incomplete');
    for (const [name, absentFile] of [['missing', path.join(root, 'missing.json')], ['corrupt', corruptFile]]) {
      const rendered = await io.renderStatus(overlays, config, true, { stateFile: absentFile, timeoutMs: 5000 });
      checks[`${name}-preserves-default-fallback`] = isDeepStrictEqual(
        JSON.parse(rendered.text), expectedStatus(readBrowserlessStateFile(absentFile), overlays, config, true)
      );
    }
    const inMemory = { ...updated, runner: { ...updated.runner, lastError: 'newer-live-error' } };
    const live = await io.renderStatus(inMemory, config, false, { timeoutMs: 5000 });
    checks['live-memory-not-replaced-by-disk'] = isDeepStrictEqual(JSON.parse(live.text), expectedStatus(inMemory, {}, config, false));
    checks['live-memory-does-not-read-file'] = live.stateSource === 'memory' && live.stateReadMs === 0;

    const { runBrowserlessRunner } = require('./runner');
    for (const phase of ['offline', 'online']) {
      const runnerConfig = parseBrowserlessRunnerArgs([
        '--live', '--data-dir', path.join(root, phase), '--status-port', '18799',
        '--loop-delay-ms', '1000', '--user-id', '7', '--session-token', 'runner-status-secret',
        '--login-point-x', '0', '--login-point-y', '0', '--login-point-hp', '100'
      ], {});
      updateBrowserlessStateFile(runnerConfig.stateFile, {
        stats: { today: { day: '2026-09-09', sessionCount: 1 } },
        runner: { lastRun: { fixtureOpaque: 'persisted-only'.repeat(25000) } }
      });
      const requests = [];
      let serverOptions;
      let getLiveState;
      let checked = false;
      const checkRequest = async () => {
        const originalRead = fs.readFileSync;
        let synchronousStateReads = 0;
        let pending;
        let hasLiveState;
        try {
          fs.readFileSync = function (target, ...args) {
            if (String(target) === runnerConfig.stateFile) synchronousStateReads++;
            return originalRead.call(this, target, ...args);
          };
          hasLiveState = Boolean(getLiveState());
          pending = serverOptions.getStatusText();
        } finally {
          fs.readFileSync = originalRead;
        }
        const text = await pending;
        const request = requests.at(-1);
        checks[`${phase}-fixture-state`] = hasLiveState === (phase === 'online');
        checks[`${phase}-no-synchronous-state-read`] = synchronousStateReads === 0;
        checks[`${phase}-source-selection`] = phase === 'online'
          ? !request.stateFile && request.hasSession
          : request.stateFile === runnerConfig.stateFile && !request.hasSession;
        checks[`${phase}-response-redacted`] = !text.includes('runner-status-secret') && JSON.parse(text).session?.userId === 7;
        if (phase === 'offline') checks['offline-post-excludes-persisted-payload'] = request.bytes < 64000;
        checked = true;
      };
      const result = await runBrowserlessRunner(runnerConfig, {
        now: () => nowMs,
        disableBackgroundIo: true,
        disableSourceIpPreflight: true,
        statusRenderIo: {
          status: () => io.status(),
          renderStatus(source, renderConfig, compact, options) {
            requests.push({ compact, stateFile: options?.stateFile || '', hasSession: Boolean(source.session), bytes: Buffer.byteLength(JSON.stringify(source)) });
            return io.renderStatus(source, renderConfig, compact, options);
          }
        },
        onLiveStateReady: getter => { getLiveState = getter; },
        startStatusServer: async options => {
          serverOptions = options;
          if (phase === 'offline') await checkRequest();
          return { port: 18799, close: async () => {} };
        },
        snapshotGapPoller: {
          start() {}, stop() {}, noteSnapshot() {}, refreshSchedule() {},
          status: () => ({ stopped: true, intervalMs: 30000 })
        },
        remoteProfitWorker: {
          context: () => null, reset() {}, status: () => null, close: async () => ({ ok: true })
        },
        logStore: { append() {}, currentDayDir: () => path.join(root, 'logs') },
        fetchWithTimeout: async () => { throw new Error('status fixture must not send HTTP'); },
        openBrowserlessWs: async () => { throw new Error('status fixture must not open WS'); },
        runReadOnlyOnce: async () => {
          if (phase === 'online') await checkRequest();
          return {
            ok: false, runId: 'status-fixture-stop', completedAt: new Date(nowMs).toISOString(),
            safety: { event: { reason: 'restart-drain-ready', shouldLeave: false } }
          };
        }
      });
      checks[`${phase}-runner-completes`] = checked && result.reason === 'restart-drain-ready';
      checks[`${phase}-compact-prewarm-reads-in-worker`] = requests[0]?.compact === true
        && requests[0].stateFile === runnerConfig.stateFile && !requests[0].hasSession;
    }
    await io.close({ timeoutMs: 5000 });
    let rejected = false;
    try {
      await io.renderStatus(overlays, config, true, { stateFile: file, timeoutMs: 5000 });
    } catch (_) { rejected = true; }
    checks['closed-worker-rejects-file-render'] = rejected;
    return { ok: Object.values(checks).every(Boolean), checks };
  } finally {
    await io.close({ timeoutMs: 5000 });
    clearInterval(keepAlive);
    fs.rmSync(root, { recursive: true, force: true });
  }
}

module.exports = { runBrowserlessStatusRenderSelfTest };

if (require.main === module) runBrowserlessStatusRenderSelfTest().then(result => {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}).catch(error => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
