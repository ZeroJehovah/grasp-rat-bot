'use strict';

function pendingExitRetryMsCore(pending, options = {}) {
  const source = String(pending?.source || '');
  const retryFloorMs = Math.max(
    1000,
    Number(options.leaveRetryMinMs ?? options.leaveCommandTimeoutMs ?? 10000) || 10000
  );
  if (pending?.scope === 'offline' || source === 'offline') {
    return Math.max(retryFloorMs, Number(options.offlineLeaveRetryMs || options.combatLeaveRetryMs || 1000));
  }
  if (source === 'pursuit') {
    return Math.max(retryFloorMs, Number(options.pursuitLeaveRetryMs || options.combatLeaveRetryMs || 1000));
  }
  return Math.max(retryFloorMs, Number(options.combatLeaveRetryMs || options.pursuitLeaveRetryMs || 1000));
}

function pendingExitDisplayReasonCore(summary) {
  const base = String(summary || '退出请求已发送').trim();
  return base + '，等待退出确认，未退出会继续补发';
}

function clampSignedStep(value) {
  return Math.max(-1, Math.min(1, Math.round(Number(value) || 0)));
}

function summarizePendingExitCore(pending, options = {}) {
  if (!pending) return null;
  const t = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  const retryMs = Number.isFinite(Number(options.retryMs))
    ? Math.max(0, Math.round(Number(options.retryMs)))
    : pendingExitRetryMsCore(pending, options);
  const lastAttemptAt = Number(pending.lastAttemptAt || 0);
  const reloadConfirmation = options.reloadConfirmation || null;
  return {
    scope: pending.scope || '',
    source: pending.source || '',
    reason: pending.reason || '',
    summary: pending.summary || '',
    displayReason: pending.displayReason || '',
    at: Number(pending.at || 0),
    ageMs: pending.at ? Math.max(0, Math.round(t - Number(pending.at || t))) : 0,
    lastAttemptAt,
    lastAttemptAgeMs: lastAttemptAt ? Math.max(0, Math.round(t - lastAttemptAt)) : null,
    retryMs,
    retryRemainingMs: lastAttemptAt ? Math.max(0, Math.round(retryMs - (t - lastAttemptAt))) : 0,
    retryCount: Number(pending.retryCount || 0),
    leaveRequestPending: Boolean(pending.lastResult?.leaveRequestPending),
    reloadConfirmation: reloadConfirmation ? {
      required: Boolean(reloadConfirmation.required),
      requestedAt: Number(reloadConfirmation.requestedAt || 0),
      reloadedAt: Number(reloadConfirmation.reloadedAt || 0),
      restoredAfterReload: Boolean(reloadConfirmation.restoredAfterReload),
      ageAfterReloadMs: reloadConfirmation.reloadedAt ? Math.max(0, Math.round(t - Number(reloadConfirmation.reloadedAt || t))) : null,
      count: Number(reloadConfirmation.count || 0),
      reason: reloadConfirmation.reason || ''
    } : null,
    userId: pending.userId || null,
    combatCover: pending.combatCover ? {
      reason: pending.combatCover.reason || '',
      dx: clampSignedStep(pending.combatCover.dx),
      dy: clampSignedStep(pending.combatCover.dy),
      shoot: Boolean(pending.combatCover.shoot)
    } : null,
    lastError: pending.lastResult?.error || ''
  };
}

function leaveRequestHasHttp403Core(request) {
  if (!request || typeof request !== 'object') return false;
  const status = Number(request.status ?? request.statusCode ?? request.result?.status ?? request.result?.statusCode ?? NaN);
  if (status === 403) return true;
  const fields = [
    request.error,
    request.message,
    request.statusText,
    request.result?.error,
    request.result?.message,
    request.result?.statusText
  ];
  return fields.some(value => /(?:^|\D)403(?:\D|$)|forbidden/i.test(String(value || '')));
}

function leaveDetailHasHttp403Core(detail) {
  if (!detail || typeof detail !== 'object') return false;
  if (leaveRequestHasHttp403Core(detail) || leaveRequestHasHttp403Core(detail.lastLeaveRequest)) return true;
  return Array.isArray(detail.leaveRequests) && detail.leaveRequests.some(leaveRequestHasHttp403Core);
}

function latestLeaveRequest(detail) {
  if (!detail || typeof detail !== 'object') return null;
  if (detail.lastLeaveRequest) return detail.lastLeaveRequest;
  return Array.isArray(detail.leaveRequests) ? detail.leaveRequests[detail.leaveRequests.length - 1] : null;
}

function leaveDetailSucceededCore(detail) {
  if (!detail || typeof detail !== 'object') return false;
  if (!detail.attempted || detail.leaveRequestPending || detail.error || leaveDetailHasHttp403Core(detail)) return false;
  const request = latestLeaveRequest(detail);
  return !request || Boolean(request.completedAt || request.method || detail.method);
}

function defaultNormalizeReloadConfirmation(value) {
  return value && typeof value === 'object' && value.required ? value : null;
}

function leaveSuccessReloadConfirmationForDetailCore(detail, pending = null, t = Date.now(), options = {}) {
  const normalizeReloadConfirmation = typeof options.normalizeReloadConfirmation === 'function'
    ? options.normalizeReloadConfirmation
    : defaultNormalizeReloadConfirmation;
  if (!leaveDetailSucceededCore(detail) || leaveDetailHasHttp403Core(detail)) {
    return normalizeReloadConfirmation(pending?.reloadConfirmation, pending, t);
  }
  const existing = normalizeReloadConfirmation(detail.reloadConfirmation || pending?.reloadConfirmation, pending, t);
  const request = latestLeaveRequest(detail);
  return {
    required: true,
    reason: 'leave-success',
    leaveSucceededAt: Number(existing?.leaveSucceededAt || request?.completedAt || detail.at || t) || t,
    requestId: String(existing?.requestId || request?.requestId || ''),
    requestedAt: Number(existing?.requestedAt || 0) || 0,
    reloadedAt: Number(existing?.reloadedAt || 0) || 0,
    restoredAfterReload: Boolean(existing?.restoredAfterReload),
    count: Math.max(0, Math.round(Number(existing?.count || 0) || 0)),
    lastResult: existing?.lastResult || null,
    lastBlocked: existing?.lastBlocked || null
  };
}

function leaveSuccessReloadConfirmationSatisfiedCore(reloadConfirmation) {
  return Boolean(reloadConfirmation?.restoredAfterReload || Number(reloadConfirmation?.reloadedAt || 0) > 0);
}

function pendingExitWaitReasonCore(pending, confirmed = false) {
  const scope = String(pending?.scope || '');
  const source = String(pending?.source || '');
  if (confirmed) return scope === 'offline' ? 'offline-leave-wait' : 'enemy-leave-wait';
  if (scope === 'offline') return 'offline-leave';
  if (source === 'pursuit') return 'pursuit-leave-retry';
  return 'combat-leave-retry';
}

module.exports = {
  pendingExitRetryMsCore,
  pendingExitDisplayReasonCore,
  summarizePendingExitCore,
  leaveRequestHasHttp403Core,
  leaveDetailHasHttp403Core,
  leaveDetailSucceededCore,
  leaveSuccessReloadConfirmationForDetailCore,
  leaveSuccessReloadConfirmationSatisfiedCore,
  pendingExitWaitReasonCore
};
