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
    firstFiniteNumber,
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
    stopMotionSafely,
    stopMotionAfterExit,
    clearCombatEngagement,
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








	  function pageNativeSnapshotUrl(input) {
	    try {
	      const raw = typeof input === 'string' ? input : String(input?.url || input || '');
	      if (!raw) return '';
	      const url = new URL(raw, location.href);
	      if (url.origin !== location.origin || url.pathname !== '/snapshot') return '';
	      return url.toString();
	    } catch (_) {
	      return '';
	    }
	  }

	  function pageNativeSnapshotPayload(payload, meta = {}) {
	    if (!payload || typeof payload !== 'object') return;
	    const entities = Array.isArray(payload?.entities) ? payload.entities : null;
	    if (!entities) {
	      pageNativeSnapshotError(new Error('/snapshot invalid payload'), meta);
	      return;
	    }
	    bot.globalState.tick = Number(payload?.tick || bot.globalState.tick || 0);
	    bot.globalState.entities = entities;
	    bot.globalState.bullets = Array.isArray(payload?.bullets) ? payload.bullets : [];
	    bot.globalState.coinDrops = Array.isArray(payload?.coin_drops) ? payload.coin_drops : [];
	    bot.globalState.messages = Array.isArray(payload?.messages) ? payload.messages : [];
	    bot.globalState.snapshotRefreshedAt = Date.now();
	    bot.globalState.passiveSnapshotRefreshedAt = bot.globalState.snapshotRefreshedAt;
	    bot.globalState.passiveSnapshotSource = String(meta.source || 'page-native-snapshot');
	    bot.globalState.error = String(bot.globalState.error || '').replace(/(^|; )snapshot: [^;]*/g, '').replace(/^;\s*/, '');
	    noteLoginSnapshotProbe(true, {
	      tick: bot.globalState.tick,
	      entities: bot.globalState.entities,
	      source: bot.globalState.passiveSnapshotSource,
	      passive: true
	    });
	    noteLeave403SnapshotProbe(true, {
	      tick: bot.globalState.tick,
	      source: bot.globalState.passiveSnapshotSource,
	      passive: true
	    });
	    recordRuntimeDiagnosticsCore(bot, {
	      lastPassiveSnapshot: {
	        at: bot.globalState.snapshotRefreshedAt,
	        source: bot.globalState.passiveSnapshotSource,
	        url: String(meta.url || ''),
	        entities: arrayCount(bot.globalState.entities),
	        tick: bot.globalState.tick
	      }
	    });
	  }

	  function pageNativeSnapshotError(err, meta = {}) {
	    const message = err?.message || String(err || 'page native snapshot failed');
	    bot.globalState.passiveSnapshotError = message;
	    bot.globalState.passiveSnapshotErrorAt = Date.now();
	    noteLoginSnapshotProbe(false, {
	      error: message,
	      source: String(meta.source || 'page-native-snapshot'),
	      passive: true
	    });
	    noteLeave403SnapshotProbe(false, {
	      error: message,
	      source: String(meta.source || 'page-native-snapshot'),
	      passive: true
	    });
	  }

	  function installPageNativeSnapshotObserver() {
	    const key = '__graspRatPageNativeSnapshotObserver';
	    const state = readPageGlobal(key, null, pageGlobal) || {
	      installed: false,
	      originalResponseJson: null,
	      originalResponseText: null,
	      originalXhrOpen: null,
	      observedXhrs: null
	    };
	    installPageGlobal(key, state, pageGlobal);
	    state.handleSnapshotPayload = pageNativeSnapshotPayload;
	    state.handleSnapshotError = pageNativeSnapshotError;
	    if (state.installed) return;
	    state.installed = true;
	    const observeFetchResponse = (response, parsed, source) => {
	      const snapshotUrl = pageNativeSnapshotUrl(response?.url || '');
	      if (!snapshotUrl) return;
	      Promise.resolve(parsed)
	        .then(payload => {
	          if (!response?.ok) {
	            state.handleSnapshotError?.(new Error('/snapshot HTTP ' + (response?.status || 0)), { source, url: snapshotUrl });
	            return;
	          }
	          state.handleSnapshotPayload?.(payload, { source, url: snapshotUrl });
	        })
	        .catch(err => state.handleSnapshotError?.(err, { source, url: snapshotUrl }));
	    };
	    const ResponseCtor = readPageGlobal('Response', null, pageGlobal);
	    if (typeof ResponseCtor === 'function' && ResponseCtor.prototype) {
	      const responseProto = ResponseCtor.prototype;
	      if (typeof responseProto.json === 'function') {
	        state.originalResponseJson = responseProto.json;
	        responseProto.json = function graspRatObservedResponseJson() {
	          const result = state.originalResponseJson.apply(this, arguments);
	          observeFetchResponse(this, result, 'page-native-fetch-json');
	          return result;
	        };
	      }
	      if (typeof responseProto.text === 'function') {
	        state.originalResponseText = responseProto.text;
	        responseProto.text = function graspRatObservedResponseText() {
	          const result = state.originalResponseText.apply(this, arguments);
	          const snapshotUrl = pageNativeSnapshotUrl(this?.url || '');
	          if (snapshotUrl) {
	            const response = this;
	            const parsed = Promise.resolve(result).then(text => JSON.parse(String(text || 'null')));
	            observeFetchResponse(response, parsed, 'page-native-fetch-text');
	          }
	          return result;
	        };
	      }
	    }
	    const XMLHttpRequestCtor = readPageGlobal('XMLHttpRequest', null, pageGlobal);
	    if (typeof XMLHttpRequestCtor === 'function') {
	      const proto = XMLHttpRequestCtor.prototype;
	      state.originalXhrOpen = proto.open;
	      state.observedXhrs = typeof WeakSet === 'function' ? new WeakSet() : null;
	      proto.open = function graspRatObservedXhrOpen(method, url) {
	        const xhr = this;
	        let snapshotUrl = '';
	        try {
	          snapshotUrl = pageNativeSnapshotUrl(url);
	        } catch (_) {
	          snapshotUrl = '';
	        }
	        if (snapshotUrl && (!state.observedXhrs || !state.observedXhrs.has(xhr))) {
	          try {
	            state.observedXhrs?.add(xhr);
	          } catch (_) {}
	          xhr.addEventListener('loadend', () => {
	            try {
	              if (xhr.status < 200 || xhr.status >= 300) throw new Error('/snapshot HTTP ' + xhr.status);
	              const payload = xhr.responseType === 'json'
	                ? xhr.response
	                : JSON.parse(String(xhr.responseText || xhr.response || 'null'));
	              state.handleSnapshotPayload?.(payload, { source: 'page-native-xhr', url: snapshotUrl });
	            } catch (err) {
	              state.handleSnapshotError?.(err, { source: 'page-native-xhr', url: snapshotUrl });
	            }
	          });
	        }
	        return state.originalXhrOpen.apply(this, arguments);
	      };
	    }
	  }














  function getNativeState() {
	    try {
	      return typeof state === 'object' && state ? state : null;
	    } catch (_) {
	      return null;
	    }
	  }

	  function getNativeControl() {
	    const nativeState = getNativeState();
	    if (!nativeState) return null;
	    const ws = nativeState.ws || null;
	    return {
	      state: nativeState,
	      ws,
	      wsOpen: Boolean(nativeState.wsOpen && ws && ws.readyState === WebSocket.OPEN),
	      wsReadyState: ws ? ws.readyState : null
	    };
	  }

  function wsConstant(name, fallback) {
    try {
      return typeof WebSocket !== 'undefined' && Number.isFinite(Number(WebSocket[name]))
        ? Number(WebSocket[name])
        : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function isOfflineishWsReadyState(value) {
    const state = wsReadyStateNumber(value);
    if (!Number.isFinite(state)) return false;
    return state === wsConstant('CONNECTING', 0)
      || state === wsConstant('CLOSING', 2)
      || state === wsConstant('CLOSED', 3);
  }

  function noteNativeReconnectState(native) {
    if (!native) return { count: 0, churn: false, windowMs: 0 };
    const control = bot.control;
    const t = Date.now();
    const windowMs = Math.max(1000, Number(cfg.offlineReconnectChurnWindowMs || 0) || 10000);
    const minEvents = Math.max(2, Number(cfg.offlineReconnectChurnMinEvents || 0) || 3);
    const readyState = wsReadyStateNumber(native.wsReadyState);
    const previousReadyState = wsReadyStateNumber(control.observedNativeWsReadyState);
    const previousWs = control.observedNativeWs || null;
    const wsChanged = Boolean(native.ws && previousWs && native.ws !== previousWs);
    const hadPrevious = Boolean(previousWs || Number.isFinite(previousReadyState));
    const wasOpen = previousReadyState === wsConstant('OPEN', 1);
    const offlineish = Boolean(!native.wsOpen && isOfflineishWsReadyState(readyState));
    const becameOfflineish = offlineish && (!hadPrevious || wsChanged || wasOpen || previousReadyState !== readyState);
    const events = Array.isArray(control.nativeReconnectEvents) ? control.nativeReconnectEvents : [];
    const freshEvents = events.filter(at => t - Number(at || 0) <= windowMs);
    if (becameOfflineish) freshEvents.push(t);
    control.nativeReconnectEvents = freshEvents;
    control.nativeReconnectEventCount = freshEvents.length;
    control.nativeReconnectWindowMs = windowMs;
	    control.nativeReconnectChurn = Boolean(freshEvents.length >= minEvents);
    control.observedNativeWs = native.ws || null;
    control.observedNativeWsReadyState = native.wsReadyState;
    return {
      count: control.nativeReconnectEventCount,
      churn: control.nativeReconnectChurn,
      windowMs
    };
  }

	  function detachNativeMessagePump() {
	    if (bot.nativeMessageWs) {
	      try {
	        if (bot.nativeMessageHandler) bot.nativeMessageWs.removeEventListener('message', bot.nativeMessageHandler);
	        if (bot.nativeOpenHandler) bot.nativeMessageWs.removeEventListener('open', bot.nativeOpenHandler);
	        if (bot.nativeCloseHandler) bot.nativeMessageWs.removeEventListener('close', bot.nativeCloseHandler);
	        if (bot.nativeErrorHandler) bot.nativeMessageWs.removeEventListener('error', bot.nativeErrorHandler);
	      } catch (_) {}
	    }
	    bot.nativeMessageWs = null;
	    bot.nativeMessageHandler = null;
	    bot.nativeOpenHandler = null;
	    bot.nativeCloseHandler = null;
	    bot.nativeErrorHandler = null;
	  }

	  function triggerNativeTick(source, respectMinInterval = true) {
	    if (!bot.running || bot.ticking) return;
	    const t = now();
	    const minIntervalMs = nativeTickMinIntervalMs({
	      decision: bot.lastDecision,
	      combatTarget: bot.combatTarget,
	      pendingExit: bot.pendingExit,
	      nowMs: t
	    });
	    if (respectMinInterval && t - bot.lastNativeTickAt < minIntervalMs) return;
	    bot.lastNativeTickAt = t;
	    runTickSafely(source);
	  }

	  function ensureNativeMessagePump(native = getNativeControl()) {
	    if (!native?.ws) return false;
	    if (bot.nativeMessageWs === native.ws && bot.nativeMessageHandler) return true;
	    detachNativeMessagePump();
    bot.nativeMessageWs = native.ws;
    bot.nativeMessageHandler = runCallbackSafely('native-ws-message', () => {
      observeNativeWsFrame('native-ws');
      triggerNativeTick('native-ws', true);
    });
    bot.nativeOpenHandler = runCallbackSafely('native-ws-open', () => {
      bot.control.lastOpenAt = Date.now();
      bot.control.lastError = '';
      triggerNativeTick('native-ws-open', false);
    });
	    bot.nativeCloseHandler = runCallbackSafely('native-ws-close', () => {
	      bot.control.wsOpen = false;
	      bot.control.nativeWsOpen = false;
	      bot.control.wsReadyState = native.ws.readyState;
	      bot.control.nativeWsReadyState = native.ws.readyState;
	    });
	    bot.nativeErrorHandler = runCallbackSafely('native-ws-error', () => {
	      bot.control.lastError = 'native websocket error';
	    });
	    try {
	      native.ws.addEventListener('message', bot.nativeMessageHandler);
	      native.ws.addEventListener('open', bot.nativeOpenHandler);
	      native.ws.addEventListener('close', bot.nativeCloseHandler);
	      native.ws.addEventListener('error', bot.nativeErrorHandler);
	      return true;
	    } catch (err) {
	      bot.control.lastError = 'native pump: ' + (err.message || String(err));
	      detachNativeMessagePump();
	      return false;
	    }
	  }

	  function notePageOwnsReconnect() {
	    bot.control.lastError = 'native reconnect disabled; page owns websocket reconnect';
	    return false;
	  }

	  function syncNativeControl(native = getNativeControl()) {
	    if (!native) return false;
	    noteNativeReconnectState(native);
	    bot.control.transport = 'native-page';
	    bot.control.nativeWsOpen = native.wsOpen;
	    bot.control.nativeWsReadyState = native.wsReadyState;
	    bot.control.wsOpen = native.wsOpen;
	    bot.control.wsReadyState = native.wsReadyState;
	    bot.control.connecting = !native.wsOpen && native.wsReadyState === WebSocket.CONNECTING;
	    ensureNativeMessagePump(native);
	    if (native.wsOpen) {
	      if (!bot.control.lastOpenAt) bot.control.lastOpenAt = Date.now();
	      bot.control.lastError = '';
	    }
	    return native.wsOpen;
	  }

	  function summarizeControl() {
	    const control = bot.control;
	    const native = getNativeControl();
	    if (native) syncNativeControl(native);
    const nativeState = native?.state || null;
    const serverPositionStall = summarizeServerPositionStall();
    const serverPositionStallOffline = Boolean(cfg.serverPositionStallOfflineEnabled && serverPositionStall?.stalled);
    const actionSettlementStall = summarizeActionSettlementStall();
    const actionSettlementStallOffline = Boolean(cfg.actionSettlementStallOfflineEnabled && actionSettlementStall?.stalled);
    const effectiveWsOpen = Boolean(control.wsOpen && !serverPositionStallOffline && !actionSettlementStallOffline);
	    const nativeCurrentVel = nativeState?.currentVel
	      ? (Number(nativeState.currentVel.dx || 0) + ' ' + Number(nativeState.currentVel.dy || 0))
	      : '';
	    const nativeKeys = nativeState?.keys && typeof nativeState.keys[Symbol.iterator] === 'function'
	      ? Array.from(nativeState.keys)
	      : [];
	    return {
	      currentUserId: control.currentUserId || getCurrentUserId(),
	      hasToken: Boolean(getSessionToken()),
	      wsOpen: effectiveWsOpen,
      rawWsOpen: Boolean(control.wsOpen),
	      wsReadyState: native ? native.wsReadyState : (control.ws ? control.ws.readyState : control.wsReadyState),
	      connecting: Boolean(control.connecting),
	      transport: control.transport || (native ? 'native-page' : 'none'),
	      allowNativeReconnect: false,
	      allowBotWebSocketFallback: false,
	      nativeWsOpen: Boolean(native?.wsOpen),
	      nativeWsReadyState: native ? native.wsReadyState : null,
	      nativeReconnectChurn: Boolean(control.nativeReconnectChurn),
	      nativeReconnectEventCount: Number(control.nativeReconnectEventCount || 0),
	      nativeReconnectWindowMs: Number(control.nativeReconnectWindowMs || cfg.offlineReconnectChurnWindowMs || 0),
	      lastOpenAgeMs: control.lastOpenAt ? Date.now() - control.lastOpenAt : null,
	      lastMessageAgeMs: control.lastMessageAt ? Date.now() - control.lastMessageAt : null,
	      lastError: actionSettlementStallOffline
          ? 'action settlement stalled'
          : (serverPositionStallOffline
            ? 'server position stalled'
            : (control.lastError === 'server position stalled' || control.lastError === 'action settlement stalled' ? '' : (control.lastError || ''))),
	      lastVelocity: control.lastVelocity || '',
      nonZeroVelocityAgeMs: control.lastNonZeroVelocityAt ? Date.now() - Number(control.lastNonZeroVelocityAt || 0) : null,
      nonZeroVelocityDurationMs: control.nonZeroVelocitySince ? Date.now() - Number(control.nonZeroVelocitySince || 0) : null,
	      nativeCurrentVel,
	      nativeLastVel: nativeState?.lastVel || '',
	      nativeKeys,
      directWsControl: Boolean(cfg.directWsControlEnabled),
      directWsServerMarkerProbe: Boolean(cfg.directWsServerMarkerProbe),
      directVelocityRepeatMs: Number(cfg.directWsVelocityRepeatMs || 0),
      lastDirectVelocity: bot.lastDirectVelocity || '',
      lastDirectVelocityAgeMs: bot.lastDirectVelocityAt ? Math.max(0, Math.round(now() - Number(bot.lastDirectVelocityAt || 0))) : null,
      serverPositionStall,
      actionSettlementStall
	    };
	  }

	  function closeControlWs(reason = '') {
	    const ws = bot.control.ws;
	    bot.control.ws = null;
	    bot.control.wsOpen = false;
	    bot.control.connecting = false;
	    bot.control.wsReadyState = ws ? ws.readyState : bot.control.wsReadyState;
	    if (reason) bot.control.lastError = reason;
	    if (ws) {
	      try {
	        ws.close();
	      } catch (_) {}
	    }
	  }

	  function ensureControlWs() {
	    if (cfg.dryRun) return true;
	    const userId = getCurrentUserId();
	    const token = getSessionToken();
	    bot.control.currentUserId = userId;
	    bot.control.hasToken = Boolean(token);
	    if (!userId) {
	      closeControlWs('missing user id');
	      return false;
	    }
	    const native = getNativeControl();
	    if (native) {
	      if (bot.control.ws) closeControlWs();
	      syncNativeControl(native);
	      if (bot.control.wsOpen) return true;
	      if (isWsConnectingOrOpen(native.wsReadyState)) return false;
	      bot.control.lastError = 'native page websocket offline; page owns reconnect';
	      return false;
	    }
	    if (!token) {
	      closeControlWs('missing login token');
	      return false;
	    }
	    if (bot.control.ws) closeControlWs('bot websocket fallback disabled');
	    bot.control.transport = 'native-page-missing';
	    bot.control.connecting = false;
	    bot.control.wsOpen = false;
	    bot.control.lastError = 'native page websocket unavailable';
	    return false;
	  }

	  function getSelf() {
	    const id = getCurrentUserId();
	    if (!id) return null;
	    const nativeSelf = typeof getOwnEntity === 'function' ? getOwnEntity() : null;
	    if (nativeSelf && Number(nativeSelf.user_id) === id) return nativeSelf;
	    const nativeState = getNativeState();
	    const nativeEntities = Array.isArray(nativeState?.entities) ? nativeState.entities : null;
	    const nativeEntity = (nativeEntities || []).find(e => Number(e.user_id) === id);
	    if (nativeEntity) return nativeEntity;
	    if (nativeEntities) return null;
	    if (!snapshotSelfFreshEnough()) return null;
	    return (bot.globalState.entities || []).find(e => Number(e.user_id) === id) || null;
	  }

	  function getEntities() {
	    const realtimeEntities = getNativeEntityList();
	    if (Array.isArray(realtimeEntities) && realtimeEntities.length) return realtimeEntities;
	    const nativeState = getNativeState();
	    if (Array.isArray(nativeState?.entities) && nativeState.entities.length) return nativeState.entities;
	    return bot.globalState.entities || [];
	  }

  function realtimeEntityWorldPoint(value, preferRender = false) {
    if (!value || typeof value !== 'object') return null;
    const point = value.position || value.pos || value.point || value.coord || null;
    const renderX = firstFiniteNumber(value.visual_x, value.visualX, value.render_x, value.renderX);
    const renderY = firstFiniteNumber(value.visual_y, value.visualY, value.render_y, value.renderY);
    const x = preferRender && Number.isFinite(renderX)
      ? renderX
      : firstFiniteNumber(value.x, value.pos_x, value.posX, value.world_x, value.worldX, value.coord_x, value.coordX, value.center_x, value.centerX, point?.x, renderX);
    const y = preferRender && Number.isFinite(renderY)
      ? renderY
      : firstFiniteNumber(value.y, value.pos_y, value.posY, value.world_y, value.worldY, value.coord_y, value.coordY, value.center_y, value.centerY, point?.y, renderY);
    return Number.isFinite(x) && Number.isFinite(y) ? { ...value, x, y } : null;
  }

  function realtimeEntityKey(entity) {
    const id = entity?.user_id ?? entity?.userId ?? entity?.id;
    if (id !== undefined && id !== null && id !== '') return 'id:' + id;
    const point = realtimeEntityWorldPoint(entity, Boolean(entity?.render || entity?.nativeRender));
    if (!point) return '';
    return 'xy:' + Math.round(Number(point.x) || 0) + ':' + Math.round(Number(point.y) || 0);
  }

  function normalizeRealtimeEntity(raw, source, options = {}) {
    if (!raw || typeof raw !== 'object') return null;
    const point = realtimeEntityWorldPoint(raw, Boolean(options.render || raw.render || raw.nativeRender));
    if (!point) return null;
    return {
      ...raw,
      user_id: raw.user_id ?? raw.userId ?? raw.id,
      id: raw.id ?? raw.user_id ?? raw.userId,
      x: Number(point.x),
      y: Number(point.y),
      native: true,
      realtime: true,
      render: Boolean(options.render || raw.render || raw.nativeRender),
      nativeSource: raw.nativeSource || raw.overlaySource || source
    };
  }

  function mergeRealtimeEntity(previous, next) {
    if (!previous) return next;
    return {
      ...previous,
      ...next,
      native: Boolean(previous.native || next.native),
      realtime: Boolean(previous.realtime || next.realtime),
      render: Boolean(previous.render || next.render),
      snapshot: Boolean(previous.snapshot || next.snapshot)
    };
  }

  function getNativeEntityList() {
    const nativeState = getNativeState();
    const hasNativeArray = Array.isArray(nativeState?.entities);
    const byKey = new Map();
    const add = (raw, source, options = {}) => {
      const entity = normalizeRealtimeEntity(raw, source, options);
      if (!entity) return;
      const key = realtimeEntityKey(entity);
      if (!key) return;
      byKey.set(key, mergeRealtimeEntity(byKey.get(key), entity));
    };
    if (hasNativeArray) {
      for (const entity of nativeState.entities) add(entity, 'state.entities');
    }
    let renderEntities = [];
    try {
      renderEntities = targetOverlayRenderEntities();
    } catch (_) {
      renderEntities = [];
    }
    if (Array.isArray(renderEntities)) {
      for (const entity of renderEntities) {
        add(entity, entity?.overlaySource || 'render', { render: true });
      }
    }
    if (byKey.size) return Array.from(byKey.values());
    return hasNativeArray ? [] : null;
  }

  function listFromNativeCoinValue(value) {
    if (Array.isArray(value)) return value;
    if (value instanceof Map || value instanceof Set) return Array.from(value.values());
    if (value && typeof value === 'object') {
      if (Number.isFinite(firstFiniteNumber(value.x, value.pos_x, value.posX, value.world_x, value.worldX, value.coord_x, value.coordX, value.center_x, value.centerX, value.position?.x, value.pos?.x))) {
        return [value];
      }
      const values = Object.values(value);
      if (values.length && values.every(item => item && typeof item === 'object')) return values;
    }
    return null;
  }

  function addNativeCoinSource(sources, label, value, thisArg = null) {
    let sourceValue = value;
    if (typeof sourceValue === 'function') {
      try {
        sourceValue = sourceValue.call(thisArg);
      } catch (_) {
        return false;
      }
    }
    const list = listFromNativeCoinValue(sourceValue);
    if (!list) return false;
    sources.push({ label, list });
    return true;
  }

  function getNativeCoinSources() {
    const sources = [];
    const win = typeof window === 'object' && window ? window : null;
    try {
      addNativeCoinSource(
        sources,
        'render',
        typeof getRenderCoinDrops === 'function' ? getRenderCoinDrops : win?.getRenderCoinDrops,
        win
      );
    } catch (_) {}
    const nativeState = getNativeState();
    if (!nativeState) return sources;
    for (const key of ['coinDrops', 'coin_drops', 'renderCoinDrops', 'render_coin_drops', 'visibleCoinDrops', 'visible_coin_drops', 'coins', 'drops']) {
      addNativeCoinSource(sources, 'state.' + key, nativeState[key], nativeState);
    }
    for (const key of ['getRenderCoinDrops', 'getCoinDrops', 'getVisibleCoinDrops', 'getCoins']) {
      addNativeCoinSource(sources, 'state.' + key + '()', nativeState[key], nativeState);
    }
    for (const parentKey of ['latestSnapshot', 'latest_snapshot', 'lastSnapshot', 'last_snapshot', 'snapshot', 'currentSnapshot', 'current_snapshot']) {
      const parent = nativeState[parentKey];
      if (!parent || typeof parent !== 'object') continue;
      for (const key of ['coinDrops', 'coin_drops', 'coins', 'drops']) {
        addNativeCoinSource(sources, 'state.' + parentKey + '.' + key, parent[key], parent);
      }
    }
    return sources;
  }

  function getNativeCoinList() {
    const sources = getNativeCoinSources();
    const list = [];
    for (const source of sources) {
      for (const item of source.list) {
        list.push(item && typeof item === 'object' ? { ...item, nativeSource: item.nativeSource || source.label } : item);
      }
    }
    return list.length ? list : null;
  }

  function entityIdKey(entity) {
    const id = entity?.user_id ?? entity?.id;
    return id === undefined || id === null || id === '' ? '' : String(id);
  }

  function buildNativeEntityMeta(nativeEntities) {
    if (!Array.isArray(nativeEntities)) return { available: false, ids: new Set(), aliveIds: new Set() };
    const ids = new Set();
    const aliveIds = new Set();
    for (const entity of nativeEntities) {
      const key = entityIdKey(entity);
      if (!key) continue;
      ids.add(key);
      if (isAlive(entity)) aliveIds.add(key);
    }
    return { available: true, ids, aliveIds };
  }

  function snapshotDataAgeMs() {
    return bot.globalState.snapshotRefreshedAt ? Math.max(0, Date.now() - Number(bot.globalState.snapshotRefreshedAt || 0)) : Infinity;
  }

  function snapshotDataFreshEnough() {
    return snapshotDataAgeMs() <= Number(cfg.snapshotCoinStaleMs || 0);
  }

  function snapshotBulletFreshEnough() {
    return snapshotDataAgeMs() <= Number(cfg.snapshotBulletStaleMs || 0);
  }

  function snapshotSelfFreshEnough() {
    return snapshotDataAgeMs() <= Number(cfg.snapshotSelfStaleMs || 0);
  }

  function entityFreshEnoughForOffense(entity) {
    return Boolean(entity?.native || !entity?.snapshot || snapshotDataFreshEnough());
  }

  function snapshotEntityAllowed(self, entity, nativeMeta) {
    if (!nativeMeta?.available) return true;
    const distance = self ? dist(self, entity) : Infinity;
    const authoritativeRadius = Math.max(
      Number(cfg.nativeEntityAuthoritativeRadius || 0),
      Number(cfg.combatAttackRange || 0),
      Number(cfg.attackRange || 0),
      Number(cfg.globalAttackMaxDistance || 0)
    );
    if (Number.isFinite(distance) && distance <= authoritativeRadius) return false;
    const key = entityIdKey(entity);
    if (key && nativeMeta.ids.has(key) && !nativeMeta.aliveIds.has(key)) return false;
    return true;
  }

  function firstFiniteNumber(...values) {
    for (const value of values) {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
    return NaN;
  }

  function normalizeCoinDrop(raw, source) {
    if (!raw || typeof raw !== 'object') return null;
    const point = raw.position || raw.pos || raw.point || raw.coord || null;
    const x = firstFiniteNumber(raw.x, raw.pos_x, raw.posX, raw.world_x, raw.worldX, raw.coord_x, raw.coordX, raw.center_x, raw.centerX, point?.x);
    const y = firstFiniteNumber(raw.y, raw.pos_y, raw.posY, raw.world_y, raw.worldY, raw.coord_y, raw.coordY, raw.center_y, raw.centerY, point?.y);
    const amount = firstFiniteNumber(raw.amount, raw.value, raw.coins, raw.coin_amount, raw.coinAmount, raw.count, raw.num, raw.quantity, 0);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(amount) || amount <= 0) return null;
    const dropId = raw.drop_id ?? raw.dropId ?? raw.id ?? raw.coin_id ?? raw.coinId;
    return {
      ...raw,
      drop_id: dropId ?? ('coord:' + Math.round(x) + ':' + Math.round(y) + ':' + amount),
      x,
      y,
      amount,
      snapshot: source === 'snapshot' || Boolean(raw.snapshot),
      native: source === 'native' || Boolean(raw.native)
    };
  }

  function coinDropKey(coin) {
    const id = coin?.drop_id ?? coin?.id ?? coin?.coin_id;
    if (id !== undefined && id !== null && id !== '') return 'id:' + id;
    return 'xy:' + Math.round(Number(coin.x) || 0) + ':' + Math.round(Number(coin.y) || 0) + ':' + (Number(coin.amount) || 0);
  }

  function nativeViewRadiusCm() {
    const nativeState = getNativeState();
    const values = [
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

  function snapshotCoinLocalSuppressRadius() {
    return Math.max(
      0,
      Number(cfg.nativeCoinAuthoritativeRadius || 0),
      nativeViewRadiusCm()
    );
  }

  function snapshotCoinAllowed(self, coin) {
    const distance = self ? dist(self, coin) : Infinity;
    const suppressRadius = snapshotCoinLocalSuppressRadius();
    return !Number.isFinite(distance) || distance > suppressRadius;
  }

  function isSnapshotOnlyCoin(coin) {
    return Boolean(coin?.snapshot) && !coin?.native;
  }

  function snapshotCoinFreshEnough() {
    return snapshotDataFreshEnough();
  }

  function getCoins(self = null) {
    const nativeCoinSources = getNativeCoinSources();
    const nativeCoinList = [];
    for (const source of nativeCoinSources) {
      for (const item of source.list) {
        nativeCoinList.push(item && typeof item === 'object' ? { ...item, nativeSource: item.nativeSource || source.label } : item);
      }
    }
    const nativeCoins = Array.isArray(nativeCoinList)
      ? nativeCoinList.map(coin => normalizeCoinDrop(coin, 'native')).filter(Boolean)
      : [];
    const snapshotCoins = Array.isArray(bot.globalState.coinDrops) ? bot.globalState.coinDrops : [];
    const useSnapshotCoins = snapshotCoinFreshEnough();
    const byKey = new Map();
    const add = (raw, source) => {
      const coin = normalizeCoinDrop(raw, source);
      if (!coin) return;
      const key = coinDropKey(coin);
      const previous = byKey.get(key);
      byKey.set(key, previous ? { ...previous, ...coin, snapshot: Boolean(previous.snapshot || coin.snapshot), native: Boolean(previous.native || coin.native) } : coin);
    };
    if (useSnapshotCoins) {
      for (const coin of snapshotCoins) {
        const normalized = normalizeCoinDrop(coin, 'snapshot');
        if (!normalized || !snapshotCoinAllowed(self, normalized)) continue;
        add(normalized, 'snapshot');
      }
    }
    for (const coin of nativeCoins) add(coin, 'native');
    const merged = Array.from(byKey.values());
    bot.lastCoinSourceSummary = {
      nativeSources: nativeCoinSources.map(source => ({ label: source.label, raw: arrayCount(source.list) })),
      nativeRaw: nativeCoinList.length,
      native: nativeCoins.length,
      snapshotRaw: snapshotCoins.length,
      snapshotFresh: Boolean(useSnapshotCoins),
      suppressRadius: Math.round(snapshotCoinLocalSuppressRadius()),
      merged: merged.length
    };
    return merged;
  }

  function normalizeBullet(raw, source) {
    if (!raw || typeof raw !== 'object') return null;
    let vx = Number(raw.vx ?? raw.velocity_x ?? raw.dx ?? NaN);
    let vy = Number(raw.vy ?? raw.velocity_y ?? raw.dy ?? NaN);
    if (!Number.isFinite(vx)) vx = 0;
    if (!Number.isFinite(vy)) vy = 0;
    const speedPerTick = Number(raw.speed_per_tick ?? raw.speedPerTick ?? raw.speed_per_server_tick ?? NaN);
    if (!(vx || vy)) {
      let dirX = Number(raw.dir_x_micros ?? raw.dirXMicros ?? raw.direction_x_micros ?? raw.dir_x ?? raw.dirX ?? NaN);
      let dirY = Number(raw.dir_y_micros ?? raw.dirYMicros ?? raw.direction_y_micros ?? raw.dir_y ?? raw.dirY ?? NaN);
      if (Number.isFinite(dirX) && Number.isFinite(dirY)) {
        const scale = Math.max(Math.abs(dirX), Math.abs(dirY)) > 10 ? 1000000 : 1;
        dirX /= scale;
        dirY /= scale;
        const speed = Number.isFinite(speedPerTick) && speedPerTick > 0 ? speedPerTick : 500;
        vx = dirX * speed;
        vy = dirY * speed;
      }
    }
    const startX = Number(raw.start_x ?? raw.startX ?? raw.origin_x ?? raw.x ?? raw.pos_x);
    const startY = Number(raw.start_y ?? raw.startY ?? raw.origin_y ?? raw.y ?? raw.pos_y);
    if (!(vx || vy) && Number.isFinite(startX) && Number.isFinite(startY)) {
      const targetX = Number(raw.target_x ?? raw.targetX ?? raw.aim_x ?? raw.aimX);
      const targetY = Number(raw.target_y ?? raw.targetY ?? raw.aim_y ?? raw.aimY);
      const dx = targetX - startX;
      const dy = targetY - startY;
      const distance = Math.hypot(dx, dy);
      if (Number.isFinite(distance) && distance > 0.01) {
        const speed = Number.isFinite(speedPerTick) && speedPerTick > 0 ? speedPerTick : 500;
        vx = dx / distance * speed;
        vy = dy / distance * speed;
      }
    }
    let x = Number(raw.x ?? raw.pos_x ?? raw.head_x ?? raw.headX ?? NaN);
    let y = Number(raw.y ?? raw.pos_y ?? raw.head_y ?? raw.headY ?? NaN);
    const nowTick = Number(raw.local_now_tick ?? raw.now_tick ?? raw.tick ?? bot.globalState.tick ?? NaN);
    const createdTick = Number(raw.created_tick ?? raw.createdTick ?? NaN);
    if ((!Number.isFinite(x) || !Number.isFinite(y)) && Number.isFinite(startX) && Number.isFinite(startY)) {
      x = startX;
      y = startY;
      const speedValue = hypot(vx, vy);
      if (speedValue > 0.01 && Number.isFinite(nowTick) && Number.isFinite(createdTick)) {
        const rangeCm = Number(raw.range_cm ?? raw.rangeCm ?? raw.range ?? 15000);
        const ageTicks = Math.max(0, nowTick - createdTick);
        const travelled = Math.min(Number.isFinite(rangeCm) && rangeCm > 0 ? rangeCm : 15000, ageTicks * speedValue);
        x = startX + vx / speedValue * travelled;
        y = startY + vy / speedValue * travelled;
      }
    }
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const expireTick = Number(raw.expire_tick ?? raw.expireTick ?? NaN);
    if (Number.isFinite(nowTick) && Number.isFinite(expireTick) && nowTick > expireTick + 1) return null;
    const ownerId = raw.ownerId ?? raw.owner_id ?? raw.owner_user_id ?? raw.source_user_id ?? raw.shooter_user_id ?? raw.user_id ?? raw.from_user_id ?? null;
    const id = raw.bullet_id ?? raw.id ?? raw.entity_id ?? (Math.round(x) + ':' + Math.round(y) + ':' + Math.round(vx) + ':' + Math.round(vy));
    return {
      ...raw,
      id,
      x,
      y,
      vx,
      vy,
      ownerId,
      speedPerTick: Number.isFinite(speedPerTick) ? speedPerTick : hypot(vx, vy),
      createdTick: Number.isFinite(createdTick) ? createdTick : null,
      expireTick: Number.isFinite(expireTick) ? expireTick : null,
      snapshot: source === 'snapshot' || Boolean(raw.snapshot),
      native: source === 'native' || Boolean(raw.native)
    };
  }

  function getBullets() {
    const nativeState = getNativeState();
    const nativeBullets = Array.isArray(nativeState?.bullets) ? nativeState.bullets : [];
    const snapshotBullets = Array.isArray(bot.globalState.bullets) ? bot.globalState.bullets : [];
    const useSnapshotBullets = snapshotBulletFreshEnough();
    const byKey = new Map();
    const add = (raw, source) => {
      const bullet = normalizeBullet(raw, source);
      if (!bullet) return;
      const key = String(bullet.id ?? (bullet.x + ':' + bullet.y + ':' + bullet.vx + ':' + bullet.vy));
      const previous = byKey.get(key);
      byKey.set(key, previous ? { ...previous, ...bullet, snapshot: Boolean(previous.snapshot || bullet.snapshot), native: Boolean(previous.native || bullet.native) } : bullet);
    };
    if (useSnapshotBullets) {
      for (const bullet of snapshotBullets) add(bullet, 'snapshot');
    }
    for (const bullet of nativeBullets) add(bullet, 'native');
    return Array.from(byKey.values());
  }

  function fetchJsonNoStore(url, timeoutMs = cfg.globalRefreshTimeoutMs) {
    const ms = Math.max(250, Number(timeoutMs) || cfg.globalRefreshTimeoutMs);
    const options = { cache: 'no-store', __graspRatBotFetch: true };
    let controller = null;
    let timer = 0;
    if (typeof AbortController === 'function') {
      controller = new AbortController();
      options.signal = controller.signal;
    }
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        try {
          if (controller) controller.abort();
        } catch (_) {}
        reject(new Error(url + ' timed out after ' + ms + 'ms'));
      }, ms);
    });
    const request = fetch(url, options).then(res => {
      if (!res.ok) {
        const error = new Error(url + ' HTTP ' + res.status + (res.statusText ? ' ' + res.statusText : ''));
        error.status = res.status;
        error.statusText = res.statusText || '';
        throw error;
      }
      return res.json();
    });
    return Promise.race([request, timeout]).finally(() => clearTimeout(timer));
  }



  function summarizeSelf(self) {
    const stamina = summarizeStamina(self);
    return {
      id: self.user_id,
      name: self.name,
      x: Math.round(Number(self.x) || 0),
      y: Math.round(Number(self.y) || 0),
      hp: self.hp,
      maxHp: Number(self.max_hp ?? self.maxHp ?? 0) || null,
      stamina5s: stamina.stamina5s,
      stamina5sLimit: stamina.stamina5sLimit,
      stamina1h: stamina.stamina1h,
      stamina1hLimit: stamina.stamina1hLimit,
      stamina1d: stamina.stamina1d,
      stamina1dLimit: stamina.stamina1dLimit,
      stamina,
      drop: dropValue(self),
      coins: Number(self.coins || 0),
      life: self.life,
      mode: self.current_join_mode
    };
  }

  function entityPoint(entity) {
    if (!entity) return null;
    const x = Number(entity.x);
    const y = Number(entity.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  }

  function pointDistance(a, b) {
    if (!a || !b) return Infinity;
    return Math.hypot(Number(a.x) - Number(b.x), Number(a.y) - Number(b.y));
  }

  function getSnapshotSelf() {
    const id = getCurrentUserId();
    if (!id) return null;
    return (bot.globalState.entities || []).find(entity => Number(entity.user_id) === Number(id)) || null;
  }

  function currentVelocityCommandActive() {
    const t = Date.now();
    const lastAt = Number(bot.control.lastNonZeroVelocityAt || 0);
    const since = Number(bot.control.nonZeroVelocitySince || 0);
    return Boolean(since && lastAt && t - lastAt <= Math.max(100, Number(cfg.serverPositionCommandFreshMs || 900)));
  }

  function summarizeServerPositionStall(state = bot.serverPositionStall) {
    if (!state) return null;
    return {
      active: Boolean(state.active),
      stalled: Boolean(state.stalled),
      reason: state.reason || '',
      stalledAt: state.stalledAt || 0,
      holdRemainingMs: state.stalledUntil ? Math.max(0, Math.round(Number(state.stalledUntil || 0) - Date.now())) : 0,
      ageMs: state.startedAt ? Math.max(0, Date.now() - Number(state.startedAt || 0)) : 0,
      movingMs: state.movingSince ? Math.max(0, Date.now() - Number(state.movingSince || 0)) : 0,
      clientMoved: Number.isFinite(Number(state.clientMoved)) ? Math.round(Number(state.clientMoved)) : null,
      serverMoved: Number.isFinite(Number(state.serverMoved)) ? Math.round(Number(state.serverMoved)) : null,
      gap: Number.isFinite(Number(state.gap)) ? Math.round(Number(state.gap)) : null,
      gapDelta: Number.isFinite(Number(state.gapDelta)) ? Math.round(Number(state.gapDelta)) : null,
      noServerMove: Boolean(state.noServerMove),
      snapshotAgeMs: Number.isFinite(Number(state.snapshotAgeMs)) ? Math.round(Number(state.snapshotAgeMs)) : null,
      client: state.client ? { x: Math.round(Number(state.client.x) || 0), y: Math.round(Number(state.client.y) || 0) } : null,
      server: state.server ? { x: Math.round(Number(state.server.x) || 0), y: Math.round(Number(state.server.y) || 0) } : null
    };
  }

  function resetServerPositionStall(reason = '') {
    if (bot.serverPositionStall) bot.serverPositionStall.reason = reason || 'reset';
    bot.serverPositionStall = null;
  }

  function summarizeActionSettlementStall(state = bot.actionSettlementStall) {
    if (!state) return null;
    const t = Date.now();
    return {
      active: Boolean(state.active),
      stalled: Boolean(state.stalled),
      reason: state.reason || '',
      startedAt: state.startedAt || 0,
      stalledAt: state.stalledAt || 0,
      ageMs: state.startedAt ? Math.max(0, Math.round(t - Number(state.startedAt || 0))) : 0,
      moveIntent: Boolean(state.moveIntent),
      shootIntent: Boolean(state.shootIntent),
      movementAckStale: Boolean(state.movementAckStale),
      movementAckAgeMs: Number.isFinite(Number(state.movementAckAgeMs)) ? Math.round(Number(state.movementAckAgeMs)) : null,
      noSelfProgress: Boolean(state.noSelfProgress),
      noTargetProgress: Boolean(state.noTargetProgress),
      selfMoved: Number.isFinite(Number(state.selfMoved)) ? Math.round(Number(state.selfMoved)) : null,
      targetId: state.targetId || '',
      targetHp: Number.isFinite(Number(state.targetHp)) ? Number(state.targetHp) : null,
      actionKind: state.actionKind || '',
      actionReason: state.actionReason || ''
    };
  }

  function resetActionSettlementStall(reason = '') {
    if (bot.actionSettlementStall) bot.actionSettlementStall.reason = reason || 'reset';
    bot.actionSettlementStall = null;
  }

  function actionSettlementNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function actionSettlementEntityHp(entity) {
    const candidates = [
      entity?.hp,
      entity?.knownHp,
      entity?.displayHp,
      entity?.health
    ];
    for (const value of candidates) {
      const number = actionSettlementNumber(value);
      if (number !== null) return number;
    }
    return null;
  }

  function actionSettlementTarget(action = {}) {
    return action?.target || action?.combatTarget || bot.combatTarget || null;
  }

  function actionSettlementSample(self, action = {}) {
    if (!self) return null;
    const stamina = summarizeStamina(self);
    const target = actionSettlementTarget(action);
    const targetId = target?.id ?? target?.user_id ?? '';
    return {
      x: actionSettlementNumber(self.x),
      y: actionSettlementNumber(self.y),
      hp: actionSettlementNumber(self.hp),
      stamina5s: actionSettlementNumber(stamina.stamina5s),
      stamina1h: actionSettlementNumber(stamina.stamina1h),
      stamina1d: actionSettlementNumber(stamina.stamina1d),
      coins: actionSettlementNumber(self.coins),
      drop: actionSettlementNumber(dropValue(self)),
      targetId: targetId === null || targetId === undefined ? '' : String(targetId),
      targetHp: actionSettlementEntityHp(target)
    };
  }

  function actionSettlementStableNumber(a, b) {
    if (a === null && b === null) return true;
    if (a === null || b === null) return false;
    return Math.abs(Number(a) - Number(b)) < 0.001;
  }

  function actionSettlementSelfProgress(origin, current, minMove) {
    if (!origin || !current) return true;
    const moved = pointDistance(origin, current);
    const vitalChanged = !actionSettlementStableNumber(origin.hp, current.hp)
      || !actionSettlementStableNumber(origin.stamina5s, current.stamina5s)
      || !actionSettlementStableNumber(origin.stamina1h, current.stamina1h)
      || !actionSettlementStableNumber(origin.stamina1d, current.stamina1d)
      || !actionSettlementStableNumber(origin.coins, current.coins)
      || !actionSettlementStableNumber(origin.drop, current.drop);
    return Boolean(moved >= minMove || vitalChanged);
  }

  function actionSettlementTargetProgress(origin, current) {
    if (!origin || !current) return true;
    if (!origin.targetId && !current.targetId) return false;
    if (origin.targetId !== current.targetId) return true;
    if (origin.targetHp === null && current.targetHp === null) return false;
    return !actionSettlementStableNumber(origin.targetHp, current.targetHp);
  }

  function assessActionSettlementStall(self, action = bot.lastDecision) {
    if (!cfg.actionSettlementStallOfflineEnabled) {
      resetActionSettlementStall('disabled');
      return null;
    }
    const t = Date.now();
    const dx = Number(action?.dx || 0);
    const dy = Number(action?.dy || 0);
    const moveIntent = Boolean(dx || dy || currentVelocityCommandActive());
    const shootIntent = Boolean(action?.shoot && (action?.kind === 'attack' || action?.combat || action?.target));
    if (!self || !isAlive(self) || (!moveIntent && !shootIntent) || bot.pendingExit) {
      resetActionSettlementStall(!self ? 'no-self' : (!isAlive(self) ? 'not-alive' : 'no-action-intent'));
      return null;
    }
    const sample = actionSettlementSample(self, action || {});
    if (!sample || sample.x === null || sample.y === null) {
      resetActionSettlementStall('missing-self-sample');
      return null;
    }
    const minMove = Math.max(1, Number(cfg.actionSettlementStallMoveMinDistance || 80) || 80);
    let state = bot.actionSettlementStall;
    if (!state || !state.active || state.moveIntent !== moveIntent || state.shootIntent !== shootIntent) {
      state = {
        active: true,
        stalled: false,
        reason: 'tracking',
        startedAt: t,
        stalledAt: 0,
        origin: sample,
        latest: sample,
        moveIntent,
        shootIntent,
        actionKind: action?.kind || '',
        actionReason: action?.reason || ''
      };
      bot.actionSettlementStall = state;
      return summarizeActionSettlementStall(state);
    }

    const selfProgress = actionSettlementSelfProgress(state.origin, sample, minMove);
    const targetProgress = actionSettlementTargetProgress(state.origin, sample);
    if (selfProgress || (shootIntent && targetProgress)) {
      state = {
        active: true,
        stalled: false,
        reason: selfProgress ? 'self-progress' : 'target-progress',
        startedAt: t,
        stalledAt: 0,
        origin: sample,
        latest: sample,
        moveIntent,
        shootIntent,
        actionKind: action?.kind || '',
        actionReason: action?.reason || ''
      };
      bot.actionSettlementStall = state;
      return summarizeActionSettlementStall(state);
    }

    const ageMs = Math.max(0, t - Number(state.startedAt || t));
    const network = summarizeNetworkQuality();
    const actionQuality = network?.action || {};
    const ackStaleMs = Math.max(1000, Number(cfg.actionSettlementStallAckStaleMs || 15000) || 15000);
    const lastAckAge = Number(actionQuality.lastMovementAckAgeMs);
    const movementCommands = Math.max(0, Number(actionQuality.movementCommands || 0) || 0);
    const movementAckStale = !moveIntent
      ? false
      : (Number.isFinite(lastAckAge) ? lastAckAge >= ackStaleMs : (movementCommands > 0 && ageMs >= ackStaleMs));
    const settleMs = Math.max(1000, Number(cfg.actionSettlementStallMs || 15000) || 15000);
    const noSelfProgress = !selfProgress;
    const noTargetProgress = !targetProgress;
    const stalled = ageMs >= settleMs
      && noSelfProgress
      && ((moveIntent && movementAckStale) || (shootIntent && noTargetProgress));
    Object.assign(state, {
      stalled,
      reason: stalled ? 'action-settlement-stalled' : 'tracking',
      stalledAt: stalled ? (state.stalledAt || t) : 0,
      latest: sample,
      moveIntent,
      shootIntent,
      movementAckStale,
      movementAckAgeMs: Number.isFinite(lastAckAge) ? lastAckAge : null,
      noSelfProgress,
      noTargetProgress,
      selfMoved: pointDistance(state.origin, sample),
      targetId: sample.targetId,
      targetHp: sample.targetHp,
      actionKind: action?.kind || '',
      actionReason: action?.reason || ''
    });
    if (stalled) bot.control.lastError = 'action settlement stalled';
    else if (bot.control.lastError === 'action settlement stalled') bot.control.lastError = '';
    return summarizeActionSettlementStall(state);
  }

  function assessServerPositionStall(self) {
    if (!cfg.serverPositionStallEnabled) {
      resetServerPositionStall('disabled');
      return null;
    }
    const t = Date.now();
    if (bot.serverPositionStall?.stalled && t < Number(bot.serverPositionStall.stalledUntil || 0)) {
      return summarizeServerPositionStall(bot.serverPositionStall);
    }
    const movingSince = Number(bot.control.nonZeroVelocitySince || 0);
    const commandActive = currentVelocityCommandActive();
    const client = entityPoint(self);
    const serverSelf = getSnapshotSelf();
    const server = entityPoint(serverSelf);
    const snapshotAgeMs = bot.globalState.snapshotRefreshedAt
      ? t - Number(bot.globalState.snapshotRefreshedAt || 0)
      : Infinity;
    const snapshotFresh = snapshotAgeMs <= Math.max(500, Number(cfg.serverPositionSnapshotMaxAgeMs || 2500));
    if (!commandActive || !client || !server || !snapshotFresh || !bot.control.wsOpen) {
      if (!commandActive || !bot.control.wsOpen) resetServerPositionStall(commandActive ? 'ws-offline' : 'not-moving');
      return summarizeServerPositionStall();
    }

    let state = bot.serverPositionStall;
    if (!state || !state.active || Number(state.movingSince || 0) !== movingSince) {
      state = {
        active: true,
        stalled: false,
        reason: 'tracking',
        startedAt: t,
        movingSince,
        clientOrigin: client,
        serverOrigin: server,
        baseGap: pointDistance(client, server),
        client,
        server,
        clientMoved: 0,
        serverMoved: 0,
        gap: pointDistance(client, server),
        gapDelta: 0,
        snapshotAgeMs
      };
      bot.serverPositionStall = state;
      return summarizeServerPositionStall(state);
    }

    const serverMoved = pointDistance(server, state.serverOrigin);
    const serverMoveMax = Math.max(0, Number(cfg.serverPositionServerMoveMax || 80));
    if (serverMoved > serverMoveMax) {
      state = {
        active: true,
        stalled: false,
        reason: 'server-moved',
        startedAt: t,
        movingSince,
        clientOrigin: client,
        serverOrigin: server,
        baseGap: pointDistance(client, server),
        client,
        server,
        clientMoved: 0,
        serverMoved: 0,
        gap: pointDistance(client, server),
        gapDelta: 0,
        snapshotAgeMs
      };
      bot.serverPositionStall = state;
      return summarizeServerPositionStall(state);
    }

    const clientMoved = pointDistance(client, state.clientOrigin);
    const gap = pointDistance(client, server);
    const gapDelta = Math.max(0, gap - Number(state.baseGap || 0));
    const movingMs = t - movingSince;
    const ageMs = t - Number(state.startedAt || t);
    const stallMs = Math.max(500, Number(cfg.serverPositionStallMs || 2500));
    const configuredNoMoveStallMs = Number(cfg.serverPositionNoMoveStallMs);
    const noMoveStallMs = Number.isFinite(configuredNoMoveStallMs) && configuredNoMoveStallMs > 0
      ? Math.max(stallMs, configuredNoMoveStallMs)
      : 0;
    const clientDiverged = movingMs >= stallMs
      && ageMs >= stallMs
      && clientMoved >= Math.max(0, Number(cfg.serverPositionClientMoveMin || 300))
      && serverMoved <= serverMoveMax
      && (gap >= Math.max(0, Number(cfg.serverPositionGapMin || 400))
        || gapDelta >= Math.max(0, Number(cfg.serverPositionGapMin || 400)));
    const noServerMove = noMoveStallMs > 0
      && movingMs >= noMoveStallMs
      && ageMs >= noMoveStallMs
      && serverMoved <= serverMoveMax;
    const stalled = clientDiverged || noServerMove;
    Object.assign(state, {
      stalled,
      reason: stalled ? (noServerMove ? 'server-position-no-move' : 'server-position-stalled') : 'tracking',
      stalledAt: stalled ? (state.stalledAt || t) : 0,
      stalledUntil: stalled ? Math.max(Number(state.stalledUntil || 0), t + Math.max(1000, Number(cfg.serverPositionStallHoldMs || 6000))) : 0,
      client,
      server,
      clientMoved,
      serverMoved,
      gap,
      gapDelta,
      noServerMove,
      snapshotAgeMs
    });
    if (stalled && cfg.serverPositionStallOfflineEnabled) {
      bot.control.lastError = 'server position stalled';
    } else if (bot.control.lastError === 'server position stalled') {
      bot.control.lastError = '';
    }
    return summarizeServerPositionStall(state);
  }

  function resetSessionStaminaStats(session, selfSummary, t = Date.now()) {
    const remaining = Number(selfSummary?.stamina1d ?? selfSummary?.stamina?.stamina1d ?? NaN);
    const limit = Number(selfSummary?.stamina1dLimit ?? selfSummary?.stamina?.stamina1dLimit ?? NaN);
    const cleanLimit = Number.isFinite(limit) && limit > 0 ? limit : null;
    const maxObserved = Number.isFinite(remaining) ? remaining : null;
    const minObserved = Number.isFinite(remaining) ? remaining : null;
    session.stamina1dSpentBeforeSegment = 0;
    session.stamina1dSpentMs = 0;
    session.stamina1dSegmentStartedAt = dailyStaminaWindowStartAt(t);
    session.stamina1dSegmentBase = maxObserved;
    session.stamina1dObservedMax = maxObserved;
    session.stamina1dObservedMin = minObserved;
    session.stamina1dLastRemaining = minObserved;
    session.stamina1dLastLimit = cleanLimit;
  }

  function updateSessionStaminaStats(session, selfSummary, t = Date.now()) {
    const remaining = Number(selfSummary?.stamina1d ?? selfSummary?.stamina?.stamina1d ?? NaN);
    if (!Number.isFinite(remaining)) return;
    const limitRaw = Number(selfSummary?.stamina1dLimit ?? selfSummary?.stamina?.stamina1dLimit ?? NaN);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : null;
    const dayStart = dailyStaminaWindowStartAt(t);
    let segmentStart = Number(session.stamina1dSegmentStartedAt || 0);
    let observedMax = Number(session.stamina1dObservedMax);
    let observedMin = Number(session.stamina1dObservedMin);
    if (!Number.isFinite(observedMax)) observedMax = Number(session.stamina1dSegmentBase);
    if (!Number.isFinite(observedMin)) observedMin = Number(session.stamina1dLastRemaining);
    if (!segmentStart || !Number.isFinite(observedMax)) {
      session.stamina1dSegmentStartedAt = dayStart;
      session.stamina1dSegmentBase = remaining;
      session.stamina1dObservedMax = remaining;
      session.stamina1dObservedMin = remaining;
      session.stamina1dLastRemaining = remaining;
      session.stamina1dLastLimit = limit;
      session.stamina1dSpentBeforeSegment = Math.max(0, Number(session.stamina1dSpentBeforeSegment || 0) || 0);
      session.stamina1dSpentMs = Math.max(0, Math.round(Number(session.stamina1dSpentBeforeSegment || 0) || 0));
      return;
    }
    if (segmentStart !== dayStart) {
      const previousMin = Number.isFinite(observedMin)
        ? observedMin
        : (Number.isFinite(Number(session.stamina1dLastRemaining)) ? Number(session.stamina1dLastRemaining) : observedMax);
      const previousSpent = Math.max(0, observedMax - previousMin);
      session.stamina1dSpentBeforeSegment = Math.max(0, Number(session.stamina1dSpentBeforeSegment || 0) || 0) + previousSpent;
      session.stamina1dSegmentStartedAt = dayStart;
      session.stamina1dSegmentBase = remaining;
      session.stamina1dObservedMax = remaining;
      session.stamina1dObservedMin = remaining;
      observedMax = Number(session.stamina1dObservedMax);
      observedMin = remaining;
    } else {
      observedMax = Math.max(
        Number.isFinite(observedMax) ? observedMax : remaining,
        remaining
      );
      observedMin = Number.isFinite(observedMin) ? Math.min(observedMin, remaining) : remaining;
      session.stamina1dSegmentBase = observedMax;
      session.stamina1dObservedMax = observedMax;
      session.stamina1dObservedMin = observedMin;
    }
    const segmentSpent = Math.max(0, observedMax - observedMin);
    const totalSpent = Math.max(0, Number(session.stamina1dSpentBeforeSegment || 0) || 0) + segmentSpent;
    session.stamina1dSpentMs = Math.max(0, Math.round(totalSpent));
    session.stamina1dLastRemaining = remaining;
    session.stamina1dLastLimit = limit;
  }

  function updateSessionStats(selfSummary) {
    const t = Date.now();
    const session = bot.session || (bot.session = {});
    if (!selfSummary) {
      if (session.startedAt && !session.missingSince) session.missingSince = t;
      return;
    }
    if (selfSummary.life === 'Dead' || selfSummary.life === 'WaitingRevive') {
      if (session.startedAt && !session.missingSince) {
        session.missingSince = t;
        noteImportantSessionExit('not-alive:' + (selfSummary.life || 'unknown'), selfSummary || bot.lastSelf, t);
      }
      return;
    }
    const userId = selfSummary.id ?? null;
    const coins = Number(selfSummary.coins || 0);
    const missingMs = session.missingSince ? t - Number(session.missingSince || 0) : 0;
    const reset = !session.startedAt
      || (userId !== null && session.userId !== null && String(session.userId) !== String(userId))
      || missingMs > Math.max(1000, Number(cfg.sessionResetMissingMs || 10000));
    if (reset) {
      if (session.startedAt && session.importantSessionId && !session.exitAt) {
        noteImportantSessionExit(userId !== null && session.userId !== null && String(session.userId) !== String(userId) ? 'user-changed' : 'session-reset', bot.lastSelf || selfSummary, session.missingSince || t);
      }
      session.startedAt = t;
      session.userId = userId;
      session.importantSessionId = '';
      session.importantStartEventId = '';
      session.importantEndEventId = '';
      session.exitAt = 0;
      session.exitReason = '';
      session.exitSummary = '';
      session.baseCoins = Number.isFinite(coins) ? coins : 0;
      session.coinsGained = 0;
      session.coinPickupTotal = 0;
      session.coinPickupKeys = [];
      session.kills = 0;
      resetSessionStaminaStats(session, selfSummary, t);
      session.combatLogSentBase = Number(bot.combatLogging?.sent || 0) || 0;
      session.combatLogFailedBase = Number(bot.combatLogging?.failed || 0) || 0;
      startImportantSession(session, selfSummary, t);
    } else if (session.userId === null && userId !== null) {
      session.userId = userId;
    }
    if (!session.importantSessionId) startImportantSession(session, selfSummary, Number(session.startedAt || t) || t);
    session.missingSince = 0;
    session.exitAt = 0;
    session.exitReason = '';
    session.exitSummary = '';
    if (!Number.isFinite(Number(session.baseCoins))) session.baseCoins = Number.isFinite(coins) ? coins : 0;
    if (!Number.isFinite(Number(session.combatLogSentBase))) session.combatLogSentBase = Number(bot.combatLogging?.sent || 0) || 0;
    if (!Number.isFinite(Number(session.combatLogFailedBase))) session.combatLogFailedBase = Number(bot.combatLogging?.failed || 0) || 0;
    if (!Number.isFinite(Number(session.coinPickupTotal))) session.coinPickupTotal = 0;
    if (!Array.isArray(session.coinPickupKeys)) session.coinPickupKeys = [];
    const coinDiff = Math.max(0, Math.round((Number.isFinite(coins) ? coins : 0) - Number(session.baseCoins || 0)));
    session.coinsGained = Math.max(
      Math.max(0, Number(session.coinsGained || 0) || 0),
      Math.max(0, Number(session.coinPickupTotal || 0) || 0),
      coinDiff
    );
    updateSessionStaminaStats(session, selfSummary, t);
    const killCount = bot.killHistory.filter(item => Number(item?.at || 0) >= Number(session.startedAt || 0)).length;
    session.kills = Math.max(Math.max(0, Number(session.kills || 0) || 0), killCount);
    if (typeof writePersistentLastSelfState === 'function') writePersistentLastSelfState(selfSummary, t);
  }

  function summarizeSessionStats(selfSummary) {
    const session = bot.session || {};
    const startedAt = Number(session.startedAt || 0);
    const stoppedAt = Number(session.missingSince || 0) || 0;
    return {
      startedAt,
      uptimeMs: startedAt ? Math.max(0, (stoppedAt || Date.now()) - startedAt) : 0,
      uptimeStoppedAt: stoppedAt,
      baseCoins: Number.isFinite(Number(session.baseCoins)) ? Number(session.baseCoins) : null,
      coins: Number(selfSummary?.coins || 0),
      coinsGained: Math.max(0, Number(session.coinsGained || 0) || 0),
      coinPickupTotal: Math.max(0, Number(session.coinPickupTotal || 0) || 0),
      kills: Math.max(0, Number(session.kills || 0) || 0),
      stamina1dSpentMs: Math.max(0, Math.round(Number(session.stamina1dSpentMs || 0) || 0)),
      stamina1dSegmentStartedAt: Number(session.stamina1dSegmentStartedAt || 0) || 0,
      stamina1dObservedMax: Number.isFinite(Number(session.stamina1dObservedMax)) ? Number(session.stamina1dObservedMax) : null,
      stamina1dObservedMin: Number.isFinite(Number(session.stamina1dObservedMin)) ? Number(session.stamina1dObservedMin) : null,
      stamina1dLastRemaining: Number.isFinite(Number(session.stamina1dLastRemaining)) ? Number(session.stamina1dLastRemaining) : null,
      stamina1dLastLimit: Number.isFinite(Number(session.stamina1dLastLimit)) ? Number(session.stamina1dLastLimit) : null,
      combatLogSent: Math.max(0, Math.round((Number(bot.combatLogging?.sent || 0) || 0) - (Number(session.combatLogSentBase || 0) || 0))),
      combatLogFailed: Math.max(0, Math.round((Number(bot.combatLogging?.failed || 0) || 0) - (Number(session.combatLogFailedBase || 0) || 0))),
      userId: session.userId ?? null
    };
  }

  function readTodaySessionRecords(dayStart) {
    try {
      if (typeof readImportantLogsStore !== 'function') return [];
      const store = readImportantLogsStore();
      const sessions = Array.isArray(store?.sessions) ? store.sessions : [];
      return sessions.filter(record => Number(record?.loginAt || 0) >= dayStart);
    } catch (_) {
      return [];
    }
  }

  function maybeSetLatestTodayStamina(out, record, latestAtRef) {
    const stamp = Math.max(
      Number(record?.updatedAt || 0) || 0,
      Number(record?.exitAt || 0) || 0,
      Number(record?.loginAt || 0) || 0
    );
    if (stamp < latestAtRef.value) return;
    const remaining = Number(record?.stamina1dLastRemaining);
    const limit = Number(record?.stamina1dLastLimit);
    if (!Number.isFinite(remaining)) return;
    out.stamina1dLastRemaining = remaining;
    out.stamina1dLastLimit = Number.isFinite(limit) && limit > 0 ? limit : null;
    latestAtRef.value = stamp;
  }

  function dailyStaminaSpentFromRemaining(out) {
    const remaining = Number(out?.stamina1dLastRemaining);
    const limit = Number(out?.stamina1dLastLimit);
    if (!Number.isFinite(remaining) || !(Number.isFinite(limit) && limit > 0)) return null;
    return Math.max(0, Math.round(limit - remaining));
  }

  function addTodaySessionRecord(out, record, latestAtRef) {
    out.uptimeMs += Math.max(0, Math.round(Number(record?.loginDurationMs || 0) || 0));
    out.stamina1dSpentMs += Math.max(0, Math.round(Number(record?.staminaSpentMs || 0) || 0));
    out.coinsGained += Math.max(0, Math.round(Number(record?.coinsGained || 0) || 0));
    out.coinPickupTotal += Math.max(0, Math.round(Number(record?.pickedCoins || record?.coinPickupTotal || 0) || 0));
    out.kills += Math.max(0, Math.round(Number(record?.killCount || 0) || 0));
    out.sessionCount += 1;
    maybeSetLatestTodayStamina(out, record, latestAtRef);
  }

  function summarizeTodaySessionStats(sessionSummary = null, selfSummary = null, t = Date.now()) {
    const dayStart = dailyStaminaWindowStartAt(t);
    const out = {
      dayStartedAt: dayStart,
      uptimeMs: 0,
      stamina1dSpentMs: 0,
      coinsGained: 0,
      coinPickupTotal: 0,
      kills: 0,
      sessionCount: 0,
      stamina1dLastRemaining: null,
      stamina1dLastLimit: null
    };
    const latestStaminaAt = { value: 0 };
    const currentSessionId = String(bot.session?.importantSessionId || '');
    for (const record of readTodaySessionRecords(dayStart)) {
      if (currentSessionId && String(record?.sessionId || '') === currentSessionId) continue;
      addTodaySessionRecord(out, record, latestStaminaAt);
    }
    const startedAt = Number(sessionSummary?.startedAt || 0) || 0;
    if (startedAt >= dayStart) {
      out.uptimeMs += Math.max(0, Math.round(Number(sessionSummary?.uptimeMs || 0) || 0));
      out.stamina1dSpentMs += Math.max(0, Math.round(Number(sessionSummary?.stamina1dSpentMs || 0) || 0));
      out.coinsGained += Math.max(0, Math.round(Number(sessionSummary?.coinsGained || 0) || 0));
      out.coinPickupTotal += Math.max(0, Math.round(Number(sessionSummary?.coinPickupTotal || 0) || 0));
      out.kills += Math.max(0, Math.round(Number(sessionSummary?.kills || 0) || 0));
      out.sessionCount += 1;
      maybeSetLatestTodayStamina(out, {
        updatedAt: t,
        loginAt: startedAt,
        stamina1dLastRemaining: sessionSummary?.stamina1dLastRemaining,
        stamina1dLastLimit: sessionSummary?.stamina1dLastLimit
      }, latestStaminaAt);
    }
    const selfRemaining = Number(selfSummary?.stamina1d ?? selfSummary?.stamina?.stamina1d);
    const selfLimit = Number(selfSummary?.stamina1dLimit ?? selfSummary?.stamina?.stamina1dLimit);
    if (Number.isFinite(selfRemaining)) {
      out.stamina1dLastRemaining = selfRemaining;
      out.stamina1dLastLimit = Number.isFinite(selfLimit) && selfLimit > 0 ? selfLimit : out.stamina1dLastLimit;
    }
    const actualSpent = dailyStaminaSpentFromRemaining(out);
    if (actualSpent !== null) out.stamina1dSpentMs = Math.max(out.stamina1dSpentMs, actualSpent);
    return out;
  }

  function pushBounded(list, item, max) {
    list.push(item);
    while (list.length > max) list.shift();
  }



  function networkQualityRound(value, digits = 0) {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    const factor = Math.pow(10, Math.max(0, Math.round(Number(digits) || 0)));
    return Math.round(n * factor) / factor;
  }

  function networkQualityEma(previous, sample, alpha = 0.2) {
    const value = Number(sample);
    if (!Number.isFinite(value)) return Number.isFinite(Number(previous)) ? Number(previous) : null;
    const prev = Number(previous);
    if (!Number.isFinite(prev)) return value;
    const a = clamp(Number(alpha) || 0.2, 0.01, 1);
    return prev + (value - prev) * a;
  }

  function ensureNetworkQualityState() {
    if (!bot.networkQuality || typeof bot.networkQuality !== 'object') {
      bot.networkQuality = {
        startedAt: Date.now(),
        frameSamples: [],
        pendingShots: [],
        pendingMovement: null,
        frameCount: 0,
        frameGapCount: 0,
        estimatedLostFrames: 0,
        expectedFrames: 0,
        movementCommandCount: 0,
        movementAckCount: 0,
        movementTimeoutCount: 0,
        attackShotCount: 0,
        attackAckCount: 0,
        attackTimeoutCount: 0,
        lastDiagnosticLogAt: 0,
        lastDiagnosticSignature: ''
      };
    }
    if (!Array.isArray(bot.networkQuality.frameSamples)) bot.networkQuality.frameSamples = [];
    if (!Array.isArray(bot.networkQuality.pendingShots)) bot.networkQuality.pendingShots = [];
    return bot.networkQuality;
  }

  function networkQualityPoint(entity) {
    const x = Number(entity?.x);
    const y = Number(entity?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  }

  function networkQualityDistance(a, b) {
    if (!a || !b) return Infinity;
    return Math.hypot(Number(a.x) - Number(b.x), Number(a.y) - Number(b.y));
  }

  function networkQualityWindowMs() {
    return Math.max(5000, Number(cfg.networkQualityWindowMs || 30000) || 30000);
  }

  function networkQualityBaseFrameMs() {
    const configured = Number(cfg.networkQualityExpectedFrameMs || 0);
    if (Number.isFinite(configured) && configured > 0) return configured;
    return Math.max(40, Number(cfg.combatNativeTickMinMs || cfg.nativeTickMinMs || cfg.tickMs || 120) || 120);
  }

  function networkQualityExpectedFrameMs(q = ensureNetworkQualityState()) {
    const configured = Number(cfg.networkQualityExpectedFrameMs || 0);
    if (Number.isFinite(configured) && configured > 0) return Math.max(20, configured);
    const base = networkQualityBaseFrameMs();
    const minGap = Number(q.frameIntervalMinMs || 0);
    const emaGap = Number(q.frameIntervalEmaMs || 0);
    const learned = Number.isFinite(minGap) && minGap > 0
      ? Math.min(emaGap > 0 ? emaGap : minGap, minGap * 1.35)
      : (emaGap > 0 ? emaGap : base);
    return Math.max(20, Math.min(Math.max(base * 2.5, 250), learned || base));
  }

  function pruneNetworkQualityFrameSamples(q, t = Date.now()) {
    const cutoff = t - networkQualityWindowMs();
    q.frameSamples = (Array.isArray(q.frameSamples) ? q.frameSamples : []).filter(sample => Number(sample.at || 0) >= cutoff);
    let lost = 0;
    let expected = 0;
    let maxGap = 0;
    for (const sample of q.frameSamples) {
      lost += Math.max(0, Number(sample.lost || 0) || 0);
      expected += Math.max(1, Number(sample.expected || 1) || 1);
      maxGap = Math.max(maxGap, Number(sample.gap || 0) || 0);
    }
    q.estimatedLostFrames = lost;
    q.expectedFrames = expected;
    q.lossRate = expected > 0 ? lost / expected : 0;
    q.maxFrameGapMs = maxGap;
  }

  function networkQualityFrameLatencySample(gapMs, expectedMs, lostFrames) {
    const gap = Math.max(0, Number(gapMs) || 0);
    const expected = Math.max(20, Number(expectedMs) || networkQualityBaseFrameMs());
    const excess = Math.max(0, gap - expected);
    const base = Math.min(expected, networkQualityBaseFrameMs());
    const lossPenalty = Math.max(0, Number(lostFrames || 0)) * Math.min(expected, 120);
    return Math.max(0, base + excess + lossPenalty);
  }

  function estimateNetworkQualityLostFrames(gapMs, expectedMs) {
    const gap = Math.max(0, Number(gapMs) || 0);
    const expected = Math.max(20, Number(expectedMs) || networkQualityBaseFrameMs());
    const ratio = Math.max(1.25, Number(cfg.networkQualityFrameLossGapRatio || 2.25) || 2.25);
    const extra = Math.max(0, Number(cfg.networkQualityFrameLossGapMinExtraMs || 180) || 180);
    if (gap < expected * ratio && gap < expected + extra) return 0;
    return Math.max(1, Math.round(gap / expected) - 1);
  }

  function observeNativeWsFrame(source = 'native-ws') {
    if (!cfg.networkQualityEnabled) return null;
    const q = ensureNetworkQualityState();
    const t = Date.now();
    const previousAt = Number(q.lastFrameAt || 0);
    const gap = previousAt ? Math.max(0, t - previousAt) : 0;
    q.lastFrameAt = t;
    q.lastFrameSource = String(source || 'native-ws');
    q.frameCount = Math.max(0, Number(q.frameCount || 0) || 0) + 1;
    if (gap > 0 && gap < 60000) {
      const expectedBefore = networkQualityExpectedFrameMs(q);
      const lost = estimateNetworkQualityLostFrames(gap, expectedBefore);
      q.frameGapCount = Math.max(0, Number(q.frameGapCount || 0) || 0) + 1;
      q.lastFrameGapMs = Math.round(gap);
      q.frameIntervalEmaMs = networkQualityEma(q.frameIntervalEmaMs, gap, 0.18);
      if (gap >= 20 && gap <= Math.max(1000, expectedBefore * 4) && (!q.frameIntervalMinMs || gap < Number(q.frameIntervalMinMs))) {
        q.frameIntervalMinMs = Math.round(gap);
      }
      const expectedAfter = networkQualityExpectedFrameMs(q);
      q.expectedFrameMs = Math.round(expectedAfter);
      q.jitterEmaMs = networkQualityEma(q.jitterEmaMs, Math.abs(gap - expectedAfter), 0.18);
      q.stateLatencyEmaMs = networkQualityEma(q.stateLatencyEmaMs, networkQualityFrameLatencySample(gap, expectedAfter, lost), 0.22);
      q.frameSamples.push({
        at: t,
        gap: Math.round(gap),
        expected: Math.max(1, lost + 1),
        lost
      });
    }
    pruneNetworkQualityFrameSamples(q, t);
    return summarizeNetworkQuality(t);
  }

  function recordNetworkQualityMovementCommand(dx, dy, self = null, detail = {}) {
    if (!cfg.networkQualityEnabled || !(dx || dy)) return null;
    const q = ensureNetworkQualityState();
    const t = Date.now();
    const pending = q.pendingMovement;
    const minMs = Math.max(100, Number(cfg.networkQualityMovementCommandMinMs || 350) || 350);
    if (pending && t - Number(pending.at || 0) < minMs && Number(pending.dx || 0) === Number(dx) && Number(pending.dy || 0) === Number(dy)) {
      return pending;
    }
    const point = networkQualityPoint(self || getSelf());
    if (!point) return null;
    q.movementCommandCount = Math.max(0, Number(q.movementCommandCount || 0) || 0) + 1;
    q.pendingMovement = {
      at: t,
      dx: clamp(Math.round(Number(dx) || 0), -1, 1),
      dy: clamp(Math.round(Number(dy) || 0), -1, 1),
      origin: point,
      source: detail.source || 'velocity'
    };
    return q.pendingMovement;
  }

  function observeNetworkQualitySelf(self) {
    if (!cfg.networkQualityEnabled || !self) return null;
    const q = ensureNetworkQualityState();
    const t = Date.now();
    const point = networkQualityPoint(self);
    const pending = q.pendingMovement;
    if (pending && point && pending.origin) {
      const elapsed = Math.max(0, t - Number(pending.at || t));
      const moved = networkQualityDistance(point, pending.origin);
      const minMove = Math.max(1, Number(cfg.networkQualityMovementAckMinDistance || 40) || 40);
      const timeoutMs = Math.max(1000, Number(cfg.networkQualityActionAckTimeoutMs || 5000) || 5000);
      if (moved >= minMove) {
        q.movementAckCount = Math.max(0, Number(q.movementAckCount || 0) || 0) + 1;
        q.lastMovementAckAt = t;
        q.lastMovementAckMs = Math.round(elapsed);
        q.movementAckEmaMs = networkQualityEma(q.movementAckEmaMs, elapsed, 0.28);
        q.actionLatencyEmaMs = networkQualityEma(q.actionLatencyEmaMs, elapsed, 0.24);
        q.lastActionAckAt = t;
        q.lastActionAckSource = 'movement';
        q.pendingMovement = null;
      } else if (elapsed >= timeoutMs) {
        q.movementTimeoutCount = Math.max(0, Number(q.movementTimeoutCount || 0) || 0) + 1;
        q.lastMovementTimeoutAt = t;
        q.lastMovementTimeoutMs = Math.round(elapsed);
        q.pendingMovement = null;
      }
    }
    return summarizeNetworkQuality(t);
  }

  function networkQualityTargetId(target) {
    const id = target?.id ?? target?.user_id;
    return id === null || id === undefined ? '' : String(id);
  }

  function recordNetworkQualityShot(self, target, detail = {}) {
    if (!cfg.networkQualityEnabled || !target || !detail.sent || detail.blockedByCadence) return;
    const q = ensureNetworkQualityState();
    const targetId = networkQualityTargetId(target);
    if (!targetId) return;
    const t = Number(detail.at || Date.now());
    q.attackShotCount = Math.max(0, Number(q.attackShotCount || 0) || 0) + 1;
    q.pendingShots.push({
      at: t,
      targetId,
      targetName: target.name || target.label || '',
      targetHp: Number.isFinite(Number(target.hp)) ? Number(target.hp) : null,
      distance: Number.isFinite(Number(target.distance)) ? Math.round(Number(target.distance)) : null
    });
    const timeoutMs = Math.max(1000, Number(cfg.networkQualityActionAckTimeoutMs || 5000) || 5000);
    const cutoff = Date.now() - timeoutMs;
    const expired = q.pendingShots.filter(shot => Number(shot.at || 0) < cutoff);
    if (expired.length) q.attackTimeoutCount = Math.max(0, Number(q.attackTimeoutCount || 0) || 0) + expired.length;
    q.pendingShots = q.pendingShots.filter(shot => Number(shot.at || 0) >= cutoff).slice(-20);
  }

  function recordNetworkQualityAttackDamage(target, damageAmount, t = Date.now()) {
    if (!cfg.networkQualityEnabled || !target) return null;
    const q = ensureNetworkQualityState();
    const targetId = networkQualityTargetId(target);
    if (!targetId || !Array.isArray(q.pendingShots) || !q.pendingShots.length) return null;
    const matching = q.pendingShots.filter(shot => String(shot.targetId || '') === targetId && Number(shot.at || 0) <= t);
    if (!matching.length) return null;
    const first = matching[0];
    const last = matching[matching.length - 1];
    const firstDelayMs = Math.max(0, t - Number(first.at || t));
    const lastDelayMs = Math.max(0, t - Number(last.at || t));
    q.attackAckCount = Math.max(0, Number(q.attackAckCount || 0) || 0) + 1;
    q.lastAttackAckAt = t;
    q.lastAttackAckMs = Math.round(lastDelayMs);
    q.lastAttackAckFirstShotMs = Math.round(firstDelayMs);
    q.lastAttackAckShotCount = matching.length;
    q.lastAttackAckDamage = Number.isFinite(Number(damageAmount)) ? networkQualityRound(damageAmount, 2) : null;
    q.attackAckEmaMs = networkQualityEma(q.attackAckEmaMs, lastDelayMs, 0.22);
    q.pendingShots = q.pendingShots.filter(shot => String(shot.targetId || '') !== targetId || Number(shot.at || 0) > t);
    return {
      targetId,
      firstDelayMs: Math.round(firstDelayMs),
      lastDelayMs: Math.round(lastDelayMs),
      shotCount: matching.length
    };
  }



  function summarizeNetworkQuality(t = Date.now()) {
    if (!cfg.networkQualityEnabled) return { enabled: false };
    const q = ensureNetworkQualityState();
    pruneNetworkQualityFrameSamples(q, t);
    const expectedFrameMs = networkQualityExpectedFrameMs(q);
    const frameAgeMs = q.lastFrameAt ? Math.max(0, t - Number(q.lastFrameAt || t)) : null;
    const stallMs = Math.max(
      Number(cfg.networkQualityLogStallMs || 1000) || 1000,
      expectedFrameMs * 4
    );
    const currentStallMs = frameAgeMs !== null && frameAgeMs > expectedFrameMs * 2
      ? Math.max(0, frameAgeMs - expectedFrameMs)
      : 0;
    const projectedLost = currentStallMs > 0
      ? Math.max(0, Math.floor(frameAgeMs / Math.max(20, expectedFrameMs)) - 1)
      : 0;
    const expectedFrames = Math.max(0, Number(q.expectedFrames || 0) || 0) + projectedLost;
    const lostFrames = Math.max(0, Number(q.estimatedLostFrames || 0) || 0) + projectedLost;
    const lossRate = expectedFrames > 0 ? lostFrames / expectedFrames : null;
    const actionFreshMs = Math.max(1000, Number(cfg.networkQualityDisplayActionFreshMs || 30000) || 30000);
    const actionFresh = Boolean(q.lastActionAckAt && t - Number(q.lastActionAckAt || 0) <= actionFreshMs && Number.isFinite(Number(q.actionLatencyEmaMs)));
    const hasFrameLatency = Number.isFinite(Number(q.stateLatencyEmaMs))
      || Number.isFinite(Number(q.frameIntervalEmaMs))
      || Math.max(0, Number(q.frameGapCount || 0) || 0) > 0;
    const frameLatency = hasFrameLatency ? Number(q.stateLatencyEmaMs || q.frameIntervalEmaMs || expectedFrameMs) : null;
    const displayLatency = actionFresh ? Number(q.actionLatencyEmaMs) : frameLatency;
    const movementAttempts = Math.max(0, Number(q.movementCommandCount || 0) || 0);
    const attackAttempts = Math.max(0, Number(q.attackShotCount || 0) || 0);
    const movementTimeoutRate = movementAttempts > 0 ? Math.max(0, Number(q.movementTimeoutCount || 0) || 0) / movementAttempts : 0;
    const attackTimeoutRate = attackAttempts > 0 ? Math.max(0, Number(q.attackTimeoutCount || 0) || 0) / attackAttempts : 0;
    return {
      enabled: true,
      source: 'native-ws-state',
      displayLatencyMs: Number.isFinite(displayLatency) ? Math.max(0, Math.round(displayLatency)) : null,
      latencySource: actionFresh ? String(q.lastActionAckSource || 'action') : 'ws-frame',
      lossPercent: lossRate === null ? null : networkQualityRound(lossRate * 100, 1),
      lossSource: 'ws-frame-gap',
      windowMs: networkQualityWindowMs(),
      sampleCount: Math.max(0, Number(q.frameGapCount || 0) || 0),
      frameCount: Math.max(0, Number(q.frameCount || 0) || 0),
      lastFrameAt: Number(q.lastFrameAt || 0) || 0,
      lastFrameAgeMs: frameAgeMs === null ? null : Math.round(frameAgeMs),
      lastFrameGapMs: Number.isFinite(Number(q.lastFrameGapMs)) ? Math.round(Number(q.lastFrameGapMs)) : null,
      expectedFrameMs: Math.round(expectedFrameMs),
      frameIntervalEmaMs: Number.isFinite(Number(q.frameIntervalEmaMs)) ? Math.round(Number(q.frameIntervalEmaMs)) : null,
      frameIntervalMinMs: Number.isFinite(Number(q.frameIntervalMinMs)) ? Math.round(Number(q.frameIntervalMinMs)) : null,
      jitterEmaMs: Number.isFinite(Number(q.jitterEmaMs)) ? Math.round(Number(q.jitterEmaMs)) : null,
      maxFrameGapMs: Number.isFinite(Number(q.maxFrameGapMs)) ? Math.round(Number(q.maxFrameGapMs)) : null,
      estimatedLostFrames: lostFrames,
      expectedFrames,
      currentStallMs: Math.round(currentStallMs),
      stalled: Boolean(frameAgeMs !== null && frameAgeMs >= stallMs),
      action: {
        movementAckMs: Number.isFinite(Number(q.movementAckEmaMs)) ? Math.round(Number(q.movementAckEmaMs)) : null,
        lastMovementAckMs: Number.isFinite(Number(q.lastMovementAckMs)) ? Math.round(Number(q.lastMovementAckMs)) : null,
        lastMovementAckAgeMs: q.lastMovementAckAt ? Math.max(0, Math.round(t - Number(q.lastMovementAckAt || t))) : null,
        movementCommands: movementAttempts,
        movementAcks: Math.max(0, Number(q.movementAckCount || 0) || 0),
        movementTimeouts: Math.max(0, Number(q.movementTimeoutCount || 0) || 0),
        movementTimeoutPercent: networkQualityRound(movementTimeoutRate * 100, 1),
        attackAckMs: Number.isFinite(Number(q.attackAckEmaMs)) ? Math.round(Number(q.attackAckEmaMs)) : null,
        lastAttackAckMs: Number.isFinite(Number(q.lastAttackAckMs)) ? Math.round(Number(q.lastAttackAckMs)) : null,
        lastAttackAckFirstShotMs: Number.isFinite(Number(q.lastAttackAckFirstShotMs)) ? Math.round(Number(q.lastAttackAckFirstShotMs)) : null,
        lastAttackAckAgeMs: q.lastAttackAckAt ? Math.max(0, Math.round(t - Number(q.lastAttackAckAt || t))) : null,
        attackShots: attackAttempts,
        attackAcks: Math.max(0, Number(q.attackAckCount || 0) || 0),
        attackTimeouts: Math.max(0, Number(q.attackTimeoutCount || 0) || 0),
        attackTimeoutPercent: networkQualityRound(attackTimeoutRate * 100, 1),
        pendingShots: Array.isArray(q.pendingShots) ? q.pendingShots.length : 0
      }
    };
  }
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

  const { buildDropMatchedKillCore } = require('./runtime/drop-matched-kill');





  function rememberCombatEngagement(self, target, action) {
    if (!target) return;
    const id = target.id ?? target.user_id;
    if (id === null || id === undefined) return;
    const previous = bot.combatTarget;
    const same = previous && String(previous.id ?? '') === String(id);
    const t = Date.now();
    const targetDistance = Number.isFinite(Number(target.distance)) ? Number(target.distance) : dist(self, target);
    const intent = action?.target?.combatIntent || action?.combatIntent || target.combatIntent || '';
    const currentHp = knownHpValue(target);
    const previousHp = same && Number.isFinite(Number(previous.hp)) ? Number(previous.hp) : null;
	    const damaged = currentHp !== null && previousHp !== null && currentHp < previousHp - 0.01;
	    if (damaged) recordNetworkQualityAttackDamage(target, Math.max(0, previousHp - currentHp), t);
	    const lastDamageAt = damaged
      ? t
      : (same ? Number(previous.lastDamageAt || previous.at || t) : t);
	    const lastInRangeAt = targetDistance <= Number(cfg.combatAttackRange || 0)
	      ? t
	      : (same ? Number(previous.lastInRangeAt || previous.at || t) : t);
	    const motionSamples = combatMotionSamplesWithCurrent(
	      self,
	      target,
	      t,
	      Math.max(Number(cfg.combatMotionHistoryWindowMs || 2000), Number(cfg.combatTradeEstimateWindowMs || 6000))
	    );
    const incomingOwnerId = action?.incomingBullet?.ownerId ?? action?.incomingBullet?.owner_id ?? null;
    const targetOwnsRealBullet = Boolean(
      action?.incomingBullet
      && !action.incomingBullet.synthetic
      && incomingOwnerId !== null
      && incomingOwnerId !== undefined
      && String(incomingOwnerId) === String(id)
    );
	    bot.combatTarget = {
      id,
      at: t,
      firstSeenAt: same ? Number(previous.firstSeenAt || previous.at || t) : t,
      name: target.name || '',
      x: Math.round(Number(target.x) || 0),
      y: Math.round(Number(target.y) || 0),
      hp: currentHp,
      displayHp: Number.isFinite(Number(target.hp)) ? Number(target.hp) : null,
      drop: Number(target.drop || 0),
      distance: targetDistance,
      reason: action?.reason || '',
      intent,
      originIntent: same ? String(previous.originIntent || previous.intent || intent) : String(intent || ''),
      originReason: same ? String(previous.originReason || previous.reason || '') : String(action?.reason || ''),
      lastDamageAt,
      lastInRangeAt,
	      seenTargetRealBulletAt: targetOwnsRealBullet
	        ? t
	        : (same ? Number(previous.seenTargetRealBulletAt || 0) : 0),
	      lastDamageAmount: damaged ? Math.max(0, previousHp - currentHp) : Number(previous?.lastDamageAmount || 0),
	      noDamageMs: Math.max(0, t - lastDamageAt),
	      motionSamples,
	      self: summarizeSelf(self)
	    };
  }

  function clearCombatEngagement(reason = '') {
    if (!bot.combatTarget) return;
    bot.lastCombatTargetClear = { at: Date.now(), reason };
    bot.combatTarget = null;
    bot.combatAim = null;
    clearCombatDisadvantageObservation(reason || 'combat-engagement-cleared');
  }
























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

	  async function refreshGlobalState(force = false) {
	    const t = Date.now();
	    if (!force && t - bot.globalState.refreshedAt < cfg.globalRefreshMs) return;
	    bot.globalState.refreshedAt = t;
	    bot.globalState.activeRefreshSkippedAt = t;
	    bot.globalState.minimap = null;
	    bot.globalState.error = '';
	    bot.globalState.samplingOutage = null;
	    const completedAt = Date.now();
	    const refreshDiagnostic = {
	      startedAt: t,
	      completedAt,
	      durationMs: 0,
	      force: Boolean(force),
	      skipped: 'passive-snapshot-only-active-game-api-disabled',
	      snapshot: { ok: false, skipped: true, error: '' },
	      minimap: { ok: false, skipped: true, error: '' },
	      error: bot.globalState.error
	    };
	    recordRuntimeDiagnosticsCore(bot, { lastRefresh: refreshDiagnostic });
	  }



	  function wsSend(message) {
	    if (cfg.dryRun) return true;
	    const native = getNativeControl();
	    if (native) {
	      if (!syncNativeControl(native)) {
	        notePageOwnsReconnect();
	        return false;
	      }
	      try {
	        native.ws.send(message);
	        bot.control.lastMessageAt = Date.now();
	        return true;
	      } catch (err) {
	        bot.control.lastError = 'native send: ' + (err.message || String(err));
	        return false;
	      }
	    }
	    if (!ensureControlWs()) return false;
	    return false;
	  }

	  function setNativeKeys(nativeState, dx, dy) {
	    let updated = false;
	    if (nativeState?.keys && typeof nativeState.keys.add === 'function') {
	      for (const key of ['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright']) {
	        nativeState.keys.delete(key);
	      }
	      if (dx < 0) nativeState.keys.add('a');
	      if (dx > 0) nativeState.keys.add('d');
	      if (dy < 0) nativeState.keys.add('w');
	      if (dy > 0) nativeState.keys.add('s');
	      updated = true;
	    }
	    if (nativeState?.touchMove) {
	      nativeState.touchMove.active = false;
	      nativeState.touchMove.dx = 0;
	      nativeState.touchMove.dy = 0;
	      updated = true;
	    }
	    return updated;
	  }

	  function cancelVelocityStopTimer() {
	    if (bot.velocityStopTimer) {
	      clearTimeout(bot.velocityStopTimer);
	      bot.velocityStopTimer = 0;
	    }
	    cancelDirectVelocityRepeat();
	    bot.velocityPulseToken += 1;
	  }

	  function clearNativeMotionState(nativeState) {
	    if (!nativeState) return false;
	    setNativeKeys(nativeState, 0, 0);
	    const vectorFields = ['currentVel', 'targetVel', 'velocity', 'lastNonZeroVel'];
	    for (const field of vectorFields) {
	      const value = nativeState[field];
	      if (value && typeof value === 'object') {
	        if ('dx' in value) value.dx = 0;
	        if ('dy' in value) value.dy = 0;
	        if ('x' in value) value.x = 0;
	        if ('y' in value) value.y = 0;
	      }
	    }
	    if (nativeState.lastVel && typeof nativeState.lastVel === 'object') {
	      if ('dx' in nativeState.lastVel) nativeState.lastVel.dx = 0;
	      if ('dy' in nativeState.lastVel) nativeState.lastVel.dy = 0;
	      if ('x' in nativeState.lastVel) nativeState.lastVel.x = 0;
	      if ('y' in nativeState.lastVel) nativeState.lastVel.y = 0;
	    } else if (Object.prototype.hasOwnProperty.call(nativeState, 'lastVel')) {
	      nativeState.lastVel = '0 0';
	    }
	    if (nativeState.touchMove) {
	      nativeState.touchMove.active = false;
	      nativeState.touchMove.dx = 0;
	      nativeState.touchMove.dy = 0;
	    }
	    const t = now();
	    if (Object.prototype.hasOwnProperty.call(nativeState, 'lastInputAt')) nativeState.lastInputAt = 0;
	    if (Object.prototype.hasOwnProperty.call(nativeState, 'lastStopAt')) nativeState.lastStopAt = t;
	    return true;
	  }

	  function stopLocalMotionOnly(reason = '') {
	    cancelVelocityStopTimer();
	    const nativeState = getNativeState();
	    if (nativeState) clearNativeMotionState(nativeState);
	    bot.control.lastVelocity = '0 0';
	    bot.control.lastVelocityAt = now();
	    bot.control.nonZeroVelocitySince = 0;
    bot.control.lastNonZeroVelocityAt = 0;
    if (reason !== 'server-position-stalled') resetServerPositionStall(reason || 'local-stop');
    if (reason) bot.control.lastLocalStopReason = reason;
    return true;
  }

	  function stopMotionSafely(reason = '') {
	    const native = getNativeControl();
	    if (native?.wsOpen) {
	      stopLocalMotionOnly(reason);
	      bot.control.lastVelocity = '0 0';
	      bot.control.lastVelocityAt = now();
	      const sent = sendNativeVelocity(0, 0, true);
	      if (sent) scheduleDirectVelocityRepeat(0, 0, true);
	      return Boolean(sent);
	    }
	    return stopLocalMotionOnly(reason);
	  }

	  function stopMotionAfterExit(reason = 'exit-confirmed') {
	    stopMotionSafely(reason);
	    bot.lastExitMotionStopAt = Date.now();
	    bot.lastExitMotionStopReason = reason;
	    clearPostExitTargetState(reason);
	    return true;
	  }

	  function cancelDirectVelocityRepeat() {
	    bot.directVelocityRepeatToken += 1;
	    bot.directVelocityRepeatUntil = 0;
	    bot.directVelocityStopRepeatsLeft = 0;
	    if (bot.directVelocityTimer) {
	      clearTimeout(bot.directVelocityTimer);
	      bot.directVelocityTimer = 0;
	    }
	  }

	  function directWsVelocityMessage(dx, dy) {
	    return 'vel ' + clamp(Math.round(dx), -1, 1) + ' ' + clamp(Math.round(dy), -1, 1);
	  }

	  function sendDirectNativeVelocity(dx, dy, force = false) {
	    if (!cfg.directWsControlEnabled) return false;
	    const native = getNativeControl();
	    if (!native) return false;
	    if (!syncNativeControl(native)) {
	      notePageOwnsReconnect();
	      return false;
	    }
	    if (!cfg.directWsServerMarkerProbe) {
	      setNativeKeys(native.state, dx, dy);
	    }
	    const message = directWsVelocityMessage(dx, dy);
	    const t = now();
	    const dedupeMs = Math.max(0, Math.min(45, Number(cfg.directWsVelocityRepeatMs || 50) - 5));
	    if (!force && message === bot.lastDirectVelocity && t - Number(bot.lastDirectVelocityAt || 0) < dedupeMs) return true;
	    try {
	      native.ws.send(message);
	      if (cfg.directWsServerMarkerProbe) {
	        setNativeKeys(native.state, dx, dy);
	      }
	      bot.lastDirectVelocity = message;
	      bot.lastDirectVelocityAt = t;
	      bot.control.lastMessageAt = Date.now();
	      bot.control.transport = 'native-page-direct-ws';
	      return true;
	    } catch (err) {
	      bot.control.lastError = 'direct native velocity: ' + (err.message || String(err));
	      return false;
	    }
	  }

	  function scheduleDirectVelocityRepeat(dx, dy, force = false) {
	    if (!cfg.directWsControlEnabled || cfg.dryRun) return;
	    const repeatMs = Math.max(20, Number(cfg.directWsVelocityRepeatMs || 50));
	    const holdMs = Math.max(repeatMs, Number(cfg.directWsVelocityRepeatHoldMs || 220));
	    const moving = Boolean(dx || dy);
	    if (!moving) {
	      bot.directVelocityRepeatUntil = 0;
	      bot.directVelocityStopRepeatsLeft = Math.max(0, Math.round(Number(cfg.directWsStopRepeatCount || 0)));
	    } else {
	      bot.directVelocityRepeatUntil = now() + holdMs;
	      bot.directVelocityStopRepeatsLeft = 0;
	    }
	    bot.directVelocityRepeatToken += 1;
	    const token = bot.directVelocityRepeatToken;
	    if (bot.directVelocityTimer) clearTimeout(bot.directVelocityTimer);
	    const run = () => {
	      try {
	        if (bot.directVelocityRepeatToken !== token) return;
	        bot.directVelocityTimer = 0;
	        const keepMoving = moving && now() <= Number(bot.directVelocityRepeatUntil || 0);
	        const keepStopping = !moving && Number(bot.directVelocityStopRepeatsLeft || 0) > 0;
	        if (!keepMoving && !keepStopping) return;
	        if (!moving) bot.directVelocityStopRepeatsLeft = Math.max(0, Number(bot.directVelocityStopRepeatsLeft || 0) - 1);
	        sendDirectNativeVelocity(dx, dy, true);
	        bot.directVelocityTimer = setTimeout(run, repeatMs);
	      } catch (err) {
	        bot.directVelocityTimer = 0;
	        recordUnhandledTickError('direct-velocity-repeat', err);
	      }
	    };
	    bot.directVelocityTimer = setTimeout(run, repeatMs);
	  }

	  function sendNativeVelocity(dx, dy, force = false) {
	    const native = getNativeControl();
	    if (!native) return false;
	    if (sendDirectNativeVelocity(dx, dy, force)) return true;
	    setNativeKeys(native.state, dx, dy);
	    if (!syncNativeControl(native)) {
	      notePageOwnsReconnect();
	      return false;
	    }
	    if (typeof sendVelocity !== 'function') return wsSend('vel ' + dx + ' ' + dy);
	    try {
	      sendVelocity(Boolean(force));
	      bot.control.lastMessageAt = Date.now();
	      return true;
	    } catch (err) {
	      bot.control.lastError = 'native velocity: ' + (err.message || String(err));
	      return false;
	    }
	  }

	  function safeSendVelocity(dx, dy, force = false) {
	    dx = clamp(Math.round(dx), -1, 1);
	    dy = clamp(Math.round(dy), -1, 1);
	    if (cfg.dryRun) return true;
	    const vel = dx + ' ' + dy;
	    const t = now();
	    if (!force && vel === bot.control.lastVelocity && t - bot.control.lastVelocityAt < 100) return true;
	    bot.control.lastVelocity = vel;
	    bot.control.lastVelocityAt = t;
    if (dx || dy) {
      const dt = Date.now();
      if (!bot.control.nonZeroVelocitySince) bot.control.nonZeroVelocitySince = dt;
      bot.control.lastNonZeroVelocityAt = dt;
    } else {
      bot.control.nonZeroVelocitySince = 0;
      bot.control.lastNonZeroVelocityAt = 0;
      if (!bot.serverPositionStall?.stalled || !cfg.serverPositionStallOfflineEnabled) resetServerPositionStall('zero-velocity');
    }
    if (sendNativeVelocity(dx, dy, force)) {
      if (dx || dy) recordNetworkQualityMovementCommand(dx, dy, getSelf(), { source: 'velocity' });
      scheduleDirectVelocityRepeat(dx, dy, force);
      return true;
    }
    cancelDirectVelocityRepeat();
    const sent = wsSend('vel ' + vel);
    if (sent && (dx || dy)) recordNetworkQualityMovementCommand(dx, dy, getSelf(), { source: 'velocity-fallback' });
    return sent;
		  }

	  function sendActionVelocity(action) {
	    const lockRemainingMs = exitMotionStopLockRemainingMs();
	    let dx = clamp(Math.round(Number(action?.dx || 0)), -1, 1);
	    let dy = clamp(Math.round(Number(action?.dy || 0)), -1, 1);
	    if (lockRemainingMs > 0) {
	      dx = 0;
	      dy = 0;
	      if (action && typeof action === 'object') {
	        action.exitMotionBlocked = {
	          reason: bot.lastExitMotionStopReason || 'exit-motion-stopped',
	          remainingMs: lockRemainingMs
	        };
	      }
	    }
	    bot.velocityPulseToken += 1;
	    const token = bot.velocityPulseToken;
	    if (bot.velocityStopTimer) {
	      clearTimeout(bot.velocityStopTimer);
	      bot.velocityStopTimer = 0;
	    }
	    const sent = safeSendVelocity(dx, dy, true);
	    const pulseMs = Number(action?.precisionPulseMs || 0);
	    const canPulse = pulseMs > 0
	      && (dx || dy)
	      && (action?.kind === 'coin' || action?.kind === 'seek-coin');
	    if (canPulse) {
	      const pulseMaxMs = Math.max(110, Number(cfg.precisionPulseMaxMs || 260));
	      bot.velocityStopTimer = setTimeout(() => {
	        try {
	          if (bot.velocityPulseToken !== token) return;
	          bot.velocityStopTimer = 0;
	          stopMotionSafely('precision-pulse');
	        } catch (err) {
	          recordUnhandledTickError('precision-pulse', err);
	        }
	      }, clamp(Math.round(pulseMs), 20, pulseMaxMs));
	    }
	    return sent;
	  }

	  function aimAt(target) {
	    if (!target) return;
	    const x = Math.round(Number(target.x) || 0);
	    const y = Math.round(Number(target.y) || 0);
	    bot.lastAim = { x, y };
	    const nativeState = getNativeState();
	    if (nativeState) {
	      nativeState.pointerWorld = { x, y };
	      nativeState.pointerSeen = true;
	    }
	  }

	  function sendNativeShoot(self, target) {
	    const native = getNativeControl();
	    if (!native) return false;
	    if (!syncNativeControl(native)) {
	      notePageOwnsReconnect();
	      return false;
	    }
	    aimAt(target);
	    if (cfg.directWsControlEnabled && self && target) {
	      const startX = Math.round(Number(self.x) || 0);
	      const startY = Math.round(Number(self.y) || 0);
	      try {
	        native.ws.send('shoot ' + Math.round(Number(target.x) || 0) + ' ' + Math.round(Number(target.y) || 0) + ' ' + startX + ' ' + startY);
	        bot.control.lastMessageAt = Date.now();
	        bot.control.transport = 'native-page-direct-ws';
	        return true;
	      } catch (err) {
	        bot.control.lastError = 'direct native shoot: ' + (err.message || String(err));
	      }
	    }
	    if (typeof shoot !== 'function') return false;
	    try {
	      Promise.resolve(shoot()).catch(err => {
	        bot.control.lastError = 'native shoot: ' + (err.message || String(err));
	      });
	      bot.control.lastMessageAt = Date.now();
	      return true;
	    } catch (err) {
	      bot.control.lastError = 'native shoot: ' + (err.message || String(err));
	      return false;
	    }
	  }

  function recordCombatShotAttempt(self, target, detail = {}) {
    if (!target) return;
    const at = Number(detail.at || Date.now());
    const perfNow = Number(detail.perfNow ?? now());
    const targetDistance = Number.isFinite(Number(target.distance))
      ? Number(target.distance)
      : (self ? dist(self, target) : NaN);
    bot.lastCombatShot = {
      at,
      perfNow: Math.round(perfNow),
      force: Boolean(detail.force),
      shootEveryMs: combatMetricRound(detail.shootEveryMs),
      sent: Boolean(detail.sent),
      blockedByCadence: Boolean(detail.blockedByCadence),
      cadenceRemainingMs: combatMetricRound(detail.cadenceRemainingMs),
      self: self ? {
        id: combatMetricEntityId(self),
        x: combatMetricRound(self.x),
        y: combatMetricRound(self.y),
        hp: combatMetricHp(self)
      } : null,
      target: {
        id: combatMetricEntityId(target),
        name: target.name || target.label || '',
        x: combatMetricRound(target.x),
        y: combatMetricRound(target.y),
        hp: combatMetricHp(target),
        distance: Number.isFinite(targetDistance) ? Math.round(targetDistance) : null
      }
    };
    recordNetworkQualityShot(self, target, { ...detail, at });
  }

  function shootAt(self, target, force = false, options = {}) {
    if (!target) return false;
    const t = now();
    const at = Date.now();
    const shootEveryMs = Math.max(0, Number(options.shootEveryMs ?? cfg.shootEveryMs) || 0);
    const cadenceRemainingMs = Math.max(0, shootEveryMs - (t - Number(bot.lastShotAt || 0)));
    if (!force && cadenceRemainingMs > 0) {
      recordCombatShotAttempt(self, target, {
        at,
        perfNow: t,
        force,
        shootEveryMs,
        sent: false,
        blockedByCadence: true,
        cadenceRemainingMs
      });
      return false;
    }
    bot.lastShotAt = t;
    aimAt(target);
    let sent = sendNativeShoot(self, target);
    const startX = Math.round(Number(self.x) || 0);
    const startY = Math.round(Number(self.y) || 0);
    if (!sent) sent = wsSend('shoot ' + Math.round(target.x) + ' ' + Math.round(target.y) + ' ' + startX + ' ' + startY);
    recordCombatShotAttempt(self, target, {
      at,
      perfNow: t,
      force,
      shootEveryMs,
      sent,
      blockedByCadence: false,
      cadenceRemainingMs: 0
    });
    return sent;
  }

const {
  coinMotionNumber,
  coinMotionTolerance,
  coinAxisApproachDirectionCore,
  coinPickupPrecisionPulseMsCore,
  coinAxisLockShouldHoldCore,
  coinNearApproachAxisCore,
  coinDirectionToCore,
  coinMotionMetaCore
} = require('./runtime/coin-motion');

  function directionTo(self, target, tolerance = 250) {
    const dxRaw = Number(target.x) - Number(self.x);
    const dyRaw = Number(target.y) - Number(self.y);
    const absX = Math.abs(dxRaw);
    const absY = Math.abs(dyRaw);
    return {
      dx: absX > tolerance ? Math.sign(dxRaw) : 0,
      dy: absY > tolerance ? Math.sign(dyRaw) : 0,
      distance: hypot(dxRaw, dyRaw)
    };
  }

  function coinMotionCoreOptions(tolerance = cfg.coinPrecisionTolerance, extra = {}) {
    return {
      tolerance,
      coinPrecisionTolerance: cfg.coinPrecisionTolerance,
      coinAxisApproachMinDistance: cfg.coinAxisApproachMinDistance,
      coinAxisApproachRatio: cfg.coinAxisApproachRatio,
      coinAxisApproachLaneTolerance: cfg.coinAxisApproachLaneTolerance,
      coinPickupStopDistance: cfg.coinPickupStopDistance,
      coinPickupStopPulseMs: cfg.coinPickupStopPulseMs,
      coinPickupMicroDistance: cfg.coinPickupMicroDistance,
      coinPickupMicroPulseMs: cfg.coinPickupMicroPulseMs,
      coinPickupFineDistance: cfg.coinPickupFineDistance,
      coinPickupFinePulseMs: cfg.coinPickupFinePulseMs,
      coinPickupBrakeDistance: cfg.coinPickupBrakeDistance,
      coinPickupBrakePulseMs: cfg.coinPickupBrakePulseMs,
      coinPickupSweepDistance: cfg.coinPickupSweepDistance,
      coinPickupSweepPulseMs: cfg.coinPickupSweepPulseMs,
      coinPickupPulseMs: cfg.coinPickupPulseMs,
      coinPickupExactTolerance: cfg.coinPickupExactTolerance,
      coinPickupFailureSlowStepMs: cfg.coinPickupFailureSlowStepMs,
      coinPickupFailureMinPulseMs: cfg.coinPickupFailureMinPulseMs,
      coinApproachBrakeDistance: cfg.coinApproachBrakeDistance,
      coinAxisFlipTolerance: cfg.coinAxisFlipTolerance,
      coinApproachLockMs: cfg.coinApproachLockMs,
      nearCoinStuckDistance: cfg.nearCoinStuckDistance,
      ...extra
    };
  }

  function coinPickupFailureCount(id, t = now()) {
    if (!id && id !== 0) return 0;
    const failure = bot.coinFailures.get(String(id));
    if (!failure) return 0;
    const lastAt = Number(failure.lastAt || 0);
    if (lastAt && t - lastAt > Number(cfg.coinFailureDecayMs || 0)) return 0;
    return Math.max(0, Math.floor(Number(failure.count || 0)));
  }

  function coinPickupAttemptSlowCount(id, distance, t = now()) {
    if (!id && id !== 0) return 0;
    if (Number(distance) > Number(cfg.closeCoinStuckDistance || 0)) return 0;
    const progress = bot.coinProgress;
    if (!progress || String(progress.id) !== String(id)) return 0;
    const lastImprovedAt = Number(progress.lastImprovedAt || progress.startedAt || t);
    const everyMs = Math.max(1, Number(cfg.coinPickupAttemptSlowEveryMs || 2500));
    const maxCount = Math.max(0, Math.floor(Number(cfg.coinPickupAttemptSlowMaxCount || 0)));
    return clamp(Math.floor(Math.max(0, t - lastImprovedAt) / everyMs), 0, maxCount);
  }

  function applyCoinApproachLockUpdate(update) {
    if (!update) return;
    if (update.action === 'set' && update.lock) {
      bot.coinApproachLock = update.lock;
      return;
    }
    if (update.action === 'clear') {
      if (update.all || !bot.coinApproachLock || String(bot.coinApproachLock.id) === String(update.id)) {
        bot.coinApproachLock = null;
      }
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



  function summarizeOfflineThreat(entity) {
    if (!entity) return null;
    return {
      id: entity.user_id ?? entity.id ?? null,
      name: entity.name || '',
      distance: Number.isFinite(Number(entity.distance)) ? Math.round(Number(entity.distance)) : null,
      drop: Number(entity.drop ?? dropValue(entity) ?? 0) || 0,
      speed: Number.isFinite(Number(entity.speed ?? speed(entity))) ? Math.round(Number(entity.speed ?? speed(entity))) : null,
      moving: Boolean(entity.moving || speed(entity) >= cfg.activeSpeedMin),
      mode: entity.current_join_mode || ''
    };
  }

  function assessOfflineSafety(self) {
    if (!self || !isAlive(self)) {
      return { unsafe: true, reason: 'no-self', nearestActive: null, nearestHuman: null };
    }
    const { activeThreats, nearbyHumans, combatTargets, bullets } = classify(self);
    const bullet = incomingBulletThreat(self, null, bullets);
    const dangerThreat = activeThreats.find(entity => entity.distance <= entity.threatRadius) || null;
    const cautionThreat = activeThreats.find(entity => entity.distance <= entity.cautionRadius + cfg.activeCautionExitMargin) || null;
    const returnBlockThreat = activeThreats.find(entity => entity.distance <= returnBlockRadius(entity)) || null;
    const combatThreat = combatTargets.find(entity => !isAfkProfitTarget(entity) && entity.distance <= cfg.combatAttackRange) || null;
    const passiveDangerRadius = Math.max(0, Number(cfg.offlinePassiveDangerRadius || cfg.passivePanicRadius || 0));
    const closeHuman = nearbyHumans.find(entity => entity.distance <= passiveDangerRadius) || null;
    const injury = bot.pendingInjuryLeave;
    const recentInjury = injury && Date.now() - Number(injury.at || 0) <= Math.max(3000, cfg.combatStrafeLockMs * 4);
    const picked = dangerThreat || bullet || recentInjury || combatThreat || cautionThreat || returnBlockThreat || closeHuman || null;
    const reason = dangerThreat ? 'active threat in danger range'
      : bullet ? 'incoming bullet'
        : recentInjury ? 'recent injury'
          : combatThreat ? 'combat target nearby'
            : cautionThreat ? 'active threat in caution range'
              : returnBlockThreat ? 'active return-block pressure'
                : closeHuman ? 'near player'
                  : 'clear';
    const safety = {
      unsafe: Boolean(picked),
      reason,
      passiveDangerRadius,
      nearestActive: summarizeOfflineThreat(activeThreats[0]),
      nearestHuman: summarizeOfflineThreat(nearbyHumans[0]),
      threat: summarizeOfflineThreat(picked && picked.user_id !== undefined ? picked : null),
      incomingBullet: bullet ? {
        id: bullet.id,
        ownerId: bullet.ownerId,
        distance: Math.round(Number(bullet.distance || 0)),
        laneDistance: Math.round(Number(bullet.laneDistance || 0))
      } : null,
      recentInjury: recentInjury ? injury : null
    };
    bot.lastOfflineSafety = safety;
    return safety;
  }

  function pickActiveCombatWaitThreat(self, activeThreats, bullets = []) {
    const attackRange = Math.max(0, Number(cfg.combatAttackRange || cfg.attackRange || 0));
    const dodgeRange = combatDodgeThreatRange();
    const incoming = incomingBulletThreat(self, null, bullets);
    const incomingOwnerId = incoming?.ownerId;
    const unknownIncoming = Boolean(incoming && (incomingOwnerId === null || incomingOwnerId === undefined));
    return (activeThreats || [])
      .filter(threat => !isWhitelistedTarget(threat) && !isInvulnerable(threat))
      .filter(threat => hasCombatActivitySignal(threat))
      .filter(threat => !activeCombatRequiresThreatEvidence(self, threat) || activeCombatThreatensSelf(threat, incomingOwnerId, unknownIncoming))
      .filter(threat => {
        const distance = Number(threat.distance || 0);
        if (!(distance > attackRange)) return distance <= attackRange;
        return distance <= dodgeRange && (incomingOwnerMatchesTarget(threat, incomingOwnerId) || (unknownIncoming && isFiringEntity(threat)));
      })
      .sort((a, b) => {
        if (hasCombatActivitySignal(a) !== hasCombatActivitySignal(b)) return hasCombatActivitySignal(a) ? -1 : 1;
        if (isFiringEntity(a) !== isFiringEntity(b)) return isFiringEntity(a) ? -1 : 1;
        return Number(a.distance || Infinity) - Number(b.distance || Infinity);
      })[0] || null;
  }

  function activeCombatThreatWaitAction(threat) {
    return {
      kind: 'wait',
      reason: 'combat-active-threat-wait',
      dx: 0,
      dy: 0,
      shoot: false,
      forceShoot: false,
      activeThreat: threat ? {
        id: threat.user_id ?? threat.id ?? null,
        name: threat.name || '',
        distance: Math.round(Number(threat.distance || 0)),
        drop: Number(threat.drop || 0),
        speed: Math.round(Number(threat.speed || 0)),
        moving: Boolean(threat.moving),
        firing: isFiringEntity(threat),
        mode: threat.current_join_mode || threat.mode || ''
      } : null
    };
  }


const {
  coinDiagnosticsSummary,
  summarizeCoinDiagnosticsList,
  addCoinFilterDiagnostic,
  buildCoinDiagnostics
} = require('./runtime/coin-diagnostics');

  function coinThreatDangerRadius(threat) {
	    const base = Number(threat?.coinDangerRadius ?? cfg.coinDangerRadius);
	    if (isInvulnerableActive(threat)) return Math.max(base, Number(cfg.invulnerableActiveCoinDangerRadius || 0));
	    return base;
	  }

	  function coinHeadingBlockedByInvulnerableThreat(self, coin, threat) {
	    if (!self || !coin || !isInvulnerableActive(threat)) return false;
	    const coinDx = Number(coin.x) - Number(self.x);
	    const coinDy = Number(coin.y) - Number(self.y);
	    const threatDx = Number(threat.x) - Number(self.x);
	    const threatDy = Number(threat.y) - Number(self.y);
	    const coinDistance = Math.hypot(coinDx, coinDy);
	    const threatDistance = Math.hypot(threatDx, threatDy);
	    const minCoinDistance = Math.max(0, Number(cfg.invulnerableActiveCoinHeadingMinDistance || 0));
	    const blockRadius = Math.max(0, Number(cfg.invulnerableActiveCoinHeadingBlockRadius || 0));
	    if (!(coinDistance >= minCoinDistance) || !(threatDistance > 0) || threatDistance > blockRadius) return false;
	    const cos = (coinDx * threatDx + coinDy * threatDy) / Math.max(1, coinDistance * threatDistance);
	    if (cos < Number(cfg.invulnerableActiveCoinHeadingCosMin || 0)) return false;
	    const lane = Math.abs(coinDx * threatDy - coinDy * threatDx) / Math.max(1, threatDistance);
	    return lane <= Math.max(0, Number(cfg.invulnerableActiveCoinHeadingLaneRadius || 0))
	      && coinDistance <= threatDistance + Math.max(0, Number(cfg.invulnerableActiveCoinDangerRadius || 0));
	  }

	  function coinBlockedByThreat(self, coin, threat) {
	    const threatRadius = coinThreatDangerRadius(threat);
	    if (dist(coin, threat) <= threatRadius) {
	      if (!self) return true;
	      const coinDistance = dist(self, coin);
	      const threatDistance = Number.isFinite(Number(threat?.distance)) ? Number(threat.distance) : dist(self, threat);
	      if (!Number.isFinite(coinDistance) || !Number.isFinite(threatDistance)) return true;
	      if (coinDistance <= Math.max(0, Number(cfg.activeReturnBlockCoinPassDistance || 0))) return false;
	      if (isInvulnerableActive(threat)) return true;
	      const coinDx = Number(coin.x) - Number(self.x);
	      const coinDy = Number(coin.y) - Number(self.y);
	      const threatDx = Number(threat.x) - Number(self.x);
	      const threatDy = Number(threat.y) - Number(self.y);
	      const towardThreat = (coinDx * threatDx + coinDy * threatDy) > 0;
	      if (!towardThreat) return false;
	      const stopGap = threatDistance - coinDistance;
	      const stopBuffer = Math.max(0, Number(threat?.threatRadius || cfg.dangerRadius || 0));
	      if (stopGap <= stopBuffer) return true;
	    }
	    return coinHeadingBlockedByInvulnerableThreat(self, coin, threat);
	  }

	  function coinDiagnosticsNearDistance() {
	    return Math.max(0, Number(cfg.coinDiagnosticsNearDistance || cfg.opportunityVisibleDistance || cfg.globalCoinMaxDistance || cfg.nearCoinPriorityDistance || cfg.coinMaxDistance || 0));
	  }

	  function coinDiagnosticsLimit() {
	    return Math.max(1, Math.round(Number(cfg.coinDiagnosticsMaxEntries || 8) || 8));
	  }

	  function coinThreatDiagnostics(threat) {
	    if (!threat) return null;
	    return {
	      id: threat.user_id ?? threat.id ?? null,
	      name: threat.name || '',
	      distance: Number.isFinite(Number(threat.distance)) ? Math.round(Number(threat.distance)) : null,
	      radius: Math.round(coinThreatDangerRadius(threat)),
	      invulnerable: isInvulnerable(threat),
	      active: isCurrentlyActive(threat)
	    };
	  }

	  function recordCoinFilterDiagnostic(coin, reason, detail = {}) {
	    addCoinFilterDiagnostic(bot.coinDiagnostics, coin, reason, {
	      nearDistance: coinDiagnosticsNearDistance(),
	      limit: coinDiagnosticsLimit(),
	      detail
	    });
	  }

	  function coinStaminaAffordableWithDiagnostic(self, coin, staminaCost = opportunityCoinStaminaCost(coin), reason = 'stamina-unaffordable') {
	    const affordable = opportunityStaminaAffordable(self, staminaCost);
	    if (!affordable) recordCoinFilterDiagnostic(coin, reason, { staminaCost: Math.round(Number(staminaCost) || 0) });
	    return affordable;
	  }

	  function attachCoinDiagnostics(action) {
	    if (!action || !bot.coinDiagnostics) return action;
	    return {
	      ...action,
	      coinDiagnostics: safeJsonClone(bot.coinDiagnostics) || bot.coinDiagnostics
	    };
	  }

	  function safeCoinCandidates(coins, activeThreats, maxDistance, self = null) {
	    const t = now();
	    for (const [id, until] of bot.ignoredCoins.entries()) {
	      if (until <= t) bot.ignoredCoins.delete(id);
	    }
	    return (coins || []).map(c => ({
	      ...c,
	      distance: Number.isFinite(Number(c?.distance)) ? Number(c.distance) : (self ? dist(self, c) : Number(c?.distance))
	    })).filter(c => {
	      if (!(c.distance <= maxDistance)) {
	        if (Number(maxDistance || 0) >= coinDiagnosticsNearDistance()) {
	          recordCoinFilterDiagnostic(c, 'max-distance', { maxDistance: Math.round(Number(maxDistance || 0)) });
	        }
	        return false;
	      }
	      const ignoredUntil = bot.ignoredCoins.get(String(c.drop_id));
	      if (ignoredUntil) {
	        recordCoinFilterDiagnostic(c, 'ignored', { remainingMs: Math.max(0, Math.round(Number(ignoredUntil || 0) - t)) });
	        return false;
	      }
	      const blockingThreat = (activeThreats || []).find(threat => coinBlockedByThreat(self, c, threat));
	      if (blockingThreat) {
	        recordCoinFilterDiagnostic(c, 'threat-blocked', { threat: coinThreatDiagnostics(blockingThreat) });
	        return false;
	      }
	      return true;
	    })
	      .sort(compareCoinOpportunity);
	  }

	  function pickRealtimeLocalCoin(self, coins, activeThreats) {
	    const radius = snapshotCoinLocalSuppressRadius();
	    if (!(radius > 0)) return null;
	    return safeCoinCandidates((coins || []).filter(coin => !isSnapshotOnlyCoin(coin)), activeThreats, radius, self)
	      .filter(coin => coinStaminaAffordableWithDiagnostic(self, coin))[0] || null;
	  }

	  function nearestRealtimeCoinWithin(self, allCoins, activeThreats, maxDistance) {
	    if (!(Number(maxDistance) > 0)) return null;
	    return safeCoinCandidates((allCoins || []).filter(coin => !isSnapshotOnlyCoin(coin)), activeThreats, maxDistance, self)
	      .filter(coin => Number(coin.amount || 0) > 0)
	      .filter(coin => coinStaminaAffordableWithDiagnostic(self, coin))
	      .sort((a, b) => Number(a.distance || Infinity) - Number(b.distance || Infinity)
	        || Number(b.amount || 0) - Number(a.amount || 0))[0] || null;
	  }

	  function fieldMigrationBlockedByNearbyCoin(self, allCoins, activeThreats, fieldCoin = null) {
	    const blockDistance = Math.max(0, Number(cfg.fieldMigrationNearbyCoinBlockDistance || 0));
	    if (!(blockDistance > 0)) return false;
	    const nearby = nearestRealtimeCoinWithin(self, allCoins, activeThreats, blockDistance);
	    if (!nearby) return false;
	    if (fieldCoin) {
	      const nearbyId = nearby.drop_id ?? nearby.id;
	      const fieldId = fieldCoin.drop_id ?? fieldCoin.id;
	      if (nearbyId !== undefined && fieldId !== undefined && String(nearbyId) === String(fieldId)) return false;
	      const nearbyDistance = Number(nearby.distance ?? dist(self, nearby));
	      const fieldDistance = Number(fieldCoin.distance ?? dist(self, fieldCoin));
	      if (Number.isFinite(nearbyDistance) && Number.isFinite(fieldDistance) && nearbyDistance >= fieldDistance) return false;
	    }
	    return true;
	  }

	  function pickCoin(self, coins, activeThreats, maxDistance) {
	    const candidates = safeCoinCandidates(coins, activeThreats, maxDistance, self);
    if (!candidates.length) return null;
    if (bot.lastTarget?.kind === 'coin' && now() - bot.lastTargetAt < cfg.coinStickMs) {
      const sticky = candidates.find(c => String(c.drop_id) === String(bot.lastTarget.id));
      if (sticky) return sticky;
    }
    return candidates[0];
  }

	  function pickCoinField(self, allCoins, activeThreats) {
	    const candidates = safeCoinCandidates(allCoins, activeThreats, cfg.fieldMigrationMaxDistance, self)
      .filter(c => c.distance >= cfg.fieldMigrationMinDistance)
      .filter(c => coinStaminaAffordableWithDiagnostic(self, c));
    if (!candidates.length) return null;
    const buildFieldItem = coin => {
      const members = candidates.filter(other => dist(coin, other) <= cfg.fieldMigrationClusterRadius);
      if (members.length < cfg.fieldMigrationMinCoins) return null;
      const totalAmount = members.reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const staminaCost = opportunityCoinStaminaCost(coin);
      const score = opportunityValueScoreCore(totalAmount, staminaCost, {
        weight: cfg.coinOpportunityValue,
        distanceFloor: cfg.opportunityDistanceFloor,
        distanceScoreScale: cfg.opportunityDistanceScoreScale
      });
      return {
        ...coin,
        fieldMigration: true,
        fieldMembers: members.length,
        fieldAmount: totalAmount,
        fieldScore: score,
        opportunityScore: score,
        opportunityStaminaCost: staminaCost
      };
    };
    const current = bot.opportunityChoice;
    if (current?.key && current.reason === 'migrate-to-known-field' && now() < Number(current.until || 0)) {
      const heldCoin = candidates.find(c => String(c.drop_id) === String(current.id));
      const held = heldCoin ? buildFieldItem(heldCoin) : null;
      if (held && !fieldMigrationBlockedByNearbyCoin(self, allCoins, activeThreats, held)) return held;
    }
    let best = null;
    for (const coin of candidates.slice(0, 80)) {
      const item = buildFieldItem(coin);
      if (!item) continue;
      if (!best || item.fieldScore > best.fieldScore) best = item;
    }
    if (best && fieldMigrationBlockedByNearbyCoin(self, allCoins, activeThreats, best)) return null;
    return best;
  }

  function pickDistantCoin(self, allCoins, activeThreats) {
	    const candidates = safeCoinCandidates(allCoins, activeThreats, cfg.distantCoinMaxDistance, self)
      .filter(c => c.distance >= cfg.distantCoinMinDistance)
      .filter(c => coinStaminaAffordableWithDiagnostic(self, c));
    if (!candidates.length) return null;
    return candidates[0];
  }



  function highValueCoinPriorityAmount() {
    const value = Number(cfg.highValueCoinPriorityAmount ?? OPPORTUNITY_CONSTANTS.HIGH_VALUE_COIN_PRIORITY_AMOUNT);
    return Math.max(1, Number.isFinite(value) ? value : OPPORTUNITY_CONSTANTS.HIGH_VALUE_COIN_PRIORITY_AMOUNT);
  }

  function highValueCoinPriorityHealthyHp() {
    const value = Number(cfg.highValueCoinPriorityHealthyHp ?? cfg.combatLowHpLeaveThreshold ?? OPPORTUNITY_CONSTANTS.HIGH_VALUE_COIN_PRIORITY_HEALTHY_HP);
    return Math.max(1, Number.isFinite(value) ? value : OPPORTUNITY_CONSTANTS.HIGH_VALUE_COIN_PRIORITY_HEALTHY_HP);
  }

  function pickHighValueVisibleCoin(self, coins, activeThreats, options = {}) {
    const minAmount = highValueCoinPriorityAmount();
    const maxDistance = Math.max(0, Number(cfg.globalCoinMaxDistance || cfg.opportunityVisibleDistance || cfg.coinMaxDistance || 0));
    const threats = options.ignoreThreats ? [] : activeThreats;
    return safeCoinCandidates((coins || []).filter(coin => !isSnapshotOnlyCoin(coin)), threats, maxDistance, self)
      .filter(coin => Number(coin.amount || 0) >= minAmount)
      .filter(coin => coinStaminaAffordableWithDiagnostic(self, coin))[0] || null;
  }

  function nearbyThreatBlocksLowHpHighValueCoin(threat, incomingOwnerId = null, unknownIncoming = false) {
    if (!threat || isWhitelistedTarget(threat)) return false;
    const distance = Number(threat.distance ?? Infinity);
    const radius = Math.max(
      Number(cfg.combatAttackRange || 0),
      Number(threat.cautionRadius || 0) + Number(cfg.activeCautionExitMargin || 0),
      isInvulnerable(threat) ? Number(cfg.activeAvoidMaxDistance || cfg.activeCautionRadius || 0) : 0
    );
    if (!Number.isFinite(distance) || distance > radius) return false;
    if (isInvulnerable(threat)) return false;
    if (isLowValueActiveCombatTarget(threat)) return lowValueActiveThreatensSelf(threat, incomingOwnerId, unknownIncoming);
    return hasCombatActivitySignal(threat) || isCurrentlyActive(threat) || isFiringEntity(threat);
  }

  function canPrioritizeHighValueVisibleCoin(self, coin, context = {}) {
    if (!coin) return false;
    const hp = hpValue(self);
    const healthyHp = highValueCoinPriorityHealthyHp();
    if (hp >= healthyHp) return true;
    const incoming = incomingBulletThreat(self, null, context.bullets || []);
    if (incoming) return false;
    if (context.engagedCombatTarget || context.defensiveCombatTarget) return false;
    const incomingOwnerId = incoming?.ownerId;
    const unknownIncoming = Boolean(incoming && (incomingOwnerId === null || incomingOwnerId === undefined));
    return !(context.activeThreats || []).some(threat => nearbyThreatBlocksLowHpHighValueCoin(threat, incomingOwnerId, unknownIncoming));
  }

  function highValueVisibleCoinPriorityNeeded(self, context = {}) {
    if (context.recovery || context.engagedCombatTarget || context.defensiveCombatTarget) return true;
    if ((context.avoidanceThreats || []).length) return true;
    const incoming = incomingBulletThreat(self, null, context.bullets || []);
    if (incoming) return true;
    return false;
  }

  function recentCombatInjuryActive() {
    const injury = bot.pendingInjuryLeave;
    return injury && Date.now() - Number(injury.at || 0) <= Math.max(1000, cfg.combatStrafeLockMs * 3);
  }

  function lowValueActiveDropMax() {
    const value = Number(cfg.combatLowValueActiveDropMax ?? 4);
    return Math.max(0, Number.isFinite(value) ? value : 4);
  }

  function isLowValueActiveCombatTarget(target) {
    if (!target || isAfkProfitTarget(target)) return false;
    return hasCombatActivitySignal(target) && Number(target.drop ?? dropValue(target) ?? 0) <= lowValueActiveDropMax();
  }

  function proactiveActiveKillStaminaBudgetMs() {
    const value = Number(cfg.combatProactiveActiveKillStaminaBudgetMs ?? 100000);
    return Math.max(0, Number.isFinite(value) ? value : 100000);
  }

  function proactiveActiveCombatStaminaAffordable(self) {
    const required = proactiveActiveKillStaminaBudgetMs();
    if (!(required > 0)) return true;
    const budget = opportunityLongStaminaBudget(self);
    return !Number.isFinite(budget) || budget >= required;
  }

  function activeCombatBudgetBlocked(self, target) {
    if (!target || isAfkProfitTarget(target) || !hasCombatActivitySignal(target)) return false;
    if (Number(target.drop ?? dropValue(target) ?? 0) <= lowValueActiveDropMax()) return false;
    return !proactiveActiveCombatStaminaAffordable(self);
  }

  function activeCombatRequiresThreatEvidence(self, target) {
    return isLowValueActiveCombatTarget(target) || activeCombatBudgetBlocked(self, target);
  }

  function incomingOwnerMatchesTarget(target, incomingOwnerId) {
    if (!target || incomingOwnerId === null || incomingOwnerId === undefined) return false;
    const targetId = target.user_id ?? target.id;
    return targetId !== null && targetId !== undefined && String(targetId) === String(incomingOwnerId);
  }

  function activeCombatThreatensSelf(target, incomingOwnerId = null, unknownIncoming = false) {
    if (incomingOwnerMatchesTarget(target, incomingOwnerId)) return true;
    if (unknownIncoming && isFiringEntity(target)) return true;
    return Boolean(recentCombatInjuryActive() && (isFiringEntity(target) || isCurrentlyActive(target)));
  }

  function lowValueActiveThreatensSelf(target, incomingOwnerId = null, unknownIncoming = false) {
    if (!isLowValueActiveCombatTarget(target)) return true;
    return activeCombatThreatensSelf(target, incomingOwnerId, unknownIncoming);
  }

  function combatDodgeThreatRange() {
    const attackRange = Math.max(0, Number(cfg.combatAttackRange || cfg.attackRange || 0));
    return attackRange + Math.max(0, Number(cfg.combatDodgeRangeBuffer || 0));
  }

  function combatTargetPriority(target, incomingOwnerId = null, unknownIncoming = false) {
    const incomingMatch = incomingOwnerId !== null && incomingOwnerId !== undefined && String(target.user_id) === String(incomingOwnerId);
    return (incomingMatch ? 1000000000 : 0)
      + (isFiringEntity(target) ? 500000000 : 0)
      + (unknownIncoming && isCurrentlyActive(target) ? 200000000 : 0)
      + (recentCombatInjuryActive() && isCurrentlyActive(target) ? 100000000 : 0)
      + (isJoinModeActive(target) ? 75000000 : 0)
      + (isCurrentlyActive(target) ? 50000000 : 0)
      + Number(target.drop || 0) * 1000000
      - Number(target.distance || 0);
  }

  function isDefensiveCombatTarget(self, target, incomingOwnerId = null, unknownIncoming = false) {
    if (!target || isWhitelistedTarget(target) || isAfkProfitTarget(target) || isInvulnerable(target)) return false;
    if (incomingOwnerMatchesTarget(target, incomingOwnerId)) return true;
    if (activeCombatRequiresThreatEvidence(self, target)) return activeCombatThreatensSelf(target, incomingOwnerId, unknownIncoming);
    if (isFiringEntity(target)) return true;
    if (isCurrentlyActive(target)) return true;
    if (unknownIncoming && isCurrentlyActive(target)) return true;
    return Boolean(recentCombatInjuryActive() && isCurrentlyActive(target));
  }

  function isProfitableCombatTarget(self, target) {
    return Boolean(target
      && !isWhitelistedTarget(target)
      && !isAfkProfitTarget(target)
      && !isInvulnerable(target)
      && isCurrentlyActive(target)
      && Number(target.drop || 0) > lowValueActiveDropMax()
      && proactiveActiveCombatStaminaAffordable(self));
  }
  function combatHpGapDisadvantaged(self, target) {
    const knownSelfHp = knownHpValue(self);
    const knownTargetHp = knownHpValue(target);
    if (knownSelfHp === null || knownTargetHp === null) return false;
    const hpGap = Number(knownTargetHp) - Number(knownSelfHp);
    return Number(knownSelfHp) > cfg.combatLowHpLeaveThreshold
      && Number.isFinite(hpGap)
      && hpGap > cfg.combatHighHpDisadvantageGap;
  }
  function profitCombatDisadvantaged(self, target) {
    const selfHp = hpValue(self);
    const targetHp = combatHpValue(target);
    return (selfHp < cfg.combatLowHpLeaveThreshold && selfHp < targetHp)
      || combatHpGapDisadvantaged(self, target);
  }

  function pickCombatTarget(self, combatTargets, bullets, options = {}) {
    if (!combatTargets.length) return null;
    const incoming = incomingBulletThreat(self, null, bullets);
    const incomingOwnerId = incoming?.ownerId;
    const unknownIncoming = Boolean(incoming && (incomingOwnerId === null || incomingOwnerId === undefined));
    if (incoming?.ownerId !== null && incoming?.ownerId !== undefined) {
      const shooter = combatTargets.find(target => String(target.user_id) === String(incoming.ownerId) && !isWhitelistedTarget(target) && !isInvulnerable(target));
      if (shooter) return { ...shooter, incomingBullet: incoming, combatIntent: 'defensive' };
    }
    const eligibleTargets = combatTargets
      .filter(target => !isWhitelistedTarget(target) && !isAfkProfitTarget(target) && !isInvulnerable(target))
      .filter(target => !target.combatDodgeOnlyCandidate || incomingOwnerMatchesTarget(target, incomingOwnerId) || (unknownIncoming && isFiringEntity(target)))
      .filter(target => !combatRetreatIgnoreActive(target));
    if (!eligibleTargets.length) return null;
    const defensiveTargets = eligibleTargets
      .filter(target => isDefensiveCombatTarget(self, target, incomingOwnerId, unknownIncoming))
      .sort((a, b) => combatTargetPriority(b, incomingOwnerId, unknownIncoming) - combatTargetPriority(a, incomingOwnerId, unknownIncoming));
    if (options.mode === 'defensive') return defensiveTargets[0] ? { ...defensiveTargets[0], combatIntent: 'defensive' } : null;
    const profitableTargets = eligibleTargets
      .filter(target => isProfitableCombatTarget(self, target))
      .filter(target => options.mode !== 'profit' || !profitCombatDisadvantaged(self, target))
      .sort((a, b) => {
        const scoreA = scoreEnemyOpportunity(a) ?? -Infinity;
        const scoreB = scoreEnemyOpportunity(b) ?? -Infinity;
        if (scoreA !== scoreB) return scoreB - scoreA;
        return a.distance - b.distance;
      });
    if (options.mode === 'profit') return profitableTargets[0] ? { ...profitableTargets[0], combatIntent: 'profit' } : null;
    const sticky = bot.lastTarget?.kind === 'enemy' && now() - bot.lastTargetAt < cfg.targetStickMs
      ? [...defensiveTargets, ...profitableTargets].find(target => String(target.user_id) === String(bot.lastTarget.id))
      : null;
    if (sticky) return sticky;
    if (defensiveTargets[0]) return { ...defensiveTargets[0], combatIntent: 'defensive' };
    if (isFullHp(self) && profitableTargets[0]) return { ...profitableTargets[0], combatIntent: 'profit' };
    return null;
  }

  function combatEngageGraceRange() {
    return Math.max(
      Number(cfg.combatAttackRange || 0),
      Number(cfg.combatDisengageRange || 0),
      Number(cfg.combatEngageGraceRange || 0)
    );
  }

  function combatTargetCandidateRange(self) {
    return Number(cfg.combatAttackRange || 0);
  }

  function combatDodgeOnlyCandidateRange(self) {
    return combatDodgeThreatRange();
  }

  function combatEngagedCandidate(self, raw) {
    if (!raw || !entityFreshEnoughForOffense(raw) || !isAlive(raw) || isWhitelistedTarget(raw) || isInvulnerable(raw)) return null;
    return {
      ...raw,
      distance: dist(self, raw),
      drop: dropValue(raw),
      speed: speed(raw),
      hp: combatHpValue(raw),
      knownHp: knownHpValue(raw)
    };
  }

  function pickEngagedCombatTarget(self, combatTargets, entities, bullets = []) {
    const engaged = bot.combatTarget;
    if (!engaged?.id) return null;
    if (combatRetreatIgnoreActive({ id: engaged.id })) {
      clearCombatEngagement('target-retreating-ignore');
      return null;
    }
    const t = Date.now();
    const ageMs = Math.max(0, t - Number(engaged.at || 0));
    if (ageMs > Math.max(cfg.targetStickMs, cfg.combatEngageStickMs)) {
      clearCombatEngagement('expired');
      return null;
    }
    const target = (combatTargets || []).find(item => String(item.user_id ?? item.id ?? '') === String(engaged.id));
    if (target && !isWhitelistedTarget(target) && !isInvulnerable(target)) {
      if (String(engaged.intent || '') === 'profit' && isAfkProfitTarget(target)) {
        clearCombatEngagement('afk-profit-target');
        return null;
      }
      const incoming = incomingBulletThreat(self, null, bullets);
      const incomingOwnerId = incoming?.ownerId;
      const unknownIncoming = Boolean(incoming && (incomingOwnerId === null || incomingOwnerId === undefined));
      if (activeCombatRequiresThreatEvidence(self, target) && !activeCombatThreatensSelf(target, incomingOwnerId, unknownIncoming)) {
        clearCombatEngagement(isLowValueActiveCombatTarget(target) ? 'low-value-active-not-threatening' : 'active-combat-stamina-budget');
        return null;
      }
      return {
        ...target,
        combatIntent: 'engaged',
        combatEngagement: {
          ageMs: Math.round(ageMs),
          outOfRangeMs: 0,
          lastReason: engaged.reason || ''
        }
      };
    }
    const raw = (entities || []).find(item => String(item.user_id ?? item.id ?? '') === String(engaged.id));
    const reengageTarget = combatEngagedCandidate(self, raw);
    const graceRange = combatEngageGraceRange();
    const activeReengage = Boolean(reengageTarget && (isCurrentlyActive(reengageTarget) || isFiringEntity(reengageTarget) || isMovingThreat(reengageTarget)));
    const lastInRangeAt = Number(engaged.lastInRangeAt || engaged.at || 0);
    const outOfRangeMs = Math.max(0, t - lastInRangeAt);
    const graceMs = Math.max(0, Number(cfg.combatEngageGraceMs || 0));
    const outOfRangeLimitMs = activeReengage
      ? Math.max(graceMs, Number(cfg.combatEngageStickMs || 0))
      : graceMs;
    if (!outOfRangeLimitMs || outOfRangeMs > outOfRangeLimitMs) {
      clearCombatEngagement('range-grace-expired');
      return null;
    }
    if (reengageTarget && reengageTarget.distance > graceRange) {
      clearCombatEngagement('combat-disengage-range');
      return null;
    }
    if (!reengageTarget) return null;
    if (String(engaged.intent || '') === 'profit' && isAfkProfitTarget(reengageTarget)) {
      clearCombatEngagement('afk-profit-target');
      return null;
    }
    const incoming = incomingBulletThreat(self, null, bullets);
    const incomingOwnerId = incoming?.ownerId;
    const unknownIncoming = Boolean(incoming && (incomingOwnerId === null || incomingOwnerId === undefined));
    if (activeCombatRequiresThreatEvidence(self, reengageTarget) && !activeCombatThreatensSelf(reengageTarget, incomingOwnerId, unknownIncoming)) {
      clearCombatEngagement(isLowValueActiveCombatTarget(reengageTarget) ? 'low-value-active-not-threatening' : 'active-combat-stamina-budget');
      return null;
    }
    return {
      ...reengageTarget,
      combatIntent: 'reengage',
      combatEngagement: {
        ageMs: Math.round(ageMs),
        outOfRangeMs: Math.round(outOfRangeMs),
        graceRemainingMs: Math.max(0, Math.round(outOfRangeLimitMs - outOfRangeMs)),
        graceRange: Math.round(graceRange),
        activeReengage,
        outOfRangeLimitMs: Math.round(outOfRangeLimitMs),
        lastReason: engaged.reason || '',
        reengage: true
      }
    };
  }

  function defensiveTargetOverridesEngaged(engagedTarget, defensiveTarget) {
    if (!engagedTarget || !defensiveTarget?.incomingBullet) return false;
    if (!incomingBulletRequiresTargetSwitch(defensiveTarget.incomingBullet)) return false;
    const ownerId = defensiveTarget.incomingBullet.ownerId
      ?? defensiveTarget.incomingBullet.owner_id
      ?? defensiveTarget.incomingBullet.source_user_id
      ?? defensiveTarget.incomingBullet.user_id;
    if (ownerId === null || ownerId === undefined) return false;
    const defensiveId = defensiveTarget.user_id ?? defensiveTarget.id;
    const engagedId = engagedTarget.user_id ?? engagedTarget.id;
    return defensiveId !== null && defensiveId !== undefined
      && engagedId !== null && engagedId !== undefined
      && String(defensiveId) !== String(engagedId);
  }

  function incomingBulletRequiresTargetSwitch(incomingBullet) {
    if (!incomingBullet) return false;
    const distance = Number(incomingBullet.distance);
    const timeToImpactMs = Number(incomingBullet.timeToImpactMs);
    const switchDistance = Math.max(0, Number(cfg.combatTargetSwitchIncomingDistance || 0));
    const switchTime = Math.max(0, Number(cfg.combatTargetSwitchIncomingTimeMs || 0));
    if (switchDistance > 0 && Number.isFinite(distance) && distance <= switchDistance) return true;
    if (switchTime > 0 && Number.isFinite(timeToImpactMs) && timeToImpactMs <= switchTime) return true;
    return false;
  }

  function pickOpportunisticShotTarget(self, entities) {
    const candidates = (entities || [])
      .filter(e => Number(e.user_id) !== Number(self.user_id))
      .filter(e => e.native)
      .filter(entityFreshEnoughForOffense)
      .filter(isAlive)
      .map(e => ({ ...e, distance: dist(self, e), drop: dropValue(e), speed: speed(e), hp: combatHpValue(e) }))
      .filter(e => !isWhitelistedTarget(e))
      .filter(e => e.distance <= cfg.attackRange)
      .filter(e => (typeof attackWorthTakingCore === 'function'
        ? attackWorthTakingCore(self, e, {
          isWhitelistedTarget,
          dropValue,
          isAfkProfitTarget,
          attackMinAfkDrop: cfg.attackMinAfkDrop,
          attackMinDrop: cfg.attackMinDrop,
          attackMinRewardRatio: cfg.attackMinRewardRatio
        })
        : attackWorthTaking(self, e)) && !isInvulnerable(e))
      .filter(isAfkProfitTarget)
      .map(e => ({
        ...e,
        score: scoreEnemyOpportunity(e) ?? -Infinity,
        staminaCost: opportunityEnemyStaminaCost(e),
        estimatedShots: estimatedKillShots(e)
      }))
      .filter(e => opportunityStaminaAffordable(self, e.staminaCost))
      .sort((a, b) => {
        const stickyA = bot.attackHistory.some(item => String(item.id) === String(a.user_id) && Date.now() - Number(item.at || 0) <= cfg.targetStickMs);
        const stickyB = bot.attackHistory.some(item => String(item.id) === String(b.user_id) && Date.now() - Number(item.at || 0) <= cfg.targetStickMs);
        if (stickyA !== stickyB) return stickyA ? -1 : 1;
        if (b.score !== a.score) return b.score - a.score;
        if (b.drop !== a.drop) return b.drop - a.drop;
        return a.distance - b.distance;
      });
    const target = candidates[0] || null;
    if (!target) return null;
    return {
      id: target.user_id,
      name: target.name || '',
      x: Number(target.x),
      y: Number(target.y),
      hp: combatHpValue(target),
      drop: target.drop,
      distance: Math.round(target.distance),
      score: Math.round(Number(target.score || 0)),
      staminaCost: Math.round(Number(target.staminaCost || 0)),
      estimatedShots: target.estimatedShots,
      mode: target.current_join_mode || '',
      reason: 'opportunistic-afk-drop-shot'
    };
  }

  function actionOpportunityScore(action) {
    const explicit = Number(action?.score ?? action?.opportunityChoice?.score);
    if (Number.isFinite(explicit)) return explicit;
    const target = action?.target || {};
    if (['coin', 'seek-coin'].includes(action?.kind) && Number(target.amount || 0) > 0) {
      return scoreCoinOpportunity({
        amount: Number(target.amount || 0),
        distance: Number(target.distance ?? action?.distance ?? 0),
        opportunityStaminaCost: Number.isFinite(Number(action?.staminaCost)) ? Number(action.staminaCost) : undefined
      });
    }
    return -Infinity;
  }

  function opportunisticShotBeatsAction(action, shot) {
    const shotScore = Number(shot?.score ?? scoreEnemyOpportunity(shot) ?? -Infinity);
    if (!Number.isFinite(shotScore)) return false;
    const actionScore = actionOpportunityScore(action);
    const minRatio = Math.max(0, Number(cfg.opportunisticShotMinScoreRatio ?? 1));
    return !Number.isFinite(actionScore) || actionScore <= 0 || shotScore >= actionScore * minRatio;
  }

  function attachOpportunisticShot(action, self, entities, options = {}) {
    if (!action || !['coin', 'seek-coin'].includes(action.kind) || action.combat) return action;
    if (options.recovery) return action;
    const shot = pickOpportunisticShotTarget(self, entities);
    if (!shot) return action;
    if (!opportunisticShotBeatsAction(action, shot)) return action;
    return { ...action, opportunisticShot: shot };
  }

  function buildOpportunisticShotWait(self, entities, options = {}) {
    if (options.recovery) return null;
    const shot = pickOpportunisticShotTarget(self, entities);
    if (!shot) return null;
    return {
      kind: 'wait',
      reason: 'opportunistic-afk-drop-shot',
      dx: 0,
      dy: 0,
      opportunisticShot: shot
    };
  }



  function combatMoveVelocityForDirection(dx, dy) {
    const x = clamp(Math.round(Number(dx) || 0), -1, 1);
    const y = clamp(Math.round(Number(dy) || 0), -1, 1);
    if (!(x || y)) return { vx: 0, vy: 0 };
    const speedPerTick = Math.max(1, Number(cfg.combatTargetDodgeSpeedPerTick || 50));
    const axisSpeed = x && y ? Math.round(speedPerTick / Math.SQRT2) : speedPerTick;
    return { vx: x * axisSpeed, vy: y * axisSpeed };
  }

  function combatBulletThreats(self, target = null, bullets = getBullets()) {
    const selfId = Number(self?.user_id);
    const items = [];
    for (const raw of bullets || []) {
      const bullet = normalizeBullet(raw, raw?.native ? 'native' : 'snapshot');
      if (!bullet) continue;
      if (bullet.ownerId !== null && bullet.ownerId !== undefined && Number(bullet.ownerId) === selfId) continue;
      if (target && bullet.ownerId !== null && bullet.ownerId !== undefined && String(bullet.ownerId) !== String(target.user_id)) {
        continue;
      }
      const speedValue = hypot(Number(bullet.vx) || 0, Number(bullet.vy) || 0);
      if (speedValue <= 0.01) continue;
      const toSelfX = Number(self.x) - Number(bullet.x);
      const toSelfY = Number(self.y) - Number(bullet.y);
      const distance = hypot(toSelfX, toSelfY);
      if (distance > cfg.combatBulletDetectRadius) continue;
      const projection = (toSelfX * bullet.vx + toSelfY * bullet.vy) / speedValue;
      if (projection <= 0 || projection > cfg.combatBulletLookaheadDistance) continue;
      const signedLaneDistance = (toSelfX * bullet.vy - toSelfY * bullet.vx) / speedValue;
      const laneDistance = Math.abs(signedLaneDistance);
      if (laneDistance > cfg.combatBulletLaneRadius) continue;
      const timeToImpactMs = projection / speedValue * 50;
      const impactTicks = projection / speedValue;
      const hitRadius = Math.max(0, Number(cfg.combatBulletHitRadiusCm || 90));
      const score = (cfg.combatBulletLaneRadius - laneDistance) * 1000
        + (cfg.combatBulletLookaheadDistance - projection)
        + Math.max(0, 1500 - timeToImpactMs);
      items.push({
        id: bullet.id,
        ownerId: bullet.ownerId,
        x: bullet.x,
        y: bullet.y,
        vx: bullet.vx,
        vy: bullet.vy,
        distance,
        projection,
        laneDistance,
        signedLaneDistance,
        impactTicks,
        timeToImpactMs,
        hitRadius,
        directHit: laneDistance <= hitRadius,
        score
      });
    }
    return items.sort((a, b) => b.score - a.score || a.timeToImpactMs - b.timeToImpactMs);
  }

  function incomingBulletThreat(self, target = null, bullets = getBullets()) {
    const threats = combatBulletThreats(self, target, bullets);
    const best = threats[0] || null;
    if (!best) return null;
    return {
      ...best,
      threatCount: threats.length,
      threats: threats.slice(0, 6)
    };
  }

  function combatThreatFieldCandidate(self, threats, dx, dy) {
    const move = combatMoveVelocityForDirection(dx, dy);
    let safetyScore = 0;
    let minCpaDistance = Infinity;
    let minTimeToImpactMs = Infinity;
    let directHitCount = 0;
    for (const threat of threats || []) {
      const rx = Number(threat.x) - Number(self.x);
      const ry = Number(threat.y) - Number(self.y);
      const rvx = (Number(threat.vx) || 0) - move.vx;
      const rvy = (Number(threat.vy) || 0) - move.vy;
      const relSpeedSq = rvx * rvx + rvy * rvy;
      const rawImpactTicks = Number(threat.impactTicks);
      const horizonTicks = Math.max(0, Math.min(
        Number.isFinite(rawImpactTicks) ? rawImpactTicks + 1 : 30,
        Number(cfg.combatBulletLookaheadDistance || 42000) / Math.max(1, Number(cfg.combatBulletSpeedPerTick || 500))
      ));
      const cpaTicks = relSpeedSq > 0.000001
        ? clamp(-(rx * rvx + ry * rvy) / relSpeedSq, 0, horizonTicks)
        : 0;
      const cpaX = rx + rvx * cpaTicks;
      const cpaY = ry + rvy * cpaTicks;
      const cpaDistance = Math.hypot(cpaX, cpaY);
      const hitRadius = Math.max(0, Number(threat.hitRadius ?? cfg.combatBulletHitRadiusCm ?? 90));
      const timeToImpactMs = Number(threat.timeToImpactMs);
      const urgency = Number.isFinite(timeToImpactMs) ? Math.max(0.35, 1.8 - Math.min(1500, timeToImpactMs) / 1500) : 1;
      minCpaDistance = Math.min(minCpaDistance, cpaDistance);
      if (Number.isFinite(timeToImpactMs)) minTimeToImpactMs = Math.min(minTimeToImpactMs, timeToImpactMs);
      if (cpaDistance <= hitRadius) directHitCount += 1;
      safetyScore += Math.min(5000, cpaDistance) * urgency;
      if (cpaDistance <= hitRadius) safetyScore -= (hitRadius - cpaDistance + 1) * 100000 * urgency;
      else if (cpaDistance <= hitRadius * 3) safetyScore -= (hitRadius * 3 - cpaDistance) * 300 * urgency;
    }
    return {
      dx: clamp(Math.round(Number(dx) || 0), -1, 1),
      dy: clamp(Math.round(Number(dy) || 0), -1, 1),
      safetyScore,
      minCpaDistance,
      minTimeToImpactMs,
      directHitCount
    };
  }

  function combatBulletThreatField(self, threats, options = {}) {
    const list = (threats || []).filter(Boolean).slice(0, 6);
    if (!list.length) return null;
    const preferred = options.preferred || {};
    const preferredDx = clamp(Math.round(Number(preferred.dx) || 0), -1, 1);
    const preferredDy = clamp(Math.round(Number(preferred.dy) || 0), -1, 1);
    const target = options.target || null;
    const approachX = target ? Math.sign(Number(target.x) - Number(self.x)) || 0 : 0;
    const approachY = target ? Math.sign(Number(target.y) - Number(self.y)) || 0 : 0;
    const directions = [
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 },
      { dx: 1, dy: 1 },
      { dx: 1, dy: -1 },
      { dx: -1, dy: 1 },
      { dx: -1, dy: -1 }
    ];
    const scored = directions.map(item => {
      const candidate = combatThreatFieldCandidate(self, list, item.dx, item.dy);
      let bias = 0;
      if (candidate.dx === preferredDx && candidate.dy === preferredDy) bias += 120;
      if (options.preferClosing) {
        if (candidate.dx && approachX && candidate.dx === approachX) bias += 40;
        if (candidate.dy && approachY && candidate.dy === approachY) bias += 40;
      }
      return { ...candidate, safetyScore: candidate.safetyScore + bias };
    }).sort((a, b) => {
      if (a.directHitCount !== b.directHitCount) return a.directHitCount - b.directHitCount;
      if (b.safetyScore !== a.safetyScore) return b.safetyScore - a.safetyScore;
      return b.minCpaDistance - a.minCpaDistance;
    });
    const best = scored[0] || null;
    if (!best) return null;
    return best;
  }

  function combatStrafeHoldMs() {
    const base = Math.max(300, Number(cfg.combatStrafeDirectionLockMs ?? cfg.combatStrafeLockMs) || 700);
    const jitter = Math.max(0, Number(cfg.combatStrafeRandomJitterMs) || 0);
    return base + (jitter ? Math.floor(Math.random() * jitter) : 0);
  }

  function combatStrafeKey(target, pressure) {
    const ownerId = pressure?.ownerId;
    if (ownerId !== null && ownerId !== undefined) return 'owner:' + ownerId;
    const targetId = target?.user_id ?? target?.id;
    if (targetId !== null && targetId !== undefined) return 'target:' + targetId;
    return 'combat';
  }

  function combatStrafeMatchesTarget(strafe, target) {
    if (!strafe) return false;
    const targetId = target?.user_id ?? target?.id;
    if (targetId === null || targetId === undefined) return true;
    const key = String(targetId);
    return strafe.targetId === key || strafe.key === 'target:' + key || strafe.key === 'owner:' + key;
  }

  function combatPreciseStrafeSign(pressure) {
    const signedLane = Number(pressure?.signedLaneDistance);
    const laneMin = Math.max(0, Number(cfg.combatStrafePreciseLaneMin ?? 1));
    return !pressure?.synthetic && Number.isFinite(signedLane) && Math.abs(signedLane) > laneMin
      ? -Math.sign(signedLane)
      : 0;
  }

  function selectCombatStrafeSign(existing, key, preciseSign, t = now()) {
    let sign = 0;
    let until = 0;
    let locked = false;
    let lockOverridden = false;
    const existingUntil = Number(existing?.until || 0);
    if (existing && existing.key === key && t < existingUntil) {
      const existingSign = Math.sign(Number(existing.sign || 0));
      const precise = Math.sign(Number(preciseSign || 0));
      if (precise && existingSign && existingSign !== precise) {
        sign = precise;
        until = t + combatStrafeHoldMs();
        lockOverridden = true;
      } else {
        sign = existingSign;
        until = existingUntil;
        locked = Boolean(sign);
      }
    }
    if (!sign) {
      sign = Math.sign(Number(preciseSign || 0)) || (Math.random() < 0.5 ? -1 : 1);
      until = t + combatStrafeHoldMs();
    }
    return { sign, until, locked, lockOverridden };
  }

	  function combatStrafeVector(self, target, pressure, sign, options = {}) {
	    let baseX = Number(pressure?.vx) || 0;
	    let baseY = Number(pressure?.vy) || 0;
	    if (!(baseX || baseY) && target) {
      baseX = Number(target.x) - Number(self.x);
      baseY = Number(target.y) - Number(self.y);
    }
    const tangentX = -baseY * sign;
	    const tangentY = baseX * sign;
	    let dx = Math.sign(tangentX || 0);
	    let dy = Math.sign(tangentY || 0);
    let closingBiased = false;
	    if (target) {
	      const awayX = Math.sign(Number(self.x) - Number(target.x)) || 0;
	      const awayY = Math.sign(Number(self.y) - Number(target.y)) || 0;
	      const approachX = Math.sign(Number(target.x) - Number(self.x)) || 0;
	      const approachY = Math.sign(Number(target.y) - Number(self.y)) || 0;
	      const fillX = options.preferClosing ? approachX : awayX;
	      const fillY = options.preferClosing ? approachY : awayY;
	      if (dx && !dy && fillY) dy = fillY;
	      else if (dy && !dx && fillX) dx = fillX;
      if (options.preferClosing && dx && dy) {
        const closesX = Boolean(approachX && Math.sign(dx) === approachX);
        const closesY = Boolean(approachY && Math.sign(dy) === approachY);
        if (!closesX && !closesY) {
          const offsetX = Math.abs(Number(target.x) - Number(self.x));
          const offsetY = Math.abs(Number(target.y) - Number(self.y));
          if (offsetX >= offsetY && approachX) {
            closingBiased = Math.sign(dx) !== approachX;
            dx = approachX;
          } else if (approachY) {
            closingBiased = Math.sign(dy) !== approachY;
            dy = approachY;
          }
        }
      }
	    }
	    if (!(dx || dy) && target) {
	      dx = Math.sign(Number(self.y) - Number(target.y)) || 1;
	      dy = Math.sign(Number(target.x) - Number(self.x)) || 0;
	    }
	    return { dx: clamp(Math.round(dx), -1, 1), dy: clamp(Math.round(dy), -1, 1), closingBiased };
	  }

  function tangentMoveForBullet(self, target, pressure, options = {}) {
    const t = now();
    const existing = bot.combatStrafe;
    if (!pressure) {
      if (combatStrafeMatchesTarget(existing, target)
        && t < Number(existing?.carryUntil || 0)
        && (existing.dx || existing.dy)) {
        return {
          dx: clamp(Math.round(Number(existing.dx) || 0), -1, 1),
          dy: clamp(Math.round(Number(existing.dy) || 0), -1, 1),
          locked: true,
          carried: true,
          active: true,
          sign: Number(existing.sign || 0),
          key: existing.key,
          holdRemainingMs: Math.max(0, Math.round(Number(existing.until || 0) - t)),
          carryRemainingMs: Math.max(0, Math.round(Number(existing.carryUntil || 0) - t))
        };
      }
      return { dx: 0, dy: 0, locked: false, carried: false, active: false };
    }

    const key = combatStrafeKey(target, pressure);
    const preciseSign = combatPreciseStrafeSign(pressure);
    const strafeSign = selectCombatStrafeSign(existing, key, preciseSign, t);
    const sign = strafeSign.sign;
    const until = strafeSign.until;

	    let { dx, dy, closingBiased } = combatStrafeVector(self, target, pressure, sign, options);
    const threatField = !pressure.synthetic
      ? combatBulletThreatField(self, pressure.threats || [pressure], {
        preferred: { dx, dy },
        target,
        preferClosing: Boolean(options.preferClosing)
      })
      : null;
    if (threatField) {
      dx = threatField.dx;
      dy = threatField.dy;
    }
    if (!(dx || dy) && existing && (existing.dx || existing.dy)) {
      dx = clamp(Math.round(Number(existing.dx) || 0), -1, 1);
      dy = clamp(Math.round(Number(existing.dy) || 0), -1, 1);
    }
    const carryMs = Math.max(0, Number(cfg.combatStrafeCarryMs) || 0);
    const targetId = target?.user_id ?? target?.id;
    bot.combatStrafe = {
      key,
      targetId: targetId !== null && targetId !== undefined ? String(targetId) : '',
      ownerId: pressure.ownerId !== null && pressure.ownerId !== undefined ? String(pressure.ownerId) : '',
      sign,
      dx,
      dy,
      threatField,
      until,
      carryUntil: t + carryMs
    };
    return {
	      dx,
	      dy,
	      locked: Boolean(strafeSign.locked),
	      lockOverridden: Boolean(strafeSign.lockOverridden),
      closingBiased: Boolean(closingBiased),
	      carried: false,
      threatField,
      active: true,
      sign,
      precise: Boolean(preciseSign),
      key,
      holdRemainingMs: Math.max(0, Math.round(until - t)),
      carryRemainingMs: carryMs
    };
  }

  function combatMoveClosesDistance(self, target, move) {
    const dx = clamp(Math.round(Number(move?.dx) || 0), -1, 1);
    const dy = clamp(Math.round(Number(move?.dy) || 0), -1, 1);
    if (!(dx || dy) || !self || !target) return false;
    const toTargetX = Number(target.x) - Number(self.x);
    const toTargetY = Number(target.y) - Number(self.y);
    return (toTargetX * dx + toTargetY * dy) > 0;
  }

  function combatSafeCloseMoveOverride(self, target, pressure, closeMove) {
    if (!self || !target || !pressure || pressure.synthetic || !closeMove?.active) return null;
    const dx = clamp(Math.round(Number(closeMove.dx) || 0), -1, 1);
    const dy = clamp(Math.round(Number(closeMove.dy) || 0), -1, 1);
    if (!(dx || dy) || !combatMoveClosesDistance(self, target, { dx, dy })) return null;
    const candidate = combatThreatFieldCandidate(self, pressure.threats || [pressure], dx, dy);
    const hitRadius = Math.max(0, Number(cfg.combatBulletHitRadiusCm || 90));
    const minSafeCpa = Math.max(hitRadius * 3, Number(cfg.combatPressureCloseMinCpaCm || 0));
    if (candidate.directHitCount > 0) return null;
    if (Number.isFinite(Number(candidate.minCpaDistance)) && Number(candidate.minCpaDistance) < minSafeCpa) return null;
    return {
      dx,
      dy,
      active: true,
      reason: closeMove.reason || 'safe-close',
      source: closeMove,
      threatField: candidate,
      minSafeCpa
    };
  }

  function combatSpacingVector(self, target, targetDistance = null) {
    const distance = Number.isFinite(Number(targetDistance)) ? Number(targetDistance) : dist(self, target);
    const minRange = Math.max(0, Number(cfg.combatSpacingMinRange || 0));
    const preferredRange = Math.max(minRange, Number(cfg.combatSpacingPreferredRange || minRange));
    if (!(distance > 0) || !minRange) return { active: false, dx: 0, dy: 0 };
    const dxRaw = Number(self.x) - Number(target.x);
    const dyRaw = Number(self.y) - Number(target.y);
    let dx = Math.sign(dxRaw) || 0;
    let dy = Math.sign(dyRaw) || 0;
    if (!(dx || dy)) dx = -Math.sign(Number(target.vx) || 0) || 1;
    const targetVx = Number(target.vx) || 0;
    const targetVy = Number(target.vy) || 0;
    const toTargetX = Number(target.x) - Number(self.x);
    const toTargetY = Number(target.y) - Number(self.y);
    const d = Math.max(1, distance);
    const radialSpeed = (toTargetX / d) * targetVx + (toTargetY / d) * targetVy;
    const tooClose = distance < minRange;
    const closing = radialSpeed <= -cfg.combatStationarySpeed && distance < preferredRange;
    if (!tooClose && !closing) return { active: false, dx: 0, dy: 0, distance, minRange, preferredRange, radialSpeed };
    return {
      active: true,
      dx: clamp(Math.round(dx), -1, 1),
      dy: clamp(Math.round(dy), -1, 1),
      distance,
      minRange,
      preferredRange,
      radialSpeed,
      reason: tooClose ? 'too-close' : 'closing'
    };
  }

  function combatSpacingShouldOverrideBullet(spacing, selfHp, targetHp) {
    if (!spacing?.active || spacing.reason !== 'too-close') return false;
    const distance = Number(spacing.distance);
    const emergencyRange = Math.max(0, Number(cfg.combatSpacingEmergencyRange || 0));
    const lowHpThreshold = Math.max(0, Number(cfg.combatSpacingLowHpThreshold || cfg.combatLowHpLeaveThreshold || 0));
    const hp = Number(selfHp);
    const emergencyClose = emergencyRange > 0 && Number.isFinite(distance) && distance <= emergencyRange;
    const lowHpClose = lowHpThreshold > 0 && Number.isFinite(hp) && hp < lowHpThreshold;
    return Boolean(emergencyClose || lowHpClose);
  }

  function combatLowHpCloseRiskState(selfHp, targetHp, spacing, realBulletPressure = false) {
    const threshold = Math.max(0, Number(cfg.combatLowHpLeaveThreshold || 0));
    const margin = Math.max(0, Number(cfg.combatLowHpCloseRiskMargin || 0));
    const hp = Number(selfHp);
    const enemyHp = Number(targetHp);
    if (!threshold || !margin || !Number.isFinite(hp) || !Number.isFinite(enemyHp)) return null;
    if (!(hp < threshold) || !(hp <= enemyHp + margin)) return null;
    if (!spacing?.active || spacing.reason !== 'too-close') return null;
    if (!realBulletPressure && !combatSpacingShouldOverrideBullet(spacing, hp, enemyHp)) return null;
    return {
      active: true,
      selfHp: hp,
      targetHp: enemyHp,
      hpGap: enemyHp - hp,
      margin,
      distance: Math.round(Number(spacing.distance || 0)),
      realBulletPressure: Boolean(realBulletPressure)
    };
  }

  function combatPressureDisadvantageState(selfHp, targetHp, targetDistance, realBulletPressure = false) {
    const threshold = Math.max(0, Number(cfg.combatPressureExitHpThreshold || 0));
    const minGap = Math.max(0, Number(cfg.combatPressureExitHpGap || 0));
    const range = Math.max(0, Number(cfg.combatShootPressureRange || cfg.combatAttackRange || 0));
    const hp = Number(selfHp);
    const enemyHp = Number(targetHp);
    const distance = Number(targetDistance);
    const hpGap = enemyHp - hp;
    if (!threshold || !minGap || !range || !realBulletPressure) return null;
    if (!Number.isFinite(hp) || !Number.isFinite(enemyHp) || !Number.isFinite(distance)) return null;
    if (!(hp < threshold) || !(hpGap >= minGap) || !(distance <= range)) return null;
    return {
      active: true,
      selfHp: hp,
      targetHp: enemyHp,
      hpGap,
      threshold,
      minGap,
      distance: Math.round(distance),
      realBulletPressure: true
    };
  }

  function combatSustainedPressureDisadvantageState(selfHp, targetHp, targetDistance, noDamageMs, targetRealBulletPressure = false) {
    const waitMs = Math.max(0, Number(cfg.combatPressureNoDamageExitMs || 0));
    const threshold = Math.max(0, Number(cfg.combatPressureNoDamageExitHpThreshold || 0));
    const minGap = Math.max(0, Number(cfg.combatPressureNoDamageExitHpGap || 0));
    const targetHpMin = Math.max(0, Number(cfg.combatPressureNoDamageExitTargetHpMin || 0));
    const range = Math.max(0, Number(cfg.combatPressureNoDamageExitRange || cfg.combatShootPressureRange || cfg.combatAttackRange || 0));
    const hp = Number(selfHp);
    const enemyHp = Number(targetHp);
    const distance = Number(targetDistance);
    const elapsed = Math.max(0, Number(noDamageMs || 0));
    const hpGap = enemyHp - hp;
    if (!waitMs || !threshold || !minGap || !range || !targetRealBulletPressure) return null;
    if (!Number.isFinite(hp) || !Number.isFinite(enemyHp) || !Number.isFinite(distance)) return null;
    if (!(hp <= threshold) || !(enemyHp >= targetHpMin) || !(hpGap >= minGap) || !(elapsed >= waitMs) || !(distance <= range)) return null;
    return {
      active: true,
      selfHp: hp,
      targetHp: enemyHp,
      hpGap,
      threshold,
      minGap,
      targetHpMin,
      noDamageMs: Math.round(elapsed),
      waitMs,
      distance: Math.round(distance),
      targetRealBulletPressure: true
    };
  }

  function combatPressureCloseVector(self, target, targetDistance, noDamageMs, selfHp) {
    const thresholdMs = Math.max(0, Number(cfg.combatPressureCloseNoDamageMs || 0) || 0);
    const distance = Number.isFinite(Number(targetDistance)) ? Number(targetDistance) : dist(self, target);
    const closeRange = Math.max(
      Number(cfg.combatSpacingMinRange || 0),
      Number(cfg.combatPressureCloseRange || cfg.combatSpacingPreferredRange || 0)
    );
    const minHp = Math.max(0, Number(cfg.combatPressureCloseMinHp || cfg.combatLowHpLeaveThreshold || 0));
    const elapsed = Math.max(0, Number(noDamageMs || 0));
    if (!thresholdMs || elapsed < thresholdMs || !(distance > closeRange) || Number(selfHp || 0) < minHp) {
      return { active: false, dx: 0, dy: 0, distance, closeRange, noDamageMs: elapsed };
    }
    const dir = directionTo(self, target);
    return {
      active: Boolean(dir.dx || dir.dy),
      dx: dir.dx,
      dy: dir.dy,
      distance,
      closeRange,
      noDamageMs: elapsed,
      reason: 'long-no-damage'
    };
  }

  function combatFarNoDamageCloseVector(self, target, targetDistance, noDamageMs, selfHp, targetHp) {
    const thresholdMs = Math.max(0, Number(cfg.combatFarNoDamageCloseMs || 0) || 0);
    const startRange = Math.max(0, Number(cfg.combatFarNoDamageCloseStartRange || 0) || 0);
    const distance = Number.isFinite(Number(targetDistance)) ? Number(targetDistance) : dist(self, target);
    const closeRange = Math.max(
      Number(cfg.combatSpacingPreferredRange || 0),
      Number(cfg.combatFarNoDamageCloseRange || cfg.combatPressureCloseRange || 0)
    );
    const minHp = Math.max(0, Number(cfg.combatFarNoDamageCloseMinHp || cfg.combatPressureCloseMinHp || 0));
    const maxHpGap = Math.max(0, Number(cfg.combatFarNoDamageCloseMaxHpGap || 0));
    const elapsed = Math.max(0, Number(noDamageMs || 0));
    const hp = Number(selfHp);
    const enemyHp = Number(targetHp);
    const hpGap = Number.isFinite(hp) && Number.isFinite(enemyHp) ? enemyHp - hp : 0;
    if (!thresholdMs || !startRange || elapsed < thresholdMs || !(distance >= startRange) || !(distance > closeRange)) {
      return { active: false, dx: 0, dy: 0, distance, closeRange, noDamageMs: elapsed };
    }
    if (Number.isFinite(hp) && hp < minHp) {
      return { active: false, dx: 0, dy: 0, distance, closeRange, noDamageMs: elapsed, selfHp: hp, targetHp: enemyHp, hpGap };
    }
    if (Number.isFinite(hpGap) && hpGap > maxHpGap) {
      return { active: false, dx: 0, dy: 0, distance, closeRange, noDamageMs: elapsed, selfHp: hp, targetHp: enemyHp, hpGap };
    }
    const dir = directionTo(self, target);
    return {
      active: Boolean(dir.dx || dir.dy),
      dx: dir.dx,
      dy: dir.dy,
      distance,
      closeRange,
      startRange,
      noDamageMs: elapsed,
      selfHp: hp,
      targetHp: enemyHp,
      hpGap,
      reason: 'far-no-damage'
    };
  }

  function combatRetreatingFighterCloseVector(self, target, targetDistance, noDamageMs, selfHp, targetHp, retreatingTarget = null, targetRealBulletPressure = false) {
    const thresholdMs = Math.max(0, Number(cfg.combatFarNoDamageCloseMs || 0) || 0);
    const startRange = Math.max(0, Number(cfg.combatFarNoDamageCloseStartRange || 0) || 0);
    const distance = Number.isFinite(Number(targetDistance)) ? Number(targetDistance) : dist(self, target);
    const closeRange = Math.max(
      Number(cfg.combatSpacingPreferredRange || 0),
      Number(cfg.combatFarNoDamageCloseRange || cfg.combatPressureCloseRange || 0)
    );
    const minHp = Math.max(0, Number(cfg.combatRetreatingFighterCloseMinHp || cfg.combatFarNoDamageCloseMinHp || 0));
    const maxHpGap = Math.max(0, Number(cfg.combatRetreatingFighterCloseMaxHpGap || cfg.combatFarNoDamageCloseMaxHpGap || 0));
    const elapsed = Math.max(0, Number(noDamageMs || 0));
    const hp = Number(selfHp);
    const enemyHp = Number(targetHp);
    const hpGap = Number.isFinite(hp) && Number.isFinite(enemyHp) ? enemyHp - hp : 0;
    const activeRetreating = Boolean(retreatingTarget?.active && !retreatingTarget?.disengage);
    if (!activeRetreating || !targetRealBulletPressure || !thresholdMs || !startRange || elapsed < thresholdMs || !(distance >= startRange) || !(distance > closeRange)) {
      return { active: false, dx: 0, dy: 0, distance, closeRange, noDamageMs: elapsed, retreatingTarget };
    }
    if (Number.isFinite(hp) && hp < minHp) {
      return { active: false, dx: 0, dy: 0, distance, closeRange, noDamageMs: elapsed, selfHp: hp, targetHp: enemyHp, hpGap, retreatingTarget };
    }
    if (Number.isFinite(hpGap) && hpGap > maxHpGap) {
      return { active: false, dx: 0, dy: 0, distance, closeRange, noDamageMs: elapsed, selfHp: hp, targetHp: enemyHp, hpGap, retreatingTarget };
    }
    const dir = directionTo(self, target);
    return {
      active: Boolean(dir.dx || dir.dy),
      dx: dir.dx,
      dy: dir.dy,
      distance,
      closeRange,
      startRange,
      noDamageMs: elapsed,
      selfHp: hp,
      targetHp: enemyHp,
      hpGap,
      targetRealBulletPressure: true,
      farNoDamageClose: true,
      reason: 'retreating-fighter-close',
      retreatingTarget
    };
  }

  function combatFinishPressureState(self, target, targetDistance, selfHp, targetHp, retreatingTarget = null) {
    const attackRange = Math.max(0, Number(cfg.combatAttackRange || 0));
    const distance = Number.isFinite(Number(targetDistance)) ? Number(targetDistance) : dist(self, target);
    const minSelfHp = Math.max(0, Number(cfg.combatFinishPressureSelfHpMin || 0));
    const maxTargetHp = Math.max(0, Number(cfg.combatFinishPressureTargetHpMax || 0));
    const closeRange = Math.max(
      Number(cfg.combatSpacingMinRange || 0),
      Number(cfg.combatFinishPressureCloseRange || cfg.combatSpacingPreferredRange || 0)
    );
    const ownHp = Number(selfHp);
    const enemyHp = Number(targetHp);
    const inAttackRange = attackRange > 0 && distance <= attackRange;
    const retreatingEdge = Boolean(retreatingTarget?.active && retreatingTarget?.reason === 'target-retreating-edge');
    if (!retreatingEdge || !inAttackRange || !(distance > closeRange)) {
      return { active: false, dx: 0, dy: 0, distance, closeRange, selfHp: ownHp, targetHp: enemyHp };
    }
    if (!Number.isFinite(ownHp) || !Number.isFinite(enemyHp) || ownHp < minSelfHp || enemyHp > maxTargetHp) {
      return { active: false, dx: 0, dy: 0, distance, closeRange, selfHp: ownHp, targetHp: enemyHp };
    }
    const dir = directionTo(self, target);
    return {
      active: Boolean(dir.dx || dir.dy),
      dx: dir.dx,
      dy: dir.dy,
      distance,
      closeRange,
      selfHp: ownHp,
      targetHp: enemyHp,
      minSelfHp,
      maxTargetHp,
      reason: 'low-hp-retreating-target',
      retreatingTarget
    };
  }

  function combatOutOfRangeFinishPressureState(self, target, targetDistance, selfHp, targetHp, damageState = null, retreatingTarget = null) {
    const attackRange = Math.max(0, Number(cfg.combatAttackRange || 0));
    const maxRange = Math.max(attackRange, Number(cfg.combatOutOfRangeFinishPressureRange || 0));
    const distance = Number.isFinite(Number(targetDistance)) ? Number(targetDistance) : dist(self, target);
    const minSelfHp = Math.max(0, Number(cfg.combatOutOfRangeFinishPressureSelfHpMin || 0));
    const maxTargetHp = Math.max(0, Number(cfg.combatOutOfRangeFinishPressureTargetHpMax || 0));
    const maxHpGap = Number.isFinite(Number(cfg.combatOutOfRangeFinishPressureMaxHpGap))
      ? Number(cfg.combatOutOfRangeFinishPressureMaxHpGap)
      : 0;
    const recentDamageMs = Math.max(0, Number(cfg.combatOutOfRangeFinishPressureRecentDamageMs || 0));
    const noDamageMs = Math.max(0, Number(damageState?.noDamageMs || 0));
    const ownHp = Number(selfHp);
    const enemyHp = Number(targetHp);
    const hpGap = enemyHp - ownHp;
    if (!attackRange || !maxRange || !(distance > attackRange) || !(distance <= maxRange) || retreatingTarget?.disengage) {
      return { active: false, dx: 0, dy: 0, distance, attackRange, maxRange, selfHp: ownHp, targetHp: enemyHp, noDamageMs };
    }
    if (!recentDamageMs || noDamageMs > recentDamageMs) {
      return { active: false, dx: 0, dy: 0, distance, attackRange, maxRange, selfHp: ownHp, targetHp: enemyHp, noDamageMs };
    }
    if (!Number.isFinite(ownHp) || !Number.isFinite(enemyHp) || ownHp < minSelfHp || enemyHp > maxTargetHp || hpGap > maxHpGap) {
      return { active: false, dx: 0, dy: 0, distance, attackRange, maxRange, selfHp: ownHp, targetHp: enemyHp, hpGap, noDamageMs };
    }
    const dir = directionTo(self, target);
    return {
      active: Boolean(dir.dx || dir.dy),
      dx: dir.dx,
      dy: dir.dy,
      distance,
      attackRange,
      maxRange,
      selfHp: ownHp,
      targetHp: enemyHp,
      hpGap,
      noDamageMs,
      recentDamageMs,
      reason: 'out-of-range-low-hp-finish',
      retreatingTarget
    };
  }

  function combatOutOfRangeReengageState(self, target, targetDistance, selfHp, targetHp, retreatingTarget = null, targetRealBulletPressure = false) {
    const attackRange = Math.max(0, Number(cfg.combatAttackRange || 0));
    const maxRange = Math.max(attackRange, Number(cfg.combatOutOfRangeReengageRange || 0));
    const distance = Number.isFinite(Number(targetDistance)) ? Number(targetDistance) : dist(self, target);
    const minSelfHp = Math.max(0, Number(cfg.combatOutOfRangeReengageMinHp || 0));
    const maxHpGap = Math.max(0, Number(cfg.combatOutOfRangeReengageMaxHpGap || 0));
    const pressureMaxHpGap = Math.max(maxHpGap, Number(cfg.combatOutOfRangePressureReengageMaxHpGap || maxHpGap));
    const effectiveMaxHpGap = targetRealBulletPressure ? pressureMaxHpGap : maxHpGap;
    const recentInRangeMs = Math.max(0, Number(cfg.combatOutOfRangeReengageRecentInRangeMs || 0));
    const ownHp = Number(selfHp);
    const enemyHp = Number(targetHp);
    const hpGap = enemyHp - ownHp;
    const outOfRangeMs = Math.max(0, Number(target?.combatEngagement?.outOfRangeMs || 0));
    const graceRemainingMs = Math.max(0, Number(target?.combatEngagement?.graceRemainingMs || 0));
    const engagedIntent = /^(engaged|reengage)$/.test(String(target?.combatIntent || ''))
      || Boolean(target?.combatEngagement);
    const freshInRangeContact = Boolean(
      recentInRangeMs
      && outOfRangeMs <= recentInRangeMs
      && !retreatingTarget?.active
    );
    if (!attackRange || !maxRange || !(distance > attackRange) || !(distance <= maxRange) || retreatingTarget?.disengage) {
      return {
        active: false,
        dx: 0,
        dy: 0,
        distance,
        attackRange,
        maxRange,
        selfHp: ownHp,
        targetHp: enemyHp,
        hpGap,
        outOfRangeMs,
        graceRemainingMs
      };
    }
    if (!engagedIntent) {
      return {
        active: false,
        dx: 0,
        dy: 0,
        distance,
        attackRange,
        maxRange,
        selfHp: ownHp,
        targetHp: enemyHp,
        hpGap,
        outOfRangeMs,
        graceRemainingMs
      };
    }
    if (retreatingTarget?.active && !targetRealBulletPressure) {
      return {
        active: false,
        dx: 0,
        dy: 0,
        distance,
        attackRange,
        maxRange,
        selfHp: ownHp,
        targetHp: enemyHp,
        hpGap,
        outOfRangeMs,
        graceRemainingMs,
        retreatingTarget
      };
    }
    if (!targetRealBulletPressure && !freshInRangeContact) {
      return {
        active: false,
        dx: 0,
        dy: 0,
        distance,
        attackRange,
        maxRange,
        selfHp: ownHp,
        targetHp: enemyHp,
        hpGap,
        outOfRangeMs,
        graceRemainingMs,
        retreatingTarget
      };
    }
    if (!Number.isFinite(ownHp) || !Number.isFinite(enemyHp) || ownHp < minSelfHp || hpGap > effectiveMaxHpGap || combatMovementBlockedByStamina(self)) {
      return {
        active: false,
        dx: 0,
        dy: 0,
        distance,
        attackRange,
        maxRange,
        selfHp: ownHp,
        targetHp: enemyHp,
        hpGap,
        minSelfHp,
        maxHpGap: effectiveMaxHpGap,
        baseMaxHpGap: maxHpGap,
        pressureMaxHpGap,
        outOfRangeMs,
        graceRemainingMs,
        targetRealBulletPressure: Boolean(targetRealBulletPressure),
        freshInRangeContact,
        retreatingTarget
      };
    }
    const dir = directionTo(self, target);
    return {
      active: Boolean(dir.dx || dir.dy),
      dx: dir.dx,
      dy: dir.dy,
      distance,
      attackRange,
      maxRange,
      selfHp: ownHp,
      targetHp: enemyHp,
      hpGap,
      minSelfHp,
      maxHpGap: effectiveMaxHpGap,
      baseMaxHpGap: maxHpGap,
      pressureMaxHpGap,
      outOfRangeMs,
      graceRemainingMs,
      targetRealBulletPressure: Boolean(targetRealBulletPressure),
      freshInRangeContact,
      reason: targetRealBulletPressure ? 'target-real-bullet-pressure' : 'fresh-in-range-contact',
      retreatingTarget
    };
  }

  function combatPassiveRunnerState(self, target, targetDistance, damageState = null, pressure = null, motionScale = 0) {
    const t = Date.now();
    const selfHp = hpValue(self);
    const minSelfHp = Math.max(0, Number(cfg.combatPassiveRunnerMinSelfHp || 0));
    const minDrop = Math.max(0, Number(cfg.combatPassiveRunnerMinDrop || 0));
    const confirmMs = Math.max(0, Number(cfg.combatPassiveRunnerConfirmMs || 0));
    const targetDrop = Math.max(0, Number(dropValue(target) || target?.drop || 0));
    const active = isCurrentlyActive(target);
    const moving = speed(target) >= cfg.combatStationarySpeed
      || Number(motionScale || 0) >= Math.max(0, Number(cfg.combatAimMovingScaleThreshold || 0.15));
    const realPressure = Boolean(pressure && !pressure.synthetic);
    const recentlyInjured = bot.pendingInjuryLeave
      && Date.now() - Number(bot.pendingInjuryLeave.at || 0) <= cfg.combatStrafeLockMs * 3;
    const current = bot.combatTarget && combatTargetId(bot.combatTarget) === combatTargetId(target) ? bot.combatTarget : null;
    const samples = Array.isArray(current?.motionSamples) ? current.motionSamples : [];
    const firstSelfHp = samples.length ? Number(samples[0].selfHp) : null;
    const lastSelfHp = samples.length ? Number(samples[samples.length - 1].selfHp) : null;
    const recentSelfDamage = Number.isFinite(firstSelfHp) && Number.isFinite(lastSelfHp)
      ? Math.max(0, firstSelfHp - lastSelfHp)
      : 0;
    const intent = String(target?.combatIntent || current?.intent || '');
    const originIntent = String(current?.originIntent || current?.intent || intent);
    const runnerIntent = /^(defensive|engaged|profit|reengage)$/.test(intent);
    const rewarded = targetDrop >= minDrop || runnerIntent;
    const engagedMs = current
      ? Math.max(0, t - Number(current.firstSeenAt || current.at || t))
      : 0;
    const confirmed = engagedMs >= confirmMs;
    const seenTargetRealBulletAt = Number(current?.seenTargetRealBulletAt || 0);
    const seenTargetRealBulletMs = seenTargetRealBulletAt ? Math.max(0, t - seenTargetRealBulletAt) : 0;
    const eligible = Boolean(
      active
      && moving
      && runnerIntent
      && rewarded
      && !isFiringEntity(target)
      && !isInvulnerable(target)
      && !realPressure
      && !recentlyInjured
      && confirmed
      && !seenTargetRealBulletAt
      && Number.isFinite(selfHp)
      && selfHp >= minSelfHp
      && recentSelfDamage <= 0.01
    );
    return {
      active: eligible,
      selfHp,
      minSelfHp,
      targetDrop,
      minDrop,
      distance: Number.isFinite(Number(targetDistance)) ? Math.round(Number(targetDistance)) : null,
      moving,
      motionScale: Number.isFinite(Number(motionScale)) ? Number(Number(motionScale).toFixed(2)) : 0,
      recentSelfDamage,
      pressureReason: pressure?.reason || '',
      combatIntent: intent,
      originIntent,
      engagedMs,
      confirmMs,
      confirmed,
      seenTargetRealBulletAt: seenTargetRealBulletAt || 0,
      seenTargetRealBulletMs,
      noDamageMs: Math.max(0, Number(damageState?.noDamageMs || 0))
    };
  }

  function combatPassiveRunnerCloseVector(self, target, targetDistance, runnerState) {
    const distance = Number.isFinite(Number(targetDistance)) ? Number(targetDistance) : dist(self, target);
    const closeRange = Math.max(
      Number(cfg.combatSpacingMinRange || 0),
      Number(cfg.combatPassiveRunnerCloseRange || 0)
    );
    if (!runnerState?.active || !(distance > closeRange)) {
      return { active: false, dx: 0, dy: 0, distance, closeRange, reason: 'passive-runner' };
    }
    const dir = directionTo(self, target);
    return {
      active: Boolean(dir.dx || dir.dy),
      dx: dir.dx,
      dy: dir.dy,
      distance,
      closeRange,
      noDamageMs: Math.max(0, Number(runnerState.noDamageMs || 0)),
      reason: 'passive-runner'
    };
  }

  function mergeCombatMove(primary, spacing, allowSpacingMerge = true) {
    if (!spacing?.active || !allowSpacingMerge) return primary || { dx: 0, dy: 0 };
    const current = primary || { dx: 0, dy: 0 };
    const mergeAxis = (value, spacingValue) => {
      const v = clamp(Math.round(Number(value) || 0), -1, 1);
      const s = clamp(Math.round(Number(spacingValue) || 0), -1, 1);
      if (v && s && Math.sign(v) !== Math.sign(s)) return s;
      return v || s;
    };
    return {
      ...current,
      dx: mergeAxis(current.dx, spacing.dx),
      dy: mergeAxis(current.dy, spacing.dy),
      spacingMerged: true
    };
  }

  function combatPressureThreat(self, target, bullets) {
    const bullet = target.incomingBullet || incomingBulletThreat(self, target, bullets) || incomingBulletThreat(self, null, bullets);
    if (bullet) return { ...bullet, reason: 'incoming-bullet' };
    const injury = bot.pendingInjuryLeave;
    const recentlyInjured = injury && Date.now() - Number(injury.at || 0) <= cfg.combatStrafeLockMs * 3;
    const pressure = recentlyInjured || isFiringEntity(target) || isCurrentlyActive(target);
    if (!pressure) return null;
    const vx = Number(self.x) - Number(target.x);
    const vy = Number(self.y) - Number(target.y);
    const distance = Math.hypot(vx, vy);
    return {
      id: 'pressure:' + (target.user_id ?? target.id ?? ''),
      ownerId: target.user_id ?? null,
      x: Number(target.x),
      y: Number(target.y),
      vx,
      vy,
      distance,
      projection: distance,
      laneDistance: 0,
      synthetic: true,
      reason: recentlyInjured ? 'recent-injury' : 'target-pressure'
    };
  }

  function combatOutOfRangeDodgeAction(self, target, pressure, baseTarget, selfHp, targetHp, retreatingTarget = null, closeMove = null) {
    if (!pressure || pressure.synthetic) return null;
    const attackRange = Math.max(0, Number(cfg.combatAttackRange || 0));
    const dodgeRange = combatDodgeThreatRange();
    const targetDistance = Number.isFinite(Number(target?.distance)) ? Number(target.distance) : dist(self, target);
    if (!attackRange || !(targetDistance > attackRange) || !(targetDistance <= dodgeRange)) return null;
    const spacing = combatSpacingVector(self, target, targetDistance);
    const closeOverride = combatSafeCloseMoveOverride(self, target, pressure, closeMove);
    const strafe = closeOverride
      ? {
        dx: closeOverride.dx,
        dy: closeOverride.dy,
        active: true,
        closingBiased: true,
        safeCloseOverride: closeOverride
      }
      : tangentMoveForBullet(self, target, pressure, { preferClosing: false });
    const spacingOverride = combatSpacingShouldOverrideBullet(spacing, selfHp, targetHp);
    let combatMove = mergeCombatMove(strafe, spacing, spacingOverride);
    const movementSuppressed = combatMovementBlockedByStamina(self) && Boolean(combatMove.dx || combatMove.dy)
      ? {
        reason: 'stamina-5s-exhausted',
        stamina5s: staminaRemaining(self, '5s'),
        thresholdMs: staminaExhaustedThreshold(),
        requestedDx: combatMove.dx,
        requestedDy: combatMove.dy
      }
      : null;
    if (movementSuppressed) combatMove = { ...combatMove, dx: 0, dy: 0, movementSuppressed: true };
    const spacingActive = Boolean(spacing.active && (combatMove.dx || combatMove.dy));
    return {
      kind: 'attack',
      reason: movementSuppressed ? 'combat-stamina-hold' : (spacingOverride ? 'combat-spacing-dodge' : 'combat-out-of-range-dodge'),
      combat: true,
      combatDodgeOnly: true,
      ignoreReturnBlock: true,
      shoot: false,
      forceShoot: false,
      dx: combatMove.dx,
      dy: combatMove.dy,
      target: {
        ...baseTarget,
        combatDodgeOnly: true
      },
      incomingBullet: {
        id: pressure.id,
        ownerId: pressure.ownerId,
        distance: Math.round(Number(pressure.distance || 0)),
        laneDistance: Math.round(Number(pressure.laneDistance || 0)),
        signedLaneDistance: Number.isFinite(Number(pressure.signedLaneDistance)) ? Math.round(Number(pressure.signedLaneDistance)) : null,
        timeToImpactMs: Number.isFinite(Number(pressure.timeToImpactMs)) ? Math.round(Number(pressure.timeToImpactMs)) : null,
        threatCount: Number(pressure.threatCount || (Array.isArray(pressure.threats) ? pressure.threats.length : 1)),
        synthetic: false,
        reason: pressure.reason || 'incoming-bullet'
      },
      combatState: {
        selfHp,
        targetHp,
        dodgeOnly: {
          distance: Math.round(targetDistance),
          attackRange: Math.round(attackRange),
          dodgeRange: Math.round(dodgeRange),
          buffer: Math.max(0, Math.round(dodgeRange - attackRange)),
          reason: 'incoming-bullet-outside-attack-range'
        },
        strafe: {
          dx: combatMove.dx,
          dy: combatMove.dy,
          sign: strafe.sign,
          precise: Boolean(strafe.precise),
          locked: Boolean(strafe.locked),
          lockOverridden: Boolean(strafe.lockOverridden),
          closingBiased: Boolean(strafe.closingBiased),
          safeCloseOverride: closeOverride ? {
            dx: closeOverride.dx,
            dy: closeOverride.dy,
            reason: closeOverride.reason,
            minCpaDistance: Number.isFinite(Number(closeOverride.threatField?.minCpaDistance)) ? Math.round(Number(closeOverride.threatField.minCpaDistance)) : null,
            directHitCount: Number(closeOverride.threatField?.directHitCount || 0)
          } : null,
          carried: Boolean(strafe.carried),
          holdRemainingMs: strafe.holdRemainingMs || 0,
          carryRemainingMs: strafe.carryRemainingMs || 0,
          spacingMerged: Boolean(combatMove.spacingMerged),
          threatField: strafe.threatField ? {
            dx: strafe.threatField.dx,
            dy: strafe.threatField.dy,
            directHitCount: strafe.threatField.directHitCount,
            minCpaDistance: Number.isFinite(Number(strafe.threatField.minCpaDistance)) ? Math.round(Number(strafe.threatField.minCpaDistance)) : null,
            minTimeToImpactMs: Number.isFinite(Number(strafe.threatField.minTimeToImpactMs)) ? Math.round(Number(strafe.threatField.minTimeToImpactMs)) : null
          } : null
        },
        spacing: spacingActive ? {
          dx: spacing.dx,
          dy: spacing.dy,
          reason: spacing.reason,
          distance: Math.round(spacing.distance),
          minRange: Math.round(spacing.minRange),
          preferredRange: Math.round(spacing.preferredRange),
          radialSpeed: Number.isFinite(Number(spacing.radialSpeed)) ? Math.round(Number(spacing.radialSpeed)) : null,
          merged: Boolean(combatMove.spacingMerged),
          overrideBullet: Boolean(spacingOverride)
        } : null,
        movementSuppressed,
        retreatingTarget: retreatingTarget?.active ? retreatingTarget : null
      }
    };
  }



  function combatAimJitterLimit(distance, motionScale = 1) {
    const maxJitter = Math.max(0, Number(cfg.combatAimJitterMaxRadians || cfg.combatAimJitterRadians || 0));
    const minJitter = clamp(Number(cfg.combatAimJitterMinRadians ?? maxJitter), 0, maxJitter);
    const scale = clamp(Number.isFinite(Number(motionScale)) ? Number(motionScale) : 1, 0, 1);
    const minScale = clamp(Number(cfg.combatAimMinMotionJitterScale ?? 0.2), 0, 1);
    const closeDistance = Math.max(0, Number(cfg.combatAimJitterCloseDistance || 0));
    const farDistance = Math.max(closeDistance + 1, Number(cfg.combatAimJitterFarDistance || cfg.combatAttackRange || closeDistance + 1));
    const rawDistance = Number(distance);
    const d = clamp(Number.isFinite(rawDistance) ? rawDistance : farDistance, closeDistance, farDistance);
    const nearFactor = 1 - ((d - closeDistance) / (farDistance - closeDistance));
    const interpolated = (minJitter + (maxJitter - minJitter) * nearFactor) * Math.max(minScale, scale);
    const bulletSpeed = Math.max(1, Number(cfg.combatBulletSpeedPerTick || 500));
    const dodgeSpeed = Math.max(0, Number(cfg.combatTargetDodgeSpeedPerTick || 50));
    const hitRadius = Math.max(0, Number(cfg.combatBulletHitRadiusCm || 90));
    const evasionScale = Math.max(0, Number(cfg.combatAimEvasionScale ?? 1));
    const travelTicks = d / bulletSpeed;
    const evasionWidth = (dodgeSpeed * scale * travelTicks + hitRadius) * evasionScale;
    const evasionAngle = d > 0 ? Math.atan(evasionWidth / d) : maxJitter;
    return clamp(Math.max(interpolated, evasionAngle), minJitter * minScale, maxJitter);
  }

  function combatAimMotionScale(target) {
    const maxSpeed = Math.max(1, Number(cfg.combatTargetDodgeSpeedPerTick || 50));
    const observedSpeed = Math.max(
      speed(target),
      Number(target?.motionObservedSpeed || 0),
      Number(target?.motionSampleSpeed || 0)
    );
    let scale = clamp(observedSpeed / maxSpeed, 0, 1);
    if (target?.recentlyMoved) {
      const decayMs = Math.max(1, Number(cfg.combatAimRecentMotionDecayMs || 900));
      const ageMs = Number(target.motionAgeMs);
      const recent = Number.isFinite(ageMs)
        ? clamp(1 - ageMs / decayMs, 0, 1)
        : 1;
      scale = Math.max(scale, recent * Math.max(0, Number(cfg.combatAimMovingScaleThreshold || 0.15)));
    }
    return scale;
  }

  function combatMotionSample(self, target, at = Date.now()) {
    if (!target) return null;
    const x = Number(target.x);
    const y = Number(target.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const distance = self ? (Number.isFinite(Number(target.distance)) ? Number(target.distance) : dist(self, target)) : Number(target.distance);
    return {
      at,
      x,
      y,
      vx: Number(target.vx) || 0,
      vy: Number(target.vy) || 0,
      distance: Number.isFinite(distance) ? distance : null,
      hp: knownHpValue(target),
      selfHp: knownHpValue(self)
    };
  }

  function combatMotionSamplesWithCurrent(self, target, t = Date.now(), windowMsOverride = null) {
    const id = combatTargetId(target);
    const previous = bot.combatTarget || null;
    const same = previous && id && String(previous.id ?? '') === id;
    const windowMs = Math.max(250, Number(windowMsOverride || cfg.combatMotionHistoryWindowMs || 2000));
    const maxSamples = Math.max(2, Math.round(Number(cfg.combatMotionHistoryMaxSamples || 80)));
    const samples = same && Array.isArray(previous.motionSamples) ? previous.motionSamples.slice() : [];
    const current = combatMotionSample(self, target, t);
    if (current) samples.push(current);
    return samples
      .filter(sample => sample && Number.isFinite(Number(sample.at)) && t - Number(sample.at) <= windowMs)
      .sort((a, b) => Number(a.at) - Number(b.at))
      .slice(-maxSamples);
  }

  function combatOpponentProfile(self, target, targetDistance = null) {
    const samples = combatMotionSamplesWithCurrent(self, target, Date.now(), Math.max(250, Number(cfg.combatMotionHistoryWindowMs || 2000)));
    const threshold = Math.max(1, Number(cfg.combatStationarySpeed || 5));
    let lateralFlips = 0;
    let previousLateralSign = 0;
    let radialSum = 0;
    let radialCount = 0;
    let speedSum = 0;
    let dotSum = 0;
    let dotCount = 0;
    for (const sample of samples) {
      const sx = Number(sample.x);
      const sy = Number(sample.y);
      const vx = Number(sample.vx) || 0;
      const vy = Number(sample.vy) || 0;
      const dx = sx - Number(self?.x || 0);
      const dy = sy - Number(self?.y || 0);
      const d = Math.max(1, Math.hypot(dx, dy));
      const radial = (dx / d) * vx + (dy / d) * vy;
      const lateral = (dx / d) * vy - (dy / d) * vx;
      const lateralSign = Math.abs(lateral) >= threshold ? Math.sign(lateral) : 0;
      if (lateralSign && previousLateralSign && lateralSign !== previousLateralSign) lateralFlips += 1;
      if (lateralSign) previousLateralSign = lateralSign;
      radialSum += radial;
      radialCount += 1;
      speedSum += Math.hypot(vx, vy);
    }
    for (let i = 1; i < samples.length; i += 1) {
      const a = samples[i - 1];
      const b = samples[i];
      const av = Math.hypot(Number(a.vx) || 0, Number(a.vy) || 0);
      const bv = Math.hypot(Number(b.vx) || 0, Number(b.vy) || 0);
      if (av >= threshold && bv >= threshold) {
        dotSum += ((Number(a.vx) || 0) * (Number(b.vx) || 0) + (Number(a.vy) || 0) * (Number(b.vy) || 0)) / (av * bv);
        dotCount += 1;
      }
    }
    const durationMs = samples.length >= 2 ? Math.max(0, Number(samples[samples.length - 1].at) - Number(samples[0].at)) : 0;
    const velocityStability = dotCount ? clamp((dotSum / dotCount + 1) / 2, 0, 1) : 0.5;
    const avgRadialSpeed = radialCount ? radialSum / radialCount : 0;
    const avgSpeed = samples.length ? speedSum / samples.length : speed(target);
    const distance = Number.isFinite(Number(targetDistance)) ? Number(targetDistance) : (Number.isFinite(Number(target?.distance)) ? Number(target.distance) : dist(self, target));
    const strafePattern = Boolean(samples.length >= 4 && lateralFlips >= 2 && durationMs >= 600);
    const kiting = Boolean(samples.length >= 3
      && avgRadialSpeed >= Math.max(3, threshold)
      && distance >= Math.max(0, Number(cfg.combatSpacingPreferredRange || 0))
      && (isFiringEntity(target) || isCurrentlyActive(target)));
    const maneuverScale = clamp((1 - velocityStability) * 0.7 + Math.min(1, lateralFlips / 3) * 0.45 + (kiting ? 0.2 : 0), 0, 1);
    const aimConfidenceScale = clamp(1.08 - maneuverScale * 0.45, 0.55, 1.08);
    return {
      sampleCount: samples.length,
      durationMs,
      lateralFlips,
      velocityStability,
      avgRadialSpeed,
      avgSpeed,
      strafePattern,
      kiting,
      maneuverScale,
      aimConfidenceScale
    };
  }

  function combatTradeEstimate(self, target) {
    const previous = bot.combatTarget || null;
    const id = combatTargetId(target);
    const same = previous && id && String(previous.id ?? '') === id;
    if (!same) return null;
    const t = Date.now();
    const windowMs = Math.max(1000, Number(cfg.combatTradeEstimateWindowMs || 6000));
    const samples = combatMotionSamplesWithCurrent(self, target, t, windowMs)
      .filter(sample => t - Number(sample.at) <= windowMs && Number.isFinite(Number(sample.hp)) && Number.isFinite(Number(sample.selfHp)));
    if (samples.length < 3) return null;
    const first = samples[0];
    const last = samples[samples.length - 1];
    const elapsedMs = Math.max(1, Number(last.at) - Number(first.at));
    if (elapsedMs < Math.max(500, Number(cfg.combatTradeEstimateMinWindowMs || 1800))) return null;
    const targetDamage = Math.max(0, Number(first.hp) - Number(last.hp));
    const selfDamage = Math.max(0, Number(first.selfHp) - Number(last.selfHp));
    const myDps = targetDamage / elapsedMs * 1000;
    const enemyDps = selfDamage / elapsedMs * 1000;
    const selfHp = hpValue(self);
    const targetHp = combatHpValue(target);
    const tKillMs = myDps > 0.05 ? targetHp / myDps * 1000 : Infinity;
    const tDeathMs = enemyDps > 0.05 ? selfHp / enemyDps * 1000 : Infinity;
    const minSelfDamage = Math.max(0, Number(cfg.combatTradeEstimateMinSelfDamage || 6));
    const minEnemyDps = Math.max(0, Number(cfg.combatTradeEstimateMinEnemyDps || 1.5));
    const safetyFactor = Math.max(1, Number(cfg.combatTradeEstimateSafetyFactor || 1.15));
    const noDamageSafeSelfHp = Math.max(0, Number(cfg.combatTradeEstimateNoDamageSafeSelfHp || 75));
    const noDamageUnsafeTDeathMs = Math.max(1000, Number(cfg.combatTradeEstimateNoDamageUnsafeTDeathMs || 30000));
    const zeroDamageWindow = targetDamage <= 0.01;
    const noDamageUnsafe = !zeroDamageWindow
      || selfHp <= noDamageSafeSelfHp
      || tDeathMs <= noDamageUnsafeTDeathMs;
    const disadvantaged = Boolean(
      selfDamage >= minSelfDamage
      && enemyDps >= minEnemyDps
      && tDeathMs < tKillMs * safetyFactor
      && targetHp > 1
      && noDamageUnsafe
    );
    return {
      active: disadvantaged,
      sampleCount: samples.length,
      elapsedMs,
      selfDamage,
      targetDamage,
      myDps,
      enemyDps,
      tKillMs,
      tDeathMs,
      safetyFactor,
      zeroDamageWindow,
      noDamageUnsafe
    };
  }



const {
  dailyStaminaBudgetIsLimitingCore,
  summarizeBlockedStaminaOpportunityCore,
  summarizeNearestCoinStaminaBudgetExitCore,
  pickNearestDailyStaminaFinalCoinCore
} = require('./runtime/stamina-budget');

  function opportunityMoveStaminaCost(distance, stopDistance = 0) {
    const travel = Math.max(0, Number(distance || 0) - Math.max(0, Number(stopDistance || 0)));
    return travel * Math.max(0, Number(cfg.opportunityMoveStaminaPerCm ?? 1));
  }

  function opportunityCoinStaminaCost(coin) {
    const override = Number(coin?.opportunityStaminaCost ?? coin?.staminaCost ?? NaN);
    if (Number.isFinite(override) && override >= 0) return override;
    return opportunityMoveStaminaCost(coin?.distance, 0)
      + Math.max(0, Number(cfg.opportunityCoinPickupStaminaMs || 0));
  }

  function estimatedKillShots(target) {
    const damage = Math.max(0.1, Number(cfg.opportunityEstimatedDamagePerShot || 3));
    const hp = Math.max(1, Number(combatHpValue(target) || 100));
    return Math.max(1, Math.ceil(hp / damage));
  }

  function opportunityEnemyStaminaCost(target) {
    const moveCost = opportunityMoveStaminaCost(target?.distance, 0);
    const shotCost = estimatedKillShots(target) * Math.max(0, Number(cfg.opportunityShotStaminaCostMs || 500));
    return moveCost + shotCost;
  }

	  function opportunityWindowStaminaBudget(self, windowName) {
	    const remaining = staminaRemaining(self, windowName);
	    if (!Number.isFinite(remaining)) return Infinity;
	    const reserve = staminaExhaustedThreshold() + Math.max(0, Number(cfg.opportunityLongStaminaReserveMs || 0));
	    return Math.max(0, remaining - reserve);
	  }

	  function opportunityLongStaminaBudget(self) {
	    const values = ['1h', '1d']
	      .map(key => opportunityWindowStaminaBudget(self, key))
	      .filter(value => Number.isFinite(value));
	    if (!values.length) return Infinity;
	    return Math.min(...values);
	  }

  function opportunityStaminaAffordable(self, staminaCost) {
    const cost = Number(staminaCost);
    if (!Number.isFinite(cost) || cost <= 0) return true;
    const budget = opportunityLongStaminaBudget(self);
    return !Number.isFinite(budget) || cost <= budget;
  }

	  function dailyStaminaFinalCoinAction(self, coin) {
	    if (!coin) return null;
	    const action = buildCoinAction(
	      self,
	      coin,
	      'daily-stamina-final-visible-coin',
	      coin.distance <= cfg.coinMaxDistance ? 'coin' : 'seek-coin'
	    );
	    return {
	      ...action,
	      dailyStaminaFinalRun: {
	        staminaCost: Math.round(opportunityCoinStaminaCost(coin)),
	        budgetMs: Math.max(0, Math.round(opportunityWindowStaminaBudget(self, '1d'))),
	        distance: Math.round(Number(coin.distance || 0)),
	        amount: Math.max(0, Math.round(Number(coin.amount || 0)))
	      }
	    };
	  }

	  function staminaBudgetCoinLeaveSummary(staminaBudgetExit) {
	    const detail = staminaBudgetExit || {};
	    return '一小时体力预算不足，最近金币距离' + formatDistance(detail.distance)
	      + '，预算' + formatDurationMs(detail.budgetMs)
	      + '，需要' + formatDurationMs(detail.requiredMs)
	      + '，差' + formatDurationMs(detail.shortageMs)
	      + '，退出等待重连';
	  }

	  function staminaBudgetCoinLeaveDisplay(staminaBudgetExit) {
	    return staminaBudgetCoinLeaveSummary(staminaBudgetExit)
	      + '，等待' + formatDurationMs(staminaBudgetExit?.reloginDelayMs || staminaBudgetReloginDelayMs());
	  }

	  function staminaBudgetCoinLeaveAction(staminaBudgetExit) {
	    return {
	      kind: 'leave',
	      reason: 'stamina-budget-coin-leave',
	      dx: 0,
	      dy: 0,
	      offline: true,
	      ignoreReturnBlock: true,
	      displayReason: staminaBudgetCoinLeaveDisplay(staminaBudgetExit),
	      staminaBudgetExit,
	      reloginDelayMs: staminaBudgetExit?.reloginDelayMs || staminaBudgetReloginDelayMs()
	    };
	  }

	  function compareCoinOpportunity(a, b) {
	    const scoreDiff = scoreCoinOpportunity(b) - scoreCoinOpportunity(a);
	    if (scoreDiff) return scoreDiff;
	    const amountDiff = Number(b.amount || 0) - Number(a.amount || 0);
	    if (amountDiff) return amountDiff;
	    return Number(a.distance || 0) - Number(b.distance || 0);
	  }


  const { currentOfflineDisplayReasonCore: currentOfflineDisplayReasonForCombatStateCore } = require('./runtime/exit-relogin');

  function combatTargetId(target) {
    const id = target?.user_id ?? target?.id;
    return id === null || id === undefined ? '' : String(id);
  }

  function combatRetreatIgnoreActive(target, t = Date.now()) {
    const id = combatTargetId(target);
    if (!id || !bot.combatRetreatIgnore) return false;
    const until = Number(bot.combatRetreatIgnore.get(id) || 0);
    if (!until) return false;
    if (until <= t) {
      bot.combatRetreatIgnore.delete(id);
      return false;
    }
    return true;
  }

  function rememberCombatRetreatIgnore(target, t = Date.now()) {
    const id = combatTargetId(target);
    if (!id) return;
    if (!bot.combatRetreatIgnore) bot.combatRetreatIgnore = new Map();
    bot.combatRetreatIgnore.set(id, t + Math.max(1000, Number(cfg.combatRetreatIgnoreMs || 0) || 15000));
  }

  function clearCombatDisadvantageObservation(reason = '') {
    if (!bot.combatDisadvantageObservation) return;
    bot.lastCombatDisadvantageObservationClear = { at: Date.now(), reason };
    bot.combatDisadvantageObservation = null;
  }

  function combatDisadvantageObservationState(target, kind, evidence = {}) {
    const id = combatTargetId(target);
    if (!id || !kind) return null;
    const t = Date.now();
    const previous = bot.combatDisadvantageObservation || null;
    const same = previous && String(previous.id || '') === id && String(previous.kind || '') === String(kind);
    const currentTarget = bot.combatTarget && String(bot.combatTarget.id ?? '') === id ? bot.combatTarget : null;
    const firstAt = same ? Number(previous.firstAt || previous.at || t) : t;
    const count = Math.max(1, same ? Number(previous.count || 1) + 1 : 1);
    const engagedAt = Number(currentTarget?.firstSeenAt || currentTarget?.at || firstAt || t);
    const observedMs = Math.max(0, t - firstAt);
    const engagedMs = Math.max(0, t - engagedAt);
    const confirmMs = Math.max(0, Number(cfg.combatDisadvantageConfirmMs || 0));
    const minEngageMs = Math.max(0, Number(cfg.combatDisadvantageMinEngageMs || 0));
    const minSamples = Math.max(1, Math.round(Number(cfg.combatDisadvantageMinSamples || 1)));
    const sampleCount = Math.max(
      count,
      Math.round(Number(evidence?.sampleCount || 0)),
      Array.isArray(currentTarget?.motionSamples) ? currentTarget.motionSamples.length : 0
    );
    const remainingMs = Math.max(0, confirmMs - observedMs, minEngageMs - engagedMs);
    const samplesRemaining = Math.max(0, minSamples - sampleCount);
    const state = {
      active: true,
      id,
      kind: String(kind),
      firstAt,
      at: t,
      observedMs: Math.round(observedMs),
      engagedMs: Math.round(engagedMs),
      count,
      sampleCount,
      confirmMs,
      minEngageMs,
      minSamples,
      remainingMs: Math.round(remainingMs),
      samplesRemaining,
      ready: remainingMs <= 0 && samplesRemaining <= 0,
      evidence
    };
    bot.combatDisadvantageObservation = state;
    return state;
  }

  function combatAimDamageState(target) {
    const id = combatTargetId(target);
    const previous = bot.combatTarget;
    const same = previous && id && String(previous.id ?? '') === id;
    const t = Date.now();
    const currentHp = knownHpValue(target);
    const previousHp = same && Number.isFinite(Number(previous.hp)) ? Number(previous.hp) : null;
    const damaged = currentHp !== null && previousHp !== null && currentHp < previousHp - 0.01;
    const lastDamageAt = damaged
      ? t
      : (same ? Number(previous.lastDamageAt || previous.at || t) : t);
    const noDamageMs = Math.max(0, t - lastDamageAt);
    return {
      damaged,
      currentHp,
      previousHp,
      lastDamageAt,
      noDamageMs,
      widenMs: Math.max(0, noDamageMs - Math.max(0, Number(cfg.combatAimNoDamageMs) || 0))
    };
  }

  function combatLowHpNoDamageLeaveState(selfHp, targetHp, damageState) {
    const threshold = Math.max(0, Number(cfg.combatLowHpNoDamageLeaveThreshold || 0));
    const waitMs = Math.max(0, Number(cfg.combatLowHpNoDamageLeaveMs || 0));
    const minGap = Number.isFinite(Number(cfg.combatLowHpNoDamageMinGap))
      ? Number(cfg.combatLowHpNoDamageMinGap)
      : 0;
    const hpGap = Number(targetHp) - Number(selfHp);
    const noDamageMs = Number(damageState?.noDamageMs || 0);
    if (!threshold || !waitMs || !(Number(selfHp) < threshold) || !(hpGap >= minGap) || !(noDamageMs >= waitMs)) return null;
    return { selfHp, targetHp, hpGap, noDamageMs, threshold, waitMs, minGap };
  }

  function combatRetreatingTargetState(self, target, targetDistance, damageState = null) {
    const attackRange = Math.max(0, Number(cfg.combatAttackRange || 0));
    const disengageRange = Math.max(attackRange, Number(cfg.combatDisengageRange || cfg.combatEngageGraceRange || attackRange || 0));
    const edgeRange = Math.min(
      attackRange || Infinity,
      Math.max(0, Number(cfg.combatRetreatEdgeRange || 0) || attackRange * 0.95)
    );
    const minRadialSpeed = Math.max(0, Number(cfg.combatRetreatRadialSpeedMin || cfg.combatStationarySpeed || 0));
    const minDistanceDelta = Math.max(0, Number(cfg.combatRetreatDistanceDeltaMin || 0));
    const dx = Number(target?.x) - Number(self?.x);
    const dy = Number(target?.y) - Number(self?.y);
    const distance = Number.isFinite(Number(targetDistance)) ? Number(targetDistance) : Math.hypot(dx, dy);
    const d = Math.max(1, Number.isFinite(distance) ? distance : Math.hypot(dx, dy));
    const vx = Number(target?.vx) || 0;
    const vy = Number(target?.vy) || 0;
    const radialSpeed = (dx / d) * vx + (dy / d) * vy;
    const previous = bot.combatTarget;
    const same = previous && combatTargetId(previous) && combatTargetId(previous) === combatTargetId(target);
    const previousDistance = same && Number.isFinite(Number(previous.distance)) ? Number(previous.distance) : null;
    const distanceDelta = previousDistance === null ? 0 : distance - previousDistance;
    const receding = Boolean(
      (minRadialSpeed > 0 && radialSpeed >= minRadialSpeed)
      || (minDistanceDelta > 0 && distanceDelta >= minDistanceDelta)
    );
    const outOfRange = attackRange > 0 && distance > attackRange;
    const beyondDisengage = disengageRange > 0 && distance > disengageRange;
    const edge = edgeRange > 0 && distance >= edgeRange;
    const active = Boolean(receding && (outOfRange || edge));
    return {
      active,
      disengage: Boolean(beyondDisengage),
      suppressFire: Boolean(active && edge),
      reason: beyondDisengage ? 'target-beyond-disengage-range' : (outOfRange ? 'target-out-of-attack-range' : 'target-retreating-edge'),
      distance: Number.isFinite(distance) ? Math.round(distance) : null,
      attackRange: Math.round(attackRange),
      disengageRange: Math.round(disengageRange),
      edgeRange: Math.round(edgeRange),
      radialSpeed: Number.isFinite(radialSpeed) ? Math.round(radialSpeed) : 0,
      distanceDelta: Number.isFinite(distanceDelta) ? Math.round(distanceDelta) : 0,
      noDamageMs: Math.max(0, Number(damageState?.noDamageMs || 0))
    };
  }

  function combatServerStallNoDamageLeaveState(selfHp, targetHp, noDamageMs, realBulletPressure = false, serverPositionStall = null) {
    const waitMs = Math.max(0, Number(cfg.combatServerStallNoDamageLeaveMs || 0));
    const precisionWaitMs = Math.max(0, Number(cfg.combatAimFallbackPrecisionNoDamageMs || 0));
    const precisionGraceMs = Math.max(0, Number(cfg.combatServerStallNoDamagePrecisionGraceMs || 0));
    const effectiveWaitMs = Math.max(waitMs, precisionWaitMs ? precisionWaitMs + precisionGraceMs : waitMs);
    const minGap = Math.max(0, Number(cfg.combatServerStallNoDamageHpGap || 0));
    const hp = Number(selfHp);
    const enemyHp = Number(targetHp);
    const hpGap = enemyHp - hp;
    const elapsed = Math.max(0, Number(noDamageMs || 0));
    const stall = serverPositionStall || {};
    if (!waitMs || !stall.stalled || !realBulletPressure) return null;
    if (!Number.isFinite(hp) || !Number.isFinite(enemyHp) || !Number.isFinite(hpGap)) return null;
    if (elapsed < effectiveWaitMs || hpGap < minGap) return null;
    return {
      active: true,
      selfHp: hp,
      targetHp: enemyHp,
      hpGap,
      noDamageMs: elapsed,
      waitMs,
      effectiveWaitMs,
      precisionWaitMs,
      precisionGraceMs,
      minGap,
      realBulletPressure: true,
      serverPositionStall: {
        stalled: true,
        reason: stall.reason || 'server-position-stalled',
        movingMs: Number.isFinite(Number(stall.movingMs)) ? Math.round(Number(stall.movingMs)) : null,
        gap: Number.isFinite(Number(stall.gap)) ? Math.round(Number(stall.gap)) : null,
        gapDelta: Number.isFinite(Number(stall.gapDelta)) ? Math.round(Number(stall.gapDelta)) : null,
        holdRemainingMs: Number.isFinite(Number(stall.holdRemainingMs)) ? Math.round(Number(stall.holdRemainingMs)) : null
      }
    };
  }

  function combatTrendState(self, options = {}) {
    const selfHp = hpValue(self);
    const targetHp = Number(options.targetHp);
    const targetDistance = Number(options.targetDistance);
    const noDamageMs = Math.max(0, Number(options.noDamageMs || 0));
    const hpGap = Number(targetHp) - Number(selfHp);
    const highHpMin = Math.max(0, Number(cfg.combatShootHighHpMinHp || 0));
    const highHpFireWindow = highHpMin > 0
      && Number.isFinite(selfHp)
      && selfHp >= highHpMin
      && (!Number.isFinite(targetHp) || selfHp >= targetHp);
    const finishLowThreatMinHp = Math.max(0, Number(cfg.combatShootFinishLowThreatMinHp || 0));
    const finishLowThreatTargetHpMax = Math.max(0, Number(cfg.combatShootFinishLowThreatTargetHpMax || 0));
    const finishLowThreatMaxHpGap = Math.max(0, Number(cfg.combatShootFinishLowThreatMaxHpGap || 0));
    const finishLowThreatRange = Math.max(0, Number(cfg.combatShootFinishLowThreatRange || 0));
    const finishLowThreatFireWindow = !Boolean(options.realBulletPressure)
      && finishLowThreatMinHp > 0
      && finishLowThreatRange > 0
      && Number.isFinite(selfHp)
      && Number.isFinite(targetHp)
      && Number.isFinite(targetDistance)
      && selfHp >= finishLowThreatMinHp
      && targetHp <= finishLowThreatTargetHpMax
      && hpGap <= finishLowThreatMaxHpGap
      && targetDistance <= finishLowThreatRange;
    const passiveRunnerFireWindow = Boolean(options.passiveRunner)
      && !Boolean(options.realBulletPressure)
      && Number.isFinite(selfHp)
      && selfHp >= Math.max(0, Number(cfg.combatPassiveRunnerMinSelfHp || 0));
    const targetPressureFire = options.targetRealBulletPressure !== undefined
      ? Boolean(options.targetRealBulletPressure)
      : Boolean(options.realBulletPressure);
    const opponentProbeMs = Math.max(0, Number(cfg.combatOpponentProbeMs || 0));
    const opponentProbeEngagedMs = Math.max(0, Number(options.opponentProbeEngagedMs || 0));
    const opponentProbeSeenTargetRealBullet = Math.max(0, Number(options.opponentProbeSeenTargetRealBulletMs || 0)) > 0;
    const pressureMinHp = Math.max(0, Number(cfg.combatShootPressureMinHp || 0));
    const pressureRange = Math.max(0, Number(cfg.combatShootPressureRange || 0));
    const pressureMaxHpGap = Math.max(0, Number(cfg.combatShootPressureMaxHpGap || 0));
    const closePressureFireWindow = targetPressureFire
      && pressureMinHp > 0
      && pressureRange > 0
      && Number.isFinite(selfHp)
      && Number.isFinite(targetHp)
      && Number.isFinite(targetDistance)
      && selfHp >= pressureMinHp
      && hpGap <= pressureMaxHpGap
      && targetDistance <= pressureRange;
    const winningPressureMinHp = Math.max(0, Number(cfg.combatShootWinningPressureMinHp || 0));
    const winningPressureTargetHpMax = Math.max(0, Number(cfg.combatShootWinningPressureTargetHpMax || 0));
    const winningPressureLeadHp = Math.max(0, Number(cfg.combatShootWinningPressureLeadHp || 0));
    const winningPressureRange = Math.max(0, Number(cfg.combatShootWinningPressureRange || 0));
    const winningPressureNoDamageMs = Math.max(0, Number(cfg.combatShootWinningPressureNoDamageMs || 0));
    const winningPressureFireWindow = targetPressureFire
      && winningPressureMinHp > 0
      && winningPressureTargetHpMax > 0
      && winningPressureRange > 0
      && Number.isFinite(selfHp)
      && Number.isFinite(targetHp)
      && Number.isFinite(targetDistance)
      && selfHp >= winningPressureMinHp
      && targetHp <= winningPressureTargetHpMax
      && hpGap <= -winningPressureLeadHp
      && noDamageMs >= winningPressureNoDamageMs
      && targetDistance <= winningPressureRange;
    const steadyAimMinHp = Math.max(0, Number(cfg.combatShootSteadyAimMinHp || 0));
    const steadyAimMaxHpGap = Math.max(0, Number(cfg.combatShootSteadyAimMaxHpGap || 0));
    const steadyAimNoDamageMs = Math.max(0, Number(cfg.combatShootSteadyAimNoDamageMs || cfg.combatAimSteadyNoDamageMs || 0));
    const steadyAimFireWindow = Boolean(options.steadyAim)
      && steadyAimMinHp > 0
      && Number.isFinite(selfHp)
      && Number.isFinite(targetHp)
      && selfHp >= steadyAimMinHp
      && hpGap <= steadyAimMaxHpGap
      && noDamageMs >= steadyAimNoDamageMs;
    const noDamageDuelMinHp = Math.max(0, Number(cfg.combatShootNoDamageDuelMinHp || 0));
    const noDamageDuelMaxHpGap = Math.max(0, Number(cfg.combatShootNoDamageDuelMaxHpGap || 0));
    const noDamageDuelNoDamageMs = Math.max(0, Number(cfg.combatShootNoDamageDuelNoDamageMs || 0));
    const noDamageDuelRange = Math.max(0, Number(cfg.combatShootNoDamageDuelRange || cfg.combatAttackRange || 0));
    const farNoDamageCloseMinHp = Math.max(noDamageDuelMinHp, Number(cfg.combatFarNoDamageCloseMinHp || 0));
    const farNoDamageCloseFireWindow = Boolean(options.farNoDamageClose)
      && farNoDamageCloseMinHp > 0
      && Number.isFinite(selfHp)
      && selfHp >= farNoDamageCloseMinHp;
    const noDamageDuelFireWindow = Boolean(options.engagedCombat || options.targetActive || options.targetMoving)
      && noDamageDuelMinHp > 0
      && noDamageDuelNoDamageMs > 0
      && noDamageDuelRange > 0
      && Number.isFinite(selfHp)
      && Number.isFinite(targetHp)
      && Number.isFinite(targetDistance)
      && selfHp >= noDamageDuelMinHp
      && hpGap <= noDamageDuelMaxHpGap
      && noDamageMs >= noDamageDuelNoDamageMs
      && targetDistance <= noDamageDuelRange;
    const opponentProbeFireWindow = Boolean(
      opponentProbeMs > 0
      && opponentProbeEngagedMs < opponentProbeMs
      && Boolean(options.targetActive)
      && !Boolean(options.realBulletPressure)
      && !targetPressureFire
      && !opponentProbeSeenTargetRealBullet
      && !finishLowThreatFireWindow
      && Number.isFinite(selfHp)
      && selfHp >= Math.max(0, Number(cfg.combatLowHpLeaveThreshold || 0))
    );
    let stance = 'normal';
    if (winningPressureFireWindow) stance = 'winning-pressure';
    else if (closePressureFireWindow) stance = 'close-pressure';
    else if (opponentProbeFireWindow) stance = 'opponent-probe';
    else if (passiveRunnerFireWindow) stance = 'passive-runner';
    else if (finishLowThreatFireWindow) stance = 'finish-low-threat';
    else if (steadyAimFireWindow) stance = 'steady-aim';
    else if (noDamageDuelFireWindow) stance = 'no-damage-duel';
    else if (farNoDamageCloseFireWindow) stance = 'far-no-damage-close';
    else if (highHpFireWindow) stance = 'high-hp-pressure';
    else if (Number.isFinite(hpGap) && hpGap > 0) stance = 'guarded';
    return {
      stance,
      selfHp,
      targetHp,
      hpGap,
      targetDistance,
      noDamageMs,
      highHpFireWindow,
      passiveRunnerFireWindow,
      opponentProbeFireWindow,
      opponentProbeEngagedMs,
      finishLowThreatFireWindow,
      closePressureFireWindow,
      winningPressureFireWindow,
      steadyAimFireWindow,
      noDamageDuelFireWindow,
      farNoDamageCloseFireWindow,
      engagedCombat: Boolean(options.engagedCombat),
      targetActive: Boolean(options.targetActive),
      targetMoving: Boolean(options.targetMoving),
      passiveRunner: Boolean(options.passiveRunner),
      opponentProbe: opponentProbeFireWindow,
      realBulletPressure: Boolean(options.realBulletPressure),
      targetRealBulletPressure: targetPressureFire,
      steadyAim: Boolean(options.steadyAim),
      farNoDamageClose: farNoDamageCloseFireWindow
    };
  }

  function combatTickActiveFromState(state = {}) {
    const t = Number.isFinite(Number(state.nowMs)) ? Number(state.nowMs) : Date.now();
    const decision = state.decision || null;
    const recentCombatMs = Math.max(1000, Number(cfg.combatEngageStickMs || 0), Number(cfg.combatEngageGraceMs || 0));
    const combatAt = Number(state.combatTarget?.at || 0);
    if (decision?.combat || decision?.combatCover || /^combat-/.test(String(decision?.reason || ''))) return true;
    if (combatAt && t - combatAt <= recentCombatMs) return true;
    if (state.pendingExit && /^combat-/.test(String(state.pendingExit.reason || state.pendingExit.rootReason || ''))) return true;
    return false;
  }

  function globalSamplingOutageOfflineState(self = null, options = {}) {
    if (!cfg.globalSamplingOutageOfflineEnabled) return null;
    const outage = options.outage || bot.globalState.samplingOutage || null;
    if (!outage?.active) return null;
    const t = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
    const minErrors = Math.max(1, Number(cfg.globalSamplingOutageMinErrors || 1));
    const errorCount = Math.max(0, Number(outage.errorCount || 0));
    if (errorCount < minErrors) return null;
    const firstAt = Number(outage.firstAt || 0) || t;
    const ageMs = Math.max(Number(outage.ageMs || 0), Math.max(0, t - firstAt));
    const minAgeMs = Math.max(0, Number(cfg.globalSamplingOutageMinAgeMs || 0));
    if (ageMs < minAgeMs) return null;
    const combatActive = Boolean(outage.combatActive) || combatTickActiveFromState({
      decision: bot.lastDecision,
      combatTarget: bot.combatTarget,
      pendingExit: bot.pendingExit || bot.pendingCombatLeave,
      nowMs: t
    });
    if (cfg.globalSamplingOutageCombatOnly && !combatActive) return null;
    return {
      active: true,
      reason: 'global sampling outage',
      firstAt,
      lastAt: Number(outage.lastAt || 0) || t,
      ageMs,
      errorCount,
      minErrors,
      minAgeMs,
      combatOnly: Boolean(cfg.globalSamplingOutageCombatOnly),
      combatActive,
      visibilityState: outage.visibilityState || document.visibilityState || '',
      self: self ? summarizeSelf(self) : null,
      error: outage.error || bot.globalState.error || '',
      snapshotError: outage.snapshotError || '',
      minimapError: outage.minimapError || '',
      snapshotTimedOut: Boolean(outage.snapshotTimedOut),
      minimapTimedOut: Boolean(outage.minimapTimedOut),
      snapshotAgeMs: Number.isFinite(Number(outage.snapshotAgeMs)) ? Math.max(0, Math.round(Number(outage.snapshotAgeMs))) : null,
      refreshDurationMs: Number.isFinite(Number(outage.refreshDurationMs)) ? Math.max(0, Math.round(Number(outage.refreshDurationMs))) : null,
      snapshotDurationMs: Number.isFinite(Number(outage.snapshotDurationMs)) ? Math.max(0, Math.round(Number(outage.snapshotDurationMs))) : null,
      minimapDurationMs: Number.isFinite(Number(outage.minimapDurationMs)) ? Math.max(0, Math.round(Number(outage.minimapDurationMs))) : null,
      lastTickDurationMs: Number.isFinite(Number(outage.lastTickDurationMs ?? bot.runtimeDiagnostics?.lastTickDurationMs)) ? Math.max(0, Math.round(Number(outage.lastTickDurationMs ?? bot.runtimeDiagnostics?.lastTickDurationMs))) : null,
      lastTickSource: outage.lastTickSource || bot.runtimeDiagnostics?.lastTickSource || '',
      lastCombatLogBuildMs: Number.isFinite(Number(outage.lastCombatLogBuildMs ?? bot.runtimeDiagnostics?.lastCombatLogBuildMs)) ? Math.max(0, Math.round(Number(outage.lastCombatLogBuildMs ?? bot.runtimeDiagnostics?.lastCombatLogBuildMs))) : null,
      lastCombatLogRecordMs: Number.isFinite(Number(outage.lastCombatLogRecordMs ?? bot.runtimeDiagnostics?.lastCombatLogRecordMs)) ? Math.max(0, Math.round(Number(outage.lastCombatLogRecordMs ?? bot.runtimeDiagnostics?.lastCombatLogRecordMs))) : null
    };
  }

  function combatTickGapOfflineState(self = null, options = {}) {
    if (!cfg.combatTickGapOfflineEnabled) return null;
    const thresholdMs = Math.max(1000, Number(cfg.combatTickGapOfflineMs || 0) || 0);
    if (!(thresholdMs > 0)) return null;
    const t = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
    const previousTickAt = Number(options.previousTickAt ?? bot.previousTickAt ?? 0) || 0;
    const tickGapMs = Number.isFinite(Number(options.tickGapMs ?? bot.lastTickGapMs))
      ? Math.max(0, Math.round(Number(options.tickGapMs ?? bot.lastTickGapMs)))
      : null;
    const tickInProgressMs = Number.isFinite(Number(options.tickInProgressMs))
      ? Math.max(0, Math.round(Number(options.tickInProgressMs)))
      : null;
    const lastTickCompletedGapMs = Number.isFinite(Number(options.lastTickCompletedGapMs))
      ? Math.max(0, Math.round(Number(options.lastTickCompletedGapMs)))
      : null;
    const combatLogActive = Boolean(bot.combatLogging?.active);
    const queuedCombatFrameAt = Number(bot.combatLogging?.lastQueuedFrameAt || 0) || 0;
    const metricCombatFrameAt = Number(bot.lastCombatLogMetric?.at || 0) || 0;
    const lastCombatFrameAt = queuedCombatFrameAt || (combatLogActive ? metricCombatFrameAt : 0);
    const combatFrameGapMs = lastCombatFrameAt ? Math.max(0, Math.round(t - lastCombatFrameAt)) : null;
    const lastBuiltFrameAt = Number(bot.combatLogging?.lastBuiltFrameAt || 0) || 0;
    const builtFrameGapMs = lastBuiltFrameAt ? Math.max(0, Math.round(t - lastBuiltFrameAt)) : null;
    const lastCombatAt = Number(bot.combatLogging?.lastCombatAt || 0) || 0;
    const combatLogGapMs = lastCombatAt ? Math.max(0, Math.round(t - lastCombatAt)) : null;
    const previousCombatActive = Boolean(options.previousCombatActive ?? bot.previousTickCombatActive ?? bot.lastTickCombatActive);
    const currentCombatActive = combatTickActiveFromState({
      decision: bot.lastDecision,
      combatTarget: bot.combatTarget,
      pendingExit: bot.pendingExit || bot.pendingCombatLeave,
      nowMs: t
    });
    const recentCombatContextMs = Math.max(
      thresholdMs,
      Number(cfg.combatEngageStickMs || 0),
      Number(cfg.combatEngageGraceMs || 0),
      Number(cfg.combatLogPostBufferMs || 0)
    );
    const recentCombatFrameContext = Boolean(lastCombatFrameAt
      && recentCombatContextMs > 0
      && t - lastCombatFrameAt <= recentCombatContextMs);
    if (!previousCombatActive && !currentCombatActive && !combatLogActive && !recentCombatFrameContext) return null;
    const liveCombatContext = previousCombatActive || currentCombatActive || combatLogActive;
    const reentryGap = Boolean(options.reentry && (
      (tickInProgressMs !== null && tickInProgressMs >= thresholdMs)
      || (lastTickCompletedGapMs !== null && lastTickCompletedGapMs >= thresholdMs)
    ));
    const mainLoopGap = Boolean(!reentryGap && previousTickAt && tickGapMs !== null && tickGapMs >= thresholdMs);
    const combatFrameGap = !reentryGap && !mainLoopGap && liveCombatContext && combatFrameGapMs !== null && combatFrameGapMs >= thresholdMs;
    if (!reentryGap && !mainLoopGap && !combatFrameGap) return null;
    const diagnosis = reentryGap ? 'tick-reentry-gap'
      : (mainLoopGap ? 'main-loop-gap' : 'combat-log-gap-with-active-tick');
    const likelyCause = reentryGap ? 'main-loop-stuck-or-awaiting-async'
      : (mainLoopGap ? 'js-or-main-loop-paused' : 'combat-state-or-log-gating-gap');
    return {
      active: true,
      reason: 'combat tick gap',
      diagnosis,
      likelyCause,
      thresholdMs,
      tickGapMs,
      tickInProgressMs,
      lastTickCompletedGapMs,
      previousTickAt,
      currentTickAt: t,
      previousTickSource: options.previousTickSource || bot.previousTickSource || '',
      currentTickSource: options.source || bot.lastTickSource || '',
      previousCombatActive,
      currentCombatActive,
      combatLogActive,
      liveCombatContext,
      recentCombatFrameContext,
      recentCombatContextMs,
      queuedCombatFrameAt,
      metricCombatFrameAt,
      lastCombatFrameAt,
      combatFrameGapMs,
      lastBuiltFrameAt,
      builtFrameGapMs,
      lastCombatAt,
      combatLogGapMs,
      self: self ? summarizeSelf(self) : null,
      lastDecisionReason: bot.lastDecision?.reason || '',
      visibilityState: document.visibilityState || ''
    };
  }

  async function handleTickReentryCombatGap(source = 'timer') {
    if (!cfg.combatTickGapOfflineEnabled) return null;
    const thresholdMs = Math.max(1000, Number(cfg.combatTickGapOfflineMs || 0) || 0);
    if (!(thresholdMs > 0)) return null;
    const t = Date.now();
    const tickInProgressMs = bot.lastTickAt ? Math.max(0, Math.round(t - Number(bot.lastTickAt || t))) : null;
    const lastTickCompletedGapMs = bot.lastTickCompletedAt ? Math.max(0, Math.round(t - Number(bot.lastTickCompletedAt || t))) : null;
    if ((tickInProgressMs === null || tickInProgressMs < thresholdMs)
      && (lastTickCompletedGapMs === null || lastTickCompletedGapMs < thresholdMs)) {
      return null;
    }
    const self = getSelf();
    if (!self || !isAlive(self)) return null;
    const combatTickGap = combatTickGapOfflineState(self, {
      source,
      nowMs: t,
      reentry: true,
      tickInProgressMs,
      lastTickCompletedGapMs,
      previousTickAt: bot.lastTickAt || bot.previousTickAt || 0,
      previousTickSource: bot.lastTickSource || bot.previousTickSource || '',
      previousCombatActive: Boolean(bot.previousTickCombatActive || bot.lastTickCombatActive)
    });
    if (!combatTickGap) return null;
    bot.lastCombatTickGap = combatTickGap;
    if (t - Number(bot.lastTickReentryGapAt || 0) < thresholdMs) return combatTickGap;
    bot.lastTickReentryGapAt = t;
    const currentSummary = summarizeSelf(self);
    bot.lastSelf = currentSummary;
    updateSessionStats(currentSummary);
    stopMotionSafely('combat-tick-reentry-gap');
    if (!bot.offlineSince) bot.offlineSince = t;
    const offlineAgeMs = Math.max(0, Date.now() - Number(bot.offlineSince || Date.now()));
    const offlineSafety = {
      ...assessOfflineSafety(self),
      combatTickGap
    };
    bot.lastOfflineSafety = offlineSafety;
    const leaveResult = !cfg.dryRun && !cfg.once
      ? await leaveOffline('combat tick gap', currentSummary, offlineSafety)
      : null;
    const offlineDetail = activeOfflineLeaveDetail();
    bot.lastDecision = {
      kind: 'wait',
      reason: leaveResult?.attempted && !leaveResult?.error ? 'offline-leave' : 'control-combat-tick-gap',
      control: summarizeControl(),
      self: currentSummary,
      offlineAgeMs,
      leaveDelayMs: 0,
      offlineSafety,
      combatTickGap,
      displayReason: currentOfflineDisplayReasonForCombatStateCore('combat tick gap', offlineSafety, leaveResult, offlineDetail, '战斗主循环断档，正在退出', { offlineLeaveSummary }),
      leave: leaveResult,
      tickReentry: true
    };
    updateBotPanel(bot.lastDecision);
    if (!leaveResult?.attempted && offlineAgeMs > cfg.reloadAfterOfflineMs) {
      requestReload('combat tick gap too long');
    }
    return combatTickGap;
  }

  function nativeTickMinIntervalMs(state = {}) {
    const normalMs = Math.max(1, Number(cfg.nativeTickMinMs || cfg.tickMs || 120));
    const combatMs = Math.max(1, Number(cfg.combatNativeTickMinMs || normalMs));
    return combatTickActiveFromState(state) ? Math.min(normalMs, combatMs) : normalMs;
  }



  function combatShootingPlan(self, options = {}) {
    const stamina5s = staminaRemaining(self, '5s');
    const normalEveryMs = Math.max(1, Number(cfg.combatShootEveryMs || cfg.shootEveryMs || 120));
    const conserveEveryMs = Math.max(normalEveryMs, Number(cfg.combatShootConserveEveryMs || normalEveryMs));
    const recoveryEveryMs = Math.max(conserveEveryMs, Number(cfg.combatShootRecoveryEveryMs || conserveEveryMs));
    const hardReserveMs = Math.max(staminaExhaustedThreshold(), Number(cfg.combatShootHardReserveMs || staminaExhaustedThreshold()));
    const dodgeReserveMs = Math.max(hardReserveMs, Number(cfg.combatShootDodgeReserveMs || hardReserveMs));
    const highHpDodgeReserveMs = Math.max(hardReserveMs, Number(cfg.combatShootHighHpDodgeReserveMs || dodgeReserveMs));
    const finishLowThreatDodgeReserveMs = Math.max(hardReserveMs, Number(cfg.combatShootFinishLowThreatDodgeReserveMs || hardReserveMs));
    const passiveRunnerDodgeReserveMs = Math.max(hardReserveMs, Number(cfg.combatShootPassiveRunnerDodgeReserveMs || highHpDodgeReserveMs));
    const pressureDodgeReserveMs = Math.max(hardReserveMs, Number(cfg.combatShootPressureDodgeReserveMs || highHpDodgeReserveMs));
    const winningPressureDodgeReserveMs = Math.max(hardReserveMs, Number(cfg.combatShootWinningPressureDodgeReserveMs || pressureDodgeReserveMs));
    const steadyAimDodgeReserveMs = Math.max(hardReserveMs, Number(cfg.combatShootSteadyAimDodgeReserveMs || highHpDodgeReserveMs));
    const noDamageDuelDodgeReserveMs = Math.max(hardReserveMs, Number(cfg.combatShootNoDamageDuelDodgeReserveMs || highHpDodgeReserveMs));
    const reserveMs = Math.max(dodgeReserveMs, Number(cfg.combatShootReserveMs || dodgeReserveMs));
    const trend = options.trend && typeof options.trend === 'object'
      ? options.trend
      : combatTrendState(self, options);
    const noDamageMs = Math.max(0, Number(trend.noDamageMs || 0));
    const highHpFireWindow = Boolean(trend.highHpFireWindow);
    const passiveRunnerFireWindow = Boolean(trend.passiveRunnerFireWindow);
    const opponentProbeFireWindow = Boolean(trend.opponentProbeFireWindow);
    const finishLowThreatFireWindow = Boolean(trend.finishLowThreatFireWindow);
    const closePressureFireWindow = Boolean(trend.closePressureFireWindow);
	    const winningPressureFireWindow = Boolean(trend.winningPressureFireWindow);
	    const steadyAimFireWindow = Boolean(trend.steadyAimFireWindow);
	    const noDamageDuelFireWindow = Boolean(trend.noDamageDuelFireWindow);
	    const farNoDamageCloseFireWindow = Boolean(trend.farNoDamageCloseFireWindow);
	    const aimConfidence = Number.isFinite(Number(options.aimConfidence))
	      ? Math.max(0, Math.min(1, Number(options.aimConfidence)))
	      : null;
	    const lowConfidenceThreshold = Math.max(0, Math.min(1, Number(cfg.combatAimLowConfidenceThreshold || 0)));
	    const lowConfidenceMinDistance = Math.max(0, Number(cfg.combatAimLowConfidenceMinDistance || 0));
	    const lowConfidenceMotionScale = Math.max(0, Number(cfg.combatAimLowConfidenceMotionScale || 0));
	    const lowConfidenceEveryMs = Math.max(conserveEveryMs, Number(cfg.combatAimLowConfidenceEveryMs || conserveEveryMs));
    const opponentProbeReserveMs = Math.max(
      dodgeReserveMs,
      Number(cfg.combatOpponentProbeReserveMs || reserveMs)
    );
    const opponentProbeEveryMs = Math.max(
      normalEveryMs,
      Number(cfg.combatOpponentProbeEveryMs || lowConfidenceEveryMs)
    );
	    const lowConfidenceWindow = Boolean(
	      aimConfidence !== null
	      && lowConfidenceThreshold > 0
	      && aimConfidence < lowConfidenceThreshold
	      && Number(options.targetDistance || 0) >= lowConfidenceMinDistance
	      && (options.targetMoving || Number(options.motionScale || 0) >= lowConfidenceMotionScale)
	      && !closePressureFireWindow
	      && !steadyAimFireWindow
	    );
    let effectiveDodgeReserveMs = dodgeReserveMs;
    if (opponentProbeFireWindow) {
      effectiveDodgeReserveMs = Math.max(effectiveDodgeReserveMs, opponentProbeReserveMs);
    } else {
      if (highHpFireWindow) effectiveDodgeReserveMs = Math.min(effectiveDodgeReserveMs, highHpDodgeReserveMs);
      if (passiveRunnerFireWindow) effectiveDodgeReserveMs = Math.min(effectiveDodgeReserveMs, passiveRunnerDodgeReserveMs);
    }
    if (finishLowThreatFireWindow) effectiveDodgeReserveMs = Math.min(effectiveDodgeReserveMs, finishLowThreatDodgeReserveMs);
    if (closePressureFireWindow) effectiveDodgeReserveMs = Math.min(effectiveDodgeReserveMs, pressureDodgeReserveMs);
    if (winningPressureFireWindow) effectiveDodgeReserveMs = Math.min(effectiveDodgeReserveMs, winningPressureDodgeReserveMs);
    if (steadyAimFireWindow) effectiveDodgeReserveMs = Math.min(effectiveDodgeReserveMs, steadyAimDodgeReserveMs);
    if (noDamageDuelFireWindow) effectiveDodgeReserveMs = Math.min(effectiveDodgeReserveMs, noDamageDuelDodgeReserveMs);
    const needsMovement = Boolean(options.needsMovement || options.dodging || options.realBulletPressure || options.pressureClose);
    const base = {
      shoot: true,
      forceShoot: false,
      shootEveryMs: normalEveryMs,
      reason: 'normal',
      stamina5s,
      reserveMs,
      dodgeReserveMs: effectiveDodgeReserveMs,
      standardDodgeReserveMs: dodgeReserveMs,
      highHpDodgeReserveMs,
      passiveRunnerDodgeReserveMs,
      finishLowThreatDodgeReserveMs,
      pressureDodgeReserveMs,
      winningPressureDodgeReserveMs,
      steadyAimDodgeReserveMs,
      noDamageDuelDodgeReserveMs,
      hardReserveMs,
      needsMovement,
      highHpFireWindow,
      passiveRunnerFireWindow,
      finishLowThreatFireWindow,
      closePressureFireWindow,
      winningPressureFireWindow,
      steadyAimFireWindow,
	      noDamageDuelFireWindow,
	      farNoDamageCloseFireWindow,
      opponentProbeFireWindow,
      opponentProbeReserveMs,
      opponentProbeEveryMs,
	      aimConfidence,
	      lowConfidenceWindow,
	      noDamageMs,
      trend: {
        stance: trend.stance || 'normal',
        hpGap: Number.isFinite(Number(trend.hpGap)) ? Number(trend.hpGap) : null,
        targetDistance: Number.isFinite(Number(trend.targetDistance)) ? Math.round(Number(trend.targetDistance)) : null,
        noDamageMs: Math.round(noDamageMs),
        engagedCombat: Boolean(trend.engagedCombat),
        targetActive: Boolean(trend.targetActive),
        targetMoving: Boolean(trend.targetMoving),
        passiveRunner: Boolean(trend.passiveRunner),
        opponentProbe: Boolean(trend.opponentProbeFireWindow),
        opponentProbeEngagedMs: Math.round(Math.max(0, Number(trend.opponentProbeEngagedMs || 0))),
        realBulletPressure: Boolean(trend.realBulletPressure),
        steadyAim: Boolean(trend.steadyAim),
        farNoDamageClose: Boolean(trend.farNoDamageCloseFireWindow)
      },
      suppressed: false,
      throttled: false
    };
    if (stamina5s !== null && stamina5s < hardReserveMs) {
      return { ...base, shoot: false, shootEveryMs: recoveryEveryMs, reason: 'stamina-rebuild', suppressed: true };
    }
    if (stamina5s !== null && opponentProbeFireWindow && stamina5s < effectiveDodgeReserveMs) {
      return { ...base, shoot: false, shootEveryMs: recoveryEveryMs, reason: 'reserve-for-dodge', suppressed: true };
    }
    if (stamina5s !== null && needsMovement && stamina5s < effectiveDodgeReserveMs) {
      return { ...base, shoot: false, shootEveryMs: recoveryEveryMs, reason: 'reserve-for-dodge', suppressed: true };
    }
	    if (stamina5s !== null && stamina5s < reserveMs) {
	      return { ...base, shootEveryMs: conserveEveryMs, reason: 'burst-fire', throttled: true };
	    }
    if (opponentProbeFireWindow) {
      return { ...base, shootEveryMs: opponentProbeEveryMs, reason: 'opponent-probe', throttled: true };
    }
	    if (lowConfidenceWindow) {
	      return { ...base, shootEveryMs: lowConfidenceEveryMs, reason: 'low-confidence-burst', throttled: true };
	    }
	    return base;
	  }

  function combatAimNoDamageLevel(widenMs) {
    const stepMs = Math.max(1, Number(cfg.combatAimNoDamageStepMs) || 800);
    const elapsed = Math.max(0, Number(widenMs) || 0);
    return elapsed > 0 ? Math.min(3, 1 + elapsed / stepMs) : 0;
  }

  function combatAimNoDamageJitterLimit(baseLimit, noDamageLevel) {
    const base = Math.max(0, Number(baseLimit) || 0);
    const level = Math.max(0, Number(noDamageLevel) || 0);
    const maxNoDamageLimit = Math.max(base, Number(cfg.combatAimNoDamageMaxRadians) || base);
    return level ? Math.min(maxNoDamageLimit, base * (1 + level * 0.45)) : base;
  }
  function combatAimSteadyNoDamageState(target, noDamageMs, motionScale = 0) {
    const thresholdMs = Math.max(0, Number(cfg.combatAimSteadyNoDamageMs || 0));
    const elapsed = Math.max(0, Number(noDamageMs) || 0);
    const speedMax = Math.max(0, Number(cfg.combatAimSteadySpeedMax ?? cfg.combatStationarySpeed ?? 0));
    const currentSpeed = speed(target);
    const active = Boolean(thresholdMs && elapsed >= thresholdMs && currentSpeed <= speedMax);
    return {
      active,
      noDamageMs: elapsed,
      thresholdMs,
      currentSpeed,
      speedMax,
      motionScale: Number.isFinite(Number(motionScale)) ? Number(motionScale) : 0
    };
  }

  function combatAimFallbackPrecisionState(noDamageMs) {
    const thresholdMs = Math.max(0, Number(cfg.combatAimFallbackPrecisionNoDamageMs || 0));
    const elapsed = Math.max(0, Number(noDamageMs) || 0);
    return {
      active: Boolean(thresholdMs && elapsed >= thresholdMs),
      noDamageMs: elapsed,
      thresholdMs
    };
  }

  function combatMovementAimMode(self, target, distance) {
    const vx = Number(target.vx) || 0;
    const vy = Number(target.vy) || 0;
    const targetSpeed = Math.hypot(vx, vy);
    const dx = Number(target.x) - Number(self.x);
    const dy = Number(target.y) - Number(self.y);
    const d = Math.max(1, Number(distance) || Math.hypot(dx, dy) || 1);
    const ux = dx / d;
    const uy = dy / d;
    const radialSpeed = ux * vx + uy * vy;
    const lateralSpeed = ux * vy - uy * vx;
    const lateralRatio = targetSpeed > 0.01 ? Math.abs(lateralSpeed) / targetSpeed : 0;
    let mode = 'drift';
    let leadScale = 0.75;
    if (lateralRatio >= 0.55) {
      mode = 'lateral';
      leadScale = 1.1;
    } else if (radialSpeed <= -cfg.combatStationarySpeed) {
      mode = 'closing';
      leadScale = 0.5;
    } else if (radialSpeed >= cfg.combatStationarySpeed) {
      mode = 'retreating';
      leadScale = 0.6;
    }
    if (target.current_join_mode === 'Active') leadScale += 0.15;
    if (isFiringEntity(target)) leadScale += 0.1;
    return {
      mode,
      leadScale,
      lateralSpeed,
      radialSpeed,
      lateralRatio,
      targetSpeed
    };
  }

  function combatInterceptSolution(self, target, distance = null, motionScale = 1) {
    const sx = Number(self?.x);
    const sy = Number(self?.y);
    const px = Number(target?.x);
    const py = Number(target?.y);
    const vx = Number(target?.vx) || 0;
    const vy = Number(target?.vy) || 0;
    if (![sx, sy, px, py].every(Number.isFinite)) return null;
    const bulletSpeed = Math.max(1, Number(cfg.combatBulletSpeedPerTick || 500));
    const renderDelayTicks = Math.max(0, Number(cfg.combatRenderDelayTicks ?? 2));
    const compensatedX = px + vx * renderDelayTicks;
    const compensatedY = py + vy * renderDelayTicks;
    const dx = compensatedX - sx;
    const dy = compensatedY - sy;
    const c = dx * dx + dy * dy;
    if (!(c > 0)) return null;
    const targetSpeedSq = vx * vx + vy * vy;
    const a = targetSpeedSq - bulletSpeed * bulletSpeed;
    const b = 2 * (dx * vx + dy * vy);
    const eps = 1e-6;
    const roots = [];
    if (Math.abs(a) < eps) {
      if (Math.abs(b) > eps) roots.push(-c / b);
    } else {
      const disc = b * b - 4 * a * c;
      if (disc < -eps) return null;
      const sqrtDisc = Math.sqrt(Math.max(0, disc));
      roots.push((-b - sqrtDisc) / (2 * a), (-b + sqrtDisc) / (2 * a));
    }
    const maxByRange = Math.max(1, Number(cfg.combatBulletRangeCm || cfg.combatAttackRange || 15000) / bulletSpeed);
    const configuredMax = Number(cfg.combatInterceptMaxTicks || 0);
    const maxTicks = Math.max(1, configuredMax > 0 ? Math.min(configuredMax, maxByRange) : maxByRange);
    const t = roots
      .filter(value => Number.isFinite(value) && value > 0 && value <= maxTicks)
      .sort((aTick, bTick) => aTick - bTick)[0];
    if (!Number.isFinite(t)) return null;
    const x = compensatedX + vx * t;
    const y = compensatedY + vy * t;
    const travelDistance = Math.hypot(x - sx, y - sy);
    const bulletRange = Math.max(1, Number(cfg.combatBulletRangeCm || cfg.combatAttackRange || 15000));
    if (travelDistance > bulletRange + Math.max(0, Number(cfg.combatBulletHitRadiusCm || 90))) return null;
    const rawDistance = Number.isFinite(Number(distance)) ? Math.max(1, Number(distance)) : Math.hypot(px - sx, py - sy);
    const targetSpeed = Math.sqrt(targetSpeedSq);
    const maxTargetSpeed = Math.max(1, Number(cfg.combatTargetDodgeSpeedPerTick || 50));
    const speedRatio = targetSpeed / maxTargetSpeed;
    const timeFactor = 1 - Math.min(1, t / maxTicks) * 0.35;
    const speedPenalty = Math.max(0, speedRatio - 1) * 0.2;
    const motionPenalty = Math.max(0, Math.min(1, Number(motionScale) || 0)) * 0.08;
    const confidence = Math.max(0.25, Math.min(1, 0.62 + timeFactor * 0.25 - speedPenalty - motionPenalty));
    return {
      x,
      y,
      flightTicks: t,
      flightMs: t * 50,
      travelDistance,
      currentDistance: rawDistance,
      leadDistance: Math.hypot(x - px, y - py),
      renderDelayTicks,
      compensatedX,
      compensatedY,
      targetVx: vx,
      targetVy: vy,
      targetSpeed,
      confidence
    };
  }

  function combatLiveAimTarget(self, target) {
    const targetId = combatTargetId(target);
    const targetName = String(target?.name || '').trim();
    let live = null;
    try {
      const nativeEntities = Array.isArray(bot.testNativeEntities)
        ? bot.testNativeEntities
        : (typeof getNativeEntityList === 'function' ? getNativeEntityList() : []);
      if (Array.isArray(nativeEntities) && nativeEntities.length) {
        live = nativeEntities.find(entity => {
          const id = combatTargetId(entity);
          return targetId && id && String(id) === targetId;
        }) || null;
        if (!live && targetName) live = nativeEntities.find(entity => String(entity?.name || '').trim() === targetName) || null;
      }
    } catch (_) {
      live = null;
    }
    if (!live || !isAlive(live) || isInvulnerable(live)) return target;
    const x = Number(live.x);
    const y = Number(live.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return target;
    return {
      ...target,
      ...live,
      user_id: live.user_id ?? live.id ?? target.user_id ?? target.id,
      id: live.user_id ?? live.id ?? target.id ?? target.user_id,
      hp: combatHpValue(live),
      knownHp: knownHpValue(live),
      drop: dropValue(live) || target.drop,
      distance: dist(self, live),
      speed: speed(live),
      combatIntent: target.combatIntent || live.combatIntent || '',
      nativeAimResolved: true,
      originalAimTarget: target
    };
  }
  function combatAimSourceDivergenceState(aimSource, distance) {
    const original = aimSource?.originalAimTarget;
    const live = Boolean(aimSource?.nativeAimResolved);
    const ax = Number(aimSource?.x);
    const ay = Number(aimSource?.y);
    const ox = Number(original?.x);
    const oy = Number(original?.y);
    const divergence = live
      && Number.isFinite(ax)
      && Number.isFinite(ay)
      && Number.isFinite(ox)
      && Number.isFinite(oy)
      ? Math.hypot(ax - ox, ay - oy)
      : null;
    const baseThreshold = Math.max(0, Number(cfg.combatAimLiveDivergencePrecisionCm || 0));
    const ratio = Math.max(0, Number(cfg.combatAimLiveDivergencePrecisionRatio || 0));
    const ratioThreshold = Number.isFinite(Number(distance)) ? Math.round(Math.max(0, Number(distance)) * ratio) : 0;
    const threshold = Math.max(baseThreshold, ratioThreshold);
    return {
      active: Boolean(live && divergence !== null && threshold > 0 && divergence >= threshold),
      divergenceCm: divergence !== null ? Math.round(divergence) : null,
      thresholdCm: Math.round(threshold),
      baseThresholdCm: Math.round(baseThreshold),
      ratioThresholdCm: Math.round(ratioThreshold)
    };
  }

  function combatAimServerStallState() {
    const stall = typeof summarizeServerPositionStall === 'function'
      ? summarizeServerPositionStall()
      : bot.serverPositionStall;
    return stall && typeof stall === 'object' ? stall : {};
  }

  function combatAimDynamicStrategyState(self, target, aimSource, damage, moving, distance, movement, steadyAim, options = {}) {
    const fallbackPrecision = combatAimFallbackPrecisionState(damage?.noDamageMs);
    const sourceDivergence = combatAimSourceDivergenceState(aimSource, distance);
    const serverStall = combatAimServerStallState();
    const live = Boolean(aimSource?.nativeAimResolved);
    const attackRange = Math.max(0, Number(cfg.combatAttackRange || cfg.attackRange || 0));
    const radialMax = Math.max(0, Number(cfg.combatAimRadialPrecisionLateralRatio || 0));
    const realBulletPrecision = Boolean(live
      && moving
      && options.realBulletPressure
      && (!attackRange || Number(distance) <= attackRange));
    const lateralRatio = Math.abs(Number(movement?.lateralRatio || 0));
    const passiveRunnerIntercept = Boolean(live
      && moving
      && movement
      && options.passiveRunner
      && (!attackRange || Number(distance) <= attackRange));
    const liveIntercept = Boolean(live
      && moving
      && movement
      && (
        passiveRunnerIntercept
        || (lateralRatio > radialMax && (
          realBulletPrecision
          || (serverStall.stalled && (!attackRange || Number(distance) <= attackRange))
        ))
      ));
    const radialPrecision = Boolean(live
      && moving
      && radialMax > 0
      && movement
      && Number(movement.targetSpeed || 0) >= Number(cfg.combatStationarySpeed || 0)
      && lateralRatio <= radialMax
      && (!attackRange || Number(distance) <= attackRange));
    let mode = moving ? 'intercept' : 'exact';
    let strategy = moving ? 'intercept' : 'exact';
    let reason = moving ? (movement?.mode || 'moving') : 'stationary';
    let precision = false;
    let steady = false;
    let passiveRunnerAim = false;
    if (sourceDivergence.active) {
      mode = 'live-precision';
      strategy = 'live-precision';
      reason = 'coordinate-divergence';
      precision = true;
    } else if (passiveRunnerIntercept) {
      strategy = 'live-intercept';
      reason = 'passive-runner-intercept';
      passiveRunnerAim = true;
    } else if (realBulletPrecision && liveIntercept) {
      strategy = 'live-intercept';
      reason = 'real-bullet-pressure-intercept';
    } else if (realBulletPrecision) {
      mode = 'live-precision';
      strategy = 'live-precision';
      reason = 'real-bullet-pressure';
      precision = true;
    } else if (live && serverStall.stalled && liveIntercept) {
      strategy = 'live-intercept';
      reason = 'server-stall-live-intercept';
    } else if (live && serverStall.stalled) {
      mode = 'live-precision';
      strategy = 'live-precision';
      reason = 'server-stall-live';
      precision = true;
    } else if (radialPrecision) {
      mode = 'live-precision';
      strategy = 'live-precision';
      reason = 'radial-motion';
      precision = true;
    } else if (fallbackPrecision.active) {
      mode = 'precision';
      strategy = 'fallback-precision';
      reason = 'no-damage-fallback';
      precision = true;
    } else if (steadyAim?.active && moving) {
      mode = 'steady';
      strategy = 'steady';
      reason = 'steady-no-damage';
      steady = true;
    }
    return {
      mode,
      strategy,
      reason,
      precision,
      steady,
      bypassJitter: Boolean(!moving || precision || steady),
      sourceDivergence,
      serverStall: Boolean(serverStall.stalled),
      liveIntercept,
      realBulletPrecision,
      radialPrecision,
      fallbackPrecision: Boolean(fallbackPrecision.active),
      passiveRunner: Boolean(passiveRunnerAim),
      movementMode: precision ? strategy : (steady ? 'steady' : (movement?.mode || ''))
    };
  }

  function combatAimTarget(self, target, options = {}) {
    const nativeAimSource = combatLiveAimTarget(self, target);
    const preliminaryDamage = combatAimDamageState(nativeAimSource);
    const aimSource = nativeAimSource;
	    const motionScale = combatAimMotionScale(aimSource);
	    const moving = speed(aimSource) >= cfg.combatStationarySpeed
	      || motionScale >= Math.max(0, Number(cfg.combatAimMovingScaleThreshold || 0.15));
	    const targetDistance = Number(aimSource.distance);
	    const distance = Number.isFinite(targetDistance) ? targetDistance : dist(self, aimSource);
    const opponentProfile = combatOpponentProfile(self, aimSource, distance);
	    const damage = preliminaryDamage;
    const steadyAim = combatAimSteadyNoDamageState(aimSource, damage.noDamageMs, motionScale);
    const movement = moving
      ? combatMovementAimMode(self, aimSource, distance)
      : { mode: '', targetSpeed: 0, lateralRatio: 0, lateralSpeed: 0, radialSpeed: 0 };
    const aimStrategy = combatAimDynamicStrategyState(self, target, aimSource, damage, moving, distance, movement, steadyAim, {
      realBulletPressure: Boolean(options.realBulletPressure),
      passiveRunner: Boolean(options.passiveRunner)
    });
    const exact = {
      x: Number(aimSource.x),
      y: Number(aimSource.y),
      mode: aimStrategy.mode,
      moving,
      distance,
      motionScale,
      movementMode: aimStrategy.movementMode,
      jitterLimit: 0,
      noDamageMs: damage.noDamageMs,
      noDamageWidened: false,
      precisionAim: Boolean(aimStrategy.precision),
      steadyAim: Boolean(aimStrategy.steady),
      lockedAim: false,
      liveAim: Boolean(aimSource.nativeAimResolved),
      liveDistance: aimSource.nativeAimResolved ? Math.round(distance) : null,
      aimStrategy: aimStrategy.strategy,
      aimStrategyReason: aimStrategy.reason,
      sourceDivergenceCm: aimStrategy.sourceDivergence.divergenceCm,
      sourceDivergenceThresholdCm: aimStrategy.sourceDivergence.thresholdCm,
      serverStallAim: Boolean(aimStrategy.serverStall),
      realBulletPrecisionAim: Boolean(aimStrategy.realBulletPrecision),
      radialPrecisionAim: Boolean(aimStrategy.radialPrecision),
      fallbackPrecisionAim: Boolean(aimStrategy.fallbackPrecision),
      passiveRunnerAim: Boolean(aimStrategy.passiveRunner),
      aimConfidence: aimStrategy.bypassJitter ? 1 : null,
      opponentProfile,
    };
    if (aimStrategy.bypassJitter) return exact;
    const dx = Number(aimSource.x) - Number(self.x);
    const dy = Number(aimSource.y) - Number(self.y);
    const baseLimit = combatAimJitterLimit(distance, motionScale);
    const stepMs = Math.max(1, Number(cfg.combatAimNoDamageStepMs) || 800);
    const noDamageLevel = combatAimNoDamageLevel(damage.widenMs);
    const jitterLimit = combatAimNoDamageJitterLimit(baseLimit, noDamageLevel);
    const targetId = combatTargetId(aimSource);
    const previousAim = bot.combatAim;
    let sign = Math.sign(movement.lateralSpeed || 0);
    if (!sign && previousAim && String(previousAim.targetId || '') === targetId) sign = Math.sign(Number(previousAim.sign || 0));
    if (!sign) sign = Math.random() < 0.5 ? -1 : 1;
    const noDamageBucket = noDamageLevel ? Math.floor(damage.widenMs / stepMs) + 1 : 0;
    const motionBucket = Math.round(motionScale * 10);
    const intercept = combatInterceptSolution(self, aimSource, distance, motionScale);
    const lockCompatible = previousAim
      && String(previousAim.targetId || '') === targetId
      && String(previousAim.movementMode || '') === movement.mode
      && String(previousAim.strategy || '') === String(aimStrategy.strategy || '')
      && Boolean(previousAim.passiveRunner) === Boolean(aimStrategy.passiveRunner)
      && Number(previousAim.noDamageBucket || 0) === noDamageBucket
      && Number(previousAim.motionBucket ?? motionBucket) === motionBucket
      && now() < Number(previousAim.until || 0);
    if (intercept) {
      const interceptStrategyReason = aimStrategy.passiveRunner
        ? (aimStrategy.reason || 'passive-runner-intercept')
        : (aimStrategy.liveIntercept
        ? (aimStrategy.reason || 'live-intercept')
        : 'quadratic-intercept');
      const interceptConfidence = clamp(Number(intercept.confidence || 0) * Number(opponentProfile.aimConfidenceScale || 1), 0.1, 1);
      let spreadAngle = 0;
      const locked = lockCompatible && Number.isFinite(Number(previousAim.spreadAngle));
      if (locked) {
        spreadAngle = Number(previousAim.spreadAngle);
        sign = Math.sign(Number(previousAim.sign || sign)) || sign;
      } else {
        const spreadScale = Math.max(0, Number(cfg.combatInterceptSpreadScale ?? 0.18))
          * (aimStrategy.passiveRunner
            ? Math.max(0, Number(cfg.combatPassiveRunnerInterceptSpreadScale ?? 0))
            : (aimStrategy.liveIntercept ? 0.35 : 1));
        const uncertainty = 1 - Math.max(0, Math.min(1, interceptConfidence));
        const randomLimit = jitterLimit * spreadScale * (0.35 + uncertainty) * (noDamageLevel ? 1.35 : 1);
        spreadAngle = (Math.random() * 2 - 1) * randomLimit;
        bot.combatAim = {
          targetId,
          angle: spreadAngle,
          spreadAngle,
          sign,
          movementMode: movement.mode,
          strategy: aimStrategy.strategy,
          passiveRunner: Boolean(aimStrategy.passiveRunner),
          noDamageBucket,
          motionBucket,
          intercept: true,
          until: now() + Math.max(80, Number(cfg.combatAimLockMs) || 450)
        };
      }
      const interceptDx = Number(intercept.x) - Number(self.x);
      const interceptDy = Number(intercept.y) - Number(self.y);
      const cos = Math.cos(spreadAngle);
      const sin = Math.sin(spreadAngle);
      const currentAngle = Math.atan2(dy, dx);
      const predictedAngle = Math.atan2(interceptDy, interceptDx);
      let relativeAngle = predictedAngle - currentAngle + spreadAngle;
      while (relativeAngle > Math.PI) relativeAngle -= Math.PI * 2;
      while (relativeAngle < -Math.PI) relativeAngle += Math.PI * 2;
      return {
        x: Number(self.x) + interceptDx * cos - interceptDy * sin,
        y: Number(self.y) + interceptDx * sin + interceptDy * cos,
        mode: 'intercept',
        moving,
        angle: relativeAngle,
        jitterLimit,
        distance,
        motionScale,
        movementMode: movement.mode,
        radialSpeed: movement.radialSpeed,
        lateralSpeed: movement.lateralSpeed,
        noDamageMs: damage.noDamageMs,
        noDamageWidened: Boolean(noDamageLevel),
        precisionAim: false,
        steadyAim: false,
        lockedAim: Boolean(locked),
        liveAim: Boolean(aimSource.nativeAimResolved),
        liveDistance: aimSource.nativeAimResolved ? Math.round(distance) : null,
        aimStrategy: aimStrategy.strategy,
        aimStrategyReason: interceptStrategyReason,
        sourceDivergenceCm: aimStrategy.sourceDivergence.divergenceCm,
        sourceDivergenceThresholdCm: aimStrategy.sourceDivergence.thresholdCm,
        serverStallAim: Boolean(aimStrategy.serverStall),
        liveInterceptAim: Boolean(aimStrategy.liveIntercept),
        realBulletPrecisionAim: Boolean(aimStrategy.realBulletPrecision),
        radialPrecisionAim: Boolean(aimStrategy.radialPrecision),
        fallbackPrecisionAim: Boolean(aimStrategy.fallbackPrecision),
        passiveRunnerAim: Boolean(aimStrategy.passiveRunner),
        interceptAim: true,
        interceptFlightTicks: intercept.flightTicks,
        interceptFlightMs: intercept.flightMs,
        interceptLeadDistance: intercept.leadDistance,
	        interceptConfidence,
	        aimConfidence: interceptConfidence,
	        opponentProfile
	      };
	    }
    let angle = 0;
    const locked = lockCompatible && Number.isFinite(Number(previousAim.angle));
    if (locked) {
      angle = Number(previousAim.angle);
      sign = Math.sign(Number(previousAim.sign || sign)) || sign;
    } else {
      const aimScale = clamp(Math.max(0.2, motionScale), 0.2, 1);
      const spreadScale = clamp(Math.max(0.35, motionScale), 0.35, 1);
      const minLead = Math.min(jitterLimit, Math.max(0, Number(cfg.combatAimLeadMinRadians) || 0) * aimScale);
      const lead = Math.min(jitterLimit, Math.max(minLead, jitterLimit * movement.leadScale * aimScale));
      const randomSpread = jitterLimit * (noDamageLevel ? 0.35 : 0.22) * spreadScale;
      angle = sign * lead + (Math.random() * 2 - 1) * randomSpread;
      if (Math.abs(angle) < minLead && minLead > 0) angle = sign * minLead;
      angle = clamp(angle, -jitterLimit, jitterLimit);
      bot.combatAim = {
        targetId,
        angle,
        sign,
        movementMode: movement.mode,
        strategy: aimStrategy.strategy,
        passiveRunner: Boolean(aimStrategy.passiveRunner),
        noDamageBucket,
        motionBucket,
        intercept: false,
        until: now() + Math.max(80, Number(cfg.combatAimLockMs) || 450)
      };
    }
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      x: Number(self.x) + dx * cos - dy * sin,
      y: Number(self.y) + dx * sin + dy * cos,
      mode: 'jitter',
      moving,
      angle,
      jitterLimit,
      distance,
      motionScale,
      movementMode: movement.mode,
      radialSpeed: movement.radialSpeed,
      lateralSpeed: movement.lateralSpeed,
      noDamageMs: damage.noDamageMs,
      noDamageWidened: Boolean(noDamageLevel),
      precisionAim: false,
      steadyAim: false,
      lockedAim: Boolean(locked),
      liveAim: Boolean(aimSource.nativeAimResolved),
      liveDistance: aimSource.nativeAimResolved ? Math.round(distance) : null,
      aimStrategy: aimStrategy.strategy,
      aimStrategyReason: aimStrategy.liveIntercept
        ? (aimStrategy.reason || 'live-intercept')
        : (aimStrategy.passiveRunner ? (aimStrategy.reason || 'passive-runner-intercept') : 'intercept-fallback'),
      sourceDivergenceCm: aimStrategy.sourceDivergence.divergenceCm,
      sourceDivergenceThresholdCm: aimStrategy.sourceDivergence.thresholdCm,
      serverStallAim: Boolean(aimStrategy.serverStall),
      liveInterceptAim: Boolean(aimStrategy.liveIntercept),
      realBulletPrecisionAim: Boolean(aimStrategy.realBulletPrecision),
      radialPrecisionAim: Boolean(aimStrategy.radialPrecision),
      fallbackPrecisionAim: Boolean(aimStrategy.fallbackPrecision),
      passiveRunnerAim: Boolean(aimStrategy.passiveRunner),
      interceptAim: false,
	      aimConfidence: Math.max(0.2, Math.min(0.7, Number(opponentProfile.aimConfidenceScale || 1) * (1 - Math.min(0.65, motionScale * 0.35)))),
	      opponentProfile
	    };
	  }



  function combatLeaveCoverAction(self, target, bullets, targetDistance = null) {
    const distance = Number.isFinite(Number(targetDistance)) ? Number(targetDistance) : dist(self, target);
    const selfHp = hpValue(self);
    const targetHp = combatHpValue(target);
    const pressure = combatPressureThreat(self, target, bullets);
    const strafe = tangentMoveForBullet(self, target, pressure, { preferClosing: false });
    const dodging = Boolean(pressure || strafe.active);
    const spacing = combatSpacingVector(self, target, distance);
    const realBulletPressure = Boolean(pressure && !pressure.synthetic);
    const spacingOverride = realBulletPressure && combatSpacingShouldOverrideBullet(spacing, selfHp, targetHp);
    let combatMove = dodging
      ? mergeCombatMove(strafe, spacing, !realBulletPressure || spacingOverride)
      : mergeCombatMove({ dx: 0, dy: 0 }, spacing, true);
    const requestedMove = { dx: combatMove.dx, dy: combatMove.dy };
    const movementSuppressed = combatMovementBlockedByStamina(self) && Boolean(combatMove.dx || combatMove.dy)
      ? {
        reason: 'stamina-5s-exhausted',
        stamina5s: staminaRemaining(self, '5s'),
        thresholdMs: staminaExhaustedThreshold(),
        requestedDx: combatMove.dx,
        requestedDy: combatMove.dy
      }
      : null;
    if (movementSuppressed) combatMove = { ...combatMove, dx: 0, dy: 0, movementSuppressed: true };
    const aim = combatAimTarget(self, target, { realBulletPressure });
    const shooting = combatShootingPlan(self, {
      needsMovement: Boolean(requestedMove.dx || requestedMove.dy),
      dodging,
      realBulletPressure,
      targetDistance: distance,
      targetHp,
      steadyAim: Boolean(aim.steadyAim),
	      engagedCombat: target.combatIntent === 'engaged',
	      targetActive: isCurrentlyActive(target),
	      targetMoving: speed(target) >= cfg.combatStationarySpeed,
	      noDamageMs: Number(aim.noDamageMs || 0),
	      aimConfidence: aim.aimConfidence,
	      motionScale: aim.motionScale
	    });
    return {
      reason: movementSuppressed
        ? 'combat-stamina-hold'
        : (shooting.suppressed
          ? 'combat-stamina-conserve'
          : (realBulletPressure && !spacingOverride
            ? 'combat-leave-dodge'
            : (spacing.active && (combatMove.dx || combatMove.dy) ? 'combat-leave-spacing' : 'combat-leave-cover'))),
      dx: combatMove.dx,
      dy: combatMove.dy,
      shoot: shooting.shoot,
      forceShoot: shooting.forceShoot,
      shootEveryMs: shooting.shootEveryMs,
      aimTarget: {
        x: aim.x,
        y: aim.y,
        mode: aim.mode,
        angle: Number.isFinite(aim.angle) ? Number(aim.angle.toFixed(4)) : 0,
        jitterLimit: Number.isFinite(aim.jitterLimit) ? Number(aim.jitterLimit.toFixed(4)) : 0,
        motionScale: Number.isFinite(Number(aim.motionScale)) ? Number(Number(aim.motionScale).toFixed(2)) : 0,
        movementMode: aim.movementMode || '',
        strategy: aim.aimStrategy || '',
        strategyReason: aim.aimStrategyReason || '',
        noDamageMs: Number.isFinite(Number(aim.noDamageMs)) ? Math.round(Number(aim.noDamageMs)) : 0,
        widened: Boolean(aim.noDamageWidened),
        precision: Boolean(aim.precisionAim),
        steady: Boolean(aim.steadyAim),
        locked: Boolean(aim.lockedAim),
        live: Boolean(aim.liveAim),
        liveDistance: Number.isFinite(Number(aim.liveDistance)) ? Math.round(Number(aim.liveDistance)) : null,
        sourceDivergenceCm: Number.isFinite(Number(aim.sourceDivergenceCm)) ? Math.round(Number(aim.sourceDivergenceCm)) : null,
        sourceDivergenceThresholdCm: Number.isFinite(Number(aim.sourceDivergenceThresholdCm)) ? Math.round(Number(aim.sourceDivergenceThresholdCm)) : null,
        serverStall: Boolean(aim.serverStallAim),
        realBulletPrecision: Boolean(aim.realBulletPrecisionAim),
        radialPrecision: Boolean(aim.radialPrecisionAim),
        fallbackPrecision: Boolean(aim.fallbackPrecisionAim),
	        intercept: Boolean(aim.interceptAim),
	        interceptFlightMs: Number.isFinite(Number(aim.interceptFlightMs)) ? Math.round(Number(aim.interceptFlightMs)) : null,
	        interceptLeadDistance: Number.isFinite(Number(aim.interceptLeadDistance)) ? Math.round(Number(aim.interceptLeadDistance)) : null,
	        interceptConfidence: Number.isFinite(Number(aim.interceptConfidence)) ? Number(Number(aim.interceptConfidence).toFixed(2)) : null,
	        aimConfidence: Number.isFinite(Number(aim.aimConfidence)) ? Number(Number(aim.aimConfidence).toFixed(2)) : null,
	        opponentProfile: aim.opponentProfile || null
	      },
      incomingBullet: pressure ? {
        id: pressure.id,
        ownerId: pressure.ownerId,
        distance: Math.round(Number(pressure.distance || 0)),
        laneDistance: Math.round(Number(pressure.laneDistance || 0)),
        signedLaneDistance: Number.isFinite(Number(pressure.signedLaneDistance)) ? Math.round(Number(pressure.signedLaneDistance)) : null,
        timeToImpactMs: Number.isFinite(Number(pressure.timeToImpactMs)) ? Math.round(Number(pressure.timeToImpactMs)) : null,
        threatCount: Number(pressure.threatCount || (Array.isArray(pressure.threats) ? pressure.threats.length : 1)),
        synthetic: Boolean(pressure.synthetic),
        reason: pressure.reason || ''
      } : null,
      movementSuppressed,
      shooting,
      strafe: dodging ? {
        dx: combatMove.dx,
        dy: combatMove.dy,
        sign: strafe.sign,
        precise: Boolean(strafe.precise),
        locked: Boolean(strafe.locked),
        lockOverridden: Boolean(strafe.lockOverridden),
        carried: Boolean(strafe.carried),
        threatField: strafe.threatField ? {
          dx: strafe.threatField.dx,
          dy: strafe.threatField.dy,
          directHitCount: strafe.threatField.directHitCount,
          minCpaDistance: Number.isFinite(Number(strafe.threatField.minCpaDistance)) ? Math.round(Number(strafe.threatField.minCpaDistance)) : null,
          minTimeToImpactMs: Number.isFinite(Number(strafe.threatField.minTimeToImpactMs)) ? Math.round(Number(strafe.threatField.minTimeToImpactMs)) : null
        } : null
      } : null,
      spacing: spacing.active ? {
        dx: spacing.dx,
        dy: spacing.dy,
        reason: spacing.reason,
        distance: Math.round(spacing.distance),
        minRange: Math.round(spacing.minRange),
        preferredRange: Math.round(spacing.preferredRange),
        merged: Boolean(combatMove.spacingMerged),
        overrideBullet: Boolean(spacingOverride)
      } : null
    };
  }



  const {
    combatExitSummaryCore: combatExitSummaryForCombatActionCore,
    combatLeaveActionCore: combatLeaveActionForCombatActionCore
  } = require('./runtime/exit-relogin');

  function buildCombatAction(self, target, bullets) {
    const selfHp = hpValue(self);
    const targetHp = combatHpValue(target);
    const targetDistance = Number.isFinite(Number(target.distance)) ? Number(target.distance) : dist(self, target);
    const targetMotionScale = combatAimMotionScale(target);
    const currentCombatTarget = bot.combatTarget && combatTargetId(bot.combatTarget) === combatTargetId(target)
      ? bot.combatTarget
      : null;
    const combatOriginIntent = String(target?.combatEngagement?.originIntent || currentCombatTarget?.originIntent || target.combatIntent || '');
    const combatOriginReason = String(target?.combatEngagement?.originReason || currentCombatTarget?.originReason || '');
    const seenTargetRealBulletAt = Number(target?.combatEngagement?.seenTargetRealBulletAt || currentCombatTarget?.seenTargetRealBulletAt || 0);
    const seenTargetRealBulletMs = seenTargetRealBulletAt ? Math.max(0, Date.now() - seenTargetRealBulletAt) : 0;
    const targetMoving = speed(target) >= cfg.combatStationarySpeed
      || targetMotionScale >= Math.max(0, Number(cfg.combatAimMovingScaleThreshold || 0.15));
    const baseTarget = {
      id: target.user_id,
      name: target.name,
      x: target.x,
      y: target.y,
      vx: Number(target.vx) || 0,
      vy: Number(target.vy) || 0,
      hp: targetHp,
      knownHp: knownHpValue(target),
      drop: target.drop,
      distance: Math.round(targetDistance),
      moving: targetMoving,
      motionScale: Number(targetMotionScale.toFixed(2)),
      combatIntent: target.combatIntent || '',
      score: Number.isFinite(Number(target.combatOpportunityScore)) ? Number(target.combatOpportunityScore) : null,
      competingCoinScore: Number.isFinite(Number(target.competingCoinScore)) ? Number(target.competingCoinScore) : null,
      mode: target.current_join_mode || target.mode || '',
      life: target.life || '',
      active: isCurrentlyActive(target),
      firing: isFiringEntity(target),
      invulnerable: isInvulnerable(target),
      combatOriginIntent,
      combatOriginReason: combatOriginReason || '',
      seenTargetRealBulletMs: seenTargetRealBulletMs || 0
	    };
	    if (selfHp < cfg.combatCriticalHpLeaveThreshold) {
	      return combatLeaveActionForCombatActionCore('combat-critical-hp-leave', baseTarget, { selfHp, targetHp }, combatLeaveCoverAction(self, target, bullets, targetDistance), { combatExitSummary: (summaryReason, summaryTarget, summaryState) => combatExitSummaryForCombatActionCore(summaryReason, summaryTarget, summaryState, { cfg, actorLabel, hpDisplay, formatDurationMs }), clamp });
	    }
	    if (selfHp < cfg.combatLowHpLeaveThreshold && selfHp < targetHp) {
	      return combatLeaveActionForCombatActionCore('combat-low-hp-leave', baseTarget, { selfHp, targetHp }, combatLeaveCoverAction(self, target, bullets, targetDistance), { combatExitSummary: (summaryReason, summaryTarget, summaryState) => combatExitSummaryForCombatActionCore(summaryReason, summaryTarget, summaryState, { cfg, actorLabel, hpDisplay, formatDurationMs }), clamp });
    }
    const knownSelfHp = knownHpValue(self);
    const knownTargetHp = knownHpValue(target);
    const hpGap = Number(knownTargetHp) - Number(knownSelfHp);
    let disadvantageObservation = null;
    if (knownSelfHp > cfg.combatLowHpLeaveThreshold
      && Number.isFinite(hpGap)
      && hpGap > cfg.combatHighHpDisadvantageGap) {
      disadvantageObservation = combatDisadvantageObservationState(target, 'hp-gap', { selfHp, targetHp, hpGap });
      if (disadvantageObservation?.ready) {
        return combatLeaveActionForCombatActionCore('combat-hp-disadvantage-leave', baseTarget, { selfHp, targetHp, hpGap, disadvantageObservation }, combatLeaveCoverAction(self, target, bullets, targetDistance), { combatExitSummary: (summaryReason, summaryTarget, summaryState) => combatExitSummaryForCombatActionCore(summaryReason, summaryTarget, summaryState, { cfg, actorLabel, hpDisplay, formatDurationMs }), clamp });
      }
    }
    let pressure = combatPressureThreat(self, target, bullets);
    const spacing = combatSpacingVector(self, target, targetDistance);
    const damageState = combatAimDamageState(target);
    let passiveRunner = combatPassiveRunnerState(self, target, targetDistance, damageState, pressure, targetMotionScale);
    const retreatingTarget = combatRetreatingTargetState(self, target, targetDistance, damageState);
    if (retreatingTarget.active && passiveRunner.active) {
      passiveRunner = { ...passiveRunner, active: false, suppressedBy: retreatingTarget.reason || 'retreating-target' };
    }
    if (passiveRunner.active && pressure?.synthetic && pressure.reason === 'target-pressure') pressure = null;
    const realBulletPressure = Boolean(pressure && !pressure.synthetic);
    const targetRealBulletPressure = Boolean(
      pressure
      && !pressure.synthetic
      && pressure.ownerId !== null
      && pressure.ownerId !== undefined
      && combatTargetId(target)
      && String(pressure.ownerId) === String(combatTargetId(target))
    );
    const closeRisk = combatLowHpCloseRiskState(selfHp, targetHp, spacing, realBulletPressure);
    if (closeRisk) {
      return combatLeaveActionForCombatActionCore('combat-low-hp-leave', baseTarget, { selfHp, targetHp, closeRisk }, combatLeaveCoverAction(self, target, bullets, targetDistance), { combatExitSummary: (summaryReason, summaryTarget, summaryState) => combatExitSummaryForCombatActionCore(summaryReason, summaryTarget, summaryState, { cfg, actorLabel, hpDisplay, formatDurationMs }), clamp });
    }
	    const pressureDisadvantage = combatPressureDisadvantageState(selfHp, targetHp, targetDistance, realBulletPressure);
		    if (pressureDisadvantage) {
		      return combatLeaveActionForCombatActionCore('combat-hp-disadvantage-leave', baseTarget, {
		        selfHp,
		        targetHp,
		        hpGap: pressureDisadvantage.hpGap,
		        pressureDisadvantage
		      }, combatLeaveCoverAction(self, target, bullets, targetDistance), { combatExitSummary: (summaryReason, summaryTarget, summaryState) => combatExitSummaryForCombatActionCore(summaryReason, summaryTarget, summaryState, { cfg, actorLabel, hpDisplay, formatDurationMs }), clamp });
		    }
	    const sustainedPressureDisadvantage = combatSustainedPressureDisadvantageState(
	      selfHp,
	      targetHp,
	      targetDistance,
	      damageState.noDamageMs,
	      targetRealBulletPressure
	    );
	    if (sustainedPressureDisadvantage) {
	      return combatLeaveActionForCombatActionCore('combat-hp-disadvantage-leave', baseTarget, {
	        selfHp,
	        targetHp,
	        hpGap: sustainedPressureDisadvantage.hpGap,
	        sustainedPressureDisadvantage
	      }, combatLeaveCoverAction(self, target, bullets, targetDistance), { combatExitSummary: (summaryReason, summaryTarget, summaryState) => combatExitSummaryForCombatActionCore(summaryReason, summaryTarget, summaryState, { cfg, actorLabel, hpDisplay, formatDurationMs }), clamp });
	    }
	    const tradeEstimate = combatTradeEstimate(self, target);
    if (!disadvantageObservation && tradeEstimate?.active) {
      disadvantageObservation = combatDisadvantageObservationState(target, 'trade-estimate', {
        selfHp,
        targetHp,
        hpGap,
        ...tradeEstimate
      });
      if (disadvantageObservation?.ready) {
        return combatLeaveActionForCombatActionCore('combat-hp-disadvantage-leave', baseTarget, {
          selfHp,
          targetHp,
          hpGap,
          tradeEstimate,
          disadvantageObservation
        }, combatLeaveCoverAction(self, target, bullets, targetDistance), { combatExitSummary: (summaryReason, summaryTarget, summaryState) => combatExitSummaryForCombatActionCore(summaryReason, summaryTarget, summaryState, { cfg, actorLabel, hpDisplay, formatDurationMs }), clamp });
      }
    }
    if (!disadvantageObservation) clearCombatDisadvantageObservation('not-disadvantaged');
	    const serverStallNoDamage = combatServerStallNoDamageLeaveState(
      selfHp,
      targetHp,
      damageState.noDamageMs,
      realBulletPressure,
      summarizeServerPositionStall()
    );
    if (serverStallNoDamage && !retreatingTarget.disengage) {
      return combatLeaveActionForCombatActionCore('combat-hp-disadvantage-leave', baseTarget, {
        selfHp,
        targetHp,
        hpGap: serverStallNoDamage.hpGap,
        noDamageMs: damageState.noDamageMs,
        serverStallNoDamage
      }, combatLeaveCoverAction(self, target, bullets, targetDistance), { combatExitSummary: (summaryReason, summaryTarget, summaryState) => combatExitSummaryForCombatActionCore(summaryReason, summaryTarget, summaryState, { cfg, actorLabel, hpDisplay, formatDurationMs }), clamp });
    }
    if (retreatingTarget.disengage) {
      clearCombatDisadvantageObservation('combat-disengage-range');
      clearCombatEngagement('combat-disengage-range');
      return {
        kind: 'wait',
        reason: 'combat-disengage-range',
        combat: false,
        ignoreReturnBlock: true,
        shoot: false,
        forceShoot: false,
        dx: 0,
        dy: 0,
        combatDisengage: retreatingTarget
      };
    }
    const outOfRangeFinishPressure = combatOutOfRangeFinishPressureState(
      self,
      target,
      targetDistance,
      selfHp,
      targetHp,
      damageState,
      retreatingTarget
    );
    const outOfRangeReengage = combatOutOfRangeReengageState(
      self,
      target,
      targetDistance,
      selfHp,
      targetHp,
      retreatingTarget,
      targetRealBulletPressure
    );
    if (targetDistance > Number(cfg.combatAttackRange || 0)) {
      const outOfRangeCloseMove = outOfRangeFinishPressure.active
        ? outOfRangeFinishPressure
        : (outOfRangeReengage.active ? outOfRangeReengage : null);
      const outOfRangeDodge = combatOutOfRangeDodgeAction(self, target, pressure, baseTarget, selfHp, targetHp, retreatingTarget, outOfRangeCloseMove);
      if (outOfRangeDodge) return outOfRangeDodge;
      if (outOfRangeFinishPressure.active) {
        return {
          kind: 'attack',
          reason: 'combat-finish-reengage',
          combat: true,
          ignoreReturnBlock: true,
          shoot: false,
          forceShoot: false,
          dx: outOfRangeFinishPressure.dx,
          dy: outOfRangeFinishPressure.dy,
          target: baseTarget,
          combatState: {
            selfHp,
            targetHp,
            outOfRangeFinishPressure,
            retreatingTarget: retreatingTarget.active ? retreatingTarget : null
          }
        };
      }
      if (outOfRangeReengage.active) {
        return {
          kind: 'attack',
          reason: 'combat-out-of-range-reengage',
          combat: true,
          ignoreReturnBlock: true,
          shoot: false,
          forceShoot: false,
          dx: outOfRangeReengage.dx,
          dy: outOfRangeReengage.dy,
          target: baseTarget,
          combatState: {
            selfHp,
            targetHp,
            outOfRangeReengage,
            retreatingTarget: retreatingTarget.active ? retreatingTarget : null
          }
        };
      }
      return {
        kind: 'wait',
        reason: 'combat-out-of-range-hold',
        combat: true,
        ignoreReturnBlock: true,
        shoot: false,
        forceShoot: false,
        dx: 0,
        dy: 0,
        target: baseTarget,
        combatState: {
          selfHp,
          targetHp,
          outOfRangeHold: {
            distance: Math.round(targetDistance),
            attackRange: Math.round(Number(cfg.combatAttackRange || 0)),
            disengageRange: Math.round(Math.max(Number(cfg.combatAttackRange || 0), Number(cfg.combatDisengageRange || cfg.combatEngageGraceRange || 0))),
            outOfRangeMs: target.combatEngagement?.outOfRangeMs || 0,
            graceRemainingMs: target.combatEngagement?.graceRemainingMs || 0
          }
        }
      };
    }
    const finishPressure = combatFinishPressureState(self, target, targetDistance, selfHp, targetHp, retreatingTarget);
    const farNoDamageClose = combatFarNoDamageCloseVector(
      self,
      target,
      targetDistance,
      damageState.noDamageMs,
      selfHp,
      targetHp
    );
    const retreatingFighterClose = combatRetreatingFighterCloseVector(
      self,
      target,
      targetDistance,
      damageState.noDamageMs,
      selfHp,
      targetHp,
      retreatingTarget,
      targetRealBulletPressure
    );
    const retreatingBlocksClose = retreatingTarget.active && !retreatingFighterClose.active;
    const basePressureClose = finishPressure.active
      ? finishPressure
      : (retreatingFighterClose.active
        ? retreatingFighterClose
        : (retreatingBlocksClose
        ? { active: false, dx: 0, dy: 0, distance: targetDistance, closeRange: cfg.combatPressureCloseRange, noDamageMs: damageState.noDamageMs, retreatingTarget }
        : (farNoDamageClose.active
          ? farNoDamageClose
          : combatPressureCloseVector(self, target, targetDistance, damageState.noDamageMs, selfHp))));
    const passiveRunnerClose = !basePressureClose.active && !retreatingTarget.active
      ? combatPassiveRunnerCloseVector(self, target, targetDistance, passiveRunner)
      : { active: false, dx: 0, dy: 0, distance: targetDistance, closeRange: Number(cfg.combatPassiveRunnerCloseRange || 0), noDamageMs: damageState.noDamageMs, reason: 'passive-runner' };
    const pressureClose = passiveRunnerClose.active ? passiveRunnerClose : basePressureClose;
    const strafe = tangentMoveForBullet(self, target, pressure, { preferClosing: pressureClose.active });
    const dodging = Boolean(pressure || strafe.active);
    const spacingOverride = realBulletPressure && combatSpacingShouldOverrideBullet(spacing, selfHp, targetHp);
    let combatMove = dodging
      ? mergeCombatMove(strafe, spacing, !realBulletPressure || spacingOverride)
      : mergeCombatMove({ dx: 0, dy: 0 }, spacing, true);
    const safePressureCloseOverride = realBulletPressure
      ? combatSafeCloseMoveOverride(self, target, pressure, pressureClose)
      : null;
    combatMove = safePressureCloseOverride
      ? {
        ...combatMove,
        dx: safePressureCloseOverride.dx,
        dy: safePressureCloseOverride.dy,
        safeCloseOverride: safePressureCloseOverride
      }
      : mergeCombatMove(combatMove, pressureClose, !realBulletPressure);
    const requestedMove = { dx: combatMove.dx, dy: combatMove.dy };
    const movementSuppressed = combatMovementBlockedByStamina(self) && Boolean(combatMove.dx || combatMove.dy)
      ? {
        reason: 'stamina-5s-exhausted',
        stamina5s: staminaRemaining(self, '5s'),
        thresholdMs: staminaExhaustedThreshold(),
        requestedDx: combatMove.dx,
        requestedDy: combatMove.dy
      }
      : null;
    if (movementSuppressed) combatMove = { ...combatMove, dx: 0, dy: 0, movementSuppressed: true };
    const spacingActive = Boolean(spacing.active && (combatMove.dx || combatMove.dy));
    const aim = combatAimTarget(self, target, { realBulletPressure, passiveRunner: passiveRunner.active });
    const pressureCloseActive = Boolean(pressureClose.active && (combatMove.dx || combatMove.dy));
    const farNoDamageCloseForTrend = Boolean(pressureClose.farNoDamageClose || pressureClose.reason === 'far-no-damage');
    const trend = combatTrendState(self, {
      needsMovement: Boolean(requestedMove.dx || requestedMove.dy),
      dodging,
      realBulletPressure,
      targetRealBulletPressure,
      pressureClose: pressureClose.active,
      targetDistance,
      targetHp,
      steadyAim: Boolean(aim.steadyAim),
      engagedCombat: target.combatIntent === 'engaged',
      targetActive: isCurrentlyActive(target),
      passiveRunner: passiveRunner.active,
      opponentProbeEngagedMs: passiveRunner.engagedMs,
      opponentProbeSeenTargetRealBulletMs: passiveRunner.seenTargetRealBulletMs,
	      targetMoving,
	      noDamageMs: Number(aim.noDamageMs || 0),
	      aimConfidence: aim.aimConfidence,
	      motionScale: aim.motionScale,
	      farNoDamageClose: farNoDamageCloseForTrend
	    });
    let shooting = combatShootingPlan(self, {
      trend,
      needsMovement: Boolean(requestedMove.dx || requestedMove.dy),
      dodging,
      realBulletPressure,
      targetRealBulletPressure,
      pressureClose: pressureClose.active,
      targetDistance: targetDistance,
      targetHp,
      steadyAim: Boolean(aim.steadyAim),
	      engagedCombat: target.combatIntent === 'engaged',
	      targetActive: isCurrentlyActive(target),
	      passiveRunner: passiveRunner.active,
      opponentProbeEngagedMs: passiveRunner.engagedMs,
      opponentProbeSeenTargetRealBulletMs: passiveRunner.seenTargetRealBulletMs,
	      targetMoving,
	      noDamageMs: Number(aim.noDamageMs || 0),
	      aimConfidence: aim.aimConfidence,
	      motionScale: aim.motionScale,
	      farNoDamageClose: farNoDamageCloseForTrend
	    });
    if (retreatingTarget.suppressFire && !finishPressure.active && !retreatingFighterClose.active) {
      shooting = {
        ...shooting,
        shoot: false,
        forceShoot: false,
        suppressed: true,
        reason: 'target-retreating-edge',
        retreatingTarget
      };
    }
    if (finishPressure.active && !shooting.suppressed) {
      const finishEveryMs = Math.max(
        Number(shooting.shootEveryMs || 0),
        Number(cfg.combatFinishPressureShootEveryMs || cfg.combatShootConserveEveryMs || cfg.combatShootEveryMs || 0)
      );
      shooting = {
        ...shooting,
        shoot: true,
        shootEveryMs: finishEveryMs || shooting.shootEveryMs,
        reason: 'finish-pressure',
        throttled: true,
        finishPressure
      };
    }
    const baseReason = realBulletPressure
      ? (spacingOverride ? 'combat-spacing-dodge' : 'combat-tangent-dodge')
        : (pressureCloseActive && pressureClose.reason === 'passive-runner'
        ? 'combat-passive-runner-close'
        : (spacingActive
        ? (dodging ? 'combat-spacing-dodge' : 'combat-spacing')
        : (pressureCloseActive ? (finishPressure.active ? 'combat-finish-pressure' : (retreatingFighterClose.active ? 'combat-retreating-fighter-close' : (farNoDamageClose.active ? 'combat-far-pressure-close' : 'combat-pressure-close'))) : (dodging ? 'combat-tangent-dodge' : 'combat-attack'))));
    return {
      kind: 'attack',
      reason: movementSuppressed
        ? 'combat-stamina-hold'
        : (retreatingTarget.suppressFire && !finishPressure.active && !retreatingFighterClose.active ? 'combat-target-retreating' : (shooting.suppressed ? 'combat-stamina-conserve' : (shooting.reason === 'finish-pressure' ? 'combat-finish-pressure' : (shooting.throttled && shooting.reason !== 'opponent-probe' ? 'combat-burst-fire' : baseReason)))),
      combat: true,
      ignoreReturnBlock: true,
      shoot: shooting.shoot,
      forceShoot: shooting.forceShoot,
      shootEveryMs: shooting.shootEveryMs,
      dx: combatMove.dx,
      dy: combatMove.dy,
      target: baseTarget,
      aimTarget: {
        x: aim.x,
        y: aim.y,
        mode: aim.mode,
        angle: Number.isFinite(aim.angle) ? Number(aim.angle.toFixed(4)) : 0,
        jitterLimit: Number.isFinite(aim.jitterLimit) ? Number(aim.jitterLimit.toFixed(4)) : 0,
        motionScale: Number.isFinite(Number(aim.motionScale)) ? Number(Number(aim.motionScale).toFixed(2)) : 0,
        movementMode: aim.movementMode || '',
        strategy: aim.aimStrategy || '',
        strategyReason: aim.aimStrategyReason || '',
        noDamageMs: Number.isFinite(Number(aim.noDamageMs)) ? Math.round(Number(aim.noDamageMs)) : 0,
        widened: Boolean(aim.noDamageWidened),
        precision: Boolean(aim.precisionAim),
        steady: Boolean(aim.steadyAim),
        locked: Boolean(aim.lockedAim),
        live: Boolean(aim.liveAim),
        liveDistance: Number.isFinite(Number(aim.liveDistance)) ? Math.round(Number(aim.liveDistance)) : null,
        sourceDivergenceCm: Number.isFinite(Number(aim.sourceDivergenceCm)) ? Math.round(Number(aim.sourceDivergenceCm)) : null,
        sourceDivergenceThresholdCm: Number.isFinite(Number(aim.sourceDivergenceThresholdCm)) ? Math.round(Number(aim.sourceDivergenceThresholdCm)) : null,
        serverStall: Boolean(aim.serverStallAim),
        realBulletPrecision: Boolean(aim.realBulletPrecisionAim),
        radialPrecision: Boolean(aim.radialPrecisionAim),
        fallbackPrecision: Boolean(aim.fallbackPrecisionAim),
        passiveRunner: Boolean(aim.passiveRunnerAim),
	        intercept: Boolean(aim.interceptAim),
	        interceptFlightMs: Number.isFinite(Number(aim.interceptFlightMs)) ? Math.round(Number(aim.interceptFlightMs)) : null,
	        interceptLeadDistance: Number.isFinite(Number(aim.interceptLeadDistance)) ? Math.round(Number(aim.interceptLeadDistance)) : null,
	        interceptConfidence: Number.isFinite(Number(aim.interceptConfidence)) ? Number(Number(aim.interceptConfidence).toFixed(2)) : null,
	        aimConfidence: Number.isFinite(Number(aim.aimConfidence)) ? Number(Number(aim.aimConfidence).toFixed(2)) : null,
	        opponentProfile: aim.opponentProfile || null
	      },
      incomingBullet: pressure ? {
        id: pressure.id,
        ownerId: pressure.ownerId,
        distance: Math.round(Number(pressure.distance || 0)),
        laneDistance: Math.round(Number(pressure.laneDistance || 0)),
        signedLaneDistance: Number.isFinite(Number(pressure.signedLaneDistance)) ? Math.round(Number(pressure.signedLaneDistance)) : null,
        timeToImpactMs: Number.isFinite(Number(pressure.timeToImpactMs)) ? Math.round(Number(pressure.timeToImpactMs)) : null,
        threatCount: Number(pressure.threatCount || (Array.isArray(pressure.threats) ? pressure.threats.length : 1)),
        synthetic: Boolean(pressure.synthetic),
        reason: pressure.reason || ''
      } : null,
      combatState: {
        selfHp,
        targetHp,
        combatOriginIntent,
        combatOriginReason: combatOriginReason || '',
        seenTargetRealBulletMs: seenTargetRealBulletMs || 0,
        targetRealBulletPressure,
        aim: {
          movementMode: aim.movementMode || '',
          strategy: aim.aimStrategy || '',
          strategyReason: aim.aimStrategyReason || '',
          angle: Number.isFinite(aim.angle) ? Number(aim.angle.toFixed(4)) : 0,
          motionScale: Number.isFinite(Number(aim.motionScale)) ? Number(Number(aim.motionScale).toFixed(2)) : 0,
          noDamageMs: Number.isFinite(Number(aim.noDamageMs)) ? Math.round(Number(aim.noDamageMs)) : 0,
          widened: Boolean(aim.noDamageWidened),
          precision: Boolean(aim.precisionAim),
          steady: Boolean(aim.steadyAim),
          locked: Boolean(aim.lockedAim),
          live: Boolean(aim.liveAim),
          liveDistance: Number.isFinite(Number(aim.liveDistance)) ? Math.round(Number(aim.liveDistance)) : null,
          sourceDivergenceCm: Number.isFinite(Number(aim.sourceDivergenceCm)) ? Math.round(Number(aim.sourceDivergenceCm)) : null,
          sourceDivergenceThresholdCm: Number.isFinite(Number(aim.sourceDivergenceThresholdCm)) ? Math.round(Number(aim.sourceDivergenceThresholdCm)) : null,
          serverStall: Boolean(aim.serverStallAim),
          realBulletPrecision: Boolean(aim.realBulletPrecisionAim),
          radialPrecision: Boolean(aim.radialPrecisionAim),
          fallbackPrecision: Boolean(aim.fallbackPrecisionAim),
          passiveRunner: Boolean(aim.passiveRunnerAim),
        intercept: Boolean(aim.interceptAim),
        interceptFlightMs: Number.isFinite(Number(aim.interceptFlightMs)) ? Math.round(Number(aim.interceptFlightMs)) : null,
        interceptLeadDistance: Number.isFinite(Number(aim.interceptLeadDistance)) ? Math.round(Number(aim.interceptLeadDistance)) : null,
	        interceptConfidence: Number.isFinite(Number(aim.interceptConfidence)) ? Number(Number(aim.interceptConfidence).toFixed(2)) : null,
	        aimConfidence: Number.isFinite(Number(aim.aimConfidence)) ? Number(Number(aim.aimConfidence).toFixed(2)) : null,
	        opponentProfile: aim.opponentProfile || null
	        },
        strafe: dodging ? {
          dx: combatMove.dx,
          dy: combatMove.dy,
          sign: strafe.sign,
	          precise: Boolean(strafe.precise),
	          locked: Boolean(strafe.locked),
	          lockOverridden: Boolean(strafe.lockOverridden),
          closingBiased: Boolean(strafe.closingBiased),
	          carried: Boolean(strafe.carried),
          holdRemainingMs: strafe.holdRemainingMs || 0,
          carryRemainingMs: strafe.carryRemainingMs || 0,
          spacingMerged: Boolean(combatMove.spacingMerged),
          threatField: strafe.threatField ? {
            dx: strafe.threatField.dx,
            dy: strafe.threatField.dy,
            directHitCount: strafe.threatField.directHitCount,
            minCpaDistance: Number.isFinite(Number(strafe.threatField.minCpaDistance)) ? Math.round(Number(strafe.threatField.minCpaDistance)) : null,
            minTimeToImpactMs: Number.isFinite(Number(strafe.threatField.minTimeToImpactMs)) ? Math.round(Number(strafe.threatField.minTimeToImpactMs)) : null
          } : null
        } : null,
        spacing: spacingActive ? {
          dx: spacing.dx,
          dy: spacing.dy,
          reason: spacing.reason,
          distance: Math.round(spacing.distance),
          minRange: Math.round(spacing.minRange),
          preferredRange: Math.round(spacing.preferredRange),
          radialSpeed: Number.isFinite(Number(spacing.radialSpeed)) ? Math.round(Number(spacing.radialSpeed)) : null,
          merged: Boolean(combatMove.spacingMerged),
          overrideBullet: Boolean(spacingOverride)
        } : null,
        pressureClose: pressureClose.active ? {
          dx: pressureClose.dx,
          dy: pressureClose.dy,
          reason: pressureClose.reason,
          distance: Math.round(pressureClose.distance),
          closeRange: Math.round(pressureClose.closeRange),
          startRange: Number.isFinite(Number(pressureClose.startRange)) ? Math.round(Number(pressureClose.startRange)) : null,
          noDamageMs: Math.round(pressureClose.noDamageMs),
          farNoDamageClose: Boolean(pressureClose.farNoDamageClose || pressureClose.reason === 'far-no-damage'),
          preferClosing: Boolean(pressureClose.active),
          merged: Boolean(!realBulletPressure || safePressureCloseOverride),
          safeCloseOverride: safePressureCloseOverride ? {
            dx: safePressureCloseOverride.dx,
            dy: safePressureCloseOverride.dy,
            reason: safePressureCloseOverride.reason,
            minCpaDistance: Number.isFinite(Number(safePressureCloseOverride.threatField?.minCpaDistance)) ? Math.round(Number(safePressureCloseOverride.threatField.minCpaDistance)) : null,
            directHitCount: Number(safePressureCloseOverride.threatField?.directHitCount || 0)
          } : null
        } : null,
        passiveRunner,
        movementSuppressed,
        shooting,
        disadvantageObservation,
        retreatingTarget: retreatingTarget.active ? retreatingTarget : null
      }
    };
  }



	  function snapshotCoinAgeMs() {
	    return bot.globalState.snapshotRefreshedAt ? Math.max(0, Date.now() - Number(bot.globalState.snapshotRefreshedAt || 0)) : Infinity;
	  }

	  function isSnapshotCoinWaitAction(action) {
	    const reason = String(action?.reason || '');
	    return reason === 'wait-for-snapshot-coin'
	      || reason === 'wait-for-stamina-budget'
	      || reason === 'snapshot-coin-idle-timeout';
	  }

	  function pickSnapshotCoinDestination(self, allCoins, activeThreats, options = {}) {
	    const allowIdleFallback = Boolean(options.allowIdleFallback || options.idleFallback);
	    const ageMs = snapshotCoinAgeMs();
	    if (ageMs > cfg.snapshotCoinStaleMs) return null;
		    const candidates = safeCoinCandidates((allCoins || []).filter(isSnapshotOnlyCoin), activeThreats, cfg.snapshotCoinMaxDistance, self);
	    if (!candidates.length) return null;
	    const buildSnapshotItem = coin => {
	      const members = candidates.filter(other => dist(coin, other) <= Number(cfg.snapshotCoinClusterRadius || cfg.fieldMigrationClusterRadius));
	      const totalAmount = members.reduce((sum, item) => sum + Number(item.amount || 0), 0);
	      const staminaCost = opportunityCoinStaminaCost(coin);
	      const score = opportunityValueScoreCore(totalAmount, staminaCost, {
        weight: cfg.coinOpportunityValue,
        distanceFloor: cfg.opportunityDistanceFloor,
        distanceScoreScale: cfg.opportunityDistanceScoreScale
      });
	      return {
	        ...coin,
	        snapshotMembers: members.length,
	        snapshotAmount: totalAmount,
	        snapshotScore: score,
	        opportunityStaminaCost: staminaCost,
	        snapshotAgeMs: ageMs
	      };
	    };
	    const asOpportunity = item => ({ ...item, opportunityScore: item.snapshotScore });
	    const asIdleFallback = item => ({ ...asOpportunity(item), snapshotIdleFallback: true });
	    let stickyFallback = null;
	    if (bot.lastTarget?.kind === 'coin' && now() - bot.lastTargetAt < cfg.coinStickMs) {
	      const sticky = candidates.find(c => String(c.drop_id) === String(bot.lastTarget.id));
	      if (sticky) {
	        const stickyItem = buildSnapshotItem(sticky);
	        if (coinStaminaAffordableWithDiagnostic(self, sticky, stickyItem.opportunityStaminaCost)
	          && snapshotCoinWorthLongTravelCore(sticky, stickyItem.snapshotMembers, stickyItem.snapshotAmount, coinTargetCoreOptions())) return asOpportunity(stickyItem);
	        if (allowIdleFallback) stickyFallback = stickyItem;
	      }
	    }
	    let best = null;
	    let idleBest = stickyFallback;
	    const radius = Number(cfg.snapshotCoinClusterRadius || cfg.fieldMigrationClusterRadius);
	    const minCoins = Math.max(1, Number(cfg.snapshotCoinClusterMinCoins || 1));
	    for (const coin of candidates.slice(0, 300)) {
	      const members = candidates.filter(other => dist(coin, other) <= radius);
	      const totalAmount = members.reduce((sum, item) => sum + Number(item.amount || 0), 0);
	      const staminaCost = opportunityCoinStaminaCost(coin);
	      const score = opportunityValueScoreCore(totalAmount, staminaCost, {
        weight: cfg.coinOpportunityValue,
        distanceFloor: cfg.opportunityDistanceFloor,
        distanceScoreScale: cfg.opportunityDistanceScoreScale
      });
	      const item = {
	        ...coin,
        snapshotMembers: members.length,
        snapshotAmount: totalAmount,
        snapshotScore: score,
	        opportunityStaminaCost: staminaCost,
	        snapshotAgeMs: ageMs
	      };
	      const affordable = coinStaminaAffordableWithDiagnostic(self, coin, staminaCost);
	      if (affordable && snapshotCoinWorthLongTravelCore(coin, members.length, totalAmount, coinTargetCoreOptions())) {
	        if (!best
	          || item.snapshotScore > best.snapshotScore
	          || (item.snapshotScore === best.snapshotScore && members.length >= minCoins && best.snapshotMembers < minCoins)
	          || (item.snapshotScore === best.snapshotScore && item.distance < best.distance)) best = item;
	      }
	      if (allowIdleFallback && (!idleBest
	        || item.snapshotScore > idleBest.snapshotScore
	        || (item.snapshotScore === idleBest.snapshotScore && item.distance < idleBest.distance))) {
	        idleBest = item;
	      }
	    }
	    if (best) return asOpportunity(best);
	    return idleBest ? asIdleFallback(idleBest) : null;
	  }

  function scoreCoinOpportunity(coin) {
    const override = Number(coin?.opportunityScore ?? coin?.snapshotScore ?? coin?.fieldScore ?? NaN);
    if (Number.isFinite(override)) return override;
    const sticky = bot.lastTarget?.kind === 'coin'
      && String(bot.lastTarget.id) === String(coin.drop_id)
      && now() - bot.lastTargetAt < cfg.coinStickMs;
    return opportunityValueScoreCore(coin.amount, opportunityCoinStaminaCost(coin), {
        weight: cfg.coinOpportunityValue,
        distanceFloor: cfg.opportunityDistanceFloor,
        distanceScoreScale: cfg.opportunityDistanceScoreScale
      })
      + (sticky ? cfg.opportunityStickBonus : 0);
  }

  function opportunityAfkTargetId(target) {
    const id = target?.user_id ?? target?.id;
    return id === undefined || id === null || id === '' ? '' : String(id);
  }

  function targetStamina5sRemaining(target) {
    const value = Number(target?.stamina_5s_remaining_milli ?? target?.stamina5s ?? target?.stamina_5s ?? NaN);
    return Number.isFinite(value) ? value : null;
  }

  function opportunityAfkStaminaState() {
    if (!(bot.opportunityAfkStamina instanceof Map)) bot.opportunityAfkStamina = new Map();
    return bot.opportunityAfkStamina;
  }

  function opportunityAfkStaminaCooldownMs() {
    const value = Number(cfg.opportunityAfkStaminaCooldownMs ?? 60000);
    return Math.max(0, Number.isFinite(value) ? value : 60000);
  }

  function opportunityAfkStaminaDropThresholdMs() {
    const value = Number(cfg.opportunityAfkStaminaDropThresholdMs ?? 100);
    return Math.max(0, Number.isFinite(value) ? value : 100);
  }

  function updateOpportunityAfkStaminaObservations(targets, t = now()) {
    const state = opportunityAfkStaminaState();
    const cooldownMs = opportunityAfkStaminaCooldownMs();
    const dropThreshold = opportunityAfkStaminaDropThresholdMs();
    const observationGapMs = Math.max(1000, Number(cfg.activeSeenMs || 0) * 2, Number(cfg.tickMs || 0) * 8);
    for (const target of targets || []) {
      const id = opportunityAfkTargetId(target);
      if (!id) continue;
      const stamina5s = targetStamina5sRemaining(target);
      const previous = state.get(id) || {};
      const previousStamina = Number(previous.stamina5s);
      const previousSeenAt = Number(previous.lastSeenAt || 0);
      const continuous = previousSeenAt > 0 && t - previousSeenAt <= observationGapMs;
      let cooldownUntil = Math.max(0, Number(previous.cooldownUntil || 0));
      let consumedAt = Math.max(0, Number(previous.consumedAt || 0));
      if (Number.isFinite(stamina5s) && continuous && Number.isFinite(previousStamina) && stamina5s + dropThreshold < previousStamina) {
        cooldownUntil = Math.max(cooldownUntil, t + cooldownMs);
        consumedAt = t;
      }
      state.set(id, {
        stamina5s: Number.isFinite(stamina5s) ? stamina5s : (Number.isFinite(previousStamina) ? previousStamina : null),
        lastSeenAt: t,
        cooldownUntil,
        consumedAt
      });
    }
    const ttlMs = Math.max(300000, cooldownMs * 5);
    for (const [id, item] of state.entries()) {
      const lastSeenAt = Number(item?.lastSeenAt || 0);
      const cooldownUntil = Number(item?.cooldownUntil || 0);
      if (cooldownUntil <= t && lastSeenAt > 0 && t - lastSeenAt > ttlMs) state.delete(id);
    }
  }

  function opportunityAfkStaminaCooldownRemaining(target, t = now()) {
    const id = opportunityAfkTargetId(target);
    if (!id) return 0;
    const item = opportunityAfkStaminaState().get(id);
    return Math.max(0, Math.round(Number(item?.cooldownUntil || 0) - t));
  }

  function afkOpportunityBlockedByStaminaCooldown(target, t = now()) {
    if (!isAfkProfitTarget(target)) return false;
    const distance = Number(target?.distance ?? Infinity);
    if (Number.isFinite(distance) && distance <= Number(cfg.attackRange || 0)) return false;
    return opportunityAfkStaminaCooldownRemaining(target, t) > 0;
  }

  function scoreEnemyOpportunity(target) {
    if (isWhitelistedTarget(target)) return null;
    const afk = isAfkProfitTarget(target);
    const inRange = Number(target.distance || Infinity) <= (afk ? cfg.attackRange : cfg.attackEngageRange);
    if (afk && !inRange && afkOpportunityBlockedByStaminaCooldown(target)) return null;
    if (!afk && !inRange && Number(target.drop || 0) < cfg.attackApproachMinDrop) return null;
    const sticky = bot.lastTarget?.kind === 'enemy'
      && String(bot.lastTarget.id) === String(target.user_id)
      && now() - bot.lastTargetAt < cfg.targetStickMs;
    return opportunityValueScoreCore(target.drop, opportunityEnemyStaminaCost(target), {
        weight: afk ? cfg.coinOpportunityValue : cfg.dropOpportunityValue,
        distanceFloor: cfg.opportunityDistanceFloor,
        distanceScoreScale: cfg.opportunityDistanceScoreScale
      }) + (sticky ? cfg.opportunityStickBonus : 0);
  }


const {
  opportunityEffectiveStaminaCostCore,
  opportunityValueScoreCore,
  opportunityPriorityTierCore,
  mergeCoinRouteDisplayCore,
  uniqueVisibleRouteCoinsCore,
  buildCoinOpportunityCandidatesCore,
  buildEnemyOpportunityCandidatesCore,
  buildOpportunityCandidatesCore,
  bestCoinOpportunityScoreCore
} = require('./runtime/opportunity-candidates');

  function opportunityPriorityTier(item) {
    return opportunityPriorityTierCore(item, {
      visibleDistance: cfg.opportunityVisibleDistance,
      nearbyPriorityDistance: cfg.opportunityNearbyPriorityDistance
    });
  }

const {
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
  pickCoinRouteOpportunityCore
} = require('./runtime/coin-route');

	  function coinRouteCoreOptions(self = null) {
	    return {
	      dist,
	      moveStaminaCost: opportunityMoveStaminaCost,
	      pickupStaminaMs: cfg.opportunityCoinPickupStaminaMs,
	      sampleDistance: cfg.coinRouteLegSampleDistance,
	      threatDangerRadius: coinThreatDangerRadius,
	      coinBlockedByThreat,
	      clusterRadius: cfg.coinRouteClusterRadius,
	      maxPointsDense: cfg.coinRouteMaxPointsDense,
	      maxPointsMid: cfg.coinRouteMaxPointsMid,
	      maxPointsSparse: cfg.coinRouteMaxPointsSparse,
	      linkDistance: cfg.coinRouteLinkDistance,
	      maxLinkDistance: cfg.coinRouteMaxLinkDistance,
	      coinOpportunityValue: cfg.coinOpportunityValue,
	      valueScore: (value, staminaCost, weight = cfg.coinOpportunityValue) => opportunityValueScoreCore(value, staminaCost, {
	        weight,
	        distanceFloor: cfg.opportunityDistanceFloor,
	        distanceScoreScale: cfg.opportunityDistanceScoreScale
	      }),
	      staminaAffordable: staminaCost => opportunityStaminaAffordable(self, staminaCost),
	      recordDiagnostic: (coin, reason, detail) => recordCoinFilterDiagnostic(coin, reason, detail),
	      nearbyFirstCoinDistance: cfg.coinRouteNearbyFirstCoinDistance,
	      firstCoinDistanceRatio: cfg.coinRouteFirstCoinDistanceRatio,
	      firstCoinDistanceSlack: cfg.coinRouteFirstCoinDistanceSlack,
	      choiceType: opportunityChoiceType,
	      choiceId: opportunityChoiceId,
	      heldMinOverlap: cfg.coinRouteHeldMinOverlap,
	      switchMargin: cfg.coinRouteSwitchMargin,
	      opportunitySwitchMargin: cfg.opportunitySwitchMargin,
	      switchRelativeMargin: cfg.coinRouteSwitchRelativeMargin,
	      opportunitySwitchRelativeMargin: cfg.opportunitySwitchRelativeMargin,
	      maxDistance: Math.max(0, Number(cfg.coinRouteMaxDistance || cfg.globalCoinMaxDistance || 0)),
	      poolLimit: cfg.coinRoutePoolLimit,
	      anchorLimit: cfg.coinRouteAnchorLimit,
	      safeCoinCandidates,
	      isSnapshotOnlyCoin
	    };
	  }

  function currentHeldCoinRouteChoice(t = now()) {
    const choice = bot.opportunityChoice;
    if (!choice || opportunityChoiceType(choice) !== 'coin') return null;
    if (t >= Number(choice.until || 0)) return null;
    const id = opportunityChoiceId(choice);
    if (!id && id !== '0') return null;
    if (String(choice.reason || '') !== 'best-opportunity-coin-route' && !coinRouteIdsFrom(choice).length) return null;
    return choice;
  }

  function currentHeldCoinChoice(t = now()) {
    const choice = bot.opportunityChoice;
    if (!choice || opportunityChoiceType(choice) !== 'coin') return null;
    if (t >= Number(choice.until || 0)) return null;
    const id = opportunityChoiceId(choice);
    if (!id && id !== '0') return null;
    return choice;
  }
	  function opportunityCandidateCoreOptions(self = null) {
	    return {
	      safeCoinCandidates,
	      coinStaminaCost: opportunityCoinStaminaCost,
	      coinStaminaAffordable: (coin, staminaCost = opportunityCoinStaminaCost(coin)) => coinStaminaAffordableWithDiagnostic(self, coin, staminaCost),
	      scoreCoinOpportunity,
	      snapshotCoinNavigationReason: coin => snapshotCoinNavigationReasonCore(coin, coinTargetCoreOptions()),
	      maxCoinDistance: cfg.coinMaxDistance,
	      routeMaxDistance: cfg.coinRouteMaxDistance,
	      scoreEnemyOpportunity,
	      enemyStaminaCost: opportunityEnemyStaminaCost,
	      opportunityStaminaAffordable: staminaCost => opportunityStaminaAffordable(self, staminaCost),
	      isAfkProfitTarget,
	      attackRange: cfg.attackRange,
	      attackEngageRange: cfg.attackEngageRange,
	      priorityTier: opportunityPriorityTier,
	      visibleDistance: cfg.opportunityVisibleDistance,
	      nearbyPriorityDistance: cfg.opportunityNearbyPriorityDistance
	    };
	  }

  function pickProfitableCombatTarget(self, combatTargets, bullets, coinGroups, activeThreats) {
    if (!isFullHp(self)) return null;
    const target = pickCombatTarget(self, combatTargets, bullets, { mode: 'profit' });
    if (!target) return null;
    const targetScore = scoreEnemyOpportunity(target);
    if (targetScore === null) return null;
    if (!opportunityStaminaAffordable(self, opportunityEnemyStaminaCost(target))) return null;
    const coinScore = (() => {
      const route = pickCoinRouteOpportunityCore(self, uniqueVisibleRouteCoinsCore(coinGroups, { isSnapshotOnlyCoin, coinKey: coinRouteKey }), activeThreats, {
      ...coinRouteCoreOptions(self),
      heldChoice: currentHeldCoinChoice(),
      heldRouteChoice: currentHeldCoinRouteChoice()
    });
      return bestCoinOpportunityScoreCore(self, coinGroups, activeThreats, route, opportunityCandidateCoreOptions(self));
    })();
    if (targetScore < coinScore) return null;
    return {
      ...target,
      combatIntent: 'profit',
      combatOpportunityScore: Math.round(targetScore),
      competingCoinScore: Number.isFinite(coinScore) ? Math.round(coinScore) : null
    };
  }



const {
  postAttackVisibleCoinExistsCore,
  resolvedRecentPostAttackDropsCore,
  buildPostAttackDropCoinCandidateCore,
  pickPostAttackDropCoinCore,
  pickPostAttackDropWaitTargetCore
} = require('./runtime/post-attack-drop');

  function attackEntityMatches(entity, attack) {
    const id = String(attack?.id ?? '');
    const name = String(attack?.name || '');
    if (id && String(entity?.user_id ?? entity?.id ?? '') === id) return true;
    return Boolean(name && String(entity?.name || '') === name);
  }

  function recentAttackTargetStillAttackable(attack, entities) {
    const target = (entities || []).find(entity => entityFreshEnoughForOffense(entity) && attackEntityMatches(entity, attack));
    if (!target || !isAlive(target)) return false;
    const hp = knownHpValue(target);
    if (hp !== null && hp <= 0) return false;
    if (isWhitelistedTarget(target)) return false;
    if (isCurrentlyActive(target)) return false;
    if (isInvulnerable(target)) return false;
    return dropValue(target) > 0;
  }

  function postAttackDropResolvedAt(attack, entities, t = Date.now()) {
    if (!attack || recentAttackTargetStillAttackable(attack, entities)) {
      if (attack) attack.postAttackDropResolvedAt = 0;
      return 0;
    }
    const existing = Number(attack.postAttackDropResolvedAt || 0);
    if (existing > 0) return existing;
    attack.postAttackDropResolvedAt = t;
    return t;
  }

  function buildPostAttackDropWaitAction(self, target) {
    const dir = (() => {
      const coinDirectionSelf = self;
      const coinDirectionTarget = target;
      const coinDirectionDxRaw = Number(coinDirectionTarget.x) - Number(coinDirectionSelf.x);
      const coinDirectionDyRaw = Number(coinDirectionTarget.y) - Number(coinDirectionSelf.y);
      const coinDirectionDistance = hypot(coinDirectionDxRaw, coinDirectionDyRaw);
      const coinDirectionAt = now();
      const coinDirectionId = String(coinDirectionTarget.drop_id ?? coinDirectionTarget.id ?? '');
      const coinDirectionResult = coinDirectionToCore(coinDirectionSelf, coinDirectionTarget, coinMotionCoreOptions(cfg.patrolPrecisionTolerance, {
        nowMs: coinDirectionAt,
        lock: bot.coinApproachLock,
        pickupFailureCount: coinPickupFailureCount(coinDirectionId, coinDirectionAt),
        pickupAttemptSlowCount: coinPickupAttemptSlowCount(coinDirectionId, coinDirectionDistance, coinDirectionAt)
      }));
      applyCoinApproachLockUpdate(coinDirectionResult.lockUpdate);
      return coinDirectionResult.direction;
    })();
    return {
      kind: 'patrol',
      reason: 'post-attack-drop-wait-position',
      dx: dir.dx,
      dy: dir.dy,
      postAttackTarget: {
        id: target.id,
        name: target.name || '',
        x: target.x,
        y: target.y,
        drop: target.drop,
        playerCategory: target.playerCategory || (target.afk === false ? 'active' : 'afk'),
        afk: target.afk !== false,
        active: target.active === true || target.playerCategory === 'active',
        combat: Boolean(target.combat),
        combatIntent: target.combatIntent || '',
        mode: target.mode || '',
        distance: Math.round(dir.distance),
        ageMs: Math.max(0, Math.round(Date.now() - Number(target.at || Date.now()))),
        resolvedAgeMs: Math.max(0, Math.round(Date.now() - Number(target.postAttackDropResolvedAt || Date.now()))),
        currentlyActive: Boolean(target.currentlyActive),
        moving: Boolean(target.moving),
        firing: Boolean(target.firing),
        battleStartedAt: target.battleStartedAt || target.at || 0,
        battleStaminaSpentStartMs: Number.isFinite(Number(target.battleStaminaSpentStartMs)) ? Math.max(0, Math.round(Number(target.battleStaminaSpentStartMs))) : null,
        staminaSpentMs: Number.isFinite(Number(target.staminaSpentMs)) ? Math.max(0, Math.round(Number(target.staminaSpentMs))) : null
      },
      ...coinMotionMetaCore(dir)
    };
  }



  function buildCoinAction(self, coin, reason, kind = null) {
    const dir = (() => {
      const coinDirectionSelf = self;
      const coinDirectionTarget = coin;
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
    const staminaCost = opportunityCoinStaminaCost(coin);
    const routeMeta = coinRouteActionMetaCore(coin?.coinRoute || null, dir.distance);
    return {
      kind: kind || (coin.distance <= cfg.coinMaxDistance ? 'coin' : 'seek-coin'),
      reason,
      target: {
        id: coin.drop_id,
        x: coin.x,
        y: coin.y,
        amount: coin.amount,
        distance: Math.round(dir.distance),
        fieldMembers: coin.snapshotMembers ?? coin.fieldMembers ?? null,
        fieldAmount: coin.snapshotAmount ?? coin.fieldAmount ?? null,
        snapshotAgeMs: Number.isFinite(Number(coin.snapshotAgeMs)) ? Math.round(Number(coin.snapshotAgeMs)) : null,
        coinRoute: routeMeta
      },
      dx: dir.dx,
      dy: dir.dy,
      ...coinMotionMetaCore(dir),
      score: Math.round(scoreCoinOpportunity(coin)),
      staminaCost: Math.round(staminaCost),
      coinRoute: routeMeta
    };
  }

  function buildEnemyAction(self, target, reason = '') {
    if (isWhitelistedTarget(target)) return { kind: 'wait', reason: 'target-whitelisted', dx: 0, dy: 0 };
    const dir = directionTo(self, target);
    const afk = isAfkProfitTarget(target);
    const inRange = Number(dir.distance || Infinity) <= (afk ? cfg.attackRange : cfg.attackEngageRange);
    const staminaCost = opportunityEnemyStaminaCost(target);
    return {
      kind: inRange ? 'attack' : 'seek-enemy',
      reason: reason || (afk
        ? (inRange ? 'best-opportunity-afk-drop-target' : 'approach-afk-drop-target')
        : (inRange ? 'best-opportunity-drop-target' : 'approach-profitable-drop-target')),
      target: {
        id: target.user_id,
        name: target.name,
        x: target.x,
        y: target.y,
        drop: target.drop,
        distance: Math.round(dir.distance),
        hp: target.hp,
        afk,
        mode: target.current_join_mode || ''
      },
      dx: inRange ? 0 : dir.dx,
      dy: inRange ? 0 : dir.dy,
      shoot: inRange,
      score: Math.round(scoreEnemyOpportunity(target) || 0),
      staminaCost: Math.round(staminaCost),
      estimatedShots: estimatedKillShots(target)
    };
  }



const {
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
  rememberOpportunityChoiceCore
} = require('./runtime/opportunity-choice');

			  function opportunityChoiceCoreOptions(extra = {}) {
			    return {
			      dist,
			      sameCoinRadius: opportunitySameCoinRadius(),
			      highValueCoinPriorityAmount: highValueCoinPriorityAmount(),
			      switchMargin: cfg.opportunitySwitchMargin,
			      switchRelativeMargin: cfg.opportunitySwitchRelativeMargin,
			      switchHoldMs: cfg.opportunitySwitchHoldMs,
			      oscillationSwitchLimit: cfg.opportunityOscillationSwitchLimit,
			      nowMs: now(),
			      ...extra
			    };
			  }

		  function resetOpportunitySwitchLock() {
		    bot.opportunitySwitchLock = null;
		  }

		  function opportunitySameCoinRadius() {
		    return Math.max(0, Number(cfg.opportunitySameCoinRadius || cfg.coinCollectedPruneRadius || 900));
		  }

			  function currentVisibleCoinListForMissingHold() {
			    if (typeof getNativeCoinSources !== 'function') return null;
			    let sources = [];
			    try {
			      sources = getNativeCoinSources();
			    } catch (_) {
			      return null;
			    }
			    if (!Array.isArray(sources) || !sources.length) return null;
			    const visibleSources = sources.filter(source => {
			      if (!source || !Array.isArray(source.list)) return false;
			      const label = String(source.label || '').toLowerCase();
			      return !label.includes('snapshot');
			    });
			    if (!visibleSources.length) return null;
			    const coins = [];
			    for (const source of visibleSources) {
			      for (const raw of source.list) {
			        const coin = normalizeCoinDrop(raw, 'native');
			        if (coin) coins.push(coin);
			      }
			    }
			    return coins;
			  }

			  function visibleCoinSourcesConfirmTargetMissing(target) {
			    const visibleCoins = currentVisibleCoinListForMissingHold();
			    if (!Array.isArray(visibleCoins)) return false;
			    return !visibleCoins.some(coin => coinMatchesTrackedTargetCore(coin, target, coinTargetCoreOptions()));
			  }

			  function clearMissingVisibleCoinTarget(choice, coin, reason, t) {
			    const id = opportunityChoiceId(choice);
			    const idText = id || id === '0' ? String(id) : '';
			    if (coin) recordCoinFilterDiagnostic(coin, 'visible-missing');
			    if (idText) {
			      const ignoreMs = Math.max(0, Number(cfg.coinCollectedIgnoreMs || 0));
			      if (ignoreMs > 0) bot.ignoredCoins.set(idText, t + ignoreMs);
			      bot.coinAttempts.delete(idText);
			    }
			    if (!idText || (bot.lastTarget?.kind === 'coin' && String(bot.lastTarget.id) === idText)) {
			      bot.lastTarget = null;
			      bot.lastTargetAt = 0;
			    }
			    if (!idText || (bot.coinProgress?.id && String(bot.coinProgress.id) === idText)) bot.coinProgress = null;
			    if (!idText || bot.coinApproachLock?.id === idText) bot.coinApproachLock = null;
			    if (shouldClearOpportunityChoiceCore(bot.opportunityChoice, 'coin', idText || null)) {
        bot.opportunityChoice = null;
        resetOpportunitySwitchLock();
      }
			    bot.lastCoinClearReason = reason;
			    bot.lastMissingVisibleCoin = {
			      id: idText,
			      reason,
			      amount: Number.isFinite(Number(coin?.amount)) ? Math.round(Number(coin.amount)) : null,
			      distance: Number.isFinite(Number(coin?.distance)) ? Math.round(Number(coin.distance)) : null,
			      at: Date.now()
			    };
			  }


const { pickBestOpportunityCore } = require('./runtime/opportunity-pick');

const { patrolDirectionCore } = require('./runtime/patrol');

const { shouldClearOpportunityChoiceCore } = require('./runtime/opportunity-clear');


const {
  coinFailureIgnoreCore,
  staleCoinEscapeDirectionCore,
  coinProgressIntentCore,
  coinAttemptExpiredCore,
  updateCoinAttemptCore,
  updateCoinProgressRecordCore,
  buildIgnoredCoinProgressCore,
  buildIgnoredCoinPatrolActionCore,
  coinIgnoreCleanupIntentCore
} = require('./runtime/coin-progress');

  function coinProgressCoreOptions(extra = {}) {
    return {
      coinIgnoreMs: cfg.coinIgnoreMs,
      coinProgressMinGain: cfg.coinProgressMinGain,
      coinNearStuckResetGain: cfg.coinNearStuckResetGain,
      closeCoinStuckDistance: cfg.closeCoinStuckDistance,
      nearCoinStuckDistance: cfg.nearCoinStuckDistance,
      closeCoinStuckMs: cfg.closeCoinStuckMs,
      nearCoinStuckMs: cfg.nearCoinStuckMs,
      coinNoProgressMs: cfg.coinNoProgressMs,
      coinFailureDecayMs: cfg.coinFailureDecayMs,
      coinCloseFailureIgnoreMs: cfg.coinCloseFailureIgnoreMs,
      coinNearFailureIgnoreMs: cfg.coinNearFailureIgnoreMs,
      coinNoProgressIgnoreMs: cfg.coinNoProgressIgnoreMs,
      coinFailureMaxIgnoreMs: cfg.coinFailureMaxIgnoreMs,
      staleCoinEscapeMs: cfg.staleCoinEscapeMs,
      ...extra
    };
  }


const {
  actionPriorityBand,
  actionFocusTargetType,
  actionFocusId,
  actionFocusSummary
} = require('./runtime/action-priority');
const {
  actionSwitchPairKey,
  buildPreviousDecisionSummary,
  recordActionSwitchDiagnosticsCore
} = require('./runtime/action-switch-diagnostics');
const {
  finalActionBandRank,
  finalActionReusable,
  shouldHoldPreviousFinalAction,
  applyFinalActionArbitrationCore
} = require('./runtime/action-arbitration');

  function targetSwitchHistoryLimit() {
    return Math.max(4, Math.round(Number(cfg.targetSwitchDiagnosticsHistoryLimit || 24) || 24));
  }

  function targetSwitchOscillationWindowMs() {
    return Math.max(1000, Math.round(Number(cfg.targetSwitchOscillationWindowMs || 10000) || 10000));
  }

  function roundedNullable(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(number) : null;
  }

  function ensureTargetSwitchDiagnostics() {
    if (!bot.targetSwitchDiagnostics || typeof bot.targetSwitchDiagnostics !== 'object') {
      bot.targetSwitchDiagnostics = { lastFocus: null, lastTargetFocus: null, lastSwitch: null, events: [] };
    }
    if (!Array.isArray(bot.targetSwitchDiagnostics.events)) bot.targetSwitchDiagnostics.events = [];
    return bot.targetSwitchDiagnostics;
  }

  function finalActionArbitrationHoldMs() {
    return Math.max(0, Math.round(Number(cfg.finalActionArbitrationHoldMs || 0) || 0));
  }

  function finalActionArbitrationHistoryLimit() {
    return Math.max(4, Math.round(Number(cfg.finalActionArbitrationHistoryLimit || 24) || 24));
  }

  function ensureFinalActionArbitration() {
    if (!bot.finalActionArbitration || typeof bot.finalActionArbitration !== 'object') {
      bot.finalActionArbitration = { lastAction: null, lastFocus: null, lastSelectedAt: 0, lastOverride: null, history: [] };
    }
    if (!Array.isArray(bot.finalActionArbitration.history)) bot.finalActionArbitration.history = [];
    return bot.finalActionArbitration;
  }


const {
  coinTargetKeyCore,
  coinTargetDistance,
  coinMatchesTrackedTargetCore,
  trackedCoinTargetForCollectionCore,
  buildNativeCoinSnapshotCore,
  pointToSegmentDistanceCore,
  pickIncidentalCoinPickupsCore,
  snapshotCoinWorthLongTravelCore,
  snapshotCoinNavigationReasonCore
} = require('./runtime/coin-target');

  function setLastTarget(kind, id) {
    if (!id && id !== 0) return;
    if (!bot.lastTarget || bot.lastTarget.kind !== kind || String(bot.lastTarget.id) !== String(id)) {
      bot.lastTarget = { kind, id };
    }
    bot.lastTargetAt = now();
  }

  function clearCoinTracking(reason = '') {
    bot.coinProgress = null;
    bot.coinAttempts.clear();
    bot.coinApproachLock = null;
    bot.staleCoinEscape = null;
	    if (bot.lastTarget?.kind === 'coin') {
	      bot.lastTarget = null;
	      bot.lastTargetAt = 0;
	    }
	    if (shouldClearOpportunityChoiceCore(bot.opportunityChoice, 'coin', null)) {
        bot.opportunityChoice = null;
        resetOpportunitySwitchLock();
      }
	    bot.lastCoinClearReason = reason;
  }

  function coinTargetCoreOptions(extra = {}) {
    return {
      dist,
      coinCollectedPruneRadius: cfg.coinCollectedPruneRadius,
      coinCollectedConfirmDistance: cfg.coinCollectedConfirmDistance,
      incidentalCoinPickupMemoryMs: cfg.incidentalCoinPickupMemoryMs,
      snapshotCoinClusterMinCoins: cfg.snapshotCoinClusterMinCoins,
      snapshotSingleCoinMaxDistance: cfg.snapshotSingleCoinMaxDistance,
      snapshotSingleCoinDistancePerAmount: cfg.snapshotSingleCoinDistancePerAmount,
      globalCoinMaxDistance: cfg.globalCoinMaxDistance,
      coinMaxDistance: cfg.coinMaxDistance,
      isSnapshotOnlyCoin,
      ...extra
    };
  }

  function recordIncidentalCoinPickups(self, currentSummary, previousSelf, previousCoins) {
    const previousSnapshot = Array.isArray(bot.lastNativeCoinSnapshot) ? bot.lastNativeCoinSnapshot : [];
    const currentSnapshot = (() => {
      const nativeCoinList = getNativeCoinList();
      if (!Array.isArray(nativeCoinList)) return null;
      const nativeSnapshotCoins = nativeCoinList
        .map(coin => normalizeCoinDrop(coin, 'native'))
        .filter(Boolean);
      return buildNativeCoinSnapshotCore(nativeSnapshotCoins, coinTargetCoreOptions({ nowMs: Date.now() }));
    })();
    if (!Array.isArray(currentSnapshot)) return false;
    const t = Date.now();
    let recorded = false;
    const incidentalPickups = pickIncidentalCoinPickupsCore(
      previousSnapshot,
      currentSnapshot,
      currentSummary,
      previousSelf,
      coinTargetCoreOptions({ nowMs: t })
    );
    for (const pickup of incidentalPickups) {
      const coin = pickup.coin;
      const currentDistance = pickup.currentDistance;
      const sessionRecorded = (() => {
      const sessionTarget = {
        id: coin.id || coin.key,
        amount: coin.amount,
        x: coin.x,
        y: coin.y,
        distance: currentDistance
      };
      const sessionAmount = coin.amount;
      const sessionSummary = currentSummary;
      const sessionPreviousCoins = previousCoins;
      const sessionReason = 'incidental-coin-disappeared';
      const sessionValue = Math.max(0, Math.round(Number(sessionAmount || 0)));
      if (!sessionValue) return false;
      updateSessionStats(sessionSummary);
      const session = bot.session || (bot.session = {});
      const sessionAt = Date.now();
      const sessionKey = coinTargetKeyCore(sessionTarget);
      if (!Array.isArray(session.coinPickupKeys)) session.coinPickupKeys = [];
      session.coinPickupKeys = session.coinPickupKeys
        .filter(item => item && sessionAt - Number(item.at || 0) <= 60000)
        .slice(-80);
      if (sessionKey && session.coinPickupKeys.some(item => String(item.key || '') === sessionKey && sessionAt - Number(item.at || 0) <= 5000)) {
        return false;
      }
      if (sessionKey) pushBounded(session.coinPickupKeys, { key: sessionKey, at: sessionAt, amount: sessionValue, reason: sessionReason || '' }, 80);
      (() => {
        const dropMatchedKill = buildDropMatchedKillCore(sessionTarget, sessionValue, sessionSummary, sessionReason, {
          nowMs: Date.now(),
          seenKillKeys: bot.seenKillKeys,
          sessionId: bot.session?.importantSessionId || '',
          sessionStaminaSpentMs: importantSessionStaminaSpentMs(bot.session),
          coinTargetKey: coinTargetKeyCore
        });
        return dropMatchedKill ? recordKillHistoryItem(dropMatchedKill.kill, dropMatchedKill.seenKey) : null;
      })();
      session.coinPickupTotal = Math.max(0, Number(session.coinPickupTotal || 0) || 0) + sessionValue;
      const sessionCoinDiff = Math.max(0, Math.round(Number(sessionSummary?.coins || 0) - Number(sessionPreviousCoins || 0)));
      session.coinsGained = Math.max(
        Math.max(0, Number(session.coinsGained || 0) || 0),
        Math.max(0, Number(session.coinPickupTotal || 0) || 0),
        sessionCoinDiff
      );
      upsertImportantSessionRecord(session, sessionSummary, { at: sessionAt });
      return true;
    })();
      recorded = Boolean(recorded || sessionRecorded);
      if (sessionRecorded) {
        bot.lastCoinCollected = {
          id: coin.id || coin.key,
          amount: coin.amount,
          distance: Number.isFinite(currentDistance) ? Math.round(currentDistance) : null,
          previousCoins,
          currentCoins: Number(currentSummary?.coins || 0),
          pruned: 0,
          confirmReason: 'incidental-coin-disappeared',
          sessionRecorded,
          at: t
        };
      }
    }
    (() => {
      const rememberedSnapshot = currentSnapshot;
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
    return recorded;
  }

  function markCoinCollected(self, currentSummary, previousCoins) {
    const target = trackedCoinTargetForCollectionCore({
      lastDecision: bot.lastDecision,
      lastTarget: bot.lastTarget,
      coinProgress: bot.coinProgress
    }, self, coinTargetCoreOptions());
    if (!target) return false;
    const id = target.id === undefined || target.id === null ? '' : String(target.id);
    const distance = Number(target.distance);
    if (Number.isFinite(distance) && distance > Number(cfg.coinCollectedConfirmDistance || 0)) return false;
    const currentCoins = Number(currentSummary?.coins || 0);
    const coinDelta = Math.max(0, Math.round(currentCoins - Number(previousCoins || 0)));
    const visible = (() => {
      const visibleTarget = target;
      const nativeCoinList = getNativeCoinList();
      if (!Array.isArray(nativeCoinList)) return null;
      return nativeCoinList
        .map(coin => normalizeCoinDrop(coin, 'native'))
        .filter(Boolean)
        .some(coin => coinMatchesTrackedTargetCore(coin, visibleTarget, coinTargetCoreOptions()));
    })();
    const confirmed = coinDelta > 0 || visible === false;
    if (!confirmed) return false;
    const amount = Math.max(0, Math.round(Number(target.amount || 0))) || coinDelta;
    if (!amount) return false;
    const t = now();
    if (id) {
      bot.ignoredCoins.set(id, t + Number(cfg.coinCollectedIgnoreMs || 0));
      bot.coinAttempts.delete(id);
    }
    const pruned = (() => {
      const pruneTarget = target;
      const pruneId = pruneTarget?.id === undefined || pruneTarget?.id === null ? '' : String(pruneTarget.id);
      const pruneX = Number(pruneTarget?.x);
      const pruneY = Number(pruneTarget?.y);
      const pruneHasPoint = Number.isFinite(pruneX) && Number.isFinite(pruneY);
      if (!pruneId && !pruneHasPoint) return 0;
      const beforePrune = arrayCount(bot.globalState.coinDrops);
      bot.globalState.coinDrops = (Array.isArray(bot.globalState.coinDrops) ? bot.globalState.coinDrops : []).filter(raw => {
        const coin = normalizeCoinDrop(raw, 'snapshot');
        if (!coin) return false;
        if (pruneId && String(coin.drop_id) === pruneId) return false;
        if (pruneHasPoint && dist({ x: pruneX, y: pruneY }, coin) <= Number(cfg.coinCollectedPruneRadius || 0)) return false;
        return true;
      });
      return beforePrune - arrayCount(bot.globalState.coinDrops);
    })();
    const confirmReason = coinDelta > 0 ? 'coins-increased' : 'coin-disappeared';
    const sessionRecorded = (() => {
      const sessionTarget = target;
      const sessionAmount = amount;
      const sessionSummary = currentSummary;
      const sessionPreviousCoins = previousCoins;
      const sessionReason = confirmReason;
      const sessionValue = Math.max(0, Math.round(Number(sessionAmount || 0)));
      if (!sessionValue) return false;
      updateSessionStats(sessionSummary);
      const session = bot.session || (bot.session = {});
      const sessionAt = Date.now();
      const sessionKey = coinTargetKeyCore(sessionTarget);
      if (!Array.isArray(session.coinPickupKeys)) session.coinPickupKeys = [];
      session.coinPickupKeys = session.coinPickupKeys
        .filter(item => item && sessionAt - Number(item.at || 0) <= 60000)
        .slice(-80);
      if (sessionKey && session.coinPickupKeys.some(item => String(item.key || '') === sessionKey && sessionAt - Number(item.at || 0) <= 5000)) {
        return false;
      }
      if (sessionKey) pushBounded(session.coinPickupKeys, { key: sessionKey, at: sessionAt, amount: sessionValue, reason: sessionReason || '' }, 80);
      (() => {
        const dropMatchedKill = buildDropMatchedKillCore(sessionTarget, sessionValue, sessionSummary, sessionReason, {
          nowMs: Date.now(),
          seenKillKeys: bot.seenKillKeys,
          sessionId: bot.session?.importantSessionId || '',
          sessionStaminaSpentMs: importantSessionStaminaSpentMs(bot.session),
          coinTargetKey: coinTargetKeyCore
        });
        return dropMatchedKill ? recordKillHistoryItem(dropMatchedKill.kill, dropMatchedKill.seenKey) : null;
      })();
      session.coinPickupTotal = Math.max(0, Number(session.coinPickupTotal || 0) || 0) + sessionValue;
      const sessionCoinDiff = Math.max(0, Math.round(Number(sessionSummary?.coins || 0) - Number(sessionPreviousCoins || 0)));
      session.coinsGained = Math.max(
        Math.max(0, Number(session.coinsGained || 0) || 0),
        Math.max(0, Number(session.coinPickupTotal || 0) || 0),
        sessionCoinDiff
      );
      upsertImportantSessionRecord(session, sessionSummary, { at: sessionAt });
      return true;
    })();
    bot.lastCoinCollected = {
      id,
      amount,
      distance: Number.isFinite(distance) ? Math.round(distance) : null,
      previousCoins,
      currentCoins,
      pruned,
      confirmReason,
      sessionRecorded,
      at: Date.now()
    };
    clearCoinTracking(confirmReason);
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
    return true;
  }


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
	      action = attachCoinDiagnostics((() => {
        const progressAction = action;
        const progressSelf = self;
        const progressAt = now();
        const progressOptions = coinProgressCoreOptions();
        for (const [progressAttemptId, progressAttempt] of bot.coinAttempts.entries()) {
          if (coinAttemptExpiredCore(progressAttempt, progressAt, progressOptions)) {
            bot.coinAttempts.delete(progressAttemptId);
          }
        }

        if (!coinProgressIntentCore(progressAction)) {
          bot.coinProgress = null;
          if (!bot.staleCoinEscape || progressAt >= Number(bot.staleCoinEscape.until || 0)) bot.coinApproachLock = null;
          return progressAction;
        }

        const progressAttemptResult = updateCoinAttemptCore(bot.coinAttempts.get(String(progressAction.target.id)), progressAction, progressAt, progressOptions);
        const progressId = progressAttemptResult.id;
        const progressDistance = progressAttemptResult.distance;
        const progressAttemptRecord = progressAttemptResult.attempt;
        bot.coinAttempts.set(progressId, progressAttemptRecord);

        const progressCloseStuck = progressAttemptResult.closeStuck;
        const progressNearStuck = progressAttemptResult.nearStuck;
        if (progressCloseStuck || progressNearStuck) {
          const progressFailureResult = coinFailureIgnoreCore(bot.coinFailures.get(progressId) || {}, progressCloseStuck ? 'close' : 'near', progressAt, progressOptions);
          bot.coinFailures.set(progressId, {
            count: progressFailureResult.count,
            reason: progressFailureResult.reason,
            lastAt: progressFailureResult.lastAt,
            ignoreUntil: progressFailureResult.ignoreUntil
          });
          bot.ignoredCoins.set(progressId, progressFailureResult.ignoreUntil);
          const progressFailure = {
            count: progressFailureResult.count,
            ignoreMs: progressFailureResult.ignoreMs,
            ignoreUntil: progressFailureResult.ignoreUntil
          };
          bot.coinAttempts.delete(progressId);
          bot.coinProgress = buildIgnoredCoinProgressCore(progressId, progressAttemptRecord, progressDistance, progressAt, progressFailure.ignoreUntil, 'stuck');
          const progressCleanup = coinIgnoreCleanupIntentCore(bot.lastTarget, bot.coinApproachLock, progressId);
          if (progressCleanup.clearLastTarget) {
            bot.lastTarget = null;
            bot.lastTargetAt = 0;
          }
          if (shouldClearOpportunityChoiceCore(bot.opportunityChoice, 'coin', progressId)) {
        bot.opportunityChoice = null;
        resetOpportunitySwitchLock();
      }
          if (progressCleanup.clearCoinApproachLock) bot.coinApproachLock = null;
          const progressEscapeResult = staleCoinEscapeDirectionCore(progressAction, progressSelf, progressAt, progressOptions);
          bot.staleCoinEscape = progressEscapeResult.state;
          const progressEscape = { dx: progressEscapeResult.dx, dy: progressEscapeResult.dy };
          return buildIgnoredCoinPatrolActionCore(
            progressAction,
            progressId,
            progressDistance,
            progressAttemptRecord,
            progressFailure,
            progressEscape,
            progressAt,
            progressCloseStuck ? 'ignore-close-stale-coin' : 'ignore-near-stale-coin',
            true
          );
        }

        const previousProgress = bot.coinProgress;
        const progressResult = updateCoinProgressRecordCore(previousProgress, progressAttemptRecord, progressDistance, progressAt, progressOptions);
        bot.coinProgress = progressResult.progress;
        if (!progressResult.stale) {
          return progressAction;
        }

        const staleFailureResult = coinFailureIgnoreCore(bot.coinFailures.get(progressId) || {}, 'progress', progressAt, progressOptions);
        bot.coinFailures.set(progressId, {
          count: staleFailureResult.count,
          reason: staleFailureResult.reason,
          lastAt: staleFailureResult.lastAt,
          ignoreUntil: staleFailureResult.ignoreUntil
        });
        bot.ignoredCoins.set(progressId, staleFailureResult.ignoreUntil);
        const staleFailure = {
          count: staleFailureResult.count,
          ignoreMs: staleFailureResult.ignoreMs,
          ignoreUntil: staleFailureResult.ignoreUntil
        };
        bot.coinAttempts.delete(progressId);
        bot.coinProgress = buildIgnoredCoinProgressCore(progressId, bot.coinProgress, progressDistance, progressAt, staleFailure.ignoreUntil, 'progress');
        const staleCleanup = coinIgnoreCleanupIntentCore(bot.lastTarget, bot.coinApproachLock, progressId);
        if (staleCleanup.clearLastTarget) {
          bot.lastTarget = null;
          bot.lastTargetAt = 0;
        }
        if (shouldClearOpportunityChoiceCore(bot.opportunityChoice, 'coin', progressId)) {
        bot.opportunityChoice = null;
        resetOpportunitySwitchLock();
      }
        if (staleCleanup.clearCoinApproachLock) bot.coinApproachLock = null;
        const staleEscapeResult = staleCoinEscapeDirectionCore(progressAction, progressSelf, progressAt, progressOptions);
        bot.staleCoinEscape = staleEscapeResult.state;
        const staleEscape = { dx: staleEscapeResult.dx, dy: staleEscapeResult.dy };
        return buildIgnoredCoinPatrolActionCore(
          progressAction,
          progressId,
          progressDistance,
          previousProgress,
          staleFailure,
          staleEscape,
          progressAt,
          'ignore-stale-coin-no-progress'
        );
      })());
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
	      action = (() => {
        const finalActionState = ensureFinalActionArbitration();
        return applyFinalActionArbitrationCore(action, finalActionState, {
          source: source,
          holdMs: finalActionArbitrationHoldMs(),
          historyLimit: finalActionArbitrationHistoryLimit(),
          clone: safeJsonClone
        }).action;
      })();
	      action = (() => {
        const targetSwitchState = ensureTargetSwitchDiagnostics();
        return recordActionSwitchDiagnosticsCore(action, targetSwitchState, {
          source: source,
          tickCount: bot.tickCount,
          previousDecision: bot.lastDecision,
          historyLimit: targetSwitchHistoryLimit(),
          oscillationWindowMs: targetSwitchOscillationWindowMs(),
          clone: safeJsonClone
        }).action;
      })();
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
