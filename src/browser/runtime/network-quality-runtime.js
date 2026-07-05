'use strict';

function createNetworkQualityRuntime(runtime = {}) {
  const {
    bot,
    cfg,
    getSelf = () => null,
    clamp = (value, min, max) => Math.max(min, Math.min(max, value))
  } = runtime;

  function pushBounded(list, item, max) {
    list.push(item);
    while (list.length > max) list.shift();
  }

  function networkQualityRound(value, digits = 0) {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    const factor = Math.pow(10, Math.max(0, Math.round(Number(digits) || 0)));
    return Math.round(n * factor) / factor;
  }

  function networkQualityEma(previous, sample, alpha = 0.2) {
    const value = Number(sample);
    if (!Number.isFinite(value)) return Number.isFinite(Number(previous)) ? Number(previous) : null;
    const prev = Number(previous);
    if (!Number.isFinite(prev)) return value;
    const a = clamp(Number(alpha) || 0.2, 0.01, 1);
    return prev + (value - prev) * a;
  }

  function ensureNetworkQualityState() {
    if (!bot.networkQuality || typeof bot.networkQuality !== 'object') {
      bot.networkQuality = {
        startedAt: Date.now(),
        frameSamples: [],
        pendingShots: [],
        pendingMovement: null,
        frameCount: 0,
        frameGapCount: 0,
        estimatedLostFrames: 0,
        expectedFrames: 0,
        movementCommandCount: 0,
        movementAckCount: 0,
        movementTimeoutCount: 0,
        attackShotCount: 0,
        attackAckCount: 0,
        attackTimeoutCount: 0,
        lastDiagnosticLogAt: 0,
        lastDiagnosticSignature: ''
      };
    }
    if (!Array.isArray(bot.networkQuality.frameSamples)) bot.networkQuality.frameSamples = [];
    if (!Array.isArray(bot.networkQuality.pendingShots)) bot.networkQuality.pendingShots = [];
    return bot.networkQuality;
  }

  function networkQualityPoint(entity) {
    const x = Number(entity?.x);
    const y = Number(entity?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  }

  function networkQualityDistance(a, b) {
    if (!a || !b) return Infinity;
    return Math.hypot(Number(a.x) - Number(b.x), Number(a.y) - Number(b.y));
  }

  function networkQualityWindowMs() {
    return Math.max(5000, Number(cfg.networkQualityWindowMs || 30000) || 30000);
  }

  function networkQualityBaseFrameMs() {
    const configured = Number(cfg.networkQualityExpectedFrameMs || 0);
    if (Number.isFinite(configured) && configured > 0) return configured;
    return Math.max(40, Number(cfg.combatNativeTickMinMs || cfg.nativeTickMinMs || cfg.tickMs || 120) || 120);
  }

  function networkQualityExpectedFrameMs(q = ensureNetworkQualityState()) {
    const configured = Number(cfg.networkQualityExpectedFrameMs || 0);
    if (Number.isFinite(configured) && configured > 0) return Math.max(20, configured);
    const base = networkQualityBaseFrameMs();
    const minGap = Number(q.frameIntervalMinMs || 0);
    const emaGap = Number(q.frameIntervalEmaMs || 0);
    const learned = Number.isFinite(minGap) && minGap > 0
      ? Math.min(emaGap > 0 ? emaGap : minGap, minGap * 1.35)
      : (emaGap > 0 ? emaGap : base);
    return Math.max(20, Math.min(Math.max(base * 2.5, 250), learned || base));
  }

  function pruneNetworkQualityFrameSamples(q, t = Date.now()) {
    const cutoff = t - networkQualityWindowMs();
    q.frameSamples = (Array.isArray(q.frameSamples) ? q.frameSamples : []).filter(sample => Number(sample.at || 0) >= cutoff);
    let lost = 0;
    let expected = 0;
    let maxGap = 0;
    for (const sample of q.frameSamples) {
      lost += Math.max(0, Number(sample.lost || 0) || 0);
      expected += Math.max(1, Number(sample.expected || 1) || 1);
      maxGap = Math.max(maxGap, Number(sample.gap || 0) || 0);
    }
    q.estimatedLostFrames = lost;
    q.expectedFrames = expected;
    q.lossRate = expected > 0 ? lost / expected : 0;
    q.maxFrameGapMs = maxGap;
  }

  function networkQualityFrameLatencySample(gapMs, expectedMs, lostFrames) {
    const gap = Math.max(0, Number(gapMs) || 0);
    const expected = Math.max(20, Number(expectedMs) || networkQualityBaseFrameMs());
    const excess = Math.max(0, gap - expected);
    const base = Math.min(expected, networkQualityBaseFrameMs());
    const lossPenalty = Math.max(0, Number(lostFrames || 0)) * Math.min(expected, 120);
    return Math.max(0, base + excess + lossPenalty);
  }

  function estimateNetworkQualityLostFrames(gapMs, expectedMs) {
    const gap = Math.max(0, Number(gapMs) || 0);
    const expected = Math.max(20, Number(expectedMs) || networkQualityBaseFrameMs());
    const ratio = Math.max(1.25, Number(cfg.networkQualityFrameLossGapRatio || 2.25) || 2.25);
    const extra = Math.max(0, Number(cfg.networkQualityFrameLossGapMinExtraMs || 180) || 180);
    if (gap < expected * ratio && gap < expected + extra) return 0;
    return Math.max(1, Math.round(gap / expected) - 1);
  }

  function observeNativeWsFrame(source = 'native-ws') {
    if (!cfg.networkQualityEnabled) return null;
    const q = ensureNetworkQualityState();
    const t = Date.now();
    const previousAt = Number(q.lastFrameAt || 0);
    const gap = previousAt ? Math.max(0, t - previousAt) : 0;
    q.lastFrameAt = t;
    q.lastFrameSource = String(source || 'native-ws');
    q.frameCount = Math.max(0, Number(q.frameCount || 0) || 0) + 1;
    if (gap > 0 && gap < 60000) {
      const expectedBefore = networkQualityExpectedFrameMs(q);
      const lost = estimateNetworkQualityLostFrames(gap, expectedBefore);
      q.frameGapCount = Math.max(0, Number(q.frameGapCount || 0) || 0) + 1;
      q.lastFrameGapMs = Math.round(gap);
      q.frameIntervalEmaMs = networkQualityEma(q.frameIntervalEmaMs, gap, 0.18);
      if (gap >= 20 && gap <= Math.max(1000, expectedBefore * 4) && (!q.frameIntervalMinMs || gap < Number(q.frameIntervalMinMs))) {
        q.frameIntervalMinMs = Math.round(gap);
      }
      const expectedAfter = networkQualityExpectedFrameMs(q);
      q.expectedFrameMs = Math.round(expectedAfter);
      q.jitterEmaMs = networkQualityEma(q.jitterEmaMs, Math.abs(gap - expectedAfter), 0.18);
      q.stateLatencyEmaMs = networkQualityEma(q.stateLatencyEmaMs, networkQualityFrameLatencySample(gap, expectedAfter, lost), 0.22);
      q.frameSamples.push({
        at: t,
        gap: Math.round(gap),
        expected: Math.max(1, lost + 1),
        lost
      });
    }
    pruneNetworkQualityFrameSamples(q, t);
    return summarizeNetworkQuality(t);
  }

  function recordNetworkQualityMovementCommand(dx, dy, self = null, detail = {}) {
    if (!cfg.networkQualityEnabled || !(dx || dy)) return null;
    const q = ensureNetworkQualityState();
    const t = Date.now();
    const pending = q.pendingMovement;
    const minMs = Math.max(100, Number(cfg.networkQualityMovementCommandMinMs || 350) || 350);
    if (pending && t - Number(pending.at || 0) < minMs && Number(pending.dx || 0) === Number(dx) && Number(pending.dy || 0) === Number(dy)) {
      return pending;
    }
    const point = networkQualityPoint(self || getSelf());
    if (!point) return null;
    q.movementCommandCount = Math.max(0, Number(q.movementCommandCount || 0) || 0) + 1;
    q.pendingMovement = {
      at: t,
      dx: clamp(Math.round(Number(dx) || 0), -1, 1),
      dy: clamp(Math.round(Number(dy) || 0), -1, 1),
      origin: point,
      source: detail.source || 'velocity'
    };
    return q.pendingMovement;
  }

  function observeNetworkQualitySelf(self) {
    if (!cfg.networkQualityEnabled || !self) return null;
    const q = ensureNetworkQualityState();
    const t = Date.now();
    const point = networkQualityPoint(self);
    const pending = q.pendingMovement;
    if (pending && point && pending.origin) {
      const elapsed = Math.max(0, t - Number(pending.at || t));
      const moved = networkQualityDistance(point, pending.origin);
      const minMove = Math.max(1, Number(cfg.networkQualityMovementAckMinDistance || 40) || 40);
      const timeoutMs = Math.max(1000, Number(cfg.networkQualityActionAckTimeoutMs || 5000) || 5000);
      if (moved >= minMove) {
        q.movementAckCount = Math.max(0, Number(q.movementAckCount || 0) || 0) + 1;
        q.lastMovementAckAt = t;
        q.lastMovementAckMs = Math.round(elapsed);
        q.movementAckEmaMs = networkQualityEma(q.movementAckEmaMs, elapsed, 0.28);
        q.actionLatencyEmaMs = networkQualityEma(q.actionLatencyEmaMs, elapsed, 0.24);
        q.lastActionAckAt = t;
        q.lastActionAckSource = 'movement';
        q.pendingMovement = null;
      } else if (elapsed >= timeoutMs) {
        q.movementTimeoutCount = Math.max(0, Number(q.movementTimeoutCount || 0) || 0) + 1;
        q.lastMovementTimeoutAt = t;
        q.lastMovementTimeoutMs = Math.round(elapsed);
        q.pendingMovement = null;
      }
    }
    return summarizeNetworkQuality(t);
  }

  function networkQualityTargetId(target) {
    const id = target?.id ?? target?.user_id;
    return id === null || id === undefined ? '' : String(id);
  }

  function recordNetworkQualityShot(self, target, detail = {}) {
    if (!cfg.networkQualityEnabled || !target || !detail.sent || detail.blockedByCadence) return;
    const q = ensureNetworkQualityState();
    const targetId = networkQualityTargetId(target);
    if (!targetId) return;
    const t = Number(detail.at || Date.now());
    q.attackShotCount = Math.max(0, Number(q.attackShotCount || 0) || 0) + 1;
    q.pendingShots.push({
      at: t,
      targetId,
      targetName: target.name || target.label || '',
      targetHp: Number.isFinite(Number(target.hp)) ? Number(target.hp) : null,
      distance: Number.isFinite(Number(target.distance)) ? Math.round(Number(target.distance)) : null
    });
    const timeoutMs = Math.max(1000, Number(cfg.networkQualityActionAckTimeoutMs || 5000) || 5000);
    const cutoff = Date.now() - timeoutMs;
    const expired = q.pendingShots.filter(shot => Number(shot.at || 0) < cutoff);
    if (expired.length) q.attackTimeoutCount = Math.max(0, Number(q.attackTimeoutCount || 0) || 0) + expired.length;
    q.pendingShots = q.pendingShots.filter(shot => Number(shot.at || 0) >= cutoff).slice(-20);
  }

  function recordNetworkQualityAttackDamage(target, damageAmount, t = Date.now()) {
    if (!cfg.networkQualityEnabled || !target) return null;
    const q = ensureNetworkQualityState();
    const targetId = networkQualityTargetId(target);
    if (!targetId || !Array.isArray(q.pendingShots) || !q.pendingShots.length) return null;
    const matching = q.pendingShots.filter(shot => String(shot.targetId || '') === targetId && Number(shot.at || 0) <= t);
    if (!matching.length) return null;
    const first = matching[0];
    const last = matching[matching.length - 1];
    const firstDelayMs = Math.max(0, t - Number(first.at || t));
    const lastDelayMs = Math.max(0, t - Number(last.at || t));
    q.attackAckCount = Math.max(0, Number(q.attackAckCount || 0) || 0) + 1;
    q.lastAttackAckAt = t;
    q.lastAttackAckMs = Math.round(lastDelayMs);
    q.lastAttackAckFirstShotMs = Math.round(firstDelayMs);
    q.lastAttackAckShotCount = matching.length;
    q.lastAttackAckDamage = Number.isFinite(Number(damageAmount)) ? networkQualityRound(damageAmount, 2) : null;
    q.attackAckEmaMs = networkQualityEma(q.attackAckEmaMs, lastDelayMs, 0.22);
    q.pendingShots = q.pendingShots.filter(shot => String(shot.targetId || '') !== targetId || Number(shot.at || 0) > t);
    return {
      targetId,
      firstDelayMs: Math.round(firstDelayMs),
      lastDelayMs: Math.round(lastDelayMs),
      shotCount: matching.length
    };
  }

  function summarizeNetworkQuality(t = Date.now()) {
    if (!cfg.networkQualityEnabled) return { enabled: false };
    const q = ensureNetworkQualityState();
    pruneNetworkQualityFrameSamples(q, t);
    const expectedFrameMs = networkQualityExpectedFrameMs(q);
    const frameAgeMs = q.lastFrameAt ? Math.max(0, t - Number(q.lastFrameAt || t)) : null;
    const stallMs = Math.max(
      Number(cfg.networkQualityLogStallMs || 1000) || 1000,
      expectedFrameMs * 4
    );
    const currentStallMs = frameAgeMs !== null && frameAgeMs > expectedFrameMs * 2
      ? Math.max(0, frameAgeMs - expectedFrameMs)
      : 0;
    const projectedLost = currentStallMs > 0
      ? Math.max(0, Math.floor(frameAgeMs / Math.max(20, expectedFrameMs)) - 1)
      : 0;
    const expectedFrames = Math.max(0, Number(q.expectedFrames || 0) || 0) + projectedLost;
    const lostFrames = Math.max(0, Number(q.estimatedLostFrames || 0) || 0) + projectedLost;
    const lossRate = expectedFrames > 0 ? lostFrames / expectedFrames : null;
    const actionFreshMs = Math.max(1000, Number(cfg.networkQualityDisplayActionFreshMs || 30000) || 30000);
    const actionFresh = Boolean(q.lastActionAckAt && t - Number(q.lastActionAckAt || 0) <= actionFreshMs && Number.isFinite(Number(q.actionLatencyEmaMs)));
    const hasFrameLatency = Number.isFinite(Number(q.stateLatencyEmaMs))
      || Number.isFinite(Number(q.frameIntervalEmaMs))
      || Math.max(0, Number(q.frameGapCount || 0) || 0) > 0;
    const frameLatency = hasFrameLatency ? Number(q.stateLatencyEmaMs || q.frameIntervalEmaMs || expectedFrameMs) : null;
    const displayLatency = actionFresh ? Number(q.actionLatencyEmaMs) : frameLatency;
    const movementAttempts = Math.max(0, Number(q.movementCommandCount || 0) || 0);
    const attackAttempts = Math.max(0, Number(q.attackShotCount || 0) || 0);
    const movementTimeoutRate = movementAttempts > 0 ? Math.max(0, Number(q.movementTimeoutCount || 0) || 0) / movementAttempts : 0;
    const attackTimeoutRate = attackAttempts > 0 ? Math.max(0, Number(q.attackTimeoutCount || 0) || 0) / attackAttempts : 0;
    return {
      enabled: true,
      source: 'native-ws-state',
      displayLatencyMs: Number.isFinite(displayLatency) ? Math.max(0, Math.round(displayLatency)) : null,
      latencySource: actionFresh ? String(q.lastActionAckSource || 'action') : 'ws-frame',
      lossPercent: lossRate === null ? null : networkQualityRound(lossRate * 100, 1),
      lossSource: 'ws-frame-gap',
      windowMs: networkQualityWindowMs(),
      sampleCount: Math.max(0, Number(q.frameGapCount || 0) || 0),
      frameCount: Math.max(0, Number(q.frameCount || 0) || 0),
      lastFrameAt: Number(q.lastFrameAt || 0) || 0,
      lastFrameAgeMs: frameAgeMs === null ? null : Math.round(frameAgeMs),
      lastFrameGapMs: Number.isFinite(Number(q.lastFrameGapMs)) ? Math.round(Number(q.lastFrameGapMs)) : null,
      expectedFrameMs: Math.round(expectedFrameMs),
      frameIntervalEmaMs: Number.isFinite(Number(q.frameIntervalEmaMs)) ? Math.round(Number(q.frameIntervalEmaMs)) : null,
      frameIntervalMinMs: Number.isFinite(Number(q.frameIntervalMinMs)) ? Math.round(Number(q.frameIntervalMinMs)) : null,
      jitterEmaMs: Number.isFinite(Number(q.jitterEmaMs)) ? Math.round(Number(q.jitterEmaMs)) : null,
      maxFrameGapMs: Number.isFinite(Number(q.maxFrameGapMs)) ? Math.round(Number(q.maxFrameGapMs)) : null,
      estimatedLostFrames: lostFrames,
      expectedFrames,
      currentStallMs: Math.round(currentStallMs),
      stalled: Boolean(frameAgeMs !== null && frameAgeMs >= stallMs),
      action: {
        movementAckMs: Number.isFinite(Number(q.movementAckEmaMs)) ? Math.round(Number(q.movementAckEmaMs)) : null,
        lastMovementAckMs: Number.isFinite(Number(q.lastMovementAckMs)) ? Math.round(Number(q.lastMovementAckMs)) : null,
        lastMovementAckAgeMs: q.lastMovementAckAt ? Math.max(0, Math.round(t - Number(q.lastMovementAckAt || t))) : null,
        movementCommands: movementAttempts,
        movementAcks: Math.max(0, Number(q.movementAckCount || 0) || 0),
        movementTimeouts: Math.max(0, Number(q.movementTimeoutCount || 0) || 0),
        movementTimeoutPercent: networkQualityRound(movementTimeoutRate * 100, 1),
        attackAckMs: Number.isFinite(Number(q.attackAckEmaMs)) ? Math.round(Number(q.attackAckEmaMs)) : null,
        lastAttackAckMs: Number.isFinite(Number(q.lastAttackAckMs)) ? Math.round(Number(q.lastAttackAckMs)) : null,
        lastAttackAckFirstShotMs: Number.isFinite(Number(q.lastAttackAckFirstShotMs)) ? Math.round(Number(q.lastAttackAckFirstShotMs)) : null,
        lastAttackAckAgeMs: q.lastAttackAckAt ? Math.max(0, Math.round(t - Number(q.lastAttackAckAt || t))) : null,
        attackShots: attackAttempts,
        attackAcks: Math.max(0, Number(q.attackAckCount || 0) || 0),
        attackTimeouts: Math.max(0, Number(q.attackTimeoutCount || 0) || 0),
        attackTimeoutPercent: networkQualityRound(attackTimeoutRate * 100, 1),
        pendingShots: Array.isArray(q.pendingShots) ? q.pendingShots.length : 0
      }
    };
  }

  return {
    pushBounded,
    networkQualityRound,
    networkQualityEma,
    ensureNetworkQualityState,
    networkQualityPoint,
    networkQualityDistance,
    networkQualityWindowMs,
    networkQualityBaseFrameMs,
    networkQualityExpectedFrameMs,
    pruneNetworkQualityFrameSamples,
    networkQualityFrameLatencySample,
    estimateNetworkQualityLostFrames,
    observeNativeWsFrame,
    recordNetworkQualityMovementCommand,
    observeNetworkQualitySelf,
    networkQualityTargetId,
    recordNetworkQualityShot,
    recordNetworkQualityAttackDamage,
    summarizeNetworkQuality
  };
}

module.exports = {
  createNetworkQualityRuntime
};
