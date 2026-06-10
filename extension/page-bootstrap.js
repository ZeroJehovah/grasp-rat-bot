(function () {
  'use strict';

  const GAME_ORIGIN = 'https://grasp-rat-game.h-e.top';
  const AUTH_ORIGIN = 'https://connect.linux.do';
  const BOOTSTRAP_VERSION = '0.1.8';
  const BOOTSTRAP_OWNER = 'extension';
  const LOADER_UPDATE_URL = 'https://raw.githubusercontent.com/ZeroJehovah/grasp-rat-bot/main/extension/page-bootstrap.js';
  const MIN_REMOTE_BOT_VERSION = 'bootstrap-0.4.0';
  const PANEL_ID = 'grasp-rat-bot-panel';
  const PAUSED_KEY = 'graspRatBotPaused';
  const PAUSE_REASON_KEY = 'graspRatBotPauseReason';
  const LOGIN_SUPPRESS_KEY = 'graspRatLoginSuppressUntil';
  const LOGIN_SUPPRESS_REASON_KEY = 'graspRatLoginSuppressReason';
  const ENEMY_LEAVE_STATE_KEY = 'graspRatEnemyLeaveState';
  const OFFLINE_LEAVE_STATE_KEY = 'graspRatOfflineLeaveState';
  const CLOUDFLARE_RELOAD_KEY = 'graspRatCloudflareReloadAt';
  const REQUEST_CHANNEL = 'grasp-rat-extension-bridge-request';
  const RESPONSE_CHANNEL = 'grasp-rat-extension-bridge-response';

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
    loaderUpdateUrl: LOADER_UPDATE_URL,
    pollMs: 5000,
    loaderVersionCheckMs: 300000,
    watchdogMs: 1000,
    busyLeaseMs: 12000,
    requestTimeoutMs: 7000,
    fallbackStaggerMs: 1200,
    staleTickMs: 3000,
    statusEvery: 1000,
    scriptStartupTimeoutMs: 2500,
    installConfirmMs: 3500,
    restartAfterCacheUpdateMs: 800,
    loginCooldownMs: 5000,
    postLoginGraceMs: 45000,
    authReturnGraceMs: 45000,
    authorizeCooldownMs: 1000,
    authorizeFallbackDelayMs: 10000,
    panelUpdateMs: 500,
    cloudflareErrorReloadMs: 5000,
    cacheBust: true,
    autoLogin: true
  };

  let cfg = { ...DEFAULTS };
  let storedValues = {};
  let bootstrapApi = null;
  const bridgePending = new Map();
  const timers = new Set();

  const state = {
    bootId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    installing: false,
    polling: false,
    disabled: false,
    disabledReason: '',
    lastPollAt: 0,
    lastManifestFetchAt: 0,
    lastScriptFetchAt: 0,
    lastManifestHash: '',
    lastManifestVersion: '',
    checkingLoaderVersion: false,
    lastLoaderVersionCheckAt: 0,
    lastLoaderVersionStatus: '',
    latestLoaderVersion: '',
    latestLoaderUrl: '',
    loaderUpdateAvailable: false,
    loaderUpdateError: '',
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
    lastManifestStatus: '',
    lastScriptStatus: '',
    lastRemoteStatus: '',
    lastPanelUpdateAt: 0,
    paused: false,
    pauseReason: '',
    pauseChangedAt: 0,
    cloudflareError: null,
    cloudflareReloadAt: 0,
    busyStartedAt: 0,
    busyReason: '',
    busyToken: ''
  };

  window.addEventListener('message', event => {
    if (event.source !== window) return;
    const message = event.data || {};
    if (message.channel !== RESPONSE_CHANNEL || !message.id) return;
    const pending = bridgePending.get(message.id);
    if (!pending) return;
    bridgePending.delete(message.id);
    clearTimeout(pending.timer);
    const response = message.response || {};
    if (response.ok === false) pending.reject(new Error(response.error || 'extension bridge request failed'));
    else pending.resolve(response);
  });

  function bridge(type, payload = {}, timeoutMs = 9000) {
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        bridgePending.delete(id);
        reject(new Error(`${type} timed out`));
      }, Math.max(1000, Number(timeoutMs) || 9000));
      bridgePending.set(id, { resolve, reject, timer });
      window.postMessage({ channel: REQUEST_CHANNEL, id, type, payload }, '*');
    });
  }

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

  function safeStringify(value, maxLength = 0) {
    const seen = new WeakSet();
    let text = '';
    try {
      text = JSON.stringify(value, (key, item) => {
        if (typeof item === 'bigint') return String(item);
        if (item && typeof item === 'object') {
          if (seen.has(item)) return '[Circular]';
          seen.add(item);
        }
        return item;
      });
    } catch (err) {
      text = JSON.stringify({ error: err?.message || String(err) });
    }
    text = String(text ?? '');
    if (maxLength > 0 && text.length > maxLength) return text.slice(0, maxLength);
    return text;
  }

  function logBootstrap(message, detail) {
    try {
      console.log('[grasp-rat-extension]', `${BOOTSTRAP_VERSION} ${state.bootId} ${message}`, detail || '');
    } catch (_) {}
  }

  function noteBootstrapError(message, err, detail = {}) {
    const error = err?.message || String(err);
    state.lastError = `${message}: ${error}`;
    logBootstrap(message, { ...detail, error });
    return state.lastError;
  }

  function runSafely(label, fn) {
    try {
      if (!ensureNotBlocked()) return null;
      const result = fn();
      if (result && typeof result.then === 'function') {
        result.catch(err => recordBootstrapException(label, err));
      }
      return result;
    } catch (err) {
      recordBootstrapException(label, err);
      return null;
    }
  }

  function runAsyncSafely(label, fn) {
    return Promise.resolve()
      .then(() => {
        if (!ensureNotBlocked()) return null;
        return fn();
      })
      .catch(err => {
        recordBootstrapException(label, err);
        return null;
      });
  }

  function setSafeTimeout(label, fn, ms) {
    const timer = setTimeout(() => {
      timers.delete(timer);
      runSafely(label, fn);
    }, ms);
    timers.add(timer);
    return timer;
  }

  function setSafeInterval(label, fn, ms) {
    const timer = setInterval(() => runSafely(label, fn), ms);
    timers.add(timer);
    return timer;
  }

  function clearAllTimers() {
    for (const timer of timers) {
      clearTimeout(timer);
      clearInterval(timer);
    }
    timers.clear();
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

  function isGamePage() {
    return location.origin === GAME_ORIGIN;
  }

  function isAuthorizePage() {
    return location.origin === AUTH_ORIGIN && location.pathname.startsWith('/oauth2/authorize');
  }

  function isGameAuthCallback() {
    return isGamePage() && location.pathname.startsWith('/auth/linuxdo/callback');
  }

  function tampermonkeyDetected() {
    try {
      if (window.__graspRatBotTampermonkeyBootstrapPresent === true) return true;
      if (window.__graspRatBotBootstrapOwner === 'tampermonkey') return true;
      const api = window.__graspRatBotBootstrap;
      if (!api || api === bootstrapApi) return false;
      if (api.owner === 'extension' || api.injectedBy === 'extension' || api.extensionBootId === state.bootId) return false;
      return Boolean(api.version || api.pollOnce || api.watchdogOnce);
    } catch (_) {
      return false;
    }
  }

  function disableForTampermonkey(reason = 'tampermonkey bootstrap detected') {
    if (state.disabled) return false;
    state.disabled = true;
    state.disabledReason = reason;
    state.lastError = `extension disabled: ${reason}`;
    clearAllTimers();
    clearBusy(state.busyToken);
    try {
      if (window.__graspRatBotBootstrapOwner === BOOTSTRAP_OWNER) window.__graspRatBotBootstrapOwner = 'tampermonkey';
    } catch (_) {}
    logBootstrap('disabled because Tampermonkey bootstrap is present', { reason });
    return true;
  }

  function ensureNotBlocked() {
    if (state.disabled) return false;
    if (tampermonkeyDetected()) {
      disableForTampermonkey();
      return false;
    }
    return true;
  }

  function storedBoolean(value) {
    return value === true || value === 'true' || value === 1 || value === '1';
  }

  function readStored(key, fallback = '') {
    return storedValues[key] !== undefined ? storedValues[key] : fallback;
  }

  function writeStored(items) {
    storedValues = { ...storedValues, ...(items || {}) };
    bridge('storageSet', { items }).catch(err => noteBootstrapError('storage write failed', err));
  }

  async function loadStoredValues() {
    const defaults = {
      ...DEFAULTS,
      cachedManifest: '',
      cachedSource: '',
      [PAUSED_KEY]: false,
      [PAUSE_REASON_KEY]: '',
      [LOGIN_SUPPRESS_KEY]: 0,
      [LOGIN_SUPPRESS_REASON_KEY]: ''
    };
    let result = null;
    let lastError = null;
    for (let attempt = 0; attempt < 20 && !result; attempt += 1) {
      try {
        result = await bridge('storageGet', { defaults }, Math.max(1000, DEFAULTS.requestTimeoutMs + 2000));
      } catch (err) {
        lastError = err;
        await sleep(100);
      }
    }
    if (!result) throw lastError || new Error('extension storage bridge unavailable');
    storedValues = result.values || defaults;
    cfg = {
      manifestUrl: String(readStored('manifestUrl', DEFAULTS.manifestUrl) || DEFAULTS.manifestUrl),
      loaderUpdateUrl: String(readStored('loaderUpdateUrl', DEFAULTS.loaderUpdateUrl) || DEFAULTS.loaderUpdateUrl),
      pollMs: Math.max(5000, Number(readStored('pollMs', DEFAULTS.pollMs)) || DEFAULTS.pollMs),
      loaderVersionCheckMs: Math.max(60000, Number(readStored('loaderVersionCheckMs', DEFAULTS.loaderVersionCheckMs)) || DEFAULTS.loaderVersionCheckMs),
      watchdogMs: Math.max(250, Number(readStored('watchdogMs', DEFAULTS.watchdogMs)) || DEFAULTS.watchdogMs),
      busyLeaseMs: Math.max(3000, Number(readStored('busyLeaseMs', DEFAULTS.busyLeaseMs)) || DEFAULTS.busyLeaseMs),
      requestTimeoutMs: Math.max(3000, Number(readStored('requestTimeoutMs', DEFAULTS.requestTimeoutMs)) || DEFAULTS.requestTimeoutMs),
      fallbackStaggerMs: Math.max(0, Number(readStored('fallbackStaggerMs', DEFAULTS.fallbackStaggerMs)) || DEFAULTS.fallbackStaggerMs),
      staleTickMs: Math.max(1000, Number(readStored('staleTickMs', DEFAULTS.staleTickMs)) || DEFAULTS.staleTickMs),
      statusEvery: Math.max(250, Number(readStored('statusEvery', DEFAULTS.statusEvery)) || DEFAULTS.statusEvery),
      scriptStartupTimeoutMs: Math.max(500, Number(readStored('scriptStartupTimeoutMs', DEFAULTS.scriptStartupTimeoutMs)) || DEFAULTS.scriptStartupTimeoutMs),
      installConfirmMs: Math.max(1000, Number(readStored('installConfirmMs', DEFAULTS.installConfirmMs)) || DEFAULTS.installConfirmMs),
      restartAfterCacheUpdateMs: Math.max(0, Number(readStored('restartAfterCacheUpdateMs', DEFAULTS.restartAfterCacheUpdateMs)) || DEFAULTS.restartAfterCacheUpdateMs),
      loginCooldownMs: Math.max(1000, Number(readStored('loginCooldownMs', DEFAULTS.loginCooldownMs)) || DEFAULTS.loginCooldownMs),
      postLoginGraceMs: Math.max(5000, Number(readStored('postLoginGraceMs', DEFAULTS.postLoginGraceMs)) || DEFAULTS.postLoginGraceMs),
      authReturnGraceMs: Math.max(5000, Number(readStored('authReturnGraceMs', DEFAULTS.authReturnGraceMs)) || DEFAULTS.authReturnGraceMs),
      authorizeCooldownMs: Math.max(250, Number(readStored('authorizeCooldownMs', DEFAULTS.authorizeCooldownMs)) || DEFAULTS.authorizeCooldownMs),
      authorizeFallbackDelayMs: Math.max(0, Number(readStored('authorizeFallbackDelayMs', DEFAULTS.authorizeFallbackDelayMs)) || DEFAULTS.authorizeFallbackDelayMs),
      panelUpdateMs: Math.max(250, Number(readStored('panelUpdateMs', DEFAULTS.panelUpdateMs)) || DEFAULTS.panelUpdateMs),
      cloudflareErrorReloadMs: Math.max(1000, Number(readStored('cloudflareErrorReloadMs', DEFAULTS.cloudflareErrorReloadMs)) || DEFAULTS.cloudflareErrorReloadMs),
      cacheBust: Boolean(storedBoolean(readStored('cacheBust', DEFAULTS.cacheBust))),
      autoLogin: Boolean(storedBoolean(readStored('autoLogin', DEFAULTS.autoLogin)))
    };
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[ch]));
  }

  function formatDistance(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '-';
    const meters = n / 100;
    if (Math.abs(meters) < 10) return `${Number(meters.toFixed(1))}米`;
    return `${Math.round(meters)}米`;
  }

  function formatDuration(ms) {
    const n = Math.max(0, Math.round(Number(ms) || 0));
    if (n >= 3600000) return `${Math.floor(n / 3600000)}h${String(Math.floor((n % 3600000) / 60000)).padStart(2, '0')}m`;
    if (n >= 60000) return `${Math.floor(n / 60000)}m${String(Math.floor((n % 60000) / 1000)).padStart(2, '0')}s`;
    return `${Math.ceil(n / 1000)}s`;
  }

  function readPersistentExitState(key, t = Date.now()) {
    let detail = null;
    try {
      detail = JSON.parse(localStorage.getItem(key) || 'null');
    } catch (_) {
      detail = null;
    }
    if (!detail || typeof detail !== 'object') return null;
    const reloginUntil = Number(detail.reloginUntil || 0);
    if (reloginUntil && reloginUntil <= t) {
      try {
        localStorage.removeItem(key);
      } catch (_) {}
      return null;
    }
    if (reloginUntil) detail.holdRemainingMs = Math.max(0, Math.round(reloginUntil - t));
    const base = String(detail.summary || detail.exitSummary || detail.enemyLeaveSummary || detail.reason || '').trim();
    if (base && !detail.displayReason) {
      const waitMs = Number(detail.holdRemainingMs || detail.reloginDelayMs || 0);
      detail.displayReason = base + (waitMs > 0 ? '，等待' + formatDuration(waitMs) : '');
    }
    return detail;
  }

  function activePersistentExitDetail(status) {
    const enemyStatus = status?.enemyLeave || null;
    const offlineStatus = status?.offlineLeave || null;
    if (Number(enemyStatus?.holdRemainingMs || 0) > 0 || enemyStatus?.displayReason) return enemyStatus;
    if (Number(offlineStatus?.holdRemainingMs || 0) > 0 || offlineStatus?.displayReason) return offlineStatus;
    const enemyStored = readPersistentExitState(ENEMY_LEAVE_STATE_KEY);
    if (enemyStored) return enemyStored;
    return readPersistentExitState(OFFLINE_LEAVE_STATE_KEY);
  }

  function decisionReasonDetail(decision, status) {
    const persistent = activePersistentExitDetail(status);
    return decision?.leave?.displayReason
      || decision?.displayReason
      || decision?.enemyLeave?.displayReason
      || decision?.offlineLeave?.displayReason
      || status?.enemyLeave?.displayReason
      || status?.offlineLeave?.displayReason
      || persistent?.displayReason
      || decision?.leave?.summary
      || decision?.exitSummary
      || decision?.leave?.exitSummary
      || decision?.leave?.enemyLeaveSummary
      || decision?.leave?.enemyLeaveReason
      || '';
  }

  function cloudflareErrorInfo() {
    if (!isGamePage()) return null;
    const title = String(document.title || '');
    const text = String(document.body?.innerText || '').slice(0, 5000);
    const combined = title + '\n' + text;
    const isCloudflareError = /Error\s*1033/i.test(combined)
      || /Cloudflare\s+Tunnel\s+error/i.test(combined)
      || (/Cloudflare/i.test(combined) && /unable\s+to\s+resolve/i.test(combined));
    const isBunkerWebError = /BunkerWeb/i.test(combined)
      && (/\b403\b/i.test(combined) || /Forbidden/i.test(combined) || /client-side\s+error/i.test(combined) || /Access\s+is\s+forbidden/i.test(combined));
    if (!isCloudflareError && !isBunkerWebError) {
      state.cloudflareError = null;
      return null;
    }
    const t = Date.now();
    const intervalMs = Math.max(1000, Number(cfg.cloudflareErrorReloadMs) || 5000);
    let lastReloadAt = 0;
    try {
      lastReloadAt = Number(localStorage.getItem(CLOUDFLARE_RELOAD_KEY) || 0) || 0;
    } catch (_) {}
    const elapsedMs = lastReloadAt ? t - lastReloadAt : intervalMs;
    const remainingMs = Math.max(0, intervalMs - elapsedMs);
    const code = /Error\s*1033/i.test(combined) ? '1033' : (isBunkerWebError ? '403' : '');
    const label = isBunkerWebError ? 'BunkerWeb 403 错误页' : (code ? 'Cloudflare Error ' + code : 'Cloudflare 错误页');
    return {
      error: true,
      code,
      label,
      provider: isBunkerWebError ? 'bunkerweb' : 'cloudflare',
      intervalMs,
      lastReloadAt,
      remainingMs,
      displayReason: label + '，每' + formatDuration(intervalMs) + '刷新一次' + (remainingMs > 0 ? '，下次刷新剩余' + formatDuration(remainingMs) : '，正在刷新')
    };
  }

  function maybeReloadCloudflareError(info = cloudflareErrorInfo()) {
    if (!info) return false;
    state.cloudflareError = info;
    state.lastInstallStatus = info.displayReason;
    updateBootstrapPanel(true);
    if (Number(info.remainingMs || 0) > 0) return true;
    try {
      localStorage.setItem(CLOUDFLARE_RELOAD_KEY, String(Date.now()));
    } catch (_) {}
    state.cloudflareReloadAt = Date.now();
    logBootstrap('cloudflare error reload', info);
    location.reload();
    return true;
  }

  function formatNumber(value, fallback = '-') {
    const n = Number(value);
    return Number.isFinite(n) ? String(Math.round(n)) : fallback;
  }

  function formatStamina(self) {
    if (!self) return '-';
    const stamina = self.stamina || {};
    const valueText = (remaining, limit) => {
      const r = Number(remaining);
      if (!Number.isFinite(r)) return '-';
      const l = Number(limit);
      return Math.floor(r / 1000) + '/' + (Number.isFinite(l) && l > 0 ? Math.floor(l / 1000) : '-');
    };
    const exhausted = Array.isArray(stamina.exhausted) ? stamina.exhausted : [];
    const suffix = exhausted.length ? ' !' + exhausted.join('/') : '';
    return '5s ' + valueText(stamina.stamina5s ?? self.stamina5s ?? self.stamina_5s_remaining_milli, stamina.stamina5sLimit ?? self.stamina5sLimit ?? self.stamina_5s_limit_milli)
      + ' 1h ' + valueText(stamina.stamina1h ?? self.stamina1h ?? self.stamina_1h_remaining_milli, stamina.stamina1hLimit ?? self.stamina1hLimit ?? self.stamina_1h_limit_milli)
      + ' 1d ' + valueText(stamina.stamina1d ?? self.stamina1d ?? self.stamina_1d_remaining_milli, stamina.stamina1dLimit ?? self.stamina1dLimit ?? self.stamina_1d_limit_milli)
      + suffix;
  }

  function reasonText(reason) {
    const map = {
      'active-threat-before-bullet-range': 'Active 玩家进入危险圈',
      'active-threat-caution-migration': 'Active 玩家进入预警圈',
      'active-threat-return-block': '阻止回头靠近 Active 玩家',
      'return-block-lateral-scan': 'Active 返程冷却：横向扫描',
      'passive-panic-distance': '玩家距离过近',
      'recovery-avoid-humans': '回血时避开附近玩家',
      'recovery-foot-coin': '回血时顺手拾取脚下金币',
      'foot-coin-priority': '贴身金币优先拾取',
      'post-attack-drop-coin': '战斗后优先拾取掉落',
      'best-opportunity-coin': '综合收益最高：拾取金币',
      'best-opportunity-visible-coin': '综合收益最高：前往可见金币',
      'best-opportunity-drop-target': '综合收益最高：攻击 Drop 目标',
      'best-opportunity-afk-drop-target': '综合收益最高：攻击挂机 Drop 目标',
      'approach-profitable-drop-target': '综合收益最高：靠近高 Drop 目标',
      'approach-afk-drop-target': '综合收益最高：靠近挂机 Drop 目标',
      'opportunistic-afk-drop-shot': '顺手射击挂机 Drop 目标',
      'migrate-to-known-field': '迁移到金币密集区域',
      'snapshot-coin-field': '快照金币区域导航',
      'snapshot-coin-target': '快照金币导航',
      'snapshot-coin-idle-timeout': '等待超时，前往远处快照金币',
      'wait-for-stamina-budget': '长期体力预算不足',
      'wait-for-snapshot-coin': '等待快照金币',
      'wait-for-full-stamina-and-hp': '等待恢复到安全状态',
      'combat-attack': '战斗：持续开火',
      'combat-tangent-dodge': '战斗：切线规避并开火',
      'combat-reengage': '战斗：重新靠近目标',
      'combat-critical-hp-leave': '战斗血量低于 20，立即退出',
      'combat-low-hp-leave': '战斗低血劣势，立即退出',
      'combat-hp-disadvantage-leave': '战斗血量差劣势，立即退出',
      'combat-leave': '战斗劣势退出后等待',
      'combat-leave-retry': '战斗退出失败，等待补发退出',
      'injury-leave': '受伤后立即退出',
      'enemy-leave-wait': '敌方行为退出后等待',
      'pursuit-leave': '被同一玩家持续追击，退出等待',
      'pursuit-leave-retry': '追击退出失败，等待补发退出',
      'pursuit-leave-wait': '追击退出后等待重新登录',
      'paused': '手动暂停',
      'auto-login': '自动触发登录/加入',
      'login-cooldown': '登录已触发，等待页面跳转',
      'control-ws-offline': 'WebSocket 离线',
      'control-ws-offline-unsafe': 'WebSocket 离线且周围危险，立即退出',
      'control-ws-offline-safe-wait': 'WebSocket 离线，安全区短暂等待重连',
      'control-ws-server-position-stalled': '服务端位置停止，按 WebSocket 离线处理',
      'control-stamina-exhausted': '长周期体力耗尽，按 WebSocket 离线处理',
      'stamina-exhausted-leave': '长周期体力耗尽，正在退出',
      'offline-leave': 'WebSocket 离线，正在退出',
      'offline-leave-wait': 'WebSocket 离线退出后等待重连',
      'cloudflare-error-refresh': 'Cloudflare 错误页，等待刷新',
      'no-self': '未读到自身实体',
      'not-alive': '不在存活状态',
      'bot-error': '脚本异常'
    };
    return map[reason] || reason || '-';
  }

  function actionText(decision, status) {
    if (status?.paused || isPaused()) return '已暂停';
    if (state.cloudflareError) return '等待：' + state.cloudflareError.label;
    const kind = decision?.kind || (status?.running ? 'wait' : 'missing');
    const target = decision?.target || null;
    const threats = Array.isArray(decision?.threats) ? decision.threats : [];
    const detail = decisionReasonDetail(decision, status);
    if (kind === 'coin') return '拾取金币' + (target ? ' #' + (target.id ?? '-') + ' 距离 ' + formatDistance(target.distance) : '');
    if (kind === 'seek-coin') return '前往金币' + (target ? ' #' + (target.id ?? '-') + ' 距离 ' + formatDistance(target.distance) : '');
    if (kind === 'attack') return (decision?.combat ? '战斗 ' : '攻击 ') + (target?.name || ('#' + (target?.id ?? '-'))) + ' HP ' + (target?.hp ?? '-') + ' Drop ' + (target?.drop ?? '-');
    if (kind === 'seek-enemy' || kind === 'seek-drop') return '前往目标 ' + (target?.name || ('#' + (target?.id ?? '-'))) + (target?.drop ? ' Drop ' + target.drop : '');
    if (kind === 'flee') {
      const threat = threats[0];
      return '避险撤离' + (threat ? '：' + (threat.name || ('#' + threat.id)) + ' 距离 ' + formatDistance(threat.d ?? threat.distance) : '');
    }
    if (kind === 'recover') return '恢复体力/血量';
    if (kind === 'patrol') return target ? '巡航到 #' + (target.id ?? '-') + ' 距离 ' + formatDistance(target.distance) : '巡航扫描';
    if (kind === 'wait') return '等待：' + (detail || reasonText(decision?.reason));
    if (kind === 'leave') return '退出：' + (detail || reasonText(decision?.reason));
    if (kind === 'idle') return '待命';
    if (kind === 'missing') return '远端未运行';
    return kind;
  }

  function readLocalSuppress() {
    try {
      return {
        until: Number(localStorage.getItem(LOGIN_SUPPRESS_KEY) || 0) || 0,
        reason: String(localStorage.getItem(LOGIN_SUPPRESS_REASON_KEY) || '')
      };
    } catch (_) {
      return { until: 0, reason: '' };
    }
  }

  function currentSuppressEntry() {
    const extension = {
      until: Number(readStored(LOGIN_SUPPRESS_KEY, 0)) || 0,
      reason: String(readStored(LOGIN_SUPPRESS_REASON_KEY, '') || '')
    };
    const memory = {
      until: Number(state.lastLoginSuppressUntil || 0) || 0,
      reason: String(state.lastLoginSuppressReason || '')
    };
    const local = readLocalSuppress();
    return [extension, memory, local].sort((a, b) => Number(b.until || 0) - Number(a.until || 0))[0] || { until: 0, reason: '' };
  }

  function suppressLogin(reason, ms) {
    const requestedUntil = Date.now() + Math.max(1000, Number(ms || cfg.postLoginGraceMs) || cfg.postLoginGraceMs);
    const existing = currentSuppressEntry();
    const reuseExisting = Number(existing.until || 0) > requestedUntil;
    const until = reuseExisting ? Number(existing.until || 0) : requestedUntil;
    state.lastLoginSuppressReason = reuseExisting
      ? String(existing.reason || reason || 'login flow')
      : String(reason || 'login flow');
    state.lastLoginSuppressUntil = until;
    writeStored({
      [LOGIN_SUPPRESS_KEY]: until,
      [LOGIN_SUPPRESS_REASON_KEY]: state.lastLoginSuppressReason
    });
    try {
      localStorage.setItem(LOGIN_SUPPRESS_KEY, String(until));
      localStorage.setItem(LOGIN_SUPPRESS_REASON_KEY, state.lastLoginSuppressReason);
    } catch (_) {}
    return until;
  }

  function loginSuppressRemainingMs() {
    const entry = currentSuppressEntry();
    const until = Number(entry.until || 0) || 0;
    const remaining = Math.max(0, until - Date.now());
    if (!remaining && until) {
      writeStored({ [LOGIN_SUPPRESS_KEY]: 0, [LOGIN_SUPPRESS_REASON_KEY]: '' });
      state.lastLoginSuppressUntil = 0;
      state.lastLoginSuppressReason = '';
      try {
        localStorage.removeItem(LOGIN_SUPPRESS_KEY);
        localStorage.removeItem(LOGIN_SUPPRESS_REASON_KEY);
      } catch (_) {}
    } else if (remaining) {
      state.lastLoginSuppressUntil = until;
      state.lastLoginSuppressReason = String(entry.reason || state.lastLoginSuppressReason || 'login flow');
      try {
        localStorage.setItem(LOGIN_SUPPRESS_KEY, String(until));
        localStorage.setItem(LOGIN_SUPPRESS_REASON_KEY, state.lastLoginSuppressReason);
      } catch (_) {}
    }
    return remaining;
  }

  function clearCurrentReloginHold(reason = 'panel immediate login', options = {}) {
    const t = Date.now();
    const entry = currentSuppressEntry();
    const clearBot = options.clearBot !== false;
    const clearLocal = options.clearLocal !== false;
    const clearPersistent = options.clearPersistent !== false;
    writeStored({ [LOGIN_SUPPRESS_KEY]: 0, [LOGIN_SUPPRESS_REASON_KEY]: '' });
    state.lastLoginSuppressUntil = 0;
    state.lastLoginSuppressReason = '';
    state.lastLoginAt = 0;
    try {
      if (clearLocal) {
        localStorage.removeItem(LOGIN_SUPPRESS_KEY);
        localStorage.removeItem(LOGIN_SUPPRESS_REASON_KEY);
      }
      if (clearPersistent) {
        localStorage.removeItem(ENEMY_LEAVE_STATE_KEY);
        localStorage.removeItem(OFFLINE_LEAVE_STATE_KEY);
      }
    } catch (_) {}
    const bot = clearBot ? (window.__graspRatBot || null) : null;
    if (bot && typeof bot === 'object') {
      bot.pursuitReloginUntil = 0;
      bot.offlineReloginUntil = 0;
      ['lastEnemyLeaveResult', 'lastPursuitLeaveResult', 'lastCombatLeaveResult', 'lastInjuryLeaveResult', 'lastOfflineLeaveResult'].forEach(key => {
        const detail = bot[key];
        if (!detail || typeof detail !== 'object') return;
        const reloginUntil = Number(detail.reloginUntil || 0) || 0;
        const previousHoldRemainingMs = Math.max(0, Math.round(reloginUntil - t));
        if (reloginUntil && !detail.manualLoginBypassPreviousReloginUntil) {
          detail.manualLoginBypassPreviousReloginUntil = reloginUntil;
        }
        if (previousHoldRemainingMs && !detail.manualLoginBypassPreviousHoldMs) {
          detail.manualLoginBypassPreviousHoldMs = previousHoldRemainingMs;
        }
        detail.manualLoginBypassAt = t;
        detail.manualLoginBypassReason = String(reason || 'panel immediate login');
        detail.reloginUntil = 0;
        detail.holdRemainingMs = 0;
        detail.reloginDelayMs = 0;
        detail.reloginHpDelayMs = 0;
        detail.reloginMinimumDelayMs = 0;
      });
    }
    return {
      at: t,
      reason: String(reason || 'panel immediate login'),
      suppressReason: String(entry.reason || ''),
      suppressUntil: Number(entry.until || 0) || 0,
      suppressRemainingMs: Math.max(0, Math.round((Number(entry.until || 0) || 0) - t)),
      clearedRunningBot: Boolean(bot)
    };
  }

  function readPauseReason() {
    let reason = '';
    try {
      reason = String(localStorage.getItem(PAUSE_REASON_KEY) || '');
    } catch (_) {}
    return String(readStored(PAUSE_REASON_KEY, reason || '') || reason || '');
  }

  function isPaused(options = {}) {
    let localPaused = false;
    try {
      localPaused = localStorage.getItem(PAUSED_KEY) === 'true';
    } catch (_) {}
    const includePageFlag = options.includePageFlag !== false;
    const paused = Boolean(storedBoolean(readStored(PAUSED_KEY, false)) || localPaused || (includePageFlag && window.__graspRatBotPaused === true));
    state.paused = paused;
    state.pauseReason = paused ? (readPauseReason() || state.pauseReason || 'manual') : '';
    return paused;
  }

  function writePauseState(paused, reason = '') {
    const next = Boolean(paused);
    const text = next ? String(reason || state.pauseReason || 'manual') : '';
    state.paused = next;
    state.pauseReason = text;
    writeStored({ [PAUSED_KEY]: next, [PAUSE_REASON_KEY]: text });
    window.__graspRatBotPaused = next;
    window.__graspRatBotPauseReason = text;
    try {
      localStorage.setItem(PAUSED_KEY, next ? 'true' : 'false');
      if (next) localStorage.setItem(PAUSE_REASON_KEY, text || 'manual');
      else localStorage.removeItem(PAUSE_REASON_KEY);
    } catch (_) {}
    return next;
  }

  function syncPauseToPage(forcedPaused = null) {
    try {
      const paused = forcedPaused === null ? isPaused() : Boolean(forcedPaused);
      writePauseState(paused, paused ? (state.pauseReason || readPauseReason() || 'manual') : '');
      const bot = window.__graspRatBot || null;
      try {
        if (bot?.setPaused) {
          const reason = paused ? (state.pauseReason || 'bootstrap') : 'bootstrap resume';
          const botPaused = Boolean(bot.paused);
          const botReason = String(bot.pauseReason || '');
          if (botPaused !== paused || (paused && botReason !== reason)) bot.setPaused(paused, reason);
        } else if (paused && bot?.stop) {
          bot.stop('paused by extension bootstrap');
        }
      } catch (err) {
        noteBootstrapError('pause sync failed', err);
      }
      return paused;
    } catch (err) {
      noteBootstrapError('pause state sync failed', err);
      return Boolean(state.paused);
    }
  }

  function setPaused(paused, reason = 'panel') {
    state.paused = Boolean(paused);
    state.pauseReason = state.paused ? String(reason || 'manual') : '';
    state.pauseChangedAt = Date.now();
    writePauseState(state.paused, state.pauseReason);
    syncPauseToPage(state.paused);
    state.lastInstallStatus = state.paused ? 'paused by user' : 'resumed by user';
    logBootstrap(state.paused ? 'paused' : 'resumed', { reason: state.pauseReason || reason });
    updateBootstrapPanel(true);
    return state.paused;
  }

  function ensureBootstrapPanel() {
    if (!isGamePage() || !document.body) return null;
    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement('div');
      panel.id = PANEL_ID;
      document.body.appendChild(panel);
    }
    panel.setAttribute('aria-live', 'polite');
    panel.style.cssText = [
      'position:fixed',
      'right:12px',
      'top:12px',
      'z-index:2147483647',
      'width:min(360px,calc(100vw - 24px))',
      'max-width:360px',
      'box-sizing:border-box',
      'padding:10px 12px',
      'border:1px solid rgba(148,163,184,.35)',
      'border-radius:8px',
      'background:rgba(15,23,42,.9)',
      'color:#e5e7eb',
      'font:12px/1.45 -apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif',
      'box-shadow:0 10px 32px rgba(0,0,0,.38)',
      'backdrop-filter:blur(8px)',
      'pointer-events:auto',
      'white-space:normal'
    ].join(';');
    return panel;
  }

  function renderBootstrapPanelError(message) {
    try {
      if (!isGamePage() || !document.body || state.disabled) return;
      const panel = ensureBootstrapPanel();
      if (!panel) return;
      panel.style.borderColor = 'rgba(248,113,113,.45)';
      panel.style.color = '#fee2e2';
      panel.textContent = `BOT 面板错误：${message || state.lastError || 'unknown error'}`;
    } catch (_) {}
  }

  function renderBootstrapPanel(force = false) {
    if (!isGamePage() || state.disabled) return;
    const t = Date.now();
    if (!force && t - Number(state.lastPanelUpdateAt || 0) < cfg.panelUpdateMs) return;
    state.lastPanelUpdateAt = t;
    const panel = ensureBootstrapPanel();
    if (!panel) return;
    const paused = isPaused();
    const status = getBotStatus();
    const decision = status?.lastDecision || null;
    const reasonDetail = state.cloudflareError?.displayReason || decisionReasonDetail(decision, status) || reasonText(decision?.reason);
    const self = status?.self || decision?.self || null;
    const safety = status?.safety || {};
    const control = status?.control || {};
    const manifest = readCachedManifest();
    const bVersion = status?.version || manifest?.version || state.lastManifestVersion || '-';
    const aVersion = BOOTSTRAP_VERSION;
    const wsLabel = control.wsOpen ? 'online' : (control.connecting ? 'connecting' : 'offline');
    const nearestActive = safety.nearestActive
      ? (safety.nearestActive.name || ('#' + safety.nearestActive.id)) + ' ' + formatDistance(safety.nearestActive.distance)
      : '-';
    const session = status?.session || {};
    const persistent = activePersistentExitDetail(status);
    const reloginHold = status?.enemyLeave?.holdRemainingMs || status?.pursuitLeave?.holdRemainingMs || status?.offlineLeave?.holdRemainingMs || persistent?.holdRemainingMs || 0;
    const showImmediateLogin = !state.cloudflareError && !paused && Number(reloginHold || 0) > 0;
    const buttonText = paused ? '继续' : '暂停';
    const buttonTitle = paused ? '恢复 bot 自动控制' : '暂停 bot，保留手动控制';
    while (panel.firstChild) panel.removeChild(panel.firstChild);
    const appendLine = (text, style = '') => {
      const line = document.createElement('div');
      if (style) line.style.cssText = style;
      line.textContent = String(text ?? '');
      panel.appendChild(line);
      return line;
    };
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px';
    const title = document.createElement('div');
    title.style.cssText = 'font-weight:700;font-size:13px;color:#f8fafc;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    title.textContent = 'BOT ' + actionText(decision, status);
    const button = document.createElement('button');
    button.type = 'button';
    button.title = buttonTitle;
    button.style.cssText = 'flex:0 0 auto;border:1px solid rgba(148,163,184,.45);border-radius:6px;background:' + (paused ? 'rgba(34,197,94,.2)' : 'rgba(239,68,68,.18)') + ';color:#f8fafc;font:12px/1.2 -apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;padding:4px 8px;cursor:pointer';
    button.textContent = buttonText;
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      setPaused(!isPaused(), 'panel button');
    }, { once: true });
    header.appendChild(title);
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;align-items:center;gap:6px;flex:0 0 auto';
    if (showImmediateLogin) {
      const loginButton = document.createElement('button');
      loginButton.type = 'button';
      loginButton.title = '忽略当前退出冷却，立即登录';
      loginButton.style.cssText = 'flex:0 0 auto;border:1px solid rgba(34,197,94,.55);border-radius:6px;background:rgba(34,197,94,.2);color:#f8fafc;font:12px/1.2 -apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;padding:4px 8px;cursor:pointer';
      loginButton.textContent = '立即登录';
      loginButton.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        loginButton.disabled = true;
        loginButton.style.cursor = 'default';
        loginButton.style.opacity = '.72';
        loginButton.textContent = '登录中';
        forceLoginNow('panel immediate login').catch(err => {
          noteBootstrapError('force login failed', err);
          updateBootstrapPanel(true);
        });
      }, { once: true });
      actions.appendChild(loginButton);
    }
    actions.appendChild(button);
    header.appendChild(actions);
    panel.appendChild(header);
    if (state.loaderUpdateAvailable) {
      appendLine(
        '加载器A（扩展）有新版本：当前 ' + aVersion + ' / 最新 ' + (state.latestLoaderVersion || '-') + '，请手动更新扩展',
        'margin:0 0 6px;padding:6px 8px;border:1px solid rgba(248,113,113,.75);border-radius:6px;background:rgba(127,29,29,.72);color:#fee2e2;font-weight:700;word-break:break-all'
      );
    }
    appendLine('版本：远程B ' + bVersion + ' / 加载器A：扩展 ' + aVersion, 'font-size:11px;margin:-2px 0 4px;color:#cbd5e1;word-break:break-all');
    if (state.lastLoaderVersionStatus && !state.loaderUpdateAvailable) {
      appendLine('A更新检查：' + state.lastLoaderVersionStatus, 'font-size:11px;margin:-2px 0 4px;color:#94a3b8;word-break:break-all');
    }
    appendLine('状态：' + (paused ? '暂停' : (status?.running ? '运行' : '未运行')) + (paused && state.pauseReason ? ' / ' + state.pauseReason : ''));
    if (state.cloudflareError) {
      appendLine('原因：' + reasonDetail);
    } else if (status?.running) {
      appendLine('本次登录：' + formatDuration(session.uptimeMs ?? status.uptimeMs) + ' / 收获金币 +' + formatNumber(session.coinsGained, '0') + ' / 击杀 ' + formatNumber(session.kills, '0'));
      appendLine('原因：' + reasonDetail);
      appendLine('HP ' + (self?.hp ?? '-') + ' / 体力 ' + formatStamina(self) + ' / Drop ' + (self?.drop ?? '-'));
      appendLine('WS ' + wsLabel + ' / Active ' + nearestActive);
      if (decision?.target) {
        const target = decision.target;
        appendLine('目标：' + (target.name || ('#' + (target.id ?? '-'))) + ' 距离 ' + formatDistance(target.distance) + ' 金币 ' + (target.amount ?? '-') + ' Drop ' + (target.drop ?? '-'));
      }
      if (decision?.combat) {
        appendLine('战斗：瞄准 ' + (decision?.aimTarget?.mode || '-') + ' / 来弹 ' + (decision?.incomingBullet ? formatDistance(decision.incomingBullet.laneDistance) : '-'));
      }
      if (decision?.opportunisticShot) {
        const shot = decision.opportunisticShot;
        appendLine('顺手射击：' + (shot.name || ('#' + (shot.id ?? '-'))) + ' 距离 ' + formatDistance(shot.distance) + ' Drop ' + (shot.drop ?? '-'));
      }
      const pursuit = decision?.pursuit || safety.pursuit || status?.pursuit;
      if (pursuit) {
        appendLine('追击：' + (pursuit.name || ('#' + pursuit.id)) + ' ' + formatDistance(pursuit.distance) + ' / ' + Math.round((pursuit.durationMs || 0) / 1000) + 's');
      }
      const hold = reloginHold;
      if (hold > 0) appendLine('等待重连：' + formatDuration(hold));
      if (Array.isArray(status.errors) && status.errors.length) {
        appendLine('BOT错误：' + (status.errors[status.errors.length - 1]?.message || ''), 'color:#fca5a5');
      }
    } else if (state.lastRemoteStatus || state.lastInstallStatus || state.lastError) {
      appendLine('远端：' + (state.lastRemoteStatus || '- '));
      appendLine('安装：' + (state.lastInstallStatus || '-'));
      if (state.lastError) appendLine('错误：' + state.lastError, 'color:#fca5a5');
    }
  }

  function updateBootstrapPanel(force = false) {
    try {
      renderBootstrapPanel(force);
    } catch (err) {
      const message = noteBootstrapError('panel update failed', err);
      renderBootstrapPanelError(message);
    }
  }

  function noteFetchStatus(label, text, forcePanel = false) {
    const value = String(text || '');
    if (/loader|extension bootstrap/i.test(label)) state.lastLoaderVersionStatus = value;
    else if (/manifest/i.test(label)) state.lastManifestStatus = value;
    else if (/script|bot/i.test(label)) state.lastScriptStatus = value;
    state.lastRemoteStatus = `${label}: ${value}`;
    updateBootstrapPanel(forcePanel);
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
    return uniqueUrls([cfg.manifestUrl, rawGithubToJsDelivr(cfg.manifestUrl)]);
  }

  function scriptUrls(manifest) {
    return uniqueUrls([manifest?.scriptUrl, rawGithubToJsDelivr(manifest?.scriptUrl)]);
  }

  function loaderVersionUrls() {
    return uniqueUrls([cfg.loaderUpdateUrl, rawGithubToJsDelivr(cfg.loaderUpdateUrl)]);
  }

  function requestText(method, url, body = null, headers = {}) {
    return bridge('fetchText', {
      method,
      url,
      body,
      headers,
      timeoutMs: cfg.requestTimeoutMs
    }, cfg.requestTimeoutMs + 1500);
  }

  async function requestAcceptedTextWithFallback(label, urls, acceptText) {
    const candidates = uniqueUrls(urls);
    if (!candidates.length) throw new Error(`${label} fetch failed: no urls`);
    return new Promise((resolve, reject) => {
      let settled = false;
      let completed = 0;
      const errors = [];
      const localTimers = candidates.map((url, i) => setTimeout(async () => {
        if (settled || state.disabled) return;
        try {
          logBootstrap(`${label} fetch try`, { url, index: i + 1, total: candidates.length, delayMs: i * cfg.fallbackStaggerMs });
          noteFetchStatus(label, `fetching ${i + 1}/${candidates.length}`);
          const { text, url: finalUrl } = await requestText('GET', withCacheBust(url));
          const accepted = acceptText ? await acceptText(text, url) : null;
          if (settled) return;
          settled = true;
          localTimers.forEach(timer => clearTimeout(timer));
          noteFetchStatus(label, 'ok via extension-fetch', true);
          logBootstrap(`${label} fetch ok`, { url: finalUrl || url, index: i + 1, bytes: String(text || '').length });
          resolve({ text, url: finalUrl || url, accepted, transport: 'extension-fetch' });
        } catch (err) {
          if (settled) return;
          const error = err?.message || String(err);
          errors[i] = `${url}: ${error}`;
          completed += 1;
          noteFetchStatus(label, `failed ${completed}/${candidates.length}: ${error}`);
          logBootstrap(`${label} fetch failed`, { url, index: i + 1, total: candidates.length, error });
          if (completed >= candidates.length) {
            settled = true;
            noteFetchStatus(label, `failed: ${errors.filter(Boolean).join(' | ')}`, true);
            reject(new Error(`${label} fetch failed from ${candidates.length} url(s): ${errors.filter(Boolean).join(' | ')}`));
          }
        }
      }, i * cfg.fallbackStaggerMs));
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

  function parseLoaderVersion(text) {
    const match = String(text || '').match(/\bBOOTSTRAP_VERSION\s*=\s*['"]([^'"]+)['"]/);
    if (!match) throw new Error('extension BOOTSTRAP_VERSION missing');
    return match[1];
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

  async function checkLoaderVersion(reason = 'interval', options = {}) {
    const force = Boolean(options.force);
    const t = Date.now();
    if (state.checkingLoaderVersion) {
      return {
        current: BOOTSTRAP_VERSION,
        latest: state.latestLoaderVersion || '',
        updateAvailable: Boolean(state.loaderUpdateAvailable),
        skipped: 'busy'
      };
    }
    if (!force && state.lastLoaderVersionCheckAt && t - Number(state.lastLoaderVersionCheckAt || 0) < cfg.loaderVersionCheckMs) {
      return {
        current: BOOTSTRAP_VERSION,
        latest: state.latestLoaderVersion || '',
        updateAvailable: Boolean(state.loaderUpdateAvailable),
        skipped: 'cooldown'
      };
    }
    state.checkingLoaderVersion = true;
    state.lastLoaderVersionCheckAt = t;
    state.loaderUpdateError = '';
    try {
      const { accepted, url, transport } = await requestAcceptedTextWithFallback(
        'loader version',
        loaderVersionUrls(),
        text => ({ version: parseLoaderVersion(text) })
      );
      const latest = String(accepted?.version || '');
      const cmp = compareRemoteBotVersion(latest, BOOTSTRAP_VERSION);
      state.latestLoaderVersion = latest;
      state.latestLoaderUrl = url || '';
      state.loaderUpdateAvailable = cmp !== null && cmp > 0;
      state.lastLoaderVersionStatus = cmp === null
        ? `无法比较 当前 ${BOOTSTRAP_VERSION} / 远端 ${latest || '-'}`
        : (state.loaderUpdateAvailable
          ? `发现新版本 ${latest}`
          : `已是最新 ${BOOTSTRAP_VERSION}`);
      logBootstrap('loader version check complete', {
        reason,
        current: BOOTSTRAP_VERSION,
        latest,
        updateAvailable: state.loaderUpdateAvailable,
        url,
        transport
      });
      updateBootstrapPanel(true);
      return {
        current: BOOTSTRAP_VERSION,
        latest,
        updateAvailable: state.loaderUpdateAvailable,
        url
      };
    } catch (err) {
      const error = err?.message || String(err);
      state.loaderUpdateError = error;
      state.lastLoaderVersionStatus = '检查失败：' + error;
      logBootstrap('loader version check failed', { reason, error });
      updateBootstrapPanel(true);
      return {
        current: BOOTSTRAP_VERSION,
        latest: state.latestLoaderVersion || '',
        updateAvailable: Boolean(state.loaderUpdateAvailable),
        error
      };
    } finally {
      state.checkingLoaderVersion = false;
    }
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
    const raw = readStored('cachedManifest', '');
    if (!raw) return null;
    try {
      return parseManifest(raw);
    } catch (_) {
      return null;
    }
  }

  function knownRemoteManifests() {
    const known = [];
    const cached = readCachedManifest();
    if (cached?.version) known.push({ source: 'cache', version: String(cached.version || ''), sha256: String(cached.sha256 || '') });
    const status = getBotStatus();
    if (status?.running && status.version) known.push({ source: 'running', version: String(status.version || ''), sha256: String(status.sourceHash || '') });
    return known;
  }

  function assertManifestNotOlderThanKnown(manifest, url = '') {
    const version = String(manifest?.version || '');
    const sha256 = String(manifest?.sha256 || '');
    for (const known of knownRemoteManifests()) {
      const cmp = compareRemoteBotVersion(version, known.version);
      if (cmp !== null && cmp < 0) {
        throw new Error(`stale manifest from ${url || 'remote'}: ${version || '(unknown version)'} is older than ${known.source} ${known.version}`);
      }
      if (cmp === 0 && sha256 && known.sha256 && sha256 !== known.sha256) {
        throw new Error(`conflicting manifest from ${url || 'remote'}: ${version} hash ${sha256.slice(0, 8)} differs from ${known.source} ${known.sha256.slice(0, 8)}`);
      }
    }
  }

  function clearCachedBot(reason) {
    writeStored({ cachedManifest: '', cachedSource: '' });
    state.lastManifestHash = '';
    state.lastManifestVersion = '';
    if (reason) state.lastError = String(reason);
  }

  function assertSafeRemoteSource(manifest, source, hash) {
    const version = String(manifest?.version || '');
    const sha256 = String(hash || manifest?.sha256 || '').toLowerCase();
    assertRemoteBotVersionAllowed(manifest);
    if (BLOCKED_REMOTE_HASHES.has(sha256)) throw new Error(`blocked unsafe remote bot ${version || '(unknown version)'} ${sha256}`);
    const text = String(source || '');
    const blocked = FORBIDDEN_REMOTE_SOURCE.find(item => item.re.test(text));
    if (blocked) throw new Error(`remote bot rejected: ${blocked.label}`);
  }

  function getBotStatus() {
    try {
      const bot = window.__graspRatBot || null;
      return bot?.status ? bot.status() : null;
    } catch (err) {
      return { running: false, message: err?.message || String(err) };
    }
  }

  function shortStatus(status = getBotStatus()) {
    try {
      return status ? {
        running: Boolean(status.running),
        starting: Boolean(status.starting),
        ticking: Boolean(status.ticking),
        timerActive: Boolean(status.timerActive),
        version: status.version || '',
        sourceHash: status.sourceHash || '',
        paused: Boolean(status.paused),
        lastTickAgeMs: status.lastTickAgeMs ?? null,
        reason: status.lastDecision?.reason || '',
        message: status.message || ''
      } : null;
    } catch (err) {
      return { running: false, message: 'status summary failed: ' + (err?.message || String(err)) };
    }
  }

  function tickIsStale(status) {
    if (!status || !status.running) return true;
    if (status.paused || isPaused()) return false;
    if (status.starting && Number(status.uptimeMs || 0) < Math.max(cfg.staleTickMs, cfg.scriptStartupTimeoutMs + cfg.installConfirmMs)) return false;
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
      logBootstrap('stopping blocked remote bot', { reason, minVersion: MIN_REMOTE_BOT_VERSION, status: shortStatus(status) });
      window.__graspRatBot?.stop?.(`extension bootstrap blocked old strategy: ${reason || 'version gate'}`);
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
    const source = readStored('cachedSource', '');
    return Boolean(cached && source)
      && String(cached.sha256 || '') === String(manifest?.sha256 || '')
      && String(cached.version || '') === String(manifest?.version || '')
      && !remoteBotVersionIsBlocked(cached.version);
  }

  function currentUserIdFromStatus(status) {
    return status?.control?.currentUserId || status?.self?.id || status?.lastDecision?.self?.id || 0;
  }

  function statusLooksInGame(status) {
    const self = status?.self || status?.lastDecision?.self || null;
    if (!self) return false;
    const life = String(self.life || '');
    if (/dead|waitingrevive/i.test(life) || self.waiting_revive) return false;
    return true;
  }

  function leaveWasIssued(detail) {
    return Boolean(detail?.attempted && !detail?.error);
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
      if (typeof window.leave === 'function') {
        const result = detail.userId ? window.leave(detail.userId) : window.leave();
        detail.attempted = true;
        detail.method = detail.userId ? 'leave(userId)' : 'leave';
        if (result && typeof result.then === 'function') await withTimeout(result, 1200, 'leave before cached update restart');
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
    if (statusLooksInGame(status) && !leaveWasIssued(detail.leave)) {
      detail.restartDeferred = true;
      detail.error = detail.leave?.error || 'leave before cached update was not confirmed';
      state.lastInstallStatus = `cached update restart waiting for leave before ${manifest?.version || manifest?.sha256 || 'remote update'}`;
      state.lastError = detail.error;
      logBootstrap('cached update restart deferred', detail);
      return false;
    }
    try {
      window.__graspRatBot?.stop?.(`cached update restart: ${manifest?.version || manifest?.sha256 || reason || 'remote update'}`);
    } catch (err) {
      detail.stopError = err?.message || String(err);
    }
    state.lastInstallStatus = `cached update restart scheduled for ${manifest?.version || manifest?.sha256 || 'remote update'}`;
    setSafeTimeout('cached update reload', () => {
      try {
        location.reload();
      } catch (err) {
        state.lastError = 'reload after cached update failed: ' + (err?.message || String(err));
        logBootstrap('cached update reload failed', { reason, error: state.lastError });
      }
    }, cfg.restartAfterCacheUpdateMs);
    return true;
  }

  function recordBootstrapException(label, err, detail = {}) {
    const message = noteBootstrapError(label, err, detail);
    try {
      renderBootstrapPanelError(message);
    } catch (_) {}
    return message;
  }

  async function runInPage(source, sourceUrl) {
    const labeledSource = `${source}\n//# sourceURL=${sourceUrl || 'grasp-rat-remote-bot.js'}`;
    try {
      logBootstrap('inject attempt', { method: 'window.eval', sourceUrl });
      const result = (0, eval)(labeledSource);
      if (result && typeof result.then === 'function') await withTimeout(result, cfg.scriptStartupTimeoutMs, 'remote bot startup');
      return { method: 'window.eval', timedOut: false };
    } catch (evalErr) {
      if (evalErr?.isBootstrapTimeout) {
        state.lastInstallStatus = evalErr.message;
        logBootstrap('remote bot startup promise timed out; continuing confirmation', { sourceUrl, timeoutMs: cfg.scriptStartupTimeoutMs });
        return { method: 'window.eval', timedOut: true, error: evalErr.message || String(evalErr) };
      }
      const evalError = evalErr?.message || String(evalErr);
      state.lastInstallStatus = 'window.eval failed: ' + evalError;
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
    state.lastScriptStatus = `fetching ${manifest.version || manifest.sha256 || 'remote'}`;
    state.lastRemoteStatus = state.lastScriptStatus;
    updateBootstrapPanel(true);
    logBootstrap('script fetch start', { version: manifest.version, sha256: manifest.sha256, scriptUrl: manifest.scriptUrl, urls: scriptUrls(manifest) });
    const { text: source, url: sourceUrl, accepted } = await requestAcceptedTextWithFallback(
      'remote bot script',
      scriptUrls(manifest),
      async sourceText => {
        const sourceHash = await sha256Hex(sourceText);
        if (sourceHash !== manifest.sha256) throw new Error(`script sha256 mismatch: expected ${manifest.sha256}, got ${sourceHash}`);
        assertSafeRemoteSource(manifest, sourceText, sourceHash);
        return { hash: sourceHash };
      }
    );
    logBootstrap('script fetch complete', { version: manifest.version, bytes: String(source || '').length, sourceUrl });
    const hash = String(accepted?.hash || '');
    state.lastScriptStatus = `verified ${manifest.version || hash.slice(0, 8)}`;
    state.lastRemoteStatus = state.lastScriptStatus;
    updateBootstrapPanel(true);
    logBootstrap('script verified', { version: manifest.version, sha256: hash });
    writeStored({ cachedManifest: safeStringify(manifest), cachedSource: source });
    return { source, hash };
  }

  async function waitForInstallConfirmation(manifest, reason, injectResult) {
    const started = Date.now();
    let status = null;
    logBootstrap('install confirm start', { reason, version: manifest.version, sha256: manifest.sha256, injectResult });
    while (Date.now() - started <= cfg.installConfirmMs) {
      status = getBotStatus();
      if (status?.running && String(status.sourceHash || '') === String(manifest.sha256 || '')) {
        logBootstrap('install confirmed', { reason, elapsedMs: Date.now() - started, status: shortStatus(status) });
        return status;
      }
      state.lastInstallStatus = `confirming ${reason || 'install'}: ${safeStringify(status || null, 160)}`;
      await sleep(100);
    }
    logBootstrap('install confirm failed', { reason, elapsedMs: Date.now() - started, expectedHash: manifest.sha256, status: shortStatus(status), injectResult });
    throw new Error(`bot install did not confirm after ${cfg.installConfirmMs}ms: ${safeStringify({ status, injectResult }, 500)}`);
  }

  async function installSource(manifest, source, reason) {
    if (!isGamePage() || !ensureNotBlocked()) return false;
    if (isPaused()) {
      syncPauseToPage();
      state.lastInstallStatus = `paused; install skipped for ${manifest.version || manifest.sha256 || 'remote'}`;
      updateBootstrapPanel(true);
      return false;
    }
    state.lastInstallAttemptAt = Date.now();
    state.lastInstallStatus = `injecting ${manifest.version || manifest.sha256 || 'remote'}`;
    logBootstrap('install source start', { reason, version: manifest.version, sha256: manifest.sha256, sourceBytes: String(source || '').length, currentStatus: shortStatus() });
    window.__graspRatBotRuntimeConfig = {
      ...(manifest.config || {}),
      statusEvery: Math.max(250, Number(manifest.statusEvery || cfg.statusEvery) || 1000),
      version: String(manifest.version || 'remote'),
      sourceHash: String(manifest.sha256 || ''),
      sourceUrl: String(manifest.scriptUrl || ''),
      injectedBy: 'extension'
    };
    const injectResult = await runInPage(source, manifest.scriptUrl);
    state.lastInstallStatus = `confirming ${manifest.version || manifest.sha256 || 'remote'}`;
    const status = await waitForInstallConfirmation(manifest, reason, injectResult);
    state.lastManifestHash = String(manifest.sha256 || '');
    state.lastManifestVersion = String(manifest.version || '');
    state.lastInstallAt = Date.now();
    state.lastInstallReason = reason || '';
    state.lastInstallStatus = 'confirmed';
    logBootstrap('install source done', { reason, version: manifest.version, elapsedMs: state.lastInstallAt - state.lastInstallAttemptAt, status: shortStatus(status) });
    return true;
  }

  async function installCached(reason, options = {}) {
    if (!isGamePage() || !ensureNotBlocked()) return false;
    const manifest = readCachedManifest();
    const source = readStored('cachedSource', '');
    logBootstrap('cached install check', { reason, force: Boolean(options.force), hasManifest: Boolean(manifest), hasSource: Boolean(source), currentStatus: shortStatus() });
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
    if (!isGamePage() || !ensureNotBlocked()) return false;
    if (isPaused()) {
      syncPauseToPage();
      state.lastInstallStatus = 'paused; fast cache install skipped';
      updateBootstrapPanel(true);
      return false;
    }
    const manifest = readCachedManifest();
    const source = readStored('cachedSource', '');
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
      if (installed) logBootstrap('fast cache install done', { reason, version: manifest.version, sha256: manifest.sha256 });
      return installed;
    } catch (err) {
      state.lastError = err?.message || String(err);
      logBootstrap('fast cache install error', { reason, error: state.lastError });
      stopBlockedRunningBot(`${reason}:cache-error`, status);
      return false;
    } finally {
      clearBusy(busyToken);
    }
  }

  async function installManifest(manifest, reason) {
    if (!isGamePage() || !ensureNotBlocked()) return false;
    const current = getBotStatus();
    const cacheCurrent = cachedManifestMatches(manifest);
    if (!cacheCurrent) {
      logBootstrap('remote update caching needed', { reason, version: manifest.version, sha256: manifest.sha256, status: shortStatus(current) });
      await fetchAndVerify(manifest);
    }
    if (isPaused()) {
      syncPauseToPage();
      state.lastManifestHash = String(manifest.sha256 || '');
      state.lastManifestVersion = String(manifest.version || '');
      state.lastInstallStatus = `paused; cached ${manifest.version || manifest.sha256 || 'remote'}`;
      state.lastError = '';
      updateBootstrapPanel(true);
      return true;
    }
    const status = getBotStatus();
    if (status?.running && !botMatchesManifest(status, manifest)) {
      logBootstrap('remote update cached; hot swapping running bot', { reason, version: manifest.version, sha256: manifest.sha256, cacheCurrent, blockedCurrentStrategy: runningBotUsesBlockedStrategy(status), status: shortStatus(status) });
      await installCached(reason, { force: true });
      state.lastError = '';
      return true;
    }
    if (!status || !status.running || tickIsStale(status)) {
      logBootstrap('installing cached bot after manifest sync', { reason, version: manifest.version, sha256: manifest.sha256, status: shortStatus(status) });
      await installCached(reason, { force: true });
      state.lastError = '';
      return true;
    }
    logBootstrap('manifest sync skipped: running bot and cache current', { reason, version: manifest.version, sha256: manifest.sha256, status: shortStatus(status), cacheCurrent: cachedManifestMatches(manifest) });
    state.lastError = '';
    return true;
  }

  function keepRunningAfterRemoteFailure(error, reason, status = getBotStatus()) {
    if (!status?.running || tickIsStale(status) || runningBotUsesBlockedStrategy(status) || isPaused()) return false;
    const text = String(error || 'remote unavailable');
    state.lastError = '';
    state.lastManifestStatus = `remote unavailable; using running ${status.version || 'bot'}`;
    state.lastRemoteStatus = state.lastManifestStatus;
    state.lastInstallStatus = `kept running after ${reason || 'poll'} remote failure`;
    logBootstrap('remote failure ignored while bot healthy', { reason, error: text, status: shortStatus(status) });
    updateBootstrapPanel(true);
    return true;
  }

  async function pollOnce(reason = 'poll') {
    if (!isGamePage() || !ensureNotBlocked()) return;
    syncPauseToPage();
    if (state.installing || state.polling) resetStaleBusy(reason);
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
        (manifestText, url) => {
          const manifest = parseManifest(manifestText);
          assertRemoteBotVersionAllowed(manifest);
          assertManifestNotOlderThanKnown(manifest, url);
          return { manifest };
        }
      );
      const manifest = accepted.manifest;
      state.lastManifestHash = String(manifest.sha256 || '');
      state.lastManifestVersion = String(manifest.version || '');
      state.lastManifestStatus = `ok ${manifest.version || String(manifest.sha256 || '').slice(0, 8)}`;
      updateBootstrapPanel(true);
      logBootstrap('manifest fetch complete', { reason, version: manifest.version, sha256: manifest.sha256, scriptUrl: manifest.scriptUrl, manifestUrl });
      if (isPaused()) {
        if (!cachedManifestMatches(manifest)) {
          state.installing = true;
          state.busyReason = `poll:${reason}:paused-cache-sync`;
          state.busyStartedAt = Date.now();
          await fetchAndVerify(manifest);
        } else {
          state.lastScriptStatus = `cache current ${manifest.version || String(manifest.sha256 || '').slice(0, 8)}`;
        }
        state.lastInstallStatus = `paused; remote ${manifest.version || manifest.sha256 || 'manifest'} cached`;
        state.lastError = '';
        updateBootstrapPanel(true);
        return;
      }
      if (!botNeedsInstall(manifest) && cachedManifestMatches(manifest)) {
        logBootstrap('poll ok: bot current', { reason, version: manifest.version, status: shortStatus() });
        return;
      }
      state.installing = true;
      state.busyReason = `poll:${reason}:install`;
      state.busyStartedAt = Date.now();
      await installManifest(manifest, reason);
    } catch (err) {
      const error = err?.message || String(err);
      const status = getBotStatus();
      if (keepRunningAfterRemoteFailure(error, reason, status)) return;
      state.lastError = error;
      logBootstrap('poll error', { reason, error: state.lastError, status: shortStatus(status) });
      if ((!status || !status.running) && !isPaused()) {
        try {
          logBootstrap('poll falling back to cache', { reason, error: state.lastError });
          state.installing = true;
          state.busyReason = `poll:${reason}:cache-fallback`;
          state.busyStartedAt = Date.now();
          await installCached(state.lastError, { force: true });
        } catch (cacheErr) {
          logBootstrap('cached fallback error', { reason, error: cacheErr?.message || String(cacheErr) });
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
    const candidates = Array.from(document.querySelectorAll('a, button, input[type="submit"], input[type="button"], [role="button"]')).filter(visible);
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

  async function maybeStartGameLogin(reason = 'watchdog', options = {}) {
    const force = Boolean(options.force || options.immediate || options.manual);
    const ignoreSuppress = Boolean(options.ignoreSuppress || force);
    const ignoreLoginCooldown = Boolean(options.ignoreLoginCooldown || force);
    if (!cfg.autoLogin || !isGamePage() || !ensureNotBlocked()) return false;
    if (isPaused()) {
      syncPauseToPage();
      return false;
    }
    if (isGameAuthCallback()) {
      suppressLogin('oauth callback', cfg.authReturnGraceMs);
      return false;
    }
    const t = Date.now();
    if (!ignoreLoginCooldown && t - state.lastLoginAt < cfg.loginCooldownMs) return false;
    const suppressRemainingMs = loginSuppressRemainingMs();
    if (suppressRemainingMs > 0 && !ignoreSuppress) {
      return false;
    }
    const status = getBotStatus();
    const hasToken = Boolean(localStorage.getItem('tmpGameSessionToken') || status?.control?.hasToken);
    const hasSelf = Boolean(status?.self || status?.lastDecision?.self);
    const decisionReason = String(status?.lastDecision?.reason || '');
    const loginControl = findGameLoginControl();
    const loginRequired = hasLoginRequiredText();
    const canStartLogin = Boolean(loginControl || typeof window.startLinuxDoLogin === 'function');
    const shouldLogin = force
      ? canStartLogin
      : (!hasToken || (!hasSelf && /login|required/i.test(decisionReason) && loginRequired));
    if (!shouldLogin) return false;
    state.lastLoginAt = t;
    const detail = {
      reason,
      hasToken,
      hasSelf,
      loginRequired,
      decisionReason,
      forced: force,
      ignoredSuppressMs: ignoreSuppress ? Math.round(suppressRemainingMs) : 0,
      loginControl: loginControl ? (loginControl.id ? `#${loginControl.id}` : controlText(loginControl) || loginControl.tagName.toLowerCase()) : '',
      method: '',
      error: ''
    };
    try {
      if (typeof window.startLinuxDoLogin === 'function') {
        const result = window.startLinuxDoLogin();
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
    return Boolean(detail.method && !detail.error);
  }

  async function forceLoginNow(reason = 'panel immediate login') {
    const text = String(reason || 'panel immediate login');
    const bot = window.__graspRatBot || null;
    if (bot && typeof bot.forceLoginNow === 'function') {
      const result = await bot.forceLoginNow(text);
      clearCurrentReloginHold(text, { clearBot: false, clearLocal: false, clearPersistent: false });
      updateBootstrapPanel(true);
      return result;
    }
    const cleared = clearCurrentReloginHold(text);
    const login = await maybeStartGameLogin(text, {
      force: true,
      ignoreSuppress: true,
      ignoreLoginCooldown: true
    });
    updateBootstrapPanel(true);
    return { at: Date.now(), reason: text, cleared, login };
  }

  function findAuthorizeAllowControl() {
    const candidates = Array.from(document.querySelectorAll('a, button, input[type="submit"], input[type="button"], [role="button"]')).filter(visible);
    return candidates.find(el => {
      const text = controlText(el);
      return /^(allow|authorize|approve|continue|confirm|允许|同意|授权|确认|继续)$/i.test(text)
        || /allow|authorize|approve|continue|confirm|允许|同意|确认授权|授权|继续/i.test(text);
    }) || candidates.find(el => el.matches?.('a.btn-pill.btn-pill-primary, button.btn-pill-primary, .btn-primary, .btn-success, input[type="submit"]')) || null;
  }

  function maybeClickAuthorize(reason = 'watchdog') {
    if (!cfg.autoLogin || !isAuthorizePage() || !ensureNotBlocked()) return false;
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
    return Boolean(detail.method && !detail.error);
  }

  async function watchdogOnce(reason = 'watchdog') {
    if (!ensureNotBlocked()) return;
    if (isAuthorizePage()) {
      maybeClickAuthorize(reason);
      return;
    }
    if (!isGamePage()) return;
    updateBootstrapPanel();
    if (maybeReloadCloudflareError()) {
      return;
    }
    if (isGameAuthCallback()) {
      suppressLogin('oauth callback', cfg.authReturnGraceMs);
      return;
    }
    if (isPaused()) {
      syncPauseToPage();
      state.lastWatchdogAt = Date.now();
      state.lastInstallStatus = 'paused; watchdog idle';
      updateBootstrapPanel(true);
      return;
    }
    state.lastWatchdogAt = Date.now();
    if (state.installing || state.polling) resetStaleBusy(reason);
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
      logBootstrap('watchdog reinstall needed', { reason, missing, stale, mismatched, blockedStrategy, minVersion: MIN_REMOTE_BOT_VERSION, manifestVersion: manifest?.version || '', manifestHash: manifest?.sha256 || '', status: shortStatus(status) });
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

  function exposeApi() {
    bootstrapApi = {
      owner: BOOTSTRAP_OWNER,
      injectedBy: BOOTSTRAP_OWNER,
      extensionBootId: state.bootId,
      version: BOOTSTRAP_VERSION,
      config: cfg,
      state,
      pollOnce,
      watchdogOnce,
      checkLoaderVersion,
      maybeStartGameLogin,
      forceLoginNow,
      maybeClickAuthorize,
      isPaused,
      setPaused,
      pause(reason = 'api') {
        return setPaused(true, reason);
      },
      resume(reason = 'api') {
        return setPaused(false, reason);
      },
      updatePanel() {
        updateBootstrapPanel(true);
        return true;
      },
      setManifestUrl(url) {
        cfg.manifestUrl = String(url || '');
        writeStored({ manifestUrl: cfg.manifestUrl });
        return cfg.manifestUrl;
      }
    };
    window.__graspRatBotBootstrap = bootstrapApi;
  }

  async function start() {
    if (tampermonkeyDetected()) {
      disableForTampermonkey('tampermonkey bootstrap detected before extension startup');
      return;
    }
    window.__graspRatBotExtensionBootstrapPresent = true;
    if (!window.__graspRatBotBootstrapOwner) window.__graspRatBotBootstrapOwner = BOOTSTRAP_OWNER;
    await loadStoredValues();
    if (!ensureNotBlocked()) return;
    exposeApi();
    if (isAuthorizePage()) {
      suppressLogin('authorize page', cfg.authReturnGraceMs);
      setSafeTimeout('authorize fallback timer', () => {
        if (!isAuthorizePage()) return;
        maybeClickAuthorize('fallback-delay');
        setSafeInterval('authorize fallback interval', () => maybeClickAuthorize('fallback-interval'), Math.max(cfg.watchdogMs, cfg.authorizeCooldownMs));
      }, cfg.authorizeFallbackDelayMs);
      return;
    }
    if (!isGamePage()) return;
    loginSuppressRemainingMs();
    syncPauseToPage();
    const renderPanelWhenReady = () => updateBootstrapPanel(true);
    if (document.body) renderPanelWhenReady();
    else document.addEventListener('DOMContentLoaded', () => runSafely('DOMContentLoaded panel render', renderPanelWhenReady), { once: true });
    setSafeInterval('panel interval', () => updateBootstrapPanel(), cfg.panelUpdateMs);
    runAsyncSafely('startup loader version check', () => checkLoaderVersion('startup', { force: true }));
    setSafeInterval('loader version interval', () => runAsyncSafely('loader version interval', () => checkLoaderVersion('interval')), cfg.loaderVersionCheckMs);
    if (isGameAuthCallback()) {
      suppressLogin('oauth callback', cfg.authReturnGraceMs);
      setSafeInterval('callback watchdog interval', () => runAsyncSafely('callback watchdog interval', () => watchdogOnce('callback-interval')), cfg.watchdogMs);
      return;
    }
    logBootstrap('bootstrap start', { href: location.href, readyState: document.readyState, manifestUrl: cfg.manifestUrl, pollMs: cfg.pollMs, watchdogMs: cfg.watchdogMs, currentStatus: shortStatus() });
    runAsyncSafely('startup sequence', async () => {
      const cacheInstalled = await installCachedForFastStart('startup-cache-first');
      try {
        await pollOnce(cacheInstalled ? 'startup-after-cache' : 'startup');
      } catch (err) {
        logBootstrap('startup poll error', { error: err?.message || String(err) });
      }
      const status = getBotStatus();
      if (!status || !status.running) {
        try {
          logBootstrap('startup fallback cache install', { status: shortStatus(status) });
          await installCachedForFastStart('startup-fallback');
        } catch (err) {
          logBootstrap('startup fallback cache error', { error: err?.message || String(err), status: shortStatus() });
        }
      }
    });
    runAsyncSafely('startup watchdog', () => watchdogOnce('startup'));
    setSafeInterval('poll interval', () => runAsyncSafely('poll interval', () => pollOnce('interval')), cfg.pollMs);
    setSafeInterval('watchdog interval', () => runAsyncSafely('watchdog interval', () => watchdogOnce('interval')), cfg.watchdogMs);
  }

  start().catch(err => {
    recordBootstrapException('extension bootstrap startup', err);
  });
})();
