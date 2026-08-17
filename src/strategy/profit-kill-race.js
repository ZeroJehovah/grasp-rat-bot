'use strict';

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function idOf(value) {
  const id = value?.user_id ?? value?.userId ?? value?.id ?? value?.entity_id ?? value?.entityId;
  return id === null || id === undefined || id === '' ? '' : String(id);
}

function distanceBetween(left, right) {
  const values = [left?.x, left?.y, right?.x, right?.y].map(Number);
  return values.every(Number.isFinite) ? Math.hypot(values[0] - values[2], values[1] - values[3]) : Infinity;
}

function directionTo(from, to) {
  return {
    dx: Math.sign(Number(to?.x) - Number(from?.x)),
    dy: Math.sign(Number(to?.y) - Number(from?.y))
  };
}

function activeRealtimePlayer(entity, selfId, targetId) {
  const id = idOf(entity);
  if (!id || id === selfId || id === targetId || entity.alive === false) return false;
  if (entity.authority && entity.authority !== 'realtime') return false;
  if (entity.active === true) return true;
  // Normalized realtime frames can expose `active: false` for a stationary
  // player while the native join mode still identifies an active session.
  return String(entity.current_join_mode ?? entity.mode ?? '').toLowerCase() === 'active';
}

function profitKillRacePolicy(input = {}, options = {}) {
  const self = input.self;
  const target = input.target;
  const targetHp = numberOrNull(target?.hp ?? target?.knownHp ?? target?.displayHp);
  const distance = distanceBetween(self, target);
  const threshold = Math.max(1, Number(options.profitKillRaceHpThreshold ?? 20));
  const radius = Math.max(1, Number(options.profitKillRaceCloseDistanceCm ?? 100));
  const active = Boolean(input.primaryTarget === true && self && target && targetHp !== null && targetHp > 0 && targetHp < threshold);
  if (!active) return { active: false, reason: 'not-low-hp-primary-profit-target', distance: Number.isFinite(distance) ? distance : null };
  const selfId = idOf(self);
  const targetId = idOf(target);
  const competitors = (input.realtimeTargets || [])
    .filter(entity => activeRealtimePlayer(entity, selfId, targetId))
    .map(entity => ({
      id: idOf(entity),
      distanceCm: distanceBetween(entity, target)
    }))
    .filter(row => Number.isFinite(row.distanceCm));
  const closer = competitors.find(row => row.distanceCm < distance) || null;
  return {
    active: true,
    targetId,
    targetHp,
    distance: Number.isFinite(distance) ? distance : null,
    closeDistanceCm: radius,
    approaching: Number.isFinite(distance) && distance >= radius,
    direction: Number.isFinite(distance) && distance >= radius ? directionTo(self, target) : { dx: 0, dy: 0 },
    closerCompetitor: closer,
    fireAllowed: !closer,
    reason: closer ? 'active-player-closer-to-low-hp-profit-target' : 'no-closer-active-player'
  };
}

module.exports = {
  activeRealtimePlayer,
  distanceBetween,
  profitKillRacePolicy
};
