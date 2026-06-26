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

		  function requestLeaveConfirmationReload(reason, pending = bot.pendingExit) {
		    if (cfg.dryRun || cfg.once) return false;
		    if (!pending) return false;
		    if (bot.reloadRequestedAt) return false;
		    if (exitAuditFlushPending()) {
		      const blocked = exitAuditFlushBlockDetail('leave-confirmation-reload:' + (reason || ''));
		      bot.exitAudit.lastBlockedReload = blocked;
		      const reloadConfirmation = normalizePendingExitReloadConfirmation(pending.reloadConfirmation, pending, Date.now());
		      if (reloadConfirmation) {
		        reloadConfirmation.lastBlocked = blocked;
		        pending.reloadConfirmation = reloadConfirmation;
		        if (pending.lastResult && typeof pending.lastResult === 'object') pending.lastResult.reloadConfirmation = reloadConfirmation;
		        writePersistentPendingExitState(pending);
		      }
		      flushCombatLogs(true);
		      logStatus('leave confirmation reload blocked until exit audit logs flush: ' + (reason || ''), {
		        kind: 'wait',
		        reason: 'exit-log-flush-pending',
		        dx: 0,
		        dy: 0,
		        self: bot.lastSelf,
		        pendingExit: summarizePendingExit(pending),
		        exitAuditFlush: blocked,
		        displayReason: '等待退出日志发送完成，暂不刷新确认退出'
		      });
		      return false;
		    }
		    try {
		      persistCombatLogPendingEntries();
		      flushCombatLogs(true);
		    } catch (_) {}
		    const t = Date.now();
		    const previousRequestedAt = Number(pending.reloadConfirmation?.requestedAt || 0) || 0;
		    const reloadConfirmation = normalizePendingExitReloadConfirmation(pending.reloadConfirmation, pending, t) || {
		      required: true,
		      reason: String(reason || 'leave-success'),
		      leaveSucceededAt: Number(pending.lastResult?.lastLeaveRequest?.completedAt || pending.lastResult?.at || t) || t,
		      requestId: String(pending.lastResult?.lastLeaveRequest?.requestId || ''),
		      requestedAt: 0,
		      reloadedAt: 0,
		      restoredAfterReload: false,
		      count: 0,
		      lastResult: null,
		      lastBlocked: null
		    };
		    reloadConfirmation.requestedAt = reloadConfirmation.requestedAt || t;
		    reloadConfirmation.count = Math.max(1, Math.round(Number(reloadConfirmation.count || 0) || 0) + (previousRequestedAt ? 0 : 1));
		    pending.reloadConfirmation = reloadConfirmation;
		    pending.updatedAt = t;
		    if (pending.lastResult && typeof pending.lastResult === 'object') {
		      pending.lastResult.reloadConfirmation = reloadConfirmation;
		      pending.lastResult.exitPending = true;
		      pending.lastResult.exitConfirmed = false;
		    }
		    writePersistentPendingExitState(pending);
		    bot.reloadRequestedAt = t;
		    logStatus('leave confirmation reload: ' + reason, {
		      kind: 'wait',
		      reason: 'leave-success-refresh-confirmation',
		      pendingExit: summarizePendingExit(pending),
		      reloadConfirmation,
		      displayReason: 'leave接口已返回成功，刷新页面确认服务端在线状态'
		    });
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

  function snapshotSelfPresenceState(userId = getCurrentUserId()) {
    const id = Number(userId || 0) || 0;
    const snapshotAgeMs = typeof snapshotDataAgeMs === 'function'
      ? snapshotDataAgeMs()
      : (bot.globalState.snapshotRefreshedAt ? Math.max(0, Date.now() - Number(bot.globalState.snapshotRefreshedAt || 0)) : Infinity);
    const fresh = typeof snapshotSelfFreshEnough === 'function'
      ? snapshotSelfFreshEnough()
      : snapshotAgeMs <= Number(cfg.snapshotSelfStaleMs || 0);
    const entities = Array.isArray(bot.globalState.entities) ? bot.globalState.entities : [];
    const entity = id && fresh
      ? entities.find(item => Number(item?.user_id ?? item?.userId ?? item?.id ?? NaN) === id) || null
      : null;
    const present = Boolean(entity && isAlive(entity));
    return {
      known: Boolean(id && fresh),
      present,
      source: 'snapshot',
      userId: id || null,
      fresh,
      snapshotAgeMs: Number.isFinite(snapshotAgeMs) ? Math.max(0, Math.round(snapshotAgeMs)) : null,
      self: entity ? summarizeSelf(entity) : null
    };
  }

  function controlHasAuthoritativeSessionMismatch(control, snapshotSelf = null) {
    if (!control) return false;
    if (Boolean(control.hasToken)) return false;
    if (Boolean(hasLoginRequiredText() || findLoginControl())) return false;
    const snapshotSelfState = snapshotSelf || snapshotSelfPresenceState(control?.currentUserId || getCurrentUserId());
    return Boolean(controlHasNativeGameSession(control) || snapshotSelfState?.present);
  }

  function noSelfGameSessionExitState(control, noSelfAgeMs = 0) {
    const userId = Number(control?.currentUserId || getCurrentUserId() || 0);
    const loginRequired = Boolean(hasLoginRequiredText() || findLoginControl());
    const snapshotSelf = snapshotSelfPresenceState(userId);
    const hasSessionEvidence = Boolean(userId && !loginRequired && (
	      control?.hasToken
	      || controlHasNativeGameSession(control)
	      || snapshotSelf.present
	      || control?.transport === 'native-page'
      || Number.isFinite(wsReadyStateNumber(control?.nativeWsReadyState))
      || Number.isFinite(wsReadyStateNumber(control?.wsReadyState))
    ));
    const reconnectChurn = Boolean(control?.nativeReconnectChurn);
    const sessionMismatch = controlHasAuthoritativeSessionMismatch(control, snapshotSelf);
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
    const mismatchLeaveMs = Math.max(
      5000,
      Math.min(
        leaveMs || 30000,
        Math.max(5000, Number(cfg.loginCooldownMs || 5000))
      )
    );
    const mismatchTimedOut = Boolean(sessionMismatch && ageMs >= mismatchLeaveMs);
    const shouldLeave = Boolean(hasSessionEvidence && (reconnectChurn || timedOut || mismatchTimedOut));
    const reason = reconnectChurn
      ? 'websocket reconnect churn missing self'
      : (mismatchTimedOut ? 'game session auth mismatch missing self' : 'game session missing self');
    return {
      active: hasSessionEvidence,
      shouldLeave,
      reason,
      displayReason: reconnectChurn
        ? '已登录但自身实体不可见，网络连接反复重连，正在退出'
        : (mismatchTimedOut ? '界面显示未登录但原生会话仍在线，自身实体不可见，正在重置会话' : '已登录但自身实体长期不可见，正在退出'),
      userId: userId || null,
      ageMs,
      leaveMs,
      timedOut,
      sessionMismatch,
      snapshotSelf,
      mismatchLeaveMs,
      mismatchTimedOut,
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

  function recentUnsafeExitContext(detail, t = Date.now(), maxAgeMs = unsafeExitReloginMinDelayMs()) {
    if (!detail || typeof detail !== 'object') return null;
    const at = Number(
      detail.confirmedAt
        || detail.completedAt
        || detail.exitTriggeredAt
        || detail.leaveRequestSentAt
        || detail.at
        || 0
    ) || 0;
    const ageMs = at ? Math.max(0, Math.round(t - at)) : Infinity;
    if (!(ageMs <= Math.max(1000, Number(maxAgeMs || 0) || 0))) return null;
    const text = [
      detail.reason,
      detail.summary,
      detail.displayReason,
      detail.enemyLeaveReason,
      detail.loginSuppressReason,
      detail.pendingLoginSuppressReason
    ].map(value => String(value || '').toLowerCase()).join(' ');
    const offlineSafety = detail.offlineSafety || null;
    const unsafe = Boolean(
      offlineSafety?.unsafe
        || offlineSafety?.reconnectChurn
        || offlineSafety?.noSelfGameSession
        || /websocket|offline|disconnect|reconnect|server position|missing self|stamina|pending unsafe/i.test(text)
    );
    if (!unsafe) return null;
    return {
      reason: String(detail.reason || detail.summary || detail.displayReason || 'recent unsafe exit'),
      ageMs,
      at
    };
  }

  function firstRecentUnsafeExitContext(details, t = Date.now(), maxAgeMs = unsafeExitReloginMinDelayMs()) {
    for (const detail of Array.isArray(details) ? details : [details]) {
      const context = recentUnsafeExitContext(detail, t, maxAgeMs);
      if (context) return context;
    }
    return null;
  }

  function liveSessionMismatchTakeoverState(control, noSelfExit) {
    const t = Date.now();
    const blockedBy = [];
    const userId = Number(control?.currentUserId || getCurrentUserId() || 0) || 0;
    const hasToken = Boolean(control?.hasToken || getSessionToken());
    const loginRequired = Boolean(hasLoginRequiredText() || findLoginControl());
    const nativeWsOpenOrConnecting = Boolean(
      control?.rawWsOpen
        || control?.nativeWsOpen
        || control?.connecting
        || isWsConnectingOrOpen(control?.nativeWsReadyState)
        || isWsConnectingOrOpen(control?.wsReadyState)
    );
    const snapshotSelf = noSelfExit?.snapshotSelf || snapshotSelfPresenceState(userId);
    const liveSessionEvidence = Boolean(nativeWsOpenOrConnecting || snapshotSelf.present);
    const reconnectChurn = Boolean(noSelfExit?.reconnectChurn || control?.nativeReconnectChurn);
    const wsOfflineish = Boolean(noSelfExit?.wsOfflineish);
    const suppressRemainingMs = loginSuppressRemainingMs();
    let suppressReason = '';
    try {
      suppressReason = String(localStorage.getItem(LOGIN_SUPPRESS_REASON_KEY) || '');
    } catch (_) {}
    const exitMotionLockRemainingMs = exitMotionStopLockRemainingMs(t);
    const enemyHoldRemainingMs = enemyReloginHoldRemainingMs();
    const offlineHoldRemainingMs = offlineReloginHoldRemainingMs();
    const gate = snapshotLoginGateStatus(t);
    const resetReason = String(gate?.resetReason || '');
    const exitGateReset = Boolean(
      !gate.satisfied
        && (resetReason.includes('exit-trigger:') || resetReason.includes('exit-confirmed:'))
    );
    const recentWindowMs = Math.max(
      unsafeExitReloginMinDelayMs(),
      Number(cfg.loginCooldownMs || 0) || 0,
      60000
    );
    const recentOfflineExit = recentUnsafeExitContext(bot.lastOfflineLeaveResult, t, recentWindowMs);
    const recentEnemyExit = firstRecentUnsafeExitContext([
      bot.lastEnemyLeaveResult,
      bot.lastCombatLeaveResult,
      bot.lastPursuitLeaveResult,
      bot.lastInjuryLeaveResult
    ], t, recentWindowMs);
    const offlineContextAgeMs = bot.offlineSince ? Math.max(0, Math.round(t - Number(bot.offlineSince || t))) : 0;
    const recentOfflineContext = Boolean(bot.offlineSince && offlineContextAgeMs <= recentWindowMs);

    if (!noSelfExit?.sessionMismatch || !noSelfExit?.mismatchTimedOut) blockedBy.push('session-mismatch-not-timed-out');
    if (!controlHasAuthoritativeSessionMismatch(control)) blockedBy.push('not-authoritative-session-mismatch');
    if (!userId) blockedBy.push('missing-user-id');
    if (hasToken) blockedBy.push('token-still-present');
    if (loginRequired) blockedBy.push('login-required-ui-visible');
    if (!liveSessionEvidence) blockedBy.push('live-session-evidence-missing');
    if (reconnectChurn) blockedBy.push('native-reconnect-churn');
    if (wsOfflineish) blockedBy.push('ws-offlineish');
    if (bot.pendingExit) blockedBy.push('pending-exit-active');
    if (exitMotionLockRemainingMs > 0) blockedBy.push('exit-motion-lock');
    if (enemyHoldRemainingMs > 0) blockedBy.push('enemy-relogin-hold');
    if (offlineHoldRemainingMs > 0) blockedBy.push('offline-relogin-hold');
    if (suppressRemainingMs > 0) blockedBy.push('login-suppress-active');
    if (exitGateReset) blockedBy.push('exit-snapshot-gate-reset');
    if (recentOfflineContext) blockedBy.push('recent-offline-context');
    if (recentOfflineExit) blockedBy.push('recent-offline-exit');
    if (recentEnemyExit) blockedBy.push('recent-enemy-exit');

    return {
      allowed: blockedBy.length === 0,
      reason: blockedBy[0] || 'live-session-mismatch-takeover',
      blockedBy,
      userId: userId || null,
      noSelfAgeMs: Math.max(0, Math.round(Number(noSelfExit?.ageMs || 0) || 0)),
      nativeWsOpenOrConnecting,
      liveSessionEvidence,
      snapshotSelf,
      reconnectChurn,
      wsOfflineish,
      pendingExit: bot.pendingExit ? summarizePendingExit(bot.pendingExit) : null,
      suppressRemainingMs: Math.max(0, Math.round(suppressRemainingMs)),
      suppressReason,
      enemyHoldRemainingMs,
      offlineHoldRemainingMs,
      exitMotionLockRemainingMs,
      snapshotGate: {
        satisfied: Boolean(gate.satisfied),
        streak: Number(gate.streak || 0),
        required: Number(gate.required || 0),
        resetReason,
        exitGateReset,
        pointSafety: gate.pointSafety ? {
          hasPoint: Boolean(gate.pointSafety.hasPoint),
          satisfied: Boolean(gate.pointSafety.satisfied),
          streak: Number(gate.pointSafety.streak || 0),
          required: Number(gate.pointSafety.required || 0)
        } : null
      },
      recentOfflineContext: recentOfflineContext ? { ageMs: offlineContextAgeMs } : null,
      recentOfflineExit,
      recentEnemyExit,
      control: control ? {
        rawWsOpen: Boolean(control.rawWsOpen),
        nativeWsOpen: Boolean(control.nativeWsOpen),
        connecting: Boolean(control.connecting),
        wsReadyState: control.wsReadyState ?? null,
        nativeWsReadyState: control.nativeWsReadyState ?? null,
        transport: control.transport || '',
        hasToken: Boolean(control.hasToken)
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

  function loginPointSafetySuccessRequired() {
    return Math.max(0, Math.round(Number(cfg.loginPointSafetySuccessRequired ?? 12) || 12));
  }

  function loginPointSafetyRadius() {
    return Math.max(0, Number(cfg.loginPointSafetyRadius ?? 16000) || 16000);
  }

  function loginPointSafetyDayKey(t = Date.now()) {
    const d = new Date(t);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
  }

  function finiteNumber(...values) {
    for (const value of values) {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
    return NaN;
  }

  function loginPointEntityKey(entity) {
    const id = entity?.user_id ?? entity?.userId ?? entity?.id;
    if (id !== undefined && id !== null && id !== '') return 'id:' + String(id);
    const name = String(entity?.name || '').trim();
    return name ? 'name:' + name : '';
  }

  function loginPointActorSummary(entity, extra = {}) {
    if (!entity || typeof entity !== 'object') return null;
    const key = loginPointEntityKey(entity);
    if (!key) return null;
    const rawId = entity.user_id ?? entity.userId ?? entity.id;
    return {
      key,
      id: rawId === undefined || rawId === null || rawId === '' ? '' : String(rawId),
      name: String(entity.name || ''),
      x: Number.isFinite(Number(entity.x)) ? Math.round(Number(entity.x)) : null,
      y: Number.isFinite(Number(entity.y)) ? Math.round(Number(entity.y)) : null,
      drop: Math.max(0, Math.round(dropValue(entity))),
      mode: String(entity.current_join_mode || entity.mode || ''),
      ...extra
    };
  }

  function normalizeLoginPointSafetyState(state = null, t = Date.now()) {
    const source = state && typeof state === 'object' ? state : {};
    const required = loginPointSafetySuccessRequired();
    const point = source.point && Number.isFinite(Number(source.point.x)) && Number.isFinite(Number(source.point.y))
      ? {
        x: Number(source.point.x),
        y: Number(source.point.y),
        userId: source.point.userId ?? source.point.id ?? null,
        at: Number(source.point.at || 0) || 0,
        tick: Number(source.point.tick || 0) || 0,
        loginAt: Number(source.point.loginAt || 0) || 0,
        source: String(source.point.source || '')
      }
      : null;
    const dayKey = loginPointSafetyDayKey(t);
    const damagedBy = source.damagedBy && source.damagedBy.dayKey === dayKey
      ? {
        dayKey,
        actors: Array.isArray(source.damagedBy.actors)
          ? source.damagedBy.actors.filter(actor => actor && actor.key).slice(-80)
          : []
      }
      : { dayKey, actors: [] };
    const movement = source.movement && typeof source.movement === 'object' ? { ...source.movement } : {};
    return {
      point,
      streak: Math.max(0, Math.round(Number(source.streak || 0) || 0)),
      required,
      radius: loginPointSafetyRadius(),
      lastSampleAt: Number(source.lastSampleAt || source.lastOkAt || source.lastUnsafeAt || source.lastErrorAt || 0) || 0,
      lastOkAt: Number(source.lastOkAt || 0) || 0,
      lastUnsafeAt: Number(source.lastUnsafeAt || 0) || 0,
      lastErrorAt: Number(source.lastErrorAt || 0) || 0,
      lastError: String(source.lastError || ''),
      lastTick: Number(source.lastTick || 0) || 0,
      lastDanger: source.lastDanger && typeof source.lastDanger === 'object' ? { ...source.lastDanger } : null,
      movement,
      damagedBy
    };
  }

  function loginPointHasPoint(state) {
    return Boolean(
      state?.point
        && Number.isFinite(Number(state.point.x))
        && Number.isFinite(Number(state.point.y))
    );
  }

  function loginPointPointStamp(state) {
    if (!loginPointHasPoint(state)) return 0;
    return Math.max(Number(state.point.at || 0) || 0, Number(state.point.loginAt || 0) || 0);
  }

  function mergeLoginPointSafetyState(memoryState, storedState, t = Date.now()) {
    const memory = memoryState && typeof memoryState === 'object'
      ? normalizeLoginPointSafetyState(memoryState, t)
      : null;
    const stored = storedState && typeof storedState === 'object'
      ? normalizeLoginPointSafetyState(storedState, t)
      : null;
    if (!memory) return stored || normalizeLoginPointSafetyState(null, t);
    if (!stored) return memory;
    const memoryHasPoint = loginPointHasPoint(memory);
    const storedHasPoint = loginPointHasPoint(stored);
    if (storedHasPoint && (!memoryHasPoint || loginPointPointStamp(stored) > loginPointPointStamp(memory))) {
      return stored;
    }
    return memory;
  }

  function readLoginPointSafetyState(t = Date.now()) {
    let stored = null;
    try {
      stored = JSON.parse(localStorage.getItem(LOGIN_POINT_SAFETY_KEY) || 'null');
    } catch (_) {
      stored = null;
    }
    const state = mergeLoginPointSafetyState(bot.loginPointSafety, stored, t);
    bot.loginPointSafety = state;
    return state;
  }

  function writeLoginPointSafetyState(state) {
    bot.loginPointSafety = state;
    try {
      localStorage.setItem(LOGIN_POINT_SAFETY_KEY, JSON.stringify(state));
    } catch (_) {}
    return state;
  }

  function loginPointDamageActorKeys(state) {
    return new Set((state?.damagedBy?.actors || []).map(actor => String(actor.key || '')).filter(Boolean));
  }

  function loginPointEntityMoved(state, entity, t) {
    const key = loginPointEntityKey(entity);
    if (!key) return false;
    const x = Number(entity.x);
    const y = Number(entity.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    const threshold = Math.max(0, Number(cfg.loginPointSafetyMoveThreshold ?? 500) || 500);
    const previous = state.movement?.[key] || null;
    let moved = false;
    if (previous && Number.isFinite(Number(previous.x)) && Number.isFinite(Number(previous.y))) {
      moved = Math.hypot(x - Number(previous.x), y - Number(previous.y)) >= threshold;
    }
    if (!state.movement || typeof state.movement !== 'object') state.movement = {};
    state.movement[key] = {
      x,
      y,
      at: t,
      movedAt: moved ? t : Number(previous?.movedAt || 0) || 0
    };
    const entries = Object.entries(state.movement)
      .filter(([, item]) => t - Number(item?.at || 0) <= 10 * 60 * 1000)
      .slice(-300);
    state.movement = Object.fromEntries(entries);
    return moved || Boolean(state.movement[key].movedAt && t - Number(state.movement[key].movedAt || 0) <= 10 * 60 * 1000);
  }

  function loginPointEntityStaminaUnsafe(entity) {
    const remaining = finiteNumber(entity?.stamina_5s_remaining_milli, entity?.stamina5s);
    const limit = finiteNumber(entity?.stamina_5s_limit_milli, entity?.stamina5sLimit, 10000);
    if (!Number.isFinite(remaining) || !Number.isFinite(limit) || limit <= 0) return false;
    const ratio = Math.max(0, Math.min(1, Number(cfg.loginPointSafetyStaminaFullRatio ?? 0.98) || 0.98));
    return remaining < limit * ratio;
  }

  function loginPointDangerReason(state, entity, moved) {
    if (!entity || typeof entity !== 'object') return '';
    const damagedKeys = loginPointDamageActorKeys(state);
    const key = loginPointEntityKey(entity);
    if (key && damagedKeys.has(key)) return 'damaged-self-today';
    const minDrop = Math.max(0, Number(cfg.loginPointSafetyDangerDropMin ?? 2) || 2);
    if (dropValue(entity) >= minDrop) return 'drop';
    if (isJoinModeActive(entity)) return 'active-mode';
    if (moved) return 'recent-movement';
    if (loginPointEntityStaminaUnsafe(entity)) return 'stamina-not-full';
    if (isFiringEntity(entity)) return 'firing';
    return '';
  }

  function evaluateLoginPointSafety(state, detail = {}, t = Date.now()) {
    if (!state.point) return { safe: true, reason: 'no-login-point', danger: null };
    const entities = Array.isArray(detail.entities) ? detail.entities : bot.globalState.entities;
    if (!Array.isArray(entities)) {
      return { safe: false, reason: 'snapshot-entities-missing', danger: null };
    }
    const point = state.point;
    const radius = loginPointSafetyRadius();
    for (const entity of entities) {
      if (!entity || typeof entity !== 'object') continue;
      if (!isAlive(entity) || isInvulnerable(entity)) continue;
      const id = Number(entity.user_id ?? entity.userId ?? entity.id ?? NaN);
      if (Number.isFinite(id) && Number(point.userId ?? NaN) === id) continue;
      const x = Number(entity.x);
      const y = Number(entity.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const distance = Math.hypot(x - Number(point.x), y - Number(point.y));
      if (!(distance <= radius)) continue;
      const moved = loginPointEntityMoved(state, entity, t);
      const reason = loginPointDangerReason(state, entity, moved);
      if (!reason) continue;
      return {
        safe: false,
        reason,
        danger: loginPointActorSummary(entity, {
          distance: Math.round(distance),
          moved: Boolean(moved),
          stamina5s: finiteNumber(entity.stamina_5s_remaining_milli, entity.stamina5s),
          stamina5sLimit: finiteNumber(entity.stamina_5s_limit_milli, entity.stamina5sLimit, 10000)
        })
      };
    }
    return { safe: true, reason: 'safe', danger: null };
  }

  function noteLoginPointSafetyProbe(success, detail = {}) {
    const t = Date.now();
    const state = readLoginPointSafetyState(t);
    state.required = loginPointSafetySuccessRequired();
    state.radius = loginPointSafetyRadius();
    state.lastSampleAt = t;
    state.lastTick = Number(detail.tick || state.lastTick || 0) || 0;
    if (!loginPointHasPoint(state)) {
      state.streak = 0;
      state.lastDanger = null;
      if (success) {
        state.lastOkAt = 0;
        state.lastError = '';
      } else {
        state.lastErrorAt = t;
        state.lastError = String(detail.error || detail.message || 'snapshot failed');
      }
      writeLoginPointSafetyState(state);
      return loginPointSafetyStatus(t);
    }
    let ok = Boolean(success);
    let safety = { safe: ok, reason: ok ? 'safe' : 'snapshot-error', danger: null };
    if (ok) {
      safety = evaluateLoginPointSafety(state, detail, t);
      ok = Boolean(safety.safe);
    }
    if (ok) {
      state.streak = Math.min(state.required, Math.max(0, Number(state.streak || 0)) + 1);
      state.lastOkAt = t;
      state.lastError = '';
      state.lastDanger = null;
    } else {
      state.streak = 0;
      if (success) {
        state.lastUnsafeAt = t;
        state.lastDanger = {
          reason: safety.reason || 'unsafe',
          actor: safety.danger || null,
          at: t
        };
        state.lastError = '';
      } else {
        state.lastErrorAt = t;
        state.lastError = String(detail.error || detail.message || 'snapshot failed');
      }
    }
    writeLoginPointSafetyState(state);
    return loginPointSafetyStatus(t);
  }

  function loginPointSafetyStatus(t = Date.now()) {
    const state = readLoginPointSafetyState(t);
    const required = loginPointSafetySuccessRequired();
    const hasPoint = Boolean(state.point);
    const lastSampleAt = Number(state.lastSampleAt || state.lastOkAt || state.lastUnsafeAt || state.lastErrorAt || 0) || 0;
    return {
      ...state,
      required,
      radius: loginPointSafetyRadius(),
      hasPoint,
      missingPoint: !hasPoint && required > 0,
      satisfied: required <= 0 || (hasPoint && state.streak >= required),
      remaining: hasPoint ? Math.max(0, required - state.streak) : required,
      lastSampleAt,
      lastOkAgeMs: state.lastOkAt ? Math.max(0, Math.round(t - Number(state.lastOkAt || t))) : null,
      lastUnsafeAgeMs: state.lastUnsafeAt ? Math.max(0, Math.round(t - Number(state.lastUnsafeAt || t))) : null,
      lastErrorAgeMs: state.lastErrorAt ? Math.max(0, Math.round(t - Number(state.lastErrorAt || t))) : null,
      lastSampleAgeMs: lastSampleAt ? Math.max(0, Math.round(t - lastSampleAt)) : null
    };
  }

  function resetLoginPointSafetyGate(reason = 'exit') {
    const t = Date.now();
    const state = readLoginPointSafetyState(t);
    state.streak = 0;
    state.lastDanger = null;
    state.lastError = '';
    state.resetAt = t;
    state.resetReason = String(reason || 'exit');
    writeLoginPointSafetyState(state);
    return loginPointSafetyStatus(t);
  }

  function rememberLoginPointDamageThreat(injury, reason = 'self-damage') {
    const t = Date.now();
    const state = readLoginPointSafetyState(t);
    const candidates = [
      injury?.nearestActive,
      injury?.nearestAvoidance,
      injury?.nearestHuman
    ].filter(Boolean);
    if (!candidates.length) return state;
    const existing = new Map((state.damagedBy?.actors || []).map(actor => [String(actor.key || ''), actor]));
    for (const candidate of candidates) {
      const actor = loginPointActorSummary(candidate, { at: t, reason });
      if (!actor?.key) continue;
      existing.set(actor.key, { ...(existing.get(actor.key) || {}), ...actor, at: t, reason });
    }
    state.damagedBy = {
      dayKey: loginPointSafetyDayKey(t),
      actors: Array.from(existing.values()).slice(-80)
    };
    writeLoginPointSafetyState(state);
    return state;
  }

  function maybeRecordLoginPoint(currentSummary) {
    if (!currentSummary || !Number.isFinite(Number(currentSummary.x)) || !Number.isFinite(Number(currentSummary.y))) return null;
    const t = Date.now();
    const loginAt = inferLoginPointLoginAt(t);
    if (!loginAt) return null;
    const maxAge = Math.max(Number(cfg.postLoginGraceMs || 45000) * 2, 60000);
    if (t - loginAt > maxAge) return null;
    const state = readLoginPointSafetyState(t);
    if (Number(state.point?.loginAt || 0) >= loginAt) return state;
    bot.lastLoginAt = loginAt;
    state.point = {
      x: Number(currentSummary.x),
      y: Number(currentSummary.y),
      userId: currentSummary.id ?? currentSummary.user_id ?? getCurrentUserId() ?? null,
      at: t,
      tick: Number(bot.globalState?.tick || 0) || 0,
      loginAt,
      source: 'post-login-self'
    };
    state.streak = 0;
    state.lastSampleAt = 0;
    state.lastOkAt = 0;
    state.lastUnsafeAt = 0;
    state.lastErrorAt = 0;
    state.lastTick = 0;
    state.lastDanger = null;
    state.lastError = '';
    state.movement = {};
    writeLoginPointSafetyState(state);
    return state;
  }

  function inferLoginPointLoginAt(t = Date.now()) {
    const candidates = [
      bot.lastLoginAt,
      bot.lastLoginResult?.at,
      bot.lastManualLoginResult?.at,
      bot.session?.startedAt
    ].map(value => Number(value || 0)).filter(value => Number.isFinite(value) && value > 0 && value <= t);
    try {
      const suppressUntil = Number(localStorage.getItem(LOGIN_SUPPRESS_KEY) || 0) || 0;
      const suppressReason = String(localStorage.getItem(LOGIN_SUPPRESS_REASON_KEY) || '');
      if (suppressUntil > t && /oauth|callback|login/i.test(suppressReason)) {
        const inferredAt = Math.max(0, suppressUntil - Math.max(1000, Number(cfg.postLoginGraceMs) || 45000));
        if (inferredAt > 0 && inferredAt <= t) candidates.push(inferredAt);
      }
    } catch (_) {}
    if (candidates.length) return Math.max(...candidates);
    return 0;
  }

	  function snapshotLoginGateStatus(t = Date.now()) {
	    const state = normalizeLoginSnapshotGateState(bot.loginSnapshotGate);
	    const required = loginSnapshotSuccessRequired();
	    state.required = required;
	    if (state.streak > required) state.streak = required;
	    const lastSampleAt = Number(state.lastSampleAt || state.lastOkAt || state.lastErrorAt || 0) || 0;
	    const pointSafety = loginPointSafetyStatus(t);
	    return {
	      ...state,
	      lastSampleAt,
	      satisfied: (required <= 0 || state.streak >= required) && pointSafety.satisfied,
	      remaining: Math.max(0, required - state.streak),
	      pointSafety,
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
	    resetLoginPointSafetyGate(reason);
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
	    noteLoginPointSafetyProbe(success, {
	      ...detail,
	      entities: Array.isArray(detail.entities) ? detail.entities : bot.globalState.entities
	    });
	    return snapshotLoginGateStatus(t);
	  }

  async function ensureLoginSnapshotGate(reason = 'login', options = {}) {
    let status = snapshotLoginGateStatus();
    if (status.satisfied) return status;
    if (options.allowLiveSessionTakeoverBypass && options.liveSessionTakeover?.allowed) {
      status.blockReason = String(reason || 'login');
      status.liveSessionTakeoverBypass = true;
      status.liveSessionTakeover = options.liveSessionTakeover;
      return status;
    }
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
    clearPersistentPendingExitState();
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
      if (paused) {
        if (stopOnPause) stopMotionSafely('paused');
        removeTargetOverlay();
      }
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
