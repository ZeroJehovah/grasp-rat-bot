'use strict';

const assert = require('assert');
const { buildCombatMovementPlan, buildBrowserlessCombatDryRun } = require('./combat-adapter');
const { rewardFinishBackAwaySuppressionPolicy: hold } = require('../../strategy/combat-movement');
const { observeProfitCompetitorEvidence: observe, profitKillRacePolicy: race } = require('../../strategy/profit-kill-race');

function runRewardFinishSpacingSelfTest() {
  const cases = [];
  const check = (name, fn) => { fn(); cases.push(name); };
  const self = { user_id: 1, x: 0, y: 0, vx: 0, vy: 0, hp: 100, max_hp: 100,
    stamina_5s_remaining_milli: 10000, current_join_mode: 'Active' };
  const target = { user_id: 2, x: 3000, y: 0, vx: 0, vy: 0, hp: 73, drop: 100,
    distance: 3000, active: true, firing: true, combatRole: 'primary', authority: 'realtime' };
  const competitor = { user_id: 3, x: 4000, y: 0, hp: 100, active: true, authority: 'realtime' };
  const input = { self, target, primaryTarget: true, distanceCm: 3000, competitionTargets: [competitor] };
  const movement = (enemy = target, competitionTargets = [], options = {}) => buildCombatMovementPlan(
    self, enemy, [], { nowMs: 10000, profitCompetitionTargets: competitionTargets, ...options }
  );

  check('uncontested primary restores final outward movement in every quadrant', () => {
    for (const [x, y] of [[3000, 0], [-3000, 0], [0, 3000], [0, -3000]]) {
      const result = movement({ ...target, x, y });
      assert.strictEqual(result.reason, 'back-away');
      assert.strictEqual(result.dx * x + result.dy * y < 0, true);
      assert.strictEqual(result.rewardFinishBackAwayHold.reason, 'no-nearby-active-competitor');
    }
  });
  check('contested primary retains position before the sub-20 fire gate applies', () => {
    const result = movement(target, [competitor]);
    assert.strictEqual(result.reason, 'hold-spacing');
    assert.strictEqual(result.dx, 0);
    assert.strictEqual(result.dy, 0);
    assert.strictEqual(result.rewardFinishBackAwayHold.competitorCount, 1);
    assert.strictEqual(result.profitKillRace.active, false);
  });
  check('20 and 75 HP thresholds keep separate positioning and fire meanings', () => {
    for (const hp of [19, 20, 75, 76]) {
      const result = movement({ ...target, hp }, [competitor]);
      assert.strictEqual(result.rewardFinishBackAwayHold.suppress, hp <= 75);
      assert.strictEqual(result.profitKillRace.active, hp < 20);
      if (hp < 20) {
        assert.strictEqual(result.profitKillRace.fireAllowed, false);
        assert.strictEqual(result.dx, 1);
      }
      assert.strictEqual(movement({ ...target, hp }).rewardFinishBackAwayHold.suppress, false);
    }
  });
  check('ordinary separation releases exactly at 45 metres', () => {
    for (const distance of [4499, 4500, 4501]) {
      const result = movement({ ...target, x: distance, distance });
      assert.strictEqual(result.reason === 'back-away', distance < 4500);
    }
  });
  check('competitor radius is inclusive and target-centered', () => {
    for (const [x, expected] of [[11000, true], [11001, false], [-6000, false]]) {
      assert.strictEqual(hold({ ...input, competitionTargets: [{ ...competitor, x }] }).suppress, expected);
    }
    assert.strictEqual(hold(input, { profitKillRaceCompetitorRadiusCm: 999 }).suppress, false);
  });
  check('self primary dead passive and snapshot rows cannot create competition', () => {
    for (const other of [self, target, { ...competitor, alive: false },
      { ...competitor, active: false }, { ...competitor, current_join_mode: 'Passive' },
      { ...competitor, authority: 'snapshot' }]) {
      const candidate = { ...input, competitionTargets: [other] };
      assert.strictEqual(hold(candidate).suppress, false);
      assert.strictEqual(race({ ...candidate, target: { ...target, hp: 19 } }).active, false);
    }
  });
  check('primary role health reward pickup and feature gates remain authoritative', () => {
    for (const override of [{ primaryTarget: false }, { self: { ...self, hp: 50 } },
      { target: { ...target, drop: 4 } }, { target: { ...target, hp: 0 } },
      { distanceCm: 150 }]) assert.strictEqual(hold({ ...input, ...override }).suppress, false);
    assert.strictEqual(hold({ ...input, distanceCm: 151 }).suppress, true);
    assert.strictEqual(hold(input, { combatRewardFinishBackAwayHoldEnabled: false }).suppress, false);
  });

  const observeAt = (state, nowMs, tick, realtimeTargets, realtimeBullets = []) => observe(state,
    { self, nowMs, observedTick: tick, realtimeTargets, realtimeBullets }).competitionTargets;
  check('native movement firing and bullet ownership all retain their evidence authority', () => {
    for (const [other, bullets] of [
      [{ ...competitor, active: false, vx: 50 }, []],
      [{ ...competitor, active: false, firing: true }, []],
      [{ ...competitor, active: false }, [{ ownerId: 3, authority: 'realtime' }]]
    ]) {
      const competitionTargets = observeAt({}, 10000, 200, [other], bullets);
      assert.strictEqual(hold({ ...input, competitionTargets }).suppress, true);
    }
  });
  check('missing positions retain native evidence through 4000 ms but not 4001', () => {
    const state = {};
    observeAt(state, 10000, 200, [competitor]);
    const held = hold({ ...input, competitionTargets: observeAt(state, 14000, 280, []) });
    assert.strictEqual(held.suppress, true);
    assert.strictEqual(held.competitorPositionUncertain, true);
    assert.strictEqual(hold({ ...input, competitionTargets: observeAt(state, 14001, 281, []) }).suppress, false);
  });
  check('unlocated native bullet owner uses the existing bounded uncertainty protection', () => {
    const state = {};
    const known = observeAt(state, 10000, 200, [], [{ ownerId: 3, authority: 'realtime' }]);
    assert.strictEqual(hold({ ...input, competitionTargets: known }).competitorPositionUncertain, true);
    assert.strictEqual(hold({ ...input, competitionTargets: known }).suppress, true);
    assert.strictEqual(hold({ ...input, competitionTargets: observeAt(state, 14001, 281, []) }).suppress, false);
    const snapshot = observeAt({}, 10000, 200, [], [{ ownerId: 3, authority: 'snapshot' }]);
    assert.strictEqual(hold({ ...input, competitionTargets: snapshot }).suppress, false);
  });
  check('three fresh passive ticks clear competition and a repeat tick does not advance it', () => {
    const state = {};
    observeAt(state, 10000, 200, [competitor]);
    const passive = { ...competitor, current_join_mode: 'Passive', active: false };
    for (const tick of [201, 201, 202, 203]) {
      const competitors = observeAt(state, 10000 + (tick - 200) * 50, tick, [passive]);
      assert.strictEqual(hold({ ...input, competitionTargets: competitors }).suppress, tick < 203);
    }
  });
  check('explicit death immediately clears an existing competitor lease', () => {
    const state = {};
    observeAt(state, 10000, 200, [competitor]);
    const competitors = observeAt(state, 10050, 201, [{ ...competitor, alive: false }]);
    assert.strictEqual(hold({ ...input, competitionTargets: competitors }).suppress, false);
  });
  check('no-progress approach keeps movement even without competitors', () => {
    const result = movement(target, [], { combatTargetState: {
      id: 2, combatPhase: 'close-pressure', closePressure: { active: true,
        range: { rangeCm: 2000, minRangeCm: 1000, normalMinRangeCm: 6500, normalMaxRangeCm: 7500 } }
    } });
    assert.strictEqual(result.dx, 1);
    assert.strictEqual(result.closePressure.active, true);
  });
  check('real incoming Dodge retains ownership regardless of competition', () => {
    const bullet = { bullet_id: 'incoming', ownerId: 2, x: 1500, y: 0, speed: 500,
      direction: { dx: -1, dy: 0 }, incoming: true, distance: 1500,
      timeToImpact: 150, remainingTicks: 15 };
    for (const profitCompetitionTargets of [[], [competitor]]) {
      const result = buildCombatMovementPlan(self, target, [bullet], { nowMs: 10000,
        profitCompetitionTargets, combatBulletHitRadiusCm: 90,
        movementExecutionTiming: { sampleCount: 10, medianTicks: 1, p90Ticks: 1 } });
      assert.strictEqual(result.ownership.owner, 'emergency-dodge');
      assert(result.dy !== 0);
    }
  });
  check('runtime observer supplies competition without changing fire cadence or reserve', () => {
    const run = others => buildBrowserlessCombatDryRun({ userId: 1, realtime: {
      tick: 200, frameAgeMs: 0, receivedAtMs: 10000, self,
      entities: [self, target, ...others], bullets: []
    } }, { nowMs: 10000, combatEnabled: true, liveCombatEnabled: true, decisionState: {
      profitMission: { active: true, targetId: '2', type: 'enemy', navigationTarget: target },
      combatTarget: { id: 2, firstSeenAt: 8000, at: 9950, firstHp: 100, minHp: 73,
        hp: 73, originIntent: 'profit', intent: 'profit', combatRole: 'primary', primaryTargetId: '2' }
    } });
    const free = run([]), contested = run([competitor]);
    assert.strictEqual(free.movement.rewardFinishBackAwayHold.suppress, false);
    assert.strictEqual(contested.movement.rewardFinishBackAwayHold.suppress, true);
    assert.strictEqual(contested.movement.rewardFinishBackAwayHold.nearestCompetitor.evidenceReasons[0], 'native-active');
    assert.strictEqual(free.shooting.wouldShoot, true);
    assert.strictEqual(contested.shooting.wouldShoot, true);
    for (const key of ['cadenceMs', 'dodgeReserveMs', 'hardReserveMs']) {
      assert.strictEqual(free.shooting[key], contested.shooting[key]);
    }
  });
  return { ok: true, cases: cases.length, names: cases };
}

if (require.main === module) console.log(JSON.stringify(runRewardFinishSpacingSelfTest()));
module.exports = { runRewardFinishSpacingSelfTest };
