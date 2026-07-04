'use strict';

function targetOverlaySource() {
  return String.raw`
  function removeTargetOverlay() {
    const overlay = document.getElementById(TARGET_OVERLAY_ID);
    if (overlay) overlay.remove();
  }

  function targetOverlaySuppressedAfterExit(decision) {
    if (exitMotionStopLockRemainingMs() > 0) return true;
    if (decision?.exitMotionStopped) return true;
    if (decision?.leave?.exitConfirmed) return true;
    const reason = String(decision?.reason || '');
    return reason === 'leave-success'
      || reason === 'leave-http-403'
      || reason === 'exit-confirmed'
      || reason === 'enemy-leave-wait'
      || reason === 'offline-leave-wait'
      || reason === 'pursuit-leave-wait';
  }

  function targetOverlayStyle(decision) {
    const target = decision?.target || null;
    if (!target) return null;
    if (decision?.combat) return { stroke: 'rgba(248,113,113,.48)' };
    const coinLike = targetOverlayCoinLike(decision, target);
    if (coinLike) return { stroke: 'rgba(250,204,21,.44)' };
    const playerLike = targetOverlayPlayerLike(decision, target);
    if (playerLike) return { stroke: 'rgba(74,222,128,.44)' };
    return null;
  }

  function targetOverlayCoinLike(decision, target = decision?.target || null) {
    const kind = String(decision?.kind || '');
    return Boolean(target && (kind === 'coin' || kind === 'seek-coin'
      || (target.amount !== undefined && target.amount !== null && Number.isFinite(Number(target.amount)))));
  }

  function targetOverlayPlayerLike(decision, target = decision?.target || null) {
    const kind = String(decision?.kind || '');
    return Boolean(target && (decision?.combat
      || kind === 'attack'
      || kind === 'seek-enemy'
      || kind === 'seek-drop'
      || target.name
      || (target.drop !== undefined && target.drop !== null && Number.isFinite(Number(target.drop)))));
  }

  function ensureTargetOverlayCanvas(world, shell) {
    if (!world || !shell || !document.body) return null;
    const worldRect = world.getBoundingClientRect();
    const shellRect = shell.getBoundingClientRect();
    if (!(worldRect.width > 0) || !(worldRect.height > 0) || !(shellRect.width > 0) || !(shellRect.height > 0)) return null;
    let overlay = document.getElementById(TARGET_OVERLAY_ID);
    if (!overlay) {
      overlay = document.createElement('canvas');
      overlay.id = TARGET_OVERLAY_ID;
      overlay.setAttribute('aria-hidden', 'true');
    }
    if (overlay.parentElement !== shell) shell.appendChild(overlay);
    const shellPosition = getComputedStyle(shell).position;
    if (!shellPosition || shellPosition === 'static') shell.style.position = 'relative';
    overlay.style.cssText = [
      'position:absolute',
      'left:0',
      'top:0',
      'width:' + shellRect.width + 'px',
      'height:' + shellRect.height + 'px',
      'z-index:5',
      'pointer-events:none'
    ].join(';');
    const dpr = Math.max(1, Number(window.devicePixelRatio || 1));
    const width = Math.max(1, Math.round(shellRect.width * dpr));
    const height = Math.max(1, Math.round(shellRect.height * dpr));
    if (overlay.width !== width) overlay.width = width;
    if (overlay.height !== height) overlay.height = height;
    return {
      overlay,
      width: shellRect.width,
      height: shellRect.height,
      dpr,
      worldWidth: worldRect.width,
      worldHeight: worldRect.height,
      worldOffsetX: worldRect.left - shellRect.left,
      worldOffsetY: worldRect.top - shellRect.top
    };
  }

  function targetOverlayScaleTextRadiusCm() {
    const text = String(document.getElementById('scaleText')?.textContent || '');
    const match = text.match(/r\s*=\s*([0-9]+(?:\.[0-9]+)?)\s*(km|m)\b/i);
    if (!match) return 0;
    const value = Number(match[1]);
    if (!Number.isFinite(value) || value <= 0) return 0;
    return /km/i.test(match[2]) ? value * 100000 : value * 100;
  }

  function currentViewRadiusCm() {
    const nativeState = getNativeState();
    const values = [
      targetOverlayScaleTextRadiusCm(),
      nativeState?.viewRadiusCm,
      nativeState?.view_radius_cm,
      nativeState?.viewRadius,
      nativeState?.view_radius
    ];
    for (const value of values) {
      const radius = Number(value);
      if (Number.isFinite(radius) && radius > 0) return radius;
    }
    return 10000;
  }

  function targetOverlayPageViewParams() {
    const win = typeof window === 'object' && window ? window : null;
    const fn = typeof viewParams === 'function' ? viewParams : win?.viewParams;
    if (typeof fn !== 'function') return null;
    try {
      const params = fn.call(win);
      const units = Number(params?.units);
      const cx = Number(params?.cx);
      const cy = Number(params?.cy);
      const centerX = Number(params?.centerX);
      const centerY = Number(params?.centerY);
      if ([units, cx, cy, centerX, centerY].every(Number.isFinite) && units > 0) {
        return { units, cx, cy, centerX, centerY, source: 'viewParams' };
      }
    } catch (_) {}
    return null;
  }

  function targetOverlayScreenCenter(canvasWidth, canvasHeight) {
    const width = Math.max(1, Number(canvasWidth) || 1);
    const height = Math.max(1, Number(canvasHeight) || 1);
    let narrow = false;
    try {
      narrow = Boolean(window.matchMedia?.('(max-aspect-ratio: 1/1)')?.matches);
    } catch (_) {
      narrow = width <= height;
    }
    const reservedLeft = narrow ? 0 : Math.min(368, Math.max(0, width - 320));
    return {
      x: reservedLeft + (width - reservedLeft) / 2,
      y: height / 2
    };
  }

  function targetOverlayProjection(self, view) {
    const nativeView = targetOverlayPageViewParams();
    if (nativeView) {
      return {
        ...nativeView,
        offsetX: Number(view?.worldOffsetX) || 0,
        offsetY: Number(view?.worldOffsetY) || 0
      };
    }
    const selfPoint = targetOverlayWorldPoint(self);
    const selfX = Number(selfPoint?.x);
    const selfY = Number(selfPoint?.y);
    if (!Number.isFinite(selfX) || !Number.isFinite(selfY)) return null;
    const canvasWidth = Math.max(1, Number(view?.worldWidth || view?.width) || 1);
    const canvasHeight = Math.max(1, Number(view?.worldHeight || view?.height) || 1);
    const shortSide = Math.max(1, Math.min(canvasWidth, canvasHeight));
    const units = Math.max(1, currentViewRadiusCm()) * 2 / shortSide;
    const center = targetOverlayScreenCenter(canvasWidth, canvasHeight);
    return {
      units,
      cx: center.x,
      cy: center.y,
      centerX: selfX,
      centerY: selfY,
      offsetX: Number(view?.worldOffsetX) || 0,
      offsetY: Number(view?.worldOffsetY) || 0,
      source: 'fallback'
    };
  }

  function targetOverlayPoint(point, self, view, projection = null) {
    const targetPoint = targetOverlayWorldPoint(point);
    const viewProjection = projection || targetOverlayProjection(self, view);
    const x = Number(targetPoint?.x);
    const y = Number(targetPoint?.y);
    const units = Number(viewProjection?.units);
    const cx = Number(viewProjection?.cx);
    const cy = Number(viewProjection?.cy);
    const centerX = Number(viewProjection?.centerX);
    const centerY = Number(viewProjection?.centerY);
    if (![x, y, units, cx, cy, centerX, centerY].every(Number.isFinite) || units <= 0) return null;
    return {
      x: (Number(viewProjection?.offsetX) || 0) + cx + (x - centerX) / units,
      y: (Number(viewProjection?.offsetY) || 0) + cy + (y - centerY) / units
    };
  }

  function targetOverlayWorldPoint(value) {
    if (!value || typeof value !== 'object') return null;
    const point = value.position || value.pos || value.point || value.coord || null;
    const renderX = firstFiniteNumber(value.visual_x, value.visualX, value.render_x, value.renderX);
    const renderY = firstFiniteNumber(value.visual_y, value.visualY, value.render_y, value.renderY);
    const x = firstFiniteNumber(
      renderX,
      value.x,
      value.pos_x,
      value.posX,
      value.world_x,
      value.worldX,
      value.coord_x,
      value.coordX,
      value.center_x,
      value.centerX,
      value.visual_x,
      value.visualX,
      value.render_x,
      value.renderX,
      point?.x
    );
    const y = firstFiniteNumber(
      renderY,
      value.y,
      value.pos_y,
      value.posY,
      value.world_y,
      value.worldY,
      value.coord_y,
      value.coordY,
      value.center_y,
      value.centerY,
      point?.y
    );
    return Number.isFinite(x) && Number.isFinite(y) ? { ...value, x, y } : null;
  }

  function targetOverlayListFromValue(value) {
    if (Array.isArray(value)) return value;
    if (value instanceof Map || value instanceof Set) return Array.from(value.values());
    if (value && typeof value === 'object') {
      if (targetOverlayWorldPoint(value)) return [value];
      const values = Object.values(value);
      if (values.length && values.every(item => item && typeof item === 'object')) return values;
    }
    return [];
  }

  function targetOverlayCallList(label, fn, thisArg = null) {
    if (typeof fn !== 'function') return [];
    try {
      return targetOverlayListFromValue(fn.call(thisArg)).map(item => item && typeof item === 'object' ? { ...item, overlaySource: label } : item);
    } catch (_) {
      return [];
    }
  }

  function targetOverlayRenderEntities() {
    const win = typeof window === 'object' && window ? window : null;
    const nativeState = getNativeState();
    return [
      ...targetOverlayCallList('render', typeof getRenderEntities === 'function' ? getRenderEntities : win?.getRenderEntities, win),
      ...targetOverlayCallList('state.getRenderEntities()', nativeState?.getRenderEntities, nativeState),
      ...targetOverlayListFromValue(nativeState?.renderEntities).map(item => item && typeof item === 'object' ? { ...item, overlaySource: 'state.renderEntities' } : item),
      ...targetOverlayListFromValue(nativeState?.render_entities).map(item => item && typeof item === 'object' ? { ...item, overlaySource: 'state.render_entities' } : item)
    ].filter(Boolean);
  }

  function targetOverlayFindEntity(list, target) {
    if (!Array.isArray(list) || !list.length || !target) return null;
    const targetId = target?.id ?? target?.user_id ?? target?.userId;
    if (targetId !== undefined && targetId !== null && targetId !== '') {
      const exact = list.find(entity => String(entity?.user_id ?? entity?.userId ?? entity?.id ?? '') === String(targetId));
      if (exact) return exact;
    }
    const name = String(target?.name || '');
    if (name) {
      const exactName = list.find(entity => String(entity?.name || '') === name);
      if (exactName) return exactName;
    }
    return null;
  }

  function targetOverlayVisualSelf() {
    const id = getCurrentUserId();
    if (id) {
      const renderSelf = targetOverlayFindEntity(targetOverlayRenderEntities(), { id });
      if (renderSelf) return targetOverlayWorldPoint(renderSelf) || renderSelf;
    }
    const nativeState = getNativeState();
    const visual = targetOverlayWorldPoint(nativeState?.localVisual)
      || targetOverlayWorldPoint(nativeState?.local_visual)
      || targetOverlayWorldPoint(nativeState?.visualSelf)
      || targetOverlayWorldPoint(nativeState?.visual_self);
    if (visual) return visual;
    return getSelf();
  }

  function targetOverlayResolvedCoin(target) {
    const nativeCoins = (getNativeCoinList() || [])
      .map(coin => normalizeCoinDrop(coin, 'native'))
      .filter(Boolean);
    if (!nativeCoins.length) return null;
    const targetId = target?.id ?? target?.drop_id ?? target?.dropId ?? target?.coin_id ?? target?.coinId;
    if (targetId !== undefined && targetId !== null && targetId !== '') {
      const exact = nativeCoins.find(coin => String(coin.drop_id ?? coin.id ?? '') === String(targetId));
      if (exact) return exact;
    }
    const targetX = Number(target?.x);
    const targetY = Number(target?.y);
    if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) return null;
    const targetAmount = Number(target?.amount);
    const maxDistance = 1400;
    return nativeCoins
      .map(coin => ({
        coin,
        distance: dist({ x: targetX, y: targetY }, coin),
        amountMatches: !Number.isFinite(targetAmount) || Math.round(Number(coin.amount || 0)) === Math.round(targetAmount)
      }))
      .filter(item => item.amountMatches && item.distance <= maxDistance)
      .sort((a, b) => a.distance - b.distance)[0]?.coin || null;
  }

  function targetOverlayRoutePoints(decision, target) {
    const route = decision?.coinRoute || target?.coinRoute || null;
    const points = Array.isArray(route?.points) ? route.points : [];
    if (!points.length) return [];
    const targetKey = targetOverlayRoutePointKey(target);
    const firstKey = targetOverlayRoutePointKey(points[0]);
    if (targetKey && firstKey && targetKey !== firstKey) return [];
    const resolved = points
      .map(point => targetOverlayResolvedCoin(point) || point)
      .map(targetOverlayWorldPoint)
      .filter(Boolean);
    if (resolved.length && target) {
      const first = targetOverlayWorldPoint(target);
      if (first) resolved[0] = first;
    }
    return resolved;
  }

  function targetOverlayRoutePointKey(point) {
    const id = point?.id ?? point?.drop_id ?? point?.dropId ?? point?.coin_id ?? point?.coinId;
    if (id !== undefined && id !== null && id !== '') return 'id:' + String(id);
    const x = Number(point?.x);
    const y = Number(point?.y);
    const amount = Number(point?.amount);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return '';
    return 'xy:' + Math.round(x) + ':' + Math.round(y) + ':' + (Number.isFinite(amount) ? Math.round(amount) : '');
  }

  function targetOverlayResolvedEntity(target) {
    const targetId = target?.id ?? target?.user_id ?? target?.userId;
    const name = String(target?.name || '');
    const renderEntity = targetOverlayFindEntity(targetOverlayRenderEntities(), target);
    if (renderEntity) return targetOverlayWorldPoint(renderEntity) || renderEntity;
    const entities = getNativeEntityList() || getEntities() || [];
    if (!Array.isArray(entities) || !entities.length) return null;
    if (targetId !== undefined && targetId !== null && targetId !== '') {
      const exact = entities.find(entity => String(entity.user_id ?? entity.id ?? '') === String(targetId));
      if (exact) return exact;
    }
    if (name) {
      const exactName = entities.find(entity => String(entity.name || '') === name);
      if (exactName) return exactName;
    }
    return null;
  }

  function targetOverlayResolvedTarget(decision) {
    const target = decision?.target || null;
    if (!target) return null;
    if (targetOverlayCoinLike(decision, target)) return targetOverlayResolvedCoin(target) || target;
    if (targetOverlayPlayerLike(decision, target)) return targetOverlayResolvedEntity(target) || target;
    return target;
  }

  function targetOverlayHasAliveSelf() {
    const self = getSelf();
    if (!self) return false;
    try {
      if (typeof isAlive === 'function') return Boolean(isAlive(self));
    } catch (_) {}
    const life = String(self.life ?? self.status ?? '').toLowerCase();
    if (life) return /alive|live|living|存活/.test(life) && !/dead|death|死亡/.test(life);
    const hp = Number(self.hp ?? self.health);
    return Number.isFinite(hp) && hp > 0;
  }

  function targetOverlayStoredLoginPointSafety() {
    try {
      const stored = JSON.parse(localStorage.getItem(LOGIN_POINT_SAFETY_KEY) || 'null');
      return stored && typeof stored === 'object' ? stored : null;
    } catch (_) {
      return null;
    }
  }

  function targetOverlayLoginPointStatus(decision) {
    try {
      if (typeof loginPointSafetyStatus === 'function') {
        const status = loginPointSafetyStatus();
        if (status?.point) return status;
      }
    } catch (_) {}
    const candidates = [
      decision?.login?.snapshotGate?.pointSafety,
      decision?.snapshotGate?.pointSafety,
      decision?.loginSnapshotGate?.pointSafety,
      decision?.reloginGate?.loginPointSafety,
      bot?.lastLoginResult?.snapshotGate?.pointSafety,
      bot?.loginSnapshotGate?.pointSafety,
      bot?.loginPointSafety,
      targetOverlayStoredLoginPointSafety()
    ];
    return candidates.find(item => item?.point) || null;
  }

  function targetOverlayLoginPointRadius(status) {
    const configured = Number(status?.radius);
    if (Number.isFinite(configured) && configured > 0) return configured;
    const lastExitSelfHp = Number(status?.lastExitSelfHp);
    const threshold = Math.max(0, Number(cfg.loginPointSafetyHealthyHpThreshold ?? 80) || 80);
    if (Number.isFinite(lastExitSelfHp) && lastExitSelfHp >= threshold) {
      return Math.max(0, Number(cfg.loginPointSafetyHealthyRadius ?? 17000) || 17000);
    }
    return Math.max(0, Number(cfg.loginPointSafetyRadius ?? 30000) || 30000);
  }

  function targetOverlayLoginPointState(decision) {
    if (targetOverlayHasAliveSelf()) return null;
    const status = targetOverlayLoginPointStatus(decision);
    const point = targetOverlayWorldPoint(status?.point);
    const radius = targetOverlayLoginPointRadius(status);
    if (!point || !(radius > 0)) return null;
    const required = Math.max(0, Number(status?.required ?? cfg.loginPointSafetySuccessRequired ?? 3) || 3);
    const streak = Math.max(0, Number(status?.streak || 0) || 0);
    return {
      ...status,
      point,
      radius,
      required,
      streak,
      satisfied: Boolean(status?.satisfied || (required <= 0 || streak >= required)),
      unsafe: Boolean(status?.lastDanger || status?.lastError)
    };
  }

  function drawLoginPointOverlay(ctx, view, state) {
    if (!ctx || !view || !state?.point) return false;
    const projection = targetOverlayProjection(state.point, view);
    const center = targetOverlayPoint(state.point, state.point, view, projection);
    const units = Number(projection?.units);
    if (!center || !(units > 0)) return false;
    const radiusPx = Math.max(1, Number(state.radius || 0) / units);
    const tone = state.unsafe
      ? { stroke: 'rgba(248,113,113,.62)', fill: 'rgba(248,113,113,.08)', point: 'rgba(248,113,113,.9)' }
      : (state.satisfied
        ? { stroke: 'rgba(74,222,128,.56)', fill: 'rgba(74,222,128,.07)', point: 'rgba(74,222,128,.9)' }
        : { stroke: 'rgba(250,204,21,.58)', fill: 'rgba(250,204,21,.08)', point: 'rgba(250,204,21,.9)' });
    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = tone.stroke;
    ctx.fillStyle = tone.fill;
    ctx.setLineDash([12, 8]);
    ctx.beginPath();
    ctx.arc(center.x, center.y, radiusPx, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = tone.point;
    ctx.fillStyle = tone.point;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(center.x, center.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(center.x - 13, center.y);
    ctx.lineTo(center.x + 13, center.y);
    ctx.moveTo(center.x, center.y - 13);
    ctx.lineTo(center.x, center.y + 13);
    ctx.stroke();
    ctx.restore();
    return true;
  }

  function renderTargetOverlay(decision = bot.lastDecision) {
    try {
      if (bot?.paused || decision?.paused || String(decision?.reason || '') === 'paused') {
        removeTargetOverlay();
        return;
      }
      if (targetOverlaySuppressedAfterExit(decision)) {
        removeTargetOverlay();
        return;
      }
      const style = targetOverlayStyle(decision);
      const target = targetOverlayResolvedTarget(decision);
      const self = targetOverlayVisualSelf() || decision?.self || bot.lastSelf;
      const loginPointOverlay = targetOverlayLoginPointState(decision);
      if (!style || !target || !self) {
        const world = document.getElementById('world');
        const shell = world?.closest?.('.map-shell') || world?.parentElement || null;
        const view = loginPointOverlay ? ensureTargetOverlayCanvas(world, shell) : null;
        const ctx = view?.overlay?.getContext('2d') || document.getElementById(TARGET_OVERLAY_ID)?.getContext('2d') || null;
        if (ctx) {
          if (view) ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
          ctx.clearRect(0, 0, view?.width || ctx.canvas.width, view?.height || ctx.canvas.height);
          if (view && loginPointOverlay) drawLoginPointOverlay(ctx, view, loginPointOverlay);
        }
        return;
      }
      const world = document.getElementById('world');
      const shell = world?.closest?.('.map-shell') || world?.parentElement || null;
      const view = ensureTargetOverlayCanvas(world, shell);
      if (!view) return;
      const ctx = view.overlay.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      ctx.clearRect(0, 0, view.width, view.height);
      if (loginPointOverlay) drawLoginPointOverlay(ctx, view, loginPointOverlay);
      const projection = targetOverlayProjection(self, view);
      const start = targetOverlayPoint(self, self, view, projection);
      const end = targetOverlayPoint(target, self, view, projection);
      if (!start || !end) return;
      const routePoints = targetOverlayRoutePoints(decision, target)
        .map(point => targetOverlayPoint(point, self, view, projection))
        .filter(Boolean);
      ctx.save();
      ctx.strokeStyle = style.stroke;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      if (routePoints.length > 1) {
        for (const point of routePoints) ctx.lineTo(point.x, point.y);
      } else {
        ctx.lineTo(end.x, end.y);
      }
      ctx.stroke();
      if (routePoints.length > 1) {
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(250,204,21,.24)';
        for (const point of routePoints) {
          ctx.beginPath();
          ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }
      ctx.restore();
    } catch (_) {}
  }
`;
}

module.exports = {
  targetOverlaySource
};
