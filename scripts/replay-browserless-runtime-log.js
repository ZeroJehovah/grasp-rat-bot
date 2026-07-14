#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { StringDecoder } = require('string_decoder');
const { estimateAim } = require('../src/node/browserless/combat-adapter');
const { actionPriorityBand } = require('../src/strategy/action-priority');
const {
  evaluateConfirmedCombatHpExitCore,
  evaluateCombatHpExitCore
} = require('../src/strategy/combat-exit');
const { pickSafeClosingDodgeCore } = require('../src/strategy/combat-movement');
const { updateOpponentBehaviorStateCore } = require('../src/strategy/opponent-behavior');

function parseArgs(argv) {
  const options = {
    file: '',
    startLine: 1,
    endLine: Infinity,
    targetId: '',
    mode: 'combat',
    hitRadius: 90,
    controlIntervalMs: 160,
    minImprovementPct: 0,
    expectNewExit: false,
    trustEasyKillBeforeDamage: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--file') options.file = argv[++index] || '';
    else if (arg === '--start-line') options.startLine = Number(argv[++index] || 1);
    else if (arg === '--end-line') options.endLine = Number(argv[++index] || Infinity);
    else if (arg === '--target-id') options.targetId = String(argv[++index] || '');
    else if (arg === '--mode') options.mode = String(argv[++index] || 'combat');
    else if (arg === '--hit-radius') options.hitRadius = Number(argv[++index] || 90);
    else if (arg === '--control-interval-ms') options.controlIntervalMs = Number(argv[++index] || 160);
    else if (arg === '--min-improvement-pct') options.minImprovementPct = Number(argv[++index] || 0);
    else if (arg === '--expect-new-exit') options.expectNewExit = true;
    else if (arg === '--trust-easy-kill-before-damage') options.trustEasyKillBeforeDamage = true;
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

function replayCombat(options) {
  const rows = selectedEntries(options).filter(({ detail }) => String(detail.target?.userId ?? '') === options.targetId);
  const state = { motionSamples: [] };
  let baselineHits = 0;
  let improvedHits = 0;
  let baselineMissTotal = 0;
  let improvedMissTotal = 0;
  let baselineShots = 0;
  let potentialControlShots = 0;
  let previousAt = 0;
  for (const row of rows) {
    const { detail } = row;
    const at = Date.parse(row.entry.at);
    const self = detail.self;
    const target = detail.target;
    state.motionSamples.push({ at, x: target.x, y: target.y, vx: target.vx, vy: target.vy });
    state.motionSamples = state.motionSamples.slice(-20);
    const improved = estimateAim(self, target, { combatTargetState: state });
    const baseline = detail.aim;
    const baselineMiss = aimMiss(self, target, baseline);
    const improvedMiss = aimMiss(self, target, improved);
    if (detail.shooting?.wouldShoot) {
      baselineShots += 1;
      baselineMissTotal += baselineMiss;
      improvedMissTotal += improvedMiss;
      if (baselineMiss <= options.hitRadius) baselineHits += 1;
      if (improvedMiss <= options.hitRadius) improvedHits += 1;
      const availableMs = previousAt ? Math.max(options.controlIntervalMs, at - previousAt) : options.controlIntervalMs;
      potentialControlShots += Math.max(1, Math.floor(availableMs / Math.max(options.controlIntervalMs, Number(detail.shooting.effectiveCadenceMs || options.controlIntervalMs))));
    }
    previousAt = at;
  }
  const result = {
    mode: 'combat',
    targetId: options.targetId,
    lines: `${options.startLine}-${options.endLine}`,
    frames: rows.length,
    baseline: {
      decisionBoundShots: baselineShots,
      estimatedHitFrames: baselineHits,
      meanAimMissCm: baselineShots ? Number((baselineMissTotal / baselineShots).toFixed(1)) : null
    },
    improved: {
      potentialControlShots,
      estimatedHitFrames: improvedHits,
      meanAimMissCm: baselineShots ? Number((improvedMissTotal / baselineShots).toFixed(1)) : null
    }
  };
  result.improved.accepted = rows.length > 0
    && result.improved.meanAimMissCm < result.baseline.meanAimMissCm
    && potentialControlShots > baselineShots;
  return result;
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
    const metricsTargetMatches = targetId && String(metrics.targetId ?? '') === targetId;
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
    const confirmedEvaluation = evaluateConfirmedCombatHpExitCore({
      selfHp,
      targetHp: Number.isFinite(targetHp) ? targetHp : null,
      nowMs: atMs,
      disadvantageSinceAt: combatStartedAt,
      combatStartedAt,
      sampleCount: estimatedSamples,
      confirmedSelfDamage: metrics.selfDamage
    });
    const loggedExit = action.shouldLeave === true || combat.exit?.shouldLeave === true;
    const selfDamage = Number(metrics.selfDamage);
    const targetDamage = Number(metrics.targetDamage);
    const favorable = Number.isFinite(selfDamage)
      && Number.isFinite(targetDamage)
      && targetDamage > selfDamage
      && (!Number.isFinite(targetHp) || selfHp > targetHp);
    const trustedEasyKillBeforeDamage = Boolean(
      options.trustEasyKillBeforeDamage
        && targetId
        && (!options.targetId || targetId === options.targetId)
        && (!Number.isFinite(selfDamage) || selfDamage <= 0)
    );
    const policyExit = trustedEasyKillBeforeDamage ? null : confirmedEvaluation.exit;
    evaluated.push({
      line: row.line,
      at: row.entry.at || '',
      targetId: targetId || null,
      targetName: String(target?.name || metrics.targetName || ''),
      loggedReason: String(action.reason || decision.reason || ''),
      loggedExit,
      selfHp,
      targetHp: Number.isFinite(targetHp) ? targetHp : null,
      selfDamage: Number.isFinite(selfDamage) ? selfDamage : null,
      targetDamage: Number.isFinite(targetDamage) ? targetDamage : null,
      favorable,
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
  const justifiedPreventedExits = preventedLoggedExits.filter(item => item.favorable || item.disadvantageObservation?.ready === false);
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

const options = parseArgs(process.argv.slice(2));
const result = options.mode === 'opportunity'
  ? replayOpportunity(options)
  : (options.mode === 'exit'
      ? replayExit(options)
      : (options.mode === 'arbitration'
          ? replayArbitration(options)
          : (options.mode === 'combat-policy' ? replayCombatPolicy(options) : replayCombat(options))));
console.log(JSON.stringify(result, null, 2));
if (!result.accepted && !result.improved?.accepted) process.exitCode = 1;
