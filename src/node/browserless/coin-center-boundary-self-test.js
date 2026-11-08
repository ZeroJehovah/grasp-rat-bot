'use strict';

const assert = require('node:assert/strict');
const {
  pointWithinCenterActivityRadiusCore,
  evaluateCenterActivityHardBoundaryCore
} = require('../../strategy/center-activity-boundary');
const {
  buildBrowserlessStrategyInput,
  createBrowserlessDecisionAdapter,
  buildPostKillSettlementWaitDecision,
  postKillSettlementMovement
} = require('./decision-adapter');

function runCoinCenterBoundarySelfTest() {
  const checks = [];
  const check = (name, run) => { run(); checks.push(name); };
  const nowMs = Date.parse('2026-11-08T17:31:13.540Z');
  const options = {
    userId: 7,
    controlMode: 'non-combat-profit',
    combatEnabled: false,
    dynamicProfitThresholdEnabled: false,
    singleCoinBaitEnabled: false,
    finalActionArbitrationHoldMs: 10000,
    opportunitySwitchConfirmFrames: 1,
    nowMs
  };
  const frame = ({ x = 99000, y = 0, coins = [], snapshot = [], tick = 1000, at = nowMs } = {}) => {
    const self = {
      entity_id: 1, user_id: 7, x, y, hp: 100, max_hp: 100,
      stamina_5s_remaining_milli: 10000, stamina_5s_limit_milli: 10000,
      stamina_1h_remaining_milli: 3000000, stamina_1h_limit_milli: 3000000,
      stamina_1d_remaining_milli: 20000000, stamina_1d_limit_milli: 20000000
    };
    return {
      userId: 7,
      realtime: { self, entities: [self], bullets: [], tick, frameAgeMs: 0,
        receivedAtMs: at, coinDrops: coins, coinDropsObserved: true },
      fallback: { entities: [], messages: [], tick, frameAgeMs: 0,
        receivedAtMs: at, coinDrops: snapshot, coinDropsObserved: true }
    };
  };
  const inside = { drop_id: 'inside', amount: 46, x: 100000, y: 0 };
  const outside = { drop_id: 'outside', amount: 1000, x: 100001, y: 0 };

  check('inclusive origin radius, both axes, and missing coordinates', () => {
    for (const point of [{ x: 100000, y: 0 }, { x: -100000, y: 0 }, { x: 60000, y: 80000 }]) {
      assert.equal(pointWithinCenterActivityRadiusCore(point, 100000), true);
    }
    for (const point of [outside, { x: -100001, y: 0 }, { x: 60000, y: 80001 },
      { x: 99999, y: 99999 }, { x: null, y: 0 }, { x: Infinity, y: 0 }, {}]) {
      assert.equal(pointWithinCenterActivityRadiusCore(point, 100000), false);
    }
  });

  check('realtime and snapshot candidate filtering preserves observations', () => {
    for (const source of ['coins', 'snapshot']) {
      const input = buildBrowserlessStrategyInput(frame({ [source]: [inside, outside] }), options, {});
      assert.deepEqual(input.profitCoins.map(coin => coin.id), ['inside']);
      assert.equal(input[source === 'coins' ? 'realtimeObservedCoins' : 'snapshotObservedCoins'].length, 2);
      assert.equal(input.centerActivity[source === 'coins' ? 'filteredRealtimeCoins' : 'filteredSnapshotCoins'], 1);
      const decision = createBrowserlessDecisionAdapter(options).decide(frame({ [source]: [inside, outside] }), options);
      assert.equal(decision.action.target?.id, 'inside');
      assert(!decision.profit?.candidates?.some(candidate => candidate.id === 'outside'));
    }
  });

  check('01:31 persistent 4587m snapshot coin stays outside profit navigation', () => {
    const coin = { drop_id: 501, amount: 46, x: 434700, y: -3600 };
    const adapter = createBrowserlessDecisionAdapter(options);
    for (const [tick, at] of [[1000, nowMs - 30000], [1600, nowMs]]) {
      const decision = adapter.decide(frame({ x: -17961, y: 70711, snapshot: [coin], tick, at }), { nowMs: at });
      assert.notEqual(decision.action.target?.id, 501);
      assert.equal(decision.input.centerActivity.filteredSnapshotCoins, 1);
      assert(!decision.profit?.candidates?.some(candidate => candidate.id === 501));
    }
    assert.equal(adapter.getState().profitMission, null);
    assert.equal(adapter.getState().persistentCoinObservations['id:501'].snapshotObservationCount, 2);
  });

  check('old mission and final-action lock release when the center limit applies', () => {
    const adapter = createBrowserlessDecisionAdapter({ ...options, browserlessCenterActivityRadiusCm: 500000 });
    const first = adapter.decide(frame({ coins: [outside] }), options);
    assert.equal(first.action.target?.id, 'outside');
    assert.equal(adapter.getState().profitMission?.type, 'coin');
    const next = adapter.decide(frame({ coins: [outside], tick: 1001, at: nowMs + 50 }), {
      nowMs: nowMs + 50, browserlessCenterActivityRadiusCm: 100000
    });
    assert.notEqual(next.action.target?.id, 'outside');
    assert.equal(adapter.getState().profitMission, null);
    assert.notEqual(adapter.getState().finalActionArbitration?.lastAction?.target?.id, 'outside');
  });

  check('coin routes exclude outside legs before valuing the route', () => {
    const coins = [
      { drop_id: 'entry', amount: 3, x: 99500, y: 0 },
      { drop_id: 'edge', amount: 3, x: 99950, y: 0 },
      { drop_id: 'outside-tail', amount: 1000, x: 100500, y: 0 }
    ];
    const decision = createBrowserlessDecisionAdapter(options).decide(frame({ coins }), options);
    assert(['entry', 'edge'].includes(decision.action.target?.id));
    assert(!JSON.stringify(decision.profit?.candidates || []).includes('outside-tail'));
    assert(!JSON.stringify(decision.action).includes('outside-tail'));
  });

  check('current coordinates and retained route or final-action state cannot bypass admission', () => {
    const moved = createBrowserlessDecisionAdapter(options);
    moved.decide(frame({ coins: [inside] }), options);
    const movedDecision = moved.decide(frame({ coins: [{ ...inside, x: 100001 }], tick: 1001,
      at: nowMs + 50 }), { nowMs: nowMs + 50 });
    assert.notEqual(movedDecision.action.target?.id, 'inside');
    assert.equal(moved.getState().profitMission, null);

    const orphaned = createBrowserlessDecisionAdapter({ ...options, browserlessCenterActivityRadiusCm: 500000 });
    orphaned.decide(frame({ coins: [outside] }), options);
    orphaned.patchState({ profitMission: null, opportunityChoice: null, currentOpportunity: null });
    const fresh = orphaned.decide(frame({ coins: [inside, outside], tick: 1001, at: nowMs + 50 }), {
      nowMs: nowMs + 50, browserlessCenterActivityRadiusCm: 100000
    });
    assert.equal(fresh.action.target?.id, 'inside');

    const route = createBrowserlessDecisionAdapter(options);
    route.decide(frame({ coins: [inside] }), options);
    const mission = route.getState().profitMission;
    mission.choice.sourceCoin.coinRoute = { points: [inside, outside] };
    route.patchState({ profitMission: mission });
    const repaired = route.decide(frame({ coins: [inside, outside], tick: 1001, at: nowMs + 50 }), {
      nowMs: nowMs + 50
    });
    assert.equal(repaired.action.target?.id, 'inside');
    assert(!JSON.stringify(repaired.action).includes('outside'));
    assert(!JSON.stringify(route.getState().profitMission).includes('outside'));
  });

  check('realtime loot and its distance hysteresis never retain outside coins', () => {
    const adapter = createBrowserlessDecisionAdapter({ ...options, controlMode: 'profit-live', combatEnabled: true });
    const first = adapter.evaluateRealtime(frame({ snapshot: [inside] }), options);
    assert.equal(first.action?.target?.id, 'inside');
    const next = adapter.evaluateRealtime(frame({ snapshot: [{ ...inside, x: 100001 }], tick: 1001,
      at: nowMs + 50 }), { nowMs: nowMs + 50 });
    assert.notEqual(next.action?.target?.id, 'inside');
    assert.equal(adapter.getState().realtimeLootIntent, null);
  });

  check('1300m self boundary exception accepts only coins within the center', () => {
    const adapter = createBrowserlessDecisionAdapter({ ...options, controlMode: 'profit-live', combatEnabled: true });
    for (const source of ['coins', 'snapshot']) {
      const blocked = adapter.evaluateRealtime(frame({ x: 130001,
        [source]: [{ ...outside, x: 130100 }], tick: source === 'coins' ? 1002 : 1003 }), options);
      assert.equal(blocked.action?.reason, 'outside-center-hard-boundary-leave');
    }
    const allowed = adapter.evaluateRealtime(frame({ x: 130001, coins: [inside], tick: 1004 }), options);
    assert.equal(allowed.action?.target?.id, 'inside');
    assert.equal(allowed.action?.centerHardBoundary?.allowedHighValueCoin, true);
    const boundary = evaluateCenterActivityHardBoundaryCore({ self: { x: 130001, y: 0 },
      action: { kind: 'coin', target: { ...outside, type: 'coin' } } }, { coinTargetRadiusCm: 100000 });
    assert.equal(boundary.allowed, false);
  });

  check('post-kill death-point navigation obeys the same coin boundary', () => {
    const input = { self: frame().realtime.self, nowMs };
    const settlement = { targetId: 'enemy', phase: 'drop-pending', active: true, x: 100001, y: 0 };
    assert.equal(postKillSettlementMovement(input, settlement, options), null);
    assert.equal(buildPostKillSettlementWaitDecision(input, { postKillSettlement: settlement }, null, options), null);
    assert.equal(postKillSettlementMovement(input, { ...settlement, x: 100000 }, options)?.active, true);
  });
  return { ok: true, cases: checks.length, checks };
}

if (require.main === module) {
  process.stdout.write(JSON.stringify(runCoinCenterBoundarySelfTest(), null, 2) + '\n');
}

module.exports = { runCoinCenterBoundarySelfTest };
