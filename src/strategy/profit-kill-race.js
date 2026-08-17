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

function realtimePlayerActivity(entity) {
  const mode = String(entity?.current_join_mode ?? entity?.mode ?? '').toLowerCase();
  if (mode === 'active') return 'active';
  if (mode === 'passive' || mode === 'afk') return 'passive';
  if (entity?.active === true) return 'active';
  if (entity?.active === false) return 'passive';
  return 'unknown';
}

function activeRealtimePlayer(entity, selfId, targetId) {
  const id = idOf(entity);
  if (!id || id === selfId || id === targetId || entity.alive === false) return false;
  if (entity.authority && entity.authority !== 'realtime') return false;
  return realtimePlayerActivity(entity) === 'active';
}

function profitKillRacePolicy(input = {}, options = {}) {
  const self = input.self;
  const target = input.target;
  const targetHp = numberOrNull(target?.hp ?? target?.knownHp ?? target?.displayHp);
  const distance = distanceBetween(self, target);
  const threshold = Math.max(1, Number(options.profitKillRaceHpThreshold ?? 20));
  const pickupRadius = Math.max(1, Number(
    options.profitKillRaceCloseDistanceCm
      ?? options.playerDropPickupRadiusCm
      ?? 150
  ));
  const competitorRadius = Math.max(1, Number(options.profitKillRaceCompetitorRadiusCm ?? 8000));
  const targetActivity = realtimePlayerActivity(target);
  const eligibleTarget = targetActivity === 'passive'
    || (targetActivity === 'active' && targetHp !== null && targetHp > 0 && targetHp < threshold);
  const eligible = Boolean(
    input.primaryTarget === true
      && self
      && target
      && targetHp !== null
      && targetHp > 0
      && eligibleTarget
  );
  if (!eligible) {
    return {
      active: false,
      reason: 'target-not-passive-or-low-hp-active',
      targetActivity,
      distance: Number.isFinite(distance) ? distance : null,
      pickupRadiusCm: pickupRadius,
      competitorRadiusCm: competitorRadius
    };
  }
  const selfId = idOf(self);
  const targetId = idOf(target);
  const competitors = (input.realtimeTargets || [])
    .filter(entity => activeRealtimePlayer(entity, selfId, targetId))
    .map(entity => ({
      id: idOf(entity),
      distanceCm: distanceBetween(entity, target)
    }))
    .filter(row => Number.isFinite(row.distanceCm) && row.distanceCm <= competitorRadius)
    .sort((left, right) => left.distanceCm - right.distanceCm);
  const nearestCompetitor = competitors[0] || null;
  if (!nearestCompetitor) {
    return {
      active: false,
      reason: 'no-nearby-active-competitor',
      targetId,
      targetHp,
      targetActivity,
      distance: Number.isFinite(distance) ? distance : null,
      pickupRadiusCm: pickupRadius,
      competitorRadiusCm: competitorRadius,
      competitorCount: 0
    };
  }
  const insidePickupRadius = Number.isFinite(distance) && distance <= pickupRadius;
  const strictlyCloser = Number.isFinite(distance) && distance < nearestCompetitor.distanceCm;
  const fireAllowed = insidePickupRadius || strictlyCloser;
  return {
    active: true,
    targetId,
    targetHp,
    targetActivity,
    distance: Number.isFinite(distance) ? distance : null,
    closeDistanceCm: pickupRadius,
    pickupRadiusCm: pickupRadius,
    competitorRadiusCm: competitorRadius,
    competitorCount: competitors.length,
    insidePickupRadius,
    selfStrictlyCloser: strictlyCloser,
    approaching: Number.isFinite(distance) && distance > pickupRadius,
    direction: Number.isFinite(distance) && distance > pickupRadius ? directionTo(self, target) : { dx: 0, dy: 0 },
    nearestCompetitor,
    closerCompetitor: fireAllowed ? null : nearestCompetitor,
    fireAllowed,
    reason: insidePickupRadius
      ? 'inside-player-drop-pickup-radius'
      : (strictlyCloser
          ? 'self-closer-to-primary-profit-target'
          : 'active-player-as-close-or-closer-to-primary-profit-target')
  };
}

module.exports = {
  activeRealtimePlayer,
  distanceBetween,
  profitKillRacePolicy,
  realtimePlayerActivity
};
