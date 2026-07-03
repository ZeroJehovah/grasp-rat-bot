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

function readEnemyLeaveStreakCore(storage, key, bot, cfg, t, enemyRepeatDelayMsForCount) {
  let streak = null;
  try {
    streak = JSON.parse(storage.getItem(key) || 'null');
  } catch (_) {
    streak = null;
  }
  if (!streak || typeof streak !== 'object' || !streak.key) return null;
  const resetMs = Math.max(0, Number(cfg.enemyReloginRepeatResetMs) || 0);
  if (resetMs && t - Number(streak.at || 0) > resetMs) {
    try {
      storage.removeItem(key);
    } catch (_) {}
    if (bot.enemyLeaveStreak?.key === streak.key) bot.enemyLeaveStreak = null;
    return null;
  }
  const normalized = {
    key: String(streak.key),
    id: streak.id === undefined || streak.id === null ? '' : String(streak.id),
    name: String(streak.name || ''),
    label: String(streak.label || streak.name || (streak.id ? '#' + streak.id : '')),
    count: Math.max(1, Number(streak.count || 1)),
    firstAt: Number(streak.firstAt || streak.at || t),
    previousAt: Number(streak.previousAt || 0),
    at: Number(streak.at || t),
    resetMs
  };
  normalized.reloginMinMs = enemyRepeatDelayMsForCount(normalized.count);
  bot.enemyLeaveStreak = normalized;
  return normalized;
}

function writeEnemyLeaveStreakCore(storage, key, bot, streak) {
  bot.enemyLeaveStreak = streak;
  try {
    storage.setItem(key, JSON.stringify(streak));
  } catch (_) {}
}

function updateEnemyLeaveStreakCore(detail, t, helpers) {
  const actor = helpers.enemyActorFromLeaveDetail(detail);
  if (!actor) {
    helpers.readEnemyLeaveStreak(t);
    if (detail) detail.enemyLeaveStreak = null;
    return null;
  }
  const previous = helpers.readEnemyLeaveStreak(t);
  const same = previous && previous.key === actor.key;
  const count = same ? Number(previous.count || 1) + 1 : 1;
  const streak = {
    ...actor,
    count,
    firstAt: same ? Number(previous.firstAt || previous.at || t) : t,
    previousAt: same ? Number(previous.at || 0) : 0,
    at: t,
    resetMs: Math.max(0, Number(helpers.cfg.enemyReloginRepeatResetMs) || 0),
    reloginMinMs: helpers.enemyRepeatDelayMsForCount(count)
  };
  helpers.writeEnemyLeaveStreak(streak);
  if (detail) {
    detail.enemyActor = actor;
    detail.enemyLeaveStreak = streak;
    if (streak.reloginMinMs > 0) {
      detail.reloginRepeatDelayMs = streak.reloginMinMs;
      detail.reloginRepeatCount = streak.count;
    }
  }
  return streak;
}

module.exports = {
  leaveWaitDisplayCore,
  finalizeLeaveDisplayReasonCore,
  normalizeEnemyActorCore,
  enemyActorFromLeaveDetailCore,
  enemyRepeatDelayMsForCountCore,
  readEnemyLeaveStreakCore,
  writeEnemyLeaveStreakCore,
  updateEnemyLeaveStreakCore
};
