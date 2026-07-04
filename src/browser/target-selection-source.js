'use strict';

function targetSelectionSource() {
  return String.raw`  function highValueCoinPriorityAmount() {
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

`;
}

module.exports = {
  targetSelectionSource
};
