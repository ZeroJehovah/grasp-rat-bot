'use strict';

const fs = require('fs');
const path = require('path');

const SCHEMA_VERSION = 1;

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
    persist(atMs);
    return { ok: true, removed: true, userId: id, name: player.name, reason };
  }
  function status() {
    const players = Object.values(store.players).map(clone).sort((a, b) => String(a.name).localeCompare(String(b.name)));
    return { file, updatedAt: store.updatedAt, playerCount: players.length, players, userIds: players.map(item => item.userId) };
  }
  return { file, add, remove, isWhitelistedTarget, status };
}

module.exports = { createDynamicWhitelist, playerName, numberOrNull };
