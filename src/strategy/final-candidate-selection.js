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
  const expectedReward = numberOrNull(options.expectedReward ?? action.expectedReward ?? action.reward
    ?? action.target?.coinRoute?.value ?? action.target?.fieldAmount ?? action.target?.amount);
  const switchCost = Math.max(0, numberOrNull(options.switchCost ?? action.switchCost) ?? 0);
  const commitmentRank = Math.min(100, Math.max(0, numberOrNull(options.commitmentRank ?? action.commitmentRank) ?? 0));
  const riskMultiplier = riskScore === null ? 1 : Math.max(0.05, 1 - Math.max(0, riskScore) / 100);
  const netROI = numberOrNull(options.netROI ?? action.netROI)
    ?? (expectedReward !== null && staminaCost !== null
      ? expectedReward * riskMultiplier / Math.max(1, staminaCost + switchCost)
      : roiScore);
  return {
    priorityBand: String(options.priorityBand || actionPriorityBand(action)),
    hardGate: Boolean(options.hardGate),
    targetKey: String(options.targetKey || focus?.key || ''),
    roiScore,
    riskScore,
    expectedReward,
    switchCost,
    commitmentRank,
    netROI,
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
  const rank = band => ({ exit: 600, safety: 500, combat: 400, profit: 300, recover: 200, wait: 100 }[band] || 0);
  return valid.slice().sort((a, b) => rank(b.priorityBand) - rank(a.priorityBand)
    || (a.priorityBand === 'profit' && b.priorityBand === 'profit'
      ? Number(b.commitmentRank || 0) - Number(a.commitmentRank || 0)
      : 0)
    || (a.priorityBand === 'profit' && b.priorityBand === 'profit'
      ? Number(b.netROI ?? -Infinity) - Number(a.netROI ?? -Infinity)
      : 0)
    || Number(a.riskScore ?? 0) - Number(b.riskScore ?? 0)
    || Number(a.order || 0) - Number(b.order || 0))[0] || null;
}

module.exports = {
  buildFinalActionCandidate,
  finalCandidateMeta,
  selectFinalActionCandidateCore
};
