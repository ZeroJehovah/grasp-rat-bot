'use strict';

const assert = require('node:assert/strict');
const { secondaryFirePolicy } = require('../src/strategy/dual-target-policy');
const { determineCombatFireState, resolveEstablishedCombatFireAuthorizationCore } = require('../src/strategy/combat-fire-discipline');
const { actualShotAffordabilityCore } = require('../src/strategy/combat-stamina-window');

// Compare quotas on fixed native target/aim/HP geometry. Missing history is
// never inferred from a later fight or from the opponent's display name.
function runDailyDamageSecondaryReplay(frames, sourceEvents = []) {
  const dispatches = sourceEvents.filter(event => event.detail?.type === 'shoot-dispatch'
    && event.detail?.outcome === 'transport-accepted');
  const dispatchedTicks = new Set(dispatches.map(event => event.detail.shootingTick
    ?? event.detail.observedTick).filter(Number.isFinite));
  const restored = [], claimed = new Set();
  const rejected = { frameSlot: 0, hardGate: 0, history: 0, quota: 0, actualCost: 0 };
  let blockedFrames = 0;
  for (const frame of frames) {
    const input = frame.entry?.reserveCleanupReplay;
    if (!input || !String(input.shooting?.finalFireBlocker || input.shooting?.reason || '')
      .includes('secondary-five-second-shot-quota')) continue;
    blockedFrames += 1;
    const { tick, self, target, aim, shooting, finalAction } = input;
    if (!Number.isFinite(tick) || tick % 10 !== 0 || claimed.has(tick) || dispatchedTicks.has(tick)) {
      rejected.frameSlot += 1; continue;
    }
    // Old streams labelled this history only for dynamic-whitelist members.
    const dailyDamageActor = target.dailyDamageActor === true
      || (target.dynamicWhitelistMember === true && target.damagedSelfToday === true);
    if (!dailyDamageActor) { rejected.history += 1; continue; }
    const authorization = resolveEstablishedCombatFireAuthorizationCore({
      targetPresent: Boolean(target.user_id ?? target.userId),
      targetInvulnerable: target.invulnerable === true,
      aim, inRange: shooting.inRange === true,
      contactEntryOnly: shooting.finalFireBlocker === 'movement-only-contact-entry',
      fireState: determineCombatFireState(self, target)
    });
    if (!authorization.wouldShoot || target.authority !== 'realtime' || Number(self.hp) <= 50 || target.alive === false
      || Number(target.hp) <= 0 || finalAction?.shouldLeave || finalAction?.band === 'exit'
      || (finalAction?.kind && !['combat-live', 'combat-candidate'].includes(finalAction.kind))
      || ['primary', 'current'].includes(shooting.targetRole)) {
      rejected.hardGate += 1; continue;
    }
    const oldQuota = shooting.secondaryPolicy;
    if (!Number.isFinite(oldQuota?.ownShots) || !Number.isFinite(oldQuota?.opponentShots)
      || !Number.isFinite(Number(target.distance))) { rejected.quota += 1; continue; }
    // Logged aggregate counts are reconstructed as bounded window samples;
    // their recorded close-pressure samples retain their true timestamps.
    const close = oldQuota.closePressure || {};
    const extra = restored.filter(shot => shot.targetId === String(target.user_id ?? target.userId)
      && shot.at > frame.at - 5000).length;
    const policyInput = { nowMs: frame.at, target: { ...target, dailyDamageActor },
      dispatchTimes: Array.from({ length: oldQuota.ownShots + extra }, () => frame.at - 1000),
      combatTargetState: { motionSamples: Array.from({ length: oldQuota.opponentShots }, (_, index) => ({
        at: index < Number(close.attackSampleCount || 0)
          ? Number(close.latestShotAt || frame.at - 4000) : frame.at - 4000,
        newBulletCount: 1
      })) } };
    const oldPolicy = secondaryFirePolicy({ ...policyInput, target: { ...target, dailyDamageActor: false } });
    const newPolicy = secondaryFirePolicy(policyInput);
    if (oldPolicy.allowed || !newPolicy.allowed || !newPolicy.dailyDamageCloseExemption) {
      rejected.quota += 1; continue;
    }
    if (!actualShotAffordabilityCore(self, [], frame.at, 500).allowed) {
      rejected.actualCost += 1; continue;
    }
    claimed.add(tick);
    restored.push({ line: frame.lineNo, tick, at: frame.at,
      targetId: String(target.user_id ?? target.userId), distanceCm: target.distance,
      firing: target.firing === true, ownShotsBefore: oldQuota.ownShots + extra,
      opponentShots: oldQuota.opponentShots, reason: newPolicy.quotaExemptionReason });
  }
  return { scope: 'fixed logged realtime geometry/aim/HP and selected fire target; legal fire opportunities only',
    blockedFrames, restoredLegalFrameOpportunities: restored.length, restored, rejected,
    improved: restored.length > 0, duplicateDispatches: 0, wholeFightHitHpIncomeClaim: false };
}

function runDailyDamageSecondaryReplaySelfTest() {
  const make = (tick, overrides = {}) => ({ lineNo: tick, at: tick * 50,
    entry: { reserveCleanupReplay: { tick,
      self: { hp: 80, stamina5s: 10000, authority: 'realtime' },
      target: { user_id: 2, hp: 100, authority: 'realtime', distance: 2000, dailyDamageActor: true },
      aim: { ok: true }, finalAction: { kind: 'combat-live' },
      shooting: { wouldShoot: false, inRange: true, targetRole: 'secondary',
        finalFireBlocker: 'secondary:secondary-five-second-shot-quota',
        secondaryPolicy: { ownShots: 0, opponentShots: 0, closePressure: {} } }, ...overrides } } });
  const a = make(200);
  const result = runDailyDamageSecondaryReplay([a, a, make(201), make(210),
    make(220, { self: { hp: 50 } }), make(230, { aim: { ok: false } }),
    make(240, { target: { user_id: 2, hp: 100, authority: 'realtime', distance: 2001, dailyDamageActor: true } }),
    make(250, { target: { user_id: 2, hp: 100, distance: 2000 } })]);
  assert.equal(result.restoredLegalFrameOpportunities, 2);
  assert.equal(result.rejected.frameSlot, 2);
  assert.equal(result.rejected.hardGate, 2);
  assert.equal(result.rejected.quota, 1);
  assert.equal(result.rejected.history, 1);
  assert.equal(runDailyDamageSecondaryReplay([a], [{ detail: {
    type: 'shoot-dispatch', outcome: 'transport-accepted', shootingTick: 200 }
  }]).restoredLegalFrameOpportunities, 0);
  return { ok: true };
}

module.exports = { runDailyDamageSecondaryReplay, runDailyDamageSecondaryReplaySelfTest };
