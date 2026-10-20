'use strict';
const assert = require('node:assert/strict');
const { buildBrowserlessIncomingThreatAssessment, buildBrowserlessPreTargetIncomingSafetyDecision,
  buildBrowserlessRealtimeControlDecision, buildBrowserlessDecision } = require('./decision-adapter');
const { buildBrowserlessCombatDryRun } = require('./combat-adapter');
const { createBrowserlessStateStore } = require('./state-store');
const { recordIncomingImpact } = require('./incoming-threat-lifecycle');
const { runDodgeLaneArbitrationSelfTest } = require('./dodge-lane-arbitration-self-test');

function fixture(overrides = {}) {
  const tick = overrides.tick ?? 100;
  const self = { entity_id: 1, user_id: 1, authority: 'realtime', x: 0, y: 0, vx: 0, vy: 50,
    hp: 100, max_hp: 100, stamina_5s_remaining_milli: 500,
    stamina_1h_remaining_milli: 3000000, stamina_1d_remaining_milli: 20000000,
    ...overrides.self };
  const bullet = { bullet_id: 'approaching', owner_id: 2, start_x: -10000, start_y: 1000,
    target_x: 5000, target_y: 1000, speed: 500, created_tick: 100, expire_tick: 130,
    ...overrides.bullet };
  const state = { userId: 1, realtime: { tick, self, entities: [self],
    bullets: overrides.bullets ?? [bullet], frameAgeMs: 0, receivedAtMs: 1000 },
    command: { movement: { timing: { sampleCount: 10, medianTicks: 2, p90Ticks: 3 } } },
    fallback: { entities: [], coinDrops: [] } };
  return { state, input: { self, nowMs: 1000, realtime: { tick }, visibleTargets: [] },
    options: { nowMs: 1000, userId: 1, controlMode: 'profit-live', combatEnabled: true,
      dynamicProfitThresholdEnabled: false }, bullet };
}
function assess(f, stateful = {}) {
  const assessment = buildBrowserlessIncomingThreatAssessment(f.state, f.input, null,
    { ...f.options, decisionState: stateful });
  return { assessment, action: buildBrowserlessPreTargetIncomingSafetyDecision(f.input, assessment, f.options) };
}
function runPreTargetTrajectoryCounterfactual() {
  const outcomes = [];
  // Integrate a fixed server-shaped projectile and actual self path independently
  // of the selector's risk scores, including the old late-admission command.
  for (const delay of [3, 4, 5]) {
    const simulate = expanded => {
      let x = 0, y = 0, dx = 0, dy = 1, command = null, minimumDistance = Infinity;
      for (let elapsed = 0; elapsed < 30; elapsed += 1) {
        const tick = 100 + elapsed;
        const f = fixture({ tick, self: { x, y, vx: dx * 50, vy: dy * 50 } });
        f.options.executionTiming = { p90Ticks: delay };
        const { assessment, action } = assess(f);
        if (!command && action && (expanded || assessment.collisionBullets.length)) {
          command = { tick, effectiveTick: tick + delay, dx: action.dx, dy: action.dy };
        }
        if (command && tick >= command.effectiveTick) { dx = command.dx; dy = command.dy; }
        const bx = -10000 + elapsed * 500, by = 1000;
        const rx = bx - x, ry = by - y, rvx = 500 - dx * 50, rvy = -dy * 50;
        const fraction = Math.max(0, Math.min(1, -(rx * rvx + ry * rvy) / (rvx * rvx + rvy * rvy)));
        minimumDistance = Math.min(minimumDistance, Math.hypot(rx + rvx * fraction, ry + rvy * fraction));
        x += dx * 50; y += dy * 50;
      }
      return { command, minimumDistance, hit: minimumDistance <= 90 };
    };
    const old = simulate(false), current = simulate(true);
    assert.equal(old.hit, true);
    assert.equal(current.hit, false);
    assert(current.command.effectiveTick < old.command.tick);
    outcomes.push({ delayTicks: delay, old, current });
  }
  return outcomes;
}
function runPreTargetIncomingSelfTest() {
  const cases = [];
  const check = (id, fn) => { fn(); cases.push(id); };
  check('PT01', () => {
    const { assessment: a, action } = assess(fixture());
    assert.equal(a.collisionBullets.length, 0);
    assert(a.activeThreatBullets[0].cpa > 90);
    assert(a.activeThreatBullets[0].timeToImpact > 10 * 50);
    assert.equal(action.reason, 'incoming-bullet-dodge');
    assert.equal(a.cover.physicalHits, 0);
    assert.equal(a.cover.robustHits, 0);
    assert.equal(runPreTargetTrajectoryCounterfactual().length, 3);
  });
  check('PT02', () => {
    assert.equal(assess(fixture({ bullet: { start_y: 5000, target_y: 5000 } })).action, null);
    assert.equal(assess(fixture({ bullet: { created_tick: 60, expire_tick: 90 } })).action, null);
    assert.equal(assess(fixture({ bullet: { owner_id: 1 } })).action, null);
  });
  check('PT03', () => {
    const f = fixture({ self: { vx: 0, vy: -50 } });
    let result = assess(f);
    assert.equal(result.action, null);
    assert.equal(result.assessment.cover.dy, -1);
    f.state.command.movement.pendingVelocityCommands = [{ dx: -1, dy: 0, observedTick: 100, effectiveAfterTicks: 3 }];
    result = assess(f);
    assert.equal(result.action, null);
    assert.equal(result.assessment.cover.dx, -1);
    assert.equal(result.assessment.cover.dy, 0);
  });
  check('PT04', () => {
    const f = fixture(); const stateful = {};
    const early = assess(f, stateful);
    const lane = stateful.preTargetMovementStability;
    assert(lane);
    const target = { user_id: 2, x: 9000, y: 0, hp: 100, current_join_mode: 'Active', firing: true, drop: 20 };
    f.state.realtime.entities.push(target);
    const combat = buildBrowserlessCombatDryRun(f.state, { ...f.options, decisionState: stateful });
    assert(combat.target);
    assert.equal(combat.movement.movementStability.generation, lane.generation);
    assert.equal(combat.movement.movementStability.reason, 'movement-stability-direction-unchanged');
    assert.deepEqual([combat.movement.dx, combat.movement.dy], [lane.direction.dx, lane.direction.dy]);
    const established = buildBrowserlessIncomingThreatAssessment(f.state, f.input, { target: combat.target, dryRun: combat },
      { ...f.options, decisionState: stateful, preexistingCombatTarget: combat.target });
    assert.equal(established.threatGeneration, early.assessment.threatGeneration);
    assert.equal(established.combatMovementCovered, true);
    assert.equal(buildBrowserlessPreTargetIncomingSafetyDecision(f.input, established, f.options), null);
  });
  check('PT05', () => {
    // Includes the exact #301/#302 multi-bullet raw/robust regression geometry.
    assert.equal(runDodgeLaneArbitrationSelfTest().ok, true);
  });
  check('PT06', () => {
    const result = assess(fixture({ bullet: { start_x: -60, start_y: 0, target_x: 15000,
      target_y: 0, created_tick: 100 }, self: { vx: 0, vy: 0 } }));
    assert(result.action);
    assert(result.assessment.cover.physicalHits > 0);
    assert.equal(result.action.incomingSafety.firstNoSafeTick, 100);
    assert.equal(result.action.incomingSafety.lastSafeTick, null);
  });
  check('PT07', () => {
    for (const stamina of [3500, 2400, 500, 0]) {
      const f = fixture({ self: { stamina_5s_remaining_milli: stamina } });
      f.options.combatShootDodgeReserveMs = 3800;
      assert.equal(assess(f).action?.reason, 'incoming-bullet-dodge');
    }
  });
  check('PT08', () => {
    const f = fixture(); const store = createBrowserlessStateStore({ userId: 1, now: () => 1000 });
    store.ingestFrame({ type: 'pos', tick: 100, entities: [f.input.self], bullets: [f.bullet] }, { receivedAtMs: 1000 });
    const state = store.getDecisionState(1000);
    const a = buildBrowserlessIncomingThreatAssessment(state, f.input, null, { ...f.options, decisionState: {} });
    assert.equal(a.bullets[0].firstReceivedTick, 100);
    assert.equal(a.bullets[0].firstDodgeCommandTick, null);
    const telemetry = store.recordVelocityRequest({ dx: a.cover.dx, dy: a.cover.dy, observedTick: 100, requestedAtMs: 1000 });
    const summary = store.recordIncomingSafetyExecution(a, { type: 'velocity', movementTelemetry: telemetry });
    assert.equal(summary[0].firstDodgeCommandTick, 100);
    assert.equal(summary[0].expectedEffectiveTick, 105);
    store.ingestFrame({ type: 'pos', tick: 101, entities: [f.input.self], bullets: [f.bullet] }, { receivedAtMs: 1050 });
    assert.equal(store.getDecisionState(1050).realtime.bullets[0].firstDodgeCommandTick, 100);
    const records = { approaching: summary[0] };
    recordIncomingImpact(records, { matched: true, bulletId: 'approaching', damageTick: 120 });
    assert.equal(records.approaching.impactTick, 120);
    assert.equal(records.approaching.impactAuthority, 'attributed-hp-loss');
    const impact = store.recordIncomingSafetyExecution(a, null,
      { matched: true, classification: 'predicted-safe-false-negative', bulletId: 'approaching', damageTick: 120 });
    assert.equal(impact[0].impactTick, 120);
    assert.equal(store.recordIncomingSafetyExecution(null, null,
      { matched: true, bulletId: 'approaching', damageTick: 120 })[0].impactTick, 120);
    recordIncomingImpact(records, { matched: false, bulletId: 'approaching', damageTick: 121 });
    assert.equal(records.approaching.impactTick, 120);
  });
  check('PT09', () => {
    const f = fixture();
    f.state.realtime.coinDrops = [{ id: 'coin', x: 0, y: 8000, amount: 100 }];
    f.state.realtime.coinDropsObserved = true;
    const decision = buildBrowserlessRealtimeControlDecision(f.state, {}, f.options);
    assert.equal(decision.action?.reason, 'incoming-bullet-dodge');
    assert.equal(decision.combat?.target, null);
    assert.equal(decision.combat?.shooting?.wouldShoot, false);
    const many = fixture({ bullets: Array.from({ length: 64 }, (_, i) => ({ ...f.bullet, bullet_id: `b${i}` })) });
    assert.equal(assess(many).assessment.activeThreatBullets.length, 32);
    const safe = fixture({ self: { vy: -50 }, bullet: { start_y: 700, target_y: 700 } });
    safe.state.realtime.coinDrops = [{ id: 'coin', x: 0, y: 8000, amount: 5 }];
    safe.state.realtime.coinDropsObserved = true;
    const turn = buildBrowserlessDecision(safe.state, {}, safe.options);
    assert.equal(turn.action.reason, 'incoming-bullet-dodge');
    assert.equal(turn.kind, turn.action.kind);
    assert.equal(turn.band, turn.action.band);
    assert.equal(turn.reason, turn.action.reason);
    assert.deepEqual([turn.action.dx, turn.action.dy], [0, -1]);
  });
  return { ok: true, cases };
}
module.exports = { runPreTargetIncomingSelfTest, runPreTargetTrajectoryCounterfactual, fixture };
if (require.main === module) console.log(JSON.stringify(runPreTargetIncomingSelfTest()));
