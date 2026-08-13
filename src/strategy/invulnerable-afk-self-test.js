'use strict';

const assert = require('assert');
const { estimateEightWayRouteCore } = require('./eight-way-route-eta');
const { evaluateAfkFirePolicyCore } = require('./afk-fire-policy');
const { remoteProfitApproachEtaMs } = require('./remote-profit-targets');

function runInvulnerableAfkSelfTest() {
  const axis = estimateEightWayRouteCore({ x: 0, y: 0 }, { x: 10000, y: 0 }, {
    arrivalRadiusCm: 1000,
    axisSpeedCmPerSec: 950,
    diagonalSpeedCmPerSec: 940,
    segmentOverheadMs: 120
  });
  assert.strictEqual(axis.segmentCount, 1);
  assert.strictEqual(axis.cardinalDistanceCm, 9000);

  const diagonal = estimateEightWayRouteCore({ x: 0, y: 0 }, { x: 10000, y: 10000 }, {
    arrivalRadiusCm: 1000,
    axisSpeedCmPerSec: 950,
    diagonalSpeedCmPerSec: 940,
    segmentOverheadMs: 120
  });
  assert.strictEqual(diagonal.segmentCount, 1);
  assert.strictEqual(diagonal.cardinalDistanceCm, 0);

  const mixed = estimateEightWayRouteCore({ x: 0, y: 0 }, { x: 10000, y: 5000 }, {
    arrivalRadiusCm: 1000,
    axisSpeedCmPerSec: 950,
    diagonalSpeedCmPerSec: 940,
    segmentOverheadMs: 120
  });
  assert.strictEqual(mixed.segmentCount, 2);
  const mixedWithoutSwitch = mixed.diagonalDistanceCm * 1000 / 940
    + mixed.cardinalDistanceCm * 1000 / 950;
  assert.ok(Math.abs(mixed.etaMs - mixedWithoutSwitch - 120) < 3);

  const arrived = estimateEightWayRouteCore({ x: 0, y: 0 }, { x: 500, y: 0 }, {
    arrivalRadiusCm: 1000
  });
  assert.strictEqual(arrived.etaMs, 0);
  assert.strictEqual(arrived.segmentCount, 0);

  const fallback = estimateEightWayRouteCore({ distance: 10000 }, {}, {
    arrivalRadiusCm: 1000,
    axisSpeedCmPerSec: 950
  });
  assert.strictEqual(fallback.source, 'distance-fallback');
  assert.strictEqual(fallback.routeDistanceCm, 9000);

  const remoteEta = remoteProfitApproachEtaMs(10000, {
    invulnerableAfkApproachDistanceCm: 1000,
    invulnerableAxisSpeedCmPerSec: 950,
    invulnerableDiagonalSpeedCmPerSec: 940,
    invulnerableRouteSegmentOverheadMs: 120
  }, 'high-drop-afk', { x: 0, y: 0 }, { x: 8000, y: 6000 });
  assert.ok(remoteEta > 9500);

  const delayed = evaluateAfkFirePolicyCore({
    self: { x: 0, y: 0 },
    target: { x: 10000, y: 0 },
    distanceCm: 10000,
    hp: 20,
    pendingOwnDamageHp: 3,
    externalDamageRateHpPerSec: 0
  }, {
    fullRangeCm: 1000,
    maxRangeCm: 14500,
    ownDamageRateHpPerSec: 3,
    shotDamageHp: 3,
    projectileSpeedCmPerSec: 10000,
    axisSpeedCmPerSec: 950,
    diagonalSpeedCmPerSec: 940,
    segmentOverheadMs: 120
  });
  assert.strictEqual(delayed.authorized, false);
  assert.strictEqual(delayed.reason, 'afk-fire-delay-own-kill-before-near');
  assert.strictEqual(delayed.externalDamageRateHpPerSec, 0);

  const combinedDelayed = evaluateAfkFirePolicyCore({
    self: { x: 0, y: 0 },
    target: { x: 10000, y: 0 },
    distanceCm: 10000,
    hp: 45,
    pendingOwnDamageHp: 0,
    externalDamageRateHpPerSec: 2.05
  }, {
    fullRangeCm: 1000,
    maxRangeCm: 14500,
    ownDamageRateHpPerSec: 3,
    shotDamageHp: 3,
    projectileSpeedCmPerSec: 10000,
    axisSpeedCmPerSec: 950,
    diagonalSpeedCmPerSec: 940,
    segmentOverheadMs: 120
  });
  assert.strictEqual(combinedDelayed.authorized, false);
  assert.strictEqual(combinedDelayed.reason, 'afk-fire-delay-external-kill-before-near');
  assert.ok(combinedDelayed.ownProjectedBeforeNear < combinedDelayed.remainingHp);
  assert.ok(combinedDelayed.combinedProjectedBeforeNear >= combinedDelayed.remainingHp - 3);

  const near = evaluateAfkFirePolicyCore({
    self: { x: 0, y: 0 },
    target: { x: 900, y: 0 },
    distanceCm: 900,
    hp: 3,
    pendingOwnDamageHp: 0,
    externalDamageRateHpPerSec: 0
  }, { fullRangeCm: 1000, maxRangeCm: 14500 });
  assert.strictEqual(near.authorized, true);

  return { ok: true, cases: 9 };
}

if (require.main === module) {
  try {
    process.stdout.write(JSON.stringify(runInvulnerableAfkSelfTest()) + '\n');
  } catch (error) {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  }
}

module.exports = { runInvulnerableAfkSelfTest };
