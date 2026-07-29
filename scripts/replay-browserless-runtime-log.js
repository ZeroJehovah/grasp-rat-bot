#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { StringDecoder } = require('string_decoder');
const path = require('path');
const { forEachJsonlEntry } = require('./browserless-log-summary');
const { estimateAim } = require('../src/node/browserless/combat-adapter');
const { attributeVelocityTransition } = require('../src/node/browserless/state-store');
const {
  buildLowHpRecoveryThreatExitDecision,
  currentProfitThresholdEligibility,
  easyKillEngagementFinishReason,
  recentCombatResidualThreatContinuityCore
} = require('../src/node/browserless/decision-adapter');
const { evaluateBrowserlessSafety } = require('../src/node/browserless/safety-controller');
const { actionPriorityBand } = require('../src/strategy/action-priority');
const { applyFinalActionArbitrationCore } = require('../src/strategy/action-arbitration');
const {
  evaluateConfirmedCombatHpExitCore,
  evaluateCombatExchangeStopLossCore,
  evaluateCombatHpExitCore,
  evaluatePredictedLeaveHpCore
} = require('../src/strategy/combat-exit');
const {
  calculateDodgeDirection,
  contactEntryRiskCore,
  contactEntrySyntheticBulletCore,
  pickSafeClosingDodgeCore,
  selectCombatMovementArbitrationCore,
  stabilizeCombatMovementDirectionCore
} = require('../src/strategy/combat-movement');
const {
  buildTrajectoryCoveragePlanCore,
  dynamicBehaviorTrajectoryEligibilityCore,
  shouldApplyTrajectoryCoverageCore
} = require('../src/strategy/combat-shot-coverage');
const {
  applyCombatTargetSwitchHysteresisCore,
  checkProactiveActiveCombatGates,
  combatTargetIncomingThreatEvidenceCore,
  combatEdgePressureDecisionCore,
  combatEscapeDecisionCore,
  recentAfkAttackCommitmentCore
} = require('../src/strategy/combat-target-selection');
const {
  burstCadenceMetricsCore,
  opponentResponsePolicyCore,
  updateOpponentBehaviorStateCore
} = require('../src/strategy/opponent-behavior');
const {
  determineCombatFireState,
  evaluateCombatFireBudgetCore,
  evaluateHighEntropyFireGateCore,
  updateCloseBandReserveCore,
  updateCombatProbePhaseCore
} = require('../src/strategy/combat-fire-discipline');
const {
  combatPressurePhaseCore,
  combatPressureStrafeCore,
  combatPressureTargetRangeCore
} = require('../src/strategy/combat-pressure');
const {
  evaluateNonThreatCombatEconomicStopLossCore
} = require('../src/strategy/combat-economic-stop-loss');
const {
  updateCombatResponsePolicyShadowCore
} = require('../src/strategy/combat-response-policy-shadow');
const { updatePostKillSettlementCore } = require('../src/strategy/post-kill-settlement');
const { postAttackCoinMatchesAttackCore } = require('../src/strategy/post-attack-drop');
const { chooseStableOpportunityCore } = require('../src/strategy/opportunity-choice');

function parseArgs(argv) {
  const options = {
    file: '',
    runnerFile: '',
    wsFile: '',
    startLine: 1,
    endLine: Infinity,
    targetId: '',
    targetName: '',
    mode: 'combat',
    hitRadius: 90,
    attackRange: 14500,
    disengageRange: 17000,
    controlIntervalMs: 50,
    minImprovementPct: 0,
    expectNewExit: false,
    trustEasyKillBeforeDamage: false,
    executionDelayTicks: 5,
    trajectoryRouteSelectionMode: 'weighted',
    trajectoryImprovementGate: true,
    trajectoryRouteSequencePhase: 0,
    cutoffAt: '',
    expectCases: 0,
    expectTailLoss: null,
    projectedLeaveP50Ms: 400,
    projectedLeaveP95Ms: 700
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--file') options.file = argv[++index] || '';
    else if (arg === '--runner-file') options.runnerFile = argv[++index] || '';
    else if (arg === '--ws-file') options.wsFile = argv[++index] || '';
    else if (arg === '--start-line') options.startLine = Number(argv[++index] || 1);
    else if (arg === '--end-line') options.endLine = Number(argv[++index] || Infinity);
    else if (arg === '--target-id') options.targetId = String(argv[++index] || '');
    else if (arg === '--target-name') options.targetName = String(argv[++index] || '');
    else if (arg === '--mode') options.mode = String(argv[++index] || 'combat');
    else if (arg === '--hit-radius') options.hitRadius = Number(argv[++index] || 90);
    else if (arg === '--attack-range') options.attackRange = Number(argv[++index] || 14500);
    else if (arg === '--disengage-range') options.disengageRange = Number(argv[++index] || 17000);
    else if (arg === '--control-interval-ms') options.controlIntervalMs = Number(argv[++index] || 160);
    else if (arg === '--min-improvement-pct') options.minImprovementPct = Number(argv[++index] || 0);
    else if (arg === '--expect-new-exit') options.expectNewExit = true;
    else if (arg === '--trust-easy-kill-before-damage') options.trustEasyKillBeforeDamage = true;
    else if (arg === '--execution-delay-ticks') options.executionDelayTicks = Number(argv[++index] || 5);
    else if (arg === '--trajectory-route-selection-mode') options.trajectoryRouteSelectionMode = String(argv[++index] || 'weighted');
    else if (arg === '--trajectory-improvement-gate') options.trajectoryImprovementGate = String(argv[++index] || 'on') !== 'off';
    else if (arg === '--trajectory-route-sequence-phase') options.trajectoryRouteSequencePhase = Number(argv[++index] || 0);
    else if (arg === '--cutoff-at') options.cutoffAt = String(argv[++index] || '');
    else if (arg === '--expect-cases') options.expectCases = Number(argv[++index] || 0);
    else if (arg === '--expect-tail-loss') options.expectTailLoss = Number(argv[++index]);
    else if (arg === '--projected-leave-p50-ms') options.projectedLeaveP50Ms = Number(argv[++index] || 400);
    else if (arg === '--projected-leave-p95-ms') options.projectedLeaveP95Ms = Number(argv[++index] || 700);
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!options.file) throw new Error('--file is required');
  return options;
}

function selectedEntries(options) {
  const entries = [];
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
  // Per-battle logs are stored gzip-compressed (`<engagement>.jsonl.gz`). Those
  // files are bounded to a single engagement, so decompressing in memory and
  // iterating lines keeps the same line-range semantics as raw JSONL.
  if (/\.gz$/i.test(options.file)) {
    const text = require('zlib').gunzipSync(fs.readFileSync(options.file)).toString('utf8');
    const lines = text.split('\n');
    for (const raw of lines) {
      if (finished) break;
      consume(raw.replace(/\r$/, ''));
    }
    return entries;
  }
  const descriptor = fs.openSync(options.file, 'r');
  const decoder = new StringDecoder('utf8');
  const buffer = Buffer.allocUnsafe(64 * 1024);
  let carry = '';
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

function runtimeLogDirectoryForBattle(file) {
  const directory = path.dirname(file);
  return path.basename(directory) === 'battles' ? path.dirname(directory) : directory;
}

function movementReplayLogFiles(options = {}) {
  const directory = runtimeLogDirectoryForBattle(options.file || '');
  return {
    runnerFile: options.runnerFile || path.join(directory, 'runner.jsonl'),
    wsFile: options.wsFile || path.join(directory, 'ws.jsonl')
  };
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

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function optionalNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  return numberOrNull(value);
}

function normalizedReplayCombatEntity(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const stamina5s = source.stamina_5s_remaining_milli
    ?? source.stamina5sRemainingMilli
    ?? source.stamina5s;
  return {
    ...source,
    ...(stamina5s === null || stamina5s === undefined
      ? {}
      : { stamina_5s_remaining_milli: stamina5s })
  };
}

function normalizeVector(dx, dy) {
  const length = Math.hypot(Number(dx) || 0, Number(dy) || 0);
  if (!(length > 0)) return { x: 0, y: 0 };
  return { x: (Number(dx) || 0) / length, y: (Number(dy) || 0) / length };
}

function targetAtTick(rows, tick) {
  let indexed = rows.__targetTickIndex;
  if (!indexed) {
    indexed = rows
      .map(row => ({ row, tick: Number(row.detail.tick) }))
      .filter(item => Number.isFinite(item.tick));
    Object.defineProperty(rows, '__targetTickIndex', {
      configurable: true,
      enumerable: false,
      value: indexed
    });
  }
  let low = 0;
  let high = indexed.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (indexed[middle].tick < tick) low = middle + 1;
    else high = middle;
  }
  const after = indexed[low]?.row || null;
  const before = after && Number(after.detail.tick) === Number(tick)
    ? after
    : (indexed[low - 1]?.row || null);
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

function theoreticalShotMinimumMiss(rows, ack) {
  const startX = Number(ack.start_x);
  const startY = Number(ack.start_y);
  const speed = Math.max(1, Number(ack.speed_per_tick || 500));
  const createdTick = Number(ack.created_tick);
  const expireTick = Number(ack.expire_tick || createdTick + 30);
  let minimum = Infinity;
  for (let tick = createdTick; tick <= expireTick; tick += 1) {
    const target = targetAtTick(rows, tick);
    if (!target) continue;
    const targetDistance = Math.hypot(Number(target.x) - startX, Number(target.y) - startY);
    minimum = Math.min(minimum, Math.abs(targetDistance - speed * (tick - createdTick)));
  }
  return minimum;
}

const confirmedShotAckCache = new Map();

function confirmedShotAcksForFile(wsFile) {
  const resolved = path.resolve(wsFile);
  if (confirmedShotAckCache.has(resolved)) return confirmedShotAckCache.get(resolved);
  const shots = [];
  forEachJsonlEntry(resolved, entry => {
    const at = Date.parse(entry?.at || '');
    const ack = entry?.detail?.decodedSummary?.ack;
    if (!Number.isFinite(at) || !ack) return;
    shots.push({ at, ack });
  });
  confirmedShotAckCache.set(resolved, shots);
  return shots;
}

function confirmedShotsForRows(options, rows) {
  if (!rows.length) return [];
  const wsFile = options.wsFile || movementReplayLogFiles(options).wsFile;
  if (!fs.existsSync(wsFile)) return [];
  const firstAt = Date.parse(rows[0].entry.at) - 3000;
  const lastAt = Date.parse(rows[rows.length - 1].entry.at) + 3000;
  const selfId = String(rows[0].detail.self?.userId ?? '');
  return confirmedShotAcksForFile(wsFile).filter(shot => (
    shot.at >= firstAt
      && shot.at <= lastAt
      && String(shot.ack.owner_user_id ?? '') === selfId
  ));
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

function replayCombatExchangeStopLoss(rows) {
  if (!rows.length) return null;
  const startedAt = Date.parse(rows[0].entry.at);
  let degradationSinceAt = 0;
  let retreatSinceAt = 0;
  let retreatSelfDamageBaseline = 0;
  let retreatTargetDamageBaseline = 0;
  let firstActive = null;
  let firstTriggered = null;
  let firstDisengage = null;
  let firstExit = null;
  let baselineTriggered = false;
  const damageWindow = (endIndex, windowMs) => {
    const nowMs = Date.parse(rows[endIndex].entry.at);
    let startIndex = endIndex;
    while (startIndex > 0 && nowMs - Date.parse(rows[startIndex - 1].entry.at) <= windowMs) startIndex -= 1;
    const windowRows = rows.slice(startIndex, endIndex + 1);
    const first = windowRows[0]?.detail || {};
    const last = windowRows[windowRows.length - 1]?.detail || {};
    let damageObservations = 0;
    for (let index = 1; index < windowRows.length; index += 1) {
      const previous = windowRows[index - 1].detail || {};
      const current = windowRows[index].detail || {};
      if (Number(current.self?.hp) < Number(previous.self?.hp)
        || Number(current.target?.hp) < Number(previous.target?.hp)) damageObservations += 1;
    }
    return {
      selfDamage: Math.max(0, Number(first.self?.hp || 0) - Number(last.self?.hp || 0)),
      targetDamage: Math.max(0, Number(first.target?.hp || 0) - Number(last.target?.hp || 0)),
      distanceProgressCm: Number(first.target?.distance || 0) - Number(last.target?.distance || 0),
      damageObservations
    };
  };
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const nowMs = Date.parse(row.entry.at);
    const short = damageWindow(index, 10000);
    const long = damageWindow(index, 20000);
    const recent = damageWindow(index, 10000);
    const input = {
      nowMs,
      engagedMs: Math.max(0, nowMs - startedAt),
      acceptedShots: Number(row.detail.metrics?.acceptedShots || 0),
      damageObservations: Math.max(short.damageObservations, long.damageObservations),
      selfHp: Number(row.detail.self?.hp),
      targetHp: Number(row.detail.target?.hp),
      windowMs: 10000,
      windowSelfDamage: short.selfDamage,
      windowTargetDamage: short.targetDamage,
      longWindowSelfDamage: long.selfDamage,
      longWindowTargetDamage: long.targetDamage,
      distanceProgressCm: long.distanceProgressCm,
      recentTargetDamage: recent.targetDamage,
      cumulativeSelfDamage: Number(row.detail.metrics?.selfDamage || 0),
      cumulativeTargetDamage: Number(row.detail.metrics?.targetDamage || 0),
      distance: Number(row.detail.target?.distance),
      recentThreatBulletCount: Number(row.detail.metrics?.threatBulletCount || 0) > 0 ? 1 : 0,
      defensive: Boolean(row.detail.exchangeStopLoss?.defensive
        || row.detail.target?.combatIntent === 'defensive'
        || Number(row.detail.metrics?.threatBulletCount || 0) > 0
        || Number(row.detail.metrics?.selfDamage || 0) > 0)
    };
    const baseline = evaluateCombatExchangeStopLossCore(
      { ...input, degradationSinceAt: 0 },
      { poorExchangeMinEngageMs: Infinity }
    );
    const improved = evaluateCombatExchangeStopLossCore({
      ...input,
      degradationSinceAt,
      retreatSinceAt,
      retreatSelfDamageBaseline,
      retreatTargetDamageBaseline
    });
    degradationSinceAt = improved.degradationSinceAt;
    retreatSinceAt = improved.retreatSinceAt;
    retreatSelfDamageBaseline = improved.retreatSelfDamageBaseline;
    retreatTargetDamageBaseline = improved.retreatTargetDamageBaseline;
    if (baseline.triggered) baselineTriggered = true;
    if (!firstActive && improved.active) {
      firstActive = {
        line: row.line,
        at: row.entry.at,
        elapsedMs: nowMs - startedAt,
        rule: improved.rule,
        selfHp: Number(row.detail.self?.hp),
        targetHp: Number(row.detail.target?.hp)
      };
    }
    if (!firstTriggered && improved.triggered) {
      firstTriggered = {
        line: row.line,
        at: row.entry.at,
        elapsedMs: nowMs - startedAt,
        confirmationMs: firstActive ? nowMs - Date.parse(firstActive.at) : null,
        rule: improved.rule,
        reason: improved.reason,
        selfHp: Number(row.detail.self?.hp),
        targetHp: Number(row.detail.target?.hp)
      };
    }
    if (!firstDisengage && improved.disengage) {
      firstDisengage = {
        line: row.line,
        at: row.entry.at,
        elapsedMs: nowMs - startedAt,
        acceptedShots: Number(row.detail.metrics?.acceptedShots || 0),
        totalStaminaSpent: Number(row.detail.metrics?.totalStaminaSpent || 0),
        selfDamage: Number(row.detail.metrics?.selfDamage || 0),
        targetDamage: Number(row.detail.metrics?.targetDamage || 0),
        selfHp: Number(row.detail.self?.hp),
        targetHp: Number(row.detail.target?.hp),
        reason: improved.phasedReason
      };
    }
    if (!firstExit && improved.shouldExit) {
      firstExit = {
        line: row.line,
        at: row.entry.at,
        elapsedMs: nowMs - startedAt,
        retreatMs: Math.max(0, nowMs - Number(improved.retreatSinceAt || nowMs)),
        acceptedShots: Number(row.detail.metrics?.acceptedShots || 0),
        totalStaminaSpent: Number(row.detail.metrics?.totalStaminaSpent || 0),
        selfDamage: Number(row.detail.metrics?.selfDamage || 0),
        targetDamage: Number(row.detail.metrics?.targetDamage || 0),
        selfHp: Number(row.detail.self?.hp),
        targetHp: Number(row.detail.target?.hp),
        reason: improved.phasedReason
      };
    }
  }
  const initialSelfHp = Number(rows[0].detail.self?.hp);
  const finalSelfHp = Number(rows[rows.length - 1].detail.self?.hp);
  const firstMetrics = rows[0].detail.metrics || {};
  const lastMetrics = rows[rows.length - 1].detail.metrics || {};
  const baselineAcceptedShots = Math.max(0, Number(lastMetrics.acceptedShots || 0) - Number(firstMetrics.acceptedShots || 0));
  const stopPoint = firstDisengage || firstExit;
  const retainedAcceptedShots = stopPoint
    ? Math.max(0, Number(stopPoint.acceptedShots || 0) - Number(firstMetrics.acceptedShots || 0))
    : baselineAcceptedShots;
  const baselineStamina = Math.max(0, Number(lastMetrics.totalStaminaSpent || 0) - Number(firstMetrics.totalStaminaSpent || 0));
  const retainedStamina = stopPoint
    ? Math.max(0, Number(stopPoint.totalStaminaSpent || 0) - Number(firstMetrics.totalStaminaSpent || 0))
    : baselineStamina;
  const baselineSelfDamage = Math.max(0, Number(lastMetrics.selfDamage || 0) - Number(firstMetrics.selfDamage || 0));
  const retainedSelfDamage = firstExit
    ? Math.max(0, Number(firstExit.selfDamage || 0) - Number(firstMetrics.selfDamage || 0))
    : baselineSelfDamage;
  const baselineTargetDamage = Math.max(0, Number(lastMetrics.targetDamage || 0) - Number(firstMetrics.targetDamage || 0));
  const retainedTargetDamage = stopPoint
    ? Math.max(0, Number(stopPoint.targetDamage || 0) - Number(firstMetrics.targetDamage || 0))
    : baselineTargetDamage;
  return {
    baselineTriggered,
    firstActive,
    firstTriggered,
    firstDisengage,
    firstExit,
    comparison: {
      baselineAcceptedShots,
      retainedAcceptedShots,
      suppressedAcceptedShots: Math.max(0, baselineAcceptedShots - retainedAcceptedShots),
      baselineStamina,
      retainedStamina,
      staminaSavedBeforeRetreat: Math.max(0, baselineStamina - retainedStamina),
      baselineSelfDamage,
      retainedSelfDamage,
      baselineTargetDamage,
      retainedTargetDamage
    },
    selfDamageBeforeTrigger: firstTriggered && Number.isFinite(initialSelfHp)
      ? Math.max(0, initialSelfHp - Number(firstTriggered.selfHp))
      : null,
    observedWindowSelfDamage: Number.isFinite(initialSelfHp) && Number.isFinite(finalSelfHp)
      ? Math.max(0, initialSelfHp - finalSelfHp)
      : null,
    accepted: Boolean(stopPoint
      && retainedTargetDamage >= baselineTargetDamage
      && (retainedAcceptedShots < baselineAcceptedShots || retainedSelfDamage < baselineSelfDamage))
  };
}

function replayCombat(options) {
  const allRows = selectedEntries(options);
  const rows = allRows.filter(({ detail }) => String(detail.target?.userId ?? '') === options.targetId);
  const confirmedShots = confirmedShotsForRows(options, rows);
  const state = { motionSamples: [] };
  const baselineMisses = [];
  const improvedMisses = [];
  const trajectoryCoverageMisses = [];
  const trajectoryCoverageSelections = {};
  const trajectoryCoverageVirtualShots = [];
  let trajectoryCoverageActiveShots = 0;
  let trajectoryCoverageFallbackShots = 0;
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
    const replaySelf = normalizedReplayCombatEntity(row.detail.self);
    const replayTarget = normalizedReplayCombatEntity(row.detail.target);
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
    const loggedBehavior = row.detail.behavior && typeof row.detail.behavior === 'object'
      ? row.detail.behavior
      : null;
    state.opponentBehaviorState = loggedBehavior?.mode
      ? {
          ...replayBehavior,
          ...loggedBehavior,
          metrics: loggedBehavior.metrics || replayBehavior?.metrics || null,
          responsePolicy: loggedBehavior.responsePolicy || opponentResponsePolicyCore(loggedBehavior.mode, {
            distance: row.detail.target?.distance,
            nowMs: Date.parse(row.entry.at)
          })
        }
      : replayBehavior;
    state.provenHitRate = Math.max(Number(state.provenHitRate || 0), Number(row.detail.behavior?.recentHitRate || 0));
    state.noDamageMs = Number(row.detail.aim?.noDamageMs || 0);
    // Preserve the production classification captured with the frame when it
    // exists. Recomputing it from the shortened replay history can incorrectly
    // admit high-entropy route coverage before the logged runtime did.
    state.fireRiskClassification = row.detail.shooting?.fireRiskClassification
      || state.fireRiskClassification
      || null;
    const replayExecutionDelayTicks = numberOrNull(row.detail.aim?.timing?.executionDelayTicks)
      ?? options.executionDelayTicks;
    const recomputedAim = estimateAim(replaySelf, replayTarget, {
      combatTargetState: state,
      observedTick: row.detail.tick,
      executionTiming: {
        medianTicks: replayExecutionDelayTicks,
        p90Ticks: replayExecutionDelayTicks,
        madTicks: 0,
        source: 'logged-frame-execution-delay'
      },
      actualShots: shotEvaluations.length,
      // The legacy fixed four-route rotation is intentionally available only
      // to this offline replay path so the production weighted selector can
      // be compared on identical accepted-shot opportunities.
      trajectoryRouteSelectionMode: options.trajectoryRouteSelectionMode,
      combatDynamicRouteSequencePhase: options.trajectoryRouteSequencePhase
    });
    const replayDynamicBehaviorEligible = dynamicBehaviorTrajectoryEligibilityCore(
      state.opponentBehaviorState || replayBehavior
    );
    const loggedAim = row.detail.aim && typeof row.detail.aim === 'object' ? row.detail.aim : null;
    const improved = !replayDynamicBehaviorEligible && loggedAim
      ? {
          ...recomputedAim,
          x: Number(loggedAim.x),
          y: Number(loggedAim.y),
          mode: String(loggedAim.mode || recomputedAim.mode || 'logged-aim'),
          routeCoverage: null,
          trajectoryCoverage: loggedAim.trajectoryCoverage || null
        }
      : recomputedAim;
    state.fireRiskClassification = improved.fireRiskClassification || state.fireRiskClassification || null;
    const baselineMiss = bulletCorridorMiss(rows, shot.ack);
    const improvedMiss = bulletCorridorMiss(rows, shot.ack, improved);
    const coverageEligible = Boolean(
      (improved.fireRiskClassification?.highEntropy
        || /^high-entropy-/.test(String(improved.routeCoverage?.style || ''))
        || improved.routeCoverage?.dynamicBehaviorEligible === true)
      && improved.routeCoverage?.candidates?.length
      && improved.fireReachability?.unreachable !== true
    );
    const coveragePlan = coverageEligible
      ? buildTrajectoryCoveragePlanCore({
          targetId: options.targetId,
          createdTick,
          executionDelayTicks: improved.timing?.executionDelayTicks ?? options.executionDelayTicks,
          controlIntervalTicks: Math.max(1, Math.ceil(Number(options.controlIntervalMs || 160) / 50)),
          learnedDwellTicks: 0,
          flightTicks: improved.flightTicks,
          predictedShooterOrigin: {
            x: Number(shot.ack.start_x),
            y: Number(shot.ack.start_y)
          },
          predictedTargetAtCreation: improved.predictedTargetAtCreation,
          baselineAim: { x: Number(improved.x), y: Number(improved.y) },
          target: replayTarget,
          routeCandidates: improved.routeCoverage.candidates,
          existingShots: trajectoryCoverageVirtualShots
        }, {
          bulletSpeedCmPerTick: Number(shot.ack.speed_per_tick || 500),
          bulletLifetimeTicks: Math.max(1, Number(shot.ack.expire_tick || createdTick + 30) - createdTick),
          hitRadiusCm: options.hitRadius,
          minimumMarginalCoverage: 0.02
        })
      : null;
    const coverageRecentShotCount = Number(row.detail.shooting?.recentAcceptedShotCount || 0);
    const coverageRecentHitRate = Number(row.detail.shooting?.recentAcceptedHitRate || 0);
    const coverageSuccessfulAimProtected = coverageRecentShotCount >= 10 && coverageRecentHitRate >= 0.12;
    const coverageApplied = shouldApplyTrajectoryCoverageCore({
      mode: 'live-single',
      highEntropy: Boolean(improved.fireRiskClassification?.highEntropy
        || /^high-entropy-/.test(String(improved.routeCoverage?.style || ''))),
      dynamicBehaviorEligible: dynamicBehaviorTrajectoryEligibilityCore(state.opponentBehaviorState || replayBehavior),
      successfulAimProtected: coverageSuccessfulAimProtected,
      planActive: coveragePlan?.active === true,
      hasSelection: Boolean(coveragePlan?.selected),
      improvementQualified: options.trajectoryImprovementGate === false
        ? true
        : coveragePlan?.selected?.improvementQualified === true
    });
    const coverageAim = coverageApplied
      ? { x: coveragePlan.selected.aimX, y: coveragePlan.selected.aimY }
      : improved;
    const trajectoryCoverageMiss = bulletCorridorMiss(rows, shot.ack, coverageAim);
    trajectoryCoverageMisses.push(trajectoryCoverageMiss);
    if (coverageApplied) {
      trajectoryCoverageActiveShots += 1;
      const key = `${coveragePlan.selected.hypothesis}:${coveragePlan.selected.variant}`;
      trajectoryCoverageSelections[key] = Number(trajectoryCoverageSelections[key] || 0) + 1;
    } else {
      trajectoryCoverageFallbackShots += 1;
    }
    const coverageDirection = normalizeVector(
      Number(coverageAim.x) - Number(shot.ack.start_x),
      Number(coverageAim.y) - Number(shot.ack.start_y)
    );
    trajectoryCoverageVirtualShots.push({
      id: `coverage-${String(shot.ack.bullet_id ?? shotEvaluations.length)}`,
      targetId: options.targetId,
      startX: Number(shot.ack.start_x),
      startY: Number(shot.ack.start_y),
      directionX: coverageDirection.x,
      directionY: coverageDirection.y,
      createdTick,
      expireTick: Number(shot.ack.expire_tick || createdTick + 30),
      speedPerTick: Number(shot.ack.speed_per_tick || 500),
      coverageAimX: Number(coverageAim.x),
      coverageAimY: Number(coverageAim.y)
    });
    while (trajectoryCoverageVirtualShots.length
      && Number(trajectoryCoverageVirtualShots[0].expireTick || 0) < createdTick) {
      trajectoryCoverageVirtualShots.shift();
    }
    const routeCandidateMisses = Object.fromEntries((improved.routeCoverage?.candidates || []).map(candidate => [
      candidate.hypothesis,
      bulletCorridorMiss(rows, shot.ack, candidate)
    ]));
    baselineMisses.push(baselineMiss);
    improvedMisses.push(improvedMiss);
    const selectedRoute = improved.routeCoverage?.candidates?.find(candidate => candidate.hypothesis === improved.routeCoverage?.selected) || null;
    const closeRangeRows = rows.slice(Math.max(0, rowIndex - 2), rowIndex + 1);
    const closeRangeFireOverride = closeRangeRows.length === 3
      && closeRangeRows.every(item => {
        const distance = Number(item.detail.target?.distance);
        return Number.isFinite(distance) && distance >= 4500 && distance <= 5500;
      });
    shotEvaluations.push({
      shot,
      baselineMiss,
      improvedMiss,
      trajectoryCoverageMiss,
      trajectoryCoveragePlan: coveragePlan,
      coverageApplied,
      line: row.line,
      at: Number(shot.at || 0),
      distance: numberOrNull(row.detail.target?.distance),
      closePressure: Boolean(row.detail.combatPhase?.active || row.detail.shooting?.closePressure),
      closeRangeFireOverride,
      aimMode: improved.mode || '',
      hypothesis: improved.motionProbe?.hypothesis || 'baseline',
      routeStyle: improved.routeCoverage?.style || '',
      aimConfidence: Number(improved.confidence || 0),
      selectedRouteProbability: Number(selectedRoute?.probability || 0),
      expectedHitProbability: Number(selectedRoute?.expectedHitProbability
        ?? (Number(selectedRoute?.probability || 0) * Number(improved.confidence || 0))),
      fireRiskClassification: row.detail.shooting?.fireRiskClassification
        ? {
            ...(improved.fireRiskClassification || {}),
            ...row.detail.shooting.fireRiskClassification,
            coverageAffordable: improved.fireRiskClassification?.coverageAffordable,
            affordabilityDegraded: improved.fireRiskClassification?.affordabilityDegraded,
            routeCoverageAvailable: improved.fireRiskClassification?.routeCoverageAvailable
          }
        : (improved.fireRiskClassification || null),
      fireReachability: improved.fireReachability || null,
      theoreticalMinimumMiss: theoreticalShotMinimumMiss(rows, shot.ack),
      routeCandidateMisses,
      routeContextKey: String(improved.routeCoverage?.contextKey || ''),
      routeCandidate: String(improved.routeCoverage?.selected || ''),
      behaviorMode: String(row.detail.behavior?.mode || ''),
      responsePolicy: String(row.detail.behavior?.responsePolicy?.name || ''),
      directionState: String(row.detail.behavior?.metrics?.movementPhase?.currentDirection
        || row.detail.behavior?.metrics?.movementTransitions?.phase?.currentDirection
        || ''),
      directionDwellTicks: Number(row.detail.behavior?.metrics?.movementPhase?.dwellTicks
        || row.detail.behavior?.metrics?.movementTransitions?.phase?.dwellTicks
        || 0),
      directionFlipAt: Number(row.detail.behavior?.metrics?.lastLateralFlipAt || 0),
      distance: Number(row.detail.target?.distance || 0),
      aimX: Number(improved.x),
      aimY: Number(improved.y),
      selfHp: Number(row.detail.self?.hp),
      targetHp: Number(row.detail.target?.hp),
      defensivePressure: Boolean(
        row.detail.shooting?.defensivePressure
          || row.detail.target?.firing
          || row.detail.movement?.dodge?.threatField?.some(item => Number(item?.directHits || 0) > 0)
      ),
      routeCandidateMisses,
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
  const aimDiagnostics = {};
  for (const item of shotEvaluations) {
    const key = `${item.routeStyle || item.aimMode || 'unknown'}|${item.hypothesis || 'baseline'}`;
    const cell = aimDiagnostics[key] || { shots: 0, estimatedHits: 0, missTotalCm: 0 };
    cell.shots += 1;
    cell.estimatedHits += item.improvedMiss <= options.hitRadius ? 1 : 0;
    cell.missTotalCm += Number(item.improvedMiss || 0);
    aimDiagnostics[key] = cell;
  }
  for (const cell of Object.values(aimDiagnostics)) {
    cell.meanAimMissCm = cell.shots ? Number((cell.missTotalCm / cell.shots).toFixed(1)) : null;
    delete cell.missTotalCm;
  }
  const routeCandidateOracle = {};
  for (const item of shotEvaluations) {
    for (const [hypothesis, miss] of Object.entries(item.routeCandidateMisses || {})) {
      const cell = routeCandidateOracle[hypothesis] || { shots: 0, estimatedHits: 0, missTotalCm: 0 };
      cell.shots += 1;
      cell.estimatedHits += miss <= options.hitRadius ? 1 : 0;
      cell.missTotalCm += Number(miss || 0);
      routeCandidateOracle[hypothesis] = cell;
    }
  }
  for (const cell of Object.values(routeCandidateOracle)) {
    cell.meanAimMissCm = cell.shots ? Number((cell.missTotalCm / cell.shots).toFixed(1)) : null;
    delete cell.missTotalCm;
  }
  const damageEvents = combatDamageEvents(rows);
  const damageAttributions = attributeTargetDamageToShots(rows, shotEvaluations, damageEvents.target, {
    hitRadius: options.hitRadius
  });
  const attributedBulletIds = new Set(damageAttributions.map(item => String(item.bulletId ?? '')).filter(Boolean));
  const fireDisciplineReasons = {};
  const allowedShots = [];
  const recentAllowed = [];
  let noProgressAcceptedShots = 0;
  let lastProgressAt = startedAt;
  let lastAllowedAt = 0;
  let cadenceSuppressedShots = 0;
  let gateSuppressedShots = 0;
  let probeSuppressedShots = 0;
  let firstSuppressed = null;
  let probeState = null;
  const suppressedEstimatedHitSamples = [];
  for (const item of shotEvaluations) {
    const recent = recentAllowed.slice(-15);
    const recentHits = recent.filter(shot => shot.credited).length;
    const expectedHitProbability = Math.max(0, Math.min(1, Number(item.expectedHitProbability
      ?? (Number(item.selectedRouteProbability || 0) * Math.max(0, Math.min(1, Number(item.aimConfidence || 0)))))));
    const gate = evaluateHighEntropyFireGateCore({
      expectedHitProbability,
      recentHitRate: recent.length ? recentHits / recent.length : 0,
      recentShotCount: recent.length,
      noProgressAcceptedShots,
      noDamageMs: Math.max(0, Number(item.shot.at || 0) - lastProgressAt),
      selfHp: item.selfHp,
      targetHp: item.targetHp,
      fireRiskClassification: item.fireRiskClassification,
      highEntropy: Boolean(item.fireRiskClassification?.highEntropy),
      unreachableIntercept: Boolean(item.fireReachability?.unreachable),
      reachabilityGapCm: item.fireReachability?.rangeGapCm,
      defensivePressure: item.defensivePressure
    });
    const probe = updateCombatProbePhaseCore(probeState, {
      nowMs: Number(item.shot.at || 0),
      targetId: options.targetId,
      acceptedShots: allowedShots.length,
      confirmedHits: allowedShots.filter(shot => attributedBulletIds.has(String(shot.shot.ack.bullet_id ?? ''))).length,
      shootingStamina: allowedShots.length * 500,
      highEntropy: Boolean(item.fireRiskClassification?.highEntropy),
      behaviorMode: item.behaviorMode,
      responsePolicy: item.responsePolicy,
      directionState: item.directionState,
      directionDwellTicks: item.directionDwellTicks,
      directionFlipAt: item.directionFlipAt,
      routeContextKey: item.routeContextKey,
      routeCandidate: item.routeCandidate,
      routeProbability: item.selectedRouteProbability,
      predictedHitProbability: expectedHitProbability,
      recentHitRate: recent.length ? recentHits / recent.length : 0,
      recentShotCount: recent.length,
      distance: item.distance,
      aimX: item.aimX,
      aimY: item.aimY,
      defensivePressure: item.defensivePressure,
      finishingTarget: item.targetHp <= 20 && item.selfHp >= item.targetHp + 10
    });
    probeState = probe;
    const sharedBudget = evaluateCombatFireBudgetCore({
      targetId: options.targetId,
      acceptedShotsSinceDamage: noProgressAcceptedShots,
      fireGate: gate,
      probeState: probe,
      trajectoryCoverage: item.trajectoryCoveragePlan || null,
      closePressure: Number(item.shot.at || 0) - startedAt >= 60000,
      closeRangeFireOverride: item.closeRangeFireOverride
    }, {
      minimumMarginalCoverage: 0.02,
      geometryRearmShots: probe.geometryReprobeMaxShots,
      maxGeometryRearms: probe.maxGeometryRearms
    });
    const probeBlocked = false;
    const gateBlocked = sharedBudget.suppressFire;
    const cadenceBlocked = !gateBlocked && !probeBlocked
      && gate.minimumCadenceMs > 0
      && lastAllowedAt > 0
      && Number(item.shot.at || 0) - lastAllowedAt < gate.minimumCadenceMs;
    const gateReason = gateBlocked
      ? sharedBudget.suppressionReason
      : (sharedBudget.authorizationSource || gate.reason);
    fireDisciplineReasons[gateReason] = Number(fireDisciplineReasons[gateReason] || 0) + 1;
    if (gateBlocked || probeBlocked || cadenceBlocked) {
      if (gateBlocked) gateSuppressedShots += 1;
      else if (probeBlocked) probeSuppressedShots += 1;
      else cadenceSuppressedShots += 1;
      if (!firstSuppressed) {
        firstSuppressed = {
          line: rows[Math.max(0, rows.findLastIndex(row => Number(row.detail.tick) <= Number(item.shot.ack.created_tick)))]?.line ?? null,
          at: new Date(Number(item.shot.at || 0)).toISOString(),
          reason: gateBlocked || probeBlocked ? gateReason : 'high-entropy-cadence',
          noProgressAcceptedShots,
          recentHitRate: recent.length ? recentHits / recent.length : 0,
          expectedHitProbability,
          sharedBudgetUsed: sharedBudget.sharedBudgetUsed,
          sharedBudgetRemaining: sharedBudget.sharedBudgetRemaining,
          marginalCoverage: sharedBudget.marginalCoverage
        };
      }
      if (item.improvedMiss <= options.hitRadius && suppressedEstimatedHitSamples.length < 12) {
        suppressedEstimatedHitSamples.push({
          at: new Date(Number(item.shot.at || 0)).toISOString(),
          reason: gateBlocked || probeBlocked ? gateReason : 'high-entropy-cadence',
          expectedHitProbability,
          routeCandidate: item.routeCandidate,
          routeProbability: item.selectedRouteProbability,
          improvedMissCm: Number(item.improvedMiss.toFixed(1))
        });
      }
      continue;
    }
    const bulletId = String(item.shot.ack.bullet_id ?? '');
    const credited = attributedBulletIds.has(bulletId);
    allowedShots.push(item);
    recentAllowed.push({ credited });
    lastAllowedAt = Number(item.shot.at || 0);
    if (credited) {
      noProgressAcceptedShots = 0;
      lastProgressAt = lastAllowedAt;
    } else {
      noProgressAcceptedShots += 1;
    }
  }
  const allowedEstimatedHits = allowedShots.filter(item => item.improvedMiss <= options.hitRadius).length;
  const allowedAttributedHits = allowedShots.filter(item => attributedBulletIds.has(String(item.shot.ack.bullet_id ?? ''))).length;
  const baselineEvidenceHits = damageAttributions.length > 0 ? damageAttributions.length : improvedHits;
  const allowedEvidenceHits = damageAttributions.length > 0 ? allowedAttributedHits : allowedEstimatedHits;
  const baselineEvidenceRate = confirmedShots.length > 0 ? baselineEvidenceHits / confirmedShots.length : 0;
  const allowedEvidenceRate = allowedShots.length > 0 ? allowedEvidenceHits / allowedShots.length : 0;
  const positiveControlPreserved = damageAttributions.length > 0
    && gateSuppressedShots === 0
    && probeSuppressedShots === 0;
  const emptyWasteReduced = allowedShots.length < confirmedShots.length
    && damageAttributions.length === 0;
  const efficientSuppression = allowedShots.length < confirmedShots.length
    && allowedEvidenceHits > 0
    && allowedEvidenceRate >= baselineEvidenceRate
    && allowedEvidenceHits >= Math.ceil(baselineEvidenceHits * 0.4);
  const fireDisciplineReplay = {
    baselineConfirmedShots: confirmedShots.length,
    allowedConfirmedShots: allowedShots.length,
    suppressedShots: confirmedShots.length - allowedShots.length,
    cadenceSuppressedShots,
    gateSuppressedShots,
    probeSuppressedShots,
    finalProbeState: probeState,
    suppressedEstimatedHitSamples,
    baselineEstimatedHits: improvedHits,
    allowedEstimatedHits,
    baselineAttributedHits: damageAttributions.length,
    allowedAttributedHits,
    estimatedTargetDamage: allowedEstimatedHits * 3,
    shootingStaminaCost: allowedShots.length * 500,
    staminaSaved: Math.max(0, confirmedShots.length - allowedShots.length) * 500,
    estimatedHitRate: confirmedShots.length > 0 ? improvedHits / confirmedShots.length : 0,
    allowedEstimatedHitRate: allowedShots.length > 0 ? allowedEstimatedHits / allowedShots.length : 0,
    attributedHitRate: confirmedShots.length > 0 ? damageAttributions.length / confirmedShots.length : 0,
    allowedAttributedHitRate: allowedShots.length > 0 ? allowedAttributedHits / allowedShots.length : 0,
    evidenceSource: damageAttributions.length > 0 ? 'attributed-hit' : 'estimated-hit',
    evidenceRetention: baselineEvidenceHits > 0 ? allowedEvidenceHits / baselineEvidenceHits : 1,
    evidenceRateChange: baselineEvidenceRate > 0 ? allowedEvidenceRate / baselineEvidenceRate - 1 : 0,
    firstSuppressed,
    reasons: fireDisciplineReasons,
    accepted: Boolean(confirmedShots.length > 0
      && (positiveControlPreserved || emptyWasteReduced || efficientSuppression))
  };
  const exchangeStopLossReplay = replayCombatExchangeStopLoss(rows);
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
  const theoreticalMisses = shotEvaluations
    .map(item => Number(item.theoreticalMinimumMiss))
    .filter(Number.isFinite);
  const physicalReachability = {
    shots: theoreticalMisses.length,
    theoreticalHits: theoreticalMisses.filter(value => value <= options.hitRadius).length,
    unreachableShots: theoreticalMisses.filter(value => value > options.hitRadius).length,
    meanMinimumMissCm: theoreticalMisses.length
      ? Number((theoreticalMisses.reduce((sum, value) => sum + value, 0) / theoreticalMisses.length).toFixed(1))
      : null,
    minimumMissCm: theoreticalMisses.length ? Number(Math.min(...theoreticalMisses).toFixed(1)) : null,
    hitRadiusCm: options.hitRadius
  };
  const trajectoryCoverageHits = trajectoryCoverageMisses.filter(value => value <= options.hitRadius).length;
  const trajectoryCoverageReplay = {
    routeSelectionMode: options.trajectoryRouteSelectionMode || 'weighted',
    improvementGate: options.trajectoryImprovementGate !== false,
    shots: trajectoryCoverageMisses.length,
    activeShots: trajectoryCoverageActiveShots,
    fallbackShots: trajectoryCoverageFallbackShots,
    estimatedHits: trajectoryCoverageHits,
    estimatedTargetDamage: trajectoryCoverageHits * 3,
    meanAimMissCm: trajectoryCoverageMisses.length
      ? Number((trajectoryCoverageMisses.reduce((sum, value) => sum + value, 0) / trajectoryCoverageMisses.length).toFixed(1))
      : null,
    p50AimMissCm: percentile(trajectoryCoverageMisses, 0.5),
    p90AimMissCm: percentile(trajectoryCoverageMisses, 0.9),
    firstEstimatedDamageDelayMs: (() => {
      const index = trajectoryCoverageMisses.findIndex(value => value <= options.hitRadius);
      return index >= 0 ? Math.max(0, Number(confirmedShots[index]?.at || 0) - Number(confirmedShots[0]?.at || 0)) : null;
    })(),
    selections: Object.entries(trajectoryCoverageSelections)
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
      .slice(0, 12)
  };
  const closePressureRows = shotEvaluations
    .filter(item => item.closePressure || (Number(item.line) >= 1395 && Number(item.line) <= 1661));
  const closePressureCoverageMisses = closePressureRows
    .map(item => Number(item.trajectoryCoverageMiss))
    .filter(Number.isFinite);
  const closePressureCoverageReplay = {
    shots: closePressureCoverageMisses.length,
    estimatedHits: closePressureCoverageMisses.filter(value => value <= options.hitRadius).length,
    p50AimMissCm: percentile(closePressureCoverageMisses, 0.5),
    p90AimMissCm: percentile(closePressureCoverageMisses, 0.9),
    shootingStaminaCost: closePressureCoverageMisses.length * 500,
    nearestSamples: closePressureRows
      .sort((left, right) => Number(left.trajectoryCoverageMiss) - Number(right.trajectoryCoverageMiss))
      .slice(0, 8)
      .map(item => ({
        line: item.line,
        at: item.shot?.entry?.at || (item.at ? new Date(item.at).toISOString() : ''),
        missCm: Number(item.trajectoryCoverageMiss.toFixed(1)),
        theoreticalMinimumMissCm: Number(Number(item.theoreticalMinimumMiss).toFixed(1)),
        applied: item.coverageApplied,
        selected: item.trajectoryCoveragePlan?.selected || null,
        reason: item.trajectoryCoveragePlan?.reason || ''
        ,bestRouteMisses: Object.entries(item.routeCandidateMisses || {})
          .sort((a, b) => Number(a[1]) - Number(b[1]))
          .slice(0, 3)
          .map(([route, miss]) => ({ route, missCm: Number(Number(miss).toFixed(1)) }))
      }))
  };
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
    },
    exchangeStopLossReplay,
    fireDisciplineReplay,
    physicalReachability,
    trajectoryCoverageReplay,
    closePressureCoverageReplay,
    targetSwitchReplay: replayTargetSwitchHysteresis(allRows),
    aimDiagnostics,
    routeCandidateOracle
  };
  result.improved.accepted = rows.length > 0 && (
    Boolean(exchangeStopLossReplay?.accepted)
      || (confirmedShots.length > 0 && (
        improvedHits > baselineHits
        || result.improved.meanAimMissCm < result.baseline.meanAimMissCm
        || (physicalReachability.theoreticalHits === 0 && fireDisciplineReplay?.accepted)
        || (result.improved.firstEstimatedDamageDelayMs !== null
          && (result.baseline.firstEstimatedDamageDelayMs === null
            || result.improved.firstEstimatedDamageDelayMs < result.baseline.firstEstimatedDamageDelayMs))
      ))
  );
  return result;
}

function replayTargetSwitchIdentityRemap(rows = []) {
  const ids = Array.from(new Set(rows.map(row => String(
    row.detail?.target?.userId ?? row.detail?.target?.user_id ?? ''
  )).filter(Boolean)));
  const remap = new Map(ids.map((id, index) => [id, `replay-target-${index + 1}`]));
  return rows.map(row => {
    const detail = row.detail || {};
    const target = detail.target || {};
    const targetId = String(target.userId ?? target.user_id ?? '');
    const remappedTargetId = remap.get(targetId) || targetId;
    const threatField = detail.movement?.dodge?.threatField || [];
    return {
      ...row,
      detail: {
        ...detail,
        target: {
          ...target,
          ...(target.userId !== undefined ? { userId: remappedTargetId } : {}),
          ...(target.user_id !== undefined ? { user_id: remappedTargetId } : {}),
          name: targetId ? `Replay Target ${ids.indexOf(targetId) + 1}` : target.name
        },
        movement: {
          ...(detail.movement || {}),
          dodge: {
            ...(detail.movement?.dodge || {}),
            threatField: threatField.map(field => ({
              ...field,
              dangerousBullets: (field.dangerousBullets || []).map(bullet => {
                const ownerId = String(bullet.ownerId ?? bullet.owner_id ?? '');
                const remappedOwnerId = remap.get(ownerId) || ownerId;
                return {
                  ...bullet,
                  ...(bullet.ownerId !== undefined ? { ownerId: remappedOwnerId } : {}),
                  ...(bullet.owner_id !== undefined ? { owner_id: remappedOwnerId } : {})
                };
              })
            }))
          }
        }
      }
    };
  });
}

function replayTargetSwitchHysteresis(rows = [], options = {}) {
  const observations = rows
    .map(row => ({
      at: Date.parse(row.entry.at || ''),
      tick: numberOrNull(row.detail.tick),
      id: String(row.detail.target?.userId ?? row.detail.target?.user_id ?? ''),
      intent: String(row.detail.target?.combatIntent || ''),
      dangerousBullets: row.detail.movement?.dodge?.threatField?.[0]?.dangerousBullets || []
    }))
    .filter(item => Number.isFinite(item.at) && item.id);
  if (!observations.length) {
    return { historicalSwitches: 0, confirmedSwitches: 0, maxSwitchesIn10s: 0, oscillatingSwitches: 0, events: [], accepted: true };
  }
  const historical = [];
  let historicalTarget = observations[0];
  for (const item of observations.slice(1)) {
    if (historicalTarget.id === item.id) continue;
    historical.push({ from: historicalTarget, to: item, at: item.at });
    historicalTarget = item;
  }
  let selected = observations[0];
  let gate = null;
  let lastSwitch = null;
  const accepted = [];
  const observedRanges = new Map();
  for (const observation of observations) {
    const range = observedRanges.get(observation.id) || { firstAt: observation.at, lastAt: observation.at };
    range.firstAt = Math.min(range.firstAt, observation.at);
    range.lastAt = Math.max(range.lastAt, observation.at);
    observedRanges.set(observation.id, range);
  }
  const threatOptions = {
    combatTargetSwitchIncomingDistance: 6500,
    combatTargetSwitchIncomingTimeMs: 900,
    combatBulletHitRadiusCm: 90
  };
  for (const item of observations.slice(1)) {
    if (item.id === selected.id) {
      selected = item;
      gate = null;
      continue;
    }
    const bullets = item.dangerousBullets.map(bullet => ({
      ...bullet,
      ownerId: bullet.ownerId ?? bullet.owner_id,
      incoming: true,
      cpa: bullet.cpa ?? bullet.minCPA,
      distance: bullet.distance ?? bullet.currentDistance,
      timeToImpact: bullet.timeToImpactMs ?? bullet.timeToImpact
    }));
    const currentThreat = combatTargetIncomingThreatEvidenceCore(bullets, selected.id, threatOptions);
    const proposedThreat = combatTargetIncomingThreatEvidenceCore(bullets, item.id, threatOptions);
    const currentRange = observedRanges.get(selected.id);
    const currentVisible = Boolean(
      currentRange
        && item.at >= currentRange.firstAt
        && item.at <= currentRange.lastAt
    );
    const switchResult = applyCombatTargetSwitchHysteresisCore({
      currentTargetId: selected.id,
      currentVisibleTarget: currentVisible ? { user_id: selected.id } : null,
      proposedTarget: { user_id: item.id },
      currentInvalid: !currentVisible,
      urgentSafety: item.intent === 'defensive' && proposedThreat.urgent,
      currentThreat,
      proposedThreat,
      currentStickAgeMs: Math.max(0, item.at - selected.at),
      lastSwitch: lastSwitch ? {
        fromTargetId: lastSwitch.from.id,
        toTargetId: lastSwitch.to.id,
        at: lastSwitch.at
      } : null,
      nowMs: item.at
    }, gate, {
      confirmTicks: 3,
      urgentConfirmTicks: 3,
      oscillationWindowMs: 10000,
      threatTtiAdvantageMs: 250,
      threatDistanceAdvantageCm: 1500
    });
    gate = switchResult.gate;
    if (String(switchResult.target?.user_id || '') === item.id) {
      const event = {
        from: selected,
        to: item,
        at: item.at,
        reason: switchResult.diagnostic?.reason || 'current-target-invalid'
      };
      accepted.push(event);
      selected = item;
      lastSwitch = event;
      gate = null;
    }
  }
  const competitiveSwitches = accepted.filter(event => event.reason !== 'current-target-invalid');
  const oscillations = competitiveSwitches.filter((event, index) => index > 0
    && competitiveSwitches[index - 1].from.id === event.to.id
    && competitiveSwitches[index - 1].to.id === event.from.id
    && event.at - competitiveSwitches[index - 1].at <= 10000);
  const maxSwitchesIn10s = competitiveSwitches.reduce((max, event) => Math.max(max,
    competitiveSwitches.filter(candidate => candidate.at >= event.at && candidate.at <= event.at + 10000).length
  ), 0);
  const result = {
    historicalSwitches: historical.length,
    confirmedSwitches: accepted.length,
    focusSwitchesWhileCurrentValid: competitiveSwitches.length,
    maxSwitchesIn10s,
    oscillatingSwitches: oscillations.length,
    events: accepted.slice(0, 16).map(event => ({
      at: new Date(event.at).toISOString(),
      fromTargetId: event.from.id,
      toTargetId: event.to.id,
      reason: event.reason
    })),
    accepted: maxSwitchesIn10s <= 1 && oscillations.length === 0
  };
  if (options.verifyIdentityRemap !== false) {
    const remapped = replayTargetSwitchHysteresis(
      replayTargetSwitchIdentityRemap(rows),
      { verifyIdentityRemap: false }
    );
    result.identityRemapEquivalent = result.historicalSwitches === remapped.historicalSwitches
      && result.confirmedSwitches === remapped.confirmedSwitches
      && result.focusSwitchesWhileCurrentValid === remapped.focusSwitchesWhileCurrentValid
      && result.maxSwitchesIn10s === remapped.maxSwitchesIn10s
      && result.oscillatingSwitches === remapped.oscillatingSwitches
      && JSON.stringify(result.events.map(event => event.reason))
        === JSON.stringify(remapped.events.map(event => event.reason));
    result.accepted = result.accepted && result.identityRemapEquivalent;
  }
  return result;
}

function replayCombatTargetSwitch(options) {
  const rows = selectedEntries(options);
  return {
    mode: 'combat-target-switch',
    lines: `${options.startLine}-${options.endLine}`,
    frames: rows.length,
    ...replayTargetSwitchHysteresis(rows)
  };
}

function replayProfitThresholdDropout(options) {
  const rows = selectedEntries(options);
  const evaluations = rows.map(row => {
    const action = row.detail.action || {};
    const arbitration = action.finalActionArbitration || null;
    if (arbitration?.mode !== 'hold-previous'
      || arbitration?.reason !== 'profit-dropout-confirmation') return null;
    const rawOpportunities = (row.detail.profit?.threshold?.filtered || []).map(item => ({
      ...item,
      profitThresholdEligible: false,
      profitThresholdReason: String(item.reason || 'below-profit-threshold')
    }));
    const eligibility = currentProfitThresholdEligibility(action, { rawOpportunities });
    const explicitlyRejected = eligibility?.eligible === false;
    return {
      line: row.line,
      at: row.entry.at || '',
      kind: String(action.kind || ''),
      targetId: action.target?.id ?? action.target?.userId ?? action.target?.user_id ?? null,
      targetKey: eligibility?.key || '',
      historicalMode: arbitration.mode,
      historicalDropoutAgeMs: Number(arbitration.dropoutAgeMs ?? 0),
      explicitlyRejected,
      replayMode: explicitlyRejected ? 'current-action' : arbitration.mode,
      replayHeld: !explicitlyRejected
    };
  }).filter(Boolean);
  const explicitlyRejectedRows = evaluations.filter(item => item.explicitlyRejected);
  const replayedHoldRows = evaluations.filter(item => item.replayHeld);
  return {
    mode: 'profit-threshold-dropout',
    lines: `${options.startLine}-${options.endLine}`,
    frames: rows.length,
    historicalHoldRows: evaluations.length,
    explicitlyRejectedRows: explicitlyRejectedRows.length,
    replayedHoldRows: replayedHoldRows.length,
    samples: evaluations,
    accepted: evaluations.length > 0
      && explicitlyRejectedRows.length === evaluations.length
      && replayedHoldRows.length === 0
  };
}

function actionWithoutFinalArbitration(action = {}) {
  const output = { ...action };
  delete output.finalActionArbitration;
  return output;
}

function dropoutActionFromArbitration(arbitration = {}) {
  const focus = arbitration.mode === 'commit-current'
    ? (arbitration.to || {})
    : (arbitration.from || {});
  return {
    kind: String(focus.kind || 'wait'),
    band: String(focus.band || 'wait'),
    reason: String(focus.reason || arbitration.dropoutKind || 'no-profitable-candidate'),
    profitDropout: {
      kind: String(arbitration.dropoutKind || focus.reason || 'no-profitable-candidate'),
      yieldable: true,
      targetValid: arbitration.targetValid === true,
      targetValidity: String(arbitration.targetValidity || ''),
      targetKey: String(arbitration.dropoutTargetKey || '')
    }
  };
}

function replayProfitDropoutPreemption(options) {
  const rows = selectedEntries(options);
  let arbitrationState = null;
  let generation = 0;
  let consumedGeneration = 0;
  let realtimeEpisodeActive = false;
  let immediatePreemptions = 0;
  const plannerFrames = [];
  for (const row of rows) {
    const action = row.detail.action || {};
    const band = String(action.band || row.detail.band || '');
    const realtimePreemption = ['exit', 'safety', 'combat', 'recover'].includes(band);
    if (realtimePreemption) {
      if (!realtimeEpisodeActive) generation += 1;
      realtimeEpisodeActive = true;
      immediatePreemptions += 1;
      if (generation > consumedGeneration) {
        consumedGeneration = generation;
        if (arbitrationState) arbitrationState.profitDropout = null;
      }
      continue;
    }
    realtimeEpisodeActive = false;
    const historical = action.finalActionArbitration || null;
    if (!historical || !['profit-dropout-confirmation', 'profit-dropout-confirmed'].includes(historical.reason)) continue;
    if (!arbitrationState) {
      const previousAction = actionWithoutFinalArbitration(action);
      arbitrationState = {
        lastAction: previousAction,
        lastFocus: historical.to || null,
        lastSelectedAt: Number(historical.to?.at || historical.at || 0),
        lastOverride: null,
        history: [],
        profitDropout: null
      };
    }
    const replayed = applyFinalActionArbitrationCore(
      dropoutActionFromArbitration(historical),
      arbitrationState,
      {
        nowMs: Number(historical.at || Date.parse(row.entry.at || '')),
        holdMs: Number(historical.holdMs || 1800),
        source: 'profit-dropout-preemption-replay'
      }
    );
    plannerFrames.push({
      line: row.line,
      at: row.entry.at || '',
      historicalMode: historical.mode,
      historicalReason: historical.reason,
      historicalDropoutAgeMs: Number(historical.dropoutAgeMs ?? 0),
      replayMode: replayed.action.finalActionArbitration?.mode || '',
      replayReason: replayed.action.finalActionArbitration?.reason || '',
      replayDropoutAgeMs: replayed.action.finalActionArbitration?.dropoutAgeMs ?? null,
      replayHeld: replayed.held,
      generation: consumedGeneration
    });
  }
  const finalPlannerFrame = plannerFrames.at(-1) || null;
  return {
    mode: 'profit-dropout-preemption',
    lines: `${options.startLine}-${options.endLine}`,
    frames: rows.length,
    immediatePreemptions,
    generations: generation,
    plannerFrames,
    finalPlannerFrame,
    accepted: immediatePreemptions >= 2
      && generation >= 2
      && finalPlannerFrame?.replayHeld === true
      && finalPlannerFrame?.replayReason === 'profit-dropout-confirmation'
      && finalPlannerFrame?.replayDropoutAgeMs === 0
  };
}

function replayCombatShotCoverage(options) {
  const combat = replayCombat(options);
  const coverage = combat.trajectoryCoverageReplay || {};
  return {
    mode: 'combat-shot-coverage',
    targetId: options.targetId,
    lines: combat.lines,
    frames: combat.frames,
    baseline: combat.baseline,
    singleRouteReplay: combat.improved,
    coverage,
    fireDiscipline: combat.fireDisciplineReplay,
    accepted: Number(coverage.estimatedHits || 0) >= 36
      && Number(coverage.meanAimMissCm || Infinity) <= 400
      && Number(coverage.p50AimMissCm || Infinity) <= 350
      && combat.fireDisciplineReplay?.accepted === true
      && Number(combat.fireDisciplineReplay?.allowedConfirmedShots || Infinity)
        < Number(combat.fireDisciplineReplay?.baselineConfirmedShots || 0)
  };
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

function replayBurstCadence(rows) {
  let predictableFrames = 0;
  let preparingFrames = 0;
  let eligibleFrames = 0;
  let oldCycleUnstableFrames = 0;
  const blockers = {};
  const samples = [];
  for (const row of rows) {
    const detail = row.detail || {};
    const metrics = detail.behavior?.metrics || {};
    const cadence = burstCadenceMetricsCore(metrics.shotIntervalTicks || []);
    if (!cadence.burstPredictable) continue;
    predictableFrames += 1;
    const phase = detail.behavior?.dimensions?.shootingPhase || {};
    const currentTick = Number(detail.tick);
    const lastCreatedTick = Number(metrics.lastCreatedTick);
    const intervalMedianTicks = Number(cadence.burstIntervalMedianTicks);
    if (![currentTick, lastCreatedTick, intervalMedianTicks].every(Number.isFinite)) continue;
    const commandDelayP90Ticks = Math.max(0, Number(phase.commandDelayP90Ticks || 5));
    const flightTicks = Math.max(0, Number(phase.flightTicks || 0));
    const uncertaintyTicks = Math.max(
      1,
      Number(cadence.burstIntervalMadTicks || 0) * 2,
      Number(cadence.burstIntervalP90Ticks || intervalMedianTicks) - intervalMedianTicks
    );
    const prepareLeadTicks = Math.max(
      1,
      Math.min(
        intervalMedianTicks * 0.8,
        uncertaintyTicks + Math.max(1, commandDelayP90Ticks + 3 - flightTicks)
      )
    );
    const nextShotInTicks = lastCreatedTick + intervalMedianTicks - currentTick;
    if (nextShotInTicks < -uncertaintyTicks || nextShotInTicks > prepareLeadTicks) continue;
    preparingFrames += 1;
    let blockedReason = '';
    const self = detail.self || {};
    const stamina5s = Number(self.stamina5s ?? self.stamina_5s_remaining_milli);
    if (Number.isFinite(stamina5s) && stamina5s < 3400) blockedReason = 'stamina-insufficient';
    else if (!(Number(self.vx || 0) || Number(self.vy || 0))) blockedReason = 'self-stationary';
    else if (detail.movement?.preDodgeBlockedReason === 'old-bullet-threat') blockedReason = 'old-bullet-threat';
    else {
      const latestSafeCommandTick = lastCreatedTick + intervalMedianTicks + flightTicks - commandDelayP90Ticks - 3;
      if (currentTick > latestSafeCommandTick) blockedReason = 'flight-time-insufficient';
      else if (commandDelayP90Ticks >= intervalMedianTicks) blockedReason = 'command-delay-too-high';
    }
    if (blockedReason) blockers[blockedReason] = Number(blockers[blockedReason] || 0) + 1;
    else {
      eligibleFrames += 1;
      if (detail.movement?.preDodgeBlockedReason === 'cycle-unstable') oldCycleUnstableFrames += 1;
      if (samples.length < 12) samples.push({
        line: row.line,
        at: row.entry.at,
        tick: currentTick,
        nextShotInTicks,
        burstIntervalMedianTicks: intervalMedianTicks,
        interBurstGapMedianTicks: cadence.interBurstGapMedianTicks,
        currentBurstShotCount: cadence.currentBurstShotCount,
        burstConfidence: Number(cadence.burstConfidence.toFixed(3)),
        oldBlockedReason: detail.movement?.preDodgeBlockedReason || ''
      });
    }
  }
  return {
    predictableFrames,
    preparingFrames,
    eligibleFrames,
    oldCycleUnstableFrames,
    blockers,
    samples,
    accepted: eligibleFrames > 0
  };
}

function replayBackAwayDodgePriority(rows) {
  const overrides = [];
  let loggedDirectHits = 0;
  let preservedDodgeDirectHits = 0;
  let loggedCpaTotal = 0;
  let preservedDodgeCpaTotal = 0;
  let cpaImprovementFrames = 0;
  let preservedDodgeWorseFrames = 0;
  const samples = [];
  for (const row of rows) {
    const detail = row.detail || {};
    const modifiers = detail.movement?.modifiers || [];
    if (!modifiers.includes('back-away-mixed')) continue;
    const field = detail.movement?.dodge?.threatField;
    if (!Array.isArray(field) || !field.length) continue;
    const logged = field.find(item => Number(item.dx) === Number(detail.movement?.dx || 0)
      && Number(item.dy) === Number(detail.movement?.dy || 0)) || null;
    const preserved = field.find(item => Number(item.dx) === Number(detail.movement?.dodge?.dx || 0)
      && Number(item.dy) === Number(detail.movement?.dodge?.dy || 0)) || null;
    if (!logged || !preserved) continue;
    const loggedHits = Number(logged.directHits || 0);
    const preservedHits = Number(preserved.directHits || 0);
    const loggedCpa = Number(logged.minCPA || 0);
    const preservedCpa = Number(preserved.minCPA || 0);
    const atMs = Date.parse(row.entry.at || '');
    overrides.push({ atMs, line: row.line });
    loggedDirectHits += loggedHits;
    preservedDodgeDirectHits += preservedHits;
    loggedCpaTotal += loggedCpa;
    preservedDodgeCpaTotal += preservedCpa;
    if (preservedHits < loggedHits || (preservedHits === loggedHits && preservedCpa > loggedCpa)) {
      cpaImprovementFrames += 1;
    }
    if (preservedHits > loggedHits || (preservedHits === loggedHits && preservedCpa < loggedCpa)) {
      preservedDodgeWorseFrames += 1;
    }
    if (samples.length < 12 && (preservedHits !== loggedHits || Math.abs(preservedCpa - loggedCpa) >= 25)) {
      samples.push({
        line: row.line,
        at: row.entry.at,
        distance: Number.isFinite(Number(detail.target?.distance)) ? Math.round(Number(detail.target.distance)) : null,
        logged: {
          dx: Number(detail.movement?.dx || 0),
          dy: Number(detail.movement?.dy || 0),
          directHits: loggedHits,
          minCpaCm: Math.round(loggedCpa)
        },
        preservedDodge: {
          dx: Number(detail.movement?.dodge?.dx || 0),
          dy: Number(detail.movement?.dodge?.dy || 0),
          directHits: preservedHits,
          minCpaCm: Math.round(preservedCpa)
        }
      });
    }
  }
  let hitEvents = 0;
  let hitEventsWithin750Ms = 0;
  for (let index = 1; index < rows.length; index += 1) {
    const previousHp = Number(rows[index - 1].detail?.self?.hp);
    const currentHp = Number(rows[index].detail?.self?.hp);
    if (!Number.isFinite(previousHp) || !Number.isFinite(currentHp) || currentHp >= previousHp) continue;
    hitEvents += 1;
    const hitAt = Date.parse(rows[index].entry.at || '');
    if (overrides.some(item => hitAt >= item.atMs && hitAt - item.atMs <= 750)) hitEventsWithin750Ms += 1;
  }
  const overrideFrames = overrides.length;
  const directHitReduction = Math.max(0, loggedDirectHits - preservedDodgeDirectHits);
  return {
    model: 'preserve-threat-field-dodge-before-close-spacing',
    overrideFrames,
    hitEvents,
    hitEventsWithin750Ms,
    loggedDirectHits,
    preservedDodgeDirectHits,
    directHitReduction,
    loggedMeanCpaCm: overrideFrames ? Number((loggedCpaTotal / overrideFrames).toFixed(1)) : null,
    preservedDodgeMeanCpaCm: overrideFrames ? Number((preservedDodgeCpaTotal / overrideFrames).toFixed(1)) : null,
    cpaImprovementFrames,
    preservedDodgeWorseFrames,
    samples,
    accepted: overrideFrames > 0
      && directHitReduction > 0
      && preservedDodgeWorseFrames === 0
  };
}

function replayPendingMovementSchedule(rows, options = {}) {
  if (!rows.length) return { cases: 0, samples: [], accepted: false };
  const firstAt = Date.parse(rows[0].entry.at || '') - 1500;
  const lastAt = Date.parse(rows.at(-1).entry.at || '') + 1500;
  const { runnerFile, wsFile } = movementReplayLogFiles(options);
  if (!fs.existsSync(runnerFile) || !fs.existsSync(wsFile)) {
    return { cases: 0, samples: [], accepted: false, reason: 'missing-runner-or-ws-log' };
  }
  const commands = [];
  forEachJsonlEntry(runnerFile, entry => {
    const at = Date.parse(entry?.at || '');
    if (!Number.isFinite(at) || at < firstAt || at > lastAt) return;
    if (String(entry?.type || '') !== 'movement-command') return;
    const command = entry?.detail?.action?.movement?.command || null;
    if (!command || String(command.type || '') !== 'velocity') return;
    commands.push({
      at,
      commandId: command.id ?? null,
      dx: Number(command.dx || 0),
      dy: Number(command.dy || 0),
      reason: String(command.reason || '')
    });
  });
  const selfFrames = [];
  forEachJsonlEntry(wsFile, entry => {
    const at = Date.parse(entry?.at || '');
    if (!Number.isFinite(at) || at < firstAt || at > lastAt) return;
    const summary = entry?.detail?.decodedSummary || null;
    const self = summary?.self || null;
    if (String(summary?.type || '') !== 'pos' || !self) return;
    selfFrames.push({
      at,
      tick: numberOrNull(summary.tick ?? entry?.detail?.decodedTick),
      hp: numberOrNull(self.hp),
      vx: Number(self.vx || 0),
      vy: Number(self.vy || 0)
    });
  });
  const samples = [];
  for (const row of rows) {
    const at = Date.parse(row.entry.at || '');
    const field = row.detail?.movement?.dodge?.threatField || [];
    const selectedDx = Number(row.detail?.movement?.dx || 0);
    const selectedDy = Number(row.detail?.movement?.dy || 0);
    const selected = field.find(item => Number(item.dx) === selectedDx && Number(item.dy) === selectedDy) || null;
    if (!selected || Number(selected.directHits || 0) !== 0) continue;
    const pending = commands.filter(command => command.at <= at
      && at - command.at <= 800
      && (command.dx !== selectedDx || command.dy !== selectedDy)).at(-1) || null;
    if (!pending) continue;
    const transition = selfFrames.find(frame => frame.at >= at
      && frame.at - at <= 300
      && Math.sign(frame.vx) === Math.sign(pending.dx)
      && Math.sign(frame.vy) === Math.sign(pending.dy)) || null;
    if (!transition) continue;
    const baselineHp = numberOrNull(row.detail?.self?.hp);
    const damage = selfFrames.find(frame => frame.at >= transition.at
      && frame.at - transition.at <= 300
      && baselineHp !== null
      && frame.hp !== null
      && frame.hp < baselineHp) || null;
    if (!damage) continue;
    samples.push({
      line: row.line,
      observedAt: row.entry.at,
      observedTick: numberOrNull(row.detail?.tick),
      loggedDirection: { dx: selectedDx, dy: selectedDy },
      loggedDirectHits: Number(selected.directHits || 0),
      loggedMinCpaCm: numberOrNull(selected.minCPA),
      pendingCommand: pending,
      actualVelocityTransition: {
        tick: transition.tick,
        dx: Math.sign(transition.vx),
        dy: Math.sign(transition.vy),
        delayMs: transition.at - pending.at
      },
      damage: {
        tick: damage.tick,
        hpBefore: baselineHp,
        hpAfter: damage.hp,
        afterTransitionMs: damage.at - transition.at
      }
    });
  }
  return {
    model: 'visible-current-velocity-to-pending-command-to-new-command',
    cases: samples.length,
    samples: samples.slice(0, 12),
    accepted: samples.length > 0
  };
}

function movementDirectionKey(direction = {}) {
  return `${Math.sign(Number(direction.dx || 0))},${Math.sign(Number(direction.dy || 0))}`;
}

function movementDirectionFromSelf(self = {}) {
  return {
    dx: Math.sign(Number(self?.vx || 0)),
    dy: Math.sign(Number(self?.vy || 0))
  };
}

function movementPercentileSummary(values = []) {
  const finite = values.map(Number).filter(Number.isFinite);
  if (!finite.length) return { count: 0, median: null, p90: null, max: null };
  return {
    count: finite.length,
    median: percentile(finite.slice(), 0.5),
    p90: percentile(finite.slice(), 0.9),
    max: Math.max(...finite)
  };
}

function extractMovementCommand(entry) {
  const detail = entry?.detail || {};
  const action = detail.action || {};
  const movement = action.movement || {};
  const command = movement.command || (
    action.command && String(action.command.type || '') === 'velocity' ? action.command : null
  );
  if (!command || String(command.type || '') !== 'velocity') return null;
  // A skipped action repeats the previous logical command in its compact
  // response; it is not a new causally independent velocity generation.
  if (action.skipped === true || movement.skipped === true) return null;
  const telemetry = command.movementTelemetry || movement.movementTelemetry || detail.movementTelemetry || {};
  const at = Date.parse(command.sentAt || entry.at || '');
  if (!Number.isFinite(at)) return null;
  return {
    at,
    commandId: command.id ?? telemetry.commandId ?? null,
    dx: Math.sign(Number(command.dx || 0)),
    dy: Math.sign(Number(command.dy || 0)),
    reason: String(command.reason || movement.reason || action.reason || ''),
    sequence: 0,
    requestedAtMs: numberOrNull(command.sentAtMs ?? telemetry.requestedAtMs) ?? at,
    observedTick: optionalNumberOrNull(command.observedTick ?? telemetry.observedTick),
    observedAtMs: optionalNumberOrNull(telemetry.frameReceivedAtMs ?? telemetry.observedAtMs),
    directionGeneration: optionalNumberOrNull(command.directionGeneration ?? telemetry.directionGeneration),
    frameReceivedToDecisionMs: optionalNumberOrNull(telemetry.frameReceivedToDecisionMs),
    decisionToVelocitySendMs: optionalNumberOrNull(telemetry.decisionToVelocitySendMs),
    observedTickAgeAtSendMs: optionalNumberOrNull(
      telemetry.velocitySendObservedTickAgeMs
        ?? telemetry.observedTickAgeAtSendMs
        ?? telemetry.velocitySendObservedTickAgeMs
    ),
    pendingDepthAtSend: optionalNumberOrNull(telemetry.pendingDepthAtSend),
    replacementsBeforeVisible: optionalNumberOrNull(telemetry.replacementsBeforeVisible),
    ownership: telemetry.ownership || command.ownership || null
  };
}

function replayMovementCommandLatency(options = {}) {
  const rows = selectedEntries(options).filter(({ detail }) => !options.targetId
    || String(detail.target?.userId ?? detail.target?.user_id ?? detail.combat?.target?.userId ?? '') === options.targetId);
  if (!rows.length) {
    return { mode: 'movement-command-latency', accepted: false, reason: 'no-selected-battle-rows' };
  }
  const { runnerFile, wsFile } = movementReplayLogFiles(options);
  if (!fs.existsSync(runnerFile) || !fs.existsSync(wsFile)) {
    return {
      mode: 'movement-command-latency',
      accepted: false,
      reason: 'missing-runner-or-ws-log',
      runnerFile,
      wsFile
    };
  }
  const firstAt = Date.parse(rows[0].entry.at || '') - 2000;
  const lastAt = Date.parse(rows.at(-1).entry.at || '') + 2000;
  const runId = String(rows[0].entry?.detail?.runId || rows[0].entry?.runId || '');
  const commands = [];
  forEachJsonlEntry(runnerFile, entry => {
    const at = Date.parse(entry?.at || '');
    if (!Number.isFinite(at) || at < firstAt || at > lastAt) return;
    const entryRunId = String(entry?.detail?.runId || entry?.runId || '');
    if (runId && entryRunId && entryRunId !== runId) return;
    const command = extractMovementCommand(entry);
    if (!command) return;
    command.sequence = commands.length + 1;
    commands.push(command);
  });
  commands.sort((left, right) => left.at - right.at || left.sequence - right.sequence);
  commands.forEach((command, index) => { command.sequence = index + 1; });
  const selfFrames = [];
  forEachJsonlEntry(wsFile, entry => {
    const at = Date.parse(entry?.at || '');
    if (!Number.isFinite(at) || at < firstAt || at > lastAt) return;
    const detail = entry?.detail || {};
    const summary = detail.decodedSummary || null;
    if (String(detail.decodedType || summary?.type || '') !== 'pos') return;
    const self = summary?.self || null;
    if (!self) return;
    selfFrames.push({
      at,
      tick: numberOrNull(summary.tick ?? detail.decodedTick),
      hp: numberOrNull(self.hp),
      ...movementDirectionFromSelf(self),
      x: numberOrNull(self.x),
      y: numberOrNull(self.y)
    });
  });
  selfFrames.sort((left, right) => left.at - right.at || Number(left.tick || 0) - Number(right.tick || 0));

  // Attach the freshest observed tick to old command records that predate the
  // telemetry fields. This is a measurement fallback, never a server-latency
  // claim.
  let frameCursor = 0;
  for (const command of commands) {
    while (frameCursor + 1 < selfFrames.length && selfFrames[frameCursor + 1].at <= command.at) frameCursor += 1;
    const frame = selfFrames[frameCursor] || null;
    if (command.observedTick === null && frame) {
      command.observedTick = frame.tick;
      command.observedAtMs = frame.at;
    }
  }

  const transitions = [];
  const pending = [];
  let commandCursor = 0;
  let previousDirection = null;
  const maxPendingAgeMs = 5000;
  for (const frame of selfFrames) {
    while (commandCursor < commands.length && commands[commandCursor].at <= frame.at) {
      const nextCommand = commands[commandCursor];
      for (const prior of pending) {
        if (prior.replacedByCommandId === null || prior.replacedByCommandId === undefined) {
          prior.replacedByCommandId = nextCommand.commandId;
          prior.replacedAtMs = nextCommand.at;
          prior.replacedByDirection = { dx: nextCommand.dx, dy: nextCommand.dy };
        }
      }
      pending.push(nextCommand);
      commandCursor += 1;
    }
    const observed = { dx: frame.dx, dy: frame.dy };
    const changed = !previousDirection || movementDirectionKey(previousDirection) !== movementDirectionKey(observed);
    if (changed && previousDirection) {
      const attribution = attributeVelocityTransition(pending, observed, {
        receivedAtMs: frame.at,
        tick: frame.tick
      });
      const transition = {
        at: frame.at,
        tick: frame.tick,
        from: previousDirection,
        to: observed,
        ...attribution,
        executionDelayTicks: attribution.attributionConfidence === 'exact' ? attribution.tickDelayUpper : null,
        executionDelayMs: attribution.attributionConfidence === 'exact' ? attribution.wallDelayMsUpper : null
      };
      transitions.push(transition);
      if (attribution.attributionConfidence !== 'ambiguous-reversal'
        && attribution.latestCandidateSequence !== null
        && attribution.latestCandidateSequence !== undefined) {
        const settledSequences = new Set(pending
          .filter(command => Number(command.sequence || 0) <= Number(attribution.latestCandidateSequence)
            && movementDirectionKey(command) === movementDirectionKey(observed))
          .map(command => Number(command.sequence || 0)));
        for (let index = pending.length - 1; index >= 0; index -= 1) {
          if (settledSequences.has(Number(pending[index].sequence || 0))) pending.splice(index, 1);
        }
      }
    } else if (!changed) {
      const observedKey = movementDirectionKey(observed);
      for (let index = pending.length - 1; index >= 0; index -= 1) {
        if (movementDirectionKey(pending[index]) === observedKey) pending.splice(index, 1);
      }
    }
    while (pending.length && frame.at - Number(pending[0].at || 0) > maxPendingAgeMs) pending.shift();
    previousDirection = observed;
  }

  const attributionCounts = { exact: 0, bounded: 0, 'ambiguous-reversal': 0, unmatched: 0 };
  for (const transition of transitions) {
    const key = String(transition.attributionConfidence || 'unmatched');
    if (Object.prototype.hasOwnProperty.call(attributionCounts, key)) attributionCounts[key] += 1;
  }
  const exactTickValues = transitions.filter(item => item.attributionConfidence === 'exact')
    .map(item => optionalNumberOrNull(item.tickDelayUpper)).filter(value => value !== null);
  const exactWallValues = transitions.filter(item => item.attributionConfidence === 'exact')
    .map(item => optionalNumberOrNull(item.wallDelayMsUpper)).filter(value => value !== null);
  const boundedTickValues = transitions.filter(item => item.attributionConfidence === 'bounded')
    .map(item => optionalNumberOrNull(item.tickDelayUpper)).filter(value => value !== null);
  const boundedWallValues = transitions.filter(item => item.attributionConfidence === 'bounded')
    .map(item => optionalNumberOrNull(item.wallDelayMsUpper)).filter(value => value !== null);
  const frameReceivedToDecisionValues = commands
    .map(item => optionalNumberOrNull(item.frameReceivedToDecisionMs))
    .filter(value => value !== null);
  const decisionToVelocitySendValues = commands
    .map(item => optionalNumberOrNull(item.decisionToVelocitySendMs))
    .filter(value => value !== null);
  const velocitySendObservedTickAgeValues = commands
    .map(item => optionalNumberOrNull(item.observedTickAgeAtSendMs))
    .filter(value => value !== null);
  const pendingDepthAtSendValues = commands
    .map(item => optionalNumberOrNull(item.pendingDepthAtSend))
    .filter(value => value !== null);
  const timing = {
    exactReady: exactTickValues.length >= 4,
    sampleCount: exactTickValues.length,
    medianTicks: percentile(exactTickValues.slice(), 0.5) ?? 2,
    p90Ticks: percentile(exactTickValues.slice(), 0.9) ?? 5,
    madTicks: (() => {
      const median = percentile(exactTickValues.slice(), 0.5);
      return median === null ? 0 : (percentile(exactTickValues.map(value => Math.abs(value - median)), 0.5) ?? 0);
    })(),
    source: exactTickValues.length >= 4 ? 'visible-velocity-transition-exact-rolling' : 'replay-bounded-upper'
  };

  const commandDirectionChanges = [];
  for (let index = 1; index < commands.length; index += 1) {
    if (movementDirectionKey(commands[index - 1]) === movementDirectionKey(commands[index])) continue;
    commandDirectionChanges.push({
      at: commands[index].at,
      from: { dx: commands[index - 1].dx, dy: commands[index - 1].dy },
      to: { dx: commands[index].dx, dy: commands[index].dy },
      intervalMs: Math.max(0, commands[index].at - commands[index - 1].at),
      generation: commands[index].directionGeneration
    });
  }
  const quickReversals = commandDirectionChanges.filter(item => item.intervalMs <= 200);
  const ultraQuickReversals = commandDirectionChanges.filter(item => item.intervalMs <= 100);
  const replacementDepth = transitions.map(item => Number(item.replacementCount || 0)).filter(Number.isFinite);

  const hpLossAssociations = [];
  for (let index = 1; index < selfFrames.length; index += 1) {
    const previous = selfFrames[index - 1];
    const current = selfFrames[index];
    if (previous.hp === null || current.hp === null || current.hp >= previous.hp) continue;
    const transition = transitions.slice().reverse().find(item => item.at <= current.at && current.at - item.at <= 1000) || null;
    let threat = null;
    const row = rows.slice().reverse().find(item => Date.parse(item.entry.at || '') <= current.at);
    const field = row?.detail?.movement?.dodge?.threatField || [];
    if (field.length && transition) {
      threat = field.find(item => Number(item.dx || 0) === Number(transition.to.dx || 0)
        && Number(item.dy || 0) === Number(transition.to.dy || 0)) || null;
    }
    hpLossAssociations.push({
      at: current.at,
      hpLoss: previous.hp - current.hp,
      transitionAt: transition?.at || null,
      attributionConfidence: transition?.attributionConfidence || 'unmatched',
      afterTransitionMs: transition ? current.at - transition.at : null,
      directHits: numberOrNull(threat?.directHits),
      unavoidableHits: numberOrNull(threat?.unavoidableHits),
      worstCaseCpaCm: numberOrNull(threat?.worstCaseCpaCm ?? threat?.minCPA)
    });
  }

  let stabilityState = null;
  let baselineDirection = null;
  let shadowDirection = null;
  let actualDirection = null;
  let baselineSwitches = 0;
  let shadowSwitches = 0;
  let actualSwitches = 0;
  let baselineQuick = 0;
  let shadowQuick = 0;
  let actualQuick = 0;
  let baselineNonHardSwitches = 0;
  let shadowNonHardSwitches = 0;
  let actualNonHardSwitches = 0;
  let baselineNonHardQuick = 0;
  let shadowNonHardQuick = 0;
  let actualNonHardQuick = 0;
  let lastBaselineAt = null;
  let lastShadowAt = null;
  let lastActualAt = null;
  let stabilityFalseSafe = 0;
  let stabilityHeldDirectHitRegression = 0;
  let stabilityHeldUnavoidableHitRegression = 0;
  let stabilityHeldBelowSafetyBoundary = 0;
  let rolloutEnabledFrames = 0;
  let rolloutAppliedFrames = 0;
  let rolloutShadowHeldFrames = 0;
  let loggedShadowMismatchFrames = 0;
  let loggedAppliedDirectHitRegression = 0;
  let loggedAppliedUnavoidableHitRegression = 0;
  let loggedAppliedBelowSafetyBoundary = 0;
  let heldWorstCaseCpaCm = Infinity;
  let suppressedSamples = 0;
  const stabilitySamples = [];
  for (const row of rows) {
    const detail = row.detail || {};
    const movement = detail.movement || {};
    const stabilityTelemetry = movement.movementStability || {};
    const candidate = stabilityTelemetry.candidateDirection
      ? {
          dx: Number(stabilityTelemetry.candidateDirection.dx || 0),
          dy: Number(stabilityTelemetry.candidateDirection.dy || 0)
        }
      : { dx: Number(movement.dx || 0), dy: Number(movement.dy || 0) };
    const actual = { dx: Number(movement.dx || 0), dy: Number(movement.dy || 0) };
    const loggedShadow = stabilityTelemetry.selectedDirection
      ? {
          dx: Number(stabilityTelemetry.selectedDirection.dx || 0),
          dy: Number(stabilityTelemetry.selectedDirection.dy || 0)
        }
      : actual;
    if (stabilityTelemetry.enabled === true) rolloutEnabledFrames += 1;
    if (stabilityTelemetry.applied === true) rolloutAppliedFrames += 1;
    if (stabilityTelemetry.shadowHeld === true) rolloutShadowHeldFrames += 1;
    const atMs = Date.parse(row.entry.at || '');
    if (!Number.isFinite(atMs)) continue;
    const baselineKey = movementDirectionKey(candidate);
    const baselineChanged = Boolean(
      baselineDirection && baselineKey !== movementDirectionKey(baselineDirection)
    );
    const baselineQuickChanged = Boolean(
      baselineChanged && lastBaselineAt !== null && atMs - lastBaselineAt <= 200
    );
    const latestCommand = commands.slice().reverse().find(command => command.at <= atMs) || null;
    const self = detail.self || {};
    const result = stabilizeCombatMovementDirectionCore({
      nowMs: atMs,
      tick: numberOrNull(detail.tick),
      targetId: options.targetId || String(detail.target?.userId || ''),
      engagementId: `${options.targetId || String(detail.target?.userId || '')}:${rows[0].entry.at || ''}`,
      candidateDirection: candidate,
      currentDirection: movementDirectionFromSelf(self),
      pendingDirection: latestCommand,
      threatField: movement.dodge?.threatField || [],
      movementTiming: timing,
      previousState: stabilityState,
      hardGateChanged: Boolean(detail.exit?.shouldLeave || detail.action?.shouldLeave || actionPriorityBand(detail.action || {}) === 'exit'),
      commandUnmatched: false,
      newThreatUrgent: false
    }, { minimumCpaCm: 200, materialCpaGainCm: 75 });
    stabilityState = result.state;
    const hardSafetyRelease = result.reason === 'movement-stability-immediate-safety-release';
    if (baselineChanged) {
      baselineSwitches += 1;
      if (!hardSafetyRelease) baselineNonHardSwitches += 1;
      if (baselineQuickChanged) {
        baselineQuick += 1;
        if (!hardSafetyRelease) baselineNonHardQuick += 1;
      }
      lastBaselineAt = atMs;
    } else if (!baselineDirection) {
      lastBaselineAt = atMs;
    }
    baselineDirection = candidate;
    const selected = result.direction;
    const selectedKey = movementDirectionKey(selected);
    const shadowChanged = Boolean(
      shadowDirection && selectedKey !== movementDirectionKey(shadowDirection)
    );
    const shadowQuickChanged = Boolean(
      shadowChanged && lastShadowAt !== null && atMs - lastShadowAt <= 200
    );
    if (shadowChanged) {
      shadowSwitches += 1;
      if (!hardSafetyRelease) shadowNonHardSwitches += 1;
      if (shadowQuickChanged) {
        shadowQuick += 1;
        if (!hardSafetyRelease) shadowNonHardQuick += 1;
      }
      lastShadowAt = atMs;
    } else if (!shadowDirection) {
      lastShadowAt = atMs;
    }
    shadowDirection = selected;
    const actualKey = movementDirectionKey(actual);
    const actualChanged = Boolean(
      actualDirection && actualKey !== movementDirectionKey(actualDirection)
    );
    const actualQuickChanged = Boolean(
      actualChanged && lastActualAt !== null && atMs - lastActualAt <= 200
    );
    if (actualChanged) {
      actualSwitches += 1;
      if (!hardSafetyRelease) actualNonHardSwitches += 1;
      if (actualQuickChanged) {
        actualQuick += 1;
        if (!hardSafetyRelease) actualNonHardQuick += 1;
      }
      lastActualAt = atMs;
    } else if (!actualDirection) {
      lastActualAt = atMs;
    }
    actualDirection = actual;
    if (stabilityTelemetry.selectedDirection
      && movementDirectionKey(loggedShadow) !== movementDirectionKey(selected)) {
      loggedShadowMismatchFrames += 1;
    }
    if (stabilityTelemetry.applied === true) {
      const candidateDirectHits = optionalNumberOrNull(stabilityTelemetry.candidateDirectHits);
      const heldDirectHits = optionalNumberOrNull(stabilityTelemetry.heldDirectHits);
      const candidateUnavoidableHits = optionalNumberOrNull(stabilityTelemetry.candidateUnavoidableHits);
      const heldUnavoidableHits = optionalNumberOrNull(stabilityTelemetry.heldUnavoidableHits);
      const heldCpa = optionalNumberOrNull(stabilityTelemetry.heldWorstCaseCpaCm);
      if (candidateDirectHits !== null && heldDirectHits !== null && heldDirectHits > candidateDirectHits) {
        loggedAppliedDirectHitRegression += 1;
      }
      if (candidateUnavoidableHits !== null
        && heldUnavoidableHits !== null
        && heldUnavoidableHits > candidateUnavoidableHits) {
        loggedAppliedUnavoidableHitRegression += 1;
      }
      if (heldCpa !== null && heldCpa < 200) loggedAppliedBelowSafetyBoundary += 1;
    }
    if (result.held) suppressedSamples += 1;
    const selectedThreat = (movement.dodge?.threatField || []).find(item => Number(item.dx || 0) === Number(selected.dx || 0)
      && Number(item.dy || 0) === Number(selected.dy || 0));
    if (selectedThreat) {
      const cpa = Number(selectedThreat.worstCaseCpaCm ?? selectedThreat.minCPA);
      const candidateThreat = (movement.dodge?.threatField || []).find(item => Number(item.dx || 0) === candidate.dx
        && Number(item.dy || 0) === candidate.dy);
      if (result.held) {
        if (Number.isFinite(cpa)) heldWorstCaseCpaCm = Math.min(heldWorstCaseCpaCm, cpa);
        const directRegression = Number(selectedThreat.directHits || 0) > Number(candidateThreat?.directHits || 0);
        const unavoidableRegression = Number(selectedThreat.unavoidableHits || 0) > Number(candidateThreat?.unavoidableHits || 0);
        const belowSafetyBoundary = Number.isFinite(cpa) && cpa < 200;
        if (directRegression) stabilityHeldDirectHitRegression += 1;
        if (unavoidableRegression) stabilityHeldUnavoidableHitRegression += 1;
        if (belowSafetyBoundary) stabilityHeldBelowSafetyBoundary += 1;
        if (directRegression || unavoidableRegression || belowSafetyBoundary) stabilityFalseSafe += 1;
      }
    }
    if (stabilitySamples.length < 16 && (result.held || result.switched)) {
      stabilitySamples.push({
        line: row.line,
        at: row.entry.at,
        candidate,
        selected,
        held: result.held,
        reason: result.reason,
        elapsedTicks: result.elapsedTicks,
        settlementWindowTicks: result.settlementWindowTicks
      });
    }
  }
  const dodgeReplay = replayDodge({ ...options, runnerFile, wsFile });
  const contactEntryReplay = replayContactEntryDodge(rows, options);
  const switchReduction = baselineSwitches ? (baselineSwitches - shadowSwitches) / baselineSwitches : null;
  const quickReduction = baselineQuick ? (baselineQuick - shadowQuick) / baselineQuick : null;
  const nonHardSwitchReduction = baselineNonHardSwitches
    ? (baselineNonHardSwitches - shadowNonHardSwitches) / baselineNonHardSwitches
    : null;
  const nonHardQuickReduction = baselineNonHardQuick
    ? (baselineNonHardQuick - shadowNonHardQuick) / baselineNonHardQuick
    : null;
  const actualSwitchReduction = baselineSwitches
    ? (baselineSwitches - actualSwitches) / baselineSwitches
    : null;
  const actualQuickReduction = baselineQuick
    ? (baselineQuick - actualQuick) / baselineQuick
    : null;
  const actualNonHardSwitchReduction = baselineNonHardSwitches
    ? (baselineNonHardSwitches - actualNonHardSwitches) / baselineNonHardSwitches
    : null;
  const actualNonHardQuickReduction = baselineNonHardQuick
    ? (baselineNonHardQuick - actualNonHardQuick) / baselineNonHardQuick
    : null;
  const replayDataAvailable = commands.length > 0 && selfFrames.length > 0 && transitions.length > 0;
  const safetyAccepted = Number(dodgeReplay.newFalseSafe || 0) === 0
    && stabilityFalseSafe === 0
    && loggedAppliedDirectHitRegression === 0
    && loggedAppliedUnavoidableHitRegression === 0
    && loggedAppliedBelowSafetyBoundary === 0;
  const reductionAssessment = rolloutEnabledFrames > 0
    ? {
        source: 'logged-applied',
        nonHardSwitchReduction: actualNonHardSwitchReduction,
        nonHardQuickReduction: actualNonHardQuickReduction
      }
    : {
        source: 'shadow-counterfactual',
        nonHardSwitchReduction,
        nonHardQuickReduction
      };
  const reductionTargetsMet = (reductionAssessment.nonHardSwitchReduction === null
      || reductionAssessment.nonHardSwitchReduction >= 0.4)
    && (reductionAssessment.nonHardQuickReduction === null
      || reductionAssessment.nonHardQuickReduction >= 0.6);
  const result = {
    mode: 'movement-command-latency',
    targetId: options.targetId || '',
    lines: `${options.startLine}-${options.endLine}`,
    runnerFile,
    wsFile,
    commandCount: commands.length,
    visiblePosFrameCount: selfFrames.length,
    transitionCount: transitions.length,
    attributionCounts,
    exactTickDelay: movementPercentileSummary(exactTickValues),
    exactWallDelayMs: movementPercentileSummary(exactWallValues),
    boundedTickDelay: movementPercentileSummary(boundedTickValues),
    boundedWallDelayMs: movementPercentileSummary(boundedWallValues),
    frameReceivedToDecisionMs: movementPercentileSummary(frameReceivedToDecisionValues),
    decisionToVelocitySendMs: movementPercentileSummary(decisionToVelocitySendValues),
    velocitySendObservedTickAgeMs: movementPercentileSummary(velocitySendObservedTickAgeValues),
    pendingDepthAtSend: movementPercentileSummary(pendingDepthAtSendValues),
    timing,
    commandDirectionChangeCount: commandDirectionChanges.length,
    quickReversalCount200Ms: quickReversals.length,
    quickReversalCount100Ms: ultraQuickReversals.length,
    replacementDepth: movementPercentileSummary(replacementDepth),
    hpLossCount: hpLossAssociations.length,
    hpLossAssociations: hpLossAssociations.slice(0, 24),
    stabilityCounterfactual: {
      baselineSwitches,
      shadowSwitches,
      switchReduction,
      baselineNonHardSwitches,
      shadowNonHardSwitches,
      nonHardSwitchReduction,
      baselineQuickReversals200Ms: baselineQuick,
      shadowQuickReversals200Ms: shadowQuick,
      quickReversalReduction: quickReduction,
      baselineNonHardQuickReversals200Ms: baselineNonHardQuick,
      shadowNonHardQuickReversals200Ms: shadowNonHardQuick,
      nonHardQuickReversalReduction: nonHardQuickReduction,
      actualSwitches,
      actualSwitchReduction,
      actualNonHardSwitches,
      actualNonHardSwitchReduction,
      actualQuickReversals200Ms: actualQuick,
      actualQuickReversalReduction: actualQuickReduction,
      actualNonHardQuickReversals200Ms: actualNonHardQuick,
      actualNonHardQuickReversalReduction: actualNonHardQuickReduction,
      rolloutEnabledFrames,
      rolloutAppliedFrames,
      rolloutShadowHeldFrames,
      loggedShadowMismatchFrames,
      loggedAppliedDirectHitRegression,
      loggedAppliedUnavoidableHitRegression,
      loggedAppliedBelowSafetyBoundary,
      suppressedSamples,
      robustFalseSafe: stabilityFalseSafe,
      heldDirectHitRegression: stabilityHeldDirectHitRegression,
      heldUnavoidableHitRegression: stabilityHeldUnavoidableHitRegression,
      heldBelowSafetyBoundary: stabilityHeldBelowSafetyBoundary,
      heldWorstCaseCpaCm: Number.isFinite(heldWorstCaseCpaCm) ? heldWorstCaseCpaCm : null,
      samples: stabilitySamples
    },
    dodgeReplay: {
      hitEvents: dodgeReplay.hitEvents,
      oldFalseSafe: dodgeReplay.oldFalseSafe,
      newFalseSafe: dodgeReplay.newFalseSafe,
      unavoidableCurrentShot: dodgeReplay.unavoidableCurrentShot
    },
    contactEntryReplay,
    validation: {
      replayDataAvailable,
      safetyAccepted,
      reductionTargetsMet,
      reductionAssessmentSource: reductionAssessment.source,
      measuredNonHardSwitchReduction: reductionAssessment.nonHardSwitchReduction,
      measuredNonHardQuickReversalReduction: reductionAssessment.nonHardQuickReduction,
      nonHardSwitchReductionTarget: 0.4,
      nonHardQuickReversalReductionTarget: 0.6
    },
    transitions: transitions.slice(0, 32),
    rolloutAccepted: replayDataAvailable && safetyAccepted && reductionTargetsMet,
    accepted: replayDataAvailable && safetyAccepted
  };
  return result;
}

function replayDodge(options) {
  const rows = selectedEntries(options).filter(({ detail }) => !options.targetId
    || String(detail.target?.userId ?? '') === options.targetId);
  const burstCadenceReplay = replayBurstCadence(rows);
  const contactEntryReplay = replayContactEntryDodge(rows, options);
  const backAwayDodgePriorityReplay = replayBackAwayDodgePriority(rows);
  const pendingMovementScheduleReplay = replayPendingMovementSchedule(rows, options);
  const reactionBudgetMs = Math.max(0, Number(options.executionDelayTicks || 5) * 50 + 50 + 100);
  let hitEvents = 0;
  let eventsWithThreatEvidence = 0;
  let reconstructedEvents = 0;
  let oldFalseSafe = 0;
  let newFalseSafe = 0;
  let unavoidable = 0;
  let robustUnavoidable = 0;
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
    if (oldSafe && effectiveUnavoidable && !recovered) robustUnavoidable += 1;
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
    robustFalseSafe: newFalseSafe,
    robustSafeHitEvents: newFalseSafe,
    robustUnsafeRecoveredEvents: recoveredByFullTrajectory,
    unavoidableCurrentShot: unavoidable,
    robustUnavoidableCurrentShot: robustUnavoidable,
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
    burstCadenceReplay,
    contactEntryReplay,
    backAwayDodgePriorityReplay,
    pendingMovementScheduleReplay,
    samples,
    fullTrajectorySamples,
    accepted: pendingMovementScheduleReplay.accepted || burstCadenceReplay.accepted || contactEntryReplay.accepted || backAwayDodgePriorityReplay.accepted || (
      hitEvents > 0
        && reconstructedEvents > 0
        && recoveredByFullTrajectory > 0
        && recoveredAfterStaticTti > 0
        && newFalseSafe < oldFalseSafe
    )
  };
}

function replayContactEntryDodge(rows, options = {}) {
  let previous = null;
  let armed = true;
  let eligibleFrames = 0;
  let safeFrames = 0;
  let directHitReduction = 0;
  const samples = [];
  for (const row of rows) {
    const loggedSelf = row.detail?.self;
    const target = row.detail?.target;
    if (!loggedSelf || !target) continue;
    const self = {
      ...loggedSelf,
      vx: 0,
      vy: 0,
      hp: 100,
      max_hp: 100,
      stamina_5s_remaining_milli: 10000
    };
    const distance = Number(target.distance ?? Math.hypot(
      Number(target.x || 0) - Number(self.x || 0),
      Number(target.y || 0) - Number(self.y || 0)
    ));
    const risk = contactEntryRiskCore(self, { ...target, distance, easyKillThreatExempt: false }, previous, {
      armed,
      attackRange: 14500,
      guardBufferCm: 1000,
      minimumStamina5s: 3400
    });
    if (distance > risk.guardRange) armed = true;
    if (!risk.eligible) {
      previous = { distance, at: Date.parse(row.entry.at) };
      continue;
    }
    eligibleFrames += 1;
    armed = false;
    const synthetic = contactEntrySyntheticBulletCore(self, target);
    const dodge = synthetic ? calculateDodgeDirection(self, [synthetic], {
      target,
      moveSpeedPerTick: 50,
      tickMs: 50,
      hitRadius: 200,
      commandDelayTicks: options.executionDelayTicks || 5
    }) : null;
    const selected = dodge?.threatField?.find(item => Number(item.dx) === Number(dodge.dx) && Number(item.dy) === Number(dodge.dy)) || null;
    const stationary = dodge?.threatField?.find(item => Number(item.dx) === 0 && Number(item.dy) === 0) || null;
    const reduction = Math.max(0, Number(stationary?.directHits || 0) - Number(selected?.directHits || 0));
    directHitReduction += reduction;
    if (selected && Number(selected.directHits || 0) === 0 && Number(selected.minCPA || 0) >= 200) safeFrames += 1;
    if (samples.length < 12) samples.push({
      line: row.line,
      at: row.entry.at,
      trigger: risk.trigger,
      distance: risk.distance,
      closingSpeed: risk.closingSpeed,
      closingAlignment: risk.closingAlignment,
      dx: dodge?.dx ?? 0,
      dy: dodge?.dy ?? 0,
      stationaryDirectHits: Number(stationary?.directHits || 0),
      selectedDirectHits: Number(selected?.directHits || 0),
      stationaryCpaCm: Number(stationary?.minCPA || 0),
      selectedCpaCm: Number(selected?.minCPA || 0),
      assumedImpactMs: Number(synthetic?.timeToImpact || 0)
    });
    previous = { distance, at: Date.parse(row.entry.at) };
  }
  return {
    model: 'parked-full-hp-first-contact-counterfactual',
    eligibleFrames,
    safeFrames,
    directHitReduction,
    samples,
    accepted: eligibleFrames > 0 && safeFrames > 0 && directHitReduction > 0
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

function closePressureDistanceStats(values = []) {
  const distances = values.filter(Number.isFinite);
  if (!distances.length) return { minimumCm: null, p50Cm: null, p90Cm: null, maximumCm: null, finalCm: null };
  return {
    minimumCm: Math.round(Math.min(...distances)),
    p50Cm: Math.round(percentile(distances, 0.5)),
    p90Cm: Math.round(percentile(distances, 0.9)),
    maximumCm: Math.round(Math.max(...distances)),
    finalCm: Math.round(distances[distances.length - 1])
  };
}

function replayVirtualShotMiss(rows, startIndex, detail, aim) {
  const origin = detail.aim?.predictedShooterOrigin || detail.self || null;
  const startTick = numberOrNull(detail.aim?.timing?.createdTickEstimate)
    ?? (numberOrNull(detail.tick) === null ? null : Number(detail.tick) + 3);
  if (!origin || !aim || startTick === null) return Infinity;
  const direction = normalizeVector(Number(aim.x) - Number(origin.x), Number(aim.y) - Number(origin.y));
  if (!(Math.hypot(direction.x, direction.y) > 0)) return Infinity;
  let minimum = Infinity;
  for (let index = startIndex; index < rows.length; index += 1) {
    const tick = numberOrNull(rows[index].detail?.tick);
    const target = rows[index].detail?.target;
    if (tick === null || !target) continue;
    if (tick < startTick) continue;
    if (tick > startTick + 30) break;
    const elapsedTicks = tick - startTick;
    const bulletX = Number(origin.x) + direction.x * 500 * elapsedTicks;
    const bulletY = Number(origin.y) + direction.y * 500 * elapsedTicks;
    minimum = Math.min(minimum, Math.hypot(bulletX - Number(target.x), bulletY - Number(target.y)));
  }
  return minimum;
}

function closePressureThreatFrame(detail = {}) {
  const threatField = detail.movement?.dodge?.threatField || [];
  return Boolean(
    threatField.length
      || detail.movement?.oldBulletPressure
      || detail.contactEntryGuard?.realBulletTakeover
      || detail.shooting?.defensivePressure
      || detail.target?.firing
  );
}

function replayClosePressureMovement(rows = [], options = {}) {
  const range = options.range || combatPressureTargetRangeCore(options);
  const hysteresisCm = Math.max(100, Number(options.hysteresisCm ?? 300));
  const moveSpeedPerTick = Math.max(1, Number(options.moveSpeedPerTick ?? 50));
  const tickMs = Math.max(1, Number(options.tickMs ?? 50));
  const maxFrameMs = Math.max(tickMs, Number(options.maxFrameMs ?? 500));
  let self = null;
  let approachFrames = 0;
  let separateFrames = 0;
  let strafeFrames = 0;
  let threatFrames = 0;
  let safeCloseFrames = 0;
  let unsafeSafeCloseFrames = 0;
  let preservedDodgeFrames = 0;
  let currentSafeHoldFrames = 0;
  let pressureBandSamples = 0;
  let pressureReleaseSamples = 0;
  let pressureAttackCommitted = false;
  let pressureAttackFrames = 0;
  let pressureAttackReadyFrames = 0;
  let pressureAttackPausedFrames = 0;
  let pressureAttackBudgetUnlockFrames = 0;
  let pressureAttackCadenceMs = null;
  let firstPressureAttack = null;
  let closeBandReserve = null;
  let hypotheticalAcceptedShots = null;
  let lastReserveShotAt = 0;
  let reserveShotsFired = 0;
  let firstReserveEligibleAt = 0;
  let firstReserveShotAt = 0;
  let reserveCoverageQualifiedFrames = 0;
  const reserveShotMisses = [];
  const distances = [];
  const samples = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const detail = row.detail || {};
    const atMs = Date.parse(row.entry.at || '');
    const loggedSelf = detail.self;
    const loggedTarget = detail.target;
    if (!Number.isFinite(atMs) || !loggedSelf || !loggedTarget) continue;
    if (!self) self = { ...loggedSelf };
    const distance = Math.hypot(
      Number(loggedTarget.x) - Number(self.x),
      Number(loggedTarget.y) - Number(self.y)
    );
    const target = { ...loggedTarget, distance };
    distances.push(distance);
    const insidePressureBand = distance >= Number(range.minRangeCm)
      && distance <= Number(range.maxRangeCm);
    const outsideReactiveBand = distance >= Number(range.normalMinRangeCm);
    pressureBandSamples = insidePressureBand ? pressureBandSamples + 1 : 0;
    pressureReleaseSamples = outsideReactiveBand ? pressureReleaseSamples + 1 : 0;
    pressureAttackCommitted = range.progressiveMissClose === true
      ? true
      : (pressureAttackCommitted
          ? pressureReleaseSamples < 3
          : pressureBandSamples >= 3);
    if (pressureAttackCommitted) {
      pressureAttackFrames += 1;
      const fireState = determineCombatFireState(loggedSelf, target, {
        closePressure: true,
        closePressureAttack: true,
        closePressureReserveMs: 2600,
        shotCostMs: 500
      });
      const coverage = detail.shooting?.trajectoryCoverage || {};
      const fireGate = {
        ...(detail.shooting?.highEntropyFireGate || {}),
        active: true,
        suppressFire: true,
        reason: 'shared-fire-budget-exhausted'
      };
      if (hypotheticalAcceptedShots === null) {
        const initialBudget = evaluateCombatFireBudgetCore({
          targetId: options.targetId,
          acceptedShotsSinceDamage: 0,
          fireGate,
          probeState: { suppressFire: false },
          trajectoryCoverage: coverage
        });
        hypotheticalAcceptedShots = initialBudget.ordinaryBudgetMax;
      }
      closeBandReserve = updateCloseBandReserveCore(closeBandReserve, {
        targetId: options.targetId,
        acceptedShots: hypotheticalAcceptedShots,
        distance,
        coverageQualified: Boolean(coverage.active && Number(coverage.selected?.marginalCoverage || 0) >= 0.02),
        nowMs: atMs
      });
      if (closeBandReserve.coverageQualified) reserveCoverageQualifiedFrames += 1;
      if (closeBandReserve.eligible && !firstReserveEligibleAt) firstReserveEligibleAt = atMs;
      const exhaustedBudgetInput = {
        targetId: options.targetId,
        acceptedShotsSinceDamage: hypotheticalAcceptedShots,
        fireGate,
        probeState: { suppressFire: true },
        trajectoryCoverage: coverage,
        closeBandReserve,
        closePressure: true
      };
      const baselineBudget = evaluateCombatFireBudgetCore({
        ...exhaustedBudgetInput,
        pressureAttack: false
      });
      const pressureBudget = evaluateCombatFireBudgetCore({
        ...exhaustedBudgetInput,
        pressureAttack: true,
        boundedPressureVolley: options.boundedPressureVolley === true
      });
      if (!pressureBudget.suppressFire
        && ['close-pressure-full-attack', 'close-range-fire-override', 'close-band-reserve']
          .includes(String(pressureBudget.authorizationSource || ''))) {
        pressureAttackBudgetUnlockFrames += 1;
      }
      const fireReady = !row.detail?.exit
        && distance <= 14500
        && fireState.state !== 'disabled'
        && fireState.state !== 'paused'
        && !pressureBudget.suppressFire;
      if (fireReady) {
        pressureAttackReadyFrames += 1;
        pressureAttackCadenceMs = pressureAttackCadenceMs === null
          ? Number(fireState.cadenceMs)
          : Math.max(pressureAttackCadenceMs, Number(fireState.cadenceMs));
        if (pressureBudget.authorizationSource === 'close-band-reserve'
          && (!lastReserveShotAt || atMs - lastReserveShotAt >= 160)) {
          const selectedAim = coverage.selected
            ? { x: Number(coverage.selected.aimX), y: Number(coverage.selected.aimY) }
            : { x: Number(detail.aim?.x), y: Number(detail.aim?.y) };
          reserveShotMisses.push(replayVirtualShotMiss(rows, index, detail, selectedAim));
          hypotheticalAcceptedShots += 1;
          reserveShotsFired += 1;
          lastReserveShotAt = atMs;
          if (!firstReserveShotAt) firstReserveShotAt = atMs;
        }
      } else {
        pressureAttackPausedFrames += 1;
      }
      closeBandReserve.lastAuthorization = pressureBudget.authorizationSource;
      if (!firstPressureAttack) {
        firstPressureAttack = {
          line: row.line,
          at: row.entry.at || '',
          distanceCm: Math.round(distance),
          bandSamples: pressureBandSamples,
          fireState: fireState.state,
          fireReason: fireState.reason,
          cadenceMs: Number.isFinite(Number(fireState.cadenceMs)) ? Number(fireState.cadenceMs) : null,
          reserveMs: Number.isFinite(Number(fireState.reserve)) ? Number(fireState.reserve) : null,
          budgetAuthorization: pressureBudget.authorizationSource || '',
          budgetUnlocked: Boolean(baselineBudget.suppressFire && !pressureBudget.suppressFire)
        };
      }
    }
    const threatField = detail.movement?.dodge?.threatField || [];
    let dx = 0;
    let dy = 0;
    let movement = '';
    let strategicMovement = '';
    let strategicDx = 0;
    let strategicDy = 0;
    if (distance > Number(range.rangeCm) + hysteresisCm) {
      strategicDx = Math.sign(Number(target.x) - Number(self.x));
      strategicDy = Math.sign(Number(target.y) - Number(self.y));
      strategicMovement = 'close-pressure-approach';
    } else if (distance < Number(range.minRangeCm)) {
      strategicDx = Math.sign(Number(self.x) - Number(target.x));
      strategicDy = Math.sign(Number(self.y) - Number(target.y));
      strategicMovement = 'close-pressure-separate';
    } else {
      const strafe = combatPressureStrafeCore(self, target, {
        targetId: options.targetId,
        phaseStartedAt: options.phaseStartedAt
      }, { nowMs: atMs });
      strategicDx = Number(strafe.dx || 0);
      strategicDy = Number(strafe.dy || 0);
      strategicMovement = strafe.reason || 'close-pressure-strafe';
    }
    const hasThreat = options.preserveThreat === true && threatField.length > 0;
    if (hasThreat) {
      threatFrames += 1;
      const arbitration = selectCombatMovementArbitrationCore({
        threatField,
        strategicDirection: { dx: strategicDx, dy: strategicDy },
        currentDirection: { dx: Math.sign(Number(self.vx || 0)), dy: Math.sign(Number(self.vy || 0)) },
        emergencyDirection: { dx: Number(detail.movement?.dx || 0), dy: Number(detail.movement?.dy || 0) }
      }, {
        minimumCpaCm: Math.max(200, Number(options.hitRadius || 90) + 110)
      });
      dx = Number(arbitration.dx || 0);
      dy = Number(arbitration.dy || 0);
      if (arbitration.source === 'strategic-safe') {
        movement = strategicMovement;
        safeCloseFrames += 1;
        if (strategicMovement === 'close-pressure-approach') approachFrames += 1;
        else if (strategicMovement === 'close-pressure-separate') separateFrames += 1;
        else strafeFrames += 1;
        if (Number(arbitration.selectedThreat?.directHits || 0) > 0) unsafeSafeCloseFrames += 1;
      } else if (arbitration.source === 'current-safe-hold' || arbitration.source === 'pending-safe-hold') {
        movement = 'current-safe-hold';
        currentSafeHoldFrames += 1;
      } else {
        movement = 'trajectory-dodge-preserved';
        preservedDodgeFrames += 1;
      }
    } else {
      dx = strategicDx;
      dy = strategicDy;
      movement = strategicMovement;
      if (strategicMovement === 'close-pressure-approach') approachFrames += 1;
      else if (strategicMovement === 'close-pressure-separate') separateFrames += 1;
      else strafeFrames += 1;
    }
    if (samples.length < 12 && (movement !== 'trajectory-dodge-preserved' || safeCloseFrames <= 3)) {
      samples.push({
        line: row.line,
        at: row.entry.at || '',
        distanceCm: Math.round(distance),
        movement,
        dx,
        dy
      });
    }
    const nextAtMs = index + 1 < rows.length ? Date.parse(rows[index + 1].entry.at || '') : atMs;
    const elapsedMs = Math.max(0, Math.min(maxFrameMs, nextAtMs - atMs));
    const diagonalScale = dx && dy ? Math.SQRT1_2 : 1;
    const travel = moveSpeedPerTick * (elapsedMs / tickMs) * diagonalScale;
    self = {
      ...self,
      x: Number(self.x) + dx * travel,
      y: Number(self.y) + dy * travel,
      vx: dx * moveSpeedPerTick * diagonalScale,
      vy: dy * moveSpeedPerTick * diagonalScale
    };
  }
  const controlledMin = Math.max(0, Number(range.minRangeCm) - hysteresisCm);
  const controlledMax = Number(range.maxRangeCm) + hysteresisCm;
  return {
    frames: distances.length,
    approachFrames,
    separateFrames,
    strafeFrames,
    threatFrames,
    safeCloseFrames,
    unsafeSafeCloseFrames,
    preservedDodgeFrames,
    currentSafeHoldFrames,
    pressureAttack: {
      confirmTicks: 3,
      releaseTicks: 3,
      committedFrames: pressureAttackFrames,
      readyFrames: pressureAttackReadyFrames,
      pausedFrames: pressureAttackPausedFrames,
      budgetUnlockFrames: pressureAttackBudgetUnlockFrames,
      cadenceMs: pressureAttackCadenceMs,
      firstCommit: firstPressureAttack,
      reserve: {
        shotsFired: reserveShotsFired,
        coverageQualifiedFrames: reserveCoverageQualifiedFrames,
        estimatedHits: reserveShotMisses.filter(miss => miss <= 90).length,
        missesCm: reserveShotMisses.map(miss => Number.isFinite(miss) ? Number(miss.toFixed(1)) : null),
        p50MissCm: percentile(reserveShotMisses.filter(Number.isFinite), 0.5),
        firstEligibleAt: firstReserveEligibleAt ? new Date(firstReserveEligibleAt).toISOString() : '',
        firstShotAt: firstReserveShotAt ? new Date(firstReserveShotAt).toISOString() : '',
        firstShotDelayMs: firstReserveEligibleAt && firstReserveShotAt
          ? firstReserveShotAt - firstReserveEligibleAt
          : null,
        state: closeBandReserve
      }
    },
    strictPressureBandFrames: distances.filter(distance => (
      distance >= Number(range.minRangeCm) && distance <= Number(range.maxRangeCm)
    )).length,
    controlledPressureBandFrames: distances.filter(distance => (
      distance >= controlledMin && distance <= controlledMax
    )).length,
    distance: closePressureDistanceStats(distances),
    samples
  };
}

function replayCombatClosePressure(options) {
  const rows = selectedEntries(options).filter(({ detail }) => {
    const target = detail.target || null;
    if (!target) return false;
    if (options.targetId && String(target.userId ?? target.user_id ?? '') !== options.targetId) return false;
    if (options.targetName && String(target.name || '') !== options.targetName) return false;
    return true;
  });
  if (!rows.length) {
    return {
      mode: 'combat-close-pressure',
      targetId: options.targetId || '',
      targetName: options.targetName || '',
      lines: `${options.startLine}-${options.endLine}`,
      frames: 0,
      accepted: false
    };
  }
  const firstAtMs = Date.parse(rows[0].entry.at || '');
  const metricStartedAt = numberOrNull(rows[0].detail.metrics?.startedAt);
  const startedAt = metricStartedAt ?? firstAtMs;
  const targetId = options.targetId || String(rows[0].detail.target?.userId ?? rows[0].detail.target?.user_id ?? '');
  let firstHp = numberOrNull(rows[0].detail.target?.hp);
  let minHp = firstHp;
  let previousHp = firstHp;
  let acceptedShotsAtDamage = Math.max(0, Number(rows[0].detail.metrics?.acceptedShots || 0));
  let damageProgressAt = startedAt;
  let phaseState = {
    id: targetId,
    firstSeenAt: startedAt,
    firstHp,
    minHp,
    combatPhase: 'normal-combat'
  };
  let trigger = null;
  let policyTimeout = null;
  let generationExit = null;
  let stepsStarted = 0;
  let stepsReached = 0;
  let lastReachedStep = 0;
  const phaseRows = [];
  const timingP90Ticks = percentile(rows
    .map(row => numberOrNull(row.detail.timing?.rollingP90Ticks))
    .filter(Number.isFinite), 0.9) ?? 5;
  const pressureOptions = {
    combatMissCloseTriggerShots: 10,
    combatMissCloseStepShots: 10,
    combatMissCloseStepCm: 1000,
    combatMissCloseMinimumDistanceCm: 1000,
    combatMissCloseTimeoutMs: 30000,
    combatControlIntervalMs: options.controlIntervalMs,
    combatServerTickMs: 50,
    combatBulletSpeedPerTick: 500,
    combatMoveSpeedPerTick: 50,
    combatBulletHitRadiusCm: 90,
    combatFrameJitterMs: 50,
    combatReactionSafetyMarginMs: 100,
    combatClosePressureMinRangeCm: 4500,
    combatClosePressureMaxRangeCm: 5500,
    movementExecutionTiming: { p90Ticks: timingP90Ticks }
  };
  for (const row of rows) {
    const atMs = Date.parse(row.entry.at || '');
    const hp = numberOrNull(row.detail.target?.hp);
    const acceptedShots = Math.max(0, Number(row.detail.metrics?.acceptedShots || 0));
    if (firstHp === null && hp !== null) firstHp = hp;
    if (hp !== null) minHp = minHp === null ? hp : Math.min(minHp, hp);
    if (hp !== null && previousHp !== null && hp < previousHp - 0.01) {
      acceptedShotsAtDamage = acceptedShots;
      damageProgressAt = atMs;
    }
    if (hp !== null) previousHp = hp;
    const damageFromStart = firstHp !== null && minHp !== null ? Math.max(0, firstHp - minHp) : null;
    const phase = combatPressurePhaseCore(phaseState, {
      targetId,
      nowMs: atMs,
      engagedAt: startedAt,
      ordinaryProfit: true,
      targetHp: hp,
      firstHp,
      minHp,
      damageFromStart,
      damageKnown: damageFromStart !== null,
      damageProgressAt,
      acceptedShotsSinceDamage: Math.max(0, acceptedShots - acceptedShotsAtDamage),
      distance: numberOrNull(row.detail.target?.distance)
    }, pressureOptions);
    phaseState = {
      ...phaseState,
      id: targetId,
      combatPhase: phase.phase,
      phaseStartedAt: phase.phaseStartedAt,
      closePressure: phase.active ? phase : null,
      firstHp,
      minHp,
      hp
    };
    if (phase.active) {
      if (!trigger) trigger = { ...phase, line: row.line, at: row.entry.at || '' };
      stepsStarted = Math.max(stepsStarted, Number(phase.stepIndex || 0));
      if (phase.withinGoal && Number(phase.stepIndex || 0) > lastReachedStep) {
        lastReachedStep = Number(phase.stepIndex || 0);
        stepsReached += 1;
      }
      if (!policyTimeout && phase.stepTimedOut) {
        policyTimeout = {
          line: row.line,
          at: row.entry.at || '',
          elapsedMs: atMs - startedAt,
          stepIndex: phase.stepIndex,
          stepElapsedMs: phase.stepElapsedMs,
          stepStartDistanceCm: phase.stepStartDistanceCm,
          goalDistanceCm: phase.goalDistanceCm,
          targetDistanceCm: phase.targetDistance,
          movementStamina: Math.max(0, Number(row.detail.metrics?.movementStaminaSpent || 0))
        };
      }
      if (!generationExit && phase.generationLimitReached) {
        generationExit = {
          line: row.line,
          at: row.entry.at || '',
          elapsedMs: atMs - startedAt,
          generationElapsedMs: phase.generationElapsedMs,
          completedSteps: phase.completedSteps,
          acceptedShots: Math.max(0, Number(row.detail.metrics?.acceptedShots || 0)),
          confirmedHits: Math.max(0, Number(row.detail.metrics?.confirmedHits || 0)),
          shootingStamina: Math.max(0, Number(row.detail.metrics?.shootingStaminaSpent || 0)),
          movementStamina: Math.max(0, Number(row.detail.metrics?.movementStaminaSpent || 0)),
          reason: phase.generationTimedOut
            ? 'combat-no-damage-generation-deadline'
            : 'combat-no-damage-generation-step-limit'
        };
      }
      phaseRows.push(row);
    }
  }
  const range = trigger?.range || combatPressureTargetRangeCore(pressureOptions);
  const historicalDistances = phaseRows.map(row => numberOrNull(row.detail.target?.distance)).filter(Number.isFinite);
  const threatPreserving = replayClosePressureMovement(phaseRows, {
    ...options,
    targetId,
    phaseStartedAt: trigger?.phaseStartedAt || startedAt + 60000,
    range,
    hysteresisCm: trigger?.arrivalToleranceCm ?? 100,
    preserveThreat: true
  });
  const noBulletControl = replayClosePressureMovement(phaseRows, {
    ...options,
    targetId,
    phaseStartedAt: trigger?.phaseStartedAt || startedAt + 60000,
    range,
    hysteresisCm: trigger?.arrivalToleranceCm ?? 100,
    preserveThreat: false
  });
  const boundedVolley = replayClosePressureMovement(phaseRows, {
    ...options,
    targetId,
    phaseStartedAt: trigger?.phaseStartedAt || startedAt + 60000,
    range,
    hysteresisCm: trigger?.arrivalToleranceCm ?? 100,
    preserveThreat: true,
    boundedPressureVolley: true
  });
  let suppressedFireFrames = 0;
  let reopenedFireEligibleFrames = 0;
  let reopenedEstimatedShots = 0;
  let reopenedEstimatedHits = 0;
  let lastReopenedShotAt = 0;
  const reopenedShotMisses = [];
  let hardExitFrames = 0;
  for (let index = 0; index < phaseRows.length; index += 1) {
    const row = phaseRows[index];
    const detail = row.detail || {};
    if (detail.exit) hardExitFrames += 1;
    const advisorySuppressed = Boolean(
      detail.shooting?.highEntropyFireGate?.advisorySuppressFire === true
        || detail.shooting?.highEntropyFireGate?.suppressFire === true
        || detail.shooting?.behaviorSuppressed === true
    );
    if (!advisorySuppressed) continue;
    suppressedFireFrames += 1;
    const fireState = determineCombatFireState(detail.self || {}, detail.target || {}, {
      closePressure: true,
      closePressureAttack: true,
      closePressureCadenceMs: 520,
      closePressureReserveMs: 2600,
      shotCostMs: 500
    });
    if (!detail.exit
      && Number(detail.target?.distance) <= 14500
      && fireState.state !== 'disabled'
      && fireState.state !== 'paused') {
      reopenedFireEligibleFrames += 1;
      const atMs = Date.parse(row.entry.at || '');
      const cadenceMs = Math.max(1, Number(fireState.cadenceMs || 160));
      if (Number.isFinite(atMs) && (!lastReopenedShotAt || atMs - lastReopenedShotAt >= cadenceMs)) {
        const aim = detail.aim && Number.isFinite(Number(detail.aim.x)) && Number.isFinite(Number(detail.aim.y))
          ? { x: Number(detail.aim.x), y: Number(detail.aim.y) }
          : { x: Number(detail.target?.x), y: Number(detail.target?.y) };
        const miss = replayVirtualShotMiss(phaseRows, index, detail, aim);
        reopenedShotMisses.push(miss);
        reopenedEstimatedShots += 1;
        if (miss <= Number(options.hitRadius || 90)) reopenedEstimatedHits += 1;
        lastReopenedShotAt = atMs;
      }
    }
  }
  const historical = {
    pressureFrames: phaseRows.length,
    targetContinuityFrames: phaseRows.filter(row => (
      String(row.detail.target?.userId ?? row.detail.target?.user_id ?? '') === targetId
    )).length,
    closeMovementFrames: phaseRows.filter(row => /close|reengage|response/.test(String(row.detail.movement?.reason || ''))).length,
    suppressedFireFrames,
    hardExitFrames,
    distance: closePressureDistanceStats(historicalDistances)
  };
  const result = {
    mode: 'combat-close-pressure',
    targetId,
    targetName: options.targetName || String(rows[0].detail.target?.name || ''),
    lines: `${options.startLine}-${options.endLine}`,
    frames: rows.length,
    startedAt: Number.isFinite(startedAt) ? new Date(startedAt).toISOString() : '',
    trigger: trigger ? {
      line: trigger.line,
      at: trigger.at,
      engagedMs: trigger.engagedMs,
      delayMs: Number.isFinite(startedAt) ? Date.parse(trigger.at) - startedAt : null,
      reason: trigger.triggerReason,
      damageFromStart: trigger.damageFromStart,
      acceptedShotsSinceDamage: trigger.acceptedShotsSinceDamage,
      stepIndex: trigger.stepIndex,
      stepStartDistanceCm: trigger.stepStartDistanceCm,
      goalDistanceCm: trigger.goalDistanceCm
    } : null,
    progressiveClose: {
      stepCm: 1000,
      stepShots: 10,
      timeoutMs: 30000,
      stepsStarted,
      stepsReached,
      timeout: policyTimeout,
      estimatedTimeSavedMs: policyTimeout
        ? Math.max(0, Date.parse(rows.at(-1).entry.at || '') - Date.parse(policyTimeout.at || ''))
        : 0,
      estimatedMovementStaminaSaved: policyTimeout
        ? Math.max(
            0,
            Number(rows.at(-1).detail.metrics?.movementStaminaSpent || 0) - Number(policyTimeout.movementStamina || 0)
          )
        : 0
    },
    noDamageGeneration: {
      maxMs: pressureOptions.combatMissCloseGenerationMaxMs ?? 90000,
      maxSteps: pressureOptions.combatMissCloseGenerationMaxSteps ?? 4,
      exit: generationExit
    },
    range,
    historical,
    threatPreserving,
    noBulletControl,
    boundedVolley,
    reopenedFireEligibleFrames,
    reopenedFire: {
      estimatedShots: reopenedEstimatedShots,
      estimatedHits: reopenedEstimatedHits,
      hitRadiusCm: Number(options.hitRadius || 90),
      p50MissCm: percentile(reopenedShotMisses.filter(Number.isFinite), 0.5)
    }
  };
  const reserveReplay = threatPreserving.pressureAttack.reserve;
  const fullAttackAuthorized = threatPreserving.pressureAttack.budgetUnlockFrames > 0
    && String(threatPreserving.pressureAttack.firstCommit?.budgetAuthorization || '') === 'close-pressure-full-attack';
  const reserveAccepted = fullAttackAuthorized || (reserveReplay.coverageQualifiedFrames > 0
    ? (reserveReplay.shotsFired > 0
      && reserveReplay.shotsFired <= 2
      && Number(reserveReplay.firstShotDelayMs) <= 200)
    : reserveReplay.shotsFired === 0);
  result.accepted = Boolean(
    trigger
      && trigger.acceptedShotsSinceDamage >= 10
      && trigger.triggerReason === 'missed-shots-threshold'
      && range.progressiveMissClose === true
      && Number(trigger.stepStartDistanceCm) - Number(trigger.goalDistanceCm) <= 1000
      && Number(trigger.stepStartDistanceCm) - Number(trigger.goalDistanceCm) > 0
      && historical.pressureFrames > 0
      && historical.targetContinuityFrames === historical.pressureFrames
      && (threatPreserving.threatFrames === 0 || threatPreserving.safeCloseFrames > 0)
      && threatPreserving.unsafeSafeCloseFrames === 0
      && threatPreserving.pressureAttack.committedFrames > 0
      && threatPreserving.pressureAttack.readyFrames > 0
      && (reserveReplay.coverageQualifiedFrames === 0
        || threatPreserving.pressureAttack.budgetUnlockFrames > 0)
      && threatPreserving.pressureAttack.cadenceMs === 160
      && reserveAccepted
      && (policyTimeout
        ? policyTimeout.stepElapsedMs >= 30000
        : stepsReached > 0)
      && (policyTimeout || threatPreserving.distance.p50Cm < historical.distance.p50Cm)
  );
  return result;
}

function replayNoDamageGenerationGrid(options) {
  const rows = selectedEntries(options).filter(({ detail }) => {
    const target = detail.target || null;
    if (!target) return false;
    if (options.targetId && String(target.userId ?? target.user_id ?? '') !== options.targetId) return false;
    if (options.targetName && String(target.name || '') !== options.targetName) return false;
    return true;
  });
  if (!rows.length) return { mode: 'combat-no-damage-generation-grid', frames: 0, accepted: false };
  const targetId = options.targetId || String(rows[0].detail.target?.userId ?? rows[0].detail.target?.user_id ?? '');
  const runCase = (generationMaxMs, generationMaxSteps) => {
    const firstAtMs = Date.parse(rows[0].entry.at || '');
    let firstHp = numberOrNull(rows[0].detail.target?.hp);
    let minHp = firstHp;
    let previousHp = firstHp;
    let acceptedShotsAtDamage = Math.max(0, Number(rows[0].detail.metrics?.acceptedShots || 0));
    let damageProgressAt = firstAtMs;
    let phaseState = { id: targetId, firstSeenAt: firstAtMs, combatPhase: 'normal-combat' };
    let firstTrigger = null;
    let firstExit = null;
    let firstDamage = null;
    for (const row of rows) {
      const atMs = Date.parse(row.entry.at || '');
      const hp = numberOrNull(row.detail.target?.hp);
      const metrics = row.detail.metrics || {};
      const acceptedShots = Math.max(0, Number(metrics.acceptedShots || 0));
      if (firstHp === null && hp !== null) firstHp = hp;
      if (hp !== null) minHp = minHp === null ? hp : Math.min(minHp, hp);
      if (hp !== null && previousHp !== null && hp < previousHp - 0.01) {
        if (!firstDamage) {
          firstDamage = {
            line: row.line,
            at: row.entry.at || '',
            elapsedMs: atMs - firstAtMs,
            damage: previousHp - hp,
            acceptedShots,
            confirmedHits: Math.max(0, Number(metrics.confirmedHits || 0))
          };
        }
        acceptedShotsAtDamage = acceptedShots;
        damageProgressAt = atMs;
      }
      if (hp !== null) previousHp = hp;
      const phase = combatPressurePhaseCore(phaseState, {
        targetId,
        nowMs: atMs,
        engagedAt: firstAtMs,
        ordinaryProfit: true,
        targetHp: hp,
        firstHp,
        minHp,
        damageFromStart: firstHp !== null && minHp !== null ? Math.max(0, firstHp - minHp) : null,
        damageKnown: firstHp !== null && minHp !== null,
        damageProgressAt,
        acceptedShotsSinceDamage: Math.max(0, acceptedShots - acceptedShotsAtDamage),
        shootingStaminaSinceDamage: Math.max(0, Number(metrics.shootingStaminaSpent || 0)),
        movementStaminaSinceDamage: Math.max(0, Number(metrics.movementStaminaSpent || 0)),
        distance: numberOrNull(row.detail.target?.distance)
      }, {
        combatMissCloseTriggerShots: 10,
        combatMissCloseStepShots: 10,
        combatMissCloseStepCm: 1000,
        combatMissCloseMinimumDistanceCm: 1000,
        combatMissCloseTimeoutMs: 30000,
        combatMissCloseGenerationMaxMs: generationMaxMs,
        combatMissCloseGenerationMaxSteps: generationMaxSteps
      });
      phaseState = {
        ...phaseState,
        id: targetId,
        combatPhase: phase.phase,
        phaseStartedAt: phase.phaseStartedAt,
        closePressure: phase.active ? phase : null,
        firstHp,
        minHp,
        hp
      };
      if (!firstTrigger && phase.active) {
        firstTrigger = { line: row.line, at: row.entry.at || '', acceptedShots };
      }
      if (!firstExit && phase.generationLimitReached) {
        firstExit = {
          line: row.line,
          at: row.entry.at || '',
          elapsedMs: atMs - firstAtMs,
          generationElapsedMs: phase.generationElapsedMs,
          completedSteps: phase.completedSteps,
          retainedHits: Math.max(0, Number(metrics.confirmedHits || 0)),
          acceptedShots,
          shootingStamina: Math.max(0, Number(metrics.shootingStaminaSpent || 0)),
          movementStamina: Math.max(0, Number(metrics.movementStaminaSpent || 0)),
          reason: phase.generationTimedOut
            ? 'combat-no-damage-generation-deadline'
            : 'combat-no-damage-generation-step-limit'
        };
        break;
      }
    }
    return { generationMaxMs, generationMaxSteps, firstTrigger, firstDamage, firstExit };
  };
  const grid = [60000, 90000, 120000].flatMap(generationMaxMs => (
    [2, 3, 4].map(generationMaxSteps => runCase(generationMaxMs, generationMaxSteps))
  ));
  const selected = grid.find(item => item.generationMaxMs === 90000 && item.generationMaxSteps === 4) || null;
  const finalMetrics = rows.at(-1).detail.metrics || {};
  return {
    mode: 'combat-no-damage-generation-grid',
    targetId,
    targetName: options.targetName || String(rows[0].detail.target?.name || ''),
    lines: `${options.startLine}-${options.endLine}`,
    frames: rows.length,
    grid,
    selected,
    retainedConfirmedHits: Math.max(0, Number(finalMetrics.confirmedHits || 0)),
    executionChanged: false,
    accepted: options.expectNewExit
      ? Boolean(selected?.firstTrigger && selected?.firstExit)
      : Boolean(!selected?.firstExit && Math.max(0, Number(finalMetrics.confirmedHits || 0)) > 0)
  };
}

function replayResponsePolicyShadow(options) {
  const rows = selectedEntries(options).filter(({ detail }) => {
    const target = detail.target || null;
    if (!target) return false;
    if (options.targetId && String(target.userId ?? target.user_id ?? '') !== options.targetId) return false;
    if (options.targetName && String(target.name || '') !== options.targetName) return false;
    return true;
  });
  if (!rows.length) return { mode: 'combat-response-policy-shadow', frames: 0, accepted: false };
  const targetId = options.targetId || String(rows[0].detail.target?.userId ?? rows[0].detail.target?.user_id ?? '');
  const baseline = { switches: 0, sameModeSwitches: 0 };
  let lastPolicy = '';
  let lastMode = '';
  for (const row of rows) {
    const policy = String(row.detail.behavior?.responsePolicy?.name || row.detail.shooting?.responsePolicy || '');
    const mode = String(row.detail.behavior?.mode || row.detail.shooting?.recognizedMode || 'mixed/unknown');
    if (policy && lastPolicy && policy !== lastPolicy) {
      baseline.switches += 1;
      if (mode === lastMode) baseline.sameModeSwitches += 1;
    }
    if (policy) lastPolicy = policy;
    lastMode = mode;
  }
  const runCase = (confirmTicks, minimumHoldMs) => {
    let state = null;
    let switches = 0;
    let sameModeSwitches = 0;
    let suppressed = 0;
    let bypasses = 0;
    let previousRecognizedMode = '';
    for (const row of rows) {
      const policy = row.detail.behavior?.responsePolicy || row.detail.shooting?.responsePolicy || '';
      const recognizedMode = String(
        row.detail.behavior?.mode || row.detail.shooting?.recognizedMode || 'mixed/unknown'
      );
      const defensivePressureReason = String(row.detail.shooting?.defensivePressureReason || '');
      const bypassReason = row.detail.exit
        ? 'hp-or-exit'
        : (defensivePressureReason === 'collision-risk-target-bullet'
            ? 'real-incoming-bullet'
            : (/dodge/.test(String(row.detail.movement?.reason || '')) ? 'dodge-unsafe' : ''));
      state = updateCombatResponsePolicyShadowCore(state, {
        targetId,
        nowMs: Date.parse(row.entry.at || ''),
        candidatePolicy: policy,
        recognizedMode,
        bypassReason
      }, { confirmTicks, minimumHoldMs });
      if (state.switched) {
        switches += 1;
        if (recognizedMode === previousRecognizedMode) sameModeSwitches += 1;
      }
      if (state.suppressed) suppressed += 1;
      if (state.bypassed) bypasses += 1;
      previousRecognizedMode = recognizedMode;
    }
    const reductionPct = baseline.sameModeSwitches > 0
      ? (baseline.sameModeSwitches - sameModeSwitches) / baseline.sameModeSwitches * 100
      : null;
    return {
      confirmTicks,
      minimumHoldMs,
      switches,
      sameModeSwitches,
      suppressed,
      bypasses,
      reductionPct: reductionPct === null ? null : Number(reductionPct.toFixed(2)),
      finalCommittedPolicy: state?.committedPolicy || ''
    };
  };
  const grid = [3, 5, 6].flatMap(confirmTicks => [300, 500].map(minimumHoldMs => runCase(confirmTicks, minimumHoldMs)));
  const selected = grid.find(item => item.confirmTicks === 6 && item.minimumHoldMs === 500) || null;
  const finalMetrics = rows.at(-1).detail.metrics || {};
  const requiredReductionPct = Math.max(0, Number(options.minImprovementPct || 0));
  return {
    mode: 'combat-response-policy-shadow',
    targetId,
    targetName: options.targetName || String(rows[0].detail.target?.name || ''),
    lines: `${options.startLine}-${options.endLine}`,
    frames: rows.length,
    baseline,
    grid,
    selected,
    requiredReductionPct,
    retainedConfirmedHits: Math.max(0, Number(finalMetrics.confirmedHits || 0)),
    retainedShootingFrames: rows.filter(row => row.detail.shooting?.wouldShoot).length,
    executionChanged: false,
    accepted: Boolean(
      selected
        && selected.finalCommittedPolicy
        && (requiredReductionPct <= 0 || Number(selected.reductionPct) >= requiredReductionPct)
    )
  };
}

function replayCombatDisengage(options) {
  const rows = selectedEntries(options).filter(({ detail }) => {
    const target = detail.target || null;
    if (!target) return false;
    if (options.targetId && String(target.userId ?? target.user_id ?? '') !== options.targetId) return false;
    if (options.targetName && String(target.name || '') !== options.targetName) return false;
    return true;
  });
  const attackRange = Math.max(0, Number(options.attackRange || 14500));
  const disengageRange = Math.max(attackRange, Number(options.disengageRange || 17000));
  const firstReleaseRow = rows.find(row => (
    row.detail?.combatPhase?.phase === 'close-pressure'
      && row.detail?.target?.combatEngagement?.closePressureHold === true
      && Number(row.detail?.target?.distance) > disengageRange
  )) || null;
  const firstReleaseIndex = firstReleaseRow ? rows.indexOf(firstReleaseRow) : -1;
  const baselineRowsAfterRelease = firstReleaseIndex >= 0 ? rows.slice(firstReleaseIndex) : [];
  const baselineCombatFramesAfterRelease = baselineRowsAfterRelease.filter(row => (
    row.detail?.combatPhase?.phase === 'close-pressure'
  )).length;
  const correctedCombatFramesAfterRelease = baselineRowsAfterRelease.filter(row => (
    Number(row.detail?.target?.distance) <= attackRange
  )).length;
  const firstAtMs = firstReleaseRow ? Date.parse(firstReleaseRow.entry.at || '') : 0;
  const lastAtMs = baselineRowsAfterRelease.length
    ? Date.parse(baselineRowsAfterRelease.at(-1).entry.at || '')
    : 0;
  const firstMovementStamina = Number(firstReleaseRow?.detail?.metrics?.movementStaminaSpent || 0);
  const lastMovementStamina = Number(baselineRowsAfterRelease.at(-1)?.detail?.metrics?.movementStaminaSpent || 0);
  const result = {
    mode: 'combat-disengage',
    targetId: options.targetId || String(rows[0]?.detail?.target?.userId ?? ''),
    targetName: options.targetName || String(rows[0]?.detail?.target?.name || ''),
    lines: `${options.startLine}-${options.endLine}`,
    frames: rows.length,
    attackRange,
    disengageRange,
    release: firstReleaseRow ? {
      line: firstReleaseRow.line,
      at: firstReleaseRow.entry.at || '',
      distanceCm: Number(firstReleaseRow.detail?.target?.distance || 0),
      outOfRangeMs: Number(firstReleaseRow.detail?.target?.combatEngagement?.outOfRangeMs || 0),
      phase: firstReleaseRow.detail?.combatPhase?.phase || '',
      closePressureHold: firstReleaseRow.detail?.target?.combatEngagement?.closePressureHold === true
    } : null,
    baselineCombatFramesAfterRelease,
    correctedCombatFramesAfterRelease,
    estimatedCombatHoldAvoidedMs: firstAtMs > 0 && lastAtMs >= firstAtMs ? lastAtMs - firstAtMs : 0,
    estimatedMovementStaminaSaved: Math.max(0, lastMovementStamina - firstMovementStamina)
  };
  result.accepted = Boolean(
    firstReleaseRow
      && baselineCombatFramesAfterRelease > 0
      && correctedCombatFramesAfterRelease === 0
      && Number(result.release.distanceCm) > disengageRange
  );
  return result;
}

function replayCombatEconomicStopLoss(options) {
  const rows = selectedEntries(options).filter(({ detail }) => {
    const target = detail.target || null;
    if (!target) return false;
    if (options.targetId && String(target.userId ?? target.user_id ?? '') !== options.targetId) return false;
    if (options.targetName && String(target.name || '') !== options.targetName) return false;
    return true;
  });
  if (!rows.length) {
    return {
      mode: 'combat-economic-stop-loss',
      targetId: options.targetId || '',
      targetName: options.targetName || '',
      lines: `${options.startLine}-${options.endLine}`,
      frames: 0,
      accepted: false
    };
  }
  const targetId = options.targetId || String(rows[0].detail.target?.userId ?? rows[0].detail.target?.user_id ?? '');
  const firstAtMs = Date.parse(rows[0].entry.at || '');
  let damageProgressAt = firstAtMs;
  let previousHp = numberOrNull(rows[0].detail.target?.hp);
  let acceptedShotsAtDamage = Math.max(0, Number(rows[0].detail.metrics?.acceptedShots || 0));
  let movementAtDamage = Math.max(0, Number(rows[0].detail.metrics?.movementStaminaSpent || 0));
  let stableCloseStartedAt = 0;
  let estimatedState = null;
  let highRoiState = null;
  let estimatedRelease = null;
  let highRoiRelease = null;
  let peakMovementStamina = 0;
  let threatFrames = 0;
  const releaseOptions = {
    softNoDamageMs: 60000,
    softMovementStamina: 100000,
    hardNoDamageMs: 180000,
    hardMovementStamina: 300000,
    pressureCycleMs: 60000
  };
  for (const row of rows) {
    const atMs = Date.parse(row.entry.at || '');
    const target = row.detail.target || {};
    const metrics = row.detail.metrics || {};
    const hp = numberOrNull(target.hp);
    const acceptedShots = Math.max(0, Number(metrics.acceptedShots || 0));
    const movementStamina = Math.max(0, Number(metrics.movementStaminaSpent || 0));
    peakMovementStamina = Math.max(peakMovementStamina, movementStamina);
    if (hp !== null && previousHp !== null && hp < previousHp - 0.01) {
      damageProgressAt = atMs;
      acceptedShotsAtDamage = acceptedShots;
      movementAtDamage = movementStamina;
      estimatedState = null;
      highRoiState = null;
    }
    if (hp !== null) previousHp = hp;
    const distance = Number(target.distance);
    const insideStableClose = Number.isFinite(distance) && distance >= 4500 && distance <= 5500;
    stableCloseStartedAt = insideStableClose
      ? (stableCloseStartedAt || atMs)
      : 0;
    const threatEvidence = Boolean(
      target.firing
        || row.detail.shooting?.defensivePressure
        || Number(metrics.selfDamage || 0) > 0
        || Number(metrics.incomingHits || 0) > 0
        || Number(metrics.threatBulletCount || 0) > 0
    );
    if (threatEvidence) threatFrames += 1;
    const confirmedHits = Math.max(0, Number(metrics.confirmedHits || 0));
    const behaviorHitRate = numberOrNull(row.detail.behavior?.recentHitRate);
    const observedHitRate = acceptedShots > 0 ? confirmedHits / acceptedShots : null;
    const hitRate = Math.max(0.03, Math.min(0.95,
      observedHitRate === null
        ? (behaviorHitRate ?? 0.18)
        : ((confirmedHits + Math.max(1, Number(behaviorHitRate ?? 0.18) * 6)) / (acceptedShots + 6))
    ));
    const remainingHits = hp === null ? 34 : Math.ceil(Math.max(0, hp) / 3);
    const remainingShots = Math.ceil(remainingHits / hitRate);
    const expectedRemainingStamina = remainingShots * 500 + Math.max(0, Number.isFinite(distance) ? distance - 7500 : 0);
    const estimatedRoi = Number(target.drop || 0) * 10000 / Math.max(1, expectedRemainingStamina);
    const coreInput = {
      nowMs: atMs,
      targetId,
      damageProgressAt,
      acceptedShotsSinceDamage: Math.max(0, acceptedShots - acceptedShotsAtDamage),
      movementStaminaSinceDamage: Math.max(0, movementStamina - movementAtDamage),
      stableCloseMs: stableCloseStartedAt ? Math.max(0, atMs - stableCloseStartedAt) : 0,
      requiredRoi: 1,
      threatEvidence
    };
    const estimated = evaluateNonThreatCombatEconomicStopLossCore({
      ...coreInput,
      marginalNetROI: estimatedRoi
    }, estimatedState, releaseOptions);
    estimatedState = estimated.state;
    if (!estimatedRelease && estimated.release) {
      estimatedRelease = {
        line: row.line,
        at: row.entry.at || '',
        elapsedMs: atMs - firstAtMs,
        movementStamina,
        estimatedRoi,
        reason: estimated.reason,
        diagnostics: estimated
      };
    }
    const highRoi = evaluateNonThreatCombatEconomicStopLossCore({
      ...coreInput,
      marginalNetROI: 1000000
    }, highRoiState, releaseOptions);
    highRoiState = highRoi.state;
    if (!highRoiRelease && highRoi.release) {
      highRoiRelease = {
        line: row.line,
        at: row.entry.at || '',
        elapsedMs: atMs - firstAtMs,
        movementStamina,
        reason: highRoi.reason,
        diagnostics: highRoi
      };
    }
  }
  const lastAtMs = Date.parse(rows.at(-1).entry.at || '');
  const durationMs = Math.max(0, lastAtMs - firstAtMs);
  const softEligible = durationMs >= releaseOptions.softNoDamageMs
    || peakMovementStamina >= releaseOptions.softMovementStamina;
  const result = {
    mode: 'combat-economic-stop-loss',
    targetId,
    targetName: options.targetName || String(rows[0].detail.target?.name || ''),
    lines: `${options.startLine}-${options.endLine}`,
    frames: rows.length,
    startedAt: rows[0].entry.at || '',
    endedAt: rows.at(-1).entry.at || '',
    durationMs,
    threatFrames,
    peakMovementStamina,
    estimatedRoiRelease: estimatedRelease,
    highRoiBoundedRelease: highRoiRelease,
    estimatedMovementStaminaSaved: estimatedRelease
      ? Math.max(0, peakMovementStamina - estimatedRelease.movementStamina)
      : 0,
    highRoiMovementStaminaSaved: highRoiRelease
      ? Math.max(0, peakMovementStamina - highRoiRelease.movementStamina)
      : 0
  };
  result.accepted = threatFrames === 0 && (softEligible
    ? Boolean(
        estimatedRelease
          && highRoiRelease
          && estimatedRelease.elapsedMs < durationMs
          && highRoiRelease.elapsedMs < durationMs
          && highRoiRelease.elapsedMs <= 120500
      )
    : !estimatedRelease && !highRoiRelease);
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

function replayAfkFinishCommitment(options) {
  const rows = selectedEntries(options);
  const samples = [];
  let baselinePrematureSwitches = 0;
  let correctedFinishHolds = 0;
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];
    const heldAction = previous.detail?.action || null;
    const bestAction = current.detail?.action || null;
    const heldTarget = heldAction?.target || null;
    const bestTarget = bestAction?.target || null;
    const heldId = String(heldTarget?.userId ?? '');
    const bestId = String(bestTarget?.userId ?? '');
    if (!heldId || !bestId || heldId === bestId) continue;
    const heldChoice = heldAction?.opportunityChoice || {};
    const bestChoice = bestAction?.opportunityChoice || {};
    const opportunities = [
      {
        type: 'enemy', id: bestId, distance: Number(bestTarget.distance), score: Number(bestChoice.score || 0),
        staminaCost: Number(bestAction.staminaCost), reward: Number(bestAction.reward || bestTarget.drop || 0), priorityTier: 1,
        sourceTarget: { ...bestTarget, active: false, alive: true }
      },
      {
        type: 'enemy', id: heldId, distance: Number(heldTarget.distance), score: Number(heldChoice.score || 0),
        staminaCost: Number(heldAction.staminaCost), reward: Number(heldAction.reward || heldTarget.drop || 0), priorityTier: 1,
        sourceTarget: { ...heldTarget, active: false, alive: true }
      }
    ];
    const replay = chooseStableOpportunityCore(
      opportunities,
      { key: `enemy:${heldId}`, type: 'enemy', id: heldId, until: 0 },
      { pendingKey: `enemy:${bestId}`, pendingCount: 2 },
      { nowMs: Date.parse(current.entry.at || '') || Date.now(), attackRange: options.attackRange, switchConfirmFrames: 3, oscillationSwitchLimit: 0 }
    );
    if (Number(heldTarget.hp) <= 60 && Number(heldTarget.distance) <= Number(options.attackRange)) {
      baselinePrematureSwitches += 1;
      if (String(replay.chosen?.id || '') === heldId && replay.chosen?.finishCommitment?.active) correctedFinishHolds += 1;
      samples.push({
        line: current.line,
        at: current.entry.at || '',
        baseline: { from: heldId, to: bestId },
        held: { name: heldTarget.name || '', hp: Number(heldTarget.hp), drop: Number(heldTarget.drop), distance: Number(heldTarget.distance), staminaCost: Number(heldAction.staminaCost) },
        competing: { name: bestTarget.name || '', hp: Number(bestTarget.hp), drop: Number(bestTarget.drop), distance: Number(bestTarget.distance), staminaCost: Number(bestAction.staminaCost) },
        correctedTargetId: replay.chosen?.id || '',
        correctedReason: replay.switchDiagnostics?.bestRejectedReason || ''
      });
    }
  }
  return {
    mode: 'afk-finish-commitment',
    lines: `${options.startLine}-${options.endLine}`,
    baselinePrematureSwitches,
    correctedFinishHolds,
    samples,
    accepted: baselinePrematureSwitches > 0 && correctedFinishHolds === baselinePrematureSwitches
  };
}

function replayAfkCombatHandoff(options) {
  const rows = selectedEntries(options);
  let previousAfkAction = null;
  let takeover = null;
  let firstLoot = null;
  let lastLoot = null;
  let finalExit = null;
  for (const row of rows) {
    const action = row.detail?.action || null;
    const actionTarget = action?.target || null;
    const actionTargetId = String(actionTarget?.userId ?? actionTarget?.user_id ?? '');
    if (['attack', 'opportunistic-shot'].includes(String(action?.kind || ''))
      && actionTarget
      && actionTarget.active === false
      && actionTargetId !== String(options.targetId || '')) {
      previousAfkAction = action;
    }
    const combatTarget = row.detail?.combat?.target || null;
    const combatTargetId = String(combatTarget?.userId ?? combatTarget?.user_id ?? '');
    if (!takeover && previousAfkAction && combatTargetId === String(options.targetId || '')) {
      const atMs = Date.parse(row.entry.at || '') || 0;
      const previousTarget = previousAfkAction.target || null;
      const commitment = recentAfkAttackCommitmentCore(previousAfkAction, [
        previousTarget,
        combatTarget
      ], {
        nowMs: atMs,
        combatAttackRange: options.attackRange,
        targetStickMs: 5000
      });
      const self = row.detail?.combat?.self || row.detail?.input?.self || null;
      const readiness = checkProactiveActiveCombatGates(self, combatTarget, {
        selfStamina5s: self?.stamina5s ?? self?.stamina5sRemainingMilli ?? self?.stamina_5s_remaining_milli,
        proactiveActiveCombatMinimumStamina5s: 5600,
        opportunityStaminaBudget: 200000
      });
      takeover = {
        line: row.line,
        at: row.entry.at || '',
        baselineFromTargetId: String(previousTarget?.userId ?? previousTarget?.user_id ?? ''),
        baselineFromTargetName: String(previousTarget?.name || ''),
        baselineToTargetId: combatTargetId,
        baselineToTargetName: String(combatTarget?.name || ''),
        baselineCombatIntent: String(combatTarget?.combatIntent || ''),
        baselineTargetFiring: Boolean(combatTarget?.firing),
        baselineSelfHp: Number(self?.hp),
        baselineSelfStamina5s: Number(self?.stamina5s ?? self?.stamina5sRemainingMilli ?? self?.stamina_5s_remaining_milli),
        commitment,
        readiness,
        correctedTargetId: commitment?.targetId || '',
        correctedReason: commitment?.reason || readiness.reason || ''
      };
    }
    const loot = row.detail?.input?.loot || null;
    if (loot?.candidate && Number(loot.candidate.amount || 0) >= 10) {
      const sample = {
        line: row.line,
        at: row.entry.at || '',
        amount: Number(loot.candidate.amount || 0),
        distance: Number(loot.candidate.distance || 0),
        sourceUserId: String(loot.candidate.sourceUserId ?? ''),
        blockedReason: String(loot.blockedReason || ''),
        ordinaryProfitClosePressure: row.detail?.combat?.combatPhase?.ordinaryProfit === true,
        correctedEligible: row.detail?.combat?.combatPhase?.ordinaryProfit === true
          && Number(row.detail?.combat?.self?.hp ?? row.detail?.input?.self?.hp ?? 0) > 50
      };
      if (!firstLoot) firstLoot = sample;
      lastLoot = sample;
    }
    if (action?.kind === 'safety-exit') {
      finalExit = {
        line: row.line,
        at: row.entry.at || '',
        reason: String(action.reason || ''),
        selfHp: Number(row.detail?.combat?.self?.hp),
        targetHp: Number(row.detail?.combat?.target?.hp),
        acceptedShots: Number(row.detail?.combat?.metrics?.acceptedShots || 0),
        confirmedHits: Number(row.detail?.combat?.metrics?.confirmedHits || 0),
        incomingHits: Number(row.detail?.combat?.metrics?.incomingHits || 0),
        selfDamage: Number(row.detail?.combat?.metrics?.selfDamage || 0),
        totalStaminaSpent: Number(row.detail?.combat?.metrics?.totalStaminaSpent || 0)
      };
    }
  }
  const baselineLootLocked = firstLoot?.blockedReason === 'close-pressure-combat-lock';
  const result = {
    mode: 'afk-combat-handoff',
    lines: `${options.startLine}-${options.endLine}`,
    takeover,
    loot: { first: firstLoot, last: lastLoot },
    finalExit,
    improvement: {
      retainedAfkTarget: Boolean(takeover?.commitment?.active),
      avoidedUnreadyProactiveCombat: takeover?.readiness?.allowed === false,
      recoveredHighValueLootEligibility: Boolean(baselineLootLocked && firstLoot?.correctedEligible),
      avoidedAcceptedMisses: Number(finalExit?.confirmedHits || 0) === 0
        ? Number(finalExit?.acceptedShots || 0)
        : 0,
      avoidedCombatStamina: Number(finalExit?.confirmedHits || 0) === 0
        ? Number(finalExit?.totalStaminaSpent || 0)
        : 0
    }
  };
  result.accepted = Boolean(
    takeover
      && takeover.baselineCombatIntent === 'profit'
      && takeover.baselineTargetFiring === false
      && takeover.commitment?.active
      && takeover.readiness?.allowed === false
      && baselineLootLocked
      && firstLoot?.correctedEligible
      && Number(finalExit?.acceptedShots || 0) > 0
      && Number(finalExit?.confirmedHits || 0) === 0
  );
  return result;
}

function replayExploration(options) {
  const rows = selectedEntries(options);
  const maxBudget = 5000;
  const attackRange = 14500;
  const requiredFrames = 3;
  const observations = new Map();
  const samples = [];
  let baselineAdmissions = 0;
  let correctedAdmissions = 0;
  let resetAfterWaitAdmissions = 0;
  let previousKind = '';
  let previousTargetId = '';
  for (const row of rows) {
    const action = row.detail?.action || {};
    const admission = action.explorationAdmission || row.detail?.profit?.threshold?.explorationAdmission || null;
    const filteredEnemy = (row.detail?.profit?.threshold?.filtered || [])
      .find(item => String(item.type || '') === 'enemy'
        && (!options.targetId || String(item.id ?? '') === options.targetId)) || null;
    const target = action.target?.type === 'enemy'
      ? action.target
      : null;
    const targetId = String(admission?.targetId ?? target?.userId ?? filteredEnemy?.id ?? '');
    if (!targetId || (options.targetId && targetId !== options.targetId)) {
      previousKind = String(action.kind || row.detail?.kind || '');
      continue;
    }
    const previous = observations.get(targetId) || { frames: 0, lastAt: 0 };
    const at = Date.parse(row.entry.at || '') || 0;
    const continuous = previous.lastAt > 0 && at - previous.lastAt <= 2500;
    const frames = continuous ? previous.frames + 1 : 1;
    observations.set(targetId, { frames, lastAt: at });
    const distance = numberOrNull(target?.distance);
    const estimatedApproachSpent = distance === null
      ? Math.max(0, Number(filteredEnemy?.staminaCost || action.staminaCost || 0))
      : Math.max(0, distance - attackRange);
    const baselineAdmitted = Boolean(action.explorationAdmitted || admission);
    const correctedAdmitted = frames >= requiredFrames && estimatedApproachSpent < maxBudget;
    if (baselineAdmitted) {
      baselineAdmissions += 1;
      if (correctedAdmitted) correctedAdmissions += 1;
      if (previousKind === 'wait' && previousTargetId === targetId) resetAfterWaitAdmissions += 1;
      if (samples.length < 16) samples.push({
        line: row.line,
        at: row.entry.at,
        targetId,
        baseline: {
          acceptedShots: numberOrNull(admission?.acceptedShots),
          staminaSpent: numberOrNull(admission?.staminaSpent),
          durationMs: numberOrNull(admission?.durationMs)
        },
        corrected: {
          qualifiedFrames: frames,
          requiredFrames,
          estimatedApproachSpent: Math.round(estimatedApproachSpent),
          remainingBudget: Math.max(0, maxBudget - estimatedApproachSpent),
          admitted: correctedAdmitted,
          rejectionReason: correctedAdmitted
            ? ''
            : (frames < requiredFrames ? 'insufficient-qualified-frames' : 'estimated-approach-over-budget')
        }
      });
    }
    previousKind = String(action.kind || row.detail?.kind || '');
    previousTargetId = targetId;
  }
  return {
    mode: 'exploration',
    targetId: options.targetId || '',
    lines: `${options.startLine}-${options.endLine}`,
    evaluatedFrames: rows.length,
    baselineAdmissions,
    correctedAdmissions,
    preventedAdmissions: Math.max(0, baselineAdmissions - correctedAdmissions),
    resetAfterWaitAdmissions,
    maxBudget,
    requiredFrames,
    samples,
    accepted: baselineAdmissions > 0 && correctedAdmissions < baselineAdmissions
  };
}

function replayEasyKillContinuity(options) {
  const rows = selectedEntries(options);
  const targetId = String(options.targetId || '');
  if (!targetId) throw new Error('--target-id is required for easy-kill-continuity mode');
  const settlementRows = rows.filter(row => row.detail?.input?.postKillSettlement?.active === true);
  const settlementRow = settlementRows.find(row => Number(row.detail?.combat?.metrics?.acceptedShots || 0) > 0)
    || settlementRows[0]
    || null;
  const baselineSettlement = settlementRow?.detail?.input?.postKillSettlement || null;
  const settlementActionTarget = settlementRow?.detail?.action?.target || null;
  const settlementMetrics = settlementRow?.detail?.combat?.metrics || null;
  const correctedSettlement = settlementRow ? updatePostKillSettlementCore(null, {
    nowMs: Date.parse(settlementRow.entry.at || settlementRow.detail.at || '') || 0,
    previousCombatTarget: settlementActionTarget ? {
      userId: settlementActionTarget.userId ?? settlementActionTarget.id,
      name: settlementActionTarget.name || '',
      drop: settlementActionTarget.drop
    } : null,
    currentCombatTarget: settlementRow.detail?.combat?.target || null,
    combatMetrics: settlementMetrics,
    visibleTargets: [],
    selfKillEvidence: settlementRow.detail?.input?.selfKillEvidence || [],
    playerDropCoins: settlementRow.detail?.input?.loot?.candidate
      ? [settlementRow.detail.input.loot.candidate]
      : [],
    snapshotTick: baselineSettlement?.lastSnapshotTick ?? settlementRow.detail?.tick
  }, {
    unconfirmedMs: 1000,
    confirmedMs: 5000,
    recentShotMs: 1500
  }) : null;
  const correctedReleaseReason = settlementRow
    ? easyKillEngagementFinishReason(settlementRow.detail, targetId)
    : '';
  const firstAt = rows.length ? Date.parse(rows[0].entry.at || '') : 0;
  const lastAt = rows.length ? Date.parse(rows.at(-1).entry.at || '') : 0;
  const runnerFile = path.join(path.dirname(options.file), 'runner.jsonl');
  let engagementStartedEvents = 0;
  let falseReleaseEvents = 0;
  if (fs.existsSync(runnerFile) && firstAt > 0 && lastAt >= firstAt) {
    forEachJsonlEntry(runnerFile, entry => {
      const at = Date.parse(entry?.at || '');
      if (!Number.isFinite(at) || at < firstAt || at > lastAt) return;
      if (String(entry?.type || '') !== 'easy-kill-player-outcome') return;
      const event = entry.detail || {};
      if (String(event.userId ?? event.user_id ?? '') !== targetId) return;
      if (String(event.type || '') === 'engagement-started') engagementStartedEvents += 1;
      if (String(event.type || '') === 'engagement-ended-pending'
        && String(event.reason || '') === 'combat-action-released') falseReleaseEvents += 1;
    });
  }
  let blockedCandidateFrames = 0;
  let recoveredHigherScoreFrames = 0;
  const recoverySamples = [];
  for (const row of rows) {
    const candidates = row.detail?.profit?.easyKill?.candidates || [];
    const candidate = candidates.find(item => String(item?.userId ?? item?.user_id ?? '') === targetId) || null;
    if (!candidate || candidate.eligible !== false || String(candidate.rejectedReason || '') !== 'not-profit-eligible') continue;
    blockedCandidateFrames += 1;
    const targetScore = Number(candidate.score);
    const selectedScore = Number(row.detail?.profit?.best?.score);
    if (Number.isFinite(targetScore) && Number.isFinite(selectedScore) && targetScore > selectedScore) {
      recoveredHigherScoreFrames += 1;
      if (recoverySamples.length < 5) recoverySamples.push({
        line: row.line,
        at: row.entry.at || '',
        targetScore: Math.round(targetScore),
        selectedScore: Math.round(selectedScore),
        selectedTargetId: String(row.detail?.profit?.best?.id ?? row.detail?.action?.target?.userId ?? '')
      });
    }
  }
  const result = {
    mode: 'easy-kill-continuity',
    targetId,
    lines: `${options.startLine}-${options.endLine}`,
    baseline: {
      settlementTargetId: String(baselineSettlement?.targetId || ''),
      settlementPhase: String(baselineSettlement?.phase || ''),
      settlementReason: String(baselineSettlement?.reason || ''),
      metricsTargetId: String(settlementMetrics?.targetId || ''),
      engagementStartedEvents,
      falseReleaseEvents,
      blockedCandidateFrames
    },
    corrected: {
      settlementTargetId: String(correctedSettlement?.state?.targetId || ''),
      settlementPhase: String(correctedSettlement?.state?.phase || ''),
      settlementReason: String(correctedSettlement?.state?.reason || ''),
      settlementConfirmed: Number(correctedSettlement?.state?.confirmedAt || 0) > 0,
      engagementFinishReason: correctedReleaseReason,
      recoveredHigherScoreFrames
    },
    recoverySamples
  };
  result.accepted = rows.length > 0
    && result.baseline.settlementTargetId
    && result.baseline.settlementTargetId !== result.baseline.metricsTargetId
    && result.baseline.metricsTargetId === targetId
    && result.baseline.falseReleaseEvents > 0
    && result.baseline.blockedCandidateFrames > 0
    && (!result.corrected.settlementTargetId || result.corrected.settlementTargetId === targetId)
    && (!result.corrected.settlementPhase || result.corrected.settlementPhase === 'unconfirmed-tail')
    && result.corrected.settlementConfirmed === false
    && result.corrected.engagementFinishReason === ''
    && result.corrected.recoveredHigherScoreFrames > 0;
  return result;
}

function replayEntryRunId(entry) {
  return String(entry?.detail?.runId || entry?.runId || '');
}

function firstFiniteNumber(values = []) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function leaveTailEventDecision(event = {}) {
  return event?.detail?.decision || event?.decision || {};
}

function leaveTailEventSelfHp(event = {}) {
  const decision = leaveTailEventDecision(event);
  const action = decision.action || decision;
  return firstFiniteNumber([
    action?.combatExit?.selfHp,
    decision?.combat?.exit?.selfHp,
    decision?.combat?.self?.hp,
    action?.self?.hp,
    decision?.input?.self?.hp,
    event?.detail?.realtime?.self?.hp
  ]);
}

function leaveTailEventTarget(event = {}) {
  const decision = leaveTailEventDecision(event);
  const action = decision.action || decision;
  return action?.target
    || decision?.target
    || decision?.combat?.target
    || decision?.combat?.exit?.target
    || null;
}

function leaveTailAttributableEvidence(event = {}) {
  const decision = leaveTailEventDecision(event);
  const action = decision.action || decision;
  const injury = action?.injury || decision?.injury || {};
  const leaveRisk = action?.leaveRisk || decision?.leaveRisk || {};
  const combatExit = action?.combatExit || decision?.combat?.exit || {};
  return Boolean(
    injury.attributable === true
      || /incoming-bullet-owner/i.test(String(injury.targetSource || combatExit.pressureTargetSource || ''))
      || leaveRisk.attributableIncoming === true
  );
}

function successfulLeaveAttempt(leave = {}) {
  const attempts = Array.isArray(leave?.attempts) ? leave.attempts : [];
  return attempts.find(attempt => attempt?.ok) || attempts[attempts.length - 1] || null;
}

function parsedArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function loggedSelectedThreat(decision = {}) {
  const movement = decision?.combat?.movement || decision?.movement || null;
  const field = parsedArray(movement?.dodge?.threatField);
  if (!field.length) return null;
  const dx = Number(movement?.dx || 0);
  const dy = Number(movement?.dy || 0);
  return field.find(item => Number(item?.dx) === dx && Number(item?.dy) === dy) || field[0] || null;
}

function nearbyContainsTarget(decision = {}, target = null) {
  const targetName = String(target?.name || '').trim();
  if (!targetName) return true;
  return (decision?.input?.nearby?.p || []).some(row => Array.isArray(row) && String(row[0] || '').trim() === targetName);
}

function projectedTailLoss(historicalTailLoss, historicalConfirmMs, projectedConfirmMs, damagePerHit = 3) {
  if (!(historicalTailLoss > 0) || !(historicalConfirmMs > 0) || !(projectedConfirmMs > 0)) return 0;
  const continuousDamage = historicalTailLoss * projectedConfirmMs / historicalConfirmMs;
  return Math.max(damagePerHit, Math.ceil((continuousDamage - 1e-9) / damagePerHit) * damagePerHit);
}

function replayLeaveTail(options) {
  const directory = path.dirname(options.file);
  const runnerFile = path.join(directory, 'runner.jsonl');
  const wsFile = path.join(directory, 'ws.jsonl');
  const decisionsFile = path.join(directory, 'decisions.jsonl');
  const cutoffMs = options.cutoffAt ? Date.parse(options.cutoffAt) : Infinity;
  if (options.cutoffAt && !Number.isFinite(cutoffMs)) throw new Error(`invalid --cutoff-at: ${options.cutoffAt}`);

  const events = new Map();
  for (const row of selectedEntries(options)) {
    const event = row.detail || {};
    if (row.entry.type !== 'safety-event' || event.shouldLeave !== true) continue;
    const eventAtMs = Date.parse(event.at || row.entry.at || '');
    if (!Number.isFinite(eventAtMs) || eventAtMs > cutoffMs) continue;
    const runId = String(event.runId || row.entry.runId || '');
    const eventHp = leaveTailEventSelfHp(event);
    if (!runId || eventHp === null) continue;
    const target = leaveTailEventTarget(event);
    events.set(runId, {
      runId,
      line: row.line,
      event,
      eventAt: new Date(eventAtMs).toISOString(),
      eventAtMs,
      eventLogAt: row.entry.at || '',
      reason: String(event.reason || ''),
      eventHp,
      target,
      attributableEvidence: leaveTailAttributableEvidence(event),
      confirmAt: '',
      confirmAtMs: null,
      finalAt: '',
      leaveHp: null,
      leaveLife: '',
      leaveDurationMs: null,
      lastWsHp: null,
      lastWsAt: '',
      decisions: []
    });
  }

  if (fs.existsSync(runnerFile) && events.size) {
    forEachJsonlEntry(runnerFile, entry => {
      const item = events.get(replayEntryRunId(entry));
      if (!item) return;
      if (entry.type === 'canary-leave-confirmed-control-close') {
        const atMs = Date.parse(entry.at || '');
        if (Number.isFinite(atMs)) {
          item.confirmAt = entry.at;
          item.confirmAtMs = atMs;
        }
        return;
      }
      if (entry.type !== 'canary-finish' && entry.type !== 'canary-failed') return;
      const attempt = successfulLeaveAttempt(entry?.detail?.leave);
      const leaveHp = firstFiniteNumber([attempt?.response?.hp]);
      if (!attempt || leaveHp === null) return;
      item.finalAt = entry.at || '';
      item.leaveHp = leaveHp;
      item.leaveLife = String(attempt?.response?.life || '');
      item.leaveDurationMs = firstFiniteNumber([attempt?.durationMs]);
      if (!Number.isFinite(item.confirmAtMs)) {
        const finalAtMs = Date.parse(entry.at || '');
        if (Number.isFinite(finalAtMs)) {
          item.confirmAt = entry.at;
          item.confirmAtMs = finalAtMs;
        }
      }
    });
  }

  const tailCases = Array.from(events.values())
    .filter(item => item.leaveHp !== null && item.eventHp > item.leaveHp)
    .sort((a, b) => a.eventAtMs - b.eventAtMs);
  const tailByRunId = new Map(tailCases.map(item => [item.runId, item]));

  if (fs.existsSync(wsFile) && tailByRunId.size) {
    forEachJsonlEntry(wsFile, entry => {
      const item = tailByRunId.get(replayEntryRunId(entry));
      if (!item || entry.type !== 'message') return;
      const atMs = Date.parse(entry.at || '');
      const hp = firstFiniteNumber([entry?.detail?.decodedSummary?.self?.hp]);
      if (!Number.isFinite(atMs) || hp === null || atMs > Number(item.confirmAtMs || Infinity)) return;
      item.lastWsHp = hp;
      item.lastWsAt = entry.at || '';
    });
  }

  if (fs.existsSync(decisionsFile) && tailByRunId.size) {
    forEachJsonlEntry(decisionsFile, (entry, line) => {
      const item = tailByRunId.get(replayEntryRunId(entry));
      if (!item) return;
      const atMs = Date.parse(entry.at || '');
      if (!Number.isFinite(atMs) || atMs < item.eventAtMs - 5000 || atMs > item.eventAtMs + 300) return;
      const decision = entry.detail || {};
      const selfHp = firstFiniteNumber([decision?.input?.self?.hp, decision?.action?.self?.hp, decision?.combat?.self?.hp]);
      if (selfHp === null) return;
      item.decisions.push({ line, at: entry.at || '', atMs, decision, selfHp });
    });
  }

  const evaluated = tailCases.map(item => {
    item.decisions.sort((a, b) => a.atMs - b.atMs || a.line - b.line);
    const hpSamples = [];
    let replayTrigger = null;
    let previousAction = null;
    for (const row of item.decisions) {
      hpSamples.push({ at: row.atMs, hp: row.selfHp });
      while (hpSamples.length && row.atMs - hpSamples[0].at > 1250) hpSamples.shift();
      const peak = hpSamples.slice().sort((a, b) => b.hp - a.hp || a.at - b.at)[0] || null;
      const recentDamage = peak ? Math.max(0, peak.hp - row.selfHp) : 0;
      const recentDamageWindowMs = recentDamage > 0 && peak ? Math.max(0, row.atMs - peak.at) : 0;
      const threat = loggedSelectedThreat(row.decision);
      const commandDelayTicks = firstFiniteNumber([
        row.decision?.combat?.timing?.rollingP90Ticks,
        row.decision?.combat?.timing?.executionDelayTicks,
        options.executionDelayTicks
      ]) ?? 5;
      const prediction = evaluatePredictedLeaveHpCore({
        selfHp: row.selfHp,
        directHits: threat?.directHits,
        unavoidableHits: threat?.unavoidableHits,
        recentDamage,
        recentDamageWindowMs,
        commandDelayMs: Math.max(0, commandDelayTicks * 50)
      });
      const action = row.decision.action || row.decision;
      const combatTarget = row.decision?.combat?.target || null;
      const combatEstablished = Boolean(combatTarget && row.decision?.combat?.actionEligible !== false);
      const recovering = String(previousAction?.band || '') === 'recover'
        || /recover|wait-for-full-stamina-and-hp/i.test(String(previousAction?.reason || ''));
      const bulletCount = Math.max(0, Number(row.decision?.input?.realtime?.bulletCount || 0));
      const attributableIncoming = Boolean(
        bulletCount > 0
          && item.attributableEvidence
          && nearbyContainsTarget(row.decision, item.target)
      );
      const rapidDamage = recentDamage >= 6
        && recentDamageWindowMs > 0
        && recentDamageWindowMs <= 1000
        && attributableIncoming;
      let reason = '';
      let source = '';
      if (prediction?.shouldLeave) {
        reason = prediction.reason;
        source = 'predicted-leave-hp';
      } else if ((recovering || !combatEstablished) && attributableIncoming && bulletCount >= 2) {
        reason = 'continuous-incoming-bullets-leave';
        source = 'event-confirmed-bullet-owner';
      } else if ((recovering || !combatEstablished) && rapidDamage) {
        reason = 'rapid-damage-early-leave';
        source = 'event-confirmed-bullet-owner';
      } else if ((recovering || !combatEstablished) && attributableIncoming) {
        reason = 'incoming-bullet-early-leave';
        source = 'event-confirmed-bullet-owner';
      } else if (action.shouldLeave === true) {
        reason = String(action.reason || row.decision.reason || item.reason);
        source = 'logged-safety-gate';
      }
      if (!replayTrigger && reason) {
        const effectiveAtMs = action.shouldLeave === true
          ? Math.min(row.atMs, item.eventAtMs)
          : row.atMs;
        replayTrigger = {
          at: new Date(effectiveAtMs).toISOString(),
          atMs: effectiveAtMs,
          line: row.line,
          hp: row.selfHp,
          reason,
          source,
          bulletCount,
          combatEstablished,
          recovering,
          recentDamage,
          recentDamageWindowMs,
          prediction
        };
      }
      previousAction = action;
    }
    if (!replayTrigger) {
      replayTrigger = {
        at: item.eventAt,
        atMs: item.eventAtMs,
        line: item.line,
        hp: item.eventHp,
        reason: item.reason,
        source: 'logged-safety-event',
        bulletCount: null,
        combatEstablished: null,
        recovering: null,
        recentDamage: null,
        recentDamageWindowMs: null,
        prediction: null
      };
    }
    const historicalConfirmMs = Number.isFinite(item.confirmAtMs)
      ? Math.max(1, item.confirmAtMs - item.eventAtMs)
      : Math.max(1, Number(item.leaveDurationMs || 1));
    const tailLoss = Math.max(0, item.eventHp - item.leaveHp);
    const p50Loss = projectedTailLoss(tailLoss, historicalConfirmMs, Math.max(1, Number(options.projectedLeaveP50Ms || 400)));
    const p95Loss = projectedTailLoss(tailLoss, historicalConfirmMs, Math.max(1, Number(options.projectedLeaveP95Ms || 700)));
    const targetId = String(item.target?.userId ?? item.target?.user_id ?? item.target?.entityId ?? item.target?.entity_id ?? '');
    return {
      runId: item.runId,
      line: item.line,
      targetId: targetId || null,
      targetName: String(item.target?.name || ''),
      loggedReason: item.reason,
      eventAt: item.eventAt,
      eventHp: item.eventHp,
      lastRealtimeHp: item.lastWsHp,
      lastRealtimeAt: item.lastWsAt,
      leaveHp: item.leaveHp,
      leaveLife: item.leaveLife,
      tailLoss,
      historicalConfirmMs,
      replayTriggerAt: replayTrigger.at,
      replayTriggerHp: replayTrigger.hp,
      replayReason: replayTrigger.reason,
      replaySource: replayTrigger.source,
      detectionLeadMs: Math.max(0, item.eventAtMs - replayTrigger.atMs),
      projectedP50Loss: p50Loss,
      projectedP50Hp: Math.max(0, replayTrigger.hp - p50Loss),
      projectedP95Loss: p95Loss,
      projectedP95Hp: Math.max(0, replayTrigger.hp - p95Loss),
      deathCase: item.leaveLife.toLowerCase() === 'dead' || item.leaveHp <= 0,
      replay: replayTrigger
    };
  });

  const expectedCaseCount = Math.max(0, Number(options.expectCases || 0));
  const expectedTailLoss = Number.isFinite(Number(options.expectTailLoss)) ? Number(options.expectTailLoss) : null;
  const totalTailLoss = evaluated.reduce((sum, item) => sum + item.tailLoss, 0);
  const deathCases = evaluated.filter(item => item.deathCase);
  const result = {
    mode: 'leave-tail',
    file: options.file,
    lines: `${options.startLine}-${options.endLine}`,
    cutoffAt: options.cutoffAt || '',
    evaluatedCases: evaluated.length,
    totalTailLoss,
    expectedCaseCount: expectedCaseCount || null,
    expectedTailLoss,
    replayedNoLaterCases: evaluated.filter(item => item.detectionLeadMs >= 0).length,
    replayedEarlierCases: evaluated.filter(item => item.detectionLeadMs > 0).length,
    predictedHpCases: evaluated.filter(item => item.replaySource === 'predicted-leave-hp').length,
    earlyThreatCases: evaluated.filter(item => item.replaySource === 'event-confirmed-bullet-owner').length,
    deathCases: deathCases.length,
    deathCasesSurvivingProjectedP95: deathCases.filter(item => item.projectedP95Hp > 0).length,
    maximumDetectionLeadMs: Math.max(0, ...evaluated.map(item => item.detectionLeadMs)),
    projectedLeaveP50Ms: Math.max(1, Number(options.projectedLeaveP50Ms || 400)),
    projectedLeaveP95Ms: Math.max(1, Number(options.projectedLeaveP95Ms || 700)),
    trajectoryBoundEvaluated: false,
    trajectoryBoundNote: 'Historical WS payload tracing was disabled; post-trigger per-bullet unavoidable-loss bounds require new leave-pending telemetry.',
    cases: evaluated
  };
  result.accepted = result.evaluatedCases > 0
    && (!expectedCaseCount || result.evaluatedCases === expectedCaseCount)
    && (expectedTailLoss === null || result.totalTailLoss === expectedTailLoss)
    && result.replayedNoLaterCases === result.evaluatedCases
    && result.deathCasesSurvivingProjectedP95 === result.deathCases;
  return result;
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
    const loggedReason = String(action.reason || decision.reason || '');
    const residualThreatContinuity = recentCombatResidualThreatContinuityCore({
      nowMs: atMs,
      ownerIds: action.leaveRisk?.ownerIds || [],
      recentCombatTargetId: metrics.targetId,
      recentCombatMetrics: metrics,
      postKillSettlement: decision.input?.postKillSettlement || action.postKillSettlement || null
    });
    const exchangeAdvisoryOnly = Boolean(
      loggedReason.startsWith('combat-exchange-stop-loss-')
        && !baselinePolicyExit
    );
    evaluated.push({
      line: row.line,
      at: row.entry.at || '',
      targetId: targetId || null,
      targetName: String(target?.name || metrics.targetName || ''),
      metricsTargetId: metricsTargetId || null,
      metricsTargetName: String(metrics.targetName || ''),
      metricsTargetMatches,
      loggedReason,
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
      residualThreatContinuity,
      exchangeAdvisoryOnly,
      baselinePolicyExit,
      disadvantageObservation: confirmedEvaluation.disadvantageObservation,
      policyExit
    });
  }
  const preventedLoggedExits = evaluated.filter(item => item.loggedExit && !item.policyExit);
  const preservedRequiredExits = evaluated.filter(item => item.loggedExit && item.policyExit);
  const newlyRequiredExits = evaluated.filter(item => !item.loggedExit && item.policyExit);
  const firstNewlyRequiredExit = newlyRequiredExits[0] || null;
  const favorablePreventedExits = preventedLoggedExits.filter(item => item.favorable);
  const confirmationPreventedExits = preventedLoggedExits.filter(item => item.disadvantageObservation?.ready === false);
  const identityMismatchPreventedExits = preventedLoggedExits.filter(item => item.unattributedPressureTarget);
  const threatExemptPreventedExits = preventedLoggedExits.filter(item => item.targetThreatExempt);
  const residualThreatPreventedExits = preventedLoggedExits.filter(item => item.residualThreatContinuity?.active);
  const exchangeAdvisoryPreventedExits = preventedLoggedExits.filter(item => item.exchangeAdvisoryOnly);
  const justifiedPreventedExits = preventedLoggedExits.filter(item => item.favorable
    || item.priorBattleFavorable
    || item.disadvantageObservation?.ready === false
    || item.unattributedPressureTarget
    || item.targetThreatExempt
    || item.residualThreatContinuity?.active
    || item.exchangeAdvisoryOnly);
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
    residualThreatPreventedExitFrames: residualThreatPreventedExits.length,
    exchangeAdvisoryPreventedExitFrames: exchangeAdvisoryPreventedExits.length,
    justifiedPreventedExitFrames: justifiedPreventedExits.length,
    trustedNoDamagePreventedExitFrames: trustedNoDamagePreventedExits.length,
    preservedRequiredExitFrames: preservedRequiredExits.length,
    newlyRequiredExitFrames: newlyRequiredExits.length,
    firstNewlyRequiredExit: firstNewlyRequiredExit ? {
      line: firstNewlyRequiredExit.line,
      at: firstNewlyRequiredExit.at,
      selfHp: firstNewlyRequiredExit.selfHp,
      targetHp: firstNewlyRequiredExit.targetHp,
      reason: firstNewlyRequiredExit.policyExit?.reason || ''
    } : null,
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
      && firstNewlyRequiredExit?.policyExit?.reason === 'combat-hp-disadvantage-leave'
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
      loggedRecoverySafety: action.recoverySafety || null,
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
  const loggedRecoveryRadius = Number(firstLoggedExit?.loggedRecoverySafety?.radius);
  const loggedAttackRange = Number(firstLoggedExit?.loggedRecoverySafety?.attackRange || 14500);
  const preventedInRangeExit = Boolean(
    firstLoggedExit
      && !firstReplayedExit
      && firstLoggedExit.loggedReason === 'recovery-low-hp-active-threat-leave'
      && firstLoggedExit.loggedRecoverySafety
      && Number.isFinite(Number(firstLoggedExit.loggedTargetDistance))
      && Number(firstLoggedExit.loggedTargetDistance) <= loggedAttackRange
      && (!Number.isFinite(loggedRecoveryRadius) || loggedRecoveryRadius <= loggedAttackRange)
  );
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
    preventedInRangeExit,
    loggedRecoveryRadius: Number.isFinite(loggedRecoveryRadius) ? loggedRecoveryRadius : null,
    attackRange: loggedAttackRange,
    samples: evaluated.slice(0, 12)
  };
  const acceptedEarlyProtection = result.evaluatedFrames > 0
    && result.baselineRecoveryHoldFrames > 0
    && firstReplayedExit?.replayedReason === 'recovery-low-hp-active-threat-leave'
    && Number(earlierByMs) > 0
    && Number(distanceMarginCm) > 0;
  result.accepted = acceptedEarlyProtection || preventedInRangeExit;
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

function replayPostAttackDropAttribution(options) {
  const rows = selectedEntries(options);
  const firstSeenAtByKey = new Map();
  const evaluated = [];
  let firstCorrectedCandidate = null;
  let firstLoggedCorrect = null;
  for (const row of rows) {
    const decision = row.detail || {};
    const atMs = Date.parse(row.entry.at || '');
    if (!Number.isFinite(atMs)) continue;
    const nearbyCoins = (decision.input?.nearby?.c || [])
      .filter(Array.isArray)
      .map(item => ({
        id: String(item[0] ?? ''),
        key: `id:${String(item[0] ?? '')}`,
        amount: Number(item[1] || 0),
        distance: Number(item[2] || 0)
      }))
      .filter(coin => coin.id && coin.amount > 0);
    for (const coin of nearbyCoins) {
      if (!firstSeenAtByKey.has(coin.key)) firstSeenAtByKey.set(coin.key, atMs);
    }

    const action = decision.action || {};
    const settlement = decision.input?.postAttackSettlement?.selected
      || decision.profit?.postAttackSettlement?.selected
      || null;
    const target = action.postAttackTarget || settlement;
    const targetId = String(target?.id ?? target?.targetId ?? '');
    if (!targetId || (options.targetId && targetId !== options.targetId)) continue;
    const targetDrop = Number(target?.drop ?? target?.targetDrop);
    const lastAttackAt = Number(settlement?.lastAttackAt || target?.lastAttackAt || 0);
    const baselineKeys = Array.from(firstSeenAtByKey.entries())
      .filter(([, firstSeenAt]) => lastAttackAt > 0 && firstSeenAt <= lastAttackAt)
      .map(([key]) => key);
    const replayAttack = {
      id: targetId,
      drop: targetDrop,
      coinBaselineObservedAt: lastAttackAt,
      coinBaselineKeys: baselineKeys,
      x: 0,
      y: 0
    };
    const replayCoins = nearbyCoins.map(coin => ({
      ...coin,
      x: 0,
      y: 0,
      firstSeenAt: firstSeenAtByKey.get(coin.key) || 0
    }));
    const correctedCandidates = replayCoins.filter(coin => postAttackCoinMatchesAttackCore(
      coin,
      replayAttack,
      { dropCoinRadius: 3500, dist: () => 0 }
    ));
    const corrected = correctedCandidates
      .sort((left, right) => Number(left.distance) - Number(right.distance))[0] || null;
    if (corrected && !firstCorrectedCandidate) {
      firstCorrectedCandidate = { line: row.line, at: row.entry.at || '', id: corrected.id, amount: corrected.amount };
    }

    if (action.reason !== 'post-attack-drop-coin') continue;
    const actionCoin = {
      id: String(action.target?.id ?? ''),
      key: String(action.target?.key || `id:${String(action.target?.id ?? '')}`),
      amount: Number(action.target?.amount || 0),
      source_user_id: action.target?.sourceUserId ?? null,
      firstSeenAt: firstSeenAtByKey.get(String(action.target?.key || `id:${String(action.target?.id ?? '')}`)) || 0,
      x: 0,
      y: 0
    };
    const accepted = postAttackCoinMatchesAttackCore(actionCoin, replayAttack, {
      dropCoinRadius: 3500,
      dist: () => 0
    });
    if (accepted && !firstLoggedCorrect) {
      firstLoggedCorrect = { line: row.line, at: row.entry.at || '', id: actionCoin.id, amount: actionCoin.amount };
    }
    evaluated.push({
      line: row.line,
      at: row.entry.at || '',
      targetId,
      targetDrop,
      loggedCoinId: actionCoin.id,
      loggedCoinAmount: actionCoin.amount,
      loggedAccepted: accepted,
      correctedCoinId: corrected?.id || '',
      correctedCoinAmount: corrected?.amount || null,
      baselineCoinCount: baselineKeys.length
    });
  }
  const rejected = evaluated.filter(item => !item.loggedAccepted);
  const accepted = evaluated.filter(item => item.loggedAccepted);
  const firstCorrectedAt = Date.parse(firstCorrectedCandidate?.at || '');
  const firstLoggedCorrectAt = Date.parse(firstLoggedCorrect?.at || '');
  const pickupDelaySavedMs = Number.isFinite(firstCorrectedAt) && Number.isFinite(firstLoggedCorrectAt)
    ? Math.max(0, firstLoggedCorrectAt - firstCorrectedAt)
    : null;
  const result = {
    mode: 'post-attack-drop-attribution',
    targetId: options.targetId || '',
    lines: `${options.startLine}-${options.endLine}`,
    evaluatedProtectedFrames: evaluated.length,
    rejectedFalseMatchFrames: rejected.length,
    acceptedCausalMatchFrames: accepted.length,
    rejectedCoinIds: Array.from(new Set(rejected.map(item => item.loggedCoinId))),
    firstCorrectedCandidate,
    firstLoggedCorrect,
    pickupDelaySavedMs,
    samples: evaluated.slice(0, 20)
  };
  result.accepted = result.evaluatedProtectedFrames > 0
    && result.rejectedFalseMatchFrames > 0
    && (result.acceptedCausalMatchFrames > 0 || firstCorrectedCandidate === null)
    && (pickupDelaySavedMs === null || pickupDelaySavedMs >= 0);
  return result;
}

function runReplay(options) {
  if (options.mode === 'movement-command-latency') return replayMovementCommandLatency(options);
  if (options.mode === 'opportunity') return replayOpportunity(options);
  if (options.mode === 'afk-finish-commitment') return replayAfkFinishCommitment(options);
  if (options.mode === 'afk-combat-handoff') return replayAfkCombatHandoff(options);
  if (options.mode === 'exploration') return replayExploration(options);
  if (options.mode === 'easy-kill-continuity') return replayEasyKillContinuity(options);
  if (options.mode === 'leave-tail') return replayLeaveTail(options);
  if (options.mode === 'exit') return replayExit(options);
  if (options.mode === 'movement-stall-exit') return replayMovementStallExit(options);
  if (options.mode === 'recovery-threat-exit') return replayRecoveryThreatExit(options);
  if (options.mode === 'combat-pursuit') return replayCombatPursuit(options);
  if (options.mode === 'post-attack-drop-attribution') return replayPostAttackDropAttribution(options);
  if (options.mode === 'arbitration') return replayArbitration(options);
  if (options.mode === 'combat-close-pressure') return replayCombatClosePressure(options);
  if (options.mode === 'combat-no-damage-generation-grid') return replayNoDamageGenerationGrid(options);
  if (options.mode === 'combat-response-policy-shadow') return replayResponsePolicyShadow(options);
  if (options.mode === 'combat-target-switch') return replayCombatTargetSwitch(options);
  if (options.mode === 'profit-threshold-dropout') return replayProfitThresholdDropout(options);
  if (options.mode === 'profit-dropout-preemption') return replayProfitDropoutPreemption(options);
  if (options.mode === 'combat-disengage') return replayCombatDisengage(options);
  if (options.mode === 'combat-economic-stop-loss') return replayCombatEconomicStopLoss(options);
  if (options.mode === 'combat-shot-coverage') return replayCombatShotCoverage(options);
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
  replayCombatClosePressure,
  replayNoDamageGenerationGrid,
  replayResponsePolicyShadow,
  replayCombatTargetSwitch,
  replayProfitThresholdDropout,
  replayProfitDropoutPreemption,
  replayCombatDisengage,
  replayCombatEconomicStopLoss,
  replayCombatShotCoverage,
  replayCombatPursuit,
  replayPostAttackDropAttribution,
  replayAfkFinishCommitment,
  replayAfkCombatHandoff,
  replayEasyKillContinuity,
  replayLeaveTail,
  replayMovementCommandLatency,
  replayMovementStallExit,
  replayRecoveryThreatExit,
  runReplay
};
