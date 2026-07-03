'use strict';

function autoLoginSource() {
  return String.raw`  async function maybeStartAutoLogin(reason, options = {}) {
    const force = Boolean(options.force || options.immediate || options.manual);
    const manualOverride = Boolean(options.manualOverride || options.manual);
    const ignoreSuppress = Boolean(options.ignoreSuppress || force);
    const ignoreLoginCooldown = Boolean(options.ignoreLoginCooldown || force);
    const liveSessionTakeover = options.liveSessionTakeover || null;
    const allowLiveSessionTakeoverBypass = Boolean(options.allowLiveSessionTakeoverBypass && liveSessionTakeover?.allowed);
    if (syncPausedFromPage() && !manualOverride) {
      return {
        needed: false,
        attempted: false,
	        reason: 'paused',
	        error: '',
	        hasToken: Boolean(getSessionToken()),
	        currentUserId: getCurrentUserId(),
	        snapshotGate: snapshotLoginGateStatus()
	      };
    }
    if (!cfg.autoLogin || cfg.dryRun || cfg.once) return null;
    const t = Date.now();
    if (exitAuditFlushPending() && !manualOverride) {
      const blocked = exitAuditFlushBlockDetail('login:' + (reason || ''));
      bot.exitAudit.lastBlockedLogin = blocked;
      flushCombatLogs(true);
      return {
        needed: true,
        attempted: false,
        reason: 'exit-log-flush-pending',
        cooldownRemainingMs: 0,
        error: '',
	        exitAuditFlush: blocked,
	        hasToken: Boolean(getSessionToken()),
	        hasNativeSession: false,
	        nativeWsReadyState: getNativeControl()?.wsReadyState ?? null,
	        currentUserId: getCurrentUserId(),
	        snapshotGate: snapshotLoginGateStatus()
	      };
    }
    if (manualOverride && exitAuditFlushPending()) {
      bot.exitAudit.lastManualLoginBypass = exitAuditFlushBlockDetail('manual-login:' + (reason || ''));
      flushCombatLogs(true);
    }
    const userId = getCurrentUserId();
    const hasToken = Boolean(getSessionToken());
    const native = getNativeControl();
    const hasNativeSession = hasNativeGameSession(native, userId);
    const loginControl = findLoginControl();
    const loginRequired = hasLoginRequiredText();
    const self = getSelf();
    const hasAliveSelf = Boolean(self && isAlive(self));
    const currentStartLinuxDoLogin = readPageGlobal('startLinuxDoLogin', null, pageGlobal);
    const canStartLogin = Boolean(loginControl || typeof currentStartLinuxDoLogin === 'function');
    const hasPageSession = Boolean(hasToken || hasNativeSession);
    const needsLogin = !hasAliveSelf && (
      loginRequired
        || !hasPageSession
        || (force && canStartLogin && (!hasNativeSession || allowLiveSessionTakeoverBypass))
    );
	    if (!needsLogin) {
	      return force ? {
	        needed: false,
	        attempted: false,
        reason: hasAliveSelf ? 'already-alive' : (hasNativeSession ? 'game-session-active' : 'already-logged-in'),
        error: '',
        forced: true,
        hasToken,
        hasNativeSession,
	        nativeWsReadyState: native?.wsReadyState ?? null,
	        currentUserId: userId,
	        snapshotGate: snapshotLoginGateStatus(),
	        liveSessionTakeover,
	        self: hasAliveSelf ? summarizeSelf(self) : null
	      } : null;
	    }
	    closeCurrentImportantSessionBeforeLogin('login-before-session-end:' + String(reason || 'login'));
	    if (importantSessionEndFlushPending() && !manualOverride) {
	      const blocked = importantSessionEndFlushBlockDetail('login:' + (reason || ''));
	      bot.importantLogging.lastBlockedLogin = blocked;
	      return {
	        needed: true,
	        attempted: false,
	        reason: 'important-log-flush-pending',
	        cooldownRemainingMs: 0,
	        error: '',
	        importantLogFlush: blocked,
	        hasToken,
	        hasNativeSession,
	        nativeWsReadyState: native?.wsReadyState ?? null,
	        currentUserId: userId,
	        snapshotGate: snapshotLoginGateStatus(),
	        liveSessionTakeover
	      };
	    }
	    if (manualOverride && importantSessionEndFlushPending()) {
	      bot.importantLogging.lastManualLoginBypass = importantSessionEndFlushBlockDetail('manual-login:' + (reason || ''));
	    }
	    const suppressRemainingMs = loginSuppressRemainingMs();
    if (suppressRemainingMs > 0 && !ignoreSuppress) {
      return {
        needed: true,
        attempted: false,
        reason: 'suppressed',
        cooldownRemainingMs: Math.round(suppressRemainingMs),
        error: '',
        suppressReason: localStorage.getItem(LOGIN_SUPPRESS_REASON_KEY) || 'login flow',
	        hasToken,
	        hasNativeSession,
	        nativeWsReadyState: native?.wsReadyState ?? null,
	        currentUserId: userId,
	        snapshotGate: snapshotLoginGateStatus(),
	        liveSessionTakeover
	      };
	    }
    if (!ignoreLoginCooldown && t - Number(bot.lastLoginAt || 0) < cfg.loginCooldownMs) {
      const lastError = bot.lastLoginResult?.error || '';
      return {
        needed: true,
        attempted: false,
        reason: 'cooldown',
        cooldownRemainingMs: Math.max(0, Math.round(cfg.loginCooldownMs - (t - Number(bot.lastLoginAt || 0)))),
        error: lastError,
	        hasToken,
	        hasNativeSession,
	        nativeWsReadyState: native?.wsReadyState ?? null,
	        currentUserId: userId,
	        snapshotGate: snapshotLoginGateStatus(),
	        liveSessionTakeover
	      };
	    }
	    const snapshotGate = manualOverride
	      ? {
	        ...snapshotLoginGateStatus(),
	        blockReason: String(reason || 'manual login'),
	        manualLoginBypass: true
	      }
	      : await ensureLoginSnapshotGate(reason, {
	        allowLiveSessionTakeoverBypass,
	        liveSessionTakeover
	      });
	    if (!manualOverride && !loginSnapshotGateAllowsLogin(snapshotGate)) {
	      return {
	        needed: true,
	        attempted: false,
	        reason: 'snapshot-gate',
	        cooldownRemainingMs: 0,
	        error: '',
	        snapshotGate,
	        hasToken,
	        hasNativeSession,
	        nativeWsReadyState: native?.wsReadyState ?? null,
	        currentUserId: userId,
	        liveSessionTakeover
	      };
	    }
	    const detail = {
	      needed: true,
	      attempted: false,
      reason,
      hasToken,
      hasNativeSession,
      nativeWsReadyState: native?.wsReadyState ?? null,
      currentUserId: userId,
	      loginRequired,
	      forced: force,
	      manualLoginBypass: manualOverride,
	      ignoredSuppressMs: ignoreSuppress ? Math.round(suppressRemainingMs) : 0,
	      snapshotGate,
	      liveSessionTakeover,
	      snapshotGateBypassed: Boolean(snapshotGate.liveSessionTakeoverBypass),
	      loginControl: loginControl ? (loginControl.id ? '#' + loginControl.id : (controlText(loginControl) || loginControl.tagName.toLowerCase())) : '',
      method: '',
      error: ''
    };
    bot.lastLoginAt = t;
    try {
      const rawStartLinuxDoLoginCandidate = manualOverride
        ? readPageGlobal('__graspRatBotRawStartLinuxDoLogin', null, pageGlobal)
        : null;
      const rawStartLinuxDoLogin = typeof rawStartLinuxDoLoginCandidate === 'function'
        ? rawStartLinuxDoLoginCandidate
        : null;
      const startLinuxDoLoginFn = readPageGlobal('startLinuxDoLogin', null, pageGlobal);
      const startLoginFn = rawStartLinuxDoLogin || (typeof startLinuxDoLoginFn === 'function' ? startLinuxDoLoginFn : null);
      if (manualOverride) markManualLoginBypass(String(reason || 'manual login'));
      if (typeof startLoginFn === 'function') {
        const result = startLoginFn.call(pageGlobal);
        if (result && typeof result.then === 'function') await result;
        detail.attempted = true;
        detail.method = rawStartLinuxDoLogin ? 'rawStartLinuxDoLogin' : 'startLinuxDoLogin';
      } else if (loginControl) {
        if (manualOverride) markManualLoginBypass(String(reason || 'manual login'));
        loginControl.click();
        detail.attempted = true;
        detail.method = loginControl.id ? '#' + loginControl.id : (controlText(loginControl) || loginControl.tagName.toLowerCase());
      } else {
        detail.error = 'login control not found';
      }
    } catch (err) {
      detail.error = err?.message || String(err);
    }
    if (detail.attempted && !detail.error) setLoginSuppress('bot login started', cfg.postLoginGraceMs);
    bot.lastLoginResult = detail;
    return detail;
  }

		  async function forceLoginNow(reason = 'panel immediate login') {
		    const manualReason = String(reason || 'panel immediate login');
		    const snapshotGate = {
		      ...snapshotLoginGateStatus(),
		      blockReason: manualReason,
		      manualLoginBypass: true
		    };
		    const currentSelf = getSelf();
		    if (!(currentSelf && isAlive(currentSelf))) {
		      closeCurrentImportantSessionBeforeLogin('manual-login-before-session-end:' + manualReason);
		    }
		    const cleared = clearCurrentReloginHold(manualReason);
		    cleared.manualLoginBypass = true;
		    cleared.snapshotGate = snapshotGate;
		    if (exitAuditFlushPending()) {
		      cleared.exitAuditFlush = exitAuditFlushBlockDetail('manual-login:' + manualReason);
		      bot.exitAudit.lastManualLoginBypass = cleared.exitAuditFlush;
		      flushCombatLogs(true);
		    }
		    if (importantSessionEndFlushPending()) {
		      cleared.importantLogFlush = importantSessionEndFlushBlockDetail('manual-login:' + manualReason);
		      bot.importantLogging.lastManualLoginBypass = cleared.importantLogFlush;
		    }
	    bot.lastLoginAt = 0;
	    markManualLoginBypass(manualReason);
	    const login = await maybeStartAutoLogin(manualReason, {
	        force: true,
	        manual: true,
	        manualOverride: true,
	        ignoreSuppress: true,
	        ignoreLoginCooldown: true
	      });
    const detail = {
      at: Date.now(),
      reason: manualReason,
      cleared,
      login
    };
    bot.lastManualLoginResult = detail;
    bot.lastLoginResult = login || bot.lastLoginResult;
    bot.lastDecision = {
      kind: 'wait',
      reason: login?.attempted ? 'manual-login' : (login?.reason || 'manual-login'),
      dx: 0,
      dy: 0,
      self: getSelf() ? summarizeSelf(getSelf()) : bot.lastSelf,
      currentUserId: getCurrentUserId(),
      control: summarizeControl(),
      login,
      manualLogin: detail
    };
    updateBotPanel(bot.lastDecision);
    setTimeout(() => triggerNativeTick('manual-login', false), 0);
    return detail;
  }

`;
}

module.exports = {
  autoLoginSource
};
