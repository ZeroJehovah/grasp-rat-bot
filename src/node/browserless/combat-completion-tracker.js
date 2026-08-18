'use strict';

const fs = require('fs');
const path = require('path');
const {
  nameObservationFreshness,
  numberOrNull,
  observedNameAtMs,
  storedNameAtMs
} = require('./player-name-observation');

const SCHEMA_VERSION = 3;
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
    nameObservedAt: String(player.nameObservedAt || player.updatedAt || ''),
    nameObservedTick: numberOrNull(player.nameObservedTick),
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

function validRouteContextKey(key) {
  return /^mode=[^|]+\|distance=[^|]+\|direction=[^|]+\|dwell=[^|]+\|speed=[^|]+\|radial=[^|]+\|lateral=[^|]+$/.test(String(key || ''));
}

function validRouteFeedbackKey(key) {
  const text = String(key || '');
  const marker = text.lastIndexOf('|candidate=');
  return marker > 0
    && validRouteContextKey(text.slice(0, marker))
    && Boolean(text.slice(marker + '|candidate='.length));
}

function boundedLearningMap(value, limit, validCell, normalizeCell) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const entries = [];
  for (const key of Object.keys(value)) {
    const cell = value[key];
    if (!validCell(key, cell)) continue;
    entries.push({
      key: String(key),
      cell: normalizeCell(cell),
      updatedAt: numeric(cell.updatedAt)
    });
  }
  if (entries.length > limit) {
    entries.sort((left, right) => right.updatedAt - left.updatedAt);
    entries.length = limit;
  }
  const output = {};
  for (const entry of entries) output[entry.key] = entry.cell;
  return output;
}

function sanitizeRouteOutcomes(value) {
  const entries = [];
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const state of Object.keys(value)) {
      const count = numeric(value[state]);
      if (!/^[a-z-]+$/.test(String(state)) || !(count > 0)) continue;
      entries.push({ state: String(state), count });
    }
  }
  entries.sort((left, right) => right.count - left.count);
  if (entries.length > 9) entries.length = 9;
  const output = {};
  for (const entry of entries) output[entry.state] = entry.count;
  return output;
}

function sanitizeStrategyLearning(value) {
  if (!value || typeof value !== 'object') return null;
  const genericCell = (key, cell) => validGenericLearningKey(key) && cell && typeof cell === 'object';
  const hitRateByModeDistance = boundedLearningMap(
    value.hitRateByModeDistance,
    512,
    genericCell,
    cell => ({
        shots: numeric(cell.shots),
        hits: numeric(cell.hits),
        updatedAt: numeric(cell.updatedAt)
      })
  );
  const modeMetrics = boundedLearningMap(
    value.modeMetrics,
    256,
    genericCell,
    cell => ({
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
      })
  );
  const routeTransitions = boundedLearningMap(
    value.routeTransitions,
    256,
    (key, cell) => validRouteContextKey(key)
      && cell && typeof cell === 'object'
      && numeric(cell.samples) >= 4,
    cell => ({
        samples: numeric(cell.samples),
        outcomes: sanitizeRouteOutcomes(cell.outcomes),
        updatedAt: numeric(cell.updatedAt)
      })
  );
  const routeAimFeedback = boundedLearningMap(
    value.routeAimFeedback,
    512,
    (key, cell) => validRouteFeedbackKey(key)
      && cell && typeof cell === 'object'
      && numeric(cell.samples) >= 4,
    cell => ({
        samples: numeric(cell.samples),
        hits: Math.min(numeric(cell.hits), numeric(cell.samples)),
        missTotalCm: numeric(cell.missTotalCm),
        updatedAt: numeric(cell.updatedAt)
      })
  );
  return { hitRateByModeDistance, modeMetrics, routeTransitions, routeAimFeedback };
}

function equalLearningCell(left, right) {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  for (const key of leftKeys) {
    const leftValue = left[key];
    const rightValue = right[key];
    if (leftValue && typeof leftValue === 'object') {
      if (!equalLearningCell(leftValue, rightValue)) return false;
    } else if (leftValue !== rightValue) {
      return false;
    }
  }
  return true;
}

function strategyLearningPatch(previous, next) {
  const patch = {};
  const deletePaths = [];
  let changed = false;
  for (const category of ['hitRateByModeDistance', 'modeMetrics', 'routeTransitions', 'routeAimFeedback']) {
    const before = previous?.[category] && typeof previous[category] === 'object' ? previous[category] : {};
    const after = next?.[category] && typeof next[category] === 'object' ? next[category] : {};
    const categoryPatch = {};
    for (const [key, cell] of Object.entries(after)) {
      if (equalLearningCell(before[key], cell)) continue;
      if (Object.prototype.hasOwnProperty.call(before, key)) {
        deletePaths.push(['strategyLearning', category, key]);
      }
      categoryPatch[key] = cell;
      changed = true;
    }
    for (const key of Object.keys(before)) {
      if (Object.prototype.hasOwnProperty.call(after, key)) continue;
      deletePaths.push(['strategyLearning', category, key]);
      changed = true;
    }
    patch[category] = categoryPatch;
  }
  return { changed, patch, deletePaths };
}

function readStore(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (![1, 2, SCHEMA_VERSION].includes(Number(value?.schemaVersion))) return emptyStore();
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

function playerUserId(value) {
  return value?.userId ?? value?.user_id ?? value?.targetUserId ?? value?.target_user_id;
}

function playerName(value) {
  return String(
    value?.name
      || value?.targetName
      || value?.target_name
      || value?.label
      || value?.username
      || value?.user_name
      || value?.displayName
      || value?.display_name
      || ''
  ).trim();
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
    const previousKeys = new Set(Object.keys(store.players));
    store.players = Object.fromEntries(Object.entries(store.players)
      .sort((a, b) => String(b[1].updatedAt || '').localeCompare(String(a[1].updatedAt || '')))
      .slice(0, maxPlayers));
    return Array.from(previousKeys).filter(key => !Object.prototype.hasOwnProperty.call(store.players, key));
  }

  function persist(atMs, detail = {}) {
    const deletedPlayers = trimPlayers();
    store.schemaVersion = SCHEMA_VERSION;
    store.updatedAt = new Date(atMs).toISOString();
    if (backgroundIo?.writeJsonPatchAtomic && detail.incremental !== false) {
      const dirtyPlayerKeys = Array.from(new Set(detail.dirtyPlayerKeys || []));
      const playerPatch = Object.fromEntries(dirtyPlayerKeys
        .filter(key => Object.prototype.hasOwnProperty.call(store.players, key))
        .map(key => [key, store.players[key]]));
      const patch = {
        schemaVersion: SCHEMA_VERSION,
        updatedAt: store.updatedAt
      };
      if (dirtyPlayerKeys.length) patch.players = playerPatch;
      if (detail.strategyPatch) patch.strategyLearning = detail.strategyPatch;
      const deletePaths = [
        ...deletedPlayers.map(key => ['players', key]),
        ...(detail.deletePaths || [])
      ];
      if (!backgroundIo.writeJsonPatchAtomic(file, patch, deletePaths)) {
        throw new Error('background combat-learning patch persistence unavailable');
      }
      return;
    }
    writeStore(file, store, backgroundIo);
  }

  function observe(event = {}) {
    const userId = playerUserId(event);
    if (userId === null || userId === undefined || userId === '') return null;
    if (!['engagement-started', 'killed', 'not-killed'].includes(String(event.type || ''))) return null;
    const atMs = Date.parse(String(event.at || '')) || now();
    const key = `user:${userId}`;
    const previous = normalizePlayer(key, store.players[key] || {}) || normalizePlayer(key, { userId });
    const values = decayed(previous, atMs);
    const observedName = playerName(event);
    const observedAtMs = observedNameAtMs(event, atMs);
    const previousObservedAtMs = storedNameAtMs(previous, [previous.updatedAt]);
    const observedTick = numberOrNull(event.tick);
    const freshness = nameObservationFreshness({
      observedAtMs,
      observedTick,
      previousObservedAtMs,
      previousObservedTick: previous.nameObservedTick
    });
    const useObservedName = Boolean(observedName && freshness.accepted);
    if (event.type === 'engagement-started') values.attempts += 1;
    else if (event.type === 'killed') values.successes += 1;
    else if (event.neutral !== true) {
      values.failures += 1;
      if (escapeOutcome(event.reason)) values.escapes += 1;
    }
    values.attempts = Math.max(values.attempts, values.successes + values.failures);
    store.players[key] = {
      ...previous,
      userId: String(userId),
      name: useObservedName ? observedName : String(previous.name || ''),
      nameObservedAt: useObservedName
        ? new Date(observedAtMs).toISOString()
        : String(previous.nameObservedAt || previous.updatedAt || ''),
      nameObservedTick: useObservedName && observedTick !== null
        ? observedTick
        : previous.nameObservedTick,
      ...values,
      lastOutcome: event.type === 'not-killed' && event.neutral === true ? 'neutral' : String(event.type || ''),
      lastReason: String(event.reason || ''),
      updatedAt: new Date(atMs).toISOString()
    };
    persist(atMs, { dirtyPlayerKeys: [key] });
    return probability(userId, atMs);
  }

  function observeCombatSample(sample = {}) {
    const userId = playerUserId(sample) ?? sample.targetId;
    if (userId === null || userId === undefined || userId === '') return null;
    const atMs = Number.isFinite(Number(sample.atMs)) ? Number(sample.atMs) : now();
    const key = `user:${userId}`;
    const previous = normalizePlayer(key, store.players[key] || {}) || normalizePlayer(key, { userId });
    const values = decayed(previous, atMs);
    const observedName = playerName(sample);
    const observedAtMs = observedNameAtMs(sample, atMs);
    const previousObservedAtMs = storedNameAtMs(previous, [previous.updatedAt]);
    const observedTick = numberOrNull(sample.tick);
    const freshness = nameObservationFreshness({
      observedAtMs,
      observedTick,
      previousObservedAtMs,
      previousObservedTick: previous.nameObservedTick
    });
    const useObservedName = Boolean(observedName && freshness.accepted);
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
      name: useObservedName ? observedName : String(previous.name || ''),
      nameObservedAt: useObservedName
        ? new Date(observedAtMs).toISOString()
        : String(previous.nameObservedAt || previous.updatedAt || ''),
      nameObservedTick: useObservedName && observedTick !== null
        ? observedTick
        : previous.nameObservedTick,
      ...values,
      currentEngagementStartedAt: startedAt,
      currentTargetDamage: targetDamage,
      currentSelfDamage: selfDamage,
      lastSampleAt: new Date(atMs).toISOString(),
      updatedAt: new Date(atMs).toISOString()
    };
    persist(atMs, { dirtyPlayerKeys: [key] });
    return probability(userId, atMs);
  }

  function observePlayerNames(targets = [], detail = {}) {
    const atMs = Number.isFinite(Number(detail.atMs)) ? Number(detail.atMs) : now();
    const sourceTick = numberOrNull(detail.tick);
    const dirtyPlayerKeys = [];
    const updates = [];
    for (const target of targets || []) {
      const userId = playerUserId(target);
      if (userId === null || userId === undefined || userId === '') continue;
      const key = `user:${userId}`;
      const existing = store.players[key] || null;
      if (!existing) continue;
      const name = playerName(target);
      if (!name) continue;
      const observedTick = numberOrNull(target?.tick) ?? sourceTick;
      const observedAtMs = observedNameAtMs(target, atMs);
      const previousObservedAtMs = storedNameAtMs(existing, [existing.updatedAt]);
      const freshness = nameObservationFreshness({
        observedAtMs,
        observedTick,
        previousObservedAtMs,
        previousObservedTick: existing.nameObservedTick
      });
      if (!freshness.accepted) continue;
      const oldName = existing.name;
      existing.name = name;
      existing.nameObservedAt = new Date(observedAtMs).toISOString();
      if (observedTick !== null) existing.nameObservedTick = observedTick;
      dirtyPlayerKeys.push(key);
      if (oldName !== name) updates.push({ userId: String(userId), oldName, name });
    }
    if (dirtyPlayerKeys.length) persist(atMs, { dirtyPlayerKeys });
    return { ok: true, updated: updates.length, updates };
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
    const next = sanitizeStrategyLearning(value);
    const difference = strategyLearningPatch(store.strategyLearning, next);
    store.strategyLearning = next;
    lastStrategyWriteAt = Number(atMs);
    if (!difference.changed) return false;
    persist(Number(atMs), {
      strategyPatch: difference.patch,
      deletePaths: difference.deletePaths
    });
    return true;
  }

  let storedSchema = null;
  try {
    storedSchema = Number(JSON.parse(fs.readFileSync(file, 'utf8'))?.schemaVersion);
  } catch (_) {}
  if (!fs.existsSync(file) || storedSchema !== SCHEMA_VERSION) {
    persist(now(), { incremental: false });
  }
  return {
    file,
    observe,
    observeCombatSample,
    observePlayerNames,
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
  validGenericLearningKey,
  validRouteContextKey,
  validRouteFeedbackKey
};
