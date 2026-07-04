'use strict';

function tickSource(options = {}) {
  const clearPrelude = options.bundledRuntime
    ? "  const { clearEnemyReloginHoldBoundCore: clearEnemyReloginHoldForTickBoundCore, clearOfflineReloginHoldBoundCore: clearOfflineReloginHoldForTickBoundCore } = require('./src/browser/runtime/exit-relogin');\n\n"
    : '';
  const clearEnemyOnlineRestore = options.bundledRuntime
    ? "clearEnemyReloginHoldForTickBoundCore(bot, localStorage, 'online self restored during enemy hold', { now: Date.now, activeEnemyLeaveDetail, writePersistentPendingExitState, clearPersistentPendingExitState, clearExitHoldDetail, clearPersistentExitState, loginSuppressKey: LOGIN_SUPPRESS_KEY, loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY, enemyLeaveStateKey: ENEMY_LEAVE_STATE_KEY })"
    : "clearEnemyReloginHold('online self restored during enemy hold')";
  const clearOfflineOnlineRestore = options.bundledRuntime
    ? "clearOfflineReloginHoldForTickBoundCore(bot, localStorage, 'online self restored during offline hold', { now: Date.now, writePersistentPendingExitState, clearPersistentPendingExitState, clearPersistentExitState, loginSuppressKey: LOGIN_SUPPRESS_KEY, loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY, offlineLeaveStateKey: OFFLINE_LEAVE_STATE_KEY })"
    : "clearOfflineReloginHold('online self restored during offline hold')";
  return String.raw`${clearPrelude}  async function tick(source = 'timer') {
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
        bot.lastDecision = postExitDecisionWithoutTarget({
          kind: 'wait',
          reason: bot.lastExitMotionStopReason || 'exit-motion-stopped',
          dx: 0,
          dy: 0,
          self: self ? summarizeSelf(self) : bot.lastSelf,
          currentUserId: getCurrentUserId(),
          control: summarizeControl(),
          holdRemainingMs: exitMotionLockRemainingMs
        }, bot.lastExitMotionStopReason || 'exit-motion-stopped');
        updateBotPanel(bot.lastDecision);
        if (cfg.once) bot.stop('once');
        return;
      }
	      const enemyHoldControl = summarizeControl();
	      let enemyHoldRemainingMs = enemyReloginHoldRemainingMs();
	      if (enemyHoldRemainingMs > 0 && self && isAlive(self) && enemyHoldControl.wsOpen) {
	        ${clearEnemyOnlineRestore};
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
	          holdRemainingMs: enemyLeaveDetail?.holdRemainingMs ?? enemyReloginHoldRemainingMs(),
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
      let offlineHoldRemainingMs = offlineReloginHoldRemainingMs();
      if (offlineHoldRemainingMs > 0 && self && isAlive(self) && offlineHoldControl.wsOpen) {
        ${clearOfflineOnlineRestore};
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
	          holdRemainingMs: offlineLeaveDetail?.holdRemainingMs ?? offlineReloginHoldRemainingMs(),
	          displayReason: offlineLeaveDetail?.displayReason || offlineLeaveSummary('offline leave wait', offlineSafety),
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
	            displayReason: currentOfflineDisplayReason(noSelfExit.reason, offlineSafety, leaveResult, offlineDetail, noSelfExit.displayReason),
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
        const staminaDisplayReason = offlineLeaveSummary('stamina exhausted', offlineSafety);
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
          displayReason: currentOfflineDisplayReason('stamina exhausted', offlineSafety, leaveResult, offlineDetail, staminaDisplayReason),
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
        rememberNativeCoinSnapshot();
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
	          displayReason: currentOfflineDisplayReason(offlineLeaveReason, offlineSafety, leaveResult, offlineDetail, (samplingOutage ? '网络采样超时，正在退出' : (combatTickGap ? '战斗主循环断档，正在退出' : (actionSettlementStallOffline ? '动作结算卡死，正在退出' : (reconnectChurn ? '网络连接反复重连，正在退出' : ''))))),
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
          holdRemainingMs: enemyDetail?.holdRemainingMs ?? enemyReloginHoldRemainingMs()
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
            holdRemainingMs: enemyDetail?.holdRemainingMs ?? enemyReloginHoldRemainingMs()
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
	          summary: action.displayReason || offlineLeaveSummary(action.reason || 'stamina budget coin leave', offlineSafety)
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
	            pendingExit: summarizePendingExit()
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
	          displayReason: currentOfflineDisplayReason(action.reason || 'stamina budget coin leave', offlineSafety, leaveResult, offlineDetail, action.displayReason || ''),
	          leave: leaveResult,
	          holdRemainingMs: offlineDetail?.holdRemainingMs ?? offlineReloginHoldRemainingMs()
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
	          summary: injuryLeaveSummary(injury)
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
	              summary: injuryLeaveSummary(injury)
	            }
	        };
	      }
	      action = attachCoinDiagnostics(trackCoinProgress(action, self));
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
	          summary: pursuitLeaveSummary(pursuitSummary)
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
            holdRemainingMs: enemyDetail?.holdRemainingMs ?? enemyReloginHoldRemainingMs()
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
          holdRemainingMs: enemyDetail?.holdRemainingMs ?? enemyReloginHoldRemainingMs()
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
        pendingExit: summarizePendingExit(),
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
		  }`;
}

module.exports = { tickSource };
