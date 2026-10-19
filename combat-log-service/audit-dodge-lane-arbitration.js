#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const zlib = require('zlib');
const {
  collapsedDodgeCandidatesCore,
  riskFieldsFromCandidates,
  selectDodgeCandidateCore,
  safestTierCandidateCore
} = require('../src/strategy/combat-dodge-selection');

const DEFAULT_HIT_RADIUS_CM = 90;
const DEFAULT_COMMAND_DELAY_TICKS = 2;
const DEFAULT_TICK_MS = 50;

function parseArgs(argv) {
  const options = {
    index: '',
    targetId: '',
    throughAt: '',
    hitRadiusCm: DEFAULT_HIT_RADIUS_CM,
    commandDelayTicks: DEFAULT_COMMAND_DELAY_TICKS,
    json: false,
    selfTest: false,
    failOnCriteria: false,
    expectRawSafeOverrides: null,
    expectRobustSafeOverrides: null,
    expectUniqueHits: null,
    incidentFile: '',
    incidentStartLine: 0,
    incidentEndLine: 0,
    incidentSelfId: '',
    incidentBulletIds: [],
    incidentHitBulletId: ''
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--index') options.index = argv[++index] || '';
    else if (arg === '--target-id') options.targetId = String(argv[++index] || '');
    else if (arg === '--through-at') options.throughAt = String(argv[++index] || '');
    else if (arg === '--hit-radius') options.hitRadiusCm = Number(argv[++index] || DEFAULT_HIT_RADIUS_CM);
    else if (arg === '--command-delay-ticks') {
      options.commandDelayTicks = Number(argv[++index] || DEFAULT_COMMAND_DELAY_TICKS);
    } else if (arg === '--expect-raw-safe-overrides') {
      options.expectRawSafeOverrides = Number(argv[++index]);
    } else if (arg === '--expect-robust-safe-overrides') {
      options.expectRobustSafeOverrides = Number(argv[++index]);
    } else if (arg === '--expect-unique-hits') {
      options.expectUniqueHits = Number(argv[++index]);
    } else if (arg === '--incident-file') options.incidentFile = argv[++index] || '';
    else if (arg === '--incident-start-line') options.incidentStartLine = Number(argv[++index] || 0);
    else if (arg === '--incident-end-line') options.incidentEndLine = Number(argv[++index] || 0);
    else if (arg === '--incident-self-id') options.incidentSelfId = String(argv[++index] || '');
    else if (arg === '--incident-bullet-ids') {
      options.incidentBulletIds = String(argv[++index] || '')
        .split(',')
        .map(value => value.trim())
        .filter(Boolean);
    } else if (arg === '--incident-hit-bullet') options.incidentHitBulletId = String(argv[++index] || '');
    else if (arg === '--json') options.json = true;
    else if (arg === '--fail-on-criteria') options.failOnCriteria = true;
    else if (arg === '--self-test') options.selfTest = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error('unknown argument: ' + arg);
    }
  }
  if (!options.selfTest && !options.index) throw new Error('--index is required');
  if (options.throughAt && !Number.isFinite(Date.parse(options.throughAt))) {
    throw new Error('--through-at must be an ISO timestamp');
  }
  return options;
}

function printHelp() {
  console.log([
    'Usage: node audit-dodge-lane-arbitration.js --index <battle-index.jsonl> [options]',
    '',
    'Options:',
    '  --target-id <id>                    Restrict the frame scan to one opponent.',
    '  --through-at <iso>                  Include index rows at or before this timestamp.',
    '  --hit-radius <cm>                   Physical hit radius. Default: 90.',
    '  --expect-raw-safe-overrides <n>     Require the historical override count.',
    '  --expect-robust-safe-overrides <n>  Require the robust-safe override count.',
    '  --expect-unique-hits <n>            Require identified hit bullets.',
    '  --incident-file <jsonl.gz>          Enable a counterfactual lane replay.',
    '  --incident-start-line <n>           First retained decision frame.',
    '  --incident-end-line <n>             Last retained decision frame.',
    '  --incident-self-id <id>             Self user id for the incident.',
    '  --incident-bullet-ids <ids>         Comma-separated bullets that must clear.',
    '  --incident-hit-bullet <id>          Bullet whose impact must disappear.',
    '  --fail-on-criteria                  Exit non-zero on a failed invariant.',
    '  --json                              Print machine-readable JSON.',
    '  --self-test                         Run focused classification tests.'
  ].join('\n'));
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function directionKey(direction = {}) {
  return String(Math.sign(Number(direction.dx || 0))) + ',' + String(Math.sign(Number(direction.dy || 0)));
}

function rowRawCpa(row = {}) {
  return numberOrNull(row.minRawCpaCm ?? row.rawMinCPA);
}

function rowRobustCpa(row = {}) {
  return numberOrNull(row.minRobustCpaCm ?? row.worstCaseCpaCm ?? row.minCPA);
}

function enrichRow(row = {}, options = {}) {
  const hitRadius = Number(options.hitRadiusCm || DEFAULT_HIT_RADIUS_CM);
  const rawCpa = rowRawCpa(row);
  const robustCpa = rowRobustCpa(row);
  const risk = riskFieldsFromCandidates({
    ...row,
    hitRadiusCm: hitRadius,
    dodgeRiskBullets: Array.isArray(row.dodgeRiskBullets)
      ? row.dodgeRiskBullets
      : (Array.isArray(row.dangerousBullets) ? row.dangerousBullets : [])
  }, { hitRadius });
  const physicalHits = rawCpa === null
    ? Number(row.physicalHits ?? row.directHits ?? 0)
    : (rawCpa < hitRadius ? Math.max(1, risk.physicalHits) : 0);
  const robustHits = robustCpa === null
    ? Number(row.robustHits ?? row.directHits ?? 0)
    : (robustCpa < hitRadius ? Math.max(1, risk.robustHits) : 0);
  const signedRobustCpa = robustCpa === null ? risk.minRobustCpaCm : robustCpa;
  return {
    ...row,
    hitRadiusCm: hitRadius,
    physicalHits,
    robustHits,
    minRawCpaCm: rawCpa,
    minRawClearanceCm: rawCpa === null ? null : rawCpa - hitRadius,
    minRobustCpaCm: signedRobustCpa,
    minRobustClearanceCm: signedRobustCpa === null ? null : signedRobustCpa - hitRadius,
    firstPhysicalCollisionTtiMs: risk.firstPhysicalCollisionTtiMs,
    firstPhysicalCollisionBulletId: risk.firstPhysicalCollisionBulletId,
    minClearanceBulletId: risk.minClearanceBulletId,
    minRobustClearanceBulletId: risk.minRobustClearanceBulletId
  };
}

function selectedRow(threatField = [], direction = {}) {
  const key = directionKey(direction);
  return (Array.isArray(threatField) ? threatField : [])
    .find(row => directionKey(row) === key) || null;
}

function hardGateOf(detail = {}) {
  const exit = detail.exit || {};
  const movement = detail.movement || {};
  const reason = String(movement.reason || movement.dodge?.reason || '');
  return Boolean(
    exit.shouldLeave === true
      || exit.action?.shouldLeave === true
      || exit.decision?.shouldLeave === true
      || /(?:^|-)(?:leave|exit|recovery)(?:-|$)/.test(reason)
      || movement.ownership?.hardExit === true
  );
}

function frameClassification(detail = {}, options = {}) {
  const hitRadius = Number(options.hitRadiusCm || DEFAULT_HIT_RADIUS_CM);
  const movement = detail.movement || {};
  const threatField = Array.isArray(movement.dodge?.threatField)
    ? movement.dodge.threatField
    : [];
  if (!threatField.length) return null;
  const enrichedField = threatField.map(item => enrichRow(item, { hitRadiusCm: hitRadius }));
  const collapsedField = collapsedDodgeCandidatesCore(enrichedField, { hitRadius });
  const own = { dx: Number(movement.dx || 0), dy: Number(movement.dy || 0) };
  const row = selectedRow(collapsedField, own);
  if (!row) return null;
  const legacyRow = selectedRow(threatField, own);
  const legacyRawCpa = rowRawCpa(legacyRow || {});
  const physicalSafe = collapsedField.filter(item => item.physicalHits === 0);
  const robustSafe = physicalSafe.filter(item => item.robustHits === 0
    && item.scheduleRobust !== false);
  const selected = selectDodgeCandidateCore(collapsedField, {
    hitRadius,
    currentDirection: own
  });
  const safeLoot = safestTierCandidateCore(collapsedField, {
    hitRadius,
    scoreCandidate: item => Number(item.targetDistanceChange || 0)
  });
  const rawSafeRowCount = enrichedField.filter(item => (
    item.minRawCpaCm !== null && item.minRawCpaCm >= hitRadius
  )).length;
  return {
    tick: numberOrNull(detail.tick),
    own,
    current: row,
    // Preserve the historical 317-frame denominator, which was computed from
    // the first matching logged row. Worst-schedule safety is reported below.
    currentRawSafe: legacyRawCpa !== null && legacyRawCpa >= hitRadius,
    currentWorstRawSafe: row.minRawCpaCm !== null && row.minRawCpaCm >= hitRadius,
    currentRobustSafe: row.robustHits === 0 && row.scheduleRobust !== false,
    rawSafeRowCount,
    safeDirectionCount: physicalSafe.length,
    robustSafeDirectionCount: robustSafe.length,
    selected: selected || null,
    safeLoot: safeLoot || null,
    hardGate: hardGateOf(detail),
    source: String(movement.reason || movement.dodge?.reason || 'unknown'),
    postKillLoot: /post-kill-loot/.test(String(movement.reason || movement.dodge?.reason || ''))
  };
}

function jsonlLineReader(file) {
  const input = fs.createReadStream(file);
  const source = /\.gz$/i.test(file) ? input.pipe(zlib.createGunzip()) : input;
  return readline.createInterface({ input: source, crlfDelay: Infinity });
}

function candidateHitBullets(attribution = {}) {
  const bullets = Array.isArray(attribution.candidateBullets) ? attribution.candidateBullets : [];
  const trajectoryMatched = bullets.filter(bullet => {
    const matchId = String(bullet?.trajectoryMatch?.bulletId ?? '');
    return matchId && matchId === String(bullet?.bulletId ?? '');
  });
  if (trajectoryMatched.length) return trajectoryMatched;
  const predicted = bullets.filter(bullet => (
    bullet?.predictedHit === true
      || bullet?.currentHoldHit === true
      || bullet?.expectedHit === true
      || bullet?.lateHit === true
  ));
  return predicted.length ? predicted : bullets.slice(0, 1);
}

function bulletHistoryEntry(map, file, bulletId) {
  const key = file + ':' + bulletId;
  let entry = map.get(key);
  if (!entry) {
    entry = {
      key,
      file,
      bulletId: String(bulletId),
      firstTick: null,
      firstDistanceCm: null,
      firstSafeTick: null,
      firstCorrectiveTick: null,
      firstCorrective: null,
      lastTick: null
    };
    map.set(key, entry);
  }
  return entry;
}

async function scanFiles(files, options = {}) {
  const hitRadius = Number(options.hitRadiusCm || DEFAULT_HIT_RADIUS_CM);
  const histories = new Map();
  const attributions = [];
  let frames = 0;
  let rawSafeOverrides = 0;
  let robustSafeOverrides = 0;
  let ordinaryUnresolved = 0;
  let postKillUnsafe = 0;
  let postKillResolved = 0;
  const sourceCounts = {};
  const resolutionCounts = {};
  const rawSafeSamples = [];
  const unresolvedSamples = [];
  const robustSafeSamples = [];

  for (const file of files) {
    let line = 0;
    const reader = jsonlLineReader(file);
    for await (const raw of reader) {
      line += 1;
      if (!raw.trim()) continue;
      let entry;
      try {
        entry = JSON.parse(raw);
      } catch {
        continue;
      }
      if (entry.type !== 'combat-live') continue;
      const detail = entry.detail || {};
      frames += 1;
      const attribution = detail.metrics?.combatHpLossAttribution;
      if (attribution && Array.isArray(attribution.candidateBullets) && attribution.candidateBullets.length) {
        for (const bullet of candidateHitBullets(attribution)) {
          const bulletId = String(bullet?.bulletId ?? '');
          if (!bulletId) continue;
          attributions.push({
            key: file + ':' + bulletId,
            file,
            line,
            bulletId,
            hitTick: numberOrNull(attribution.lossTick ?? detail.tick),
            hpLoss: numberOrNull(attribution.hpLoss),
            hpBefore: numberOrNull(attribution.previousSelfHp),
            hpAfter: numberOrNull(attribution.currentSelfHp),
            classification: String(attribution.classification || ''),
            candidate: bullet
          });
        }
      }
      const classified = frameClassification(detail, { hitRadiusCm: hitRadius });
      if (!classified) continue;
      const bulletRows = new Map();
      for (const row of detail.movement?.dodge?.threatField || []) {
        for (const bullet of row.dangerousBullets || []) {
          const bulletId = String(bullet?.bulletId ?? '');
          if (bulletId) bulletRows.set(bulletId, bullet);
        }
      }
      for (const [bulletId, bullet] of bulletRows) {
        const history = bulletHistoryEntry(histories, file, bulletId);
        const tick = classified.tick;
        if (history.firstTick === null || tick < history.firstTick) {
          history.firstTick = tick;
          history.firstDistanceCm = numberOrNull(bullet?.timeToImpact) === null
            ? null
            : Number(bullet.timeToImpact) / DEFAULT_TICK_MS * 500;
        }
        history.lastTick = tick;
        if (classified.safeDirectionCount > 0
          && (history.firstSafeTick === null || tick < history.firstSafeTick)) {
          history.firstSafeTick = tick;
        }
        if (classified.current.physicalHits > 0
          && classified.safeDirectionCount > 0
          && (history.firstCorrectiveTick === null || tick < history.firstCorrectiveTick)) {
          history.firstCorrectiveTick = tick;
          history.firstCorrective = {
            line,
            tick,
            oldDirection: classified.own,
            newDirection: classified.selected
              ? { dx: classified.selected.dx, dy: classified.selected.dy }
              : null,
            newPhysicalHits: classified.selected?.physicalHits ?? null,
            bulletCpaCm: numberOrNull(bullet?.cpa),
            source: classified.source
          };
        }
      }

      if (!classified.currentRawSafe && classified.rawSafeRowCount > 0) {
        rawSafeOverrides += 1;
        sourceCounts[classified.source] = Number(sourceCounts[classified.source] || 0) + 1;
        const resolved = Boolean(classified.selected && classified.selected.physicalHits === 0);
        const allDirectionWorstCasesUnsafe = classified.safeDirectionCount === 0;
        const resolution = classified.hardGate
          ? 'preserved-hard-gate'
          : (resolved
              ? (classified.postKillLoot ? 'safe-loot-or-final-guard' : 'final-movement-safety-override')
              : (allDirectionWorstCasesUnsafe
                  ? 'all-directions-unsafe-under-worst-schedule'
                  : 'unresolved'));
        resolutionCounts[resolution] = Number(resolutionCounts[resolution] || 0) + 1;
        if (!classified.hardGate && resolution === 'unresolved') {
          ordinaryUnresolved += 1;
          unresolvedSamples.push({
            file: path.basename(file),
            line,
            tick: classified.tick,
            source: classified.source,
            oldDirection: classified.own,
            oldRawCpaCm: rowRawCpa(selectedRow(
              detail.movement?.dodge?.threatField || [],
              classified.own
            )),
            safeDirectionCount: classified.safeDirectionCount,
            robustSafeDirectionCount: classified.robustSafeDirectionCount,
            selectedDirection: classified.selected
              ? { dx: classified.selected.dx, dy: classified.selected.dy }
              : null,
            selectedPhysicalHits: classified.selected?.physicalHits ?? null,
            selectedRobustHits: classified.selected?.robustHits ?? null,
            selectedRawCpaCm: numberOrNull(classified.selected?.minRawCpaCm),
            selectedRobustCpaCm: numberOrNull(classified.selected?.minRobustCpaCm)
          });
        }
        if (classified.postKillLoot) {
          if (resolved) postKillResolved += 1;
          else postKillUnsafe += 1;
        }
        if (rawSafeSamples.length < 32) {
          rawSafeSamples.push({
            file: path.basename(file),
            line,
            tick: classified.tick,
            source: classified.source,
            oldDirection: classified.own,
            oldRawCpaCm: rowRawCpa(selectedRow(
              detail.movement?.dodge?.threatField || [],
              classified.own
            )),
            newDirection: classified.selected
              ? { dx: classified.selected.dx, dy: classified.selected.dy }
              : null,
            newRawCpaCm: numberOrNull(classified.selected?.minRawCpaCm),
            resolution,
            postKillLoot: classified.postKillLoot
          });
        }
      }
      if (!classified.currentRobustSafe && classified.robustSafeDirectionCount > 0) {
        robustSafeOverrides += 1;
        if (robustSafeSamples.length < 16) {
          robustSafeSamples.push({
            file: path.basename(file),
            line,
            tick: classified.tick,
            source: classified.source,
            oldDirection: classified.own,
            newDirection: classified.selected
              ? { dx: classified.selected.dx, dy: classified.selected.dy }
              : null,
            resolved: Boolean(classified.selected
              && classified.selected.physicalHits === 0
              && classified.selected.robustHits === 0),
            postKillLoot: classified.postKillLoot
          });
        }
      }
    }
  }
  return {
    frames,
    histories,
    attributions,
    rawSafeOverrides,
    robustSafeOverrides,
    ordinaryUnresolved,
    postKillUnsafe,
    postKillResolved,
    sourceCounts,
    resolutionCounts,
    rawSafeSamples,
    unresolvedSamples,
    robustSafeSamples
  };
}

function classifyHits(scan, options = {}) {
  const hitRadius = Number(options.hitRadiusCm || DEFAULT_HIT_RADIUS_CM);
  const delay = Math.max(0, Number(options.commandDelayTicks || DEFAULT_COMMAND_DELAY_TICKS));
  const byKey = new Map();
  for (const attribution of scan.attributions) {
    const previous = byKey.get(attribution.key);
    if (!previous || Number(attribution.hitTick || Infinity) < Number(previous.hitTick || Infinity)) {
      byKey.set(attribution.key, attribution);
    }
  }
  const items = [];
  for (const attribution of byKey.values()) {
    const history = scan.histories.get(attribution.key) || null;
    const reactionTicks = history && history.firstTick !== null && attribution.hitTick !== null
      ? Math.max(0, attribution.hitTick - history.firstTick)
      : null;
    const corrective = history?.firstCorrective || null;
    const effectiveTick = corrective ? Number(corrective.tick) + delay : null;
    let classification = 'evidence-insufficient';
    if (reactionTicks !== null && reactionTicks <= 2) {
      classification = 'no-executable-window';
    } else if (!history || history.firstSafeTick === null) {
      classification = 'candidate-space-insufficient';
    } else if (corrective && effectiveTick !== null && attribution.hitTick !== null
      && effectiveTick < attribution.hitTick) {
      classification = 'safe-direction-before-deadline';
    } else {
      classification = 'safe-direction-too-late';
    }
    items.push({
      file: path.basename(attribution.file),
      line: attribution.line,
      bulletId: attribution.bulletId,
      hitTick: attribution.hitTick,
      hpLoss: attribution.hpLoss,
      firstThreatTick: history?.firstTick ?? null,
      firstThreatDistanceCm: history?.firstDistanceCm ?? null,
      reactionTicks,
      firstSafeTick: history?.firstSafeTick ?? null,
      firstCorrectiveTick: corrective?.tick ?? null,
      firstCorrectiveEffectiveTick: effectiveTick,
      oldDirection: corrective?.oldDirection || null,
      newDirection: corrective?.newDirection || null,
      newPhysicalHits: corrective?.newPhysicalHits ?? null,
      classification
    });
  }
  const counts = {};
  for (const item of items) counts[item.classification] = Number(counts[item.classification] || 0) + 1;
  return {
    hpAttributionEvents: scan.attributions.length,
    uniqueIdentifiedHits: items.length,
    hitRadiusCm: hitRadius,
    commandDelayTicks: delay,
    counts,
    noBenefitClaim: items
      .filter(item => item.classification === 'no-executable-window')
      .map(item => path.basename(item.file) + ':' + item.bulletId + '@' + item.hitTick),
    items
  };
}

function bulletGeometryFromAttribution(candidate = {}, decisionTick = null) {
  const currentTick = numberOrNull(candidate.currentTick);
  const tick = currentTick === null ? decisionTick : currentTick;
  const x = numberOrNull(candidate.x);
  const y = numberOrNull(candidate.y);
  const dx = numberOrNull(candidate.direction?.dx);
  const dy = numberOrNull(candidate.direction?.dy);
  const speed = numberOrNull(candidate.speed);
  if ([tick, x, y, dx, dy, speed, decisionTick].some(value => value === null)) return null;
  const ageTicks = Math.max(0, Number(decisionTick) - tick);
  return {
    x: x + dx * speed * ageTicks,
    y: y + dy * speed * ageTicks,
    dx,
    dy,
    speed,
    originTick: tick
  };
}

function sweptBulletClearance(selfPath, bullet) {
  let minimum = Infinity;
  let interval = null;
  for (let index = 1; index < selfPath.length; index += 1) {
    const previous = selfPath[index - 1];
    const current = selfPath[index];
    const bulletPrevious = {
      x: bullet.x + bullet.dx * bullet.speed * (previous.tick - bullet.originTick),
      y: bullet.y + bullet.dy * bullet.speed * (previous.tick - bullet.originTick)
    };
    const bulletCurrent = {
      x: bullet.x + bullet.dx * bullet.speed * (current.tick - bullet.originTick),
      y: bullet.y + bullet.dy * bullet.speed * (current.tick - bullet.originTick)
    };
    const ax = previous.x - bulletPrevious.x;
    const ay = previous.y - bulletPrevious.y;
    const vx = (current.x - bulletCurrent.x) - ax;
    const vy = (current.y - bulletCurrent.y) - ay;
    const speedSquared = vx * vx + vy * vy;
    const fraction = speedSquared > 0
      ? Math.max(0, Math.min(1, -(ax * vx + ay * vy) / speedSquared))
      : 0;
    const clearance = Math.hypot(ax + vx * fraction, ay + vy * fraction);
    if (clearance < minimum) {
      minimum = clearance;
      interval = { fromTick: previous.tick, toTick: current.tick, fraction };
    }
  }
  return {
    minimumClearanceCm: Number.isFinite(minimum) ? minimum : null,
    interval
  };
}

function simulateHeldDirection(startSelf, direction, delay, endTick, tickMs = DEFAULT_TICK_MS) {
  const startTick = Number(startSelf.tick);
  const path = [{ tick: startTick, x: Number(startSelf.x), y: Number(startSelf.y) }];
  let x = Number(startSelf.x);
  let y = Number(startSelf.y);
  const diagonalScale = direction.dx && direction.dy ? Math.SQRT1_2 : 1;
  const moveSpeed = Number(startSelf.speedPerTick ?? (50 * DEFAULT_TICK_MS / tickMs));
  const candidateVx = direction.dx * diagonalScale * moveSpeed;
  const candidateVy = direction.dy * diagonalScale * moveSpeed;
  for (let tick = startTick + 1; tick <= endTick; tick += 1) {
    const relativeTick = tick - startTick;
    const vx = relativeTick >= delay ? candidateVx : Number(startSelf.vx || 0);
    const vy = relativeTick >= delay ? candidateVy : Number(startSelf.vy || 0);
    x += vx;
    y += vy;
    path.push({ tick, x, y, vx, vy });
  }
  return path;
}

function maximumScheduleDelay(row = {}, fallback = DEFAULT_COMMAND_DELAY_TICKS) {
  const delays = (row.velocityScheduleVariants || [])
    .flatMap(variant => variant.events || [])
    .map(event => Number(event.effectiveAfterTicks))
    .filter(Number.isFinite);
  return delays.length ? Math.max(...delays) : fallback;
}

async function readIncidentRows(options = {}) {
  if (!options.incidentFile || !options.incidentStartLine || !options.incidentEndLine) return [];
  const rows = [];
  let line = 0;
  const reader = jsonlLineReader(options.incidentFile);
  for await (const raw of reader) {
    line += 1;
    if (line < options.incidentStartLine) continue;
    if (line > options.incidentEndLine) break;
    if (!raw.trim()) continue;
    try {
      const entry = JSON.parse(raw);
      if (entry.type === 'combat-live') rows.push({ line, entry, detail: entry.detail || {} });
    } catch {
      // Preserve line numbering for malformed evidence.
    }
  }
  return rows;
}

async function replayIncident(options = {}) {
  if (!options.incidentFile) return null;
  const rows = await readIncidentRows(options);
  const hitRadius = Number(options.hitRadiusCm || DEFAULT_HIT_RADIUS_CM);
  const bulletIds = new Set(options.incidentBulletIds.map(String));
  let decision = null;
  for (const row of rows) {
    const field = row.detail.movement?.dodge?.threatField;
    if (!Array.isArray(field) || !field.length) continue;
    const found = new Set(field.flatMap(item => (item.dangerousBullets || [])
      .map(bullet => String(bullet?.bulletId ?? ''))));
    if (Array.from(bulletIds).every(id => found.has(id))) {
      decision = row;
      break;
    }
  }
  if (!decision) return { accepted: false, reason: 'incident-decision-frame-not-found' };
  const movement = decision.detail.movement || {};
  const threatField = movement.dodge?.threatField || [];
  const oldDirection = { dx: Number(movement.dx || 0), dy: Number(movement.dy || 0) };
  const enriched = threatField.map(row => enrichRow(row, { hitRadiusCm: hitRadius }));
  const selected = selectDodgeCandidateCore(enriched, {
    hitRadius,
    currentDirection: oldDirection
  });
  const selectedRaw = threatField.find(row => directionKey(row) === directionKey(selected || {})) || null;
  const bulletCpas = Object.fromEntries((selectedRaw?.dangerousBullets || [])
    .filter(bullet => bulletIds.has(String(bullet.bulletId)))
    .map(bullet => [String(bullet.bulletId), numberOrNull(bullet.cpa)]));
  const hitAttribution = rows
    .map(row => row.detail.metrics?.combatHpLossAttribution)
    .find(attribution => attribution && candidateHitBullets(attribution)
      .some(bullet => String(bullet?.bulletId ?? '') === String(options.incidentHitBulletId)));
  const hitCandidate = hitAttribution
    ? candidateHitBullets(hitAttribution)
      .find(bullet => String(bullet?.bulletId ?? '') === String(options.incidentHitBulletId))
    : null;
  const decisionTick = numberOrNull(decision.detail.tick);
  const geometry = bulletGeometryFromAttribution(hitCandidate, decisionTick);
  const hitTick = numberOrNull(hitAttribution?.lossTick) ?? numberOrNull(rows.at(-1)?.detail?.tick);
  const oldPath = rows
    .filter(row => Number(row.detail.tick) >= decisionTick && Number(row.detail.tick) <= hitTick)
    .map(row => ({
      tick: Number(row.detail.tick),
      x: Number(row.detail.self?.x),
      y: Number(row.detail.self?.y)
    }));
  const delay = maximumScheduleDelay(selectedRaw || {}, options.commandDelayTicks);
  const newPath = selected && geometry && hitTick !== null
    ? simulateHeldDirection({ ...decision.detail.self, tick: decisionTick },
        { dx: selected.dx, dy: selected.dy }, delay, hitTick)
    : [];
  const oldSweep = geometry && oldPath.length > 1
    ? sweptBulletClearance(oldPath, geometry)
    : { minimumClearanceCm: null, interval: null };
  const newSweep = geometry && newPath.length > 1
    ? sweptBulletClearance(newPath, geometry)
    : { minimumClearanceCm: null, interval: null };
  const oldCollision = oldSweep.minimumClearanceCm !== null
    && oldSweep.minimumClearanceCm < hitRadius;
  const newCollision = newSweep.minimumClearanceCm !== null
    && newSweep.minimumClearanceCm < hitRadius;
  const allIncidentBulletsClear = Object.fromEntries(Array.from(bulletIds)
    .map(id => [id, Number(bulletCpas[id] ?? -Infinity) > hitRadius]));
  const noNewDirectCollision = Boolean(selected
    && selected.physicalHits === 0
    && Object.values(allIncidentBulletsClear).every(Boolean));
  const criteria = {
    selectedPhysicalSafe: Boolean(selected && selected.physicalHits === 0),
    directionChanged: Boolean(selected
      && directionKey(oldDirection) !== directionKey(selected)),
    hitBulletClears: allIncidentBulletsClear[String(options.incidentHitBulletId)] === true,
    oldPathCollides: oldCollision,
    newPathClears: !newCollision,
    noNewDirectCollision,
    hpLossObserved: Number(hitAttribution?.currentSelfHp) < Number(hitAttribution?.previousSelfHp)
  };
  const accepted = Object.values(criteria).every(Boolean);
  return {
    accepted,
    file: options.incidentFile,
    lines: String(options.incidentStartLine) + '-' + String(options.incidentEndLine),
    decisionLine: decision.line,
    decisionTick,
    hitTick,
    hitBulletId: String(options.incidentHitBulletId),
    hitRadiusCm: hitRadius,
    oldDirection,
    newDirection: selected ? { dx: selected.dx, dy: selected.dy } : null,
    oldRisk: {
      physicalHits: enrichRow(selectedRow(threatField, oldDirection) || {}, { hitRadiusCm: hitRadius }).physicalHits
    },
    newRisk: selected ? {
      physicalHits: selected.physicalHits,
      robustHits: selected.robustHits,
      minRawClearanceCm: selected.minRawClearanceCm,
      minRobustClearanceCm: selected.minRobustClearanceCm,
      firstPhysicalCollisionBulletId: selected.firstPhysicalCollisionBulletId,
      minClearanceBulletId: selected.minClearanceBulletId
    } : null,
    incidentBulletCpasCm: bulletCpas,
    allIncidentBulletsClear,
    commandDelayTicks: delay,
    oldClearance: oldSweep,
    newClearance: newSweep,
    oldCollision,
    newCollision,
    noNewDirectCollision,
    criteria,
    hpBefore: numberOrNull(hitAttribution?.previousSelfHp),
    hpAfter: numberOrNull(hitAttribution?.currentSelfHp),
    predictedHpDifference: oldCollision && !newCollision
      ? 'logged ' + String(numberOrNull(hitAttribution?.previousSelfHp))
        + '->' + String(numberOrNull(hitAttribution?.currentSelfHp))
        + '; held safe lane predicts no impact'
      : null,
    reason: accepted ? 'logged-impact-eliminated-without-new-direct-collision' : 'incident-criteria-not-met'
  };
}

function acceptance(result, options = {}) {
  const checks = {
    rawSafeOverridesExplained: result.rawSafeOverrideClassification.explained
      === result.rawSafeOverrideClassification.total,
    noOrdinaryRawUnsafeOverride: result.rawSafeOverrideClassification.ordinaryUnresolved === 0,
    noPostKillDamageCommitWithSafeLane: result.rawSafeOverrideClassification.postKillUnsafe === 0,
    uniqueHitsReclassified: result.hitReclassification.items
      .every(item => Boolean(item.classification)),
    incidentReplayPassed: !result.incident || result.incident.accepted === true
  };
  if (options.expectRawSafeOverrides !== null && options.expectRawSafeOverrides !== undefined) {
    checks.expectedRawSafeOverrideCount = result.rawSafeOverrideClassification.total
      === Number(options.expectRawSafeOverrides);
  }
  if (options.expectRobustSafeOverrides !== null && options.expectRobustSafeOverrides !== undefined) {
    checks.expectedRobustSafeOverrideCount = result.robustSafeOverrideClassification.total
      === Number(options.expectRobustSafeOverrides);
  }
  if (options.expectUniqueHits !== null && options.expectUniqueHits !== undefined) {
    checks.expectedUniqueHitCount = result.hitReclassification.uniqueIdentifiedHits
      === Number(options.expectUniqueHits);
  }
  return {
    ok: Object.values(checks).every(Boolean),
    checks
  };
}

async function audit(options = {}) {
  const indexFile = path.resolve(options.index);
  const base = path.dirname(indexFile);
  const indexRows = [];
  const reader = jsonlLineReader(indexFile);
  for await (const raw of reader) {
    if (!raw.trim()) continue;
    try {
      indexRows.push(JSON.parse(raw));
    } catch {
      // A malformed index row is excluded; the scan still reports parsed frames.
    }
  }
  const selectedIndexRows = indexRows.filter(row => !options.targetId
    || String(row.targetId ?? row.target_id ?? '') === String(options.targetId))
    .filter(row => {
      if (!options.throughAt) return true;
      const rowAtMs = Date.parse(String(row.at || ''));
      return Number.isFinite(rowAtMs) && rowAtMs <= Date.parse(options.throughAt);
    });
  const files = Array.from(new Set(selectedIndexRows
    .map(row => String(row.file || ''))
    .filter(Boolean)))
    .map(file => path.join(base, file));
  const scan = await scanFiles(files, options);
  const hitReclassification = classifyHits(scan, options);
  const rawTotal = scan.rawSafeOverrides;
  const result = {
    generatedAt: new Date().toISOString(),
    index: indexFile,
    targetId: String(options.targetId || ''),
    throughAt: String(options.throughAt || ''),
    files: files.length,
    frames: scan.frames,
    rawSafeOverrideClassification: {
      total: rawTotal,
      explained: rawTotal - scan.ordinaryUnresolved,
      resolved: rawTotal - scan.ordinaryUnresolved,
      ordinaryUnresolved: scan.ordinaryUnresolved,
      postKillUnsafe: scan.postKillUnsafe,
      postKillResolved: scan.postKillResolved,
      sourceCounts: scan.sourceCounts,
      resolutionCounts: scan.resolutionCounts,
      unresolvedSamples: scan.unresolvedSamples,
      samples: scan.rawSafeSamples
    },
    robustSafeOverrideClassification: {
      total: scan.robustSafeOverrides,
      samples: scan.robustSafeSamples
    },
    hitReclassification
  };
  result.incident = await replayIncident(options);
  result.acceptance = acceptance(result, options);
  return result;
}

function selfTest() {
  const hitRadius = 90;
  const field = [
    { dx: 0, dy: -1, rawMinCPA: 20, minCPA: 0, directHits: 1, dangerousBullets: [
      { bulletId: 'a', cpa: 20, timeToImpact: 100 }
    ] },
    { dx: 1, dy: 0, rawMinCPA: 240, minCPA: 60, directHits: 0, dangerousBullets: [
      { bulletId: 'a', cpa: 240, timeToImpact: 100 }
    ] }
  ];
  const oldDirection = { dx: 0, dy: -1 };
  const enriched = field.map(row => enrichRow(row, { hitRadiusCm: hitRadius }));
  const selected = selectDodgeCandidateCore(enriched, { hitRadius, currentDirection: oldDirection });
  if (!selected || selected.physicalHits !== 0 || selected.dx !== 1 || selected.dy !== 0) {
    throw new Error('self-test: physical-safe lane was not selected');
  }
  const emptyHits = classifyHits({ attributions: [], histories: new Map() }, { hitRadiusCm: hitRadius });
  if (emptyHits.uniqueIdentifiedHits !== 0) throw new Error('self-test: empty hit classification failed');
  const geometry = bulletGeometryFromAttribution({
    currentTick: 10,
    x: 1000,
    y: 0,
    direction: { dx: -1, dy: 0 },
    speed: 500
  }, 12);
  if (!geometry || geometry.x !== 0) throw new Error('self-test: bullet projection failed');
  const path = simulateHeldDirection({ tick: 12, x: 0, y: 0, vx: 0, vy: 0, speedPerTick: 50 },
    { dx: 1, dy: 0 }, 2, 15);
  if (path.length !== 4 || path.at(-1).x !== 100) {
    throw new Error('self-test: held-direction simulation failed');
  }
  const scoped = parseArgs([
    '--index', 'index.jsonl',
    '--through-at', '2026-10-19T04:34:00.000Z'
  ]);
  if (scoped.throughAt !== '2026-10-19T04:34:00.000Z') {
    throw new Error('self-test: timestamp scope parsing failed');
  }
  console.log(JSON.stringify({ ok: true, cases: 5 }));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.selfTest) {
    selfTest();
    return;
  }
  const result = await audit(options);
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const raw = result.rawSafeOverrideClassification;
    const hits = result.hitReclassification;
    console.log([
      'files=' + result.files + ' frames=' + result.frames,
      'raw-safe-overrides=' + raw.total + ' resolved=' + raw.resolved
        + ' ordinary-unresolved=' + raw.ordinaryUnresolved
        + ' post-kill-unsafe=' + raw.postKillUnsafe,
      'unique-hits=' + hits.uniqueIdentifiedHits + ' counts=' + JSON.stringify(hits.counts),
      'incident=' + (result.incident ? JSON.stringify(result.incident) : 'not-requested'),
      'acceptance=' + JSON.stringify(result.acceptance)
    ].join('\n'));
  }
  if (options.failOnCriteria && !result.acceptance.ok) process.exitCode = 1;
}

if (require.main === module) {
  main().catch(err => {
    console.error(err?.stack || err?.message || String(err));
    process.exit(1);
  });
}

module.exports = {
  audit,
  classifyHits,
  enrichRow,
  frameClassification,
  replayIncident,
  selfTest
};
