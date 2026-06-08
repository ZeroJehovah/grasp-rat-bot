// ==UserScript==
// @name         Grasp Rat Bot Bootstrap
// @namespace    https://github.com/grasp-rat-bot
// @version      0.1.0
// @description  Loads and hot-updates the Grasp Rat bot from a signed manifest.
// @match        https://grasp-rat-game.h-e.top/*
// @run-at       document-idle
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

  const DEFAULTS = {
    manifestUrl: 'https://raw.githubusercontent.com/ZeroJehovah/grasp-rat-bot/main/dist/manifest.json',
    debug: true,
    debugEndpoint: 'http://127.0.0.1:18777/events',
    pollMs: 1000,
    debugEveryMs: 1000,
    statusEvery: 1000,
    cacheBust: true
  };

  const cfg = {
    manifestUrl: String(GM_getValue('manifestUrl', DEFAULTS.manifestUrl) || DEFAULTS.manifestUrl),
    debug: Boolean(GM_getValue('debug', DEFAULTS.debug)),
    debugEndpoint: String(GM_getValue('debugEndpoint', DEFAULTS.debugEndpoint) || DEFAULTS.debugEndpoint),
    pollMs: Math.max(250, Number(GM_getValue('pollMs', DEFAULTS.pollMs)) || DEFAULTS.pollMs),
    debugEveryMs: Math.max(250, Number(GM_getValue('debugEveryMs', DEFAULTS.debugEveryMs)) || DEFAULTS.debugEveryMs),
    statusEvery: Math.max(250, Number(GM_getValue('statusEvery', DEFAULTS.statusEvery)) || DEFAULTS.statusEvery),
    cacheBust: Boolean(GM_getValue('cacheBust', DEFAULTS.cacheBust))
  };

  const state = {
    installing: false,
    lastManifestHash: '',
    lastInstallAt: 0,
    lastError: '',
    lastDebugAt: 0
  };

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
    const manifest = JSON.parse(text);
    if (!manifest || typeof manifest !== 'object') throw new Error('manifest is not an object');
    if (!manifest.scriptUrl) throw new Error('manifest.scriptUrl missing');
    if (!manifest.sha256) throw new Error('manifest.sha256 missing');
    return manifest;
  }

  function getBotStatus() {
    try {
      const bot = unsafeWindow.__graspRatBot || null;
      return bot?.status ? bot.status() : null;
    } catch (err) {
      return { running: false, message: err?.message || String(err) };
    }
  }

  function botNeedsInstall(manifest) {
    const status = getBotStatus();
    if (!status || !status.running) return true;
    if (String(status.sourceHash || '') !== String(manifest.sha256 || '')) return true;
    if (String(status.version || '') !== String(manifest.version || '')) return true;
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

  async function installSource(manifest, source) {
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
    state.lastManifestHash = manifest.sha256;
    state.lastInstallAt = Date.now();
    postDebug('install', { version: manifest.version, sha256: manifest.sha256, status }, { force: true });
  }

  async function installCached(reason) {
    const rawManifest = GM_getValue('cachedManifest', '');
    const source = GM_getValue('cachedSource', '');
    if (!rawManifest || !source) return false;
    const manifest = parseManifest(rawManifest);
    if (!botNeedsInstall(manifest)) return true;
    await installSource(manifest, source);
    postDebug('cached-install', { reason, version: manifest.version, sha256: manifest.sha256 }, { force: true });
    return true;
  }

  async function pollOnce() {
    if (state.installing) return;
    state.installing = true;
    try {
      const manifest = parseManifest(await gmRequest('GET', withCacheBust(cfg.manifestUrl)));
      if (!botNeedsInstall(manifest)) {
        postDebug('ok', { version: manifest.version, sha256: manifest.sha256 });
        return;
      }
      const { source } = await fetchAndVerify(manifest);
      await installSource(manifest, source);
      state.lastError = '';
    } catch (err) {
      state.lastError = err?.message || String(err);
      postDebug('error', { error: state.lastError }, { force: true });
      const status = getBotStatus();
      if (!status || !status.running) {
        try {
          await installCached(state.lastError);
        } catch (cacheErr) {
          postDebug('cached-error', { error: cacheErr?.message || String(cacheErr) }, { force: true });
        }
      }
    } finally {
      state.installing = false;
    }
  }

  unsafeWindow.__graspRatBotBootstrap = {
    config: cfg,
    state,
    pollOnce,
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

  pollOnce();
  setInterval(pollOnce, cfg.pollMs);
})();
