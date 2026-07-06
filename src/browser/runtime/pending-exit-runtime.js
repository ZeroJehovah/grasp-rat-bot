'use strict';

const { safeJsonClone } = require('./runtime-utils');
const { formatDurationMs } = require('./display-format');
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
  clearLoginSuppressMatchingBoundCore,
  clearOfflineReloginHoldBoundCore: clearOfflineReloginHoldForPendingExitBoundCore,
  enemyReloginHoldRemainingMsBoundCore: enemyReloginHoldRemainingMsForPendingExitBoundCore,
  finalizeLeaveDisplayReasonCore: finalizeLeaveDisplayReasonForPendingExitCore,
  leaveWaitDisplayCore: leaveWaitDisplayForPendingExitCore,
  offlineReloginHoldRemainingMsBoundCore: offlineReloginHoldRemainingMsForPendingExitBoundCore,
  setExitReloginSuppressBoundCore,
  setOfflineLeaveSuppressBoundCore
} = require('./exit-relogin');
const {
  resetClashLeaveRescueRoundCore: resetClashLeaveRescueRoundForPendingExitCore
} = require('./leave-command');

function createPendingExitRuntime(runtime = {}) {
  const {
    bot,
    cfg,
    storage = typeof localStorage !== 'undefined' ? localStorage : null,
    pendingExitStateKey = '',
    loginSuppressKey = '',
    loginSuppressReasonKey = '',
    enemyLeaveStateKey = '',
    offlineLeaveStateKey = '',
    enemyLeaveStreakKey = '',
    normalizePendingExitReloadConfirmationCore = value => value,
    writePersistentPendingExitStateCore = () => null,
    pendingExitPersistenceCoreHelpers = () => ({}),
    clearPersistentPendingExitState = () => {},
    clearPersistentExitState = () => {},
    readPersistentExitState = () => null,
    writePersistentExitState = () => null,
    requestReload = () => false,
    requestLeaveConfirmationReload = () => false,
    activeEnemyLeaveDetail = () => null,
    activeOfflineLeaveDetail = () => null,
    getCurrentUserId = () => 0,
    getSessionToken = () => '',
    getOwnEntity = () => null,
    getNativeState = () => null,
    getNativeControl = () => null,
    hasNativeGameSession = () => false,
    hasLoginRequiredText = () => false,
    findLoginControl = () => null,
    snapshotSelfFreshEnough = () => false,
    summarizeSelf = value => value,
    isAlive = value => Boolean(value),
    summarizeControl = () => null,
    controlHasAuthoritativeSessionMismatch = () => false,
    clearCombatEngagement = () => {},
    stopMotionAfterExit = () => {},
    stopMotionSafely = () => {},
    sendActionVelocity = () => false,
    shootAt = () => false,
    recordUnhandledTickError = () => {},
    recordExitAuditEvent = () => false,
    noteImportantSessionExit = () => null,
    logStatus = () => {},
    setLoginSuppress = () => 0,
    resetLoginSnapshotGate = () => null,
    loginPointSafetyExitSelfForDetail = () => null,
    staminaBudgetReloginDelayMs = () => 0,
    staminaResetHoldUntil = () => 0,
    staleOfflineStaminaHoldContradicted = () => false,
    reloginDelayForHpCore = () => 0,
    clamp = (value, min, max) => Math.max(min, Math.min(max, value)),
    scheduleClashLeaveRescueRetry = () => false,
    issueLeaveCommand = async detail => detail,
    clearNoSelfLocalSessionAfterConfirmedExit = () => null
  } = runtime;
  const localStorage = storage;
  const PENDING_EXIT_STATE_KEY = pendingExitStateKey;
  const LOGIN_SUPPRESS_KEY = loginSuppressKey;
  const LOGIN_SUPPRESS_REASON_KEY = loginSuppressReasonKey;
  const ENEMY_LEAVE_STATE_KEY = enemyLeaveStateKey;
  const OFFLINE_LEAVE_STATE_KEY = offlineLeaveStateKey;
  const ENEMY_LEAVE_STREAK_KEY = enemyLeaveStreakKey;

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

  function pendingExitFreshSnapshotSelfState(userId = getCurrentUserId()) {
    if (!userId || !snapshotSelfFreshEnough()) return null;
    const snapshotSelf = (bot.globalState.entities || []).find(entity => Number(entity.user_id) === userId) || null;
    return {
      known: true,
      alive: Boolean(snapshotSelf && isAlive(snapshotSelf)),
      source: 'snapshot',
      self: snapshotSelf ? summarizeSelf(snapshotSelf) : null
    };
  }

  function pendingExitCanUseSnapshotMissingSelf(pending) {
    return Boolean(pending?.scope === 'offline' && pendingNoSelfGameSession(pending, pending?.lastResult || null));
  }

  function pendingExitSelfState(self, pending = null) {
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
    const snapshotState = pendingExitFreshSnapshotSelfState(userId);
    if (snapshotState?.alive) return snapshotState;
    if (snapshotState?.known && !snapshotState.alive && pendingExitCanUseSnapshotMissingSelf(pending)) {
      return {
        ...snapshotState,
        source: 'snapshot-no-self-offline-pending'
      };
    }
    if (hasNativeGameSession(getNativeControl(), userId)) {
      return { known: false, alive: false, source: 'native-session-pending', self: null };
    }
    if (hasLoginRequiredText() || findLoginControl()) {
      return { known: true, alive: false, source: 'login-required', self: null };
    }
    if (snapshotState) return snapshotState;
    return { known: false, alive: false, source: 'unknown', self: null };
  }

  function escapeRegExpLiteral(value) {
    return String(value || '').replace(/[.*+?^$()|[]\{}]/g, '\$&');
  }

  function chatLeftUserMessageSeen(userId = getCurrentUserId()) {
    const id = String(userId || '').trim();
    if (!id) return false;
    const doc = typeof document === 'object' && document ? document : null;
    if (!doc) return false;
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
        doc.querySelectorAll(selector).forEach(el => {
          if (el && !roots.includes(el)) roots.push(el);
        });
      } catch (_) {}
    }
    if (!roots.length && doc.body) roots.push(doc.body);
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

  function snapshotSelfPresenceForPendingExit(userId = getCurrentUserId()) {
    const id = Number(userId || 0) || 0;
    const fresh = Boolean(id && snapshotSelfFreshEnough());
    const entities = Array.isArray(bot.globalState?.entities) ? bot.globalState.entities : [];
    const entity = fresh
      ? entities.find(item => Number(item?.user_id ?? item?.userId ?? item?.id ?? NaN) === id) || null
      : null;
    return {
      known: Boolean(fresh),
      fresh,
      present: Boolean(entity && isAlive(entity)),
      userId: id || null,
      self: entity ? summarizeSelf(entity) : null
    };
  }

  function externalLeftUserExitState(self, control = summarizeControl()) {
    const userId = Number(control?.currentUserId || getCurrentUserId() || 0) || 0;
    const blockedBy = [];
    const chatLeftUser = Boolean(userId && chatLeftUserMessageSeen(userId));
    const tokenCleared = Boolean(!getSessionToken() && !control?.hasToken);
    const snapshotSelf = snapshotSelfPresenceForPendingExit(userId);
    const snapshotMissingSelf = Boolean(snapshotSelf.known && !snapshotSelf.present);
    const loginRequired = Boolean(hasLoginRequiredText());
    let loginControlVisible = false;
    try {
      loginControlVisible = Boolean(findLoginControl());
    } catch (_) {
      loginControlVisible = false;
    }
    const native = getNativeControl();
    const nativeSession = Boolean(hasNativeGameSession(native, userId));
    const controlSession = Boolean(control?.rawWsOpen || control?.nativeWsOpen || control?.connecting);
    const noPageSession = Boolean(!nativeSession && !controlSession);
    const selfAlive = Boolean(self && Number(self.user_id ?? self.id ?? NaN) === userId && isAlive(self));
    const liveSelfStillAuthoritative = Boolean(
      selfAlive
        && !snapshotMissingSelf
        && !tokenCleared
        && !loginRequired
        && !loginControlVisible
        && (control?.hasToken || nativeSession || controlSession)
    );
    if (!userId) blockedBy.push('missing-user-id');
    if (!chatLeftUser) blockedBy.push('left-user-message-missing');
    if (liveSelfStillAuthoritative) blockedBy.push('self-still-authoritative');
    if (!tokenCleared && !snapshotMissingSelf && !loginRequired && !(loginControlVisible && noPageSession)) {
      blockedBy.push('exit-evidence-incomplete');
    }
    const confirmed = blockedBy.length === 0;
    const reason = confirmed ? 'external-left-user-exit-confirmed' : (blockedBy[0] || 'external-left-user-not-confirmed');
    const displayReason = confirmed
      ? '聊天确认当前用户已离开，清理本地登录状态后重登'
      : '';
    const noSelfGameSession = confirmed ? {
      shouldLeave: true,
      reason: 'external left user missing self',
      displayReason,
      userId: userId || null,
      ageMs: 0,
      externalLeftUser: true,
      snapshotSelf,
      control: control ? {
        wsOpen: Boolean(control.wsOpen),
        rawWsOpen: Boolean(control.rawWsOpen),
        connecting: Boolean(control.connecting),
        wsReadyState: control.wsReadyState ?? null,
        nativeWsReadyState: control.nativeWsReadyState ?? null,
        hasToken: Boolean(control.hasToken),
        transport: control.transport || ''
      } : null
    } : null;
    return {
      confirmed,
      reason,
      displayReason,
      source: 'external-left-user',
      at: Date.now(),
      userId: userId || null,
      chatLeftUser,
      tokenCleared,
      loginRequired,
      loginControlVisible,
      noPageSession,
      nativeSession,
      controlSession,
      selfAlive,
      snapshotSelf,
      noSelfGameSession,
      control: control || null,
      blockedBy
    };
  }

  function externalLeftUserExitRecoveryDecision(self, state) {
    const t = Date.now();
    stopMotionAfterExit('external-left-user-exit-confirmed');
    clearCombatEngagement('external-left-user-exit-confirmed');
    bot.pendingCombatLeave = null;
    bot.pendingInjuryLeave = null;
    bot.pursuit = null;
    if (bot.lastSafety) bot.lastSafety.pursuit = null;
    const selfSummary = self && isAlive(self) ? summarizeSelf(self) : (bot.lastSelf || null);
    const detail = {
      attempted: false,
      method: 'chat-left-user-confirmation',
      reason: state.reason || 'external-left-user-exit-confirmed',
      summary: state.displayReason || '聊天确认当前用户已离开',
      displayReason: state.displayReason || '',
      at: t,
      userId: state.userId || getCurrentUserId() || null,
      self: selfSummary,
      offlineSafety: {
        unsafe: true,
        noSelfGameSession: state.noSelfGameSession,
        externalLeftUser: state
      },
      error: '',
      exitPending: false,
      exitConfirmed: true,
      exitConfirmedAt: t,
      exitConfirmation: state
    };
    const recovery = clearNoSelfLocalSessionAfterConfirmedExit(
      state.control || summarizeControl(),
      state.noSelfGameSession,
      detail,
      'external left user local session reset'
    );
    if (recovery?.clearedLocalSession) {
      detail.localSessionReset = recovery;
      detail.noSelfSnapshotRecovery = recovery.recoveryMarker || null;
    }
    detail.loginSnapshotGateReset = resetLoginSnapshotGate(
      'exit-confirmed:' + detail.reason,
      loginPointSafetyExitSelfForDetail(detail, { self: detail.self || null }, bot.lastSelf)
    );
    bot.pendingExit = null;
    clearPersistentPendingExitState();
    bot.lastOfflineLeaveAt = t;
    bot.lastOfflineLeaveResult = detail;
    recordExitAuditEvent('exit-confirmed', detail, {
      at: t,
      confirmedAt: t,
      confirmation: state,
      source: 'external-left-user',
      scope: 'offline'
    });
    noteImportantSessionExit('exit-confirmed:' + detail.reason, detail.self || bot.lastSelf, t, { exit: detail });
    detail.reloadRequested = Boolean(requestReload('external left user local session reset'));
    return {
      kind: 'wait',
      reason: detail.reason,
      dx: 0,
      dy: 0,
      self: null,
      currentUserId: detail.userId || getCurrentUserId(),
      control: summarizeControl(),
      displayReason: detail.reloadRequested ? detail.displayReason + '，正在刷新页面' : detail.displayReason,
      leave: detail,
      offlineSafety: detail.offlineSafety,
      exitConfirmation: state,
      localSessionReset: detail.localSessionReset || null,
      reloadRequested: detail.reloadRequested
    };
  }

  function handleExternalLeftUserExitRecovery(self) {
    if (bot.pendingExit) return null;
    const state = externalLeftUserExitState(self);
    if (!state.confirmed) return null;
    return externalLeftUserExitRecoveryDecision(self, state);
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

  function pendingNoSelfGameSession(pending, detail, state = null) {
    if (pending?.scope !== 'offline') return null;
    return pending?.offlineSafety?.noSelfGameSession
      || detail?.offlineSafety?.noSelfGameSession
      || pending?.lastResult?.offlineSafety?.noSelfGameSession
      || state?.noSelfGameSession
      || null;
  }

  function clearConfirmedNoSelfLocalSession(pending, detail, state = null) {
    const noSelfExit = pendingNoSelfGameSession(pending, detail, state);
    if (!noSelfExit) return null;
    const recovery = clearNoSelfLocalSessionAfterConfirmedExit(
      summarizeControl(),
      noSelfExit,
      detail,
      'pending exit no-self confirmed'
    );
    if (!recovery?.clearedLocalSession) return recovery || null;
    detail.localSessionReset = recovery;
    detail.noSelfSnapshotRecovery = recovery.recoveryMarker || null;
    if (detail.exitConfirmation && typeof detail.exitConfirmation === 'object') {
      detail.exitConfirmation.localSessionReset = recovery;
      detail.exitConfirmation.noSelfLocalSessionReset = true;
    }
    return recovery;
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
    clearConfirmedNoSelfLocalSession(pending, detail, state);
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
    detail.reloadRequested = Boolean(requestReload('exit confirmed'));
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
    if (!pending) return handleExternalLeftUserExitRecovery(self);
    const existingHoldMs = pending.scope === 'offline' ? offlineReloginHoldRemainingMsForPendingExitBoundCore(bot, localStorage, { loginSuppressKey: LOGIN_SUPPRESS_KEY, loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY, readPersistentExitState, offlineLeaveStateKey: OFFLINE_LEAVE_STATE_KEY, staleOfflineStaminaHoldContradicted, clearOfflineReloginHold: reason => clearOfflineReloginHoldForPendingExitBoundCore(bot, localStorage, reason, { now: Date.now, writePersistentPendingExitState: pending => writePersistentPendingExitStateCore(localStorage, PENDING_EXIT_STATE_KEY, pending || bot.pendingExit, Date.now(), pendingExitPersistenceCoreHelpers()), clearPersistentPendingExitState, clearPersistentExitState, loginSuppressKey: LOGIN_SUPPRESS_KEY, loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY, offlineLeaveStateKey: OFFLINE_LEAVE_STATE_KEY }), now: Date.now }) : enemyReloginHoldRemainingMsForPendingExitBoundCore(bot, localStorage, { loginSuppressKey: LOGIN_SUPPRESS_KEY, loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY, readPersistentExitState, enemyLeaveStateKey: ENEMY_LEAVE_STATE_KEY, now: Date.now });
    if (existingHoldMs > 0) {
      bot.pendingExit = null;
      clearPersistentPendingExitState();
      return null;
    }
    const state = pendingExitSelfState(self, pending);
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

	
  return {
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
    snapshotSelfPresenceForPendingExit,
    externalLeftUserExitState,
    externalLeftUserExitRecoveryDecision,
    handleExternalLeftUserExitRecovery,
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
  };
}

module.exports = {
  createPendingExitRuntime
};
