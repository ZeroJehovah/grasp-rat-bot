'use strict';

// A remote profit candidate is scored inside the snapshot worker, from the
// snapshot's own self/target positions. That snapshot can be minutes old, so the
// move-stamina component of its stamina cost - the dominant term for a distant
// player - can be badly wrong by the time the planner uses it. When the same
// player has a fresher observed position, correcting the move component keeps
// the profit score comparable with the coin and realtime-player candidates it
// competes against.
//
// Only the move component is recomputed. The completion terms (expected shots,
// risk scale, pickup) do not depend on how far away the target was observed, so
// they are carried through unchanged. The base score is rescaled by the stamina
// ratio, which is exact for the reward/stamina score used by the remote policy
// and monotonic for any other reward-over-cost form.
const DEFAULT_PROFIT_TARGET_DISTANCE_CORRECTION = Object.freeze({
  moveStaminaPerCm: 1,
  minStaminaCost: 1,
  freshPositionMaxAgeMs: 3000
});

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function skipped(reason, snapshotDistanceCm, snapshotStaminaCost, snapshotBaseScore) {
  return {
    applied: false,
    reason,
    distanceCm: snapshotDistanceCm,
    staminaCost: snapshotStaminaCost,
    baseScore: snapshotBaseScore,
    staminaDeltaMilli: 0,
    moveStaminaCost: null,
    fixedStaminaCost: null
  };
}

// `freshDistanceCm` is the distance from the current realtime self position to
// the freshest available target position. `snapshotDistanceCm` is the distance
// the snapshot worker used when it produced `snapshotStaminaCost`.
function profitTargetDistanceCorrectionCore(input = {}, options = {}) {
  const snapshotDistanceCm = finiteNumber(input.snapshotDistanceCm);
  const snapshotStaminaCost = finiteNumber(input.snapshotStaminaCost);
  const snapshotBaseScore = finiteNumber(input.snapshotBaseScore);
  const freshDistanceCm = finiteNumber(input.freshDistanceCm);
  if (freshDistanceCm === null || freshDistanceCm < 0) {
    return skipped('missing-fresh-distance', snapshotDistanceCm, snapshotStaminaCost, snapshotBaseScore);
  }
  if (snapshotDistanceCm === null || snapshotDistanceCm < 0 || snapshotStaminaCost === null || snapshotStaminaCost < 0) {
    return skipped('missing-snapshot-economics', snapshotDistanceCm, snapshotStaminaCost, snapshotBaseScore);
  }
  const perCm = Math.max(0, finiteNumber(
    input.moveStaminaPerCm ?? options.opportunityMoveStaminaPerCm
  ) ?? DEFAULT_PROFIT_TARGET_DISTANCE_CORRECTION.moveStaminaPerCm);
  const minStaminaCost = Math.max(0, finiteNumber(
    options.profitTargetDistanceCorrectionMinStaminaCost
  ) ?? DEFAULT_PROFIT_TARGET_DISTANCE_CORRECTION.minStaminaCost);
  if (!(perCm > 0)) {
    return skipped('no-move-stamina-component', snapshotDistanceCm, snapshotStaminaCost, snapshotBaseScore);
  }
  const snapshotMoveCost = snapshotDistanceCm * perCm;
  // The subtraction is only meaningful when this per-cm rate actually explains
  // part of the snapshot cost. A snapshot cost at or below its own move
  // component means the worker priced the leg some other way, and re-adding a
  // full move leg at this rate would invent a cost instead of correcting one.
  if (!(snapshotStaminaCost > snapshotMoveCost)) {
    return skipped('snapshot-cost-excludes-move-component', snapshotDistanceCm, snapshotStaminaCost, snapshotBaseScore);
  }
  const fixedStaminaCost = Math.max(0, snapshotStaminaCost - snapshotMoveCost);
  const staminaCost = Math.max(minStaminaCost, fixedStaminaCost + freshDistanceCm * perCm);
  const baseScore = snapshotBaseScore !== null && snapshotStaminaCost > 0 && staminaCost > 0
    ? snapshotBaseScore * (snapshotStaminaCost / staminaCost)
    : snapshotBaseScore;
  return {
    applied: Math.round(staminaCost) !== Math.round(snapshotStaminaCost),
    reason: 'fresh-distance-move-stamina-recomputed',
    distanceCm: freshDistanceCm,
    staminaCost,
    baseScore,
    staminaDeltaMilli: staminaCost - snapshotStaminaCost,
    moveStaminaCost: freshDistanceCm * perCm,
    fixedStaminaCost
  };
}

// Pick the freshest usable position for a remote candidate. A realtime
// observation only wins when it is newer than the snapshot batch and still
// within the configured age bound; otherwise the snapshot position stands.
function freshestProfitTargetPositionCore(input = {}, options = {}) {
  const snapshotX = finiteNumber(input.snapshotX);
  const snapshotY = finiteNumber(input.snapshotY);
  const snapshotPosition = snapshotX === null || snapshotY === null
    ? null
    : { x: snapshotX, y: snapshotY, authority: 'snapshot', ageMs: finiteNumber(input.snapshotAgeMs) };
  const realtimeX = finiteNumber(input.realtimeX);
  const realtimeY = finiteNumber(input.realtimeY);
  if (realtimeX === null || realtimeY === null) {
    return { position: snapshotPosition, source: snapshotPosition ? 'snapshot' : 'none' };
  }
  const maxAgeMs = Math.max(0, finiteNumber(
    options.profitTargetRealtimePositionMaxAgeMs
  ) ?? DEFAULT_PROFIT_TARGET_DISTANCE_CORRECTION.freshPositionMaxAgeMs);
  const realtimeAgeMs = Math.max(0, finiteNumber(input.realtimeAgeMs) ?? 0);
  if (realtimeAgeMs > maxAgeMs) {
    return { position: snapshotPosition, source: snapshotPosition ? 'snapshot-realtime-stale' : 'none' };
  }
  const snapshotAgeMs = finiteNumber(input.snapshotAgeMs);
  if (snapshotAgeMs !== null && realtimeAgeMs > snapshotAgeMs) {
    return { position: snapshotPosition, source: 'snapshot-newer' };
  }
  return {
    position: { x: realtimeX, y: realtimeY, authority: 'realtime', ageMs: realtimeAgeMs },
    source: 'realtime'
  };
}

module.exports = {
  DEFAULT_PROFIT_TARGET_DISTANCE_CORRECTION,
  profitTargetDistanceCorrectionCore,
  freshestProfitTargetPositionCore
};
