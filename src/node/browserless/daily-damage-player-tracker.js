'use strict';

const fs = require('fs');
const path = require('path');

const SCHEMA_VERSION = 1;
const UTC8_OFFSET_MS = 8 * 60 * 60 * 1000;
const DEFAULT_COMBAT_MEMORY_MS = 10000;

function cloneJson(value) {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function dayKey(ms = Date.now()) {
  return new Date(Number(ms) + UTC8_OFFSET_MS).toISOString().slice(0, 10);
}

function playerUserId(value) {
  return numberOrNull(
    value?.userId
      ?? value?.user_id
      ?? value?.targetUserId
      ?? value?.target_user_id
  );
}

function playerName(value, fallback = '') {
  return String(
    value?.name
      || value?.targetName
      || value?.target_name
      || value?.label
      || value?.username
      || value?.user_name
      || value?.displayName
      || value?.display_name
      || fallback
      || ''
  ).trim();
}

function playerKey(userId) {
  const id = numberOrNull(userId);
  return id === null ? '' : `user:${id}`;
}

function bulletOwnerId(bullet) {
  return numberOrNull(
    bullet?.owner_user_id
      ?? bullet?.ownerUserId
      ?? bullet?.owner_id
      ?? bullet?.ownerId
      ?? bullet?.source_user_id
      ?? bullet?.user_id
      ?? bullet?.userId
  );
}

function playerHp(value) {
  return numberOrNull(value?.hp ?? value?.health);
}

function emptyStore(day = '') {
  return {
    schemaVersion: SCHEMA_VERSION,
    day,
    updatedAt: '',
    players: {}
  };
}

function normalizePlayer(key, player) {
  if (!player || typeof player !== 'object') return null;
  const userId = playerUserId(player) ?? numberOrNull(String(key || '').replace(/^user:/, ''));
  if (userId === null) return null;
  return {
    key: playerKey(userId),
    userId,
    name: playerName(player, `#${userId}`),
    nameUpdatedAt: String(player.nameUpdatedAt || player.lastDamagedAt || player.firstDamagedAt || ''),
    nameObservedTick: numberOrNull(player.nameObservedTick ?? player.lastDamageTick),
    firstDamagedAt: String(player.firstDamagedAt || player.lastDamagedAt || ''),
    lastDamagedAt: String(player.lastDamagedAt || player.firstDamagedAt || ''),
    lastDamageTick: numberOrNull(player.lastDamageTick),
    damageEvents: Math.max(1, Math.round(Number(player.damageEvents || 1))),
    totalHpLost: Math.max(0, Number(player.totalHpLost || 0)),
    lastHpLost: Math.max(0, Number(player.lastHpLost || 0)),
    lastEvidence: String(player.lastEvidence || '')
  };
}

function normalizeStore(value, expectedDay) {
  if (!value || typeof value !== 'object' || value.day !== expectedDay) return emptyStore(expectedDay);
  const output = emptyStore(expectedDay);
  output.updatedAt = String(value.updatedAt || '');
  for (const [key, player] of Object.entries(value.players || {})) {
    const normalized = normalizePlayer(key, player);
    if (normalized) output.players[normalized.key] = normalized;
  }
  return output;
}

function readStore(file, expectedDay) {
  try {
    return normalizeStore(JSON.parse(fs.readFileSync(file, 'utf8')), expectedDay);
  } catch (_) {
    return emptyStore(expectedDay);
  }
}

function writeStore(file, store) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(store, null, 2) + '\n');
  fs.renameSync(temporary, file);
}

function targetDistance(target, self) {
  const direct = numberOrNull(target?.distance);
  if (direct !== null) return direct;
  const x = numberOrNull(target?.x);
  const y = numberOrNull(target?.y);
  const selfX = numberOrNull(self?.x);
  const selfY = numberOrNull(self?.y);
  if ([x, y, selfX, selfY].some(value => value === null)) return Number.POSITIVE_INFINITY;
  return Math.hypot(x - selfX, y - selfY);
}

function createDailyDamagePlayerTracker(options = {}) {
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const onEvent = typeof options.onEvent === 'function' ? options.onEvent : null;
  const file = path.resolve(options.file || path.join(process.cwd(), 'data', 'browserless-runner', 'daily-damage-players.json'));
  const combatMemoryMs = Math.max(0, Number(options.combatMemoryMs ?? DEFAULT_COMBAT_MEMORY_MS));
  let store = readStore(file, dayKey(now()));
  let lastSelf = null;
  let lastCombatTarget = null;
  if (!fs.existsSync(file)) writeStore(file, store);

  function emit(event) {
    if (!onEvent || !event) return;
    try {
      onEvent(cloneJson(event));
    } catch (_) {}
  }

  function ensureToday(atMs = now()) {
    const today = dayKey(atMs);
    if (store.day === today) return false;
    store = emptyStore(today);
    writeStore(file, store);
    return true;
  }

  function persist(atMs = now()) {
    ensureToday(atMs);
    store.updatedAt = new Date(atMs).toISOString();
    writeStore(file, store);
  }

  function status(atMs = now()) {
    ensureToday(atMs);
    const players = Object.values(store.players)
      .map(player => cloneJson(player))
      .sort((a, b) => String(b.lastDamagedAt || '').localeCompare(String(a.lastDamagedAt || ''))
        || String(a.name || '').localeCompare(String(b.name || '')));
    return {
      day: store.day,
      updatedAt: store.updatedAt,
      file,
      playerCount: players.length,
      userIds: players.map(player => player.userId),
      players
    };
  }

  function observePlayerNames(targets = [], detail = {}) {
    const atMs = Number.isFinite(Number(detail.atMs)) ? Number(detail.atMs) : now();
    ensureToday(atMs);
    const at = new Date(atMs).toISOString();
    const sourceTick = numberOrNull(detail.tick);
    const updates = [];
    for (const target of targets || []) {
      const userId = playerUserId(target);
      if (userId === null) continue;
      const key = playerKey(userId);
      const existing = store.players[key] || null;
      if (!existing) continue;
      const name = playerName(target);
      if (!name) continue;
      const tick = numberOrNull(target?.tick) ?? sourceTick;
      const previousTick = numberOrNull(existing.nameObservedTick);
      if (tick !== null && previousTick !== null && tick < previousTick) continue;
      if (tick !== null) existing.nameObservedTick = tick;
      if (existing.name === name) continue;
      const oldName = existing.name;
      existing.name = name;
      existing.nameUpdatedAt = at;
      updates.push({
        type: 'name-updated',
        at,
        source: String(detail.source || 'observation'),
        userId,
        oldName,
        name
      });
    }
    if (updates.length) {
      persist(atMs);
      for (const event of updates) emit(event);
    }
    return { ok: true, updated: updates.length, updates: cloneJson(updates) };
  }

  function recordDamage(actor, detail = {}) {
    const userId = playerUserId(actor);
    if (userId === null) return { ok: false, reason: 'missing-user-id' };
    const atMs = Number.isFinite(Number(detail.atMs)) ? Number(detail.atMs) : now();
    ensureToday(atMs);
    const at = new Date(atMs).toISOString();
    const key = playerKey(userId);
    const existing = store.players[key] || null;
    const observedName = playerName(actor);
    const fallbackName = `#${userId}`;
    const meaningfulObservedName = observedName && observedName !== fallbackName ? observedName : '';
    const name = meaningfulObservedName || existing?.name || fallbackName;
    const hpLost = Math.max(0, Number(detail.hpLost || 0));
    store.players[key] = {
      key,
      userId,
      name,
      nameUpdatedAt: meaningfulObservedName && meaningfulObservedName !== existing?.name ? at : String(existing?.nameUpdatedAt || at),
      nameObservedTick: numberOrNull(detail.tick) ?? numberOrNull(existing?.nameObservedTick),
      firstDamagedAt: existing?.firstDamagedAt || at,
      lastDamagedAt: at,
      lastDamageTick: numberOrNull(detail.tick),
      damageEvents: Math.max(1, Number(existing?.damageEvents || 0) + 1),
      totalHpLost: Math.max(0, Number(existing?.totalHpLost || 0) + hpLost),
      lastHpLost: hpLost,
      lastEvidence: String(detail.evidence || '')
    };
    persist(atMs);
    const event = {
      type: 'damaged-by-player',
      at,
      userId,
      name,
      tick: numberOrNull(detail.tick),
      hpLost,
      evidence: String(detail.evidence || ''),
      added: !existing,
      damageEvents: store.players[key].damageEvents
    };
    emit(event);
    return { ok: true, event, player: cloneJson(store.players[key]) };
  }

  function currentCombatTarget(decision) {
    const combatAction = decision?.band === 'combat'
      || decision?.action?.band === 'combat'
      || decision?.action?.kind === 'combat-live';
    const target = combatAction ? (decision?.action?.target || decision?.combat?.target || null) : null;
    const userId = playerUserId(target);
    return userId === null ? null : {
      ...cloneJson(target),
      userId
    };
  }

  function rememberCombatTarget(decision, atMs) {
    const current = currentCombatTarget(decision);
    if (current) {
      lastCombatTarget = { target: current, atMs };
      return current;
    }
    if (lastCombatTarget && atMs - Number(lastCombatTarget.atMs || 0) > combatMemoryMs) lastCombatTarget = null;
    return null;
  }

  function actorFromDamageEvidence(state, decision, self, atMs) {
    const entities = Array.isArray(state?.realtime?.entities) ? state.realtime.entities : [];
    const bullets = Array.isArray(state?.realtime?.bullets) ? state.realtime.bullets : [];
    const selfUserId = playerUserId(self) ?? numberOrNull(state?.userId);
    const visibleById = new Map();
    for (const entity of entities) {
      const userId = playerUserId(entity);
      if (userId === null || (selfUserId !== null && userId === selfUserId)) continue;
      visibleById.set(String(userId), entity);
    }
    const ownerIds = new Set();
    for (const bullet of bullets) {
      const ownerId = bulletOwnerId(bullet);
      if (ownerId === null || (selfUserId !== null && ownerId === selfUserId)) continue;
      ownerIds.add(String(ownerId));
    }
    const current = currentCombatTarget(decision);
    const remembered = lastCombatTarget && atMs - Number(lastCombatTarget.atMs || 0) <= combatMemoryMs
      ? lastCombatTarget.target
      : null;
    for (const target of [current, remembered]) {
      const userId = playerUserId(target);
      if (userId !== null && ownerIds.has(String(userId))) {
        return {
          actor: visibleById.get(String(userId)) || target || { userId },
          evidence: 'incoming-bullet-owner'
        };
      }
    }
    const visibleOwners = Array.from(ownerIds)
      .map(id => visibleById.get(id) || null)
      .filter(Boolean)
      .sort((a, b) => Number(Boolean(b?.firing ?? b?.shooting ?? b?.is_firing)) - Number(Boolean(a?.firing ?? a?.shooting ?? a?.is_firing))
        || targetDistance(a, self) - targetDistance(b, self));
    if (visibleOwners.length) {
      return { actor: visibleOwners[0], evidence: 'incoming-bullet-owner' };
    }
    if (ownerIds.size === 1) {
      const userId = Number(Array.from(ownerIds)[0]);
      return { actor: { userId, name: `#${userId}` }, evidence: 'incoming-bullet-owner' };
    }
    const firingTargets = entities
      .filter(entity => playerUserId(entity) !== null)
      .filter(entity => selfUserId === null || playerUserId(entity) !== selfUserId)
      .filter(entity => Boolean(entity?.firing ?? entity?.shooting ?? entity?.is_firing))
      .sort((a, b) => targetDistance(a, self) - targetDistance(b, self));
    for (const target of [current, remembered]) {
      const userId = playerUserId(target);
      const visible = userId === null ? null : visibleById.get(String(userId));
      if (visible && firingTargets.some(item => playerUserId(item) === userId)) {
        return { actor: visible, evidence: 'firing-target' };
      }
    }
    if (firingTargets.length === 1) return { actor: firingTargets[0], evidence: 'firing-target' };
    const engaged = current || remembered;
    if (engaged) {
      const userId = playerUserId(engaged);
      return {
        actor: userId === null ? engaged : (visibleById.get(String(userId)) || engaged),
        evidence: 'engaged-combat'
      };
    }
    return null;
  }

  function resetObservation() {
    lastSelf = null;
    lastCombatTarget = null;
    return { ok: true };
  }

  function observeDecision(state, decision, detail = {}) {
    const atMs = Number.isFinite(Number(detail.atMs)) ? Number(detail.atMs) : now();
    ensureToday(atMs);
    const self = state?.realtime?.self || null;
    const selfUserId = playerUserId(self) ?? numberOrNull(state?.userId);
    const hp = playerHp(self);
    const tick = numberOrNull(detail.tick ?? state?.realtime?.tick ?? decision?.tick);
    const entities = Array.isArray(state?.realtime?.entities) ? state.realtime.entities : [];
    observePlayerNames(entities, { atMs, tick, source: detail.source || 'realtime-visible' });
    if (!self || selfUserId === null || hp === null) {
      lastSelf = null;
      rememberCombatTarget(decision, atMs);
      return { ok: false, reason: 'missing-self' };
    }
    let recorded = null;
    if (lastSelf && lastSelf.userId === selfUserId) {
      const hpLost = Number(lastSelf.hp) - hp;
      if (Number.isFinite(hpLost) && hpLost > 0) {
        const evidence = actorFromDamageEvidence(state, decision, self, atMs);
        if (evidence?.actor) {
          recorded = recordDamage(evidence.actor, {
            atMs,
            tick,
            hpLost: Math.round(hpLost * 10) / 10,
            evidence: evidence.evidence
          });
        }
      }
    }
    rememberCombatTarget(decision, atMs);
    lastSelf = { userId: selfUserId, hp, atMs, tick };
    return {
      ok: true,
      hp,
      recorded: Boolean(recorded?.ok),
      event: recorded?.event || null
    };
  }

  return {
    file,
    observeDecision,
    observePlayerNames,
    recordDamage,
    resetObservation,
    status
  };
}

module.exports = {
  DEFAULT_COMBAT_MEMORY_MS,
  createDailyDamagePlayerTracker,
  dayKey,
  playerKey,
  playerUserId
};
