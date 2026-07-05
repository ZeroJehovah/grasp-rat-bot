'use strict';

// This file is the browser runtime entry that esbuild bundles for both remote
// production and local CDP/eval injection. Keep it executable; do not rebuild
// a source-fragment layer around it.
const __graspRatRuntimeStartup = (() => {
  const { createRuntimeShellContext } = require('./runtime/runtime-shell');
  const { createRuntimeBotState } = require('./runtime/runtime-bot-state');
  const runtimeShell = createRuntimeShellContext(__GRASP_RAT_RUNTIME_CONFIG__, {
    storage: localStorage,
    now: Date.now,
    performanceNow: () => performance.now()
  });
  const {
    runtimeBootstrapBindings,
    runtimeStateBindings,
    botStatusCores
  } = runtimeShell;
		  const {
		    pageGlobalObject,
		    resolvePageGlobal,
		    readPageGlobal,
		    installPageGlobal,
		    readPageLocalStorageJson,
		    pageGlobal,
		    baseConfig,
		    runtimeConfig,
		    config,
		    OPPORTUNITY_CONSTANTS,
		    BOT_KEY,
		    PANEL_ID,
		    TARGET_OVERLAY_ID,
		    PAUSED_KEY,
		    PAUSE_REASON_KEY,
		    LOGIN_SUPPRESS_KEY,
		    LOGIN_SUPPRESS_REASON_KEY,
		    LOGIN_POINT_SAFETY_KEY,
		    SESSION_MISMATCH_RECOVERY_KEY,
		    EXIT_AUDIT_PENDING_LOGS_KEY,
		    COMBAT_LOG_PENDING_ENTRIES_KEY,
		    IMPORTANT_LOGS_KEY,
		    PENDING_EXIT_STATE_KEY,
		    ENEMY_LEAVE_STREAK_KEY,
		    ENEMY_LEAVE_STATE_KEY,
		    OFFLINE_LEAVE_STATE_KEY,
		    LAST_SELF_STATE_KEY,
		    CLOUDFLARE_RELOAD_KEY,
		    normalizeTargetWhitelistName,
		    parseTargetWhitelistNames,
		    deriveTargetWhitelistUrl,
		    staminaExhaustedLongWindows,
		    staminaEvidenceRemaining,
		    staminaHoldContradictedByStaminaEvidence,
		    previousBot,
		    preserved,
		    combatLogEndpointConfigured,
		    cfg,
		    targetWhitelistUrl,
		    preservedTargetWhitelistUrl,
		    preservedTargetWhitelistMatchesUrl,
		    preservedTargetWhitelistNames,
		    targetWhitelistState
		  } = runtimeBootstrapBindings;

		  const {
		    readPersistentLastSelfState,
		    writePersistentLastSelfState,
		    refreshExitDetail,
		    readPersistentExitState,
		    writePersistentExitState,
		    clearPersistentExitState,
		    clearPersistentPendingExitState,
		    pendingExitRetryCoreOptionsForPersistence,
		    pendingExitPersistenceCoreHelpers,
		    normalizePendingExitReloadConfirmationCore,
		    writePersistentPendingExitStateCore,
		    restoredRuntimeState,
		    restoredFailures,
		    restoredEnemyLeaveState,
		    restoredOfflineLeaveState,
		    restoredPendingExitState,
		    initialPendingExitState,
		    loginSnapshotSuccessRequiredCore,
		    normalizeLoginSnapshotGateStateCore,
		    recordRuntimeDiagnosticsCore
		  } = runtimeStateBindings;

  const {
    postExitDecisionWithoutTargetForStatusCore,
    readEnemyLeaveStreakBoundCore,
    pendingExitRetryMsForBotObjectCore,
    summarizePendingExitForBotObjectCore
  } = botStatusCores;

			  const bot = {
    ...createRuntimeBotState({
      cfg,
      config,
      preserved,
      previousBot,
      targetWhitelistState,
      initialPendingExitState,
      restoredEnemyLeaveState,
      restoredOfflineLeaveState,
      restoredFailures,
      readPersistentLastSelfState,
      readPageGlobal,
      pageGlobal,
      normalizeLoginSnapshotGateStateCore,
      loginSnapshotSuccessRequiredCore,
      performanceNow: () => performance.now()
    }),
		    stop(reason = 'manual') {
	      this.running = false;
	      this.stopReason = reason;
	      if (this.velocityStopTimer) clearTimeout(this.velocityStopTimer);
	      this.velocityStopTimer = 0;
	      this.velocityPulseToken += 1;
	      stopMotionSafely('stop');
	      detachNativeMessagePump();
	      closeControlWs(reason);
	      if (this.timer) clearInterval(this.timer);
	      this.timer = 0;
	      if (this.targetWhitelist?.timer) clearInterval(this.targetWhitelist.timer);
	      if (this.targetWhitelist) this.targetWhitelist.timer = 0;
	      try {
	        if (!String(reason || '').startsWith('replaced by ')) flushCombatLogs(true);
	      } catch (_) {}
	      logStatus('stopped: ' + reason);
	      if (readPageGlobal(BOT_KEY, null, pageGlobal) === this) {
	        removeBotPanel();
	        removeTargetOverlay();
	      }
	    },
	    setPaused(paused, reason = 'external') {
	      const next = Boolean(paused);
	      const previousReason = this.pauseReason || '';
	      const changed = this.paused !== next;
	      this.paused = next;
	      this.pauseReason = next ? String(reason || 'manual') : '';
	      const reasonChanged = previousReason !== this.pauseReason;
	      if (changed) this.pauseChangedAt = Date.now();
	      installPageGlobal('__graspRatBotPaused', next, pageGlobal);
	      installPageGlobal('__graspRatBotPauseReason', this.pauseReason, pageGlobal);
	      try {
	        localStorage.setItem(PAUSED_KEY, next ? 'true' : 'false');
	        if (next) localStorage.setItem(PAUSE_REASON_KEY, this.pauseReason || 'manual');
	        else localStorage.removeItem(PAUSE_REASON_KEY);
	      } catch (_) {}
	      if (changed && next) {
	        stopMotionSafely('paused');
	        removeTargetOverlay();
	      }
	      if (next) {
	        this.lastDecision = {
	          kind: 'idle',
	          reason: 'paused',
	          dx: 0,
	          dy: 0,
	          self: this.lastSelf,
	          paused: true,
	          pauseReason: this.pauseReason || 'manual'
	        };
	        renderTargetOverlay(this.lastDecision);
	      }
	      return this.status();
	    },
	    forceLoginNow(reason = 'panel immediate login') {
	      return forceLoginNow(reason);
	    },
	    configureCombatLogging(options = {}) {
	      return configureCombatLogging(options);
	    },
	    configureClashLeaveRescue(options = {}) {
	      if (Object.prototype.hasOwnProperty.call(options || {}, 'enabled')) {
	        cfg.clashLeaveRescueEnabled = Boolean(options.enabled);
	      }
	      if (Object.prototype.hasOwnProperty.call(options || {}, 'timeoutMs')) {
	        cfg.clashLeaveRescueTimeoutMs = Math.max(1000, Number(options.timeoutMs || cfg.clashLeaveRescueTimeoutMs || 9000) || 9000);
	      }
	      this.clashLeaveRescue.enabled = Boolean(cfg.clashLeaveRescueEnabled);
	      return {
	        enabled: Boolean(cfg.clashLeaveRescueEnabled),
	        timeoutMs: Math.max(1000, Number(cfg.clashLeaveRescueTimeoutMs || 9000) || 9000),
	        lastResult: this.clashLeaveRescue.lastResult || null
	      };
	    },
	    step(source = 'external') {
	      return tick(source);
	    },
	    status() {
      try {
        if (!this.ticking) syncPausedFromPage(false);
      } catch (_) {}
      if (this.running && !this.ticking && this.lastTickAt && Date.now() - this.lastTickAt > Math.max(3000, cfg.tickMs * 10)) {
        triggerNativeTick('status-watchdog', false);
      }
      const self = getSelf();
      const currentSelfSummary = self ? summarizeSelf(self) : null;
      const displaySelf = currentSelfSummary || this.lastSelf;
      if (self) updateKillHistory(self);
	      updateSessionStats(currentSelfSummary);
	      const session = summarizeSessionStats(displaySelf);
	      const todaySession = summarizeTodaySessionStats(session, displaySelf);
	      const enemyLeaveDetail = activeEnemyLeaveDetail();
	      const offlineLeaveDetail = activeOfflineLeaveDetail();
	      const exitMotionLockRemainingMs = exitMotionStopLockRemainingMs();
	      const displayLastDecision = exitMotionLockRemainingMs > 0
	        ? postExitDecisionWithoutTargetForStatusCore(this.lastDecision, this.lastExitMotionStopReason || 'exit-motion-stopped', { lastExitMotionStopReason: this.lastExitMotionStopReason, exitMotionLockRemainingMs })
	        : this.lastDecision;
		      return {
	        version: cfg.version,
	        sourceHash: cfg.sourceHash,
	        sourceUrl: cfg.sourceUrl,
	        injectedBy: cfg.injectedBy,
	        running: this.running,
	        paused: Boolean(this.paused),
	        pauseReason: this.pauseReason || '',
	        pauseChangedAt: this.pauseChangedAt || 0,
        ticking: Boolean(this.ticking),
        timerActive: Boolean(this.timer),
        dryRun: cfg.dryRun,
        starting: Boolean(this.starting),
        tickCount: this.tickCount,
        uptimeMs: Date.now() - this.startedAt,
        lastTickAt: this.lastTickAt,
        lastTickAgeMs: this.lastTickAt ? Date.now() - this.lastTickAt : null,
        lastTickGapMs: this.lastTickGapMs,
        lastTickSource: this.lastTickSource || '',
        lastTickCompletedAt: this.lastTickCompletedAt || 0,
        lastTickCombatActive: Boolean(this.lastTickCombatActive),
        combatTickGap: this.lastCombatTickGap || null,
        lastTickReentryGapAt: this.lastTickReentryGapAt || 0,
        lastNativeTickAgeMs: this.lastNativeTickAt ? now() - this.lastNativeTickAt : null,
        lastAction: this.lastAction,
	        lastDecision: displayLastDecision,
	        lastTarget: this.lastTarget,
	        combatTarget: this.combatTarget,
	        combatAim: this.combatAim,
	        networkQuality: summarizeNetworkQuality(),
	        targetWhitelist: summarizeTargetWhitelistStatus(),
		        combatLogging: summarizeCombatLoggingStatus(),
		        importantLogging: summarizeImportantLoggingStatus(),
		        exitAudit: {
		          pending: unresolvedExitAuditLogCount(),
		          pendingIds: pendingExitAuditLogIds().slice(0, 12),
		          restored: Number(this.exitAudit?.restored || 0),
		          lastEvent: this.exitAudit?.lastEvent || null,
		          lastBlockedReload: this.exitAudit?.lastBlockedReload || null,
		          lastBlockedLogin: this.exitAudit?.lastBlockedLogin || null
		        },
			        opportunityChoice: this.opportunityChoice,
			        opportunitySwitchLock: this.opportunitySwitchLock,
		        leave403SnapshotRecovery: this.leave403SnapshotRecovery,
		        clashLeaveRescue: {
		          enabled: Boolean(cfg.clashLeaveRescueEnabled),
		          running: Boolean(this.clashLeaveRescue?.running),
		          lastAt: Number(this.clashLeaveRescue?.lastAt || 0) || 0,
		          lastAgeMs: this.clashLeaveRescue?.lastAt ? Math.max(0, Math.round(Date.now() - Number(this.clashLeaveRescue.lastAt || Date.now()))) : null,
		          lastStage: this.clashLeaveRescue?.lastStage || '',
		          lastResult: this.clashLeaveRescue?.lastResult || null,
		          attempts: Array.isArray(this.clashLeaveRescue?.attempts) ? this.clashLeaveRescue.attempts.slice(-8) : []
		        },
		        sessionMismatchRecovery: summarizeSessionMismatchRecoveryStatus(),
		        loginSnapshotGate: snapshotLoginGateStatus(),
	        reloginGate: summarizeReloginGateStatus(),
	        postLoginZoom: this.postLoginZoom,
		        exitMotionStop: {
		          at: this.lastExitMotionStopAt || 0,
		          reason: this.lastExitMotionStopReason || '',
		          lockRemainingMs: exitMotionLockRemainingMs
		        },
		        self: displaySelf,
		        lastSelf: displaySelf,
	        session,
	        todaySession,
        safety: this.lastSafety,
        attackHistory: this.attackHistory.slice(-10),
        killHistory: this.killHistory.slice(-10),
        coinProgress: this.coinProgress,
        lastCoinCollected: this.lastCoinCollected,
        coinAttempts: Array.from(this.coinAttempts.values()).slice(-8).map(item => ({
          id: item.id,
          bestDistance: Math.round(item.bestDistance),
          lastDistance: Math.round(item.lastDistance),
          closeAgeMs: item.closeStartedAt ? Math.max(0, Math.round(now() - item.closeStartedAt)) : 0,
          lastSeenAgeMs: item.lastSeenAt ? Math.max(0, Math.round(now() - item.lastSeenAt)) : 0
        })),
        ignoredCoins: Array.from(this.ignoredCoins.entries()).map(([id, until]) => ({
          id,
          remainingMs: Math.max(0, Math.round(until - now()))
        })),
	        coinFailures: Array.from(this.coinFailures.entries()).slice(-8).map(([id, item]) => ({
	          id,
	          count: Number(item.count || 0),
	          reason: item.reason || '',
	          remainingMs: Math.max(0, Math.round(Number(item.ignoreUntil || 0) - now()))
	        })),
	        snapshotCoinWait: {
	          since: this.snapshotCoinWaitSince || 0,
	          ageMs: Math.max(0, Math.round(Number(this.lastSnapshotCoinWaitAgeMs || 0))),
	          maxMs: Math.max(0, Math.round(Number(cfg.snapshotCoinIdleMaxMs || 0))),
	          remainingMs: Math.max(0, Math.round(Number(cfg.snapshotCoinIdleMaxMs || 0) - Number(this.lastSnapshotCoinWaitAgeMs || 0)))
	        },
	        coinSources: this.lastCoinSourceSummary,
	        coinDiagnostics: this.coinDiagnostics,
	        targetSwitchDiagnostics: this.targetSwitchDiagnostics,
	        finalActionArbitration: this.finalActionArbitration,
			        globalState: {
			          refreshedAt: this.globalState.refreshedAt,
		          snapshotRefreshedAt: this.globalState.snapshotRefreshedAt,
		          snapshotAgeMs: this.globalState.snapshotRefreshedAt ? Date.now() - this.globalState.snapshotRefreshedAt : null,
		          tick: this.globalState.tick,
	          entities: arrayCount(this.globalState.entities),
	          bullets: arrayCount(this.globalState.bullets),
		          coinDrops: arrayCount(this.globalState.coinDrops),
		          minimapPoints: this.globalState.minimap?.points?.length || 0,
		          error: this.globalState.error,
		          samplingOutage: this.globalState.samplingOutage || null,
		          loginSnapshotGate: snapshotLoginGateStatus()
		        },
        control: summarizeControl(),
        serverPositionStall: summarizeServerPositionStall(),
        actionSettlementStall: summarizeActionSettlementStall(),
        login: {
          lastAt: this.lastLoginAt || 0,
          lastAgeMs: this.lastLoginAt ? Date.now() - this.lastLoginAt : null,
          lastResult: this.lastLoginResult
        },
        pendingExit: (() => {
        const pendingExitSummaryPending = this.pendingExit;
        if (!pendingExitSummaryPending) return null;
        const pendingExitSummaryNow = Date.now();
        const pendingExitSummaryReload = normalizePendingExitReloadConfirmationCore(pendingExitSummaryPending.reloadConfirmation, pendingExitSummaryPending, pendingExitSummaryNow);
        return summarizePendingExitForBotObjectCore(pendingExitSummaryPending, {
          nowMs: pendingExitSummaryNow,
          retryMs: pendingExitRetryMsForBotObjectCore(pendingExitSummaryPending, {
        leaveRetryMinMs: cfg.leaveRetryMinMs,
        leaveCommandTimeoutMs: cfg.leaveCommandTimeoutMs,
        offlineLeaveRetryMs: cfg.offlineLeaveRetryMs,
        combatLeaveRetryMs: cfg.combatLeaveRetryMs,
        pursuitLeaveRetryMs: cfg.pursuitLeaveRetryMs
      }),
          reloadConfirmation: pendingExitSummaryReload
        });
      })(),
        offlineLeave: {
          lastAt: this.lastOfflineLeaveAt || 0,
          lastAgeMs: this.lastOfflineLeaveAt ? Date.now() - this.lastOfflineLeaveAt : null,
          holdUntil: this.offlineReloginUntil || 0,
          holdRemainingMs: offlineLeaveDetail?.holdRemainingMs ?? Math.max(0, Math.round(Number(this.offlineReloginUntil || 0) - Date.now())),
          safety: this.lastOfflineSafety,
          summary: offlineLeaveDetail?.summary || '',
          displayReason: offlineLeaveDetail?.displayReason || '',
          lastWaitMs: this.lastOfflineLeaveWaitMs || offlineLeaveDetail?.reloginDelayMs || offlineLeaveDetail?.holdRemainingMs || 0,
          lastResult: this.lastOfflineLeaveResult
        },
        pursuit: summarizePursuit(this.pursuit),
	        pursuitLeave: {
	          lastAt: this.lastPursuitLeaveAt || 0,
	          lastAgeMs: this.lastPursuitLeaveAt ? Date.now() - this.lastPursuitLeaveAt : null,
		          holdUntil: this.pursuitReloginUntil || 0,
		          holdRemainingMs: enemyLeaveDetail?.holdRemainingMs ?? Math.max(0, Math.round(Number(this.pursuitReloginUntil || 0) - Date.now())),
		          lastResult: this.lastPursuitLeaveResult
		        },
			        enemyLeave: {
			          holdUntil: this.pursuitReloginUntil || 0,
			          holdRemainingMs: enemyLeaveDetail?.holdRemainingMs ?? Math.max(0, Math.round(Number(this.pursuitReloginUntil || 0) - Date.now())),
			          reason: enemyLeaveDetail?.reason || this.lastInjuryLeaveResult?.reason || this.lastPursuitLeaveResult?.reason || this.lastCombatLeaveResult?.reason || '',
	          summary: enemyLeaveDetail?.summary || latestEnemyLeaveSummary(),
	          displayReason: enemyLeaveDetail?.displayReason || latestEnemyLeaveDisplayReason(),
	          streak: readEnemyLeaveStreakBoundCore(localStorage, bot, cfg, Date.now(), { enemyLeaveStreakKey: ENEMY_LEAVE_STREAK_KEY }),
	          lastWaitMs: this.lastEnemyLeaveWaitMs || enemyLeaveDetail?.reloginDelayMs || enemyLeaveDetail?.holdRemainingMs || 0,
	          enemyActor: enemyLeaveDetail?.enemyActor || null,
	          reloginRepeatCount: enemyLeaveDetail?.reloginRepeatCount || enemyLeaveDetail?.enemyLeaveStreak?.count || 0,
			          lastInjuryResult: this.lastInjuryLeaveResult,
		          lastPursuitResult: this.lastPursuitLeaveResult,
		          lastCombatResult: this.lastCombatLeaveResult,
	          lastRetryResult: this.lastEnemyLeaveRetryResult
	        },
	        combatLeave: {
	          lastAt: this.lastCombatLeaveAt || 0,
	          lastAgeMs: this.lastCombatLeaveAt ? Date.now() - this.lastCombatLeaveAt : null,
	          lastResult: this.lastCombatLeaveResult,
	          pending: summarizePendingCombatLeave(this.pendingCombatLeave)
	        },
	        stopReason: this.stopReason,
	        errors: this.errors.slice(-5)
	      };
	    }
	  };

	  const hypot = Math.hypot;
  const now = () => performance.now();
  const dist = (a, b) => hypot(Number(a.x) - Number(b.x), Number(a.y) - Number(b.y));
  const speed = e => hypot(Number(e.vx) || 0, Number(e.vy) || 0);
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const isAlive = e => e && e.life !== 'Dead' && e.life !== 'WaitingRevive' && !e.waiting_revive;
  const dropValue = e => Number(e.death_reward_preview ?? e.death_drop_coins ?? e.drop ?? 0) || 0;
  const truthyFlag = value => value === true || value === 1 || value === '1' || value === 'true';
  const anyPositiveNumber = (...values) => values.some(value => Number(value) > 0);
  const isInvulnerable = e => anyPositiveNumber(
      e?.invulnerable_remaining_ticks,
      e?.invincible_remaining_ticks,
      e?.invulnerability_remaining_ticks,
      e?.invulnerableTicks,
      e?.invulnerableRemainingTicks,
      e?.invincibleRemainingTicks,
      e?.invulnerabilityRemainingTicks,
      e?.invulnerable_ticks,
      e?.invincible_ticks,
      e?.invulnerability_ticks,
      e?.invulnerable_remaining_ms,
      e?.invincible_remaining_ms,
      e?.invulnerability_remaining_ms,
      e?.invulnerableRemainingMs,
      e?.invincibleRemainingMs,
      e?.invulnerabilityRemainingMs,
      e?.invulnerable_ms,
      e?.invincible_ms,
      e?.invulnerability_ms,
      e?.immune_remaining_ms,
      e?.immuneRemainingMs,
      e?.invulnerable_remaining,
      e?.invincible_remaining,
      e?.invulnerability_remaining,
      e?.invulnerableRemaining,
      e?.invincibleRemaining,
      e?.invulnerabilityRemaining
    )
    || truthyFlag(e?.invulnerable)
    || truthyFlag(e?.is_invulnerable)
    || truthyFlag(e?.isInvulnerable)
    || truthyFlag(e?.immune)
    || truthyFlag(e?.is_immune);
  const isJoinModeActive = e => e?.current_join_mode === 'Active' || e?.mode === 'Active';
  const isInvulnerableActive = e => isJoinModeActive(e) && isInvulnerable(e);
  const staminaRemaining = (e, windowName) => {
    const value = Number(e?.['stamina_' + windowName + '_remaining_milli'] ?? NaN);
    return Number.isFinite(value) ? value : null;
  };
  const staminaLimitValue = (e, windowName, fallback) => {
    const value = Number(e?.['stamina_' + windowName + '_limit_milli'] ?? fallback);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };
  const staminaExhaustedThreshold = () => Math.max(0, Number(cfg.staminaExhaustedThresholdMs ?? 1000));
  const isStaminaWindowExhausted = (e, windowName) => {
    const value = staminaRemaining(e, windowName);
    return value !== null && value < staminaExhaustedThreshold();
  };
  const combatMovementBlockedByStamina = self => isStaminaWindowExhausted(self, '5s');
  const hasLongWindowStamina = e => !isStaminaWindowExhausted(e, '1h') && !isStaminaWindowExhausted(e, '1d');
  const hasMoveStamina = e => Number(e?.stamina_5s_remaining_milli || 0) > 250 && hasLongWindowStamina(e);
  const hasAttackStamina = e => Number(e?.stamina_5s_remaining_milli || 0) >= cfg.attackMinStamina && hasLongWindowStamina(e);
  const staminaLimit = e => Number(e?.stamina_5s_limit_milli || 10000);
  const hasFullStamina = e => {
    const limit = staminaLimit(e);
    const stamina = Number(e?.stamina_5s_remaining_milli ?? NaN);
    return Number.isFinite(stamina) && limit > 0 && stamina >= limit * cfg.staminaFullRatio;
  };
  const isFiringEntity = e => truthyFlag(e?.shooting)
    || truthyFlag(e?.is_shooting)
    || truthyFlag(e?.isShooting)
    || truthyFlag(e?.firing)
    || truthyFlag(e?.is_firing)
    || truthyFlag(e?.attacking)
    || truthyFlag(e?.is_attacking);
  const isMovingThreat = e => speed(e) >= cfg.activeSpeedMin || Boolean(e.recentlyMoved);
  const isCurrentlyActive = e => isMovingThreat(e) || isFiringEntity(e) || (isJoinModeActive(e) && (!hasFullStamina(e) || isInvulnerableActive(e)));
  const hasCombatActivitySignal = e => isCurrentlyActive(e)
    || truthyFlag(e?.active)
    || truthyFlag(e?.currentlyActive)
    || truthyFlag(e?.combat)
    || truthyFlag(e?.engagedCombat)
    || String(e?.combatIntent || '') === 'engaged';
  function entityRecentActivityAgeMs(e) {
    const value = Number(e?.recentActivityAgeMs ?? e?.activityAgeMs ?? e?.motionAgeMs ?? NaN);
    return Number.isFinite(value) && value >= 0 ? value : null;
  }
  function recentlyActionedForAfk(e) {
    const cooldownMs = Math.max(0, Number(cfg.afkRecentActivityCooldownMs || 0) || 0);
    if (!(cooldownMs > 0)) return false;
    const ageMs = entityRecentActivityAgeMs(e);
    return Boolean(e?.recentlyActive || (ageMs !== null && ageMs <= cooldownMs));
  }
  function isIdleInvulnerableTarget(e) {
    return Boolean(isInvulnerable(e)
      && !isMovingThreat(e)
      && !isFiringEntity(e)
      && hasFullStamina(e)
      && !recentlyActionedForAfk(e));
  }
  const isAvoidanceThreat = e => isInvulnerable(e) && !isIdleInvulnerableTarget(e);
  const isAfkTarget = e => !recentlyActionedForAfk(e) && !isJoinModeActive(e) && !isCurrentlyActive(e) && !isMovingThreat(e);
  const isAfkProfitTarget = e => !recentlyActionedForAfk(e) && (isAfkTarget(e) || (isJoinModeActive(e) && !isCurrentlyActive(e) && !isMovingThreat(e) && !isFiringEntity(e)));


  const { createTargetWhitelistRuntime } = require('./runtime/target-whitelist');
  const {
    isWhitelistedTarget,
    summarizeTargetWhitelistStatus,
    refreshTargetWhitelist,
    startTargetWhitelistPolling
  } = createTargetWhitelistRuntime({
    bot,
    cfg,
    targetWhitelistState,
    fetchJsonNoStore: (...args) => fetchJsonNoStore(...args),
    recordUnhandledTickError: (...args) => recordUnhandledTickError(...args),
    locationHref: () => location.href,
    now: Date.now,
    setInterval
  });


  const hpValue = e => Number(e?.hp ?? 0) || 0;
  const combatHpValue = e => Number.isFinite(Number(e?.hp)) ? Number(e.hp) : 100;
  const knownHpValue = e => {
    if (e && Object.prototype.hasOwnProperty.call(e, 'knownHp')) {
      return Number.isFinite(Number(e.knownHp)) ? Number(e.knownHp) : null;
    }
    return e?.hp !== undefined && e?.hp !== null && Number.isFinite(Number(e.hp)) ? Number(e.hp) : null;
  };
  const maxHpValue = e => Number(e?.max_hp ?? e?.maxHp ?? 0) || 0;
  const isFullHp = self => {
    const hp = hpValue(self);
    const maxHp = maxHpValue(self);
    if (maxHp > 0) return hp >= maxHp;
    return hp >= 100;
  };
  const decorateActiveThreat = (self, e) => {
    const moving = isMovingThreat(e);
    return {
      ...e,
      distance: dist(self, e),
      drop: dropValue(e),
      speed: speed(e),
      moving,
      threatRadius: moving ? cfg.dangerRadius : cfg.stationaryActiveDangerRadius,
      cautionRadius: moving ? cfg.activeCautionRadius : cfg.stationaryActiveCautionRadius,
      coinDangerRadius: moving ? cfg.coinDangerRadius : cfg.stationaryActiveCoinDangerRadius
    };
  };
  const isRecovering = self => {
    if (!self) return false;
    const maxHp = maxHpValue(self);
    if (maxHp > 0) return hpValue(self) < maxHp;
    return hpValue(self) < cfg.recoverHpThreshold;
  };
  const isConservingStamina = self => {
    const stamina = Number(self?.stamina_5s_remaining_milli ?? cfg.conserveStaminaThreshold);
    return stamina < cfg.conserveStaminaThreshold;
  };
  const { createStaminaStatusRuntime } = require('./runtime/stamina-status');
  const {
    summarizeStamina,
    dailyStaminaWindowStartAt,
    nextDailyStaminaResetAt,
    staminaBudgetReloginDelayMs,
    staminaResetHoldUntil,
    longStaminaHoldContradictedByKnownStamina,
    startupStaminaSampleLooksUnsettled,
    deferredStaminaExhaustionLeave,
    staleOfflineStaminaHoldContradicted
  } = createStaminaStatusRuntime({
    bot,
    cfg,
    staminaRemaining,
    staminaLimitValue,
    staminaExhaustedThreshold,
    staminaExhaustedLongWindows,
    staminaHoldContradictedByStaminaEvidence
  });

const { attackWorthTakingCore } = require('./runtime/attack-worth');

const {
    exitMotionStopLockRemainingMsCore,
    postExitDecisionWithoutTargetCore
  } = require('./runtime/exit-motion');

  function exitMotionStopLockRemainingMs(t = Date.now()) {
    return exitMotionStopLockRemainingMsCore(bot.lastExitMotionStopAt, cfg.exitMotionStopLockMs, t);
  }

  function clearPostExitTargetState(reason = 'exit-confirmed') {
    bot.lastTarget = null;
    bot.lastTargetAt = 0;
    bot.opportunityChoice = null;
    resetOpportunitySwitchLock();
    bot.staleCoinEscape = null;
    bot.coinApproachLock = null;
    removeTargetOverlay();
    if (bot.lastDecision && typeof bot.lastDecision === 'object') {
      bot.lastDecision = postExitDecisionWithoutTargetCore(bot.lastDecision, reason, {
        lastExitMotionStopReason: bot.lastExitMotionStopReason,
        exitMotionLockRemainingMs
      });
      try {
        updateBotPanel(bot.lastDecision);
      } catch (_) {}
    }
  }


  const { createTargetOverlayRuntime } = require('./runtime/target-overlay');
  const {
    removeTargetOverlay,
    renderTargetOverlay
  } = createTargetOverlayRuntime({
    bot,
    cfg,
    targetOverlayId: TARGET_OVERLAY_ID,
    loginPointSafetyKey: LOGIN_POINT_SAFETY_KEY,
    storage: localStorage,
    exitMotionStopLockRemainingMs,
    getNativeState: () => getNativeState(),
    getSelf: () => getSelf(),
    getCurrentUserId: () => getCurrentUserId(),
    getNativeCoinList: () => getNativeCoinList(),
    normalizeCoinDrop: (...args) => normalizeCoinDrop(...args),
    getNativeEntityList: () => getNativeEntityList(),
    getEntities: () => getEntities(),
    firstFiniteNumber: (...args) => firstFiniteNumber(...args),
    dist,
    isAlive,
    loginPointSafetyStatus: () => loginPointSafetyStatus()
  });


const { escapeHtml, formatDistance, formatDurationMs, actorLabel, hpDisplay } = require('./runtime/display-format');


	  function activeEnemyLeaveDetail(t = Date.now()) {
	    const current = latestEnemyLeaveResult();
	    const restored = readPersistentExitState(ENEMY_LEAVE_STATE_KEY, t);
	    const picked = current || restored || bot.lastEnemyLeaveResult || null;
	    if (!picked) return null;
	    const refreshed = refreshExitDetail(picked, t);
	    if (!refreshed?.holdRemainingMs && Number(refreshed?.reloginUntil || 0)) {
	      clearPersistentExitState(ENEMY_LEAVE_STATE_KEY);
	      if (bot.lastEnemyLeaveResult === picked) bot.lastEnemyLeaveResult = null;
	      return null;
	    }
	    bot.lastEnemyLeaveResult = refreshed;
	    if (Number(refreshed?.reloginUntil || 0) > 0) bot.pursuitReloginUntil = Math.max(Number(bot.pursuitReloginUntil || 0), Number(refreshed.reloginUntil));
	    return refreshed;
	  }

	  function activeOfflineLeaveDetail(t = Date.now()) {
	    const picked = bot.lastOfflineLeaveResult || readPersistentExitState(OFFLINE_LEAVE_STATE_KEY, t);
	    if (!picked) return null;
	    const refreshed = refreshExitDetail(picked, t);
	    if (!refreshed?.holdRemainingMs && Number(refreshed?.reloginUntil || 0)) {
	      clearPersistentExitState(OFFLINE_LEAVE_STATE_KEY);
	      if (bot.lastOfflineLeaveResult === picked) bot.lastOfflineLeaveResult = null;
	      return null;
	    }
	    bot.lastOfflineLeaveResult = refreshed;
	    if (Number(refreshed?.reloginUntil || 0) > 0) bot.offlineReloginUntil = Math.max(Number(bot.offlineReloginUntil || 0), Number(refreshed.reloginUntil));
	    return refreshed;
	  }

	  function latestEnemyLeaveResult() {
	    const candidates = [
	      { at: Number(bot.lastEnemyLeaveResult?.at || 0), result: bot.lastEnemyLeaveResult },
	      { at: Number(bot.lastCombatLeaveResult?.at || bot.lastCombatLeaveAt || 0), result: bot.lastCombatLeaveResult },
	      { at: Number(bot.lastPursuitLeaveResult?.at || bot.lastPursuitLeaveAt || 0), result: bot.lastPursuitLeaveResult },
	      { at: Number(bot.lastInjuryLeaveResult?.at || bot.lastInjuryLeaveAt || 0), result: bot.lastInjuryLeaveResult }
    ].filter(item => item.result);
    return candidates.sort((a, b) => b.at - a.at)[0]?.result || null;
  }

  function latestEnemyLeaveSummary() {
    const result = latestEnemyLeaveResult();
    return result?.summary || result?.exitSummary || result?.enemyLeaveSummary || result?.displayReason || '';
  }

  function latestEnemyLeaveDisplayReason() {
    const result = latestEnemyLeaveResult();
    return result?.displayReason || result?.summary || result?.exitSummary || result?.enemyLeaveSummary || '';
  }

  const { createStatusPanelRuntime } = require('./runtime/status-panel');
  const {
    removeBotPanel,
    updateBotPanel
  } = createStatusPanelRuntime({
    bot,
    cfg,
    panelId: PANEL_ID,
    renderTargetOverlay,
    dropValue,
    summarizeControl: () => summarizeControl(),
    summarizePursuit: (...args) => summarizePursuit(...args)
  });

			  function logStatus(text, detail) {
			    bot.lastAction = text;
			    if (detail) bot.lastDecision = detail;
			    if (bot.running) updateBotPanel(bot.lastDecision || detail || { kind: 'wait', reason: text, self: bot.lastSelf });
			    if (typeof log === 'function') log('[bot] ' + text, 'info');
			    console.log('[grasp-rat-bot]', text, detail || '');
			  }




      const { safeStringify, safeJsonClone, sanitizeCombatLogIdPart } = require('./runtime/runtime-utils');
      const { arrayCount } = require('./runtime/array-count');

  let rememberCombatEngagement;
  let clearCombatEngagement;
  let summarizeOfflineThreat;
  let assessOfflineSafety;
  let pickActiveCombatWaitThreat;
  let activeCombatThreatWaitAction;
  let recentCombatInjuryActive;
  let lowValueActiveDropMax;
  let isLowValueActiveCombatTarget;
  let proactiveActiveKillStaminaBudgetMs;
  let proactiveActiveCombatStaminaAffordable;
  let activeCombatBudgetBlocked;
  let activeCombatRequiresThreatEvidence;
  let incomingOwnerMatchesTarget;
  let activeCombatThreatensSelf;
  let lowValueActiveThreatensSelf;
  let combatDodgeThreatRange;
  let combatTargetPriority;
  let isDefensiveCombatTarget;
  let isProfitableCombatTarget;
  let combatHpGapDisadvantaged;
  let profitCombatDisadvantaged;
  let pickCombatTarget;
  let combatEngageGraceRange;
  let combatTargetCandidateRange;
  let combatDodgeOnlyCandidateRange;
  let combatEngagedCandidate;
  let pickEngagedCombatTarget;
  let defensiveTargetOverridesEngaged;
  let incomingBulletRequiresTargetSwitch;
  let pickOpportunisticShotTarget;
  let actionOpportunityScore;
  let opportunisticShotBeatsAction;
  let attachOpportunisticShot;
  let buildOpportunisticShotWait;
  let combatMoveVelocityForDirection;
  let combatBulletThreats;
  let incomingBulletThreat;
  let combatThreatFieldCandidate;
  let combatBulletThreatField;
  let combatStrafeHoldMs;
  let combatStrafeKey;
  let combatStrafeMatchesTarget;
  let combatPreciseStrafeSign;
  let selectCombatStrafeSign;
  let tangentMoveForBullet;
  let combatMoveClosesDistance;
  let combatSafeCloseMoveOverride;
  let combatSpacingVector;
  let combatSpacingShouldOverrideBullet;
  let combatLowHpCloseRiskState;
  let combatPressureDisadvantageState;
  let combatSustainedPressureDisadvantageState;
  let combatPressureCloseVector;
  let combatFarNoDamageCloseVector;
  let combatRetreatingFighterCloseVector;
  let combatFinishPressureState;
  let combatOutOfRangeFinishPressureState;
  let combatOutOfRangeReengageState;
  let combatPassiveRunnerState;
  let combatPassiveRunnerCloseVector;
  let mergeCombatMove;
  let combatPressureThreat;
  let combatOutOfRangeDodgeAction;
  let combatAimJitterLimit;
  let combatAimMotionScale;
  let combatMotionSample;
  let combatMotionSamplesWithCurrent;
  let combatOpponentProfile;
  let combatTradeEstimate;
  let combatTargetId;
  let combatRetreatIgnoreActive;
  let rememberCombatRetreatIgnore;
  let clearCombatDisadvantageObservation;
  let combatDisadvantageObservationState;
  let combatAimDamageState;
  let combatLowHpNoDamageLeaveState;
  let combatRetreatingTargetState;
  let combatServerStallNoDamageLeaveState;
  let combatTrendState;
  let combatTickActiveFromState;
  let globalSamplingOutageOfflineState;
  let combatTickGapOfflineState;
  let nativeTickMinIntervalMs;
  let combatShootingPlan;
  let combatAimNoDamageLevel;
  let combatAimNoDamageJitterLimit;
  let combatAimSteadyNoDamageState;
  let combatAimFallbackPrecisionState;
  let combatMovementAimMode;
  let combatInterceptSolution;
  let combatLiveAimTarget;
  let combatAimSourceDivergenceState;
  let combatAimServerStallState;
  let combatAimDynamicStrategyState;
  let combatAimTarget;
  let combatLeaveCoverAction;
  let buildCombatAction;


  let readImportantLogsStore;
  let restoreImportantLogsForRemote;
  let markImportantLogsRemoteSent;
  let markImportantLogsRemoteError;
  let noteImportantSessionExit;
  let startImportantSession;
  let upsertImportantSessionRecord;
  let importantSessionStaminaSpentMs;
  let recordImportantCombatTick;
  let summarizeImportantLoggingStatus;
  let rememberAttack;
  let recordKillHistoryItem;
  let updateKillHistory;

  const { createCombatLogRuntime } = require('./runtime/combat-log-runtime');
  const {
    configureCombatLogging,
    summarizeCombatLoggingStatus,
    pendingExitAuditLogIds,
    unresolvedExitAuditLogCount,
    exitAuditFlushPending,
    exitAuditFlushBlockDetail,
    importantSessionEndFlushPending,
    importantSessionEndFlushBlockDetail,
    closeCurrentImportantSessionBeforeLogin,
    closeCurrentImportantSessionBeforeReload,
    restorePersistedExitAuditLogs,
    restorePersistedCombatLogPendingEntries,
    persistCombatLogPendingEntries,
    newExitAuditRequestId,
    ensureExitAuditDetail,
    recordExitAuditEvent,
    combatLogSuspendReason,
    combatLogIsAfkAttack,
    queueCombatLogEntry,
    flushCombatLogs,
    recordCombatLogTick
  } = createCombatLogRuntime({
    bot,
    cfg,
    storage: localStorage,
    combatLogPendingEntriesKey: COMBAT_LOG_PENDING_ENTRIES_KEY,
    exitAuditPendingLogsKey: EXIT_AUDIT_PENDING_LOGS_KEY,
    loginSuppressKey: LOGIN_SUPPRESS_KEY,
    loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY,
    enemyLeaveStateKey: ENEMY_LEAVE_STATE_KEY,
    offlineLeaveStateKey: OFFLINE_LEAVE_STATE_KEY,
    pendingExitStateKey: PENDING_EXIT_STATE_KEY,
    now,
    readPersistentExitState,
    writePersistentPendingExitStateCore,
    pendingExitPersistenceCoreHelpers,
    clearPersistentPendingExitState,
    clearPersistentExitState,
    normalizePendingExitReloadConfirmationCore,
    staleOfflineStaminaHoldContradicted: (...args) => staleOfflineStaminaHoldContradicted(...args),
    readImportantLogsStore: (...args) => readImportantLogsStore(...args),
    restoreImportantLogsForRemote: (...args) => restoreImportantLogsForRemote(...args),
    markImportantLogsRemoteSent: (...args) => markImportantLogsRemoteSent(...args),
    markImportantLogsRemoteError: (...args) => markImportantLogsRemoteError(...args),
    noteImportantSessionExit: (...args) => noteImportantSessionExit(...args),
    getCurrentUserId: () => getCurrentUserId(),
    summarizeSelf: (...args) => summarizeSelf(...args),
    dropValue,
    dist,
    speed,
    hypot,
    knownHpValue,
    isCurrentlyActive,
    isMovingThreat,
    isFiringEntity,
    isInvulnerable,
    getNativeEntityList: () => getNativeEntityList(),
    normalizeBullet: (...args) => normalizeBullet(...args),
    getBullets: () => getBullets(),
    summarizeServerPositionStall: (...args) => summarizeServerPositionStall(...args),
    combatTickActiveFromState: (...args) => combatTickActiveFromState(...args),
    summarizeNetworkQuality: (...args) => summarizeNetworkQuality(...args),
    getSelf: () => getSelf(),
    incomingBulletThreat: (...args) => incomingBulletThreat(...args),
    summarizePendingCombatLeave: (...args) => summarizePendingCombatLeave(...args),
    summarizePursuit: (...args) => summarizePursuit(...args),
    summarizeControl: (...args) => summarizeControl(...args),
    snapshotLoginGateStatus: (...args) => snapshotLoginGateStatus(...args),
    recordRuntimeDiagnostics: detail => recordRuntimeDiagnosticsCore(bot, detail)
  });
  const { createTickSafetyRuntime } = require('./runtime/tick-safety');
  const {
    recordUnhandledTickError,
    runTickSafely,
    runCallbackSafely
  } = createTickSafetyRuntime({
    bot,
    now,
    tick: (...args) => tick(...args),
    recordRuntimeDiagnostics: detail => recordRuntimeDiagnosticsCore(bot, detail)
  });
  let requestReload;
  let requestLeaveConfirmationReload;
  let requestSessionMismatchRecoveryReload;
  let cloudflareErrorInfo;
  let maybeReloadCloudflareError;
  let getCurrentUserId;
  let getSessionToken;
  let hasNativeGameSession;
  let controlHasNativeGameSession;
  let snapshotSelfPresenceState;
  let controlHasAuthoritativeSessionMismatch;
  let noSelfGameSessionExitState;
  let summarizeSessionMismatchRecoveryStatus;
  let liveSessionMismatchTakeoverState;
  let noteSelfUnavailableForPostLoginZoom;
  let schedulePostLoginZoomOut;
  let findLoginControl;
  let hasLoginRequiredText;
  let setLoginSuppress;
  let loginSuppressRemainingMs;
  let loginSuppressStatus;
  let loginPointSafetyExitSelfForDetail;
  let loginPointSafetyStatus;
  let resetLoginSnapshotGate;
  let noteLoginSnapshotProbe;
  let loginSnapshotGateAllowsLogin;
  let loginSnapshotGateBlockReason;
  let ensureLoginSnapshotGate;
  let loginSnapshotGateDisplayReason;
  let markManualLoginBypass;
  let manualLoginBypassActive;
  let installNativeLoginGateInterceptors;
  let summarizeReloginGateStatus;
  let clearCurrentReloginHold;
  let randomBetween;
  let hpInfoForRelogin;
  let summarizePursuit;
  let pendingExitSkipNewLeave;
  let pendingExitIntentForSkippedLeave;
  let rememberPendingExit;
  let noteLeave403SnapshotProbe;
  let handlePendingExit;
  let summarizePendingCombatLeave;
  let pendingCombatLeaveAction;
  let isCombatStateForInjuryLeave;
  let updatePursuitTracking;
  let issueLeaveCommand;
  let maybeStartAutoLogin;
  let forceLoginNow;
  let leaveOffline;
  let leaveForInjury;
  let leaveForPursuit;
  let leaveForCombat;
  let leaveDuringEnemyHold;

  const { createControlFlowRuntime } = require('./runtime/control-flow-runtime');
  ({
    requestReload,
    requestLeaveConfirmationReload,
    requestSessionMismatchRecoveryReload,
    cloudflareErrorInfo,
    maybeReloadCloudflareError,
    getCurrentUserId,
    getSessionToken,
    hasNativeGameSession,
    controlHasNativeGameSession,
    snapshotSelfPresenceState,
    controlHasAuthoritativeSessionMismatch,
    noSelfGameSessionExitState,
    summarizeSessionMismatchRecoveryStatus,
    liveSessionMismatchTakeoverState,
    noteSelfUnavailableForPostLoginZoom,
    schedulePostLoginZoomOut,
    findLoginControl,
    hasLoginRequiredText,
    setLoginSuppress,
    loginSuppressRemainingMs,
    loginSuppressStatus,
    loginPointSafetyExitSelfForDetail,
    loginPointSafetyStatus,
    resetLoginSnapshotGate,
    noteLoginSnapshotProbe,
    loginSnapshotGateAllowsLogin,
    loginSnapshotGateBlockReason,
    ensureLoginSnapshotGate,
    loginSnapshotGateDisplayReason,
    markManualLoginBypass,
    manualLoginBypassActive,
    installNativeLoginGateInterceptors,
    summarizeReloginGateStatus,
    clearCurrentReloginHold,
    randomBetween,
    hpInfoForRelogin,
    summarizePursuit,
    pendingExitSkipNewLeave,
    pendingExitIntentForSkippedLeave,
    rememberPendingExit,
    noteLeave403SnapshotProbe,
    handlePendingExit,
    summarizePendingCombatLeave,
    pendingCombatLeaveAction,
    isCombatStateForInjuryLeave,
    updatePursuitTracking,
    issueLeaveCommand,
    maybeStartAutoLogin,
    forceLoginNow,
    leaveOffline,
    leaveForInjury,
    leaveForPursuit,
    leaveForCombat,
    leaveDuringEnemyHold
  } = createControlFlowRuntime({
    bot,
    cfg,
    storage: localStorage,
    pageGlobal,
    botKey: BOT_KEY,
    pendingExitStateKey: PENDING_EXIT_STATE_KEY,
    sessionMismatchRecoveryKey: SESSION_MISMATCH_RECOVERY_KEY,
    cloudflareReloadKey: CLOUDFLARE_RELOAD_KEY,
    loginSuppressKey: LOGIN_SUPPRESS_KEY,
    loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY,
    loginPointSafetyKey: LOGIN_POINT_SAFETY_KEY,
    enemyLeaveStateKey: ENEMY_LEAVE_STATE_KEY,
    offlineLeaveStateKey: OFFLINE_LEAVE_STATE_KEY,
    enemyLeaveStreakKey: ENEMY_LEAVE_STREAK_KEY,
    readPageGlobal,
    installPageGlobal,
    normalizePendingExitReloadConfirmationCore,
    writePersistentPendingExitStateCore,
    pendingExitPersistenceCoreHelpers,
    clearPersistentPendingExitState,
    clearPersistentExitState,
    readPersistentExitState,
    writePersistentExitState,
    normalizeLoginSnapshotGateStateCore,
    loginSnapshotSuccessRequiredCore,
    recordRuntimeDiagnostics: detail => recordRuntimeDiagnosticsCore(bot, detail),
    exitAuditFlushPending,
    exitAuditFlushBlockDetail,
    importantSessionEndFlushPending,
    importantSessionEndFlushBlockDetail,
    closeCurrentImportantSessionBeforeReload,
    closeCurrentImportantSessionBeforeLogin,
    persistCombatLogPendingEntries,
    flushCombatLogs,
    ensureExitAuditDetail,
    recordExitAuditEvent,
    noteImportantSessionExit,
    logStatus,
    updateBotPanel,
    removeTargetOverlay,
    stopMotionSafely: (...args) => stopMotionSafely(...args),
    stopMotionAfterExit,
    clearCombatEngagement: (...args) => clearCombatEngagement(...args),
    sendActionVelocity: (...args) => sendActionVelocity(...args),
    shootAt: (...args) => shootAt(...args),
    triggerNativeTick: (...args) => triggerNativeTick(...args),
    recordUnhandledTickError,
    activeEnemyLeaveDetail: (...args) => activeEnemyLeaveDetail(...args),
    activeOfflineLeaveDetail: (...args) => activeOfflineLeaveDetail(...args),
    exitMotionStopLockRemainingMs: (...args) => exitMotionStopLockRemainingMs(...args),
    unsafeExitReloginMinDelayMs: (...args) => unsafeExitReloginMinDelayMs(...args),
    getNativeControl: (...args) => getNativeControl(...args),
    getNativeState: (...args) => getNativeState(...args),
    getOwnEntity: (...args) => getOwnEntity(...args),
    getSelf: (...args) => getSelf(...args),
    summarizeSelf: (...args) => summarizeSelf(...args),
    summarizeControl: (...args) => summarizeControl(...args),
    snapshotDataAgeMs: (...args) => snapshotDataAgeMs(...args),
    snapshotSelfFreshEnough: (...args) => snapshotSelfFreshEnough(...args),
    isOfflineishWsReadyState: (...args) => isOfflineishWsReadyState(...args),
    isAlive,
    isInvulnerable,
    isJoinModeActive,
    isFiringEntity,
    isMovingThreat,
    truthyFlag,
    staminaRemaining,
    staminaLimitValue,
    dropValue,
    clamp,
    dist,
    speed,
    now,
    isFullHp,
    threatKey: (...args) => threatKey(...args),
    returnBlockRadius: (...args) => returnBlockRadius(...args),
    staleOfflineStaminaHoldContradicted: (...args) => staleOfflineStaminaHoldContradicted(...args),
    staminaBudgetReloginDelayMs,
    staminaResetHoldUntil,
    staminaBudgetCoinLeaveSummary: (...args) => staminaBudgetCoinLeaveSummary(...args),
    staminaExhaustedWindowLabel: (...args) => staminaExhaustedWindowLabel(...args),
    reloginDelayForHpCore
  }));




























































































































































































































  function readPauseReason() {
    let reason = '';
    try {
      reason = String(localStorage.getItem(PAUSE_REASON_KEY) || '');
    } catch (_) {}
    return String(readPageGlobal('__graspRatBotPauseReason', '', pageGlobal) || reason || '');
  }

  function syncPausedFromPage(stopOnPause = true) {
    let localPaused = false;
    try {
      localPaused = localStorage.getItem(PAUSED_KEY) === 'true';
    } catch (_) {}
    const paused = Boolean(readPageGlobal('__graspRatBotPaused', false, pageGlobal) === true || localPaused);
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









  let pageNativeSnapshotUrl;
  let pageNativeSnapshotPayload;
  let pageNativeSnapshotError;
  let installPageNativeSnapshotObserver;
  let getNativeState;
  let getNativeControl;
  let wsConstant;
  let isOfflineishWsReadyState;
  let noteNativeReconnectState;
  let detachNativeMessagePump;
  let triggerNativeTick;
  let ensureNativeMessagePump;
  let notePageOwnsReconnect;
  let syncNativeControl;
  let summarizeControl;
  let closeControlWs;
  let ensureControlWs;
  let getSelf;
  let getEntities;
  let realtimeEntityWorldPoint;
  let realtimeEntityKey;
  let normalizeRealtimeEntity;
  let mergeRealtimeEntity;
  let getNativeEntityList;
  let listFromNativeCoinValue;
  let addNativeCoinSource;
  let getNativeCoinSources;
  let getNativeCoinList;
  let entityIdKey;
  let buildNativeEntityMeta;
  let snapshotDataAgeMs;
  let snapshotDataFreshEnough;
  let snapshotBulletFreshEnough;
  let snapshotSelfFreshEnough;
  let entityFreshEnoughForOffense;
  let snapshotEntityAllowed;
  let firstFiniteNumber;
  let normalizeCoinDrop;
  let coinDropKey;
  let nativeViewRadiusCm;
  let snapshotCoinLocalSuppressRadius;
  let snapshotCoinAllowed;
  let isSnapshotOnlyCoin;
  let snapshotCoinFreshEnough;
  let getCoins;
  let normalizeBullet;
  let getBullets;
  let fetchJsonNoStore;
  let summarizeSelf;
  let entityPoint;
  let pointDistance;
  let getSnapshotSelf;
  let currentVelocityCommandActive;
  let summarizeServerPositionStall;
  let resetServerPositionStall;
  let summarizeActionSettlementStall;
  let resetActionSettlementStall;
  let actionSettlementNumber;
  let actionSettlementEntityHp;
  let actionSettlementTarget;
  let actionSettlementSample;
  let actionSettlementStableNumber;
  let actionSettlementSelfProgress;
  let actionSettlementTargetProgress;
  let assessActionSettlementStall;
  let assessServerPositionStall;
  let resetSessionStaminaStats;
  let updateSessionStaminaStats;
  let updateSessionStats;
  let summarizeSessionStats;
  let readTodaySessionRecords;
  let maybeSetLatestTodayStamina;
  let dailyStaminaSpentFromRemaining;
  let addTodaySessionRecord;
  let summarizeTodaySessionStats;
  let pushBounded;
  let networkQualityRound;
  let networkQualityEma;
  let ensureNetworkQualityState;
  let networkQualityPoint;
  let networkQualityDistance;
  let networkQualityWindowMs;
  let networkQualityBaseFrameMs;
  let networkQualityExpectedFrameMs;
  let pruneNetworkQualityFrameSamples;
  let networkQualityFrameLatencySample;
  let estimateNetworkQualityLostFrames;
  let observeNativeWsFrame;
  let recordNetworkQualityMovementCommand;
  let observeNetworkQualitySelf;
  let networkQualityTargetId;
  let recordNetworkQualityShot;
  let recordNetworkQualityAttackDamage;
  let summarizeNetworkQuality;
  let refreshGlobalState;
  let wsSend;
  let setNativeKeys;
  let cancelVelocityStopTimer;
  let clearNativeMotionState;
  let stopLocalMotionOnly;
  let stopMotionSafely;
  let stopMotionAfterExit;
  let cancelDirectVelocityRepeat;
  let directWsVelocityMessage;
  let sendDirectNativeVelocity;
  let scheduleDirectVelocityRepeat;
  let sendNativeVelocity;
  let safeSendVelocity;
  let sendActionVelocity;
  let aimAt;
  let sendNativeShoot;
  let recordCombatShotAttempt;
  let shootAt;

  const { createNativeStateRuntime } = require('./runtime/native-state-runtime');
  ({
    pageNativeSnapshotUrl,
    pageNativeSnapshotPayload,
    pageNativeSnapshotError,
    installPageNativeSnapshotObserver,
    getNativeState,
    getNativeControl,
    wsConstant,
    isOfflineishWsReadyState,
    noteNativeReconnectState,
    detachNativeMessagePump,
    triggerNativeTick,
    ensureNativeMessagePump,
    notePageOwnsReconnect,
    syncNativeControl,
    summarizeControl,
    closeControlWs,
    ensureControlWs,
    getSelf,
    getEntities,
    realtimeEntityWorldPoint,
    realtimeEntityKey,
    normalizeRealtimeEntity,
    mergeRealtimeEntity,
    getNativeEntityList,
    listFromNativeCoinValue,
    addNativeCoinSource,
    getNativeCoinSources,
    getNativeCoinList,
    entityIdKey,
    buildNativeEntityMeta,
    snapshotDataAgeMs,
    snapshotDataFreshEnough,
    snapshotBulletFreshEnough,
    snapshotSelfFreshEnough,
    entityFreshEnoughForOffense,
    snapshotEntityAllowed,
    firstFiniteNumber,
    normalizeCoinDrop,
    coinDropKey,
    nativeViewRadiusCm,
    snapshotCoinLocalSuppressRadius,
    snapshotCoinAllowed,
    isSnapshotOnlyCoin,
    snapshotCoinFreshEnough,
    getCoins,
    normalizeBullet,
    getBullets,
    fetchJsonNoStore,
    summarizeSelf,
    entityPoint,
    pointDistance,
    getSnapshotSelf,
    currentVelocityCommandActive,
    summarizeServerPositionStall,
    resetServerPositionStall,
    summarizeActionSettlementStall,
    resetActionSettlementStall,
    actionSettlementNumber,
    actionSettlementEntityHp,
    actionSettlementTarget,
    actionSettlementSample,
    actionSettlementStableNumber,
    actionSettlementSelfProgress,
    actionSettlementTargetProgress,
    assessActionSettlementStall,
    assessServerPositionStall,
    resetSessionStaminaStats,
    updateSessionStaminaStats,
    updateSessionStats,
    summarizeSessionStats,
    readTodaySessionRecords,
    maybeSetLatestTodayStamina,
    dailyStaminaSpentFromRemaining,
    addTodaySessionRecord,
    summarizeTodaySessionStats,
    pushBounded,
    networkQualityRound,
    networkQualityEma,
    ensureNetworkQualityState,
    networkQualityPoint,
    networkQualityDistance,
    networkQualityWindowMs,
    networkQualityBaseFrameMs,
    networkQualityExpectedFrameMs,
    pruneNetworkQualityFrameSamples,
    networkQualityFrameLatencySample,
    estimateNetworkQualityLostFrames,
    observeNativeWsFrame,
    recordNetworkQualityMovementCommand,
    observeNetworkQualitySelf,
    networkQualityTargetId,
    recordNetworkQualityShot,
    recordNetworkQualityAttackDamage,
    summarizeNetworkQuality,
    refreshGlobalState,
    wsSend,
    setNativeKeys,
    cancelVelocityStopTimer,
    clearNativeMotionState,
    stopLocalMotionOnly,
    stopMotionSafely,
    stopMotionAfterExit,
    cancelDirectVelocityRepeat,
    directWsVelocityMessage,
    sendDirectNativeVelocity,
    scheduleDirectVelocityRepeat,
    sendNativeVelocity,
    safeSendVelocity,
    sendActionVelocity,
    aimAt,
    sendNativeShoot,
    recordCombatShotAttempt,
    shootAt
  } = createNativeStateRuntime({
    bot,
    cfg,
    storage: localStorage,
    pageGlobal,
    readPageGlobal,
    installPageGlobal,
    recordRuntimeDiagnostics: detail => recordRuntimeDiagnosticsCore(bot, detail),
    noteLoginSnapshotProbe: (...args) => noteLoginSnapshotProbe(...args),
    noteLeave403SnapshotProbe: (...args) => noteLeave403SnapshotProbe(...args),
    getCurrentUserId: () => getCurrentUserId(),
    getSessionToken: () => getSessionToken(),
    getOwnEntity: () => {
      try {
        return typeof getOwnEntity === 'function' ? getOwnEntity() : null;
      } catch (_) {
        return null;
      }
    },
    targetOverlayRenderEntities: () => [],
    runTickSafely: (...args) => runTickSafely(...args),
    runCallbackSafely: (...args) => runCallbackSafely(...args),
    recordUnhandledTickError: (...args) => recordUnhandledTickError(...args),
    nativeTickMinIntervalMs: (...args) => nativeTickMinIntervalMs(...args),
    clearPostExitTargetState: (...args) => clearPostExitTargetState(...args),
    exitMotionStopLockRemainingMs: (...args) => exitMotionStopLockRemainingMs(...args),
    noteImportantSessionExit: (...args) => noteImportantSessionExit(...args),
    startImportantSession: (...args) => startImportantSession(...args),
    readImportantLogsStore: (...args) => readImportantLogsStore(...args),
    writePersistentLastSelfState: (...args) => writePersistentLastSelfState(...args),
    summarizeStamina: (...args) => summarizeStamina(...args),
    dailyStaminaWindowStartAt: (...args) => dailyStaminaWindowStartAt(...args),
    dropValue,
    dist,
    speed,
    hypot,
    clamp,
    isAlive,
    isFiringEntity,
    combatMetricRound: value => {
      const number = Number(value);
      return Number.isFinite(number) ? Math.round(number) : null;
    },
    combatMetricEntityId: entity => entity?.id ?? entity?.user_id ?? null,
    combatMetricHp: entity => {
      const number = Number(entity?.hp);
      return Number.isFinite(number) ? number : null;
    },
    now
  }));














































































































































































































  const { createImportantLoggingRuntime } = require('./runtime/important-logging-runtime');
  ({
    readImportantLogsStore,
    restoreImportantLogsForRemote,
    markImportantLogsRemoteSent,
    markImportantLogsRemoteError,
    noteImportantSessionExit,
    startImportantSession,
    upsertImportantSessionRecord,
    importantSessionStaminaSpentMs,
    recordImportantCombatTick,
    summarizeImportantLoggingStatus,
    rememberAttack,
    recordKillHistoryItem,
    updateKillHistory
  } = createImportantLoggingRuntime({
    bot,
    cfg,
    storage: localStorage,
    importantLogsKey: IMPORTANT_LOGS_KEY,
    queueCombatLogEntry,
    flushCombatLogs,
    combatLogSuspendReason,
    combatLogIsAfkAttack,
    getCurrentUserId: () => getCurrentUserId(),
    pushBounded,
    knownHpValue,
    dropValue,
    isAfkProfitTarget,
    isCurrentlyActive,
    isMovingThreat,
    isFiringEntity,
    summarizeSelf: (...args) => summarizeSelf(...args),
    getNativeEntityList: () => getNativeEntityList(),
    getEntities: () => getEntities(),
    isAlive,
    firstFiniteNumber
  }));

  function markRecentMovement(entities) {
    const t = now();
    const sampleMs = Math.max(1, Number(cfg.combatAimMotionSampleMs || 50));
    const decayMs = Math.max(sampleMs, Number(cfg.combatAimRecentMotionDecayMs || 900));
    for (const entity of entities) {
      const id = Number(entity.user_id);
      if (!id) continue;
      const x = Number(entity.x);
      const y = Number(entity.y);
      const previous = bot.seenEntities.get(id);
      let movedAt = previous?.movedAt || 0;
      let activityAt = previous?.activityAt || 0;
      let motionSampleSpeed = 0;
      let motionObservedSpeed = 0;
      const currentSpeed = speed(entity);
      const firing = isFiringEntity(entity);
      const stamina5s = Number(entity?.stamina_5s_remaining_milli ?? entity?.stamina5s ?? entity?.stamina_5s ?? NaN);
      const previousStamina = Number(previous?.stamina5s);
      const staminaDropThreshold = Math.max(0, Number(cfg.opportunityAfkStaminaDropThresholdMs || 100) || 100);
      if (previous
        && Number.isFinite(x)
        && Number.isFinite(y)
        && Number.isFinite(Number(previous.x))
        && Number.isFinite(Number(previous.y))) {
        const elapsedMs = Math.max(sampleMs, t - Number(previous.seenAt || t));
        const delta = Math.hypot(x - Number(previous.x), y - Number(previous.y));
        motionSampleSpeed = delta * sampleMs / elapsedMs;
        const retained = Math.max(0, Number(previous.motionObservedSpeed || 0)) * Math.max(0, 1 - elapsedMs / decayMs);
        motionObservedSpeed = Math.max(motionSampleSpeed, retained);
        if (delta >= cfg.activeMoveMin) {
          movedAt = t;
          activityAt = t;
        }
      }
      if (!previous && (Math.abs(Number(entity.vx) || 0) || Math.abs(Number(entity.vy) || 0))) {
        movedAt = t;
        activityAt = t;
      }
      if (currentSpeed >= cfg.activeSpeedMin || firing) activityAt = t;
      if (Number.isFinite(stamina5s) && Number.isFinite(previousStamina) && stamina5s + staminaDropThreshold < previousStamina) activityAt = t;
      const motionAgeMs = movedAt ? Math.max(0, t - movedAt) : null;
      const recentActivityAgeMs = activityAt ? Math.max(0, t - activityAt) : null;
      const afkCooldownMs = Math.max(0, Number(cfg.afkRecentActivityCooldownMs || 0) || 0);
      entity.motionSampleSpeed = motionSampleSpeed;
      entity.motionObservedSpeed = motionObservedSpeed;
      entity.motionAgeMs = motionAgeMs;
      entity.recentActivityAgeMs = recentActivityAgeMs;
      entity.recentlyActive = Boolean(recentActivityAgeMs !== null && recentActivityAgeMs <= afkCooldownMs);
      entity.recentlyMoved = Boolean(movedAt && t - movedAt <= cfg.activeSeenMs);
      bot.seenEntities.set(id, {
        x,
        y,
        seenAt: t,
        movedAt,
        activityAt,
        motionSampleSpeed,
        motionObservedSpeed,
        stamina5s: Number.isFinite(stamina5s) ? stamina5s : (Number.isFinite(previousStamina) ? previousStamina : null)
      });
    }
    const seenTtlMs = Math.max(10000, Math.max(0, Number(cfg.afkRecentActivityCooldownMs || 0) || 0) + 2000);
    for (const [id, seen] of bot.seenEntities.entries()) {
      if (t - seen.seenAt > seenTtlMs) bot.seenEntities.delete(id);
    }
  }












































  function fleeDirection(self, threats) {
    let vx = 0;
    let vy = 0;
    for (const t of threats) {
      const d = Math.max(1, dist(self, t));
      const weight = (cfg.dangerRadius - Math.min(cfg.dangerRadius, d) + 600) / d;
      vx += (Number(self.x) - Number(t.x)) * weight / d;
      vy += (Number(self.y) - Number(t.y)) * weight / d;
    }
    const nearest = threats[0] || null;
    let dx = Math.abs(vx) > 0.02 ? Math.sign(vx) : 0;
    let dy = Math.abs(vy) > 0.02 ? Math.sign(vy) : 0;
    if (!(dx || dy) && nearest) {
      dx = Math.sign(Number(self.x) - Number(nearest.x)) || 0;
      dy = Math.sign(Number(self.y) - Number(nearest.y)) || 0;
    }
    return {
      dx,
      dy,
      score: hypot(vx, vy)
    };
  }

  function lockedFleeDirection(self, threats, reason) {
    const t = now();
    const ids = threats.slice(0, 4).map(item => String(item.user_id ?? item.id ?? ''));
    if (bot.fleeLock && t < bot.fleeLock.until && (bot.fleeLock.dx || bot.fleeLock.dy)) {
      const previousIds = new Set(bot.fleeLock.threatIds || []);
      const overlaps = ids.some(id => previousIds.has(id));
      if (bot.fleeLock.reason === reason && (overlaps || threats.length)) {
        return { dx: bot.fleeLock.dx, dy: bot.fleeLock.dy, score: bot.fleeLock.score || 0, locked: true };
      }
    }

    const flee = fleeDirection(self, threats);
    if (!(flee.dx || flee.dy) && bot.fleeLock && (bot.fleeLock.dx || bot.fleeLock.dy)) {
      flee.dx = bot.fleeLock.dx;
      flee.dy = bot.fleeLock.dy;
    }
    bot.fleeLock = {
      dx: flee.dx,
      dy: flee.dy,
      score: flee.score,
      reason,
      threatIds: ids,
      until: t + cfg.fleeLockMs
    };
    return { ...flee, locked: false };
  }

  function actionMovesTowardThreat(self, threat, action) {
    const dx = Number(action?.dx || 0);
    const dy = Number(action?.dy || 0);
    if (!(dx || dy)) return false;
    const tx = Number(threat.x) - Number(self.x);
    const ty = Number(threat.y) - Number(self.y);
    return dx * tx + dy * ty > 0;
  }

  function isShortSafeCoinAction(action) {
    if (action?.kind !== 'coin') return false;
    const distance = Number(action.target?.distance ?? action.distance ?? Infinity);
    return Number.isFinite(distance) && distance <= cfg.activeReturnBlockCoinPassDistance;
  }

  function returnBlockRadius(threat) {
    const limit = Math.max(0, Number(cfg.activeAvoidMaxDistance || 0) || Infinity);
    return Math.min(limit, threat.cautionRadius + cfg.activeCautionExitMargin + cfg.activeReturnBlockMargin);
  }

  function returnBlockExitRadius(threat) {
    return returnBlockRadius(threat) + cfg.activeReturnBlockExitMargin;
  }

  function returnBlockResumeRadius(threat) {
    return returnBlockExitRadius(threat) + cfg.activeReturnBlockResumeMargin;
  }

  function returnBlockSuppressRadius(threat) {
    return returnBlockResumeRadius(threat) + cfg.activeReturnBlockClearMargin;
  }

  function hasReturnBlockThreat(activeThreats) {
    return Boolean(pickReturnBlockPressure(activeThreats));
  }

  function markReturnBlockPressure(threat, force = false) {
    if (!threat) return;
    bot.returnBlockRecentThreatId = threatKey(threat);
    if (force || threat.distance <= returnBlockSuppressRadius(threat)) {
      bot.returnBlockCooldownUntil = Math.max(Number(bot.returnBlockCooldownUntil || 0), now() + cfg.returnBlockCooldownMs);
    }
  }

  function pickReturnBlockPressure(activeThreats) {
    const t = now();
    const recentId = bot.returnBlockRecentThreatId || bot.returnBlockLock?.id || '';
    if (recentId) {
      const recent = activeThreats.find(threat => threatKey(threat) === String(recentId));
      if (recent && recent.distance <= returnBlockSuppressRadius(recent)) {
        return recent;
      }
      if (t >= Number(bot.returnBlockCooldownUntil || 0)) {
        bot.returnBlockRecentThreatId = '';
      }
    }
    return activeThreats.find(e => e.distance <= returnBlockSuppressRadius(e)) || null;
  }

  function returnBlockScanDirection(self, activeThreats, nearbyHumans) {
    const t = now();
    const threat = pickReturnBlockPressure(activeThreats) || activeThreats[0] || null;
    const key = threatKey(threat);
    const locked = bot.returnBlockScan;
    if (locked && t < Number(locked.until || 0) && (locked.dx || locked.dy)) {
      const moved = Math.hypot(Number(self.x) - Number(locked.x || self.x), Number(self.y) - Number(locked.y || self.y));
      const stale = t - Number(locked.startedAt || t) >= cfg.returnBlockScanStuckMs && moved < cfg.returnBlockScanStuckDistance;
      if (!stale && (!key || String(locked.threatId || '') === key)) {
        return { dx: locked.dx, dy: locked.dy, locked: true, threat };
      }
    }

    const awayX = threat ? Math.sign(Number(self.x) - Number(threat.x)) : 0;
    const awayY = threat ? Math.sign(Number(self.y) - Number(threat.y)) : 0;
    const phase = Math.floor(t / cfg.returnBlockScanHeadingMs) % 8;
    const pattern = [
      { dx: -awayY, dy: awayX },
      { dx: awayY, dy: -awayX },
      { dx: awayX, dy: 0 },
      { dx: 0, dy: awayY },
      { dx: awayX, dy: awayY },
      { dx: 1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: -1 }
    ];
    const candidates = pattern
      .map((item, index) => ({ dx: Math.sign(item.dx || 0), dy: Math.sign(item.dy || 0), index }))
      .filter(item => item.dx || item.dy)
      .filter(item => !threat || !actionMovesTowardThreat(self, threat, item));
    const scored = candidates.map(item => {
      let score = item.index === phase ? 500 : 0;
      if (threat) {
        const tx = Number(self.x) - Number(threat.x);
        const ty = Number(self.y) - Number(threat.y);
        score += item.dx * tx + item.dy * ty >= 0 ? 200 : -1000;
      }
      for (const human of (nearbyHumans || []).slice(0, 6)) {
        const hx = Number(self.x) - Number(human.x);
        const hy = Number(self.y) - Number(human.y);
        score += item.dx * hx + item.dy * hy >= 0 ? 5 : -20;
      }
      if (locked && item.dx === -Number(locked.dx || 0) && item.dy === -Number(locked.dy || 0)) score -= 30;
      return { ...item, score };
    }).sort((a, b) => b.score - a.score);
    const next = scored[0] || { dx: awayX || 1, dy: awayY || 0, score: 0 };
    bot.returnBlockScan = {
      threatId: key,
      dx: next.dx,
      dy: next.dy,
      x: Number(self.x) || 0,
      y: Number(self.y) || 0,
      startedAt: t,
      until: t + cfg.returnBlockScanHeadingMs
    };
    return { dx: next.dx, dy: next.dy, locked: false, threat };
  }

  function buildReturnBlockScanAction(self, activeThreats, nearbyHumans) {
    const dir = returnBlockScanDirection(self, activeThreats, nearbyHumans);
    const threat = dir.threat || activeThreats[0] || null;
    markReturnBlockPressure(threat);
    return {
      kind: 'patrol',
      reason: 'return-block-lateral-scan',
      dx: dir.dx,
      dy: dir.dy,
      locked: dir.locked,
      threats: threat ? [{
        id: threat.user_id,
        name: threat.name,
        d: Math.round(threat.distance),
        drop: threat.drop,
        speed: Math.round(threat.speed),
        moving: Boolean(threat.moving),
        r: Math.round(returnBlockRadius(threat)),
        exitR: Math.round(returnBlockExitRadius(threat)),
        resumeR: Math.round(returnBlockResumeRadius(threat))
      }] : []
    };
  }

  function threatKey(threat) {
    return String(threat?.user_id ?? threat?.id ?? '');
  }

  function mergeThreatLists(...lists) {
    const merged = [];
    const seen = new Set();
    for (const list of lists) {
      for (const threat of list || []) {
        if (!threat) continue;
        const key = threatKey(threat) || ('xy:' + Math.round(Number(threat.x) || 0) + ':' + Math.round(Number(threat.y) || 0));
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(threat);
      }
    }
    return merged.sort((a, b) => Number(a.distance || Infinity) - Number(b.distance || Infinity));
  }

  function pickReturnBlockThreat(self, activeThreats, action) {
    const lock = bot.returnBlockLock;
    if (lock?.id) {
      const locked = activeThreats.find(threat => threatKey(threat) === String(lock.id));
      if (locked && locked.distance <= returnBlockExitRadius(locked)) {
        return { threat: locked, locked: true, mode: 'exit' };
      }
      if (locked && locked.distance <= returnBlockResumeRadius(locked) && actionMovesTowardThreat(self, locked, action)) {
        return { threat: locked, locked: true, mode: 'resume-guard' };
      }
      bot.returnBlockLock = null;
    }
    const threat = activeThreats.find(e => e.distance <= returnBlockExitRadius(e));
    if (!threat) {
      const returnThreat = activeThreats.find(e => e.distance <= returnBlockResumeRadius(e) && actionMovesTowardThreat(self, e, action));
      if (!returnThreat) return null;
      bot.returnBlockLock = { id: threatKey(returnThreat), startedAt: now() };
      return { threat: returnThreat, locked: false, mode: 'resume-guard' };
    }
    bot.returnBlockLock = { id: threatKey(threat), startedAt: now() };
    return { threat, locked: false, mode: 'exit' };
  }

  function blockThreatReturnAction(self, activeThreats, action) {
    if (action?.ignoreReturnBlock || action?.combat || action?.kind === 'leave') return action;
    if (isFullHp(self) && !(activeThreats || []).some(isInvulnerableActive)) return action;
    if (!action || action.kind === 'flee' || action.kind === 'recover' || action.kind === 'wait' || action.kind === 'idle') return action;
    const picked = pickReturnBlockThreat(self, activeThreats, action);
    if (!picked) return action;
    const threat = picked.threat;
    if (isShortSafeCoinAction(action) && !actionMovesTowardThreat(self, threat, action)) return action;
    if (action.reason === 'return-block-lateral-scan'
      && threat.distance > returnBlockRadius(threat)
      && !actionMovesTowardThreat(self, threat, action)) {
      markReturnBlockPressure(threat);
      return action;
    }
    if (threat.distance > threat.threatRadius && !actionMovesTowardThreat(self, threat, action)) {
      markReturnBlockPressure(threat);
      const dir = returnBlockScanDirection(self, [threat], []);
      return {
        kind: 'patrol',
        reason: 'return-block-lateral-scan',
        dx: dir.dx,
        dy: dir.dy,
        locked: dir.locked,
        blockedAction: {
          kind: action.kind,
          reason: action.reason || '',
          target: action.target || null,
          returnBlockMode: picked.mode || ''
        },
        threats: [{
          id: threat.user_id,
          name: threat.name,
          d: Math.round(threat.distance),
          drop: threat.drop,
          speed: Math.round(threat.speed),
          moving: Boolean(threat.moving),
          r: Math.round(returnBlockRadius(threat)),
          exitR: Math.round(returnBlockExitRadius(threat)),
          resumeR: Math.round(returnBlockResumeRadius(threat))
        }]
      };
    }
    markReturnBlockPressure(threat, true);
    const flee = lockedFleeDirection(self, [threat], 'active-threat-return-block');
    return {
      kind: 'flee',
      reason: 'active-threat-return-block',
      dx: flee.dx,
      dy: flee.dy,
      locked: flee.locked,
      blockedAction: {
        kind: action.kind,
        reason: action.reason || '',
        target: action.target || null,
        returnBlockLocked: Boolean(picked.locked),
        returnBlockMode: picked.mode || ''
      },
      threats: [{
        id: threat.user_id,
        name: threat.name,
        d: Math.round(threat.distance),
        drop: threat.drop,
        speed: Math.round(threat.speed),
        moving: Boolean(threat.moving),
        r: Math.round(returnBlockRadius(threat)),
        exitR: Math.round(returnBlockExitRadius(threat)),
        resumeR: Math.round(returnBlockResumeRadius(threat))
      }]
    };
  }

  function classify(self) {
    const nativeEntities = getNativeEntityList();
    const nativeMeta = buildNativeEntityMeta(nativeEntities);
    const coinDrops = getCoins(self);
    const bullets = getBullets();
    const localSource = nativeMeta.available ? nativeEntities : [];
    const localEntities = (localSource || [])
      .filter(e => Number(e.user_id) !== Number(self.user_id) && isAlive(e))
      .map(e => ({ ...e, native: Boolean(nativeMeta.available), snapshot: !nativeMeta.available || Boolean(e.snapshot) }));
    markRecentMovement(localEntities);
    const globalById = new Map();
    for (const entity of bot.globalState.entities || []) {
      if (Number(entity.user_id) === Number(self.user_id) || !isAlive(entity)) continue;
      if (!snapshotEntityAllowed(self, entity, nativeMeta)) continue;
      globalById.set(Number(entity.user_id), { ...entity, snapshot: true, native: false });
    }
    for (const entity of localEntities) {
      const previous = globalById.get(Number(entity.user_id)) || {};
      globalById.set(Number(entity.user_id), {
        ...previous,
        ...entity,
        native: Boolean(entity.native || previous.native),
        snapshot: Boolean(entity.snapshot || previous.snapshot)
      });
    }
    const entities = Array.from(globalById.values());
    const offensiveEntities = entities.filter(entityFreshEnoughForOffense);
    const attackableEntities = offensiveEntities.filter(e => !isWhitelistedTarget(e));
    const realtimeEntities = attackableEntities.filter(e => e.native && !e.minimapOnly);
    const activeThreats = entities
      .filter(e => isCurrentlyActive(e))
      .map(e => decorateActiveThreat(self, e))
      .sort((a, b) => a.distance - b.distance);
    const inactiveTargets = attackableEntities
      .filter(e => !isCurrentlyActive(e) && dropValue(e) > 0 && !isInvulnerable(e))
      .map(e => ({ ...e, distance: dist(self, e), drop: dropValue(e), speed: speed(e) }))
      .filter(e => e.distance <= cfg.attackRange)
      .sort((a, b) => {
        const stickyA = bot.lastTarget && String(bot.lastTarget.kind) === 'enemy' && String(bot.lastTarget.id) === String(a.user_id);
        const stickyB = bot.lastTarget && String(bot.lastTarget.kind) === 'enemy' && String(bot.lastTarget.id) === String(b.user_id);
        if (stickyA !== stickyB && now() - bot.lastTargetAt < cfg.targetStickMs) return stickyA ? -1 : 1;
        if (b.drop !== a.drop) return b.drop - a.drop;
        return a.distance - b.distance;
      });
    const realtimeInactiveTargets = realtimeEntities
      .filter(e => !isCurrentlyActive(e) && dropValue(e) > 0 && !isInvulnerable(e))
      .map(e => ({ ...e, distance: dist(self, e), drop: dropValue(e), speed: speed(e) }))
      .filter(e => e.distance <= cfg.attackRange)
      .sort((a, b) => {
        const stickyA = bot.lastTarget && String(bot.lastTarget.kind) === 'enemy' && String(bot.lastTarget.id) === String(a.user_id);
        const stickyB = bot.lastTarget && String(bot.lastTarget.kind) === 'enemy' && String(bot.lastTarget.id) === String(b.user_id);
        if (stickyA !== stickyB && now() - bot.lastTargetAt < cfg.targetStickMs) return stickyA ? -1 : 1;
        if (b.drop !== a.drop) return b.drop - a.drop;
        return a.distance - b.distance;
      });
	    const coins = coinDrops
	      .map(c => ({ ...c, distance: dist(self, c), amount: Number(c.amount || 0) }))
      .filter(c => c.amount > 0 && c.distance <= cfg.coinMaxDistance)
      .sort((a, b) => {
        if (a.distance !== b.distance) return a.distance - b.distance;
        return b.amount - a.amount;
      });
	    const allCoins = coinDrops
	      .map(c => ({ ...c, distance: dist(self, c), amount: Number(c.amount || 0), global: Boolean(c.snapshot) }))
      .filter(c => c.amount > 0)
      .sort((a, b) => {
        if (a.distance !== b.distance) return a.distance - b.distance;
        return b.amount - a.amount;
      });
    const realtimeCoins = allCoins.filter(c => !isSnapshotOnlyCoin(c));
    const realtimeNearCoins = coins.filter(c => !isSnapshotOnlyCoin(c));
    const globalTargets = attackableEntities
      .filter(e => !isCurrentlyActive(e) && dropValue(e) > 0 && !isInvulnerable(e))
      .map(e => ({ ...e, distance: dist(self, e), drop: dropValue(e), speed: speed(e), global: true }))
      .filter(e => e.distance <= cfg.globalAttackMaxDistance)
      .sort((a, b) => {
        if (b.drop !== a.drop) return b.drop - a.drop;
        return a.distance - b.distance;
      });
    const realtimeGlobalTargets = realtimeEntities
      .filter(e => !isCurrentlyActive(e) && dropValue(e) > 0 && !isInvulnerable(e))
      .map(e => ({ ...e, distance: dist(self, e), drop: dropValue(e), speed: speed(e), global: false }))
      .filter(e => e.distance <= cfg.globalAttackMaxDistance)
      .sort((a, b) => {
        if (b.drop !== a.drop) return b.drop - a.drop;
        return a.distance - b.distance;
      });
    const minimapDropTargets = (snapshotDataFreshEnough() ? (bot.globalState.minimap?.points || []) : [])
      .filter(p => Number(p.u) !== Number(self.user_id))
      .map(p => ({
        user_id: p.u,
        x: Number(p.x),
        y: Number(p.y),
        drop: Number(p.d || 0),
        distance: dist(self, p),
        global: true,
        minimapOnly: true
      }))
      .filter(p => !isWhitelistedTarget(p))
      .filter(p => p.drop > 0 && p.distance <= cfg.globalAttackMaxDistance)
      .sort((a, b) => {
        if (b.drop !== a.drop) return b.drop - a.drop;
        return a.distance - b.distance;
      });
	    const globalCoins = coinDrops
	      .map(c => ({ ...c, distance: dist(self, c), amount: Number(c.amount || 0), global: Boolean(c.snapshot) }))
      .filter(c => c.amount > 0 && c.distance <= cfg.globalCoinMaxDistance)
      .sort((a, b) => {
        if (a.distance !== b.distance) return a.distance - b.distance;
        return b.amount - a.amount;
      });
    const realtimeGlobalCoins = globalCoins.filter(c => !isSnapshotOnlyCoin(c));
	    const patrolCoins = coinDrops
	      .map(c => ({ ...c, distance: dist(self, c), amount: Number(c.amount || 0), global: Boolean(c.snapshot) }))
      .filter(c => c.amount > 0 && c.distance <= cfg.patrolCoinMaxDistance)
      .sort((a, b) => {
        if (a.distance !== b.distance) return a.distance - b.distance;
        return b.amount - a.amount;
      });
    const realtimePatrolCoins = patrolCoins.filter(c => !isSnapshotOnlyCoin(c));
	    const scanCoins = coinDrops
	      .map(c => ({ ...c, distance: dist(self, c), amount: Number(c.amount || 0), global: Boolean(c.snapshot) }))
      .filter(c => c.amount > 0 && c.distance <= cfg.scanCoinMaxDistance)
      .sort((a, b) => {
        if (a.distance !== b.distance) return a.distance - b.distance;
        return b.amount - a.amount;
      });
    const realtimeScanCoins = scanCoins.filter(c => !isSnapshotOnlyCoin(c));
	    const nearbyHumans = entities
	      .map(e => ({ ...e, distance: dist(self, e), drop: dropValue(e), speed: speed(e) }))
	      .sort((a, b) => a.distance - b.distance);
    const combatCandidateRange = combatTargetCandidateRange(self);
    const combatTargets = attackableEntities
      .map(e => ({ ...e, distance: dist(self, e), drop: dropValue(e), speed: speed(e), hp: combatHpValue(e), knownHp: knownHpValue(e) }))
      .filter(e => !isInvulnerable(e))
      .filter(e => e.native)
      .filter(e => e.distance <= combatCandidateRange)
      .sort((a, b) => {
        const stickyA = bot.lastTarget?.kind === 'enemy' && String(bot.lastTarget.id) === String(a.user_id);
        const stickyB = bot.lastTarget?.kind === 'enemy' && String(bot.lastTarget.id) === String(b.user_id);
        if (stickyA !== stickyB && now() - bot.lastTargetAt < cfg.targetStickMs) return stickyA ? -1 : 1;
        if (isCurrentlyActive(a) !== isCurrentlyActive(b)) return isCurrentlyActive(a) ? -1 : 1;
        return a.distance - b.distance;
      });
    const combatDodgeOnlyCandidateRangeValue = combatDodgeOnlyCandidateRange(self);
    const combatDodgeOnlyTargets = attackableEntities
      .map(e => ({ ...e, distance: dist(self, e), drop: dropValue(e), speed: speed(e), hp: combatHpValue(e), knownHp: knownHpValue(e) }))
      .filter(e => !isInvulnerable(e))
      .filter(e => e.native)
      .filter(e => e.distance > combatCandidateRange)
      .filter(e => e.distance <= combatDodgeOnlyCandidateRangeValue)
      .map(e => ({ ...e, combatDodgeOnlyCandidate: true }))
      .sort((a, b) => a.distance - b.distance);
	    const snapshotCoins = allCoins.filter(c => isSnapshotOnlyCoin(c) && c.distance <= cfg.snapshotCoinMaxDistance);
	    return {
      entities,
      realtimeEntities,
      activeThreats,
      inactiveTargets,
      realtimeInactiveTargets,
      coins,
      realtimeNearCoins,
      allCoins,
      realtimeCoins,
      snapshotCoins,
      globalTargets,
      realtimeGlobalTargets,
      minimapDropTargets,
      globalCoins,
      realtimeGlobalCoins,
      patrolCoins,
      realtimePatrolCoins,
      scanCoins,
      realtimeScanCoins,
	      nearbyHumans,
	      combatTargets,
      combatDodgeOnlyTargets,
	      bullets
	    };
	  }



  const { createProfitRuntime } = require('./runtime/profit-runtime');
  const {
    coinMotionNumber,
    coinMotionTolerance,
    coinAxisApproachDirectionCore,
    coinPickupPrecisionPulseMsCore,
    coinAxisLockShouldHoldCore,
    coinNearApproachAxisCore,
    coinDirectionToCore,
    coinMotionMetaCore,
    directionTo,
    coinMotionCoreOptions,
    coinPickupFailureCount,
    coinPickupAttemptSlowCount,
    applyCoinApproachLockUpdate,
    coinDiagnosticsSummary,
    summarizeCoinDiagnosticsList,
    addCoinFilterDiagnostic,
    buildCoinDiagnostics,
    coinThreatDangerRadius,
    coinHeadingBlockedByInvulnerableThreat,
    coinBlockedByThreat,
    coinDiagnosticsNearDistance,
    coinDiagnosticsLimit,
    coinThreatDiagnostics,
    recordCoinFilterDiagnostic,
    coinStaminaAffordableWithDiagnostic,
    attachCoinDiagnostics,
    safeCoinCandidates,
    pickRealtimeLocalCoin,
    nearestRealtimeCoinWithin,
    fieldMigrationBlockedByNearbyCoin,
    pickCoin,
    pickCoinField,
    pickDistantCoin,
    highValueCoinPriorityAmount,
    highValueCoinPriorityHealthyHp,
    pickHighValueVisibleCoin,
    nearbyThreatBlocksLowHpHighValueCoin,
    canPrioritizeHighValueVisibleCoin,
    highValueVisibleCoinPriorityNeeded,
    dailyStaminaBudgetIsLimitingCore,
    summarizeBlockedStaminaOpportunityCore,
    summarizeNearestCoinStaminaBudgetExitCore,
    pickNearestDailyStaminaFinalCoinCore,
    opportunityMoveStaminaCost,
    opportunityCoinStaminaCost,
    estimatedKillShots,
    opportunityEnemyStaminaCost,
    opportunityWindowStaminaBudget,
    opportunityLongStaminaBudget,
    opportunityStaminaAffordable,
    dailyStaminaFinalCoinAction,
    staminaBudgetCoinLeaveSummary,
    staminaBudgetCoinLeaveDisplay,
    staminaBudgetCoinLeaveAction,
    compareCoinOpportunity,
    snapshotCoinAgeMs,
    isSnapshotCoinWaitAction,
    pickSnapshotCoinDestination,
    scoreCoinOpportunity,
    opportunityAfkTargetId,
    targetStamina5sRemaining,
    opportunityAfkStaminaState,
    opportunityAfkStaminaCooldownMs,
    opportunityAfkStaminaDropThresholdMs,
    updateOpportunityAfkStaminaObservations,
    opportunityAfkStaminaCooldownRemaining,
    afkOpportunityBlockedByStaminaCooldown,
    scoreEnemyOpportunity,
    opportunityEffectiveStaminaCostCore,
    opportunityValueScoreCore,
    opportunityPriorityTierCore,
    mergeCoinRouteDisplayCore,
    uniqueVisibleRouteCoinsCore,
    buildCoinOpportunityCandidatesCore,
    buildEnemyOpportunityCandidatesCore,
    buildOpportunityCandidatesCore,
    bestCoinOpportunityScoreCore,
    opportunityPriorityTier,
    defaultDist,
    coinRouteKey,
    coinRouteIdsFrom,
    coinRouteLegStaminaCostCore,
    coinRouteLegClearCore,
    coinRoutePointLimitCore,
    coinRouteSummaryCore,
    coinRoutePoints,
    coinRouteActionMetaCore,
    buildCoinRouteFromAnchorCore,
    coinRouteSkipsCloserFirstCoinCore,
    coinRouteSkipsHeldSingleCoinCore,
    coinRouteMatchesHeldChoiceCore,
    heldCoinRouteBeatsSwitchCore,
    pickCoinRouteOpportunityCore,
    coinRouteCoreOptions,
    currentHeldCoinRouteChoice,
    currentHeldCoinChoice,
    opportunityCandidateCoreOptions,
    pickProfitableCombatTarget,
    postAttackVisibleCoinExistsCore,
    resolvedRecentPostAttackDropsCore,
    buildPostAttackDropCoinCandidateCore,
    pickPostAttackDropCoinCore,
    pickPostAttackDropWaitTargetCore,
    attackEntityMatches,
    recentAttackTargetStillAttackable,
    postAttackDropResolvedAt,
    buildPostAttackDropWaitAction,
    buildCoinAction,
    buildEnemyAction,
    opportunityKey,
    opportunityChoiceType,
    opportunityChoiceId,
    opportunityChoiceKey,
    opportunityPairKey,
    opportunityByKey,
    opportunityMatchesChoiceCore,
    isHighValueCoinOpportunityCore,
    highValueCoinHoldBlocksEnemySwitchCore,
    lockedOpportunityChoiceCore,
    applyOpportunityOscillationLockCore,
    chooseStableOpportunityCore,
    opportunityMissingHoldUntilCore,
    missingHeldCoinCoveredByVisibleAuthorityCore,
    buildMissingHeldOpportunityCore,
    opportunityRouteIds,
    rememberOpportunityChoiceCore,
    opportunityChoiceCoreOptions,
    resetOpportunitySwitchLock,
    opportunitySameCoinRadius,
    currentVisibleCoinListForMissingHold,
    visibleCoinSourcesConfirmTargetMissing,
    clearMissingVisibleCoinTarget,
    pickBestOpportunityCore,
    patrolDirectionCore,
    shouldClearOpportunityChoiceCore,
    coinFailureIgnoreCore,
    staleCoinEscapeDirectionCore,
    coinProgressIntentCore,
    coinAttemptExpiredCore,
    updateCoinAttemptCore,
    updateCoinProgressRecordCore,
    buildIgnoredCoinProgressCore,
    buildIgnoredCoinPatrolActionCore,
    coinIgnoreCleanupIntentCore,
    coinProgressCoreOptions,
    actionPriorityBand,
    actionFocusTargetType,
    actionFocusId,
    actionFocusSummary,
    actionSwitchPairKey,
    buildPreviousDecisionSummary,
    recordActionSwitchDiagnosticsCore,
    finalActionBandRank,
    finalActionReusable,
    shouldHoldPreviousFinalAction,
    applyFinalActionArbitrationCore,
    targetSwitchHistoryLimit,
    targetSwitchOscillationWindowMs,
    roundedNullable,
    ensureTargetSwitchDiagnostics,
    finalActionArbitrationHoldMs,
    finalActionArbitrationHistoryLimit,
    ensureFinalActionArbitration,
    coinTargetKeyCore,
    coinTargetDistance,
    coinMatchesTrackedTargetCore,
    trackedCoinTargetForCollectionCore,
    buildNativeCoinSnapshotCore,
    pointToSegmentDistanceCore,
    pickIncidentalCoinPickupsCore,
    snapshotCoinWorthLongTravelCore,
    snapshotCoinNavigationReasonCore,
    setLastTarget,
    clearCoinTracking,
	    coinTargetCoreOptions,
	    recordIncidentalCoinPickups,
	    markCoinCollected,
	    applyCoinProgressAction,
	    applyFinalActionArbitration,
	    recordActionSwitchDiagnostics,
	    buildDropMatchedKillCore
	  } = createProfitRuntime({
    bot,
    cfg,
    OPPORTUNITY_CONSTANTS,
    safeJsonClone,
    arrayCount,
    formatDistance,
    formatDurationMs,
    now,
    hypot,
    dist,
    speed,
    clamp,
    staminaRemaining,
    staminaExhaustedThreshold,
    staminaBudgetReloginDelayMs,
    isInvulnerableActive,
    isInvulnerable,
    isCurrentlyActive,
    isFiringEntity,
    isAfkProfitTarget,
    isWhitelistedTarget,
    hasCombatActivitySignal,
    hpValue,
    combatHpValue,
    knownHpValue,
    dropValue,
    isFullHp,
    snapshotCoinLocalSuppressRadius: (...args) => snapshotCoinLocalSuppressRadius(...args),
    isSnapshotOnlyCoin: (...args) => isSnapshotOnlyCoin(...args),
    normalizeCoinDrop: (...args) => normalizeCoinDrop(...args),
    getNativeCoinSources: (...args) => getNativeCoinSources(...args),
    getNativeCoinList: (...args) => getNativeCoinList(...args),
    entityFreshEnoughForOffense,
    isAlive,
    attackWorthTakingCore,
    incomingBulletThreat: (...args) => incomingBulletThreat(...args),
    pickCombatTarget: (...args) => pickCombatTarget(...args),
    isLowValueActiveCombatTarget: (...args) => isLowValueActiveCombatTarget(...args),
    lowValueActiveThreatensSelf: (...args) => lowValueActiveThreatensSelf(...args),
    updateSessionStats,
    pushBounded,
    importantSessionStaminaSpentMs,
    recordKillHistoryItem,
    upsertImportantSessionRecord,
    summarizeSelf
  });

  const { createCombatRuntime } = require('./runtime/combat-runtime');
  ({
    rememberCombatEngagement,
    clearCombatEngagement,
    summarizeOfflineThreat,
    assessOfflineSafety,
    pickActiveCombatWaitThreat,
    activeCombatThreatWaitAction,
    recentCombatInjuryActive,
    lowValueActiveDropMax,
    isLowValueActiveCombatTarget,
    proactiveActiveKillStaminaBudgetMs,
    proactiveActiveCombatStaminaAffordable,
    activeCombatBudgetBlocked,
    activeCombatRequiresThreatEvidence,
    incomingOwnerMatchesTarget,
    activeCombatThreatensSelf,
    lowValueActiveThreatensSelf,
    combatDodgeThreatRange,
    combatTargetPriority,
    isDefensiveCombatTarget,
    isProfitableCombatTarget,
    combatHpGapDisadvantaged,
    profitCombatDisadvantaged,
    pickCombatTarget,
    combatEngageGraceRange,
    combatTargetCandidateRange,
    combatDodgeOnlyCandidateRange,
    combatEngagedCandidate,
    pickEngagedCombatTarget,
    defensiveTargetOverridesEngaged,
    incomingBulletRequiresTargetSwitch,
    pickOpportunisticShotTarget,
    actionOpportunityScore,
    opportunisticShotBeatsAction,
    attachOpportunisticShot,
    buildOpportunisticShotWait,
    combatMoveVelocityForDirection,
    combatBulletThreats,
    incomingBulletThreat,
    combatThreatFieldCandidate,
    combatBulletThreatField,
    combatStrafeHoldMs,
    combatStrafeKey,
    combatStrafeMatchesTarget,
    combatPreciseStrafeSign,
    selectCombatStrafeSign,
    tangentMoveForBullet,
    combatMoveClosesDistance,
    combatSafeCloseMoveOverride,
    combatSpacingVector,
    combatSpacingShouldOverrideBullet,
    combatLowHpCloseRiskState,
    combatPressureDisadvantageState,
    combatSustainedPressureDisadvantageState,
    combatPressureCloseVector,
    combatFarNoDamageCloseVector,
    combatRetreatingFighterCloseVector,
    combatFinishPressureState,
    combatOutOfRangeFinishPressureState,
    combatOutOfRangeReengageState,
    combatPassiveRunnerState,
    combatPassiveRunnerCloseVector,
    mergeCombatMove,
    combatPressureThreat,
    combatOutOfRangeDodgeAction,
    combatAimJitterLimit,
    combatAimMotionScale,
    combatMotionSample,
    combatMotionSamplesWithCurrent,
    combatOpponentProfile,
    combatTradeEstimate,
    combatTargetId,
    combatRetreatIgnoreActive,
    rememberCombatRetreatIgnore,
    clearCombatDisadvantageObservation,
    combatDisadvantageObservationState,
    combatAimDamageState,
    combatLowHpNoDamageLeaveState,
    combatRetreatingTargetState,
    combatServerStallNoDamageLeaveState,
    combatTrendState,
    combatTickActiveFromState,
    globalSamplingOutageOfflineState,
    combatTickGapOfflineState,
    nativeTickMinIntervalMs,
    combatShootingPlan,
    combatAimNoDamageLevel,
    combatAimNoDamageJitterLimit,
    combatAimSteadyNoDamageState,
    combatAimFallbackPrecisionState,
    combatMovementAimMode,
    combatInterceptSolution,
    combatLiveAimTarget,
    combatAimSourceDivergenceState,
    combatAimServerStallState,
    combatAimDynamicStrategyState,
    combatAimTarget,
    combatLeaveCoverAction,
    buildCombatAction
  } = createCombatRuntime({
    bot,
    cfg,
    safeJsonClone,
    arrayCount,
    formatDistance,
    formatDurationMs,
    actorLabel,
    hpDisplay,
    now,
    hypot,
    dist,
    clamp,
    staminaRemaining,
    staminaExhaustedThreshold,
    combatMovementBlockedByStamina,
    staminaBudgetCoinLeaveSummary,
    staminaExhaustedWindowLabel,
    isInvulnerable,
    isCurrentlyActive,
    isFiringEntity,
    isMovingThreat,
    isAfkProfitTarget,
    isWhitelistedTarget,
    hasCombatActivitySignal,
    isJoinModeActive,
    hpValue,
    combatHpValue,
    knownHpValue,
    dropValue,
    isFullHp,
    isAlive,
    entityFreshEnoughForOffense,
    normalizeBullet: (...args) => normalizeBullet(...args),
    getBullets: () => getBullets(),
    getNativeEntityList: () => getNativeEntityList(),
    getSelf: () => getSelf(),
    classify: (...args) => classify(...args),
    returnBlockRadius: (...args) => returnBlockRadius(...args),
    attackWorthTakingCore,
    recordNetworkQualityAttackDamage: (...args) => recordNetworkQualityAttackDamage(...args),
    summarizeSelf: (...args) => summarizeSelf(...args),
    updateSessionStats: (...args) => updateSessionStats(...args),
    summarizeServerPositionStall: (...args) => summarizeServerPositionStall(...args),
    stopMotionSafely: (...args) => stopMotionSafely(...args),
    leaveOffline: (...args) => leaveOffline(...args),
    activeOfflineLeaveDetail: (...args) => activeOfflineLeaveDetail(...args),
    requestReload: (...args) => requestReload(...args),
    updateBotPanel: (...args) => updateBotPanel(...args),
    summarizeControl: (...args) => summarizeControl(...args),
    directionTo,
    opportunityLongStaminaBudget,
    scoreEnemyOpportunity,
    opportunityEnemyStaminaCost,
    estimatedKillShots,
    opportunityStaminaAffordable,
    scoreCoinOpportunity
  }));

  function chooseAction(self) {
    const {
      entities,
      realtimeEntities,
      activeThreats,
      inactiveTargets,
      realtimeInactiveTargets,
      coins,
      realtimeNearCoins,
      allCoins,
      realtimeCoins,
      snapshotCoins,
      globalTargets,
      realtimeGlobalTargets,
      minimapDropTargets,
      globalCoins,
      realtimeGlobalCoins,
      patrolCoins,
      realtimePatrolCoins,
      scanCoins,
      realtimeScanCoins,
      nearbyHumans,
      combatTargets,
      combatDodgeOnlyTargets,
      bullets
    } = classify(self);
    bot.coinDiagnostics = buildCoinDiagnostics(self, {
      realtimeNearCoins,
      realtimeCoins,
      realtimeGlobalCoins,
      realtimePatrolCoins,
      snapshotCoins
    }, {
      nearDistance: coinDiagnosticsNearDistance(),
      limit: coinDiagnosticsLimit(),
      nowMs: now(),
      ignoredCoinUntil: coin => bot.ignoredCoins.get(String(coin?.drop_id))
    });
    bot.lastActionEntities = entities;
    updateOpportunityAfkStaminaObservations(realtimeEntities);
    const fullHp = isFullHp(self);
    const avoidanceThreats = activeThreats.filter(isAvoidanceThreat);
    const nearbyAvoidanceRadius = Math.max(
      Number(cfg.dangerRadius || 0) || 0,
      Number(cfg.activeAvoidMaxDistance || cfg.activeCautionRadius || 0) || 0,
      Number(cfg.recoveryAvoidRadius || 0) || 0
    );
    const nearbyAvoidanceThreats = nearbyHumans.filter(e => e.distance <= nearbyAvoidanceRadius && isAvoidanceThreat(e));
    const highValueCoinThreats = mergeThreatLists(
      avoidanceThreats,
      nearbyHumans.filter(e => e.native && isAvoidanceThreat(e))
    );
    const coinThreats = highValueCoinThreats;
    bot.actionThreats = coinThreats;
    const recovery = !fullHp && isRecovering(self);
    const closeThreats = avoidanceThreats.filter(e => e.distance <= e.threatRadius);
    const cautionThreats = avoidanceThreats.filter(e => e.distance <= e.cautionRadius + cfg.activeCautionExitMargin);
    const engagedCombatTarget = pickEngagedCombatTarget(self, combatTargets, entities, bullets);
    const defensiveCombatTarget = pickCombatTarget(self, [...combatTargets, ...combatDodgeOnlyTargets], bullets, { mode: 'defensive' });
    const safetyIncomingBullet = incomingBulletThreat(self, null, bullets);
    const safetyIncomingOwnerId = safetyIncomingBullet?.ownerId ?? null;
    bot.lastSafety = {
      fullHp,
      combatTargets: combatTargets.length,
      engagedCombat: engagedCombatTarget ? {
        id: engagedCombatTarget.user_id,
        name: engagedCombatTarget.name,
        distance: Math.round(engagedCombatTarget.distance),
        intent: engagedCombatTarget.combatIntent || '',
        ageMs: engagedCombatTarget.combatEngagement?.ageMs || 0,
        outOfRangeMs: engagedCombatTarget.combatEngagement?.outOfRangeMs || 0,
        graceRemainingMs: engagedCombatTarget.combatEngagement?.graceRemainingMs || 0
      } : null,
      nearestActive: activeThreats[0] ? {
        id: activeThreats[0].user_id,
        name: activeThreats[0].name,
        distance: Math.round(activeThreats[0].distance),
        speed: Math.round(activeThreats[0].speed),
        moving: Boolean(activeThreats[0].moving),
        firing: isFiringEntity(activeThreats[0]),
        combatIntent: activeThreats[0].combatIntent || '',
        incomingBulletOwnerId: safetyIncomingOwnerId !== null && safetyIncomingOwnerId !== undefined && String(safetyIncomingOwnerId) === String(activeThreats[0].user_id)
          ? String(safetyIncomingOwnerId)
          : '',
        mode: activeThreats[0].current_join_mode || activeThreats[0].mode || '',
        threatRadius: Math.round(activeThreats[0].threatRadius),
        cautionRadius: Math.round(activeThreats[0].cautionRadius),
        returnBlockRadius: Math.round(returnBlockRadius(activeThreats[0])),
        returnBlockExitRadius: Math.round(returnBlockExitRadius(activeThreats[0])),
        returnBlockResumeRadius: Math.round(returnBlockResumeRadius(activeThreats[0]))
      } : null,
      nearestHuman: nearbyHumans[0] ? {
        id: nearbyHumans[0].user_id,
        name: nearbyHumans[0].name,
        distance: Math.round(nearbyHumans[0].distance),
        mode: nearbyHumans[0].current_join_mode
      } : null,
      recovery,
      avoidanceThreats: coinThreats.length,
      activeAvoidanceThreats: avoidanceThreats.length,
      nearbyAvoidanceThreats: nearbyAvoidanceThreats.length,
      nearestAvoidance: coinThreats[0] ? {
        id: coinThreats[0].user_id,
        name: coinThreats[0].name,
        distance: Math.round(coinThreats[0].distance),
        firing: isFiringEntity(coinThreats[0]),
        combatIntent: coinThreats[0].combatIntent || '',
        incomingBulletOwnerId: safetyIncomingOwnerId !== null && safetyIncomingOwnerId !== undefined && String(safetyIncomingOwnerId) === String(coinThreats[0].user_id)
          ? String(safetyIncomingOwnerId)
          : '',
        mode: coinThreats[0].current_join_mode || coinThreats[0].mode || '',
        invulnerable: isInvulnerable(coinThreats[0])
      } : null,
      conservingStamina: isConservingStamina(self)
    };
    const recoveryCombatTarget = defensiveTargetOverridesEngaged(engagedCombatTarget, defensiveCombatTarget)
      ? defensiveCombatTarget
      : (engagedCombatTarget || defensiveCombatTarget);
    const pendingPostAttackWaitTarget = (() => {
      const t = Date.now();
      const waitMs = Math.max(0, Number(cfg.postAttackDropWaitMs || 0));
      return pickPostAttackDropWaitTargetCore(bot.attackHistory, realtimeCoins, coinThreats, {
        nowMs: t,
        self: self,
        dist,
        waitMs,
        minDrop: Math.max(0, Number(cfg.postAttackDropWaitMinDrop ?? cfg.attackMinDrop) || 0),
        resolveMaxMs: Math.max(waitMs, Number(cfg.postAttackDropResolveMaxMs || waitMs) || waitMs),
        maxDistance: Math.max(0, Number(cfg.postAttackDropWaitMaxDistance || cfg.opportunityVisibleDistance || cfg.globalCoinMaxDistance || 0)),
        stopDistance: Math.max(0, Number(cfg.postAttackDropWaitStopDistance || cfg.coinPickupSweepDistance || 0)),
        dropCoinRadius: cfg.postAttackDropCoinRadius,
        resolveAttack: item => postAttackDropResolvedAt(item, entities, t),
        coinBlockedByThreat: (origin, item, threat) => coinBlockedByThreat(origin, item, threat)
      });
    })();
    const highValuePriorityCoin = pickHighValueVisibleCoin(self, realtimeCoins, highValueCoinThreats, {
      ignoreThreats: hpValue(self) >= highValueCoinPriorityHealthyHp()
    });
    const highValuePriorityContext = {
      recovery,
      engagedCombatTarget,
      defensiveCombatTarget,
      activeThreats,
      avoidanceThreats,
      bullets,
      highValuePriorityCoin
    };
    if (!pendingPostAttackWaitTarget
      && highValueVisibleCoinPriorityNeeded(self, highValuePriorityContext)
      && canPrioritizeHighValueVisibleCoin(self, highValuePriorityCoin, highValuePriorityContext)) {
      bot.fleeLock = null;
      bot.returnBlockScan = null;
      if (engagedCombatTarget) clearCombatEngagement('high-value-visible-coin-priority');
      const action = buildCoinAction(self, highValuePriorityCoin, 'high-value-visible-coin-priority');
      action.ignoreReturnBlock = true;
      action.highValueCoinPriority = {
        amount: Number(highValuePriorityCoin.amount || 0),
        minAmount: highValueCoinPriorityAmount(),
        hp: Math.round(hpValue(self)),
        healthyHp: highValueCoinPriorityHealthyHp()
      };
      return action;
    }
    if (recovery && recoveryCombatTarget) {
      const recoveryCombatAction = buildCombatAction(self, recoveryCombatTarget, bullets);
      if (recoveryCombatAction) {
        bot.fleeLock = null;
        bot.returnBlockScan = null;
        return recoveryCombatAction;
      }
      clearCombatEngagement('recovery-hold');
    }
    if (!recovery && defensiveTargetOverridesEngaged(engagedCombatTarget, defensiveCombatTarget)) {
      bot.fleeLock = null;
      bot.returnBlockScan = null;
      return buildCombatAction(self, defensiveCombatTarget, bullets);
    }
    if (!recovery && engagedCombatTarget) {
      bot.fleeLock = null;
      bot.returnBlockScan = null;
      return buildCombatAction(self, engagedCombatTarget, bullets);
    }
    if (fullHp && closeThreats.length) {
      const flee = lockedFleeDirection(self, closeThreats, 'active-threat-before-bullet-range');
      return {
        kind: 'flee',
        reason: 'active-threat-before-bullet-range',
        dx: flee.dx,
        dy: flee.dy,
        locked: flee.locked,
        threats: closeThreats.slice(0, 4).map(e => ({ id: e.user_id, name: e.name, d: Math.round(e.distance), drop: e.drop, speed: Math.round(e.speed), moving: Boolean(e.moving), invulnerable: isInvulnerable(e), r: Math.round(e.threatRadius) }))
      };
    }
    if (fullHp && cautionThreats.length) {
      const flee = lockedFleeDirection(self, cautionThreats, 'active-threat-caution-migration');
      return {
        kind: 'flee',
        reason: 'active-threat-caution-migration',
        dx: flee.dx,
        dy: flee.dy,
        locked: flee.locked,
        threats: cautionThreats.slice(0, 4).map(e => ({ id: e.user_id, name: e.name, d: Math.round(e.distance), drop: e.drop, speed: Math.round(e.speed), moving: Boolean(e.moving), invulnerable: isInvulnerable(e), r: Math.round(e.cautionRadius) }))
      };
    }
    if (!recovery && defensiveCombatTarget) {
      bot.fleeLock = null;
      bot.returnBlockScan = null;
      return buildCombatAction(self, defensiveCombatTarget, bullets);
    }
    const activeCombatWaitThreat = pickActiveCombatWaitThreat(self, activeThreats, bullets);
    if (!recovery && activeCombatWaitThreat) {
      bot.fleeLock = null;
      bot.returnBlockScan = null;
      bot.lastSafety.activeCombatWaitThreat = {
        id: activeCombatWaitThreat.user_id,
        name: activeCombatWaitThreat.name,
        distance: Math.round(activeCombatWaitThreat.distance),
        speed: Math.round(activeCombatWaitThreat.speed),
        moving: Boolean(activeCombatWaitThreat.moving),
        firing: isFiringEntity(activeCombatWaitThreat)
      };
      return activeCombatThreatWaitAction(activeCombatWaitThreat);
    }
    if (!fullHp && closeThreats.length) {
      const flee = lockedFleeDirection(self, closeThreats, 'active-threat-before-bullet-range');
      return {
        kind: 'flee',
        reason: 'active-threat-before-bullet-range',
        dx: flee.dx,
        dy: flee.dy,
        locked: flee.locked,
        threats: closeThreats.slice(0, 4).map(e => ({ id: e.user_id, name: e.name, d: Math.round(e.distance), drop: e.drop, speed: Math.round(e.speed), moving: Boolean(e.moving), r: Math.round(e.threatRadius) }))
      };
    }
    const stamina5s = Number(self.stamina_5s_remaining_milli || 0);
    const nearCoinLimit = recovery
      ? cfg.recoveryCoinMaxDistance
      : cfg.nearCoinPriorityDistance;
    const nearCoin = pickCoin(self, realtimeNearCoins, coinThreats, nearCoinLimit);
    const footCoin = pickCoin(self, realtimeNearCoins, coinThreats, cfg.footCoinPriorityDistance);
    const postAttackCoin = (() => {
      const options = {
      includeSingle: !recovery,
      maxDistance: recovery ? cfg.postAttackRecoveryDropMaxDistance : cfg.postAttackDropCoinMaxDistance,
      minScore: recovery ? cfg.postAttackRecoveryDropMinScore : 0
    };
      const t = Date.now();
      const minAmount = options.includeSingle ? 0 : cfg.postAttackDropCoinMinAmount;
      const maxDistance = Math.max(0, Number(options.maxDistance ?? cfg.postAttackDropCoinMaxDistance) || 0);
      const minScore = Math.max(0, Number(options.minScore ?? 0) || 0);
      const candidateCoins = safeCoinCandidates(realtimeCoins, coinThreats, maxDistance, self)
        .filter(coin => Number(coin.amount || 0) > minAmount)
        .filter(coin => Number.isFinite(Number(coin.distance)))
        .filter(coin => coinStaminaAffordableWithDiagnostic(self, coin));
      const result = pickPostAttackDropCoinCore(bot.attackHistory, candidateCoins, {
        nowMs: t,
        dist,
        priorityMs: cfg.postAttackDropCoinPriorityMs,
        includeSingle: options.includeSingle,
        minAmount,
        maxDistance,
        minScore,
        dropCoinRadius: cfg.postAttackDropCoinRadius,
        resolveAttack: attack => postAttackDropResolvedAt(attack, entities, t),
        scoreCoin: scoreCoinOpportunity
      });
      for (const candidate of result.candidates || []) {
        (() => {
        const dropMatchedKill = buildDropMatchedKillCore(candidate, candidate.amount, summarizeSelf(self), 'post-attack-drop-visible', {
          nowMs: Date.now(),
          seenKillKeys: bot.seenKillKeys,
          sessionId: bot.session?.importantSessionId || '',
          sessionStaminaSpentMs: importantSessionStaminaSpentMs(bot.session),
          coinTargetKey: coinTargetKeyCore
        });
        return dropMatchedKill ? recordKillHistoryItem(dropMatchedKill.kill, dropMatchedKill.seenKey) : null;
      })();
      }
      return result.selected || null;
    })();
    if (postAttackCoin) {
      bot.fleeLock = null;
      if (bot.lastTarget?.kind === 'enemy') {
        bot.lastTarget = null;
        bot.lastTargetAt = 0;
      }
      if (shouldClearOpportunityChoiceCore(bot.opportunityChoice, 'enemy', postAttackCoin.postAttackTarget?.id)) {
        bot.opportunityChoice = null;
        resetOpportunitySwitchLock();
      }
      const action = buildCoinAction(self, postAttackCoin, 'post-attack-drop-coin');
      action.postAttackTarget = postAttackCoin.postAttackTarget;
      return action;
    }
    const postAttackWaitTarget = pendingPostAttackWaitTarget || (() => {
      const t = Date.now();
      const waitMs = Math.max(0, Number(cfg.postAttackDropWaitMs || 0));
      return pickPostAttackDropWaitTargetCore(bot.attackHistory, realtimeCoins, coinThreats, {
        nowMs: t,
        self: self,
        dist,
        waitMs,
        minDrop: Math.max(0, Number(cfg.postAttackDropWaitMinDrop ?? cfg.attackMinDrop) || 0),
        resolveMaxMs: Math.max(waitMs, Number(cfg.postAttackDropResolveMaxMs || waitMs) || waitMs),
        maxDistance: Math.max(0, Number(cfg.postAttackDropWaitMaxDistance || cfg.opportunityVisibleDistance || cfg.globalCoinMaxDistance || 0)),
        stopDistance: Math.max(0, Number(cfg.postAttackDropWaitStopDistance || cfg.coinPickupSweepDistance || 0)),
        dropCoinRadius: cfg.postAttackDropCoinRadius,
        resolveAttack: item => postAttackDropResolvedAt(item, entities, t),
        coinBlockedByThreat: (origin, item, threat) => coinBlockedByThreat(origin, item, threat)
      });
    })();
    if (postAttackWaitTarget) {
      bot.fleeLock = null;
      if (shouldClearOpportunityChoiceCore(bot.opportunityChoice, 'enemy', postAttackWaitTarget.id)) {
        bot.opportunityChoice = null;
        resetOpportunitySwitchLock();
      }
      return buildPostAttackDropWaitAction(self, postAttackWaitTarget);
    }
	    const staminaBudgetExit = summarizeNearestCoinStaminaBudgetExitCore(
	      self,
	      safeCoinCandidates(realtimeCoins, coinThreats, cfg.globalCoinMaxDistance, self),
	      {
	        budget: opportunityWindowStaminaBudget(self, '1h'),
	        dist,
	        coinStaminaCost: opportunityCoinStaminaCost,
	        reloginDelayMs: staminaBudgetReloginDelayMs()
	      }
	    );
	    if (staminaBudgetExit) {
	      bot.fleeLock = null;
	      return staminaBudgetCoinLeaveAction(staminaBudgetExit);
	    }
    if (nearbyAvoidanceThreats.length) {
      const reason = 'avoid-invulnerable-target';
      const flee = lockedFleeDirection(self, nearbyAvoidanceThreats, reason);
      return {
        kind: 'flee',
        reason,
        dx: flee.dx,
        dy: flee.dy,
        locked: flee.locked,
        threats: nearbyAvoidanceThreats.slice(0, 4).map(e => ({ id: e.user_id, name: e.name, d: Math.round(e.distance), mode: e.current_join_mode, drop: e.drop, speed: Math.round(e.speed), invulnerable: isInvulnerable(e) }))
      };
    }

	    if (recovery && nearCoin) {
	      bot.fleeLock = null;
	      const dir = (() => {
      const coinDirectionSelf = self;
      const coinDirectionTarget = nearCoin;
      const coinDirectionDxRaw = Number(coinDirectionTarget.x) - Number(coinDirectionSelf.x);
      const coinDirectionDyRaw = Number(coinDirectionTarget.y) - Number(coinDirectionSelf.y);
      const coinDirectionDistance = hypot(coinDirectionDxRaw, coinDirectionDyRaw);
      const coinDirectionAt = now();
      const coinDirectionId = String(coinDirectionTarget.drop_id ?? coinDirectionTarget.id ?? '');
      const coinDirectionResult = coinDirectionToCore(coinDirectionSelf, coinDirectionTarget, coinMotionCoreOptions(cfg.coinPrecisionTolerance, {
        nowMs: coinDirectionAt,
        lock: bot.coinApproachLock,
        pickupFailureCount: coinPickupFailureCount(coinDirectionId, coinDirectionAt),
        pickupAttemptSlowCount: coinPickupAttemptSlowCount(coinDirectionId, coinDirectionDistance, coinDirectionAt)
      }));
      applyCoinApproachLockUpdate(coinDirectionResult.lockUpdate);
      return coinDirectionResult.direction;
    })();
      return {
        kind: 'coin',
        reason: 'recovery-foot-coin',
        target: { id: nearCoin.drop_id, x: nearCoin.x, y: nearCoin.y, amount: nearCoin.amount, distance: Math.round(dir.distance) },
        dx: dir.dx,
        dy: dir.dy,
        ...coinMotionMetaCore(dir)
      };
    }

			    if (recovery) {
	      bot.fleeLock = null;
	      return {
        kind: 'recover',
        reason: 'wait-for-full-stamina-and-hp',
        dx: 0,
        dy: 0,
        recovery: {
          hp: Number(self.hp || 0),
          stamina5s: Number(self.stamina_5s_remaining_milli || 0),
          stamina5sLimit: Number(self.stamina_5s_limit_milli || 10000)
        }
      };
    }

	    if (!fullHp && cautionThreats.length) {
	      if (footCoin) {
	        bot.fleeLock = null;
	        const dir = (() => {
      const coinDirectionSelf = self;
      const coinDirectionTarget = footCoin;
      const coinDirectionDxRaw = Number(coinDirectionTarget.x) - Number(coinDirectionSelf.x);
      const coinDirectionDyRaw = Number(coinDirectionTarget.y) - Number(coinDirectionSelf.y);
      const coinDirectionDistance = hypot(coinDirectionDxRaw, coinDirectionDyRaw);
      const coinDirectionAt = now();
      const coinDirectionId = String(coinDirectionTarget.drop_id ?? coinDirectionTarget.id ?? '');
      const coinDirectionResult = coinDirectionToCore(coinDirectionSelf, coinDirectionTarget, coinMotionCoreOptions(cfg.coinPrecisionTolerance, {
        nowMs: coinDirectionAt,
        lock: bot.coinApproachLock,
        pickupFailureCount: coinPickupFailureCount(coinDirectionId, coinDirectionAt),
        pickupAttemptSlowCount: coinPickupAttemptSlowCount(coinDirectionId, coinDirectionDistance, coinDirectionAt)
      }));
      applyCoinApproachLockUpdate(coinDirectionResult.lockUpdate);
      return coinDirectionResult.direction;
    })();
        return {
          kind: 'coin',
          reason: 'foot-coin-before-active-caution',
          target: { id: footCoin.drop_id, x: footCoin.x, y: footCoin.y, amount: footCoin.amount, distance: Math.round(dir.distance) },
          dx: dir.dx,
          dy: dir.dy,
          ...coinMotionMetaCore(dir)
        };
      }
      const flee = lockedFleeDirection(self, cautionThreats, 'active-threat-caution-migration');
      return {
        kind: 'flee',
        reason: 'active-threat-caution-migration',
        dx: flee.dx,
        dy: flee.dy,
        locked: flee.locked,
        threats: cautionThreats.slice(0, 4).map(e => ({ id: e.user_id, name: e.name, d: Math.round(e.distance), drop: e.drop, speed: Math.round(e.speed), moving: Boolean(e.moving), r: Math.round(e.cautionRadius) }))
	      };
	    }

			    if (footCoin) {
	      bot.fleeLock = null;
	      const dir = (() => {
      const coinDirectionSelf = self;
      const coinDirectionTarget = footCoin;
      const coinDirectionDxRaw = Number(coinDirectionTarget.x) - Number(coinDirectionSelf.x);
      const coinDirectionDyRaw = Number(coinDirectionTarget.y) - Number(coinDirectionSelf.y);
      const coinDirectionDistance = hypot(coinDirectionDxRaw, coinDirectionDyRaw);
      const coinDirectionAt = now();
      const coinDirectionId = String(coinDirectionTarget.drop_id ?? coinDirectionTarget.id ?? '');
      const coinDirectionResult = coinDirectionToCore(coinDirectionSelf, coinDirectionTarget, coinMotionCoreOptions(cfg.coinPrecisionTolerance, {
        nowMs: coinDirectionAt,
        lock: bot.coinApproachLock,
        pickupFailureCount: coinPickupFailureCount(coinDirectionId, coinDirectionAt),
        pickupAttemptSlowCount: coinPickupAttemptSlowCount(coinDirectionId, coinDirectionDistance, coinDirectionAt)
      }));
      applyCoinApproachLockUpdate(coinDirectionResult.lockUpdate);
      return coinDirectionResult.direction;
    })();
      return attachOpportunisticShot({
        kind: 'coin',
        reason: 'foot-coin-priority',
        target: { id: footCoin.drop_id, x: footCoin.x, y: footCoin.y, amount: footCoin.amount, distance: Math.round(dir.distance) },
        dx: dir.dx,
        dy: dir.dy,
        ...coinMotionMetaCore(dir)
      }, self, realtimeEntities, { recovery });
    }

    const dailyStaminaFinalCoin = pickNearestDailyStaminaFinalCoinCore(
      safeCoinCandidates(realtimeCoins, coinThreats, cfg.globalCoinMaxDistance, self),
      {
        isSnapshotOnlyCoin,
        coinStaminaCost: opportunityCoinStaminaCost,
        dailyStaminaBudgetIsLimiting: staminaCost => dailyStaminaBudgetIsLimitingCore(
          staminaCost,
          opportunityWindowStaminaBudget(self, '1h'),
          opportunityWindowStaminaBudget(self, '1d')
        )
      }
    );
    if (dailyStaminaFinalCoin) {
      bot.fleeLock = null;
      if (shouldClearOpportunityChoiceCore(bot.opportunityChoice, 'coin', null)) {
        bot.opportunityChoice = null;
        resetOpportunitySwitchLock();
      }
      return attachOpportunisticShot(
        dailyStaminaFinalCoinAction(self, dailyStaminaFinalCoin),
        self,
        realtimeEntities,
        { recovery }
      );
    }

    const localRealtimeCoin = pickRealtimeLocalCoin(self, realtimeCoins, coinThreats);
    const fieldCompetitionCoin = stamina5s >= cfg.fieldMigrationStaminaThreshold
      ? pickCoinField(self, realtimeCoins, coinThreats)
      : null;
    const opportunityCoinGroups = [
      { coins: realtimeNearCoins, maxDistance: cfg.coinMaxDistance },
      { coins: realtimeGlobalCoins, maxDistance: cfg.globalCoinMaxDistance },
      { coins: realtimePatrolCoins, maxDistance: cfg.patrolCoinMaxDistance },
      ...(fieldCompetitionCoin ? [{ coins: [fieldCompetitionCoin], maxDistance: cfg.fieldMigrationMaxDistance }] : [])
    ];
    const profitableCombatTarget = pickProfitableCombatTarget(self, combatTargets, bullets, opportunityCoinGroups, coinThreats);
    if (profitableCombatTarget) {
      bot.fleeLock = null;
      bot.returnBlockScan = null;
      return buildCombatAction(self, profitableCombatTarget, bullets);
    }

    const opportunityEnemyGroups = fullHp
      ? [
        realtimeInactiveTargets.filter(isAfkProfitTarget),
        realtimeGlobalTargets.filter(isAfkProfitTarget)
      ]
      : [realtimeInactiveTargets, realtimeGlobalTargets];
    const opportunity = typeof pickBestOpportunityCore === 'function'
      ? pickBestOpportunityCore(self, coinThreats, opportunityCoinGroups, opportunityEnemyGroups, {
        enemyOpportunityCandidates: (candidateSelf, targets, candidateThreats) => {
          const byId = new Map();
          for (const raw of targets) {
            const id = raw?.user_id;
            if (!id && id !== 0) continue;
            const drop = Number(raw.drop ?? dropValue(raw) ?? 0);
            const distance = Number(raw.distance ?? Infinity);
            if (!drop || !Number.isFinite(distance) || distance > cfg.attackApproachRange) continue;
            if (isWhitelistedTarget(raw)) continue;
            if (isInvulnerable(raw)) continue;
            if (!attackWorthTakingCore(candidateSelf, { ...raw, drop }, {
              isWhitelistedTarget,
              dropValue,
              isAfkProfitTarget,
              attackMinAfkDrop: cfg.attackMinAfkDrop,
              attackMinDrop: cfg.attackMinDrop,
              attackMinRewardRatio: cfg.attackMinRewardRatio
            })) continue;
            if (candidateThreats.some(threat => dist(raw, threat) <= cfg.attackDangerRadius)) continue;
            const item = { ...raw, drop, distance };
            const previous = byId.get(String(id));
            if (!previous || item.drop > previous.drop || item.distance < previous.distance || !item.minimapOnly) {
              byId.set(String(id), item);
            }
          }
          return Array.from(byId.values());
        },
        uniqueVisibleRouteCoins: routeCoinGroups => uniqueVisibleRouteCoinsCore(routeCoinGroups, { isSnapshotOnlyCoin, coinKey: coinRouteKey }),
        pickCoinRouteOpportunity: (routeSelf, routeCoins, routeThreats) => pickCoinRouteOpportunityCore(routeSelf, routeCoins, routeThreats, {
          ...coinRouteCoreOptions(routeSelf),
          heldChoice: currentHeldCoinChoice(),
          heldRouteChoice: currentHeldCoinRouteChoice()
        }),
        opportunityCandidateCoreOptions,
        buildCoinAction,
        buildEnemyAction,
        buildMissingHeldOpportunity: (missingSelf, missingThreats, opportunities) => {
          const t = now();
          const result = buildMissingHeldOpportunityCore(bot.opportunityChoice, opportunities, opportunityChoiceCoreOptions({
            nowMs: t,
            self: missingSelf,
            activeThreats: missingThreats,
            missingHoldMs: cfg.opportunityMissingHoldMs ?? cfg.opportunitySwitchHoldMs,
            nativeCoinAuthoritativeRadius: typeof snapshotCoinLocalSuppressRadius === 'function' ? snapshotCoinLocalSuppressRadius() : cfg.nativeCoinAuthoritativeRadius,
            snapshotCoinMaxDistance: cfg.snapshotCoinMaxDistance,
            globalCoinMaxDistance: cfg.globalCoinMaxDistance,
            coinMaxDistance: cfg.coinMaxDistance,
            visibleSourcesConfirmMissing: choice => visibleCoinSourcesConfirmTargetMissing(choice),
            ignoredCoin: id => Boolean(bot.ignoredCoins && typeof bot.ignoredCoins.has === 'function' && bot.ignoredCoins.has(String(id))),
            coinBlockedByThreat: (origin, coin, threat) => {
              const blocked = coinBlockedByThreat(origin, coin, threat);
              if (blocked) recordCoinFilterDiagnostic(coin, 'threat-blocked', { threat: coinThreatDiagnostics(threat) });
              return blocked;
            },
            coinStaminaCost: opportunityCoinStaminaCost,
            coinStaminaAffordable: (origin, coin, staminaCost) => coinStaminaAffordableWithDiagnostic(origin, coin, staminaCost),
            scoreCoinOpportunity,
            priorityTier: opportunityPriorityTier
          }));
          if (result?.clearMissing) {
            clearMissingVisibleCoinTarget(bot.opportunityChoice, result.coin, result.clearReason || 'visible-coin-disappeared', t);
            return null;
          }
          const item = result?.opportunity || null;
          if (!item) return null;
          const coin = result.coin || item.sourceCoin || item;
          const { sourceCoin, ...opportunity } = item;
          return {
            ...opportunity,
            action: () => buildCoinAction(missingSelf, coin, opportunity.reason, opportunity.actionKind === 'seek-coin' ? 'seek-coin' : null)
          };
        },
        chooseStableOpportunity: opportunities => {
          const result = chooseStableOpportunityCore(opportunities, bot.opportunityChoice, bot.opportunitySwitchLock, opportunityChoiceCoreOptions());
          bot.opportunitySwitchLock = result.switchLock;
          return result.chosen;
        },
        rememberOpportunityChoice: (item, action, previous = bot.opportunityChoice) => {
          if (!item) return action;
          const result = rememberOpportunityChoiceCore(item, action, previous, opportunityChoiceCoreOptions());
          bot.opportunityChoice = result.choice;
          return result.action;
        }
      })
      : pickBestOpportunity(
        self,
        coinThreats,
        opportunityCoinGroups,
        opportunityEnemyGroups
      );
    if (opportunity) {
      bot.fleeLock = null;
      return attachOpportunisticShot(opportunity, self, realtimeEntities, { recovery });
    }

    const distantCoin = pickDistantCoin(self, realtimeCoins, coinThreats);
    if (distantCoin) {
      bot.fleeLock = null;
      const dir = (() => {
      const coinDirectionSelf = self;
      const coinDirectionTarget = distantCoin;
      const coinDirectionDxRaw = Number(coinDirectionTarget.x) - Number(coinDirectionSelf.x);
      const coinDirectionDyRaw = Number(coinDirectionTarget.y) - Number(coinDirectionSelf.y);
      const coinDirectionDistance = hypot(coinDirectionDxRaw, coinDirectionDyRaw);
      const coinDirectionAt = now();
      const coinDirectionId = String(coinDirectionTarget.drop_id ?? coinDirectionTarget.id ?? '');
      const coinDirectionResult = coinDirectionToCore(coinDirectionSelf, coinDirectionTarget, coinMotionCoreOptions(cfg.coinPrecisionTolerance, {
        nowMs: coinDirectionAt,
        lock: bot.coinApproachLock,
        pickupFailureCount: coinPickupFailureCount(coinDirectionId, coinDirectionAt),
        pickupAttemptSlowCount: coinPickupAttemptSlowCount(coinDirectionId, coinDirectionDistance, coinDirectionAt)
      }));
      applyCoinApproachLockUpdate(coinDirectionResult.lockUpdate);
      return coinDirectionResult.direction;
    })();
      return attachOpportunisticShot({
        kind: 'seek-coin',
        reason: 'safe-distant-coin',
        target: { id: distantCoin.drop_id, x: distantCoin.x, y: distantCoin.y, amount: distantCoin.amount, distance: Math.round(dir.distance) },
        dx: dir.dx,
        dy: dir.dy,
        ...coinMotionMetaCore(dir)
      }, self, realtimeEntities, { recovery });
    }

    if (localRealtimeCoin) {
      bot.fleeLock = null;
      const action = buildCoinAction(
        self,
        localRealtimeCoin,
        snapshotCoinNavigationReasonCore(localRealtimeCoin, coinTargetCoreOptions()),
        localRealtimeCoin.distance <= cfg.coinMaxDistance ? 'coin' : 'seek-coin'
      );
      return attachOpportunisticShot(blockThreatReturnAction(self, coinThreats, action), self, realtimeEntities, { recovery });
    }

    if (hasReturnBlockThreat(avoidanceThreats)) {
      bot.fleeLock = null;
      return buildReturnBlockScanAction(self, avoidanceThreats, nearbyHumans);
    }

	    bot.fleeLock = null;
	    const shotWait = buildOpportunisticShotWait(self, realtimeEntities, { recovery });
	    if (shotWait) return shotWait;

	    bot.snapshotCoinWaitSince = 0;
	    bot.lastSnapshotCoinWaitAgeMs = 0;
	    const hasRealtimeCoinForBudgetWait = (realtimeCoins || []).some(coin => Number(coin?.amount || 0) > 0);
	    const staminaBlocked = hasRealtimeCoinForBudgetWait
	      ? summarizeBlockedStaminaOpportunityCore(realtimeCoins, [], {
	          budget: opportunityLongStaminaBudget(self),
	          coinStaminaCost: opportunityCoinStaminaCost,
	          enemyStaminaCost: opportunityEnemyStaminaCost,
	          targetDrop: dropValue
	        })
	      : null;
	    const waitReason = staminaBlocked ? 'wait-for-stamina-budget' : 'wait-for-visible-coin-refresh';
	    const sourceSummary = bot.lastCoinSourceSummary || {};
	    const waitDisplay = staminaBlocked
	      ? '长期体力预算不足，预算' + formatDurationMs(staminaBlocked.budgetMs)
	        + '，最近目标需' + formatDurationMs(staminaBlocked.requiredMs)
	        + '，差' + formatDurationMs(staminaBlocked.shortageMs)
	      : '等待视野内金币刷新';
	    return {
	      kind: 'wait',
	      reason: waitReason,
	      dx: 0,
	      dy: 0,
	      displayReason: waitDisplay,
	      staminaBlocked,
	      coinSources: sourceSummary,
	      visibleCoins: {
	        realtime: arrayCount(realtimeCoins),
	        near: arrayCount(realtimeNearCoins),
	        patrol: arrayCount(realtimePatrolCoins),
	        global: arrayCount(realtimeGlobalCoins)
	      },
	      sampling: {
	        snapshotAgeMs: Number.isFinite(snapshotCoinAgeMs()) ? Math.round(snapshotCoinAgeMs()) : null,
	        error: bot.globalState.error || ''
	      }
	    };
  }

  const { postExitDecisionWithoutTargetCore: postExitDecisionWithoutTargetForTickCore } = require('./runtime/exit-motion');
  const { clearEnemyReloginHoldBoundCore: clearEnemyReloginHoldForTickBoundCore, clearOfflineReloginHoldBoundCore: clearOfflineReloginHoldForTickBoundCore, currentOfflineDisplayReasonCore: currentOfflineDisplayReasonForTickCore, enemyReloginHoldRemainingMsBoundCore: enemyReloginHoldRemainingMsForTickBoundCore, injuryLeaveSummaryCore: injuryLeaveSummaryForTickCore, offlineLeaveSummaryCore: offlineLeaveSummaryForTickCore, offlineReloginHoldRemainingMsBoundCore: offlineReloginHoldRemainingMsForTickBoundCore, pursuitLeaveSummaryCore: pursuitLeaveSummaryForTickCore } = require('./runtime/exit-relogin');
  const { pendingExitRetryMsCore: pendingExitRetryMsForTickCore, summarizePendingExitCore: summarizePendingExitForTickCore } = require('./runtime/pending-exit');

  async function tick(source = 'timer') {
    if (!bot.running) return;
    if (bot.ticking) {
      await handleTickReentryCombatGap(source);
      return bot.status();
    }
    bot.ticking = true;
    try {
      const tickStartedAt = Date.now();
      const previousTickAt = Number(bot.lastTickAt || 0) || 0;
      bot.previousTickAt = previousTickAt;
      bot.previousTickSource = bot.lastTickSource || '';
      bot.previousTickCombatActive = Boolean(bot.lastTickCombatActive);
      bot.lastTickGapMs = previousTickAt ? Math.max(0, Math.round(tickStartedAt - previousTickAt)) : null;
      bot.lastTickSource = source;
      bot.lastTickAt = tickStartedAt;
      bot.lastCombatTickGap = null;
      bot.tickCount += 1;
      const cloudflare = cloudflareErrorInfo();
      if (cloudflare) {
        bot.lastDecision = {
          kind: 'wait',
          reason: 'cloudflare-error-refresh',
          dx: 0,
          dy: 0,
          currentUserId: getCurrentUserId(),
          cloudflare,
          displayReason: cloudflare.displayReason,
          holdRemainingMs: cloudflare.remainingMs
        };
        updateBotPanel(bot.lastDecision);
        maybeReloadCloudflareError(cloudflare);
        if (cfg.once) bot.stop('once');
        return;
      }
      if (syncPausedFromPage()) {
        bot.lastDecision = {
          kind: 'idle',
          reason: 'paused',
          dx: 0,
          dy: 0,
          self: bot.lastSelf,
          paused: true,
          pauseReason: bot.pauseReason || 'manual'
        };
        if (cfg.once) bot.stop('once');
        return;
      }
				      const self = getSelf();
      const pendingExitDecision = await handlePendingExit(self);
      if (pendingExitDecision) {
        bot.lastDecision = pendingExitDecision;
        updateBotPanel(bot.lastDecision);
        if (cfg.once) bot.stop('once');
        return;
      }
      const exitMotionLockRemainingMs = exitMotionStopLockRemainingMs();
      if (exitMotionLockRemainingMs > 0) {
        bot.pursuit = null;
        stopMotionSafely(bot.lastExitMotionStopReason || 'exit-motion-stopped');
        refreshGlobalState(false).catch(err => {
          bot.globalState.error = err.message || String(err);
        });
        bot.lastDecision = postExitDecisionWithoutTargetForTickCore({
          kind: 'wait',
          reason: bot.lastExitMotionStopReason || 'exit-motion-stopped',
          dx: 0,
          dy: 0,
          self: self ? summarizeSelf(self) : bot.lastSelf,
          currentUserId: getCurrentUserId(),
          control: summarizeControl(),
          holdRemainingMs: exitMotionLockRemainingMs
        }, bot.lastExitMotionStopReason || 'exit-motion-stopped', { lastExitMotionStopReason: bot.lastExitMotionStopReason, exitMotionLockRemainingMs });
        updateBotPanel(bot.lastDecision);
        if (cfg.once) bot.stop('once');
        return;
      }
	      const enemyHoldControl = summarizeControl();
	      let enemyHoldRemainingMs = enemyReloginHoldRemainingMsForTickBoundCore(bot, localStorage, { loginSuppressKey: LOGIN_SUPPRESS_KEY, loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY, readPersistentExitState, enemyLeaveStateKey: ENEMY_LEAVE_STATE_KEY, now: Date.now });
	      if (enemyHoldRemainingMs > 0 && self && isAlive(self) && enemyHoldControl.wsOpen) {
	        clearEnemyReloginHoldForTickBoundCore(bot, localStorage, 'online self restored during enemy hold', { now: Date.now, activeEnemyLeaveDetail, writePersistentPendingExitState: pending => writePersistentPendingExitStateCore(localStorage, PENDING_EXIT_STATE_KEY, pending || bot.pendingExit, Date.now(), pendingExitPersistenceCoreHelpers()), clearPersistentPendingExitState, clearExitHoldDetail, clearPersistentExitState, loginSuppressKey: LOGIN_SUPPRESS_KEY, loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY, enemyLeaveStateKey: ENEMY_LEAVE_STATE_KEY });
	        enemyHoldRemainingMs = 0;
	      }
		      if (enemyHoldRemainingMs > 0) {
		        const enemyLeaveDetail = activeEnemyLeaveDetail();
		        bot.pursuit = null;
		        stopMotionSafely('enemy-leave-wait');
	        refreshGlobalState(false).catch(err => {
	          bot.globalState.error = err.message || String(err);
	        });
	        bot.lastDecision = {
          kind: 'wait',
          reason: 'enemy-leave-wait',
          dx: 0,
	          dy: 0,
	          self: self ? summarizeSelf(self) : null,
		          currentUserId: getCurrentUserId(),
		          control: enemyHoldControl,
	          holdRemainingMs: enemyLeaveDetail?.holdRemainingMs ?? enemyReloginHoldRemainingMsForTickBoundCore(bot, localStorage, { loginSuppressKey: LOGIN_SUPPRESS_KEY, loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY, readPersistentExitState, enemyLeaveStateKey: ENEMY_LEAVE_STATE_KEY, now: Date.now }),
	          displayReason: enemyLeaveDetail?.displayReason || latestEnemyLeaveDisplayReason(),
	          leave: null,
	          pursuit: enemyLeaveDetail?.pursuit || bot.lastPursuitLeaveResult?.pursuit || null,
	          enemyLeave: {
	            displayReason: enemyLeaveDetail?.displayReason || '',
            summary: enemyLeaveDetail?.summary || '',
            enemyActor: enemyLeaveDetail?.enemyActor || null,
            reloginRepeatCount: enemyLeaveDetail?.reloginRepeatCount || enemyLeaveDetail?.enemyLeaveStreak?.count || 0,
            lastPursuitResult: bot.lastPursuitLeaveResult,
            lastCombatResult: bot.lastCombatLeaveResult,
            lastRetryResult: bot.lastEnemyLeaveRetryResult
          }
        };
        updateBotPanel(bot.lastDecision);
        if (cfg.once) bot.stop('once');
        return;
      }
      const offlineHoldControl = summarizeControl();
      let offlineHoldRemainingMs = offlineReloginHoldRemainingMsForTickBoundCore(bot, localStorage, { loginSuppressKey: LOGIN_SUPPRESS_KEY, loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY, readPersistentExitState, offlineLeaveStateKey: OFFLINE_LEAVE_STATE_KEY, staleOfflineStaminaHoldContradicted, clearOfflineReloginHold: reason => clearOfflineReloginHoldForTickBoundCore(bot, localStorage, reason, { now: Date.now, writePersistentPendingExitState: pending => writePersistentPendingExitStateCore(localStorage, PENDING_EXIT_STATE_KEY, pending || bot.pendingExit, Date.now(), pendingExitPersistenceCoreHelpers()), clearPersistentPendingExitState, clearPersistentExitState, loginSuppressKey: LOGIN_SUPPRESS_KEY, loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY, offlineLeaveStateKey: OFFLINE_LEAVE_STATE_KEY }), now: Date.now });
      if (offlineHoldRemainingMs > 0 && self && isAlive(self) && offlineHoldControl.wsOpen) {
        clearOfflineReloginHoldForTickBoundCore(bot, localStorage, 'online self restored during offline hold', { now: Date.now, writePersistentPendingExitState: pending => writePersistentPendingExitStateCore(localStorage, PENDING_EXIT_STATE_KEY, pending || bot.pendingExit, Date.now(), pendingExitPersistenceCoreHelpers()), clearPersistentPendingExitState, clearPersistentExitState, loginSuppressKey: LOGIN_SUPPRESS_KEY, loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY, offlineLeaveStateKey: OFFLINE_LEAVE_STATE_KEY });
        offlineHoldRemainingMs = 0;
      }
      if (offlineHoldRemainingMs > 0) {
        const offlineLeaveDetail = activeOfflineLeaveDetail();
        bot.pursuit = null;
	        stopMotionSafely('offline-leave-wait');
	        const currentSummary = self && isAlive(self) ? summarizeSelf(self) : (offlineLeaveDetail?.self || bot.lastSelf || null);
	        const offlineSafety = bot.lastOfflineSafety || offlineLeaveDetail?.offlineSafety || (self && isAlive(self) ? assessOfflineSafety(self) : null);
	        refreshGlobalState(false).catch(err => {
	          bot.globalState.error = err.message || String(err);
	        });
        bot.lastDecision = {
          kind: 'wait',
          reason: 'offline-leave-wait',
          dx: 0,
          dy: 0,
          self: currentSummary,
          currentUserId: getCurrentUserId(),
	          control: offlineHoldControl,
	          holdRemainingMs: offlineLeaveDetail?.holdRemainingMs ?? offlineReloginHoldRemainingMsForTickBoundCore(bot, localStorage, { loginSuppressKey: LOGIN_SUPPRESS_KEY, loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY, readPersistentExitState, offlineLeaveStateKey: OFFLINE_LEAVE_STATE_KEY, staleOfflineStaminaHoldContradicted, clearOfflineReloginHold: reason => clearOfflineReloginHoldForTickBoundCore(bot, localStorage, reason, { now: Date.now, writePersistentPendingExitState: pending => writePersistentPendingExitStateCore(localStorage, PENDING_EXIT_STATE_KEY, pending || bot.pendingExit, Date.now(), pendingExitPersistenceCoreHelpers()), clearPersistentPendingExitState, clearPersistentExitState, loginSuppressKey: LOGIN_SUPPRESS_KEY, loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY, offlineLeaveStateKey: OFFLINE_LEAVE_STATE_KEY }), now: Date.now }),
	          displayReason: offlineLeaveDetail?.displayReason || offlineLeaveSummaryForTickCore('offline leave wait', offlineSafety, { staminaBudgetCoinLeaveSummary, staminaExhaustedWindowLabel }),
	          offlineSafety,
	          leave: null,
	          offlineLeave: {
	            displayReason: offlineLeaveDetail?.displayReason || '',
	            summary: offlineLeaveDetail?.summary || '',
	            lastResult: bot.lastOfflineLeaveResult,
	            lastRetryResult: null
	          }
	        };
        updateBotPanel(bot.lastDecision);
        if (cfg.once) bot.stop('once');
        return;
      }
					      if (!self || !isAlive(self)) {
					        if (self && !isAlive(self)) {
					          const unavailableSummary = summarizeSelf(self);
					          updateSessionStats(unavailableSummary);
					          finishImportantCombat('not-alive:' + (unavailableSummary.life || 'unknown'), { at: Date.now(), selfHp: unavailableSummary.hp });
					        } else if (!self && bot.session?.startedAt && !bot.session.missingSince) {
					          bot.session.missingSince = Date.now();
					        }
					        noteSelfUnavailableForPostLoginZoom();
					        bot.pursuit = null;
		        stopMotionSafely('no-self');
		        if (!bot.waitSince) bot.waitSince = Date.now();
	        const control = summarizeControl();
        const noSelfAgeMs = Math.max(0, Date.now() - Number(bot.waitSince || Date.now()));
        const noSelfExit = !self ? noSelfGameSessionExitState(control, noSelfAgeMs) : null;
        const liveSessionTakeover = !self && noSelfExit?.sessionMismatch && noSelfExit?.mismatchTimedOut
          ? liveSessionMismatchTakeoverState(control, noSelfExit)
          : null;
        if (!cfg.dryRun && liveSessionTakeover?.allowed) {
          const recoveryReload = sessionMismatchRecoveryReloadSatisfied(control, noSelfExit);
          if (!recoveryReload) {
            const reload = requestSessionMismatchRecoveryReload(control, noSelfExit, liveSessionTakeover);
            const waitReason = reload?.reason === 'exit-log-flush-pending'
              ? 'exit-log-flush-pending'
              : 'session-mismatch-refresh';
            const displayReason = reload?.displayReason
              || (waitReason === 'exit-log-flush-pending'
                ? '等待退出日志发送完成，暂不刷新确认会话状态'
                : (reload?.reason === 'state-persist-failed'
                  ? '无法记录刷新确认状态，暂不接管'
                  : '界面显示未登录但原生会话仍在线，先刷新页面确认状态'));
            refreshGlobalState(false).catch(err => {
              bot.globalState.error = err.message || String(err);
            });
            bot.lastDecision = {
              kind: 'wait',
              reason: waitReason,
              dx: 0,
              dy: 0,
              currentUserId: getCurrentUserId(),
              control,
              visibleEntities: arrayCount(bot.globalState.entities),
              self: null,
              noSelfAgeMs,
              noSelfGameSession: noSelfExit,
              liveSessionTakeover,
              sessionMismatchRecovery: reload?.state || summarizeSessionMismatchRecoveryStatus(),
              sessionMismatchRecoveryReload: reload || null,
              exitAuditFlush: reload?.exitAuditFlush || null,
              displayReason
            };
            updateBotPanel(bot.lastDecision);
            if (cfg.once) bot.stop('once');
            return;
          }
          const login = await maybeStartAutoLogin('session-mismatch-recovery', {
            force: true,
            ignoreSuppress: true,
            ignoreLoginCooldown: true,
            allowLiveSessionTakeoverBypass: true,
            liveSessionTakeover
          });
          const sessionMismatchWaitReason = login?.attempted
            ? 'auto-login'
            : (login?.reason === 'snapshot-gate'
              ? 'login-snapshot-gate'
              : (login?.reason === 'exit-log-flush-pending'
                ? 'exit-log-flush-pending'
                : (login?.reason === 'important-log-flush-pending'
                  ? 'important-log-flush-pending'
                  : 'session-mismatch-recovery')));
          const sessionMismatchDisplayReason = login?.attempted
            ? '界面显示未登录但原生会话仍在线，已通过接管门禁，正在重登接管'
            : (sessionMismatchWaitReason === 'login-snapshot-gate'
              ? loginSnapshotGateDisplayReason(login?.snapshotGate)
              : (sessionMismatchWaitReason === 'exit-log-flush-pending'
                ? '等待退出日志发送完成，暂不刷新或重新登录'
                : (sessionMismatchWaitReason === 'important-log-flush-pending'
                  ? '等待会话结束日志发送完成，暂不刷新或重新登录'
                  : '界面显示未登录但原生会话仍在线，等待接管')));
          const sessionMismatchLoginPending = Boolean(login?.attempted || (login?.needed && !login?.error));
          refreshGlobalState(false).catch(err => {
            bot.globalState.error = err.message || String(err);
          });
          bot.lastDecision = {
            kind: 'wait',
            reason: sessionMismatchWaitReason,
            dx: 0,
            dy: 0,
            currentUserId: getCurrentUserId(),
            control,
            visibleEntities: arrayCount(bot.globalState.entities),
            self: null,
            noSelfAgeMs,
            noSelfGameSession: noSelfExit,
            liveSessionTakeover,
            sessionMismatchRecovery: recoveryReload || summarizeSessionMismatchRecoveryStatus(),
            login,
            displayReason: sessionMismatchDisplayReason
          };
          updateBotPanel(bot.lastDecision);
          if (!sessionMismatchLoginPending && Date.now() - bot.waitSince > Math.max(10000, Number(cfg.loginCooldownMs || 5000) * 2)) {
            requestReload('session mismatch recovery stalled');
          }
          if (cfg.once) bot.stop('once');
          return;
        }
        if (!noSelfExit?.sessionMismatch && bot.sessionMismatchRecovery) {
          clearSessionMismatchRecoveryState('session mismatch resolved');
        }
        if (!cfg.dryRun && noSelfExit?.shouldLeave) {
	          if (!bot.offlineSince) bot.offlineSince = Date.now();
	          const offlineAgeMs = Math.max(0, Date.now() - Number(bot.offlineSince || Date.now()));
	          const offlineSafety = {
	            unsafe: true,
	            noSelfGameSession: noSelfExit,
	            reconnectChurn: noSelfExit.reconnectChurn,
	            liveSessionTakeover,
	            passiveDangerRadius: Math.max(0, Number(cfg.offlinePassiveDangerRadius || cfg.passivePanicRadius || 0)),
	            nearestHuman: null,
	            nearestActive: null
	          };
	          bot.lastOfflineSafety = offlineSafety;
	          stopMotionSafely(noSelfExit.reconnectChurn ? 'control-ws-reconnect-churn' : 'control-ws-no-self-game-session');
	          const leaveResult = await leaveOffline(noSelfExit.reason, bot.lastSelf, offlineSafety);
	          noteImportantSessionExit(noSelfExit.reason || 'no-self-game-session', bot.lastSelf, Date.now(), { exit: leaveResult });
	          const offlineDetail = activeOfflineLeaveDetail();
	          refreshGlobalState(false).catch(err => {
	            bot.globalState.error = err.message || String(err);
	          });
	          bot.lastDecision = {
	            kind: 'wait',
	            reason: leaveResult?.attempted && !leaveResult?.error
	              ? 'offline-leave'
	              : (noSelfExit.reconnectChurn ? 'control-ws-reconnect-churn' : 'control-ws-no-self-game-session'),
	            dx: 0,
	            dy: 0,
	            currentUserId: getCurrentUserId(),
	            control,
	            visibleEntities: arrayCount(bot.globalState.entities),
	            self: null,
	            offlineAgeMs,
	            noSelfAgeMs,
	            noSelfGameSession: noSelfExit,
	            liveSessionTakeover,
	            offlineSafety,
	            displayReason: currentOfflineDisplayReasonForTickCore(noSelfExit.reason, offlineSafety, leaveResult, offlineDetail, noSelfExit.displayReason, { offlineLeaveSummary: (summaryReason, summarySafety) => offlineLeaveSummaryForTickCore(summaryReason, summarySafety, { staminaBudgetCoinLeaveSummary, staminaExhaustedWindowLabel }) }),
	            leave: leaveResult
	          };
	          updateBotPanel(bot.lastDecision);
	          if (!leaveResult?.attempted && offlineAgeMs > cfg.reloadAfterOfflineMs) {
	            requestReload('game session missing self too long');
	          }
          if (cfg.once) bot.stop('once');
          return;
        }
        const login = await maybeStartAutoLogin(self ? 'not-alive' : 'no-self');
        const gameSessionPending = !self && controlHasNativeGameSession(control);
        const waitReason = login?.attempted
          ? 'auto-login'
          : (login?.needed
            ? (login?.reason === 'snapshot-gate'
              ? 'login-snapshot-gate'
              : (login?.error ? 'login-control-missing' : (login?.reason === 'suppressed' ? 'login-suppressed' : (login?.reason === 'exit-log-flush-pending' ? 'exit-log-flush-pending' : (login?.reason === 'important-log-flush-pending' ? 'important-log-flush-pending' : (login?.reason === 'session-mismatch-recovery' ? 'session-mismatch-recovery' : 'login-cooldown'))))))
            : (noSelfExit?.sessionMismatch ? 'session-mismatch-recovery' : (gameSessionPending ? 'game-session-connecting' : (self ? 'not-alive' : 'no-self'))));
        const loginDisplayReason = waitReason === 'game-session-connecting'
          ? '已登录，等待游戏连接/自身实体'
          : (waitReason === 'session-mismatch-recovery'
            ? '界面显示未登录但原生会话仍在线，等待安全重登'
          : (waitReason === 'exit-log-flush-pending'
            ? '等待退出日志发送完成，暂不刷新或重新登录'
          : (waitReason === 'important-log-flush-pending'
            ? '等待会话结束日志发送完成，暂不刷新或重新登录'
          : (waitReason === 'login-snapshot-gate'
            ? loginSnapshotGateDisplayReason(login?.snapshotGate)
          : (waitReason === 'login-suppressed'
            ? '等待重连：' + (login?.suppressReason || 'login suppressed')
              + (Number(login?.cooldownRemainingMs || 0) > 0 ? '，剩余' + formatDurationMs(login.cooldownRemainingMs) : '')
            : '')))));
		        refreshGlobalState(false).catch(err => {
		          bot.globalState.error = err.message || String(err);
		        });
	        bot.lastDecision = {
	          kind: 'wait',
	          reason: waitReason,
		          displayReason: loginDisplayReason,
	          currentUserId: getCurrentUserId(),
			          control,
			          visibleEntities: arrayCount(bot.globalState.entities),
		          self,
		          noSelfAgeMs,
		          noSelfGameSession: noSelfExit,
	          login
		        };
	        updateBotPanel(bot.lastDecision);
	        const loginPending = Boolean(login?.attempted || (login?.needed && !login?.error));
	        if (!loginPending && Date.now() - bot.waitSince > cfg.reloadAfterNoSelfMs) {
	          requestReload('no self for too long');
        }
        if (cfg.once) bot.stop('once');
        return;
	      }
	      bot.waitSince = 0;
	      const hadPreviousSelf = Boolean(bot.lastSelf);
	      const previousHp = Number(bot.lastSelf?.hp ?? NaN);
	      const previousDrop = Number(bot.lastSelf?.drop ?? 0);
	      const previousCoins = Number(bot.lastSelf?.coins ?? 0);
	      const currentSummary = summarizeSelf(self);
	      observeNetworkQualitySelf(currentSummary);
	      if (bot.sessionMismatchRecovery) clearSessionMismatchRecoveryState('self restored');
      updateSessionStats(currentSummary);
      const staminaState = currentSummary.stamina || summarizeStamina(self);
      maybeRecordLoginPoint(currentSummary);
      const deferredStaminaLeave = deferredStaminaExhaustionLeave(staminaState);
      if (deferredStaminaLeave) {
        stopMotionSafely('stamina-sample-wait');
        bot.lastDecision = {
          kind: 'wait',
          reason: 'game-session-connecting',
          dx: 0,
          dy: 0,
          control: summarizeControl(),
          self: currentSummary,
          stamina: staminaState,
          staminaExhaustionDeferred: deferredStaminaLeave,
          displayReason: '已登录，等待有效体力数据'
        };
        updateBotPanel(bot.lastDecision);
        if (cfg.once) bot.stop('once');
        return;
      }
      schedulePostLoginZoomOut(currentSummary);
		      const currentHp = Number(currentSummary.hp ?? NaN);
      if (staminaState.mustLeave && !bot.pendingExit) {
        bot.pursuit = null;
        bot.lastSelf = currentSummary;
        updateKillHistory(self);
        updateSessionStats(currentSummary);
        stopMotionSafely('stamina-exhausted');
        if (!bot.offlineSince) bot.offlineSince = Date.now();
        const offlineAgeMs = Date.now() - bot.offlineSince;
        const offlineSafety = {
          ...assessOfflineSafety(self),
          staminaExhausted: staminaState
        };
        bot.lastOfflineSafety = offlineSafety;
        const staminaDisplayReason = offlineLeaveSummaryForTickCore('stamina exhausted', offlineSafety, { staminaBudgetCoinLeaveSummary, staminaExhaustedWindowLabel });
        const leaveResult = await leaveOffline('stamina exhausted', currentSummary, offlineSafety);
        const offlineDetail = activeOfflineLeaveDetail();
        bot.lastDecision = {
          kind: 'wait',
          reason: leaveResult?.attempted && !leaveResult?.error ? 'stamina-exhausted-leave' : 'control-stamina-exhausted',
          dx: 0,
          dy: 0,
          control: summarizeControl(),
          self: currentSummary,
          offlineAgeMs,
          leaveDelayMs: 0,
          stamina: staminaState,
          offlineSafety,
          displayReason: currentOfflineDisplayReasonForTickCore('stamina exhausted', offlineSafety, leaveResult, offlineDetail, staminaDisplayReason, { offlineLeaveSummary: (summaryReason, summarySafety) => offlineLeaveSummaryForTickCore(summaryReason, summarySafety, { staminaBudgetCoinLeaveSummary, staminaExhaustedWindowLabel }) }),
          leave: leaveResult
        };
        updateBotPanel(bot.lastDecision);
        if (!leaveResult?.attempted && offlineAgeMs > cfg.reloadAfterOfflineMs) {
          requestReload('stamina exhausted too long');
        }
        if (cfg.once) bot.stop('once');
        return;
      }
      let coinMarked = false;
      if (hadPreviousSelf) {
        coinMarked = markCoinCollected(self, currentSummary, previousCoins);
        if (!coinMarked) {
          coinMarked = recordIncidentalCoinPickups(self, currentSummary, bot.lastSelf, previousCoins);
        }
      } else {
        (() => {
      const rememberedSnapshot = null;
      const nextSnapshot = Array.isArray(rememberedSnapshot)
        ? rememberedSnapshot
        : (() => {
      const nativeCoinList = getNativeCoinList();
      if (!Array.isArray(nativeCoinList)) return null;
      const nativeSnapshotCoins = nativeCoinList
        .map(coin => normalizeCoinDrop(coin, 'native'))
        .filter(Boolean);
      return buildNativeCoinSnapshotCore(nativeSnapshotCoins, coinTargetCoreOptions({ nowMs: Date.now() }));
    })();
      if (Array.isArray(nextSnapshot)) bot.lastNativeCoinSnapshot = nextSnapshot.slice(-160);
      return nextSnapshot;
    })();
      }
	      if (!coinMarked && Number(currentSummary.drop || 0) > previousDrop) {
	        clearCoinTracking('drop-increased');
	      }
	      bot.lastSelf = currentSummary;
	      updateKillHistory(self);
      if (hadPreviousSelf && Number.isFinite(previousHp) && Number.isFinite(currentHp) && currentHp > 0 && previousHp > currentHp) {
        bot.pendingInjuryLeave = {
          at: Date.now(),
          previousHp,
          currentHp,
          lostHp: Math.max(0, previousHp - currentHp),
          self: currentSummary,
          incomingBullet: bot.lastDecision?.incomingBullet || null,
          nearestActive: bot.lastSafety?.nearestActive || null,
          nearestHuman: bot.lastSafety?.nearestHuman || null
        };
        rememberLoginPointDamageThreat(bot.pendingInjuryLeave, 'self-hp-drop');
      }
	      ensureControlWs();
      const serverPositionStall = assessServerPositionStall(self);
      const serverPositionStallOffline = Boolean(cfg.serverPositionStallOfflineEnabled && serverPositionStall?.stalled);
      const actionSettlementStall = assessActionSettlementStall(self, bot.lastDecision);
      const actionSettlementStallOffline = Boolean(cfg.actionSettlementStallOfflineEnabled && actionSettlementStall?.stalled);
      const reconnectChurn = Boolean(bot.control.nativeReconnectChurn);
	      const reconnectChurnDetail = reconnectChurn ? {
	        count: Number(bot.control.nativeReconnectEventCount || 0),
	        windowMs: Number(bot.control.nativeReconnectWindowMs || cfg.offlineReconnectChurnWindowMs || 0)
	      } : null;
      const samplingOutage = globalSamplingOutageOfflineState(self);
      const combatTickGap = combatTickGapOfflineState(self, { source });
      bot.lastCombatTickGap = combatTickGap;
      const controlOffline = !bot.control.wsOpen || serverPositionStallOffline || actionSettlementStallOffline || reconnectChurn || Boolean(samplingOutage) || Boolean(combatTickGap);
      const pendingExitAlive = Boolean(bot.pendingExit && self && isAlive(self));
		    if (!cfg.dryRun && controlOffline && !pendingExitAlive) {
		      bot.pursuit = null;
		      stopMotionSafely(samplingOutage ? 'global-sampling-outage' : (combatTickGap ? 'combat-tick-gap' : (actionSettlementStallOffline ? 'action-settlement-stalled' : (serverPositionStallOffline ? 'server-position-stalled' : (reconnectChurn ? 'control-ws-reconnect-churn' : 'control-ws-offline')))));
		      if (!bot.offlineSince) bot.offlineSince = Date.now();
		      const offlineAgeMs = Date.now() - bot.offlineSince;
        const offlineSafety = {
          ...assessOfflineSafety(self),
          reconnectChurn: reconnectChurnDetail,
          actionSettlementStall,
          samplingOutage,
          combatTickGap
        };
        bot.lastOfflineSafety = offlineSafety;
        const safeLeaveMs = Math.min(3000, Math.max(0, Number(cfg.offlineSafeLeaveMs ?? cfg.offlineLeaveMs ?? 3000)));
        const unsafeLeaveMs = Math.max(0, Number(cfg.offlineUnsafeLeaveMs ?? 0));
        const leaveDelayMs = reconnectChurn || samplingOutage || combatTickGap ? 0 : (offlineSafety.unsafe ? unsafeLeaveMs : safeLeaveMs);
        const offlineLeaveReason = samplingOutage
          ? 'global sampling outage'
          : (combatTickGap
            ? 'combat tick gap'
            : (actionSettlementStallOffline
              ? 'action settlement stalled'
              : (serverPositionStallOffline ? 'server position stalled' : (reconnectChurn ? 'websocket reconnect churn' : 'websocket offline'))));
        const leaveResult = offlineAgeMs >= leaveDelayMs
			        ? await leaveOffline(offlineLeaveReason, currentSummary, offlineSafety)
			        : null;
        const offlineDetail = activeOfflineLeaveDetail();
        const offlineWaitReason = leaveResult?.attempted && !leaveResult?.error
          ? 'offline-leave'
          : (samplingOutage
            ? 'control-global-sampling-outage'
          : (combatTickGap
            ? 'control-combat-tick-gap'
          : (actionSettlementStallOffline
            ? 'control-action-settlement-stalled'
          : (serverPositionStallOffline
            ? 'control-ws-server-position-stalled'
            : (reconnectChurn
              ? 'control-ws-reconnect-churn'
              : (offlineSafety.unsafe ? 'control-ws-offline-unsafe' : 'control-ws-offline-safe-wait'))))));
	        bot.lastDecision = {
	          kind: 'wait',
	          reason: offlineWaitReason,
	          control: summarizeControl(),
	          self: summarizeSelf(self),
	          offlineAgeMs,
          leaveDelayMs,
          offlineSafety,
          reconnectChurn: reconnectChurnDetail,
          actionSettlementStall,
          serverPositionStall,
          samplingOutage,
          combatTickGap,
	          displayReason: currentOfflineDisplayReasonForTickCore(offlineLeaveReason, offlineSafety, leaveResult, offlineDetail, (samplingOutage ? '网络采样超时，正在退出' : (combatTickGap ? '战斗主循环断档，正在退出' : (actionSettlementStallOffline ? '动作结算卡死，正在退出' : (reconnectChurn ? '网络连接反复重连，正在退出' : '')))), { offlineLeaveSummary: (summaryReason, summarySafety) => offlineLeaveSummaryForTickCore(summaryReason, summarySafety, { staminaBudgetCoinLeaveSummary, staminaExhaustedWindowLabel }) }),
	          leave: leaveResult
	        };
	        updateBotPanel(bot.lastDecision);
	        if (!leaveResult?.attempted && offlineAgeMs > cfg.reloadAfterOfflineMs) {
	          requestReload(samplingOutage ? 'global sampling outage too long' : (combatTickGap ? 'combat tick gap too long' : (actionSettlementStallOffline ? 'action settlement stalled too long' : 'websocket offline too long')));
	        }
        if (cfg.once) bot.stop('once');
        return;
      }
      bot.offlineSince = 0;
      if (!serverPositionStall?.active) resetServerPositionStall('online');
      refreshGlobalState(false).catch(err => {
        bot.globalState.error = err.message || String(err);
      });

      const pendingCombatLeave = pendingCombatLeaveAction();
      if (pendingCombatLeave) {
        bot.pursuit = null;
        sendActionVelocity(pendingCombatLeave);
        if (pendingCombatLeave.shoot && pendingCombatLeave.target) {
          shootAt(self, pendingCombatLeave.aimTarget || pendingCombatLeave.target, Boolean(pendingCombatLeave.forceShoot), { shootEveryMs: pendingCombatLeave.shootEveryMs });
        }
        const leaveResult = await leaveForCombat(pendingCombatLeave, currentSummary);
        const leaveIssued = Boolean(leaveResult?.attempted && !leaveResult?.error);
        const enemyDetail = activeEnemyLeaveDetail();
        bot.lastDecision = {
          kind: 'wait',
          reason: leaveIssued ? 'combat-leave' : 'combat-leave-retry',
          dx: pendingCombatLeave.dx,
          dy: pendingCombatLeave.dy,
          self: currentSummary,
          target: pendingCombatLeave.target || null,
          combat: true,
          shoot: Boolean(pendingCombatLeave.shoot),
          forceShoot: Boolean(pendingCombatLeave.forceShoot),
          aimTarget: pendingCombatLeave.aimTarget || null,
          combatCover: pendingCombatLeave.combatCover || null,
          combatState: pendingCombatLeave.combatState || null,
          pendingCombatLeave: summarizePendingCombatLeave(),
          displayReason: leaveResult?.displayReason || enemyDetail?.displayReason || pendingCombatLeave.displayReason || pendingCombatLeave.exitSummary || '',
          leave: leaveResult,
          holdRemainingMs: enemyDetail?.holdRemainingMs ?? enemyReloginHoldRemainingMsForTickBoundCore(bot, localStorage, { loginSuppressKey: LOGIN_SUPPRESS_KEY, loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY, readPersistentExitState, enemyLeaveStateKey: ENEMY_LEAVE_STATE_KEY, now: Date.now })
        };
        updateBotPanel(bot.lastDecision);
        if (cfg.once) bot.stop('once');
        return;
      }

      let action = attachCoinDiagnostics(chooseAction(self));
	      action = blockThreatReturnAction(self, bot.actionThreats || [], action);
      if (bot.pendingInjuryLeave && isCombatStateForInjuryLeave(action)) {
        action = {
          ...action,
          injury: {
            ...bot.pendingInjuryLeave,
            self: currentSummary,
            currentHp,
            suppressedByCombat: true,
            suppressedReason: 'combat-state'
          }
        };
        bot.pendingInjuryLeave = null;
      }
	      if (action.kind === 'leave' && action.combat) {
	        sendActionVelocity(action);
	        if (action.shoot && action.target) {
	          shootAt(self, action.aimTarget || action.target, Boolean(action.forceShoot), { shootEveryMs: action.shootEveryMs });
	        }
        const leaveResult = await leaveForCombat(action, currentSummary);
        const leaveIssued = Boolean(leaveResult?.attempted && !leaveResult?.error);
        const enemyDetail = activeEnemyLeaveDetail();
        bot.lastDecision = leaveIssued
          ? {
            ...action,
            displayReason: leaveResult?.displayReason || enemyDetail?.displayReason || action.displayReason || action.exitSummary || '',
            leave: leaveResult,
            source,
            self: summarizeSelf(self)
          }
          : {
            kind: 'wait',
            reason: 'combat-leave-retry',
            dx: 0,
            dy: 0,
            self: currentSummary,
            source,
            target: action.target || null,
            combat: true,
            combatState: action.combatState || null,
            pendingCombatLeave: summarizePendingCombatLeave(),
            displayReason: leaveResult?.displayReason || enemyDetail?.displayReason || action.displayReason || action.exitSummary || '',
            leave: leaveResult,
            holdRemainingMs: enemyDetail?.holdRemainingMs ?? enemyReloginHoldRemainingMsForTickBoundCore(bot, localStorage, { loginSuppressKey: LOGIN_SUPPRESS_KEY, loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY, readPersistentExitState, enemyLeaveStateKey: ENEMY_LEAVE_STATE_KEY, now: Date.now })
          };
        updateBotPanel(bot.lastDecision);
	        if (cfg.once) bot.stop('once');
	        return;
	      }
	      if (action.kind === 'leave') {
	        const offlineSafety = {
	          ...assessOfflineSafety(self),
	          staminaBudgetExit: action.staminaBudgetExit || null
	        };
	        const skippedLeave = pendingExitSkipNewLeave('offline', action.reason || 'stamina budget coin leave', {
	          self: currentSummary,
	          offlineSafety,
	          summary: action.displayReason || offlineLeaveSummaryForTickCore(action.reason || 'stamina budget coin leave', offlineSafety, { staminaBudgetCoinLeaveSummary, staminaExhaustedWindowLabel })
	        });
	        if (skippedLeave) {
	          bot.lastDecision = {
	            ...action,
	            kind: 'wait',
	            reason: 'pending-exit-active',
	            dx: 0,
	            dy: 0,
	            source,
	            control: summarizeControl(),
	            self: currentSummary,
	            offlineSafety,
	            displayReason: skippedLeave.displayReason || action.displayReason || '',
	            leave: skippedLeave,
	            pendingExit: (() => {
        const pendingExitSummaryPending = bot.pendingExit;
        if (!pendingExitSummaryPending) return null;
        const pendingExitSummaryNow = Date.now();
        const pendingExitSummaryReload = normalizePendingExitReloadConfirmationCore(pendingExitSummaryPending.reloadConfirmation, pendingExitSummaryPending, pendingExitSummaryNow);
        return summarizePendingExitForTickCore(pendingExitSummaryPending, {
          nowMs: pendingExitSummaryNow,
          retryMs: pendingExitRetryMsForTickCore(pendingExitSummaryPending, {
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
	          updateBotPanel(bot.lastDecision);
	          if (cfg.once) bot.stop('once');
	          return;
	        }
	        bot.pursuit = null;
	        stopMotionSafely(action.reason || 'leave');
	        bot.lastOfflineSafety = offlineSafety;
	        const leaveResult = await leaveOffline(action.reason || 'stamina budget coin leave', currentSummary, offlineSafety);
	        const leaveIssued = Boolean(leaveResult?.attempted && !leaveResult?.error);
	        const offlineDetail = activeOfflineLeaveDetail();
	        bot.lastDecision = {
	          ...action,
	          kind: 'wait',
	          reason: leaveIssued ? action.reason : (action.reason ? action.reason + '-retry' : 'leave-retry'),
	          dx: 0,
	          dy: 0,
	          source,
	          control: summarizeControl(),
	          self: currentSummary,
	          offlineSafety,
	          displayReason: currentOfflineDisplayReasonForTickCore(action.reason || 'stamina budget coin leave', offlineSafety, leaveResult, offlineDetail, action.displayReason || '', { offlineLeaveSummary: (summaryReason, summarySafety) => offlineLeaveSummaryForTickCore(summaryReason, summarySafety, { staminaBudgetCoinLeaveSummary, staminaExhaustedWindowLabel }) }),
	          leave: leaveResult,
	          holdRemainingMs: offlineDetail?.holdRemainingMs ?? offlineReloginHoldRemainingMsForTickBoundCore(bot, localStorage, { loginSuppressKey: LOGIN_SUPPRESS_KEY, loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY, readPersistentExitState, offlineLeaveStateKey: OFFLINE_LEAVE_STATE_KEY, staleOfflineStaminaHoldContradicted, clearOfflineReloginHold: reason => clearOfflineReloginHoldForTickBoundCore(bot, localStorage, reason, { now: Date.now, writePersistentPendingExitState: pending => writePersistentPendingExitStateCore(localStorage, PENDING_EXIT_STATE_KEY, pending || bot.pendingExit, Date.now(), pendingExitPersistenceCoreHelpers()), clearPersistentPendingExitState, clearPersistentExitState, loginSuppressKey: LOGIN_SUPPRESS_KEY, loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY, offlineLeaveStateKey: OFFLINE_LEAVE_STATE_KEY }), now: Date.now })
	        };
	        updateBotPanel(bot.lastDecision);
	        if (cfg.once) bot.stop('once');
	        return;
	      }
	      if (bot.pendingInjuryLeave) {
	        const injury = {
	          ...bot.pendingInjuryLeave,
	          self: currentSummary,
	          currentHp,
	          nearestActive: bot.lastSafety?.nearestAvoidance || bot.lastSafety?.nearestActive || bot.pendingInjuryLeave.nearestActive || null,
	          nearestHuman: bot.lastSafety?.nearestHuman || bot.pendingInjuryLeave.nearestHuman || null
	        };
	        bot.pendingInjuryLeave = null;
	        const skippedLeave = pendingExitSkipNewLeave('injury', 'injury hp drop', {
	          injury,
	          summary: injuryLeaveSummaryForTickCore(injury, { actorLabel, hpDisplay })
	        });
	        if (!skippedLeave) {
	          Promise.resolve(leaveForInjury(injury)).catch(err => recordUnhandledTickError('injury-leave', err));
	        }
	        action = {
	          ...action,
	          injury: skippedLeave ? { ...injury, suppressedByPendingExit: true } : injury,
	          pendingExitIntent: skippedLeave
	            ? pendingExitIntentForSkippedLeave('injury', 'injury hp drop', skippedLeave)
	            : {
	              reason: 'injury-leave',
	              summary: injuryLeaveSummaryForTickCore(injury, { actorLabel, hpDisplay })
	            }
	        };
	      }
		      action = attachCoinDiagnostics(applyCoinProgressAction(action, self));
      const escape = bot.staleCoinEscape;
      const escapeActive = escape && now() < Number(escape.until || 0) && (escape.dx || escape.dy);
      if (escapeActive && action.kind !== 'flee') {
        action = {
          ...action,
          kind: 'patrol',
          reason: action.reason && String(action.reason).startsWith('ignore-') ? action.reason : 'leave-stale-coin',
          dx: escape.dx,
          dy: escape.dy,
          staleCoinEscape: {
            id: escape.id,
            remainingMs: Math.max(0, Math.round(Number(escape.until || 0) - now()))
          }
        };
      } else if (!escapeActive) {
        bot.staleCoinEscape = null;
      }
      action = blockThreatReturnAction(self, bot.actionThreats || [], action);
      const pursuit = updatePursuitTracking(self, bot.actionThreats || [], action);
      const pursuitSummary = summarizePursuit(pursuit);
	      if (pursuitSummary && pursuitSummary.durationMs >= Math.max(0, Number(pursuitSummary.thresholdMs || cfg.pursuitLeaveMs))) {
	        const skippedLeave = pendingExitSkipNewLeave('pursuit', 'sustained pursuit', {
	          self: currentSummary,
	          pursuit: pursuitSummary,
	          summary: pursuitLeaveSummaryForTickCore(pursuitSummary, { actorLabel, formatDurationMs, formatDistance })
	        });
	        if (skippedLeave) {
	          action = {
	            ...action,
	            pursuit: pursuitSummary,
	            leave: skippedLeave,
	            pendingExitIntent: pendingExitIntentForSkippedLeave('pursuit', 'sustained pursuit', skippedLeave)
	          };
	        } else {
	        const leaveResult = await leaveForPursuit(pursuit, currentSummary);
	        const enemyDetail = activeEnemyLeaveDetail();
	        stopMotionSafely('pursuit-leave');
        if (leaveResult?.attempted && !leaveResult?.error) {
          bot.lastDecision = {
            kind: 'wait',
            reason: 'pursuit-leave',
            dx: 0,
            dy: 0,
            self: summarizeSelf(self),
            pursuit: pursuitSummary,
            displayReason: leaveResult?.displayReason || enemyDetail?.displayReason || '',
            leave: leaveResult,
            reloginDelayMs: leaveResult.reloginDelayMs,
            holdRemainingMs: enemyDetail?.holdRemainingMs ?? enemyReloginHoldRemainingMsForTickBoundCore(bot, localStorage, { loginSuppressKey: LOGIN_SUPPRESS_KEY, loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY, readPersistentExitState, enemyLeaveStateKey: ENEMY_LEAVE_STATE_KEY, now: Date.now })
          };
          updateBotPanel(bot.lastDecision);
          if (cfg.once) bot.stop('once');
          return;
        }
        bot.lastDecision = {
          kind: 'wait',
          reason: 'pursuit-leave-retry',
          dx: 0,
          dy: 0,
          self: summarizeSelf(self),
          pursuit: pursuitSummary,
          displayReason: leaveResult?.displayReason || enemyDetail?.displayReason || '',
          leave: leaveResult,
          holdRemainingMs: enemyDetail?.holdRemainingMs ?? enemyReloginHoldRemainingMsForTickBoundCore(bot, localStorage, { loginSuppressKey: LOGIN_SUPPRESS_KEY, loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY, readPersistentExitState, enemyLeaveStateKey: ENEMY_LEAVE_STATE_KEY, now: Date.now })
        };
	        updateBotPanel(bot.lastDecision);
	        if (cfg.once) bot.stop('once');
	        return;
	        }
	      } else if (pursuitSummary) {
        action = {
          ...action,
          pursuit: pursuitSummary
        };
	      }
		      action = applyFinalActionArbitration(action, source);
		      action = recordActionSwitchDiagnostics(action, source);
	      const canMove = true;
	      const canAttack = true;
	      if (!isSnapshotCoinWaitAction(action)) {
	        bot.snapshotCoinWaitSince = 0;
	        bot.lastSnapshotCoinWaitAgeMs = 0;
	      }
      sendActionVelocity(action);
      if (action.opportunisticShot) {
        const shotSent = shootAt(self, action.opportunisticShot, false, { shootEveryMs: cfg.opportunisticShootEveryMs });
        if (shotSent) rememberAttack(self, action.opportunisticShot, 'opportunistic-shot', action);
      }
      if (action.kind === 'attack' && action.target) {
        if (action.shoot) {
          shootAt(self, action.aimTarget || action.target, Boolean(action.forceShoot), { shootEveryMs: action.shootEveryMs });
          rememberAttack(self, action.target, action.kind, action);
        }
        setLastTarget('enemy', action.target.id);
        if (action.combat && !action.combatDodgeOnly) rememberCombatEngagement(self, action.target, action);
      } else if (action.kind === 'wait' && action.combat && action.target) {
        setLastTarget('enemy', action.target.id);
        rememberCombatEngagement(self, action.target, action);
      } else if ((action.kind === 'coin' || action.kind === 'seek-coin') && action.target) {
        setLastTarget('coin', action.target.id);
      } else if ((action.kind === 'seek-enemy' || action.kind === 'seek-drop') && action.target) {
        setLastTarget('enemy', action.target.id);
        if (action.combat && !action.combatDodgeOnly) rememberCombatEngagement(self, action.target, action);
        else rememberAttack(self, action.target, action.kind, action);
      } else if (action.kind === 'flee') {
        bot.lastTarget = null;
        bot.lastTargetAt = 0;
        clearCombatEngagement(action.reason || 'flee');
      }
      bot.lastDecision = {
        ...action,
        source,
        pendingExit: (() => {
        const pendingExitSummaryPending = bot.pendingExit;
        if (!pendingExitSummaryPending) return null;
        const pendingExitSummaryNow = Date.now();
        const pendingExitSummaryReload = normalizePendingExitReloadConfirmationCore(pendingExitSummaryPending.reloadConfirmation, pendingExitSummaryPending, pendingExitSummaryNow);
        return summarizePendingExitForTickCore(pendingExitSummaryPending, {
          nowMs: pendingExitSummaryNow,
          retryMs: pendingExitRetryMsForTickCore(pendingExitSummaryPending, {
        leaveRetryMinMs: cfg.leaveRetryMinMs,
        leaveCommandTimeoutMs: cfg.leaveCommandTimeoutMs,
        offlineLeaveRetryMs: cfg.offlineLeaveRetryMs,
        combatLeaveRetryMs: cfg.combatLeaveRetryMs,
        pursuitLeaveRetryMs: cfg.pursuitLeaveRetryMs
      }),
          reloadConfirmation: pendingExitSummaryReload
        });
      })(),
        coinDiagnostics: action.coinDiagnostics || safeJsonClone(bot.coinDiagnostics) || bot.coinDiagnostics || null,
        self: {
          ...summarizeSelf(self),
          canMove,
          canAttack
        }
      };
      updateBotPanel(bot.lastDecision);

	      if (cfg.statusEvery > 0 && Date.now() - bot.lastStatusAt >= cfg.statusEvery) {
	        bot.lastStatusAt = Date.now();
	        console.log('[grasp-rat-bot:status]', safeStringify(bot.lastDecision));
	      }

	      if (cfg.once) bot.stop('once');
		    } catch (err) {
		      recordUnhandledTickError(source, err);
		      try {
		        stopMotionSafely('bot-error');
		      } catch (stopErr) {
		        recordUnhandledTickError(source + ':stop-motion', stopErr);
		      }
		      bot.lastDecision = {
		        kind: 'wait',
		        reason: 'bot-error',
		        dx: 0,
		        dy: 0,
		        self: bot.lastSelf,
		        error: err?.message || String(err)
		      };
		      try {
		        updateBotPanel(bot.lastDecision);
		      } catch (panelErr) {
		        recordUnhandledTickError(source + ':error-panel', panelErr);
		      }
		      try {
		        console.error('[grasp-rat-bot:error]', err);
		      } catch (_) {}
		    } finally {
		      try {
		        recordImportantCombatTick(source, bot.lastDecision);
		      } catch (importantErr) {
		        try {
		          bot.importantLogging.localWriteError = 'combat summary failed: ' + (importantErr?.message || String(importantErr));
		        } catch (_) {}
		      }
		      try {
		        recordCombatLogTick(source, bot.lastDecision);
		      } catch (logErr) {
		        try {
		          bot.combatLogging.lastError = 'record failed: ' + (logErr?.message || String(logErr));
		        } catch (_) {}
		      }
		      try {
		        bot.lastTickCombatActive = combatTickActiveFromState({
		          decision: bot.lastDecision,
		          combatTarget: bot.combatTarget,
		          pendingExit: bot.pendingExit || bot.pendingCombatLeave,
		          nowMs: Date.now()
		        });
		      } catch (_) {
		        bot.lastTickCombatActive = false;
		      }
		      bot.lastTickCompletedAt = Date.now();
		      bot.ticking = false;
		    }
		  }

	  restorePersistedExitAuditLogs();
	  restorePersistedCombatLogPendingEntries();
	  restoreImportantLogsForRemote();
	  installNativeLoginGateInterceptors();

	  installPageGlobal(BOT_KEY, bot, pageGlobal);
		  if (previousBot && previousBot !== bot && previousBot.stop) {
		    try {
		      previousBot.stop('replaced by ' + cfg.version);
	    } catch (err) {
		      console.warn('[grasp-rat-bot] previous stop failed', err);
		    }
		  }
		  installPageNativeSnapshotObserver();
		  startTargetWhitelistPolling();

			  return refreshGlobalState(true)
		    .catch(err => {
		      bot.globalState.error = err?.message || String(err);
		      recordUnhandledTickError('startup-refresh', err);
		    })
		    .then(() => tick('startup'))
		    .then(() => {
		      bot.starting = false;
		      if (!cfg.once && bot.running) {
		        bot.timer = setInterval(() => {
		          runTickSafely('timer');
		        }, cfg.tickMs);
		      }
		      logStatus(cfg.dryRun ? 'started dry-run' : 'started live control');
		      return bot.status();
		    })
		    .catch(err => {
		      recordUnhandledTickError('startup-finalize', err);
		      bot.starting = false;
		      bot.ticking = false;
		      try {
		        stopMotionSafely('startup-error');
		      } catch (stopErr) {
		        recordUnhandledTickError('startup-finalize:stop-motion', stopErr);
		      }
		      if (!bot.lastDecision) {
		        bot.lastDecision = {
		          kind: 'wait',
		          reason: 'startup-error',
		          dx: 0,
		          dy: 0,
		          self: bot.lastSelf,
		          error: err?.message || String(err)
		        };
		      }
		      try {
		        updateBotPanel(bot.lastDecision);
		      } catch (panelErr) {
		        recordUnhandledTickError('startup-finalize:panel', panelErr);
		      }
		      try {
		        if (!cfg.once && bot.running && !bot.timer) {
		          bot.timer = setInterval(() => {
		            runTickSafely('timer');
		          }, cfg.tickMs);
		        }
		      } catch (timerErr) {
		        recordUnhandledTickError('startup-finalize:timer', timerErr);
		      }
		      try {
		        return bot.status();
		      } catch (statusErr) {
		        recordUnhandledTickError('startup-finalize:status', statusErr);
		        return { running: Boolean(bot.running), starting: Boolean(bot.starting), error: err?.message || String(err) };
		      }
		    });
})();

module.exports = __graspRatRuntimeStartup;
module.exports.default = __graspRatRuntimeStartup;
