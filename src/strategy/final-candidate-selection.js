'use strict';

const { actionFocusSummary, actionPriorityBand } = require('./action-priority');

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function finalCandidateMeta(action, options = {}) {
  if (!action || typeof action !== 'object') return null;
  const focus = actionFocusSummary(action, { nowMs: options.nowMs });
  const roiScore = numberOrNull(options.roiScore ?? action.roiScore ?? action.score ?? action.opportunityChoice?.score);
  const staminaCost = numberOrNull(options.staminaCost ?? action.staminaCost ?? action.opportunityChoice?.staminaCost);
  const riskScore = numberOrNull(options.riskScore ?? action.riskScore);
  return {
    priorityBand: String(options.priorityBand || actionPriorityBand(action)),
    hardGate: Boolean(options.hardGate),
    targetKey: String(options.targetKey || focus?.key || ''),
    roiScore,
    riskScore,
    staminaCost,
    validUntil: numberOrNull(options.validUntil),
    switchReason: String(options.switchReason || action.reason || action.kind || ''),
    order: Math.max(0, Math.round(Number(options.order || 0)))
  };
}

function buildFinalActionCandidate(action, options = {}) {
  if (!action || typeof action !== 'object') return null;
  const meta = finalCandidateMeta(action, options);
  return {
    action: {
      ...action,
      finalCandidate: meta
    },
    ...meta
  };
}

function selectFinalActionCandidateCore(candidates = []) {
  const valid = (candidates || []).filter(candidate => candidate?.action);
  if (!valid.length) return null;
  const hardGate = valid.find(candidate => candidate.hardGate);
  if (hardGate) return hardGate;
  return valid.slice().sort((a, b) => Number(a.order || 0) - Number(b.order || 0))[0] || null;
}

module.exports = {
  buildFinalActionCandidate,
  finalCandidateMeta,
  selectFinalActionCandidateCore
};
