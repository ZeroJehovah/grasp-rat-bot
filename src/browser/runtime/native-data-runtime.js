'use strict';

const { arrayCount } = require('./array-count');

function createNativeDataRuntime(runtime = {}) {
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
    summarizeStamina = () => ({}),
    dropValue = () => 0,
    dist = () => Infinity,
    hypot = Math.hypot,
    isAlive = value => Boolean(value)
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
    const t = Date.now();
    return {
      id: self.user_id,
      name: self.name,
      at: t,
      updatedAt: t,
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

	
  return {
    wsReadyStateNumber,
    isWsConnectingOrOpen,
    pageNativeSnapshotUrl,
    pageNativeSnapshotPayload,
    pageNativeSnapshotError,
    installPageNativeSnapshotObserver,
    getNativeState,
    getNativeControl,
    wsConstant,
    isOfflineishWsReadyState,
    noteNativeReconnectState,
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
    refreshGlobalState
  };
}

module.exports = {
  createNativeDataRuntime
};
