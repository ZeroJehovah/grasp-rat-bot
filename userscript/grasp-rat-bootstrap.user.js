// ==UserScript==
// @name         Grasp Rat Bot Bootstrap
// @namespace    https://github.com/grasp-rat-bot
// @version      0.4.78
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
  const BOOTSTRAP_VERSION = '0.4.78';
  const BOOTSTRAP_OWNER = 'tampermonkey';
  const REPOSITORY_URL = 'https://github.com/ZeroJehovah/grasp-rat-bot';
  const USERSCRIPT_UPDATE_URL = 'https://raw.githubusercontent.com/ZeroJehovah/grasp-rat-bot/main/userscript/grasp-rat-bootstrap.user.js';
  const MIN_REMOTE_BOT_VERSION = 'bootstrap-0.4.0';
  const PANEL_ID = 'grasp-rat-bot-panel';
  const CHASE_PANEL_ID = 'grasp-rat-chase-panel';
  const CHASE_PANEL_VISIBLE_KEY = 'graspRatChasePanelVisible';
  const HOST_LAYOUT_STYLE_ID = 'grasp-rat-bot-host-layout-style';
  const INLINE_LOGIN_BUTTON_ID = 'grasp-rat-bot-inline-login';
  const PAUSED_KEY = 'graspRatBotPaused';
  const PAUSE_REASON_KEY = 'graspRatBotPauseReason';
  const LOGIN_SUPPRESS_KEY = 'graspRatLoginSuppressUntil';
  const LOGIN_SUPPRESS_REASON_KEY = 'graspRatLoginSuppressReason';
  const LOGIN_POINT_SAFETY_KEY = 'graspRatLoginPointSafety';
  const ENEMY_LEAVE_STATE_KEY = 'graspRatEnemyLeaveState';
  const OFFLINE_LEAVE_STATE_KEY = 'graspRatOfflineLeaveState';
  const LAST_SELF_STATE_KEY = 'graspRatLastSelfState';
  const CLOUDFLARE_RELOAD_KEY = 'graspRatCloudflareReloadAt';
  const CLASH_SECRET_KEY = 'clashControllerSecret';
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
    userscriptUpdateUrl: USERSCRIPT_UPDATE_URL,
    pollMs: 10000,
    userscriptVersionCheckMs: 300000,
    watchdogMs: 1000,
    busyLeaseMs: 12000,
    requestTimeoutMs: 7000,
    fallbackStaggerMs: 1200,
    staleTickMs: 3000,
    statusEvery: 30000,
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
    page403ErrorReloadMs: 600000,
    combatLoggingEnabled: false,
    combatLogEndpoint: 'http://127.0.0.1:18765/combat-log',
    combatLogEndpointConfigured: false,
    debugBootstrapLogging: false,
    cacheBust: true,
    autoLogin: true,
    clashLeaveRescueEnabled: false,
    clashControllerUrl: 'http://127.0.0.1:9097',
    clashGameProxyGroup: 'GRASP-RAT-GAME',
    clashAutoProxyName: 'S2-自动',
    clashManualProxyName: 'S2-手动',
    clashDirectProxyName: 'DIRECT',
    clashControllerTimeoutMs: 7000
  };

  try {
    unsafeWindow.__graspRatBotTampermonkeyBootstrapPresent = true;
    unsafeWindow.__graspRatBotBootstrapOwner = BOOTSTRAP_OWNER;
  } catch (_) {}

  const storedCombatLogEndpoint = String(GM_getValue('combatLogEndpoint', '') || '');
  const storedStatusEveryRaw = GM_getValue('statusEvery', DEFAULTS.statusEvery);
  const storedStatusEvery = Number(storedStatusEveryRaw) === 1000 ? DEFAULTS.statusEvery : Number(storedStatusEveryRaw);
  const storedCombatLogEndpointConfigured = Boolean(
    GM_getValue('combatLogEndpointConfigured', DEFAULTS.combatLogEndpointConfigured)
    || storedCombatLogEndpoint
  );

  const cfg = {
    manifestUrl: String(GM_getValue('manifestUrl', DEFAULTS.manifestUrl) || DEFAULTS.manifestUrl),
    userscriptUpdateUrl: String(GM_getValue('userscriptUpdateUrl', DEFAULTS.userscriptUpdateUrl) || DEFAULTS.userscriptUpdateUrl),
    pollMs: Math.max(10000, Number(GM_getValue('pollMs', DEFAULTS.pollMs)) || DEFAULTS.pollMs),
    userscriptVersionCheckMs: Math.max(60000, Number(GM_getValue('userscriptVersionCheckMs', DEFAULTS.userscriptVersionCheckMs)) || DEFAULTS.userscriptVersionCheckMs),
    watchdogMs: Math.max(250, Number(GM_getValue('watchdogMs', DEFAULTS.watchdogMs)) || DEFAULTS.watchdogMs),
    busyLeaseMs: Math.max(3000, Number(GM_getValue('busyLeaseMs', DEFAULTS.busyLeaseMs)) || DEFAULTS.busyLeaseMs),
    requestTimeoutMs: Math.max(3000, Number(GM_getValue('requestTimeoutMs', DEFAULTS.requestTimeoutMs)) || DEFAULTS.requestTimeoutMs),
    fallbackStaggerMs: Math.max(0, Number(GM_getValue('fallbackStaggerMs', DEFAULTS.fallbackStaggerMs)) || DEFAULTS.fallbackStaggerMs),
    staleTickMs: Math.max(1000, Number(GM_getValue('staleTickMs', DEFAULTS.staleTickMs)) || DEFAULTS.staleTickMs),
    statusEvery: storedStatusEvery === 0 ? 0 : Math.max(1000, storedStatusEvery || DEFAULTS.statusEvery),
    scriptStartupTimeoutMs: Math.max(500, Number(GM_getValue('scriptStartupTimeoutMs', DEFAULTS.scriptStartupTimeoutMs)) || DEFAULTS.scriptStartupTimeoutMs),
    installConfirmMs: Math.max(1000, Number(GM_getValue('installConfirmMs', DEFAULTS.installConfirmMs)) || DEFAULTS.installConfirmMs),
    restartAfterCacheUpdateMs: Math.max(0, Number(GM_getValue('restartAfterCacheUpdateMs', DEFAULTS.restartAfterCacheUpdateMs)) || DEFAULTS.restartAfterCacheUpdateMs),
    loginCooldownMs: Math.max(1000, Number(GM_getValue('loginCooldownMs', DEFAULTS.loginCooldownMs)) || DEFAULTS.loginCooldownMs),
    postLoginGraceMs: Math.max(5000, Number(GM_getValue('postLoginGraceMs', DEFAULTS.postLoginGraceMs)) || DEFAULTS.postLoginGraceMs),
    authReturnGraceMs: Math.max(5000, Number(GM_getValue('authReturnGraceMs', DEFAULTS.authReturnGraceMs)) || DEFAULTS.authReturnGraceMs),
    authorizeCooldownMs: Math.max(250, Number(GM_getValue('authorizeCooldownMs', DEFAULTS.authorizeCooldownMs)) || DEFAULTS.authorizeCooldownMs),
    authorizeFallbackDelayMs: Math.max(0, Number(GM_getValue('authorizeFallbackDelayMs', DEFAULTS.authorizeFallbackDelayMs)) || DEFAULTS.authorizeFallbackDelayMs),
    panelUpdateMs: Math.max(250, Number(GM_getValue('panelUpdateMs', DEFAULTS.panelUpdateMs)) || DEFAULTS.panelUpdateMs),
    cloudflareErrorReloadMs: Math.max(1000, Number(GM_getValue('cloudflareErrorReloadMs', DEFAULTS.cloudflareErrorReloadMs)) || DEFAULTS.cloudflareErrorReloadMs),
    page403ErrorReloadMs: Math.max(60000, Number(GM_getValue('page403ErrorReloadMs', DEFAULTS.page403ErrorReloadMs)) || DEFAULTS.page403ErrorReloadMs),
    combatLoggingEnabled: Boolean(GM_getValue('combatLoggingEnabled', DEFAULTS.combatLoggingEnabled) && storedCombatLogEndpointConfigured),
    combatLogEndpoint: storedCombatLogEndpoint || DEFAULTS.combatLogEndpoint,
    combatLogEndpointConfigured: storedCombatLogEndpointConfigured,
    cacheBust: Boolean(GM_getValue('cacheBust', DEFAULTS.cacheBust)),
    autoLogin: Boolean(GM_getValue('autoLogin', DEFAULTS.autoLogin)),
    clashLeaveRescueEnabled: Boolean(GM_getValue('clashLeaveRescueEnabled', DEFAULTS.clashLeaveRescueEnabled)),
    clashControllerUrl: String(GM_getValue('clashControllerUrl', DEFAULTS.clashControllerUrl) || DEFAULTS.clashControllerUrl),
    clashGameProxyGroup: String(GM_getValue('clashGameProxyGroup', DEFAULTS.clashGameProxyGroup) || DEFAULTS.clashGameProxyGroup),
    clashAutoProxyName: String(GM_getValue('clashAutoProxyName', DEFAULTS.clashAutoProxyName) || DEFAULTS.clashAutoProxyName),
    clashManualProxyName: String(GM_getValue('clashManualProxyName', DEFAULTS.clashManualProxyName) || DEFAULTS.clashManualProxyName),
    clashDirectProxyName: String(GM_getValue('clashDirectProxyName', DEFAULTS.clashDirectProxyName) || DEFAULTS.clashDirectProxyName),
    clashControllerTimeoutMs: Math.max(1000, Number(GM_getValue('clashControllerTimeoutMs', DEFAULTS.clashControllerTimeoutMs)) || DEFAULTS.clashControllerTimeoutMs)
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
    checkingUserscriptVersion: false,
    lastUserscriptVersionCheckAt: 0,
    lastUserscriptVersionStatus: '',
    latestUserscriptVersion: '',
    latestUserscriptUrl: '',
    userscriptUpdateAvailable: false,
    userscriptUpdateError: '',
    lastInstallAttemptAt: 0,
    lastInstallStatus: '',
    lastInstallAt: 0,
    lastInstallReason: '',
    lastWatchdogAt: 0,
    lastLoginAt: 0,
    lastLoginSuppressUntil: 0,
    lastLoginSuppressReason: '',
    lastLoginGateBlock: null,
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

  function shouldLogBootstrap(message) {
    if (cfg.debugBootstrapLogging || unsafeWindow.__graspRatBootstrapVerbose) return true;
    return !/^(watchdog ok|watchdog skipped: busy|poll skipped: busy|poll ok: bot current|manifest sync skipped: running bot and cache current|manifest fetch start|manifest fetch try|manifest fetch ok|manifest fetch complete|userscript version check complete)$/.test(String(message || ''));
  }

  function logBootstrap(message, detail) {
    try {
      if (!shouldLogBootstrap(message)) return;
      console.log('[grasp-rat-bootstrap]', `${BOOTSTRAP_VERSION} ${state.bootId} ${message}`, detail || '');
    } catch (_) {}
  }

  function noteBootstrapError(message, err, detail = {}) {
    const error = err?.message || String(err);
    state.lastError = `${message}: ${error}`;
    logBootstrap(message, { ...detail, error });
    return state.lastError;
  }

  function recordBootstrapException(label, err, detail = {}) {
    const message = noteBootstrapError(label, err, detail);
    try {
      renderBootstrapPanelError(message);
    } catch (_) {}
    return message;
  }

  function runSafely(label, fn) {
    try {
      const result = fn();
      if (result && typeof result.then === 'function') {
        result.catch(err => {
          recordBootstrapException(label, err);
        });
      }
      return result;
    } catch (err) {
      recordBootstrapException(label, err);
      return null;
    }
  }

  function runAsyncSafely(label, fn) {
    return Promise.resolve()
      .then(fn)
      .catch(err => {
        recordBootstrapException(label, err);
        return null;
      });
  }

  function setSafeTimeout(label, fn, ms) {
    return setTimeout(() => runSafely(label, fn), ms);
  }

  function setSafeInterval(label, fn, ms) {
    return setInterval(() => runSafely(label, fn), ms);
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

  function formatReloginGateDuration(ms) {
    const totalSeconds = Math.max(0, Math.ceil(Number(ms) / 1000) || 0);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${hours}h${String(minutes).padStart(2, '0')}m${String(seconds).padStart(2, '0')}s`;
    return `${minutes}m${String(seconds).padStart(2, '0')}s`;
  }

  function reloginGateFromStatus(status) {
    const gate = status?.reloginGate || {};
    const snapshot = gate.snapshot || status?.loginSnapshotGate || status?.globalState?.loginSnapshotGate || {};
    const point = gate.loginPointSafety || snapshot.pointSafety || {};
    const cooldown = gate.cooldown || {};
    const cooldownTotalMs = Math.max(
      Number(cooldown.totalMs || 0) || 0,
      Number(cooldown.remainingMs || 0) || 0
    );
    return {
      cooldown: {
        remainingMs: Math.max(0, Math.round(Number(cooldown.remainingMs || 0) || 0)),
        totalMs: Math.max(0, Math.round(cooldownTotalMs)),
        source: String(cooldown.source || ''),
        reason: String(cooldown.reason || ''),
        staminaHold: cooldown.staminaHold || null,
        candidates: Array.isArray(cooldown.candidates) ? cooldown.candidates.slice(0, 5) : []
      },
      snapshot: {
        ok: Boolean(snapshot.ok ?? snapshot.satisfied),
        streak: Math.max(0, Math.round(Number(snapshot.streak || 0) || 0)),
        required: Math.max(0, Math.round(Number(snapshot.required || 0) || 0)),
        lastError: String(snapshot.lastError || '')
      },
      loginPointSafety: {
        ok: Boolean(point.ok ?? point.satisfied),
        hasPoint: Boolean(point.hasPoint),
        missingPoint: Boolean(point.missingPoint),
        streak: Math.max(0, Math.round(Number(point.streak || 0) || 0)),
        required: Math.max(0, Math.round(Number(point.required || 0) || 0)),
        lastDanger: point.lastDanger || null,
        lastError: String(point.lastError || '')
      }
    };
  }

  function bootstrapStaminaEvidenceRemaining(evidence, windowName) {
    const suffix = String(windowName || '').toLowerCase();
    const values = [
      evidence?.stamina?.['stamina' + suffix],
      evidence?.['stamina' + suffix],
      evidence?.['stamina_' + suffix + '_remaining_milli'],
      suffix === '1d' ? evidence?.stamina1dLastRemaining : undefined
    ];
    for (const value of values) {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
    return null;
  }

  function bootstrapDailyStaminaWindowStartAt(t = Date.now()) {
    const dayMs = 24 * 60 * 60 * 1000;
    const utc8OffsetMs = 8 * 60 * 60 * 1000;
    return Math.floor((t + utc8OffsetMs) / dayMs) * dayMs - utc8OffsetMs;
  }

  function bootstrapEvidenceStamp(evidence) {
    return Math.max(Number(evidence?.updatedAt || 0) || 0, Number(evidence?.at || 0) || 0, Number(evidence?.missingSince || 0) || 0, Number(evidence?.exitAt || 0) || 0, Number(evidence?.startedAt || 0) || 0, Number(evidence?.stamina1dSegmentStartedAt || 0) || 0);
  }

  function readStoredLastSelfEvidence() {
    try {
      const state = JSON.parse(localStorage.getItem(LAST_SELF_STATE_KEY) || 'null');
      if (!state || typeof state !== 'object') return null;
      const self = state.self && typeof state.self === 'object' ? { ...state.self } : { ...state };
      const at = Number(state.at || state.updatedAt || self.at || self.updatedAt || 0) || 0;
      if (at && !Number(self.at || 0)) self.at = at;
      if (at && !Number(self.updatedAt || 0)) self.updatedAt = at;
      return self;
    } catch (_) {
      return null;
    }
  }

  function bootstrapKnownLongStaminaLoginBlock(status = getBotStatus()) {
    const gate = reloginGateFromStatus(status);
    const cooldowns = [gate.cooldown, ...gate.cooldown.candidates].filter(Boolean);
    const remote = cooldowns.find(item => item.source === 'known-stamina-hold' && Number(item.remainingMs || 0) > 0);
    if (remote) return { at: Date.now(), reason: 'known-long-stamina-exhausted', displayReason: remote.reason || remote.staminaHold?.displayReason || '已知长周期体力耗尽，暂不登录', staminaHold: remote.staminaHold || null };
    const t = Date.now();
    const thresholdMs = 1000;
    const sources = [status?.self, status?.lastSelf, status?.lastDecision?.self, status?.session, readStoredLastSelfEvidence()]
      .filter(item => item && typeof item === 'object')
      .map(evidence => ({ evidence, stamp: bootstrapEvidenceStamp(evidence) }))
      .sort((a, b) => Number(b.stamp || 0) - Number(a.stamp || 0));
    const daily = sources.find(item => bootstrapStaminaEvidenceRemaining(item.evidence, '1d') !== null);
    if (!daily || daily.stamp < bootstrapDailyStaminaWindowStartAt(t)) return null;
    const remaining = bootstrapStaminaEvidenceRemaining(daily.evidence, '1d');
    if (remaining === null || remaining >= thresholdMs) return null;
    const until = bootstrapDailyStaminaWindowStartAt(t) + 24 * 60 * 60 * 1000;
    return {
      at: t,
      reason: 'known-long-stamina-exhausted',
      displayReason: '一天体力已耗尽，等待' + formatReloginGateDuration(until - t) + '后再登录',
      staminaHold: { exhausted: ['1d'], until, holdRemainingMs: Math.max(0, Math.round(until - t)), details: [{ window: '1d', remaining, at: daily.stamp }] }
    };
  }

  function readStoredLoginPointSafety() {
    try {
      const raw = JSON.parse(localStorage.getItem(LOGIN_POINT_SAFETY_KEY) || 'null');
      if (!raw || typeof raw !== 'object') return null;
      return resetStoredLoginPointSafetyForCurrentPage(raw);
    } catch (_) {
      return null;
    }
  }

  function currentPageLoadAt() {
    const n = Number(typeof performance !== 'undefined' ? performance.timeOrigin : 0);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
  }

  function resetStoredLoginPointSafetyForCurrentPage(stored) {
    const pageLoadAt = currentPageLoadAt();
    if (!pageLoadAt || Number(stored.pageLoadAt || 0) === pageLoadAt) return stored;
    const next = {
      ...stored,
      streak: 0,
      lastSampleAt: 0,
      lastOkAt: 0,
      lastUnsafeAt: 0,
      lastErrorAt: 0,
      lastError: '',
      lastTick: 0,
      lastDanger: null,
      movement: {},
      pageLoadAt,
      pageLoadResetAt: Date.now(),
      pageLoadResetReason: 'page-load'
    };
    try {
      localStorage.setItem(LOGIN_POINT_SAFETY_KEY, JSON.stringify(next));
    } catch (_) {}
    return next;
  }

  function bootstrapLoginPointSafetyStatus(status = getBotStatus()) {
    const gate = reloginGateFromStatus(status);
    if (Number(gate.loginPointSafety.required || 0) > 0 || gate.loginPointSafety.hasPoint || gate.loginPointSafety.missingPoint) {
      return {
        source: 'bot-status',
        ...gate.loginPointSafety,
        remaining: Math.max(0, Math.round(Number(gate.loginPointSafety.required || 0) - Number(gate.loginPointSafety.streak || 0)))
      };
    }
    const stored = readStoredLoginPointSafety();
    if (!stored) return { source: 'none', ok: true, hasPoint: false, missingPoint: false, streak: 0, required: 0, remaining: 0, lastDanger: null, lastError: '' };
    const required = Math.max(0, Math.round(Number(stored.required ?? 3) || 3));
    const hasPoint = Boolean(stored.point && Number.isFinite(Number(stored.point.x)) && Number.isFinite(Number(stored.point.y)));
    const streak = Math.max(0, Math.min(required, Math.round(Number(stored.streak || 0) || 0)));
    return {
      source: 'local-storage',
      ok: required <= 0 || (hasPoint && streak >= required),
      hasPoint,
      missingPoint: false,
      streak,
      required,
      remaining: hasPoint ? Math.max(0, required - streak) : required,
      lastDanger: stored.lastDanger || null,
      lastError: String(stored.lastError || '')
    };
  }

  function bootstrapLoginPointSafetyBlock(status = getBotStatus()) {
    const staminaBlock = bootstrapKnownLongStaminaLoginBlock(status);
    if (staminaBlock) return staminaBlock;
    const point = bootstrapLoginPointSafetyStatus(status);
    if (point.ok || Number(point.required || 0) <= 0) return null;
    if (!point.hasPoint && !point.missingPoint) return null;
    const missing = Boolean(point.missingPoint || !point.hasPoint);
    const displayReason = missing
      ? '等待登录点坐标，暂不登录'
      : '等待登录点安全快照 ' + String(point.streak || 0) + '/' + String(point.required || 0) + '，暂不登录';
    return {
      at: Date.now(),
      reason: missing ? 'login-point-missing' : 'login-point-safety',
      displayReason,
      pointSafety: point
    };
  }

  function markManualLoginBypass(reason = 'manual login', durationMs = 5000) {
    try {
      unsafeWindow.__graspRatManualLoginBypassUntil = Date.now() + Math.max(1000, Number(durationMs) || 5000);
      unsafeWindow.__graspRatManualLoginBypassReason = String(reason || 'manual login');
    } catch (_) {}
  }

  function manualLoginBypassActive() {
    try {
      return Number(unsafeWindow.__graspRatManualLoginBypassUntil || 0) > Date.now();
    } catch (_) {
      return false;
    }
  }

  function nativeLoginEventControl(event) {
    const raw = event?.submitter || event?.target || null;
    const el = raw?.closest?.('#joinBtn, #loginBtn, [data-testid="login"], [data-testid="join"], a, button, input[type="submit"], input[type="button"], [role="button"]') || null;
    if (!el || el.id === INLINE_LOGIN_BUTTON_ID) return null;
    if (el.matches?.('#joinBtn, #loginBtn, [data-testid="login"], [data-testid="join"]')) return el;
    const text = controlText(el);
    if (/leave|logout|sign out|cancel|退出|离开|取消/i.test(text)) return null;
    return /linuxdo|login|sign in|oauth|authorize|join|start|play|登录|登陆|授权|加入|进入|开始/i.test(text) ? el : null;
  }

  function blockNativeLoginEventIfNeeded(event) {
    const control = nativeLoginEventControl(event);
    if (!control) return;
    if (event?.isTrusted) {
      markManualLoginBypass('trusted native login ' + String(event.type || 'event'));
      return;
    }
    if (manualLoginBypassActive()) return;
    const block = bootstrapLoginPointSafetyBlock(getBotStatus());
    if (!block) return;
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    rememberLoginGateBlock({ ...block, control: control.id ? '#' + control.id : controlText(control) || control.tagName?.toLowerCase?.() || '' }, 'native login ' + String(event.type || 'event'));
  }

  function installStartLinuxDoLoginGate() {
    const owner = unsafeWindow;
    if (owner.__graspRatStartLinuxDoLoginGateInstalled) return;
    owner.__graspRatStartLinuxDoLoginGateInstalled = true;
    let rawStartLinuxDoLogin = owner.startLinuxDoLogin;
    const guardedStartLinuxDoLogin = function graspRatGuardedStartLinuxDoLogin(...args) {
      if (manualLoginBypassActive()) {
        if (typeof rawStartLinuxDoLogin === 'function') return rawStartLinuxDoLogin.apply(this, args);
        return rawStartLinuxDoLogin;
      }
      const block = bootstrapLoginPointSafetyBlock(getBotStatus());
      if (block) {
        rememberLoginGateBlock(block, 'startLinuxDoLogin');
        return false;
      }
      if (typeof rawStartLinuxDoLogin === 'function') return rawStartLinuxDoLogin.apply(this, args);
      return rawStartLinuxDoLogin;
    };
    try {
      const descriptor = Object.getOwnPropertyDescriptor(owner, 'startLinuxDoLogin');
      if (!descriptor || descriptor.configurable) {
        if (descriptor && typeof descriptor.value !== 'undefined') rawStartLinuxDoLogin = descriptor.value;
        Object.defineProperty(owner, 'startLinuxDoLogin', {
          configurable: true,
          enumerable: descriptor ? Boolean(descriptor.enumerable) : true,
          get() {
            return typeof rawStartLinuxDoLogin === 'function' ? guardedStartLinuxDoLogin : rawStartLinuxDoLogin;
          },
          set(value) {
            rawStartLinuxDoLogin = value;
          }
        });
      } else if (typeof owner.startLinuxDoLogin === 'function' && owner.startLinuxDoLogin !== guardedStartLinuxDoLogin) {
        rawStartLinuxDoLogin = owner.startLinuxDoLogin;
        owner.startLinuxDoLogin = guardedStartLinuxDoLogin;
      }
    } catch (err) {
      logBootstrap('startLinuxDoLogin gate install failed', { error: err?.message || String(err) });
    }
  }

  function installNativeLoginGateInterceptors() {
    if (state.nativeLoginGateInstalled) return;
    state.nativeLoginGateInstalled = true;
    installStartLinuxDoLoginGate();
    for (const type of ['pointerdown', 'mousedown', 'touchstart', 'click', 'submit']) {
      document.addEventListener(type, blockNativeLoginEventIfNeeded, true);
    }
  }

  function rememberLoginGateBlock(block, source = 'login gate') {
    if (!block) return null;
    state.lastLoginGateBlock = {
      ...block,
      source: String(source || 'login gate'),
      at: Number(block.at || Date.now()) || Date.now()
    };
    state.lastInstallStatus = state.lastLoginGateBlock.displayReason || '等待登录点安全快照';
    logBootstrap('login blocked by local login-point safety gate', state.lastLoginGateBlock);
    updateBootstrapPanel(true);
    return state.lastLoginGateBlock;
  }

  function reloginGateVisible(status, reloginHold = 0) {
    if (!status) return false;
    if (Number(reloginHold || 0) > 0) return true;
    const reason = String(status?.lastDecision?.reason || status?.login?.lastResult?.reason || '');
    if (/login|relogin|snapshot-gate|no-self|not-alive|session-mismatch|game-session-connecting|offline-leave-wait|enemy-leave-wait|pursuit-leave-wait/.test(reason)) return true;
    return !pageLooksLoggedIn(status);
  }

  function reloginGateLineColor(ok, blocked = false) {
    if (ok) return '#86efac';
    return blocked ? '#fca5a5' : '#fde68a';
  }

  function reloginGateDangerText(danger) {
    const reason = String(danger?.reason || '').trim();
    const actor = danger?.actor || {};
    const actorText = actor.name || (actor.id ? '#' + actor.id : '');
    if (!reason && !actorText) return '';
    return '，阻塞 ' + [reason, actorText].filter(Boolean).join(' ');
  }

  function reloginGatePanelRows(status) {
    const gate = reloginGateFromStatus(status);
    const cooldownOk = gate.cooldown.remainingMs <= 0;
    const pointOk = gate.loginPointSafety.required <= 0 || gate.loginPointSafety.ok;
    const rows = [
      {
        text: '冷却时间: ' + formatReloginGateDuration(gate.cooldown.remainingMs) + ' / ' + formatReloginGateDuration(gate.cooldown.totalMs),
        ok: cooldownOk,
        title: gate.cooldown.reason || gate.cooldown.source || 'login cooldown'
      },
      {
        text: '登录点安全: ' + gate.loginPointSafety.streak + ' / ' + gate.loginPointSafety.required
          + (gate.loginPointSafety.missingPoint ? '，缺少登录点' : '')
          + reloginGateDangerText(gate.loginPointSafety.lastDanger)
          + (gate.loginPointSafety.lastError ? '，错误 ' + gate.loginPointSafety.lastError : ''),
        ok: pointOk,
        blocked: Boolean(gate.loginPointSafety.missingPoint || gate.loginPointSafety.lastDanger || gate.loginPointSafety.lastError),
        title: 'loginPointSafety'
      }
    ];
    return rows;
  }

  function readPersistentExitState(key, t = Date.now()) {
    let detail = null;
    try {
      detail = JSON.parse(localStorage.getItem(key) || 'null');
    } catch (_) {
      detail = null;
    }
    if (!detail || typeof detail !== 'object') return null;
    let reloginUntil = Number(detail.reloginUntil || 0);
    if (reloginUntil && reloginUntil <= t) {
      detail.reloginUntil = 0;
      detail.holdRemainingMs = 0;
      detail.reloginDelayMs = 0;
      reloginUntil = 0;
    }
    if (reloginUntil) detail.holdRemainingMs = Math.max(0, Math.round(reloginUntil - t));
    const base = String(detail.summary || detail.exitSummary || detail.enemyLeaveSummary || detail.reason || '').trim();
    if (base && !detail.displayReason) {
      const waitMs = Number(detail.holdRemainingMs || detail.reloginDelayMs || 0);
      detail.displayReason = base + (waitMs > 0 ? '，等待' + formatDuration(waitMs) : '');
    }
    return detail;
  }

  function activeExitDetailHasHold(detail) {
    const t = Date.now();
    return Boolean(detail && (
      Number(detail.holdRemainingMs || 0) > 0
      || Number(detail.holdUntil || detail.reloginUntil || 0) > t
    ));
  }

  function exitDetailTimestamp(detail) {
    if (!detail) return 0;
    return Math.max(
      Number(detail.lastAt || 0) || 0,
      Number(detail.at || 0) || 0,
      Number(detail.updatedAt || 0) || 0,
      Number(detail.lastResult?.at || 0) || 0,
      Number(detail.holdUntil || detail.reloginUntil || 0) || 0
    );
  }

  function exitDetailHasText(detail) {
    return Boolean(exitDetailText(detail));
  }

  function waitOnlyExitDetailText(value) {
    const text = String(value || '').trim();
    if (!text) return true;
    if (/^(?:login|relogin|snapshot-gate|no-self|not-alive|session-mismatch|game-session-connecting|offline-leave-wait|enemy-leave-wait|pursuit-leave-wait|exit-log-flush-pending|important-log-flush-pending|auto-login|login-cooldown|login-control-missing|known-long-stamina-exhausted)$/.test(text)) return true;
    return /^等待(?:登录点安全快照|重连|退出日志发送完成|会话结束日志发送完成|游戏连接|登录控件|页面跳转)/.test(text)
      || /^已登录，等待游戏连接/.test(text)
      || /^界面显示未登录但原生会话仍在线，等待/.test(text)
      || /^登录已触发，等待页面跳转/.test(text)
      || /^自动触发登录\/加入/.test(text);
  }

  function exitDetailText(detail) {
    const candidates = [
      detail?.summary,
      detail?.exitSummary,
      detail?.enemyLeaveSummary,
      detail?.lastResult?.summary,
      detail?.lastResult?.exitSummary,
      detail?.lastResult?.enemyLeaveSummary,
      detail?.displayReason,
      detail?.lastResult?.displayReason,
      detail?.reason,
      detail?.lastResult?.reason
    ];
    for (const candidate of candidates) {
      const text = String(candidate || '').trim();
      if (text && !waitOnlyExitDetailText(text)) return text;
    }
    return '';
  }

  function pickNewestExitDetail(candidates) {
    return candidates
      .filter(Boolean)
      .sort((a, b) => exitDetailTimestamp(b) - exitDetailTimestamp(a))[0] || null;
  }

  function activePersistentExitDetail(status) {
    const enemyStatus = status?.enemyLeave || null;
    const offlineStatus = status?.offlineLeave || null;
    const activeOfflineStatus = activeExitDetailHasHold(offlineStatus) ? offlineStatus : null;
    const activeEnemyStatus = activeExitDetailHasHold(enemyStatus) ? enemyStatus : null;
    const activeStatus = pickNewestExitDetail([activeOfflineStatus, activeEnemyStatus]);
    if (activeStatus) return activeStatus;
    const visibleStatus = pickNewestExitDetail([offlineStatus, enemyStatus].filter(exitDetailHasText));
    if (visibleStatus) return visibleStatus;
    const offlineStored = readPersistentExitState(OFFLINE_LEAVE_STATE_KEY);
    const enemyStored = readPersistentExitState(ENEMY_LEAVE_STATE_KEY);
    const activeStored = pickNewestExitDetail([
      activeExitDetailHasHold(offlineStored) ? offlineStored : null,
      activeExitDetailHasHold(enemyStored) ? enemyStored : null
    ]);
    if (activeStored) return activeStored;
    return pickNewestExitDetail([offlineStored, enemyStored].filter(exitDetailHasText));
  }

  function reloginWaitReason(status) {
    return String(status?.lastDecision?.reason || status?.login?.lastResult?.reason || '');
  }

  function waitReasonPrefersLastExit(status) {
    return /login|relogin|snapshot-gate|no-self|not-alive|session-mismatch|game-session-connecting|offline-leave-wait|enemy-leave-wait|pursuit-leave-wait/.test(reloginWaitReason(status));
  }

  function decisionReasonDetail(decision, status) {
    if (!decision) return '';
    if (decisionAllowsCurrentExitDetail(decision)) {
      const staminaReason = staminaExhaustedReasonDetail(decision, status);
      if (staminaReason) return staminaReason;
      const currentDetail = currentDecisionExitDetail(decision);
      if (currentDetail) return currentDetail;
    }
    const reason = String(decision?.reason || '').trim();
    return reason ? reasonText(reason) : '';
  }

  function panelReasonDetail(decision, status) {
    if (waitReasonPrefersLastExit(status)) {
      return exitDetailText(activePersistentExitDetail(status));
    }
    return decisionReasonDetail(decision, status);
  }

  function decisionAllowsCurrentExitDetail(decision) {
    if (!decision) return true;
    const kind = String(decision?.kind || '');
    return kind === 'leave' || kind === 'wait' || kind === 'idle';
  }

  function currentDecisionExitDetail(decision) {
    return String(decision?.displayReason
      || decision?.leave?.displayReason
      || decision?.enemyLeave?.displayReason
      || decision?.offlineLeave?.displayReason
      || decision?.leave?.summary
      || decision?.exitSummary
      || decision?.leave?.exitSummary
      || decision?.leave?.enemyLeaveSummary
      || decision?.leave?.enemyLeaveReason
      || '').trim();
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
    const provider = isBunkerWebError ? 'bunkerweb' : 'cloudflare';
    const intervalMs = provider === 'bunkerweb'
      ? Math.max(60000, Number(cfg.page403ErrorReloadMs) || 600000)
      : Math.max(1000, Number(cfg.cloudflareErrorReloadMs) || 5000);
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
      provider,
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

  function displayVersion(value) {
    const text = String(value || '-');
    return text.replace(/^bootstrap-/, '');
  }

  function formatStamina(self) {
    if (!self) return '-';
    const stamina = self.stamina || {};
    const pairText = (remaining, limit) => {
      const r = Number(remaining);
      const l = Number(limit);
      if (!Number.isFinite(r) || !Number.isFinite(l) || l <= 0) return '-/-';
      return Math.max(0, Math.round(r / 1000)) + '/' + Math.round(l / 1000);
    };
    const exhausted = Array.isArray(stamina.exhausted) ? stamina.exhausted : [];
    const suffix = exhausted.length ? ' !' + exhausted.join('/') : '';
    return pairText(stamina.stamina5s ?? self.stamina5s ?? self.stamina_5s_remaining_milli, stamina.stamina5sLimit ?? self.stamina5sLimit ?? self.stamina_5s_limit_milli)
      + ' ' + pairText(stamina.stamina1h ?? self.stamina1h ?? self.stamina_1h_remaining_milli, stamina.stamina1hLimit ?? self.stamina1hLimit ?? self.stamina_1h_limit_milli)
      + ' ' + pairText(stamina.stamina1d ?? self.stamina1d ?? self.stamina_1d_remaining_milli, stamina.stamina1dLimit ?? self.stamina1dLimit ?? self.stamina_1d_limit_milli)
      + suffix;
  }

  function lastDailyStaminaSelf(status) {
    const source = status?.todaySession || status?.session || {};
    const remaining = Number(source.stamina1dLastRemaining);
    const limit = Number(source.stamina1dLastLimit);
    if (!Number.isFinite(remaining) || !Number.isFinite(limit) || limit <= 0) return null;
    return {
      stamina1d: remaining,
      stamina1dLimit: limit,
      stamina: {
        stamina1d: remaining,
        stamina1dLimit: limit
      }
    };
  }

  function staminaWindowRemaining(source, key) {
    const suffix = String(key || '');
    const stamina = source?.stamina || {};
    const candidates = [
      source?.['stamina' + suffix],
      stamina?.['stamina' + suffix],
      source?.['stamina_' + suffix + '_remaining_milli']
    ];
    for (const value of candidates) {
      const number = Number(value);
      if (Number.isFinite(number)) return number;
    }
    return null;
  }

  function staminaExhaustedWindowList(source) {
    const stamina = source?.stamina || source || {};
    const raw = Array.isArray(stamina.longExhausted)
      ? stamina.longExhausted
      : (Array.isArray(stamina.exhausted) ? stamina.exhausted : []);
    const windows = [];
    for (const item of raw) {
      const key = String(item || '').toLowerCase();
      if ((key === '1h' || key === '1d') && !windows.includes(key)) windows.push(key);
    }
    for (const key of ['1h', '1d']) {
      const remaining = staminaWindowRemaining(source || stamina, key);
      if (remaining !== null && remaining < 1000 && !windows.includes(key)) windows.push(key);
    }
    return ['1h', '1d'].filter(key => windows.includes(key));
  }

  function staminaExhaustedReasonText(source) {
    const label = staminaExhaustedWindowList(source).join('/');
    if (label === '1h') return '一小时体力到达限制，退出等待重连';
    if (label === '1d') return '一天体力到达限制，退出等待重连';
    if (label === '1h/1d') return '一小时和一天体力到达限制，退出等待重连';
    return '';
  }

  function staminaExhaustedReasonDetail(decision, status) {
    const sources = [
      decision?.offlineSafety?.staminaExhausted,
      decision?.leave?.offlineSafety?.staminaExhausted,
      decision?.stamina,
      decision?.self,
      status?.lastDecision?.offlineSafety?.staminaExhausted,
      status?.lastDecision?.leave?.offlineSafety?.staminaExhausted,
      status?.lastDecision?.stamina,
      status?.lastDecision?.self,
      status?.offlineLeave?.safety?.staminaExhausted,
      status?.offlineLeave?.lastResult?.offlineSafety?.staminaExhausted,
      status?.self,
      status?.lastSelf
    ];
    for (const source of sources) {
      const text = staminaExhaustedReasonText(source);
      if (text) return text;
    }
    return '';
  }

  function sessionStaminaSpentMs(session, self) {
    if (session && Object.prototype.hasOwnProperty.call(session, 'stamina1dSpentMs')) {
      const spent = Number(session.stamina1dSpentMs);
      if (Number.isFinite(spent)) return Math.max(0, spent);
    }
    const stamina = self?.stamina || {};
    const remaining = Number(stamina.stamina1d ?? self?.stamina1d ?? self?.stamina_1d_remaining_milli ?? NaN);
    const limit = Number(stamina.stamina1dLimit ?? self?.stamina1dLimit ?? self?.stamina_1d_limit_milli ?? NaN);
    if (!Number.isFinite(remaining) || !Number.isFinite(limit) || limit <= 0) return null;
    return Math.max(0, limit - remaining);
  }

  function formatStaminaSpent(session, self) {
    const spent = sessionStaminaSpentMs(session, self);
    if (!Number.isFinite(Number(spent))) return '-';
    return formatNumber(Math.max(0, Number(spent)) / 1000, '0');
  }

  function formatStaminaSpentMs(value) {
    const spent = Number(value);
    if (!Number.isFinite(spent)) return '-';
    return formatNumber(Math.max(0, spent) / 1000, '0');
  }

  function formatAge(at) {
    const t = Number(at || 0);
    return t ? formatDuration(Date.now() - t) : '-';
  }

  function formatClockTime(t = Date.now()) {
    const d = new Date(Number(t) || Date.now());
    return String(d.getHours()).padStart(2, '0') + ':'
      + String(d.getMinutes()).padStart(2, '0') + ':'
      + String(d.getSeconds()).padStart(2, '0');
  }

  function reasonText(reason) {
    const map = {
      'active-threat-before-bullet-range': 'Active 玩家进入危险圈',
      'active-threat-caution-migration': 'Active 玩家进入预警圈',
      'active-threat-return-block': '阻止回头靠近 Active 玩家',
      'return-block-lateral-scan': 'Active 返程冷却：横向扫描',
      'passive-panic-distance': '玩家距离过近',
      'avoid-invulnerable-target': '避开无敌/危险目标',
      'recovery-avoid-humans': '回血时避开附近玩家',
      'recovery-foot-coin': '回血时顺手拾取脚下金币',
      'foot-coin-priority': '贴身金币优先拾取',
      'foot-coin-before-active-caution': '预警区内只拾取贴身金币',
      'near-coin-priority': '近处安全金币优先',
      'near-coin-before-active-caution': '预警区内只拾取近处安全金币',
      'safe-coin-before-drop-target': '安全金币优先于攻击',
      'safe-global-coin-before-drop-target': '前往可见安全金币',
      'safe-patrol-coin': '巡航拾取安全金币',
      'safe-distant-coin': '前往远处安全金币',
      'post-attack-drop-coin': '战斗后优先拾取掉落',
      'high-value-visible-coin-priority': '高价值可见金币优先',
      'best-opportunity-coin': '综合收益最高：拾取金币',
      'best-opportunity-coin-route': '综合收益最高：金币路线',
      'best-opportunity-visible-coin': '综合收益最高：前往可见金币',
      'best-opportunity-drop-target': '综合收益最高：攻击 Drop 目标',
      'best-opportunity-afk-drop-target': '综合收益最高：攻击挂机 Drop 目标',
      'approach-profitable-drop-target': '综合收益最高：靠近高 Drop 目标',
      'approach-afk-drop-target': '综合收益最高：靠近挂机 Drop 目标',
      'opportunistic-afk-drop-shot': '顺手射击挂机 Drop 目标',
      'migrate-to-known-field': '迁移到金币密集区域',
      'scan-toward-distant-coin': '扫描远处金币',
      'snapshot-coin-field': '等待视野内金币刷新',
      'snapshot-coin-target': '等待视野内金币刷新',
      'snapshot-coin-idle-timeout': '等待视野内金币刷新',
      'wait-for-stamina-budget': '长期体力预算不足',
      'stamina-budget-coin-leave': '一小时体力预算不足，退出等待恢复',
      'stamina-budget-coin-leave-retry': '一小时体力预算不足，重试退出',
      'wait-for-snapshot-coin': '等待视野内金币刷新',
      'login-suppressed': '等待重连',
      'known-long-stamina-exhausted': '已知长周期体力耗尽，暂不登录',
      'exit-log-flush-pending': '等待退出日志发送完成',
      'important-log-flush-pending': '等待会话结束日志发送完成',
      'maintain-safe-spacing': '避开附近玩家',
      'ignore-stale-coin-no-progress': '金币长时间无进展，临时脱离',
      'leave-stale-coin': '离开疑似卡住金币',
      'wait-for-full-stamina-and-hp': '等待恢复到安全状态',
      'conserve-stamina-before-chasing': '兼容旧逻辑：保存体力',
      'save-stamina-for-profitable-coin': '兼容旧逻辑：等待目标',
      'combat-attack': '战斗：持续开火',
      'combat-tangent-dodge': '战斗：切线规避并开火',
      'combat-stamina-hold': '战斗：短体力不足，停止移动并开火',
      'combat-stamina-conserve': '战斗：保留体力躲避，暂停开火',
      'combat-burst-fire': '战斗：保留体力，降频开火',
      'combat-pressure-close': '战斗：久攻未中，压近开火',
      'combat-far-pressure-close': '战斗：远距久攻未中，压近开火',
      'combat-retreating-fighter-close': '战斗：退边反击目标，压近开火',
      'combat-finish-pressure': '战斗：残血目标退边，压近补枪',
      'combat-finish-reengage': '战斗：残血目标出圈，重新靠近',
      'combat-spacing': '战斗：保持安全间距并开火',
      'combat-spacing-dodge': '战斗：规避贴近并开火',
      'combat-out-of-range-dodge': '战斗：超距来弹，只规避',
      'combat-out-of-range-hold': '战斗：目标超出射程，暂停追击',
      'combat-out-of-range-reengage': '战斗：目标轻微出圈，重新靠近',
      'combat-target-retreating': '战斗：目标退边，暂停开火',
      'combat-active-threat-wait': '战斗：等待 Active 威胁明确',
      'combat-reengage': '战斗：重新靠近目标',
      'combat-disengage-range': '战斗：目标远离，脱离观察',
      'combat-critical-hp-leave': '战斗血量低于 20，立即退出',
      'combat-low-hp-leave': '战斗低血劣势，立即退出',
      'combat-low-hp-no-damage-leave': '战斗低血且久攻未中，立即退出',
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
      'control-ws-reconnect-churn': 'WebSocket 反复重连，立即退出',
      'control-ws-no-self-game-session': '已登录但自身实体不可见，立即退出',
      'control-ws-server-position-stalled': '服务端位置停止，按 WebSocket 离线处理',
      'control-global-sampling-outage': '网络采样超时，按 WebSocket 离线处理',
      'control-combat-tick-gap': '战斗主循环断档，按 WebSocket 离线处理',
      'control-action-settlement-stalled': '移动/开火结算卡死，按 WebSocket 离线处理',
      'control-stamina-exhausted': '长周期体力耗尽，按 WebSocket 离线处理',
      'stamina-exhausted-leave': '长周期体力耗尽，正在退出',
      'offline-leave': 'WebSocket 离线，正在退出',
      'offline-leave-wait': 'WebSocket 离线退出后等待重连',
      'cloudflare-error-refresh': 'Cloudflare 错误页，等待刷新',
      'leave-success-refresh-confirmation': '退出成功后刷新确认',
      'post-attack-drop-wait-position': '战斗后等待掉落刷新',
      'target-whitelisted': '目标在白名单内，跳过攻击',
      'login-snapshot-gate': '等待登录点安全快照',
      'login-control-missing': '等待登录控件出现',
      'session-mismatch-refresh': '界面显示未登录但原生会话仍在线，刷新确认状态',
      'session-mismatch-recovery': '界面显示未登录但原生会话仍在线，等待安全恢复接管',
      'game-session-connecting': '已登录，等待游戏连接/自身实体',
      'no-self': '未读到自身实体',
      'not-alive': '不在存活状态',
      'startup-error': '脚本启动异常',
      'bot-error': '脚本异常'
    };
    return map[reason] || reason || '-';
  }

  function isCombatDecision(decision, status) {
    const reason = String(decision?.reason || '');
    return Boolean(decision?.combat || decision?.combatState || /^combat-/.test(reason) || status?.combatTarget);
  }

  function behaviorText(decision, status) {
    if (status?.paused || isPaused()) return '已暂停';
    if (state.cloudflareError) return '等待刷新错误页';
    if (!status?.running) return '远端未运行';
    const kind = decision?.kind || (status?.running ? 'wait' : 'missing');
    const reason = String(decision?.reason || '');
    if (isCombatDecision(decision, status)) {
      if (kind === 'attack') {
        if (/pressure-close/.test(reason)) return '战斗中：压近开火';
        if (/spacing/.test(reason)) return '战斗中：拉距开火';
        if (/dodge|tangent/.test(reason)) return '战斗中：规避开火';
        return '战斗中：持续开火';
      }
      if (kind === 'seek-enemy') return '战斗中：重新接敌';
      if (kind === 'leave') return '战斗中：退出';
      if (kind === 'wait') return '战斗后等待';
      return '战斗中';
    }
    if (kind === 'coin') return '拾取金币';
    if (kind === 'seek-coin') return '前往金币';
    if (kind === 'attack') return '攻击目标';
    if (kind === 'seek-enemy' || kind === 'seek-drop') return '前往目标';
    if (kind === 'flee') return '避险撤离';
    if (kind === 'recover') return '恢复体力/血量';
    if (kind === 'patrol') return '巡航扫描';
    if (kind === 'wait') return '等待';
    if (kind === 'leave') return '退出';
    if (kind === 'idle') return '待命';
    if (kind === 'missing') return '远端未运行';
    return kind;
  }

  function targetNameText(target) {
    if (!target) return '-';
    return target.name || ('#' + (target.id ?? '-'));
  }

  function panelTextPart(text, color, weight = '') {
    let style = color ? 'color:' + color : '';
    if (weight) style += (style ? ';' : '') + 'font-weight:' + weight;
    return { text, style };
  }

  function panelPartsText(parts) {
    return parts.map(part => part && typeof part === 'object' ? String(part.text ?? '') : String(part ?? '')).join('');
  }

  function hpValueColor(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '#cbd5e1';
    if (n >= 80) return '#86efac';
    if (n >= 45) return '#fde68a';
    return '#fca5a5';
  }

  function networkQualityLatencyText(summary) {
    const n = Number(summary?.displayLatencyMs);
    return Number.isFinite(n) ? Math.max(0, Math.round(n)) + 'ms' : '??ms';
  }

  function networkQualityLossText(summary) {
    const n = Number(summary?.lossPercent);
    return Number.isFinite(n) ? Math.max(0, n).toFixed(2) + '%' : '??.??%';
  }

  function networkQualitySummaryText(summary) {
    return networkQualityLatencyText(summary) + '/' + networkQualityLossText(summary);
  }

  function networkQualityLatencyColor(summary) {
    if (!summary?.enabled) return '#cbd5e1';
    if (summary.stalled) return '#fca5a5';
    const n = Number(summary.displayLatencyMs);
    if (!Number.isFinite(n)) return '#cbd5e1';
    if (n <= 150) return '#86efac';
    if (n <= 300) return '#fde68a';
    return '#fca5a5';
  }

  function networkQualityLossColor(summary) {
    if (!summary?.enabled) return '#cbd5e1';
    if (summary.stalled) return '#fca5a5';
    const n = Number(summary.lossPercent);
    if (!Number.isFinite(n)) return '#cbd5e1';
    if (n <= 1) return '#86efac';
    if (n <= 3) return '#fde68a';
    return '#fca5a5';
  }

  function networkQualityLatencyTitle(summary) {
    if (!summary?.enabled) return '延迟：暂无运行时网络质量样本';
    if (!Number.isFinite(Number(summary.displayLatencyMs))) return '延迟：等待运行时网络质量样本';
    const source = summary.latencySource === 'movement' ? '移动动作确认' : 'WS状态帧';
    return '延迟 ' + networkQualityLatencyText(summary)
      + '，近似普通网游 ping，来源：' + source
      + '；预期帧间隔 ' + (summary.expectedFrameMs ?? '-') + 'ms'
      + '，抖动 ' + (summary.jitterEmaMs ?? '-') + 'ms'
      + '，最近帧 ' + (summary.lastFrameAgeMs ?? '-') + 'ms 前';
  }

  function networkQualityLossTitle(summary) {
    if (!summary?.enabled) return '丢包：暂无运行时网络质量样本';
    if (!Number.isFinite(Number(summary.lossPercent))) return '丢包：等待 WS 状态帧样本';
    return '丢包 ' + networkQualityLossText(summary)
      + '，按近 ' + Math.round(Number(summary.windowMs || 0) / 1000) + ' 秒 WS 状态帧长间隔推断'
      + '；估算丢帧 ' + (summary.estimatedLostFrames ?? '-')
      + ' / 预期帧 ' + (summary.expectedFrames ?? '-')
      + (summary.stalled ? '，当前状态帧停滞' : '');
  }

  function networkQualitySummaryTitle(summary) {
    return networkQualityLatencyTitle(summary) + '\n' + networkQualityLossTitle(summary);
  }

  function targetSummaryParts(decision, status) {
    const target = decision?.target || null;
    const kind = decision?.kind || '';
    if (target) {
      const parts = [];
      const isCoin = kind === 'coin' || kind === 'seek-coin' || (target.amount !== undefined && target.drop === undefined && target.hp === undefined);
      parts.push(panelTextPart(isCoin ? '金币 ' : '目标 ', isCoin ? '#facc15' : '#93c5fd', '700'));
      parts.push(panelTextPart(targetNameText(target), '#e5edf7', '700'));
      if (target.distance !== undefined) {
        parts.push(panelTextPart(' 距离 ', '#64748b'));
        parts.push(panelTextPart(formatDistance(target.distance), '#67e8f9', '700'));
      }
      if (target.amount !== undefined) {
        parts.push(panelTextPart(' 金币 ', '#64748b'));
        parts.push(panelTextPart(target.amount, '#facc15', '700'));
      }
      if (target.hp !== undefined) {
        parts.push(panelTextPart(' HP ', '#64748b'));
        parts.push(panelTextPart(target.hp, hpValueColor(target.hp), '700'));
      }
      if (target.drop !== undefined) {
        parts.push(panelTextPart(' Drop ', '#64748b'));
        parts.push(panelTextPart(target.drop, '#fbbf24', '700'));
      }
      return parts;
    }
    const threats = Array.isArray(decision?.threats) ? decision.threats : [];
    if (kind === 'flee' && threats[0]) {
      const threat = threats[0];
      return [
        panelTextPart('威胁 ', '#fca5a5', '700'),
        panelTextPart(threat.name || ('#' + threat.id), '#e5edf7', '700'),
        panelTextPart(' 距离 ', '#64748b'),
        panelTextPart(formatDistance(threat.d ?? threat.distance), '#67e8f9', '700')
      ];
    }
    const combatTarget = status?.combatTarget;
    if (isCombatDecision(decision, status) && combatTarget) {
      const parts = [
        panelTextPart('目标 ', '#93c5fd', '700'),
        panelTextPart(targetNameText(combatTarget), '#e5edf7', '700')
      ];
      if (combatTarget.hp !== undefined) {
        parts.push(panelTextPart(' HP ', '#64748b'));
        parts.push(panelTextPart(combatTarget.hp, hpValueColor(combatTarget.hp), '700'));
      }
      return parts;
    }
    return [panelTextPart('-', '#64748b')];
  }

  function targetSummaryText(decision, status) {
    return panelPartsText(targetSummaryParts(decision, status));
  }

  function hpText(value) {
    const n = Number(value);
    return Number.isFinite(n) ? String(Math.round(n)) : '-';
  }

  function entityNameText(entity) {
    const name = String(entity?.name || entity?.label || '').trim();
    if (name) return name;
    const id = entity?.id ?? entity?.userId ?? entity?.user_id ?? entity?.uid;
    if (id === undefined || id === null || id === '') return targetNameText(entity);
    return '#' + id;
  }

  function combatHpValueColor(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '#cbd5e1';
    if (n > 80) return '#86efac';
    if (n >= 50) return '#fde68a';
    if (n >= 20) return '#fb923c';
    return '#fca5a5';
  }

  function combatHpMaxValue(entity, fallback = 100) {
    const n = Number(entity?.maxHp ?? entity?.max_hp ?? fallback);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  function combatHpPercent(value, maxValue) {
    const hp = Number(value);
    const max = Number(maxValue);
    if (!Number.isFinite(hp) || !Number.isFinite(max) || max <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((hp / max) * 100)));
  }

  function combatHpFillGradient(value, align) {
    const n = Number(value);
    const dir = align === 'right' ? '270deg' : '90deg';
    if (!Number.isFinite(n)) return 'linear-gradient(' + dir + ',#64748b,#cbd5e1)';
    if (n >= 50) return 'linear-gradient(' + dir + ',#16a34a,#bef264)';
    if (n >= 20) return 'linear-gradient(' + dir + ',#f59e0b,#fde047)';
    return 'linear-gradient(' + dir + ',#dc2626,#fb7185)';
  }

  function combatHpSummary(decision, status, self) {
    const target = decision?.target || status?.combatTarget || null;
    const selfEntity = self || decision?.self || status?.self || null;
    const selfHp = Number(decision?.combatState?.selfHp ?? self?.hp ?? status?.self?.hp ?? NaN);
    const targetHp = Number(decision?.combatState?.targetHp ?? target?.hp ?? NaN);
    return {
      selfHp,
      targetHp,
      selfMaxHp: combatHpMaxValue(selfEntity),
      targetMaxHp: combatHpMaxValue(target),
      selfName: entityNameText(selfEntity),
      targetName: entityNameText(target)
    };
  }

  function appendCombatHpPanel(parent, hp) {
    const box = document.createElement('div');
    box.setAttribute('aria-label', '战斗血量 ' + hp.selfName + ' ' + hpText(hp.selfHp) + ' VS ' + hpText(hp.targetHp) + ' ' + hp.targetName);
    box.style.cssText = [
      'width:100%',
      'box-sizing:border-box',
      'padding:8px 16px 9px',
      'border-top:1px solid rgba(248,113,113,.36)',
      'border-bottom:1px solid rgba(248,113,113,.36)',
      'background:rgba(24,24,27,.96)',
      'display:grid',
      'grid-template-columns:minmax(0,1fr) 34px minmax(0,1fr)',
      'align-items:center',
      'gap:8px',
      'font-variant-numeric:tabular-nums',
      'box-shadow:inset 0 1px 0 rgba(255,255,255,.04),inset 0 -1px 0 rgba(0,0,0,.32)'
    ].join(';');

    const sideBlock = (name, value, maxValue, align, nameColor) => {
      const right = align === 'right';
      const wrap = document.createElement('div');
      wrap.style.cssText = [
        'min-width:0',
        'display:grid',
        'gap:4px',
        'justify-items:' + (right ? 'end' : 'start'),
        'text-align:' + align
      ].join(';');
      const nameNode = document.createElement('div');
      nameNode.textContent = String(name || '-');
      nameNode.title = nameNode.textContent;
      nameNode.style.cssText = [
        'max-width:100%',
        'overflow:hidden',
        'text-overflow:ellipsis',
        'white-space:nowrap',
        'color:' + nameColor,
        'font-size:11px',
        'line-height:1.05',
        'font-weight:800'
      ].join(';');
      const hpNode = document.createElement('div');
      hpNode.textContent = 'HP ' + hpText(value);
      hpNode.style.cssText = [
        'color:' + combatHpValueColor(value),
        'font-size:13px',
        'line-height:1',
        'font-weight:900',
        'letter-spacing:0'
      ].join(';');
      const track = document.createElement('div');
      track.style.cssText = [
        'position:relative',
        'width:100%',
        'height:10px',
        'box-sizing:border-box',
        'border:1px solid rgba(226,232,240,.26)',
        'background:rgba(15,23,42,.82)',
        'overflow:hidden',
        'box-shadow:inset 0 1px 3px rgba(0,0,0,.55)'
      ].join(';');
      const fill = document.createElement('div');
      fill.style.cssText = [
        'position:absolute',
        'top:0',
        right ? 'right:0' : 'left:0',
        'height:100%',
        'width:' + combatHpPercent(value, maxValue) + '%',
        'background:' + combatHpFillGradient(value, align),
        'box-shadow:inset 0 1px 0 rgba(255,255,255,.35)'
      ].join(';');
      track.appendChild(fill);
      wrap.appendChild(nameNode);
      wrap.appendChild(hpNode);
      wrap.appendChild(track);
      return wrap;
    };

    const vs = document.createElement('div');
    vs.textContent = 'VS';
    vs.style.cssText = 'align-self:center;text-align:center;color:#e2e8f0;font-size:12px;line-height:1;font-weight:900;letter-spacing:0';
    box.appendChild(sideBlock(hp.selfName, hp.selfHp, hp.selfMaxHp, 'right', '#86efac'));
    box.appendChild(vs);
    box.appendChild(sideBlock(hp.targetName, hp.targetHp, hp.targetMaxHp, 'left', '#fca5a5'));
    parent.appendChild(box);
    return box;
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
    const gm = {
      until: Number(GM_getValue(LOGIN_SUPPRESS_KEY, 0)) || 0,
      reason: String(GM_getValue(LOGIN_SUPPRESS_REASON_KEY, '') || '')
    };
    const memory = {
      until: Number(state.lastLoginSuppressUntil || 0) || 0,
      reason: String(state.lastLoginSuppressReason || '')
    };
    const local = readLocalSuppress();
    return [gm, memory, local].sort((a, b) => Number(b.until || 0) - Number(a.until || 0))[0] || { until: 0, reason: '' };
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
    GM_setValue(LOGIN_SUPPRESS_KEY, until);
    GM_setValue(LOGIN_SUPPRESS_REASON_KEY, state.lastLoginSuppressReason);
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
    GM_setValue(LOGIN_SUPPRESS_KEY, 0);
    GM_setValue(LOGIN_SUPPRESS_REASON_KEY, '');
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
    const bot = clearBot ? (unsafeWindow.__graspRatBot || null) : null;
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
    return String(GM_getValue(PAUSE_REASON_KEY, reason || '') || reason || '');
  }

  function storedBoolean(value) {
    return value === true || value === 'true' || value === 1 || value === '1';
  }

  function isPaused(options = {}) {
    let localPaused = false;
    try {
      localPaused = localStorage.getItem(PAUSED_KEY) === 'true';
    } catch (_) {}
    const includePageFlag = options.includePageFlag !== false;
    const paused = Boolean(storedBoolean(GM_getValue(PAUSED_KEY, false)) || localPaused || (includePageFlag && unsafeWindow.__graspRatBotPaused === true));
    state.paused = paused;
    state.pauseReason = paused ? (readPauseReason() || state.pauseReason || 'manual') : '';
    return paused;
  }

  function writePauseState(paused, reason = '') {
    const next = Boolean(paused);
    const text = next ? String(reason || state.pauseReason || 'manual') : '';
    state.paused = next;
    state.pauseReason = text;
    GM_setValue(PAUSED_KEY, next);
    GM_setValue(PAUSE_REASON_KEY, text);
    unsafeWindow.__graspRatBotPaused = next;
    unsafeWindow.__graspRatBotPauseReason = text;
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
      const bot = unsafeWindow.__graspRatBot || null;
      try {
        if (bot?.setPaused) {
          const reason = paused ? (state.pauseReason || 'bootstrap') : 'bootstrap resume';
          const botPaused = Boolean(bot.paused);
          const botReason = String(bot.pauseReason || '');
          if (botPaused !== paused || (paused && botReason !== reason)) {
            bot.setPaused(paused, reason);
          }
        } else if (paused && bot?.stop) {
          bot.stop('paused by bootstrap');
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

  function directChildren(el) {
    return Array.from(el?.children || []);
  }

  function getNativeSidebar() {
    return document.querySelector('aside.side') || document.querySelector('.app > .side');
  }

  function nativeSidebarBlock(side, test) {
    return directChildren(side).find(el => {
      try {
        return Boolean(test(el));
      } catch (_) {
        return false;
      }
    }) || null;
  }

  function setDisplayNone(el) {
    if (!el) return false;
    const changed = el.dataset.graspRatHiddenNativeBlock !== 'true'
      || el.getAttribute('aria-hidden') !== 'true'
      || el.style.display !== 'none';
    el.dataset.graspRatHiddenNativeBlock = 'true';
    el.setAttribute('aria-hidden', 'true');
    try {
      el.style.setProperty('display', 'none', 'important');
    } catch (_) {
      el.style.display = 'none';
    }
    return changed;
  }

  function dispatchNativeViewportResize(reason = 'layout') {
    try {
      window.dispatchEvent(new Event('resize'));
      state.lastNativeViewportResizeAt = Date.now();
      state.lastNativeViewportResizeReason = String(reason || 'layout');
    } catch (err) {
      noteBootstrapError('native viewport resize dispatch failed', err);
    }
  }

  function scheduleNativeViewportResize(reason = 'layout') {
    const t = Date.now();
    if (state.nativeViewportResizeScheduled && t - Number(state.nativeViewportResizeScheduledAt || 0) < 1200) return;
    state.nativeViewportResizeScheduled = true;
    state.nativeViewportResizeScheduledAt = t;
    const run = phase => dispatchNativeViewportResize(`${reason}:${phase}`);
    try {
      requestAnimationFrame(() => {
        run('raf1');
        requestAnimationFrame(() => run('raf2'));
      });
    } catch (_) {
      setTimeout(() => run('timeout-0'), 0);
    }
    setTimeout(() => run('timeout-80'), 80);
    setTimeout(() => {
      run('timeout-320');
      state.nativeViewportResizeScheduled = false;
    }, 320);
  }

  function ensureHostLayoutStyle() {
    if (!document.head) return;
    let style = document.getElementById(HOST_LAYOUT_STYLE_ID);
    let changed = false;
    if (!style) {
      style = document.createElement('style');
      style.id = HOST_LAYOUT_STYLE_ID;
      document.head.appendChild(style);
      changed = true;
    }
    const text = [
      'body.grasp-rat-bot-sidebar-embedded{margin:0!important;overflow:hidden!important}',
      'body.grasp-rat-bot-sidebar-embedded .app{display:flex!important;flex-direction:row!important;width:100vw!important;max-width:100vw!important;height:100vh!important;min-height:100vh!important;margin:0!important;padding:0!important;gap:0!important;align-items:stretch!important;overflow:hidden!important}',
      'body.grasp-rat-bot-sidebar-embedded .side{position:relative!important;left:0!important;top:0!important;bottom:0!important;transform:none!important;align-self:stretch!important;flex:0 0 min(336px,100vw)!important;width:min(336px,100vw)!important;min-width:min(336px,100vw)!important;max-width:min(336px,100vw)!important;height:100vh!important;min-height:100vh!important;max-height:100vh!important;margin:0!important;border-radius:0!important;display:flex!important;flex-direction:column!important;overflow:hidden!important}',
      'body.grasp-rat-bot-sidebar-embedded .workspace{position:relative!important;inset:auto!important;left:auto!important;right:auto!important;top:auto!important;bottom:auto!important;display:grid!important;grid-template-rows:minmax(0,1fr)!important;align-self:stretch!important;transform:none!important;margin:0!important;flex:1 1 0!important;min-width:0!important;width:auto!important;max-width:none!important;height:100vh!important;min-height:100vh!important;max-height:100vh!important;overflow:hidden!important}',
      'body.grasp-rat-bot-sidebar-embedded .workspace>.map-shell{position:relative!important;inset:auto!important;width:100%!important;height:100%!important;min-width:0!important;min-height:0!important;overflow:hidden!important}',
      'body.grasp-rat-bot-sidebar-embedded .workspace #world{width:100%!important;height:100%!important;display:block!important}',
      '@media (min-aspect-ratio:1/1){body.grasp-rat-bot-sidebar-embedded .workspace #world{width:calc(100% + 368px)!important;max-width:none!important;margin-left:-368px!important}}',
      'body.grasp-rat-bot-sidebar-embedded .side>.brand,body.grasp-rat-bot-sidebar-embedded .side>.view-control,body.grasp-rat-bot-sidebar-embedded .side>[data-grasp-rat-hidden-native-block="true"]{display:none!important}',
      'body.grasp-rat-bot-sidebar-embedded #joinBtn[data-grasp-rat-native-login-hidden="true"]{display:none!important}',
      'body.grasp-rat-bot-sidebar-embedded .side>.bottom-dock{position:static!important;left:auto!important;right:auto!important;top:auto!important;bottom:auto!important;inset:auto!important;transform:none!important;width:auto!important;max-width:none!important;margin:0!important;border-radius:0!important;flex:1 1 auto!important;min-height:80px!important;display:flex!important;flex-direction:column!important;overflow:hidden!important}',
      'body.grasp-rat-bot-sidebar-embedded .side>.bottom-dock>.dock-minimap{display:none!important}',
      'body.grasp-rat-bot-sidebar-embedded .side>.bottom-dock>.log-wrap{flex:1 1 auto!important;min-height:0!important;display:flex!important;flex-direction:column!important}',
      'body.grasp-rat-bot-sidebar-embedded .side .log{flex:1 1 auto!important;min-height:80px!important}',
      'body.grasp-rat-bot-sidebar-embedded #' + PANEL_ID + '{margin:0!important;flex:0 0 auto!important;border-bottom:1px solid rgba(148,163,184,.20)!important}',
      '@keyframes grasp-rat-dot-pending{0%,100%{opacity:1;transform:translate(-50%,-50%) scale(1)}50%{opacity:.38;transform:translate(-50%,-50%) scale(.72)}}',
      '@keyframes grasp-rat-dot-pending-inline{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.38;transform:scale(.72)}}'
    ].join('\n');
    if (style.textContent !== text) {
      style.textContent = text;
      changed = true;
    }
    if (changed) scheduleNativeViewportResize('host-layout-style');
    return changed;
  }

  function syncNativeSidebarStructure() {
    const side = getNativeSidebar();
    if (!side || !document.body) {
      document.body?.classList.remove('grasp-rat-bot-sidebar-embedded');
      return null;
    }
    let changed = Boolean(ensureHostLayoutStyle());
    const hadClass = document.body.classList.contains('grasp-rat-bot-sidebar-embedded');
    document.body.classList.add('grasp-rat-bot-sidebar-embedded');
    changed = changed || !hadClass;
    changed = setDisplayNone(nativeSidebarBlock(side, el => el.classList?.contains('brand'))) || changed;
    changed = setDisplayNone(nativeSidebarBlock(side, el => el.querySelector?.('#status,#inGame,#entities,#visibleCount,#cells') || /Runtime Metrics/i.test(el.textContent || ''))) || changed;
    changed = setDisplayNone(nativeSidebarBlock(side, el => el.classList?.contains('view-control') || el.querySelector?.('#densityText,#scaleText,#staminaText,#teleportInput,#zoomOutBtn,#zoomInBtn'))) || changed;
    if (changed) scheduleNativeViewportResize('sidebar-structure');
    return side;
  }

  function controlWsLooksActive(control) {
    const states = [control?.nativeWsReadyState, control?.wsReadyState];
    return Boolean(control?.rawWsOpen || control?.nativeWsOpen || control?.wsOpen || control?.connecting || states.some(value => {
      const n = Number(value);
      return n === 0 || n === 1;
    }));
  }

  function pageLooksLoggedIn(status) {
    const inputText = String(document.getElementById('userId')?.value || '').trim();
    const hasNativeUser = Boolean(inputText && !/linuxdo|login|登录|登陆/i.test(inputText));
    const control = status?.control || {};
    const hasToken = Boolean(localStorage.getItem('tmpGameSessionToken') || control.hasToken);
    const hasSelf = Boolean(status?.self || status?.lastDecision?.self);
    const statusUserId = Number(currentUserIdFromStatus(status) || 0);
    return Boolean(hasNativeUser || hasToken || hasSelf || (statusUserId && controlWsLooksActive(control)));
  }

  function reloginHoldRemainingFromStatus(status) {
    const persistent = activePersistentExitDetail(status);
    return Math.max(
      0,
      Number(status?.enemyLeave?.holdRemainingMs || 0) || 0,
      Number(status?.pursuitLeave?.holdRemainingMs || 0) || 0,
      Number(status?.offlineLeave?.holdRemainingMs || 0) || 0,
      Number(status?.lastDecision?.holdRemainingMs || 0) || 0,
      Number(persistent?.holdRemainingMs || 0) || 0
    );
  }

  function shouldShowInlineLogin(status) {
    const reloginHold = reloginHoldRemainingFromStatus(status);
    return reloginHold > 0
      || waitReasonPrefersLastExit(status)
      || !pageLooksLoggedIn(status);
  }

  function syncEntityControlLogin(status) {
    const side = getNativeSidebar();
    const nativeJoin = document.getElementById('joinBtn');
    if (nativeJoin) {
      nativeJoin.dataset.graspRatNativeLoginHidden = 'true';
      nativeJoin.setAttribute('aria-hidden', 'true');
      try {
        nativeJoin.style.setProperty('display', 'none', 'important');
      } catch (_) {
        nativeJoin.style.display = 'none';
      }
    }
    const grid = nativeJoin?.parentElement || side?.querySelector?.('.control-grid') || null;
    if (!grid) return;
    let loginButton = document.getElementById(INLINE_LOGIN_BUTTON_ID);
    const reloginHold = reloginHoldRemainingFromStatus(status);
    const loginGateBlock = bootstrapLoginPointSafetyBlock(status);
    if (state.cloudflareError || !shouldShowInlineLogin(status)) {
      if (loginButton) loginButton.remove();
      return;
    }
    const anchor = nativeJoin || document.getElementById('leaveBtn') || null;
    if (!loginButton) {
      loginButton = document.createElement('button');
      loginButton.id = INLINE_LOGIN_BUTTON_ID;
      loginButton.type = 'button';
      grid.insertBefore(loginButton, anchor);
    } else if (loginButton.parentElement !== grid || loginButton.nextSibling !== anchor) {
      grid.insertBefore(loginButton, anchor);
    }
    loginButton.className = nativeJoin?.className || 'join';
    loginButton.textContent = loginButton.dataset.graspRatLoginPending === 'true' ? '登录中' : '立即登录';
    loginButton.title = loginGateBlock
      ? '手动登录优先：' + loginGateBlock.displayReason + '，仍将立即登录/加入游戏'
      : (reloginHold > 0 ? '跳过重连等待并立即登录/加入游戏' : '通过脚本立即登录/加入游戏');
    loginButton.disabled = loginButton.dataset.graspRatLoginPending === 'true';
    loginButton.onclick = event => {
      event.preventDefault();
      event.stopPropagation();
      const currentBlock = bootstrapLoginPointSafetyBlock(getBotStatus());
      if (currentBlock) {
        rememberLoginGateBlock({ ...currentBlock, manualBypassed: true }, 'sidebar immediate login bypass');
      }
      if (loginButton.dataset.graspRatLoginPending === 'true') return;
      loginButton.dataset.graspRatLoginPending = 'true';
      loginButton.disabled = true;
      loginButton.textContent = '登录中';
      markManualLoginBypass('sidebar immediate login');
      forceLoginNow('sidebar immediate login')
        .catch(err => noteBootstrapError('sidebar force login failed', err))
        .finally(() => {
          const current = document.getElementById(INLINE_LOGIN_BUTTON_ID);
          if (current) {
            current.dataset.graspRatLoginPending = 'false';
            current.disabled = false;
          }
          updateBootstrapPanel(true);
        });
    };
  }

  function placeBootstrapPanel(panel) {
    const side = syncNativeSidebarStructure();
    if (!side) {
      if (panel.parentElement !== document.body) document.body.appendChild(panel);
      panel.dataset.graspRatEmbedded = 'false';
      return false;
    }
    const bottomDock = nativeSidebarBlock(side, el => el.classList?.contains('bottom-dock'));
    const logWrap = bottomDock?.querySelector?.('.log-wrap') || null;
    if (bottomDock && logWrap) {
      if (panel.parentElement !== bottomDock || panel.nextSibling !== logWrap) {
        bottomDock.insertBefore(panel, logWrap);
        scheduleNativeViewportResize('panel-insert');
      }
    } else if (bottomDock) {
      if (panel.parentElement !== side || panel.nextSibling !== bottomDock) {
        side.insertBefore(panel, bottomDock);
        scheduleNativeViewportResize('panel-insert');
      }
    } else {
      const entityBlock = nativeSidebarBlock(side, el => el.querySelector?.('#userId,#leaveBtn,#joinBtn'));
      if (entityBlock?.nextSibling) {
        if (panel.parentElement !== side || panel.previousSibling !== entityBlock) {
          side.insertBefore(panel, entityBlock.nextSibling);
          scheduleNativeViewportResize('panel-insert');
        }
      } else if (panel.parentElement !== side) {
        side.appendChild(panel);
        scheduleNativeViewportResize('panel-insert');
      }
    }
    panel.dataset.graspRatEmbedded = 'true';
    return true;
  }

  function bootstrapPanelShellStyle(error = false, embedded = false) {
    if (embedded) {
      return [
        'position:static',
        'z-index:auto',
        'width:100%',
        'max-width:none',
        'max-height:none',
        'box-sizing:border-box',
        'padding:0',
        'border-top:1px solid ' + (error ? 'rgba(251,113,133,.48)' : 'rgba(148,163,184,.20)'),
        'border-right:0',
        'border-bottom:1px solid rgba(148,163,184,.20)',
        'border-left:0',
        'border-radius:0',
        'background:transparent',
        'color:#e5edf7',
        'font:12px/1.35 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono",monospace',
        'box-shadow:none',
        'pointer-events:auto',
        'white-space:normal',
        'overflow:visible'
      ].join(';');
    }
    return [
      'position:fixed',
      'right:16px',
      'top:16px',
      'z-index:2147483647',
      'width:min(336px,calc(100vw - 32px))',
      'max-width:336px',
      'max-height:calc(100vh - 32px)',
      'box-sizing:border-box',
      'padding:0',
      'border:1px solid ' + (error ? 'rgba(251,113,133,.48)' : 'rgba(148,163,184,.20)'),
      'border-radius:16px',
      'background:rgba(15,23,42,.84)',
      'color:#e5edf7',
      'font:13px/1.45 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono",monospace',
      'box-shadow:0 18px 48px rgba(0,0,0,.34)',
      'backdrop-filter:blur(14px)',
      '-webkit-backdrop-filter:blur(14px)',
      'pointer-events:auto',
      'white-space:normal',
      'overflow:auto'
    ].join(';');
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
    const embedded = placeBootstrapPanel(panel);
    panel.style.cssText = bootstrapPanelShellStyle(false, embedded);
    return panel;
  }

  function renderBootstrapPanelError(message) {
    try {
      if (!isGamePage() || !document.body) return;
      let panel = document.getElementById(PANEL_ID);
      if (!panel) {
        panel = document.createElement('div');
        panel.id = PANEL_ID;
        document.body.appendChild(panel);
      }
      const embedded = placeBootstrapPanel(panel);
      panel.style.cssText = bootstrapPanelShellStyle(true, embedded) + ';padding:12px 16px;color:#fee2e2';
      panel.textContent = `BOT 面板错误：${message || state.lastError || 'unknown error'}`;
    } catch (_) {}
  }

  function chasePanelVisible() {
    try {
      return localStorage.getItem(CHASE_PANEL_VISIBLE_KEY) === 'true';
    } catch (_) {
      return false;
    }
  }

  function setChasePanelVisible(next) {
    try {
      localStorage.setItem(CHASE_PANEL_VISIBLE_KEY, next ? 'true' : 'false');
    } catch (_) {}
  }

  function removeChasePanel() {
    try {
      document.getElementById(CHASE_PANEL_ID)?.remove();
    } catch (_) {}
  }

  function chaseStatusFrom(status) {
    return status?.chaseMode && typeof status.chaseMode === 'object' ? status.chaseMode : null;
  }

  function createChaseToggleButton(status) {
    const chase = chaseStatusFrom(status);
    const active = Math.max(0, Number(chase?.activeCount || 0) || 0);
    const visible = chasePanelVisible();
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = active > 0 ? '追杀 ' + active : '追杀';
    button.title = chase ? '显示/隐藏追杀目标面板' : '等待远程脚本加载追杀模式';
    button.setAttribute('aria-pressed', String(visible));
    const accent = active > 0
      ? 'rgba(251,191,36,.58)'
      : (visible ? 'rgba(96,165,250,.62)' : 'rgba(148,163,184,.24)');
    const color = active > 0 ? '#fbbf24' : (visible ? '#bfdbfe' : '#cbd5e1');
    button.style.cssText = [
      'flex:0 0 auto',
      'height:24px',
      'box-sizing:border-box',
      'padding:0 9px',
      'border:1px solid ' + accent,
      'border-radius:999px',
      'background:' + (active > 0 ? 'rgba(120,53,15,.34)' : 'rgba(15,23,42,.54)'),
      'color:' + color,
      'box-shadow:' + (visible ? '0 0 14px rgba(96,165,250,.22),inset 0 1px 0 rgba(255,255,255,.04)' : 'inset 0 1px 0 rgba(255,255,255,.04)'),
      'font:800 10.5px/1 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono",monospace',
      'letter-spacing:0',
      'cursor:pointer',
      'white-space:nowrap'
    ].join(';');
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      setChasePanelVisible(!chasePanelVisible());
      updateBootstrapPanel(true);
    });
    return button;
  }

  function chaseCandidateLabel(candidate) {
    const name = String(candidate?.name || '').trim();
    return name || ('#' + String(candidate?.id ?? candidate?.user_id ?? '-'));
  }

  function chaseCandidateStatusText(candidate) {
    if (!candidate) return '';
    if (candidate.status) return String(candidate.status);
    if (candidate.attackableNow) return '射程内';
    if (candidate.visible) return '视野';
    if (candidate.minimapOnly) return 'minimap';
    if (candidate.snapshot) return '快照';
    if (candidate.stale) return '未刷新';
    return candidate.source || '';
  }

  function callChaseApi(method, ...args) {
    try {
      const bot = unsafeWindow.__graspRatBot || null;
      if (!bot || typeof bot[method] !== 'function') return null;
      return bot[method](...args);
    } catch (err) {
      noteBootstrapError('chase api failed', err);
      return null;
    }
  }

  function positionChasePanel(panel, anchor) {
    const width = 336;
    const gap = 8;
    const rect = anchor?.getBoundingClientRect?.();
    const top = rect ? Math.max(8, Math.min(rect.top, window.innerHeight - 120)) : 16;
    let left = rect ? rect.right + gap : window.innerWidth - width - 16;
    if (left + width + 8 > window.innerWidth) left = Math.max(8, window.innerWidth - width - 8);
    panel.style.cssText = [
      'position:fixed',
      'left:' + Math.round(left) + 'px',
      'top:' + Math.round(top) + 'px',
      'z-index:2147483647',
      'width:min(336px,calc(100vw - 16px))',
      'max-height:calc(100vh - ' + Math.round(top + 8) + 'px)',
      'box-sizing:border-box',
      'border:1px solid rgba(148,163,184,.22)',
      'border-radius:8px',
      'background:rgba(15,23,42,.88)',
      'color:#e5edf7',
      'font:12px/1.35 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono",monospace',
      'box-shadow:0 18px 48px rgba(0,0,0,.34)',
      'backdrop-filter:blur(14px)',
      '-webkit-backdrop-filter:blur(14px)',
      'overflow:auto',
      'pointer-events:auto'
    ].join(';');
  }

  function renderChasePanel(status, anchorPanel) {
    if (!isGamePage() || !document.body || !chasePanelVisible()) {
      removeChasePanel();
      return;
    }
    let panel = document.getElementById(CHASE_PANEL_ID);
    if (!panel) {
      panel = document.createElement('div');
      panel.id = CHASE_PANEL_ID;
      document.body.appendChild(panel);
    }
    positionChasePanel(panel, anchorPanel);
    while (panel.firstChild) panel.removeChild(panel.firstChild);
    const chase = chaseStatusFrom(status);
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;border-bottom:1px solid rgba(148,163,184,.18)';
    const title = document.createElement('div');
    title.textContent = '追杀目标';
    title.style.cssText = 'font-size:12px;font-weight:800;color:#e5edf7';
    const count = document.createElement('div');
    count.textContent = chase ? ((chase.candidateCount || 0) + ' / ' + (chase.activeCount || 0)) : '等待脚本';
    count.style.cssText = 'font-size:10.5px;color:#94a3b8;font-variant-numeric:tabular-nums';
    header.appendChild(title);
    header.appendChild(count);
    panel.appendChild(header);
    const list = document.createElement('div');
    list.style.cssText = 'display:grid;gap:0;padding:2px 0';
    panel.appendChild(list);
    if (!chase) {
      const wait = document.createElement('div');
      wait.textContent = '等待远程脚本加载';
      wait.style.cssText = 'padding:12px;color:#94a3b8;font-size:11.5px';
      list.appendChild(wait);
      return;
    }
    const rows = Array.isArray(chase.panelCandidates) ? chase.panelCandidates : [];
    if (!rows.length) {
      const empty = document.createElement('div');
      empty.textContent = '暂无 Drop >= ' + (chase.minDrop || 10) + ' 的候选目标';
      empty.style.cssText = 'padding:12px;color:#94a3b8;font-size:11.5px';
      list.appendChild(empty);
      return;
    }
    for (const candidate of rows) {
      const row = document.createElement('div');
      row.style.cssText = 'display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;padding:8px 10px;border-top:1px solid rgba(148,163,184,.10)';
      const info = document.createElement('div');
      info.style.cssText = 'min-width:0;display:grid;gap:3px';
      const name = document.createElement('div');
      name.textContent = chaseCandidateLabel(candidate);
      name.title = name.textContent;
      name.style.cssText = 'min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11.5px;font-weight:800;color:#e5edf7';
      const meta = document.createElement('div');
      meta.textContent = 'HP ' + (candidate.hp ?? '?')
        + '  Drop ' + (candidate.drop ?? '?')
        + '  ' + formatDistance(candidate.distance);
      meta.style.cssText = 'font-size:10.5px;color:#cbd5e1;font-variant-numeric:tabular-nums';
      const source = document.createElement('div');
      source.textContent = chaseCandidateStatusText(candidate);
      source.style.cssText = 'font-size:10px;color:' + (candidate.staminaBlocked ? '#fca5a5' : '#94a3b8');
      info.appendChild(name);
      info.appendChild(meta);
      info.appendChild(source);
      const controls = document.createElement('div');
      controls.style.cssText = 'display:flex;align-items:center;gap:5px';
      if (candidate.marked) {
        const tag = document.createElement('span');
        tag.textContent = '追杀中';
        tag.style.cssText = 'height:22px;display:inline-flex;align-items:center;padding:0 7px;border:1px solid rgba(251,191,36,.48);border-radius:999px;background:rgba(120,53,15,.28);color:#fbbf24;font-size:10px;font-weight:800;box-shadow:0 0 12px rgba(251,191,36,.18)';
        controls.appendChild(tag);
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.textContent = '取消';
        cancel.title = '取消追杀 ' + chaseCandidateLabel(candidate);
        cancel.style.cssText = 'height:22px;padding:0 7px;border:1px solid rgba(148,163,184,.24);border-radius:999px;background:rgba(15,23,42,.54);color:#cbd5e1;font:700 10px/1 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono",monospace;cursor:pointer';
        cancel.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          callChaseApi('clearChaseTarget', candidate.id, 'panel');
          updateBootstrapPanel(true);
        });
        controls.appendChild(cancel);
      } else {
        const action = document.createElement('button');
        action.type = 'button';
        const disabled = !status || candidate.whitelisted || Number(candidate.drop ?? 0) < Number(chase.minDrop || 10);
        action.textContent = candidate.whitelisted ? '白名单' : '追杀';
        action.disabled = disabled;
        action.title = disabled ? '不可追杀' : '标记追杀 ' + chaseCandidateLabel(candidate);
        action.style.cssText = 'height:22px;padding:0 8px;border:1px solid ' + (disabled ? 'rgba(148,163,184,.16)' : 'rgba(251,191,36,.42)') + ';border-radius:999px;background:' + (disabled ? 'rgba(15,23,42,.30)' : 'rgba(120,53,15,.30)') + ';color:' + (disabled ? '#64748b' : '#fbbf24') + ';font:800 10px/1 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono",monospace;cursor:' + (disabled ? 'not-allowed' : 'pointer');
        action.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          if (action.disabled) return;
          callChaseApi('setChaseTarget', candidate, { markedBy: 'panel' });
          updateBootstrapPanel(true);
        });
        controls.appendChild(action);
      }
      row.appendChild(info);
      row.appendChild(controls);
      list.appendChild(row);
    }
  }

  function configureCombatLogging(options = {}) {
    const next = options && typeof options === 'object' ? options : {};
    if (Object.prototype.hasOwnProperty.call(next, 'endpoint')) {
      cfg.combatLogEndpoint = String(next.endpoint || DEFAULTS.combatLogEndpoint);
      cfg.combatLogEndpointConfigured = true;
      GM_setValue('combatLogEndpoint', cfg.combatLogEndpoint);
      GM_setValue('combatLogEndpointConfigured', true);
    }
    if (Object.prototype.hasOwnProperty.call(next, 'enabled')) {
      cfg.combatLoggingEnabled = Boolean(next.enabled) && Boolean(cfg.combatLogEndpointConfigured);
      GM_setValue('combatLoggingEnabled', cfg.combatLoggingEnabled);
    }
    try {
      const bot = unsafeWindow.__graspRatBot;
      if (bot && typeof bot.configureCombatLogging === 'function') {
        bot.configureCombatLogging({
          enabled: Boolean(cfg.combatLoggingEnabled && cfg.combatLogEndpointConfigured),
          endpoint: cfg.combatLogEndpointConfigured ? cfg.combatLogEndpoint : '',
          endpointConfigured: Boolean(cfg.combatLogEndpointConfigured)
        });
      }
    } catch (_) {}
    updateBootstrapPanel(true);
    return {
      enabled: cfg.combatLoggingEnabled,
      endpoint: cfg.combatLogEndpoint,
      endpointConfigured: Boolean(cfg.combatLogEndpointConfigured),
      panelVisible: Boolean(cfg.combatLogEndpointConfigured)
    };
  }

  function configureClashLeaveRescue(options = {}) {
    const next = options && typeof options === 'object' ? options : {};
    if (Object.prototype.hasOwnProperty.call(next, 'enabled')) {
      cfg.clashLeaveRescueEnabled = Boolean(next.enabled);
      GM_setValue('clashLeaveRescueEnabled', cfg.clashLeaveRescueEnabled);
    }
    if (Object.prototype.hasOwnProperty.call(next, 'controllerUrl')) {
      cfg.clashControllerUrl = String(next.controllerUrl || DEFAULTS.clashControllerUrl);
      GM_setValue('clashControllerUrl', cfg.clashControllerUrl);
    }
    if (Object.prototype.hasOwnProperty.call(next, 'secret')) {
      GM_setValue(CLASH_SECRET_KEY, String(next.secret || ''));
    }
    if (Object.prototype.hasOwnProperty.call(next, 'group')) {
      cfg.clashGameProxyGroup = String(next.group || DEFAULTS.clashGameProxyGroup);
      GM_setValue('clashGameProxyGroup', cfg.clashGameProxyGroup);
    }
    if (Object.prototype.hasOwnProperty.call(next, 'autoProxy')) {
      cfg.clashAutoProxyName = String(next.autoProxy || DEFAULTS.clashAutoProxyName);
      GM_setValue('clashAutoProxyName', cfg.clashAutoProxyName);
    }
    if (Object.prototype.hasOwnProperty.call(next, 'manualProxy')) {
      cfg.clashManualProxyName = String(next.manualProxy || DEFAULTS.clashManualProxyName);
      GM_setValue('clashManualProxyName', cfg.clashManualProxyName);
    }
    if (Object.prototype.hasOwnProperty.call(next, 'directProxy')) {
      cfg.clashDirectProxyName = String(next.directProxy || DEFAULTS.clashDirectProxyName);
      GM_setValue('clashDirectProxyName', cfg.clashDirectProxyName);
    }
    if (Object.prototype.hasOwnProperty.call(next, 'timeoutMs')) {
      cfg.clashControllerTimeoutMs = Math.max(1000, Number(next.timeoutMs || DEFAULTS.clashControllerTimeoutMs) || DEFAULTS.clashControllerTimeoutMs);
      GM_setValue('clashControllerTimeoutMs', cfg.clashControllerTimeoutMs);
    }
    try {
      const bot = unsafeWindow.__graspRatBot;
      if (bot && typeof bot.configureClashLeaveRescue === 'function') {
        bot.configureClashLeaveRescue({
          enabled: Boolean(cfg.clashLeaveRescueEnabled),
          timeoutMs: cfg.clashControllerTimeoutMs
        });
      }
    } catch (_) {}
    updateBootstrapPanel(true);
    return {
      enabled: Boolean(cfg.clashLeaveRescueEnabled),
      controllerUrl: cfg.clashControllerUrl,
      group: cfg.clashGameProxyGroup,
      autoProxy: cfg.clashAutoProxyName,
      manualProxy: cfg.clashManualProxyName,
      directProxy: cfg.clashDirectProxyName,
      timeoutMs: cfg.clashControllerTimeoutMs
    };
  }

  function normalizeClashControllerUrl(value) {
    const url = String(value || DEFAULTS.clashControllerUrl).trim().replace(/\/+$/, '');
    if (!/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$)/i.test(url)) {
      throw new Error('Clash controller URL must be localhost');
    }
    return url || DEFAULTS.clashControllerUrl;
  }

  function clashRescueStageTarget(stage) {
    const normalized = String(stage || '').toLowerCase();
    if (normalized === 'auto') return cfg.clashAutoProxyName;
    if (normalized === 'manual') return cfg.clashManualProxyName;
    if (normalized === 'direct') return cfg.clashDirectProxyName;
    throw new Error(`unknown Clash rescue stage: ${stage}`);
  }

  function clashControllerRequest(method, path, body = null, headers = {}) {
    const secret = String(GM_getValue(CLASH_SECRET_KEY, '') || '');
    if (!secret) return Promise.reject(new Error('Clash controller secret is missing'));
    const baseUrl = normalizeClashControllerUrl(cfg.clashControllerUrl);
    const timeoutMs = Math.max(1000, Number(cfg.clashControllerTimeoutMs || DEFAULTS.clashControllerTimeoutMs) || DEFAULTS.clashControllerTimeoutMs);
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method,
        url: `${baseUrl}${path}`,
        data: body,
        headers: {
          Authorization: `Bearer ${secret}`,
          ...headers
        },
        timeout: timeoutMs,
        onload: res => {
          if (res.status >= 200 && res.status < 300) {
            resolve({ ok: true, status: res.status, bodyLength: String(res.responseText || '').length });
          } else {
            reject(new Error(`${method} ${path} failed: ${res.status}`));
          }
        },
        ontimeout: () => reject(new Error(`${method} ${path} timed out`)),
        onerror: err => reject(new Error(`${method} ${path} error: ${err?.error || err?.message || 'unknown'}`))
      });
    });
  }

  async function clashLeaveRescue(payload = {}) {
    if (!cfg.clashLeaveRescueEnabled) throw new Error('Clash leave rescue is not enabled');
    const stage = String(payload?.stage || '');
    const target = clashRescueStageTarget(stage);
    const group = String(cfg.clashGameProxyGroup || DEFAULTS.clashGameProxyGroup);
    const startedAt = Date.now();
    const switchResult = await clashControllerRequest(
      'PUT',
      `/proxies/${encodeURIComponent(group)}`,
      JSON.stringify({ name: target }),
      { 'content-type': 'application/json' }
    );
    let closeConnections = null;
    try {
      closeConnections = await clashControllerRequest('DELETE', '/connections');
    } catch (err) {
      closeConnections = { ok: false, error: err?.message || String(err) };
    }
    return {
      ok: true,
      stage,
      target,
      group,
      switched: switchResult,
      closeConnections,
      at: startedAt,
      durationMs: Math.max(0, Date.now() - startedAt)
    };
  }

  function renderBootstrapPanel(force = false) {
    if (!isGamePage()) return;
    const t = Date.now();
    if (!force && t - Number(state.lastPanelUpdateAt || 0) < cfg.panelUpdateMs) return;
    state.lastPanelUpdateAt = t;
    const panel = ensureBootstrapPanel();
    if (!panel) return;
    const paused = isPaused();
    const status = getBotStatus();
    syncEntityControlLogin(status);
    const decision = status?.lastDecision || null;
    const reasonDetail = state.cloudflareError?.displayReason || panelReasonDetail(decision, status) || '';
    const todaySession = status?.todaySession || {};
    const self = status?.self || decision?.self || status?.lastSelf || lastDailyStaminaSelf(status) || null;
    const safety = status?.safety || {};
    const control = status?.control || {};
    const manifest = readCachedManifest();
    const bVersion = status?.version || manifest?.version || state.lastManifestVersion || '-';
    const aVersion = BOOTSTRAP_VERSION;
    const wsLabel = control.wsOpen ? 'online' : (control.connecting ? 'connecting' : 'offline');
    const wsColor = control.wsOpen ? '#86efac' : (control.connecting ? '#fde68a' : '#fca5a5');
    const wsTitle = 'WS ' + wsLabel;
    const networkQuality = status?.networkQuality || {};
    const nearestActive = safety.nearestActive
      ? (safety.nearestActive.name || ('#' + safety.nearestActive.id)) + ' ' + formatDistance(safety.nearestActive.distance)
      : '-';
    const session = status?.session || {};
    const combatLogStatus = status?.combatLogging || {};
    const remoteLogVisible = Boolean(cfg.combatLogEndpointConfigured);
    const remoteLogEnabled = remoteLogVisible && Boolean(cfg.combatLoggingEnabled || combatLogStatus.enabled);
    const remoteLogSent = Number(combatLogStatus.sessionSent ?? session.combatLogSent ?? combatLogStatus.sent ?? 0) || 0;
    const remoteLogPending = Number(combatLogStatus.pending ?? 0) || 0;
    const remoteLogFailed = Number(combatLogStatus.sessionFailed ?? session.combatLogFailed ?? combatLogStatus.failed ?? 0) || 0;
    const remoteLogHasFailure = remoteLogFailed > 0;
    const remoteLogColor = remoteLogHasFailure ? '#fca5a5' : (remoteLogEnabled ? '#86efac' : '#fde68a');
    const remoteLogHalo = remoteLogHasFailure ? 'rgba(251,113,133,.13)' : (remoteLogEnabled ? 'rgba(52,211,153,.13)' : 'rgba(251,191,36,.14)');
    const remoteLogGlow = remoteLogHasFailure ? 'rgba(251,113,133,.45)' : (remoteLogEnabled ? 'rgba(52,211,153,.45)' : 'rgba(251,191,36,.45)');
    const remoteLogTitle = '远程日志 ' + (remoteLogEnabled ? '开启' : '关闭')
      + '，已发 ' + formatNumber(remoteLogSent, '0')
      + '，待发 ' + formatNumber(remoteLogPending, '0')
      + '，失败 ' + formatNumber(remoteLogFailed, '0')
      + (combatLogStatus.lastError ? '，最近错误 ' + String(combatLogStatus.lastError) : '');
    const persistent = activePersistentExitDetail(status);
    const reloginHold = status?.enemyLeave?.holdRemainingMs || status?.pursuitLeave?.holdRemainingMs || status?.offlineLeave?.holdRemainingMs || persistent?.holdRemainingMs || 0;
    const statusText = paused ? '暂停' : (status?.running ? '运行' : '未运行');
    const statusTitle = 'BOT ' + statusText + (paused && state.pauseReason ? '：' + state.pauseReason : '');
    const statusColor = paused ? '#fca5a5' : (status?.running ? '#86efac' : '#fde68a');
    const statusHalo = paused ? 'rgba(251,113,133,.13)' : (status?.running ? 'rgba(52,211,153,.13)' : 'rgba(251,191,36,.14)');
    const statusGlow = paused ? 'rgba(251,113,133,.45)' : (status?.running ? 'rgba(52,211,153,.45)' : 'rgba(251,191,36,.45)');
    while (panel.firstChild) panel.removeChild(panel.firstChild);
    let appendParent = panel;
    const appendLine = (text, style = '') => {
      const line = document.createElement('div');
      const baseStyle = 'min-width:0;overflow-wrap:anywhere;font-size:11.5px;line-height:1.34;color:#e5edf7';
      line.style.cssText = style ? baseStyle + ';' + style : baseStyle;
      line.textContent = String(text ?? '');
      appendParent.appendChild(line);
      return line;
    };
    const appendRichLine = (parts, style = '') => {
      const line = document.createElement('div');
      const baseStyle = 'min-width:0;overflow-wrap:anywhere;font-size:11.5px;line-height:1.34;color:#e5edf7';
      line.style.cssText = style ? baseStyle + ';' + style : baseStyle;
      for (const part of parts) {
        if (part && typeof part === 'object') {
          const span = document.createElement('span');
          span.textContent = String(part.text ?? '');
          if (part.style) span.style.cssText = part.style;
          line.appendChild(span);
        } else {
          line.appendChild(document.createTextNode(String(part ?? '')));
        }
      }
      appendParent.appendChild(line);
      return line;
    };
    const appendStaminaLine = () => {
      const stamina = self?.stamina || {};
      const exhausted = Array.isArray(stamina.exhausted) && stamina.exhausted.length > 0;
      const line = document.createElement('div');
      line.style.cssText = 'min-width:0;display:flex;align-items:center;gap:7px;flex-wrap:nowrap;overflow:hidden;font-size:11.5px;line-height:1.3;color:#e5edf7';
      const hpLabel = document.createElement('span');
      const hpValue = Number(self?.hp);
      hpLabel.textContent = 'HP ' + (self?.hp ?? '-');
      hpLabel.style.cssText = 'color:' + hpValueColor(hpValue) + ';font-weight:700';
      const dropLabel = document.createElement('span');
      dropLabel.textContent = 'Drop ' + (self?.drop ?? '-');
      dropLabel.style.cssText = 'color:#fbbf24;font-weight:700';
      const activeLabel = document.createElement('span');
      activeLabel.textContent = 'Active ' + nearestActive;
      activeLabel.title = activeLabel.textContent;
      activeLabel.style.cssText = 'color:' + (nearestActive === '-' ? '#64748b' : '#93c5fd') + ';font-weight:700;flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
      line.appendChild(hpLabel);
      line.appendChild(dropLabel);
      line.appendChild(activeLabel);
      appendParent.appendChild(line);
      const staminaLine = document.createElement('div');
      staminaLine.style.cssText = 'min-width:0;display:flex;align-items:center;font-size:11.5px;line-height:1.3;color:#e5edf7';
      const staminaPill = document.createElement('span');
      staminaPill.className = 'pill compact' + (exhausted ? ' exhausted' : '');
      staminaPill.textContent = '体力: ' + formatStamina(self);
      staminaPill.title = '体力，单位秒：5s / 1h / 1d';
      staminaPill.style.cssText = [
        'display:inline-flex',
        'align-items:center',
        'max-width:100%',
        'min-height:20px',
        'box-sizing:border-box',
        'padding:1px 7px',
        'border:1px solid ' + (exhausted ? 'rgba(251,113,133,.42)' : 'rgba(148,163,184,.24)'),
        'border-radius:999px',
        'background:' + (exhausted ? 'rgba(127,29,29,.28)' : 'rgba(15,23,42,.54)'),
        'color:' + (exhausted ? '#fecdd3' : '#cbd5e1'),
        'font-size:10.5px',
        'line-height:1.25',
        'font-variant-numeric:tabular-nums',
        'overflow-wrap:anywhere'
      ].join(';');
      staminaLine.appendChild(staminaPill);
      appendParent.appendChild(staminaLine);
      return line;
    };
    const appendMetricGrid = metrics => {
      const grid = document.createElement('div');
      const columns = Math.min(4, Math.max(1, metrics.length));
      grid.style.cssText = 'display:grid;grid-template-columns:repeat(' + columns + ',minmax(0,1fr));gap:4px;margin:0';
      for (const metric of metrics) {
        const item = document.createElement('div');
        item.title = String(metric.label ?? '');
        item.setAttribute('aria-label', String(metric.label ?? ''));
        item.style.cssText = 'min-height:30px;border:1px solid rgba(148,163,184,.18);border-radius:8px;background:rgba(15,23,42,.42);padding:5px 6px;box-shadow:inset 0 1px 0 rgba(255,255,255,.03);overflow:hidden;display:flex;align-items:center;justify-content:center';
        const value = document.createElement('b');
        value.textContent = String(metric.value ?? '-');
        value.title = String(metric.label ?? '');
        value.style.cssText = 'display:block;font-size:13px;line-height:1.05;font-weight:800;color:' + (metric.color || '#e0f2fe') + ';font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;letter-spacing:0';
        item.appendChild(value);
        grid.appendChild(item);
      }
      appendParent.appendChild(grid);
      return grid;
    };
    const appendClockNetworkLine = () => {
      const line = document.createElement('div');
      line.style.cssText = 'min-width:0;display:flex;align-items:center;gap:7px;flex-wrap:nowrap;font-size:10.5px;line-height:1.34;margin:2px 0 0;color:#94a3b8;font-variant-numeric:tabular-nums;overflow:hidden';
      const time = document.createElement('span');
      time.textContent = '当前时间：' + formatClockTime();
      time.style.cssText = 'flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#94a3b8';
      line.appendChild(time);
      appendParent.appendChild(line);
      return line;
    };
    const appendSection = titleText => {
      const section = document.createElement('div');
      const first = !panel.firstChild;
      section.style.cssText = first
        ? 'padding:10px 16px 9px;display:grid;gap:6px'
        : 'padding:9px 16px;border-top:1px solid rgba(148,163,184,.18);display:grid;gap:6px';
      if (titleText) {
        const titleLine = document.createElement('div');
        titleLine.textContent = titleText;
        titleLine.style.cssText = 'margin:0;color:#cbd5e1;font-size:10px;font-weight:700;letter-spacing:0';
        section.appendChild(titleLine);
      }
      panel.appendChild(section);
      appendParent = section;
      return section;
    };
    const createDot = (title, color, halo, glow, options = {}) => {
      const onClick = typeof options.onClick === 'function' ? options.onClick : null;
      const label = String(options.label || '');
      const control = document.createElement(onClick ? 'button' : 'span');
      if (onClick) control.type = 'button';
      control.title = title;
      control.setAttribute('aria-label', title);
      control.style.cssText = [
        'position:relative',
        'flex:0 0 auto',
        'width:auto',
        'min-width:' + (options.minWidth || '0'),
        'height:24px',
        'box-sizing:border-box',
        'padding:' + (label ? '0 8px' : '0'),
        'border:1px solid rgba(148,163,184,.24)',
        'border-radius:' + (label ? '999px' : '50%'),
        'background:rgba(15,23,42,.50)',
        'cursor:' + (onClick ? 'pointer' : 'default'),
        'box-shadow:inset 0 1px 0 rgba(255,255,255,.04)',
        'display:inline-flex',
        'align-items:center',
        'gap:6px',
        'font:700 10.5px/1 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono",monospace',
        'color:#e5edf7',
        'letter-spacing:0'
      ].join(';');
      if (label) {
        const labelNode = document.createElement('span');
        labelNode.textContent = label;
        labelNode.style.cssText = 'display:inline-block;white-space:nowrap';
        control.appendChild(labelNode);
      }
      const dot = document.createElement('span');
      dot.setAttribute('aria-hidden', 'true');
      dot.style.cssText = (label ? 'display:inline-block;flex:0 0 auto;' : 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);')
        + 'width:9px;height:9px;border-radius:50%;background:' + color
        + ';box-shadow:0 0 0 4px ' + halo + ',0 0 18px ' + glow
        + (options.pending ? ';animation:' + (label ? 'grasp-rat-dot-pending-inline' : 'grasp-rat-dot-pending') + ' .9s ease-in-out infinite' : '');
      control.appendChild(dot);
      if (onClick) {
        control.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          onClick();
        }, { once: true });
      }
      return control;
    };
    const createNetworkQualityPill = () => {
      const pill = document.createElement('span');
      pill.title = networkQualitySummaryTitle(networkQuality);
      pill.setAttribute('aria-label', networkQualitySummaryTitle(networkQuality));
      pill.style.cssText = [
        'flex:0 0 auto',
        'width:auto',
        'min-width:0',
        'height:24px',
        'box-sizing:border-box',
        'padding:0 8px',
        'border:1px solid rgba(148,163,184,.24)',
        'border-radius:999px',
        'background:rgba(15,23,42,.50)',
        'box-shadow:inset 0 1px 0 rgba(255,255,255,.04)',
        'display:inline-flex',
        'align-items:center',
        'gap:0',
        'font:700 10.5px/1 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono",monospace',
        'font-variant-numeric:tabular-nums',
        'letter-spacing:0',
        'white-space:nowrap'
      ].join(';');
      const latency = document.createElement('span');
      latency.textContent = networkQualityLatencyText(networkQuality);
      latency.style.cssText = 'color:' + networkQualityLatencyColor(networkQuality);
      const slash = document.createElement('span');
      slash.textContent = '/';
      slash.style.cssText = 'color:#fff';
      const loss = document.createElement('span');
      loss.textContent = networkQualityLossText(networkQuality);
      loss.style.cssText = 'color:' + networkQualityLossColor(networkQuality);
      pill.appendChild(latency);
      pill.appendChild(slash);
      pill.appendChild(loss);
      return pill;
    };
    const createRepositoryLink = () => {
      const link = document.createElement('a');
      link.href = REPOSITORY_URL;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.title = 'GitHub: ZeroJehovah/grasp-rat-bot';
      link.setAttribute('aria-label', 'Open Grasp Rat Bot GitHub repository');
      link.style.cssText = [
        'display:inline-flex',
        'align-items:center',
        'justify-content:center',
        'flex:0 0 auto',
        'width:24px',
        'height:24px',
        'box-sizing:border-box',
        'border:1px solid rgba(148,163,184,.24)',
        'border-radius:50%',
        'background:rgba(15,23,42,.50)',
        'color:#e5edf7',
        'text-decoration:none',
        'box-shadow:inset 0 1px 0 rgba(255,255,255,.04)',
        'cursor:pointer'
      ].join(';');
      link.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24" width="15" height="15" fill="currentColor" focusable="false"><path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.5-1.4-1.3-1.8-1.3-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.4 11.4 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3Z"/></svg>';
      link.addEventListener('click', event => {
        event.stopPropagation();
      });
      return link;
    };
    appendSection();
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:0;min-width:0;overflow:hidden';
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;align-items:center;gap:5px;row-gap:5px;flex:1 1 auto;min-width:0;overflow:visible;flex-wrap:wrap';
    const statusDot = createDot(statusTitle, statusColor, statusHalo, statusGlow, {
      label: 'BOT',
      onClick: () => setPaused(!isPaused(), 'panel bot dot')
    });
    statusDot.setAttribute('aria-pressed', String(paused));
    actions.appendChild(statusDot);
    actions.appendChild(createDot(wsTitle, wsColor, control.wsOpen ? 'rgba(52,211,153,.13)' : (control.connecting ? 'rgba(251,191,36,.14)' : 'rgba(251,113,133,.13)'), control.wsOpen ? 'rgba(52,211,153,.45)' : (control.connecting ? 'rgba(251,191,36,.45)' : 'rgba(251,113,133,.45)'), {
      label: 'WS'
    }));
    if (remoteLogVisible) {
      const logDot = createDot(remoteLogTitle, remoteLogColor, remoteLogHalo, remoteLogGlow, {
        label: 'Log',
        pending: remoteLogPending > 0 && !remoteLogHasFailure,
        onClick: () => configureCombatLogging({ enabled: !remoteLogEnabled })
      });
      logDot.setAttribute('aria-pressed', String(remoteLogEnabled));
      actions.appendChild(logDot);
    }
    actions.appendChild(createNetworkQualityPill());
    header.appendChild(actions);
    header.appendChild(createRepositoryLink());
    appendParent.appendChild(header);
    if (state.userscriptUpdateAvailable) {
      appendLine(
        '加载器A（篡改猴）有新版本：当前 ' + aVersion + ' / 最新 ' + (state.latestUserscriptVersion || '-') + '，请手动更新',
        'margin:0 0 8px;padding:7px 9px;border:1px solid rgba(251,113,133,.42);border-radius:8px;background:rgba(127,29,29,.28);color:#fecdd3;font-weight:700'
      );
    }
    appendRichLine([
      { text: '加载器 ', style: 'color:#94a3b8' },
      { text: '篡改猴 ', style: 'color:#bfdbfe;font-weight:700' },
      { text: displayVersion(aVersion), style: 'color:' + (state.userscriptUpdateAvailable ? '#fca5a5' : '#86efac') + ';font-weight:700' },
      { text: ' / ', style: 'color:#475569' },
      { text: '远程脚本 ', style: 'color:#94a3b8' },
      { text: displayVersion(bVersion), style: 'color:#86efac;font-weight:700' }
    ], 'font-size:10.5px;margin:4px 0 0;color:#94a3b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis');
    appendClockNetworkLine();
    appendSection();
    const hold = reloginHold;
    const behaviorRow = document.createElement('div');
    behaviorRow.style.cssText = 'min-width:0;display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:11.5px;line-height:1.34;color:#e5edf7';
    const behaviorLabel = document.createElement('div');
    behaviorLabel.textContent = '当前行为：' + behaviorText(decision, status) + (hold > 0 ? '，等待重连：' + formatDuration(hold) : '');
    behaviorLabel.style.cssText = 'min-width:0;flex:1 1 auto;overflow-wrap:anywhere';
    behaviorRow.appendChild(behaviorLabel);
    behaviorRow.appendChild(createChaseToggleButton(status));
    appendParent.appendChild(behaviorRow);
    appendRichLine([
      { text: '当前目标：', style: 'color:#94a3b8' },
      ...targetSummaryParts(decision, status)
    ]);
    if (reasonDetail) {
      appendRichLine([
        { text: '原因：', style: 'color:#64748b' },
        { text: reasonDetail, style: 'color:#94a3b8' }
      ], 'font-size:11px;color:#94a3b8');
    }
    if (reloginGateVisible(status, hold)) {
      for (const row of reloginGatePanelRows(status)) {
        appendLine(row.text, 'font-size:10.8px;color:' + reloginGateLineColor(row.ok, row.blocked) + ';font-variant-numeric:tabular-nums');
        if (appendParent.lastChild && row.title) appendParent.lastChild.title = row.title;
      }
    }
    if (isCombatDecision(decision, status)) {
      const hp = combatHpSummary(decision, status, self);
      appendCombatHpPanel(panel, hp);
      if (decision?.combat) {
        appendSection();
        appendLine('战斗细节：瞄准 ' + (decision?.aimTarget?.mode || '-') + ' / 来弹 ' + (decision?.incomingBullet ? formatDistance(decision.incomingBullet.laneDistance) : '-'));
      }
    }
    appendSection();
    if (state.cloudflareError) {
      appendLine('错误页：' + state.cloudflareError.label);
    } else if (status?.running) {
      const coinsGained = Number(session.coinsGained || 0) || 0;
      const kills = Number(session.kills || 0) || 0;
      const staminaSpent = sessionStaminaSpentMs(session, self);
      const sessionUptimeMs = Number(session.uptimeMs ?? status.uptimeMs ?? 0) || 0;
      const todayUptimeMs = Number(todaySession.uptimeMs ?? sessionUptimeMs) || 0;
      const todayStaminaSpent = Number(todaySession.stamina1dSpentMs ?? staminaSpent ?? 0) || 0;
      const todayCoinsGained = Number(todaySession.coinsGained ?? coinsGained) || 0;
      const todayKills = Number(todaySession.kills ?? kills) || 0;
      appendMetricGrid([
        { label: '今日统计：登录时间', value: formatDuration(todayUptimeMs), color: '#e0f2fe' },
        { label: '今日统计：消耗体力', value: formatStaminaSpentMs(todayStaminaSpent), color: todayStaminaSpent > 0 ? '#fde68a' : '#e0f2fe' },
        { label: '今日统计：金币收益', value: formatNumber(todayCoinsGained, '0'), color: todayCoinsGained > 0 ? '#a7f3d0' : '#e0f2fe' },
        { label: '今日统计：击杀次数', value: formatNumber(todayKills, '0'), color: todayKills > 0 ? '#fde68a' : '#e0f2fe' },
        { label: '本次登录统计：登录时间', value: formatDuration(sessionUptimeMs), color: '#e0f2fe' },
        { label: '本次登录统计：消耗体力', value: formatStaminaSpentMs(staminaSpent), color: Number(staminaSpent || 0) > 0 ? '#fde68a' : '#e0f2fe' },
        { label: '本次登录统计：金币收益', value: formatNumber(coinsGained, '0'), color: coinsGained > 0 ? '#a7f3d0' : '#e0f2fe' },
        { label: '本次登录统计：击杀次数', value: formatNumber(kills, '0'), color: kills > 0 ? '#fde68a' : '#e0f2fe' }
      ]);
      appendStaminaLine();
      if (control.nativeReconnectChurn || Number(control.nativeReconnectEventCount || 0) > 0) {
        appendLine('重连：' + formatNumber(control.nativeReconnectEventCount, '0') + ' / ' + formatDuration(control.nativeReconnectWindowMs || 0), control.nativeReconnectChurn ? 'color:#fca5a5;font-weight:700' : 'color:#cbd5e1');
      }
      if (decision?.opportunisticShot) {
        const shot = decision.opportunisticShot;
        appendLine('顺手射击：' + (shot.name || ('#' + (shot.id ?? '-'))) + ' 距离 ' + formatDistance(shot.distance) + ' Drop ' + (shot.drop ?? '-'));
      }
      const pursuit = decision?.pursuit || safety.pursuit || status?.pursuit;
      if (pursuit) {
        appendLine('追击：' + (pursuit.name || ('#' + pursuit.id)) + ' ' + formatDistance(pursuit.distance) + ' / ' + Math.round((pursuit.durationMs || 0) / 1000) + 's');
      }
      if (Array.isArray(status.errors) && status.errors.length) {
        appendLine('BOT错误：' + (status.errors[status.errors.length - 1]?.message || ''), 'color:#fca5a5');
      }
    }
    renderChasePanel(status, panel);
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
    if (/userscript|tampermonkey|bootstrap/i.test(label)) {
      state.lastUserscriptVersionStatus = value;
    } else if (/manifest/i.test(label)) {
      state.lastManifestStatus = value;
    } else if (/script|bot/i.test(label)) {
      state.lastScriptStatus = value;
    }
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

  function userscriptVersionUrls() {
    return uniqueUrls([
      cfg.userscriptUpdateUrl,
      rawGithubToJsDelivr(cfg.userscriptUpdateUrl)
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

  async function fetchRequest(fetchFn, transport, method, url, body = null, headers = {}) {
    if (typeof fetchFn !== 'function') throw new Error(`${transport} unavailable`);
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    let timer = 0;
    if (controller) {
      timer = setTimeout(() => controller.abort(), cfg.requestTimeoutMs);
    }
    try {
      const fetchOptions = {
        method,
        headers,
        cache: 'no-store',
        credentials: 'omit',
        mode: 'cors',
        redirect: 'follow',
        signal: controller?.signal
      };
      if (body !== null && body !== undefined) fetchOptions.body = body;
      const res = await fetchFn(url, fetchOptions);
      const text = await res.text();
      if (res.status >= 200 && res.status < 300) return text;
      throw new Error(`${method} ${url} failed: ${res.status}`);
    } catch (err) {
      const message = err?.name === 'AbortError'
        ? `${method} ${url} timed out`
        : (err?.message || String(err));
      throw new Error(`${transport} ${message}`);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function requestText(method, url, body = null, headers = {}) {
    const attempts = [];
    const pageFetch = typeof unsafeWindow !== 'undefined' && typeof unsafeWindow.fetch === 'function' ? unsafeWindow.fetch.bind(unsafeWindow) : null;
    const sandboxFetch = typeof fetch === 'function' ? fetch.bind(globalThis) : null;
    if (typeof GM_xmlhttpRequest === 'function') {
      attempts.push({
        transport: 'GM_xmlhttpRequest',
        run: () => gmRequest(method, url, body, headers)
      });
    }
    if (pageFetch) {
      attempts.push({
        transport: 'page-fetch',
        run: () => fetchRequest(pageFetch, 'page-fetch', method, url, body, headers)
      });
    }
    if (sandboxFetch && sandboxFetch !== pageFetch) {
      attempts.push({
        transport: 'fetch',
        run: () => fetchRequest(sandboxFetch, 'fetch', method, url, body, headers)
      });
    }
    if (!attempts.length) throw new Error(`${method} ${url} failed: no request transports`);
    const errors = [];
    for (const attempt of attempts) {
      try {
        const text = await withTimeout(
          Promise.resolve().then(attempt.run),
          cfg.requestTimeoutMs + 500,
          `${attempt.transport} ${method} request`
        );
        return { text, transport: attempt.transport };
      } catch (err) {
        errors.push(`${attempt.transport}: ${err?.message || String(err)}`);
      }
    }
    throw new Error(`${method} ${url} failed via all transports: ${errors.join(' | ')}`);
  }

  async function requestAcceptedTextWithFallback(label, urls, acceptText) {
    const candidates = uniqueUrls(urls);
    if (!candidates.length) {
      throw new Error(`${label} fetch failed: no urls`);
    }
    const errors = [];
    for (let i = 0; i < candidates.length; i += 1) {
      const url = candidates[i];
      if (i > 0 && cfg.fallbackStaggerMs > 0) await sleep(cfg.fallbackStaggerMs);
      try {
        logBootstrap(`${label} fetch try`, {
          url,
          index: i + 1,
          total: candidates.length,
          delayMs: i > 0 ? cfg.fallbackStaggerMs : 0
        });
        noteFetchStatus(label, `fetching ${i + 1}/${candidates.length}`);
        const { text, transport } = await requestText('GET', withCacheBust(url));
        const accepted = acceptText ? await acceptText(text, url) : null;
        noteFetchStatus(label, `ok via ${transport}`, true);
        logBootstrap(`${label} fetch ok`, {
          url,
          index: i + 1,
          transport,
          bytes: String(text || '').length
        });
        return { text, url, accepted, transport };
      } catch (err) {
        const error = err?.message || String(err);
        errors[i] = `${url}: ${error}`;
        noteFetchStatus(label, `failed ${i + 1}/${candidates.length}: ${error}`);
        logBootstrap(`${label} fetch failed`, {
          url,
          index: i + 1,
          total: candidates.length,
          error
        });
      }
    }
    noteFetchStatus(label, `failed: ${errors.filter(Boolean).join(' | ')}`, true);
    throw new Error(`${label} fetch failed from ${candidates.length} url(s): ${errors.filter(Boolean).join(' | ')}`);
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

  function parseUserscriptVersion(text) {
    const match = String(text || '').match(/^\s*\/\/\s*@version\s+([^\s]+)/m);
    if (!match) throw new Error('userscript @version missing');
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

  async function checkUserscriptVersion(reason = 'interval', options = {}) {
    const force = Boolean(options.force);
    const t = Date.now();
    if (state.checkingUserscriptVersion) {
      return {
        current: BOOTSTRAP_VERSION,
        latest: state.latestUserscriptVersion || '',
        updateAvailable: Boolean(state.userscriptUpdateAvailable),
        skipped: 'busy'
      };
    }
    if (!force && state.lastUserscriptVersionCheckAt && t - Number(state.lastUserscriptVersionCheckAt || 0) < cfg.userscriptVersionCheckMs) {
      return {
        current: BOOTSTRAP_VERSION,
        latest: state.latestUserscriptVersion || '',
        updateAvailable: Boolean(state.userscriptUpdateAvailable),
        skipped: 'cooldown'
      };
    }
    state.checkingUserscriptVersion = true;
    state.lastUserscriptVersionCheckAt = t;
    state.userscriptUpdateError = '';
    try {
      const { accepted, url, transport } = await requestAcceptedTextWithFallback(
        'userscript version',
        userscriptVersionUrls(),
        text => ({ version: parseUserscriptVersion(text) })
      );
      const latest = String(accepted?.version || '');
      const cmp = compareRemoteBotVersion(latest, BOOTSTRAP_VERSION);
      state.latestUserscriptVersion = latest;
      state.latestUserscriptUrl = url || '';
      state.userscriptUpdateAvailable = cmp !== null && cmp > 0;
      state.lastUserscriptVersionStatus = cmp === null
        ? `无法比较 当前 ${BOOTSTRAP_VERSION} / 远端 ${latest || '-'}`
        : (state.userscriptUpdateAvailable
          ? `发现新版本 ${latest}`
          : `已是最新 ${BOOTSTRAP_VERSION}`);
      logBootstrap('userscript version check complete', {
        reason,
        current: BOOTSTRAP_VERSION,
        latest,
        updateAvailable: state.userscriptUpdateAvailable,
        url,
        transport
      });
      updateBootstrapPanel(true);
      return {
        current: BOOTSTRAP_VERSION,
        latest,
        updateAvailable: state.userscriptUpdateAvailable,
        url
      };
    } catch (err) {
      const error = err?.message || String(err);
      state.userscriptUpdateError = error;
      state.lastUserscriptVersionStatus = '检查失败：' + error;
      logBootstrap('userscript version check failed', { reason, error });
      updateBootstrapPanel(true);
      return {
        current: BOOTSTRAP_VERSION,
        latest: state.latestUserscriptVersion || '',
        updateAvailable: Boolean(state.userscriptUpdateAvailable),
        error
      };
    } finally {
      state.checkingUserscriptVersion = false;
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
    const raw = GM_getValue('cachedManifest', '');
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
    if (cached?.version) {
      known.push({ source: 'cache', version: String(cached.version || ''), sha256: String(cached.sha256 || '') });
    }
    const status = getBotStatus();
    if (status?.running && status.version) {
      known.push({ source: 'running', version: String(status.version || ''), sha256: String(status.sourceHash || '') });
    }
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

  function keepRunningAfterRemoteFailure(error, reason, status = getBotStatus()) {
    if (!status?.running || tickIsStale(status) || runningBotUsesBlockedStrategy(status) || isPaused()) return false;
    const text = String(error || 'remote unavailable');
    state.lastError = '';
    state.lastManifestStatus = `remote unavailable; using running ${status.version || 'bot'}`;
    state.lastRemoteStatus = state.lastManifestStatus;
    state.lastInstallStatus = `kept running after ${reason || 'poll'} remote failure`;
    logBootstrap('remote failure ignored while bot healthy', {
      reason,
      error: text,
      status: shortStatus(status)
    });
    updateBootstrapPanel(true);
    return true;
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
    if (status.paused || isPaused()) return false;
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
      if (typeof unsafeWindow.leave === 'function') {
        const result = detail.userId ? unsafeWindow.leave(detail.userId) : unsafeWindow.leave();
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
      unsafeWindow.__graspRatBot?.stop?.(`cached update restart: ${manifest?.version || manifest?.sha256 || reason || 'remote update'}`);
    } catch (err) {
      detail.stopError = err?.message || String(err);
    }
    state.lastInstallStatus = `cached update restart scheduled for ${manifest?.version || manifest?.sha256 || 'remote update'}`;
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
    state.lastScriptStatus = `fetching ${manifest.version || manifest.sha256 || 'remote'}`;
    state.lastRemoteStatus = state.lastScriptStatus;
    updateBootstrapPanel(true);
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
    state.lastScriptStatus = `verified ${manifest.version || hash.slice(0, 8)}`;
    state.lastRemoteStatus = state.lastScriptStatus;
    updateBootstrapPanel(true);
    logBootstrap('script verified', { version: manifest.version, sha256: hash });
    GM_setValue('cachedManifest', safeStringify(manifest));
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
      state.lastInstallStatus = `confirming ${reason || 'install'}: ${safeStringify(status || null, 160)}`;
      await sleep(100);
    }
    logBootstrap('install confirm failed', {
      reason,
      elapsedMs: Date.now() - started,
      expectedHash: manifest.sha256,
      status: shortStatus(status),
      injectResult
    });
    throw new Error(`bot install did not confirm after ${cfg.installConfirmMs}ms: ${safeStringify({
      status,
      injectResult
    }, 500)}`);
  }

  async function installSource(manifest, source, reason) {
    if (!isGamePage()) return false;
    if (isPaused()) {
      syncPauseToPage();
      state.lastInstallStatus = `paused; install skipped for ${manifest.version || manifest.sha256 || 'remote'}`;
      updateBootstrapPanel(true);
      return false;
    }
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
      statusEvery: Number(manifest.statusEvery ?? cfg.statusEvery) === 0 ? 0 : Math.max(1000, Number(manifest.statusEvery || cfg.statusEvery) || DEFAULTS.statusEvery),
      version: String(manifest.version || 'remote'),
      sourceHash: String(manifest.sha256 || ''),
      sourceUrl: String(manifest.scriptUrl || ''),
      injectedBy: 'tampermonkey',
      combatLoggingEnabled: Boolean(cfg.combatLoggingEnabled && cfg.combatLogEndpointConfigured),
      combatLogEndpoint: cfg.combatLogEndpointConfigured ? cfg.combatLogEndpoint : '',
      combatLogEndpointConfigured: Boolean(cfg.combatLogEndpointConfigured),
      clashLeaveRescueEnabled: Boolean(cfg.clashLeaveRescueEnabled),
      clashLeaveRescueTimeoutMs: Math.max(1000, Number(cfg.clashControllerTimeoutMs || DEFAULTS.clashControllerTimeoutMs) || DEFAULTS.clashControllerTimeoutMs)
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
    if (isPaused()) {
      syncPauseToPage();
      state.lastInstallStatus = 'paused; fast cache install skipped';
      updateBootstrapPanel(true);
      return false;
    }
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
      logBootstrap('remote update cached; hot swapping running bot', {
        reason,
        version: manifest.version,
        sha256: manifest.sha256,
        cacheCurrent,
        blockedCurrentStrategy: runningBotUsesBlockedStrategy(status),
        status: shortStatus(status)
      });
      await installCached(reason, { force: true });
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
    syncPauseToPage();
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
      logBootstrap('manifest fetch complete', {
        reason,
        version: manifest.version,
        sha256: manifest.sha256,
        scriptUrl: manifest.scriptUrl,
        manifestUrl
      });
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
    if (direct && (visible(direct) || direct.dataset.graspRatNativeLoginHidden === 'true')) return direct;
    const candidates = Array.from(document.querySelectorAll('a, button, input[type="submit"], input[type="button"], [role="button"]'))
      .filter(el => visible(el) && el.id !== INLINE_LOGIN_BUTTON_ID);
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
    if (!cfg.autoLogin || !isGamePage()) return false;
    const paused = isPaused();
    if (paused && !force) {
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
    const rawStartLinuxDoLogin = force && typeof unsafeWindow.__graspRatBotRawStartLinuxDoLogin === 'function'
      ? unsafeWindow.__graspRatBotRawStartLinuxDoLogin
      : null;
    const startLoginFn = rawStartLinuxDoLogin || (typeof unsafeWindow.startLinuxDoLogin === 'function' ? unsafeWindow.startLinuxDoLogin : null);
    const canStartLogin = Boolean(loginControl || typeof startLoginFn === 'function');
    const shouldLogin = force
      ? canStartLogin
      : (!hasToken || (!hasSelf && /login|required/i.test(decisionReason) && loginRequired));
    if (!shouldLogin) return false;
    const loginGateBlock = bootstrapLoginPointSafetyBlock(status);
    if (loginGateBlock && !force) {
      rememberLoginGateBlock(loginGateBlock, reason);
      return false;
    }
    if (loginGateBlock && force) {
      rememberLoginGateBlock({ ...loginGateBlock, manualBypassed: true }, reason);
    }
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
      if (force) markManualLoginBypass(reason);
      if (loginControl) {
        if (force) markManualLoginBypass(reason);
        loginControl.click();
        detail.method = loginControl.id ? `#${loginControl.id}` : controlText(loginControl) || loginControl.tagName.toLowerCase();
      } else if (typeof startLoginFn === 'function') {
        const result = startLoginFn.call(unsafeWindow);
        if (result && typeof result.then === 'function') await result;
        detail.method = rawStartLinuxDoLogin ? 'rawStartLinuxDoLogin' : 'startLinuxDoLogin';
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
    markManualLoginBypass(text);
    const bot = unsafeWindow.__graspRatBot || null;
    if (bot && typeof bot.forceLoginNow === 'function') {
      const result = await bot.forceLoginNow(text);
      if (result?.login?.attempted) {
        clearCurrentReloginHold(text, { clearBot: false, clearLocal: false, clearPersistent: false });
      } else if (result?.login?.reason === 'snapshot-gate') {
        const gateBlock = bootstrapLoginPointSafetyBlock(getBotStatus()) || {
            at: Date.now(),
            reason: 'snapshot-gate',
            displayReason: '等待登录安全快照',
            snapshotGate: result.login.snapshotGate || null
          };
        rememberLoginGateBlock({ ...gateBlock, manualBypassed: true }, text);
        const fallbackLogin = await maybeStartGameLogin(text, {
          force: true,
          manual: true,
          ignoreSuppress: true,
          ignoreLoginCooldown: true
        });
        result.manualFallbackLogin = fallbackLogin;
      }
      updateBootstrapPanel(true);
      return result;
    }
    const loginGateBlock = bootstrapLoginPointSafetyBlock(getBotStatus());
    if (loginGateBlock) {
      rememberLoginGateBlock({ ...loginGateBlock, manualBypassed: true }, text);
    }
    const cleared = clearCurrentReloginHold(text);
    const login = await maybeStartGameLogin(text, {
      force: true,
      manual: true,
      ignoreSuppress: true,
      ignoreLoginCooldown: true
    });
    updateBootstrapPanel(true);
    return { at: Date.now(), reason: text, cleared, login };
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
    return Boolean(detail.method && !detail.error);
  }

  async function probeStaleRunningBot(reason, status) {
    if (!status?.running || status.ticking || !status.timerActive) return status;
    const bot = unsafeWindow.__graspRatBot || null;
    if (!bot || typeof bot.step !== 'function') return status;
    const before = shortStatus(status);
    try {
      logBootstrap('watchdog stale tick probe start', { reason, status: before });
      const result = bot.step('bootstrap-watchdog-stale-probe');
      if (result && typeof result.then === 'function') {
        await withTimeout(result, Math.min(2000, Math.max(500, cfg.staleTickMs)), 'watchdog stale tick probe');
      }
      const next = getBotStatus();
      logBootstrap('watchdog stale tick probe done', { reason, before, after: shortStatus(next) });
      return next;
    } catch (err) {
      state.lastError = 'watchdog stale tick probe failed: ' + (err?.message || String(err));
      logBootstrap('watchdog stale tick probe failed', { reason, error: state.lastError, status: before });
      return getBotStatus();
    }
  }

  async function watchdogOnce(reason = 'watchdog') {
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
    let status = getBotStatus();
    let missing = !status || !status.running;
    let stale = status && tickIsStale(status);
    let blockedStrategy = runningBotUsesBlockedStrategy(status);
    let mismatched = manifest && status && status.running
      && (String(status.sourceHash || '') !== String(manifest.sha256 || '') || String(status.version || '') !== String(manifest.version || ''));
    if (!missing && stale && !mismatched && !blockedStrategy) {
      status = await probeStaleRunningBot(reason, status);
      missing = !status || !status.running;
      stale = status && tickIsStale(status);
      blockedStrategy = runningBotUsesBlockedStrategy(status);
      mismatched = manifest && status && status.running
        && (String(status.sourceHash || '') !== String(manifest.sha256 || '') || String(status.version || '') !== String(manifest.version || ''));
    }
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
    owner: BOOTSTRAP_OWNER,
    injectedBy: BOOTSTRAP_OWNER,
    version: BOOTSTRAP_VERSION,
    config: cfg,
    state,
    pollOnce,
    watchdogOnce,
    checkLoaderVersion: checkUserscriptVersion,
    checkUserscriptVersion,
    maybeStartGameLogin,
    forceLoginNow,
    bootstrapLoginPointSafetyBlock,
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
	    configureCombatLogging(options = {}) {
	      return configureCombatLogging(options);
	    },
    configureClashLeaveRescue(options = {}) {
      return configureClashLeaveRescue(options);
    },
    setManifestUrl(url) {
      cfg.manifestUrl = String(url || '');
      GM_setValue('manifestUrl', cfg.manifestUrl);
      return cfg.manifestUrl;
    }
  };
  unsafeWindow.__graspRatBotClashLeaveRescue = clashLeaveRescue;

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
  installNativeLoginGateInterceptors();
  loginSuppressRemainingMs();
  syncPauseToPage();
  const renderPanelWhenReady = () => updateBootstrapPanel(true);
  if (document.body) renderPanelWhenReady();
  else document.addEventListener('DOMContentLoaded', () => runSafely('DOMContentLoaded panel render', renderPanelWhenReady), { once: true });
  document.addEventListener('DOMContentLoaded', () => runSafely('DOMContentLoaded viewport resize', () => scheduleNativeViewportResize('dom-content-loaded')), { once: true });
  window.addEventListener('load', () => runSafely('load viewport resize', () => scheduleNativeViewportResize('window-load')), { once: true });
  setSafeInterval('panel interval', () => updateBootstrapPanel(), cfg.panelUpdateMs);
  runAsyncSafely('startup userscript version check', () => checkUserscriptVersion('startup', { force: true }));
  setSafeInterval('userscript version interval', () => runAsyncSafely('userscript version interval', () => checkUserscriptVersion('interval')), cfg.userscriptVersionCheckMs);

  if (isGameAuthCallback()) {
    suppressLogin('oauth callback', cfg.authReturnGraceMs);
    setSafeInterval('callback watchdog interval', () => runAsyncSafely('callback watchdog interval', () => watchdogOnce('callback-interval')), cfg.watchdogMs);
    return;
  }

  logBootstrap('bootstrap start', {
    href: location.href,
    readyState: document.readyState,
    manifestUrl: cfg.manifestUrl,
    pollMs: cfg.pollMs,
    watchdogMs: cfg.watchdogMs,
    currentStatus: shortStatus()
  });

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
})();
