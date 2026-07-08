'use strict';

function rangeInitial() {
  return { min: null, max: null, last: null };
}

function updateRange(range, value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return;
  if (range.min === null || number < range.min) range.min = number;
  if (range.max === null || number > range.max) range.max = number;
  range.last = number;
}

function createFrameStats(durationTargetMs) {
  return {
    durationTargetMs,
    frameCount: 0,
    decodedFrameCount: 0,
    binaryFrameCount: 0,
    textFrameCount: 0,
    typeCounts: {},
    keySetCounts: {},
    firstFrameAt: '',
    lastFrameAt: '',
    tick: rangeInitial(),
    entityCount: rangeInitial(),
    bulletCount: rangeInitial(),
    coinDropCount: rangeInitial(),
    messageCount: rangeInitial(),
    selfPresent: { true: 0, false: 0, unknown: 0 },
    decodeErrors: 0
  };
}

function incrementCount(map, key) {
  const normalized = String(key || 'unknown');
  map[normalized] = Number(map[normalized] || 0) + 1;
}

function updateFrameStats(stats, frame) {
  stats.frameCount += 1;
  if (!stats.firstFrameAt) stats.firstFrameAt = frame.at || '';
  stats.lastFrameAt = frame.at || stats.lastFrameAt;
  if (frame.kind === 'binary') stats.binaryFrameCount += 1;
  if (frame.kind === 'text') stats.textFrameCount += 1;
  if (frame.decodeError) stats.decodeErrors += 1;

  const keys = Array.isArray(frame.decodedJsonKeys) ? frame.decodedJsonKeys.join(',') : '';
  if (keys) incrementCount(stats.keySetCounts, keys);

  const summary = frame.decodedSummary;
  if (!summary || typeof summary !== 'object') return;
  stats.decodedFrameCount += 1;
  incrementCount(stats.typeCounts, summary.type || frame.decodedType || 'unknown');
  updateRange(stats.tick, summary.tick);
  updateRange(stats.entityCount, summary.entityCount);
  updateRange(stats.bulletCount, summary.bulletCount);
  updateRange(stats.coinDropCount, summary.coinDropCount);
  updateRange(stats.messageCount, summary.messageCount);
  if (summary.selfPresent === true) {
    stats.selfPresent.true += 1;
  } else if (summary.selfPresent === false) {
    stats.selfPresent.false += 1;
  } else {
    stats.selfPresent.unknown += 1;
  }
}

async function collectFrameStats(durationMs, options = {}) {
  const stats = createFrameStats(durationMs);
  const observer = frame => updateFrameStats(stats, frame);
  if (typeof options.addObserver !== 'function' || typeof options.removeObserver !== 'function') {
    throw new Error('collectFrameStats requires addObserver and removeObserver callbacks');
  }
  const sleep = typeof options.sleep === 'function'
    ? options.sleep
    : ms => new Promise(resolve => setTimeout(resolve, ms));
  options.addObserver(observer);
  try {
    await sleep(durationMs);
  } finally {
    options.removeObserver(observer);
  }
  return stats;
}

module.exports = {
  collectFrameStats,
  createFrameStats,
  incrementCount,
  rangeInitial,
  updateFrameStats,
  updateRange
};
