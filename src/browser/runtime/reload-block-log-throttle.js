'use strict';

function reloadBlockLogMinMs(cfg) {
  return Math.max(1000, Number(cfg?.exitAuditBlockedReloadLogMinMs || 5000) || 5000);
}

function reloadBlockSignature(reason, blocked) {
  const pendingIds = Array.isArray(blocked?.pendingIds) ? blocked.pendingIds.join(',') : '';
  return [
    String(reason || ''),
    Number(blocked?.pending || 0) || 0,
    pendingIds,
    Boolean(blocked?.sending),
    String(blocked?.lastError || '')
  ].join('|');
}

function reloadBlockLogDue(owner, cfg, reason, blocked, t = Date.now()) {
  if (!owner || typeof owner !== 'object') return true;
  const signature = reloadBlockSignature(reason, blocked);
  const previous = owner.lastBlockedReloadLog || null;
  if (!previous || previous.signature !== signature || t - Number(previous.at || 0) >= reloadBlockLogMinMs(cfg)) {
    owner.lastBlockedReloadLog = {
      at: t,
      signature,
      reason: String(reason || ''),
      suppressed: 0
    };
    return true;
  }
  owner.lastBlockedReloadLog = {
    ...previous,
    suppressed: Number(previous.suppressed || 0) + 1,
    lastSuppressedAt: t
  };
  return false;
}

function logBlockedReload(owner, cfg, reason, text, detail, logStatus) {
  if (reloadBlockLogDue(owner, cfg, reason, detail?.exitAuditFlush || detail?.importantLogFlush)) {
    logStatus(text, detail);
  }
}

module.exports = {
  reloadBlockLogMinMs,
  reloadBlockSignature,
  reloadBlockLogDue,
  logBlockedReload
};
