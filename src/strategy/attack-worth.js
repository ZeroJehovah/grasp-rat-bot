'use strict';

function attackWorthTakingCore(self, target, options = {}) {
  const isWhitelistedTarget = typeof options.isWhitelistedTarget === 'function'
    ? options.isWhitelistedTarget
    : () => false;
  const dropValue = typeof options.dropValue === 'function'
    ? options.dropValue
    : item => Number(item?.drop ?? item?.Drop ?? 0);
  const isAfkProfitTarget = typeof options.isAfkProfitTarget === 'function'
    ? options.isAfkProfitTarget
    : () => false;
  if (isWhitelistedTarget(target)) return false;
  const targetDrop = dropValue(target);
  if (isAfkProfitTarget(target)) {
    return targetDrop >= Math.max(0, Number(options.attackMinAfkDrop ?? options.attackMinDrop));
  }
  const ownDrop = dropValue(self);
  return targetDrop >= Number(options.attackMinDrop)
    && (!ownDrop || targetDrop >= ownDrop * Number(options.attackMinRewardRatio));
}

module.exports = { attackWorthTakingCore };
