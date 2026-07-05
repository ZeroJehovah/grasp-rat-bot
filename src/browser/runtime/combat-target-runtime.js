'use strict';

function createCombatTargetRuntime(runtime = {}) {
  const {
    bot,
    cfg,
    staminaBudgetCoinLeaveSummary = () => '',
    staminaExhaustedWindowLabel = () => '',
    isInvulnerable = () => false,
    isCurrentlyActive = () => false,
    isFiringEntity = () => false,
    isMovingThreat = () => false,
    isAfkProfitTarget = () => false,
    isWhitelistedTarget = () => false,
    hasCombatActivitySignal = () => false,
    isJoinModeActive = () => false,
    hpValue = () => 0,
    combatHpValue = () => 100,
    knownHpValue = () => null,
    dropValue = () => 0,
    isFullHp = () => true,
    isAlive = value => Boolean(value),
    entityFreshEnoughForOffense = () => true,
    classify = () => ({}),
    returnBlockRadius = () => Infinity,
    attackWorthTakingCore = () => false,
    attackWorthTaking = attackWorthTakingCore,
    recordNetworkQualityAttackDamage = () => {},
    summarizeSelf = value => value,
    updateSessionStats = () => {},
    getSelf = () => null,
    stopMotionSafely = () => {},
    leaveOffline = async () => null,
    activeOfflineLeaveDetail = () => null,
    requestReload = () => {},
    updateBotPanel = () => {},
    summarizeControl = () => null,
    dist = () => Infinity,
    speed = () => 0,
    opportunityLongStaminaBudget = () => Infinity,
    scoreEnemyOpportunity = () => -Infinity,
    opportunityEnemyStaminaCost = () => Infinity,
    estimatedKillShots = () => 0,
    opportunityStaminaAffordable = () => false,
    scoreCoinOpportunity = () => -Infinity,
    combatMotionSamplesWithCurrent = () => [],
    incomingBulletThreat = () => null
  } = runtime;

  const {
    currentOfflineDisplayReasonCore: currentOfflineDisplayReasonForCombatStateCore,
    offlineLeaveSummaryCore: offlineLeaveSummaryForCombatStateCore
  } = require('./exit-relogin');

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
      displayReason: currentOfflineDisplayReasonForCombatStateCore('combat tick gap', offlineSafety, leaveResult, offlineDetail, '战斗主循环断档，正在退出', { offlineLeaveSummary: (summaryReason, summarySafety) => offlineLeaveSummaryForCombatStateCore(summaryReason, summarySafety, { staminaBudgetCoinLeaveSummary, staminaExhaustedWindowLabel }) }),
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

  return {
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
    handleTickReentryCombatGap
  };
}

module.exports = {
  createCombatTargetRuntime
};
