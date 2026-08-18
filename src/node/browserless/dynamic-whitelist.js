'use strict';

const fs = require('fs');
const path = require('path');
const { COMBAT_CONSTANTS } = require('../../strategy/combat-constants');
const { isInvulnerableEntity } = require('../../strategy/combat-target-selection');

const SCHEMA_VERSION = 2;
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
      nameUpdatedAt: String(raw?.nameUpdatedAt || raw?.addedAt || ''),
      nameObservedAt: String(raw?.nameObservedAt || raw?.nameUpdatedAt || raw?.addedAt || ''),
      nameObservedTick: numberOrNull(raw?.nameObservedTick),
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
  const temporarilyDisabled = new Map();
  let store = read(file);
  if (!fs.existsSync(file)) write(file, store, backgroundIo);

  function persist(atMs = now()) {
    store.updatedAt = new Date(atMs).toISOString();
    write(file, store, backgroundIo);
  }
  function userId(target) { return numberOrNull(target?.userId ?? target?.user_id ?? target); }
  function isMember(target) {
    const id = userId(target);
    return id !== null && Boolean(store.players[playerKey(id)]);
  }
  function isWhitelistedTarget(target) {
    const id = userId(target);
    const key = playerKey(id);
    return id !== null && Boolean(store.players[key]) && !temporarilyDisabled.has(key);
  }
  function add(target, atMs = now()) {
    const id = userId(target);
    if (id === null) return { ok: false, reason: 'missing-user-id' };
    const name = playerName(target, `#${id}`);
    const key = playerKey(id);
    const existing = store.players[key] || null;
    const existed = Boolean(existing);
    const at = new Date(atMs).toISOString();
    store.players[key] = {
      key,
      userId: id,
      name,
      nameUpdatedAt: existing?.name === name ? String(existing.nameUpdatedAt || existing.addedAt || at) : at,
      nameObservedAt: at,
      nameObservedTick: numberOrNull(target?.lastObservedTick ?? target?.nameObservedTick ?? target?.tick)
        ?? numberOrNull(existing?.nameObservedTick),
      addedAt: existing?.addedAt || at
    };
    persist(atMs);
    return { ok: true, added: !existed, player: clone(store.players[key]) };
  }
  function observePlayerNames(targets = [], detail = {}) {
    const atMs = Number.isFinite(Number(detail.atMs)) ? Number(detail.atMs) : now();
    const at = new Date(atMs).toISOString();
    const sourceTick = numberOrNull(detail.tick);
    const updates = [];
    for (const target of targets || []) {
      const id = userId(target);
      if (id === null) continue;
      const key = playerKey(id);
      const existing = store.players[key] || null;
      if (!existing) continue;
      const name = playerName(target);
      if (!name) continue;
      const tick = numberOrNull(target?.tick) ?? sourceTick;
      const observedAtMs = Number.isFinite(Date.parse(String(target?.nameObservedAt || '')))
        ? Date.parse(String(target.nameObservedAt))
        : atMs;
      const previousObservedAtMs = Date.parse(String(
        existing.nameObservedAt || existing.nameUpdatedAt || existing.addedAt || ''
      ));
      const previousTick = numberOrNull(existing.nameObservedTick);
      if (Number.isFinite(previousObservedAtMs) && observedAtMs < previousObservedAtMs) continue;
      if (Number.isFinite(previousObservedAtMs)
        && observedAtMs === previousObservedAtMs
        && tick !== null
        && previousTick !== null
        && tick < previousTick) continue;
      existing.nameObservedAt = new Date(observedAtMs).toISOString();
      if (tick !== null) existing.nameObservedTick = tick;
      if (existing.name === name) continue;
      const oldName = existing.name;
      existing.name = name;
      existing.nameUpdatedAt = at;
      const disabled = temporarilyDisabled.get(key);
      if (disabled) disabled.name = name;
      updates.push({
        type: 'name-updated',
        at,
        source: String(detail.source || 'observation'),
        userId: id,
        oldName,
        name
      });
    }
    if (updates.length) persist(atMs);
    return { ok: true, updated: updates.length, updates: clone(updates) };
  }
  function observeDamage(target, state, detail = {}) {
    const id = userId(target);
    if (id === null) return { ok: false, disabled: false, deferred: false, reason: 'missing-user-id' };
    const key = playerKey(id);
    if (!store.players[key]) return { ok: true, disabled: false, deferred: false, whitelisted: false, userId: id };
    const atMs = Number.isFinite(Number(detail.atMs)) ? Number(detail.atMs) : now();
    const existingDisable = temporarilyDisabled.get(key);
    if (existingDisable) {
      return {
        ok: true,
        disabled: true,
        newlyDisabled: false,
        deferred: false,
        whitelisted: true,
        userId: id,
        name: store.players[key].name,
        reason: existingDisable.reason,
        disabledAt: existingDisable.disabledAt
      };
    }
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
      return { ok: true, disabled: false, deferred: true, reason: 'possible-crossfire', ...policy };
    }
    const reason = thresholdExceeded ? 'damage-over-10-in-60s' : 'damaged-self-no-crossfire';
    const disabled = {
      key,
      userId: id,
      name: store.players[key].name,
      reason,
      disabledAt: atMs,
      engagedAt: 0
    };
    temporarilyDisabled.set(key, disabled);
    return {
      ok: true,
      disabled: true,
      newlyDisabled: true,
      deferred: false,
      ...policy,
      reason,
      disabledAt: atMs
    };
  }
  function observeBattles(state, detail = {}) {
    if (!temporarilyDisabled.size) return [];
    const atMs = Number.isFinite(Number(detail.atMs)) ? Number(detail.atMs) : now();
    const self = state?.realtime?.self || null;
    const entities = Array.isArray(state?.realtime?.entities) ? state.realtime.entities : [];
    const combatTargetId = userId(detail.decisionState?.combatTarget?.id
      ?? detail.decisionState?.combatTarget?.userId
      ?? detail.decisionState?.combatTarget?.user_id);
    const disengageRangeCm = Math.max(
      0,
      Number(detail.disengageRangeCm ?? COMBAT_CONSTANTS.DISENGAGE_RANGE)
    );
    const selfPoint = point(self);
    const restored = [];

    for (const [key, disabled] of temporarilyDisabled.entries()) {
      const target = entities.find(entity => entityUserId(entity) === disabled.userId) || null;
      let reason = '';
      if (!self) reason = 'self-left-realtime';
      else if (!entityAlive(self)) reason = 'self-dead';
      else if (!target) reason = 'target-left-realtime';
      else if (!entityAlive(target)) reason = 'target-dead';
      else {
        const targetPoint = point(target);
        const distanceCm = selfPoint && targetPoint
          ? Math.hypot(targetPoint.x - selfPoint.x, targetPoint.y - selfPoint.y)
          : numberOrNull(target.distance ?? target.distanceCm);
        if (distanceCm !== null && disengageRangeCm > 0 && distanceCm > disengageRangeCm) {
          reason = 'target-out-of-combat-range';
        } else if (combatTargetId === disabled.userId) {
          if (!disabled.engagedAt) disabled.engagedAt = atMs;
        } else if (disabled.engagedAt) {
          reason = 'combat-state-ended';
        }
      }
      if (!reason) continue;
      temporarilyDisabled.delete(key);
      recentDamage.delete(key);
      restored.push({
        ok: true,
        restored: true,
        userId: disabled.userId,
        name: disabled.name,
        reason,
        disabledReason: disabled.reason,
        disabledAt: disabled.disabledAt,
        engagedAt: disabled.engagedAt || 0,
        restoredAt: atMs
      });
    }
    return restored;
  }
  function hasPendingBattleObservation() {
    return temporarilyDisabled.size > 0;
  }
  function restoreAll(reason = 'combat-session-ended', atMs = now()) {
    const restored = [];
    for (const disabled of temporarilyDisabled.values()) {
      recentDamage.delete(disabled.key);
      restored.push({
        ok: true,
        restored: true,
        userId: disabled.userId,
        name: disabled.name,
        reason,
        disabledReason: disabled.reason,
        disabledAt: disabled.disabledAt,
        engagedAt: disabled.engagedAt || 0,
        restoredAt: atMs
      });
    }
    temporarilyDisabled.clear();
    return restored;
  }
  function status() {
    const players = Object.values(store.players).map(clone).sort((a, b) => String(a.name).localeCompare(String(b.name)));
    const disabledPlayers = Array.from(temporarilyDisabled.values()).map(clone);
    const userIds = players
      .filter(item => !temporarilyDisabled.has(playerKey(item.userId)))
      .map(item => item.userId);
    return {
      file,
      updatedAt: store.updatedAt,
      playerCount: players.length,
      memberUserIds: players.map(item => item.userId),
      enabledPlayerCount: userIds.length,
      temporarilyDisabledCount: disabledPlayers.length,
      players,
      userIds,
      temporarilyDisabled: disabledPlayers
    };
  }
  return {
    file,
    add,
    observePlayerNames,
    observeDamage,
    observeBattles,
    hasPendingBattleObservation,
    restoreAll,
    isMember,
    isEnabled: isWhitelistedTarget,
    isWhitelistedTarget,
    status
  };
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
