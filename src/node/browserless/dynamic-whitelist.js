'use strict';

const fs = require('fs');
const path = require('path');
const { COMBAT_CONSTANTS } = require('../../strategy/combat-constants');
const { isInvulnerableEntity } = require('../../strategy/combat-target-selection');

const SCHEMA_VERSION = 1;
const DEFAULT_DAMAGE_WINDOW_MS = 60 * 1000;
const DEFAULT_DAMAGE_THRESHOLD_HP = 10;
const DEFAULT_CROSSFIRE_CONE_HALF_ANGLE_DEG = 30;

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function playerName(value, fallback = '') {
  return String(value?.name || value?.label || value?.username || value?.user_name
    || value?.displayName || value?.display_name || fallback || '').trim();
}

function playerKey(userId) {
  const id = numberOrNull(userId);
  return id === null ? '' : `user:${id}`;
}

function clone(value) {
  return value === null || value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function entityUserId(value) {
  return numberOrNull(value?.userId ?? value?.user_id ?? value);
}

function entityDrop(value) {
  return numberOrNull(
    value?.drop
      ?? value?.Drop
      ?? value?.reward
      ?? value?.coin_reward
      ?? value?.death_reward_preview
      ?? value?.death_drop_coins
  );
}

function entityAlive(value) {
  const hp = numberOrNull(value?.hp ?? value?.health);
  if (hp !== null && hp <= 0) return false;
  const life = String(value?.life ?? value?.state ?? value?.status ?? '').trim().toLowerCase();
  return !['dead', 'died', 'killed'].includes(life);
}

function point(value) {
  const x = numberOrNull(value?.x);
  const y = numberOrNull(value?.y);
  return x === null || y === null ? null : { x, y };
}

function crossfireBystanders(state, actorTarget, options = {}) {
  const entities = Array.isArray(state?.realtime?.entities) ? state.realtime.entities : [];
  const self = state?.realtime?.self || null;
  const selfId = entityUserId(self) ?? entityUserId(state?.userId);
  const actorId = entityUserId(actorTarget);
  const actor = entities.find(entity => entityUserId(entity) === actorId) || actorTarget;
  const actorPoint = point(actor);
  const selfPoint = point(self);
  if (actorId === null || !actorPoint || !selfPoint) return [];

  const towardSelfX = selfPoint.x - actorPoint.x;
  const towardSelfY = selfPoint.y - actorPoint.y;
  const selfDistance = Math.hypot(towardSelfX, towardSelfY);
  if (!(selfDistance > 0)) return [];
  const attackRangeCm = Math.max(0, Number(options.attackRangeCm ?? COMBAT_CONSTANTS.ATTACK_RANGE));
  const halfAngleDeg = Math.min(90, Math.max(0, Number(
    options.crossfireConeHalfAngleDeg ?? DEFAULT_CROSSFIRE_CONE_HALF_ANGLE_DEG
  )));
  const minimumCosine = Math.cos(halfAngleDeg * Math.PI / 180);
  const matches = [];

  for (const entity of entities) {
    const userId = entityUserId(entity);
    if (userId === null || userId === selfId || userId === actorId) continue;
    if (!entityAlive(entity) || isInvulnerableEntity(entity)) continue;
    const drop = entityDrop(entity);
    if (drop === null || drop <= 0) continue;
    const entityPoint = point(entity);
    if (!entityPoint) continue;
    const dx = entityPoint.x - actorPoint.x;
    const dy = entityPoint.y - actorPoint.y;
    const distance = Math.hypot(dx, dy);
    if (!(distance > 0) || distance > attackRangeCm) continue;
    const cosine = (towardSelfX * dx + towardSelfY * dy) / (selfDistance * distance);
    if (!Number.isFinite(cosine) || cosine < minimumCosine) continue;
    matches.push({
      userId,
      name: playerName(entity, `#${userId}`),
      drop,
      distanceCm: Math.round(distance),
      angleDeg: Math.round(Math.acos(Math.max(-1, Math.min(1, cosine))) * 1800 / Math.PI) / 10
    });
  }
  return matches.sort((a, b) => a.angleDeg - b.angleDeg || a.distanceCm - b.distanceCm).slice(0, 8);
}

function normalize(value) {
  const players = {};
  for (const [key, raw] of Object.entries(value?.players || {})) {
    const userId = numberOrNull(raw?.userId ?? raw?.user_id ?? String(key).replace(/^user:/, ''));
    if (userId === null) continue;
    players[playerKey(userId)] = {
      key: playerKey(userId),
      userId,
      name: playerName(raw, `#${userId}`),
      addedAt: String(raw?.addedAt || '')
    };
  }
  return { schemaVersion: SCHEMA_VERSION, updatedAt: String(value?.updatedAt || ''), players };
}

function read(file) {
  try { return normalize(JSON.parse(fs.readFileSync(file, 'utf8'))); } catch (_) {
    return { schemaVersion: SCHEMA_VERSION, updatedAt: '', players: {} };
  }
}

function write(file, store, backgroundIo = null) {
  if (backgroundIo?.writeJsonAtomic) {
    if (!backgroundIo.writeJsonAtomic(file, store)) throw new Error('background dynamic whitelist persistence unavailable');
    return;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(store, null, 2)}\n`);
  fs.renameSync(temporary, file);
}

function createDynamicWhitelist(options = {}) {
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const file = path.resolve(options.file || path.join(process.cwd(), 'data', 'browserless-runner', 'dynamic-whitelist.json'));
  const backgroundIo = options.backgroundIo || null;
  const damageWindowMs = Math.max(1, Number(options.damageWindowMs ?? DEFAULT_DAMAGE_WINDOW_MS));
  const damageThresholdHp = Math.max(0, Number(options.damageThresholdHp ?? DEFAULT_DAMAGE_THRESHOLD_HP));
  const crossfireOptions = {
    attackRangeCm: options.attackRangeCm,
    crossfireConeHalfAngleDeg: options.crossfireConeHalfAngleDeg
  };
  const recentDamage = new Map();
  let store = read(file);
  if (!fs.existsSync(file)) write(file, store, backgroundIo);

  function persist(atMs = now()) {
    store.updatedAt = new Date(atMs).toISOString();
    write(file, store, backgroundIo);
  }
  function userId(target) { return numberOrNull(target?.userId ?? target?.user_id ?? target); }
  function isWhitelistedTarget(target) {
    const id = userId(target);
    return id !== null && Boolean(store.players[playerKey(id)]);
  }
  function add(target, atMs = now()) {
    const id = userId(target);
    if (id === null) return { ok: false, reason: 'missing-user-id' };
    const name = playerName(target, `#${id}`);
    const key = playerKey(id);
    const existed = Boolean(store.players[key]);
    store.players[key] = { key, userId: id, name, addedAt: store.players[key]?.addedAt || new Date(atMs).toISOString() };
    persist(atMs);
    return { ok: true, added: !existed, player: clone(store.players[key]) };
  }
  function remove(target, reason = 'damage', atMs = now()) {
    const id = userId(target);
    if (id === null) return { ok: false, reason: 'missing-user-id' };
    const key = playerKey(id);
    if (!store.players[key]) return { ok: true, removed: false, userId: id };
    const player = store.players[key];
    delete store.players[key];
    recentDamage.delete(key);
    persist(atMs);
    return { ok: true, removed: true, userId: id, name: player.name, reason };
  }
  function observeDamage(target, state, detail = {}) {
    const id = userId(target);
    if (id === null) return { ok: false, removed: false, deferred: false, reason: 'missing-user-id' };
    const key = playerKey(id);
    if (!store.players[key]) return { ok: true, removed: false, deferred: false, whitelisted: false, userId: id };
    const atMs = Number.isFinite(Number(detail.atMs)) ? Number(detail.atMs) : now();
    const hpLost = Math.max(0, Number(detail.hpLost || 0));
    const cutoff = atMs - damageWindowMs;
    const samples = (recentDamage.get(key) || []).filter(sample => sample.atMs >= cutoff);
    if (hpLost > 0) samples.push({ atMs, hpLost });
    recentDamage.set(key, samples);
    const damageInWindow = Math.round(samples.reduce((sum, sample) => sum + sample.hpLost, 0) * 10) / 10;
    const thresholdExceeded = damageInWindow > damageThresholdHp;
    const bystanders = crossfireBystanders(state, target, crossfireOptions);
    const possibleCrossfire = bystanders.length > 0;
    const policy = {
      whitelisted: true,
      userId: id,
      name: store.players[key].name,
      hpLost,
      damageInWindow,
      damageWindowMs,
      damageThresholdHp,
      thresholdExceeded,
      possibleCrossfire,
      attackRangeCm: Math.max(0, Number(crossfireOptions.attackRangeCm ?? COMBAT_CONSTANTS.ATTACK_RANGE)),
      coneHalfAngleDeg: Math.min(90, Math.max(0, Number(
        crossfireOptions.crossfireConeHalfAngleDeg ?? DEFAULT_CROSSFIRE_CONE_HALF_ANGLE_DEG
      ))),
      bystanders
    };
    if (possibleCrossfire && !thresholdExceeded) {
      return { ok: true, removed: false, deferred: true, reason: 'possible-crossfire', ...policy };
    }
    const reason = thresholdExceeded ? 'damage-over-10-in-60s' : 'damaged-self-no-crossfire';
    const removal = remove(target, reason, atMs);
    return { ...removal, deferred: false, ...policy, reason };
  }
  function status() {
    const players = Object.values(store.players).map(clone).sort((a, b) => String(a.name).localeCompare(String(b.name)));
    return { file, updatedAt: store.updatedAt, playerCount: players.length, players, userIds: players.map(item => item.userId) };
  }
  return { file, add, remove, observeDamage, isWhitelistedTarget, status };
}

module.exports = {
  DEFAULT_CROSSFIRE_CONE_HALF_ANGLE_DEG,
  DEFAULT_DAMAGE_THRESHOLD_HP,
  DEFAULT_DAMAGE_WINDOW_MS,
  createDynamicWhitelist,
  crossfireBystanders,
  playerName,
  numberOrNull
};
