'use strict';

// Loot-race positioning is a movement candidate only.  It never selects a
// combat target, changes aim/fire cadence, consumes the Dodge reserve, or
// overrides the realtime threat-field arbitration in combat-adapter.js.

const DEFAULT_SERVER_TICK_MS = 50;
const DEFAULT_MOVE_SPEED_CM_PER_TICK = 50;
const DEFAULT_EXPECTED_DAMAGE_PER_SHOT_HP = 3;
const DEFAULT_SHOT_CADENCE_MS = 160;
const DEFAULT_MIN_DROP = 10;
const DEFAULT_MAX_KILL_HORIZON_MS = 1200;
const DEFAULT_COMPETITOR_ETA_MARGIN_MS = 350;
const DEFAULT_MIN_SELF_HP = 50;
const DEFAULT_MIN_OWN_ETA_MS = 250;

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function point(value) {
  const x = finiteNumber(value?.x);
  const y = finiteNumber(value?.y);
  return x === null || y === null ? null : { x, y };
}

function distanceBetween(left, right) {
  const a = point(left);
  const b = point(right);
  return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : null;
}

function directionTo(from, to) {
  const a = point(from);
  const b = point(to);
  if (!a || !b) return { dx: 0, dy: 0 };
  return {
    dx: Math.sign(b.x - a.x),
    dy: Math.sign(b.y - a.y)
  };
}

function targetIdOf(entity) {
  const id = entity?.user_id ?? entity?.userId ?? entity?.id ?? entity?.entity_id;
  return id === null || id === undefined || id === '' ? '' : String(id);
}

function activeRealtimeCompetitor(entity) {
  if (!entity || entity.alive === false) return false;
  // Normalized browserless entities carry `active`.  Direct strategy tests
  // may omit it, in which case a realtime position is still valid evidence.
  if (Object.prototype.hasOwnProperty.call(entity, 'active')) return entity.active === true;
  const mode = String(entity.current_join_mode ?? entity.mode ?? '').toLowerCase();
  return mode ? mode === 'active' : true;
}

function competitorSpeedCmPerTick(entity, fallback) {
  const explicit = finiteNumber(entity?.speed ?? entity?.speed_per_tick ?? entity?.speedPerTick);
  const velocity = Math.hypot(Number(entity?.vx || 0), Number(entity?.vy || 0));
  return Math.max(
    1,
    fallback,
    Number.isFinite(explicit) ? Math.abs(explicit) : 0,
    Number.isFinite(velocity) ? velocity : 0
  );
}

function inactive(reason, details = {}) {
  return {
    active: false,
    applied: false,
    reason,
    direction: { dx: 0, dy: 0 },
    dropPoint: null,
    dropPointSource: '',
    targetDrop: null,
    targetDropSource: '',
    targetDropAuthority: '',
    targetHp: null,
    remainingShots: null,
    killHorizonMs: null,
    ownEtaMs: null,
    competitorEtaMs: null,
    competitorDistanceCm: null,
    competitorId: '',
    ...details
  };
}

/**
 * Select a bounded radial movement candidate when a valuable target is close
 * to death and an active realtime player can reach the predicted drop point
 * at nearly the same time.  The caller must still pass this direction through
 * the normal collision/Dodge arbitration before dispatch.
 */
function lootRacePositioningCore(input = {}, options = {}) {
  const self = point(input.self);
  const target = input.target || {};
  const targetPoint = point(target);
  if (!self || !targetPoint) return inactive('missing-geometry');
  if (input.enabled === false || options.combatLootRacePositioningEnabled === false) {
    return inactive('disabled');
  }
  if (input.closePressureActive !== true) return inactive('close-pressure-inactive');
  if (input.closePressureTooClose === true) return inactive('close-pressure-too-close');

  const minDrop = Math.max(1, finiteNumber(
    options.combatLootRaceMinDrop ?? options.lootRaceMinDrop ?? DEFAULT_MIN_DROP
  ) ?? DEFAULT_MIN_DROP);
  const targetState = input.combatTargetState || {};
  const combatTargetState = targetState;
  const realtimeDrop = finiteNumber(target.drop);
  const rememberedDrop = finiteNumber(targetState.drop);
  const currentDropAuthority = target.dropKnown === true
    ? String(target.dropAuthority || (
        target.profitMetadataAuthority === 'snapshot' ? 'snapshot' : ''
      )).toLowerCase()
    : '';
  const rememberedDropAuthority = targetState.dropKnown === true
    ? String(targetState.dropAuthority || (
        targetState.profitMetadataAuthority === 'snapshot' ? 'snapshot' : ''
      )).toLowerCase()
    : '';
  const targetDropAuthority = currentDropAuthority || rememberedDropAuthority;
  const targetDrop = target.dropKnown === true && realtimeDrop !== null
    ? realtimeDrop
    : (targetState.dropKnown === true && rememberedDrop !== null
        ? rememberedDrop
        : (realtimeDrop !== null && realtimeDrop > 0 ? realtimeDrop : null));
  const targetDropSource = target.dropKnown === true && realtimeDrop !== null
    ? (targetDropAuthority === 'snapshot'
        ? 'snapshot-reward-metadata'
        : 'realtime-target-drop')
    : (targetState.dropKnown === true && rememberedDrop !== null
        ? (targetDropAuthority === 'snapshot'
            ? 'snapshot-reward-metadata'
            : 'remembered-combat-target-drop')
        : (realtimeDrop !== null && realtimeDrop > 0 ? 'input-drop' : ''));
  if (targetDropAuthority === 'snapshot') {
    return inactive('snapshot-drop-not-combat-authority', {
      targetDrop,
      targetDropSource,
      targetDropAuthority
    });
  }
  const dropKnown = targetDrop !== null;
  if (!dropKnown || targetDrop === null || targetDrop < minDrop) {
    return inactive('target-drop-below-threshold', {
      targetDrop,
      targetDropSource,
      targetDropAuthority
    });
  }

  const selfHp = finiteNumber(input.self?.hp ?? input.self?.knownHp);
  const minSelfHp = Math.max(1, finiteNumber(
    options.combatLootRaceMinSelfHp ?? options.lootRaceMinSelfHp ?? DEFAULT_MIN_SELF_HP
  ) ?? DEFAULT_MIN_SELF_HP);
  if (selfHp === null || selfHp <= minSelfHp) {
    return inactive('self-hp-below-loot-race-threshold', { targetDrop });
  }

  const targetHp = finiteNumber(target.hp ?? target.knownHp ?? input.combatTargetState?.hp);
  if (targetHp === null || targetHp <= 0) return inactive('target-hp-unavailable', { targetDrop });

  const combatMetrics = input.combatMetrics || {};
  const damageProgress = Math.max(
    0,
    finiteNumber(combatTargetState.damageFromStart) ?? 0,
    finiteNumber(combatMetrics.targetDamage) ?? 0,
    finiteNumber(combatTargetState.firstHp) !== null
      ? Math.max(0, Number(combatTargetState.firstHp) - targetHp)
      : 0
  );
  if (!(damageProgress > 0)
    && !(finiteNumber(combatMetrics.confirmedHits) > 0)
    && !(finiteNumber(combatTargetState.lastDamageAmount) > 0)) {
    return inactive('no-own-damage-progress', { targetDrop, targetDropSource, targetHp });
  }

  const expectedDamagePerShot = Math.max(0.1, finiteNumber(
    options.combatLootRaceExpectedDamagePerShot
      ?? options.combatEfficiencyExpectedDamagePerShot
      ?? DEFAULT_EXPECTED_DAMAGE_PER_SHOT_HP
  ) ?? DEFAULT_EXPECTED_DAMAGE_PER_SHOT_HP);
  const shotCadenceMs = Math.max(1, finiteNumber(
    options.combatLootRaceShotCadenceMs
      ?? options.combatShootMinIntervalMs
      ?? options.combatEfficiencyExpectedShotCadenceMs
      ?? DEFAULT_SHOT_CADENCE_MS
  ) ?? DEFAULT_SHOT_CADENCE_MS);
  const maxKillHorizonMs = Math.max(shotCadenceMs, finiteNumber(
    options.combatLootRaceMaxKillHorizonMs
      ?? options.lootRaceMaxKillHorizonMs
      ?? DEFAULT_MAX_KILL_HORIZON_MS
  ) ?? DEFAULT_MAX_KILL_HORIZON_MS);
  const remainingShots = Math.max(1, Math.ceil(targetHp / expectedDamagePerShot));
  const commandDelayMs = Math.max(0, finiteNumber(
    input.commandDelayMs
      ?? (Number(input.commandDelayTicks) * Number(options.combatServerTickMs ?? DEFAULT_SERVER_TICK_MS))
      ?? 0
  ) ?? 0);
  const killHorizonMs = remainingShots * shotCadenceMs + commandDelayMs;
  if (killHorizonMs > maxKillHorizonMs) {
    return inactive('kill-horizon-too-long', {
      targetDrop,
      targetDropSource,
      targetHp,
      remainingShots,
      killHorizonMs: Math.round(killHorizonMs)
    });
  }

  const aim = input.aim || {};
  const dropPointCandidates = [
    ['aim-predicted-target-at-creation', aim.predictedTargetAtCreation],
    ['aim-predicted-target', aim.predictedTarget],
    ['aim-point', aim],
    ['realtime-target', target]
  ];
  let dropPoint = null;
  let dropPointSource = '';
  for (const [source, candidate] of dropPointCandidates) {
    const candidatePoint = point(candidate);
    if (!candidatePoint) continue;
    dropPoint = candidatePoint;
    dropPointSource = source;
    break;
  }
  if (!dropPoint) return inactive('missing-drop-point', { targetDrop, targetHp, remainingShots, killHorizonMs: Math.round(killHorizonMs) });

  const tickMs = Math.max(1, finiteNumber(
    options.combatServerTickMs ?? options.serverTickMs ?? DEFAULT_SERVER_TICK_MS
  ) ?? DEFAULT_SERVER_TICK_MS);
  const moveSpeed = Math.max(1, finiteNumber(
    options.combatLootRaceMoveSpeedCmPerTick
      ?? options.combatMoveSpeedPerTick
      ?? DEFAULT_MOVE_SPEED_CM_PER_TICK
  ) ?? DEFAULT_MOVE_SPEED_CM_PER_TICK);
  const ownDistanceCm = distanceBetween(self, dropPoint);
  if (ownDistanceCm === null) return inactive('missing-own-eta', { targetDrop, targetHp, remainingShots, killHorizonMs: Math.round(killHorizonMs) });
  const ownEtaMs = ownDistanceCm / moveSpeed * tickMs;
  const minOwnEtaMs = Math.max(0, finiteNumber(
    options.combatLootRaceMinOwnEtaMs
      ?? options.lootRaceMinOwnEtaMs
      ?? DEFAULT_MIN_OWN_ETA_MS
  ) ?? DEFAULT_MIN_OWN_ETA_MS);
  if (ownEtaMs < minOwnEtaMs) {
    return inactive('own-eta-already-safe', {
      targetDrop,
      targetDropSource,
      targetHp,
      remainingShots,
      killHorizonMs: Math.round(killHorizonMs),
      dropPoint,
      dropPointSource,
      ownEtaMs: Math.round(ownEtaMs)
    });
  }

  const selfId = targetIdOf(input.self);
  const targetId = targetIdOf(target);
  const competitors = Array.isArray(input.realtimeTargets)
    ? input.realtimeTargets
    : (Array.isArray(input.competitors) ? input.competitors : []);
  const competitorRows = competitors
    .filter(candidate => {
      const id = targetIdOf(candidate);
      return id && id !== selfId && id !== targetId && activeRealtimeCompetitor(candidate) && point(candidate);
    })
    .map(candidate => {
      const distanceCm = distanceBetween(candidate, dropPoint);
      const speed = competitorSpeedCmPerTick(candidate, moveSpeed);
      const etaMs = distanceCm === null ? Infinity : distanceCm / speed * tickMs;
      return {
        id: targetIdOf(candidate),
        distanceCm,
        etaMs,
        speedCmPerTick: speed
      };
    })
    .filter(candidate => Number.isFinite(candidate.etaMs))
    .sort((left, right) => left.etaMs - right.etaMs || left.distanceCm - right.distanceCm);
  const competitor = competitorRows[0] || null;
  if (!competitor) return inactive('no-active-competitor', {
    targetDrop,
    targetHp,
    remainingShots,
    killHorizonMs: Math.round(killHorizonMs),
    dropPoint,
    dropPointSource,
    ownEtaMs: Math.round(ownEtaMs)
  });

  const etaMarginMs = Math.max(0, finiteNumber(
    options.combatLootRaceCompetitorEtaMarginMs
      ?? options.lootRaceCompetitorEtaMarginMs
      ?? DEFAULT_COMPETITOR_ETA_MARGIN_MS
  ) ?? DEFAULT_COMPETITOR_ETA_MARGIN_MS);
  if (competitor.etaMs > ownEtaMs + etaMarginMs) {
    return inactive('competitor-eta-not-close', {
      targetDrop,
      targetDropSource,
      targetHp,
      remainingShots,
      killHorizonMs: Math.round(killHorizonMs),
      dropPoint,
      dropPointSource,
      ownEtaMs: Math.round(ownEtaMs),
      competitorEtaMs: Math.round(competitor.etaMs),
      competitorDistanceCm: Math.round(competitor.distanceCm),
      competitorId: competitor.id
    });
  }

  const direction = directionTo(self, dropPoint);
  if (!direction.dx && !direction.dy) return inactive('already-at-drop-point', {
    targetDrop,
    targetHp,
    remainingShots,
    killHorizonMs: Math.round(killHorizonMs),
    dropPoint,
    dropPointSource,
    ownEtaMs: Math.round(ownEtaMs),
    competitorEtaMs: Math.round(competitor.etaMs),
    competitorDistanceCm: Math.round(competitor.distanceCm),
    competitorId: competitor.id
  });

  return {
    active: true,
    applied: false,
    reason: 'competitor-eta-close',
    direction,
    dropPoint: { x: Math.round(dropPoint.x), y: Math.round(dropPoint.y) },
    dropPointSource,
    targetDrop: Math.round(targetDrop),
    targetDropSource,
    targetDropAuthority,
    targetHp: Number(targetHp.toFixed(3)),
    remainingShots,
    killHorizonMs: Math.round(killHorizonMs),
    ownEtaMs: Math.round(ownEtaMs),
    competitorEtaMs: Math.round(competitor.etaMs),
    competitorDistanceCm: Math.round(competitor.distanceCm),
    competitorId: competitor.id,
    competitorSpeedCmPerTick: Number(competitor.speedCmPerTick.toFixed(3)),
    etaMarginMs: Math.round(etaMarginMs),
    damageProgressHp: Number(damageProgress.toFixed(3))
  };
}

module.exports = {
  lootRacePositioningCore
};
