'use strict';

function createPostLoginZoomRuntime(runtime = {}) {
  const {
    bot,
    cfg,
    pageGlobal = typeof window !== 'undefined' ? window : null,
    botKey = '',
    readPageGlobal = () => null,
    getCurrentUserId = () => 0,
    getSessionToken = () => '',
    getNativeState = () => null
  } = runtime;
  const BOT_KEY = botKey;

  			  function isVisible(el) {
      if (!el) return false;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    }

  	  function controlText(el) {
  	    return (el?.innerText || el?.value || el?.getAttribute?.('aria-label') || el?.getAttribute?.('title') || '').trim();
  	  }

    function describeControl(el) {
      if (!el) return '';
      if (el.id) return '#' + el.id;
      const text = controlText(el);
      if (text) return text;
      return String(el.tagName || '').toLowerCase();
    }

    function requestNativeViewportResize(reason = 'bot') {
      try {
        window.dispatchEvent(new Event('resize'));
        bot.lastNativeViewportResizeRequest = {
          at: Date.now(),
          reason: String(reason || 'bot')
        };
        return true;
      } catch (err) {
        bot.lastNativeViewportResizeRequest = {
          at: Date.now(),
          reason: String(reason || 'bot'),
          error: err?.message || String(err)
        };
        return false;
      }
    }

    function findZoomControl(direction = 'out') {
      const out = String(direction || 'out') !== 'in';
      const directSelector = out
        ? '#zoomOutBtn, [data-testid="zoom-out"], [aria-label="zoom out"], [aria-label="Zoom out"]'
        : '#zoomInBtn, [data-testid="zoom-in"], [aria-label="zoom in"], [aria-label="Zoom in"]';
      const direct = document.querySelector(directSelector);
      if (direct) return direct;
      const candidates = Array.from(document.querySelectorAll('button, input[type="button"], [role="button"]'));
      return candidates.find(el => {
        const text = controlText(el);
        return out
          ? /zoom\s*out|缩小|缩放-|地图-|视图-/i.test(text)
          : /zoom\s*in|放大|缩放\+|地图\+|视图\+/i.test(text);
      }) || null;
    }

    function findZoomOutControl() {
      return findZoomControl('out');
    }

    function clickZoomControl(direction = 'out') {
      const out = String(direction || 'out') !== 'in';
      const control = findZoomControl(out ? 'out' : 'in');
      const label = out ? 'zoom-out' : 'zoom-in';
      if (!control) return { clicked: false, error: label + ' control not found', direction: out ? 'out' : 'in' };
      if (control.disabled) return { clicked: false, error: label + ' control disabled', control: describeControl(control), direction: out ? 'out' : 'in' };
      try {
        control.click();
        return { clicked: true, control: describeControl(control), direction: out ? 'out' : 'in' };
      } catch (err) {
        return { clicked: false, error: err?.message || String(err), control: describeControl(control), direction: out ? 'out' : 'in' };
      }
    }

    function clickZoomOutControl() {
      return clickZoomControl('out');
    }

    function postLoginZoomScaleTextRadiusCm() {
      const text = String(document.getElementById('scaleText')?.textContent || '');
      const match = text.match(/r\s*=\s*([0-9]+(?:\.[0-9]+)?)\s*(km|m)\b/i);
      if (!match) return 0;
      const value = Number(match[1]);
      if (!Number.isFinite(value) || value <= 0) return 0;
      return /km/i.test(match[2]) ? value * 100000 : value * 100;
    }

    function postLoginZoomCurrentViewRadiusCm() {
      const nativeState = getNativeState();
      const values = [
        postLoginZoomScaleTextRadiusCm(),
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

    function postLoginZoomTargetRadiusCm() {
      const configured = Number(cfg.postLoginZoomFitRadiusCm || 0);
      if (Number.isFinite(configured) && configured > 0) return configured;
      const nativeAuthority = Number(cfg.nativeCoinAuthoritativeRadius || 0);
      return Number.isFinite(nativeAuthority) && nativeAuthority > 0 ? nativeAuthority : 50000;
    }

    function postLoginZoomFitBounds() {
      const targetRatio = Math.min(0.99, Math.max(0.5, Number(cfg.postLoginZoomFitTargetRatio || 0.98) || 0.98));
      const tolerance = Math.max(0.005, Number(cfg.postLoginZoomFitTolerance || 0.04) || 0.04);
      return {
        targetRatio,
        minRatio: Math.max(0.1, targetRatio - tolerance),
        maxRatio: Math.min(1, targetRatio + tolerance)
      };
    }

    function postLoginZoomViewElements() {
      const world = document.getElementById('world')
        || document.querySelector('.map-shell canvas')
        || document.querySelector('.map-shell');
      const shell = world?.closest?.('.map-shell') || document.querySelector('.map-shell') || world?.parentElement || null;
      if (!world || !shell) return null;
      const worldRect = world.getBoundingClientRect();
      const shellRect = shell.getBoundingClientRect();
      if (!(worldRect.width > 0) || !(worldRect.height > 0) || !(shellRect.width > 0) || !(shellRect.height > 0)) return null;
      return {
        world,
        shell,
        width: shellRect.width,
        height: shellRect.height,
        worldWidth: worldRect.width,
        worldHeight: worldRect.height,
        worldOffsetX: worldRect.left - shellRect.left,
        worldOffsetY: worldRect.top - shellRect.top
      };
    }

    function postLoginZoomProjection(selfSummary, view) {
      if (typeof targetOverlayProjection === 'function') {
        const projection = targetOverlayProjection(selfSummary, view);
        if (projection) return projection;
      }
      const radius = postLoginZoomCurrentViewRadiusCm();
      const shortSide = Math.max(1, Math.min(Number(view?.worldWidth || view?.width || 1), Number(view?.worldHeight || view?.height || 1)));
      const units = Math.max(1, radius || postLoginZoomTargetRadiusCm()) * 2 / shortSide;
      return {
        units,
        cx: Number(view?.worldWidth || view?.width || 0) / 2,
        cy: Number(view?.worldHeight || view?.height || 0) / 2,
        centerX: Number(selfSummary?.x || 0),
        centerY: Number(selfSummary?.y || 0),
        offsetX: Number(view?.worldOffsetX || 0),
        offsetY: Number(view?.worldOffsetY || 0),
        source: 'post-login-fallback'
      };
    }

    function postLoginZoomSelfScreenPoint(selfSummary, view, projection) {
      if (typeof targetOverlayPoint === 'function') {
        const point = targetOverlayPoint(selfSummary, selfSummary, view, projection);
        if (point && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y))) return point;
      }
      return {
        x: (Number(projection?.offsetX) || 0) + Number(projection?.cx || 0),
        y: (Number(projection?.offsetY) || 0) + Number(projection?.cy || 0)
      };
    }

    function postLoginZoomFitMeasurement(selfSummary) {
      const view = postLoginZoomViewElements();
      if (!view) return { ok: false, error: 'map view not found' };
      const projection = postLoginZoomProjection(selfSummary, view);
      const units = Number(projection?.units);
      if (!Number.isFinite(units) || units <= 0) return { ok: false, error: 'view projection unavailable' };
      const center = postLoginZoomSelfScreenPoint(selfSummary, view, projection);
      const centerX = Number(center?.x);
      const centerY = Number(center?.y);
      if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) return { ok: false, error: 'self screen point unavailable' };
      const paddingPx = Math.max(0, Number(cfg.postLoginZoomFitPaddingPx || 0) || 0);
      const availablePx = Math.min(centerX, Number(view.width || 0) - centerX, centerY, Number(view.height || 0) - centerY) - paddingPx;
      if (!(availablePx > 0)) return { ok: false, error: 'no visible room for view circle' };
      const radiusCm = postLoginZoomTargetRadiusCm();
      const circleRadiusPx = radiusCm / units;
      const fitRatio = circleRadiusPx / availablePx;
      const bounds = postLoginZoomFitBounds();
      return {
        ok: true,
        radiusCm: Math.round(radiusCm),
        viewRadiusCm: Math.round(postLoginZoomCurrentViewRadiusCm() || 0),
        units: Number(units.toFixed(2)),
        circleRadiusPx: Math.round(circleRadiusPx),
        availablePx: Math.round(availablePx),
        paddingPx: Math.round(paddingPx),
        centerX: Math.round(centerX),
        centerY: Math.round(centerY),
        width: Math.round(Number(view.width || 0)),
        height: Math.round(Number(view.height || 0)),
        fitRatio: Number(fitRatio.toFixed(3)),
        targetRatio: bounds.targetRatio,
        minRatio: Number(bounds.minRatio.toFixed(3)),
        maxRatio: Number(bounds.maxRatio.toFixed(3)),
        source: projection.source || ''
      };
    }

    function postLoginZoomFitDecision(measure) {
      if (!measure?.ok) return { done: false, direction: 'out', reason: measure?.error || 'unmeasured' };
      const ratio = Number(measure.fitRatio);
      const maxRatio = Number(measure.maxRatio);
      const minRatio = Number(measure.minRatio);
      if (!Number.isFinite(ratio) || !Number.isFinite(maxRatio) || !Number.isFinite(minRatio)) {
        return { done: false, direction: 'out', reason: 'invalid-ratio' };
      }
      if (ratio > maxRatio) return { done: false, direction: 'out', reason: 'circle-clipped' };
      if (ratio < minRatio) return { done: false, direction: 'in', reason: 'visible-range-too-small' };
      return { done: true, direction: '', reason: 'visible-range-fit' };
    }

    function postLoginZoomWheelTarget() {
      const view = postLoginZoomViewElements();
      return view?.world || view?.shell || document.getElementById('world') || document.querySelector('.map-shell') || document.body;
    }

    function dispatchPostLoginZoomWheel(direction = 'out') {
      const target = postLoginZoomWheelTarget();
      if (!target || typeof WheelEvent !== 'function') return { dispatched: false, method: 'wheel', error: 'wheel target unavailable', direction };
      const out = String(direction || 'out') !== 'in';
      const rect = typeof target.getBoundingClientRect === 'function'
        ? target.getBoundingClientRect()
        : { left: 0, top: 0, width: window.innerWidth || 1, height: window.innerHeight || 1 };
      const delta = Math.max(1, Number(cfg.postLoginZoomWheelDeltaY || 35) || 35);
      const event = new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        deltaMode: 0,
        deltaX: 0,
        deltaY: out ? delta : -delta,
        clientX: Number(rect.left || 0) + Math.max(1, Number(rect.width || 1)) / 2,
        clientY: Number(rect.top || 0) + Math.max(1, Number(rect.height || 1)) / 2
      });
      const notCanceled = target.dispatchEvent(event);
      return {
        dispatched: true,
        method: 'wheel',
        direction: out ? 'out' : 'in',
        deltaY: out ? delta : -delta,
        target: describeControl(target),
        defaultPrevented: Boolean(event.defaultPrevented),
        canceled: !notCanceled
      };
    }

    function postLoginZoomStepImproved(before, after, direction) {
      if (!before?.ok || !after?.ok) return false;
      const beforeRatio = Number(before.fitRatio);
      const afterRatio = Number(after.fitRatio);
      if (!Number.isFinite(beforeRatio) || !Number.isFinite(afterRatio)) return false;
      const minimumChange = 0.004;
      if (String(direction || 'out') === 'in') return afterRatio >= beforeRatio + minimumChange;
      return afterRatio <= beforeRatio - minimumChange;
    }

    function finishPostLoginZoomResult(state, status, detail = {}) {
      const latest = state.lastResult || {};
      state.lastResult = {
        ...latest,
        ...detail,
        status,
        finishedAt: Date.now()
      };
      return state.lastResult;
    }

    function currentBotIsInstalled() {
      return readPageGlobal(BOT_KEY, null, pageGlobal) === bot;
    }

    function notePostLoginZoomMeasure(state, measure) {
      const latest = state.lastResult || {};
      const decision = postLoginZoomFitDecision(measure);
      latest.lastMeasure = measure;
      latest.fitRatio = measure?.ok ? measure.fitRatio : (latest.fitRatio ?? null);
      latest.viewRadiusCm = measure?.ok ? measure.viewRadiusCm : (latest.viewRadiusCm ?? null);
      latest.lastDecision = decision;
      state.lastResult = latest;
      return { latest, decision };
    }

    function schedulePostLoginZoomFallbackClicks(state, reason = '', selfSummary = null) {
      const clicks = Math.max(0, Math.round(Number(cfg.postLoginZoomOutClicks || 0)));
      const latest = state.lastResult || {};
      latest.fallbackReason = reason || latest.fallbackReason || '';
      latest.fallbackRequestedClicks = clicks;
      latest.requestedClicks = clicks;
      state.lastResult = latest;
      if (!clicks) return finishPostLoginZoomResult(state, 'failed', { lastError: reason || 'fit measurement unavailable' });
      const intervalMs = Math.max(0, Number(cfg.postLoginZoomOutIntervalMs || 220) || 220);
      const runFallbackClick = (index = 0) => {
        setTimeout(() => {
          if (!currentBotIsInstalled() || !bot.running) return;
          if (selfSummary) {
            requestNativeViewportResize('post-login-zoom-fallback-check-' + (index + 1));
            const before = postLoginZoomFitMeasurement(selfSummary);
            const { decision } = notePostLoginZoomMeasure(state, before);
            if (before?.ok) {
              if (decision.done) {
                finishPostLoginZoomResult(state, 'fit', { lastError: '' });
                return;
              }
              schedulePostLoginZoomFitStep(selfSummary, 0, intervalMs);
              return;
            }
          }
          if (index >= clicks) {
            finishPostLoginZoomResult(state, 'fallback-clicks');
            return;
          }
          requestNativeViewportResize('post-login-zoom-fallback-click-' + (index + 1));
          const result = clickZoomOutControl();
          const current = state.lastResult || {};
          current.completedClicks = Number(current.completedClicks || 0) + (result.clicked ? 1 : 0);
          current.failedClicks = Number(current.failedClicks || 0) + (result.clicked ? 0 : 1);
          current.lastError = result.error || current.lastError || '';
          current.lastAction = result;
          current.control = result.control || current.control || '';
          current.finishedAt = Date.now();
          state.lastResult = current;
          requestNativeViewportResize('post-login-zoom-after-fallback-click-' + (index + 1));
          runFallbackClick(index + 1);
        }, index === 0 ? 0 : intervalMs);
      };
      runFallbackClick(0);
      return state.lastResult;
    }

    function schedulePostLoginZoomFitStep(selfSummary, stepIndex = 0, delayMs = 0) {
      setTimeout(() => {
        if (!currentBotIsInstalled() || !bot.running) return;
        const state = bot.postLoginZoom;
        if (!state?.lastResult) return;
        const maxSteps = Math.max(1, Math.round(Number(cfg.postLoginZoomFitMaxSteps || 40) || 40));
        requestNativeViewportResize('post-login-zoom-fit-step-' + (stepIndex + 1));
        const before = postLoginZoomFitMeasurement(selfSummary);
        const { latest, decision } = notePostLoginZoomMeasure(state, before);
        if (!before?.ok && stepIndex === 0) {
          schedulePostLoginZoomFallbackClicks(state, before?.error || 'fit measurement unavailable', selfSummary);
          return;
        }
        if (decision.done) {
          finishPostLoginZoomResult(state, 'fit', { lastError: '' });
          return;
        }
        if (stepIndex >= maxSteps) {
          finishPostLoginZoomResult(state, 'max-steps', { lastError: 'post-login zoom fit max steps reached' });
          return;
        }
        const action = dispatchPostLoginZoomWheel(decision.direction);
        latest.wheelSteps = Number(latest.wheelSteps || 0) + (action.dispatched ? 1 : 0);
        latest.failedWheelSteps = Number(latest.failedWheelSteps || 0) + (action.dispatched ? 0 : 1);
        latest.lastAction = action;
        latest.lastError = action.error || '';
        state.lastResult = latest;
        const intervalMs = Math.max(0, Number(cfg.postLoginZoomOutIntervalMs || 220) || 220);
        setTimeout(() => {
          if (!currentBotIsInstalled() || !bot.running) return;
          const current = state.lastResult || {};
          const after = postLoginZoomFitMeasurement(selfSummary);
          const afterDecision = postLoginZoomFitDecision(after);
          current.lastMeasure = after;
          current.fitRatio = after?.ok ? after.fitRatio : current.fitRatio;
          current.viewRadiusCm = after?.ok ? after.viewRadiusCm : current.viewRadiusCm;
          current.lastDecision = afterDecision;
          state.lastResult = current;
          if (afterDecision.done) {
            finishPostLoginZoomResult(state, 'fit', { lastError: '' });
            return;
          }
          if (!postLoginZoomStepImproved(before, after, decision.direction)) {
            const fallback = clickZoomControl(decision.direction);
            current.fallbackClicks = Number(current.fallbackClicks || 0) + 1;
            current.completedClicks = Number(current.completedClicks || 0) + (fallback.clicked ? 1 : 0);
            current.failedClicks = Number(current.failedClicks || 0) + (fallback.clicked ? 0 : 1);
            current.lastAction = { ...fallback, method: 'button-fallback' };
            current.lastError = fallback.error || current.lastError || '';
            current.control = fallback.control || current.control || '';
          }
          state.lastResult = current;
          schedulePostLoginZoomFitStep(selfSummary, stepIndex + 1, intervalMs);
        }, intervalMs);
      }, delayMs);
    }

    function postLoginZoomSessionKey(selfSummary) {
      const userId = selfSummary?.user_id ?? getCurrentUserId() ?? '';
      const token = getSessionToken();
      if (token) return String(userId) + ':token:' + String(token).slice(0, 24);
      return String(userId) + ':generation:' + Number(bot.postLoginZoom?.generation || 0);
    }

    function noteSelfUnavailableForPostLoginZoom() {
      const state = bot.postLoginZoom;
      if (!state) return;
      const t = Date.now();
      if (!state.missingSince) state.missingSince = t;
      const missingMs = Math.max(0, t - Number(state.missingSince || t));
      if (missingMs < Math.max(0, Number(cfg.postLoginZoomArmMissingMs || 0))) return;
      if (!state.armed) {
        state.generation = Number(state.generation || 0) + 1;
        state.armed = true;
        state.scheduledKey = '';
      }
    }

    function schedulePostLoginZoomOut(selfSummary) {
      const state = bot.postLoginZoom;
      if (!state) return null;
      const t = Date.now();
      state.lastSeenSelfAt = t;
      state.missingSince = 0;
      const clicks = Math.max(0, Math.round(Number(cfg.postLoginZoomOutClicks || 0)));
      if (!state.armed) return null;
      const key = postLoginZoomSessionKey(selfSummary);
      if (!key || state.appliedKey === key || state.scheduledKey === key) return null;
      state.armed = false;
      state.appliedKey = key;
      state.scheduledKey = key;
      state.scheduledAt = t;
      const fitBounds = postLoginZoomFitBounds();
      state.lastResult = {
        key,
        mode: 'fit-visible-range',
        scheduledAt: t,
        startDelayMs: Math.max(0, Number(cfg.postLoginZoomStartDelayMs || 0) || 0),
        requestedRadiusCm: Math.round(postLoginZoomTargetRadiusCm()),
        targetRatio: fitBounds.targetRatio,
        minRatio: Number(fitBounds.minRatio.toFixed(3)),
        maxRatio: Number(fitBounds.maxRatio.toFixed(3)),
        maxSteps: Math.max(1, Math.round(Number(cfg.postLoginZoomFitMaxSteps || 40) || 40)),
        fallbackRequestedClicks: clicks,
        completedClicks: 0,
        failedClicks: 0,
        wheelSteps: 0,
        failedWheelSteps: 0,
        fallbackClicks: 0,
        lastError: ''
      };
      requestNativeViewportResize('post-login-zoom-schedule');
      setTimeout(() => requestNativeViewportResize('post-login-zoom-before-clicks'), state.lastResult.startDelayMs);
      schedulePostLoginZoomFitStep(selfSummary, 0, state.lastResult.startDelayMs);
      return state.lastResult;
    }

  return {
    isVisible,
    controlText,
    describeControl,
    requestNativeViewportResize,
    findZoomControl,
    findZoomOutControl,
    clickZoomControl,
    clickZoomOutControl,
    postLoginZoomScaleTextRadiusCm,
    postLoginZoomCurrentViewRadiusCm,
    postLoginZoomTargetRadiusCm,
    postLoginZoomFitBounds,
    postLoginZoomViewElements,
    postLoginZoomProjection,
    postLoginZoomSelfScreenPoint,
    postLoginZoomFitMeasurement,
    postLoginZoomFitDecision,
    postLoginZoomWheelTarget,
    dispatchPostLoginZoomWheel,
    postLoginZoomStepImproved,
    finishPostLoginZoomResult,
    currentBotIsInstalled,
    schedulePostLoginZoomFallbackClicks,
    schedulePostLoginZoomFitStep,
    postLoginZoomSessionKey,
    noteSelfUnavailableForPostLoginZoom,
    schedulePostLoginZoomOut
  };
}

module.exports = {
  createPostLoginZoomRuntime
};
