'use strict';

// Shared fire-slot policy. The store owns one instance of this state per
// process; all actual shoot paths claim through the same object.

const DEFAULT_GRID_STEP = 10;
const SAFE_AFK_GRID_STEP = 5;
const DEFAULT_TICK_MS = 50;
// Physical floor for the cross-day sanity bound: a server frame counter cannot
// advance faster than one per millisecond. It is only a rejection bound for
// frames delivered across a midnight rotation, never a shooting cadence.
const MIN_PLAUSIBLE_TICK_RATE_PER_MS = 1;

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
    tickRate: null,
    maxObservedTickGap: 0
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
  state.tickRate = null;
  state.maxObservedTickGap = 0;
  state.lastRotationReason = String(reason || '');
  return state;
}

function maximumPlausibleTick(state, elapsedDayMs) {
  const observedRate = Number(state.tickRate);
  const rate = Number.isFinite(observedRate) && observedRate > 0
    ? observedRate
    : MIN_PLAUSIBLE_TICK_RATE_PER_MS;
  const expected = Number(elapsedDayMs) * rate;
  return Math.ceil(expected + Math.max(2, Number(state.maxObservedTickGap || 0)));
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
  const maximumTick = elapsedDayMs === null ? null : maximumPlausibleTick(state, elapsedDayMs);
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
  const previousAtMs = state.receivedAtMs;
  if (previousTick !== null && tick <= previousTick) {
    state.staleObservationCount += 1;
    state.lastStaleObservation = {
      tick,
      receivedAtMs: atMs,
      reason: tick === previousTick ? 'duplicate-watermark-tick' : 'older-watermark-tick',
      watermarkTick: previousTick
    };
    return {
      ok: false,
      reason: tick === previousTick ? 'duplicate-watermark-tick' : 'older-watermark-tick',
      epoch: state.epoch,
      tick: previousTick
    };
  }
  if (previousTick !== null && previousAtMs !== null && atMs > previousAtMs) {
    const deltaTicks = tick - previousTick;
    const deltaMs = atMs - previousAtMs;
    if (deltaTicks > 0 && deltaMs > 0) {
      const rate = deltaTicks / deltaMs;
      state.tickRate = Number.isFinite(state.tickRate) ? Math.max(state.tickRate, rate) : rate;
      state.maxObservedTickGap = Math.max(Number(state.maxObservedTickGap || 0), deltaTicks);
    }
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
  MIN_PLAUSIBLE_TICK_RATE_PER_MS,
  normalizeGameTick,
  createTickGridShootingState,
  observeRealtimeTick,
  claimShootSlot,
  tickGridSnapshot,
  countGridSlotsUntil,
  nextGridDelayMs
};
