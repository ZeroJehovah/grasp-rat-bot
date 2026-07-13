#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { estimateAim } = require('../src/node/browserless/combat-adapter');
const { evaluateCombatHpExitCore } = require('../src/strategy/combat-exit');

function parseArgs(argv) {
  const options = { file: '', startLine: 1, endLine: Infinity, targetId: '', mode: 'combat', hitRadius: 90, controlIntervalMs: 160 };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--file') options.file = argv[++index] || '';
    else if (arg === '--start-line') options.startLine = Number(argv[++index] || 1);
    else if (arg === '--end-line') options.endLine = Number(argv[++index] || Infinity);
    else if (arg === '--target-id') options.targetId = String(argv[++index] || '');
    else if (arg === '--mode') options.mode = String(argv[++index] || 'combat');
    else if (arg === '--hit-radius') options.hitRadius = Number(argv[++index] || 90);
    else if (arg === '--control-interval-ms') options.controlIntervalMs = Number(argv[++index] || 160);
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!options.file) throw new Error('--file is required');
  return options;
}

function selectedEntries(options) {
  return fs.readFileSync(options.file, 'utf8').split('\n').flatMap((raw, index) => {
    const line = index + 1;
    if (!raw || line < options.startLine || line > options.endLine) return [];
    const entry = JSON.parse(raw);
    return [{ line, entry, detail: entry.detail || {} }];
  });
}

function aimMiss(self, target, aim) {
  if (!self || !target || !aim) return Infinity;
  const ticks = Math.hypot(Number(aim.x) - Number(self.x), Number(aim.y) - Number(self.y)) / 500 + 2;
  const futureX = Number(target.x) + (Number(target.vx) || 0) * ticks;
  const futureY = Number(target.y) + (Number(target.vy) || 0) * ticks;
  return Math.hypot(Number(aim.x) - futureX, Number(aim.y) - futureY);
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
    const decision = row.detail?.decision || row.detail || {};
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
    const policyExit = evaluateCombatHpExitCore({
      selfHp,
      targetHp: Number.isFinite(targetHp) ? targetHp : null
    });
    const loggedExit = action.shouldLeave === true || combat.exit?.shouldLeave === true;
    const selfDamage = Number(metrics.selfDamage);
    const targetDamage = Number(metrics.targetDamage);
    const favorable = Number.isFinite(selfDamage)
      && Number.isFinite(targetDamage)
      && targetDamage > selfDamage
      && (!Number.isFinite(targetHp) || selfHp > targetHp);
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
      policyExit
    });
  }
  const preventedLoggedExits = evaluated.filter(item => item.loggedExit && !item.policyExit);
  const preservedRequiredExits = evaluated.filter(item => item.loggedExit && item.policyExit);
  const newlyRequiredExits = evaluated.filter(item => !item.loggedExit && item.policyExit);
  const favorablePreventedExits = preventedLoggedExits.filter(item => item.favorable);
  const result = {
    mode: 'exit',
    targetId: options.targetId || '',
    lines: `${options.startLine}-${options.endLine}`,
    evaluatedFrames: evaluated.length,
    loggedExitFrames: evaluated.filter(item => item.loggedExit).length,
    policyExitFrames: evaluated.filter(item => item.policyExit).length,
    preventedLoggedExitFrames: preventedLoggedExits.length,
    favorablePreventedExitFrames: favorablePreventedExits.length,
    preservedRequiredExitFrames: preservedRequiredExits.length,
    newlyRequiredExitFrames: newlyRequiredExits.length,
    samples: evaluated.slice(0, 10)
  };
  result.accepted = result.evaluatedFrames > 0
    && result.preventedLoggedExitFrames > 0
    && result.favorablePreventedExitFrames === result.preventedLoggedExitFrames
    && result.newlyRequiredExitFrames === 0;
  return result;
}

const options = parseArgs(process.argv.slice(2));
const result = options.mode === 'opportunity'
  ? replayOpportunity(options)
  : (options.mode === 'exit' ? replayExit(options) : replayCombat(options));
console.log(JSON.stringify(result, null, 2));
if (!result.accepted && !result.improved?.accepted) process.exitCode = 1;
