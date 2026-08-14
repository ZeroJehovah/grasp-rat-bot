'use strict';

const EVASIVE_AIM_MODEL_VERSION = 'evasive-aim-2026-08-14-v1';
const EVASIVE_AIM_STRATEGIES = Object.freeze([
  'gaussian-linear',
  'similar-history-knn',
  'hard-fusion',
  'fusion-linear-alternating',
  'restricted-router-tree'
]);
const DEFAULT_MAXIMUM_CREATION_DISTANCE_CM = 5500;
const DEFAULT_REFERENCE_DAMAGE_HP = 9;
const DEFAULT_EXPECTED_DAMAGE_PER_HIT_HP = 3;

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function optionalNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, finiteNumber(value, minimum)));
}

function randomStrategyIndex(input = {}) {
  const explicitUnit = optionalNumber(input.randomUnit);
  const randomUnit = explicitUnit !== null
    ? explicitUnit
    : (typeof input.random === 'function' ? input.random() : Math.random());
  return Math.min(
    EVASIVE_AIM_STRATEGIES.length - 1,
    Math.floor(clamp(randomUnit, 0, 0.999999999) * EVASIVE_AIM_STRATEGIES.length)
  );
}

function highConfidenceEvasiveBehaviorCore(behavior = {}, options = {}) {
  const mode = String(behavior?.mode || '');
  const confidence = clamp(behavior?.confidence, 0, 1);
  const sampleCount = Math.max(0, finiteNumber(behavior?.metrics?.sampleCount));
  const durationMs = Math.max(0, finiteNumber(behavior?.metrics?.durationMs));
  const transition = behavior?.metrics?.movementTransitions || {};
  const transitionCount = Math.max(0, finiteNumber(transition.transitionCount));
  const conditionalSamples = Math.max(0, finiteNumber(transition.conditionalSampleCount));
  const minimumConfidence = Math.max(0, finiteNumber(options.minimumConfidence, 0.7));
  const minimumSampleCount = Math.max(1, finiteNumber(options.minimumSampleCount, 8));
  const minimumDurationMs = Math.max(0, finiteNumber(options.minimumDurationMs, 2500));
  const minimumTransitions = Math.max(0, finiteNumber(options.minimumTransitions, 4));
  const minimumConditionalSamples = Math.max(0, finiteNumber(options.minimumConditionalSamples, 8));
  const eligible = ['zigzag-strafe', 'retreat-kite'].includes(mode)
    && confidence >= minimumConfidence
    && sampleCount >= minimumSampleCount
    && durationMs >= minimumDurationMs
    && transitionCount >= minimumTransitions
    && conditionalSamples >= minimumConditionalSamples;
  return {
    eligible,
    mode,
    confidence,
    sampleCount,
    durationMs,
    transitionCount,
    conditionalSamples,
    minimumConditionalSamples,
    reason: eligible ? `high-confidence-${mode}` : 'behavior-evidence-not-ready'
  };
}

function updateEvasiveAimExperimentCore(previous = null, input = {}, options = {}) {
  const targetId = String(input.targetId || '');
  const engagementGeneration = String(input.engagementGeneration || '');
  const sameEngagement = Boolean(
    previous
      && targetId
      && engagementGeneration
      && String(previous.targetId || '') === targetId
      && String(previous.engagementGeneration || '') === engagementGeneration
  );
  const nowMs = Math.max(0, finiteNumber(input.nowMs, Date.now()));
  const startedAt = Math.max(0, finiteNumber(input.startedAt, nowMs));
  const evaluationWindowMs = Math.max(1, finiteNumber(input.evaluationWindowMs));
  const halfWindowAt = startedAt + evaluationWindowMs / 2;
  const enabled = options.enabled !== false;
  const triggerEnabled = options.triggerEnabled === true;
  const earlyDetectionEnabled = options.earlyDetectionEnabled !== false;
  const acceptedShots = Math.max(0, Math.round(finiteNumber(input.acceptedShots)));
  const confirmedHits = Math.max(0, Math.round(finiteNumber(input.confirmedHits)));
  const requiredConfirmedHits = Math.max(1, Math.ceil(
    finiteNumber(input.referenceDamageHp, DEFAULT_REFERENCE_DAMAGE_HP)
      / Math.max(0.1, finiteNumber(input.expectedDamagePerHitHp, DEFAULT_EXPECTED_DAMAGE_PER_HIT_HP))
      / 2
  ));
  const behaviorDetection = highConfidenceEvasiveBehaviorCore(input.behavior, options.behaviorDetection);
  let state = sameEngagement
    ? { ...previous }
    : {
        modelVersion: EVASIVE_AIM_MODEL_VERSION,
        targetId,
        engagementGeneration,
        startedAt,
        startedTick: optionalNumber(input.startedTick),
        active: false,
        strategy: '',
        triggerReason: '',
        triggeredAt: 0,
        halfWindowEvaluated: false,
        halfWindowEvaluatedAt: 0,
        halfWindowConfirmedHits: null,
        strategyIndex: null,
        acceptedShotsAtTrigger: null,
        confirmedHitsAtTrigger: null
      };

  if (!enabled) {
    return {
      ...state,
      enabled: false,
      triggerEnabled,
      earlyDetectionEnabled,
      active: false,
      strategy: '',
      strategyIndex: null,
      triggerReason: '',
      modelVersion: EVASIVE_AIM_MODEL_VERSION,
      targetId,
      engagementGeneration,
      evaluationWindowMs: Math.round(evaluationWindowMs),
      halfWindowAt: Math.round(halfWindowAt),
      requiredConfirmedHits,
      currentAcceptedShots: acceptedShots,
      currentConfirmedHits: confirmedHits,
      behaviorDetection,
      updatedAt: nowMs,
      disabledReason: 'evasive-aim-disabled'
    };
  }

  if (!state.halfWindowEvaluated && nowMs >= halfWindowAt) {
    state.halfWindowEvaluated = true;
    state.halfWindowEvaluatedAt = nowMs;
    state.halfWindowConfirmedHits = confirmedHits;
  }

  let triggerReason = '';
  let earlyDetectionEligible = false;
  if (triggerEnabled) {
    earlyDetectionEligible = earlyDetectionEnabled
      && nowMs < halfWindowAt
      && acceptedShots >= Math.max(1, finiteNumber(options.minimumEarlyAcceptedShots, 20))
      && confirmedHits === 0
      && behaviorDetection.eligible;
    if (!state.active && earlyDetectionEligible) {
      triggerReason = `strict-evasive-zero-hit-${behaviorDetection.mode}`;
    } else if (!state.active
      && state.halfWindowEvaluated
      && Number(state.halfWindowConfirmedHits || 0) < requiredConfirmedHits) {
      triggerReason = 'half-efficiency-window-hit-shortfall';
    }
  }

  if (triggerReason) {
    const strategyIndex = randomStrategyIndex({
      ...input,
      startedAt,
      randomUnit: options.randomUnit,
      random: options.random
    });
    state = {
      ...state,
      active: true,
      strategy: EVASIVE_AIM_STRATEGIES[strategyIndex],
      strategyIndex,
      triggerReason,
      triggeredAt: nowMs,
      acceptedShotsAtTrigger: acceptedShots,
      confirmedHitsAtTrigger: confirmedHits
    };
  }

  return {
    ...state,
    enabled: true,
    triggerEnabled,
    earlyDetectionEnabled,
    modelVersion: EVASIVE_AIM_MODEL_VERSION,
    targetId,
    engagementGeneration,
    evaluationWindowMs: Math.round(evaluationWindowMs),
    halfWindowAt: Math.round(halfWindowAt),
    requiredConfirmedHits,
    currentAcceptedShots: acceptedShots,
    currentConfirmedHits: confirmedHits,
    earlyDetectionEligible,
    behaviorDetection,
    updatedAt: nowMs
  };
}

function directionState(vx, vy) {
  const speed = Math.hypot(finiteNumber(vx), finiteNumber(vy));
  if (speed < 10) return 8;
  let state = Math.round(Math.atan2(finiteNumber(vy), finiteNumber(vx)) / (Math.PI / 4));
  if (state < 0) state += 8;
  return state % 8;
}

function sampleTick(sample, fallback) {
  return optionalNumber(sample?.tick ?? sample?.currentTick) ?? fallback;
}

function prepareMotionSamples(samples = []) {
  const source = Array.isArray(samples) ? samples : [];
  let ordered = true;
  let previousTick = -Infinity;
  const filtered = [];
  for (let index = 0; index < source.length; index += 1) {
    const sample = source[index];
    const tick = sample && optionalNumber(sampleTick(sample, null));
    if (tick === null) continue;
    if (tick < previousTick) ordered = false;
    previousTick = tick;
    filtered.push(sample);
  }
  return ordered
    ? filtered
    : filtered.sort((left, right) => sampleTick(left, 0) - sampleTick(right, 0));
}

function entityAtTick(samples = [], tick, prefix = '') {
  if (!samples.length) return null;
  let low = 0;
  let high = samples.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (sampleTick(samples[middle], middle) < tick) low = middle + 1;
    else high = middle;
  }
  let afterIndex = low;
  let beforeIndex = low - 1;
  if (afterIndex < samples.length && sampleTick(samples[afterIndex], afterIndex) === tick) {
    beforeIndex = afterIndex;
  }
  if (beforeIndex < 0) beforeIndex = afterIndex;
  if (afterIndex >= samples.length) afterIndex = beforeIndex;
  if (beforeIndex < 0 || afterIndex < 0 || beforeIndex >= samples.length || afterIndex >= samples.length) return null;
  const before = samples[beforeIndex];
  const after = samples[afterIndex];
  const beforeTick = sampleTick(before, beforeIndex);
  const afterTick = sampleTick(after, afterIndex);
  if (!before || !after) return null;
  const key = name => prefix ? `${prefix}${name[0].toUpperCase()}${name.slice(1)}` : name;
  const read = (sample, name) => optionalNumber(sample?.[key(name)]);
  const fallbackRead = (sample, name) => optionalNumber(sample?.[name]);
  const value = (sample, name) => read(sample, name) ?? fallbackRead(sample, name) ?? 0;
  if (beforeTick === afterTick) {
    return {
      x: value(before, 'x'),
      y: value(before, 'y'),
      vx: value(before, 'vx'),
      vy: value(before, 'vy')
    };
  }
  const ratio = clamp((tick - beforeTick) / (afterTick - beforeTick), 0, 1);
  return {
    x: value(before, 'x') + (value(after, 'x') - value(before, 'x')) * ratio,
    y: value(before, 'y') + (value(after, 'y') - value(before, 'y')) * ratio,
    vx: value(before, 'vx'),
    vy: value(before, 'vy')
  };
}

function historicalVelocity(samples, currentIndex, windowTicks, prefix = '') {
  const end = samples[currentIndex];
  const endTick = sampleTick(end, currentIndex);
  const startIndex = Math.max(0, currentIndex - Math.max(0, Math.round(windowTicks)));
  const start = samples[startIndex];
  const startTick = sampleTick(start, startIndex);
  const elapsed = endTick - startTick;
  const key = name => prefix ? `${prefix}${name[0].toUpperCase()}${name.slice(1)}` : name;
  if (elapsed > 0) {
    return {
      vx: (finiteNumber(end[key('x')]) - finiteNumber(start[key('x')])) / elapsed,
      vy: (finiteNumber(end[key('y')]) - finiteNumber(start[key('y')])) / elapsed
    };
  }
  return {
    vx: finiteNumber(end[key('vx')]),
    vy: finiteNumber(end[key('vy')])
  };
}

function directionRunFeatures(samples, currentIndex) {
  const runs = [];
  let endIndex = currentIndex;
  while (endIndex >= 0 && runs.length < 4) {
    const end = samples[endIndex];
    const state = directionState(end.vx, end.vy);
    let startIndex = endIndex;
    while (startIndex > 0 && directionState(samples[startIndex - 1].vx, samples[startIndex - 1].vy) === state) {
      startIndex -= 1;
    }
    runs.push({
      state,
      ticks: Math.max(0, sampleTick(end, endIndex) - sampleTick(samples[startIndex], startIndex))
    });
    endIndex = startIndex - 1;
  }
  const features = [];
  for (let index = 0; index < 4; index += 1) {
    const run = runs[index];
    const angle = run && run.state < 8 ? run.state * Math.PI / 4 : 0;
    features.push(
      run?.state === 8 ? 1 : 0,
      Math.cos(angle),
      Math.sin(angle),
      Math.min(2, (run?.ticks || 0) / 20)
    );
  }
  return features;
}

function buildLinearMotionFeatures(input = {}) {
  const samples = input.preparedMotionSamples || prepareMotionSamples(input.motionSamples);
  if (!samples.length) return null;
  const observedTick = optionalNumber(input.observedTick) ?? sampleTick(samples.at(-1), samples.length - 1);
  let currentIndex = samples.length - 1;
  while (currentIndex > 0 && sampleTick(samples[currentIndex], currentIndex) > observedTick) currentIndex -= 1;
  const target = input.predictedTargetAtCreation || entityAtTick(samples, observedTick, '') || samples[currentIndex];
  const self = input.predictedShooterOrigin || entityAtTick(samples, observedTick, 'self') || {
    x: samples[currentIndex].selfX,
    y: samples[currentIndex].selfY,
    vx: samples[currentIndex].selfVx,
    vy: samples[currentIndex].selfVy
  };
  if ([target?.x, target?.y, self?.x, self?.y].some(value => optionalNumber(value) === null)) return null;
  const currentSample = samples[currentIndex];
  const targetVelocity = {
    vx: finiteNumber(input.targetVelocity?.vx, finiteNumber(target.vx, finiteNumber(currentSample.vx))),
    vy: finiteNumber(input.targetVelocity?.vy, finiteNumber(target.vy, finiteNumber(currentSample.vy)))
  };
  const selfVelocity = {
    vx: finiteNumber(input.shooterVelocity?.vx, finiteNumber(self.vx, finiteNumber(currentSample.selfVx))),
    vy: finiteNumber(input.shooterVelocity?.vy, finiteNumber(self.vy, finiteNumber(currentSample.selfVy)))
  };
  const dx = finiteNumber(target.x) - finiteNumber(self.x);
  const dy = finiteNumber(target.y) - finiteNumber(self.y);
  const distance = Math.hypot(dx, dy);
  const radialAngle = Math.atan2(dy, dx);
  const radial = { x: Math.cos(radialAngle), y: Math.sin(radialAngle) };
  const tangent = { x: -radial.y, y: radial.x };
  const project = velocity => ({
    radial: (finiteNumber(velocity.vx) * radial.x + finiteNumber(velocity.vy) * radial.y) / 50,
    tangent: (finiteNumber(velocity.vx) * tangent.x + finiteNumber(velocity.vy) * tangent.y) / 50
  });
  const currentLocal = project(targetVelocity);
  const selfLocal = project(selfVelocity);
  const raw = [
    distance / 5500,
    Math.max(0, finiteNumber(input.flightTicks)) / 12,
    Math.max(0, finiteNumber(input.executionDelayTicks)) / 5,
    currentLocal.radial,
    currentLocal.tangent,
    selfLocal.radial,
    selfLocal.tangent,
    currentLocal.radial - selfLocal.radial,
    currentLocal.tangent - selfLocal.tangent,
    currentLocal.radial * currentLocal.tangent,
    currentLocal.radial ** 2,
    currentLocal.tangent ** 2,
    ...directionRunFeatures(samples, currentIndex)
  ];
  for (const window of [2, 4, 6, 8, 10, 12, 16, 20, 30, 40]) {
    const local = project(historicalVelocity(samples, currentIndex, window));
    raw.push(
      local.radial,
      local.tangent,
      local.radial - currentLocal.radial,
      local.tangent - currentLocal.tangent,
      local.radial * currentLocal.radial,
      local.tangent * currentLocal.tangent
    );
  }
  const features = [1, ...raw];
  for (const value of raw) features.push(value * value);
  return features.length === 177 ? features : null;
}

function buildKnnFeatures(input = {}) {
  const samples = input.preparedMotionSamples || prepareMotionSamples(input.motionSamples);
  if (!samples.length) return null;
  const observedTick = optionalNumber(input.observedTick) ?? sampleTick(samples.at(-1), samples.length - 1);
  const target = input.predictedTargetAtCreation || entityAtTick(samples, observedTick, '') || samples.at(-1);
  const self = input.predictedShooterOrigin || entityAtTick(samples, observedTick, 'self') || {
    x: samples.at(-1).selfX,
    y: samples.at(-1).selfY
  };
  if ([target?.x, target?.y, self?.x, self?.y].some(value => optionalNumber(value) === null)) return null;
  const dx = finiteNumber(target.x) - finiteNumber(self.x);
  const dy = finiteNumber(target.y) - finiteNumber(self.y);
  const distance = Math.hypot(dx, dy);
  const radialAngle = Math.atan2(dy, dx);
  const radial = { x: Math.cos(radialAngle), y: Math.sin(radialAngle) };
  const tangent = { x: -radial.y, y: radial.x };
  const features = [];
  for (let lag = 0; lag < 4; lag += 1) {
    const historical = entityAtTick(samples, observedTick - lag, '');
    const vx = historical ? historical.vx : finiteNumber(input.targetVelocity?.vx, finiteNumber(target.vx));
    const vy = historical ? historical.vy : finiteNumber(input.targetVelocity?.vy, finiteNumber(target.vy));
    features.push(
      (vx * radial.x + vy * radial.y) / 50,
      (vx * tangent.x + vy * tangent.y) / 50
    );
  }
  features.push(distance, Math.max(0, finiteNumber(input.flightTicks)));
  return features;
}

function decodeFloat32Base64(value) {
  const buffer = Buffer.from(String(value || ''), 'base64');
  const output = new Float32Array(Math.floor(buffer.byteLength / 4));
  for (let index = 0; index < output.length; index += 1) {
    output[index] = buffer.readFloatLE(index * 4);
  }
  return output;
}

function chooseAngle(scores, angles, maximumDegree, penalty = 0, baselineBoost = 0) {
  let selected = Math.max(0, angles.indexOf(0));
  let selectedScore = -Infinity;
  for (let index = 0; index < scores.length; index += 1) {
    const angle = finiteNumber(angles[index]);
    if (Math.abs(angle) > maximumDegree + 1e-9) continue;
    const score = finiteNumber(scores[index], -Infinity)
      - penalty * angle * angle
      + (angle === 0 ? baselineBoost : 0);
    if (score > selectedScore) {
      selected = index;
      selectedScore = score;
    }
  }
  return selected;
}

function linearScores(model, features) {
  const scores = new Float64Array(model.linear.outputCount);
  for (let feature = 0; feature < model.linear.featureCount; feature += 1) {
    const value = finiteNumber(features[feature]);
    const offset = feature * model.linear.outputCount;
    for (let output = 0; output < scores.length; output += 1) {
      scores[output] += value * model.linearCoefficients[offset + output];
    }
  }
  return scores;
}

function knnScores(model, features) {
  const ranked = [];
  const historyLength = model.knn.historyLength;
  const prototypeStride = model.knn.featureCount;
  for (let prototype = 0; prototype < model.knn.prototypeCount; prototype += 1) {
    const offset = prototype * prototypeStride;
    let total = 0;
    for (let lag = 0; lag < historyLength; lag += 1) {
      const radialDelta = features[lag * 2] - model.knnFeatures[offset + lag * 2];
      const tangentDelta = features[lag * 2 + 1] - model.knnFeatures[offset + lag * 2 + 1];
      const recencyWeight = 1 + (historyLength - lag) / historyLength;
      total += recencyWeight * (radialDelta ** 2 + tangentDelta ** 2);
    }
    total /= historyLength;
    const rangeDelta = (features[8] - model.knnFeatures[offset + 8]) / 5500;
    const flightDelta = (features[9] - model.knnFeatures[offset + 9]) / 12;
    total += 2 * rangeDelta ** 2 + flightDelta ** 2;
    if (ranked.length < model.knn.neighbourCount || total < ranked.at(-1).distance) {
      let insertionIndex = ranked.length;
      while (insertionIndex > 0 && total < ranked[insertionIndex - 1].distance) insertionIndex -= 1;
      ranked.splice(insertionIndex, 0, { prototype, distance: total });
      if (ranked.length > model.knn.neighbourCount) ranked.pop();
    }
  }
  const scores = new Float64Array(model.knn.scoreCount);
  let weightTotal = 0;
  for (const neighbour of ranked) {
    const weight = 1 / Math.max(0.05, Math.sqrt(neighbour.distance));
    weightTotal += weight;
    const offset = neighbour.prototype * model.knn.scoreCount;
    for (let index = 0; index < scores.length; index += 1) {
      scores[index] += model.knnScores[offset + index] * weight;
    }
  }
  if (weightTotal > 0) {
    for (let index = 0; index < scores.length; index += 1) scores[index] /= weightTotal;
  }
  return scores;
}

function commonLinearScores(model, scores) {
  const indexByAngle = new Map(model.linear.angleGridDegrees.map((angle, index) => [String(angle), index]));
  return Float64Array.from(model.angleGridDegrees, angle => scores[indexByAngle.get(String(angle))]);
}

function normalizeScores(scores) {
  let sum = 0;
  let minimum = Infinity;
  let maximum = -Infinity;
  for (const value of scores) {
    sum += value;
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
  }
  const mean = sum / Math.max(1, scores.length);
  let variance = 0;
  for (const value of scores) variance += (value - mean) ** 2;
  const deviation = Math.sqrt(Math.max(variance / Math.max(1, scores.length), 1e-12));
  const range = Math.max(1e-12, maximum - minimum);
  return {
    maximum,
    deviation,
    z: Array.from(scores, value => (value - mean) / deviation),
    minmax: Array.from(scores, value => (value - minimum) / range)
  };
}

function topTwo(scores, angles, maximumDegree, penalty) {
  const ranked = Array.from(scores, (score, index) => ({
    index,
    score: score - penalty * angles[index] ** 2
  })).filter(item => Math.abs(angles[item.index]) <= maximumDegree + 1e-9)
    .sort((left, right) => right.score - left.score);
  return {
    first: ranked[0].index,
    second: ranked[1].index,
    margin: ranked[0].score - ranked[1].score
  };
}

function routerFeatures(model, linear, knn, linearTop, knnTop) {
  const angles = model.angleGridDegrees;
  const zeroIndex = angles.indexOf(0);
  const linearNorm = normalizeScores(linear);
  const knnNorm = normalizeScores(knn);
  const linearTopAngle = angles[linearTop.first];
  const knnTopAngle = angles[knnTop.first];
  return [
    linearTopAngle / 8,
    knnTopAngle / 8,
    Math.abs(linearTopAngle) / 8,
    Math.abs(knnTopAngle) / 8,
    Math.abs(linearTopAngle - knnTopAngle) / 8,
    linearTopAngle * knnTopAngle / 64,
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
    linear[linearTop.first],
    knn[knnTop.first],
    linear[knnTop.first],
    knn[linearTop.first],
    linear[zeroIndex],
    knn[zeroIndex]
  ];
}

function predictRouter(tree, features) {
  let node = tree;
  while (node && node.feature !== undefined) {
    node = features[node.feature] <= node.threshold ? node.left : node.right;
  }
  return node?.prediction || [0, 0, 0];
}

function createEvasiveAimModel(modelData) {
  if (!modelData || String(modelData.modelVersion || '') !== EVASIVE_AIM_MODEL_VERSION) {
    throw new Error('invalid evasive aim model data');
  }
  const model = {
    ...modelData,
    linearCoefficients: decodeFloat32Base64(modelData.linear.coefficientsFloat32Base64),
    knnFeatures: decodeFloat32Base64(modelData.knn.featuresFloat32Base64),
    knnScores: decodeFloat32Base64(modelData.knn.scoresFloat32Base64)
  };
  if (model.linearCoefficients.length !== model.linear.featureCount * model.linear.outputCount
    || model.knnFeatures.length !== model.knn.prototypeCount * model.knn.featureCount
    || model.knnScores.length !== model.knn.prototypeCount * model.knn.scoreCount) {
    throw new Error('evasive aim model shape mismatch');
  }
  return model;
}

function predictEvasiveAimAngles(model, input = {}) {
  const preparedMotionSamples = prepareMotionSamples(input.motionSamples);
  const preparedInput = { ...input, preparedMotionSamples };
  const linearFeatures = buildLinearMotionFeatures(preparedInput);
  const knnFeatures = buildKnnFeatures(preparedInput);
  if (!linearFeatures || !knnFeatures) return { ok: false, reason: 'insufficient-motion-features' };
  const linearRaw = linearScores(model, linearFeatures);
  const linearCommon = commonLinearScores(model, linearRaw);
  const knn = knnScores(model, knnFeatures);
  const linearTop = topTwo(linearCommon, model.angleGridDegrees, model.linear.maximumDegree, model.linear.penalty);
  const knnTop = topTwo(knn, model.angleGridDegrees, model.knn.maximumDegree, model.knn.penalty);
  const disagreement = Math.abs(
    model.angleGridDegrees[linearTop.first] - model.angleGridDegrees[knnTop.first]
  );
  const fusionLinearIndex = chooseAngle(
    linearCommon,
    model.angleGridDegrees,
    model.fusion.maximumDegree,
    model.fusion.linearPenalty
  );
  const fusionKnnIndex = chooseAngle(
    knn,
    model.angleGridDegrees,
    model.fusion.maximumDegree,
    model.fusion.knnPenalty
  );
  const fusionDisagreement = Math.abs(
    model.angleGridDegrees[fusionLinearIndex] - model.angleGridDegrees[fusionKnnIndex]
  );
  let fusionIndex;
  if (fusionDisagreement > model.fusion.maximumDisagreementDegree) {
    fusionIndex = model.fusion.disagreementFallback === 'knn'
      ? fusionKnnIndex
      : fusionLinearIndex;
  } else {
    const fusionScores = Float64Array.from(linearCommon, (value, index) => (
      model.fusion.linearWeight * value + (1 - model.fusion.linearWeight) * knn[index]
    ));
    fusionIndex = chooseAngle(
      fusionScores,
      model.angleGridDegrees,
      model.fusion.maximumDegree,
      model.fusion.ensemblePenalty
    );
  }
  const candidates = [model.angleGridDegrees.indexOf(0), linearTop.first, knnTop.first];
  const routerPrediction = predictRouter(
    model.router.tree,
    routerFeatures(model, linearCommon, knn, linearTop, knnTop)
  );
  let routerClass = 0;
  let routerScore = -Infinity;
  for (let candidateClass = 0; candidateClass < candidates.length; candidateClass += 1) {
    const angle = model.angleGridDegrees[candidates[candidateClass]];
    const score = finiteNumber(routerPrediction[candidateClass])
      - model.router.options.anglePenalty * angle * angle
      + (candidateClass === 0 ? model.router.options.baselineBoost : 0);
    if (score > routerScore) {
      routerClass = candidateClass;
      routerScore = score;
    }
  }
  return {
    ok: true,
    modelVersion: model.modelVersion,
    linearAngleDeg: model.angleGridDegrees[linearTop.first],
    knnAngleDeg: model.angleGridDegrees[knnTop.first],
    fusionAngleDeg: model.angleGridDegrees[fusionIndex],
    routerAngleDeg: model.angleGridDegrees[candidates[routerClass]],
    disagreementDeg: disagreement
  };
}

function applyEvasiveAimStrategyCore(baseAim = {}, experiment = {}, predictions = {}, input = {}, options = {}) {
  if (experiment?.active !== true || !EVASIVE_AIM_STRATEGIES.includes(experiment.strategy)) {
    return { applied: false, reason: 'experiment-inactive' };
  }
  const origin = input.predictedShooterOrigin;
  const baseline = input.baselineAim;
  const predictedTarget = input.predictedTargetAtCreation;
  if (![origin?.x, origin?.y, baseline?.x, baseline?.y, predictedTarget?.x, predictedTarget?.y]
    .every(value => Number.isFinite(Number(value)))) {
    return { applied: false, reason: 'missing-baseline-geometry' };
  }
  const creationDistance = Math.hypot(
    finiteNumber(predictedTarget.x) - finiteNumber(origin.x),
    finiteNumber(predictedTarget.y) - finiteNumber(origin.y)
  );
  const maximumDistance = Math.max(1, finiteNumber(
    options.maximumCreationDistanceCm,
    DEFAULT_MAXIMUM_CREATION_DISTANCE_CM
  ));
  if (creationDistance > maximumDistance) {
    return { applied: false, reason: 'outside-trained-distance', creationDistanceCm: Math.round(creationDistance) };
  }
  if (predictions?.ok !== true) return { applied: false, reason: predictions?.reason || 'prediction-unavailable' };
  let angleDeg = 0;
  if (experiment.strategy === 'gaussian-linear') angleDeg = predictions.linearAngleDeg;
  else if (experiment.strategy === 'similar-history-knn') angleDeg = predictions.knnAngleDeg;
  else if (experiment.strategy === 'hard-fusion') angleDeg = predictions.fusionAngleDeg;
  else if (experiment.strategy === 'fusion-linear-alternating') {
    const acceptedShotsSinceTrigger = Math.max(0,
      Math.round(finiteNumber(input.acceptedShots))
        - Math.round(finiteNumber(experiment.acceptedShotsAtTrigger))
    );
    angleDeg = acceptedShotsSinceTrigger % 2 === 0
      ? predictions.fusionAngleDeg
      : predictions.linearAngleDeg;
  } else if (experiment.strategy === 'restricted-router-tree') angleDeg = predictions.routerAngleDeg;
  const baselineAngle = Math.atan2(
    finiteNumber(baseline.y) - finiteNumber(origin.y),
    finiteNumber(baseline.x) - finiteNumber(origin.x)
  );
  const distance = Math.hypot(
    finiteNumber(baseline.x) - finiteNumber(origin.x),
    finiteNumber(baseline.y) - finiteNumber(origin.y)
  );
  if (!(distance > 0)) return { applied: false, reason: 'zero-baseline-distance' };
  const finalAngle = baselineAngle + angleDeg * Math.PI / 180;
  return {
    applied: true,
    reason: 'evasive-aim-strategy-applied',
    x: finiteNumber(origin.x) + Math.cos(finalAngle) * distance,
    y: finiteNumber(origin.y) + Math.sin(finalAngle) * distance,
    offsetDeg: angleDeg,
    baselineAngleDeg: baselineAngle * 180 / Math.PI,
    baselineAimX: finiteNumber(baseline.x),
    baselineAimY: finiteNumber(baseline.y),
    creationDistanceCm: Math.round(creationDistance),
    strategy: experiment.strategy,
    modelVersion: experiment.modelVersion || EVASIVE_AIM_MODEL_VERSION,
    triggerReason: String(experiment.triggerReason || ''),
    linearAngleDeg: predictions.linearAngleDeg,
    knnAngleDeg: predictions.knnAngleDeg,
    fusionAngleDeg: predictions.fusionAngleDeg,
    routerAngleDeg: predictions.routerAngleDeg,
    disagreementDeg: predictions.disagreementDeg
  };
}

module.exports = {
  DEFAULT_MAXIMUM_CREATION_DISTANCE_CM,
  EVASIVE_AIM_MODEL_VERSION,
  EVASIVE_AIM_STRATEGIES,
  applyEvasiveAimStrategyCore,
  buildKnnFeatures,
  buildLinearMotionFeatures,
  createEvasiveAimModel,
  entityAtTick,
  highConfidenceEvasiveBehaviorCore,
  prepareMotionSamples,
  predictEvasiveAimAngles,
  randomStrategyIndex,
  updateEvasiveAimExperimentCore
};
