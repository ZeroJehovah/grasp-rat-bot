'use strict';

const DEFAULT_GAME_ORIGIN = 'https://grasp-rat-game.h-e.top';
const DEFAULT_WS_PATH = '/ws';
const DEFAULT_WS_EXTRA_QUERY = 'compress=gzip%2Cdeflate';
const DEFAULT_CONNECT_TIMEOUT_MS = 10000;
const MAX_CHAT_TEXT_LENGTH = 240;

let cachedWebSocketRuntime = null;

function buildWsUrl(options = {}) {
  const userId = Number(options.userId || 0);
  const sessionToken = String(options.sessionToken || '');
  if (!userId || !sessionToken) throw new Error('not logged in');
  const origin = new URL(options.gameOrigin || DEFAULT_GAME_ORIGIN);
  origin.protocol = origin.protocol === 'https:' ? 'wss:' : 'ws:';
  origin.pathname = options.wsPath || DEFAULT_WS_PATH;
  origin.search = `?user_id=${encodeURIComponent(userId)}&token=${encodeURIComponent(sessionToken)}`;
  const extraQuery = options.wsExtraQuery ?? DEFAULT_WS_EXTRA_QUERY;
  if (extraQuery) {
    const extra = new URLSearchParams(String(extraQuery).replace(/^\?/, ''));
    for (const [key, value] of extra) origin.searchParams.set(key, value);
  }
  return origin.toString();
}

function getWebSocketRuntime(options = {}) {
  if (options.runtime) return options.runtime;
  if (typeof options.WebSocketImpl === 'function') {
    return {
      name: options.runtimeName || 'custom',
      WebSocket: options.WebSocketImpl,
      supportsOptions: Boolean(options.supportsOptions)
    };
  }
  if (cachedWebSocketRuntime) return cachedWebSocketRuntime;
  if (typeof globalThis.WebSocket === 'function') {
    cachedWebSocketRuntime = {
      name: 'global',
      WebSocket: globalThis.WebSocket,
      supportsOptions: false
    };
    return cachedWebSocketRuntime;
  }
  try {
    const wsModule = require('ws');
    const WebSocketImpl = wsModule.WebSocket || wsModule;
    if (typeof WebSocketImpl === 'function') {
      cachedWebSocketRuntime = {
        name: 'ws-package',
        WebSocket: WebSocketImpl,
        supportsOptions: true
      };
      return cachedWebSocketRuntime;
    }
  } catch (err) {
    throw new Error('WebSocket runtime unavailable. Run `npm install` in the repo on Node 18, or use Node 22+ with global WebSocket support. Original error: ' + (err?.message || String(err)));
  }
  throw new Error('WebSocket runtime unavailable. Run `npm install` in the repo on Node 18, or use Node 22+ with global WebSocket support.');
}

function wsOpenState(runtime) {
  const value = Number(runtime?.WebSocket?.OPEN);
  return Number.isFinite(value) ? value : 1;
}

function isWsOpen(ws, runtime = cachedWebSocketRuntime) {
  return Boolean(ws && Number(ws.readyState) === wsOpenState(runtime));
}

function addWsHandler(ws, eventName, handler) {
  if (typeof ws.addEventListener === 'function') {
    ws.addEventListener(eventName, handler);
    return;
  }
  if (typeof ws.on === 'function') {
    ws.on(eventName, handler);
    return;
  }
  ws['on' + eventName] = handler;
}

function closeReasonText(reason) {
  if (!reason) return '';
  if (Buffer.isBuffer(reason)) return reason.toString('utf8');
  return String(reason || '');
}

function createWebSocketConnectAbortError(reason = '') {
  const detail = reason instanceof Error
    ? reason.message
    : (typeof reason === 'string' ? reason : '');
  const error = new Error(`websocket connect aborted${detail ? `: ${detail}` : ''}`);
  error.name = 'AbortError';
  error.code = 'websocket-connect-aborted';
  return error;
}

function isWebSocketConnectAbortError(error) {
  return Boolean(
    error
    && (
      error.code === 'websocket-connect-aborted'
      || error.name === 'AbortError'
      || /websocket connect aborted/i.test(error.message || '')
    )
  );
}

function createWebSocket(runtime, wsUrl, options = {}) {
  if (!runtime.supportsOptions) return new runtime.WebSocket(wsUrl);
  const localAddress = String(options.localAddress || '').trim();
  const family = localAddress
    ? (localAddress.includes(':') ? 6 : 4)
    : undefined;
  return new runtime.WebSocket(wsUrl, [], {
    headers: { Origin: options.gameOrigin || DEFAULT_GAME_ORIGIN },
    localAddress: localAddress || undefined,
    ...(family ? { family } : {}),
    perMessageDeflate: false
  });
}

function normalizeChatText(value) {
  const text = String(value ?? '').trim();
  if (!text) {
    const error = new Error('chat message is empty');
    error.code = 'chat-empty';
    throw error;
  }
  if (/[\r\n\0]/.test(text)) {
    const error = new Error('chat message contains a control character');
    error.code = 'chat-control-character';
    throw error;
  }
  if (text.length > MAX_CHAT_TEXT_LENGTH) {
    const error = new Error(`chat message exceeds ${MAX_CHAT_TEXT_LENGTH} characters`);
    error.code = 'chat-too-long';
    throw error;
  }
  return text;
}

function createTransportHandle(ws, runtime, wsUrl, hooks = {}) {
  const commandNumber = value => {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  };
  const velocityNumber = value => {
    const number = Math.round(commandNumber(value));
    return Math.max(-1, Math.min(1, number));
  };
  const handle = {
    ws,
    runtime,
    wsUrl,
    isOpen() {
      return isWsOpen(ws, runtime);
    },
    bufferedAmount() {
      const value = Number(ws?.bufferedAmount || 0);
      return Number.isFinite(value) ? Math.max(0, value) : 0;
    },
    send(message) {
      if (!handle.isOpen()) throw new Error('websocket is not open');
      const bufferedBefore = handle.bufferedAmount();
      ws.send(message);
      const bufferedAfter = handle.bufferedAmount();
      if (typeof hooks.onSend === 'function') hooks.onSend({ message, bufferedBefore, bufferedAfter });
      return message;
    },
    sendVelocity(dx, dy) {
      return handle.send(`vel ${velocityNumber(dx)} ${velocityNumber(dy)}`);
    },
    sendShoot(targetX, targetY, startX, startY) {
      return handle.send(`shoot ${commandNumber(targetX)} ${commandNumber(targetY)} ${commandNumber(startX)} ${commandNumber(startY)}`);
    },
    sendChat(text) {
      return handle.send(`chat ${normalizeChatText(text)}`);
    },
    close(code, reason) {
      if (typeof ws.close === 'function') return ws.close(code, reason);
      return undefined;
    }
  };
  return handle;
}

function openBrowserlessWs(options = {}) {
  const runtime = getWebSocketRuntime(options);
  const wsUrl = options.wsUrl || buildWsUrl(options);
  const connectTimeoutMs = Math.max(1, Number(options.connectTimeoutMs || DEFAULT_CONNECT_TIMEOUT_MS));
  const signal = options.signal || null;
  if (signal?.aborted) {
    return Promise.reject(createWebSocketConnectAbortError(signal.reason));
  }
  if (typeof options.onConnectStart === 'function') {
    options.onConnectStart({ wsUrl, runtime: runtime.name, localAddress: options.localAddress || '' });
  }
  const ws = createWebSocket(runtime, wsUrl, options);
  const handle = createTransportHandle(ws, runtime, wsUrl, options);
  let opened = false;
  let settled = false;
  let aborted = false;
  let timer = null;
  let abortHandler = null;
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      if (signal && abortHandler && typeof signal.removeEventListener === 'function') {
        signal.removeEventListener('abort', abortHandler);
      }
    };
    const failOpen = error => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const abortConnect = () => {
      if (settled) return;
      aborted = true;
      const error = createWebSocketConnectAbortError(signal?.reason);
      if (typeof options.onConnectAbort === 'function') {
        options.onConnectAbort({ wsUrl, runtime: runtime.name, error: error.message });
      }
      // Settle from the close event (or the original connect timeout), not
      // immediately. If the upgrade already crossed the cancellation edge,
      // a late open is then observed, invalidated, and surfaced to the caller
      // before its await continues.
      try {
        handle.close(1000, 'connect-aborted');
      } catch (_) {
        failOpen(error);
      }
    };
    timer = setTimeout(() => {
      if (!opened) {
        failOpen(aborted
          ? createWebSocketConnectAbortError(signal?.reason)
          : new Error('websocket connect timeout'));
        try { handle.close(); } catch (_) {}
      }
    }, connectTimeoutMs);
    addWsHandler(ws, 'open', () => {
      if (aborted || signal?.aborted || settled) {
        if (typeof options.onAbortedOpen === 'function' && (aborted || signal?.aborted)) {
          options.onAbortedOpen({ wsUrl, runtime: runtime.name });
        }
        try {
          handle.close(1000, 'stale-connect');
        } catch (_) {
          if (!settled) failOpen(createWebSocketConnectAbortError(signal?.reason));
        }
        return;
      }
      opened = true;
      settled = true;
      cleanup();
      if (typeof options.onOpen === 'function') options.onOpen({ wsUrl, runtime: runtime.name });
      resolve(handle);
    });
    if (typeof ws.on === 'function') {
      ws.on('unexpected-response', (_request, response) => {
        const chunks = [];
        const statusCode = Number(response?.statusCode || 0);
        const statusMessage = response?.statusMessage || '';
        const headers = response?.headers || {};
        const finish = () => {
          const body = Buffer.concat(chunks).toString('utf8').slice(0, 300);
          const contentType = headers['content-type'] || headers['Content-Type'] || '';
          const responseHeaders = {
            'cf-mitigated': headers['cf-mitigated'] || headers['CF-Mitigated'] || '',
            'cf-ray': headers['cf-ray'] || headers['CF-Ray'] || '',
            server: headers.server || headers.Server || '',
            'content-type': contentType
          };
          const message = [
            `websocket unexpected response ${statusCode || 'unknown'}`,
            statusMessage,
            contentType ? `content-type=${contentType}` : '',
            body ? `body=${body}` : ''
          ].filter(Boolean).join(' ');
          if (typeof options.onError === 'function') {
            options.onError({
              message,
              opened,
              statusCode,
              statusMessage,
              contentType,
              body,
              headers: responseHeaders
            });
          }
          const error = new Error(message);
          error.statusCode = statusCode;
          error.statusMessage = statusMessage;
          error.contentType = contentType;
          error.body = body;
          error.headers = responseHeaders;
          failOpen(error);
        };
        response.on('data', chunk => chunks.push(Buffer.from(chunk)));
        response.on('end', finish);
        response.on('error', finish);
      });
    }
    addWsHandler(ws, 'error', event => {
      const message = event?.message || event?.error?.message || String(event || 'websocket error');
      if (!aborted && typeof options.onError === 'function') options.onError({ message, event, opened });
      if (!opened && !aborted) {
        failOpen(aborted ? createWebSocketConnectAbortError(signal?.reason) : new Error(message));
      }
    });
    addWsHandler(ws, 'close', (eventOrCode, reason) => {
      const code = typeof eventOrCode === 'number' ? eventOrCode : eventOrCode?.code || 0;
      const textReason = typeof eventOrCode === 'number' ? closeReasonText(reason) : closeReasonText(eventOrCode?.reason);
      const wasClean = typeof eventOrCode === 'number' ? code === 1000 : Boolean(eventOrCode?.wasClean);
      if (typeof options.onClose === 'function') options.onClose({ code, reason: textReason, wasClean });
      if (!opened && !settled) {
        failOpen(aborted
          ? createWebSocketConnectAbortError(signal?.reason)
          : new Error(`websocket closed before open${code ? ` (${code})` : ''}${textReason ? `: ${textReason}` : ''}`));
      }
    });
    addWsHandler(ws, 'message', eventOrData => {
      if (typeof options.onMessage === 'function') options.onMessage(eventOrData);
    });
    if (signal && typeof signal.addEventListener === 'function') {
      abortHandler = abortConnect;
      signal.addEventListener('abort', abortHandler, { once: true });
      if (signal.aborted) abortConnect();
    }
  });
}

function resetWebSocketRuntimeForTest() {
  cachedWebSocketRuntime = null;
}

module.exports = {
  MAX_CHAT_TEXT_LENGTH,
  addWsHandler,
  buildWsUrl,
  closeReasonText,
  createWebSocketConnectAbortError,
  createTransportHandle,
  createWebSocket,
  getWebSocketRuntime,
  isWsOpen,
  isWebSocketConnectAbortError,
  normalizeChatText,
  openBrowserlessWs,
  resetWebSocketRuntimeForTest,
  wsOpenState
};
