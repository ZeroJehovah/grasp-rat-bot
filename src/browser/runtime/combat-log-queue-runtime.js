'use strict';

const { safeStringify, safeJsonClone } = require('./runtime-utils');

function createCombatLogQueueRuntime(runtime = {}) {
  const {
    bot,
    cfg,
    storage = typeof localStorage !== 'undefined' ? localStorage : null,
    combatLogPendingEntriesKey,
    persistExitAuditLogEntry = () => {},
    removePersistedExitAuditLogs = () => {},
    unresolvedExitAuditLogCount = () => 0,
    restorePersistedExitAuditLogs = () => 0,
    restoreImportantLogsForRemote = () => 0,
    markImportantLogsRemoteSent = () => {},
    markImportantLogsRemoteError = () => {}
  } = runtime;
  const localStorage = storage;
  const COMBAT_LOG_PENDING_ENTRIES_KEY = combatLogPendingEntriesKey;

  function combatLogEntryFailureKey(entry) {
    if (!entry || typeof entry !== 'object') return '';
    return [
      entry.exitAuditLogId || '',
      entry.importantLogId || '',
      entry.combatId || '',
      entry.sequence ?? '',
      entry.type || '',
      entry.at || '',
      entry.source || ''
    ].map(value => String(value ?? '')).join('|');
  }

  function normalizeCombatLogFailedState(state = bot.combatLogging) {
    if (!state || typeof state !== 'object') return 0;
    if (!Array.isArray(state.failedEntryKeys)) state.failedEntryKeys = [];
    if (Number(state.failed || 0) > 0 && !state.failedEntryKeys.length && Array.isArray(state.pending) && state.pending.length) {
      const count = Math.min(state.pending.length, Math.max(0, Math.round(Number(state.failed || 0))));
      state.failedEntryKeys = state.pending.slice(0, count).map(combatLogEntryFailureKey).filter(Boolean);
    }
    if ((!Array.isArray(state.pending) || !state.pending.length) && !state.sending) {
      state.failedEntryKeys = [];
      state.failed = 0;
      return 0;
    }
    state.failedEntryKeys = Array.from(new Set(state.failedEntryKeys.filter(Boolean))).slice(-1000);
    state.failed = state.failedEntryKeys.length;
    return state.failed;
  }

  function markCombatLogEntriesFailed(entries) {
    const state = bot.combatLogging;
    if (!state || !Array.isArray(entries) || !entries.length) return 0;
    const keys = new Set(Array.isArray(state.failedEntryKeys) ? state.failedEntryKeys.filter(Boolean) : []);
    for (const entry of entries) {
      const key = combatLogEntryFailureKey(entry);
      if (key) keys.add(key);
    }
    state.failedEntryKeys = Array.from(keys).slice(-1000);
    state.failed = state.failedEntryKeys.length;
    return state.failed;
  }

  function markCombatLogEntriesSent(entries) {
    const state = bot.combatLogging;
    if (!state || !Array.isArray(entries) || !entries.length) return 0;
    if (!Array.isArray(state.failedEntryKeys) || !state.failedEntryKeys.length) return normalizeCombatLogFailedState(state);
    const sentKeys = new Set(entries.map(combatLogEntryFailureKey).filter(Boolean));
    if (!sentKeys.size) return normalizeCombatLogFailedState(state);
    state.failedEntryKeys = state.failedEntryKeys.filter(key => !sentKeys.has(key));
    return normalizeCombatLogFailedState(state);
  }

  function combatLogPersistentEntryKey(entry) {
    return combatLogEntryFailureKey(entry);
  }

  function shouldPersistCombatLogPendingEntry(entry) {
    return Boolean(entry && typeof entry === 'object'
      && !entry.criticalLog
      && !entry.exitAuditLogId
      && !entry.importantLog
      && entry.type !== 'important-log');
  }

  function readPersistedCombatLogPendingEntries() {
    try {
      const raw = localStorage.getItem(COMBAT_LOG_PENDING_ENTRIES_KEY) || '[]';
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(item => item && typeof item === 'object') : [];
    } catch (_) {
      return [];
    }
  }

  function combatLogMaxPersistedEntries() {
    return Math.max(20, Number(cfg.combatLogMaxPersistedEntries || 160) || 160);
  }

  function writePersistedCombatLogPendingEntries(entries) {
    try {
      const list = Array.isArray(entries)
        ? entries.filter(shouldPersistCombatLogPendingEntry)
        : [];
      const byKey = new Map();
      for (const entry of list) {
        const key = combatLogPersistentEntryKey(entry);
        if (key) byKey.set(key, safeJsonClone(entry) || entry);
      }
      const persisted = Array.from(byKey.values()).slice(-combatLogMaxPersistedEntries());
      localStorage.setItem(COMBAT_LOG_PENDING_ENTRIES_KEY, safeStringify(persisted));
      return persisted.length;
    } catch (_) {}
    return 0;
  }

  function persistCombatLogPendingEntries(options = {}) {
    const state = bot.combatLogging || {};
    const force = Boolean(options?.force);
    const t = Date.now();
    if (!force) {
      const minMs = Math.max(1000, Number(cfg.combatLogPendingPersistMinMs || 5000) || 5000);
      if (state.lastPendingPersistAt && t - Number(state.lastPendingPersistAt || 0) < minMs) {
        state.pendingPersistenceDirty = true;
        return readPersistedCombatLogPendingEntries().length;
      }
    }
    const existing = readPersistedCombatLogPendingEntries();
    const pending = Array.isArray(state.pending) ? state.pending : [];
    const count = writePersistedCombatLogPendingEntries(existing.concat(pending));
    state.lastPendingPersistAt = t;
    state.pendingPersistenceDirty = false;
    return count;
  }

  function removePersistedCombatLogPendingEntries(entries) {
    const keys = new Set((Array.isArray(entries) ? entries : [entries])
      .map(combatLogPersistentEntryKey)
      .filter(Boolean));
    if (!keys.size) return;
    const remaining = readPersistedCombatLogPendingEntries()
      .filter(entry => !keys.has(combatLogPersistentEntryKey(entry)));
    writePersistedCombatLogPendingEntries(remaining);
  }

  function configureCombatLogging(options = {}) {
    const next = options && typeof options === 'object' ? options : {};
    if (Object.prototype.hasOwnProperty.call(next, 'endpoint')) {
      const endpoint = String(next.endpoint || 'http://127.0.0.1:18765/combat-log');
      cfg.combatLogEndpoint = endpoint;
      cfg.combatLogEndpointConfigured = true;
      bot.combatLogging.endpoint = endpoint;
      bot.combatLogging.endpointConfigured = true;
    }
    if (Object.prototype.hasOwnProperty.call(next, 'enabled')) {
      const enabled = Boolean(next.enabled) && Boolean(cfg.combatLogEndpointConfigured);
      cfg.combatLoggingEnabled = enabled;
      bot.combatLogging.enabled = enabled;
    }
    if (!bot.combatLogging.enabled) {
      bot.combatLogging.active = false;
      bot.combatLogging.combatId = '';
    }
    restorePersistedCombatLogPendingEntries();
    restorePersistedExitAuditLogs();
    restoreImportantLogsForRemote();
    if (Array.isArray(bot.combatLogging?.pending) && bot.combatLogging.pending.length) {
      flushCombatLogs(true);
    }
    return summarizeCombatLoggingStatus();
  }

  function summarizeCombatLoggingStatus() {
    const state = bot.combatLogging || {};
    const t = Date.now();
    const exitAuditPending = unresolvedExitAuditLogCount();
    const failed = normalizeCombatLogFailedState(state);
    return {
      enabled: Boolean(state.enabled),
      endpoint: String(state.endpoint || ''),
      endpointConfigured: Boolean(state.endpointConfigured || cfg.combatLogEndpointConfigured),
      active: Boolean(state.active),
      combatId: state.combatId || '',
      startedAt: Number(state.startedAt || 0),
      activeAgeMs: state.startedAt ? Math.max(0, Math.round(t - Number(state.startedAt || t))) : 0,
      lastCombatAgeMs: state.lastCombatAt ? Math.max(0, Math.round(t - Number(state.lastCombatAt || t))) : null,
      pending: Array.isArray(state.pending) ? state.pending.length : 0,
      persistedPending: readPersistedCombatLogPendingEntries().length,
      preBuffer: Array.isArray(state.preBuffer) ? state.preBuffer.length : 0,
      exitAuditPending,
      exitAuditBlocking: exitAuditPending > 0,
      dropped: Number(state.dropped || 0),
      sent: Number(state.sent || 0),
      failed,
      sending: Boolean(state.sending),
      lastError: state.lastError || '',
      lastSkipReason: state.lastSkipReason || '',
      lastOkAgeMs: state.lastOkAt ? Math.max(0, Math.round(t - Number(state.lastOkAt || t))) : null
    };
  }

  function restorePersistedCombatLogPendingEntries() {
    const state = bot.combatLogging;
    if (!state || !state.endpoint) return 0;
    if (!Array.isArray(state.pending)) state.pending = [];
    const restored = readPersistedCombatLogPendingEntries();
    let added = 0;
    const existing = new Set(state.pending.map(combatLogPersistentEntryKey).filter(Boolean));
    for (const entry of restored) {
      const key = combatLogPersistentEntryKey(entry);
      if (!key || existing.has(key)) continue;
      state.pending.unshift(entry);
      existing.add(key);
      added += 1;
    }
    state.restoredPending = added;
    if (added) flushCombatLogs(true);
    return added;
  }

  function queueCombatLogEntry(entry, options = {}) {
    const state = bot.combatLogging;
    const snapshot = safeJsonClone(entry) || { at: Date.now(), type: 'combat-log-clone-error', originalType: entry?.type || '' };
    const critical = Boolean(options.critical || snapshot.exitAuditLogId);
    const important = Boolean(options.important || snapshot.importantLog || snapshot.type === 'important-log');
    if ((!state.enabled && !critical && !important) || !state.endpoint) return false;
    if (!Array.isArray(state.pending)) state.pending = [];
    const queued = {
      ...snapshot,
      combatId: important ? (snapshot.combatId || entry.combatId || state.combatId || '') : (state.combatId || snapshot.combatId || entry.combatId || ''),
      sequence: ++state.sequence,
      criticalLog: Boolean(snapshot.criticalLog || critical),
      importantLog: Boolean(snapshot.importantLog || important)
    };
    if (critical && !queued.exitAuditLogId) {
      queued.exitAuditLogId = 'critical:' + queued.type + ':' + queued.at + ':' + queued.sequence;
    }
    state.pending.push(queued);
    if (queued.type === 'combat-frame') {
      state.lastQueuedFrameAt = Number(queued.at || Date.now()) || Date.now();
    }
    if (queued.exitAuditLogId) {
      if (!Array.isArray(state.pendingExitAuditIds)) state.pendingExitAuditIds = [];
      if (!state.pendingExitAuditIds.includes(queued.exitAuditLogId)) state.pendingExitAuditIds.push(queued.exitAuditLogId);
      persistExitAuditLogEntry(queued);
    }
    const maxPending = Math.max(50, Number(cfg.combatLogMaxPendingEntries) || 1000);
    while (state.pending.length > maxPending) {
      const dropIndex = state.pending.findIndex(item => !item?.criticalLog && !item?.exitAuditLogId && !item?.importantLog);
      if (dropIndex < 0) break;
      state.pending.splice(dropIndex, 1);
      state.dropped += 1;
    }
    if (shouldPersistCombatLogPendingEntry(queued)) {
      state.pendingPersistenceDirty = true;
      state.lastPendingPersistenceQueuedAt = Date.now();
    }
    return true;
  }

  function flushCombatLogs(force = false) {
    const state = bot.combatLogging;
    const hasCritical = Array.isArray(state?.pending) && state.pending.some(entry => entry?.criticalLog || entry?.exitAuditLogId);
    const hasImportant = Array.isArray(state?.pending) && state.pending.some(entry => entry?.importantLog || entry?.type === 'important-log');
    if ((!state?.enabled && !hasCritical && !hasImportant) || !state.endpoint || state.sending) return false;
    if (!Array.isArray(state.pending) || !state.pending.length) return false;
    const t = Date.now();
    if (!force && t - Number(state.lastFlushAt || 0) < Math.max(250, Number(cfg.combatLogFlushMs) || 1000)) return false;
    if (typeof fetch !== 'function') {
      state.lastError = 'fetch unavailable';
      markCombatLogEntriesFailed(state.pending);
      return false;
    }
    state.lastFlushAt = t;
    const configuredBatchMax = Math.max(1, Number(cfg.combatLogBatchMaxEntries) || 12);
    const batchSize = force
      ? Math.min(state.pending.length, configuredBatchMax * 4)
      : configuredBatchMax;
    const entries = state.pending.splice(0, batchSize);
    const exitAuditIds = entries.map(entry => entry?.exitAuditLogId).filter(Boolean);
    const importantLogIds = entries.map(entry => entry?.importantLogId).filter(Boolean);
    if (exitAuditIds.length) {
      if (!Array.isArray(state.sendingExitAuditIds)) state.sendingExitAuditIds = [];
      for (const id of exitAuditIds) {
        if (!state.sendingExitAuditIds.includes(id)) state.sendingExitAuditIds.push(id);
      }
      if (Array.isArray(state.pendingExitAuditIds)) {
        state.pendingExitAuditIds = state.pendingExitAuditIds.filter(id => !exitAuditIds.includes(id));
      }
    }
    const payload = {
      combatId: entries[0]?.combatId || state.combatId || '',
      startedAt: state.startedAt || entries[0]?.at || t,
      version: cfg.version,
      sourceHash: cfg.sourceHash,
      entries
    };
    state.sending = true;
    const body = safeStringify(payload);
    let sentOk = false;
    Promise.resolve()
      .then(() => fetch(state.endpoint, {
        method: 'POST',
        mode: 'cors',
        cache: 'no-store',
        keepalive: body.length < 60000,
        headers: { 'content-type': 'application/json' },
        body
      }))
      .then(res => {
        if (!res || !res.ok) throw new Error('combat log POST failed: HTTP ' + (res?.status || 0));
        sentOk = true;
        state.sent += entries.length;
        state.lastOkAt = Date.now();
        state.lastError = '';
        markCombatLogEntriesSent(entries);
        if (exitAuditIds.length) removePersistedExitAuditLogs(exitAuditIds);
        removePersistedCombatLogPendingEntries(entries);
        if (importantLogIds.length) markImportantLogsRemoteSent(importantLogIds, state.lastOkAt);
      })
      .catch(err => {
        markCombatLogEntriesFailed(entries);
        state.lastError = err?.message || String(err);
        if (importantLogIds.length) markImportantLogsRemoteError(importantLogIds, state.lastError, Date.now());
        state.pending = entries.concat(Array.isArray(state.pending) ? state.pending : []);
        if (exitAuditIds.length) {
          if (!Array.isArray(state.pendingExitAuditIds)) state.pendingExitAuditIds = [];
          for (const id of exitAuditIds) {
            if (!state.pendingExitAuditIds.includes(id)) state.pendingExitAuditIds.push(id);
          }
        }
        const maxPending = Math.max(50, Number(cfg.combatLogMaxPendingEntries) || 1000);
        while (state.pending.length > maxPending) {
          const dropIndex = state.pending.findIndex(item => !item?.criticalLog && !item?.exitAuditLogId && !item?.importantLog);
          if (dropIndex < 0) break;
          state.pending.splice(dropIndex, 1);
          state.dropped += 1;
        }
        persistCombatLogPendingEntries();
      })
      .finally(() => {
        if (exitAuditIds.length && Array.isArray(state.sendingExitAuditIds)) {
          state.sendingExitAuditIds = state.sendingExitAuditIds.filter(id => !exitAuditIds.includes(id));
        }
        state.sending = false;
        if (sentOk && (force || state.pending.length >= configuredBatchMax) && state.pending.length) {
          flushCombatLogs(force);
        }
      });
    return true;
  }

  return {
    combatLogEntryFailureKey,
    normalizeCombatLogFailedState,
    markCombatLogEntriesFailed,
    markCombatLogEntriesSent,
    combatLogPersistentEntryKey,
    shouldPersistCombatLogPendingEntry,
    readPersistedCombatLogPendingEntries,
    combatLogMaxPersistedEntries,
    writePersistedCombatLogPendingEntries,
    persistCombatLogPendingEntries,
    removePersistedCombatLogPendingEntries,
    configureCombatLogging,
    summarizeCombatLoggingStatus,
    restorePersistedCombatLogPendingEntries,
    queueCombatLogEntry,
    flushCombatLogs
  };
}

module.exports = {
  createCombatLogQueueRuntime
};
