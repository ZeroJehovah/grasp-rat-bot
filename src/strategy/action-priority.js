'use strict';

const ACTION_PRIORITY_BANDS = {
  exit: 'exit',
  safety: 'safety',
  combat: 'combat',
  profit: 'profit',
  recover: 'recover',
  wait: 'wait'
};

function roundedNullable(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : null;
}

function actionPriorityBand(action) {
  const kind = String(action?.kind || '');
  const explicitBand = String(action?.band || '');
  if (Object.prototype.hasOwnProperty.call(ACTION_PRIORITY_BANDS, explicitBand)) return explicitBand;
  if (kind === 'leave') return 'exit';
  if (kind === 'flee' || kind === 'safety-exit') return 'safety';
  if (kind === 'recover') return 'recover';
  if (kind === 'combat-live' || kind === 'combat-candidate' || kind === 'combat-dry-run') return 'combat';
  if (kind === 'patrol' && !action?.target && String(action?.reason || '') === 'return-to-center-activity-radius') return 'recover';
  if (action?.combat || (kind === 'wait' && action?.target && action?.combat)) return 'combat';
  if (kind === 'attack' || kind === 'seek-enemy' || kind === 'seek-drop' || kind === 'coin' || kind === 'seek-coin') return 'profit';
  if (kind === 'patrol' && (action?.target || String(action?.reason || '').includes('coin'))) return 'profit';
  if (kind === 'wait' || kind === 'idle') return 'wait';
  return kind || 'action';
}

function actionFocusTargetType(action, target) {
  const kind = String(action?.kind || '');
  const reason = String(action?.reason || '');
  if (kind === 'coin' || kind === 'seek-coin') return 'coin';
  if (kind === 'patrol' && (String(reason).includes('coin') || target?.amount !== undefined)) return 'coin';
  if (target?.coinRoute || target?.amount !== undefined || target?.fieldAmount !== undefined) return 'coin';
  return 'enemy';
}

function actionFocusId(target, fallback = '') {
  const id = target?.id ?? target?.user_id ?? target?.drop_id ?? target?.coin_id ?? target?.targetId;
  if (id !== undefined && id !== null && id !== '') return String(id);
  const name = target?.name || target?.label;
  if (name) return 'name:' + String(name);
  const x = Number(target?.x);
  const y = Number(target?.y);
  if (Number.isFinite(x) && Number.isFinite(y)) return 'xy:' + Math.round(x) + ':' + Math.round(y);
  return String(fallback || '');
}

function actionFocusSummary(action, options = {}) {
  if (!action || typeof action !== 'object') return null;
  const kind = String(action.kind || '');
  const reason = String(action.reason || '');
  const band = actionPriorityBand(action);
  const target = action.target && typeof action.target === 'object' ? action.target : null;
  let type = '';
  let id = '';
  let label = '';
  let targeted = false;
  if (target) {
    type = actionFocusTargetType(action, target);
    id = actionFocusId(target, type);
    label = String(target.name || target.label || id || '');
    targeted = type === 'coin' || type === 'enemy';
  } else if (kind === 'flee') {
    const threat = Array.isArray(action.threats) ? action.threats[0] : null;
    type = 'safety';
    id = actionFocusId(threat, reason || kind);
    label = String(threat?.name || threat?.label || id || reason || kind);
  } else {
    type = band || kind || 'action';
    id = reason || kind || type;
    label = id;
  }
  const score = Number(action.score ?? action.opportunityChoice?.score);
  const staminaCost = Number(action.staminaCost ?? action.opportunityChoice?.staminaCost);
  const nowMs = Number(options.nowMs);
  return {
    key: String(type || 'action') + ':' + String(id || ''),
    type,
    id,
    label,
    kind,
    reason,
    band,
    targetKey: id,
    targeted,
    score: Number.isFinite(score) ? Math.round(score) : null,
    staminaCost: Number.isFinite(staminaCost) ? Math.round(staminaCost) : null,
    priorityTier: roundedNullable(action.opportunityChoice?.priorityTier),
    distance: roundedNullable(target?.distance),
    amount: roundedNullable(target?.amount),
    drop: roundedNullable(target?.drop),
    hp: roundedNullable(target?.hp),
    combat: Boolean(action.combat),
    shoot: Boolean(action.shoot),
    opportunisticShot: Boolean(action.opportunisticShot),
    dx: roundedNullable(action.dx),
    dy: roundedNullable(action.dy),
    at: Number.isFinite(nowMs) ? nowMs : Date.now()
  };
}

function getActionTargetKey(action) {
  return actionFocusSummary(action)?.key || null;
}

module.exports = {
  ACTION_PRIORITY_BANDS,
  actionPriorityBand,
  actionFocusTargetType,
  actionFocusId,
  actionFocusSummary,
  getActionPriorityBand: actionPriorityBand,
  getActionTargetKey,
  buildActionFocus: actionFocusSummary
};
