'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseBrowserlessRunnerArgs } = require('./config');
const { cleanupOldLogDays } = require('./log-retention');
const { createLocalLogStore } = require('./local-log-store');

function publicConfig(config) {
  return {
    gameOrigin: config.gameOrigin,
    wsPath: config.wsPath,
    wsExtraQuery: config.wsExtraQuery,
    dataDir: config.dataDir,
    logDir: config.logDir,
    statusHost: config.statusHost,
    statusPort: config.statusPort,
    webTokenPresent: Boolean(config.webToken),
    readOnly: Boolean(config.readOnly),
    dryRun: Boolean(config.dryRun),
    once: Boolean(config.once),
    logRetentionDays: Number(config.logRetentionDays || 0),
    userId: Number(config.userId || 0),
    sessionTokenPresent: Boolean(config.sessionToken)
  };
}

async function runBrowserlessRunner(config, deps = {}) {
  const now = typeof deps.now === 'function' ? deps.now : Date.now;
  const logStore = deps.logStore || createLocalLogStore({ logDir: config.logDir, now });
  fs.mkdirSync(config.dataDir, { recursive: true });
  const retention = cleanupOldLogDays(config.logDir, {
    nowMs: now(),
    keepDays: config.logRetentionDays
  });
  logStore.append('runner', 'runner-start', {
    config: publicConfig(config),
    retention
  });

  if (!config.readOnly) {
    const result = { ok: false, reason: 'only-read-only-mode-is-supported' };
    logStore.append('runner', 'runner-stop', result);
    return result;
  }

  if (config.dryRun) {
    const result = {
      ok: true,
      mode: 'dry-run',
      once: Boolean(config.once),
      statusPort: config.statusPort,
      message: 'browserless runner skeleton initialized without live transport'
    };
    logStore.append('runner', 'runner-dry-run', result);
    return result;
  }

  if (!config.userId || !config.sessionToken) {
    const result = { ok: false, reason: 'missing-manual-session' };
    logStore.append('runner', 'runner-stop', result);
    return result;
  }

  if (typeof deps.runReadOnlyOnce === 'function') {
    const canary = await deps.runReadOnlyOnce(config, { logStore, now });
    const result = { ok: Boolean(canary?.ok), mode: 'read-only', canary: canary || null };
    logStore.append('runner', 'runner-finish', result);
    return result;
  }

  const result = {
    ok: false,
    reason: 'live-read-only-canary-pending',
    message: 'live read-only transport is intentionally gated until the read-only canary runner is implemented'
  };
  logStore.append('runner', 'runner-stop', result);
  return result;
}

async function runBrowserlessRunnerSelfTest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'grasp-rat-browserless-runner-'));
  try {
    const dryConfig = parseBrowserlessRunnerArgs(['--once', '--dry-run', '--data-dir', tmp], {});
    const dryRun = await runBrowserlessRunner(dryConfig, {
      now: () => Date.UTC(2026, 6, 8, 1, 0, 0)
    });
    const liveConfig = parseBrowserlessRunnerArgs([
      '--once',
      '--live',
      '--data-dir',
      tmp,
      '--user-id',
      '7',
      '--session-token',
      'self-test-token'
    ], {});
    const liveRun = await runBrowserlessRunner(liveConfig, {
      now: () => Date.UTC(2026, 6, 8, 1, 1, 0),
      runReadOnlyOnce: async () => ({ ok: true, frames: 0, fake: true })
    });
    const runnerLog = path.join(tmp, 'logs', '2026-07-08', 'runner.jsonl');
    const text = fs.readFileSync(runnerLog, 'utf8');
    return {
      ok: Boolean(dryRun.ok && liveRun.ok && /runner-dry-run/.test(text) && /runner-finish/.test(text) && !/self-test-token/.test(text)),
      dryRun,
      liveRun,
      logFile: runnerLog
    };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

module.exports = {
  publicConfig,
  runBrowserlessRunner,
  runBrowserlessRunnerSelfTest
};
