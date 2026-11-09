'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseBrowserlessRunnerArgs } = require('./config');
const { readBrowserlessStateFile, updateBrowserlessStateFile } = require('./state-file');
const { evaluateLoginPointReloginShortcutCore } = require('../../strategy/login-point-relogin-shortcut');
const { buildBrowserlessDecision, summarizeBrowserlessDecision } = require('./decision-adapter');
const { serializableDecisionOptions } = require('./decision-worker');
const { evaluateBrowserlessSafety } = require('./safety-controller');
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
    // 2026-11-10 decisions.jsonl:1279: a 1839m approach could save 759m
    // from the login point. The obsolete synchronous probe budget blocked it.
    const incidentAtMs = Date.parse('2026-11-09T16:20:47.625Z');
    const incidentLoginAtMs = Date.parse('2026-11-09T16:00:11.426Z');
    const loginPoint = { x: 5999, y: 66268 };
    const selectedIps = ['10.0.0.61', '10.0.0.62', '10.0.0.63'];
    const shortcutPaths = [];
    for (const mode of ['cached', 'synchronous', 'selector-unavailable']) {
      const config = fixtureConfig(root, `shortcut-${mode}`);
      updateBrowserlessStateFile(config.stateFile, {
        stats: { today: { day: utc8DayKey(incidentAtMs), sessionCount: 1 } },
        runner: { lastLoginAt: new Date(incidentLoginAtMs).toISOString() },
        loginPointSafety: { point: { ...loginPoint, hp: 100 } }
      });
      let requestCount = 0;
      let selectionCount = 0;
      let context = null;
      const cachedSelector = {
        selectSourceIps: () => {
          selectionCount++;
          return {
            ok: true, cached: true, reason: 'source-ip-probe-selected',
            availableIps: selectedIps,
            sourceIpPreflight: {
              phase: 'ready', queuePhase: 'cached-history', reuseWithoutRetest: false,
              completedAt: new Date(incidentAtMs).toISOString(),
              availableIps: selectedIps, availableCount: 3, requiredCount: 3
            }
          };
        }
      };
      await runBrowserlessRunner(config, {
        ...fixtureDeps(() => incidentAtMs),
        disableSourceIpPreflight: false,
        monotonicNow: () => 0,
        discoverSourceIps: () => selectedIps,
        sourceIpProbe: mode === 'cached' ? cachedSelector : mode === 'selector-unavailable' ? {} : null,
        sourceIpPreflightRequest: async () => { requestCount++; return { status: 200 }; },
        runReadOnlyOnce: async (_config, options) => {
          context = options.loginPointReloginShortcutContext;
          return { ok: true, runId: `shortcut-${mode}`, completedAt: new Date(incidentAtMs).toISOString() };
        }
      });
      const self = {
        entity_id: 1, user_id: 7, name: 'self', x: 79135, y: -42032, hp: 100, max_hp: 100,
        stamina_5s_remaining_milli: 10000, stamina_5s_limit_milli: 10000
      };
      const state = {
        userId: 7,
        realtime: { tick: 24842, frameAgeMs: 0, self, entities: [self], bullets: [], coinDrops: [] },
        fallback: { tick: 24837, frameAgeMs: 251, entities: [], coinDrops: [], messages: [] }
      };
      const options = {
        nowMs: incidentAtMs, controlMode: 'profit-live', combatEnabled: false,
        singleCoinBaitEnabled: false,
        loginPointReloginShortcutContext: {
          ...context, sessionId: `shortcut-${mode}`, entryLoginPoint: loginPoint,
          entryLoginAtMs: incidentLoginAtMs
        },
        remoteProfitBatch: {
          generation: 1, source: 'gap-http', observedAtMs: incidentAtMs - 758,
          expiresAtMs: incidentAtMs + 89000,
          candidates: [{
            userId: 99, name: 'stationary-profit', x: -92936, y: 22908,
            hp: 100, drop: 341, active: false, classification: 'high-drop-afk',
            expectedReward: 341, staminaCost: 215617, baseScore: 10, adjustedScore: 10
          }],
          realtimeSupersededIds: [], missSuppressedIds: []
        }
      };
      const decision = buildBrowserlessDecision(state, {}, options);
      const workerDecision = buildBrowserlessDecision(state, {}, serializableDecisionOptions(options));
      const summary = summarizeBrowserlessDecision(decision);
      const shortcut = summary.loginPointReloginShortcut;
      const cached = mode === 'cached';
      checks[`${mode}-shortcut-context`] = context?.sourceIpProbeReusable === cached;
      checks[`${mode}-shortcut-no-extra-requests`] = selectionCount === (cached ? 1 : 0)
        && requestCount === (cached ? 0 : 3);
      checks[`${mode}-shortcut-action`] = decision.action.kind === (cached ? 'leave' : 'seek-remote-player');
      checks[`${mode}-shortcut-logged-budget`] = shortcut?.blockReason === (cached ? 'ok' : 'net-gain-too-small')
        && shortcut.distanceCurrentCm === 183917 && shortcut.distanceLoginCm === 108020
        && shortcut.overheadBreakdown.sourceIpProbeMs === (cached ? 0 : 50000)
        && shortcut.netGainMs === (cached ? 67893 : 17893);
      checks[`${mode}-shortcut-worker-context`] = JSON.stringify(workerDecision.loginPointReloginShortcut)
        === JSON.stringify(decision.loginPointReloginShortcut);
      if (cached) {
        const safety = evaluateBrowserlessSafety(state, { decision, nowMs: incidentAtMs });
        checks['cached-shortcut-executed-leave'] = safety?.reason === 'login-point-relogin-shortcut-leave'
          && safety.shouldLeave === true;
        const cooling = buildBrowserlessDecision(state, {}, {
          ...options,
          loginPointReloginShortcutContext: {
            ...options.loginPointReloginShortcutContext, entryLoginAtMs: incidentAtMs - 59000
          }
        });
        checks['cached-shortcut-preserves-login-interval'] = cooling.action.kind === 'seek-remote-player'
          && summarizeBrowserlessDecision(cooling).loginPointReloginShortcut?.blockReason === 'login-cooldown';
      }
      shortcutPaths.push({ mode, requestCount, selectionCount, shortcut });
    }
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
        // A real HTTP snapshot answers with one global entity list, and absence
        // authority requires that complete shape rather than a bare flag.
        response: {
          ok: true,
          httpOk: true,
          status: 200,
          summary: {
            valid: true,
            entityCount: 24,
            selfPresent: shape.present,
            freshness: { ok: shape.fresh },
            tick: 11
          }
        }
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
    return { ok: Object.values(checks).every(Boolean), checks, snapshots, shortcuts, shortcutPaths };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

module.exports = { runBrowserlessRunnerStateTransitionSelfTest };

if (require.main === module) runBrowserlessRunnerStateTransitionSelfTest().then(result => {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}).catch(error => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
