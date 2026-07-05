'use strict';

const { safeJsonClone } = require('./runtime-utils');
const { arrayCount } = require('./array-count');
const { combatLogExitSummaryFromDecision } = require('./exit-summary');
const {
  clearOfflineReloginHoldBoundCore: clearOfflineReloginHoldForCombatLogBoundCore,
  enemyReloginHoldRemainingMsBoundCore: enemyReloginHoldRemainingMsForCombatLogBoundCore,
  offlineReloginHoldRemainingMsBoundCore: offlineReloginHoldRemainingMsForCombatLogBoundCore
} = require('./exit-relogin');

function createCombatLogFrameRuntime(runtime = {}) {
  const {
    bot,
    cfg,
    storage = typeof localStorage !== 'undefined' ? localStorage : null,
    combatLogPendingEntriesKey,
    exitAuditPendingLogsKey,
    loginSuppressKey,
    loginSuppressReasonKey,
    enemyLeaveStateKey,
    offlineLeaveStateKey,
    pendingExitStateKey,
    now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
    readPersistentExitState = () => null,
    writePersistentPendingExitStateCore = () => null,
    pendingExitPersistenceCoreHelpers = () => ({}),
    clearPersistentPendingExitState = () => {},
    clearPersistentExitState = () => {},
    normalizePendingExitReloadConfirmationCore = value => value,
    staleOfflineStaminaHoldContradicted = () => false,
    readImportantLogsStore = () => ({ events: [] }),
    restoreImportantLogsForRemote = () => 0,
    markImportantLogsRemoteSent = () => {},
    markImportantLogsRemoteError = () => {},
    noteImportantSessionExit = () => null,
    getCurrentUserId = () => null,
    summarizeSelf = value => value,
    dropValue = () => 0,
    dist = () => NaN,
    speed = () => 0,
    hypot = Math.hypot,
    knownHpValue = () => null,
    isCurrentlyActive = () => false,
    isMovingThreat = () => false,
    isFiringEntity = () => false,
    isInvulnerable = () => false,
    getNativeEntityList = () => [],
    normalizeBullet = value => value,
    getBullets = () => [],
    summarizeServerPositionStall = () => null,
    combatTickActiveFromState = () => false,
    summarizeNetworkQuality = () => null,
    getSelf = () => null,
    incomingBulletThreat = () => null,
    summarizePendingCombatLeave = () => null,
    summarizePursuit = value => value,
    summarizeControl = () => null,
    snapshotLoginGateStatus = () => null,
    recordRuntimeDiagnostics = () => {}
  } = runtime;
  const localStorage = storage;
  const LOGIN_SUPPRESS_KEY = loginSuppressKey;
  const LOGIN_SUPPRESS_REASON_KEY = loginSuppressReasonKey;
  const ENEMY_LEAVE_STATE_KEY = enemyLeaveStateKey;
  const OFFLINE_LEAVE_STATE_KEY = offlineLeaveStateKey;
  const PENDING_EXIT_STATE_KEY = pendingExitStateKey;
  const recordRuntimeDiagnosticsCore = (_bot, detail) => recordRuntimeDiagnostics(detail);

      function combatLogSelfSummary(selfLike) {
        if (!selfLike) return null;
        if (selfLike.stamina || Object.prototype.hasOwnProperty.call(selfLike, 'coins')) {
          const clone = safeJsonClone(selfLike);
          if (clone) return clone;
        }
        try {
          return summarizeSelf(selfLike);
        } catch (_) {
          return {
            id: selfLike.user_id ?? selfLike.id ?? null,
            name: selfLike.name || '',
            x: Math.round(Number(selfLike.x) || 0),
            y: Math.round(Number(selfLike.y) || 0),
            hp: selfLike.hp ?? null,
            drop: Number(selfLike.drop ?? dropValue(selfLike) ?? 0) || 0,
            life: selfLike.life || '',
            mode: selfLike.current_join_mode || selfLike.mode || ''
          };
        }
      }

      function combatEntitySummary(entity, selfLike = null) {
        if (!entity) return null;
        const distance = Number.isFinite(Number(entity.distance))
          ? Number(entity.distance)
          : (selfLike && Number.isFinite(Number(selfLike.x)) && Number.isFinite(Number(selfLike.y)) ? dist(selfLike, entity) : NaN);
        return {
          id: entity.user_id ?? entity.id ?? null,
          name: entity.name || '',
          x: Math.round(Number(entity.x) || 0),
          y: Math.round(Number(entity.y) || 0),
          vx: Math.round(Number(entity.vx) || 0),
          vy: Math.round(Number(entity.vy) || 0),
          speed: Math.round(speed(entity)),
          distance: Number.isFinite(distance) ? Math.round(distance) : null,
          hp: Number.isFinite(Number(entity.hp)) ? Number(entity.hp) : null,
          knownHp: knownHpValue(entity),
          maxHp: Number(entity.max_hp ?? entity.maxHp ?? 0) || null,
          drop: Number(entity.drop ?? dropValue(entity) ?? 0) || 0,
          mode: entity.current_join_mode || entity.mode || '',
          life: entity.life || '',
          active: isCurrentlyActive(entity),
          moving: isMovingThreat(entity),
          firing: isFiringEntity(entity),
          invulnerable: isInvulnerable(entity),
          native: Boolean(entity.native),
          render: Boolean(entity.render || entity.nativeRender),
          realtime: Boolean(entity.realtime || entity.native || entity.render || entity.nativeRender),
          snapshot: Boolean(entity.snapshot),
          combatIntent: entity.combatIntent || '',
          recentlyMoved: Boolean(entity.recentlyMoved)
        };
      }

      function mergeCombatEntitySource(previous, entity) {
        if (!previous) return entity;
        const previousRealtime = Boolean(previous.native || previous.render || previous.realtime);
        const incomingSnapshotOnly = Boolean(entity.snapshot && !entity.native && !entity.render && !entity.realtime);
        if (previousRealtime && incomingSnapshotOnly) {
          return {
            ...entity,
            ...previous,
            snapshot: true,
            native: Boolean(previous.native),
            render: Boolean(previous.render),
            realtime: true,
            hp: previous.hp ?? entity.hp,
            knownHp: previous.knownHp ?? entity.knownHp,
            max_hp: previous.max_hp ?? entity.max_hp,
            maxHp: previous.maxHp ?? entity.maxHp,
            death_reward_preview: previous.death_reward_preview ?? entity.death_reward_preview,
            death_drop_coins: previous.death_drop_coins ?? entity.death_drop_coins,
            drop: previous.drop ?? entity.drop
          };
        }
        return {
          ...previous,
          ...entity,
          native: Boolean(previous.native || entity.native),
          render: Boolean(previous.render || entity.render || entity.nativeRender),
          realtime: Boolean(previous.realtime || entity.realtime || previous.native || entity.native || previous.render || entity.render || entity.nativeRender),
          snapshot: Boolean(previous.snapshot || entity.snapshot)
        };
      }

      function combatEntitySourceList() {
        const byId = new Map();
        const add = entity => {
          if (!entity || typeof entity !== 'object') return;
          const id = entity.user_id ?? entity.id;
          const key = id === undefined || id === null || id === ''
            ? 'xy:' + Math.round(Number(entity.x) || 0) + ':' + Math.round(Number(entity.y) || 0)
            : 'id:' + id;
          byId.set(key, mergeCombatEntitySource(byId.get(key), entity));
        };
        if (Array.isArray(bot.lastActionEntities)) {
          for (const entity of bot.lastActionEntities) add(entity);
        }
        let nativeEntities = [];
        try {
          nativeEntities = getNativeEntityList();
        } catch (_) {
          nativeEntities = [];
        }
        if (Array.isArray(nativeEntities)) {
          for (const entity of nativeEntities) add({ ...entity, native: true });
        }
        if (Array.isArray(bot.globalState.entities)) {
          for (const entity of bot.globalState.entities) add({ ...entity, snapshot: true });
        }
        return Array.from(byId.values());
      }

      function summarizeCombatEntities(selfLike, decision) {
        const limit = Math.max(1, Number(cfg.combatLogMaxEntityEntries) || 12);
        const targetId = decision?.target?.id ?? decision?.target?.user_id ?? null;
        return combatEntitySourceList()
          .filter(entity => {
            const id = entity.user_id ?? entity.id;
            const selfId = selfLike?.user_id ?? selfLike?.id;
            return id === undefined || id === null || String(id) !== String(selfId);
          })
          .map(entity => combatEntitySummary(entity, selfLike))
          .filter(Boolean)
          .sort((a, b) => {
            const aTarget = targetId !== null && targetId !== undefined && String(a.id) === String(targetId);
            const bTarget = targetId !== null && targetId !== undefined && String(b.id) === String(targetId);
            if (aTarget !== bTarget) return aTarget ? -1 : 1;
            if (a.active !== b.active) return a.active ? -1 : 1;
            const ad = Number.isFinite(Number(a.distance)) ? Number(a.distance) : Infinity;
            const bd = Number.isFinite(Number(b.distance)) ? Number(b.distance) : Infinity;
            return ad - bd;
          })
          .slice(0, limit);
      }

      function combatBulletSummary(raw, selfLike = null) {
        const bullet = normalizeBullet(raw, raw?.native ? 'native' : 'snapshot');
        if (!bullet) return null;
        const speedValue = hypot(Number(bullet.vx) || 0, Number(bullet.vy) || 0);
        let distance = NaN;
        let projection = null;
        let laneDistance = null;
        let signedLaneDistance = null;
        let timeToImpactMs = null;
        if (selfLike && Number.isFinite(Number(selfLike.x)) && Number.isFinite(Number(selfLike.y))) {
          const toSelfX = Number(selfLike.x) - Number(bullet.x);
          const toSelfY = Number(selfLike.y) - Number(bullet.y);
          distance = hypot(toSelfX, toSelfY);
          if (speedValue > 0.01) {
            projection = (toSelfX * bullet.vx + toSelfY * bullet.vy) / speedValue;
            signedLaneDistance = (toSelfX * bullet.vy - toSelfY * bullet.vx) / speedValue;
            laneDistance = Math.abs(signedLaneDistance);
            timeToImpactMs = projection > 0 ? projection / speedValue * 50 : null;
          }
        }
        return {
          id: bullet.id,
          ownerId: bullet.ownerId,
          x: Math.round(Number(bullet.x) || 0),
          y: Math.round(Number(bullet.y) || 0),
          vx: Math.round(Number(bullet.vx) || 0),
          vy: Math.round(Number(bullet.vy) || 0),
          speedPerTick: Math.round(Number(bullet.speedPerTick || speedValue || 0)),
          distance: Number.isFinite(distance) ? Math.round(distance) : null,
          projection: Number.isFinite(Number(projection)) ? Math.round(Number(projection)) : null,
          laneDistance: Number.isFinite(Number(laneDistance)) ? Math.round(Number(laneDistance)) : null,
          signedLaneDistance: Number.isFinite(Number(signedLaneDistance)) ? Math.round(Number(signedLaneDistance)) : null,
          timeToImpactMs: Number.isFinite(Number(timeToImpactMs)) ? Math.round(Number(timeToImpactMs)) : null,
          createdTick: bullet.createdTick,
          expireTick: bullet.expireTick,
          native: Boolean(bullet.native),
          snapshot: Boolean(bullet.snapshot)
        };
      }

      function summarizeCombatBullets(selfLike) {
        const limit = Math.max(1, Number(cfg.combatLogMaxBulletEntries) || 24);
        let bullets = [];
        try {
          bullets = getBullets();
        } catch (_) {
          bullets = Array.isArray(bot.globalState.bullets) ? bot.globalState.bullets : [];
        }
        return (bullets || [])
          .map(bullet => combatBulletSummary(bullet, selfLike))
          .filter(Boolean)
          .sort((a, b) => {
            const aThreat = Number.isFinite(Number(a.projection)) && Number(a.projection) > 0 && Number.isFinite(Number(a.laneDistance));
            const bThreat = Number.isFinite(Number(b.projection)) && Number(b.projection) > 0 && Number.isFinite(Number(b.laneDistance));
            if (aThreat !== bThreat) return aThreat ? -1 : 1;
            if (aThreat && bThreat && a.laneDistance !== b.laneDistance) return a.laneDistance - b.laneDistance;
            const ad = Number.isFinite(Number(a.distance)) ? Number(a.distance) : Infinity;
            const bd = Number.isFinite(Number(b.distance)) ? Number(b.distance) : Infinity;
            return ad - bd;
          })
          .slice(0, limit);
      }

      function combatMetricNumber(value) {
        if (value === null || value === undefined || value === '') return null;
        const num = Number(value);
        return Number.isFinite(num) ? num : null;
      }

      function combatMetricRound(value) {
        const num = combatMetricNumber(value);
        return num === null ? null : Math.round(num);
      }

      function combatMetricDelta(current, previous) {
        const curr = combatMetricNumber(current);
        const prev = combatMetricNumber(previous);
        if (curr === null || prev === null) return null;
        return Math.round((curr - prev) * 100) / 100;
      }

      function combatMetricEntityId(entity) {
        const id = entity?.id ?? entity?.user_id ?? entity?.targetId;
        return id === undefined || id === null || id === '' ? null : id;
      }

      function combatMetricHp(entity, fallback = null) {
        const values = [
          entity?.hp,
          entity?.knownHp,
          entity?.displayHp,
          entity?.selfHp,
          entity?.targetHp,
          fallback
        ];
        for (const value of values) {
          const num = combatMetricNumber(value);
          if (num !== null) return num;
        }
        return null;
      }

      function combatMetricPoint(entity, fallbackHp = null) {
        if (!entity || typeof entity !== 'object') return null;
        const x = combatMetricNumber(entity.x);
        const y = combatMetricNumber(entity.y);
        const hp = combatMetricHp(entity, fallbackHp);
        const distance = combatMetricNumber(entity.distance);
        const id = combatMetricEntityId(entity);
        if (id === null && x === null && y === null && hp === null && distance === null) return null;
        return {
          id,
          name: entity.name || entity.label || '',
          x: x === null ? null : Math.round(x),
          y: y === null ? null : Math.round(y),
          hp,
          distance: distance === null ? null : Math.round(distance)
        };
      }

      function combatMetricDistance(a, b) {
        if (!a || !b) return null;
        const ax = combatMetricNumber(a.x);
        const ay = combatMetricNumber(a.y);
        const bx = combatMetricNumber(b.x);
        const by = combatMetricNumber(b.y);
        if (ax === null || ay === null || bx === null || by === null) return null;
        return Math.round(Math.hypot(ax - bx, ay - by));
      }

      function combatMetricTarget(decision, nearbyEntities) {
        const target = decision?.target || decision?.combatState?.target || null;
        const targetId = combatMetricEntityId(target);
        const targetName = target?.name || target?.label || '';
        let live = null;
        if (Array.isArray(nearbyEntities)) {
          live = nearbyEntities.find(entity => {
            const id = combatMetricEntityId(entity);
            return targetId !== null && id !== null && String(id) === String(targetId);
          }) || null;
          if (!live && targetName) {
            live = nearbyEntities.find(entity => String(entity?.name || entity?.label || '') === String(targetName)) || null;
          }
        }
        const fallbackHp = combatMetricNumber(decision?.combatState?.targetHp ?? decision?.targetHp ?? null);
        if (live && target) return { ...target, ...live, hp: live.hp ?? live.knownHp ?? target.hp ?? target.knownHp ?? fallbackHp };
        if (live) return { ...live, hp: live.hp ?? live.knownHp ?? fallbackHp };
        if (target) return { ...target, hp: target.hp ?? target.knownHp ?? fallbackHp };
        return null;
      }

      function combatMetricBulletStats(bullets) {
        const laneLimit = Math.max(
          Number(cfg.combatBulletLaneRadius || 0) || 0,
          (Number(cfg.combatBulletHitRadiusCm || 0) || 0) + 500
        );
        let nativeBulletCount = 0;
        let snapshotBulletCount = 0;
        let threatBulletCount = 0;
        let nearestThreat = null;
        for (const bullet of bullets || []) {
          if (bullet?.native) nativeBulletCount += 1;
          if (bullet?.snapshot) snapshotBulletCount += 1;
          const projection = combatMetricNumber(bullet?.projection);
          const laneDistance = combatMetricNumber(bullet?.laneDistance);
          if (projection === null || projection <= 0 || laneDistance === null || laneDistance > laneLimit) continue;
          threatBulletCount += 1;
          const timeToImpactMs = combatMetricNumber(bullet?.timeToImpactMs);
          if (timeToImpactMs === null) continue;
          if (!nearestThreat || timeToImpactMs < nearestThreat.timeToImpactMs) {
            nearestThreat = {
              id: bullet.id ?? null,
              ownerId: bullet.ownerId ?? null,
              timeToImpactMs: Math.round(timeToImpactMs),
              laneDistance: Math.round(laneDistance),
              distance: combatMetricRound(bullet.distance)
            };
          }
        }
        return {
          bulletCount: arrayCount(bullets),
          nativeBulletCount,
          snapshotBulletCount,
          threatBulletCount,
          nearestThreat
        };
      }

      function combatMetricActionSummary(decision, rawSelf, incoming) {
        const combatState = decision?.combatState || {};
        const spacing = combatState.spacing || decision?.spacing || null;
        const pressureClose = combatState.pressureClose || null;
        const shooting = combatState.shooting || decision?.shooting || null;
        const movementSuppressed = combatState.movementSuppressed || decision?.movementSuppressed || null;
        return {
          kind: decision?.kind || '',
          reason: decision?.reason || '',
          dx: combatMetricRound(decision?.dx),
          dy: combatMetricRound(decision?.dy),
          shoot: Boolean(decision?.shoot),
          forceShoot: Boolean(decision?.forceShoot),
          shootEveryMs: combatMetricRound(decision?.shootEveryMs),
          spacingReason: spacing?.reason || '',
          spacingMerged: Boolean(spacing?.merged || spacing?.spacingMerged || combatState?.strafe?.spacingMerged),
          spacingOverrideBullet: Boolean(spacing?.overrideBullet),
          pressureCloseReason: pressureClose?.reason || '',
          shootingReason: shooting?.reason || '',
          shootingSuppressed: Boolean(shooting?.suppressed),
          shootingThrottled: Boolean(shooting?.throttled),
          stamina5s: combatMetricRound(shooting?.stamina5s ?? movementSuppressed?.stamina5s ?? rawSelf?.stamina_5s_remaining_milli),
          movementSuppressedReason: movementSuppressed?.reason || '',
          incomingBulletReason: decision?.incomingBullet?.reason || incoming?.reason || ''
        };
      }

      function combatLogFrameMetrics(rawSelf, selfSummary, decision, nearbyEntities, bullets, incoming, entryAt, perfNow) {
        const selfPoint = combatMetricPoint(selfSummary || rawSelf);
        const targetPoint = combatMetricPoint(combatMetricTarget(decision, nearbyEntities), decision?.combatState?.targetHp);
        const previous = bot.lastCombatLogMetric && typeof bot.lastCombatLogMetric === 'object'
          ? bot.lastCombatLogMetric
          : null;
        const frameDtMs = previous?.at ? Math.max(0, Math.round(entryAt - Number(previous.at || entryAt))) : null;
        const sameTarget = Boolean(previous?.target?.id !== null
          && previous?.target?.id !== undefined
          && targetPoint?.id !== null
          && targetPoint?.id !== undefined
          && String(previous.target.id) === String(targetPoint.id));
        const selfHpDelta = combatMetricDelta(selfPoint?.hp, previous?.self?.hp);
        const targetHpDelta = sameTarget ? combatMetricDelta(targetPoint?.hp, previous?.target?.hp) : null;
        const distanceDelta = sameTarget ? combatMetricDelta(targetPoint?.distance, previous?.target?.distance) : null;
        const shot = bot.lastCombatShot && typeof bot.lastCombatShot === 'object' ? bot.lastCombatShot : null;
        const shotAt = Number(shot?.at || 0);
        const previousAt = Number(previous?.at || 0);
        const shotSincePreviousFrame = Boolean(shotAt && shotAt <= entryAt && (!previousAt || shotAt > previousAt));
        const combatTarget = bot.combatTarget || null;
        const targetDamageAt = combatTarget
          && targetPoint?.id !== null
          && targetPoint?.id !== undefined
          && String(combatTarget.id ?? '') === String(targetPoint.id)
          ? Number(combatTarget.lastDamageAt || 0)
          : 0;
        const serverPositionStall = summarizeServerPositionStall();
        const metrics = {
          frameDtMs,
          selfHpDelta,
          selfDamageTaken: selfHpDelta !== null && selfHpDelta < 0 ? Math.round(Math.abs(selfHpDelta) * 100) / 100 : 0,
          targetHpDelta,
          targetDamageTaken: targetHpDelta !== null && targetHpDelta < 0 ? Math.round(Math.abs(targetHpDelta) * 100) / 100 : 0,
          distanceDelta,
          selfMoveCm: combatMetricDistance(selfPoint, previous?.self),
          targetMoveCm: sameTarget ? combatMetricDistance(targetPoint, previous?.target) : null,
          action: combatMetricActionSummary(decision || {}, rawSelf || selfSummary || null, incoming),
          shots: shot ? {
            lastShotAgeMs: shotAt ? Math.max(0, Math.round(entryAt - shotAt)) : null,
            shotSincePreviousFrame,
            sent: Boolean(shot.sent),
            blockedByCadence: Boolean(shot.blockedByCadence),
            cadenceRemainingMs: combatMetricRound(shot.cadenceRemainingMs),
            shootEveryMs: combatMetricRound(shot.shootEveryMs),
            force: Boolean(shot.force),
            targetId: shot.target?.id ?? null,
            targetName: shot.target?.name || ''
          } : null,
          damage: {
            lastTargetDamageAgeMs: targetDamageAt ? Math.max(0, Math.round(entryAt - targetDamageAt)) : null,
            lastTargetDamageAmount: combatTarget
              && targetPoint?.id !== null
              && targetPoint?.id !== undefined
              && String(combatTarget.id ?? '') === String(targetPoint.id)
              ? combatMetricRound(combatTarget.lastDamageAmount)
              : null,
            noTargetDamageMs: combatTarget
              && targetPoint?.id !== null
              && targetPoint?.id !== undefined
              && String(combatTarget.id ?? '') === String(targetPoint.id)
              ? combatMetricRound(combatTarget.noDamageMs)
              : null
          },
          bullets: combatMetricBulletStats(bullets),
          incomingBullet: incoming ? {
            id: incoming.id ?? null,
            ownerId: incoming.ownerId ?? null,
            distance: combatMetricRound(incoming.distance),
            laneDistance: combatMetricRound(incoming.laneDistance),
            timeToImpactMs: combatMetricRound(incoming.timeToImpactMs),
            reason: incoming.reason || ''
          } : null,
          serverPositionStall: serverPositionStall ? {
            active: Boolean(serverPositionStall.active),
            stalled: Boolean(serverPositionStall.stalled),
            reason: serverPositionStall.reason || '',
            holdRemainingMs: combatMetricRound(serverPositionStall.holdRemainingMs),
            movingMs: combatMetricRound(serverPositionStall.movingMs),
            clientMoved: combatMetricRound(serverPositionStall.clientMoved),
            serverMoved: combatMetricRound(serverPositionStall.serverMoved),
            gap: combatMetricRound(serverPositionStall.gap),
            gapDelta: combatMetricRound(serverPositionStall.gapDelta),
            snapshotAgeMs: combatMetricRound(serverPositionStall.snapshotAgeMs)
          } : null
        };
        bot.lastCombatLogMetric = {
          at: entryAt,
          perfNow,
          combatId: bot.combatLogging?.combatId || '',
          source: decision?.source || '',
          reason: decision?.reason || '',
          self: selfPoint,
          target: targetPoint
        };
        return metrics;
      }

      function combatLogGlobalStateSummary() {
        return {
          refreshedAt: bot.globalState.refreshedAt || 0,
          snapshotRefreshedAt: bot.globalState.snapshotRefreshedAt || 0,
          snapshotAgeMs: bot.globalState.snapshotRefreshedAt ? Math.max(0, Date.now() - Number(bot.globalState.snapshotRefreshedAt || 0)) : null,
          tick: bot.globalState.tick,
          entities: arrayCount(bot.globalState.entities),
	          bullets: arrayCount(bot.globalState.bullets),
	          coinDrops: arrayCount(bot.globalState.coinDrops),
	          minimapPoints: bot.globalState.minimap?.points?.length || 0,
	          error: bot.globalState.error || '',
	          loginSnapshotGate: snapshotLoginGateStatus()
	        };
	      }

      function combatLogDecisionSummary(decision) {
        const cloned = safeJsonClone(decision || {});
        if (!cloned || typeof cloned !== 'object') return { reason: String(decision?.reason || '') };
        return cloned;
      }

      function combatLogEnemyExitSummary() {
        const detail = bot.lastEnemyLeaveResult || bot.lastCombatLeaveResult || bot.lastInjuryLeaveResult || bot.lastPursuitLeaveResult || null;
        if (!detail) return null;
        return {
          reason: detail.reason || '',
          summary: detail.summary || detail.exitSummary || detail.enemyLeaveSummary || '',
          displayReason: detail.displayReason || '',
          enemyActor: detail.enemyActor || null,
          target: detail.target || null,
          injury: detail.injury || null,
          pursuit: detail.pursuit || null,
          reloginUntil: detail.reloginUntil || 0,
          holdRemainingMs: detail.reloginUntil ? Math.max(0, Math.round(Number(detail.reloginUntil || 0) - Date.now())) : Number(detail.holdRemainingMs || 0),
          reloginDelayMs: detail.reloginDelayMs || 0,
          reloginRepeatCount: detail.reloginRepeatCount || detail.enemyLeaveStreak?.count || 0
        };
      }

      function combatLogLoginResultSummary(result) {
        if (!result || typeof result !== 'object') return null;
        return {
          at: result.at || 0,
          needed: Boolean(result.needed),
          attempted: Boolean(result.attempted),
          reason: result.reason || '',
          error: result.error || '',
          forced: Boolean(result.forced),
          method: result.method || '',
          cooldownRemainingMs: Number(result.cooldownRemainingMs || 0),
          suppressReason: result.suppressReason || '',
          ignoredSuppressMs: Number(result.ignoredSuppressMs || 0),
	          hasToken: Boolean(result.hasToken),
	          hasNativeSession: Boolean(result.hasNativeSession),
	          nativeWsReadyState: result.nativeWsReadyState ?? null,
	          loginRequired: Boolean(result.loginRequired),
	          currentUserId: result.currentUserId || null,
	          snapshotGate: result.snapshotGate || null
	        };
	      }

      function combatLogManualLoginSummary(result) {
        if (!result || typeof result !== 'object') return null;
        const cleared = result.cleared && typeof result.cleared === 'object' ? result.cleared : null;
        return {
          at: result.at || 0,
          reason: result.reason || '',
          cleared: cleared ? {
            reason: cleared.reason || '',
            suppressReason: cleared.suppressReason || '',
            suppressUntil: cleared.suppressUntil || 0,
            suppressRemainingMs: Number(cleared.suppressRemainingMs || 0),
            enemyHoldRemainingMs: Number(cleared.enemyHoldRemainingMs || 0),
            offlineHoldRemainingMs: Number(cleared.offlineHoldRemainingMs || 0)
          } : null,
          login: combatLogLoginResultSummary(result.login)
        };
      }

      function combatLogLoginSummary(decision) {
        let suppressUntil = 0;
        let suppressReason = '';
        try {
          suppressUntil = Number(localStorage.getItem(LOGIN_SUPPRESS_KEY) || 0) || 0;
          suppressReason = String(localStorage.getItem(LOGIN_SUPPRESS_REASON_KEY) || '');
        } catch (_) {}
        const t = Date.now();
        return {
          suppressUntil,
          suppressRemainingMs: Math.max(0, Math.round(suppressUntil - t)),
          suppressReason,
          enemyHoldUntil: Number(bot.pursuitReloginUntil || 0),
          enemyHoldRemainingMs: enemyReloginHoldRemainingMsForCombatLogBoundCore(bot, localStorage, { loginSuppressKey: LOGIN_SUPPRESS_KEY, loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY, readPersistentExitState, enemyLeaveStateKey: ENEMY_LEAVE_STATE_KEY, now: Date.now }),
	          offlineHoldUntil: Number(bot.offlineReloginUntil || 0),
	          offlineHoldRemainingMs: offlineReloginHoldRemainingMsForCombatLogBoundCore(bot, localStorage, { loginSuppressKey: LOGIN_SUPPRESS_KEY, loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY, readPersistentExitState, offlineLeaveStateKey: OFFLINE_LEAVE_STATE_KEY, staleOfflineStaminaHoldContradicted, clearOfflineReloginHold: reason => clearOfflineReloginHoldForCombatLogBoundCore(bot, localStorage, reason, { now: Date.now, writePersistentPendingExitState: pending => writePersistentPendingExitStateCore(localStorage, PENDING_EXIT_STATE_KEY, pending || bot.pendingExit, Date.now(), pendingExitPersistenceCoreHelpers()), clearPersistentPendingExitState, clearPersistentExitState, loginSuppressKey: LOGIN_SUPPRESS_KEY, loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY, offlineLeaveStateKey: OFFLINE_LEAVE_STATE_KEY }), now: Date.now }),
	          snapshotGate: snapshotLoginGateStatus(),
	          lastLoginAt: Number(bot.lastLoginAt || 0),
          lastLogin: combatLogLoginResultSummary(bot.lastLoginResult),
          decisionLogin: combatLogLoginResultSummary(decision?.login),
          manualLogin: combatLogManualLoginSummary(decision?.manualLogin || bot.lastManualLoginResult)
        };
      }

      function combatLogRuntimeSummary(entryAt = Date.now(), decision = null) {
        const t = Number.isFinite(Number(entryAt)) ? Number(entryAt) : Date.now();
        const diagnostics = bot.runtimeDiagnostics && typeof bot.runtimeDiagnostics === 'object'
          ? bot.runtimeDiagnostics
          : {};
        const thresholdMs = Math.max(1000, Number(cfg.combatTickGapOfflineMs || 0) || 0);
        const tickGapMs = Number.isFinite(Number(bot.lastTickGapMs))
          ? Math.max(0, Math.round(Number(bot.lastTickGapMs)))
          : null;
        const tickInProgressMs = bot.ticking && bot.lastTickAt
          ? Math.max(0, Math.round(t - Number(bot.lastTickAt || t)))
          : null;
        const lastTickCompletedGapMs = bot.lastTickCompletedAt
          ? Math.max(0, Math.round(t - Number(bot.lastTickCompletedAt || t)))
          : null;
        const combatLogActive = Boolean(bot.combatLogging?.active);
        const queuedCombatFrameAt = Number(bot.combatLogging?.lastQueuedFrameAt || 0) || 0;
        const metricCombatFrameAt = Number(bot.lastCombatLogMetric?.at || 0) || 0;
        const lastCombatFrameAt = queuedCombatFrameAt || (combatLogActive ? metricCombatFrameAt : 0);
        const combatFrameGapMs = lastCombatFrameAt ? Math.max(0, Math.round(t - lastCombatFrameAt)) : null;
        const lastBuiltFrameAt = Number(bot.combatLogging?.lastBuiltFrameAt || 0) || 0;
        const builtFrameGapMs = lastBuiltFrameAt ? Math.max(0, Math.round(t - lastBuiltFrameAt)) : null;
        const lastCombatAt = Number(bot.combatLogging?.lastCombatAt || 0) || 0;
        const combatTriggerGapMs = lastCombatAt ? Math.max(0, Math.round(t - lastCombatAt)) : null;
        const recordedCombatTickGap = bot.lastCombatTickGap || decision?.combatTickGap || decision?.offlineSafety?.combatTickGap || null;
        const recordedDiagnosis = recordedCombatTickGap?.diagnosis || '';
        const decisionCombatActive = combatTickActiveFromState({
          decision,
          combatTarget: bot.combatTarget,
          pendingExit: bot.pendingExit || bot.pendingCombatLeave,
          nowMs: t
        });
        const previousCombatActive = Boolean(bot.previousTickCombatActive);
        const currentCombatActive = Boolean(bot.lastTickCombatActive || decisionCombatActive);
        const recentCombatContextMs = Math.max(
          thresholdMs,
          Number(cfg.combatEngageStickMs || 0),
          Number(cfg.combatEngageGraceMs || 0),
          Number(cfg.combatLogPostBufferMs || 0)
        );
        const recentCombatFrameContext = Boolean(lastCombatFrameAt
          && recentCombatContextMs > 0
          && t - lastCombatFrameAt <= recentCombatContextMs);
        const activeCombatContext = previousCombatActive || currentCombatActive || combatLogActive || recentCombatFrameContext || Boolean(recordedCombatTickGap);
        const liveCombatContext = previousCombatActive || currentCombatActive || combatLogActive;
        const reentryGapOverThreshold = Boolean(activeCombatContext
          && (recordedDiagnosis === 'tick-reentry-gap' || decision?.tickReentry)
          && thresholdMs > 0
          && ((tickInProgressMs !== null && tickInProgressMs >= thresholdMs)
            || (lastTickCompletedGapMs !== null && lastTickCompletedGapMs >= thresholdMs)));
        const tickGapOverThreshold = Boolean(activeCombatContext && tickGapMs !== null && thresholdMs > 0 && tickGapMs >= thresholdMs);
        const combatFrameGapOverThreshold = Boolean(liveCombatContext && combatFrameGapMs !== null && thresholdMs > 0 && combatFrameGapMs >= thresholdMs);
        const diagnosis = recordedDiagnosis || (reentryGapOverThreshold
          ? 'tick-reentry-gap'
          : (tickGapOverThreshold
            ? 'main-loop-gap'
            : (combatFrameGapOverThreshold ? 'combat-log-gap-with-active-tick' : 'normal')));
        const lastRefresh = diagnostics.lastRefresh && typeof diagnostics.lastRefresh === 'object'
          ? diagnostics.lastRefresh
          : null;
        const lastRefreshSummary = lastRefresh ? {
          startedAt: Number(lastRefresh.startedAt || 0) || 0,
          completedAt: Number(lastRefresh.completedAt || 0) || 0,
          ageMs: lastRefresh.completedAt ? Math.max(0, Math.round(t - Number(lastRefresh.completedAt || t))) : null,
          durationMs: Number.isFinite(Number(lastRefresh.durationMs)) ? Math.max(0, Math.round(Number(lastRefresh.durationMs))) : null,
          force: Boolean(lastRefresh.force),
          error: lastRefresh.error || '',
          snapshot: lastRefresh.snapshot ? {
            ok: Boolean(lastRefresh.snapshot.ok),
            durationMs: Number.isFinite(Number(lastRefresh.snapshot.durationMs)) ? Math.max(0, Math.round(Number(lastRefresh.snapshot.durationMs))) : null,
            error: lastRefresh.snapshot.error || ''
          } : null,
          minimap: lastRefresh.minimap ? {
            ok: Boolean(lastRefresh.minimap.ok),
            durationMs: Number.isFinite(Number(lastRefresh.minimap.durationMs)) ? Math.max(0, Math.round(Number(lastRefresh.minimap.durationMs))) : null,
            error: lastRefresh.minimap.error || ''
          } : null
        } : null;
        return {
          thresholdMs,
          tickGapMs,
          lastTickDurationMs: Number.isFinite(Number(diagnostics.lastTickDurationMs)) ? Math.max(0, Math.round(Number(diagnostics.lastTickDurationMs))) : null,
          lastTickStartedAt: Number(diagnostics.lastTickStartedAt || 0) || 0,
          lastTickDurationSource: diagnostics.lastTickSource || '',
          tickInProgressMs,
          lastTickCompletedGapMs,
          reentryGapOverThreshold,
          tickGapOverThreshold,
          previousTickAt: Number(bot.previousTickAt || 0) || 0,
          currentTickAt: Number(bot.lastTickAt || 0) || 0,
          lastTickCompletedAt: Number(bot.lastTickCompletedAt || 0) || 0,
          previousTickSource: bot.previousTickSource || '',
          currentTickSource: bot.lastTickSource || '',
          previousCombatActive,
          currentCombatActive,
          decisionCombatActive,
          combatLogActive,
          liveCombatContext,
          recentCombatFrameContext,
          recentCombatContextMs,
          activeCombatContext,
          queuedCombatFrameAt,
          metricCombatFrameAt,
          lastCombatFrameAt,
          combatFrameGapMs,
          combatFrameGapOverThreshold,
          lastBuiltFrameAt,
          builtFrameGapMs,
          lastCombatAt,
          combatTriggerGapMs,
          diagnosis,
          likelyCause: recordedCombatTickGap?.likelyCause || (diagnosis === 'tick-reentry-gap'
            ? 'main-loop-stuck-or-awaiting-async'
            : diagnosis === 'main-loop-gap'
            ? 'js-or-main-loop-paused'
            : (diagnosis === 'combat-log-gap-with-active-tick' ? 'combat-state-or-log-gating-gap' : '')),
          lastRefresh: lastRefreshSummary,
          networkQuality: typeof summarizeNetworkQuality === 'function' ? summarizeNetworkQuality(t) : null,
          lastCombatLogBuildMs: Number.isFinite(Number(diagnostics.lastCombatLogBuildMs)) ? Math.max(0, Math.round(Number(diagnostics.lastCombatLogBuildMs))) : null,
          lastCombatLogBuildAt: Number(diagnostics.lastCombatLogBuildAt || 0) || 0,
          lastCombatLogRecordMs: Number.isFinite(Number(diagnostics.lastCombatLogRecordMs)) ? Math.max(0, Math.round(Number(diagnostics.lastCombatLogRecordMs))) : null,
          lastCombatLogRecordAt: Number(diagnostics.lastCombatLogRecordAt || 0) || 0,
          combatTickGap: recordedCombatTickGap
        };
      }

      function buildTimedCombatLogEntry(source, decision) {
        const buildStartedAt = Date.now();
        const buildStartedPerf = now();
        try {
          return buildCombatLogEntry(source, decision);
        } finally {
          recordRuntimeDiagnosticsCore(bot, {
            lastCombatLogBuildAt: Date.now(),
            lastCombatLogBuildStartedAt: buildStartedAt,
            lastCombatLogBuildMs: Math.max(0, Math.round(now() - buildStartedPerf))
          });
        }
      }

      function combatLogExitSummary(decision) {
        return combatLogExitSummaryFromDecision(decision);
      }

      function buildCombatLogEntry(source, decision) {
        const entryAt = Date.now();
        const perfNow = Math.round(now());
        let currentSelf = null;
        try {
          currentSelf = getSelf();
        } catch (_) {
          currentSelf = null;
        }
        const rawSelf = currentSelf || decision?.self || bot.lastSelf || null;
        const self = combatLogSelfSummary(rawSelf);
        const nearbyEntities = summarizeCombatEntities(rawSelf || self, decision);
        const bullets = summarizeCombatBullets(rawSelf || self);
        let incoming = null;
        try {
          incoming = rawSelf ? incomingBulletThreat(rawSelf, null, getBullets()) : null;
        } catch (_) {
          incoming = null;
        }
        const exit = combatLogExitSummary(decision || {});
        const login = combatLogLoginSummary(decision || {});
        const runtime = combatLogRuntimeSummary(entryAt, decision || {});
        bot.combatLogging.lastBuiltFrameAt = entryAt;
        const combatMetrics = combatLogFrameMetrics(rawSelf, self, decision || {}, nearbyEntities, bullets, incoming, entryAt, perfNow);
        return {
          type: 'combat-frame',
          at: entryAt,
          perfNow,
          tickCount: bot.tickCount,
          source,
          version: cfg.version,
          sourceHash: cfg.sourceHash,
          injectedBy: cfg.injectedBy,
          url: location.href,
          visibilityState: document.visibilityState || '',
          self,
          decision: combatLogDecisionSummary(decision),
          target: decision?.target || null,
          combatState: decision?.combatState || null,
          aimTarget: decision?.aimTarget || null,
          incomingBullet: decision?.incomingBullet || (incoming ? {
            id: incoming.id,
            ownerId: incoming.ownerId,
            distance: Math.round(Number(incoming.distance || 0)),
            laneDistance: Math.round(Number(incoming.laneDistance || 0)),
            signedLaneDistance: Number.isFinite(Number(incoming.signedLaneDistance)) ? Math.round(Number(incoming.signedLaneDistance)) : null,
            timeToImpactMs: Number.isFinite(Number(incoming.timeToImpactMs)) ? Math.round(Number(incoming.timeToImpactMs)) : null,
            reason: incoming.reason || 'incoming-bullet'
          } : null),
          injury: decision?.injury || bot.pendingInjuryLeave || null,
          pendingCombatLeave: summarizePendingCombatLeave(),
          pursuit: decision?.pursuit || summarizePursuit(bot.pursuit),
          safety: bot.lastSafety || null,
          combatTarget: bot.combatTarget || null,
          combatAim: bot.combatAim || null,
          control: summarizeControl(),
          runtime,
          coinDiagnostics: decision?.coinDiagnostics || bot.coinDiagnostics || null,
          globalState: combatLogGlobalStateSummary(),
          exit,
          login,
          enemyExit: combatLogEnemyExitSummary(),
          combatMetrics,
          nearbyEntities,
          bullets
        };
      }

	      function combatLogTriggerReason(entry, decision) {
	        const reason = String(decision?.reason || '');
	        const target = decision?.target || entry?.target || null;
	        const afkTarget = combatLogIsAfkAttack(entry, decision);
	        if (decision?.combat && !afkTarget) return 'decision-combat';
	        if (/^combat-/.test(reason) && !afkTarget) return 'combat-reason';
	        if (decision?.pendingCombatLeave || entry.pendingCombatLeave) return 'pending-combat-leave';
	        if (decision?.injury || entry.injury) return 'injury';
	        if (entry.incomingBullet) return 'incoming-bullet';
	        if (/injury|pursuit-leave|incoming-bullet/.test(reason)) return reason || 'self-threat-reason';
	        return '';
	      }

	      function combatLogIsAfkAttack(entry, decision = entry?.decision || {}) {
	        const reason = String(decision?.reason || entry?.decision?.reason || '').toLowerCase();
	        const target = decision?.target || entry?.target || entry?.decision?.target || null;
	        const shot = decision?.opportunisticShot || entry?.decision?.opportunisticShot || null;
	        return Boolean(target?.afk)
	          || Boolean(shot)
	          || /afk/.test(reason)
	          || /挂机/.test(reason);
	      }

      function combatLogSuspendReason(decision) {
        const reason = String(decision?.reason || '');
        if (!reason) return '';
	        if (/^(paused|cloudflare-error-refresh|no-self|not-alive|auto-login|manual-login|login-suppressed|login-cooldown|login-snapshot-gate|login-control-missing|session-mismatch-refresh|session-mismatch-recovery|snapshot-no-self-exit-confirmed|game-session-connecting|exit-log-flush-pending|important-log-flush-pending)$/.test(reason)) return reason;
	        if (/^(enemy-leave-wait|pursuit-leave-wait|offline-leave-wait)$/.test(reason)) return reason;
		        if (/^(offline-leave|control-ws-offline|control-ws-offline-unsafe|control-ws-offline-safe-wait|control-ws-reconnect-churn|control-ws-no-self-game-session|control-ws-server-position-stalled|control-global-sampling-outage|control-combat-tick-gap|control-action-settlement-stalled|control-stamina-exhausted|stamina-exhausted-leave)$/.test(reason)) return reason;
        return '';
      }

  return {
    combatLogSelfSummary,
    combatEntitySummary,
    mergeCombatEntitySource,
    combatEntitySourceList,
    summarizeCombatEntities,
    combatBulletSummary,
    summarizeCombatBullets,
    combatMetricNumber,
    combatMetricRound,
    combatMetricDelta,
    combatMetricEntityId,
    combatMetricHp,
    combatMetricPoint,
    combatMetricDistance,
    combatMetricTarget,
    combatMetricBulletStats,
    combatMetricActionSummary,
    combatLogFrameMetrics,
    combatLogGlobalStateSummary,
    combatLogDecisionSummary,
    combatLogEnemyExitSummary,
    combatLogLoginResultSummary,
    combatLogManualLoginSummary,
    combatLogLoginSummary,
    combatLogRuntimeSummary,
    buildTimedCombatLogEntry,
    combatLogExitSummary,
    buildCombatLogEntry,
    combatLogTriggerReason,
    combatLogIsAfkAttack,
    combatLogSuspendReason
  };
}

module.exports = {
  createCombatLogFrameRuntime
};
