'use strict';

const fs = require('fs');
const path = require('path');
const {
  nameObservationFreshness,
  timestampOrNull
} = require('./player-name-observation');

const SCHEMA_VERSION = 5;
const UTC8_OFFSET_MS = 8 * 60 * 60 * 1000;
const DEFAULT_RECORD_THRESHOLD = 50;
const DEFAULT_SNAPSHOT_GAP_MS = 30 * 1000;
const MAX_BALANCE_SNAPSHOTS = 400;
const EXTERNAL_BALANCE_RAW_PER_COIN = 500000;

function cloneJson(value) {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

function dayKey(ms = Date.now()) {
  return new Date(Number(ms) + UTC8_OFFSET_MS).toISOString().slice(0, 10);
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function entityDrop(entity) {
  return numberOrNull(
    entity?.drop
      ?? entity?.Drop
      ?? entity?.reward
      ?? entity?.coin_reward
      ?? entity?.death_reward_preview
      ?? entity?.death_drop_coins
      ?? entity?.coins
  );
}

// 账户外部余额快照永远只有正值(1 币对应 500000 原始单位); 0 只在每日零点重置瞬间短暂
// 出现, 之后游戏才会重新填满真实余额。把 0 视作缺失, 否则它会被当成当日开盘基线,
// 让 今日收益 = latest - 0 把整个账户余额误算成当天收益。
function snapshottedBalanceOrNull(value) {
  const number = numberOrNull(value);
  return number !== null && number > 0 ? number : null;
}

function entityExternalBalanceSnapshot(entity) {
  return snapshottedBalanceOrNull(entity?.external_balance_snapshot ?? entity?.externalBalanceSnapshot);
}

function entityName(entity, fallback = '') {
  return String(
    entity?.name
      || entity?.label
      || entity?.username
      || entity?.user_name
      || entity?.displayName
      || entity?.display_name
      || fallback
      || ''
  ).trim();
}

function entityIdentity(entity) {
  const userId = numberOrNull(entity?.user_id ?? entity?.userId);
  if (userId === null) return null;
  const entityId = entity?.entity_id ?? entity?.entityId ?? entity?.id;
  return {
    key: `user:${userId}`,
    userId,
    entityId: entityId === null || entityId === undefined || entityId === '' ? null : String(entityId)
  };
}

function emptyStore(day = '') {
  return {
    schemaVersion: SCHEMA_VERSION,
    day,
    updatedAt: '',
    lastSnapshotAt: '',
    lastSnapshotSource: '',
    lastGlobalSnapshotAt: '',
    lastGlobalSnapshotSource: '',
    selfInitialExternalBalanceSnapshot: null,
    selfInitialExternalBalanceSnapshotAt: '',
    selfInitialExternalBalanceSnapshotTick: null,
    selfExternalBalanceSnapshot: null,
    selfExternalBalanceSnapshotAt: '',
    selfExternalBalanceSnapshotTick: null,
    selfPreviousExternalBalanceSnapshot: null,
    selfPreviousExternalBalanceSnapshotAt: '',
    selfBalanceIncomeRaw: null,
    selfSessionBalance: null,
    balanceSnapshots: {},
    players: {}
  };
}

function sessionBalanceGain(session) {
  const completedRaw = Math.max(0, Number(session?.completedBalanceRaw || 0) || 0);
  const earnedRaw = Math.max(0, Number(session?.earnedBalanceRaw || 0) || 0);
  const pendingRaw = Math.max(0, Number(session?.pendingBalanceRaw || 0) || 0);
  if (!session) return null;
  return Math.max(0, Math.round((completedRaw + earnedRaw + pendingRaw) / EXTERNAL_BALANCE_RAW_PER_COIN));
}

function pruneBalanceSnapshots(snapshots, limit = MAX_BALANCE_SNAPSHOTS) {
  const entries = Object.entries(snapshots || {});
  if (entries.length <= limit) return snapshots || {};
  entries.sort((left, right) => (timestampOrNull(right[1]?.at) ?? 0) - (timestampOrNull(left[1]?.at) ?? 0));
  const output = {};
  for (const [key, snapshot] of entries.slice(0, limit)) output[key] = snapshot;
  return output;
}

// UTC+8 day rollover resets the self balance baseline so the first positive snapshot
// starts the new day's account. Cross-midnight balance changes stay outside the new day.
function carryForwardStore(previous, day) {
  const output = emptyStore(day);
  if (!previous || typeof previous !== 'object') return output;
  // selfInitialExternalBalanceSnapshot deliberately left null: first post-midnight
  // snapshot will become the baseline via normalizeStore's fallback logic.
  for (const [key, snapshot] of Object.entries(previous.balanceSnapshots || {})) {
    if (!snapshot || typeof snapshot !== 'object') continue;
    const latest = snapshottedBalanceOrNull(
      snapshot.latest ?? snapshot.latestValue ?? snapshot.value ?? snapshot.initial
    );
    if (latest === null) continue;
    const normalizedKey = String(key || '').startsWith('user:') ? String(key) : `user:${key}`;
    const at = String(snapshot.at || snapshot.latestAt || snapshot.initialAt || '');
    const tick = numberOrNull(snapshot.tick ?? snapshot.latestTick ?? snapshot.initialTick);
    output.balanceSnapshots[normalizedKey] = {
      initial: latest,
      initialAt: at,
      initialTick: tick,
      latest,
      at,
      tick
    };
  }
  output.balanceSnapshots = pruneBalanceSnapshots(output.balanceSnapshots);
  const previousSession = previous.selfSessionBalance && typeof previous.selfSessionBalance === 'object'
    ? previous.selfSessionBalance
    : null;
  if (previousSession?.sessionId) {
    // Keep completed earnings while restarting the observation segment for the new day.
    output.selfSessionBalance = {
      sessionId: String(previousSession.sessionId),
      day,
      completedBalanceRaw: Math.max(0, Number(previousSession.completedBalanceRaw || 0) || 0)
        + Math.max(0, Number(previousSession.earnedBalanceRaw || 0) || 0)
        + Math.max(0, Number(previousSession.pendingBalanceRaw || 0) || 0),
      earnedBalanceRaw: 0,
      lastExternalBalanceSnapshot: null,
      pendingBalanceRaw: 0,
      active: Boolean(previousSession.active)
    };
  }
  return output;
}

function normalizeStore(value, expectedDay) {
  if (!value || typeof value !== 'object') return emptyStore(expectedDay);
  if (value.day !== expectedDay) return carryForwardStore(value, expectedDay);
  const output = emptyStore(expectedDay);
  output.updatedAt = String(value.updatedAt || '');
  output.lastSnapshotAt = String(value.lastSnapshotAt || '');
  output.lastSnapshotSource = String(value.lastSnapshotSource || '');
  output.lastGlobalSnapshotAt = String(value.lastGlobalSnapshotAt || '');
  output.lastGlobalSnapshotSource = String(value.lastGlobalSnapshotSource || '');
  output.selfInitialExternalBalanceSnapshot = snapshottedBalanceOrNull(value.selfInitialExternalBalanceSnapshot)
    ?? snapshottedBalanceOrNull(value.selfExternalBalanceSnapshot);
  output.selfInitialExternalBalanceSnapshotAt = String(
    value.selfInitialExternalBalanceSnapshotAt || value.selfExternalBalanceSnapshotAt || ''
  );
  output.selfInitialExternalBalanceSnapshotTick = numberOrNull(
    value.selfInitialExternalBalanceSnapshotTick ?? value.selfExternalBalanceSnapshotTick
  );
  output.selfExternalBalanceSnapshot = snapshottedBalanceOrNull(value.selfExternalBalanceSnapshot);
  output.selfExternalBalanceSnapshotAt = String(value.selfExternalBalanceSnapshotAt || '');
  output.selfExternalBalanceSnapshotTick = numberOrNull(value.selfExternalBalanceSnapshotTick);
  output.selfPreviousExternalBalanceSnapshot = snapshottedBalanceOrNull(value.selfPreviousExternalBalanceSnapshot);
  output.selfPreviousExternalBalanceSnapshotAt = String(value.selfPreviousExternalBalanceSnapshotAt || '');
  const storedBalanceIncomeRaw = numberOrNull(value.selfBalanceIncomeRaw);
  output.selfBalanceIncomeRaw = storedBalanceIncomeRaw === null
    ? null
    : Math.max(0, storedBalanceIncomeRaw);
  const storedSessionBalance = value.selfSessionBalance;
  if (storedSessionBalance && typeof storedSessionBalance === 'object' && storedSessionBalance.sessionId) {
    output.selfSessionBalance = {
      sessionId: String(storedSessionBalance.sessionId),
      day: expectedDay,
      completedBalanceRaw: Math.max(0, Number(storedSessionBalance.completedBalanceRaw || 0) || 0),
      earnedBalanceRaw: Math.max(0, Number(storedSessionBalance.earnedBalanceRaw || 0) || 0),
      lastExternalBalanceSnapshot: snapshottedBalanceOrNull(storedSessionBalance.lastExternalBalanceSnapshot),
      pendingBalanceRaw: Math.max(0, Number(storedSessionBalance.pendingBalanceRaw || 0) || 0),
      active: Boolean(storedSessionBalance.active)
    };
  }
  for (const [key, snapshot] of Object.entries(value.balanceSnapshots || {})) {
    if (!snapshot || typeof snapshot !== 'object') continue;
    const initial = snapshottedBalanceOrNull(snapshot.initial ?? snapshot.initialValue ?? snapshot.value);
    const latest = snapshottedBalanceOrNull(snapshot.latest ?? snapshot.latestValue ?? snapshot.value);
    if (initial === null && latest === null) continue;
    const normalizedKey = String(key || '').startsWith('user:') ? String(key) : `user:${key}`;
    output.balanceSnapshots[normalizedKey] = {
      initial: initial ?? latest,
      initialAt: String(snapshot.initialAt || snapshot.at || ''),
      initialTick: numberOrNull(snapshot.initialTick ?? snapshot.tick),
      latest: latest ?? initial,
      at: String(snapshot.at || snapshot.latestAt || snapshot.initialAt || ''),
      tick: numberOrNull(snapshot.tick ?? snapshot.latestTick ?? snapshot.initialTick)
    };
  }
  output.balanceSnapshots = pruneBalanceSnapshots(output.balanceSnapshots);
  for (const [key, player] of Object.entries(value.players || {})) {
    if (!player || typeof player !== 'object') continue;
    const userId = numberOrNull(player.userId ?? String(key || '').replace(/^user:/, ''));
    if (userId === null) continue;
    const initialDrop = numberOrNull(player.initialDrop);
    const maxDrop = numberOrNull(player.maxDrop);
    const latestDrop = numberOrNull(player.latestDrop);
    if (initialDrop === null || maxDrop === null || latestDrop === null) continue;
    const normalizedKey = `user:${userId}`;
    const externalBalanceSnapshot = snapshottedBalanceOrNull(
      player.externalBalanceSnapshot ?? player.external_balance_snapshot
    );
    const initialExternalBalanceSnapshot = snapshottedBalanceOrNull(
      player.initialExternalBalanceSnapshot ?? player.initial_external_balance_snapshot
    ) ?? output.balanceSnapshots[normalizedKey]?.initial ?? externalBalanceSnapshot;
    const candidate = {
      key: normalizedKey,
      userId,
      entityId: player.entityId === null || player.entityId === undefined ? null : String(player.entityId),
      name: String(player.name || ''),
      initialDrop,
      maxDrop,
      latestDrop,
      initialExternalBalanceSnapshot,
      initialExternalBalanceSnapshotAt: String(
        player.initialExternalBalanceSnapshotAt
          || player.initial_external_balance_snapshot_at
          || player.externalBalanceSnapshotAt
          || ''
      ),
      initialExternalBalanceSnapshotTick: numberOrNull(
        player.initialExternalBalanceSnapshotTick
          ?? player.initial_external_balance_snapshot_tick
          ?? player.externalBalanceSnapshotTick
      ),
      externalBalanceSnapshot,
      externalBalanceSnapshotAt: String(player.externalBalanceSnapshotAt || ''),
      externalBalanceSnapshotTick: numberOrNull(player.externalBalanceSnapshotTick),
      firstObservedAt: String(player.firstObservedAt || ''),
      lastObservedAt: String(player.lastObservedAt || ''),
      lastObservedTick: numberOrNull(player.lastObservedTick),
      online: player.online === true ? true : (player.online === false ? false : null),
      onlineObservedAt: String(player.onlineObservedAt || ''),
      onlineCheckedAt: String(player.onlineCheckedAt || '')
    };
    if (!output.balanceSnapshots[normalizedKey]
      && (candidate.initialExternalBalanceSnapshot !== null || candidate.externalBalanceSnapshot !== null)) {
      const initial = candidate.initialExternalBalanceSnapshot ?? candidate.externalBalanceSnapshot;
      output.balanceSnapshots[normalizedKey] = {
        initial,
        initialAt: candidate.initialExternalBalanceSnapshotAt || candidate.externalBalanceSnapshotAt,
        initialTick: candidate.initialExternalBalanceSnapshotTick ?? candidate.externalBalanceSnapshotTick,
        latest: candidate.externalBalanceSnapshot ?? initial,
        at: candidate.externalBalanceSnapshotAt || candidate.initialExternalBalanceSnapshotAt,
        tick: candidate.externalBalanceSnapshotTick ?? candidate.initialExternalBalanceSnapshotTick
      };
    }
    const existing = output.players[normalizedKey] || null;
    if (!existing) {
      output.players[normalizedKey] = candidate;
      continue;
    }
    const existingFirstMs = Date.parse(existing.firstObservedAt || '');
    const candidateFirstMs = Date.parse(candidate.firstObservedAt || '');
    const candidateIsEarlier = !Number.isFinite(existingFirstMs)
      || (Number.isFinite(candidateFirstMs) && candidateFirstMs < existingFirstMs);
    const existingLastMs = Date.parse(existing.lastObservedAt || '');
    const candidateLastMs = Date.parse(candidate.lastObservedAt || '');
    const existingLastTick = numberOrNull(existing.lastObservedTick);
    const candidateLastTick = numberOrNull(candidate.lastObservedTick);
    const candidateIsLater = !Number.isFinite(candidateLastMs) && !Number.isFinite(existingLastMs)
      ? (candidateLastTick !== null && existingLastTick !== null
        ? candidateLastTick >= existingLastTick
        : !Number.isFinite(existingLastMs))
      : nameObservationFreshness({
          observedAtMs: Number.isFinite(candidateLastMs) ? candidateLastMs : null,
          observedTick: candidateLastTick,
          previousObservedAtMs: Number.isFinite(existingLastMs) ? existingLastMs : null,
          previousObservedTick: existingLastTick
        }).accepted;
    const first = candidateIsEarlier ? candidate : existing;
    const latest = candidateIsLater ? candidate : existing;
    output.players[normalizedKey] = {
      ...existing,
      key: normalizedKey,
      userId,
      entityId: latest.entityId ?? existing.entityId ?? candidate.entityId,
      name: latest.name || existing.name || candidate.name,
      initialDrop: first.initialDrop,
      maxDrop: Math.max(existing.maxDrop, candidate.maxDrop),
      latestDrop: latest.latestDrop,
      initialExternalBalanceSnapshot: first.initialExternalBalanceSnapshot
        ?? existing.initialExternalBalanceSnapshot
        ?? candidate.initialExternalBalanceSnapshot,
      initialExternalBalanceSnapshotAt: first.initialExternalBalanceSnapshotAt
        || existing.initialExternalBalanceSnapshotAt
        || candidate.initialExternalBalanceSnapshotAt,
      initialExternalBalanceSnapshotTick: first.initialExternalBalanceSnapshotTick
        ?? existing.initialExternalBalanceSnapshotTick
        ?? candidate.initialExternalBalanceSnapshotTick,
      externalBalanceSnapshot: latest.externalBalanceSnapshot
        ?? existing.externalBalanceSnapshot
        ?? candidate.externalBalanceSnapshot,
      externalBalanceSnapshotAt: latest.externalBalanceSnapshotAt
        || existing.externalBalanceSnapshotAt
        || candidate.externalBalanceSnapshotAt,
      externalBalanceSnapshotTick: latest.externalBalanceSnapshotTick
        ?? existing.externalBalanceSnapshotTick
        ?? candidate.externalBalanceSnapshotTick,
      firstObservedAt: first.firstObservedAt,
      lastObservedAt: latest.lastObservedAt,
      lastObservedTick: latest.lastObservedTick,
      online: latest.online ?? existing.online ?? candidate.online ?? null,
      onlineObservedAt: latest.onlineObservedAt || existing.onlineObservedAt || candidate.onlineObservedAt,
      onlineCheckedAt: latest.onlineCheckedAt || existing.onlineCheckedAt || candidate.onlineCheckedAt
    };
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

function writeStore(file, store, backgroundIo = null) {
  if (backgroundIo?.writeJsonAtomic) {
    if (!backgroundIo.writeJsonAtomic(file, store)) throw new Error('background high-drop persistence unavailable');
    return;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(store, null, 2) + '\n');
  fs.renameSync(temporary, file);
}

function createHighDropPlayerTracker(options = {}) {
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const file = path.resolve(options.file || path.join(process.cwd(), 'data', 'browserless-runner', 'high-drop-players.json'));
  const threshold = Math.max(0, Number(options.threshold ?? DEFAULT_RECORD_THRESHOLD));
  const backgroundIo = options.backgroundIo && typeof options.backgroundIo === 'object' ? options.backgroundIo : null;
  let store = readStore(file, dayKey(now()));
  let lastWriteAtMs = Date.parse(store.updatedAt || '');
  if (!Number.isFinite(lastWriteAtMs)) lastWriteAtMs = 0;

  function ensureToday(atMs = now()) {
    const today = dayKey(atMs);
    if (store.day === today) return false;
    store = carryForwardStore(store, today);
    writeStore(file, store, backgroundIo);
    lastWriteAtMs = Number(atMs);
    return true;
  }

  function observeSnapshot(payload, detail = {}) {
    const observedAtMs = Number(detail.observedAtMs ?? now());
    const atMs = Number.isFinite(observedAtMs) ? observedAtMs : now();
    ensureToday(atMs);
    if (!payload || typeof payload !== 'object' || !Array.isArray(payload.entities)) {
      return { ok: false, reason: 'invalid-snapshot-payload', observed: 0, updated: 0 };
    }
    const at = new Date(atMs).toISOString();
    const snapshotTick = numberOrNull(payload.tick);
    const selfUserId = numberOrNull(detail.selfUserId);
    const source = String(detail.source || 'snapshot');
    const globalSnapshot = detail.global === true || (detail.global !== false && source !== 'ws');
    const presentUserIds = new Set();
    for (const entity of payload.entities) {
      const identity = entityIdentity(entity);
      if (identity && (selfUserId === null || identity.userId !== selfUserId)) {
        presentUserIds.add(identity.userId);
      }
    }
    let observed = 0;
    let updated = 0;
    let observationAdvanced = 0;
    for (const entity of payload.entities) {
      if (!entity || typeof entity !== 'object') continue;
      const identity = entityIdentity(entity);
      const externalBalanceSnapshot = entityExternalBalanceSnapshot(entity);
      const existing = identity ? store.players[identity.key] || null : null;
      if (identity && selfUserId !== null && identity.userId === selfUserId && externalBalanceSnapshot !== null) {
        const selfObservedAtMs = timestampOrNull(store.selfExternalBalanceSnapshotAt);
        const freshness = nameObservationFreshness({
          observedAtMs: atMs,
          observedTick: snapshotTick,
          previousObservedAtMs: selfObservedAtMs,
          previousObservedTick: store.selfExternalBalanceSnapshotTick
        });
        if (freshness.accepted) {
          const changed = store.selfExternalBalanceSnapshot !== externalBalanceSnapshot;
          const initialMissing = store.selfInitialExternalBalanceSnapshot === null;
          const previousBalance = store.selfExternalBalanceSnapshot;
          store.selfInitialExternalBalanceSnapshot = store.selfInitialExternalBalanceSnapshot
            ?? externalBalanceSnapshot;
          store.selfInitialExternalBalanceSnapshotAt = store.selfInitialExternalBalanceSnapshotAt || at;
          store.selfInitialExternalBalanceSnapshotTick = store.selfInitialExternalBalanceSnapshotTick
            ?? snapshotTick;
          store.selfPreviousExternalBalanceSnapshot = store.selfExternalBalanceSnapshot;
          store.selfPreviousExternalBalanceSnapshotAt = store.selfExternalBalanceSnapshotAt;
          store.selfExternalBalanceSnapshot = externalBalanceSnapshot;
          store.selfExternalBalanceSnapshotAt = at;
          store.selfExternalBalanceSnapshotTick = snapshotTick;
          if (store.selfBalanceIncomeRaw === null) {
            const priorNetRaw = previousBalance !== null
              && store.selfInitialExternalBalanceSnapshot !== null
              && previousBalance >= store.selfInitialExternalBalanceSnapshot
              ? previousBalance - store.selfInitialExternalBalanceSnapshot
              : 0;
            store.selfBalanceIncomeRaw = priorNetRaw;
          }
          if (previousBalance !== null && externalBalanceSnapshot > previousBalance) {
            store.selfBalanceIncomeRaw += externalBalanceSnapshot - previousBalance;
          }
          const sessionBalance = store.selfSessionBalance;
          if (sessionBalance?.active && sessionBalance.day === store.day) {
            const lastBalance = sessionBalance.lastExternalBalanceSnapshot;
            if (lastBalance === null) {
              sessionBalance.earnedBalanceRaw += Math.max(0, Number(sessionBalance.pendingBalanceRaw || 0) || 0);
              sessionBalance.pendingBalanceRaw = 0;
            } else if (externalBalanceSnapshot > lastBalance) {
              sessionBalance.earnedBalanceRaw += externalBalanceSnapshot - lastBalance;
            }
            sessionBalance.lastExternalBalanceSnapshot = externalBalanceSnapshot;
          }
          if (changed || initialMissing || freshness.advanced) updated += 1;
        }
      }
      if (identity && (selfUserId === null || identity.userId !== selfUserId)
        && externalBalanceSnapshot !== null) {
        const previousBalance = store.balanceSnapshots[identity.key]
          || (existing && existing.externalBalanceSnapshot !== null
            ? {
                initial: existing.initialExternalBalanceSnapshot ?? existing.externalBalanceSnapshot,
                initialAt: existing.initialExternalBalanceSnapshotAt || existing.externalBalanceSnapshotAt,
                initialTick: existing.initialExternalBalanceSnapshotTick ?? existing.externalBalanceSnapshotTick,
                latest: existing.externalBalanceSnapshot,
                at: existing.externalBalanceSnapshotAt || existing.lastObservedAt,
                tick: existing.externalBalanceSnapshotTick ?? existing.lastObservedTick
              }
            : null);
        const balanceFreshness = nameObservationFreshness({
          observedAtMs: atMs,
          observedTick: snapshotTick,
          previousObservedAtMs: timestampOrNull(previousBalance?.at),
          previousObservedTick: previousBalance?.tick
        });
        if (balanceFreshness.accepted) {
          const balanceRecord = previousBalance || {
            initial: externalBalanceSnapshot,
            initialAt: at,
            initialTick: snapshotTick
          };
          const changed = balanceRecord.latest !== externalBalanceSnapshot;
          store.balanceSnapshots[identity.key] = {
            initial: balanceRecord.initial ?? externalBalanceSnapshot,
            initialAt: balanceRecord.initialAt || at,
            initialTick: balanceRecord.initialTick ?? snapshotTick,
            latest: externalBalanceSnapshot,
            at,
            tick: snapshotTick
          };
          if (existing) {
            store.players[identity.key] = {
              ...existing,
              initialExternalBalanceSnapshot: balanceRecord.initial ?? externalBalanceSnapshot,
              initialExternalBalanceSnapshotAt: balanceRecord.initialAt || at,
              initialExternalBalanceSnapshotTick: balanceRecord.initialTick ?? snapshotTick,
              externalBalanceSnapshot,
              externalBalanceSnapshotAt: at,
              externalBalanceSnapshotTick: snapshotTick
            };
          }
          if (changed || !previousBalance || balanceFreshness.advanced) updated += 1;
        }
      }
      const drop = entityDrop(entity);
      if (!identity || drop === null) continue;
      if (selfUserId !== null && identity.userId === selfUserId) continue;
      const trackedPlayer = store.players[identity.key] || null;
      if (!trackedPlayer && drop < threshold) continue;
      observed += 1;
      const fallbackName = identity.userId !== null ? `#${identity.userId}` : identity.entityId ? `#${identity.entityId}` : '';
      const name = entityName(entity, trackedPlayer?.name || fallbackName);
      if (!trackedPlayer) {
        const balanceRecord = store.balanceSnapshots[identity.key] || null;
        store.players[identity.key] = {
          key: identity.key,
          userId: identity.userId,
          entityId: identity.entityId,
          name,
          initialDrop: drop,
          maxDrop: drop,
          latestDrop: drop,
          initialExternalBalanceSnapshot: balanceRecord?.initial ?? externalBalanceSnapshot,
          initialExternalBalanceSnapshotAt: balanceRecord?.initialAt || (externalBalanceSnapshot === null ? '' : at),
          initialExternalBalanceSnapshotTick: balanceRecord?.initialTick ?? (externalBalanceSnapshot === null ? null : snapshotTick),
          externalBalanceSnapshot: balanceRecord?.latest ?? externalBalanceSnapshot,
          externalBalanceSnapshotAt: balanceRecord?.at || (externalBalanceSnapshot === null ? '' : at),
          externalBalanceSnapshotTick: balanceRecord?.tick ?? (externalBalanceSnapshot === null ? null : snapshotTick),
          firstObservedAt: at,
          lastObservedAt: at,
          lastObservedTick: snapshotTick,
          online: true,
          onlineObservedAt: at,
          onlineCheckedAt: globalSnapshot ? at : ''
        };
        updated += 1;
        continue;
      }
      const existingObservedAtMs = timestampOrNull(trackedPlayer.lastObservedAt);
      const freshness = nameObservationFreshness({
        observedAtMs: atMs,
        observedTick: snapshotTick,
        previousObservedAtMs: existingObservedAtMs,
        previousObservedTick: trackedPlayer.lastObservedTick
      });
      const staleObservation = !freshness.accepted;
      if (freshness.advanced) observationAdvanced += 1;
      // maxDrop 与 latestDrop 使用同一套新旧门控: stale/乱序观测不得抬高 max、也不得
      // 回退 latest，避免出现 latestDrop < maxDrop。
      if (!staleObservation) {
        const nextMax = Math.max(Number(trackedPlayer.maxDrop), drop);
        const displayChanged = trackedPlayer.maxDrop !== nextMax
          || trackedPlayer.name !== name
          || trackedPlayer.entityId !== identity.entityId
          || trackedPlayer.latestDrop !== drop
          || (externalBalanceSnapshot !== null
            && trackedPlayer.externalBalanceSnapshot !== externalBalanceSnapshot)
          || trackedPlayer.online !== true;
        if (displayChanged || freshness.advanced) {
          store.players[identity.key] = {
            ...trackedPlayer,
            maxDrop: nextMax,
            entityId: identity.entityId,
            name,
            latestDrop: drop,
            ...(externalBalanceSnapshot !== null ? { externalBalanceSnapshot } : {}),
            lastObservedAt: at,
            lastObservedTick: snapshotTick,
            online: true,
            onlineObservedAt: at,
            ...(externalBalanceSnapshot !== null
              ? { externalBalanceSnapshotAt: at, externalBalanceSnapshotTick: snapshotTick }
              : {}),
            ...(globalSnapshot ? { onlineCheckedAt: at } : {})
          };
          if (displayChanged) updated += 1;
        }
      }
    }
    store.balanceSnapshots = pruneBalanceSnapshots(store.balanceSnapshots);
    if (globalSnapshot) {
      for (const [key, player] of Object.entries(store.players)) {
        const online = presentUserIds.has(player.userId);
        if (player.online !== online) updated += 1;
        store.players[key] = {
          ...player,
          online,
          onlineCheckedAt: at,
          ...(online ? { onlineObservedAt: at } : {})
        };
      }
      store.lastGlobalSnapshotAt = at;
      store.lastGlobalSnapshotSource = source;
    }
    const shouldPersist = updated > 0
      || observationAdvanced > 0
      || globalSnapshot
      || !lastWriteAtMs
      || atMs - lastWriteAtMs >= DEFAULT_SNAPSHOT_GAP_MS;
    store.updatedAt = at;
    store.lastSnapshotAt = at;
    store.lastSnapshotSource = source;
    if (shouldPersist) {
      writeStore(file, store, backgroundIo);
      lastWriteAtMs = atMs;
    }
    return { ok: true, observed, updated, playerCount: Object.keys(store.players).length };
  }

  function status(atMs = now()) {
    ensureToday(atMs);
    const players = Object.values(store.players)
      .map(player => cloneJson(player))
      .sort((a, b) => Number(b.maxDrop) - Number(a.maxDrop)
        || Number(b.latestDrop) - Number(a.latestDrop)
        || String(a.name).localeCompare(String(b.name)));
    return {
      day: store.day,
      updatedAt: store.updatedAt,
      lastSnapshotAt: store.lastSnapshotAt,
      lastSnapshotSource: store.lastSnapshotSource,
      lastGlobalSnapshotAt: store.lastGlobalSnapshotAt,
      lastGlobalSnapshotSource: store.lastGlobalSnapshotSource,
      selfExternalBalanceSnapshot: store.selfExternalBalanceSnapshot,
      selfInitialExternalBalanceSnapshot: store.selfInitialExternalBalanceSnapshot,
      selfBalanceIncomeCoins: store.selfBalanceIncomeRaw === null
        ? null
        : Math.max(0, Math.round(store.selfBalanceIncomeRaw / EXTERNAL_BALANCE_RAW_PER_COIN)),
      selfSessionBalance: store.selfSessionBalance
        ? {
            sessionId: store.selfSessionBalance.sessionId,
            day: store.selfSessionBalance.day,
            coinsGained: sessionBalanceGain(store.selfSessionBalance),
            active: Boolean(store.selfSessionBalance.active)
          }
        : null,
      threshold,
      file,
      players
    };
  }

  function setActiveSession(value) {
    ensureToday(Number(value?.atMs ?? now()));
    const sessionId = String(value?.sessionId || '');
    const current = store.selfSessionBalance;
    if (!sessionId) {
      if (current) current.active = false;
      return false;
    }
    const fallbackCoins = Math.max(0, Math.round(Number(value?.coinsGained || 0) || 0));
    const requestedActive = value?.active !== false;
    if (!requestedActive && current?.sessionId !== sessionId) return false;
    if (current?.sessionId === sessionId) {
      current.active = requestedActive;
      if (current.lastExternalBalanceSnapshot === null) {
        const accountedRaw = Math.max(0, Number(current.completedBalanceRaw || 0) || 0)
          + Math.max(0, Number(current.earnedBalanceRaw || 0) || 0);
        const fallbackRaw = Math.max(0, fallbackCoins * EXTERNAL_BALANCE_RAW_PER_COIN - accountedRaw);
        current.pendingBalanceRaw = Math.max(Number(current.pendingBalanceRaw || 0), fallbackRaw);
      }
      return false;
    }
    const currentBalance = store.selfExternalBalanceSnapshot;
    const previousBalance = store.selfPreviousExternalBalanceSnapshot;
    const currentAtMs = timestampOrNull(store.selfExternalBalanceSnapshotAt);
    const previousAtMs = timestampOrNull(store.selfPreviousExternalBalanceSnapshotAt);
    const enteredAtMs = timestampOrNull(value?.enteredAt);
    const hasEntryBoundary = previousBalance !== null
      && currentBalance !== null
      && previousAtMs !== null
      && currentAtMs !== null
      && enteredAtMs !== null
      && previousAtMs <= enteredAtMs
      && currentAtMs > enteredAtMs;
    const observedSessionGainRaw = hasEntryBoundary && currentBalance > previousBalance
      ? currentBalance - previousBalance
      : null;
    const fallbackRaw = fallbackCoins * EXTERNAL_BALANCE_RAW_PER_COIN;
    store.selfSessionBalance = {
      sessionId,
      day: store.day,
      completedBalanceRaw: 0,
      earnedBalanceRaw: currentBalance === null ? 0 : (observedSessionGainRaw ?? fallbackRaw),
      lastExternalBalanceSnapshot: currentBalance,
      pendingBalanceRaw: currentBalance === null ? fallbackRaw : 0,
      active: requestedActive
    };
    return true;
  }

  function seedDailyBalanceIncome(value = {}) {
    ensureToday(Number(value.atMs ?? now()));
    if (store.selfBalanceIncomeRaw !== null || (value.day && String(value.day) !== store.day)) return false;
    const current = store.selfExternalBalanceSnapshot;
    const initial = store.selfInitialExternalBalanceSnapshot;
    const observedNetRaw = current !== null && initial !== null && current >= initial
      ? current - initial
      : null;
    const fallbackRaw = Math.max(0, Math.round(Number(value.coinsGained || 0) || 0))
      * EXTERNAL_BALANCE_RAW_PER_COIN;
    const dropLossObserved = Math.max(0, Number(value.dropResetCount || 0) || 0) > 0;
    store.selfBalanceIncomeRaw = dropLossObserved
      ? Math.max(fallbackRaw, observedNetRaw ?? 0)
      : (observedNetRaw ?? fallbackRaw);
    return true;
  }

  function rankedPlayerForDeath(userId, occurredAtMs, atMs = now()) {
    ensureToday(atMs);
    if (dayKey(occurredAtMs) !== store.day) return null;
    const player = store.players[`user:${userId}`];
    if (!player || Math.max(Number(player.initialDrop || 0), Number(player.maxDrop || 0), Number(player.latestDrop || 0)) < 500) return null;
    const firstObservedAtMs = Date.parse(player.firstObservedAt);
    if (!Number.isFinite(firstObservedAtMs) || occurredAtMs < firstObservedAtMs) return null;
    return { userId: player.userId, name: player.name, drop: player.latestDrop };
  }

  return {
    file,
    observeSnapshot,
    rankedPlayerForDeath,
    seedDailyBalanceIncome,
    setActiveSession,
    status
  };
}

function createSnapshotGapPoller(options = {}) {
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const setTimer = typeof options.setTimeout === 'function' ? options.setTimeout : setTimeout;
  const clearTimer = typeof options.clearTimeout === 'function' ? options.clearTimeout : clearTimeout;
  const minimumIntervalMs = Math.max(1000, Number(options.minimumIntervalMs || 1000));
  const intervalMs = Math.max(minimumIntervalMs, Number(options.intervalMs || DEFAULT_SNAPSHOT_GAP_MS));
  const globalIntervalMs = Number(options.globalIntervalMs) > 0
    ? Math.max(minimumIntervalMs, Number(options.globalIntervalMs))
    : 0;
  const notReadyRetryMs = Math.min(intervalMs, Math.max(1000, Number(options.notReadyRetryMs || 30000)));
  let timer = null;
  let stopped = true;
  let inFlight = false;
  let lastSnapshotAtMs = Math.max(0, Number(options.lastSnapshotAtMs || 0));
  let lastGlobalSnapshotAtMs = Math.max(0, Number(options.lastGlobalSnapshotAtMs || 0));
  let lastAttemptAtMs = 0;
  let nextAttemptAtMs = 0;
  let lastCompletedAtMs = 0;
  let lastSuccessAtMs = 0;
  let lastFailureAtMs = 0;
  let lastFailureHttpStatus = null;
  let lastError = '';
  let lifecycleGeneration = 0;
  let nextRequestAllowBurst = false;

  function currentIntervalMs() {
    if (typeof options.getIntervalMs !== 'function') return intervalMs;
    const dynamic = Number(options.getIntervalMs({
      nowMs: now(),
      lastSnapshotAtMs,
      lastAttemptAtMs,
      inFlight,
      stopped
    }));
    return Math.max(minimumIntervalMs, Number.isFinite(dynamic) ? dynamic : intervalMs);
  }

  function currentGlobalIntervalMs() {
    if (globalIntervalMs <= 0) return 0;
    if (typeof options.getGlobalIntervalMs !== 'function') return globalIntervalMs;
    const dynamic = Number(options.getGlobalIntervalMs({
      nowMs: now(),
      lastSnapshotAtMs,
      lastGlobalSnapshotAtMs,
      lastAttemptAtMs,
      inFlight,
      stopped
    }));
    return Math.max(minimumIntervalMs, Number.isFinite(dynamic) ? dynamic : globalIntervalMs);
  }

  function schedule(delayMs = null) {
    if (stopped) return;
    if (timer) clearTimer(timer);
    const t = now();
    const snapshotBase = Math.max(lastSnapshotAtMs, lastAttemptAtMs);
    const snapshotDelay = snapshotBase
      ? Math.max(0, currentIntervalMs() - Math.max(0, t - snapshotBase))
      : 0;
    const globalBase = Math.max(lastGlobalSnapshotAtMs, lastAttemptAtMs);
    const effectiveGlobalIntervalMs = currentGlobalIntervalMs();
    const globalDelay = effectiveGlobalIntervalMs > 0
      ? (globalBase ? Math.max(0, effectiveGlobalIntervalMs - Math.max(0, t - globalBase)) : 0)
      : Infinity;
    const delay = delayMs === null
      ? Math.min(snapshotDelay, globalDelay)
      : Math.max(0, Number(delayMs));
    nextAttemptAtMs = t + Math.max(0, Number(delay) || 0);
    timer = setTimer(run, delay);
    timer?.unref?.();
  }

  function noteSnapshot(observedAtMs = now(), detail = {}) {
    const scheduleAtMs = Number(detail.scheduleAtMs ?? observedAtMs);
    const value = Number.isFinite(scheduleAtMs) ? scheduleAtMs : Number(observedAtMs);
    if (Number.isFinite(value)) {
      lastSnapshotAtMs = Math.max(lastSnapshotAtMs, value);
      if (detail.global === true) lastGlobalSnapshotAtMs = Math.max(lastGlobalSnapshotAtMs, value);
    }
    schedule();
  }

  function refreshSchedule() {
    schedule();
  }

  async function run() {
    timer = null;
    nextAttemptAtMs = 0;
    if (stopped || inFlight) return;
    const runGeneration = lifecycleGeneration;
    if (typeof options.isReady === 'function' && !options.isReady()) {
      schedule(notReadyRetryMs);
      return;
    }
    const t = now();
    const snapshotBase = Math.max(lastSnapshotAtMs, lastAttemptAtMs);
    const globalBase = Math.max(lastGlobalSnapshotAtMs, lastAttemptAtMs);
    const snapshotDue = !snapshotBase || t - snapshotBase >= currentIntervalMs();
    const effectiveGlobalIntervalMs = currentGlobalIntervalMs();
    const globalDue = effectiveGlobalIntervalMs > 0
      && (!globalBase || t - globalBase >= effectiveGlobalIntervalMs);
    if (!snapshotDue && !globalDue) {
      schedule();
      return;
    }
    inFlight = true;
    const attemptAtMs = now();
    lastAttemptAtMs = attemptAtMs;
    const allowBurst = nextRequestAllowBurst;
    nextRequestAllowBurst = false;
    try {
      const payload = await options.fetchSnapshot({
        allowBurst,
        attemptAtMs,
        lifecycleGeneration: runGeneration
      });
      if (payload && !stopped && runGeneration === lifecycleGeneration && typeof options.onSnapshot === 'function') {
        await options.onSnapshot(payload, {
          source: 'gap-http',
          observedAtMs: now(),
          scheduleAtMs: attemptAtMs,
          global: true
        });
      }
      lastCompletedAtMs = now();
      lastSuccessAtMs = lastCompletedAtMs;
      lastError = '';
    } catch (err) {
      lastCompletedAtMs = now();
      lastFailureAtMs = lastCompletedAtMs;
      lastFailureHttpStatus = Number.isFinite(Number(err?.status ?? err?.statusCode))
        ? Math.round(Number(err.status ?? err.statusCode))
        : null;
      lastError = err?.message || String(err);
      if (!stopped && runGeneration === lifecycleGeneration && typeof options.onError === 'function') {
        options.onError(err);
      }
    } finally {
      inFlight = false;
      if (!stopped) schedule();
    }
  }

  function start(detail = {}) {
    if (stopped) lifecycleGeneration += 1;
    if (detail.reset === true) {
      const snapshotAtMs = Math.max(0, Number(detail.snapshotAtMs || 0));
      const globalSnapshotAtMs = Math.max(0, Number(detail.globalSnapshotAtMs ?? snapshotAtMs));
      lastSnapshotAtMs = snapshotAtMs;
      lastGlobalSnapshotAtMs = globalSnapshotAtMs;
      lastAttemptAtMs = 0;
      nextAttemptAtMs = 0;
      lastCompletedAtMs = 0;
      lastSuccessAtMs = 0;
      lastFailureAtMs = 0;
      lastFailureHttpStatus = null;
      lastError = '';
    }
    nextRequestAllowBurst = detail.allowBurst === true;
    stopped = false;
    schedule(detail.immediate === true ? 0 : (lastSnapshotAtMs ? null : 1000));
  }

  function stop() {
    lifecycleGeneration += 1;
    stopped = true;
    nextRequestAllowBurst = false;
    if (timer) clearTimer(timer);
    timer = null;
    nextAttemptAtMs = 0;
  }

  return {
    noteSnapshot,
    refreshSchedule,
    start,
    stop,
    status() {
      return {
        intervalMs,
        globalIntervalMs,
        minimumIntervalMs,
        currentIntervalMs: currentIntervalMs(),
        currentGlobalIntervalMs: currentGlobalIntervalMs(),
        lastSnapshotAtMs,
        lastGlobalSnapshotAtMs,
        lastAttemptAtMs,
        nextAttemptAtMs,
        nextAttemptAt: nextAttemptAtMs > 0 ? new Date(nextAttemptAtMs).toISOString() : '',
        lastCompletedAtMs,
        lastSuccessAtMs,
        lastFailureAtMs,
        lastFailureHttpStatus,
        lastError,
        inFlight,
        stopped,
        lifecycleGeneration
      };
    }
  };
}

module.exports = {
  DEFAULT_RECORD_THRESHOLD,
  DEFAULT_SNAPSHOT_GAP_MS,
  createHighDropPlayerTracker,
  createSnapshotGapPoller,
  dayKey,
  entityDrop
};
