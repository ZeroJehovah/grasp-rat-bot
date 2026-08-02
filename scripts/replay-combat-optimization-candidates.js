#!/usr/bin/env node
'use strict';

// Offline-only replay for the August 2 combat candidates. The script consumes
// archived battle gzip files and never connects to the runner or game API.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const {
  createCombatObservationBuffer,
  observeCombatFrameCore,
  completeCombatHpLossAttributionCore
} = require('../src/strategy/combat-hp-loss-attribution');
const { safeRetreatInterceptCandidateCore } = require('../src/strategy/combat-movement');
const {
  applyCombatTargetSwitchHysteresisCore
} = require('../src/strategy/combat-target-selection');

const DEFAULT_DAY_DIR = '/var/log/grasp-rat-browserless/2026-08-02';
const DEFAULT_HP_INDEX = 76;
const DEFAULT_FOCUS_LINES = '103-112';
const DEFAULT_RETREAT_LINES = '25,41,64,118,120,127-129';

function parseArgs(argv) {
  const options = {
    dayDir: DEFAULT_DAY_DIR,
    hpIndex: DEFAULT_HP_INDEX,
    focusLines: DEFAULT_FOCUS_LINES,
    retreatLines: DEFAULT_RETREAT_LINES
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--day-dir') options.dayDir = String(argv[++index] || DEFAULT_DAY_DIR);
    else if (arg === '--hp-index') options.hpIndex = Number(argv[++index] || DEFAULT_HP_INDEX);
    else if (arg === '--focus-lines') options.focusLines = String(argv[++index] || DEFAULT_FOCUS_LINES);
    else if (arg === '--retreat-lines') options.retreatLines = String(argv[++index] || DEFAULT_RETREAT_LINES);
    else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseLineSelection(value) {
  const selected = new Set();
  for (const part of String(value || '').split(',')) {
    const match = part.trim().match(/^(\d+)(?:-(\d+))?$/);
    if (!match) continue;
    const start = Number(match[1]);
    const end = Number(match[2] || match[1]);
    for (let line = Math.min(start, end); line <= Math.max(start, end); line += 1) selected.add(line);
  }
  return selected;
}

function readJsonGzip(file) {
  return zlib.gunzipSync(fs.readFileSync(file))
    .toString('utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

function readIndex(dayDir) {
  const file = path.join(dayDir, 'battles', 'index.jsonl');
  return fs.readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line, index) => ({ line: index + 1, ...JSON.parse(line) }));
}

function battleRows(dayDir, entry) {
  const file = path.join(dayDir, 'battles', entry.file);
  return readJsonGzip(file).map((row, index) => ({
    ...row,
    line: index + 1,
    file: entry.file,
    indexLine: entry.line
  }));
}

function combatFrames(rows) {
  return rows.filter(row => row.type === 'combat-live' || row.type === 'combat-dry-run');
}

function threatField(detail = {}) {
  return Array.isArray(detail.movement?.dodge?.threatField)
    ? detail.movement.dodge.threatField
    : [];
}

function bulletsFromThreatField(detail = {}) {
  const byId = new Map();
  for (const field of threatField(detail)) {
    for (const bullet of field?.dangerousBullets || []) {
      const id = String(bullet?.bulletId ?? bullet?.bullet_id ?? '');
      if (!id || byId.has(id)) continue;
      byId.set(id, {
        ...bullet,
        incoming: true,
        currentTick: detail.tick
      });
    }
  }
  return [...byId.values()];
}

function selectedDirection(detail = {}) {
  return detail.movement?.dodge
    ? { dx: detail.movement.dodge.dx, dy: detail.movement.dodge.dy }
    : { dx: detail.self?.vx, dy: detail.self?.vy };
}

function replayHpLoss(entry, dayDir) {
  const rows = combatFrames(battleRows(dayDir, entry));
  let state = createCombatObservationBuffer({
    bufferMs: 2000,
    maxObservations: 40,
    maxBulletsPerObservation: 12
  });
  const events = [];
  for (const row of rows) {
    const detail = row.detail || {};
    const direction = selectedDirection(detail);
    const observed = observeCombatFrameCore(state, {
      atMs: Date.parse(row.at || ''),
      tick: detail.tick,
      self: detail.self,
      bullets: bulletsFromThreatField(detail),
      selectedDirection: direction,
      visibleDirection: detail.self,
      pendingMovement: detail.movement?.commandLatency
        ? { visible: true }
        : null
    });
    state = observed.state;
    if (!observed.hpLoss) continue;
    const attribution = completeCombatHpLossAttributionCore({
      hpLoss: observed.hpLoss,
      observations: state.observations.slice()
    }, {
      selectedDirection: direction,
      threatField: threatField(detail),
      commandVisibilityDelayMs: detail.movement?.commandLatency?.velocitySendToVisibleWallMs,
      movementGeneration: detail.movement?.commandLatency?.directionGeneration
    });
    events.push({
      line: row.line,
      at: row.at,
      classification: attribution.classification,
      evidenceStatus: attribution.evidenceStatus,
      candidateCount: attribution.candidateCount,
      completeDirectionCount: attribution.completeDirectionCount,
      reason: attribution.reason
    });
  }
  const counts = {};
  for (const event of events) counts[event.classification] = Number(counts[event.classification] || 0) + 1;
  return {
    indexLine: entry.line,
    file: entry.file,
    hpLossEvents: events.length,
    classificationCounts: counts,
    events,
    accepted: entry.line === DEFAULT_HP_INDEX
      ? events[0]?.classification === 'unavoidable-all-directions'
        && events.slice(1).every(event => event.classification === 'no-physical-match'
          && event.evidenceStatus === 'insufficient')
      : true
  };
}

function targetId(detail = {}) {
  return String(detail.target?.userId ?? detail.target?.user_id ?? '');
}

function ownerIds(detail = {}) {
  const owners = new Set();
  for (const field of threatField(detail)) {
    for (const bullet of field?.dangerousBullets || []) {
      const owner = bullet?.ownerId ?? bullet?.owner_id;
      if (owner !== null && owner !== undefined && owner !== '') owners.add(String(owner));
    }
  }
  return owners;
}

function historicalPhysicalStats(entry, dayDir) {
  const rows = combatFrames(battleRows(dayDir, entry));
  let previousSelfHp = null;
  let previousTargetHp = null;
  let targetDamage = 0;
  let selfDamage = 0;
  let incomingHits = 0;
  let targetHealing = 0;
  let selfHealing = 0;
  const execution = { dispatch: 0, accepted: 0, skip: 0 };
  for (const row of battleRows(dayDir, entry)) {
    const detail = row.detail || {};
    if (row.type === 'shoot-execution') {
      if (detail.type === 'shoot-dispatch') execution.dispatch += 1;
      else if (detail.type === 'shoot-ack-accepted') execution.accepted += 1;
      else if (detail.type === 'shoot-skip') execution.skip += 1;
    }
    if (!row.type.startsWith('combat-')) continue;
    const selfHp = numberOrNull(detail.self?.hp);
    const targetHp = numberOrNull(detail.target?.hp);
    if (selfHp !== null && previousSelfHp !== null) {
      if (selfHp < previousSelfHp) {
        selfDamage += previousSelfHp - selfHp;
        incomingHits += 1;
      } else if (selfHp > previousSelfHp) selfHealing += selfHp - previousSelfHp;
    }
    if (targetHp !== null && previousTargetHp !== null) {
      if (targetHp < previousTargetHp) targetDamage += previousTargetHp - targetHp;
      else if (targetHp > previousTargetHp) targetHealing += targetHp - previousTargetHp;
    }
    if (selfHp !== null) previousSelfHp = selfHp;
    if (targetHp !== null) previousTargetHp = targetHp;
  }
  return {
    acceptedShots: execution.accepted,
    requestedShots: execution.dispatch,
    targetDamage,
    targetHealing,
    selfDamage,
    selfHealing,
    incomingHits
  };
}

function replayRetreat(entry, dayDir) {
  const rows = combatFrames(battleRows(dayDir, entry));
  let previousSelfHp = null;
  let eligibleFrames = 0;
  let approachPositiveFrames = 0;
  let collisionSafeFrames = 0;
  let collisionWorseFrames = 0;
  let observedBoundaryFrames = 0;
  let appliedFrames = 0;
  const rejectionReasons = {};
  const samples = [];
  for (const row of rows) {
    const detail = row.detail || {};
    const selfHp = numberOrNull(detail.self?.hp);
    const selfHpLoss = previousSelfHp !== null && selfHp !== null && selfHp < previousSelfHp;
    const owners = ownerIds(detail);
    const id = targetId(detail);
    const boundary = detail.combatBoundary || detail.boundary || detail.movement?.boundary || null;
    if (boundary) observedBoundaryFrames += 1;
    const candidate = safeRetreatInterceptCandidateCore(detail.self, detail.target, {
      opponentBehavior: detail.behavior,
      threatField: threatField(detail),
      recentIncomingDamage: selfHpLoss ? previousSelfHp - selfHp : 0,
      selfHpLossObserved: selfHpLoss,
      otherAttackerCount: Math.max(0, owners.size - (owners.has(id) ? 1 : 0)),
      boundary,
      selfSpeedPerTick: Math.max(1, Math.hypot(Number(detail.self?.vx || 0), Number(detail.self?.vy || 0)) || 50),
      minimumCpaCm: 200,
      enabled: false
    });
    if (candidate.eligible) {
      eligibleFrames += 1;
      if (Number(candidate.approachCm || 0) > 0) approachPositiveFrames += 1;
      const actualDirection = selectedDirection(detail);
      const actualThreat = threatField(detail).find(item => (
        Number(item?.dx) === Math.sign(Number(actualDirection.dx || 0))
          && Number(item?.dy) === Math.sign(Number(actualDirection.dy || 0))
      ));
      const actualDirect = Number(actualThreat?.directHits || 0);
      const actualUnavoidable = Number(actualThreat?.unavoidableHits || 0);
      const candidateDirect = Number(candidate.candidateThreat?.directHits || 0);
      const candidateUnavoidable = Number(candidate.candidateThreat?.unavoidableHits || 0);
      if (candidateDirect + candidateUnavoidable <= actualDirect + actualUnavoidable) collisionSafeFrames += 1;
      else collisionWorseFrames += 1;
      if (samples.length < 8) {
        samples.push({
          line: row.line,
          at: row.at,
          approachCm: candidate.approachCm,
          direction: candidate.direction,
          candidateDirectHits: candidateDirect,
          candidateUnavoidableHits: candidateUnavoidable,
          actualDirectHits: actualDirect,
          actualUnavoidableHits: actualUnavoidable,
          boundaryMarginCm: candidate.boundaryMarginCm
        });
      }
    } else {
      const reason = candidate.reason || 'unknown';
      rejectionReasons[reason] = Number(rejectionReasons[reason] || 0) + 1;
    }
    if (candidate.applied === true) appliedFrames += 1;
    if (selfHp !== null) previousSelfHp = selfHp;
  }
  const physical = historicalPhysicalStats(entry, dayDir);
  return {
    indexLine: entry.line,
    file: entry.file,
    behaviorModeFrameCounts: entry.behaviorModeFrameCounts || {},
    physical,
    candidate: {
      eligibleFrames,
      approachPositiveFrames,
      collisionSafeFrames,
      collisionWorseFrames,
      appliedFrames,
      rejectionReasons,
      boundaryEvidence: observedBoundaryFrames > 0 ? 'present' : 'unavailable-in-archived-frame',
      samples
    },
    acceptance: {
      completePhysicalCounterfactual: false,
      reason: observedBoundaryFrames > 0
        ? 'archived frames still lack a complete self-target-bullet-stamina simulation'
        : 'archived frames lack boundary input and complete self-target-bullet-stamina simulation'
    }
  };
}

function switchDiagnostic(row) {
  const detail = row.detail || {};
  return detail.combatTargetSwitch || detail.targetSwitch || null;
}

function replayFocus(entries, dayDir) {
  const rows = entries
    .flatMap(entry => combatFrames(battleRows(dayDir, entry)))
    .sort((left, right) => Date.parse(left.at || '') - Date.parse(right.at || ''));
  const historicalTransitions = [];
  let historicalTarget = targetId(rows[0]?.detail || {});
  for (const row of rows.slice(1)) {
    const id = targetId(row.detail || {});
    if (id && id !== historicalTarget) {
      historicalTransitions.push({ at: row.at, from: historicalTarget, to: id });
      historicalTarget = id;
    }
  }
  const requests = rows
    .map(row => ({ row, switch: switchDiagnostic(row) }))
    .filter(item => item.switch && item.switch.fromTargetId && item.switch.toTargetId);
  let selected = targetId(rows[0]?.detail || {});
  let gate = null;
  let lastSwitch = null;
  const accepted = [];
  const blocked = [];
  for (const item of requests) {
    const atMs = Date.parse(item.row.at || '');
    const sw = item.switch;
    const result = applyCombatTargetSwitchHysteresisCore({
      currentTargetId: selected,
      currentVisibleTarget: { user_id: selected },
      proposedTarget: { user_id: String(sw.toTargetId) },
      currentInvalid: false,
      urgentSafety: sw.mode === 'urgent',
      currentThreat: sw.currentThreat || {},
      proposedThreat: sw.proposedThreat || {},
      currentStickAgeMs: Number(sw.stickAgeMs || 0),
      lastSwitch,
      nowMs: atMs
    }, gate, {
      confirmTicks: 3,
      urgentConfirmTicks: 3,
      oscillationWindowMs: 10000,
      threatTtiAdvantageMs: 250,
      threatDistanceAdvantageCm: 1500,
      urgentReversalTtiAdvantageMs: 500,
      urgentReversalDistanceAdvantageCm: 2500,
      urgentReversalGuardEnabled: true
    });
    gate = result.gate;
    const next = String(result.target?.user_id || '');
    const event = {
      at: item.row.at,
      from: selected,
      proposed: String(sw.toTargetId),
      selected: next,
      reason: result.diagnostic?.reason || ''
    };
    if (next === String(sw.toTargetId)) {
      accepted.push(event);
      selected = next;
      lastSwitch = {
        fromTargetId: event.from,
        toTargetId: event.selected,
        at: atMs
      };
      gate = null;
    } else blocked.push(event);
  }
  const switchTime = accepted.map(item => ({ at: Date.parse(item.at), target: item.selected }));
  const shots = entries
    .flatMap(entry => battleRows(dayDir, entry))
    .filter(row => row.type === 'shoot-execution' && row.detail?.type === 'shoot-ack-accepted')
    .sort((left, right) => Number(left.detail.atMs || 0) - Number(right.detail.atMs || 0));
  const focusAt = atMs => {
    let focus = targetId(rows[0]?.detail || {});
    for (const event of switchTime) {
      if (event.at > atMs) break;
      focus = event.target;
    }
    return focus;
  };
  let reassignedAcceptedShots = 0;
  for (const shot of shots) {
    const historicalShotTarget = String(shot.detail.targetId ?? '');
    if (historicalShotTarget && historicalShotTarget !== focusAt(Number(shot.detail.atMs || 0))) {
      reassignedAcceptedShots += 1;
    }
  }
  const ownerIdsObserved = new Set();
  let framesWithThreat = 0;
  for (const row of rows) {
    const owners = ownerIds(row.detail || {});
    if (owners.size) framesWithThreat += 1;
    for (const owner of owners) ownerIdsObserved.add(owner);
  }
  const physicalByTarget = {};
  for (const entry of entries) {
    const id = String(entry.targetId || '');
    physicalByTarget[id] = physicalByTarget[id] || { segments: 0, targetDamage: 0, selfDamage: 0 };
    const physical = historicalPhysicalStats(entry, dayDir);
    physicalByTarget[id].segments += 1;
    physicalByTarget[id].targetDamage += physical.targetDamage;
    physicalByTarget[id].selfDamage += physical.selfDamage;
  }
  return {
    lines: entries.map(entry => entry.line),
    frames: rows.length,
    historicalTransitions: historicalTransitions.length,
    replayAcceptedSwitches: accepted.length,
    replayBlockedSwitchRequests: blocked.length,
    replayAcceptedEvents: accepted,
    replayBlockedEvents: blocked.slice(0, 24),
    reassignedAcceptedShotsUnderReplay: reassignedAcceptedShots,
    defensiveDodge: {
      framesWithThreat,
      ownerCount: ownerIdsObserved.size,
      allThreatOwnersRemainDodgeInputs: true
    },
    physicalByTarget,
    damageProof: {
      provenImprovement: false,
      reason: 'focus-only replay cannot infer a new target hit from historical shots without rerunning aim, bullets, and target motion'
    }
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const index = readIndex(options.dayDir);
  const hpEntry = index.find(item => item.line === options.hpIndex);
  if (!hpEntry) throw new Error(`index line not found: ${options.hpIndex}`);
  const focusSelection = parseLineSelection(options.focusLines);
  const retreatSelection = parseLineSelection(options.retreatLines);
  const focusEntries = index.filter(item => focusSelection.has(item.line));
  const retreatEntries = index.filter(item => retreatSelection.has(item.line));
  const result = {
    mode: 'offline-combat-optimization-candidates',
    dayDir: options.dayDir,
    hpLossAttribution: replayHpLoss(hpEntry, options.dayDir),
    targetFocus: replayFocus(focusEntries, options.dayDir),
    retreatIntercept: retreatEntries.map(entry => replayRetreat(entry, options.dayDir)),
    release: {
      safeRetreatInterceptEnabled: false,
      targetFocusDamageProof: false,
      onlineValidationPerformed: false
    }
  };
  result.accepted = Boolean(
    result.hpLossAttribution.accepted
      && result.targetFocus.defensiveDodge.allThreatOwnersRemainDodgeInputs
      && result.release.safeRetreatInterceptEnabled === false
      && result.release.targetFocusDamageProof === false
      && result.release.onlineValidationPerformed === false
  );
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error?.stack || error}\n`);
  process.exitCode = 1;
}
