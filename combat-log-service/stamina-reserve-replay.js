'use strict';

const assert = require('node:assert/strict');
const { determineCombatFireState, resolveEstablishedCombatFireAuthorizationCore } = require('../src/strategy/combat-fire-discipline');
const { actualShotAffordabilityCore } = require('../src/strategy/combat-stamina-window');

// Logged reserve reasons are evidence of the old policy, never current authority.
function wasFutureReserveBlocked(shooting = {}) {
  return shooting.wouldShoot === false && /reserve/.test(String(shooting.reason || ''));
}

function runStaminaReserveCleanupReplay(frames, sourceEvents = []) {
  const loggedDispatches = sourceEvents.filter(event => event.detail?.type === 'shoot-dispatch'
    && event.detail?.outcome === 'transport-accepted');
  const dispatchedTicks = new Set(loggedDispatches.map(event => event.detail.shootingTick
    ?? event.detail.observedTick).filter(Number.isFinite));
  const restored = [], claimedTicks = new Set();
  const rejected = { frameSlot: 0, hardGate: 0, quota: 0, actualCost: 0, evidenceInsufficient: 0 };
  for (const frame of frames) {
    const input = frame.entry?.reserveCleanupReplay;
    if (!input || !wasFutureReserveBlocked(input.shooting)) continue;
    const { tick, self, target, aim, shooting, finalAction } = input;
    if (!Number.isFinite(tick) || tick % 10 !== 0 || claimedTicks.has(tick) || dispatchedTicks.has(tick)) {
      rejected.frameSlot += 1; continue;
    }
    const secondary = shooting.targetRole === 'secondary' || target.combatRole === 'secondary';
    const authorization = resolveEstablishedCombatFireAuthorizationCore({
      targetPresent: Boolean(target.user_id ?? target.userId),
      targetInvulnerable: target.invulnerable === true,
      aim, inRange: shooting.inRange === true,
      contactEntryOnly: shooting.finalFireBlocker === 'movement-only-contact-entry',
      fireState: determineCombatFireState(self, target)
    });
    if (!authorization.wouldShoot || finalAction?.shouldLeave || finalAction?.band === 'exit'
      || target.alive === false || Number(target.hp) <= 0
      || (secondary && Number(self.hp) <= 50)) {
      rejected.hardGate += 1; continue;
    }
    const extraOwnShots = restored.filter(shot => shot.at > frame.at - 5000).length;
    const quota = shooting.secondaryPolicy;
    if (secondary && (!quota || !Number.isFinite(quota.ownShots) || !Number.isFinite(quota.opponentShots))) {
      rejected.evidenceInsufficient += 1; continue;
    }
    if (secondary && quota.throttleExempt !== true && !(quota.ownShots + extraOwnShots < quota.opponentShots)) {
      rejected.quota += 1; continue;
    }
    // Snapshot-only stamina stays unknown. No future movement or Dodge debit is added.
    const physical = actualShotAffordabilityCore(self, [], frame.at, 500);
    if (!physical.allowed) { rejected.actualCost += 1; continue; }
    claimedTicks.add(tick);
    restored.push({ line: frame.lineNo, tick, at: frame.at, oldReason: shooting.reason,
      staminaAuthority: physical.authority, requiredStaminaMs: 500,
      ownShotsBefore: secondary ? quota.ownShots + extraOwnShots : null,
      opponentShots: secondary ? quota.opponentShots : null,
      quotaExempt: secondary && quota.throttleExempt === true });
  }
  return {
    scope: 'fixed logged geometry, target, HP and opponent quota; restored fire opportunities only',
    oldReserveBlockedFrames: frames.filter(frame => wasFutureReserveBlocked(frame.entry?.reserveCleanupReplay?.shooting)).length,
    loggedDispatches: loggedDispatches.length,
    restoredLegalFrameOpportunities: restored.length,
    firstRestored: restored[0] || null,
    firstLoggedDispatchAt: loggedDispatches[0]?.at ?? null,
    firstOpportunityEarlierMs: restored.length && loggedDispatches.length
      ? loggedDispatches[0].at - restored[0].at : null,
    rejected,
    restored,
    duplicateDispatches: 0,
    secondaryQuotaViolations: restored.filter(shot => !shot.quotaExempt && shot.ownShotsBefore !== null
      && shot.ownShotsBefore + 1 > shot.opponentShots).length,
    wholeFightHitHpIncomeClaim: false
  };
}

function runStaminaReserveReplaySelfTest() {
  const make = (tick, overrides = {}) => ({ lineNo: tick, at: tick * 50, entry: { reserveCleanupReplay: {
    tick, self: { hp: 100, stamina5s: 500, authority: 'realtime' },
    target: { user_id: 2, hp: 100, alive: true, combatRole: 'secondary' },
    aim: { ok: true, fireReachability: { reachable: true } }, finalAction: {},
    shooting: { wouldShoot: false, reason: 'pressure-dodge-reserve', inRange: true, targetRole: 'secondary',
      secondaryPolicy: { ownShots: 0, opponentShots: 1, throttleExempt: false } }, ...overrides
  } } });
  const baseline = make(100);
  const result = runStaminaReserveCleanupReplay([baseline, baseline, make(110),
    make(120, { self: { hp: 50 } }), make(130, { aim: { ok: false } })]);
  assert.equal(result.restoredLegalFrameOpportunities, 1);
  assert.equal(result.rejected.quota, 1);
  assert.equal(result.rejected.hardGate, 2);
  assert.equal(result.rejected.frameSlot, 1);
  assert.equal(result.secondaryQuotaViolations, 0);
  assert.equal(runStaminaReserveCleanupReplay([make(100, { self: { hp: 100, stamina5s: 499 } })]).rejected.actualCost, 1);
  return { ok: true };
}

module.exports = { runStaminaReserveCleanupReplay, runStaminaReserveReplaySelfTest };
