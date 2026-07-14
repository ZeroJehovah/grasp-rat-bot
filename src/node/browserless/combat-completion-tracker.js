'use strict';

const fs = require('fs');
const path = require('path');

const SCHEMA_VERSION = 1;
const DAY_MS = 24 * 60 * 60 * 1000;

function emptyStore() {
  return { schemaVersion: SCHEMA_VERSION, updatedAt: '', players: {}, strategyLearning: null };
}

function readStore(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Number(value?.schemaVersion) !== SCHEMA_VERSION) return emptyStore();
    return { ...emptyStore(), ...value, players: value.players && typeof value.players === 'object' ? value.players : {} };
  } catch (_) {
    return emptyStore();
  }
}

function writeStore(file, store) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(store, null, 2) + '\n');
  fs.renameSync(temporary, file);
}

function createCombatCompletionTracker(options = {}) {
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const file = path.resolve(options.file || path.join(process.cwd(), 'data', 'browserless-runner', 'combat-learning.json'));
  const decayDays = Math.max(1, Number(options.decayDays || 30));
  const maxPlayers = Math.max(32, Number(options.maxPlayers || 512));
  let store = readStore(file);
  let lastStrategyWriteAt = 0;

  function decayed(player, atMs) {
    const previousAt = Date.parse(String(player?.updatedAt || ''));
    const elapsedDays = Number.isFinite(previousAt) ? Math.max(0, atMs - previousAt) / DAY_MS : 0;
    const factor = Math.exp(-elapsedDays / decayDays);
    return {
      attempts: Math.max(0, Number(player?.attempts || 0) * factor),
      successes: Math.max(0, Number(player?.successes || 0) * factor),
      failures: Math.max(0, Number(player?.failures || 0) * factor)
    };
  }

  function observe(event = {}) {
    const userId = event.userId ?? event.user_id;
    if (userId === null || userId === undefined || userId === '') return null;
    if (!['engagement-started', 'killed', 'not-killed'].includes(String(event.type || ''))) return null;
    const atMs = Date.parse(String(event.at || '')) || now();
    const key = `user:${userId}`;
    const previous = store.players[key] || {};
    const values = decayed(previous, atMs);
    if (event.type === 'engagement-started') values.attempts += 1;
    else if (event.type === 'killed') values.successes += 1;
    else values.failures += 1;
    // Old deployments may emit an outcome without the corresponding start.
    values.attempts = Math.max(values.attempts, values.successes + values.failures);
    store.players[key] = {
      userId: String(userId),
      name: String(event.name || previous.name || ''),
      ...values,
      lastOutcome: String(event.type || ''),
      lastReason: String(event.reason || ''),
      updatedAt: new Date(atMs).toISOString()
    };
    const ordered = Object.entries(store.players)
      .sort((a, b) => String(b[1].updatedAt || '').localeCompare(String(a[1].updatedAt || '')))
      .slice(0, maxPlayers);
    store.players = Object.fromEntries(ordered);
    store.updatedAt = new Date(atMs).toISOString();
    writeStore(file, store);
    return probability(userId, atMs);
  }

  function probability(userId, atMs = now()) {
    const player = store.players[`user:${userId}`];
    if (!player) return { probability: 1 / 3, source: 'conservative-prior', attempts: 0, successes: 0, failures: 0 };
    const values = decayed(player, atMs);
    return {
      probability: (values.successes + 1) / (values.successes + values.failures + 3),
      source: 'stable-user-completion-history',
      ...values
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
    const clone = JSON.parse(JSON.stringify(value));
    if (clone.modeMetrics && typeof clone.modeMetrics === 'object') {
      clone.modeMetrics = Object.fromEntries(Object.entries(clone.modeMetrics)
        .sort((a, b) => Number(b[1]?.updatedAt || 0) - Number(a[1]?.updatedAt || 0))
        .slice(0, 256));
    }
    if (Array.isArray(clone.recentShots)) clone.recentShots = clone.recentShots.slice(-80);
    store.strategyLearning = clone;
    store.updatedAt = new Date(Number(atMs)).toISOString();
    writeStore(file, store);
    lastStrategyWriteAt = Number(atMs);
    return true;
  }

  if (!fs.existsSync(file)) writeStore(file, store);
  return { file, observe, probability, status, strategyLearning, updateStrategyLearning };
}

module.exports = { createCombatCompletionTracker };
