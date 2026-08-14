#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const {
  buildLinearMotionFeatures,
  createEvasiveAimModel,
  predictEvasiveAimAngles
} = require('../src/strategy/evasive-aim-experiment');
const { estimateAim } = require('../src/node/browserless/combat-adapter');

const BULLET_SPEED_CM_PER_TICK = 500;
const BULLET_LIFETIME_TICKS = 30;
const HIT_RADIUS_CM = 90;
const MAXIMUM_CREATION_DISTANCE_CM = 5500;
const DEGREE = Math.PI / 180;
const EXPECTED = Object.freeze({
  shots: 685,
  baseline: 15,
  linear: 60,
  knn: 52,
  fusion: 52,
  alternating: 58,
  router: 56
});
const FROZEN_FILES = Object.freeze([
  '/var/log/grasp-rat-browserless/2026-08-13/battles/32551_1786604184184.jsonl.gz',
  '/var/log/grasp-rat-browserless/2026-08-13/battles/32551_1786607731629.jsonl.gz',
  '/var/log/grasp-rat-browserless/2026-08-13/battles/32551_1786612475853.jsonl.gz',
  '/var/log/grasp-rat-browserless/2026-08-13/battles/32551_1786612959399.jsonl.gz',
  '/var/log/grasp-rat-browserless/2026-08-13/battles/32551_1786613177870.jsonl.gz',
  '/var/log/grasp-rat-browserless/2026-08-13/battles/32551_1786615294088.jsonl.gz',
  '/var/log/grasp-rat-browserless/2026-08-14/battles/32551_1786637125076.jsonl.gz',
  '/var/log/grasp-rat-browserless/2026-08-14/battles/32551_1786638151057.jsonl.gz',
  '/var/log/grasp-rat-browserless/2026-08-14/battles/32551_1786639475334.jsonl.gz',
  '/var/log/grasp-rat-browserless/2026-08-14/battles/32551_1786639953554.jsonl.gz'
]);

function parseArgs(argv) {
  const options = {
    json: false,
    linearScoreDump: '',
    knnScoreDump: ''
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--json') options.json = true;
    else if (argument === '--linear-score-dump') options.linearScoreDump = String(argv[++index] || '');
    else if (argument === '--knn-score-dump') options.knnScoreDump = String(argv[++index] || '');
    else if (argument === '--help' || argument === '-h') options.help = true;
    else throw new Error(`unknown argument: ${argument}`);
  }
  return options;
}

function usage() {
  return [
    'Usage: node scripts/verify-evasive-aim-model.js [options]',
    '',
    'Replays the frozen 685-shot post-training validation set through the production model.',
    '',
    'Options:',
    '  --linear-score-dump <file>  Optional offline linear score dump for exact feature/angle parity',
    '  --knn-score-dump <file>     Optional offline KNN score dump for exact candidate-angle parity',
    '  --json                      Print JSON only'
  ].join('\n');
}

function loadRows(file) {
  return zlib.gunzipSync(fs.readFileSync(file))
    .toString('utf8')
    .split(/\n/)
    .filter(Boolean)
    .map(JSON.parse);
}

function combatFrames(rows) {
  return rows.filter(row => row.type === 'combat-live'
    && Number.isFinite(Number(row.detail?.tick))
    && row.detail?.self
    && row.detail?.target)
    .map(row => ({
      tick: Number(row.detail.tick),
      atMs: Date.parse(row.at),
      timing: row.detail.timing || {},
      self: row.detail.self,
      target: row.detail.target
    }))
    .sort((left, right) => left.tick - right.tick);
}

function acceptedShots(rows) {
  const byBullet = new Map();
  for (const row of rows) {
    if (row.type !== 'shoot-execution'
      || !['shoot-ack-accepted', 'shoot-ack-late'].includes(row.detail?.type)
      || !row.detail?.ack) continue;
    const bulletId = String(row.detail.ack.bullet_id || '');
    if (bulletId && !byBullet.has(bulletId)) byBullet.set(bulletId, row.detail.ack);
  }
  return Array.from(byBullet.values()).sort((left, right) => (
    Number(left.created_tick) - Number(right.created_tick)
  ));
}

function entityAt(frames, tick, key) {
  let low = 0;
  let high = frames.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (frames[middle].tick < tick) low = middle + 1;
    else high = middle;
  }
  const after = frames[low];
  const before = frames[low - 1];
  if (after && after.tick === tick) return after[key];
  if (!before) return after?.[key] || null;
  if (!after || after.tick === before.tick) return before[key];
  const ratio = (tick - before.tick) / (after.tick - before.tick);
  return {
    x: Number(before[key].x) + (Number(after[key].x) - Number(before[key].x)) * ratio,
    y: Number(before[key].y) + (Number(after[key].y) - Number(before[key].y)) * ratio,
    vx: Number(before[key].vx) || 0,
    vy: Number(before[key].vy) || 0
  };
}

function intercept(origin, target, velocity) {
  const relativeX = target.x - origin.x;
  const relativeY = target.y - origin.y;
  const a = velocity.vx ** 2 + velocity.vy ** 2 - BULLET_SPEED_CM_PER_TICK ** 2;
  const b = 2 * (relativeX * velocity.vx + relativeY * velocity.vy);
  const c = relativeX ** 2 + relativeY ** 2;
  const roots = [];
  if (Math.abs(a) < 1e-9) {
    if (Math.abs(b) > 1e-9) roots.push(-c / b);
  } else {
    const discriminant = b ** 2 - 4 * a * c;
    if (discriminant >= 0) {
      const root = Math.sqrt(discriminant);
      roots.push((-b - root) / (2 * a), (-b + root) / (2 * a));
    }
  }
  const flightTicks = roots
    .filter(value => Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right)[0]
    || Math.hypot(relativeX, relativeY) / BULLET_SPEED_CM_PER_TICK;
  return {
    x: target.x + velocity.vx * flightTicks,
    y: target.y + velocity.vy * flightTicks,
    flightTicks
  };
}

function motionSamplesThrough(frames, observedTick) {
  const samples = [];
  for (const frame of frames) {
    if (frame.tick > observedTick) break;
    samples.push({
      tick: frame.tick,
      at: frame.atMs,
      x: Number(frame.target.x),
      y: Number(frame.target.y),
      vx: Number(frame.target.vx) || 0,
      vy: Number(frame.target.vy) || 0,
      selfX: Number(frame.self.x),
      selfY: Number(frame.self.y),
      selfVx: Number(frame.self.vx) || 0,
      selfVy: Number(frame.self.vy) || 0
    });
  }
  return samples;
}

function minimumMissCm(sample, offsetDeg) {
  const aimAngle = sample.baselineAngle + offsetDeg * DEGREE;
  const aim = {
    x: sample.featureOrigin.x + Math.cos(aimAngle) * sample.baselineDistance,
    y: sample.featureOrigin.y + Math.sin(aimAngle) * sample.baselineDistance
  };
  const wireLength = Math.hypot(
    aim.x - sample.actualOrigin.x,
    aim.y - sample.actualOrigin.y
  );
  if (!(wireLength > 0)) return Infinity;
  const directionX = (aim.x - sample.actualOrigin.x) / wireLength;
  const directionY = (aim.y - sample.actualOrigin.y) / wireLength;
  let minimum = Infinity;
  for (let elapsed = 1; elapsed <= BULLET_LIFETIME_TICKS; elapsed += 1) {
    const target = entityAt(sample.frames, sample.createdTick + elapsed, 'target');
    if (!target) continue;
    minimum = Math.min(minimum, Math.hypot(
      sample.actualOrigin.x + directionX * BULLET_SPEED_CM_PER_TICK * elapsed - Number(target.x),
      sample.actualOrigin.y + directionY * BULLET_SPEED_CM_PER_TICK * elapsed - Number(target.y)
    ));
  }
  return minimum;
}

function scoreReferenceKey(file, createdTick) {
  const day = path.basename(path.dirname(path.dirname(file)));
  const name = path.basename(file);
  return day === '2026-08-14' ? `${day}/${name}:${createdTick}` : `${name}:${createdTick}`;
}

function choose(scores, angles, maximumDegree, penalty = 0, baselineBoost = 0) {
  let selected = Math.max(0, angles.indexOf(0));
  let selectedScore = -Infinity;
  for (let index = 0; index < scores.length; index += 1) {
    const angle = Number(angles[index]);
    if (Math.abs(angle) > maximumDegree + 1e-9) continue;
    const score = Number(scores[index])
      - penalty * angle ** 2
      + (angle === 0 ? baselineBoost : 0);
    if (score > selectedScore) {
      selected = index;
      selectedScore = score;
    }
  }
  return selected;
}

function topTwo(scores, angles, maximumDegree, penalty) {
  const ranked = scores.map((score, index) => ({
    index,
    score: Number(score) - penalty * Number(angles[index]) ** 2
  })).filter(item => Math.abs(Number(angles[item.index])) <= maximumDegree + 1e-9)
    .sort((left, right) => right.score - left.score);
  return {
    first: ranked[0].index,
    second: ranked[1].index,
    margin: ranked[0].score - ranked[1].score
  };
}

function normalize(scores) {
  const mean = scores.reduce((sum, value) => sum + Number(value), 0) / scores.length;
  const variance = scores.reduce((sum, value) => sum + (Number(value) - mean) ** 2, 0) / scores.length;
  const deviation = Math.sqrt(Math.max(variance, 1e-12));
  const minimum = Math.min(...scores);
  const maximum = Math.max(...scores);
  const range = Math.max(1e-12, maximum - minimum);
  return {
    maximum,
    deviation,
    z: scores.map(value => (Number(value) - mean) / deviation),
    minmax: scores.map(value => (Number(value) - minimum) / range)
  };
}

function expectedAnglesFromDumps(model, linearDump, knnDump, linearRow, knnRow) {
  const angles = model.angleGridDegrees;
  const linearIndex = new Map(linearDump.angleGridDegrees.map((angle, index) => [String(angle), index]));
  const linearScores = angles.map(angle => linearRow.scores[linearIndex.get(String(angle))]);
  const knnScores = knnRow.scores;
  const linearTop = topTwo(linearScores, angles, model.linear.maximumDegree, model.linear.penalty);
  const knnTop = topTwo(knnScores, angles, model.knn.maximumDegree, model.knn.penalty);
  const disagreementDeg = Math.abs(angles[linearTop.first] - angles[knnTop.first]);
  const fusionAngleDeg = selectedFusionAngleFromReference(
    model,
    { angleGridDegrees: angles },
    { angleGridDegrees: angles },
    { scores: linearScores },
    { scores: knnScores }
  );
  const linearNorm = normalize(linearScores);
  const knnNorm = normalize(knnScores);
  const zeroIndex = angles.indexOf(0);
  const routerFeatures = [
    angles[linearTop.first] / 8,
    angles[knnTop.first] / 8,
    Math.abs(angles[linearTop.first]) / 8,
    Math.abs(angles[knnTop.first]) / 8,
    disagreementDeg / 8,
    angles[linearTop.first] * angles[knnTop.first] / 64,
    linearTop.margin,
    knnTop.margin,
    linearNorm.maximum,
    knnNorm.maximum,
    linearNorm.deviation,
    knnNorm.deviation,
    linearNorm.minmax[linearTop.first],
    knnNorm.minmax[knnTop.first],
    linearNorm.minmax[knnTop.first],
    knnNorm.minmax[linearTop.first],
    linearNorm.z[linearTop.first],
    knnNorm.z[knnTop.first],
    linearNorm.z[knnTop.first],
    knnNorm.z[linearTop.first],
    linearScores[linearTop.first],
    knnScores[knnTop.first],
    linearScores[knnTop.first],
    knnScores[linearTop.first],
    linearScores[zeroIndex],
    knnScores[zeroIndex]
  ];
  let node = model.router.tree;
  while (node && node.feature !== undefined) {
    node = routerFeatures[node.feature] <= node.threshold ? node.left : node.right;
  }
  const routerCandidates = [zeroIndex, linearTop.first, knnTop.first];
  let routerClass = 0;
  let routerScore = -Infinity;
  for (let candidateClass = 0; candidateClass < routerCandidates.length; candidateClass += 1) {
    const angle = angles[routerCandidates[candidateClass]];
    const score = Number(node?.prediction?.[candidateClass] || 0)
      - model.router.options.anglePenalty * angle ** 2
      + (candidateClass === 0 ? model.router.options.baselineBoost : 0);
    if (score > routerScore) {
      routerClass = candidateClass;
      routerScore = score;
    }
  }
  return {
    linearAngleDeg: angles[linearTop.first],
    knnAngleDeg: angles[knnTop.first],
    fusionAngleDeg,
    routerAngleDeg: angles[routerCandidates[routerClass]],
    disagreementDeg
  };
}

function selectedLinearAngleFromReference(model, linearDump, linearRow) {
  const commonLinearScores = model.angleGridDegrees.map(angle => (
    linearRow.scores[linearDump.angleGridDegrees.indexOf(angle)]
  ));
  return model.angleGridDegrees[choose(
    commonLinearScores,
    model.angleGridDegrees,
    model.linear.maximumDegree,
    model.linear.penalty,
    model.linear.baselineBoost
  )];
}

function selectedFusionAngleFromReference(model, linearDump, knnDump, linearRow, knnRow) {
  const angles = model.angleGridDegrees;
  const linearIndex = new Map(linearDump.angleGridDegrees.map((angle, index) => [String(angle), index]));
  const linearScores = angles.map(angle => linearRow.scores[linearIndex.get(String(angle))]);
  const knnScores = knnRow.scores;
  const linearIndexForFusion = choose(
    linearScores,
    angles,
    model.fusion.maximumDegree,
    model.fusion.linearPenalty
  );
  const knnIndexForFusion = choose(
    knnScores,
    angles,
    model.fusion.maximumDegree,
    model.fusion.knnPenalty
  );
  if (Math.abs(angles[linearIndexForFusion] - angles[knnIndexForFusion]) > model.fusion.maximumDisagreementDegree) {
    return model.fusion.disagreementFallback === 'knn'
      ? angles[knnIndexForFusion]
      : angles[linearIndexForFusion];
  }
  return angles[choose(
    linearScores.map((value, index) => (
      model.fusion.linearWeight * Number(value)
        + (1 - model.fusion.linearWeight) * Number(knnScores[index])
    )),
    angles,
    model.fusion.maximumDegree,
    model.fusion.ensemblePenalty
  )];
}

function loadOptionalScoreReference(options) {
  if (!options.linearScoreDump && !options.knnScoreDump) return null;
  if (!options.linearScoreDump || !options.knnScoreDump) {
    throw new Error('both --linear-score-dump and --knn-score-dump are required together');
  }
  const linear = JSON.parse(fs.readFileSync(path.resolve(options.linearScoreDump), 'utf8'));
  const knn = JSON.parse(fs.readFileSync(path.resolve(options.knnScoreDump), 'utf8'));
  return {
    linear,
    knn,
    linearByKey: new Map(linear.scoreDump.map(row => [row.key, row])),
    knnByKey: new Map(knn.scoreDump.map(row => [row.key, row]))
  };
}

function angleDifference(left, right) {
  let difference = Math.abs(Number(left) - Number(right)) % 360;
  if (difference > 180) difference = 360 - difference;
  return difference;
}

function verify(options = {}) {
  const model = createEvasiveAimModel(require('../src/strategy/evasive-aim-model.json'));
  const reference = loadOptionalScoreReference(options);
  const hits = { baseline: 0, linear: 0, knn: 0, fusion: 0, alternating: 0, router: 0 };
  const referenceHits = { baseline: 0, linear: 0, knn: 0, fusion: 0, alternating: 0, router: 0 };
  const mismatches = { linear: 0, knn: 0, fusion: 0, router: 0, integration: 0 };
  let shots = 0;
  let maxLinearFeatureDifference = 0;
  let maxReferenceMissDifferenceCm = 0;
  let maxIntegrationBaselineAngleDifferenceDeg = 0;
  let maxIntegrationCandidateAngleDifferenceDeg = 0;
  const files = [];
  let referenceAlternatingPosition = 0;
  let referenceAlternatingFile = '';

  for (const file of FROZEN_FILES) {
    if (!fs.existsSync(file)) throw new Error(`frozen battle file is missing: ${file}`);
    const rows = loadRows(file);
    const frames = combatFrames(rows);
    const exactFrames = new Map();
    for (const frame of frames) if (!exactFrames.has(frame.tick)) exactFrames.set(frame.tick, frame);
    const fileHits = { baseline: 0, linear: 0, knn: 0, fusion: 0, alternating: 0, router: 0 };
    let fileShots = 0;

    for (const ack of acceptedShots(rows)) {
      const createdTick = Number(ack.created_tick);
      const observedTick = Number(ack.observedTick);
      const observedFrame = exactFrames.get(observedTick);
      const actualTargetAtCreation = entityAt(frames, createdTick, 'target');
      if (!observedFrame || !actualTargetAtCreation) continue;
      const actualOrigin = { x: Number(ack.start_x), y: Number(ack.start_y) };
      if (Math.hypot(
        Number(actualTargetAtCreation.x) - actualOrigin.x,
        Number(actualTargetAtCreation.y) - actualOrigin.y
      ) > MAXIMUM_CREATION_DISTANCE_CM) continue;

      const loggedDelay = Number(observedFrame.timing.executionDelayTicks);
      const estimatedCreatedTick = Number(observedFrame.timing.createdTickEstimate);
      const executionDelayTicks = Math.max(0, Number.isFinite(loggedDelay)
        ? loggedDelay
        : (Number.isFinite(estimatedCreatedTick) ? estimatedCreatedTick - observedTick : 5));
      const targetVelocity = {
        vx: Number(observedFrame.target.vx) || 0,
        vy: Number(observedFrame.target.vy) || 0
      };
      const shooterVelocity = {
        vx: Number(observedFrame.self.vx) || 0,
        vy: Number(observedFrame.self.vy) || 0
      };
      const predictedTargetAtCreation = {
        x: Number(observedFrame.target.x) + targetVelocity.vx * executionDelayTicks,
        y: Number(observedFrame.target.y) + targetVelocity.vy * executionDelayTicks,
        ...targetVelocity
      };
      const predictedShooterOrigin = {
        x: Number(observedFrame.self.x) + shooterVelocity.vx * executionDelayTicks,
        y: Number(observedFrame.self.y) + shooterVelocity.vy * executionDelayTicks,
        ...shooterVelocity
      };
      const baseline = intercept(predictedShooterOrigin, predictedTargetAtCreation, targetVelocity);
      const motionSamples = motionSamplesThrough(frames, observedTick);
      const predictionInput = {
        motionSamples,
        observedTick,
        executionDelayTicks,
        flightTicks: baseline.flightTicks,
        targetVelocity,
        shooterVelocity,
        predictedShooterOrigin,
        predictedTargetAtCreation
      };
      const predicted = predictEvasiveAimAngles(model, predictionInput);
      if (predicted.ok !== true) throw new Error(`production prediction failed at ${file}:${createdTick}`);

      let linearReferenceRow = null;
      let knnReferenceRow = null;
      if (reference) {
        const key = scoreReferenceKey(file, createdTick);
        const linearRow = reference.linearByKey.get(key);
        const knnRow = reference.knnByKey.get(key);
        if (!linearRow || !knnRow || linearRow.training === true || knnRow.training === true) {
          throw new Error(`frozen score reference is missing: ${key}`);
        }
        const expectedAngles = expectedAnglesFromDumps(
          model,
          reference.linear,
          reference.knn,
          linearRow,
          knnRow
        );
        linearReferenceRow = linearRow;
        knnReferenceRow = knnRow;
        for (const [name, field] of [
          ['linear', 'linearAngleDeg'],
          ['knn', 'knnAngleDeg'],
          ['fusion', 'fusionAngleDeg'],
          ['router', 'routerAngleDeg']
        ]) {
          if (predicted[field] !== expectedAngles[field]) mismatches[name] += 1;
        }
        const productionLinearFeatures = buildLinearMotionFeatures(predictionInput);
        for (let index = 0; index < productionLinearFeatures.length; index += 1) {
          maxLinearFeatureDifference = Math.max(
            maxLinearFeatureDifference,
            Math.abs(productionLinearFeatures[index] - linearRow.features[index])
          );
        }
      }

      const integrated = estimateAim(observedFrame.self, observedFrame.target, {
        nowMs: observedFrame.atMs,
        observedTick,
        realtimeStateObservedAtMs: observedFrame.atMs,
        executionTiming: {
          medianTicks: executionDelayTicks,
          p90Ticks: executionDelayTicks,
          madTicks: 0,
          minTicks: executionDelayTicks,
          maxTicks: executionDelayTicks,
          source: 'confirmed-shoot-rolling',
          sampleCount: 1
        },
        combatTargetState: {
          motionSamples,
          noDamageMs: 0,
          fireRiskClassification: { highEntropy: false },
          evasiveAimExperiment: {
            active: true,
            strategy: 'hard-fusion',
            triggerReason: 'frozen-validation-replay',
            modelVersion: model.modelVersion,
            acceptedShotsAtTrigger: 0
          }
        },
        actualShots: fileShots,
        combatAimCreationDelayMinTicks: executionDelayTicks,
        combatAimCreationDelayMaxTicks: executionDelayTicks,
        bulletSpeedCmPerTick: BULLET_SPEED_CM_PER_TICK,
        combatBulletRangeCm: 15000,
        combatBulletLifetimeTicks: BULLET_LIFETIME_TICKS,
        combatBulletHitRadiusCm: HIT_RADIUS_CM,
        combatStationarySpeed: 5
      });
      const integrationCreationDistanceCm = Math.hypot(
        Number(integrated.predictedTargetAtCreation?.x) - Number(integrated.predictedShooterOrigin?.x),
        Number(integrated.predictedTargetAtCreation?.y) - Number(integrated.predictedShooterOrigin?.y)
      );
      const expectedIntegrationFallback = integrated.evasiveAim?.applied !== true
        && integrated.evasiveAim?.reason === 'outside-trained-distance'
        && integrationCreationDistanceCm > MAXIMUM_CREATION_DISTANCE_CM;
      if (!integrated.ok || (integrated.evasiveAim?.applied !== true && !expectedIntegrationFallback)) {
        mismatches.integration += 1;
        if (!mismatches.firstIntegrationFailure) {
          mismatches.firstIntegrationFailure = {
            file: path.basename(file),
            createdTick,
            observedTick,
            reason: integrated.evasiveAim?.reason || integrated.reason || 'unknown',
            creationDistanceCm: Math.round(integrationCreationDistanceCm)
          };
        }
      } else if (expectedIntegrationFallback) {
        mismatches.expectedDistanceFallbacks = Number(mismatches.expectedDistanceFallbacks || 0) + 1;
      } else {
        const baselineAngleDeg = Math.atan2(
          baseline.y - predictedShooterOrigin.y,
          baseline.x - predictedShooterOrigin.x
        ) / DEGREE;
        maxIntegrationBaselineAngleDifferenceDeg = Math.max(
          maxIntegrationBaselineAngleDifferenceDeg,
          angleDifference(integrated.evasiveAim.baselineAngleDeg, baselineAngleDeg)
        );
        for (const field of [
          'linearAngleDeg',
          'knnAngleDeg',
          'fusionAngleDeg',
          'routerAngleDeg'
        ]) {
          maxIntegrationCandidateAngleDifferenceDeg = Math.max(
            maxIntegrationCandidateAngleDifferenceDeg,
            Math.abs(Number(integrated.evasiveAim[field]) - Number(predicted[field]))
          );
        }
      }

      const sample = {
        frames,
        createdTick,
        actualOrigin,
        featureOrigin: predictedShooterOrigin,
        baselineAngle: Math.atan2(
          baseline.y - predictedShooterOrigin.y,
          baseline.x - predictedShooterOrigin.x
        ),
        baselineDistance: Math.hypot(
          baseline.x - predictedShooterOrigin.x,
          baseline.y - predictedShooterOrigin.y
        )
      };
      const selectedAngles = {
        baseline: 0,
        linear: predicted.linearAngleDeg,
        knn: predicted.knnAngleDeg,
        fusion: predicted.fusionAngleDeg,
        alternating: fileShots % 2 === 0 ? predicted.fusionAngleDeg : predicted.linearAngleDeg,
        router: predicted.routerAngleDeg
      };
      let referenceAlternatingAngle = null;
      if (linearReferenceRow) {
        if (linearReferenceRow.file !== referenceAlternatingFile) referenceAlternatingPosition = 0;
        referenceAlternatingAngle = referenceAlternatingPosition % 2 === 0
          ? selectedFusionAngleFromReference(
              model,
              reference.linear,
              reference.knn,
              linearReferenceRow,
              knnReferenceRow
            )
          : selectedLinearAngleFromReference(model, reference.linear, linearReferenceRow);
      }
      for (const [name, angle] of Object.entries(selectedAngles)) {
        const missCm = minimumMissCm(sample, angle);
        const hit = missCm <= HIT_RADIUS_CM;
        hits[name] += hit;
        fileHits[name] += hit;
        if (linearReferenceRow) {
          let referenceAngle = angle;
          if (name === 'alternating') referenceAngle = referenceAlternatingAngle;
          const angleIndex = reference.linear.angleGridDegrees.indexOf(referenceAngle);
          const referenceMissCm = Number(linearReferenceRow.misses[angleIndex]);
          maxReferenceMissDifferenceCm = Math.max(
            maxReferenceMissDifferenceCm,
            Math.abs(missCm - referenceMissCm)
          );
          referenceHits[name] += referenceMissCm <= HIT_RADIUS_CM;
        }
      }
      if (linearReferenceRow) {
        referenceAlternatingFile = linearReferenceRow.file;
        referenceAlternatingPosition += 1;
      }
      fileShots += 1;
      shots += 1;
    }
    files.push({ file: path.basename(file), shots: fileShots, ...fileHits });
  }

  const actual = { shots, ...hits };
  const errors = [];
  for (const [name, expected] of Object.entries(EXPECTED)) {
    const measured = name === 'alternating' && reference ? referenceHits.alternating : actual[name];
    if (measured !== expected) errors.push(`${name}: expected ${expected}, got ${measured}`);
  }
  if (['linear', 'knn', 'fusion', 'router', 'integration'].some(name => mismatches[name] > 0)) {
    errors.push(`angle/integration mismatches: ${JSON.stringify(mismatches)}`);
  }
  if (maxLinearFeatureDifference > 1e-9) {
    errors.push(`linear feature difference ${maxLinearFeatureDifference} exceeds 1e-9`);
  }
  if (maxIntegrationBaselineAngleDifferenceDeg > 1e-7) {
    errors.push(`integration baseline angle difference ${maxIntegrationBaselineAngleDifferenceDeg} exceeds 1e-7 degrees`);
  }
  if (maxIntegrationCandidateAngleDifferenceDeg > 1e-9) {
    errors.push(`integration candidate angle difference ${maxIntegrationCandidateAngleDifferenceDeg} exceeds 1e-9 degrees`);
  }

  return {
    ok: errors.length === 0,
    modelVersion: model.modelVersion,
    frozenFiles: FROZEN_FILES,
    expected: EXPECTED,
    actual,
    runtimeAlternatingNote: reference && actual.alternating !== referenceHits.alternating
      ? 'runtime alternation is ACK-based; the frozen counterfactual uses every modeled accepted shot in order'
      : '',
    referenceHits: reference ? referenceHits : null,
    rates: Object.fromEntries(Object.entries(hits).map(([name, count]) => [
      name,
      Number((count / Math.max(1, shots) * 100).toFixed(3))
    ])),
    referenceParityEnabled: Boolean(reference),
    mismatches,
    maximumDifferences: {
      linearFeature: maxLinearFeatureDifference,
      referenceMissCm: maxReferenceMissDifferenceCm,
      integrationBaselineAngleDeg: maxIntegrationBaselineAngleDifferenceDeg,
      integrationCandidateAngleDeg: maxIntegrationCandidateAngleDifferenceDeg
    },
    files,
    errors
  };
}

function printHuman(result) {
  console.log(`Evasive aim frozen validation: ${result.ok ? 'accepted' : 'failed'}`);
  console.log(`Model: ${result.modelVersion}; shots=${result.actual.shots}; referenceParity=${result.referenceParityEnabled}`);
  for (const name of ['baseline', 'linear', 'knn', 'fusion', 'alternating', 'router']) {
    console.log(`- ${name}: ${result.actual[name]}/${result.actual.shots} (${result.rates[name]}%)`);
  }
  console.log(`- candidate mismatches: ${JSON.stringify(result.mismatches)}`);
  console.log(`- maximum differences: ${JSON.stringify(result.maximumDifferences)}`);
  for (const error of result.errors) console.log(`- error: ${error}`);
}

if (require.main === module) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log(usage());
      process.exit(0);
    }
    const result = verify(options);
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else printHuman(result);
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(error?.stack || error?.message || String(error));
    process.exitCode = 1;
  }
}

module.exports = {
  EXPECTED,
  FROZEN_FILES,
  verify
};
