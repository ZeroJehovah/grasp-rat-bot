'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseBrowserlessRunnerArgs } = require('./config');
const { cleanupOldLogDays } = require('./log-retention');
const { createLocalLogStore } = require('./local-log-store');
const {
  buildPublicBrowserlessStatus,
  loginPointFromAnyState,
  readBrowserlessStateFile,
  sessionFromAnyState,
  stateFilePath,
  updateBrowserlessStateFile,
  writeBrowserlessStateFile
} = require('./state-file');
const { startStatusServer } = require('./status-server');
const { runReadOnlyCanary } = require('./canary');
const { decisionStatePatch } = require('./decision-adapter');
const { createBrowserlessSafetyController } = require('./safety-controller');
const {
  requestAuthUrl,
  submitCallbackInput
} = require('./session-client');

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
    canaryProfile: config.canaryProfile || '',
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
    loginPointPresent: hasConfigNumber(config.loginPointX) && hasConfigNumber(config.loginPointY),
    userId: Number(config.userId || 0),
    sessionTokenPresent: Boolean(config.sessionToken)
  };
}

function hasConfigNumber(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}

function hydrateConfigFromState(config, state) {
  const session = sessionFromAnyState(state);
  const loginPoint = loginPointFromAnyState(state);
  return {
    ...config,
    userId: Number(config.userId || 0) || session.userId,
    sessionToken: config.sessionToken || session.sessionToken,
    loginPointX: hasConfigNumber(config.loginPointX) ? Number(config.loginPointX) : loginPoint?.x ?? config.loginPointX,
    loginPointY: hasConfigNumber(config.loginPointY) ? Number(config.loginPointY) : loginPoint?.y ?? config.loginPointY,
    loginPointHp: hasConfigNumber(config.loginPointHp) ? Number(config.loginPointHp) : loginPoint?.hp ?? config.loginPointHp
  };
}

function learnedLoginPointFromCanary(canary) {
  const finalSelf = canary?.state?.realtime?.self || canary?.decisions?.last?.input?.self || null;
  if (!finalSelf || !Number.isFinite(Number(finalSelf.x)) || !Number.isFinite(Number(finalSelf.y))) {
    return { finalSelf: null, loginPoint: null };
  }
  return {
    finalSelf,
    loginPoint: {
      x: Number(finalSelf.x),
      y: Number(finalSelf.y),
      hp: Number.isFinite(Number(finalSelf.hp)) ? Number(finalSelf.hp) : null,
      source: 'canary-self'
    }
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
  const envSessionTokenProvided = Boolean(config.sessionToken);
  const envLoginPointProvided = hasConfigNumber(config.loginPointX) && hasConfigNumber(config.loginPointY);
  const persistedLoginPoint = loginPointFromAnyState(persisted);
  config = hydrateConfigFromState(config, persisted);
  const loginPointProvided = hasConfigNumber(config.loginPointX) && hasConfigNumber(config.loginPointY);
  persisted = writeBrowserlessStateFile(stateFile, {
    ...persisted,
    updatedAt: new Date(now()).toISOString(),
    session: {
      ...persisted.session,
      userId: config.userId || persisted.session.userId,
      sessionToken: config.sessionToken || persisted.session.sessionToken,
      tokenUpdatedAt: envSessionTokenProvided ? new Date(now()).toISOString() : persisted.session.tokenUpdatedAt
    },
    runner: {
      ...persisted.runner,
      running: true,
      mode: config.dryRun ? 'dry-run' : config.controlMode,
      readOnly: config.readOnly,
      controlMode: config.controlMode,
      canaryProfile: config.canaryProfile || '',
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
            hp: hasConfigNumber(config.loginPointHp) ? Number(config.loginPointHp) : null,
            source: envLoginPointProvided ? 'cli' : (persistedLoginPoint?.source || 'state')
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
      },
      onAuthUrl: async () => {
        const authUrl = await (deps.requestAuthUrl || requestAuthUrl)({
          gameOrigin: config.gameOrigin,
          timeoutMs: config.httpTimeoutMs
        });
        updateBrowserlessStateFile(stateFile, {
          session: {
            lastAuthUrl: authUrl,
            lastAuthUrlAt: new Date(now()).toISOString()
          }
        }, { updatedAt: new Date(now()).toISOString() });
        logStore.append('runner', 'auth-url', { authUrlPresent: Boolean(authUrl) });
        return { ok: true, authUrl };
      },
      onCallback: async input => {
        const result = await (deps.submitCallbackInput || submitCallbackInput)(input, {
          gameOrigin: config.gameOrigin,
          timeoutMs: config.httpTimeoutMs
        });
        updateBrowserlessStateFile(stateFile, {
          session: {
            userId: result.login.userId,
            sessionToken: result.login.sessionToken,
            tokenUpdatedAt: new Date(now()).toISOString(),
            lastLoginSource: result.source || '',
            lastLoginSummary: result.summary || null
          }
        }, { updatedAt: new Date(now()).toISOString() });
        logStore.append('runner', 'login-ok', {
          userId: result.login.userId,
          tokenPresent: true,
          source: result.source || '',
          summary: result.summary || null
        });
        return {
          ok: true,
          userId: result.login.userId,
          tokenPresent: true,
          source: result.source || '',
          summary: result.summary || null
        };
      }
    });
  }

  logStore.append('runner', 'runner-start', {
    config: publicConfig(config),
    retention,
    statusServer: statusHandle ? { host: config.statusHost, port: statusHandle.port } : null
  });

  if (!['read-only', 'movement-only', 'non-combat-profit', 'profit-live', 'combat-dry-run', 'combat-live'].includes(String(config.controlMode || ''))) {
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
  if (!loginPointProvided && config.controlMode === 'read-only') {
    const bootstrap = await readOnlyCanary(config, {
      logStore,
      now,
      persistedState: readBrowserlessStateFile(stateFile),
      safetyController,
      allowMissingLoginPointBootstrap: true
    });
    const learned = learnedLoginPointFromCanary(bootstrap);
    if (learned.loginPoint) {
      updateBrowserlessStateFile(stateFile, {
        loginPointSafety: {
          ok: false,
          reason: 'learned-login-point-pending-snapshot-safety',
          point: learned.loginPoint,
          checkedAt: bootstrap.completedAt || new Date(now()).toISOString()
        },
        current: {
          self: learned.finalSelf
        },
        probes: {
          lastReadOnlyProbe: bootstrap
        }
      }, { updatedAt: new Date(now()).toISOString() });
      persisted = readBrowserlessStateFile(stateFile);
      config = hydrateConfigFromState(config, persisted);
      logStore.append('runner', 'login-point-learned', {
        point: learned.loginPoint,
        bootstrapRunId: bootstrap.runId || ''
      });
    } else {
      const result = { ok: false, mode: config.controlMode || 'read-only', reason: 'login-point-bootstrap-failed', canary: bootstrap };
      updateBrowserlessStateFile(stateFile, {
        runner: {
          running: false,
          mode: config.controlMode || 'read-only',
          lastRun: result,
          lastError: result.reason
        },
        probes: {
          lastReadOnlyProbe: bootstrap
        }
      }, { updatedAt: new Date(now()).toISOString() });
      logStore.append('runner', 'runner-stop', result);
      return result;
    }
  }
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
  const { finalSelf, loginPoint: learnedLoginPoint } = learnedLoginPointFromCanary(canary);
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
    ...(learnedLoginPoint ? {
      loginPointSafety: {
        ok: Boolean(canary?.snapshotSafety?.ok),
        reason: canary?.snapshotSafety?.reason || 'learned-from-canary-self',
        point: learnedLoginPoint,
        checkedAt: canary?.completedAt || new Date(now()).toISOString()
      },
      current: {
        ...(finalDecisionPatch.current || {}),
        self: finalSelf
      }
    } : {}),
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
      'self-test-token',
      '--login-point-x',
      '1',
      '--login-point-y',
      '2',
      '--login-point-hp',
      '100'
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
  hydrateConfigFromState,
  learnedLoginPointFromCanary,
  publicConfig,
  runBrowserlessRunner,
  runBrowserlessRunnerSelfTest
};
