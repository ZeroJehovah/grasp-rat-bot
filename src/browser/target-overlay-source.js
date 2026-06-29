'use strict';

function targetOverlaySource() {
  return String.raw`
  function removeTargetOverlay() {
    const overlay = document.getElementById(TARGET_OVERLAY_ID);
    if (overlay) overlay.remove();
  }

  function targetOverlaySuppressedAfterExit(decision) {
    if (exitMotionStopActive()) return true;
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
    return { overlay, width: shellRect.width, height: shellRect.height, dpr };
  }

  function currentViewRadiusCm() {
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
    return 10000;
  }

  function targetOverlayPoint(point, self, view) {
    const targetPoint = targetOverlayWorldPoint(point);
    const selfPoint = targetOverlayWorldPoint(self);
    const x = Number(targetPoint?.x);
    const y = Number(targetPoint?.y);
    const selfX = Number(selfPoint?.x);
    const selfY = Number(selfPoint?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(selfX) || !Number.isFinite(selfY)) return null;
    const scale = Math.min(view.width, view.height) / (Math.max(1, currentViewRadiusCm()) * 2);
    return {
      x: view.width / 2 + (x - selfX) * scale,
      y: view.height / 2 + (y - selfY) * scale
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
      if (!style || !target || !self) {
        const existing = document.getElementById(TARGET_OVERLAY_ID);
        if (existing) {
          const ctx = existing.getContext('2d');
          if (ctx) ctx.clearRect(0, 0, existing.width, existing.height);
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
      const start = targetOverlayPoint(self, self, view);
      const end = targetOverlayPoint(target, self, view);
      if (!start || !end) return;
      const routePoints = targetOverlayRoutePoints(decision, target)
        .map(point => targetOverlayPoint(point, self, view))
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
