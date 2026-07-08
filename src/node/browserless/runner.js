'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseBrowserlessRunnerArgs } = require('./config');
const { cleanupOldLogDays } = require('./log-retention');
const { createLocalLogStore } = require('./local-log-store');
const {
  buildPublicBrowserlessStatus,
  readBrowserlessStateFile,
  stateFilePath,
  updateBrowserlessStateFile,
  writeBrowserlessStateFile
} = require('./state-file');
const { startStatusServer } = require('./status-server');

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
    stateFile: config.stateFile || stateFilePath(config),
    userId: Number(config.userId || 0),
    sessionTokenPresent: Boolean(config.sessionToken)
  };
}

async function runBrowserlessRunner(config, deps = {}) {
  const now = typeof deps.now === 'function' ? deps.now : Date.now;
  const logStore = deps.logStore || createLocalLogStore({ logDir: config.logDir, now });
  const stateFile = config.stateFile || stateFilePath(config);
  fs.mkdirSync(config.dataDir, { recursive: true });
  const retention = cleanupOldLogDays(config.logDir, {
    nowMs: now(),
    keepDays: config.logRetentionDays
  });
  let persisted = readBrowserlessStateFile(stateFile);
  persisted = writeBrowserlessStateFile(stateFile, {
    ...persisted,
    updatedAt: new Date(now()).toISOString(),
    session: {
      ...persisted.session,
      userId: config.userId || persisted.session.userId,
      sessionToken: config.sessionToken || persisted.session.sessionToken,
      tokenUpdatedAt: config.sessionToken ? new Date(now()).toISOString() : persisted.session.tokenUpdatedAt
    },
    runner: {
      ...persisted.runner,
      running: true,
      mode: config.dryRun ? 'dry-run' : 'read-only',
      readOnly: config.readOnly,
      dryRun: config.dryRun,
      lastError: ''
    },
    logs: {
      ...persisted.logs,
      dataDir: config.dataDir,
      logDir: config.logDir,
      stateFile,
      currentDayDir: logStore.dayDirFor(now())
    }
  });

  let statusHandle = null;
  if (!config.once && Number(config.statusPort || 0) > 0 && deps.startStatusServer !== false) {
    const starter = deps.startStatusServer || startStatusServer;
    statusHandle = await starter({
      host: config.statusHost,
      port: config.statusPort,
      webToken: config.webToken,
      getStatus: () => buildPublicBrowserlessStatus(readBrowserlessStateFile(stateFile), config)
    });
  }

  logStore.append('runner', 'runner-start', {
    config: publicConfig(config),
    retention,
    statusServer: statusHandle ? { host: config.statusHost, port: statusHandle.port } : null
  });

  if (!config.readOnly) {
    const result = { ok: false, reason: 'only-read-only-mode-is-supported' };
    updateBrowserlessStateFile(stateFile, {
      runner: {
        running: false,
        lastRun: result,
        lastError: result.reason
      }
    }, { updatedAt: new Date(now()).toISOString() });
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
    updateBrowserlessStateFile(stateFile, {
      runner: {
        running: !config.once,
        mode: 'dry-run',
        lastRun: result,
        lastError: ''
      }
    }, { updatedAt: new Date(now()).toISOString() });
    logStore.append('runner', 'runner-dry-run', result);
    return result;
  }

  if (!config.userId || !config.sessionToken) {
    const result = { ok: false, reason: 'missing-manual-session' };
    updateBrowserlessStateFile(stateFile, {
      runner: {
        running: false,
        lastRun: result,
        lastError: result.reason
      }
    }, { updatedAt: new Date(now()).toISOString() });
    logStore.append('runner', 'runner-stop', result);
    return result;
  }

  if (typeof deps.runReadOnlyOnce === 'function') {
    const canary = await deps.runReadOnlyOnce(config, { logStore, now });
    const result = { ok: Boolean(canary?.ok), mode: 'read-only', canary: canary || null };
    updateBrowserlessStateFile(stateFile, {
      runner: {
        running: !config.once,
        mode: 'read-only',
        lastRun: result,
        lastError: result.ok ? '' : 'read-only-canary-failed'
      },
      probes: {
        lastReadOnlyProbe: canary || null
      }
    }, { updatedAt: new Date(now()).toISOString() });
    logStore.append('runner', 'runner-finish', result);
    return result;
  }

  const result = {
    ok: false,
    reason: 'live-read-only-canary-pending',
    message: 'live read-only transport is intentionally gated until the read-only canary runner is implemented'
  };
  updateBrowserlessStateFile(stateFile, {
    runner: {
      running: false,
      mode: 'read-only',
      lastRun: result,
      lastError: result.reason
    }
  }, { updatedAt: new Date(now()).toISOString() });
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
