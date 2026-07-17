'use strict';

const fs = require('fs');
const path = require('path');

const SCHEMA_VERSION = 2;
const INITIAL_SCORE = 1;
const MAX_SCORE = 3;
const DEFAULT_OUTCOME_GRACE_MS = 40000;
const DEFAULT_PERSIST_INTERVAL_MS = 5000;
const DEFAULT_SELF_MAX_HP = 100;

function cloneJson(value) {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function targetUserId(target) {
  return numberOrNull(target?.userId ?? target?.user_id ?? target?.targetUserId ?? target?.target_user_id);
}

function targetName(target, fallback = '') {
  return String(
    target?.name
      || target?.targetName
      || target?.target_name
      || target?.label
      || target?.username
      || target?.user_name
      || target?.displayName
      || target?.display_name
      || fallback
      || ''
  ).trim();
}

function targetDrop(target) {
  return numberOrNull(
    target?.drop
      ?? target?.Drop
      ?? target?.reward
      ?? target?.coin_reward
      ?? target?.death_reward_preview
      ?? target?.death_drop_coins
  );
}

function playerKey(userId) {
  const id = numberOrNull(userId);
  return id === null ? '' : `user:${id}`;
}

function normalizedScore(value, fallback = INITIAL_SCORE) {
  const number = Number(value);
  const score = Number.isFinite(number) ? Math.round(number) : fallback;
  return Math.min(MAX_SCORE, Math.max(0, score));
}

function positiveNumberOrNull(value) {
  const number = numberOrNull(value);
  return number !== null && number > 0 ? number : null;
}

function failureShouldDecrementScore(reason = '') {
  const value = String(reason || '').trim().toLowerCase();
  if (!value) return true;
  return !(
    /(?:^|[-_\s])(?:ws|websocket|socket|network|transport|connection)(?:$|[-_\s])/.test(value)
    || /frame[-_\s]?gap|stale[-_\s]?(?:self|realtime)|no[-_\s]?self|no decoded frames|self not observed/.test(value)
    || /action[-_\s]?settlement[-_\s]?stalled|movement[-_\s]?stall|画面.*(?:卡顿|中断)/.test(value)
    || /stamina|体力/.test(value)
    || /leave (?:failed|not confirmed)|direct[-_\s]?leave[-_\s]?failed/.test(value)
    || /shutdown|restart|explicit[-_\s]?stop|process[-_\s]?stop|normal[-_\s]?complete/.test(value)
    || /canary[-_\s]?(?:ended|complete)|service[-_\s]?(?:stop|restart)/.test(value)
  );
}

function killScoreIncrement(detail = {}, engagement = null) {
  const engagementSelfHp = numberOrNull(engagement?.lastSelfHp);
  const detailSelfHp = numberOrNull(detail.selfHp ?? detail.self_hp ?? detail.self?.hp);
  const selfHp = engagementSelfHp ?? detailSelfHp;
  if (selfHp === null) return { increment: 1, selfHp: null, selfMaxHp: null, source: 'unknown-hp-default' };
  const selfMaxHp = positiveNumberOrNull(
    engagementSelfHp !== null
      ? engagement?.lastSelfMaxHp
      : (detail.selfMaxHp
          ?? detail.self_max_hp
          ?? detail.self?.maxHp
          ?? detail.self?.max_hp)
  ) ?? DEFAULT_SELF_MAX_HP;
  const increment = selfHp >= selfMaxHp ? 2 : (selfHp > 50 ? 1 : 0);
  return {
    increment,
    selfHp,
    selfMaxHp,
    source: engagementSelfHp !== null ? 'engagement-last-self-hp' : 'kill-evidence'
  };
}

function emptyStore() {
  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: '',
    players: {},
    engagements: {}
  };
}

function normalizePlayer(key, player) {
  if (!player || typeof player !== 'object') return null;
  const userId = targetUserId(player) ?? numberOrNull(String(key || '').replace(/^user:/, ''));
  if (userId === null) return null;
  const score = normalizedScore(player.score ?? player.killScore ?? player.killCount, INITIAL_SCORE);
  if (score <= 0) return null;
  return {
    key: playerKey(userId),
    userId,
    name: targetName(player, `#${userId}`),
    nameUpdatedAt: String(player.nameUpdatedAt || player.lastKilledAt || player.firstKilledAt || ''),
    nameObservedTick: numberOrNull(player.nameObservedTick ?? player.lastKillTick),
    score,
    killCount: Math.max(1, Math.round(Number(player.killCount || 1))),
    firstKilledAt: String(player.firstKilledAt || player.lastKilledAt || ''),
    lastKilledAt: String(player.lastKilledAt || player.firstKilledAt || ''),
    lastKillTick: numberOrNull(player.lastKillTick),
    lastDrop: targetDrop(player)
  };
}

function normalizeEngagement(key, engagement) {
  if (!engagement || typeof engagement !== 'object') return null;
  const userId = targetUserId(engagement) ?? numberOrNull(String(key || '').replace(/^user:/, ''));
  if (userId === null) return null;
  return {
    key: playerKey(userId),
    userId,
    name: targetName(engagement, `#${userId}`),
    nameUpdatedAt: String(engagement.nameUpdatedAt || engagement.lastShotAt || engagement.startedAt || ''),
    nameObservedTick: numberOrNull(engagement.nameObservedTick ?? engagement.lastShotTick ?? engagement.startedTick),
    active: engagement.active !== false && !engagement.endedAt,
    startedAt: String(engagement.startedAt || ''),
    startedAtMs: Math.max(0, Number(engagement.startedAtMs || Date.parse(engagement.startedAt || '') || 0)),
    startedTick: numberOrNull(engagement.startedTick),
    lastShotAt: String(engagement.lastShotAt || engagement.startedAt || ''),
    lastShotAtMs: Math.max(0, Number(engagement.lastShotAtMs || Date.parse(engagement.lastShotAt || '') || 0)),
    lastShotTick: numberOrNull(engagement.lastShotTick),
    shotCount: Math.max(0, Math.round(Number(engagement.shotCount || 0))),
    lastSeenAtMs: Math.max(0, Number(engagement.lastSeenAtMs || engagement.lastShotAtMs || 0)),
    missingSinceMs: Math.max(0, Number(engagement.missingSinceMs || 0)),
    endedAt: String(engagement.endedAt || ''),
    endedAtMs: Math.max(0, Number(engagement.endedAtMs || Date.parse(engagement.endedAt || '') || 0)),
    outcomeDueAt: String(engagement.outcomeDueAt || ''),
    outcomeDueAtMs: Math.max(0, Number(engagement.outcomeDueAtMs || Date.parse(engagement.outcomeDueAt || '') || 0)),
    endReason: String(engagement.endReason || ''),
    lastDrop: targetDrop(engagement),
    lastSelfHp: numberOrNull(engagement.lastSelfHp),
    lastSelfMaxHp: positiveNumberOrNull(engagement.lastSelfMaxHp),
    lastSelfHpAtMs: Math.max(0, Number(engagement.lastSelfHpAtMs || 0))
  };
}

function normalizeStore(value) {
  const output = emptyStore();
  if (!value || typeof value !== 'object') return output;
  output.updatedAt = String(value.updatedAt || '');
  for (const [key, player] of Object.entries(value.players || {})) {
    const normalized = normalizePlayer(key, player);
    if (normalized) output.players[normalized.key] = normalized;
  }
  for (const [key, engagement] of Object.entries(value.engagements || {})) {
    const normalized = normalizeEngagement(key, engagement);
    if (normalized) output.engagements[normalized.key] = normalized;
  }
  return output;
}

function readStore(file) {
  try {
    return normalizeStore(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch (_) {
    return emptyStore();
  }
}

function writeStore(file, store, backgroundIo = null) {
  if (backgroundIo?.writeJsonAtomic) {
    if (!backgroundIo.writeJsonAtomic(file, store)) throw new Error('background easy-kill persistence unavailable');
    return;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(store, null, 2) + '\n');
  fs.renameSync(temporary, file);
}

function storeNeedsMigration(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Number(value?.schemaVersion) !== SCHEMA_VERSION) return true;
    for (const player of Object.values(value?.players || {})) {
      const rawScore = Number(player?.score);
      const score = normalizedScore(rawScore, 0);
      if (!Number.isFinite(rawScore) || rawScore !== score || score <= 0) return true;
    }
    return false;
  } catch (_) {
    return true;
  }
}

function createEasyKillPlayerTracker(options = {}) {
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const onEvent = typeof options.onEvent === 'function' ? options.onEvent : null;
  const file = path.resolve(options.file || path.join(process.cwd(), 'data', 'browserless-runner', 'easy-kill-players.json'));
  const outcomeGraceMs = Math.max(0, Number(options.outcomeGraceMs ?? DEFAULT_OUTCOME_GRACE_MS));
  const persistIntervalMs = Math.max(0, Number(options.persistIntervalMs ?? DEFAULT_PERSIST_INTERVAL_MS));
  const backgroundIo = options.backgroundIo && typeof options.backgroundIo === 'object' ? options.backgroundIo : null;
  const fileExists = fs.existsSync(file);
  const migrateOnStart = fileExists && storeNeedsMigration(file);
  let store = readStore(file);
  let lastWriteAtMs = Date.parse(store.updatedAt || '');
  if (!Number.isFinite(lastWriteAtMs)) lastWriteAtMs = 0;
  if (!fileExists || migrateOnStart) {
    const createdAtMs = now();
    store.updatedAt = new Date(createdAtMs).toISOString();
    writeStore(file, store);
    lastWriteAtMs = createdAtMs;
  }

  function emit(event) {
    if (!onEvent || !event) return;
    try {
      onEvent(cloneJson(event));
    } catch (_) {}
  }

  function persist(atMs = now()) {
    const timestamp = Number.isFinite(Number(atMs)) ? Number(atMs) : now();
    store.updatedAt = new Date(timestamp).toISOString();
    writeStore(file, store, backgroundIo);
    lastWriteAtMs = timestamp;
  }

  function playerStatus() {
    return Object.values(store.players)
      .map(player => cloneJson(player))
      .sort((a, b) => Number(b.score || 0) - Number(a.score || 0)
        || String(b.lastKilledAt || '').localeCompare(String(a.lastKilledAt || ''))
        || String(a.name || '').localeCompare(String(b.name || '')));
  }

  function engagementStatus() {
    return Object.values(store.engagements)
      .map(engagement => cloneJson(engagement))
      .sort((a, b) => Number(b.lastShotAtMs || 0) - Number(a.lastShotAtMs || 0));
  }

  function status() {
    const players = playerStatus();
    const engagements = engagementStatus();
    return {
      file,
      updatedAt: store.updatedAt,
      playerCount: players.length,
      players,
      blockedUserIds: engagements.filter(item => !item.active).map(item => item.userId),
      engagements
    };
  }

  function updateNamesFromTargets(targets = [], atMs = now(), source = 'observation', observedTick = null) {
    const at = new Date(atMs).toISOString();
    const sourceTick = numberOrNull(observedTick);
    const updates = new Map();
    for (const target of targets || []) {
      const userId = targetUserId(target);
      if (userId === null) continue;
      const name = targetName(target);
      if (!name) continue;
      const key = playerKey(userId);
      const player = store.players[key] || null;
      const engagement = store.engagements[key] || null;
      const tick = numberOrNull(target?.tick) ?? sourceTick;
      let oldName = '';
      let playerUpdated = false;
      let engagementUpdated = false;
      const playerTick = numberOrNull(player?.nameObservedTick);
      if (player && (tick === null || playerTick === null || tick >= playerTick)) {
        if (tick !== null) player.nameObservedTick = tick;
      }
      if (player && player.name !== name && (tick === null || playerTick === null || tick >= playerTick)) {
        oldName = player.name || oldName;
        player.name = name;
        player.nameUpdatedAt = at;
        playerUpdated = true;
      }
      const engagementTick = numberOrNull(engagement?.nameObservedTick);
      if (engagement && (tick === null || engagementTick === null || tick >= engagementTick)) {
        if (tick !== null) engagement.nameObservedTick = tick;
      }
      if (engagement && engagement.name !== name && (tick === null || engagementTick === null || tick >= engagementTick)) {
        oldName = oldName || engagement.name;
        engagement.name = name;
        engagement.nameUpdatedAt = at;
        engagementUpdated = true;
      }
      if (!playerUpdated && !engagementUpdated) continue;
      updates.set(key, {
        type: 'name-updated',
        at,
        source: String(source || 'observation'),
        userId,
        oldName,
        name,
        playerUpdated,
        engagementUpdated
      });
    }
    return Array.from(updates.values());
  }

  function observePlayerNames(targets = [], detail = {}) {
    const atMs = Number.isFinite(Number(detail.atMs)) ? Number(detail.atMs) : now();
    const updates = updateNamesFromTargets(targets, atMs, detail.source || 'snapshot', detail.tick);
    if (updates.length) {
      persist(atMs);
      for (const event of updates) emit(event);
    }
    return { ok: true, updated: updates.length, updates: cloneJson(updates) };
  }

  function observeCombatShot(target, detail = {}) {
    if (!target || target.active !== true) return { ok: false, reason: 'non-active-target' };
    const userId = targetUserId(target);
    if (userId === null) return { ok: false, reason: 'missing-user-id' };
    const atMs = Number.isFinite(Number(detail.atMs)) ? Number(detail.atMs) : now();
    const at = new Date(atMs).toISOString();
    const key = playerKey(userId);
    const previous = store.engagements[key] || null;
    const reopened = Boolean(previous && !previous.active);
    const created = !previous || reopened;
    const engagementOnly = detail.engagementOnly === true;
    const observedSelfHp = numberOrNull(detail.selfHp ?? detail.self_hp ?? detail.self?.hp);
    const observedSelfMaxHp = positiveNumberOrNull(
      detail.selfMaxHp
        ?? detail.self_max_hp
        ?? detail.self?.maxHp
        ?? detail.self?.max_hp
    );
    const nameUpdates = updateNamesFromTargets([target], atMs, detail.source || 'realtime-combat', detail.tick);
    const name = previous?.name || store.players[key]?.name || targetName(target, `#${userId}`);
    const startedAtMs = created ? atMs : Number(previous.startedAtMs || atMs);
    const startedTick = created
      ? numberOrNull(detail.tick)
      : (numberOrNull(previous.startedTick) ?? numberOrNull(detail.tick));
    store.engagements[key] = {
      key,
      userId,
      name,
      nameUpdatedAt: previous?.name === name ? String(previous?.nameUpdatedAt || '') : at,
      nameObservedTick: numberOrNull(detail.tick) ?? numberOrNull(previous?.nameObservedTick),
      active: true,
      startedAt: new Date(startedAtMs).toISOString(),
      startedAtMs,
      startedTick,
      lastShotAt: engagementOnly ? String(previous?.lastShotAt || '') : at,
      lastShotAtMs: engagementOnly ? Number(previous?.lastShotAtMs || 0) : atMs,
      lastShotTick: engagementOnly ? numberOrNull(previous?.lastShotTick) : numberOrNull(detail.tick),
      shotCount: Math.max(0, Number(previous?.shotCount || 0) + (engagementOnly ? 0 : 1)),
      lastSeenAtMs: atMs,
      missingSinceMs: 0,
      endedAt: '',
      endedAtMs: 0,
      outcomeDueAt: '',
      outcomeDueAtMs: 0,
      endReason: '',
      lastDrop: targetDrop(target) ?? targetDrop(previous),
      lastSelfHp: observedSelfHp ?? numberOrNull(previous?.lastSelfHp),
      lastSelfMaxHp: observedSelfMaxHp ?? positiveNumberOrNull(previous?.lastSelfMaxHp),
      lastSelfHpAtMs: observedSelfHp === null ? Number(previous?.lastSelfHpAtMs || 0) : atMs
    };
    if (created || nameUpdates.length || !lastWriteAtMs || atMs - lastWriteAtMs >= persistIntervalMs) persist(atMs);
    for (const event of nameUpdates) emit(event);
    if (created) {
      emit({
        type: 'engagement-started',
        at,
        userId,
        name,
        reopened,
        tick: numberOrNull(detail.tick)
      });
    }
    return { ok: true, created, reopened, engagement: cloneJson(store.engagements[key]) };
  }

  function observeCombatEngagement(target, detail = {}) {
    return observeCombatShot(target, { ...detail, engagementOnly: true });
  }

  function observeVisibleTargets(targets = [], detail = {}) {
    const atMs = Number.isFinite(Number(detail.atMs)) ? Number(detail.atMs) : now();
    const missingGraceMs = Math.max(0, Number(detail.missingGraceMs || 0));
    const nameUpdates = updateNamesFromTargets(targets, atMs, detail.source || 'realtime-visible', detail.tick);
    const visibleByUserId = new Map();
    for (const target of targets || []) {
      const userId = targetUserId(target);
      if (userId !== null) visibleByUserId.set(userId, target);
    }
    const ended = [];
    const cleared = [];
    for (const [key, engagement] of Object.entries(store.engagements)) {
      const target = visibleByUserId.get(engagement.userId) || null;
      if (!engagement.active) {
        if (!target || target.alive === false || Number(target.hp ?? 1) <= 0) continue;
        delete store.engagements[key];
        const event = {
          type: 'engagement-pending-cleared',
          at: new Date(atMs).toISOString(),
          userId: engagement.userId,
          name: targetName(target, engagement.name || `#${engagement.userId}`),
          reason: 'target-reappeared-alive',
          previousReason: engagement.endReason || ''
        };
        cleared.push(event);
        emit(event);
        continue;
      }
      if (target) {
        engagement.lastSeenAtMs = atMs;
        engagement.missingSinceMs = 0;
        if (!engagement.name) engagement.name = targetName(target, `#${engagement.userId}`);
        engagement.lastDrop = targetDrop(target) ?? engagement.lastDrop;
        continue;
      }
      if (!engagement.missingSinceMs) engagement.missingSinceMs = atMs;
      if (missingGraceMs > 0 && atMs - engagement.missingSinceMs < missingGraceMs) continue;
      const result = finishEngagement(engagement.userId, detail.reason || 'active-target-missing', { atMs });
      if (result.ok) ended.push(result.engagement);
    }
    if (nameUpdates.length || cleared.length) {
      persist(atMs);
      for (const event of nameUpdates) emit(event);
    }
    return { ok: true, ended, cleared: cloneJson(cleared), renamed: cloneJson(nameUpdates) };
  }

  function finishEngagement(userIdValue, reason = 'not-killed', detail = {}) {
    const userId = numberOrNull(userIdValue);
    if (userId === null) return { ok: false, reason: 'missing-user-id' };
    const key = playerKey(userId);
    const engagement = store.engagements[key] || null;
    if (!engagement) return { ok: false, reason: 'no-engagement' };
    if (!engagement.active) return { ok: true, alreadyEnded: true, engagement: cloneJson(engagement) };
    const atMs = Number.isFinite(Number(detail.atMs)) ? Number(detail.atMs) : now();
    const dueAtMs = atMs + Math.max(0, Number(detail.outcomeGraceMs ?? outcomeGraceMs));
    engagement.active = false;
    engagement.endedAt = new Date(atMs).toISOString();
    engagement.endedAtMs = atMs;
    engagement.outcomeDueAt = new Date(dueAtMs).toISOString();
    engagement.outcomeDueAtMs = dueAtMs;
    engagement.endReason = String(reason || 'not-killed');
    engagement.missingSinceMs = 0;
    persist(atMs);
    emit({
      type: 'engagement-ended-pending',
      at: engagement.endedAt,
      userId,
      name: engagement.name,
      reason: engagement.endReason,
      outcomeDueAt: engagement.outcomeDueAt
    });
    return { ok: true, engagement: cloneJson(engagement) };
  }

  function finishActiveEngagements(reason = 'canary-ended', detail = {}) {
    const ended = [];
    for (const engagement of Object.values(store.engagements)) {
      if (!engagement.active) continue;
      const result = finishEngagement(engagement.userId, reason, detail);
      if (result.ok) ended.push(result.engagement);
    }
    return { ok: true, ended };
  }

  function observeKillEvidence(evidence = [], detail = {}) {
    const atMs = Number.isFinite(Number(detail.atMs)) ? Number(detail.atMs) : now();
    const confirmed = [];
    for (const item of evidence || []) {
      const userId = targetUserId(item);
      if (userId === null) continue;
      const key = playerKey(userId);
      const engagement = store.engagements[key] || null;
      if (!engagement) continue;
      const tick = numberOrNull(item?.tick);
      if (tick !== null && engagement.startedTick !== null && tick < engagement.startedTick) continue;
      const existing = store.players[key] || null;
      const currentName = engagement.name || existing?.name || `#${userId}`;
      const currentNameTick = numberOrNull(engagement.nameObservedTick) ?? numberOrNull(existing?.nameObservedTick);
      const evidenceName = targetName(item);
      const name = tick !== null && currentNameTick !== null && tick < currentNameTick
        ? currentName
        : (evidenceName || currentName);
      const observedNameTicks = [tick, currentNameTick, numberOrNull(existing?.nameObservedTick)]
        .filter(value => value !== null);
      const nameObservedTick = observedNameTicks.length ? Math.max(...observedNameTicks) : null;
      const killedAt = String(item?.at || '') || new Date(atMs).toISOString();
      const previousScore = existing ? normalizedScore(existing.score, INITIAL_SCORE) : 0;
      const scoreAward = killScoreIncrement(detail, engagement);
      const score = Math.min(MAX_SCORE, previousScore + scoreAward.increment);
      const killCount = Math.max(1, Number(existing?.killCount || 0) + 1);
      if (score > 0) {
        store.players[key] = {
          key,
          userId,
          name,
          nameUpdatedAt: killedAt,
          nameObservedTick,
          score,
          killCount,
          firstKilledAt: existing?.firstKilledAt || killedAt,
          lastKilledAt: killedAt,
          lastKillTick: tick,
          lastDrop: engagement.lastDrop ?? existing?.lastDrop ?? null
        };
      }
      delete store.engagements[key];
      const event = {
        type: 'killed',
        at: killedAt,
        userId,
        name,
        tick,
        added: Boolean(!existing && score > 0),
        previousScore,
        score,
        scoreIncrement: scoreAward.increment,
        appliedScoreIncrement: score - previousScore,
        scoreIncrementSource: scoreAward.source,
        selfHp: scoreAward.selfHp,
        selfMaxHp: scoreAward.selfMaxHp,
        killCount
      };
      confirmed.push(event);
      emit(event);
    }
    if (confirmed.length) persist(atMs);
    return { ok: true, confirmed };
  }

  function expirePendingOutcomes(atMsValue = now()) {
    const atMs = Number.isFinite(Number(atMsValue)) ? Number(atMsValue) : now();
    const expired = [];
    let changed = false;
    for (const [key, engagement] of Object.entries(store.engagements)) {
      if (engagement.active || !(Number(engagement.outcomeDueAtMs || 0) > 0) || atMs < Number(engagement.outcomeDueAtMs)) continue;
      const existing = store.players[key] || null;
      const previousScore = existing ? normalizedScore(existing.score, INITIAL_SCORE) : 0;
      const shouldDecrement = failureShouldDecrementScore(engagement.endReason);
      const score = shouldDecrement ? Math.max(0, previousScore - 1) : previousScore;
      if (existing && score > 0) existing.score = score;
      if (existing && score <= 0) delete store.players[key];
      delete store.engagements[key];
      changed = true;
      const event = {
        type: 'not-killed',
        at: new Date(atMs).toISOString(),
        userId: engagement.userId,
        name: engagement.name,
        reason: engagement.endReason || 'outcome-timeout',
        previousScore,
        score,
        decremented: Boolean(existing && shouldDecrement),
        removed: Boolean(existing && shouldDecrement && score <= 0),
        neutral: !shouldDecrement
      };
      expired.push(event);
      emit(event);
    }
    if (changed) persist(atMs);
    return { ok: true, expired };
  }

  function recordImmediateFailure(target, reason = 'approach-stop-loss', detail = {}) {
    const userId = targetUserId(target);
    if (userId === null) return { ok: false, reason: 'missing-user-id' };
    const atMs = Number.isFinite(Number(detail.atMs)) ? Number(detail.atMs) : now();
    const key = playerKey(userId);
    const existing = store.players[key] || null;
    const engagement = store.engagements[key] || null;
    const previousScore = existing ? normalizedScore(existing.score, INITIAL_SCORE) : 0;
    const score = Math.max(0, previousScore - 1);
    if (existing && score > 0) existing.score = score;
    if (existing && score <= 0) delete store.players[key];
    if (engagement) delete store.engagements[key];
    if (existing || engagement) persist(atMs);
    const event = {
      type: 'not-killed',
      at: new Date(atMs).toISOString(),
      userId,
      name: targetName(target, existing?.name || engagement?.name || `#${userId}`),
      reason: String(reason || 'approach-stop-loss'),
      previousScore,
      score,
      decremented: Boolean(existing),
      removed: Boolean(existing && score <= 0),
      immediate: true
    };
    emit(event);
    return { ok: true, event };
  }

  return {
    file,
    expirePendingOutcomes,
    finishActiveEngagements,
    finishEngagement,
    observeCombatEngagement,
    observeCombatShot,
    observeKillEvidence,
    observePlayerNames,
    observeVisibleTargets,
    recordImmediateFailure,
    status
  };
}

module.exports = {
  DEFAULT_OUTCOME_GRACE_MS,
  INITIAL_SCORE,
  MAX_SCORE,
  createEasyKillPlayerTracker,
  playerKey,
  targetUserId
};
