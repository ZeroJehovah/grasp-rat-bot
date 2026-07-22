'use strict';

const DEFAULTS = Object.freeze({
  confirmTicks: 6,
  minimumHoldMs: 500
});

function policyName(value) {
  if (value && typeof value === 'object') return String(value.name || '');
  return String(value || '');
}

function updateCombatResponsePolicyShadowCore(previous = null, input = {}, options = {}) {
  const nowMs = Math.max(0, Number(input.nowMs ?? Date.now()));
  const targetId = String(input.targetId ?? '');
  const candidatePolicy = policyName(input.candidatePolicy);
  const recognizedMode = String(input.recognizedMode || 'mixed/unknown');
  const confirmTicks = Math.max(1, Math.round(Number(options.confirmTicks ?? DEFAULTS.confirmTicks)));
  const minimumHoldMs = Math.max(0, Number(options.minimumHoldMs ?? DEFAULTS.minimumHoldMs));
  const sameTarget = Boolean(previous && String(previous.targetId || '') === targetId);
  const previousCommitted = sameTarget ? policyName(previous.committedPolicy) : '';
  const bypassReason = String(input.bypassReason || '');

  if (!targetId) {
    return {
      targetId,
      committedPolicy: candidatePolicy,
      effectivePolicy: candidatePolicy,
      committedMode: recognizedMode,
      candidatePolicy: '',
      candidateTicks: 0,
      committedAt: nowMs,
      switched: false,
      switchSameMode: false,
      suppressed: false,
      bypassed: Boolean(bypassReason),
      bypassReason,
      transitionReason: 'policy-unavailable',
      confirmTicks,
      minimumHoldMs,
      updatedAt: nowMs
    };
  }

  if (!candidatePolicy) {
    if (sameTarget && previousCommitted) {
      return {
        ...previous,
        targetId,
        committedPolicy: previousCommitted,
        effectivePolicy: previousCommitted,
        candidatePolicy: '',
        candidateTicks: 0,
        switched: false,
        switchSameMode: false,
        suppressed: false,
        bypassed: Boolean(bypassReason),
        bypassReason,
        transitionReason: 'policy-unavailable-preserve-commitment',
        confirmTicks,
        minimumHoldMs,
        updatedAt: nowMs
      };
    }
    return {
      targetId,
      committedPolicy: '',
      effectivePolicy: '',
      committedMode: recognizedMode,
      candidatePolicy: '',
      candidateTicks: 0,
      committedAt: nowMs,
      switched: false,
      switchSameMode: false,
      suppressed: false,
      bypassed: Boolean(bypassReason),
      bypassReason,
      transitionReason: 'policy-unavailable',
      confirmTicks,
      minimumHoldMs,
      updatedAt: nowMs
    };
  }

  if (!sameTarget || !previousCommitted) {
    return {
      targetId,
      committedPolicy: candidatePolicy,
      effectivePolicy: candidatePolicy,
      committedMode: recognizedMode,
      candidatePolicy: '',
      candidateTicks: 0,
      committedAt: nowMs,
      switched: false,
      switchSameMode: false,
      suppressed: false,
      bypassed: Boolean(bypassReason),
      bypassReason,
      transitionReason: sameTarget ? 'first-commit' : 'target-changed',
      confirmTicks,
      minimumHoldMs,
      updatedAt: nowMs
    };
  }

  if (bypassReason) {
    return {
      ...previous,
      targetId,
      committedPolicy: previousCommitted,
      effectivePolicy: candidatePolicy,
      candidatePolicy: '',
      candidateTicks: 0,
      committedAt: Number.isFinite(Number(previous.committedAt))
        ? Math.max(0, Number(previous.committedAt))
        : nowMs,
      switched: false,
      switchSameMode: false,
      suppressed: false,
      bypassed: true,
      bypassReason,
      transitionReason: `safety-bypass:${bypassReason}`,
      confirmTicks,
      minimumHoldMs,
      updatedAt: nowMs
    };
  }

  if (candidatePolicy === previousCommitted) {
    return {
      ...previous,
      targetId,
      committedPolicy: previousCommitted,
      effectivePolicy: previousCommitted,
      candidatePolicy: '',
      candidateTicks: 0,
      switched: false,
      switchSameMode: false,
      suppressed: false,
      bypassed: false,
      bypassReason: '',
      transitionReason: 'committed-confirmed',
      confirmTicks,
      minimumHoldMs,
      updatedAt: nowMs
    };
  }

  const sameCandidate = policyName(previous.candidatePolicy) === candidatePolicy;
  const candidateTicks = sameCandidate ? Math.max(0, Number(previous.candidateTicks || 0)) + 1 : 1;
  const committedAt = Number.isFinite(Number(previous.committedAt))
    ? Math.max(0, Number(previous.committedAt))
    : nowMs;
  const holdElapsedMs = Math.max(0, nowMs - committedAt);
  const confirmed = candidateTicks >= confirmTicks;
  const holdSatisfied = holdElapsedMs >= minimumHoldMs;
  if (confirmed && holdSatisfied) {
    return {
      ...previous,
      targetId,
      committedPolicy: candidatePolicy,
      effectivePolicy: candidatePolicy,
      committedMode: recognizedMode,
      candidatePolicy: '',
      candidateTicks: 0,
      committedAt: nowMs,
      switched: true,
      switchSameMode: String(previous.committedMode || '') === recognizedMode,
      suppressed: false,
      bypassed: false,
      bypassReason: '',
      transitionReason: 'candidate-committed',
      confirmTicks,
      minimumHoldMs,
      holdElapsedMs,
      updatedAt: nowMs
    };
  }

  return {
    ...previous,
    targetId,
    committedPolicy: previousCommitted,
    effectivePolicy: previousCommitted,
    candidatePolicy,
    candidateTicks,
    committedAt,
    switched: false,
    switchSameMode: false,
    suppressed: true,
    bypassed: false,
    bypassReason: '',
    transitionReason: confirmed ? 'minimum-hold-pending' : 'candidate-confirmation-pending',
    confirmTicks,
    minimumHoldMs,
    holdElapsedMs,
    updatedAt: nowMs
  };
}

module.exports = {
  COMBAT_RESPONSE_POLICY_SHADOW_DEFAULTS: DEFAULTS,
  updateCombatResponsePolicyShadowCore
};
