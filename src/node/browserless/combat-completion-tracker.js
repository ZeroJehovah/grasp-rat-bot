'use strict';

const fs = require('fs');
const path = require('path');

const SCHEMA_VERSION = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

function emptyStore() {
  return { schemaVersion: SCHEMA_VERSION, updatedAt: '', players: {}, strategyLearning: null };
}

function numeric(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function normalizePlayer(key, player = {}) {
  const userId = String(player.userId ?? String(key || '').replace(/^user:/, ''));
  if (!userId) return null;
  return {
    userId,
    name: String(player.name || ''),
    attempts: numeric(player.attempts),
    successes: numeric(player.successes),
    failures: numeric(player.failures),
    escapes: numeric(player.escapes),
    targetDamage: numeric(player.targetDamage),
    selfDamage: numeric(player.selfDamage),
    combatSamples: numeric(player.combatSamples),
    currentEngagementStartedAt: numeric(player.currentEngagementStartedAt),
    currentTargetDamage: numeric(player.currentTargetDamage),
    currentSelfDamage: numeric(player.currentSelfDamage),
    lastSampleAt: String(player.lastSampleAt || ''),
    lastOutcome: String(player.lastOutcome || ''),
    lastReason: String(player.lastReason || ''),
    updatedAt: String(player.updatedAt || '')
  };
}

function validGenericLearningKey(key) {
  return /^movement=[^|]+\|shooting=[^|]+\|stamina=[^|]+\|style=[^|]+\|distance=[^|]+\|aim=[^|]+$/.test(String(key || ''));
}

function sanitizeStrategyLearning(value) {
  if (!value || typeof value !== 'object') return null;
  const hitRateByModeDistance = value.hitRateByModeDistance && typeof value.hitRateByModeDistance === 'object'
    ? Object.fromEntries(Object.entries(value.hitRateByModeDistance)
      .filter(([key, cell]) => validGenericLearningKey(key) && cell && typeof cell === 'object')
      .sort((a, b) => Number(b[1]?.updatedAt || 0) - Number(a[1]?.updatedAt || 0))
      .slice(0, 512)
      .map(([key, cell]) => [String(key), {
        shots: numeric(cell.shots),
        hits: numeric(cell.hits),
        updatedAt: numeric(cell.updatedAt)
      }]))
    : {};
  const modeMetrics = value.modeMetrics && typeof value.modeMetrics === 'object'
    ? Object.fromEntries(Object.entries(value.modeMetrics)
      .filter(([key, cell]) => validGenericLearningKey(key) && cell && typeof cell === 'object')
      .sort((a, b) => Number(b[1]?.updatedAt || 0) - Number(a[1]?.updatedAt || 0))
      .slice(0, 256)
      .map(([key, cell]) => [String(key), {
        engagements: numeric(cell.engagements),
        shots: numeric(cell.shots),
        hits: numeric(cell.hits),
        targetDamage: numeric(cell.targetDamage),
        selfDamage: numeric(cell.selfDamage),
        shootingStamina: numeric(cell.shootingStamina),
        chaseStamina: numeric(cell.chaseStamina),
        firstDamageDelayTotalMs: numeric(cell.firstDamageDelayTotalMs),
        firstDamageSamples: numeric(cell.firstDamageSamples),
        kills: numeric(cell.kills),
        disengagements: numeric(cell.disengagements),
        modeTransitions: numeric(cell.modeTransitions),
        updatedAt: numeric(cell.updatedAt)
      }]))
    : {};
  return { hitRateByModeDistance, modeMetrics };
}

function readStore(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (![1, SCHEMA_VERSION].includes(Number(value?.schemaVersion))) return emptyStore();
    const players = {};
    for (const [key, player] of Object.entries(value.players || {})) {
      const normalized = normalizePlayer(key, player);
      if (normalized) players[`user:${normalized.userId}`] = normalized;
    }
    return {
      schemaVersion: SCHEMA_VERSION,
      updatedAt: String(value.updatedAt || ''),
      players,
      strategyLearning: sanitizeStrategyLearning(value.strategyLearning)
    };
  } catch (_) {
    return emptyStore();
  }
}

function writeStore(file, store, backgroundIo = null) {
  if (backgroundIo?.writeJsonAtomic) {
    if (!backgroundIo.writeJsonAtomic(file, store)) throw new Error('background combat-learning persistence unavailable');
    return;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(store, null, 2) + '\n');
  fs.renameSync(temporary, file);
}

function escapeOutcome(reason) {
  return /active-target-missing|target-unavailable|target-switched|action-released|pursuit|out-of-range|max-ms|approach/i.test(String(reason || ''));
}

function createCombatCompletionTracker(options = {}) {
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const file = path.resolve(options.file || path.join(process.cwd(), 'data', 'browserless-runner', 'combat-learning.json'));
  const decayDays = Math.max(1, Number(options.decayDays || 30));
  const maxPlayers = Math.max(32, Number(options.maxPlayers || 512));
  const backgroundIo = options.backgroundIo && typeof options.backgroundIo === 'object' ? options.backgroundIo : null;
  let store = readStore(file);
  let lastStrategyWriteAt = 0;

  function decayed(player, atMs) {
    const previousAt = Date.parse(String(player?.updatedAt || ''));
    const elapsedDays = Number.isFinite(previousAt) ? Math.max(0, atMs - previousAt) / DAY_MS : 0;
    const factor = Math.exp(-elapsedDays / decayDays);
    return {
      attempts: numeric(player?.attempts) * factor,
      successes: numeric(player?.successes) * factor,
      failures: numeric(player?.failures) * factor,
      escapes: numeric(player?.escapes) * factor,
      targetDamage: numeric(player?.targetDamage) * factor,
      selfDamage: numeric(player?.selfDamage) * factor,
      combatSamples: numeric(player?.combatSamples) * factor
    };
  }

  function trimPlayers() {
    store.players = Object.fromEntries(Object.entries(store.players)
      .sort((a, b) => String(b[1].updatedAt || '').localeCompare(String(a[1].updatedAt || '')))
      .slice(0, maxPlayers));
  }

  function persist(atMs) {
    trimPlayers();
    store.schemaVersion = SCHEMA_VERSION;
    store.updatedAt = new Date(atMs).toISOString();
    writeStore(file, store, backgroundIo);
  }

  function observe(event = {}) {
    const userId = event.userId ?? event.user_id;
    if (userId === null || userId === undefined || userId === '') return null;
    if (!['engagement-started', 'killed', 'not-killed'].includes(String(event.type || ''))) return null;
    const atMs = Date.parse(String(event.at || '')) || now();
    const key = `user:${userId}`;
    const previous = normalizePlayer(key, store.players[key] || {}) || normalizePlayer(key, { userId });
    const values = decayed(previous, atMs);
    if (event.type === 'engagement-started') values.attempts += 1;
    else if (event.type === 'killed') values.successes += 1;
    else {
      values.failures += 1;
      if (escapeOutcome(event.reason)) values.escapes += 1;
    }
    values.attempts = Math.max(values.attempts, values.successes + values.failures);
    store.players[key] = {
      ...previous,
      userId: String(userId),
      name: String(event.name || previous.name || ''),
      ...values,
      lastOutcome: String(event.type || ''),
      lastReason: String(event.reason || ''),
      updatedAt: new Date(atMs).toISOString()
    };
    persist(atMs);
    return probability(userId, atMs);
  }

  function observeCombatSample(sample = {}) {
    const userId = sample.userId ?? sample.user_id ?? sample.targetId;
    if (userId === null || userId === undefined || userId === '') return null;
    const atMs = Number.isFinite(Number(sample.atMs)) ? Number(sample.atMs) : now();
    const key = `user:${userId}`;
    const previous = normalizePlayer(key, store.players[key] || {}) || normalizePlayer(key, { userId });
    const values = decayed(previous, atMs);
    const startedAt = numeric(sample.startedAt);
    const targetDamage = numeric(sample.targetDamage);
    const selfDamage = numeric(sample.selfDamage);
    const sameEngagement = startedAt > 0 && startedAt === numeric(previous.currentEngagementStartedAt);
    const targetDelta = Math.max(0, targetDamage - (sameEngagement ? numeric(previous.currentTargetDamage) : 0));
    const selfDelta = Math.max(0, selfDamage - (sameEngagement ? numeric(previous.currentSelfDamage) : 0));
    if (!(targetDelta > 0 || selfDelta > 0 || !sameEngagement)) return probability(userId, atMs);
    values.targetDamage += targetDelta;
    values.selfDamage += selfDelta;
    if (targetDelta > 0 || selfDelta > 0) values.combatSamples += 1;
    store.players[key] = {
      ...previous,
      userId: String(userId),
      name: String(sample.name || previous.name || ''),
      ...values,
      currentEngagementStartedAt: startedAt,
      currentTargetDamage: targetDamage,
      currentSelfDamage: selfDamage,
      lastSampleAt: new Date(atMs).toISOString(),
      updatedAt: new Date(atMs).toISOString()
    };
    persist(atMs);
    return probability(userId, atMs);
  }

  function probability(userId, atMs = now()) {
    const player = store.players[`user:${userId}`];
    if (!player) {
      return {
        probability: 1 / 3,
        source: 'conservative-prior',
        attempts: 0,
        successes: 0,
        failures: 0,
        escapeRate: null,
        damageExchangeRatio: null
      };
    }
    const values = decayed(player, atMs);
    const outcomes = values.successes + values.failures;
    return {
      probability: (values.successes + 1) / (outcomes + 3),
      source: 'stable-user-completion-history',
      ...values,
      escapeRate: outcomes > 0 ? (values.escapes + 1) / (outcomes + 3) : null,
      damageExchangeRatio: values.combatSamples > 0
        ? (values.targetDamage + 3) / (values.selfDamage + 3)
        : null,
      lastSampleAt: player.lastSampleAt || ''
    };
  }

  function status() {
    return { file, schemaVersion: SCHEMA_VERSION, updatedAt: store.updatedAt, playerCount: Object.keys(store.players).length };
  }

  function strategyLearning() {
    return store.strategyLearning ? JSON.parse(JSON.stringify(store.strategyLearning)) : null;
  }

  function updateStrategyLearning(value, atMs = now()) {
    if (!value || typeof value !== 'object') return false;
    if (Number(atMs) - lastStrategyWriteAt < 5000) return false;
    store.strategyLearning = sanitizeStrategyLearning(value);
    persist(Number(atMs));
    lastStrategyWriteAt = Number(atMs);
    return true;
  }

  let storedSchema = null;
  try {
    storedSchema = Number(JSON.parse(fs.readFileSync(file, 'utf8'))?.schemaVersion);
  } catch (_) {}
  if (!fs.existsSync(file) || storedSchema !== SCHEMA_VERSION) {
    persist(now());
  }
  return {
    file,
    observe,
    observeCombatSample,
    probability,
    status,
    strategyLearning,
    updateStrategyLearning
  };
}

module.exports = {
  SCHEMA_VERSION,
  createCombatCompletionTracker,
  sanitizeStrategyLearning,
  validGenericLearningKey
};
