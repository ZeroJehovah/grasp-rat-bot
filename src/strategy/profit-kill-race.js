'use strict';

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function idOf(value) {
  const id = value?.user_id ?? value?.userId ?? value?.id ?? value?.entity_id ?? value?.entityId;
  return id === null || id === undefined || id === '' ? '' : String(id);
}

function bulletOwnerId(value) {
  const id = value?.owner_user_id
    ?? value?.ownerUserId
    ?? value?.owner_id
    ?? value?.ownerId
    ?? value?.user_id
    ?? value?.userId;
  return id === null || id === undefined || id === '' ? '' : String(id);
}

function distanceBetween(left, right) {
  const rawValues = [left?.x, left?.y, right?.x, right?.y];
  if (rawValues.some(value => value === null || value === undefined || value === '')) return Infinity;
  const values = rawValues.map(Number);
  return values.every(Number.isFinite) ? Math.hypot(values[0] - values[2], values[1] - values[3]) : Infinity;
}

function directionTo(from, to) {
  return {
    dx: Math.sign(Number(to?.x) - Number(from?.x)),
    dy: Math.sign(Number(to?.y) - Number(from?.y))
  };
}

function realtimePlayerActivity(entity) {
  if (entity?.profitCompetitionActive === true) return 'active';
  const mode = String(entity?.current_join_mode ?? entity?.mode ?? '').toLowerCase();
  if (mode === 'active') return 'active';
  if (mode === 'passive' || mode === 'afk') return 'passive';
  if (entity?.active === true) return 'active';
  if (entity?.active === false) return 'passive';
  return 'unknown';
}

function explicitPassiveRealtimePlayer(entity) {
  const mode = String(entity?.current_join_mode ?? entity?.mode ?? '').toLowerCase();
  return mode === 'passive' || mode === 'afk';
}

function profitCompetitionEvidenceState(container = {}) {
  if (!container.records || typeof container.records !== 'object' || Array.isArray(container.records)) {
    container.records = {};
  }
  return container;
}

/**
 * Retain bounded realtime/native player-activity evidence for primary-target
 * competition. Snapshot activity and coordinates must never be passed here.
 * Repeated evaluations on one realtime tick do not advance clear evidence or
 * extend a strong-evidence lease.
 */
function observeProfitCompetitorEvidence(container = {}, input = {}, options = {}) {
  const state = profitCompetitionEvidenceState(container);
  const nowMs = Number.isFinite(Number(input.nowMs)) ? Number(input.nowMs) : Date.now();
  const observedTick = numberOrNull(input.observedTick ?? input.tick);
  const holdTtlMs = Math.max(1000, Number(options.profitKillRaceEvidenceHoldTtlMs ?? 4000));
  const clearConfirmationsRequired = Math.max(
    2,
    Math.round(Number(options.profitKillRaceEvidenceClearConfirmations ?? 3))
  );
  const maximumRecords = Math.max(8, Math.round(Number(options.profitKillRaceEvidenceMaxRecords ?? 64)));
  const selfId = idOf(input.self);
  const selfIdentityIds = new Set([
    input.self?.user_id,
    input.self?.userId,
    input.self?.entity_id,
    input.self?.entityId,
    input.self?.id
  ].filter(value => value !== null && value !== undefined && value !== '').map(String));
  const targets = (Array.isArray(input.realtimeTargets) ? input.realtimeTargets : [])
    .filter(target => target && (!target.authority || target.authority === 'realtime'));
  const bullets = (Array.isArray(input.realtimeBullets) ? input.realtimeBullets : [])
    .filter(bullet => !bullet?.authority || bullet.authority === 'realtime');
  const bulletCountByOwner = new Map();
  for (const bullet of bullets) {
    const ownerId = bulletOwnerId(bullet);
    if (!ownerId || ownerId === selfId || selfIdentityIds.has(ownerId)) continue;
    bulletCountByOwner.set(ownerId, Number(bulletCountByOwner.get(ownerId) || 0) + 1);
  }
  const currentById = new Map();
  const freshIds = new Set();
  for (const target of targets) {
    const id = idOf(target);
    if (!id || id === selfId) continue;
    currentById.set(id, target);
    const prior = state.records[id] || null;
    if (target.alive === false || target.dead === true) {
      delete state.records[id];
      continue;
    }
    const bulletCount = Number(bulletCountByOwner.get(id) || 0);
    const modeActivity = realtimePlayerActivity({ ...target, profitCompetitionActive: false });
    const evidenceReasons = [
      modeActivity === 'active' ? 'native-active' : '',
      target.moving === true || Math.abs(Number(target.vx || 0)) > 0 || Math.abs(Number(target.vy || 0)) > 0
        ? 'native-moving' : '',
      target.firing === true || target.shooting === true || target.is_firing === true
        ? 'native-firing' : '',
      bulletCount > 0 ? 'realtime-bullet-owner' : ''
    ].filter(Boolean);
    const strong = evidenceReasons.length > 0;
    const freshTick = observedTick === null
      || numberOrNull(prior?.lastObservedTick) === null
      || observedTick > Number(prior.lastObservedTick);
    const x = numberOrNull(target.x);
    const y = numberOrNull(target.y);
    if (strong) {
      const advancesStrongLease = !prior
        || observedTick === null
        || numberOrNull(prior.lastStrongTick) === null
        || observedTick > Number(prior.lastStrongTick);
      state.records[id] = {
        id,
        x,
        y,
        authority: 'realtime',
        active: true,
        evidenceReasons,
        bulletCount,
        firstStrongAt: Number(prior?.firstStrongAt || nowMs),
        lastStrongAt: advancesStrongLease ? nowMs : Number(prior?.lastStrongAt || nowMs),
        lastStrongTick: advancesStrongLease ? observedTick : numberOrNull(prior?.lastStrongTick),
        lastObservedAt: nowMs,
        lastObservedTick: observedTick,
        lastPositionAt: x !== null && y !== null ? nowMs : Number(prior?.lastPositionAt || 0),
        lastPositionTick: x !== null && y !== null ? observedTick : numberOrNull(prior?.lastPositionTick),
        clearConfirmations: 0,
        expiresAt: (advancesStrongLease ? nowMs : Number(prior?.lastStrongAt || nowMs)) + holdTtlMs
      };
      freshIds.add(id);
      continue;
    }
    if (!prior) continue;
    const explicitPassive = explicitPassiveRealtimePlayer(target);
    const clearConfirmations = explicitPassive && freshTick
      ? Math.max(0, Number(prior.clearConfirmations || 0)) + 1
      : (explicitPassive ? Math.max(0, Number(prior.clearConfirmations || 0)) : 0);
    if (explicitPassive && freshTick && clearConfirmations >= clearConfirmationsRequired) {
      delete state.records[id];
      continue;
    }
    state.records[id] = {
      ...prior,
      x: x !== null ? x : numberOrNull(prior.x),
      y: y !== null ? y : numberOrNull(prior.y),
      evidenceReasons: Array.isArray(prior.evidenceReasons) ? prior.evidenceReasons : [],
      bulletCount: 0,
      lastObservedAt: nowMs,
      lastObservedTick: observedTick,
      lastPositionAt: x !== null && y !== null ? nowMs : Number(prior.lastPositionAt || 0),
      lastPositionTick: x !== null && y !== null ? observedTick : numberOrNull(prior.lastPositionTick),
      clearConfirmations
    };
    freshIds.add(id);
  }
  for (const [id, bulletCount] of bulletCountByOwner.entries()) {
    if (currentById.has(id) || state.records[id]) continue;
    // A realtime bullet owner is activity evidence even when the matching
    // entity is absent from this frame. Keep the identity with unknown
    // coordinates so the policy fails closed outside the pickup radius until
    // a fresh position is observed or the bounded lease expires.
    state.records[id] = {
      id,
      x: null,
      y: null,
      authority: 'realtime',
      active: true,
      evidenceReasons: ['realtime-bullet-owner'],
      bulletCount,
      firstStrongAt: nowMs,
      lastStrongAt: nowMs,
      lastStrongTick: observedTick,
      lastObservedAt: nowMs,
      lastObservedTick: observedTick,
      lastPositionAt: 0,
      lastPositionTick: null,
      clearConfirmations: 0,
      expiresAt: nowMs + holdTtlMs
    };
    freshIds.add(id);
  }
  for (const [id, record] of Object.entries(state.records)) {
    if (freshIds.has(id)) continue;
    const bulletCount = Number(bulletCountByOwner.get(id) || 0);
    const advancesStrongLease = bulletCount > 0 && (
      observedTick === null
      || numberOrNull(record.lastStrongTick) === null
      || observedTick > Number(record.lastStrongTick)
    );
    if (bulletCount > 0) {
      state.records[id] = {
        ...record,
        evidenceReasons: ['realtime-bullet-owner'],
        bulletCount,
        lastStrongAt: advancesStrongLease ? nowMs : Number(record.lastStrongAt || nowMs),
        lastStrongTick: advancesStrongLease ? observedTick : numberOrNull(record.lastStrongTick),
        lastObservedAt: currentById.has(id) ? nowMs : Number(record.lastObservedAt || 0),
        lastObservedTick: observedTick,
        clearConfirmations: 0,
        expiresAt: (advancesStrongLease ? nowMs : Number(record.lastStrongAt || nowMs)) + holdTtlMs
      };
      continue;
    }
    if (nowMs > Number(record.expiresAt || 0)) {
      delete state.records[id];
    } else {
      // Mark an absent/uncertain observation as consumed for this tick too.
      // A later same-tick Passive row must not advance the three-frame clear
      // confirmation merely because the entity was missing earlier in the
      // same realtime frame.
      state.records[id] = {
        ...record,
        lastObservedAt: nowMs,
        lastObservedTick: observedTick ?? numberOrNull(record.lastObservedTick)
      };
    }
  }
  const ordered = Object.values(state.records)
    .sort((left, right) => Number(right.lastStrongAt || 0) - Number(left.lastStrongAt || 0));
  for (const record of ordered.slice(maximumRecords)) delete state.records[String(record.id)];
  const competitionTargets = [];
  for (const record of Object.values(state.records)) {
    if (nowMs > Number(record.expiresAt || 0)) continue;
    const current = currentById.get(String(record.id)) || null;
    const positionFresh = Boolean(
      current
        && numberOrNull(current.x) !== null
        && numberOrNull(current.y) !== null
        && (observedTick === null || numberOrNull(record.lastPositionTick) === observedTick)
    );
    competitionTargets.push({
      ...(current || {}),
      user_id: current?.user_id ?? current?.userId ?? record.id,
      x: numberOrNull(current?.x) ?? numberOrNull(record.x),
      y: numberOrNull(current?.y) ?? numberOrNull(record.y),
      authority: 'realtime',
      alive: current?.alive !== false,
      profitCompetitionActive: true,
      profitCompetitionHeld: !Array.isArray(record.evidenceReasons)
        || !record.evidenceReasons.length
        || Number(record.lastStrongTick) !== observedTick,
      profitCompetitionPositionFresh: positionFresh,
      profitCompetitionEvidenceReasons: Array.isArray(record.evidenceReasons)
        ? record.evidenceReasons.slice(0, 4)
        : [],
      profitCompetitionBulletCount: Math.max(0, Number(record.bulletCount || 0)),
      profitCompetitionLastStrongAt: Number(record.lastStrongAt || 0),
      profitCompetitionLastStrongTick: numberOrNull(record.lastStrongTick),
      profitCompetitionEvidenceAgeMs: Math.max(0, nowMs - Number(record.lastStrongAt || nowMs)),
      profitCompetitionClearConfirmations: Math.max(0, Number(record.clearConfirmations || 0))
    });
  }
  state.lastObservedAt = nowMs;
  state.lastObservedTick = observedTick;
  return {
    state,
    observedTick,
    holdTtlMs,
    clearConfirmationsRequired,
    competitionTargets
  };
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
  const competitors = (input.competitionTargets || input.realtimeTargets || [])
    .filter(entity => !entity?.authority || entity.authority === 'realtime')
    .filter(entity => activeRealtimePlayer(entity, selfId, targetId))
    .map(entity => ({
      id: idOf(entity),
      distanceCm: distanceBetween(entity, target),
      positionFresh: entity.profitCompetitionPositionFresh !== false,
      held: entity.profitCompetitionHeld === true,
      evidenceReasons: Array.isArray(entity.profitCompetitionEvidenceReasons)
        ? entity.profitCompetitionEvidenceReasons.slice(0, 4)
        : [],
      evidenceAgeMs: numberOrNull(entity.profitCompetitionEvidenceAgeMs),
      lastStrongTick: numberOrNull(entity.profitCompetitionLastStrongTick)
    }))
    .filter(row => (
      Number.isFinite(row.distanceCm) && row.distanceCm <= competitorRadius
    ) || (
      !Number.isFinite(row.distanceCm) && row.positionFresh === false
    ))
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
  const staleCompetitor = competitors.find(competitor => competitor.positionFresh === false) || null;
  const fireAllowed = insidePickupRadius || (!staleCompetitor && strictlyCloser);
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
    observedTick: numberOrNull(input.observedTick ?? input.tick),
    insidePickupRadius,
    selfStrictlyCloser: strictlyCloser,
    competitorPositionUncertain: Boolean(staleCompetitor),
    staleCompetitor,
    approaching: Number.isFinite(distance) && distance > pickupRadius,
    direction: Number.isFinite(distance) && distance > pickupRadius ? directionTo(self, target) : { dx: 0, dy: 0 },
    nearestCompetitor,
    closerCompetitor: fireAllowed ? null : nearestCompetitor,
    fireAllowed,
    reason: insidePickupRadius
      ? 'inside-player-drop-pickup-radius'
      : (staleCompetitor
          ? 'active-competitor-position-retained'
          : (strictlyCloser
          ? 'self-closer-to-primary-profit-target'
          : 'active-player-as-close-or-closer-to-primary-profit-target'))
  };
}

module.exports = {
  activeRealtimePlayer,
  bulletOwnerId,
  distanceBetween,
  observeProfitCompetitorEvidence,
  profitKillRacePolicy,
  realtimePlayerActivity
};
