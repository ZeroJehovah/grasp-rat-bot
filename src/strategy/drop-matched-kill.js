'use strict';

function roundedNonNegative(value) {
  return Math.max(0, Math.round(Number(value || 0)));
}

function roundedFiniteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : null;
}

function finiteNumberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function buildDropMatchedKillCore(target, amount, currentSummary = null, reason = '', options = {}) {
  const postAttackTarget = target?.postAttackTarget || null;
  if (!postAttackTarget) return null;
  const reward = roundedNonNegative(amount);
  const targetDrop = roundedNonNegative(postAttackTarget.drop);
  if (!reward || !targetDrop || reward !== targetDrop) return null;
  const coinTargetKey = typeof options.coinTargetKey === 'function'
    ? options.coinTargetKey(target)
    : '';
  const coinKey = coinTargetKey || ('xy:' + Math.round(Number(target?.x) || 0) + ':' + Math.round(Number(target?.y) || 0) + ':' + reward);
  const targetKey = postAttackTarget.id !== undefined && postAttackTarget.id !== null && postAttackTarget.id !== ''
    ? 'id:' + String(postAttackTarget.id)
    : 'name:' + String(postAttackTarget.name || '');
  const seenKey = 'drop-coin-match|' + targetKey + '|' + coinKey + '|' + reward;
  const seenKillKeys = options.seenKillKeys;
  if (seenKillKeys && typeof seenKillKeys.has === 'function' && seenKillKeys.has(seenKey)) return null;
  const t = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  const battleStartedAt = Number(postAttackTarget.battleStartedAt || 0) || 0;
  const rawBattleStaminaStart = postAttackTarget.battleStaminaSpentStartMs;
  const battleStaminaSpentStartMs = rawBattleStaminaStart !== null && rawBattleStaminaStart !== undefined && rawBattleStaminaStart !== ''
    ? Number(rawBattleStaminaStart)
    : NaN;
  const battleStaminaSpentEndMs = finiteNumberOrNull(options.sessionStaminaSpentMs);
  return {
    seenKey,
    kill: {
      at: t,
      time: '',
      victim: postAttackTarget.name || '',
      id: postAttackTarget.id ?? null,
      drop: targetDrop,
      rewardCoins: reward,
      reportedRewardCoins: reward,
      playerCategory: postAttackTarget.playerCategory || (postAttackTarget.afk === false ? 'active' : 'afk'),
      afk: postAttackTarget.afk !== false,
      active: postAttackTarget.active === true || postAttackTarget.playerCategory === 'active',
      combat: Boolean(postAttackTarget.combat),
      combatIntent: postAttackTarget.combatIntent || '',
      mode: postAttackTarget.mode || '',
      currentlyActive: Boolean(postAttackTarget.currentlyActive),
      moving: Boolean(postAttackTarget.moving),
      firing: Boolean(postAttackTarget.firing),
      matchedAttack: true,
      dropMatched: true,
      rewardConfirmed: true,
      chatConfirmed: false,
      source: 'drop-coin-match',
      targetDrop,
      attackDistance: roundedFiniteOrNull(postAttackTarget.distance),
      battleStartedAt,
      battleEndedAt: t,
      battleDurationMs: battleStartedAt ? Math.max(0, Math.round(t - battleStartedAt)) : 0,
      battleStaminaSpentStartMs: Number.isFinite(battleStaminaSpentStartMs) ? Math.max(0, Math.round(battleStaminaSpentStartMs)) : null,
      battleStaminaSpentEndMs: Number.isFinite(battleStaminaSpentEndMs) ? Math.max(0, Math.round(battleStaminaSpentEndMs)) : null,
      battleStaminaSpentMs: Number.isFinite(battleStaminaSpentStartMs) && Number.isFinite(battleStaminaSpentEndMs) ? Math.max(0, Math.round(battleStaminaSpentEndMs - battleStaminaSpentStartMs)) : null,
      sessionId: String(options.sessionId || ''),
      coin: {
        id: target?.id ?? target?.drop_id ?? target?.coin_id ?? null,
        amount: reward,
        x: roundedFiniteOrNull(target?.x),
        y: roundedFiniteOrNull(target?.y),
        distance: roundedFiniteOrNull(target?.distance)
      },
      attributionReason: reason || 'coin-pickup',
      self: currentSummary || null
    }
  };
}

module.exports = {
  buildDropMatchedKillCore
};
