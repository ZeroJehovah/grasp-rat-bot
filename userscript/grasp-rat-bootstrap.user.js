// ==UserScript==
// @name         Grasp Rat Bot Bootstrap
// @namespace    https://github.com/grasp-rat-bot
// @version      0.4.3
// @description  Loads, hot-updates, and supervises the Grasp Rat bot from a signed manifest.
// @match        https://grasp-rat-game.h-e.top/*
// @match        https://connect.linux.do/oauth2/authorize*
// @downloadURL  https://raw.githubusercontent.com/ZeroJehovah/grasp-rat-bot/main/userscript/grasp-rat-bootstrap.user.js
// @updateURL    https://raw.githubusercontent.com/ZeroJehovah/grasp-rat-bot/main/userscript/grasp-rat-bootstrap.user.js
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addElement
// @grant        unsafeWindow
// @connect      127.0.0.1
// @connect      localhost
// @connect      raw.githubusercontent.com
// @connect      githubusercontent.com
// @connect      cdn.jsdelivr.net
// @connect      github.io
// @connect      *
// ==/UserScript==

(function () {
  'use strict';

  const GAME_ORIGIN = 'https://grasp-rat-game.h-e.top';
  const AUTH_ORIGIN = 'https://connect.linux.do';
  const BOOTSTRAP_VERSION = '0.4.3';
  const MIN_REMOTE_BOT_VERSION = 'bootstrap-0.4.0';
  const LOGIN_SUPPRESS_KEY = 'graspRatLoginSuppressUntil';
  const LOGIN_SUPPRESS_REASON_KEY = 'graspRatLoginSuppressReason';
  const BLOCKED_REMOTE_HASHES = new Set([
    '4dd9444acda372a715e559b4e3a03409299aed70c09ceb58cbfd9dbf1178591a',
    'a78f30e186e7cbaac7f2cf351aeaed6edccca787be4f238d5a895046946db58e',
    'ba1ce672b92b19c386de8c54363f589ee291168ff0176579e995f691b8a8b99c',
    '63c091fcff34474608176e2ab98c14fcea146c5c15337b17ee86f44bf5e311ee',
    'f3e5fe9a9cd349bde0d00797e15532c01eb53d814b534ba82faf429ad907f7b6'
  ]);
  const FORBIDDEN_REMOTE_SOURCE = [
    { label: 'bot-owned WebSocket constructor', re: /\bnew\s+WebSocket\s*\(/ },
    { label: 'page connectWs control', re: /\bconnectWs\b/ },
    { label: 'page scheduleReconnect control', re: /\bscheduleReconnect\b/ },
    { label: 'direct game WebSocket URL', re: /wss:\/\/grasp-rat-game\.h-e\.top\/ws/ }
  ];

  const DEFAULTS = {
    manifestUrl: 'https://raw.githubusercontent.com/ZeroJehovah/grasp-rat-bot/main/dist/manifest.json',
    debug: true,
    debugEndpoint: 'http://127.0.0.1:18777/events',
    pollMs: 1000,
    watchdogMs: 1000,
    busyLeaseMs: 12000,
    requestTimeoutMs: 7000,
    fallbackStaggerMs: 1200,
    staleTickMs: 3000,
    debugEveryMs: 1000,
    statusEvery: 1000,
    scriptStartupTimeoutMs: 2500,
    installConfirmMs: 3500,
    restartAfterCacheUpdateMs: 800,
    loginCooldownMs: 5000,
    postLoginGraceMs: 45000,
    authReturnGraceMs: 45000,
    authorizeCooldownMs: 1000,
    authorizeFallbackDelayMs: 10000,
    cacheBust: true,
    autoLogin: true
  };

  const cfg = {
    manifestUrl: String(GM_getValue('manifestUrl', DEFAULTS.manifestUrl) || DEFAULTS.manifestUrl),
    debug: Boolean(GM_getValue('debug', DEFAULTS.debug)),
    debugEndpoint: String(GM_getValue('debugEndpoint', DEFAULTS.debugEndpoint) || DEFAULTS.debugEndpoint),
    pollMs: Math.max(250, Number(GM_getValue('pollMs', DEFAULTS.pollMs)) || DEFAULTS.pollMs),
    watchdogMs: Math.max(250, Number(GM_getValue('watchdogMs', DEFAULTS.watchdogMs)) || DEFAULTS.watchdogMs),
    busyLeaseMs: Math.max(3000, Number(GM_getValue('busyLeaseMs', DEFAULTS.busyLeaseMs)) || DEFAULTS.busyLeaseMs),
    requestTimeoutMs: Math.max(3000, Number(GM_getValue('requestTimeoutMs', DEFAULTS.requestTimeoutMs)) || DEFAULTS.requestTimeoutMs),
    fallbackStaggerMs: Math.max(0, Number(GM_getValue('fallbackStaggerMs', DEFAULTS.fallbackStaggerMs)) || DEFAULTS.fallbackStaggerMs),
    staleTickMs: Math.max(1000, Number(GM_getValue('staleTickMs', DEFAULTS.staleTickMs)) || DEFAULTS.staleTickMs),
    debugEveryMs: Math.max(250, Number(GM_getValue('debugEveryMs', DEFAULTS.debugEveryMs)) || DEFAULTS.debugEveryMs),
    statusEvery: Math.max(250, Number(GM_getValue('statusEvery', DEFAULTS.statusEvery)) || DEFAULTS.statusEvery),
    scriptStartupTimeoutMs: Math.max(500, Number(GM_getValue('scriptStartupTimeoutMs', DEFAULTS.scriptStartupTimeoutMs)) || DEFAULTS.scriptStartupTimeoutMs),
    installConfirmMs: Math.max(1000, Number(GM_getValue('installConfirmMs', DEFAULTS.installConfirmMs)) || DEFAULTS.installConfirmMs),
    restartAfterCacheUpdateMs: Math.max(0, Number(GM_getValue('restartAfterCacheUpdateMs', DEFAULTS.restartAfterCacheUpdateMs)) || DEFAULTS.restartAfterCacheUpdateMs),
    loginCooldownMs: Math.max(1000, Number(GM_getValue('loginCooldownMs', DEFAULTS.loginCooldownMs)) || DEFAULTS.loginCooldownMs),
    postLoginGraceMs: Math.max(5000, Number(GM_getValue('postLoginGraceMs', DEFAULTS.postLoginGraceMs)) || DEFAULTS.postLoginGraceMs),
    authReturnGraceMs: Math.max(5000, Number(GM_getValue('authReturnGraceMs', DEFAULTS.authReturnGraceMs)) || DEFAULTS.authReturnGraceMs),
    authorizeCooldownMs: Math.max(250, Number(GM_getValue('authorizeCooldownMs', DEFAULTS.authorizeCooldownMs)) || DEFAULTS.authorizeCooldownMs),
    authorizeFallbackDelayMs: Math.max(0, Number(GM_getValue('authorizeFallbackDelayMs', DEFAULTS.authorizeFallbackDelayMs)) || DEFAULTS.authorizeFallbackDelayMs),
    cacheBust: Boolean(GM_getValue('cacheBust', DEFAULTS.cacheBust)),
    autoLogin: Boolean(GM_getValue('autoLogin', DEFAULTS.autoLogin))
  };

  const state = {
    bootId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    installing: false,
    polling: false,
    lastPollAt: 0,
    lastManifestFetchAt: 0,
    lastScriptFetchAt: 0,
    lastManifestHash: '',
    lastManifestVersion: '',
    lastInstallAttemptAt: 0,
    lastInstallStatus: '',
    lastInstallAt: 0,
    lastInstallReason: '',
    lastWatchdogAt: 0,
    lastLoginAt: 0,
    lastLoginSuppressUntil: 0,
    lastLoginSuppressReason: '',
    lastAuthorizeAt: 0,
    lastError: '',
    lastDebugAt: 0,
    busyStartedAt: 0,
    busyReason: '',
    busyToken: ''
  };

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function makeTimeoutError(label, ms) {
    const err = new Error(`${label} timed out after ${ms}ms`);
    err.isBootstrapTimeout = true;
    return err;
  }

  function withTimeout(promise, ms, label) {
    let timer = 0;
    return Promise.race([
      Promise.resolve(promise),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(makeTimeoutError(label, ms)), ms);
      })
    ]).finally(() => clearTimeout(timer));
  }

  function logBootstrap(message, detail) {
    try {
      console.log('[grasp-rat-bootstrap]', `${BOOTSTRAP_VERSION} ${state.bootId} ${message}`, detail || '');
    } catch (_) {}
  }

  function beginBusy(reason, flags = {}) {
    const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    state.busyToken = token;
    state.busyStartedAt = Date.now();
    state.busyReason = String(reason || '');
    if (flags.installing) state.installing = true;
    if (flags.polling) state.polling = true;
    return token;
  }

  function clearBusy(token) {
    if (token && state.busyToken && token !== state.busyToken) return;
    state.installing = false;
    state.polling = false;
    state.busyStartedAt = 0;
    state.busyReason = '';
    state.busyToken = '';
  }

  function resetStaleBusy(reason) {
    if (!state.installing && !state.polling) return false;
    const startedAt = Number(state.busyStartedAt || state.lastInstallAttemptAt || state.lastPollAt || 0);
    const ageMs = startedAt ? Date.now() - startedAt : 0;
    if (ageMs > 0 && ageMs <= cfg.busyLeaseMs) return false;
    logBootstrap('busy lease expired; clearing stuck flags', {
      reason,
      ageMs,
      busyReason: state.busyReason,
      installing: state.installing,
      polling: state.polling,
      lastInstallStatus: state.lastInstallStatus,
      lastError: state.lastError
    });
    clearBusy(state.busyToken);
    state.lastInstallStatus = `busy reset by ${reason || 'watchdog'}`;
    return true;
  }

  function shortStatus(status = getBotStatus()) {
    return status ? {
      running: Boolean(status.running),
      starting: Boolean(status.starting),
      ticking: Boolean(status.ticking),
      timerActive: Boolean(status.timerActive),
      version: status.version || '',
      sourceHash: status.sourceHash || '',
      lastTickAgeMs: status.lastTickAgeMs ?? null,
      reason: status.lastDecision?.reason || '',
      message: status.message || ''
    } : null;
  }

  function isGamePage() {
    return location.origin === GAME_ORIGIN;
  }

  function isAuthorizePage() {
    return location.origin === AUTH_ORIGIN && location.pathname.startsWith('/oauth2/authorize');
  }

  function isGameAuthCallback() {
    return isGamePage() && location.pathname.startsWith('/auth/linuxdo/callback');
  }

  function suppressLogin(reason, ms) {
    const until = Date.now() + Math.max(1000, Number(ms || cfg.postLoginGraceMs) || cfg.postLoginGraceMs);
    state.lastLoginSuppressUntil = until;
    state.lastLoginSuppressReason = String(reason || 'login flow');
    GM_setValue(LOGIN_SUPPRESS_KEY, until);
    GM_setValue(LOGIN_SUPPRESS_REASON_KEY, state.lastLoginSuppressReason);
    try {
      localStorage.setItem(LOGIN_SUPPRESS_KEY, String(until));
      localStorage.setItem(LOGIN_SUPPRESS_REASON_KEY, state.lastLoginSuppressReason);
    } catch (_) {}
    return until;
  }

  function loginSuppressRemainingMs() {
    let localUntil = 0;
    try {
      localUntil = Number(localStorage.getItem(LOGIN_SUPPRESS_KEY) || 0) || 0;
    } catch (_) {}
    const until = Math.max(Number(GM_getValue(LOGIN_SUPPRESS_KEY, 0)) || 0, Number(state.lastLoginSuppressUntil || 0), localUntil);
    const remaining = Math.max(0, until - Date.now());
    if (!remaining && until) {
      GM_setValue(LOGIN_SUPPRESS_KEY, 0);
      GM_setValue(LOGIN_SUPPRESS_REASON_KEY, '');
      state.lastLoginSuppressUntil = 0;
      state.lastLoginSuppressReason = '';
      try {
        localStorage.removeItem(LOGIN_SUPPRESS_KEY);
        localStorage.removeItem(LOGIN_SUPPRESS_REASON_KEY);
      } catch (_) {}
    } else if (remaining) {
      state.lastLoginSuppressUntil = until;
      state.lastLoginSuppressReason = String(GM_getValue(LOGIN_SUPPRESS_REASON_KEY, state.lastLoginSuppressReason || '') || 'login flow');
      try {
        localStorage.setItem(LOGIN_SUPPRESS_KEY, String(until));
        localStorage.setItem(LOGIN_SUPPRESS_REASON_KEY, state.lastLoginSuppressReason);
      } catch (_) {}
    }
    return remaining;
  }

  function withCacheBust(url) {
    if (!cfg.cacheBust) return url;
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}_graspRatTs=${Date.now()}`;
  }

  function uniqueUrls(urls) {
    const seen = new Set();
    return urls
      .map(url => String(url || '').trim())
      .filter(url => {
        if (!url || seen.has(url)) return false;
        seen.add(url);
        return true;
      });
  }

  function rawGithubToJsDelivr(url) {
    const match = String(url || '').match(/^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/);
    if (!match) return '';
    const [, owner, repo, branch, path] = match;
    return `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${branch}/${path}`;
  }

  function manifestUrls() {
    return uniqueUrls([
      cfg.manifestUrl,
      rawGithubToJsDelivr(cfg.manifestUrl)
    ]);
  }

  function scriptUrls(manifest) {
    return uniqueUrls([
      manifest?.scriptUrl,
      rawGithubToJsDelivr(manifest?.scriptUrl)
    ]);
  }

  function gmRequest(method, url, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
	    GM_xmlhttpRequest({
	        method,
	        url,
	        data: body,
	        headers,
	        timeout: cfg.requestTimeoutMs,
        onload: res => {
          if (res.status >= 200 && res.status < 300) resolve(res.responseText || '');
          else reject(new Error(`${method} ${url} failed: ${res.status}`));
        },
        ontimeout: () => reject(new Error(`${method} ${url} timed out`)),
        onerror: err => reject(new Error(`${method} ${url} error: ${err?.error || err?.message || 'unknown'}`))
      });
    });
  }

  async function requestAcceptedTextWithFallback(label, urls, acceptText) {
    const candidates = uniqueUrls(urls);
    if (!candidates.length) {
      throw new Error(`${label} fetch failed: no urls`);
    }
    return new Promise((resolve, reject) => {
      let settled = false;
      let completed = 0;
      const errors = [];
      const timers = candidates.map((url, i) => setTimeout(async () => {
        if (settled) return;
        try {
          logBootstrap(`${label} fetch try`, {
            url,
            index: i + 1,
            total: candidates.length,
            delayMs: i * cfg.fallbackStaggerMs
          });
          const text = await withTimeout(
            gmRequest('GET', withCacheBust(url)),
            cfg.requestTimeoutMs + 500,
            `${label} request`
          );
          const accepted = acceptText ? await acceptText(text, url) : null;
          if (settled) return;
          settled = true;
          timers.forEach(timer => clearTimeout(timer));
          logBootstrap(`${label} fetch ok`, {
            url,
            index: i + 1,
            bytes: String(text || '').length
          });
          resolve({ text, url, accepted });
        } catch (err) {
          if (settled) return;
          const error = err?.message || String(err);
          errors[i] = `${url}: ${error}`;
          completed += 1;
          logBootstrap(`${label} fetch failed`, {
            url,
            index: i + 1,
            total: candidates.length,
            error
          });
          if (completed >= candidates.length) {
            settled = true;
            reject(new Error(`${label} fetch failed from ${candidates.length} url(s): ${errors.filter(Boolean).join(' | ')}`));
          }
        }
      }, i * cfg.fallbackStaggerMs));
    });
  }

  async function requestTextWithFallback(label, urls) {
    const { text, url } = await requestAcceptedTextWithFallback(label, urls, text => ({ text }));
    return { text, url };
  }

  async function sha256Hex(text) {
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest)).map(v => v.toString(16).padStart(2, '0')).join('');
  }

  function parseManifest(text) {
    const manifest = typeof text === 'string' ? JSON.parse(text) : text;
    if (!manifest || typeof manifest !== 'object') throw new Error('manifest is not an object');
    if (!manifest.scriptUrl) throw new Error('manifest.scriptUrl missing');
    if (!manifest.sha256) throw new Error('manifest.sha256 missing');
    return manifest;
  }

  function parseRemoteBotVersion(value) {
    const match = String(value || '').match(/(\d+)\.(\d+)\.(\d+)/);
    if (!match) return null;
    return match.slice(1).map(part => Number(part));
  }

  function compareRemoteBotVersion(a, b) {
    const left = parseRemoteBotVersion(a);
    const right = parseRemoteBotVersion(b);
    if (!left || !right) return null;
    for (let i = 0; i < 3; i += 1) {
      if (left[i] !== right[i]) return left[i] - right[i];
    }
    return 0;
  }

  function remoteBotVersionIsBlocked(version) {
    const cmp = compareRemoteBotVersion(version, MIN_REMOTE_BOT_VERSION);
    return cmp !== null && cmp < 0;
  }

  function assertRemoteBotVersionAllowed(manifest) {
    const version = String(manifest?.version || '');
    if (remoteBotVersionIsBlocked(version)) {
      throw new Error(`remote bot ${version || '(unknown version)'} is below required ${MIN_REMOTE_BOT_VERSION}`);
    }
  }

  function readCachedManifest() {
    const raw = GM_getValue('cachedManifest', '');
    if (!raw) return null;
    try {
      return parseManifest(raw);
    } catch (_) {
      return null;
    }
  }

  function clearCachedBot(reason) {
    GM_setValue('cachedManifest', '');
    GM_setValue('cachedSource', '');
    state.lastManifestHash = '';
    state.lastManifestVersion = '';
    if (reason) state.lastError = String(reason);
  }

  function assertSafeRemoteSource(manifest, source, hash) {
    const version = String(manifest?.version || '');
    const sha256 = String(hash || manifest?.sha256 || '').toLowerCase();
    assertRemoteBotVersionAllowed(manifest);
    if (BLOCKED_REMOTE_HASHES.has(sha256)) {
      throw new Error(`blocked unsafe remote bot ${version || '(unknown version)'} ${sha256}`);
    }
    const text = String(source || '');
    const blocked = FORBIDDEN_REMOTE_SOURCE.find(item => item.re.test(text));
    if (blocked) {
      throw new Error(`remote bot rejected: ${blocked.label}`);
    }
  }

  function getBotStatus() {
    try {
      const bot = unsafeWindow.__graspRatBot || null;
      return bot?.status ? bot.status() : null;
    } catch (err) {
      return { running: false, message: err?.message || String(err) };
    }
  }

  function tickIsStale(status) {
    if (!status || !status.running) return true;
    if (status.starting && Number(status.uptimeMs || 0) < Math.max(cfg.staleTickMs, cfg.scriptStartupTimeoutMs + cfg.installConfirmMs)) {
      return false;
    }
    const age = Number(status.lastTickAgeMs ?? 0);
    if (!status.timerActive && !status.ticking) return true;
    return Number.isFinite(age) && age > cfg.staleTickMs && !status.ticking;
  }

  function runningBotUsesBlockedStrategy(status) {
    return Boolean(status?.running && remoteBotVersionIsBlocked(status.version));
  }

  function stopBlockedRunningBot(reason, status = getBotStatus()) {
    if (!runningBotUsesBlockedStrategy(status)) return false;
    try {
      logBootstrap('stopping blocked remote bot', {
        reason,
        minVersion: MIN_REMOTE_BOT_VERSION,
        status: shortStatus(status)
      });
      unsafeWindow.__graspRatBot?.stop?.(`bootstrap blocked old strategy: ${reason || 'version gate'}`);
      return true;
    } catch (err) {
      state.lastError = 'failed to stop blocked remote bot: ' + (err?.message || String(err));
      logBootstrap('stop blocked remote bot failed', { reason, error: state.lastError, status: shortStatus(status) });
      return false;
    }
  }

  function botNeedsInstall(manifest) {
    const status = getBotStatus();
    if (!status || !status.running) return true;
    if (runningBotUsesBlockedStrategy(status)) return true;
    if (String(status.sourceHash || '') !== String(manifest.sha256 || '')) return true;
    if (String(status.version || '') !== String(manifest.version || '')) return true;
    if (tickIsStale(status)) return true;
    return false;
  }

  function botMatchesManifest(status, manifest) {
    return Boolean(status?.running)
      && String(status.sourceHash || '') === String(manifest?.sha256 || '')
      && String(status.version || '') === String(manifest?.version || '')
      && !runningBotUsesBlockedStrategy(status);
  }

  function cachedManifestMatches(manifest) {
    const cached = readCachedManifest();
    const source = GM_getValue('cachedSource', '');
    return Boolean(cached && source)
      && String(cached.sha256 || '') === String(manifest?.sha256 || '')
      && String(cached.version || '') === String(manifest?.version || '')
      && !remoteBotVersionIsBlocked(cached.version);
  }

  function currentUserIdFromStatus(status) {
    return status?.control?.currentUserId
      || status?.self?.id
      || status?.lastDecision?.self?.id
      || 0;
  }

  async function leaveGameForCachedUpdate(reason, status) {
    const detail = {
      attempted: false,
      method: '',
      reason,
      userId: currentUserIdFromStatus(status) || null,
      error: ''
    };
    try {
      if (typeof unsafeWindow.leave === 'function') {
        const result = detail.userId ? unsafeWindow.leave(detail.userId) : unsafeWindow.leave();
        if (result && typeof result.then === 'function') await withTimeout(result, 1200, 'leave before cached update restart');
        detail.attempted = true;
        detail.method = detail.userId ? 'leave(userId)' : 'leave';
      } else {
        const leaveBtn = document.querySelector('#leaveBtn');
        if (leaveBtn && visible(leaveBtn)) {
          leaveBtn.click();
          detail.attempted = true;
          detail.method = '#leaveBtn';
        } else {
          detail.error = 'leave control not found';
        }
      }
    } catch (err) {
      detail.error = err?.message || String(err);
    }
    return detail;
  }

  async function restartForCachedUpdate(manifest, reason, status = getBotStatus()) {
    const detail = {
      reason,
      version: manifest?.version || '',
      sha256: manifest?.sha256 || '',
      previousStatus: shortStatus(status),
      leave: null,
      reloadDelayMs: cfg.restartAfterCacheUpdateMs
    };
    logBootstrap('cached update restart start', detail);
    detail.leave = await leaveGameForCachedUpdate(reason, status);
    try {
      unsafeWindow.__graspRatBot?.stop?.(`cached update restart: ${manifest?.version || manifest?.sha256 || reason || 'remote update'}`);
    } catch (err) {
      detail.stopError = err?.message || String(err);
    }
    state.lastInstallStatus = `cached update restart scheduled for ${manifest?.version || manifest?.sha256 || 'remote update'}`;
    postDebug('cached-update-restart', detail, { force: true });
    setTimeout(() => {
      try {
        location.reload();
      } catch (err) {
        state.lastError = 'reload after cached update failed: ' + (err?.message || String(err));
        logBootstrap('cached update reload failed', { reason, error: state.lastError });
      }
    }, cfg.restartAfterCacheUpdateMs);
    return true;
  }

  function postDebug(type, detail = {}, options = {}) {
    if (!cfg.debug || !cfg.debugEndpoint) return;
    const t = Date.now();
    if (!options.force && t - state.lastDebugAt < cfg.debugEveryMs) return;
    state.lastDebugAt = t;
    const payload = {
      at: new Date(t).toISOString(),
      type: `bootstrap:${type}`,
      url: location.href,
      title: document.title,
      detail,
      status: getBotStatus()
    };
    gmRequest('POST', cfg.debugEndpoint, JSON.stringify(payload), { 'Content-Type': 'application/json' }).catch(() => {});
  }

  unsafeWindow.__graspRatBotDebugPost = function (payload) {
    if (!cfg.debug || !cfg.debugEndpoint) return;
    gmRequest('POST', cfg.debugEndpoint, JSON.stringify(payload), { 'Content-Type': 'application/json' }).catch(() => {});
  };

  async function runInPage(source, sourceUrl) {
    const labeledSource = `${source}\n//# sourceURL=${sourceUrl || 'grasp-rat-remote-bot.js'}`;
    try {
      if (typeof GM_addElement === 'function') {
        logBootstrap('inject attempt', { method: 'GM_addElement(script)', sourceUrl });
        const script = GM_addElement(document.documentElement || document.head || document.body, 'script', {
          textContent: labeledSource,
          type: 'text/javascript',
          'data-grasp-rat-injected': 'true'
        });
        try {
          setTimeout(() => script?.remove?.(), 1000);
        } catch (_) {}
        return { method: 'GM_addElement(script)', timedOut: false };
      }
    } catch (gmErr) {
      state.lastInstallStatus = 'GM_addElement injection failed: ' + (gmErr?.message || String(gmErr));
      logBootstrap('inject method failed', { method: 'GM_addElement(script)', error: state.lastInstallStatus });
    }
    try {
      logBootstrap('inject attempt', { method: 'unsafeWindow.eval', sourceUrl });
      const result = unsafeWindow.eval(labeledSource);
      if (result && typeof result.then === 'function') {
        await withTimeout(result, cfg.scriptStartupTimeoutMs, 'remote bot startup');
      }
      return { method: 'unsafeWindow.eval', timedOut: false };
    } catch (evalErr) {
      if (evalErr?.isBootstrapTimeout) {
        state.lastInstallStatus = evalErr.message;
        logBootstrap('remote bot startup promise timed out; continuing confirmation', {
          sourceUrl,
          timeoutMs: cfg.scriptStartupTimeoutMs
        });
        return { method: 'unsafeWindow.eval', timedOut: true, error: evalErr.message || String(evalErr) };
      }
      const evalError = evalErr?.message || String(evalErr);
      state.lastInstallStatus = 'unsafeWindow.eval failed: ' + evalError;
      try {
        logBootstrap('inject attempt', { method: 'script-element', sourceUrl, evalError });
        const script = document.createElement('script');
        script.textContent = labeledSource;
        script.dataset.graspRatInjected = 'true';
        script.onerror = () => {
          state.lastError = 'script element injection failed after eval failed: ' + evalError;
        };
        (document.documentElement || document.head || document.body).appendChild(script);
        script.remove();
        return { method: 'script-element', timedOut: false, evalError };
      } catch (scriptErr) {
        state.lastError = 'script element injection failed after eval failed: ' + (scriptErr?.message || String(scriptErr));
        throw new Error(`${state.lastError}; eval error: ${evalError}`);
      }
    }
  }

  async function fetchAndVerify(manifest) {
    state.lastScriptFetchAt = Date.now();
    logBootstrap('script fetch start', {
      version: manifest.version,
      sha256: manifest.sha256,
      scriptUrl: manifest.scriptUrl,
      urls: scriptUrls(manifest)
    });
    const { text: source, url: sourceUrl, accepted } = await requestAcceptedTextWithFallback(
      'remote bot script',
      scriptUrls(manifest),
      async sourceText => {
        const sourceHash = await sha256Hex(sourceText);
        if (sourceHash !== manifest.sha256) {
          throw new Error(`script sha256 mismatch: expected ${manifest.sha256}, got ${sourceHash}`);
        }
        assertSafeRemoteSource(manifest, sourceText, sourceHash);
        return { hash: sourceHash };
      }
    );
    logBootstrap('script fetch complete', {
      version: manifest.version,
      bytes: String(source || '').length,
      sourceUrl
    });
    const hash = String(accepted?.hash || '');
    logBootstrap('script verified', { version: manifest.version, sha256: hash });
    GM_setValue('cachedManifest', JSON.stringify(manifest));
    GM_setValue('cachedSource', source);
    return { source, hash };
  }

  async function waitForInstallConfirmation(manifest, reason, injectResult) {
    const started = Date.now();
    let status = null;
    logBootstrap('install confirm start', {
      reason,
      version: manifest.version,
      sha256: manifest.sha256,
      injectResult
    });
    while (Date.now() - started <= cfg.installConfirmMs) {
      status = getBotStatus();
      if (status?.running && String(status.sourceHash || '') === String(manifest.sha256 || '')) {
        logBootstrap('install confirmed', {
          reason,
          elapsedMs: Date.now() - started,
          status: shortStatus(status)
        });
        return status;
      }
      state.lastInstallStatus = `confirming ${reason || 'install'}: ${JSON.stringify(status || null).slice(0, 160)}`;
      await sleep(100);
    }
    logBootstrap('install confirm failed', {
      reason,
      elapsedMs: Date.now() - started,
      expectedHash: manifest.sha256,
      status: shortStatus(status),
      injectResult
    });
    throw new Error(`bot install did not confirm after ${cfg.installConfirmMs}ms: ${JSON.stringify({
      status,
      injectResult
    }).slice(0, 500)}`);
  }

  async function installSource(manifest, source, reason) {
    if (!isGamePage()) return false;
    state.lastInstallAttemptAt = Date.now();
    state.lastInstallStatus = `injecting ${manifest.version || manifest.sha256 || 'remote'}`;
    logBootstrap('install source start', {
      reason,
      version: manifest.version,
      sha256: manifest.sha256,
      sourceBytes: String(source || '').length,
      currentStatus: shortStatus()
    });
    unsafeWindow.__graspRatBotRuntimeConfig = {
      ...(manifest.config || {}),
      debug: Boolean(manifest.debug ?? cfg.debug),
      debugEndpoint: String(manifest.debugEndpoint || cfg.debugEndpoint || ''),
      debugEveryMs: Math.max(250, Number(manifest.debugEveryMs || cfg.debugEveryMs) || 1000),
      statusEvery: Math.max(250, Number(manifest.statusEvery || cfg.statusEvery) || 1000),
      version: String(manifest.version || 'remote'),
      sourceHash: String(manifest.sha256 || ''),
      sourceUrl: String(manifest.scriptUrl || ''),
      injectedBy: 'tampermonkey'
    };
    const injectResult = await runInPage(source, manifest.scriptUrl);
    state.lastInstallStatus = `confirming ${manifest.version || manifest.sha256 || 'remote'}`;
    const status = await waitForInstallConfirmation(manifest, reason, injectResult);
    state.lastManifestHash = String(manifest.sha256 || '');
    state.lastManifestVersion = String(manifest.version || '');
    state.lastInstallAt = Date.now();
    state.lastInstallReason = reason || '';
    state.lastInstallStatus = 'confirmed';
    logBootstrap('install source done', {
      reason,
      version: manifest.version,
      elapsedMs: state.lastInstallAt - state.lastInstallAttemptAt,
      status: shortStatus(status)
    });
    postDebug('install', { reason, version: manifest.version, sha256: manifest.sha256, injectResult, status }, { force: true });
    return true;
  }

  async function installCached(reason, options = {}) {
    if (!isGamePage()) return false;
    const manifest = readCachedManifest();
    const source = GM_getValue('cachedSource', '');
    logBootstrap('cached install check', {
      reason,
      force: Boolean(options.force),
      hasManifest: Boolean(manifest),
      hasSource: Boolean(source),
      currentStatus: shortStatus()
    });
    if (!manifest || !source) return false;
    if (!options.force && !botNeedsInstall(manifest)) {
      logBootstrap('cached install skipped: bot current', { reason, manifestVersion: manifest.version, status: shortStatus() });
      return true;
    }
    const hash = await sha256Hex(source);
    try {
      if (hash !== manifest.sha256) throw new Error(`cached script sha256 mismatch: expected ${manifest.sha256}, got ${hash}`);
      assertSafeRemoteSource(manifest, source, hash);
    } catch (err) {
      clearCachedBot(err?.message || String(err));
      throw err;
    }
    await installSource(manifest, source, reason);
    postDebug('cached-install', { reason, version: manifest.version, sha256: manifest.sha256 }, { force: true });
    return true;
  }

  function shouldFastStartFromCache(manifest, source, status) {
    if (!manifest || !source) return false;
    if (runningBotUsesBlockedStrategy(status)) return false;
    if (!status || !status.running) return true;
    if (tickIsStale(status)) return true;
    return false;
  }

  async function installCachedForFastStart(reason = 'startup-cache-first') {
    if (!isGamePage()) return false;
    const manifest = readCachedManifest();
    const source = GM_getValue('cachedSource', '');
    const status = getBotStatus();
    const shouldInstall = shouldFastStartFromCache(manifest, source, status);
    logBootstrap('fast cache install check', {
      reason,
      shouldInstall,
      blockedCurrentStrategy: runningBotUsesBlockedStrategy(status),
      minVersion: MIN_REMOTE_BOT_VERSION,
      hasManifest: Boolean(manifest),
      hasSource: Boolean(source),
      manifestVersion: manifest?.version || '',
      manifestHash: manifest?.sha256 || '',
      currentStatus: shortStatus(status)
    });
    if (!shouldInstall) return false;
    const busyToken = beginBusy(`fast-cache:${reason}`, { installing: true });
    try {
      const installed = await installCached(reason, { force: true });
      if (installed) {
        logBootstrap('fast cache install done', { reason, version: manifest.version, sha256: manifest.sha256 });
      }
      return installed;
    } catch (err) {
      state.lastError = err?.message || String(err);
      logBootstrap('fast cache install error', { reason, error: state.lastError });
      postDebug('cached-error', { reason, error: state.lastError }, { force: true });
      stopBlockedRunningBot(`${reason}:cache-error`, status);
      return false;
    } finally {
      clearBusy(busyToken);
    }
  }

  async function installManifest(manifest, reason) {
    if (!isGamePage()) return false;
    const current = getBotStatus();
    const cacheCurrent = cachedManifestMatches(manifest);
    if (!cacheCurrent) {
      logBootstrap('remote update caching needed', {
        reason,
        version: manifest.version,
        sha256: manifest.sha256,
        status: shortStatus(current)
      });
      await fetchAndVerify(manifest);
    }
    const status = getBotStatus();
    if (status?.running && !botMatchesManifest(status, manifest)) {
      logBootstrap('remote update cached; restarting instead of hot executing', {
        reason,
        version: manifest.version,
        sha256: manifest.sha256,
        cacheCurrent,
        blockedCurrentStrategy: runningBotUsesBlockedStrategy(status),
        status: shortStatus(status)
      });
      await restartForCachedUpdate(manifest, reason, status);
      state.lastError = '';
      return true;
    }
    if (!status || !status.running || tickIsStale(status)) {
      logBootstrap('installing cached bot after manifest sync', {
        reason,
        version: manifest.version,
        sha256: manifest.sha256,
        status: shortStatus(status)
      });
      await installCached(reason, { force: true });
      state.lastError = '';
      return true;
    }
    logBootstrap('manifest sync skipped: running bot and cache current', {
      reason,
      version: manifest.version,
      sha256: manifest.sha256,
      status: shortStatus(status),
      cacheCurrent: cachedManifestMatches(manifest)
    });
    state.lastError = '';
    return true;
  }

  async function pollOnce(reason = 'poll') {
    if (!isGamePage()) return;
    if (state.installing || state.polling) {
      resetStaleBusy(reason);
    }
    if (state.installing || state.polling) {
      logBootstrap('poll skipped: busy', {
        reason,
        installing: state.installing,
        polling: state.polling,
        busyAgeMs: state.busyStartedAt ? Date.now() - state.busyStartedAt : null,
        busyReason: state.busyReason,
        lastInstallStatus: state.lastInstallStatus
      });
      return;
    }
    const busyToken = beginBusy(`poll:${reason}`, { polling: true });
    state.lastPollAt = Date.now();
    try {
      state.lastManifestFetchAt = Date.now();
      const urls = manifestUrls();
      logBootstrap('manifest fetch start', { reason, manifestUrl: cfg.manifestUrl, urls, currentStatus: shortStatus() });
      const { accepted, url: manifestUrl } = await requestAcceptedTextWithFallback(
        'manifest',
        urls,
        manifestText => ({ manifest: parseManifest(manifestText) })
      );
      const manifest = accepted.manifest;
      logBootstrap('manifest fetch complete', {
        reason,
        version: manifest.version,
        sha256: manifest.sha256,
        scriptUrl: manifest.scriptUrl,
        manifestUrl
      });
      if (!botNeedsInstall(manifest) && cachedManifestMatches(manifest)) {
        logBootstrap('poll ok: bot current', { reason, version: manifest.version, status: shortStatus() });
        postDebug('ok', { reason, version: manifest.version, sha256: manifest.sha256 });
        return;
      }
      state.installing = true;
      state.busyReason = `poll:${reason}:install`;
      state.busyStartedAt = Date.now();
      await installManifest(manifest, reason);
    } catch (err) {
      state.lastError = err?.message || String(err);
      logBootstrap('poll error', { reason, error: state.lastError, status: shortStatus() });
      postDebug('error', { reason, error: state.lastError }, { force: true });
      const status = getBotStatus();
      if (!status || !status.running) {
        try {
          logBootstrap('poll falling back to cache', { reason, error: state.lastError });
          state.installing = true;
          state.busyReason = `poll:${reason}:cache-fallback`;
          state.busyStartedAt = Date.now();
          await installCached(state.lastError, { force: true });
        } catch (cacheErr) {
          logBootstrap('cached fallback error', { reason, error: cacheErr?.message || String(cacheErr) });
          postDebug('cached-error', { error: cacheErr?.message || String(cacheErr) }, { force: true });
        }
      }
    } finally {
      clearBusy(busyToken);
    }
  }

  function visible(el) {
    if (!el) return false;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  }

  function controlText(el) {
    return (el.innerText || el.value || el.getAttribute('aria-label') || el.getAttribute('title') || '').trim();
  }

  function findGameLoginControl() {
    const direct = document.querySelector('#joinBtn, #loginBtn, [data-testid="login"], [data-testid="join"]');
    if (direct && visible(direct)) return direct;
    const candidates = Array.from(document.querySelectorAll('a, button, input[type="submit"], input[type="button"], [role="button"]'))
      .filter(visible);
    return candidates.find(el => {
      const text = controlText(el);
      if (/leave|logout|sign out|cancel|退出|离开|取消/i.test(text)) return false;
      return /linuxdo|login|sign in|oauth|authorize|join|start|play|登录|登陆|授权|加入|进入|开始/i.test(text);
    }) || null;
  }

  function hasLoginRequiredText() {
    const text = (document.body?.innerText || '').slice(0, 4000);
    return /login required|please login|please sign in|not logged in|未登录|请先登录|请登录|需要登录/i.test(text);
  }

  async function maybeStartGameLogin(reason = 'watchdog') {
    if (!cfg.autoLogin || !isGamePage()) return false;
    if (isGameAuthCallback()) {
      suppressLogin('oauth callback', cfg.authReturnGraceMs);
      postDebug('login-suppressed', { reason, suppressReason: 'oauth callback', remainingMs: loginSuppressRemainingMs() });
      return false;
    }
    const t = Date.now();
    if (t - state.lastLoginAt < cfg.loginCooldownMs) return false;
    const suppressRemainingMs = loginSuppressRemainingMs();
    if (suppressRemainingMs > 0) {
      postDebug('login-suppressed', {
        reason,
        suppressReason: state.lastLoginSuppressReason || GM_getValue(LOGIN_SUPPRESS_REASON_KEY, ''),
        remainingMs: Math.round(suppressRemainingMs)
      });
      return false;
    }
    const status = getBotStatus();
    const hasToken = Boolean(localStorage.getItem('tmpGameSessionToken') || status?.control?.hasToken);
    const hasSelf = Boolean(status?.self || status?.lastDecision?.self);
    const decisionReason = String(status?.lastDecision?.reason || '');
    const loginControl = findGameLoginControl();
    const loginRequired = hasLoginRequiredText();
    const shouldLogin = !hasToken
      || (!hasSelf && /login|required/i.test(decisionReason) && loginRequired);
    if (!shouldLogin) return false;
    state.lastLoginAt = t;
    const detail = {
      reason,
      hasToken,
      hasSelf,
      loginRequired,
      decisionReason,
      loginControl: loginControl ? (loginControl.id ? `#${loginControl.id}` : controlText(loginControl) || loginControl.tagName.toLowerCase()) : '',
      method: '',
      error: ''
    };
    try {
      if (typeof unsafeWindow.startLinuxDoLogin === 'function') {
        const result = unsafeWindow.startLinuxDoLogin();
        if (result && typeof result.then === 'function') await result;
        detail.method = 'startLinuxDoLogin';
      } else if (loginControl) {
        loginControl.click();
        detail.method = loginControl.id ? `#${loginControl.id}` : controlText(loginControl) || loginControl.tagName.toLowerCase();
      } else {
        detail.error = 'login control not found';
      }
    } catch (err) {
      detail.error = err?.message || String(err);
    }
    if (detail.method && !detail.error) suppressLogin('login started', cfg.postLoginGraceMs);
    postDebug(detail.error ? 'login-error' : 'login', detail, { force: true });
    return Boolean(detail.method && !detail.error);
  }

  function findAuthorizeAllowControl() {
    const candidates = Array.from(document.querySelectorAll('a, button, input[type="submit"], input[type="button"], [role="button"]'))
      .filter(visible);
    return candidates.find(el => {
      const text = controlText(el);
      return /^(allow|authorize|approve|continue|confirm|允许|同意|授权|确认|继续)$/i.test(text)
        || /allow|authorize|approve|continue|confirm|允许|同意|确认授权|授权|继续/i.test(text);
    }) || candidates.find(el => el.matches?.('a.btn-pill.btn-pill-primary, button.btn-pill-primary, .btn-primary, .btn-success, input[type="submit"]')) || null;
  }

  function maybeClickAuthorize(reason = 'watchdog') {
    if (!cfg.autoLogin || !isAuthorizePage()) return false;
    const t = Date.now();
    if (t - state.lastAuthorizeAt < cfg.authorizeCooldownMs) return false;
    state.lastAuthorizeAt = t;
    const detail = { reason, method: '', error: '', url: location.href };
    try {
      const allow = findAuthorizeAllowControl();
      if (allow) {
        allow.click();
        detail.method = allow.tagName.toLowerCase() + (allow.className ? '.' + String(allow.className).trim().replace(/\s+/g, '.') : '');
      } else {
        const form = document.querySelector('form');
        if (form) {
          form.requestSubmit ? form.requestSubmit() : form.submit();
          detail.method = 'form.submit';
        } else {
          detail.error = 'allow button not found';
        }
      }
    } catch (err) {
      detail.error = err?.message || String(err);
    }
    if (detail.method && !detail.error) suppressLogin('authorize clicked', cfg.authReturnGraceMs);
    postDebug(detail.error ? 'authorize-error' : 'authorize', detail, { force: true });
    return Boolean(detail.method && !detail.error);
  }

  async function watchdogOnce(reason = 'watchdog') {
    if (isAuthorizePage()) {
      maybeClickAuthorize(reason);
      return;
    }
    if (!isGamePage()) return;
    if (isGameAuthCallback()) {
      suppressLogin('oauth callback', cfg.authReturnGraceMs);
      postDebug('callback-wait', { reason, remainingMs: loginSuppressRemainingMs() });
      return;
    }
    state.lastWatchdogAt = Date.now();
    if (state.installing || state.polling) {
      resetStaleBusy(reason);
    }
    if (state.installing || state.polling) {
      logBootstrap('watchdog skipped: busy', {
        reason,
        installing: state.installing,
        polling: state.polling,
        busyAgeMs: state.busyStartedAt ? Date.now() - state.busyStartedAt : null,
        busyReason: state.busyReason,
        lastInstallStatus: state.lastInstallStatus
      });
      return;
    }
    const manifest = readCachedManifest();
    const status = getBotStatus();
    const missing = !status || !status.running;
    const stale = status && tickIsStale(status);
    const blockedStrategy = runningBotUsesBlockedStrategy(status);
    const mismatched = manifest && status && status.running
      && (String(status.sourceHash || '') !== String(manifest.sha256 || '') || String(status.version || '') !== String(manifest.version || ''));
    if (missing || stale || mismatched || blockedStrategy) {
      logBootstrap('watchdog reinstall needed', {
        reason,
        missing,
        stale,
        mismatched,
        blockedStrategy,
        minVersion: MIN_REMOTE_BOT_VERSION,
        manifestVersion: manifest?.version || '',
        manifestHash: manifest?.sha256 || '',
        status: shortStatus(status)
      });
    }
    if (!missing && !stale && !mismatched && !blockedStrategy) {
      logBootstrap('watchdog ok', { reason, status: shortStatus(status) });
      await maybeStartGameLogin(reason);
      return;
    }
    try {
      if (blockedStrategy && (!manifest || remoteBotVersionIsBlocked(manifest.version))) {
        stopBlockedRunningBot(`watchdog:${reason}:blocked-strategy`, status);
        await pollOnce(`${reason}-blocked-strategy`);
        return;
      }
      if (!manifest) {
        await pollOnce(reason);
        return;
      }
      if (status?.running && (mismatched || blockedStrategy) && !remoteBotVersionIsBlocked(manifest.version)) {
        await restartForCachedUpdate(manifest, `watchdog:${reason}`, status);
        return;
      }
      const busyToken = beginBusy(`watchdog:${reason}`, { installing: true });
      await installCached(reason, { force: true });
      clearBusy(busyToken);
    } catch (err) {
      state.lastError = err?.message || String(err);
      logBootstrap('watchdog error', { reason, error: state.lastError, missing, stale, mismatched, blockedStrategy });
      postDebug('watchdog-error', { reason, error: state.lastError, missing, stale, mismatched, blockedStrategy }, { force: true });
      if (blockedStrategy) {
        clearBusy(state.busyToken);
        stopBlockedRunningBot(`watchdog:${reason}:error`, status);
        await pollOnce(`${reason}-blocked-strategy-error`);
      }
    } finally {
      if (String(state.busyReason || '').startsWith(`watchdog:${reason}`)) clearBusy(state.busyToken);
    }
    await maybeStartGameLogin(reason);
  }

  unsafeWindow.__graspRatBotBootstrap = {
    version: BOOTSTRAP_VERSION,
    config: cfg,
    state,
    pollOnce,
    watchdogOnce,
    maybeStartGameLogin,
    maybeClickAuthorize,
    setManifestUrl(url) {
      cfg.manifestUrl = String(url || '');
      GM_setValue('manifestUrl', cfg.manifestUrl);
      return cfg.manifestUrl;
    },
    setDebugEndpoint(url) {
      cfg.debugEndpoint = String(url || '');
      GM_setValue('debugEndpoint', cfg.debugEndpoint);
      return cfg.debugEndpoint;
    }
  };

  if (isAuthorizePage()) {
    suppressLogin('authorize page', cfg.authReturnGraceMs);
    setTimeout(() => {
      if (!isAuthorizePage()) return;
      maybeClickAuthorize('fallback-delay');
      setInterval(() => maybeClickAuthorize('fallback-interval'), Math.max(cfg.watchdogMs, cfg.authorizeCooldownMs));
    }, cfg.authorizeFallbackDelayMs);
    return;
  }

  if (!isGamePage()) return;
  if (isGameAuthCallback()) {
    suppressLogin('oauth callback', cfg.authReturnGraceMs);
    setInterval(() => watchdogOnce('callback-interval').catch(() => {}), cfg.watchdogMs);
    return;
  }

  loginSuppressRemainingMs();
  logBootstrap('bootstrap start', {
    href: location.href,
    readyState: document.readyState,
    manifestUrl: cfg.manifestUrl,
    pollMs: cfg.pollMs,
    watchdogMs: cfg.watchdogMs,
    currentStatus: shortStatus()
  });

  (async () => {
    const cacheInstalled = await installCachedForFastStart('startup-cache-first');
    try {
      await pollOnce(cacheInstalled ? 'startup-after-cache' : 'startup');
    } catch (err) {
      logBootstrap('startup poll error', { error: err?.message || String(err) });
      postDebug('startup-error', { reason: 'startup', error: err?.message || String(err) }, { force: true });
    }
    const status = getBotStatus();
    if (!status || !status.running) {
      try {
        logBootstrap('startup fallback cache install', { status: shortStatus(status) });
        await installCachedForFastStart('startup-fallback');
      } catch (err) {
        logBootstrap('startup fallback cache error', { error: err?.message || String(err), status: shortStatus() });
        postDebug('cached-error', { reason: 'startup-fallback', error: err?.message || String(err) }, { force: true });
      }
    }
  })();
  watchdogOnce('startup').catch(() => {});
  setInterval(() => pollOnce('interval'), cfg.pollMs);
  setInterval(() => watchdogOnce('interval').catch(() => {}), cfg.watchdogMs);
})();
