#!/usr/bin/env node
'use strict';

const {
  parseBrowserlessRunnerArgs,
  usage
} = require('../src/node/browserless/config');
const {
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
      updateState(config.stateFile, {
        stats: browserlessStatsForOffline(latestState, {
          at,
          reason: 'shutdown-leave',
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
  main
};
