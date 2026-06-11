// ==UserScript==
// @name         Grasp Rat Bot Bootstrap
// @namespace    https://github.com/grasp-rat-bot
// @version      0.4.38
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
  const BOOTSTRAP_VERSION = '0.4.38';
  const BOOTSTRAP_OWNER = 'tampermonkey';
  const USERSCRIPT_UPDATE_URL = 'https://raw.githubusercontent.com/ZeroJehovah/grasp-rat-bot/main/userscript/grasp-rat-bootstrap.user.js';
  const MIN_REMOTE_BOT_VERSION = 'bootstrap-0.4.0';
  const PANEL_ID = 'grasp-rat-bot-panel';
  const HOST_LAYOUT_STYLE_ID = 'grasp-rat-bot-host-layout-style';
  const INLINE_LOGIN_BUTTON_ID = 'grasp-rat-bot-inline-login';
  const PAUSED_KEY = 'graspRatBotPaused';
  const PAUSE_REASON_KEY = 'graspRatBotPauseReason';
  const LOGIN_SUPPRESS_KEY = 'graspRatLoginSuppressUntil';
  const LOGIN_SUPPRESS_REASON_KEY = 'graspRatLoginSuppressReason';
  const ENEMY_LEAVE_STATE_KEY = 'graspRatEnemyLeaveState';
  const OFFLINE_LEAVE_STATE_KEY = 'graspRatOfflineLeaveState';
  const CLOUDFLARE_RELOAD_KEY = 'graspRatCloudflareReloadAt';
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
    combatLoggingEnabled: false,
    combatLogEndpoint: 'http://127.0.0.1:18765/combat-log',
    cacheBust: true,
    autoLogin: true
  };

  try {
    unsafeWindow.__graspRatBotTampermonkeyBootstrapPresent = true;
    unsafeWindow.__graspRatBotBootstrapOwner = BOOTSTRAP_OWNER;
  } catch (_) {}

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
    statusEvery: Math.max(250, Number(GM_getValue('statusEvery', DEFAULTS.statusEvery)) || DEFAULTS.statusEvery),
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
    combatLoggingEnabled: Boolean(GM_getValue('combatLoggingEnabled', DEFAULTS.combatLoggingEnabled)),
    combatLogEndpoint: String(GM_getValue('combatLogEndpoint', DEFAULTS.combatLogEndpoint) || DEFAULTS.combatLogEndpoint),
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

  function logBootstrap(message, detail) {
    try {
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

  function displayVersion(value) {
    const text = String(value || '-');
    return text.replace(/^bootstrap-/, '');
  }

  function formatStamina(self) {
    if (!self) return '-';
    const stamina = self.stamina || {};
    const percentText = (remaining, limit) => {
      const r = Number(remaining);
      const l = Number(limit);
      if (!Number.isFinite(r) || !Number.isFinite(l) || l <= 0) return '-';
      return Math.max(0, Math.min(100, Math.round((r / l) * 100))) + '%';
    };
    const exhausted = Array.isArray(stamina.exhausted) ? stamina.exhausted : [];
    const suffix = exhausted.length ? ' !' + exhausted.join('/') : '';
    return percentText(stamina.stamina5s ?? self.stamina5s ?? self.stamina_5s_remaining_milli, stamina.stamina5sLimit ?? self.stamina5sLimit ?? self.stamina_5s_limit_milli)
      + ' ' + percentText(stamina.stamina1h ?? self.stamina1h ?? self.stamina_1h_remaining_milli, stamina.stamina1hLimit ?? self.stamina1hLimit ?? self.stamina_1h_limit_milli)
      + ' ' + percentText(stamina.stamina1d ?? self.stamina1d ?? self.stamina_1d_remaining_milli, stamina.stamina1dLimit ?? self.stamina1dLimit ?? self.stamina_1d_limit_milli)
      + suffix;
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

  function formatAge(at) {
    const t = Number(at || 0);
    return t ? formatDuration(Date.now() - t) : '-';
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
      'combat-stamina-hold': '战斗：短体力不足，停止移动并开火',
      'combat-pressure-close': '战斗：久攻未中，压近开火',
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

  function targetSummaryText(decision, status) {
    const target = decision?.target || null;
    const kind = decision?.kind || '';
    if (target) {
      const parts = [];
      const isCoin = kind === 'coin' || kind === 'seek-coin' || (target.amount !== undefined && target.drop === undefined && target.hp === undefined);
      parts.push(isCoin ? '金币 ' : '目标 ');
      parts.push(targetNameText(target));
      if (target.distance !== undefined) parts.push(' 距离 ' + formatDistance(target.distance));
      if (target.amount !== undefined) parts.push(' 金币 ' + target.amount);
      if (target.hp !== undefined) parts.push(' HP ' + target.hp);
      if (target.drop !== undefined) parts.push(' Drop ' + target.drop);
      return parts.join('');
    }
    const threats = Array.isArray(decision?.threats) ? decision.threats : [];
    if (kind === 'flee' && threats[0]) {
      const threat = threats[0];
      return '威胁 ' + (threat.name || ('#' + threat.id)) + ' 距离 ' + formatDistance(threat.d ?? threat.distance);
    }
    const combatTarget = status?.combatTarget;
    if (isCombatDecision(decision, status) && combatTarget) {
      return '目标 ' + targetNameText(combatTarget) + (combatTarget.hp !== undefined ? ' HP ' + combatTarget.hp : '');
    }
    return '-';
  }

  function hpText(value) {
    const n = Number(value);
    return Number.isFinite(n) ? String(Math.round(n)) : '-';
  }

  function combatHpSummary(decision, status, self) {
    const target = decision?.target || status?.combatTarget || null;
    const selfHp = Number(decision?.combatState?.selfHp ?? self?.hp ?? status?.self?.hp ?? NaN);
    const targetHp = Number(decision?.combatState?.targetHp ?? target?.hp ?? NaN);
    return { selfHp, targetHp };
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
    if (!el) return;
    el.dataset.graspRatHiddenNativeBlock = 'true';
    el.setAttribute('aria-hidden', 'true');
    try {
      el.style.setProperty('display', 'none', 'important');
    } catch (_) {
      el.style.display = 'none';
    }
  }

  function ensureHostLayoutStyle() {
    if (!document.head) return;
    let style = document.getElementById(HOST_LAYOUT_STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = HOST_LAYOUT_STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = [
      'body.grasp-rat-bot-sidebar-embedded{margin:0!important;overflow:hidden!important}',
      'body.grasp-rat-bot-sidebar-embedded .app{display:flex!important;flex-direction:row!important;width:100vw!important;max-width:100vw!important;height:100vh!important;min-height:100vh!important;margin:0!important;padding:0!important;gap:0!important;align-items:stretch!important;overflow:hidden!important}',
      'body.grasp-rat-bot-sidebar-embedded .side{position:relative!important;left:0!important;top:0!important;bottom:0!important;transform:none!important;align-self:stretch!important;flex:0 0 min(336px,100vw)!important;width:min(336px,100vw)!important;min-width:min(336px,100vw)!important;max-width:min(336px,100vw)!important;height:100vh!important;min-height:100vh!important;max-height:100vh!important;margin:0!important;border-radius:0!important;display:flex!important;flex-direction:column!important;overflow-y:auto!important}',
      'body.grasp-rat-bot-sidebar-embedded .workspace{position:relative!important;inset:auto!important;left:auto!important;right:auto!important;top:auto!important;bottom:auto!important;display:grid!important;grid-template-rows:minmax(0,1fr)!important;align-self:stretch!important;transform:none!important;margin:0!important;flex:1 1 0!important;min-width:0!important;width:auto!important;max-width:none!important;height:100vh!important;min-height:100vh!important;max-height:100vh!important;overflow:hidden!important}',
      'body.grasp-rat-bot-sidebar-embedded .workspace>.map-shell{position:relative!important;inset:auto!important;width:100%!important;height:100%!important;min-width:0!important;min-height:0!important;overflow:hidden!important}',
      'body.grasp-rat-bot-sidebar-embedded .workspace #world{width:100%!important;height:100%!important;display:block!important}',
      'body.grasp-rat-bot-sidebar-embedded .side>.brand,body.grasp-rat-bot-sidebar-embedded .side>.view-control,body.grasp-rat-bot-sidebar-embedded .side>[data-grasp-rat-hidden-native-block="true"]{display:none!important}',
      'body.grasp-rat-bot-sidebar-embedded #joinBtn[data-grasp-rat-native-login-hidden="true"]{display:none!important}',
      'body.grasp-rat-bot-sidebar-embedded .side>.bottom-dock{position:static!important;left:auto!important;right:auto!important;top:auto!important;bottom:auto!important;inset:auto!important;transform:none!important;width:auto!important;max-width:none!important;margin:0!important;border-radius:0!important;flex:1 1 auto!important;min-height:0!important;display:flex!important;flex-direction:column!important;overflow:hidden!important}',
      'body.grasp-rat-bot-sidebar-embedded .side>.bottom-dock>.dock-minimap{display:none!important}',
      'body.grasp-rat-bot-sidebar-embedded .side>.bottom-dock>.log-wrap{flex:1 1 auto!important;min-height:0!important;display:flex!important;flex-direction:column!important}',
      'body.grasp-rat-bot-sidebar-embedded .side .log{flex:1 1 auto!important;min-height:120px!important}',
      'body.grasp-rat-bot-sidebar-embedded #' + PANEL_ID + '{margin:0!important;flex:0 0 auto!important;border-bottom:1px solid rgba(148,163,184,.20)!important}'
    ].join('\n');
  }

  function syncNativeSidebarStructure() {
    const side = getNativeSidebar();
    if (!side || !document.body) {
      document.body?.classList.remove('grasp-rat-bot-sidebar-embedded');
      return null;
    }
    ensureHostLayoutStyle();
    document.body.classList.add('grasp-rat-bot-sidebar-embedded');
    setDisplayNone(nativeSidebarBlock(side, el => el.classList?.contains('brand')));
    setDisplayNone(nativeSidebarBlock(side, el => el.querySelector?.('#status,#inGame,#entities,#visibleCount,#cells') || /Runtime Metrics/i.test(el.textContent || '')));
    setDisplayNone(nativeSidebarBlock(side, el => el.classList?.contains('view-control') || el.querySelector?.('#densityText,#scaleText,#staminaText,#teleportInput,#zoomOutBtn,#zoomInBtn')));
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
    const loggedIn = pageLooksLoggedIn(status);
    let loginButton = document.getElementById(INLINE_LOGIN_BUTTON_ID);
    if (state.cloudflareError || loggedIn) {
      if (loginButton) loginButton.remove();
      return;
    }
    if (!loginButton) {
      loginButton = document.createElement('button');
      loginButton.id = INLINE_LOGIN_BUTTON_ID;
      loginButton.type = 'button';
      grid.insertBefore(loginButton, document.getElementById('leaveBtn') || null);
    } else if (loginButton.parentElement !== grid) {
      grid.insertBefore(loginButton, document.getElementById('leaveBtn') || null);
    }
    loginButton.className = nativeJoin?.className || 'join';
    loginButton.textContent = loginButton.dataset.graspRatLoginPending === 'true' ? '登录中' : '立即登录';
    loginButton.title = '通过脚本立即登录/加入游戏';
    loginButton.disabled = loginButton.dataset.graspRatLoginPending === 'true';
    loginButton.onclick = event => {
      event.preventDefault();
      event.stopPropagation();
      if (loginButton.dataset.graspRatLoginPending === 'true') return;
      loginButton.dataset.graspRatLoginPending = 'true';
      loginButton.disabled = true;
      loginButton.textContent = '登录中';
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
      if (panel.parentElement !== bottomDock || panel.nextSibling !== logWrap) bottomDock.insertBefore(panel, logWrap);
    } else if (bottomDock) {
      if (panel.parentElement !== side || panel.nextSibling !== bottomDock) side.insertBefore(panel, bottomDock);
    } else {
      const entityBlock = nativeSidebarBlock(side, el => el.querySelector?.('#userId,#leaveBtn,#joinBtn'));
      if (entityBlock?.nextSibling) side.insertBefore(panel, entityBlock.nextSibling);
      else side.appendChild(panel);
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
        'font:13px/1.45 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono",monospace',
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

  function bootstrapButtonStyle(kind = 'neutral') {
    const base = 'flex:0 0 auto;height:30px;border:1px solid rgba(148,163,184,.24);border-radius:8px;background:rgba(30,41,59,.62);color:#e5edf7;font:12px/1 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono",monospace;padding:0 10px;cursor:pointer;white-space:nowrap';
    if (kind === 'join') return base + ';border-color:rgba(52,211,153,.42);background:rgba(16,185,129,.16);color:#a7f3d0;font-weight:750';
    if (kind === 'leave') return base + ';border-color:rgba(251,113,133,.42);background:rgba(244,63,94,.12);color:#fecdd3';
    return base;
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
      panel.style.cssText = bootstrapPanelShellStyle(true, embedded) + ';padding:12px 14px;color:#fee2e2';
      panel.textContent = `BOT 面板错误：${message || state.lastError || 'unknown error'}`;
    } catch (_) {}
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
    const reasonDetail = state.cloudflareError?.displayReason || decisionReasonDetail(decision, status) || reasonText(decision?.reason);
    const self = status?.self || decision?.self || null;
    const safety = status?.safety || {};
    const control = status?.control || {};
    const manifest = readCachedManifest();
    const bVersion = status?.version || manifest?.version || state.lastManifestVersion || '-';
    const aVersion = BOOTSTRAP_VERSION;
    const wsLabel = control.wsOpen ? 'online' : (control.connecting ? 'connecting' : 'offline');
    const wsColor = control.wsOpen ? '#86efac' : (control.connecting ? '#fde68a' : '#fca5a5');
    const nearestActive = safety.nearestActive
      ? (safety.nearestActive.name || ('#' + safety.nearestActive.id)) + ' ' + formatDistance(safety.nearestActive.distance)
      : '-';
    const session = status?.session || {};
    const persistent = activePersistentExitDetail(status);
    const reloginHold = status?.enemyLeave?.holdRemainingMs || status?.pursuitLeave?.holdRemainingMs || status?.offlineLeave?.holdRemainingMs || persistent?.holdRemainingMs || 0;
    const buttonText = paused ? '继续' : '暂停';
    const buttonTitle = paused ? '恢复 bot 自动控制' : '暂停 bot，保留手动控制';
    const statusText = paused ? '暂停' : (status?.running ? '运行' : '未运行');
    const statusColor = paused ? '#fca5a5' : (status?.running ? '#86efac' : '#fde68a');
    const statusHalo = paused ? 'rgba(251,113,133,.13)' : (status?.running ? 'rgba(52,211,153,.13)' : 'rgba(251,191,36,.14)');
    const statusGlow = paused ? 'rgba(251,113,133,.45)' : (status?.running ? 'rgba(52,211,153,.45)' : 'rgba(251,191,36,.45)');
    while (panel.firstChild) panel.removeChild(panel.firstChild);
    let appendParent = panel;
    const appendLine = (text, style = '') => {
      const line = document.createElement('div');
      const baseStyle = 'min-width:0;overflow-wrap:anywhere;font-size:12px;line-height:1.42;color:#e5edf7';
      line.style.cssText = style ? baseStyle + ';' + style : baseStyle;
      line.textContent = String(text ?? '');
      appendParent.appendChild(line);
      return line;
    };
    const appendRichLine = (parts, style = '') => {
      const line = document.createElement('div');
      const baseStyle = 'min-width:0;overflow-wrap:anywhere;font-size:12px;line-height:1.42;color:#e5edf7';
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
      line.style.cssText = 'min-width:0;display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:12px;line-height:1.42;color:#e5edf7';
      const hpLabel = document.createElement('span');
      const hpValue = Number(self?.hp);
      hpLabel.textContent = 'HP ' + (self?.hp ?? '-');
      if (Number.isFinite(hpValue) && hpValue < 100) hpLabel.style.cssText = 'color:#fca5a5;font-weight:700';
      else if (hpValue === 100) hpLabel.style.cssText = 'color:#86efac;font-weight:700';
      const staminaPill = document.createElement('span');
      staminaPill.className = 'pill compact' + (exhausted ? ' exhausted' : '');
      staminaPill.textContent = '体力: ' + formatStamina(self);
      staminaPill.style.cssText = [
        'display:inline-flex',
        'align-items:center',
        'max-width:100%',
        'min-height:22px',
        'box-sizing:border-box',
        'padding:2px 8px',
        'border:1px solid ' + (exhausted ? 'rgba(251,113,133,.42)' : 'rgba(148,163,184,.24)'),
        'border-radius:999px',
        'background:' + (exhausted ? 'rgba(127,29,29,.28)' : 'rgba(15,23,42,.54)'),
        'color:' + (exhausted ? '#fecdd3' : '#cbd5e1'),
        'font-size:11px',
        'line-height:1.25',
        'font-variant-numeric:tabular-nums',
        'overflow-wrap:anywhere'
      ].join(';');
      const dropLabel = document.createElement('span');
      dropLabel.textContent = 'Drop ' + (self?.drop ?? '-');
      dropLabel.style.cssText = 'color:#e5edf7';
      line.appendChild(hpLabel);
      line.appendChild(staminaPill);
      line.appendChild(dropLabel);
      appendParent.appendChild(line);
      return line;
    };
    const appendMetricGrid = metrics => {
      const grid = document.createElement('div');
      const columns = Math.min(4, Math.max(1, metrics.length));
      grid.style.cssText = 'display:grid;grid-template-columns:repeat(' + columns + ',minmax(0,1fr));gap:6px;margin:1px 0 2px';
      for (const metric of metrics) {
        const item = document.createElement('div');
        item.style.cssText = 'min-height:42px;border:1px solid rgba(148,163,184,.20);border-radius:8px;background:rgba(15,23,42,.50);padding:6px 7px;box-shadow:inset 0 1px 0 rgba(255,255,255,.03);overflow:hidden';
        const value = document.createElement('b');
        value.textContent = String(metric.value ?? '-');
        value.style.cssText = 'display:block;font-size:14px;line-height:1.1;font-weight:800;color:' + (metric.color || '#e0f2fe') + ';font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
        const label = document.createElement('span');
        label.textContent = String(metric.label ?? '');
        label.style.cssText = 'display:block;margin-top:2px;color:#94a3b8;font-size:9px;letter-spacing:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
        item.appendChild(value);
        item.appendChild(label);
        grid.appendChild(item);
      }
      appendParent.appendChild(grid);
      return grid;
    };
    const appendSection = titleText => {
      const section = document.createElement('div');
      const first = !panel.firstChild;
      section.style.cssText = first
        ? 'padding:14px 16px 12px;display:grid;gap:8px'
        : 'padding:12px 16px;border-top:1px solid rgba(148,163,184,.20);display:grid;gap:8px';
      if (titleText) {
        const titleLine = document.createElement('div');
        titleLine.textContent = titleText;
        titleLine.style.cssText = 'margin:0;color:#cbd5e1;font-size:11px;font-weight:700;letter-spacing:0';
        section.appendChild(titleLine);
      }
      panel.appendChild(section);
      appendParent = section;
      return section;
    };
    appendSection('脚本信息');
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:1px';
    const titleWrap = document.createElement('div');
    titleWrap.style.cssText = 'display:flex;align-items:center;gap:8px;min-width:0';
    const title = document.createElement('div');
    title.style.cssText = 'font-weight:750;font-size:16px;line-height:1.2;color:#f8fafc;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    title.textContent = 'BOT';
    const statusDot = document.createElement('i');
    statusDot.setAttribute('aria-hidden', 'true');
    statusDot.style.cssText = 'flex:0 0 auto;width:8px;height:8px;border-radius:50%;background:' + statusColor + ';box-shadow:0 0 0 4px ' + statusHalo + ',0 0 22px ' + statusGlow;
    titleWrap.appendChild(title);
    titleWrap.appendChild(statusDot);
    const button = document.createElement('button');
    button.type = 'button';
    button.title = buttonTitle;
    button.style.cssText = bootstrapButtonStyle(paused ? 'join' : 'leave');
    button.textContent = buttonText;
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      setPaused(!isPaused(), 'panel button');
    }, { once: true });
    header.appendChild(titleWrap);
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;align-items:center;gap:6px;flex:0 0 auto';
    actions.appendChild(button);
    header.appendChild(actions);
    appendParent.appendChild(header);
    if (state.userscriptUpdateAvailable) {
      appendLine(
        '加载器A（篡改猴）有新版本：当前 ' + aVersion + ' / 最新 ' + (state.latestUserscriptVersion || '-') + '，请手动更新',
        'margin:0 0 8px;padding:7px 9px;border:1px solid rgba(251,113,133,.42);border-radius:8px;background:rgba(127,29,29,.28);color:#fecdd3;font-weight:700'
      );
    }
    appendRichLine([
      '版本：加载器: 篡改猴 ',
      { text: displayVersion(aVersion), style: 'color:' + (state.userscriptUpdateAvailable ? '#fca5a5' : '#86efac') + ';font-weight:700' },
      ' / 远程 ',
      { text: displayVersion(bVersion), style: 'color:#86efac;font-weight:700' }
    ], 'font-size:11px;margin:-2px 0 6px;color:#94a3b8');
    appendRichLine([
      '状态：',
      { text: statusText, style: 'color:' + statusColor + ';font-weight:700' },
      ' / WS ',
      { text: wsLabel, style: 'color:' + wsColor + ';font-weight:700' },
      paused && state.pauseReason ? ' / ' + state.pauseReason : ''
    ]);
    const combatLogStatus = status?.combatLogging || {};
    const remoteLogEnabled = Boolean(cfg.combatLoggingEnabled);
    const remoteLogSent = Number(combatLogStatus.sessionSent ?? session.combatLogSent ?? combatLogStatus.sent ?? 0) || 0;
    const remoteLogPending = Number(combatLogStatus.pending ?? 0) || 0;
    const remoteLogFailed = Number(combatLogStatus.sessionFailed ?? session.combatLogFailed ?? combatLogStatus.failed ?? 0) || 0;
    appendRichLine([
      '远程日志：',
      { text: remoteLogEnabled ? '开' : '关', style: 'color:' + (remoteLogEnabled ? '#86efac' : '#fde68a') + ';font-weight:700' },
      ' / 本次登录已发 ',
      { text: formatNumber(remoteLogSent, '0'), style: remoteLogSent > 0 ? 'color:#86efac;font-weight:700' : '' },
      ' / 待发 ',
      { text: formatNumber(remoteLogPending, '0'), style: remoteLogPending > 0 ? 'color:#fde68a;font-weight:700' : '' },
      ' / 失败 ',
      { text: formatNumber(remoteLogFailed, '0'), style: remoteLogFailed > 0 ? 'color:#fca5a5;font-weight:700' : '' }
    ], 'font-size:11px;color:#94a3b8');
    appendSection('BOT行为');
    appendLine('当前行为：' + behaviorText(decision, status));
    appendLine('当前目标：' + targetSummaryText(decision, status));
    appendLine('原因：' + reasonDetail);
    if (isCombatDecision(decision, status)) {
      const hp = combatHpSummary(decision, status, self);
      appendRichLine([
        '战斗血量：',
        { text: hpText(hp.selfHp), style: 'color:#fca5a5;font-weight:800' },
        ' vs ',
        { text: hpText(hp.targetHp), style: 'color:#fde68a;font-weight:800' }
      ], 'margin:2px 0 0;padding:7px 9px;border:1px solid rgba(251,113,133,.42);border-radius:8px;background:rgba(127,29,29,.28);color:#fee2e2;font-weight:700');
      if (decision?.combat) {
        appendLine('战斗细节：瞄准 ' + (decision?.aimTarget?.mode || '-') + ' / 来弹 ' + (decision?.incomingBullet ? formatDistance(decision.incomingBullet.laneDistance) : '-'));
      }
    }
    appendSection('统计信息');
    if (state.cloudflareError) {
      appendLine('错误页：' + state.cloudflareError.label);
    } else if (status?.running) {
      const coinsGained = Number(session.coinsGained || 0) || 0;
      const kills = Number(session.kills || 0) || 0;
      const staminaSpent = sessionStaminaSpentMs(session, self);
      appendMetricGrid([
        { label: 'uptime', value: formatDuration(session.uptimeMs ?? status.uptimeMs), color: '#e0f2fe' },
        { label: '消耗体力', value: formatStaminaSpent(session, self), color: Number(staminaSpent || 0) > 0 ? '#fde68a' : '#e0f2fe' },
        { label: 'coins', value: '+' + formatNumber(coinsGained, '0'), color: coinsGained > 0 ? '#a7f3d0' : '#e0f2fe' },
        { label: 'kills', value: formatNumber(kills, '0'), color: kills > 0 ? '#fde68a' : '#e0f2fe' }
      ]);
      appendStaminaLine();
      appendLine('Active ' + nearestActive);
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
      const hold = reloginHold;
      if (hold > 0) appendLine('等待重连：' + formatDuration(hold));
      if (Array.isArray(status.errors) && status.errors.length) {
        appendLine('BOT错误：' + (status.errors[status.errors.length - 1]?.message || ''), 'color:#fca5a5');
      }
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
      statusEvery: Math.max(250, Number(manifest.statusEvery || cfg.statusEvery) || 1000),
      version: String(manifest.version || 'remote'),
      sourceHash: String(manifest.sha256 || ''),
      sourceUrl: String(manifest.scriptUrl || ''),
      injectedBy: 'tampermonkey',
      combatLoggingEnabled: Boolean(cfg.combatLoggingEnabled),
      combatLogEndpoint: cfg.combatLogEndpoint
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

  async function maybeStartGameLogin(reason = 'watchdog', options = {}) {
    const force = Boolean(options.force || options.immediate || options.manual);
    const ignoreSuppress = Boolean(options.ignoreSuppress || force);
    const ignoreLoginCooldown = Boolean(options.ignoreLoginCooldown || force);
    if (!cfg.autoLogin || !isGamePage()) return false;
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
    const canStartLogin = Boolean(loginControl || typeof unsafeWindow.startLinuxDoLogin === 'function');
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
    return Boolean(detail.method && !detail.error);
  }

  async function forceLoginNow(reason = 'panel immediate login') {
    const text = String(reason || 'panel immediate login');
    const bot = unsafeWindow.__graspRatBot || null;
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
      const next = options && typeof options === 'object' ? options : {};
      if (Object.prototype.hasOwnProperty.call(next, 'enabled')) {
        cfg.combatLoggingEnabled = Boolean(next.enabled);
        GM_setValue('combatLoggingEnabled', cfg.combatLoggingEnabled);
      }
      if (Object.prototype.hasOwnProperty.call(next, 'endpoint')) {
        cfg.combatLogEndpoint = String(next.endpoint || DEFAULTS.combatLogEndpoint);
        GM_setValue('combatLogEndpoint', cfg.combatLogEndpoint);
      }
      try {
        const bot = unsafeWindow.__graspRatBot;
        if (bot && typeof bot.configureCombatLogging === 'function') {
          bot.configureCombatLogging({
            enabled: cfg.combatLoggingEnabled,
            endpoint: cfg.combatLogEndpoint
          });
        }
      } catch (_) {}
      updateBootstrapPanel(true);
      return {
        enabled: cfg.combatLoggingEnabled,
        endpoint: cfg.combatLogEndpoint
      };
    },
    setManifestUrl(url) {
      cfg.manifestUrl = String(url || '');
      GM_setValue('manifestUrl', cfg.manifestUrl);
      return cfg.manifestUrl;
    }
  };

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
