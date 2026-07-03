'use strict';

function leaveWaitDisplayCore(base, detail, formatDurationMs) {
  const summary = String(base || '').trim();
  const waitMs = Number(detail?.holdRemainingMs ?? detail?.reloginDelayMs ?? 0);
  if (!summary || !Number.isFinite(waitMs) || waitMs <= 0) return summary;
  return summary + '，等待' + formatDurationMs(waitMs);
}

function finalizeLeaveDisplayReasonCore(detail, leaveWaitDisplay) {
  if (!detail) return detail;
  const base = String(detail.summary || detail.exitSummary || detail.enemyLeaveSummary || detail.reason || '').trim();
  if (!base) return detail;
  detail.summary = base;
  detail.displayReason = leaveWaitDisplay(base, detail);
  return detail;
}

function normalizeEnemyActorCore(actor) {
  if (!actor) return null;
  const rawId = actor.user_id ?? actor.id ?? actor.targetId;
  const id = rawId !== undefined && rawId !== null && rawId !== '' ? String(rawId) : '';
  const name = String(actor.name ?? actor.targetName ?? '').trim();
  const key = id ? 'id:' + id : (name ? 'name:' + name : '');
  if (!key) return null;
  return {
    key,
    id,
    name,
    label: name || ('#' + id)
  };
}

function enemyActorFromLeaveDetailCore(detail, normalizeEnemyActor) {
  return normalizeEnemyActor(detail?.enemyActor)
    || normalizeEnemyActor(detail?.target)
    || normalizeEnemyActor(detail?.pursuit)
    || normalizeEnemyActor(detail?.injury?.nearestActive)
    || normalizeEnemyActor(detail?.injury?.nearestAvoidance)
    || normalizeEnemyActor(detail?.injury?.nearestHuman)
    || null;
}

function enemyRepeatDelayMsForCountCore(count, cfg) {
  const n = Math.max(0, Number(count) || 0);
  const secondMs = Math.max(0, Number(cfg.enemyReloginRepeatSecondMaxMs) || 0);
  const thirdMs = Math.max(secondMs, Number(cfg.enemyReloginRepeatThirdMaxMs) || 0);
  if (n >= 3) return thirdMs;
  if (n >= 2) return secondMs;
  return 0;
}

module.exports = {
  leaveWaitDisplayCore,
  finalizeLeaveDisplayReasonCore,
  normalizeEnemyActorCore,
  enemyActorFromLeaveDetailCore,
  enemyRepeatDelayMsForCountCore
};
