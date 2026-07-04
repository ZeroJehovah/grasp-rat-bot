'use strict';

function pendingExitSource(options = {}) {
  const offlineSuppressPrelude = options.bundledRuntime
    ? "  const { clearLoginSuppressMatchingBoundCore, setExitReloginSuppressBoundCore, setOfflineLeaveSuppressBoundCore } = require('./src/browser/runtime/exit-relogin');\n\n"
    : '';
  const clearLoginSuppressMatchingBinding = options.bundledRuntime
    ? "clearLoginSuppressMatching: pattern => clearLoginSuppressMatchingBoundCore(localStorage, pattern, { loginSuppressKey: LOGIN_SUPPRESS_KEY, loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY })"
    : 'clearLoginSuppressMatching';
  const clearLoginSuppressMatchingCall = pattern => options.bundledRuntime
    ? `clearLoginSuppressMatchingBoundCore(localStorage, ${pattern}, { loginSuppressKey: LOGIN_SUPPRESS_KEY, loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY })`
    : `clearLoginSuppressMatching(${pattern})`;
  const offlineSuppressCall = options.bundledRuntime
    ? `\t      setOfflineLeaveSuppressBoundCore(bot, localStorage, detail.reason || 'websocket offline', detail, detail.self || pending.self || null, suppressOptions, { cfg, loginSuppressKey: LOGIN_SUPPRESS_KEY, loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY, enemyLeaveStreakKey: ENEMY_LEAVE_STREAK_KEY, enemyLeaveStateKey: ENEMY_LEAVE_STATE_KEY, offlineLeaveStateKey: OFFLINE_LEAVE_STATE_KEY, hpInfoForRelogin, reloginDelayForHp, ${clearLoginSuppressMatchingBinding}, finalizeLeaveDisplayReason, writePersistentExitState, setLoginSuppress, staminaBudgetReloginDelayMs, staminaResetHoldUntil, now: Date.now });`
    : "\t      setOfflineLeaveSuppress(detail.reason || 'websocket offline', detail, detail.self || pending.self || null, suppressOptions);";
  const enemyLeaveSuppressCall = options.bundledRuntime
    ? `\t      setExitReloginSuppressBoundCore(bot, localStorage, 'enemy leave', detail.reason || 'enemy leave', detail, detail.self || pending.self || detail.injury?.self || detail.injury || null, suppressOptions, { cfg, loginSuppressKey: LOGIN_SUPPRESS_KEY, loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY, enemyLeaveStreakKey: ENEMY_LEAVE_STREAK_KEY, enemyLeaveStateKey: ENEMY_LEAVE_STATE_KEY, offlineLeaveStateKey: OFFLINE_LEAVE_STATE_KEY, hpInfoForRelogin, reloginDelayForHp, ${clearLoginSuppressMatchingBinding}, finalizeLeaveDisplayReason, writePersistentExitState, setLoginSuppress, now: Date.now });`
    : "\t      setEnemyLeaveSuppress(detail.reason || 'enemy leave', detail, detail.self || pending.self || detail.injury?.self || detail.injury || null, suppressOptions);";
  return String.raw`${offlineSuppressPrelude}	  function summarizePursuit(pursuit = bot.pursuit) {
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

  function pendingExitRetryMs(pending) {
    const source = String(pending?.source || '');
    const retryFloorMs = Math.max(
      1000,
      Number(cfg.leaveRetryMinMs ?? cfg.leaveCommandTimeoutMs ?? 10000) || 10000
    );
    if (pending?.scope === 'offline' || source === 'offline') {
      return Math.max(retryFloorMs, Number(cfg.offlineLeaveRetryMs || cfg.combatLeaveRetryMs || 1000));
    }
    if (source === 'pursuit') {
      return Math.max(retryFloorMs, Number(cfg.pursuitLeaveRetryMs || cfg.combatLeaveRetryMs || 1000));
    }
    return Math.max(retryFloorMs, Number(cfg.combatLeaveRetryMs || cfg.pursuitLeaveRetryMs || 1000));
  }

  function pendingExitDisplayReason(summary) {
    const base = String(summary || '退出请求已发送').trim();
    return base + '，等待退出确认，未退出会继续补发';
  }

	  function summarizePendingExit(pending = bot.pendingExit) {
	    if (!pending) return null;
	    const t = Date.now();
	    const retryMs = pendingExitRetryMs(pending);
	    const lastAttemptAt = Number(pending.lastAttemptAt || 0);
	    const reloadConfirmation = normalizePendingExitReloadConfirmation(pending.reloadConfirmation, pending, t);
	    return {
	      scope: pending.scope || '',
	      source: pending.source || '',
	      reason: pending.reason || '',
	      summary: pending.summary || '',
      displayReason: pending.displayReason || '',
      at: Number(pending.at || 0),
      ageMs: pending.at ? Math.max(0, Math.round(t - Number(pending.at || t))) : 0,
      lastAttemptAt,
      lastAttemptAgeMs: lastAttemptAt ? Math.max(0, Math.round(t - lastAttemptAt)) : null,
	      retryMs,
	      retryRemainingMs: lastAttemptAt ? Math.max(0, Math.round(retryMs - (t - lastAttemptAt))) : 0,
	      retryCount: Number(pending.retryCount || 0),
	      leaveRequestPending: Boolean(pending.lastResult?.leaveRequestPending),
	      reloadConfirmation: reloadConfirmation ? {
	        required: Boolean(reloadConfirmation.required),
	        requestedAt: Number(reloadConfirmation.requestedAt || 0),
	        reloadedAt: Number(reloadConfirmation.reloadedAt || 0),
	        restoredAfterReload: Boolean(reloadConfirmation.restoredAfterReload),
	        ageAfterReloadMs: reloadConfirmation.reloadedAt ? Math.max(0, Math.round(t - Number(reloadConfirmation.reloadedAt || t))) : null,
	        count: Number(reloadConfirmation.count || 0),
	        reason: reloadConfirmation.reason || ''
	      } : null,
	      userId: pending.userId || null,
	      combatCover: pending.combatCover ? {
        reason: pending.combatCover.reason || '',
        dx: clamp(Math.round(Number(pending.combatCover.dx) || 0), -1, 1),
        dy: clamp(Math.round(Number(pending.combatCover.dy) || 0), -1, 1),
        shoot: Boolean(pending.combatCover.shoot)
      } : null,
      lastError: pending.lastResult?.error || ''
    };
  }

  function pendingExitSkipNewLeave(source, reason, extra = {}) {
    const pending = bot.pendingExit;
    if (!pending) return null;
    const summary = pending.summary || extra.summary || String(reason || '').trim() || '退出请求已发送';
    return finalizeLeaveDisplayReason({
      ...extra,
      attempted: false,
      method: '',
      reason: 'pending-exit-active',
      skippedNewLeave: true,
      skippedSource: source || '',
      skippedReason: reason || '',
      exitPending: true,
      exitConfirmed: false,
      pendingExit: summarizePendingExit(pending),
      summary,
      error: ''
    });
  }

  function pendingExitIntentForSkippedLeave(source, reason, detail = null) {
    return {
      reason: 'pending-exit-active',
      source: source || '',
      skippedReason: reason || '',
      summary: detail?.summary || bot.pendingExit?.summary || '',
      pendingExit: summarizePendingExit()
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
      displayReason: pendingExitDisplayReason(summary),
      at: Number(previous?.at || detail.at || t),
      updatedAt: t,
      lastAttemptAt: Number(detail.at || t),
      retryCount: Number(previous?.retryCount || 0) + 1,
      retryMs: pendingExitRetryMs({ scope, source }),
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
	    detail.pendingExit = summarizePendingExit(pending);
	    detail.displayReason = pending.displayReason;
	    writePersistentPendingExitState(pending);
	    if (leaveDetailSucceeded(detail) && !leaveDetailHasHttp403(detail)) {
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

  function leaveRequestHasHttp403(request) {
    if (!request || typeof request !== 'object') return false;
    const status = Number(request.status ?? request.statusCode ?? request.result?.status ?? request.result?.statusCode ?? NaN);
    if (status === 403) return true;
    const fields = [
      request.error,
      request.message,
      request.statusText,
      request.result?.error,
      request.result?.message,
      request.result?.statusText
    ];
    return fields.some(value => /(?:^|D)403(?:D|$)|forbidden/i.test(String(value || '')));
  }

  function leaveDetailHasHttp403(detail) {
    if (!detail || typeof detail !== 'object') return false;
    if (leaveRequestHasHttp403(detail) || leaveRequestHasHttp403(detail.lastLeaveRequest)) return true;
    return Array.isArray(detail.leaveRequests) && detail.leaveRequests.some(leaveRequestHasHttp403);
  }

	  function leaveDetailSucceeded(detail) {
	    if (!detail || typeof detail !== 'object') return false;
	    if (!detail.attempted || detail.leaveRequestPending || detail.error || leaveDetailHasHttp403(detail)) return false;
	    const request = detail.lastLeaveRequest || (Array.isArray(detail.leaveRequests) ? detail.leaveRequests[detail.leaveRequests.length - 1] : null);
	    return !request || Boolean(request.completedAt || request.method || detail.method);
	  }

	  function leaveSuccessReloadConfirmationForDetail(detail, pending = null, t = Date.now()) {
	    if (!leaveDetailSucceeded(detail) || leaveDetailHasHttp403(detail)) return normalizePendingExitReloadConfirmation(pending?.reloadConfirmation, pending, t);
	    const existing = normalizePendingExitReloadConfirmation(detail.reloadConfirmation || pending?.reloadConfirmation, pending, t);
	    const request = detail.lastLeaveRequest || (Array.isArray(detail.leaveRequests) ? detail.leaveRequests[detail.leaveRequests.length - 1] : null);
	    return {
	      required: true,
	      reason: 'leave-success',
	      leaveSucceededAt: Number(existing?.leaveSucceededAt || request?.completedAt || detail.at || t) || t,
	      requestId: String(existing?.requestId || request?.requestId || ''),
	      requestedAt: Number(existing?.requestedAt || 0) || 0,
	      reloadedAt: Number(existing?.reloadedAt || 0) || 0,
	      restoredAfterReload: Boolean(existing?.restoredAfterReload),
	      count: Math.max(0, Math.round(Number(existing?.count || 0) || 0)),
	      lastResult: existing?.lastResult || null,
	      lastBlocked: existing?.lastBlocked || null
	    };
	  }

	  function attachLeaveSuccessReloadConfirmation(pending, detail, t = Date.now()) {
	    if (!pending || !leaveDetailSucceeded(detail) || leaveDetailHasHttp403(detail)) return null;
	    const reloadConfirmation = leaveSuccessReloadConfirmationForDetail(detail, pending, t);
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
	    detail.pendingExit = summarizePendingExit(pending);
	    writePersistentPendingExitState(pending);
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
	    wait.pendingExit = summarizePendingExit(pending);
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

	  function leaveSuccessReloadConfirmationSatisfied(reloadConfirmation) {
	    return Boolean(reloadConfirmation?.restoredAfterReload || Number(reloadConfirmation?.reloadedAt || 0) > 0);
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
        || leaveDetailHasHttp403(detail)
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
    finalizeLeaveDisplayReason(detail);
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
    ${clearLoginSuppressMatchingCall(`
      clearedEnemy && clearedOffline
        ? /enemy leave|offline.*leave|combat leave|pursuit leave/i
        : (clearedEnemy ? /enemy leave|combat leave|pursuit leave/i : /offline.*leave/i)
    `)};
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
    const http403 = Boolean(state?.http403 || leaveDetailHasHttp403(detail));
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
${offlineSuppressCall}
	    } else {
${enemyLeaveSuppressCall}
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

  function pendingExitWaitReason(pending, confirmed = false) {
    if (confirmed) return pending.scope === 'offline' ? 'offline-leave-wait' : 'enemy-leave-wait';
    if (pending.scope === 'offline') return 'offline-leave';
    if (pending.source === 'pursuit') return 'pursuit-leave-retry';
    return 'combat-leave-retry';
  }

  function pendingExitWaitDecision(pending, self, leaveResult, state, confirmed = false) {
    const activeDetail = pending.scope === 'offline' ? activeOfflineLeaveDetail() : activeEnemyLeaveDetail();
    const currentSummary = state?.self || (self && isAlive(self) ? summarizeSelf(self) : (pending.self || bot.lastSelf || null));
    const cover = !confirmed && pending.source === 'combat' ? pending.combatCover : null;
    return {
      kind: 'wait',
      reason: pendingExitWaitReason(pending, confirmed),
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
      pendingExit: summarizePendingExit(bot.pendingExit || pending),
      exitConfirmation: state || null,
      holdRemainingMs: activeDetail?.holdRemainingMs ?? (pending.scope === 'offline' ? offlineReloginHoldRemainingMs() : enemyReloginHoldRemainingMs())
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
    const retryMs = pendingExitRetryMs(pending);
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
        pendingExit: summarizePendingExit(pending),
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
    resetClashLeaveRescueRound(detail);
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
    writePersistentPendingExitState(bot.pendingExit);
    detail.pendingExit = summarizePendingExit(bot.pendingExit);
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
      writePersistentPendingExitState(next);
      detail.pendingExit = summarizePendingExit(next);
      detail.displayReason = detail.displayReason || pending.displayReason || pendingExitDisplayReason(detail.summary || pending.summary || detail.reason);
    }
    recordPendingExitResult(pending.source, detail, t);
    return detail;
  }

  function schedulePendingExitRetry(pending, self, state) {
    if (!pending) return false;
    const t = Date.now();
    const retryMs = pendingExitRetryMs(pending);
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
    const existingHoldMs = pending.scope === 'offline' ? offlineReloginHoldRemainingMs() : enemyReloginHoldRemainingMs();
    if (existingHoldMs > 0) {
      bot.pendingExit = null;
      clearPersistentPendingExitState();
      return null;
    }
    const state = pendingExitSelfState(self);
    const lastDetail = pending.lastResult || {};
    if (leaveDetailHasHttp403(lastDetail)) {
      if (scheduleClashLeaveRescueRetry(lastDetail)) {
        bot.pursuit = null;
        if (!applyCombatExitCover(pending, self)) stopMotionSafely('pending-exit-http-403-clash-rescue');
        const detail = cloneForPendingExit(lastDetail) || {};
        detail.exitPending = true;
        detail.exitConfirmed = false;
        detail.pendingExit = summarizePendingExit(pending);
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
    if (leaveDetailSucceeded(lastDetail)) {
      const reloadConfirmation = attachLeaveSuccessReloadConfirmation(pending, lastDetail) || normalizePendingExitReloadConfirmation(pending.reloadConfirmation, pending);
      if (!leaveSuccessReloadConfirmationSatisfied(reloadConfirmation)) {
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

`;
}

module.exports = {
  pendingExitSource
};
