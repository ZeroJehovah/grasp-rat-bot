#!/usr/bin/env node
'use strict';

const fs = require('fs');
const zlib = require('zlib');
const readline = require('readline');

const DEFAULT_TICK_MS = 50;
const DEFAULT_MOVE_SPEED_PER_TICK = 50;
const DEFAULT_HIT_RADIUS_CM = 90;

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseDirection(value) {
  const match = /^(-?1|0),(-?1|0)$/.exec(String(value || '').trim());
  if (!match) throw new Error('--direction must be one of -1,0,1 for dx,dy');
  const dx = Number(match[1]);
  const dy = Number(match[2]);
  if (!dx && !dy) throw new Error('--direction cannot be stop');
  return { dx, dy };
}

function parseArgs(argv) {
  const options = {
    file: '',
    startLine: 1,
    endLine: 0,
    bulletId: '',
    direction: '',
    commandDelayTicks: 2,
    moveSpeedPerTick: DEFAULT_MOVE_SPEED_PER_TICK,
    hitRadiusCm: DEFAULT_HIT_RADIUS_CM,
    json: false,
    selfTest: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--file') options.file = argv[++index] || '';
    else if (arg === '--start-line') options.startLine = Number(argv[++index] || 0);
    else if (arg === '--end-line') options.endLine = Number(argv[++index] || 0);
    else if (arg === '--bullet-id') options.bulletId = String(argv[++index] || '');
    else if (arg === '--direction') options.direction = String(argv[++index] || '');
    else if (arg === '--command-delay-ticks') options.commandDelayTicks = Number(argv[++index] || 0);
    else if (arg === '--move-speed-per-tick') options.moveSpeedPerTick = Number(argv[++index] || 0);
    else if (arg === '--hit-radius') options.hitRadiusCm = Number(argv[++index] || 0);
    else if (arg === '--json') options.json = true;
    else if (arg === '--self-test') options.selfTest = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error('unknown argument: ' + arg);
    }
  }
  if (!options.selfTest) {
    if (!options.file) throw new Error('--file is required');
    if (!options.bulletId) throw new Error('--bullet-id is required');
  }
  return options;
}

function printHelp() {
  console.log([
    'Usage: node replay-dodge-lane-hold.js --file <jsonl[.gz]> --bullet-id <id> [options]',
    '',
    'Reconstructs a logged bullet corridor from the target position at creation to the',
    'first observed self HP-loss position, then compares the logged movement path with',
    'holding one directional Dodge command through the visible threat window.',
    '',
    'Options:',
    '  --start-line <n>             First log line to scan. Default: 1',
    '  --end-line <n>               Last log line to scan. Default: EOF',
    '  --direction <dx,dy>          Held command. Default: first logged movement direction',
    '  --command-delay-ticks <n>    Ticks before the held command is effective. Default: 2',
    '  --move-speed-per-tick <cm>   Movement speed. Default: 50',
    '  --hit-radius <cm>            Bullet hit radius. Default: 90',
    '  --json                       Print machine-readable JSON',
    '  --self-test                  Run focused synthetic replay tests'
  ].join('\n'));
}

function jsonlLineReader(file) {
  const input = fs.createReadStream(file);
  const source = /\.gz$/i.test(file) ? input.pipe(zlib.createGunzip()) : input;
  return readline.createInterface({ input: source, crlfDelay: Infinity });
}

async function readCombatFrames(options) {
  const frames = [];
  let line = 0;
  for await (const raw of jsonlLineReader(options.file)) {
    line += 1;
    if (line < options.startLine) continue;
    if (options.endLine && line > options.endLine) break;
    if (!raw.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(raw);
    } catch {
      continue;
    }
    if (entry.type !== 'combat-live' || !entry.detail) continue;
    frames.push({ ...entry.detail, line });
  }
  return frames;
}

function bulletRiskFromFrame(frame = {}, bulletId = '') {
  const field = frame.movement?.dodge?.threatField;
  if (!Array.isArray(field)) return null;
  for (const row of field) {
    for (const bullet of row.dangerousBullets || []) {
      if (String(bullet?.bulletId ?? '') === String(bulletId)) return bullet;
    }
  }
  return null;
}

function pointDistance(left, right) {
  return Math.hypot(Number(left.x) - Number(right.x), Number(left.y) - Number(right.y));
}

function frameAtTick(frames, tick) {
  return frames.find(frame => Number(frame.tick) === Number(tick)) || null;
}

function evaluateFrames(frames, options) {
  if (!Array.isArray(frames) || !frames.length) {
    return { accepted: false, reason: 'no-combat-live-frames' };
  }
  const bulletId = String(options.bulletId || '');
  const startIndex = frames.findIndex(frame => Boolean(bulletRiskFromFrame(frame, bulletId)));
  if (startIndex < 0) return { accepted: false, reason: 'bullet-threat-frame-not-found', bulletId };
  const start = frames[startIndex];
  const risk = bulletRiskFromFrame(start, bulletId);
  const initialHp = numberOrNull(start.self?.hp);
  const hitIndex = frames.findIndex((frame, index) => index > startIndex
    && initialHp !== null
    && numberOrNull(frame.self?.hp) !== null
    && Number(frame.self.hp) < initialHp);
  if (hitIndex < 0) return { accepted: false, reason: 'later-self-hp-loss-not-found', bulletId };
  const hit = frames[hitIndex];
  const createdTick = numberOrNull(risk?.createdTick) ?? numberOrNull(start.tick);
  const startTick = numberOrNull(start.tick);
  const hitTick = numberOrNull(hit.tick);
  if (createdTick === null || startTick === null || hitTick === null || hitTick <= startTick) {
    return { accepted: false, reason: 'invalid-tick-window', bulletId };
  }
  const creationFrame = frameAtTick(frames, createdTick) || start;
  const bulletStart = {
    x: Number(creationFrame.target?.x),
    y: Number(creationFrame.target?.y)
  };
  const hitPoint = { x: Number(hit.self?.x), y: Number(hit.self?.y) };
  const initialSelf = { x: Number(start.self?.x), y: Number(start.self?.y) };
  if (![bulletStart.x, bulletStart.y, hitPoint.x, hitPoint.y, initialSelf.x, initialSelf.y].every(Number.isFinite)) {
    return { accepted: false, reason: 'missing-spatial-state', bulletId };
  }
  const inferredLengthCm = pointDistance(bulletStart, hitPoint);
  const bulletSpeed = Math.max(1, numberOrNull(risk?.speed) ?? 500);
  const hitTicks = hitTick - startTick;
  const expectedTravelCm = bulletSpeed * (hitTick - createdTick);
  const lengthRatio = inferredLengthCm / expectedTravelCm;
  if (!(lengthRatio >= 0.8 && lengthRatio <= 1.2)) {
    return {
      accepted: false,
      reason: 'inferred-bullet-corridor-does-not-match-logged-speed',
      bulletId,
      inferredLengthCm,
      expectedTravelCm,
      lengthRatio
    };
  }
  const ux = (hitPoint.x - bulletStart.x) / inferredLengthCm;
  const uy = (hitPoint.y - bulletStart.y) / inferredLengthCm;
  let actualMinClearanceCm = Infinity;
  let actualMinTick = null;
  for (const frame of frames.slice(startIndex, hitIndex + 1)) {
    const elapsedTicks = Number(frame.tick) - startTick;
    const bulletPoint = {
      x: bulletStart.x + ux * bulletSpeed * elapsedTicks,
      y: bulletStart.y + uy * bulletSpeed * elapsedTicks
    };
    const clearance = pointDistance(frame.self, bulletPoint);
    if (clearance < actualMinClearanceCm) {
      actualMinClearanceCm = clearance;
      actualMinTick = Number(frame.tick);
    }
  }
  const direction = options.direction
    ? parseDirection(options.direction)
    : {
        dx: Math.sign(Number(start.movement?.dx || 0)),
        dy: Math.sign(Number(start.movement?.dy || 0))
      };
  if (!direction.dx && !direction.dy) return { accepted: false, reason: 'held-direction-is-stop', bulletId };
  const directionLength = Math.hypot(direction.dx, direction.dy);
  const heldVelocity = {
    vx: direction.dx / directionLength * options.moveSpeedPerTick,
    vy: direction.dy / directionLength * options.moveSpeedPerTick
  };
  const initialVelocity = {
    vx: Number(start.self?.vx || 0),
    vy: Number(start.self?.vy || 0)
  };
  const commandDelayTicks = Math.max(0, Number(options.commandDelayTicks || 0));
  const sampleStepTicks = 0.05;
  let heldMinClearanceCm = Infinity;
  let heldMinElapsedTicks = null;
  for (let elapsedTicks = 0; elapsedTicks <= hitTicks; elapsedTicks += sampleStepTicks) {
    const beforeDelay = Math.min(elapsedTicks, commandDelayTicks);
    const afterDelay = Math.max(0, elapsedTicks - commandDelayTicks);
    const selfPoint = {
      x: initialSelf.x + initialVelocity.vx * beforeDelay + heldVelocity.vx * afterDelay,
      y: initialSelf.y + initialVelocity.vy * beforeDelay + heldVelocity.vy * afterDelay
    };
    const bulletPoint = {
      x: bulletStart.x + ux * bulletSpeed * elapsedTicks,
      y: bulletStart.y + uy * bulletSpeed * elapsedTicks
    };
    const clearance = pointDistance(selfPoint, bulletPoint);
    if (clearance < heldMinClearanceCm) {
      heldMinClearanceCm = clearance;
      heldMinElapsedTicks = elapsedTicks;
    }
  }
  const hitRadiusCm = Math.max(1, Number(options.hitRadiusCm || DEFAULT_HIT_RADIUS_CM));
  const criteria = {
    loggedPathCollides: actualMinClearanceCm < hitRadiusCm,
    heldPathClears: heldMinClearanceCm >= hitRadiusCm,
    heldPathImprovesClearance: heldMinClearanceCm > actualMinClearanceCm
  };
  const accepted = Object.values(criteria).every(Boolean);
  return {
    accepted,
    reason: accepted ? 'held-safe-lane-clears-logged-impact' : 'held-lane-criteria-not-met',
    file: options.file,
    bulletId,
    startLine: start.line,
    hitLine: hit.line,
    startTick,
    hitTick,
    createdTick,
    direction,
    commandDelayTicks,
    inferredStart: bulletStart,
    inferredHitPoint: hitPoint,
    inferredLengthCm,
    expectedTravelCm,
    lengthRatio,
    actualMinClearanceCm,
    actualMinTick,
    heldMinClearanceCm,
    heldMinTick: startTick + heldMinElapsedTicks,
    hitRadiusCm,
    hpLoss: initialHp === null ? null : initialHp - Number(hit.self.hp),
    criteria
  };
}

function selfTest() {
  const frames = [];
  for (let tick = 100; tick <= 110; tick += 1) {
    frames.push({
      line: tick - 99,
      tick,
      self: { x: 1000, y: 0, vx: 0, vy: 0, hp: tick < 110 ? 100 : 97 },
      target: { x: 0, y: 0 },
      movement: {
        dx: 0,
        dy: 1,
        dodge: {
          threatField: [{
            dangerousBullets: [{ bulletId: 'fixture', createdTick: 100, speed: 100 }]
          }]
        }
      }
    });
  }
  const result = evaluateFrames(frames, {
    file: 'fixture',
    bulletId: 'fixture',
    direction: '0,1',
    commandDelayTicks: 0,
    moveSpeedPerTick: 50,
    hitRadiusCm: 90
  });
  if (!result.accepted || !result.criteria.loggedPathCollides || !result.criteria.heldPathClears) {
    throw new Error('dodge lane hold replay self-test failed: ' + JSON.stringify(result));
  }
  console.log(JSON.stringify({ ok: true, result }, null, 2));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.selfTest) {
    selfTest();
    return;
  }
  const frames = await readCombatFrames(options);
  const result = evaluateFrames(frames, options);
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`Dodge lane hold replay: ${result.accepted ? 'accepted' : 'rejected'}`);
    console.log(`Bullet #${result.bulletId || '-'}, ticks ${result.startTick ?? '-'}-${result.hitTick ?? '-'}, held=${result.direction?.dx ?? '-'},${result.direction?.dy ?? '-'}`);
    if (Number.isFinite(result.actualMinClearanceCm)) {
      console.log(`Logged path minimum clearance ${result.actualMinClearanceCm.toFixed(1)}cm at tick ${result.actualMinTick}; held lane ${result.heldMinClearanceCm.toFixed(1)}cm at tick ${result.heldMinTick}; hit radius ${result.hitRadiusCm}cm`);
    }
    if (result.reason && !result.accepted) console.log(`Reason: ${result.reason}`);
  }
  if (!result.accepted) process.exitCode = 1;
}

if (require.main === module) {
  main().catch(error => {
    console.error(error?.stack || error?.message || String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  evaluateFrames,
  parseDirection,
  readCombatFrames
};
