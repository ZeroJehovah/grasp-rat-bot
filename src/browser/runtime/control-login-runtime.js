'use strict';

function createControlLoginRuntime(runtime = {}) {
  const {
    bot,
    cfg,
    storage = typeof localStorage !== 'undefined' ? localStorage : null,
    pageGlobal = typeof window !== 'undefined' ? window : null,
    botKey = '',
    loginSuppressKey = '',
    loginSuppressReasonKey = '',
    readPageGlobal = () => null,
    installPageGlobal = () => {},
    normalizeLoginSnapshotGateStateCore = value => value || {},
    loginSnapshotSuccessRequiredCore = () => 0,
    loginPointSafetyStatus = () => ({}),
    resetLoginPointSafetyGate = () => ({}),
    noteLoginPointSafetyProbe = () => ({}),
    isVisible = () => false,
    controlText = () => '',
    getSelf = () => null,
    summarizeSelf = value => value,
    getCurrentUserId = () => 0,
    summarizeControl = () => null,
    updateBotPanel = () => {}
  } = runtime;
  const localStorage = storage;
  const BOT_KEY = botKey;
  const LOGIN_SUPPRESS_KEY = loginSuppressKey;
  const LOGIN_SUPPRESS_REASON_KEY = loginSuppressReasonKey;

    function isBotOwnedLoginControl(el) {
      return Boolean(el && el.id === 'grasp-rat-bot-inline-login');
    }

  	  function findLoginControl() {
      const direct = document.querySelector('#joinBtn, #loginBtn, [data-testid="login"], [data-testid="join"]');
      if (direct && (isVisible(direct) || direct.dataset?.graspRatNativeLoginHidden === 'true')) return direct;
      const candidates = Array.from(document.querySelectorAll('a, button, input[type="submit"], input[type="button"], [role="button"]'))
        .filter(el => isVisible(el) && !isBotOwnedLoginControl(el));
      return candidates.find(el => {
        const text = controlText(el);
        if (/leave|logout|sign out|cancel|退出|离开|取消/i.test(text)) return false;
        return /linuxdo|login|sign in|oauth|authorize|join|start|play|登录|登陆|授权|加入|进入|开始/i.test(text);
      }) || null;
    }

    function hasLoginRequiredTextValue(value) {
      return /login required|please login|please sign in|not logged in|未登录|请先登录|请登录|需要登录/i.test(String(value || ''));
    }

    function hasLoginRequiredText() {
      const bodyText = (document.body?.innerText || '').slice(0, 5000);
      if (hasLoginRequiredTextValue(bodyText)) return true;
      for (const selector of ['#chat', '#chatLog', '#chatMessages', '.chat', '.chat-log', '.chat-messages', '.messages', '.side']) {
        try {
          const text = Array.from(document.querySelectorAll(selector))
            .map(el => String(el?.innerText || el?.textContent || ''))
            .join('\n')
            .slice(-5000);
          if (hasLoginRequiredTextValue(text)) return true;
        } catch (_) {}
      }
      const messages = Array.isArray(bot?.globalState?.messages) ? bot.globalState.messages.slice(-30) : [];
      for (const message of messages) {
        const text = typeof message === 'string'
          ? message
          : [
            message?.text,
            message?.message,
            message?.content,
            message?.body,
            message?.type
          ].filter(Boolean).join(' ');
        if (hasLoginRequiredTextValue(text)) return true;
      }
      return false;
    }

    function setLoginSuppress(reason, ms = cfg.postLoginGraceMs) {
      const requestedUntil = Date.now() + Math.max(1000, Number(ms) || cfg.postLoginGraceMs);
      let existingUntil = 0;
      let existingReason = '';
      try {
        existingUntil = Number(localStorage.getItem(LOGIN_SUPPRESS_KEY) || 0) || 0;
        existingReason = String(localStorage.getItem(LOGIN_SUPPRESS_REASON_KEY) || '');
      } catch (_) {}
      const reuseExisting = existingUntil > requestedUntil;
      const until = reuseExisting ? existingUntil : requestedUntil;
      const suppressReason = reuseExisting
        ? String(existingReason || reason || 'login flow')
        : String(reason || 'login flow');
      try {
        localStorage.setItem(LOGIN_SUPPRESS_KEY, String(until));
        localStorage.setItem(LOGIN_SUPPRESS_REASON_KEY, suppressReason);
      } catch (_) {}
      return until;
    }

  	  function loginSuppressRemainingMs() {
  	    let until = 0;
  	    try {
  	      until = Number(localStorage.getItem(LOGIN_SUPPRESS_KEY) || 0) || 0;
  	    } catch (_) {}
      const remaining = Math.max(0, until - Date.now());
      if (!remaining && until) {
        try {
          localStorage.removeItem(LOGIN_SUPPRESS_KEY);
          localStorage.removeItem(LOGIN_SUPPRESS_REASON_KEY);
        } catch (_) {}
  	    }
  	    return remaining;
  	  }

    function loginSuppressStatus(t = Date.now()) {
      let until = 0;
      let reason = '';
      try {
        until = Number(localStorage.getItem(LOGIN_SUPPRESS_KEY) || 0) || 0;
        reason = String(localStorage.getItem(LOGIN_SUPPRESS_REASON_KEY) || '');
      } catch (_) {}
      const remainingMs = Math.max(0, Math.round(until - t));
      if (!remainingMs && until) {
        try {
          localStorage.removeItem(LOGIN_SUPPRESS_KEY);
          localStorage.removeItem(LOGIN_SUPPRESS_REASON_KEY);
        } catch (_) {}
        until = 0;
        reason = '';
      }
      return {
        until,
        reason,
        remainingMs
      };
    }


  	  function snapshotLoginGateStatus(t = Date.now()) {
  	    const state = normalizeLoginSnapshotGateStateCore(bot.loginSnapshotGate, loginSnapshotSuccessRequiredCore());
  	    const required = loginSnapshotSuccessRequiredCore();
  	    state.required = required;
  	    if (state.streak > required) state.streak = required;
  	    const lastSampleAt = Number(state.lastSampleAt || state.lastOkAt || state.lastErrorAt || 0) || 0;
  	    const pointSafety = loginPointSafetyStatus(t);
  	    const snapshotConnectivitySatisfied = true;
  	    const loginPointSafetySatisfied = Boolean(pointSafety.satisfied);
  	    return {
  	      ...state,
  	      lastSampleAt,
  	      satisfied: loginPointSafetySatisfied,
  	      snapshotConnectivitySatisfied,
  	      loginPointSafetySatisfied,
  	      loginPointSafetyBlocked: !loginPointSafetySatisfied,
  	      remaining: Math.max(0, required - state.streak),
  	      pointSafety,
  	      lastOkAgeMs: state.lastOkAt ? Math.max(0, Math.round(t - Number(state.lastOkAt || t))) : null,
  	      lastErrorAgeMs: state.lastErrorAt ? Math.max(0, Math.round(t - Number(state.lastErrorAt || t))) : null,
  	      lastSampleAgeMs: lastSampleAt ? Math.max(0, Math.round(t - lastSampleAt)) : null
  	    };
  	  }

  	  function resetLoginSnapshotGate(reason = 'exit', exitSelfLike = null) {
  	    const t = Date.now();
  	    bot.loginSnapshotGate = {
  	      ...normalizeLoginSnapshotGateStateCore(bot.loginSnapshotGate, loginSnapshotSuccessRequiredCore()),
  	      streak: 0,
  	      required: loginSnapshotSuccessRequiredCore(),
  	      lastError: '',
  	      resetAt: t,
  	      resetReason: String(reason || 'exit')
  	    };
  	    resetLoginPointSafetyGate(reason, exitSelfLike);
  	    return snapshotLoginGateStatus(t);
  	  }

  	  function noteLoginSnapshotProbe(success, detail = {}) {
  	    const t = Date.now();
  	    const required = loginSnapshotSuccessRequiredCore();
  	    const state = normalizeLoginSnapshotGateStateCore(bot.loginSnapshotGate, loginSnapshotSuccessRequiredCore());
  	    state.required = required;
  	    state.lastSampleAt = t;
  	    if (success) {
  	      state.streak = Math.min(required, Math.max(0, Number(state.streak || 0)) + 1);
  	      state.lastOkAt = t;
  	      state.lastTick = Number(detail.tick || state.lastTick || 0) || 0;
  	      state.lastError = '';
  	    } else {
  	      state.streak = 0;
  	      state.lastErrorAt = t;
  	      state.lastError = String(detail.error || detail.message || '');
  	    }
  	    bot.loginSnapshotGate = state;
  	    noteLoginPointSafetyProbe(success, {
  	      ...detail,
  	      entities: Array.isArray(detail.entities) ? detail.entities : bot.globalState.entities
  	    });
  	    return snapshotLoginGateStatus(t);
  	  }

  	  function loginSnapshotGateAllowsLogin(gate) {
  	    if (!gate) return false;
  	    if (gate.satisfied) return true;
  	    return Boolean(gate.liveSessionTakeoverBypass
  	      && gate.pointSafety?.satisfied);
  	  }

  	  function loginSnapshotGateBlockReason(gate = snapshotLoginGateStatus()) {
  	    const status = gate || snapshotLoginGateStatus();
  	    if (loginSnapshotGateAllowsLogin(status)) return '';
  	    const pointSafety = status.pointSafety || loginPointSafetyStatus();
  	    if (!pointSafety.hasPoint && Number(pointSafety.required || 0) > 0) return 'login-point-missing';
  	    if (!pointSafety.satisfied) return 'login-point-safety';
  	    return 'snapshot-gate';
  	  }

  	  async function ensureLoginSnapshotGate(reason = 'login', options = {}) {
  	    let status = snapshotLoginGateStatus();
  	    if (status.satisfied) return status;
  	    const allowTakeoverBypass = Boolean(options.allowLiveSessionTakeoverBypass && options.liveSessionTakeover?.allowed);
  	    if (allowTakeoverBypass && status.pointSafety?.satisfied) {
  	      status.blockReason = String(reason || 'login');
  	      status.liveSessionTakeoverBypass = true;
  	      status.liveSessionTakeover = options.liveSessionTakeover;
  	      return status;
  	    }
      status.blockReason = String(reason || 'login');
      status.passiveSnapshotOnly = true;
  	    if (!status.satisfied && allowTakeoverBypass && status.pointSafety?.satisfied) {
  	      status.liveSessionTakeoverBypass = true;
  	      status.liveSessionTakeover = options.liveSessionTakeover;
  	    }
  	    return status;
  	  }

  	  function loginSnapshotGateDisplayReason(snapshotGate = snapshotLoginGateStatus()) {
  	    const gate = snapshotGate || snapshotLoginGateStatus();
  	    if (gate.satisfied) return '';
  	    const pointSafety = gate.pointSafety || loginPointSafetyStatus();
  	    if (!pointSafety.hasPoint && Number(pointSafety.required || 0) > 0) {
  	      return '等待登录点坐标，需先在游戏内读取自身坐标';
  	    }
  	    if (pointSafety.hasPoint && !pointSafety.satisfied) {
  	      const pieces = [
  	        '等待登录点安全快照',
  	        String(pointSafety.streak || 0) + '/' + String(pointSafety.required || 0),
  	        '半径' + Math.round(pointSafety.radius || 0) + 'cm'
  	      ];
  	      if (pointSafety.lastDanger?.reason) {
  	        const actor = pointSafety.lastDanger.actor || {};
  	        pieces.push('危险：' + pointSafety.lastDanger.reason + (actor.name || actor.id ? ' ' + (actor.name || ('#' + actor.id)) : ''));
  	      }
  	      if (pointSafety.lastError) pieces.push('最近错误：' + pointSafety.lastError);
  	      return pieces.join('，');
  	    }
  	    return '等待登录点安全快照';
  		  }

    function markManualLoginBypass(reason = 'manual login', durationMs = 5000) {
      try {
        installPageGlobal('__graspRatManualLoginBypassUntil', Date.now() + Math.max(1000, Number(durationMs) || 5000), pageGlobal);
        installPageGlobal('__graspRatManualLoginBypassReason', String(reason || 'manual login'), pageGlobal);
      } catch (_) {}
    }

    function manualLoginBypassActive() {
      try {
        return Number(readPageGlobal('__graspRatManualLoginBypassUntil', 0, pageGlobal) || 0) > Date.now();
      } catch (_) {
        return false;
      }
    }

    function nativeLoginEventControl(event) {
      const raw = event?.submitter || event?.target || null;
      const el = raw?.closest?.('#joinBtn, #loginBtn, [data-testid="login"], [data-testid="join"], a, button, input[type="submit"], input[type="button"], [role="button"]') || null;
      if (!el || isBotOwnedLoginControl(el)) return null;
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
      const gate = snapshotLoginGateStatus();
      if (loginSnapshotGateAllowsLogin(gate)) return;
      const point = gate.pointSafety || loginPointSafetyStatus();
      if (!point?.hasPoint && !point?.missingPoint) return;
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
      const block = {
        at: Date.now(),
        reason: loginSnapshotGateBlockReason(gate),
        control: control.id ? '#' + control.id : controlText(control) || control.tagName?.toLowerCase?.() || '',
        snapshotGate: gate,
        displayReason: loginSnapshotGateDisplayReason(gate)
      };
      bot.lastLoginResult = {
        needed: true,
        attempted: false,
        reason: 'snapshot-gate',
        error: '',
        nativeLoginBlocked: block,
        snapshotGate: gate
      };
      bot.lastDecision = {
        kind: 'wait',
        reason: 'login-snapshot-gate',
        dx: 0,
        dy: 0,
        self: getSelf() ? summarizeSelf(getSelf()) : bot.lastSelf,
        currentUserId: getCurrentUserId(),
        control: summarizeControl(),
        login: bot.lastLoginResult,
        displayReason: block.displayReason
      };
      updateBotPanel(bot.lastDecision);
    }

    function installStartLinuxDoLoginGate() {
      if (readPageGlobal('__graspRatStartLinuxDoLoginGateInstalled', false, pageGlobal)) return;
      if (readPageGlobal('__graspRatBotStartLinuxDoLoginGateVersion', '', pageGlobal) === cfg.version) return;
      const current = readPageGlobal('startLinuxDoLogin', null, pageGlobal);
      const preservedRaw = readPageGlobal('__graspRatBotRawStartLinuxDoLogin', null, pageGlobal);
      const previous = preservedRaw && preservedRaw !== current ? preservedRaw : current;
      installPageGlobal('__graspRatBotRawStartLinuxDoLogin', previous, pageGlobal);
      const guardedStartLinuxDoLogin = function graspRatBotGuardedStartLinuxDoLogin(...args) {
        if (manualLoginBypassActive()) {
          if (typeof previous === 'function') return previous.apply(this, args);
          return previous;
        }
        const gate = snapshotLoginGateStatus();
        if (!loginSnapshotGateAllowsLogin(gate)) {
          const point = gate.pointSafety || loginPointSafetyStatus();
          if (point?.hasPoint || point?.missingPoint) {
            const block = {
              at: Date.now(),
              reason: loginSnapshotGateBlockReason(gate),
              snapshotGate: gate,
              displayReason: loginSnapshotGateDisplayReason(gate)
            };
            bot.lastLoginResult = {
              needed: true,
              attempted: false,
              reason: 'snapshot-gate',
              error: '',
              nativeLoginBlocked: block,
              snapshotGate: gate
            };
            bot.lastDecision = {
              kind: 'wait',
              reason: 'login-snapshot-gate',
              dx: 0,
              dy: 0,
              self: getSelf() ? summarizeSelf(getSelf()) : bot.lastSelf,
              currentUserId: getCurrentUserId(),
              control: summarizeControl(),
              login: bot.lastLoginResult,
              displayReason: block.displayReason
            };
            updateBotPanel(bot.lastDecision);
            return false;
          }
        }
        if (typeof previous === 'function') return previous.apply(this, args);
        return previous;
      };
      try {
        installPageGlobal('startLinuxDoLogin', guardedStartLinuxDoLogin, pageGlobal);
        installPageGlobal('__graspRatBotStartLinuxDoLoginGateVersion', cfg.version, pageGlobal);
      } catch (_) {}
    }

    function installNativeLoginGateInterceptors() {
      if (bot.nativeLoginGateInstalled) return;
      bot.nativeLoginGateInstalled = true;
      installStartLinuxDoLoginGate();
      for (const type of ['pointerdown', 'mousedown', 'touchstart', 'click', 'submit']) {
        document.addEventListener(type, blockNativeLoginEventIfNeeded, true);
      }
    }

  return {
    findLoginControl,
    hasLoginRequiredText,
    setLoginSuppress,
    loginSuppressRemainingMs,
    loginSuppressStatus,
    snapshotLoginGateStatus,
    resetLoginSnapshotGate,
    noteLoginSnapshotProbe,
    loginSnapshotGateAllowsLogin,
    loginSnapshotGateBlockReason,
    ensureLoginSnapshotGate,
    loginSnapshotGateDisplayReason,
    markManualLoginBypass,
    manualLoginBypassActive,
    nativeLoginEventControl,
    blockNativeLoginEventIfNeeded,
    installStartLinuxDoLoginGate,
    installNativeLoginGateInterceptors
  };
}

module.exports = {
  createControlLoginRuntime
};
