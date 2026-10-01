'use strict';

const { buildCombatMovementPlan } = require('../src/node/browserless/combat-adapter');
const { combatPressureWindowCore, invulnerableEscortWaitCore, uncommittedDefenseExitCore } = require('../src/strategy/combat-opportunity-tactics');
const { buildUncommittedDefenseExitAction } = require('../src/node/browserless/uncommitted-defense');

// Swept relative segments avoid missing a 90 cm collision between the legacy
// replay's 25 ms (250 cm projectile travel) sample points. Never bridge a gap
// larger than two native ticks, or extend the projectile's finite lifetime.
function sweptShotDistance(origin, aim, samples, at, options) {
  const length = Math.hypot(aim.x - origin.x, aim.y - origin.y);
  if (!length) return Infinity;
  const speed = options.bulletSpeedPerTick / options.tickMs;
  const vx = (aim.x - origin.x) / length * speed;
  const vy = (aim.y - origin.y) / length * speed;
  let minimum = Infinity;
  for (let i = 1; i < samples.length; i += 1) {
    const a = samples[i - 1]; const b = samples[i];
    if (b.at <= a.at || b.at - a.at > options.tickMs * 2) continue;
    const from = Math.max(at, a.at); const until = Math.min(at + options.bulletTtlMs, b.at);
    if (until < from) continue;
    const tx = (b.x - a.x) / (b.at - a.at); const ty = (b.y - a.y) / (b.at - a.at);
    const rx = origin.x + vx * (from - at) - a.x - tx * (from - a.at);
    const ry = origin.y + vy * (from - at) - a.y - ty * (from - a.at);
    const dx = vx - tx; const dy = vy - ty;
    const denominator = dx * dx + dy * dy;
    const elapsed = denominator ? Math.max(0, Math.min(until - from, -(rx * dx + ry * dy) / denominator)) : 0;
    minimum = Math.min(minimum, Math.hypot(rx + dx * elapsed, ry + dy * elapsed));
  }
  return minimum;
}

function runCombatOpportunityReplay(frames, shots, sourceEvents, options, helpers) {
  const native = frames.filter(f => f.entry.combatOpportunityReplay && f.self && f.nearbyTarget);
  if (!native.length) return null;
  let samples = [];
  let waitState = null;
  let exitState = null;
  let lastShotAt = null;
  let previousId = '';
  let firstExit = null;
  const waits = [];
  for (const frame of native) {
    const d = frame.entry.combatOpportunityReplay;
    const targetId = String(d.target.userId ?? d.target.user_id ?? '');
    if (targetId !== previousId) { samples = []; waitState = null; exitState = null; lastShotAt = null; }
    previousId = targetId;
    const shotAt = d.latestOpponentShotAt;
    const newShot = Number.isFinite(shotAt) && shotAt !== lastShotAt && shotAt <= frame.at && frame.at - shotAt <= 1500;
    samples.push({ at: frame.at, selfHp: frame.selfHp, targetHp: frame.targetHp, newBulletCount: newShot ? 1 : 0 });
    samples = samples.filter(s => frame.at - s.at <= 5000);
    if (newShot) lastShotAt = shotAt;
    const pressure = combatPressureWindowCore(samples, frame.at);
    const primary = d.primary;
    const secondary = d.target.combatRole === 'secondary' || d.target.secondaryTarget === true;
    const waiting = invulnerableEscortWaitCore({
      nowMs: frame.at, primary, secondary,
      realtimePrimary: primary?.authority === 'realtime' && d.movement.secondaryTarget?.mainTargetRealtimeVisible === true,
      primaryDistanceCm: d.movement.secondaryTarget?.distanceCm ?? null,
      selfHp: frame.selfHp, pressure, previous: waitState
    });
    waitState = waiting.state;
    if (waiting.active) waits.push({ frame, waiting });
    const candidate = uncommittedDefenseExitCore({
      nowMs: frame.at, targetId, realtime: d.target.authority === 'realtime', secondary,
      commitment: Boolean(d.primary), selfHp: frame.selfHp, targetHp: frame.targetHp,
      invulnerable: d.target.invulnerable, engagedMs: d.engagedMs, acceptedShots: d.acceptedShots,
      finishOpportunity: d.finishOpportunity, pressure, previous: exitState
    });
    exitState = candidate.state;
    const exitAction = buildUncommittedDefenseExitAction({ target: d.target, dryRun: { uncommittedDefense: candidate } },
      { profitMission: primary }, { evaluated: true });
    if (!firstExit && exitAction) firstExit = frame;
  }
  const last = native.at(-1);
  const firstWait = waits[0];
  const result = {
    evidence: 'native fixed opponent track; shot timestamps retained; no opponent-response or stamina resimulation',
    pressureEvidence: 'distinct logged secondary latestOpponentShotAt; a lower bound on observed new shots',
    waiting: {
      activeFrames: waits.length,
      first: firstWait ? { line: firstWait.frame.lineNo, at: firstWait.frame.at, selfHp: firstWait.frame.selfHp,
        remainingMs: firstWait.waiting.remainingMs, rewardEtaMs: firstWait.waiting.rewardEtaMs,
        hp50EtaMs: firstWait.waiting.hp50EtaMs } : null,
      ordinaryApproachFramesDeferred: waits.filter(({ frame }) => frame.entry.combatOpportunityReplay.movement.reason === 'secondary-follow-primary-target').length,
      emergencyDodgeFramesPreserved: waits.filter(({ frame }) => frame.entry.combatOpportunityReplay.movement.dodge?.applied).length,
      protectedPrimaryFrames: waits.filter(({ frame }) => frame.entry.combatOpportunityReplay.primary?.invulnerable === true).length,
      survivalGain: 'not inferred from movement counterfactual'
    },
    defenseExit: firstExit ? {
      line: firstExit.lineNo, at: firstExit.at, selfHp: firstExit.selfHp, targetHp: firstExit.targetHp,
      recordedEndSelfHp: last.selfHp, recordedEndTargetHp: last.targetHp,
      hpPreservedBeforeTransportDelay: firstExit.selfHp - last.selfHp,
      targetDamageForgone: firstExit.targetHp - last.targetHp,
      laterAcceptedShots: sourceEvents.filter(e => e.at > firstExit.at && e.detail?.outcome === 'accepted').length,
      confirmationDelaySweeps: [250, 500, 1000].map(delayMs => {
        const end = native.find(f => f.at >= firstExit.at + delayMs) || last;
        return { delayMs, selfHp: end.selfHp, hpPreserved: end.selfHp - last.selfHp };
      })
    } : null,
    pursuit: []
  };
  // Restrict the trajectory counterfactual to a wholly unpressured primary fight.
  // All tactical gates and spacing still execute in the production movement layer.
  if (!native.every(f => f.entry.combatOpportunityReplay.target.combatRole === 'primary'
    && !f.entry.combatOpportunityReplay.pressureActive
    && !f.entry.combatOpportunityReplay.movement.dodge?.applied && f.selfHp === native[0].selfHp)) return result;
  const targetSamples = helpers.samplesFromFrames(native, 'nearbyTarget');
  for (const delayTicks of [1, 2, 3, 4, 5]) {
    const simulate = enabled => {
      let point = { ...native[0].self };
      let velocity = { x: Number(native[0].entry.combatOpportunityReplay.self.vx || 0) / 50,
        y: Number(native[0].entry.combatOpportunityReplay.self.vy || 0) / 50 };
      let time = native[0].at;
      let queue = [];
      let previousState = null;
      let first45m = null;
      let headingFrames = 0;
      let gapResets = 0;
      const positions = [];
      for (const frame of native) {
        if (frame.at - time > 250) {
          point = { ...frame.self }; queue = []; previousState = null; gapResets += 1;
          velocity = { x: Number(frame.entry.combatOpportunityReplay.self.vx || 0) / 50,
            y: Number(frame.entry.combatOpportunityReplay.self.vy || 0) / 50 };
          time = frame.at;
        }
        while (queue.length && queue[0].at <= frame.at) {
          const command = queue.shift();
          const dt = Math.max(0, command.at - time);
          point.x += velocity.x * dt; point.y += velocity.y * dt;
          time = Math.max(time, command.at); velocity = command.velocity;
        }
        const dt = frame.at - time;
        point.x += velocity.x * dt; point.y += velocity.y * dt; time = frame.at;
        positions.push({ at: time, ...point });
        const d = frame.entry.combatOpportunityReplay;
        const distance = Math.hypot(d.target.x - point.x, d.target.y - point.y);
        if (distance <= 4500 && !first45m) first45m = { line: frame.lineNo, elapsedMs: time - native[0].at };
        const targetState = { id: String(d.target.userId), firstSeenAt: native[0].at,
          ballisticClose: d.movement.ballisticClose?.state, pursuitApproachState: previousState, motionSamples: [],
          noDamageMs: d.movement.ballisticClose?.noDamageMs ?? frame.noDamageMs,
          acceptedShotsSinceDamage: d.movement.ballisticClose?.acceptedShotsSinceDamage ?? d.acceptedShots,
          opponentBehaviorState: d.behavior, originIntent: d.target.combatIntent,
          combatPhase: d.combatPhase?.phase, closePressure: d.combatPhase };
        const plan = buildCombatMovementPlan({ ...d.self, ...point, vx: velocity.x * 50, vy: velocity.y * 50 },
          { ...d.target, distance }, [], {
            nowMs: frame.at, combatTargetState: targetState, combatPhase: d.combatPhase,
            combatMetrics: { acceptedShots: d.acceptedShots }, combatPursuitHeadingEnabled: enabled,
            realtimeStateFresh: true
          });
        previousState = plan.pursuitApproach.state;
        if (plan.pursuitApproach.active) headingFrames += 1;
        const speed = plan.dx && plan.dy ? 0.7 : 1;
        queue.push({ at: time + delayTicks * 50, velocity: { x: plan.dx * speed, y: plan.dy * speed } });
      }
      const simulatedShots = shots.filter(s => native.some(f => f.lineNo === s.frame.lineNo))
        .map(s => helpers.cloneShotWithSimulatedSelf(s, positions));
      let hits = 0; let minDistance = Infinity; let firstHit = null;
      for (const shot of simulatedShots) {
        const aim = helpers.liveInterceptAimForShot(shot, options);
        const distance = sweptShotDistance(shot.frame.self, aim, targetSamples, shot.frame.at, options);
        minDistance = Math.min(minDistance, distance);
        if (distance <= options.hitRadiusCm) {
          hits += 1;
          if (!firstHit) firstHit = { line: shot.frame.lineNo, at: shot.frame.at };
        }
      }
      const score = { considered: simulatedShots.length, hits, firstHit,
        minDistanceCm: Number.isFinite(minDistance) ? Math.round(minDistance) : null,
        aimModel: 'identical live-velocity intercept in both arms', collisionModel: 'swept-linear-native-segments' };
      return { first45m, headingFrames, gapResets, ...score };
    };
    result.pursuit.push({ delayTicks, before: simulate(false), after: simulate(true) });
  }
  result.pursuitRangeImprovedAllDelays = result.pursuit.every(s => s.after.first45m
    && (!s.before.first45m || s.after.first45m.elapsedMs < s.before.first45m.elapsedMs));
  result.pursuitHitsImprovedDelayCount = result.pursuit.filter(s => s.after.hits > s.before.hits).length;
  result.pursuitHitsRegressedDelayCount = result.pursuit.filter(s => s.after.hits < s.before.hits).length;
  return result;
}

function runCombatOpportunityReplaySelfTest() {
  const assert = require('assert');
  const options = { tickMs: 50, bulletSpeedPerTick: 500, bulletTtlMs: 1500 };
  assert.strictEqual(sweptShotDistance({ x: 0, y: 0 }, { x: 100, y: 0 },
    [{ at: 0, x: 125, y: 0 }, { at: 50, x: 125, y: 0 }], 0, options), 0,
  'must catch the hit between sampled endpoints');
  assert.strictEqual(sweptShotDistance({ x: 0, y: 0 }, { x: 100, y: 0 },
    [{ at: 0, x: 125, y: 0 }, { at: 101, x: 125, y: 0 }], 0, options), Infinity);
  assert.strictEqual(sweptShotDistance({ x: 0, y: 0 }, { x: 100, y: 0 },
    [{ at: 1600, x: 16000, y: 0 }, { at: 1650, x: 16000, y: 0 }], 0, options), Infinity);
  const frames = Array.from({ length: 17 }, (_, i) => ({
    at: 10000 + i * 250, lineNo: i + 1, self: { x: 0, y: 0 }, nearbyTarget: { x: 3000, y: 0 },
    selfHp: 100 - 2 * i, targetHp: 100 - Math.floor(i / 3),
    entry: { combatOpportunityReplay: { self: {}, target: { userId: '2', combatRole: 'secondary', authority: 'realtime' },
      primary: null, movement: { secondaryTarget: { mainTargetRealtimeVisible: true, distanceCm: 5000 } },
      engagedMs: i * 250, acceptedShots: i, latestOpponentShotAt: 10000 + i * 250 } }
  }));
  const result = runCombatOpportunityReplay(frames, [], [], options, {});
  assert(result.defenseExit.hpPreservedBeforeTransportDelay > 0);
  assert.strictEqual(result.waiting.activeFrames, 0);
  for (const f of frames) f.entry.combatOpportunityReplay.primary = {
    userId: '3', x: 5000, y: 0, hp: 100, authority: 'realtime', invulnerable: true,
    invulnerableProtectionLeaseUntilMs: 50000
  };
  const escorted = runCombatOpportunityReplay(frames, [], [], options, {});
  assert.strictEqual(escorted.defenseExit, null);
  assert(escorted.waiting.activeFrames > 0);
  return { ok: true };
}

module.exports = { runCombatOpportunityReplay, runCombatOpportunityReplaySelfTest };
