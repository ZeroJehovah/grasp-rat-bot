'use strict';

// The combat movement layer owns the second half of the invulnerable-approach
// policy: while an Active target's protection has plenty of time left, hold a
// wait station outside its effective danger band instead of compressing to
// combat spacing, and only close when the measured ETA says the remaining
// travel fits the remaining protection. These cases pin the spacing override,
// the separate/hold/approach bands, the ETA release, and the risk-budget hold.
const assert = require('assert');
const { buildCombatMovementPlan } = require('./combat-adapter');

const NOW_MS = 1786689542753;

function fixture(overrides = {}) {
  const distance = Number(overrides.distance ?? 11000);
  const self = {
    user_id: 28886,
    x: 0,
    y: 0,
    hp: overrides.selfHp ?? 100,
    vx: 0,
    vy: 0,
    stamina_5s_remaining_milli: overrides.stamina5sRemainingMilli ?? 9000
  };
  const target = {
    user_id: 31361,
    x: distance,
    y: 0,
    hp: 100,
    distance,
    active: overrides.targetActive !== false,
    firing: false,
    vx: Number(overrides.targetVx ?? 0),
    vy: 0,
    combatIntent: 'profit'
  };
  if (overrides.invulnerable !== false) {
    target.invulnerableRemainingMs = Number(overrides.invulnerableRemainingMs ?? 30000);
  }
  const combatTargetState = {
    id: '31361',
    firstSeenAt: NOW_MS - 4000,
    at: NOW_MS,
    noDamageMs: 0,
    originIntent: 'profit',
    intent: 'profit',
    escapeDecision: { confirmed: false }
  };
  return {
    self,
    target,
    options: {
      nowMs: NOW_MS,
      combatTargetState,
      realtimeTargets: [self, target],
      combatMoveSpeedPerTick: 50,
      combatControlIntervalMs: 50,
      combatDistanceAwareDodgeEnabled: true,
      combatCoverEnabled: false
    }
  };
}

// The combat control loop runs every 50ms against one retained target state, so
// the anti-oscillation half of the policy only appears across frames. These
// helpers drive several frames through the same state object; positions stay
// fixed so nothing but the phase decision is under test. `mutate(frame, target,
// self)` changes the realtime view from the given frame onwards.
function planFrames(overrides = {}, frames = 1, mutate = null) {
  const input = fixture(overrides);
  const stepMs = Number(overrides.frameStepMs ?? 50);
  const plans = [];
  for (let frame = 0; frame < frames; frame += 1) {
    if (mutate && frame > 0) mutate(frame, input.target, input.self);
    input.options.nowMs = NOW_MS + frame * stepMs;
    input.options.combatTargetState.at = input.options.nowMs;
    plans.push(buildCombatMovementPlan(input.self, input.target, [], input.options));
  }
  return plans;
}

function plan(overrides = {}, frames = 1, mutate = null) {
  const plans = planFrames(overrides, frames, mutate);
  return plans[plans.length - 1];
}

function runInvulnerableWaitStationSelfTest() {
  // Inside the wait band: no approach, no separation, and the spacing the rest
  // of the combat layer sees is the wait station rather than combat spacing.
  const hold = plan({ distance: 11000 });
  assert.strictEqual(hold.reason, 'combat-invulnerable-wait-hold');
  assert.strictEqual(hold.dx, 0);
  assert.strictEqual(hold.dy, 0);
  assert.strictEqual(hold.spacing, 11000);
  assert.strictEqual(hold.invulnerableWindow.phase, 'wait');
  assert.strictEqual(hold.invulnerableWindow.hold, true);
  assert.strictEqual(hold.invulnerableWindow.reason, 'invulnerable-wait-station-hold');
  assert.strictEqual(hold.invulnerableWindow.waitDistanceCm, 11000);
  assert.strictEqual(hold.invulnerableWindow.holdFloorCm, 10000);
  assert.strictEqual(hold.invulnerableWindow.releaseDistanceCm, 12000);

  // Below the hold floor the protected target is pushing us into its danger
  // band for nothing, so the plan separates instead of holding.
  const separate = plan({ distance: 8000 });
  assert.strictEqual(separate.reason, 'combat-invulnerable-wait-separate');
  assert.strictEqual(separate.dx, -1);
  assert.strictEqual(separate.dy, 0);
  assert.strictEqual(separate.spacing, 11000);
  assert.ok(separate.modifiers.includes('back-away'));
  assert.strictEqual(separate.invulnerableWindow.separate, true);
  assert.strictEqual(separate.invulnerableWindow.approach, false);
  assert.strictEqual(separate.distanceAwareDodge.baseDistanceBand, 'separate');

  // Above the release distance we are giving up first-shot readiness, so the
  // plan closes back to the station - not to combat spacing.
  const approach = plan({ distance: 13000 });
  assert.strictEqual(approach.reason, 'combat-invulnerable-wait-approach');
  assert.strictEqual(approach.dx, 1);
  assert.strictEqual(approach.dy, 0);
  assert.strictEqual(approach.spacing, 11000);
  assert.ok(approach.modifiers.includes('close-in'));
  assert.strictEqual(approach.invulnerableWindow.approach, true);
  assert.strictEqual(approach.distanceAwareDodge.baseDistanceBand, 'approach');

  // The hysteresis band is one decision step wide on both sides, so a single
  // 1000cm step out of the station does not flip the plan into motion.
  const holdFloorEdge = plan({ distance: 10000 });
  assert.strictEqual(holdFloorEdge.reason, 'combat-invulnerable-wait-hold');
  const releaseEdge = plan({ distance: 12000 });
  assert.strictEqual(releaseEdge.reason, 'combat-invulnerable-wait-hold');

  // ETA release: the remaining travel from the station to engagement spacing no
  // longer fits inside the remaining protection, so ordinary combat spacing and
  // the ordinary close-in reason take the movement back. The release needs two
  // consecutive triggered frames, so the first one still holds the station.
  const closeSeries = planFrames({ distance: 11000, invulnerableRemainingMs: 3000 }, 2);
  const closeFirstFrame = closeSeries[0];
  assert.strictEqual(closeFirstFrame.invulnerableWindow.phase, 'wait');
  assert.strictEqual(closeFirstFrame.invulnerableWindow.reason, 'invulnerable-wait-station-hold');
  assert.strictEqual(closeFirstFrame.invulnerableWindow.closeConfirmFrames, 1);
  assert.strictEqual(closeFirstFrame.invulnerableWindow.closeConfirmRequired, 2);
  assert.strictEqual(closeFirstFrame.spacing, 11000);

  const closing = closeSeries[1];
  assert.strictEqual(closing.invulnerableWindow.phase, 'closing');
  assert.strictEqual(closing.invulnerableWindow.reason, 'invulnerable-close-eta-reached');
  assert.strictEqual(closing.reason, 'close-in');
  assert.strictEqual(closing.dx, 1);
  assert.notStrictEqual(closing.spacing, 11000);
  assert.ok(closing.spacing < 11000);
  assert.ok(closing.invulnerableWindow.closeEtaMs > 0);
  assert.strictEqual(
    closing.invulnerableWindow.triggerRemainingMs,
    closing.invulnerableWindow.closeEtaMs + 1500
  );

  // A sustained flight lengthens the close ETA, which triggers the release
  // earlier for the same remaining protection. The estimate is smoothed, so it
  // takes real flight rather than one frame of radial velocity to get there.
  const fleeing = planFrames({
    distance: 11000,
    invulnerableRemainingMs: 30000,
    targetVx: 40
  }, 200);
  const fleeingWindow = fleeing[fleeing.length - 1].invulnerableWindow;
  assert.strictEqual(fleeingWindow.radialSampleCmPerSec, 800);
  assert.ok(fleeingWindow.radialAwayCmPerSec > 600);
  assert.ok(
    fleeing[10].invulnerableWindow.radialAwayCmPerSec
    < fleeing[100].invulnerableWindow.radialAwayCmPerSec
  );
  assert.ok(fleeingWindow.closingSpeedCmPerSec < closing.invulnerableWindow.closingSpeedCmPerSec);
  assert.ok(fleeingWindow.triggerRemainingMs > closing.invulnerableWindow.triggerRemainingMs);
  // Even the longer trigger is still inside this protection, so the station holds.
  assert.strictEqual(fleeingWindow.phase, 'wait');

  // Anti-oscillation: a jinking target reverses its radial velocity every frame.
  // The raw sample flips with it, but the smoothed estimate stays near zero, so
  // the phase, the reason, and the commanded spacing never move.
  const jink = planFrames({
    distance: 11000,
    invulnerableRemainingMs: 30000,
    targetVx: 40
  }, 60, (frame, target) => {
    target.vx = frame % 2 === 0 ? 40 : -40;
  });
  assert.strictEqual(new Set(jink.map(entry => entry.invulnerableWindow.phase)).size, 1);
  for (const entry of jink) {
    assert.strictEqual(entry.invulnerableWindow.phase, 'wait');
    assert.strictEqual(entry.invulnerableWindow.hold, true);
    assert.strictEqual(entry.spacing, 11000);
    assert.strictEqual(Math.abs(entry.invulnerableWindow.radialSampleCmPerSec), 800);
    assert.ok(Math.abs(entry.invulnerableWindow.radialAwayCmPerSec) < 100);
    assert.ok(entry.invulnerableWindow.triggerRemainingMs < 9000);
  }

  // Once the approach is confirmed it latches for the rest of the protection
  // period: the target stopping shortens the raw ETA back under the remaining
  // protection, which would otherwise send the movement back to the station.
  const latch = planFrames({
    distance: 11000,
    invulnerableRemainingMs: 20000,
    targetVx: 40
  }, 220, (frame, target) => {
    target.vx = frame < 110 ? 40 : 0;
  });
  assert.ok(latch.some(entry => entry.invulnerableWindow.phase === 'closing'));
  const latched = latch[latch.length - 1].invulnerableWindow;
  assert.strictEqual(latched.phase, 'closing');
  assert.strictEqual(latched.closingLatched, true);
  assert.strictEqual(latched.closeConfirmFrames, 0);
  assert.ok(latched.triggerRemainingMs < latched.remainingMs);
  assert.strictEqual(latch[latch.length - 1].reason, 'close-in');

  // The latch is not a commitment to an unaffordable exchange: the risk budget
  // still parks a confirmed approach back at the station.
  const latchedRiskHold = plan({ distance: 11000, invulnerableRemainingMs: 3000 }, 3,
    (frame, target, self) => {
      if (frame >= 2) self.stamina_5s_remaining_milli = 2000;
    });
  assert.strictEqual(latchedRiskHold.invulnerableWindow.phase, 'wait');
  assert.strictEqual(latchedRiskHold.invulnerableWindow.closingLatched, true);
  assert.strictEqual(
    latchedRiskHold.invulnerableWindow.reason,
    'invulnerable-close-risk-budget-hold'
  );
  assert.strictEqual(latchedRiskHold.reason, 'combat-invulnerable-wait-hold');
  assert.strictEqual(latchedRiskHold.spacing, 11000);

  // A countdown that rises is a fresh protection period, so the smoothing, the
  // confirmation, and the latch all start again instead of inheriting a closing
  // decision that belonged to the previous period.
  const protectionReset = planFrames({ distance: 11000, invulnerableRemainingMs: 3000 }, 3,
    (frame, target) => {
      if (frame >= 2) target.invulnerableRemainingMs = 30000;
    });
  assert.strictEqual(protectionReset[1].invulnerableWindow.phase, 'closing');
  const reset = protectionReset[2].invulnerableWindow;
  assert.strictEqual(reset.phase, 'wait');
  assert.strictEqual(reset.closingLatched, false);
  assert.strictEqual(reset.closeConfirmFrames, 0);
  assert.strictEqual(reset.reason, 'invulnerable-wait-station-hold');
  assert.strictEqual(protectionReset[2].spacing, 11000);

  // Frames that arrive far apart carry no usable smoothing or confirmation, so
  // every one of them is a first frame and none of them releases the station.
  const staleFrames = planFrames({
    distance: 11000,
    invulnerableRemainingMs: 3000,
    frameStepMs: 4000
  }, 3);
  for (const entry of staleFrames) {
    assert.strictEqual(entry.invulnerableWindow.phase, 'wait');
    assert.strictEqual(entry.invulnerableWindow.closeConfirmFrames, 1);
    assert.strictEqual(entry.invulnerableWindow.closingLatched, false);
  }

  // Risk budget: the exchange we would enter is not affordable, so the ETA does
  // not release the station even though the travel now fits.
  const staminaHold = plan({
    distance: 11000,
    invulnerableRemainingMs: 3000,
    stamina5sRemainingMilli: 2000
  }, 2);
  assert.strictEqual(staminaHold.reason, 'combat-invulnerable-wait-hold');
  assert.strictEqual(staminaHold.spacing, 11000);
  assert.strictEqual(staminaHold.invulnerableWindow.phase, 'wait');
  assert.strictEqual(
    staminaHold.invulnerableWindow.reason,
    'invulnerable-close-risk-budget-hold'
  );
  assert.deepStrictEqual(
    staminaHold.invulnerableWindow.riskBudget.reasons,
    ['stamina-5s-below-approach-reserve']
  );

  const hpHold = plan({
    distance: 11000,
    invulnerableRemainingMs: 3000,
    selfHp: 50
  }, 2);
  assert.strictEqual(hpHold.reason, 'combat-invulnerable-wait-hold');
  assert.deepStrictEqual(
    hpHold.invulnerableWindow.riskBudget.reasons,
    ['self-hp-below-approach-floor']
  );

  // A vulnerable target, and a protected but Passive one, both leave the
  // ordinary combat movement policy untouched.
  const vulnerable = plan({ distance: 11000, invulnerable: false });
  assert.strictEqual(vulnerable.invulnerableWindow, null);
  assert.strictEqual(vulnerable.reason, 'close-in');
  assert.ok(vulnerable.spacing < 11000);

  const passive = plan({ distance: 11000, targetActive: false });
  assert.strictEqual(passive.invulnerableWindow, null);
  assert.ok(passive.spacing < 11000);

  return {
    ok: true,
    cases: 17,
    waitDistanceCm: hold.invulnerableWindow.waitDistanceCm,
    closeEtaMs: closing.invulnerableWindow.closeEtaMs,
    triggerRemainingMs: closing.invulnerableWindow.triggerRemainingMs,
    closeConfirmRequired: closing.invulnerableWindow.closeConfirmRequired,
    fleeingTriggerRemainingMs: fleeingWindow.triggerRemainingMs,
    fleeingRadialAwayCmPerSec: fleeingWindow.radialAwayCmPerSec,
    jinkRadialAwayCmPerSec: jink[jink.length - 1].invulnerableWindow.radialAwayCmPerSec,
    jinkPhases: 1,
    latchedTriggerRemainingMs: latched.triggerRemainingMs,
    combatSpacingCm: closing.spacing
  };
}

if (require.main === module) {
  try {
    process.stdout.write(`${JSON.stringify(runInvulnerableWaitStationSelfTest())}\n`);
  } catch (error) {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  }
}

module.exports = { runInvulnerableWaitStationSelfTest };
