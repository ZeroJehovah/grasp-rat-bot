'use strict';

const os = require('os');
const { parentPort, workerData } = require('worker_threads');
const { performance } = require('perf_hooks');
const { createBrowserlessDecisionAdapter } = require('./decision-adapter');

// The realtime worker is the second gameplay CPU lane. Keep it schedulable
// beside the Nice=-10 WebSocket main thread without inheriting the main
// thread's release priority; the main thread retains safety/action priority.
if (process.platform === 'linux') {
  try { os.setPriority(0, 0); } catch (_) {}
}

const adapter = createBrowserlessDecisionAdapter(workerData?.options || {});

function easyKillTrackerProxy(context = {}, effects = []) {
  const status = context.easyKillStatus && typeof context.easyKillStatus === 'object'
    ? context.easyKillStatus
    : { players: [], blockedUserIds: [], engagements: [] };
  const proxy = { status: () => status };
  for (const method of [
    'observeKillEvidence',
    'expirePendingOutcomes',
    'observeVisibleTargets',
    'recordImmediateFailure',
    'observeCombatEngagement',
    'observeCombatShot',
    'finishEngagement',
    'finishActiveEngagements'
  ]) {
    proxy[method] = (...args) => {
      effects.push({ tracker: 'easy-kill', method, args });
      return null;
    };
  }
  return proxy;
}

function completionTrackerProxy(context = {}) {
  const values = context.combatCompletionByUserId && typeof context.combatCompletionByUserId === 'object'
    ? context.combatCompletionByUserId
    : {};
  return {
    probability(userId) {
      return values[String(userId)] || {
        probability: 1 / 3,
        source: 'conservative-prior',
        attempts: 0,
        successes: 0,
        failures: 0,
        escapeRate: null,
        damageExchangeRatio: null
      };
    }
  };
}

function dynamicOptions(message, effects) {
  const context = message.context || {};
  return {
    ...(message.options || {}),
    dailyDamageUserIds: message.options?.dailyDamageUserIds || context.damageStatus?.userIds || [],
    easyKillPlayerTracker: easyKillTrackerProxy(context, effects),
    damagePlayerTracker: {
      status: () => context.damageStatus || { players: [], userIds: [] }
    },
    combatCompletionTracker: completionTrackerProxy(context),
    combatCompletionByUserId: context.combatCompletionByUserId || {}
  };
}

parentPort.on('message', message => {
  if (!message || typeof message !== 'object') return;
  try {
    if (message.kind === 'evaluate') {
      const started = performance.now();
      if (message.statePatch) adapter.patchState?.(message.statePatch);
      const effects = [];
      let stageTimings = null;
      let inputScale = null;
      const control = adapter.evaluateRealtime(message.state, {
        ...dynamicOptions(message, effects),
        includeDecisionStateSummary: false,
        onRealtimeStageTimings: (stages, scale) => {
          stageTimings = stages;
          inputScale = scale || null;
        }
      });
      const includePersistence = message.includePersistence === true;
      const persistenceState = includePersistence
        ? adapter.getRealtimePersistenceState?.() || null
        : null;
      const statusSummary = includePersistence
        ? adapter.getStatusSummary?.() || null
        : null;
      parentPort.postMessage({
        kind: 'evaluation',
        id: message.id,
        control,
        effects,
        stageTimings,
        inputScale,
        persistenceState,
        statusSummary,
        computeMs: performance.now() - started,
        requestAtMs: message.requestAtMs || 0,
        tick: control?.tick ?? message.state?.realtime?.tick ?? null
      });
      return;
    }
    if (message.kind === 'sync-planner') {
      adapter.syncPlannerDecision?.(message.decision);
      return;
    }
    if (message.kind === 'observe-action') {
      adapter.observeActionResult?.(message.actionResult, message.decision, message.options || {});
      return;
    }
    if (message.kind === 'note-preemption') {
      adapter.noteRealtimeFinalActionPreemption?.(message.action || {}, message.atMs);
      return;
    }
    if (message.kind === 'patch-state') {
      adapter.patchState?.(message.statePatch || {});
      return;
    }
    if (message.kind === 'persistence') {
      parentPort.postMessage({
        kind: 'persistence',
        id: message.id,
        persistenceState: adapter.getRealtimePersistenceState?.() || null,
        statusSummary: adapter.getStatusSummary?.() || null
      });
      return;
    }
    if (message.kind === 'finalize') {
      const result = adapter.finalizeEasyKillEngagements?.(
        message.reason || 'canary-ended',
        message.options || {}
      );
      parentPort.postMessage({ kind: 'finalize', id: message.id, result: result || null });
      return;
    }
    if (message.kind === 'barrier') {
      parentPort.postMessage({ kind: 'barrier', id: message.id });
      return;
    }
    throw new Error(`unsupported realtime control worker operation: ${message.kind}`);
  } catch (error) {
    parentPort.postMessage({
      kind: 'request-error',
      id: message.id || 0,
      operation: message.kind || '',
      error: error?.stack || error?.message || String(error)
    });
  }
});

parentPort.postMessage({ kind: 'ready' });
