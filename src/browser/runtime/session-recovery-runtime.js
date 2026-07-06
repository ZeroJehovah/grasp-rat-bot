'use strict';

const { arrayCount } = require('./array-count');
const { formatDurationMs } = require('./display-format');
const {
  pendingExitRetryMsCore: pendingExitRetryMsForSessionRecoveryCore,
  summarizePendingExitCore: summarizePendingExitForSessionRecoveryCore
} = require('./pending-exit');
const {
  clearOfflineReloginHoldBoundCore: clearOfflineReloginHoldForSessionRecoveryBoundCore,
  enemyReloginHoldRemainingMsBoundCore: enemyReloginHoldRemainingMsForSessionRecoveryBoundCore,
  offlineReloginHoldRemainingMsBoundCore: offlineReloginHoldRemainingMsForSessionRecoveryBoundCore
} = require('./exit-relogin');
const {
  DEFAULT_NO_SELF_SNAPSHOT_RECOVERY_KEY,
  normalizeNoSelfSnapshotRecoveryState,
  activeNoSelfSnapshotRecoveryState
} = require('./no-self-snapshot-recovery-state');

function createSessionRecoveryRuntime(runtime = {}) {
  const {
    bot,
    cfg,
    storage = typeof localStorage !== 'undefined' ? localStorage : null,
    pendingExitStateKey,
    sessionMismatchRecoveryKey,
    cloudflareReloadKey,
    noSelfSnapshotRecoveryKey = DEFAULT_NO_SELF_SNAPSHOT_RECOVERY_KEY,
    loginSuppressKey,
    loginSuppressReasonKey,
    enemyLeaveStateKey,
    offlineLeaveStateKey,
    normalizePendingExitReloadConfirmationCore = value => value,
    writePersistentPendingExitStateCore = () => null,
    pendingExitPersistenceCoreHelpers = () => ({}),
    clearPersistentPendingExitState = () => {},
    clearPersistentExitState = () => {},
    readPersistentExitState = () => null,
    exitAuditFlushPending = () => false,
    exitAuditFlushBlockDetail = reason => ({ blocked: true, reason }),
    importantSessionEndFlushPending = () => false,
    importantSessionEndFlushBlockDetail = reason => ({ blocked: true, reason }),
    closeCurrentImportantSessionBeforeReload = () => null,
    persistCombatLogPendingEntries = () => 0,
    flushCombatLogs = () => false,
    logStatus = () => {},
    activeEnemyLeaveDetail = () => null,
    activeOfflineLeaveDetail = () => null,
    exitMotionStopLockRemainingMs = () => 0,
    unsafeExitReloginMinDelayMs = () => 0,
    getNativeControl = () => null,
    getCurrentUserId = () => 0,
    getSessionToken = () => '',
    summarizeSelf = value => value,
    snapshotDataAgeMs = () => Infinity,
    snapshotSelfFreshEnough = () => false,
    isOfflineishWsReadyState = () => false,
    isAlive = value => Boolean(value),
    findLoginControl = () => null,
    hasLoginRequiredText = () => false,
    loginSuppressRemainingMs = () => 0,
    snapshotLoginGateStatus = () => ({}),
    staleOfflineStaminaHoldContradicted = () => false
  } = runtime;
  const localStorage = storage;
  const PENDING_EXIT_STATE_KEY = pendingExitStateKey;
  const SESSION_MISMATCH_RECOVERY_KEY = sessionMismatchRecoveryKey;
  const CLOUDFLARE_RELOAD_KEY = cloudflareReloadKey;
  const NO_SELF_SNAPSHOT_RECOVERY_KEY = noSelfSnapshotRecoveryKey;
  const LOGIN_SUPPRESS_KEY = loginSuppressKey;
  const LOGIN_SUPPRESS_REASON_KEY = loginSuppressReasonKey;
  const ENEMY_LEAVE_STATE_KEY = enemyLeaveStateKey;
  const OFFLINE_LEAVE_STATE_KEY = offlineLeaveStateKey;

  function pendingExitSummaryForRecovery(pending) {
    if (!pending) return null;
    const nowMs = Date.now();
    const reloadConfirmation = normalizePendingExitReloadConfirmationCore(pending.reloadConfirmation, pending, nowMs);
    return summarizePendingExitForSessionRecoveryCore(pending, {
      nowMs,
      retryMs: pendingExitRetryMsForSessionRecoveryCore(pending, {
        leaveRetryMinMs: cfg.leaveRetryMinMs,
        leaveCommandTimeoutMs: cfg.leaveCommandTimeoutMs,
        offlineLeaveRetryMs: cfg.offlineLeaveRetryMs,
        combatLeaveRetryMs: cfg.combatLeaveRetryMs,
        pursuitLeaveRetryMs: cfg.pursuitLeaveRetryMs
      }),
      reloadConfirmation
    });
  }

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
        writePersistentPendingExitStateCore(localStorage, PENDING_EXIT_STATE_KEY, pending || bot.pendingExit, Date.now(), pendingExitPersistenceCoreHelpers());
      }
      flushCombatLogs(true);
      logStatus('leave confirmation reload blocked until exit audit logs flush: ' + (reason || ''), {
        kind: 'wait',
        reason: 'exit-log-flush-pending',
        dx: 0,
        dy: 0,
        self: bot.lastSelf,
        pendingExit: pendingExitSummaryForRecovery(pending),
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
    writePersistentPendingExitStateCore(localStorage, PENDING_EXIT_STATE_KEY, pending || bot.pendingExit, Date.now(), pendingExitPersistenceCoreHelpers());
    bot.reloadRequestedAt = t;
    logStatus('leave confirmation reload: ' + reason, {
      kind: 'wait',
      reason: 'leave-success-refresh-confirmation',
      pendingExit: pendingExitSummaryForRecovery(pending),
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
    const combined = title + '\n' + text;
    const isCloudflareError = /Error\s*1033/i.test(combined)
      || /Cloudflare\s+Tunnel\s+error/i.test(combined)
      || (/Cloudflare/i.test(combined) && /unable\s+to\s+resolve/i.test(combined));
    const isBunkerWebError = /BunkerWeb/i.test(combined)
      && (/\b403\b/i.test(combined) || /Forbidden/i.test(combined) || /client-side\s+error/i.test(combined) || /Access\s+is\s+forbidden/i.test(combined));
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
    const storedSnapshotExitRecovery = activeNoSelfSnapshotRecoveryState(localStorage, userId, { key: NO_SELF_SNAPSHOT_RECOVERY_KEY });
    const memorySnapshotExitRecovery = storedSnapshotExitRecovery ? null : normalizeNoSelfSnapshotRecoveryState(bot.noSelfSnapshotRecovery);
    const snapshotExitRecovery = storedSnapshotExitRecovery || (memorySnapshotExitRecovery && (!memorySnapshotExitRecovery.userId || !userId || memorySnapshotExitRecovery.userId === userId) ? memorySnapshotExitRecovery : null);
    const hasSessionEvidence = Boolean(!snapshotExitRecovery && userId && !loginRequired && (
      control?.hasToken
      || controlHasNativeGameSession(control)
      || snapshotSelf.present
      || control?.transport === 'native-page'
      || Number.isFinite(wsReadyStateNumber(control?.nativeWsReadyState))
      || Number.isFinite(wsReadyStateNumber(control?.wsReadyState))
    ));
    const reconnectChurn = Boolean(control?.nativeReconnectChurn);
    const sessionMismatch = Boolean(!snapshotExitRecovery && controlHasAuthoritativeSessionMismatch(control, snapshotSelf));
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
      snapshotExitRecovery,
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
    const enemyHoldRemainingMs = enemyReloginHoldRemainingMsForSessionRecoveryBoundCore(bot, localStorage, {
      loginSuppressKey: LOGIN_SUPPRESS_KEY,
      loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY,
      readPersistentExitState,
      enemyLeaveStateKey: ENEMY_LEAVE_STATE_KEY,
      now: Date.now
    });
    const offlineHoldRemainingMs = offlineReloginHoldRemainingMsForSessionRecoveryBoundCore(bot, localStorage, {
      loginSuppressKey: LOGIN_SUPPRESS_KEY,
      loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY,
      readPersistentExitState,
      offlineLeaveStateKey: OFFLINE_LEAVE_STATE_KEY,
      staleOfflineStaminaHoldContradicted,
      clearOfflineReloginHold: reason => clearOfflineReloginHoldForSessionRecoveryBoundCore(bot, localStorage, reason, {
        now: Date.now,
        writePersistentPendingExitState: pending => writePersistentPendingExitStateCore(localStorage, PENDING_EXIT_STATE_KEY, pending || bot.pendingExit, Date.now(), pendingExitPersistenceCoreHelpers()),
        clearPersistentPendingExitState,
        clearPersistentExitState,
        loginSuppressKey: LOGIN_SUPPRESS_KEY,
        loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY,
        offlineLeaveStateKey: OFFLINE_LEAVE_STATE_KEY
      }),
      now: Date.now
    });
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
      pendingExit: pendingExitSummaryForRecovery(bot.pendingExit),
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

  return {
    requestReload,
    requestLeaveConfirmationReload,
    requestSessionMismatchRecoveryReload,
    cloudflareErrorInfo,
    maybeReloadCloudflareError,
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
    liveSessionMismatchTakeoverState
  };
}

module.exports = {
  createSessionRecoveryRuntime
};
