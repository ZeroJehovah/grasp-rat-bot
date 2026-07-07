'use strict';

const {
  leaveDetailHasHttp403Core,
  leaveDetailSucceededCore,
  leaveResponseConfirmsExitCore
} = require('./pending-exit');
const {
  summarizeLeaveResponseCore
} = require('../shared/leave-response');

const CLASH_LEAVE_RESCUE_STAGE_ORDER = Object.freeze(['auto', 'direct', 'manual']);

function leaveCommandFailureMessageCore(value) {
  if (value === false) return 'leave request returned false';
  if (!value || typeof value !== 'object') return '';
  if (value.ok === false || value.success === false) {
    return value.message || value.error || 'leave request returned failure';
  }
  if (value.error && value.ok !== true && value.success !== true) {
    return value.message || value.error || 'leave request returned error';
  }
  const status = Number(value.status || value.statusCode || 0);
  if (status >= 400) return value.statusText || value.message || ('leave request HTTP ' + status);
  return '';
}

function summarizeLeaveCommandResultCore(value) {
  if (value === undefined) return { type: 'undefined' };
  if (value === null) return { type: 'null' };
  if (value === false || value === true) return { type: 'boolean', value: Boolean(value) };
  if (typeof value !== 'object') return { type: typeof value, value: String(value).slice(0, 200) };
  return {
    type: Array.isArray(value) ? 'array' : 'object',
    leaveConfirmed: leaveResponseConfirmsExitCore(value),
    ok: value.ok ?? null,
    success: value.success ?? null,
    status: value.status ?? value.statusCode ?? null,
    statusText: value.statusText || '',
    message: value.message || '',
    error: value.error || '',
    response: summarizeLeaveResponseCore(value)
  };
}

function leaveDetailFailedForClashRescueCore(detail, options = {}) {
  if (!options.clashLeaveRescueEnabled) return false;
  if (!detail || typeof detail !== 'object') return false;
  if (!detail.attempted || detail.leaveRequestPending) return false;
  if (detail.exitConfirmed) return false;
  const hasHttp403 = typeof options.leaveDetailHasHttp403 === 'function'
    ? options.leaveDetailHasHttp403(detail)
    : leaveDetailHasHttp403Core(detail);
  if (!detail.error && !hasHttp403) return false;
  const succeeded = typeof options.leaveDetailSucceeded === 'function'
    ? options.leaveDetailSucceeded(detail)
    : leaveDetailSucceededCore(detail);
  if (succeeded) return false;
  const hasHook = options.hasClashLeaveRescueHook;
  return typeof hasHook === 'function' ? Boolean(hasHook()) : Boolean(hasHook);
}

function clashLeaveRescueAttemptsCore(detail) {
  return Array.isArray(detail?.clashLeaveRescueAttempts)
    ? detail.clashLeaveRescueAttempts.filter(item => item && typeof item === 'object')
    : [];
}

function nextClashLeaveRescueStageCore(detail, options = {}) {
  const stages = new Set(clashLeaveRescueAttemptsCore(detail).map(item => String(item.stage || '')));
  const stageOrder = Array.isArray(options.stageOrder) && options.stageOrder.length
    ? options.stageOrder.map(item => String(item || '')).filter(Boolean)
    : ['auto', 'direct', 'manual'];
  for (const stage of stageOrder) {
    if (!stages.has(stage)) return stage;
  }
  return '';
}

function summarizeClashLeaveRescueResultCore(result, stage, error = '', options = {}) {
  const raw = result && typeof result === 'object' ? result : {};
  const t = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  return {
    stage,
    ok: Boolean(!error && raw.ok !== false),
    target: raw.target || '',
    group: raw.group || '',
    at: Number(raw.at || t) || t,
    durationMs: Math.max(0, Math.round(Number(raw.durationMs || 0) || 0)),
    switched: raw.switched ? {
      ok: Boolean(raw.switched.ok !== false),
      status: Number(raw.switched.status || 0) || 0
    } : null,
    closeConnections: raw.closeConnections ? {
      ok: Boolean(raw.closeConnections.ok !== false),
      status: Number(raw.closeConnections.status || 0) || 0,
      error: raw.closeConnections.error || ''
    } : null,
    error: error || raw.error || ''
  };
}

function clashLeaveRescueRetryDetailCore(detail, stage, options = {}) {
  const cloneForPendingExit = typeof options.cloneForPendingExit === 'function'
    ? options.cloneForPendingExit
    : value => value && typeof value === 'object' ? { ...value } : (value || {});
  const pendingExitDisplayReason = typeof options.pendingExitDisplayReason === 'function'
    ? options.pendingExitDisplayReason
    : summary => String(summary || '');
  const retryDetail = cloneForPendingExit(detail) || {};
  const t = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  retryDetail.at = t;
  retryDetail.attempted = false;
  retryDetail.method = '';
  retryDetail.error = '';
  retryDetail.leaveRequestPending = false;
  retryDetail.lastLeaveRequest = null;
  retryDetail.leaveRequests = [];
  retryDetail.pendingExitRetry = true;
  retryDetail.clashLeaveRescueRetry = true;
  retryDetail.clashLeaveRescueStage = stage;
  retryDetail.clashLeaveRescueAttempts = clashLeaveRescueAttemptsCore(detail);
  retryDetail.summary = detail?.summary || detail?.exitSummary || detail?.reason || '';
  retryDetail.displayReason = detail?.displayReason || pendingExitDisplayReason(retryDetail.summary);
  return retryDetail;
}

function resetClashLeaveRescueRoundCore(detail) {
  if (!detail || typeof detail !== 'object') return detail;
  detail.clashLeaveRescueAttempts = [];
  detail.clashLeaveRescue = null;
  detail.clashLeaveRescueStage = '';
  detail.clashLeaveRescueRetry = false;
  return detail;
}

module.exports = {
  CLASH_LEAVE_RESCUE_STAGE_ORDER,
  leaveCommandFailureMessageCore,
  summarizeLeaveCommandResultCore,
  leaveDetailFailedForClashRescueCore,
  clashLeaveRescueAttemptsCore,
  nextClashLeaveRescueStageCore,
  summarizeClashLeaveRescueResultCore,
  clashLeaveRescueRetryDetailCore,
  resetClashLeaveRescueRoundCore
};
