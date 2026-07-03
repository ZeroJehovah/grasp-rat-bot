'use strict';

function leaveWaitDisplayCore(base, detail, formatDurationMs) {
  const summary = String(base || '').trim();
  const waitMs = Number(detail?.holdRemainingMs ?? detail?.reloginDelayMs ?? 0);
  if (!summary || !Number.isFinite(waitMs) || waitMs <= 0) return summary;
  return summary + '，等待' + formatDurationMs(waitMs);
}

function finalizeLeaveDisplayReasonCore(detail, leaveWaitDisplay) {
  if (!detail) return detail;
  const base = String(detail.summary || detail.exitSummary || detail.enemyLeaveSummary || detail.reason || '').trim();
  if (!base) return detail;
  detail.summary = base;
  detail.displayReason = leaveWaitDisplay(base, detail);
  return detail;
}

module.exports = {
  leaveWaitDisplayCore,
  finalizeLeaveDisplayReasonCore
};
