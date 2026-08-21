'use strict';

const fs = require('fs');
const { performance } = require('perf_hooks');
const { parseGrzFrame, summarizeGrzJson } = require('../../shared/grz-frame');
const {
  buildSnapshotProbeUrl,
  fetchWithTimeout,
  readResponseBody,
  redactSecrets,
  summarizeSnapshotPayload
} = require('./session-client');
const { createFrameStats, updateFrameStats } = require('./frame-stats');
const { createBrowserlessStateStore } = require('./state-store');
const {
  isWebSocketConnectAbortError,
  isWsOpen,
  openBrowserlessWs
} = require('./ws-transport');
const { leaveWithVerification } = require('./leave-client');
const { createBrowserlessLeaveSupervisor } = require('./leave-supervisor');
const {
  buildBrowserlessRuntimeDefaults,
  createBrowserlessDecisionAdapter,
  summarizeBrowserlessDecision
} = require('./decision-adapter');
const {
  actionSettlementStallAssessment,
  createBrowserlessSafetyController,
  createSafetyEvent,
  executeSafetyExit
} = require('./safety-controller');
const {
  DEFAULT_TRANSPORT_SERVER_TICK_MS,
  createTransportHealthMonitor,
  realtimeTransportActivityAssessment
} = require('./transport-health');
const { createBrowserlessActionAdapter } = require('./action-adapter');
const { buildCombatAudit } = require('./combat-audit');
const { buildLeavePendingCover } = require('./leave-pending-control');
const {
  buildExitRecoveryOutcome,
  createExitAttemptId,
  normalizePendingExit,
  pendingExitIsExpired,
  pendingExitRecoveryEvent,
  pendingExitSnapshotResolution
} = require('./pending-exit-recovery');
const { createBrowserlessTargetWhitelist } = require('./target-whitelist');
const { REQUEST_CLASSES } = require('./request-rate-policy');
const { browserlessRuntimeRevision, browserlessRuntimeRevisionStatus } = require('./runtime-revision');
const { createBrowserlessDecisionWorker } = require('./decision-worker');
const { createBrowserlessRealtimeControlWorker } = require('./realtime-control-worker');
const {
  actionTargetKey,
  evaluateRestartReadiness,
  restartDrainAllowsDecision,
  restartDrainRetainsCommittedDecision
} = require('./restart-readiness');
const {
  MIN_SNAPSHOT_EDGE_INTERVAL_MS,
  utc8DayKey,
  waitForSnapshotEdge
} = require('./snapshot-edge-wait');
const {
  createCloudflareChallengeError,
  detectCloudflareChallenge
} = require('./cloudflare-challenge');

const DEFAULT_READONLY_PROBE_MS = 30000;
const DEFAULT_FRAME_GAP_ALERT_MS = 2000;
const DEFAULT_MAIN_THREAD_BUDGET_MS = 50;
const DEFAULT_REALTIME_CONTROL_WARMUP_ITERATIONS = 6;
const DEFAULT_REALTIME_CONTROL_WORKER_MAX_STALE_TICKS = 2;
const DEFAULT_REALTIME_CONTROL_WORKER_PERSISTENCE_INTERVAL_MS = 1000;
const DEFAULT_LOGIN_POINT_SINGLE_BLOCKER_BYPASS_MS = 60 * 60 * 1000;
const DEFAULT_LOGIN_POINT_FULL_HP = 100;
const LOGIN_POINT_SAFETY_HP_EXEMPTION_THRESHOLD = 80;
const DEFAULT_ACTION_SKIP_PUBLICATION_WINDOW_MS = 500;
const CREATOR_USER_ID = 28886;

function actionPublicationValue(value) {
  return value === null || value === undefined ? '' : String(value);
}

function actionPublicationTarget(action = {}) {
  const target = action.target || action.opportunisticShot || {};
  const id = target.userId
    ?? target.user_id
    ?? target.entityId
    ?? target.entity_id
    ?? target.key
    ?? target.id
    ?? target.dropId
    ?? target.drop_id;
  if (id !== null && id !== undefined && id !== '') {
    return { mode: 'id', type: target.type || 'target', id };
  }
  const x = Number(target.x);
  const y = Number(target.y);
  if (Number.isFinite(x) && Number.isFinite(y)) {
    return { mode: 'position', type: target.type || 'target', x: Math.round(x), y: Math.round(y) };
  }
  return { mode: 'empty' };
}

function actionPublicationValuesEqual(left, right) {
  if (left === right) return true;
  return actionPublicationValue(left) === actionPublicationValue(right);
}

function actionPublicationTargetMatches(action = {}, expected = null) {
  if (!expected) return false;
  const target = action.target || action.opportunisticShot || {};
  const id = target.userId
    ?? target.user_id
    ?? target.entityId
    ?? target.entity_id
    ?? target.key
    ?? target.id
    ?? target.dropId
    ?? target.drop_id;
  if (id !== null && id !== undefined && id !== '') {
    return expected.mode === 'id'
      && actionPublicationValuesEqual(target.type || 'target', expected.type)
      && actionPublicationValuesEqual(id, expected.id);
  }
  const x = Number(target.x);
  const y = Number(target.y);
  if (Number.isFinite(x) && Number.isFinite(y)) {
    return expected.mode === 'position'
      && actionPublicationValuesEqual(target.type || 'target', expected.type)
      && Math.round(x) === expected.x
      && Math.round(y) === expected.y;
  }
  return expected.mode === 'empty';
}

function actionPublicationCommand(command = null) {
  if (!command || typeof command !== 'object') return null;
  return {
    id: command.id,
    type: command.type,
    dx: command.dx,
    dy: command.dy,
    reason: command.reason,
    requestId: command.requestId,
    directionGeneration: command.directionGeneration
  };
}

function actionPublicationCommandMatches(command = null, expected = null) {
  const present = Boolean(command && typeof command === 'object');
  if (!present || !expected) return !present && !expected;
  return actionPublicationValuesEqual(command.id, expected.id)
    && actionPublicationValuesEqual(command.type, expected.type)
    && actionPublicationValuesEqual(command.dx, expected.dx)
    && actionPublicationValuesEqual(command.dy, expected.dy)
    && actionPublicationValuesEqual(command.reason, expected.reason)
    && actionPublicationValuesEqual(command.requestId, expected.requestId)
    && actionPublicationValuesEqual(command.directionGeneration, expected.directionGeneration);
}

function actionPublicationComponentFailed(component = null) {
  return Boolean(component && typeof component === 'object' && (
    component.ok === false
    || component.error
    || component.transportClosed === true
    || component.transportError
  ));
}

function actionSkippedPublicationIsCoalescible(actionResult = null, context = {}) {
  if (!actionResult || typeof actionResult !== 'object') return false;
  const decisionAction = context.decision?.action
    || context.summary?.action
    || context.decision
    || context.summary
    || {};
  const kind = String(actionResult.kind || decisionAction.kind || '');
  const reason = String(actionResult.reason || decisionAction.reason || '');
  const band = String(actionResult.band || decisionAction.band || context.decision?.band || context.summary?.band || '');
  const handledBy = String(actionResult.handledBy || '');
  if (actionResult.shouldLeave === true
    || band === 'exit'
    || band === 'safety'
    || handledBy === 'safety-controller'
    || handledBy === 'action-adapter-stop'
    || /(^|-)(?:leave|exit|safety)(?:-|$)/.test(kind)) return false;
  const command = actionResult.command || null;
  if (command?.type === 'velocity' && Number(command.dx || 0) === 0 && Number(command.dy || 0) === 0) return false;
  const movement = actionResult.movement && typeof actionResult.movement === 'object'
    ? actionResult.movement
    : null;
  const shoot = actionResult.shoot && typeof actionResult.shoot === 'object'
    ? actionResult.shoot
    : null;
  if (actionPublicationComponentFailed(actionResult)
    || actionPublicationComponentFailed(movement)
    || actionPublicationComponentFailed(shoot)) return false;
  const resultHasSkip = Object.prototype.hasOwnProperty.call(actionResult, 'skipped');
  const movementHasSkip = Boolean(movement && Object.prototype.hasOwnProperty.call(movement, 'skipped'));
  const shootHasSkip = Boolean(shoot && Object.prototype.hasOwnProperty.call(shoot, 'skipped'));
  if ((resultHasSkip && actionResult.skipped !== true)
    || (movementHasSkip && movement.skipped !== true)
    || (shootHasSkip && shoot.skipped !== true)) return false;
  return resultHasSkip || movementHasSkip || shootHasSkip;
}

function captureActionSkippedPublication(actionResult = null, context = {}) {
  const decisionAction = context.decision?.action
    || context.summary?.action
    || context.decision
    || context.summary
    || {};
  return {
    kind: String(actionResult.kind || decisionAction.kind || ''),
    reason: String(actionResult.reason || decisionAction.reason || ''),
    band: String(actionResult.band || decisionAction.band || context.decision?.band || context.summary?.band || ''),
    handledBy: String(actionResult.handledBy || ''),
    target: actionPublicationTarget(actionResult),
    command: actionPublicationCommand(actionResult.command),
    vectorDx: actionResult.vector?.dx,
    vectorDy: actionResult.vector?.dy,
    movementReason: actionResult.movement?.reason,
    movementCommand: actionPublicationCommand(actionResult.movement?.command),
    shootReason: actionResult.shoot?.reason,
    shootCommand: actionPublicationCommand(actionResult.shoot?.command),
    outstandingCommandId: actionResult.shoot?.outstanding?.commandId
  };
}

function actionSkippedPublicationMatches(actionResult = null, context = {}, expected = null) {
  if (!expected) return false;
  const decisionAction = context.decision?.action
    || context.summary?.action
    || context.decision
    || context.summary
    || {};
  return String(actionResult.kind || decisionAction.kind || '') === expected.kind
    && String(actionResult.reason || decisionAction.reason || '') === expected.reason
    && String(actionResult.band || decisionAction.band || context.decision?.band || context.summary?.band || '') === expected.band
    && String(actionResult.handledBy || '') === expected.handledBy
    && actionPublicationTargetMatches(actionResult, expected.target)
    && actionPublicationCommandMatches(actionResult.command, expected.command)
    && actionPublicationValuesEqual(actionResult.vector?.dx, expected.vectorDx)
    && actionPublicationValuesEqual(actionResult.vector?.dy, expected.vectorDy)
    && actionPublicationValuesEqual(actionResult.movement?.reason, expected.movementReason)
    && actionPublicationCommandMatches(actionResult.movement?.command, expected.movementCommand)
    && actionPublicationValuesEqual(actionResult.shoot?.reason, expected.shootReason)
    && actionPublicationCommandMatches(actionResult.shoot?.command, expected.shootCommand)
    && actionPublicationValuesEqual(actionResult.shoot?.outstanding?.commandId, expected.outstandingCommandId);
}

function createActionPublicationGate(options = {}) {
  const configuredWindowMs = Number(options.windowMs ?? DEFAULT_ACTION_SKIP_PUBLICATION_WINDOW_MS);
  const windowMs = Math.max(1, Number.isFinite(configuredWindowMs)
    ? configuredWindowMs
    : DEFAULT_ACTION_SKIP_PUBLICATION_WINDOW_MS);
  let lastCoalescibleAction = null;
  let lastPublishedAtMs = 0;
  const publicationStatus = {
    windowMs,
    publishedCount: 0,
    coalesciblePublishedCount: 0,
    immediatePublishedCount: 0,
    suppressedSkippedCount: 0,
    pendingSuppressedSkippedCount: 0
  };

  function evaluate(actionResult, context = {}, atMs = Date.now()) {
    const numericAtMs = Number(atMs);
    const publishedAtMs = Number.isFinite(numericAtMs) ? numericAtMs : Date.now();
    const coalescible = actionSkippedPublicationIsCoalescible(actionResult, context);
    const matchesLast = coalescible
      && actionSkippedPublicationMatches(actionResult, context, lastCoalescibleAction);
    const elapsedMs = publishedAtMs - lastPublishedAtMs;
    if (matchesLast
      && elapsedMs >= 0
      && elapsedMs < windowMs) {
      publicationStatus.suppressedSkippedCount += 1;
      publicationStatus.pendingSuppressedSkippedCount += 1;
      return {
        publish: false,
        reason: 'duplicate-skipped-within-window',
        windowMs,
        coalescedSkippedCount: 0,
        pendingSuppressedSkippedCount: publicationStatus.pendingSuppressedSkippedCount
      };
    }
    const coalescedSkippedCount = publicationStatus.pendingSuppressedSkippedCount;
    publicationStatus.pendingSuppressedSkippedCount = 0;
    publicationStatus.publishedCount += 1;
    let publicationReason = 'immediate';
    if (coalescible) {
      publicationReason = !lastCoalescibleAction
        ? 'first-skipped'
        : (matchesLast ? 'skipped-window-elapsed' : 'skipped-semantic-change');
      if (!matchesLast) lastCoalescibleAction = captureActionSkippedPublication(actionResult, context);
      publicationStatus.coalesciblePublishedCount += 1;
    } else {
      lastCoalescibleAction = null;
      publicationStatus.immediatePublishedCount += 1;
    }
    lastPublishedAtMs = publishedAtMs;
    return {
      publish: true,
      reason: publicationReason,
      windowMs,
      coalescedSkippedCount,
      pendingSuppressedSkippedCount: 0
    };
  }

  function status() {
    return publicationStatus;
  }

  return { evaluate, status };
}

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
  return {
    count: 0,
    totalMs: 0,
    maxMs: 0,
    overBudgetCount: 0,
    wallOverBudgetCount: 0,
    cpuCount: 0,
    totalCpuMs: 0,
    maxCpuMs: 0,
    meanCpuMs: 0,
    cpuOverBudgetCount: 0,
    cpuMissingCount: 0
  };
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
    budgetMetric: 'cpu-work',
    accepted: true,
    overBudget: false,
    tasks: {},
    stages: {},
    maxTask: null,
    maxCpuTask: null,
    violationCount: 0,
    wallViolationCount: 0,
    cpuMeasurementMissingCount: 0,
    lastViolation: null
  };
}

function recordMainThreadTask(stats, taskName, durationMs, stageDurations = {}, detail = {}) {
  if (!stats) return null;
  const name = String(taskName || 'task');
  const taskAggregate = stats.tasks[name] || (stats.tasks[name] = createTimingAggregate());
  const duration = recordTimingAggregate(
    taskAggregate,
    durationMs
  );
  const cpuWorkMs = Number(detail?.workProfile?.cpuWorkMs);
  const cpuMeasured = Number.isFinite(cpuWorkMs) && cpuWorkMs >= 0;
  if (cpuMeasured) {
    taskAggregate.cpuCount += 1;
    taskAggregate.totalCpuMs += cpuWorkMs;
    taskAggregate.maxCpuMs = Math.max(taskAggregate.maxCpuMs, cpuWorkMs);
    taskAggregate.meanCpuMs = taskAggregate.totalCpuMs / taskAggregate.cpuCount;
    if (cpuWorkMs >= stats.budgetMs) {
      taskAggregate.cpuOverBudgetCount += 1;
      taskAggregate.overBudgetCount += 1;
    }
  } else {
    taskAggregate.cpuMissingCount += 1;
    stats.cpuMeasurementMissingCount += 1;
  }
  for (const stage in (stageDurations || {})) {
    if (!Object.prototype.hasOwnProperty.call(stageDurations, stage)) continue;
    recordTimingAggregate(
      stats.stages[stage] || (stats.stages[stage] = createTimingAggregate()),
      stageDurations[stage]
    );
  }
  const wallOverBudget = duration >= stats.budgetMs;
  const cpuOverBudget = cpuMeasured && cpuWorkMs >= stats.budgetMs;
  if (wallOverBudget) {
    taskAggregate.wallOverBudgetCount += 1;
    stats.wallViolationCount += 1;
  }
  const newMaximum = !stats.maxTask || duration > Number(stats.maxTask.durationMs || 0);
  const newCpuMaximum = cpuMeasured
    && (!stats.maxCpuTask || cpuWorkMs > Number(stats.maxCpuTask.workProfile?.cpuWorkMs || 0));
  let entry = null;
  if (newMaximum || newCpuMaximum || wallOverBudget || cpuOverBudget) {
    const roundedStages = {};
    for (const stage in (stageDurations || {})) {
      if (!Object.prototype.hasOwnProperty.call(stageDurations, stage)) continue;
      roundedStages[stage] = Math.round(Number(stageDurations[stage] || 0) * 1000) / 1000;
    }
    entry = {
      task: name,
      durationMs: Math.round(duration * 1000) / 1000,
      stages: roundedStages,
      ...detail,
      budgetMs: stats.budgetMs,
      budgetMetric: stats.budgetMetric,
      cpuMeasured,
      cpuOverBudget,
      wallOverBudget
    };
    if (newMaximum) stats.maxTask = entry;
    if (newCpuMaximum) stats.maxCpuTask = entry;
  }
  if (cpuOverBudget) {
    stats.accepted = false;
    stats.overBudget = true;
    stats.violationCount += 1;
    stats.lastViolation = entry;
  }
  return wallOverBudget || cpuOverBudget ? entry : null;
}

function createLatestFrameScheduler(options = {}) {
  const processFrame = typeof options.processFrame === 'function' ? options.processFrame : () => {};
  const onError = typeof options.onError === 'function' ? options.onError : () => {};
  const maxPriorityQueue = Math.max(8, Number(options.maxPriorityQueue || 64));
  const schedule = typeof options.schedule === 'function' ? options.schedule : setImmediate;
  const cancelSchedule = typeof options.cancelSchedule === 'function' ? options.cancelSchedule : clearImmediate;
  const priority = [];
  let latestPos = null;
  let latestSnapshot = null;
  let scheduled = false;
  let scheduleHandle = null;
  let closed = false;
  let received = 0;
  let processed = 0;
  let coalescedPos = 0;
  let coalescedSnapshot = 0;
  let droppedPriority = 0;
  let maxQueueDepth = 0;

  function queueDepth() {
    return priority.length + (latestPos ? 1 : 0) + (latestSnapshot ? 1 : 0);
  }

  function takeNext() {
    if (priority.length) return priority.shift();
    if (latestPos) {
      const item = latestPos;
      latestPos = null;
      return item;
    }
    if (latestSnapshot) {
      const item = latestSnapshot;
      latestSnapshot = null;
      return item;
    }
    return null;
  }

  function processNext() {
    const item = takeNext();
    if (!item) return false;
    try {
      processFrame(item);
    } catch (error) {
      try { onError(error, item); } catch (_) {}
    }
    processed += 1;
    return true;
  }

  function scheduleDrain() {
    if (closed || scheduled || !queueDepth()) return;
    scheduled = true;
    scheduleHandle = schedule(() => {
      scheduled = false;
      scheduleHandle = null;
      processNext();
      scheduleDrain();
    });
  }

  function enqueue(item) {
    if (closed || !item) return false;
    received += 1;
    const type = String(item.frame?.decodedJson?.type || item.frame?.decodedType || '');
    if (type === 'pos') {
      if (latestPos) coalescedPos += 1;
      latestPos = item;
    } else if (type === 'snapshot') {
      if (latestSnapshot) coalescedSnapshot += 1;
      latestSnapshot = item;
    } else {
      priority.push(item);
      if (priority.length > maxPriorityQueue) {
        priority.shift();
        droppedPriority += 1;
      }
    }
    maxQueueDepth = Math.max(maxQueueDepth, queueDepth());
    scheduleDrain();
    return true;
  }

  function flush() {
    if (scheduled && scheduleHandle !== null) {
      try { cancelSchedule(scheduleHandle); } catch (_) {}
      scheduled = false;
      scheduleHandle = null;
    }
    while (processNext()) {}
    return status();
  }

  function close(closeOptions = {}) {
    if (closeOptions.flush !== false) flush();
    closed = true;
    if (scheduled && scheduleHandle !== null) {
      try { cancelSchedule(scheduleHandle); } catch (_) {}
    }
    scheduled = false;
    scheduleHandle = null;
    if (closeOptions.flush === false) {
      priority.length = 0;
      latestPos = null;
      latestSnapshot = null;
    }
    return status();
  }

  function status() {
    return {
      enabled: true,
      closed,
      received,
      processed,
      pending: queueDepth(),
      coalescedPos,
      coalescedSnapshot,
      droppedPriority,
      maxQueueDepth,
      maxPriorityQueue
    };
  }

  return { close, enqueue, flush, status };
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

function activeJoinAuditFromLeave(leave) {
  const attempts = Array.isArray(leave?.attempts) ? leave.attempts : [];
  const confirmed = attempts.slice().reverse().find(attempt => attempt?.ok && attempt?.response) || null;
  const response = confirmed?.response;
  if (!response || typeof response !== 'object' || Array.isArray(response)) return null;
  const countValue = Number(response.active_join_count ?? response.activeJoinCount);
  const count = Number.isFinite(countValue) ? Math.max(0, Math.round(countValue)) : null;
  const rawTicks = response.active_join_ticks ?? response.activeJoinTicks;
  const ticks = Array.isArray(rawTicks)
    ? rawTicks
        .map(value => Number(value))
        .filter(Number.isFinite)
        .map(value => Math.round(value))
        .slice(-64)
    : [];
  if (count === null && !ticks.length) return null;
  return {
    count,
    ticks,
    latestTick: ticks.length ? ticks[ticks.length - 1] : null
  };
}

function compareActiveJoinAudits(before, after) {
  if (!before || !after) return null;
  const beforeTicks = new Set(before.ticks || []);
  const addedTicks = (after.ticks || []).filter(tick => !beforeTicks.has(tick));
  const countDelta = before.count === null || after.count === null
    ? null
    : after.count - before.count;
  return {
    grew: Boolean((countDelta !== null && countDelta > 0) || addedTicks.length),
    countDelta,
    addedTicks: addedTicks.slice(-16),
    before,
    after
  };
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
  return null;
}

function canaryHasAuthoritativeInGameEvidence(canary) {
  return Boolean(
    snapshotSafetySelfPresent(canary?.snapshotSafety)
      || canary?.entry?.firstSelf
      || Number(canary?.stats?.selfPresent?.true || 0) > 0
  );
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

function highHpLoginPointSafetyExemption(state, checkedAtMs = Date.now()) {
  const loginPoint = loginPointFromState(state);
  const hp = Number(loginPoint?.hp);
  const recoveryRequiresSnapshot = Boolean(
    state?.runner?.pendingExit
      || state?.runner?.transportRecovery
      || state?.stats?.currentSession?.online === true
  );
  if (
    recoveryRequiresSnapshot
      || !loginPoint
      || !Number.isFinite(hp)
      || hp < LOGIN_POINT_SAFETY_HP_EXEMPTION_THRESHOLD
  ) {
    return null;
  }
  return {
    ok: true,
    reason: 'login-point-self-hp-exempt',
    bypassedPreLoginSafety: true,
    bypassKind: 'high-self-hp',
    required: 1,
    streak: 1,
    satisfied: true,
    checkedAt: new Date(checkedAtMs).toISOString(),
    loginPoint,
    point: loginPoint
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

async function fetchPreLoginSnapshot(config, deps = {}, requestDetail = {}) {
  let fetched;
  if (typeof deps.snapshotRequest === 'function') {
    fetched = await deps.snapshotRequest({
      requestClass: REQUEST_CLASSES.LOGIN,
      purpose: 'prelogin-safety',
      ...requestDetail
    });
  } else {
    // The production runner always supplies the unified scheduler. Keep this
    // direct transport path only for standalone canary compatibility tests.
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
      requestClass: REQUEST_CLASSES.LOGIN,
      challengePolicy: 'login-stop',
      method: 'GET',
      cache: 'no-store'
    });
    const body = await readResponseBody(response);
    fetched = {
      ok: Boolean(response.ok),
      status: response.status,
      response,
      body,
      payload: body.json,
      observedAtMs: typeof deps.now === 'function' ? deps.now() : Date.now(),
      url
    };
  }
  const response = fetched.response || {
    ok: fetched.ok !== false,
    status: fetched.status ?? (fetched.ok === false ? 500 : 200),
    statusText: fetched.statusText || '',
    headers: fetched.headers || { get: () => '' }
  };
  const body = fetched.body || {
    json: fetched.payload,
    text: fetched.text || ''
  };
  const url = String(fetched.url || '');
  const challenge = detectCloudflareChallenge({
    status: response.status,
    headers: response.headers,
    contentType: response.headers?.get?.('content-type') || '',
    body: body.text
  });
  if (challenge.detected) {
    throw createCloudflareChallengeError(challenge, {
      operation: 'login',
      source: 'prelogin-snapshot-response',
      sourceIp: config.sourceIp
    });
  }
  const observedAtMs = Number(fetched.observedAtMs || (typeof deps.now === 'function' ? deps.now() : Date.now()));
  if (body.json && typeof deps.onSnapshotPayload === 'function') {
    try {
      await deps.onSnapshotPayload(body.json, {
        source: 'prelogin-http',
        observedAtMs,
        receivedAtMs: observedAtMs,
        global: true,
        snapshotKind: 'http',
        snapshotPurpose: deps.snapshotPurpose || 'login-point-safety'
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
    url,
    requestSequence: fetched.requestSequence,
    startedAtMs: fetched.startedAtMs,
    waitMs: fetched.waitMs,
    reused: fetched.reused === true
  };
}

async function runSinglePreLoginSnapshotSafetyProbe(config, state, deps = {}, detail = {}) {
  const loginPoint = loginPointFromState(state);
  const hasLastProbeTick = detail.lastProbeTick !== undefined
    && detail.lastProbeTick !== null
    && Number.isFinite(Number(detail.lastProbeTick));
  const fetched = detail.fetched || await fetchPreLoginSnapshot(config, deps, {
    allowBurst: !hasLastProbeTick,
    reuseLatest: hasLastProbeTick,
    minTick: hasLastProbeTick ? Number(detail.lastProbeTick) : undefined
  });
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
    lowHpThreshold: config.loginPointSafetyLowHpThreshold ?? runtimeDefaults.loginPointSafetyLowHpThreshold,
    lowHpBaseRadius: config.loginPointSafetyLowHpBaseRadius ?? runtimeDefaults.loginPointSafetyLowHpBaseRadius,
    lowHpRadiusIncrement: config.loginPointSafetyLowHpRadiusIncrement ?? runtimeDefaults.loginPointSafetyLowHpRadiusIncrement,
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
  const snapshotPurpose = String(deps.snapshotPurpose || 'login-point-safety');
  const publishSnapshotSafety = value => {
    if (!value || typeof value !== 'object') return value;
    const decorated = {
      ...value,
      snapshotPurpose,
      loginGateApplied: snapshotPurpose === 'login-point-safety',
      carriedIntoSession: false
    };
    if (typeof deps.onSnapshotSafety === 'function') deps.onSnapshotSafety(decorated);
    return decorated;
  };
  const checkedAtMs = typeof deps.now === 'function' ? deps.now() : Date.now();
  const highHpExemption = highHpLoginPointSafetyExemption(state, checkedAtMs);
  if (highHpExemption) {
    return publishSnapshotSafety(highHpExemption);
  }
  if (config.snapshotEdgeEnabled === true) {
    const edge = await waitForSnapshotEdge({
      now: deps.now,
      sleep: deps.sleep,
      intervalMs: config.snapshotEdgeIntervalMs ?? MIN_SNAPSHOT_EDGE_INTERVAL_MS,
      maxWaitMs: config.snapshotEdgeMaxWaitMs ?? 60000,
      maxErrors: config.snapshotEdgeMaxErrors ?? 3,
      fetchSnapshot: async ({ requestCount, baseline } = {}) => fetchPreLoginSnapshot(config, deps, {
        allowBurst: requestCount === 0,
        reuseLatest: requestCount > 0,
        afterAtMs: baseline?.fetched?.observedAtMs,
        minTick: baseline?.version?.tick
      }),
      onProgress: progress => {
        if (typeof deps.onSnapshotEdge === 'function') deps.onSnapshotEdge(progress);
      }
    });
    if (!edge.ok) {
      const result = {
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
      return publishSnapshotSafety(result);
    }
    const evaluated = await runSinglePreLoginSnapshotSafetyProbe(config, state, deps, {
      required: 1,
      streak: 0,
      satisfied: false,
      fetched: edge.detected.fetched,
      edgeDetected: true
    });
    const result = {
      ...evaluated,
      required: 1,
      streak: evaluated.ok ? 1 : 0,
      satisfied: Boolean(evaluated.ok),
      attempt: 1,
      probeIntervalMs: Number(config.snapshotEdgeIntervalMs ?? MIN_SNAPSHOT_EDGE_INTERVAL_MS),
      edge: {
        requestCount: edge.requestCount,
        waitMs: edge.waitMs,
        baseline: edge.baseline.version,
        detected: edge.detected.version,
        safetyEvaluationCount: 1
      }
    };
    return publishSnapshotSafety(result);
  }
  const runtimeDefaults = buildBrowserlessRuntimeDefaults(config);
  const required = Math.max(0, Math.round(Number(
    config.loginPointSafetySuccessRequired
      ?? runtimeDefaults.loginPointSafetySuccessRequired
      ?? 3
  ) || 0));
  const effectiveRequired = Math.max(1, required);
  const intervalMs = effectiveRequired > 1
    ? Math.max(
      MIN_SNAPSHOT_EDGE_INTERVAL_MS,
      Number(
        config.loginPointSafetyProbeIntervalMs
          ?? runtimeDefaults.loginPointSafetyProbeIntervalMs
          ?? MIN_SNAPSHOT_EDGE_INTERVAL_MS
      ) || 0
    )
    : 0;
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
      last = publishSnapshotSafety(last);
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
      last = publishSnapshotSafety(last);
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
      last = publishSnapshotSafety(last);
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
      last = publishSnapshotSafety(last);
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
    last = publishSnapshotSafety(last);
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
  const normalized = normalizeFrameData(data);
  if (typeof normalized === 'string') {
    const frame = {
      kind: 'text',
      byteLength: Buffer.byteLength(normalized),
      sample: normalized.slice(0, 240),
      format: 'JSON',
      compression: 'none',
      decodedByteLength: Buffer.byteLength(normalized)
    };
    const timings = {};
    try {
      let started = performance.now();
      const json = JSON.parse(normalized);
      timings.jsonDecodeMs = performance.now() - started;
      frame.decodedJson = json;
      frame.decodedJsonKeys = json && typeof json === 'object' ? Object.keys(json).slice(0, 20) : [];
      frame.decodedType = typeof json?.type === 'string' ? json.type : '';
      if (Number.isFinite(Number(json?.tick))) frame.decodedTick = Number(json.tick);
      started = performance.now();
      frame.decodedSummary = summarizeGrzJson(json, options.userId);
      timings.summaryMs = performance.now() - started;
    } catch (err) {
      frame.jsonParseError = err?.message || String(err);
    }
    frame.decodeTimings = timings;
    return frame;
  }
  const buffer = frameDataToBuffer(data);
  if (!buffer) return { kind: 'text', sample: String(normalized || '').slice(0, 240) };
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
      sample: redactSecrets(frame.sample || ''),
      ...wsTracePayloadPatch(frame?.decodedJson, config)
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
  const decision = event.detail?.decision || event.detail?.lastDecision || event.decision || {};
  const triggerSelfHp = finiteNumber(
    decision.combat?.exit?.selfHp
      ?? decision.self?.hp
      ?? decision.action?.self?.hp
      ?? event.selfHp
      ?? leavePending?.startHp
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
  const stateStore = options.stateStore || createBrowserlessStateStore({
    userId: config.userId,
    now,
    reuseRealtimeFrameObjects: true
  });
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
  const targetWhitelistMaxEntries = Math.max(0, Math.round(Number(config.targetWhitelistMaxNames || 100)));
  const workerWhitelistMaxEntries = Math.max(1, targetWhitelistMaxEntries || 100);
  const legacyStaticWhitelistNames = targetWhitelistMaxEntries > 0
    ? genesisWhitelist.names.slice(0, targetWhitelistMaxEntries)
    : genesisWhitelist.names;
  const allStaticWhitelistUserIds = Array.from(new Set([
    ...creatorUserIds,
    ...genesisWhitelist.userIds
  ].map(Number).filter(Number.isFinite)));
  const staticWhitelistUserIds = targetWhitelistMaxEntries > 0
    ? allStaticWhitelistUserIds.slice(0, targetWhitelistMaxEntries)
    : allStaticWhitelistUserIds;
  const staticWhitelistNameSet = new Set(legacyStaticWhitelistNames);
  const staticWhitelistUserIdSet = new Set(staticWhitelistUserIds);
  try {
    options.onRemoteProfitWhitelist?.(staticWhitelistUserIds.slice(0, workerWhitelistMaxEntries));
  } catch (err) {
    log('canary-remote-profit-whitelist-callback-error', { error: errorMessage(err) });
  }
  const isCreatorTarget = target => {
    const userId = Number(target?.user_id ?? target?.userId ?? target?.target_user_id ?? target?.targetUserId);
    return Number.isFinite(userId) && creatorUserIdSet.has(userId);
  };
  const isStaticWhitelistTarget = target => (
    isCreatorTarget(target) || Boolean(genesisWhitelist.isWhitelistedTarget?.(target))
  );
  targetWhitelistSummary = {
    ...(targetWhitelistSummary || {}),
    semantic: 'creator-and-legacy-static',
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
    creatorUserIds,
    creatorUserIdSet,
    creatorCheck: isCreatorTarget,
    dynamicWhitelistMemberCheck: target => {
      if (typeof options.dynamicWhitelist?.isMember === 'function') {
        return Boolean(options.dynamicWhitelist.isMember(target));
      }
      return Boolean(options.dynamicWhitelist?.status?.().players?.some(item => (
        Number(item?.userId ?? item?.user_id) === Number(target?.userId ?? target?.user_id)
      )));
    },
    dynamicWhitelistEnabledCheck: target => Boolean(
      options.dynamicWhitelist?.isEnabled?.(target)
        ?? options.dynamicWhitelist?.isWhitelistedTarget?.(target)
    ),
    damagedSelfTodayCheck: target => Boolean(damagePlayerTracker?.hasUserId?.(target, now())),
    targetWhitelistNames: legacyStaticWhitelistNames,
    targetWhitelistNameSet: staticWhitelistNameSet,
    targetWhitelistUserIds: staticWhitelistUserIds,
    targetWhitelistUserIdSet: staticWhitelistUserIdSet,
    whitelistCheck: isStaticWhitelistTarget
  };
  const decisionAdapter = options.decisionAdapter || createBrowserlessDecisionAdapter(decisionAdapterOptions);
  const realtimeControlWarmup = options.useDecisionWorker || options.decisionWorker
    ? warmBrowserlessRealtimeControl(decisionAdapterOptions, options)
    : { ok: true, skipped: true, iterations: 0, durationMs: 0, maxIterationMs: 0 };
  const decisionWorker = options.decisionWorker || (options.useDecisionWorker
      ? createBrowserlessDecisionWorker({
        ...decisionAdapterOptions,
        targetWhitelistNames: legacyStaticWhitelistNames,
        targetWhitelistUserIds: staticWhitelistUserIds,
        creatorUserIds
      })
    : null);
  const realtimeControlWorker = options.realtimeControlWorker || (
    options.useRealtimeControlWorker === true && combatLiveEnabled
      ? createBrowserlessRealtimeControlWorker({
        ...decisionAdapterOptions,
        targetWhitelistNames: legacyStaticWhitelistNames,
        targetWhitelistUserIds: staticWhitelistUserIds,
        creatorUserIds
      })
      : null
  );
  const persistCombatLearning = atMs => {
    const realtimeState = realtimeControlWorkerPersistenceState || null;
    const decisionState = realtimeState
      ? {
          combatMetrics: realtimeState.combatMetrics || null,
          combatTarget: realtimeState.combatTarget || null,
          combatEngagements: realtimeState.combatEngagements || {},
          combatMetricsByTarget: realtimeState.combatMetricsByTarget || {},
          combatLearning: realtimeState.combatLearning || null
        }
      : (decisionAdapter.getCombatPersistenceState?.()
        || decisionAdapter.getState?.()
        || {});
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
  const transportHealthMonitor = options.transportHealthMonitor || createTransportHealthMonitor({
    serverTickMs: config.combatServerTickMs || DEFAULT_TRANSPORT_SERVER_TICK_MS,
    windowMs: config.transportHealthWindowMs,
    activeWarmupMs: config.transportHealthActiveWarmupMs,
    activeHoldMs: config.transportHealthActiveHoldMs,
    latencyDecisionWindowMs: config.transportLatencyDecisionWindowMs,
    latencyExitMs: config.transportLatencyExitMs,
    latencyExitSustainMs: config.transportLatencyExitSustainMs,
    frameLossExitRate: config.transportFrameLossExitRate,
    frameLossExitSustainMs: config.transportFrameLossExitSustainMs,
    frameLossMinimumExpectedTicks: config.transportFrameLossMinimumExpectedTicks
  });
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
  const persistedPendingExitValue = options.persistedState?.runner?.pendingExit || null;
  const pendingExitPersistenceOptions = {
    maximumAgeMs: options.pendingExitPersistMaxMs
  };
  const persistedPendingExit = normalizePendingExit(persistedPendingExitValue, startedAt, {
    maximumAgeMs: options.pendingExitPersistMaxMs
  });
  const expiredPendingExit = pendingExitIsExpired(persistedPendingExitValue, startedAt, pendingExitPersistenceOptions)
    ? normalizePendingExit(persistedPendingExitValue, startedAt, {
        ...pendingExitPersistenceOptions,
        allowExpired: true
      })
    : null;
  let exitRecoveryActive = Boolean(persistedPendingExit || expiredPendingExit);
  const persistedExitOutcomeLedger = Array.isArray(options.persistedState?.runner?.exitRecoveryOutcomes)
    ? options.persistedState.runner.exitRecoveryOutcomes
    : [];
  const emittedExitOutcomeIds = new Set(persistedExitOutcomeLedger
    .map(item => String(item?.exitAttemptId || ''))
    .filter(Boolean));
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
    transportHealth: transportHealthMonitor.snapshot(startedAt),
    hotPath: createMainThreadTimingStats(options.mainThreadBudgetMs || DEFAULT_MAIN_THREAD_BUDGET_MS),
    decisions: {
      intervalMs: decisionIntervalMs,
      evaluatedCount: 0,
      realtimeControlCount: 0,
      loggedCount: 0,
      last: null,
      worker: null,
      realtimeWorker: null,
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
      leaveSupervisor: null,
      leaveFailure: null,
      transportLifecycle: {
        generation: 0,
        phase: 'idle',
        pendingConnectCancel: null,
        terminalOpenBlocked: null,
        reassertLeave: null,
        confirmedLeaveActiveJoin: null,
        activeJoinAudit: null
      },
      frameGapSoftStops: [],
      lastFrameGapRecovery: null
    },
    actions: {
      enabled: actionEnabled,
      sentCount: 0,
      velocitySentCount: 0,
      velocityRepeatSentCount: 0,
      velocityLogicalRefreshCount: 0,
      velocityOwnershipSuppressedCount: 0,
      velocityRepeatSuppressedCount: 0,
      shootRepeatSuppressedCount: 0,
      shootSentCount: 0,
      shootAcceptedCount: 0,
      shootUnackedCount: 0,
      shootRepeatSentCount: 0,
      stopCount: 0,
      skippedCount: 0,
      publication: null,
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
      exitRecovery: Boolean(persistedPendingExit || expiredPendingExit),
      pendingExit: persistedPendingExit || expiredPendingExit,
      pendingExitResolution: persistedPendingExit ? 'pending-snapshot-check' : (expiredPendingExit ? 'pending-timeout' : 'inactive'),
      exitOutcomes: []
    },
    leave: null,
    targetWhitelist: targetWhitelistSummary,
    connectionFailure: null,
    error: ''
  };
  const actionPublicationGate = createActionPublicationGate();
  result.actions.publication = actionPublicationGate.status();
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
  let realtimeControlWorkerDisabled = false;
  let realtimeControlWorkerInFlight = false;
  let realtimeControlWorkerQueued = null;
  let realtimeControlWorkerPersistenceState = null;
  let realtimeControlWorkerStatusSummary = null;
  let realtimeControlWorkerLastPersistenceAtMs = 0;
  let realtimeControlWorkerContext = null;
  let realtimeControlWorkerContextAtMs = 0;
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
  let wsConnectGeneration = 0;
  let pendingWsConnect = null;
  let terminalBeforeWsActive = false;
  let postLeaveWsOpenViolation = null;
  let confirmedLeaveActiveJoinAudit = null;
  let leavePending = null;
  let exitAttemptSequence = 0;
  let leaveSupervisor = options.leaveSupervisor || null;
  let wsFrameScheduler = null;
  let pendingSnapshotObserver = null;
  let snapshotObserverScheduled = false;
  let pendingSnapshotObservationRefresh = null;
  let snapshotObservationRefreshScheduled = false;
  let lastTransportHealthPublishAtMs = 0;
  let lastTransportHealthLogAtMs = 0;
  let lastTransportHealthSignature = '';
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
    const state = realtimeDecisionState();
    const combatTargetKey = state.combatTarget?.id ? `player:${state.combatTarget.id}` : '';
    if (combatTargetKey && combatTargetKey !== status.commitmentKey) {
      decisionAdapter.patchState?.({ combatTarget: null, combatAim: null });
      if (realtimeControlWorker && !realtimeControlWorkerDisabled) {
        realtimeControlWorker.patchState?.({ combatTarget: null, combatAim: null });
      }
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
  const flushScheduledCombatPersistence = () => {
    if (!combatPersistenceScheduled && !combatPersistenceAtMs) return;
    const started = performance.now();
    const cpuStarted = startMainThreadCpuUsage();
    combatPersistenceScheduled = false;
    const atMs = combatPersistenceAtMs || now();
    combatPersistenceAtMs = 0;
    try {
      persistCombatLearning(atMs);
    } finally {
      const durationMs = performance.now() - started;
      const entry = recordMainThreadTask(
        result.hotPath,
        'combat-persistence-schedule',
        durationMs,
        {},
        { workProfile: mainThreadWorkProfile(cpuStarted, durationMs) }
      );
      logMainThreadTiming(entry);
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
  const logMainThreadTiming = entry => {
    if (!entry) return;
    if (entry.cpuOverBudget) {
      log('main-thread-budget-exceeded', entry);
    } else if (entry.wallOverBudget) {
      log('main-thread-wall-time-spike', entry);
    }
  };
  const logDecision = detail => {
    if (!logStore) return;
    const enriched = addRunMeta(detail);
    logStore.append('decisions', 'decision', enriched);
    const events = Array.isArray(enriched?.dropRaceEvents)
      ? enriched.dropRaceEvents
      : (enriched?.dropRace ? [enriched.dropRace] : []);
    for (const event of events) {
      if (event && typeof event === 'object') logStore.append('runner', 'drop-race', addRunMeta(event));
    }
  };
  const logSafety = detail => {
    if (logStore) logStore.append('exits', 'safety-event', addRunMeta(withExitAttemptId(detail)));
  };
  const exitAttemptIdForDetail = detail => String(
    detail?.exitAttemptId
      ?? detail?.pending?.exitAttemptId
      ?? leavePending?.exitAttemptId
      ?? persistedPendingExit?.exitAttemptId
      ?? expiredPendingExit?.exitAttemptId
      ?? ''
  );
  const withExitAttemptId = detail => {
    const base = detail && typeof detail === 'object' && !Array.isArray(detail)
      ? detail
      : { value: detail };
    const exitAttemptId = exitAttemptIdForDetail(base);
    return exitAttemptId && !base.exitAttemptId ? { ...base, exitAttemptId } : base;
  };
  const logExit = (type, detail) => {
    if (logStore) logStore.append('exits', type, addRunMeta(withExitAttemptId(detail)));
  };
  const emitExitRecoveryOutcome = outcome => {
    if (!outcome?.exitAttemptId) return false;
    const id = String(outcome.exitAttemptId);
    if (emittedExitOutcomeIds.has(id)) return false;
    emittedExitOutcomeIds.add(id);
    const normalized = {
      ...outcome,
      exitAttemptId: id,
      httpStatuses: Array.isArray(outcome.httpStatuses) ? outcome.httpStatuses.slice(-16) : [],
      reloginAllowed: outcome.reloginAllowed === true
    };
    result.recovery.exitOutcomes.push(normalized);
    result.recovery.exitOutcomes = result.recovery.exitOutcomes.slice(-8);
    result.recovery.lastExitOutcome = normalized;
    logExit('exit-recovery-outcome', normalized);
    return true;
  };
  const logDynamicWhitelistRestores = restored => {
    for (const item of restored || []) log('canary-dynamic-whitelist-restored-after-combat', item);
  };
  const observeDynamicWhitelistBattles = (currentState, atMs) => {
    const whitelist = options.dynamicWhitelist;
    if (typeof whitelist?.observeBattles !== 'function') return [];
    if (typeof whitelist.hasPendingBattleObservation === 'function'
      && !whitelist.hasPendingBattleObservation()) return [];
    const restored = whitelist.observeBattles(currentState, {
      atMs,
      disengageRangeCm: runtimeDefaults.combatDisengageRange,
      decisionState: realtimeDecisionState()
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
  const logAction = detail => {
    if (!logStore) return;
    detail.runId = runId;
    detail.runtimeRevision = runtimeRevision;
    detail.strategySchemaVersion = 2;
    detail.canaryMode = controlMode;
    detail.canaryStartedAt = result.startedAt;
    logStore.append('runner', 'movement-command', detail);
  };
  const logCombat = detail => {
    const type = combatLiveEnabled ? 'combat-live' : 'combat-dry-run';
    const root = detail?.combat && typeof detail.combat === 'object'
      ? detail
      : { combat: detail || {} };
    const combatDetail = {
      ...(root.combat || {}),
      combatAudit: root.combatAudit || buildCombatAudit(root)
    };
    const enriched = addRunMeta(combatDetail);
    // Combat frames are no longer appended to a single unbounded `combat.jsonl`.
    // Each engagement is written to its own per-battle file and compressed on
    // completion; idle/no-engagement diagnostic frames are discarded there.
    if (combatBattleLog) {
      try {
        combatBattleLog.record(type, enriched);
        const dropRaceEvents = Array.isArray(root.dropRaceEvents)
          ? root.dropRaceEvents
          : (root.dropRace ? [root.dropRace] : []);
        for (const event of dropRaceEvents) {
          combatBattleLog.recordDropRace?.(addRunMeta(event), { atMs: now() });
        }
      } catch (err) {
        log('combat-battle-log-error', { error: errorMessage(err) });
      }
    } else if (logStore) {
      // Fallback only when no battle-log is wired (self-tests / disabled IO).
      logStore.append('combat', type, enriched);
    }
  };
  const attachCombatAudit = summary => {
    if (!summary?.combat || typeof summary.combat !== 'object') return summary;
    return {
      ...summary,
      combatAudit: buildCombatAudit(summary)
    };
  };
  const logBattleTail = (type, detail, atMs = now()) => {
    if (!combatBattleLog?.recordTail) return null;
    try {
      return combatBattleLog.recordTail(type, addRunMeta(withExitAttemptId(detail)), { atMs });
    } catch (err) {
      log('combat-battle-tail-error', { type, error: errorMessage(err) });
      return null;
    }
  };
  stateStore.setShootExecutionListener?.(event => {
    const enriched = addRunMeta(event);
    let recorded = enriched;
    try {
      recorded = combatBattleLog?.recordShotExecution?.(enriched, { atMs: event.atMs }) || enriched;
    } catch (err) {
      log('combat-battle-log-error', { error: errorMessage(err) });
    }
    const { ack: _battleReplayAck, ...runnerEvent } = recorded;
    log('shoot-execution', runnerEvent);
  });
  const invokeVerifiedLeave = async leaveOptions => {
    if (typeof options.leaveWithVerification === 'function') {
      return options.leaveWithVerification(leaveOptions);
    }
    const fallback = typeof options.leaveWithVerificationFallback === 'function'
      ? options.leaveWithVerificationFallback
      : leaveWithVerification;
    if (!leaveSupervisor) return fallback(leaveOptions);
    try {
      const supervised = await leaveSupervisor.leave(leaveOptions, {
        onRequest: leaveOptions?.onRequest,
        onResult: leaveOptions?.onResult
      });
      if (supervised?.ok || typeof options.leaveWithVerificationFallback !== 'function') return supervised;
      logExit('leave-supervisor-unconfirmed-fallback', {
        attempts: Array.isArray(supervised?.attempts) ? supervised.attempts.length : 0,
        statuses: Array.isArray(supervised?.attempts)
          ? supervised.attempts.map(attempt => Number(attempt?.status || 0))
          : []
      });
      return fallback(leaveOptions);
    } catch (err) {
      logExit('leave-supervisor-fallback', { error: errorMessage(err) });
      return fallback(leaveOptions);
    }
  };
  const logWs = (type, detail) => {
    if (config.wsTraceEnabled && logStore) logStore.append('ws', type, addRunMeta(detail));
  };
  const updateTransportLifecycle = patch => {
    result.safety.transportLifecycle = {
      ...(result.safety.transportLifecycle || {}),
      ...(patch || {})
    };
    return result.safety.transportLifecycle;
  };
  const cancelPendingWsConnect = (reason = 'cancelled') => {
    const pending = pendingWsConnect;
    if (!pending || pending.phase !== 'connecting') {
      const detail = {
        attempted: false,
        aborted: false,
        generation: pending?.generation || null,
        reason: pending?.phase || 'not-pending'
      };
      updateTransportLifecycle({ pendingConnectCancel: detail });
      return detail;
    }
    pending.phase = 'cancelled';
    pending.cancelReason = reason;
    let abortError = '';
    try {
      if (!pending.controller.signal.aborted) pending.controller.abort(reason);
    } catch (err) {
      abortError = errorMessage(err);
    }
    const detail = {
      attempted: true,
      aborted: pending.controller.signal.aborted,
      generation: pending.generation,
      reason,
      error: abortError
    };
    updateTransportLifecycle({
      generation: pending.generation,
      phase: 'cancelled',
      pendingConnectCancel: detail
    });
    logWs('connect-abort', detail);
    return detail;
  };
  const transportHealthSignature = status => [
    status?.mode || '',
    status?.exit?.hostilePressure ? 1 : 0,
    status?.exit?.criticalLatencyBreached ? 1 : 0,
    status?.exit?.criticalLatencyTriggered ? 1 : 0,
    status?.latency?.critical?.profile || '',
    status?.latency?.critical?.p90ThresholdMs || 0,
    status?.latency?.critical?.currentThresholdMs || 0,
    status?.latency?.critical?.currentFrameStreak || 0,
    status?.exit?.latencyBreached ? 1 : 0,
    status?.exit?.latencyTriggered ? 1 : 0,
    status?.exit?.frameLossBreached ? 1 : 0,
    status?.exit?.frameLossTriggered ? 1 : 0
  ].join('|');
  const publishTransportHealth = (status, atMs, publishOptions = {}) => {
    if (!status) return null;
    const timestamp = Number(atMs || now());
    result.transportHealth = status;
    const signature = transportHealthSignature(status);
    const changed = signature !== lastTransportHealthSignature;
    const callbackDue = publishOptions.force === true
      || changed
      || timestamp - lastTransportHealthPublishAtMs >= 500;
    if (callbackDue && typeof options.onTransportHealth === 'function') {
      try {
        options.onTransportHealth(status);
        lastTransportHealthPublishAtMs = timestamp;
      } catch (err) {
        log('canary-transport-health-hook-error', { error: errorMessage(err) });
      }
    }
    const logDue = changed
      || status?.exit?.triggered
      || (status?.mode === 'active' && timestamp - lastTransportHealthLogAtMs >= 5000);
    if (logDue) {
      log('transport-health', status);
      lastTransportHealthLogAtMs = timestamp;
    }
    lastTransportHealthSignature = signature;
    return status;
  };
  const assessTransportHealth = (currentState, atMs) => {
    const context = {
      actionSettlementStall: result.actions.movementStall,
      lastDecision: result.decisions.last,
      nowMs: atMs
    };
    const activity = realtimeTransportActivityAssessment(currentState, context);
    transportHealthMonitor.updateActivity(activity, atMs);
    const pressure = actionSettlementStallAssessment(currentState, context, {
      movementSettlementFrames: config.movementSettlementFrames
    });
    return publishTransportHealth(transportHealthMonitor.assess({
      nowMs: atMs,
      hostilePressure: pressure.hostilePressure,
      combatActive: activity.combatControl,
      selfHp: currentState?.realtime?.self?.hp
    }), atMs);
  };
  publishTransportHealth(result.transportHealth, startedAt, { force: true });
  const recordDeferredMainThreadTask = (taskName, started, cpuStarted, stages = {}, detail = {}) => {
    const durationMs = performance.now() - started;
    const entry = recordMainThreadTask(result.hotPath, taskName, durationMs, stages, {
      workProfile: mainThreadWorkProfile(cpuStarted, durationMs),
      ...detail
    });
    logMainThreadTiming(entry);
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
        observedAtMs: pending.observedAtMs,
        receivedAtMs: pending.observedAtMs,
        global: false,
        snapshotKind: 'ws',
        snapshotPurpose: 'gameplay',
        auditRecorded: pending.auditRecorded === true
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
    let auditRecorded = false;
    if (typeof options.onSnapshotAuditPayload === 'function') {
      try {
        const auditResult = options.onSnapshotAuditPayload(payload, {
          source: 'ws',
          observedAtMs,
          receivedAtMs: observedAtMs,
          global: false,
          snapshotKind: 'ws',
          snapshotPurpose: 'gameplay'
        });
        auditRecorded = auditResult?.ok !== false;
      } catch (err) {
        log('canary-snapshot-audit-observer-error', { error: errorMessage(err) });
      }
    }
    if (typeof options.onSnapshotPayload === 'function') {
      pendingSnapshotObserver = { payload, observedAtMs, auditRecorded };
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
    const closedAtMs = now();
    publishTransportHealth(
      transportHealthMonitor.setConnected(false, closedAtMs),
      closedAtMs,
      { force: true }
    );
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
    const actionStages = context.outerStages || null;
    let actionStageStarted = performance.now();
    const markActionStage = name => {
      if (!actionStages) return;
      const completedAt = performance.now();
      actionStages[`realtime-action-${name}`] = completedAt - actionStageStarted;
      actionStageStarted = completedAt;
    };
    const atMs = Number(context.atMs || 0) || now();
    result.actions.last = actionResult;
    const publication = actionPublicationGate.evaluate(actionResult, context, atMs);
    markActionStage('publication-gate');
    if (!publication.publish) return;
    const adapterState = actionAdapter?.getPublicationState?.()
      || actionAdapter?.getState?.()
      || {};
    markActionStage('state-snapshot');
    result.actions.sentCount = Number(adapterState.sentCount || 0);
    result.actions.velocitySentCount = Number(adapterState.velocitySentCount || 0);
    result.actions.velocityRepeatSentCount = Number(adapterState.velocityRepeatSentCount || 0);
    result.actions.velocityLogicalRefreshCount = Number(adapterState.velocityLogicalRefreshCount || 0);
    result.actions.velocityOwnershipSuppressedCount = Number(adapterState.velocityOwnershipSuppressedCount || 0);
    result.actions.velocityRepeatSuppressedCount = Number(adapterState.velocityRepeatSuppressedCount || 0);
    result.actions.shootRepeatSuppressedCount = Number(adapterState.shootRepeatSuppressedCount || 0);
    result.actions.shootSentCount = Number(adapterState.shootSentCount || 0);
    result.actions.shootAcceptedCount = Number(adapterState.shootAcceptedCount || 0);
    result.actions.shootUnackedCount = Number(adapterState.shootUnackedCount || 0);
    result.actions.shootRepeatSentCount = Number(adapterState.shootRepeatSentCount || 0);
    result.actions.stopCount = Number(adapterState.stopCount || 0);
    result.actions.skippedCount = Number(adapterState.skippedCount || 0);
    result.actions.settlement = adapterState.lastSettlement || result.actions.settlement;
    result.actions.movementStall = adapterState.movementStall || result.actions.movementStall;
    result.actions.lastMovementStall = adapterState.lastMovementStall || result.actions.lastMovementStall;
    result.actions.lastShootAck = adapterState.lastShootAck || result.actions.lastShootAck;
    const publicationSummary = {
      reason: publication.reason,
      windowMs: publication.windowMs,
      coalescedSkippedCount: publication.coalescedSkippedCount,
      suppressedSkippedCount: result.actions.publication.suppressedSkippedCount
    };
    markActionStage('result-summary');
    logAction({ action: actionResult, state: adapterState, publication: publicationSummary });
    markActionStage('log');
    if (typeof options.onAction === 'function') {
      try {
        options.onAction(actionResult, {
          actionState: adapterState,
          decision: context.decision || null,
          summary: context.summary || null,
          atMs,
          publication: publicationSummary
        });
      } catch (err) {
        log('canary-action-status-error', { error: err?.message || String(err) });
      }
    }
    markActionStage('callback');
  };
  const compactLeavePendingCover = cover => {
    if (!cover) return null;
    const { threatField: _threatField, ...summary } = cover;
    return summary;
  };
  const publicLeavePending = pending => pending ? {
    active: Boolean(!pending.settled),
    exitAttemptId: String(pending.exitAttemptId || ''),
    recoveredFromExitAttemptId: String(pending.recoveredFromExitAttemptId || ''),
    originalReason: String(pending.originalReason || pending.event?.reason || ''),
    sourceRunId: String(pending.sourceRunId || runId || ''),
    firstAt: new Date(pending.firstAtMs || pending.startedAtMs).toISOString(),
    firstAtMs: pending.firstAtMs || pending.startedAtMs,
    startedAt: new Date(pending.startedAtMs).toISOString(),
    startedAtMs: pending.startedAtMs,
    eventAtMs: pending.eventAtMs,
    dispatchDelayMs: Math.max(0, pending.dispatchedAtMs - pending.eventAtMs),
    firstRequestAtMs: pending.firstRequestAtMs || 0,
    firstRequestDelayMs: pending.firstRequestAtMs
      ? Math.max(0, pending.firstRequestAtMs - pending.eventAtMs)
      : null,
    hedgeScheduledAtMs: pending.hedgeScheduledAtMs || 0,
    hedgeStartedAtMs: pending.hedgeStartedAtMs || 0,
    hedgeDispatchDriftMs: pending.hedgeDispatchDriftMs ?? null,
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
    httpStatuses: Array.isArray(pending.httpStatuses) ? pending.httpStatuses.slice(-16) : [],
    requestResultCount: Math.max(0, Number(pending.requestResultCount || 0)),
    reloginAllowed: false,
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
    const continuedPendingExit = detail.continuePendingExit === true
      ? normalizePendingExit(detail.pendingExit, atMs, {
          maximumAgeMs: Number.MAX_SAFE_INTEGER,
          allowExpired: true
        })
      : null;
    const selfHp = Number(currentState?.realtime?.self?.hp);
    const currentHp = Number.isFinite(selfHp) ? selfHp : null;
    const previousMinHp = Number(continuedPendingExit?.minHp);
    const previousLastHp = Number(continuedPendingExit?.lastHp);
    const eventAtMs = Date.parse(String(event.at || ''));
    leavePending = {
      exitAttemptId: continuedPendingExit?.exitAttemptId
        || createExitAttemptId(runId, atMs, exitAttemptSequence++),
      originalReason: String(continuedPendingExit?.originalReason || event.reason || 'unconfirmed-leave'),
      sourceRunId: String(continuedPendingExit?.sourceRunId || runId),
      event,
      triggerDecision: detail.decision || result.decisions.last,
      target: detail.decision?.action?.target || detail.decision?.combat?.target || null,
      targetId: String(detail.decision?.action?.target?.userId ?? detail.decision?.combat?.target?.userId ?? ''),
      firstAtMs: continuedPendingExit?.firstAtMs || atMs,
      startedAtMs: atMs,
      eventAtMs: Number.isFinite(eventAtMs) ? eventAtMs : atMs,
      dispatchedAtMs: now(),
      firstRequestAtMs: 0,
      hedgeScheduledAtMs: 0,
      hedgeStartedAtMs: 0,
      hedgeDispatchDriftMs: null,
      completedAtMs: 0,
      frameCount: 0,
      realtimeFrameCount: 0,
      coverRecomputeCount: 0,
      dynamicCoverCount: 0,
      directionChangeCount: 0,
      startHp: continuedPendingExit?.startHp ?? currentHp,
      lastHp: currentHp ?? (Number.isFinite(previousLastHp) ? previousLastHp : null),
      minHp: currentHp === null
        ? (Number.isFinite(previousMinHp) ? previousMinHp : null)
        : (Number.isFinite(previousMinHp) ? Math.min(previousMinHp, currentHp) : currentHp),
      httpStatuses: Array.isArray(continuedPendingExit?.httpStatuses)
        ? continuedPendingExit.httpStatuses.slice(-16)
        : [],
      requestResultCount: 0,
      recoveredFromExitAttemptId: String(
        continuedPendingExit?.recoveredFromExitAttemptId
          || detail.recoveredFromExitAttemptId
          || ''
      ),
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
      leaveWithVerification: invokeVerifiedLeave,
      now,
      sleep,
      onLeaveRequest: request => {
        const requestAtMs = Number(request?.startedAtMs || now());
        if (!leavePending.firstRequestAtMs || requestAtMs < leavePending.firstRequestAtMs) {
          leavePending.firstRequestAtMs = requestAtMs;
        }
        if (/^hedge-/.test(String(request?.stage || ''))) {
          leavePending.hedgeScheduledAtMs = Number(request?.scheduledAtMs || 0);
          leavePending.hedgeStartedAtMs = requestAtMs;
          leavePending.hedgeDispatchDriftMs = request?.dispatchDriftMs === null || request?.dispatchDriftMs === undefined
            ? null
            : Number(request.dispatchDriftMs || 0);
        }
        result.safety.leavePending = publicLeavePending(leavePending);
        const detail = {
          ...request,
          firstRequestDelayMs: result.safety.leavePending.firstRequestDelayMs
        };
        logExit('leave-request-start', detail);
        logBattleTail('leave-request-start', detail, requestAtMs);
      },
      onLeaveResult: attempt => {
        const status = Number(attempt?.status);
        if (Number.isFinite(status)) {
          leavePending.httpStatuses.push(Math.max(0, Math.round(status)));
          leavePending.httpStatuses = leavePending.httpStatuses.slice(-16);
        }
        leavePending.requestResultCount += 1;
        result.safety.leavePending = publicLeavePending(leavePending);
        const detail = { ...attempt, exitAttemptId: leavePending.exitAttemptId };
        logExit('leave-request-result', detail);
        logBattleTail('leave-request-result', detail, now());
      },
      onLeaveConfirmed: async leave => {
        // HTTP has already supplied terminal authority. Flip the gate before
        // flushing any queued frame so no ordinary decision can run after
        // confirmation, then cancel an unresolved handshake immediately.
        ending = true;
        const pendingConnectCancel = cancelPendingWsConnect('leave-confirmed');
        if (wsFrameScheduler) {
          wsFrameScheduler.flush();
          result.hotPath.frameScheduler = wsFrameScheduler.status();
        }
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
          transportClose,
          pendingConnectCancel
        });
        const confirmedAttempt = (leave?.attempts || []).find(attempt => attempt?.ok) || null;
        confirmedLeaveActiveJoinAudit = activeJoinAuditFromLeave(leave);
        if (confirmedLeaveActiveJoinAudit) {
          updateTransportLifecycle({
            confirmedLeaveActiveJoin: confirmedLeaveActiveJoinAudit
          });
        }
        logBattleTail('leave-confirmed', {
          ok: true,
          stage: confirmedAttempt?.stage || '',
          response: confirmedAttempt?.response || null
        }, now());
        return { ok: true, actionSeal, transportClose, pendingConnectCancel };
      }
    }).then(exit => {
      leavePending.settled = true;
      leavePending.ok = Boolean(exit?.ok);
      leavePending.completedAtMs = now();
      result.safety.exit = exit;
      result.leave = exit?.leave || null;
      result.safety.leavePending = publicLeavePending(leavePending);
      logExit('leave-pending-finish', result.safety.leavePending);
      logBattleTail('leave-pending-finish', { pending: result.safety.leavePending, ok: Boolean(exit?.ok) }, leavePending.completedAtMs);
      if (exit?.ok) {
        emitExitRecoveryOutcome(buildExitRecoveryOutcome(leavePending, {
          outcome: 'confirmed-absent',
          authority: 'HTTP',
          completedAtMs: leavePending.completedAtMs,
          // Result callbacks already recorded every attempt in the pending
          // chain. Fall back to the terminal response only for adapters that
          // cannot emit those callbacks, preserving the actual sequence.
          httpStatuses: Number(leavePending.requestResultCount || 0) > 0
            ? []
            : [
                ...(Array.isArray(exit?.leave?.attempts) ? exit.leave.attempts.map(item => item?.status) : []),
                ...(Array.isArray(exit?.attempts) ? exit.attempts.map(item => item?.status) : [])
              ],
          lastHp: leavePending.lastHp,
          minHp: leavePending.minHp
        }));
      }
      return exit;
    }).catch(err => {
      leavePending.settled = true;
      leavePending.ok = false;
      leavePending.error = errorMessage(err);
      leavePending.completedAtMs = now();
      result.safety.leavePending = publicLeavePending(leavePending);
      logExit('leave-pending-finish', result.safety.leavePending);
      logBattleTail('leave-pending-finish', { pending: result.safety.leavePending, ok: false, error: leavePending.error }, leavePending.completedAtMs);
      throw err;
    });
    return leavePending;
  };
  const recordSafetyEvent = (event, context = {}) => {
    if (!event || event.ok || result.safety.event) return false;
    const atMs = Number(context.atMs || now());
    const currentState = context.state || stateStore.getDecisionState?.(atMs) || stateStore.getState(atMs);
    const currentDecision = context.decision || result.decisions.last;
    const shootStop = event.shouldLeave && actionAdapter?.sealShooting
      ? actionAdapter.sealShooting(`safety-trigger:${event.reason || 'leave'}`, {
          observedTick: currentState?.realtime?.tick,
          engagementGeneration: currentDecision?.combat?.metrics?.engagementGeneration,
          target: currentDecision?.action?.target || currentDecision?.combat?.target || null,
          baseCadenceMs: currentDecision?.combat?.shooting?.cadenceMs,
          executionCadenceMs: currentDecision?.combat?.shooting?.executionCadenceMs,
          advisoryCadenceMs: currentDecision?.combat?.shooting?.advisoryCadenceMs,
          advisoryReasons: currentDecision?.combat?.shooting?.advisoryCadenceReasons
        })
      : null;
    let leaveStarted = false;
    const lockAndStartLeave = cover => {
      if (leaveStarted) return;
      leaveStarted = true;
      result.safety.event = event;
      result.error = event.reason;
      logBattleTail('safety-trigger', {
        reason: event.reason,
        atMs,
        tick: currentState?.realtime?.tick ?? null,
        selfHp: Number.isFinite(Number(currentState?.realtime?.self?.hp))
          ? Number(currentState.realtime.self.hp)
          : null,
        target: context.decision?.action?.target || context.decision?.combat?.target || null,
        cover,
        shootStop
      }, atMs);
      startLeavePending(event, currentState, atMs, {
        decision: context.decision || result.decisions.last,
        cover,
        pendingExit: event?.detail?.pendingExit || null,
        continuePendingExit: event?.detail?.continuePendingExit === true,
        recoveredFromExitAttemptId: event?.detail?.continuePendingExit === true
          ? ''
          : (event?.detail?.pendingExit?.exitAttemptId || '')
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
  const buildDecisionWorkerContext = (currentState, atMs, contextOptions = {}) => {
    let easyKillStatus = null;
    let damageStatus = null;
    let dynamicWhitelistStatus = null;
    try {
      easyKillStatus = options.easyKillPlayerTracker?.status?.(atMs) || null;
    } catch (_) {}
    try {
      damageStatus = options.damagePlayerTracker?.status?.(atMs) || null;
    } catch (_) {}
    try {
      dynamicWhitelistStatus = options.dynamicWhitelist?.status?.() || null;
    } catch (_) {}
    const dynamicMemberUserIds = (
      dynamicWhitelistStatus?.memberUserIds
      || (dynamicWhitelistStatus?.players || []).map(item => item?.userId ?? item?.user_id)
    ).map(Number).filter(Number.isFinite).slice(0, workerWhitelistMaxEntries);
    const dynamicEnabledUserIds = (dynamicWhitelistStatus?.userIds || [])
      .map(Number)
      .filter(Number.isFinite)
      .slice(0, workerWhitelistMaxEntries);
    return {
      easyKillStatus,
      damageStatus,
      remoteProfitBatch: contextOptions.includeRemoteProfit === true && typeof options.getRemoteProfitContext === 'function'
        ? options.getRemoteProfitContext(atMs)
        : (contextOptions.includeRemoteProfit === true ? (options.remoteProfitBatch || null) : null),
      dynamicWhitelistStatus: {
        memberUserIds: dynamicMemberUserIds,
        userIds: dynamicEnabledUserIds
      },
      combatCompletionByUserId: completionContext(currentState, atMs)
    };
  };
  const buildRealtimeControlWorkerContext = (currentState, atMs) => {
    // Tracker snapshots are much cheaper and safer to reuse for a few
    // realtime frames than to rebuild on every 20Hz message. Combat target,
    // bullets, coordinates, and HP still come from the current frame sent to
    // the worker; only auxiliary tracker metadata is bounded to 250ms.
    if (realtimeControlWorkerContext
      && Number(atMs) - realtimeControlWorkerContextAtMs <= 250) {
      return realtimeControlWorkerContext;
    }
    realtimeControlWorkerContext = buildDecisionWorkerContext(currentState, atMs, { includeRemoteProfit: false });
    realtimeControlWorkerContextAtMs = Number(atMs) || now();
    return realtimeControlWorkerContext;
  };
  const realtimePersistenceState = () => (
    realtimeControlWorkerPersistenceState
      || decisionAdapter.getRealtimePersistenceState?.()
      || null
  );
  const realtimeDecisionState = () => {
    const base = decisionAdapter.getState?.() || {};
    const current = realtimeControlWorkerPersistenceState;
    return current && typeof current === 'object' ? { ...base, ...current } : base;
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
    const actionStages = detail.outerStages || null;
    let actionStageStarted = performance.now();
    const markActionStage = name => {
      if (!actionStages) return;
      const completedAt = performance.now();
      actionStages[`realtime-action-${name}`] = completedAt - actionStageStarted;
      actionStageStarted = completedAt;
    };
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
    markActionStage('adapter');
    updateActionResult(actionResult, { decision, summary, atMs, outerStages: actionStages });
    actionStageStarted = performance.now();
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
    if (realtimeControlWorker && !realtimeControlWorkerDisabled) {
      realtimeControlWorker.observeActionResult?.(actionResult, decision, { nowMs: atMs });
    }
    markActionStage('observe-result');
    if (detail.notifyDecisionWorker) {
      decisionWorker?.observeActionResult?.(actionResult, decision, { nowMs: atMs });
    }
    return actionResult;
  };
  const publishFullDecision = (decision, currentState, atMs, detail = {}) => {
    const outerStages = detail.outerStages || null;
    let fullStageStarted = performance.now();
    const markFullStage = name => {
      if (!outerStages) return;
      const completedAt = performance.now();
      outerStages[`full-decision-${name}`] = completedAt - fullStageStarted;
      fullStageStarted = completedAt;
    };
    const appliedDecision = applyRestartDrainDecisionGate(decision);
    markFullStage('restart-gate');
    try {
      options.onRemoteProfitDecision?.(appliedDecision, atMs);
    } catch (err) {
      log('canary-remote-profit-decision-callback-error', { error: errorMessage(err) });
    }
    markFullStage('remote-profit');
    const summary = attachCombatAudit(summarizeBrowserlessDecision(appliedDecision));
    markFullStage('summary-audit');
    result.decisions.evaluatedCount += 1;
    result.decisions.last = summary;
    scheduleCombatPersistence(atMs);
    markFullStage('persistence');
    observeDynamicWhitelistBattles(currentState, atMs);
    markFullStage('whitelist');
    logDecision(summary);
    result.decisions.loggedCount += 1;
    if (controlMode === 'combat-dry-run' || controlMode === 'combat-live' || combatLiveEnabled) {
      logCombat(summary);
    }
    markFullStage('logs');
    if (typeof options.onDecision === 'function') {
      try {
        options.onDecision(summary, { state: currentState, decision, worker: detail.worker || null });
      } catch (err) {
        log('canary-decision-status-error', { error: err?.message || String(err) });
      }
    }
    markFullStage('status');
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
    markFullStage('safety-evaluate');
    if (handleSafetyAssessment(decisionSafetyEvent, { state: currentState, decision: summary, atMs })) return summary;
    markFullStage('safety-handle');
    applyDecisionAction(currentState, summary, appliedDecision, atMs, {
      notifyDecisionWorker: detail.notifyDecisionWorker,
      errorReason: 'action-apply-failed',
      outerStages
    });
    markFullStage('action');
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
    // High-frequency combat control must finish the realtime decision and
    // action path before updating the diagnostic/live-state projection. The
    // projection is observability state and does not affect aim, fire, move,
    // or exit arbitration for this frame.
    lastCombatControlStatusKey = key;
    lastCombatControlStatusAtMs = atMs;
    const publish = () => {
      try {
        options.onCombatControl(summary, { state: currentState, control });
      } catch (err) {
        log('canary-combat-status-error', { error: errorMessage(err) });
      }
    };
    try {
      if (options.deferCombatControlStatus === true) setImmediate(publish);
      else publish();
    } catch (err) {
      log('canary-combat-status-schedule-error', { error: errorMessage(err) });
    }
  };
  const publishRealtimeControl = (control, currentState, atMs, outerStages = null) => {
    let publishStageStarted = performance.now();
    const markPublishStage = name => {
      if (!outerStages) return;
      const completedAt = performance.now();
      outerStages[`realtime-publish-${name}`] = completedAt - publishStageStarted;
      publishStageStarted = completedAt;
    };
    control = control || {};
    const action = control.action || null;
    if (!action) {
      if (!realtimeControlActive) return false;
      realtimeControlActive = false;
      realtimeFinalActionPreemptionActive = false;
      lastDecisionAtMs = 0;
      const drainStatus = restartDrain?.status?.() || null;
      if (restartDrainRetainsCommittedDecision(result.decisions.last, drainStatus || {})) {
        observeDynamicWhitelistBattles(currentState, atMs);
        return false;
      }
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
      markPublishStage('release-summary');
      observeDynamicWhitelistBattles(currentState, atMs);
      markPublishStage('release-whitelist');
      publishCombatControlStatus(release, currentState, control, atMs, true);
      markPublishStage('release-status');
      applyDecisionAction(currentState, release, control, atMs, {
        errorReason: 'realtime-control-release-failed',
        outerStages
      });
      markPublishStage('release-action');
      return true;
    }
    control = applyRestartDrainDecisionGate(control);
    const gatedAction = control?.action || null;
    if (!realtimeFinalActionPreemptionActive
      && ['exit', 'safety', 'combat', 'recover'].includes(String(gatedAction?.band || ''))) {
      decisionAdapter.noteRealtimeFinalActionPreemption?.(gatedAction, atMs);
      if (realtimeControlWorker && !realtimeControlWorkerDisabled) {
        realtimeControlWorker.noteRealtimeFinalActionPreemption?.(gatedAction, atMs);
      }
      realtimeFinalActionPreemptionActive = true;
    }
    realtimeControlActive = true;
    const combatSummary = {
      ...(control.combat || {}),
      decisionIntervalMs,
      combatControlIntervalMs,
      highFrequencyControl: true
    };
    const summary = attachCombatAudit({
      kind: gatedAction?.kind || control.kind || '',
      band: gatedAction?.band || control.band || '',
      reason: gatedAction?.reason || control.reason || '',
      at: control.at || new Date(atMs).toISOString(),
      tick: control.tick ?? currentState?.realtime?.tick ?? null,
      action: gatedAction,
      dropRace: control.dropRace || control.input?.dropRace || null,
      dropRaceEvents: Array.isArray(control.dropRaceEvents)
        ? control.dropRaceEvents
        : (control.dropRace || control.input?.dropRace ? [control.dropRace || control.input.dropRace] : []),
      combat: combatSummary,
      input: control.input || null
    });
    markPublishStage('summary');
    result.decisions.realtimeControlCount += 1;
    result.decisions.last = summary;
    scheduleCombatPersistence(atMs);
    markPublishStage('persistence');
    observeDynamicWhitelistBattles(currentState, atMs);
    markPublishStage('whitelist');
    logCombat(summary);
    markPublishStage('combat-log');
    const key = realtimeControlKey(summary);
    if (key !== lastRealtimeControlKey || atMs - lastRealtimeControlLogAtMs >= decisionIntervalMs) {
      logDecision(summary);
      result.decisions.loggedCount += 1;
      lastRealtimeControlKey = key;
      lastRealtimeControlLogAtMs = atMs;
    }
    markPublishStage('decision-log');
    publishCombatControlStatus(summary, currentState, control, atMs);
    markPublishStage('status');
    const immediate = safetyController.evaluate(currentState, {
      startedAtMs: noSelfGuardStartedAtMs(atMs),
      decision: summary,
      nowMs: atMs
    });
    markPublishStage('safety-evaluate');
    if (handleSafetyAssessment(immediate, { state: currentState, decision: summary, atMs })) return true;
    markPublishStage('safety-handle');
    applyDecisionAction(currentState, summary, control, atMs, {
      errorReason: 'realtime-control-apply-failed',
      outerStages
    });
    markPublishStage('action');
    return true;
  };
  const realtimeControlWorkerMaxAgeMs = Math.max(
    combatControlIntervalMs * 3,
    Number(options.realtimeControlWorkerMaxAgeMs ?? DEFAULT_REALTIME_CONTROL_WORKER_MAX_STALE_TICKS * combatServerTickMs)
  );
  const realtimeControlWorkerPersistenceIntervalMs = Math.max(
    250,
    Number(options.realtimeControlWorkerPersistenceIntervalMs
      ?? DEFAULT_REALTIME_CONTROL_WORKER_PERSISTENCE_INTERVAL_MS)
  );
  const finishRealtimeControlWorkerRequest = (request, workerResult, workerError = null) => {
    const taskStarted = performance.now();
    const taskCpuStarted = startMainThreadCpuUsage();
    const stages = {};
    const queued = realtimeControlWorkerQueued;
    realtimeControlWorkerQueued = null;
    try {
      const responseAtMs = now();
      const latestState = stateStore.getDecisionState?.(responseAtMs) || stateStore.getState(responseAtMs);
      const requestAgeMs = Math.max(0, responseAtMs - Number(request.atMs || responseAtMs));
      stages['worker-response-state'] = performance.now() - taskStarted;
      if (workerResult?.persistenceState) {
        realtimeControlWorkerPersistenceState = workerResult.persistenceState;
        realtimeControlWorkerStatusSummary = workerResult.statusSummary || realtimeControlWorkerStatusSummary;
        realtimeControlWorkerLastPersistenceAtMs = responseAtMs;
      }
      if (workerError) {
        realtimeControlWorkerDisabled = true;
        log('canary-realtime-control-worker-failed', { error: errorMessage(workerError) });
        stages['worker-error'] = performance.now() - taskStarted;
        // Safety has priority over keeping the worker enabled. Fall back to
        // the existing synchronous path if the auxiliary worker disappears.
        if (realtimeControlWorkerPersistenceState) {
          decisionAdapter.patchState?.(realtimeControlWorkerPersistenceState);
        }
        let realtimeStages = null;
        const fallbackControl = decisionAdapter.evaluateRealtime?.(request.state, {
          nowMs: responseAtMs,
          controlMode,
          combatEnabled: config.combatEnabled,
          onRealtimeStageTimings: (timings, scale) => {
            realtimeStages = timings;
            lastRealtimeControlScale = scale || null;
          }
        }) || decisionAdapter.evaluateCombat?.(request.state, {
          nowMs: responseAtMs,
          controlMode,
          combatEnabled: config.combatEnabled
        });
        if (realtimeStages) {
          for (const [name, durationMs] of Object.entries(realtimeStages)) stages[`realtime-${name}`] = durationMs;
        }
        stages['worker-fallback-evaluate'] = performance.now() - taskStarted;
        publishRealtimeControl(fallbackControl || {}, latestState, responseAtMs, stages);
      } else if (ending || result.safety.event) {
        stages['worker-result-ignored'] = performance.now() - taskStarted;
      } else if (requestAgeMs > realtimeControlWorkerMaxAgeMs) {
        log('canary-realtime-control-worker-stale', {
          requestAtMs: request.atMs,
          responseAtMs,
          requestAgeMs,
          maxAgeMs: realtimeControlWorkerMaxAgeMs,
          requestTick: request.inputTick,
          latestTick: latestState?.realtime?.tick ?? null
        });
        stages['worker-stale'] = performance.now() - taskStarted;
      } else {
        applyDecisionWorkerEffects(workerResult?.effects || []);
        lastRealtimeControlScale = workerResult?.inputScale || lastRealtimeControlScale;
        result.decisions.realtimeWorker = {
          computeMs: Math.round(Number(workerResult.computeMs || 0) * 1000) / 1000,
          postMs: Math.round(Number(workerResult.postMs || 0) * 1000) / 1000,
          roundTripMs: Math.round(Number(workerResult.roundTripMs || 0) * 1000) / 1000,
          requestAtMs: request.atMs,
          responseAtMs,
          requestTick: request.inputTick,
          responseTick: workerResult.tick ?? null,
          requestAgeMs,
          stageTimings: workerResult.stageTimings || null
        };
        const previousProcessedTick = request.previousProcessedTick;
        const control = workerResult.control || {};
        const tickDelta = request.inputTick !== null && previousProcessedTick !== null
          ? Math.max(0, request.inputTick - previousProcessedTick)
          : null;
        if (control.combat && typeof control.combat === 'object') {
          control.combat.controlSchedule = {
            inputTick: request.inputTick,
            tickDelta,
            configuredIntervalMs: combatControlIntervalMs,
            minimumTickStride: combatControlMinimumTickStride,
            previousCompleteMs: result.decisions.realtimeControlSchedule.lastCompleteMs,
            skippedTicks: result.decisions.realtimeControlSchedule.skippedTicks
          };
        }
        stages['worker-control'] = performance.now() - taskStarted;
        if (!(control?.action?.kind === 'wait' && !realtimeControlActive)) {
          const publishStarted = performance.now();
          publishRealtimeControl(control, latestState, responseAtMs, stages);
          stages['realtime-publish'] = performance.now() - publishStarted;
        }
      }
      const completeMs = Math.max(
        0,
        Number(workerResult?.roundTripMs || 0) || performance.now() - taskStarted
      );
      nextCombatControlTick = nextCombatControlTickCore(request.inputTick, completeMs, {
        tickMs: combatServerTickMs,
        intervalMs: combatControlIntervalMs
      });
      const schedule = result.decisions.realtimeControlSchedule;
      result.decisions.realtimeControlSchedule = {
        ...schedule,
        lastProcessedTick: request.inputTick,
        lastTickDelta: request.inputTick !== null && schedule.lastProcessedTick !== null
          ? Math.max(0, request.inputTick - Number(schedule.lastProcessedTick))
          : null,
        nextEligibleTick: nextCombatControlTick,
        lastCompleteMs: completeMs,
        maxCompleteMs: Math.max(Number(schedule.maxCompleteMs || 0), completeMs)
      };
    } catch (error) {
      log('canary-realtime-control-worker-response-error', { error: errorMessage(error) });
    } finally {
      const taskDurationMs = performance.now() - taskStarted;
      const entry = recordMainThreadTask(
        result.hotPath,
        'realtime-control-worker-response',
        taskDurationMs,
        stages,
        {
          tick: request.inputTick,
          workProfile: mainThreadWorkProfile(taskCpuStarted, taskDurationMs),
          responseScale: workerResult?.responseScale || null
        }
      );
      logMainThreadTiming(entry);
    }
    if (queued && !ending && !result.safety.event) {
      setImmediate(() => evaluateRealtimeControl(queued.state, queued.atMs, queued.force));
    }
  };
  const evaluateRealtimeControl = (currentState, atMs, force = false, outerStages = null) => {
    if (!actionAdapter || !combatLiveEnabled) return false;
    const inputTickValue = Number(currentState?.realtime?.tick);
    const inputTick = Number.isFinite(inputTickValue) ? inputTickValue : null;
    if (realtimeControlWorker && !realtimeControlWorkerDisabled) {
      if (realtimeControlWorkerInFlight) {
        const previous = realtimeControlWorkerQueued;
        const previousTick = Number(previous?.state?.realtime?.tick);
        if (!previous || force || inputTick === null || !Number.isFinite(previousTick) || inputTick > previousTick) {
          realtimeControlWorkerQueued = { state: currentState, atMs, force };
        }
        if (outerStages) outerStages['realtime-worker-queued'] = 0;
        // A queued realtime evaluation is not control ownership. When the
        // worker has no active safety/combat action, the ordinary planner must
        // remain eligible while the worker evaluates the newest frame.
        return realtimeControlActive;
      }
    }
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
    if (realtimeControlWorker && !realtimeControlWorkerDisabled) {
      const request = {
        state: currentState,
        atMs,
        force,
        inputTick,
        previousProcessedTick: result.decisions.realtimeControlSchedule.lastProcessedTick
      };
      realtimeControlWorkerInFlight = true;
      lastCombatControlAtMs = atMs;
      lastCombatControlTick = inputTick;
      const includePersistence = !realtimeControlWorkerPersistenceState
        || atMs - realtimeControlWorkerLastPersistenceAtMs >= realtimeControlWorkerPersistenceIntervalMs;
      const statePatch = realtimeControlWorkerPersistenceState
        ? null
        : decisionAdapter.getRealtimePersistenceState?.() || null;
      const workerOptions = {
        nowMs: atMs,
        controlMode,
        combatEnabled: config.combatEnabled
      };
      realtimeControlWorker.evaluate(
        currentState,
        workerOptions,
        buildRealtimeControlWorkerContext(currentState, atMs),
        statePatch,
        includePersistence
      ).then(workerResult => {
        realtimeControlWorkerInFlight = false;
        finishRealtimeControlWorkerRequest(request, workerResult);
      }).catch(error => {
        realtimeControlWorkerInFlight = false;
        finishRealtimeControlWorkerRequest(request, null, error);
      });
      if (outerStages) outerStages['realtime-worker-post'] = 0;
      // Posting work only reserves the realtime lane. It must not suppress
      // profit planning unless realtime control already owns an action.
      return realtimeControlActive;
    }
    const completeStarted = performance.now();
    const previousProcessedTick = lastCombatControlTick;
    let realtimeStages = null;
    const control = typeof decisionAdapter.evaluateRealtime === 'function'
      ? decisionAdapter.evaluateRealtime(currentState, {
          nowMs: atMs,
          controlMode,
          combatEnabled: config.combatEnabled,
          onRealtimeStageTimings: (stages, scale) => {
            realtimeStages = stages;
            lastRealtimeControlScale = scale || null;
          }
        })
      : decisionAdapter.evaluateCombat?.(currentState, {
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
      handled = publishRealtimeControl(control || {}, currentState, atMs, outerStages);
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
      decisionState: realtimeDecisionState(),
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
    const context = buildDecisionWorkerContext(currentState, atMs, { includeRemoteProfit: true });
    const dynamicWhitelistStatus = context.dynamicWhitelistStatus || {};
    const workerOptions = {
      ...runtimeDefaults,
      nowMs: atMs,
      controlMode,
      combatEnabled: config.combatEnabled,
      targetWhitelistNames: legacyStaticWhitelistNames,
      targetWhitelistUserIds: staticWhitelistUserIds,
      creatorUserIds,
      dynamicWhitelistMemberUserIds: dynamicWhitelistStatus.memberUserIds || [],
      dynamicWhitelistEnabledUserIds: dynamicWhitelistStatus.userIds || [],
      dailyDamageUserIds: context.damageStatus?.userIds || []
    };
    const statePatch = realtimePersistenceState();
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
          const currentPersistenceState = realtimePersistenceState();
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
          if (realtimeControlWorker && !realtimeControlWorkerDisabled) {
            realtimeControlWorker.syncPlannerDecision?.(workerResult.decision);
          }
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
            notifyDecisionWorker: true,
            outerStages: stages
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
          logMainThreadTiming(entry);
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

  if (options.transportRecoveryEscalation?.expectedSelfPresent === true) {
    const recovery = options.transportRecoveryEscalation;
    result.snapshotSafety = {
      ok: false,
      reason: 'transport-recovery-deadline-leave',
      checkedAt: new Date(now()).toISOString()
    };
    recordSafetyEvent(createSafetyEvent('transport-recovery-deadline-leave', {
      recoveryId: String(recovery.recoveryId || ''),
      sourceRunId: String(recovery.sourceRunId || ''),
      startedAt: String(recovery.startedAt || ''),
      deadlineAt: String(recovery.deadlineAt || ''),
      lastRealtimeTick: Number(recovery.lastRealtimeTick || 0),
      expectedSelfPresent: true
    }, {
      nowMs: now(),
      classification: 'exit',
      shouldLeave: true,
      selfAuthorityMissing: true
    }), {
      state: stateStore.getDecisionState?.(startedAt) || stateStore.getState(startedAt),
      decision: result.decisions.last,
      atMs: now()
    });
  } else try {
    if (options.bypassPreLoginSafetyReason) {
      const required = config.snapshotEdgeEnabled === true
        ? 1
        : Math.max(1, Math.round(Number(
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
        {
          ...options,
          snapshotPurpose: persistedPendingExit || expiredPendingExit
            ? 'exit-recovery-confirmation'
            : 'login-point-safety'
        }
      );
    }
  } catch (err) {
    const message = errorMessage(err);
    result.snapshotSafety = {
      ok: false,
      reason: err?.connectionFailure?.type === 'cloudflare-challenge'
        ? 'cloudflare-challenge'
        : 'snapshot-error',
      error: message
    };
    if (err?.connectionFailure && !persistedPendingExit && !expiredPendingExit) {
      result.connectionFailure = err.connectionFailure;
    }
    log('canary-snapshot-safety-error', { error: message });
  }
  const snapshotPurpose = String(result.snapshotSafety?.snapshotPurpose
    || ((persistedPendingExit || expiredPendingExit) ? 'exit-recovery-confirmation' : 'login-point-safety'));
  result.snapshotSafety = {
    ...(result.snapshotSafety || {}),
    snapshotPurpose,
    loginGateApplied: snapshotPurpose === 'login-point-safety',
    carriedIntoSession: false
  };
  log('canary-snapshot-safety', result.snapshotSafety);
  result.snapshotSafety = allowSelfPresentSnapshotControl(result.snapshotSafety);
  const recoveryPendingExit = persistedPendingExit || expiredPendingExit;
  const pendingExitResolution = recoveryPendingExit
    ? pendingExitSnapshotResolution(recoveryPendingExit, result.snapshotSafety, {
        maximumAgeMs: Number.MAX_SAFE_INTEGER,
        allowExpired: true
      })
    : { active: false, cleared: false, reason: 'inactive', pendingExit: null, outcome: null };
  exitRecoveryActive = pendingExitResolution.active;
  result.recovery.exitRecovery = pendingExitResolution.active;
  result.recovery.pendingExit = pendingExitResolution.pendingExit;
  result.recovery.pendingExitResolution = pendingExitResolution.reason;
  if (pendingExitResolution.cleared) {
    result.recovery.recoveryOutcome = 'confirmed-absent';
    result.recovery.loginGateApplied = false;
    result.recovery.carriedIntoSession = false;
    result.recovery.reloginDeferredThisCanary = true;
    result.recovery.loginIntervalNotBefore = new Date(
      Math.max(
        startedAt,
        (Date.parse(String(options.persistedState?.runner?.lastLoginAt || '')) || 0)
          + Math.max(60000, Number(config.loginIntervalMs || 60000))
      )
    ).toISOString();
    result.snapshotSafety = {
      ...result.snapshotSafety,
      recoveryOutcome: 'confirmed-absent',
      loginGateApplied: false,
      carriedIntoSession: false
    };
    // Do not let the canary that confirmed the old session's absence open a
    // new WebSocket.  The runner returns to its loop and re-applies the
    // start-to-start login interval before the normal login gate.
    exitRecoveryActive = true;
    emitExitRecoveryOutcome(pendingExitResolution.outcome);
    logExit('exit-recovery-snapshot-resolution', {
      exitAttemptId: recoveryPendingExit?.exitAttemptId || '',
      reason: pendingExitResolution.reason,
      authority: 'snapshot',
      selfPresent: false
    });
    log('canary-exit-recovery-cleared', {
      reason: pendingExitResolution.reason,
      previousRunId: recoveryPendingExit?.sourceRunId || '',
      pendingReason: recoveryPendingExit?.reason || '',
      exitAttemptId: recoveryPendingExit?.exitAttemptId || ''
    });
  } else if (pendingExitResolution.active) {
    const snapshotSummary = result.snapshotSafety?.response?.summary || {};
    const snapshotFresh = snapshotSummary?.freshness?.ok === true
      || (snapshotSummary?.freshness?.ok === undefined && result.snapshotSafety?.ok === true);
    const snapshotSelfPresent = snapshotFresh && snapshotSummary.selfPresent === true;
    result.recovery.recoveryOutcome = snapshotSelfPresent
      ? 'self-present'
      : (expiredPendingExit ? 'timeout-unconfirmed' : 'unknown');
    result.recovery.loginGateApplied = false;
    result.recovery.carriedIntoSession = false;
    result.snapshotSafety = {
      ...result.snapshotSafety,
      recoveryOutcome: result.recovery.recoveryOutcome,
      loginGateApplied: false,
      carriedIntoSession: false
    };
    if (snapshotSelfPresent) {
      result.snapshotSafety = {
        ...result.snapshotSafety,
        reason: 'pending-exit-self-present',
        bypassedPreLoginSafety: false,
        exitRecovery: true
      };
    }
    const timeoutUnconfirmed = Boolean(expiredPendingExit && !snapshotSelfPresent);
    if (timeoutUnconfirmed) {
      emitExitRecoveryOutcome(buildExitRecoveryOutcome(expiredPendingExit, {
        outcome: 'timeout-unconfirmed',
        authority: 'HTTP',
        completedAtMs: startedAt,
        lastHp: expiredPendingExit.lastHp,
        minHp: expiredPendingExit.minHp
      }));
    }
    logExit('exit-recovery-snapshot-resolution', {
      exitAttemptId: recoveryPendingExit?.exitAttemptId || '',
      reason: pendingExitResolution.reason,
      authority: 'snapshot',
      selfPresent: snapshotSelfPresent
    });
    result.mode = 'exit-recovery';
    log('canary-exit-recovery-active', {
      reason: pendingExitResolution.reason,
      previousRunId: recoveryPendingExit?.sourceRunId || '',
      pendingReason: recoveryPendingExit?.reason || '',
      exitAttemptId: recoveryPendingExit?.exitAttemptId || '',
      attemptCount: recoveryPendingExit?.attemptCount || 0,
      requestAttemptCount: recoveryPendingExit?.requestAttemptCount || 0
    });
    // Fresh self presence closes the old chain as recovered; an expired chain
    // without authoritative absence closes as timeout-unconfirmed. Neither is
    // relogin authority, so both immediately launch a new protected leave ID.
    if ((snapshotSelfPresent || timeoutUnconfirmed) && recoveryPendingExit) {
      if (snapshotSelfPresent) {
        emitExitRecoveryOutcome(buildExitRecoveryOutcome(recoveryPendingExit, {
          outcome: 'self-present-recovered',
          authority: 'snapshot',
          completedAtMs: startedAt,
          lastHp: result.snapshotSafety?.response?.summary?.self?.hp ?? recoveryPendingExit.lastHp,
          minHp: recoveryPendingExit.minHp
        }));
      }
      const recoveryEvent = pendingExitRecoveryEvent(recoveryPendingExit, startedAt, {
        maximumAgeMs: Number.MAX_SAFE_INTEGER,
        allowExpired: true
      });
      if (recoveryEvent) {
        if (snapshotSelfPresent) result.recovery.inGameEvidence = true;
        result.recovery.reason = snapshotSelfPresent
          ? 'pending-exit-self-present'
          : 'pending-exit-timeout-unconfirmed';
        result.recovery.source = snapshotSelfPresent
          ? 'persisted-pending-exit-snapshot'
          : 'persisted-pending-exit-timeout';
        result.recovery.previousRunId = recoveryPendingExit.sourceRunId || '';
        recordSafetyEvent(recoveryEvent, {
          state: stateStore.getDecisionState?.(startedAt) || stateStore.getState(startedAt),
          decision: result.decisions.last,
          atMs: startedAt
        });
      }
    } else if (recoveryPendingExit) {
      // A stale/failed snapshot supplies no terminal authority. Retry the
      // existing protected chain under the same ID so its duration, attempts,
      // and HTTP sequence remain continuous until absence, presence, or the
      // explicit persistence timeout closes it.
      const recoveryEvent = pendingExitRecoveryEvent(recoveryPendingExit, startedAt, {
        maximumAgeMs: Number.MAX_SAFE_INTEGER,
        allowExpired: true,
        continueAttempt: true
      });
      if (recoveryEvent) {
        result.recovery.reason = 'pending-exit-absence-unconfirmed';
        result.recovery.source = 'persisted-pending-exit-snapshot-unconfirmed';
        result.recovery.previousRunId = recoveryPendingExit.sourceRunId || '';
        recordSafetyEvent(recoveryEvent, {
          state: stateStore.getDecisionState?.(startedAt) || stateStore.getState(startedAt),
          decision: result.decisions.last,
          atMs: startedAt
        });
      }
    }
  }
  if (result.snapshotSafety?.bypassKind === 'single-blocker-timeout') {
    log('canary-snapshot-single-blocker-timeout-bypass', result.snapshotSafety);
  } else if (result.snapshotSafety?.bypassKind === 'high-self-hp') {
    log('canary-snapshot-high-hp-login-point-bypass', result.snapshotSafety);
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
      // An expired unconfirmed chain may already have started a fresh
      // protected leave above. Settle it before this pre-login rejection
      // returns so request/result statuses and the renewed pending chain are
      // not left racing the runner's persistence step.
      if (leavePending?.promise) {
        try {
          result.safety.exit = await leavePending.promise;
          result.leave = result.safety.exit?.leave || null;
        } catch (err) {
          const message = errorMessage(err);
          result.leave = { ok: false, error: message, attempts: [] };
          result.safety.exit = {
            ok: false,
            event: result.safety.event,
            stopMotion: null,
            leave: result.leave,
            error: message
          };
        }
      }
      result.completedAt = new Date(now()).toISOString();
      log('canary-blocked', { error: result.error });
      try {
        await decisionWorker?.close?.();
      } catch (_) {}
      try {
        await realtimeControlWorker?.close?.();
      } catch (_) {}
      return result;
    }
  }

  try {
    if (!leaveSupervisor
      && options.useLeaveSupervisor !== false
      && !options.leaveWithVerification
      && !options.fetchImpl) {
      leaveSupervisor = createBrowserlessLeaveSupervisor({
        onError: err => logExit('leave-supervisor-error', { error: errorMessage(err) })
      });
    }
    if (leaveSupervisor) {
      try {
        await leaveSupervisor.ready();
        result.safety.leaveSupervisor = leaveSupervisor.status?.() || { ready: true };
        logExit('leave-supervisor-ready', result.safety.leaveSupervisor);
      } catch (err) {
        result.safety.leaveSupervisor = {
          ...(leaveSupervisor.status?.() || {}),
          ready: false,
          error: errorMessage(err)
        };
        logExit('leave-supervisor-unavailable', result.safety.leaveSupervisor);
        try { await leaveSupervisor.close?.(); } catch (_) {}
        leaveSupervisor = null;
      }
    }
    if (decisionWorker) await decisionWorker.ready();
    if (realtimeControlWorker) {
      try {
        await realtimeControlWorker.ready();
      } catch (error) {
        realtimeControlWorkerDisabled = true;
        log('canary-realtime-control-worker-unavailable', { error: errorMessage(error) });
      }
    }
    const open = options.openBrowserlessWs || openBrowserlessWs;
    const wsFrameCoalescingEnabled = options.wsFrameCoalescing === true
      || (!options.openBrowserlessWs && options.wsFrameCoalescing !== false);
    let connectGeneration = 0;
    let pendingOpenEvent = null;
    if (ending || exitRecoveryActive || result.safety.event?.shouldLeave) {
      terminalBeforeWsActive = true;
      updateTransportLifecycle({ phase: 'suppressed-for-exit-recovery' });
      log('canary-ws-connect-suppressed-after-leave', {
        leaveConfirmed: Boolean(result.leave?.ok || leavePending?.ok),
        exitRecoveryActive,
        pendingReason: result.safety.event?.reason || ''
      });
    } else {
      // The recovery leave chain may confirm while open() is still awaiting
      // the HTTP upgrade. Keep the connect cancellable and unpublished until
      // the post-await terminal/generation gate accepts it.
      connectGeneration = ++wsConnectGeneration;
      pendingWsConnect = {
        generation: connectGeneration,
        phase: 'connecting',
        startedAtMs: now(),
        controller: new AbortController(),
        cancelReason: ''
      };
      updateTransportLifecycle({
        generation: connectGeneration,
        phase: 'connecting',
        pendingConnectCancel: null,
        terminalOpenBlocked: null,
        reassertLeave: null,
        confirmedLeaveActiveJoin: null,
        activeJoinAudit: null
      });
      if (typeof options.onLoginTransportAttempt === 'function') {
        try {
          options.onLoginTransportAttempt({
            sourceIp: config.sourceIp || '',
            connectGeneration,
            runId
          });
        } catch (err) {
          log('canary-source-ip-login-attempt-state-error', { error: errorMessage(err) });
        }
      }
      const openedTransport = await open({
      gameOrigin: config.gameOrigin,
      wsPath: config.wsPath,
      wsExtraQuery: config.wsExtraQuery,
      userId: config.userId,
      sessionToken: config.sessionToken,
      localAddress: config.sourceIp,
      connectTimeoutMs: config.wsConnectTimeoutMs,
      signal: pendingWsConnect.controller.signal,
      onConnectStart: event => {
        logWs('connect-start', {
          runtime: event?.runtime || '',
          localAddress: event?.localAddress || '',
          transportGeneration: Number(event?.transportGeneration || 0) || null
        });
      },
      onOpen: event => {
        pendingOpenEvent = event || {};
      },
      onConnectAbort: event => {
        logWs('connect-aborted', {
          ...(event || {}),
          connectGeneration
        });
      },
      onAbortedOpen: event => {
        const detail = {
          ...(event || {}),
          connectGeneration,
          reason: 'open-after-connect-abort'
        };
        postLeaveWsOpenViolation = postLeaveWsOpenViolation || detail;
        updateTransportLifecycle({ terminalOpenBlocked: detail });
        log('canary-post-leave-ws-open-violation', detail);
      },
      onError: event => {
        const generation = Number(event?.transportGeneration || 0);
        if (ending || pendingWsConnect?.controller?.signal?.aborted) {
          logWs('terminal-error', {
            message: event?.message || '',
            transportGeneration: generation || null,
            connectGeneration
          });
          return;
        }
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
        decisionAdapter.patchState?.({ combatMovementStability: null });
        restoreDynamicWhitelistBattles('websocket-closed');
        clearPublishedTransport(transport, 'websocket-close');
        logWs('close', event || {});
      },
      onSend: event => {
        logWs('send', {
          direction: 'out',
          message: wsTraceOutboundMessage(event?.message || ''),
          bufferedBefore: Number(event?.bufferedBefore || 0),
          bufferedAfter: Number(event?.bufferedAfter || 0)
        });
      },
      onMessage: function handleWsMessage(data, transportMeta = null) {
        const generation = Number(transportMeta?.transportGeneration || 0);
        if (generation > 0 && authoritativeTransportGeneration > 0 && generation !== authoritativeTransportGeneration) {
          logWs('stale-message', {
            transportGeneration: generation,
            authoritativeTransportGeneration
          });
          return;
        }
        if (ending) return;
        if (wsFrameCoalescingEnabled && transportMeta?.coalescedDispatch !== true) {
          const ingressStarted = performance.now();
          const ingressCpuStarted = startMainThreadCpuUsage();
          const atMs = now();
          if (!frameHealth.firstFrameAtMs) frameHealth.firstFrameAtMs = atMs;
          if (frameHealth.lastFrameAtMs) frameHealth.maxFrameGapMs = Math.max(frameHealth.maxFrameGapMs, atMs - frameHealth.lastFrameAtMs);
          frameHealth.lastFrameAtMs = atMs;
          const frame = inspectCanaryFrame(data, { userId: config.userId });
          transportHealthMonitor.observeFrame(frame, { receivedAtMs: atMs });
          if (config.wsTraceEnabled) logWs('message', buildWsFrameTrace(frame, config));
          if (frame.decodeError || frame.jsonParseError) frameHealth.decodeErrors += 1;
          updateFrameStats(stats, {
            at: new Date(atMs).toISOString(),
            ...frame
          });
          const ingressDurationMs = performance.now() - ingressStarted;
          const ingressEntry = recordMainThreadTask(result.hotPath, 'ws-message-ingress', ingressDurationMs, {
            'frame-gzip': Number(frame.decodeTimings?.gzipMs || 0),
            'frame-utf8': Number(frame.decodeTimings?.utf8Ms || 0),
            'frame-json-decode': Number(frame.decodeTimings?.jsonDecodeMs || 0),
            'frame-summary': Number(frame.decodeTimings?.summaryMs || 0)
          }, {
            frameType: frame?.decodedType || frame?.decodedJson?.type || '',
            tick: frame?.decodedTick ?? frame?.decodedJson?.tick ?? null,
            workProfile: mainThreadWorkProfile(ingressCpuStarted, ingressDurationMs)
          });
          logMainThreadTiming(ingressEntry);
          if (!wsFrameScheduler) {
            wsFrameScheduler = createLatestFrameScheduler({
              processFrame: item => handleWsMessage(item.data, {
                ...(item.transportMeta || {}),
                coalescedDispatch: true,
                predecodedFrame: item.frame,
                receivedAtMs: item.atMs,
                ingressDurationMs: item.ingressDurationMs
              }),
              onError: err => log('ws-frame-scheduler-error', { error: errorMessage(err) })
            });
          }
          wsFrameScheduler.enqueue({
            data,
            frame,
            atMs,
            ingressDurationMs,
            transportMeta
          });
          result.hotPath.frameScheduler = wsFrameScheduler.status();
          return;
        }
        const taskStarted = performance.now();
        const taskCpuStarted = startMainThreadCpuUsage();
        const stageDurations = {};
        const atMs = Number(transportMeta?.receivedAtMs || now());
        let frame = null;
        try {
          let stageStarted = performance.now();
          frame = transportMeta?.predecodedFrame || inspectCanaryFrame(data, { userId: config.userId });
          if (!transportMeta?.predecodedFrame) {
            if (!frameHealth.firstFrameAtMs) frameHealth.firstFrameAtMs = atMs;
            if (frameHealth.lastFrameAtMs) frameHealth.maxFrameGapMs = Math.max(frameHealth.maxFrameGapMs, atMs - frameHealth.lastFrameAtMs);
            frameHealth.lastFrameAtMs = atMs;
            transportHealthMonitor.observeFrame(frame, { receivedAtMs: atMs });
            if (config.wsTraceEnabled) logWs('message', buildWsFrameTrace(frame, config));
            if (frame.decodeError || frame.jsonParseError) frameHealth.decodeErrors += 1;
            updateFrameStats(stats, {
              at: new Date(atMs).toISOString(),
              ...frame
            });
          }
          stageDurations['frame-decode-log'] = transportMeta?.predecodedFrame
            ? Number(transportMeta?.ingressDurationMs || 0)
            : performance.now() - stageStarted;
          if (frame.decodeTimings) {
            stageDurations['frame-gzip'] = Number(frame.decodeTimings.gzipMs || 0);
            stageDurations['frame-utf8'] = Number(frame.decodeTimings.utf8Ms || 0);
            stageDurations['frame-json-decode'] = Number(frame.decodeTimings.jsonDecodeMs || 0);
            stageDurations['frame-summary'] = Number(frame.decodeTimings.summaryMs || 0);
          }
          transportHealthMonitor.observeProcessing({
            receivedAtMs: atMs,
            processedAtMs: now()
          });
          if (frame.decodedJson) {
            stageStarted = performance.now();
            if (frame.decodedJson.type === 'snapshot') scheduleSnapshotWork(frame.decodedJson, atMs);
            stageDurations['snapshot-observers'] = performance.now() - stageStarted;
            stageStarted = performance.now();
            stateStore.ingestFrame(frame.decodedJson, { receivedAtMs: atMs });
            stageDurations['state-ingest'] = performance.now() - stageStarted;
            stageStarted = performance.now();
            const currentState = stateStore.getDecisionState?.(atMs) || stateStore.getState(atMs);
            stageDurations['state-decision-view'] = performance.now() - stageStarted;
            stageStarted = performance.now();
            try {
              options.onRemoteProfitRealtime?.(currentState?.realtime?.entities || [], atMs);
            } catch (err) {
              log('canary-remote-profit-realtime-callback-error', { error: errorMessage(err) });
            }
            stageDurations['remote-profit-realtime-observe'] = performance.now() - stageStarted;
            stageStarted = performance.now();
            observeDynamicWhitelistBattles(currentState, atMs);
            stageDurations['dynamic-whitelist-observe'] = performance.now() - stageStarted;
            stageDurations['state-ingest-view'] = stageDurations['state-ingest']
              + stageDurations['state-decision-view']
              + stageDurations['dynamic-whitelist-observe'];
            stageStarted = performance.now();
            const currentSelf = currentState?.realtime?.self || null;
            if (
              !result.entry.firstSelf
              && currentSelf
              && Number.isFinite(Number(currentSelf.x))
              && Number.isFinite(Number(currentSelf.y))
            ) {
              const firstSelf = {
                userId: Number.isFinite(Number(currentSelf.user_id ?? currentSelf.userId)) ? Number(currentSelf.user_id ?? currentSelf.userId) : null,
                entityId: Number.isFinite(Number(currentSelf.entity_id ?? currentSelf.entityId)) ? Number(currentSelf.entity_id ?? currentSelf.entityId) : null,
                name: currentSelf.name || '',
                x: Number(currentSelf.x),
                y: Number(currentSelf.y),
                hp: Number.isFinite(Number(currentSelf.hp)) ? Number(currentSelf.hp) : null
              };
              const firstSelfAt = new Date(atMs).toISOString();
              const firstSelfTick = currentState?.realtime?.tick ?? frame.decodedTick ?? null;
              result.entry.firstSelf = firstSelf;
              result.entry.firstSelfAt = firstSelfAt;
              result.entry.firstSelfTick = firstSelfTick;
              if (typeof options.onLoginSuccess === 'function') {
                const loginSuccessPatchStarted = performance.now();
                try {
                  options.onLoginSuccess({
                    runId,
                    sourceIp: config.sourceIp || '',
                    firstSelf,
                    firstSelfAt,
                    firstSelfTick
                  });
                } catch (err) {
                  log('canary-source-ip-login-success-state-error', { error: errorMessage(err) });
                }
                stageDurations['login-success-state-patch'] = performance.now() - loginSuccessPatchStarted;
              }
            }
            if (frame.decodedJson.type === 'pos' && typeof options.onMapTrailRealtime === 'function') {
              const mapTrailStarted = performance.now();
              try {
                options.onMapTrailRealtime(currentState, atMs);
              } catch (err) {
                log('canary-map-trail-realtime-callback-error', { error: errorMessage(err) });
              }
              stageDurations['map-trail-realtime-observe'] = performance.now() - mapTrailStarted;
            }
            if (exitRecoveryActive && currentSelf && !leavePending) {
              const recoveryEvent = pendingExitRecoveryEvent(recoveryPendingExit, atMs, {
                maximumAgeMs: Number.MAX_SAFE_INTEGER,
                allowExpired: true
              });
              if (recoveryEvent) {
                emitExitRecoveryOutcome(buildExitRecoveryOutcome(recoveryPendingExit, {
                  outcome: 'self-present-recovered',
                  authority: 'realtime',
                  completedAtMs: atMs,
                  lastHp: currentSelf.hp ?? recoveryPendingExit?.lastHp,
                  minHp: recoveryPendingExit?.minHp
                }));
                logExit('exit-recovery-realtime-observed', {
                  exitAttemptId: recoveryPendingExit?.exitAttemptId || '',
                  authority: 'realtime',
                  tick: currentState?.realtime?.tick ?? frame.decodedTick ?? null,
                  selfHp: Number.isFinite(Number(currentSelf.hp)) ? Number(currentSelf.hp) : null
                });
                result.recovery.inGameEvidence = true;
                result.recovery.reason = 'pending-exit-self-present';
                result.recovery.source = 'persisted-pending-exit';
                result.recovery.previousRunId = recoveryPendingExit?.sourceRunId || '';
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
              const adapterState = actionAdapter.getMovementStallState?.()
                || actionAdapter.getState?.()
                || {};
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
              const frameEntities = Array.isArray(frame.decodedJson.entities) ? frame.decodedJson.entities : [];
              const frameSelf = frameEntities.find(entity => Number(entity?.user_id ?? entity?.userId) === Number(config.userId)) || null;
              const hp = Number(frameSelf?.hp ?? currentSelf?.hp);
              if (Number.isFinite(hp)) {
                leavePending.lastHp = hp;
                leavePending.minHp = leavePending.minHp === null ? hp : Math.min(leavePending.minHp, hp);
              }
              const life = String(frameSelf?.life || '').toLowerCase();
              const deathObserved = Boolean((Number.isFinite(hp) && hp <= 0) || life === 'dead');
              logBattleTail('leave-pending-frame', {
                atMs,
                frameType: frame.decodedJson.type,
                tick: currentState?.realtime?.tick ?? frame.decodedTick ?? frame.decodedJson.tick ?? null,
                selfPresent: Boolean(frameSelf),
                selfHp: Number.isFinite(hp) ? hp : null,
                lastKnownHp: leavePending.lastHp,
                minHp: leavePending.minHp,
                postTriggerDamage: leavePending.startHp === null || leavePending.minHp === null
                  ? null
                  : Math.max(0, leavePending.startHp - leavePending.minHp),
                life,
                deathObserved,
                deathTick: deathObserved ? (frame.decodedJson.tick ?? currentState?.realtime?.tick ?? null) : null,
                deathAtMs: deathObserved ? atMs : null,
                deathEvidence: deathObserved ? (life === 'dead' ? 'frame-life-dead' : 'frame-hp-zero') : '',
                x: Number.isFinite(Number(frameSelf?.x ?? currentSelf?.x)) ? Number(frameSelf?.x ?? currentSelf?.x) : null,
                y: Number.isFinite(Number(frameSelf?.y ?? currentSelf?.y)) ? Number(frameSelf?.y ?? currentSelf?.y) : null,
                vx: Number.isFinite(Number(frameSelf?.vx ?? currentSelf?.vx)) ? Number(frameSelf?.vx ?? currentSelf?.vx) : null,
                vy: Number.isFinite(Number(frameSelf?.vy ?? currentSelf?.vy)) ? Number(frameSelf?.vy ?? currentSelf?.vy) : null
              }, atMs);
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
                const plannerContext = buildDecisionWorkerContext(currentState, atMs, { includeRemoteProfit: true });
                const decision = decisionAdapter.decide(currentState, {
                  ...runtimeDefaults,
                  nowMs: atMs,
                  controlMode,
                  combatEnabled: config.combatEnabled,
                  remoteProfitBatch: plannerContext?.remoteProfitBatch || null
                });
                lastDecisionAtMs = atMs;
                publishFullDecision(decision, currentState, atMs);
              }
            }
            stageDurations['realtime-control-dispatch'] = performance.now() - stageStarted;
            if (assessRestartDrain(currentState, atMs)) return;
            stageStarted = performance.now();
            const safetyHandled = handleSafetyAssessment(safetyController.evaluate(currentState, {
              startedAtMs: noSelfGuardStartedAtMs(atMs),
              frameGapAlertMs,
              staleSelfMs: config.staleSelfMs,
              staleSelfConfirmMs: config.staleSelfConfirmMs,
              noSelfGraceMs: config.noSelfGraceMs,
              staminaExhaustedBelowMs: config.staminaExhaustedBelowMs,
              actionSettlementStall: result.actions.movementStall,
              transportHealth: assessTransportHealth(currentState, atMs),
              lastDecision: result.decisions.last,
              wsOpen: isWsOpen(transport),
              wsError,
              wsClosed,
              nowMs: atMs
            }), { state: currentState, decision: result.decisions.last, atMs });
            stageDurations.safety = performance.now() - stageStarted;
            if (
              frame.decodedJson.type === 'pos'
              && !realtimeHandled
              && !safetyHandled
              && !leavePending
              && !result.safety.event
              && !ending
              && actionAdapter
              && typeof actionAdapter.continueCloseCoinPickup === 'function'
            ) {
              stageStarted = performance.now();
              const continuation = actionAdapter.continueCloseCoinPickup(currentState);
              if (continuation) {
                updateActionResult(continuation, {
                  decision: result.decisions.last,
                  summary: result.decisions.last,
                  atMs
                });
              }
              stageDurations['near-coin-continuation'] = performance.now() - stageStarted;
            }
          }
        } finally {
          const taskDurationMs = performance.now() - taskStarted;
          const entry = recordMainThreadTask(result.hotPath, 'ws-message', taskDurationMs, stageDurations, {
            frameType: frame?.decodedType || frame?.decodedJson?.type || '',
            tick: frame?.decodedTick ?? frame?.decodedJson?.tick ?? null,
            queueDelayMs: transportMeta?.coalescedDispatch === true
              ? Math.max(0, now() - atMs)
              : 0,
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
          logMainThreadTiming(entry);
          if (wsFrameScheduler) result.hotPath.frameScheduler = wsFrameScheduler.status();
        }
      }
    });
      const terminalReason = ending
        ? 'leave-confirmed'
        : (pendingWsConnect?.generation !== connectGeneration
            ? 'stale-generation'
            : (pendingWsConnect?.controller?.signal?.aborted
                ? (pendingWsConnect.cancelReason || 'connect-aborted')
                : ''));
      if (terminalReason) {
        terminalBeforeWsActive = true;
        const close = {
          attempted: Boolean(openedTransport),
          closed: false,
          error: ''
        };
        if (openedTransport) {
          try {
            openedTransport.close();
            close.closed = true;
          } catch (err) {
            close.error = errorMessage(err);
          }
        }
        postLeaveWsOpenViolation = {
          connectGeneration,
          transportGeneration: Number(pendingOpenEvent?.transportGeneration || 0) || null,
          reason: terminalReason,
          close
        };
        if (pendingWsConnect) pendingWsConnect.phase = 'blocked-after-open';
        updateTransportLifecycle({
          generation: connectGeneration,
          phase: 'blocked-after-open',
          terminalOpenBlocked: postLeaveWsOpenViolation
        });
        log('canary-post-leave-ws-open-violation', postLeaveWsOpenViolation);
      } else {
        transport = openedTransport;
        if (pendingWsConnect) pendingWsConnect.phase = 'active';
        const generation = Number(pendingOpenEvent?.transportGeneration || 0);
        if (generation > 0) authoritativeTransportGeneration = generation;
        wsError = null;
        wsClosed = null;
        transportStartedAtMs = now();
        publishTransportHealth(
          transportHealthMonitor.setConnected(true, transportStartedAtMs),
          transportStartedAtMs,
          { force: true }
        );
        if (pendingOpenEvent) {
          logWs('open', {
            runtime: pendingOpenEvent.runtime || '',
            transportGeneration: generation || null
          });
        }
        updateTransportLifecycle({
          generation: connectGeneration,
          phase: 'active'
        });
        pendingWsConnect = null;
      }
    }
    if (transport) {
      publishTransport(transport);
      if (!transportStartedAtMs) transportStartedAtMs = now();
      publishTransportHealth(
        transportHealthMonitor.setConnected(true, transportStartedAtMs),
        transportStartedAtMs,
        { force: true }
      );
      if (actionEnabled) {
        const controlGeneration = stateStore.beginControlGeneration?.('ws-open')
          || stateStore.getControlGeneration?.()
          || '';
        actionAdapter = options.actionAdapter || createBrowserlessActionAdapter({
          ...runtimeDefaults,
          transport,
          now,
          decisionIntervalMs: config.decisionIntervalMs,
          commandIntervalMs: config.movementCommandIntervalMs,
          userId: config.userId,
          velocityRepeatEnabled: true,
          shootRepeatEnabled: true,
          targetDeadZoneCm: config.movementTargetDeadZoneCm,
          settlementFrames: config.movementSettlementFrames,
          movementSettlementStallMs: config.movementSettlementStallMs,
          movementSettlementMinDistanceCm: config.movementSettlementMinDistanceCm,
          combatShootMinIntervalMs: config.combatShootMinIntervalMs,
          controlGeneration,
          shootRequestUsesCommandObject: true,
          getTransportHealth: () => result.transportHealth || transportHealthMonitor.snapshot(now()),
          onVelocityRequest: request => stateStore.recordVelocityRequest(request, { returnInternal: true }),
          getSegmentGeneration: context => combatBattleLog?.currentSegmentGeneration?.(context) || '',
          onShootRequest: request => stateStore.recordShootRequest(request, { returnInternal: true }),
          onShootExecution: event => stateStore.recordShootExecution?.(event, {
            returnInternal: true,
            listenerUsesInternal: true
          }) || event
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
        const currentState = stateStore.getDecisionState?.(atMs) || stateStore.getState(atMs);
        const safetyEvent = safetyController.evaluate(currentState, {
          startedAtMs: noSelfGuardStartedAtMs(atMs),
          frameGapMs,
          frameGapAlertMs,
          staleSelfMs: config.staleSelfMs,
          staleSelfConfirmMs: config.staleSelfConfirmMs,
          noSelfGraceMs: config.noSelfGraceMs,
          staminaExhaustedBelowMs: config.staminaExhaustedBelowMs,
          actionSettlementStall: result.actions.movementStall,
          transportHealth: assessTransportHealth(currentState, atMs),
          wsError,
          wsClosed,
          wsOpen: isWsOpen(transport),
          lastDecision: result.decisions.last,
          nowMs: atMs
        });
        handleSafetyAssessment(safetyEvent, {
          state: currentState,
          decision: result.decisions.last,
          atMs
        });
        assessRestartDrain(currentState, atMs);
      }
      if (wsFrameScheduler) {
        wsFrameScheduler.flush();
        result.hotPath.frameScheduler = wsFrameScheduler.status();
      }
    }
  } catch (err) {
    const cancelledForConfirmedLeave = Boolean(
      terminalBeforeWsActive
      || (
        ending
        && !transport
        && (
          pendingWsConnect?.controller?.signal?.aborted
          || isWebSocketConnectAbortError(err)
        )
      )
    );
    if (cancelledForConfirmedLeave) {
      terminalBeforeWsActive = true;
      if (pendingWsConnect) pendingWsConnect.phase = 'cancelled';
      updateTransportLifecycle({
        generation: pendingWsConnect?.generation || wsConnectGeneration || 0,
        phase: 'cancelled'
      });
      log('canary-ws-connect-cancelled-after-leave', {
        generation: pendingWsConnect?.generation || null,
        error: errorMessage(err)
      });
    } else {
      openFailedBeforeTransport = !transport;
      result.error = err?.message || String(err);
      result.connectionFailure = err?.connectionFailure || null;
      log('canary-error', {
        error: result.error,
        connectionFailure: result.connectionFailure
      });
    }
  }

  const authOpenFailure = /websocket unexpected response 403|http 403|not logged in/i.test(result.error || '');
  const authoritativeInGameEvidence = canaryHasAuthoritativeInGameEvidence(result);
  const recoveryConfirmedAbsent = result.recovery?.recoveryOutcome === 'confirmed-absent';
  const protectedExitEvidence = Boolean(
    !recoveryConfirmedAbsent
      && (result.recovery?.exitRecovery
        || persistedPendingExit
        || expiredPendingExit)
  );
  const shouldVerifyExitAfterOpenFailure = Boolean(
    openFailedBeforeTransport
      && result.snapshotSafety?.ok
      && config.userId
      && config.sessionToken
      && authoritativeInGameEvidence
      && (!authOpenFailure || snapshotSafetySelfPresent(result.snapshotSafety))
  );
  const shouldAttemptLeave = Boolean(authoritativeInGameEvidence || protectedExitEvidence || leavePending?.promise);

  if (shouldAttemptLeave) {
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
            leaveWithVerification: invokeVerifiedLeave,
            now,
            sleep
          });
          result.leave = result.safety.exit.leave;
        }
      } else {
        clearPublishedTransport(transport, 'leave-start');
        if (actionAdapter) updateActionResult(actionAdapter.stop('normal-complete'));
        if (shouldVerifyExitAfterOpenFailure) log('canary-open-failed-leave', { error: result.error });
        result.leave = await invokeVerifiedLeave({
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
  } else if (result.connectionFailure?.type === 'cloudflare-challenge') {
    log('canary-login-challenge-no-leave', {
      source: result.connectionFailure.source || '',
      evidence: result.connectionFailure.evidence || []
    });
  }

  if (postLeaveWsOpenViolation) {
    const reassertStartedAtMs = now();
    const reassertPending = {
      exitAttemptId: createExitAttemptId(runId, reassertStartedAtMs, exitAttemptSequence++),
      recoveredFromExitAttemptId: leavePending?.exitAttemptId || '',
      originalReason: 'post-leave-ws-open',
      sourceRunId: runId,
      event: result.safety.event,
      firstAtMs: reassertStartedAtMs,
      startedAtMs: reassertStartedAtMs,
      eventAtMs: reassertStartedAtMs,
      dispatchedAtMs: reassertStartedAtMs,
      firstRequestAtMs: 0,
      hedgeScheduledAtMs: 0,
      hedgeStartedAtMs: 0,
      hedgeDispatchDriftMs: null,
      completedAtMs: 0,
      frameCount: 0,
      realtimeFrameCount: 0,
      coverRecomputeCount: 0,
      dynamicCoverCount: 0,
      directionChangeCount: 0,
      startHp: leavePending?.lastHp ?? leavePending?.minHp ?? null,
      lastHp: leavePending?.lastHp ?? leavePending?.minHp ?? null,
      minHp: leavePending?.minHp ?? leavePending?.lastHp ?? null,
      targetId: leavePending?.targetId || '',
      httpStatuses: [],
      requestResultCount: 0,
      lastCover: null,
      settled: false,
      ok: null,
      error: ''
    };
    logExit('post-leave-ws-open-reassert-start', {
      exitAttemptId: reassertPending.exitAttemptId,
      recoveredFromExitAttemptId: reassertPending.recoveredFromExitAttemptId,
      violation: postLeaveWsOpenViolation
    });
    let reassertLeave = null;
    try {
      reassertLeave = await invokeVerifiedLeave({
        gameOrigin: config.gameOrigin,
        userId: config.userId,
        sessionToken: config.sessionToken,
        localAddress: config.sourceIp,
        timeoutMs: config.httpTimeoutMs || 10000,
        retryMax: config.leaveRetryMax ?? 3,
        retryDelayMs: config.leaveRetryMs ?? 200,
        hedgeDelayMs: config.leaveDangerHedgeMs ?? 350,
        onRequest: request => {
          const requestAtMs = Number(request?.startedAtMs || now());
          if (!reassertPending.firstRequestAtMs) reassertPending.firstRequestAtMs = requestAtMs;
          logExit('leave-request-start', {
            ...request,
            exitAttemptId: reassertPending.exitAttemptId,
            lifecycleReassertion: true
          });
        },
        onResult: attempt => {
          const status = Number(attempt?.status);
          if (Number.isFinite(status)) {
            reassertPending.httpStatuses.push(Math.max(0, Math.round(status)));
            reassertPending.httpStatuses = reassertPending.httpStatuses.slice(-16);
          }
          reassertPending.requestResultCount += 1;
          logExit('leave-request-result', {
            ...attempt,
            exitAttemptId: reassertPending.exitAttemptId,
            lifecycleReassertion: true
          });
        }
      });
    } catch (err) {
      reassertLeave = { ok: false, error: errorMessage(err), attempts: [] };
    }
    reassertPending.completedAtMs = now();
    reassertPending.settled = true;
    reassertPending.ok = Boolean(reassertLeave?.ok);
    reassertPending.error = reassertLeave?.ok ? '' : errorMessage(reassertLeave?.error || 'leave not confirmed');
    if (!reassertPending.httpStatuses.length && Array.isArray(reassertLeave?.attempts)) {
      reassertPending.httpStatuses = reassertLeave.attempts
        .map(attempt => Number(attempt?.status))
        .filter(Number.isFinite)
        .map(status => Math.max(0, Math.round(status)))
        .slice(-16);
    }
    const reassertSummary = {
      exitAttemptId: reassertPending.exitAttemptId,
      recoveredFromExitAttemptId: reassertPending.recoveredFromExitAttemptId,
      ok: Boolean(reassertLeave?.ok),
      httpStatuses: reassertPending.httpStatuses,
      completedAtMs: reassertPending.completedAtMs,
      error: reassertPending.error
    };
    const reassertActiveJoinAudit = activeJoinAuditFromLeave(reassertLeave);
    const activeJoinAudit = compareActiveJoinAudits(
      confirmedLeaveActiveJoinAudit,
      reassertActiveJoinAudit
    );
    if (activeJoinAudit) reassertSummary.activeJoinAudit = activeJoinAudit;
    updateTransportLifecycle({
      reassertLeave: reassertSummary,
      activeJoinAudit
    });
    logExit('post-leave-ws-open-reassert-finish', reassertSummary);
    if (activeJoinAudit?.grew) {
      const detail = {
        exitAttemptId: reassertPending.exitAttemptId,
        recoveredFromExitAttemptId: reassertPending.recoveredFromExitAttemptId,
        ...activeJoinAudit
      };
      log('canary-post-leave-active-join-growth', detail);
      logExit('post-leave-active-join-growth', detail);
    }
    result.leave = reassertLeave;
    if (result.safety.exit) {
      result.safety.exit = {
        ...result.safety.exit,
        ok: Boolean(reassertLeave?.ok),
        leave: reassertLeave,
        error: reassertLeave?.ok ? '' : reassertPending.error
      };
    }
    if (reassertLeave?.ok) {
      emitExitRecoveryOutcome(buildExitRecoveryOutcome(reassertPending, {
        outcome: 'confirmed-absent',
        authority: 'HTTP',
        completedAtMs: reassertPending.completedAtMs
      }));
      log('canary-post-leave-ws-open-reasserted', reassertSummary);
    } else {
      result.safety.leavePending = publicLeavePending(reassertPending);
      result.error = `post-leave websocket lifecycle violation: ${reassertPending.error || 'leave not confirmed'}`;
      log('canary-post-leave-ws-open-reassert-failed', reassertSummary);
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
    if (wsFrameScheduler) result.hotPath.frameScheduler = wsFrameScheduler.close({ flush: false });
    restoreDynamicWhitelistBattles('canary-finished');
    clearPublishedTransport(transport, 'canary-finish');
    if (transport && (transport.isOpen?.() || isWsOpen(transport.ws))) transport.close();
  } catch (_) {}

  if (realtimeControlWorker && !realtimeControlWorkerDisabled) {
    realtimeControlWorkerQueued = null;
    try {
      await realtimeControlWorker.flush();
      const finalRealtimeState = await realtimeControlWorker.requestPersistence();
      if (finalRealtimeState?.persistenceState) {
        realtimeControlWorkerPersistenceState = finalRealtimeState.persistenceState;
        realtimeControlWorkerStatusSummary = finalRealtimeState.statusSummary || realtimeControlWorkerStatusSummary;
      }
      await realtimeControlWorker.finalize(
        result.safety.event?.reason || result.error || 'canary-ended',
        { nowMs: now() }
      );
      await realtimeControlWorker.flush();
    } catch (error) {
      log('canary-realtime-control-worker-close-error', { error: errorMessage(error) });
    }
  }

  const noFrames = Number(stats.decodedFrameCount || 0) <= 0;
  const noSelf = Number(stats.selfPresent.true || 0) <= 0;
  const frameGap = Number(frameHealth.maxFrameGapMs || 0) > frameGapAlertMs;
  const leaveFailed = !recoveryConfirmedAbsent && !result.leave?.ok;
  const confirmedAbsentBeforeWsActive = Boolean(
    terminalBeforeWsActive
      && (result.leave?.ok || result.recovery?.recoveryOutcome === 'confirmed-absent')
  );
  if (!result.error && noFrames && !confirmedAbsentBeforeWsActive) result.error = 'no decoded frames received';
  if (!result.error && noSelf && !confirmedAbsentBeforeWsActive) result.error = 'self not observed in realtime frames';
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
  if (realtimeControlWorker) {
    try {
      await realtimeControlWorker.close();
    } catch (err) {
      log('canary-realtime-control-worker-terminate-error', { error: errorMessage(err) });
    }
  }
  if (decisionWorker) {
    try {
      await decisionWorker.close();
    } catch (err) {
      log('canary-decision-worker-close-error', { error: errorMessage(err) });
    }
  }
  if (leaveSupervisor) {
    try {
      result.safety.leaveSupervisor = {
        ...(leaveSupervisor.status?.() || {}),
        close: await leaveSupervisor.close?.()
      };
    } catch (err) {
      result.safety.leaveSupervisor = {
        ...(leaveSupervisor.status?.() || {}),
        closeError: errorMessage(err)
      };
    }
  }
  result.state = stateStore.getState(now());
  if (realtimeControlWorkerStatusSummary) result.decisionState = realtimeControlWorkerStatusSummary;
  else if (typeof decisionAdapter.getStatusSummary === 'function') result.decisionState = decisionAdapter.getStatusSummary();
  if (actionAdapter) {
    const adapterState = actionAdapter.getState();
    result.actions.sentCount = Number(adapterState.sentCount || 0);
    result.actions.velocitySentCount = Number(adapterState.velocitySentCount || 0);
    result.actions.velocityRepeatSentCount = Number(adapterState.velocityRepeatSentCount || 0);
    result.actions.velocityRepeatSuppressedCount = Number(adapterState.velocityRepeatSuppressedCount || 0);
    result.actions.shootSentCount = Number(adapterState.shootSentCount || 0);
    result.actions.shootRepeatSentCount = Number(adapterState.shootRepeatSentCount || 0);
    result.actions.shootRepeatSuppressedCount = Number(adapterState.shootRepeatSuppressedCount || 0);
    result.actions.stopCount = Number(adapterState.stopCount || 0);
    result.actions.skippedCount = Number(adapterState.skippedCount || 0);
    result.actions.settlement = adapterState.lastSettlement || result.actions.settlement;
    result.actions.movementStall = adapterState.movementStall || result.actions.movementStall;
    result.actions.lastMovementStall = adapterState.lastMovementStall || result.actions.lastMovementStall;
    result.actions.lastShootAck = adapterState.lastShootAck || result.actions.lastShootAck;
  }
  result.actions.publication = actionPublicationGate.status();
  if (result.connectionFailure?.type === 'cloudflare-challenge') {
    result.connectionFailure = {
      ...result.connectionFailure,
      inGameEvidence: authoritativeInGameEvidence,
      leaveAttempted: Boolean(result.leave),
      leaveConfirmed: Boolean(result.leave?.ok)
    };
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
  createActionPublicationGate,
  createLatestFrameScheduler,
  createCanaryRunId,
  createMainThreadTimingStats,
  frameDataToBuffer,
  highHpLoginPointSafetyExemption,
  inspectCanaryFrame,
  loginPointFromState,
  nextCombatControlTickCore,
  plannerResponseHasNewerPreemption,
  recordMainThreadTask,
  runPreLoginSnapshotSafety,
  runReadOnlyCanary
};
