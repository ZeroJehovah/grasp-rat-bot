'use strict';

const {
  buildLeaveFailureAlert,
  leaveWithVerification
} = require('./leave-client');

const DEFAULT_STALE_SELF_MS = 3000;
const DEFAULT_STALE_SELF_CONFIRM_MS = 2000;
const DEFAULT_NO_SELF_GRACE_MS = 3000;
const DEFAULT_FRAME_GAP_ALERT_MS = 2000;
const DEFAULT_STAMINA_EXHAUSTED_BELOW_MS = 200;
const DEFAULT_COMBAT_MOVEMENT_SETTLEMENT_STALL_MS = 2500;

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function createSafetyEvent(reason, detail = {}, options = {}) {
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const severity = options.severity || 'stop';
  const shouldLeave = options.shouldLeave !== false;
  return {
    ok: false,
    reason,
    severity,
    classification: String(options.classification || (shouldLeave ? 'exit' : 'safety')),
    shouldLeave,
    leaveAttempted: options.leaveAttempted === undefined ? shouldLeave : Boolean(options.leaveAttempted),
    exitConfirmationRequired: options.exitConfirmationRequired === undefined ? shouldLeave : Boolean(options.exitConfirmationRequired),
    selfAuthorityMissing: Boolean(options.selfAuthorityMissing),
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

function decisionSafetyCombatMetrics(metrics) {
  if (!metrics || typeof metrics !== 'object') return null;
  return {
    targetId: metrics.targetId ?? null,
    targetName: String(metrics.targetName || ''),
    startedAt: numberOrNull(metrics.startedAt),
    lastObservedAt: numberOrNull(metrics.lastObservedAt),
    initialSelfHp: numberOrNull(metrics.initialSelfHp),
    lastSelfHp: numberOrNull(metrics.lastSelfHp),
    minSelfHp: numberOrNull(metrics.minSelfHp),
    initialTargetHp: numberOrNull(metrics.initialTargetHp),
    lastTargetHp: numberOrNull(metrics.lastTargetHp),
    minTargetHp: numberOrNull(metrics.minTargetHp),
    selfDamage: numberOrNull(metrics.selfDamage),
    targetDamage: numberOrNull(metrics.targetDamage),
    actualShots: numberOrNull(metrics.actualShots),
    requestedShots: numberOrNull(metrics.requestedShots),
    acceptedShots: numberOrNull(metrics.acceptedShots),
    unackedShots: numberOrNull(metrics.unackedShots),
    confirmedHits: numberOrNull(metrics.confirmedHits),
    incomingHits: numberOrNull(metrics.incomingHits),
    estimatedHitRate: numberOrNull(metrics.estimatedHitRate),
    totalStaminaSpent: numberOrNull(metrics.totalStaminaSpent)
  };
}

function decisionSafetyDetail(decision) {
  const action = decision?.action || decision || {};
  const combat = decision?.combat || null;
  return {
    kind: action.kind || decision?.kind || '',
    band: action.band || decision?.band || '',
    reason: action.reason || decision?.reason || '',
    at: decision?.at || '',
    self: action.self || decision?.input?.self || null,
    target: action.target || decision?.combat?.target || null,
    injury: action.injury || null,
    staminaBudgetExit: action.staminaBudgetExit || null,
    staminaExhausted: action.staminaExhausted || null,
    reloginDelayMs: action.reloginDelayMs ?? action.staminaBudgetExit?.reloginDelayMs ?? null,
    staminaBlocked: action.staminaBlocked || null,
    recoverySafety: action.recoverySafety || null,
    combat: (combat || action.combatExit) ? {
      startedAt: combat?.startedAt || '',
      durationMs: combat?.durationMs ?? null,
      self: combat?.self || action.self || null,
      target: combat?.target || action.target || null,
      movement: combat?.movement || null,
      shooting: combat?.shooting || null,
      exit: combat?.exit || action.combatExit || null,
      metrics: decisionSafetyCombatMetrics(combat?.metrics)
    } : null,
    profit: decision?.profit ? {
      best: decision.profit.best || null
    } : null
  };
}

function actionTargetId(target) {
  const value = target?.userId ?? target?.user_id ?? target?.entityId ?? target?.entity_id ?? target?.id;
  return value === null || value === undefined || value === '' ? '' : String(value);
}

function bulletOwnerId(bullet) {
  const value = bullet?.owner_user_id
    ?? bullet?.ownerUserId
    ?? bullet?.owner_id
    ?? bullet?.ownerId
    ?? bullet?.user_id
    ?? bullet?.userId;
  return value === null || value === undefined || value === '' ? '' : String(value);
}

function frameGapRiskAssessment(state = {}, context = {}) {
  const self = state?.realtime?.self || null;
  const decision = context.lastDecision || context.decision || null;
  const action = decision?.action || decision || {};
  const band = String(action.band || decision?.band || '');
  const kind = String(action.kind || decision?.kind || '');
  const selfHp = numberOrNull(self?.hp);
  const selfMaxHp = numberOrNull(self?.max_hp ?? self?.maxHp) ?? 100;
  const selfId = String(self?.user_id ?? self?.userId ?? '');
  const bullets = (Array.isArray(state?.realtime?.bullets) ? state.realtime.bullets : [])
    .filter(bullet => !selfId || bulletOwnerId(bullet) !== selfId);
  const visibleTargets = Array.isArray(state?.realtime?.entities) ? state.realtime.entities : [];
  const activeThreats = visibleTargets.filter(entity => {
    if (!entity || entity.alive === false || Number(entity.user_id ?? entity.userId) === Number(self?.user_id ?? self?.userId)) return false;
    return String(entity.current_join_mode || entity.mode || '').toLowerCase() === 'active'
      || entity.active === true
      || entity.firing === true;
  });
  const combatTarget = action.target || decision?.combat?.target || null;
  const injury = action.injury || decision?.injury || null;
  const recovery = band === 'recover'
    || /recover|stamina|wait-for-full/i.test(`${kind}|${action.reason || decision?.reason || ''}`);
  const combat = band === 'combat'
    || kind === 'combat-live'
    || Boolean(decision?.combat?.target?.userId ?? decision?.combat?.target?.user_id);
  const safety = band === 'safety';
  const lowHp = selfHp !== null && selfHp < selfMaxHp;
  const risky = Boolean(combat || safety || recovery || injury?.active || bullets.length || activeThreats.length || lowHp || !self);
  return {
    risky,
    decisionKind: kind,
    decisionBand: band,
    selfHp,
    selfMaxHp,
    lowHp,
    combat,
    safety,
    recovery,
    recentInjury: Boolean(injury?.active),
    target: combatTarget ? {
      userId: combatTarget.userId ?? combatTarget.user_id ?? null,
      name: String(combatTarget.name || ''),
      hp: numberOrNull(combatTarget.hp),
      distance: numberOrNull(combatTarget.distance)
    } : null,
    bulletCount: bullets.length,
    activeThreatCount: activeThreats.length
  };
}

function actionSettlementStallAssessment(state = {}, context = {}, options = {}) {
  const movement = context.actionSettlementStall || null;
  const decision = context.lastDecision || context.decision || null;
  const action = decision?.action || decision || {};
  const combat = decision?.combat || null;
  const target = action.target || combat?.target || null;
  const kind = String(action.kind || decision?.kind || '');
  const band = String(action.band || decision?.band || '');
  const targetId = actionTargetId(target);
  const selfId = actionTargetId(state?.realtime?.self);
  const bullets = Array.isArray(state?.realtime?.bullets) ? state.realtime.bullets : [];
  const targetOwnedBulletCount = targetId
    ? bullets.filter(bullet => bulletOwnerId(bullet) === targetId && bulletOwnerId(bullet) !== selfId).length
    : 0;
  const combatAction = band === 'combat'
    || kind === 'combat-live'
    || kind === 'combat-candidate'
    || Boolean(combat?.target);
  const safetyMotion = band === 'safety'
    && Boolean(target)
    && (kind === 'flee' || kind === 'safety-exit' || action.urgent === true);
  const injuryPressure = Boolean(action.injury || decision?.injury || action.threatEvidence?.recentDamage);
  const targetFiring = Boolean(target?.firing || target?.shooting || target?.is_firing);
  const easyKillThreatExempt = Boolean(target?.easyKillThreatExempt);
  const easyKillProfitTarget = Boolean(target?.easyKillProfitTarget);
  const exemptProfitCombat = Boolean(combatAction && easyKillThreatExempt && easyKillProfitTarget);
  const directThreatPressure = Boolean(
    safetyMotion
      || injuryPressure
      || targetFiring
      || targetOwnedBulletCount > 0
  );
  const combatPressure = Boolean(combatAction && (!exemptProfitCombat || directThreatPressure));
  const hostilePressure = Boolean(combatPressure || directThreatPressure);
  const adapterThresholdMs = Math.max(1000, Number(movement?.stallMs || 5000));
  const configuredCombatThresholdMs = numberOrNull(
    context.combatMovementSettlementStallMs ?? options.combatMovementSettlementStallMs
  );
  const combatThresholdMs = Math.max(1000, configuredCombatThresholdMs === null
    ? Math.min(adapterThresholdMs, DEFAULT_COMBAT_MOVEMENT_SETTLEMENT_STALL_MS)
    : configuredCombatThresholdMs);
  const observedFrames = Math.max(0, Number(movement?.observedFrames || 0));
  const minimumFrames = Math.max(1, Number(context.movementSettlementFrames ?? options.movementSettlementFrames ?? 2));
  const noProgressMs = Math.max(0, Number(movement?.noProgressMs || 0));
  const adapterStalled = Boolean(movement?.stalled);
  const combatStalled = Boolean(
    movement?.active
      && hostilePressure
      && observedFrames >= minimumFrames
      && noProgressMs >= combatThresholdMs
  );
  return {
    active: Boolean(movement?.active),
    triggered: Boolean(adapterStalled || combatStalled),
    adapterStalled,
    combatStalled,
    hostilePressure,
    combatAction,
    combatPressure,
    easyKillThreatExempt,
    easyKillProfitTarget,
    exemptProfitCombat,
    targetFiring,
    suppressedEarlyCombatExit: Boolean(exemptProfitCombat && !directThreatPressure),
    pressureSources: [
      combatPressure ? 'combat-action' : '',
      safetyMotion ? 'safety-motion' : '',
      injuryPressure ? 'recent-injury' : '',
      targetFiring ? 'target-firing' : '',
      targetOwnedBulletCount > 0 ? 'target-owned-bullet' : ''
    ].filter(Boolean),
    decisionKind: kind,
    decisionBand: band,
    targetId: targetId || null,
    targetName: String(target?.name || ''),
    targetOwnedBulletCount,
    observedFrames,
    minimumFrames,
    noProgressMs,
    thresholdMs: hostilePressure ? combatThresholdMs : adapterThresholdMs,
    combatThresholdMs,
    adapterThresholdMs
  };
}

function evaluateBrowserlessSafety(state = {}, context = {}, options = {}) {
  const nowMs = numberOrNull(options.nowMs ?? context.nowMs) ?? Date.now();
  const staleSelfMs = Math.max(1000, Number(options.staleSelfMs ?? context.staleSelfMs ?? DEFAULT_STALE_SELF_MS));
  const staleSelfConfirmMs = Math.max(0, Number(options.staleSelfConfirmMs ?? context.staleSelfConfirmMs ?? DEFAULT_STALE_SELF_CONFIRM_MS));
  const staleSelfExitMs = staleSelfMs + staleSelfConfirmMs;
  const noSelfGraceMs = Math.max(0, Number(options.noSelfGraceMs ?? context.noSelfGraceMs ?? DEFAULT_NO_SELF_GRACE_MS));
  const frameGapAlertMs = Math.max(1000, Number(options.frameGapAlertMs ?? context.frameGapAlertMs ?? DEFAULT_FRAME_GAP_ALERT_MS));
  const staminaFloor = Math.max(0, Number(options.staminaExhaustedBelowMs ?? context.staminaExhaustedBelowMs ?? DEFAULT_STAMINA_EXHAUSTED_BELOW_MS));

  if (context.stopRequested) {
    return createSafetyEvent('explicit-stop', context.stopDetail || {}, { nowMs });
  }

  const decisionAction = context.decision?.action || context.decision || null;
  const decisionSafetyKind = String(decisionAction?.kind || context.decision?.kind || '');
  if (decisionAction
    && String(decisionAction.band || '') === 'safety'
    && (decisionSafetyKind === 'safety-exit' || decisionAction.shouldLeave === true)) {
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
    const lastDecision = context.lastDecision || context.decision || null;
    const messages = Array.isArray(state?.fallback?.messages) ? state.fallback.messages : [];
    const recentSessionMessages = messages.filter(message => /left user|killed|kill/i.test(String(
      message?.message ?? message?.text ?? message?.content ?? message
    ))).slice(-6);
    return createSafetyEvent('no-self', {
      noSelfGraceMs,
      elapsedMs: nowMs - startedAtMs,
      lastRealtimeTick: state?.realtime?.tick ?? null,
      lastRealtimeAtMs: state?.realtime?.receivedAtMs ?? null,
      lastRealtimeAgeMs: state?.realtime?.frameAgeMs ?? state?.frameAges?.realtimeAgeMs ?? null,
      lastSelf: state?.realtime?.lastSelf || context.lastSelf || null,
      lastDecision: lastDecision ? decisionSafetyDetail(lastDecision) : null,
      lastCombatTarget: lastDecision?.combat?.target || lastDecision?.action?.target || null,
      recentSessionMessages,
      ws: {
        open: context.wsOpen === undefined ? null : Boolean(context.wsOpen),
        closed: context.wsClosed || null,
        error: context.wsError ? (context.wsError.message || String(context.wsError)) : ''
      },
      snapshot: {
        tick: state?.fallback?.tick ?? null,
        receivedAtMs: state?.fallback?.receivedAtMs ?? null,
        containsSelf: Boolean(state?.fallback?.self)
      }
    }, {
      nowMs,
      shouldLeave: false,
      stopMotion: false,
      classification: 'session-recovery',
      leaveAttempted: false,
      exitConfirmationRequired: false,
      selfAuthorityMissing: true
    });
  }

  const realtimeAgeMs = numberOrNull(state?.realtime?.frameAgeMs ?? state?.frameAges?.realtimeAgeMs);
  if (self && realtimeAgeMs !== null && realtimeAgeMs > staleSelfExitMs) {
    return createSafetyEvent('stale-self', {
      realtimeAgeMs,
      staleSelfMs,
      staleSelfConfirmMs,
      staleSelfExitMs
    }, { nowMs });
  }

  const staminaRemainingMs = selfStaminaRemainingMs(self);
  if (staminaRemainingMs !== null && staminaRemainingMs <= staminaFloor) {
    return createSafetyEvent('stamina-exhausted', {
      staminaRemainingMs,
      staminaExhaustedBelowMs: staminaFloor
    }, { nowMs });
  }

  const movementStallAssessment = actionSettlementStallAssessment(state, context, options);
  if (movementStallAssessment.triggered) {
    const combatStall = movementStallAssessment.hostilePressure;
    return createSafetyEvent(combatStall ? 'combat-action-settlement-stalled' : 'action-settlement-stalled', {
      movement: context.actionSettlementStall,
      movementSafety: movementStallAssessment,
      lastDecision: (context.lastDecision || context.decision)
        ? decisionSafetyDetail(context.lastDecision || context.decision)
        : null,
      realtime: {
        tick: state?.realtime?.tick ?? null,
        receivedAtMs: state?.realtime?.receivedAtMs ?? null,
        self: state?.realtime?.self || null
      }
    }, {
      nowMs,
      shouldLeave: combatStall,
      stopMotion: true,
      classification: combatStall ? 'exit' : 'transport-recovery',
      leaveAttempted: combatStall,
      exitConfirmationRequired: combatStall
    });
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
  let frameGapSoftStop = null;
  let lastRealtimeTick = null;
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
    clearFrameGapSoftStop() {
      frameGapSoftStop = null;
      lastRealtimeTick = null;
    },
    getStopEvent() {
      return stopEvent;
    },
    evaluate(state, context = {}) {
      const mergedContext = {
        ...context,
        stopRequested: Boolean(stopEvent),
        stopDetail: stopEvent?.detail || context.stopDetail
      };
      if (stopEvent || context.wsError || context.wsClosed || context.snapshotSafety?.ok === false) {
        frameGapSoftStop = null;
        return evaluateBrowserlessSafety(state, mergedContext, options);
      }
      const nowMs = numberOrNull(context.nowMs) ?? (typeof options.now === 'function' ? options.now() : Date.now());
      const currentTick = numberOrNull(state?.realtime?.tick);
      if (currentTick !== null && (lastRealtimeTick === null || currentTick > lastRealtimeTick)) {
        const recovered = frameGapSoftStop
          ? {
              ...frameGapSoftStop,
              recoveredAt: nowMs,
              recoveredTick: currentTick,
              recoveryMs: Math.max(0, nowMs - Number(frameGapSoftStop.startedAt || nowMs))
            }
          : null;
        frameGapSoftStop = null;
        lastRealtimeTick = currentTick;
        const base = evaluateBrowserlessSafety(state, mergedContext, options);
        if (!base.ok || !recovered) return base;
        return {
          ok: true,
          reason: 'frame-gap-soft-recovered',
          recovered: true,
          at: new Date(nowMs).toISOString(),
          detail: recovered
        };
      }
      if (frameGapSoftStop) {
        const risk = frameGapRiskAssessment(state, mergedContext);
        const effectiveFrameGapMs = Number(frameGapSoftStop.initialFrameGapMs || frameGapSoftStop.frameGapAlertMs)
          + Math.max(0, nowMs - Number(frameGapSoftStop.startedAt || nowMs));
        if (risk.risky || effectiveFrameGapMs >= Number(frameGapSoftStop.hardDeadlineMs || 5000)) {
          const soft = frameGapSoftStop;
          frameGapSoftStop = null;
          return createSafetyEvent('frame-gap', {
            frameGapMs: effectiveFrameGapMs,
            frameGapAlertMs: soft.frameGapAlertMs,
            hardDeadlineMs: soft.hardDeadlineMs,
            risk,
            softStop: {
              startedAt: soft.startedAt,
              startTick: soft.startTick,
              elapsedMs: Math.max(0, nowMs - Number(soft.startedAt || nowMs)),
              result: risk.risky ? 'risk-escalated' : 'hard-deadline'
            }
          }, { nowMs });
        }
        return {
          ok: true,
          reason: 'frame-gap-soft-stop',
          softStop: true,
          at: new Date(nowMs).toISOString(),
          detail: {
            ...frameGapSoftStop,
            frameGapMs: effectiveFrameGapMs,
            expiresInMs: Math.max(0, Number(frameGapSoftStop.hardDeadlineMs || 5000) - effectiveFrameGapMs)
          }
        };
      }
      const frameGapMs = numberOrNull(context.frameGapMs)
        ?? numberOrNull(state?.frameAges?.latestFrameAgeMs)
        ?? null;
      const frameGapAlertMs = Math.max(1000, Number(context.frameGapAlertMs ?? options.frameGapAlertMs ?? DEFAULT_FRAME_GAP_ALERT_MS));
      if (frameGapMs !== null && frameGapMs > frameGapAlertMs) {
        const risk = frameGapRiskAssessment(state, mergedContext);
        const hardDeadlineMs = Math.max(frameGapAlertMs + 1000, Number(
          context.frameGapHardDeadlineMs ?? options.frameGapHardDeadlineMs ?? 5000
        ));
        if (risk.risky || frameGapMs >= hardDeadlineMs) {
          const soft = frameGapSoftStop;
          frameGapSoftStop = null;
          return createSafetyEvent('frame-gap', {
            frameGapMs,
            frameGapAlertMs,
            hardDeadlineMs,
            risk,
            softStop: soft ? {
              startedAt: soft.startedAt,
              startTick: soft.startTick,
              elapsedMs: Math.max(0, nowMs - Number(soft.startedAt || nowMs)),
              result: 'hard-deadline'
            } : null
          }, { nowMs });
        }
        if (!frameGapSoftStop) {
          frameGapSoftStop = {
            startedAt: nowMs,
            startTick: currentTick,
            initialFrameGapMs: frameGapMs,
            frameGapAlertMs,
            hardDeadlineMs,
            risk
          };
        }
        return {
          ok: true,
          reason: 'frame-gap-soft-stop',
          softStop: true,
          at: new Date(nowMs).toISOString(),
          detail: {
            ...frameGapSoftStop,
            frameGapMs,
            expiresInMs: Math.max(0, hardDeadlineMs - frameGapMs)
          }
        };
      }
      return evaluateBrowserlessSafety(state, mergedContext, options);
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
  const stopMotion = event?.shouldLeave
    ? { attempted: false, sent: false, reason: 'preserve-control-until-leave-confirmed' }
    : (event?.stopMotion
        ? sendStopMotion(deps.transport, { allowStopMotion: deps.allowStopMotion })
        : { attempted: false, sent: false, reason: 'not-required' });
  if (!event?.shouldLeave) {
    return { ok: true, event, stopMotion, leave: null };
  }
  const leave = await (deps.leaveWithVerification || leaveWithVerification)({
    gameOrigin: config.gameOrigin,
    userId: config.userId,
    sessionToken: config.sessionToken,
    timeoutMs: config.httpTimeoutMs || 10000,
    localAddress: config.sourceIp,
    retryMax: config.leaveRetryMax ?? 3,
    retryDelayMs: config.leaveRetryMs ?? 200,
    hedgeDelayMs: config.leaveHedgeMs ?? 1000,
    fetchImpl: deps.fetchImpl,
    sleep: deps.sleep,
    now: deps.now
  });
  let confirmedControlClose = null;
  if (leave?.ok && typeof deps.onLeaveConfirmed === 'function') {
    try {
      confirmedControlClose = await deps.onLeaveConfirmed(leave);
    } catch (err) {
      confirmedControlClose = {
        ok: false,
        error: err?.message || String(err)
      };
    }
  }
  const leaveFailure = leave?.ok === false
    ? evaluateBrowserlessSafety({}, { leaveResult: leave, nowMs: typeof deps.now === 'function' ? deps.now() : Date.now() })
    : null;
  return {
    ok: Boolean(leave?.ok),
    event,
    stopMotion,
    leave,
    confirmedControlClose,
    leaveFailure
  };
}

module.exports = {
  DEFAULT_COMBAT_MOVEMENT_SETTLEMENT_STALL_MS,
  DEFAULT_FRAME_GAP_ALERT_MS,
  DEFAULT_NO_SELF_GRACE_MS,
  DEFAULT_STALE_SELF_CONFIRM_MS,
  DEFAULT_STALE_SELF_MS,
  DEFAULT_STAMINA_EXHAUSTED_BELOW_MS,
  actionSettlementStallAssessment,
  createBrowserlessSafetyController,
  createSafetyEvent,
  evaluateBrowserlessSafety,
  executeSafetyExit,
  frameGapRiskAssessment,
  selfStaminaRemainingMs,
  sendStopMotion
};
