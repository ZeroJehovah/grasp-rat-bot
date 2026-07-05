'use strict';

function createStallDiagnosticsRuntime(runtime = {}) {
  const {
    bot,
    cfg,
    getCurrentUserId = () => 0,
    summarizeStamina = () => ({}),
    dropValue = () => 0,
    isAlive = value => Boolean(value),
    summarizeNetworkQuality = () => ({ enabled: false })
  } = runtime;

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

  return {
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
    assessServerPositionStall
  };
}

module.exports = {
  createStallDiagnosticsRuntime
};
