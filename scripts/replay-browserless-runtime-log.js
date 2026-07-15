#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { StringDecoder } = require('string_decoder');
const path = require('path');
const { forEachJsonlEntry } = require('./browserless-log-summary');
const { estimateAim } = require('../src/node/browserless/combat-adapter');
const { buildLowHpRecoveryThreatExitDecision } = require('../src/node/browserless/decision-adapter');
const { evaluateBrowserlessSafety } = require('../src/node/browserless/safety-controller');
const { actionPriorityBand } = require('../src/strategy/action-priority');
const {
  evaluateConfirmedCombatHpExitCore,
  evaluateCombatHpExitCore
} = require('../src/strategy/combat-exit');
const { calculateDodgeDirection, pickSafeClosingDodgeCore } = require('../src/strategy/combat-movement');
const {
  combatEdgePressureDecisionCore,
  combatEscapeDecisionCore
} = require('../src/strategy/combat-target-selection');
const { opponentResponsePolicyCore, updateOpponentBehaviorStateCore } = require('../src/strategy/opponent-behavior');

function parseArgs(argv) {
  const options = {
    file: '',
    startLine: 1,
    endLine: Infinity,
    targetId: '',
    targetName: '',
    mode: 'combat',
    hitRadius: 90,
    controlIntervalMs: 160,
    minImprovementPct: 0,
    expectNewExit: false,
    trustEasyKillBeforeDamage: false,
    executionDelayTicks: 5
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--file') options.file = argv[++index] || '';
    else if (arg === '--start-line') options.startLine = Number(argv[++index] || 1);
    else if (arg === '--end-line') options.endLine = Number(argv[++index] || Infinity);
    else if (arg === '--target-id') options.targetId = String(argv[++index] || '');
    else if (arg === '--target-name') options.targetName = String(argv[++index] || '');
    else if (arg === '--mode') options.mode = String(argv[++index] || 'combat');
    else if (arg === '--hit-radius') options.hitRadius = Number(argv[++index] || 90);
    else if (arg === '--control-interval-ms') options.controlIntervalMs = Number(argv[++index] || 160);
    else if (arg === '--min-improvement-pct') options.minImprovementPct = Number(argv[++index] || 0);
    else if (arg === '--expect-new-exit') options.expectNewExit = true;
    else if (arg === '--trust-easy-kill-before-damage') options.trustEasyKillBeforeDamage = true;
    else if (arg === '--execution-delay-ticks') options.executionDelayTicks = Number(argv[++index] || 5);
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!options.file) throw new Error('--file is required');
  return options;
}

function selectedEntries(options) {
  const entries = [];
  const descriptor = fs.openSync(options.file, 'r');
  const decoder = new StringDecoder('utf8');
  const buffer = Buffer.allocUnsafe(64 * 1024);
  let carry = '';
  let line = 0;
  let finished = false;
  const consume = raw => {
    line += 1;
    if (line > options.endLine) {
      finished = true;
      return;
    }
    if (!raw || line < options.startLine) return;
    const entry = JSON.parse(raw);
    entries.push({ line, entry, detail: entry.detail || {} });
  };
  try {
    while (!finished) {
      const bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (!bytesRead) break;
      carry += decoder.write(buffer.subarray(0, bytesRead));
      let newline = carry.indexOf('\n');
      while (newline >= 0 && !finished) {
        consume(carry.slice(0, newline));
        carry = carry.slice(newline + 1);
        newline = carry.indexOf('\n');
      }
    }
    if (!finished) {
      carry += decoder.end();
      if (carry) consume(carry);
    }
  } finally {
    fs.closeSync(descriptor);
  }
  return entries;
}

function aimMiss(self, target, aim) {
  if (!self || !target || !aim) return Infinity;
  const ticks = Math.hypot(Number(aim.x) - Number(self.x), Number(aim.y) - Number(self.y)) / 500 + 2;
  const futureX = Number(target.x) + (Number(target.vx) || 0) * ticks;
  const futureY = Number(target.y) + (Number(target.vy) || 0) * ticks;
  return Math.hypot(Number(aim.x) - futureX, Number(aim.y) - futureY);
}

function actualFutureAimMiss(rows, index, aim) {
  const current = rows[index];
  const self = current?.detail?.self;
  const target = current?.detail?.target;
  if (!self || !target || !aim) return Infinity;
  const flightMs = Number(aim.flightTicks) > 0
    ? Number(aim.flightTicks) * 50
    : (Math.hypot(Number(aim.x) - Number(self.x), Number(aim.y) - Number(self.y)) / 500 + 2) * 50;
  const targetAt = Date.parse(current.entry.at) + Math.max(0, flightMs);
  let future = null;
  for (let cursor = index; cursor < rows.length; cursor += 1) {
    const at = Date.parse(rows[cursor].entry.at);
    if (at >= targetAt) {
      future = rows[cursor].detail.target;
      break;
    }
  }
  if (!future) return aimMiss(self, target, aim);
  return Math.hypot(Number(aim.x) - Number(future.x), Number(aim.y) - Number(future.y));
}

function percentile(values, ratio) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return sorted[Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1))];
}

function targetAtTick(rows, tick) {
  let before = null;
  let after = null;
  for (const row of rows) {
    const rowTick = Number(row.detail.tick);
    if (!Number.isFinite(rowTick)) continue;
    if (rowTick <= tick) before = row;
    if (rowTick >= tick) { after = row; break; }
  }
  if (!before) return after?.detail?.target || null;
  if (!after || Number(after.detail.tick) === Number(before.detail.tick)) return before.detail.target || null;
  const ratio = (tick - Number(before.detail.tick)) / (Number(after.detail.tick) - Number(before.detail.tick));
  return {
    x: Number(before.detail.target?.x) + (Number(after.detail.target?.x) - Number(before.detail.target?.x)) * ratio,
    y: Number(before.detail.target?.y) + (Number(after.detail.target?.y) - Number(before.detail.target?.y)) * ratio
  };
}

function bulletCorridorMiss(rows, ack, aim = null) {
  const startX = Number(ack.start_x);
  const startY = Number(ack.start_y);
  let dx = Number(ack.dir_x_micros) / 1000000;
  let dy = Number(ack.dir_y_micros) / 1000000;
  if (aim) {
    const length = Math.hypot(Number(aim.x) - startX, Number(aim.y) - startY);
    if (length > 0) {
      dx = (Number(aim.x) - startX) / length;
      dy = (Number(aim.y) - startY) / length;
    }
  }
  const speed = Math.max(1, Number(ack.speed_per_tick || 500));
  const createdTick = Number(ack.created_tick);
  const expireTick = Number(ack.expire_tick || createdTick + 30);
  let minMiss = Infinity;
  for (let tick = createdTick; tick <= expireTick; tick += 1) {
    const target = targetAtTick(rows, tick);
    if (!target) continue;
    const bulletX = startX + dx * speed * (tick - createdTick);
    const bulletY = startY + dy * speed * (tick - createdTick);
    minMiss = Math.min(minMiss, Math.hypot(bulletX - Number(target.x), bulletY - Number(target.y)));
  }
  return minMiss;
}

function confirmedShotsForRows(options, rows) {
  if (!rows.length) return [];
  const wsFile = path.join(path.dirname(options.file), 'ws.jsonl');
  if (!fs.existsSync(wsFile)) return [];
  const firstAt = Date.parse(rows[0].entry.at) - 3000;
  const lastAt = Date.parse(rows[rows.length - 1].entry.at) + 3000;
  const selfId = String(rows[0].detail.self?.userId ?? '');
  const shots = [];
  forEachJsonlEntry(wsFile, entry => {
    const at = Date.parse(entry?.at || '');
    if (!Number.isFinite(at) || at < firstAt || at > lastAt) return;
    const ack = entry?.detail?.decodedSummary?.ack;
    if (!ack || String(ack.owner_user_id ?? '') !== selfId) return;
    shots.push({ at, ack });
  });
  return shots;
}

function combatDamageEvents(rows) {
  const target = [];
  const self = [];
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1].detail || {};
    const current = rows[index].detail || {};
    const tick = Number(current.tick);
    const at = Date.parse(rows[index].entry.at);
    const targetLoss = Number(previous.target?.hp) - Number(current.target?.hp);
    const selfLoss = Number(previous.self?.hp) - Number(current.self?.hp);
    if (Number.isFinite(targetLoss) && targetLoss > 0) target.push({ tick, at, damage: targetLoss });
    if (Number.isFinite(selfLoss) && selfLoss > 0) self.push({ tick, at, damage: selfLoss });
  }
  return { target, self };
}

function expectedBulletArrivalTick(rows, ack) {
  const createdTick = Number(ack.created_tick);
  const speed = Math.max(1, Number(ack.speed_per_tick || 500));
  const target = targetAtTick(rows, createdTick);
  if (!target || !Number.isFinite(createdTick)) return createdTick;
  const distance = Math.hypot(Number(target.x) - Number(ack.start_x), Number(target.y) - Number(ack.start_y));
  return createdTick + distance / speed;
}

function attributeTargetDamageToShots(rows, shotEvaluations, damageEvents, options = {}) {
  const lagBeforeTicks = Math.max(0, Number(options.lagBeforeTicks ?? 2));
  const lagAfterTicks = Math.max(lagBeforeTicks, Number(options.lagAfterTicks ?? 12));
  const units = [];
  for (const event of damageEvents || []) {
    let remaining = Math.max(0, Number(event.damage || 0));
    while (remaining > 0) {
      const damage = Math.min(3, remaining);
      units.push({ ...event, damage });
      remaining -= damage;
    }
  }
  const available = new Set(shotEvaluations.map((_, index) => index));
  const attributions = [];
  for (const unit of units) {
    let best = null;
    for (const index of available) {
      const shot = shotEvaluations[index];
      const lagTicks = Number(unit.tick) - Number(shot.expectedArrivalTick);
      if (!Number.isFinite(lagTicks) || lagTicks < -lagBeforeTicks || lagTicks > lagAfterTicks) continue;
      const score = Math.abs(lagTicks) + Math.min(5, Number(shot.baselineMiss || Infinity) / Math.max(1, Number(options.hitRadius || 90)));
      if (!best || score < best.score) best = { index, shot, lagTicks, score };
    }
    if (!best) continue;
    available.delete(best.index);
    attributions.push({
      bulletId: best.shot.shot.ack.bullet_id ?? null,
      createdTick: Number(best.shot.shot.ack.created_tick),
      expectedArrivalTick: Number(best.shot.expectedArrivalTick.toFixed(2)),
      damageTick: unit.tick,
      lagTicks: Number(best.lagTicks.toFixed(2)),
      damage: unit.damage,
      baselineMissCm: Number.isFinite(best.shot.baselineMiss) ? Number(best.shot.baselineMiss.toFixed(1)) : null
    });
  }
  return attributions;
}

function replayCombat(options) {
  const rows = selectedEntries(options).filter(({ detail }) => String(detail.target?.userId ?? '') === options.targetId);
  const confirmedShots = confirmedShotsForRows(options, rows);
  const state = { motionSamples: [] };
  const baselineMisses = [];
  const improvedMisses = [];
  const shotEvaluations = [];
  let baselineFirstHitAt = 0;
  let improvedFirstHitAt = 0;
  for (const shot of confirmedShots) {
    const createdTick = Number(shot.ack.created_tick);
    const rowIndex = Math.max(0, rows.findLastIndex(row => Number(row.detail.tick) <= createdTick));
    const row = rows[rowIndex];
    const history = rows.slice(Math.max(0, rowIndex - 40), rowIndex + 1).map(item => ({
      at: Date.parse(item.entry.at),
      x: item.detail.target?.x,
      y: item.detail.target?.y,
      vx: item.detail.target?.vx,
      vy: item.detail.target?.vy,
      selfX: item.detail.self?.x,
      selfY: item.detail.self?.y,
      distance: item.detail.target?.distance
    }));
    state.motionSamples = history;
    let replayBehavior = null;
    for (const sample of history) {
      replayBehavior = updateOpponentBehaviorStateCore(replayBehavior, {
        ...sample,
        firing: Boolean(row.detail.target?.firing),
        realBulletPressure: Boolean(row.detail.movement?.dodge?.threatField?.length),
        selfHp: row.detail.self?.hp,
        targetHp: row.detail.target?.hp
      }, { nowMs: sample.at, windowMs: 12000 });
    }
    state.opponentBehaviorState = row.detail.behavior?.mode
      ? {
          ...replayBehavior,
          mode: row.detail.behavior.mode,
          confidence: row.detail.behavior.confidence,
          recentHitRate: row.detail.behavior.recentHitRate,
          responsePolicy: opponentResponsePolicyCore(row.detail.behavior.mode, {
            distance: row.detail.target?.distance,
            nowMs: Date.parse(row.entry.at)
          })
        }
      : replayBehavior;
    state.provenHitRate = Math.max(Number(state.provenHitRate || 0), Number(row.detail.behavior?.recentHitRate || 0));
    state.noDamageMs = Number(row.detail.aim?.noDamageMs || 0);
    const improved = estimateAim(row.detail.self, row.detail.target, {
      combatTargetState: state,
      observedTick: row.detail.tick,
      executionTiming: {
        medianTicks: options.executionDelayTicks,
        p90Ticks: options.executionDelayTicks,
        madTicks: 0,
        source: 'july-14-confirmed-shoot-baseline'
      }
    });
    const baselineMiss = bulletCorridorMiss(rows, shot.ack);
    const improvedMiss = bulletCorridorMiss(rows, shot.ack, improved);
    baselineMisses.push(baselineMiss);
    improvedMisses.push(improvedMiss);
    shotEvaluations.push({
      shot,
      baselineMiss,
      improvedMiss,
      expectedArrivalTick: expectedBulletArrivalTick(rows, shot.ack)
    });
    if (!baselineFirstHitAt && baselineMiss <= options.hitRadius) baselineFirstHitAt = shot.at;
    if (!improvedFirstHitAt && improvedMiss <= options.hitRadius) improvedFirstHitAt = shot.at;
  }
  const startedAt = rows.length ? Date.parse(rows[0].entry.at) : 0;
  const baselineHits = baselineMisses.filter(value => value <= options.hitRadius).length;
  const improvedHits = improvedMisses.filter(value => value <= options.hitRadius).length;
  const stats = values => ({
    mean: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
    p50: percentile(values, 0.5),
    p90: percentile(values, 0.9),
    p95: percentile(values, 0.95)
  });
  const baselineStats = stats(baselineMisses);
  const improvedStats = stats(improvedMisses);
  const damageEvents = combatDamageEvents(rows);
  const damageAttributions = attributeTargetDamageToShots(rows, shotEvaluations, damageEvents.target, {
    hitRadius: options.hitRadius
  });
  const observedTargetDamage = damageEvents.target.reduce((sum, event) => sum + Number(event.damage || 0), 0);
  const associatedTargetDamage = damageAttributions.reduce((sum, event) => sum + Number(event.damage || 0), 0);
  const observedSelfDamage = damageEvents.self.reduce((sum, event) => sum + Number(event.damage || 0), 0);
  const firstObservedDamageAt = damageEvents.target[0]?.at || 0;
  const firstMetrics = rows[0]?.detail?.metrics || {};
  const lastMetrics = rows[rows.length - 1]?.detail?.metrics || {};
  const metricDelta = field => {
    const first = Number(firstMetrics[field]);
    const last = Number(lastMetrics[field]);
    return Number.isFinite(first) && Number.isFinite(last) ? Math.max(0, last - first) : null;
  };
  const totalStaminaCost = metricDelta('totalStaminaSpent');
  const shootingStaminaCost = metricDelta('shootingStaminaSpent') ?? confirmedShots.length * 500;
  const result = {
    mode: 'combat',
    targetId: options.targetId,
    lines: `${options.startLine}-${options.endLine}`,
    frames: rows.length,
    baseline: {
      confirmedShots: confirmedShots.length,
      estimatedHits: baselineHits,
      observedAssociatedHits: damageAttributions.length,
      observedTargetDamage,
      associatedTargetDamage,
      estimatedTargetDamage: baselineHits * 3,
      selfDamage: observedSelfDamage,
      totalStaminaCost,
      shootingStaminaCost,
      meanAimMissCm: baselineStats.mean === null ? null : Number(baselineStats.mean.toFixed(1)),
      p50AimMissCm: baselineStats.p50,
      p90AimMissCm: baselineStats.p90,
      p95AimMissCm: baselineStats.p95,
      firstObservedDamageDelayMs: firstObservedDamageAt ? firstObservedDamageAt - startedAt : null,
      firstEstimatedDamageDelayMs: baselineFirstHitAt ? baselineFirstHitAt - startedAt : null
    },
    improved: {
      confirmedShots: confirmedShots.length,
      estimatedHits: improvedHits,
      observedTargetDamage,
      estimatedTargetDamage: improvedHits * 3,
      selfDamage: observedSelfDamage,
      totalStaminaCost,
      shootingStaminaCost,
      meanAimMissCm: improvedStats.mean === null ? null : Number(improvedStats.mean.toFixed(1)),
      p50AimMissCm: improvedStats.p50,
      p90AimMissCm: improvedStats.p90,
      p95AimMissCm: improvedStats.p95,
      firstObservedDamageDelayMs: firstObservedDamageAt ? firstObservedDamageAt - startedAt : null,
      firstEstimatedDamageDelayMs: improvedFirstHitAt ? improvedFirstHitAt - startedAt : null
    },
    damageAttribution: {
      lagWindowTicks: { before: 2, after: 12 },
      targetDamageEvents: damageEvents.target.length,
      associatedShotCount: damageAttributions.length,
      associatedTargetDamage,
      samples: damageAttributions.slice(0, 12)
    }
  };
  result.improved.accepted = rows.length > 0 && confirmedShots.length > 0
    && (improvedHits > baselineHits
      || result.improved.meanAimMissCm < result.baseline.meanAimMissCm
      || (result.improved.firstEstimatedDamageDelayMs !== null
        && (result.baseline.firstEstimatedDamageDelayMs === null
          || result.improved.firstEstimatedDamageDelayMs < result.baseline.firstEstimatedDamageDelayMs)));
  return result;
}

function fitLegacyThreatImpactPoint(detail, threatField, tickMs = 50, moveSpeedPerTick = 50) {
  const self = detail?.self;
  if (!self || !Array.isArray(threatField) || threatField.length < 3) return null;
  const usable = threatField
    .map(item => {
      const minTTI = Number(item?.minTTI);
      const radius = Number(item?.minCPA);
      const dx = Number(item?.dx);
      const dy = Number(item?.dy);
      if (![minTTI, radius, dx, dy].every(Number.isFinite) || minTTI <= 0 || radius < 0) return null;
      const futureTicks = minTTI / tickMs;
      const diagonalScale = dx && dy ? Math.SQRT1_2 : 1;
      return {
        item,
        x: Number(self.x || 0) + dx * diagonalScale * moveSpeedPerTick * futureTicks,
        y: Number(self.y || 0) + dy * diagonalScale * moveSpeedPerTick * futureTicks,
        radius
      };
    })
    .filter(Boolean);
  if (usable.length < 3) return null;
  const reference = usable[0];
  let aa = 0;
  let ab = 0;
  let bb = 0;
  let ac = 0;
  let bc = 0;
  for (let index = 1; index < usable.length; index += 1) {
    const point = usable[index];
    const a = 2 * (point.x - reference.x);
    const b = 2 * (point.y - reference.y);
    const c = point.x * point.x + point.y * point.y
      - reference.x * reference.x - reference.y * reference.y
      - point.radius * point.radius + reference.radius * reference.radius;
    aa += a * a;
    ab += a * b;
    bb += b * b;
    ac += a * c;
    bc += b * c;
  }
  const determinant = aa * bb - ab * ab;
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-6) return null;
  const x = (ac * bb - bc * ab) / determinant;
  const y = (bc * aa - ac * ab) / determinant;
  if (![x, y].every(Number.isFinite)) return null;
  const residuals = usable.map(point => Math.abs(Math.hypot(x - point.x, y - point.y) - point.radius));
  return {
    x,
    y,
    fitRmsCm: Math.sqrt(residuals.reduce((sum, value) => sum + value * value, 0) / residuals.length),
    fitMaxCm: Math.max(...residuals),
    sampleCount: usable.length
  };
}

function reconstructDodgeHit(rows, hitIndex, options = {}) {
  const tickMs = 50;
  const bulletSpeed = 500;
  const hitRow = rows[hitIndex];
  const hitAt = Date.parse(hitRow.entry.at);
  const hitSelf = hitRow.detail?.self;
  if (!hitSelf || !Number.isFinite(hitAt)) return null;
  const candidates = [];
  for (let cursor = hitIndex - 1; cursor >= 0; cursor -= 1) {
    const row = rows[cursor];
    const observedAt = Date.parse(row.entry.at);
    const elapsedMs = hitAt - observedAt;
    if (elapsedMs > 1600) break;
    if (elapsedMs <= 0 || row.detail?.runId !== hitRow.detail?.runId) continue;
    const field = row.detail?.movement?.dodge?.threatField;
    if (!Array.isArray(field) || field.length < 3 || !row.detail?.self) continue;
    const selectedDx = Number(row.detail.movement?.dx || 0);
    const selectedDy = Number(row.detail.movement?.dy || 0);
    const legacySelected = field.find(item => Number(item.dx) === selectedDx && Number(item.dy) === selectedDy) || null;
    if (!legacySelected || Number(legacySelected.directHits || 0) !== 0) continue;
    const fit = fitLegacyThreatImpactPoint(row.detail, field, tickMs, 50);
    if (!fit || fit.fitRmsCm > 120 || fit.fitMaxCm > 260) continue;
    const minTTIMs = Number(legacySelected.minTTI);
    if (!Number.isFinite(minTTIMs) || minTTIMs <= 0) continue;
    const elapsedTicks = elapsedMs / tickMs;
    const staticImpactTicks = minTTIMs / tickMs;
    const postStaticTicks = elapsedTicks - staticImpactTicks;
    if (Math.abs(postStaticTicks) < 0.25) continue;
    const impactDeltaX = Number(hitSelf.x) - fit.x;
    const impactDeltaY = Number(hitSelf.y) - fit.y;
    const impactDelta = Math.hypot(impactDeltaX, impactDeltaY);
    if (!Number.isFinite(impactDelta) || impactDelta <= 0) continue;
    const expectedTravel = Math.abs(postStaticTicks) * bulletSpeed;
    const kinematicErrorCm = Math.abs(impactDelta - expectedTravel);
    if (kinematicErrorCm > 260) continue;
    const sign = Math.sign(postStaticTicks);
    const direction = {
      dx: sign * impactDeltaX / impactDelta,
      dy: sign * impactDeltaY / impactDelta
    };
    const bullet = {
      incoming: true,
      x: fit.x - direction.dx * bulletSpeed * staticImpactTicks,
      y: fit.y - direction.dy * bulletSpeed * staticImpactTicks,
      distance: Math.hypot(
        Number(row.detail.self.x) - (fit.x - direction.dx * bulletSpeed * staticImpactTicks),
        Number(row.detail.self.y) - (fit.y - direction.dy * bulletSpeed * staticImpactTicks)
      ),
      cpa: Number(legacySelected.minCPA),
      timeToImpact: minTTIMs,
      speed: bulletSpeed,
      direction,
      remainingTicks: Math.max(1, Math.ceil(elapsedTicks))
    };
    const replayed = calculateDodgeDirection(row.detail.self, [bullet], {
      moveSpeedPerTick: 50,
      tickMs,
      hitRadius: 200,
      commandDelayTicks: Number(options.executionDelayTicks || 5),
      maxTrajectoryTicks: 60,
      target: row.detail.target
    });
    const replayedSelected = replayed.threatField?.find(item => Number(item.dx) === selectedDx && Number(item.dy) === selectedDy) || null;
    if (!replayedSelected) continue;
    candidates.push({
      row,
      elapsedMs,
      minTTIMs,
      postStaticMs: elapsedMs - minTTIMs,
      legacySelected,
      replayedSelected,
      replayed,
      fit,
      kinematicErrorCm,
      qualityScore: fit.fitRmsCm + kinematicErrorCm
    });
  }
  if (!candidates.length) return null;
  const reliable = candidates.filter(candidate => candidate.elapsedMs >= candidate.minTTIMs - tickMs);
  const pool = reliable.length ? reliable : candidates;
  return pool.sort((a, b) => Date.parse(a.row.entry.at) - Date.parse(b.row.entry.at)
    || a.qualityScore - b.qualityScore)[0];
}

function replayDodge(options) {
  const rows = selectedEntries(options).filter(({ detail }) => !options.targetId
    || String(detail.target?.userId ?? '') === options.targetId);
  const reactionBudgetMs = Math.max(0, Number(options.executionDelayTicks || 5) * 50 + 50 + 100);
  let hitEvents = 0;
  let eventsWithThreatEvidence = 0;
  let reconstructedEvents = 0;
  let oldFalseSafe = 0;
  let newFalseSafe = 0;
  let unavoidable = 0;
  let oldFalseSafeUnavoidable = 0;
  let recoveredByFullTrajectory = 0;
  let recoveredAfterStaticTti = 0;
  let recoveredBeforeStaticTti = 0;
  let reconstructedOldFalseSafe = 0;
  const samples = [];
  const fullTrajectorySamples = [];
  for (let index = 1; index < rows.length; index += 1) {
    const previousHp = Number(rows[index - 1].detail.self?.hp);
    const currentHp = Number(rows[index].detail.self?.hp);
    if (!Number.isFinite(previousHp) || !Number.isFinite(currentHp) || currentHp >= previousHp) continue;
    hitEvents += 1;
    const hitAt = Date.parse(rows[index].entry.at);
    let threat = null;
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      if (hitAt - Date.parse(rows[cursor].entry.at) > 750) break;
      const field = rows[cursor].detail.movement?.dodge?.threatField;
      if (!Array.isArray(field) || !field.length) continue;
      const dx = Number(rows[cursor].detail.movement?.dx || 0);
      const dy = Number(rows[cursor].detail.movement?.dy || 0);
      threat = field.find(item => Number(item.dx) === dx && Number(item.dy) === dy) || field[0];
      if (threat) break;
    }
    if (!threat) continue;
    eventsWithThreatEvidence += 1;
    const oldSafe = Number(threat.directHits || 0) === 0;
    const currentUnavoidable = Number(threat.minTTI || Infinity) < reactionBudgetMs;
    if (oldSafe) oldFalseSafe += 1;
    if (currentUnavoidable) unavoidable += 1;
    const reconstruction = oldSafe ? reconstructDodgeHit(rows, index, options) : null;
    const effectiveUnavoidable = oldSafe && Number(
      reconstruction?.minTTIMs ?? threat.minTTI ?? Infinity
    ) < reactionBudgetMs;
    const recovered = Boolean(reconstruction && Number(reconstruction.replayedSelected.directHits || 0) > 0);
    if (effectiveUnavoidable) oldFalseSafeUnavoidable += 1;
    if (reconstruction) {
      reconstructedEvents += 1;
      reconstructedOldFalseSafe += 1;
      if (recovered) {
        recoveredByFullTrajectory += 1;
        if (reconstruction.postStaticMs > 0) recoveredAfterStaticTti += 1;
        else recoveredBeforeStaticTti += 1;
        if (fullTrajectorySamples.length < 12) fullTrajectorySamples.push({
          hitAt: rows[index].entry.at,
          observedAt: reconstruction.row.entry.at,
          hpLoss: previousHp - currentHp,
          observedTtiMs: reconstruction.minTTIMs,
          hitAfterObservationMs: reconstruction.elapsedMs,
          postStaticTtiMs: reconstruction.postStaticMs,
          legacyMinCpaCm: Number(reconstruction.legacySelected.minCPA),
          replayedMinCpaCm: Number(reconstruction.replayedSelected.minCPA),
          replayedDirectHits: Number(reconstruction.replayedSelected.directHits || 0),
          fieldFitRmsCm: reconstruction.fit.fitRmsCm,
          kinematicErrorCm: reconstruction.kinematicErrorCm
        });
      }
    }
    if (oldSafe && !effectiveUnavoidable && !recovered) newFalseSafe += 1;
    if (samples.length < 12) samples.push({
      at: rows[index].entry.at,
      hpLoss: previousHp - currentHp,
      oldDirectHits: Number(threat.directHits || 0),
      minTTI: Number(threat.minTTI || 0),
      reactionBudgetMs,
      classification: reconstruction
        ? (recovered ? 'recovered-by-full-trajectory' : (effectiveUnavoidable ? 'unavoidable-current-shot' : 'reconstructed-false-safe-remains'))
        : (currentUnavoidable ? 'unavoidable-current-shot' : (oldSafe ? 'false-safe-remains' : 'predicted-threat')),
      reconstruction: reconstruction ? {
        observedAt: reconstruction.row.entry.at,
        observedTtiMs: reconstruction.minTTIMs,
        hitAfterObservationMs: reconstruction.elapsedMs,
        postStaticTtiMs: reconstruction.postStaticMs,
        legacyMinCpaCm: Number(reconstruction.legacySelected.minCPA),
        replayedMinCpaCm: Number(reconstruction.replayedSelected.minCPA),
        replayedDirectHits: Number(reconstruction.replayedSelected.directHits || 0),
        fieldFitRmsCm: reconstruction.fit.fitRmsCm,
        kinematicErrorCm: reconstruction.kinematicErrorCm
      } : null
    });
  }
  const oldRatio = hitEvents ? oldFalseSafe / hitEvents : null;
  const newRatio = hitEvents ? newFalseSafe / hitEvents : null;
  return {
    mode: 'dodge',
    targetId: options.targetId || '',
    lines: `${options.startLine}-${options.endLine}`,
    hitEvents,
    eventsWithThreatEvidence,
    reactionBudgetMs,
    oldFalseSafe,
    newFalseSafe,
    unavoidableCurrentShot: unavoidable,
    oldFalseSafeUnavoidable,
    reconstructedEvents,
    reconstructedOldFalseSafe,
    recoveredByFullTrajectory,
    recoveredAfterStaticTti,
    recoveredBeforeStaticTti,
    reclassifiedOldFalseSafe: Math.max(0, oldFalseSafe - newFalseSafe),
    reconstructionCriteria: {
      lookbackMs: 1600,
      bulletSpeedCmPerTick: 500,
      hitRadiusCm: 200,
      maximumFieldFitRmsCm: 120,
      maximumFieldFitErrorCm: 260,
      maximumKinematicErrorCm: 260
    },
    oldFalseSafeRatio: oldRatio,
    newFalseSafeRatio: newRatio,
    samples,
    fullTrajectorySamples,
    accepted: hitEvents > 0
      && reconstructedEvents > 0
      && recoveredByFullTrajectory > 0
      && recoveredAfterStaticTti > 0
      && newFalseSafe < oldFalseSafe
  };
}

function actionIsHardGate(detail) {
  const action = detail?.action || {};
  const reason = String(action.reason || detail?.reason || '');
  if (action.shouldLeave === true) return true;
  if (actionPriorityBand(action) === 'exit') return true;
  if (/critical-hp|stamina-exhausted|hp-disadvantage|pursuit-leave/.test(reason)) return true;
  if (actionPriorityBand(action) === 'safety' && (action.urgent || action.threatEvidence?.realBulletOwner || action.threatEvidence?.invulnerableClose)) return true;
  return false;
}

function actionFocusKey(detail) {
  const action = detail?.action || {};
  const target = action.target || null;
  const targetId = target?.userId ?? target?.user_id ?? target?.id;
  if (targetId !== undefined && targetId !== null && targetId !== '') return `enemy:${targetId}`;
  return `${String(action.kind || detail?.kind || 'wait')}:${String(action.reason || detail?.reason || '')}`;
}

function replayArbitration(options) {
  const rows = selectedEntries(options);
  let baselineTakeovers = 0;
  let correctedTakeovers = 0;
  let hardGateFrames = 0;
  let hardGateViolations = 0;
  let invalidNormalizedBands = 0;
  const baselineFocus = [];
  const correctedFocus = [];
  let engagementId = 0;
  let lastStickyCombatAt = 0;
  for (const row of rows) {
    const detail = row.detail || {};
    const action = detail.action || {};
    const combat = detail.combat || {};
    const target = combat.target || null;
    const targetId = String(target?.userId ?? target?.user_id ?? '');
    const intent = String(target?.combatIntent || '');
    const stickyCombat = Boolean(
      combat.actionEligible === true
        && targetId
        && (!options.targetId || targetId === options.targetId)
        && (intent === 'engaged' || intent === 'reengage' || intent === 'defensive' || target?.combatEngagement)
    );
    const returnToCenter = String(action.reason || detail.reason || '') === 'return-to-center-activity-radius';
    if (stickyCombat && returnToCenter) baselineTakeovers += 1;
    const hardGate = actionIsHardGate(detail);
    if (hardGate) hardGateFrames += 1;
    const baselineKey = actionFocusKey(detail);
    const correctedKey = hardGate
      ? baselineKey
      : (stickyCombat ? `enemy:${targetId}` : baselineKey);
    const at = Date.parse(row.entry.at);
    if (stickyCombat) {
      if (!lastStickyCombatAt || at - lastStickyCombatAt > 5000) engagementId += 1;
      lastStickyCombatAt = at;
    }
    const rowEngagementId = stickyCombat || (lastStickyCombatAt && at - lastStickyCombatAt <= 5000) ? engagementId : 0;
    if (stickyCombat && correctedKey.includes('return-to-center')) correctedTakeovers += 1;
    if (hardGate && correctedKey !== baselineKey) hardGateViolations += 1;
    const normalizedBand = actionPriorityBand(action);
    if (!['exit', 'safety', 'combat', 'profit', 'recover', 'wait'].includes(normalizedBand)) invalidNormalizedBands += 1;
    baselineFocus.push({ at, key: baselineKey, engagementId: rowEngagementId });
    correctedFocus.push({ at, key: correctedKey, engagementId: rowEngagementId });
  }
  const countPairSwitches = sequence => {
    let switches = 0;
    let combatReturnPairSwitches = 0;
    const pairSwitchesByEngagement = {};
    let consecutiveReturns = 0;
    let maxConsecutiveReturns = 0;
    for (let index = 1; index < sequence.length; index += 1) {
      if (sequence[index].key !== sequence[index - 1].key) switches += 1;
      const pair = [sequence[index - 1].key, sequence[index].key];
      if (pair.some(key => key === `enemy:${options.targetId}`) && pair.some(key => /return-to-center/.test(key))) {
        combatReturnPairSwitches += 1;
        const pairEngagementId = sequence[index].engagementId || sequence[index - 1].engagementId || 0;
        pairSwitchesByEngagement[pairEngagementId] = Number(pairSwitchesByEngagement[pairEngagementId] || 0) + 1;
      }
      if (/return-to-center/.test(sequence[index].key) && /enemy:/.test(sequence[index - 1].key)) {
        consecutiveReturns += 1;
        maxConsecutiveReturns = Math.max(maxConsecutiveReturns, consecutiveReturns);
      } else if (!/return-to-center/.test(sequence[index].key)) {
        consecutiveReturns = 0;
      }
    }
    return {
      switches,
      combatReturnPairSwitches,
      maxPairSwitchesPerEngagement: Math.max(0, ...Object.values(pairSwitchesByEngagement)),
      pairSwitchesByEngagement,
      maxConsecutiveReturns
    };
  };
  const baselineSwitches = countPairSwitches(baselineFocus);
  const correctedSwitches = countPairSwitches(correctedFocus);
  const result = {
    mode: 'arbitration',
    targetId: options.targetId || '',
    lines: `${options.startLine}-${options.endLine}`,
    frames: rows.length,
    baseline: {
      engagedReturnToCenterTakeovers: baselineTakeovers,
      focusSwitches: baselineSwitches.switches,
      combatReturnPairSwitches: baselineSwitches.combatReturnPairSwitches,
      maxPairSwitchesPerEngagement: baselineSwitches.maxPairSwitchesPerEngagement,
      maxConsecutiveReturns: baselineSwitches.maxConsecutiveReturns
    },
    corrected: {
      engagedReturnToCenterTakeovers: correctedTakeovers,
      focusSwitches: correctedSwitches.switches,
      combatReturnPairSwitches: correctedSwitches.combatReturnPairSwitches,
      maxPairSwitchesPerEngagement: correctedSwitches.maxPairSwitchesPerEngagement,
      pairSwitchesByEngagement: correctedSwitches.pairSwitchesByEngagement,
      maxConsecutiveReturns: correctedSwitches.maxConsecutiveReturns,
      hardGateFrames,
      hardGateViolations,
      invalidNormalizedBands
    }
  };
  result.accepted = rows.length > 0
    && baselineTakeovers > 0
    && correctedTakeovers === 0
    && correctedSwitches.maxPairSwitchesPerEngagement <= 2
    && correctedSwitches.maxConsecutiveReturns <= 2
    && hardGateViolations === 0
    && invalidNormalizedBands === 0;
  return result;
}

function replayCombatPolicy(options) {
  const rows = selectedEntries(options).filter(({ detail }) => String(detail.target?.userId ?? '') === options.targetId);
  let behavior = null;
  const motionSamples = [];
  let previousShots = 0;
  let retainedShots = 0;
  let baselineShots = 0;
  let baselineEstimatedHits = 0;
  let improvedEstimatedHits = 0;
  let baselineAimMissTotal = 0;
  let improvedAimMissTotal = 0;
  let lastRetainedShotAt = 0;
  let farBaselineShots = 0;
  let farRetainedShots = 0;
  let firstBaselineEstimatedHitAt = 0;
  let firstImprovedEstimatedHitAt = 0;
  let simulatedSelf = null;
  let minimumSimulatedDistance = Infinity;
  const modeFrames = {};
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const detail = row.detail;
    const at = Date.parse(row.entry.at);
    const self = detail.self;
    const target = detail.target;
    if (!simulatedSelf && self) simulatedSelf = { ...self };
    const simulatedDistance = simulatedSelf && target
      ? Math.hypot(Number(target.x) - Number(simulatedSelf.x), Number(target.y) - Number(simulatedSelf.y))
      : Number(target?.distance || Infinity);
    minimumSimulatedDistance = Math.min(minimumSimulatedDistance, simulatedDistance);
    const replayTarget = target ? { ...target, distance: simulatedDistance } : target;
    const targetPressure = Boolean(
      target?.firing
        || (detail.movement?.dodge?.reason && detail.movement.dodge.reason !== 'no-bullets')
        || detail.movement?.pressureClose?.active
    );
    const observedHitRate = Number(detail.metrics?.actualShots || 0) >= 5
      ? Number(detail.metrics?.confirmedHits || 0) / Math.max(1, Number(detail.metrics.actualShots || 0))
      : null;
    const sample = {
      at,
      selfX: simulatedSelf?.x,
      selfY: simulatedSelf?.y,
      selfVx: simulatedSelf?.vx,
      selfVy: simulatedSelf?.vy,
      x: target?.x,
      y: target?.y,
      vx: target?.vx,
      vy: target?.vy,
      distance: simulatedDistance,
      firing: Boolean(target?.firing),
      realBulletPressure: targetPressure,
      selfHp: self?.hp,
      targetHp: target?.hp,
      hitRate: observedHitRate
    };
    behavior = updateOpponentBehaviorStateCore(behavior, sample, { nowMs: at });
    motionSamples.push(sample);
    while (motionSamples.length && at - Number(motionSamples[0].at || 0) > 6000) motionSamples.shift();
    const actualShots = Number(detail.metrics?.actualShots || 0);
    const shotDelta = Math.max(0, actualShots - previousShots);
    previousShots = actualShots;
    modeFrames[behavior.mode] = Number(modeFrames[behavior.mode] || 0) + 1;
    if (shotDelta) {
      const newAim = estimateAim(simulatedSelf, replayTarget, {
        combatTargetState: {
          motionSamples,
          noDamageMs: detail.aim?.noDamageMs || 0,
          opponentBehaviorState: behavior
        },
        actualShots: retainedShots
      });
      const baselineMiss = actualFutureAimMiss(rows, index, detail.aim);
      const improvedMiss = actualFutureAimMiss(rows, index, newAim);
      const baselineFar = Number(target?.distance) >= 10500 && Number(target?.distance) <= 14500;
      const improvedFar = simulatedDistance >= 10500 && simulatedDistance <= 14500;
      for (let shot = 0; shot < shotDelta; shot += 1) {
        baselineShots += 1;
        baselineAimMissTotal += baselineMiss;
        if (baselineFar) farBaselineShots += 1;
        if (baselineMiss <= options.hitRadius) {
          baselineEstimatedHits += 1;
          if (!firstBaselineEstimatedHitAt) firstBaselineEstimatedHitAt = at;
        }
        const minimumCadenceMs = Math.max(0, Number(behavior.responsePolicy?.minimumCadenceMs || 0));
        const retained = simulatedDistance <= 14500
          && !behavior.responsePolicy?.suppressFire
          && (!lastRetainedShotAt || at - lastRetainedShotAt >= minimumCadenceMs);
        if (!retained) continue;
        retainedShots += 1;
        lastRetainedShotAt = at;
        improvedAimMissTotal += improvedMiss;
        if (improvedFar) farRetainedShots += 1;
        if (improvedMiss <= options.hitRadius) {
          improvedEstimatedHits += 1;
          if (!firstImprovedEstimatedHitAt) firstImprovedEstimatedHitAt = at;
        }
      }
    }
    const nextAt = index + 1 < rows.length ? Date.parse(rows[index + 1].entry.at) : at;
    const elapsedMs = Math.max(0, Math.min(1500, nextAt - at));
    const threatField = detail.movement?.dodge?.threatField || [];
    const safeClosing = behavior.responsePolicy?.closeIn && targetPressure
      ? pickSafeClosingDodgeCore(threatField, { hitRadius: options.hitRadius, minimumCpaRatio: 0.75, minimumClosingCm: 25 })
      : null;
    let moveDx = Number(detail.movement?.dx || 0);
    let moveDy = Number(detail.movement?.dy || 0);
    if (safeClosing) {
      moveDx = Number(safeClosing.dx || 0);
      moveDy = Number(safeClosing.dy || 0);
    } else if (behavior.responsePolicy?.closeIn && !targetPressure && simulatedSelf && target) {
      moveDx = Math.sign(Number(target.x) - Number(simulatedSelf.x));
      moveDy = Math.sign(Number(target.y) - Number(simulatedSelf.y));
    }
    if (simulatedSelf && elapsedMs > 0) {
      const diagonalScale = moveDx && moveDy ? Math.SQRT1_2 : 1;
      const travel = 50 * (elapsedMs / 50) * diagonalScale;
      simulatedSelf = {
        ...simulatedSelf,
        x: Number(simulatedSelf.x) + moveDx * travel,
        y: Number(simulatedSelf.y) + moveDy * travel,
        vx: moveDx * 50 * diagonalScale,
        vy: moveDy * 50 * diagonalScale
      };
    }
  }
  const firstMetrics = rows[0]?.detail?.metrics || {};
  const lastMetrics = rows[rows.length - 1]?.detail?.metrics || {};
  const baselineStamina = Math.max(0, Number(lastMetrics.totalStaminaSpent || 0) - Number(firstMetrics.totalStaminaSpent || 0));
  const shotCost = 500;
  const improvedStamina = Math.max(0, baselineStamina - (baselineShots - retainedShots) * shotCost);
  const loggedConfirmedHits = Math.max(0, Number(lastMetrics.confirmedHits || 0) - Number(firstMetrics.confirmedHits || 0));
  const baselineDamage = loggedConfirmedHits * 3;
  const improvedDamage = improvedEstimatedHits * 3;
  const baselineUnitCost = baselineDamage > 0 ? baselineStamina / baselineDamage : null;
  const improvedUnitCost = improvedDamage > 0 ? improvedStamina / improvedDamage : null;
  const improvementPct = baselineUnitCost && improvedUnitCost !== null
    ? (baselineUnitCost - improvedUnitCost) / baselineUnitCost * 100
    : null;
  const startedAt = rows.length ? Date.parse(rows[0].entry.at) : 0;
  const result = {
    mode: 'combat-policy',
    targetId: options.targetId,
    lines: `${options.startLine}-${options.endLine}`,
    frames: rows.length,
    behaviorModeFrames: modeFrames,
    acceptance: {
      minImprovementPct: Number(options.minImprovementPct || 0),
      hitRadius: Number(options.hitRadius)
    },
    baseline: {
      actualShots: baselineShots,
      loggedConfirmedHits,
      estimatedHits: baselineEstimatedHits,
      loggedTargetDamage: baselineDamage,
      estimatedTargetDamage: baselineEstimatedHits * 3,
      totalStaminaSpent: Math.round(baselineStamina),
      staminaPerLoggedDamage: baselineUnitCost === null ? null : Number(baselineUnitCost.toFixed(1)),
      meanAimMissCm: baselineShots ? Number((baselineAimMissTotal / baselineShots).toFixed(1)) : null,
      far105To145Shots: farBaselineShots,
      firstEstimatedDamageDelayMs: firstBaselineEstimatedHitAt ? firstBaselineEstimatedHitAt - startedAt : null,
      selfDamage: Math.max(0, Number(lastMetrics.selfDamage || 0) - Number(firstMetrics.selfDamage || 0))
    },
    improved: {
      retainedShots,
      suppressedShots: Math.max(0, baselineShots - retainedShots),
      estimatedHits: improvedEstimatedHits,
      estimatedTargetDamage: improvedDamage,
      totalStaminaSpent: Math.round(improvedStamina),
      staminaPerEstimatedDamage: improvedUnitCost === null ? null : Number(improvedUnitCost.toFixed(1)),
      unitDamageStaminaImprovementPct: improvementPct === null ? null : Number(improvementPct.toFixed(1)),
      meanAimMissCm: retainedShots ? Number((improvedAimMissTotal / retainedShots).toFixed(1)) : null,
      far105To145Shots: farRetainedShots,
      minimumSimulatedDistance: Number.isFinite(minimumSimulatedDistance) ? Math.round(minimumSimulatedDistance) : null,
      firstEstimatedDamageDelayMs: firstImprovedEstimatedHitAt ? firstImprovedEstimatedHitAt - startedAt : null,
      selfDamage: Math.max(0, Number(lastMetrics.selfDamage || 0) - Number(firstMetrics.selfDamage || 0))
    }
  };
  result.accepted = rows.length > 0
    && baselineShots > 0
    && farRetainedShots < farBaselineShots
    && improvedDamage >= baselineDamage
    && improvementPct !== null
    && improvementPct >= Number(options.minImprovementPct || 0)
    && result.improved.meanAimMissCm <= result.baseline.meanAimMissCm * 1.15
    && result.improved.selfDamage <= result.baseline.selfDamage;
  return result;
}

function replayOpportunity(options) {
  const rows = selectedEntries(options);
  let selectedTargetFrames = 0;
  let betterRoiAlternativeFrames = 0;
  let correctedFrames = 0;
  let ratioTotal = 0;
  let maxRatio = 0;
  for (const { detail } of rows) {
    const selected = detail.profit?.choice || detail.profit?.selected || null;
    const candidates = Array.isArray(detail.profit?.candidates) ? detail.profit.candidates : [];
    if (String(selected?.id ?? detail.action?.target?.userId ?? '') !== options.targetId) continue;
    selectedTargetFrames += 1;
    const selectedCandidate = candidates.find(candidate => candidate.type === 'enemy' && String(candidate.id) === options.targetId) || selected;
    const best = candidates.slice().sort((a, b) => Number(b.score || -Infinity) - Number(a.score || -Infinity))[0] || null;
    if (best && Number(best.score) > Number(selectedCandidate?.score || 0)) {
      betterRoiAlternativeFrames += 1;
      correctedFrames += best.type === 'coin' ? 1 : 0;
      const ratio = Number(best.score) / Math.max(1, Number(selectedCandidate?.score || 0));
      ratioTotal += ratio;
      maxRatio = Math.max(maxRatio, ratio);
    }
  }
  return {
    mode: 'opportunity',
    targetId: options.targetId,
    lines: `${options.startLine}-${options.endLine}`,
    selectedTargetFrames,
    betterRoiAlternativeFrames,
    correctedToCoinFrames: correctedFrames,
    averageScoreRatio: betterRoiAlternativeFrames ? Number((ratioTotal / betterRoiAlternativeFrames).toFixed(2)) : null,
    maxScoreRatio: Number(maxRatio.toFixed(2)),
    accepted: correctedFrames === betterRoiAlternativeFrames && correctedFrames > 0
  };
}

function replayExit(options) {
  const rows = selectedEntries(options);
  const evaluated = [];
  for (const row of rows) {
    const decision = row.detail?.detail?.decision || row.detail?.decision || row.detail || {};
    const action = decision.action || decision;
    const combat = decision.combat || {};
    const metrics = combat.metrics || {};
    const target = action.target || combat.target || null;
    const targetId = String(target?.userId ?? target?.user_id ?? metrics.targetId ?? '');
    if (options.targetId && targetId !== options.targetId) continue;
    const selfHp = Number(action.combatExit?.selfHp ?? combat.exit?.selfHp ?? action.self?.hp ?? combat.self?.hp ?? decision.input?.self?.hp);
    const metricsTargetId = String(metrics.targetId ?? '');
    const metricsTargetMatches = Boolean(targetId && metricsTargetId && metricsTargetId === targetId);
    const targetHp = Number(
      action.combatExit?.targetHp
        ?? combat.exit?.targetHp
        ?? (metricsTargetMatches ? metrics.lastTargetHp : null)
        ?? target?.hp
    );
    if (!Number.isFinite(selfHp)) continue;
    const baselinePolicyExit = evaluateCombatHpExitCore({
      selfHp,
      targetHp: Number.isFinite(targetHp) ? targetHp : null
    });
    const atMs = Date.parse(row.entry.at || '') || Number(metrics.lastObservedAt || 0);
    const combatStartedAt = Number(metrics.startedAt || 0)
      || Date.parse(combat.startedAt || '')
      || atMs;
    const engagedMs = Math.max(0, atMs - combatStartedAt);
    const estimatedSamples = Math.max(1, Math.floor(engagedMs / Math.max(1, options.controlIntervalMs)) + 1);
    const targetSelfDamage = metricsTargetMatches ? Number(metrics.selfDamage) : 0;
    const targetDamage = metricsTargetMatches ? Number(metrics.targetDamage) : null;
    const injury = action.injury || decision.injury || {};
    const unattributedPressureTarget = Boolean(
      (action.combatExit?.triggerSource === 'recent-injury-pressure' || combat.exit?.triggerSource === 'recent-injury-pressure')
        && metricsTargetId
        && !metricsTargetMatches
        && injury.hasIncoming !== true
        && Number(injury.incomingCount || 0) <= 0
        && injury.attributable !== true
    );
    const targetThreatExempt = target?.easyKillThreatExempt === true;
    const confirmedEvaluation = evaluateConfirmedCombatHpExitCore({
      selfHp,
      targetHp: Number.isFinite(targetHp) ? targetHp : null,
      nowMs: atMs,
      disadvantageSinceAt: combatStartedAt,
      combatStartedAt,
      sampleCount: estimatedSamples,
      confirmedSelfDamage: Number.isFinite(targetSelfDamage) ? targetSelfDamage : 0
    });
    const loggedExit = action.shouldLeave === true || combat.exit?.shouldLeave === true;
    const selfDamage = metricsTargetMatches ? Number(metrics.selfDamage) : null;
    const favorable = Number.isFinite(selfDamage)
      && Number.isFinite(targetDamage)
        && targetDamage > selfDamage
        && (!Number.isFinite(targetHp) || selfHp > targetHp);
    const priorBattleSelfDamage = Number(metrics.selfDamage);
    const priorBattleTargetDamage = Number(metrics.targetDamage);
    const priorBattleSelfHp = Number(metrics.lastSelfHp);
    const priorBattleTargetHp = Number(metrics.lastTargetHp);
    const priorBattleFavorable = Boolean(
      !metricsTargetMatches
        && Number.isFinite(priorBattleSelfDamage)
        && Number.isFinite(priorBattleTargetDamage)
        && priorBattleTargetDamage > priorBattleSelfDamage
        && (!Number.isFinite(priorBattleSelfHp) || !Number.isFinite(priorBattleTargetHp) || priorBattleSelfHp > priorBattleTargetHp)
    );
    const trustedEasyKillBeforeDamage = Boolean(
      options.trustEasyKillBeforeDamage
        && targetId
        && (!options.targetId || targetId === options.targetId)
        && (!Number.isFinite(selfDamage) || selfDamage <= 0)
    );
    const policyExit = trustedEasyKillBeforeDamage || targetThreatExempt || unattributedPressureTarget
      ? null
      : confirmedEvaluation.exit;
    evaluated.push({
      line: row.line,
      at: row.entry.at || '',
      targetId: targetId || null,
      targetName: String(target?.name || metrics.targetName || ''),
      metricsTargetId: metricsTargetId || null,
      metricsTargetName: String(metrics.targetName || ''),
      metricsTargetMatches,
      loggedReason: String(action.reason || decision.reason || ''),
      loggedExit,
      selfHp,
      targetHp: Number.isFinite(targetHp) ? targetHp : null,
      selfDamage: Number.isFinite(selfDamage) ? selfDamage : null,
      targetDamage: Number.isFinite(targetDamage) ? targetDamage : null,
      favorable,
      priorBattleFavorable,
      unattributedPressureTarget,
      targetThreatExempt,
      trustedEasyKillBeforeDamage,
      baselinePolicyExit,
      disadvantageObservation: confirmedEvaluation.disadvantageObservation,
      policyExit
    });
  }
  const preventedLoggedExits = evaluated.filter(item => item.loggedExit && !item.policyExit);
  const preservedRequiredExits = evaluated.filter(item => item.loggedExit && item.policyExit);
  const newlyRequiredExits = evaluated.filter(item => !item.loggedExit && item.policyExit);
  const favorablePreventedExits = preventedLoggedExits.filter(item => item.favorable);
  const confirmationPreventedExits = preventedLoggedExits.filter(item => item.disadvantageObservation?.ready === false);
  const identityMismatchPreventedExits = preventedLoggedExits.filter(item => item.unattributedPressureTarget);
  const threatExemptPreventedExits = preventedLoggedExits.filter(item => item.targetThreatExempt);
  const justifiedPreventedExits = preventedLoggedExits.filter(item => item.favorable
    || item.priorBattleFavorable
    || item.disadvantageObservation?.ready === false
    || item.unattributedPressureTarget
    || item.targetThreatExempt);
  const trustedNoDamagePreventedExits = preventedLoggedExits.filter(item => item.trustedEasyKillBeforeDamage);
  const result = {
    mode: 'exit',
    targetId: options.targetId || '',
    lines: `${options.startLine}-${options.endLine}`,
    evaluatedFrames: evaluated.length,
    loggedExitFrames: evaluated.filter(item => item.loggedExit).length,
    policyExitFrames: evaluated.filter(item => item.policyExit).length,
    preventedLoggedExitFrames: preventedLoggedExits.length,
    favorablePreventedExitFrames: favorablePreventedExits.length,
    confirmationPreventedExitFrames: confirmationPreventedExits.length,
    identityMismatchPreventedExitFrames: identityMismatchPreventedExits.length,
    threatExemptPreventedExitFrames: threatExemptPreventedExits.length,
    justifiedPreventedExitFrames: justifiedPreventedExits.length,
    trustedNoDamagePreventedExitFrames: trustedNoDamagePreventedExits.length,
    preservedRequiredExitFrames: preservedRequiredExits.length,
    newlyRequiredExitFrames: newlyRequiredExits.length,
    samples: evaluated.slice(0, 10)
  };
  result.expectNewExit = Boolean(options.expectNewExit);
  result.trustEasyKillBeforeDamage = Boolean(options.trustEasyKillBeforeDamage);
  result.accepted = options.trustEasyKillBeforeDamage
    ? result.evaluatedFrames > 0
      && result.preventedLoggedExitFrames > 0
      && result.trustedNoDamagePreventedExitFrames === result.preventedLoggedExitFrames
      && result.newlyRequiredExitFrames === 0
    : (options.expectNewExit
    ? result.evaluatedFrames > 0
      && result.newlyRequiredExitFrames > 0
      && evaluated[0]?.policyExit?.reason === 'combat-hp-disadvantage-leave'
    : result.evaluatedFrames > 0
      && result.preventedLoggedExitFrames > 0
      && result.justifiedPreventedExitFrames === result.preventedLoggedExitFrames
      && result.newlyRequiredExitFrames === 0);
  return result;
}

function replayMovementStallExit(options) {
  const rows = selectedEntries(options);
  const decisionsFile = path.join(path.dirname(options.file), 'decisions.jsonl');
  const laterDecisions = [];
  if (fs.existsSync(decisionsFile)) {
    forEachJsonlEntry(decisionsFile, entry => {
      const at = Date.parse(entry?.at || '');
      const self = entry?.detail?.input?.self || entry?.detail?.action?.self || null;
      if (Number.isFinite(at) && self) laterDecisions.push({ at, self });
    });
  }
  const evaluated = [];
  for (const row of rows) {
    const event = row.detail || {};
    if (String(event.reason || '') !== 'action-settlement-stalled') continue;
    const decision = event.detail?.lastDecision || {};
    const target = decision.target || decision.combat?.target || null;
    const targetId = String(target?.userId ?? target?.user_id ?? target?.entityId ?? target?.entity_id ?? '');
    if (options.targetId && targetId !== options.targetId) continue;
    if (options.targetName && String(target?.name || '') !== options.targetName) continue;
    const atMs = Date.parse(row.entry.at || '');
    const realtime = event.detail?.realtime || {};
    const self = realtime.self || decision.self || decision.combat?.self || null;
    const replayed = evaluateBrowserlessSafety({
      realtime: {
        ...realtime,
        self,
        bullets: Array.isArray(realtime.bullets) ? realtime.bullets : []
      },
      frameAges: {}
    }, {
      actionSettlementStall: event.detail?.movement || null,
      lastDecision: decision,
      nowMs: atMs
    });
    const next = laterDecisions.find(item => item.at > atMs && item.at <= atMs + 15000) || null;
    const baselineHp = Number(self?.hp);
    const nextHp = Number(next?.self?.hp);
    const thresholdMs = Number(replayed.detail?.movementSafety?.thresholdMs);
    const lastProgressAtMs = Number(event.detail?.movement?.lastProgressAtMs || 0);
    const replayTriggerAtMs = Number.isFinite(thresholdMs) && lastProgressAtMs > 0
      ? lastProgressAtMs + thresholdMs
      : atMs;
    evaluated.push({
      line: row.line,
      at: row.entry.at || '',
      targetId: targetId || null,
      targetName: String(target?.name || ''),
      decisionKind: String(decision.kind || decision.action?.kind || ''),
      decisionBand: String(decision.band || decision.action?.band || ''),
      movementReason: String(event.detail?.movement?.actionReason || decision.combat?.movement?.reason || ''),
      noProgressMs: Number(event.detail?.movement?.noProgressMs || 0),
      loggedExit: event.shouldLeave === true,
      replayedExit: replayed.shouldLeave === true,
      replayedReason: String(replayed.reason || ''),
      replayedClassification: String(replayed.classification || ''),
      pressureSources: replayed.detail?.movementSafety?.pressureSources || [],
      thresholdMs: Number.isFinite(thresholdMs) ? thresholdMs : null,
      detectionLeadMs: Number.isFinite(atMs) ? Math.max(0, atMs - replayTriggerAtMs) : null,
      selfHp: Number.isFinite(baselineHp) ? baselineHp : null,
      nextObservedAt: next ? new Date(next.at).toISOString() : '',
      nextObservedSelfHp: Number.isFinite(nextHp) ? nextHp : null,
      observedHpLossAfterReconnect: Number.isFinite(baselineHp) && Number.isFinite(nextHp)
        ? Math.max(0, baselineHp - nextHp)
        : null
    });
  }
  const newlyRequired = evaluated.filter(item => !item.loggedExit && item.replayedExit);
  const result = {
    mode: 'movement-stall-exit',
    targetId: options.targetId || '',
    targetName: options.targetName || '',
    lines: `${options.startLine}-${options.endLine}`,
    evaluatedFrames: evaluated.length,
    loggedExitFrames: evaluated.filter(item => item.loggedExit).length,
    replayedExitFrames: evaluated.filter(item => item.replayedExit).length,
    newlyRequiredExitFrames: newlyRequired.length,
    maximumDetectionLeadMs: Math.max(0, ...evaluated.map(item => Number(item.detectionLeadMs || 0))),
    maximumObservedHpLossAfterReconnect: Math.max(0, ...evaluated.map(item => Number(item.observedHpLossAfterReconnect || 0))),
    samples: evaluated.slice(0, 10)
  };
  result.accepted = result.evaluatedFrames > 0
    && result.newlyRequiredExitFrames > 0
    && newlyRequired.every(item => item.replayedReason === 'combat-action-settlement-stalled')
    && result.maximumDetectionLeadMs > 0
    && result.maximumObservedHpLossAfterReconnect > 0;
  return result;
}

function recoveryThreatFromNearbyRow(row, options = {}) {
  if (!Array.isArray(row)) return null;
  const name = String(row[0] || '');
  if (options.targetName && name !== options.targetName) return null;
  const hp = Number(row[1]);
  const stamina5s = Number(row[2]);
  const distance = Number(row[5]);
  const mode = String(row[7] || '');
  const fullStamina5s = Number(row[8]) === 1;
  const active = /^active$/i.test(mode) && !fullStamina5s;
  if (!active || !Number.isFinite(distance)) return null;
  return {
    type: 'enemy',
    userId: options.targetId ? Number(options.targetId) : null,
    name,
    authority: 'realtime',
    x: distance,
    y: 0,
    hp: Number.isFinite(hp) ? hp : null,
    stamina_5s_remaining_milli: Number.isFinite(stamina5s) ? stamina5s : null,
    stamina_5s_limit_milli: 10000,
    distance,
    current_join_mode: mode,
    active: true,
    firing: false,
    alive: true,
    whitelisted: false,
    easyKillThreatExempt: false
  };
}

function replayRecoveryThreatExit(options) {
  const rows = selectedEntries(options);
  const evaluated = [];
  for (const row of rows) {
    const decision = row.detail || {};
    const action = decision.action || decision;
    const self = decision.input?.self || action.self || null;
    if (!self) continue;
    const visibleTargets = (decision.input?.nearby?.p || [])
      .map(item => recoveryThreatFromNearbyRow(item, options))
      .filter(Boolean);
    const replayed = buildLowHpRecoveryThreatExitDecision({ self, visibleTargets }, {
      controlMode: 'profit-live',
      loginPointSafetyRadius: 30000,
      combatLowHpLeaveThreshold: 50
    });
    const loggedTarget = action.target || decision.combat?.target || null;
    const replayTarget = replayed?.target || null;
    evaluated.push({
      line: row.line,
      at: row.entry.at || '',
      loggedKind: String(action.kind || decision.kind || ''),
      loggedReason: String(action.reason || decision.reason || ''),
      loggedExit: action.shouldLeave === true,
      selfHp: Number.isFinite(Number(self.hp)) ? Number(self.hp) : null,
      visibleActiveThreats: visibleTargets.length,
      replayedExit: replayed?.shouldLeave === true,
      replayedReason: String(replayed?.reason || ''),
      replayedTargetName: String(replayTarget?.name || ''),
      replayedTargetDistance: Number.isFinite(Number(replayTarget?.distance)) ? Number(replayTarget.distance) : null,
      loggedTargetDistance: Number.isFinite(Number(loggedTarget?.distance)) ? Number(loggedTarget.distance) : null,
      recoverySafety: replayed?.recoverySafety || null
    });
  }
  const firstLoggedExit = evaluated.find(item => item.loggedExit) || null;
  const firstReplayedExit = evaluated.find(item => item.replayedExit) || null;
  const firstLoggedExitAt = firstLoggedExit ? Date.parse(firstLoggedExit.at) : null;
  const firstReplayedExitAt = firstReplayedExit ? Date.parse(firstReplayedExit.at) : null;
  const earlierByMs = Number.isFinite(firstLoggedExitAt) && Number.isFinite(firstReplayedExitAt)
    ? Math.max(0, firstLoggedExitAt - firstReplayedExitAt)
    : null;
  const distanceMarginCm = firstReplayedExit && firstLoggedExit
    && Number.isFinite(Number(firstReplayedExit.replayedTargetDistance))
    && Number.isFinite(Number(firstLoggedExit.loggedTargetDistance))
    ? Number(firstReplayedExit.replayedTargetDistance) - Number(firstLoggedExit.loggedTargetDistance)
    : null;
  const result = {
    mode: 'recovery-threat-exit',
    targetId: options.targetId || '',
    targetName: options.targetName || '',
    lines: `${options.startLine}-${options.endLine}`,
    evaluatedFrames: evaluated.length,
    baselineRecoveryHoldFrames: evaluated.filter(item => item.loggedReason === 'wait-for-full-stamina-and-hp').length,
    loggedExitFrames: evaluated.filter(item => item.loggedExit).length,
    replayedExitFrames: evaluated.filter(item => item.replayedExit).length,
    firstLoggedExitAt: firstLoggedExit?.at || '',
    firstReplayedExitAt: firstReplayedExit?.at || '',
    earlierByMs,
    distanceMarginCm,
    samples: evaluated.slice(0, 12)
  };
  result.accepted = result.evaluatedFrames > 0
    && result.baselineRecoveryHoldFrames > 0
    && firstReplayedExit?.replayedReason === 'recovery-low-hp-active-threat-leave'
    && Number(earlierByMs) > 0
    && Number(distanceMarginCm) > 0;
  return result;
}

function pursuitReplayTargetMatches(target, options = {}) {
  if (!target) return false;
  const id = String(target.userId ?? target.user_id ?? target.entityId ?? target.entity_id ?? '');
  if (options.targetId && id !== options.targetId) return false;
  if (options.targetName && String(target.name || '') !== options.targetName) return false;
  return true;
}

function pursuitReplayNearbyTarget(decision, options = {}) {
  const row = (decision.input?.nearby?.p || []).find(item => Array.isArray(item)
    && (!options.targetName || String(item[0] || '') === options.targetName));
  if (!row) return null;
  const hp = Number(row[1]);
  const stamina5s = Number(row[2]);
  const distance = Number(row[5]);
  const mode = String(row[7] || '');
  if (!Number.isFinite(distance)) return null;
  return {
    userId: options.targetId ? Number(options.targetId) : null,
    name: String(row[0] || ''),
    authority: 'realtime',
    x: distance,
    y: 0,
    vx: 0,
    vy: 0,
    hp: Number.isFinite(hp) ? hp : null,
    stamina5s: Number.isFinite(stamina5s) ? stamina5s : null,
    distance,
    current_join_mode: mode,
    active: /^active$/i.test(mode) && Number(row[8]) !== 1,
    firing: false
  };
}

function replayCombatPursuit(options) {
  const rows = selectedEntries(options);
  const evaluated = [];
  let engaged = null;
  let lastTargetAt = 0;
  let firstEscapeConfirmedAt = '';
  for (const row of rows) {
    const decision = row.detail || {};
    const atMs = Date.parse(row.entry.at || '');
    if (!Number.isFinite(atMs)) continue;
    const self = decision.input?.self || decision.combat?.self || decision.action?.self || null;
    if (!self) continue;
    const combatTarget = pursuitReplayTargetMatches(decision.combat?.target, options)
      ? decision.combat.target
      : null;
    const nearbyTarget = pursuitReplayNearbyTarget(decision, options);
    const target = combatTarget || nearbyTarget;
    if (!target) {
      if (lastTargetAt > 0 && atMs - lastTargetAt > 30000) engaged = null;
      continue;
    }
    lastTargetAt = atMs;
    const replaySelf = combatTarget ? self : { ...self, x: 0, y: 0 };
    const replayTarget = combatTarget ? target : { ...target, x: Number(target.distance), y: 0 };
    const loggedEngagement = combatTarget?.combatEngagement || decision.action?.target?.combatEngagement || null;
    const loggedOutOfRangeMs = Number(loggedEngagement?.outOfRangeMs);
    const lastInRangeAt = Number.isFinite(loggedOutOfRangeMs)
      ? atMs - Math.max(0, loggedOutOfRangeMs)
      : Number(engaged?.lastInRangeAt || atMs);
    const behavior = decision.combat?.behavior || engaged?.opponentBehaviorState || null;
    const replayEngaged = {
      ...(engaged || {}),
      id: options.targetId || String(target.userId ?? target.user_id ?? ''),
      at: atMs,
      lastInRangeAt,
      opponentBehaviorState: behavior,
      escapeDecision: engaged?.escapeDecision || null
    };
    const escapeDecision = combatEscapeDecisionCore(replaySelf, replayTarget, replayEngaged, {
      nowMs: atMs,
      combatAttackRange: 14500,
      combatEscapeConfirmConfidence: 0.8,
      combatEscapeConfirmNoProgressMs: 5000,
      combatEscapeConfirmNetDistanceCm: 2000,
      combatEscapeConfirmRadialSpeedMin: 5
    });
    const edgePressure = combatEdgePressureDecisionCore(replaySelf, replayTarget, replayEngaged, escapeDecision, {
      nowMs: atMs,
      combatAttackRange: 14500,
      combatAdvantageReengageRange: 16000,
      combatAdvantageReengageMinHp: 60,
      combatAdvantageReengageMinHpLead: 5,
      combatAdvantageReengageRecentInRangeMs: 3000
    });
    engaged = {
      ...replayEngaged,
      lastInRangeAt,
      opponentBehaviorState: behavior,
      escapeDecision
    };
    if (escapeDecision.confirmed && !firstEscapeConfirmedAt) firstEscapeConfirmedAt = row.entry.at || '';
    const loggedMovementReason = String(decision.combat?.movement?.reason || '');
    const baselineClose = /close|reengage|response/.test(loggedMovementReason);
    const recoveryCandidate = (decision.finalSelection?.candidates || [])
      .some(candidate => String(candidate?.reason || '') === 'wait-for-full-stamina-and-hp');
    const correctedReason = escapeDecision.confirmed
      ? 'combat-escape-confirmed-hold'
      : (edgePressure.active ? 'combat-advantage-reengage' : loggedMovementReason);
    evaluated.push({
      line: row.line,
      at: row.entry.at || '',
      loggedKind: String(decision.kind || decision.action?.kind || ''),
      loggedReason: String(decision.reason || decision.action?.reason || ''),
      selfHp: Number.isFinite(Number(self.hp)) ? Number(self.hp) : null,
      targetHp: Number.isFinite(Number(target.hp)) ? Number(target.hp) : null,
      distance: Number.isFinite(Number(target.distance)) ? Math.round(Number(target.distance)) : null,
      loggedMovementReason,
      baselineClose,
      recoveryCandidate,
      edgePressure,
      escapeDecision,
      correctedReason,
      correctedClose: Boolean(!escapeDecision.confirmed && edgePressure.active),
      correctedShoot: Boolean(Number(target.distance) <= 14500 && decision.combat?.shooting?.wouldShoot)
    });
  }
  const escapeAtMs = Date.parse(firstEscapeConfirmedAt || '');
  const afterEscape = Number.isFinite(escapeAtMs)
    ? evaluated.filter(item => Date.parse(item.at) >= escapeAtMs)
    : [];
  const edgeFrames = evaluated.filter(item => item.edgePressure?.active);
  const result = {
    mode: 'combat-pursuit',
    targetId: options.targetId || '',
    targetName: options.targetName || '',
    lines: `${options.startLine}-${options.endLine}`,
    evaluatedFrames: evaluated.length,
    edgePressureFrames: edgeFrames.length,
    preventedRecoveryTakeoverFrames: edgeFrames.filter(item => item.recoveryCandidate).length,
    firstEdgePressureAt: edgeFrames[0]?.at || '',
    firstEscapeConfirmedAt,
    baselinePostEscapeCombatFrames: afterEscape.filter(item => item.loggedKind === 'combat-live').length,
    baselinePostEscapeCloseFrames: afterEscape.filter(item => item.baselineClose).length,
    correctedPostEscapeCloseFrames: afterEscape.filter(item => item.correctedClose).length,
    correctedOutOfRangeShootFrames: evaluated.filter(item => item.correctedShoot && Number(item.distance) > 14500).length,
    samples: evaluated.filter(item => item.edgePressure?.active || item.escapeDecision?.freshConfirmed || item.recoveryCandidate).slice(0, 16)
  };
  result.accepted = result.evaluatedFrames > 0
    && result.edgePressureFrames > 0
    && result.preventedRecoveryTakeoverFrames > 0
    && Boolean(result.firstEscapeConfirmedAt)
    && result.baselinePostEscapeCombatFrames > 0
    && result.baselinePostEscapeCloseFrames > 0
    && result.correctedPostEscapeCloseFrames === 0
    && result.correctedOutOfRangeShootFrames === 0;
  return result;
}

function runReplay(options) {
  if (options.mode === 'opportunity') return replayOpportunity(options);
  if (options.mode === 'exit') return replayExit(options);
  if (options.mode === 'movement-stall-exit') return replayMovementStallExit(options);
  if (options.mode === 'recovery-threat-exit') return replayRecoveryThreatExit(options);
  if (options.mode === 'combat-pursuit') return replayCombatPursuit(options);
  if (options.mode === 'arbitration') return replayArbitration(options);
  if (options.mode === 'combat-policy') return replayCombatPolicy(options);
  if (options.mode === 'dodge') return replayDodge(options);
  return replayCombat(options);
}

if (require.main === module) {
  const options = parseArgs(process.argv.slice(2));
  const result = runReplay(options);
  console.log(JSON.stringify(result, null, 2));
  if (!result.accepted && !result.improved?.accepted) process.exitCode = 1;
}

module.exports = {
  parseArgs,
  replayCombatPursuit,
  replayMovementStallExit,
  replayRecoveryThreatExit,
  runReplay
};
