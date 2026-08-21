'use strict';

const DEFAULT_IDLE_STABLE_MS = 500;

function valueId(value) {
  return value === null || value === undefined || value === '' ? '' : String(value);
}

function actionTargetId(action = {}) {
  const target = action.target || action.lootTarget || {};
  return valueId(target.userId ?? target.user_id ?? target.entityId ?? target.entity_id ?? target.id);
}

function actionTargetKey(action = {}) {
  const kind = String(action.kind || '');
  const target = action.target || {};
  if (['combat-live', 'combat-dry-run', 'combat-candidate', 'attack', 'seek-enemy', 'opportunistic-shot'].includes(kind)) {
    const id = actionTargetId(action);
    return id ? `player:${id}` : '';
  }
  if (kind === 'post-attack-drop-wait') {
    const id = valueId(target.postAttackTarget?.id ?? target.id);
    return id ? `player:${id}` : '';
  }
  if (kind === 'coin' || kind === 'seek-coin') {
    const postAttackId = valueId(action.postAttackTarget?.id ?? target.postAttackTarget?.id);
    if (postAttackId) return `player:${postAttackId}`;
    const selfKilledDrop = Boolean(
      action.selfKilledPlayerDrop
      || action.playerDropPriority
      || target.selfKilledPlayerDrop
      || target.playerDropPriority
    );
    const sourceUserId = valueId(
      action.sourceUserId
      ?? action.source_user_id
      ?? target.sourceUserId
      ?? target.source_user_id
    );
    if (selfKilledDrop && sourceUserId) return `player:${sourceUserId}`;
    const id = valueId(target.key ?? target.id);
    return id ? `coin:${id}` : '';
  }
  return '';
}

function routeHasHighValueCoin(route, threshold) {
  return (route?.points || []).some(point => Number(point?.amount || 0) >= threshold);
}

function capturedCombatCommitmentBlocker(context = {}) {
  const commitmentKey = valueId(context.commitmentKey ?? context.restartDrain?.commitmentKey);
  if (!commitmentKey.startsWith('player:')) return null;
  const targetId = commitmentKey.slice('player:'.length);
  if (!targetId) return null;
  const combatTarget = context.decisionState?.combatTarget || null;
  const combatTargetId = valueId(combatTarget?.id ?? combatTarget?.userId ?? combatTarget?.user_id);
  if (combatTargetId !== targetId) return null;
  const hp = Number(combatTarget?.hp ?? combatTarget?.displayHp);
  if (Number.isFinite(hp) && hp <= 0) return null;
  return {
    commitmentKey,
    targetId,
    targetName: String(combatTarget?.name || ''),
    targetHp: Number.isFinite(hp) ? hp : null,
    reason: String(combatTarget?.reason || '')
  };
}

function capturedProfitCommitmentBlocker(context = {}) {
  const commitmentKey = valueId(context.commitmentKey ?? context.restartDrain?.commitmentKey);
  if (!commitmentKey.startsWith('player:')) return null;
  const targetId = commitmentKey.slice('player:'.length);
  if (!targetId) return null;
  const mission = context.decisionState?.profitMission || null;
  if (!mission || mission.active === false) return null;
  if (!['enemy', 'remote-player-navigation'].includes(String(mission.type || ''))) return null;
  const missionTargetId = valueId(
    mission.targetId
      ?? mission.subjectId
      ?? mission.target?.userId
      ?? mission.target?.user_id
      ?? mission.navigationTarget?.userId
      ?? mission.navigationTarget?.user_id
  );
  if (missionTargetId !== targetId) return null;
  return {
    commitmentKey,
    targetId,
    targetName: String(mission.navigationTarget?.name || mission.target?.name || ''),
    targetDrop: Number.isFinite(Number(mission.navigationTarget?.drop ?? mission.target?.drop))
      ? Number(mission.navigationTarget?.drop ?? mission.target?.drop)
      : null,
    missionType: String(mission.type || ''),
    missionKey: String(mission.key || mission.missionKey || ''),
    highValue: mission.highValue === true
  };
}

function evaluateRestartReadiness(context = {}, options = {}) {
  if (context.online === false) return { ready: true, reason: 'offline', blocker: null };
  if (context.leavePending?.active) return { ready: false, reason: 'leave-pending', blocker: context.leavePending };
  const commitmentKey = valueId(context.commitmentKey ?? context.restartDrain?.commitmentKey);
  const settlement = context.decisionState?.postKillSettlement || context.postKillSettlement || null;
  if (settlement?.active !== false && settlement?.targetId) {
    return { ready: false, reason: 'post-kill-settlement', blocker: settlement };
  }
  const capturedCombatBlocker = capturedCombatCommitmentBlocker(context);
  if (capturedCombatBlocker) {
    return { ready: false, reason: 'captured-combat-commitment-active', blocker: capturedCombatBlocker };
  }
  const capturedProfitBlocker = capturedProfitCommitmentBlocker(context);
  if (capturedProfitBlocker) {
    return { ready: false, reason: 'captured-profit-commitment-active', blocker: capturedProfitBlocker };
  }

  const decision = context.decision || {};
  const action = decision.action || context.action || decision;
  const kind = String(action?.kind || decision.kind || '');
  const band = String(action?.band || decision.band || '');
  const reason = String(action?.reason || decision.reason || '');
  const target = action?.target || {};
  if (commitmentKey.startsWith('player:') && (kind === 'coin' || kind === 'seek-coin')) {
    const committedTargetKey = actionTargetKey(action);
    if (committedTargetKey !== commitmentKey) {
      return {
        ready: false,
        reason: 'captured-player-commitment-pickup-pending',
        blocker: { commitmentKey, kind, targetId: commitmentKey.slice('player:'.length) }
      };
    }
  }
  if (!kind) return { ready: false, reason: 'unknown-action', blocker: { kind, band, reason } };
  if (action?.shouldLeave || kind === 'leave' || kind === 'safety-exit') {
    return { ready: false, exiting: true, reason: 'exit-in-progress', blocker: { kind, reason } };
  }
  if (band === 'combat' || kind.startsWith('combat-')) {
    return { ready: false, reason: 'combat-active', blocker: { kind, targetId: actionTargetId(action) } };
  }
  if (kind === 'post-attack-drop-wait' || /post-(?:attack|kill)-drop|post-kill-settlement/.test(reason)) {
    return { ready: false, reason: 'post-kill-settlement', blocker: { kind, reason, targetId: actionTargetId(action) } };
  }
  if (kind === 'attack' || kind === 'seek-enemy' || kind === 'opportunistic-shot') {
    const drop = Number(target.drop);
    const threshold = kind === 'seek-enemy'
      ? Math.max(1, Number(options.attackApproachMinDrop ?? 12))
      : Math.max(1, Number(options.attackMinDrop ?? 8));
    if (/chase|easy-kill/.test(reason) || (Number.isFinite(drop) && drop >= threshold)) {
      return { ready: false, reason: 'high-drop-player-task', blocker: { kind, reason, drop, threshold, targetId: actionTargetId(action) } };
    }
    return { ready: true, reason: 'low-value-player-task', blocker: null };
  }
  if (kind === 'coin' || kind === 'seek-coin') {
    const threshold = Math.max(1, Number(options.highValueCoinPriorityAmount ?? 10));
    const amount = Number(target.amount || 0);
    if (action.postAttackTarget || target.postAttackTarget || target.selfKilledPlayerDrop || /player-drop|post-kill/.test(reason)) {
      return { ready: false, reason: 'player-drop-pickup', blocker: { kind, reason, amount } };
    }
    if (amount >= threshold || routeHasHighValueCoin(target.coinRoute, threshold)) {
      return { ready: false, reason: 'high-value-coin-task', blocker: { kind, reason, amount, threshold } };
    }
    return { ready: true, reason: amount === 1 ? 'single-coin-task' : 'ordinary-coin-task', blocker: null };
  }
  if (band === 'wait' || band === 'recover'
    || ['wait', 'recover', 'patrol', 'flee', 'return-block-scan', 'stop', 'loop-wait'].includes(kind)
    || /single-coin-bait/.test(reason)) {
    return { ready: true, reason: 'abandonable-idle-task', blocker: null };
  }
  if (band === 'safety') return { ready: true, reason: 'safety-handoff', blocker: null };
  return { ready: false, reason: 'unknown-action', blocker: { kind, band, reason } };
}

function createRestartDrainCoordinator(options = {}) {
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const stableMs = Math.max(0, Number(options.idleStableMs ?? DEFAULT_IDLE_STABLE_MS));
  let request = null;
  let assessment = null;
  let readySince = 0;
  const waiters = new Set();

  function notify() {
    for (const resolve of waiters) resolve({ interrupted: true, reason: request?.reason || 'restart-drain' });
    waiters.clear();
  }

  function requestDrain(reason = 'restart-drain', detail = {}) {
    if (!request) {
      const atMs = now();
      request = {
        requested: true,
        reason,
        detail,
        requestedAtMs: atMs,
        requestedAt: new Date(atMs).toISOString(),
        commitmentKey: detail.commitmentKey || ''
      };
      notify();
    }
    return status();
  }

  function observe(nextAssessment) {
    if (!request) return status();
    assessment = nextAssessment || { ready: false, reason: 'missing-assessment' };
    const atMs = now();
    if (assessment.ready) {
      if (!readySince) readySince = atMs;
    } else {
      readySince = 0;
    }
    return status();
  }

  function status() {
    const atMs = now();
    return {
      requested: Boolean(request),
      ...(request || {}),
      assessment,
      readySince,
      stableMs,
      ready: Boolean(request && assessment?.ready && atMs - readySince >= stableMs),
      waitMs: request ? Math.max(0, atMs - Number(request.requestedAtMs || atMs)) : 0
    };
  }

  function wait(ms, sleep) {
    if (request) return Promise.resolve({ interrupted: true, reason: request.reason });
    const sleeper = typeof sleep === 'function' ? sleep : delay => new Promise(resolve => setTimeout(resolve, delay));
    return Promise.race([
      sleeper(ms).then(() => ({ interrupted: false, reason: 'timeout' })),
      new Promise(resolve => waiters.add(resolve))
    ]);
  }

  return {
    isRequested: () => Boolean(request),
    observe,
    requestDrain,
    status,
    wait
  };
}

function restartDrainAllowsDecision(decision, drainStatus = {}) {
  if (!drainStatus.requested) return true;
  const action = decision?.action || decision || {};
  const band = String(action.band || decision?.band || '');
  if (band === 'safety' || action.shouldLeave) return true;
  const commitmentKey = String(drainStatus.commitmentKey || '');
  const reason = String(action.reason || decision?.reason || '');
  if (commitmentKey.startsWith('player:') && /post-(?:attack|kill)-drop|post-kill/.test(reason)) {
    return actionTargetKey(action) === commitmentKey;
  }
  if (!commitmentKey) return evaluateRestartReadiness({ online: true, decision }).ready;
  const targetKey = actionTargetKey(action);
  if (targetKey === commitmentKey) return true;
  const defensive = band === 'combat'
    && (action.target?.combatIntent === 'defensive' || action.target?.firing === true);
  return defensive || evaluateRestartReadiness({ online: true, decision }).ready;
}

function restartDrainRetainsCommittedDecision(decision, drainStatus = {}) {
  if (!drainStatus.requested) return false;
  const commitmentKey = String(drainStatus.commitmentKey || '');
  if (!commitmentKey) return false;
  const action = decision?.action || decision || {};
  return actionTargetKey(action) === commitmentKey
    && restartDrainAllowsDecision(decision, drainStatus);
}

module.exports = {
  DEFAULT_IDLE_STABLE_MS,
  actionTargetKey,
  capturedCombatCommitmentBlocker,
  capturedProfitCommitmentBlocker,
  createRestartDrainCoordinator,
  evaluateRestartReadiness,
  restartDrainAllowsDecision,
  restartDrainRetainsCommittedDecision
};
