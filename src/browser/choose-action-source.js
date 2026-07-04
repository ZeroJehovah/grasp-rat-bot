'use strict';

const { coinDirectionToCall } = require('./coin-motion-runtime-source');
const { clearOpportunityChoiceForCall } = require('./opportunity-clear-call-source');

function chooseActionSource(options = {}) {
  const clearPostAttackCoinOpportunity = clearOpportunityChoiceForCall("'enemy'", 'postAttackCoin.postAttackTarget?.id', options);
  const clearPostAttackWaitOpportunity = clearOpportunityChoiceForCall("'enemy'", 'postAttackWaitTarget.id', options);
  const clearDailyStaminaCoinOpportunity = clearOpportunityChoiceForCall("'coin'", 'null', options);
  const summarizeNearestCoinStaminaBudgetExitCall = options.bundledRuntime
    ? String.raw`summarizeNearestCoinStaminaBudgetExitCore(
	      self,
	      safeCoinCandidates(realtimeCoins, coinThreats, cfg.globalCoinMaxDistance, self),
	      {
	        budget: opportunityWindowStaminaBudget(self, '1h'),
	        dist,
	        coinStaminaCost: opportunityCoinStaminaCost,
	        reloginDelayMs: staminaBudgetReloginDelayMs()
	      }
	    )`
    : String.raw`summarizeNearestCoinStaminaBudgetExit(
	      self,
	      safeCoinCandidates(realtimeCoins, coinThreats, cfg.globalCoinMaxDistance, self)
	    )`;
  const pickNearestDailyStaminaFinalCoinCall = options.bundledRuntime
    ? String.raw`pickNearestDailyStaminaFinalCoinCore(
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
    )`
    : String.raw`pickNearestDailyStaminaFinalCoin(self, realtimeCoins, coinThreats)`;
  const summarizeBlockedStaminaOpportunityCall = options.bundledRuntime
    ? String.raw`summarizeBlockedStaminaOpportunityCore(realtimeCoins, [], {
	          budget: opportunityLongStaminaBudget(self),
	          coinStaminaCost: opportunityCoinStaminaCost,
	          enemyStaminaCost: opportunityEnemyStaminaCost,
	          targetDrop: dropValue
	        })`
    : String.raw`summarizeBlockedStaminaOpportunity(self, realtimeCoins, [])`;
  const pickCoinRouteOpportunityOption = options.bundledRuntime
    ? String.raw`(routeSelf, routeCoins, routeThreats) => pickCoinRouteOpportunityCore(routeSelf, routeCoins, routeThreats, {
          ...coinRouteCoreOptions(routeSelf),
          heldChoice: currentHeldCoinChoice(),
          heldRouteChoice: currentHeldCoinRouteChoice()
        })`
    : 'pickCoinRouteOpportunity';
  const uniqueVisibleRouteCoinsOption = options.bundledRuntime
    ? String.raw`routeCoinGroups => uniqueVisibleRouteCoinsCore(routeCoinGroups, { isSnapshotOnlyCoin, coinKey: coinRouteKey })`
    : 'uniqueVisibleRouteCoins';
  const enemyOpportunityCandidatesOption = options.bundledRuntime
    ? String.raw`(candidateSelf, targets, candidateThreats) => {
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
        }`
    : 'enemyOpportunityCandidates';
  const snapshotCoinNavigationReasonCall = options.bundledRuntime
    ? 'snapshotCoinNavigationReasonCore(localRealtimeCoin, coinTargetCoreOptions())'
    : 'snapshotCoinNavigationReason(localRealtimeCoin)';
  const buildMissingHeldOpportunityOption = options.bundledRuntime
    ? String.raw`(missingSelf, missingThreats, opportunities) => {
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
        }`
    : 'buildMissingHeldOpportunity';
  const chooseStableOpportunityOption = options.bundledRuntime
    ? String.raw`opportunities => {
          const result = chooseStableOpportunityCore(opportunities, bot.opportunityChoice, bot.opportunitySwitchLock, opportunityChoiceCoreOptions());
          bot.opportunitySwitchLock = result.switchLock;
          return result.chosen;
        }`
    : 'chooseStableOpportunity';
  const rememberOpportunityChoiceOption = options.bundledRuntime
    ? String.raw`(item, action, previous = bot.opportunityChoice) => {
          if (!item) return action;
          const result = rememberOpportunityChoiceCore(item, action, previous, opportunityChoiceCoreOptions());
          bot.opportunityChoice = result.choice;
          return result.action;
        }`
    : 'rememberOpportunityChoice';
  const pickPostAttackDropCoinCall = (selfExpr, coinsExpr, threatsExpr, entitiesExpr, optionsExpr = '{}') => options.bundledRuntime
    ? String.raw`(() => {
      const options = ${optionsExpr};
      const t = Date.now();
      const minAmount = options.includeSingle ? 0 : cfg.postAttackDropCoinMinAmount;
      const maxDistance = Math.max(0, Number(options.maxDistance ?? cfg.postAttackDropCoinMaxDistance) || 0);
      const minScore = Math.max(0, Number(options.minScore ?? 0) || 0);
      const candidateCoins = safeCoinCandidates(${coinsExpr}, ${threatsExpr}, maxDistance, ${selfExpr})
        .filter(coin => Number(coin.amount || 0) > minAmount)
        .filter(coin => Number.isFinite(Number(coin.distance)))
        .filter(coin => coinStaminaAffordableWithDiagnostic(${selfExpr}, coin));
      const result = pickPostAttackDropCoinCore(bot.attackHistory, candidateCoins, {
        nowMs: t,
        dist,
        priorityMs: cfg.postAttackDropCoinPriorityMs,
        includeSingle: options.includeSingle,
        minAmount,
        maxDistance,
        minScore,
        dropCoinRadius: cfg.postAttackDropCoinRadius,
        resolveAttack: attack => postAttackDropResolvedAt(attack, ${entitiesExpr}, t),
        scoreCoin: scoreCoinOpportunity
      });
      for (const candidate of result.candidates || []) {
        recordDropMatchedKill(candidate, candidate.amount, summarizeSelf(${selfExpr}), 'post-attack-drop-visible');
      }
      return result.selected || null;
    })()`
    : `pickPostAttackDropCoin(${selfExpr}, ${coinsExpr}, ${threatsExpr}, ${entitiesExpr}, ${optionsExpr})`;
  const pickPostAttackDropWaitTargetCall = (selfExpr, coinsExpr, threatsExpr, entitiesExpr) => options.bundledRuntime
    ? String.raw`(() => {
      const t = Date.now();
      const waitMs = Math.max(0, Number(cfg.postAttackDropWaitMs || 0));
      return pickPostAttackDropWaitTargetCore(bot.attackHistory, ${coinsExpr}, ${threatsExpr}, {
        nowMs: t,
        self: ${selfExpr},
        dist,
        waitMs,
        minDrop: Math.max(0, Number(cfg.postAttackDropWaitMinDrop ?? cfg.attackMinDrop) || 0),
        resolveMaxMs: Math.max(waitMs, Number(cfg.postAttackDropResolveMaxMs || waitMs) || waitMs),
        maxDistance: Math.max(0, Number(cfg.postAttackDropWaitMaxDistance || cfg.opportunityVisibleDistance || cfg.globalCoinMaxDistance || 0)),
        stopDistance: Math.max(0, Number(cfg.postAttackDropWaitStopDistance || cfg.coinPickupSweepDistance || 0)),
        dropCoinRadius: cfg.postAttackDropCoinRadius,
        resolveAttack: item => postAttackDropResolvedAt(item, ${entitiesExpr}, t),
        coinBlockedByThreat: (origin, item, threat) => coinBlockedByThreat(origin, item, threat)
      });
    })()`
    : `pickPostAttackDropWaitTarget(${selfExpr}, ${coinsExpr}, ${threatsExpr}, ${entitiesExpr})`;
  return String.raw`  function chooseAction(self) {
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
    const pendingPostAttackWaitTarget = ${pickPostAttackDropWaitTargetCall('self', 'realtimeCoins', 'coinThreats', 'entities')};
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
    const postAttackCoin = ${pickPostAttackDropCoinCall('self', 'realtimeCoins', 'coinThreats', 'entities', String.raw`{
      includeSingle: !recovery,
      maxDistance: recovery ? cfg.postAttackRecoveryDropMaxDistance : cfg.postAttackDropCoinMaxDistance,
      minScore: recovery ? cfg.postAttackRecoveryDropMinScore : 0
    }`)};
    if (postAttackCoin) {
      bot.fleeLock = null;
      if (bot.lastTarget?.kind === 'enemy') {
        bot.lastTarget = null;
        bot.lastTargetAt = 0;
      }
      ${clearPostAttackCoinOpportunity}
      const action = buildCoinAction(self, postAttackCoin, 'post-attack-drop-coin');
      action.postAttackTarget = postAttackCoin.postAttackTarget;
      return action;
    }
    const postAttackWaitTarget = pendingPostAttackWaitTarget || ${pickPostAttackDropWaitTargetCall('self', 'realtimeCoins', 'coinThreats', 'entities')};
    if (postAttackWaitTarget) {
      bot.fleeLock = null;
      ${clearPostAttackWaitOpportunity}
      return buildPostAttackDropWaitAction(self, postAttackWaitTarget);
    }
	    const staminaBudgetExit = ${summarizeNearestCoinStaminaBudgetExitCall};
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
	      const dir = ${coinDirectionToCall('self', 'nearCoin', 'cfg.coinPrecisionTolerance', options)};
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
	        const dir = ${coinDirectionToCall('self', 'footCoin', 'cfg.coinPrecisionTolerance', options)};
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
	      const dir = ${coinDirectionToCall('self', 'footCoin', 'cfg.coinPrecisionTolerance', options)};
      return attachOpportunisticShot({
        kind: 'coin',
        reason: 'foot-coin-priority',
        target: { id: footCoin.drop_id, x: footCoin.x, y: footCoin.y, amount: footCoin.amount, distance: Math.round(dir.distance) },
        dx: dir.dx,
        dy: dir.dy,
        ...coinMotionMetaCore(dir)
      }, self, realtimeEntities, { recovery });
    }

    const dailyStaminaFinalCoin = ${pickNearestDailyStaminaFinalCoinCall};
    if (dailyStaminaFinalCoin) {
      bot.fleeLock = null;
      ${clearDailyStaminaCoinOpportunity}
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
        enemyOpportunityCandidates: ${enemyOpportunityCandidatesOption},
        uniqueVisibleRouteCoins: ${uniqueVisibleRouteCoinsOption},
        pickCoinRouteOpportunity: ${pickCoinRouteOpportunityOption},
        opportunityCandidateCoreOptions,
        buildCoinAction,
        buildEnemyAction,
        buildMissingHeldOpportunity: ${buildMissingHeldOpportunityOption},
        chooseStableOpportunity: ${chooseStableOpportunityOption},
        rememberOpportunityChoice: ${rememberOpportunityChoiceOption}
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
      const dir = ${coinDirectionToCall('self', 'distantCoin', 'cfg.coinPrecisionTolerance', options)};
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
        ${snapshotCoinNavigationReasonCall},
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
	      ? ${summarizeBlockedStaminaOpportunityCall}
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
  }`;
}

module.exports = { chooseActionSource };
