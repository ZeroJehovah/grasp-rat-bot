'use strict';

const { parentPort, workerData } = require('worker_threads');
const { performance } = require('perf_hooks');
const {
  createBrowserlessDecisionAdapter,
  summarizeBrowserlessDecision
} = require('./decision-adapter');

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
    if (message.kind === 'decide') {
      const started = performance.now();
      if (message.statePatch) adapter.patchState?.(message.statePatch);
      const effects = [];
      const decision = adapter.decide(message.state, {
        ...dynamicOptions(message, effects),
        includeDecisionStateSummary: false
      });
      const summary = summarizeBrowserlessDecision(decision);
      const decisionJsonBytes = Buffer.byteLength(JSON.stringify(decision));
      const summaryJsonBytes = Buffer.byteLength(JSON.stringify(summary));
      parentPort.postMessage({
        kind: 'decision',
        id: message.id,
        decision,
        summary,
        effects,
        responseScale: {
          effectCount: effects.length,
          decisionJsonBytes,
          summaryJsonBytes,
          applyPatchItemCount: Object.keys(decision?.stateful || {}).length + effects.length,
          visibleTargetCount: Number(summary?.input?.visibleTargetCount ?? summary?.input?.nearby?.visibleTargetCount ?? 0),
          profitCandidateCount: Number(summary?.profit?.candidates?.length || 0),
          combatCandidateCount: Number(summary?.combat?.candidates?.length || 0)
        },
        computeMs: performance.now() - started,
        requestAtMs: message.requestAtMs || 0
      });
      return;
    }
    if (message.kind === 'observe-action') {
      adapter.observeActionResult?.(message.actionResult, message.decision, message.options || {});
      return;
    }
    if (message.kind === 'barrier') {
      parentPort.postMessage({ kind: 'barrier', id: message.id });
      return;
    }
    throw new Error(`unsupported decision worker operation: ${message.kind}`);
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
