'use strict';

function controlLoginSource(helpers = {}) {
  const {
    staminaExhaustedWindowLabel
  } = helpers;
  return [
    typeof staminaExhaustedWindowLabel === 'function' ? staminaExhaustedWindowLabel.toString() : '',
    String.raw`  function requestReload(reason) {
	    if (cfg.dryRun || cfg.once) return;
	    if (bot.reloadRequestedAt) return;
		    if (exitAuditFlushPending()) {
		      const blocked = exitAuditFlushBlockDetail('reload:' + (reason || ''));
		      bot.exitAudit.lastBlockedReload = blocked;
	      flushCombatLogs(true);
	      logStatus('reload blocked until exit audit logs flush: ' + (reason || ''), {
	        kind: 'wait',
	        reason: 'exit-log-flush-pending',
	        dx: 0,
	        dy: 0,
	        self: bot.lastSelf,
	        exitAuditFlush: blocked
		      });
		      return false;
		    }
		    closeCurrentImportantSessionBeforeReload(reason || 'reload');
		    if (importantSessionEndFlushPending()) {
		      const blocked = importantSessionEndFlushBlockDetail('reload:' + (reason || ''));
		      bot.importantLogging.lastBlockedReload = blocked;
		      logStatus('reload blocked until important session-end log flush: ' + (reason || ''), {
		        kind: 'wait',
		        reason: 'important-log-flush-pending',
		        dx: 0,
		        dy: 0,
		        self: bot.lastSelf,
		        importantLogFlush: blocked,
		        displayReason: '等待会话结束日志发送完成，暂不刷新'
		      });
		      return false;
		    }
		    bot.reloadRequestedAt = Date.now();
	    logStatus('reload: ' + reason);
	    location.reload();
	    return true;
	  }

	  function cloudflareErrorInfo() {
	    if (location.origin !== 'https://grasp-rat-game.h-e.top') return null;
	    const title = String(document.title || '');
	    const text = String(document.body?.innerText || '').slice(0, 5000);
	    const combined = title + '\\n' + text;
	    const isCloudflareError = /Error\\s*1033/i.test(combined)
	      || /Cloudflare\\s+Tunnel\\s+error/i.test(combined)
	      || (/Cloudflare/i.test(combined) && /unable\\s+to\\s+resolve/i.test(combined));
	    const isBunkerWebError = /BunkerWeb/i.test(combined)
	      && (/\\b403\\b/i.test(combined) || /Forbidden/i.test(combined) || /client-side\\s+error/i.test(combined) || /Access\\s+is\\s+forbidden/i.test(combined));
	    if (!isCloudflareError && !isBunkerWebError) return null;
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
	    const code = /Error\\s*1033/i.test(combined) ? '1033' : (isBunkerWebError ? '403' : '');
	    const label = isBunkerWebError ? 'BunkerWeb 403 错误页' : (code ? 'Cloudflare Error ' + code : 'Cloudflare 错误页');
	    return {
	      error: true,
	      code,
	      label,
	      provider,
	      intervalMs,
	      lastReloadAt,
	      remainingMs,
	      displayReason: label + '，每' + formatDurationMs(intervalMs) + '刷新一次' + (remainingMs > 0 ? '，下次刷新剩余' + formatDurationMs(remainingMs) : '，正在刷新')
	    };
	  }

	  function maybeReloadCloudflareError(info) {
	    if (!info || cfg.dryRun || cfg.once) return false;
	    if (Number(info.remainingMs || 0) > 0) return false;
		    if (exitAuditFlushPending()) {
		      const blocked = exitAuditFlushBlockDetail('reload:cloudflare error');
		      bot.exitAudit.lastBlockedReload = blocked;
	      flushCombatLogs(true);
	      logStatus('reload blocked until exit audit logs flush: cloudflare error', {
	        kind: 'wait',
	        reason: 'exit-log-flush-pending',
	        dx: 0,
	        dy: 0,
	        self: bot.lastSelf,
	        cloudflare: info,
	        exitAuditFlush: blocked,
	        displayReason: '等待退出日志发送完成，暂不刷新错误页'
		      });
		      return false;
		    }
		    closeCurrentImportantSessionBeforeReload('cloudflare error');
		    if (importantSessionEndFlushPending()) {
		      const blocked = importantSessionEndFlushBlockDetail('reload:cloudflare error');
		      bot.importantLogging.lastBlockedReload = blocked;
		      logStatus('reload blocked until important session-end log flush: cloudflare error', {
		        kind: 'wait',
		        reason: 'important-log-flush-pending',
		        dx: 0,
		        dy: 0,
		        self: bot.lastSelf,
		        cloudflare: info,
		        importantLogFlush: blocked,
		        displayReason: '等待会话结束日志发送完成，暂不刷新错误页'
		      });
		      return false;
		    }
		    try {
	      localStorage.setItem(CLOUDFLARE_RELOAD_KEY, String(Date.now()));
	    } catch (_) {}
	    bot.cloudflareReloadAt = Date.now();
	    logStatus('reload: cloudflare error', { kind: 'wait', reason: 'cloudflare-error-refresh', cloudflare: info, displayReason: info.displayReason });
	    location.reload();
	    return true;
	  }

		  function getCurrentUserId() {
	    return Number(localStorage.getItem('tmpGameUserId') || document.getElementById('userId')?.value || bot.control.currentUserId || 0);
	  }

	  function getSessionToken() {
	    return localStorage.getItem('tmpGameSessionToken') || '';
	  }

  function wsReadyStateNumber(value) {
    if (value === null || value === undefined || value === '') return NaN;
    const n = Number(value);
    return Number.isFinite(n) ? n : NaN;
  }

  function isWsConnectingOrOpen(value) {
    const n = wsReadyStateNumber(value);
    return n === 0 || n === 1;
  }

  function hasNativeGameSession(native = getNativeControl(), userId = getCurrentUserId()) {
    return Boolean(userId && native?.ws && (native.wsOpen || isWsConnectingOrOpen(native.wsReadyState)));
  }

	  function controlHasNativeGameSession(control) {
	    return Boolean(control?.currentUserId && (
	      control.rawWsOpen
	      || control.nativeWsOpen
	      || control.connecting
      || isWsConnectingOrOpen(control.nativeWsReadyState)
	      || isWsConnectingOrOpen(control.wsReadyState)
	    ));
	  }

	  function noSelfGameSessionExitState(control, noSelfAgeMs = 0) {
	    const userId = Number(control?.currentUserId || getCurrentUserId() || 0);
	    const loginRequired = Boolean(hasLoginRequiredText() || findLoginControl());
	    const hasSessionEvidence = Boolean(userId && !loginRequired && (
	      control?.hasToken
	      || controlHasNativeGameSession(control)
	      || control?.transport === 'native-page'
	      || Number.isFinite(wsReadyStateNumber(control?.nativeWsReadyState))
	      || Number.isFinite(wsReadyStateNumber(control?.wsReadyState))
	    ));
	    const reconnectChurn = Boolean(control?.nativeReconnectChurn);
	    const ageMs = Math.max(0, Math.round(Number(noSelfAgeMs || 0) || 0));
	    const leaveMs = Math.max(0, Number(cfg.gameSessionNoSelfLeaveMs || 0) || 0);
	    const timedOut = Boolean(leaveMs && ageMs >= leaveMs);
	    const wsOfflineish = Boolean(
	      !control?.wsOpen && (
	        control?.connecting
	        || isOfflineishWsReadyState(control?.nativeWsReadyState)
	        || isOfflineishWsReadyState(control?.wsReadyState)
	        || control?.rawWsOpen === false
	      )
	    );
	    const shouldLeave = Boolean(hasSessionEvidence && (reconnectChurn || timedOut));
	    const reason = reconnectChurn
	      ? 'websocket reconnect churn missing self'
	      : 'game session missing self';
	    return {
	      active: hasSessionEvidence,
	      shouldLeave,
	      reason,
	      displayReason: reconnectChurn
	        ? '已登录但自身实体不可见，网络连接反复重连，正在退出'
	        : '已登录但自身实体长期不可见，正在退出',
	      userId: userId || null,
	      ageMs,
	      leaveMs,
	      timedOut,
	      reconnectChurn: reconnectChurn ? {
	        count: Number(control?.nativeReconnectEventCount || 0),
	        windowMs: Number(control?.nativeReconnectWindowMs || cfg.offlineReconnectChurnWindowMs || 0)
	      } : null,
	      wsOfflineish,
	      loginRequired,
	      control: control ? {
	        wsOpen: Boolean(control.wsOpen),
	        rawWsOpen: Boolean(control.rawWsOpen),
	        connecting: Boolean(control.connecting),
	        wsReadyState: control.wsReadyState ?? null,
	        nativeWsReadyState: control.nativeWsReadyState ?? null,
	        hasToken: Boolean(control.hasToken),
	        transport: control.transport || ''
	      } : null
	    };
		  }

			  function isVisible(el) {
    if (!el) return false;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  }

	  function controlText(el) {
	    return (el?.innerText || el?.value || el?.getAttribute?.('aria-label') || el?.getAttribute?.('title') || '').trim();
	  }

  function describeControl(el) {
    if (!el) return '';
    if (el.id) return '#' + el.id;
    const text = controlText(el);
    if (text) return text;
    return String(el.tagName || '').toLowerCase();
  }

  function requestNativeViewportResize(reason = 'bot') {
    try {
      window.dispatchEvent(new Event('resize'));
      bot.lastNativeViewportResizeRequest = {
        at: Date.now(),
        reason: String(reason || 'bot')
      };
      return true;
    } catch (err) {
      bot.lastNativeViewportResizeRequest = {
        at: Date.now(),
        reason: String(reason || 'bot'),
        error: err?.message || String(err)
      };
      return false;
    }
  }

  function findZoomOutControl() {
    const direct = document.querySelector('#zoomOutBtn, [data-testid="zoom-out"], [aria-label="zoom out"], [aria-label="Zoom out"]');
    if (direct) return direct;
    const candidates = Array.from(document.querySelectorAll('button, input[type="button"], [role="button"]'));
    return candidates.find(el => {
      const text = controlText(el);
      return /zoom\s*out|缩小|缩放-|地图-|视图-/i.test(text);
    }) || null;
  }

  function clickZoomOutControl() {
    const control = findZoomOutControl();
    if (!control) return { clicked: false, error: 'zoom-out control not found' };
    if (control.disabled) return { clicked: false, error: 'zoom-out control disabled', control: describeControl(control) };
    try {
      control.click();
      return { clicked: true, control: describeControl(control) };
    } catch (err) {
      return { clicked: false, error: err?.message || String(err), control: describeControl(control) };
    }
  }

  function postLoginZoomSessionKey(selfSummary) {
    const userId = selfSummary?.user_id ?? getCurrentUserId() ?? '';
    const token = getSessionToken();
    if (token) return String(userId) + ':token:' + String(token).slice(0, 24);
    return String(userId) + ':generation:' + Number(bot.postLoginZoom?.generation || 0);
  }

  function noteSelfUnavailableForPostLoginZoom() {
    const state = bot.postLoginZoom;
    if (!state) return;
    const t = Date.now();
    if (!state.missingSince) state.missingSince = t;
    const missingMs = Math.max(0, t - Number(state.missingSince || t));
    if (missingMs < Math.max(0, Number(cfg.postLoginZoomArmMissingMs || 0))) return;
    if (!state.armed) {
      state.generation = Number(state.generation || 0) + 1;
      state.armed = true;
      state.scheduledKey = '';
    }
  }

  function schedulePostLoginZoomOut(selfSummary) {
    const state = bot.postLoginZoom;
    if (!state) return null;
    const t = Date.now();
    state.lastSeenSelfAt = t;
    state.missingSince = 0;
    const clicks = Math.max(0, Math.round(Number(cfg.postLoginZoomOutClicks || 0)));
    if (!clicks || !state.armed) return null;
    const key = postLoginZoomSessionKey(selfSummary);
    if (!key || state.appliedKey === key || state.scheduledKey === key) return null;
    state.armed = false;
    state.appliedKey = key;
    state.scheduledKey = key;
    state.scheduledAt = t;
    state.lastResult = {
      key,
      scheduledAt: t,
      startDelayMs: Math.max(0, Number(cfg.postLoginZoomStartDelayMs || 0) || 0),
      requestedClicks: clicks,
      completedClicks: 0,
      failedClicks: 0,
      lastError: ''
    };
    requestNativeViewportResize('post-login-zoom-schedule');
    setTimeout(() => requestNativeViewportResize('post-login-zoom-before-clicks'), state.lastResult.startDelayMs);
    const intervalMs = Math.max(0, Number(cfg.postLoginZoomOutIntervalMs || 0));
    for (let index = 0; index < clicks; index += 1) {
      setTimeout(() => {
        if (window[BOT_KEY] !== bot || !bot.running) return;
        requestNativeViewportResize('post-login-zoom-click-' + (index + 1));
        const result = clickZoomOutControl();
        const latest = state.lastResult || {};
        latest.completedClicks = Number(latest.completedClicks || 0) + (result.clicked ? 1 : 0);
        latest.failedClicks = Number(latest.failedClicks || 0) + (result.clicked ? 0 : 1);
        latest.lastError = result.error || '';
        latest.control = result.control || latest.control || '';
        latest.finishedAt = Date.now();
        state.lastResult = latest;
        requestNativeViewportResize('post-login-zoom-after-click-' + (index + 1));
      }, state.lastResult.startDelayMs + index * intervalMs);
    }
    return state.lastResult;
  }

	  function findLoginControl() {
    const direct = document.querySelector('#joinBtn, #loginBtn, [data-testid="login"], [data-testid="join"]');
    if (direct && isVisible(direct)) return direct;
    const candidates = Array.from(document.querySelectorAll('a, button, input[type="submit"], input[type="button"], [role="button"]'))
      .filter(isVisible);
    return candidates.find(el => {
      const text = controlText(el);
      if (/leave|logout|sign out|cancel|退出|离开|取消/i.test(text)) return false;
      return /linuxdo|login|sign in|oauth|authorize|join|start|play|登录|登陆|授权|加入|进入|开始/i.test(text);
    }) || null;
  }

  function hasLoginRequiredText() {
    const text = (document.body?.innerText || '').slice(0, 5000);
    return /login required|please login|please sign in|not logged in|未登录|请先登录|请登录|需要登录/i.test(text);
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

	  function snapshotLoginGateStatus(t = Date.now()) {
	    const state = normalizeLoginSnapshotGateState(bot.loginSnapshotGate);
	    const required = loginSnapshotSuccessRequired();
	    state.required = required;
	    if (state.streak > required) state.streak = required;
	    const lastSampleAt = Number(state.lastSampleAt || state.lastOkAt || state.lastErrorAt || 0) || 0;
	    return {
	      ...state,
	      lastSampleAt,
	      satisfied: required <= 0 || state.streak >= required,
	      remaining: Math.max(0, required - state.streak),
	      lastOkAgeMs: state.lastOkAt ? Math.max(0, Math.round(t - Number(state.lastOkAt || t))) : null,
	      lastErrorAgeMs: state.lastErrorAt ? Math.max(0, Math.round(t - Number(state.lastErrorAt || t))) : null,
	      lastSampleAgeMs: lastSampleAt ? Math.max(0, Math.round(t - lastSampleAt)) : null
	    };
	  }

	  function resetLoginSnapshotGate(reason = 'exit') {
	    const t = Date.now();
	    bot.loginSnapshotGate = {
	      ...normalizeLoginSnapshotGateState(bot.loginSnapshotGate),
	      streak: 0,
	      required: loginSnapshotSuccessRequired(),
	      lastError: '',
	      resetAt: t,
	      resetReason: String(reason || 'exit')
	    };
	    return snapshotLoginGateStatus(t);
	  }

	  function noteLoginSnapshotProbe(success, detail = {}) {
	    const t = Date.now();
	    const required = loginSnapshotSuccessRequired();
	    const state = normalizeLoginSnapshotGateState(bot.loginSnapshotGate);
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
	    return snapshotLoginGateStatus(t);
	  }

	  async function ensureLoginSnapshotGate(reason = 'login') {
	    let status = snapshotLoginGateStatus();
	    if (status.satisfied) return status;
	    const minProbeMs = Math.max(250, Number(cfg.loginSnapshotProbeMinMs ?? cfg.globalRefreshMs ?? 5000) || 5000);
	    const sampleAge = Number(status.lastSampleAgeMs ?? Infinity);
	    if (!Number.isFinite(sampleAge) || sampleAge >= minProbeMs) {
	      try {
	        await refreshGlobalState(true);
	      } catch (err) {
	        const message = err?.message || String(err);
	        bot.globalState.error = message;
	        noteLoginSnapshotProbe(false, { error: message });
	      }
	      status = snapshotLoginGateStatus();
	    }
	    status.blockReason = String(reason || 'login');
	    return status;
	  }

	  function loginSnapshotGateDisplayReason(snapshotGate = snapshotLoginGateStatus()) {
	    const gate = snapshotGate || snapshotLoginGateStatus();
	    if (gate.satisfied) return '';
	    const pieces = [
	      '等待snapshot连续成功',
	      String(gate.streak || 0) + '/' + String(gate.required || 0)
	    ];
	    if (gate.lastError) pieces.push('最近错误：' + gate.lastError);
	    return pieces.join('，');
		  }

	  function clearExitHoldDetail(detail, reason, t = Date.now()) {
    if (!detail || typeof detail !== 'object') return null;
    const reloginUntil = Number(detail.reloginUntil || 0) || 0;
    const previousHoldRemainingMs = Math.max(0, Math.round(reloginUntil - t));
    if (reloginUntil && !detail.manualLoginBypassPreviousReloginUntil) {
      detail.manualLoginBypassPreviousReloginUntil = reloginUntil;
    }
    if (previousHoldRemainingMs && !detail.manualLoginBypassPreviousHoldMs) {
      detail.manualLoginBypassPreviousHoldMs = previousHoldRemainingMs;
    }
    detail.manualLoginBypassAt = t;
    detail.manualLoginBypassReason = String(reason || 'manual force login');
    detail.reloginUntil = 0;
    detail.holdRemainingMs = 0;
    detail.reloginDelayMs = 0;
    detail.reloginHpDelayMs = 0;
    detail.reloginMinimumDelayMs = 0;
    finalizeLeaveDisplayReason(detail);
    return detail;
  }

  function clearCurrentReloginHold(reason = 'manual force login') {
    const t = Date.now();
    const enemyDetail = activeEnemyLeaveDetail(t);
    const offlineDetail = activeOfflineLeaveDetail(t);
    let suppressUntil = 0;
    let suppressReason = '';
    try {
      suppressUntil = Number(localStorage.getItem(LOGIN_SUPPRESS_KEY) || 0) || 0;
      suppressReason = String(localStorage.getItem(LOGIN_SUPPRESS_REASON_KEY) || '');
      localStorage.removeItem(LOGIN_SUPPRESS_KEY);
      localStorage.removeItem(LOGIN_SUPPRESS_REASON_KEY);
    } catch (_) {}
    const cleared = {
      at: t,
      reason: String(reason || 'manual force login'),
      suppressReason,
      suppressUntil,
      suppressRemainingMs: Math.max(0, Math.round(suppressUntil - t)),
      enemyHoldRemainingMs: Math.max(
        0,
        Math.round(Number(enemyDetail?.holdRemainingMs || 0)),
        Math.round(Number(bot.pursuitReloginUntil || 0) - t)
      ),
      offlineHoldRemainingMs: Math.max(
        0,
        Math.round(Number(offlineDetail?.holdRemainingMs || 0)),
        Math.round(Number(bot.offlineReloginUntil || 0) - t)
      )
	    };
	    bot.pursuitReloginUntil = 0;
	    bot.offlineReloginUntil = 0;
	    bot.lastEnemyLeaveWaitMs = 0;
	    bot.lastOfflineLeaveWaitMs = 0;
	    bot.lastEnemyLeaveResult = clearExitHoldDetail(bot.lastEnemyLeaveResult, reason, t);
	    bot.lastPursuitLeaveResult = clearExitHoldDetail(bot.lastPursuitLeaveResult, reason, t);
	    bot.lastCombatLeaveResult = clearExitHoldDetail(bot.lastCombatLeaveResult, reason, t);
    bot.lastInjuryLeaveResult = clearExitHoldDetail(bot.lastInjuryLeaveResult, reason, t);
    bot.lastOfflineLeaveResult = clearExitHoldDetail(bot.lastOfflineLeaveResult, reason, t);
    bot.pendingExit = null;
    clearPersistentExitState(ENEMY_LEAVE_STATE_KEY);
    clearPersistentExitState(OFFLINE_LEAVE_STATE_KEY);
    return cleared;
  }

  function readPauseReason() {
    let reason = '';
    try {
      reason = String(localStorage.getItem(PAUSE_REASON_KEY) || '');
    } catch (_) {}
    return String(window.__graspRatBotPauseReason || reason || '');
  }

  function syncPausedFromPage(stopOnPause = true) {
    let localPaused = false;
    try {
      localPaused = localStorage.getItem(PAUSED_KEY) === 'true';
    } catch (_) {}
    const paused = Boolean(window.__graspRatBotPaused === true || localPaused);
    if (paused !== bot.paused) {
      bot.paused = paused;
      bot.pauseChangedAt = Date.now();
      if (paused && stopOnPause) stopMotionSafely('paused');
    }
    bot.pauseReason = paused ? (readPauseReason() || bot.pauseReason || 'manual') : '';
    return paused;
  }

  function randomBetween(min, max) {
    const lo = Math.max(0, Number(min) || 0);
    const hi = Math.max(lo, Number(max) || lo);
    return Math.round(lo + Math.random() * (hi - lo));
  }

	  function hpInfoForRelogin(selfLike, detail) {
    const candidates = [
      selfLike,
      detail?.self,
      detail?.injury?.self,
      detail?.injury,
      detail?.combat,
      detail?.combatState
    ].filter(Boolean);
    let hp = NaN;
    let maxHp = NaN;
    for (const item of candidates) {
      if (!Number.isFinite(hp)) hp = Number(item.currentHp ?? item.hp ?? item.selfHp ?? NaN);
      if (!Number.isFinite(maxHp)) maxHp = Number(item.maxHp ?? item.max_hp ?? item.hpMax ?? item.maxHealth ?? NaN);
      if (Number.isFinite(hp) && Number.isFinite(maxHp)) break;
    }
    if (!Number.isFinite(maxHp) || maxHp <= 0) maxHp = 100;
    if (!Number.isFinite(hp)) hp = maxHp;
    hp = clamp(hp, 0, maxHp);
	    return {
	      hp,
	      maxHp,
	      ratio: maxHp > 0 ? clamp(hp / maxHp, 0, 1) : 1
	    };
	  }

`
  ].join('\n');
}

module.exports = {
  controlLoginSource
};
