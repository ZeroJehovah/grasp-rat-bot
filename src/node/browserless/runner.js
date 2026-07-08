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
const { runReadOnlyCanary } = require('./canary');
const { decisionStatePatch } = require('./decision-adapter');
const { createBrowserlessSafetyController } = require('./safety-controller');

function publicConfig(config) {
  return {
    gameOrigin: config.gameOrigin,
    wsPath: config.wsPath,
    wsExtraQuery: config.wsExtraQuery,
    snapshotPath: config.snapshotPath,
    dataDir: config.dataDir,
    logDir: config.logDir,
    statusHost: config.statusHost,
    statusPort: config.statusPort,
    webTokenPresent: Boolean(config.webToken),
    readOnly: Boolean(config.readOnly),
    controlMode: config.controlMode || 'read-only',
    dryRun: Boolean(config.dryRun),
    once: Boolean(config.once),
    logRetentionDays: Number(config.logRetentionDays || 0),
    readOnlyProbeMs: Number(config.readOnlyProbeMs || 0),
    frameGapAlertMs: Number(config.frameGapAlertMs || 0),
    decisionIntervalMs: Number(config.decisionIntervalMs || 0),
    staleSelfMs: Number(config.staleSelfMs || 0),
    noSelfGraceMs: Number(config.noSelfGraceMs || 0),
    staminaExhaustedBelowMs: Number(config.staminaExhaustedBelowMs || 0),
    movementCommandIntervalMs: Number(config.movementCommandIntervalMs || 0),
    movementTargetDeadZoneCm: Number(config.movementTargetDeadZoneCm || 0),
    movementSettlementFrames: Number(config.movementSettlementFrames || 0),
    combatEnabled: Boolean(config.combatEnabled),
    combatShootMinIntervalMs: Number(config.combatShootMinIntervalMs || 0),
    stateFile: config.stateFile || stateFilePath(config),
    loginPointPresent: Number.isFinite(Number(config.loginPointX)) && Number.isFinite(Number(config.loginPointY)),
    userId: Number(config.userId || 0),
    sessionTokenPresent: Boolean(config.sessionToken)
  };
}

async function runBrowserlessRunner(config, deps = {}) {
  const now = typeof deps.now === 'function' ? deps.now : Date.now;
  const logStore = deps.logStore || createLocalLogStore({ logDir: config.logDir, now });
  const safetyController = deps.safetyController || createBrowserlessSafetyController({
    now,
    frameGapAlertMs: config.frameGapAlertMs,
    staleSelfMs: config.staleSelfMs,
    noSelfGraceMs: config.noSelfGraceMs,
    staminaExhaustedBelowMs: config.staminaExhaustedBelowMs
  });
  const stateFile = config.stateFile || stateFilePath(config);
  fs.mkdirSync(config.dataDir, { recursive: true });
  const retention = cleanupOldLogDays(config.logDir, {
    nowMs: now(),
    keepDays: config.logRetentionDays
  });
  let persisted = readBrowserlessStateFile(stateFile);
  const loginPointProvided = Number.isFinite(Number(config.loginPointX)) && Number.isFinite(Number(config.loginPointY));
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
      mode: config.dryRun ? 'dry-run' : config.controlMode,
      readOnly: config.readOnly,
      controlMode: config.controlMode,
      dryRun: config.dryRun,
      combatEnabled: Boolean(config.combatEnabled),
      lastError: ''
    },
    loginPointSafety: loginPointProvided
      ? {
          ...persisted.loginPointSafety,
          ok: false,
          reason: 'manual-login-point-pending-snapshot-safety',
          point: {
            x: Number(config.loginPointX),
            y: Number(config.loginPointY),
            hp: Number.isFinite(Number(config.loginPointHp)) ? Number(config.loginPointHp) : null,
            source: 'cli'
          },
          checkedAt: ''
        }
      : persisted.loginPointSafety,
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
      getStatus: () => buildPublicBrowserlessStatus(readBrowserlessStateFile(stateFile), config),
      onStop: async () => {
        const event = safetyController.requestStop('explicit-stop', { source: 'status-api' });
        const currentState = readBrowserlessStateFile(stateFile);
        updateBrowserlessStateFile(stateFile, {
          runner: {
            lastError: event.reason,
            currentAction: { kind: 'stop', band: 'safety', reason: event.reason }
          },
          recentExits: [...(currentState.recentExits || []), event].slice(-20)
        }, { updatedAt: new Date(now()).toISOString() });
        logStore.append('exits', 'stop-request', event);
        return { ok: true, event };
      }
    });
  }

  logStore.append('runner', 'runner-start', {
    config: publicConfig(config),
    retention,
    statusServer: statusHandle ? { host: config.statusHost, port: statusHandle.port } : null
  });

  if (!['read-only', 'movement-only', 'non-combat-profit', 'combat-dry-run', 'combat-live'].includes(String(config.controlMode || ''))) {
    const result = { ok: false, reason: 'unsupported-control-mode' };
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
      controlMode: config.controlMode || 'read-only',
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

  const readOnlyCanary = deps.runReadOnlyOnce || runReadOnlyCanary;
  const canary = await readOnlyCanary(config, {
    logStore,
    now,
    persistedState: readBrowserlessStateFile(stateFile),
    safetyController,
    onDecision: decision => {
      updateBrowserlessStateFile(stateFile, decisionStatePatch(decision), {
        updatedAt: new Date(now()).toISOString()
      });
    },
    onAction: (action, context = {}) => {
      updateBrowserlessStateFile(stateFile, {
        runner: {
          currentAction: {
            ...(action || {}),
            actionState: context.actionState || null
          }
        },
        current: {
          action: {
            ...(action || {}),
            actionState: context.actionState || null
          }
        }
      }, {
        updatedAt: new Date(now()).toISOString()
      });
    }
  });
  const result = { ok: Boolean(canary?.ok), mode: config.controlMode || 'read-only', canary: canary || null };
  const finalDecisionPatch = canary?.decisions?.last ? decisionStatePatch(canary.decisions.last) : {};
  const safetyEvents = [canary?.safety?.event, canary?.safety?.leaveFailure].filter(Boolean);
  const currentStateBeforeFinish = readBrowserlessStateFile(stateFile);
  updateBrowserlessStateFile(stateFile, {
    ...finalDecisionPatch,
    ...(safetyEvents.length ? {
      recentExits: [...(currentStateBeforeFinish.recentExits || []), ...safetyEvents].slice(-20)
    } : {}),
    runner: {
      ...(finalDecisionPatch.runner || {}),
      running: !config.once,
      mode: config.controlMode || 'read-only',
      lastRun: result,
      lastError: result.ok ? '' : (canary?.error || 'read-only-canary-failed')
    },
    probes: {
      lastReadOnlyProbe: canary || null
    }
  }, { updatedAt: new Date(now()).toISOString() });
  logStore.append('runner', result.ok ? 'runner-finish' : 'runner-stop', result);
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
