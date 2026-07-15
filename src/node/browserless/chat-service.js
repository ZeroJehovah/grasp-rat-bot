'use strict';

const {
  MAX_CHAT_TEXT_LENGTH,
  createTransportHandle,
  normalizeChatText
} = require('./ws-transport');

const DEFAULT_CHAT_MESSAGE_LIMIT = 80;
const DEFAULT_CHAT_ACTIVE_INTERVAL_MS = 30000;
const DEFAULT_CHAT_IDLE_INTERVAL_MS = 3 * 60 * 1000;
const DEFAULT_CHAT_PAGE_ACTIVE_WINDOW_MS = 45000;
const DEFAULT_CHAT_SEND_BOOST_MS = 2 * 60 * 1000;
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

  const names = new Map();
  const messages = new Map();
  let transport = null;
  let transportAttachedAtMs = 0;
  let transportRunId = '';
  let lastSnapshotAtMs = 0;
  let lastSnapshotSource = '';
  let lastSnapshotTick = null;
  let pageActiveUntilMs = 0;
  let sendBoostUntilMs = 0;
  let pendingSend = null;
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

  function rememberNames(entities = []) {
    for (const entity of entities) {
      const userId = numberOrNull(entity?.user_id ?? entity?.userId);
      const name = String(entity?.name || entity?.display_name || entity?.displayName || '').trim();
      if (userId === null || !name) continue;
      names.set(userId, name);
    }
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
      : (names.get(userId) || existing?.name || `User ${userId}`);
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
    rememberNames(Array.isArray(payload.entities) ? payload.entities : []);
    const sourceMessages = Array.isArray(payload.messages) ? payload.messages : [];
    const snapshotTick = numberOrNull(payload.tick);
    const normalized = [];
    let updated = 0;
    for (const item of sourceMessages) {
      const message = normalizeMessage(item, observedAtMs, snapshotTick);
      if (!message) continue;
      const existing = messages.get(message.key);
      if (!existing || !sameMessageContent(existing, message)) updated += 1;
      messages.set(message.key, message);
      normalized.push(message);
    }
    for (const message of messages.values()) {
      if (message.userId === null || !names.has(message.userId)) continue;
      message.name = names.get(message.userId);
      message.mine = message.userId === selfUserId();
    }
    const ordered = trimMessages();
    const confirmed = confirmPendingSend(normalized, observedAtMs);
    lastSnapshotAtMs = Math.max(lastSnapshotAtMs, observedAtMs);
    lastSnapshotSource = String(detail.source || 'snapshot');
    lastSnapshotTick = numberOrNull(payload.tick);
    return {
      ok: true,
      observed: normalized.length,
      updated,
      confirmed,
      messageCount: ordered.length
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
        retainedMessages: messageLimit
      },
      lastSend: { ...lastSend },
      messages: ordered.map(publicMessage)
    };
  }

  return {
    attachTransport,
    desiredSnapshotIntervalMs,
    detachTransport,
    notePageActivity,
    observeSnapshot,
    sendChat,
    status
  };
}

function runChatServiceSelfTest() {
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
    selfUserId: 7
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
  const onlineStatus = service.status(nowMs);
  service.detachTransport(transport);
  const offlineSend = service.sendChat('offline');
  const invalidSend = service.sendChat('bad\nmessage');
  const tooLongSend = service.sendChat('x'.repeat(MAX_CHAT_TEXT_LENGTH + 1));
  return {
    ok: Boolean(
      first.ok
      && second.ok
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
      && offlineSend.reason === 'game-offline'
      && invalidSend.reason === 'chat-control-character'
      && tooLongSend.reason === 'chat-too-long'
    ),
    first,
    send,
    second,
    onlineStatus,
    offlineSend,
    invalidSend,
    tooLongSend,
    sent
  };
}

module.exports = {
  DEFAULT_CHAT_ACTIVE_INTERVAL_MS,
  DEFAULT_CHAT_IDLE_INTERVAL_MS,
  DEFAULT_CHAT_MESSAGE_LIMIT,
  createChatService,
  runChatServiceSelfTest
};
