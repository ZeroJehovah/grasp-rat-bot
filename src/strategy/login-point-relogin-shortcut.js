'use strict';

// Long-distance approach to an off-screen high-Drop target starts from wherever
// the bot happens to be standing. The login point is fixed, so when it is
// materially closer to that target than the current position, exiting and
// logging back in teleports the bot to the shorter start of the same trip.
//
// The rule is only worth applying when the login is actually immediate. Under
// UC-002 a self HP at or above the healthy threshold exempts the login-point
// snapshot safety check entirely (zero HTTP, production median 3.4s). Every
// other path re-runs the pre-login snapshot edge wait, measured at 62.6-62.9s
// in production, which would consume most of the distance saving. Both channels
// are supported, but each carries its own overhead into the net-gain test so a
// slow channel simply stops qualifying instead of losing time.
//
// The comparison is pure geometry plus a travel-time budget. Nothing here
// consumes snapshot data for combat, aim, fire or exit authority: the shortcut
// is only ever evaluated once an ordinary profit-navigation action has already
// won final arbitration, and it replaces how that approach is executed rather
// than deciding whether to approach at all.
const DEFAULT_LOGIN_POINT_RELOGIN_SHORTCUT = Object.freeze({
  // Never relogin for a target that is already near.
  minCurrentDistanceCm: 40000,
  // Absolute floor on the distance saved.
  minGainCm: 30000,
  // Require a proportional advantage, not merely a smaller number. This is also
  // what makes the rule self-limiting: right after a shortcut relogin the bot
  // stands on the login point, so the ratio can no longer be met.
  maxLoginDistanceRatio: 0.75,
  // Saving left after the relogin overhead is paid.
  minNetGainMs: 30000,
  // Conservative planning speed. Measured axial/diagonal medians are 993/979
  // cm/s and an observed long chase averaged 973 cm/s including turns.
  planSpeedCmPerS: 950,
  // Exit + reconnect + entry baseline for the immediate channel. Production
  // median is 3.4s; the budget is deliberately ~3.5x that because underestimating
  // costs a net-negative relogin while overestimating only skips a marginal one.
  baseOverheadMs: 12000,
  // Added when the login must wait for a fresh snapshot edge.
  snapshotEdgeOverheadMs: 65000,
  // Added when the source-IP preflight probe cannot be reused.
  sourceIpProbeOverheadMs: 50000,
  // How recent a login-point safety confirmation may be for the bounded channel.
  freshMaxMs: 120000,
  // Disagreement above this between the two login-point sources falls back to
  // whichever is farther from the target.
  maxPointDriftCm: 5000,
  targetMinDrop: 50,
  // A target that moves can close the distance itself; relogging on one risks
  // paying the overhead for nothing.
  targetMaxDriftCm: 2000,
  healthyHpThreshold: 80,
  loginIntervalMs: 60000,
  maxPerSession: 1,
  maxPerDay: 6,
  cooldownMs: 300000
});

// v1 covers player targets only. Ground coins are geometrically identical but
// carry a different competition model and interact with committed coin routes,
// so they are admitted by configuration rather than by default.
const DEFAULT_LOGIN_POINT_RELOGIN_SHORTCUT_TARGET_KINDS = Object.freeze(['enemy']);

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function pointOf(value) {
  const x = finiteNumber(value?.x);
  const y = finiteNumber(value?.y);
  return x === null || y === null ? null : { x, y };
}

function distanceBetween(a, b) {
  if (!a || !b) return null;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function roundedOrNull(value) {
  return value === null || value === undefined ? null : Math.round(value);
}

function resolveOptions(options = {}) {
  const resolved = {};
  // Only the prefixed option names are read. A bare-key fallback would collide
  // with unrelated runtime options that happen to share a name.
  for (const [key, fallback] of Object.entries(DEFAULT_LOGIN_POINT_RELOGIN_SHORTCUT)) {
    const optionKey = 'loginPointReloginShortcut'
      + key.charAt(0).toUpperCase()
      + key.slice(1);
    const value = finiteNumber(options[optionKey]);
    resolved[key] = value === null ? fallback : value;
  }
  // The healthy-HP threshold and the login interval are owned elsewhere. Defer
  // to the canonical option names so this module can never disagree with
  // UC-002 or UC-004.
  const healthyHpThreshold = finiteNumber(options.loginPointSafetyHealthyHpThreshold);
  if (healthyHpThreshold !== null) resolved.healthyHpThreshold = healthyHpThreshold;
  const loginIntervalMs = finiteNumber(options.loginIntervalMs);
  if (loginIntervalMs !== null) resolved.loginIntervalMs = loginIntervalMs;
  resolved.loginIntervalMs = Math.max(60000, resolved.loginIntervalMs);
  resolved.planSpeedCmPerS = Math.max(1, resolved.planSpeedCmPerS);
  return resolved;
}

function allowedTargetKinds(options = {}) {
  const configured = options.loginPointReloginShortcutTargetKinds;
  if (!Array.isArray(configured) || !configured.length) {
    return DEFAULT_LOGIN_POINT_RELOGIN_SHORTCUT_TARGET_KINDS;
  }
  return configured.map(kind => String(kind));
}

function carryState(previous, input) {
  const sessionId = String(input.sessionId || previous?.sessionId || '');
  const dayKey = String(input.dayKey || previous?.dayKey || '');
  const sameSession = Boolean(previous?.sessionId) && String(previous.sessionId) === sessionId;
  const sameDay = Boolean(previous?.dayKey) && String(previous.dayKey) === dayKey;
  return {
    sessionId,
    dayKey,
    sessionCount: sameSession ? Math.max(0, Number(previous?.sessionCount || 0)) : 0,
    dayCount: sameDay ? Math.max(0, Number(previous?.dayCount || 0)) : 0,
    lastTriggeredAt: sameDay ? Math.max(0, Number(previous?.lastTriggeredAt || 0)) : 0
  };
}

function resolveLoginPoint(entryPoint, safetyPoint, targetPoint, maxPointDriftCm) {
  if (entryPoint && safetyPoint) {
    const driftCm = distanceBetween(entryPoint, safetyPoint);
    if (driftCm !== null && driftCm > maxPointDriftCm) {
      const entryDistance = distanceBetween(entryPoint, targetPoint);
      const safetyDistance = distanceBetween(safetyPoint, targetPoint);
      const point = entryDistance >= safetyDistance ? entryPoint : safetyPoint;
      return { point, source: 'conservative-max', driftCm };
    }
    return { point: entryPoint, source: 'entry-first-self', driftCm };
  }
  if (entryPoint) return { point: entryPoint, source: 'entry-first-self', driftCm: null };
  if (safetyPoint) return { point: safetyPoint, source: 'login-point-safety', driftCm: null };
  return { point: null, source: '', driftCm: null };
}

// The immediate channel is the HP >= 80 snapshot-safety exemption; it performs
// no HTTP at all. The bounded channel trusts a recent snapshot confirmation but
// must still pay for the snapshot edge wait the next login will perform.
function resolveLoginChannel(input, resolved, nowMs) {
  const selfHp = finiteNumber(input.self?.hp);
  if (selfHp !== null && selfHp >= resolved.healthyHpThreshold) {
    return { channel: 'immediate-high-self-hp', snapshotEdgeWaitExpected: false, selfHp };
  }
  const safetyOk = input.loginPointSafety?.ok === true;
  const checkedAtMs = finiteNumber(input.loginPointSafety?.checkedAtMs);
  const ageMs = checkedAtMs === null ? null : Math.max(0, nowMs - checkedAtMs);
  if (safetyOk && ageMs !== null && ageMs <= resolved.freshMaxMs) {
    return {
      channel: 'bounded-snapshot-safe',
      snapshotEdgeWaitExpected: input.snapshotEdgeEnabled !== false,
      selfHp,
      safetyAgeMs: ageMs
    };
  }
  return { channel: '', snapshotEdgeWaitExpected: true, selfHp, safetyAgeMs: ageMs };
}

function overheadFor(channelInfo, resolved, sinceLastLoginMs, sourceIpProbeReusable) {
  const intervalWaitMs = Math.max(0, resolved.loginIntervalMs - Math.max(0, sinceLastLoginMs));
  const snapshotEdgeMs = channelInfo.snapshotEdgeWaitExpected ? resolved.snapshotEdgeOverheadMs : 0;
  const sourceIpProbeMs = sourceIpProbeReusable === false ? resolved.sourceIpProbeOverheadMs : 0;
  const breakdown = {
    baseMs: resolved.baseOverheadMs,
    intervalWaitMs,
    snapshotEdgeMs,
    sourceIpProbeMs
  };
  return {
    overheadMs: resolved.baseOverheadMs + intervalWaitMs + snapshotEdgeMs + sourceIpProbeMs,
    breakdown
  };
}

function summaryOf(fields) {
  return {
    eligible: false,
    shouldRelogin: false,
    blockReason: '',
    channel: '',
    distanceCurrentCm: null,
    distanceLoginCm: null,
    gainCm: null,
    ratio: null,
    gainMs: null,
    overheadMs: null,
    overheadBreakdown: null,
    netGainMs: null,
    loginPointSource: '',
    loginPointDriftCm: null,
    selfHp: null,
    sinceLastLoginMs: null,
    loginIntervalMs: null,
    targetKey: '',
    targetDrop: null,
    targetDriftCm: null,
    sessionCount: 0,
    dayCount: 0,
    lastTriggeredAt: 0,
    ...fields
  };
}

/**
 * Decide whether exiting and logging back in shortens the approach to the
 * target the planner has already committed to.
 *
 * `previous` carries the per-session trigger count; the per-day count and the
 * last trigger time come from the runner's persisted state through `input` so
 * the core stays pure. `input.dayCount` must already belong to `input.dayKey`;
 * the caller resets it when the day rolls over.
 *
 * Returns `{ state, shouldRelogin, blockReason, summary }`. The caller commits
 * the trigger with `commitLoginPointReloginShortcutCore` only if it actually
 * emits the leave, so an evaluation never consumes a budget by itself.
 */
function evaluateLoginPointReloginShortcutCore(previous, input = {}, options = {}) {
  const nowMs = finiteNumber(input.nowMs) ?? Date.now();
  const resolved = resolveOptions(options);
  const state = carryState(previous, input);
  const counters = {
    sessionCount: state.sessionCount,
    dayCount: Math.max(state.dayCount, Math.max(0, Number(input.dayCount || 0))),
    lastTriggeredAt: Math.max(state.lastTriggeredAt, Math.max(0, Number(input.lastTriggeredAt || 0)))
  };
  state.dayCount = counters.dayCount;
  state.lastTriggeredAt = counters.lastTriggeredAt;
  const blocked = (blockReason, fields = {}) => ({
    state,
    shouldRelogin: false,
    blockReason,
    summary: summaryOf({ blockReason, ...counters, ...fields })
  });

  if (options.loginPointReloginShortcutEnabled === false) return blocked('disabled');

  const selfPoint = pointOf(input.self);
  if (!selfPoint) return blocked('no-self-position');

  const targetPoint = pointOf(input.target);
  const targetKind = String(input.targetKind || 'enemy');
  const targetDrop = finiteNumber(input.target?.drop);
  const targetKey = String(input.targetKey || input.target?.userId || '');
  if (!targetPoint || !allowedTargetKinds(options).includes(targetKind)) {
    return blocked('target-not-eligible', { targetKey, targetDrop });
  }
  if (targetDrop === null || targetDrop < resolved.targetMinDrop) {
    return blocked('target-not-eligible', { targetKey, targetDrop });
  }

  const previousTargetPoint = pointOf(input.targetPreviousPosition);
  const targetDriftCm = previousTargetPoint ? distanceBetween(previousTargetPoint, targetPoint) : null;
  if (targetDriftCm !== null && targetDriftCm > resolved.targetMaxDriftCm) {
    return blocked('target-moving', {
      targetKey,
      targetDrop,
      targetDriftCm: roundedOrNull(targetDriftCm)
    });
  }

  const loginPoint = resolveLoginPoint(
    pointOf(input.entryLoginPoint),
    pointOf(input.safetyLoginPoint),
    targetPoint,
    resolved.maxPointDriftCm
  );
  if (!loginPoint.point) {
    return blocked('no-login-point', { targetKey, targetDrop, targetDriftCm: roundedOrNull(targetDriftCm) });
  }

  const distanceCurrentCm = distanceBetween(selfPoint, targetPoint);
  const distanceLoginCm = distanceBetween(loginPoint.point, targetPoint);
  const gainCm = distanceCurrentCm - distanceLoginCm;
  const ratio = distanceCurrentCm > 0 ? distanceLoginCm / distanceCurrentCm : null;
  const geometry = {
    targetKey,
    targetDrop,
    targetDriftCm: roundedOrNull(targetDriftCm),
    distanceCurrentCm: roundedOrNull(distanceCurrentCm),
    distanceLoginCm: roundedOrNull(distanceLoginCm),
    gainCm: roundedOrNull(gainCm),
    ratio: ratio === null ? null : Number(ratio.toFixed(4)),
    loginPointSource: loginPoint.source,
    loginPointDriftCm: roundedOrNull(loginPoint.driftCm)
  };

  if (distanceCurrentCm < resolved.minCurrentDistanceCm) return blocked('distance-too-close', geometry);
  if (gainCm < resolved.minGainCm) return blocked('distance-gain-too-small', geometry);
  if (ratio === null || ratio > resolved.maxLoginDistanceRatio) return blocked('ratio-not-met', geometry);

  // UC-004: the login-to-login hard interval must already be satisfied, so the
  // relogin can start immediately instead of stalling on the runner's gate.
  const lastLoginAtMs = Math.max(
    finiteNumber(input.lastLoginAtMs) ?? 0,
    finiteNumber(input.entryLoginAtMs) ?? 0
  );
  const sinceLastLoginMs = lastLoginAtMs > 0 ? Math.max(0, nowMs - lastLoginAtMs) : null;
  const timing = {
    ...geometry,
    sinceLastLoginMs,
    loginIntervalMs: resolved.loginIntervalMs
  };
  if (sinceLastLoginMs === null || sinceLastLoginMs < resolved.loginIntervalMs) {
    return blocked('login-cooldown', timing);
  }

  const channelInfo = resolveLoginChannel(input, resolved, nowMs);
  const withChannel = { ...timing, selfHp: channelInfo.selfHp };
  if (!channelInfo.channel) return blocked('not-immediate', withChannel);

  const { overheadMs, breakdown } = overheadFor(
    channelInfo,
    resolved,
    sinceLastLoginMs,
    input.sourceIpProbeReusable
  );
  const gainMs = (gainCm / resolved.planSpeedCmPerS) * 1000;
  const netGainMs = gainMs - overheadMs;
  const economics = {
    ...withChannel,
    channel: channelInfo.channel,
    gainMs: Math.round(gainMs),
    overheadMs,
    overheadBreakdown: breakdown,
    netGainMs: Math.round(netGainMs)
  };
  if (netGainMs < resolved.minNetGainMs) return blocked('net-gain-too-small', economics);

  if (counters.sessionCount >= resolved.maxPerSession) return blocked('session-limit', economics);
  if (counters.dayCount >= resolved.maxPerDay) return blocked('daily-limit', economics);
  if (counters.lastTriggeredAt > 0 && nowMs - counters.lastTriggeredAt < resolved.cooldownMs) {
    return blocked('cooldown', economics);
  }

  return {
    state,
    shouldRelogin: true,
    blockReason: 'ok',
    summary: summaryOf({
      ...economics,
      ...counters,
      eligible: true,
      shouldRelogin: true,
      blockReason: 'ok'
    })
  };
}

// Called only when the caller actually emits the shortcut leave.
function commitLoginPointReloginShortcutCore(state, input = {}) {
  const nowMs = finiteNumber(input.nowMs) ?? Date.now();
  const carried = carryState(state, input);
  return {
    ...carried,
    sessionCount: carried.sessionCount + 1,
    dayCount: carried.dayCount + 1,
    lastTriggeredAt: nowMs
  };
}

module.exports = {
  DEFAULT_LOGIN_POINT_RELOGIN_SHORTCUT,
  DEFAULT_LOGIN_POINT_RELOGIN_SHORTCUT_TARGET_KINDS,
  commitLoginPointReloginShortcutCore,
  evaluateLoginPointReloginShortcutCore
};
