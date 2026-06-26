'use strict';

function staminaExhaustedWindowLabel(staminaState) {
  return staminaExhaustedLongWindows(staminaState).join('/');
}

function staminaExhaustedLongWindows(staminaState) {
  const raw = Array.isArray(staminaState?.longExhausted)
    ? staminaState.longExhausted
    : (Array.isArray(staminaState?.exhausted) ? staminaState.exhausted : []);
  const windows = [];
  for (const item of raw) {
    const key = String(item || '').toLowerCase();
    if ((key === '1h' || key === '1d') && !windows.includes(key)) windows.push(key);
  }
  return windows;
}

function staminaEvidenceRemaining(evidence, windowName) {
  const key = String(windowName || '').toLowerCase();
  if (key !== '1h' && key !== '1d') return null;
  const suffix = key === '1h' ? '1h' : '1d';
  const candidates = [
    evidence?.stamina?.['stamina' + suffix],
    evidence?.['stamina' + suffix],
    evidence?.['stamina_' + suffix + '_remaining_milli'],
    key === '1d' ? evidence?.stamina1dLastRemaining : undefined
  ];
  for (const value of candidates) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function staminaHoldContradictedByStaminaEvidence(staminaState, evidence, thresholdMs = 1000) {
  const windows = staminaExhaustedLongWindows(staminaState);
  if (!windows.length || !evidence || typeof evidence !== 'object') return false;
  const threshold = Math.max(0, Number(thresholdMs) || 0);
  return windows.some(windowName => {
    const remaining = staminaEvidenceRemaining(evidence, windowName);
    return remaining !== null && remaining >= threshold;
  });
}

function offlineLeaveSummaryText(reason, offlineSafety) {
  if (offlineSafety?.staminaBudgetExit) return '一小时体力不足以拾取最近金币，退出等待重连';
  const staminaLabel = staminaExhaustedWindowLabel(offlineSafety?.staminaExhausted);
  if (staminaLabel === '1h') return '一小时体力到达限制，退出等待重连';
  if (staminaLabel === '1d') return '一天体力到达限制，退出等待重连';
  if (staminaLabel === '1h/1d') return '一小时和一天体力到达限制，退出等待重连';
  const text = String(reason || '').toLowerCase();
  if (text.includes('stamina')) return '长周期体力到达限制，退出等待重连';
  if (offlineSafety?.loginPointSafetyGate || text.includes('login point safety')) return '登录点安全快照未满足，退出等待安全重连';
  if (offlineSafety?.noSelfGameSession || text.includes('missing self')) return '已登录但自身实体不可见，退出等待重连';
  if (text.includes('combat tick gap') || offlineSafety?.combatTickGap) return '战斗主循环断档，按网络波动退出等待重连';
  if (text.includes('sampling outage') || offlineSafety?.samplingOutage) return '网络采样超时，按网络波动退出等待重连';
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
  const exitishDecisionReason = /(?:combat|injury|pursuit|offline|stamina).*leave|leave-(?:retry|wait)|control-(?:ws|global|combat)|stamina-exhausted/.test(decisionReason)
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
    || /(?:combat|injury|pursuit|offline|stamina).*leave|leave-(?:retry|wait)|control-(?:ws|global|combat)|stamina-exhausted/.test(reason);
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
  staminaExhaustedLongWindows,
  staminaExhaustedWindowLabel,
  staminaEvidenceRemaining,
  staminaHoldContradictedByStaminaEvidence,
  offlineLeaveSummaryText,
  combatLogExitSummaryFromDecision
};
