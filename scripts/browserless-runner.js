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
  runBrowserlessRunner,
  hydrateConfigFromState,
  runBrowserlessRunnerSelfTest
} = require('../src/node/browserless/runner');
const {
  browserlessStatsForOffline,
  readBrowserlessStateFile,
  updateBrowserlessStateFile
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
  return {
    stamina1dRemainingMilli: response.stamina_1d_remaining_milli ?? response.stamina1dRemainingMilli ?? null,
    stamina1dLimitMilli: response.stamina_1d_limit_milli ?? response.stamina1dLimitMilli ?? null
  };
}

function shutdownLastRealtimeTick(state = {}) {
  const canary = state?.runner?.lastRun?.canary || {};
  const candidates = [
    canary?.state?.realtime?.tick,
    canary?.stats?.tick?.last,
    canary?.decisions?.last?.tick,
    canary?.decisions?.last?.input?.realtime?.tick
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
    runId: String(canary.runId || '')
  };
}

async function gracefulShutdownLeave(config, options = {}) {
  const readState = options.readState || readBrowserlessStateFile;
  const state = readState(config.stateFile);
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
  if (result?.ok) {
    try {
      const now = typeof options.now === 'function' ? options.now : Date.now;
      const nowMs = now();
      const at = new Date(nowMs).toISOString();
      const latestState = readState(config.stateFile);
      const updateState = options.updateState || updateBrowserlessStateFile;
      const confirmedLeave = shutdownConfirmedLeaveState(latestState, nowMs);
      updateState(config.stateFile, {
        runner: {
          confirmedLeave
        },
        stats: browserlessStatsForOffline(latestState, {
          at,
          reason: 'shutdown-leave',
          runId: confirmedLeave.runId,
          stamina: shutdownStaminaDetail(result)
        }, { nowMs })
      }, { updatedAt: at });
      statsFinalized = true;
    } catch (err) {
      statsFinalizeError = err?.message || String(err);
    }
  }
  return {
    ok: Boolean(result?.ok),
    skipped: false,
    statsFinalized,
    statsFinalizeError,
    leave: summarizeLeaveResultForPublic(result)
  };
}

function installGracefulShutdownHandlers(config, options = {}) {
  if (config.selfTest || config.help) return;
  let shuttingDown = false;
  const log = typeof options.log === 'function' ? options.log : message => console.error(message);
  const exit = typeof options.exit === 'function' ? options.exit : code => process.exit(code);
  const signals = options.signals || ['SIGINT', 'SIGTERM'];
  const signalExitCode = signal => signal === 'SIGTERM' ? 143 : 130;
  const onSignal = signal => {
    if (shuttingDown) {
      exit(signalExitCode(signal));
      return;
    }
    shuttingDown = true;
    log(JSON.stringify({ type: 'shutdown-leave-start', signal }));
    gracefulShutdownLeave(config, options)
      .then(result => {
        log(JSON.stringify({ type: 'shutdown-leave-finish', signal, result }));
      })
      .catch(err => {
        log(JSON.stringify({ type: 'shutdown-leave-error', signal, error: err?.message || String(err) }));
      })
      .finally(() => exit(0));
  };
  for (const signal of signals) {
    process.once(signal, () => onSignal(signal));
  }
}

async function main() {
  const config = parseBrowserlessRunnerArgs(process.argv.slice(2), process.env);
  installGracefulShutdownHandlers(config);
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
        const result = await runBrowserlessRunner(config);
        console.log(JSON.stringify(result, null, 2));
        if (config.once || config.dryRun || result?.reason === 'explicit-stop' || result?.reason === 'unsupported-control-mode') {
          if (!result?.ok && result?.reason !== 'explicit-stop') process.exitCode = 1;
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
