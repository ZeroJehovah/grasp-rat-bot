'use strict';

const CONTINUATION_ACTION_KINDS = new Set(['attack', 'seek-enemy']);

function stableTargetId(target) {
  const id = target?.userId ?? target?.user_id ?? target?.id;
  return id === undefined || id === null || id === '' ? '' : String(id);
}

function centerActivityAfkContinuationFreshnessMsCore(options = {}) {
  const interval = Number(options.decisionIntervalMs ?? 1000);
  const decisionIntervalMs = Number.isFinite(interval) ? Math.max(0, interval) : 1000;
  return Math.min(5000, Math.max(3000, decisionIntervalMs * 3));
}

function deriveCenterActivityAfkContinuationCore(arbitration = {}, options = {}) {
  const action = arbitration?.lastAction || null;
  const focus = arbitration?.lastFocus || null;
  if (!action || String(action.band || '') !== 'profit') return null;
  const actionKind = String(action.kind || '');
  if (!CONTINUATION_ACTION_KINDS.has(actionKind)) return null;
  const targetId = stableTargetId(action.target);
  if (!targetId || action.target?.centerActivityEdge?.admitted !== true) return null;
  if (!focus || String(focus.band || '') !== 'profit' || String(focus.type || '') !== 'enemy') return null;
  if (String(focus.id ?? focus.targetKey ?? '') !== targetId) return null;

  const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  const selectedAt = Number(arbitration.lastSelectedAt || 0);
  const preemptedAt = Number(arbitration.lastPreemption?.at || 0);
  if (preemptedAt >= selectedAt) return null;
  const freshnessMs = centerActivityAfkContinuationFreshnessMsCore(options);
  const ageMs = nowMs - selectedAt;
  if (!(selectedAt > 0) || ageMs < 0 || ageMs > freshnessMs) return null;

  return {
    targetId,
    sourceActionKind: actionKind,
    selectedAt,
    ageMs: Math.round(ageMs),
    freshnessMs
  };
}

function evaluateCenterActivityAfkAdmissionCore(input = {}) {
  const centerRadiusCm = Number(input.centerRadiusCm);
  const edgeRadiusCm = Number(input.edgeRadiusCm);
  const selfRadiusCm = Number(input.selfRadiusCm);
  const targetRadiusCm = Number(input.targetRadiusCm);
  const targetDistanceCm = Number(input.targetDistanceCm);
  const visibleDistanceCm = Number(input.visibleDistanceCm);
  const targetId = stableTargetId({ userId: input.targetId });
  const continuationTargetId = stableTargetId({ userId: input.continuation?.targetId });

  if (!Number.isFinite(targetRadiusCm)) return { admitted: false, reason: 'unknown-target-radius' };
  if (targetRadiusCm <= centerRadiusCm) return { admitted: true, edge: false, continued: false, reason: 'inside-center' };
  if (targetRadiusCm > edgeRadiusCm) return { admitted: false, reason: 'outside-afk-edge-radius' };

  const selfInsideCenter = Number.isFinite(selfRadiusCm) && selfRadiusCm <= centerRadiusCm;
  if (!selfInsideCenter) {
    if (!Number.isFinite(selfRadiusCm) || selfRadiusCm > edgeRadiusCm) {
      return { admitted: false, reason: 'self-outside-afk-edge-radius' };
    }
    if (!targetId || !continuationTargetId || targetId !== continuationTargetId) {
      return { admitted: false, reason: 'self-outside-center' };
    }
  }
  if (String(input.authority || '') !== 'realtime') {
    return { admitted: false, reason: 'non-realtime-authority' };
  }
  if (!Number.isFinite(targetDistanceCm)
    || (Number.isFinite(visibleDistanceCm) && visibleDistanceCm > 0 && targetDistanceCm > visibleDistanceCm)) {
    return { admitted: false, reason: 'outside-opportunity-visible-distance' };
  }

  const continued = !selfInsideCenter;
  return {
    admitted: true,
    edge: true,
    continued,
    reason: continued ? 'center-afk-edge-continuation' : 'center-afk-edge-admitted'
  };
}

module.exports = {
  centerActivityAfkContinuationFreshnessMsCore,
  deriveCenterActivityAfkContinuationCore,
  evaluateCenterActivityAfkAdmissionCore
};
