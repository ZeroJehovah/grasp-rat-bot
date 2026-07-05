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
const { createPostLoginZoomRuntime } = require('./post-login-zoom-runtime');
const { createLoginPointSafetyRuntime } = require('./login-point-safety-runtime');
const { createControlLoginRuntime } = require('./control-login-runtime');
const { createPendingExitRuntime } = require('./pending-exit-runtime');
const { createClashLeaveRescueRuntime } = require('./clash-leave-rescue-runtime');
const { createLeaveFlowRuntime } = require('./leave-flow-runtime');

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

  const {
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
    schedulePostLoginZoomOut
  } = createPostLoginZoomRuntime({
    bot,
    cfg,
    pageGlobal,
    botKey: BOT_KEY,
    readPageGlobal,
    getCurrentUserId: (...args) => getCurrentUserId(...args),
    getSessionToken: (...args) => getSessionToken(...args),
    getNativeState: (...args) => getNativeState(...args)
  });

  const {
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
    inferLoginPointLoginAt
  } = createLoginPointSafetyRuntime({
    bot,
    cfg,
    storage: localStorage,
    loginPointSafetyKey: LOGIN_POINT_SAFETY_KEY,
    loginSuppressKey: LOGIN_SUPPRESS_KEY,
    loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY,
    getCurrentUserId: (...args) => getCurrentUserId(...args),
    dropValue,
    truthyFlag,
    staminaRemaining,
    staminaLimitValue,
    isJoinModeActive,
    isFiringEntity,
    isMovingThreat,
    isAlive,
    isInvulnerable
  });

  const {
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
  } = createControlLoginRuntime({
    bot,
    cfg,
    storage: localStorage,
    pageGlobal,
    botKey: BOT_KEY,
    loginSuppressKey: LOGIN_SUPPRESS_KEY,
    loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY,
    readPageGlobal,
    installPageGlobal,
    normalizeLoginSnapshotGateStateCore,
    loginSnapshotSuccessRequiredCore,
    loginPointSafetyStatus: (...args) => loginPointSafetyStatus(...args),
    resetLoginPointSafetyGate: (...args) => resetLoginPointSafetyGate(...args),
    noteLoginPointSafetyProbe: (...args) => noteLoginPointSafetyProbe(...args),
    isVisible,
    controlText,
    getSelf: (...args) => getSelf(...args),
    summarizeSelf: (...args) => summarizeSelf(...args),
    getCurrentUserId: (...args) => getCurrentUserId(...args),
    summarizeControl: (...args) => summarizeControl(...args),
    updateBotPanel: (...args) => updateBotPanel(...args)
  });

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

  let issueLeaveCommand;
  let scheduleClashLeaveRescueRetry;

  const {
    randomBetween,
    hpInfoForRelogin,
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
    handlePendingExit
  } = createPendingExitRuntime({
    bot,
    cfg,
    storage: localStorage,
    pendingExitStateKey: PENDING_EXIT_STATE_KEY,
    loginSuppressKey: LOGIN_SUPPRESS_KEY,
    loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY,
    enemyLeaveStateKey: ENEMY_LEAVE_STATE_KEY,
    offlineLeaveStateKey: OFFLINE_LEAVE_STATE_KEY,
    enemyLeaveStreakKey: ENEMY_LEAVE_STREAK_KEY,
    normalizePendingExitReloadConfirmationCore,
    writePersistentPendingExitStateCore,
    pendingExitPersistenceCoreHelpers,
    clearPersistentPendingExitState,
    clearPersistentExitState,
    readPersistentExitState,
    writePersistentExitState,
    requestLeaveConfirmationReload,
    activeEnemyLeaveDetail: (...args) => activeEnemyLeaveDetail(...args),
    activeOfflineLeaveDetail: (...args) => activeOfflineLeaveDetail(...args),
    getCurrentUserId: (...args) => getCurrentUserId(...args),
    getSessionToken: (...args) => getSessionToken(...args),
    getOwnEntity: (...args) => getOwnEntity(...args),
    getNativeState: (...args) => getNativeState(...args),
    getNativeControl: (...args) => getNativeControl(...args),
    hasNativeGameSession: (...args) => hasNativeGameSession(...args),
    hasLoginRequiredText: (...args) => hasLoginRequiredText(...args),
    findLoginControl: (...args) => findLoginControl(...args),
    snapshotSelfFreshEnough: (...args) => snapshotSelfFreshEnough(...args),
    summarizeSelf: (...args) => summarizeSelf(...args),
    isAlive,
    summarizeControl: (...args) => summarizeControl(...args),
    controlHasAuthoritativeSessionMismatch: (...args) => controlHasAuthoritativeSessionMismatch(...args),
    clearCombatEngagement,
    stopMotionAfterExit,
    stopMotionSafely,
    sendActionVelocity,
    shootAt,
    recordUnhandledTickError,
    recordExitAuditEvent,
    noteImportantSessionExit,
    logStatus,
    setLoginSuppress,
    resetLoginSnapshotGate,
    loginPointSafetyExitSelfForDetail,
    staminaBudgetReloginDelayMs,
    staminaResetHoldUntil,
    staleOfflineStaminaHoldContradicted,
    reloginDelayForHpCore,
    clamp,
    scheduleClashLeaveRescueRetry: (...args) => scheduleClashLeaveRescueRetry(...args),
    issueLeaveCommand: (...args) => issueLeaveCommand(...args)
  });

  const clashLeaveRescueRuntime = createClashLeaveRescueRuntime({
    bot,
    cfg,
    storage: localStorage,
    pageGlobal,
    pendingExitStateKey: PENDING_EXIT_STATE_KEY,
    readPageGlobal,
    normalizePendingExitReloadConfirmationCore,
    writePersistentPendingExitStateCore,
    pendingExitPersistenceCoreHelpers,
    recordExitAuditEvent,
    logStatus,
    recordUnhandledTickError,
    stopMotionAfterExit,
    noteImportantSessionExit,
    ensureExitAuditDetail,
    isVisible,
    cloneForPendingExit,
    pendingExitSkipNewLeave,
    recordPendingExitResult,
    pendingExitSelfState,
    pendingExitLocalConfirmationState,
    confirmPendingExit,
    requestPendingExitLeaveSuccessReload,
    getSelf: (...args) => getSelf(...args),
    newExitAuditRequestId
  });
  const {
    waitWithTimeout,
    clashLeaveRescueHook,
    appendClashLeaveRescueAttempt,
    prepareDefaultClashLeaveProxy,
    runClashLeaveRescueRetry,
    scheduleClashLeaveRescueRetry: scheduleClashLeaveRescueRetryImpl,
    updatePendingExitLastResult,
    maybeConfirmPendingExitFromLeaveDetail,
    completeLeaveRequest,
    issueLeaveCommand: issueLeaveCommandImpl
  } = clashLeaveRescueRuntime;
  scheduleClashLeaveRescueRetry = scheduleClashLeaveRescueRetryImpl;
  issueLeaveCommand = issueLeaveCommandImpl;

  const {
    summarizePursuit,
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
    maybeStartAutoLogin,
    forceLoginNow,
    leaveOffline,
    leaveForInjury,
    leaveForPursuit,
    leaveForCombat,
    leaveDuringEnemyHold
  } = createLeaveFlowRuntime({
    bot,
    cfg,
    storage: localStorage,
    pageGlobal,
    loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY,
    loginSuppressKey: LOGIN_SUPPRESS_KEY,
    enemyLeaveStateKey: ENEMY_LEAVE_STATE_KEY,
    readPersistentExitState,
    getCurrentUserId: (...args) => getCurrentUserId(...args),
    getSessionToken: (...args) => getSessionToken(...args),
    getNativeControl: (...args) => getNativeControl(...args),
    hasNativeGameSession: (...args) => hasNativeGameSession(...args),
    findLoginControl: (...args) => findLoginControl(...args),
    hasLoginRequiredText: (...args) => hasLoginRequiredText(...args),
    getSelf: (...args) => getSelf(...args),
    summarizeSelf: (...args) => summarizeSelf(...args),
    summarizeControl: (...args) => summarizeControl(...args),
    syncPausedFromPage,
    snapshotLoginGateStatus: (...args) => snapshotLoginGateStatus(...args),
    exitAuditFlushPending,
    exitAuditFlushBlockDetail,
    importantSessionEndFlushPending,
    importantSessionEndFlushBlockDetail,
    flushCombatLogs,
    closeCurrentImportantSessionBeforeLogin,
    readPageGlobal,
    loginSuppressRemainingMs,
    ensureLoginSnapshotGate,
    loginSnapshotGateAllowsLogin,
    markManualLoginBypass,
    setLoginSuppress,
    controlText,
    clearCurrentReloginHold,
    updateBotPanel,
    triggerNativeTick,
    issueLeaveCommand,
    pendingExitSkipNewLeave,
    rememberPendingExit,
    activeOfflineLeaveDetail: (...args) => activeOfflineLeaveDetail(...args),
    activeEnemyLeaveDetail: (...args) => activeEnemyLeaveDetail(...args),
    resetLoginSnapshotGate,
    loginPointSafetyExitSelfForDetail,
    ensureExitAuditDetail,
    recordExitAuditEvent,
    staminaBudgetCoinLeaveSummary,
    staminaExhaustedWindowLabel,
    staminaBudgetReloginDelayMs,
    staminaResetHoldUntil,
    setLoginSuppress,
    reloginDelayForHpCore,
    randomBetween,
    hpInfoForRelogin,
    now,
    dist,
    speed,
    clamp,
    isAlive,
    isFullHp,
    isInvulnerable,
    threatKey,
    returnBlockRadius
  });



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
