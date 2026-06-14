#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  hitRadiusCm: 90,
  tickMs: 50,
  bulletSpeedPerTick: 500,
  bulletTtlMs: 1500,
  liveDivergencePrecisionCm: 1200,
  liveDivergencePrecisionRatio: 0.08,
  fallbackPrecisionNoDamageMs: 25000,
  serverStallNoDamageLeaveMs: 25000,
  serverStallNoDamagePrecisionGraceMs: 10000,
  serverStallNoDamageHpGap: 5
};

function parseArgs(argv) {
  const options = {
    file: '',
    startLine: 0,
    endLine: 0,
    selfId: '',
    targetId: '',
    targetName: '',
    json: false,
    selfTest: false,
    ...DEFAULTS
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--file') options.file = argv[++i] || '';
    else if (arg === '--start-line') options.startLine = Number(argv[++i] || 0);
    else if (arg === '--end-line') options.endLine = Number(argv[++i] || 0);
    else if (arg === '--self-id') options.selfId = String(argv[++i] || '');
    else if (arg === '--target-id') options.targetId = String(argv[++i] || '');
    else if (arg === '--target-name') options.targetName = String(argv[++i] || '');
    else if (arg === '--hit-radius') options.hitRadiusCm = Number(argv[++i] || options.hitRadiusCm);
    else if (arg === '--json') options.json = true;
    else if (arg === '--self-test') options.selfTest = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function printHelp() {
  console.log(`Usage: node replay-combat.js --file <jsonl> --start-line <n> --end-line <n> [options]

Options:
  --self-id <id>       Own user id. Defaults to first frame self id.
  --target-id <id>     Enemy user id.
  --target-name <name> Enemy name fallback when id is unavailable.
  --hit-radius <cm>    Bullet hit radius estimate. Default: ${DEFAULTS.hitRadiusCm}
  --json               Print JSON instead of a compact text report.
  --self-test          Replay the 2026-06-14 xmsthc reference fight and require improvement.
`);
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function pointOf(value) {
  const x = numberOrNull(value?.x);
  const y = numberOrNull(value?.y);
  return x === null || y === null ? null : { x, y };
}

function distance(a, b) {
  return Math.hypot(Number(a.x) - Number(b.x), Number(a.y) - Number(b.y));
}

function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y };
}

function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y };
}

function mul(a, scale) {
  return { x: a.x * scale, y: a.y * scale };
}

function unit(v) {
  const d = Math.hypot(v.x, v.y);
  return d > 0 ? { x: v.x / d, y: v.y / d } : null;
}

function sameTarget(entity, options) {
  if (!entity) return false;
  const id = entity.id ?? entity.user_id;
  if (options.targetId && id !== null && id !== undefined && String(id) === options.targetId) return true;
  return Boolean(options.targetName && String(entity.name || '') === options.targetName);
}

function findNearbyTarget(entry, options) {
  return (entry.nearbyEntities || []).find(entity => sameTarget(entity, options)) || null;
}

function targetFromEntry(entry, options) {
  const direct = entry.target || entry.decision?.target || null;
  if (sameTarget(direct, options)) return direct;
  return direct || null;
}

function targetHp(frame) {
  return numberOrNull(frame.target?.hp ?? frame.entry?.decision?.target?.hp ?? frame.nearbyTarget?.hp);
}

function selfHp(frame) {
  return numberOrNull(frame.self?.hp ?? frame.entry?.decision?.self?.hp);
}

function incomingRealBullet(frame) {
  const incoming = frame.entry?.incomingBullet || frame.entry?.decision?.incomingBullet || null;
  return Boolean(incoming && !incoming.synthetic);
}

function serverStalled(frame) {
  const stall = frame.entry?.control?.serverPositionStall || frame.entry?.combatMetrics?.serverPositionStall || null;
  return Boolean(stall?.stalled);
}

function noDamageMs(frame) {
  return numberOrNull(
    frame.entry?.aimTarget?.noDamageMs
      ?? frame.entry?.combatState?.aim?.noDamageMs
      ?? frame.entry?.combatMetrics?.damage?.noTargetDamageMs
      ?? frame.entry?.combatMetrics?.damage?.lastTargetDamageAgeMs
  ) || 0;
}

function interpolate(samples, t) {
  if (!samples.length || t < samples[0].at || t > samples[samples.length - 1].at) return null;
  let lo = 0;
  let hi = samples.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].at <= t) lo = mid;
    else hi = mid;
  }
  const a = samples[lo];
  const b = samples[Math.min(lo + 1, samples.length - 1)];
  if (!b || b.at === a.at) return { x: a.x, y: a.y };
  const ratio = (t - a.at) / (b.at - a.at);
  return {
    x: a.x + (b.x - a.x) * ratio,
    y: a.y + (b.y - a.y) * ratio
  };
}

function samplesFromFrames(frames, key) {
  return frames
    .map(frame => {
      const point = frame[key];
      return point ? { at: frame.at, x: point.x, y: point.y } : null;
    })
    .filter(Boolean);
}

function loadFrames(options) {
  if (!options.file) throw new Error('--file is required');
  const filePath = path.resolve(options.file);
  const lines = fs.readFileSync(filePath, 'utf8').split(/\n/);
  const start = Math.max(1, Number(options.startLine || 1));
  const end = Math.min(lines.length, Number(options.endLine || lines.length));
  const frames = [];
  let inferredSelfId = options.selfId;
  let inferredTargetId = options.targetId;
  let inferredTargetName = options.targetName;

  for (let lineNo = start; lineNo <= end; lineNo += 1) {
    const raw = lines[lineNo - 1];
    if (!raw || !raw.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(raw);
    } catch (_) {
      continue;
    }
    if (entry.type !== 'combat-frame') continue;
    const self = entry.self || entry.decision?.self || null;
    if (!inferredSelfId && (self?.id ?? self?.user_id) !== undefined) inferredSelfId = String(self.id ?? self.user_id);
    const target = targetFromEntry(entry, { targetId: inferredTargetId, targetName: inferredTargetName });
    if (!inferredTargetId && (target?.id ?? target?.user_id) !== undefined) inferredTargetId = String(target.id ?? target.user_id);
    if (!inferredTargetName && target?.name) inferredTargetName = String(target.name);
    const matchOptions = { ...options, selfId: inferredSelfId, targetId: inferredTargetId, targetName: inferredTargetName };
    const nearbyTarget = findNearbyTarget(entry, matchOptions);
    const frame = {
      lineNo,
      entry,
      at: Number(entry.at),
      self: pointOf(self),
      decisionTarget: pointOf(target),
      nearbyTarget: pointOf(nearbyTarget),
      target,
      nearbyEntity: nearbyTarget,
      aim: pointOf(entry.aimTarget || entry.combatState?.aim),
      selfHp: null,
      targetHp: null,
      noDamageMs: 0
    };
    frame.selfHp = selfHp(frame);
    frame.targetHp = targetHp(frame);
    frame.noDamageMs = noDamageMs(frame);
    frames.push(frame);
  }
  if (!frames.length) throw new Error('no combat-frame entries matched the selected line range');
  return {
    file: filePath,
    frames,
    selfId: inferredSelfId || options.selfId,
    targetId: inferredTargetId || options.targetId,
    targetName: inferredTargetName || options.targetName
  };
}

function collectShots(frames, selfId) {
  const seen = new Set();
  const shots = [];
  for (const frame of frames) {
    for (const bullet of frame.entry.bullets || []) {
      const owner = bullet.ownerId ?? bullet.owner_id ?? bullet.source_user_id ?? bullet.user_id;
      if (selfId && String(owner) !== String(selfId)) continue;
      const id = String(bullet.id ?? `${frame.lineNo}:${shots.length}`);
      if (seen.has(id)) continue;
      seen.add(id);
      shots.push({ id, frame, bullet });
    }
  }
  return shots.sort((a, b) => a.frame.at - b.frame.at);
}

function minDistanceForShot(origin, aim, targetSamples, shotAt, options) {
  if (!origin || !aim || !targetSamples.length) return { hit: false, min: Infinity, minAt: null };
  const dir = unit(sub(aim, origin));
  if (!dir) return { hit: false, min: Infinity, minAt: null };
  const speedPerMs = options.bulletSpeedPerTick / options.tickMs;
  let min = Infinity;
  let minAt = null;
  for (let dt = 0; dt <= options.bulletTtlMs; dt += 25) {
    const t = shotAt + dt;
    const target = interpolate(targetSamples, t);
    if (!target) continue;
    const bullet = add(origin, mul(dir, speedPerMs * dt));
    const d = distance(bullet, target);
    if (d < min) {
      min = d;
      minAt = t;
    }
  }
  return { hit: min <= options.hitRadiusCm, min, minAt };
}

function runAimScenario(label, shots, aimForShot, targetSamples, options, filterShot = () => true) {
  let considered = 0;
  let hits = 0;
  let minDistance = Infinity;
  let firstHit = null;
  for (const shot of shots) {
    const frame = shot.frame;
    if (!filterShot(shot)) continue;
    const origin = frame.self;
    const aim = aimForShot(shot);
    const result = minDistanceForShot(origin, aim, targetSamples, frame.at, options);
    considered += 1;
    if (result.min < minDistance) minDistance = result.min;
    if (result.hit) {
      hits += 1;
      if (!firstHit) {
        firstHit = {
          line: frame.lineNo,
          time: formatTime(frame.at),
          noDamageMs: Math.round(frame.noDamageMs),
          minDistanceCm: Math.round(result.min)
        };
      }
    }
  }
  return {
    label,
    considered,
    hits,
    minDistanceCm: Number.isFinite(minDistance) ? Math.round(minDistance) : null,
    firstHit
  };
}

function runActualBulletScenario(shots, targetSamples, options) {
  let considered = 0;
  let hits = 0;
  let minDistance = Infinity;
  let firstHit = null;
  for (const shot of shots) {
    const origin = pointOf(shot.bullet);
    const vx = numberOrNull(shot.bullet.vx);
    const vy = numberOrNull(shot.bullet.vy);
    if (!origin || vx === null || vy === null) continue;
    let localMin = Infinity;
    for (let dt = 0; dt <= options.bulletTtlMs; dt += 25) {
      const target = interpolate(targetSamples, shot.frame.at + dt);
      if (!target) continue;
      const bullet = {
        x: origin.x + (vx / options.tickMs) * dt,
        y: origin.y + (vy / options.tickMs) * dt
      };
      const d = distance(bullet, target);
      if (d < localMin) localMin = d;
    }
    considered += 1;
    if (localMin < minDistance) minDistance = localMin;
    if (localMin <= options.hitRadiusCm) {
      hits += 1;
      if (!firstHit) {
        firstHit = {
          line: shot.frame.lineNo,
          time: formatTime(shot.frame.at),
          noDamageMs: Math.round(shot.frame.noDamageMs),
          minDistanceCm: Math.round(localMin)
        };
      }
    }
  }
  return {
    label: 'actual bullet vectors vs live target',
    considered,
    hits,
    minDistanceCm: Number.isFinite(minDistance) ? Math.round(minDistance) : null,
    firstHit
  };
}

function liveDivergenceState(frame, options) {
  if (!frame.nearbyTarget || !frame.decisionTarget) {
    return { active: false, divergenceCm: null, thresholdCm: null };
  }
  const liveDistance = frame.self && frame.nearbyTarget ? distance(frame.self, frame.nearbyTarget) : 0;
  const divergence = distance(frame.nearbyTarget, frame.decisionTarget);
  const threshold = Math.max(
    Number(options.liveDivergencePrecisionCm || 0),
    Math.round(liveDistance * Number(options.liveDivergencePrecisionRatio || 0))
  );
  return {
    active: threshold > 0 && divergence >= threshold,
    divergenceCm: Math.round(divergence),
    thresholdCm: Math.round(threshold)
  };
}

function dynamicAimForShot(shot, options) {
  const frame = shot.frame;
  const live = frame.nearbyTarget;
  const divergence = liveDivergenceState(frame, options);
  const fallback = frame.noDamageMs >= options.fallbackPrecisionNoDamageMs;
  const stallLive = Boolean(live && serverStalled(frame));
  if (live && (divergence.active || stallLive || fallback)) return live;
  return frame.aim || frame.decisionTarget || live;
}

function findExitFrame(frames, waitMs, options) {
  return frames.find(frame => {
    const hp = frame.selfHp;
    const enemyHp = frame.targetHp;
    const hpGap = Number(enemyHp) - Number(hp);
    return frame.noDamageMs >= waitMs
      && Number.isFinite(hpGap)
      && hpGap >= options.serverStallNoDamageHpGap
      && serverStalled(frame)
      && incomingRealBullet(frame);
  }) || null;
}

function formatTime(ms) {
  return new Date(ms).toLocaleTimeString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' });
}

function replay(options) {
  const loaded = loadFrames(options);
  const frames = loaded.frames;
  const selfSamples = samplesFromFrames(frames, 'self');
  const decisionSamples = samplesFromFrames(frames, 'decisionTarget');
  const liveSamples = samplesFromFrames(frames, 'nearbyTarget');
  const targetSamples = liveSamples.length ? liveSamples : decisionSamples;
  const shots = collectShots(frames, loaded.selfId);
  const oldExitFrame = findExitFrame(frames, options.serverStallNoDamageLeaveMs, options);
  const graceWaitMs = Math.max(
    options.serverStallNoDamageLeaveMs,
    options.fallbackPrecisionNoDamageMs + options.serverStallNoDamagePrecisionGraceMs
  );
  const graceExitFrame = findExitFrame(frames, graceWaitMs, options);
  const precisionStartFrame = frames.find(frame => liveDivergenceState(frame, options).active)
    || frames.find(frame => frame.noDamageMs >= options.fallbackPrecisionNoDamageMs)
    || null;

  const scenarios = [
    runActualBulletScenario(shots, targetSamples, options),
    runAimScenario('logged aimTarget vs live target', shots, shot => shot.frame.aim, targetSamples, options),
    runAimScenario('exact decision.target vs decision trajectory', shots, shot => shot.frame.decisionTarget, decisionSamples, options),
    runAimScenario('exact decision.target vs live target', shots, shot => shot.frame.decisionTarget, targetSamples, options),
    runAimScenario('exact live target vs live target', shots, shot => shot.frame.nearbyTarget, targetSamples, options),
    runAimScenario('old effective logged aim before server-stall exit', shots, shot => shot.frame.aim, targetSamples, options, shot => !oldExitFrame || shot.frame.at < oldExitFrame.at),
    runAimScenario('dynamic strategy vs live target', shots, shot => dynamicAimForShot(shot, options), targetSamples, options),
    runAimScenario('dynamic strategy before grace exit', shots, shot => dynamicAimForShot(shot, options), targetSamples, options, shot => !graceExitFrame || shot.frame.at < graceExitFrame.at)
  ];

  const divergences = frames
    .map(frame => liveDivergenceState(frame, options).divergenceCm)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const targetHpValues = Array.from(new Set(frames.map(frame => frame.targetHp).filter(Number.isFinite))).sort((a, b) => a - b);
  return {
    file: loaded.file,
    lineRange: [frames[0].lineNo, frames[frames.length - 1].lineNo],
    timeRange: [formatTime(frames[0].at), formatTime(frames[frames.length - 1].at)],
    selfId: loaded.selfId,
    targetId: loaded.targetId,
    targetName: loaded.targetName,
    frames: frames.length,
    shots: shots.length,
    selfHp: [frames[0].selfHp, frames[frames.length - 1].selfHp],
    targetHpValues,
    coordinateDivergence: {
      samples: divergences.length,
      over10m: divergences.filter(value => value > 1000).length,
      over50m: divergences.filter(value => value > 5000).length,
      medianCm: divergences.length ? divergences[Math.floor(divergences.length / 2)] : null,
      maxCm: divergences.length ? divergences[divergences.length - 1] : null
    },
    dynamicStart: precisionStartFrame ? {
      line: precisionStartFrame.lineNo,
      time: formatTime(precisionStartFrame.at),
      noDamageMs: Math.round(precisionStartFrame.noDamageMs),
      divergence: liveDivergenceState(precisionStartFrame, options)
    } : null,
    oldServerStallExit: oldExitFrame ? {
      line: oldExitFrame.lineNo,
      time: formatTime(oldExitFrame.at),
      noDamageMs: Math.round(oldExitFrame.noDamageMs),
      selfHp: oldExitFrame.selfHp,
      targetHp: oldExitFrame.targetHp
    } : null,
    graceExitIfStillNoHit: graceExitFrame ? {
      line: graceExitFrame.lineNo,
      time: formatTime(graceExitFrame.at),
      noDamageMs: Math.round(graceExitFrame.noDamageMs),
      selfHp: graceExitFrame.selfHp,
      targetHp: graceExitFrame.targetHp
    } : null,
    scenarios
  };
}

function printReport(result) {
  console.log(`Replay ${path.relative(process.cwd(), result.file)} lines ${result.lineRange[0]}-${result.lineRange[1]}`);
  console.log(`Target ${result.targetName || '-'} (${result.targetId || '-'}) ${result.timeRange[0]}-${result.timeRange[1]}, frames=${result.frames}, shots=${result.shots}`);
  console.log(`HP self ${result.selfHp[0]} -> ${result.selfHp[1]}, target HP values ${result.targetHpValues.join(',') || '-'}`);
  console.log(`Coordinate divergence median=${result.coordinateDivergence.medianCm}cm max=${result.coordinateDivergence.maxCm}cm over10m=${result.coordinateDivergence.over10m}/${result.coordinateDivergence.samples}`);
  if (result.dynamicStart) {
    console.log(`Dynamic precision starts line ${result.dynamicStart.line} at ${result.dynamicStart.time}, reason=${result.dynamicStart.divergence.active ? 'coordinate-divergence' : 'fallback'}, noDamage=${result.dynamicStart.noDamageMs}ms`);
  }
  if (result.oldServerStallExit) {
    console.log(`Old server-stall exit line ${result.oldServerStallExit.line} at ${result.oldServerStallExit.time}, HP ${result.oldServerStallExit.selfHp}/${result.oldServerStallExit.targetHp}`);
  }
  if (result.graceExitIfStillNoHit) {
    console.log(`Grace exit if still no hit line ${result.graceExitIfStillNoHit.line} at ${result.graceExitIfStillNoHit.time}, HP ${result.graceExitIfStillNoHit.selfHp}/${result.graceExitIfStillNoHit.targetHp}`);
  }
  for (const item of result.scenarios) {
    const first = item.firstHit ? ` firstHit=line ${item.firstHit.line} ${item.firstHit.time} min=${item.firstHit.minDistanceCm}cm` : '';
    console.log(`- ${item.label}: hits=${item.hits}/${item.considered}, min=${item.minDistanceCm}cm${first}`);
  }
}

function selfTest() {
  const file = path.join(__dirname, 'logs/2026-06-14/-_-_-_-.jsonl');
  const result = replay({
    ...DEFAULTS,
    file,
    startLine: 12167,
    endLine: 12351,
    selfId: '28886',
    targetId: '20606',
    targetName: 'xmsthc'
  });
  const logged = result.scenarios.find(item => item.label === 'logged aimTarget vs live target');
  const dynamic = result.scenarios.find(item => item.label === 'dynamic strategy vs live target');
  const dynamicGrace = result.scenarios.find(item => item.label === 'dynamic strategy before grace exit');
  if (!logged || !dynamic || !dynamicGrace) throw new Error('missing replay scenarios');
  if (!(dynamic.hits > logged.hits)) throw new Error(`dynamic replay did not improve hits: ${dynamic.hits} <= ${logged.hits}`);
  if (!(dynamicGrace.hits > 0)) throw new Error('dynamic replay has no hits before grace exit');
  console.log(JSON.stringify({ ok: true, loggedHits: logged.hits, dynamicHits: dynamic.hits, dynamicGraceHits: dynamicGrace.hits }, null, 2));
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.selfTest) {
    selfTest();
    return;
  }
  const result = replay(options);
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else printReport(result);
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(err?.stack || err?.message || String(err));
    process.exit(1);
  }
}

module.exports = { replay, DEFAULTS };
