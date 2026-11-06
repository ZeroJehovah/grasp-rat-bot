'use strict';

// Presentation only: a retained profit candidate is not an active primary.
// Keep this projection identical in compact status and the browser fallback.
function panelTargetRolesCore(status = {}) {
  const explicit = status.targets;
  const action = status.action || status.decision?.action || {};
  const combat = status.combat || {};
  const target = action.target || null;
  const isSecondary = value => value?.combatRole === 'secondary' || value?.secondaryTarget === true;
  const identity = value => String(value?.userId ?? value?.entityId ?? value?.id ?? '');
  const suppressed = ['recover', 'wait', 'loop-wait', 'snapshot-wait', 'stop', 'stopped'].includes(String(action.kind || ''));
  let primary = null;
  let secondary = null;
  if (explicit && typeof explicit === 'object') {
    // Explicit nulls are authoritative too; never resurrect a retained mission.
    primary = explicit.primary || null;
    secondary = explicit.secondary || null;
  } else {
    secondary = isSecondary(target)
      ? target
      : (!suppressed && action.kind === 'combat-live' ? combat.secondaryTarget || null : null);
    primary = target && !isSecondary(target) ? target : null;
    if (!primary && !suppressed) {
      if (action.lootTarget) {
        primary = action.lootTarget;
      } else if (secondary) {
        const boundId = String(secondary.primaryTargetId || '');
        primary = boundId ? [combat.primaryTarget, combat.profitMission?.navigationTarget,
          status.profit?.mission?.navigationTarget].find(value => identity(value) === boundId) || null : null;
      } else {
        primary = combat.primaryTarget || null;
      }
    }
  }
  if (primary && secondary && primary.type !== 'coin' && identity(primary)
    && identity(primary) === identity(secondary)) primary = null;
  return {
    mode: primary && secondary ? 'dual' : (primary ? 'primary-only' : (secondary ? 'secondary-only' : 'none')),
    primary,
    secondary
  };
}

function postKillPresentationCore(status = {}) {
  const action = status.action || status.decision?.action || {};
  if (action.kind !== 'post-attack-drop-wait') return null;
  const settlement = action.postKillSettlement || {};
  if (settlement.pickupEvidence === true || settlement.phase === 'picked-up') {
    return { title: '掉落已拾取', reason: '已确认拾取结果' };
  }
  if (settlement.active === false || ['settled', 'expired', 'complete'].includes(settlement.phase)) {
    return { title: '收益确认结束', reason: '本次掉落确认已结束' };
  }
  const coin = settlement.matchedCoinKey && (status.nearby?.c || [])
    .find(row => String(row?.[0]) === String(settlement.matchedCoinKey));
  if (coin) return { title: '正在拾取掉落', reason: '掉落已出现，正在确认拾取结果' };
  if (settlement.phase === 'drop-visible') {
    return { title: '正在确认拾取结果', reason: '掉落已出现，正在核对是否已拾取' };
  }
  if (action.postKillSettlementMovement?.arrived === false
    || action.reason === 'post-attack-drop-wait-position') {
    return { title: '正在前往掉落位置', reason: '前往击杀位置确认掉落' };
  }
  return { title: '正在确认击杀收益', reason: '正在核对掉落或拾取结果' };
}

module.exports = { panelTargetRolesCore, postKillPresentationCore };
