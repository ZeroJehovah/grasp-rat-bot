'use strict';

const fs = require('fs');
const path = require('path');
const {
  parseTargetWhitelistNames,
  parseTargetWhitelistUserIds,
  targetIsWhitelisted,
  targetWhitelistNameSet,
  targetWhitelistUserIdSet
} = require('../../shared/target-whitelist');
const {
  fetchWithTimeout,
  readResponseBody,
  redactSecrets
} = require('./session-client');

const DEFAULT_TARGET_WHITELIST_URL = 'https://raw.githubusercontent.com/ZeroJehovah/grasp-rat-bot/main/dist/target-whitelist.json';
const DEFAULT_LOCAL_TARGET_WHITELIST_FILE = path.resolve(__dirname, '../../..', 'dist', 'target-whitelist.json');

function readJsonFile(file) {
  const resolved = path.resolve(String(file || ''));
  const text = fs.readFileSync(resolved, 'utf8');
  return { json: JSON.parse(text), text, file: resolved };
}

function summarizeSource(result) {
  if (!result) return null;
  const nameCount = Array.isArray(result.names) ? result.names.length : 0;
  const userIdCount = Array.isArray(result.userIds) ? result.userIds.length : 0;
  return {
    source: result.source || '',
    url: result.url || '',
    file: result.file || '',
    count: nameCount + userIdCount,
    nameCount,
    userIdCount,
    ok: result.ok !== false,
    error: result.error || ''
  };
}

function parseWhitelistEntries(payload, maxEntries) {
  return {
    names: parseTargetWhitelistNames(payload, maxEntries),
    userIds: parseTargetWhitelistUserIds(payload, maxEntries)
  };
}

function createBrowserlessTargetWhitelist(options = {}) {
  const maxNamesRaw = Number(options.maxNames ?? options.targetWhitelistMaxNames ?? 100);
  const maxNames = Math.max(0, Math.round(Number.isFinite(maxNamesRaw) ? maxNamesRaw : 100));
  const url = String(options.url ?? options.targetWhitelistUrl ?? DEFAULT_TARGET_WHITELIST_URL).trim();
  const file = String(options.file ?? options.targetWhitelistFile ?? DEFAULT_LOCAL_TARGET_WHITELIST_FILE).trim();
  const timeoutMs = Math.max(1, Number(options.timeoutMs ?? options.targetWhitelistTimeoutMs ?? 7000) || 7000);
  const fetchImpl = options.fetchImpl;
  const fetchWithTimeoutImpl = options.fetchWithTimeout || fetchWithTimeout;
  const localAddress = options.localAddress || options.sourceIp || '';
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const state = {
    url,
    file,
    names: [],
    nameSet: new Set(),
    userIds: [],
    userIdSet: new Set(),
    loaded: false,
    lastFetchAt: 0,
    lastOkAt: 0,
    lastErrorAt: 0,
    lastError: '',
    lastReason: 'not-loaded',
    lastSource: '',
    sources: []
  };

  function applyEntries(entries, source, detail = {}) {
    state.names = entries.names.slice();
    state.nameSet = targetWhitelistNameSet(entries.names, maxNames);
    state.userIds = entries.userIds.slice();
    state.userIdSet = targetWhitelistUserIdSet(entries.userIds, maxNames);
    state.loaded = true;
    state.lastOkAt = now();
    state.lastError = '';
    state.lastErrorAt = 0;
    state.lastReason = String(detail.reason || source || 'loaded');
    state.lastSource = source;
  }

  function recordFailure(source, error, detail = {}) {
    const message = error?.message || String(error || 'unknown error');
    state.lastError = message;
    state.lastErrorAt = now();
    state.lastReason = String(detail.reason || `${source}-failed`);
    state.sources.push(summarizeSource({
      ok: false,
      source,
      url: detail.url || '',
      file: detail.file || '',
      error: message
    }));
  }

  async function loadLocal(reason = 'local') {
    if (!file) return null;
    try {
      const payload = readJsonFile(file);
      const entries = parseWhitelistEntries(payload.json, maxNames);
      const result = { ok: true, source: 'local-file', file: payload.file, ...entries };
      state.sources.push(summarizeSource(result));
      if (entries.names.length || entries.userIds.length || !state.loaded) applyEntries(entries, 'local-file', { reason });
      return result;
    } catch (err) {
      recordFailure('local-file', err, { file, reason: `${reason}-failed` });
      return { ok: false, source: 'local-file', file, error: err?.message || String(err) };
    }
  }

  async function loadRemote(reason = 'remote') {
    if (!url) return null;
    try {
      const response = await fetchWithTimeoutImpl(url, {
        fetchImpl,
        timeoutMs,
        localAddress,
        cache: 'no-store'
      });
      const body = await readResponseBody(response);
      if (!response.ok) {
        throw new Error(`target whitelist HTTP ${response.status}: ${String(body.text || '').slice(0, 160)}`);
      }
      const entries = parseWhitelistEntries(body.json, maxNames);
      const result = { ok: true, source: 'remote-url', url: redactSecrets(url), ...entries };
      state.sources.push(summarizeSource(result));
      applyEntries(entries, 'remote-url', { reason });
      return result;
    } catch (err) {
      recordFailure('remote-url', err, { url: redactSecrets(url), reason: `${reason}-failed` });
      return { ok: false, source: 'remote-url', url: redactSecrets(url), error: err?.message || String(err) };
    }
  }

  async function refresh(reason = 'startup') {
    state.lastFetchAt = now();
    state.sources = [];
    const local = await loadLocal(reason);
    const remote = await loadRemote(reason);
    if (!state.loaded && !local?.ok && !remote?.ok) {
      state.lastReason = 'all-sources-failed';
    }
    return summarize();
  }

  function isWhitelistedTarget(target) {
    return targetIsWhitelisted(target, {
      nameSet: state.nameSet,
      userIdSet: state.userIdSet
    });
  }

  function summarize() {
    return {
      url: redactSecrets(url),
      file,
      names: state.names.slice(),
      userIds: state.userIds.slice(),
      count: state.names.length + state.userIds.length,
      nameCount: state.names.length,
      userIdCount: state.userIds.length,
      loaded: state.loaded,
      lastFetchAt: state.lastFetchAt,
      lastOkAt: state.lastOkAt,
      lastErrorAt: state.lastErrorAt,
      lastError: state.lastError,
      lastReason: state.lastReason,
      lastSource: state.lastSource,
      sources: state.sources.slice(-4)
    };
  }

  return {
    refresh,
    isWhitelistedTarget,
    summarize,
    get names() {
      return state.names.slice();
    },
    get nameSet() {
      return state.nameSet;
    },
    get userIds() {
      return state.userIds.slice();
    },
    get userIdSet() {
      return state.userIdSet;
    }
  };
}

module.exports = {
  DEFAULT_LOCAL_TARGET_WHITELIST_FILE,
  DEFAULT_TARGET_WHITELIST_URL,
  createBrowserlessTargetWhitelist
};
