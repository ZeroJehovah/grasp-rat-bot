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

module.exports = {
  pendingExitRetryMsCore,
  pendingExitDisplayReasonCore,
  summarizePendingExitCore
};
