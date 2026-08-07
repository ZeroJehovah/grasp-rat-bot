#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const zlib = require('zlib');
const {
  createBattleExitTail,
  observeBattleExitTail,
  summarizeBattleExitTail,
  createPhysicalSegmentLedger,
  observePhysicalSegmentFrame,
  physicalSegmentSummary,
  recordPhysicalExecution
} = require('../src/node/browserless/combat-battle-log');
const { scalarPolicy } = require('../src/node/browserless/combat-audit');
const {
  loadShotOwnershipInputs,
  reconcileShotOwnership
} = require('../src/node/browserless/shot-ownership-reconciler');

const DEFAULT_DAY_DIR = '/var/log/grasp-rat-browserless/2026-08-02';
const DEFAULT_LOGIN_CPU_BASELINE_REVISION = '3f743959a2de';
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
  const result = {
    dayDir: DEFAULT_DAY_DIR,
    loginCpuBaselineRevision: DEFAULT_LOGIN_CPU_BASELINE_REVISION
  };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--day-dir') result.dayDir = path.resolve(argv[++index]);
    else if (argv[index] === '--login-cpu-baseline-revision') {
      result.loginCpuBaselineRevision = String(argv[++index] || '');
    }
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
  let physicalLedger = createPhysicalSegmentLedger();
  const physicalExecutionEvents = [];
  const normalizedPolicyCounts = {};
  const exitAttemptIds = new Set();
  const input = fs.createReadStream(file).pipe(zlib.createGunzip());
  await readJsonLines(file, row => {
    const atMs = Date.parse(row.at);
    const detail = row.detail || {};
    if (row.type === 'shoot-execution') {
      physicalLedger = recordPhysicalExecution(physicalLedger, detail);
      physicalExecutionEvents.push({
        type: String(detail.type || ''),
        atMs: numberOrNull(detail.atMs) ?? atMs,
        requestId: detail.requestId ?? detail.commandId ?? null,
        requestSequence: numberOrNull(detail.requestSequence),
        sequence: numberOrNull(detail.sequence),
        engagementGeneration: String(detail.engagementGeneration || ''),
        controlGeneration: String(detail.controlGeneration || ''),
        segmentGeneration: String(detail.segmentGeneration || ''),
        targetId: detail.targetId ?? null,
        originSegmentId: detail.originSegmentId ?? null,
        originFile: detail.originFile ?? null,
        originStatus: String(detail.originStatus || ''),
        currentSegmentId: detail.currentSegmentId ?? null,
        currentSegmentFile: detail.currentSegmentFile ?? null,
        ack: detail.ack || null
      });
    } else if (row.type === 'combat-live' || row.type === 'combat-dry-run') {
      physicalLedger = observePhysicalSegmentFrame(physicalLedger, detail);
    }
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
      const policy = scalarPolicy(detail.behavior?.responsePolicy || detail.shooting?.responsePolicy, 'unknown');
      normalizedPolicyCounts[policy] = Number(normalizedPolicyCounts[policy] || 0) + 1;
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
    const exitAttemptId = String(
      detail.exitAttemptId
        ?? detail.pending?.exitAttemptId
        ?? detail.response?.exitAttemptId
        ?? ''
    );
    if (exitAttemptId) exitAttemptIds.add(exitAttemptId);
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
  const physical = physicalSegmentSummary(physicalLedger, {
    requestedShots: index.segmentRequestedShots,
    acceptedShots: index.segmentAcceptedShots,
    confirmedHits: index.segmentConfirmedHits,
    targetDamage: index.segmentTargetDamage,
    selfDamage: index.segmentSelfDamage,
    incomingHits: index.segmentIncomingHits
  });
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
    physical,
    physicalExecutionEvents,
    normalizedPolicyCounts,
    exitAttemptIds: [...exitAttemptIds],
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
  const wsFile = path.join(dayDir, 'ws.jsonl');
  if (!fs.existsSync(wsFile)) {
    return {
      ackCount: 0,
      matchedAckCount: 0,
      orphanAckCount: 0,
      source: 'unavailable',
      file: wsFile
    };
  }
  let ackCount = 0;
  let matchedAckCount = 0;
  let orphanAckCount = 0;
  await readJsonLines(wsFile, row => {
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
  return { ackCount, matchedAckCount, orphanAckCount, source: 'ws.jsonl', file: wsFile };
}

function sum(rows, field) {
  return rows.reduce((total, row) => total + Number(row[field] || 0), 0);
}

function valuesDiffer(left, right) {
  const a = numberOrNull(left);
  const b = numberOrNull(right);
  if (a === null || b === null) return a !== b;
  return Math.abs(a - b) > 0.01;
}

function physicalSummaryAudit(battles, executionOwnership) {
  const fields = [
    {
      key: 'requestedShots',
      indexField: 'segmentRequestedShots',
      source: 'physical-execution-events'
    },
    {
      key: 'acceptedShots',
      indexField: 'segmentAcceptedShots',
      source: 'physical-execution-events'
    },
    {
      key: 'targetDamage',
      indexField: 'segmentTargetDamage',
      source: 'adjacent-realtime-target-hp'
    },
    {
      key: 'selfDamage',
      indexField: 'segmentSelfDamage',
      source: 'adjacent-realtime-self-hp'
    },
    {
      key: 'incomingHits',
      indexField: 'segmentIncomingHits',
      source: 'adjacent-realtime-self-hp-events'
    }
  ];
  const differences = [];
  const correctedRows = [];
  for (const battle of battles) {
    const physicalValues = {
      ...battle.physical.values,
      requestedShots: executionOwnership.dispatchCountByBattle.get(battle)
        ?? battle.physical.values.requestedShots,
      acceptedShots: executionOwnership.acceptedCountByBattle.get(battle)
        ?? battle.physical.values.acceptedShots
    };
    const corrected = {
      indexLine: battle.index.line,
      file: battle.index.file,
      segmentId: battle.index.segmentId || `${battle.index.engagementId || ''}#${battle.index.segmentOrdinal || 1}`,
      segmentMetricSource: battle.physical.source,
      segmentMetricSourceFields: battle.physical.sourceFields,
      physical: {
        requestedShots: physicalValues.requestedShots,
        acceptedShots: physicalValues.acceptedShots,
        confirmedHits: physicalValues.confirmedHits,
        targetDamage: physicalValues.targetDamage,
        selfDamage: physicalValues.selfDamage,
        incomingHits: physicalValues.incomingHits,
        targetDamageEvents: battle.physical.raw.targetDamageEvents,
        selfDamageEvents: battle.physical.raw.selfDamageEvents
      },
      old: {},
      changes: [],
      invariant: {
        acceptedNotOverRequested: true,
        selfDamageMatchesAdjacentHp: battle.physical.invariant.selfDamageMatchesAdjacentHp,
        targetDamageMatchesAdjacentHp: battle.physical.invariant.targetDamageMatchesAdjacentHp
      }
    };
    const correctedRequested = numberOrNull(physicalValues.requestedShots);
    const correctedAccepted = numberOrNull(physicalValues.acceptedShots);
    corrected.invariant.acceptedNotOverRequested = correctedRequested === null
      || correctedAccepted === null
      || correctedAccepted <= correctedRequested;
    for (const field of fields) {
      const oldValue = numberOrNull(battle.index[field.indexField]);
      const physicalValue = numberOrNull(physicalValues[field.key]);
      corrected.old[field.key] = oldValue;
      if (!valuesDiffer(oldValue, physicalValue)) continue;
      const sourceField = String(battle.physical.sourceFields[field.key] || field.source);
      const unresolved = sourceField.startsWith('unresolved-');
      const reason = unresolved
        ? 'summary-accounting-failure-physical-evidence-unresolved'
        : `summary-accounting-failure-${sourceField}`;
      const change = {
        field: field.indexField,
        old: oldValue,
        corrected: physicalValue,
        source: sourceField,
        reason
      };
      corrected.changes.push(change);
      differences.push({
        indexLine: battle.index.line,
        file: battle.index.file,
        segmentId: corrected.segmentId,
        ...change
      });
    }
    correctedRows.push(corrected);
  }
  return {
    comparedFieldCount: battles.length * fields.length,
    differenceCount: differences.length,
    differences,
    correctedRows,
    allCorrectedInvariantsOk: correctedRows.every(row => (
      row.invariant.acceptedNotOverRequested
        && row.invariant.selfDamageMatchesAdjacentHp
        && row.invariant.targetDamageMatchesAdjacentHp
    ))
  };
}

function physicalExecutionOwnershipAudit(battles) {
  const dispatches = new Map();
  const accepted = [];
  const dispatchCountByBattle = new Map();
  const acceptedCountByBattle = new Map();
  const originMissing = [];
  const originMismatches = [];
  let dispatchCount = 0;
  let acceptedCount = 0;
  let skipCount = 0;
  for (const battle of battles) {
    for (const event of battle.physicalExecutionEvents) {
      const type = String(event.type || '');
      const requestId = event.requestId === null || event.requestId === undefined
        ? ''
        : String(event.requestId);
      if (type === 'shoot-dispatch') {
        dispatchCount += 1;
        dispatchCountByBattle.set(battle, Number(dispatchCountByBattle.get(battle) || 0) + 1);
        if (!dispatches.has(requestId)) dispatches.set(requestId, []);
        dispatches.get(requestId).push({ battle, event });
      } else if (type === 'shoot-ack-accepted') {
        acceptedCount += 1;
        accepted.push({ battle, event });
      } else if (type === 'shoot-skip') {
        skipCount += 1;
      }
      if (!event.originSegmentId || !event.originFile || !event.originStatus) {
        originMissing.push({
          indexLine: battle.index.line,
          file: battle.index.file,
          type,
          requestId
        });
      } else if (String(event.originSegmentId) !== String(battle.index.segmentId || '')) {
        originMismatches.push({
          indexLine: battle.index.line,
          file: battle.index.file,
          type,
          requestId,
          originSegmentId: event.originSegmentId,
          currentSegmentId: battle.index.segmentId || ''
        });
      }
    }
  }
  const duplicateDispatches = [...dispatches.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([requestId, rows]) => ({ requestId, count: rows.length }));
  const acceptedByRequest = new Map();
  const unmatchedAccepted = [];
  for (const item of accepted) {
    const requestId = item.event.requestId === null || item.event.requestId === undefined
      ? ''
      : String(item.event.requestId);
    if (!requestId || !dispatches.has(requestId)) {
      unmatchedAccepted.push({
        indexLine: item.battle.index.line,
        file: item.battle.index.file,
        requestId
      });
      continue;
    }
    acceptedByRequest.set(requestId, Number(acceptedByRequest.get(requestId) || 0) + 1);
    const owners = dispatches.get(requestId);
    if (owners.length === 1) {
      const ownerBattle = owners[0].battle;
      acceptedCountByBattle.set(ownerBattle, Number(acceptedCountByBattle.get(ownerBattle) || 0) + 1);
    }
  }
  const duplicateAccepted = [...acceptedByRequest.entries()]
    .filter(([, count]) => count > 1)
    .map(([requestId, count]) => ({ requestId, count }));
  const executionOwnershipFailureCount = duplicateDispatches.length
    + unmatchedAccepted.length
    + duplicateAccepted.length
    + originMismatches.length;
  const result = {
    dispatchCount,
    acceptedCount,
    skipCount,
    uniqueDispatchRequestCount: dispatches.size,
    duplicateDispatches,
    duplicateAccepted,
    unmatchedAccepted,
    originMissingCount: originMissing.length,
    originMismatches,
    executionOwnershipFailureCount,
    executionOwnershipOk: executionOwnershipFailureCount === 0,
    originEvidence: originMissing.length === 0 ? 'complete' : 'legacy-or-partial-origin-fields'
  };
  Object.defineProperties(result, {
    dispatchCountByBattle: { value: dispatchCountByBattle },
    acceptedCountByBattle: { value: acceptedCountByBattle }
  });
  return result;
}

async function reconcileBattleTerminals(dayDir, battles) {
  const outcomes = [];
  const exitsFile = path.join(dayDir, 'exits.jsonl');
  if (fs.existsSync(exitsFile)) {
    await readJsonLines(exitsFile, (row, line) => {
      if (row.type !== 'exit-recovery-outcome') return;
      const detail = row.detail || {};
      outcomes.push({
        line,
        at: String(row.at || ''),
        atMs: Date.parse(String(row.at || '')),
        exitAttemptId: String(detail.exitAttemptId || ''),
        outcome: String(detail.outcome || ''),
        authority: String(detail.authority || 'unknown'),
        sourceRunId: String(detail.sourceRunId || ''),
        currentRunId: String(detail.runId || ''),
        startedAtMs: Date.parse(String(detail.startedAt || '')),
        completedAtMs: Date.parse(String(detail.completedAt || row.at || ''))
      });
    });
  }
  const byAttempt = new Map();
  for (const outcome of outcomes) {
    if (!outcome.exitAttemptId) continue;
    if (!byAttempt.has(outcome.exitAttemptId)) byAttempt.set(outcome.exitAttemptId, []);
    byAttempt.get(outcome.exitAttemptId).push(outcome);
  }
  const rows = battles.map(battle => {
    const exact = battle.exitAttemptIds
      .flatMap(id => byAttempt.get(id) || [])
      .sort((left, right) => Number(left.completedAtMs || left.atMs || 0) - Number(right.completedAtMs || right.atMs || 0));
    let matched = exact.at(-1) || null;
    let matchSource = matched ? 'exitAttemptId' : '';
    if (!matched) {
      const triggerAtMs = numberOrNull(battle.index.exitTail?.triggerAtMs);
      const fallback = outcomes.filter(outcome => outcome.sourceRunId === String(battle.index.runId || '')
        && triggerAtMs !== null
        && Number.isFinite(outcome.startedAtMs)
        && Math.abs(outcome.startedAtMs - triggerAtMs) <= 60000);
      if (fallback.length === 1) {
        matched = fallback[0];
        matchSource = 'unique-run-time-fallback';
      }
    }
    const originalTerminalOutcome = String(battle.index.terminalOutcome || battle.replayedExitTail?.terminalOutcome || '');
    const reconciledTerminalOutcome = matched?.outcome || originalTerminalOutcome;
    const row = {
      indexLine: battle.index.line,
      segmentId: battle.index.segmentId || '',
      file: battle.index.file,
      runId: String(battle.index.runId || ''),
      exitAttemptIds: battle.exitAttemptIds,
      originalTerminalOutcome,
      reconciledTerminalOutcome,
      reconciliation: matched ? {
        matchSource,
        exitsLine: matched.line,
        exitAttemptId: matched.exitAttemptId,
        outcome: matched.outcome,
        authority: matched.authority,
        completedAt: matched.at
      } : null
    };
    battle.terminalReconciliation = row;
    return row;
  });
  return {
    outcomeCount: outcomes.length,
    exactAttemptMatchCount: rows.filter(row => row.reconciliation?.matchSource === 'exitAttemptId').length,
    fallbackMatchCount: rows.filter(row => row.reconciliation?.matchSource === 'unique-run-time-fallback').length,
    lateReconciledCount: rows.filter(row => row.originalTerminalOutcome === 'leave-unconfirmed'
      && row.originalTerminalOutcome !== row.reconciledTerminalOutcome).length,
    rows
  };
}

function normalizedCombatAuditPolicyReport(battles) {
  const rows = battles.map(battle => {
    const serialized = JSON.stringify(battle.index.combatAudit || null);
    const broken = serialized.includes('[object Object]');
    const normalized = Object.entries(battle.normalizedPolicyCounts)
      .map(([key, count]) => ({ key, count }))
      .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
    return {
      indexLine: battle.index.line,
      segmentId: battle.index.segmentId || '',
      file: battle.index.file,
      brokenHistoricalValue: broken,
      normalizedPolicies: normalized.length ? normalized : [{ key: 'unknown', count: 0 }],
      containsImplicitObjectString: normalized.some(item => item.key === '[object Object]')
    };
  });
  return {
    brokenHistoricalSegmentCount: rows.filter(row => row.brokenHistoricalValue).length,
    normalizedSegmentCount: rows.length,
    implicitObjectStringCount: rows.filter(row => row.containsImplicitObjectString).length,
    explicitUnknownSegmentCount: rows.filter(row => row.normalizedPolicies.some(item => item.key === 'unknown')).length,
    rows
  };
}

function largestDurationStage(stages = {}) {
  return Object.entries(stages || {})
    .map(([name, durationMs]) => ({ name, durationMs: numberOrNull(durationMs) }))
    .filter(item => item.durationMs !== null)
    .sort((left, right) => right.durationMs - left.durationMs || left.name.localeCompare(right.name))[0]
    || null;
}

async function loginSuccessCpuBaseline(dayDir, startRevision) {
  const successes = [];
  const budgetEvents = [];
  const runnerFile = path.join(dayDir, 'runner.jsonl');
  await readJsonLines(runnerFile, (row, line) => {
    if (row.type === 'source-ip-login-success') {
      const loginAt = String(row.detail?.loginAt || row.at || '');
      successes.push({
        line,
        at: row.at || '',
        atMs: Date.parse(row.at || ''),
        loginAt,
        loginAtMs: Date.parse(loginAt),
        runId: String(row.detail?.runId || '')
      });
      return;
    }
    if (row.type !== 'main-thread-budget-exceeded') return;
    const cpuMs = numberOrNull(row.detail?.workProfile?.cpuWorkMs ?? row.detail?.cpuDurationMs);
    budgetEvents.push({
      line,
      at: row.at || '',
      atMs: Date.parse(row.at || ''),
      runId: String(row.detail?.runId || ''),
      runtimeRevision: String(row.detail?.runtimeRevision || ''),
      task: String(row.detail?.task || ''),
      cpuMeasured: row.detail?.cpuMeasured === true,
      cpuOverBudget: row.detail?.cpuOverBudget === true,
      cpuMs,
      largestStage: largestDurationStage(row.detail?.stages)
    });
  });
  const startBudget = budgetEvents.find(item => item.runtimeRevision === String(startRevision || '')) || null;
  const startSuccess = startBudget
    ? successes.find(item => item.runId === startBudget.runId && item.line <= startBudget.line) || null
    : null;
  const relevantSuccesses = startSuccess
    ? successes.filter(item => item.line >= startSuccess.line)
    : [];
  const samples = relevantSuccesses.map(success => {
    const hardEvent = budgetEvents.find(item => item.runId === success.runId
      && Number.isFinite(success.loginAtMs)
      && Number.isFinite(item.atMs)
      && item.atMs >= success.loginAtMs
      && item.atMs - success.loginAtMs <= 500) || null;
    return {
      successLine: success.line,
      hardEventLine: hardEvent?.line ?? null,
      runId: success.runId,
      loginAt: success.loginAt,
      runtimeRevision: hardEvent?.runtimeRevision || '',
      delayFromFirstSelfMs: hardEvent && Number.isFinite(success.loginAtMs)
        ? hardEvent.atMs - success.loginAtMs
        : null,
      task: hardEvent?.task || '',
      cpuMeasured: hardEvent?.cpuMeasured === true,
      cpuOverBudget: hardEvent?.cpuOverBudget === true,
      cpuMs: hardEvent?.cpuMs ?? null,
      largestStage: hardEvent?.largestStage || null
    };
  });
  const measuredCpu = samples.map(item => item.cpuMs).filter(value => value !== null);
  const hardViolations = samples.filter(item => item.cpuMeasured && item.cpuOverBudget && Number(item.cpuMs) >= 50);
  return {
    runnerFile,
    startRevision: String(startRevision || ''),
    startSuccessLine: startSuccess?.line ?? null,
    successfulLoginCount: samples.length,
    pairedHardEventCount: samples.filter(item => item.hardEventLine !== null).length,
    hardViolationCount: hardViolations.length,
    everySuccessfulLoginViolated: samples.length > 0 && hardViolations.length === samples.length,
    minimumCpuMs: measuredCpu.length ? Math.min(...measuredCpu) : null,
    maximumCpuMs: measuredCpu.length ? Math.max(...measuredCpu) : null,
    samples
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const indexes = readIndex(options.dayDir);
  const battles = [];
  for (const index of indexes) battles.push(await inspectBattle(options.dayDir, index));
  await correctSafetyStopTimes(options.dayDir, battles);
  const requests = await readWireRequests(options.dayDir, battles);
  const ackAudit = await readAndMatchAcks(options.dayDir, requests, battles);
  const executionOwnership = physicalExecutionOwnershipAudit(battles);
  const physicalSummary = physicalSummaryAudit(battles, executionOwnership);
  const shotInputs = loadShotOwnershipInputs(options.dayDir);
  const shotOwnership = reconcileShotOwnership({
    segments: indexes,
    amendments: shotInputs.amendments,
    physicalSegments: battles.map(battle => ({
      segmentId: battle.index.segmentId,
      file: battle.index.file,
      events: battle.physicalExecutionEvents
    }))
  });
  const terminalReconciliation = await reconcileBattleTerminals(options.dayDir, battles);
  const combatAuditPolicies = normalizedCombatAuditPolicyReport(battles);
  const historicalLoginSuccessCpu = await loginSuccessCpuBaseline(
    options.dayDir,
    options.loginCpuBaselineRevision
  );
  const activeBattles = battles.filter(battle => battle.index.targetActiveObserved === true
    || battle.index.opponentFireObserved === true);
  const p1Battles = P1_INDEX_LINES
    .map(line => battles.find(battle => battle.index.line === line))
    .filter(Boolean);
  const p2Battles = P2_INDEX_LINES
    .map(line => battles.find(battle => battle.index.line === line))
    .filter(Boolean);
  const p3Battles = P3_REPLAY_LINES
    .map(line => battles.find(battle => battle.index.line === line))
    .filter(Boolean);
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
    physicalAudit: {
      executionOwnership,
      summaryAccounting: physicalSummary,
      interpretation: {
        executionOwnershipFailure: 'request/ACK/origin ownership cannot be inferred from accepted > requested alone; inspect physical event joins',
        summaryAccountingFailure: 'index segment fields differ from the corrected physical gzip ledger',
        confirmedHits: 'runtime metric retained as a diagnostic because adjacent HP changes do not uniquely identify per-shot hit count'
      }
    },
    shotOwnership: {
      conservation: shotOwnership.conservation,
      correctedRows: shotOwnership.rows,
      unresolvedEvents: shotOwnership.assignments
        .filter(item => item.status === 'unresolved')
        .map(item => ({
          amendmentLine: item.event.amendmentLine,
          type: item.type,
          requestId: item.event.requestId ?? null,
          requestSequence: item.event.requestSequence ?? null,
          targetId: item.event.targetId ?? null,
          currentSegmentId: item.event.currentSegmentId ?? null,
          reason: item.reason,
          candidates: item.candidates || []
        })),
      index156Rebuilt79Of79: (() => {
        const row = shotOwnership.rows.find(item => item.indexLine === 156);
        return row?.corrected.dispatch === 79 && row?.corrected.accepted === 79;
      })()
    },
    combatAuditPolicies,
    terminalReconciliation,
    historicalLoginSuccessCpu,
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
