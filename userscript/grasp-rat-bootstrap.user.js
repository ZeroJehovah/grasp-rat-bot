// ==UserScript==
// @name         Grasp Rat Bot Bootstrap
// @namespace    https://github.com/grasp-rat-bot
// @version      0.3.0
// @description  Loads, hot-updates, and supervises the Grasp Rat bot from a signed manifest.
// @match        https://grasp-rat-game.h-e.top/*
// @match        https://connect.linux.do/oauth2/authorize*
// @downloadURL  https://raw.githubusercontent.com/ZeroJehovah/grasp-rat-bot/main/userscript/grasp-rat-bootstrap.user.js
// @updateURL    https://raw.githubusercontent.com/ZeroJehovah/grasp-rat-bot/main/userscript/grasp-rat-bootstrap.user.js
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// @connect      127.0.0.1
// @connect      localhost
// @connect      raw.githubusercontent.com
// @connect      githubusercontent.com
// @connect      github.io
// @connect      *
// ==/UserScript==

(function () {
  'use strict';

  const GAME_ORIGIN = 'https://grasp-rat-game.h-e.top';
  const AUTH_ORIGIN = 'https://connect.linux.do';
  const LOGIN_SUPPRESS_KEY = 'graspRatLoginSuppressUntil';
  const LOGIN_SUPPRESS_REASON_KEY = 'graspRatLoginSuppressReason';

  const DEFAULTS = {
    manifestUrl: 'https://raw.githubusercontent.com/ZeroJehovah/grasp-rat-bot/main/dist/manifest.json',
    debug: true,
    debugEndpoint: 'http://127.0.0.1:18777/events',
    pollMs: 1000,
    watchdogMs: 1000,
    staleTickMs: 3000,
    debugEveryMs: 1000,
    statusEvery: 1000,
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
    staleTickMs: Math.max(1000, Number(GM_getValue('staleTickMs', DEFAULTS.staleTickMs)) || DEFAULTS.staleTickMs),
    debugEveryMs: Math.max(250, Number(GM_getValue('debugEveryMs', DEFAULTS.debugEveryMs)) || DEFAULTS.debugEveryMs),
    statusEvery: Math.max(250, Number(GM_getValue('statusEvery', DEFAULTS.statusEvery)) || DEFAULTS.statusEvery),
    loginCooldownMs: Math.max(1000, Number(GM_getValue('loginCooldownMs', DEFAULTS.loginCooldownMs)) || DEFAULTS.loginCooldownMs),
    postLoginGraceMs: Math.max(5000, Number(GM_getValue('postLoginGraceMs', DEFAULTS.postLoginGraceMs)) || DEFAULTS.postLoginGraceMs),
    authReturnGraceMs: Math.max(5000, Number(GM_getValue('authReturnGraceMs', DEFAULTS.authReturnGraceMs)) || DEFAULTS.authReturnGraceMs),
    authorizeCooldownMs: Math.max(250, Number(GM_getValue('authorizeCooldownMs', DEFAULTS.authorizeCooldownMs)) || DEFAULTS.authorizeCooldownMs),
    authorizeFallbackDelayMs: Math.max(0, Number(GM_getValue('authorizeFallbackDelayMs', DEFAULTS.authorizeFallbackDelayMs)) || DEFAULTS.authorizeFallbackDelayMs),
    cacheBust: Boolean(GM_getValue('cacheBust', DEFAULTS.cacheBust)),
    autoLogin: Boolean(GM_getValue('autoLogin', DEFAULTS.autoLogin))
  };

  const state = {
    installing: false,
    polling: false,
    lastManifestHash: '',
    lastManifestVersion: '',
    lastInstallAt: 0,
    lastInstallReason: '',
    lastWatchdogAt: 0,
    lastLoginAt: 0,
    lastLoginSuppressUntil: 0,
    lastLoginSuppressReason: '',
    lastAuthorizeAt: 0,
    lastError: '',
    lastDebugAt: 0
  };

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

  function gmRequest(method, url, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method,
        url,
        data: body,
        headers,
        timeout: 5000,
        onload: res => {
          if (res.status >= 200 && res.status < 300) resolve(res.responseText || '');
          else reject(new Error(`${method} ${url} failed: ${res.status}`));
        },
        ontimeout: () => reject(new Error(`${method} ${url} timed out`)),
        onerror: err => reject(new Error(`${method} ${url} error: ${err?.error || err?.message || 'unknown'}`))
      });
    });
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

  function readCachedManifest() {
    const raw = GM_getValue('cachedManifest', '');
    if (!raw) return null;
    try {
      return parseManifest(raw);
    } catch (_) {
      return null;
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
    const age = Number(status.lastTickAgeMs ?? 0);
    if (!status.timerActive && !status.ticking) return true;
    return Number.isFinite(age) && age > cfg.staleTickMs && !status.ticking;
  }

  function botNeedsInstall(manifest) {
    const status = getBotStatus();
    if (!status || !status.running) return true;
    if (String(status.sourceHash || '') !== String(manifest.sha256 || '')) return true;
    if (String(status.version || '') !== String(manifest.version || '')) return true;
    if (tickIsStale(status)) return true;
    return false;
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
      const result = unsafeWindow.eval(labeledSource);
      if (result && typeof result.then === 'function') await result;
      return;
    } catch (evalErr) {
      const script = document.createElement('script');
      script.textContent = labeledSource;
      script.dataset.graspRatInjected = 'true';
      script.onerror = () => {
        state.lastError = 'script element injection failed after eval failed: ' + (evalErr?.message || String(evalErr));
      };
      (document.documentElement || document.head || document.body).appendChild(script);
      script.remove();
    }
  }

  async function fetchAndVerify(manifest) {
    const source = await gmRequest('GET', withCacheBust(manifest.scriptUrl));
    const hash = await sha256Hex(source);
    if (hash !== manifest.sha256) {
      throw new Error(`script sha256 mismatch: expected ${manifest.sha256}, got ${hash}`);
    }
    GM_setValue('cachedManifest', JSON.stringify(manifest));
    GM_setValue('cachedSource', source);
    return { source, hash };
  }

  async function installSource(manifest, source, reason) {
    if (!isGamePage()) return false;
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
    await runInPage(source, manifest.scriptUrl);
    await new Promise(resolve => setTimeout(resolve, 150));
    const status = getBotStatus();
    if (!status || !status.running || String(status.sourceHash || '') !== String(manifest.sha256 || '')) {
      throw new Error(`bot install did not confirm: ${JSON.stringify(status || null).slice(0, 300)}`);
    }
    state.lastManifestHash = String(manifest.sha256 || '');
    state.lastManifestVersion = String(manifest.version || '');
    state.lastInstallAt = Date.now();
    state.lastInstallReason = reason || '';
    postDebug('install', { reason, version: manifest.version, sha256: manifest.sha256, status }, { force: true });
    return true;
  }

  async function installCached(reason, options = {}) {
    if (!isGamePage()) return false;
    const manifest = readCachedManifest();
    const source = GM_getValue('cachedSource', '');
    if (!manifest || !source) return false;
    if (!options.force && !botNeedsInstall(manifest)) return true;
    const hash = await sha256Hex(source);
    if (hash !== manifest.sha256) throw new Error(`cached script sha256 mismatch: expected ${manifest.sha256}, got ${hash}`);
    await installSource(manifest, source, reason);
    postDebug('cached-install', { reason, version: manifest.version, sha256: manifest.sha256 }, { force: true });
    return true;
  }

  async function installManifest(manifest, reason) {
    if (!isGamePage()) return false;
    if (!botNeedsInstall(manifest)) return true;
    const { source } = await fetchAndVerify(manifest);
    await installSource(manifest, source, reason);
    state.lastError = '';
    return true;
  }

  async function pollOnce(reason = 'poll') {
    if (!isGamePage() || state.installing || state.polling) return;
    state.polling = true;
    state.installing = true;
    try {
      const manifest = parseManifest(await gmRequest('GET', withCacheBust(cfg.manifestUrl)));
      if (!botNeedsInstall(manifest)) {
        postDebug('ok', { reason, version: manifest.version, sha256: manifest.sha256 });
        return;
      }
      await installManifest(manifest, reason);
    } catch (err) {
      state.lastError = err?.message || String(err);
      postDebug('error', { reason, error: state.lastError }, { force: true });
      const status = getBotStatus();
      if (!status || !status.running) {
        try {
          await installCached(state.lastError, { force: true });
        } catch (cacheErr) {
          postDebug('cached-error', { error: cacheErr?.message || String(cacheErr) }, { force: true });
        }
      }
    } finally {
      state.installing = false;
      state.polling = false;
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
    const shouldLogin = Boolean(loginControl)
      || !hasToken
      || (!hasSelf && /login|required|no-self/i.test(decisionReason) && hasLoginRequiredText());
    if (!shouldLogin) return false;
    state.lastLoginAt = t;
    const detail = {
      reason,
      hasToken,
      hasSelf,
      decisionReason,
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
    if (state.installing) return;
    const manifest = readCachedManifest();
    const status = getBotStatus();
    const missing = !status || !status.running;
    const stale = status && tickIsStale(status);
    const mismatched = manifest && status && status.running
      && (String(status.sourceHash || '') !== String(manifest.sha256 || '') || String(status.version || '') !== String(manifest.version || ''));
    if (!missing && !stale && !mismatched) {
      await maybeStartGameLogin(reason);
      return;
    }
    try {
      if (!manifest) {
        await pollOnce(reason);
        return;
      }
      state.installing = true;
      await installCached(reason, { force: true });
    } catch (err) {
      state.lastError = err?.message || String(err);
      postDebug('watchdog-error', { reason, error: state.lastError, missing, stale, mismatched }, { force: true });
    } finally {
      state.installing = false;
    }
    await maybeStartGameLogin(reason);
  }

  unsafeWindow.__graspRatBotBootstrap = {
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

  (async () => {
    state.installing = true;
    try {
      await installCached('startup', { force: true });
    } catch (err) {
      postDebug('cached-error', { reason: 'startup', error: err?.message || String(err) }, { force: true });
    } finally {
      state.installing = false;
    }
    pollOnce('startup');
  })();
  watchdogOnce('startup').catch(() => {});
  setInterval(() => pollOnce('interval'), cfg.pollMs);
  setInterval(() => watchdogOnce('interval').catch(() => {}), cfg.watchdogMs);
})();
