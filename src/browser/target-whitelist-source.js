'use strict';

function targetWhitelistSource() {
  return String.raw`
  function isWhitelistedTarget(e) {
    if (!e) return false;
    const name = normalizeTargetWhitelistName(e.name);
    return Boolean(name && bot.targetWhitelist?.nameSet?.has(name));
  }

  function summarizeTargetWhitelistStatus() {
    const state = bot.targetWhitelist || targetWhitelistState;
    return {
      url: String(state?.url || ''),
      names: Array.isArray(state?.names) ? state.names.slice() : [],
      count: Array.isArray(state?.names) ? state.names.length : 0,
      loaded: Boolean(state?.lastOkAt),
      fetching: Boolean(state?.fetching),
      lastFetchAt: Number(state?.lastFetchAt || 0) || 0,
      lastOkAt: Number(state?.lastOkAt || 0) || 0,
      lastErrorAt: Number(state?.lastErrorAt || 0) || 0,
      lastError: String(state?.lastError || ''),
      lastReason: String(state?.lastReason || '')
    };
  }

  function targetWhitelistFetchUrl(url) {
    const raw = String(url || '').trim();
    if (!raw) return '';
    try {
      const parsed = new URL(raw, location.href);
      parsed.searchParams.set('_graspRatWhitelistTs', String(Date.now()));
      return parsed.toString();
    } catch (_) {
      return raw + (raw.includes('?') ? '&' : '?') + '_graspRatWhitelistTs=' + Date.now();
    }
  }

  async function refreshTargetWhitelist(reason = 'manual') {
    const state = bot.targetWhitelist || targetWhitelistState;
    const url = String(state.url || '').trim();
    const t = Date.now();
    if (!url) {
      state.lastFetchAt = t;
      state.lastReason = 'no-url';
      return summarizeTargetWhitelistStatus();
    }
    if (state.fetching) return summarizeTargetWhitelistStatus();
    state.fetching = true;
    state.lastFetchAt = t;
    try {
      const payload = await fetchJsonNoStore(targetWhitelistFetchUrl(url), cfg.targetWhitelistTimeoutMs);
      const validPayload = Array.isArray(payload)
        || Array.isArray(payload?.names)
        || Array.isArray(payload?.usernames);
      if (!validPayload) throw new Error('target whitelist JSON must be an array or contain names/usernames array');
      const names = parseTargetWhitelistNames(payload, cfg.targetWhitelistMaxNames);
      state.names = names;
      state.nameSet = new Set(names);
      state.lastOkAt = Date.now();
      state.lastError = '';
      state.lastErrorAt = 0;
      state.lastReason = String(reason || 'refresh');
      return summarizeTargetWhitelistStatus();
    } catch (err) {
      state.lastError = err?.message || String(err);
      state.lastErrorAt = Date.now();
      state.lastReason = String(reason || 'refresh') + '-failed';
      return summarizeTargetWhitelistStatus();
    } finally {
      state.fetching = false;
    }
  }

  function startTargetWhitelistPolling() {
    const state = bot.targetWhitelist || targetWhitelistState;
    if (!String(state.url || '').trim()) {
      state.lastReason = 'no-url';
      return;
    }
    refreshTargetWhitelist('startup').catch(err => recordUnhandledTickError('target-whitelist-startup', err));
    const pollMs = Math.max(0, Number(cfg.targetWhitelistPollMs || 0) || 0);
    if (pollMs > 0 && !cfg.once) {
      state.timer = setInterval(() => {
        refreshTargetWhitelist('interval').catch(err => recordUnhandledTickError('target-whitelist-interval', err));
      }, pollMs);
    }
  }
`;
}

module.exports = {
  targetWhitelistSource
};
