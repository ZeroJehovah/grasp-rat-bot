#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const zlib = require('zlib');
const {
  createBattleExitTail,
  observeBattleExitTail,
  summarizeBattleExitTail
} = require('../src/node/browserless/combat-battle-log');

const DEFAULT_DAY_DIR = '/var/log/grasp-rat-browserless/2026-07-30';
const P1_INDEX_LINES = [16, 25, 119, 155, 176];
const P2_INDEX_LINES = [21, 31, 41, 42, 53, 55, 69, 82, 84, 97, 113, 115, 122, 141, 147, 158, 171, 174];
const P3_REPLAY_LINES = [86, 170];

function numberOrNull(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseArgs(argv) {
  const result = { dayDir: DEFAULT_DAY_DIR };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--day-dir') result.dayDir = path.resolve(argv[++index]);
  }
  return result;
}

function readIndex(dayDir) {
  const file = path.join(dayDir, 'battles', 'index.jsonl');
  return fs.readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line, index) => ({ line: index + 1, ...JSON.parse(line) }));
}

async function readJsonLines(file, onRow, input = fs.createReadStream(file)) {
  const reader = readline.createInterface({ input, crlfDelay: Infinity });
  let lineNumber = 0;
  for await (const line of reader) {
    lineNumber += 1;
    if (!line) continue;
    onRow(JSON.parse(line), lineNumber);
  }
}

async function inspectBattle(dayDir, index) {
  const file = path.join(dayDir, 'battles', index.file);
  const exitTail = createBattleExitTail();
  let firstMetrics = null;
  let lastMetrics = null;
  let firstDetail = null;
  let lastDetail = null;
  let firstAccepted = 0;
  let firstConfirmedHits = 0;
  let intentFrames = 0;
  let legacyCoercionCadenceRaisedFrames = 0;
  let strictCadenceRaisedFrames = 0;
  let oldNoProgressMax = 0;
  let correctedNoProgressMax = 0;
  let oldSharedBudgetMax = 0;
  let correctedSharedBudgetMax = 0;
  let stopAtMs = null;
  let stopObservedAtMs = null;
  let stopReason = '';
  const input = fs.createReadStream(file).pipe(zlib.createGunzip());
  await readJsonLines(file, row => {
    const atMs = Date.parse(row.at);
    const detail = row.detail || {};
    if (detail.metrics && typeof detail.metrics === 'object') {
      if (!firstMetrics) {
        firstMetrics = detail.metrics;
        firstDetail = detail;
        firstAccepted = Math.max(0, Number(firstMetrics.acceptedShots || 0));
        firstConfirmedHits = Math.max(0, Number(firstMetrics.confirmedHits || 0));
      }
      lastMetrics = detail.metrics;
      lastDetail = detail;
      if (detail.shooting?.wouldShoot === true) intentFrames += 1;
      const baseCadence = numberOrNull(detail.shooting?.cadenceMs);
      const effectiveCadence = numberOrNull(detail.shooting?.effectiveCadenceMs);
      if (Number.isFinite(Number(detail.shooting?.cadenceMs))
        && Number.isFinite(Number(detail.shooting?.effectiveCadenceMs))
        && Number(detail.shooting.effectiveCadenceMs) > Number(detail.shooting.cadenceMs)) {
        legacyCoercionCadenceRaisedFrames += 1;
      }
      if (baseCadence !== null && effectiveCadence !== null && effectiveCadence > baseCadence) {
        strictCadenceRaisedFrames += 1;
      }
      const noProgress = Math.max(0, Number(detail.shooting?.noProgressAcceptedShots || 0));
      const sharedBudget = Math.max(0, Number(detail.shooting?.sharedBudgetUsed || 0));
      oldNoProgressMax = Math.max(oldNoProgressMax, noProgress);
      correctedNoProgressMax = Math.max(correctedNoProgressMax, Math.max(0, noProgress - firstAccepted));
      oldSharedBudgetMax = Math.max(oldSharedBudgetMax, sharedBudget);
      correctedSharedBudgetMax = Math.max(correctedSharedBudgetMax, Math.max(0, sharedBudget - firstAccepted));
      if (numberOrNull(detail.target?.hp) !== null && Number(detail.target.hp) <= 0 && stopAtMs === null) {
        stopAtMs = atMs;
        stopObservedAtMs = atMs;
        stopReason = 'target-hp-zero';
      }
    }
    observeBattleExitTail(exitTail, row.type, detail, atMs);
    if (row.type === 'safety-trigger' && stopAtMs === null) {
      stopAtMs = atMs;
      stopObservedAtMs = atMs;
      stopReason = String(detail.reason || 'safety-trigger');
    }
  }, input);

  const requested = Math.max(0, Number(index.segmentRequestedShots ?? lastMetrics?.requestedShots ?? 0));
  const oldAccepted = Math.max(0, Number(index.segmentAcceptedShots ?? lastMetrics?.acceptedShots ?? 0));
  const oldHits = Math.max(0, Number(index.segmentConfirmedHits ?? lastMetrics?.confirmedHits ?? 0));
  const correctedAccepted = Math.min(requested, Math.max(0, Number(lastMetrics?.acceptedShots || 0) - firstAccepted));
  const correctedHits = Math.min(
    correctedAccepted,
    Math.max(0, Number(lastMetrics?.confirmedHits || 0) - firstConfirmedHits)
  );
  return {
    index,
    file,
    firstMetrics,
    lastMetrics,
    firstDetail,
    lastDetail,
    firstAccepted,
    firstConfirmedHits,
    requested,
    oldAccepted,
    oldHits,
    correctedAccepted,
    correctedHits,
    correctedCoverageAccepted: Math.max(0, Number(index.segmentTrajectoryCoverageAppliedAcceptedShots || 0)),
    correctedCoverageHits: Math.max(0, Number(index.segmentTrajectoryCoverageAppliedConfirmedHits || 0)),
    intentFrames,
    legacyCoercionCadenceRaisedFrames,
    strictCadenceRaisedFrames,
    oldNoProgressMax,
    correctedNoProgressMax,
    oldSharedBudgetMax,
    correctedSharedBudgetMax,
    stopAtMs,
    stopObservedAtMs,
    stopReason,
    replayedExitTail: summarizeBattleExitTail(exitTail),
    wireRequests: [],
    matchedAcks: []
  };
}

async function correctSafetyStopTimes(dayDir, battles) {
  await readJsonLines(path.join(dayDir, 'exits.jsonl'), row => {
    if (row.type !== 'safety-event') return;
    const runId = String(row.detail?.runId || '');
    const observedAtMs = Date.parse(String(row.detail?.at || ''));
    const loggedAtMs = Date.parse(String(row.at || ''));
    if (!runId || !Number.isFinite(observedAtMs) || !Number.isFinite(loggedAtMs)) return;
    const battle = battles.find(item => String(item.index.runId || '') === runId
      && item.stopObservedAtMs === observedAtMs
      && item.stopReason === String(row.detail?.reason || ''));
    if (!battle) return;
    battle.stopAtMs = loggedAtMs;
  });
}

function targetIdFromAction(action = {}) {
  return action.target?.userId
    ?? action.target?.user_id
    ?? action.shoot?.command?.target?.userId
    ?? action.shoot?.command?.target?.user_id
    ?? null;
}

function findBattleAt(battles, atMs, targetId = null) {
  return battles.find(battle => atMs >= Number(battle.index.segmentStartedAt)
    && atMs <= Number(battle.index.segmentEndedAt)
    && (targetId === null || targetId === undefined || String(battle.index.targetId) === String(targetId))) || null;
}

async function readWireRequests(dayDir, battles) {
  const requests = [];
  await readJsonLines(path.join(dayDir, 'runner.jsonl'), row => {
    if (row.type !== 'movement-command') return;
    const action = row.detail?.action || {};
    const shoot = action.shoot || null;
    const command = shoot?.command || null;
    if (!shoot || shoot.skipped || !command || command.type !== 'shoot') return;
    const atMs = Number(command.sentAtMs || Date.parse(row.at));
    const targetId = targetIdFromAction(action);
    const battle = findBattleAt(battles, atMs, targetId);
    const request = {
      atMs,
      runId: String(row.detail?.runId || ''),
      targetId: targetId === null || targetId === undefined ? '' : String(targetId),
      targetX: numberOrNull(command.targetX),
      targetY: numberOrNull(command.targetY),
      battleLine: battle?.index.line ?? null,
      matched: false
    };
    requests.push(request);
    if (battle) battle.wireRequests.push(request);
  });
  return requests;
}

async function readAndMatchAcks(dayDir, requests, battles) {
  const byRun = new Map();
  for (const request of requests) {
    if (!byRun.has(request.runId)) byRun.set(request.runId, []);
    byRun.get(request.runId).push(request);
  }
  for (const rows of byRun.values()) rows.sort((a, b) => a.atMs - b.atMs);
  let ackCount = 0;
  let matchedAckCount = 0;
  let orphanAckCount = 0;
  await readJsonLines(path.join(dayDir, 'ws.jsonl'), row => {
    const ack = row.detail?.decodedSummary?.ack;
    if (row.detail?.decodedType !== 'shoot_ok' || !ack) return;
    ackCount += 1;
    const atMs = Date.parse(row.at);
    const runId = String(row.detail?.runId || '');
    const targetX = numberOrNull(ack.target_x);
    const targetY = numberOrNull(ack.target_y);
    const candidates = (byRun.get(runId) || [])
      .filter(request => !request.matched && request.atMs <= atMs)
      .map(request => ({
        request,
        distance: targetX === null || targetY === null || request.targetX === null || request.targetY === null
          ? 0
          : Math.hypot(request.targetX - targetX, request.targetY - targetY)
      }))
      .filter(candidate => candidate.distance <= 5)
      .sort((a, b) => a.distance - b.distance || a.request.atMs - b.request.atMs);
    const matched = candidates[0]?.request || null;
    if (!matched) {
      orphanAckCount += 1;
      return;
    }
    matched.matched = true;
    matchedAckCount += 1;
    const battle = battles.find(item => item.index.line === matched.battleLine);
    if (battle) battle.matchedAcks.push({ atMs, bulletId: ack.bullet_id, requestAtMs: matched.atMs });
  });
  return { ackCount, matchedAckCount, orphanAckCount };
}

function sum(rows, field) {
  return rows.reduce((total, row) => total + Number(row[field] || 0), 0);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const indexes = readIndex(options.dayDir);
  const battles = [];
  for (const index of indexes) battles.push(await inspectBattle(options.dayDir, index));
  await correctSafetyStopTimes(options.dayDir, battles);
  const requests = await readWireRequests(options.dayDir, battles);
  const ackAudit = await readAndMatchAcks(options.dayDir, requests, battles);
  const activeBattles = battles.filter(battle => battle.index.targetActiveObserved === true
    || battle.index.opponentFireObserved === true);
  const p1Battles = P1_INDEX_LINES.map(line => battles.find(battle => battle.index.line === line));
  const p2Battles = P2_INDEX_LINES.map(line => battles.find(battle => battle.index.line === line));
  const p3Battles = P3_REPLAY_LINES.map(line => battles.find(battle => battle.index.line === line));
  const p1 = p1Battles.map(battle => ({
    indexLine: battle.index.line,
    file: battle.index.file,
    firstAcceptedBaseline: battle.firstAccepted,
    old: { requested: battle.requested, accepted: battle.oldAccepted, hits: battle.oldHits },
    corrected: {
      requested: battle.requested,
      accepted: battle.correctedAccepted,
      hits: battle.correctedHits,
      invariantOk: battle.correctedAccepted <= battle.requested
    },
    reconstructedWireRequests: battle.wireRequests.length,
    reconstructedMatchedAcks: battle.matchedAcks.length,
    noProgressAcceptedShots: {
      oldMax: battle.oldNoProgressMax,
      correctedMax: Math.min(battle.correctedNoProgressMax, battle.requested, battle.matchedAcks.length)
    },
    sharedShotBudget: {
      oldMax: battle.oldSharedBudgetMax,
      correctedMax: Math.min(battle.correctedSharedBudgetMax, battle.requested, battle.matchedAcks.length)
    }
  }));
  const p2 = p2Battles.map(battle => ({
    indexLine: battle.index.line,
    file: battle.index.file,
    oldMinPostTriggerHp: battle.index.exitTail?.minPostTriggerHp ?? null,
    oldPostTriggerDamage: battle.index.exitTail?.postTriggerDamage ?? null,
    correctedMinPostTriggerHp: battle.replayedExitTail?.minPostTriggerHp ?? null,
    correctedPostTriggerDamage: battle.replayedExitTail?.postTriggerDamage ?? null,
    hpObservationEndedReason: battle.replayedExitTail?.hpObservationEndedReason || '',
    selfMissing: battle.replayedExitTail?.selfMissingBeforeConfirmation === true,
    deathObserved: battle.replayedExitTail?.deathObserved === true,
    invariantOk: !(battle.replayedExitTail?.selfMissingBeforeConfirmation === true
      && battle.replayedExitTail?.deathObserved !== true
      && battle.replayedExitTail?.minPostTriggerHp === 0)
  }));
  const p3 = p3Battles.map(battle => ({
    indexLine: battle.index.line,
    file: battle.index.file,
    intentFrames: battle.intentFrames,
    wireRequests: battle.wireRequests.length,
    matchedAcks: battle.matchedAcks.length,
    correctedHits: battle.correctedHits,
    firstDispatchDelayMs: battle.wireRequests.length
      ? battle.wireRequests[0].atMs - Number(battle.index.segmentStartedAt)
      : null,
    lastDispatchAtMs: battle.wireRequests.at(-1)?.atMs ?? null,
    stopAtMs: battle.stopAtMs,
    wireRequestsAfterStop: battle.stopAtMs === null
      ? 0
      : battle.wireRequests.filter(request => request.atMs > battle.stopAtMs).length,
    oldAdvisoryCadenceRaisedFrames: battle.legacyCoercionCadenceRaisedFrames,
    strictNullableCadenceRaisedFrames: battle.strictCadenceRaisedFrames,
    projectedAdvisoryCadenceRaisedFrames: 0
  }));
  const result = {
    dayDir: options.dayDir,
    battleCount: battles.length,
    activeBattleCount: activeBattles.length,
    p1: {
      samples: p1,
      allSamplesInvariantOk: p1.every(row => row.corrected.invariantOk),
      index25Cleared: p1.find(row => row.indexLine === 25)?.corrected.accepted === 0
        && p1.find(row => row.indexLine === 25)?.corrected.hits === 0,
      activeAggregate: {
        oldAccepted: sum(activeBattles, 'oldAccepted'),
        correctedAccepted: sum(activeBattles, 'correctedAccepted'),
        oldHits: sum(activeBattles, 'oldHits'),
        correctedHits: sum(activeBattles, 'correctedHits'),
        correctedCoverageAccepted: sum(activeBattles, 'correctedCoverageAccepted'),
        correctedCoverageHits: sum(activeBattles, 'correctedCoverageHits'),
        oldNoProgressMaxSum: sum(activeBattles, 'oldNoProgressMax'),
        correctedNoProgressMaxSum: sum(activeBattles, 'correctedNoProgressMax'),
        oldSharedBudgetMaxSum: sum(activeBattles, 'oldSharedBudgetMax'),
        correctedSharedBudgetMaxSum: sum(activeBattles, 'correctedSharedBudgetMax')
      }
    },
    p2: {
      samples: p2,
      invariantViolations: p2.filter(row => !row.invariantOk).length,
      correctedCount: p2.filter(row => row.oldMinPostTriggerHp === 0 && row.correctedMinPostTriggerHp !== 0).length
    },
    p3: {
      samples: p3,
      allBattles: {
        intentFrames: sum(battles, 'intentFrames'),
        reconstructedWireRequests: sum(battles.map(battle => ({ value: battle.wireRequests.length })), 'value'),
        reconstructedMatchedAcks: sum(battles.map(battle => ({ value: battle.matchedAcks.length })), 'value'),
        correctedHits: sum(activeBattles, 'correctedHits'),
        oldAdvisoryCadenceRaisedFrames: sum(battles, 'legacyCoercionCadenceRaisedFrames'),
        strictNullableCadenceRaisedFrames: sum(battles, 'strictCadenceRaisedFrames'),
        nullBaseCadenceCoercionFrames: sum(battles, 'legacyCoercionCadenceRaisedFrames')
          - sum(battles, 'strictCadenceRaisedFrames'),
        projectedAdvisoryCadenceRaisedFrames: 0,
        wireRequestsAfterStop: battles.reduce((total, battle) => total + (
          battle.stopAtMs === null ? 0 : battle.wireRequests.filter(request => request.atMs > battle.stopAtMs).length
        ), 0),
        wireRequestsAfterStopDetails: battles.flatMap(battle => (
          battle.stopAtMs === null
            ? []
            : battle.wireRequests
                .filter(request => request.atMs > battle.stopAtMs)
                .map(request => ({
                  indexLine: battle.index.line,
                  requestAtMs: request.atMs,
                  stopAtMs: battle.stopAtMs,
                  stopObservedAtMs: battle.stopObservedAtMs,
                  stopReason: battle.stopReason,
                  delayMs: request.atMs - battle.stopAtMs,
                  targetId: request.targetId
                }))
        ))
      },
      wsAckAudit: ackAudit
    }
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch(error => {
  process.stderr.write(`${error.stack || error.message || String(error)}\n`);
  process.exitCode = 1;
});
