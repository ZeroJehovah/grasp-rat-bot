'use strict';

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function idOf(entity) {
  const id = entity?.user_id ?? entity?.userId ?? entity?.entity_id ?? entity?.entityId ?? entity?.id;
  return id === null || id === undefined || id === '' ? '' : String(id);
}

function moving(entity) {
  const vx = numberOrNull(entity?.vx ?? entity?.velocity?.x);
  const vy = numberOrNull(entity?.vy ?? entity?.velocity?.y);
  return (vx !== null && Math.abs(vx) > 0) || (vy !== null && Math.abs(vy) > 0);
}

function firing(entity) {
  return entity?.firing === true
    || entity?.shooting === true
    || entity?.is_firing === true
    || entity?.isShooting === true;
}

function active(entity) {
  const mode = String(entity?.current_join_mode ?? entity?.currentJoinMode ?? entity?.mode ?? '').toLowerCase();
  return entity?.active === true || mode === 'active';
}

function bulletOwnerId(bullet) {
  const id = bullet?.owner_user_id ?? bullet?.ownerUserId ?? bullet?.owner_id ?? bullet?.ownerId
    ?? bullet?.user_id ?? bullet?.userId;
  return id === null || id === undefined || id === '' ? '' : String(id);
}

function distance(left, right) {
  const lx = numberOrNull(left?.x);
  const ly = numberOrNull(left?.y);
  const rx = numberOrNull(right?.x);
  const ry = numberOrNull(right?.y);
  return lx === null || ly === null || rx === null || ry === null
    ? null
    : Math.hypot(rx - lx, ry - ly);
}

function evidenceMap(input = {}, options = {}) {
  const evidence = new Map();
  const add = (id, reason) => {
    const key = String(id || '');
    if (!key) return;
    const current = evidence.get(key) || { id: key, reasons: [], entity: null };
    if (reason && !current.reasons.includes(reason)) current.reasons.push(reason);
    evidence.set(key, current);
  };
  const entities = Array.isArray(input.entities) ? input.entities : [];
  for (const entity of entities) {
    const id = idOf(entity);
    if (!id) continue;
    if (active(entity)) add(id, 'active');
    if (moving(entity)) add(id, 'moving');
    if (firing(entity)) add(id, 'firing');
    const item = evidence.get(id);
    if (item) {
      item.entity = entity;
      item.fresh = true;
    }
  }
  for (const bullet of Array.isArray(input.bullets) ? input.bullets : []) {
    const id = bulletOwnerId(bullet);
    if (!id) {
      evidence.set('', { id: '', reasons: ['unknown-bullet-owner'], entity: null, fresh: false });
      continue;
    }
    add(id, 'bullet-owner');
    const item = evidence.get(id);
    if (item && !item.entity) {
      item.entity = entities.find(entity => idOf(entity) === id) || null;
      item.fresh = Boolean(item.entity);
    }
  }
  if (options.includeDailyDamage !== false) {
    for (const rawId of Array.isArray(input.damagingPlayerIds) ? input.damagingPlayerIds : []) {
      const id = rawId === null || rawId === undefined ? '' : String(rawId);
      if (!id) continue;
      if (id === '__damage-evidence-unavailable__') {
        add(id, 'daily-damage-evidence-unavailable');
        continue;
      }
      // The daily-damage ledger persists until the UTC+8 day changes, while
      // `entities` is the current realtime player set. An absent historical
      // actor has no current nearby position, so it must not become a
      // synthetic danger target that disables the five-frame grid all day.
      const entity = entities.find(candidate => idOf(candidate) === id) || null;
      if (!entity) continue;
      add(id, 'daily-damage');
      const item = evidence.get(id);
      item.entity = entity;
      item.fresh = true;
    }
  }
  return evidence;
}

function evaluateAfkFiveFrameSafety(input = {}, options = {}) {
  const self = input.self || null;
  const target = input.target || null;
  const selfId = idOf(self);
  const targetId = idOf(target);
  const freshMs = Math.max(1, Number(options.freshMs ?? 500) || 500);
  const receivedAtMs = numberOrNull(input.receivedAtMs);
  const nowMs = numberOrNull(input.nowMs) ?? receivedAtMs;
  const explicitFrameAgeMs = numberOrNull(input.frameAgeMs);
  const frameAgeMs = explicitFrameAgeMs !== null
    ? Math.max(0, explicitFrameAgeMs)
    : (receivedAtMs === null || nowMs === null ? null : Math.max(0, nowMs - receivedAtMs));
  const fullRangeCm = Math.max(0, Number(options.fullRangeCm ?? 1000) || 1000);
  const dangerRadiusCm = Math.max(0, Number(
    options.dangerRadiusCm
      ?? Number(options.attackRangeCm ?? 14500) + Number(options.dodgeRangeBufferCm ?? 1000)
  ) || 0);
  const targetDistanceCm = distance(self, target);
  const evidence = evidenceMap(input);
  const blockers = [];
  const dangerPlayers = [];
  if (input.finalActionStationary !== true) blockers.push('final-action-still-moves');
  if (frameAgeMs === null || frameAgeMs > freshMs) blockers.push('realtime-position-not-fresh');
  if (targetDistanceCm === null || targetDistanceCm > fullRangeCm) blockers.push('target-not-at-station');
  if (!self || !target) blockers.push('missing-self-or-target');
  const targetEvidence = evidence.get(targetId);
  if (targetEvidence) {
    if (targetEvidence.reasons.includes('bullet-owner') || targetEvidence.reasons.includes('moving')
      || targetEvidence.reasons.includes('firing') || targetEvidence.reasons.includes('active')) {
      blockers.push('target-no-longer-afk');
    }
  }
  const unknownBulletOwner = evidence.get('');
  if (unknownBulletOwner) blockers.push('ambiguous-bullet-owner');
  for (const item of evidence.values()) {
    if (!item.id || item.id === selfId || item.id === targetId) continue;
    if (!item.fresh || !item.entity) {
      blockers.push(`danger-position-missing:${item.id}`);
      continue;
    }
    const selfDistanceCm = distance(self, item.entity);
    const targetDistance = distance(target, item.entity);
    if (selfDistanceCm === null || targetDistance === null) {
      blockers.push(`danger-position-missing:${item.id}`);
      continue;
    }
    const insideSelf = selfDistanceCm !== null && selfDistanceCm <= dangerRadiusCm;
    const insideTarget = targetDistance !== null && targetDistance <= dangerRadiusCm;
    if (insideSelf || insideTarget) {
      dangerPlayers.push({
        id: item.id,
        reasons: [...item.reasons],
        selfDistanceCm: selfDistanceCm === null ? null : Math.round(selfDistanceCm),
        targetDistanceCm: targetDistance === null ? null : Math.round(targetDistance)
      });
    }
  }
  if (dangerPlayers.length) blockers.push('danger-player-in-radius');
  return {
    allowed: blockers.length === 0,
    gridStep: blockers.length === 0 ? 5 : 10,
    reason: blockers.length === 0 ? 'safe-afk-five-frame-ready' : 'safe-afk-five-frame-blocked',
    blockers,
    targetDistanceCm: targetDistanceCm === null ? null : Math.round(targetDistanceCm),
    fullRangeCm: Math.round(fullRangeCm),
    dangerRadiusCm: Math.round(dangerRadiusCm),
    frameAgeMs: frameAgeMs === null ? null : Math.round(frameAgeMs),
    freshMs,
    dangerPlayers
  };
}

function evaluateAfkPrearrivalCompetition(input = {}, options = {}) {
  const self = input.self || null;
  const target = input.target || null;
  const selfId = idOf(self);
  const targetId = idOf(target);
  const freshMs = Math.max(1, Number(options.freshMs ?? 500) || 500);
  const receivedAtMs = numberOrNull(input.receivedAtMs);
  const nowMs = numberOrNull(input.nowMs) ?? receivedAtMs;
  const explicitFrameAgeMs = numberOrNull(input.frameAgeMs);
  const frameAgeMs = explicitFrameAgeMs !== null
    ? Math.max(0, explicitFrameAgeMs)
    : (receivedAtMs === null || nowMs === null ? null : Math.max(0, nowMs - receivedAtMs));
  const ownDistanceCm = distance(self, target);
  // Pre-arrival competition is about observable activity, not today's damage
  // history alone. A stationary player who merely damaged us earlier must not
  // suppress the full-health pre-arrival window; active/moving/firing/bullet
  // evidence still does.
  const evidence = evidenceMap(input, { includeDailyDamage: false });
  const blockers = [];
  const competitors = [];
  if (frameAgeMs === null || frameAgeMs > freshMs) blockers.push('realtime-position-not-fresh');
  if (ownDistanceCm === null) blockers.push('missing-self-or-target-position');
  if (evidence.get('')) blockers.push('ambiguous-bullet-owner');
  for (const item of evidence.values()) {
    if (!item.id || item.id === selfId || item.id === targetId) continue;
    const toTargetCm = item.entity ? distance(target, item.entity) : null;
    if (!item.fresh || !item.entity || toTargetCm === null) {
      blockers.push(`competitor-position-missing:${item.id}`);
      continue;
    }
    competitors.push({
      id: item.id,
      reasons: [...item.reasons],
      distanceToTargetCm: Math.round(toTargetCm)
    });
    if (ownDistanceCm !== null && toTargetCm < ownDistanceCm) {
      blockers.push(`closer-active-competitor:${item.id}`);
    }
  }
  return {
    allowed: blockers.length === 0,
    reason: blockers.length === 0 ? 'prearrival-competition-clear' : 'prearrival-competition-blocked',
    blockers,
    ownDistanceToTargetCm: ownDistanceCm === null ? null : Math.round(ownDistanceCm),
    frameAgeMs: frameAgeMs === null ? null : Math.round(frameAgeMs),
    competitors
  };
}

module.exports = {
  evaluateAfkFiveFrameSafety,
  evaluateAfkPrearrivalCompetition
};
