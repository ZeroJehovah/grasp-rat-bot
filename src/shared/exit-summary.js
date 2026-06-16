'use strict';

function staminaExhaustedWindowLabel(staminaState) {
  const raw = Array.isArray(staminaState?.longExhausted)
    ? staminaState.longExhausted
    : (Array.isArray(staminaState?.exhausted) ? staminaState.exhausted : []);
  const windows = [];
  for (const item of raw) {
    const key = String(item || '').toLowerCase();
    if ((key === '1h' || key === '1d') && !windows.includes(key)) windows.push(key);
  }
  return windows.join('/');
}

function offlineLeaveSummaryText(reason, offlineSafety) {
  if (offlineSafety?.staminaBudgetExit) return '一小时体力不足以拾取最近金币，退出等待重连';
  const staminaLabel = staminaExhaustedWindowLabel(offlineSafety?.staminaExhausted);
  if (staminaLabel === '1h') return '一小时体力到达限制，退出等待重连';
  if (staminaLabel === '1d') return '一天体力到达限制，退出等待重连';
  if (staminaLabel === '1h/1d') return '一小时和一天体力到达限制，退出等待重连';
  const text = String(reason || '').toLowerCase();
  if (text.includes('stamina')) return '长周期体力到达限制，退出等待重连';
  if (offlineSafety?.noSelfGameSession || text.includes('missing self')) return '已登录但自身实体不可见，退出等待重连';
  if (text.includes('reconnect churn') || offlineSafety?.reconnectChurn) return '网络连接反复重连，退出等待重连';
  if (text.includes('server position')) return '服务端位置停止，按离线处理，退出等待重连';
  if (offlineSafety?.unsafe) return '网络连接离线且周围危险，退出等待重连';
  return '网络连接离线，退出等待重连';
}

function combatLogExitSummaryFromDecision(decision) {
  const leave = decision?.leave || null;
  const detail = leave || decision || {};
  const leaveReason = String(leave?.reason || '');
  const decisionReason = String(decision?.reason || '');
  const pendingExit = decision?.pendingExit && typeof decision.pendingExit === 'object' ? decision.pendingExit : null;
  const canonicalCombatReason = /^combat-[a-z0-9-]+-leave$/.test(decisionReason) ? decisionReason : '';
  const exitishDecisionReason = /(?:combat|injury|pursuit|offline|stamina).*leave|leave-(?:retry|wait)|control-ws|stamina-exhausted/.test(decisionReason)
    ? decisionReason
    : '';
  const reason = canonicalCombatReason
    || (leaveReason && leaveReason !== 'cooldown' ? leaveReason : '')
    || (pendingExit ? 'pending-exit-active' : '')
    || exitishDecisionReason
    || decisionReason
    || leaveReason;
  const isExit = Boolean(leave)
    || Boolean(pendingExit)
    || decision?.kind === 'leave'
    || /(?:combat|injury|pursuit|offline|stamina).*leave|leave-(?:retry|wait)|control-ws|stamina-exhausted/.test(reason);
  if (!isExit) return null;
  return {
    reason,
    summary: leave?.summary || leave?.exitSummary || pendingExit?.summary || decision?.exitSummary || decision?.displayReason || '',
    displayReason: leave?.displayReason || pendingExit?.displayReason || decision?.displayReason || '',
    attempted: leave ? Boolean(leave.attempted) : null,
    error: leave?.error || pendingExit?.lastError || '',
    safeReloginAllowed: Boolean(detail.safeReloginAllowed || decision?.safeReloginAllowed),
    offlineSafety: detail.offlineSafety || decision?.offlineSafety || null,
    reloginUntil: detail.reloginUntil || 0,
    holdRemainingMs: detail.holdRemainingMs || 0,
    reloginDelayMs: detail.reloginDelayMs || 0,
    pendingLoginSuppressUntil: detail.pendingLoginSuppressUntil || 0,
    pendingLoginSuppressDelayMs: detail.pendingLoginSuppressDelayMs || 0,
    pendingLoginSuppressReason: detail.pendingLoginSuppressReason || '',
    pendingLoginSuppressMinimumDelayMs: detail.pendingLoginSuppressMinimumDelayMs || 0,
    pendingLoginSuppressHpDelayMs: detail.pendingLoginSuppressHpDelayMs || 0,
    pendingLoginSuppressHp: detail.pendingLoginSuppressHp || null
  };
}

module.exports = {
  staminaExhaustedWindowLabel,
  offlineLeaveSummaryText,
  combatLogExitSummaryFromDecision
};
