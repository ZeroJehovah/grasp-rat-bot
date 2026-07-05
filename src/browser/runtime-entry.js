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
const {
    reloginDelayForHpCore,
    unsafeExitReloginMinDelayMsCore
  } = require('./runtime/exit-relogin');
const {
    staminaExhaustedWindowLabel
  } = require('./runtime/exit-summary');

  const unsafeExitReloginMinDelayMs = () => unsafeExitReloginMinDelayMsCore(cfg);

  function exitMotionStopLockRemainingMs(t = Date.now()) {
    return exitMotionStopLockRemainingMsCore(bot.lastExitMotionStopAt, cfg.exitMotionStopLockMs, t);
  }

  function clearPostExitTargetState(reason = 'exit-confirmed') {
    const exitMotionLockRemainingMs = exitMotionStopLockRemainingMs();
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
  let handleTickReentryCombatGap;
  let classify;
  let chooseAction;
  let tick;
  let threatKey;
  let returnBlockRadius;


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
  let finishImportantCombat;
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
  let clearSessionMismatchRecoveryState;
  let sessionMismatchRecoveryReloadSatisfied;
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
  let rememberLoginPointDamageThreat;
  let maybeRecordLoginPoint;
  let snapshotLoginGateStatus;
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
  let clearExitHoldDetail;

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
    clearSessionMismatchRecoveryState,
    sessionMismatchRecoveryReloadSatisfied,
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
    rememberLoginPointDamageThreat,
    maybeRecordLoginPoint,
    snapshotLoginGateStatus,
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
    leaveDuringEnemyHold,
    clearExitHoldDetail
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

  function getOwnEntity() {
    try {
      return typeof getSelf === 'function' ? getSelf() : null;
    } catch (_) {
      return null;
    }
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
    finishImportantCombat,
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
    buildCombatAction,
    handleTickReentryCombatGap
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

  const { createOrchestrationRuntime } = require('./runtime/orchestration-runtime');
  const orchestrationRuntime = createOrchestrationRuntime({
    BOT_KEY,
    ENEMY_LEAVE_STATE_KEY,
    LOGIN_SUPPRESS_KEY,
    LOGIN_SUPPRESS_REASON_KEY,
    OFFLINE_LEAVE_STATE_KEY,
    PENDING_EXIT_STATE_KEY,
    activeCombatThreatWaitAction,
    activeEnemyLeaveDetail,
    activeOfflineLeaveDetail,
    actorLabel,
    applyCoinApproachLockUpdate,
    applyCoinProgressAction,
    applyFinalActionArbitration,
    arrayCount,
    assessActionSettlementStall,
    assessOfflineSafety,
    assessServerPositionStall,
    attachCoinDiagnostics,
    attachOpportunisticShot,
    attackWorthTakingCore,
    bot,
    buildCoinAction,
    buildCoinDiagnostics,
    buildCombatAction,
    buildDropMatchedKillCore,
    buildEnemyAction,
    buildMissingHeldOpportunityCore,
    buildNativeCoinSnapshotCore,
    buildNativeEntityMeta,
    buildOpportunisticShotWait,
    buildPostAttackDropWaitAction,
    canPrioritizeHighValueVisibleCoin,
    cfg,
    chooseStableOpportunityCore,
    clearCoinTracking,
    clearCombatEngagement,
    clearExitHoldDetail,
    clearMissingVisibleCoinTarget,
    clearPersistentExitState,
    clearPersistentPendingExitState,
    clearSessionMismatchRecoveryState,
    cloudflareErrorInfo,
    coinBlockedByThreat,
    coinDiagnosticsLimit,
    coinDiagnosticsNearDistance,
    coinDirectionToCore,
    coinMotionCoreOptions,
    coinMotionMetaCore,
    coinPickupAttemptSlowCount,
    coinPickupFailureCount,
    coinRouteCoreOptions,
    coinRouteKey,
    coinStaminaAffordableWithDiagnostic,
    coinTargetCoreOptions,
    coinTargetKeyCore,
    coinThreatDiagnostics,
    combatDodgeOnlyCandidateRange,
    combatHpValue,
    combatTargetCandidateRange,
    combatTickActiveFromState,
    combatTickGapOfflineState,
    controlHasNativeGameSession,
    currentHeldCoinChoice,
    currentHeldCoinRouteChoice,
    dailyStaminaBudgetIsLimitingCore,
    dailyStaminaFinalCoinAction,
    decorateActiveThreat,
    defensiveTargetOverridesEngaged,
    deferredStaminaExhaustionLeave,
    dist,
    dropValue,
    ensureControlWs,
    entityFreshEnoughForOffense,
    exitMotionStopLockRemainingMs,
    finishImportantCombat,
    formatDistance,
    formatDurationMs,
    getBullets,
    getCoins,
    getCurrentUserId,
    getNativeCoinList,
    getNativeEntityList,
    getSelf,
    globalSamplingOutageOfflineState,
    handlePendingExit,
    handleTickReentryCombatGap,
    highValueCoinPriorityAmount,
    highValueCoinPriorityHealthyHp,
    highValueVisibleCoinPriorityNeeded,
    hpDisplay,
    hpValue,
    hypot,
    importantSessionStaminaSpentMs,
    incomingBulletThreat,
    installNativeLoginGateInterceptors,
    installPageGlobal,
    installPageNativeSnapshotObserver,
    isAfkProfitTarget,
    isAlive,
    isAvoidanceThreat,
    isCombatStateForInjuryLeave,
    isConservingStamina,
    isCurrentlyActive,
    isFiringEntity,
    isFullHp,
    isInvulnerable,
    isInvulnerableActive,
    isRecovering,
    isSnapshotCoinWaitAction,
    isSnapshotOnlyCoin,
    isWhitelistedTarget,
    knownHpValue,
    latestEnemyLeaveDisplayReason,
    leaveForCombat,
    leaveForInjury,
    leaveForPursuit,
    leaveOffline,
    liveSessionMismatchTakeoverState,
    logStatus,
    loginSnapshotGateDisplayReason,
    markCoinCollected,
    maybeRecordLoginPoint,
    maybeReloadCloudflareError,
    maybeStartAutoLogin,
    noSelfGameSessionExitState,
    normalizeCoinDrop,
    normalizePendingExitReloadConfirmationCore,
    noteImportantSessionExit,
    noteSelfUnavailableForPostLoginZoom,
    now,
    observeNetworkQualitySelf,
    opportunityCandidateCoreOptions,
    opportunityChoiceCoreOptions,
    opportunityCoinStaminaCost,
    opportunityEnemyStaminaCost,
    opportunityLongStaminaBudget,
    opportunityPriorityTier,
    opportunityWindowStaminaBudget,
    pageGlobal,
    pendingCombatLeaveAction,
    pendingExitIntentForSkippedLeave,
    pendingExitPersistenceCoreHelpers,
    pendingExitSkipNewLeave,
    pickActiveCombatWaitThreat,
    pickBestOpportunityCore,
    pickCoin,
    pickCoinField,
    pickCoinRouteOpportunityCore,
    pickCombatTarget,
    pickDistantCoin,
    pickEngagedCombatTarget,
    pickHighValueVisibleCoin,
    pickNearestDailyStaminaFinalCoinCore,
    pickPostAttackDropCoinCore,
    pickPostAttackDropWaitTargetCore,
    pickProfitableCombatTarget,
    pickRealtimeLocalCoin,
    postAttackDropResolvedAt,
    previousBot,
    readPersistentExitState,
    recordActionSwitchDiagnostics,
    recordCoinFilterDiagnostic,
    recordCombatLogTick,
    recordImportantCombatTick,
    recordIncidentalCoinPickups,
    recordKillHistoryItem,
    recordUnhandledTickError,
    refreshGlobalState,
    rememberAttack,
    rememberCombatEngagement,
    rememberLoginPointDamageThreat,
    rememberOpportunityChoiceCore,
    requestReload,
    requestSessionMismatchRecoveryReload,
    resetOpportunitySwitchLock,
    resetServerPositionStall,
    restoreImportantLogsForRemote,
    restorePersistedCombatLogPendingEntries,
    restorePersistedExitAuditLogs,
    runTickSafely,
    safeCoinCandidates,
    safeJsonClone,
    safeStringify,
    schedulePostLoginZoomOut,
    scoreCoinOpportunity,
    sendActionVelocity,
    sessionMismatchRecoveryReloadSatisfied,
    setLastTarget,
    shootAt,
    shouldClearOpportunityChoiceCore,
    snapshotCoinAgeMs,
    snapshotCoinLocalSuppressRadius,
    snapshotCoinNavigationReasonCore,
    snapshotDataFreshEnough,
    snapshotEntityAllowed,
    speed,
    staleOfflineStaminaHoldContradicted,
    staminaBudgetCoinLeaveAction,
    staminaBudgetCoinLeaveSummary,
    staminaBudgetReloginDelayMs,
    staminaExhaustedWindowLabel,
    startTargetWhitelistPolling,
    stopMotionSafely,
    summarizeBlockedStaminaOpportunityCore,
    summarizeControl,
    summarizeNearestCoinStaminaBudgetExitCore,
    summarizePendingCombatLeave,
    summarizePursuit,
    summarizeSelf,
    summarizeSessionMismatchRecoveryStatus,
    summarizeStamina,
    syncPausedFromPage,
    uniqueVisibleRouteCoinsCore,
    updateBotPanel,
    updateKillHistory,
    updateOpportunityAfkStaminaObservations,
    updatePursuitTracking,
    updateSessionStats,
    visibleCoinSourcesConfirmTargetMissing,
    writePersistentPendingExitStateCore
  });
  ({
    classify,
    chooseAction,
    tick,
    threatKey,
    returnBlockRadius
  } = orchestrationRuntime);

  return orchestrationRuntime.startRuntime();

})();

module.exports = __graspRatRuntimeStartup;
module.exports.default = __graspRatRuntimeStartup;
