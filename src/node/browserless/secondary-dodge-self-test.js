'use strict';
const assert = require('assert');
const { buildCombatMovementPlan } = require('./combat-adapter');
const { calculateDodgeDirection } = require('../../strategy/combat-movement');
function runSecondaryDodgeSelfTest() {
  const self = { x: 0, y: 0, vx: 0, vy: 0, hp: 70, stamina_5s_remaining_milli: 5000 };
  const target = { user_id: 2, x: 3200, y: 0, vx: 0, vy: 0, distance: 3200, active: true, combatRole: 'secondary' };
  const options = { nowMs: 10000, combatDistanceAwareDodgeEnabled: true, combatShootDodgeReserveMs: 2600,
    movementExecutionTiming: { sampleCount: 10, medianTicks: 2, p90Ticks: 2 }, distanceAwareDodgeRng: () => 0.5,
    combatTargetState: { opponentBehaviorState: { metrics: { burstSampleCount: 4, shotIntervalCv: 0, realBulletPressure: true },
      dimensions: { shootingPhase: { state: 'idle', nextShotInMs: 0 } } } } };
  const start = buildCombatMovementPlan(self, target, [], options);
  assert(start.distanceAwareDodge.applied && (start.dx || start.dy), 'inactive ownership cannot erase pre-dodge');
  assert.strictEqual(start.dx, start.distanceAwareDodge.direction.dx);
  assert.strictEqual(start.dy, start.distanceAwareDodge.direction.dy);
  const moving = buildCombatMovementPlan({ ...self, vy: 50 }, target, [], options);
  assert.strictEqual(moving.distanceAwareDodge.preDodgeReason, 'preserve-safe-current-motion');
  assert.strictEqual(moving.dx, 0); assert.strictEqual(moving.dy, 1);
  for (const override of [{ leaveActive: true }, { collisionRisk: true }, { combatDistanceAwareDodgeEnabled: false }]) {
    assert(!buildCombatMovementPlan(self, target, [], { ...options, ...override }).distanceAwareDodge.applied);
  }
  assert(!buildCombatMovementPlan({ ...self, stamina_5s_remaining_milli: 3500 }, target, [], options).distanceAwareDodge.applied);
  const bullet = { x: -200, y: 0, distance: 200, incoming: true, speed: 500, direction: { dx: 1, dy: 0 }, timeToImpact: 20, remainingTicks: 1 };
  const forecast = remainingTicks => calculateDodgeDirection(self, [{ ...bullet, remainingTicks }], { hitRadius: 90, commandDelayTicks: 5 });
  const stopped = forecast(1).threatField.find(row => row.dx === 0 && row.dy === 0);
  assert(stopped.directHits === 1 && stopped.rawMinCPA < 0.001, 'swept segment catches between-tick hit');
  const expired = forecast(0.1).threatField.find(row => row.dx === 0 && row.dy === 0);
  assert(expired.directHits === 0, 'projectile lifetime must not round up beyond expiry');
  return { ok: true, cases: 8 };
}
module.exports = { runSecondaryDodgeSelfTest };
if (require.main === module) console.log(JSON.stringify(runSecondaryDodgeSelfTest()));
