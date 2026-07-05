'use strict';

function createProfitPostAttackRuntime(runtime = {}) {
  const {
    bot,
    cfg,
    now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
    hypot = Math.hypot,
    knownHpValue = () => null,
    dropValue = () => 0,
    isAlive = value => Boolean(value),
    isWhitelistedTarget = () => false,
    isCurrentlyActive = () => false,
    isInvulnerable = () => false,
    entityFreshEnoughForOffense = () => true,
    isAfkProfitTarget = () => false,
    directionTo = () => ({ dx: 0, dy: 0, distance: Infinity }),
    coinDirectionToCore = () => ({ direction: { dx: 0, dy: 0, distance: Infinity } }),
    coinMotionCoreOptions = () => ({}),
    coinPickupFailureCount = () => 0,
    coinPickupAttemptSlowCount = () => 0,
    applyCoinApproachLockUpdate = () => {},
    coinMotionMetaCore = () => ({}),
    opportunityCoinStaminaCost = () => 0,
    opportunityEnemyStaminaCost = () => 0,
    estimatedKillShots = () => 1,
    scoreCoinOpportunity = () => 0,
    scoreEnemyOpportunity = () => 0,
    coinRouteActionMetaCore = () => null
  } = runtime;

const {
  postAttackVisibleCoinExistsCore,
  resolvedRecentPostAttackDropsCore,
  buildPostAttackDropCoinCandidateCore,
  pickPostAttackDropCoinCore,
  pickPostAttackDropWaitTargetCore
} = require('./post-attack-drop');

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

  return {
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
    buildEnemyAction
  };
}

module.exports = {
  createProfitPostAttackRuntime
};
