'use strict';
const assert = require('assert');
const { buildCombatMovementPlan } = require('./combat-adapter');
const { calculateDodgeDirection, resolveDistanceAwareDodgeCore } = require('../../strategy/combat-movement');
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

  // Two crossing lanes: reversing avoids the later shot but intersects the
  // nearer shot. Both directions have one conservative collision risk; the
  // nearer shot is still avoidable by continuing the current movement.
  const crossing = [
    { bullet_id: 'near', x: 2360, y: 619, direction: { dx: -0.946284, dy: -0.323337 }, timeToImpact: 243 },
    { bullet_id: 'later', x: 4249, y: 1478, direction: { dx: -0.954707, dy: -0.297544 }, timeToImpact: 443 }
  ].map(item => ({ ...item, incoming: true, distance: Math.hypot(item.x, item.y),
    speed: 500, remainingTicks: 20, trajectoryUncertaintyCm: 180 }));
  const crossingOptions = { hitRadius: 90, commandDelayTicks: 2,
    movementExecutionTiming: { sampleCount: 10, medianTicks: 2, p90Ticks: 2 } };
  const crossingSelf = { ...self, vx: -35, vy: 35 };
  const crossingDodge = calculateDodgeDirection(crossingSelf, crossing, crossingOptions);
  const selected = crossingDodge.threatField.find(row => row.dx === crossingDodge.dx && row.dy === crossingDodge.dy);
  const reversal = crossingDodge.threatField.find(row => row.dx === 0 && row.dy === -1);
  assert.strictEqual(selected.directHits, reversal.directHits, 'the comparison has equal total collision risk');
  assert.strictEqual(selected.unavoidableHits, 0, 'a time-budget label cannot justify entering an avoidable near shot');
  assert.strictEqual(reversal.unavoidableHits, 1);
  assert(selected.dangerousBullets.find(item => item.bulletId === 'near').cpa > 380);
  assert(reversal.dangerousBullets.find(item => item.bulletId === 'near').cpa < 90);
  assert(crossingDodge.threatField.every(row => selected.directHits <= row.directHits),
    'avoiding an imminent shot cannot accept more total collisions');
  const crossingPlan = buildCombatMovementPlan(crossingSelf, target, crossing,
    { ...options, ...crossingOptions, combatBulletHitRadiusCm: 90 });
  assert.strictEqual(crossingPlan.ownership.owner, 'emergency-dodge');
  assert.strictEqual(crossingPlan.dy, 1, 'the near-shot-safe direction survives final secondary movement ownership');
  const single = calculateDodgeDirection(crossingSelf, crossing.slice(0, 1), crossingOptions);
  assert.strictEqual(single.threatField[0].directHits, 0, 'fully safe directions retain priority');
  const allHit = [-1, 1].map(dy => ({ dx: 0, dy, directHits: 1, unavoidableHits: 1, minCPA: 0 }));
  const closeInput = { self, target, targetId: '2', engagementId: 'test', nowMs: 10000,
    baseMovement: { dx: 0, dy: 0 }, radialIntentVector: { dx: 0, dy: 0 },
    currentDirection: { dx: 1, dy: 0 }, dodge: { threatField: allHit },
    activeOpponent: true, reactionSlack: { tickMs: 50, commandBudgetMs: 400,
      prospectiveReactionSlackMs: -80, currentShotAvoidability: 'unavoidable', threateningBulletCount: 1 } };
  const left = resolveDistanceAwareDodgeCore(closeInput, { rng: () => 0 });
  const right = resolveDistanceAwareDodgeCore(closeInput, { rng: () => 0.99 });
  assert(left.applied && right.applied && left.direction.dy !== right.direction.dy,
    'random choice explores both equally risky tangents');
  const held = resolveDistanceAwareDodgeCore({ ...closeInput, nowMs: 10100, previousState: left.state }, { rng: () => 0.99 });
  assert.strictEqual(held.direction.dy, left.direction.dy, 'latch prevents per-frame random reversal');
  const changedRisk = resolveDistanceAwareDodgeCore({ ...closeInput, nowMs: 10100, previousState: left.state,
    dodge: { threatField: [{ ...allHit[0], directHits: 2 }, allHit[1]] } }, { rng: () => 0 });
  assert.strictEqual(changedRisk.direction.dy, 1, 'new collision risk immediately invalidates latch');
  for (const extra of [{ lowStamina: true }, { exitActive: true }, { collisionRisk: true },
    { reactionSlack: { ...closeInput.reactionSlack, prospectiveReactionSlackMs: 900 } }]) {
    assert(!resolveDistanceAwareDodgeCore({ ...closeInput, ...extra }, { rng: () => 0 }).applied,
      'budget, safety, and a distant late shot cannot authorize close tangents');
  }
  const unavoidablePlan = buildCombatMovementPlan({ ...self, stamina_5s_remaining_milli: 10000 }, target,
    [{ ...bullet, remainingTicks: 10 }], { ...options, movementExecutionTiming: { sampleCount: 10, medianTicks: 5, p90Ticks: 5 } });
  assert.strictEqual(unavoidablePlan.distanceAwareDodge.preDodgeReason, 'unavoidable-close-tangent');
  assert.strictEqual(unavoidablePlan.dy, unavoidablePlan.distanceAwareDodge.direction.dy,
    'selected tangent survives final movement arbitration');
  return { ok: true, cases: 19 };
}
module.exports = { runSecondaryDodgeSelfTest };
if (require.main === module) console.log(JSON.stringify(runSecondaryDodgeSelfTest()));
