'use strict';

const DEFAULT_GAME_ORIGIN = 'https://grasp-rat-game.h-e.top';
const DEFAULT_WS_PATH = '/ws';
const DEFAULT_WS_EXTRA_QUERY = 'compress=gzip%2Cdeflate';
const DEFAULT_CONNECT_TIMEOUT_MS = 10000;

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

function createWebSocket(runtime, wsUrl, options = {}) {
  if (!runtime.supportsOptions) return new runtime.WebSocket(wsUrl);
  return new runtime.WebSocket(wsUrl, [], {
    headers: { Origin: options.gameOrigin || DEFAULT_GAME_ORIGIN },
    perMessageDeflate: false
  });
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
    send(message) {
      if (!handle.isOpen()) throw new Error('websocket is not open');
      ws.send(message);
      if (typeof hooks.onSend === 'function') hooks.onSend({ message });
      return message;
    },
    sendVelocity(dx, dy) {
      return handle.send(`vel ${velocityNumber(dx)} ${velocityNumber(dy)}`);
    },
    sendShoot(targetX, targetY, startX, startY) {
      return handle.send(`shoot ${commandNumber(targetX)} ${commandNumber(targetY)} ${commandNumber(startX)} ${commandNumber(startY)}`);
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
  if (typeof options.onConnectStart === 'function') {
    options.onConnectStart({ wsUrl, runtime: runtime.name });
  }
  const ws = createWebSocket(runtime, wsUrl, options);
  const handle = createTransportHandle(ws, runtime, wsUrl, options);
  let opened = false;
  let settled = false;
  return new Promise((resolve, reject) => {
    const failOpen = error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    };
    const timer = setTimeout(() => {
      if (!opened) {
        try { handle.close(); } catch (_) {}
        failOpen(new Error('websocket connect timeout'));
      }
    }, connectTimeoutMs);
    addWsHandler(ws, 'open', () => {
      opened = true;
      settled = true;
      clearTimeout(timer);
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
          const message = [
            `websocket unexpected response ${statusCode || 'unknown'}`,
            statusMessage,
            contentType ? `content-type=${contentType}` : '',
            body ? `body=${body}` : ''
          ].filter(Boolean).join(' ');
          if (typeof options.onError === 'function') {
            options.onError({ message, opened, statusCode, statusMessage, contentType, body });
          }
          failOpen(new Error(message));
        };
        response.on('data', chunk => chunks.push(Buffer.from(chunk)));
        response.on('end', finish);
        response.on('error', finish);
      });
    }
    addWsHandler(ws, 'error', event => {
      const message = event?.message || event?.error?.message || String(event || 'websocket error');
      if (typeof options.onError === 'function') options.onError({ message, event, opened });
      if (!opened) {
        failOpen(new Error(message));
      }
    });
    addWsHandler(ws, 'close', (eventOrCode, reason) => {
      const code = typeof eventOrCode === 'number' ? eventOrCode : eventOrCode?.code || 0;
      const textReason = typeof eventOrCode === 'number' ? closeReasonText(reason) : closeReasonText(eventOrCode?.reason);
      const wasClean = typeof eventOrCode === 'number' ? code === 1000 : Boolean(eventOrCode?.wasClean);
      if (typeof options.onClose === 'function') options.onClose({ code, reason: textReason, wasClean });
    });
    addWsHandler(ws, 'message', eventOrData => {
      if (typeof options.onMessage === 'function') options.onMessage(eventOrData);
    });
  });
}

function resetWebSocketRuntimeForTest() {
  cachedWebSocketRuntime = null;
}

module.exports = {
  addWsHandler,
  buildWsUrl,
  closeReasonText,
  createTransportHandle,
  createWebSocket,
  getWebSocketRuntime,
  isWsOpen,
  openBrowserlessWs,
  resetWebSocketRuntimeForTest,
  wsOpenState
};
