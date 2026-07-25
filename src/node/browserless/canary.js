'use strict';

const fs = require('fs');
const { performance } = require('perf_hooks');
const { parseGrzFrame } = require('../../shared/grz-frame');
const {
  buildSnapshotProbeUrl,
  fetchWithTimeout,
  prewarmGameConnection,
  readResponseBody,
  redactSecrets,
  summarizeSnapshotPayload
} = require('./session-client');
const { createFrameStats, updateFrameStats } = require('./frame-stats');
const { createBrowserlessStateStore } = require('./state-store');
const { openBrowserlessWs, isWsOpen } = require('./ws-transport');
const { leaveWithVerification } = require('./leave-client');
const {
  buildBrowserlessRuntimeDefaults,
  createBrowserlessDecisionAdapter,
  summarizeBrowserlessDecision
} = require('./decision-adapter');
const {
  createBrowserlessSafetyController,
  createSafetyEvent,
  executeSafetyExit
} = require('./safety-controller');
const { createBrowserlessActionAdapter } = require('./action-adapter');
const { buildLeavePendingCover } = require('./leave-pending-control');
const {
  normalizePendingExit,
  pendingExitRecoveryEvent,
  pendingExitSnapshotResolution
} = require('./pending-exit-recovery');
const { createBrowserlessTargetWhitelist } = require('./target-whitelist');
const { browserlessRuntimeRevision, browserlessRuntimeRevisionStatus } = require('./runtime-revision');
const { createBrowserlessDecisionWorker } = require('./decision-worker');
const {
  actionTargetKey,
  evaluateRestartReadiness,
  restartDrainAllowsDecision
} = require('./restart-readiness');
const { utc8DayKey, waitForSnapshotEdge } = require('./snapshot-edge-wait');

const DEFAULT_READONLY_PROBE_MS = 30000;
const DEFAULT_FRAME_GAP_ALERT_MS = 2000;
const DEFAULT_MAIN_THREAD_BUDGET_MS = 50;
const DEFAULT_REALTIME_CONTROL_WARMUP_ITERATIONS = 6;
const DEFAULT_LOGIN_POINT_SINGLE_BLOCKER_BYPASS_MS = 60 * 60 * 1000;
const DEFAULT_LOGIN_POINT_FULL_HP = 100;
const CREATOR_USER_ID = 28886;

function nextCombatControlTickCore(currentTick, completeMs, options = {}) {
  if (currentTick === null || currentTick === undefined || currentTick === '') return null;
  const tick = Number(currentTick);
  if (!Number.isFinite(tick)) return null;
  const tickMs = Math.max(1, Number(options.tickMs || 50));
  const intervalMs = Math.max(tickMs, Number(options.intervalMs || tickMs));
  const configuredStride = Math.max(1, Math.ceil(intervalMs / tickMs));
  const durationStride = Math.max(1, Math.ceil(Math.max(0, Number(completeMs || 0)) / tickMs));
  return tick + Math.max(configuredStride, durationStride);
}

function finalActionPreemptionGeneration(value = null) {
  return Math.max(0, Number(value?.finalActionPreemption?.generation || 0) || 0);
}

function plannerResponseHasNewerPreemption(sentStatePatch = null, currentStatePatch = null) {
  return finalActionPreemptionGeneration(currentStatePatch)
    > finalActionPreemptionGeneration(sentStatePatch);
}

function createTimingAggregate() {
  return { count: 0, totalMs: 0, maxMs: 0, overBudgetCount: 0 };
}

function recordTimingAggregate(aggregate, durationMs, budgetMs = Infinity) {
  const duration = Math.max(0, Number(durationMs || 0));
  aggregate.count += 1;
  aggregate.totalMs += duration;
  aggregate.maxMs = Math.max(aggregate.maxMs, duration);
  if (duration >= budgetMs) aggregate.overBudgetCount += 1;
  aggregate.meanMs = aggregate.totalMs / aggregate.count;
  return duration;
}

function createMainThreadTimingStats(budgetMs = DEFAULT_MAIN_THREAD_BUDGET_MS) {
  return {
    budgetMs: Math.max(1, Number(budgetMs || DEFAULT_MAIN_THREAD_BUDGET_MS)),
    accepted: true,
    tasks: {},
    stages: {},
    maxTask: null,
    violationCount: 0,
    lastViolation: null
  };
}

function recordMainThreadTask(stats, taskName, durationMs, stageDurations = {}, detail = {}) {
  if (!stats) return null;
  const name = String(taskName || 'task');
  const duration = recordTimingAggregate(
    stats.tasks[name] || (stats.tasks[name] = createTimingAggregate()),
    durationMs,
    stats.budgetMs
  );
  for (const [stage, value] of Object.entries(stageDurations || {})) {
    recordTimingAggregate(stats.stages[stage] || (stats.stages[stage] = createTimingAggregate()), value);
  }
  const entry = {
    task: name,
    durationMs: Math.round(duration * 1000) / 1000,
    stages: Object.fromEntries(Object.entries(stageDurations || {}).map(([key, value]) => [key, Math.round(Number(value || 0) * 1000) / 1000])),
    ...detail
  };
  if (!stats.maxTask || duration > Number(stats.maxTask.durationMs || 0)) stats.maxTask = entry;
  if (duration >= stats.budgetMs) {
    stats.accepted = false;
    stats.violationCount += 1;
    stats.lastViolation = entry;
  }
  return entry;
}

function currentMainThreadCpuMs() {
  try {
    const text = fs.readFileSync(`/proc/self/task/${process.pid}/schedstat`, 'utf8').trim();
    const runtimeNs = Number(text.split(/\s+/)[0]);
    return Number.isFinite(runtimeNs) ? runtimeNs / 1e6 : null;
  } catch (_) {
    return null;
  }
}

function startMainThreadCpuUsage() {
  const schedstatMs = currentMainThreadCpuMs();
  if (schedstatMs !== null) return { source: 'linux-main-thread-schedstat', value: schedstatMs };
  if (typeof process.threadCpuUsage === 'function') return { source: 'thread', value: process.threadCpuUsage() };
  return { source: 'process', value: process.cpuUsage() };
}

function mainThreadWorkProfile(started, wallMs) {
  let cpuMs;
  if (started?.source === 'linux-main-thread-schedstat') {
    const current = currentMainThreadCpuMs();
    cpuMs = current === null ? 0 : Math.max(0, current - Number(started.value || 0));
  } else {
    const usage = started?.source === 'thread' && typeof process.threadCpuUsage === 'function'
      ? process.threadCpuUsage(started.value)
      : process.cpuUsage(started?.value);
    cpuMs = Math.max(0, Number(usage?.user || 0) + Number(usage?.system || 0)) / 1000;
  }
  const nonCpuWallMs = Math.max(0, Number(wallMs || 0) - cpuMs);
  return {
    cpuUsageSource: started?.source || 'process',
    cpuWorkMs: Math.round(cpuMs * 1000) / 1000,
    nonCpuWallMs: Math.round(nonCpuWallMs * 1000) / 1000,
    likelyPauseOrContention: nonCpuWallMs >= 5,
    classification: nonCpuWallMs >= Math.max(5, cpuMs * 0.35)
      ? 'pause-gc-or-contention'
      : 'cpu-work'
  };
}

function createRealtimeControlWarmupState(userId = 0, nowMs = Date.now()) {
  const self = {
    entity_id: 1,
    user_id: Number(userId || 1),
    name: 'realtime-warmup-self',
    x: 0,
    y: 0,
    vx: 20,
    vy: 0,
    hp: 82,
    max_hp: 100,
    current_join_mode: 'Active',
    stamina_5s_remaining_milli: 6400,
    stamina_5s_limit_milli: 10000,
    stamina_1h_remaining_milli: 2400000,
    stamina_1h_limit_milli: 3000000,
    stamina_1d_remaining_milli: 16000000,
    stamina_1d_limit_milli: 20000000
  };
  const activeTargets = Array.from({ length: 8 }, (_, index) => ({
    entity_id: 10 + index,
    user_id: 100 + index,
    name: `realtime-warmup-active-${index}`,
    x: 6500 + index * 900,
    y: 800 + index * 550,
    vx: index % 2 ? 35 : -35,
    vy: index % 3 ? 25 : -25,
    hp: index === 0 ? 68 : 90 - index,
    max_hp: 100,
    current_join_mode: 'Active',
    firing: index < 4,
    stamina_5s_remaining_milli: 4200 + index * 250,
    stamina_5s_limit_milli: 10000,
    death_drop_coins: index === 0 ? 1800 : 80 + index * 10
  }));
  const passives = Array.from({ length: 64 }, (_, index) => ({
    entity_id: 1000 + index,
    user_id: 2000 + index,
    name: `realtime-warmup-passive-${index}`,
    x: 18000 + index * 400,
    y: 12000 + index * 300,
    vx: 0,
    vy: 0,
    hp: 100,
    max_hp: 100,
    current_join_mode: 'Passive',
    stamina_5s_remaining_milli: 10000,
    stamina_5s_limit_milli: 10000,
    death_drop_coins: index % 5
  }));
  const bullets = activeTargets.slice(0, 6).map((target, index) => ({
    bullet_id: index + 1,
    owner_user_id: target.user_id,
    start_x: target.x,
    start_y: target.y,
    target_x: self.x,
    target_y: self.y,
    range_cm: 15000,
    speed_per_tick: 500,
    created_tick: 499998,
    expire_tick: 500028
  }));
  const entities = [self, ...activeTargets, ...passives];
  return {
    userId: self.user_id,
    frameAges: { realtimeMs: 0, snapshotMs: 0 },
    realtime: {
      tick: 500000,
      receivedAtMs: nowMs,
      frameAgeMs: 0,
      self,
      entities,
      bullets,
      coinDrops: []
    },
    fallback: {
      tick: 499999,
      receivedAtMs: nowMs,
      frameAgeMs: 0,
      self,
      entities,
      bullets: [],
      coinDrops: [],
      messages: []
    },
    command: {
      shooting: {
        acceptedShots: [],
        executionDelay: { medianTicks: 5, p90Ticks: 5, madTicks: 0 }
      }
    }
  };
}

function warmBrowserlessRealtimeControl(decisionAdapterOptions = {}, options = {}) {
  const requested = Number(options.realtimeControlWarmupIterations ?? DEFAULT_REALTIME_CONTROL_WARMUP_ITERATIONS);
  const iterations = Math.max(0, Math.min(20, Math.round(Number.isFinite(requested) ? requested : 0)));
  if (!iterations) return { ok: true, skipped: true, iterations: 0, durationMs: 0, maxIterationMs: 0 };
  const started = performance.now();
  const adapter = createBrowserlessDecisionAdapter({
    ...decisionAdapterOptions,
    easyKillPlayerTracker: null,
    damagePlayerTracker: null,
    combatCompletionTracker: null
  });
  const baseNowMs = Number(decisionAdapterOptions.now?.() || Date.now());
  const state = createRealtimeControlWarmupState(decisionAdapterOptions.userId, baseNowMs);
  let maxIterationMs = 0;
  for (let index = 0; index < iterations; index += 1) {
    const iterationStarted = performance.now();
    const nowMs = baseNowMs + index * 160;
    state.realtime.tick += 1;
    state.realtime.receivedAtMs = nowMs;
    state.fallback.receivedAtMs = nowMs;
    adapter.evaluateRealtime(state, {
      ...decisionAdapterOptions,
      nowMs,
      controlMode: decisionAdapterOptions.controlMode || 'profit-live',
      combatEnabled: true,
      easyKillPlayerTracker: null,
      damagePlayerTracker: null,
      combatCompletionTracker: null
    });
    maxIterationMs = Math.max(maxIterationMs, performance.now() - iterationStarted);
  }
  return {
    ok: true,
    skipped: false,
    iterations,
    durationMs: Math.round((performance.now() - started) * 1000) / 1000,
    maxIterationMs: Math.round(maxIterationMs * 1000) / 1000
  };
}

function snapshotSafetySelfPresent(snapshotSafety) {
  return Boolean(snapshotSafety?.response?.summary?.selfPresent);
}

function snapshotSafetySelfAbsent(snapshotSafety) {
  const summary = snapshotSafety?.response?.summary;
  return Boolean(summary?.valid && summary.selfPresent === false);
}

function allowSelfPresentSnapshotControl(snapshotSafety) {
  if (!snapshotSafety || snapshotSafety.ok || !snapshotSafetySelfPresent(snapshotSafety)) return snapshotSafety;
  if (snapshotSafety?.response?.summary?.freshness?.ok === false) return snapshotSafety;
  if (/confirmed-leave-snapshot-quarantine/i.test(String(snapshotSafety.reason || ''))) return snapshotSafety;
  return {
    ...snapshotSafety,
    ok: true,
    reason: 'self-present-reentry',
    originalReason: snapshotSafety.reason || '',
    bypassedPreLoginSafety: true
  };
}

function confirmedLeaveSnapshotGuard(state, nowMs = Date.now()) {
  const value = state?.runner?.confirmedLeave;
  if (!value || typeof value !== 'object') return null;
  const ignoreUntilMs = Date.parse(String(value.snapshotIgnoreUntil || ''));
  const lastRealtimeTick = Number(value.lastRealtimeTick || 0);
  return {
    confirmedAt: String(value.confirmedAt || ''),
    snapshotIgnoreUntil: String(value.snapshotIgnoreUntil || ''),
    ignoreUntilMs: Number.isFinite(ignoreUntilMs) ? ignoreUntilMs : 0,
    lastRealtimeTick: Number.isFinite(lastRealtimeTick) && lastRealtimeTick > 0 ? lastRealtimeTick : 0,
    quarantined: Number.isFinite(ignoreUntilMs) && nowMs < ignoreUntilMs
  };
}

function errorMessage(error) {
  return error?.message || String(error || 'unknown error');
}

function snapshotSafetyDamageActorUserIds(options = {}, atMs = Date.now()) {
  const ids = new Set();
  const explicit = options.damageActorUserIds instanceof Set
    ? Array.from(options.damageActorUserIds)
    : (Array.isArray(options.damageActorUserIds) ? options.damageActorUserIds : []);
  for (const value of explicit) {
    const userId = Number(value?.userId ?? value?.user_id ?? value);
    if (Number.isFinite(userId)) ids.add(userId);
  }
  const tracker = options.damagePlayerTracker;
  if (tracker && typeof tracker.status === 'function') {
    try {
      const status = tracker.status(atMs);
      for (const player of status?.players || []) {
        const userId = Number(player?.userId ?? player?.user_id);
        if (Number.isFinite(userId)) ids.add(userId);
      }
    } catch (_) {}
  }
  return Array.from(ids);
}

function snapshotSafetyEasyKillUserIds(options = {}, atMs = Date.now()) {
  const ids = new Set();
  const explicit = options.easyKillUserIds instanceof Set
    ? Array.from(options.easyKillUserIds)
    : (Array.isArray(options.easyKillUserIds) ? options.easyKillUserIds : []);
  for (const value of explicit) {
    const userId = Number(value?.userId ?? value?.user_id ?? value);
    if (Number.isFinite(userId)) ids.add(userId);
  }
  const tracker = options.easyKillPlayerTracker;
  if (tracker && typeof tracker.status === 'function') {
    try {
      const status = tracker.status(atMs);
      for (const player of status?.players || []) {
        const userId = Number(player?.userId ?? player?.user_id);
        if (Number.isFinite(userId)) ids.add(userId);
      }
    } catch (_) {}
  }
  return Array.from(ids);
}

function canaryLeaveConfirmed(canary) {
  return Boolean(canary?.leave?.ok || canary?.safety?.exit?.leave?.ok);
}

function inGameRecoveryEvidenceFromCanary(canary) {
  if (!canary || canaryLeaveConfirmed(canary)) return null;
  if (canary.recovery?.inGameEvidence) {
    return {
      reason: canary.recovery.reason || 'inherited-in-game-evidence',
      source: canary.recovery.source || 'previous-canary',
      previousRunId: canary.recovery.previousRunId || canary.runId || ''
    };
  }
  if (snapshotSafetySelfPresent(canary.snapshotSafety)) {
    return {
      reason: 'snapshot-self-present',
      source: 'snapshot-safety',
      previousRunId: canary.runId || ''
    };
  }
  if (Number(canary.stats?.selfPresent?.true || 0) > 0) {
    return {
      reason: 'realtime-self-observed',
      source: 'realtime-frames',
      previousRunId: canary.runId || ''
    };
  }
  if (canary.entry?.firstSelf) {
    return {
      reason: 'entry-self-observed',
      source: 'entry-first-self',
      previousRunId: canary.runId || ''
    };
  }
  if (canary.safety?.leaveFailure || canary.safety?.event?.reason === 'direct-leave-failed') {
    return {
      reason: 'leave-not-confirmed',
      source: 'leave-failure',
      previousRunId: canary.runId || ''
    };
  }
  return null;
}

function canaryEvidenceTimeMs(canary) {
  const value = canary?.completedAt || canary?.startedAt || '';
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

function inGameRecoveryEvidenceFromState(state) {
  const candidates = [
    state?.runner?.lastRun?.canary || null,
    state?.probes?.lastReadOnlyProbe || null
  ].filter(Boolean).sort((a, b) => canaryEvidenceTimeMs(b) - canaryEvidenceTimeMs(a));
  for (const canary of candidates) {
    const evidence = inGameRecoveryEvidenceFromCanary(canary);
    if (evidence) return evidence;
    if (canaryLeaveConfirmed(canary)) break;
  }
  return null;
}

function createCanaryRunId(mode, startedAtMs) {
  const stamp = new Date(startedAtMs).toISOString().replace(/[-:.]/g, '');
  return `${String(mode || 'canary')}-${stamp}`;
}

function normalizeFrameData(data) {
  let value = data;
  const seen = new Set();
  while (
    value
    && typeof value === 'object'
    && typeof value !== 'string'
    && !Buffer.isBuffer(value)
    && !(value instanceof ArrayBuffer)
    && !ArrayBuffer.isView(value)
  ) {
    if (seen.has(value)) break;
    seen.add(value);
    if ('data' in value) {
      value = value.data;
      continue;
    }
    break;
  }
  return value;
}

function frameDataToBuffer(data) {
  const value = normalizeFrameData(data);
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (ArrayBuffer.isView(value)) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  return null;
}

function loginPointFromState(state) {
  const point = state?.loginPointSafety?.point || state?.current?.self || state?.lastSelfSummary || null;
  if (!point || !Number.isFinite(Number(point.x)) || !Number.isFinite(Number(point.y))) return null;
  return {
    x: Number(point.x),
    y: Number(point.y),
    hp: Number.isFinite(Number(point.hp)) ? Number(point.hp) : null,
    maxHp: Number.isFinite(Number(point.maxHp ?? point.max_hp)) ? Number(point.maxHp ?? point.max_hp) : null,
    source: point.source || 'state'
  };
}

function loginPointSingleBlockerHold(state) {
  const value = state?.loginPointSafety?.detail?.singleBlockerHold;
  return value && typeof value === 'object' ? value : null;
}

function applySingleBlockerLoginBypass(summary, state, config = {}, checkedAtMs = Date.now()) {
  if (!summary?.safety || typeof summary.safety !== 'object') {
    return { summary, bypassed: false, bypassKind: '', originalReason: '' };
  }
  const safety = summary.safety;
  const blockingPlayers = Array.isArray(safety.blockingPlayers) ? safety.blockingPlayers : [];
  const blockingFactors = Array.isArray(safety.blockingFactors) ? safety.blockingFactors : [];
  const pointHp = Number(safety.point?.hp);
  const pointMaxHp = Number(safety.point?.maxHp ?? safety.point?.max_hp);
  const requiredFullHp = Number.isFinite(pointMaxHp) && pointMaxHp > 0
    ? pointMaxHp
    : DEFAULT_LOGIN_POINT_FULL_HP;
  const fullHp = Number.isFinite(pointHp) && pointHp >= requiredFullHp;
  const solePlayer = blockingPlayers.length === 1 ? blockingPlayers[0] : null;
  const soleUserId = Number(solePlayer?.user_id ?? solePlayer?.userId);
  const playerFactorsOnly = blockingFactors.length > 0 && blockingFactors.every(factor => (
    factor?.type === 'player'
      && Number(factor.userId ?? factor.user_id) === soleUserId
  ));
  const qualifies = Boolean(
    summary.valid
      && summary.selfPresent === false
      && safety.freshness?.ok
      && fullHp
      && solePlayer
      && Number.isFinite(soleUserId)
      && soleUserId > 0
      && playerFactorsOnly
  );
  const thresholdMs = Math.max(0, Number(
    config.loginPointSingleBlockerBypassMs
      ?? DEFAULT_LOGIN_POINT_SINGLE_BLOCKER_BYPASS_MS
  ) || 0);
  const checkedAt = new Date(checkedAtMs).toISOString();
  const previous = loginPointSingleBlockerHold(state);
  const previousUserId = Number(previous?.userId);
  const previousFirstMs = Date.parse(String(previous?.firstBlockedAt || ''));
  const previousUsable = Boolean(
    qualifies
      && previous?.active
      && !previous?.bypassedAt
      && previousUserId === soleUserId
      && Number.isFinite(previousFirstMs)
      && previousFirstMs <= checkedAtMs
  );
  const firstBlockedAtMs = qualifies
    ? (previousUsable ? previousFirstMs : checkedAtMs)
    : 0;
  const durationMs = qualifies ? Math.max(0, checkedAtMs - firstBlockedAtMs) : 0;
  const bypassed = Boolean(qualifies && durationMs >= thresholdMs);
  const resetReason = qualifies
    ? (previousUsable ? '' : (previous?.bypassedAt ? 'previous-bypass-consumed' : (previous ? 'blocker-changed' : 'new-single-blocker')))
    : (!fullHp
        ? 'login-point-not-full-hp'
        : (blockingPlayers.length > 1
            ? 'multiple-blocking-players'
            : (blockingPlayers.length === 0 ? 'no-single-blocking-player' : 'non-player-blocking-factor')));
  const hold = {
    active: qualifies,
    userId: qualifies ? soleUserId : null,
    name: qualifies ? String(solePlayer.name || '') : '',
    firstBlockedAt: qualifies ? new Date(firstBlockedAtMs).toISOString() : '',
    lastBlockedAt: qualifies ? checkedAt : '',
    durationMs,
    thresholdMs,
    remainingMs: qualifies ? Math.max(0, thresholdMs - durationMs) : thresholdMs,
    observationCount: qualifies
      ? (previousUsable ? Math.max(0, Number(previous.observationCount || 0)) + 1 : 1)
      : 0,
    fullHp,
    pointHp: Number.isFinite(pointHp) ? pointHp : null,
    requiredFullHp,
    blockingPlayerCount: blockingPlayers.length,
    blockingFactorCount: blockingFactors.length,
    eligible: bypassed,
    bypassedAt: bypassed ? checkedAt : '',
    resetReason
  };
  const originalReason = safety.reason || '';
  const adjustedSafety = {
    ...safety,
    singleBlockerHold: hold,
    ...(bypassed ? {
      ok: true,
      reason: 'single-blocker-timeout-bypass',
      originalReason
    } : {})
  };
  return {
    summary: {
      ...summary,
      safety: adjustedSafety
    },
    bypassed,
    bypassKind: bypassed ? 'single-blocker-timeout' : '',
    originalReason
  };
}

async function fetchPreLoginSnapshot(config, deps = {}) {
  const url = buildSnapshotProbeUrl({
    gameOrigin: config.gameOrigin,
    snapshotPath: config.snapshotPath || '/snapshot',
    userId: config.userId,
    sessionToken: config.sessionToken
  });
  const fetchImpl = deps.fetchImpl;
  const response = await (deps.fetchWithTimeout || fetchWithTimeout)(url, {
    fetchImpl,
    timeoutMs: config.httpTimeoutMs || config.wsConnectTimeoutMs || 10000,
    localAddress: config.sourceIp,
    method: 'GET',
    cache: 'no-store'
  });
  const body = await readResponseBody(response);
  const observedAtMs = typeof deps.now === 'function' ? deps.now() : Date.now();
  if (body.json && typeof deps.onSnapshotPayload === 'function') {
    try {
      await deps.onSnapshotPayload(body.json, {
        source: 'prelogin-http',
        observedAtMs
      });
    } catch (_) {}
  }
  return {
    ok: Boolean(response.ok),
    status: response.status,
    response,
    body,
    payload: body.json,
    observedAtMs,
    url
  };
}

async function runSinglePreLoginSnapshotSafetyProbe(config, state, deps = {}, detail = {}) {
  const loginPoint = loginPointFromState(state);
  const fetched = detail.fetched || await fetchPreLoginSnapshot(config, deps);
  const { response, body, url } = fetched;
  const runtimeDefaults = buildBrowserlessRuntimeDefaults(config);
  const observedAtMs = Number(fetched.observedAtMs || (typeof deps.now === 'function' ? deps.now() : Date.now()));
  const damageActorUserIds = snapshotSafetyDamageActorUserIds(deps, observedAtMs);
  const easyKillUserIds = snapshotSafetyEasyKillUserIds(deps, observedAtMs);
  const confirmedLeave = confirmedLeaveSnapshotGuard(state, observedAtMs);
  const ordinaryLatestKnownTick = Number(state?.frameAges?.latestKnownTick || state?.latestKnownTick || 0);
  const confirmedAtMs = Date.parse(String(confirmedLeave?.confirmedAt || ''));
  const confirmedLeaveTick = confirmedLeave
    && Number.isFinite(confirmedAtMs)
    && utc8DayKey(confirmedAtMs) === utc8DayKey(observedAtMs)
    ? Number(confirmedLeave.lastRealtimeTick || 0)
    : 0;
  const latestKnownTick = Math.max(
    Number.isFinite(ordinaryLatestKnownTick) ? ordinaryLatestKnownTick : 0,
    confirmedLeaveTick,
    Number(detail.lastProbeTick || 0)
  );
  let summary = summarizeSnapshotPayload(body.json, {
    userId: config.userId,
    loginPoint,
    latestKnownTick,
    requireTickAdvance: Boolean(confirmedLeaveTick || detail.lastProbeTick),
    healthyHpThreshold: config.loginPointSafetyHealthyHpThreshold ?? runtimeDefaults.loginPointSafetyHealthyHpThreshold,
    healthyRadius: config.loginPointSafetyHealthyRadius ?? runtimeDefaults.loginPointSafetyHealthyRadius,
    lowRadius: config.loginPointSafetyRadius ?? runtimeDefaults.loginPointSafetyRadius,
    staminaFullRatio: config.staminaFullRatio ?? runtimeDefaults.staminaFullRatio,
    damageActorUserIds,
    easyKillUserIds
  });
  if (!response.ok && summary?.safety) {
    const blockingFactors = Array.isArray(summary.safety.blockingFactors)
      ? summary.safety.blockingFactors.slice()
      : [];
    blockingFactors.unshift({ type: 'snapshot', reason: `snapshot-http-${response.status}` });
    summary = {
      ...summary,
      safety: {
        ...summary.safety,
        ok: false,
        blockingFactors,
        blockingFactorCount: blockingFactors.length
      }
    };
  }
  const checkedAtMs = typeof deps.now === 'function' ? deps.now() : Date.now();
  const singleBlocker = applySingleBlockerLoginBypass(summary, state, config, checkedAtMs);
  summary = singleBlocker.summary;
  const checkedAt = new Date(checkedAtMs).toISOString();
  const progress = {
    required: detail.required ?? 1,
    streak: detail.streak ?? 0,
    satisfied: Boolean(detail.satisfied),
    checkedAt
  };
  if (response.ok && summary.valid && summary.selfPresent && confirmedLeave?.quarantined && !detail.edgeDetected) {
    return {
      ok: false,
      reason: 'confirmed-leave-snapshot-quarantine',
      originalReason: summary.safety?.reason || '',
      confirmedLeave,
      ...progress,
      request: { url: redactSecrets(url) },
      response: {
        httpOk: response.ok,
        status: response.status,
        statusText: response.statusText || '',
        summary
      },
      loginPoint
    };
  }
  if (response.ok && summary.valid && summary.selfPresent && summary.freshness?.ok) {
    return {
      ok: true,
      reason: 'self-present-reentry',
      originalReason: summary.safety?.reason || '',
      bypassedPreLoginSafety: true,
      confirmedLeave,
      ...progress,
      streak: progress.required,
      satisfied: true,
      request: { url: redactSecrets(url) },
      response: {
        httpOk: response.ok,
        status: response.status,
        statusText: response.statusText || '',
        summary
      },
      loginPoint
    };
  }
  if (!loginPoint) {
    return {
      ok: false,
      reason: 'missing-login-point',
      ...progress,
      request: { url: redactSecrets(url) },
      response: {
        httpOk: response.ok,
        status: response.status,
        statusText: response.statusText || '',
        summary
      },
      loginPoint: null
    };
  }
  return {
    ok: Boolean(response.ok && summary.valid && summary.safety?.ok),
    reason: response.ok ? (summary.safety?.reason || 'invalid-payload') : `snapshot-http-${response.status}`,
    originalReason: singleBlocker.bypassed ? singleBlocker.originalReason : '',
    bypassedPreLoginSafety: singleBlocker.bypassed,
    bypassKind: singleBlocker.bypassKind,
    ...progress,
    request: { url: redactSecrets(url) },
    response: {
      httpOk: response.ok,
      status: response.status,
      statusText: response.statusText || '',
      summary
    },
    loginPoint,
    confirmedLeave
  };
}

async function runPreLoginSnapshotSafety(config, state, deps = {}) {
  if (config.snapshotEdgeEnabled === true) {
    const edge = await waitForSnapshotEdge({
      now: deps.now,
      sleep: deps.sleep,
      intervalMs: config.snapshotEdgeIntervalMs ?? 10000,
      maxWaitMs: config.snapshotEdgeMaxWaitMs ?? 60000,
      maxErrors: config.snapshotEdgeMaxErrors ?? 3,
      fetchSnapshot: async () => fetchPreLoginSnapshot(config, deps),
      onProgress: progress => {
        if (typeof deps.onSnapshotEdge === 'function') deps.onSnapshotEdge(progress);
      }
    });
    if (!edge.ok) {
      return {
        ok: false,
        reason: edge.reason,
        required: 1,
        streak: 0,
        satisfied: false,
        attempt: edge.requestCount,
        checkedAt: new Date(typeof deps.now === 'function' ? deps.now() : Date.now()).toISOString(),
        edge: {
          requestCount: edge.requestCount,
          waitMs: edge.waitMs,
          consecutiveErrors: edge.consecutiveErrors,
          baseline: edge.baseline?.version || null
        }
      };
    }
    const evaluated = await runSinglePreLoginSnapshotSafetyProbe(config, state, deps, {
      required: 1,
      streak: 0,
      satisfied: false,
      fetched: edge.detected.fetched,
      edgeDetected: true
    });
    return {
      ...evaluated,
      required: 1,
      streak: evaluated.ok ? 1 : 0,
      satisfied: Boolean(evaluated.ok),
      attempt: 1,
      probeIntervalMs: Number(config.snapshotEdgeIntervalMs ?? 10000),
      edge: {
        requestCount: edge.requestCount,
        waitMs: edge.waitMs,
        baseline: edge.baseline.version,
        detected: edge.detected.version,
        safetyEvaluationCount: 1
      }
    };
  }
  const runtimeDefaults = buildBrowserlessRuntimeDefaults(config);
  const required = Math.max(0, Math.round(Number(
    config.loginPointSafetySuccessRequired
      ?? runtimeDefaults.loginPointSafetySuccessRequired
      ?? 3
  ) || 0));
  const effectiveRequired = Math.max(1, required);
  const intervalMs = Math.max(0, Number(
    config.loginPointSafetyProbeIntervalMs
      ?? runtimeDefaults.loginPointSafetyProbeIntervalMs
      ?? 30000
  ) || 0);
  const sleep = typeof deps.sleep === 'function'
    ? deps.sleep
    : ms => new Promise(resolve => setTimeout(resolve, ms));
  let streak = 0;
  let last = null;
  let lastProbeTick = null;
  for (let attempt = 1; attempt <= effectiveRequired; attempt += 1) {
    try {
      last = await runSinglePreLoginSnapshotSafetyProbe(config, state, deps, {
        required: effectiveRequired,
        streak,
        satisfied: false,
        lastProbeTick
      });
    } catch (err) {
      last = {
        ok: false,
        reason: 'snapshot-probe-error',
        error: errorMessage(err),
        required: effectiveRequired,
        streak: 0,
        satisfied: false,
        attempt,
        probeIntervalMs: intervalMs,
        checkedAt: new Date(typeof deps.now === 'function' ? deps.now() : Date.now()).toISOString()
      };
      if (typeof deps.onSnapshotSafety === 'function') deps.onSnapshotSafety(last);
      return last;
    }
    if (last.bypassedPreLoginSafety) {
      last = {
        ...last,
        required: effectiveRequired,
        streak: effectiveRequired,
        satisfied: true,
        attempt,
        probeIntervalMs: intervalMs
      };
      if (typeof deps.onSnapshotSafety === 'function') deps.onSnapshotSafety(last);
      return last;
    }
    if (!last.ok) {
      const freshness = last.response?.summary?.freshness || null;
      if (attempt > 1 && freshness?.ok === false && /stale|tick|advance/i.test(String(freshness.reason || ''))) {
        last.reason = 'stale-consecutive-snapshot-tick';
      }
      last = {
        ...last,
        required: effectiveRequired,
        streak: 0,
        satisfied: false,
        attempt,
        probeIntervalMs: intervalMs
      };
      if (typeof deps.onSnapshotSafety === 'function') deps.onSnapshotSafety(last);
      return last;
    }
    const probeTick = Number(last.response?.summary?.tick);
    if (attempt > 1 && (!Number.isFinite(probeTick) || probeTick <= Number(lastProbeTick))) {
      last = {
        ...last,
        ok: false,
        reason: 'stale-consecutive-snapshot-tick',
        originalReason: last.reason || '',
        required: effectiveRequired,
        streak: 0,
        satisfied: false,
        attempt,
        probeIntervalMs: intervalMs
      };
      if (typeof deps.onSnapshotSafety === 'function') deps.onSnapshotSafety(last);
      return last;
    }
    if (Number.isFinite(probeTick)) lastProbeTick = probeTick;
    streak = Math.min(effectiveRequired, streak + 1);
    last = {
      ...last,
      ok: streak >= effectiveRequired,
      reason: streak >= effectiveRequired ? last.reason : 'snapshot-safety-streak-pending',
      originalReason: last.reason,
      required: effectiveRequired,
      streak,
      satisfied: streak >= effectiveRequired,
      attempt,
      probeIntervalMs: intervalMs,
      response: {
        ...(last.response || {}),
        summary: {
          ...(last.response?.summary || {}),
          safety: {
            ...(last.response?.summary?.safety || {}),
            required: effectiveRequired,
            streak,
            satisfied: streak >= effectiveRequired
          }
        }
      }
    };
    if (typeof deps.onSnapshotSafety === 'function') deps.onSnapshotSafety(last);
    if (last.ok) return last;
    if (intervalMs > 0) await sleep(intervalMs);
  }
  return last || {
    ok: false,
    reason: 'snapshot-safety-streak-missing',
    required: effectiveRequired,
    streak,
    satisfied: false
  };
}

function inspectCanaryFrame(data, options = {}) {
  const buffer = frameDataToBuffer(data);
  if (!buffer) return { kind: 'text', sample: String(normalizeFrameData(data) || '').slice(0, 240) };
  const frame = {
    kind: 'binary',
    byteLength: buffer.length,
    prefixHex: buffer.subarray(0, 16).toString('hex')
  };
  Object.assign(frame, parseGrzFrame(buffer, {
    userId: options.userId,
    includeJson: true,
    now: () => performance.now()
  }));
  return frame;
}

function wsTracePayloadPatch(payload, config = {}) {
  if (config.wsTracePayload === false || payload === undefined) return {};
  const maxChars = Math.max(0, Number(config.wsTraceMaxPayloadChars || 0));
  if (maxChars > 0) {
    const text = redactSecrets(JSON.stringify(payload));
    return {
      payloadJsonSample: text.slice(0, maxChars),
      payloadTruncated: text.length > maxChars,
      payloadJsonLength: text.length
    };
  }
  return { payload };
}

function buildWsFrameTrace(frame, config = {}) {
  const base = {
    direction: 'in',
    kind: frame?.kind || '',
    byteLength: frame?.byteLength ?? null,
    prefixHex: frame?.prefixHex || '',
    format: frame?.format || '',
    version: frame?.version ?? null,
    compression: frame?.compression || '',
    payloadByteLength: frame?.payloadByteLength ?? null,
    decodedByteLength: frame?.decodedByteLength ?? null,
    decodedType: frame?.decodedType || '',
    decodedTick: frame?.decodedTick ?? null,
    decodedJsonKeys: frame?.decodedJsonKeys || [],
    decodedSummary: frame?.decodedSummary || null,
    decodeError: frame?.decodeError || '',
    jsonParseError: frame?.jsonParseError || ''
  };
  if (frame?.kind === 'text') {
    return {
      ...base,
      sample: redactSecrets(frame.sample || '')
    };
  }
  return {
    ...base,
    ...wsTracePayloadPatch(frame?.decodedJson, config)
  };
}

function attachConfirmedLeaveEvidence(event, leave, leavePending = null, options = {}) {
  if (!event || typeof event !== 'object' || leave?.ok !== true) return event;
  const finiteNumber = value => {
    if (value === null || value === undefined || value === '') return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  };
  const attempts = Array.isArray(leave.attempts) ? leave.attempts : [];
  const confirmedAttempt = attempts.find(attempt => attempt?.ok && attempt?.response && typeof attempt.response === 'object') || null;
  const response = confirmedAttempt?.response || {};
  const responseHp = finiteNumber(response.hp);
  const pendingMinHp = finiteNumber(leavePending?.minHp);
  const selfHp = responseHp !== null
    ? responseHp
    : pendingMinHp;
  if (selfHp === null) return event;
  const maxHpValue = finiteNumber(response.max_hp ?? response.maxHp);
  const decision = event.detail?.decision || event.decision || {};
  const triggerSelfHp = finiteNumber(
    decision.combat?.exit?.selfHp
      ?? decision.self?.hp
      ?? decision.action?.self?.hp
      ?? event.selfHp
  );
  const completedAtMs = Number(leavePending?.completedAtMs || options.completedAtMs || 0);
  return {
    ...event,
    leaveConfirmation: {
      at: completedAtMs > 0 ? new Date(completedAtMs).toISOString() : '',
      selfHp,
      maxHp: maxHpValue,
      triggerSelfHp,
      hpLossAfterTrigger: triggerSelfHp === null ? null : Math.max(0, triggerSelfHp - selfHp),
      source: responseHp !== null ? 'leave-response' : 'leave-pending-min'
    }
  };
}

function wsTraceOutboundMessage(message) {
  const text = String(message || '');
  if (!text.startsWith('chat ')) return text;
  return `chat <redacted:${Math.max(0, text.length - 5)} chars>`;
}

async function runReadOnlyCanary(config, options = {}) {
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const sleep = typeof options.sleep === 'function'
    ? options.sleep
    : ms => new Promise(resolve => setTimeout(resolve, ms));
  const logStore = options.logStore || null;
  const combatBattleLog = options.combatBattleLog && typeof options.combatBattleLog === 'object'
    ? options.combatBattleLog
    : null;
  const damagePlayerTracker = options.damagePlayerTracker && typeof options.damagePlayerTracker === 'object'
    ? options.damagePlayerTracker
    : null;
  try {
    damagePlayerTracker?.resetObservation?.();
  } catch (_) {}
  const controlMode = config.controlMode || (config.readOnly === false ? 'movement-only' : 'read-only');
  const combatLiveEnabled = (controlMode === 'combat-live' || controlMode === 'profit-live') && config.combatEnabled === true;
  const actionEnabled = controlMode === 'movement-only' || controlMode === 'non-combat-profit' || controlMode === 'profit-live' || combatLiveEnabled;
  const durationMs = Math.max(1000, Number(config.readOnlyProbeMs || DEFAULT_READONLY_PROBE_MS));
  const frameGapAlertMs = Math.max(1000, Number(config.frameGapAlertMs || DEFAULT_FRAME_GAP_ALERT_MS));
  const decisionIntervalMs = Math.max(250, Number(config.decisionIntervalMs || 1000));
  const combatServerTickMs = Math.max(1, Number(config.combatServerTickMs || 50));
  const combatControlIntervalMs = Math.max(combatServerTickMs, Number(config.combatControlIntervalMs || combatServerTickMs));
  const combatControlMinimumTickStride = Math.max(1, Math.ceil(combatControlIntervalMs / combatServerTickMs));
  const combatControlStatusPublishMs = Math.max(
    combatControlIntervalMs,
    Number(config.combatControlStatusPublishMs || 500)
  );
  const stateStore = options.stateStore || createBrowserlessStateStore({ userId: config.userId, now });
  const runtimeDefaults = buildBrowserlessRuntimeDefaults(config);
  const genesisWhitelist = options.targetWhitelist || createBrowserlessTargetWhitelist({
    url: Object.prototype.hasOwnProperty.call(config, 'targetWhitelistUrl') ? config.targetWhitelistUrl : '',
    file: Object.prototype.hasOwnProperty.call(config, 'targetWhitelistFile') ? config.targetWhitelistFile : '',
    timeoutMs: config.targetWhitelistTimeoutMs,
    maxNames: config.targetWhitelistMaxNames,
    localAddress: config.sourceIp,
    fetchWithTimeout: options.fetchWithTimeout,
    fetchImpl: options.fetchImpl,
    now
  });
  let targetWhitelistSummary = null;
  try {
    targetWhitelistSummary = await genesisWhitelist.refresh('canary-startup');
  } catch (err) {
    targetWhitelistSummary = {
      loaded: false,
      lastReason: 'canary-startup-failed',
      lastError: errorMessage(err)
    };
  }
  const creatorUserIds = [CREATOR_USER_ID];
  const creatorUserIdSet = new Set(creatorUserIds);
  const isCreatorTarget = target => {
    const userId = Number(target?.user_id ?? target?.userId ?? target?.target_user_id ?? target?.targetUserId);
    return Number.isFinite(userId) && creatorUserIdSet.has(userId);
  };
  targetWhitelistSummary = {
    ...(targetWhitelistSummary || {}),
    semantic: 'creator',
    creatorUserId: CREATOR_USER_ID,
    configuredEntryCount: Number(targetWhitelistSummary?.count || 0)
  };
  const decisionAdapterOptions = {
    ...runtimeDefaults,
    userId: config.userId,
    now,
    controlMode,
    decisionIntervalMs,
    readOnlyProbeMs: durationMs,
    loopDelayMs: config.loopDelayMs,
    staleSelfConfirmMs: config.staleSelfConfirmMs,
    easyKillPlayerTracker: options.easyKillPlayerTracker,
    combatCompletionTracker: options.combatCompletionTracker,
    combatLearning: options.combatCompletionTracker?.strategyLearning?.() || null,
    damagePlayerTracker,
    targetWhitelistNames: [],
    targetWhitelistNameSet: new Set(),
    targetWhitelistUserIds: creatorUserIds,
    targetWhitelistUserIdSet: creatorUserIdSet,
    whitelistCheck: target => isCreatorTarget(target)
      || Boolean(options.dynamicWhitelist?.isWhitelistedTarget?.(target))
  };
  const decisionAdapter = options.decisionAdapter || createBrowserlessDecisionAdapter(decisionAdapterOptions);
  const realtimeControlWarmup = options.useDecisionWorker || options.decisionWorker
    ? warmBrowserlessRealtimeControl(decisionAdapterOptions, options)
    : { ok: true, skipped: true, iterations: 0, durationMs: 0, maxIterationMs: 0 };
  const decisionWorker = options.decisionWorker || (options.useDecisionWorker
    ? createBrowserlessDecisionWorker({
        ...decisionAdapterOptions,
        targetWhitelistNames: [],
        targetWhitelistUserIds: creatorUserIds
      })
    : null);
  const persistCombatLearning = atMs => {
    const decisionState = decisionAdapter.getCombatPersistenceState?.()
      || decisionAdapter.getState?.()
      || {};
    const metrics = decisionState.combatMetrics || null;
    if (metrics?.targetId !== null && metrics?.targetId !== undefined && metrics?.targetId !== '') {
      options.combatCompletionTracker?.observeCombatSample?.({
        userId: metrics.targetId,
        name: metrics.targetName || decisionState.combatTarget?.name || '',
        startedAt: metrics.startedAt,
        targetDamage: metrics.targetDamage,
        selfDamage: metrics.selfDamage,
        atMs
      });
    }
    options.combatCompletionTracker?.updateStrategyLearning?.(decisionState.combatLearning, atMs);
  };
  const safetyController = options.safetyController || createBrowserlessSafetyController({
    now,
    frameGapAlertMs,
    staleSelfMs: config.staleSelfMs,
    staleSelfConfirmMs: config.staleSelfConfirmMs,
    noSelfGraceMs: config.noSelfGraceMs,
    staminaExhaustedBelowMs: config.staminaExhaustedBelowMs,
    movementSettlementFrames: config.movementSettlementFrames
  });
  safetyController.clearFrameGapSoftStop?.();
  const stats = createFrameStats(durationMs);
  const frameHealth = {
    firstFrameAtMs: 0,
    lastFrameAtMs: 0,
    maxFrameGapMs: 0,
    decodeErrors: 0
  };
  const startedAt = now();
  const runId = String(options.runId || createCanaryRunId(controlMode, startedAt));
  const runtimeRevision = browserlessRuntimeRevision(options);
  const previousInGameEvidence = inGameRecoveryEvidenceFromState(options.persistedState || {});
  const persistedPendingExit = normalizePendingExit(options.persistedState?.runner?.pendingExit, startedAt, {
    maximumAgeMs: options.pendingExitPersistMaxMs
  });
  let exitRecoveryActive = Boolean(persistedPendingExit);
  const result = {
    ok: false,
    runId,
    mode: controlMode,
    startedAt: new Date(startedAt).toISOString(),
    completedAt: '',
    durationTargetMs: durationMs,
    snapshotSafety: null,
    stats,
    frameHealth,
    hotPath: createMainThreadTimingStats(options.mainThreadBudgetMs || DEFAULT_MAIN_THREAD_BUDGET_MS),
    decisions: {
      intervalMs: decisionIntervalMs,
      evaluatedCount: 0,
      realtimeControlCount: 0,
      loggedCount: 0,
      last: null,
      worker: null,
      realtimeControlWarmup,
      realtimeControlSchedule: {
        serverTickMs: combatServerTickMs,
        configuredIntervalMs: combatControlIntervalMs,
        minimumTickStride: combatControlMinimumTickStride,
        lastProcessedTick: null,
        lastTickDelta: null,
        nextEligibleTick: null,
        skippedTicks: 0,
        lastCompleteMs: null,
        maxCompleteMs: 0
      }
    },
    safety: {
      event: null,
      exit: null,
      leavePending: null,
      leavePrewarm: null,
      leaveFailure: null,
      frameGapSoftStops: [],
      lastFrameGapRecovery: null
    },
    actions: {
      enabled: actionEnabled,
      sentCount: 0,
      velocitySentCount: 0,
      velocityRepeatSentCount: 0,
      shootSentCount: 0,
      shootAcceptedCount: 0,
      shootUnackedCount: 0,
      shootRepeatSentCount: 0,
      stopCount: 0,
      skippedCount: 0,
      last: null,
      settlement: null,
      movementStall: null,
      lastMovementStall: null,
      lastShootAck: null
    },
    entry: {
      firstSelf: null,
      firstSelfAt: '',
      firstSelfTick: null
    },
    recovery: {
      inGameEvidence: Boolean(previousInGameEvidence),
      reason: previousInGameEvidence?.reason || '',
      source: previousInGameEvidence?.source || '',
      previousRunId: previousInGameEvidence?.previousRunId || '',
      clearedBy: '',
      exitRecovery: Boolean(persistedPendingExit),
      pendingExit: persistedPendingExit,
      pendingExitResolution: persistedPendingExit ? 'pending-snapshot-check' : 'inactive'
    },
    leave: null,
    targetWhitelist: targetWhitelistSummary,
    error: ''
  };
  let lastDecisionAtMs = 0;
  let lastCombatControlAtMs = 0;
  let lastCombatControlTick = null;
  let nextCombatControlTick = null;
  let lastRealtimeControlLogAtMs = 0;
  let lastRealtimeControlKey = '';
  let lastCombatControlStatusAtMs = 0;
  let lastCombatControlStatusKey = '';
  let lastRealtimeControlScale = null;
  let realtimeControlActive = false;
  let realtimeFinalActionPreemptionActive = false;
  let plannerInFlight = false;
  let combatPersistenceScheduled = false;
  let combatPersistenceAtMs = 0;
  let wsError = null;
  let wsClosed = null;
  let authoritativeTransportGeneration = 0;
  let ending = false;
  let deadlineAtMs = 0;
  let transportStartedAtMs = 0;
  let actionAdapter = null;
  let frameGapSoftStopActive = false;
  let openFailedBeforeTransport = false;
  let transportPublished = false;
  let transport = null;
  let leavePending = null;
  let pendingSnapshotObserver = null;
  let snapshotObserverScheduled = false;
  let pendingSnapshotObservationRefresh = null;
  let snapshotObservationRefreshScheduled = false;
  const restartDrain = options.restartDrainCoordinator || null;
  let lastRestartDrainPublishKey = '';
  const publishRestartDrainStatus = status => {
    if (!status?.requested || typeof options.onRestartDrainStatus !== 'function') return;
    const key = JSON.stringify({
      ready: Boolean(status.ready),
      reason: status.assessment?.reason || '',
      commitmentKey: status.commitmentKey || ''
    });
    if (key === lastRestartDrainPublishKey) return;
    lastRestartDrainPublishKey = key;
    options.onRestartDrainStatus(status);
  };
  const applyRestartDrainDecisionGate = decision => {
    const status = restartDrain?.status?.() || null;
    if (!status?.requested || restartDrainAllowsDecision(decision, status)) return decision;
    const state = decisionAdapter.getState?.() || {};
    const combatTargetKey = state.combatTarget?.id ? `player:${state.combatTarget.id}` : '';
    if (combatTargetKey && combatTargetKey !== status.commitmentKey) {
      decisionAdapter.patchState?.({ combatTarget: null, combatAim: null });
    }
    return {
      ...(decision || {}),
      kind: 'wait',
      band: 'wait',
      reason: 'restart-drain-new-commitment-blocked',
      action: {
        kind: 'wait',
        band: 'wait',
        reason: 'restart-drain-new-commitment-blocked',
        blockedAction: {
          kind: decision?.action?.kind || decision?.kind || '',
          reason: decision?.action?.reason || decision?.reason || '',
          targetKey: actionTargetKey(decision?.action || decision || {})
        }
      }
    };
  };
  let leavePrewarmInFlight = null;
  let lastLeavePrewarmAtMs = 0;
  const flushScheduledCombatPersistence = () => {
    if (!combatPersistenceScheduled && !combatPersistenceAtMs) return;
    const started = performance.now();
    combatPersistenceScheduled = false;
    const atMs = combatPersistenceAtMs || now();
    combatPersistenceAtMs = 0;
    try {
      persistCombatLearning(atMs);
    } finally {
      const entry = recordMainThreadTask(
        result.hotPath,
        'combat-persistence-schedule',
        performance.now() - started
      );
      if (entry && entry.durationMs >= result.hotPath.budgetMs) {
        log('main-thread-budget-exceeded', entry);
      }
    }
  };
  const scheduleCombatPersistence = atMs => {
    combatPersistenceAtMs = Math.max(combatPersistenceAtMs, Number(atMs || 0));
    if (!decisionWorker) {
      flushScheduledCombatPersistence();
      return;
    }
    if (combatPersistenceScheduled) return;
    combatPersistenceScheduled = true;
    setImmediate(flushScheduledCombatPersistence);
  };
  const noSelfGuardStartedAtMs = fallbackMs => {
    const fallback = Number(fallbackMs);
    return transportStartedAtMs
      || frameHealth.firstFrameAtMs
      || (Number.isFinite(fallback) ? fallback : now());
  };
  const addRunMeta = detail => {
    const base = detail && typeof detail === 'object' && !Array.isArray(detail)
      ? detail
      : { value: detail };
    return {
      ...base,
      runId,
      runtimeRevision,
      strategySchemaVersion: 2,
      canaryMode: controlMode,
      canaryStartedAt: result.startedAt
    };
  };

  const log = (type, detail) => {
    if (logStore) logStore.append('runner', type, addRunMeta(detail));
  };
  const logDecision = detail => {
    if (logStore) logStore.append('decisions', 'decision', addRunMeta(detail));
  };
  const logSafety = detail => {
    if (logStore) logStore.append('exits', 'safety-event', addRunMeta(detail));
  };
  const logExit = (type, detail) => {
    if (logStore) logStore.append('exits', type, addRunMeta(detail));
  };
  const logDynamicWhitelistRestores = restored => {
    for (const item of restored || []) log('canary-dynamic-whitelist-restored-after-combat', item);
  };
  const observeDynamicWhitelistBattles = (currentState, atMs) => {
    const whitelist = options.dynamicWhitelist;
    if (typeof whitelist?.observeBattles !== 'function') return [];
    const restored = whitelist.observeBattles(currentState, {
      atMs,
      disengageRangeCm: runtimeDefaults.combatDisengageRange,
      decisionState: decisionAdapter.getState?.() || null
    });
    logDynamicWhitelistRestores(restored);
    return restored;
  };
  const restoreDynamicWhitelistBattles = (reason, atMs = now()) => {
    const whitelist = options.dynamicWhitelist;
    if (typeof whitelist?.restoreAll !== 'function') return [];
    const restored = whitelist.restoreAll(reason, atMs);
    logDynamicWhitelistRestores(restored);
    return restored;
  };
  const maybePrewarmLeaveConnection = (currentState, atMs, reason = 'risk', force = false) => {
    if (options.fetchImpl && !options.prewarmGameConnection) return null;
    if (leavePending || leavePrewarmInFlight) return leavePrewarmInFlight;
    const intervalMs = Math.max(1000, Number(config.leavePrewarmIntervalMs || 3000));
    if (!force && atMs - lastLeavePrewarmAtMs < intervalMs) return null;
    const self = currentState?.realtime?.self || null;
    const selfHp = Number(self?.hp);
    const maxHp = Number(self?.max_hp ?? self?.maxHp ?? 100);
    const action = result.decisions.last?.action || result.decisions.last || {};
    const bulletCount = Number(currentState?.realtime?.bullets?.length || 0);
    const risk = force
      || bulletCount > 0
      || (Number.isFinite(selfHp) && Number.isFinite(maxHp) && selfHp < maxHp)
      || ['combat', 'recover', 'safety'].includes(String(action.band || ''));
    if (!risk) return null;
    lastLeavePrewarmAtMs = atMs;
    result.safety.leavePrewarm = {
      active: true,
      reason,
      startedAtMs: atMs,
      completedAtMs: 0,
      ok: null,
      status: null,
      durationMs: null,
      connectionReused: false,
      error: ''
    };
    logExit('leave-connection-prewarm-start', result.safety.leavePrewarm);
    const prewarm = options.prewarmGameConnection || prewarmGameConnection;
    leavePrewarmInFlight = Promise.resolve(prewarm({
      gameOrigin: config.gameOrigin,
      localAddress: config.sourceIp,
      timeoutMs: Math.min(3000, Math.max(500, Number(config.httpTimeoutMs || 3000))),
      fetchImpl: options.fetchImpl,
      now
    })).then(warm => {
      result.safety.leavePrewarm = {
        ...result.safety.leavePrewarm,
        active: false,
        completedAtMs: now(),
        ok: Boolean(warm?.ok),
        status: Number(warm?.status || 0),
        durationMs: Number(warm?.durationMs || 0),
        connectionReused: Boolean(warm?.connectionReused),
        error: ''
      };
      logExit('leave-connection-prewarm-result', result.safety.leavePrewarm);
      return warm;
    }).catch(err => {
      result.safety.leavePrewarm = {
        ...result.safety.leavePrewarm,
        active: false,
        completedAtMs: now(),
        ok: false,
        error: errorMessage(err)
      };
      logExit('leave-connection-prewarm-result', result.safety.leavePrewarm);
      return result.safety.leavePrewarm;
    }).finally(() => {
      leavePrewarmInFlight = null;
    });
    return leavePrewarmInFlight;
  };
  const logAction = detail => {
    if (logStore) logStore.append('runner', 'movement-command', addRunMeta(detail));
  };
  const logCombat = detail => {
    const type = combatLiveEnabled ? 'combat-live' : 'combat-dry-run';
    const enriched = addRunMeta(detail);
    // Combat frames are no longer appended to a single unbounded `combat.jsonl`.
    // Each engagement is written to its own per-battle file and compressed on
    // completion; idle/no-engagement diagnostic frames are discarded there.
    if (combatBattleLog) {
      try {
        combatBattleLog.record(type, enriched);
      } catch (err) {
        log('combat-battle-log-error', { error: errorMessage(err) });
      }
    } else if (logStore) {
      // Fallback only when no battle-log is wired (self-tests / disabled IO).
      logStore.append('combat', type, enriched);
    }
  };
  const logWs = (type, detail) => {
    if (config.wsTraceEnabled && logStore) logStore.append('ws', type, addRunMeta(detail));
  };
  const recordDeferredMainThreadTask = (taskName, started, cpuStarted, stages = {}, detail = {}) => {
    const durationMs = performance.now() - started;
    const entry = recordMainThreadTask(result.hotPath, taskName, durationMs, stages, {
      workProfile: mainThreadWorkProfile(cpuStarted, durationMs),
      ...detail
    });
    if (entry && entry.durationMs >= result.hotPath.budgetMs) log('main-thread-budget-exceeded', entry);
    return entry;
  };
  const flushSnapshotObserver = () => {
    snapshotObserverScheduled = false;
    const pending = pendingSnapshotObserver;
    pendingSnapshotObserver = null;
    if (!pending || typeof options.onSnapshotPayload !== 'function') return;
    const started = performance.now();
    const cpuStarted = startMainThreadCpuUsage();
    try {
      options.onSnapshotPayload(pending.payload, {
        source: 'ws',
        observedAtMs: pending.observedAtMs
      });
    } catch (err) {
      log('canary-snapshot-observer-error', { error: err?.message || String(err) });
    } finally {
      recordDeferredMainThreadTask('snapshot-observer-update', started, cpuStarted, {}, {
        tick: pending.payload?.tick ?? null,
        inputScale: {
          entityCount: Array.isArray(pending.payload?.entities) ? pending.payload.entities.length : 0,
          coinCount: Array.isArray(pending.payload?.coin_drops) ? pending.payload.coin_drops.length : 0,
          messageCount: Array.isArray(pending.payload?.messages) ? pending.payload.messages.length : 0
        }
      });
    }
  };
  const flushSnapshotObservationRefresh = () => {
    snapshotObservationRefreshScheduled = false;
    const pending = pendingSnapshotObservationRefresh;
    pendingSnapshotObservationRefresh = null;
    if (!pending || typeof decisionAdapter.refreshSnapshotObservation !== 'function') return;
    const started = performance.now();
    const cpuStarted = startMainThreadCpuUsage();
    try {
      const currentState = stateStore.getDecisionState?.(pending.observedAtMs)
        || stateStore.getState(pending.observedAtMs);
      decisionAdapter.refreshSnapshotObservation(currentState, {
        ...runtimeDefaults,
        nowMs: pending.observedAtMs,
        controlMode,
        combatEnabled: config.combatEnabled
      });
    } catch (err) {
      log('canary-snapshot-observation-refresh-error', { error: err?.message || String(err) });
    } finally {
      recordDeferredMainThreadTask('snapshot-observation-refresh', started, cpuStarted, {}, {
        tick: pending.tick ?? null,
        inputScale: pending.inputScale
      });
    }
  };
  const scheduleSnapshotWork = (payload, observedAtMs) => {
    if (typeof options.onSnapshotPayload === 'function') {
      pendingSnapshotObserver = { payload, observedAtMs };
      if (!snapshotObserverScheduled) {
        snapshotObserverScheduled = true;
        setImmediate(flushSnapshotObserver);
      }
    }
    if (typeof decisionAdapter.refreshSnapshotObservation === 'function') {
      pendingSnapshotObservationRefresh = {
        observedAtMs,
        tick: payload?.tick ?? null,
        inputScale: {
          entityCount: Array.isArray(payload?.entities) ? payload.entities.length : 0,
          coinCount: Array.isArray(payload?.coin_drops) ? payload.coin_drops.length : 0
        }
      };
      if (!snapshotObservationRefreshScheduled) {
        snapshotObservationRefreshScheduled = true;
        setImmediate(flushSnapshotObservationRefresh);
      }
    }
  };
  const publishTransport = currentTransport => {
    if (!currentTransport || transportPublished || typeof options.onTransportOpen !== 'function') return;
    try {
      options.onTransportOpen(currentTransport, {
        runId,
        runtimeRevision,
        mode: controlMode,
        openedAt: new Date(now()).toISOString()
      });
      transportPublished = true;
    } catch (err) {
      log('canary-transport-open-hook-error', { error: err?.message || String(err) });
    }
  };
  const clearPublishedTransport = (currentTransport, reason = 'closed') => {
    if (!transportPublished) return;
    transportPublished = false;
    if (typeof options.onTransportClose !== 'function') return;
    try {
      options.onTransportClose(currentTransport, {
        runId,
        runtimeRevision,
        mode: controlMode,
        reason,
        closedAt: new Date(now()).toISOString()
      });
    } catch (err) {
      log('canary-transport-close-hook-error', { error: err?.message || String(err), reason });
    }
  };
  log('canary-target-whitelist', {
    ...(targetWhitelistSummary || {}),
    runtimeRevisionResolution: browserlessRuntimeRevisionStatus()
  });
  log('canary-realtime-control-warmup', realtimeControlWarmup);
  const updateActionResult = (actionResult, context = {}) => {
    if (!actionResult) return;
    const adapterState = actionAdapter?.getState?.() || {};
    result.actions.sentCount = Number(adapterState.sentCount || 0);
    result.actions.velocitySentCount = Number(adapterState.velocitySentCount || 0);
    result.actions.velocityRepeatSentCount = Number(adapterState.velocityRepeatSentCount || 0);
    result.actions.shootSentCount = Number(adapterState.shootSentCount || 0);
    result.actions.shootAcceptedCount = Number(adapterState.shootAcceptedCount || 0);
    result.actions.shootUnackedCount = Number(adapterState.shootUnackedCount || 0);
    result.actions.shootRepeatSentCount = Number(adapterState.shootRepeatSentCount || 0);
    result.actions.stopCount = Number(adapterState.stopCount || 0);
    result.actions.skippedCount = Number(adapterState.skippedCount || 0);
    result.actions.last = actionResult;
    result.actions.settlement = adapterState.lastSettlement || result.actions.settlement;
    result.actions.movementStall = adapterState.movementStall || result.actions.movementStall;
    result.actions.lastMovementStall = adapterState.lastMovementStall || result.actions.lastMovementStall;
    result.actions.lastShootAck = adapterState.lastShootAck || result.actions.lastShootAck;
    logAction({ action: actionResult, state: adapterState });
    if (typeof options.onAction === 'function') {
      try {
        options.onAction(actionResult, {
          actionState: adapterState,
          decision: context.decision || null,
          summary: context.summary || null,
          atMs: Number(context.atMs || 0) || now()
        });
      } catch (err) {
        log('canary-action-status-error', { error: err?.message || String(err) });
      }
    }
  };
  const compactLeavePendingCover = cover => {
    if (!cover) return null;
    const { threatField: _threatField, ...summary } = cover;
    return summary;
  };
  const publicLeavePending = pending => pending ? {
    active: Boolean(!pending.settled),
    startedAt: new Date(pending.startedAtMs).toISOString(),
    startedAtMs: pending.startedAtMs,
    eventAtMs: pending.eventAtMs,
    dispatchDelayMs: Math.max(0, pending.dispatchedAtMs - pending.eventAtMs),
    firstRequestAtMs: pending.firstRequestAtMs || 0,
    firstRequestDelayMs: pending.firstRequestAtMs
      ? Math.max(0, pending.firstRequestAtMs - pending.eventAtMs)
      : null,
    completedAtMs: pending.completedAtMs || 0,
    durationMs: (pending.completedAtMs || now()) - pending.startedAtMs,
    frameCount: pending.frameCount,
    realtimeFrameCount: pending.realtimeFrameCount,
    coverRecomputeCount: pending.coverRecomputeCount,
    dynamicCoverCount: pending.dynamicCoverCount,
    directionChangeCount: pending.directionChangeCount,
    startHp: pending.startHp,
    lastHp: pending.lastHp,
    minHp: pending.minHp,
    observedHpLoss: pending.startHp === null || pending.minHp === null
      ? null
      : Math.max(0, pending.startHp - pending.minHp),
    targetId: pending.targetId || '',
    lastCover: compactLeavePendingCover(pending.lastCover),
    settled: Boolean(pending.settled),
    ok: pending.ok === null ? null : Boolean(pending.ok),
    error: pending.error || ''
  } : null;
  const applyLeavePendingCover = (currentState, atMs, detail = {}) => {
    if (!actionAdapter || !currentState?.realtime?.self) return null;
    const pending = leavePending || {
      event: detail.event || null,
      triggerDecision: detail.decision || result.decisions.last,
      target: detail.decision?.action?.target || detail.decision?.combat?.target || null,
      lastCover: null
    };
    const built = buildLeavePendingCover(currentState, pending, {
      ...runtimeDefaults,
      nowMs: atMs,
      preferTriggerCover: detail.preferTriggerCover === true
    });
    if (!built) return null;
    const cover = compactLeavePendingCover(built.cover);
    let actionResult;
    try {
      actionResult = actionAdapter.applyDecision(currentState, built.decision);
    } catch (err) {
      actionResult = {
        ok: false,
        kind: 'leave-pending-cover-error',
        reason: 'leave-pending-cover-apply-failed',
        error: errorMessage(err)
      };
    }
    if (typeof detail.onApplied === 'function') {
      try {
        detail.onApplied(cover, actionResult);
      } catch (err) {
        log('leave-pending-cover-applied-hook-error', { error: errorMessage(err) });
      }
    }
    updateActionResult(actionResult, { decision: built.decision, summary: built.decision, atMs });
    if (leavePending) {
      leavePending.coverRecomputeCount += 1;
      leavePending.dynamicCoverCount += 1;
      if (built.cover.changed) leavePending.directionChangeCount += 1;
      leavePending.lastCover = cover;
      result.safety.leavePending = publicLeavePending(leavePending);
    }
    logExit('leave-pending-cover', {
      trigger: detail.trigger || 'frame',
      cover,
      action: actionResult
    });
    return cover;
  };
  const startLeavePending = (event, currentState, atMs, detail = {}) => {
    if (!event?.shouldLeave || leavePending) return leavePending;
    const selfHp = Number(currentState?.realtime?.self?.hp);
    const eventAtMs = Date.parse(String(event.at || ''));
    leavePending = {
      event,
      triggerDecision: detail.decision || result.decisions.last,
      target: detail.decision?.action?.target || detail.decision?.combat?.target || null,
      targetId: String(detail.decision?.action?.target?.userId ?? detail.decision?.combat?.target?.userId ?? ''),
      startedAtMs: atMs,
      eventAtMs: Number.isFinite(eventAtMs) ? eventAtMs : atMs,
      dispatchedAtMs: now(),
      firstRequestAtMs: 0,
      completedAtMs: 0,
      frameCount: 0,
      realtimeFrameCount: 0,
      coverRecomputeCount: 0,
      dynamicCoverCount: 0,
      directionChangeCount: 0,
      startHp: Number.isFinite(selfHp) ? selfHp : null,
      lastHp: Number.isFinite(selfHp) ? selfHp : null,
      minHp: Number.isFinite(selfHp) ? selfHp : null,
      lastCover: detail.cover || null,
      settled: false,
      ok: null,
      error: '',
      promise: null
    };
    result.safety.leavePending = publicLeavePending(leavePending);
    logExit('leave-pending-start', result.safety.leavePending);
    leavePending.promise = executeSafetyExit(event, config, {
      transport,
      allowStopMotion: actionEnabled,
      leaveWithVerification: options.leaveWithVerification,
      now,
      sleep,
      onLeaveRequest: request => {
        if (!leavePending.firstRequestAtMs) leavePending.firstRequestAtMs = now();
        result.safety.leavePending = publicLeavePending(leavePending);
        logExit('leave-request-start', {
          ...request,
          firstRequestDelayMs: result.safety.leavePending.firstRequestDelayMs
        });
      },
      onLeaveResult: attempt => {
        logExit('leave-request-result', attempt);
      },
      onLeaveConfirmed: async leave => {
        ending = true;
        clearPublishedTransport(transport, 'leave-confirmed');
        const actionSeal = actionAdapter?.sealTransport
          ? actionAdapter.sealTransport('leave-confirmed')
          : null;
        let transportClose = { attempted: false, closed: false, reason: 'missing-transport' };
        if (transport && (transport.isOpen?.() || isWsOpen(transport.ws))) {
          transport.close();
          transportClose = { attempted: true, closed: true, reason: 'leave-confirmed' };
        }
        log('canary-leave-confirmed-control-close', {
          leaveConfirmed: Boolean(leave?.ok),
          actionSeal,
          transportClose
        });
        return { ok: true, actionSeal, transportClose };
      }
    }).then(exit => {
      leavePending.settled = true;
      leavePending.ok = Boolean(exit?.ok);
      leavePending.completedAtMs = now();
      result.safety.exit = exit;
      result.leave = exit?.leave || null;
      result.safety.leavePending = publicLeavePending(leavePending);
      logExit('leave-pending-finish', result.safety.leavePending);
      return exit;
    }).catch(err => {
      leavePending.settled = true;
      leavePending.ok = false;
      leavePending.error = errorMessage(err);
      leavePending.completedAtMs = now();
      result.safety.leavePending = publicLeavePending(leavePending);
      logExit('leave-pending-finish', result.safety.leavePending);
      throw err;
    });
    return leavePending;
  };
  const recordSafetyEvent = (event, context = {}) => {
    if (!event || event.ok || result.safety.event) return false;
    const atMs = Number(context.atMs || now());
    const currentState = context.state || stateStore.getDecisionState?.(atMs) || stateStore.getState(atMs);
    let leaveStarted = false;
    const lockAndStartLeave = cover => {
      if (leaveStarted) return;
      leaveStarted = true;
      result.safety.event = event;
      result.error = event.reason;
      startLeavePending(event, currentState, atMs, {
        decision: context.decision || result.decisions.last,
        cover
      });
    };
    let cover = null;
    if (event.shouldLeave) {
      cover = applyLeavePendingCover(currentState, atMs, {
        event,
        decision: context.decision || result.decisions.last,
        trigger: 'safety-event',
        preferTriggerCover: true,
        onApplied: appliedCover => lockAndStartLeave(appliedCover)
      });
    }
    if (event.shouldLeave && !leaveStarted) lockAndStartLeave(cover);
    if (!event.shouldLeave) {
      result.safety.event = event;
      result.error = event.reason;
    }
    logSafety(event);
    return true;
  };
  const handleSafetyAssessment = (event, context = {}) => {
    if (event?.softStop) {
      if (!frameGapSoftStopActive) {
        frameGapSoftStopActive = true;
        result.safety.frameGapSoftStops.push(event.detail || null);
        result.safety.frameGapSoftStops = result.safety.frameGapSoftStops.slice(-20);
        log('frame-gap-soft-stop', event.detail || {});
        if (actionAdapter) updateActionResult(actionAdapter.stop('frame-gap-soft-stop'));
      }
      return true;
    }
    if (event?.recovered) {
      frameGapSoftStopActive = false;
      result.safety.lastFrameGapRecovery = event.detail || null;
      lastDecisionAtMs = 0;
      log('frame-gap-soft-recovered', event.detail || {});
      return false;
    }
    return recordSafetyEvent(event, context);
  };

  const completionContext = (currentState, atMs) => {
    const output = {};
    const tracker = options.combatCompletionTracker;
    if (!tracker || typeof tracker.probability !== 'function') return output;
    for (const entity of currentState?.realtime?.entities || []) {
      const userId = entity?.user_id ?? entity?.userId;
      if (userId === null || userId === undefined || userId === '') continue;
      try {
        output[String(userId)] = tracker.probability(userId, atMs);
      } catch (_) {}
    }
    return output;
  };
  const buildDecisionWorkerContext = (currentState, atMs) => {
    let easyKillStatus = null;
    let damageStatus = null;
    try {
      easyKillStatus = options.easyKillPlayerTracker?.status?.(atMs) || null;
    } catch (_) {}
    try {
      damageStatus = options.damagePlayerTracker?.status?.(atMs) || null;
    } catch (_) {}
    return {
      easyKillStatus,
      damageStatus,
      combatCompletionByUserId: completionContext(currentState, atMs)
    };
  };
  const applyDecisionWorkerEffects = effects => {
    for (const effect of effects || []) {
      if (effect?.tracker !== 'easy-kill') continue;
      const method = String(effect.method || '');
      const tracker = options.easyKillPlayerTracker;
      if (!tracker || typeof tracker[method] !== 'function') continue;
      try {
        tracker[method](...(Array.isArray(effect.args) ? effect.args : []));
      } catch (err) {
        log('canary-decision-worker-effect-error', { method, error: errorMessage(err) });
      }
    }
  };
  const applyDecisionAction = (currentState, summary, decision, atMs, detail = {}) => {
    if (!actionAdapter) return null;
    let actionResult;
    try {
      actionResult = actionAdapter.applyDecision(currentState, summary);
    } catch (err) {
      const message = err?.message || String(err);
      actionResult = {
        ok: false,
        kind: 'action-error',
        reason: detail.errorReason || 'action-apply-failed',
        error: message,
        transportClosed: /websocket is not open|not open|closed/i.test(message)
      };
    }
    updateActionResult(actionResult, { decision, summary, atMs });
    if (actionResult?.transportClosed) {
      recordSafetyEvent(createSafetyEvent('ws-closed', {
        source: 'action-send',
        action: actionResult
      }, { nowMs: atMs, stopMotion: false }));
      return actionResult;
    }
    if (actionResult?.ok === false && actionResult?.error) {
      recordSafetyEvent(createSafetyEvent('ws-error', {
        source: actionResult.reason === 'action-apply-failed' ? 'action-apply' : 'action-send',
        error: actionResult.error || 'action failed'
      }, { nowMs: atMs, stopMotion: false }));
      return actionResult;
    }
    decisionAdapter.observeActionResult?.(actionResult, decision, { nowMs: atMs });
    if (detail.notifyDecisionWorker) {
      decisionWorker?.observeActionResult?.(actionResult, decision, { nowMs: atMs });
    }
    return actionResult;
  };
  const publishFullDecision = (decision, currentState, atMs, detail = {}) => {
    const appliedDecision = applyRestartDrainDecisionGate(decision);
    const summary = summarizeBrowserlessDecision(appliedDecision);
    result.decisions.evaluatedCount += 1;
    result.decisions.last = summary;
    scheduleCombatPersistence(atMs);
    observeDynamicWhitelistBattles(currentState, atMs);
    logDecision(summary);
    result.decisions.loggedCount += 1;
    if (controlMode === 'combat-dry-run' || controlMode === 'combat-live' || combatLiveEnabled) {
      logCombat(summary.combat || {});
    }
    if (typeof options.onDecision === 'function') {
      try {
        options.onDecision(summary, { state: currentState, decision, worker: detail.worker || null });
      } catch (err) {
        log('canary-decision-status-error', { error: err?.message || String(err) });
      }
    }
    const decisionSafetyEvent = safetyController.evaluate(currentState, {
      startedAtMs: noSelfGuardStartedAtMs(atMs),
      frameGapAlertMs,
      staleSelfMs: config.staleSelfMs,
      staleSelfConfirmMs: config.staleSelfConfirmMs,
      noSelfGraceMs: config.noSelfGraceMs,
      staminaExhaustedBelowMs: config.staminaExhaustedBelowMs,
      actionSettlementStall: result.actions.movementStall,
      decision: summary,
      nowMs: atMs
    });
    if (handleSafetyAssessment(decisionSafetyEvent, { state: currentState, decision: summary, atMs })) return summary;
    applyDecisionAction(currentState, summary, appliedDecision, atMs, {
      notifyDecisionWorker: detail.notifyDecisionWorker,
      errorReason: 'action-apply-failed'
    });
    return summary;
  };
  const realtimeControlKey = summary => [
    summary?.action?.kind || '',
    summary?.action?.reason || '',
    summary?.action?.target?.userId ?? summary?.action?.target?.user_id ?? summary?.combat?.target?.userId ?? ''
  ].join('|');
  const realtimeControlStatusKey = summary => [
    realtimeControlKey(summary),
    summary?.input?.self?.hp ?? '',
    summary?.combat?.target?.hp ?? summary?.action?.target?.hp ?? '',
    summary?.action?.shouldLeave ? 1 : 0
  ].join('|');
  const publishCombatControlStatus = (summary, currentState, control, atMs, force = false) => {
    if (typeof options.onCombatControl !== 'function') return;
    const key = realtimeControlStatusKey(summary);
    const urgent = summary?.band === 'safety' || summary?.action?.shouldLeave === true;
    if (!force && !urgent && key === lastCombatControlStatusKey
      && atMs - lastCombatControlStatusAtMs < combatControlStatusPublishMs) return;
    try {
      options.onCombatControl(summary, { state: currentState, control });
      lastCombatControlStatusKey = key;
      lastCombatControlStatusAtMs = atMs;
    } catch (err) {
      log('canary-combat-status-error', { error: errorMessage(err) });
    }
  };
  const publishRealtimeControl = (control, currentState, atMs) => {
    control = applyRestartDrainDecisionGate(control || {});
    const action = control?.action || null;
    if (!action) {
      if (!realtimeControlActive) return false;
      realtimeControlActive = false;
      realtimeFinalActionPreemptionActive = false;
      lastDecisionAtMs = 0;
      const release = {
        kind: 'wait',
        band: 'wait',
        reason: 'realtime-control-released',
        at: new Date(atMs).toISOString(),
        tick: currentState?.realtime?.tick ?? null,
        action: { kind: 'wait', band: 'wait', reason: 'realtime-control-released' },
        combat: control?.combat || null,
        input: control?.input || null
      };
      result.decisions.last = release;
      observeDynamicWhitelistBattles(currentState, atMs);
      publishCombatControlStatus(release, currentState, control, atMs, true);
      applyDecisionAction(currentState, release, control, atMs, { errorReason: 'realtime-control-release-failed' });
      return true;
    }
    if (!realtimeFinalActionPreemptionActive
      && ['exit', 'safety', 'combat', 'recover'].includes(String(action.band || ''))) {
      decisionAdapter.noteRealtimeFinalActionPreemption?.(action, atMs);
      realtimeFinalActionPreemptionActive = true;
    }
    realtimeControlActive = true;
    const combatSummary = {
      ...(control.combat || {}),
      decisionIntervalMs,
      combatControlIntervalMs,
      highFrequencyControl: true
    };
    const summary = {
      kind: action.kind || control.kind || '',
      band: action.band || control.band || '',
      reason: action.reason || control.reason || '',
      at: control.at || new Date(atMs).toISOString(),
      tick: control.tick ?? currentState?.realtime?.tick ?? null,
      action,
      combat: combatSummary,
      input: control.input || null
    };
    result.decisions.realtimeControlCount += 1;
    result.decisions.last = summary;
    scheduleCombatPersistence(atMs);
    observeDynamicWhitelistBattles(currentState, atMs);
    logCombat(combatSummary);
    const key = realtimeControlKey(summary);
    if (key !== lastRealtimeControlKey || atMs - lastRealtimeControlLogAtMs >= decisionIntervalMs) {
      logDecision(summary);
      result.decisions.loggedCount += 1;
      lastRealtimeControlKey = key;
      lastRealtimeControlLogAtMs = atMs;
    }
    publishCombatControlStatus(summary, currentState, control, atMs);
    const immediate = safetyController.evaluate(currentState, {
      startedAtMs: noSelfGuardStartedAtMs(atMs),
      decision: summary,
      nowMs: atMs
    });
    if (handleSafetyAssessment(immediate, { state: currentState, decision: summary, atMs })) return true;
    applyDecisionAction(currentState, summary, control, atMs, { errorReason: 'realtime-control-apply-failed' });
    return true;
  };
  const evaluateRealtimeControl = (currentState, atMs, force = false, outerStages = null) => {
    if (!actionAdapter || !combatLiveEnabled) return false;
    const inputTickValue = Number(currentState?.realtime?.tick);
    const inputTick = Number.isFinite(inputTickValue) ? inputTickValue : null;
    if (!force && inputTick !== null) {
      if (lastCombatControlTick !== null && inputTick < lastCombatControlTick) {
        lastCombatControlTick = null;
        nextCombatControlTick = null;
      }
      if (lastCombatControlTick !== null && inputTick <= lastCombatControlTick) return realtimeControlActive;
      if (nextCombatControlTick !== null && inputTick < nextCombatControlTick) {
        const skipped = result.decisions.realtimeControlSchedule;
        skipped.skippedTicks += 1;
        skipped.nextEligibleTick = nextCombatControlTick;
        return realtimeControlActive;
      }
    } else if (!force && atMs - lastCombatControlAtMs < combatControlIntervalMs) {
      return realtimeControlActive;
    }
    const completeStarted = performance.now();
    const previousProcessedTick = lastCombatControlTick;
    let realtimeStages = null;
    const control = typeof decisionAdapter.evaluateRealtime === 'function'
      ? decisionAdapter.evaluateRealtime(currentState, {
          ...runtimeDefaults,
          nowMs: atMs,
          controlMode,
          combatEnabled: config.combatEnabled,
          onRealtimeStageTimings: (stages, scale) => {
            realtimeStages = stages;
            lastRealtimeControlScale = scale || null;
          }
        })
      : decisionAdapter.evaluateCombat?.(currentState, {
          ...runtimeDefaults,
          nowMs: atMs,
          controlMode,
          combatEnabled: config.combatEnabled
        });
    if (outerStages && realtimeStages) {
      for (const [name, durationMs] of Object.entries(realtimeStages)) {
        outerStages[`realtime-${name}`] = durationMs;
      }
    }
    const tickDelta = inputTick !== null && previousProcessedTick !== null
      ? Math.max(0, inputTick - previousProcessedTick)
      : null;
    if (control?.combat && typeof control.combat === 'object') {
      control.combat.controlSchedule = {
        inputTick,
        tickDelta,
        configuredIntervalMs: combatControlIntervalMs,
        minimumTickStride: combatControlMinimumTickStride,
        previousCompleteMs: result.decisions.realtimeControlSchedule.lastCompleteMs,
        skippedTicks: result.decisions.realtimeControlSchedule.skippedTicks
      };
    }
    lastCombatControlAtMs = atMs;
    lastCombatControlTick = inputTick;
    let handled = false;
    if (!(control?.action?.kind === 'wait' && !realtimeControlActive)) {
      const publishStarted = performance.now();
      handled = publishRealtimeControl(control || {}, currentState, atMs);
      if (outerStages) outerStages['realtime-publish'] = performance.now() - publishStarted;
    }
    const completeMs = performance.now() - completeStarted;
    nextCombatControlTick = nextCombatControlTickCore(inputTick, completeMs, {
      tickMs: combatServerTickMs,
      intervalMs: combatControlIntervalMs
    });
    result.decisions.realtimeControlSchedule = {
      ...result.decisions.realtimeControlSchedule,
      lastProcessedTick: inputTick,
      lastTickDelta: tickDelta,
      nextEligibleTick: nextCombatControlTick,
      lastCompleteMs: completeMs,
      maxCompleteMs: Math.max(
        Number(result.decisions.realtimeControlSchedule.maxCompleteMs || 0),
        completeMs
      )
    };
    return handled;
  };
  const assessRestartDrain = (currentState, atMs) => {
    if (!restartDrain?.isRequested?.()) return false;
    const pendingStatus = restartDrain.status();
    const assessment = evaluateRestartReadiness({
      online: true,
      decision: result.decisions.last,
      decisionState: decisionAdapter.getState?.() || null,
      realtime: currentState?.realtime || null,
      leavePending: publicLeavePending(leavePending),
      commitmentKey: pendingStatus.commitmentKey || ''
    }, runtimeDefaults);
    const status = restartDrain.observe(assessment);
    publishRestartDrainStatus(status);
    if (!status.ready || result.safety.event) return false;
    const event = safetyController.requestStop('restart-drain-ready', {
      source: 'restart-drain',
      drain: {
        requestedAt: status.requestedAt || '',
        waitMs: Number(status.waitMs || 0),
        commitmentKey: status.commitmentKey || '',
        assessment
      }
    });
    return handleSafetyAssessment(safetyController.evaluate(currentState, {
      decision: result.decisions.last,
      nowMs: atMs,
      stopRequested: true,
      stopDetail: event.detail
    }), { state: currentState, decision: result.decisions.last, atMs });
  };
  const dispatchWorkerDecision = (currentState, atMs) => {
    if (!decisionWorker || plannerInFlight || ending || result.safety.event) return false;
    if (!currentState?.realtime?.self) return false;
    plannerInFlight = true;
    lastDecisionAtMs = atMs;
    const workerOptions = {
      ...runtimeDefaults,
      nowMs: atMs,
      controlMode,
      combatEnabled: config.combatEnabled,
      targetWhitelistNames: [],
      targetWhitelistUserIds: [
        ...creatorUserIds,
        ...(options.dynamicWhitelist?.status?.().userIds || [])
      ]
    };
    const context = buildDecisionWorkerContext(currentState, atMs);
    const statePatch = decisionAdapter.getRealtimePersistenceState?.() || null;
    decisionWorker.decide(currentState, workerOptions, context, statePatch)
      .then(workerResult => {
        const taskStarted = performance.now();
        const taskCpuStarted = startMainThreadCpuUsage();
        const stages = {};
        try {
          plannerInFlight = false;
          result.decisions.worker = {
            computeMs: Math.round(Number(workerResult.computeMs || 0) * 1000) / 1000,
            postMs: Math.round(Number(workerResult.postMs || 0) * 1000) / 1000,
            roundTripMs: Math.round(Number(workerResult.roundTripMs || 0) * 1000) / 1000,
            requestAtMs: workerResult.requestAtMs || atMs,
            completedAt: new Date(now()).toISOString()
          };
          if (ending || result.safety.event) return;
          const responseAtMs = now();
          let stageStarted = performance.now();
          const latestState = stateStore.getDecisionState?.(responseAtMs) || stateStore.getState(responseAtMs);
          stages['planner-response-state'] = performance.now() - stageStarted;
          stageStarted = performance.now();
          if (responseAtMs - Number(workerResult.requestAtMs || atMs) > Math.max(1000, decisionIntervalMs)) {
            lastDecisionAtMs = 0;
            log('canary-decision-worker-stale', {
              requestAtMs: workerResult.requestAtMs || atMs,
              responseAtMs,
              roundTripMs: workerResult.roundTripMs
            });
            stages['planner-response-stale'] = performance.now() - stageStarted;
            return;
          }
          stages['planner-response-stale'] = performance.now() - stageStarted;
          const currentPersistenceState = decisionAdapter.getRealtimePersistenceState?.() || null;
          if (plannerResponseHasNewerPreemption(statePatch, currentPersistenceState)) {
            lastDecisionAtMs = 0;
            log('canary-decision-worker-preempted', {
              requestAtMs: workerResult.requestAtMs || atMs,
              responseAtMs,
              sentGeneration: finalActionPreemptionGeneration(statePatch),
              currentGeneration: finalActionPreemptionGeneration(currentPersistenceState)
            });
            dispatchWorkerDecision(latestState, responseAtMs);
            return;
          }
          stageStarted = performance.now();
          decisionAdapter.syncPlannerDecision?.(workerResult.decision);
          stages['planner-response-sync'] = performance.now() - stageStarted;
          stageStarted = performance.now();
          if (evaluateRealtimeControl(latestState, responseAtMs, true, stages)) {
            stages['planner-response-realtime'] = performance.now() - stageStarted;
            return;
          }
          stages['planner-response-realtime'] = performance.now() - stageStarted;
          if (latestState?.realtime?.self && !workerResult.decision?.input?.self) {
            lastDecisionAtMs = 0;
            dispatchWorkerDecision(latestState, responseAtMs);
            return;
          }
          stageStarted = performance.now();
          applyDecisionWorkerEffects(workerResult.effects);
          publishFullDecision(workerResult.decision, latestState, responseAtMs, {
            worker: result.decisions.worker,
            summary: workerResult.summary,
            notifyDecisionWorker: true
          });
          stages['planner-response-apply'] = performance.now() - stageStarted;
        } finally {
          const taskDurationMs = performance.now() - taskStarted;
          const entry = recordMainThreadTask(result.hotPath, 'planner-response', taskDurationMs, stages, {
            tick: workerResult.decision?.tick ?? null,
            workProfile: mainThreadWorkProfile(taskCpuStarted, taskDurationMs),
            responseScale: workerResult.responseScale || {
              effectCount: workerResult.effects?.length || 0
            }
          });
          if (entry && entry.durationMs >= result.hotPath.budgetMs) {
            log('main-thread-budget-exceeded', entry);
          }
        }
      })
      .catch(err => {
        plannerInFlight = false;
        if (ending || result.safety.event) return;
        const at = now();
        const event = createSafetyEvent('decision-worker-failed', {
          source: 'decision-worker',
          error: errorMessage(err)
        }, { nowMs: at, stopMotion: true });
        recordSafetyEvent(event);
        if (actionAdapter) updateActionResult(actionAdapter.stop('decision-worker-failed'));
      });
    return true;
  };

  try {
    if (options.bypassPreLoginSafetyReason) {
      const required = Math.max(1, Math.round(Number(
        config.loginPointSafetySuccessRequired
          ?? runtimeDefaults.loginPointSafetySuccessRequired
          ?? 3
      ) || 3));
      result.snapshotSafety = {
        ok: true,
        reason: String(options.bypassPreLoginSafetyReason),
        bypassedPreLoginSafety: true,
        bypassKind: 'daily-first-login',
        required,
        streak: required,
        satisfied: true,
        checkedAt: new Date(now()).toISOString()
      };
    } else if (options.precheckedSnapshotSafety && typeof options.precheckedSnapshotSafety === 'object') {
      result.snapshotSafety = options.precheckedSnapshotSafety;
    } else {
      const recoverySnapshotConfig = persistedPendingExit
        ? {
            ...config,
            snapshotEdgeEnabled: false,
            loginPointSafetySuccessRequired: 1,
            loginPointSafetyProbeIntervalMs: 0
          }
        : config;
      result.snapshotSafety = await (options.runPreLoginSnapshotSafety || runPreLoginSnapshotSafety)(
        recoverySnapshotConfig,
        options.persistedState || {},
        options
      );
    }
  } catch (err) {
    const message = errorMessage(err);
    result.snapshotSafety = {
      ok: false,
      reason: 'snapshot-error',
      error: message
    };
    log('canary-snapshot-safety-error', { error: message });
  }
  log('canary-snapshot-safety', result.snapshotSafety);
  result.snapshotSafety = allowSelfPresentSnapshotControl(result.snapshotSafety);
  const pendingExitResolution = pendingExitSnapshotResolution(persistedPendingExit, result.snapshotSafety);
  exitRecoveryActive = pendingExitResolution.active;
  result.recovery.exitRecovery = pendingExitResolution.active;
  result.recovery.pendingExit = pendingExitResolution.pendingExit;
  result.recovery.pendingExitResolution = pendingExitResolution.reason;
  if (pendingExitResolution.cleared) {
    log('canary-exit-recovery-cleared', {
      reason: pendingExitResolution.reason,
      previousRunId: persistedPendingExit?.sourceRunId || '',
      pendingReason: persistedPendingExit?.reason || ''
    });
  } else if (pendingExitResolution.active) {
    result.mode = 'exit-recovery';
    log('canary-exit-recovery-active', {
      reason: pendingExitResolution.reason,
      previousRunId: persistedPendingExit?.sourceRunId || '',
      pendingReason: persistedPendingExit?.reason || '',
      attemptCount: persistedPendingExit?.attemptCount || 0,
      requestAttemptCount: persistedPendingExit?.requestAttemptCount || 0
    });
  }
  if (result.snapshotSafety?.bypassKind === 'single-blocker-timeout') {
    log('canary-snapshot-single-blocker-timeout-bypass', result.snapshotSafety);
  } else if (result.snapshotSafety?.bypassedPreLoginSafety && result.snapshotSafety?.bypassKind !== 'daily-first-login') {
    log('canary-snapshot-self-present-reentry', result.snapshotSafety);
  } else if (result.snapshotSafety?.bypassKind === 'daily-first-login') {
    log('canary-snapshot-daily-first-login-bypass', result.snapshotSafety);
  }
  if (snapshotSafetySelfAbsent(result.snapshotSafety) && result.recovery.inGameEvidence) {
    result.recovery = {
      ...result.recovery,
      inGameEvidence: false,
      clearedBy: 'snapshot-self-absent'
    };
    log('canary-recovery-cleared', result.recovery);
  } else if (result.recovery.inGameEvidence) {
    log('canary-recovery-in-game-evidence', result.recovery);
  }
  if (!result.snapshotSafety.ok) {
    if (options.allowMissingLoginPointBootstrap && result.snapshotSafety.reason === 'missing-login-point') {
      result.snapshotSafety = {
        ...result.snapshotSafety,
        ok: true,
        bootstrapOnly: true,
        reason: 'bootstrap-missing-login-point'
      };
      log('canary-bootstrap-login-point', result.snapshotSafety);
    } else {
      recordSafetyEvent(safetyController.evaluate(null, {
        snapshotSafety: result.snapshotSafety,
        nowMs: now()
      }));
      result.error = `snapshot safety not confirmed: ${result.snapshotSafety.reason}`;
      result.completedAt = new Date(now()).toISOString();
      log('canary-blocked', { error: result.error });
      try {
        await decisionWorker?.close?.();
      } catch (_) {}
      return result;
    }
  }

  try {
    if (decisionWorker) await decisionWorker.ready();
    maybePrewarmLeaveConnection(stateStore.getState(now()), now(), 'ws-connect', true);
    const open = options.openBrowserlessWs || openBrowserlessWs;
    transport = await open({
      gameOrigin: config.gameOrigin,
      wsPath: config.wsPath,
      wsExtraQuery: config.wsExtraQuery,
      userId: config.userId,
      sessionToken: config.sessionToken,
      localAddress: config.sourceIp,
      connectTimeoutMs: config.wsConnectTimeoutMs,
      onConnectStart: event => {
        logWs('connect-start', {
          runtime: event?.runtime || '',
          localAddress: event?.localAddress || '',
          transportGeneration: Number(event?.transportGeneration || 0) || null
        });
      },
      onOpen: event => {
        const generation = Number(event?.transportGeneration || 0);
        if (generation > 0) authoritativeTransportGeneration = generation;
        wsError = null;
        wsClosed = null;
        transportStartedAtMs = now();
        logWs('open', {
          runtime: event?.runtime || '',
          transportGeneration: generation || null
        });
      },
      onError: event => {
        const generation = Number(event?.transportGeneration || 0);
        if (generation > 0 && authoritativeTransportGeneration > 0 && generation !== authoritativeTransportGeneration) {
          logWs('stale-error', {
            message: event?.message || '',
            transportGeneration: generation,
            authoritativeTransportGeneration
          });
          return;
        }
        wsError = event;
        logWs('error', {
          message: event?.message || '',
          opened: Boolean(event?.opened),
          statusCode: event?.statusCode || null,
          statusMessage: event?.statusMessage || '',
          contentType: event?.contentType || '',
          body: event?.body || '',
          transportGeneration: generation || null
        });
      },
      onClose: event => {
        const generation = Number(event?.transportGeneration || 0);
        if (generation > 0 && authoritativeTransportGeneration > 0 && generation !== authoritativeTransportGeneration) {
          logWs('stale-close', {
            code: Number(event?.code || 0),
            reason: event?.reason || '',
            transportGeneration: generation,
            authoritativeTransportGeneration
          });
          return;
        }
        if (!ending) wsClosed = event;
        restoreDynamicWhitelistBattles('websocket-closed');
        clearPublishedTransport(transport, 'websocket-close');
        logWs('close', event || {});
      },
      onSend: event => {
        logWs('send', {
          direction: 'out',
          message: wsTraceOutboundMessage(event?.message || '')
        });
      },
      onMessage: (data, transportMeta = null) => {
        const generation = Number(transportMeta?.transportGeneration || 0);
        if (generation > 0 && authoritativeTransportGeneration > 0 && generation !== authoritativeTransportGeneration) {
          logWs('stale-message', {
            transportGeneration: generation,
            authoritativeTransportGeneration
          });
          return;
        }
        if (ending) return;
        const taskStarted = performance.now();
        const taskCpuStarted = startMainThreadCpuUsage();
        const stageDurations = {};
        const atMs = now();
        let frame = null;
        try {
          if (!frameHealth.firstFrameAtMs) frameHealth.firstFrameAtMs = atMs;
          if (frameHealth.lastFrameAtMs) frameHealth.maxFrameGapMs = Math.max(frameHealth.maxFrameGapMs, atMs - frameHealth.lastFrameAtMs);
          frameHealth.lastFrameAtMs = atMs;
          let stageStarted = performance.now();
          frame = inspectCanaryFrame(data, { userId: config.userId });
          if (config.wsTraceEnabled) logWs('message', buildWsFrameTrace(frame, config));
          if (frame.decodeError || frame.jsonParseError) frameHealth.decodeErrors += 1;
          updateFrameStats(stats, {
            at: new Date(atMs).toISOString(),
            ...frame
          });
          stageDurations['frame-decode-log'] = performance.now() - stageStarted;
          if (frame.decodeTimings) {
            stageDurations['frame-gzip'] = Number(frame.decodeTimings.gzipMs || 0);
            stageDurations['frame-utf8'] = Number(frame.decodeTimings.utf8Ms || 0);
            stageDurations['frame-json-decode'] = Number(frame.decodeTimings.jsonDecodeMs || 0);
            stageDurations['frame-summary'] = Number(frame.decodeTimings.summaryMs || 0);
          }
          if (frame.decodedJson) {
            stageStarted = performance.now();
            if (frame.decodedJson.type === 'snapshot') scheduleSnapshotWork(frame.decodedJson, atMs);
            stageDurations['snapshot-observers'] = performance.now() - stageStarted;
            stageStarted = performance.now();
            stateStore.ingestFrame(frame.decodedJson, { receivedAtMs: atMs });
            const currentState = stateStore.getDecisionState?.(atMs) || stateStore.getState(atMs);
            observeDynamicWhitelistBattles(currentState, atMs);
            stageDurations['state-ingest-view'] = performance.now() - stageStarted;
            stageStarted = performance.now();
            const currentSelf = currentState?.realtime?.self || null;
            if (
              !result.entry.firstSelf
              && currentSelf
              && Number.isFinite(Number(currentSelf.x))
              && Number.isFinite(Number(currentSelf.y))
            ) {
              result.entry.firstSelf = {
                userId: Number.isFinite(Number(currentSelf.user_id ?? currentSelf.userId)) ? Number(currentSelf.user_id ?? currentSelf.userId) : null,
                entityId: Number.isFinite(Number(currentSelf.entity_id ?? currentSelf.entityId)) ? Number(currentSelf.entity_id ?? currentSelf.entityId) : null,
                name: currentSelf.name || '',
                x: Number(currentSelf.x),
                y: Number(currentSelf.y),
                hp: Number.isFinite(Number(currentSelf.hp)) ? Number(currentSelf.hp) : null
              };
              result.entry.firstSelfAt = new Date(atMs).toISOString();
              result.entry.firstSelfTick = currentState?.realtime?.tick ?? frame.decodedTick ?? null;
            }
            if (exitRecoveryActive && currentSelf && !leavePending) {
              const recoveryEvent = pendingExitRecoveryEvent(persistedPendingExit, atMs);
              if (recoveryEvent) {
                result.recovery.inGameEvidence = true;
                result.recovery.reason = 'pending-exit-self-present';
                result.recovery.source = 'persisted-pending-exit';
                result.recovery.previousRunId = persistedPendingExit?.sourceRunId || '';
                recordSafetyEvent(recoveryEvent, {
                  state: currentState,
                  decision: result.decisions.last,
                  atMs
                });
              }
            }
            if (actionAdapter) {
              const settlement = actionAdapter.observeState(currentState);
              if (settlement) result.actions.settlement = settlement;
              const adapterState = actionAdapter.getState?.() || {};
              result.actions.movementStall = adapterState.movementStall || result.actions.movementStall;
              result.actions.lastMovementStall = adapterState.lastMovementStall || result.actions.lastMovementStall;
            }
            if (damagePlayerTracker && typeof damagePlayerTracker.observeDecision === 'function') {
              try {
                const damageObservation = damagePlayerTracker.observeDecision(currentState, result.decisions.last, {
                  atMs,
                  tick: currentState?.realtime?.tick,
                  source: 'realtime-frame'
                });
                if (damageObservation?.recorded && damageObservation.actor) {
                  const whitelist = options.dynamicWhitelist;
                  const damageDetail = {
                    atMs,
                    hpLost: damageObservation.event?.hpLost
                  };
                  const result = typeof whitelist?.observeDamage === 'function'
                    ? whitelist.observeDamage(damageObservation.actor, currentState, damageDetail)
                    : null;
                  if (result?.newlyDisabled) log('canary-dynamic-whitelist-disabled-after-damage', result);
                  else if (result?.deferred) log('canary-dynamic-whitelist-damage-deferred', result);
                }
              } catch (err) {
                log('canary-damage-player-observation-error', { error: errorMessage(err) });
              }
            }
            stageDurations['frame-observers'] = performance.now() - stageStarted;
            if (leavePending && !leavePending.settled) {
              leavePending.frameCount += 1;
              if (frame.decodedJson.type === 'pos') leavePending.realtimeFrameCount += 1;
              const hp = Number(currentSelf?.hp);
              if (Number.isFinite(hp)) {
                leavePending.lastHp = hp;
                leavePending.minHp = leavePending.minHp === null ? hp : Math.min(leavePending.minHp, hp);
              }
              stageStarted = performance.now();
              applyLeavePendingCover(currentState, atMs, { trigger: 'pending-frame' });
              stageDurations['leave-pending-cover'] = performance.now() - stageStarted;
              result.safety.leavePending = publicLeavePending(leavePending);
              logExit('leave-pending-frame', {
                frameType: frame.decodedJson.type,
                tick: currentState?.realtime?.tick ?? frame.decodedTick ?? null,
                pending: result.safety.leavePending
              });
              return;
            }
            maybePrewarmLeaveConnection(currentState, atMs, 'realtime-risk');
            if (deadlineAtMs && atMs >= deadlineAtMs) return;
            stageStarted = performance.now();
            // Pushed snapshot frames update fallback metadata and prime their
            // bounded observation cache after this callback. Combat authority
            // remains the high-frequency native pos stream, so running the
            // realtime controller here would rebuild the just-invalidated
            // snapshot observation before the deferred prime can execute.
            const snapshotFrame = frame.decodedJson.type === 'snapshot';
            const realtimeHandled = snapshotFrame
              ? realtimeControlActive
              : evaluateRealtimeControl(currentState, atMs, false, stageDurations);
            if (snapshotFrame) stageDurations['realtime-snapshot-deferred'] = performance.now() - stageStarted;
            if (!realtimeHandled && !plannerInFlight && (!lastDecisionAtMs || atMs - lastDecisionAtMs >= decisionIntervalMs)) {
              if (decisionWorker) {
                dispatchWorkerDecision(currentState, atMs);
              } else {
                const decision = decisionAdapter.decide(currentState, {
                  ...runtimeDefaults,
                  nowMs: atMs,
                  controlMode,
                  combatEnabled: config.combatEnabled
                });
                lastDecisionAtMs = atMs;
                publishFullDecision(decision, currentState, atMs);
              }
            }
            stageDurations['realtime-control-dispatch'] = performance.now() - stageStarted;
            if (assessRestartDrain(currentState, atMs)) return;
            stageStarted = performance.now();
            handleSafetyAssessment(safetyController.evaluate(currentState, {
              startedAtMs: noSelfGuardStartedAtMs(atMs),
              frameGapAlertMs,
              staleSelfMs: config.staleSelfMs,
              staleSelfConfirmMs: config.staleSelfConfirmMs,
              noSelfGraceMs: config.noSelfGraceMs,
              staminaExhaustedBelowMs: config.staminaExhaustedBelowMs,
              actionSettlementStall: result.actions.movementStall,
              lastDecision: result.decisions.last,
              wsOpen: isWsOpen(transport),
              wsError,
              wsClosed,
              nowMs: atMs
            }), { state: currentState, decision: result.decisions.last, atMs });
            stageDurations.safety = performance.now() - stageStarted;
          }
        } finally {
          const taskDurationMs = performance.now() - taskStarted;
          const entry = recordMainThreadTask(result.hotPath, 'ws-message', taskDurationMs, stageDurations, {
            frameType: frame?.decodedType || frame?.decodedJson?.type || '',
            tick: frame?.decodedTick ?? frame?.decodedJson?.tick ?? null,
            workProfile: mainThreadWorkProfile(taskCpuStarted, taskDurationMs),
            inputScale: {
              compressedBytes: frame?.payloadByteLength ?? frame?.byteLength ?? null,
              decodedBytes: frame?.decodedByteLength ?? null,
              entityCount: frame?.decodedSummary?.entityCount ?? null,
              bulletCount: frame?.decodedSummary?.bulletCount ?? null,
              coinCount: frame?.decodedSummary?.coinDropCount ?? null,
              realtime: lastRealtimeControlScale
            }
          });
          if (entry && entry.durationMs >= result.hotPath.budgetMs) {
            log('main-thread-budget-exceeded', entry);
          }
        }
      }
    });
    publishTransport(transport);
    if (!transportStartedAtMs) transportStartedAtMs = now();
    if (actionEnabled) {
      actionAdapter = options.actionAdapter || createBrowserlessActionAdapter({
        ...runtimeDefaults,
        transport,
        now,
        decisionIntervalMs: config.decisionIntervalMs,
        commandIntervalMs: config.movementCommandIntervalMs,
        velocityRepeatEnabled: true,
        shootRepeatEnabled: true,
        targetDeadZoneCm: config.movementTargetDeadZoneCm,
        settlementFrames: config.movementSettlementFrames,
        movementSettlementStallMs: config.movementSettlementStallMs,
        movementSettlementMinDistanceCm: config.movementSettlementMinDistanceCm,
        combatShootMinIntervalMs: config.combatShootMinIntervalMs,
        onVelocityRequest: request => stateStore.recordVelocityRequest(request),
        onShootRequest: request => stateStore.recordShootRequest(request)
      });
    }
    log('canary-ws-open', { durationMs });
    deadlineAtMs = now() + durationMs;
    while (now() < deadlineAtMs && !ending && (!result.safety.event || (leavePending && !leavePending.settled))) {
      const waitMs = Math.min(250, Math.max(0, deadlineAtMs - now()));
      if (waitMs > 0) await sleep(waitMs);
      const atMs = now();
      if (atMs >= deadlineAtMs) break;
      const frameGapMs = frameHealth.lastFrameAtMs ? atMs - frameHealth.lastFrameAtMs : null;
      const safetyEvent = safetyController.evaluate(stateStore.getState(atMs), {
        startedAtMs: noSelfGuardStartedAtMs(atMs),
        frameGapMs,
        frameGapAlertMs,
        staleSelfMs: config.staleSelfMs,
        staleSelfConfirmMs: config.staleSelfConfirmMs,
        noSelfGraceMs: config.noSelfGraceMs,
        staminaExhaustedBelowMs: config.staminaExhaustedBelowMs,
        actionSettlementStall: result.actions.movementStall,
        wsError,
        wsClosed,
        wsOpen: isWsOpen(transport),
        lastDecision: result.decisions.last,
        nowMs: atMs
      });
      handleSafetyAssessment(safetyEvent, {
        state: stateStore.getDecisionState?.(atMs) || stateStore.getState(atMs),
        decision: result.decisions.last,
        atMs
      });
      assessRestartDrain(stateStore.getDecisionState?.(atMs) || stateStore.getState(atMs), atMs);
    }
  } catch (err) {
    openFailedBeforeTransport = !transport;
    result.error = err?.message || String(err);
    log('canary-error', { error: result.error });
  }

  const authOpenFailure = /websocket unexpected response 403|http 403|not logged in/i.test(result.error || '');
  const shouldVerifyExitAfterOpenFailure = Boolean(
    openFailedBeforeTransport
      && result.snapshotSafety?.ok
      && config.userId
      && config.sessionToken
      && (!authOpenFailure || snapshotSafetySelfPresent(result.snapshotSafety))
  );

  if (transport || !result.error || shouldVerifyExitAfterOpenFailure) {
    try {
      if (result.safety.event) {
        if (result.safety.event.shouldLeave === false && actionAdapter) {
          updateActionResult(actionAdapter.stop(result.safety.event.reason || 'transport-recovery'));
        }
        if (leavePending?.promise) {
          result.safety.exit = await leavePending.promise;
          result.leave = result.safety.exit?.leave || null;
        } else {
          result.safety.exit = await executeSafetyExit(result.safety.event, config, {
            transport,
            allowStopMotion: actionEnabled,
            leaveWithVerification: options.leaveWithVerification,
            now,
            sleep
          });
          result.leave = result.safety.exit.leave;
        }
      } else {
        clearPublishedTransport(transport, 'leave-start');
        if (actionAdapter) updateActionResult(actionAdapter.stop('normal-complete'));
        if (shouldVerifyExitAfterOpenFailure) log('canary-open-failed-leave', { error: result.error });
        const leave = options.leaveWithVerification || leaveWithVerification;
        result.leave = await leave({
          gameOrigin: config.gameOrigin,
          userId: config.userId,
          sessionToken: config.sessionToken,
          localAddress: config.sourceIp,
          timeoutMs: config.httpTimeoutMs || 10000,
          retryMax: config.leaveRetryMax ?? 3,
          retryDelayMs: config.leaveRetryMs ?? 200,
          hedgeDelayMs: config.leaveHedgeMs ?? 1000
        });
      }
    } catch (err) {
      const message = errorMessage(err);
      result.leave = { ok: false, error: message, attempts: [] };
      if (result.safety.event) {
        result.safety.exit = {
          ok: false,
          event: result.safety.event,
          stopMotion: null,
          leave: result.leave,
          error: message
        };
      }
      const leaveFailure = safetyController.evaluate(null, {
        leaveResult: result.leave,
        nowMs: now()
      });
      if (!leaveFailure.ok) {
        result.safety.leaveFailure = leaveFailure;
        logSafety(leaveFailure);
      }
      if (!result.error) result.error = `leave failed: ${message}`;
      log('canary-leave-error', { error: message });
    }
  }

  if (result.safety.event && result.leave?.ok) {
    result.safety.event = attachConfirmedLeaveEvidence(
      result.safety.event,
      result.leave,
      result.safety.leavePending,
      { completedAtMs: now() }
    );
    if (result.safety.exit?.event) result.safety.exit.event = result.safety.event;
  }

  // Preserve the final pushed snapshot's kill/chat/tracker evidence before the
  // transport and background workers begin terminal cleanup. The queued
  // setImmediate callbacks become harmless no-ops after these synchronous
  // bounded flushes clear their pending payloads.
  flushSnapshotObserver();
  flushSnapshotObservationRefresh();

  try {
    ending = true;
    restoreDynamicWhitelistBattles('canary-finished');
    clearPublishedTransport(transport, 'canary-finish');
    if (transport && (transport.isOpen?.() || isWsOpen(transport.ws))) transport.close();
  } catch (_) {}

  const noFrames = Number(stats.decodedFrameCount || 0) <= 0;
  const noSelf = Number(stats.selfPresent.true || 0) <= 0;
  const frameGap = Number(frameHealth.maxFrameGapMs || 0) > frameGapAlertMs;
  const leaveFailed = !result.leave?.ok;
  if (!result.error && noFrames) result.error = 'no decoded frames received';
  if (!result.error && noSelf) result.error = 'self not observed in realtime frames';
  if (!result.error && frameGap) result.error = `frame gap exceeded ${frameGapAlertMs}ms`;
  if (leaveFailed && result.leave) {
    const leaveFailure = safetyController.evaluate(null, {
      leaveResult: result.leave,
      nowMs: now()
    });
    if (!leaveFailure.ok) {
      result.safety.leaveFailure = leaveFailure;
      logSafety(leaveFailure);
    }
  }
  if (!result.error && leaveFailed) result.error = 'leave not confirmed';
  if (typeof decisionAdapter.finalizeEasyKillEngagements === 'function') {
    decisionAdapter.finalizeEasyKillEngagements(
      result.safety.event?.reason || result.error || 'canary-complete-without-kill',
      { nowMs: now() }
    );
  }
  flushScheduledCombatPersistence();
  if (decisionWorker) {
    try {
      await decisionWorker.close();
    } catch (err) {
      log('canary-decision-worker-close-error', { error: errorMessage(err) });
    }
  }
  result.state = stateStore.getState(now());
  if (typeof decisionAdapter.getStatusSummary === 'function') {
    result.decisionState = decisionAdapter.getStatusSummary();
  }
  if (actionAdapter) {
    const adapterState = actionAdapter.getState();
    result.actions.sentCount = Number(adapterState.sentCount || 0);
    result.actions.velocitySentCount = Number(adapterState.velocitySentCount || 0);
    result.actions.velocityRepeatSentCount = Number(adapterState.velocityRepeatSentCount || 0);
    result.actions.shootSentCount = Number(adapterState.shootSentCount || 0);
    result.actions.shootRepeatSentCount = Number(adapterState.shootRepeatSentCount || 0);
    result.actions.stopCount = Number(adapterState.stopCount || 0);
    result.actions.skippedCount = Number(adapterState.skippedCount || 0);
    result.actions.settlement = adapterState.lastSettlement || result.actions.settlement;
    result.actions.movementStall = adapterState.movementStall || result.actions.movementStall;
    result.actions.lastMovementStall = adapterState.lastMovementStall || result.actions.lastMovementStall;
    result.actions.lastShootAck = adapterState.lastShootAck || result.actions.lastShootAck;
  }
  result.ok = Boolean(!result.error);
  if (result.ok && result.snapshotSafety?.bootstrapOnly && !result.state?.realtime?.self) {
    result.error = 'bootstrap login point was not observed';
    result.ok = false;
  }
  result.completedAt = new Date(now()).toISOString();
  log(result.ok ? 'canary-finish' : 'canary-failed', result);
  try {
    combatBattleLog?.flush?.('canary-finish');
  } catch (_) {}
  try {
    await logStore?.flush?.();
  } catch (_) {}
  return result;
}

module.exports = {
  applySingleBlockerLoginBypass,
  attachConfirmedLeaveEvidence,
  createCanaryRunId,
  frameDataToBuffer,
  inspectCanaryFrame,
  loginPointFromState,
  nextCombatControlTickCore,
  plannerResponseHasNewerPreemption,
  runPreLoginSnapshotSafety,
  runReadOnlyCanary
};
