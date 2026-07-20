'use strict';

function defaultDist(a, b) {
  const dx = Number(a?.x) - Number(b?.x);
  const dy = Number(a?.y) - Number(b?.y);
  return Number.isFinite(dx) && Number.isFinite(dy) ? Math.hypot(dx, dy) : Infinity;
}

function postAttackVisibleCoinExistsCore(coins, attack, options = {}) {
  const dist = typeof options.dist === 'function' ? options.dist : defaultDist;
  const radius = Math.max(0, Number(options.dropCoinRadius || 0));
  return (coins || [])
    .map(c => ({ ...c, distanceToAttack: dist(c, attack), amount: Number(c?.amount || 0) }))
    .some(c => c.amount > 0 && c.distanceToAttack <= radius);
}

function resolvedRecentPostAttackDropsCore(attacks, options = {}) {
  const t = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  const priorityMs = Math.max(0, Number(options.priorityMs || 0));
  const resolveAttack = typeof options.resolveAttack === 'function'
    ? options.resolveAttack
    : item => Number(item?.postAttackDropResolvedAt || 0);
  return (attacks || [])
    .slice()
    .reverse()
    .filter(item => t - Number(item?.at || 0) <= priorityMs)
    .filter(item => Number.isFinite(Number(item?.x)) && Number.isFinite(Number(item?.y)))
    .map(item => {
      const resolvedAt = resolveAttack(item);
      return resolvedAt ? { ...item, postAttackDropResolvedAt: resolvedAt } : null;
    })
    .filter(Boolean);
}

function buildPostAttackDropCoinCandidateCore(coin, attack, score, options = {}) {
  const t = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  const dist = typeof options.dist === 'function' ? options.dist : defaultDist;
  return {
    ...coin,
    postAttackScore: score,
    postAttackTarget: {
      id: attack.id,
      name: attack.name || '',
      drop: attack.drop,
      x: attack.x,
      y: attack.y,
      action: attack.action || '',
      distance: Number.isFinite(Number(attack.distance)) ? Math.round(Number(attack.distance)) : null,
      coinDistance: Number.isFinite(Number(coin.distance)) ? Math.round(Number(coin.distance)) : null,
      coinDistanceToTarget: Math.round(dist(coin, attack)),
      ageMs: Math.max(0, Math.round(t - Number(attack.at || t))),
      playerCategory: attack.playerCategory || (attack.afk === false ? 'active' : 'afk'),
      afk: attack.afk !== false,
      active: attack.active === true || attack.playerCategory === 'active',
      combat: Boolean(attack.combat),
      combatIntent: attack.combatIntent || '',
      chase: Boolean(attack.chase || attack.chaseMode),
      chaseMode: attack.chaseMode || null,
      mode: attack.mode || '',
      currentlyActive: Boolean(attack.currentlyActive),
      moving: Boolean(attack.moving),
      firing: Boolean(attack.firing),
      battleStartedAt: attack.battleStartedAt || attack.at || 0,
      battleStaminaSpentStartMs: Number.isFinite(Number(attack.battleStaminaSpentStartMs)) ? Math.max(0, Math.round(Number(attack.battleStaminaSpentStartMs))) : null,
      staminaSpentMs: Number.isFinite(Number(attack.staminaSpentMs)) ? Math.max(0, Math.round(Number(attack.staminaSpentMs))) : null
    }
  };
}

function pickPostAttackDropCoinCore(attacks, coins, options = {}) {
  const dist = typeof options.dist === 'function' ? options.dist : defaultDist;
  const radius = Math.max(0, Number(options.dropCoinRadius || 0));
  const minAmount = options.includeSingle ? 0 : Math.max(0, Number(options.minAmount || 0));
  const minScore = Math.max(0, Number(options.minScore || 0));
  const scoreCoin = typeof options.scoreCoin === 'function' ? options.scoreCoin : coin => Number(coin?.score ?? coin?.opportunityScore ?? 0);
  const resolvedAttacks = resolvedRecentPostAttackDropsCore(attacks, options);
  const candidates = [];
  if (!resolvedAttacks.length) return { selected: null, candidates, resolvedAttacks };
  for (const coin of coins || []) {
    if (!(Number(coin?.amount || 0) > minAmount)) continue;
    if (!Number.isFinite(Number(coin?.distance))) continue;
    const attack = resolvedAttacks
      .filter(item => dist(coin, item) <= radius)
      .sort((a, b) => Number(b.drop || 0) - Number(a.drop || 0) || Number(b.at || 0) - Number(a.at || 0))[0] || null;
    if (!attack) continue;
    const score = scoreCoin(coin);
    if (score < minScore) continue;
    candidates.push(buildPostAttackDropCoinCandidateCore(coin, attack, score, options));
  }
  const selected = candidates
    .slice()
    .sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0) || b.postAttackScore - a.postAttackScore || Number(a.distance || 0) - Number(b.distance || 0))[0] || null;
  return { selected, candidates, resolvedAttacks };
}

function pickPostAttackDropWaitTargetCore(attacks, coins, activeThreats, options = {}) {
  const t = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  const waitMs = Math.max(0, Number(options.waitMs || 0));
  if (!waitMs) return null;
  const minDrop = Math.max(0, Number(options.minDrop || 0));
  const resolveMaxMs = Math.max(waitMs, Number(options.resolveMaxMs || waitMs) || waitMs);
  const maxDistance = Math.max(0, Number(options.maxDistance || 0));
  const stopDistance = Math.max(0, Number(options.stopDistance || 0));
  const self = options.self || null;
  const dist = typeof options.dist === 'function' ? options.dist : defaultDist;
  const resolveAttack = typeof options.resolveAttack === 'function'
    ? options.resolveAttack
    : item => Number(item?.postAttackDropResolvedAt || 0);
  const visibleCoinExists = typeof options.visibleCoinExists === 'function'
    ? options.visibleCoinExists
    : (list, item) => postAttackVisibleCoinExistsCore(list, item, options);
  const coinBlockedByThreat = typeof options.coinBlockedByThreat === 'function' ? options.coinBlockedByThreat : () => false;
  return (attacks || [])
    .slice()
    .reverse()
    .filter(item => t - Number(item?.at || 0) <= resolveMaxMs)
    .filter(item => Number(item?.drop || 0) >= minDrop)
    .filter(item => Number.isFinite(Number(item?.x)) && Number.isFinite(Number(item?.y)))
    .filter(item => item.afk !== false || item.combat || item.chase || item.chaseMode)
    .filter(item => item.action === 'attack' || item.action === 'opportunistic-shot')
    .map(item => {
      const resolvedAt = resolveAttack(item);
      return resolvedAt ? { ...item, postAttackDropResolvedAt: resolvedAt } : null;
    })
    .filter(Boolean)
    .filter(item => t - Number(item.postAttackDropResolvedAt || 0) <= waitMs)
    .filter(item => !visibleCoinExists(coins, item))
    .map(item => ({ ...item, distance: dist(self, item) }))
    .filter(item => item.distance > stopDistance && item.distance <= maxDistance)
    .filter(item => !(activeThreats || []).some(threat => coinBlockedByThreat(self, item, threat)))
    .sort((a, b) => Number(b.drop || 0) - Number(a.drop || 0) || Number(a.distance || 0) - Number(b.distance || 0))[0] || null;
}

function stableAttackTargetId(value) {
  const id = value?.id ?? value?.userId ?? value?.user_id ?? value?.entityId ?? value?.entity_id;
  return id === null || id === undefined || id === '' ? '' : String(id);
}

function postAttackCoinKey(value) {
  const id = value?.drop_id ?? value?.dropId ?? value?.id ?? value?.key;
  return id === null || id === undefined || id === '' ? '' : String(id);
}

function postAttackCoinSourceId(value) {
  const id = value?.sourceUserId ?? value?.source_user_id ?? value?.ownerUserId ?? value?.owner_user_id;
  return id === null || id === undefined || id === '' ? '' : String(id);
}

function updatePostAttackSettlementCore(previous = {}, context = {}, options = {}) {
  const nowMs = Number.isFinite(Number(context.nowMs)) ? Number(context.nowMs) : Date.now();
  const waitMs = Math.max(0, Number(options.waitMs || 1000));
  const resolveMaxMs = Math.max(waitMs, Number(options.resolveMaxMs || 5000));
  const pickupMs = Math.max(resolveMaxMs, Number(options.pickupMs || 45000));
  const minDrop = Math.max(0, Number(options.minDrop || 0));
  const radius = Math.max(0, Number(options.dropCoinRadius || 0));
  const dist = typeof options.dist === 'function' ? options.dist : defaultDist;
  const resolveAttack = typeof options.resolveAttack === 'function'
    ? options.resolveAttack
    : attack => Number(attack?.postAttackDropResolvedAt || 0);
  const visibleTargets = Array.isArray(context.visibleTargets) ? context.visibleTargets : [];
  const coins = Array.isArray(context.coins) ? context.coins : [];
  const latestByTarget = new Map();
  for (const attack of context.attacks || []) {
    const id = stableAttackTargetId(attack);
    if (!id || Number(attack?.drop || 0) < minDrop) continue;
    if (attack?.action !== 'attack' && attack?.action !== 'opportunistic-shot') continue;
    if (!Number.isFinite(Number(attack?.x)) || !Number.isFinite(Number(attack?.y))) continue;
    const existing = latestByTarget.get(id);
    if (!existing || Number(attack.at || 0) >= Number(existing.at || 0)) latestByTarget.set(id, attack);
  }
  const states = {};
  const targetIds = new Set([...Object.keys(previous || {}), ...latestByTarget.keys()]);
  for (const id of targetIds) {
    const prior = previous?.[id] && typeof previous[id] === 'object' ? { ...previous[id] } : null;
    const attack = latestByTarget.get(id) || null;
    if (!attack) {
      if (prior && nowMs - Number(prior.updatedAt || prior.startedAt || 0) <= pickupMs) states[id] = prior;
      continue;
    }
    const attackAt = Math.max(0, Number(attack.at || 0));
    const newGeneration = !prior || attackAt > Number(prior.lastAttackAt || 0);
    let state = newGeneration ? {
      targetId: id,
      targetName: String(attack.name || ''),
      targetDrop: Number.isFinite(Number(attack.drop)) ? Number(attack.drop) : null,
      x: Number(attack.x),
      y: Number(attack.y),
      lastAttackAt: attackAt,
      startedAt: nowMs,
      resolvedAt: 0,
      phase: 'unresolved',
      matchedCoinKey: '',
      matchedCoinAmount: null,
      lastCoinSeenAt: 0,
      terminalReason: '',
      updatedAt: nowMs
    } : prior;
    const visibleAlive = visibleTargets.some(target => (
      stableAttackTargetId(target) === id
        && target?.alive !== false
        && Number(target?.hp ?? 1) > 0
    ));
    if (visibleAlive) {
      state = {
        ...state,
        phase: 'settled',
        terminalReason: 'target-reappeared-alive',
        updatedAt: nowMs
      };
      states[id] = state;
      continue;
    }
    if (state.phase === 'settled' || state.phase === 'expired') {
      // Keep the terminal tombstone for as long as the consumed attack
      // generation is still present. Dropping it on a short timer lets the
      // same old attack history create a fresh pending generation again.
      states[id] = state;
      continue;
    }
    // Resolution time belongs to the settlement generation, not to the
    // transient attack object supplied by the caller. The decision Worker
    // receives a freshly cloned attack-history patch on each plan, so calling
    // the resolver first would stamp every frame with a new resolution time
    // and keep `pending` alive forever.
    const resolvedAt = Number(state.resolvedAt || resolveAttack(attack) || 0);
    if (!(resolvedAt > 0)) {
      if (nowMs - attackAt <= resolveMaxMs) states[id] = { ...state, phase: 'unresolved', updatedAt: nowMs };
      continue;
    }
    state.resolvedAt = resolvedAt;
    const matchingCoin = coins.find(coin => (
      Number(coin?.amount || 0) > 0
        && (postAttackCoinSourceId(coin) === id || dist(coin, attack) <= radius)
    )) || null;
    if (matchingCoin) {
      const coinKey = postAttackCoinKey(matchingCoin);
      state = {
        ...state,
        phase: state.matchedCoinKey && state.matchedCoinKey === coinKey ? 'pickup-protected' : 'drop-observed',
        matchedCoinKey: coinKey,
        matchedCoinAmount: Number.isFinite(Number(matchingCoin.amount)) ? Number(matchingCoin.amount) : null,
        lastCoinSeenAt: nowMs,
        coin: matchingCoin,
        updatedAt: nowMs
      };
    } else if (state.phase === 'drop-observed' || state.phase === 'pickup-protected') {
      state = {
        ...state,
        phase: 'settled',
        coin: null,
        terminalReason: 'matched-drop-disappeared',
        updatedAt: nowMs
      };
    } else if (nowMs - resolvedAt > waitMs) {
      state = {
        ...state,
        phase: 'expired',
        coin: null,
        terminalReason: 'drop-wait-expired',
        updatedAt: nowMs
      };
    } else {
      state = { ...state, phase: 'pending', coin: null, updatedAt: nowMs };
    }
    states[id] = state;
  }
  const active = Object.values(states)
    .filter(state => ['pending', 'drop-observed', 'pickup-protected'].includes(state.phase))
    .sort((left, right) => Number(right.lastAttackAt || 0) - Number(left.lastAttackAt || 0));
  return {
    states,
    selected: active[0] || null,
    activeCount: active.length,
    terminalCount: Object.values(states).filter(state => ['settled', 'expired'].includes(state.phase)).length
  };
}

module.exports = {
  postAttackVisibleCoinExistsCore,
  resolvedRecentPostAttackDropsCore,
  buildPostAttackDropCoinCandidateCore,
  pickPostAttackDropCoinCore,
  pickPostAttackDropWaitTargetCore,
  updatePostAttackSettlementCore
};
