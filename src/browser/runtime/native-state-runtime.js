'use strict';

const { arrayCount } = require('./array-count');

function createNativeStateRuntime(runtime = {}) {
  const {
    bot,
    cfg,
    storage = typeof localStorage !== 'undefined' ? localStorage : null,
    pageGlobal = typeof window !== 'undefined' ? window : null,
    readPageGlobal = () => null,
    installPageGlobal = () => {},
    recordRuntimeDiagnostics = () => {},
    noteLoginSnapshotProbe = () => {},
    noteLeave403SnapshotProbe = () => {},
    getCurrentUserId = () => 0,
    getSessionToken = () => '',
    getOwnEntity = () => null,
    targetOverlayRenderEntities = () => [],
    runTickSafely = () => {},
    runCallbackSafely = (_label, fn) => (typeof fn === 'function' ? fn : () => {}),
    recordUnhandledTickError = () => {},
    nativeTickMinIntervalMs = () => 0,
    clearPostExitTargetState = () => {},
    exitMotionStopLockRemainingMs = () => 0,
    noteImportantSessionExit = () => null,
    startImportantSession = () => null,
    readImportantLogsStore = () => ({ sessions: [] }),
    writePersistentLastSelfState = () => {},
    summarizeStamina = () => ({}),
    dailyStaminaWindowStartAt = t => t,
    dropValue = () => 0,
    dist = () => Infinity,
    speed = () => 0,
    hypot = Math.hypot,
    clamp = (value, min, max) => Math.max(min, Math.min(max, value)),
    isAlive = value => Boolean(value),
    isFiringEntity = () => false,
    combatMetricRound = value => {
      const number = Number(value);
      return Number.isFinite(number) ? Math.round(number) : null;
    },
    combatMetricEntityId = entity => entity?.id ?? entity?.user_id ?? null,
    combatMetricHp = entity => {
      const number = Number(entity?.hp);
      return Number.isFinite(number) ? number : null;
    },
    now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())
  } = runtime;
  const localStorage = storage;
  const recordRuntimeDiagnosticsCore = (_bot, detail) => recordRuntimeDiagnostics(detail);

  function wsReadyStateNumber(value) {
    if (value === null || value === undefined || value === '') return NaN;
    const n = Number(value);
    return Number.isFinite(n) ? n : NaN;
  }

  function isWsConnectingOrOpen(value) {
    const n = wsReadyStateNumber(value);
    return n === 0 || n === 1;
  }

	  function pageNativeSnapshotUrl(input) {
	    try {
	      const raw = typeof input === 'string' ? input : String(input?.url || input || '');
	      if (!raw) return '';
	      const url = new URL(raw, location.href);
	      if (url.origin !== location.origin || url.pathname !== '/snapshot') return '';
	      return url.toString();
	    } catch (_) {
	      return '';
	    }
	  }

	  function pageNativeSnapshotPayload(payload, meta = {}) {
	    if (!payload || typeof payload !== 'object') return;
	    const entities = Array.isArray(payload?.entities) ? payload.entities : null;
	    if (!entities) {
	      pageNativeSnapshotError(new Error('/snapshot invalid payload'), meta);
	      return;
	    }
	    bot.globalState.tick = Number(payload?.tick || bot.globalState.tick || 0);
	    bot.globalState.entities = entities;
	    bot.globalState.bullets = Array.isArray(payload?.bullets) ? payload.bullets : [];
	    bot.globalState.coinDrops = Array.isArray(payload?.coin_drops) ? payload.coin_drops : [];
	    bot.globalState.messages = Array.isArray(payload?.messages) ? payload.messages : [];
	    bot.globalState.snapshotRefreshedAt = Date.now();
	    bot.globalState.passiveSnapshotRefreshedAt = bot.globalState.snapshotRefreshedAt;
	    bot.globalState.passiveSnapshotSource = String(meta.source || 'page-native-snapshot');
	    bot.globalState.error = String(bot.globalState.error || '').replace(/(^|; )snapshot: [^;]*/g, '').replace(/^;\s*/, '');
	    noteLoginSnapshotProbe(true, {
	      tick: bot.globalState.tick,
	      entities: bot.globalState.entities,
	      source: bot.globalState.passiveSnapshotSource,
	      passive: true
	    });
	    noteLeave403SnapshotProbe(true, {
	      tick: bot.globalState.tick,
	      source: bot.globalState.passiveSnapshotSource,
	      passive: true
	    });
	    recordRuntimeDiagnosticsCore(bot, {
	      lastPassiveSnapshot: {
	        at: bot.globalState.snapshotRefreshedAt,
	        source: bot.globalState.passiveSnapshotSource,
	        url: String(meta.url || ''),
	        entities: arrayCount(bot.globalState.entities),
	        tick: bot.globalState.tick
	      }
	    });
	  }

	  function pageNativeSnapshotError(err, meta = {}) {
	    const message = err?.message || String(err || 'page native snapshot failed');
	    bot.globalState.passiveSnapshotError = message;
	    bot.globalState.passiveSnapshotErrorAt = Date.now();
	    noteLoginSnapshotProbe(false, {
	      error: message,
	      source: String(meta.source || 'page-native-snapshot'),
	      passive: true
	    });
	    noteLeave403SnapshotProbe(false, {
	      error: message,
	      source: String(meta.source || 'page-native-snapshot'),
	      passive: true
	    });
	  }

	  function installPageNativeSnapshotObserver() {
	    const key = '__graspRatPageNativeSnapshotObserver';
	    const state = readPageGlobal(key, null, pageGlobal) || {
	      installed: false,
	      originalResponseJson: null,
	      originalResponseText: null,
	      originalXhrOpen: null,
	      observedXhrs: null
	    };
	    installPageGlobal(key, state, pageGlobal);
	    state.handleSnapshotPayload = pageNativeSnapshotPayload;
	    state.handleSnapshotError = pageNativeSnapshotError;
	    if (state.installed) return;
	    state.installed = true;
	    const observeFetchResponse = (response, parsed, source) => {
	      const snapshotUrl = pageNativeSnapshotUrl(response?.url || '');
	      if (!snapshotUrl) return;
	      Promise.resolve(parsed)
	        .then(payload => {
	          if (!response?.ok) {
	            state.handleSnapshotError?.(new Error('/snapshot HTTP ' + (response?.status || 0)), { source, url: snapshotUrl });
	            return;
	          }
	          state.handleSnapshotPayload?.(payload, { source, url: snapshotUrl });
	        })
	        .catch(err => state.handleSnapshotError?.(err, { source, url: snapshotUrl }));
	    };
	    const ResponseCtor = readPageGlobal('Response', null, pageGlobal);
	    if (typeof ResponseCtor === 'function' && ResponseCtor.prototype) {
	      const responseProto = ResponseCtor.prototype;
	      if (typeof responseProto.json === 'function') {
	        state.originalResponseJson = responseProto.json;
	        responseProto.json = function graspRatObservedResponseJson() {
	          const result = state.originalResponseJson.apply(this, arguments);
	          observeFetchResponse(this, result, 'page-native-fetch-json');
	          return result;
	        };
	      }
	      if (typeof responseProto.text === 'function') {
	        state.originalResponseText = responseProto.text;
	        responseProto.text = function graspRatObservedResponseText() {
	          const result = state.originalResponseText.apply(this, arguments);
	          const snapshotUrl = pageNativeSnapshotUrl(this?.url || '');
	          if (snapshotUrl) {
	            const response = this;
	            const parsed = Promise.resolve(result).then(text => JSON.parse(String(text || 'null')));
	            observeFetchResponse(response, parsed, 'page-native-fetch-text');
	          }
	          return result;
	        };
	      }
	    }
	    const XMLHttpRequestCtor = readPageGlobal('XMLHttpRequest', null, pageGlobal);
	    if (typeof XMLHttpRequestCtor === 'function') {
	      const proto = XMLHttpRequestCtor.prototype;
	      state.originalXhrOpen = proto.open;
	      state.observedXhrs = typeof WeakSet === 'function' ? new WeakSet() : null;
	      proto.open = function graspRatObservedXhrOpen(method, url) {
	        const xhr = this;
	        let snapshotUrl = '';
	        try {
	          snapshotUrl = pageNativeSnapshotUrl(url);
	        } catch (_) {
	          snapshotUrl = '';
	        }
	        if (snapshotUrl && (!state.observedXhrs || !state.observedXhrs.has(xhr))) {
	          try {
	            state.observedXhrs?.add(xhr);
	          } catch (_) {}
	          xhr.addEventListener('loadend', () => {
	            try {
	              if (xhr.status < 200 || xhr.status >= 300) throw new Error('/snapshot HTTP ' + xhr.status);
	              const payload = xhr.responseType === 'json'
	                ? xhr.response
	                : JSON.parse(String(xhr.responseText || xhr.response || 'null'));
	              state.handleSnapshotPayload?.(payload, { source: 'page-native-xhr', url: snapshotUrl });
	            } catch (err) {
	              state.handleSnapshotError?.(err, { source: 'page-native-xhr', url: snapshotUrl });
	            }
	          });
	        }
	        return state.originalXhrOpen.apply(this, arguments);
	      };
	    }
	  }

  function getNativeState() {
	    try {
	      return typeof state === 'object' && state ? state : null;
	    } catch (_) {
	      return null;
	    }
	  }

	  function getNativeControl() {
	    const nativeState = getNativeState();
	    if (!nativeState) return null;
	    const ws = nativeState.ws || null;
	    return {
	      state: nativeState,
	      ws,
	      wsOpen: Boolean(nativeState.wsOpen && ws && ws.readyState === WebSocket.OPEN),
	      wsReadyState: ws ? ws.readyState : null
	    };
	  }

  function wsConstant(name, fallback) {
    try {
      return typeof WebSocket !== 'undefined' && Number.isFinite(Number(WebSocket[name]))
        ? Number(WebSocket[name])
        : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function isOfflineishWsReadyState(value) {
    const state = wsReadyStateNumber(value);
    if (!Number.isFinite(state)) return false;
    return state === wsConstant('CONNECTING', 0)
      || state === wsConstant('CLOSING', 2)
      || state === wsConstant('CLOSED', 3);
  }

  function noteNativeReconnectState(native) {
    if (!native) return { count: 0, churn: false, windowMs: 0 };
    const control = bot.control;
    const t = Date.now();
    const windowMs = Math.max(1000, Number(cfg.offlineReconnectChurnWindowMs || 0) || 10000);
    const minEvents = Math.max(2, Number(cfg.offlineReconnectChurnMinEvents || 0) || 3);
    const readyState = wsReadyStateNumber(native.wsReadyState);
    const previousReadyState = wsReadyStateNumber(control.observedNativeWsReadyState);
    const previousWs = control.observedNativeWs || null;
    const wsChanged = Boolean(native.ws && previousWs && native.ws !== previousWs);
    const hadPrevious = Boolean(previousWs || Number.isFinite(previousReadyState));
    const wasOpen = previousReadyState === wsConstant('OPEN', 1);
    const offlineish = Boolean(!native.wsOpen && isOfflineishWsReadyState(readyState));
    const becameOfflineish = offlineish && (!hadPrevious || wsChanged || wasOpen || previousReadyState !== readyState);
    const events = Array.isArray(control.nativeReconnectEvents) ? control.nativeReconnectEvents : [];
    const freshEvents = events.filter(at => t - Number(at || 0) <= windowMs);
    if (becameOfflineish) freshEvents.push(t);
    control.nativeReconnectEvents = freshEvents;
    control.nativeReconnectEventCount = freshEvents.length;
    control.nativeReconnectWindowMs = windowMs;
	    control.nativeReconnectChurn = Boolean(freshEvents.length >= minEvents);
    control.observedNativeWs = native.ws || null;
    control.observedNativeWsReadyState = native.wsReadyState;
    return {
      count: control.nativeReconnectEventCount,
      churn: control.nativeReconnectChurn,
      windowMs
    };
  }

	  function detachNativeMessagePump() {
	    if (bot.nativeMessageWs) {
	      try {
	        if (bot.nativeMessageHandler) bot.nativeMessageWs.removeEventListener('message', bot.nativeMessageHandler);
	        if (bot.nativeOpenHandler) bot.nativeMessageWs.removeEventListener('open', bot.nativeOpenHandler);
	        if (bot.nativeCloseHandler) bot.nativeMessageWs.removeEventListener('close', bot.nativeCloseHandler);
	        if (bot.nativeErrorHandler) bot.nativeMessageWs.removeEventListener('error', bot.nativeErrorHandler);
	      } catch (_) {}
	    }
	    bot.nativeMessageWs = null;
	    bot.nativeMessageHandler = null;
	    bot.nativeOpenHandler = null;
	    bot.nativeCloseHandler = null;
	    bot.nativeErrorHandler = null;
	  }

	  function triggerNativeTick(source, respectMinInterval = true) {
	    if (!bot.running || bot.ticking) return;
	    const t = now();
	    const minIntervalMs = nativeTickMinIntervalMs({
	      decision: bot.lastDecision,
	      combatTarget: bot.combatTarget,
	      pendingExit: bot.pendingExit,
	      nowMs: t
	    });
	    if (respectMinInterval && t - bot.lastNativeTickAt < minIntervalMs) return;
	    bot.lastNativeTickAt = t;
	    runTickSafely(source);
	  }

	  function ensureNativeMessagePump(native = getNativeControl()) {
	    if (!native?.ws) return false;
	    if (bot.nativeMessageWs === native.ws && bot.nativeMessageHandler) return true;
	    detachNativeMessagePump();
    bot.nativeMessageWs = native.ws;
    bot.nativeMessageHandler = runCallbackSafely('native-ws-message', () => {
      observeNativeWsFrame('native-ws');
      triggerNativeTick('native-ws', true);
    });
    bot.nativeOpenHandler = runCallbackSafely('native-ws-open', () => {
      bot.control.lastOpenAt = Date.now();
      bot.control.lastError = '';
      triggerNativeTick('native-ws-open', false);
    });
	    bot.nativeCloseHandler = runCallbackSafely('native-ws-close', () => {
	      bot.control.wsOpen = false;
	      bot.control.nativeWsOpen = false;
	      bot.control.wsReadyState = native.ws.readyState;
	      bot.control.nativeWsReadyState = native.ws.readyState;
	    });
	    bot.nativeErrorHandler = runCallbackSafely('native-ws-error', () => {
	      bot.control.lastError = 'native websocket error';
	    });
	    try {
	      native.ws.addEventListener('message', bot.nativeMessageHandler);
	      native.ws.addEventListener('open', bot.nativeOpenHandler);
	      native.ws.addEventListener('close', bot.nativeCloseHandler);
	      native.ws.addEventListener('error', bot.nativeErrorHandler);
	      return true;
	    } catch (err) {
	      bot.control.lastError = 'native pump: ' + (err.message || String(err));
	      detachNativeMessagePump();
	      return false;
	    }
	  }

	  function notePageOwnsReconnect() {
	    bot.control.lastError = 'native reconnect disabled; page owns websocket reconnect';
	    return false;
	  }

	  function syncNativeControl(native = getNativeControl()) {
	    if (!native) return false;
	    noteNativeReconnectState(native);
	    bot.control.transport = 'native-page';
	    bot.control.nativeWsOpen = native.wsOpen;
	    bot.control.nativeWsReadyState = native.wsReadyState;
	    bot.control.wsOpen = native.wsOpen;
	    bot.control.wsReadyState = native.wsReadyState;
	    bot.control.connecting = !native.wsOpen && native.wsReadyState === WebSocket.CONNECTING;
	    ensureNativeMessagePump(native);
	    if (native.wsOpen) {
	      if (!bot.control.lastOpenAt) bot.control.lastOpenAt = Date.now();
	      bot.control.lastError = '';
	    }
	    return native.wsOpen;
	  }

	  function summarizeControl() {
	    const control = bot.control;
	    const native = getNativeControl();
	    if (native) syncNativeControl(native);
    const nativeState = native?.state || null;
    const serverPositionStall = summarizeServerPositionStall();
    const serverPositionStallOffline = Boolean(cfg.serverPositionStallOfflineEnabled && serverPositionStall?.stalled);
    const actionSettlementStall = summarizeActionSettlementStall();
    const actionSettlementStallOffline = Boolean(cfg.actionSettlementStallOfflineEnabled && actionSettlementStall?.stalled);
    const effectiveWsOpen = Boolean(control.wsOpen && !serverPositionStallOffline && !actionSettlementStallOffline);
	    const nativeCurrentVel = nativeState?.currentVel
	      ? (Number(nativeState.currentVel.dx || 0) + ' ' + Number(nativeState.currentVel.dy || 0))
	      : '';
	    const nativeKeys = nativeState?.keys && typeof nativeState.keys[Symbol.iterator] === 'function'
	      ? Array.from(nativeState.keys)
	      : [];
	    return {
	      currentUserId: control.currentUserId || getCurrentUserId(),
	      hasToken: Boolean(getSessionToken()),
	      wsOpen: effectiveWsOpen,
      rawWsOpen: Boolean(control.wsOpen),
	      wsReadyState: native ? native.wsReadyState : (control.ws ? control.ws.readyState : control.wsReadyState),
	      connecting: Boolean(control.connecting),
	      transport: control.transport || (native ? 'native-page' : 'none'),
	      allowNativeReconnect: false,
	      allowBotWebSocketFallback: false,
	      nativeWsOpen: Boolean(native?.wsOpen),
	      nativeWsReadyState: native ? native.wsReadyState : null,
	      nativeReconnectChurn: Boolean(control.nativeReconnectChurn),
	      nativeReconnectEventCount: Number(control.nativeReconnectEventCount || 0),
	      nativeReconnectWindowMs: Number(control.nativeReconnectWindowMs || cfg.offlineReconnectChurnWindowMs || 0),
	      lastOpenAgeMs: control.lastOpenAt ? Date.now() - control.lastOpenAt : null,
	      lastMessageAgeMs: control.lastMessageAt ? Date.now() - control.lastMessageAt : null,
	      lastError: actionSettlementStallOffline
          ? 'action settlement stalled'
          : (serverPositionStallOffline
            ? 'server position stalled'
            : (control.lastError === 'server position stalled' || control.lastError === 'action settlement stalled' ? '' : (control.lastError || ''))),
	      lastVelocity: control.lastVelocity || '',
      nonZeroVelocityAgeMs: control.lastNonZeroVelocityAt ? Date.now() - Number(control.lastNonZeroVelocityAt || 0) : null,
      nonZeroVelocityDurationMs: control.nonZeroVelocitySince ? Date.now() - Number(control.nonZeroVelocitySince || 0) : null,
	      nativeCurrentVel,
	      nativeLastVel: nativeState?.lastVel || '',
	      nativeKeys,
      directWsControl: Boolean(cfg.directWsControlEnabled),
      directWsServerMarkerProbe: Boolean(cfg.directWsServerMarkerProbe),
      directVelocityRepeatMs: Number(cfg.directWsVelocityRepeatMs || 0),
      lastDirectVelocity: bot.lastDirectVelocity || '',
      lastDirectVelocityAgeMs: bot.lastDirectVelocityAt ? Math.max(0, Math.round(now() - Number(bot.lastDirectVelocityAt || 0))) : null,
      serverPositionStall,
      actionSettlementStall
	    };
	  }

	  function closeControlWs(reason = '') {
	    const ws = bot.control.ws;
	    bot.control.ws = null;
	    bot.control.wsOpen = false;
	    bot.control.connecting = false;
	    bot.control.wsReadyState = ws ? ws.readyState : bot.control.wsReadyState;
	    if (reason) bot.control.lastError = reason;
	    if (ws) {
	      try {
	        ws.close();
	      } catch (_) {}
	    }
	  }

	  function ensureControlWs() {
	    if (cfg.dryRun) return true;
	    const userId = getCurrentUserId();
	    const token = getSessionToken();
	    bot.control.currentUserId = userId;
	    bot.control.hasToken = Boolean(token);
	    if (!userId) {
	      closeControlWs('missing user id');
	      return false;
	    }
	    const native = getNativeControl();
	    if (native) {
	      if (bot.control.ws) closeControlWs();
	      syncNativeControl(native);
	      if (bot.control.wsOpen) return true;
	      if (isWsConnectingOrOpen(native.wsReadyState)) return false;
	      bot.control.lastError = 'native page websocket offline; page owns reconnect';
	      return false;
	    }
	    if (!token) {
	      closeControlWs('missing login token');
	      return false;
	    }
	    if (bot.control.ws) closeControlWs('bot websocket fallback disabled');
	    bot.control.transport = 'native-page-missing';
	    bot.control.connecting = false;
	    bot.control.wsOpen = false;
	    bot.control.lastError = 'native page websocket unavailable';
	    return false;
	  }

	  function getSelf() {
	    const id = getCurrentUserId();
	    if (!id) return null;
	    const nativeSelf = typeof getOwnEntity === 'function' ? getOwnEntity() : null;
	    if (nativeSelf && Number(nativeSelf.user_id) === id) return nativeSelf;
	    const nativeState = getNativeState();
	    const nativeEntities = Array.isArray(nativeState?.entities) ? nativeState.entities : null;
	    const nativeEntity = (nativeEntities || []).find(e => Number(e.user_id) === id);
	    if (nativeEntity) return nativeEntity;
	    if (nativeEntities) return null;
	    if (!snapshotSelfFreshEnough()) return null;
	    return (bot.globalState.entities || []).find(e => Number(e.user_id) === id) || null;
	  }

	  function getEntities() {
	    const realtimeEntities = getNativeEntityList();
	    if (Array.isArray(realtimeEntities) && realtimeEntities.length) return realtimeEntities;
	    const nativeState = getNativeState();
	    if (Array.isArray(nativeState?.entities) && nativeState.entities.length) return nativeState.entities;
	    return bot.globalState.entities || [];
	  }

  function realtimeEntityWorldPoint(value, preferRender = false) {
    if (!value || typeof value !== 'object') return null;
    const point = value.position || value.pos || value.point || value.coord || null;
    const renderX = firstFiniteNumber(value.visual_x, value.visualX, value.render_x, value.renderX);
    const renderY = firstFiniteNumber(value.visual_y, value.visualY, value.render_y, value.renderY);
    const x = preferRender && Number.isFinite(renderX)
      ? renderX
      : firstFiniteNumber(value.x, value.pos_x, value.posX, value.world_x, value.worldX, value.coord_x, value.coordX, value.center_x, value.centerX, point?.x, renderX);
    const y = preferRender && Number.isFinite(renderY)
      ? renderY
      : firstFiniteNumber(value.y, value.pos_y, value.posY, value.world_y, value.worldY, value.coord_y, value.coordY, value.center_y, value.centerY, point?.y, renderY);
    return Number.isFinite(x) && Number.isFinite(y) ? { ...value, x, y } : null;
  }

  function realtimeEntityKey(entity) {
    const id = entity?.user_id ?? entity?.userId ?? entity?.id;
    if (id !== undefined && id !== null && id !== '') return 'id:' + id;
    const point = realtimeEntityWorldPoint(entity, Boolean(entity?.render || entity?.nativeRender));
    if (!point) return '';
    return 'xy:' + Math.round(Number(point.x) || 0) + ':' + Math.round(Number(point.y) || 0);
  }

  function normalizeRealtimeEntity(raw, source, options = {}) {
    if (!raw || typeof raw !== 'object') return null;
    const point = realtimeEntityWorldPoint(raw, Boolean(options.render || raw.render || raw.nativeRender));
    if (!point) return null;
    return {
      ...raw,
      user_id: raw.user_id ?? raw.userId ?? raw.id,
      id: raw.id ?? raw.user_id ?? raw.userId,
      x: Number(point.x),
      y: Number(point.y),
      native: true,
      realtime: true,
      render: Boolean(options.render || raw.render || raw.nativeRender),
      nativeSource: raw.nativeSource || raw.overlaySource || source
    };
  }

  function mergeRealtimeEntity(previous, next) {
    if (!previous) return next;
    return {
      ...previous,
      ...next,
      native: Boolean(previous.native || next.native),
      realtime: Boolean(previous.realtime || next.realtime),
      render: Boolean(previous.render || next.render),
      snapshot: Boolean(previous.snapshot || next.snapshot)
    };
  }

  function getNativeEntityList() {
    const nativeState = getNativeState();
    const hasNativeArray = Array.isArray(nativeState?.entities);
    const byKey = new Map();
    const add = (raw, source, options = {}) => {
      const entity = normalizeRealtimeEntity(raw, source, options);
      if (!entity) return;
      const key = realtimeEntityKey(entity);
      if (!key) return;
      byKey.set(key, mergeRealtimeEntity(byKey.get(key), entity));
    };
    if (hasNativeArray) {
      for (const entity of nativeState.entities) add(entity, 'state.entities');
    }
    let renderEntities = [];
    try {
      renderEntities = targetOverlayRenderEntities();
    } catch (_) {
      renderEntities = [];
    }
    if (Array.isArray(renderEntities)) {
      for (const entity of renderEntities) {
        add(entity, entity?.overlaySource || 'render', { render: true });
      }
    }
    if (byKey.size) return Array.from(byKey.values());
    return hasNativeArray ? [] : null;
  }

  function listFromNativeCoinValue(value) {
    if (Array.isArray(value)) return value;
    if (value instanceof Map || value instanceof Set) return Array.from(value.values());
    if (value && typeof value === 'object') {
      if (Number.isFinite(firstFiniteNumber(value.x, value.pos_x, value.posX, value.world_x, value.worldX, value.coord_x, value.coordX, value.center_x, value.centerX, value.position?.x, value.pos?.x))) {
        return [value];
      }
      const values = Object.values(value);
      if (values.length && values.every(item => item && typeof item === 'object')) return values;
    }
    return null;
  }

  function addNativeCoinSource(sources, label, value, thisArg = null) {
    let sourceValue = value;
    if (typeof sourceValue === 'function') {
      try {
        sourceValue = sourceValue.call(thisArg);
      } catch (_) {
        return false;
      }
    }
    const list = listFromNativeCoinValue(sourceValue);
    if (!list) return false;
    sources.push({ label, list });
    return true;
  }

  function getNativeCoinSources() {
    const sources = [];
    const win = typeof window === 'object' && window ? window : null;
    try {
      addNativeCoinSource(
        sources,
        'render',
        typeof getRenderCoinDrops === 'function' ? getRenderCoinDrops : win?.getRenderCoinDrops,
        win
      );
    } catch (_) {}
    const nativeState = getNativeState();
    if (!nativeState) return sources;
    for (const key of ['coinDrops', 'coin_drops', 'renderCoinDrops', 'render_coin_drops', 'visibleCoinDrops', 'visible_coin_drops', 'coins', 'drops']) {
      addNativeCoinSource(sources, 'state.' + key, nativeState[key], nativeState);
    }
    for (const key of ['getRenderCoinDrops', 'getCoinDrops', 'getVisibleCoinDrops', 'getCoins']) {
      addNativeCoinSource(sources, 'state.' + key + '()', nativeState[key], nativeState);
    }
    for (const parentKey of ['latestSnapshot', 'latest_snapshot', 'lastSnapshot', 'last_snapshot', 'snapshot', 'currentSnapshot', 'current_snapshot']) {
      const parent = nativeState[parentKey];
      if (!parent || typeof parent !== 'object') continue;
      for (const key of ['coinDrops', 'coin_drops', 'coins', 'drops']) {
        addNativeCoinSource(sources, 'state.' + parentKey + '.' + key, parent[key], parent);
      }
    }
    return sources;
  }

  function getNativeCoinList() {
    const sources = getNativeCoinSources();
    const list = [];
    for (const source of sources) {
      for (const item of source.list) {
        list.push(item && typeof item === 'object' ? { ...item, nativeSource: item.nativeSource || source.label } : item);
      }
    }
    return list.length ? list : null;
  }

  function entityIdKey(entity) {
    const id = entity?.user_id ?? entity?.id;
    return id === undefined || id === null || id === '' ? '' : String(id);
  }

  function buildNativeEntityMeta(nativeEntities) {
    if (!Array.isArray(nativeEntities)) return { available: false, ids: new Set(), aliveIds: new Set() };
    const ids = new Set();
    const aliveIds = new Set();
    for (const entity of nativeEntities) {
      const key = entityIdKey(entity);
      if (!key) continue;
      ids.add(key);
      if (isAlive(entity)) aliveIds.add(key);
    }
    return { available: true, ids, aliveIds };
  }

  function snapshotDataAgeMs() {
    return bot.globalState.snapshotRefreshedAt ? Math.max(0, Date.now() - Number(bot.globalState.snapshotRefreshedAt || 0)) : Infinity;
  }

  function snapshotDataFreshEnough() {
    return snapshotDataAgeMs() <= Number(cfg.snapshotCoinStaleMs || 0);
  }

  function snapshotBulletFreshEnough() {
    return snapshotDataAgeMs() <= Number(cfg.snapshotBulletStaleMs || 0);
  }

  function snapshotSelfFreshEnough() {
    return snapshotDataAgeMs() <= Number(cfg.snapshotSelfStaleMs || 0);
  }

  function entityFreshEnoughForOffense(entity) {
    return Boolean(entity?.native || !entity?.snapshot || snapshotDataFreshEnough());
  }

  function snapshotEntityAllowed(self, entity, nativeMeta) {
    if (!nativeMeta?.available) return true;
    const distance = self ? dist(self, entity) : Infinity;
    const authoritativeRadius = Math.max(
      Number(cfg.nativeEntityAuthoritativeRadius || 0),
      Number(cfg.combatAttackRange || 0),
      Number(cfg.attackRange || 0),
      Number(cfg.globalAttackMaxDistance || 0)
    );
    if (Number.isFinite(distance) && distance <= authoritativeRadius) return false;
    const key = entityIdKey(entity);
    if (key && nativeMeta.ids.has(key) && !nativeMeta.aliveIds.has(key)) return false;
    return true;
  }

  function firstFiniteNumber(...values) {
    for (const value of values) {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
    return NaN;
  }

  function normalizeCoinDrop(raw, source) {
    if (!raw || typeof raw !== 'object') return null;
    const point = raw.position || raw.pos || raw.point || raw.coord || null;
    const x = firstFiniteNumber(raw.x, raw.pos_x, raw.posX, raw.world_x, raw.worldX, raw.coord_x, raw.coordX, raw.center_x, raw.centerX, point?.x);
    const y = firstFiniteNumber(raw.y, raw.pos_y, raw.posY, raw.world_y, raw.worldY, raw.coord_y, raw.coordY, raw.center_y, raw.centerY, point?.y);
    const amount = firstFiniteNumber(raw.amount, raw.value, raw.coins, raw.coin_amount, raw.coinAmount, raw.count, raw.num, raw.quantity, 0);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(amount) || amount <= 0) return null;
    const dropId = raw.drop_id ?? raw.dropId ?? raw.id ?? raw.coin_id ?? raw.coinId;
    return {
      ...raw,
      drop_id: dropId ?? ('coord:' + Math.round(x) + ':' + Math.round(y) + ':' + amount),
      x,
      y,
      amount,
      snapshot: source === 'snapshot' || Boolean(raw.snapshot),
      native: source === 'native' || Boolean(raw.native)
    };
  }

  function coinDropKey(coin) {
    const id = coin?.drop_id ?? coin?.id ?? coin?.coin_id;
    if (id !== undefined && id !== null && id !== '') return 'id:' + id;
    return 'xy:' + Math.round(Number(coin.x) || 0) + ':' + Math.round(Number(coin.y) || 0) + ':' + (Number(coin.amount) || 0);
  }

  function nativeViewRadiusCm() {
    const nativeState = getNativeState();
    const values = [
      nativeState?.viewRadiusCm,
      nativeState?.view_radius_cm,
      nativeState?.viewRadius,
      nativeState?.view_radius
    ];
    for (const value of values) {
      const radius = Number(value);
      if (Number.isFinite(radius) && radius > 0) return radius;
    }
    return 0;
  }

  function snapshotCoinLocalSuppressRadius() {
    return Math.max(
      0,
      Number(cfg.nativeCoinAuthoritativeRadius || 0),
      nativeViewRadiusCm()
    );
  }

  function snapshotCoinAllowed(self, coin) {
    const distance = self ? dist(self, coin) : Infinity;
    const suppressRadius = snapshotCoinLocalSuppressRadius();
    return !Number.isFinite(distance) || distance > suppressRadius;
  }

  function isSnapshotOnlyCoin(coin) {
    return Boolean(coin?.snapshot) && !coin?.native;
  }

  function snapshotCoinFreshEnough() {
    return snapshotDataFreshEnough();
  }

  function getCoins(self = null) {
    const nativeCoinSources = getNativeCoinSources();
    const nativeCoinList = [];
    for (const source of nativeCoinSources) {
      for (const item of source.list) {
        nativeCoinList.push(item && typeof item === 'object' ? { ...item, nativeSource: item.nativeSource || source.label } : item);
      }
    }
    const nativeCoins = Array.isArray(nativeCoinList)
      ? nativeCoinList.map(coin => normalizeCoinDrop(coin, 'native')).filter(Boolean)
      : [];
    const snapshotCoins = Array.isArray(bot.globalState.coinDrops) ? bot.globalState.coinDrops : [];
    const useSnapshotCoins = snapshotCoinFreshEnough();
    const byKey = new Map();
    const add = (raw, source) => {
      const coin = normalizeCoinDrop(raw, source);
      if (!coin) return;
      const key = coinDropKey(coin);
      const previous = byKey.get(key);
      byKey.set(key, previous ? { ...previous, ...coin, snapshot: Boolean(previous.snapshot || coin.snapshot), native: Boolean(previous.native || coin.native) } : coin);
    };
    if (useSnapshotCoins) {
      for (const coin of snapshotCoins) {
        const normalized = normalizeCoinDrop(coin, 'snapshot');
        if (!normalized || !snapshotCoinAllowed(self, normalized)) continue;
        add(normalized, 'snapshot');
      }
    }
    for (const coin of nativeCoins) add(coin, 'native');
    const merged = Array.from(byKey.values());
    bot.lastCoinSourceSummary = {
      nativeSources: nativeCoinSources.map(source => ({ label: source.label, raw: arrayCount(source.list) })),
      nativeRaw: nativeCoinList.length,
      native: nativeCoins.length,
      snapshotRaw: snapshotCoins.length,
      snapshotFresh: Boolean(useSnapshotCoins),
      suppressRadius: Math.round(snapshotCoinLocalSuppressRadius()),
      merged: merged.length
    };
    return merged;
  }

  function normalizeBullet(raw, source) {
    if (!raw || typeof raw !== 'object') return null;
    let vx = Number(raw.vx ?? raw.velocity_x ?? raw.dx ?? NaN);
    let vy = Number(raw.vy ?? raw.velocity_y ?? raw.dy ?? NaN);
    if (!Number.isFinite(vx)) vx = 0;
    if (!Number.isFinite(vy)) vy = 0;
    const speedPerTick = Number(raw.speed_per_tick ?? raw.speedPerTick ?? raw.speed_per_server_tick ?? NaN);
    if (!(vx || vy)) {
      let dirX = Number(raw.dir_x_micros ?? raw.dirXMicros ?? raw.direction_x_micros ?? raw.dir_x ?? raw.dirX ?? NaN);
      let dirY = Number(raw.dir_y_micros ?? raw.dirYMicros ?? raw.direction_y_micros ?? raw.dir_y ?? raw.dirY ?? NaN);
      if (Number.isFinite(dirX) && Number.isFinite(dirY)) {
        const scale = Math.max(Math.abs(dirX), Math.abs(dirY)) > 10 ? 1000000 : 1;
        dirX /= scale;
        dirY /= scale;
        const speed = Number.isFinite(speedPerTick) && speedPerTick > 0 ? speedPerTick : 500;
        vx = dirX * speed;
        vy = dirY * speed;
      }
    }
    const startX = Number(raw.start_x ?? raw.startX ?? raw.origin_x ?? raw.x ?? raw.pos_x);
    const startY = Number(raw.start_y ?? raw.startY ?? raw.origin_y ?? raw.y ?? raw.pos_y);
    if (!(vx || vy) && Number.isFinite(startX) && Number.isFinite(startY)) {
      const targetX = Number(raw.target_x ?? raw.targetX ?? raw.aim_x ?? raw.aimX);
      const targetY = Number(raw.target_y ?? raw.targetY ?? raw.aim_y ?? raw.aimY);
      const dx = targetX - startX;
      const dy = targetY - startY;
      const distance = Math.hypot(dx, dy);
      if (Number.isFinite(distance) && distance > 0.01) {
        const speed = Number.isFinite(speedPerTick) && speedPerTick > 0 ? speedPerTick : 500;
        vx = dx / distance * speed;
        vy = dy / distance * speed;
      }
    }
    let x = Number(raw.x ?? raw.pos_x ?? raw.head_x ?? raw.headX ?? NaN);
    let y = Number(raw.y ?? raw.pos_y ?? raw.head_y ?? raw.headY ?? NaN);
    const nowTick = Number(raw.local_now_tick ?? raw.now_tick ?? raw.tick ?? bot.globalState.tick ?? NaN);
    const createdTick = Number(raw.created_tick ?? raw.createdTick ?? NaN);
    if ((!Number.isFinite(x) || !Number.isFinite(y)) && Number.isFinite(startX) && Number.isFinite(startY)) {
      x = startX;
      y = startY;
      const speedValue = hypot(vx, vy);
      if (speedValue > 0.01 && Number.isFinite(nowTick) && Number.isFinite(createdTick)) {
        const rangeCm = Number(raw.range_cm ?? raw.rangeCm ?? raw.range ?? 15000);
        const ageTicks = Math.max(0, nowTick - createdTick);
        const travelled = Math.min(Number.isFinite(rangeCm) && rangeCm > 0 ? rangeCm : 15000, ageTicks * speedValue);
        x = startX + vx / speedValue * travelled;
        y = startY + vy / speedValue * travelled;
      }
    }
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const expireTick = Number(raw.expire_tick ?? raw.expireTick ?? NaN);
    if (Number.isFinite(nowTick) && Number.isFinite(expireTick) && nowTick > expireTick + 1) return null;
    const ownerId = raw.ownerId ?? raw.owner_id ?? raw.owner_user_id ?? raw.source_user_id ?? raw.shooter_user_id ?? raw.user_id ?? raw.from_user_id ?? null;
    const id = raw.bullet_id ?? raw.id ?? raw.entity_id ?? (Math.round(x) + ':' + Math.round(y) + ':' + Math.round(vx) + ':' + Math.round(vy));
    return {
      ...raw,
      id,
      x,
      y,
      vx,
      vy,
      ownerId,
      speedPerTick: Number.isFinite(speedPerTick) ? speedPerTick : hypot(vx, vy),
      createdTick: Number.isFinite(createdTick) ? createdTick : null,
      expireTick: Number.isFinite(expireTick) ? expireTick : null,
      snapshot: source === 'snapshot' || Boolean(raw.snapshot),
      native: source === 'native' || Boolean(raw.native)
    };
  }

  function getBullets() {
    const nativeState = getNativeState();
    const nativeBullets = Array.isArray(nativeState?.bullets) ? nativeState.bullets : [];
    const snapshotBullets = Array.isArray(bot.globalState.bullets) ? bot.globalState.bullets : [];
    const useSnapshotBullets = snapshotBulletFreshEnough();
    const byKey = new Map();
    const add = (raw, source) => {
      const bullet = normalizeBullet(raw, source);
      if (!bullet) return;
      const key = String(bullet.id ?? (bullet.x + ':' + bullet.y + ':' + bullet.vx + ':' + bullet.vy));
      const previous = byKey.get(key);
      byKey.set(key, previous ? { ...previous, ...bullet, snapshot: Boolean(previous.snapshot || bullet.snapshot), native: Boolean(previous.native || bullet.native) } : bullet);
    };
    if (useSnapshotBullets) {
      for (const bullet of snapshotBullets) add(bullet, 'snapshot');
    }
    for (const bullet of nativeBullets) add(bullet, 'native');
    return Array.from(byKey.values());
  }

  function fetchJsonNoStore(url, timeoutMs = cfg.globalRefreshTimeoutMs) {
    const ms = Math.max(250, Number(timeoutMs) || cfg.globalRefreshTimeoutMs);
    const options = { cache: 'no-store', __graspRatBotFetch: true };
    let controller = null;
    let timer = 0;
    if (typeof AbortController === 'function') {
      controller = new AbortController();
      options.signal = controller.signal;
    }
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        try {
          if (controller) controller.abort();
        } catch (_) {}
        reject(new Error(url + ' timed out after ' + ms + 'ms'));
      }, ms);
    });
    const request = fetch(url, options).then(res => {
      if (!res.ok) {
        const error = new Error(url + ' HTTP ' + res.status + (res.statusText ? ' ' + res.statusText : ''));
        error.status = res.status;
        error.statusText = res.statusText || '';
        throw error;
      }
      return res.json();
    });
    return Promise.race([request, timeout]).finally(() => clearTimeout(timer));
  }

  function summarizeSelf(self) {
    const stamina = summarizeStamina(self);
    return {
      id: self.user_id,
      name: self.name,
      x: Math.round(Number(self.x) || 0),
      y: Math.round(Number(self.y) || 0),
      hp: self.hp,
      maxHp: Number(self.max_hp ?? self.maxHp ?? 0) || null,
      stamina5s: stamina.stamina5s,
      stamina5sLimit: stamina.stamina5sLimit,
      stamina1h: stamina.stamina1h,
      stamina1hLimit: stamina.stamina1hLimit,
      stamina1d: stamina.stamina1d,
      stamina1dLimit: stamina.stamina1dLimit,
      stamina,
      drop: dropValue(self),
      coins: Number(self.coins || 0),
      life: self.life,
      mode: self.current_join_mode
    };
  }

  function entityPoint(entity) {
    if (!entity) return null;
    const x = Number(entity.x);
    const y = Number(entity.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  }

  function pointDistance(a, b) {
    if (!a || !b) return Infinity;
    return Math.hypot(Number(a.x) - Number(b.x), Number(a.y) - Number(b.y));
  }

  function getSnapshotSelf() {
    const id = getCurrentUserId();
    if (!id) return null;
    return (bot.globalState.entities || []).find(entity => Number(entity.user_id) === Number(id)) || null;
  }

  function currentVelocityCommandActive() {
    const t = Date.now();
    const lastAt = Number(bot.control.lastNonZeroVelocityAt || 0);
    const since = Number(bot.control.nonZeroVelocitySince || 0);
    return Boolean(since && lastAt && t - lastAt <= Math.max(100, Number(cfg.serverPositionCommandFreshMs || 900)));
  }

  function summarizeServerPositionStall(state = bot.serverPositionStall) {
    if (!state) return null;
    return {
      active: Boolean(state.active),
      stalled: Boolean(state.stalled),
      reason: state.reason || '',
      stalledAt: state.stalledAt || 0,
      holdRemainingMs: state.stalledUntil ? Math.max(0, Math.round(Number(state.stalledUntil || 0) - Date.now())) : 0,
      ageMs: state.startedAt ? Math.max(0, Date.now() - Number(state.startedAt || 0)) : 0,
      movingMs: state.movingSince ? Math.max(0, Date.now() - Number(state.movingSince || 0)) : 0,
      clientMoved: Number.isFinite(Number(state.clientMoved)) ? Math.round(Number(state.clientMoved)) : null,
      serverMoved: Number.isFinite(Number(state.serverMoved)) ? Math.round(Number(state.serverMoved)) : null,
      gap: Number.isFinite(Number(state.gap)) ? Math.round(Number(state.gap)) : null,
      gapDelta: Number.isFinite(Number(state.gapDelta)) ? Math.round(Number(state.gapDelta)) : null,
      noServerMove: Boolean(state.noServerMove),
      snapshotAgeMs: Number.isFinite(Number(state.snapshotAgeMs)) ? Math.round(Number(state.snapshotAgeMs)) : null,
      client: state.client ? { x: Math.round(Number(state.client.x) || 0), y: Math.round(Number(state.client.y) || 0) } : null,
      server: state.server ? { x: Math.round(Number(state.server.x) || 0), y: Math.round(Number(state.server.y) || 0) } : null
    };
  }

  function resetServerPositionStall(reason = '') {
    if (bot.serverPositionStall) bot.serverPositionStall.reason = reason || 'reset';
    bot.serverPositionStall = null;
  }

  function summarizeActionSettlementStall(state = bot.actionSettlementStall) {
    if (!state) return null;
    const t = Date.now();
    return {
      active: Boolean(state.active),
      stalled: Boolean(state.stalled),
      reason: state.reason || '',
      startedAt: state.startedAt || 0,
      stalledAt: state.stalledAt || 0,
      ageMs: state.startedAt ? Math.max(0, Math.round(t - Number(state.startedAt || 0))) : 0,
      moveIntent: Boolean(state.moveIntent),
      shootIntent: Boolean(state.shootIntent),
      movementAckStale: Boolean(state.movementAckStale),
      movementAckAgeMs: Number.isFinite(Number(state.movementAckAgeMs)) ? Math.round(Number(state.movementAckAgeMs)) : null,
      noSelfProgress: Boolean(state.noSelfProgress),
      noTargetProgress: Boolean(state.noTargetProgress),
      selfMoved: Number.isFinite(Number(state.selfMoved)) ? Math.round(Number(state.selfMoved)) : null,
      targetId: state.targetId || '',
      targetHp: Number.isFinite(Number(state.targetHp)) ? Number(state.targetHp) : null,
      actionKind: state.actionKind || '',
      actionReason: state.actionReason || ''
    };
  }

  function resetActionSettlementStall(reason = '') {
    if (bot.actionSettlementStall) bot.actionSettlementStall.reason = reason || 'reset';
    bot.actionSettlementStall = null;
  }

  function actionSettlementNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function actionSettlementEntityHp(entity) {
    const candidates = [
      entity?.hp,
      entity?.knownHp,
      entity?.displayHp,
      entity?.health
    ];
    for (const value of candidates) {
      const number = actionSettlementNumber(value);
      if (number !== null) return number;
    }
    return null;
  }

  function actionSettlementTarget(action = {}) {
    return action?.target || action?.combatTarget || bot.combatTarget || null;
  }

  function actionSettlementSample(self, action = {}) {
    if (!self) return null;
    const stamina = summarizeStamina(self);
    const target = actionSettlementTarget(action);
    const targetId = target?.id ?? target?.user_id ?? '';
    return {
      x: actionSettlementNumber(self.x),
      y: actionSettlementNumber(self.y),
      hp: actionSettlementNumber(self.hp),
      stamina5s: actionSettlementNumber(stamina.stamina5s),
      stamina1h: actionSettlementNumber(stamina.stamina1h),
      stamina1d: actionSettlementNumber(stamina.stamina1d),
      coins: actionSettlementNumber(self.coins),
      drop: actionSettlementNumber(dropValue(self)),
      targetId: targetId === null || targetId === undefined ? '' : String(targetId),
      targetHp: actionSettlementEntityHp(target)
    };
  }

  function actionSettlementStableNumber(a, b) {
    if (a === null && b === null) return true;
    if (a === null || b === null) return false;
    return Math.abs(Number(a) - Number(b)) < 0.001;
  }

  function actionSettlementSelfProgress(origin, current, minMove) {
    if (!origin || !current) return true;
    const moved = pointDistance(origin, current);
    const vitalChanged = !actionSettlementStableNumber(origin.hp, current.hp)
      || !actionSettlementStableNumber(origin.stamina5s, current.stamina5s)
      || !actionSettlementStableNumber(origin.stamina1h, current.stamina1h)
      || !actionSettlementStableNumber(origin.stamina1d, current.stamina1d)
      || !actionSettlementStableNumber(origin.coins, current.coins)
      || !actionSettlementStableNumber(origin.drop, current.drop);
    return Boolean(moved >= minMove || vitalChanged);
  }

  function actionSettlementTargetProgress(origin, current) {
    if (!origin || !current) return true;
    if (!origin.targetId && !current.targetId) return false;
    if (origin.targetId !== current.targetId) return true;
    if (origin.targetHp === null && current.targetHp === null) return false;
    return !actionSettlementStableNumber(origin.targetHp, current.targetHp);
  }

  function assessActionSettlementStall(self, action = bot.lastDecision) {
    if (!cfg.actionSettlementStallOfflineEnabled) {
      resetActionSettlementStall('disabled');
      return null;
    }
    const t = Date.now();
    const dx = Number(action?.dx || 0);
    const dy = Number(action?.dy || 0);
    const moveIntent = Boolean(dx || dy || currentVelocityCommandActive());
    const shootIntent = Boolean(action?.shoot && (action?.kind === 'attack' || action?.combat || action?.target));
    if (!self || !isAlive(self) || (!moveIntent && !shootIntent) || bot.pendingExit) {
      resetActionSettlementStall(!self ? 'no-self' : (!isAlive(self) ? 'not-alive' : 'no-action-intent'));
      return null;
    }
    const sample = actionSettlementSample(self, action || {});
    if (!sample || sample.x === null || sample.y === null) {
      resetActionSettlementStall('missing-self-sample');
      return null;
    }
    const minMove = Math.max(1, Number(cfg.actionSettlementStallMoveMinDistance || 80) || 80);
    let state = bot.actionSettlementStall;
    if (!state || !state.active || state.moveIntent !== moveIntent || state.shootIntent !== shootIntent) {
      state = {
        active: true,
        stalled: false,
        reason: 'tracking',
        startedAt: t,
        stalledAt: 0,
        origin: sample,
        latest: sample,
        moveIntent,
        shootIntent,
        actionKind: action?.kind || '',
        actionReason: action?.reason || ''
      };
      bot.actionSettlementStall = state;
      return summarizeActionSettlementStall(state);
    }

    const selfProgress = actionSettlementSelfProgress(state.origin, sample, minMove);
    const targetProgress = actionSettlementTargetProgress(state.origin, sample);
    if (selfProgress || (shootIntent && targetProgress)) {
      state = {
        active: true,
        stalled: false,
        reason: selfProgress ? 'self-progress' : 'target-progress',
        startedAt: t,
        stalledAt: 0,
        origin: sample,
        latest: sample,
        moveIntent,
        shootIntent,
        actionKind: action?.kind || '',
        actionReason: action?.reason || ''
      };
      bot.actionSettlementStall = state;
      return summarizeActionSettlementStall(state);
    }

    const ageMs = Math.max(0, t - Number(state.startedAt || t));
    const network = summarizeNetworkQuality();
    const actionQuality = network?.action || {};
    const ackStaleMs = Math.max(1000, Number(cfg.actionSettlementStallAckStaleMs || 15000) || 15000);
    const lastAckAge = Number(actionQuality.lastMovementAckAgeMs);
    const movementCommands = Math.max(0, Number(actionQuality.movementCommands || 0) || 0);
    const movementAckStale = !moveIntent
      ? false
      : (Number.isFinite(lastAckAge) ? lastAckAge >= ackStaleMs : (movementCommands > 0 && ageMs >= ackStaleMs));
    const settleMs = Math.max(1000, Number(cfg.actionSettlementStallMs || 15000) || 15000);
    const noSelfProgress = !selfProgress;
    const noTargetProgress = !targetProgress;
    const stalled = ageMs >= settleMs
      && noSelfProgress
      && ((moveIntent && movementAckStale) || (shootIntent && noTargetProgress));
    Object.assign(state, {
      stalled,
      reason: stalled ? 'action-settlement-stalled' : 'tracking',
      stalledAt: stalled ? (state.stalledAt || t) : 0,
      latest: sample,
      moveIntent,
      shootIntent,
      movementAckStale,
      movementAckAgeMs: Number.isFinite(lastAckAge) ? lastAckAge : null,
      noSelfProgress,
      noTargetProgress,
      selfMoved: pointDistance(state.origin, sample),
      targetId: sample.targetId,
      targetHp: sample.targetHp,
      actionKind: action?.kind || '',
      actionReason: action?.reason || ''
    });
    if (stalled) bot.control.lastError = 'action settlement stalled';
    else if (bot.control.lastError === 'action settlement stalled') bot.control.lastError = '';
    return summarizeActionSettlementStall(state);
  }

  function assessServerPositionStall(self) {
    if (!cfg.serverPositionStallEnabled) {
      resetServerPositionStall('disabled');
      return null;
    }
    const t = Date.now();
    if (bot.serverPositionStall?.stalled && t < Number(bot.serverPositionStall.stalledUntil || 0)) {
      return summarizeServerPositionStall(bot.serverPositionStall);
    }
    const movingSince = Number(bot.control.nonZeroVelocitySince || 0);
    const commandActive = currentVelocityCommandActive();
    const client = entityPoint(self);
    const serverSelf = getSnapshotSelf();
    const server = entityPoint(serverSelf);
    const snapshotAgeMs = bot.globalState.snapshotRefreshedAt
      ? t - Number(bot.globalState.snapshotRefreshedAt || 0)
      : Infinity;
    const snapshotFresh = snapshotAgeMs <= Math.max(500, Number(cfg.serverPositionSnapshotMaxAgeMs || 2500));
    if (!commandActive || !client || !server || !snapshotFresh || !bot.control.wsOpen) {
      if (!commandActive || !bot.control.wsOpen) resetServerPositionStall(commandActive ? 'ws-offline' : 'not-moving');
      return summarizeServerPositionStall();
    }

    let state = bot.serverPositionStall;
    if (!state || !state.active || Number(state.movingSince || 0) !== movingSince) {
      state = {
        active: true,
        stalled: false,
        reason: 'tracking',
        startedAt: t,
        movingSince,
        clientOrigin: client,
        serverOrigin: server,
        baseGap: pointDistance(client, server),
        client,
        server,
        clientMoved: 0,
        serverMoved: 0,
        gap: pointDistance(client, server),
        gapDelta: 0,
        snapshotAgeMs
      };
      bot.serverPositionStall = state;
      return summarizeServerPositionStall(state);
    }

    const serverMoved = pointDistance(server, state.serverOrigin);
    const serverMoveMax = Math.max(0, Number(cfg.serverPositionServerMoveMax || 80));
    if (serverMoved > serverMoveMax) {
      state = {
        active: true,
        stalled: false,
        reason: 'server-moved',
        startedAt: t,
        movingSince,
        clientOrigin: client,
        serverOrigin: server,
        baseGap: pointDistance(client, server),
        client,
        server,
        clientMoved: 0,
        serverMoved: 0,
        gap: pointDistance(client, server),
        gapDelta: 0,
        snapshotAgeMs
      };
      bot.serverPositionStall = state;
      return summarizeServerPositionStall(state);
    }

    const clientMoved = pointDistance(client, state.clientOrigin);
    const gap = pointDistance(client, server);
    const gapDelta = Math.max(0, gap - Number(state.baseGap || 0));
    const movingMs = t - movingSince;
    const ageMs = t - Number(state.startedAt || t);
    const stallMs = Math.max(500, Number(cfg.serverPositionStallMs || 2500));
    const configuredNoMoveStallMs = Number(cfg.serverPositionNoMoveStallMs);
    const noMoveStallMs = Number.isFinite(configuredNoMoveStallMs) && configuredNoMoveStallMs > 0
      ? Math.max(stallMs, configuredNoMoveStallMs)
      : 0;
    const clientDiverged = movingMs >= stallMs
      && ageMs >= stallMs
      && clientMoved >= Math.max(0, Number(cfg.serverPositionClientMoveMin || 300))
      && serverMoved <= serverMoveMax
      && (gap >= Math.max(0, Number(cfg.serverPositionGapMin || 400))
        || gapDelta >= Math.max(0, Number(cfg.serverPositionGapMin || 400)));
    const noServerMove = noMoveStallMs > 0
      && movingMs >= noMoveStallMs
      && ageMs >= noMoveStallMs
      && serverMoved <= serverMoveMax;
    const stalled = clientDiverged || noServerMove;
    Object.assign(state, {
      stalled,
      reason: stalled ? (noServerMove ? 'server-position-no-move' : 'server-position-stalled') : 'tracking',
      stalledAt: stalled ? (state.stalledAt || t) : 0,
      stalledUntil: stalled ? Math.max(Number(state.stalledUntil || 0), t + Math.max(1000, Number(cfg.serverPositionStallHoldMs || 6000))) : 0,
      client,
      server,
      clientMoved,
      serverMoved,
      gap,
      gapDelta,
      noServerMove,
      snapshotAgeMs
    });
    if (stalled && cfg.serverPositionStallOfflineEnabled) {
      bot.control.lastError = 'server position stalled';
    } else if (bot.control.lastError === 'server position stalled') {
      bot.control.lastError = '';
    }
    return summarizeServerPositionStall(state);
  }

  function resetSessionStaminaStats(session, selfSummary, t = Date.now()) {
    const remaining = Number(selfSummary?.stamina1d ?? selfSummary?.stamina?.stamina1d ?? NaN);
    const limit = Number(selfSummary?.stamina1dLimit ?? selfSummary?.stamina?.stamina1dLimit ?? NaN);
    const cleanLimit = Number.isFinite(limit) && limit > 0 ? limit : null;
    const maxObserved = Number.isFinite(remaining) ? remaining : null;
    const minObserved = Number.isFinite(remaining) ? remaining : null;
    session.stamina1dSpentBeforeSegment = 0;
    session.stamina1dSpentMs = 0;
    session.stamina1dSegmentStartedAt = dailyStaminaWindowStartAt(t);
    session.stamina1dSegmentBase = maxObserved;
    session.stamina1dObservedMax = maxObserved;
    session.stamina1dObservedMin = minObserved;
    session.stamina1dLastRemaining = minObserved;
    session.stamina1dLastLimit = cleanLimit;
  }

  function updateSessionStaminaStats(session, selfSummary, t = Date.now()) {
    const remaining = Number(selfSummary?.stamina1d ?? selfSummary?.stamina?.stamina1d ?? NaN);
    if (!Number.isFinite(remaining)) return;
    const limitRaw = Number(selfSummary?.stamina1dLimit ?? selfSummary?.stamina?.stamina1dLimit ?? NaN);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : null;
    const dayStart = dailyStaminaWindowStartAt(t);
    let segmentStart = Number(session.stamina1dSegmentStartedAt || 0);
    let observedMax = Number(session.stamina1dObservedMax);
    let observedMin = Number(session.stamina1dObservedMin);
    if (!Number.isFinite(observedMax)) observedMax = Number(session.stamina1dSegmentBase);
    if (!Number.isFinite(observedMin)) observedMin = Number(session.stamina1dLastRemaining);
    if (!segmentStart || !Number.isFinite(observedMax)) {
      session.stamina1dSegmentStartedAt = dayStart;
      session.stamina1dSegmentBase = remaining;
      session.stamina1dObservedMax = remaining;
      session.stamina1dObservedMin = remaining;
      session.stamina1dLastRemaining = remaining;
      session.stamina1dLastLimit = limit;
      session.stamina1dSpentBeforeSegment = Math.max(0, Number(session.stamina1dSpentBeforeSegment || 0) || 0);
      session.stamina1dSpentMs = Math.max(0, Math.round(Number(session.stamina1dSpentBeforeSegment || 0) || 0));
      return;
    }
    if (segmentStart !== dayStart) {
      const previousMin = Number.isFinite(observedMin)
        ? observedMin
        : (Number.isFinite(Number(session.stamina1dLastRemaining)) ? Number(session.stamina1dLastRemaining) : observedMax);
      const previousSpent = Math.max(0, observedMax - previousMin);
      session.stamina1dSpentBeforeSegment = Math.max(0, Number(session.stamina1dSpentBeforeSegment || 0) || 0) + previousSpent;
      session.stamina1dSegmentStartedAt = dayStart;
      session.stamina1dSegmentBase = remaining;
      session.stamina1dObservedMax = remaining;
      session.stamina1dObservedMin = remaining;
      observedMax = Number(session.stamina1dObservedMax);
      observedMin = remaining;
    } else {
      observedMax = Math.max(
        Number.isFinite(observedMax) ? observedMax : remaining,
        remaining
      );
      observedMin = Number.isFinite(observedMin) ? Math.min(observedMin, remaining) : remaining;
      session.stamina1dSegmentBase = observedMax;
      session.stamina1dObservedMax = observedMax;
      session.stamina1dObservedMin = observedMin;
    }
    const segmentSpent = Math.max(0, observedMax - observedMin);
    const totalSpent = Math.max(0, Number(session.stamina1dSpentBeforeSegment || 0) || 0) + segmentSpent;
    session.stamina1dSpentMs = Math.max(0, Math.round(totalSpent));
    session.stamina1dLastRemaining = remaining;
    session.stamina1dLastLimit = limit;
  }

  function updateSessionStats(selfSummary) {
    const t = Date.now();
    const session = bot.session || (bot.session = {});
    if (!selfSummary) {
      if (session.startedAt && !session.missingSince) session.missingSince = t;
      return;
    }
    if (selfSummary.life === 'Dead' || selfSummary.life === 'WaitingRevive') {
      if (session.startedAt && !session.missingSince) {
        session.missingSince = t;
        noteImportantSessionExit('not-alive:' + (selfSummary.life || 'unknown'), selfSummary || bot.lastSelf, t);
      }
      return;
    }
    const userId = selfSummary.id ?? null;
    const coins = Number(selfSummary.coins || 0);
    const missingMs = session.missingSince ? t - Number(session.missingSince || 0) : 0;
    const reset = !session.startedAt
      || (userId !== null && session.userId !== null && String(session.userId) !== String(userId))
      || missingMs > Math.max(1000, Number(cfg.sessionResetMissingMs || 10000));
    if (reset) {
      if (session.startedAt && session.importantSessionId && !session.exitAt) {
        noteImportantSessionExit(userId !== null && session.userId !== null && String(session.userId) !== String(userId) ? 'user-changed' : 'session-reset', bot.lastSelf || selfSummary, session.missingSince || t);
      }
      session.startedAt = t;
      session.userId = userId;
      session.importantSessionId = '';
      session.importantStartEventId = '';
      session.importantEndEventId = '';
      session.exitAt = 0;
      session.exitReason = '';
      session.exitSummary = '';
      session.baseCoins = Number.isFinite(coins) ? coins : 0;
      session.coinsGained = 0;
      session.coinPickupTotal = 0;
      session.coinPickupKeys = [];
      session.kills = 0;
      resetSessionStaminaStats(session, selfSummary, t);
      session.combatLogSentBase = Number(bot.combatLogging?.sent || 0) || 0;
      session.combatLogFailedBase = Number(bot.combatLogging?.failed || 0) || 0;
      startImportantSession(session, selfSummary, t);
    } else if (session.userId === null && userId !== null) {
      session.userId = userId;
    }
    if (!session.importantSessionId) startImportantSession(session, selfSummary, Number(session.startedAt || t) || t);
    session.missingSince = 0;
    session.exitAt = 0;
    session.exitReason = '';
    session.exitSummary = '';
    if (!Number.isFinite(Number(session.baseCoins))) session.baseCoins = Number.isFinite(coins) ? coins : 0;
    if (!Number.isFinite(Number(session.combatLogSentBase))) session.combatLogSentBase = Number(bot.combatLogging?.sent || 0) || 0;
    if (!Number.isFinite(Number(session.combatLogFailedBase))) session.combatLogFailedBase = Number(bot.combatLogging?.failed || 0) || 0;
    if (!Number.isFinite(Number(session.coinPickupTotal))) session.coinPickupTotal = 0;
    if (!Array.isArray(session.coinPickupKeys)) session.coinPickupKeys = [];
    const coinDiff = Math.max(0, Math.round((Number.isFinite(coins) ? coins : 0) - Number(session.baseCoins || 0)));
    session.coinsGained = Math.max(
      Math.max(0, Number(session.coinsGained || 0) || 0),
      Math.max(0, Number(session.coinPickupTotal || 0) || 0),
      coinDiff
    );
    updateSessionStaminaStats(session, selfSummary, t);
    const killCount = bot.killHistory.filter(item => Number(item?.at || 0) >= Number(session.startedAt || 0)).length;
    session.kills = Math.max(Math.max(0, Number(session.kills || 0) || 0), killCount);
    if (typeof writePersistentLastSelfState === 'function') writePersistentLastSelfState(selfSummary, t);
  }

  function summarizeSessionStats(selfSummary) {
    const session = bot.session || {};
    const startedAt = Number(session.startedAt || 0);
    const stoppedAt = Number(session.missingSince || 0) || 0;
    return {
      startedAt,
      uptimeMs: startedAt ? Math.max(0, (stoppedAt || Date.now()) - startedAt) : 0,
      uptimeStoppedAt: stoppedAt,
      baseCoins: Number.isFinite(Number(session.baseCoins)) ? Number(session.baseCoins) : null,
      coins: Number(selfSummary?.coins || 0),
      coinsGained: Math.max(0, Number(session.coinsGained || 0) || 0),
      coinPickupTotal: Math.max(0, Number(session.coinPickupTotal || 0) || 0),
      kills: Math.max(0, Number(session.kills || 0) || 0),
      stamina1dSpentMs: Math.max(0, Math.round(Number(session.stamina1dSpentMs || 0) || 0)),
      stamina1dSegmentStartedAt: Number(session.stamina1dSegmentStartedAt || 0) || 0,
      stamina1dObservedMax: Number.isFinite(Number(session.stamina1dObservedMax)) ? Number(session.stamina1dObservedMax) : null,
      stamina1dObservedMin: Number.isFinite(Number(session.stamina1dObservedMin)) ? Number(session.stamina1dObservedMin) : null,
      stamina1dLastRemaining: Number.isFinite(Number(session.stamina1dLastRemaining)) ? Number(session.stamina1dLastRemaining) : null,
      stamina1dLastLimit: Number.isFinite(Number(session.stamina1dLastLimit)) ? Number(session.stamina1dLastLimit) : null,
      combatLogSent: Math.max(0, Math.round((Number(bot.combatLogging?.sent || 0) || 0) - (Number(session.combatLogSentBase || 0) || 0))),
      combatLogFailed: Math.max(0, Math.round((Number(bot.combatLogging?.failed || 0) || 0) - (Number(session.combatLogFailedBase || 0) || 0))),
      userId: session.userId ?? null
    };
  }

  function readTodaySessionRecords(dayStart) {
    try {
      if (typeof readImportantLogsStore !== 'function') return [];
      const store = readImportantLogsStore();
      const sessions = Array.isArray(store?.sessions) ? store.sessions : [];
      return sessions.filter(record => Number(record?.loginAt || 0) >= dayStart);
    } catch (_) {
      return [];
    }
  }

  function maybeSetLatestTodayStamina(out, record, latestAtRef) {
    const stamp = Math.max(
      Number(record?.updatedAt || 0) || 0,
      Number(record?.exitAt || 0) || 0,
      Number(record?.loginAt || 0) || 0
    );
    if (stamp < latestAtRef.value) return;
    const remaining = Number(record?.stamina1dLastRemaining);
    const limit = Number(record?.stamina1dLastLimit);
    if (!Number.isFinite(remaining)) return;
    out.stamina1dLastRemaining = remaining;
    out.stamina1dLastLimit = Number.isFinite(limit) && limit > 0 ? limit : null;
    latestAtRef.value = stamp;
  }

  function dailyStaminaSpentFromRemaining(out) {
    const remaining = Number(out?.stamina1dLastRemaining);
    const limit = Number(out?.stamina1dLastLimit);
    if (!Number.isFinite(remaining) || !(Number.isFinite(limit) && limit > 0)) return null;
    return Math.max(0, Math.round(limit - remaining));
  }

  function addTodaySessionRecord(out, record, latestAtRef) {
    out.uptimeMs += Math.max(0, Math.round(Number(record?.loginDurationMs || 0) || 0));
    out.stamina1dSpentMs += Math.max(0, Math.round(Number(record?.staminaSpentMs || 0) || 0));
    out.coinsGained += Math.max(0, Math.round(Number(record?.coinsGained || 0) || 0));
    out.coinPickupTotal += Math.max(0, Math.round(Number(record?.pickedCoins || record?.coinPickupTotal || 0) || 0));
    out.kills += Math.max(0, Math.round(Number(record?.killCount || 0) || 0));
    out.sessionCount += 1;
    maybeSetLatestTodayStamina(out, record, latestAtRef);
  }

  function summarizeTodaySessionStats(sessionSummary = null, selfSummary = null, t = Date.now()) {
    const dayStart = dailyStaminaWindowStartAt(t);
    const out = {
      dayStartedAt: dayStart,
      uptimeMs: 0,
      stamina1dSpentMs: 0,
      coinsGained: 0,
      coinPickupTotal: 0,
      kills: 0,
      sessionCount: 0,
      stamina1dLastRemaining: null,
      stamina1dLastLimit: null
    };
    const latestStaminaAt = { value: 0 };
    const currentSessionId = String(bot.session?.importantSessionId || '');
    for (const record of readTodaySessionRecords(dayStart)) {
      if (currentSessionId && String(record?.sessionId || '') === currentSessionId) continue;
      addTodaySessionRecord(out, record, latestStaminaAt);
    }
    const startedAt = Number(sessionSummary?.startedAt || 0) || 0;
    if (startedAt >= dayStart) {
      out.uptimeMs += Math.max(0, Math.round(Number(sessionSummary?.uptimeMs || 0) || 0));
      out.stamina1dSpentMs += Math.max(0, Math.round(Number(sessionSummary?.stamina1dSpentMs || 0) || 0));
      out.coinsGained += Math.max(0, Math.round(Number(sessionSummary?.coinsGained || 0) || 0));
      out.coinPickupTotal += Math.max(0, Math.round(Number(sessionSummary?.coinPickupTotal || 0) || 0));
      out.kills += Math.max(0, Math.round(Number(sessionSummary?.kills || 0) || 0));
      out.sessionCount += 1;
      maybeSetLatestTodayStamina(out, {
        updatedAt: t,
        loginAt: startedAt,
        stamina1dLastRemaining: sessionSummary?.stamina1dLastRemaining,
        stamina1dLastLimit: sessionSummary?.stamina1dLastLimit
      }, latestStaminaAt);
    }
    const selfRemaining = Number(selfSummary?.stamina1d ?? selfSummary?.stamina?.stamina1d);
    const selfLimit = Number(selfSummary?.stamina1dLimit ?? selfSummary?.stamina?.stamina1dLimit);
    if (Number.isFinite(selfRemaining)) {
      out.stamina1dLastRemaining = selfRemaining;
      out.stamina1dLastLimit = Number.isFinite(selfLimit) && selfLimit > 0 ? selfLimit : out.stamina1dLastLimit;
    }
    const actualSpent = dailyStaminaSpentFromRemaining(out);
    if (actualSpent !== null) out.stamina1dSpentMs = Math.max(out.stamina1dSpentMs, actualSpent);
    return out;
  }

  function pushBounded(list, item, max) {
    list.push(item);
    while (list.length > max) list.shift();
  }

  function networkQualityRound(value, digits = 0) {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    const factor = Math.pow(10, Math.max(0, Math.round(Number(digits) || 0)));
    return Math.round(n * factor) / factor;
  }

  function networkQualityEma(previous, sample, alpha = 0.2) {
    const value = Number(sample);
    if (!Number.isFinite(value)) return Number.isFinite(Number(previous)) ? Number(previous) : null;
    const prev = Number(previous);
    if (!Number.isFinite(prev)) return value;
    const a = clamp(Number(alpha) || 0.2, 0.01, 1);
    return prev + (value - prev) * a;
  }

  function ensureNetworkQualityState() {
    if (!bot.networkQuality || typeof bot.networkQuality !== 'object') {
      bot.networkQuality = {
        startedAt: Date.now(),
        frameSamples: [],
        pendingShots: [],
        pendingMovement: null,
        frameCount: 0,
        frameGapCount: 0,
        estimatedLostFrames: 0,
        expectedFrames: 0,
        movementCommandCount: 0,
        movementAckCount: 0,
        movementTimeoutCount: 0,
        attackShotCount: 0,
        attackAckCount: 0,
        attackTimeoutCount: 0,
        lastDiagnosticLogAt: 0,
        lastDiagnosticSignature: ''
      };
    }
    if (!Array.isArray(bot.networkQuality.frameSamples)) bot.networkQuality.frameSamples = [];
    if (!Array.isArray(bot.networkQuality.pendingShots)) bot.networkQuality.pendingShots = [];
    return bot.networkQuality;
  }

  function networkQualityPoint(entity) {
    const x = Number(entity?.x);
    const y = Number(entity?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  }

  function networkQualityDistance(a, b) {
    if (!a || !b) return Infinity;
    return Math.hypot(Number(a.x) - Number(b.x), Number(a.y) - Number(b.y));
  }

  function networkQualityWindowMs() {
    return Math.max(5000, Number(cfg.networkQualityWindowMs || 30000) || 30000);
  }

  function networkQualityBaseFrameMs() {
    const configured = Number(cfg.networkQualityExpectedFrameMs || 0);
    if (Number.isFinite(configured) && configured > 0) return configured;
    return Math.max(40, Number(cfg.combatNativeTickMinMs || cfg.nativeTickMinMs || cfg.tickMs || 120) || 120);
  }

  function networkQualityExpectedFrameMs(q = ensureNetworkQualityState()) {
    const configured = Number(cfg.networkQualityExpectedFrameMs || 0);
    if (Number.isFinite(configured) && configured > 0) return Math.max(20, configured);
    const base = networkQualityBaseFrameMs();
    const minGap = Number(q.frameIntervalMinMs || 0);
    const emaGap = Number(q.frameIntervalEmaMs || 0);
    const learned = Number.isFinite(minGap) && minGap > 0
      ? Math.min(emaGap > 0 ? emaGap : minGap, minGap * 1.35)
      : (emaGap > 0 ? emaGap : base);
    return Math.max(20, Math.min(Math.max(base * 2.5, 250), learned || base));
  }

  function pruneNetworkQualityFrameSamples(q, t = Date.now()) {
    const cutoff = t - networkQualityWindowMs();
    q.frameSamples = (Array.isArray(q.frameSamples) ? q.frameSamples : []).filter(sample => Number(sample.at || 0) >= cutoff);
    let lost = 0;
    let expected = 0;
    let maxGap = 0;
    for (const sample of q.frameSamples) {
      lost += Math.max(0, Number(sample.lost || 0) || 0);
      expected += Math.max(1, Number(sample.expected || 1) || 1);
      maxGap = Math.max(maxGap, Number(sample.gap || 0) || 0);
    }
    q.estimatedLostFrames = lost;
    q.expectedFrames = expected;
    q.lossRate = expected > 0 ? lost / expected : 0;
    q.maxFrameGapMs = maxGap;
  }

  function networkQualityFrameLatencySample(gapMs, expectedMs, lostFrames) {
    const gap = Math.max(0, Number(gapMs) || 0);
    const expected = Math.max(20, Number(expectedMs) || networkQualityBaseFrameMs());
    const excess = Math.max(0, gap - expected);
    const base = Math.min(expected, networkQualityBaseFrameMs());
    const lossPenalty = Math.max(0, Number(lostFrames || 0)) * Math.min(expected, 120);
    return Math.max(0, base + excess + lossPenalty);
  }

  function estimateNetworkQualityLostFrames(gapMs, expectedMs) {
    const gap = Math.max(0, Number(gapMs) || 0);
    const expected = Math.max(20, Number(expectedMs) || networkQualityBaseFrameMs());
    const ratio = Math.max(1.25, Number(cfg.networkQualityFrameLossGapRatio || 2.25) || 2.25);
    const extra = Math.max(0, Number(cfg.networkQualityFrameLossGapMinExtraMs || 180) || 180);
    if (gap < expected * ratio && gap < expected + extra) return 0;
    return Math.max(1, Math.round(gap / expected) - 1);
  }

  function observeNativeWsFrame(source = 'native-ws') {
    if (!cfg.networkQualityEnabled) return null;
    const q = ensureNetworkQualityState();
    const t = Date.now();
    const previousAt = Number(q.lastFrameAt || 0);
    const gap = previousAt ? Math.max(0, t - previousAt) : 0;
    q.lastFrameAt = t;
    q.lastFrameSource = String(source || 'native-ws');
    q.frameCount = Math.max(0, Number(q.frameCount || 0) || 0) + 1;
    if (gap > 0 && gap < 60000) {
      const expectedBefore = networkQualityExpectedFrameMs(q);
      const lost = estimateNetworkQualityLostFrames(gap, expectedBefore);
      q.frameGapCount = Math.max(0, Number(q.frameGapCount || 0) || 0) + 1;
      q.lastFrameGapMs = Math.round(gap);
      q.frameIntervalEmaMs = networkQualityEma(q.frameIntervalEmaMs, gap, 0.18);
      if (gap >= 20 && gap <= Math.max(1000, expectedBefore * 4) && (!q.frameIntervalMinMs || gap < Number(q.frameIntervalMinMs))) {
        q.frameIntervalMinMs = Math.round(gap);
      }
      const expectedAfter = networkQualityExpectedFrameMs(q);
      q.expectedFrameMs = Math.round(expectedAfter);
      q.jitterEmaMs = networkQualityEma(q.jitterEmaMs, Math.abs(gap - expectedAfter), 0.18);
      q.stateLatencyEmaMs = networkQualityEma(q.stateLatencyEmaMs, networkQualityFrameLatencySample(gap, expectedAfter, lost), 0.22);
      q.frameSamples.push({
        at: t,
        gap: Math.round(gap),
        expected: Math.max(1, lost + 1),
        lost
      });
    }
    pruneNetworkQualityFrameSamples(q, t);
    return summarizeNetworkQuality(t);
  }

  function recordNetworkQualityMovementCommand(dx, dy, self = null, detail = {}) {
    if (!cfg.networkQualityEnabled || !(dx || dy)) return null;
    const q = ensureNetworkQualityState();
    const t = Date.now();
    const pending = q.pendingMovement;
    const minMs = Math.max(100, Number(cfg.networkQualityMovementCommandMinMs || 350) || 350);
    if (pending && t - Number(pending.at || 0) < minMs && Number(pending.dx || 0) === Number(dx) && Number(pending.dy || 0) === Number(dy)) {
      return pending;
    }
    const point = networkQualityPoint(self || getSelf());
    if (!point) return null;
    q.movementCommandCount = Math.max(0, Number(q.movementCommandCount || 0) || 0) + 1;
    q.pendingMovement = {
      at: t,
      dx: clamp(Math.round(Number(dx) || 0), -1, 1),
      dy: clamp(Math.round(Number(dy) || 0), -1, 1),
      origin: point,
      source: detail.source || 'velocity'
    };
    return q.pendingMovement;
  }

  function observeNetworkQualitySelf(self) {
    if (!cfg.networkQualityEnabled || !self) return null;
    const q = ensureNetworkQualityState();
    const t = Date.now();
    const point = networkQualityPoint(self);
    const pending = q.pendingMovement;
    if (pending && point && pending.origin) {
      const elapsed = Math.max(0, t - Number(pending.at || t));
      const moved = networkQualityDistance(point, pending.origin);
      const minMove = Math.max(1, Number(cfg.networkQualityMovementAckMinDistance || 40) || 40);
      const timeoutMs = Math.max(1000, Number(cfg.networkQualityActionAckTimeoutMs || 5000) || 5000);
      if (moved >= minMove) {
        q.movementAckCount = Math.max(0, Number(q.movementAckCount || 0) || 0) + 1;
        q.lastMovementAckAt = t;
        q.lastMovementAckMs = Math.round(elapsed);
        q.movementAckEmaMs = networkQualityEma(q.movementAckEmaMs, elapsed, 0.28);
        q.actionLatencyEmaMs = networkQualityEma(q.actionLatencyEmaMs, elapsed, 0.24);
        q.lastActionAckAt = t;
        q.lastActionAckSource = 'movement';
        q.pendingMovement = null;
      } else if (elapsed >= timeoutMs) {
        q.movementTimeoutCount = Math.max(0, Number(q.movementTimeoutCount || 0) || 0) + 1;
        q.lastMovementTimeoutAt = t;
        q.lastMovementTimeoutMs = Math.round(elapsed);
        q.pendingMovement = null;
      }
    }
    return summarizeNetworkQuality(t);
  }

  function networkQualityTargetId(target) {
    const id = target?.id ?? target?.user_id;
    return id === null || id === undefined ? '' : String(id);
  }

  function recordNetworkQualityShot(self, target, detail = {}) {
    if (!cfg.networkQualityEnabled || !target || !detail.sent || detail.blockedByCadence) return;
    const q = ensureNetworkQualityState();
    const targetId = networkQualityTargetId(target);
    if (!targetId) return;
    const t = Number(detail.at || Date.now());
    q.attackShotCount = Math.max(0, Number(q.attackShotCount || 0) || 0) + 1;
    q.pendingShots.push({
      at: t,
      targetId,
      targetName: target.name || target.label || '',
      targetHp: Number.isFinite(Number(target.hp)) ? Number(target.hp) : null,
      distance: Number.isFinite(Number(target.distance)) ? Math.round(Number(target.distance)) : null
    });
    const timeoutMs = Math.max(1000, Number(cfg.networkQualityActionAckTimeoutMs || 5000) || 5000);
    const cutoff = Date.now() - timeoutMs;
    const expired = q.pendingShots.filter(shot => Number(shot.at || 0) < cutoff);
    if (expired.length) q.attackTimeoutCount = Math.max(0, Number(q.attackTimeoutCount || 0) || 0) + expired.length;
    q.pendingShots = q.pendingShots.filter(shot => Number(shot.at || 0) >= cutoff).slice(-20);
  }

  function recordNetworkQualityAttackDamage(target, damageAmount, t = Date.now()) {
    if (!cfg.networkQualityEnabled || !target) return null;
    const q = ensureNetworkQualityState();
    const targetId = networkQualityTargetId(target);
    if (!targetId || !Array.isArray(q.pendingShots) || !q.pendingShots.length) return null;
    const matching = q.pendingShots.filter(shot => String(shot.targetId || '') === targetId && Number(shot.at || 0) <= t);
    if (!matching.length) return null;
    const first = matching[0];
    const last = matching[matching.length - 1];
    const firstDelayMs = Math.max(0, t - Number(first.at || t));
    const lastDelayMs = Math.max(0, t - Number(last.at || t));
    q.attackAckCount = Math.max(0, Number(q.attackAckCount || 0) || 0) + 1;
    q.lastAttackAckAt = t;
    q.lastAttackAckMs = Math.round(lastDelayMs);
    q.lastAttackAckFirstShotMs = Math.round(firstDelayMs);
    q.lastAttackAckShotCount = matching.length;
    q.lastAttackAckDamage = Number.isFinite(Number(damageAmount)) ? networkQualityRound(damageAmount, 2) : null;
    q.attackAckEmaMs = networkQualityEma(q.attackAckEmaMs, lastDelayMs, 0.22);
    q.pendingShots = q.pendingShots.filter(shot => String(shot.targetId || '') !== targetId || Number(shot.at || 0) > t);
    return {
      targetId,
      firstDelayMs: Math.round(firstDelayMs),
      lastDelayMs: Math.round(lastDelayMs),
      shotCount: matching.length
    };
  }

  function summarizeNetworkQuality(t = Date.now()) {
    if (!cfg.networkQualityEnabled) return { enabled: false };
    const q = ensureNetworkQualityState();
    pruneNetworkQualityFrameSamples(q, t);
    const expectedFrameMs = networkQualityExpectedFrameMs(q);
    const frameAgeMs = q.lastFrameAt ? Math.max(0, t - Number(q.lastFrameAt || t)) : null;
    const stallMs = Math.max(
      Number(cfg.networkQualityLogStallMs || 1000) || 1000,
      expectedFrameMs * 4
    );
    const currentStallMs = frameAgeMs !== null && frameAgeMs > expectedFrameMs * 2
      ? Math.max(0, frameAgeMs - expectedFrameMs)
      : 0;
    const projectedLost = currentStallMs > 0
      ? Math.max(0, Math.floor(frameAgeMs / Math.max(20, expectedFrameMs)) - 1)
      : 0;
    const expectedFrames = Math.max(0, Number(q.expectedFrames || 0) || 0) + projectedLost;
    const lostFrames = Math.max(0, Number(q.estimatedLostFrames || 0) || 0) + projectedLost;
    const lossRate = expectedFrames > 0 ? lostFrames / expectedFrames : null;
    const actionFreshMs = Math.max(1000, Number(cfg.networkQualityDisplayActionFreshMs || 30000) || 30000);
    const actionFresh = Boolean(q.lastActionAckAt && t - Number(q.lastActionAckAt || 0) <= actionFreshMs && Number.isFinite(Number(q.actionLatencyEmaMs)));
    const hasFrameLatency = Number.isFinite(Number(q.stateLatencyEmaMs))
      || Number.isFinite(Number(q.frameIntervalEmaMs))
      || Math.max(0, Number(q.frameGapCount || 0) || 0) > 0;
    const frameLatency = hasFrameLatency ? Number(q.stateLatencyEmaMs || q.frameIntervalEmaMs || expectedFrameMs) : null;
    const displayLatency = actionFresh ? Number(q.actionLatencyEmaMs) : frameLatency;
    const movementAttempts = Math.max(0, Number(q.movementCommandCount || 0) || 0);
    const attackAttempts = Math.max(0, Number(q.attackShotCount || 0) || 0);
    const movementTimeoutRate = movementAttempts > 0 ? Math.max(0, Number(q.movementTimeoutCount || 0) || 0) / movementAttempts : 0;
    const attackTimeoutRate = attackAttempts > 0 ? Math.max(0, Number(q.attackTimeoutCount || 0) || 0) / attackAttempts : 0;
    return {
      enabled: true,
      source: 'native-ws-state',
      displayLatencyMs: Number.isFinite(displayLatency) ? Math.max(0, Math.round(displayLatency)) : null,
      latencySource: actionFresh ? String(q.lastActionAckSource || 'action') : 'ws-frame',
      lossPercent: lossRate === null ? null : networkQualityRound(lossRate * 100, 1),
      lossSource: 'ws-frame-gap',
      windowMs: networkQualityWindowMs(),
      sampleCount: Math.max(0, Number(q.frameGapCount || 0) || 0),
      frameCount: Math.max(0, Number(q.frameCount || 0) || 0),
      lastFrameAt: Number(q.lastFrameAt || 0) || 0,
      lastFrameAgeMs: frameAgeMs === null ? null : Math.round(frameAgeMs),
      lastFrameGapMs: Number.isFinite(Number(q.lastFrameGapMs)) ? Math.round(Number(q.lastFrameGapMs)) : null,
      expectedFrameMs: Math.round(expectedFrameMs),
      frameIntervalEmaMs: Number.isFinite(Number(q.frameIntervalEmaMs)) ? Math.round(Number(q.frameIntervalEmaMs)) : null,
      frameIntervalMinMs: Number.isFinite(Number(q.frameIntervalMinMs)) ? Math.round(Number(q.frameIntervalMinMs)) : null,
      jitterEmaMs: Number.isFinite(Number(q.jitterEmaMs)) ? Math.round(Number(q.jitterEmaMs)) : null,
      maxFrameGapMs: Number.isFinite(Number(q.maxFrameGapMs)) ? Math.round(Number(q.maxFrameGapMs)) : null,
      estimatedLostFrames: lostFrames,
      expectedFrames,
      currentStallMs: Math.round(currentStallMs),
      stalled: Boolean(frameAgeMs !== null && frameAgeMs >= stallMs),
      action: {
        movementAckMs: Number.isFinite(Number(q.movementAckEmaMs)) ? Math.round(Number(q.movementAckEmaMs)) : null,
        lastMovementAckMs: Number.isFinite(Number(q.lastMovementAckMs)) ? Math.round(Number(q.lastMovementAckMs)) : null,
        lastMovementAckAgeMs: q.lastMovementAckAt ? Math.max(0, Math.round(t - Number(q.lastMovementAckAt || t))) : null,
        movementCommands: movementAttempts,
        movementAcks: Math.max(0, Number(q.movementAckCount || 0) || 0),
        movementTimeouts: Math.max(0, Number(q.movementTimeoutCount || 0) || 0),
        movementTimeoutPercent: networkQualityRound(movementTimeoutRate * 100, 1),
        attackAckMs: Number.isFinite(Number(q.attackAckEmaMs)) ? Math.round(Number(q.attackAckEmaMs)) : null,
        lastAttackAckMs: Number.isFinite(Number(q.lastAttackAckMs)) ? Math.round(Number(q.lastAttackAckMs)) : null,
        lastAttackAckFirstShotMs: Number.isFinite(Number(q.lastAttackAckFirstShotMs)) ? Math.round(Number(q.lastAttackAckFirstShotMs)) : null,
        lastAttackAckAgeMs: q.lastAttackAckAt ? Math.max(0, Math.round(t - Number(q.lastAttackAckAt || t))) : null,
        attackShots: attackAttempts,
        attackAcks: Math.max(0, Number(q.attackAckCount || 0) || 0),
        attackTimeouts: Math.max(0, Number(q.attackTimeoutCount || 0) || 0),
        attackTimeoutPercent: networkQualityRound(attackTimeoutRate * 100, 1),
        pendingShots: Array.isArray(q.pendingShots) ? q.pendingShots.length : 0
      }
    };
  }

	  async function refreshGlobalState(force = false) {
	    const t = Date.now();
	    if (!force && t - bot.globalState.refreshedAt < cfg.globalRefreshMs) return;
	    bot.globalState.refreshedAt = t;
	    bot.globalState.activeRefreshSkippedAt = t;
	    bot.globalState.minimap = null;
	    bot.globalState.error = '';
	    bot.globalState.samplingOutage = null;
	    const completedAt = Date.now();
	    const refreshDiagnostic = {
	      startedAt: t,
	      completedAt,
	      durationMs: 0,
	      force: Boolean(force),
	      skipped: 'passive-snapshot-only-active-game-api-disabled',
	      snapshot: { ok: false, skipped: true, error: '' },
	      minimap: { ok: false, skipped: true, error: '' },
	      error: bot.globalState.error
	    };
	    recordRuntimeDiagnosticsCore(bot, { lastRefresh: refreshDiagnostic });
	  }

	  function wsSend(message) {
	    if (cfg.dryRun) return true;
	    const native = getNativeControl();
	    if (native) {
	      if (!syncNativeControl(native)) {
	        notePageOwnsReconnect();
	        return false;
	      }
	      try {
	        native.ws.send(message);
	        bot.control.lastMessageAt = Date.now();
	        return true;
	      } catch (err) {
	        bot.control.lastError = 'native send: ' + (err.message || String(err));
	        return false;
	      }
	    }
	    if (!ensureControlWs()) return false;
	    return false;
	  }

	  function setNativeKeys(nativeState, dx, dy) {
	    let updated = false;
	    if (nativeState?.keys && typeof nativeState.keys.add === 'function') {
	      for (const key of ['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright']) {
	        nativeState.keys.delete(key);
	      }
	      if (dx < 0) nativeState.keys.add('a');
	      if (dx > 0) nativeState.keys.add('d');
	      if (dy < 0) nativeState.keys.add('w');
	      if (dy > 0) nativeState.keys.add('s');
	      updated = true;
	    }
	    if (nativeState?.touchMove) {
	      nativeState.touchMove.active = false;
	      nativeState.touchMove.dx = 0;
	      nativeState.touchMove.dy = 0;
	      updated = true;
	    }
	    return updated;
	  }

	  function cancelVelocityStopTimer() {
	    if (bot.velocityStopTimer) {
	      clearTimeout(bot.velocityStopTimer);
	      bot.velocityStopTimer = 0;
	    }
	    cancelDirectVelocityRepeat();
	    bot.velocityPulseToken += 1;
	  }

	  function clearNativeMotionState(nativeState) {
	    if (!nativeState) return false;
	    setNativeKeys(nativeState, 0, 0);
	    const vectorFields = ['currentVel', 'targetVel', 'velocity', 'lastNonZeroVel'];
	    for (const field of vectorFields) {
	      const value = nativeState[field];
	      if (value && typeof value === 'object') {
	        if ('dx' in value) value.dx = 0;
	        if ('dy' in value) value.dy = 0;
	        if ('x' in value) value.x = 0;
	        if ('y' in value) value.y = 0;
	      }
	    }
	    if (nativeState.lastVel && typeof nativeState.lastVel === 'object') {
	      if ('dx' in nativeState.lastVel) nativeState.lastVel.dx = 0;
	      if ('dy' in nativeState.lastVel) nativeState.lastVel.dy = 0;
	      if ('x' in nativeState.lastVel) nativeState.lastVel.x = 0;
	      if ('y' in nativeState.lastVel) nativeState.lastVel.y = 0;
	    } else if (Object.prototype.hasOwnProperty.call(nativeState, 'lastVel')) {
	      nativeState.lastVel = '0 0';
	    }
	    if (nativeState.touchMove) {
	      nativeState.touchMove.active = false;
	      nativeState.touchMove.dx = 0;
	      nativeState.touchMove.dy = 0;
	    }
	    const t = now();
	    if (Object.prototype.hasOwnProperty.call(nativeState, 'lastInputAt')) nativeState.lastInputAt = 0;
	    if (Object.prototype.hasOwnProperty.call(nativeState, 'lastStopAt')) nativeState.lastStopAt = t;
	    return true;
	  }

	  function stopLocalMotionOnly(reason = '') {
	    cancelVelocityStopTimer();
	    const nativeState = getNativeState();
	    if (nativeState) clearNativeMotionState(nativeState);
	    bot.control.lastVelocity = '0 0';
	    bot.control.lastVelocityAt = now();
	    bot.control.nonZeroVelocitySince = 0;
    bot.control.lastNonZeroVelocityAt = 0;
    if (reason !== 'server-position-stalled') resetServerPositionStall(reason || 'local-stop');
    if (reason) bot.control.lastLocalStopReason = reason;
    return true;
  }

	  function stopMotionSafely(reason = '') {
	    const native = getNativeControl();
	    if (native?.wsOpen) {
	      stopLocalMotionOnly(reason);
	      bot.control.lastVelocity = '0 0';
	      bot.control.lastVelocityAt = now();
	      const sent = sendNativeVelocity(0, 0, true);
	      if (sent) scheduleDirectVelocityRepeat(0, 0, true);
	      return Boolean(sent);
	    }
	    return stopLocalMotionOnly(reason);
	  }

	  function stopMotionAfterExit(reason = 'exit-confirmed') {
	    stopMotionSafely(reason);
	    bot.lastExitMotionStopAt = Date.now();
	    bot.lastExitMotionStopReason = reason;
	    clearPostExitTargetState(reason);
	    return true;
	  }

	  function cancelDirectVelocityRepeat() {
	    bot.directVelocityRepeatToken += 1;
	    bot.directVelocityRepeatUntil = 0;
	    bot.directVelocityStopRepeatsLeft = 0;
	    if (bot.directVelocityTimer) {
	      clearTimeout(bot.directVelocityTimer);
	      bot.directVelocityTimer = 0;
	    }
	  }

	  function directWsVelocityMessage(dx, dy) {
	    return 'vel ' + clamp(Math.round(dx), -1, 1) + ' ' + clamp(Math.round(dy), -1, 1);
	  }

	  function sendDirectNativeVelocity(dx, dy, force = false) {
	    if (!cfg.directWsControlEnabled) return false;
	    const native = getNativeControl();
	    if (!native) return false;
	    if (!syncNativeControl(native)) {
	      notePageOwnsReconnect();
	      return false;
	    }
	    if (!cfg.directWsServerMarkerProbe) {
	      setNativeKeys(native.state, dx, dy);
	    }
	    const message = directWsVelocityMessage(dx, dy);
	    const t = now();
	    const dedupeMs = Math.max(0, Math.min(45, Number(cfg.directWsVelocityRepeatMs || 50) - 5));
	    if (!force && message === bot.lastDirectVelocity && t - Number(bot.lastDirectVelocityAt || 0) < dedupeMs) return true;
	    try {
	      native.ws.send(message);
	      if (cfg.directWsServerMarkerProbe) {
	        setNativeKeys(native.state, dx, dy);
	      }
	      bot.lastDirectVelocity = message;
	      bot.lastDirectVelocityAt = t;
	      bot.control.lastMessageAt = Date.now();
	      bot.control.transport = 'native-page-direct-ws';
	      return true;
	    } catch (err) {
	      bot.control.lastError = 'direct native velocity: ' + (err.message || String(err));
	      return false;
	    }
	  }

	  function scheduleDirectVelocityRepeat(dx, dy, force = false) {
	    if (!cfg.directWsControlEnabled || cfg.dryRun) return;
	    const repeatMs = Math.max(20, Number(cfg.directWsVelocityRepeatMs || 50));
	    const holdMs = Math.max(repeatMs, Number(cfg.directWsVelocityRepeatHoldMs || 220));
	    const moving = Boolean(dx || dy);
	    if (!moving) {
	      bot.directVelocityRepeatUntil = 0;
	      bot.directVelocityStopRepeatsLeft = Math.max(0, Math.round(Number(cfg.directWsStopRepeatCount || 0)));
	    } else {
	      bot.directVelocityRepeatUntil = now() + holdMs;
	      bot.directVelocityStopRepeatsLeft = 0;
	    }
	    bot.directVelocityRepeatToken += 1;
	    const token = bot.directVelocityRepeatToken;
	    if (bot.directVelocityTimer) clearTimeout(bot.directVelocityTimer);
	    const run = () => {
	      try {
	        if (bot.directVelocityRepeatToken !== token) return;
	        bot.directVelocityTimer = 0;
	        const keepMoving = moving && now() <= Number(bot.directVelocityRepeatUntil || 0);
	        const keepStopping = !moving && Number(bot.directVelocityStopRepeatsLeft || 0) > 0;
	        if (!keepMoving && !keepStopping) return;
	        if (!moving) bot.directVelocityStopRepeatsLeft = Math.max(0, Number(bot.directVelocityStopRepeatsLeft || 0) - 1);
	        sendDirectNativeVelocity(dx, dy, true);
	        bot.directVelocityTimer = setTimeout(run, repeatMs);
	      } catch (err) {
	        bot.directVelocityTimer = 0;
	        recordUnhandledTickError('direct-velocity-repeat', err);
	      }
	    };
	    bot.directVelocityTimer = setTimeout(run, repeatMs);
	  }

	  function sendNativeVelocity(dx, dy, force = false) {
	    const native = getNativeControl();
	    if (!native) return false;
	    if (sendDirectNativeVelocity(dx, dy, force)) return true;
	    setNativeKeys(native.state, dx, dy);
	    if (!syncNativeControl(native)) {
	      notePageOwnsReconnect();
	      return false;
	    }
	    if (typeof sendVelocity !== 'function') return wsSend('vel ' + dx + ' ' + dy);
	    try {
	      sendVelocity(Boolean(force));
	      bot.control.lastMessageAt = Date.now();
	      return true;
	    } catch (err) {
	      bot.control.lastError = 'native velocity: ' + (err.message || String(err));
	      return false;
	    }
	  }

	  function safeSendVelocity(dx, dy, force = false) {
	    dx = clamp(Math.round(dx), -1, 1);
	    dy = clamp(Math.round(dy), -1, 1);
	    if (cfg.dryRun) return true;
	    const vel = dx + ' ' + dy;
	    const t = now();
	    if (!force && vel === bot.control.lastVelocity && t - bot.control.lastVelocityAt < 100) return true;
	    bot.control.lastVelocity = vel;
	    bot.control.lastVelocityAt = t;
    if (dx || dy) {
      const dt = Date.now();
      if (!bot.control.nonZeroVelocitySince) bot.control.nonZeroVelocitySince = dt;
      bot.control.lastNonZeroVelocityAt = dt;
    } else {
      bot.control.nonZeroVelocitySince = 0;
      bot.control.lastNonZeroVelocityAt = 0;
      if (!bot.serverPositionStall?.stalled || !cfg.serverPositionStallOfflineEnabled) resetServerPositionStall('zero-velocity');
    }
    if (sendNativeVelocity(dx, dy, force)) {
      if (dx || dy) recordNetworkQualityMovementCommand(dx, dy, getSelf(), { source: 'velocity' });
      scheduleDirectVelocityRepeat(dx, dy, force);
      return true;
    }
    cancelDirectVelocityRepeat();
    const sent = wsSend('vel ' + vel);
    if (sent && (dx || dy)) recordNetworkQualityMovementCommand(dx, dy, getSelf(), { source: 'velocity-fallback' });
    return sent;
		  }

	  function sendActionVelocity(action) {
	    const lockRemainingMs = exitMotionStopLockRemainingMs();
	    let dx = clamp(Math.round(Number(action?.dx || 0)), -1, 1);
	    let dy = clamp(Math.round(Number(action?.dy || 0)), -1, 1);
	    if (lockRemainingMs > 0) {
	      dx = 0;
	      dy = 0;
	      if (action && typeof action === 'object') {
	        action.exitMotionBlocked = {
	          reason: bot.lastExitMotionStopReason || 'exit-motion-stopped',
	          remainingMs: lockRemainingMs
	        };
	      }
	    }
	    bot.velocityPulseToken += 1;
	    const token = bot.velocityPulseToken;
	    if (bot.velocityStopTimer) {
	      clearTimeout(bot.velocityStopTimer);
	      bot.velocityStopTimer = 0;
	    }
	    const sent = safeSendVelocity(dx, dy, true);
	    const pulseMs = Number(action?.precisionPulseMs || 0);
	    const canPulse = pulseMs > 0
	      && (dx || dy)
	      && (action?.kind === 'coin' || action?.kind === 'seek-coin');
	    if (canPulse) {
	      const pulseMaxMs = Math.max(110, Number(cfg.precisionPulseMaxMs || 260));
	      bot.velocityStopTimer = setTimeout(() => {
	        try {
	          if (bot.velocityPulseToken !== token) return;
	          bot.velocityStopTimer = 0;
	          stopMotionSafely('precision-pulse');
	        } catch (err) {
	          recordUnhandledTickError('precision-pulse', err);
	        }
	      }, clamp(Math.round(pulseMs), 20, pulseMaxMs));
	    }
	    return sent;
	  }

	  function aimAt(target) {
	    if (!target) return;
	    const x = Math.round(Number(target.x) || 0);
	    const y = Math.round(Number(target.y) || 0);
	    bot.lastAim = { x, y };
	    const nativeState = getNativeState();
	    if (nativeState) {
	      nativeState.pointerWorld = { x, y };
	      nativeState.pointerSeen = true;
	    }
	  }

	  function sendNativeShoot(self, target) {
	    const native = getNativeControl();
	    if (!native) return false;
	    if (!syncNativeControl(native)) {
	      notePageOwnsReconnect();
	      return false;
	    }
	    aimAt(target);
	    if (cfg.directWsControlEnabled && self && target) {
	      const startX = Math.round(Number(self.x) || 0);
	      const startY = Math.round(Number(self.y) || 0);
	      try {
	        native.ws.send('shoot ' + Math.round(Number(target.x) || 0) + ' ' + Math.round(Number(target.y) || 0) + ' ' + startX + ' ' + startY);
	        bot.control.lastMessageAt = Date.now();
	        bot.control.transport = 'native-page-direct-ws';
	        return true;
	      } catch (err) {
	        bot.control.lastError = 'direct native shoot: ' + (err.message || String(err));
	      }
	    }
	    if (typeof shoot !== 'function') return false;
	    try {
	      Promise.resolve(shoot()).catch(err => {
	        bot.control.lastError = 'native shoot: ' + (err.message || String(err));
	      });
	      bot.control.lastMessageAt = Date.now();
	      return true;
	    } catch (err) {
	      bot.control.lastError = 'native shoot: ' + (err.message || String(err));
	      return false;
	    }
	  }

  function recordCombatShotAttempt(self, target, detail = {}) {
    if (!target) return;
    const at = Number(detail.at || Date.now());
    const perfNow = Number(detail.perfNow ?? now());
    const targetDistance = Number.isFinite(Number(target.distance))
      ? Number(target.distance)
      : (self ? dist(self, target) : NaN);
    bot.lastCombatShot = {
      at,
      perfNow: Math.round(perfNow),
      force: Boolean(detail.force),
      shootEveryMs: combatMetricRound(detail.shootEveryMs),
      sent: Boolean(detail.sent),
      blockedByCadence: Boolean(detail.blockedByCadence),
      cadenceRemainingMs: combatMetricRound(detail.cadenceRemainingMs),
      self: self ? {
        id: combatMetricEntityId(self),
        x: combatMetricRound(self.x),
        y: combatMetricRound(self.y),
        hp: combatMetricHp(self)
      } : null,
      target: {
        id: combatMetricEntityId(target),
        name: target.name || target.label || '',
        x: combatMetricRound(target.x),
        y: combatMetricRound(target.y),
        hp: combatMetricHp(target),
        distance: Number.isFinite(targetDistance) ? Math.round(targetDistance) : null
      }
    };
    recordNetworkQualityShot(self, target, { ...detail, at });
  }

  function shootAt(self, target, force = false, options = {}) {
    if (!target) return false;
    const t = now();
    const at = Date.now();
    const shootEveryMs = Math.max(0, Number(options.shootEveryMs ?? cfg.shootEveryMs) || 0);
    const cadenceRemainingMs = Math.max(0, shootEveryMs - (t - Number(bot.lastShotAt || 0)));
    if (!force && cadenceRemainingMs > 0) {
      recordCombatShotAttempt(self, target, {
        at,
        perfNow: t,
        force,
        shootEveryMs,
        sent: false,
        blockedByCadence: true,
        cadenceRemainingMs
      });
      return false;
    }
    bot.lastShotAt = t;
    aimAt(target);
    let sent = sendNativeShoot(self, target);
    const startX = Math.round(Number(self.x) || 0);
    const startY = Math.round(Number(self.y) || 0);
    if (!sent) sent = wsSend('shoot ' + Math.round(target.x) + ' ' + Math.round(target.y) + ' ' + startX + ' ' + startY);
    recordCombatShotAttempt(self, target, {
      at,
      perfNow: t,
      force,
      shootEveryMs,
      sent,
      blockedByCadence: false,
      cadenceRemainingMs: 0
    });
    return sent;
  }

  return {
    pageNativeSnapshotUrl,
    pageNativeSnapshotPayload,
    pageNativeSnapshotError,
    installPageNativeSnapshotObserver,
    getNativeState,
    getNativeControl,
    wsConstant,
    isOfflineishWsReadyState,
    noteNativeReconnectState,
    detachNativeMessagePump,
    triggerNativeTick,
    ensureNativeMessagePump,
    notePageOwnsReconnect,
    syncNativeControl,
    summarizeControl,
    closeControlWs,
    ensureControlWs,
    getSelf,
    getEntities,
    realtimeEntityWorldPoint,
    realtimeEntityKey,
    normalizeRealtimeEntity,
    mergeRealtimeEntity,
    getNativeEntityList,
    listFromNativeCoinValue,
    addNativeCoinSource,
    getNativeCoinSources,
    getNativeCoinList,
    entityIdKey,
    buildNativeEntityMeta,
    snapshotDataAgeMs,
    snapshotDataFreshEnough,
    snapshotBulletFreshEnough,
    snapshotSelfFreshEnough,
    entityFreshEnoughForOffense,
    snapshotEntityAllowed,
    firstFiniteNumber,
    normalizeCoinDrop,
    coinDropKey,
    nativeViewRadiusCm,
    snapshotCoinLocalSuppressRadius,
    snapshotCoinAllowed,
    isSnapshotOnlyCoin,
    snapshotCoinFreshEnough,
    getCoins,
    normalizeBullet,
    getBullets,
    fetchJsonNoStore,
    summarizeSelf,
    entityPoint,
    pointDistance,
    getSnapshotSelf,
    currentVelocityCommandActive,
    summarizeServerPositionStall,
    resetServerPositionStall,
    summarizeActionSettlementStall,
    resetActionSettlementStall,
    actionSettlementNumber,
    actionSettlementEntityHp,
    actionSettlementTarget,
    actionSettlementSample,
    actionSettlementStableNumber,
    actionSettlementSelfProgress,
    actionSettlementTargetProgress,
    assessActionSettlementStall,
    assessServerPositionStall,
    resetSessionStaminaStats,
    updateSessionStaminaStats,
    updateSessionStats,
    summarizeSessionStats,
    readTodaySessionRecords,
    maybeSetLatestTodayStamina,
    dailyStaminaSpentFromRemaining,
    addTodaySessionRecord,
    summarizeTodaySessionStats,
    pushBounded,
    networkQualityRound,
    networkQualityEma,
    ensureNetworkQualityState,
    networkQualityPoint,
    networkQualityDistance,
    networkQualityWindowMs,
    networkQualityBaseFrameMs,
    networkQualityExpectedFrameMs,
    pruneNetworkQualityFrameSamples,
    networkQualityFrameLatencySample,
    estimateNetworkQualityLostFrames,
    observeNativeWsFrame,
    recordNetworkQualityMovementCommand,
    observeNetworkQualitySelf,
    networkQualityTargetId,
    recordNetworkQualityShot,
    recordNetworkQualityAttackDamage,
    summarizeNetworkQuality,
    refreshGlobalState,
    wsSend,
    setNativeKeys,
    cancelVelocityStopTimer,
    clearNativeMotionState,
    stopLocalMotionOnly,
    stopMotionSafely,
    stopMotionAfterExit,
    cancelDirectVelocityRepeat,
    directWsVelocityMessage,
    sendDirectNativeVelocity,
    scheduleDirectVelocityRepeat,
    sendNativeVelocity,
    safeSendVelocity,
    sendActionVelocity,
    aimAt,
    sendNativeShoot,
    recordCombatShotAttempt,
    shootAt
  };
}

module.exports = {
  createNativeStateRuntime
};
