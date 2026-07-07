'use strict';

function createNativeTransportRuntime(runtime = {}) {
  const {
    bot,
    cfg,
    getNativeState = () => null,
    getNativeControl = () => null,
    wsReadyStateNumber = value => Number(value),
    wsConstant = (_name, fallback) => fallback,
    isWsConnectingOrOpen = () => false,
    isOfflineishWsReadyState = () => false,
    noteNativeReconnectState = () => ({ count: 0, churn: false, windowMs: 0 }),
    getSelf = () => null,
    summarizeSelf = value => value,
    getCurrentUserId = () => 0,
    getSessionToken = () => '',
    runTickSafely = () => {},
    runCallbackSafely = (_label, fn) => (typeof fn === 'function' ? fn : () => {}),
    recordUnhandledTickError = () => {},
    nativeTickMinIntervalMs = () => 0,
    summarizeServerPositionStall = () => null,
    summarizeActionSettlementStall = () => null,
    resetServerPositionStall = () => {},
    resetActionSettlementStall = () => {},
    summarizeNetworkQuality = () => ({ enabled: false }),
    observeNativeWsFrame = () => null,
    recordNetworkQualityMovementCommand = () => null,
    recordNetworkQualityShot = () => null,
    clearPostExitTargetState = () => {},
    exitMotionStopLockRemainingMs = () => 0,
    combatMetricRound = value => {
      const number = Number(value);
      return Number.isFinite(number) ? Math.round(number) : null;
    },
    combatMetricEntityId = entity => entity?.id ?? entity?.user_id ?? null,
    combatMetricHp = entity => {
      const number = Number(entity?.hp);
      return Number.isFinite(number) ? number : null;
    },
    dist = () => Infinity,
    now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
    clamp = (value, min, max) => Math.max(min, Math.min(max, value))
  } = runtime;

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
    const nativeTransportRecovery = summarizeNativeTransportRecovery();
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
      nativeTransportRecovery,
      serverPositionStall,
      actionSettlementStall
	    };
	  }

  function summarizeNativeTransportRecovery(state = bot.nativeTransportRecovery) {
    if (!state) return null;
    const t = Date.now();
    return {
      active: Boolean(state.active),
      waiting: Boolean(state.active && t < Number(state.deadlineAt || 0)),
      reason: state.reason || '',
      startedAt: state.startedAt || 0,
      ageMs: state.startedAt ? Math.max(0, Math.round(t - Number(state.startedAt || 0))) : 0,
      waitRemainingMs: state.deadlineAt ? Math.max(0, Math.round(Number(state.deadlineAt || 0) - t)) : 0,
      cooldownRemainingMs: state.cooldownUntil ? Math.max(0, Math.round(Number(state.cooldownUntil || 0) - t)) : 0,
      closedNativeWs: Boolean(state.closedNativeWs),
      wsReadyState: Number.isFinite(Number(state.wsReadyState)) ? Number(state.wsReadyState) : null,
      recoveredAt: state.recoveredAt || 0,
      failedAt: state.failedAt || 0,
      failureReason: state.failureReason || '',
      error: state.error || ''
    };
  }

  function nativeTransportRecoveryRestored(state, native) {
    if (!state?.active || !native?.wsOpen) return false;
    if (state.ws && native.ws && native.ws !== state.ws) return true;
    const startedAt = Number(state.startedAt || 0);
    return Boolean(
      (bot.control.lastOpenAt && Number(bot.control.lastOpenAt || 0) >= startedAt)
      || (bot.networkQuality?.lastFrameAt && Number(bot.networkQuality.lastFrameAt || 0) >= startedAt)
    );
  }

  function maybeRecoverNativeTransportStall(reason = '', detail = {}) {
    if (!cfg.nativeTransportStallRecoveryEnabled || bot.pendingExit) return null;
    const t = Date.now();
    let state = bot.nativeTransportRecovery || null;
    const native = getNativeControl();
    if (native) syncNativeControl(native);
    if (state?.active) {
      if (nativeTransportRecoveryRestored(state, native)) {
        Object.assign(state, { active: false, recoveredAt: t, failureReason: '', error: '' });
        return null;
      }
      if (t < Number(state.deadlineAt || 0)) return summarizeNativeTransportRecovery(state);
      Object.assign(state, { active: false, failedAt: t, failureReason: 'timeout' });
      bot.control.wsOpen = false;
      bot.control.nativeWsOpen = false;
      bot.control.connecting = false;
      bot.control.lastError = 'native transport reset timeout';
      return null;
    }
    const signal = String(reason || '')
      || (detail?.actionSettlementStall?.stalled ? 'action-settlement-stalled' : '')
      || (detail?.serverPositionStall?.stalled ? (detail.serverPositionStall.reason || 'server-position-stalled') : '');
    if (!signal) return null;
    if (state?.cooldownUntil && t < Number(state.cooldownUntil || 0)) return null;
    if (!native?.ws || !isWsConnectingOrOpen(native.ws.readyState)) return null;
    const waitMs = Math.max(1000, Number(cfg.nativeTransportStallRecoveryWaitMs || 8000) || 8000);
    const cooldownMs = Math.max(waitMs, Number(cfg.nativeTransportStallRecoveryCooldownMs || 60000) || 60000);
    state = {
      active: true,
      reason: signal,
      startedAt: t,
      deadlineAt: t + waitMs,
      cooldownUntil: t + cooldownMs,
      ws: native.ws,
      wsReadyState: native.ws.readyState,
      closedNativeWs: false,
      recoveredAt: 0,
      failedAt: 0,
      failureReason: '',
      error: ''
    };
    bot.nativeTransportRecovery = state;
    stopLocalMotionOnly('native-transport-reset');
    detachNativeMessagePump();
    try {
      if (native.state && typeof native.state === 'object') native.state.wsOpen = false;
      native.ws.close();
      state.closedNativeWs = true;
    } catch (err) {
      state.error = err?.message || String(err);
    }
    bot.control.wsOpen = false;
    bot.control.nativeWsOpen = false;
    bot.control.connecting = false;
    bot.control.lastError = 'native transport reset: ' + signal;
    if (bot.networkQuality && typeof bot.networkQuality === 'object') bot.networkQuality.pendingMovement = null;
    resetServerPositionStall('native-transport-reset');
    resetActionSettlementStall('native-transport-reset');
    return summarizeNativeTransportRecovery(state);
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
    detachNativeMessagePump,
    triggerNativeTick,
    ensureNativeMessagePump,
    notePageOwnsReconnect,
    syncNativeControl,
    summarizeControl,
    closeControlWs,
    ensureControlWs,
    summarizeNativeTransportRecovery,
    maybeRecoverNativeTransportStall,
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
  createNativeTransportRuntime
};
