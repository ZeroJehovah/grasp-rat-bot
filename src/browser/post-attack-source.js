'use strict';

const {
  postAttackVisibleCoinExistsCore,
  resolvedRecentPostAttackDropsCore,
  buildPostAttackDropCoinCandidateCore,
  pickPostAttackDropCoinCore,
  pickPostAttackDropWaitTargetCore
} = require('./runtime/post-attack-drop');

function postAttackInlineSource(helpers = {}, options = {}) {
  const {
    postAttackVisibleCoinExistsCore,
    resolvedRecentPostAttackDropsCore,
    buildPostAttackDropCoinCandidateCore,
    pickPostAttackDropCoinCore,
    pickPostAttackDropWaitTargetCore
  } = helpers;
  const postAttackDropHelperSource = [
    postAttackVisibleCoinExistsCore,
    resolvedRecentPostAttackDropsCore,
    buildPostAttackDropCoinCandidateCore,
    pickPostAttackDropCoinCore,
    pickPostAttackDropWaitTargetCore
  ].map(fn => typeof fn === 'function' ? `  ${fn.toString()}` : '').join('\n');
  const localPostAttackVisibleCoinExistsSource = options.bundledRuntime ? '' : String.raw`
  function postAttackVisibleCoinExists(coins, attack) {
    return postAttackVisibleCoinExistsCore(coins, attack, {
      dist,
      dropCoinRadius: cfg.postAttackDropCoinRadius
    });
  }

`;
  const localPostAttackPickerSource = options.bundledRuntime ? '' : String.raw`
  function pickPostAttackDropCoin(self, coins, activeThreats, entities, options = {}) {
    const t = Date.now();
    const minAmount = options.includeSingle ? 0 : cfg.postAttackDropCoinMinAmount;
    const maxDistance = Math.max(0, Number(options.maxDistance ?? cfg.postAttackDropCoinMaxDistance) || 0);
    const minScore = Math.max(0, Number(options.minScore ?? 0) || 0);
    const candidateCoins = safeCoinCandidates(coins, activeThreats, maxDistance, self)
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
      recordDropMatchedKill(candidate, candidate.amount, summarizeSelf(self), 'post-attack-drop-visible');
    }
    return result.selected || null;
  }

  function pickPostAttackDropWaitTarget(self, coins, activeThreats, entities) {
    const t = Date.now();
    const waitMs = Math.max(0, Number(cfg.postAttackDropWaitMs || 0));
    return pickPostAttackDropWaitTargetCore(bot.attackHistory, coins, activeThreats, {
      nowMs: t,
      self,
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
  }

`;
  return String.raw`  function attackEntityMatches(entity, attack) {
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

${postAttackDropHelperSource}

${localPostAttackVisibleCoinExistsSource}
${localPostAttackPickerSource}

  function buildPostAttackDropWaitAction(self, target) {
    const dir = coinDirectionTo(self, target, cfg.patrolPrecisionTolerance);
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

`;
}

function bundledPostAttackSource() {
  return `const {
  postAttackVisibleCoinExistsCore,
  resolvedRecentPostAttackDropsCore,
  buildPostAttackDropCoinCandidateCore,
  pickPostAttackDropCoinCore,
  pickPostAttackDropWaitTargetCore
} = require('./src/browser/runtime/post-attack-drop');

${postAttackInlineSource({}, { bundledRuntime: true })}`;
}

function postAttackSource(options = {}) {
  if (options.bundledRuntime) return bundledPostAttackSource();
  return postAttackInlineSource({
    postAttackVisibleCoinExistsCore,
    resolvedRecentPostAttackDropsCore,
    buildPostAttackDropCoinCandidateCore,
    pickPostAttackDropCoinCore,
    pickPostAttackDropWaitTargetCore
  }, options);
}

module.exports = {
  bundledPostAttackSource,
  postAttackInlineSource,
  postAttackSource
};
