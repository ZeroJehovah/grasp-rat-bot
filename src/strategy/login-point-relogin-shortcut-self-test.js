'use strict';

const assert = require('assert');
const {
  DEFAULT_LOGIN_POINT_RELOGIN_SHORTCUT,
  commitLoginPointReloginShortcutCore,
  evaluateLoginPointReloginShortcutCore
} = require('./login-point-relogin-shortcut');

// Reconstruction of the 2026-08-28 00:11 CST failed chase of ZhizhangOps.
// Self, target and login point are the exact logged coordinates:
//   d(self -> target)       = 151694cm
//   d(loginPoint -> target) = 83510cm
//   gain                    = 68184cm
const INCIDENT_NOW_MS = Date.parse('2026-08-27T16:09:19.527Z');
const INCIDENT_SELF = { x: -21493, y: -60138, hp: 100 };
const INCIDENT_TARGET = { x: 87010, y: 45872, userId: 6502, drop: 179 };
const INCIDENT_LOGIN_POINT = { x: 6023, y: 66244 };

function incidentInput(overrides = {}) {
  return {
    nowMs: INCIDENT_NOW_MS,
    sessionId: 'session-a',
    dayKey: '2026-08-28',
    self: INCIDENT_SELF,
    target: INCIDENT_TARGET,
    targetKind: 'enemy',
    targetKey: '6502',
    targetPreviousPosition: { x: INCIDENT_TARGET.x, y: INCIDENT_TARGET.y },
    entryLoginPoint: INCIDENT_LOGIN_POINT,
    safetyLoginPoint: INCIDENT_LOGIN_POINT,
    entryLoginAtMs: INCIDENT_NOW_MS - 600000,
    lastLoginAtMs: INCIDENT_NOW_MS - 600000,
    loginPointSafety: { ok: true, checkedAtMs: INCIDENT_NOW_MS - 20000 },
    snapshotEdgeEnabled: true,
    sourceIpProbeReusable: true,
    dayCount: 0,
    lastTriggeredAt: 0,
    ...overrides
  };
}

function evaluate(overrides = {}, options = {}, previous = null) {
  return evaluateLoginPointReloginShortcutCore(previous, incidentInput(overrides), options);
}

function assertIncidentTriggersImmediateChannel() {
  const result = evaluate();
  assert.strictEqual(result.shouldRelogin, true);
  assert.strictEqual(result.blockReason, 'ok');
  assert.strictEqual(result.summary.channel, 'immediate-high-self-hp');
  assert.strictEqual(result.summary.distanceCurrentCm, 151694);
  assert.strictEqual(result.summary.distanceLoginCm, 83510);
  assert.strictEqual(result.summary.gainCm, 68184);
  assert.strictEqual(result.summary.ratio, 0.5505);
  assert.strictEqual(result.summary.loginPointSource, 'entry-first-self');
  // 68183.9cm / 950cm/s = 71773ms of travel, minus the 12000ms immediate-channel
  // budget, leaves the 59773ms net gain the plan states.
  assert.strictEqual(result.summary.gainMs, 71773);
  assert.strictEqual(result.summary.overheadMs, 12000);
  assert.ok(Math.abs(result.summary.netGainMs - 59773) <= 500, String(result.summary.netGainMs));
  assert.deepStrictEqual(result.summary.overheadBreakdown, {
    baseMs: 12000,
    intervalWaitMs: 0,
    snapshotEdgeMs: 0,
    sourceIpProbeMs: 0
  });
}

function assertBoundedChannelBlockedByNetGain() {
  // HP 70 loses the UC-002 exemption, so the login re-runs the snapshot edge
  // wait. Production measures 62.6-62.9s for that path and the 65000ms budget
  // on top of the 12000ms base leaves too little of the 71773ms saving.
  const result = evaluate({ self: { ...INCIDENT_SELF, hp: 70 } });
  assert.strictEqual(result.shouldRelogin, false);
  assert.strictEqual(result.blockReason, 'net-gain-too-small');
  assert.strictEqual(result.summary.channel, 'bounded-snapshot-safe');
  assert.strictEqual(result.summary.overheadMs, 77000);
  assert.strictEqual(result.summary.netGainMs, 71773 - 77000);
}

function assertBoundedChannelTriggersWhenGainIsLargeEnough() {
  // The bounded channel is implemented, not disabled. It needs the gain to
  // clear the 12000ms base plus the 65000ms snapshot-edge budget plus the
  // 30000ms minimum net gain, i.e. 107000ms of travel = 101650cm.
  const farSelf = { x: INCIDENT_TARGET.x - 186000, y: INCIDENT_TARGET.y, hp: 70 };
  const result = evaluate({
    self: farSelf,
    entryLoginPoint: { x: INCIDENT_TARGET.x - 84000, y: INCIDENT_TARGET.y },
    safetyLoginPoint: { x: INCIDENT_TARGET.x - 84000, y: INCIDENT_TARGET.y },
    sourceIpProbeReusable: true
  });
  assert.strictEqual(result.summary.gainCm, 102000);
  assert.strictEqual(result.summary.channel, 'bounded-snapshot-safe');
  assert.strictEqual(result.summary.overheadMs, 77000);
  assert.strictEqual(result.shouldRelogin, true);
  assert.strictEqual(result.blockReason, 'ok');

  // Just under the threshold the same channel declines instead of losing time.
  const marginal = evaluate({
    self: { x: INCIDENT_TARGET.x - 185000, y: INCIDENT_TARGET.y, hp: 70 },
    entryLoginPoint: { x: INCIDENT_TARGET.x - 84000, y: INCIDENT_TARGET.y },
    safetyLoginPoint: { x: INCIDENT_TARGET.x - 84000, y: INCIDENT_TARGET.y }
  });
  assert.strictEqual(marginal.summary.gainCm, 101000);
  assert.strictEqual(marginal.blockReason, 'net-gain-too-small');
}

function assertStaleSnapshotSafetyIsNotImmediate() {
  const stale = evaluate({
    self: { ...INCIDENT_SELF, hp: 70 },
    loginPointSafety: { ok: true, checkedAtMs: INCIDENT_NOW_MS - 200000 }
  });
  assert.strictEqual(stale.blockReason, 'not-immediate');
  const unsafe = evaluate({
    self: { ...INCIDENT_SELF, hp: 70 },
    loginPointSafety: { ok: false, checkedAtMs: INCIDENT_NOW_MS - 1000 }
  });
  assert.strictEqual(unsafe.blockReason, 'not-immediate');
}

function assertLoginCooldownIsEnforced() {
  // UC-004: the 60s login-to-login interval must already be satisfied.
  const result = evaluate({
    entryLoginAtMs: INCIDENT_NOW_MS - 59000,
    lastLoginAtMs: INCIDENT_NOW_MS - 59000
  });
  assert.strictEqual(result.shouldRelogin, false);
  assert.strictEqual(result.blockReason, 'login-cooldown');
  assert.strictEqual(result.summary.sinceLastLoginMs, 59000);
  assert.strictEqual(result.summary.loginIntervalMs, 60000);

  const exactly = evaluate({
    entryLoginAtMs: INCIDENT_NOW_MS - 60000,
    lastLoginAtMs: INCIDENT_NOW_MS - 60000
  });
  assert.strictEqual(exactly.shouldRelogin, true);

  const unknown = evaluate({ entryLoginAtMs: null, lastLoginAtMs: null });
  assert.strictEqual(unknown.blockReason, 'login-cooldown');

  // A configured interval below the UC-004 floor cannot weaken the gate.
  const clamped = evaluate({
    entryLoginAtMs: INCIDENT_NOW_MS - 30000,
    lastLoginAtMs: INCIDENT_NOW_MS - 30000
  }, { loginIntervalMs: 1000 });
  assert.strictEqual(clamped.blockReason, 'login-cooldown');
  assert.strictEqual(clamped.summary.loginIntervalMs, 60000);
}

function assertMovingTargetIsRejected() {
  const result = evaluate({
    targetPreviousPosition: { x: INCIDENT_TARGET.x - 3000, y: INCIDENT_TARGET.y }
  });
  assert.strictEqual(result.shouldRelogin, false);
  assert.strictEqual(result.blockReason, 'target-moving');
  assert.strictEqual(result.summary.targetDriftCm, 3000);

  const withinBand = evaluate({
    targetPreviousPosition: { x: INCIDENT_TARGET.x - 1500, y: INCIDENT_TARGET.y }
  });
  assert.strictEqual(withinBand.shouldRelogin, true);

  // No previous observation is not treated as movement.
  const noHistory = evaluate({ targetPreviousPosition: null });
  assert.strictEqual(noHistory.shouldRelogin, true);
  assert.strictEqual(noHistory.summary.targetDriftCm, null);
}

function assertRatioGate() {
  // Place the login point so it is closer in absolute terms and clears
  // minGainCm, but only by 10% of the current distance.
  const result = evaluate({
    self: { x: INCIDENT_TARGET.x - 400000, y: INCIDENT_TARGET.y, hp: 100 },
    entryLoginPoint: { x: INCIDENT_TARGET.x - 360000, y: INCIDENT_TARGET.y },
    safetyLoginPoint: { x: INCIDENT_TARGET.x - 360000, y: INCIDENT_TARGET.y }
  });
  assert.strictEqual(result.summary.gainCm, 40000);
  assert.strictEqual(result.summary.ratio, 0.9);
  assert.strictEqual(result.shouldRelogin, false);
  assert.strictEqual(result.blockReason, 'ratio-not-met');
}

function assertSmallGainAndNearTargetAreRejected() {
  const smallGain = evaluate({
    entryLoginPoint: { x: INCIDENT_SELF.x + 12000, y: INCIDENT_SELF.y },
    safetyLoginPoint: { x: INCIDENT_SELF.x + 12000, y: INCIDENT_SELF.y }
  });
  assert.strictEqual(smallGain.blockReason, 'distance-gain-too-small');

  const nearTarget = evaluate({
    self: { x: INCIDENT_TARGET.x - 20000, y: INCIDENT_TARGET.y, hp: 100 }
  });
  assert.strictEqual(nearTarget.blockReason, 'distance-too-close');
  assert.strictEqual(nearTarget.summary.distanceCurrentCm, 20000);
}

function assertTargetEligibility() {
  const lowDrop = evaluate({ target: { ...INCIDENT_TARGET, drop: 20 } });
  assert.strictEqual(lowDrop.blockReason, 'target-not-eligible');
  assert.strictEqual(lowDrop.summary.targetDrop, 20);

  // v1 admits player targets only.
  const coin = evaluate({ targetKind: 'coin' });
  assert.strictEqual(coin.blockReason, 'target-not-eligible');
  const coinAdmitted = evaluate({ targetKind: 'coin' }, {
    loginPointReloginShortcutTargetKinds: ['enemy', 'coin']
  });
  assert.strictEqual(coinAdmitted.shouldRelogin, true);

  const noTarget = evaluate({ target: null });
  assert.strictEqual(noTarget.blockReason, 'target-not-eligible');

  const noSelf = evaluate({ self: null });
  assert.strictEqual(noSelf.blockReason, 'no-self-position');
}

function assertLoginPointResolution() {
  const noPoint = evaluate({ entryLoginPoint: null, safetyLoginPoint: null });
  assert.strictEqual(noPoint.blockReason, 'no-login-point');

  const safetyOnly = evaluate({ entryLoginPoint: null });
  assert.strictEqual(safetyOnly.summary.loginPointSource, 'login-point-safety');
  assert.strictEqual(safetyOnly.shouldRelogin, true);

  // Small drift keeps the actual spawn point of the current session.
  const smallDrift = evaluate({ safetyLoginPoint: { x: INCIDENT_LOGIN_POINT.x - 24, y: INCIDENT_LOGIN_POINT.y + 24 } });
  assert.strictEqual(smallDrift.summary.loginPointSource, 'entry-first-self');
  assert.strictEqual(smallDrift.summary.distanceLoginCm, 83510);

  // Large drift falls back to whichever candidate is farther from the target.
  const farSafetyPoint = { x: INCIDENT_LOGIN_POINT.x - 30000, y: INCIDENT_LOGIN_POINT.y };
  const largeDrift = evaluate({ safetyLoginPoint: farSafetyPoint });
  assert.strictEqual(largeDrift.summary.loginPointSource, 'conservative-max');
  assert.strictEqual(largeDrift.summary.loginPointDriftCm, 30000);
  assert.strictEqual(largeDrift.summary.distanceLoginCm, 112841);
}

function assertSourceIpProbeOverhead() {
  const result = evaluate({ sourceIpProbeReusable: false });
  assert.strictEqual(result.summary.overheadMs, 62000);
  assert.strictEqual(result.summary.overheadBreakdown.sourceIpProbeMs, 50000);
  assert.strictEqual(result.summary.netGainMs, 71773 - 62000);
  assert.strictEqual(result.shouldRelogin, false);
  assert.strictEqual(result.blockReason, 'net-gain-too-small');
}

function assertTriggerBudgets() {
  const first = evaluate();
  assert.strictEqual(first.shouldRelogin, true);

  const committed = commitLoginPointReloginShortcutCore(first.state, {
    nowMs: INCIDENT_NOW_MS,
    sessionId: 'session-a',
    dayKey: '2026-08-28'
  });
  assert.strictEqual(committed.sessionCount, 1);
  assert.strictEqual(committed.dayCount, 1);
  assert.strictEqual(committed.lastTriggeredAt, INCIDENT_NOW_MS);

  // Same session: the per-session cap of 1 blocks a second attempt.
  const sameSession = evaluateLoginPointReloginShortcutCore(
    committed,
    incidentInput({ nowMs: INCIDENT_NOW_MS + 600000 }),
    {}
  );
  assert.strictEqual(sameSession.blockReason, 'session-limit');

  // A new session resets the session counter but keeps the day counter and the
  // cooldown, which is what stops an exit/login oscillation.
  const nextSession = evaluateLoginPointReloginShortcutCore(
    committed,
    incidentInput({ sessionId: 'session-b', nowMs: INCIDENT_NOW_MS + 120000, dayCount: 1, lastTriggeredAt: INCIDENT_NOW_MS }),
    {}
  );
  assert.strictEqual(nextSession.blockReason, 'cooldown');

  const afterCooldown = evaluateLoginPointReloginShortcutCore(
    committed,
    incidentInput({ sessionId: 'session-b', nowMs: INCIDENT_NOW_MS + 400000, dayCount: 1, lastTriggeredAt: INCIDENT_NOW_MS }),
    {}
  );
  assert.strictEqual(afterCooldown.shouldRelogin, true);

  const dailyLimit = evaluateLoginPointReloginShortcutCore(
    committed,
    incidentInput({ sessionId: 'session-b', nowMs: INCIDENT_NOW_MS + 400000, dayCount: 6, lastTriggeredAt: INCIDENT_NOW_MS }),
    {}
  );
  assert.strictEqual(dailyLimit.blockReason, 'daily-limit');

  // A new day clears the day counter and the cooldown carried with it.
  const nextDay = evaluateLoginPointReloginShortcutCore(
    { ...committed, dayCount: 6 },
    incidentInput({ sessionId: 'session-c', dayKey: '2026-08-29', nowMs: INCIDENT_NOW_MS + 400000 }),
    {}
  );
  assert.strictEqual(nextDay.shouldRelogin, true);
  assert.strictEqual(nextDay.summary.dayCount, 0);
}

function assertSelfLimitingAfterRelogin() {
  // Right after a shortcut relogin the bot stands on the login point, so the
  // ratio gate can no longer be met. This is the structural anti-oscillation
  // guarantee that does not depend on any counter.
  const result = evaluate({
    sessionId: 'session-b',
    self: { ...INCIDENT_LOGIN_POINT, hp: 100 }
  });
  assert.strictEqual(result.summary.gainCm, 0);
  assert.strictEqual(result.shouldRelogin, false);
  assert.strictEqual(result.blockReason, 'distance-gain-too-small');
}

function assertDisabledSwitch() {
  const result = evaluate({}, { loginPointReloginShortcutEnabled: false });
  assert.strictEqual(result.shouldRelogin, false);
  assert.strictEqual(result.blockReason, 'disabled');
}

function assertOptionOverridesUsePrefixedNamesOnly() {
  // A bare `minGainCm` must not be picked up from unrelated runtime options.
  const bare = evaluate({}, { minGainCm: 1000000 });
  assert.strictEqual(bare.shouldRelogin, true);
  const prefixed = evaluate({}, { loginPointReloginShortcutMinGainCm: 1000000 });
  assert.strictEqual(prefixed.blockReason, 'distance-gain-too-small');

  // UC-002 owns the healthy-HP threshold.
  const raisedThreshold = evaluate({}, { loginPointSafetyHealthyHpThreshold: 120 });
  assert.strictEqual(raisedThreshold.summary.channel, 'bounded-snapshot-safe');
}

function assertDefaultsMatchPlan() {
  assert.strictEqual(DEFAULT_LOGIN_POINT_RELOGIN_SHORTCUT.minCurrentDistanceCm, 40000);
  assert.strictEqual(DEFAULT_LOGIN_POINT_RELOGIN_SHORTCUT.minGainCm, 30000);
  assert.strictEqual(DEFAULT_LOGIN_POINT_RELOGIN_SHORTCUT.maxLoginDistanceRatio, 0.75);
  assert.strictEqual(DEFAULT_LOGIN_POINT_RELOGIN_SHORTCUT.minNetGainMs, 30000);
  assert.strictEqual(DEFAULT_LOGIN_POINT_RELOGIN_SHORTCUT.planSpeedCmPerS, 950);
  assert.strictEqual(DEFAULT_LOGIN_POINT_RELOGIN_SHORTCUT.baseOverheadMs, 12000);
  assert.strictEqual(DEFAULT_LOGIN_POINT_RELOGIN_SHORTCUT.snapshotEdgeOverheadMs, 65000);
  assert.strictEqual(DEFAULT_LOGIN_POINT_RELOGIN_SHORTCUT.sourceIpProbeOverheadMs, 50000);
  assert.strictEqual(DEFAULT_LOGIN_POINT_RELOGIN_SHORTCUT.maxPerSession, 1);
  assert.strictEqual(DEFAULT_LOGIN_POINT_RELOGIN_SHORTCUT.maxPerDay, 6);
  assert.strictEqual(DEFAULT_LOGIN_POINT_RELOGIN_SHORTCUT.cooldownMs, 300000);
}

function runLoginPointReloginShortcutSelfTest() {
  assertIncidentTriggersImmediateChannel();
  assertBoundedChannelBlockedByNetGain();
  assertBoundedChannelTriggersWhenGainIsLargeEnough();
  assertStaleSnapshotSafetyIsNotImmediate();
  assertLoginCooldownIsEnforced();
  assertMovingTargetIsRejected();
  assertRatioGate();
  assertSmallGainAndNearTargetAreRejected();
  assertTargetEligibility();
  assertLoginPointResolution();
  assertSourceIpProbeOverhead();
  assertTriggerBudgets();
  assertSelfLimitingAfterRelogin();
  assertDisabledSwitch();
  assertOptionOverridesUsePrefixedNamesOnly();
  assertDefaultsMatchPlan();
  return { ok: true, cases: 62 };
}

if (require.main === module) {
  process.stdout.write(JSON.stringify(runLoginPointReloginShortcutSelfTest()) + '\n');
}

module.exports = { runLoginPointReloginShortcutSelfTest };
