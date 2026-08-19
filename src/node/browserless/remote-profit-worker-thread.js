'use strict';

const os = require('os');
const { parentPort } = require('worker_threads');
const { performance } = require('perf_hooks');
const { evaluateRemoteProfitTargets } = require('../../strategy/remote-profit-targets');
const { playerProfitScoreMultiplierCore } = require('../../strategy/player-profit-score');
const {
  effectiveProfitReward,
  normalizeEntityForDecision,
  opportunityEnemyStaminaCost,
  scoreEnemyOpportunity
} = require('./decision-adapter');
const { staminaRemainingValue, staminaLimitForWindow, summarizeStaminaWindow } = require('./stamina-metadata');

if (process.platform === 'linux') {
  try {
    if (os.getPriority(0) < 10) os.setPriority(0, 10);
  } catch (_) {}
}

function scoreTarget(request, target, details = {}) {
  const baseOptions = {
    ...(request.scoringOptions || {}),
    ...(details.config || {}),
    nowMs: Number(request.observedAtMs || Date.now()),
    isAfkProfitTarget: () => ['high-drop-afk', 'easy-kill-afk'].includes(details.classification),
    combatCompletionByUserId: request.combatCompletionByUserId || {}
  };
  const staminaCost = opportunityEnemyStaminaCost(target, baseOptions);
  const effective = effectiveProfitReward(target, {
    ...baseOptions,
    staminaCostOverride: staminaCost
  });
  const baseScore = scoreEnemyOpportunity(target, {
    ...baseOptions,
    invulnerableProfitSelectionEnabled: false,
    isAfkProfitTarget: () => ['high-drop-afk', 'easy-kill-afk'].includes(details.classification)
  });
  return {
    expectedReward: effective.expectedReward,
    staminaCost,
    baseScore,
    profitScoreMultiplier: playerProfitScoreMultiplierCore(effective.rawDrop),
    effective
  };
}

parentPort.on('message', message => {
  if (!message || typeof message !== 'object') return;
  try {
    if (message.kind === 'evaluate') {
      const started = performance.now();
      const request = message.request && typeof message.request === 'object' ? message.request : {};
      const result = evaluateRemoteProfitTargets(request, {
        normalizeEntity: entity => {
          const projected = entity && typeof entity === 'object'
            ? {
                ...entity,
                user_id: entity.user_id ?? entity.userId ?? entity.target_user_id ?? entity.targetUserId
              }
            : entity;
          const normalized = normalizeEntityForDecision(projected, request.self || null, 'snapshot-navigation', {
            ...(request.scoringOptions || {}),
            ...(request.config || {}),
            rawProtocolFields: true
          });
          if (!normalized) return null;
          normalized.userId = normalized.user_id;
          normalized.stamina1dRemaining = staminaRemainingValue(normalized, '1d');
          normalized.stamina1dLimit = staminaLimitForWindow(normalized, '1d');
          normalized.staminaFull = summarizeStaminaWindow(normalized, '1d', request.config || {}).full;
          normalized.joinModeActive = Boolean(normalized.joinModeActive || String(projected?.current_join_mode || projected?.mode || projected?.joined || '').toLowerCase() === 'active');
          normalized.recentActivity = Boolean(projected?.recentActivity || projected?.recentlyActive);
          return normalized;
        },
        staminaWindow: (entity, windowName, options) => summarizeStaminaWindow(entity, windowName, options),
        scoreTarget: (target, details) => scoreTarget(request, target, details)
      });
      parentPort.postMessage({
        kind: 'result',
        id: message.id,
        result,
        computeMs: performance.now() - started
      });
      return;
    }
    if (message.kind === 'barrier') {
      parentPort.postMessage({ kind: 'barrier', id: message.id });
      return;
    }
    throw new Error(`unsupported remote profit worker operation: ${message.kind}`);
  } catch (error) {
    parentPort.postMessage({
      kind: 'request-error',
      id: message.id || 0,
      error: error?.stack || error?.message || String(error)
    });
  }
});

let nice = null;
try { nice = os.getPriority(0); } catch (_) {}
parentPort.postMessage({ kind: 'ready', nice });
