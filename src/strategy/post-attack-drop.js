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
    .filter(item => item.afk !== false)
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

module.exports = {
  postAttackVisibleCoinExistsCore,
  pickPostAttackDropWaitTargetCore
};
