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
      if (typeof document === 'undefined') return 0;
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
        nativeState?.viewRadiusCm,
        nativeState?.view_radius_cm,
        nativeState?.viewRadius,
        nativeState?.view_radius,
        postLoginZoomScaleTextRadiusCm()
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
      return 50000;
    }

    function postLoginZoomFitBounds() {
      const targetRatio = 1;
      const tolerance = 0;
      return {
        targetRatio,
        minRatio: targetRatio,
        maxRatio: targetRatio
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
      const radiusCm = postLoginZoomTargetRadiusCm();
      const viewRadiusCm = postLoginZoomCurrentViewRadiusCm();
      if (!(viewRadiusCm > 0)) return { ok: false, error: 'view radius unavailable' };
      const fitRatio = viewRadiusCm / radiusCm;
      const bounds = postLoginZoomFitBounds();
      return {
        ok: true,
        radiusCm: Math.round(radiusCm),
        viewRadiusCm: Math.round(viewRadiusCm),
        fitRatio: Number(fitRatio.toFixed(3)),
        targetRatio: bounds.targetRatio,
        minRatio: Number(bounds.minRatio.toFixed(3)),
        maxRatio: Number(bounds.maxRatio.toFixed(3)),
        source: 'view-radius'
      };
    }

    function postLoginZoomFitDecision(measure) {
      if (!measure?.ok) return { done: false, direction: 'out', reason: measure?.error || 'unmeasured' };
      const currentRadiusCm = Number(measure.viewRadiusCm);
      const targetRadiusCm = Number(measure.radiusCm || postLoginZoomTargetRadiusCm());
      if (!Number.isFinite(currentRadiusCm) || currentRadiusCm <= 0 || !Number.isFinite(targetRadiusCm) || targetRadiusCm <= 0) {
        return { done: false, direction: 'out', reason: 'view-radius-unavailable' };
      }
      if (currentRadiusCm < targetRadiusCm) return { done: false, direction: 'out', reason: 'view-radius-below-target' };
      return { done: true, direction: '', reason: 'view-radius-target-reached' };
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

    function postLoginZoomApplyNativeViewRadius(targetRadiusCm = postLoginZoomTargetRadiusCm()) {
      const targetRadius = Math.round(Number(targetRadiusCm || 0));
      if (!Number.isFinite(targetRadius) || targetRadius <= 0) {
        return { applied: false, method: 'setViewRadius', error: 'invalid target radius', targetRadiusCm };
      }
      const directSetter = typeof setViewRadius === 'function' ? setViewRadius : null;
      const globalSetter = readPageGlobal('setViewRadius', null, pageGlobal);
      const setter = typeof directSetter === 'function'
        ? directSetter
        : (typeof globalSetter === 'function' ? globalSetter : null);
      if (!setter) {
        return { applied: false, method: 'setViewRadius', error: 'setViewRadius unavailable', targetRadiusCm: targetRadius };
      }
      const beforeRadius = postLoginZoomCurrentViewRadiusCm();
      try {
        setter.call(pageGlobal || (typeof window !== 'undefined' ? window : null), targetRadius);
        requestNativeViewportResize('post-login-zoom-direct-set');
        const afterRadius = postLoginZoomCurrentViewRadiusCm();
        return {
          applied: true,
          method: 'setViewRadius',
          targetRadiusCm: targetRadius,
          beforeRadiusCm: beforeRadius > 0 ? Math.round(beforeRadius) : null,
          afterRadiusCm: afterRadius > 0 ? Math.round(afterRadius) : null
        };
      } catch (err) {
        return {
          applied: false,
          method: 'setViewRadius',
          error: err?.message || String(err),
          targetRadiusCm: targetRadius,
          beforeRadiusCm: beforeRadius > 0 ? Math.round(beforeRadius) : null
        };
      }
    }

    function postLoginZoomStepImproved(before, after, direction) {
      if (!before?.ok || !after?.ok) return false;
      const beforeRadius = Number(before.viewRadiusCm);
      const afterRadius = Number(after.viewRadiusCm);
      if (!Number.isFinite(beforeRadius) || !Number.isFinite(afterRadius)) return false;
      return afterRadius > beforeRadius;
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

    function schedulePostLoginZoomFallbackClicks(state, reason = '', selfSummary = null, key = '') {
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
          if (key && state.lastResult?.key !== key) return;
          if (selfSummary) {
            requestNativeViewportResize('post-login-zoom-fallback-check-' + (index + 1));
            const before = postLoginZoomFitMeasurement(selfSummary);
            const { decision } = notePostLoginZoomMeasure(state, before);
            if (before?.ok) {
              if (decision.done) {
                finishPostLoginZoomResult(state, 'fit', { lastError: '' });
                return;
              }
              schedulePostLoginZoomFitStep(selfSummary, 0, intervalMs, key);
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

    function schedulePostLoginZoomFitStep(selfSummary, stepIndex = 0, delayMs = 0, key = '') {
      setTimeout(() => {
        if (!currentBotIsInstalled() || !bot.running) return;
        const state = bot.postLoginZoom;
        if (!state?.lastResult) return;
        if (key && state.lastResult.key !== key) return;
        const maxSteps = Math.max(1, Math.round(Number(cfg.postLoginZoomFitMaxSteps || 24) || 24));
        const configuredMaxOutSteps = Number(cfg.postLoginZoomFitMaxOutSteps ?? 24);
        const maxOutSteps = Math.max(0, Math.round(Number.isFinite(configuredMaxOutSteps) ? configuredMaxOutSteps : 24));
        requestNativeViewportResize('post-login-zoom-fit-step-' + (stepIndex + 1));
        const before = postLoginZoomFitMeasurement(selfSummary);
        const { latest, decision } = notePostLoginZoomMeasure(state, before);
        if (!before?.ok && stepIndex === 0) {
          schedulePostLoginZoomFallbackClicks(state, before?.error || 'fit measurement unavailable', selfSummary, key);
          return;
        }
        if (decision.done) {
          finishPostLoginZoomResult(state, 'fit', { lastError: '' });
          return;
        }
        if (stepIndex === 0 && cfg.postLoginZoomDirectSetEnabled !== false) {
          const directAction = postLoginZoomApplyNativeViewRadius(postLoginZoomTargetRadiusCm());
          latest.directSetAttempted = true;
          latest.directSetApplied = Boolean(directAction.applied);
          latest.lastAction = directAction;
          latest.lastError = directAction.error || '';
          state.lastResult = latest;
          const directMeasure = postLoginZoomFitMeasurement(selfSummary);
          const directDecision = postLoginZoomFitDecision(directMeasure);
          latest.lastMeasure = directMeasure;
          latest.fitRatio = directMeasure?.ok ? directMeasure.fitRatio : latest.fitRatio;
          latest.viewRadiusCm = directMeasure?.ok ? directMeasure.viewRadiusCm : latest.viewRadiusCm;
          latest.lastDecision = directDecision;
          state.lastResult = latest;
          if (directDecision.done) {
            finishPostLoginZoomResult(state, 'fit', { lastError: '' });
            return;
          }
          if (directAction.applied) {
            const settleMs = Math.max(0, Number(cfg.postLoginZoomDirectSettleMs || 60) || 60);
            schedulePostLoginZoomFitStep(selfSummary, stepIndex + 1, settleMs, key);
            return;
          }
        }
        if (stepIndex >= maxSteps) {
          finishPostLoginZoomResult(state, 'max-steps', { lastError: 'post-login zoom fit max steps reached' });
          return;
        }
        const outSteps = Number(latest.outWheelSteps || 0);
        if (outSteps >= maxOutSteps) {
          finishPostLoginZoomResult(state, 'out-step-cap', { lastError: 'post-login zoom out step cap reached' });
          return;
        }
        const action = dispatchPostLoginZoomWheel('out');
        latest.wheelSteps = Number(latest.wheelSteps || 0) + (action.dispatched ? 1 : 0);
        if (action.dispatched) latest.outWheelSteps = outSteps + 1;
        latest.failedWheelSteps = Number(latest.failedWheelSteps || 0) + (action.dispatched ? 0 : 1);
        latest.lastAction = action;
        latest.lastError = action.error || '';
        state.lastResult = latest;
        const intervalMs = Math.max(0, Number(cfg.postLoginZoomOutIntervalMs || 220) || 220);
        setTimeout(() => {
          if (!currentBotIsInstalled() || !bot.running) return;
          if (key && state.lastResult?.key !== key) return;
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
          state.lastResult = current;
          schedulePostLoginZoomFitStep(selfSummary, stepIndex + 1, intervalMs, key);
        }, intervalMs);
      }, delayMs);
    }

    function postLoginZoomSessionKey(selfSummary) {
      const userId = selfSummary?.user_id ?? getCurrentUserId() ?? '';
      const token = getSessionToken();
      if (token) return String(userId) + ':token:' + String(token).slice(0, 24);
      return String(userId) + ':no-token';
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
        mode: 'view-radius-direct-set-with-wheel-fallback',
        scheduledAt: t,
        startDelayMs: Math.max(0, Number(cfg.postLoginZoomStartDelayMs || 0) || 0),
        requestedRadiusCm: Math.round(postLoginZoomTargetRadiusCm()),
        targetRatio: fitBounds.targetRatio,
        minRatio: Number(fitBounds.minRatio.toFixed(3)),
        maxRatio: Number(fitBounds.maxRatio.toFixed(3)),
        maxSteps: Math.max(1, Math.round(Number(cfg.postLoginZoomFitMaxSteps || 24) || 24)),
        maxOutSteps: Math.max(0, Math.round(Number.isFinite(Number(cfg.postLoginZoomFitMaxOutSteps ?? 24)) ? Number(cfg.postLoginZoomFitMaxOutSteps ?? 24) : 24)),
        maxInSteps: 0,
        fallbackRequestedClicks: clicks,
        completedClicks: 0,
        failedClicks: 0,
        wheelSteps: 0,
        outWheelSteps: 0,
        inWheelSteps: 0,
        failedWheelSteps: 0,
        directSetAttempted: false,
        directSetApplied: false,
        fallbackClicks: 0,
        lastError: ''
      };
      requestNativeViewportResize('post-login-zoom-schedule');
      setTimeout(() => requestNativeViewportResize('post-login-zoom-before-clicks'), state.lastResult.startDelayMs);
      schedulePostLoginZoomFitStep(selfSummary, 0, state.lastResult.startDelayMs, key);
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
    postLoginZoomApplyNativeViewRadius,
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
