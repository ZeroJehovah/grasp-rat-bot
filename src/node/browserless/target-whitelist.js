'use strict';

const fs = require('fs');
const path = require('path');
const {
  parseTargetWhitelistNames,
  targetIsWhitelisted,
  targetWhitelistNameSet
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
  return {
    source: result.source || '',
    url: result.url || '',
    file: result.file || '',
    count: Array.isArray(result.names) ? result.names.length : 0,
    ok: result.ok !== false,
    error: result.error || ''
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
    loaded: false,
    lastFetchAt: 0,
    lastOkAt: 0,
    lastErrorAt: 0,
    lastError: '',
    lastReason: 'not-loaded',
    lastSource: '',
    sources: []
  };

  function applyNames(names, source, detail = {}) {
    state.names = names.slice();
    state.nameSet = targetWhitelistNameSet(names, maxNames);
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
      const names = parseTargetWhitelistNames(payload.json, maxNames);
      const result = { ok: true, source: 'local-file', file: payload.file, names };
      state.sources.push(summarizeSource(result));
      if (names.length || !state.loaded) applyNames(names, 'local-file', { reason });
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
      const names = parseTargetWhitelistNames(body.json, maxNames);
      const result = { ok: true, source: 'remote-url', url: redactSecrets(url), names };
      state.sources.push(summarizeSource(result));
      applyNames(names, 'remote-url', { reason });
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
    return targetIsWhitelisted(target, state.nameSet);
  }

  function summarize() {
    return {
      url: redactSecrets(url),
      file,
      names: state.names.slice(),
      count: state.names.length,
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
    }
  };
}

module.exports = {
  DEFAULT_LOCAL_TARGET_WHITELIST_FILE,
  DEFAULT_TARGET_WHITELIST_URL,
  createBrowserlessTargetWhitelist
};
