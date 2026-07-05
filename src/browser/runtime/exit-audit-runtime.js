'use strict';

const { safeStringify, safeJsonClone } = require('./runtime-utils');
const {
  pendingExitRetryMsCore: pendingExitRetryMsForExitAuditCore,
  summarizePendingExitCore: summarizePendingExitForExitAuditCore
} = require('./pending-exit');

function createExitAuditRuntime(runtime = {}) {
  const {
    bot,
    cfg,
    storage = typeof localStorage !== 'undefined' ? localStorage : null,
    exitAuditPendingLogsKey,
    normalizePendingExitReloadConfirmationCore = value => value,
    readImportantLogsStore = () => ({ events: [] }),
    restoreImportantLogsForRemote = () => 0,
    noteImportantSessionExit = () => null,
    getCurrentUserId = () => null,
    snapshotLoginGateStatus = () => null,
    summarizeControl = () => null,
    queueCombatLogEntry = () => false,
    flushCombatLogs = () => false,
    combatLogSelfSummary = () => null,
    combatLogRuntimeSummary = () => null,
    combatLogGlobalStateSummary = () => null
  } = runtime;
  const localStorage = storage;
  const EXIT_AUDIT_PENDING_LOGS_KEY = exitAuditPendingLogsKey;

  function readPersistedExitAuditLogs() {
    try {
      const raw = localStorage.getItem(EXIT_AUDIT_PENDING_LOGS_KEY) || '[]';
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(item => item && typeof item === 'object') : [];
    } catch (_) {
      return [];
    }
  }

  function writePersistedExitAuditLogs(entries) {
    try {
      const list = Array.isArray(entries) ? entries.filter(item => item && typeof item === 'object') : [];
      localStorage.setItem(EXIT_AUDIT_PENDING_LOGS_KEY, safeStringify(list.slice(-250)));
    } catch (_) {}
  }

  function persistExitAuditLogEntry(entry) {
    if (!entry?.exitAuditLogId) return;
    const existing = readPersistedExitAuditLogs();
    if (!existing.some(item => item.exitAuditLogId === entry.exitAuditLogId)) {
      existing.push(safeJsonClone(entry) || entry);
      writePersistedExitAuditLogs(existing);
    }
  }

  function removePersistedExitAuditLogs(ids) {
    const idSet = new Set((Array.isArray(ids) ? ids : [ids]).filter(Boolean));
    if (!idSet.size) return;
    const remaining = readPersistedExitAuditLogs().filter(item => !idSet.has(item.exitAuditLogId));
    writePersistedExitAuditLogs(remaining);
  }

  function pendingExitAuditLogIds() {
    const state = bot.combatLogging || {};
    if (!state.endpoint) return [];
    const ids = new Set();
    for (const entry of Array.isArray(state.pending) ? state.pending : []) {
      if (entry?.exitAuditLogId) ids.add(entry.exitAuditLogId);
    }
    for (const id of Array.isArray(state.pendingExitAuditIds) ? state.pendingExitAuditIds : []) {
      if (id) ids.add(id);
    }
    for (const id of Array.isArray(state.sendingExitAuditIds) ? state.sendingExitAuditIds : []) {
      if (id) ids.add(id);
    }
    for (const entry of readPersistedExitAuditLogs()) {
      if (entry?.exitAuditLogId) ids.add(entry.exitAuditLogId);
    }
    return Array.from(ids);
  }

  function unresolvedExitAuditLogCount() {
    return pendingExitAuditLogIds().length;
  }

  function exitAuditFlushPending() {
    return unresolvedExitAuditLogCount() > 0;
  }

  function exitAuditFlushBlockDetail(reason) {
    const state = bot.combatLogging || {};
    return {
      blocked: true,
      reason: String(reason || ''),
      pending: unresolvedExitAuditLogCount(),
      pendingIds: pendingExitAuditLogIds().slice(0, 12),
      sending: Boolean(state.sending),
      endpoint: String(state.endpoint || cfg.combatLogEndpoint || ''),
      lastError: state.lastError || '',
      lastOkAt: Number(state.lastOkAt || 0)
    };
  }

  function pendingImportantSessionEndLogEvents() {
    const state = bot.combatLogging || {};
    if (!state.endpoint) return [];
    const store = readImportantLogsStore();
    return store.events
      .filter(event => event?.importantLogId && event.importantType === 'session-end' && !event.remoteSentAt);
  }

  function importantSessionEndFlushPending() {
    return pendingImportantSessionEndLogEvents().length > 0;
  }

  function importantSessionEndFlushBlockDetail(reason) {
    restoreImportantLogsForRemote();
    flushCombatLogs(true);
    const state = bot.combatLogging || {};
    const pending = pendingImportantSessionEndLogEvents();
    return {
      blocked: true,
      reason: String(reason || ''),
      pending: pending.length,
      pendingIds: pending.map(event => event.importantLogId).slice(0, 12),
      sending: Boolean(state.sending),
      endpoint: String(state.endpoint || cfg.combatLogEndpoint || ''),
      lastError: state.lastError || bot.importantLogging?.lastRemoteError || '',
      lastOkAt: Number(state.lastOkAt || 0)
    };
  }

  function closeCurrentImportantSessionBeforeLogin(reason = 'login-before-session-end') {
    const session = bot.session || {};
    if (!session.startedAt || session.exitAt) return null;
    const t = Number(session.missingSince || 0) || Date.now();
    return noteImportantSessionExit(reason, bot.lastSelf, t, {
      exitSummary: '重新登录前上一局已不可用，按登录前收口'
    });
  }

  function closeCurrentImportantSessionBeforeReload(reason = 'reload') {
    const session = bot.session || {};
    if (!session.startedAt || session.exitAt) return null;
    const t = Number(session.missingSince || 0) || Date.now();
    return noteImportantSessionExit('reload-before-session-end:' + String(reason || 'reload'), bot.lastSelf, t, {
      exitSummary: '刷新页面前上一局已不可用，按刷新前收口'
    });
  }

  function restorePersistedExitAuditLogs() {
    const state = bot.combatLogging;
    if (!state || !state.endpoint) return 0;
    if (!Array.isArray(state.pending)) state.pending = [];
    const restored = readPersistedExitAuditLogs();
    let added = 0;
    const existing = new Set(state.pending.map(entry => entry?.exitAuditLogId).filter(Boolean));
    for (const entry of restored) {
      if (!entry?.exitAuditLogId || existing.has(entry.exitAuditLogId)) continue;
      state.pending.unshift(entry);
      existing.add(entry.exitAuditLogId);
      added += 1;
    }
    if (!Array.isArray(state.pendingExitAuditIds)) state.pendingExitAuditIds = [];
    for (const entry of state.pending) {
      if (entry?.exitAuditLogId && !state.pendingExitAuditIds.includes(entry.exitAuditLogId)) {
        state.pendingExitAuditIds.push(entry.exitAuditLogId);
      }
    }
    bot.exitAudit.restored = added;
    if (added) flushCombatLogs(true);
    return added;
  }

  function newExitAuditId(source, reason) {
    bot.exitAudit.sequence = Number(bot.exitAudit.sequence || 0) + 1;
    const clean = String(source || 'exit').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'exit';
    const why = String(reason || '').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'reason';
    return clean + '-' + Date.now().toString(36) + '-' + bot.exitAudit.sequence + '-' + why;
  }

  function newExitAuditRequestId(exitAuditId) {
    bot.exitAudit.requestSequence = Number(bot.exitAudit.requestSequence || 0) + 1;
    return String(exitAuditId || 'exit') + '-req-' + bot.exitAudit.requestSequence;
  }

  function ensureExitAuditDetail(detail, meta = {}) {
    if (!detail || typeof detail !== 'object') return null;
    const source = String(meta.source || detail.exitAuditSource || detail.source || detail.reason || 'exit');
    const reason = String(meta.reason || detail.reason || '');
    if (!detail.exitAuditId) detail.exitAuditId = newExitAuditId(source, reason);
    if (!detail.exitTriggeredAt) detail.exitTriggeredAt = Number(detail.at || Date.now());
    detail.exitAuditSource = source;
    detail.exitAuditScope = meta.scope || detail.exitAuditScope || '';
    return detail.exitAuditId;
  }

  function exitAuditSelfSummary(selfLike) {
    return combatLogSelfSummary(selfLike || bot.lastSelf || null);
  }

  function recordExitAuditEvent(kind, detail = {}, extra = {}) {
    const state = bot.combatLogging;
    if (!state || !state.endpoint) return false;
    const auditId = ensureExitAuditDetail(detail, extra);
    const t = Number(extra.at || Date.now());
    const entry = {
      type: 'exit-audit',
      auditKind: kind,
      exitAuditId: auditId,
      exitAuditLogId: String(auditId || 'exit') + ':' + kind + ':' + t + ':' + (Number(bot.exitAudit.requestSequence || 0) || 0),
      at: t,
      version: cfg.version,
      sourceHash: cfg.sourceHash,
      injectedBy: cfg.injectedBy,
      url: location.href,
      visibilityState: document.visibilityState || '',
      scope: extra.scope || detail.exitAuditScope || '',
      source: extra.source || detail.exitAuditSource || '',
      reason: extra.reason || detail.reason || '',
      summary: detail.summary || detail.exitSummary || detail.enemyLeaveSummary || '',
      displayReason: detail.displayReason || '',
      triggeredAt: Number(detail.exitTriggeredAt || detail.at || t),
      confirmedAt: Number(extra.confirmedAt || detail.exitConfirmedAt || 0),
      successDurationMs: extra.confirmedAt || detail.exitConfirmedAt
        ? Math.max(0, Math.round(Number(extra.confirmedAt || detail.exitConfirmedAt) - Number(detail.exitTriggeredAt || detail.at || t)))
        : 0,
      currentUserId: getCurrentUserId() || null,
      self: exitAuditSelfSummary(extra.self || detail.self || detail.injury?.self || null),
      target: detail.target || extra.target || null,
      injury: detail.injury || extra.injury || null,
      pursuit: detail.pursuit || extra.pursuit || null,
      combat: detail.combat || extra.combat || null,
      offlineSafety: detail.offlineSafety || extra.offlineSafety || null,
      pendingExit: (() => {
        const pendingExitSummaryPending = bot.pendingExit;
        if (!pendingExitSummaryPending) return null;
        const pendingExitSummaryNow = Date.now();
        const pendingExitSummaryReload = normalizePendingExitReloadConfirmationCore(pendingExitSummaryPending.reloadConfirmation, pendingExitSummaryPending, pendingExitSummaryNow);
        return summarizePendingExitForExitAuditCore(pendingExitSummaryPending, {
          nowMs: pendingExitSummaryNow,
          retryMs: pendingExitRetryMsForExitAuditCore(pendingExitSummaryPending, {
            leaveRetryMinMs: cfg.leaveRetryMinMs,
            leaveCommandTimeoutMs: cfg.leaveCommandTimeoutMs,
            offlineLeaveRetryMs: cfg.offlineLeaveRetryMs,
            combatLeaveRetryMs: cfg.combatLeaveRetryMs,
            pursuitLeaveRetryMs: cfg.pursuitLeaveRetryMs
          }),
          reloadConfirmation: pendingExitSummaryReload
        });
      })(),
      loginSnapshotGate: snapshotLoginGateStatus(),
      request: extra.request || null,
      leave: {
        attempted: Boolean(detail.attempted),
        method: detail.method || '',
        error: detail.error || '',
        exitPending: Boolean(detail.exitPending),
        exitConfirmed: Boolean(detail.exitConfirmed),
        pendingLoginSuppressUntil: detail.pendingLoginSuppressUntil || 0,
        pendingLoginSuppressDelayMs: detail.pendingLoginSuppressDelayMs || 0,
        pendingLoginSuppressReason: detail.pendingLoginSuppressReason || '',
        reloginUntil: detail.reloginUntil || 0,
        reloginDelayMs: detail.reloginDelayMs || 0,
        holdRemainingMs: detail.holdRemainingMs || 0
      },
      confirmation: extra.confirmation || detail.exitConfirmation || null,
      control: summarizeControl(),
      runtime: combatLogRuntimeSummary(t),
      globalState: combatLogGlobalStateSummary()
    };
    bot.exitAudit.lastEvent = {
      kind,
      exitAuditId: auditId,
      at: t,
      reason: entry.reason,
      error: entry.leave.error
    };
    const queued = queueCombatLogEntry(entry, { critical: true });
    if (queued) flushCombatLogs(true);
    return queued;
  }

  return {
    readPersistedExitAuditLogs,
    writePersistedExitAuditLogs,
    persistExitAuditLogEntry,
    removePersistedExitAuditLogs,
    pendingExitAuditLogIds,
    unresolvedExitAuditLogCount,
    exitAuditFlushPending,
    exitAuditFlushBlockDetail,
    pendingImportantSessionEndLogEvents,
    importantSessionEndFlushPending,
    importantSessionEndFlushBlockDetail,
    closeCurrentImportantSessionBeforeLogin,
    closeCurrentImportantSessionBeforeReload,
    restorePersistedExitAuditLogs,
    newExitAuditId,
    newExitAuditRequestId,
    ensureExitAuditDetail,
    exitAuditSelfSummary,
    recordExitAuditEvent
  };
}

module.exports = {
  createExitAuditRuntime
};
