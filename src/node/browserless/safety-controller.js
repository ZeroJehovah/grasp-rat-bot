'use strict';

const {
  buildLeaveFailureAlert,
  leaveWithVerification
} = require('./leave-client');

const DEFAULT_STALE_SELF_MS = 3000;
const DEFAULT_NO_SELF_GRACE_MS = 3000;
const DEFAULT_FRAME_GAP_ALERT_MS = 5000;
const DEFAULT_STAMINA_EXHAUSTED_BELOW_MS = 200;

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function createSafetyEvent(reason, detail = {}, options = {}) {
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const severity = options.severity || 'stop';
  return {
    ok: false,
    reason,
    severity,
    shouldLeave: options.shouldLeave !== false,
    stopMotion: options.stopMotion !== false,
    at: new Date(numberOrNull(options.nowMs) ?? now()).toISOString(),
    detail
  };
}

function selfStaminaRemainingMs(self) {
  if (!self || typeof self !== 'object') return null;
  const candidates = [
    self.stamina_5s_remaining_milli,
    self.stamina5sRemainingMilli,
    self.stamina_remaining_ms,
    self.staminaRemainingMs,
    self.stamina
  ];
  for (const value of candidates) {
    const number = numberOrNull(value);
    if (number !== null) return number;
  }
  return null;
}

function decisionSafetyDetail(decision) {
  const action = decision?.action || decision || {};
  return {
    kind: action.kind || decision?.kind || '',
    band: action.band || decision?.band || '',
    reason: action.reason || decision?.reason || '',
    self: action.self || decision?.input?.self || null,
    target: action.target || decision?.combat?.target || null,
    combat: decision?.combat ? {
      target: decision.combat.target || null,
      movement: decision.combat.movement || null,
      shooting: decision.combat.shooting || null
    } : null,
    profit: decision?.profit ? {
      best: decision.profit.best || null
    } : null
  };
}

function evaluateBrowserlessSafety(state = {}, context = {}, options = {}) {
  const nowMs = numberOrNull(options.nowMs ?? context.nowMs) ?? Date.now();
  const staleSelfMs = Math.max(1000, Number(options.staleSelfMs ?? context.staleSelfMs ?? DEFAULT_STALE_SELF_MS));
  const noSelfGraceMs = Math.max(0, Number(options.noSelfGraceMs ?? context.noSelfGraceMs ?? DEFAULT_NO_SELF_GRACE_MS));
  const frameGapAlertMs = Math.max(1000, Number(options.frameGapAlertMs ?? context.frameGapAlertMs ?? DEFAULT_FRAME_GAP_ALERT_MS));
  const staminaFloor = Math.max(0, Number(options.staminaExhaustedBelowMs ?? context.staminaExhaustedBelowMs ?? DEFAULT_STAMINA_EXHAUSTED_BELOW_MS));

  if (context.stopRequested) {
    return createSafetyEvent('explicit-stop', context.stopDetail || {}, { nowMs });
  }

  const decisionAction = context.decision?.action || context.decision || null;
  if (decisionAction && String(decisionAction.band || '') === 'safety') {
    return createSafetyEvent(decisionAction.reason || 'decision-safety', {
      decision: decisionSafetyDetail(context.decision)
    }, {
      nowMs,
      shouldLeave: decisionAction.shouldLeave !== false,
      stopMotion: decisionAction.stopMotion !== false,
      severity: decisionAction.severity || 'stop'
    });
  }

  if (context.snapshotSafety && context.snapshotSafety.ok === false) {
    return createSafetyEvent('unsafe-login-point', {
      snapshotSafety: context.snapshotSafety
    }, { nowMs, shouldLeave: false, stopMotion: false });
  }

  if (context.wsError) {
    return createSafetyEvent('ws-error', {
      message: context.wsError.message || String(context.wsError)
    }, { nowMs });
  }

  if (context.wsClosed) {
    return createSafetyEvent('ws-closed', context.wsClosed, { nowMs });
  }

  const frameGapMs = numberOrNull(context.frameGapMs)
    ?? numberOrNull(state?.frameAges?.latestFrameAgeMs)
    ?? null;
  if (frameGapMs !== null && frameGapMs > frameGapAlertMs) {
    return createSafetyEvent('frame-gap', {
      frameGapMs,
      frameGapAlertMs
    }, { nowMs });
  }

  const self = state?.realtime?.self || null;
  const startedAtMs = numberOrNull(context.startedAtMs) ?? nowMs;
  const requireSelf = context.requireSelf !== false;
  if (requireSelf && !self && nowMs - startedAtMs >= noSelfGraceMs) {
    return createSafetyEvent('no-self', {
      noSelfGraceMs,
      elapsedMs: nowMs - startedAtMs
    }, { nowMs });
  }

  const realtimeAgeMs = numberOrNull(state?.realtime?.frameAgeMs ?? state?.frameAges?.realtimeAgeMs);
  if (self && realtimeAgeMs !== null && realtimeAgeMs > staleSelfMs) {
    return createSafetyEvent('stale-self', {
      realtimeAgeMs,
      staleSelfMs
    }, { nowMs });
  }

  const staminaRemainingMs = selfStaminaRemainingMs(self);
  if (staminaRemainingMs !== null && staminaRemainingMs <= staminaFloor) {
    return createSafetyEvent('stamina-exhausted', {
      staminaRemainingMs,
      staminaExhaustedBelowMs: staminaFloor
    }, { nowMs });
  }

  if (context.leaveResult && context.leaveResult.ok === false) {
    return createSafetyEvent('direct-leave-failed', {
      alert: context.leaveResult.alert || buildLeaveFailureAlert(context.leaveResult.attempts || []),
      attempts: context.leaveResult.attempts || []
    }, { nowMs, shouldLeave: false, stopMotion: false, severity: 'alert' });
  }

  return { ok: true, reason: 'safe', at: new Date(nowMs).toISOString() };
}

function createBrowserlessSafetyController(options = {}) {
  let stopEvent = null;
  return {
    requestStop(reason = 'explicit-stop', detail = {}) {
      stopEvent = createSafetyEvent(reason, detail, {
        now: options.now,
        nowMs: typeof options.now === 'function' ? options.now() : Date.now()
      });
      return stopEvent;
    },
    clearStop() {
      stopEvent = null;
    },
    getStopEvent() {
      return stopEvent;
    },
    evaluate(state, context = {}) {
      return evaluateBrowserlessSafety(state, {
        ...context,
        stopRequested: Boolean(stopEvent),
        stopDetail: stopEvent?.detail || context.stopDetail
      }, options);
    }
  };
}

function sendStopMotion(transport, options = {}) {
  if (!transport || options.allowStopMotion === false) {
    return { attempted: false, sent: false, reason: options.allowStopMotion === false ? 'disabled' : 'missing-transport' };
  }
  try {
    if (typeof transport.sendVelocity === 'function') {
      transport.sendVelocity(0, 0);
    } else if (typeof transport.send === 'function') {
      transport.send('vel 0 0');
    } else {
      return { attempted: false, sent: false, reason: 'missing-send' };
    }
    return { attempted: true, sent: true, reason: '' };
  } catch (err) {
    return { attempted: true, sent: false, reason: err?.message || String(err) };
  }
}

async function executeSafetyExit(event, config = {}, deps = {}) {
  const stopMotion = event?.stopMotion
    ? sendStopMotion(deps.transport, { allowStopMotion: deps.allowStopMotion })
    : { attempted: false, sent: false, reason: 'not-required' };
  if (!event?.shouldLeave) {
    return { ok: true, event, stopMotion, leave: null };
  }
  const leave = await (deps.leaveWithVerification || leaveWithVerification)({
    gameOrigin: config.gameOrigin,
    userId: config.userId,
    sessionToken: config.sessionToken,
    timeoutMs: config.httpTimeoutMs || 10000,
    retryMax: config.leaveRetryMax ?? 3,
    retryDelayMs: config.leaveRetryMs ?? 1200,
    fetchImpl: deps.fetchImpl,
    sleep: deps.sleep,
    now: deps.now
  });
  const leaveFailure = leave?.ok === false
    ? evaluateBrowserlessSafety({}, { leaveResult: leave, nowMs: typeof deps.now === 'function' ? deps.now() : Date.now() })
    : null;
  return {
    ok: Boolean(leave?.ok),
    event,
    stopMotion,
    leave,
    leaveFailure
  };
}

module.exports = {
  DEFAULT_FRAME_GAP_ALERT_MS,
  DEFAULT_NO_SELF_GRACE_MS,
  DEFAULT_STALE_SELF_MS,
  DEFAULT_STAMINA_EXHAUSTED_BELOW_MS,
  createBrowserlessSafetyController,
  createSafetyEvent,
  evaluateBrowserlessSafety,
  executeSafetyExit,
  selfStaminaRemainingMs,
  sendStopMotion
};
