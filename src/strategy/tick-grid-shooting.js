'use strict';

// Shared fire-slot policy. The store owns one instance of this state per
// process; all actual shoot paths claim through the same object.

const DEFAULT_GRID_STEP = 10;
const SAFE_AFK_GRID_STEP = 5;
const DEFAULT_TICK_MS = 50;
// Fixed ceiling for the cross-day sanity bound. It is only a rejection bound
// for frames delivered across a midnight rotation, never a shooting cadence.
// Measured on 2026-10-22/23 over 44580 frames, the sustained cadence is 0.0199
// ticks/ms (identical over 1m/10m/1h windows), so this leaves about 2.5x
// headroom while a prior-day counter leaking past midnight is orders of
// magnitude above it.
//
// The bound must stay a constant. It used to be learned from live frames, and
// one long first inter-frame gap after a midnight rotation pinned the learned
// rate low; the low bound then rejected every later frame of that day (931265
// stale observations on 2026-10-23, claimCount frozen at 369 and 281442 shots
// skipped), and rejected frames could never correct the rate again, so the
// watermark froze at tick 216 and every shot was refused as
// decision-tick-stale for the rest of the day.
const MAX_PLAUSIBLE_TICK_RATE_PER_MS = 0.05;
const PLAUSIBLE_TICK_MARGIN = 8;
// Consecutive strictly-increasing frames below the retained watermark that are
// needed before the watermark is re-anchored downwards. This is the escape
// hatch for a wrong-but-accepted seed: without it a single too-high frame (a
// stale prior-day counter accepted in the first seconds of a new day) rejects
// every real frame for the rest of the day, which is the same class of lock
// this change exists to remove. The streak only ever moves the watermark down,
// so a stale high frame can never use it to take the day over.
const REANCHOR_STREAK = 5;
// The watermark must also have been stuck for this long before a streak may
// re-anchor it. Normal out-of-order delivery produces a few increasing frames
// below a freshly advanced watermark within milliseconds, so a stall window
// keeps that case from ever triggering a downward re-anchor, while a seeded
// watermark that blockades the day is frozen for hours.
const REANCHOR_MIN_STALL_MS = 10000;

function normalizeGameTick(value) {
  const text = typeof value === 'string' ? value.trim() : value;
  if (text === '' || text === null || text === undefined) return null;
  const number = Number(text);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function validGridStep(value) {
  return Number(value) === SAFE_AFK_GRID_STEP ? SAFE_AFK_GRID_STEP : DEFAULT_GRID_STEP;
}

function createTickGridShootingState() {
  return {
    epoch: null,
    epochSequence: 0,
    dateKey: '',
    tick: null,
    receivedAtMs: null,
    lastClaimedTick: null,
    lastClaimedGridStep: null,
    lastClaimedAtMs: null,
    claimCount: 0,
    observationCount: 0,
    staleObservationCount: 0,
    rejectedClaimCount: 0,
    lastRejection: null,
    lastStaleObservation: null,
    belowWatermarkStreak: 0,
    belowWatermarkLastTick: null
  };
}

function rotateEpoch(state, dateKey, atMs, reason) {
  state.epochSequence = Math.max(1, Number(state.epochSequence || 0) + 1);
  state.epoch = `shoot-epoch:${state.epochSequence}`;
  state.dateKey = String(dateKey || '');
  state.tick = null;
  state.receivedAtMs = atMs;
  state.lastClaimedTick = null;
  state.lastClaimedGridStep = null;
  state.lastClaimedAtMs = null;
  state.belowWatermarkStreak = 0;
  state.belowWatermarkLastTick = null;
  state.lastRotationReason = String(reason || '');
  return state;
}

function maximumPlausibleTick(elapsedDayMs) {
  const elapsed = Number(elapsedDayMs);
  if (!Number.isFinite(elapsed)) return Number.POSITIVE_INFINITY;
  return Math.ceil(Math.max(0, elapsed) * MAX_PLAUSIBLE_TICK_RATE_PER_MS + PLAUSIBLE_TICK_MARGIN);
}

// Second, tighter bound measured from the retained watermark. The day-wide
// ceiling above is deliberately loose, which means a prior-day counter leaked
// many hours after midnight could still slip under it and jump the watermark
// forward. This bound only limits how far one accepted frame may move the
// watermark, so it closes that hole regardless of the hour.
//
// It cannot lock the day either: it is anchored on the last accepted frame and
// grows with real elapsed time, so a rejected frame leaves the anchor intact
// and the next normal frame still advances.
function maximumPlausibleAdvance(elapsedMs) {
  const elapsed = Number(elapsedMs);
  if (!Number.isFinite(elapsed) || elapsed <= 0) return null;
  return Math.ceil(elapsed * MAX_PLAUSIBLE_TICK_RATE_PER_MS + PLAUSIBLE_TICK_MARGIN);
}

function observeRealtimeTick(state, input = {}, options = {}) {
  const tick = normalizeGameTick(input.tick);
  const atMs = Number(input.receivedAtMs);
  if (tick === null) {
    return { ok: false, reason: 'invalid-game-tick', epoch: state.epoch, tick: state.tick };
  }
  if (!Number.isFinite(atMs) || atMs <= 0) {
    return { ok: false, reason: 'invalid-realtime-receipt-time', epoch: state.epoch, tick: state.tick };
  }
  const dateKey = typeof options.dayKey === 'function'
    ? String(options.dayKey(atMs) || '')
    : String(options.dateKey || '');
  if (!dateKey) {
    return { ok: false, reason: 'missing-realtime-day-key', epoch: state.epoch, tick: state.tick };
  }
  state.observationCount += 1;
  if (!state.epoch) {
    rotateEpoch(state, dateKey, atMs, 'initial-realtime-frame');
    state.tick = tick;
    return { ok: true, reason: 'epoch-initialized', epoch: state.epoch, tick };
  }
  const dayStartMs = typeof options.dayStart === 'function'
    ? Number(options.dayStart(atMs))
    : null;
  const elapsedDayMs = Number.isFinite(dayStartMs) ? Math.max(0, atMs - dayStartMs) : null;
  const maximumTick = elapsedDayMs === null ? null : maximumPlausibleTick(elapsedDayMs);
  if (dateKey !== state.dateKey) {
    // A frame delivered after midnight can still belong to the prior epoch.
    // Reject an implausibly large number instead of letting it seed the new day.
    if (maximumTick !== null && tick > maximumTick) {
      state.staleObservationCount += 1;
      state.lastStaleObservation = {
        tick,
        receivedAtMs: atMs,
        reason: 'cross-day-tick-implausible',
        maximumTick
      };
      return {
        ok: false,
        reason: 'cross-day-tick-implausible',
        epoch: state.epoch,
        tick: state.tick,
        maximumTick
      };
    }
    rotateEpoch(state, dateKey, atMs, 'utc8-day-change');
    state.tick = tick;
    return { ok: true, reason: 'epoch-rotated', epoch: state.epoch, tick };
  }
  // The same bound also applies after the epoch has rotated. Without this,
  // a late prior-day frame delivered a few seconds after the first new-day
  // frame could still replace the new watermark and poison the whole day.
  if (maximumTick !== null && tick > maximumTick) {
    state.staleObservationCount += 1;
    state.lastStaleObservation = {
      tick,
      receivedAtMs: atMs,
      reason: 'implausible-tick-for-realtime-day',
      maximumTick
    };
    return {
      ok: false,
      reason: 'implausible-tick-for-realtime-day',
      epoch: state.epoch,
      tick: state.tick,
      maximumTick
    };
  }
  const previousTick = state.tick;
  if (previousTick !== null && tick <= previousTick) {
    state.staleObservationCount += 1;
    const continuesBelowStreak = state.belowWatermarkLastTick !== null && tick > state.belowWatermarkLastTick;
    state.belowWatermarkStreak = continuesBelowStreak ? state.belowWatermarkStreak + 1 : 0;
    state.belowWatermarkLastTick = tick;
    state.lastStaleObservation = {
      tick,
      receivedAtMs: atMs,
      reason: tick === previousTick ? 'duplicate-watermark-tick' : 'older-watermark-tick',
      watermarkTick: previousTick,
      belowWatermarkStreak: state.belowWatermarkStreak
    };
    // A watermark that was seeded too high rejects every real frame forever:
    // the real counter never exceeds it, so it can never win by advancing.
    // A sustained run of strictly increasing frames underneath the watermark
    // is the only signature of that state, and it reliably distinguishes it
    // from isolated reordered or duplicated frames. Re-anchor downwards once.
    const stalledMs = atMs - Number(state.receivedAtMs);
    if (state.belowWatermarkStreak + 1 >= REANCHOR_STREAK
        && Number.isFinite(stalledMs) && stalledMs >= REANCHOR_MIN_STALL_MS) {
      const fromTick = previousTick;
      state.tick = tick;
      state.receivedAtMs = atMs;
      state.belowWatermarkStreak = 0;
      state.belowWatermarkLastTick = null;
      // A claim made against the bogus high watermark must not block the real
      // counter until it catches up.
      if (state.lastClaimedTick !== null && state.lastClaimedTick > tick) state.lastClaimedTick = null;
      state.lastReanchor = { fromTick, toTick: tick, atMs, stalledMs, reason: 'watermark-seeded-too-high' };
      return { ok: true, reason: 'watermark-reanchored', epoch: state.epoch, tick, fromTick };
    }
    return {
      ok: false,
      reason: tick === previousTick ? 'duplicate-watermark-tick' : 'older-watermark-tick',
      epoch: state.epoch,
      tick: previousTick,
      belowWatermarkStreak: state.belowWatermarkStreak
    };
  }
  state.belowWatermarkStreak = 0;
  state.belowWatermarkLastTick = null;
  // No rate learning here: both bounds are constants, so a rejected frame
  // cannot poison later checks, and any monotonic in-day frame under them
  // re-anchors the watermark by simply advancing it. This is exactly what the
  // old rejected-frame lock could not do.
  const maximumAdvance = maximumPlausibleAdvance(atMs - state.receivedAtMs);
  if (maximumAdvance !== null && tick - previousTick > maximumAdvance) {
    state.staleObservationCount += 1;
    state.lastStaleObservation = {
      tick,
      receivedAtMs: atMs,
      reason: 'tick-advance-implausible',
      watermarkTick: previousTick,
      maximumAdvance
    };
    return {
      ok: false,
      reason: 'tick-advance-implausible',
      epoch: state.epoch,
      tick: previousTick,
      maximumAdvance
    };
  }
  state.tick = tick;
  state.receivedAtMs = atMs;
  return { ok: true, reason: 'watermark-advanced', epoch: state.epoch, tick };
}

function rejectClaim(state, reason, detail = {}) {
  state.rejectedClaimCount += 1;
  state.lastRejection = {
    atMs: Number(detail.atMs) || null,
    decisionEpoch: detail.decisionEpoch ?? null,
    decisionTick: detail.decisionTick ?? null,
    watermarkEpoch: state.epoch,
    watermarkTick: state.tick,
    gridStep: detail.gridStep ?? null,
    reason
  };
  return { ok: false, reason, ...state.lastRejection };
}

function claimShootSlot(state, input = {}) {
  const decisionTick = normalizeGameTick(input.decisionTick ?? input.tick);
  const decisionEpoch = String(input.decisionEpoch ?? input.epoch ?? '');
  const gridStep = validGridStep(input.gridStep);
  const atMs = Number(input.atMs);
  const detail = { decisionEpoch, decisionTick, gridStep, atMs };
  if (!decisionEpoch) return rejectClaim(state, 'missing-decision-epoch', detail);
  if (!state.epoch) return rejectClaim(state, 'missing-realtime-watermark', detail);
  if (decisionEpoch !== state.epoch) return rejectClaim(state, 'decision-epoch-stale', detail);
  if (decisionTick === null) return rejectClaim(state, 'invalid-decision-tick', detail);
  if (state.tick === null) return rejectClaim(state, 'missing-realtime-watermark', detail);
  if (decisionTick !== state.tick) return rejectClaim(state, 'decision-tick-stale', detail);
  if (decisionTick % gridStep !== 0) return rejectClaim(state, 'frame-not-on-grid', detail);
  if (state.lastClaimedTick !== null && decisionTick <= state.lastClaimedTick) {
    return rejectClaim(state, 'frame-slot-already-consumed', detail);
  }
  state.lastClaimedTick = decisionTick;
  state.lastClaimedGridStep = gridStep;
  state.lastClaimedAtMs = Number.isFinite(atMs) ? atMs : null;
  state.claimCount += 1;
  return {
    ok: true,
    reason: 'frame-slot-claimed',
    epoch: state.epoch,
    tick: decisionTick,
    gridStep,
    lastClaimedTick: state.lastClaimedTick
  };
}

function tickGridSnapshot(state) {
  return {
    epoch: state.epoch,
    dateKey: state.dateKey,
    tick: state.tick,
    receivedAtMs: state.receivedAtMs,
    lastClaimedTick: state.lastClaimedTick,
    lastClaimedGridStep: state.lastClaimedGridStep,
    lastClaimedAtMs: state.lastClaimedAtMs,
    claimCount: state.claimCount,
    observationCount: state.observationCount,
    staleObservationCount: state.staleObservationCount,
    rejectedClaimCount: state.rejectedClaimCount,
    lastStaleObservation: state.lastStaleObservation ? { ...state.lastStaleObservation } : null,
    lastReanchor: state.lastReanchor ? { ...state.lastReanchor } : null,
    lastRejection: state.lastRejection ? { ...state.lastRejection } : null
  };
}

function countGridSlotsUntil(input = {}) {
  const currentTick = normalizeGameTick(input.currentTick ?? input.tick);
  const etaMs = Number(input.etaMs);
  const tickMs = Math.max(1, Number(input.tickMs ?? DEFAULT_TICK_MS) || DEFAULT_TICK_MS);
  const gridStep = validGridStep(input.gridStep);
  if (currentTick === null || !Number.isFinite(etaMs) || etaMs < 0) return null;
  const lastClaimedTick = normalizeGameTick(input.lastClaimedTick);
  const firstTick = Math.max(currentTick, lastClaimedTick === null ? 0 : lastClaimedTick + 1);
  const arrivalTick = currentTick + Math.floor(etaMs / tickMs);
  if (arrivalTick < firstTick) return 0;
  return Math.max(0, Math.floor(arrivalTick / gridStep) - Math.floor((firstTick - 1) / gridStep));
}

function nextGridDelayMs(input = {}) {
  const tick = normalizeGameTick(input.tick);
  const tickMs = Math.max(1, Number(input.tickMs ?? DEFAULT_TICK_MS) || DEFAULT_TICK_MS);
  const gridStep = validGridStep(input.gridStep);
  if (tick === null) return tickMs;
  const remainder = tick % gridStep;
  const ticks = input.afterClaim === true || remainder === 0
    ? gridStep
    : gridStep - remainder;
  return Math.max(1, Math.round(ticks * tickMs));
}

module.exports = {
  DEFAULT_GRID_STEP,
  SAFE_AFK_GRID_STEP,
  DEFAULT_TICK_MS,
  MAX_PLAUSIBLE_TICK_RATE_PER_MS,
  PLAUSIBLE_TICK_MARGIN,
  REANCHOR_STREAK,
  REANCHOR_MIN_STALL_MS,
  normalizeGameTick,
  createTickGridShootingState,
  observeRealtimeTick,
  claimShootSlot,
  tickGridSnapshot,
  countGridSlotsUntil,
  nextGridDelayMs
};
