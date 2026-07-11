'use strict';

const { formatDurationMs, formatDistance, actorLabel, hpDisplay } = require('./display-format');
const {
  combatExitSummaryCore: combatExitSummaryForLeaveFlowCore,
  enemyReloginHoldRemainingMsBoundCore: enemyReloginHoldRemainingMsForLeaveFlowBoundCore,
  finalizeLeaveDisplayReasonCore: finalizeLeaveDisplayReasonForLeaveFlowCore,
  injuryLeaveSummaryCore: injuryLeaveSummaryForLeaveFlowCore,
  leaveWaitDisplayCore: leaveWaitDisplayForLeaveFlowCore,
  offlineExitRequiresUnsafeReloginDelayCore,
  offlineLeaveSummaryCore: offlineLeaveSummaryForLeaveFlowCore,
  primePendingStaminaExitLoginSuppressBoundCore,
  primePendingUnsafeExitLoginSuppressBoundCore,
  pursuitLeaveSummaryCore: pursuitLeaveSummaryForLeaveFlowCore,
  startExitAuditBoundCore
} = require('./exit-relogin');
const {
  DEFAULT_NO_SELF_SNAPSHOT_RECOVERY_KEY,
  normalizeNoSelfSnapshotRecoveryState,
  activeNoSelfSnapshotRecoveryState: activeNoSelfSnapshotRecoveryStateCore,
  markNoSelfSnapshotRecoveryLoginStarted,
  clearNoSelfSnapshotRecoveryState: clearNoSelfSnapshotRecoveryStateCore
} = require('./no-self-snapshot-recovery-state');
const { leaveDetailHasHttp403Core } = require('./pending-exit');

function createLeaveFlowRuntime(runtime = {}) {
  const {
    bot,
    cfg,
    storage = typeof localStorage !== 'undefined' ? localStorage : null,
    pageGlobal = typeof window !== 'undefined' ? window : null,
    noSelfSnapshotRecoveryKey = DEFAULT_NO_SELF_SNAPSHOT_RECOVERY_KEY,
    loginSuppressKey = '',
    loginSuppressReasonKey = '',
    enemyLeaveStateKey = '',
    readPersistentExitState = () => null,
    getCurrentUserId = () => 0,
    getSessionToken = () => '',
    getNativeControl = () => null,
    hasNativeGameSession = () => false,
    findLoginControl = () => null,
    hasLoginRequiredText = () => false,
    getSelf = () => null,
    summarizeSelf = value => value,
    summarizeControl = () => null,
    syncPausedFromPage = () => false,
    snapshotLoginGateStatus = () => ({}),
    exitAuditFlushPending = () => false,
    exitAuditFlushBlockDetail = reason => ({ blocked: true, reason }),
    importantSessionEndFlushPending = () => false,
    importantSessionEndFlushBlockDetail = reason => ({ blocked: true, reason }),
    flushCombatLogs = () => false,
    closeCurrentImportantSessionBeforeLogin = () => null,
    readPageGlobal = () => null,
    locationHref = () => (typeof location === 'object' && location ? location.href : ''),
    sleepMs = ms => new Promise(resolve => setTimeout(resolve, ms)),
    loginSuppressRemainingMs = () => 0,
    ensureLoginSnapshotGate = async () => ({}),
    loginSnapshotGateAllowsLogin = () => false,
    markManualLoginBypass = () => {},
    setLoginSuppress = () => 0,
    requestReload = () => false,
    controlText = () => '',
    dismissHelpModal = () => ({ dismissed: false, reason: 'unavailable' }),
    clearCurrentReloginHold = () => ({}),
    clearNoSelfLocalSessionAfterLeave403 = () => null,
    updateBotPanel = () => {},
    triggerNativeTick = () => false,
    issueLeaveCommand = async detail => detail,
    pendingExitSkipNewLeave = () => null,
    rememberPendingExit = () => null,
    activeOfflineLeaveDetail = () => null,
    activeEnemyLeaveDetail = () => null,
    resetLoginSnapshotGate = () => null,
    loginPointSafetyExitSelfForDetail = () => null,
    ensureExitAuditDetail = () => null,
    recordExitAuditEvent = () => false,
    staminaBudgetCoinLeaveSummary = () => '',
    staminaExhaustedWindowLabel = () => '',
    staminaBudgetReloginDelayMs = () => 0,
    staminaResetHoldUntil = () => 0,
    knownLongStaminaExhaustionLoginHold = () => null,
    reloginDelayForHpCore = () => 0,
    randomBetween = () => 0,
    hpInfoForRelogin = () => ({ hp: 100, maxHp: 100, ratio: 1 }),
    now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
    dist = () => 0,
    speed = () => 0,
    clamp = (value, min, max) => Math.max(min, Math.min(max, value)),
    isAlive = value => Boolean(value),
    isInvulnerable = () => false,
    threatKey = threat => String(threat?.id ?? threat?.user_id ?? ''),
    returnBlockRadius = () => 0
  } = runtime;
  const localStorage = storage;
  const LOGIN_SUPPRESS_KEY = loginSuppressKey;
  const LOGIN_SUPPRESS_REASON_KEY = loginSuppressReasonKey;
  const ENEMY_LEAVE_STATE_KEY = enemyLeaveStateKey;
  const NO_SELF_SNAPSHOT_RECOVERY_KEY = noSelfSnapshotRecoveryKey;

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

  function nativeWsConnectingOrOpen(native) {
    return [
      native?.wsReadyState,
      native?.nativeWsReadyState,
      native?.ws?.readyState,
      native?.state?.ws?.readyState
    ].some(value => {
      const n = Number(value);
      return n === 0 || n === 1;
    });
  }

  function loginStartEvidenceSnapshot(userId = 0) {
    const native = getNativeControl();
    const currentUserId = Number(getCurrentUserId() || userId || 0) || 0;
    const self = getSelf();
    let href = '';
    try {
      href = String(locationHref() || '');
    } catch (_) {}
    return {
      href,
      hasToken: Boolean(getSessionToken()),
      currentUserId,
      hasAliveSelf: Boolean(self && isAlive(self)),
      hasNativeSession: Boolean(hasNativeGameSession(native, currentUserId || userId)),
      nativeWsConnectingOrOpen: nativeWsConnectingOrOpen(native)
    };
  }

  function loginStartEvidenceStarted(before, after, methodResult) {
    return Boolean(
      (before.href && after.href && before.href !== after.href)
        || (!before.hasAliveSelf && after.hasAliveSelf)
        || (!before.hasToken && after.hasToken)
        || (!before.currentUserId && after.currentUserId)
        || (!before.hasNativeSession && after.hasNativeSession)
        || (!before.nativeWsConnectingOrOpen && after.nativeWsConnectingOrOpen)
    );
  }

  function summarizeLoginMethodResult(value) {
    if (value === undefined) return 'undefined';
    if (value === null) return null;
    if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') return value;
    if (value && typeof value === 'object') {
      return {
        ok: Boolean(value.ok),
        started: Boolean(value.started || value.loginStarted),
        reason: String(value.reason || ''),
        error: String(value.error || '')
      };
    }
    return typeof value;
  }

  async function waitForLoginStartEvidence(before, methodResult, userId = 0) {
    const waitMs = methodResult === false ? 0 : Math.max(0, Number(cfg.loginStartEvidenceMs ?? 700) || 0);
    if (waitMs > 0) await sleepMs(waitMs);
    const after = loginStartEvidenceSnapshot(userId);
    return {
      started: methodResult !== false && loginStartEvidenceStarted(before, after, methodResult),
      waitMs,
      methodResult: summarizeLoginMethodResult(methodResult),
      before,
      after
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

  function hasPursuitLeaveInjuryHp(self) {
    const hp = Number(self?.hp);
    const threshold = Math.max(1, Number(cfg.pursuitLeaveNonFullHpThreshold ?? cfg.profitLiveInjuryHp ?? 90));
    return Number.isFinite(hp) && hp <= threshold;
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
	    const nonFullHp = hasPursuitLeaveInjuryHp(self);
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
	      nonFullHp: hasPursuitLeaveInjuryHp(self),
	      combatSuppressed
	    };
    if (bot.lastSafety) bot.lastSafety.pursuit = summarizePursuit(bot.pursuit);
    return bot.pursuit;
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
    dismissHelpModal('auto-login');
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
    const storedSnapshotExitRecovery = activeNoSelfSnapshotRecoveryStateCore(localStorage, userId, { key: NO_SELF_SNAPSHOT_RECOVERY_KEY });
    const memorySnapshotExitRecovery = storedSnapshotExitRecovery ? null : normalizeNoSelfSnapshotRecoveryState(bot.noSelfSnapshotRecovery);
    const snapshotExitRecovery = storedSnapshotExitRecovery || (memorySnapshotExitRecovery && (!memorySnapshotExitRecovery.userId || !userId || memorySnapshotExitRecovery.userId === userId) ? memorySnapshotExitRecovery : null);
    if (snapshotExitRecovery && hasAliveSelf) {
      clearNoSelfSnapshotRecoveryStateCore(localStorage, { key: NO_SELF_SNAPSHOT_RECOVERY_KEY, reason: 'self restored before login' });
      bot.noSelfSnapshotRecovery = null;
    }
    const ignoreStalePageSession = Boolean(snapshotExitRecovery && !hasAliveSelf);
    const recoveryLoginGraceMs = Math.max(
      10000,
      Number(cfg.postLoginGraceMs || 0) || 0,
      Number(cfg.loginCooldownMs || 0) || 0
    );
    const recoveryLoginStartedAt = Number(snapshotExitRecovery?.loginStartedAt || 0) || 0;
    const recoveryLoginSuppressUntil = Number(snapshotExitRecovery?.loginSuppressUntil || 0) || 0;
    const recoveryLoginPendingRemainingMs = recoveryLoginStartedAt
      ? Math.max(
        0,
        Math.round(Math.max(recoveryLoginStartedAt + recoveryLoginGraceMs, recoveryLoginSuppressUntil) - t)
      )
      : 0;
    const shouldIgnoreSuppress = Boolean(ignoreSuppress || (ignoreStalePageSession && !recoveryLoginPendingRemainingMs));
    const currentStartLinuxDoLogin = readPageGlobal('startLinuxDoLogin', null, pageGlobal);
    const canStartLogin = Boolean(loginControl || typeof currentStartLinuxDoLogin === 'function');
    const effectiveHasToken = ignoreStalePageSession ? false : hasToken;
    const effectiveHasNativeSession = ignoreStalePageSession ? false : hasNativeSession;
    const hasPageSession = Boolean(effectiveHasToken || effectiveHasNativeSession);
    const needsLogin = !hasAliveSelf && (
      loginRequired
        || !hasPageSession
        || (force && canStartLogin && (!effectiveHasNativeSession || allowLiveSessionTakeoverBypass))
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
        effectiveHasToken,
        effectiveHasNativeSession,
        snapshotExitRecovery,
	        nativeWsReadyState: native?.wsReadyState ?? null,
	        currentUserId: userId,
	        snapshotGate: snapshotLoginGateStatus(),
	        liveSessionTakeover,
	        self: hasAliveSelf ? summarizeSelf(self) : null
	      } : null;
	    }
    const staminaLoginHold = !manualOverride ? knownLongStaminaExhaustionLoginHold(t) : null;
    if (staminaLoginHold) {
      return {
        needed: true,
        attempted: false,
        reason: 'known-long-stamina-exhausted',
        cooldownRemainingMs: staminaLoginHold.holdRemainingMs || 0,
        cooldownTotalMs: staminaLoginHold.totalMs || staminaLoginHold.holdRemainingMs || 0,
        error: '',
        staminaHold: staminaLoginHold,
        suppressReason: staminaLoginHold.displayReason || 'known long stamina exhausted',
        hasToken,
        hasNativeSession,
        effectiveHasToken,
        effectiveHasNativeSession,
        snapshotExitRecovery,
        nativeWsReadyState: native?.wsReadyState ?? null,
        currentUserId: userId,
        snapshotGate: snapshotLoginGateStatus(),
        liveSessionTakeover
      };
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
	        effectiveHasToken,
	        effectiveHasNativeSession,
	        snapshotExitRecovery,
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
    if (suppressRemainingMs > 0 && !shouldIgnoreSuppress) {
      return {
        needed: true,
        attempted: false,
        reason: 'suppressed',
        cooldownRemainingMs: Math.round(suppressRemainingMs),
        error: '',
        suppressReason: localStorage.getItem(LOGIN_SUPPRESS_REASON_KEY) || 'login flow',
	        hasToken,
	        hasNativeSession,
	        effectiveHasToken,
	        effectiveHasNativeSession,
	        snapshotExitRecovery,
	        nativeWsReadyState: native?.wsReadyState ?? null,
	        currentUserId: userId,
	        snapshotGate: snapshotLoginGateStatus(),
	        liveSessionTakeover
	      };
	    }
    if (recoveryLoginPendingRemainingMs > 0 && !ignoreLoginCooldown && !manualOverride) {
      return {
        needed: true,
        attempted: false,
        reason: 'cooldown',
        cooldownRemainingMs: recoveryLoginPendingRemainingMs,
        error: '',
        suppressReason: 'bot login started',
        recoveryLoginPending: true,
        hasToken,
        hasNativeSession,
        effectiveHasToken,
        effectiveHasNativeSession,
        snapshotExitRecovery,
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
	        effectiveHasToken,
	        effectiveHasNativeSession,
	        snapshotExitRecovery,
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
	        effectiveHasToken,
	        effectiveHasNativeSession,
	        snapshotExitRecovery,
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
      effectiveHasToken,
      effectiveHasNativeSession,
      snapshotExitRecovery,
      nativeWsReadyState: native?.wsReadyState ?? null,
      currentUserId: userId,
	      loginRequired,
	      forced: force,
	      manualLoginBypass: manualOverride,
	      ignoredSuppressMs: shouldIgnoreSuppress ? Math.round(suppressRemainingMs) : 0,
	      snapshotGate,
	      liveSessionTakeover,
	      snapshotGateBypassed: Boolean(snapshotGate.liveSessionTakeoverBypass),
	      loginControl: loginControl ? (loginControl.id ? '#' + loginControl.id : (controlText(loginControl) || loginControl.tagName.toLowerCase())) : '',
      method: '',
      clickAttempted: false,
      loginStarted: false,
      loginStartAttempts: [],
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
      const preferLoginControl = Boolean(loginControl && !hasAliveSelf);
      if (manualOverride) markManualLoginBypass(String(reason || 'manual login'));
      const controlMethod = loginControl ? (loginControl.id ? '#' + loginControl.id : (controlText(loginControl) || loginControl.tagName.toLowerCase())) : '';
      const globalMethod = startLoginFn ? (rawStartLinuxDoLogin ? 'rawStartLinuxDoLogin' : 'startLinuxDoLogin') : '';
      const loginMethods = [];
      if (preferLoginControl && loginControl) loginMethods.push({ type: 'control', method: controlMethod });
      if (startLoginFn) loginMethods.push({ type: 'global', method: globalMethod });
      if (!preferLoginControl && loginControl) loginMethods.push({ type: 'control', method: controlMethod });
      if (!loginMethods.length) {
        detail.error = 'login control not found';
      } else {
        for (const item of loginMethods) {
          let methodResult;
          const evidenceBefore = loginStartEvidenceSnapshot(userId);
          if (item.type === 'control') {
            detail.clickAttempted = true;
            loginControl.click();
          } else {
            methodResult = startLoginFn.call(pageGlobal);
            if (methodResult && typeof methodResult.then === 'function') methodResult = await methodResult;
          }
          const evidence = await waitForLoginStartEvidence(evidenceBefore, methodResult, userId);
          detail.loginStartAttempts.push({ type: item.type, method: item.method, evidence });
          if (evidence.started) {
            detail.attempted = true;
            detail.loginStarted = true;
            detail.method = item.method;
            detail.error = '';
            break;
          }
          detail.error = item.method + ' did not start login';
        }
      }
    } catch (err) {
      detail.error = err?.message || String(err);
    }
    if (detail.attempted && !detail.error) {
      const loginSuppressUntil = setLoginSuppress('bot login started', cfg.postLoginGraceMs);
      if (ignoreStalePageSession && snapshotExitRecovery) {
        const markerResult = markNoSelfSnapshotRecoveryLoginStarted(localStorage, userId, {
          loginSuppressUntil,
          loginMethod: detail.method,
          reason
        }, { key: NO_SELF_SNAPSHOT_RECOVERY_KEY });
        if (markerResult.state) {
          bot.noSelfSnapshotRecovery = markerResult.state;
          detail.snapshotExitRecovery = markerResult.state;
        }
        if (markerResult.error) detail.snapshotExitRecoveryUpdateError = markerResult.error;
      }
    }
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
    if (detail.attempted && leaveDetailHasHttp403Core(detail) && offlineSafety?.noSelfGameSession) {
      const recovery = clearNoSelfLocalSessionAfterLeave403(summarizeControl(), offlineSafety.noSelfGameSession, detail);
      if (recovery?.clearedLocalSession) {
        detail.exitPending = false;
        detail.exitConfirmed = true;
        detail.exitConfirmedAt = recovery.clearedAt || Date.now();
        detail.exitConfirmation = {
          known: true,
          alive: false,
          source: 'leave-http-403-no-self-local-session-reset',
          http403: true,
          localSessionReset: recovery
        };
        detail.localSessionReset = recovery;
        detail.summary = recovery.displayReason || detail.summary;
        detail.displayReason = recovery.displayReason || detail.displayReason || detail.summary;
        detail.reloadRequested = Boolean(requestReload('leave 403 no-self local session reset'));
      }
    }
    if (detail.attempted && !detail.exitConfirmed) {
      const staminaSuppress = primePendingStaminaExitLoginSuppressBoundCore(detail, { now: Date.now, staminaBudgetReloginDelayMs, staminaResetHoldUntil, setLoginSuppress });
      if (!staminaSuppress && offlineExitRequiresUnsafeReloginDelayCore(reason, offlineSafety)) {
        primePendingUnsafeExitLoginSuppressBoundCore('offline leave', reason, detail, selfSummary, {}, { hpInfoForRelogin, reloginDelayForHp: (selfLike, detail) => reloginDelayForHpCore(selfLike, detail, { cfg, hpInfoForRelogin, randomBetween, clamp }), cfg, setLoginSuppress, now: Date.now });
      }
    }
    if ((detail.attempted || detail.exitAuditId) && !detail.exitConfirmed) {
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
  };
}

module.exports = {
  createLeaveFlowRuntime
};
