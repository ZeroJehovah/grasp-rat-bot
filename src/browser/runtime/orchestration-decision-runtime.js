'use strict';

function createOrchestrationDecisionRuntime(runtime = {}) {
  const { domainContexts = null } = runtime;
  const runtimeDomainContexts = domainContexts || { bootstrap: runtime, state: runtime, entity: runtime, native: runtime, control: runtime, profit: runtime, combat: runtime, logging: runtime, ui: runtime, safety: runtime };

  const {
    BOT_KEY, ENEMY_LEAVE_STATE_KEY, LOGIN_SUPPRESS_KEY, LOGIN_SUPPRESS_REASON_KEY,
    OFFLINE_LEAVE_STATE_KEY,
    PENDING_EXIT_STATE_KEY,
    cfg, pageGlobal, previousBot
  } = runtimeDomainContexts.bootstrap || {};

  const {
    bot,
    clearPersistentExitState,
    clearPersistentPendingExitState,
    normalizePendingExitReloadConfirmationCore,
    pendingExitPersistenceCoreHelpers,
    readPersistentExitState,
    writePersistentPendingExitStateCore
  } = runtimeDomainContexts.state || {};

  const {
    decorateActiveThreat,
    dist,
    dropValue,
    hpValue,
    hypot,
    isAfkProfitTarget,
    isAlive,
    isAvoidanceThreat,
    isConservingStamina,
    isCurrentlyActive,
    isFiringEntity,
    isFullHp,
    isInvulnerable,
    isInvulnerableActive,
    isRecovering,
    isWhitelistedTarget,
    knownHpValue,
    speed
  } = runtimeDomainContexts.entity || {};

  const {
    assessActionSettlementStall,
    assessOfflineSafety,
    assessServerPositionStall,
    buildNativeCoinSnapshotCore,
    buildNativeEntityMeta,
    controlHasNativeGameSession,
    ensureControlWs,
    getBullets,
    getCoins,
    getCurrentUserId,
    getNativeCoinList,
    getNativeEntityList,
    getSelf,
    installPageGlobal,
    installPageNativeSnapshotObserver,
    now,
    observeNetworkQualitySelf,
    refreshGlobalState,
    resetServerPositionStall,
    sendActionVelocity,
    shootAt,
    snapshotDataFreshEnough,
    snapshotEntityAllowed,
    stopMotionSafely,
    summarizeControl,
    summarizeSelf
  } = runtimeDomainContexts.native || {};

  const {
    activeEnemyLeaveDetail,
    activeOfflineLeaveDetail,
    clearExitHoldDetail,
    clearSessionMismatchRecoveryState,
    cloudflareErrorInfo,
    handlePendingExit,
    installNativeLoginGateInterceptors,
    isCombatStateForInjuryLeave,
    latestEnemyLeaveDisplayReason,
    leaveForCombat,
    leaveForInjury,
    leaveForPursuit,
    leaveOffline,
    liveSessionMismatchTakeoverState,
    loginSnapshotGateDisplayReason,
    maybeRecordLoginPoint,
    maybeReloadCloudflareError,
    maybeStartAutoLogin,
    noSelfGameSessionExitState,
    noteSelfUnavailableForPostLoginZoom,
    pendingCombatLeaveAction,
    pendingExitIntentForSkippedLeave,
    pendingExitSkipNewLeave,
    rememberLoginPointDamageThreat,
    requestReload,
    requestSessionMismatchRecoveryReload,
    schedulePostLoginZoomOut,
    sessionMismatchRecoveryReloadSatisfied,
    staleOfflineStaminaHoldContradicted,
    staminaBudgetReloginDelayMs,
    summarizePendingCombatLeave,
    summarizePursuit,
    summarizeSessionMismatchRecoveryStatus,
    syncPausedFromPage,
    updatePursuitTracking
  } = runtimeDomainContexts.control || {};

  const {
    applyCoinApproachLockUpdate,
    applyCoinProgressAction,
    applyFinalActionArbitration,
    attachCoinDiagnostics,
    buildCoinAction,
    buildCoinDiagnostics,
    buildDropMatchedKillCore,
    buildEnemyAction,
    buildMissingHeldOpportunityCore,
    buildPostAttackDropWaitAction,
    canPrioritizeHighValueVisibleCoin,
    chooseStableOpportunityCore,
    clearCoinTracking,
    clearMissingVisibleCoinTarget,
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
    currentHeldCoinChoice,
    currentHeldCoinRouteChoice,
    dailyStaminaBudgetIsLimitingCore,
    dailyStaminaFinalCoinAction,
    highValueCoinPriorityAmount,
    highValueCoinPriorityHealthyHp,
    highValueVisibleCoinPriorityNeeded,
    isSnapshotCoinWaitAction,
    isSnapshotOnlyCoin,
    markCoinCollected,
    normalizeCoinDrop,
    opportunityCandidateCoreOptions,
    opportunityChoiceCoreOptions,
    opportunityCoinStaminaCost,
    opportunityEnemyStaminaCost,
    opportunityLongStaminaBudget,
    opportunityPriorityTier,
    opportunityWindowStaminaBudget,
    pickBestOpportunity,
    pickBestOpportunityCore,
    pickCoin,
    pickCoinField,
    pickCoinRouteOpportunityCore,
    pickDistantCoin,
    pickHighValueVisibleCoin,
    pickNearestDailyStaminaFinalCoinCore,
    pickPostAttackDropCoinCore,
    pickPostAttackDropWaitTargetCore,
    pickProfitableCombatTarget,
    pickRealtimeLocalCoin,
    postAttackDropResolvedAt,
    recordActionSwitchDiagnostics,
    recordCoinFilterDiagnostic,
    recordIncidentalCoinPickups,
    rememberOpportunityChoiceCore,
    resetOpportunitySwitchLock,
    safeCoinCandidates,
    scoreCoinOpportunity,
    setLastTarget,
    shouldClearOpportunityChoiceCore,
    snapshotCoinAgeMs,
    snapshotCoinLocalSuppressRadius,
    snapshotCoinNavigationReasonCore,
    staminaBudgetCoinLeaveAction,
    staminaBudgetCoinLeaveSummary,
    summarizeBlockedStaminaOpportunityCore,
    summarizeNearestCoinStaminaBudgetExitCore,
    uniqueVisibleRouteCoinsCore,
    updateOpportunityAfkStaminaObservations,
    visibleCoinSourcesConfirmTargetMissing
  } = runtimeDomainContexts.profit || {};

  const {
    activeCombatThreatWaitAction,
    attachOpportunisticShot,
    attackWorthTakingCore,
    buildCombatAction,
    buildOpportunisticShotWait,
    clearCombatEngagement,
    combatDodgeOnlyCandidateRange,
    combatHpValue,
    combatTargetCandidateRange,
    combatTickActiveFromState,
    combatTickGapOfflineState,
    defensiveTargetOverridesEngaged,
    entityFreshEnoughForOffense,
    globalSamplingOutageOfflineState,
    handleTickReentryCombatGap,
    incomingBulletThreat,
    pickActiveCombatWaitThreat,
    pickCombatTarget,
    pickEngagedCombatTarget,
    rememberCombatEngagement
  } = runtimeDomainContexts.combat || {};

  const {
    finishImportantCombat,
    importantSessionStaminaSpentMs,
    logStatus,
    noteImportantSessionExit,
    recordCombatLogTick,
    recordImportantCombatTick,
    recordKillHistoryItem,
    recordUnhandledTickError,
    rememberAttack,
    restoreImportantLogsForRemote,
    restorePersistedCombatLogPendingEntries,
    restorePersistedExitAuditLogs,
    runTickSafely,
    safeJsonClone,
    safeStringify,
    updateKillHistory,
    updateSessionStats
  } = runtimeDomainContexts.logging || {};

  const {
    actorLabel,
    arrayCount,
    deferredStaminaExhaustionLeave,
    exitMotionStopLockRemainingMs,
    formatDistance,
    formatDurationMs,
    hpDisplay,
    staminaExhaustedWindowLabel,
    startTargetWhitelistPolling,
    summarizeStamina,
    updateBotPanel
  } = runtimeDomainContexts.ui || {};

  const {
    markRecentMovement,
    fleeDirection,
    lockedFleeDirection,
    actionMovesTowardThreat,
    isShortSafeCoinAction,
    returnBlockRadius,
    returnBlockExitRadius,
    returnBlockResumeRadius,
    returnBlockSuppressRadius,
    hasReturnBlockThreat,
    markReturnBlockPressure,
    pickReturnBlockPressure,
    returnBlockScanDirection,
    buildReturnBlockScanAction,
    threatKey,
    mergeThreatLists,
    pickReturnBlockThreat,
    blockThreatReturnAction
  } = runtimeDomainContexts.safety || {};

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

  return {
    classify,
    chooseAction
  };
}

module.exports = {
  createOrchestrationDecisionRuntime
};
