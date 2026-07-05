'use strict';

const { safeJsonClone } = require('./runtime-utils');
const { arrayCount } = require('./array-count');
const { formatDurationMs, formatDistance, actorLabel, hpDisplay } = require('./display-format');
const {
  pendingExitRetryMsCore,
  pendingExitDisplayReasonCore,
  summarizePendingExitCore,
  leaveDetailHasHttp403Core,
  leaveDetailSucceededCore,
  leaveSuccessReloadConfirmationForDetailCore,
  leaveSuccessReloadConfirmationSatisfiedCore,
  pendingExitWaitReasonCore
} = require('./pending-exit');
const {
  pendingExitDisplayReasonCore: pendingExitDisplayReasonForLeaveCommandCore,
  leaveDetailHasHttp403Core: leaveDetailHasHttp403ForLeaveCommandCore,
  leaveDetailSucceededCore: leaveDetailSucceededForLeaveCommandCore
} = require('./pending-exit');
const {
  clearLoginSuppressMatchingBoundCore,
  clearOfflineReloginHoldBoundCore: clearOfflineReloginHoldForControlLoginBoundCore,
  clearOfflineReloginHoldBoundCore: clearOfflineReloginHoldForPendingExitBoundCore,
  combatExitSummaryCore: combatExitSummaryForLeaveFlowCore,
  enemyReloginHoldRemainingMsBoundCore: enemyReloginHoldRemainingMsForControlLoginBoundCore,
  enemyReloginHoldRemainingMsBoundCore: enemyReloginHoldRemainingMsForPendingExitBoundCore,
  enemyReloginHoldRemainingMsBoundCore: enemyReloginHoldRemainingMsForLeaveFlowBoundCore,
  finalizeLeaveDisplayReasonCore: finalizeLeaveDisplayReasonForControlLoginCore,
  finalizeLeaveDisplayReasonCore: finalizeLeaveDisplayReasonForPendingExitCore,
  finalizeLeaveDisplayReasonCore: finalizeLeaveDisplayReasonForLeaveFlowCore,
  injuryLeaveSummaryCore: injuryLeaveSummaryForLeaveFlowCore,
  leaveWaitDisplayCore: leaveWaitDisplayForControlLoginCore,
  leaveWaitDisplayCore: leaveWaitDisplayForPendingExitCore,
  leaveWaitDisplayCore: leaveWaitDisplayForLeaveFlowCore,
  offlineExitRequiresUnsafeReloginDelayCore,
  offlineLeaveSummaryCore: offlineLeaveSummaryForLeaveFlowCore,
  offlineReloginHoldRemainingMsBoundCore: offlineReloginHoldRemainingMsForControlLoginBoundCore,
  offlineReloginHoldRemainingMsBoundCore: offlineReloginHoldRemainingMsForPendingExitBoundCore,
  primePendingStaminaExitLoginSuppressBoundCore,
  primePendingUnsafeExitLoginSuppressBoundCore,
  pursuitLeaveSummaryCore: pursuitLeaveSummaryForLeaveFlowCore,
  setExitReloginSuppressBoundCore,
  setOfflineLeaveSuppressBoundCore,
  startExitAuditBoundCore
} = require('./exit-relogin');
const {
  leaveCommandFailureMessageCore,
  summarizeLeaveCommandResultCore,
  leaveDetailFailedForClashRescueCore,
  clashLeaveRescueAttemptsCore,
  nextClashLeaveRescueStageCore,
  summarizeClashLeaveRescueResultCore,
  clashLeaveRescueRetryDetailCore,
  resetClashLeaveRescueRoundCore,
  resetClashLeaveRescueRoundCore: resetClashLeaveRescueRoundForPendingExitCore
} = require('./leave-command');

function createControlFlowRuntime(runtime = {}) {
  const {
    bot,
    cfg,
    storage = typeof localStorage !== 'undefined' ? localStorage : null,
    pageGlobal = typeof window !== 'undefined' ? window : null,
    botKey,
    pendingExitStateKey,
    sessionMismatchRecoveryKey,
    cloudflareReloadKey,
    loginSuppressKey,
    loginSuppressReasonKey,
    loginPointSafetyKey,
    enemyLeaveStateKey,
    offlineLeaveStateKey,
    enemyLeaveStreakKey,
    readPageGlobal = () => null,
    installPageGlobal = () => {},
    normalizePendingExitReloadConfirmationCore = value => value,
    writePersistentPendingExitStateCore = () => null,
    pendingExitPersistenceCoreHelpers = () => ({}),
    clearPersistentPendingExitState = () => {},
    clearPersistentExitState = () => {},
    readPersistentExitState = () => null,
    writePersistentExitState = () => null,
    normalizeLoginSnapshotGateStateCore = value => value || {},
    loginSnapshotSuccessRequiredCore = () => 0,
    recordRuntimeDiagnostics = () => {},
    exitAuditFlushPending = () => false,
    exitAuditFlushBlockDetail = reason => ({ blocked: true, reason }),
    importantSessionEndFlushPending = () => false,
    importantSessionEndFlushBlockDetail = reason => ({ blocked: true, reason }),
    closeCurrentImportantSessionBeforeReload = () => null,
    closeCurrentImportantSessionBeforeLogin = () => null,
    persistCombatLogPendingEntries = () => 0,
    flushCombatLogs = () => false,
    ensureExitAuditDetail = () => null,
    recordExitAuditEvent = () => false,
    noteImportantSessionExit = () => null,
    logStatus = () => {},
    updateBotPanel = () => {},
    removeTargetOverlay = () => {},
    stopMotionSafely = () => {},
    stopMotionAfterExit = () => {},
    clearCombatEngagement = () => {},
    sendActionVelocity = () => false,
    shootAt = () => false,
    triggerNativeTick = () => false,
    recordUnhandledTickError = () => {},
    activeEnemyLeaveDetail = () => null,
    activeOfflineLeaveDetail = () => null,
    exitMotionStopLockRemainingMs = () => 0,
    unsafeExitReloginMinDelayMs = () => 0,
    getNativeControl = () => null,
    getNativeState = () => null,
    getOwnEntity = () => null,
    getSelf = () => null,
    summarizeSelf = value => value,
    summarizeControl = () => null,
    snapshotDataAgeMs = () => Infinity,
    snapshotSelfFreshEnough = () => false,
    isOfflineishWsReadyState = () => false,
    isAlive = value => Boolean(value),
    isInvulnerable = () => false,
    isJoinModeActive = () => false,
    isFiringEntity = () => false,
    isMovingThreat = () => false,
    truthyFlag = value => Boolean(value),
    staminaRemaining = () => null,
    staminaLimitValue = (_entity, _windowName, fallback) => fallback,
    dropValue = () => 0,
    clamp = (value, min, max) => Math.max(min, Math.min(max, value)),
    dist = () => 0,
    speed = () => 0,
    now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
    isFullHp = () => true,
    threatKey = threat => String(threat?.id ?? threat?.user_id ?? ''),
    returnBlockRadius = () => 0,
    staleOfflineStaminaHoldContradicted = () => false,
    staminaBudgetReloginDelayMs = () => 0,
    staminaResetHoldUntil = () => 0,
    staminaBudgetCoinLeaveSummary = () => '',
    staminaExhaustedWindowLabel = () => '',
    reloginDelayForHpCore = () => 0
  } = runtime;
  const localStorage = storage;
  const BOT_KEY = botKey;
  const PENDING_EXIT_STATE_KEY = pendingExitStateKey;
  const SESSION_MISMATCH_RECOVERY_KEY = sessionMismatchRecoveryKey;
  const CLOUDFLARE_RELOAD_KEY = cloudflareReloadKey;
  const LOGIN_SUPPRESS_KEY = loginSuppressKey;
  const LOGIN_SUPPRESS_REASON_KEY = loginSuppressReasonKey;
  const LOGIN_POINT_SAFETY_KEY = loginPointSafetyKey;
  const ENEMY_LEAVE_STATE_KEY = enemyLeaveStateKey;
  const OFFLINE_LEAVE_STATE_KEY = offlineLeaveStateKey;
  const ENEMY_LEAVE_STREAK_KEY = enemyLeaveStreakKey;
  const recordRuntimeDiagnosticsCore = (_bot, detail) => recordRuntimeDiagnostics(detail);

  function requestReload(reason) {
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
		    try {
		      persistCombatLogPendingEntries({ force: true });
		      flushCombatLogs(true);
		    } catch (_) {}
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
		      const reloadConfirmation = normalizePendingExitReloadConfirmationCore(pending.reloadConfirmation, pending, Date.now());
		      if (reloadConfirmation) {
		        reloadConfirmation.lastBlocked = blocked;
		        pending.reloadConfirmation = reloadConfirmation;
		        if (pending.lastResult && typeof pending.lastResult === 'object') pending.lastResult.reloadConfirmation = reloadConfirmation;
		        writePersistentPendingExitStateCore(localStorage, PENDING_EXIT_STATE_KEY, (pending) || bot.pendingExit, Date.now(), pendingExitPersistenceCoreHelpers());
		      }
		      flushCombatLogs(true);
		      logStatus('leave confirmation reload blocked until exit audit logs flush: ' + (reason || ''), {
		        kind: 'wait',
		        reason: 'exit-log-flush-pending',
		        dx: 0,
		        dy: 0,
		        self: bot.lastSelf,
		        pendingExit: (() => {
        const pendingExitSummaryPending = pending;
        if (!pendingExitSummaryPending) return null;
        const pendingExitSummaryNow = Date.now();
        const pendingExitSummaryReload = normalizePendingExitReloadConfirmationCore(pendingExitSummaryPending.reloadConfirmation, pendingExitSummaryPending, pendingExitSummaryNow);
        return summarizePendingExitForControlLoginCore(pendingExitSummaryPending, {
          nowMs: pendingExitSummaryNow,
          retryMs: pendingExitRetryMsForControlLoginCore(pendingExitSummaryPending, {
        leaveRetryMinMs: cfg.leaveRetryMinMs,
        leaveCommandTimeoutMs: cfg.leaveCommandTimeoutMs,
        offlineLeaveRetryMs: cfg.offlineLeaveRetryMs,
        combatLeaveRetryMs: cfg.combatLeaveRetryMs,
        pursuitLeaveRetryMs: cfg.pursuitLeaveRetryMs
      }),
          reloadConfirmation: pendingExitSummaryReload
        });
      })(),
		        exitAuditFlush: blocked,
		        displayReason: '等待退出日志发送完成，暂不刷新确认退出'
		      });
		      return false;
		    }
		    try {
		      persistCombatLogPendingEntries({ force: true });
		      flushCombatLogs(true);
		    } catch (_) {}
		    const t = Date.now();
		    const previousRequestedAt = Number(pending.reloadConfirmation?.requestedAt || 0) || 0;
		    const reloadConfirmation = normalizePendingExitReloadConfirmationCore(pending.reloadConfirmation, pending, t) || {
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
		    writePersistentPendingExitStateCore(localStorage, PENDING_EXIT_STATE_KEY, (pending) || bot.pendingExit, Date.now(), pendingExitPersistenceCoreHelpers());
		    bot.reloadRequestedAt = t;
		    logStatus('leave confirmation reload: ' + reason, {
		      kind: 'wait',
		      reason: 'leave-success-refresh-confirmation',
		      pendingExit: (() => {
        const pendingExitSummaryPending = pending;
        if (!pendingExitSummaryPending) return null;
        const pendingExitSummaryNow = Date.now();
        const pendingExitSummaryReload = normalizePendingExitReloadConfirmationCore(pendingExitSummaryPending.reloadConfirmation, pendingExitSummaryPending, pendingExitSummaryNow);
        return summarizePendingExitForControlLoginCore(pendingExitSummaryPending, {
          nowMs: pendingExitSummaryNow,
          retryMs: pendingExitRetryMsForControlLoginCore(pendingExitSummaryPending, {
        leaveRetryMinMs: cfg.leaveRetryMinMs,
        leaveCommandTimeoutMs: cfg.leaveCommandTimeoutMs,
        offlineLeaveRetryMs: cfg.offlineLeaveRetryMs,
        combatLeaveRetryMs: cfg.combatLeaveRetryMs,
        pursuitLeaveRetryMs: cfg.pursuitLeaveRetryMs
      }),
          reloadConfirmation: pendingExitSummaryReload
        });
      })(),
		      reloadConfirmation,
		      displayReason: 'leave接口已返回成功，刷新页面确认服务端在线状态'
		    });
			    location.reload();
			    return true;
			  }

	  function requestSessionMismatchRecoveryReload(control, noSelfExit, liveSessionTakeover) {
	    if (cfg.dryRun || cfg.once) return { requested: false, reason: 'disabled' };
	    if (bot.reloadRequestedAt) return {
	      requested: false,
	      reason: 'reload-already-requested',
	      state: summarizeSessionMismatchRecoveryStatus()
	    };
	    if (!liveSessionTakeover?.allowed) return {
	      requested: false,
	      reason: liveSessionTakeover?.reason || 'takeover-not-allowed'
	    };
	    if (exitAuditFlushPending()) {
	      const blocked = exitAuditFlushBlockDetail('session-mismatch-refresh:' + (liveSessionTakeover.reason || ''));
	      bot.exitAudit.lastBlockedReload = blocked;
	      flushCombatLogs(true);
	      logStatus('session mismatch refresh blocked until exit audit logs flush', {
	        kind: 'wait',
	        reason: 'exit-log-flush-pending',
	        dx: 0,
	        dy: 0,
	        self: bot.lastSelf,
	        noSelfGameSession: noSelfExit,
	        liveSessionTakeover,
	        exitAuditFlush: blocked,
	        displayReason: '等待退出日志发送完成，暂不刷新确认会话状态'
	      });
	      return {
	        requested: false,
	        blocked: true,
	        reason: 'exit-log-flush-pending',
	        exitAuditFlush: blocked
	      };
	    }
	    const t = Date.now();
	    const state = writeSessionMismatchRecoveryState({
	      schemaVersion: 1,
	      reason: 'session-mismatch-recovery',
	      userId: Number(control?.currentUserId || getCurrentUserId() || noSelfExit?.userId || 0) || null,
	      requestedAt: t,
	      expiresAt: t + sessionMismatchRecoveryReloadMaxAgeMs(),
	      reloadCount: 1,
	      pageTimeOrigin: pageTimeOriginMs(),
	      noSelfAgeMs: Math.max(0, Math.round(Number(noSelfExit?.ageMs || 0) || 0)),
	      mismatchLeaveMs: Math.max(0, Math.round(Number(noSelfExit?.mismatchLeaveMs || 0) || 0)),
	      liveSessionEvidence: Boolean(liveSessionTakeover.liveSessionEvidence),
	      snapshotSelfPresent: Boolean(liveSessionTakeover.snapshotSelf?.present || noSelfExit?.snapshotSelf?.present),
	      nativeWsOpenOrConnecting: Boolean(liveSessionTakeover.nativeWsOpenOrConnecting),
	      takeoverReason: String(liveSessionTakeover.reason || ''),
	      control: {
	        rawWsOpen: Boolean(control?.rawWsOpen),
	        nativeWsOpen: Boolean(control?.nativeWsOpen),
	        connecting: Boolean(control?.connecting),
	        wsReadyState: control?.wsReadyState ?? null,
	        nativeWsReadyState: control?.nativeWsReadyState ?? null,
	        transport: control?.transport || '',
	        hasToken: Boolean(control?.hasToken)
	      }
	    });
	    if (!state) {
	      return {
	        requested: false,
	        reason: 'state-persist-failed',
	        error: bot.sessionMismatchRecovery?.error || 'session mismatch recovery state persist failed'
	      };
	    }
	    try {
	      persistCombatLogPendingEntries({ force: true });
	      flushCombatLogs(true);
	    } catch (_) {}
	    bot.reloadRequestedAt = t;
	    const displayReason = '界面显示未登录但原生会话仍在线，先刷新页面确认状态';
	    logStatus('session mismatch recovery refresh', {
	      kind: 'wait',
	      reason: 'session-mismatch-refresh',
	      dx: 0,
	      dy: 0,
	      currentUserId: getCurrentUserId(),
	      control,
	      visibleEntities: arrayCount(bot.globalState.entities),
	      self: null,
	      noSelfGameSession: noSelfExit,
	      liveSessionTakeover,
	      sessionMismatchRecovery: state,
	      displayReason
	    });
	    location.reload();
	    return {
	      requested: true,
	      reason: 'session-mismatch-refresh',
	      state,
	      displayReason
	    };
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
        || offlineSafety?.actionSettlementStall
        || /websocket|offline|disconnect|reconnect|server position|action settlement|missing self|stamina|pending unsafe/i.test(text)
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

	  function sessionMismatchRecoveryReloadMaxAgeMs() {
	    return Math.max(60000, Number(cfg.sessionMismatchRecoveryReloadMaxAgeMs ?? 120000) || 120000);
	  }

	  function pageTimeOriginMs() {
	    try {
	      return Number((typeof performance === 'object' && performance ? performance.timeOrigin : 0) || 0) || 0;
	    } catch (_) {
	      return 0;
	    }
	  }

	  function normalizeSessionMismatchRecoveryState(value, t = Date.now()) {
	    if (!value || typeof value !== 'object') return null;
	    const requestedAt = Number(value.requestedAt || 0) || 0;
	    const maxAgeMs = sessionMismatchRecoveryReloadMaxAgeMs();
	    const expiresAt = Number(value.expiresAt || 0) || (requestedAt ? requestedAt + maxAgeMs : 0);
	    if (!requestedAt || (expiresAt && t > expiresAt)) return null;
	    return {
	      schemaVersion: 1,
	      reason: String(value.reason || 'session-mismatch-recovery'),
	      userId: Number(value.userId || 0) || null,
	      requestedAt,
	      reloadedAt: Number(value.reloadedAt || 0) || 0,
	      expiresAt,
	      reloadCount: Math.max(1, Math.round(Number(value.reloadCount || 1) || 1)),
	      pageTimeOrigin: Number(value.pageTimeOrigin || 0) || 0,
	      noSelfAgeMs: Math.max(0, Math.round(Number(value.noSelfAgeMs || 0) || 0)),
	      mismatchLeaveMs: Math.max(0, Math.round(Number(value.mismatchLeaveMs || 0) || 0)),
	      liveSessionEvidence: Boolean(value.liveSessionEvidence),
	      snapshotSelfPresent: Boolean(value.snapshotSelfPresent),
	      nativeWsOpenOrConnecting: Boolean(value.nativeWsOpenOrConnecting),
	      takeoverReason: String(value.takeoverReason || ''),
	      control: value.control && typeof value.control === 'object' ? { ...value.control } : null,
	      lastError: String(value.lastError || '')
	    };
	  }

	  function readSessionMismatchRecoveryState(t = Date.now()) {
	    let raw = null;
	    try {
	      raw = JSON.parse(localStorage.getItem(SESSION_MISMATCH_RECOVERY_KEY) || 'null');
	    } catch (_) {
	      raw = null;
	    }
	    const state = normalizeSessionMismatchRecoveryState(raw, t);
	    if (!state && raw) {
	      try {
	        localStorage.removeItem(SESSION_MISMATCH_RECOVERY_KEY);
	      } catch (_) {}
	    }
	    bot.sessionMismatchRecovery = state;
	    return state;
	  }

	  function writeSessionMismatchRecoveryState(value, t = Date.now()) {
	    const state = normalizeSessionMismatchRecoveryState(value, t);
	    if (!state) return null;
	    try {
	      localStorage.setItem(SESSION_MISMATCH_RECOVERY_KEY, JSON.stringify(state));
	      bot.sessionMismatchRecovery = state;
	      return state;
	    } catch (err) {
	      bot.sessionMismatchRecovery = {
	        reason: 'session-mismatch-recovery',
	        error: err?.message || String(err),
	        failedAt: t
	      };
	      return null;
	    }
	  }

	  function clearSessionMismatchRecoveryState(reason = 'resolved') {
	    try {
	      localStorage.removeItem(SESSION_MISMATCH_RECOVERY_KEY);
	    } catch (_) {}
	    bot.sessionMismatchRecovery = {
	      reason: 'session-mismatch-recovery',
	      clearedAt: Date.now(),
	      clearedReason: String(reason || 'resolved')
	    };
	    return bot.sessionMismatchRecovery;
	  }

	  function sessionMismatchRecoveryStateMatches(state, control, noSelfExit) {
	    if (!state || state.reason !== 'session-mismatch-recovery') return false;
	    const stateUserId = Number(state.userId || 0) || 0;
	    const currentUserId = Number(control?.currentUserId || getCurrentUserId() || noSelfExit?.userId || 0) || 0;
	    return Boolean(stateUserId && currentUserId && stateUserId === currentUserId);
	  }

	  function sessionMismatchRecoveryPageReloadedAfter(state) {
	    const requestedAt = Number(state?.requestedAt || 0) || 0;
	    const origin = pageTimeOriginMs();
	    return Boolean(requestedAt && origin && origin >= requestedAt - 500);
	  }

	  function sessionMismatchRecoveryReloadSatisfied(control, noSelfExit, t = Date.now()) {
	    const state = readSessionMismatchRecoveryState(t);
	    if (!sessionMismatchRecoveryStateMatches(state, control, noSelfExit)) return null;
	    if (!sessionMismatchRecoveryPageReloadedAfter(state)) return null;
	    if (!state.reloadedAt) {
	      state.reloadedAt = t;
	      writeSessionMismatchRecoveryState(state, t);
	    }
	    return state;
	  }

	  function summarizeSessionMismatchRecoveryStatus(t = Date.now()) {
	    const state = readSessionMismatchRecoveryState(t);
	    if (!state) return null;
	    return {
	      ...state,
	      ageMs: Math.max(0, Math.round(t - Number(state.requestedAt || t))),
	      remainingMs: Math.max(0, Math.round(Number(state.expiresAt || t) - t)),
	      pageReloadedAfterRequest: sessionMismatchRecoveryPageReloadedAfter(state)
	    };
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
    const enemyHoldRemainingMs = enemyReloginHoldRemainingMsForControlLoginBoundCore(bot, localStorage, { loginSuppressKey: LOGIN_SUPPRESS_KEY, loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY, readPersistentExitState, enemyLeaveStateKey: ENEMY_LEAVE_STATE_KEY, now: Date.now });
    const offlineHoldRemainingMs = offlineReloginHoldRemainingMsForControlLoginBoundCore(bot, localStorage, { loginSuppressKey: LOGIN_SUPPRESS_KEY, loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY, readPersistentExitState, offlineLeaveStateKey: OFFLINE_LEAVE_STATE_KEY, staleOfflineStaminaHoldContradicted, clearOfflineReloginHold: reason => clearOfflineReloginHoldForControlLoginBoundCore(bot, localStorage, reason, { now: Date.now, writePersistentPendingExitState: pending => writePersistentPendingExitStateCore(localStorage, PENDING_EXIT_STATE_KEY, pending || bot.pendingExit, Date.now(), pendingExitPersistenceCoreHelpers()), clearPersistentPendingExitState, clearPersistentExitState, loginSuppressKey: LOGIN_SUPPRESS_KEY, loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY, offlineLeaveStateKey: OFFLINE_LEAVE_STATE_KEY }), now: Date.now });
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
      pendingExit: (() => {
        const pendingExitSummaryPending = bot.pendingExit;
        if (!pendingExitSummaryPending) return null;
        const pendingExitSummaryNow = Date.now();
        const pendingExitSummaryReload = normalizePendingExitReloadConfirmationCore(pendingExitSummaryPending.reloadConfirmation, pendingExitSummaryPending, pendingExitSummaryNow);
        return summarizePendingExitForControlLoginCore(pendingExitSummaryPending, {
          nowMs: pendingExitSummaryNow,
          retryMs: pendingExitRetryMsForControlLoginCore(pendingExitSummaryPending, {
        leaveRetryMinMs: cfg.leaveRetryMinMs,
        leaveCommandTimeoutMs: cfg.leaveCommandTimeoutMs,
        offlineLeaveRetryMs: cfg.offlineLeaveRetryMs,
        combatLeaveRetryMs: cfg.combatLeaveRetryMs,
        pursuitLeaveRetryMs: cfg.pursuitLeaveRetryMs
      }),
          reloadConfirmation: pendingExitSummaryReload
        });
      })(),
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

  function findZoomControl(direction = 'out') {
    const out = String(direction || 'out') !== 'in';
    const directSelector = out
      ? '#zoomOutBtn, [data-testid="zoom-out"], [aria-label="zoom out"], [aria-label="Zoom out"]'
      : '#zoomInBtn, [data-testid="zoom-in"], [aria-label="zoom in"], [aria-label="Zoom in"]';
    const direct = document.querySelector(directSelector);
    if (direct) return direct;
    const candidates = Array.from(document.querySelectorAll('button, input[type="button"], [role="button"]'));
    return candidates.find(el => {
      const text = controlText(el);
      return out
        ? /zoom\s*out|缩小|缩放-|地图-|视图-/i.test(text)
        : /zoom\s*in|放大|缩放\+|地图\+|视图\+/i.test(text);
    }) || null;
  }

  function findZoomOutControl() {
    return findZoomControl('out');
  }

  function clickZoomControl(direction = 'out') {
    const out = String(direction || 'out') !== 'in';
    const control = findZoomControl(out ? 'out' : 'in');
    const label = out ? 'zoom-out' : 'zoom-in';
    if (!control) return { clicked: false, error: label + ' control not found', direction: out ? 'out' : 'in' };
    if (control.disabled) return { clicked: false, error: label + ' control disabled', control: describeControl(control), direction: out ? 'out' : 'in' };
    try {
      control.click();
      return { clicked: true, control: describeControl(control), direction: out ? 'out' : 'in' };
    } catch (err) {
      return { clicked: false, error: err?.message || String(err), control: describeControl(control), direction: out ? 'out' : 'in' };
    }
  }

  function clickZoomOutControl() {
    return clickZoomControl('out');
  }

  function postLoginZoomScaleTextRadiusCm() {
    const text = String(document.getElementById('scaleText')?.textContent || '');
    const match = text.match(/r\s*=\s*([0-9]+(?:\.[0-9]+)?)\s*(km|m)\b/i);
    if (!match) return 0;
    const value = Number(match[1]);
    if (!Number.isFinite(value) || value <= 0) return 0;
    return /km/i.test(match[2]) ? value * 100000 : value * 100;
  }

  function postLoginZoomCurrentViewRadiusCm() {
    const nativeState = getNativeState();
    const values = [
      postLoginZoomScaleTextRadiusCm(),
      nativeState?.viewRadiusCm,
      nativeState?.view_radius_cm,
      nativeState?.viewRadius,
      nativeState?.view_radius
    ];
    for (const value of values) {
      const radius = Number(value);
      if (Number.isFinite(radius) && radius > 0) return radius;
    }
    return 0;
  }

  function postLoginZoomTargetRadiusCm() {
    const configured = Number(cfg.postLoginZoomFitRadiusCm || 0);
    if (Number.isFinite(configured) && configured > 0) return configured;
    const nativeAuthority = Number(cfg.nativeCoinAuthoritativeRadius || 0);
    return Number.isFinite(nativeAuthority) && nativeAuthority > 0 ? nativeAuthority : 50000;
  }

  function postLoginZoomFitBounds() {
    const targetRatio = Math.min(0.99, Math.max(0.5, Number(cfg.postLoginZoomFitTargetRatio || 0.96) || 0.96));
    const tolerance = Math.max(0.005, Number(cfg.postLoginZoomFitTolerance || 0.04) || 0.04);
    return {
      targetRatio,
      minRatio: Math.max(0.1, targetRatio - tolerance),
      maxRatio: Math.min(1, targetRatio + tolerance)
    };
  }

  function postLoginZoomViewElements() {
    const world = document.getElementById('world')
      || document.querySelector('.map-shell canvas')
      || document.querySelector('.map-shell');
    const shell = world?.closest?.('.map-shell') || document.querySelector('.map-shell') || world?.parentElement || null;
    if (!world || !shell) return null;
    const worldRect = world.getBoundingClientRect();
    const shellRect = shell.getBoundingClientRect();
    if (!(worldRect.width > 0) || !(worldRect.height > 0) || !(shellRect.width > 0) || !(shellRect.height > 0)) return null;
    return {
      world,
      shell,
      width: shellRect.width,
      height: shellRect.height,
      worldWidth: worldRect.width,
      worldHeight: worldRect.height,
      worldOffsetX: worldRect.left - shellRect.left,
      worldOffsetY: worldRect.top - shellRect.top
    };
  }

  function postLoginZoomProjection(selfSummary, view) {
    if (typeof targetOverlayProjection === 'function') {
      const projection = targetOverlayProjection(selfSummary, view);
      if (projection) return projection;
    }
    const radius = postLoginZoomCurrentViewRadiusCm();
    const shortSide = Math.max(1, Math.min(Number(view?.worldWidth || view?.width || 1), Number(view?.worldHeight || view?.height || 1)));
    const units = Math.max(1, radius || postLoginZoomTargetRadiusCm()) * 2 / shortSide;
    return {
      units,
      cx: Number(view?.worldWidth || view?.width || 0) / 2,
      cy: Number(view?.worldHeight || view?.height || 0) / 2,
      centerX: Number(selfSummary?.x || 0),
      centerY: Number(selfSummary?.y || 0),
      offsetX: Number(view?.worldOffsetX || 0),
      offsetY: Number(view?.worldOffsetY || 0),
      source: 'post-login-fallback'
    };
  }

  function postLoginZoomSelfScreenPoint(selfSummary, view, projection) {
    if (typeof targetOverlayPoint === 'function') {
      const point = targetOverlayPoint(selfSummary, selfSummary, view, projection);
      if (point && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y))) return point;
    }
    return {
      x: (Number(projection?.offsetX) || 0) + Number(projection?.cx || 0),
      y: (Number(projection?.offsetY) || 0) + Number(projection?.cy || 0)
    };
  }

  function postLoginZoomFitMeasurement(selfSummary) {
    const view = postLoginZoomViewElements();
    if (!view) return { ok: false, error: 'map view not found' };
    const projection = postLoginZoomProjection(selfSummary, view);
    const units = Number(projection?.units);
    if (!Number.isFinite(units) || units <= 0) return { ok: false, error: 'view projection unavailable' };
    const center = postLoginZoomSelfScreenPoint(selfSummary, view, projection);
    const centerX = Number(center?.x);
    const centerY = Number(center?.y);
    if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) return { ok: false, error: 'self screen point unavailable' };
    const paddingPx = Math.max(0, Number(cfg.postLoginZoomFitPaddingPx || 0) || 0);
    const availablePx = Math.min(centerX, Number(view.width || 0) - centerX, centerY, Number(view.height || 0) - centerY) - paddingPx;
    if (!(availablePx > 0)) return { ok: false, error: 'no visible room for view circle' };
    const radiusCm = postLoginZoomTargetRadiusCm();
    const circleRadiusPx = radiusCm / units;
    const fitRatio = circleRadiusPx / availablePx;
    const bounds = postLoginZoomFitBounds();
    return {
      ok: true,
      radiusCm: Math.round(radiusCm),
      viewRadiusCm: Math.round(postLoginZoomCurrentViewRadiusCm() || 0),
      units: Number(units.toFixed(2)),
      circleRadiusPx: Math.round(circleRadiusPx),
      availablePx: Math.round(availablePx),
      paddingPx: Math.round(paddingPx),
      centerX: Math.round(centerX),
      centerY: Math.round(centerY),
      width: Math.round(Number(view.width || 0)),
      height: Math.round(Number(view.height || 0)),
      fitRatio: Number(fitRatio.toFixed(3)),
      targetRatio: bounds.targetRatio,
      minRatio: Number(bounds.minRatio.toFixed(3)),
      maxRatio: Number(bounds.maxRatio.toFixed(3)),
      source: projection.source || ''
    };
  }

  function postLoginZoomFitDecision(measure) {
    if (!measure?.ok) return { done: false, direction: 'out', reason: measure?.error || 'unmeasured' };
    const ratio = Number(measure.fitRatio);
    const maxRatio = Number(measure.maxRatio);
    if (!Number.isFinite(ratio) || !Number.isFinite(maxRatio)) {
      return { done: false, direction: 'out', reason: 'invalid-ratio' };
    }
    if (ratio > maxRatio) return { done: false, direction: 'out', reason: 'circle-clipped' };
    return { done: true, direction: '', reason: 'visible-range-fit' };
  }

  function postLoginZoomWheelTarget() {
    const view = postLoginZoomViewElements();
    return view?.world || view?.shell || document.getElementById('world') || document.querySelector('.map-shell') || document.body;
  }

  function dispatchPostLoginZoomWheel(direction = 'out') {
    const target = postLoginZoomWheelTarget();
    if (!target || typeof WheelEvent !== 'function') return { dispatched: false, method: 'wheel', error: 'wheel target unavailable', direction };
    const out = String(direction || 'out') !== 'in';
    const rect = typeof target.getBoundingClientRect === 'function'
      ? target.getBoundingClientRect()
      : { left: 0, top: 0, width: window.innerWidth || 1, height: window.innerHeight || 1 };
    const delta = Math.max(1, Number(cfg.postLoginZoomWheelDeltaY || 100) || 100);
    const event = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaMode: 0,
      deltaX: 0,
      deltaY: out ? delta : -delta,
      clientX: Number(rect.left || 0) + Math.max(1, Number(rect.width || 1)) / 2,
      clientY: Number(rect.top || 0) + Math.max(1, Number(rect.height || 1)) / 2
    });
    const notCanceled = target.dispatchEvent(event);
    return {
      dispatched: true,
      method: 'wheel',
      direction: out ? 'out' : 'in',
      deltaY: out ? delta : -delta,
      target: describeControl(target),
      defaultPrevented: Boolean(event.defaultPrevented),
      canceled: !notCanceled
    };
  }

  function postLoginZoomStepImproved(before, after, direction) {
    if (!before?.ok || !after?.ok) return false;
    const beforeRatio = Number(before.fitRatio);
    const afterRatio = Number(after.fitRatio);
    if (!Number.isFinite(beforeRatio) || !Number.isFinite(afterRatio)) return false;
    const minimumChange = 0.004;
    return String(direction || 'out') !== 'in' && afterRatio <= beforeRatio - minimumChange;
  }

  function finishPostLoginZoomResult(state, status, detail = {}) {
    const latest = state.lastResult || {};
    state.lastResult = {
      ...latest,
      ...detail,
      status,
      finishedAt: Date.now()
    };
    return state.lastResult;
  }

  function currentBotIsInstalled() {
    return readPageGlobal(BOT_KEY, null, pageGlobal) === bot;
  }

  function schedulePostLoginZoomFallbackClicks(state, reason = '') {
    const clicks = Math.max(0, Math.round(Number(cfg.postLoginZoomOutClicks || 0)));
    const latest = state.lastResult || {};
    latest.fallbackReason = reason || latest.fallbackReason || '';
    latest.fallbackRequestedClicks = clicks;
    latest.requestedClicks = clicks;
    state.lastResult = latest;
    if (!clicks) return finishPostLoginZoomResult(state, 'failed', { lastError: reason || 'fit measurement unavailable' });
    const intervalMs = Math.max(0, Number(cfg.postLoginZoomOutIntervalMs || 0));
    for (let index = 0; index < clicks; index += 1) {
      setTimeout(() => {
        if (!currentBotIsInstalled() || !bot.running) return;
        requestNativeViewportResize('post-login-zoom-fallback-click-' + (index + 1));
        const result = clickZoomOutControl();
        const current = state.lastResult || {};
        current.completedClicks = Number(current.completedClicks || 0) + (result.clicked ? 1 : 0);
        current.failedClicks = Number(current.failedClicks || 0) + (result.clicked ? 0 : 1);
        current.lastError = result.error || current.lastError || '';
        current.lastAction = result;
        current.control = result.control || current.control || '';
        current.finishedAt = Date.now();
        state.lastResult = current;
        requestNativeViewportResize('post-login-zoom-after-fallback-click-' + (index + 1));
      }, index * intervalMs);
    }
    setTimeout(() => {
      if (!currentBotIsInstalled() || !bot.running) return;
      finishPostLoginZoomResult(state, 'fallback-clicks');
    }, clicks * intervalMs + 20);
    return state.lastResult;
  }

  function schedulePostLoginZoomFitStep(selfSummary, stepIndex = 0, delayMs = 0) {
    setTimeout(() => {
      if (!currentBotIsInstalled() || !bot.running) return;
      const state = bot.postLoginZoom;
      if (!state?.lastResult) return;
      const maxSteps = Math.max(1, Math.round(Number(cfg.postLoginZoomFitMaxSteps || 24) || 24));
      requestNativeViewportResize('post-login-zoom-fit-step-' + (stepIndex + 1));
      const before = postLoginZoomFitMeasurement(selfSummary);
      const decision = postLoginZoomFitDecision(before);
      const latest = state.lastResult || {};
      latest.lastMeasure = before;
      latest.fitRatio = before?.ok ? before.fitRatio : null;
      latest.viewRadiusCm = before?.ok ? before.viewRadiusCm : null;
      latest.lastDecision = decision;
      state.lastResult = latest;
      if (!before?.ok && stepIndex === 0) {
        schedulePostLoginZoomFallbackClicks(state, before?.error || 'fit measurement unavailable');
        return;
      }
      if (decision.done) {
        finishPostLoginZoomResult(state, 'fit', { lastError: '' });
        return;
      }
      if (stepIndex >= maxSteps) {
        finishPostLoginZoomResult(state, 'max-steps', { lastError: 'post-login zoom fit max steps reached' });
        return;
      }
      const action = dispatchPostLoginZoomWheel(decision.direction);
      latest.wheelSteps = Number(latest.wheelSteps || 0) + (action.dispatched ? 1 : 0);
      latest.failedWheelSteps = Number(latest.failedWheelSteps || 0) + (action.dispatched ? 0 : 1);
      latest.lastAction = action;
      latest.lastError = action.error || '';
      state.lastResult = latest;
      const intervalMs = Math.max(0, Number(cfg.postLoginZoomOutIntervalMs || 0));
      setTimeout(() => {
        if (!currentBotIsInstalled() || !bot.running) return;
        const current = state.lastResult || {};
        const after = postLoginZoomFitMeasurement(selfSummary);
        current.lastMeasure = after;
        current.fitRatio = after?.ok ? after.fitRatio : current.fitRatio;
        current.viewRadiusCm = after?.ok ? after.viewRadiusCm : current.viewRadiusCm;
        if (!postLoginZoomStepImproved(before, after, decision.direction)) {
          const fallback = clickZoomControl(decision.direction);
          current.fallbackClicks = Number(current.fallbackClicks || 0) + 1;
          current.completedClicks = Number(current.completedClicks || 0) + (fallback.clicked ? 1 : 0);
          current.failedClicks = Number(current.failedClicks || 0) + (fallback.clicked ? 0 : 1);
          current.lastAction = { ...fallback, method: 'button-fallback' };
          current.lastError = fallback.error || current.lastError || '';
          current.control = fallback.control || current.control || '';
        }
        state.lastResult = current;
        schedulePostLoginZoomFitStep(selfSummary, stepIndex + 1, intervalMs);
      }, intervalMs);
    }, delayMs);
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
    if (!state.armed) return null;
    const key = postLoginZoomSessionKey(selfSummary);
    if (!key || state.appliedKey === key || state.scheduledKey === key) return null;
    state.armed = false;
    state.appliedKey = key;
    state.scheduledKey = key;
    state.scheduledAt = t;
    const fitBounds = postLoginZoomFitBounds();
    state.lastResult = {
      key,
      mode: 'fit-visible-range',
      scheduledAt: t,
      startDelayMs: Math.max(0, Number(cfg.postLoginZoomStartDelayMs || 0) || 0),
      requestedRadiusCm: Math.round(postLoginZoomTargetRadiusCm()),
      targetRatio: fitBounds.targetRatio,
      minRatio: Number(fitBounds.minRatio.toFixed(3)),
      maxRatio: Number(fitBounds.maxRatio.toFixed(3)),
      maxSteps: Math.max(1, Math.round(Number(cfg.postLoginZoomFitMaxSteps || 24) || 24)),
      fallbackRequestedClicks: clicks,
      completedClicks: 0,
      failedClicks: 0,
      wheelSteps: 0,
      failedWheelSteps: 0,
      fallbackClicks: 0,
      lastError: ''
    };
    requestNativeViewportResize('post-login-zoom-schedule');
    setTimeout(() => requestNativeViewportResize('post-login-zoom-before-clicks'), state.lastResult.startDelayMs);
    schedulePostLoginZoomFitStep(selfSummary, 0, state.lastResult.startDelayMs);
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

  function loginPointSafetySuccessRequired() {
    return Math.max(0, Math.round(Number(cfg.loginPointSafetySuccessRequired ?? 3) || 3));
  }

  function optionalFiniteNumber(value) {
    if (value === undefined || value === null || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function loginPointSafetyLastExitHp(state = null) {
    return optionalFiniteNumber(
      state?.lastExitSelfHp
        ?? state?.lastExitHp
        ?? state?.lastExitSelf?.hp
        ?? state?.lastExitSelf?.selfHp
    );
  }

  function loginPointSafetyHealthyHpThreshold() {
    return Math.max(0, Number(cfg.loginPointSafetyHealthyHpThreshold ?? 80) || 80);
  }

  function loginPointSafetyLowHpRadius() {
    return Math.max(0, Number(cfg.loginPointSafetyRadius ?? 30000) || 30000);
  }

  function loginPointSafetyHealthyRadius() {
    return Math.max(0, Number(cfg.loginPointSafetyHealthyRadius ?? 17000) || 17000);
  }

  function loginPointSafetyRadiusInfo(state = null) {
    const lastExitSelfHp = loginPointSafetyLastExitHp(state);
    const healthyHpThreshold = loginPointSafetyHealthyHpThreshold();
    const lowHpRadius = loginPointSafetyLowHpRadius();
    const healthyRadius = loginPointSafetyHealthyRadius();
    const healthyExit = Number.isFinite(lastExitSelfHp) && lastExitSelfHp >= healthyHpThreshold;
    return {
      radius: healthyExit ? healthyRadius : lowHpRadius,
      lowHpRadius,
      healthyRadius,
      healthyHpThreshold,
      lastExitSelfHp: Number.isFinite(lastExitSelfHp) ? lastExitSelfHp : null,
      lastExitSelfHpKnown: Number.isFinite(lastExitSelfHp),
      radiusReason: healthyExit ? 'last-exit-hp-healthy' : 'last-exit-hp-low-or-unknown'
    };
  }

  function loginPointSafetyRadius(state = null) {
    return loginPointSafetyRadiusInfo(state).radius;
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

  function loginPointSafetyExitSelfHpFrom(...values) {
    for (const value of values) {
      if (value === undefined || value === null) continue;
      if (typeof value === 'object') {
        const nested = loginPointSafetyExitSelfHpFrom(
          value.hp,
          value.selfHp,
          value.currentHp,
          value.self?.hp,
          value.self?.selfHp,
          value.summary?.hp,
          value.detail?.self?.hp
        );
        if (Number.isFinite(nested)) return nested;
        continue;
      }
      const n = optionalFiniteNumber(value);
      if (Number.isFinite(n)) return n;
    }
    return NaN;
  }

  function loginPointSafetyExitSelfForDetail(detail = null, meta = null, fallback = null) {
    return meta?.self
      || detail?.self
      || detail?.injury?.self
      || detail?.injury
      || detail?.combat?.self
      || detail?.offlineSafety?.self
      || fallback
      || null;
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
    const lastExitSelfHp = loginPointSafetyLastExitHp(source);
    const radiusInfo = loginPointSafetyRadiusInfo({ lastExitSelfHp });
    return {
      point,
      streak: Math.max(0, Math.round(Number(source.streak || 0) || 0)),
      required,
      radius: radiusInfo.radius,
      lowHpRadius: radiusInfo.lowHpRadius,
      healthyRadius: radiusInfo.healthyRadius,
      healthyHpThreshold: radiusInfo.healthyHpThreshold,
      radiusReason: radiusInfo.radiusReason,
      lastExitSelfHp: Number.isFinite(lastExitSelfHp) ? lastExitSelfHp : null,
      lastExitSelfHpKnown: Number.isFinite(lastExitSelfHp),
      lastExitSelfHpAt: Number(source.lastExitSelfHpAt || source.lastExitHpAt || 0) || 0,
      lastExitSelfHpReason: String(source.lastExitSelfHpReason || source.lastExitHpReason || ''),
      lastSampleAt: Number(source.lastSampleAt || source.lastOkAt || source.lastUnsafeAt || source.lastErrorAt || 0) || 0,
      lastOkAt: Number(source.lastOkAt || 0) || 0,
      lastUnsafeAt: Number(source.lastUnsafeAt || 0) || 0,
      lastErrorAt: Number(source.lastErrorAt || 0) || 0,
      lastError: String(source.lastError || ''),
      lastTick: Number(source.lastTick || 0) || 0,
      resetAt: Number(source.resetAt || 0) || 0,
      resetReason: String(source.resetReason || ''),
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
    if (Number(stored.lastExitSelfHpAt || 0) > Number(memory.lastExitSelfHpAt || 0)) {
      return normalizeLoginPointSafetyState({
        ...memory,
        lastExitSelfHp: stored.lastExitSelfHp,
        lastExitSelfHpKnown: stored.lastExitSelfHpKnown,
        lastExitSelfHpAt: stored.lastExitSelfHpAt,
        lastExitSelfHpReason: stored.lastExitSelfHpReason
      }, t);
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

  function loginPointDamageEvidence(candidate, injury = {}) {
    if (!candidate || typeof candidate !== 'object') return '';
    const rawId = candidate.user_id ?? candidate.userId ?? candidate.id;
    const incomingOwnerId = injury?.incomingBullet?.ownerId
      ?? injury?.incomingBullet?.owner_id
      ?? candidate.incomingBulletOwnerId
      ?? candidate.damageEvidence?.incomingBulletOwnerId
      ?? null;
    if (incomingOwnerId !== null && incomingOwnerId !== undefined && rawId !== undefined && rawId !== null && String(incomingOwnerId) === String(rawId)) {
      return 'incoming-bullet-owner';
    }
    if (truthyFlag(candidate.firing)
      || truthyFlag(candidate.isFiring)
      || truthyFlag(candidate.shooting)
      || truthyFlag(candidate.damageEvidence?.firing)) {
      return 'firing-near-self-hp-drop';
    }
    if (truthyFlag(candidate.combat)
      || truthyFlag(candidate.engagedCombat)
      || truthyFlag(candidate.damageEvidence?.combat)
      || String(candidate.combatIntent || candidate.damageEvidence?.combatIntent || '') === 'engaged') {
      return 'combat-engaged-self-hp-drop';
    }
    return '';
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

  function loginPointActiveModeStaminaSpent(entity) {
    const remaining = staminaRemaining(entity, '5s');
    if (remaining === null) return false;
    const limit = staminaLimitValue(entity, '5s', 10000);
    return Number.isFinite(limit) && limit > 0 && remaining < limit * cfg.staminaFullRatio;
  }

  function loginPointActiveModeDangerReason(state, entity, t) {
    if (!isJoinModeActive(entity)) return '';
    const moved = loginPointEntityMoved(state, entity, t);
    if (isFiringEntity(entity)) return 'active-mode-firing';
    if (isMovingThreat(entity) || moved) return 'active-mode-moving';
    if (loginPointActiveModeStaminaSpent(entity)) return 'active-mode-stamina-spent';
    if (truthyFlag(entity.combat)
      || truthyFlag(entity.engagedCombat)
      || String(entity.combatIntent || '') === 'engaged') {
      return 'active-mode-combat';
    }
    return '';
  }

  function loginPointDangerReason(state, entity, t) {
    if (!entity || typeof entity !== 'object') return '';
    const damagedKeys = loginPointDamageActorKeys(state);
    const key = loginPointEntityKey(entity);
    if (key && damagedKeys.has(key)) return 'damaged-self-today';
    const activeModeReason = loginPointActiveModeDangerReason(state, entity, t);
    if (activeModeReason) return activeModeReason;
    return '';
  }

  function evaluateLoginPointSafety(state, detail = {}, t = Date.now()) {
    if (!state.point) return { safe: true, reason: 'no-login-point', danger: null };
    const entities = Array.isArray(detail.entities) ? detail.entities : bot.globalState.entities;
    if (!Array.isArray(entities)) {
      return { safe: false, reason: 'snapshot-entities-missing', danger: null };
    }
    const point = state.point;
    const radius = loginPointSafetyRadius(state);
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
      const reason = loginPointDangerReason(state, entity, t);
      if (!reason) continue;
      return {
        safe: false,
        reason,
        danger: loginPointActorSummary(entity, {
          distance: Math.round(distance)
        })
      };
    }
    return { safe: true, reason: 'safe', danger: null };
  }

  function noteLoginPointSafetyProbe(success, detail = {}) {
    const t = Date.now();
    const state = readLoginPointSafetyState(t);
    state.required = loginPointSafetySuccessRequired();
    state.radius = loginPointSafetyRadius(state);
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
        state.lastDanger = null;
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
    const radiusInfo = loginPointSafetyRadiusInfo(state);
    return {
      ...state,
      required,
      radius: radiusInfo.radius,
      lowHpRadius: radiusInfo.lowHpRadius,
      healthyRadius: radiusInfo.healthyRadius,
      healthyHpThreshold: radiusInfo.healthyHpThreshold,
      radiusReason: radiusInfo.radiusReason,
      lastExitSelfHp: radiusInfo.lastExitSelfHp,
      lastExitSelfHpKnown: radiusInfo.lastExitSelfHpKnown,
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

  function resetLoginPointSafetyGate(reason = 'exit', exitSelfLike = null) {
    const t = Date.now();
    const state = readLoginPointSafetyState(t);
    const exitHp = loginPointSafetyExitSelfHpFrom(exitSelfLike);
    state.streak = 0;
    state.lastDanger = null;
    state.lastError = '';
    state.lastExitSelfHp = Number.isFinite(exitHp) ? exitHp : null;
    state.lastExitSelfHpKnown = Number.isFinite(exitHp);
    state.lastExitSelfHpAt = t;
    state.lastExitSelfHpReason = String(reason || 'exit');
    state.radius = loginPointSafetyRadius(state);
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
    ].filter(candidate => Boolean(loginPointDamageEvidence(candidate, injury)));
    if (!candidates.length) return state;
    const existing = new Map((state.damagedBy?.actors || []).map(actor => [String(actor.key || ''), actor]));
    for (const candidate of candidates) {
      const evidence = loginPointDamageEvidence(candidate, injury);
      const actor = loginPointActorSummary(candidate, { at: t, reason, evidence });
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
    if (!el) return null;
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

  function reloginCooldownCandidates(t = Date.now()) {
    const suppress = loginSuppressStatus(t);
    const candidates = [];
    const pushCandidate = (source, remainingMs, totalMs = 0, reason = '', until = 0) => {
      const remaining = Math.max(0, Math.round(Number(remainingMs || 0) || 0));
      const total = Math.max(remaining, Math.round(Number(totalMs || 0) || 0));
      if (!remaining && !total) return;
      candidates.push({
        source,
        reason: String(reason || ''),
        remainingMs: remaining,
        totalMs: total,
        until: Number(until || 0) || 0
      });
    };
    const loginCooldownTotalMs = Math.max(0, Math.round(Number(cfg.loginCooldownMs || 0) || 0));
    const loginCooldownRemainingMs = bot.lastLoginAt
      ? Math.max(0, Math.round(Number(bot.lastLoginAt || 0) + loginCooldownTotalMs - t))
      : 0;
    pushCandidate('login-cooldown', loginCooldownRemainingMs, loginCooldownTotalMs, 'login cooldown', Number(bot.lastLoginAt || 0) + loginCooldownTotalMs);
    pushCandidate('login-suppress', suppress.remainingMs, suppress.remainingMs, suppress.reason || 'login suppress', suppress.until);
    const enemyDetail = activeEnemyLeaveDetail(t);
    const enemyUntil = Math.max(Number(enemyDetail?.reloginUntil || 0) || 0, Number(bot.pursuitReloginUntil || 0) || 0);
    const enemyRemainingMs = Math.max(
      0,
      Math.round(Number(enemyDetail?.holdRemainingMs || 0) || 0),
      Math.round(enemyUntil - t)
    );
    pushCandidate(
      'enemy-hold',
      enemyRemainingMs,
      Number(enemyDetail?.reloginDelayMs || bot.lastEnemyLeaveWaitMs || enemyRemainingMs || 0),
      enemyDetail?.reason || enemyDetail?.summary || 'enemy leave hold',
      enemyUntil
    );
    const offlineDetail = activeOfflineLeaveDetail(t);
    const offlineUntil = Math.max(Number(offlineDetail?.reloginUntil || 0) || 0, Number(bot.offlineReloginUntil || 0) || 0);
    const offlineRemainingMs = Math.max(
      0,
      Math.round(Number(offlineDetail?.holdRemainingMs || 0) || 0),
      Math.round(offlineUntil - t)
    );
    pushCandidate(
      'offline-hold',
      offlineRemainingMs,
      Number(offlineDetail?.reloginDelayMs || bot.lastOfflineLeaveWaitMs || offlineRemainingMs || 0),
      offlineDetail?.reason || offlineDetail?.summary || 'offline leave hold',
      offlineUntil
    );
    const lastLoginResult = bot.lastLoginResult && typeof bot.lastLoginResult === 'object' ? bot.lastLoginResult : null;
    pushCandidate(
      'last-login-result',
      Number(lastLoginResult?.cooldownRemainingMs || 0) || 0,
      Number(lastLoginResult?.cooldownTotalMs || lastLoginResult?.cooldownRemainingMs || 0) || 0,
      lastLoginResult?.suppressReason || lastLoginResult?.reason || 'last login result',
      0
    );
    return candidates.sort((a, b) => {
      const remainingDelta = Number(b.remainingMs || 0) - Number(a.remainingMs || 0);
      if (remainingDelta) return remainingDelta;
      return Number(b.totalMs || 0) - Number(a.totalMs || 0);
    });
  }

  function summarizeReloginGateStatus(t = Date.now()) {
    const snapshotGate = snapshotLoginGateStatus(t);
    const pointSafety = snapshotGate.pointSafety || loginPointSafetyStatus(t);
    const cooldowns = reloginCooldownCandidates(t);
    const cooldown = cooldowns[0] || {
      source: 'none',
      reason: '',
      remainingMs: 0,
      totalMs: Math.max(0, Math.round(Number(cfg.loginCooldownMs || 0) || 0)),
      until: 0
    };
    const safetyRequired = Math.max(0, Math.round(Number(pointSafety.required || 0) || 0));
    const safetyStreak = Math.max(0, Math.min(safetyRequired, Math.round(Number(pointSafety.streak || 0) || 0)));
    return {
      satisfied: Boolean(
        Number(cooldown.remainingMs || 0) <= 0
          && Boolean(pointSafety.satisfied)
      ),
      cooldown: {
        source: cooldown.source,
        reason: cooldown.reason,
        remainingMs: Math.max(0, Math.round(Number(cooldown.remainingMs || 0) || 0)),
        totalMs: Math.max(0, Math.round(Number(cooldown.totalMs || 0) || 0)),
        until: Number(cooldown.until || 0) || 0,
        candidates: cooldowns.slice(0, 5)
      },
      snapshot: {
        ok: true,
        streak: Math.max(0, Math.round(Number(snapshotGate.streak || 0) || 0)),
        required: 0,
        remaining: 0,
        lastSampleAgeMs: snapshotGate.lastSampleAgeMs ?? null,
        lastOkAgeMs: snapshotGate.lastOkAgeMs ?? null,
        lastErrorAgeMs: snapshotGate.lastErrorAgeMs ?? null,
        lastError: String(snapshotGate.lastError || ''),
        resetReason: String(snapshotGate.resetReason || '')
      },
      loginPointSafety: {
        ok: Boolean(pointSafety.satisfied),
        hasPoint: Boolean(pointSafety.hasPoint),
        missingPoint: Boolean(pointSafety.missingPoint),
        streak: safetyStreak,
        required: safetyRequired,
        remaining: Math.max(0, safetyRequired - safetyStreak),
        radius: Number(pointSafety.radius || 0) || 0,
        lastSampleAgeMs: pointSafety.lastSampleAgeMs ?? null,
        lastOkAgeMs: pointSafety.lastOkAgeMs ?? null,
        lastUnsafeAgeMs: pointSafety.lastUnsafeAgeMs ?? null,
        lastErrorAgeMs: pointSafety.lastErrorAgeMs ?? null,
        lastDanger: pointSafety.lastDanger || null,
        lastError: String(pointSafety.lastError || ''),
        resetReason: String(pointSafety.resetReason || '')
      }
    };
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
    finalizeLeaveDisplayReasonForControlLoginCore(detail, (base, value) => leaveWaitDisplayForControlLoginCore(base, value, formatDurationMs));
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

	  function summarizePursuit(pursuit = bot.pursuit) {
	    if (!pursuit) return null;
	    const t = now();
	    const lastSeenAt = Number(pursuit.lastSeenAt || pursuit.startedAt || t);
	    const thresholdMs = Number.isFinite(Number(pursuit.thresholdMs)) ? Number(pursuit.thresholdMs) : cfg.pursuitLeaveMs;
	    return {
	      id: pursuit.id,
	      name: pursuit.name || '',
      distance: Number.isFinite(Number(pursuit.distance)) ? Math.round(Number(pursuit.distance)) : null,
      speed: Number.isFinite(Number(pursuit.speed)) ? Math.round(Number(pursuit.speed)) : null,
      moving: Boolean(pursuit.moving),
	      active: Boolean(pursuit.active),
	      reason: pursuit.reason || '',
	      durationMs: Math.max(0, Math.round(Number(pursuit.durationMs ?? (lastSeenAt - Number(pursuit.startedAt || lastSeenAt))))),
	      thresholdMs,
	      invulnerable: Boolean(pursuit.invulnerable),
	      nonFullHp: Boolean(pursuit.nonFullHp),
	      combatSuppressed: Boolean(pursuit.combatSuppressed),
      lastSeenAgeMs: Math.max(0, Math.round(t - lastSeenAt)),
      towardScore: Number.isFinite(Number(pursuit.towardScore)) ? Number(pursuit.towardScore).toFixed(2) : null,
      closingDistance: Number.isFinite(Number(pursuit.closingDistance)) ? Math.round(Number(pursuit.closingDistance)) : null
    };
  }

  function cloneForPendingExit(value) {
    if (!value || typeof value !== 'object') return value || null;
    return safeJsonClone(value) || { ...value };
  }

  function pendingExitRetryCoreOptions() {
    return {
      leaveRetryMinMs: cfg.leaveRetryMinMs,
      leaveCommandTimeoutMs: cfg.leaveCommandTimeoutMs,
      offlineLeaveRetryMs: cfg.offlineLeaveRetryMs,
      combatLeaveRetryMs: cfg.combatLeaveRetryMs,
      pursuitLeaveRetryMs: cfg.pursuitLeaveRetryMs
    };
  }

  function pendingExitSkipNewLeave(source, reason, extra = {}) {
    const pending = bot.pendingExit;
    if (!pending) return null;
    const summary = pending.summary || extra.summary || String(reason || '').trim() || '退出请求已发送';
    return finalizeLeaveDisplayReasonForPendingExitCore({
      ...extra,
      attempted: false,
      method: '',
      reason: 'pending-exit-active',
      skippedNewLeave: true,
      skippedSource: source || '',
      skippedReason: reason || '',
      exitPending: true,
      exitConfirmed: false,
      pendingExit: (() => {
        const pendingExitSummaryPending = pending;
        if (!pendingExitSummaryPending) return null;
        const pendingExitSummaryNow = Date.now();
        const pendingExitSummaryReload = normalizePendingExitReloadConfirmationCore(pendingExitSummaryPending.reloadConfirmation, pendingExitSummaryPending, pendingExitSummaryNow);
        return summarizePendingExitCore(pendingExitSummaryPending, {
          nowMs: pendingExitSummaryNow,
          retryMs: pendingExitRetryMsCore(pendingExitSummaryPending, {
        leaveRetryMinMs: cfg.leaveRetryMinMs,
        leaveCommandTimeoutMs: cfg.leaveCommandTimeoutMs,
        offlineLeaveRetryMs: cfg.offlineLeaveRetryMs,
        combatLeaveRetryMs: cfg.combatLeaveRetryMs,
        pursuitLeaveRetryMs: cfg.pursuitLeaveRetryMs
      }),
          reloadConfirmation: pendingExitSummaryReload
        });
      })(),
      summary,
      error: ''
    }, (base, value) => leaveWaitDisplayForPendingExitCore(base, value, formatDurationMs));
  }

  function pendingExitIntentForSkippedLeave(source, reason, detail = null) {
    return {
      reason: 'pending-exit-active',
      source: source || '',
      skippedReason: reason || '',
      summary: detail?.summary || bot.pendingExit?.summary || '',
      pendingExit: (() => {
        const pendingExitSummaryPending = bot.pendingExit;
        if (!pendingExitSummaryPending) return null;
        const pendingExitSummaryNow = Date.now();
        const pendingExitSummaryReload = normalizePendingExitReloadConfirmationCore(pendingExitSummaryPending.reloadConfirmation, pendingExitSummaryPending, pendingExitSummaryNow);
        return summarizePendingExitCore(pendingExitSummaryPending, {
          nowMs: pendingExitSummaryNow,
          retryMs: pendingExitRetryMsCore(pendingExitSummaryPending, {
        leaveRetryMinMs: cfg.leaveRetryMinMs,
        leaveCommandTimeoutMs: cfg.leaveCommandTimeoutMs,
        offlineLeaveRetryMs: cfg.offlineLeaveRetryMs,
        combatLeaveRetryMs: cfg.combatLeaveRetryMs,
        pursuitLeaveRetryMs: cfg.pursuitLeaveRetryMs
      }),
          reloadConfirmation: pendingExitSummaryReload
        });
      })()
    };
  }

  function recordPendingExitResult(source, detail, t = Date.now()) {
    if (source === 'offline') {
      bot.lastOfflineLeaveAt = t;
      bot.lastOfflineLeaveResult = detail;
    } else if (source === 'pursuit') {
      bot.lastPursuitLeaveAt = t;
      bot.lastPursuitLeaveResult = detail;
    } else if (source === 'injury') {
      bot.lastInjuryLeaveAt = t;
      bot.lastInjuryLeaveResult = detail;
    } else {
      bot.lastCombatLeaveAt = t;
      bot.lastCombatLeaveResult = detail;
    }
  }

  function rememberPendingExit(scope, source, detail, selfLike = null) {
    if (!detail?.attempted && !detail?.exitAuditId) return null;
    const t = Date.now();
    const previous = bot.pendingExit && bot.pendingExit.scope === scope ? bot.pendingExit : null;
    const summary = detail.summary || detail.exitSummary || detail.enemyLeaveSummary || previous?.summary || detail.reason || '';
    const pending = {
      scope,
      source,
      reason: detail.reason || previous?.reason || '',
      summary,
      displayReason: pendingExitDisplayReasonCore(summary),
      at: Number(previous?.at || detail.at || t),
      updatedAt: t,
      lastAttemptAt: Number(detail.at || t),
      retryCount: Number(previous?.retryCount || 0) + 1,
      retryMs: pendingExitRetryMsCore({ scope, source }, pendingExitRetryCoreOptions()),
      userId: detail.userId || getCurrentUserId() || previous?.userId || null,
      self: cloneForPendingExit(selfLike || detail.self || previous?.self || null),
      offlineSafety: cloneForPendingExit(detail.offlineSafety || previous?.offlineSafety || null),
      target: cloneForPendingExit(detail.target || previous?.target || null),
      pursuit: cloneForPendingExit(detail.pursuit || previous?.pursuit || null),
      injury: cloneForPendingExit(detail.injury || previous?.injury || null),
      combat: cloneForPendingExit(detail.combat || previous?.combat || null),
      combatCover: cloneForPendingExit(detail.combatCover || detail.combat?.leaveCover || previous?.combatCover || null),
      lastResult: cloneForPendingExit(detail)
    };
	    bot.pendingExit = pending;
	    detail.exitPending = true;
	    detail.exitConfirmed = false;
	    detail.pendingExit = (() => {
        const pendingExitSummaryPending = pending;
        if (!pendingExitSummaryPending) return null;
        const pendingExitSummaryNow = Date.now();
        const pendingExitSummaryReload = normalizePendingExitReloadConfirmationCore(pendingExitSummaryPending.reloadConfirmation, pendingExitSummaryPending, pendingExitSummaryNow);
        return summarizePendingExitCore(pendingExitSummaryPending, {
          nowMs: pendingExitSummaryNow,
          retryMs: pendingExitRetryMsCore(pendingExitSummaryPending, {
        leaveRetryMinMs: cfg.leaveRetryMinMs,
        leaveCommandTimeoutMs: cfg.leaveCommandTimeoutMs,
        offlineLeaveRetryMs: cfg.offlineLeaveRetryMs,
        combatLeaveRetryMs: cfg.combatLeaveRetryMs,
        pursuitLeaveRetryMs: cfg.pursuitLeaveRetryMs
      }),
          reloadConfirmation: pendingExitSummaryReload
        });
      })();
	    detail.displayReason = pending.displayReason;
	    writePersistentPendingExitStateCore(localStorage, PENDING_EXIT_STATE_KEY, (pending) || bot.pendingExit, Date.now(), pendingExitPersistenceCoreHelpers());
	    if (leaveDetailSucceededCore(detail) && !leaveDetailHasHttp403Core(detail)) {
	      requestPendingExitLeaveSuccessReload(detail, 'leave-success');
	    }
	    return pending;
	  }

  function pendingExitSelfState(self) {
    const userId = getCurrentUserId();
    if (!userId) return { known: true, alive: false, source: 'no-current-user-id', self: null };
    try {
      const nativeSelf = typeof getOwnEntity === 'function' ? getOwnEntity() : null;
      if (nativeSelf && Number(nativeSelf.user_id) === userId) {
        return { known: true, alive: Boolean(isAlive(nativeSelf)), source: 'native-own', self: summarizeSelf(nativeSelf) };
      }
    } catch (_) {}
    const nativeState = getNativeState();
    const nativeEntities = Array.isArray(nativeState?.entities) ? nativeState.entities : null;
    if (nativeEntities) {
      const nativeSelf = nativeEntities.find(entity => Number(entity.user_id) === userId) || null;
      if (nativeSelf) {
        return {
          known: true,
          alive: Boolean(isAlive(nativeSelf)),
          source: 'native-entities',
          self: summarizeSelf(nativeSelf)
        };
      }
    }
    if (self) {
      return { known: true, alive: Boolean(isAlive(self)), source: 'tick-self', self: summarizeSelf(self) };
    }
    if (hasNativeGameSession(getNativeControl(), userId)) {
      return { known: false, alive: false, source: 'native-session-pending', self: null };
    }
    if (hasLoginRequiredText() || findLoginControl()) {
      return { known: true, alive: false, source: 'login-required', self: null };
    }
    if (snapshotSelfFreshEnough()) {
      const snapshotSelf = (bot.globalState.entities || []).find(entity => Number(entity.user_id) === userId) || null;
      return {
        known: true,
        alive: Boolean(snapshotSelf && isAlive(snapshotSelf)),
        source: 'snapshot',
        self: snapshotSelf ? summarizeSelf(snapshotSelf) : null
      };
    }
    return { known: false, alive: false, source: 'unknown', self: null };
  }

  function escapeRegExpLiteral(value) {
    return String(value || '').replace(/[.*+?^$()|[]\{}]/g, '\$&');
  }

  function chatLeftUserMessageSeen(userId = getCurrentUserId()) {
    const id = String(userId || '').trim();
    if (!id) return false;
    const pattern = new RegExp('(?:^|\\b)left\\s+user\\s+' + escapeRegExpLiteral(id) + '(?:\\b|$)', 'i');
    const selectors = [
      '#chat',
      '#chatLog',
      '#chatMessages',
      '.chat',
      '.chat-log',
      '.chat-messages',
      '.messages',
      '.side'
    ];
    const roots = [];
    for (const selector of selectors) {
      try {
        document.querySelectorAll(selector).forEach(el => {
          if (el && !roots.includes(el)) roots.push(el);
        });
      } catch (_) {}
    }
    if (!roots.length && document.body) roots.push(document.body);
    for (const root of roots) {
      const text = String(root?.innerText || root?.textContent || '');
      if (pattern.test(text)) return true;
    }
    return false;
  }

  function ownEntityDisappearedState(self, userId = getCurrentUserId()) {
    const id = Number(userId || 0);
    if (!id) return { known: false, present: false, disappeared: false, sources: [] };
    let known = false;
    let present = false;
    const sources = [];
    try {
      if (typeof getOwnEntity === 'function') {
        known = true;
        sources.push('native-own');
        const nativeSelf = getOwnEntity();
        if (nativeSelf && Number(nativeSelf.user_id) === id && isAlive(nativeSelf)) present = true;
      }
    } catch (_) {}
    const nativeState = getNativeState();
    const nativeEntities = Array.isArray(nativeState?.entities) ? nativeState.entities : null;
    if (nativeEntities) {
      known = true;
      sources.push('native-entities');
      const nativeSelf = nativeEntities.find(entity => Number(entity.user_id) === id) || null;
      if (nativeSelf && isAlive(nativeSelf)) present = true;
    }
    if (self) {
      known = true;
      sources.push('tick-self');
      if (Number(self.user_id) === id && isAlive(self)) present = true;
    }
    if (snapshotSelfFreshEnough()) {
      known = true;
      sources.push('snapshot');
      const snapshotSelf = (bot.globalState.entities || []).find(entity => Number(entity.user_id) === id) || null;
      if (snapshotSelf && isAlive(snapshotSelf)) present = true;
    }
    return {
      known,
      present,
      disappeared: Boolean(known && !present),
      sources
    };
  }

  function pendingExitLocalConfirmationState(pending, self, state = null) {
    const userId = Number(pending?.userId || getCurrentUserId() || 0);
    const tokenCleared = !getSessionToken();
    const chatLeftUser = chatLeftUserMessageSeen(userId);
    const ownEntity = ownEntityDisappearedState(self, userId);
    const control = summarizeControl();
    const sessionMismatch = controlHasAuthoritativeSessionMismatch(control);
    const confirmed = Boolean(tokenCleared && chatLeftUser && ownEntity.disappeared && !sessionMismatch);
    return {
      known: confirmed,
      alive: false,
      source: confirmed
        ? 'token-chat-left-user-self-missing'
        : (sessionMismatch ? 'local-exit-session-mismatch' : 'local-exit-evidence-incomplete'),
      self: null,
      localExitConfirmation: true,
      confirmed,
      tokenCleared,
      chatLeftUser,
      ownEntity,
      control,
      sessionMismatch,
      previousState: state || null
    };
  }

	  function attachLeaveSuccessReloadConfirmation(pending, detail, t = Date.now()) {
	    if (!pending || !leaveDetailSucceededCore(detail) || leaveDetailHasHttp403Core(detail)) return null;
	    const reloadConfirmation = leaveSuccessReloadConfirmationForDetailCore(detail, pending, t, { normalizeReloadConfirmation: normalizePendingExitReloadConfirmationCore });
	    pending.reloadConfirmation = reloadConfirmation;
	    pending.updatedAt = t;
	    if (pending.lastResult && typeof pending.lastResult === 'object') {
	      pending.lastResult.reloadConfirmation = reloadConfirmation;
	      pending.lastResult.exitPending = true;
	      pending.lastResult.exitConfirmed = false;
	    }
	    detail.reloadConfirmation = reloadConfirmation;
	    detail.exitPending = true;
	    detail.exitConfirmed = false;
	    detail.pendingExit = (() => {
        const pendingExitSummaryPending = pending;
        if (!pendingExitSummaryPending) return null;
        const pendingExitSummaryNow = Date.now();
        const pendingExitSummaryReload = normalizePendingExitReloadConfirmationCore(pendingExitSummaryPending.reloadConfirmation, pendingExitSummaryPending, pendingExitSummaryNow);
        return summarizePendingExitCore(pendingExitSummaryPending, {
          nowMs: pendingExitSummaryNow,
          retryMs: pendingExitRetryMsCore(pendingExitSummaryPending, {
        leaveRetryMinMs: cfg.leaveRetryMinMs,
        leaveCommandTimeoutMs: cfg.leaveCommandTimeoutMs,
        offlineLeaveRetryMs: cfg.offlineLeaveRetryMs,
        combatLeaveRetryMs: cfg.combatLeaveRetryMs,
        pursuitLeaveRetryMs: cfg.pursuitLeaveRetryMs
      }),
          reloadConfirmation: pendingExitSummaryReload
        });
      })();
	    writePersistentPendingExitStateCore(localStorage, PENDING_EXIT_STATE_KEY, (pending) || bot.pendingExit, Date.now(), pendingExitPersistenceCoreHelpers());
	    return reloadConfirmation;
	  }

	  function pendingExitLeaveSuccessReloadWaitDetail(pending, detail, state, reason, displayReason) {
	    const wait = cloneForPendingExit(detail || pending?.lastResult || {}) || {};
	    wait.attempted = Boolean(wait.attempted);
	    wait.error = '';
	    wait.exitPending = true;
	    wait.exitConfirmed = false;
	    wait.reason = reason || wait.reason || pending?.reason || 'leave-success';
	    wait.summary = wait.summary || pending?.summary || wait.reason || '';
	    wait.displayReason = displayReason || wait.displayReason || 'leave接口已返回成功，刷新页面确认服务端在线状态';
	    wait.pendingExit = (() => {
        const pendingExitSummaryPending = pending;
        if (!pendingExitSummaryPending) return null;
        const pendingExitSummaryNow = Date.now();
        const pendingExitSummaryReload = normalizePendingExitReloadConfirmationCore(pendingExitSummaryPending.reloadConfirmation, pendingExitSummaryPending, pendingExitSummaryNow);
        return summarizePendingExitCore(pendingExitSummaryPending, {
          nowMs: pendingExitSummaryNow,
          retryMs: pendingExitRetryMsCore(pendingExitSummaryPending, {
        leaveRetryMinMs: cfg.leaveRetryMinMs,
        leaveCommandTimeoutMs: cfg.leaveCommandTimeoutMs,
        offlineLeaveRetryMs: cfg.offlineLeaveRetryMs,
        combatLeaveRetryMs: cfg.combatLeaveRetryMs,
        pursuitLeaveRetryMs: cfg.pursuitLeaveRetryMs
      }),
          reloadConfirmation: pendingExitSummaryReload
        });
      })();
	    wait.exitConfirmation = state || null;
	    return wait;
	  }

	  function requestPendingExitLeaveSuccessReload(detail, label = 'leave-success') {
	    const pending = bot.pendingExit;
	    if (!pending || !detail?.exitAuditId) return false;
	    const pendingAuditId = pending.lastResult?.exitAuditId || '';
	    if (pendingAuditId && pendingAuditId !== detail.exitAuditId) return false;
	    const reloadConfirmation = attachLeaveSuccessReloadConfirmation(pending, detail);
	    if (!reloadConfirmation) return false;
	    return requestLeaveConfirmationReload(label, pending);
	  }

	  function leaveSuccessReloadUnknownGraceMs() {
	    return Math.max(0, Number(cfg.leaveSuccessReloadUnknownGraceMs || 12000) || 0);
	  }

  function leave403ReloginDelayMs() {
    return Math.max(3600000, Number(cfg.leave403ReloginDelayMs || 0) || 0);
  }

  function leave403SnapshotSuccessRequired() {
    return Math.max(1, Math.round(Number(cfg.leave403SnapshotSuccessRequired || 5) || 5));
  }

  function leaveDetailHasHttp403RiskControl(detail) {
    if (!detail || typeof detail !== 'object') return false;
    return Boolean(
      detail.http403RiskControl
        || detail.http403RiskControlCleared
        || String(detail.reloginMinimumReason || '').includes('leave HTTP 403')
        || leaveDetailHasHttp403Core(detail)
    );
  }

  function leave403RiskHoldActive(detail, t = Date.now()) {
    return Boolean(
      leaveDetailHasHttp403RiskControl(detail)
        && Number(detail?.reloginUntil || 0) > t
    );
  }

  function currentLeave403RiskHolds(t = Date.now()) {
    const enemy = activeEnemyLeaveDetail(t);
    const offline = activeOfflineLeaveDetail(t);
    const enemyActive = leave403RiskHoldActive(enemy, t);
    const offlineActive = leave403RiskHoldActive(offline, t);
    return {
      enemy: enemyActive ? enemy : null,
      offline: offlineActive ? offline : null,
      active: Boolean(enemyActive || offlineActive)
    };
  }

  function clearLeave403RiskDetail(detail, reason, recovery, t = Date.now()) {
    if (!leaveDetailHasHttp403RiskControl(detail)) return false;
    const reloginUntil = Number(detail.reloginUntil || 0) || 0;
    const previousHoldMs = Math.max(0, Math.round(reloginUntil - t));
    if (reloginUntil && !detail.leave403PreviousReloginUntil) detail.leave403PreviousReloginUntil = reloginUntil;
    if (previousHoldMs && !detail.leave403PreviousHoldMs) detail.leave403PreviousHoldMs = previousHoldMs;
    detail.leave403SnapshotRecoveredAt = t;
    detail.leave403SnapshotRecoveryReason = reason;
    detail.leave403SnapshotSuccessStreak = Number(recovery?.streak || 0);
    detail.leave403SnapshotSuccessRequired = leave403SnapshotSuccessRequired();
    detail.http403RiskControlCleared = true;
    detail.reloginUntil = 0;
    detail.holdRemainingMs = 0;
    detail.reloginDelayMs = 0;
    detail.reloginHpDelayMs = 0;
    detail.reloginMinimumDelayMs = 0;
    detail.reloginMinimumUntil = 0;
    detail.reloginMinimumReason = '';
    finalizeLeaveDisplayReasonForPendingExitCore(detail, (base, value) => leaveWaitDisplayForPendingExitCore(base, value, formatDurationMs));
    return true;
  }

  function clearLeave403RiskHolds(reason = 'snapshot success streak') {
    const t = Date.now();
    const recovery = bot.leave403SnapshotRecovery || {};
    const enemyPersistent = readPersistentExitState(ENEMY_LEAVE_STATE_KEY, t);
    const offlinePersistent = readPersistentExitState(OFFLINE_LEAVE_STATE_KEY, t);
    const enemyDetails = [
      bot.lastEnemyLeaveResult,
      bot.lastCombatLeaveResult,
      bot.lastPursuitLeaveResult,
      bot.lastInjuryLeaveResult,
      enemyPersistent
    ].filter(Boolean);
    const offlineDetails = [bot.lastOfflineLeaveResult, offlinePersistent].filter(Boolean);
    let clearedEnemy = false;
    let clearedOffline = false;
    for (const detail of enemyDetails) {
      if (leave403RiskHoldActive(detail, t) && clearLeave403RiskDetail(detail, reason, recovery, t)) clearedEnemy = true;
    }
    for (const detail of offlineDetails) {
      if (leave403RiskHoldActive(detail, t) && clearLeave403RiskDetail(detail, reason, recovery, t)) clearedOffline = true;
    }
    if (!clearedEnemy && !clearedOffline) return false;
    if (clearedEnemy) {
      bot.pursuitReloginUntil = 0;
      bot.lastEnemyLeaveWaitMs = 0;
      clearPersistentExitState(ENEMY_LEAVE_STATE_KEY);
    }
    if (clearedOffline) {
      bot.offlineReloginUntil = 0;
      bot.lastOfflineLeaveWaitMs = 0;
      clearPersistentExitState(OFFLINE_LEAVE_STATE_KEY);
    }
    clearLoginSuppressMatchingBoundCore(localStorage,
      clearedEnemy && clearedOffline
        ? /enemy leave|offline.*leave|combat leave|pursuit leave/i
        : (clearedEnemy ? /enemy leave|combat leave|pursuit leave/i : /offline.*leave/i)
    , { loginSuppressKey: LOGIN_SUPPRESS_KEY, loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY });
    bot.leave403SnapshotRecovery = {
      ...recovery,
      required: leave403SnapshotSuccessRequired(),
      clearedAt: t,
      clearedReason: reason,
      lastError: ''
    };
    logStatus('leave 403 risk control cleared by snapshot success', {
      kind: 'wait',
      reason: 'leave-403-snapshot-recovered',
      leave403SnapshotRecovery: bot.leave403SnapshotRecovery,
      clearedEnemy,
      clearedOffline
    });
    return true;
  }

  function noteLeave403SnapshotProbe(success, detail = {}) {
    const t = Date.now();
    const recovery = bot.leave403SnapshotRecovery || {};
    const required = leave403SnapshotSuccessRequired();
    bot.leave403SnapshotRecovery = {
      streak: Math.max(0, Number(recovery.streak || 0) || 0),
      required,
      lastOkAt: Number(recovery.lastOkAt || 0) || 0,
      lastErrorAt: Number(recovery.lastErrorAt || 0) || 0,
      lastError: String(recovery.lastError || ''),
      clearedAt: Number(recovery.clearedAt || 0) || 0,
      clearedReason: String(recovery.clearedReason || '')
    };
    const holds = currentLeave403RiskHolds(t);
    if (!holds.active) {
      bot.leave403SnapshotRecovery.streak = 0;
      return false;
    }
    if (success) {
      bot.leave403SnapshotRecovery.streak = Math.min(required, bot.leave403SnapshotRecovery.streak + 1);
      bot.leave403SnapshotRecovery.lastOkAt = t;
      bot.leave403SnapshotRecovery.lastError = '';
      if (bot.leave403SnapshotRecovery.streak >= required) {
        return clearLeave403RiskHolds('snapshot success streak');
      }
      return false;
    }
    bot.leave403SnapshotRecovery.streak = 0;
    bot.leave403SnapshotRecovery.lastErrorAt = t;
    bot.leave403SnapshotRecovery.lastError = String(detail.error || detail.message || '');
    return false;
  }

	  function confirmPendingExit(pending, state) {
	    const t = Date.now();
	    const detail = cloneForPendingExit(pending.lastResult || {}) || {};
	    stopMotionAfterExit('exit-confirmed');
	    detail.reason = detail.reason || pending.reason || '';
	    detail.summary = detail.summary || pending.summary || detail.reason || '';
	    detail.userId = detail.userId || pending.userId || getCurrentUserId() || null;
    detail.self = detail.self || pending.self || null;
    detail.attempted = Boolean(detail.attempted);
    detail.error = '';
    detail.exitPending = false;
	    detail.exitConfirmed = true;
	    detail.exitConfirmedAt = t;
	    detail.exitConfirmation = state || null;
	    detail.loginSnapshotGateReset = resetLoginSnapshotGate(
	      'exit-confirmed:' + (detail.reason || pending.reason || ''),
	      loginPointSafetyExitSelfForDetail(detail, { self: pending.self || state?.self || null }, bot.lastSelf)
	    );
	    detail.pendingExitAgeMs = pending.at ? Math.max(0, Math.round(t - Number(pending.at || t))) : 0;
    detail.pendingExitRetryCount = Number(pending.retryCount || 0);
    const http403 = Boolean(state?.http403 || leaveDetailHasHttp403Core(detail));
    const suppressOptions = http403
      ? {
        minimumUntil: t + leave403ReloginDelayMs(),
        minimumReason: 'leave HTTP 403 risk control'
      }
      : {};
    if (http403) {
      detail.http403RiskControl = true;
      detail.riskControlReloginDelayMs = leave403ReloginDelayMs();
    }
	    bot.pendingCombatLeave = null;
	    bot.pendingInjuryLeave = null;
	    bot.pursuit = null;
	    if (bot.lastSafety) bot.lastSafety.pursuit = null;
	    clearCombatEngagement('exit-confirmed');
	    if (pending.scope === 'offline') {
	      setOfflineLeaveSuppressBoundCore(bot, localStorage, detail.reason || 'websocket offline', detail, detail.self || pending.self || null, suppressOptions, { cfg, loginSuppressKey: LOGIN_SUPPRESS_KEY, loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY, enemyLeaveStreakKey: ENEMY_LEAVE_STREAK_KEY, enemyLeaveStateKey: ENEMY_LEAVE_STATE_KEY, offlineLeaveStateKey: OFFLINE_LEAVE_STATE_KEY, hpInfoForRelogin, reloginDelayForHp: (selfLike, detail) => reloginDelayForHpCore(selfLike, detail, { cfg, hpInfoForRelogin, randomBetween, clamp }), clearLoginSuppressMatching: pattern => clearLoginSuppressMatchingBoundCore(localStorage, pattern, { loginSuppressKey: LOGIN_SUPPRESS_KEY, loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY }), finalizeLeaveDisplayReason: detail => finalizeLeaveDisplayReasonForPendingExitCore(detail, (base, value) => leaveWaitDisplayForPendingExitCore(base, value, formatDurationMs)), writePersistentExitState, setLoginSuppress, staminaBudgetReloginDelayMs, staminaResetHoldUntil, now: Date.now });
	    } else {
	      setExitReloginSuppressBoundCore(bot, localStorage, 'enemy leave', detail.reason || 'enemy leave', detail, detail.self || pending.self || detail.injury?.self || detail.injury || null, suppressOptions, { cfg, loginSuppressKey: LOGIN_SUPPRESS_KEY, loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY, enemyLeaveStreakKey: ENEMY_LEAVE_STREAK_KEY, enemyLeaveStateKey: ENEMY_LEAVE_STATE_KEY, offlineLeaveStateKey: OFFLINE_LEAVE_STATE_KEY, hpInfoForRelogin, reloginDelayForHp: (selfLike, detail) => reloginDelayForHpCore(selfLike, detail, { cfg, hpInfoForRelogin, randomBetween, clamp }), clearLoginSuppressMatching: pattern => clearLoginSuppressMatchingBoundCore(localStorage, pattern, { loginSuppressKey: LOGIN_SUPPRESS_KEY, loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY }), finalizeLeaveDisplayReason: detail => finalizeLeaveDisplayReasonForPendingExitCore(detail, (base, value) => leaveWaitDisplayForPendingExitCore(base, value, formatDurationMs)), writePersistentExitState, setLoginSuppress, now: Date.now });
	      if (pending.source === 'combat') bot.lastCombatLeaveResult = detail;
	      if (pending.source === 'pursuit') bot.lastPursuitLeaveResult = detail;
	      if (pending.source === 'injury') bot.lastInjuryLeaveResult = detail;
	    }
    bot.pendingExit = null;
    clearPersistentPendingExitState();
    recordExitAuditEvent('exit-confirmed', detail, {
      at: t,
      confirmedAt: t,
      confirmation: state || null,
      source: pending.source || detail.exitAuditSource || '',
      scope: pending.scope || detail.exitAuditScope || ''
    });
    noteImportantSessionExit('exit-confirmed:' + (detail.reason || pending.reason || ''), detail.self || pending.self || bot.lastSelf, t, { exit: detail });
    return detail;
  }

  function pendingExitWaitDecision(pending, self, leaveResult, state, confirmed = false) {
    const activeDetail = pending.scope === 'offline' ? activeOfflineLeaveDetail() : activeEnemyLeaveDetail();
    const currentSummary = state?.self || (self && isAlive(self) ? summarizeSelf(self) : (pending.self || bot.lastSelf || null));
    const cover = !confirmed && pending.source === 'combat' ? pending.combatCover : null;
    return {
      kind: 'wait',
      reason: pendingExitWaitReasonCore(pending, confirmed),
      dx: cover ? clamp(Math.round(Number(cover.dx) || 0), -1, 1) : 0,
      dy: cover ? clamp(Math.round(Number(cover.dy) || 0), -1, 1) : 0,
      self: currentSummary,
      currentUserId: getCurrentUserId(),
      control: summarizeControl(),
      combat: !confirmed && Boolean(cover),
      shoot: Boolean(cover?.shoot),
      forceShoot: Boolean(cover?.forceShoot),
      shootEveryMs: cover?.shootEveryMs,
      target: confirmed ? null : (cover?.target || pending.target || null),
      aimTarget: confirmed ? null : (cover?.aimTarget || null),
      incomingBullet: cover?.incomingBullet || null,
      combatState: pending.combat || null,
      combatCover: confirmed ? null : (cover || null),
      displayReason: leaveResult?.displayReason || activeDetail?.displayReason || pending.displayReason || '',
      leave: leaveResult,
      pendingExit: (() => {
        const pendingExitSummaryPending = bot.pendingExit || pending;
        if (!pendingExitSummaryPending) return null;
        const pendingExitSummaryNow = Date.now();
        const pendingExitSummaryReload = normalizePendingExitReloadConfirmationCore(pendingExitSummaryPending.reloadConfirmation, pendingExitSummaryPending, pendingExitSummaryNow);
        return summarizePendingExitCore(pendingExitSummaryPending, {
          nowMs: pendingExitSummaryNow,
          retryMs: pendingExitRetryMsCore(pendingExitSummaryPending, {
        leaveRetryMinMs: cfg.leaveRetryMinMs,
        leaveCommandTimeoutMs: cfg.leaveCommandTimeoutMs,
        offlineLeaveRetryMs: cfg.offlineLeaveRetryMs,
        combatLeaveRetryMs: cfg.combatLeaveRetryMs,
        pursuitLeaveRetryMs: cfg.pursuitLeaveRetryMs
      }),
          reloadConfirmation: pendingExitSummaryReload
        });
      })(),
      exitConfirmation: state || null,
      holdRemainingMs: activeDetail?.holdRemainingMs ?? (pending.scope === 'offline' ? offlineReloginHoldRemainingMsForPendingExitBoundCore(bot, localStorage, { loginSuppressKey: LOGIN_SUPPRESS_KEY, loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY, readPersistentExitState, offlineLeaveStateKey: OFFLINE_LEAVE_STATE_KEY, staleOfflineStaminaHoldContradicted, clearOfflineReloginHold: reason => clearOfflineReloginHoldForPendingExitBoundCore(bot, localStorage, reason, { now: Date.now, writePersistentPendingExitState: pending => writePersistentPendingExitStateCore(localStorage, PENDING_EXIT_STATE_KEY, pending || bot.pendingExit, Date.now(), pendingExitPersistenceCoreHelpers()), clearPersistentPendingExitState, clearPersistentExitState, loginSuppressKey: LOGIN_SUPPRESS_KEY, loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY, offlineLeaveStateKey: OFFLINE_LEAVE_STATE_KEY }), now: Date.now }) : enemyReloginHoldRemainingMsForPendingExitBoundCore(bot, localStorage, { loginSuppressKey: LOGIN_SUPPRESS_KEY, loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY, readPersistentExitState, enemyLeaveStateKey: ENEMY_LEAVE_STATE_KEY, now: Date.now }))
    };
  }

  function applyCombatExitCover(pending, self = null) {
    const cover = pending?.source === 'combat' ? pending.combatCover : null;
    if (!cover || !self || !isAlive(self)) return false;
    const action = {
      kind: 'wait',
      combat: true,
      dx: cover.dx,
      dy: cover.dy
    };
    sendActionVelocity(action);
    if (cover.shoot && cover.target && self) {
      shootAt(self, cover.aimTarget || cover.target, Boolean(cover.forceShoot), { shootEveryMs: cover.shootEveryMs });
    }
    return true;
  }

  async function retryPendingExit(pending, self, state) {
    const t = Date.now();
    const retryMs = pendingExitRetryMsCore(pending, pendingExitRetryCoreOptions());
    const lastAttemptAt = Number(pending.lastAttemptAt || 0);
    if (lastAttemptAt && t - lastAttemptAt < retryMs) {
      const detail = {
        attempted: false,
        reason: 'cooldown',
        cooldownRemainingMs: Math.max(0, Math.round(retryMs - (t - lastAttemptAt))),
        summary: pending.summary || '',
        displayReason: pending.displayReason || '',
        exitPending: true,
        exitConfirmed: false,
        pendingExit: (() => {
        const pendingExitSummaryPending = pending;
        if (!pendingExitSummaryPending) return null;
        const pendingExitSummaryNow = Date.now();
        const pendingExitSummaryReload = normalizePendingExitReloadConfirmationCore(pendingExitSummaryPending.reloadConfirmation, pendingExitSummaryPending, pendingExitSummaryNow);
        return summarizePendingExitCore(pendingExitSummaryPending, {
          nowMs: pendingExitSummaryNow,
          retryMs: pendingExitRetryMsCore(pendingExitSummaryPending, {
        leaveRetryMinMs: cfg.leaveRetryMinMs,
        leaveCommandTimeoutMs: cfg.leaveCommandTimeoutMs,
        offlineLeaveRetryMs: cfg.offlineLeaveRetryMs,
        combatLeaveRetryMs: cfg.combatLeaveRetryMs,
        pursuitLeaveRetryMs: cfg.pursuitLeaveRetryMs
      }),
          reloadConfirmation: pendingExitSummaryReload
        });
      })(),
        exitConfirmation: state || null
      };
      return detail;
    }
    const detail = cloneForPendingExit(pending.lastResult || {}) || {};
    detail.at = t;
    detail.attempted = false;
    detail.method = '';
    detail.error = '';
    detail.reason = pending.reason || detail.reason || '';
    detail.summary = pending.summary || detail.summary || detail.reason || '';
    detail.userId = getCurrentUserId() || pending.userId || detail.userId || null;
    detail.self = state?.self || (self && isAlive(self) ? summarizeSelf(self) : (pending.self || detail.self || null));
    detail.offlineSafety = detail.offlineSafety || pending.offlineSafety || null;
    detail.target = detail.target || pending.target || null;
    detail.pursuit = detail.pursuit || pending.pursuit || null;
    detail.injury = detail.injury || pending.injury || null;
    detail.combat = detail.combat || pending.combat || null;
    detail.combatCover = detail.combatCover || pending.combatCover || detail.combat?.leaveCover || null;
    resetClashLeaveRescueRoundForPendingExitCore(detail);
    detail.exitPending = true;
    detail.exitConfirmed = false;
    detail.pendingExitRetry = true;
    detail.exitConfirmation = state || null;
    bot.pendingExit = {
      ...pending,
      updatedAt: t,
      lastAttemptAt: t,
      lastResult: cloneForPendingExit(detail)
    };
    writePersistentPendingExitStateCore(localStorage, PENDING_EXIT_STATE_KEY, (bot.pendingExit) || bot.pendingExit, Date.now(), pendingExitPersistenceCoreHelpers());
    detail.pendingExit = (() => {
        const pendingExitSummaryPending = bot.pendingExit;
        if (!pendingExitSummaryPending) return null;
        const pendingExitSummaryNow = Date.now();
        const pendingExitSummaryReload = normalizePendingExitReloadConfirmationCore(pendingExitSummaryPending.reloadConfirmation, pendingExitSummaryPending, pendingExitSummaryNow);
        return summarizePendingExitCore(pendingExitSummaryPending, {
          nowMs: pendingExitSummaryNow,
          retryMs: pendingExitRetryMsCore(pendingExitSummaryPending, {
        leaveRetryMinMs: cfg.leaveRetryMinMs,
        leaveCommandTimeoutMs: cfg.leaveCommandTimeoutMs,
        offlineLeaveRetryMs: cfg.offlineLeaveRetryMs,
        combatLeaveRetryMs: cfg.combatLeaveRetryMs,
        pursuitLeaveRetryMs: cfg.pursuitLeaveRetryMs
      }),
          reloadConfirmation: pendingExitSummaryReload
        });
      })();
    recordPendingExitResult(pending.source, detail, t);
    await issueLeaveCommand(detail);
    if (detail.attempted) {
      rememberPendingExit(pending.scope, pending.source, detail, detail.self || pending.self || null);
    } else {
      const next = {
        ...pending,
        updatedAt: t,
        lastAttemptAt: t,
        retryCount: Number(pending.retryCount || 0) + 1,
        lastResult: cloneForPendingExit(detail)
      };
      bot.pendingExit = next;
      writePersistentPendingExitStateCore(localStorage, PENDING_EXIT_STATE_KEY, (next) || bot.pendingExit, Date.now(), pendingExitPersistenceCoreHelpers());
      detail.pendingExit = (() => {
        const pendingExitSummaryPending = next;
        if (!pendingExitSummaryPending) return null;
        const pendingExitSummaryNow = Date.now();
        const pendingExitSummaryReload = normalizePendingExitReloadConfirmationCore(pendingExitSummaryPending.reloadConfirmation, pendingExitSummaryPending, pendingExitSummaryNow);
        return summarizePendingExitCore(pendingExitSummaryPending, {
          nowMs: pendingExitSummaryNow,
          retryMs: pendingExitRetryMsCore(pendingExitSummaryPending, {
        leaveRetryMinMs: cfg.leaveRetryMinMs,
        leaveCommandTimeoutMs: cfg.leaveCommandTimeoutMs,
        offlineLeaveRetryMs: cfg.offlineLeaveRetryMs,
        combatLeaveRetryMs: cfg.combatLeaveRetryMs,
        pursuitLeaveRetryMs: cfg.pursuitLeaveRetryMs
      }),
          reloadConfirmation: pendingExitSummaryReload
        });
      })();
      detail.displayReason = detail.displayReason || pending.displayReason || pendingExitDisplayReasonCore(detail.summary || pending.summary || detail.reason);
    }
    recordPendingExitResult(pending.source, detail, t);
    return detail;
  }

  function schedulePendingExitRetry(pending, self, state) {
    if (!pending) return false;
    const t = Date.now();
    const retryMs = pendingExitRetryMsCore(pending, pendingExitRetryCoreOptions());
    const lastAttemptAt = Number(pending.lastAttemptAt || 0);
    if (lastAttemptAt && t - lastAttemptAt < retryMs) return false;
    Promise.resolve()
      .then(() => retryPendingExit(pending, self, state))
      .catch(err => recordUnhandledTickError('pending-exit-retry', err));
    return true;
  }

  async function handlePendingExit(self) {
    const pending = bot.pendingExit;
    if (!pending) return null;
    const existingHoldMs = pending.scope === 'offline' ? offlineReloginHoldRemainingMsForPendingExitBoundCore(bot, localStorage, { loginSuppressKey: LOGIN_SUPPRESS_KEY, loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY, readPersistentExitState, offlineLeaveStateKey: OFFLINE_LEAVE_STATE_KEY, staleOfflineStaminaHoldContradicted, clearOfflineReloginHold: reason => clearOfflineReloginHoldForPendingExitBoundCore(bot, localStorage, reason, { now: Date.now, writePersistentPendingExitState: pending => writePersistentPendingExitStateCore(localStorage, PENDING_EXIT_STATE_KEY, pending || bot.pendingExit, Date.now(), pendingExitPersistenceCoreHelpers()), clearPersistentPendingExitState, clearPersistentExitState, loginSuppressKey: LOGIN_SUPPRESS_KEY, loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY, offlineLeaveStateKey: OFFLINE_LEAVE_STATE_KEY }), now: Date.now }) : enemyReloginHoldRemainingMsForPendingExitBoundCore(bot, localStorage, { loginSuppressKey: LOGIN_SUPPRESS_KEY, loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY, readPersistentExitState, enemyLeaveStateKey: ENEMY_LEAVE_STATE_KEY, now: Date.now });
    if (existingHoldMs > 0) {
      bot.pendingExit = null;
      clearPersistentPendingExitState();
      return null;
    }
    const state = pendingExitSelfState(self);
    const lastDetail = pending.lastResult || {};
    if (leaveDetailHasHttp403Core(lastDetail)) {
      if (scheduleClashLeaveRescueRetry(lastDetail)) {
        bot.pursuit = null;
        if (!applyCombatExitCover(pending, self)) stopMotionSafely('pending-exit-http-403-clash-rescue');
        const detail = cloneForPendingExit(lastDetail) || {};
        detail.exitPending = true;
        detail.exitConfirmed = false;
        detail.pendingExit = (() => {
        const pendingExitSummaryPending = pending;
        if (!pendingExitSummaryPending) return null;
        const pendingExitSummaryNow = Date.now();
        const pendingExitSummaryReload = normalizePendingExitReloadConfirmationCore(pendingExitSummaryPending.reloadConfirmation, pendingExitSummaryPending, pendingExitSummaryNow);
        return summarizePendingExitCore(pendingExitSummaryPending, {
          nowMs: pendingExitSummaryNow,
          retryMs: pendingExitRetryMsCore(pendingExitSummaryPending, {
        leaveRetryMinMs: cfg.leaveRetryMinMs,
        leaveCommandTimeoutMs: cfg.leaveCommandTimeoutMs,
        offlineLeaveRetryMs: cfg.offlineLeaveRetryMs,
        combatLeaveRetryMs: cfg.combatLeaveRetryMs,
        pursuitLeaveRetryMs: cfg.pursuitLeaveRetryMs
      }),
          reloadConfirmation: pendingExitSummaryReload
        });
      })();
        detail.exitConfirmation = {
          ...state,
          source: bot.clashLeaveRescue.running ? 'leave-http-403-clash-rescue-running' : 'leave-http-403-clash-rescue-scheduled',
          http403: true,
          clashLeaveRescue: bot.clashLeaveRescue?.lastResult || null
        };
        return pendingExitWaitDecision(pending, self, detail, detail.exitConfirmation, false);
      }
      const detail = confirmPendingExit(pending, {
        ...state,
        known: true,
        alive: false,
        source: 'leave-http-403',
        http403: true,
        self: null
      });
      return pendingExitWaitDecision(pending, self, detail, detail.exitConfirmation, true);
    }
    if (leaveDetailSucceededCore(lastDetail)) {
      const reloadConfirmation = attachLeaveSuccessReloadConfirmation(pending, lastDetail) || normalizePendingExitReloadConfirmationCore(pending.reloadConfirmation, pending);
      if (!leaveSuccessReloadConfirmationSatisfiedCore(reloadConfirmation)) {
        requestLeaveConfirmationReload('leave-success', pending);
        const detail = pendingExitLeaveSuccessReloadWaitDetail(
          pending,
          lastDetail,
          {
            ...state,
            leaveSuccessReloadConfirmation: reloadConfirmation || null,
            awaitingReload: true
          },
          'leave-success-refresh-confirmation',
          'leave接口已返回成功，刷新页面确认服务端在线状态'
        );
        return pendingExitWaitDecision(pending, self, detail, detail.exitConfirmation, false);
      }
      const localState = pendingExitLocalConfirmationState(pending, self, state);
      if (localState.confirmed) {
        const detail = confirmPendingExit(pending, {
          ...localState,
          source: 'leave-success-refresh-local-confirmed',
          leaveSuccessReloadConfirmation: reloadConfirmation || null
        });
        return pendingExitWaitDecision(pending, self, detail, detail.exitConfirmation, true);
      }
      if (state.known && !state.alive) {
        const detail = confirmPendingExit(pending, {
          ...state,
          known: true,
          alive: false,
          source: 'leave-success-refresh-confirmed',
          self: null,
          leaveSuccessReloadConfirmation: reloadConfirmation || null
        });
        return pendingExitWaitDecision(pending, self, detail, detail.exitConfirmation, true);
      }
      if (state.known && state.alive) {
        schedulePendingExitRetry(pending, self, {
          ...state,
          source: 'leave-success-refresh-still-online',
          leaveSuccessReloadConfirmation: reloadConfirmation || null
        });
        return null;
      }
      const reloadAgeMs = reloadConfirmation?.reloadedAt ? Math.max(0, Math.round(Date.now() - Number(reloadConfirmation.reloadedAt || Date.now()))) : 0;
      if (reloadAgeMs < leaveSuccessReloadUnknownGraceMs()) {
        bot.pursuit = null;
        if (!applyCombatExitCover(pending, self)) stopMotionSafely('pending-exit-refresh-confirmation');
        const detail = pendingExitLeaveSuccessReloadWaitDetail(
          pending,
          lastDetail,
          {
            ...state,
            source: 'leave-success-refresh-unknown',
            leaveSuccessReloadConfirmation: reloadConfirmation || null,
            reloadAgeMs,
            graceMs: leaveSuccessReloadUnknownGraceMs()
          },
          'leave-success-refresh-confirmation',
          '刷新后正在确认服务端在线状态'
        );
        return pendingExitWaitDecision(pending, self, detail, detail.exitConfirmation, false);
      }
      bot.pursuit = null;
      if (!applyCombatExitCover(pending, self)) stopMotionSafely('pending-exit-refresh-retry');
      const detail = await retryPendingExit(pending, self, {
        ...state,
        source: 'leave-success-refresh-unknown-timeout',
        leaveSuccessReloadConfirmation: reloadConfirmation || null,
        reloadAgeMs
      });
      return pendingExitWaitDecision(pending, self, detail, detail.exitConfirmation, false);
    }
    const localState = pendingExitLocalConfirmationState(pending, self, state);
    if (localState.confirmed) {
      const detail = confirmPendingExit(pending, localState);
      return pendingExitWaitDecision(pending, self, detail, localState, true);
    }
    if (state.known && state.alive) {
      schedulePendingExitRetry(pending, self, state);
      return null;
    }
    if (state.known && !state.alive) {
      const lastError = String(pending.lastResult?.error || '');
      const weakConfirmation = /^(login-required|no-current-user-id)$/.test(String(state.source || ''));
      if (lastError && weakConfirmation) {
        bot.pursuit = null;
        if (!applyCombatExitCover(pending, self)) stopMotionSafely('pending-exit-unconfirmed-auth-state');
        const detail = await retryPendingExit(pending, self, { ...state, weakConfirmation: true, ignoredBecauseLastLeaveError: lastError });
        return pendingExitWaitDecision(pending, self, detail, { ...state, weakConfirmation: true }, false);
      }
      const detail = confirmPendingExit(pending, state);
      return pendingExitWaitDecision(pending, self, detail, state, true);
    }
    bot.pursuit = null;
    if (!applyCombatExitCover(pending, self)) stopMotionSafely('pending-exit-confirmation');
    const detail = await retryPendingExit(pending, self, state);
    return pendingExitWaitDecision(pending, self, detail, state, false);
  }

	  function summarizePendingCombatLeave(pending = bot.pendingCombatLeave) {
	    if (!pending) return null;
	    return {
	      reason: pending.reason || '',
      exitSummary: pending.exitSummary || '',
      displayReason: pending.displayReason || '',
	      at: pending.at || 0,
	      ageMs: pending.at ? Math.max(0, Math.round(Date.now() - Number(pending.at || Date.now()))) : 0,
	      retryCount: Number(pending.retryCount || 0),
      target: pending.target || null,
      combatState: pending.combatState || null,
      lastResult: pending.lastResult || null
    };
  }

  function rememberPendingCombatLeave(action, selfSummary, leaveResult) {
    const previous = bot.pendingCombatLeave || {};
    const retryCount = Number(previous.retryCount || 0) + (leaveResult?.attempted || !previous.at ? 1 : 0);
    bot.pendingCombatLeave = {
      at: previous.at || Date.now(),
      lastRetryAt: Date.now(),
	      retryCount,
	      reason: action?.reason || previous.reason || 'combat-leave-retry',
      exitSummary: action?.exitSummary || previous.exitSummary || leaveResult?.exitSummary || leaveResult?.summary || '',
      displayReason: action?.displayReason || previous.displayReason || leaveResult?.displayReason || leaveResult?.summary || '',
	      target: action?.target || previous.target || null,
	      combatState: action?.combatState || previous.combatState || null,
      combatCover: action?.combatCover || action?.combatState?.leaveCover || previous.combatCover || null,
      self: selfSummary || previous.self || null,
      lastResult: leaveResult || previous.lastResult || null
    };
    return bot.pendingCombatLeave;
  }

  function pendingCombatLeaveAction(pending = bot.pendingCombatLeave) {
    if (!pending) return null;
    return {
      kind: 'leave',
      reason: pending.reason || 'combat-leave-retry',
      combat: true,
      ignoreReturnBlock: true,
      dx: clamp(Math.round(Number(pending.combatCover?.dx) || 0), -1, 1),
      dy: clamp(Math.round(Number(pending.combatCover?.dy) || 0), -1, 1),
      shoot: Boolean(pending.combatCover?.shoot),
      forceShoot: Boolean(pending.combatCover?.forceShoot),
      shootEveryMs: pending.combatCover?.shootEveryMs,
      aimTarget: pending.combatCover?.aimTarget || null,
      exitSummary: pending.exitSummary || '',
      displayReason: pending.displayReason || pending.exitSummary || '',
	      target: pending.target || null,
      combatCover: pending.combatCover || null,
      combatState: pending.combatState || null
    };
  }

  function hasRecentCombatEngagementForInjuryLeave() {
    const engaged = bot.combatTarget;
    if (!engaged?.id) return false;
    const maxAgeMs = Math.max(0, Number(cfg.targetStickMs || 0), Number(cfg.combatEngageStickMs || 0));
    if (!maxAgeMs) return true;
    return Date.now() - Number(engaged.at || 0) <= maxAgeMs;
  }

  function isCombatStateForInjuryLeave(action) {
    return Boolean(
      action?.combat
      || bot.pendingCombatLeave
      || bot.lastSafety?.engagedCombat
      || hasRecentCombatEngagementForInjuryLeave()
    );
  }

  function actionCombatTargetId(action) {
    const target = action?.target || null;
    const id = target?.id ?? target?.user_id;
    return id === null || id === undefined ? '' : String(id);
  }

  function pursuitLeaveSuppressedByCombatAction(pursuit, action) {
    const pursuitId = pursuit?.id ?? pursuit?.user_id;
    const actionId = actionCombatTargetId(action);
    return Boolean(action?.combat && pursuitId !== null && pursuitId !== undefined && actionId && String(pursuitId) === actionId);
  }

  function actionThreatId(action) {
    const threat = Array.isArray(action?.threats) ? action.threats[0] : null;
    return threat ? String(threat.id ?? threat.user_id ?? '') : '';
  }

	  function pursuitPressure(self, threat, previous, action) {
    if (!threat) return null;
    const distance = Number(threat.distance ?? dist(self, threat));
    if (!Number.isFinite(distance) || distance > cfg.pursuitTrackRadius) return null;
    const id = threatKey(threat);
    const vx = Number(threat.vx || 0);
    const vy = Number(threat.vy || 0);
    const s = Math.max(0, Number(threat.speed ?? speed(threat)) || 0);
    const tx = Number(self.x) - Number(threat.x);
    const ty = Number(self.y) - Number(threat.y);
    const d = Math.max(1, Math.hypot(tx, ty));
    const towardScore = s > 0 ? ((vx * tx) + (vy * ty)) / (s * d) : 0;
    const closingDistance = previous && String(previous.id) === id
      ? Number(previous.distance) - distance
      : 0;
    const actionMatches = actionThreatId(action) === id
      && (action?.kind === 'flee' || action?.reason === 'return-block-lateral-scan');
    const closePressure = distance <= Number(threat.threatRadius || cfg.dangerRadius);
    const cautionPressure = distance <= Number(threat.cautionRadius || cfg.activeCautionRadius) + cfg.activeCautionExitMargin;
    const towardPressure = cautionPressure && towardScore >= cfg.pursuitTowardCosMin;
    const closingPressure = cautionPressure && closingDistance >= cfg.pursuitClosingMinDistance;
    const returnBlockPressure = distance <= returnBlockRadius(threat);
    if (!closePressure && !towardPressure && !closingPressure && !actionMatches && !returnBlockPressure) return null;
    return {
      threat,
      id,
      score: (actionMatches ? 100000 : 0)
        + (closePressure ? 30000 : 0)
        + (returnBlockPressure ? 15000 : 0)
        + Math.max(0, towardScore) * 10000
        + Math.max(0, closingDistance)
        - distance / 10,
      reason: actionMatches ? 'bot-fleeing-from-threat'
        : closePressure ? 'inside-danger-radius'
          : returnBlockPressure ? 'return-block-pressure'
            : towardPressure ? 'moving-toward-self'
              : 'closing-distance',
      distance,
      speed: s,
      moving: Boolean(threat.moving),
      towardScore,
	      closingDistance
	    };
	  }

	  function pursuitLeaveThresholdFor(self, threat) {
	    const normalMs = Math.max(0, Number(cfg.pursuitLeaveMs || 0));
	    const nonFullHp = !isFullHp(self);
	    const invulnerable = isInvulnerable(threat);
	    const candidates = [normalMs];
	    if (nonFullHp) candidates.push(Math.max(0, Number(cfg.pursuitLeaveNonFullHpMs || normalMs)));
	    if (invulnerable) candidates.push(Math.max(0, Number(cfg.pursuitLeaveInvulnerableMs || normalMs)));
	    if (nonFullHp && invulnerable) {
	      candidates.push(Math.max(0, Number(cfg.pursuitLeaveNonFullHpInvulnerableMs || cfg.pursuitLeaveInvulnerableMs || cfg.pursuitLeaveNonFullHpMs || normalMs)));
	    }
	    return Math.max(0, Math.min(...candidates.filter(value => Number.isFinite(value))));
	  }

	  function updatePursuitTracking(self, activeThreats, action) {
    const t = now();
    const previous = bot.pursuit;
    const candidates = (activeThreats || [])
      .map(threat => pursuitPressure(self, threat, previous, action))
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);
    const picked = candidates[0] || null;
    if (!picked) {
      if (previous && t - Number(previous.lastSeenAt || 0) <= cfg.pursuitLostGraceMs) {
        previous.active = false;
        previous.durationMs = Math.max(0, Number(previous.lastSeenAt || t) - Number(previous.startedAt || t));
        if (bot.lastSafety) bot.lastSafety.pursuit = summarizePursuit(previous);
        return previous;
      }
      bot.pursuit = null;
      if (bot.lastSafety) bot.lastSafety.pursuit = null;
      return null;
    }
    const same = previous && String(previous.id) === String(picked.id)
      && t - Number(previous.lastSeenAt || t) <= cfg.pursuitLostGraceMs;
	    const combatSuppressed = pursuitLeaveSuppressedByCombatAction(picked, action);
	    const startedAt = combatSuppressed ? t : (same ? Number(previous.startedAt || t) : t);
	    const thresholdMs = pursuitLeaveThresholdFor(self, picked.threat);
	    bot.pursuit = {
	      id: picked.id,
	      name: picked.threat.name || '',
      startedAt,
      lastSeenAt: t,
      durationMs: Math.max(0, t - startedAt),
      distance: picked.distance,
      speed: picked.speed,
      moving: picked.moving,
	      active: true,
	      reason: picked.reason,
	      towardScore: picked.towardScore,
	      closingDistance: picked.closingDistance,
	      thresholdMs,
	      invulnerable: isInvulnerable(picked.threat),
	      nonFullHp: !isFullHp(self),
	      combatSuppressed
	    };
    if (bot.lastSafety) bot.lastSafety.pursuit = summarizePursuit(bot.pursuit);
    return bot.pursuit;
  }

  function waitWithTimeout(promise, timeoutMs, label) {
    const ms = Math.max(100, Number(timeoutMs) || 0);
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error((label || 'operation') + ' timed out after ' + ms + 'ms'));
      }, ms);
      Promise.resolve(promise).then(
        value => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(value);
        },
        err => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(err);
        }
      );
    });
  }

  function clashLeaveRescueHook() {
    try {
      const hook = readPageGlobal('__graspRatBotClashLeaveRescue', null, pageGlobal);
      return typeof hook === 'function' ? hook : null;
    } catch (_) {
      return null;
    }
  }

  function appendClashLeaveRescueAttempt(detail, attempt) {
    if (!detail || !attempt) return;
    const attempts = clashLeaveRescueAttemptsCore(detail).concat([attempt]).slice(-6);
    detail.clashLeaveRescueAttempts = attempts;
    detail.clashLeaveRescue = attempt;
    bot.clashLeaveRescue.lastAt = Number(attempt.at || Date.now()) || Date.now();
    bot.clashLeaveRescue.lastStage = attempt.stage || '';
    bot.clashLeaveRescue.lastResult = attempt;
    bot.clashLeaveRescue.attempts = (Array.isArray(bot.clashLeaveRescue.attempts) ? bot.clashLeaveRescue.attempts : [])
      .concat([attempt])
      .slice(-8);
  }

  async function prepareDefaultClashLeaveProxy(detail) {
    if (!cfg.clashLeaveRescueEnabled) return false;
    if (!detail || typeof detail !== 'object') return false;
    if (detail.clashLeaveRescueRetry || clashLeaveRescueAttemptsCore(detail).length) return false;
    if (bot.clashLeaveRescue.running) return false;
    const hook = clashLeaveRescueHook();
    if (!hook) return false;
    const stage = 'auto';
    bot.clashLeaveRescue.running = true;
    try {
      let attempt = null;
      try {
        const result = await waitWithTimeout(
          hook({
            stage,
            reason: detail.reason || '',
            scope: detail.exitAuditScope || '',
            source: detail.exitAuditSource || '',
            exitAuditId: detail.exitAuditId || '',
            requestId: ''
          }),
          Math.max(1000, Number(cfg.clashLeaveRescueTimeoutMs || 9000) || 9000),
          'Clash leave default ' + stage
        );
        attempt = summarizeClashLeaveRescueResultCore(result, stage, '');
      } catch (err) {
        attempt = summarizeClashLeaveRescueResultCore(null, stage, err?.message || String(err));
      }
      appendClashLeaveRescueAttempt(detail, attempt);
      updatePendingExitLastResult(detail);
      recordExitAuditEvent('clash-leave-rescue', detail, {
        at: attempt.at || Date.now(),
        source: detail.exitAuditSource || 'leave-command',
        scope: detail.exitAuditScope || '',
        request: attempt
      });
      logStatus(
        attempt.ok ? 'clash leave default switched ' + stage : 'clash leave default failed ' + stage,
        { stage, clashLeaveRescue: attempt }
      );
      return Boolean(attempt.ok);
    } finally {
      bot.clashLeaveRescue.running = false;
    }
  }

  async function runClashLeaveRescueRetry(detail) {
    if (bot.clashLeaveRescue.running) return null;
    if (!leaveDetailFailedForClashRescueCore(detail, { clashLeaveRescueEnabled: cfg.clashLeaveRescueEnabled, hasClashLeaveRescueHook: () => Boolean(clashLeaveRescueHook()) })) return null;
    let stage = nextClashLeaveRescueStageCore(detail);
    if (!stage) return null;
    bot.clashLeaveRescue.running = true;
    try {
      while (stage) {
        const hook = clashLeaveRescueHook();
        if (!hook) return null;
        let attempt = null;
        try {
          const result = await waitWithTimeout(
            hook({
              stage,
              reason: detail.reason || '',
              scope: detail.exitAuditScope || '',
              source: detail.exitAuditSource || '',
              exitAuditId: detail.exitAuditId || '',
              requestId: detail.lastLeaveRequest?.requestId || ''
            }),
            Math.max(1000, Number(cfg.clashLeaveRescueTimeoutMs || 9000) || 9000),
            'Clash leave rescue ' + stage
          );
          attempt = summarizeClashLeaveRescueResultCore(result, stage, '');
        } catch (err) {
          attempt = summarizeClashLeaveRescueResultCore(null, stage, err?.message || String(err));
        }
        appendClashLeaveRescueAttempt(detail, attempt);
        updatePendingExitLastResult(detail);
        recordExitAuditEvent('clash-leave-rescue', detail, {
          at: attempt.at || Date.now(),
          source: detail.exitAuditSource || 'leave-command',
          scope: detail.exitAuditScope || '',
          request: attempt
        });
        if (attempt.ok) {
          logStatus('clash leave rescue switched ' + stage, { stage, clashLeaveRescue: attempt });
          const retryDetail = clashLeaveRescueRetryDetailCore(detail, stage, { nowMs: Date.now(), cloneForPendingExit, pendingExitDisplayReason: summary => pendingExitDisplayReasonForLeaveCommandCore(summary) });
          const pending = bot.pendingExit;
          const retryAt = Number(retryDetail.at || Date.now()) || Date.now();
          if (pending) {
            bot.pendingExit = {
              ...pending,
              updatedAt: retryAt,
              lastAttemptAt: retryAt,
              retryCount: Number(pending.retryCount || 0) + 1,
              lastResult: cloneForPendingExit(retryDetail)
            };
            writePersistentPendingExitStateCore(localStorage, PENDING_EXIT_STATE_KEY, (bot.pendingExit) || bot.pendingExit, Date.now(), pendingExitPersistenceCoreHelpers());
            retryDetail.pendingExit = (() => {
        const pendingExitSummaryPending = bot.pendingExit;
        if (!pendingExitSummaryPending) return null;
        const pendingExitSummaryNow = Date.now();
        const pendingExitSummaryReload = normalizePendingExitReloadConfirmationCore(pendingExitSummaryPending.reloadConfirmation, pendingExitSummaryPending, pendingExitSummaryNow);
        return summarizePendingExitForLeaveCommandCore(pendingExitSummaryPending, {
          nowMs: pendingExitSummaryNow,
          retryMs: pendingExitRetryMsForLeaveCommandCore(pendingExitSummaryPending, {
        leaveRetryMinMs: cfg.leaveRetryMinMs,
        leaveCommandTimeoutMs: cfg.leaveCommandTimeoutMs,
        offlineLeaveRetryMs: cfg.offlineLeaveRetryMs,
        combatLeaveRetryMs: cfg.combatLeaveRetryMs,
        pursuitLeaveRetryMs: cfg.pursuitLeaveRetryMs
      }),
          reloadConfirmation: pendingExitSummaryReload
        });
      })();
          }
          recordPendingExitResult(pending?.source || detail.exitAuditSource || 'offline', retryDetail, retryAt);
          await issueLeaveCommand(retryDetail);
          if (
            !retryDetail.leaveRequestPending
            && leaveDetailFailedForClashRescueCore(retryDetail, { clashLeaveRescueEnabled: cfg.clashLeaveRescueEnabled, hasClashLeaveRescueHook: () => Boolean(clashLeaveRescueHook()) })
            && nextClashLeaveRescueStageCore(retryDetail)
          ) {
            detail = retryDetail;
            stage = nextClashLeaveRescueStageCore(detail);
            continue;
          }
          return retryDetail;
        }
        logStatus('clash leave rescue failed ' + stage, { stage, clashLeaveRescue: attempt });
        stage = nextClashLeaveRescueStageCore(detail);
      }
    } finally {
      bot.clashLeaveRescue.running = false;
    }
    return null;
  }

  function scheduleClashLeaveRescueRetry(detail) {
    if (!leaveDetailFailedForClashRescueCore(detail, { clashLeaveRescueEnabled: cfg.clashLeaveRescueEnabled, hasClashLeaveRescueHook: () => Boolean(clashLeaveRescueHook()) })) return false;
    if (!nextClashLeaveRescueStageCore(detail)) return false;
    if (bot.clashLeaveRescue.running) return true;
    Promise.resolve()
      .then(() => runClashLeaveRescueRetry(detail))
      .catch(err => recordUnhandledTickError('clash-leave-rescue', err));
    return true;
  }

  function updatePendingExitLastResult(detail) {
    const pending = bot.pendingExit;
    if (!pending || !detail?.exitAuditId) return;
    const pendingAuditId = pending.lastResult?.exitAuditId || '';
    if (pendingAuditId && pendingAuditId !== detail.exitAuditId) return;
    bot.pendingExit = {
      ...pending,
      updatedAt: Date.now(),
      lastAttemptAt: Number(detail.at || detail.lastLeaveRequest?.sentAt || pending.lastAttemptAt || Date.now()),
      lastResult: cloneForPendingExit(detail)
    };
    writePersistentPendingExitStateCore(localStorage, PENDING_EXIT_STATE_KEY, (bot.pendingExit) || bot.pendingExit, Date.now(), pendingExitPersistenceCoreHelpers());
  }

  function maybeConfirmPendingExitFromLeaveDetail(detail) {
    const pending = bot.pendingExit;
    if (!pending || !detail?.exitAuditId) return null;
    const pendingAuditId = pending.lastResult?.exitAuditId || '';
    if (pendingAuditId && pendingAuditId !== detail.exitAuditId) return null;
    const self = getSelf();
    const baseState = pendingExitSelfState(self);
    if (leaveDetailHasHttp403ForLeaveCommandCore(detail)) {
      if (scheduleClashLeaveRescueRetry(detail)) return null;
      return confirmPendingExit(pending, {
        ...baseState,
        known: true,
        alive: false,
        source: 'leave-http-403',
        http403: true,
        self: null
      });
    }
    if (leaveDetailSucceededForLeaveCommandCore(detail)) {
      requestPendingExitLeaveSuccessReload(detail, 'leave-success');
      return null;
    }
    const localState = pendingExitLocalConfirmationState(pending, self, baseState);
    if (localState.confirmed) return confirmPendingExit(pending, localState);
    return null;
  }

  function completeLeaveRequest(detail, request, rawResult, errorMessage = '') {
    if (!detail || !request || request.completedAt) return detail;
    const failure = errorMessage || leaveCommandFailureMessageCore(rawResult);
    if (failure) detail.error = failure;
    detail.leaveRequestPending = false;
    request.completedAt = Date.now();
    request.durationMs = Math.max(0, Math.round(request.completedAt - request.sentAt));
    request.attempted = Boolean(detail.attempted);
    request.method = detail.method || '';
    request.error = detail.error || '';
	    request.result = summarizeLeaveCommandResultCore(rawResult);
	    request.pending = false;
	    if (!Array.isArray(detail.leaveRequests)) detail.leaveRequests = [];
	    detail.leaveRequests.push(request);
    detail.leaveRequests = detail.leaveRequests.slice(-20);
    detail.lastLeaveRequest = request;
    const http403 = leaveDetailHasHttp403ForLeaveCommandCore(detail);
    const clashRescuePending = http403 && leaveDetailFailedForClashRescueCore(detail, { clashLeaveRescueEnabled: cfg.clashLeaveRescueEnabled, hasClashLeaveRescueHook: () => Boolean(clashLeaveRescueHook()) }) && Boolean(nextClashLeaveRescueStageCore(detail));
    if (leaveDetailSucceededForLeaveCommandCore(detail) || http403) {
      stopMotionAfterExit(http403 ? 'leave-http-403' : 'leave-success');
      if (http403 && !clashRescuePending) {
        noteImportantSessionExit('leave-http-403:' + (detail.reason || ''), detail.self || bot.lastSelf, request.completedAt, { exit: detail });
      }
    }
	    updatePendingExitLastResult(detail);
	    recordExitAuditEvent('leave-request', detail, {
	      at: request.completedAt,
      request,
      source: detail.exitAuditSource || detail.reason || 'leave-command',
      scope: detail.exitAuditScope || ''
    });
    if (leaveDetailSucceededForLeaveCommandCore(detail)) requestPendingExitLeaveSuccessReload(detail, 'leave-success');
    const rescueScheduled = scheduleClashLeaveRescueRetry(detail);
    if (!rescueScheduled) maybeConfirmPendingExitFromLeaveDetail(detail);
    return detail;
  }

  async function issueLeaveCommand(detail) {
    if (bot.pendingExit && !detail?.pendingExitRetry) {
      const skipped = pendingExitSkipNewLeave(detail?.exitAuditSource || detail?.reason || 'leave-command', detail?.reason || '', detail || {});
      if (skipped) {
        Object.assign(detail, skipped);
        return detail;
      }
    }
    ensureExitAuditDetail(detail, {
      source: detail?.exitAuditSource || detail?.reason || 'leave-command',
      scope: detail?.exitAuditScope || ''
    });
    await prepareDefaultClashLeaveProxy(detail);
    const request = {
      requestId: newExitAuditRequestId(detail.exitAuditId),
      exitAuditId: detail.exitAuditId || '',
      sentAt: Date.now(),
      completedAt: 0,
      durationMs: 0,
      attempted: false,
      method: '',
      error: '',
      result: null,
      pending: false
    };
	    try {
	      if (typeof leave === 'function') {
	        detail.attempted = true;
	        detail.method = detail.userId ? 'leave(userId)' : 'leave';
	        const result = detail.userId ? leave(detail.userId) : leave();
	        if (result && typeof result.then === 'function') {
          detail.leaveRequestPending = true;
          detail.leaveRequestSentAt = request.sentAt;
          detail.leaveRequestTimeoutMs = Math.max(1000, Number(cfg.leaveCommandTimeoutMs || 0) || 3000);
          request.attempted = true;
          request.method = detail.method;
          request.pending = true;
          detail.lastLeaveRequest = request;
          let settled = false;
          const timeoutMs = detail.leaveRequestTimeoutMs;
          const finish = (rawResult, errorMessage = '') => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            completeLeaveRequest(detail, request, rawResult, errorMessage);
          };
          const timer = setTimeout(() => {
            finish({ error: 'leave request timed out after ' + timeoutMs + 'ms' }, 'leave request timed out after ' + timeoutMs + 'ms');
          }, timeoutMs);
          Promise.resolve(result).then(
            value => finish(value, ''),
            err => finish({ error: err?.message || String(err) }, err?.message || String(err))
          );
          return detail;
	        }
        return completeLeaveRequest(detail, request, result, '');
	      } else {
	        const leaveBtn = document.querySelector('#leaveBtn');
	        if (leaveBtn && isVisible(leaveBtn)) {
	          detail.attempted = true;
	          detail.method = '#leaveBtn';
	          leaveBtn.click();
          return completeLeaveRequest(detail, request, undefined, '');
	        } else {
	          detail.error = 'leave control not found';
          return completeLeaveRequest(detail, request, { error: detail.error }, detail.error);
	        }
	      }
	    } catch (err) {
	      detail.error = err?.message || String(err);
      return completeLeaveRequest(detail, request, { error: detail.error }, detail.error);
	    }
	    return detail;
	  }

  async function maybeStartAutoLogin(reason, options = {}) {
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

  async function leaveOffline(reason, selfSummary = null, offlineSafety = null) {
    const t = Date.now();
    if (cfg.dryRun || cfg.once) return null;
    const skipped = pendingExitSkipNewLeave('offline', reason, {
      self: selfSummary,
      offlineSafety,
      summary: offlineLeaveSummaryForLeaveFlowCore(reason, offlineSafety, { staminaBudgetCoinLeaveSummary, staminaExhaustedWindowLabel })
    });
    if (skipped) return skipped;
    const retryMs = Math.max(200, Number(cfg.offlineLeaveRetryMs || cfg.combatLeaveRetryMs || 1000));
    if (t - Number(bot.lastOfflineLeaveAt || 0) < retryMs) {
      const active = activeOfflineLeaveDetail(t);
      const summary = offlineLeaveSummaryForLeaveFlowCore(reason, offlineSafety, { staminaBudgetCoinLeaveSummary, staminaExhaustedWindowLabel });
      const detail = {
        attempted: false,
        reason: 'cooldown',
        cooldownRemainingMs: Math.max(0, Math.round(retryMs - (t - Number(bot.lastOfflineLeaveAt || 0)))),
        offlineSafety,
        summary: summary || active?.summary || '',
        reloginUntil: active?.reloginUntil || bot.offlineReloginUntil || 0,
        reloginDelayMs: active?.reloginDelayMs || bot.lastOfflineLeaveWaitMs || 0
      };
      return finalizeLeaveDisplayReasonForLeaveFlowCore(detail, (base, value) => leaveWaitDisplayForLeaveFlowCore(base, value, formatDurationMs));
    }
    const detail = {
      attempted: false,
      method: '',
      reason,
      at: t,
      userId: getCurrentUserId() || null,
      self: selfSummary,
      offlineSafety,
      summary: offlineLeaveSummaryForLeaveFlowCore(reason, offlineSafety, { staminaBudgetCoinLeaveSummary, staminaExhaustedWindowLabel }),
      error: ''
    };
    startExitAuditBoundCore(detail, { scope: 'offline', source: 'offline', reason, self: selfSummary, offlineSafety }, bot, { resetLoginSnapshotGate, loginPointSafetyExitSelfForDetail, ensureExitAuditDetail, recordExitAuditEvent, now: Date.now });
    bot.lastOfflineLeaveAt = t;
    await issueLeaveCommand(detail);
    if (detail.attempted) {
      const staminaSuppress = primePendingStaminaExitLoginSuppressBoundCore(detail, { now: Date.now, staminaBudgetReloginDelayMs, staminaResetHoldUntil, setLoginSuppress });
      if (!staminaSuppress && offlineExitRequiresUnsafeReloginDelayCore(reason, offlineSafety)) {
        primePendingUnsafeExitLoginSuppressBoundCore('offline leave', reason, detail, selfSummary, {}, { hpInfoForRelogin, reloginDelayForHp: (selfLike, detail) => reloginDelayForHpCore(selfLike, detail, { cfg, hpInfoForRelogin, randomBetween, clamp }), cfg, setLoginSuppress, now: Date.now });
      }
    }
    if (detail.attempted || detail.exitAuditId) {
      rememberPendingExit('offline', 'offline', detail, selfSummary);
    }
    finalizeLeaveDisplayReasonForLeaveFlowCore(detail, (base, value) => leaveWaitDisplayForLeaveFlowCore(base, value, formatDurationMs));
    bot.lastOfflineLeaveResult = detail;
    return detail;
  }

  async function leaveForInjury(injury) {
    const t = Date.now();
    if (cfg.dryRun || cfg.once) return null;
    const skipped = pendingExitSkipNewLeave('injury', 'injury hp drop', {
      injury,
      summary: injuryLeaveSummaryForLeaveFlowCore(injury, { actorLabel, hpDisplay })
    });
    if (skipped) return skipped;
    if (t - Number(bot.lastInjuryLeaveAt || 0) < cfg.combatLeaveRetryMs) {
      const detail = {
        attempted: false,
        reason: 'cooldown',
        cooldownRemainingMs: Math.max(0, Math.round(cfg.combatLeaveRetryMs - (t - Number(bot.lastInjuryLeaveAt || 0)))),
        injury,
        summary: injuryLeaveSummaryForLeaveFlowCore(injury, { actorLabel, hpDisplay })
      };
      return finalizeLeaveDisplayReasonForLeaveFlowCore(detail, (base, value) => leaveWaitDisplayForLeaveFlowCore(base, value, formatDurationMs));
    }
    const detail = {
      attempted: false,
      method: '',
      reason: 'injury hp drop',
      at: t,
      userId: getCurrentUserId() || null,
      injury,
      summary: injuryLeaveSummaryForLeaveFlowCore(injury, { actorLabel, hpDisplay }),
      error: ''
    };
    startExitAuditBoundCore(detail, { scope: 'enemy', source: 'injury', reason: detail.reason, self: injury?.self || injury, injury }, bot, { resetLoginSnapshotGate, loginPointSafetyExitSelfForDetail, ensureExitAuditDetail, recordExitAuditEvent, now: Date.now });
    bot.lastInjuryLeaveAt = t;
    await issueLeaveCommand(detail);
    if (detail.attempted) {
      primePendingUnsafeExitLoginSuppressBoundCore('enemy leave', detail.reason, detail, injury?.self || injury, {}, { hpInfoForRelogin, reloginDelayForHp: (selfLike, detail) => reloginDelayForHpCore(selfLike, detail, { cfg, hpInfoForRelogin, randomBetween, clamp }), cfg, setLoginSuppress, now: Date.now });
    }
    if (detail.attempted || detail.exitAuditId) {
      rememberPendingExit('enemy', 'injury', detail, injury?.self || injury);
      bot.pendingInjuryLeave = null;
    }
    bot.lastInjuryLeaveResult = detail;
    return detail;
  }

  async function leaveForPursuit(pursuit, selfSummary = null) {
    const t = Date.now();
    if (cfg.dryRun || cfg.once) return null;
    const pursuitSummary = summarizePursuit(pursuit);
    const skipped = pendingExitSkipNewLeave('pursuit', 'sustained pursuit', {
      self: selfSummary,
      pursuit: pursuitSummary,
      summary: pursuitLeaveSummaryForLeaveFlowCore(pursuitSummary, { actorLabel, formatDurationMs, formatDistance })
    });
    if (skipped) return skipped;
    if (t - Number(bot.lastPursuitLeaveAt || 0) < cfg.pursuitLeaveRetryMs) {
      const detail = {
        attempted: false,
        reason: 'cooldown',
        cooldownRemainingMs: Math.max(0, Math.round(cfg.pursuitLeaveRetryMs - (t - Number(bot.lastPursuitLeaveAt || 0)))),
        pursuit: pursuitSummary,
        summary: pursuitLeaveSummaryForLeaveFlowCore(pursuitSummary, { actorLabel, formatDurationMs, formatDistance })
      };
      return finalizeLeaveDisplayReasonForLeaveFlowCore(detail, (base, value) => leaveWaitDisplayForLeaveFlowCore(base, value, formatDurationMs));
    }
    const detail = {
      attempted: false,
      method: '',
      reason: 'sustained pursuit',
      at: t,
      userId: getCurrentUserId() || null,
      self: selfSummary,
      pursuit: pursuitSummary,
      summary: pursuitLeaveSummaryForLeaveFlowCore(pursuitSummary, { actorLabel, formatDurationMs, formatDistance }),
      error: ''
    };
    startExitAuditBoundCore(detail, { scope: 'enemy', source: 'pursuit', reason: detail.reason, self: selfSummary, pursuit: pursuitSummary }, bot, { resetLoginSnapshotGate, loginPointSafetyExitSelfForDetail, ensureExitAuditDetail, recordExitAuditEvent, now: Date.now });
    bot.lastPursuitLeaveAt = t;
    await issueLeaveCommand(detail);
    if (detail.attempted) {
      primePendingUnsafeExitLoginSuppressBoundCore('enemy leave', detail.reason, detail, selfSummary, {}, { hpInfoForRelogin, reloginDelayForHp: (selfLike, detail) => reloginDelayForHpCore(selfLike, detail, { cfg, hpInfoForRelogin, randomBetween, clamp }), cfg, setLoginSuppress, now: Date.now });
    }
    if (detail.attempted || detail.exitAuditId) {
      rememberPendingExit('enemy', 'pursuit', detail, selfSummary);
      bot.pursuit = null;
      if (bot.lastSafety) bot.lastSafety.pursuit = null;
    }
    bot.lastPursuitLeaveResult = detail;
    return detail;
  }

  async function leaveForCombat(action, selfSummary = null) {
    const t = Date.now();
    if (cfg.dryRun || cfg.once) return null;
    const reason = action?.reason === 'combat-critical-hp-leave'
      ? 'combat critical hp'
      : action?.reason === 'combat-hp-disadvantage-leave'
        ? 'combat hp disadvantage'
        : action?.reason === 'combat-low-hp-no-damage-leave'
          ? 'combat low hp no damage'
          : 'combat low hp disadvantage';
    const skipped = pendingExitSkipNewLeave('combat', reason, {
      self: selfSummary,
      target: action?.target || null,
      combat: action?.combatState || null,
      combatCover: action?.combatCover || action?.combatState?.leaveCover || null,
      summary: action?.exitSummary || combatExitSummaryForLeaveFlowCore(action?.reason || 'combat-low-hp-leave', action?.target || null, action?.combatState || {}, { cfg, actorLabel, hpDisplay, formatDurationMs })
    });
    if (skipped) return skipped;
    if (t - Number(bot.lastCombatLeaveAt || 0) < cfg.combatLeaveRetryMs) {
      const detail = {
        attempted: false,
        reason: 'cooldown',
        cooldownRemainingMs: Math.max(0, Math.round(cfg.combatLeaveRetryMs - (t - Number(bot.lastCombatLeaveAt || 0)))),
        combat: action?.combatState || null,
        combatCover: action?.combatCover || action?.combatState?.leaveCover || null,
        target: action?.target || null,
        summary: action?.exitSummary || combatExitSummaryForLeaveFlowCore(action?.reason || 'combat-low-hp-leave', action?.target || null, action?.combatState || {}, { cfg, actorLabel, hpDisplay, formatDurationMs })
      };
      finalizeLeaveDisplayReasonForLeaveFlowCore(detail, (base, value) => leaveWaitDisplayForLeaveFlowCore(base, value, formatDurationMs));
      rememberPendingCombatLeave(action, selfSummary, detail);
      return detail;
    }
    const detail = {
      attempted: false,
      method: '',
      reason,
      at: t,
      userId: getCurrentUserId() || null,
      self: selfSummary,
      target: action?.target || null,
      combat: action?.combatState || null,
      combatCover: action?.combatCover || action?.combatState?.leaveCover || null,
      summary: action?.exitSummary || combatExitSummaryForLeaveFlowCore(action?.reason || 'combat-low-hp-leave', action?.target || null, action?.combatState || {}, { cfg, actorLabel, hpDisplay, formatDurationMs }),
      error: ''
    };
    startExitAuditBoundCore(detail, { scope: 'enemy', source: 'combat', reason, self: selfSummary, target: action?.target || null, combat: action?.combatState || null }, bot, { resetLoginSnapshotGate, loginPointSafetyExitSelfForDetail, ensureExitAuditDetail, recordExitAuditEvent, now: Date.now });
    bot.lastCombatLeaveAt = t;
    await issueLeaveCommand(detail);
    if (detail.attempted) {
      primePendingUnsafeExitLoginSuppressBoundCore('enemy leave', detail.reason, detail, selfSummary, {}, { hpInfoForRelogin, reloginDelayForHp: (selfLike, detail) => reloginDelayForHpCore(selfLike, detail, { cfg, hpInfoForRelogin, randomBetween, clamp }), cfg, setLoginSuppress, now: Date.now });
    }
    if (detail.attempted || detail.exitAuditId) {
      rememberPendingExit('enemy', 'combat', detail, selfSummary);
      bot.pendingCombatLeave = null;
    } else {
      rememberPendingCombatLeave(action, selfSummary, detail);
    }
    bot.lastCombatLeaveResult = detail;
    return detail;
  }

  async function leaveDuringEnemyHold(reason = 'enemy leave wait') {
    const t = Date.now();
    const retryMs = Math.max(cfg.pursuitLeaveRetryMs, cfg.combatLeaveRetryMs);
    if (cfg.dryRun || cfg.once) return null;
    const skipped = pendingExitSkipNewLeave('enemy-hold-retry', reason, {
      summary: activeEnemyLeaveDetail(t)?.summary || bot.lastCombatLeaveResult?.summary || bot.lastPursuitLeaveResult?.summary || bot.lastInjuryLeaveResult?.summary || ''
    });
    if (skipped) return skipped;
	    const active = activeEnemyLeaveDetail(t);
	    if (t - Number(bot.lastEnemyLeaveRetryAt || 0) < retryMs) {
	      const detail = {
	        attempted: false,
	        reason: 'cooldown',
	        cooldownRemainingMs: Math.max(0, Math.round(retryMs - (t - Number(bot.lastEnemyLeaveRetryAt || 0)))),
	        holdRemainingMs: enemyReloginHoldRemainingMsForLeaveFlowBoundCore(bot, localStorage, { loginSuppressKey: LOGIN_SUPPRESS_KEY, loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY, readPersistentExitState, enemyLeaveStateKey: ENEMY_LEAVE_STATE_KEY, now: Date.now }),
        summary: active?.summary || bot.lastCombatLeaveResult?.summary || bot.lastPursuitLeaveResult?.summary || bot.lastInjuryLeaveResult?.summary || '',
        reloginUntil: active?.reloginUntil || bot.pursuitReloginUntil || 0,
        reloginDelayMs: active?.reloginDelayMs || bot.lastEnemyLeaveWaitMs || 0
	      };
      return finalizeLeaveDisplayReasonForLeaveFlowCore(detail, (base, value) => leaveWaitDisplayForLeaveFlowCore(base, value, formatDurationMs));
	    }
		    const detail = {
		      attempted: false,
		      method: '',
		      reason,
      at: t,
		      userId: getCurrentUserId() || null,
		      holdRemainingMs: enemyReloginHoldRemainingMsForLeaveFlowBoundCore(bot, localStorage, { loginSuppressKey: LOGIN_SUPPRESS_KEY, loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY, readPersistentExitState, enemyLeaveStateKey: ENEMY_LEAVE_STATE_KEY, now: Date.now }),
      summary: active?.summary || bot.lastCombatLeaveResult?.summary || bot.lastPursuitLeaveResult?.summary || bot.lastInjuryLeaveResult?.summary || '',
      reloginUntil: active?.reloginUntil || bot.pursuitReloginUntil || 0,
      reloginDelayMs: active?.reloginDelayMs || bot.lastEnemyLeaveWaitMs || 0,
	      error: ''
	    };
    startExitAuditBoundCore(detail, { scope: 'enemy', source: 'enemy-hold-retry', reason }, bot, { resetLoginSnapshotGate, loginPointSafetyExitSelfForDetail, ensureExitAuditDetail, recordExitAuditEvent, now: Date.now });
    bot.lastEnemyLeaveRetryAt = t;
    await issueLeaveCommand(detail);
	    if (detail.attempted && !detail.error) bot.pendingCombatLeave = null;
	    detail.holdRemainingMs = enemyReloginHoldRemainingMsForLeaveFlowBoundCore(bot, localStorage, { loginSuppressKey: LOGIN_SUPPRESS_KEY, loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY, readPersistentExitState, enemyLeaveStateKey: ENEMY_LEAVE_STATE_KEY, now: Date.now });
    finalizeLeaveDisplayReasonForLeaveFlowCore(detail, (base, value) => leaveWaitDisplayForLeaveFlowCore(base, value, formatDurationMs));
	    bot.lastEnemyLeaveRetryResult = detail;
    return detail;
  }


  return {
    requestReload,
    requestLeaveConfirmationReload,
    requestSessionMismatchRecoveryReload,
    cloudflareErrorInfo,
    maybeReloadCloudflareError,
    getCurrentUserId,
    getSessionToken,
    wsReadyStateNumber,
    isWsConnectingOrOpen,
    hasNativeGameSession,
    controlHasNativeGameSession,
    snapshotSelfPresenceState,
    controlHasAuthoritativeSessionMismatch,
    noSelfGameSessionExitState,
    recentUnsafeExitContext,
    firstRecentUnsafeExitContext,
    sessionMismatchRecoveryReloadMaxAgeMs,
    pageTimeOriginMs,
    normalizeSessionMismatchRecoveryState,
    readSessionMismatchRecoveryState,
    writeSessionMismatchRecoveryState,
    clearSessionMismatchRecoveryState,
    sessionMismatchRecoveryStateMatches,
    sessionMismatchRecoveryPageReloadedAfter,
    sessionMismatchRecoveryReloadSatisfied,
    summarizeSessionMismatchRecoveryStatus,
    liveSessionMismatchTakeoverState,
    isVisible,
    controlText,
    describeControl,
    requestNativeViewportResize,
    findZoomControl,
    findZoomOutControl,
    clickZoomControl,
    clickZoomOutControl,
    postLoginZoomScaleTextRadiusCm,
    postLoginZoomCurrentViewRadiusCm,
    postLoginZoomTargetRadiusCm,
    postLoginZoomFitBounds,
    postLoginZoomViewElements,
    postLoginZoomProjection,
    postLoginZoomSelfScreenPoint,
    postLoginZoomFitMeasurement,
    postLoginZoomFitDecision,
    postLoginZoomWheelTarget,
    dispatchPostLoginZoomWheel,
    postLoginZoomStepImproved,
    finishPostLoginZoomResult,
    currentBotIsInstalled,
    schedulePostLoginZoomFallbackClicks,
    schedulePostLoginZoomFitStep,
    postLoginZoomSessionKey,
    noteSelfUnavailableForPostLoginZoom,
    schedulePostLoginZoomOut,
    findLoginControl,
    hasLoginRequiredText,
    setLoginSuppress,
    loginSuppressRemainingMs,
    loginSuppressStatus,
    loginPointSafetySuccessRequired,
    optionalFiniteNumber,
    loginPointSafetyLastExitHp,
    loginPointSafetyHealthyHpThreshold,
    loginPointSafetyLowHpRadius,
    loginPointSafetyHealthyRadius,
    loginPointSafetyRadiusInfo,
    loginPointSafetyRadius,
    loginPointSafetyDayKey,
    finiteNumber,
    loginPointSafetyExitSelfHpFrom,
    loginPointSafetyExitSelfForDetail,
    loginPointEntityKey,
    loginPointActorSummary,
    normalizeLoginPointSafetyState,
    loginPointHasPoint,
    loginPointPointStamp,
    mergeLoginPointSafetyState,
    readLoginPointSafetyState,
    writeLoginPointSafetyState,
    loginPointDamageActorKeys,
    loginPointDamageEvidence,
    loginPointEntityMoved,
    loginPointActiveModeStaminaSpent,
    loginPointActiveModeDangerReason,
    loginPointDangerReason,
    evaluateLoginPointSafety,
    noteLoginPointSafetyProbe,
    loginPointSafetyStatus,
    resetLoginPointSafetyGate,
    rememberLoginPointDamageThreat,
    maybeRecordLoginPoint,
    inferLoginPointLoginAt,
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
    installNativeLoginGateInterceptors,
    reloginCooldownCandidates,
    summarizeReloginGateStatus,
    clearExitHoldDetail,
    clearCurrentReloginHold,
    randomBetween,
    hpInfoForRelogin,
    summarizePursuit,
    cloneForPendingExit,
    pendingExitRetryCoreOptions,
    pendingExitSkipNewLeave,
    pendingExitIntentForSkippedLeave,
    recordPendingExitResult,
    rememberPendingExit,
    pendingExitSelfState,
    escapeRegExpLiteral,
    chatLeftUserMessageSeen,
    ownEntityDisappearedState,
    pendingExitLocalConfirmationState,
    attachLeaveSuccessReloadConfirmation,
    pendingExitLeaveSuccessReloadWaitDetail,
    requestPendingExitLeaveSuccessReload,
    leaveSuccessReloadUnknownGraceMs,
    leave403ReloginDelayMs,
    leave403SnapshotSuccessRequired,
    leaveDetailHasHttp403RiskControl,
    leave403RiskHoldActive,
    currentLeave403RiskHolds,
    clearLeave403RiskDetail,
    clearLeave403RiskHolds,
    noteLeave403SnapshotProbe,
    confirmPendingExit,
    pendingExitWaitDecision,
    applyCombatExitCover,
    retryPendingExit,
    schedulePendingExitRetry,
    handlePendingExit,
    summarizePendingCombatLeave,
    rememberPendingCombatLeave,
    pendingCombatLeaveAction,
    hasRecentCombatEngagementForInjuryLeave,
    isCombatStateForInjuryLeave,
    actionCombatTargetId,
    pursuitLeaveSuppressedByCombatAction,
    actionThreatId,
    pursuitPressure,
    pursuitLeaveThresholdFor,
    updatePursuitTracking,
    waitWithTimeout,
    clashLeaveRescueHook,
    appendClashLeaveRescueAttempt,
    prepareDefaultClashLeaveProxy,
    runClashLeaveRescueRetry,
    scheduleClashLeaveRescueRetry,
    updatePendingExitLastResult,
    maybeConfirmPendingExitFromLeaveDetail,
    completeLeaveRequest,
    issueLeaveCommand,
    maybeStartAutoLogin,
    forceLoginNow,
    leaveOffline,
    leaveForInjury,
    leaveForPursuit,
    leaveForCombat,
    leaveDuringEnemyHold
  };
}

module.exports = {
  createControlFlowRuntime
};
