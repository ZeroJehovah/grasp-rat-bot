'use strict';

const assert = require('assert');
const {
  estimateAim
} = require('../src/node/browserless/combat-adapter');
const {
  determineCombatFireState,
  FIRE_STATE
} = require('../src/strategy/combat-fire-discipline');
const {
  movingTargetStopRouteRejectedCore
} = require('../src/strategy/combat-shot-coverage');

function dynamicFixture() {
  const history = [];
  let x = 10000;
  let y = 10000;
  for (let index = 0; index < 40; index += 1) {
    const lateral = index % 8 < 4 ? 50 : -50;
    x += lateral;
    y += index % 6 < 3 ? 28 : -28;
    history.push({
      at: index * 50,
      x,
      y,
      vx: lateral,
      vy: index % 6 < 3 ? 28 : -28,
      selfX: 0,
      selfY: 10000,
      distance: Math.hypot(x, y - 10000)
    });
  }
  const behavior = {
    mode: 'zigzag-strafe',
    confidence: 0.95,
    metrics: {
      sampleCount: history.length,
      durationMs: 3900,
      movementTransitions: {
        transitionCount: 12,
        confidence: 0.9,
        currentState: 'east',
        next: [
          { state: 'west', probability: 0.55 },
          { state: 'east', probability: 0.45 }
        ],
        contextKey: 'fixture-zigzag'
      }
    },
    dimensions: {
      controlStyle: {
        state: 'periodic-script',
        confidence: 0.8
      }
    },
    responsePolicy: {
      name: 'zigzag-flip-burst',
      aimLeadScale: 1
    }
  };
  return {
    self: {
      user_id: 1,
      x: 0,
      y: 10000,
      vx: 0,
      vy: 0,
      moving: false,
      stamina_5s_remaining_milli: 10000,
      hp: 100,
      max_hp: 100
    },
    target: {
      user_id: 32551,
      x,
      y,
      vx: 50,
      vy: 28,
      moving: true,
      distance: Math.hypot(x, y - 10000),
      hp: 100,
      max_hp: 100
    },
    combatTargetState: {
      motionSamples: history,
      opponentBehaviorState: behavior,
      noDamageMs: 5000,
      provenHitRate: 0,
      fireRiskClassification: { highEntropy: true }
    }
  };
}

function run() {
  const fixture = dynamicFixture();
  const aim = estimateAim(fixture.self, fixture.target, {
    combatTargetState: fixture.combatTargetState,
    observedTick: 2000,
    executionTiming: {
      medianTicks: 5,
      p90Ticks: 5,
      madTicks: 0,
      source: 'regression-fixture'
    },
    actualShots: 0,
    nowMs: 2000
  });
  assert.strictEqual(aim.ok, true, 'dynamic fixture must produce an aim');
  assert.strictEqual(aim.fireReachability?.actualAimPoint?.reachable, true, 'final aim must be reachable');
  assert.notStrictEqual(aim.routeCoverage?.selected, 'stop', 'moving target must not select stop');
  const stop = aim.routeCoverage?.candidates?.find(candidate => candidate.hypothesis === 'stop');
  assert.ok(stop, 'dynamic fixture should retain stop as a diagnostic candidate');
  assert.ok(
    Math.hypot(Number(aim.x) - Number(stop.x), Number(aim.y) - Number(stop.y)) > 90,
    'wire aim must be separated from the stop candidate'
  );
  assert.strictEqual(aim.trajectoryAimProof?.valid, true, 'final dynamic aim must have a valid CPA proof');
  assert.strictEqual(aim.routeCoverage?.stopRouteRejected, true, 'stop rejection must be logged');

  const stationaryAim = estimateAim(
    fixture.self,
    { ...fixture.target, x: 10000, y: 10000, vx: 0, vy: 0, moving: false },
    {
      combatTargetState: {
        motionSamples: [],
        opponentBehaviorState: { mode: 'stationary', confidence: 0.95 }
      },
      observedTick: 2000,
      executionTiming: { medianTicks: 5, p90Ticks: 5, madTicks: 0 },
      nowMs: 2000
    }
  );
  assert.strictEqual(stationaryAim.mode, 'exact', 'stationary target should remain exact aim');
  assert.strictEqual(
    movingTargetStopRouteRejectedCore({ hypothesis: 'stop', moving: false, targetSpeed: 50 }),
    false,
    'stationary observations must not be over-restricted'
  );

  const normalFire = determineCombatFireState(fixture.self, fixture.target, {
    hardReserveMs: 1800,
    dodgeReserveMs: 3800,
    shotCostMs: 500,
    dodgeActionCostMs: 0
  });
  assert.strictEqual(normalFire.state, FIRE_STATE.NORMAL, 'healthy target engagement keeps normal fire');
  const dodgePriorityFire = determineCombatFireState(
    { ...fixture.self, stamina_5s_remaining_milli: 3905 },
    fixture.target,
    {
      closePressure: true,
      closePressureAttack: true,
      hardReserveMs: 1800,
      dodgeReserveMs: 2600,
      closePressureReserveMs: 2600,
      shotCostMs: 500,
      dodgeActionCostMs: 1000
    }
  );
  assert.strictEqual(dodgePriorityFire.state, FIRE_STATE.PAUSED, 'shot must yield to the same-frame dodge reserve');
  assert.strictEqual(dodgePriorityFire.reason, 'close-pressure-movement-reserve');
  assert.strictEqual(dodgePriorityFire.requiredStaminaMs, 4100);

  return {
    accepted: true,
    dynamicAim: {
      selected: aim.routeCoverage?.selected,
      stopRouteRejected: aim.routeCoverage?.stopRouteRejected,
      trajectoryProof: aim.trajectoryAimProof?.reason,
      actualAim: { x: aim.x, y: aim.y }
    },
    stationaryAim: stationaryAim.mode,
    fire: {
      normal: normalFire.reason,
      dodgePriority: dodgePriorityFire.reason,
      requiredStaminaMs: dodgePriorityFire.requiredStaminaMs
    }
  };
}

if (require.main === module) {
  console.log(JSON.stringify(run(), null, 2));
}

module.exports = { dynamicFixture, run };
