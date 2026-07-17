'use strict';

const DEFAULT_OUTSIDE_CENTER_IDLE_EXIT_MS = 180000;

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function pointRadiusCore(point) {
  const x = finiteNumber(point?.x);
  const y = finiteNumber(point?.y);
  return x === null || y === null ? null : Math.hypot(x, y);
}

function outsideCenterIdleActionCore(action) {
  if (!action) return false;
  const kind = String(action.kind || '');
  const reason = String(action.reason || '');
  if (reason === 'outside-center-profit-wait' || reason === 'single-coin-bait-hold') return true;
  return kind === 'wait' && ['dynamic-profit-threshold-wait', 'no-profitable-candidate'].includes(reason);
}

function updateOutsideCenterIdleCore(previous, input = {}, options = {}) {
  const nowMs = finiteNumber(input.nowMs) ?? Date.now();
  const centerRadiusCm = Math.max(0, finiteNumber(options.centerRadiusCm) ?? 0);
  const timeoutMs = Math.max(1000, finiteNumber(options.timeoutMs) ?? DEFAULT_OUTSIDE_CENTER_IDLE_EXIT_MS);
  const selfRadiusCm = pointRadiusCore(input.self);
  const outside = Boolean(centerRadiusCm > 0 && selfRadiusCm !== null && selfRadiusCm > centerRadiusCm);
  const idle = outside && outsideCenterIdleActionCore(input.action);
  if (!idle) {
    return {
      state: null,
      shouldExit: false,
      resetReason: !outside ? 'inside-center' : 'protected-or-active-action',
      summary: {
        active: false,
        startedAt: 0,
        ageMs: 0,
        timeoutMs,
        selfRadiusCm: selfRadiusCm === null ? null : Math.round(selfRadiusCm),
        outsideByCm: selfRadiusCm === null ? null : Math.max(0, Math.round(selfRadiusCm - centerRadiusCm)),
        actionReason: String(input.action?.reason || ''),
        resetReason: !outside ? 'inside-center' : 'protected-or-active-action'
      }
    };
  }
  const sameSession = !previous?.sessionId || !input.sessionId || String(previous.sessionId) === String(input.sessionId);
  const startedAt = sameSession && Number(previous?.startedAt || 0) > 0 ? Number(previous.startedAt) : nowMs;
  const ageMs = Math.max(0, nowMs - startedAt);
  const state = {
    active: true,
    sessionId: String(input.sessionId || previous?.sessionId || ''),
    startedAt,
    lastSeenAt: nowMs,
    timeoutMs,
    selfRadiusCm: Math.round(selfRadiusCm),
    outsideByCm: Math.max(0, Math.round(selfRadiusCm - centerRadiusCm)),
    actionReason: String(input.action?.reason || '')
  };
  return {
    state,
    shouldExit: ageMs >= timeoutMs,
    resetReason: '',
    summary: {
      ...state,
      ageMs,
      resetReason: ''
    }
  };
}

module.exports = {
  DEFAULT_OUTSIDE_CENTER_IDLE_EXIT_MS,
  outsideCenterIdleActionCore,
  pointRadiusCore,
  updateOutsideCenterIdleCore
};
