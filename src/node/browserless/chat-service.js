'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  MAX_CHAT_TEXT_LENGTH,
  createTransportHandle,
  normalizeChatText
} = require('./ws-transport');

const CHAT_NAME_CACHE_SCHEMA_VERSION = 1;
const DEFAULT_CHAT_MESSAGE_LIMIT = 200;
const DEFAULT_CHAT_ACTIVE_INTERVAL_MS = 30000;
const DEFAULT_CHAT_IDLE_INTERVAL_MS = 3 * 60 * 1000;
const DEFAULT_CHAT_PAGE_ACTIVE_WINDOW_MS = 45000;
const DEFAULT_CHAT_SEND_BOOST_MS = 2 * 60 * 1000;
const DEFAULT_CHAT_NAME_CACHE_TTL_MS = 48 * 60 * 60 * 1000;
const DEFAULT_CHAT_NAME_CACHE_LIMIT = 5000;
const DEFAULT_CHAT_NAME_CACHE_PERSIST_INTERVAL_MS = 3 * 60 * 1000;
const DEFAULT_CHAT_HISTORY_RESYNC_INTERVAL_MS = 3 * 60 * 1000;
const SERVER_TICK_MS = 50;
const MAX_MESSAGE_TICK_AGE = 2 * 24 * 60 * 60 * 1000 / SERVER_TICK_MS;

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function messageKey(message = {}) {
  const id = numberOrNull(message.id);
  if (id !== null) return `id:${id}`;
  return [
    'fallback',
    numberOrNull(message.tick) ?? '',
    String(message.kind || ''),
    numberOrNull(message.user_id ?? message.userId) ?? '',
    numberOrNull(message.target_user_id ?? message.targetUserId) ?? '',
    String(message.text || '')
  ].join(':');
}

function messageOrder(message = {}) {
  const id = numberOrNull(message.id);
  if (id !== null) return id;
  const tick = numberOrNull(message.tick);
  return tick !== null ? tick : 0;
}

function publicMessage(message = {}) {
  return {
    id: message.id,
    tick: message.tick,
    kind: message.kind,
    userId: message.userId,
    targetUserId: message.targetUserId,
    name: message.name,
    text: message.text,
    mine: Boolean(message.mine),
    occurredAt: message.occurredAt,
    firstObservedAt: message.firstObservedAt,
    lastObservedAt: message.lastObservedAt
  };
}

function sameMessageContent(left = {}, right = {}) {
  return left.id === right.id
    && left.tick === right.tick
    && left.kind === right.kind
    && left.userId === right.userId
    && left.targetUserId === right.targetUserId
    && left.name === right.name
    && left.text === right.text
    && Boolean(left.mine) === Boolean(right.mine);
}

function chatValidationError(error) {
  const code = String(error?.code || '');
  if (code === 'chat-empty') return '消息不能为空';
  if (code === 'chat-control-character') return '消息不能包含换行或空字符';
  if (code === 'chat-too-long') return `消息最多 ${MAX_CHAT_TEXT_LENGTH} 个字符`;
  return error?.message || String(error || '消息格式无效');
}

function playerName(entity) {
  return String(
    entity?.name
      || entity?.label
      || entity?.username
      || entity?.user_name
      || entity?.displayName
      || entity?.display_name
      || ''
  ).trim();
}

function emptyNameCache() {
  return {
    schemaVersion: CHAT_NAME_CACHE_SCHEMA_VERSION,
    updatedAt: '',
    players: {}
  };
}

function normalizeNameCache(value, nowMs, ttlMs, limit) {
  const output = emptyNameCache();
  if (!value || typeof value !== 'object') return output;
  output.updatedAt = String(value.updatedAt || '');
  const cutoffMs = Number(nowMs) - ttlMs;
  const players = Object.entries(value.players || {})
    .map(([key, record]) => {
      if (!record || typeof record !== 'object') return null;
      const userId = numberOrNull(record.userId ?? String(key).replace(/^user:/, ''));
      const name = playerName(record);
      const lastObservedAt = String(record.lastObservedAt || '');
      const lastObservedMs = Date.parse(lastObservedAt);
      if (userId === null || !name || !Number.isFinite(lastObservedMs) || lastObservedMs < cutoffMs) return null;
      return {
        key: `user:${userId}`,
        userId,
        name,
        lastObservedAt,
        lastObservedTick: numberOrNull(record.lastObservedTick),
        source: String(record.source || '')
      };
    })
    .filter(Boolean)
    .sort((a, b) => Date.parse(b.lastObservedAt) - Date.parse(a.lastObservedAt))
    .slice(0, limit);
  for (const record of players) output.players[record.key] = record;
  return output;
}

function readNameCache(file, nowMs, ttlMs, limit) {
  if (!file) return emptyNameCache();
  try {
    return normalizeNameCache(JSON.parse(fs.readFileSync(file, 'utf8')), nowMs, ttlMs, limit);
  } catch (_) {
    return emptyNameCache();
  }
}

function writeNameCache(file, cache, backgroundIo = null) {
  if (!file) return false;
  if (backgroundIo?.writeJsonAtomic) {
    if (!backgroundIo.writeJsonAtomic(file, cache)) throw new Error('background chat name-cache persistence unavailable');
    return true;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(cache, null, 2) + '\n');
  fs.renameSync(temporary, file);
  return true;
}

function createChatService(options = {}) {
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const getSelfUserId = typeof options.getSelfUserId === 'function'
    ? options.getSelfUserId
    : () => Number(options.selfUserId || 0);
  const onPollingDemandChange = typeof options.onPollingDemandChange === 'function'
    ? options.onPollingDemandChange
    : null;
  const messageLimit = Math.max(1, Math.round(Number(options.messageLimit || DEFAULT_CHAT_MESSAGE_LIMIT)));
  const activeIntervalMs = Math.max(30000, Number(options.activeIntervalMs || DEFAULT_CHAT_ACTIVE_INTERVAL_MS));
  const idleIntervalMs = Math.max(activeIntervalMs, Number(options.idleIntervalMs || DEFAULT_CHAT_IDLE_INTERVAL_MS));
  const pageActiveWindowMs = Math.max(activeIntervalMs, Number(options.pageActiveWindowMs || DEFAULT_CHAT_PAGE_ACTIVE_WINDOW_MS));
  const sendBoostMs = Math.max(activeIntervalMs, Number(options.sendBoostMs || DEFAULT_CHAT_SEND_BOOST_MS));
  const nameCacheFile = options.nameCacheFile ? path.resolve(options.nameCacheFile) : '';
  const historyFile = options.historyFile ? path.resolve(options.historyFile) : '';
  const nameCacheTtlMs = Math.max(60 * 60 * 1000, Number(options.nameCacheTtlMs || DEFAULT_CHAT_NAME_CACHE_TTL_MS));
  const nameCacheLimit = Math.max(100, Math.round(Number(options.nameCacheLimit || DEFAULT_CHAT_NAME_CACHE_LIMIT)));
  const nameCachePersistIntervalMs = Math.max(30000, Number(
    options.nameCachePersistIntervalMs || DEFAULT_CHAT_NAME_CACHE_PERSIST_INTERVAL_MS
  ));
  const historyResyncIntervalMs = Math.max(30000, Number(
    options.historyResyncIntervalMs || DEFAULT_CHAT_HISTORY_RESYNC_INTERVAL_MS
  ));
  const backgroundIo = options.backgroundIo && typeof options.backgroundIo === 'object' ? options.backgroundIo : null;

  const nameCache = readNameCache(nameCacheFile, now(), nameCacheTtlMs, nameCacheLimit);
  const names = new Map(Object.values(nameCache.players).map(record => [record.userId, record]));
  const messages = new Map();
  let transport = null;
  let transportAttachedAtMs = 0;
  let transportRunId = '';
  let lastSnapshotAtMs = 0;
  let lastSnapshotSource = '';
  let lastSnapshotTick = null;
  let pageActiveUntilMs = 0;
  let sendBoostUntilMs = 0;
  let lastNameCachePersistAtMs = Date.parse(nameCache.updatedAt || '');
  if (!Number.isFinite(lastNameCachePersistAtMs)) lastNameCachePersistAtMs = 0;
  let pendingSend = null;
  let historyQueuedBatches = 0;
  let historyQueuedMessages = 0;
  let lastHistoryQueuedAtMs = 0;
  let lastSend = {
    state: 'idle',
    sentAt: '',
    confirmedAt: '',
    error: '',
    textLength: 0
  };

  function selfUserId() {
    return Math.max(0, Number(getSelfUserId() || 0));
  }

  function notifyPollingDemandChange(reason) {
    if (!onPollingDemandChange) return;
    try {
      onPollingDemandChange({ reason, atMs: now() });
    } catch (_) {}
  }

  function desiredSnapshotIntervalMs(atMs = now()) {
    const current = Number(atMs);
    return current < pageActiveUntilMs || current < sendBoostUntilMs
      ? activeIntervalMs
      : idleIntervalMs;
  }

  function notePageActivity(atMs = now()) {
    const current = Number.isFinite(Number(atMs)) ? Number(atMs) : now();
    pageActiveUntilMs = Math.max(pageActiveUntilMs, current + pageActiveWindowMs);
    notifyPollingDemandChange('chat-page-active');
    return pageActiveUntilMs;
  }

  function noteSendActivity(atMs = now()) {
    const current = Number.isFinite(Number(atMs)) ? Number(atMs) : now();
    sendBoostUntilMs = Math.max(sendBoostUntilMs, current + sendBoostMs);
    notifyPollingDemandChange('chat-send');
    return sendBoostUntilMs;
  }

  function trimNameCache(atMs = now()) {
    const cutoffMs = Number(atMs) - nameCacheTtlMs;
    const retained = Array.from(names.values())
      .filter(record => Date.parse(record.lastObservedAt || '') >= cutoffMs)
      .sort((a, b) => Date.parse(b.lastObservedAt) - Date.parse(a.lastObservedAt))
      .slice(0, nameCacheLimit);
    names.clear();
    nameCache.players = {};
    for (const record of retained) {
      names.set(record.userId, record);
      nameCache.players[record.key] = record;
    }
  }

  function persistNameCache(atMs = now()) {
    if (!nameCacheFile) return false;
    trimNameCache(atMs);
    nameCache.updatedAt = new Date(atMs).toISOString();
    const written = writeNameCache(nameCacheFile, nameCache, backgroundIo);
    if (written) lastNameCachePersistAtMs = Number(atMs);
    return written;
  }

  function rememberNames(entities = [], detail = {}) {
    const observedAtMs = Number.isFinite(Number(detail.observedAtMs)) ? Number(detail.observedAtMs) : now();
    const at = new Date(observedAtMs).toISOString();
    const observedTick = numberOrNull(detail.tick);
    const source = String(detail.source || 'snapshot');
    let updated = 0;
    let nameChanged = false;
    const changedPlayers = [];
    for (const entity of entities) {
      const userId = numberOrNull(entity?.user_id ?? entity?.userId);
      const name = playerName(entity);
      if (userId === null || !name) continue;
      const existing = names.get(userId) || null;
      const entityObservedAt = String(entity?.lastObservedAt || entity?.nameUpdatedAt || at);
      const entityObservedMs = Date.parse(entityObservedAt);
      const recordAt = Number.isFinite(entityObservedMs) ? entityObservedAt : at;
      const record = {
        key: `user:${userId}`,
        userId,
        name,
        lastObservedAt: recordAt,
        lastObservedTick: numberOrNull(entity?.lastObservedTick ?? entity?.nameObservedTick ?? observedTick),
        source
      };
      const existingAtMs = Date.parse(existing?.lastObservedAt || '');
      if (!existing || !Number.isFinite(existingAtMs) || Date.parse(record.lastObservedAt) >= existingAtMs) {
        names.set(userId, record);
        nameCache.players[record.key] = record;
        if (!existing || existing.name !== name) {
          updated += 1;
          nameChanged = true;
          changedPlayers.push({
            userId,
            name,
            observedAtMs: Date.parse(record.lastObservedAt),
            firstObservedAtMs: existingAtMs || Date.parse(record.lastObservedAt)
          });
        }
      }
    }
    if (
      nameCacheFile
      && (nameChanged || !lastNameCachePersistAtMs || observedAtMs - lastNameCachePersistAtMs >= nameCachePersistIntervalMs)
    ) {
      persistNameCache(observedAtMs);
    }
    return { updated, playerCount: names.size, changedPlayers };
  }

  function queueHistory(messagesToPersist, playersToPersist, source, observedAtMs) {
    if (!historyFile || (!messagesToPersist.length && !playersToPersist.length)) return false;
    if (!backgroundIo?.appendChatHistory) throw new Error('background chat-history persistence unavailable');
    const playersById = new Map();
    for (const player of playersToPersist) {
      const userId = numberOrNull(player?.userId ?? player?.user_id);
      if (userId !== null) playersById.set(userId, player);
    }
    for (const message of messagesToPersist) {
      for (const userId of [message.userId, message.targetUserId]) {
        if (userId === null || playersById.has(userId)) continue;
        const known = names.get(userId);
        playersById.set(userId, {
          userId,
          name: known?.name || '',
          observedAtMs,
          firstObservedAtMs: Date.parse(known?.lastObservedAt || '') || observedAtMs
        });
      }
    }
    const queued = backgroundIo.appendChatHistory(historyFile, {
      players: Array.from(playersById.values()),
      messages: messagesToPersist.map(message => ({
        ...message,
        eventKey: message.key,
        source
      }))
    });
    if (!queued) throw new Error('background chat-history queue unavailable');
    historyQueuedBatches += 1;
    historyQueuedMessages += messagesToPersist.length;
    lastHistoryQueuedAtMs = observedAtMs;
    return true;
  }

  function findPlayersByName(input) {
    const requested = String(input || '').trim();
    if (!requested) return [];
    return Array.from(names.values())
      .filter(record => record.name === requested)
      .sort((left, right) => Date.parse(right.lastObservedAt || '') - Date.parse(left.lastObservedAt || ''))
      .map(record => ({ userId: record.userId, name: record.name, lastObservedAt: record.lastObservedAt }));
  }

  if (Array.isArray(options.seedPlayers) && options.seedPlayers.length) {
    rememberNames(options.seedPlayers, {
      observedAtMs: now(),
      source: 'persisted-tracker-seed'
    });
  }

  function normalizeMessage(item, observedAtMs, snapshotTickValue = null) {
    if (!item || typeof item !== 'object') return null;
    const id = numberOrNull(item.id);
    const tick = numberOrNull(item.tick);
    const userId = numberOrNull(item.user_id ?? item.userId);
    const targetUserId = numberOrNull(item.target_user_id ?? item.targetUserId);
    const text = String(item.text ?? '');
    const key = messageKey(item);
    const existing = messages.get(key) || null;
    const at = new Date(observedAtMs).toISOString();
    const snapshotTick = numberOrNull(snapshotTickValue);
    const tickAge = tick !== null && snapshotTick !== null ? snapshotTick - tick : null;
    const occurredAt = existing?.occurredAt || (
      tickAge !== null && tickAge >= 0 && tickAge <= MAX_MESSAGE_TICK_AGE
        ? new Date(observedAtMs - tickAge * SERVER_TICK_MS).toISOString()
        : (existing?.firstObservedAt || at)
    );
    const name = userId === null
      ? ''
      : (names.get(userId)?.name || existing?.name || `User ${userId}`);
    return {
      key,
      id,
      tick,
      kind: String(item.kind || 'chat'),
      userId,
      targetUserId,
      name,
      text,
      mine: userId !== null && userId === selfUserId(),
      occurredAt,
      firstObservedAt: existing?.firstObservedAt || at,
      lastObservedAt: at
    };
  }

  function trimMessages() {
    const ordered = Array.from(messages.values()).sort((a, b) => {
      const order = messageOrder(a) - messageOrder(b);
      if (order) return order;
      return String(a.key).localeCompare(String(b.key));
    });
    const retained = ordered.slice(-messageLimit);
    const retainedKeys = new Set(retained.map(message => message.key));
    for (const key of messages.keys()) {
      if (!retainedKeys.has(key)) messages.delete(key);
    }
    return retained;
  }

  function confirmPendingSend(observedMessages, observedAtMs) {
    if (!pendingSend) return false;
    const newOwnMessages = observedMessages.filter(message => (
      message.mine
      && !['kill', 'system'].includes(message.kind)
      && !pendingSend.knownMessageKeys.has(message.key)
    ));
    const confirmed = newOwnMessages.find(message => message.text === pendingSend.text)
      || newOwnMessages[0]
      || null;
    if (!confirmed) return false;
    lastSend = {
      state: 'confirmed',
      sentAt: new Date(pendingSend.sentAtMs).toISOString(),
      confirmedAt: new Date(observedAtMs).toISOString(),
      error: '',
      textLength: pendingSend.text.length,
      messageId: confirmed.id,
      serverTextChanged: confirmed.text !== pendingSend.text
    };
    pendingSend = null;
    return true;
  }

  function observeSnapshot(payload, detail = {}) {
    const observedAtMs = Number.isFinite(Number(detail.observedAtMs))
      ? Number(detail.observedAtMs)
      : now();
    if (!payload || typeof payload !== 'object') {
      return { ok: false, reason: 'invalid-snapshot-payload', observed: 0, updated: 0 };
    }
    const nameResult = rememberNames(Array.isArray(payload.entities) ? payload.entities : [], {
      observedAtMs,
      tick: payload.tick,
      source: detail.source || 'snapshot'
    });
    const sourceMessages = Array.isArray(payload.messages) ? payload.messages : [];
    const snapshotTick = numberOrNull(payload.tick);
    const normalized = [];
    const historyMessages = [];
    let updated = 0;
    for (const item of sourceMessages) {
      const message = normalizeMessage(item, observedAtMs, snapshotTick);
      if (!message) continue;
      const existing = messages.get(message.key);
      if (!existing || !sameMessageContent(existing, message)) {
        updated += 1;
        historyMessages.push(message);
      }
      messages.set(message.key, message);
      normalized.push(message);
    }
    for (const message of messages.values()) {
      if (message.userId === null || !names.has(message.userId)) continue;
      message.name = names.get(message.userId).name;
      message.mine = message.userId === selfUserId();
    }
    const ordered = trimMessages();
    const historyResyncDue = Boolean(
      historyFile
      && lastHistoryQueuedAtMs
      && observedAtMs - lastHistoryQueuedAtMs >= historyResyncIntervalMs
    );
    queueHistory(
      historyResyncDue ? normalized : historyMessages,
      nameResult.changedPlayers || [],
      String(detail.source || 'snapshot'),
      observedAtMs
    );
    const confirmed = confirmPendingSend(normalized, observedAtMs);
    lastSnapshotAtMs = Math.max(lastSnapshotAtMs, observedAtMs);
    lastSnapshotSource = String(detail.source || 'snapshot');
    lastSnapshotTick = numberOrNull(payload.tick);
    return {
      ok: true,
      observed: normalized.length,
      updated,
      confirmed,
      messageCount: ordered.length,
      namesUpdated: nameResult.updated
    };
  }

  function attachTransport(nextTransport, detail = {}) {
    transport = nextTransport || null;
    transportAttachedAtMs = transport ? now() : 0;
    transportRunId = transport ? String(detail.runId || '') : '';
    return Boolean(transport);
  }

  function detachTransport(expectedTransport = null) {
    if (expectedTransport && transport !== expectedTransport) return false;
    transport = null;
    transportAttachedAtMs = 0;
    transportRunId = '';
    return true;
  }

  function sendAvailable() {
    if (!transport) return false;
    try {
      return typeof transport.isOpen === 'function' ? Boolean(transport.isOpen()) : true;
    } catch (_) {
      return false;
    }
  }

  function sendChat(input) {
    let text;
    try {
      text = normalizeChatText(input);
    } catch (err) {
      const error = chatValidationError(err);
      lastSend = {
        state: 'failed',
        sentAt: '',
        confirmedAt: '',
        error,
        textLength: String(input ?? '').length
      };
      return { ok: false, statusCode: 400, reason: err?.code || 'invalid-chat-message', error };
    }
    if (!sendAvailable()) {
      const error = '角色当前不在游戏内，聊天发送仅支持复用在线连接';
      lastSend = {
        state: 'failed',
        sentAt: '',
        confirmedAt: '',
        error,
        textLength: text.length
      };
      return { ok: false, statusCode: 409, reason: 'game-offline', error };
    }
    const sentAtMs = now();
    try {
      if (typeof transport.sendChat === 'function') transport.sendChat(text);
      else transport.send(`chat ${text}`);
    } catch (err) {
      const error = err?.message || String(err);
      lastSend = {
        state: 'failed',
        sentAt: new Date(sentAtMs).toISOString(),
        confirmedAt: '',
        error,
        textLength: text.length
      };
      return { ok: false, statusCode: 409, reason: 'chat-send-failed', error };
    }
    pendingSend = {
      text,
      sentAtMs,
      knownMessageKeys: new Set(messages.keys())
    };
    lastSend = {
      state: 'sent',
      sentAt: new Date(sentAtMs).toISOString(),
      confirmedAt: '',
      error: '',
      textLength: text.length
    };
    noteSendActivity(sentAtMs);
    return {
      ok: true,
      reason: 'sent-on-online-websocket',
      sentAt: lastSend.sentAt,
      textLength: text.length,
      pendingSnapshotConfirmation: true
    };
  }

  function status(atMs = now()) {
    const current = Number.isFinite(Number(atMs)) ? Number(atMs) : now();
    const ordered = Array.from(messages.values()).sort((a, b) => {
      const order = messageOrder(a) - messageOrder(b);
      if (order) return order;
      return String(a.key).localeCompare(String(b.key));
    });
    return {
      ok: true,
      selfUserId: selfUserId() || null,
      sendAvailable: sendAvailable(),
      sendMode: 'online-websocket-only',
      offlineSendSupported: false,
      offlineSendReason: 'authenticated-websocket-joins-game',
      transport: {
        online: sendAvailable(),
        attachedAt: transportAttachedAtMs ? new Date(transportAttachedAtMs).toISOString() : '',
        runId: transportRunId
      },
      snapshot: {
        lastAt: lastSnapshotAtMs ? new Date(lastSnapshotAtMs).toISOString() : '',
        source: lastSnapshotSource,
        tick: lastSnapshotTick,
        desiredIntervalMs: desiredSnapshotIntervalMs(current),
        activeIntervalMs,
        idleIntervalMs,
        minimumIntervalMs: activeIntervalMs,
        pageActive: current < pageActiveUntilMs,
        boostedAfterSend: current < sendBoostUntilMs,
        pageActiveUntil: pageActiveUntilMs ? new Date(pageActiveUntilMs).toISOString() : '',
        sendBoostUntil: sendBoostUntilMs ? new Date(sendBoostUntilMs).toISOString() : ''
      },
      limits: {
        messageLength: MAX_CHAT_TEXT_LENGTH,
        retainedMessages: messageLimit,
        retainedNames: nameCacheLimit,
        nameTtlMs: nameCacheTtlMs
      },
      nameCache: {
        enabled: Boolean(nameCacheFile),
        playerCount: names.size,
        updatedAt: nameCache.updatedAt
      },
      history: {
        enabled: Boolean(historyFile),
        queuedBatches: historyQueuedBatches,
        queuedMessages: historyQueuedMessages,
        lastQueuedAt: lastHistoryQueuedAtMs ? new Date(lastHistoryQueuedAtMs).toISOString() : ''
      },
      lastSend: { ...lastSend },
      messages: ordered.map(publicMessage)
    };
  }

  return {
    attachTransport,
    desiredSnapshotIntervalMs,
    detachTransport,
    findPlayersByName,
    notePageActivity,
    observeSnapshot,
    rememberNames,
    sendChat,
    status
  };
}

function runChatServiceSelfTest() {
  const cacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'grasp-rat-chat-names-'));
  const nameCacheFile = path.join(cacheRoot, 'player-names.json');
  const historyFile = path.join(cacheRoot, 'chat-history.sqlite3');
  const historyBatches = [];
  let nowMs = Date.UTC(2026, 6, 14, 4, 0, 0);
  const sent = [];
  const transport = createTransportHandle({
    readyState: 1,
    send(message) {
      sent.push(message);
    }
  }, { WebSocket: { OPEN: 1 } }, 'ws://self-test');
  const service = createChatService({
    now: () => nowMs,
    selfUserId: 7,
    nameCacheFile,
    historyFile,
    backgroundIo: {
      appendChatHistory(file, batch) {
        historyBatches.push({ file, batch });
        return true;
      }
    },
    nameCacheTtlMs: 60 * 60 * 1000,
    nameCachePersistIntervalMs: 30000
  });
  const first = service.observeSnapshot({
    tick: 100,
    entities: [{ user_id: 7, name: 'Self' }, { user_id: 8, name: 'Alice' }],
    messages: [{ id: 10, tick: 90, kind: 'chat', user_id: 8, target_user_id: 0, text: 'hello' }]
  }, { source: 'test', observedAtMs: nowMs });
  service.notePageActivity(nowMs);
  service.attachTransport(transport, { runId: 'self-test' });
  const send = service.sendChat('  你好  ');
  nowMs += 1000;
  const second = service.observeSnapshot({
    tick: 101,
    entities: [{ user_id: 7, name: 'Self' }, { user_id: 8, name: 'Alice' }],
    messages: [
      { id: 10, tick: 90, kind: 'chat', user_id: 8, target_user_id: 0, text: 'hello' },
      { id: 11, tick: 101, kind: 'chat', user_id: 7, target_user_id: 0, text: '你好' }
    ]
  }, { source: 'test', observedAtMs: nowMs });
  const repeated = service.observeSnapshot({
    tick: 101,
    entities: [{ user_id: 7, name: 'Self' }, { user_id: 8, name: 'Alice' }],
    messages: [
      { id: 10, tick: 90, kind: 'chat', user_id: 8, target_user_id: 0, text: 'hello' },
      { id: 11, tick: 101, kind: 'chat', user_id: 7, target_user_id: 0, text: '你好' }
    ]
  }, { source: 'repeat-test', observedAtMs: nowMs + 50 });
  const onlineStatus = service.status(nowMs);
  const resynced = service.observeSnapshot({
    tick: 101,
    entities: [{ user_id: 7, name: 'Self' }, { user_id: 8, name: 'Alice' }],
    messages: [
      { id: 10, tick: 90, kind: 'chat', user_id: 8, target_user_id: 0, text: 'hello' },
      { id: 11, tick: 101, kind: 'chat', user_id: 7, target_user_id: 0, text: '你好' }
    ]
  }, { source: 'resync-test', observedAtMs: nowMs + DEFAULT_CHAT_HISTORY_RESYNC_INTERVAL_MS });
  const retentionService = createChatService({
    now: () => nowMs,
    selfUserId: 7
  });
  retentionService.observeSnapshot({
    tick: 500,
    messages: Array.from({ length: DEFAULT_CHAT_MESSAGE_LIMIT + 5 }, (_, index) => ({
      id: index + 1,
      tick: index + 1,
      kind: 'chat',
      user_id: 8,
      target_user_id: 0,
      text: `message-${index + 1}`
    }))
  }, { source: 'retention-test', observedAtMs: nowMs });
  const retentionStatus = retentionService.status(nowMs);
  const retentionSummary = {
    limit: retentionStatus.limits.retainedMessages,
    count: retentionStatus.messages.length,
    firstId: retentionStatus.messages[0]?.id,
    lastId: retentionStatus.messages.at(-1)?.id
  };
  const restartedService = createChatService({
    now: () => nowMs,
    selfUserId: 7,
    nameCacheFile,
    nameCacheTtlMs: 60 * 60 * 1000
  });
  restartedService.observeSnapshot({
    tick: 510,
    entities: [],
    messages: [{ id: 12, tick: 509, kind: 'chat', user_id: 8, target_user_id: 0, text: 'after restart' }]
  }, { source: 'restart-test', observedAtMs: nowMs });
  const restartedStatus = restartedService.status(nowMs);
  nowMs += 2 * 60 * 60 * 1000;
  const expiredService = createChatService({
    now: () => nowMs,
    selfUserId: 7,
    nameCacheFile,
    nameCacheTtlMs: 60 * 60 * 1000
  });
  expiredService.observeSnapshot({
    tick: 520,
    entities: [],
    messages: [{ id: 13, tick: 519, kind: 'chat', user_id: 8, target_user_id: 0, text: 'expired' }]
  }, { source: 'expiry-test', observedAtMs: nowMs });
  const expiredStatus = expiredService.status(nowMs);
  service.detachTransport(transport);
  const offlineSend = service.sendChat('offline');
  const invalidSend = service.sendChat('bad\nmessage');
  const tooLongSend = service.sendChat('x'.repeat(MAX_CHAT_TEXT_LENGTH + 1));
  const result = {
    ok: Boolean(
      first.ok
      && second.ok
      && repeated.updated === 0
      && resynced.updated === 0
      && second.confirmed
      && send.ok
      && sent[0] === 'chat 你好'
      && onlineStatus.sendAvailable
      && onlineStatus.lastSend.state === 'confirmed'
      && onlineStatus.messages[0]?.name === 'Alice'
      && onlineStatus.messages[0]?.occurredAt === '2026-07-14T03:59:59.500Z'
      && onlineStatus.messages[1]?.mine === true
      && onlineStatus.messages[1]?.occurredAt === '2026-07-14T04:00:01.000Z'
      && onlineStatus.snapshot.desiredIntervalMs === DEFAULT_CHAT_ACTIVE_INTERVAL_MS
      && onlineStatus.history.enabled
      && onlineStatus.history.queuedBatches === 2
      && onlineStatus.history.queuedMessages === 2
      && historyBatches.length === 3
      && historyBatches[0].file === historyFile
      && historyBatches[0].batch.messages[0]?.eventKey === 'id:10'
      && historyBatches[1].batch.messages[0]?.eventKey === 'id:11'
      && historyBatches[2]?.batch.messages.length === 2
      && retentionSummary.limit === 200
      && retentionSummary.count === 200
      && retentionSummary.firstId === 6
      && retentionSummary.lastId === 205
      && restartedStatus.messages[0]?.name === 'Alice'
      && expiredStatus.messages[0]?.name === 'User 8'
      && offlineSend.reason === 'game-offline'
      && invalidSend.reason === 'chat-control-character'
      && tooLongSend.reason === 'chat-too-long'
    ),
    first,
    send,
    second,
    repeated,
    resynced,
    historyBatches,
    onlineStatus,
    retentionSummary,
    restartedStatus,
    expiredStatus,
    offlineSend,
    invalidSend,
    tooLongSend,
    sent
  };
  fs.rmSync(cacheRoot, { recursive: true, force: true });
  return result;
}

module.exports = {
  DEFAULT_CHAT_ACTIVE_INTERVAL_MS,
  DEFAULT_CHAT_IDLE_INTERVAL_MS,
  DEFAULT_CHAT_MESSAGE_LIMIT,
  createChatService,
  runChatServiceSelfTest
};
