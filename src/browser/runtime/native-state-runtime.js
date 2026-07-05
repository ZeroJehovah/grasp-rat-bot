'use strict';

const { arrayCount } = require('./array-count');
const { createNativeDataRuntime } = require('./native-data-runtime');
const { createNativeTransportRuntime } = require('./native-transport-runtime');

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

  const {
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
  } = createNativeDataRuntime({
    bot,
    cfg,
    storage: localStorage,
    pageGlobal,
    readPageGlobal,
    installPageGlobal,
    recordRuntimeDiagnostics,
    noteLoginSnapshotProbe,
    noteLeave403SnapshotProbe,
    getCurrentUserId,
    getSessionToken,
    getOwnEntity,
    targetOverlayRenderEntities,
    summarizeStamina,
    dropValue,
    dist,
    hypot,
    isAlive
  });

  const {
    detachNativeMessagePump,
    triggerNativeTick,
    ensureNativeMessagePump,
    notePageOwnsReconnect,
    syncNativeControl,
    summarizeControl,
    closeControlWs,
    ensureControlWs,
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
  } = createNativeTransportRuntime({
    bot,
    cfg,
    getNativeState,
    getNativeControl,
    wsReadyStateNumber,
    wsConstant,
    isWsConnectingOrOpen,
    isOfflineishWsReadyState,
    noteNativeReconnectState,
    getSelf,
    summarizeSelf,
    getCurrentUserId,
    getSessionToken,
    runTickSafely,
    runCallbackSafely,
    recordUnhandledTickError,
    nativeTickMinIntervalMs,
    summarizeServerPositionStall: (...args) => summarizeServerPositionStall(...args),
    summarizeActionSettlementStall: (...args) => summarizeActionSettlementStall(...args),
    resetServerPositionStall: (...args) => resetServerPositionStall(...args),
    summarizeNetworkQuality: (...args) => summarizeNetworkQuality(...args),
    observeNativeWsFrame: (...args) => observeNativeWsFrame(...args),
    recordNetworkQualityMovementCommand: (...args) => recordNetworkQualityMovementCommand(...args),
    recordNetworkQualityShot: (...args) => recordNetworkQualityShot(...args),
    clearPostExitTargetState,
    exitMotionStopLockRemainingMs,
    combatMetricRound,
    combatMetricEntityId,
    combatMetricHp,
    dist,
    now,
    clamp
  });

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
