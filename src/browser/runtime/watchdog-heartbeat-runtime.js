'use strict';

function fallbackNow() {
  return Date.now();
}

function safeClone(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_) {
    return null;
  }
}

function boolValue(value, fallback = false) {
  if (value === undefined) return fallback;
  if (typeof value === 'string') return /^(?:1|true|yes|on)$/i.test(value);
  return Boolean(value);
}

function numberValue(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function parseDescriptor(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return objectValue(parsed);
    } catch (_) {
      return null;
    }
  }
  return objectValue(value);
}

function safeJsonParse(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch (_) {
    return null;
  }
}

function createWatchdogHeartbeatRuntime(runtime = {}) {
  const {
    bot,
    cfg,
    storage = typeof localStorage !== 'undefined' ? localStorage : null,
    pageGlobal = typeof window !== 'undefined' ? window : null,
    documentRef = typeof document !== 'undefined' ? document : null,
    locationRef = typeof location !== 'undefined' ? location : null,
    fetchFn = typeof fetch !== 'undefined' ? fetch : null,
    setIntervalFn = typeof setInterval !== 'undefined' ? setInterval : null,
    clearIntervalFn = typeof clearInterval !== 'undefined' ? clearInterval : null,
    setTimeoutFn = typeof setTimeout !== 'undefined' ? setTimeout : null,
    clearTimeoutFn = typeof clearTimeout !== 'undefined' ? clearTimeout : null,
    now = fallbackNow,
    getSelf = () => null,
    summarizeSelf = value => value,
    getCurrentUserId = () => null,
    getSessionToken = () => '',
    summarizeControl = () => null,
    combatTickActiveFromState = () => false,
    recordRuntimeDiagnostics = () => {}
  } = runtime;

  function watchdogState() {
    if (!bot.watchdog || typeof bot.watchdog !== 'object') {
      bot.watchdog = {};
    }
    return bot.watchdog;
  }

  function endpointConfigured() {
    return Boolean(cfg.watchdogEndpointConfigured || watchdogState().endpointConfigured);
  }

  function watchdogEnabled() {
    return Boolean(cfg.watchdogEnabled && endpointConfigured());
  }

  function configuredEndpoint() {
    return String(cfg.watchdogEndpoint || watchdogState().endpoint || 'http://127.0.0.1:18765/watchdog/heartbeat');
  }

  function configuredStatusEndpoint() {
    const endpoint = configuredEndpoint();
    try {
      const url = new URL(endpoint, locationRef?.origin || 'https://grasp-rat-game.h-e.top');
      if (!/\/watchdog\/heartbeat\/?$/i.test(url.pathname)) return '';
      url.pathname = url.pathname.replace(/\/watchdog\/heartbeat\/?$/i, '/watchdog/status');
      url.search = '';
      url.hash = '';
      return url.toString();
    } catch (_) {
      return '';
    }
  }

  function watchdogIntervalMs(combatActive) {
    const fallback = combatActive ? 200 : 500;
    const key = combatActive ? 'watchdogCombatHeartbeatMs' : 'watchdogHeartbeatMs';
    return Math.max(100, Number(cfg[key] || fallback) || fallback);
  }

  function watchdogServiceStatusMs() {
    return Math.max(1000, Number(cfg.watchdogServiceStatusMs || 2000) || 2000);
  }

  function watchdogTimeoutMs() {
    return Math.max(100, Number(cfg.watchdogHeartbeatTimeoutMs || 400) || 400);
  }

  function summarizeServiceStatus(body) {
    const source = objectValue(body) || {};
    const state = Array.isArray(source.states)
      ? (source.states.find(item => String(item?.pageId || '') === String(watchdogState().pageId || '')) || source.states[0] || null)
      : null;
    const clashValidation = source.clash?.validation || null;
    return {
      ok: Boolean(source.ok),
      enabled: Boolean(source.enabled),
      activeRescueEnabled: Boolean(source.activeRescueEnabled),
      dryRun: Boolean(source.dryRun),
      stateCount: Number(source.stateCount || 0) || 0,
      heartbeatAgeMs: state?.heartbeatAgeMs ?? null,
      directLeaveEnabled: Boolean(source.directLeave?.enabled),
      directLeaveVerified: Boolean(source.directLeave?.verified),
      directLeaveReadyStates: Number(source.directLeave?.readyStates || 0) || 0,
      clashEnabled: Boolean(source.clash?.enabled),
      clashValidationOk: Boolean(clashValidation?.ok),
      clashValidationError: String(clashValidation?.error || ''),
      warning: String(source.warning || ''),
      lastDecisionType: String(source.lastDecision?.type || ''),
      lastDecisionAt: Number(source.lastDecision?.at || 0) || 0
    };
  }

  function summarizeTarget(decision) {
    const target = decision?.target
      || decision?.combatState?.target
      || decision?.aimTarget?.target
      || decision?.attack?.target
      || bot.combatTarget
      || bot.lastTarget
      || null;
    if (!target || typeof target !== 'object') return null;
    const id = target.id ?? target.user_id ?? target.userId ?? target.targetId;
    const out = {};
    if (id !== undefined && id !== null && id !== '') out.id = id;
    if (target.name || target.label) out.name = String(target.name || target.label);
    const hp = numberValue(target.hp ?? target.knownHp ?? target.health ?? target.currentHp, NaN);
    if (Number.isFinite(hp)) out.hp = hp;
    const distance = numberValue(target.distance ?? target.d, NaN);
    if (Number.isFinite(distance)) out.distance = Math.round(distance);
    return Object.keys(out).length ? out : null;
  }

  function currentCombatActive(decision = bot.lastDecision) {
    try {
      return Boolean(combatTickActiveFromState({
        decision,
        combatTarget: bot.combatTarget,
        pendingExit: bot.pendingExit || bot.pendingCombatLeave,
        nowMs: now()
      }));
    } catch (_) {
      return Boolean(bot.lastTickCombatActive || bot.combatTarget || bot.pendingCombatLeave);
    }
  }

  function updateDamageState(self, combatActive) {
    const state = watchdogState();
    const hp = numberValue(self?.hp, NaN);
    if (!combatActive) {
      state.combatDamageActive = false;
      state.combatDamageStartHp = Number.isFinite(hp) ? hp : null;
      state.combatDamageMinHp = Number.isFinite(hp) ? hp : null;
      state.damagedInCombat = false;
      return false;
    }
    if (!state.combatDamageActive) {
      state.combatDamageActive = true;
      state.combatDamageStartHp = Number.isFinite(hp) ? hp : null;
      state.combatDamageMinHp = Number.isFinite(hp) ? hp : null;
      state.damagedInCombat = false;
    }
    if (Number.isFinite(hp)) {
      const priorMin = Number.isFinite(Number(state.combatDamageMinHp)) ? Number(state.combatDamageMinHp) : hp;
      if (hp < priorMin) state.combatDamageMinHp = hp;
      const startHp = Number.isFinite(Number(state.combatDamageStartHp)) ? Number(state.combatDamageStartHp) : hp;
      if (hp < startHp) state.damagedInCombat = true;
    }
    return Boolean(state.damagedInCombat);
  }

  function leaveDescriptorConfig() {
    return parseDescriptor(cfg.watchdogLeaveDescriptor || watchdogState().leaveDescriptor);
  }

  function buildLeaveAuth(userId, control) {
    const token = (() => {
      try {
        return String(getSessionToken() || storage?.getItem?.('tmpGameSessionToken') || '');
      } catch (_) {
        return '';
      }
    })();
    const descriptor = leaveDescriptorConfig();
    const sendDescriptor = Boolean(cfg.watchdogSendLeaveDescriptor && descriptor);
    const ttlMs = Math.max(1000, Number(cfg.watchdogLeaveDescriptorTtlMs || 30000) || 30000);
    const available = Boolean(control?.hasToken || token || userId);
    const out = {
      available,
      userId,
      origin: locationRef?.origin || 'https://grasp-rat-game.h-e.top',
      sessionTokenPresent: Boolean(token),
      expiresAt: now() + ttlMs
    };
    if (sendDescriptor) {
      out.sessionToken = token;
      out.descriptor = safeClone(descriptor);
    }
    return out;
  }

  function buildWatchdogHeartbeat() {
    const state = watchdogState();
    const decision = bot.lastDecision || null;
    const rawSelf = getSelf() || bot.lastSelf || null;
    const self = rawSelf ? summarizeSelf(rawSelf) : null;
    const combatActive = currentCombatActive(decision);
    const damagedInCombat = updateDamageState(self, combatActive);
    const control = summarizeControl() || {};
    const userId = getCurrentUserId() ?? self?.id ?? control.currentUserId ?? bot.session?.userId ?? null;
    return {
      type: 'watchdog-heartbeat',
      pageId: state.pageId,
      userId,
      at: now(),
      sequence: Number(state.sequence || 0) + 1,
      visibilityState: documentRef?.visibilityState || '',
      pageLifecycle: state.pageLifecycle || '',
      combatActive,
      damagedInCombat,
      self: self ? {
        id: self.id ?? self.user_id ?? userId ?? null,
        hp: self.hp ?? null,
        maxHp: self.maxHp ?? self.max_hp ?? null,
        life: self.life || ''
      } : null,
      target: summarizeTarget(decision),
      decision: decision ? {
        kind: decision.kind || '',
        reason: decision.reason || '',
        pendingExit: Boolean(bot.pendingExit || decision.pendingExit || decision.leave?.pendingExit),
        displayReason: decision.displayReason || decision.leave?.displayReason || ''
      } : null,
      control: {
        wsOpen: Boolean(control.wsOpen),
        nativeWsOpen: Boolean(control.nativeWsOpen),
        rawWsOpen: Boolean(control.rawWsOpen),
        connecting: Boolean(control.connecting),
        hasToken: Boolean(control.hasToken || getSessionToken()),
        currentUserId: control.currentUserId ?? userId ?? null
      },
      runtime: {
        lastCombatTickAt: bot.lastTickCombatActive ? Number(bot.lastTickAt || 0) : 0,
        lastTickAt: Number(bot.lastTickAt || 0),
        lastTickCompletedAt: Number(bot.lastTickCompletedAt || 0),
        tickGapMs: bot.lastTickGapMs ?? null,
        diagnosis: bot.runtimeDiagnostics?.diagnosis || ''
      },
      leaveAuth: buildLeaveAuth(userId, control)
    };
  }

  function requestWithTimeout(endpoint, payload) {
    if (typeof fetchFn !== 'function') return Promise.reject(new Error('fetch unavailable'));
    const body = JSON.stringify(payload);
    const timeoutMs = watchdogTimeoutMs();
    const AbortControllerImpl = typeof AbortController !== 'undefined' ? AbortController : null;
    const controller = AbortControllerImpl ? new AbortControllerImpl() : null;
    const timer = controller && typeof setTimeoutFn === 'function'
      ? setTimeoutFn(() => controller.abort(), timeoutMs)
      : 0;
    return Promise.resolve()
      .then(() => fetchFn(endpoint, {
        method: 'POST',
        mode: 'cors',
        cache: 'no-store',
        keepalive: body.length < 60000,
        headers: { 'content-type': 'application/json' },
        body,
        signal: controller?.signal
      }))
      .finally(() => {
        if (timer && typeof clearTimeoutFn === 'function') clearTimeoutFn(timer);
      });
  }

  function requestStatusWithTimeout(endpoint) {
    if (typeof fetchFn !== 'function') return Promise.reject(new Error('fetch unavailable'));
    const timeoutMs = watchdogTimeoutMs();
    const AbortControllerImpl = typeof AbortController !== 'undefined' ? AbortController : null;
    const controller = AbortControllerImpl ? new AbortControllerImpl() : null;
    const timer = controller && typeof setTimeoutFn === 'function'
      ? setTimeoutFn(() => controller.abort(), timeoutMs)
      : 0;
    return Promise.resolve()
      .then(() => fetchFn(endpoint, {
        method: 'GET',
        mode: 'cors',
        cache: 'no-store',
        signal: controller?.signal
      }))
      .then(async res => {
        if (!res || !res.ok) throw new Error('watchdog status failed: HTTP ' + (res?.status || 0));
        const text = typeof res.text === 'function' ? await res.text() : '';
        return safeJsonParse(text) || {};
      })
      .finally(() => {
        if (timer && typeof clearTimeoutFn === 'function') clearTimeoutFn(timer);
      });
  }

  function pollWatchdogServiceStatus(force = false) {
    const state = watchdogState();
    if (!endpointConfigured()) {
      state.serviceStatus = null;
      state.serviceStatusEndpoint = '';
      state.serviceLastError = '';
      return false;
    }
    const endpoint = configuredStatusEndpoint();
    state.serviceStatusEndpoint = endpoint;
    if (!endpoint) {
      state.serviceLastError = 'watchdog status endpoint unavailable';
      return false;
    }
    if (state.serviceStatusInFlight) return false;
    const t = now();
    if (!force && state.lastServiceStatusAttemptAt && t - Number(state.lastServiceStatusAttemptAt || 0) < watchdogServiceStatusMs()) {
      return false;
    }
    state.lastServiceStatusAttemptAt = t;
    state.serviceStatusInFlight = true;
    requestStatusWithTimeout(endpoint)
      .then(body => {
        state.serviceStatus = summarizeServiceStatus(body);
        state.lastServiceStatusAt = now();
        state.serviceLastError = '';
      })
      .catch(err => {
        state.serviceLastError = err?.name === 'AbortError' ? 'watchdog status timed out' : (err?.message || String(err));
      })
      .finally(() => {
        state.serviceStatusInFlight = false;
      });
    return true;
  }

  function shouldSendHeartbeat(force = false) {
    const state = watchdogState();
    if (!watchdogEnabled()) {
      state.lastSkipReason = endpointConfigured() ? 'disabled' : 'endpoint-not-configured';
      return false;
    }
    if (!configuredEndpoint()) {
      state.lastSkipReason = 'endpoint-missing';
      return false;
    }
    if (state.sending) {
      state.lastSkipReason = 'send-in-flight';
      return false;
    }
    const decision = bot.lastDecision || null;
    const combatActive = currentCombatActive(decision);
    const t = now();
    if (!force && state.lastAttemptAt && t - Number(state.lastAttemptAt || 0) < watchdogIntervalMs(combatActive)) {
      state.lastSkipReason = 'interval';
      return false;
    }
    const self = getSelf() || bot.lastSelf || null;
    const control = summarizeControl() || {};
    if (!combatActive && !self && !control.hasToken && !getCurrentUserId()) {
      state.lastSkipReason = 'not-logged-in';
      return false;
    }
    return true;
  }

  function sendWatchdogHeartbeat(force = false) {
    const state = watchdogState();
    if (!shouldSendHeartbeat(force)) return false;
    const payload = buildWatchdogHeartbeat();
    state.sequence = Number(payload.sequence || 0);
    state.lastAttemptAt = now();
    state.sending = true;
    state.lastSkipReason = '';
    requestWithTimeout(configuredEndpoint(), payload)
      .then(res => {
        if (!res || !res.ok) throw new Error('watchdog heartbeat failed: HTTP ' + (res?.status || 0));
        state.sent = Number(state.sent || 0) + 1;
        state.lastOkAt = now();
        state.lastError = '';
      })
      .catch(err => {
        state.failed = Number(state.failed || 0) + 1;
        state.lastError = err?.name === 'AbortError' ? 'watchdog heartbeat timed out' : (err?.message || String(err));
      })
      .finally(() => {
        state.sending = false;
        recordRuntimeDiagnostics({
          watchdogHeartbeatLastAttemptAt: state.lastAttemptAt,
          watchdogHeartbeatLastOkAt: state.lastOkAt || 0,
          watchdogHeartbeatFailed: Number(state.failed || 0)
        });
      });
    return true;
  }

  function startWatchdogHeartbeat() {
    const state = watchdogState();
    stopWatchdogHeartbeat();
    if (!watchdogEnabled() || typeof setIntervalFn !== 'function') return false;
    const minInterval = Math.min(
      watchdogIntervalMs(false),
      watchdogIntervalMs(true)
    );
    state.timer = setIntervalFn(() => {
      try {
        pollWatchdogServiceStatus(false);
        sendWatchdogHeartbeat(false);
      } catch (err) {
        state.lastError = err?.message || String(err);
      }
    }, Math.max(100, minInterval));
    pollWatchdogServiceStatus(true);
    return true;
  }

  function stopWatchdogHeartbeat() {
    const state = watchdogState();
    if (state.timer && typeof clearIntervalFn === 'function') clearIntervalFn(state.timer);
    state.timer = 0;
    state.sending = false;
    return true;
  }

  function configureWatchdog(options = {}) {
    const next = options && typeof options === 'object' ? options : {};
    const state = watchdogState();
    if (Object.prototype.hasOwnProperty.call(next, 'endpoint')) {
      cfg.watchdogEndpoint = String(next.endpoint || 'http://127.0.0.1:18765/watchdog/heartbeat');
      cfg.watchdogEndpointConfigured = true;
      state.endpoint = cfg.watchdogEndpoint;
      state.endpointConfigured = true;
    }
    if (Object.prototype.hasOwnProperty.call(next, 'enabled')) {
      cfg.watchdogEnabled = Boolean(next.enabled) && Boolean(cfg.watchdogEndpointConfigured);
      state.enabled = cfg.watchdogEnabled;
    }
    if (Object.prototype.hasOwnProperty.call(next, 'heartbeatMs')) {
      cfg.watchdogHeartbeatMs = Math.max(100, Number(next.heartbeatMs || cfg.watchdogHeartbeatMs || 500) || 500);
    }
    if (Object.prototype.hasOwnProperty.call(next, 'combatHeartbeatMs')) {
      cfg.watchdogCombatHeartbeatMs = Math.max(100, Number(next.combatHeartbeatMs || cfg.watchdogCombatHeartbeatMs || 200) || 200);
    }
    if (Object.prototype.hasOwnProperty.call(next, 'timeoutMs')) {
      cfg.watchdogHeartbeatTimeoutMs = Math.max(100, Number(next.timeoutMs || cfg.watchdogHeartbeatTimeoutMs || 400) || 400);
    }
    if (Object.prototype.hasOwnProperty.call(next, 'sendLeaveDescriptor')) {
      cfg.watchdogSendLeaveDescriptor = Boolean(next.sendLeaveDescriptor);
    }
    if (Object.prototype.hasOwnProperty.call(next, 'leaveDescriptor')) {
      cfg.watchdogLeaveDescriptor = parseDescriptor(next.leaveDescriptor);
      state.leaveDescriptor = safeClone(cfg.watchdogLeaveDescriptor);
    }
    if (Object.prototype.hasOwnProperty.call(next, 'leaveDescriptorTtlMs')) {
      cfg.watchdogLeaveDescriptorTtlMs = Math.max(1000, Number(next.leaveDescriptorTtlMs || cfg.watchdogLeaveDescriptorTtlMs || 30000) || 30000);
    }
    if (!watchdogEnabled()) stopWatchdogHeartbeat();
    else startWatchdogHeartbeat();
    return summarizeWatchdogStatus();
  }

  function summarizeWatchdogStatus() {
    const state = watchdogState();
    const t = now();
    const service = state.serviceStatus || null;
    return {
      enabled: watchdogEnabled(),
      endpoint: endpointConfigured() ? configuredEndpoint() : '',
      statusEndpoint: endpointConfigured() ? configuredStatusEndpoint() : '',
      endpointConfigured: endpointConfigured(),
      pageId: state.pageId || '',
      heartbeatMs: watchdogIntervalMs(false),
      combatHeartbeatMs: watchdogIntervalMs(true),
      serviceStatusMs: watchdogServiceStatusMs(),
      timeoutMs: watchdogTimeoutMs(),
      sendLeaveDescriptor: Boolean(cfg.watchdogSendLeaveDescriptor),
      leaveDescriptorConfigured: Boolean(leaveDescriptorConfig()),
      timerActive: Boolean(state.timer),
      sending: Boolean(state.sending),
      sequence: Number(state.sequence || 0),
      sent: Number(state.sent || 0),
      failed: Number(state.failed || 0),
      lastAttemptAt: Number(state.lastAttemptAt || 0),
      lastAttemptAgeMs: state.lastAttemptAt ? Math.max(0, Math.round(t - Number(state.lastAttemptAt || t))) : null,
      lastOkAt: Number(state.lastOkAt || 0),
      lastOkAgeMs: state.lastOkAt ? Math.max(0, Math.round(t - Number(state.lastOkAt || t))) : null,
      lastError: state.lastError || '',
      lastSkipReason: state.lastSkipReason || '',
      service,
      serviceStatusInFlight: Boolean(state.serviceStatusInFlight),
      lastServiceStatusAttemptAt: Number(state.lastServiceStatusAttemptAt || 0),
      lastServiceStatusAt: Number(state.lastServiceStatusAt || 0),
      lastServiceStatusAgeMs: state.lastServiceStatusAt ? Math.max(0, Math.round(t - Number(state.lastServiceStatusAt || t))) : null,
      serviceLastError: state.serviceLastError || '',
      damagedInCombat: Boolean(state.damagedInCombat),
      pageLifecycle: state.pageLifecycle || ''
    };
  }

  function installLifecycleListeners() {
    const state = watchdogState();
    if (state.lifecycleListenersInstalled || !pageGlobal?.addEventListener) return false;
    state.lifecycleListenersInstalled = true;
    const mark = label => {
      state.pageLifecycle = label;
      if (watchdogEnabled()) sendWatchdogHeartbeat(true);
    };
    try {
      pageGlobal.addEventListener('freeze', () => mark('freeze'));
      pageGlobal.addEventListener('resume', () => mark('resume'));
      pageGlobal.addEventListener('pagehide', () => mark('pagehide'));
      pageGlobal.addEventListener('pageshow', () => mark('pageshow'));
      if (documentRef?.addEventListener) {
        documentRef.addEventListener('visibilitychange', () => mark(documentRef.visibilityState || 'visibilitychange'));
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  installLifecycleListeners();

  return {
    configureWatchdog,
    summarizeWatchdogStatus,
    buildWatchdogHeartbeat,
    sendWatchdogHeartbeat,
    startWatchdogHeartbeat,
    stopWatchdogHeartbeat,
    pollWatchdogServiceStatus
  };
}

module.exports = {
  createWatchdogHeartbeatRuntime
};
