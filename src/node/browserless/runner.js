'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseBrowserlessRunnerArgs } = require('./config');
const { cleanupOldLogDays } = require('./log-retention');
const { createLocalLogStore } = require('./local-log-store');
const {
  browserlessStatsForDecision,
  browserlessStatsForOffline,
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
const { createBrowserlessActionAdapter } = require('./action-adapter');
const { createSourceIpController } = require('./source-ip-controller');
const { createBrowserlessSafetyController } = require('./safety-controller');
const { redactSecrets } = require('./session-client');

function publicConfig(config) {
  return {
    gameOrigin: config.gameOrigin,
    wsPath: config.wsPath,
    wsExtraQuery: config.wsExtraQuery,
    snapshotPath: config.snapshotPath,
    targetWhitelistUrl: redactSecrets(config.targetWhitelistUrl || ''),
    targetWhitelistFile: config.targetWhitelistFile || '',
    targetWhitelistTimeoutMs: Number(config.targetWhitelistTimeoutMs || 0),
    targetWhitelistMaxNames: Number(config.targetWhitelistMaxNames || 0),
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
    loopDelayMs: Number(config.loopDelayMs || 0),
    staleSelfMs: Number(config.staleSelfMs || 0),
    noSelfGraceMs: Number(config.noSelfGraceMs || 0),
    staminaExhaustedBelowMs: Number(config.staminaExhaustedBelowMs || 0),
    movementCommandIntervalMs: Number(config.movementCommandIntervalMs || 0),
    movementTargetDeadZoneCm: Number(config.movementTargetDeadZoneCm || 0),
    movementSettlementFrames: Number(config.movementSettlementFrames || 0),
    combatEnabled: Boolean(config.combatEnabled),
    combatShootMinIntervalMs: Number(config.combatShootMinIntervalMs || 0),
    wsTraceEnabled: Boolean(config.wsTraceEnabled),
    wsTracePayload: Boolean(config.wsTracePayload),
    wsTraceMaxPayloadChars: Number(config.wsTraceMaxPayloadChars || 0),
    sourceIp: config.sourceIp || '',
    sourceIps: config.sourceIps || [],
    stateFile: config.stateFile || stateFilePath(config),
    loginPointPresent: hasConfigNumber(config.loginPointX) && hasConfigNumber(config.loginPointY),
    userId: Number(config.userId || 0),
    sessionTokenPresent: Boolean(config.sessionToken)
  };
}

function hasConfigNumber(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}

function errorMessage(error) {
  return error?.message || String(error || 'unknown error');
}

function createNoThrowLogStore(logStore, onError = () => {}) {
  if (!logStore || typeof logStore !== 'object') return logStore;
  return {
    ...logStore,
    append(stream, type, detail = {}, options = {}) {
      try {
        return logStore.append(stream, type, detail, options);
      } catch (err) {
        onError(err, { operation: 'log-append', stream, type });
        return { error: errorMessage(err) };
      }
    },
    dayDirFor(ms) {
      try {
        return logStore.dayDirFor(ms);
      } catch (err) {
        onError(err, { operation: 'log-day-dir' });
        return '';
      }
    }
  };
}

function buildRunnerErrorCanary(error, config = {}, options = {}) {
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const message = errorMessage(error);
  const startedAt = options.startedAt || now();
  return {
    ok: false,
    runId: String(options.runId || `${config.controlMode || 'runner'}-error-${new Date(startedAt).toISOString().replace(/[-:.]/g, '')}`),
    mode: config.controlMode || 'read-only',
    startedAt: new Date(startedAt).toISOString(),
    completedAt: new Date(now()).toISOString(),
    error: message,
    safety: {
      event: null,
      exit: null,
      leaveFailure: null
    }
  };
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
  const entrySelf = canary?.entry?.firstSelf || null;
  if (!finalSelf || !Number.isFinite(Number(finalSelf.x)) || !Number.isFinite(Number(finalSelf.y))) {
    return { finalSelf: null, loginPoint: null };
  }
  const snapshotSelfPresent = Boolean(canary?.snapshotSafety?.response?.summary?.selfPresent);
  const hasEntrySummary = canary && Object.prototype.hasOwnProperty.call(canary, 'entry');
  let pointSelf = null;
  if (!snapshotSelfPresent) {
    if (entrySelf && Number.isFinite(Number(entrySelf.x)) && Number.isFinite(Number(entrySelf.y))) {
      pointSelf = entrySelf;
    } else if (!hasEntrySummary) {
      pointSelf = finalSelf;
    }
  }
  const pointSource = pointSelf === entrySelf ? 'browserless-entry-self' : 'canary-self';
  return {
    finalSelf,
    loginPoint: pointSelf
      ? {
          x: Number(pointSelf.x),
          y: Number(pointSelf.y),
          hp: Number.isFinite(Number(finalSelf.hp))
            ? Number(finalSelf.hp)
            : (Number.isFinite(Number(pointSelf.hp)) ? Number(pointSelf.hp) : null),
          source: pointSource
        }
      : null
  };
}

function browserlessLoopPlan(result, config = {}) {
  const canary = result?.canary || null;
  const safetyEvent = canary?.safety?.event || null;
  const safetyReason = safetyEvent?.reason || canary?.safety?.leaveFailure?.reason || '';
  const error = String(canary?.error || result?.reason || result?.error || '');
  const runId = canary?.runId || '';
  const snapshotSelfPresent = Boolean(canary?.snapshotSafety?.response?.summary?.selfPresent);
  const inGameRecoveryEvidence = Boolean(
    canary?.recovery?.inGameEvidence
      || snapshotSelfPresent
      || Number(canary?.stats?.selfPresent?.true || 0) > 0
      || canary?.entry?.firstSelf
      || safetyReason === 'direct-leave-failed'
      || canary?.safety?.leaveFailure
  );
  const delayMs = Math.max(1000, Number(config.loopDelayMs || 30000));
  const fastDelayMs = 1000;
  const stop = reason => ({
    continue: false,
    reason,
    delayMs: 0,
    previousRunId: runId,
    error,
    safetyReason
  });
  const resume = (reason, minimumDelayMs = 0) => ({
    continue: true,
    reason,
    delayMs: /^snapshot safety not confirmed:/i.test(error)
      ? Math.max(delayMs, 60000, Number(minimumDelayMs || 0))
      : Math.max(delayMs, Number(minimumDelayMs || 0)),
    previousRunId: runId,
    error,
    safetyReason
  });
  const resumeFast = reason => ({
    continue: true,
    reason,
    delayMs: fastDelayMs,
    previousRunId: runId,
    error,
    safetyReason
  });

  const decisionDelayMs = Number(
    safetyEvent?.detail?.decision?.reloginDelayMs
    ?? safetyEvent?.detail?.decision?.staminaBudgetExit?.reloginDelayMs
    ?? 0
  );
  const fastRecoverableTransportReasons = new Set([
    'frame-gap',
    'stale-self',
    'ws-closed',
    'ws-error'
  ]);

  if (config.once) return stop('once');
  if (!result) return resume('missing-result');
  if (result.reason === 'missing-manual-session') return resume('missing-manual-session');
  if (safetyReason === 'explicit-stop') return stop('explicit-stop');
  if (fastRecoverableTransportReasons.has(safetyReason)) {
    return resumeFast(safetyReason);
  }
  if (/websocket unexpected response 403|http 403|not logged in/i.test(error) && snapshotSelfPresent) {
    return resumeFast('ws-auth-blocked-self-present');
  }
  if (safetyReason === 'direct-leave-failed' || canary?.safety?.leaveFailure) return resumeFast('direct-leave-failed');
  if (safetyReason === 'no-self') return resume('no-self');
  if (/websocket unexpected response 403|http 403|missing-manual-session|login-point-bootstrap-failed/i.test(error)) {
    return resume(error || 'auth-or-bootstrap-retry');
  }
  if (result.ok) return resume('cycle-complete');
  if (safetyReason === 'stamina-budget-coin-leave' || safetyReason === 'stamina-exhausted-leave') {
    return resume(safetyReason, Number.isFinite(decisionDelayMs) ? decisionDelayMs : 0);
  }
  if ([
    'profit-live-snapshot-active-threat',
    'combat-hp-disadvantage-leave',
    'injury-leave',
    'pursuit-leave'
  ].includes(safetyReason)) {
    return resume(safetyReason);
  }
  if (/^websocket connect timeout$/i.test(error)) return resumeFast('ws-connect-timeout');
  if (/^snapshot safety not confirmed:/i.test(error)) {
    if (inGameRecoveryEvidence) return resumeFast('in-game-snapshot-safety-retry');
    return resume('snapshot-safety-retry');
  }
  return resume(error || safetyReason || 'unknown-error');
}

function runnerResultExitDetail(result, fallbackReason = '') {
  const canary = result?.canary && typeof result.canary === 'object' ? result.canary : {};
  const safetyReason = canary?.safety?.event?.reason || canary?.safety?.leaveFailure?.reason || '';
  const reason = safetyReason || result?.reason || canary?.error || result?.error || fallbackReason || '';
  return {
    at: canary?.completedAt || result?.completedAt || '',
    reason
  };
}

async function runBrowserlessRunner(config, deps = {}) {
  const now = typeof deps.now === 'function' ? deps.now : Date.now;
  const sleep = typeof deps.sleep === 'function'
    ? deps.sleep
    : ms => new Promise(resolve => setTimeout(resolve, ms));
  const supervisorErrors = [];
  const recordSupervisorError = (err, detail = {}) => {
    supervisorErrors.push({
      at: new Date(now()).toISOString(),
      error: errorMessage(err),
      detail
    });
    if (supervisorErrors.length > 20) supervisorErrors.splice(0, supervisorErrors.length - 20);
  };
  const rawLogStore = deps.logStore || createLocalLogStore({ logDir: config.logDir, now });
  const logStore = createNoThrowLogStore(rawLogStore, recordSupervisorError);
  const safetyController = deps.safetyController || createBrowserlessSafetyController({
    now,
    frameGapAlertMs: config.frameGapAlertMs,
    staleSelfMs: config.staleSelfMs,
    noSelfGraceMs: config.noSelfGraceMs,
    staminaExhaustedBelowMs: config.staminaExhaustedBelowMs
  });
  const stateFile = config.stateFile || stateFilePath(config);
  const updateState = (patch, options = {}) => {
    try {
      return updateBrowserlessStateFile(stateFile, patch, options);
    } catch (err) {
      recordSupervisorError(err, { operation: 'state-update' });
      logStore.append('runner', 'state-update-error', { error: errorMessage(err) });
      return readBrowserlessStateFile(stateFile);
    }
  };
  const writeState = state => {
    try {
      return writeBrowserlessStateFile(stateFile, state);
    } catch (err) {
      recordSupervisorError(err, { operation: 'state-write' });
      logStore.append('runner', 'state-write-error', { error: errorMessage(err) });
      return readBrowserlessStateFile(stateFile);
    }
  };
  try {
    fs.mkdirSync(config.dataDir, { recursive: true });
  } catch (err) {
    recordSupervisorError(err, { operation: 'data-dir-create', dataDir: config.dataDir });
  }
  let retention = null;
  try {
    retention = cleanupOldLogDays(config.logDir, {
      nowMs: now(),
      keepDays: config.logRetentionDays
    });
  } catch (err) {
    recordSupervisorError(err, { operation: 'log-retention' });
    retention = { ok: false, error: errorMessage(err) };
  }
  let persisted = readBrowserlessStateFile(stateFile);
  const envSessionTokenProvided = Boolean(config.sessionToken);
  const envLoginPointProvided = hasConfigNumber(config.loginPointX) && hasConfigNumber(config.loginPointY);
  const persistedLoginPoint = loginPointFromAnyState(persisted);
  config = hydrateConfigFromState(config, persisted);
  let loginPointProvided = hasConfigNumber(config.loginPointX) && hasConfigNumber(config.loginPointY);
  persisted = writeState({
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

  const sourceIpController = deps.sourceIpController || createSourceIpController({
    config,
    stateFile,
    state: persisted,
    logStore,
    now,
    fetchWithTimeout: deps.fetchWithTimeout,
    openBrowserlessWs: deps.openBrowserlessWs,
    requestAuthUrl: deps.requestAuthUrl,
    submitCallbackInput: deps.submitCallbackInput,
    leaveWithVerification: deps.leaveWithVerification
  });
  config.sourceIp = sourceIpController.currentSourceIp();
  config.sourceIps = sourceIpController.sourceIps();
  persisted = readBrowserlessStateFile(stateFile);

  const refreshFromPersistedState = () => {
    persisted = readBrowserlessStateFile(stateFile);
    config = hydrateConfigFromState(config, persisted);
    try {
      sourceIpController.refreshFromState(persisted);
      config.sourceIp = sourceIpController.currentSourceIp();
      config.sourceIps = sourceIpController.sourceIps();
    } catch (err) {
      recordSupervisorError(err, { operation: 'source-ip-refresh' });
      logStore.append('runner', 'source-ip-refresh-error', { error: errorMessage(err) });
    }
  };

  const waitForLoopPlan = async (loopPlan, resultForStop = null) => {
    if (!loopPlan.continue) {
      if (!config.once) {
        const currentBeforeStop = readBrowserlessStateFile(stateFile);
        const stopDetail = runnerResultExitDetail(resultForStop, loopPlan.reason);
        updateState({
          runner: {
            running: false,
            currentAction: {
              kind: 'stopped',
              band: 'recover',
              reason: loopPlan.reason,
              previousRunId: loopPlan.previousRunId || ''
            }
          },
          stats: browserlessStatsForOffline(currentBeforeStop, {
            ...stopDetail,
            reason: stopDetail.reason || loopPlan.reason,
            nextRunAt: '',
            delayMs: 0
          }, { nowMs: now() })
        }, { updatedAt: new Date(now()).toISOString() });
        logStore.append('runner', 'runner-loop-stop', loopPlan);
      }
      if (resultForStop && loopPlan.reason === 'once') return resultForStop;
      return {
        ...(resultForStop || {
          ok: false,
          mode: config.controlMode || 'read-only'
        }),
        reason: loopPlan.reason || resultForStop?.reason || 'runner-loop-stop'
      };
    }

    const nextRunAtMs = now() + loopPlan.delayMs;
    const nextRunAt = new Date(nextRunAtMs).toISOString();
    const waitDetail = {
      ...loopPlan,
      nextRunAt,
      supervisorErrors: supervisorErrors.slice(-5)
    };
    const currentBeforeWait = readBrowserlessStateFile(stateFile);
    const waitExitDetail = runnerResultExitDetail(resultForStop, loopPlan.reason);
    updateState({
      runner: {
        running: true,
        mode: config.controlMode || 'read-only',
        lastError: '',
        currentAction: {
          kind: 'loop-wait',
          band: 'recover',
          reason: loopPlan.reason,
          delayMs: loopPlan.delayMs,
          nextRunAt,
          previousRunId: loopPlan.previousRunId || ''
        }
      },
      stats: browserlessStatsForOffline(currentBeforeWait, {
        ...waitExitDetail,
        reason: waitExitDetail.reason || loopPlan.reason,
        nextRunAt,
        delayMs: loopPlan.delayMs
      }, { nowMs: now() })
    }, { updatedAt: new Date(now()).toISOString() });
    logStore.append('runner', 'runner-loop-wait', waitDetail);
    try {
      await sleep(loopPlan.delayMs);
    } catch (err) {
      recordSupervisorError(err, { operation: 'loop-sleep', delayMs: loopPlan.delayMs });
      logStore.append('runner', 'loop-sleep-error', { error: errorMessage(err), delayMs: loopPlan.delayMs });
    }
    const requestedStop = safetyController.getStopEvent();
    if (requestedStop) {
      const stopped = {
        ok: false,
        mode: config.controlMode || 'read-only',
        reason: requestedStop.reason || 'explicit-stop',
        event: requestedStop
      };
      const currentBeforeStop = readBrowserlessStateFile(stateFile);
      updateState({
        runner: {
          running: false,
          lastRun: stopped,
          lastError: stopped.reason,
          currentAction: {
            kind: 'stopped',
            band: 'recover',
            reason: stopped.reason,
            previousRunId: loopPlan.previousRunId || ''
          }
        },
        stats: browserlessStatsForOffline(currentBeforeStop, {
          at: requestedStop.at,
          reason: stopped.reason,
          nextRunAt: '',
          delayMs: 0
        }, { nowMs: now() })
      }, { updatedAt: new Date(now()).toISOString() });
      logStore.append('runner', 'runner-loop-stop', {
        ...loopPlan,
        reason: stopped.reason,
        requestedStop
      });
      return stopped;
    }
    safetyController.clearStop();
    refreshFromPersistedState();
    return null;
  };

  let statusHandle = null;
  if (!config.once && Number(config.statusPort || 0) > 0 && deps.startStatusServer !== false) {
    const starter = deps.startStatusServer || startStatusServer;
    try {
      statusHandle = await starter({
        host: config.statusHost,
        port: config.statusPort,
        webToken: config.webToken,
        getStatus: () => buildPublicBrowserlessStatus(readBrowserlessStateFile(stateFile), config),
        onStop: async () => {
          const event = safetyController.requestStop('explicit-stop', { source: 'status-api' });
          const currentState = readBrowserlessStateFile(stateFile);
          updateState({
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
          const authUrl = await sourceIpController.requestAuthUrl({
            gameOrigin: config.gameOrigin,
            timeoutMs: config.httpTimeoutMs
          });
          updateState({
            session: {
              lastAuthUrl: authUrl,
              lastAuthUrlAt: new Date(now()).toISOString()
            }
          }, { updatedAt: new Date(now()).toISOString() });
          logStore.append('runner', 'auth-url', { authUrlPresent: Boolean(authUrl) });
          return { ok: true, authUrl };
        },
        onCallback: async input => {
          const result = await sourceIpController.submitCallbackInput(input, {
            gameOrigin: config.gameOrigin,
            timeoutMs: config.httpTimeoutMs
          });
          updateState({
            session: {
              userId: result.login.userId,
              sessionToken: result.login.sessionToken,
              tokenUpdatedAt: new Date(now()).toISOString(),
              lastLoginSource: result.source || '',
              lastLoginSummary: result.summary || null
            },
            runner: {
              lastError: '',
              currentAction: {
                kind: 'loop-wait',
                band: 'recover',
                reason: 'manual-session-updated'
              }
            }
          }, { updatedAt: new Date(now()).toISOString() });
          refreshFromPersistedState();
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
    } catch (err) {
      recordSupervisorError(err, { operation: 'status-server-start', host: config.statusHost, port: config.statusPort });
      logStore.append('runner', 'status-server-error', { error: errorMessage(err), host: config.statusHost, port: config.statusPort });
    }
  }

  logStore.append('runner', 'runner-start', {
    config: publicConfig(config),
    retention,
    statusServer: statusHandle ? { host: config.statusHost, port: statusHandle.port } : null
  });

  if (!['read-only', 'movement-only', 'non-combat-profit', 'profit-live', 'combat-dry-run', 'combat-live'].includes(String(config.controlMode || ''))) {
    const result = { ok: false, reason: 'unsupported-control-mode' };
    updateState({
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
    updateState({
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

  if (config.once && (!config.userId || !config.sessionToken)) {
    const result = { ok: false, reason: 'missing-manual-session' };
    updateState({
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
  while (true) {
    if (!config.userId || !config.sessionToken) {
      const result = { ok: false, mode: config.controlMode || 'read-only', reason: 'missing-manual-session' };
      updateState({
        runner: {
          running: true,
          mode: config.controlMode || 'read-only',
          lastRun: result,
          lastError: result.reason,
          currentAction: {
            kind: 'loop-wait',
            band: 'recover',
            reason: result.reason
          }
        }
      }, { updatedAt: new Date(now()).toISOString() });
      logStore.append('runner', 'runner-session-wait', result);
      const stopped = await waitForLoopPlan(browserlessLoopPlan(result, config), result);
      if (stopped) return stopped;
      continue;
    }
    loginPointProvided = hasConfigNumber(config.loginPointX) && hasConfigNumber(config.loginPointY);
    if (!loginPointProvided && config.controlMode === 'read-only') {
      let bootstrap;
      try {
        bootstrap = await readOnlyCanary(config, {
          logStore,
          now,
          persistedState: readBrowserlessStateFile(stateFile),
          safetyController,
          allowMissingLoginPointBootstrap: true,
          fetchWithTimeout: sourceIpController.fetchWithTimeout,
          openBrowserlessWs: sourceIpController.openBrowserlessWs,
          leaveWithVerification: sourceIpController.leaveWithVerification
        });
      } catch (err) {
        recordSupervisorError(err, { operation: 'login-point-bootstrap-canary' });
        bootstrap = buildRunnerErrorCanary(err, config, { now, runId: 'login-point-bootstrap-error' });
        logStore.append('runner', 'runner-canary-error', bootstrap);
      }
      const learned = learnedLoginPointFromCanary(bootstrap);
      if (learned.loginPoint) {
        updateState({
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
        updateState({
          runner: {
            running: !config.once,
            mode: config.controlMode || 'read-only',
            lastRun: result,
            lastError: result.reason
          },
          probes: {
            lastReadOnlyProbe: bootstrap
          }
        }, { updatedAt: new Date(now()).toISOString() });
        logStore.append('runner', 'runner-bootstrap-failed', result);
        const stopped = await waitForLoopPlan(browserlessLoopPlan(result, config), result);
        if (stopped) return stopped;
        continue;
      }
    }
    let canary;
    try {
      canary = await readOnlyCanary(config, {
        logStore,
        now,
        persistedState: readBrowserlessStateFile(stateFile),
        safetyController,
        fetchWithTimeout: sourceIpController.fetchWithTimeout,
        openBrowserlessWs: sourceIpController.openBrowserlessWs,
        leaveWithVerification: sourceIpController.leaveWithVerification,
        onDecision: decision => {
          const currentBeforeDecision = readBrowserlessStateFile(stateFile);
          updateState({
            ...decisionStatePatch(decision),
            stats: browserlessStatsForDecision(currentBeforeDecision, decision, { nowMs: now() })
          }, {
            updatedAt: new Date(now()).toISOString()
          });
        },
        onAction: (action, context = {}) => {
          updateState({
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
    } catch (err) {
      recordSupervisorError(err, { operation: 'canary' });
      canary = buildRunnerErrorCanary(err, config, { now });
      logStore.append('runner', 'runner-canary-error', canary);
    }
    const { finalSelf, loginPoint: learnedLoginPoint } = learnedLoginPointFromCanary(canary);
    const result = { ok: Boolean(canary?.ok), mode: config.controlMode || 'read-only', canary: canary || null };
    const finalDecisionPatch = canary?.decisions?.last ? decisionStatePatch(canary.decisions.last) : {};
    const safetyEvents = [canary?.safety?.event, canary?.safety?.leaveFailure].filter(Boolean);
    const currentStateBeforeFinish = readBrowserlessStateFile(stateFile);
    updateState({
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

    const loopPlan = browserlessLoopPlan(result, config);
    const stopped = await waitForLoopPlan(loopPlan, result);
    if (stopped) return stopped;
  }
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
    const wsClosedPlan = browserlessLoopPlan({
      ok: false,
      canary: {
        runId: 'self-test-ws-closed',
        error: 'ws-closed',
        safety: { event: { reason: 'ws-closed' } }
      }
    }, { loopDelayMs: 30000 });
    const combatExitPlan = browserlessLoopPlan({
      ok: false,
      canary: {
        runId: 'self-test-combat-exit',
        error: 'combat-hp-disadvantage-leave',
        safety: { event: { reason: 'combat-hp-disadvantage-leave' } }
      }
    }, { loopDelayMs: 30000 });
    const closedTransportAdapter = createBrowserlessActionAdapter({
      transport: {
        sendVelocity() {
          throw new Error('websocket is not open');
        }
      },
      now: () => Date.UTC(2026, 6, 8, 1, 2, 0),
      commandIntervalMs: 0
    });
    const closedTransportAction = closedTransportAdapter.applyDecision({}, {
      kind: 'wait',
      band: 'wait',
      reason: 'missing-realtime-self',
      action: { kind: 'wait', band: 'wait', reason: 'missing-realtime-self' }
    });
    const runnerLog = path.join(tmp, 'logs', '2026-07-08', 'runner.jsonl');
    const text = fs.readFileSync(runnerLog, 'utf8');
    return {
      ok: Boolean(
        dryRun.ok
        && liveRun.ok
        && /runner-dry-run/.test(text)
        && /runner-finish/.test(text)
        && !/self-test-token/.test(text)
        && wsClosedPlan.continue
        && wsClosedPlan.delayMs === 1000
        && combatExitPlan.continue
        && combatExitPlan.delayMs === 30000
        && closedTransportAction.ok === false
        && closedTransportAction.transportClosed === true
      ),
      dryRun,
      liveRun,
      wsClosedPlan,
      combatExitPlan,
      closedTransportAction,
      logFile: runnerLog
    };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

module.exports = {
  browserlessLoopPlan,
  hydrateConfigFromState,
  learnedLoginPointFromCanary,
  publicConfig,
  runBrowserlessRunner,
  runBrowserlessRunnerSelfTest
};
