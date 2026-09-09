'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseBrowserlessRunnerArgs } = require('./config');
const { readBrowserlessStateFile, updateBrowserlessStateFile } = require('./state-file');
const { evaluateLoginPointReloginShortcutCore } = require('../../strategy/login-point-relogin-shortcut');
const { utc8DayKey } = require('./utc8-day');

function fixtureConfig(root, name, once = true) {
  return parseBrowserlessRunnerArgs([
    ...(once ? ['--once'] : []), '--live', '--data-dir', path.join(root, name),
    '--loop-delay-ms', '1000', '--user-id', '7', '--session-token', 'offline-transition-fixture',
    '--login-point-x', '0', '--login-point-y', '0', '--login-point-hp', '100'
  ], {});
}

function fixtureDeps(now) {
  return {
    now,
    startStatusServer: false,
    disableBackgroundIo: true,
    disableSourceIpPreflight: true,
    snapshotGapPoller: {
      start() {}, stop() {}, noteSnapshot() {}, refreshSchedule() {},
      status: () => ({ stopped: true, intervalMs: 30000 })
    },
    remoteProfitWorker: {
      context: () => null, reset() {}, status: () => null, close: async () => ({ ok: true })
    },
    fetchWithTimeout: async () => { throw new Error('fixture must not send HTTP'); },
    openBrowserlessWs: async () => { throw new Error('fixture must not open WS'); }
  };
}

async function runBrowserlessRunnerStateTransitionSelfTest() {
  // Resolve lazily so the runner can include this integration suite itself.
  const { runBrowserlessRunner } = require('./runner');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'grasp-rat-runner-transitions-'));
  const checks = {};
  const snapshots = [];
  const shortcuts = [];
  try {
    const atMs = Date.parse('2026-09-09T04:00:00.000Z');
    for (const shape of [
      { name: 'fresh-absent', fresh: true, present: false, pending: false },
      { name: 'pending-absent', fresh: true, present: false, pending: true },
      { name: 'pending-present', fresh: true, present: true, pending: true },
      { name: 'pending-stale', fresh: false, present: false, pending: true },
      { name: 'uncertain-entry', fresh: true, present: false, pending: true, uncertain: true }
    ]) {
      const config = fixtureConfig(root, shape.name);
      const confirmedLeave = {
        confirmedAt: new Date(atMs - 1000).toISOString(),
        snapshotIgnoreUntil: new Date(atMs + 39000).toISOString(), lastRealtimeTick: 10, runId: 'prior'
      };
      const pendingExit = shape.pending ? {
        active: true, exitAttemptId: `exit:${shape.name}`, sourceRunId: 'prior', reason: 'frame-gap',
        firstAtMs: atMs - 2000, lastAttemptAtMs: atMs - 1000, nextRetryAtMs: atMs,
        entryUnconfirmed: shape.uncertain === true, lastHp: null, minHp: null, startHp: null
      } : null;
      updateBrowserlessStateFile(config.stateFile, {
        stats: { today: { day: utc8DayKey(atMs), sessionCount: 1 } },
        runner: { confirmedLeave, pendingExit, snapshotStatus: { lastResult: 'before-safety', lastReason: 'old' } }
      });
      const safety = {
        ok: shape.fresh, satisfied: shape.fresh, attempted: true,
        reason: !shape.fresh ? 'snapshot-stale' : shape.present ? 'self-present-reentry' : 'safe',
        checkedAt: new Date(atMs).toISOString(), startedAtMs: atMs - 40,
        snapshotPurpose: shape.pending ? 'exit-recovery-confirmation' : 'login-point-safety',
        bypassedPreLoginSafety: shape.present,
        response: { ok: true, status: 200, summary: { selfPresent: shape.present, freshness: { ok: shape.fresh }, tick: 11 } }
      };
      let observed = null;
      let getLiveState = null;
      await runBrowserlessRunner(config, {
        ...fixtureDeps(() => atMs),
        onLiveStateReady: getter => { getLiveState = getter; },
        runReadOnlyOnce: async (_config, options) => {
          options.onSnapshotSafety(safety);
          observed = { disk: readBrowserlessStateFile(config.stateFile), live: getLiveState() };
          return {
            ok: true, runId: shape.name, completedAt: new Date(atMs).toISOString(), snapshotSafety: safety,
            recovery: { pendingExitResolution: shape.fresh && !shape.present && !shape.uncertain ? 'fresh-snapshot-self-absent' : '' }
          };
        }
      });
      const expectCleared = shape.pending && shape.fresh && !shape.present && !shape.uncertain;
      for (const source of ['disk', 'live']) {
        const status = observed[source].runner.snapshotStatus;
        checks[`${shape.name}-${source}-snapshot-result`] = status?.lastResult === (shape.fresh ? 'safe' : 'unsafe')
          && status.lastReason === safety.reason && status.checkedAt === safety.checkedAt
          && status.selfPresent === shape.present && status.lastHttpStatus === 200 && status.inFlight === false;
        checks[`${shape.name}-${source}-confirmed-leave`] = shape.fresh
          ? observed[source].runner.confirmedLeave === null
          : observed[source].runner.confirmedLeave?.runId === 'prior';
        checks[`${shape.name}-${source}-pending-exit`] = shape.pending && !expectCleared
          ? observed[source].runner.pendingExit?.exitAttemptId === pendingExit.exitAttemptId
          : observed[source].runner.pendingExit === null;
      }
      checks[`${shape.name}-outcome`] = expectCleared
        ? observed.disk.runner.exitRecoveryOutcomes.length === 1
          && observed.disk.runner.exitRecoveryOutcomes[0].exitAttemptId === pendingExit.exitAttemptId
          && observed.disk.runner.pendingLoginRecovery?.recoveredFromExitAttemptId === pendingExit.exitAttemptId
        : observed.disk.runner.exitRecoveryOutcomes.length === 0;
      snapshots.push({ name: shape.name, status: observed.disk.runner.snapshotStatus, pending: Boolean(observed.disk.runner.pendingExit) });
    }

    for (const shape of [
      { name: 'daily-limit', initialCount: 5, expectedBlock: 'daily-limit' },
      { name: 'cooldown', initialCount: 1, expectedBlock: 'cooldown' },
      { name: 'failed-leave-retry', initialCount: 5, retry: true, expectedBlock: 'daily-limit' },
      { name: 'midnight-completion', initialCount: 5, midnight: true, expectedBlock: 'ok' }
    ]) {
      const triggerAtMs = shape.midnight ? Date.parse('2026-09-09T15:59:59.500Z') : atMs;
      let nowMs = triggerAtMs;
      const config = fixtureConfig(root, shape.name, false);
      updateBrowserlessStateFile(config.stateFile, {
        stats: { today: { day: utc8DayKey(nowMs), sessionCount: 1 }, currentSession: { online: false } },
        runner: { loginPointReloginShortcut: {
          dayKey: utc8DayKey(nowMs), dayCount: shape.initialCount, lastTriggeredAt: nowMs - 600000, lastSummary: null
        } }
      });
      const contexts = [];
      let calls = 0;
      const leaveResponse = { ok: true, event: 'left', user_id: 7, x: 100, y: 200, hp: 100 };
      const summary = { shouldRelogin: true, targetKey: 'user:99', netGainMs: 100000 };
      const result = await runBrowserlessRunner(config, {
        ...fixtureDeps(() => nowMs),
        sleep: async ms => { nowMs += ms; },
        runReadOnlyOnce: async (_config, options) => {
          contexts.push(options.loginPointReloginShortcutContext);
          calls++;
          if (calls > 3) throw new Error('unexpected extra runner cycle');
          const first = calls === 1;
          const retry = shape.retry && calls === 2;
          if (!first && !retry) return {
            ok: false, runId: 'stop', completedAt: new Date(nowMs).toISOString(),
            safety: { event: { reason: 'restart-drain-ready', shouldLeave: false } }
          };
          if (first && shape.midnight) nowMs += 2000;
          return {
            ok: false, runId: first ? 'shortcut-trigger' : 'shortcut-recovery', completedAt: new Date(nowMs).toISOString(),
            leave: { ok: !first || !shape.retry, attempts: [{ ok: !first || !shape.retry, status: first && shape.retry ? 502 : 200, response: first && shape.retry ? {} : leaveResponse }] },
            safety: { event: {
              reason: 'login-point-relogin-shortcut-leave', shouldLeave: true,
              at: new Date(first ? triggerAtMs : nowMs).toISOString(),
              detail: first ? { decision: { loginPointShortcut: summary } } : { exitRecovery: true, continuePendingExit: true }
            } }
          };
        }
      });
      const persisted = readBrowserlessStateFile(config.stateFile).runner.loginPointReloginShortcut;
      const finalContext = contexts.at(-1);
      const evaluation = evaluateLoginPointReloginShortcutCore(null, {
        ...finalContext, nowMs, sessionId: 'next-session',
        self: { x: 100000, y: 0, hp: 100 }, target: { userId: 99, x: 1000, y: 0, drop: 100 },
        targetKind: 'enemy', entryLoginPoint: { x: 0, y: 0 },
        lastLoginAtMs: nowMs - 60000, sourceIpProbeReusable: true
      });
      checks[`${shape.name}-loop-completes`] = result.reason === 'restart-drain-ready' && calls === (shape.retry ? 3 : 2);
      checks[`${shape.name}-disk-count`] = persisted.dayCount === shape.initialCount + 1
        && persisted.dayKey === utc8DayKey(triggerAtMs) && persisted.lastTriggeredAt === triggerAtMs
        && persisted.lastSummary?.targetKey === summary.targetKey;
      checks[`${shape.name}-next-context`] = finalContext.dayCount === (shape.midnight ? 0 : shape.initialCount + 1)
        && finalContext.lastTriggeredAt === (shape.midnight ? 0 : triggerAtMs);
      checks[`${shape.name}-policy`] = evaluation.blockReason === shape.expectedBlock;
      let restartedContext = null;
      await runBrowserlessRunner({ ...config, once: true }, {
        ...fixtureDeps(() => nowMs),
        runReadOnlyOnce: async (_config, options) => {
          restartedContext = options.loginPointReloginShortcutContext;
          return { ok: true, runId: 'restarted', completedAt: new Date(nowMs).toISOString() };
        }
      });
      checks[`${shape.name}-restart-context`] = restartedContext.dayCount === (shape.midnight ? 0 : shape.initialCount + 1)
        && restartedContext.lastTriggeredAt === (shape.midnight ? 0 : triggerAtMs);
      shortcuts.push({ name: shape.name, persisted, contexts, restartedContext, blockReason: evaluation.blockReason });
    }
    return { ok: Object.values(checks).every(Boolean), checks, snapshots, shortcuts };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

module.exports = { runBrowserlessRunnerStateTransitionSelfTest };

if (require.main === module) runBrowserlessRunnerStateTransitionSelfTest().then(result => {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}).catch(error => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
