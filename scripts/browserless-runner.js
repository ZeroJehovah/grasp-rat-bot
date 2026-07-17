#!/usr/bin/env node
'use strict';

// Resolve the deployed commit before loading the runtime so every stream can
// bind its records to one immutable revision. Failure remains non-fatal and is
// reported by runtime-revision.js in runner-start diagnostics.
if (!process.env.GRASP_RAT_BROWSERLESS_REVISION) {
  const resolved = require('../src/node/browserless/runtime-revision').resolveRepositoryRevision({
    root: require('path').resolve(__dirname, '..')
  });
  if (resolved.revision !== 'unknown') process.env.GRASP_RAT_BROWSERLESS_REVISION = resolved.revision;
}

const {
  parseBrowserlessRunnerArgs,
  usage
} = require('../src/node/browserless/config');
const {
  CONFIRMED_LEAVE_SNAPSHOT_IGNORE_MS,
  browserlessTerminalStopRequestsRuntimeClose,
  runBrowserlessRunner,
  hydrateConfigFromState,
  runBrowserlessRunnerSelfTest,
  summarizeBrowserlessRunnerResult
} = require('../src/node/browserless/runner');
const {
  browserlessStatsForOffline,
  mergeState,
  readBrowserlessStateFile,
  writeBrowserlessStateFile
} = require('../src/node/browserless/state-file');
const {
  leaveWithVerification,
  summarizeLeaveResultForPublic
} = require('../src/node/browserless/leave-client');
const {
  startLogRetentionScheduler
} = require('../src/node/browserless/log-retention');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function lastLeaveResponse(result) {
  const attempts = Array.isArray(result?.attempts) ? result.attempts : [];
  for (let i = attempts.length - 1; i >= 0; i -= 1) {
    const response = attempts[i]?.response;
    if (response && typeof response === 'object') return response;
  }
  return null;
}

function shutdownStaminaDetail(result) {
  const response = lastLeaveResponse(result);
  if (!response) return null;
  const raw = {
    stamina5sRemainingMilli: response.stamina_5s_remaining_milli ?? response.stamina5sRemainingMilli ?? null,
    stamina5sLimitMilli: response.stamina_5s_limit_milli ?? response.stamina5sLimitMilli ?? null,
    stamina1hRemainingMilli: response.stamina_1h_remaining_milli ?? response.stamina1hRemainingMilli ?? null,
    stamina1hLimitMilli: response.stamina_1h_limit_milli ?? response.stamina1hLimitMilli ?? null,
    stamina1dRemainingMilli: response.stamina_1d_remaining_milli ?? response.stamina1dRemainingMilli ?? null,
    stamina1dLimitMilli: response.stamina_1d_limit_milli ?? response.stamina1dLimitMilli ?? null
  };
  const detail = Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== null && value !== undefined));
  return Object.keys(detail).length ? detail : null;
}

function shutdownSelfDetail(result, state = {}, userId = 0) {
  const response = lastLeaveResponse(result) || {};
  const current = state?.current?.self && typeof state.current.self === 'object' ? state.current.self : {};
  const lastKnown = state?.lastKnown?.self && typeof state.lastKnown.self === 'object' ? state.lastKnown.self : {};
  const drop = response.death_drop_coins ?? response.death_reward_preview ?? response.drop ?? current.drop ?? lastKnown.drop;
  return {
    ...lastKnown,
    ...current,
    userId: Number(response.user_id ?? response.userId ?? current.userId ?? lastKnown.userId ?? userId) || 0,
    entityId: response.entity_id ?? response.entityId ?? current.entityId ?? lastKnown.entityId ?? null,
    name: response.name || current.name || lastKnown.name || '',
    x: response.x ?? current.x ?? lastKnown.x ?? null,
    y: response.y ?? current.y ?? lastKnown.y ?? null,
    hp: response.hp ?? current.hp ?? lastKnown.hp ?? null,
    drop: drop === null || drop === undefined || drop === '' ? null : Number(drop),
    dropKnown: drop !== null && drop !== undefined && drop !== '',
    deathCount: response.death_count ?? response.deathCount ?? current.deathCount ?? null,
    life: response.life || current.life || '',
    alive: String(response.life || current.life || '').toLowerCase() !== 'dead',
    authority: result?.ok ? 'verified-leave' : (current.authority || lastKnown.authority || '')
  };
}

function snapshotLiveState(options, persistedState) {
  if (typeof options.getLiveState !== 'function') return persistedState;
  try {
    const live = options.getLiveState();
    if (!live || typeof live !== 'object') return persistedState;
    return mergeState(persistedState, JSON.parse(JSON.stringify(live)));
  } catch (_) {
    return persistedState;
  }
}

function shutdownLastRealtimeTick(state = {}) {
  const canary = state?.runner?.lastRun?.canary || {};
  const candidates = [
    canary?.state?.realtime?.tick,
    canary?.stats?.tick?.last,
    canary?.decisions?.last?.tick,
    canary?.decisions?.last?.input?.realtime?.tick,
    state?.current?.decision?.tick,
    state?.current?.decision?.input?.realtime?.tick
  ].map(Number).filter(value => Number.isFinite(value) && value > 0);
  return candidates.length ? Math.max(...candidates) : 0;
}

function shutdownConfirmedLeaveState(state = {}, nowMs = Date.now()) {
  const confirmedAtMs = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  const canary = state?.runner?.lastRun?.canary || {};
  return {
    confirmedAt: new Date(confirmedAtMs).toISOString(),
    snapshotIgnoreUntil: new Date(confirmedAtMs + CONFIRMED_LEAVE_SNAPSHOT_IGNORE_MS).toISOString(),
    lastRealtimeTick: shutdownLastRealtimeTick(state),
    runId: String(state?.current?.decision?.runId || canary.runId || '')
  };
}

async function gracefulShutdownLeave(config, options = {}) {
  const readState = options.readState || readBrowserlessStateFile;
  const persistedState = readState(config.stateFile);
  const state = snapshotLiveState(options, persistedState);
  const hydrated = hydrateConfigFromState(config, state);
  const userId = Number(hydrated.userId || 0);
  const sessionToken = String(hydrated.sessionToken || '');
  if (!userId || !sessionToken) {
    return { ok: false, skipped: true, reason: 'missing-session' };
  }
  const leave = options.leaveWithVerification || leaveWithVerification;
  const result = await leave({
    gameOrigin: hydrated.gameOrigin,
    userId,
    sessionToken,
    localAddress: state?.network?.sourceIp || hydrated.sourceIp || '',
    timeoutMs: Math.min(Math.max(1000, Number(hydrated.httpTimeoutMs || 10000)), 5000),
    retryMax: Math.min(Math.max(0, Number(hydrated.leaveRetryMax ?? 3)), 2),
    retryDelayMs: Math.min(Math.max(0, Number(hydrated.leaveRetryMs ?? 200)), 800),
    hedgeDelayMs: Math.min(Math.max(0, Number(hydrated.leaveHedgeMs ?? 1000)), 2000)
  });
  let statsFinalized = false;
  let statsFinalizeError = '';
  let statePersisted = false;
  try {
    const now = typeof options.now === 'function' ? options.now : Date.now;
    const nowMs = now();
    const at = new Date(nowMs).toISOString();
    const writeState = options.writeState || writeBrowserlessStateFile;
    const self = shutdownSelfDetail(result, state, userId);
    const knownStamina = state?.current?.stamina || state?.lastKnown?.stamina || null;
    const leaveStamina = shutdownStaminaDetail(result);
    const stamina = leaveStamina ? { ...(knownStamina || {}), ...leaveStamina } : knownStamina;
    const confirmedLeave = result?.ok ? shutdownConfirmedLeaveState(state, nowMs) : null;
    const stats = result?.ok
      ? browserlessStatsForOffline(state, {
          at,
          reason: 'shutdown-leave',
          runId: confirmedLeave.runId,
          self,
          stamina
        }, { nowMs })
      : state.stats;
    const finalState = mergeState(state, {
      updatedAt: at,
      ...(result?.ok ? {
        runner: {
          confirmedLeave
        }
      } : {}),
      current: {
        self,
        ...(stamina ? { stamina } : {})
      },
      lastKnown: {
        self,
        ...(stamina ? { stamina } : {}),
        at,
        tick: shutdownLastRealtimeTick(state) || null
      },
      stats
    });
    writeState(config.stateFile, finalState);
    statePersisted = true;
    statsFinalized = Boolean(result?.ok);
  } catch (err) {
    statsFinalizeError = err?.message || String(err);
  }
  return {
    ok: Boolean(result?.ok),
    skipped: false,
    statsFinalized,
    statePersisted,
    statsFinalizeError,
    leave: summarizeLeaveResultForPublic(result)
  };
}

function installGracefulShutdownHandlers(config, options = {}) {
  if (config.selfTest || config.help) return;
  let signalCount = 0;
  const log = typeof options.log === 'function' ? options.log : message => console.error(message);
  const exit = typeof options.exit === 'function' ? options.exit : code => process.exit(code);
  const flushBackgroundIo = typeof options.flushBackgroundIo === 'function'
    ? options.flushBackgroundIo
    : async () => null;
  const signals = options.signals || ['SIGINT', 'SIGTERM'];
  const signalExitCode = signal => signal === 'SIGTERM' ? 143 : 130;
  const onSignal = signal => {
    signalCount += 1;
    const lifecycleControl = typeof options.getLifecycleControl === 'function'
      ? options.getLifecycleControl()
      : null;
    if (lifecycleControl?.requestDrain && signalCount === 1) {
      const result = lifecycleControl.requestDrain('restart-drain', { source: 'signal', signal });
      log(JSON.stringify({ type: 'shutdown-drain-requested', signal, result }));
      return;
    }
    if (lifecycleControl?.forceStop && signalCount === 2) {
      const result = lifecycleControl.forceStop('explicit-stop', { source: 'signal-force', signal });
      log(JSON.stringify({ type: 'shutdown-force-stop-requested', signal, result }));
      return;
    }
    if (signalCount >= 3) {
      exit(signalExitCode(signal));
      return;
    }
    log(JSON.stringify({ type: 'shutdown-leave-start', signal }));
    gracefulShutdownLeave(config, options)
      .then(result => {
        log(JSON.stringify({ type: 'shutdown-leave-finish', signal, result }));
      })
      .catch(err => {
        log(JSON.stringify({ type: 'shutdown-leave-error', signal, error: err?.message || String(err) }));
      })
      .finally(async () => {
        try {
          const result = await flushBackgroundIo();
          if (result) log(JSON.stringify({ type: 'shutdown-background-io-flush', signal, result }));
        } catch (err) {
          log(JSON.stringify({ type: 'shutdown-background-io-error', signal, error: err?.message || String(err) }));
        }
        exit(0);
      });
  };
  for (const signal of signals) {
    process.on(signal, () => onSignal(signal));
  }
}

async function main() {
  const config = parseBrowserlessRunnerArgs(process.argv.slice(2), process.env);
  if (config.help) {
    console.log(usage());
    return;
  }
  if (config.selfTest) {
    const result = await runBrowserlessRunnerSelfTest();
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
    return;
  }
  let activeBackgroundIo = null;
  let activeLiveStateProvider = null;
  let activeLifecycleControl = null;
  let exitAfterSignalStop = false;
  installGracefulShutdownHandlers(config, {
    getLiveState: () => activeLiveStateProvider?.() || null,
    getLifecycleControl: () => activeLifecycleControl,
    flushBackgroundIo: async () => {
      const current = activeBackgroundIo;
      activeBackgroundIo = null;
      return current?.close?.({ timeoutMs: 5000 }) || null;
    }
  });
  const retentionScheduler = startLogRetentionScheduler(config.logDir, {
    keepDays: config.logRetentionDays,
    onResult(result) {
      if (result.removed?.length) {
        console.log(JSON.stringify({ type: 'scheduled-log-retention', ...result }));
      }
    },
    onError(err) {
      console.error(JSON.stringify({
        type: 'scheduled-log-retention-error',
        error: err?.message || String(err)
      }));
    }
  });
  try {
    while (true) {
      try {
        const result = await runBrowserlessRunner(config, {
          onBackgroundIoReady: backgroundIo => {
            activeBackgroundIo = backgroundIo || null;
          },
          onLiveStateReady: provider => {
            activeLiveStateProvider = typeof provider === 'function' ? provider : null;
          },
          onLifecycleControlReady: control => {
            activeLifecycleControl = control || null;
          }
        });
        console.log(JSON.stringify({ type: 'runner-result', ...summarizeBrowserlessRunnerResult(result) }));
        exitAfterSignalStop = exitAfterSignalStop
          || browserlessTerminalStopRequestsRuntimeClose(result, result?.reason);
        if (config.once || config.dryRun || result?.reason === 'explicit-stop' || result?.reason === 'restart-drain-ready' || result?.reason === 'unsupported-control-mode') {
          if (!result?.ok && !['explicit-stop', 'restart-drain-ready'].includes(result?.reason)) process.exitCode = 1;
          return;
        }
      } catch (err) {
        console.error(err?.stack || err?.message || String(err));
        if (config.once) {
          process.exitCode = 1;
          return;
        }
      }
      await sleep(Math.max(1000, Number(config.loopDelayMs || 30000)));
    }
  } finally {
    retentionScheduler.stop();
    const current = activeBackgroundIo;
    activeBackgroundIo = null;
    if (current?.close) await current.close({ timeoutMs: 5000 });
    if (exitAfterSignalStop) process.exit(process.exitCode || 0);
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error(err?.stack || err?.message || String(err));
    process.exitCode = 1;
  });
}

module.exports = {
  gracefulShutdownLeave,
  installGracefulShutdownHandlers,
  main,
  shutdownConfirmedLeaveState,
  shutdownLastRealtimeTick
};
